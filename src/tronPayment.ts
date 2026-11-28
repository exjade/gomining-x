import {
  PaymentDestinationError,
  getPaymentNetworkConfig,
  getTronRpcUrlsForMode,
  isValidTronAddress,
  parsePositiveAtomicBigInt,
  requireTreasuryAddress,
  tronBase58ToHex41,
  type PaymentEnv,
  type PaymentNetworkMode,
} from './paymentDestinations.ts'

export const TRON_TRC20_FEE_LIMIT_SUN = 100_000_000
export const TRON_TX_HASH_PATTERN = /^[a-fA-F0-9]{64}$/
const DEFAULT_TRON_RPC_TIMEOUT_MS = 8000
const MAX_UINT256 = (1n << 256n) - 1n

export interface TronUnsignedTransaction {
  txID: string
  raw_data?: Record<string, unknown>
  raw_data_hex?: string
  [key: string]: unknown
}

export const DEFAULT_TRON_WC_METHODS = ['tron_signTransaction', 'tron_signMessage'] as const

export interface TronAppKitProvider {
  session?: {
    topic?: string
    namespaces?: {
      tron?: {
        accounts?: string[]
        chains?: string[]
        methods?: string[]
      }
    }
  }
  namespaces?: Record<
    string,
    { chains?: string[]; methods?: string[]; events?: string[] } | undefined
  >
  rpcProviders?: Record<
    string,
    { namespace?: { accounts?: string[]; chains?: string[]; methods?: string[] } } | undefined
  >
  client?: {
    request?: (args: {
      topic: string
      chainId: string
      request: { method: string; params: Record<string, unknown> }
    }) => Promise<unknown>
  }
  request?: (
    args: { method: string; params: Record<string, unknown> | unknown[] },
    chainId?: string,
  ) => Promise<unknown>
  signTransaction?: (transaction: TronUnsignedTransaction) => Promise<unknown>
}

export function ensureTronProviderMethodsHydrated(provider: TronAppKitProvider | null | undefined): void {
  if (!provider) return
  const sessionMethods = provider.session?.namespaces?.tron?.methods
  const resolvedMethods =
    Array.isArray(sessionMethods) && sessionMethods.length > 0
      ? [...sessionMethods]
      : [...DEFAULT_TRON_WC_METHODS]

  const tronNamespace = provider.rpcProviders?.tron?.namespace
  if (tronNamespace && (!Array.isArray(tronNamespace.methods) || tronNamespace.methods.length === 0)) {
    tronNamespace.methods = [...resolvedMethods]
  }

  // UniversalProvider.validateChain throws if this.namespaces is non-empty (e.g. eip155) and lacks tron.
  if (
    provider.namespaces &&
    Object.keys(provider.namespaces).length > 0 &&
    !Object.keys(provider.namespaces).some((k) => k === 'tron' || k.startsWith('tron:'))
  ) {
    provider.namespaces.tron = {
      chains: provider.session?.namespaces?.tron?.chains ?? ['tron:0x2b6653dc', 'tron:0xcd8690dc'],
      methods: [...resolvedMethods],
      events: [],
    }
  }
}

export function encodeTrc20TransferParameter(recipientBase58: string, amountAtomic: string | bigint): string {
  const recipientHex41 = tronBase58ToHex41(recipientBase58)
  const amount = parsePositiveAtomicBigInt(amountAtomic)
  if (amount > MAX_UINT256) {
    throw new PaymentDestinationError('AMOUNT_OVERFLOW', 'TRC-20 transfer amount exceeds uint256.')
  }
  const addressPadded = recipientHex41.slice(2).padStart(64, '0')
  const amountPadded = amount.toString(16).padStart(64, '0')
  return `${addressPadded}${amountPadded}`
}

function resolveTronRpcBases(networkMode?: PaymentNetworkMode, env?: PaymentEnv): string[] {
  const urls = getTronRpcUrlsForMode(networkMode, env)
    .map((u) => u.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  if (urls.length === 0) {
    throw new PaymentDestinationError('TRON_RPC_NOT_CONFIGURED', 'Missing TRON RPC endpoint.')
  }
  return urls
}

async function postTronJson<T>(
  rpcBases: string[],
  endpointPath: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
  errorCode: string,
): Promise<T> {
  let lastError: Error | null = null
  for (const base of rpcBases) {
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      ...(typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? { signal: AbortSignal.timeout(DEFAULT_TRON_RPC_TIMEOUT_MS) }
        : {}),
    }
    try {
      const res = await fetchImpl(`${base}${endpointPath}`, init)
      if (!res.ok) {
        lastError = new PaymentDestinationError(errorCode, `TRON ${endpointPath} failed with HTTP ${res.status}`)
        if (res.status >= 500 || res.status === 429) continue
        throw lastError
      }
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof PaymentDestinationError) {
        lastError = err
        if (!/HTTP (?:5\d\d|429)\b/.test(err.message)) throw err
        continue
      }
      lastError = new PaymentDestinationError(errorCode, `TRON ${endpointPath} request failed.`)
    }
  }
  throw lastError ?? new PaymentDestinationError(errorCode, `TRON ${endpointPath} failed.`)
}

