import {
  isValidEvmAddress,
  isValidSolanaAddress,
  isValidTronAddress,
  type BackendPaymentNetworkId,
  type PaymentNetworkMode,
} from '../../paymentDestinations.ts'
import type { PaymentAssetSymbol, PaymentIntentRecord, PaymentIntentStatus, PaymentProductType } from './paymentGatewayClient'

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
  tronAppKitAddress?: string | null
  isTronAppKitConnected?: boolean
  tronAppKitCaipAddress?: string | null
}

export interface ResolvedMultichainWallet {
  activeAddress: string
  isWalletConnected: boolean
  isEvmWallet: boolean
  isSolanaWallet: boolean
  isTronWallet: boolean
}

const DISCONNECTED_WALLET: ResolvedMultichainWallet = {
  activeAddress: '',
  isWalletConnected: false,
  isEvmWallet: false,
  isSolanaWallet: false,
  isTronWallet: false,
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** Validates a Solana Ed25519 address via isValidSolanaAddress and exact 32-byte Base58 length (rejects 25-byte TRON/BTC addresses). */
function isStrictSolanaAddress(address: string): boolean {
  if (!isValidSolanaAddress(address)) return false
  const trimmed = address.trim()
  let leadingZeros = 0
  while (leadingZeros < trimmed.length && trimmed[leadingZeros] === '1') {
    leadingZeros += 1
  }
  let value = 0n
  for (let i = leadingZeros; i < trimmed.length; i += 1) {
    const digit = BASE58_ALPHABET.indexOf(trimmed[i])
    if (digit < 0) return false
    value = value * 58n + BigInt(digit)
  }
  let valueBytes = 0
  while (value > 0n) {
    value >>= 8n
    valueBytes += 1
  }
  return leadingZeros + valueBytes === 32
}

/**
 * Resolves the active multichain wallet (EVM vs Solana vs TRON) with strict namespace
 * isolation and address validation, preventing dormant Wagmi hijack and snapshot-tear mislabeling.
 */
export function resolveActiveMultichainWallet(input: MultichainWalletInput): ResolvedMultichainWallet {
  const appKitAddr = input.appKitAddress?.trim() || ''
  const wagmiAddr = input.wagmiAddress?.trim() || ''
  const fallbackAddr = input.fallbackAddress?.trim() || ''
  const caipAddress = input.appKitCaipAddress?.trim() || ''
  const tronAddr = input.tronAppKitAddress?.trim() || ''
  const tronCaipAddr = input.tronAppKitCaipAddress?.trim() || ''
  const hasValidTronNamespaceAccount = Boolean(
    input.isTronAppKitConnected &&
    tronAddr &&
    isValidTronAddress(tronAddr) &&
    (!tronCaipAddr || tronCaipAddr.startsWith('tron:')),
  )
  const isSolanaNamespace = input.caipNamespace === 'solana' || caipAddress.startsWith('solana:')
  const isTronNamespace = input.caipNamespace === 'tron' || caipAddress.startsWith('tron:')
  const isEvmNamespace = input.caipNamespace === 'eip155' || caipAddress.startsWith('eip155:')

  if (input.caipNamespace === 'solana' && !input.isAppKitConnected) {
    return DISCONNECTED_WALLET
  }

  if (input.caipNamespace === 'tron' && !input.isAppKitConnected) {
    return hasValidTronNamespaceAccount
      ? { activeAddress: tronAddr, isWalletConnected: true, isEvmWallet: false, isSolanaWallet: false, isTronWallet: true }
      : DISCONNECTED_WALLET
  }

  if (input.isAppKitConnected && appKitAddr) {
    const activeNamespaceCount = Number(isSolanaNamespace) + Number(isTronNamespace) + Number(isEvmNamespace)
    if (activeNamespaceCount > 1) {
      return DISCONNECTED_WALLET
    }
    if (isTronNamespace) {
      return isValidTronAddress(appKitAddr)
        ? { activeAddress: appKitAddr, isWalletConnected: true, isEvmWallet: false, isSolanaWallet: false, isTronWallet: true }
        : DISCONNECTED_WALLET
    }
    if (isSolanaNamespace) {
      return isStrictSolanaAddress(appKitAddr)
        ? { activeAddress: appKitAddr, isWalletConnected: true, isEvmWallet: false, isSolanaWallet: true, isTronWallet: false }
        : DISCONNECTED_WALLET
    }
    if (isEvmNamespace) {
      return isValidEvmAddress(appKitAddr)
        ? { activeAddress: appKitAddr, isWalletConnected: true, isEvmWallet: true, isSolanaWallet: false, isTronWallet: false }
        : DISCONNECTED_WALLET
    }
    if (isValidEvmAddress(appKitAddr)) {
      return { activeAddress: appKitAddr, isWalletConnected: true, isEvmWallet: true, isSolanaWallet: false, isTronWallet: false }
    }
    if (isStrictSolanaAddress(appKitAddr)) {
      return { activeAddress: appKitAddr, isWalletConnected: true, isEvmWallet: false, isSolanaWallet: true, isTronWallet: false }
    }
    return DISCONNECTED_WALLET
  }

  if (
    input.isWagmiConnected &&
    wagmiAddr &&
    input.caipNamespace !== 'solana' &&
    input.caipNamespace !== 'tron' &&
    isValidEvmAddress(wagmiAddr)
  ) {
    return {
      activeAddress: wagmiAddr,
      isWalletConnected: true,
      isEvmWallet: true,
      isSolanaWallet: false,
      isTronWallet: false,
    }
  }

  // Fallback for TRON-only WalletConnect sessions when AppKit default activeChain is still eip155.
  if (hasValidTronNamespaceAccount && input.caipNamespace !== 'solana') {
    return {
      activeAddress: tronAddr,
      isWalletConnected: true,
      isEvmWallet: false,
      isSolanaWallet: false,
      isTronWallet: true,
    }
  }

  if (fallbackAddr) {
    if (isValidEvmAddress(fallbackAddr) && input.caipNamespace !== 'solana' && input.caipNamespace !== 'tron') {
      return { activeAddress: fallbackAddr, isWalletConnected: true, isEvmWallet: true, isSolanaWallet: false, isTronWallet: false }
    }
    if (isStrictSolanaAddress(fallbackAddr) && input.caipNamespace !== 'eip155' && input.caipNamespace !== 'tron') {
      return { activeAddress: fallbackAddr, isWalletConnected: true, isEvmWallet: false, isSolanaWallet: true, isTronWallet: false }
    }
    if (isValidTronAddress(fallbackAddr) && isTronNamespace) {
      return { activeAddress: fallbackAddr, isWalletConnected: true, isEvmWallet: false, isSolanaWallet: false, isTronWallet: true }
    }
  }

  return DISCONNECTED_WALLET
}

export const BROADCAST_TX_LOCK_PREFIX = 'pouw_checkout_broadcast_tx'

export interface BroadcastTxLock {
  uid: string
  intentId: string
  txHash: string
  networkId: BackendPaymentNetworkId
  networkMode: PaymentNetworkMode
  broadcastAt: number
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const VALID_BACKEND_NETWORK_IDS = new Set<BackendPaymentNetworkId>([
  'bsc',
  'tron',
  'polygon',
  'solana',
  'arbitrum',
  'optimism',
  'avalanche',
  'ethereum',
])
const TERMINAL_LOCK_CLEAR_STATUSES = new Set<PaymentIntentStatus>([
  'SETTLED',
  'FAILED',
  'UNDERPAID',
  'EXPIRED',
  'CANCELLED',
])

function resolveSessionStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage ?? null
  } catch {
    return null
  }
}

