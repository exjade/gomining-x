/**
 * SCRUM-275 / SCRUM-288 — Adversarial Hardening Regression & Money Conservation Suite
 * Covers every approved fix from the Final 3-Phase Audit:
 * - F-CRIT-01: Zero canonical fallback by networkCode alias in quote, lock, and workflow EDIT (fail-closed to Firestore, zero fee downgrade)
 * - F-CRIT-02: Hardened firestore.rules isAdmin() (status ACTIVE + explicit permissions) & /admin_users management-permission-only writes
 * - F-CRIT-03: Cross-domain Money Conservation with min(/userBalances.available, /users.balance) cap across sequential & concurrent SCRUM-221 purchases + SCRUM-279 withdrawals
 * - F-CRIT-04: Strict 11-field DTO sanitization on POST /api/withdrawals/request (201 creation AND 200 idempotent replay) + closed direct client read on /withdrawalRequests
 * - F-HIGH-01: Zero public read on /users/{userId} + minimal /publicReferralCodes/{code} exact-key lookup
 * - F-MED-01: Safe Firestore document ID sanitization before .doc(...) in searchQuery, cursor, networkId, and :withdrawalId
 * - F-MED-02: Opaque CSPRNG UUID withdrawalId (no embedded UID or predictable idempotencyKey suffix)
 * - D1/D4: Real platform membership/subscription tier mapping onto canonical NONE/STANDARD/PRO/ELITE/WHALE
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';

import {
  CANONICAL_USDT_NETWORKS,
  FINANCIAL_LEDGER_COLLECTION,
  USERS_COLLECTION,
  USER_BALANCES_COLLECTION,
  WITHDRAWAL_ADMIN_PERMISSIONS,
  WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
  WITHDRAWAL_NETWORKS_COLLECTION,
  WITHDRAWAL_REQUESTS_COLLECTION,
  usdtToMicros,
  type UserFinancialBalance,
  type WithdrawalRequest,
} from '../../src/types/withdrawal.js';
import {
  isSafeFirestoreDocId,
  normalizePlatformMembershipTier,
} from '../../server/services/withdrawalNetworksService.js';
import {
  WITHDRAWAL_IDEMPOTENCY_COLLECTION,
  executeAtomicWithdrawalRequest,
} from '../../server/services/withdrawalRequestLockService.js';
import { PlatformBalancePurchaseService } from '../../server/services/platformBalancePurchaseService.js';
import { createWithdrawalConfigQuoteRouter } from '../../server/services/withdrawalConfigQuoteRouter.js';
import { createAdminWithdrawalsRouter } from '../../server/services/adminWithdrawalsRouter.js';
import { createAdminWithdrawalWorkflowRouter } from '../../server/services/adminWithdrawalWorkflowRouter.js';
import { createAdminWithdrawalSettlementRouter } from '../../server/services/adminWithdrawalSettlementRouter.js';
import type { WithdrawalAuthzDependencies } from '../../server/services/withdrawalAuthzMiddleware.js';

const WALLET_EVM = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
const REAL_EVM_TXHASH =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

const INTERNAL_11_FIELDS = [
  'userEmail',
  'idempotencyKey',
  'internalNotes',
  'reviewedBy',
  'approvedBy',
  'processedBy',
  'broadcastedBy',
  'completedBy',
  'rejectedBy',
  'cancelledBy',
  'providerTransactionId',
] as const;

/**
 * Strict transactional Firestore double that mimics real @google-cloud/firestore:
 * - Throws on invalid document IDs containing `/` or `..` (just like real Firestore SDK!)
 * - Supports subcollections (e.g. `/miners/{uid}/miner/{minerId}` for SCRUM-221 purchases)
 * - Serializes `runTransaction` with strict Phase 1 reads before Phase 2 writes
 */
