import type { BackendPaymentNetworkId } from '../../paymentDestinations'
import type { PaymentAssetSymbol, PaymentIntentRecord, PaymentProductType } from './paymentGatewayClient'

export interface CheckoutProductSignatureInput {
  uid?: string | null
  productType: PaymentProductType
  packageId?: string | null
  powerTh?: number | null
}

export interface PendingMethodSyncInput {
  intent: Pick<PaymentIntentRecord, 'intentId' | 'status' | 'txHash' | 'expiresAt' | 'isExpired' | 'senderWallet'> | null | undefined
  isWalletConnected: boolean
  isEvmWallet: boolean
  activeAddress: string
  targetNetworkId: BackendPaymentNetworkId
  targetAsset: PaymentAssetSymbol
  failedSyncKey: string | null
  nowMs?: number
}

const inFlightIntentInits = new Map<string, Promise<unknown>>()

/** Generates a backend-compatible idempotency key (`chk_<32hex>`) matching /^[a-zA-Z0-9._:-]{8,128}$/. */
export function generateCheckoutIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `chk_${cryptoApi.randomUUID().replace(/-/g, '')}`
  }
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    cryptoApi.getRandomValues(bytes)
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `chk_${hex}`
  }
  const fallback = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`
    .replace(/[^a-f0-9]/gi, '')
    .padEnd(32, '0')
    .slice(0, 32)
  return `chk_${fallback}`
}

/** Builds a stable signature tying a checkout session key to (uid, productType, packageId, powerTh). */
export function buildCheckoutProductSignature(input: CheckoutProductSignatureInput): string {
  const uid = input.uid?.trim() ?? ''
  const packageId = input.packageId?.trim() ?? ''
  const powerTh =
    typeof input.powerTh === 'number' && Number.isFinite(input.powerTh) && input.powerTh > 0
      ? String(input.powerTh)
      : ''
  return `${uid}|${input.productType}|${packageId}|${powerTh}`
}

/** True strictly when a PaymentIntent can mutate its payment method in-place without cancel/recreate. */
export function canMutateIntentMethodInPlace(
  intent: Pick<PaymentIntentRecord, 'status' | 'txHash' | 'expiresAt' | 'isExpired'> | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!intent) return false
  if (intent.status !== 'OPEN' && intent.status !== 'AWAITING') return false
  if (typeof intent.txHash === 'string' ? intent.txHash.trim().length > 0 : Boolean(intent.txHash)) return false
  if (intent.isExpired) return false
  if (intent.expiresAt) {
    const expiresAtMs = Date.parse(intent.expiresAt)
    if (Number.isFinite(expiresAtMs) && nowMs > expiresAtMs) return false
  }
  return true
}

/** Returns a deterministic sync key when Step 2 must call selectPaymentMethod in-place, or null when idle or suppressed. */
export function resolvePendingMethodSyncKey(input: PendingMethodSyncInput): string | null {
  const {
    intent,
    isWalletConnected,
    isEvmWallet,
    activeAddress,
    targetNetworkId,
    targetAsset,
    failedSyncKey,
    nowMs = Date.now(),
  } = input
  if (!intent || !isWalletConnected || !canMutateIntentMethodInPlace(intent, nowMs)) {
    return null
  }
  const cleanAddress = activeAddress.trim()
  const intentSender = intent.senderWallet?.trim() ?? ''
  const sameSenderWallet = Boolean(
    intentSender &&
    cleanAddress &&
    (isEvmWallet
      ? intentSender.toLowerCase() === cleanAddress.toLowerCase()
      : intentSender === cleanAddress),
  )
  const needsInitialSelection = intent.status === 'OPEN'
  const needsWalletSync = intent.status === 'AWAITING' && Boolean(cleanAddress) && !sameSenderWallet
  if (!needsInitialSelection && !needsWalletSync) {
    return null
  }
  const syncKey = `${intent.intentId}|${intent.status}|${targetNetworkId}|${targetAsset}|${cleanAddress}`
  if (failedSyncKey === syncKey) {
    return null
  }
  return syncKey
}

/** Coalesces concurrent init calls sharing the same session key (e.g. React.StrictMode double mount). */
export function runDeduplicatedIntentInit<T>(
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const cleanKey = key.trim()
  if (!cleanKey) {
    return factory()
  }
  const existing = inFlightIntentInits.get(cleanKey)
  if (existing) {
    return existing as Promise<T>
  }
  let tracked!: Promise<T>
  tracked = Promise.resolve()
    .then(() => factory())
    .finally(() => {
      if (inFlightIntentInits.get(cleanKey) === tracked) {
        inFlightIntentInits.delete(cleanKey)
      }
    })
  inFlightIntentInits.set(cleanKey, tracked)
  return tracked
}

export interface MultichainWalletInput {
  appKitAddress?: string | null
  isAppKitConnected: boolean
  appKitCaipAddress?: string | null
  caipNamespace?: string | null
  wagmiAddress?: string | null
  isWagmiConnected: boolean
  fallbackAddress?: string | null
}

export interface ResolvedMultichainWallet {
  activeAddress: string
  isWalletConnected: boolean
  isEvmWallet: boolean
  isSolanaWallet: boolean
}

/**
 * Resolves the active multichain wallet (Wagmi EVM vs Reown AppKit Solana) without letting a dormant
 * Wagmi connection hijack an active Solana session in AppKit.
 */
export function resolveActiveMultichainWallet(input: MultichainWalletInput): ResolvedMultichainWallet {
  const appKitAddr = input.appKitAddress?.trim() || ''
  const wagmiAddr = input.wagmiAddress?.trim() || ''
  const fallbackAddr = input.fallbackAddress?.trim() || ''

  if (input.isAppKitConnected && appKitAddr) {
    const isSolanaActive =
      input.caipNamespace === 'solana' ||
      Boolean(input.appKitCaipAddress?.startsWith('solana:')) ||
      !appKitAddr.startsWith('0x')
    return {
      activeAddress: appKitAddr,
      isWalletConnected: true,
      isEvmWallet: !isSolanaActive,
      isSolanaWallet: isSolanaActive,
    }
  }

  if (input.isWagmiConnected && wagmiAddr) {
    return {
      activeAddress: wagmiAddr,
      isWalletConnected: true,
      isEvmWallet: true,
      isSolanaWallet: false,
    }
  }

  if (fallbackAddr) {
    const isSolanaFallback = !fallbackAddr.startsWith('0x')
    return {
      activeAddress: fallbackAddr,
      isWalletConnected: true,
      isEvmWallet: !isSolanaFallback,
      isSolanaWallet: isSolanaFallback,
    }
  }

  return {
    activeAddress: '',
    isWalletConnected: false,
    isEvmWallet: false,
    isSolanaWallet: false,
  }
}

export interface SolanaWalletProviderLike {
  signAndSendTransaction?: (transaction: unknown) => Promise<string | { signature?: string }>
  sendTransaction?: (transaction: unknown, connection: unknown) => Promise<string>
  signTransaction?: (transaction: unknown) => Promise<{ serialize: () => Uint8Array }>
}

export interface SolanaConnectionLike {
  sendRawTransaction: (rawTransaction: Uint8Array) => Promise<string>
}

function isUnsupportedSolanaMethodError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const errObj = err as { name?: unknown; message?: unknown; constructor?: { name?: unknown } }
  const ctorName = typeof errObj.constructor?.name === 'string' ? errObj.constructor.name : ''
  const errName = typeof errObj.name === 'string' ? errObj.name : ''
  const msg = typeof errObj.message === 'string' ? errObj.message : ''
  return (
    ctorName === 'WalletStandardFeatureNotSupportedError' ||
    ctorName === 'WalletConnectMethodNotSupportedError' ||
    errName === 'WalletStandardFeatureNotSupportedError' ||
    errName === 'WalletConnectMethodNotSupportedError' ||
    /does not support the ["'][^"']+["'] feature|method ["'][^"']+["'] is not supported/i.test(msg)
  )
}

/**
 * Submits a Solana transaction via a Reown AppKit provider, falling back to sendTransaction or
 * signTransaction + sendRawTransaction strictly when the wallet reports an unsupported feature/method
 * (never on user rejection or post-sign RPC failure).
 */
export async function submitSolanaTransactionViaProvider(
  provider: SolanaWalletProviderLike,
  transaction: unknown,
  getConnection: () => Promise<SolanaConnectionLike>,
): Promise<string> {
  if (typeof provider.signAndSendTransaction === 'function') {
    try {
      const res = await provider.signAndSendTransaction(transaction)
      return typeof res === 'string' ? res : (res?.signature ?? '')
    } catch (err) {
      if (!isUnsupportedSolanaMethodError(err)) throw err
    }
  }
  if (typeof provider.sendTransaction === 'function') {
    try {
      const connection = await getConnection()
      return await provider.sendTransaction(transaction, connection)
    } catch (err) {
      if (!isUnsupportedSolanaMethodError(err)) throw err
    }
  }
  if (typeof provider.signTransaction === 'function') {
    const connection = await getConnection()
    const signedTx = await provider.signTransaction(transaction)
    return await connection.sendRawTransaction(signedTx.serialize())
  }
  throw new Error('La billetera Solana conectada no soporta firma directa en Reown AppKit.')
}