function buildBroadcastTxLockKey(uid: string, intentId: string): string | null {
  const cleanUid = uid.trim()
  const cleanIntentId = intentId.trim()
  if (!cleanUid || !cleanIntentId) return null
  return `${BROADCAST_TX_LOCK_PREFIX}:${cleanUid}:${cleanIntentId}`
}

export function readBroadcastTxLock(
  uid: string,
  intentId: string,
  storage?: StorageLike | null,
): BroadcastTxLock | null {
  const cleanUid = uid.trim()
  const cleanIntentId = intentId.trim()
  const key = buildBroadcastTxLockKey(cleanUid, cleanIntentId)
  const target = resolveSessionStorage(storage)
  if (!key || !target) return null
  try {
    const raw = target.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BroadcastTxLock> | null
    if (!parsed || typeof parsed !== 'object') return null
    const txHash = typeof parsed.txHash === 'string' ? parsed.txHash.trim() : ''
    if (
      parsed.uid !== cleanUid ||
      parsed.intentId !== cleanIntentId ||
      !txHash ||
      !parsed.networkId ||
      !VALID_BACKEND_NETWORK_IDS.has(parsed.networkId) ||
      (parsed.networkMode !== 'mainnet' && parsed.networkMode !== 'testnet') ||
      typeof parsed.broadcastAt !== 'number' ||
      !Number.isFinite(parsed.broadcastAt)
    ) {
      return null
    }
    return {
      uid: cleanUid,
      intentId: cleanIntentId,
      txHash,
      networkId: parsed.networkId,
      networkMode: parsed.networkMode,
      broadcastAt: parsed.broadcastAt,
    }
  } catch {
    return null
  }
}

