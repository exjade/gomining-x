import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { app } from '../../server/server.js';
import { firebaseAdminAuthAdapter } from '../../server/services/firebaseAdminAuthAdapter.js';
import { platformBalancePurchaseService } from '../../server/services/platformBalancePurchaseService.js';

/**
 * In-memory transactional Firestore mock for SCRUM-221 unit tests.
 * Implements reads-before-writes, staged writes, rollback on error,
 * and Optimistic Concurrency Control (OCC) with automatic retry.
 */
class InMemoryTransactionalFirestore {
  public documents = new Map<string, { data: Record<string, any>; version: number }>();

  public setDocument(docPath: string, data: Record<string, any>): void {
    const existing = this.documents.get(docPath);
    const version = existing ? existing.version + 1 : 1;
    this.documents.set(docPath, { data: JSON.parse(JSON.stringify(data)), version });
  }

  public getDocument(docPath: string): Record<string, any> | null {
    const entry = this.documents.get(docPath);
    return entry && entry.data ? JSON.parse(JSON.stringify(entry.data)) : null;
  }

  public getDocumentsByPrefix(prefix: string): Array<{ path: string; data: Record<string, any> }> {
    const results: Array<{ path: string; data: Record<string, any> }> = [];
    for (const [docPath, entry] of this.documents.entries()) {
      if (docPath.startsWith(prefix) && entry.data) {
        results.push({ path: docPath, data: JSON.parse(JSON.stringify(entry.data)) });
      }
    }
    return results;
  }

  private createDocRef(docPath: string) {
    const parts = docPath.split('/');
    const id = parts[parts.length - 1];
    return {
      id,
      path: docPath,
      collection: (subColName: string) => this.createCollectionRef(`${docPath}/${subColName}`),
      get: async () => {
        const entry = this.documents.get(docPath);
        return {
          id,
          path: docPath,
          exists: Boolean(entry && entry.data),
          data: () => (entry?.data ? JSON.parse(JSON.stringify(entry.data)) : undefined),
        };
      },
      set: async (data: any, options?: any) => {
        const existing = this.documents.get(docPath);
        const merged = options?.merge && existing?.data ? { ...existing.data, ...data } : { ...data };
        this.setDocument(docPath, merged);
      },
      update: async (data: any) => {
        const existing = this.documents.get(docPath);
        if (!existing || !existing.data) {
          throw new Error(`Document ${docPath} does not exist for update`);
        }
        this.setDocument(docPath, { ...existing.data, ...data });
      },
    };
  }

  private createCollectionRef(colPath: string) {
    return {
      doc: (docId?: string) => {
        const id = docId || `auto_${Math.random().toString(36).slice(2, 11)}`;
        return this.createDocRef(`${colPath}/${id}`);
      },
    };
  }

  public collection(colName: string) {
    return this.createCollectionRef(colName);
  }

  public async runTransaction<T>(updateFunction: (transaction: any) => Promise<T>, maxRetries = 10): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const readVersions = new Map<string, number>();
      const stagedWrites: Array<() => void> = [];

      const tx = {
        get: async (docRef: any) => {
          const entry = this.documents.get(docRef.path);
          readVersions.set(docRef.path, entry ? entry.version : 0);
          return {
            id: docRef.id,
            path: docRef.path,
            exists: Boolean(entry && entry.data),
            data: () => (entry?.data ? JSON.parse(JSON.stringify(entry.data)) : undefined),
          };
        },
        set: (docRef: any, data: any, options?: any) => {
          stagedWrites.push(() => {
            const existing = this.documents.get(docRef.path);
            const merged = options?.merge && existing?.data ? { ...existing.data, ...data } : { ...data };
            const currentVer = existing ? existing.version : 0;
            this.documents.set(docRef.path, { data: JSON.parse(JSON.stringify(merged)), version: currentVer + 1 });
          });
        },
        update: (docRef: any, data: any) => {
          stagedWrites.push(() => {
            const existing = this.documents.get(docRef.path);
            if (!existing || !existing.data) {
              throw new Error(`Document ${docRef.path} does not exist for update`);
            }
            const updated = { ...existing.data, ...data };
            this.documents.set(docRef.path, { data: JSON.parse(JSON.stringify(updated)), version: existing.version + 1 });
          });
        },
      };

