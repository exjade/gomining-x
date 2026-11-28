import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount, useSendTransaction, useSwitchChain, useWriteContract } from 'wagmi'
import { useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider } from '@reown/appkit/react'
import {
  buildExplorerTxUrl,
  getPaymentDestinations,
  getPaymentNetworkConfig,
  isEthereumPaymentEnabled,
  parsePositiveAtomicBigInt,
  requireTreasuryAddress,
  toBackendPaymentNetworkId,
  toClientPaymentNetworkId,
  type PaymentNetworkId,
} from './paymentDestinations'
import { formatCatalogPrice, type PaymentAsset, type PaymentCurrency, type PaymentQuote } from './paymentQuote'
import { CryptoIcon, type CryptoSymbol } from './CryptoIcon'
import { QuoteDetailsSkeleton } from './Skeletons'
import { buildSolanaPaymentTransaction, getSolanaConnection } from './solanaPayment'
import {
  buildTronPaymentTransaction,
  submitTronTransactionViaProvider,
  type TronAppKitProvider,
} from './tronPayment'
import { useAuth } from './AuthContext'
import { isMinerProduct, parseMinerPowerTh, type PackageSnapshot, type PostTxPendingState } from './minerPurchaseFlow'
import type { WalletSession } from './walletSession'
import {
  cancelPaymentIntent,
  confirmPaymentIntent,
  createPaymentIntent,
  getPaymentIntent,
  selectPaymentMethod,
  type ConfirmPaymentIntentResult,
  type PaymentAssetSymbol,
  type PaymentIntentRecord,
  type PaymentProductType,
} from './services/payments/paymentGatewayClient'
import {
  POST_BROADCAST_AUTO_VERIFY_INTERVAL_MS,
  buildCheckoutProductSignature,
  canMutateIntentMethodInPlace,
  clearBroadcastTxLock,
  generateCheckoutIdempotencyKey,
  getAppKitNamespaceForFamily,
  getPaymentNetworkFamily,
  getWalletFamilyLabel,
  isWalletFamilyCompatibleWithNetwork,
  readBroadcastTxLock,
  resolveActiveMultichainWallet,
  resolveAutoAlignedNetworkOnWalletSwitch,
  resolveNetworkSelectionUseUsdt,
  resolvePendingMethodSyncKey,
  runDeduplicatedIntentInit,
  shouldAutoVerifyBroadcastIntent,
  shouldClearBroadcastTxLock,
  submitSolanaTransactionViaProvider,
  validateEvmSigningParity,
  validateSolanaClusterParity,
  validateTronClusterParity,
  validateTronSigningParity,
  writeBroadcastTxLock,
  type BroadcastTxLock,
  type PaymentWalletFamily,
} from './services/payments/checkoutIntentCoordinator'
import { appKitModal, appKitNetworks } from './appkitConfig'

export type { PostTxPendingState, PackageSnapshot }

export type PaymentReceipt = {
  id: string
  productName: string
  quote: PaymentQuote
  sender: string
  transactionHash: string
  sourceStatus: 'submitted'
  bridgeStatus: 'pending' | 'not-applicable'
  sentAt: number
  explorerUrl: string
  minerId?: string
}

export const networks: Array<{ id: PaymentNetworkId; label: string; chainId: number; icon: CryptoSymbol }> = [
  { id: 'bnb', label: 'BNB Chain · BSC', chainId: 56, icon: 'BNB' },
  { id: 'tron', label: 'Tron · TRC-20', chainId: 0, icon: 'TRX' },
  { id: 'polygon', label: 'Polygon · POL', chainId: 137, icon: 'POL' },
  { id: 'solana', label: 'Solana · SOL/USDT', chainId: 0, icon: 'SOL' },
  { id: 'arbitrum', label: 'Arbitrum · ARB', chainId: 42161, icon: 'ARB' },
  { id: 'optimism', label: 'Optimism · OP', chainId: 10, icon: 'OP' },
  { id: 'avalanche', label: 'Avalanche · AVAX', chainId: 43114, icon: 'AVAX' },
  { id: 'ethereum', label: 'Ethereum · ETH', chainId: 1, icon: 'ETH' },
]

export function networkForConnection(connection: { id?: string; protocol?: string; network?: string } | null): PaymentNetworkId {
  if (!connection) return 'bnb'
  if (connection.protocol === 'TRON') return 'tron'
  if (connection.protocol === 'Solana') return 'solana'
  const lowerNet = connection.network?.toLowerCase() ?? ''
  if (lowerNet.includes('tron')) return 'tron'
  if (lowerNet.includes('poly')) return 'polygon'
  if (lowerNet.includes('arb')) return 'arbitrum'
  if (lowerNet.includes('opt')) return 'optimism'
  if (lowerNet.includes('avax') || lowerNet.includes('avalanche')) return 'avalanche'
  if (lowerNet.includes('eth') && isEthereumPaymentEnabled()) return 'ethereum'
  return 'bnb'
}

const NATIVE_SYMBOL_BY_NETWORK: Record<PaymentNetworkId, PaymentAssetSymbol> = {
  bnb: 'BNB',
  tron: 'TRX',
  polygon: 'POL',
  solana: 'SOL',
  arbitrum: 'ETH',
  optimism: 'ETH',
  avalanche: 'AVAX',
  ethereum: 'ETH',
}

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

type SolanaAppKitProvider = {
  signAndSendTransaction?: (transaction: unknown) => Promise<string | { signature?: string }>
  sendTransaction?: (transaction: unknown, connection: unknown) => Promise<string>
  signTransaction?: (transaction: unknown) => Promise<{ serialize: () => Uint8Array }>
}