export function writeBroadcastTxLock(
  lock: BroadcastTxLock,
  storage?: StorageLike | null,
): boolean {
  const cleanUid = lock.uid.trim()
  const cleanIntentId = lock.intentId.trim()
  const cleanTxHash = lock.txHash.trim()
  const key = buildBroadcastTxLockKey(cleanUid, cleanIntentId)
  const target = resolveSessionStorage(storage)
  if (!key || !target || !cleanTxHash || !VALID_BACKEND_NETWORK_IDS.has(lock.networkId)) {
    return false
  }
  try {
    target.setItem(
      key,
      JSON.stringify({
        uid: cleanUid,
        intentId: cleanIntentId,
        txHash: cleanTxHash,
        networkId: lock.networkId,
        networkMode: lock.networkMode,
        broadcastAt: lock.broadcastAt,
      }),
    )
    return true
  } catch {
    return false
  }
}

export function clearBroadcastTxLock(
  uid: string,
  intentId: string,
  storage?: StorageLike | null,
): void {
  const key = buildBroadcastTxLockKey(uid, intentId)
  const target = resolveSessionStorage(storage)
  if (!key || !target) return
  try {
    target.removeItem(key)
  } catch {
    // Storage cleanup errors must never break checkout flow.
  }
}

export function shouldClearBroadcastTxLock(status: PaymentIntentStatus | null | undefined): boolean {
  return Boolean(status && TERMINAL_LOCK_CLEAR_STATUSES.has(status))
}

export const POST_BROADCAST_AUTO_VERIFY_INTERVAL_MS = 4000
export const POST_BROADCAST_AUTO_VERIFY_MAX_ATTEMPTS = 15

export interface PostBroadcastAutoVerifyInput {
  intentStatus: PaymentIntentStatus | null | undefined
  lockedTxHash: string | null | undefined
  isPaying: boolean
  attemptsUsed: number
}

/** True strictly while a broadcast-locked AWAITING intent should silently auto-verify on-chain. */
export function shouldAutoVerifyBroadcastIntent(input: PostBroadcastAutoVerifyInput): boolean {
  return (
    input.intentStatus === 'AWAITING' &&
    typeof input.lockedTxHash === 'string' &&
    input.lockedTxHash.trim().length > 0 &&
    !input.isPaying &&
    Number.isInteger(input.attemptsUsed) &&
    input.attemptsUsed >= 0 &&
    input.attemptsUsed < POST_BROADCAST_AUTO_VERIFY_MAX_ATTEMPTS
  )
}

export interface EvmSigningParityInput {
  activeAddress?: string | null
  wagmiAddress?: string | null
  intentSenderWallet?: string | null
}

export interface EvmSigningParityResult {
  ok: boolean
  error?: string
}

export function validateEvmSigningParity(input: EvmSigningParityInput): EvmSigningParityResult {
  const active = input.activeAddress?.trim() || ''
  const wagmi = input.wagmiAddress?.trim() || ''
  const sender = input.intentSenderWallet?.trim() || ''
  if (!isValidEvmAddress(active) || !isValidEvmAddress(wagmi)) {
    return {
      ok: false,
      error: 'La billetera EVM conectada no tiene una dirección válida. Reconecta tu billetera antes de firmar.',
    }
  }
  if (active.toLowerCase() !== wagmi.toLowerCase()) {
    return {
      ok: false,
      error: 'La cuenta activa en Reown AppKit no coincide con el firmante EVM de tu billetera. Reconecta o sincroniza tu cuenta antes de pagar.',
    }
  }
  if (sender && (!isValidEvmAddress(sender) || sender.toLowerCase() !== active.toLowerCase())) {
    return {
      ok: false,
      error: 'La cuenta EVM conectada no coincide con la dirección registrada en la cotización. Actualiza la cotización o cambia a la cuenta autorizada.',
    }
  }
  return { ok: true }
}

