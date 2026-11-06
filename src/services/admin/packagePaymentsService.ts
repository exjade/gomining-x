import type { PackageOrderPayment } from '../../types/admin';
import { AdminAuditService } from './adminAuditService';
import { FinancialLedgerService } from './financialLedgerService';
import { db, collection, doc, getDocs, setDoc, onSnapshot } from '../../utils/firebaseAuth';
import { apiFetch } from '../../utils/apiConfig';

const STORAGE_PAYMENTS_KEY = 'minerx_package_payments_v2';
export const ADMIN_ORDERS_COLLECTION = 'admin_orders';

export const INITIAL_PACKAGE_PAYMENTS: PackageOrderPayment[] = [
  {
    orderId: 'ord_pack_1001',
    attemptId: 'att_tron_01',
    createdAt: '2026-10-15T12:05:00Z',
    userId: 'usr_roman_01',
    userEmail: 'roman@minerx.cloud',
    userName: 'Román Martínez',
    packageId: 'pkg-enterprise-05',
    packageName: 'Minero 5 Enterprise',
    contractedTh: 192,
    amountUsd: 2201.99,
    cryptoAsset: 'USDT',
    cryptoAmount: '2201.99 USDT',
    paymentNetwork: 'TRON',
    recipientAddress: 'TYDzpFs8XzQ3Y9aP1mXk9Vn5B3LmQ819aa',
    txHash: '4f92019481029481204918230918234123491820491820491820491820491820',
    confirmations: 35,
    requiredConfirmations: 19,
    status: 'SETTLED',
    bridgeStatus: 'NONE',
    activatedMinerId: 'miner_ent_8912',
    idempotencyKey: 'tron_4f92019481029481204918230918234123491820491820491820491820491820_0',
    settledAt: '2026-10-15T12:08:30Z'
  },
  {
    orderId: 'ord_pack_1002',
    attemptId: 'att_eth_02',
    createdAt: '2026-10-18T09:30:00Z',
    userId: 'usr_alpha_99',
    userEmail: 'operator.alpha@minerx.cloud',
    userName: 'Alpha Operator',
    packageId: 'pkg-master-04',
    packageName: 'Minero 4 Master',
    contractedTh: 128,
    amountUsd: 1474.99,
    cryptoAsset: 'USDT',
    cryptoAmount: '1474.99 USDT',
    paymentNetwork: 'ETHEREUM',
    recipientAddress: '0x71C...49182049182',
    txHash: '0x8b39102491820491820491820491820491820491820491820491820491820491',
    confirmations: 48,
    requiredConfirmations: 12,
    status: 'SETTLED',
    bridgeStatus: 'NONE',
    activatedMinerId: 'miner_mast_8913',
    idempotencyKey: 'eth_0x8b39102491820491820491820491820491820491820491820491820491820491_0',
    settledAt: '2026-10-18T09:34:10Z'
  },
  {
    orderId: 'ord_pack_1003',
    attemptId: 'att_sol_03',
    createdAt: '2026-10-25T16:20:00Z',
    userId: 'usr_beta_04',
    userEmail: 'investor.beta@gmail.com',
    userName: 'Carlos Méndez',
    packageId: 'pkg-pro-03',
    packageName: 'Minero 3 Pro',
    contractedTh: 64,
    amountUsd: 749.99,
    cryptoAsset: 'USDT',
    cryptoAmount: '749.99 USDT',
    paymentNetwork: 'SOLANA',
    recipientAddress: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
    txHash: '5K92810491204918204918204918204918204918204918204918204918204918',
    confirmations: 120,
    requiredConfirmations: 32,
    status: 'SETTLED',
    bridgeStatus: 'NONE',
    activatedMinerId: 'miner_pro_8914',
    idempotencyKey: 'sol_5K92810491204918204918204918204918204918204918204918204918204918_0',
    settledAt: '2026-10-25T16:21:40Z'
  },
  {
    orderId: 'ord_pack_1004',
    attemptId: 'att_btc_04',
    createdAt: '2026-11-04T12:15:00Z',
    userId: 'usr_ana_02',
    userEmail: 'ana.soto@minerx.org',
    userName: 'Ana Soto',
    packageId: 'pkg-plus-02',
    packageName: 'Minero 2 Plus',
    contractedTh: 32,
    amountUsd: 389.99,
    cryptoAsset: 'BTC',
    cryptoAmount: '0.00573 BTC',
    paymentNetwork: 'BITCOIN',
    recipientAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    txHash: '7c89102491820491820491820491820491820491820491820491820491820491',
    confirmations: 2,
    requiredConfirmations: 3,
    status: 'CONFIRMED',
    bridgeStatus: 'NONE',
    idempotencyKey: 'btc_7c89102491820491820491820491820491820491820491820491820491820491_0'
  },
  {
    orderId: 'ord_pack_1005',
    attemptId: 'att_spei_05',
    createdAt: '2026-11-04T12:45:00Z',
    userId: 'usr_luis_03',
    userEmail: 'luis.miner@crypto.io',
    userName: 'Luis Navarro',
    packageId: 'pkg-essential-01',
    packageName: 'Minero 1 Esencial',
    contractedTh: 16,
    amountUsd: 199.99,
    cryptoAsset: 'MXN',
    cryptoAmount: '3,999.00 MXN',
    paymentNetwork: 'BRIDGE_SPEI',
    recipientAddress: 'STP 646180123456789012',
    confirmations: 0,
    requiredConfirmations: 1,
    status: 'PENDING',
    bridgeStatus: 'INITIATED',
    idempotencyKey: 'spei_ord_pack_1005_att_spei_05'
  },
  {
    orderId: 'ord_pack_1006',
    attemptId: 'att_tron_06',
    createdAt: '2026-11-03T02:00:00Z',
    userId: 'usr_elena_06',
    userEmail: 'elena.v@quantum.tech',
    userName: 'Elena Vega',
    packageId: 'pkg-plus-02',
    packageName: 'Minero 2 Plus',
    contractedTh: 32,
    amountUsd: 389.99,
    cryptoAsset: 'USDT',
    cryptoAmount: '389.99 USDT',
    paymentNetwork: 'TRON',
    recipientAddress: 'TYDzpFs8XzQ3Y9aP1mXk9Vn5B3LmQ819aa',
    confirmations: 0,
    requiredConfirmations: 19,
    status: 'EXPIRED',
    bridgeStatus: 'NONE',
    idempotencyKey: 'tron_expired_ord_1006'
  }
];