export function sanitizeErrorReason(raw: unknown): string {
  if (!raw) return ''
  let text = ''
  if (typeof raw === 'string') {
    text = raw
  } else if (raw instanceof Error) {
    text = raw.message
  } else if (typeof raw === 'object') {
    const obj = raw as { message?: unknown; reason?: unknown; reasonCode?: unknown; code?: unknown }
    const candidate = obj.message ?? obj.reason ?? obj.reasonCode ?? obj.code
    text = typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : ''
  } else {
    text = String(raw)
  }
  if (!text || text === '[object Object]') return ''
  return text
    .replace(/https?:\/\/[^\s'")]+/g, '[rpc-endpoint]')
    .replace(/0x[a-fA-F0-9]{10,}/g, '[hash/data]')
    .replace(/bearer\s+[a-z0-9._-]+/gi, '[token]')
    .replace(/(?:api[_-]?key|secret|token)=([a-zA-Z0-9_-]+)/gi, 'token=[masked]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function extractDetailsString(details: unknown): string {
  if (typeof details === 'string') return details
  return ''
}

function extractDetailsReasonCode(details: unknown): string {
  if (details && typeof details === 'object') {
    const code = (details as { reasonCode?: unknown }).reasonCode
    if (typeof code === 'string' && code.trim()) return code.trim()
  }
  return ''
}

export type ClassifiedPaymentError = {
  message: string
  kind: string
  name?: string
  code?: number | string
  shortMessage?: string
  category: string
}

export function classifyPaymentError(
  err: unknown,
  networkName: string,
): ClassifiedPaymentError {
  let rawReason = ''
  let reasonCode = ''
  let rootName = (err as { name?: string })?.name || ''
  let code = (err as { code?: number | string })?.code ?? (err as { cause?: { code?: number | string } })?.cause?.code
  let causeMessages = ''

  if (err && typeof err === 'object') {
    const baseErr = err as {
      shortMessage?: string
      details?: unknown
      message?: string
      cause?: unknown
      walk?: (fn?: (e: unknown) => boolean) => unknown
      data?: { message?: string }
    }
    reasonCode = extractDetailsReasonCode(baseErr.details)
    rawReason =
      baseErr.shortMessage ||
      extractDetailsString(baseErr.details) ||
      baseErr.data?.message ||
      baseErr.message ||
      reasonCode ||
      ''
    if (typeof baseErr.walk === 'function') {
      try {
        const root = baseErr.walk()
        if (root && root !== err) {
          const r = root as { name?: string; code?: number | string; details?: unknown; shortMessage?: string; data?: { message?: string }; message?: string }
          rootName = r.name || rootName
          code = r.code ?? code
          if (!reasonCode) reasonCode = extractDetailsReasonCode(r.details)
          if (!rawReason) rawReason = extractDetailsString(r.details) || r.shortMessage || r.data?.message || r.message || ''
        }
      } catch {
        // ignore walk errors
      }
    }
    let curr = baseErr.cause
    let depth = 0
    const seen = new Set<unknown>()
    while (curr && typeof curr === 'object' && depth < 10 && !seen.has(curr)) {
      seen.add(curr)
      const cObj = curr as {
        code?: number | string
        name?: string
        cause?: unknown
        message?: string
        shortMessage?: string
        details?: unknown
        data?: { message?: string }
      }
      if (code === undefined && cObj.code !== undefined) code = cObj.code
      if ((!rootName || rootName === 'Error') && cObj.name && cObj.name !== 'Error') {
        rootName = cObj.name
      }
      if (!reasonCode) reasonCode = extractDetailsReasonCode(cObj.details)
      if (!rawReason) {
        rawReason = cObj.shortMessage || extractDetailsString(cObj.details) || cObj.data?.message || cObj.message || ''
      }
      if (cObj.message) causeMessages += ' ' + cObj.message
      if (cObj.data?.message) causeMessages += ' ' + cObj.data.message
      curr = cObj.cause
      depth++
    }
  } else if (err instanceof Error) {
    rawReason = err.message
  } else {
    rawReason = String(err ?? '')
  }

  const codeStr = code !== undefined ? String(code) : ''
  const cleanReason = sanitizeErrorReason(rawReason)
  const safeName = rootName ? sanitizeErrorReason(rootName) : undefined
  const safeShortMessage = cleanReason || undefined
  const checkText = `${cleanReason} ${reasonCode} ${rootName} ${codeStr} ${(err as Error)?.message || ''}${causeMessages}`.toLowerCase()

  if (
    reasonCode === 'TOKEN_CONTRACT_NOT_CONFIGURED' ||
    reasonCode === 'SOLANA_USDT_MINT_NOT_CONFIGURED' ||
    reasonCode === 'TRON_USDT_CONTRACT_NOT_CONFIGURED' ||
    reasonCode === 'INVALID_TOKEN_CONTRACT'
  ) {
    return {
      message: `USDT no está disponible en ${networkName} (contrato testnet no configurado en el servidor). Selecciona la moneda nativa para continuar.`,
      kind: 'ASSET_NOT_CONFIGURED',
      name: safeName,
      code: reasonCode,
      shortMessage: reasonCode,
      category: 'ASSET_NOT_CONFIGURED',
    }
  }

  const isExplicitUserRejection =
    code === 4001 ||
    codeStr === '4001' ||
    code === 5000 ||
    codeStr === '5000' ||
    rootName === 'UserRejectedRequestError' ||
    rootName === 'TransactionRejectedRpcError' ||
    /(?:user|wallet|signer)\s+(?:has\s+)?(?:rejected|denied|declined|cancelled|canceled)|(?:rejected|denied|declined|cancelled|canceled)\s+by\s+(?:the\s+)?(?:user|wallet|signer)|user\s+(?:rejected|denied|declined|cancelled|canceled)/i.test(checkText)

  if (isExplicitUserRejection) {
    return {
      message: 'Transacción rechazada en tu billetera.',
      kind: 'USER_REJECTION',
      name: safeName,
      code,
      shortMessage: safeShortMessage,
      category: 'USER_REJECTION',
    }
  }

  if (
    rootName === 'ChainMismatchError' ||
    rootName === 'ConnectorChainMismatchError' ||
    /chain.*mismatch|does not match the target chain|wrong network/.test(checkText)
  ) {
    return {
      message: `La billetera está conectada a otra red. Cambia a la red ${networkName} en tu billetera para continuar.`,
      kind: 'CHAIN_MISMATCH',
      name: safeName,
      code,
      shortMessage: safeShortMessage,
      category: 'CHAIN_MISMATCH',
    }
  }

  if (
    rootName === 'ConnectorNotConnectedError' ||
    rootName === 'ProviderNotFoundError' ||
    /no hay una wallet|wallet not connected|connector not connected|wallet.*desconectada|provider not found/.test(checkText)
  ) {
    return {
      message: `No hay una billetera compatible conectada para autorizar la transacción en ${networkName}. Conecta tu billetera para continuar.`,
      kind: 'WALLET_NOT_CONNECTED',
      name: safeName,
      code,
      shortMessage: safeShortMessage,
      category: 'WALLET_NOT_CONNECTED',
    }
  }

  if (
    rootName === 'ExecutionRevertedError' ||
    rootName === 'ContractFunctionRevertedError' ||
    rootName === 'ContractFunctionExecutionError' ||
    /execution reverted|contract reverted|reverted with reason|transfer amount exceeds/.test(checkText)
  ) {
    const detail = cleanReason ? ` (${cleanReason})` : ''
    return {
      message: `La transacción fue revertida en la red ${networkName}${detail}. Verifica el saldo y los parámetros en tu billetera.`,
      kind: 'EXECUTION_REVERTED',
      name: safeName,
      code,
      shortMessage: safeShortMessage,
      category: 'EXECUTION_REVERTED',
    }
  }

  if (
    rootName === 'InsufficientFundsError' ||
    /insufficient.*(?:funds|balance|gas)|exceeds balance|gas required exceeds|saldo insuficiente/.test(checkText)
  ) {
    return {
      message: `No se pudo procesar la transacción en la red ${networkName} (fondos insuficientes para el pago o para el gas de red).`,
      kind: 'INSUFFICIENT_FUNDS',
      name: safeName,
      code,
      shortMessage: safeShortMessage,
      category: 'INSUFFICIENT_FUNDS',
    }
  }

  if (
    rootName.includes('Rpc') ||
    rootName.includes('Timeout') ||
    rootName.includes('Http') ||
    code === -32000 ||
    code === -32603 ||
    code === 429 ||
    code === 502 ||
    code === 503 ||
    code === 504 ||
    codeStr === '-32000' ||
    codeStr === '-32603' ||
    /\b512\b|rpc|provider|gateway|timeout|timed out|network error|failed to fetch|-32603|-32000|rate limit|429|502|503|504|nonce too low|replacement.*underpriced/.test(checkText)
  ) {
    const detail = cleanReason ? ` (${cleanReason})` : ''
    return {
      message: `Error de comunicación con el proveedor RPC en la red ${networkName}${detail}. Intenta de nuevo en unos segundos.`,
      kind: 'RPC_ERROR',
      name: safeName,
      code,
      shortMessage: safeShortMessage,
      category: 'RPC_ERROR',
    }
  }

  const detail = cleanReason ? ` (${cleanReason})` : ''
  return {
    message: `No se pudo completar el pago en ${networkName}${detail}.`,
    kind: 'GENERIC_DIAGNOSTIC',
    name: safeName,
    code,
    shortMessage: safeShortMessage,
    category: 'GENERIC_DIAGNOSTIC',
  }
}

function formatCountdown(msRemaining: number): string {
  const totalSec = Math.max(0, Math.floor(msRemaining / 1000))
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function WalletPaymentCheckout({
  productName,
  amount,
  packageId,
  purchaseMode = 'once',
  initialNetworkId = 'bnb',
  initialIntentId,
  onClose,
  onPaid,
}: {
  productName: string
  amount: number
  currency: PaymentCurrency
  packageId?: string
  purchaseMode?: 'once' | 'monthly'
  minerId?: string
  initialNetworkId?: PaymentNetworkId
  initialWalletId?: string
  initialIntentId?: string
  session?: WalletSession
  onClose: (requestPending?: boolean, notice?: string) => void
  onResumeWalletConnect?: (url: string) => void
  onPaid: (receipt: PaymentReceipt) => void
}) {
  const navigate = useNavigate()
  const { open: openAppKit } = useAppKit()
  const appKitAccount = useAppKitAccount()
  const tronAppKitAccount = useAppKitAccount({ namespace: 'tron' })
  const { chainId: appKitChainId, caipNetwork } = useAppKitNetwork()
  const { walletProvider: solanaProvider } = useAppKitProvider<SolanaAppKitProvider>('solana')
  const { walletProvider: tronProvider } = useAppKitProvider<TronAppKitProvider>('tron')
  const { address: evmAddress, isConnected: isEvmConnected, chainId: wagmiChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()
  const { writeContractAsync } = useWriteContract()
  const { user, openAuthModal, linkWallet } = useAuth()

  const isAuthenticated = Boolean(user && !user.isAnonymous)
  const ethereumEnabled = isEthereumPaymentEnabled()

  const { activeAddress, isWalletConnected, isEvmWallet, isSolanaWallet, isTronWallet } = resolveActiveMultichainWallet({
    appKitAddress: appKitAccount.address,
    isAppKitConnected: appKitAccount.isConnected,
    appKitCaipAddress: appKitAccount.caipAddress,
    caipNamespace: caipNetwork?.chainNamespace,
    wagmiAddress: evmAddress,
    isWagmiConnected: isEvmConnected,
    tronAppKitAddress: tronAppKitAccount.address,
    isTronAppKitConnected: tronAppKitAccount.isConnected,
    tronAppKitCaipAddress: tronAppKitAccount.caipAddress,
  })

  const [networkId, setNetworkId] = useState<PaymentNetworkId>(() => {
    if (isSolanaWallet) return 'solana'
    if (isTronWallet) return 'tron'
    return initialNetworkId === 'ethereum' && !ethereumEnabled ? 'bnb' : initialNetworkId
  })
  const [useUsdt, setUseUsdt] = useState<boolean>(() => {
    const initialNet: PaymentNetworkId = isSolanaWallet
      ? 'solana'
      : isTronWallet
        ? 'tron'
        : (initialNetworkId === 'ethereum' && !ethereumEnabled ? 'bnb' : initialNetworkId)
    return Boolean(getPaymentNetworkConfig(initialNet).usdtContractAddress)
  })
  const [intent, setIntent] = useState<PaymentIntentRecord | null>(null)
  const [initRetryNonce, setInitRetryNonce] = useState(0)
  const [loadingIntent, setLoadingIntent] = useState(false)
  const [methodUpdating, setMethodUpdating] = useState(false)
  const [paying, setPaying] = useState(false)
  const [retryingVerification, setRetryingVerification] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [broadcastTxLock, setBroadcastTxLock] = useState<BroadcastTxLock | null>(null)
  const [autoVerifyState, setAutoVerifyState] = useState<{ key: string; attempts: number }>({ key: '', attempts: 0 })
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const settledNotifiedRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)
  const methodSeqRef = useRef(0)
  const methodInFlightRef = useRef(false)
  const freshInFlightRef = useRef(false)
  const payInFlightRef = useRef(false)
  const retryInFlightRef = useRef(false)
  const autoVerifyInFlightRef = useRef<{ intentId: string; promise: Promise<ConfirmPaymentIntentResult> } | null>(null)
  const failedSyncKeyRef = useRef<string | null>(null)
  const hasManualNetworkSelectionRef = useRef(false)

  const userUid = user?.uid ?? ''
  const productType: PaymentProductType = purchaseMode === 'monthly' || !isMinerProduct(productName) ? 'subscription' : 'miner'
  const cleanPackageId = packageId?.trim() || ''
  const isCustomMiner = !cleanPackageId || cleanPackageId === 'minerx-custom'
  const resolvedPackageId = !isCustomMiner ? cleanPackageId : undefined
  const resolvedPowerTh = isCustomMiner && productType === 'miner' ? parseMinerPowerTh(productName, amount) : undefined
  const productSignature = buildCheckoutProductSignature({
    uid: userUid,
    productType,
    packageId: resolvedPackageId,
    powerTh: resolvedPowerTh,
  })
  const productSignatureRef = useRef(productSignature)
  const sessionKeyRef = useRef('')
  if (!sessionKeyRef.current || productSignatureRef.current !== productSignature) {
    productSignatureRef.current = productSignature
    sessionKeyRef.current = generateCheckoutIdempotencyKey()
  }

  const destinations = useMemo(() => getPaymentDestinations(), [])
  const enabledNetworks = useMemo(
    () => networks.filter((n) => n.id !== 'ethereum' || ethereumEnabled),
    [ethereumEnabled],
  )

  const effectiveNetworkId: PaymentNetworkId = enabledNetworks.some((n) => n.id === networkId)
    ? networkId
    : (enabledNetworks[0]?.id ?? 'bnb')
  const selectedNetworkFamily = getPaymentNetworkFamily(effectiveNetworkId)
  const connectedWalletFamily: PaymentWalletFamily | null = isEvmWallet
    ? 'evm'
    : isTronWallet
      ? 'tron'
      : isSolanaWallet
        ? 'solana'
        : null
  const prevWalletFamilyRef = useRef<PaymentWalletFamily | null>(connectedWalletFamily)
  const isWrongWalletFamily = Boolean(
    isWalletConnected &&
    !isWalletFamilyCompatibleWithNetwork({
      networkId: effectiveNetworkId,
      isEvmWallet,
      isSolanaWallet,
      isTronWallet,
    }),
  )
  const selectedNetworkConfig = getPaymentNetworkConfig(effectiveNetworkId, intent?.networkMode)
  const connectedWalletLabel = connectedWalletFamily ? getWalletFamilyLabel(connectedWalletFamily) : ''
  const requiredWalletLabel = getWalletFamilyLabel(selectedNetworkFamily)

  const authoritativeNetworkId: PaymentNetworkId = intent?.paymentNetwork
    ? toClientPaymentNetworkId(intent.paymentNetwork)
    : effectiveNetworkId
  const isSolana = authoritativeNetworkId === 'solana'
  const isTron = authoritativeNetworkId === 'tron'
  const activeDestination = destinations.find((d) => d.id === authoritativeNetworkId) ?? destinations[0]
  const activeNetworkConfig = getPaymentNetworkConfig(authoritativeNetworkId, intent?.networkMode)
  const selectedAsset: PaymentAssetSymbol = useUsdt ? 'USDT' : NATIVE_SYMBOL_BY_NETWORK[effectiveNetworkId]
  const numericChainId = isEvmWallet ? (Number(wagmiChainId || appKitChainId || 0) || 0) : 0
  const expectedEvmChainId = typeof intent?.chainId === 'number'
    ? intent.chainId
    : (typeof activeNetworkConfig.chainId === 'number' ? activeNetworkConfig.chainId : activeDestination.chainId)
  const hasNetworkSelectionMismatch = Boolean(
    intent?.paymentNetwork && intent.paymentNetwork !== toBackendPaymentNetworkId(effectiveNetworkId),
  )
  const isWrongEvmChain =
    !isSolana &&
    isEvmWallet &&
    !hasNetworkSelectionMismatch &&
    numericChainId > 0 &&
    numericChainId !== expectedEvmChainId &&
    !isTron

  const latestSelectionRef = useRef({
    isWalletConnected,
    isWrongWalletFamily,
    effectiveNetworkId,
    selectedAsset,
    activeAddress,
    destinationName: activeDestination.name,
  })
  latestSelectionRef.current = {
    isWalletConnected,
    isWrongWalletFamily,
    effectiveNetworkId,
    selectedAsset,
    activeAddress,
    destinationName: activeDestination.name,
  }

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  const activeIntentId = intent?.intentId ?? ''
  const activeIntentIdRef = useRef(activeIntentId)
  activeIntentIdRef.current = activeIntentId
  const activeIntentStatus = intent?.status
  const isTerminalIntent = shouldClearBroadcastTxLock(activeIntentStatus)

  const persistedBroadcastTxLock = useMemo(
    () => (!userUid || !activeIntentId || isTerminalIntent ? null : readBroadcastTxLock(userUid, activeIntentId)),
    [userUid, activeIntentId, isTerminalIntent],
  )

  useEffect(() => {
    if (!userUid || !activeIntentId) {
      setBroadcastTxLock(null)
      return
    }
    if (isTerminalIntent) {
      clearBroadcastTxLock(userUid, activeIntentId)
      setBroadcastTxLock(null)
    }
  }, [userUid, activeIntentId, isTerminalIntent])

  const activeBroadcastTxLock =
    (broadcastTxLock && intent && broadcastTxLock.intentId === intent.intentId && broadcastTxLock.uid === userUid && !isTerminalIntent
      ? broadcastTxLock
      : null) ?? persistedBroadcastTxLock
  const lockedTxHash = activeBroadcastTxLock?.txHash || (!isTerminalIntent ? (intent?.txHash?.trim() || '') : '')
  const hasBroadcastTxLock = Boolean(lockedTxHash)
  const autoVerifyScopeKey = activeIntentId && lockedTxHash ? `${activeIntentId}:${lockedTxHash}` : ''
  const autoVerifyAttempts = autoVerifyState.key === autoVerifyScopeKey ? autoVerifyState.attempts : 0
  const autoVerifying = shouldAutoVerifyBroadcastIntent({
    intentStatus: activeIntentStatus,
    lockedTxHash,
    isPaying: paying,
    attemptsUsed: autoVerifyAttempts,
  })
  const showCalmAutoVerify = (autoVerifying || (paying && hasBroadcastTxLock && activeIntentStatus === 'AWAITING')) && !error

  const expiresAtMs = intent?.expiresAt ? Date.parse(intent.expiresAt) : Number.NaN
  const remainingMs = Number.isFinite(expiresAtMs) ? Math.max(0, expiresAtMs - nowMs) : 0
  const isIntentExpired = Boolean(
    intent && (
      intent.status === 'EXPIRED' ||
      intent.isExpired ||
      ((intent.status === 'OPEN' || intent.status === 'AWAITING') && Number.isFinite(expiresAtMs) && nowMs > expiresAtMs)
    ),
  )

  const canCancel = Boolean(
    intent && (intent.status === 'OPEN' || intent.status === 'AWAITING') && !intent.txHash && !hasBroadcastTxLock && !isIntentExpired,
  )

  // Used exclusively by "Generar nueva cotización" after CANCELLED/EXPIRED/FAILED/UNDERPAID
  const createFreshIntent = useCallback(async (
    targetNet: PaymentNetworkId,
    targetAsset: PaymentAssetSymbol,
    walletAddr: string,
  ) => {
    if (!isAuthenticated || !userUid || loadingIntent || freshInFlightRef.current || methodInFlightRef.current) return
    freshInFlightRef.current = true
    failedSyncKeyRef.current = null
    const nextSessionKey = generateCheckoutIdempotencyKey()
    sessionKeyRef.current = nextSessionKey
    const seq = ++methodSeqRef.current
    setLoadingIntent(true)
    setError('')
    try {
      const canBindTargetMethod = Boolean(
        isWalletConnected &&
        isWalletFamilyCompatibleWithNetwork({
          networkId: targetNet,
          isEvmWallet,
          isSolanaWallet,
          isTronWallet,
        }),
      )
      const created = await createPaymentIntent({
        productType,
        ...(resolvedPackageId ? { packageId: resolvedPackageId } : {}),
        ...(resolvedPowerTh !== undefined ? { powerTh: resolvedPowerTh } : {}),
        idempotencyKey: nextSessionKey,
        ...(canBindTargetMethod
          ? {
              networkId: toBackendPaymentNetworkId(targetNet),
              assetSymbol: targetAsset,
              ...(walletAddr ? { senderWallet: walletAddr } : {}),
            }
          : {}),
      })
      if (isMountedRef.current && methodSeqRef.current === seq) {
        setIntent(created)
        if (created.paymentNetwork) {
          setNetworkId(toClientPaymentNetworkId(created.paymentNetwork))
        }
        if (created.paymentAsset) {
          setUseUsdt(created.paymentAsset === 'USDT')
        }
      }
    } catch (err) {
      if (isMountedRef.current && methodSeqRef.current === seq) {
        setError(classifyPaymentError(err, latestSelectionRef.current.destinationName).message)
      }
    } finally {
      freshInFlightRef.current = false
      if (isMountedRef.current) {
        setLoadingIntent(false)
      }
    }
  }, [isAuthenticated, userUid, loadingIntent, productType, resolvedPackageId, resolvedPowerTh, isWalletConnected, isEvmWallet, isSolanaWallet, isTronWallet])

  // Step 1: Hydrate existing intent via gmPayIntentId OR create 1 idempotent PaymentIntent (directly AWAITING if wallet is already connected)
  useEffect(() => {
    if (!isAuthenticated || !userUid) return
    let cancelled = false
    const initSeq = ++methodSeqRef.current
    methodInFlightRef.current = false
    failedSyncKeyRef.current = null
    setMethodUpdating(false)

    const init = async () => {
      setLoadingIntent(true)
      setError('')
      try {
        if (initialIntentId?.trim()) {
          const existing = await getPaymentIntent(initialIntentId.trim())
          if (cancelled || !isMountedRef.current) return
          setIntent(existing)
          if (existing.paymentNetwork) {
            setNetworkId(toClientPaymentNetworkId(existing.paymentNetwork))
          }
          if (existing.paymentAsset) {
            setUseUsdt(existing.paymentAsset === 'USDT')
          }
          return
        }

        if (initRetryNonce > 0) {
          sessionKeyRef.current = generateCheckoutIdempotencyKey()
        }
        const sessionKey = sessionKeyRef.current
        const sel = latestSelectionRef.current
        const created = await runDeduplicatedIntentInit(sessionKey, () =>
          createPaymentIntent({
            productType,
            ...(resolvedPackageId ? { packageId: resolvedPackageId } : {}),
            ...(resolvedPowerTh !== undefined ? { powerTh: resolvedPowerTh } : {}),
            idempotencyKey: sessionKey,
            ...(sel.isWalletConnected && !sel.isWrongWalletFamily
              ? {
                  networkId: toBackendPaymentNetworkId(sel.effectiveNetworkId),
                  assetSymbol: sel.selectedAsset,
                  ...(sel.activeAddress ? { senderWallet: sel.activeAddress } : {}),
                }
              : {}),
          }),
        )
        if (cancelled || !isMountedRef.current || methodSeqRef.current !== initSeq) return
        setIntent(created)
        if (created.paymentNetwork) {
          setNetworkId(toClientPaymentNetworkId(created.paymentNetwork))
        }
        if (created.paymentAsset) {
          setUseUsdt(created.paymentAsset === 'USDT')
        }
      } catch (err) {
        if (!cancelled && isMountedRef.current) {
          setError(classifyPaymentError(err, latestSelectionRef.current.destinationName).message)
        }
      } finally {
        if (!cancelled && isMountedRef.current) setLoadingIntent(false)
      }
    }

    void init()
    return () => { cancelled = true }
  }, [isAuthenticated, userUid, initialIntentId, productSignature, productType, resolvedPackageId, resolvedPowerTh, initRetryNonce])

  // Step 2: Transition OPEN -> AWAITING when wallet connects, or sync senderWallet in-place on AWAITING
  useEffect(() => {
    if (!isWalletConnected) {
      prevWalletFamilyRef.current = null
      return
    }
    if (!isAuthenticated || !intent || loadingIntent || methodUpdating || paying || cancelling || retryingVerification || methodInFlightRef.current) {
      return
    }

    const prevWalletFamily = prevWalletFamilyRef.current
    if (!hasBroadcastTxLock) {
      prevWalletFamilyRef.current = connectedWalletFamily
    }
    const alignedNet = resolveAutoAlignedNetworkOnWalletSwitch({
      prevWalletFamily,
      nextWalletFamily: connectedWalletFamily,
      currentNetworkId: effectiveNetworkId,
      hasBroadcastTxLock,
      intentStatus: intent.status,
      hasManualNetworkSelection: hasManualNetworkSelectionRef.current,
    })
    if (alignedNet) {
      hasManualNetworkSelectionRef.current = false
      setNetworkId(alignedNet)
      setUseUsdt(Boolean(getPaymentNetworkConfig(alignedNet, intent.networkMode).usdtContractAddress))
      if (!isTerminalIntent) {
        setError('')
      }
      return
    }

    if (hasBroadcastTxLock) {
      return
    }

    if (isWrongWalletFamily) {
      return
    }

    const sel = latestSelectionRef.current
    const targetBackendNet = toBackendPaymentNetworkId(sel.effectiveNetworkId)
    const targetAsset: PaymentAssetSymbol =
      (intent.status === 'OPEN' || (intent.status === 'AWAITING' && hasNetworkSelectionMismatch)) &&
      sel.selectedAsset === 'USDT' &&
      !getPaymentNetworkConfig(sel.effectiveNetworkId, intent.networkMode).usdtContractAddress
        ? NATIVE_SYMBOL_BY_NETWORK[sel.effectiveNetworkId]
        : sel.selectedAsset
    const syncKey = resolvePendingMethodSyncKey({
      intent,
      isWalletConnected,
      isEvmWallet,
      activeAddress,
      targetNetworkId: targetBackendNet,
      targetAsset,
      failedSyncKey: failedSyncKeyRef.current,
    })
    if (!syncKey) return

    const seq = ++methodSeqRef.current
    methodInFlightRef.current = true
    setMethodUpdating(true)
    setError('')

    const syncMethod = async () => {
      try {
        const updated = await selectPaymentMethod({
          intentId: intent.intentId,
          networkId: targetBackendNet,
          assetSymbol: targetAsset,
          ...(activeAddress ? { senderWallet: activeAddress } : {}),
        })
        if (isMountedRef.current && methodSeqRef.current === seq) {
          failedSyncKeyRef.current = null
          setIntent(updated)
          if (updated.paymentNetwork) {
            setNetworkId(toClientPaymentNetworkId(updated.paymentNetwork))
          }
          if (updated.paymentAsset) {
            setUseUsdt(updated.paymentAsset === 'USDT')
          }
        }
      } catch (err) {
        if (isMountedRef.current && methodSeqRef.current === seq) {
          failedSyncKeyRef.current = syncKey
          setError(classifyPaymentError(err, sel.destinationName).message)
        }
      } finally {
        if (methodSeqRef.current === seq) {
          methodInFlightRef.current = false
          if (isMountedRef.current) setMethodUpdating(false)
        }
      }
    }

    void syncMethod()
  }, [
    isAuthenticated,
    intent?.intentId,
    intent?.status,
    intent?.networkMode,
    intent?.senderWallet,
    intent?.txHash,
    intent?.expiresAt,
    intent?.isExpired,
    isIntentExpired,
    isTerminalIntent,
    hasNetworkSelectionMismatch,
    hasBroadcastTxLock,
    isWalletConnected,
    connectedWalletFamily,
    isEvmWallet,
    isSolanaWallet,
    isTronWallet,
    isWrongWalletFamily,
    effectiveNetworkId,
    activeAddress,
    loadingIntent,
    methodUpdating,
    paying,
    cancelling,
    retryingVerification,
  ])

  // Real TTL countdown timer while OPEN or AWAITING
  useEffect(() => {
    if (!intent || (intent.status !== 'OPEN' && intent.status !== 'AWAITING')) return
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [intent?.intentId, intent?.status, intent?.expiresAt])

  // Controlled polling while PROCESSING (cleaned up on unmount or terminal state)
  useEffect(() => {
    if (!intent || intent.status !== 'PROCESSING') return
    let cancelled = false

    const poll = async () => {
      try {
        const refreshed = await getPaymentIntent(intent.intentId)
        if (!cancelled) setIntent(refreshed)
      } catch {
        // Keep polling on transient network errors
      }
    }

    const interval = window.setInterval(() => { void poll() }, 4000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [intent?.intentId, intent?.status])

  // Silent post-broadcast auto-verification while AWAITING + broadcast lock active (handles RPC mempool propagation lag)
  useEffect(() => {
    if (!autoVerifying || !activeIntentId || !lockedTxHash) return
    let cancelled = false
    const targetIntentId = activeIntentId
    const targetTxHash = lockedTxHash
    const targetUid = userUid
    const scopeKey = autoVerifyScopeKey

    const verify = async () => {
      if (cancelled || retryInFlightRef.current || payInFlightRef.current) return
      retryInFlightRef.current = true
      const run = confirmPaymentIntent(targetIntentId, targetTxHash)
      autoVerifyInFlightRef.current = { intentId: targetIntentId, promise: run }
      try {
        const confirmation = await run
        if (cancelled || !isMountedRef.current) return
        if (shouldClearBroadcastTxLock(confirmation.status)) {
          clearBroadcastTxLock(targetUid, targetIntentId)
          setBroadcastTxLock(null)
        }
        if (confirmation.status !== 'AWAITING') {
          setError('')
        }
        setIntent((prev) => (prev && prev.intentId === targetIntentId ? {
          ...prev,
          status: confirmation.status,
          txHash: confirmation.txHash ?? targetTxHash,
          confirmations: confirmation.confirmations ?? prev.confirmations,
          requiredConfirmations: confirmation.requiredConfirmations ?? prev.requiredConfirmations,
          activatedMinerId: confirmation.activatedMinerId ?? prev.activatedMinerId,
          settledAt: confirmation.settledAt ?? prev.settledAt,
        } : prev))
      } catch {
        // Absorb transient RPC/network errors silently; manual retry CTA stays available.
      } finally {
        if (autoVerifyInFlightRef.current?.promise === run) {
          autoVerifyInFlightRef.current = null
        }
        retryInFlightRef.current = false
        if (!cancelled && isMountedRef.current) {
          setAutoVerifyState((prev) =>
            prev.key === scopeKey
              ? { key: scopeKey, attempts: prev.attempts + 1 }
              : { key: scopeKey, attempts: 1 },
          )
        }
      }
    }

    const interval = window.setInterval(() => { void verify() }, POST_BROADCAST_AUTO_VERIFY_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [autoVerifying, activeIntentId, lockedTxHash, userUid, autoVerifyScopeKey])

  // Emit onPaid receipt strictly once when backend reaches SETTLED
  useEffect(() => {
    if (!intent || intent.status !== 'SETTLED' || settledNotifiedRef.current === intent.intentId) return
    settledNotifiedRef.current = intent.intentId

    const settledNet = intent.paymentNetwork ? toClientPaymentNetworkId(intent.paymentNetwork) : effectiveNetworkId
    const txHash = intent.txHash ?? ''
    const explorerUrl = txHash
      ? buildExplorerTxUrl(settledNet, txHash, intent.networkMode)
      : activeDestination.blockExplorer
    const receipt: PaymentReceipt = {
      id: intent.orderId || intent.intentId,
      productName: intent.packageName || productName,
      quote: {
        networkId: settledNet,
        networkName: activeNetworkConfig.name,
        asset: (intent.paymentAsset ?? selectedAsset) as PaymentAsset,
        recipient: intent.treasuryAddress ?? '',
        catalogValue: intent.amountUsd,
        catalogCurrency: 'USD',
        catalogUsd: intent.amountUsd,
        fxDate: null,
        assetUsd: Number(intent.quotedSpotUsd || '1') || 1,
        amount: intent.expectedAmountDisplay || String(intent.amountUsd),
        decimals: intent.assetDecimals ?? 6,
        estimatedBridgeFeeUsd: 0,
        bridgeFeeRate: 0,
        expectedNetUsd: intent.amountUsd,
        quoteSource: intent.quoteSource || 'SERVER_PAYMENT_INTENT',
        updatedAt: Date.now(),
        expiresAt: Date.parse(intent.expiresAt) || Date.now(),
      },
      sender: intent.senderWallet || activeAddress,
      transactionHash: txHash,
      sourceStatus: 'submitted',
      bridgeStatus: 'not-applicable',
      sentAt: Date.now(),
      explorerUrl,
      minerId: intent.activatedMinerId ?? undefined,
    }
    onPaid(receipt)
  }, [intent, effectiveNetworkId, activeDestination.blockExplorer, activeNetworkConfig.name, selectedAsset, activeAddress, productName, onPaid])

  const handleSelectNetworkOrAsset = async (nextNet: PaymentNetworkId, nextUseUsdt: boolean) => {
    if (loadingIntent || methodUpdating || methodInFlightRef.current || freshInFlightRef.current || paying || cancelling || retryingVerification || hasBroadcastTxLock) return
    if (
      isWalletConnected &&
      !isWalletFamilyCompatibleWithNetwork({
        networkId: nextNet,
        isEvmWallet,
        isSolanaWallet,
        isTronWallet,
      })
    ) {
      setNetworkId(nextNet)
      setUseUsdt(nextUseUsdt)
      setError('')
      return
    }
    const nextAsset: PaymentAssetSymbol = nextUseUsdt ? 'USDT' : NATIVE_SYMBOL_BY_NETWORK[nextNet]
    const nextBackendNet = toBackendPaymentNetworkId(nextNet)
    const cleanActiveAddress = activeAddress.trim()
    const intentSender = intent?.senderWallet?.trim() ?? ''
    const matchesIntentSender = !cleanActiveAddress || (
      Boolean(intentSender) &&
      (isEvmWallet
        ? intentSender.toLowerCase() === cleanActiveAddress.toLowerCase()
        : intentSender === cleanActiveAddress)
    )
    if (
      intent?.status === 'AWAITING' &&
      Boolean(intent?.treasuryAddress) &&
      !isIntentExpired &&
      intent?.paymentNetwork === nextBackendNet &&
      intent?.paymentAsset === nextAsset &&
      matchesIntentSender
    ) {
      if (nextNet !== effectiveNetworkId) setNetworkId(nextNet)
      if (nextUseUsdt !== useUsdt) setUseUsdt(nextUseUsdt)
      if (error) setError('')
      return
    }
    if (!intent) {
      setNetworkId(nextNet)
      setUseUsdt(nextUseUsdt)
      setError('')
      setInitRetryNonce((n) => n + 1)
      return
    }
    if (!canMutateIntentMethodInPlace(intent, Date.now())) {
      setNetworkId(nextNet)
      setUseUsdt(nextUseUsdt)
      return
    }

    const targetDestinationName = (destinations.find((d) => d.id === nextNet) ?? activeDestination).name
    const seq = ++methodSeqRef.current
    methodInFlightRef.current = true
    setMethodUpdating(true)
    setError('')
    try {
      const updated = await selectPaymentMethod({
        intentId: intent.intentId,
        networkId: nextBackendNet,
        assetSymbol: nextAsset,
        ...(activeAddress ? { senderWallet: activeAddress } : {}),
      })
      if (isMountedRef.current && methodSeqRef.current === seq) {
        failedSyncKeyRef.current = null
        setNetworkId(nextNet)
        setUseUsdt(nextUseUsdt)
        setIntent(updated)
      }
    } catch (err) {
      if (isMountedRef.current && methodSeqRef.current === seq) {
        failedSyncKeyRef.current =
          failedSyncKeyRef.current ??
          resolvePendingMethodSyncKey({
            intent,
            isWalletConnected,
            isEvmWallet,
            activeAddress,
            targetNetworkId: nextBackendNet,
            targetAsset: nextAsset,
            failedSyncKey: null,
          })
        setError(classifyPaymentError(err, targetDestinationName).message)
      }
    } finally {
      if (methodSeqRef.current === seq) {
        methodInFlightRef.current = false
        if (isMountedRef.current) setMethodUpdating(false)
      }
    }
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('Copiado al portapapeles')
      window.setTimeout(() => setCopyStatus(''), 2500)
    } catch {
      setCopyStatus('No se pudo copiar automáticamente')
    }
  }

  const handleSwitchNetwork = async () => {
    setError('')
    try {
      if (isEvmWallet && isEvmConnected && switchChainAsync) {
        await switchChainAsync({ chainId: expectedEvmChainId })
      } else {
        const targetAppKitNet = appKitNetworks.find((net) => Number(net.id) === expectedEvmChainId)
        if (!targetAppKitNet) {
          throw new Error(`Red objetivo no configurada en la pasarela de PouwMiner (chainId ${expectedEvmChainId}).`)
        }
        await appKitModal.switchNetwork(targetAppKitNet, { throwOnFailure: true })
      }
    } catch {
      setError(`Por favor confirma el cambio de red a ${activeNetworkConfig.name} en tu billetera.`)
    }
  }

  const handleCancelIntent = async () => {
    if (!intent || !canCancel || cancelling || hasBroadcastTxLock) return
    setCancelling(true)
    setError('')
    try {
      const cancelledIntent = await cancelPaymentIntent(intent.intentId, 'USER_CANCELLED')
      setIntent(cancelledIntent)
    } catch (err) {
      setError(classifyPaymentError(err, activeNetworkConfig.name).message)
    } finally {
      setCancelling(false)
    }
  }

  const handleRetryVerification = async () => {
    if (!intent || retryingVerification || paying || payInFlightRef.current) return
    const targetIntentId = intent.intentId
    const targetUid = userUid
    const txHashToConfirm = activeBroadcastTxLock?.txHash || intent.txHash?.trim() || ''
    if (!txHashToConfirm) return
    const inFlightAutoVerify =
      autoVerifyInFlightRef.current?.intentId === targetIntentId
        ? autoVerifyInFlightRef.current.promise
        : null
    if (retryInFlightRef.current && !inFlightAutoVerify) return
    const ownsRetryLock = !inFlightAutoVerify
    if (ownsRetryLock) {
      retryInFlightRef.current = true
    }
    setRetryingVerification(true)
    setError('')
    try {
      const confirmation = inFlightAutoVerify
        ? await inFlightAutoVerify
        : await confirmPaymentIntent(targetIntentId, txHashToConfirm)
      if (shouldClearBroadcastTxLock(confirmation.status)) {
        clearBroadcastTxLock(targetUid, targetIntentId)
        if (isMountedRef.current && activeIntentIdRef.current === targetIntentId) {
          setBroadcastTxLock(null)
        }
      }
      if (!isMountedRef.current || activeIntentIdRef.current !== targetIntentId) return
      setIntent((prev) => (prev && prev.intentId === targetIntentId ? {
        ...prev,
        status: confirmation.status,
        txHash: confirmation.txHash ?? txHashToConfirm,
        confirmations: confirmation.confirmations ?? prev.confirmations,
        requiredConfirmations: confirmation.requiredConfirmations ?? prev.requiredConfirmations,
        activatedMinerId: confirmation.activatedMinerId ?? prev.activatedMinerId,
        settledAt: confirmation.settledAt ?? prev.settledAt,
      } : prev))
    } catch (err) {
      if (isMountedRef.current && activeIntentIdRef.current === targetIntentId) {
        const classified = classifyPaymentError(err, activeNetworkConfig.name)
        setError(classified.message)
      }
    } finally {
      if (ownsRetryLock) {
        retryInFlightRef.current = false
      }
      if (isMountedRef.current) setRetryingVerification(false)
    }
  }

  const handlePay = async () => {
    if (payInFlightRef.current) return
    if (!user || user.isAnonymous) {
      setError('Debes iniciar sesión con una cuenta registrada para completar la compra.')
      openAuthModal('register')
      return
    }
    if (!intent || intent.status !== 'AWAITING') {
      setError('La orden de pago aún no está lista. Selecciona red y moneda para continuar.')
      return
    }
    const existingLock = activeBroadcastTxLock ?? readBroadcastTxLock(userUid, intent.intentId)
    if (hasBroadcastTxLock || existingLock) {
      if (existingLock && !activeBroadcastTxLock) {
        setBroadcastTxLock(existingLock)
      }
      setError('Ya existe una transacción enviada on-chain para esta orden. Usa "Reintentar verificación on-chain" sin volver a firmar.')
      return
    }
    if (isWrongWalletFamily) {
      setError(
        `Tu billetera actual es ${connectedWalletLabel}. Para pagar en ${selectedNetworkConfig.name}, cambia a una billetera compatible con ${requiredWalletLabel}.`,
      )
      return
    }
    if (hasNetworkSelectionMismatch) {
      setError('La red seleccionada no coincide con la cotización actual. Actualiza la red o moneda para continuar.')
      return
    }
    if (isIntentExpired) {
      setError('La cotización de pago expiró. Genera una nueva cotización para continuar.')
      return
    }
    if (!intent.expectedAmountAtomic || !intent.treasuryAddress) {
      setError('Faltan parámetros autoritativos del servidor (monto atómico o tesorería).')
      return
    }

    payInFlightRef.current = true
    setError('')
    setPaying(true)

    try {
      let txHash = ''

      if (isSolana) {
        const treasury = requireTreasuryAddress(intent.treasuryAddress, 'solana')
        if (!activeAddress || !solanaProvider) {
          throw new Error('No hay una wallet Solana conectada en la pasarela de PouwMiner para autorizar el pago.')
        }
        const clusterParity = validateSolanaClusterParity({
          caipNetworkId: caipNetwork?.caipNetworkId,
          caipChainId: caipNetwork?.id,
          expectedNetworkMode: intent.networkMode,
        })
        if (!clusterParity.ok) {
          setError(
            clusterParity.error ??
              `Tu billetera Solana está en ${clusterParity.actualLabel}, pero esta orden requiere ${clusterParity.expectedLabel}. Cambia de red en tu billetera antes de firmar.`,
          )
          return
        }
        const tx = await buildSolanaPaymentTransaction(
          activeAddress,
          treasury,
          {
            networkId: 'solana',
            networkName: activeNetworkConfig.name,
            asset: (intent.paymentAsset ?? selectedAsset) as PaymentAsset,
            recipient: treasury,
            catalogValue: intent.amountUsd,
            catalogCurrency: 'USD',
            catalogUsd: intent.amountUsd,
            fxDate: null,
            assetUsd: Number(intent.quotedSpotUsd || '1') || 1,
            amount: intent.expectedAmountDisplay || String(intent.amountUsd),
            decimals: intent.assetDecimals ?? (intent.paymentAsset === 'USDT' ? 6 : 9),
            estimatedBridgeFeeUsd: 0,
            bridgeFeeRate: 0,
            expectedNetUsd: intent.amountUsd,
            quoteSource: intent.quoteSource || 'SERVER_PAYMENT_INTENT',
            updatedAt: Date.now(),
            expiresAt: Date.parse(intent.expiresAt) || Date.now(),
            expectedAmountAtomic: intent.expectedAmountAtomic,
            tokenContractAddress: intent.tokenContractAddress ?? undefined,
          },
          {
            expectedAmountAtomic: intent.expectedAmountAtomic,
            tokenMint: intent.tokenContractAddress ?? undefined,
            networkMode: intent.networkMode,
          },
        )
        txHash = await submitSolanaTransactionViaProvider(
          solanaProvider,
          tx,
          () => getSolanaConnection(intent.networkMode),
        )
      } else if (isTron) {
        const treasury = requireTreasuryAddress(intent.treasuryAddress, 'tron')
        if (!activeAddress || !tronProvider) {
          throw new Error('No hay una wallet TRON conectada en la pasarela de PouwMiner para autorizar el pago.')
        }
        const tronSessionNs = tronProvider.session?.namespaces?.tron
        const tronClusterParity = validateTronClusterParity({
          caipNetworkId: caipNetwork?.caipNetworkId,
          caipChainId: caipNetwork?.id,
          expectedNetworkMode: intent.networkMode,
          sessionChains: tronSessionNs?.chains,
          sessionAccounts: tronSessionNs?.accounts,
        })
        if (!tronClusterParity.ok) {
          setError(
            tronClusterParity.error ??
              `Tu billetera TRON está en ${tronClusterParity.actualLabel}, pero esta orden requiere ${tronClusterParity.expectedLabel}. Cambia de red en tu billetera antes de firmar.`,
          )
          return
        }
        const tronSignerParity = validateTronSigningParity({
          activeAddress,
          intentSenderWallet: intent.senderWallet,
        })
        if (!tronSignerParity.ok) {
          setError(tronSignerParity.error ?? 'La cuenta TRON conectada no coincide con la cotización activa.')
          return
        }
        const tronTx = await buildTronPaymentTransaction({
          senderAddress: activeAddress,
          recipientAddress: treasury,
          asset: (intent.paymentAsset === 'TRX' ? 'TRX' : 'USDT'),
          expectedAmountAtomic: intent.expectedAmountAtomic,
          tokenContractAddress: intent.tokenContractAddress ?? undefined,
          networkMode: intent.networkMode,
        })
        txHash = await submitTronTransactionViaProvider({
          provider: tronProvider,
          transaction: tronTx,
          senderAddress: activeAddress,
          networkMode: intent.networkMode,
        })
      } else {
        const evmParity = validateEvmSigningParity({
          activeAddress,
          wagmiAddress: evmAddress,
          intentSenderWallet: intent.senderWallet,
        })
        if (!evmParity.ok) {
          setError(evmParity.error ?? 'La cuenta EVM conectada no coincide con la cotización activa.')
          return
        }
        const recipient = requireTreasuryAddress(intent.treasuryAddress, 'evm') as `0x${string}`
        const atomicAmount = parsePositiveAtomicBigInt(intent.expectedAmountAtomic)

        if (intent.paymentAsset === 'USDT') {
          const tokenAddress = intent.tokenContractAddress?.trim() as `0x${string}` | undefined
          if (!tokenAddress) {
            throw new Error('El servidor no devolvió el contrato USDT autoritativo para esta red.')
          }
          if (!isEvmWallet || !isEvmConnected || !writeContractAsync) {
            throw new Error('No hay una wallet EVM conectada en la pasarela de PouwMiner para autorizar el pago en USDT.')
          }
          txHash = await writeContractAsync({
            account: activeAddress as `0x${string}`,
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [recipient, atomicAmount],
            ...(expectedEvmChainId > 0 ? { chainId: expectedEvmChainId } : {}),
          })
        } else {
          if (!isEvmWallet || !isEvmConnected || !sendTransactionAsync) {
            throw new Error('No hay una wallet EVM conectada en la pasarela de PouwMiner para autorizar la transacción.')
          }
          txHash = await sendTransactionAsync({
            account: activeAddress as `0x${string}`,
            to: recipient,
            value: atomicAmount,
            ...(expectedEvmChainId > 0 ? { chainId: expectedEvmChainId } : {}),
          })
        }
      }

      txHash = txHash.trim()
      if (!txHash) {
        throw new Error('La billetera no devolvió el hash de la transacción.')
      }

      const nextLock: BroadcastTxLock = {
        uid: userUid,
        intentId: intent.intentId,
        txHash,
        networkId: intent.paymentNetwork ?? toBackendPaymentNetworkId(effectiveNetworkId),
        networkMode: intent.networkMode,
        broadcastAt: Date.now(),
      }
      writeBroadcastTxLock(nextLock)
      setBroadcastTxLock(nextLock)

      if (activeAddress) {
        void linkWallet(activeAddress).catch(() => undefined)
      }

      const confirmation = await confirmPaymentIntent(intent.intentId, txHash)
      if (shouldClearBroadcastTxLock(confirmation.status)) {
        clearBroadcastTxLock(userUid, intent.intentId)
        setBroadcastTxLock(null)
      }
      setIntent((prev) => prev ? {
        ...prev,
        status: confirmation.status,
        txHash: confirmation.txHash ?? txHash,
        confirmations: confirmation.confirmations ?? prev.confirmations,
        requiredConfirmations: confirmation.requiredConfirmations ?? prev.requiredConfirmations,
        activatedMinerId: confirmation.activatedMinerId ?? prev.activatedMinerId,
        settledAt: confirmation.settledAt ?? prev.settledAt,
      } : prev)
    } catch (err) {
      const classified = classifyPaymentError(err, activeNetworkConfig.name)
      setError(classified.message)
    } finally {
      payInFlightRef.current = false
      if (isMountedRef.current) setPaying(false)
    }
  }

  const currentExplorerUrl = lockedTxHash
    ? buildExplorerTxUrl(
        activeBroadcastTxLock?.networkId ?? intent?.paymentNetwork ?? effectiveNetworkId,
        lockedTxHash,
        activeBroadcastTxLock?.networkMode ?? intent?.networkMode,
      )
    : ''

  return (
    <div className="wallet-checkout-overlay" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <div className="wallet-checkout-modal">
        <div className="checkout-modal-header">
          <div>
            <h2 id="checkout-title">{intent?.packageName || productName}</h2>
            <p className="checkout-subtitle">Pasarela de Pagos PouwMiner · Verificación On-Chain</p>
          </div>
          <button type="button" className="checkout-close-btn" onClick={() => onClose(paying)} aria-label="Cerrar modal">
            ✕
          </button>
        </div>

        {(!user || user.isAnonymous) ? (
          <div className="checkout-auth-gate" data-testid="checkout-auth-gate" style={{ textAlign: 'center', padding: '36px 16px' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>🔒</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', margin: '0 0 8px 0' }}>
              Inicia sesión para continuar
            </h3>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 auto 24px auto', maxWidth: 360, lineHeight: 1.5 }}>
              Para adquirir mineros y vincularlos a tu cuenta de forma segura, necesitas una cuenta registrada.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 300, margin: '0 auto' }}>
              <button
                type="button"
                className="button button-primary"
                data-testid="checkout-signup-btn"
                onClick={() => openAuthModal('register')}
              >
                Crear cuenta (Sign up)
              </button>
              <button
                type="button"
                className="button button-secondary"
                data-testid="checkout-signin-btn"
                onClick={() => openAuthModal('login')}
              >
                Ya tengo cuenta (Sign in)
              </button>
            </div>
          </div>
        ) : intent?.status === 'SETTLED' ? (
          <div className="checkout-receipt-view" data-testid="checkout-settled-view">
            <div className="receipt-success-badge">✓</div>
            <h3>¡Pago liquidado y confirmado!</h3>
            <p className="receipt-desc">
              El servidor verificó tu transacción on-chain y aprovisionó tu compra de forma atómica.
            </p>
            <div className="receipt-details-box">
              <div className="receipt-row">
                <span>Producto:</span>
                <strong>{intent.packageName}</strong>
              </div>
              <div className="receipt-row">
                <span>Importe liquidado:</span>
                <strong>{intent.expectedAmountDisplay} {intent.paymentAsset}</strong>
              </div>
              <div className="receipt-row">
                <span>Red:</span>
                <strong>{activeNetworkConfig.name}</strong>
              </div>
              {intent.txHash && (
                <div className="receipt-row">
                  <span>Hash de transacción:</span>
                  <code className="receipt-hash">{intent.txHash.slice(0, 18)}...</code>
                </div>
              )}
              {intent.activatedMinerId && (
                <div className="receipt-row">
                  <span>Minero activado:</span>
                  <code>{intent.activatedMinerId}</code>
                </div>
              )}
            </div>
            <div className="receipt-actions">
              {currentExplorerUrl && (
                <a
                  href={currentExplorerUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="button button-secondary explorer-link-button"
                >
                  Ver en Explorador de Bloques ↗
                </a>
              )}
              {intent.activatedMinerId ? (
                <button
                  type="button"
                  className="button button-primary receipt-customize-btn"
                  onClick={() => {
                    onClose(false)
                    navigate(`/miners/${intent.activatedMinerId}/customize`)
                  }}
                >
                  Personalizar mi Minero Ahora
                </button>
              ) : (
                <button type="button" className="button button-primary" onClick={() => onClose(false)}>
                  Finalizar
                </button>
              )}
            </div>
          </div>
        ) : intent?.status === 'PROCESSING' ? (
          <div className="checkout-receipt-view" data-testid="checkout-processing-view">
            <div className="receipt-success-badge" style={{ background: '#7c3aed' }}>⏳</div>
            <h3>Verificando confirmaciones on-chain...</h3>
            <p className="receipt-desc">
              Tu transacción fue detectada. Esperando confirmaciones finales en {activeNetworkConfig.name}.
            </p>
            <div className="receipt-details-box">
              <div className="receipt-row">
                <span>Estado:</span>
                <strong>PROCESSING</strong>
              </div>
              <div className="receipt-row">
                <span>Confirmaciones:</span>
                <strong>{intent.confirmations} / {intent.requiredConfirmations}</strong>
              </div>
              {intent.txHash && (
                <div className="receipt-row">
                  <span>Hash:</span>
                  <code className="receipt-hash">{intent.txHash.slice(0, 18)}...</code>
                </div>
              )}
            </div>
            <div className="receipt-actions">
              {currentExplorerUrl && (
                <a
                  href={currentExplorerUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="button button-secondary explorer-link-button"
                >
                  Ver en Explorador ↗
                </a>
              )}
              <button type="button" className="button button-secondary" onClick={() => onClose(true)}>
                Seguir en segundo plano
              </button>
            </div>
          </div>
        ) : intent && (intent.status === 'UNDERPAID' || intent.status === 'FAILED' || intent.status === 'CANCELLED' || (isIntentExpired && !hasBroadcastTxLock)) ? (
          <div className="checkout-receipt-view" data-testid={`checkout-${isIntentExpired ? 'expired' : intent.status.toLowerCase()}-view`}>
            <div className="receipt-success-badge" style={{ background: '#ef4444' }}>!</div>
            <h3>
              {intent.status === 'UNDERPAID'
                ? 'Pago insuficiente (UNDERPAID)'
                : intent.status === 'FAILED'
                  ? 'Transacción fallida (FAILED)'
                  : intent.status === 'CANCELLED'
                    ? 'Orden cancelada (CANCELLED)'
                    : 'Cotización expirada (EXPIRED)'}
            </h3>
            <p className="receipt-desc">
              {intent.status === 'UNDERPAID'
                ? 'El monto recibido on-chain fue menor al monto exacto requerido por la orden.'
                : intent.status === 'FAILED'
                  ? 'La transacción fue revertida o no superó la verificación on-chain.'
                  : intent.status === 'CANCELLED'
                    ? 'Esta orden de pago fue cancelada antes de recibir fondos.'
                    : 'El tiempo de validez (TTL) de la cotización expiró. Genera una nueva cotización para continuar.'}
            </p>
            {error && <div className="checkout-error-banner" role="alert">{error}</div>}
            <div className="receipt-actions">
              {currentExplorerUrl && (
                <a
                  href={currentExplorerUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="button button-secondary explorer-link-button"
                >
                  Ver en Explorador ↗
                </a>
              )}
              <button
                type="button"
                className="button button-primary"
                disabled={loadingIntent || methodUpdating}
                onClick={() => {
                  const freshAsset: PaymentAssetSymbol =
                    useUsdt && Boolean(getPaymentNetworkConfig(effectiveNetworkId, intent?.networkMode).usdtContractAddress)
                      ? 'USDT'
                      : NATIVE_SYMBOL_BY_NETWORK[effectiveNetworkId]
                  void createFreshIntent(effectiveNetworkId, freshAsset, activeAddress)
                }}
              >
                Generar nueva cotización
              </button>
              <button type="button" className="button button-secondary" onClick={() => onClose(false)}>
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <div className="checkout-form-content">
            {!isWalletConnected && !hasBroadcastTxLock ? (
              <div className="checkout-section">
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px', marginBottom: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>Importe autoritativo:</span>
                    <strong style={{ fontSize: 18, color: '#fff' }}>
                      {formatCatalogPrice(intent?.amountUsd ?? amount, 'USD')}
                    </strong>
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: 18 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: '0 0 6px 0' }}>
                    Conecta tu billetera para pagar
                  </h3>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                    Compatible con MetaMask, Phantom, Solflare, Trust Wallet, Coinbase Wallet y +300 wallets.
                  </p>
                </div>

                <button
                  type="button"
                  className="button button-primary checkout-action-btn"
                  style={{ width: '100%', marginBottom: 16 }}
                  onClick={() => openAppKit()}
                >
                  Conectar Billetera
                </button>
              </div>
            ) : (
              <>
                {isWalletConnected && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 10, marginBottom: 12 }}>
                      <div>
                        <strong style={{ fontSize: 12, color: '#22c55e', display: 'block' }}>
                          {isEvmWallet
                            ? 'Billetera EVM conectada'
                            : isTronWallet
                              ? 'Billetera TRON conectada'
                              : 'Billetera Solana conectada'}
                        </strong>
                        <code style={{ fontSize: 11, color: '#e2e8f0' }}>
                          {activeAddress.slice(0, 8)}...{activeAddress.slice(-6)}
                        </code>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(0,0,0,0.3)', padding: '3px 8px', borderRadius: 6 }}>
                          {activeNetworkConfig.name}
                        </span>
                        <button
                          type="button"
                          data-testid="checkout-switch-wallet-btn"
                          className="button button-secondary"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          disabled={paying || cancelling || hasBroadcastTxLock}
                          onClick={() => { void openAppKit() }}
                        >
                          Cambiar billetera
                        </button>
                      </div>
                    </div>

                    <div className="checkout-section">
                      <label className="checkout-label">1. Red de pago</label>
                      <div className="checkout-network-grid">
                        {enabledNetworks.map((net) => (
                          <button
                            key={net.id}
                            type="button"
                            className={`network-chip-btn ${effectiveNetworkId === net.id ? 'network-chip-active' : ''}`}
                            disabled={loadingIntent || methodUpdating || paying || cancelling || retryingVerification || hasBroadcastTxLock}
                            onClick={() => {
                              hasManualNetworkSelectionRef.current = true
                              const nextUseUsdt = resolveNetworkSelectionUseUsdt({
                                currentUseUsdt: useUsdt,
                                hasTargetUsdtContract: Boolean(getPaymentNetworkConfig(net.id, intent?.networkMode).usdtContractAddress),
                                isWalletConnected,
                                isTargetFamilyCompatible: isWalletFamilyCompatibleWithNetwork({
                                  networkId: net.id,
                                  isEvmWallet,
                                  isSolanaWallet,
                                  isTronWallet,
                                }),
                              })
                              void handleSelectNetworkOrAsset(net.id, nextUseUsdt)
                            }}
                          >
                            <CryptoIcon symbol={net.icon} size="sm" />
                            <span>{net.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="checkout-section">
                      <label className="checkout-label">2. Moneda de pago</label>
                      <div className="currency-selector-row">
                        <button
                          type="button"
                          className={`currency-pill-btn ${useUsdt ? 'currency-pill-active' : ''}`}
                          disabled={loadingIntent || methodUpdating || paying || cancelling || retryingVerification || hasBroadcastTxLock || isWrongWalletFamily}
                          onClick={() => void handleSelectNetworkOrAsset(effectiveNetworkId, true)}
                        >
                          <CryptoIcon symbol="USDT" size="sm" />
                          <span>
                            Tether USD (USDT{' '}
                            {effectiveNetworkId === 'tron'
                              ? 'TRC-20'
                              : effectiveNetworkId === 'solana'
                                ? 'SPL'
                                : effectiveNetworkId === 'bnb'
                                  ? 'BEP-20'
                                  : 'ERC-20'}
                            )
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`currency-pill-btn ${!useUsdt ? 'currency-pill-active' : ''}`}
                          disabled={loadingIntent || methodUpdating || paying || cancelling || retryingVerification || hasBroadcastTxLock || isWrongWalletFamily}
                          onClick={() => void handleSelectNetworkOrAsset(effectiveNetworkId, false)}
                        >
                          <CryptoIcon symbol={NATIVE_SYMBOL_BY_NETWORK[effectiveNetworkId] as CryptoSymbol} size="sm" />
                          <span>Moneda Nativa ({NATIVE_SYMBOL_BY_NETWORK[effectiveNetworkId]})</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className="checkout-quote-card">
                  {isWrongWalletFamily && !hasBroadcastTxLock ? (
                    <div data-testid="checkout-wrong-wallet-family-notice" role="status" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <strong style={{ fontSize: 13, color: '#fbbf24' }}>
                        Billetera incompatible con {selectedNetworkConfig.name}
                      </strong>
                      <p style={{ fontSize: 12, color: '#e2e8f0', margin: 0, lineHeight: 1.45 }}>
                        Tu billetera actual es {connectedWalletLabel}. Para pagar en {selectedNetworkConfig.name}, cambia a una billetera compatible con {requiredWalletLabel}.
                      </p>
                    </div>
                  ) : loadingIntent || methodUpdating ? (
                    <QuoteDetailsSkeleton />
                  ) : intent && intent.status === 'AWAITING' && intent.treasuryAddress ? (
                    <>
                      <div className="quote-header-row">
                        <span className="quote-asset-pill">
                          {intent.expectedAmountDisplay} {intent.paymentAsset}
                        </span>
                        <span className="quote-fiat-reference">
                          {formatCatalogPrice(intent.amountUsd, 'USD')}
                        </span>
                      </div>
                      <div className="quote-breakdown-details">
                        <div className="quote-line">
                          <span>Tesorería autoritativa:</span>
                          <code className="quote-address" onClick={() => handleCopy(intent.treasuryAddress!)} title="Haz clic para copiar">
                            {intent.treasuryAddress.slice(0, 8)}...{intent.treasuryAddress.slice(-6)}
                          </code>
                        </div>
                        <div className="quote-line">
                          <span>Validez (TTL):</span>
                          <strong>{formatCountdown(remainingMs)}</strong>
                        </div>
                        <div className="quote-line">
                          <span>Confirmaciones requeridas:</span>
                          <span>{intent.requiredConfirmations}</span>
                        </div>
                      </div>
                    </>
                  ) : error ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p className="quote-error-text">No se pudo obtener la cotización autoritativa del servidor.</p>
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={loadingIntent || methodUpdating}
                        onClick={() => {
                          if (!intent) {
                            setError('')
                            setInitRetryNonce((n) => n + 1)
                            return
                          }
                          if (canMutateIntentMethodInPlace(intent, Date.now())) {
                            failedSyncKeyRef.current = null
                            const retryUseUsdt =
                              useUsdt && Boolean(getPaymentNetworkConfig(effectiveNetworkId, intent.networkMode).usdtContractAddress)
                            void handleSelectNetworkOrAsset(effectiveNetworkId, retryUseUsdt)
                            return
                          }
                          setNowMs(Date.now())
                        }}
                      >
                        Reintentar cotización
                      </button>
                    </div>
                  ) : (
                    <p className="quote-error-text">Preparando cotización autoritativa del servidor...</p>
                  )}
                </div>

                {copyStatus && <p className="copy-notice-text">{copyStatus}</p>}
                {error && <div className="checkout-error-banner" role="alert">{error}</div>}

                {hasBroadcastTxLock && (
                  <div
                    data-testid="checkout-broadcast-lock-banner"
                    role="status"
                    style={{
                      background: showCalmAutoVerify ? 'rgba(124, 58, 237, 0.14)' : 'rgba(245, 158, 11, 0.12)',
                      border: showCalmAutoVerify ? '1px solid rgba(139, 92, 246, 0.45)' : '1px solid rgba(245, 158, 11, 0.45)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      marginBottom: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <strong style={{ fontSize: 13, color: showCalmAutoVerify ? '#c4b5fd' : '#fbbf24' }}>
                      {showCalmAutoVerify
                        ? 'Transacción enviada — esperando confirmación de la red...'
                        : 'Transacción ya enviada on-chain (pago bloqueado para evitar doble cobro)'}
                    </strong>
                    <p style={{ fontSize: 12, color: '#e2e8f0', margin: 0, lineHeight: 1.45 }}>
                      {showCalmAutoVerify
                        ? 'Tu pago ya fue emitido on-chain y está protegido contra doble cobro. Detectaremos la confirmación automáticamente en unos segundos.'
                        : 'Tu billetera ya emitió esta transferencia. No vuelvas a firmar un pago nuevo; reintenta la verificación on-chain para completar la acreditación.'}
                    </p>
                    <code style={{ fontSize: 11, color: '#cbd5e1' }}>
                      Hash: {lockedTxHash.slice(0, 18)}...{lockedTxHash.slice(-8)}
                    </code>
                    {currentExplorerUrl && (
                      <a
                        href={currentExplorerUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="button button-secondary explorer-link-button"
                      >
                        Ver transacción en Explorador ↗
                      </a>
                    )}
                  </div>
                )}

                <div className="checkout-cta-box">
                  {hasBroadcastTxLock ? (
                    <button
                      type="button"
                      data-testid="checkout-retry-verification-btn"
                      className="button button-primary checkout-action-btn"
                      disabled={retryingVerification || paying}
                      onClick={() => void handleRetryVerification()}
                    >
                      {retryingVerification || paying ? 'Verificando transacción on-chain...' : 'Reintentar verificación on-chain'}
                    </button>
                  ) : isWrongWalletFamily ? (
                    <button
                      type="button"
                      data-testid="checkout-switch-wallet-family-btn"
                      className="button button-primary checkout-action-btn"
                      disabled={paying || cancelling || hasBroadcastTxLock}
                      onClick={() => {
                        void openAppKit({ namespace: getAppKitNamespaceForFamily(selectedNetworkFamily) })
                      }}
                    >
                      Cambiar a billetera {requiredWalletLabel}
                    </button>
                  ) : isWrongEvmChain ? (
                    <button
                      type="button"
                      className="button button-secondary checkout-action-btn"
                      onClick={handleSwitchNetwork}
                    >
                      Cambiar a {activeNetworkConfig.name} en tu billetera
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button button-primary checkout-action-btn"
                        disabled={!intent || intent.status !== 'AWAITING' || isWrongWalletFamily || hasNetworkSelectionMismatch || loadingIntent || methodUpdating || paying || cancelling || isIntentExpired}
                        onClick={handlePay}
                      >
                        {paying
                          ? 'Firmando y verificando on-chain...'
                          : `Pagar ${intent?.expectedAmountDisplay ?? ''} ${intent?.paymentAsset ?? selectedAsset}`}
                      </button>
                      {canCancel && (
                        <button
                          type="button"
                          className="button button-secondary checkout-action-btn"
                          style={{ marginTop: 8 }}
                          disabled={cancelling || paying || loadingIntent || methodUpdating}
                          onClick={handleCancelIntent}
                        >
                          {cancelling ? 'Cancelando orden...' : 'Cancelar orden de pago'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