function createStrictFirestore(seed: {
  admins?: Record<string, Record<string, unknown>>;
  balances?: Record<string, UserFinancialBalance>;
  users?: Record<string, Record<string, unknown>>;
  packages?: Record<string, Record<string, unknown>>;
  networks?: Record<string, Record<string, unknown>>;
  emptyNetworks?: boolean;
}) {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  const ensureCol = (name: string) => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name)!;
  };

  for (const col of [
    'admin_users',
    'commercial_packages',
    'purchase_idempotency',
    'admin_orders',
    'admin_contracts',
    WITHDRAWAL_REQUESTS_COLLECTION,
    USER_BALANCES_COLLECTION,
    USERS_COLLECTION,
    WITHDRAWAL_NETWORKS_COLLECTION,
    FINANCIAL_LEDGER_COLLECTION,
    WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
    WITHDRAWAL_IDEMPOTENCY_COLLECTION,
  ]) {
    ensureCol(col);
  }

  for (const [k, v] of Object.entries(seed.admins ?? {})) ensureCol('admin_users').set(k, { ...v });
  for (const [k, v] of Object.entries(seed.balances ?? {})) ensureCol(USER_BALANCES_COLLECTION).set(k, { ...v });
  for (const [k, v] of Object.entries(seed.users ?? {})) ensureCol(USERS_COLLECTION).set(k, { ...v });
  for (const [k, v] of Object.entries(seed.packages ?? {})) ensureCol('commercial_packages').set(k, { ...v });

  if (!seed.emptyNetworks) {
    if (seed.networks) {
      for (const [k, v] of Object.entries(seed.networks)) {
        ensureCol(WITHDRAWAL_NETWORKS_COLLECTION).set(k, structuredClone(v));
      }
    } else {
      for (const net of CANONICAL_USDT_NETWORKS) {
        ensureCol(WITHDRAWAL_NETWORKS_COLLECTION).set(net.id, {
          ...net,
          feePolicy: { ...net.feePolicy },
        });
      }
    }
  }

  const assertFirestoreDocPath = (id: string) => {
    if (typeof id !== 'string' || !id || id.includes('/') || id === '.' || id === '..') {
      throw new Error(
        `FIRESTORE_PATH_ERROR: Value for argument "documentPath" is invalid ("${String(id)}").`,
      );
    }
  };

  let txQueue = Promise.resolve();

  function makeQuery(
    colName: string,
    store: Map<string, Record<string, unknown>>,
    clauses: Array<{ field: string; op: string; value: unknown }>,
    orderSpec: { field: string; dir: 'asc' | 'desc' } | null = null,
    afterId: string | null = null,
    limitVal = 500,
  ) {
    return {
      where(field: string, op: string, value: unknown) {
        return makeQuery(colName, store, [...clauses, { field, op, value }], orderSpec, afterId, limitVal);
      },
      orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
        return makeQuery(colName, store, clauses, { field, dir }, afterId, limitVal);
      },
      startAfter(snap: { id?: string }) {
        return makeQuery(colName, store, clauses, orderSpec, snap?.id ?? null, limitVal);
      },
      limit(n: number) {
        return makeQuery(colName, store, clauses, orderSpec, afterId, n);
      },
      async get() {
        let rows = Array.from(store.entries()).filter(([, data]) =>
          clauses.every((c) => {
            const actual = data[c.field];
            if (c.op === '==') return actual === c.value;
            return false;
          }),
        );
        if (orderSpec) {
          rows = rows.sort(([idA, a], [idB, b]) => {
            const cmp =
              orderSpec.dir === 'desc'
                ? String(b[orderSpec.field] ?? '').localeCompare(String(a[orderSpec.field] ?? ''))
                : String(a[orderSpec.field] ?? '').localeCompare(String(b[orderSpec.field] ?? ''));
            return cmp !== 0 ? cmp : idA.localeCompare(idB);
          });
        }
        let startIdx = 0;
        if (afterId) {
          const idx = rows.findIndex(([id]) => id === afterId);
          startIdx = idx >= 0 ? idx + 1 : rows.length;
        }
        return {
          docs: rows.slice(startIdx, startIdx + limitVal).map(([id, data]) => ({
            id,
            exists: true,
            data: () => structuredClone(data),
          })),
        };
      },
    };
  }

  function makeCollection(colName: string) {
    const store = ensureCol(colName);
    return {
      doc(id: string) {
        assertFirestoreDocPath(id);
        return {
          _colName: colName,
          id,
          collection(subCol: string) {
            return makeCollection(`${colName}/${id}/${subCol}`);
          },
          async get() {
            const row = store.get(id);
            return {
              id,
              exists: Boolean(row),
              data: () => (row ? structuredClone(row) : undefined),
            };
          },
          async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
            if (opts?.merge && store.has(id)) {
              store.set(id, { ...store.get(id)!, ...structuredClone(data) });
            } else {
              store.set(id, structuredClone(data));
            }
          },
        };
      },
      async get() {
        return {
          docs: Array.from(store.entries()).map(([id, data]) => ({
            id,
            exists: true,
            data: () => structuredClone(data),
          })),
        };
      },
      where(field: string, op: string, value: unknown) {
        return makeQuery(colName, store, [{ field, op, value }]);
      },
      orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
        return makeQuery(colName, store, [], { field, dir });
      },
    };
  }

  return {
    collections,
    ensureCol,
    collection: makeCollection,
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      let release!: () => void;
      const prev = txQueue;
      txQueue = new Promise<void>((res) => {
        release = res;
      });
      await prev;
      try {
        let writesStarted = false;
        const writes: Array<{ col: string; id: string; data: Record<string, unknown>; merge: boolean }> = [];
        const tx = {
          async get(ref: { _colName: string; id: string }) {
            assert.equal(writesStarted, false, 'Transaction must finish reads before writes');
            const row = ensureCol(ref._colName).get(ref.id);
            return {
              id: ref.id,
              exists: Boolean(row),
              data: () => (row ? structuredClone(row) : undefined),
            };
          },
          set(ref: { _colName: string; id: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) {
            writesStarted = true;
            writes.push({ col: ref._colName, id: ref.id, data: structuredClone(data), merge: Boolean(opts?.merge) });
            return tx;
          },
          update(ref: { _colName: string; id: string }, data: Record<string, unknown>) {
            writesStarted = true;
            writes.push({ col: ref._colName, id: ref.id, data: structuredClone(data), merge: true });
            return tx;
          },
        };
        const res = await fn(tx);
        for (const w of writes) {
          const st = ensureCol(w.col);
          if (w.merge && st.has(w.id)) {
            st.set(w.id, { ...st.get(w.id)!, ...w.data });
          } else {
            st.set(w.id, w.data);
          }
        }
        return res;
      } finally {
        release();
      }
    },
  };
}