      try {
        const result = await updateFunction(tx);

        // Concurrency OCC validation: did any read document mutate before commit?
        let conflict = false;
        for (const [docPath, readVer] of readVersions.entries()) {
          const currentEntry = this.documents.get(docPath);
          const currentVer = currentEntry ? currentEntry.version : 0;
          if (currentVer !== readVer) {
            conflict = true;
            break;
          }
        }

        if (conflict) {
          // Retry transaction on OCC race
          await new Promise((res) => setTimeout(res, 5 + Math.random() * 15));
          continue;
        }

        // Commit all staged writes atomically
        for (const write of stagedWrites) {
          write();
        }

        return result;
      } catch (err) {
        // Rollback: zero staged writes applied
        throw err;
      }
    }
    throw new Error('Transaction aborted: excessive concurrency contention');
  }
}

describe('SCRUM-221: Platform Balance Purchase Integration & Unit Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let mockDb: InMemoryTransactionalFirestore;

  beforeEach(async () => {
    mockDb = new InMemoryTransactionalFirestore();
    platformBalancePurchaseService.setFirestore(mockDb);

    firebaseAdminAuthAdapter.setAuthInstance({
      verifyIdToken: async (token: string) => {
        if (token === 'token_buyer_1') {
          return { uid: 'uid_buyer_1', email: 'buyer1@minerx.cloud', firebase: { sign_in_provider: 'password' } };
        }
        if (token === 'token_buyer_2') {
          return { uid: 'uid_buyer_2', email: 'buyer2@minerx.cloud', firebase: { sign_in_provider: 'password' } };
        }
        if (token === 'token_buyer_race') {
          return { uid: 'uid_buyer_race', email: 'race@minerx.cloud', firebase: { sign_in_provider: 'password' } };
        }
        if (token === 'token_anonymous') {
          return { uid: 'anon_uid', firebase: { sign_in_provider: 'anonymous' } };
        }
        return null;
      },
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    firebaseAdminAuthAdapter.setAuthInstance(null);
    platformBalancePurchaseService.setFirestore(null);
  });

  it('1. Saldo suficiente: debit correcto + miner/order/contract docs creados', async () => {
    // Setup initial state
    mockDb.setDocument('users/uid_buyer_1', {
      uid: 'uid_buyer_1',
      balance: 500,
      purchasesCount: 0,
    });
    mockDb.setDocument('commercial_packages/pkg_alpha', {
      id: 'pkg_alpha',
      name: 'Alpha Rig 50TH',
      powerTh: 50,
      priceUsdt: 200,
      status: 'ACTIVE',
      isPublished: true,
      cadence: 'once',
      durationDays: 365,
    });

    const res = await fetch(`${baseUrl}/api/purchases/platform-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_buyer_1',
      },
      body: JSON.stringify({
        packageId: 'pkg_alpha',
        purchaseId: 'purch_test_1',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.success, true);
    assert.equal(body.balance, 300);
    assert.equal(body.minerId, 'miner_purch_test_1');
    assert.equal(body.orderId, 'ord_purch_test_1');

    // Verify Firestore mutations
    const updatedUser = mockDb.getDocument('users/uid_buyer_1');
    assert.ok(updatedUser);
    assert.equal(updatedUser.balance, 300);
    assert.equal(updatedUser.purchasesCount, 1);
    assert.ok(updatedUser.lastPurchaseAt);

    const minerDoc = mockDb.getDocument('miners/uid_buyer_1/miner/miner_purch_test_1');
    assert.ok(minerDoc);
    assert.equal(minerDoc.powerTh, 50);
    assert.equal(minerDoc.price, 200);
    assert.equal(minerDoc.status, 'active');
    assert.equal(minerDoc.txHash, 'platform_balance:purch_test_1');

    const orderDoc = mockDb.getDocument('admin_orders/ord_purch_test_1');
    assert.ok(orderDoc);
    assert.equal(orderDoc.amountUsd, 200);
    assert.equal(orderDoc.status, 'SETTLED');
    assert.equal(orderDoc.userId, 'uid_buyer_1');

    const contractDoc = mockDb.getDocument('admin_contracts/ctr_purch_test_1');
    assert.ok(contractDoc);
    assert.equal(contractDoc.contractedTh, 50);
    assert.equal(contractDoc.status, 'ACTIVE');

    const idempotencyDoc = mockDb.getDocument('purchase_idempotency/uid_buyer_1__purch_test_1');
    assert.ok(idempotencyDoc);
    assert.equal(idempotencyDoc.status, 'COMPLETED');
    assert.equal(idempotencyDoc.balance, 300);
  });

  it('2. Saldo insuficiente: 409 + no writes', async () => {
    mockDb.setDocument('users/uid_buyer_2', {
      uid: 'uid_buyer_2',
      balance: 50,
      purchasesCount: 0,
    });
    mockDb.setDocument('commercial_packages/pkg_alpha', {
      id: 'pkg_alpha',
      name: 'Alpha Rig 50TH',
      powerTh: 50,
      priceUsdt: 200,
      status: 'ACTIVE',
      isPublished: true,
    });

    const res = await fetch(`${baseUrl}/api/purchases/platform-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_buyer_2',
      },
      body: JSON.stringify({
        packageId: 'pkg_alpha',
        purchaseId: 'purch_test_2',
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json() as any;
    assert.ok(body.error.includes('Saldo insuficiente'));

    // Verify balance untouched and zero writes
    const userDoc = mockDb.getDocument('users/uid_buyer_2');
    assert.equal(userDoc?.balance, 50);
    assert.equal(userDoc?.purchasesCount, 0);

    const miners = mockDb.getDocumentsByPrefix('miners/uid_buyer_2');
    assert.equal(miners.length, 0);

    const orders = mockDb.getDocumentsByPrefix('admin_orders/ord_purch_test_2');
    assert.equal(orders.length, 0);
  });

  it('3. Auth inválida / ausente / anónima: 401 + no writes', async () => {
    mockDb.setDocument('users/uid_buyer_1', {
      uid: 'uid_buyer_1',
      balance: 500,
    });
    mockDb.setDocument('commercial_packages/pkg_alpha', {
      id: 'pkg_alpha',
      priceUsdt: 200,
      status: 'ACTIVE',
      isPublished: true,
    });

    // Case A: Missing header
    const resNoAuth = await fetch(`${baseUrl}/api/purchases/platform-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId: 'pkg_alpha', purchaseId: 'p_no_auth' }),
    });
    assert.equal(resNoAuth.status, 401);

    // Case B: Invalid/expired token
    const resBadToken = await fetch(`${baseUrl}/api/purchases/platform-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_or_expired_token',
      },
      body: JSON.stringify({ packageId: 'pkg_alpha', purchaseId: 'p_bad_token' }),
    });
    assert.equal(resBadToken.status, 401);

    // Case C: Anonymous user token
    const resAnon = await fetch(`${baseUrl}/api/purchases/platform-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_anonymous',
      },
      body: JSON.stringify({ packageId: 'pkg_alpha', purchaseId: 'p_anon' }),
    });
    assert.equal(resAnon.status, 401);

    // Balance remains untouched
    const userDoc = mockDb.getDocument('users/uid_buyer_1');
    assert.equal(userDoc?.balance, 500);
  });

  it('4. Package inválido / no publicado / archivado: 404 + no writes', async () => {
    mockDb.setDocument('users/uid_buyer_1', {
      uid: 'uid_buyer_1',
      balance: 500,
    });
    mockDb.setDocument('commercial_packages/pkg_draft', {
      id: 'pkg_draft',
      priceUsdt: 200,
      status: 'DRAFT',
      isPublished: false,
    });
    mockDb.setDocument('commercial_packages/pkg_archived', {
      id: 'pkg_archived',
      priceUsdt: 200,
      status: 'ARCHIVED',
      isPublished: true,
    });

    // Case A: Missing package
    const resNonExistent = await fetch(`${baseUrl}/api/purchases/platform-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_buyer_1',
      },
      body: JSON.stringify({ packageId: 'pkg_not_in_catalog', purchaseId: 'p_missing' }),
    });
    assert.equal(resNonExistent.status, 404);

    // Case B: Draft / unpublished package
    const resDraft = await fetch(`${baseUrl}/api/purchases/platform-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_buyer_1',
      },
      body: JSON.stringify({ packageId: 'pkg_draft', purchaseId: 'p_draft' }),
    });
    assert.equal(resDraft.status, 404);

    // Case C: Archived package
    const resArchived = await fetch(`${baseUrl}/api/purchases/platform-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_buyer_1',
      },
      body: JSON.stringify({ packageId: 'pkg_archived', purchaseId: 'p_archived' }),
    });
    assert.equal(resArchived.status, 404);

    // Balance remains 500
    const userDoc = mockDb.getDocument('users/uid_buyer_1');
    assert.equal(userDoc?.balance, 500);
  });

  it('5. Precio / power enviados por cliente no tienen autoridad', async () => {
    mockDb.setDocument('users/uid_buyer_1', {
      uid: 'uid_buyer_1',
      balance: 500,
    });
    mockDb.setDocument('commercial_packages/pkg_alpha', {
      id: 'pkg_alpha',
      name: 'Alpha Rig 50TH',
      powerTh: 50,
      priceUsdt: 200,
      status: 'ACTIVE',
      isPublished: true,
    });

    // Tampered payload with price: 0.01 and powerTh: 99999
    const res = await fetch(`${baseUrl}/api/purchases/platform-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_buyer_1',
      },
      body: JSON.stringify({
        packageId: 'pkg_alpha',
        purchaseId: 'purch_tamper_5',
        price: 0.01,
        priceUsdt: 0.01,
        powerTh: 99999,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.balance, 300); // 500 - 200 = 300 (NOT 499.99)

    const updatedUser = mockDb.getDocument('users/uid_buyer_1');
    assert.equal(updatedUser?.balance, 300);

    const minerDoc = mockDb.getDocument('miners/uid_buyer_1/miner/miner_purch_tamper_5');
    assert.equal(minerDoc?.price, 200);
    assert.equal(minerDoc?.powerTh, 50);

    const orderDoc = mockDb.getDocument('admin_orders/ord_purch_tamper_5');
    assert.equal(orderDoc?.amountUsd, 200);
    assert.equal(orderDoc?.contractedTh, 50);
  });

  it('6. Mismo purchaseId dos veces: un solo debit y un solo miner (idempotencia)', async () => {
    mockDb.setDocument('users/uid_buyer_1', {
      uid: 'uid_buyer_1',
      balance: 500,
      purchasesCount: 0,
    });
    mockDb.setDocument('commercial_packages/pkg_alpha', {
      id: 'pkg_alpha',
      name: 'Alpha Rig 50TH',
      powerTh: 50,
      priceUsdt: 200,
      status: 'ACTIVE',
      isPublished: true,
    });

    // First purchase call
    const res1 = await fetch(`${baseUrl}/api/purchases/platform-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_buyer_1',
      },
      body: JSON.stringify({
        packageId: 'pkg_alpha',
        purchaseId: 'purch_idempotent_6',
      }),
    });
    assert.equal(res1.status, 200);
    const body1 = await res1.json() as any;
    assert.equal(body1.success, true);
    assert.equal(body1.balance, 300);
    assert.equal(body1.minerId, 'miner_purch_idempotent_6');
    assert.equal(body1.orderId, 'ord_purch_idempotent_6');

    // Second purchase call with same purchaseId
    const res2 = await fetch(`${baseUrl}/api/purchases/platform-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_buyer_1',
      },
      body: JSON.stringify({
        packageId: 'pkg_alpha',
        purchaseId: 'purch_idempotent_6',
      }),
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json() as any;
    assert.equal(body2.success, true);
    assert.equal(body2.balance, 300);
    assert.equal(body2.minerId, body1.minerId);
    assert.equal(body2.orderId, body1.orderId);

    // Verify exactly one debit occurred and one miner created
    const updatedUser = mockDb.getDocument('users/uid_buyer_1');
    assert.equal(updatedUser?.balance, 300);
    assert.equal(updatedUser?.purchasesCount, 1);

    const miners = mockDb.getDocumentsByPrefix('miners/uid_buyer_1/miner');
    assert.equal(miners.length, 1);
  });

  it('7. Dos compras concurrentes no pueden llevar balance debajo de cero', async () => {
    mockDb.setDocument('users/uid_buyer_race', {
      uid: 'uid_buyer_race',
      balance: 250,
      purchasesCount: 0,
    });
    mockDb.setDocument('commercial_packages/pkg_alpha', {
      id: 'pkg_alpha',
      name: 'Alpha Rig 50TH',
      powerTh: 50,
      priceUsdt: 200,
      status: 'ACTIVE',
      isPublished: true,
    });

    const buy = (purchaseId: string) =>
      fetch(`${baseUrl}/api/purchases/platform-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_buyer_race',
        },
        body: JSON.stringify({
          packageId: 'pkg_alpha',
          purchaseId,
        }),
      });

    // Execute 2 concurrent purchase requests of 200 each when balance is 250
    const [resA, resB] = await Promise.all([
      buy('purch_race_a'),
      buy('purch_race_b'),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 409], 'Exactly one request succeeds (200) and one is rejected (409)');

    const userDoc = mockDb.getDocument('users/uid_buyer_race');
    assert.equal(userDoc?.balance, 50, 'User balance is exactly 50 (250 - 200), never negative');
    assert.equal(userDoc?.purchasesCount, 1, 'Purchases count incremented only once');

    const miners = mockDb.getDocumentsByPrefix('miners/uid_buyer_race/miner');
    assert.equal(miners.length, 1, 'Only one miner provisioned');
  });

  it('8. Miner resultante cumple schema que consume POUW-1.8', async () => {
    mockDb.setDocument('users/uid_buyer_1', {
      uid: 'uid_buyer_1',
      balance: 500,
    });
    mockDb.setDocument('commercial_packages/pkg_alpha', {
      id: 'pkg_alpha',
      name: 'Alpha Rig 50TH',
      powerTh: 50,
      priceUsdt: 200,
      status: 'ACTIVE',
      isPublished: true,
      cadence: 'once',
    });

    const res = await fetch(`${baseUrl}/api/purchases/platform-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token_buyer_1',
      },
      body: JSON.stringify({
        packageId: 'pkg_alpha',
        purchaseId: 'purch_schema_8',
      }),
    });

    assert.equal(res.status, 200);

    const miner = mockDb.getDocument('miners/uid_buyer_1/miner/miner_purch_schema_8');
    assert.ok(miner);

    // Validate StoredMiner schema fields
    assert.equal(miner.id, 'miner_purch_schema_8');
    assert.equal(miner.uid, 'uid_buyer_1');
    assert.equal(miner.packageId, 'pkg_alpha');
    assert.equal(miner.name, 'Alpha Rig 50TH');
    assert.equal(miner.powerTh, 50);
    assert.equal(miner.efficiency, 15);
    assert.equal(miner.efficiencyWattsPerTh, 15);
    assert.equal(miner.price, 200);
    assert.ok(miner.currency === 'USD' || miner.currency === 'USDT');
    assert.equal(miner.status, 'active');
    assert.equal(miner.txHash, 'platform_balance:purch_schema_8');
    assert.equal(miner.network, 'PLATFORM_BALANCE');
    assert.equal(miner.ownerWallet, 'INTERNAL');
    assert.equal(miner.purchaseMode, 'once');
    assert.equal(miner.cadence, 'once');

    // Visual traits
    assert.ok(miner.visualTraits);
    assert.equal(typeof miner.visualTraits.wallColor, 'string');
    assert.equal(typeof miner.visualTraits.bodyColor, 'string');
    assert.equal(typeof miner.visualTraits.bottomColor, 'string');
    assert.equal(typeof miner.visualTraits.fansColor, 'string');
    assert.equal(typeof miner.visualTraits.screenColor, 'string');
    assert.equal(typeof miner.visualTraits.buttonsColor, 'string');
    assert.equal(typeof miner.visualTraits.topColor, 'string');
    assert.equal(miner.visualTraits.stickers, 'gomining-classic');

    // Package snapshot
    assert.ok(miner.packageSnapshot);
    assert.equal(miner.packageSnapshot.packageId, 'pkg_alpha');
    assert.equal(miner.packageSnapshot.name, 'Alpha Rig 50TH');
    assert.equal(miner.packageSnapshot.powerTh, 50);
    assert.equal(miner.packageSnapshot.price, 200);

    // Timestamp parseability
    assert.ok(miner.createdAtIso);
    const parsedTime = Date.parse(miner.createdAtIso);
    assert.equal(isNaN(parsedTime), false);
    assert.ok(parsedTime > 0);
  });
});
