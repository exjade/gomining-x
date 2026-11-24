/**
 * SCRUM-275 / SCRUM-289 / SCRUM-284 (W09)
 * Admin Withdrawals Workflow E2E Verification & Cumulative W01..W09 Integrity Suite:
 * - Endpoints: `POST /:id/review`, `PATCH /:id`, `POST /:id/approve`, `POST /:id/process`, `POST /:id/reject`, `POST /:id/cancel`
 * - Enforces W02 granular RBAC per action (zero `SUPER_ADMIN` bypass, leaves W11 `broadcast`/`complete` unmounted)
 * - Verifies `runTransaction` Phase 1 (Reads) -> Phase 2 (Writes) discipline
 * - Verifies fast-path `REQUESTED -> APPROVED` backfills `reviewedBy` & `reviewedAt` atomically
 * - Verifies `EDIT` allowlist, immutable financial fields, stage restrictions & fee-change rejection
 * - Verifies atomic `LOCKED -> AVAILABLE` unlock + `/financialLedger/{id}__UNLOCK` + `/users/{uid}.balance` sync under adversarial concurrency
 * - Verifies `adminWithdrawalWorkflowClient`, `AdminWithdrawalsControlCenter`, `AdminWithdrawalWorkflowModal` SSR & W01..W08 immutable hashes
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
  FINANCIAL_LEDGER_COLLECTION,
  USERS_COLLECTION,
  USER_BALANCES_COLLECTION,
  WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
  WITHDRAWAL_NETWORKS_COLLECTION,
  WITHDRAWAL_REQUESTS_COLLECTION,
  type FinancialLedgerEntry,
  type UserFinancialBalance,
  type WithdrawalAuditEvent,
  type WithdrawalRequest,
} from '../../src/types/withdrawal.js';
import { createAdminWithdrawalsRouter } from '../../server/services/adminWithdrawalsRouter.js';
import { createAdminWithdrawalWorkflowRouter } from '../../server/services/adminWithdrawalWorkflowRouter.js';
import { deterministicUnlockLedgerId } from '../../server/services/adminWithdrawalWorkflowService.js';
import type { WithdrawalAuthzDependencies } from '../../server/services/withdrawalAuthzMiddleware.js';
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
const { AdminWithdrawalWorkflowModal } = await import(
  '../../src/components/admin/AdminWithdrawalWorkflowModal.tsx'
);

const projectRoot = path.resolve(import.meta.dirname, '../..');
const WALLET_A = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
const WALLET_NEW = '0x999999cf1046e68e36E1aA2E0E07105eDDD1f08E';

function makeWithdrawal(
  id: string,
  overrides: Partial<WithdrawalRequest> = {},
): WithdrawalRequest {
  const requestedAt = overrides.requestedAt ?? '2026-11-18T09:00:00.000Z';
  return {
    id,
    userId: 'uid_user_01',
    userEmail: 'user01@pouw.io',
    asset: 'USDT',
    networkId: 'usdt-bsc',
    network: 'BSC',
    networkDisplayName: 'BNB Smart Chain (BEP-20)',
    addressType: 'EVM',
    destinationAddress: WALLET_A,
    requestedAmountMicros: 50_000_000,
    networkFeeMicros: 500_000,
    platformFeeMicros: 500_000,
    conversionFeeMicros: 0,
    totalDebitMicros: 51_000_000,
    netAmountMicros: 50_000_000,
    status: 'REQUESTED',
    membershipTierSnapshot: 'PRO',
    slaDisplaySnapshot: '1 a 5 horas (Prioridad Membresía PRO)',
    confirmations: 0,
    requiredConfirmations: 15,
    idempotencyKey: `idem_${id}`,
    configVersion: 1,
    requestedAt,
    createdAt: requestedAt,
    updatedAt: requestedAt,
    ...overrides,
  };
}

/**
 * Serialized Transactional Firestore Mock enforcing Phase 1 Reads -> Phase 2 Writes
 * and supporting multi-collection queries needed by both W08 Read Router and W09 Workflow Router.
 */
