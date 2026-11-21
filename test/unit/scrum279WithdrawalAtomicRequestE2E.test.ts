import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  CANONICAL_USDT_NETWORKS,
  isWithdrawalModuleError,
  usdtToMicros,
} from '../../src/types/withdrawal.js';
import { seedCanonicalUsdtNetworks } from '../../server/services/withdrawalNetworksService.js';
import {
  WITHDRAWAL_IDEMPOTENCY_COLLECTION,
  executeAtomicWithdrawalRequest,
  type FirestoreDocRefLike,
  type FirestoreTransactionLike,
  type TransactionalFirestoreLike,
} from '../../server/services/withdrawalRequestLockService.js';
import { createWithdrawalConfigQuoteRouter } from '../../server/services/withdrawalConfigQuoteRouter.js';

/**
 * Creates a hermetic in-memory Firestore implementation with serialized `runTransaction`
 * and staged writes (writes only commit if the transaction callback resolves without throwing).
 */
function createHermeticTransactionalFirestore(): {
  firestore: TransactionalFirestoreLike;
  getCollectionMap: (name: string) => Map<string, Record<string, unknown>>;
} {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  const getCollectionMap = (name: string) => {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name)!;
  };

  let txMutex: Promise<unknown> = Promise.resolve();

  const firestore: TransactionalFirestoreLike = {
    collection: (name: string) => ({
      doc: (id: string) => {
        const ref: FirestoreDocRefLike & { __col: string; id: string } = {
          __col: name,
          id,
          get: async () => {
            const col = getCollectionMap(name);
            const data = col.get(id);
            return {
              id,
              exists: data !== undefined,
              data: () => (data ? structuredClone(data) : undefined),
            };
          },
          set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
            const col = getCollectionMap(name);
            const prev = col.get(id) || {};
            col.set(id, options?.merge ? { ...prev, ...structuredClone(data) } : structuredClone(data));
          },
        };
        return ref;
      },
      get: async () => {
        const col = getCollectionMap(name);
        return {
          docs: Array.from(col.entries()).map(([id, data]) => ({
            id,
            exists: true,
            data: () => structuredClone(data),
          })),
        };
      },
    }),
    runTransaction: async <T>(
      updateFunction: (tx: FirestoreTransactionLike) => Promise<T>,
    ): Promise<T> => {
      const execute = async (): Promise<T> => {
        const stagedWrites: Array<() => void> = [];
        let writePhaseStarted = false;

        const tx: FirestoreTransactionLike = {
          get: async (ref: any) => {
            if (writePhaseStarted) {
              throw new Error(
                'FIRESTORE_TRANSACTION_VIOLATION: All reads must be executed before any write inside runTransaction.',
              );
            }
            return ref.get();
          },
          set: (ref: any, data: Record<string, unknown>, options?: { merge?: boolean }) => {
            writePhaseStarted = true;
            const cloned = structuredClone(data);
            stagedWrites.push(() => {
              const col = getCollectionMap(ref.__col);
              const prev = col.get(ref.id) || {};
              col.set(ref.id, options?.merge ? { ...prev, ...cloned } : cloned);
            });
          },
          update: (ref: any, data: Record<string, unknown>) => {
            writePhaseStarted = true;
            const cloned = structuredClone(data);
            stagedWrites.push(() => {
              const col = getCollectionMap(ref.__col);
              const prev = col.get(ref.id) || {};
              col.set(ref.id, { ...prev, ...cloned });
            });
          },
        };

        const result = await updateFunction(tx);
        for (const applyWrite of stagedWrites) {
          applyWrite();
        }
        return result;
      };

      const next = txMutex.then(execute, execute);
      txMutex = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };

  return { firestore, getCollectionMap };
}

