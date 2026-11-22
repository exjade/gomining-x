/**
 * SCRUM-275 / SCRUM-289 / SCRUM-288 (W13)
 * Final Adversarial E2E Battery & Epic Acceptance Validation (`W01..W13`):
 * - Block A: Economic guards (min 10 USDT, insufficient funds, disabled network W03-QUOTE-404-NETWORK_NOT_ENABLED,
 *            incomplete network schema W03-NETCFG-422-INVALID_NETWORK_SCHEMA, addressType mismatch, micro-USDT parity)
 * - Block B: Adversarial concurrency (double withdrawal vs 100 USDT balance, dual-admin transitions, double unlock,
 *            idempotent replay across Express app restarts, duplicate broadcast/complete, illegal transitions & post-broadcast EDIT)
 * - Block C: Complete 9-permission RBAC allow/deny matrix (zero SUPER_ADMIN wildcard bypass), webhook/worker spoof on
 *            PATCH /confirmations, cross-UID isolation, client->admin denial & firestore.rules Decision 1 verification
 * - Block D: W12 cutover uniqueness on exported `server/server.ts` app (legacy routes -> 404, canonical routes -> 401 fail-closed)
 * - Block E: Full Runtime E2E REQUESTED -> COMPLETED across Client & Admin endpoints + W10 Ledger/Audit reconciliation
 *            (`SETTLED_CLOSED`, `isBalanced: true`) + immutable SHA-256 contract hashes.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { describe, it } from 'node:test';
import express from 'express';

import {
  CANONICAL_USDT_NETWORKS,
  FINANCIAL_LEDGER_COLLECTION,
  MIN_WITHDRAWAL_MICROS,
  USERS_COLLECTION,
  USER_BALANCES_COLLECTION,
  WITHDRAWAL_ADMIN_PERMISSIONS,
  WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
  WITHDRAWAL_NETWORKS_COLLECTION,
  WITHDRAWAL_REQUESTS_COLLECTION,
  calculateMaxWithdrawableMicros,
  calculateWithdrawalQuote,
  isWithdrawalModuleError,
  type FinancialLedgerEntry,
  type UserFinancialBalance,
  type WithdrawalAdminPermission,
  type WithdrawalRequest,
} from '../../src/types/withdrawal.js';
import { createWithdrawalConfigQuoteRouter } from '../../server/services/withdrawalConfigQuoteRouter.js';
import { createAdminWithdrawalsRouter } from '../../server/services/adminWithdrawalsRouter.js';
import { createAdminWithdrawalWorkflowRouter } from '../../server/services/adminWithdrawalWorkflowRouter.js';
import { createAdminWithdrawalAuditRouter } from '../../server/services/adminWithdrawalAuditRouter.js';
import { createAdminWithdrawalSettlementRouter } from '../../server/services/adminWithdrawalSettlementRouter.js';
import { validateWithdrawalNetworkConfigDoc } from '../../server/services/withdrawalNetworksService.js';
import { WITHDRAWAL_IDEMPOTENCY_COLLECTION } from '../../server/services/withdrawalRequestLockService.js';
import type { WithdrawalAuthzDependencies } from '../../server/services/withdrawalAuthzMiddleware.js';
import { app as productionServerApp } from '../../server/server.js';

const projectRoot = path.resolve(import.meta.dirname, '../..');

const WALLET_EVM = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
const WALLET_TRON = 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7';
const REAL_EVM_TXHASH =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const OTHER_EVM_TXHASH =
  '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321';

const BASELINE_HASHES = {
  withdrawalTs: 'B5362F9A09B8CBE9EE6DE71D7C3AAAD22EAE69054DB28E86C2E4B19792611B0E',
  firestoreRules: '3422F1E051904328C791377B6BE4DB34269AFC9AA7D3FF0E00C59677503F6C8C',
  firestoreIndexes: '39990B1AA0F47F15652DCC6AA3BE6DC844C78EE4D1D9C9A86925F28CEBE33E9D',
};

function createE2EFirestore(seed: {
  admins?: Record<string, Record<string, unknown>>;
  balances?: Record<string, UserFinancialBalance>;
  users?: Record<string, Record<string, unknown>>;
}) {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  for (const col of [
    'admin_users',
    WITHDRAWAL_REQUESTS_COLLECTION,
    USER_BALANCES_COLLECTION,
    USERS_COLLECTION,
    WITHDRAWAL_NETWORKS_COLLECTION,
    FINANCIAL_LEDGER_COLLECTION,
    WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
    WITHDRAWAL_IDEMPOTENCY_COLLECTION,
  ]) {
    collections.set(col, new Map());
  }

  for (const [k, v] of Object.entries(seed.admins ?? {})) {
    collections.get('admin_users')!.set(k, { ...v });
  }
  for (const [k, v] of Object.entries(seed.balances ?? {})) {
    collections.get(USER_BALANCES_COLLECTION)!.set(k, { ...v });
  }
  for (const [k, v] of Object.entries(seed.users ?? {})) {
    collections.get(USERS_COLLECTION)!.set(k, { ...v });
  }
  for (const net of CANONICAL_USDT_NETWORKS) {
    collections.get(WITHDRAWAL_NETWORKS_COLLECTION)!.set(net.id, {
      ...net,
      enabled: net.id === 'usdt-polygon' ? false : net.enabled,
      feePolicy: { ...net.feePolicy },
    });
  }

  const getStore = (name: string) => {
    const store = collections.get(name);
    if (!store) throw new Error(`Unknown collection "${name}"`);
    return store;
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
            if (c.op === 'in' && Array.isArray(c.value)) return c.value.includes(actual);
            if (c.op === '>=') return String(actual ?? '') >= String(c.value);
            if (c.op === '<=') return String(actual ?? '') <= String(c.value);
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
            data: () => ({ ...data }),
          })),
        };
      },
    };
  }

  return {
    collections,
    collection(name: string) {
      const store = getStore(name);
      return {
        doc(id: string) {
          return {
            _colName: name,
            id,
            async get() {
              const row = store.get(id);
              return { id, exists: Boolean(row), data: () => (row ? { ...row } : undefined) };
            },
            async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
              if (opts?.merge && store.has(id)) {
                store.set(id, { ...store.get(id)!, ...data });
              } else {
                store.set(id, { ...data });
              }
            },
          };
        },
        async get() {
          return {
            docs: Array.from(store.entries()).map(([id, data]) => ({
              id,
              exists: true,
              data: () => ({ ...data }),
            })),
          };
        },
        where(field: string, op: string, value: unknown) {
          return makeQuery(name, store, [{ field, op, value }]);
        },
        orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
          return makeQuery(name, store, [], { field, dir });
        },
      };
    },
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
            assert.equal(writesStarted, false, 'Transaction must complete all reads before any write');
            const row = getStore(ref._colName).get(ref.id);
            return { id: ref.id, exists: Boolean(row), data: () => (row ? { ...row } : undefined) };
          },
          set(
            ref: { _colName: string; id: string },
            data: Record<string, unknown>,
            opts?: { merge?: boolean },
          ) {
            writesStarted = true;
            writes.push({
              col: ref._colName,
              id: ref.id,
              data: { ...data },
              merge: Boolean(opts?.merge),
            });
            return tx;
          },
          update(ref: { _colName: string; id: string }, data: Record<string, unknown>) {
            writesStarted = true;
            writes.push({ col: ref._colName, id: ref.id, data: { ...data }, merge: true });
            return tx;
          },
        };
        const res = await fn(tx);
        for (const w of writes) {
          const st = getStore(w.col);
          if (w.merge && st.has(w.id)) {
            st.set(w.id, { ...st.get(w.id)!, ...w.data });
          } else {
            st.set(w.id, { ...w.data });
          }
        }
        return res;
      } finally {
        release();
      }
    },
  };
}

function mountUnifiedWithdrawalExpressApp(
  db: ReturnType<typeof createE2EFirestore>,
  tokens: Record<string, { uid: string; email: string; firebase?: { sign_in_provider?: string } }>,
) {
  const authzDeps: WithdrawalAuthzDependencies = {
    firestore: db as never,
    authAdapter: {
      isInitialized: () => true,
      async verifyIdToken(token: string) {
        const decoded = tokens[token];
        if (!decoded) throw new Error('Invalid token');
        return decoded as never;
      },
    } as never,
  };

  const app = express();
  app.use(express.json());
  app.use('/api/withdrawals', createWithdrawalConfigQuoteRouter({ ...authzDeps, firestore: db as never }));
  app.use('/api/admin/withdrawals', createAdminWithdrawalsRouter({ ...authzDeps, firestore: db as never }));
  app.use('/api/admin/withdrawals', createAdminWithdrawalWorkflowRouter({ ...authzDeps, firestore: db as never }));
  app.use('/api/admin/withdrawals', createAdminWithdrawalAuditRouter({ ...authzDeps, firestore: db as never }));
  app.use('/api/admin/withdrawals', createAdminWithdrawalSettlementRouter({ ...authzDeps, firestore: db as never }));
  return app;
}

async function startTempServer(expressApp: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = await new Promise<http.Server>((resolve) => {
    const s = expressApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function apiJson(
  baseUrl: string,
  method: string,
  urlPath: string,
  token?: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = { ...(extraHeaders ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as Record<string, unknown>;
  return { status: res.status, data };
}

describe('SCRUM-288 (W13): Final Adversarial E2E Battery & Epic Acceptance Closure', () => {
  it('Bloque A: valida mínimo 10 USDT, fondos insuficientes, red deshabilitada (W03-QUOTE-404-NETWORK_NOT_ENABLED), esquema incompleto (W03-NETCFG-422-INVALID_NETWORK_SCHEMA), dirección inválida y exactitud micro-USDT', async () => {
    const db = createE2EFirestore({
      balances: {
        'client-a': {
          uid: 'client-a',
          email: 'a@minerx.test',
          membershipTier: 'PRO',
          availableBalanceMicros: 50_000_000, // $50.00
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T09:00:00.000Z',
        },
      },
      users: { 'client-a': { uid: 'client-a', email: 'a@minerx.test', membershipTier: 'PRO', balance: 50 } },
    });

    const srv = await startTempServer(
      mountUnifiedWithdrawalExpressApp(db, { 'tok-a': { uid: 'client-a', email: 'a@minerx.test' } }),
    );
    try {
      // 1. Mínimo < 10 USDT en quote (200 con meetsMinimum: false + W03-QUOTE-422-MINIMUM_WITHDRAWAL_NOT_MET) & request (422)
      const belowMinQuote = await apiJson(srv.baseUrl, 'POST', '/api/withdrawals/quote', 'tok-a', {
        networkId: 'usdt-bsc',
        requestedAmountMicros: MIN_WITHDRAWAL_MICROS - 1,
      });
      assert.equal(belowMinQuote.status, 200);
      assert.equal(belowMinQuote.data.ok, true);
      const quotePayload = belowMinQuote.data.quote as Record<string, unknown>;
      assert.equal(quotePayload.meetsMinimum, false);
      assert.equal(quotePayload.validationFaultCode, 'W03-QUOTE-422-MINIMUM_WITHDRAWAL_NOT_MET');

      const belowMinReq = await apiJson(srv.baseUrl, 'POST', '/api/withdrawals/request', 'tok-a', {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 9_000_000,
        idempotencyKey: 'idem-min-fail',
      });
      assert.equal(belowMinReq.status, 422);

      // 2. Fondos insuficientes -> 409/422
      const overBalReq = await apiJson(srv.baseUrl, 'POST', '/api/withdrawals/request', 'tok-a', {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 50_000_000, // needs 50 + fees > 50 available
        idempotencyKey: 'idem-insufficient',
      });
      assert.equal(overBalReq.status, 409);
      assert.equal(overBalReq.data.faultCode, 'W04-LOCK_TX-409-INSUFFICIENT_AVAILABLE_BALANCE');

      // 3. Red deshabilitada -> W03-QUOTE-404-NETWORK_NOT_ENABLED (y W04-LOCK_TX-404-NETWORK_NOT_ENABLED)
      const disabledQuote = await apiJson(srv.baseUrl, 'POST', '/api/withdrawals/quote', 'tok-a', {
        networkId: 'usdt-polygon',
        requestedAmountMicros: 20_000_000,
      });
      assert.equal(disabledQuote.status, 404);
      assert.equal(disabledQuote.data.faultCode, 'W03-QUOTE-404-NETWORK_NOT_ENABLED');

      const disabledReq = await apiJson(srv.baseUrl, 'POST', '/api/withdrawals/request', 'tok-a', {
        networkId: 'usdt-polygon',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 20_000_000,
        idempotencyKey: 'idem-disabled-net',
      });
      assert.equal(disabledReq.status, 404);
      assert.equal(disabledReq.data.faultCode, 'W04-LOCK_TX-404-NETWORK_NOT_ENABLED');

      // 4. Esquema incompleto de red -> W03-NETCFG-422-INVALID_NETWORK_SCHEMA fail-closed
      assert.throws(
        () => validateWithdrawalNetworkConfigDoc('corrupt-net', { enabled: true, asset: 'USDT' }),
        (err) =>
          isWithdrawalModuleError(err) &&
          err.faultCode === 'W03-NETCFG-422-INVALID_NETWORK_SCHEMA',
      );

      // 5. Dirección inválida para addressType (TRON address sobre BSC EVM) -> 422
      const wrongAddrReq = await apiJson(srv.baseUrl, 'POST', '/api/withdrawals/request', 'tok-a', {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_TRON,
        requestedAmountMicros: 20_000_000,
        idempotencyKey: 'idem-bad-addr',
      });
      assert.equal(wrongAddrReq.status, 422);
      assert.equal(wrongAddrReq.data.faultCode, 'W04-LOCK_TX-422-INVALID_DESTINATION_ADDRESS');

      // 6. Exactitud micro-USDT y MAX_AVAILABLE boundary sin floating drift
      const bscNet = CANONICAL_USDT_NETWORKS.find((n) => n.id === 'usdt-bsc')!;
      const maxExpected = calculateMaxWithdrawableMicros(50_000_000, bscNet);
      const maxQuoteRes = await apiJson(srv.baseUrl, 'POST', '/api/withdrawals/quote', 'tok-a', {
        networkId: 'usdt-bsc',
        mode: 'MAX_AVAILABLE',
      });
      assert.equal(maxQuoteRes.status, 200);
      const quoteObj = maxQuoteRes.data.quote as ReturnType<typeof calculateWithdrawalQuote>;
      assert.equal(quoteObj.requestedAmountMicros, maxExpected.requestedAmountMicros);
      assert.equal(quoteObj.totalDebitMicros, maxExpected.totalDebitMicros);
      assert.ok(quoteObj.totalDebitMicros <= 50_000_000);
      assert.equal(
        quoteObj.totalDebitMicros,
        quoteObj.requestedAmountMicros + quoteObj.totalFeesMicros,
      );
    } finally {
      await srv.close();
    }
  });

  it('Bloque B: concurrencia adversarial doble retiro ($60x2 vs $100), idempotencia tras reinicio Express, carreras Admin, doble unlock y doble settlement', async () => {
    const db = createE2EFirestore({
      admins: {
        'admin-1': { uid: 'admin-1', email: 'a1@m.io', status: 'ACTIVE', role: 'admin', permissions: [...WITHDRAWAL_ADMIN_PERMISSIONS] },
        'admin-2': { uid: 'admin-2', email: 'a2@m.io', status: 'ACTIVE', role: 'admin', permissions: [...WITHDRAWAL_ADMIN_PERMISSIONS] },
      },
      balances: {
        'client-race': {
          uid: 'client-race',
          email: 'race@m.io',
          membershipTier: 'VIP',
          availableBalanceMicros: 100_000_000, // $100.00
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T09:00:00.000Z',
        },
        'client-idem': {
          uid: 'client-idem',
          email: 'idem@m.io',
          membershipTier: 'FREE',
          availableBalanceMicros: 100_000_000, // $100.00
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T09:00:00.000Z',
        },
      },
      users: {
        'client-race': { uid: 'client-race', email: 'race@m.io', balance: 100 },
        'client-idem': { uid: 'client-idem', email: 'idem@m.io', balance: 100 },
      },
    });

    const tokens = {
      'tok-race': { uid: 'client-race', email: 'race@m.io' },
      'tok-idem': { uid: 'client-idem', email: 'idem@m.io' },
      'tok-a1': { uid: 'admin-1', email: 'a1@m.io' },
      'tok-a2': { uid: 'admin-2', email: 'a2@m.io' },
    };

    const srv1 = await startTempServer(mountUnifiedWithdrawalExpressApp(db, tokens));
    let idemWithdrawalId = '';
    let raceWithdrawalId = '';

    try {
      // 1. Carrera concurrente de 2 retiros simultáneos de $60 sobre saldo $100
      const [r1, r2] = await Promise.all([
        apiJson(srv1.baseUrl, 'POST', '/api/withdrawals/request', 'tok-race', {
          networkId: 'usdt-bsc',
          destinationAddress: WALLET_EVM,
          requestedAmountMicros: 60_000_000,
          idempotencyKey: 'race-key-1',
        }),
        apiJson(srv1.baseUrl, 'POST', '/api/withdrawals/request', 'tok-race', {
          networkId: 'usdt-bsc',
          destinationAddress: WALLET_EVM,
          requestedAmountMicros: 60_000_000,
          idempotencyKey: 'race-key-2',
        }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      assert.deepEqual(statuses, [201, 409]);
      const winner = r1.status === 201 ? r1 : r2;
      raceWithdrawalId = (winner.data.withdrawalRequest as WithdrawalRequest).id;

      const raceBal = db.collections.get(USER_BALANCES_COLLECTION)!.get('client-race') as unknown as UserFinancialBalance;
      assert.equal(raceBal.availableBalanceMicros + raceBal.lockedBalanceMicros, 100_000_000);
      assert.ok(raceBal.availableBalanceMicros >= 0);

      // 2. Carrera concurrente entre 2 Admins intentando aprobar y rechazar la misma solicitud simultáneamente
      const [admApprove, admReject] = await Promise.all([
        apiJson(srv1.baseUrl, 'POST', `/api/admin/withdrawals/${raceWithdrawalId}/approve`, 'tok-a1', {
          expectedStatus: 'REQUESTED',
        }),
        apiJson(srv1.baseUrl, 'POST', `/api/admin/withdrawals/${raceWithdrawalId}/reject`, 'tok-a2', {
          expectedStatus: 'REQUESTED',
          rejectionReason: 'Concurrent reject',
        }),
      ]);
      assert.deepEqual([admApprove.status, admReject.status].sort(), [200, 409]);

      // Create & test idempotency request before simulated server restart
      const createdIdem = await apiJson(srv1.baseUrl, 'POST', '/api/withdrawals/request', 'tok-idem', {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 30_000_000,
        idempotencyKey: 'persistent-idem-key',
      });
      assert.equal(createdIdem.status, 201);
      idemWithdrawalId = (createdIdem.data.withdrawalRequest as WithdrawalRequest).id;
    } finally {
      await srv1.close();
    }

    // 3. Simular reinicio de proceso Express (nueva app sobre el mismo store Firestore)
    const srv2 = await startTempServer(mountUnifiedWithdrawalExpressApp(db, tokens));
    try {
      const replayReq = await apiJson(srv2.baseUrl, 'POST', '/api/withdrawals/request', 'tok-idem', {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 30_000_000,
        idempotencyKey: 'persistent-idem-key',
      });
      assert.equal(replayReq.status, 200);
      assert.equal(replayReq.data.idempotentReplay, true);
      assert.equal((replayReq.data.withdrawalRequest as WithdrawalRequest).id, idemWithdrawalId);

      // Mutated payload under same idempotencyKey after restart -> 409
      const conflictReq = await apiJson(srv2.baseUrl, 'POST', '/api/withdrawals/request', 'tok-idem', {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 35_000_000,
        idempotencyKey: 'persistent-idem-key',
      });
      assert.equal(conflictReq.status, 409);

      // Reject once -> unlock exactly once; second reject/cancel fails with 409 and never double-unlocks
      const firstReject = await apiJson(
        srv2.baseUrl,
        'POST',
        `/api/admin/withdrawals/${idemWithdrawalId}/reject`,
        'tok-a1',
        { expectedStatus: 'REQUESTED', rejectionReason: 'Adversarial double unlock test' },
      );
      assert.equal(firstReject.status, 200);

      const secondCancel = await apiJson(
        srv2.baseUrl,
        'POST',
        `/api/admin/withdrawals/${idemWithdrawalId}/cancel`,
        'tok-a2',
        { expectedStatus: 'REJECTED', cancellationReason: 'Double unlock attempt' },
      );
      assert.equal(secondCancel.status, 409);

      const balAfterReject = db.collections.get(USER_BALANCES_COLLECTION)!.get('client-idem') as unknown as UserFinancialBalance;
      assert.equal(balAfterReject.availableBalanceMicros, 100_000_000);
      assert.equal(balAfterReject.lockedBalanceMicros, 0);

      // Verify exactly 1 UNLOCK entry for idemWithdrawalId
      const unlockEntries = Array.from(db.collections.get(FINANCIAL_LEDGER_COLLECTION)!.values()).filter(
        (e) => e.withdrawalId === idemWithdrawalId && e.type === 'WITHDRAWAL_UNLOCK',
      );
      assert.equal(unlockEntries.length, 1);

      // Invalid state transition: REJECTED -> APPROVE rejected (409)
      const illegalApprove = await apiJson(
        srv2.baseUrl,
        'POST',
        `/api/admin/withdrawals/${idemWithdrawalId}/approve`,
        'tok-a1',
        { expectedStatus: 'REJECTED' },
      );
      assert.equal(illegalApprove.status, 409);
    } finally {
      await srv2.close();
    }
  });

  it('Bloque C: matriz allow/deny por los 9 permisos RBAC (cero SUPER_ADMIN wildcard), anti-spoof webhook en PATCH /confirmations, cross-UID y Decision 1 Rules', async () => {
    const db = createE2EFirestore({
      admins: {
        'admin-super-zero-perms': {
          uid: 'admin-super-zero-perms',
          email: 'super0@m.io',
          status: 'ACTIVE',
          role: 'admin',
          adminTier: 'SUPER_ADMIN',
          permissions: [],
        },
        'admin-full': {
          uid: 'admin-full',
          email: 'full@m.io',
          status: 'ACTIVE',
          role: 'admin',
          permissions: [...WITHDRAWAL_ADMIN_PERMISSIONS],
        },
        ...Object.fromEntries(
          WITHDRAWAL_ADMIN_PERMISSIONS.map((perm) => [
            `admin-only-${perm}`,
            {
              uid: `admin-only-${perm}`,
              email: `${perm}@m.io`,
              status: 'ACTIVE',
              role: 'admin',
              permissions: [perm],
            },
          ]),
        ),
      },
      balances: {
        'uid-a': {
          uid: 'uid-a',
          email: 'a@m.io',
          membershipTier: 'PRO',
          availableBalanceMicros: 200_000_000,
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T09:00:00.000Z',
        },
        'uid-b': {
          uid: 'uid-b',
          email: 'b@m.io',
          membershipTier: 'FREE',
          availableBalanceMicros: 200_000_000,
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T09:00:00.000Z',
        },
      },
      users: {
        'uid-a': { uid: 'uid-a', email: 'a@m.io', balance: 200 },
        'uid-b': { uid: 'uid-b', email: 'b@m.io', balance: 200 },
      },
    });

    const tokens: Record<string, { uid: string; email: string }> = {
      'tok-a': { uid: 'uid-a', email: 'a@m.io' },
      'tok-b': { uid: 'uid-b', email: 'b@m.io' },
      'tok-super0': { uid: 'admin-super-zero-perms', email: 'super0@m.io' },
      'tok-full': { uid: 'admin-full', email: 'full@m.io' },
      ...Object.fromEntries(
        WITHDRAWAL_ADMIN_PERMISSIONS.map((perm) => [
          `tok-${perm}`,
          { uid: `admin-only-${perm}`, email: `${perm}@m.io` },
        ]),
      ),
    };

    const srv = await startTempServer(mountUnifiedWithdrawalExpressApp(db, tokens));
    try {
      // Seed withdrawals for uid-a (to test happy RBAC chain + reject/cancel isolated)
      const createW = async (key: string) => {
        const res = await apiJson(srv.baseUrl, 'POST', '/api/withdrawals/request', 'tok-a', {
          networkId: 'usdt-bsc',
          destinationAddress: WALLET_EVM,
          requestedAmountMicros: 20_000_000,
          idempotencyKey: key,
        });
        assert.equal(res.status, 201);
        return (res.data.withdrawalRequest as WithdrawalRequest).id;
      };

      const wMain = await createW('rbac-main');
      const wForReject = await createW('rbac-reject');
      const wForCancel = await createW('rbac-cancel');

      // Cross-UID isolation: uid-b cannot read uid-a detail or use uid-a cursor
      const bReadsA = await apiJson(srv.baseUrl, 'GET', `/api/withdrawals/me/${wMain}`, 'tok-b');
      assert.equal(bReadsA.status, 403);
      assert.equal(bReadsA.data.faultCode, 'W02-AUTHZ-403-FORBIDDEN_CROSS_UID_ACCESS');

      const aHistory = await apiJson(srv.baseUrl, 'GET', '/api/withdrawals/me?limit=1', 'tok-a');
      const cursorA = String(aHistory.data.nextCursor);
      const bTamperCursor = await apiJson(
        srv.baseUrl,
        'GET',
        `/api/withdrawals/me?cursor=${encodeURIComponent(cursorA)}`,
        'tok-b',
      );
      assert.equal(bTamperCursor.status, 403);
      assert.equal(bTamperCursor.data.faultCode, 'W07-HISTORY_UI-403-FORBIDDEN_CROSS_UID_CURSOR');

      // Client cannot access admin endpoint (403)
      const clientOnAdmin = await apiJson(srv.baseUrl, 'GET', '/api/admin/withdrawals', 'tok-a');
      assert.equal(clientOnAdmin.status, 403);

      // Check every single one of the 9 granular permissions: DENY without permission (tok-super0 / tok-wrong) & ALLOW with exact permission
      const checkAllowDeny = async (
        perm: WithdrawalAdminPermission,
        method: string,
        urlPath: string,
        body?: unknown,
      ) => {
        const denySuper = await apiJson(srv.baseUrl, method, urlPath, 'tok-super0', body);
        assert.equal(denySuper.status, 403, `SUPER_ADMIN without ${perm} must receive 403 on ${method} ${urlPath}`);
        const allowRes = await apiJson(srv.baseUrl, method, urlPath, `tok-${perm}`, body);
        assert.equal(allowRes.status, 200, `Admin with explicit ${perm} must succeed (200) on ${method} ${urlPath}`);
      };

      await checkAllowDeny('withdrawals.read', 'GET', '/api/admin/withdrawals');
      await checkAllowDeny('withdrawals.review', 'POST', `/api/admin/withdrawals/${wMain}/review`, {
        expectedStatus: 'REQUESTED',
      });
      await checkAllowDeny('withdrawals.edit', 'PATCH', `/api/admin/withdrawals/${wMain}`, {
        expectedStatus: 'UNDER_REVIEW',
        internalNotes: 'RBAC verified',
        reason: 'RBAC edit check',
      });
      await checkAllowDeny('withdrawals.approve', 'POST', `/api/admin/withdrawals/${wMain}/approve`, {
        expectedStatus: 'UNDER_REVIEW',
      });
      await checkAllowDeny('withdrawals.process', 'POST', `/api/admin/withdrawals/${wMain}/process`, {
        expectedStatus: 'APPROVED',
      });
      await checkAllowDeny('withdrawals.broadcast', 'POST', `/api/admin/withdrawals/${wMain}/broadcast`, {
        expectedStatus: 'PROCESSING',
        txHash: REAL_EVM_TXHASH,
        confirmations: 1,
      });

      // Webhook/worker spoof on PATCH /confirmations without Bearer token -> 401
      const spoofWebhook = await apiJson(
        srv.baseUrl,
        'PATCH',
        `/api/admin/withdrawals/${wMain}/confirmations`,
        undefined,
        { expectedStatus: 'BROADCASTED', confirmations: 15 },
        { 'x-webhook-secret': 'bypass', 'x-worker-id': 'cron' },
      );
      assert.equal(spoofWebhook.status, 401);

      await checkAllowDeny(
        'withdrawals.broadcast',
        'PATCH',
        `/api/admin/withdrawals/${wMain}/confirmations`,
        { expectedStatus: 'BROADCASTED', confirmations: 15 },
      );
      await checkAllowDeny('withdrawals.broadcast', 'POST', `/api/admin/withdrawals/${wMain}/complete`, {
        expectedStatus: 'BROADCASTED',
        confirmations: 15,
      });
      await checkAllowDeny('withdrawals.audit', 'GET', `/api/admin/withdrawals/${wMain}/audit`);
      await checkAllowDeny('withdrawals.reject', 'POST', `/api/admin/withdrawals/${wForReject}/reject`, {
        expectedStatus: 'REQUESTED',
        rejectionReason: 'RBAC reject test',
      });
      await checkAllowDeny('withdrawals.cancel', 'POST', `/api/admin/withdrawals/${wForCancel}/cancel`, {
        expectedStatus: 'REQUESTED',
        cancellationReason: 'RBAC cancel test',
      });

      // Verify firestore.rules Decision 1 guarantees in canonical rules file (default deny covers withdrawal_idempotency)
      const rulesText = fs.readFileSync(path.join(projectRoot, 'firestore.rules'), 'utf8');
      assert.ok(rulesText.includes('match /userBalances/{uid}'));
      assert.ok(rulesText.includes('match /withdrawalRequests/{withdrawalId}'));
      assert.ok(rulesText.includes('match /financialLedger/{ledgerEntryId}'));
      assert.ok(rulesText.includes('match /withdrawalAuditEvents/{eventId}'));
      assert.ok(rulesText.includes('allow create, update, delete: if false;'));
      assert.ok(rulesText.includes('match /{document=**}'));
      assert.ok(rulesText.includes('allow read, write: if false;'));
    } finally {
      await srv.close();
    }
  });

  it('Bloque D & E: verifica rutas legacy 404 en server/server.ts, ciclo completo REQUESTED -> COMPLETED, reconciliación W10 SETTLED_CLOSED y hashes congelados', async () => {
    // 1. Legacy/non-canonical withdrawal paths on real production server.ts MUST return 404 (not fallback mocks)
    const prodSrv = await startTempServer(productionServerApp);
    try {
      for (const legacyPath of [
        '/api/withdrawals/simulate',
        '/api/referrals/withdraw',
        '/api/admin/legacy-withdrawals',
      ]) {
        const res = await fetch(`${prodSrv.baseUrl}${legacyPath}`, { method: 'POST' });
        assert.equal(res.status, 404, `Legacy path ${legacyPath} must return 404`);
      }
      // Canonical path without auth -> 401 fail-closed
      const canonRes = await fetch(`${prodSrv.baseUrl}/api/withdrawals/me`);
      assert.equal(canonRes.status, 401);
    } finally {
      await prodSrv.close();
    }

    // 2. Full E2E Lifecycle REQUESTED -> COMPLETED across Client & Admin + W10 Reconciliation
    const db = createE2EFirestore({
      admins: {
        'admin-e2e': {
          uid: 'admin-e2e',
          email: 'e2e.admin@minerx.test',
          status: 'ACTIVE',
          role: 'admin',
          permissions: [...WITHDRAWAL_ADMIN_PERMISSIONS],
        },
      },
      balances: {
        'client-e2e': {
          uid: 'client-e2e',
          email: 'e2e.client@minerx.test',
          membershipTier: 'VIP',
          availableBalanceMicros: 250_000_000, // $250.00
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T10:00:00.000Z',
        },
      },
      users: {
        'client-e2e': { uid: 'client-e2e', email: 'e2e.client@minerx.test', balance: 250 },
      },
    });

    const srv = await startTempServer(
      mountUnifiedWithdrawalExpressApp(db, {
        'tok-client': { uid: 'client-e2e', email: 'e2e.client@minerx.test' },
        'tok-admin': { uid: 'admin-e2e', email: 'e2e.admin@minerx.test' },
      }),
    );

    try {
      // Step 1: Config + Quote
      const cfg = await apiJson(srv.baseUrl, 'GET', '/api/withdrawals/config', 'tok-client');
      assert.equal(cfg.status, 200);
      const quoteRes = await apiJson(srv.baseUrl, 'POST', '/api/withdrawals/quote', 'tok-client', {
        networkId: 'usdt-bsc',
        requestedAmountMicros: 100_000_000, // $100.00
      });
      assert.equal(quoteRes.status, 200);
      const quote = quoteRes.data.quote as ReturnType<typeof calculateWithdrawalQuote>;

      // Step 2: Request (AVAILABLE drops, LOCKED rises)
      const reqRes = await apiJson(srv.baseUrl, 'POST', '/api/withdrawals/request', 'tok-client', {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 100_000_000,
        idempotencyKey: 'e2e-full-cycle-001',
      });
      assert.equal(reqRes.status, 201);
      const created = reqRes.data.withdrawalRequest as WithdrawalRequest;
      assert.equal(created.status, 'REQUESTED');
      assert.equal(created.totalDebitMicros, quote.totalDebitMicros);

      // Step 3: Client sees REQUESTED in GET /api/withdrawals/me (no internal admin fields)
      const clientList1 = await apiJson(srv.baseUrl, 'GET', '/api/withdrawals/me', 'tok-client');
      assert.equal(clientList1.status, 200);
      const clientItem1 = (clientList1.data.items as Array<Record<string, unknown>>)[0];
      assert.equal(clientItem1.id, created.id);
      assert.equal(clientItem1.status, 'REQUESTED');
      assert.equal('internalNotes' in clientItem1, false);
      assert.equal('idempotencyKey' in clientItem1, false);

      // Step 4: Admin sees same withdrawalId in GET /api/admin/withdrawals
      const adminQueue = await apiJson(srv.baseUrl, 'GET', '/api/admin/withdrawals?tab=queue', 'tok-admin');
      assert.equal(adminQueue.status, 200);
      const queueItems = adminQueue.data.items as WithdrawalRequest[];
      assert.ok(queueItems.some((w) => w.id === created.id));

      // Step 5: REVIEW -> EDIT -> APPROVE -> PROCESS
      assert.equal(
        (await apiJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${created.id}/review`, 'tok-admin', { expectedStatus: 'REQUESTED' })).status,
        200,
      );
      assert.equal(
        (await apiJson(srv.baseUrl, 'PATCH', `/api/admin/withdrawals/${created.id}`, 'tok-admin', {
          expectedStatus: 'UNDER_REVIEW',
          internalNotes: 'E2E audited OK',
          reason: 'Verify notes',
        })).status,
        200,
      );
      assert.equal(
        (await apiJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${created.id}/approve`, 'tok-admin', { expectedStatus: 'UNDER_REVIEW' })).status,
        200,
      );
      assert.equal(
        (await apiJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${created.id}/process`, 'tok-admin', {
          expectedStatus: 'APPROVED',
          providerTransactionId: 'prov-e2e-1',
        })).status,
        200,
      );

      // Step 6: BROADCAST + idempotent replay + conflict rejection + CONFIRMATIONS + COMPLETE + idempotent replay
      const bcast = await apiJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${created.id}/broadcast`, 'tok-admin', {
        expectedStatus: 'PROCESSING',
        txHash: REAL_EVM_TXHASH,
        confirmations: 3,
      });
      assert.equal(bcast.status, 200);
      assert.equal((bcast.data.withdrawalRequest as WithdrawalRequest).status, 'BROADCASTED');

      const bcastReplay = await apiJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${created.id}/broadcast`, 'tok-admin', {
        expectedStatus: 'PROCESSING',
        txHash: REAL_EVM_TXHASH,
        confirmations: 3,
      });
      assert.equal(bcastReplay.status, 200);
      assert.equal(bcastReplay.data.idempotentReplay, true);

      const bcastConflict = await apiJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${created.id}/broadcast`, 'tok-admin', {
        expectedStatus: 'BROADCASTED',
        txHash: OTHER_EVM_TXHASH,
        confirmations: 3,
      });
      assert.equal(bcastConflict.status, 409);

      // Post-broadcast EDIT blocked
      const postBroadcastEdit = await apiJson(srv.baseUrl, 'PATCH', `/api/admin/withdrawals/${created.id}`, 'tok-admin', {
        expectedStatus: 'BROADCASTED',
        internalNotes: 'Should fail',
        reason: 'Post broadcast freeze',
      });
      assert.equal(postBroadcastEdit.status, 409);

      // Insufficient confirmations -> 422
      const earlyComplete = await apiJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${created.id}/complete`, 'tok-admin', {
        expectedStatus: 'BROADCASTED',
        confirmations: 10,
      });
      assert.equal(earlyComplete.status, 422);
      assert.equal(earlyComplete.data.faultCode, 'W11-SETTLEMENT-422-INSUFFICIENT_CONFIRMATIONS');

      assert.equal(
        (await apiJson(srv.baseUrl, 'PATCH', `/api/admin/withdrawals/${created.id}/confirmations`, 'tok-admin', {
          expectedStatus: 'BROADCASTED',
          confirmations: 15,
        })).status,
        200,
      );

      const settled = await apiJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${created.id}/complete`, 'tok-admin', {
        expectedStatus: 'BROADCASTED',
        confirmations: 15,
      });
      assert.equal(settled.status, 200);
      assert.equal(settled.data.idempotentReplay, false);

      const settledReplay = await apiJson(srv.baseUrl, 'POST', `/api/admin/withdrawals/${created.id}/complete`, 'tok-admin', {
        expectedStatus: 'COMPLETED',
        confirmations: 15,
      });
      assert.equal(settledReplay.status, 200);
      assert.equal(settledReplay.data.idempotentReplay, true);

      // Step 7 & 8: Balances settled + Client sees COMPLETED & exact same txHash
      const finalBal = db.collections.get(USER_BALANCES_COLLECTION)!.get('client-e2e') as unknown as UserFinancialBalance;
      assert.equal(finalBal.availableBalanceMicros, 250_000_000 - quote.totalDebitMicros);
      assert.equal(finalBal.lockedBalanceMicros, 0);
      assert.equal(finalBal.totalWithdrawnMicros, 100_000_000);

      const clientListFinal = await apiJson(srv.baseUrl, 'GET', '/api/withdrawals/me', 'tok-client');
      const clientItemFinal = (clientListFinal.data.items as WithdrawalRequest[])[0];
      assert.equal(clientItemFinal.id, created.id);
      assert.equal(clientItemFinal.status, 'COMPLETED');
      assert.equal(clientItemFinal.txHash, REAL_EVM_TXHASH);
      assert.equal(clientItemFinal.confirmations, 15);

      // Step 9: W10 Forensic Reconciliation reports SETTLED_CLOSED + balanced
      const auditRes = await apiJson(
        srv.baseUrl,
        'GET',
        `/api/admin/withdrawals/${created.id}/audit?strictIntegrity=1`,
        'tok-admin',
      );
      assert.equal(auditRes.status, 200);
      const recon = auditRes.data.reconciliation as {
        invariantStatus: string;
        isBalanced: boolean;
        lockEntryPresent: boolean;
        settlementEntryPresent: boolean;
        anomalies: string[];
      };
      assert.equal(recon.invariantStatus, 'SETTLED_CLOSED');
      assert.equal(recon.isBalanced, true);
      assert.equal(recon.lockEntryPresent, true);
      assert.equal(recon.settlementEntryPresent, true);
      assert.equal(recon.anomalies.length, 0);

      const ledgerForReq = Array.from(db.collections.get(FINANCIAL_LEDGER_COLLECTION)!.values()).filter(
        (e) => (e as unknown as FinancialLedgerEntry).withdrawalId === created.id,
      );
      assert.equal(ledgerForReq.length, 2);
    } finally {
      await srv.close();
    }

    // 3. Immutable SHA-256 contract hashes preserved at W13 closure
    const sha = (relPath: string) =>
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(projectRoot, relPath)))
        .digest('hex')
        .toUpperCase();

    assert.equal(sha('src/types/withdrawal.ts'), BASELINE_HASHES.withdrawalTs);
    assert.equal(sha('firestore.rules'), BASELINE_HASHES.firestoreRules);
    assert.equal(sha('firestore.indexes.json'), BASELINE_HASHES.firestoreIndexes);
  });
});
