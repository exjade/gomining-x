import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase.ts'
import {
  buildExplorerTxUrl,
  type AnyPaymentNetworkId,
  type PaymentNetworkMode,
} from '../../paymentDestinations.ts'

export const ADMIN_ORDERS_COLLECTION = 'admin_orders'

export type ClientOrderStatus =
  | 'OPEN'
  | 'AWAITING'
  | 'PROCESSING'
  | 'SETTLED'
  | 'UNDERPAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REVERSED'

const CANONICAL_STATUSES = new Set<ClientOrderStatus>([
  'OPEN',
  'AWAITING',
  'PROCESSING',
  'SETTLED',
  'UNDERPAID',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'REVERSED',
])

const SUPPORTED_EXPLORER_NETWORKS = new Set<AnyPaymentNetworkId>([
  'bsc',
  'bnb',
  'ethereum',
  'polygon',
  'solana',
])

export interface ClientPaymentOrder {
  orderId: string
  intentId: string
  userId: string
  status: ClientOrderStatus
  productType: 'miner' | 'subscription'
  packageId: string
  packageName: string
  powerTh: number
  amountUsd: number
  paymentNetwork: string | null
  networkMode: PaymentNetworkMode
  cryptoAsset: string | null
  cryptoAmount: string | null
  txHash: string | null
  confirmations: number
  requiredConfirmations: number
  activatedMinerId: string | null
  contractId: string | null
  createdAt: string
  expiresAt: string | null
  settledAt: string | null
  cancelledAt: string | null
}

function toIsoString(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object' && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    const d = (raw as { toDate: () => Date }).toDate()
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString()
  }
  if (raw && typeof raw === 'object' && typeof (raw as { seconds?: number }).seconds === 'number') {
    return new Date((raw as { seconds: number }).seconds * 1000).toISOString()
  }
  return ''
}