function createTransactionalWorkflowFirestoreMock(seed: {
  admins: Record<string, Record<string, unknown>>;
  withdrawals: WithdrawalRequest[];
  balances: Record<string, UserFinancialBalance>;
  users: Record<string, Record<string, unknown>>;
  networks?: Record<string, Record<string, unknown>>;
  ledger?: FinancialLedgerEntry[];
  auditEvents?: WithdrawalAuditEvent[];
}) {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();

  const initMap = (name: string) => {
    const map = new Map<string, Record<string, unknown>>();
    collections.set(name, map);
    return map;
  };

  const adminsMap = initMap('admin_users');
  for (const [k, v] of Object.entries(seed.admins)) adminsMap.set(k, { ...v });

  const wthMap = initMap(WITHDRAWAL_REQUESTS_COLLECTION);
  for (const item of seed.withdrawals) wthMap.set(item.id, { ...item });

  const balMap = initMap(USER_BALANCES_COLLECTION);
  for (const [k, v] of Object.entries(seed.balances)) balMap.set(k, { ...v });

  const usrMap = initMap(USERS_COLLECTION);
  for (const [k, v] of Object.entries(seed.users)) usrMap.set(k, { ...v });

  const netMap = initMap(WITHDRAWAL_NETWORKS_COLLECTION);
  if (seed.networks) {
    for (const [k, v] of Object.entries(seed.networks)) netMap.set(k, { ...v });
  }

  const ledMap = initMap(FINANCIAL_LEDGER_COLLECTION);
  for (const entry of seed.ledger ?? []) ledMap.set(entry.id, { ...entry });

  const audMap = initMap(WITHDRAWAL_AUDIT_EVENTS_COLLECTION);
  for (const ev of seed.auditEvents ?? []) audMap.set(ev.id, { ...ev });

  const getStore = (name: string): Map<string, Record<string, unknown>> => {
    const found = collections.get(name);
    if (!found) throw new Error(`Unexpected collection "${name}"`);
    return found;
  };

  let txQueue = Promise.resolve();

  function makeQuery(
    store: Map<string, Record<string, unknown>>,
    clauses: Array<{ field: string; value: unknown }>,
    orderSpec: { field: string; dir: 'asc' | 'desc' } | null = null,
    afterId: string | null = null,
    limitVal = 500,
  ) {
    return {
      where(field: string, _op: string, value: unknown) {
        return makeQuery(store, [...clauses, { field, value }], orderSpec, afterId, limitVal);
      },
      orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
        return makeQuery(store, clauses, { field, dir }, afterId, limitVal);
      },
      startAfter(snap: { id?: string }) {
        return makeQuery(store, clauses, orderSpec, snap?.id ?? null, limitVal);
      },
      limit(n: number) {
        return makeQuery(store, clauses, orderSpec, afterId, n);
      },
      async get() {
        let rows = Array.from(store.entries()).filter(([, data]) =>
          clauses.every((c) => data[c.field] === c.value),
        );
        if (orderSpec) {
          rows = rows.sort(([idA, a], [idB, b]) => {
            const cmp =
              orderSpec.dir === 'desc'
                ? String(b[orderSpec.field] ?? '').localeCompare(String(a[orderSpec.field] ?? ''))
                : String(a[orderSpec.field] ?? '').localeCompare(String(b[orderSpec.field] ?? ''));
            return cmp !== 0 ? cmp : idB.localeCompare(idA);
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
        where(field: string, _op: string, value: unknown) {
          return makeQuery(store, [{ field, value }]);
        },
        orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
          return makeQuery(store, [], { field, dir });
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
        let writePhaseStarted = false;
        const stagedWrites: Array<{ col: string; id: string; data: Record<string, unknown>; merge: boolean }> = [];

        const tx = {
          async get(ref: { _colName: string; id: string }) {
            if (writePhaseStarted) {
              throw new Error('Firestore Transaction Violation: tx.get() attempted after tx.set()');
            }
            const row = getStore(ref._colName).get(ref.id);
            return {
              id: ref.id,
              exists: Boolean(row),
              data: () => (row ? { ...row } : undefined),
            };
          },
          set(
            ref: { _colName: string; id: string },
            data: Record<string, unknown>,
            opts?: { merge?: boolean },
          ) {
            writePhaseStarted = true;
            stagedWrites.push({
              col: ref._colName,
              id: ref.id,
              data: { ...data },
              merge: Boolean(opts?.merge),
            });
          },
        };

        const out = await fn(tx);
        for (const w of stagedWrites) {
          const map = getStore(w.col);
          if (w.merge && map.has(w.id)) {
            map.set(w.id, { ...map.get(w.id)!, ...w.data });
          } else {
            map.set(w.id, w.data);
          }
        }
        return out;
      } finally {
        release();
      }
    },
  };
}

describe('SCRUM-284 (W09): Admin Workflow E2E (review, edit, approve, process, reject, cancel & atomic unlock)', () => {
  let db: ReturnType<typeof createTransactionalWorkflowFirestoreMock>;
  let server: http.Server;
  let baseUrl = '';

  const tokenMap: Record<string, { uid: string; email: string }> = {
    'tok-client': { uid: 'uid_user_01', email: 'user01@pouw.io' },
    'tok-super-legacy': { uid: 'uid_super_legacy', email: 'super@pouw.io' },
    'tok-reviewer-only': { uid: 'uid_reviewer_only', email: 'reviewer@pouw.io' },
    'tok-full-ops': { uid: 'uid_full_ops', email: 'full.ops@pouw.io' },
    'tok-full-ops-2': { uid: 'uid_full_ops_2', email: 'full.ops2@pouw.io' },
  };

  const fullOpsSession: AdminWithdrawalSession = {
    uid: 'uid_full_ops',
    email: 'full.ops@pouw.io',
    idToken: 'tok-full-ops',
    permissions: [
      'withdrawals.read',
      'withdrawals.review',
      'withdrawals.edit',
      'withdrawals.approve',
      'withdrawals.process',
      'withdrawals.reject',
      'withdrawals.cancel',
      'withdrawals.audit',
    ],
  };

  before(async () => {
    db = createTransactionalWorkflowFirestoreMock({
      admins: {
        uid_super_legacy: {
          uid: 'uid_super_legacy',
          email: 'super@pouw.io',
          role: 'super_admin',
          status: 'ACTIVE',
          permissions: ['SUPER_ADMIN'],
        },
        uid_reviewer_only: {
          uid: 'uid_reviewer_only',
          email: 'reviewer@pouw.io',
          role: 'admin',
          status: 'ACTIVE',
          permissions: ['withdrawals.read', 'withdrawals.review'],
        },
        uid_full_ops: {
          uid: 'uid_full_ops',
          email: 'full.ops@pouw.io',
          role: 'admin',
          status: 'ACTIVE',
          permissions: [...fullOpsSession.permissions],
        },
        uid_full_ops_2: {
          uid: 'uid_full_ops_2',
          email: 'full.ops2@pouw.io',
          role: 'admin',
          status: 'ACTIVE',
          permissions: [...fullOpsSession.permissions],
        },
      },
      balances: {
        uid_user_01: {
          uid: 'uid_user_01',
          email: 'user01@pouw.io',
          membershipTier: 'PRO',
          availableBalanceMicros: 100_000_000, // 100.00 USDT
          lockedBalanceMicros: 255_000_000, // covers 5 x 51.00 USDT
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T09:00:00.000Z',
        },
      },
      users: {
        uid_user_01: {
          uid: 'uid_user_01',
          email: 'user01@pouw.io',
          balance: 100,
        },
      },
      networks: {
        'usdt-bsc': {
          id: 'usdt-bsc',
          asset: 'USDT',
          networkCode: 'BSC',
          network: 'BNB Smart Chain (BEP-20)',
          tokenStandard: 'BEP-20',
          enabled: true,
          minimumWithdrawalMicros: 10_000_000,
          requiredConfirmations: 15,
          explorerTxUrlTemplate: 'https://bscscan.com/tx/{txHash}',
          addressType: 'EVM',
          feePolicy: {
            networkFeeMicros: 500_000,
            platformFeeBps: 100,
            platformFeeMinMicros: 0,
            conversionFeeMicros: 0,
          },
          configVersion: 1,
          updatedAt: '2026-11-18T00:00:00.000Z',
        },
        'usdt-bsc-alt': {
          id: 'usdt-bsc-alt',
          asset: 'USDT',
          networkCode: 'BSC',
          network: 'BNB Smart Chain Mirror',
          tokenStandard: 'BEP-20',
          enabled: true,
          minimumWithdrawalMicros: 10_000_000,
          requiredConfirmations: 20,
          explorerTxUrlTemplate: 'https://bscscan.com/tx/{txHash}',
          addressType: 'EVM',
          feePolicy: {
            networkFeeMicros: 500_000,
            platformFeeBps: 100,
            platformFeeMinMicros: 0,
            conversionFeeMicros: 0,
          },
          configVersion: 2,
          updatedAt: '2026-11-18T00:00:00.000Z',
        },
        'usdt-eth': {
          id: 'usdt-eth',
          asset: 'USDT',
          networkCode: 'ETHEREUM',
          network: 'Ethereum (ERC-20)',
          tokenStandard: 'ERC-20',
          enabled: true,
          minimumWithdrawalMicros: 10_000_000,
          requiredConfirmations: 12,
          explorerTxUrlTemplate: 'https://etherscan.io/tx/{txHash}',
          addressType: 'EVM',
          feePolicy: {
            networkFeeMicros: 3_500_000,
            platformFeeBps: 100,
            platformFeeMinMicros: 0,
            conversionFeeMicros: 0,
          },
          configVersion: 1,
          updatedAt: '2026-11-18T00:00:00.000Z',
        },
      },
      withdrawals: [
        makeWithdrawal('wth_flow_1', { requestedAt: '2026-11-18T09:05:00.000Z' }),
        makeWithdrawal('wth_fastpath_2', { requestedAt: '2026-11-18T09:04:00.000Z' }),
        makeWithdrawal('wth_reject_3', { requestedAt: '2026-11-18T09:03:00.000Z' }),
        makeWithdrawal('wth_cancel_4', {
          status: 'APPROVED',
          requestedAt: '2026-11-18T09:02:00.000Z',
        }),
        makeWithdrawal('wth_race_5', { requestedAt: '2026-11-18T09:01:00.000Z' }),
        makeWithdrawal('wth_broadcasted_6', {
          status: 'BROADCASTED',
          txHash: '0x' + 'ab12cd34'.repeat(8),
          requestedAt: '2026-11-18T09:00:00.000Z',
        }),
      ],
    });

    const deps: WithdrawalAuthzDependencies = {
      authAdapter: {
        isInitialized: () => true,
        getApp: () => null,
        verifyIdToken: async (token: string) => {
          const found = tokenMap[token];
          if (!found) return null;
          return {
            uid: found.uid,
            email: found.email,
            email_verified: true,
            firebase: { sign_in_provider: 'password' },
          };
        },
      },
      firestore: db as unknown as WithdrawalAuthzDependencies['firestore'],
    };

    const app = express();
    app.use(express.json());
    app.use(
      '/api/admin/withdrawals',
      createAdminWithdrawalsRouter({ ...deps, firestore: db as unknown as WithdrawalAuthzDependencies['firestore'] }),
    );
    app.use(
      '/api/admin/withdrawals',
      createAdminWithdrawalWorkflowRouter({
        ...deps,
        firestore: db as unknown as Parameters<typeof createAdminWithdrawalWorkflowRouter>[0]['firestore'],
      }),
    );

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('1. enforces granular W02 RBAC per workflow action (zero SUPER_ADMIN bypass) and keeps W11 unmounted', async () => {
    // 401 unauth
    const unauth = await fetch(`${baseUrl}/api/admin/withdrawals/wth_flow_1/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStatus: 'REQUESTED' }),
    });
    assert.equal(unauth.status, 401);

    // 403 client token
    const clientTry = await fetch(`${baseUrl}/api/admin/withdrawals/wth_flow_1/review`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-client', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStatus: 'REQUESTED' }),
    });
    assert.equal(clientTry.status, 403);

    // 403 legacy SUPER_ADMIN without withdrawals.approve
    const superTry = await fetch(`${baseUrl}/api/admin/withdrawals/wth_flow_1/approve`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-super-legacy', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStatus: 'REQUESTED' }),
    });
    assert.equal(superTry.status, 403);

    // 403 reviewer trying approve / reject / edit
    for (const ep of [
      { method: 'POST', path: '/wth_flow_1/approve', body: { expectedStatus: 'REQUESTED' } },
      { method: 'POST', path: '/wth_flow_1/reject', body: { expectedStatus: 'REQUESTED', rejectionReason: 'no perm' } },
      { method: 'PATCH', path: '/wth_flow_1', body: { expectedStatus: 'REQUESTED', internalNotes: 'x', reason: 'y' } },
    ]) {
      const res = await fetch(`${baseUrl}/api/admin/withdrawals${ep.path}`, {
        method: ep.method,
        headers: {
          Authorization: 'Bearer tok-reviewer-only',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ep.body),
      });
      assert.equal(res.status, 403);
    }

    // W11 broadcast & complete remain unmounted (404)
    const bRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_flow_1/broadcast`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(bRes.status, 404);
  });

  it('2. executes REVIEW -> APPROVE -> PROCESS lifecycle and fast-path REQUESTED -> APPROVED with atomic reviewedBy/reviewedAt', async () => {
    // Reviewer takes wth_flow_1 into UNDER_REVIEW
    const revRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_flow_1/review`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-reviewer-only', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStatus: 'REQUESTED', reason: 'Iniciando KYC check' }),
    });
    assert.equal(revRes.status, 200);
    const revJson = (await revRes.json()) as { withdrawalRequest: WithdrawalRequest };
    assert.equal(revJson.withdrawalRequest.status, 'UNDER_REVIEW');
    assert.equal(revJson.withdrawalRequest.reviewedBy, 'uid_reviewer_only');
    assert.ok(revJson.withdrawalRequest.reviewedAt);

    // Stale expectedStatus -> 409 W09-WORKFLOW-409-CONCURRENCY_STATUS_MISMATCH
    const staleRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_flow_1/approve`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStatus: 'REQUESTED' }),
    });
    assert.equal(staleRes.status, 409);
    assert.equal(
      ((await staleRes.json()) as { faultCode: string }).faultCode,
      'W09-WORKFLOW-409-CONCURRENCY_STATUS_MISMATCH',
    );

    // Approve UNDER_REVIEW -> APPROVED
    const appRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_flow_1/approve`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStatus: 'UNDER_REVIEW', reason: 'Aprobado OK' }),
    });
    assert.equal(appRes.status, 200);
    assert.equal(
      ((await appRes.json()) as { withdrawalRequest: WithdrawalRequest }).withdrawalRequest.status,
      'APPROVED',
    );

    // Process APPROVED -> PROCESSING
    const procRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_flow_1/process`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStatus: 'APPROVED',
        providerTransactionId: 'prov_tx_9001',
        reason: 'Enviado a cola de firma',
      }),
    });
    assert.equal(procRes.status, 200);
    const procJson = (await procRes.json()) as { withdrawalRequest: WithdrawalRequest };
    assert.equal(procJson.withdrawalRequest.status, 'PROCESSING');
    assert.equal(procJson.withdrawalRequest.providerTransactionId, 'prov_tx_9001');

    // Fast-path REQUESTED -> APPROVED on wth_fastpath_2 atomically populates reviewedBy & reviewedAt
    const fastRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_fastpath_2/approve`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStatus: 'REQUESTED', reason: 'Fast-path ELITE' }),
    });
    assert.equal(fastRes.status, 200);
    const fastJson = (await fastRes.json()) as {
      withdrawalRequest: WithdrawalRequest;
      auditEvent: WithdrawalAuditEvent;
    };
    assert.equal(fastJson.withdrawalRequest.status, 'APPROVED');
    assert.equal(fastJson.withdrawalRequest.reviewedBy, 'uid_full_ops');
    assert.equal(fastJson.withdrawalRequest.approvedBy, 'uid_full_ops');
    assert.ok(fastJson.withdrawalRequest.reviewedAt);
    assert.ok(fastJson.withdrawalRequest.approvedAt);
    assert.equal(fastJson.auditEvent.changedValues?.fastPathReview, true);
  });

  it('3. enforces EDIT allowlist: blocks immutable financial fields, fee-changing networks, wrong stages & post-broadcast', async () => {
    // 1. Forbidden requestedAmountMicros edit -> 422 W09-WORKFLOW-422-IMMUTABLE_FINANCIAL_FIELD
    const amtRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_reject_3`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStatus: 'REQUESTED',
        requestedAmountMicros: 99_000_000,
        reason: 'Intento editar monto',
      }),
    });
    assert.equal(amtRes.status, 422);
    assert.equal(
      ((await amtRes.json()) as { faultCode: string }).faultCode,
      'W09-WORKFLOW-422-IMMUTABLE_FINANCIAL_FIELD',
    );

    // 2. Network change with differing fees (usdt-bsc -> usdt-eth) -> 422 W09-WORKFLOW-422-NETWORK_FEE_CHANGE_REQUIRES_REJECT
    const feeChangeRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_reject_3`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStatus: 'REQUESTED',
        networkId: 'usdt-eth',
        reason: 'Cambio a ETH con distinto fee',
      }),
    });
    assert.equal(feeChangeRes.status, 422);
    assert.equal(
      ((await feeChangeRes.json()) as { faultCode: string }).faultCode,
      'W09-WORKFLOW-422-NETWORK_FEE_CHANGE_REQUIRES_REJECT',
    );

    // 3. Valid destinationAddress + same-economics networkId change + internalNotes in REQUESTED
    const okEditRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_reject_3`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStatus: 'REQUESTED',
        destinationAddress: WALLET_NEW,
        networkId: 'usdt-bsc-alt',
        internalNotes: 'Wallet verificada con usuario',
        reason: 'Corrección de wallet EVM por ticket soporte',
      }),
    });
    assert.equal(okEditRes.status, 200);
    const okEdit = (await okEditRes.json()) as {
      withdrawalRequest: WithdrawalRequest;
      auditEvent: WithdrawalAuditEvent;
    };
    assert.equal(okEdit.withdrawalRequest.destinationAddress, WALLET_NEW);
    assert.equal(okEdit.withdrawalRequest.networkId, 'usdt-bsc-alt');
    assert.equal(okEdit.auditEvent.previousValues?.destinationAddress, WALLET_A);
    assert.equal(okEdit.auditEvent.changedValues?.destinationAddress, WALLET_NEW);

    // 4. Destination edit forbidden in APPROVED (wth_cancel_4), while internalNotes allowed
    const stageBlockedRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_cancel_4`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStatus: 'APPROVED',
        destinationAddress: WALLET_NEW,
        reason: 'No debería dejar cambiar wallet en APPROVED',
      }),
    });
    assert.equal(stageBlockedRes.status, 422);
    assert.equal(
      ((await stageBlockedRes.json()) as { faultCode: string }).faultCode,
      'W09-WORKFLOW-422-EDIT_STAGE_RESTRICTED',
    );

    // 5. Post-broadcast edit completely forbidden (409 W01-DOMAIN-409-IMMUTABLE_BROADCASTED_WITHDRAWAL)
    const postBroadcastRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_broadcasted_6`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStatus: 'BROADCASTED',
        internalNotes: 'Intentar nota en BROADCASTED',
        reason: 'Post broadcast',
      }),
    });
    assert.equal(postBroadcastRes.status, 409);
    assert.equal(
      ((await postBroadcastRes.json()) as { faultCode: string }).faultCode,
      'W01-DOMAIN-409-IMMUTABLE_BROADCASTED_WITHDRAWAL',
    );
  });

  it('4. performs atomic LOCKED -> AVAILABLE unlock on REJECT & CANCEL and prevents double-unlock under adversarial concurrency', async () => {
    // Reject missing reason -> 422 W01-DOMAIN-422-REASON_REQUIRED
    const noReasonRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_reject_3/reject`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStatus: 'REQUESTED', rejectionReason: '   ' }),
    });
    assert.equal(noReasonRes.status, 422);

    // REJECT wth_reject_3 (51.00 USDT locked -> available 100 -> 151, locked 255 -> 204)
    const rejRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_reject_3/reject`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStatus: 'REQUESTED',
        rejectionReason: 'Dirección sancionada OFAC',
      }),
    });
    assert.equal(rejRes.status, 200);
    const rejBody = (await rejRes.json()) as {
      withdrawalRequest: WithdrawalRequest;
      userBalance: UserFinancialBalance;
      syncedUserBalanceUsdt: number;
      ledgerEntry: FinancialLedgerEntry;
      ledgerEntryId: string;
    };
    assert.equal(rejBody.withdrawalRequest.status, 'REJECTED');
    assert.equal(rejBody.userBalance.availableBalanceMicros, 151_000_000);
    assert.equal(rejBody.userBalance.lockedBalanceMicros, 204_000_000);
    assert.equal(rejBody.syncedUserBalanceUsdt, 151);
    assert.equal(rejBody.ledgerEntry.type, 'WITHDRAWAL_UNLOCK');
    assert.equal(rejBody.ledgerEntryId, deterministicUnlockLedgerId('wth_reject_3'));
    assert.equal(db.collections.get(USERS_COLLECTION)!.get('uid_user_01')!.balance, 151);

    // CANCEL APPROVED wth_cancel_4 (W01/W02 matrix) -> available 151 -> 202, locked 204 -> 153
    const canRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_cancel_4/cancel`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-full-ops-2', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStatus: 'APPROVED',
        cancellationReason: 'Usuario solicitó anular antes de proceso',
      }),
    });
    assert.equal(canRes.status, 200);
    assert.equal(db.collections.get(USERS_COLLECTION)!.get('uid_user_01')!.balance, 202);

    // Adversarial Concurrency: 2 admins simultaneously call REJECT vs REJECT on wth_race_5
    const [raceA, raceB] = await Promise.all([
      fetch(`${baseUrl}/api/admin/withdrawals/wth_race_5/reject`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedStatus: 'REQUESTED',
          rejectionReason: 'Admin 1 race reject',
        }),
      }),
      fetch(`${baseUrl}/api/admin/withdrawals/wth_race_5/reject`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok-full-ops-2', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedStatus: 'REQUESTED',
          rejectionReason: 'Admin 2 race reject',
        }),
      }),
    ]);

    const statuses = [raceA.status, raceB.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409]);

    const loserRes = raceA.status === 409 ? raceA : raceB;
    const loserJson = (await loserRes.json()) as { faultCode: string };
    assert.equal(loserJson.faultCode, 'W09-WORKFLOW-409-CONCURRENCY_STATUS_MISMATCH');

    // Available balance unlocked ONLY ONCE: 202 + 51 = 253 USDT
    const bal = db.collections.get(USER_BALANCES_COLLECTION)!.get('uid_user_01')!;
    assert.equal(bal.availableBalanceMicros, 253_000_000);
    assert.equal(bal.lockedBalanceMicros, 102_000_000);
    assert.equal(db.collections.get(USERS_COLLECTION)!.get('uid_user_01')!.balance, 253);

    // Barrier 2 check: even if request status were stale 'REQUESTED' while unlock ledger already exists -> 409 ALREADY_UNLOCKED
    const wthMap = db.collections.get(WITHDRAWAL_REQUESTS_COLLECTION)!;
    const originalRace = { ...wthMap.get('wth_race_5')! };
    wthMap.set('wth_race_5', { ...originalRace, status: 'REQUESTED' });
    const barrier2Res = await fetch(`${baseUrl}/api/admin/withdrawals/wth_race_5/reject`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-full-ops', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStatus: 'REQUESTED',
        rejectionReason: 'Intentar doble unlock contra barrera 2',
      }),
    });
    assert.equal(barrier2Res.status, 409);
    assert.equal(
      ((await barrier2Res.json()) as { faultCode: string }).faultCode,
      'W09-WORKFLOW-409-ALREADY_UNLOCKED',
    );
    wthMap.set('wth_race_5', originalRace);
  });

  it('5. verifies Controller executeWorkflowAction + Control Center toolbar & Modal SSR + W01..W08 immutable hashes', async () => {
    const controller = createAdminWithdrawalsController({
      session: fullOpsSession,
      apiOptions: { baseUrl, fetchImpl: fetch },
    });

    await controller.load();
    await controller.openDetail('wth_fastpath_2');

    // Approve was done earlier -> currently APPROVED, so controller executes PROCESS via API
    const res = await controller.executeWorkflowAction('wth_fastpath_2', {
      action: 'PROCESS',
      expectedStatus: 'APPROVED',
      providerTransactionId: 'ui_batch_09',
      reason: 'Procesado desde Control Center UI',
    });
    assert.equal(res.withdrawalRequest.status, 'PROCESSING');

    const snap = controller.getSnapshot();
    assert.equal(snap.selectedDetail?.withdrawal.status, 'PROCESSING');
    assert.equal(snap.selectedRbacActions?.canProcess, false);
    assert.equal(snap.selectedRbacActions?.canReject, true);

    // Control Center SSR markup includes W09 workflow toolbar buttons for PROCESSING (EDIT, REJECT, CANCEL)
    const centerHtml = renderToStaticMarkup(
      React.createElement(AdminWithdrawalsControlCenter, {
        session: fullOpsSession,
        initialSnapshot: snap,
        autoLoad: false,
        apiOptions: { baseUrl, fetchImpl: fetch },
      }),
    );
    assert.match(centerHtml, /data-testid="admin-workflow-toolbar"/);
    assert.match(centerHtml, /data-testid="admin-workflow-btn-reject"/);
    assert.match(centerHtml, /data-testid="admin-workflow-btn-cancel"/);
    assert.doesNotMatch(centerHtml, /data-testid="admin-workflow-btn-approve"/);

    // Workflow Modal SSR markup for REJECT shows atomic unlock warning
    const modalHtml = renderToStaticMarkup(
      React.createElement(AdminWithdrawalWorkflowModal, {
        withdrawal: snap.selectedDetail!.withdrawal,
        action: 'REJECT',
        onClose: () => {},
        onSubmit: () => {},
      }),
    );
    assert.match(modalHtml, /data-testid="admin-workflow-modal"/);
    assert.match(modalHtml, /data-testid="admin-workflow-unlock-notice"/);
    assert.match(modalHtml, /WITHDRAWAL_UNLOCK/);

    // Cumulative W01..W08 immutable artifact hash audit
    const sha256Of = (absPath: string) =>
      crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex').toUpperCase();

    const immutableHashes: Record<string, string> = {
      'src/types/withdrawal.ts':
        'B5362F9A09B8CBE9EE6DE71D7C3AAAD22EAE69054DB28E86C2E4B19792611B0E',
      'firestore.rules':
        'F4313C04DD7595E1C84D8977299169EEA38C2B250F96E6916D68959CDAAA6779',
      'firestore.indexes.json':
        '39990B1AA0F47F15652DCC6AA3BE6DC844C78EE4D1D9C9A86925F28CEBE33E9D',
      'server/services/withdrawalRequestLockService.ts':
        '6F647CA3EFC26BE897DAC8375E61FABFA95E88A211BFADBB8ABCB229962C4992',
      'server/services/withdrawalClientHistoryService.ts':
        '90B3DEB9DAC106D1E1348F92B6F421E1D333E18A663C60919332EAC0042B909D',
      'server/services/adminWithdrawalsService.ts':
        '14335C80E5037290842FBE60A55B1F581409A82EFDD5E780CBE877A8AD1529F2',
      'server/services/adminWithdrawalsRouter.ts':
        '3D64287CBFBD5DD80B2E7DC17AEBC06FAF77A38C27EFBF28D0D2E46024F0C83C',
      'src/services/admin/adminWithdrawalsClient.ts':
        'AEA5A63464186DE7076CB5DA054A5D987581AD555B1DC7F8CD2031E42D6882DE',
    };
    for (const [rel, expected] of Object.entries(immutableHashes)) {
      assert.equal(sha256Of(path.join(projectRoot, rel)), expected, `${rel} must remain unmodified`);
    }
  });
});