export interface SolanaClusterParityInput {
  caipNetworkId?: string | null
  caipChainId?: string | number | null
  expectedNetworkMode: PaymentNetworkMode
}

export interface SolanaClusterParityResult {
  ok: boolean
  expectedLabel: string
  actualLabel: string
  error?: string
}

const SOLANA_MAINNET_IDS = new Set([
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'solana-mainnet',
  'mainnet-beta',
])
const SOLANA_DEVNET_IDS = new Set([
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  'solana-devnet',
  'devnet',
])
const SOLANA_TESTNET_IDS = new Set([
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
  'solana-testnet',
  'testnet',
])

function classifySolanaClusterToken(raw: string): { mode: PaymentNetworkMode | null; label: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { mode: null, label: 'red Solana no detectada' }
  if (trimmed.includes(':') && !trimmed.startsWith('solana:')) {
    return { mode: null, label: trimmed }
  }
  const token = trimmed.startsWith('solana:') ? trimmed.slice('solana:'.length).trim() : trimmed
  if (SOLANA_MAINNET_IDS.has(token)) return { mode: 'mainnet', label: 'Solana Mainnet' }
  if (SOLANA_DEVNET_IDS.has(token)) return { mode: 'testnet', label: 'Solana Devnet' }
  if (SOLANA_TESTNET_IDS.has(token)) return { mode: null, label: 'Solana Testnet' }
  return { mode: null, label: trimmed }
}

export function validateSolanaClusterParity(input: SolanaClusterParityInput): SolanaClusterParityResult {
  const expectedLabel = input.expectedNetworkMode === 'mainnet' ? 'Solana Mainnet' : 'Solana Devnet'
  const caipNetRaw = typeof input.caipNetworkId === 'string' ? input.caipNetworkId.trim() : ''
  const chainIdRaw = input.caipChainId !== undefined && input.caipChainId !== null ? String(input.caipChainId).trim() : ''

  if (!caipNetRaw && !chainIdRaw) {
    const actualLabel = 'red Solana no detectada'
    return {
      ok: false,
      expectedLabel,
      actualLabel,
      error: `No se pudo confirmar la red activa de tu billetera Solana. Asegúrate de seleccionar ${expectedLabel} en Reown AppKit antes de firmar.`,
    }
  }

  const netRes = caipNetRaw ? classifySolanaClusterToken(caipNetRaw) : null
  const chainRes = chainIdRaw ? classifySolanaClusterToken(chainIdRaw) : null

  if (netRes && chainRes && netRes.label !== chainRes.label) {
    const actualLabel = `${netRes.label} / ${chainRes.label}`
    return {
      ok: false,
      expectedLabel,
      actualLabel,
      error: `Red Solana inconsistente (${actualLabel}). Selecciona ${expectedLabel} en tu billetera antes de firmar.`,
    }
  }

  const resolved = netRes ?? chainRes!
  if (resolved.mode === input.expectedNetworkMode) {
    return { ok: true, expectedLabel, actualLabel: resolved.label }
  }

  return {
    ok: false,
    expectedLabel,
    actualLabel: resolved.label,
    error: `Tu billetera Solana está conectada a ${resolved.label}, pero esta orden requiere ${expectedLabel}. Cambia de red en tu billetera antes de firmar.`,
  }
}

export interface TronSigningParityInput {
  activeAddress?: string | null
  intentSenderWallet?: string | null
}

export interface TronSigningParityResult {
  ok: boolean
  error?: string
}

export function validateTronSigningParity(input: TronSigningParityInput): TronSigningParityResult {
  const active = input.activeAddress?.trim() || ''
  const sender = input.intentSenderWallet?.trim() || ''
  if (!isValidTronAddress(active)) {
    return {
      ok: false,
      error: 'La billetera TRON conectada no tiene una dirección Base58Check válida. Reconecta tu billetera antes de firmar.',
    }
  }
  if (sender && (!isValidTronAddress(sender) || sender !== active)) {
    return {
      ok: false,
      error: 'La cuenta TRON conectada no coincide con la dirección registrada en la cotización. Actualiza la cotización o cambia a la cuenta autorizada.',
    }
  }
  return { ok: true }
}

export interface TronClusterParityInput {
  caipNetworkId?: string | null
  caipChainId?: string | number | null
  expectedNetworkMode: PaymentNetworkMode
  sessionChains?: readonly string[] | null
  sessionAccounts?: readonly string[] | null
}

export interface TronClusterParityResult {
  ok: boolean
  expectedLabel: string
  actualLabel: string
  error?: string
}