function parseTimestampMs(iso: string): number {
  const parsed = Date.parse(iso)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeStatus(raw: unknown): ClientOrderStatus {
  if (typeof raw === 'string') {
    const upper = raw.trim().toUpperCase() as ClientOrderStatus
    if (CANONICAL_STATUSES.has(upper)) return upper
  }
  return 'OPEN'
}

export function normalizeClientOrderDoc(id: string, data: Record<string, unknown>): ClientPaymentOrder {
  const amountUsd = Number(data.amountUsd ?? data.price ?? 0)
  const powerTh = Number(data.powerTh ?? data.contractedTh ?? 0)
  const rawConfirmations = Number(data.confirmations ?? 0)
  const rawRequired = Number(data.requiredConfirmations ?? 1)
  const txHash = typeof data.txHash === 'string' && data.txHash.trim() ? data.txHash.trim() : null
  const paymentNetwork =
    typeof data.paymentNetwork === 'string' && data.paymentNetwork.trim()
      ? data.paymentNetwork.trim().toLowerCase()
      : null
  const cryptoAsset =
    typeof data.cryptoAsset === 'string' && data.cryptoAsset.trim()
      ? data.cryptoAsset.trim()
      : typeof data.paymentAsset === 'string' && data.paymentAsset.trim()
      ? data.paymentAsset.trim()
      : null
  const expectedDisplay =
    typeof data.expectedAmountDisplay === 'string' && data.expectedAmountDisplay.trim()
      ? `${data.expectedAmountDisplay.trim()}${cryptoAsset ? ` ${cryptoAsset}` : ''}`
      : null

  return {
    orderId: typeof data.orderId === 'string' && data.orderId.trim() ? data.orderId.trim() : id,
    intentId: typeof data.intentId === 'string' && data.intentId.trim() ? data.intentId.trim() : id,
    userId:
      typeof data.userId === 'string' && data.userId.trim()
        ? data.userId.trim()
        : typeof data.buyerUid === 'string'
        ? data.buyerUid.trim()
        : '',
    status: normalizeStatus(data.status),
    productType: data.productType === 'subscription' ? 'subscription' : 'miner',
    packageId: typeof data.packageId === 'string' ? data.packageId : '',
    packageName:
      typeof data.packageName === 'string' && data.packageName.trim()
        ? data.packageName.trim()
        : 'Minero Digital',
    powerTh: Number.isFinite(powerTh) ? powerTh : 0,
    amountUsd: Number.isFinite(amountUsd) ? amountUsd : 0,
    paymentNetwork,
    networkMode: data.networkMode === 'mainnet' ? 'mainnet' : 'testnet',
    cryptoAsset,
    cryptoAmount:
      typeof data.cryptoAmount === 'string' && data.cryptoAmount.trim()
        ? data.cryptoAmount.trim()
        : expectedDisplay,
    txHash,
    confirmations: Number.isFinite(rawConfirmations) && rawConfirmations >= 0 ? rawConfirmations : 0,
    requiredConfirmations: Number.isFinite(rawRequired) && rawRequired > 0 ? rawRequired : 1,
    activatedMinerId:
      typeof data.activatedMinerId === 'string' && data.activatedMinerId.trim()
        ? data.activatedMinerId.trim()
        : null,
    contractId:
      typeof data.contractId === 'string' && data.contractId.trim() ? data.contractId.trim() : null,
    createdAt: toIsoString(data.createdAt),
    expiresAt: toIsoString(data.expiresAt) || null,
    settledAt: toIsoString(data.settledAt) || null,
    cancelledAt: toIsoString(data.cancelledAt) || null,
  }
}

export function sortOrdersByCreatedDesc(orders: readonly ClientPaymentOrder[]): ClientPaymentOrder[] {
  return [...orders].sort((a, b) => parseTimestampMs(b.createdAt) - parseTimestampMs(a.createdAt))
}

export function canCancelClientOrder(order: Pick<ClientPaymentOrder, 'status' | 'txHash'>): boolean {
  const hasTxHash = typeof order.txHash === 'string' && order.txHash.trim().length > 0
  return (order.status === 'OPEN' || order.status === 'AWAITING') && !hasTxHash
}

export function buildClientOrderExplorerUrl(
  order: Pick<ClientPaymentOrder, 'paymentNetwork' | 'networkMode' | 'txHash'>,
): string | null {
  const cleanHash = typeof order.txHash === 'string' ? order.txHash.trim() : ''
  const rawNet = typeof order.paymentNetwork === 'string' ? order.paymentNetwork.trim().toLowerCase() : ''
  if (!cleanHash || !rawNet) return null

  const normalizedNet = rawNet === 'bnb' ? 'bnb' : rawNet
  if (!SUPPORTED_EXPLORER_NETWORKS.has(normalizedNet as AnyPaymentNetworkId)) {
    return null
  }

  try {
    return buildExplorerTxUrl(normalizedNet as AnyPaymentNetworkId, cleanHash, order.networkMode)
  } catch {
    return null
  }
}

export interface ClientOrdersSubscriptionDeps {
  db: typeof db
  collection: typeof collection
  query: typeof query
  where: typeof where
  onSnapshot: typeof onSnapshot
}

const defaultDeps: ClientOrdersSubscriptionDeps = {
  db,
  collection,
  query,
  where,
  onSnapshot,
}

/**
 * Real-time read-only subscription to the authenticated user's /admin_orders documents.
 * Uses strictly where('userId', '==', uid) without composite orderBy to require 0 new Firestore indexes.
 */
export function subscribeToClientOrders(
  uid: string,
  onUpdate: (orders: ClientPaymentOrder[]) => void,
  onError?: (error: unknown) => void,
  deps: ClientOrdersSubscriptionDeps = defaultDeps,
): () => void {
  const cleanUid = typeof uid === 'string' ? uid.trim() : ''
  if (!cleanUid) {
    onUpdate([])
    return () => {}
  }

  const ordersQuery = deps.query(
    deps.collection(deps.db, ADMIN_ORDERS_COLLECTION),
    deps.where('userId', '==', cleanUid),
  )

  return deps.onSnapshot(
    ordersQuery,
    (snapshot) => {
      const normalized = snapshot.docs.map((docSnap) =>
        normalizeClientOrderDoc(docSnap.id, docSnap.data() as Record<string, unknown>),
      )
      onUpdate(sortOrdersByCreatedDesc(normalized))
    },
    (error) => {
      if (onError) onError(error)
    },
  )
}