describe('SCRUM-279 (W04): Atomic Withdrawal Request Service & Express POST /api/withdrawals/request E2E', () => {
  it('1. executes Phase 1 reads before Phase 2 writes, writes all 6 documents atomically, and syncs /users/{uid}.balance mirror', async () => {
    const { firestore, getCollectionMap } = createHermeticTransactionalFirestore();
    await seedCanonicalUsdtNetworks(firestore);

    // Initialize user with /users/{uid}.balance = 80.00 USDT (no /userBalances doc yet to verify automatic initialization)
    getCollectionMap('users').set('uid-new-miner', {
      uid: 'uid-new-miner',
      email: 'newminer@pouw.io',
      balance: 80,
      membershipTier: 'ELITE',
    });

    const result = await executeAtomicWithdrawalRequest(
      firestore,
      { uid: 'uid-new-miner', email: 'newminer@pouw.io' },
      {
        networkId: 'usdt-tron',
        destinationAddress: 'TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL',
        requestedAmountMicros: usdtToMicros(30), // 30 USDT + 1.00 network fee + 0.30 platform fee = 31.30 USDT total debit
        idempotencyKey: 'idem_tron_30usdt_001',
      },
      { nowIso: () => '2026-11-18T03:10:00.000Z' },
    );

    assert.equal(result.status, 201);
    assert.equal(result.idempotentReplay, false);
    assert.equal(result.withdrawalRequest.status, 'REQUESTED');
    assert.equal(result.withdrawalRequest.totalDebitMicros, 31_300_000);
    assert.equal(result.withdrawalRequest.netAmountMicros, 30_000_000);

    // Verify all 6 documents in Firestore
    const balDoc = getCollectionMap('userBalances').get('uid-new-miner')!;
    assert.equal(balDoc.availableBalanceMicros, 48_700_000); // 80.00 - 31.30 = 48.70 USDT
    assert.equal(balDoc.lockedBalanceMicros, 31_300_000);
    assert.equal(balDoc.version, 1);

    const userMirrorDoc = getCollectionMap('users').get('uid-new-miner')!;
    assert.equal(userMirrorDoc.balance, 48.7);

    const wthDoc = getCollectionMap('withdrawalRequests').get(result.withdrawalRequest.id)!;
    assert.equal(wthDoc.status, 'REQUESTED');
    assert.equal(wthDoc.membershipTierSnapshot, 'ELITE');

    const ledgerDoc = getCollectionMap('financialLedger').get(result.ledgerEntryId)!;
    assert.equal(ledgerDoc.type, 'WITHDRAWAL_LOCK');
    assert.equal(ledgerDoc.direction, 'DEBIT');
    assert.equal(ledgerDoc.amountMicros, 31_300_000);
    assert.equal(ledgerDoc.balanceBeforeMicros, 80_000_000);
    assert.equal(ledgerDoc.balanceAfterMicros, 48_700_000);

    const auditDoc = getCollectionMap('withdrawalAuditEvents').get(result.auditEventId)!;
    assert.equal(auditDoc.action, 'CREATE');
    assert.equal(auditDoc.newStatus, 'REQUESTED');

    const idemDoc = getCollectionMap(WITHDRAWAL_IDEMPOTENCY_COLLECTION).get(
      'uid-new-miner__idem_tron_30usdt_001',
    )!;
    assert.equal(idemDoc.withdrawalId, result.withdrawalRequest.id);
  });

  describe('2. E2E Express Router Verification: POST /api/withdrawals/request (Idempotency, Fault Codes & Adversarial Concurrency)', () => {
    let server: http.Server;
    let baseUrl = '';
    const { firestore, getCollectionMap } = createHermeticTransactionalFirestore();

    const tokenMap: Record<string, any> = {
      'tok-whale': {
        uid: 'uid-whale-01',
        email: 'whale@pouw.io',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      },
      'tok-concurrent': {
        uid: 'uid-concurrent-01',
        email: 'concurrent@pouw.io',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      },
    };

    before(async () => {
      await seedCanonicalUsdtNetworks(firestore);

      getCollectionMap('userBalances').set('uid-whale-01', {
        uid: 'uid-whale-01',
        email: 'whale@pouw.io',
        membershipTier: 'WHALE',
        availableBalanceMicros: usdtToMicros(100), // 100.00 USDT
        lockedBalanceMicros: 0,
        totalWithdrawnMicros: 0,
        version: 1,
        updatedAt: '2026-11-18T03:00:00.000Z',
      });
      getCollectionMap('users').set('uid-whale-01', {
        uid: 'uid-whale-01',
        email: 'whale@pouw.io',
        balance: 100,
      });

      getCollectionMap('userBalances').set('uid-concurrent-01', {
        uid: 'uid-concurrent-01',
        email: 'concurrent@pouw.io',
        membershipTier: 'PRO',
        availableBalanceMicros: usdtToMicros(100), // 100.00 USDT
        lockedBalanceMicros: 0,
        totalWithdrawnMicros: 0,
        version: 1,
        updatedAt: '2026-11-18T03:00:00.000Z',
      });
      getCollectionMap('users').set('uid-concurrent-01', {
        uid: 'uid-concurrent-01',
        email: 'concurrent@pouw.io',
        balance: 100,
      });

      const app = express();
      app.use(express.json());
      app.use(
        '/api/withdrawals',
        createWithdrawalConfigQuoteRouter({
          authAdapter: {
            isInitialized: () => true,
            getApp: () => null,
            verifyIdToken: async (tok: string) => tokenMap[tok] ?? null,
          },
          firestore,
        }),
      );

      server = http.createServer(app);
      await new Promise<void>((resolveListen) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as any;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolveListen();
        });
      });
    });

    after(async () => {
      if (server) {
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      }
    });

    it('handles creation (201), idempotent replay (200), payload conflict (409), and validation faults (W04-LOCK_TX-*)', async () => {
      // 1. Invalid address for network -> 422 W04-LOCK_TX-422-INVALID_DESTINATION_ADDRESS
      const badAddrRes = await fetch(`${baseUrl}/api/withdrawals/request`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok-whale',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          networkId: 'usdt-bsc',
          destinationAddress: 'TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL', // Tron address on BSC
          requestedAmountMicros: usdtToMicros(20),
          idempotencyKey: 'idem_bad_addr_001',
        }),
      });
      assert.equal(badAddrRes.status, 422);
      const badAddrBody = (await badAddrRes.json()) as any;
      assert.equal(badAddrBody.faultCode, 'W04-LOCK_TX-422-INVALID_DESTINATION_ADDRESS');

      // 2. Valid 50 USDT request on BSC -> 201 Created
      const createRes = await fetch(`${baseUrl}/api/withdrawals/request`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok-whale',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          networkId: 'usdt-bsc',
          destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
          requestedAmountMicros: usdtToMicros(50),
          idempotencyKey: 'idem_whale_50usdt_001',
        }),
      });
      assert.equal(createRes.status, 201);
      const createBody = (await createRes.json()) as any;
      assert.equal(createBody.ok, true);
      assert.equal(createBody.idempotentReplay, false);
      assert.equal(createBody.userBalance.availableBalanceMicros, 49_000_000);
      assert.equal(createBody.userBalance.lockedBalanceMicros, 51_000_000);
      assert.equal(createBody.syncedUserBalanceUsdt, 49);

      // 3. Exact replay with same idempotencyKey -> 200 OK, zero duplicate debit
      const replayRes = await fetch(`${baseUrl}/api/withdrawals/request`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok-whale',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          networkId: 'usdt-bsc',
          destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
          requestedAmountMicros: usdtToMicros(50),
          idempotencyKey: 'idem_whale_50usdt_001',
        }),
      });
      assert.equal(replayRes.status, 200);
      const replayBody = (await replayRes.json()) as any;
      assert.equal(replayBody.idempotentReplay, true);
      assert.equal(replayBody.withdrawalRequest.id, createBody.withdrawalRequest.id);
      assert.equal(replayBody.userBalance.availableBalanceMicros, 49_000_000);

      // 4. Conflicting payload with same idempotencyKey -> 409 W04-LOCK_TX-409-IDEMPOTENCY_KEY_PAYLOAD_CONFLICT
      const conflictRes = await fetch(`${baseUrl}/api/withdrawals/request`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok-whale',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          networkId: 'usdt-bsc',
          destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
          requestedAmountMicros: usdtToMicros(30),
          idempotencyKey: 'idem_whale_50usdt_001',
        }),
      });
      assert.equal(conflictRes.status, 409);
      const conflictBody = (await conflictRes.json()) as any;
      assert.equal(
        conflictBody.faultCode,
        'W04-LOCK_TX-409-IDEMPOTENCY_KEY_PAYLOAD_CONFLICT',
      );
    });

    it('enforces atomic double-spend protection under adversarial concurrent HTTP requests', async () => {
      // Two simultaneous 60 USDT withdrawals against 100 USDT balance
      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/api/withdrawals/request`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer tok-concurrent',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            networkId: 'usdt-bsc',
            destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
            requestedAmountMicros: usdtToMicros(60),
            idempotencyKey: 'idem_concurrent_req_A',
          }),
        }),
        fetch(`${baseUrl}/api/withdrawals/request`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer tok-concurrent',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            networkId: 'usdt-bsc',
            destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
            requestedAmountMicros: usdtToMicros(60),
            idempotencyKey: 'idem_concurrent_req_B',
          }),
        }),
      ]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      assert.deepEqual(
        statuses,
        [201, 409],
        'One concurrent request must succeed with 201 and the other must fail with 409 Conflict',
      );

      const failedRes = res1.status === 409 ? res1 : res2;
      const failedBody = (await failedRes.json()) as any;
      assert.equal(
        failedBody.faultCode,
        'W04-LOCK_TX-409-INSUFFICIENT_AVAILABLE_BALANCE',
      );

      const finalBal = getCollectionMap('userBalances').get('uid-concurrent-01')!;
      assert.equal(finalBal.availableBalanceMicros, 38_900_000);
      assert.equal(finalBal.lockedBalanceMicros, 61_100_000);

      const finalUserMirror = getCollectionMap('users').get('uid-concurrent-01')!;
      assert.equal(finalUserMirror.balance, 38.9);
    });
  });
});