const TRON_MAINNET_IDS = new Set(['0x2b6653dc', 'tron-mainnet', 'mainnet'])
const TRON_NILE_IDS = new Set(['0xcd8690dc', 'tron-nile', 'nile'])
const TRON_SHASTA_IDS = new Set(['0x94a9059e', 'tron-shasta', 'shasta'])

function classifyTronClusterToken(raw: string): { mode: PaymentNetworkMode | null; label: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { mode: null, label: 'red TRON no detectada' }
  if (trimmed.includes(':') && !trimmed.toLowerCase().startsWith('tron:')) {
    return { mode: null, label: trimmed }
  }
  const token = trimmed.toLowerCase().startsWith('tron:')
    ? trimmed.slice('tron:'.length).trim().toLowerCase()
    : trimmed.toLowerCase()
  if (TRON_MAINNET_IDS.has(token)) return { mode: 'mainnet', label: 'TRON Mainnet' }
  if (TRON_NILE_IDS.has(token)) return { mode: 'testnet', label: 'TRON Nile' }
  if (TRON_SHASTA_IDS.has(token)) return { mode: null, label: 'TRON Shasta' }
  return { mode: null, label: trimmed }
}

export function validateTronClusterParity(input: TronClusterParityInput): TronClusterParityResult {
  const expectedLabel = input.expectedNetworkMode === 'mainnet' ? 'TRON Mainnet' : 'TRON Nile'

  // Inspect actual WalletConnect session chains/accounts first so AppKit's fallbackCaipNetwork cannot mask a cluster mismatch.
  const sessionTokens: string[] = []
  if (Array.isArray(input.sessionChains)) {
    for (const chain of input.sessionChains) {
      if (typeof chain === 'string' && chain.trim()) sessionTokens.push(chain.trim())
    }
  }
  if (Array.isArray(input.sessionAccounts)) {
    for (const acc of input.sessionAccounts) {
      if (typeof acc === 'string' && acc.trim()) {
        const parts = acc.trim().split(':')
        if (parts.length >= 2) sessionTokens.push(`${parts[0]}:${parts[1]}`)
      }
    }
  }
  if (sessionTokens.length > 0) {
    const classified = sessionTokens.map(classifyTronClusterToken)
    const hasExpectedSession = classified.some((item) => item.mode === input.expectedNetworkMode)
    if (!hasExpectedSession) {
      const actualLabel = classified[0]?.label || 'red TRON no autorizada'
      return {
        ok: false,
        expectedLabel,
        actualLabel,
        error: `La sesión WalletConnect TRON autorizó ${actualLabel}, pero esta orden requiere ${expectedLabel}. Reconecta tu billetera en ${expectedLabel} antes de firmar.`,
      }
    }
    return { ok: true, expectedLabel, actualLabel: expectedLabel }
  }

  const caipNetRaw = typeof input.caipNetworkId === 'string' ? input.caipNetworkId.trim() : ''
  const chainIdRaw = input.caipChainId !== undefined && input.caipChainId !== null ? String(input.caipChainId).trim() : ''

  if (!caipNetRaw && !chainIdRaw) {
    return {
      ok: false,
      expectedLabel,
      actualLabel: 'red TRON no detectada',
      error: `No se pudo confirmar la red activa de tu billetera TRON. Asegúrate de seleccionar ${expectedLabel} en Reown AppKit antes de firmar.`,
    }
  }

  const netRes = caipNetRaw ? classifyTronClusterToken(caipNetRaw) : null
  const chainRes = chainIdRaw ? classifyTronClusterToken(chainIdRaw) : null

  if (netRes && chainRes && netRes.label !== chainRes.label) {
    const actualLabel = `${netRes.label} / ${chainRes.label}`
    return {
      ok: false,
      expectedLabel,
      actualLabel,
      error: `Red TRON inconsistente (${actualLabel}). Selecciona ${expectedLabel} en tu billetera antes de firmar.`,
    }
  }

  const resolved = netRes ?? chainRes!
  if (resolved.mode === input.expectedNetworkMode) {
    return { ok: true, expectedLabel, actualLabel: resolved.label }
  }

  return {
    ok: false,
    expectedLabel,
    actualLabel: resolved.label,
    error: `Tu billetera TRON está conectada a ${resolved.label}, pero esta orden requiere ${expectedLabel}. Cambia de red en tu billetera antes de firmar.`,
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