export class PackagePaymentsService {
  private static instance: PackagePaymentsService;
  private audit = AdminAuditService.getInstance();
  private ledger = FinancialLedgerService.getInstance();

  private constructor() {}

  public static getInstance(): PackagePaymentsService {
    if (!PackagePaymentsService.instance) {
      PackagePaymentsService.instance = new PackagePaymentsService();
    }
    return PackagePaymentsService.instance;
  }

  public getPayments(): PackageOrderPayment[] {
    try {
      const raw = localStorage.getItem(STORAGE_PAYMENTS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return INITIAL_PACKAGE_PAYMENTS;
  }

  /**
   * Fetches package payment orders from Cloud Firestore (/admin_orders),
   * merging any client-purchased miners with local admin orders.
   */
  public async fetchFirestorePayments(): Promise<PackageOrderPayment[]> {
    if (!db) return this.getPayments();
    try {
      const snap = await getDocs(collection(db, ADMIN_ORDERS_COLLECTION));
      if (!snap.empty) {
        const firestoreOrders: PackageOrderPayment[] = snap.docs.map(d => {
          const data = d.data();
          return {
            orderId: d.id,
            attemptId: data.attemptId || `att_${d.id}`,
            createdAt: data.createdAt || new Date().toISOString(),
            userId: data.userId || 'usr_client',
            userEmail: data.userEmail || 'cliente@gomining.cloud',
            userName: data.userName || data.userEmail?.split('@')[0] || 'Cliente',
            packageId: data.packageId || 'pkg-custom',
            packageName: data.packageName || 'Minero Digital',
            contractedTh: Number(data.contractedTh ?? data.powerTh ?? 0),
            amountUsd: Number(data.amountUsd ?? data.price ?? 0),
            cryptoAsset: data.cryptoAsset || 'USDT',
            cryptoAmount: data.cryptoAmount || `${Number(data.amountUsd ?? data.price ?? 0)} USDT`,
            paymentNetwork: data.paymentNetwork || 'USDT',
            recipientAddress: data.recipientAddress || 'PLATFORM_TREASURY',
            txHash: data.txHash || 'tx_internal',
            confirmations: Number(data.confirmations ?? 12),
            requiredConfirmations: Number(data.requiredConfirmations ?? 12),
            status: data.status || 'SETTLED',
            bridgeStatus: data.bridgeStatus || 'NONE',
            activatedMinerId: data.activatedMinerId || d.id,
            idempotencyKey: data.idempotencyKey || `idem_${d.id}`,
            settledAt: data.settledAt || data.createdAt || new Date().toISOString()
          };
        });

        const local = this.getPayments();
        const mergedMap = new Map<string, PackageOrderPayment>();
        // Add firestore orders first
        for (const fo of firestoreOrders) {
          mergedMap.set(fo.orderId, fo);
        }
        // Add local orders if not already present
        for (const lo of local) {
          if (!mergedMap.has(lo.orderId)) {
            mergedMap.set(lo.orderId, lo);
          }
        }
        const mergedList = Array.from(mergedMap.values());
        localStorage.setItem(STORAGE_PAYMENTS_KEY, JSON.stringify(mergedList));
        return mergedList;
      }
    } catch (err) {
      console.warn('[PackagePaymentsService] Notice fetching from Firestore, checking Express API:', err);
    }

    // Secondary fallback: Express API Server
    try {
      const res = await apiFetch('/api/admin/orders');
      if (res.ok) {
        const remoteOrders = await res.json();
        if (Array.isArray(remoteOrders) && remoteOrders.length > 0) {
          const local = this.getPayments();
          const mergedMap = new Map<string, PackageOrderPayment>();
          for (const ro of remoteOrders) {
            mergedMap.set(ro.orderId, ro);
          }
          for (const lo of local) {
            if (!mergedMap.has(lo.orderId)) {
              mergedMap.set(lo.orderId, lo);
            }
          }
          const mergedList = Array.from(mergedMap.values());
          localStorage.setItem(STORAGE_PAYMENTS_KEY, JSON.stringify(mergedList));
          return mergedList;
        }
      }
    } catch {}

    return this.getPayments();
  }

  /**
   * Real-time subscription to Cloud Firestore collection /admin_orders
   */
  public subscribeToFirestorePayments(callback: (payments: PackageOrderPayment[]) => void): () => void {
    if (!db) return () => {};
    try {
      const colRef = collection(db, ADMIN_ORDERS_COLLECTION);
      return onSnapshot(colRef, (snap) => {
        if (!snap.empty) {
          const firestoreOrders: PackageOrderPayment[] = snap.docs.map(d => {
            const data = d.data();
            return {
              orderId: d.id,
              attemptId: data.attemptId || `att_${d.id}`,
              createdAt: data.createdAt || new Date().toISOString(),
              userId: data.userId || 'usr_client',
              userEmail: data.userEmail || 'cliente@gomining.cloud',
              userName: data.userName || data.userEmail?.split('@')[0] || 'Cliente',
              packageId: data.packageId || 'pkg-custom',
              packageName: data.packageName || 'Minero Digital',
              contractedTh: Number(data.contractedTh ?? data.powerTh ?? 0),
              amountUsd: Number(data.amountUsd ?? data.price ?? 0),
              cryptoAsset: data.cryptoAsset || 'USDT',
              cryptoAmount: data.cryptoAmount || `${Number(data.amountUsd ?? data.price ?? 0)} USDT`,
              paymentNetwork: data.paymentNetwork || 'USDT',
              recipientAddress: data.recipientAddress || 'PLATFORM_TREASURY',
              txHash: data.txHash || 'tx_internal',
              confirmations: Number(data.confirmations ?? 12),
              requiredConfirmations: Number(data.requiredConfirmations ?? 12),
              status: data.status || 'SETTLED',
              bridgeStatus: data.bridgeStatus || 'NONE',
              activatedMinerId: data.activatedMinerId || d.id,
              idempotencyKey: data.idempotencyKey || `idem_${d.id}`,
              settledAt: data.settledAt || data.createdAt || new Date().toISOString()
            };
          });

          const local = this.getPayments();
          const mergedMap = new Map<string, PackageOrderPayment>();
          for (const fo of firestoreOrders) {
            mergedMap.set(fo.orderId, fo);
          }
          for (const lo of local) {
            if (!mergedMap.has(lo.orderId)) {
              mergedMap.set(lo.orderId, lo);
            }
          }
          const mergedList = Array.from(mergedMap.values());
          localStorage.setItem(STORAGE_PAYMENTS_KEY, JSON.stringify(mergedList));
          callback(mergedList);
        }
      }, (err) => {
        console.warn('[PackagePaymentsService] onSnapshot subscription notice:', err);
      });
    } catch {
      return () => {};
    }
  }

  public confirmAndSettlePayment(orderId: string, txHash: string, operatorUid = 'admin_sys'): boolean {
    const list = this.getPayments();
    const item = list.find(p => p.orderId === orderId);
    if (!item) return false;

    const minerId = `miner_${item.packageId.replace('pkg-', '')}_${Date.now().toString().slice(-4)}`;
    item.status = 'SETTLED';
    item.txHash = txHash || item.txHash || `0x${Math.random().toString(16).substring(2, 18)}`;
    item.confirmations = item.requiredConfirmations;
    item.activatedMinerId = minerId;
    item.settledAt = new Date().toISOString();
    if (item.paymentNetwork === 'BRIDGE_SPEI') {
      item.bridgeStatus = 'COMPLETED';
    }

    localStorage.setItem(STORAGE_PAYMENTS_KEY, JSON.stringify(list));

    if (db) {
      setDoc(doc(db, ADMIN_ORDERS_COLLECTION, orderId), item, { merge: true }).catch(err => {
        console.error('[PackagePaymentsService] Error syncing settled payment to Firestore:', err);
      });
    }

    try {
      apiFetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      }).catch(() => {});
    } catch {}

    // Reflejar en Ledger Contable
    this.ledger.addEntry({
      userId: item.userId,
      userEmail: item.userEmail,
      transactionType: 'PACKAGE_PURCHASE',
      direction: 'CREDIT',
      amount: item.amountUsd,
      currency: 'USDT',
      status: 'SETTLED',
      referenceId: item.orderId,
      description: `Pago liquidado para ${item.packageName} (${item.contractedTh} TH/s) asignado a minero ${minerId}`,
      balanceAfter: 0,
      provenance: 'FINANCIAL_REALIZED'
    });

    this.audit.logAction(operatorUid, 'admin@minerx.cloud', 'FINANCE_ADMIN', 'COMMERCIAL', 'SETTLE_PACKAGE_ORDER', orderId, {
      packageName: item.packageName,
      contractedTh: item.contractedTh,
      amountUsd: item.amountUsd,
      cryptoAsset: item.cryptoAsset,
      minerId
    });

    return true;
  }

  public getSummary() {
    const list = this.getPayments();
    const settledList = list.filter(p => p.status === 'SETTLED');
    const pendingList = list.filter(p => p.status === 'PENDING' || p.status === 'CONFIRMED');

    const totalVolumeUsd = settledList.reduce((acc, p) => acc + p.amountUsd, 0);
    const totalThSold = settledList.reduce((acc, p) => acc + p.contractedTh, 0);

    return {
      totalOrdersCount: list.length,
      settledCount: settledList.length,
      pendingCount: pendingList.length,
      expiredCount: list.filter(p => p.status === 'EXPIRED').length,
      totalVolumeUsd,
      totalThSold
    };
  }
}