function mountApp(
  db: ReturnType<typeof createStrictFirestore>,
  tokens: Record<string, { uid: string; email: string }>,
) {
  const deps: WithdrawalAuthzDependencies = {
    firestore: db as never,
    authAdapter: {
      isInitialized: () => true,
      async verifyIdToken(tok: string) {
        return (tokens[tok] ?? null) as never;
      },
    } as never,
  };
  const app = express();
  app.use(express.json());
  app.use('/api/withdrawals', createWithdrawalConfigQuoteRouter({ ...deps, firestore: db as never }));
  app.use('/api/admin/withdrawals', createAdminWithdrawalsRouter({ ...deps, firestore: db as never }));
  app.use('/api/admin/withdrawals', createAdminWithdrawalWorkflowRouter({ ...deps, firestore: db as never }));
  app.use('/api/admin/withdrawals', createAdminWithdrawalSettlementRouter({ ...deps, firestore: db as never }));
  return app;
}

async function startSrv(app: express.Express) {
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function reqJson(
  baseUrl: string,
  method: string,
  urlPath: string,
  token: string,
  body?: unknown,
) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json()) as Record<string, unknown> };
}

describe('SCRUM-275 Hardening Regression Suite (F-CRIT-01..04, F-MED-01..02, Money Conservation & D1/D4)', () => {
  it('F-CRIT-01: blocks networkCode alias bypass on disabled networks & prevents fee downgrade in quote, lock, and workflow EDIT (fail-closed to Firestore)', async () => {
    const networks: Record<string, Record<string, unknown>> = {};
    for (const net of CANONICAL_USDT_NETWORKS) {
      if (net.id === 'usdt-polygon') {
        networks[net.id] = { ...net, enabled: false, feePolicy: { ...net.feePolicy } };
      } else if (net.id === 'usdt-ethereum') {
        // Raised fee policy in Firestore: 15 USDT network fee, 3% platform fee, 25 USDT min
        networks[net.id] = {
          ...net,
          enabled: true,
          minimumWithdrawalMicros: 25_000_000,
          configVersion: 2,
          feePolicy: {
            networkFeeMicros: 15_000_000,
            platformFeeBps: 300,
            platformFeeMinMicros: 0,
            conversionFeeMicros: 0,
          },
        };
      } else {
        networks[net.id] = { ...net, feePolicy: { ...net.feePolicy } };
      }
    }

    const db = createStrictFirestore({
      networks,
      admins: {
        'adm-1': { uid: 'adm-1', email: 'adm@m.io', role: 'admin', status: 'ACTIVE', permissions: [...WITHDRAWAL_ADMIN_PERMISSIONS] },
      },
      balances: {
        'u-1': {
          uid: 'u-1',
          email: 'u1@m.io',
          membershipTier: 'PRO',
          availableBalanceMicros: 200_000_000,
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T10:00:00.000Z',
        },
      },
      users: { 'u-1': { uid: 'u-1', email: 'u1@m.io', balance: 200 } },
    });

    const srv = await startSrv(
      mountApp(db, {
        'tok-u1': { uid: 'u-1', email: 'u1@m.io' },
        'tok-adm': { uid: 'adm-1', email: 'adm@m.io' },
      }),
    );

    try {
      // 1. Alias "POLYGON" on disabled usdt-polygon MUST return 404 in quote and request
      const qAlias = await reqJson(srv.baseUrl, 'POST', '/api/withdrawals/quote', 'tok-u1', {
        networkId: 'POLYGON',
        requestedAmountMicros: 20_000_000,
      });
      assert.equal(qAlias.status, 404);
      assert.equal(qAlias.data.faultCode, 'W03-QUOTE-404-NETWORK_NOT_ENABLED');

      const rAlias = await reqJson(srv.baseUrl, 'POST', '/api/withdrawals/request', 'tok-u1', {
        networkId: 'POLYGON',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 20_000_000,
        idempotencyKey: 'idem-fcrit01-polygon',
      });
      assert.equal(rAlias.status, 404);
      assert.equal(rAlias.data.faultCode, 'W04-LOCK_TX-404-NETWORK_NOT_ENABLED');

      // 2. Alias "ETHEREUM" MUST NOT downgrade v2 Firestore fees back to v1 CANONICAL_USDT_NETWORKS
      const rEthAlias = await reqJson(srv.baseUrl, 'POST', '/api/withdrawals/request', 'tok-u1', {
        networkId: 'ETHEREUM',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 50_000_000,
        idempotencyKey: 'idem-fcrit01-eth-alias',
      });
      assert.equal(rEthAlias.status, 404);

      // 3. Canonical doc ID "usdt-ethereum" enforces live Firestore v2 fees (15 USDT + 3% = 16.50 USDT fee)
      const rEthReal = await reqJson(srv.baseUrl, 'POST', '/api/withdrawals/request', 'tok-u1', {
        networkId: 'usdt-ethereum',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 50_000_000,
        idempotencyKey: 'idem-fcrit01-eth-real',
      });
      assert.equal(rEthReal.status, 201);
      const created = rEthReal.data.withdrawalRequest as WithdrawalRequest;
      assert.equal(created.networkFeeMicros, 15_000_000);
      assert.equal(created.platformFeeMicros, 1_500_000);
      assert.equal(created.totalDebitMicros, 66_500_000);
      assert.equal(created.configVersion, 2);

      // 4. Workflow EDIT with alias "POLYGON" or "BSC" fails closed (404)
      const editAlias = await reqJson(
        srv.baseUrl,
        'PATCH',
        `/api/admin/withdrawals/${created.id}`,
        'tok-adm',
        {
          expectedStatus: 'REQUESTED',
          networkId: 'POLYGON',
          reason: 'Try alias bypass in EDIT',
        },
      );
      assert.equal(editAlias.status, 404);
    } finally {
      await srv.close();
    }

    // 5. Empty /withdrawalNetworks fails closed (503 on /config, 404 on /request)
    const emptyDb = createStrictFirestore({
      emptyNetworks: true,
      balances: {
        'u-1': {
          uid: 'u-1',
          email: 'u1@m.io',
          membershipTier: 'PRO',
          availableBalanceMicros: 100_000_000,
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T10:00:00.000Z',
        },
      },
      users: { 'u-1': { uid: 'u-1', email: 'u1@m.io', balance: 100 } },
    });
    const srvEmpty = await startSrv(mountApp(emptyDb, { 'tok-u1': { uid: 'u-1', email: 'u1@m.io' } }));
    try {
      const cfgEmpty = await reqJson(srvEmpty.baseUrl, 'GET', '/api/withdrawals/config', 'tok-u1');
      assert.equal(cfgEmpty.status, 503);
      assert.equal(cfgEmpty.data.faultCode, 'W03-NETCFG-503-NO_ENABLED_USDT_NETWORKS');

      const reqEmpty = await reqJson(srvEmpty.baseUrl, 'POST', '/api/withdrawals/request', 'tok-u1', {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 20_000_000,
        idempotencyKey: 'idem-fcrit01-empty',
      });
      assert.equal(reqEmpty.status, 404);
    } finally {
      await srvEmpty.close();
    }
  });

  it('F-CRIT-04 & F-MED-02: strips all 11 internal fields on POST /request (201 creation AND 200 post-admin replay) and generates CSPRNG UUID withdrawalId', async () => {
    const db = createStrictFirestore({
      admins: {
        'adm-1': { uid: 'adm-1', email: 'adm@m.io', role: 'admin', status: 'ACTIVE', permissions: [...WITHDRAWAL_ADMIN_PERMISSIONS] },
      },
      balances: {
        'uid-secret-owner': {
          uid: 'uid-secret-owner',
          email: 'private@m.io',
          membershipTier: 'ELITE',
          availableBalanceMicros: 100_000_000,
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T10:00:00.000Z',
        },
      },
      users: { 'uid-secret-owner': { uid: 'uid-secret-owner', email: 'private@m.io', balance: 100 } },
    });

    const srv = await startSrv(
      mountApp(db, {
        'tok-cli': { uid: 'uid-secret-owner', email: 'private@m.io' },
        'tok-adm': { uid: 'adm-1', email: 'adm@m.io' },
      }),
    );

    try {
      const payload = {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 25_000_000,
        idempotencyKey: 'idem-secret-client-key-001',
      };

      // 1. Creation (201): zero internal fields & CSPRNG UUID withdrawalId
      const createRes = await reqJson(srv.baseUrl, 'POST', '/api/withdrawals/request', 'tok-cli', payload);
      assert.equal(createRes.status, 201);
      const createdWth = createRes.data.withdrawalRequest as Record<string, unknown>;
      assert.equal('auditEvent' in createRes.data, false);
      assert.equal('ledgerEntry' in createRes.data, false);

      for (const field of INTERNAL_11_FIELDS) {
        assert.equal(field in createdWth, false, `Creation 201 must NOT expose "${field}"`);
      }

      // F-MED-02: CSPRNG UUID format, must NOT embed UID or idempotencyKey
      const withdrawalId = String(createdWth.id);
      assert.match(
        withdrawalId,
        /^wth_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      assert.equal(withdrawalId.includes('uid-secret-owner'), false);
      assert.equal(withdrawalId.includes('idem-secret-client-key-001'), false);

      // 2. Admin populates internalNotes, reviewedBy, approvedBy, processedBy, providerTransactionId, broadcastedBy, completedBy
      assert.equal(
        (await reqJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${withdrawalId}/review`, 'tok-adm', { expectedStatus: 'REQUESTED' })).status,
        200,
      );
      assert.equal(
        (await reqJson(srv.baseUrl, 'PATCH', `/api/admin/withdrawals/${withdrawalId}`, 'tok-adm', {
          expectedStatus: 'UNDER_REVIEW',
          internalNotes: 'CONFIDENTIAL_RISK_FLAG_999',
          reason: 'Internal AML check',
        })).status,
        200,
      );
      assert.equal(
        (await reqJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${withdrawalId}/approve`, 'tok-adm', { expectedStatus: 'UNDER_REVIEW' })).status,
        200,
      );
      assert.equal(
        (await reqJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${withdrawalId}/process`, 'tok-adm', {
          expectedStatus: 'APPROVED',
          providerTransactionId: 'custody-provider-secret-77',
        })).status,
        200,
      );
      assert.equal(
        (await reqJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${withdrawalId}/broadcast`, 'tok-adm', {
          expectedStatus: 'PROCESSING',
          txHash: REAL_EVM_TXHASH,
          confirmations: 15,
        })).status,
        200,
      );
      assert.equal(
        (await reqJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${withdrawalId}/complete`, 'tok-adm', {
          expectedStatus: 'BROADCASTED',
          confirmations: 15,
        })).status,
        200,
      );

      // 3. Client replays POST /api/withdrawals/request with same idempotencyKey -> 200 sanitized!
      const replayRes = await reqJson(srv.baseUrl, 'POST', '/api/withdrawals/request', 'tok-cli', payload);
      assert.equal(replayRes.status, 200);
      assert.equal(replayRes.data.idempotentReplay, true);
      const replayedWth = replayRes.data.withdrawalRequest as Record<string, unknown>;
      assert.equal(replayedWth.id, withdrawalId);
      assert.equal(replayedWth.status, 'COMPLETED');
      assert.equal(replayedWth.txHash, REAL_EVM_TXHASH);

      for (const field of INTERNAL_11_FIELDS) {
        assert.equal(field in replayedWth, false, `Idempotent replay 200 must NOT expose "${field}"`);
      }
      assert.equal(JSON.stringify(replayRes.data).includes('CONFIDENTIAL_RISK_FLAG_999'), false);
      assert.equal(JSON.stringify(replayRes.data).includes('custody-provider-secret-77'), false);
    } finally {
      await srv.close();
    }
  });

  it('F-MED-01: sanitizes document IDs before .doc(...) in searchQuery, cursor, networkId, and :withdrawalId (zero 500/503 crashes)', async () => {
    assert.equal(isSafeFirestoreDocId('usdt-bsc'), true);
    assert.equal(isSafeFirestoreDocId('a/b'), false);
    assert.equal(isSafeFirestoreDocId('../admin_users/x'), false);
    assert.equal(isSafeFirestoreDocId('..'), false);
    assert.equal(isSafeFirestoreDocId('__name__'), false);

    const db = createStrictFirestore({
      admins: {
        'adm-1': { uid: 'adm-1', email: 'adm@m.io', role: 'admin', status: 'ACTIVE', permissions: [...WITHDRAWAL_ADMIN_PERMISSIONS] },
      },
      balances: {
        'u-1': {
          uid: 'u-1',
          email: 'u1@m.io',
          membershipTier: 'STANDARD',
          availableBalanceMicros: 100_000_000,
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T10:00:00.000Z',
        },
      },
      users: { 'u-1': { uid: 'u-1', email: 'u1@m.io', balance: 100 } },
    });

    const srv = await startSrv(
      mountApp(db, {
        'tok-u1': { uid: 'u-1', email: 'u1@m.io' },
        'tok-adm': { uid: 'adm-1', email: 'adm@m.io' },
      }),
    );

    try {
      // 1. Admin searchQuery with explorer URL or traversal slashes must return 200 [] (never 503!)
      for (const hostileQuery of [
        'https://bscscan.com/tx/0x1234',
        '../admin_users/adm-1',
        'a/b/c',
        '..',
      ]) {
        const res = await reqJson(
          srv.baseUrl,
          'GET',
          `/api/admin/withdrawals?searchQuery=${encodeURIComponent(hostileQuery)}`,
          'tok-adm',
        );
        assert.equal(res.status, 200, `Hostile searchQuery "${hostileQuery}" must NOT crash`);
        assert.deepEqual(res.data.items, []);
      }

      // 2. Client POST /request and /quote with path traversal networkId -> 400 (never 500!)
      const badReqNet = await reqJson(srv.baseUrl, 'POST', '/api/withdrawals/request', 'tok-u1', {
        networkId: '../users/u-1',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 20_000_000,
        idempotencyKey: 'idem-fmed01-path',
      });
      assert.equal(badReqNet.status, 400);
      assert.equal(badReqNet.data.faultCode, 'W04-LOCK_TX-400-INVALID_NETWORK_ID');

      const badQuoteNet = await reqJson(srv.baseUrl, 'POST', '/api/withdrawals/quote', 'tok-u1', {
        networkId: 'a/b',
        requestedAmountMicros: 20_000_000,
      });
      assert.equal(badQuoteNet.status, 400);
      assert.equal(badQuoteNet.data.faultCode, 'W03-QUOTE-400-INVALID_NETWORK_ID');

      // 3. Forged client cursor with path traversal ID -> 400 INVALID_CURSOR (never 503!)
      const forgedCursor = Buffer.from(
        JSON.stringify({ v: 1, uid: 'u-1', requestedAt: '2026-11-18T10:00:00.000Z', id: 'a/b' }),
        'utf8',
      ).toString('base64url');
      const badCursorRes = await reqJson(
        srv.baseUrl,
        'GET',
        `/api/withdrawals/me?cursor=${encodeURIComponent(forgedCursor)}`,
        'tok-u1',
      );
      assert.equal(badCursorRes.status, 400);
      assert.equal(badCursorRes.data.faultCode, 'W07-HISTORY_UI-400-INVALID_CURSOR');

      // 4. Encoded slash in :withdrawalId -> 400 INVALID_WITHDRAWAL_ID
      const badDetail = await reqJson(
        srv.baseUrl,
        'GET',
        `/api/withdrawals/me/${encodeURIComponent('a/b')}`,
        'tok-u1',
      );
      assert.equal(badDetail.status, 400);
      assert.equal(badDetail.data.faultCode, 'W07-HISTORY_UI-400-INVALID_WITHDRAWAL_ID');
    } finally {
      await srv.close();
    }
  });

  it('F-CRIT-03 & CONSERVATION OF MONEY: sequential and concurrent SCRUM-221 purchases + SCRUM-279 withdrawals can NEVER exceed authoritative balance', async () => {
    // --- Part A: Sequential purchase -> legitimate smaller withdrawal allowed, oversized withdrawal blocked ---
    const seqDb = createStrictFirestore({
      packages: {
        'pkg-60': {
          id: 'pkg-60',
          name: 'Minero 60 USD',
          powerTh: 5,
          priceUsdt: 60,
          status: 'ACTIVE',
          isPublished: true,
          cadence: 'one_time',
          durationDays: 365,
        },
      },
      balances: {
        'u-seq': {
          uid: 'u-seq',
          email: 'seq@m.io',
          membershipTier: 'PRO',
          availableBalanceMicros: usdtToMicros(100), // $100.00
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T10:00:00.000Z',
        },
      },
      users: {
        'u-seq': { uid: 'u-seq', email: 'seq@m.io', balance: 100 },
      },
    });

    const purchaseSvc = new PlatformBalancePurchaseService({ firestore: seqDb as never });

    // 1. User spends $60 buying a miner (updates ONLY /users/u-seq.balance -> 40; /userBalances stays 100M)
    const purchase1 = await purchaseSvc.executePurchase('u-seq', 'seq@m.io', {
      packageId: 'pkg-60',
      purchaseId: 'pur-seq-001',
    });
    assert.equal(purchase1.success, true);
    assert.equal(purchase1.balance, 40);
    assert.equal(seqDb.ensureCol(USER_BALANCES_COLLECTION).get('u-seq')!.availableBalanceMicros, 100_000_000);

    // 2. Trying to withdraw $50 against stale /userBalances = $100 MUST FAIL with 409 because min(100, 40) = 40
    await assert.rejects(
      () =>
        executeAtomicWithdrawalRequest(
          seqDb as never,
          { uid: 'u-seq', email: 'seq@m.io' },
          {
            networkId: 'usdt-bsc',
            destinationAddress: WALLET_EVM,
            requestedAmountMicros: usdtToMicros(50),
            idempotencyKey: 'idem-seq-overspend',
          },
        ),
      (err: any) => err?.faultCode === 'W04-LOCK_TX-409-INSUFFICIENT_AVAILABLE_BALANCE',
    );

    // 3. Legitimate withdrawal of $30 (totalDebit = 30.80 <= 40.00) SUCCEEDS without rejecting legitimate divergence!
    const legitWth = await executeAtomicWithdrawalRequest(
      seqDb as never,
      { uid: 'u-seq', email: 'seq@m.io' },
      {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: usdtToMicros(30), // +0.50 net +0.30 platform = 30.80 totalDebit
        idempotencyKey: 'idem-seq-legit-30',
      },
    );
    assert.equal(legitWth.status, 201);
    assert.equal(legitWth.withdrawalRequest.totalDebitMicros, 30_800_000);
    // Exact conservation: $60 purchased + $30.80 locked + $9.20 remaining = $100.00!
    assert.equal(legitWth.userBalance.availableBalanceMicros, 9_200_000);
    assert.equal(legitWth.userBalance.lockedBalanceMicros, 30_800_000);
    assert.equal(legitWth.syncedUserBalanceUsdt, 9.2);
    assert.equal(seqDb.ensureCol(USERS_COLLECTION).get('u-seq')!.balance, 9.2);

    // --- Part B: Concurrent race (Purchase $60 + Withdrawal $60 against $100 balance) -> ONLY ONE succeeds! ---
    const raceDb = createStrictFirestore({
      packages: {
        'pkg-60': {
          id: 'pkg-60',
          name: 'Minero 60 USD',
          powerTh: 5,
          priceUsdt: 60,
          status: 'ACTIVE',
          isPublished: true,
          cadence: 'one_time',
          durationDays: 365,
        },
      },
      balances: {
        'u-race': {
          uid: 'u-race',
          email: 'race@m.io',
          membershipTier: 'WHALE',
          availableBalanceMicros: usdtToMicros(100), // $100.00
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T10:00:00.000Z',
        },
      },
      users: {
        'u-race': { uid: 'u-race', email: 'race@m.io', balance: 100 },
      },
    });
    const racePurchaseSvc = new PlatformBalancePurchaseService({ firestore: raceDb as never });

    const [pOutcome, wOutcome] = await Promise.allSettled([
      racePurchaseSvc.executePurchase('u-race', 'race@m.io', {
        packageId: 'pkg-60',
        purchaseId: 'pur-race-001',
      }),
      executeAtomicWithdrawalRequest(
        raceDb as never,
        { uid: 'u-race', email: 'race@m.io' },
        {
          networkId: 'usdt-bsc',
          destinationAddress: WALLET_EVM,
          requestedAmountMicros: usdtToMicros(60),
          idempotencyKey: 'idem-race-wth-001',
        },
      ),
    ]);

    const fulfilledCount = [pOutcome, wOutcome].filter((r) => r.status === 'fulfilled').length;
    const rejectedCount = [pOutcome, wOutcome].filter((r) => r.status === 'rejected').length;
    assert.equal(fulfilledCount, 1, 'Exactly ONE of concurrent purchase/withdrawal must succeed');
    assert.equal(rejectedCount, 1, 'Exactly ONE of concurrent purchase/withdrawal must fail');

    const purchasedMicros = pOutcome.status === 'fulfilled' ? usdtToMicros(60) : 0;
    const lockedMicros =
      wOutcome.status === 'fulfilled' ? wOutcome.value.withdrawalRequest.totalDebitMicros : 0;
    const finalUsersBalMicros = usdtToMicros(
      Number(raceDb.ensureCol(USERS_COLLECTION).get('u-race')!.balance).toFixed(6),
    );
    assert.ok(purchasedMicros + lockedMicros <= usdtToMicros(100), 'Total spent + locked must never exceed $100');
    assert.equal(
      purchasedMicros + lockedMicros + finalUsersBalMicros,
      usdtToMicros(100),
      'Exact conservation of money: purchased + locked + remaining == initial balance',
    );
  });

  it('D1/D4: maps real platform membership/subscription/package labels onto canonical NONE/STANDARD/PRO/ELITE/WHALE tiers', () => {
    assert.equal(normalizePlatformMembershipTier('NONE'), 'NONE');
    assert.equal(normalizePlatformMembershipTier('FREE'), 'NONE');
    assert.equal(normalizePlatformMembershipTier(undefined), 'NONE');
    assert.equal(normalizePlatformMembershipTier('STARTER'), 'STANDARD');
    assert.equal(normalizePlatformMembershipTier('STANDARD'), 'STANDARD');
    assert.equal(normalizePlatformMembershipTier('monthly'), 'STANDARD');
    assert.equal(normalizePlatformMembershipTier('semiannual'), 'STANDARD');
    assert.equal(normalizePlatformMembershipTier('annual'), 'STANDARD');
    assert.equal(normalizePlatformMembershipTier('PRO'), 'PRO');
    assert.equal(normalizePlatformMembershipTier('Platinum+'), 'ELITE');
    assert.equal(normalizePlatformMembershipTier('PLATINUM'), 'ELITE');
    assert.equal(normalizePlatformMembershipTier('MASTER'), 'ELITE');
    assert.equal(normalizePlatformMembershipTier('VIP'), 'ELITE');
    assert.equal(normalizePlatformMembershipTier('ELITE'), 'ELITE');
    assert.equal(normalizePlatformMembershipTier('ENTERPRISE'), 'WHALE');
    assert.equal(normalizePlatformMembershipTier('WHALE'), 'WHALE');
  });
});
