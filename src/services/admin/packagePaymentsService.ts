import { getFunctions, httpsCallable } from 'firebase/functions';
import type { OrderPaymentStatus, PackageOrderPayment } from '../../types/admin';
import { app, db, collection, getDocs, onSnapshot } from '../../utils/firebaseAuth';

export const ADMIN_ORDERS_COLLECTION = 'admin_orders';

const CANONICAL_ORDER_STATUSES = new Set<OrderPaymentStatus>([
  'OPEN',
  'AWAITING',
  'PROCESSING',
  'SETTLED',
  'UNDERPAID',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'REVERSED',
]);

export interface PackagePaymentsSummary {
  totalOrdersCount: number;
  settledCount: number;
  pendingCount: number;
  underpaidCount: number;
  failedCount: number;
  expiredCount: number;
  cancelledCount: number;
  reversedCount: number;
  totalVolumeUsd: number;
  totalThSold: number;
}

export interface ReverifyPaymentResult {
  outcome: string;
  status: OrderPaymentStatus;
  verificationStatus?: string;
  intentId: string;
  orderId?: string;
  txHash?: string | null;
  confirmations?: number;
  requiredConfirmations?: number;
  activatedMinerId?: string | null;
  contractId?: string | null;
  settledAt?: string | null;
}

function normalizeTimestampIso(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (raw && typeof raw === 'object' && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    const date = (raw as { toDate: () => Date }).toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (raw && typeof raw === 'object' && typeof (raw as { seconds?: number }).seconds === 'number') {
    return new Date((raw as { seconds: number }).seconds * 1000).toISOString();
  }
  return '';
}

function normalizeOrderStatus(raw: unknown): OrderPaymentStatus {
  if (typeof raw === 'string') {
    const upper = raw.trim().toUpperCase() as OrderPaymentStatus;
    if (CANONICAL_ORDER_STATUSES.has(upper)) {
      return upper;
    }
  }
  return 'OPEN';
}

export function normalizePackageOrderDoc(id: string, data: Record<string, any>): PackageOrderPayment {
  const amountUsd = Number(data.amountUsd ?? data.price ?? 0);
  const contractedTh = Number(data.contractedTh ?? data.powerTh ?? 0);
  const rawConfirmations = Number(data.confirmations ?? 0);
  const rawRequired = Number(data.requiredConfirmations ?? 1);
  const cryptoAsset = String(data.cryptoAsset || data.paymentAsset || 'USDT');
  const displayAmount = data.expectedAmountDisplay ? `${data.expectedAmountDisplay} ${cryptoAsset}` : '';
  const txHash = typeof data.txHash === 'string' && data.txHash.trim() ? data.txHash.trim() : undefined;
  const activatedMinerId =
    typeof data.activatedMinerId === 'string' && data.activatedMinerId.trim()
      ? data.activatedMinerId.trim()
      : undefined;
  const contractId =
    typeof data.contractId === 'string' && data.contractId.trim() ? data.contractId.trim() : undefined;
  const networkMode =
    data.networkMode === 'mainnet' || data.networkMode === 'testnet' ? data.networkMode : undefined;
  const productType =
    data.productType === 'subscription' || data.productType === 'miner' ? data.productType : undefined;

  return {
    orderId: typeof data.orderId === 'string' && data.orderId.trim() ? data.orderId.trim() : id,
    attemptId: typeof data.attemptId === 'string' && data.attemptId.trim() ? data.attemptId.trim() : `att_${id}`,
    intentId: typeof data.intentId === 'string' && data.intentId.trim() ? data.intentId.trim() : id,
    buyerUid: typeof data.buyerUid === 'string' && data.buyerUid.trim() ? data.buyerUid.trim() : data.userId,
    createdAt: normalizeTimestampIso(data.createdAt) || new Date(0).toISOString(),
    userId: typeof data.userId === 'string' && data.userId.trim() ? data.userId.trim() : String(data.buyerUid || ''),
    userEmail: typeof data.userEmail === 'string' ? data.userEmail : '',
    userName:
      typeof data.userName === 'string' && data.userName.trim()
        ? data.userName.trim()
        : typeof data.userEmail === 'string' && data.userEmail.includes('@')
        ? data.userEmail.split('@')[0]
        : 'Cliente',
    packageId: typeof data.packageId === 'string' ? data.packageId : '',
    packageName: typeof data.packageName === 'string' && data.packageName.trim() ? data.packageName.trim() : 'Minero Digital',
    productType,
    contractedTh: Number.isFinite(contractedTh) ? contractedTh : 0,
    amountUsd: Number.isFinite(amountUsd) ? amountUsd : 0,
    cryptoAsset,
    cryptoAmount: typeof data.cryptoAmount === 'string' && data.cryptoAmount.trim() ? data.cryptoAmount.trim() : displayAmount || `${Number.isFinite(amountUsd) ? amountUsd : 0} ${cryptoAsset}`,
    paymentNetwork: String(data.paymentNetwork || '').toUpperCase() || 'PENDING',
    networkMode,
    recipientAddress: typeof data.recipientAddress === 'string' ? data.recipientAddress : String(data.treasuryAddress || ''),
    txHash,
    confirmations: Number.isFinite(rawConfirmations) && rawConfirmations >= 0 ? rawConfirmations : 0,
    requiredConfirmations: Number.isFinite(rawRequired) && rawRequired > 0 ? rawRequired : 1,
    status: normalizeOrderStatus(data.status),
    bridgeStatus: data.bridgeStatus || 'NONE',
    activatedMinerId,
    contractId,
    idempotencyKey: typeof data.idempotencyKey === 'string' && data.idempotencyKey.trim() ? data.idempotencyKey.trim() : id,
    settledAt: normalizeTimestampIso(data.settledAt) || undefined,
    expiresAt: normalizeTimestampIso(data.expiresAt) || undefined,
    cancelledAt: normalizeTimestampIso(data.cancelledAt) || undefined,
  };
}

function sortPaymentsByCreatedDesc(list: PackageOrderPayment[]): PackageOrderPayment[] {
  return [...list].sort((a, b) => {
    const aMs = Date.parse(a.createdAt || '') || 0;
    const bMs = Date.parse(b.createdAt || '') || 0;
    return bMs - aMs;
  });
}

export class PackagePaymentsService {
  private static instance: PackagePaymentsService;
  private cachedPayments: PackageOrderPayment[] = [];

  private constructor() {}

  public static getInstance(): PackagePaymentsService {
    if (!PackagePaymentsService.instance) {
      PackagePaymentsService.instance = new PackagePaymentsService();
    }
    return PackagePaymentsService.instance;
  }

  public getPayments(): PackageOrderPayment[] {
    return this.cachedPayments;
  }

  /**
   * Fetches package payment orders exclusively from Cloud Firestore (/admin_orders).
   */
  public async fetchFirestorePayments(): Promise<PackageOrderPayment[]> {
    if (!db) return this.cachedPayments;
    const snap = await getDocs(collection(db, ADMIN_ORDERS_COLLECTION));
    const orders = sortPaymentsByCreatedDesc(snap.docs.map((d) => normalizePackageOrderDoc(d.id, d.data())));
    this.cachedPayments = orders;
    return orders;
  }

  /**
   * Real-time subscription to Cloud Firestore collection /admin_orders (read-only).
   */
  public subscribeToFirestorePayments(
    callback: (payments: PackageOrderPayment[]) => void,
    onError?: (err: unknown) => void
  ): () => void {
    if (!db) return () => {};
    try {
      const colRef = collection(db, ADMIN_ORDERS_COLLECTION);
      return onSnapshot(
        colRef,
        (snap) => {
          const orders = sortPaymentsByCreatedDesc(snap.docs.map((d) => normalizePackageOrderDoc(d.id, d.data())));
          this.cachedPayments = orders;
          callback(orders);
        },
        (err) => {
          console.warn('[PackagePaymentsService] onSnapshot subscription notice:', err);
          if (onError) onError(err);
        }
      );
    } catch (err) {
      if (onError) onError(err);
      return () => {};
    }
  }

  /**
   * Re-verifies an on-chain payment using the server-authoritative Gen 2 callable confirmPaymentIntent (SCRUM-345).
   */
  public async reverifyPaymentOnChain(
    intentId: string,
    txHash?: string,
    callableOverride?: (payload: { intentId: string; txHash?: string }) => Promise<{ data: ReverifyPaymentResult }>
  ): Promise<ReverifyPaymentResult> {
    const cleanIntentId = intentId.trim();
    if (!cleanIntentId) {
      throw new Error('intentId es requerido para re-verificar el pago on-chain');
    }

    const payload: { intentId: string; txHash?: string } = { intentId: cleanIntentId };
    if (typeof txHash === 'string' && txHash.trim()) {
      payload.txHash = txHash.trim();
    }

    if (callableOverride) {
      const res = await callableOverride(payload);
      return res.data;
    }

    if (!app) {
      throw new Error('Firebase App no inicializada para invocar confirmPaymentIntent');
    }

    const functionsInstance = getFunctions(app);
    const confirmCallable = httpsCallable<{ intentId: string; txHash?: string }, ReverifyPaymentResult>(
      functionsInstance,
      'confirmPaymentIntent'
    );
    const response = await confirmCallable(payload);
    return response.data;
  }

  /**
   * Pure summary calculator over canonical payment statuses.
   * Only SETTLED orders contribute to totalVolumeUsd and totalThSold.
   */
  public getSummary(payments?: PackageOrderPayment[]): PackagePaymentsSummary {
    const list = payments ?? this.cachedPayments;
    let settledCount = 0;
    let pendingCount = 0;
    let underpaidCount = 0;
    let failedCount = 0;
    let expiredCount = 0;
    let cancelledCount = 0;
    let reversedCount = 0;
    let totalVolumeUsd = 0;
    let totalThSold = 0;

    for (const p of list) {
      switch (p.status) {
        case 'SETTLED':
          settledCount += 1;
          totalVolumeUsd += Number(p.amountUsd) || 0;
          totalThSold += Number(p.contractedTh) || 0;
          break;
        case 'OPEN':
        case 'AWAITING':
        case 'PROCESSING':
          pendingCount += 1;
          break;
        case 'UNDERPAID':
          underpaidCount += 1;
          break;
        case 'FAILED':
          failedCount += 1;
          break;
        case 'EXPIRED':
          expiredCount += 1;
          break;
        case 'CANCELLED':
          cancelledCount += 1;
          break;
        case 'REVERSED':
          reversedCount += 1;
          break;
      }
    }

    return {
      totalOrdersCount: list.length,
      settledCount,
      pendingCount,
      underpaidCount,
      failedCount,
      expiredCount,
      cancelledCount,
      reversedCount,
      totalVolumeUsd,
      totalThSold,
    };
  }
}
