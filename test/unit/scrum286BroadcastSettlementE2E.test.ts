/**
 * SCRUM-275 / SCRUM-289 / SCRUM-286 (W11)
 * On-Chain Broadcast (`txHash` real), Confirmations Tracking & Atomic Settlement to `COMPLETED`:
 * - E2E chain from W04 (`executeAtomicWithdrawalRequest` lock) -> W09 (`APPROVE` + `PROCESS`) ->
 *   W11 (`POST /broadcast` -> `PATCH /confirmations` -> `POST /complete`) -> W10 (`SETTLED_CLOSED BALANCED`)
 * - Strictly verifies `PATCH /:id/confirmations` fails closed (401/403) without `withdrawals.broadcast`
 *   even when headers spoof webhook/worker/SUPER_ADMIN or client caller
 * - Verifies `txHash` family regex validation (`EVM`, `TRON`, `SOLANA`), `explorerTxUrl` snapshot,
 *   post-broadcast immutability, idempotent retries (0 duplicate ledger/audit/debits), txHash conflict (409),
 *   conflicting UNLOCK ledger blocking (409), insufficient confirmations blocking (422), UI reflection,
 *   W11-SETTLEMENT-* fault codes, and immutable baseline SHA-256 hashes.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

import {
  CANONICAL_USDT_NETWORKS,
  FINANCIAL_LEDGER_COLLECTION,
  USERS_COLLECTION,
  USER_BALANCES_COLLECTION,
  WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
  WITHDRAWAL_NETWORKS_COLLECTION,
  WITHDRAWAL_REQUESTS_COLLECTION,
  isWithdrawalModuleError,
  type FinancialLedgerEntry,
  type UserFinancialBalance,
  type WithdrawalRequest,
} from '../../src/types/withdrawal.js';
import {
  WITHDRAWAL_IDEMPOTENCY_COLLECTION,
  executeAtomicWithdrawalRequest,
} from '../../server/services/withdrawalRequestLockService.js';
import { executeAdminWorkflowAction } from '../../server/services/adminWithdrawalWorkflowService.js';
import { createAdminWithdrawalWorkflowRouter } from '../../server/services/adminWithdrawalWorkflowRouter.js';
import {
  deterministicSettlementLedgerId,
  executeAdminBroadcastWithdrawal,
  executeAdminCompleteWithdrawal,
} from '../../server/services/adminWithdrawalSettlementService.js';
import { createAdminWithdrawalSettlementRouter } from '../../server/services/adminWithdrawalSettlementRouter.js';
import { getAdminWithdrawalAuditTimeline } from '../../server/services/adminWithdrawalAuditService.js';
import { createAdminWithdrawalsRouter } from '../../server/services/adminWithdrawalsRouter.js';
import type { WithdrawalAuthzDependencies } from '../../server/services/withdrawalAuthzMiddleware.js';
import {
  broadcastAdminWithdrawal,
  completeAdminWithdrawal,
  updateAdminWithdrawalConfirmations,
} from '../../src/services/admin/adminWithdrawalSettlementClient.js';
import type { AdminWithdrawalSession } from '../../src/services/admin/adminWithdrawalsClient.js';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export default {};',
      };
    }
    if (url.endsWith('.tsx')) {
      const filePath = new URL(url);
      const rawSource = fs.readFileSync(filePath, 'utf8');
      const transpiled = ts.transpileModule(rawSource, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
        fileName: filePath.pathname,
      });
      return {
        format: 'module',
        shortCircuit: true,
        source: transpiled.outputText,
      };
    }
    return nextLoad(url, context);
  },
});

const { AdminWithdrawalsControlCenter, createAdminWithdrawalsController } = await import(
  '../../src/components/admin/AdminWithdrawalsControlCenter.tsx'
);
const { AdminWithdrawalSettlementModal, AdminWithdrawalSettlementToolbar } = await import(
  '../../src/components/admin/AdminWithdrawalSettlementModal.tsx'
);

const projectRoot = path.resolve(import.meta.dirname, '../..');
const WALLET_EVM = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
const WALLET_TRON = 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7';
const WALLET_SOL = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';

const REAL_EVM_TXHASH =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_EVM_TXHASH =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const REAL_TRON_TXHASH =
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const REAL_SOL_TXHASH =
  '4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn1xQv4k7h8g9J2mPqRtUvWxYzAbCdEfGh';

const BASELINE_HASHES = {
  withdrawalTs: 'B5362F9A09B8CBE9EE6DE71D7C3AAAD22EAE69054DB28E86C2E4B19792611B0E',
  firestoreRules: 'F4313C04DD7595E1C84D8977299169EEA38C2B250F96E6916D68959CDAAA6779',
  firestoreIndexes: '39990B1AA0F47F15652DCC6AA3BE6DC844C78EE4D1D9C9A86925F28CEBE33E9D',
};

function createSettlementFirestoreMock(seed: {
  admins: Record<string, Record<string, unknown>>;
  balances: Record<string, UserFinancialBalance>;
  users: Record<string, Record<string, unknown>>;
}) {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  for (const name of [
    'admin_users',
    WITHDRAWAL_REQUESTS_COLLECTION,
    USER_BALANCES_COLLECTION,
    USERS_COLLECTION,
    WITHDRAWAL_NETWORKS_COLLECTION,
    FINANCIAL_LEDGER_COLLECTION,
    WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
    WITHDRAWAL_IDEMPOTENCY_COLLECTION,
  ]) {
    collections.set(name, new Map());
  }

  for (const [k, v] of Object.entries(seed.admins)) {
    collections.get('admin_users')!.set(k, { ...v });
  }
  for (const [k, v] of Object.entries(seed.balances)) {
    collections.get(USER_BALANCES_COLLECTION)!.set(k, { ...v });
  }
  for (const [k, v] of Object.entries(seed.users)) {
    collections.get(USERS_COLLECTION)!.set(k, { ...v });
  }
  for (const net of CANONICAL_USDT_NETWORKS) {
    collections.get(WITHDRAWAL_NETWORKS_COLLECTION)!.set(net.id, {
      ...net,
      feePolicy: { ...net.feePolicy },
    });
  }

  const getStore = (name: string) => {
    const map = collections.get(name);
    if (!map) throw new Error(`Unknown collection "${name}"`);
    return map;
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
      const waitPrev = txQueue;
      txQueue = new Promise<void>((res) => {
        release = res;
      });
      await waitPrev;
      try {
        let writeStarted = false;
        const writes: Array<{ col: string; id: string; data: Record<string, unknown>; merge: boolean }> = [];
        const tx = {
          async get(ref: { _colName: string; id: string }) {
            assert.equal(writeStarted, false, 'Phase 1 reads must precede Phase 2 writes');
            const row = getStore(ref._colName).get(ref.id);
            return { id: ref.id, exists: Boolean(row), data: () => (row ? { ...row } : undefined) };
          },
          set(
            ref: { _colName: string; id: string },
            data: Record<string, unknown>,
            opts?: { merge?: boolean },
          ) {
            writeStarted = true;
            writes.push({
              col: ref._colName,
              id: ref.id,
              data: { ...data },
              merge: Boolean(opts?.merge),
            });
            return tx;
          },
          update(ref: { _colName: string; id: string }, data: Record<string, unknown>) {
            writeStarted = true;
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

describe('SCRUM-286 (W11): Broadcast con txHash real, Confirmaciones y Settlement a COMPLETED', () => {
  let db: ReturnType<typeof createSettlementFirestoreMock>;
  let server: http.Server;
  let baseUrl = '';

  const broadcastSession: AdminWithdrawalSession = {
    uid: 'admin-broadcast-1',
    email: 'settler@minerx.test',
    idToken: 'tok-broadcast',
    permissions: [
      'withdrawals.read',
      'withdrawals.approve',
      'withdrawals.process',
      'withdrawals.broadcast',
      'withdrawals.audit',
    ],
  };

  const processOnlySession: AdminWithdrawalSession = {
    uid: 'admin-process-only',
    email: 'processor@minerx.test',
    idToken: 'tok-process-only',
    permissions: ['withdrawals.read', 'withdrawals.process', 'withdrawals.edit'],
  };

  const superNoBroadcastSession: AdminWithdrawalSession = {
    uid: 'admin-super-no-broadcast',
    email: 'super@minerx.test',
    idToken: 'tok-super-no-broadcast',
    permissions: ['withdrawals.read'],
  };

  const clientCallerSession: AdminWithdrawalSession = {
    uid: 'user-client-1',
    email: 'client@minerx.test',
    idToken: 'tok-client',
    permissions: ['withdrawals.broadcast'], // client not in admin_users allowlist
  };

  const userTokenMap: Record<string, { uid: string; email: string }> = {
    'tok-broadcast': { uid: broadcastSession.uid, email: broadcastSession.email },
    'tok-process-only': { uid: processOnlySession.uid, email: processOnlySession.email },
    'tok-super-no-broadcast': {
      uid: superNoBroadcastSession.uid,
      email: superNoBroadcastSession.email,
    },
    'tok-client': { uid: clientCallerSession.uid, email: clientCallerSession.email },
  };

  let withdrawalIdBep20 = '';
  let withdrawalIdTrc20 = '';
  let withdrawalIdSol = '';

  before(async () => {
    db = createSettlementFirestoreMock({
      admins: {
        [broadcastSession.uid]: {
          uid: broadcastSession.uid,
          email: broadcastSession.email,
          status: 'ACTIVE',
          role: 'admin',
          displayName: 'Admin Settler',
          permissions: [...broadcastSession.permissions],
        },
        [processOnlySession.uid]: {
          uid: processOnlySession.uid,
          email: processOnlySession.email,
          status: 'ACTIVE',
          role: 'admin',
          displayName: 'Admin Processor',
          permissions: [...processOnlySession.permissions],
        },
        [superNoBroadcastSession.uid]: {
          uid: superNoBroadcastSession.uid,
          email: superNoBroadcastSession.email,
          status: 'ACTIVE',
          role: 'admin',
          adminTier: 'SUPER_ADMIN', // Must NOT bypass explicit withdrawals.broadcast
          displayName: 'Super Admin Without Broadcast',
          permissions: [...superNoBroadcastSession.permissions],
        },
      },
      balances: {
        'user-client-1': {
          uid: 'user-client-1',
          email: 'client@minerx.test',
          membershipTier: 'VIP',
          availableBalanceMicros: 500_000_000, // $500 USDT
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 10_000_000, // $10 prior settled
          version: 1,
          updatedAt: '2026-11-18T08:00:00.000Z',
        },
      },
      users: {
        'user-client-1': {
          uid: 'user-client-1',
          email: 'client@minerx.test',
          membershipTier: 'VIP',
          balance: 500,
        },
      },
    });

    // Seed 3 real withdrawals via W04 + advance through W09 APPROVE -> PROCESS
    const reqBep20 = await executeAtomicWithdrawalRequest(
      db as never,
      { uid: 'user-client-1', email: 'client@minerx.test', membershipTier: 'VIP' },
      {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_EVM,
        requestedAmountMicros: 100_000_000, // $100
        idempotencyKey: 'idem-w11-bep20',
      },
      { nowIso: () => '2026-11-18T09:00:00.000Z' },
    );
    withdrawalIdBep20 = reqBep20.withdrawalRequest.id;

    const reqTrc20 = await executeAtomicWithdrawalRequest(
      db as never,
      { uid: 'user-client-1', email: 'client@minerx.test', membershipTier: 'VIP' },
      {
        networkId: 'usdt-tron',
        destinationAddress: WALLET_TRON,
        requestedAmountMicros: 50_000_000, // $50
        idempotencyKey: 'idem-w11-trc20',
      },
      { nowIso: () => '2026-11-18T09:05:00.000Z' },
    );
    withdrawalIdTrc20 = reqTrc20.withdrawalRequest.id;

    const reqSol = await executeAtomicWithdrawalRequest(
      db as never,
      { uid: 'user-client-1', email: 'client@minerx.test', membershipTier: 'VIP' },
      {
        networkId: 'usdt-solana',
        destinationAddress: WALLET_SOL,
        requestedAmountMicros: 25_000_000, // $25
        idempotencyKey: 'idem-w11-sol',
      },
      { nowIso: () => '2026-11-18T09:10:00.000Z' },
    );
    withdrawalIdSol = reqSol.withdrawalRequest.id;

    for (const wId of [withdrawalIdBep20, withdrawalIdTrc20, withdrawalIdSol]) {
      await executeAdminWorkflowAction(
        db as never,
        {
          uid: broadcastSession.uid,
          email: broadcastSession.email,
          displayName: 'Admin Settler',
          role: 'admin',
          permissions: [...broadcastSession.permissions],
        },
        wId,
        { action: 'APPROVE', dto: { expectedStatus: 'REQUESTED', reason: 'Approve for W11' } },
        { nowIso: () => '2026-11-18T09:15:00.000Z' },
      );
      await executeAdminWorkflowAction(
        db as never,
        {
          uid: broadcastSession.uid,
          email: broadcastSession.email,
          displayName: 'Admin Settler',
          role: 'admin',
          permissions: [...broadcastSession.permissions],
        },
        wId,
        {
          action: 'PROCESS',
          dto: { expectedStatus: 'APPROVED', providerTransactionId: 'prov-w11-1' },
        },
        { nowIso: () => '2026-11-18T09:20:00.000Z' },
      );
    }

    const authzDeps: WithdrawalAuthzDependencies = {
      firestore: db as never,
      authAdapter: {
        isInitialized: () => true,
        async verifyIdToken(token: string) {
          const decoded = userTokenMap[token];
          if (!decoded) throw new Error('Invalid token');
          return decoded as never;
        },
      } as never,
    };

    const app = express();
    app.use(express.json());
    app.use(
      '/api/admin/withdrawals',
      createAdminWithdrawalsRouter({ ...authzDeps, firestore: db as never }),
    );
    app.use(
      '/api/admin/withdrawals',
      createAdminWithdrawalWorkflowRouter({ ...authzDeps, firestore: db as never }),
    );
    app.use(
      '/api/admin/withdrawals',
      createAdminWithdrawalSettlementRouter({
        ...authzDeps,
        firestore: db as never,
        settlementOptions: { nowIso: () => '2026-11-18T10:00:00.000Z' },
      }),
    );

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('bloquea txHash vacío, corto o de familia de red incorrecta con W11-SETTLEMENT-422-INVALID_TX_HASH', async () => {
    for (const badTxHash of ['', 'fake-1234', REAL_TRON_TXHASH, REAL_SOL_TXHASH]) {
      await assert.rejects(
        () =>
          broadcastAdminWithdrawal(
            broadcastSession,
            withdrawalIdBep20,
            { expectedStatus: 'PROCESSING', txHash: badTxHash, confirmations: 0 },
            { baseUrl },
          ),
        (err) => {
          assert.ok(isWithdrawalModuleError(err));
          assert.equal(err.faultCode, 'W11-SETTLEMENT-422-INVALID_TX_HASH');
          assert.equal(err.httpStatus, 422);
          return true;
        },
      );
    }
  });

  it('rechaza BROADCAST, PATCH /confirmations y COMPLETE sin permiso withdrawals.broadcast incluso para SUPER_ADMIN o spoof de webhook/worker (401/403)', async () => {
    // Missing auth header pretending to be webhook/worker MUST return 401
    const webhookRes = await fetch(
      `${baseUrl}/api/admin/withdrawals/${withdrawalIdBep20}/confirmations`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': 'spoofed-webhook',
          'x-worker-id': 'cron-confirmations',
        },
        body: JSON.stringify({ expectedStatus: 'BROADCASTED', confirmations: 10 }),
      },
    );
    assert.equal(webhookRes.status, 401);

    // Admin with withdrawals.process (missing withdrawals.broadcast) -> 403 on BROADCAST & PATCH confirmations
    await assert.rejects(
      () =>
        broadcastAdminWithdrawal(
          processOnlySession,
          withdrawalIdBep20,
          { expectedStatus: 'PROCESSING', txHash: REAL_EVM_TXHASH, confirmations: 0 },
          { baseUrl },
        ),
      (err) => isWithdrawalModuleError(err) && err.httpStatus === 403,
    );

    // SUPER_ADMIN without explicit withdrawals.broadcast -> 403 on PATCH /confirmations & COMPLETE
    await assert.rejects(
      () =>
        updateAdminWithdrawalConfirmations(
          superNoBroadcastSession,
          withdrawalIdBep20,
          { expectedStatus: 'BROADCASTED', confirmations: 15 },
          { baseUrl },
        ),
      (err) => isWithdrawalModuleError(err) && err.httpStatus === 403,
    );

    await assert.rejects(
      () =>
        completeAdminWithdrawal(
          superNoBroadcastSession,
          withdrawalIdBep20,
          { expectedStatus: 'BROADCASTED', confirmations: 15 },
          { baseUrl },
        ),
      (err) => isWithdrawalModuleError(err) && err.httpStatus === 403,
    );

    // Non-admin client caller even with forged claim -> 403
    await assert.rejects(
      () =>
        updateAdminWithdrawalConfirmations(
          clientCallerSession,
          withdrawalIdBep20,
          { expectedStatus: 'BROADCASTED', confirmations: 15 },
          { baseUrl },
        ),
      (err) => isWithdrawalModuleError(err) && err.httpStatus === 403,
    );
  });

  it('ejecuta BROADCAST idempotente con txHash real + explorerTxUrl, congela campos post-broadcast y rechaza conflicto de otro txHash (409)', async () => {
    const res = await broadcastAdminWithdrawal(
      broadcastSession,
      withdrawalIdBep20,
      {
        expectedStatus: 'PROCESSING',
        txHash: `  ${REAL_EVM_TXHASH}  `,
        confirmations: 2,
        providerTransactionId: 'prov-w11-broadcast-1',
      },
      { baseUrl },
    );

    assert.equal(res.ok, true);
    assert.equal(res.idempotentReplay, false);
    assert.equal(res.withdrawalRequest.status, 'BROADCASTED');
    assert.equal(res.withdrawalRequest.txHash, REAL_EVM_TXHASH);
    assert.equal(res.withdrawalRequest.confirmations, 2);
    assert.equal(res.withdrawalRequest.broadcastedBy, broadcastSession.uid);
    assert.equal(res.withdrawalRequest.explorerTxUrl, `https://bscscan.com/tx/${REAL_EVM_TXHASH}`);

    const auditCountAfterFirst = Array.from(
      db.collections.get(WITHDRAWAL_AUDIT_EVENTS_COLLECTION)!.values(),
    ).filter((ev) => ev.withdrawalId === withdrawalIdBep20).length;

    // Replay idempotente con el mismo txHash: 200 idempotentReplay:true sin duplicar audit
    const replay = await broadcastAdminWithdrawal(
      broadcastSession,
      withdrawalIdBep20,
      { expectedStatus: 'PROCESSING', txHash: REAL_EVM_TXHASH, confirmations: 2 },
      { baseUrl },
    );
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.withdrawalRequest.txHash, REAL_EVM_TXHASH);

    const auditCountAfterReplay = Array.from(
      db.collections.get(WITHDRAWAL_AUDIT_EVENTS_COLLECTION)!.values(),
    ).filter((ev) => ev.withdrawalId === withdrawalIdBep20).length;
    assert.equal(auditCountAfterReplay, auditCountAfterFirst);

    // Conflicto al intentar sobrescribir con OTRO txHash -> 409 BROADCAST_TXHASH_CONFLICT
    await assert.rejects(
      () =>
        broadcastAdminWithdrawal(
          broadcastSession,
          withdrawalIdBep20,
          { expectedStatus: 'BROADCASTED', txHash: OTHER_EVM_TXHASH, confirmations: 2 },
          { baseUrl },
        ),
      (err) => {
        assert.ok(isWithdrawalModuleError(err));
        assert.equal(err.faultCode, 'W11-SETTLEMENT-409-BROADCAST_TXHASH_CONFLICT');
        assert.equal(err.httpStatus, 409);
        return true;
      },
    );

    // Post-broadcast: W09 EDIT queda totalmente congelado
    await assert.rejects(
      () =>
        executeAdminWorkflowAction(
          db as never,
          {
            uid: broadcastSession.uid,
            email: broadcastSession.email,
            displayName: 'Admin Settler',
            role: 'admin',
            permissions: [...broadcastSession.permissions, 'withdrawals.edit'],
          },
          withdrawalIdBep20,
          {
            action: 'EDIT',
            dto: {
              expectedStatus: 'BROADCASTED',
              internalNotes: 'Attempt post-broadcast edit',
              reason: 'Freeze check',
            },
          },
        ),
      (err) => isWithdrawalModuleError(err) && (err.httpStatus === 409 || err.httpStatus === 422),
    );
  });

  it('actualiza confirmaciones con monotonicidad, bloquea COMPLETE si confirmations < requiredConfirmations y liquida atómicamente a COMPLETED con replay idempotente y W10 BALANCED', async () => {
    const reqDoc = db.collections.get(WITHDRAWAL_REQUESTS_COLLECTION)!.get(
      withdrawalIdBep20,
    ) as unknown as WithdrawalRequest;
    const reqConf = reqDoc.requiredConfirmations; // 15 on BEP20
    assert.ok(reqConf >= 10);

    // Regresión de confirmaciones (2 -> 1) -> 400
    await assert.rejects(
      () =>
        updateAdminWithdrawalConfirmations(
          broadcastSession,
          withdrawalIdBep20,
          { expectedStatus: 'BROADCASTED', confirmations: 1 },
          { baseUrl },
        ),
      (err) => isWithdrawalModuleError(err) && err.faultCode === 'W11-SETTLEMENT-400-INVALID_SETTLEMENT_PAYLOAD',
    );

    // Actualización parcial a reqConf - 1
    const partialUpd = await updateAdminWithdrawalConfirmations(
      broadcastSession,
      withdrawalIdBep20,
      { expectedStatus: 'BROADCASTED', confirmations: reqConf - 1, reason: 'Mempool + blocks' },
      { baseUrl },
    );
    assert.equal(partialUpd.withdrawalRequest.confirmations, reqConf - 1);

    // Intentar COMPLETE con confirmations < requiredConfirmations -> 422 INSUFFICIENT_CONFIRMATIONS
    await assert.rejects(
      () =>
        completeAdminWithdrawal(
          broadcastSession,
          withdrawalIdBep20,
          { expectedStatus: 'BROADCASTED', confirmations: reqConf - 1 },
          { baseUrl },
        ),
      (err) => {
        assert.ok(isWithdrawalModuleError(err));
        assert.equal(err.faultCode, 'W11-SETTLEMENT-422-INSUFFICIENT_CONFIRMATIONS');
        assert.equal(err.httpStatus, 422);
        return true;
      },
    );

    const balanceBeforeSettle = db.collections
      .get(USER_BALANCES_COLLECTION)!
      .get('user-client-1') as unknown as UserFinancialBalance;

    // Liquidación atómica con confirmations >= requiredConfirmations
    const settled = await completeAdminWithdrawal(
      broadcastSession,
      withdrawalIdBep20,
      {
        expectedStatus: 'BROADCASTED',
        confirmations: reqConf,
        reason: 'Finality confirmed on BSC',
      },
      { baseUrl },
    );

    assert.equal(settled.idempotentReplay, false);
    assert.equal(settled.withdrawalRequest.status, 'COMPLETED');
    assert.equal(settled.withdrawalRequest.completedBy, broadcastSession.uid);
    assert.equal(settled.withdrawalRequest.confirmations, reqConf);
    assert.equal(settled.ledgerEntryId, deterministicSettlementLedgerId(withdrawalIdBep20));
    assert.equal(settled.ledgerEntry?.type, 'WITHDRAWAL');
    assert.equal(settled.ledgerEntry?.direction, 'DEBIT');
    assert.equal(settled.ledgerEntry?.amountMicros, reqDoc.totalDebitMicros);
    assert.equal(settled.userBalance?.availableBalanceMicros, balanceBeforeSettle.availableBalanceMicros);
    assert.equal(
      settled.userBalance?.lockedBalanceMicros,
      balanceBeforeSettle.lockedBalanceMicros - reqDoc.totalDebitMicros,
    );
    assert.equal(
      settled.userBalance?.totalWithdrawnMicros,
      balanceBeforeSettle.totalWithdrawnMicros + reqDoc.requestedAmountMicros,
    );

    // Replay idempotente de COMPLETE -> 200 idempotentReplay:true sin doble débito ni segundo asiento
    const settledReplay = await completeAdminWithdrawal(
      broadcastSession,
      withdrawalIdBep20,
      { expectedStatus: 'COMPLETED', confirmations: reqConf },
      { baseUrl },
    );
    assert.equal(settledReplay.idempotentReplay, true);
    assert.equal(
      settledReplay.userBalance?.lockedBalanceMicros,
      settled.userBalance?.lockedBalanceMicros,
    );
    assert.equal(
      settledReplay.userBalance?.totalWithdrawnMicros,
      settled.userBalance?.totalWithdrawnMicros,
    );

    const ledgerDocsForBep20 = Array.from(
      db.collections.get(FINANCIAL_LEDGER_COLLECTION)!.values(),
    ).filter((e) => (e as unknown as FinancialLedgerEntry).withdrawalId === withdrawalIdBep20);
    assert.equal(ledgerDocsForBep20.length, 2); // Exactamente 1 LOCK (led_lock_*) + 1 WITHDRAWAL (*__SETTLEMENT)

    // Conexión con W10: conciliación forense debe marcar SETTLED_CLOSED + balanced: true
    const w10Audit = await getAdminWithdrawalAuditTimeline(
      db as never,
      {
        uid: broadcastSession.uid,
        email: broadcastSession.email,
        displayName: 'Admin Settler',
        role: 'admin',
        permissions: [...broadcastSession.permissions],
      },
      withdrawalIdBep20,
      { strictIntegrity: true },
    );
    assert.equal(w10Audit.reconciliation.invariantStatus, 'SETTLED_CLOSED');
    assert.equal(w10Audit.reconciliation.isBalanced, true);
    assert.equal(w10Audit.reconciliation.settlementEntryPresent, true);
  });

  it('soporta TRON y SOLANA txHash válidos, bloquea si existe UNLOCK previo (409) y refleja txHash/confirmations en Controlador Admin + UI SSR', async () => {
    // 1. TRON + Conflicting UNLOCK protection
    const tronBcast = await executeAdminBroadcastWithdrawal(
      db as never,
      {
        uid: broadcastSession.uid,
        email: broadcastSession.email,
        displayName: 'Admin Settler',
        role: 'admin',
        permissions: [...broadcastSession.permissions],
      },
      withdrawalIdTrc20,
      { expectedStatus: 'PROCESSING', txHash: REAL_TRON_TXHASH, confirmations: 19 },
    );
    assert.equal(tronBcast.withdrawalRequest.explorerTxUrl, `https://tronscan.org/#/transaction/${REAL_TRON_TXHASH}`);

    // Simulate anomalous pre-existing __UNLOCK doc before COMPLETE
    db.collections.get(FINANCIAL_LEDGER_COLLECTION)!.set(`${withdrawalIdTrc20}__UNLOCK`, {
      id: `${withdrawalIdTrc20}__UNLOCK`,
      withdrawalId: withdrawalIdTrc20,
      type: 'WITHDRAWAL_UNLOCK',
      direction: 'CREDIT',
      amountMicros: 51_000_000,
    });

    await assert.rejects(
      () =>
        executeAdminCompleteWithdrawal(
          db as never,
          {
            uid: broadcastSession.uid,
            email: broadcastSession.email,
            displayName: 'Admin Settler',
            role: 'admin',
            permissions: [...broadcastSession.permissions],
          },
          withdrawalIdTrc20,
          { expectedStatus: 'BROADCASTED', confirmations: 19 },
        ),
      (err) =>
        isWithdrawalModuleError(err) &&
        err.faultCode === 'W11-SETTLEMENT-409-CONFLICTING_UNLOCK',
    );

    // 2. Controller W08 + W11 end-to-end on Solana withdrawal + UI reflection
    const ctrl = createAdminWithdrawalsController({
      session: broadcastSession,
      apiOptions: { baseUrl },
      initialTab: 'all',
    });
    await ctrl.load();
    await ctrl.openDetail(withdrawalIdSol);

    await ctrl.executeSettlementAction(withdrawalIdSol, {
      action: 'BROADCAST',
      expectedStatus: 'PROCESSING',
      txHash: REAL_SOL_TXHASH,
      confirmations: 5,
    });
    assert.equal(ctrl.getSnapshot().selectedDetail?.withdrawal.status, 'BROADCASTED');
    assert.equal(ctrl.getSnapshot().selectedDetail?.withdrawal.txHash, REAL_SOL_TXHASH);
    assert.equal(ctrl.getSnapshot().selectedDetail?.withdrawal.confirmations, 5);

    await ctrl.executeSettlementAction(withdrawalIdSol, {
      action: 'UPDATE_CONFIRMATIONS',
      expectedStatus: 'BROADCASTED',
      confirmations: 32,
      reason: 'Solana finalized slot',
    });
    assert.equal(ctrl.getSnapshot().selectedDetail?.withdrawal.confirmations, 32);

    await ctrl.executeSettlementAction(withdrawalIdSol, {
      action: 'COMPLETE',
      expectedStatus: 'BROADCASTED',
      confirmations: 32,
      reason: 'Settle Solana withdrawal',
    });

    const finalSnap = ctrl.getSnapshot();
    assert.equal(finalSnap.selectedDetail?.withdrawal.status, 'COMPLETED');
    assert.equal(finalSnap.selectedDetail?.withdrawal.txHash, REAL_SOL_TXHASH);
    assert.equal(finalSnap.selectedDetail?.withdrawal.confirmations, 32);
    assert.ok(finalSnap.kpis.completedCount >= 2); // BEP20 + SOLANA completed

    // SSR smoke: ControlCenter + SettlementToolbar + SettlementModal render cleanly
    const centerHtml = renderToStaticMarkup(
      React.createElement(AdminWithdrawalsControlCenter, {
        session: broadcastSession,
        autoLoad: false,
        initialSnapshot: finalSnap,
      }),
    );
    assert.ok(centerHtml.includes(WALLET_SOL.slice(0, 6)) || centerHtml.includes('Centro de Control'));

    const modalHtml = renderToStaticMarkup(
      React.createElement(AdminWithdrawalSettlementModal, {
        withdrawal: finalSnap.selectedDetail!.withdrawal,
        action: 'COMPLETE',
        isSubmitting: false,
        onClose: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    assert.ok(modalHtml.includes('Liquidar Retiro Atómicamente a COMPLETED'));

    const toolbarHtml = renderToStaticMarkup(
      React.createElement(AdminWithdrawalSettlementToolbar, {
        withdrawal: tronBcast.withdrawalRequest,
        rbac: {
          canRead: true,
          canViewAudit: true,
          canReview: false,
          canEdit: false,
          canApprove: false,
          canReject: false,
          canCancel: false,
          canProcess: false,
          canBroadcast: false,
          canComplete: true,
          allowedWorkflowActions: ['COMPLETE'],
        },
        grantedPermissions: broadcastSession.permissions,
        onSelectAction: () => undefined,
      }),
    );
    assert.ok(toolbarHtml.includes('admin-settlement-btn-complete'));
  });

  it('conserva intactos los hashes SHA-256 base W01..W10 sin modificar contratos congelados', () => {
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
