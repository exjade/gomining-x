import { getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ADMIN_APP_NAME } from './firebaseAdminAuthAdapter.js';

export interface PlatformBalancePurchaseRequest {
  packageId: string;
  purchaseId: string;
  [key: string]: any;
}

export interface PlatformBalancePurchaseResult {
  success: boolean;
  minerId: string;
  orderId: string;
  balance: number;
}

export class PurchaseError extends Error {
  public statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'PurchaseError';
    this.statusCode = statusCode;
  }
}

export interface PlatformBalancePurchaseServiceOptions {
  firestore?: any;
}

export class PlatformBalancePurchaseService {
  private firestore: any = null;

  constructor(options?: PlatformBalancePurchaseServiceOptions) {
    if (options?.firestore) {
      this.firestore = options.firestore;
    }
  }

  public setFirestore(firestore: any): void {
    this.firestore = firestore;
  }

  private getDb(): any {
    if (this.firestore) {
      return this.firestore;
    }
    const apps = getApps();
    const app = apps.find(a => a.name === ADMIN_APP_NAME) || apps[0];
    if (app) {
      this.firestore = getFirestore(app);
      return this.firestore;
    }
    return null;
  }

  public async executePurchase(
    uid: string,
    userEmail: string,
    req: PlatformBalancePurchaseRequest
  ): Promise<PlatformBalancePurchaseResult> {
    const db = this.getDb();
    if (!db) {
      throw new PurchaseError(500, 'Servicio de base de datos no disponible');
    }

    const { packageId, purchaseId } = req;
    if (!packageId || typeof packageId !== 'string' || !packageId.trim()) {
      throw new PurchaseError(400, 'packageId es requerido');
    }
    if (!purchaseId || typeof purchaseId !== 'string' || !purchaseId.trim()) {
      throw new PurchaseError(400, 'purchaseId es requerido');
    }

    const cleanPackageId = packageId.trim();
    const cleanPurchaseId = purchaseId.trim();

    return await db.runTransaction(async (transaction: any) => {
      // Phase 1 (Reads)
      // 1. Check idempotency record
      const idempotencyRef = db.collection('purchase_idempotency').doc(`${uid}__${cleanPurchaseId}`);
      const idempotencySnap = await transaction.get(idempotencyRef);
      const idempotencyExists = typeof idempotencySnap.exists === 'function'
        ? idempotencySnap.exists()
        : Boolean(idempotencySnap.exists);

      if (idempotencyExists) {
        const cached = typeof idempotencySnap.data === 'function'
          ? idempotencySnap.data()
          : idempotencySnap.data;
        if (cached && (cached.status === 'COMPLETED' || cached.success === true)) {
          return {
            success: true,
            minerId: cached.minerId,
            orderId: cached.orderId,
            balance: cached.balance,
          };
        }
      }

      // 2. Read user document
      const userRef = db.collection('users').doc(uid);
      const userSnap = await transaction.get(userRef);
      const userExists = typeof userSnap.exists === 'function'
        ? userSnap.exists()
        : Boolean(userSnap.exists);
      const userData = userExists
        ? ((typeof userSnap.data === 'function' ? userSnap.data() : userSnap.data) || {})
        : {};
      const currentBalance = typeof userData.balance === 'number' ? userData.balance : 0;

      // 3. Read canonical package from catalog
      const packageRef = db.collection('commercial_packages').doc(cleanPackageId);
      const packageSnap = await transaction.get(packageRef);
      const packageExists = typeof packageSnap.exists === 'function'
        ? packageSnap.exists()
        : Boolean(packageSnap.exists);

      if (!packageExists) {
        throw new PurchaseError(404, 'Paquete no encontrado');
      }

      const pkgData = (typeof packageSnap.data === 'function' ? packageSnap.data() : packageSnap.data) || {};
      const status = pkgData.status || 'ACTIVE';
      const isPublished = pkgData.isPublished !== undefined ? pkgData.isPublished : (status === 'ACTIVE');

      if (status !== 'ACTIVE' || isPublished === false) {
        throw new PurchaseError(404, 'Paquete no disponible');
      }

      // Determine authoritative economic values (ignore client-supplied values)
      const canonicalPrice = typeof pkgData.priceUsdt === 'number'
        ? pkgData.priceUsdt
        : (typeof pkgData.price === 'number' ? pkgData.price : Number(pkgData.priceUsdt || pkgData.price || 0));

      const powerTh = typeof pkgData.powerTh === 'number'
        ? pkgData.powerTh
        : Number(pkgData.powerTh || 0);

      const packageName = pkgData.name || 'Paquete Minero';
      const cadence = pkgData.cadence || pkgData.billing || 'once';
      const durationDays = typeof pkgData.durationDays === 'number' ? pkgData.durationDays : 365;
      const variablePct = typeof pkgData.variablePct === 'number' ? pkgData.variablePct : 0;
      const commissionPct = typeof pkgData.commissionPct === 'number' ? pkgData.commissionPct : 0;

      // Verify balance sufficiency
      if (currentBalance < canonicalPrice) {
        throw new PurchaseError(409, 'Saldo insuficiente en la plataforma');
      }

      // Phase 2 (Atomic Writes)
      const newBalance = Math.round((currentBalance - canonicalPrice) * 10000) / 10000;
      const now = new Date();
      const nowIso = now.toISOString();

      const minerId = `miner_${cleanPurchaseId}`;
      const orderId = `ord_${cleanPurchaseId}`;
      const contractId = `ctr_${cleanPurchaseId}`;

      // 1. Update user balance and purchase counters
      const purchasesCount = (typeof userData.purchasesCount === 'number' ? userData.purchasesCount : 0) + 1;
      const userUpdate: Record<string, any> = {
        balance: newBalance,
        purchasesCount,
        lastPurchaseAt: nowIso,
      };
      if (!userData.firstPurchaseAt) {
        userUpdate.firstPurchaseAt = nowIso;
      }
      if (userExists) {
        transaction.update(userRef, userUpdate);
      } else {
        transaction.set(userRef, { ...userData, ...userUpdate, uid }, { merge: true });
      }

      // 2. Create canonical miner document under /miners/{uid}/miner/{minerId}
      const minerRef = db.collection('miners').doc(uid).collection('miner').doc(minerId);
      const storedMiner = {
        id: minerId,
        uid,
        packageId: cleanPackageId,
        name: packageName,
        powerTh,
        efficiency: 15,
        efficiencyWattsPerTh: 15,
        price: canonicalPrice,
        currency: 'USD',
        status: 'active',
        txHash: `platform_balance:${cleanPurchaseId}`,
        network: 'PLATFORM_BALANCE',
        ownerWallet: 'INTERNAL',
        purchaseMode: cadence,
        cadence,
        visualTraits: {
          wallColor: '#7c3aed',
          bodyColor: '#1e1b4b',
          bottomColor: '#e2e8f0',
          fansColor: '#1e293b',
          screenColor: '#22c55e',
          buttonsColor: '#64748b',
          topColor: '#0f172a',
          stickers: 'gomining-classic',
        },
        packageSnapshot: {
          packageId: cleanPackageId,
          name: packageName,
          powerTh,
          price: canonicalPrice,
          currency: 'USD',
          cadence,
          purchaseMode: cadence,
        },
        createdAt: nowIso,
        createdAtIso: nowIso,
      };
      transaction.set(minerRef, storedMiner);

      // 3. Create admin order under /admin_orders/{orderId}
      const orderRef = db.collection('admin_orders').doc(orderId);
      const userName = userEmail ? userEmail.split('@')[0] : uid;
      const adminOrder = {
        orderId,
        attemptId: `att_${cleanPurchaseId}`,
        createdAt: nowIso,
        userId: uid,
        userEmail: userEmail || '',
        userName,
        packageId: cleanPackageId,
        packageName,
        contractedTh: powerTh,
        amountUsd: canonicalPrice,
        cryptoAsset: 'USDT',
        cryptoAmount: `${canonicalPrice} USDT`,
        paymentNetwork: 'PLATFORM_BALANCE',
        recipientAddress: 'INTERNAL_PLATFORM_BALANCE',
        txHash: `platform_balance:${cleanPurchaseId}`,
        confirmations: 1,
        requiredConfirmations: 1,
        status: 'SETTLED',
        bridgeStatus: 'NONE',
        activatedMinerId: minerId,
        idempotencyKey: cleanPurchaseId,
        settledAt: nowIso,
      };
      transaction.set(orderRef, adminOrder);

      // 4. Create admin contract under /admin_contracts/{contractId}
      const contractRef = db.collection('admin_contracts').doc(contractId);
      const expiresAt = new Date(now.getTime() + durationDays * 86400000).toISOString();
      const adminContract = {
        id: contractId,
        userId: uid,
        userEmail: userEmail || '',
        packageId: cleanPackageId,
        packageName,
        contractedTh: powerTh,
        allocatedTh: powerTh,
        status: 'ACTIVE',
        pricePaidUsdt: canonicalPrice,
        variablePct,
        commissionPct,
        workerId: `worker_${minerId}`,
        activatedAt: nowIso,
        expiresAt,
        accumulatedProductionPrl: 0,
        accumulatedNetProfitUsd: 0,
        lastCalculatedAt: nowIso,
        txHash: `platform_balance:${cleanPurchaseId}`,
        network: 'PLATFORM_BALANCE',
        source: 'PLATFORM_BALANCE',
        ownerWallet: 'INTERNAL',
        createdAt: nowIso,
      };
      transaction.set(contractRef, adminContract);

      // 5. Save idempotency record
      const idempotencyRecord = {
        idempotencyKey: `${uid}__${cleanPurchaseId}`,
        uid,
        purchaseId: cleanPurchaseId,
        packageId: cleanPackageId,
        minerId,
        orderId,
        contractId,
        canonicalPrice,
        balance: newBalance,
        status: 'COMPLETED',
        success: true,
        createdAt: nowIso,
      };
      transaction.set(idempotencyRef, idempotencyRecord);

      return {
        success: true,
        minerId,
        orderId,
        balance: newBalance,
      };
    });
  }
}

export const platformBalancePurchaseService = new PlatformBalancePurchaseService();