function decodeHexErrorMessage(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return ''
  const trimmed = raw.trim()
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    let text = ''
    for (let i = 0; i < trimmed.length; i += 2) {
      const code = Number.parseInt(trimmed.slice(i, i + 2), 16)
      if (code >= 32 && code <= 126) text += String.fromCharCode(code)
    }
    if (text.trim()) return text.trim()
  }
  return trimmed
}

export interface BuildTronPaymentTransactionInput {
  senderAddress: string
  recipientAddress: string
  asset: 'USDT' | 'TRX'
  expectedAmountAtomic: string | bigint
  tokenContractAddress?: string | null
  networkMode?: PaymentNetworkMode
  env?: PaymentEnv
  fetchImpl?: typeof fetch
}

export async function buildTronPaymentTransaction(
  input: BuildTronPaymentTransactionInput,
): Promise<TronUnsignedTransaction> {
  const {
    senderAddress,
    recipientAddress,
    asset,
    expectedAmountAtomic,
    tokenContractAddress,
    networkMode,
    env,
    fetchImpl = globalThis.fetch,
  } = input

  if (!isValidTronAddress(senderAddress)) {
    throw new PaymentDestinationError('INVALID_TRON_SENDER', 'Invalid TRON sender wallet address.')
  }
  const treasury = requireTreasuryAddress(recipientAddress, 'tron')
  const amountAtomic = parsePositiveAtomicBigInt(expectedAmountAtomic)
  if (asset !== 'USDT' && asset !== 'TRX') {
    throw new PaymentDestinationError('UNSUPPORTED_TRON_ASSET', `Unsupported TRON asset: ${String(asset)}`)
  }
  if (typeof fetchImpl !== 'function') {
    throw new PaymentDestinationError('TRON_RPC_UNAVAILABLE', 'No fetch implementation available for TRON API.')
  }

  const rpcBases = resolveTronRpcBases(networkMode, env)
  const senderHex41 = tronBase58ToHex41(senderAddress)
  const recipientHex41 = tronBase58ToHex41(treasury)

  if (asset === 'USDT') {
    const resolvedContract =
      tokenContractAddress?.trim() || getPaymentNetworkConfig('tron', networkMode, env).usdtContractAddress
    if (!resolvedContract) {
      throw new PaymentDestinationError(
        'TRON_USDT_CONTRACT_NOT_CONFIGURED',
        'TRON USDT TRC-20 contract address is not configured for this network mode.',
      )
    }
    if (!isValidTronAddress(resolvedContract)) {
      throw new PaymentDestinationError('INVALID_TRON_USDT_CONTRACT', 'Invalid TRON USDT TRC-20 contract address.')
    }
    const contractHex41 = tronBase58ToHex41(resolvedContract)
    const parameter = encodeTrc20TransferParameter(treasury, amountAtomic)

    const payload = await postTronJson<{
      result?: { result?: boolean; message?: string }
      transaction?: TronUnsignedTransaction
    }>(
      rpcBases,
      '/wallet/triggersmartcontract',
      {
        owner_address: senderHex41,
        contract_address: contractHex41,
        function_selector: 'transfer(address,uint256)',
        parameter,
        fee_limit: TRON_TRC20_FEE_LIMIT_SUN,
        call_value: 0,
        visible: false,
      },
      fetchImpl,
      'TRON_RPC_ERROR',
    )
    if (!payload?.result?.result || !payload.transaction?.txID || !TRON_TX_HASH_PATTERN.test(payload.transaction.txID)) {
      const detail = decodeHexErrorMessage(payload?.result?.message)
      throw new PaymentDestinationError(
        'TRON_TX_BUILD_FAILED',
        detail || 'Could not construct TRON TRC-20 transfer transaction.',
      )
    }
    return payload.transaction
  }

  if (amountAtomic > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PaymentDestinationError('AMOUNT_OVERFLOW', 'TRX amount exceeds safe integer sun range.')
  }
  const payload = await postTronJson<TronUnsignedTransaction & { Error?: string }>(
    rpcBases,
    '/wallet/createtransaction',
    {
      owner_address: senderHex41,
      to_address: recipientHex41,
      amount: Number(amountAtomic),
      visible: false,
    },
    fetchImpl,
    'TRON_RPC_ERROR',
  )
  if (payload?.Error || !payload?.txID || !TRON_TX_HASH_PATTERN.test(payload.txID)) {
    throw new PaymentDestinationError(
      'TRON_TX_BUILD_FAILED',
      payload?.Error || 'Could not construct native TRX transfer transaction.',
    )
  }
  return payload
}

