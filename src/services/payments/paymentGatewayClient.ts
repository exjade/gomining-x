import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../../firebase'
import type { BackendPaymentNetworkId, PaymentNetworkMode } from '../../paymentDestinations'

export type PaymentIntentStatus =
  | 'OPEN'
  | 'AWAITING'
  | 'PROCESSING'
  | 'SETTLED'
  | 'UNDERPAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'

export type PaymentProductType = 'miner' | 'subscription'
export type PaymentAssetSymbol = 'USDT' | 'BNB' | 'POL' | 'ETH' | 'SOL'

export interface PaymentIntentRecord {
  intentId: string
  orderId: string
  idempotencyKey?: string
  userId: string
  buyerUid: string
  status: PaymentIntentStatus
  productType: PaymentProductType
  commissionEligible: boolean
  packageId: string
  packageName: string
  powerTh: number
  efficiencyWattsPerTh: number
  amountUsd: number
  amountMicroUsdt: string
  netPaidUsdt: string
  networkMode: PaymentNetworkMode
  paymentNetwork: BackendPaymentNetworkId | null
  chainId: number | string | null
  paymentAsset: PaymentAssetSymbol | null
  assetDecimals: number | null
  tokenContractAddress: string | null
  expectedAmountAtomic: string | null
  expectedAmountDisplay: string | null
  quotedSpotUsd: string | null
  quoteSource: string | null
  quotedAt: string | null
  treasuryAddress: string | null
  senderWallet: string | null
  confirmations: number
  requiredConfirmations: number
  txHash: string | null
  activatedMinerId: string | null
  contractId?: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
  settledAt?: string | null
  cancelledAt?: string | null
  cancelReason?: string | null
  isExpired?: boolean
}

export interface CreatePaymentIntentInput {
  productType?: PaymentProductType
  packageId?: string
  powerTh?: number
  networkId?: BackendPaymentNetworkId
  assetSymbol?: PaymentAssetSymbol
  senderWallet?: string
  idempotencyKey?: string
}

export interface SelectPaymentMethodInput {
  intentId: string
  networkId: BackendPaymentNetworkId
  assetSymbol: PaymentAssetSymbol
  senderWallet?: string
}

export interface ConfirmPaymentIntentResult {
  outcome: string
  status: PaymentIntentStatus
  verificationStatus?: string
  intentId: string
  orderId?: string
  txHash?: string | null
  confirmations?: number
  requiredConfirmations?: number
  receivedAmountAtomic?: string | null
  fromAddress?: string | null
  activatedMinerId?: string | null
  contractId?: string | null
  settledAt?: string | null
}

const functionsInstance = getFunctions(app)

const createPaymentIntentCallable = httpsCallable<CreatePaymentIntentInput, PaymentIntentRecord>(
  functionsInstance,
  'createPaymentIntent',
)
const selectPaymentMethodCallable = httpsCallable<SelectPaymentMethodInput, PaymentIntentRecord>(
  functionsInstance,
  'selectPaymentMethod',
)
const getPaymentIntentCallable = httpsCallable<{ intentId: string }, PaymentIntentRecord>(
  functionsInstance,
  'getPaymentIntent',
)
const cancelPaymentIntentCallable = httpsCallable<{ intentId: string; reason?: string }, PaymentIntentRecord>(
  functionsInstance,
  'cancelPaymentIntent',
)
const confirmPaymentIntentCallable = httpsCallable<{ intentId: string; txHash: string }, ConfirmPaymentIntentResult>(
  functionsInstance,
  'confirmPaymentIntent',
)

/** Creates a server-authoritative PaymentIntent (never sends price, treasury, or sponsor from client). */
export async function createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentRecord> {
  const payload: CreatePaymentIntentInput = {}
  if (input.productType) payload.productType = input.productType
  if (input.packageId?.trim()) payload.packageId = input.packageId.trim()
  if (typeof input.powerTh === 'number' && Number.isFinite(input.powerTh) && input.powerTh > 0) {
    payload.powerTh = input.powerTh
  }
  if (input.networkId) payload.networkId = input.networkId
  if (input.assetSymbol) payload.assetSymbol = input.assetSymbol
  if (input.senderWallet?.trim()) payload.senderWallet = input.senderWallet.trim()
  if (input.idempotencyKey?.trim()) payload.idempotencyKey = input.idempotencyKey.trim()

  const response = await createPaymentIntentCallable(payload)
  return response.data
}

export async function selectPaymentMethod(input: SelectPaymentMethodInput): Promise<PaymentIntentRecord> {
  const response = await selectPaymentMethodCallable({
    intentId: input.intentId.trim(),
    networkId: input.networkId,
    assetSymbol: input.assetSymbol,
    ...(input.senderWallet?.trim() ? { senderWallet: input.senderWallet.trim() } : {}),
  })
  return response.data
}

export async function getPaymentIntent(intentId: string): Promise<PaymentIntentRecord> {
  const response = await getPaymentIntentCallable({ intentId: intentId.trim() })
  return response.data
}

export async function cancelPaymentIntent(intentId: string, reason?: string): Promise<PaymentIntentRecord> {
  const response = await cancelPaymentIntentCallable({
    intentId: intentId.trim(),
    ...(reason ? { reason } : {}),
  })
  return response.data
}

export async function confirmPaymentIntent(intentId: string, txHash: string): Promise<ConfirmPaymentIntentResult> {
  const response = await confirmPaymentIntentCallable({
    intentId: intentId.trim(),
    txHash: txHash.trim(),
  })
  return response.data
}