export interface SubmitTronTransactionInput {
  provider: TronAppKitProvider
  transaction: TronUnsignedTransaction
  senderAddress: string
  networkMode?: PaymentNetworkMode
  env?: PaymentEnv
  fetchImpl?: typeof fetch
}

export async function submitTronTransactionViaProvider(input: SubmitTronTransactionInput): Promise<string> {
  const {
    provider,
    transaction,
    senderAddress,
    networkMode,
    env,
    fetchImpl = globalThis.fetch,
  } = input

  const caipNetworkId = networkMode === 'mainnet' ? 'tron:0x2b6653dc' : 'tron:0xcd8690dc'
  let signedResponse: unknown

  ensureTronProviderMethodsHydrated(provider)

  const tronRpcMethods = provider.rpcProviders?.tron?.namespace?.methods
  const hasIncompleteTronRpcProvider =
    !provider.rpcProviders?.tron ||
    !Array.isArray(tronRpcMethods) ||
    tronRpcMethods.length === 0

  if (
    provider.session?.topic &&
    typeof provider.client?.request === 'function' &&
    hasIncompleteTronRpcProvider
  ) {
    // Re-throw any rejection (including 4001/5000) immediately without retrying via fallback methods.
    signedResponse = await provider.client.request({
      topic: provider.session.topic,
      chainId: caipNetworkId,
      request: {
        method: 'tron_signTransaction',
        params: {
          address: senderAddress,
          transaction,
        },
      },
    })
  } else if (typeof provider.request === 'function') {
    // Re-throw any rejection (including 4001/5000) immediately without retrying via fallback methods.
    signedResponse = await provider.request(
      {
        method: 'tron_signTransaction',
        params: {
          address: senderAddress,
          transaction,
        },
      },
      caipNetworkId,
    )
  } else if (typeof provider.signTransaction === 'function') {
    signedResponse = await provider.signTransaction(transaction)
  } else {
    throw new Error('La billetera TRON conectada no soporta firma directa en el selector de billetera.')
  }

  if (typeof signedResponse === 'string' && TRON_TX_HASH_PATTERN.test(signedResponse.trim())) {
    return signedResponse.trim().toLowerCase()
  }

  const responseObj = signedResponse && typeof signedResponse === 'object'
    ? (signedResponse as { result?: unknown; transaction?: unknown; signedTransaction?: unknown; txid?: unknown; txID?: unknown })
    : null

  // Some mobile wallets broadcast directly and return { result: true, txid }.
  if (
    responseObj?.result === true &&
    typeof (responseObj.txid ?? responseObj.txID) === 'string' &&
    TRON_TX_HASH_PATTERN.test(String(responseObj.txid ?? responseObj.txID).trim())
  ) {
    return String(responseObj.txid ?? responseObj.txID).trim().toLowerCase()
  }

  const signedTx =
    (responseObj?.result && typeof responseObj.result === 'object'
      ? responseObj.result
      : responseObj?.signedTransaction && typeof responseObj.signedTransaction === 'object'
        ? responseObj.signedTransaction
        : responseObj?.transaction && typeof responseObj.transaction === 'object'
          ? responseObj.transaction
          : responseObj) as (TronUnsignedTransaction & { signature?: unknown; txid?: unknown }) | null

  const hasSignature = Boolean(
    signedTx && (
      (Array.isArray(signedTx.signature) && signedTx.signature.length > 0) ||
      (typeof signedTx.signature === 'string' && signedTx.signature.trim().length > 0)
    ),
  )
  if (!signedTx || !hasSignature) {
    throw new PaymentDestinationError('TRON_SIGN_FAILED', 'TRON wallet did not return a signed transaction.')
  }

  if (typeof fetchImpl !== 'function') {
    throw new PaymentDestinationError('TRON_RPC_UNAVAILABLE', 'No fetch implementation available for TRON broadcast.')
  }
  const rpcBases = resolveTronRpcBases(networkMode, env)
  const broadcastPayload = await postTronJson<{
    result?: boolean
    txid?: string
    code?: string
    message?: string
  }>(rpcBases, '/wallet/broadcasttransaction', signedTx, fetchImpl, 'TRON_BROADCAST_ERROR')
  if (!broadcastPayload?.result) {
    const detail = decodeHexErrorMessage(broadcastPayload?.message) || broadcastPayload?.code || 'Broadcast rejected'
    throw new PaymentDestinationError('TRON_BROADCAST_FAILED', `TRON broadcast failed: ${detail}`)
  }

  const rawTxHash = broadcastPayload.txid || signedTx.txID || transaction.txID
  if (typeof rawTxHash !== 'string' || !TRON_TX_HASH_PATTERN.test(rawTxHash.trim())) {
    throw new PaymentDestinationError('TRON_INVALID_TX_HASH', 'TRON broadcast did not return a valid 64-hex txid.')
  }
  return rawTxHash.trim().toLowerCase()
}
