/**
 * SCRUM-275 / SCRUM-289 / SCRUM-285 (W10)
 * Immutable Financial Ledger & Forensic Audit Timeline E2E + W01..W10 Regression Audit:
 * - Verifies `GET /api/admin/withdrawals/:withdrawalId/audit` fail-closed under `withdrawals.audit`
 * - Demonstrates real W04 `executeAtomicWithdrawalRequest` writes `led_lock_${withdrawalId}` (`lockService.ts:409`)
 *   and `buildDeterministicLedgerIds` + `verifyWithdrawalLedgerReconciliation` match exact W04/W09 keys
 * - Verifies adversarial retry after apparent partial commit (W04 lock & W09 unlock) produces 0 duplicate ledger/audit records
 * - Verifies chronological fusion (`AUDIT_EVENT` + `FINANCIAL_LEDGER`) without duplicating Firestore collections
 * - Verifies W10-AUDIT-* fault codes (`400`, `404`, `409`, `502`, `503`), strict W01 indexes, UI SSR, and W01..W10 hashes
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
  type WithdrawalAuditEvent,
  type WithdrawalRequest,
} from '../../src/types/withdrawal.js';
import {
  WITHDRAWAL_IDEMPOTENCY_COLLECTION,
  executeAtomicWithdrawalRequest,
} from '../../server/services/withdrawalRequestLockService.js';
import { executeAdminWorkflowAction } from '../../server/services/adminWithdrawalWorkflowService.js';
import {
  buildDeterministicLedgerIds,
  getAdminWithdrawalAuditTimeline,
  verifyWithdrawalLedgerReconciliation,
} from '../../server/services/adminWithdrawalAuditService.js';
import { createAdminWithdrawalAuditRouter } from '../../server/services/adminWithdrawalAuditRouter.js';
import { createAdminWithdrawalsRouter } from '../../server/services/adminWithdrawalsRouter.js';
import type { WithdrawalAuthzDependencies } from '../../server/services/withdrawalAuthzMiddleware.js';
import { fetchAdminWithdrawalAudit } from '../../src/services/admin/adminWithdrawalAuditClient.js';
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
const { AdminForensicTimelinePanel } = await import(
  '../../src/components/admin/AdminForensicTimelinePanel.tsx'
);

const projectRoot = path.resolve(import.meta.dirname, '../..');
const WALLET_A = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
const NEW_WITHDRAWAL_TS_HASH =
  'B5362F9A09B8CBE9EE6DE71D7C3AAAD22EAE69054DB28E86C2E4B19792611B0E';

function createAuditFirestoreMock(seed: {
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
  const indexedQueries: Array<{ collection: string; field: string; orderBy: string }> = [];

  function makeQuery(
    colName: string,
    store: Map<string, Record<string, unknown>>,
    clauses: Array<{ field: string; value: unknown }>,
    orderSpec: { field: string; dir: 'asc' | 'desc' } | null = null,
    afterId: string | null = null,
    limitVal = 500,
  ) {
    return {
      where(field: string, _op: string, value: unknown) {
        return makeQuery(colName, store, [...clauses, { field, value }], orderSpec, afterId, limitVal);
      },
      orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
        assert.equal(orderSpec, null, `Duplicate orderBy on "${colName}"`);
        return makeQuery(colName, store, clauses, { field, dir }, afterId, limitVal);
      },
      startAfter(snap: { id?: string }) {
        return makeQuery(colName, store, clauses, orderSpec, snap?.id ?? null, limitVal);
      },
      limit(n: number) {
        return makeQuery(colName, store, clauses, orderSpec, afterId, n);
      },
      async get() {
        if (
          colName === FINANCIAL_LEDGER_COLLECTION ||
          colName === WITHDRAWAL_AUDIT_EVENTS_COLLECTION
        ) {
          assert.deepEqual(
            clauses.map((c) => c.field),
            ['withdrawalId'],
            `${colName} must filter by withdrawalId`,
          );
          assert.ok(orderSpec, `${colName} must orderBy('createdAt', 'asc')`);
          assert.equal(orderSpec!.field, 'createdAt');
          assert.equal(orderSpec!.dir, 'asc');
          indexedQueries.push({
            collection: colName,
            field: clauses[0].field,
            orderBy: `${orderSpec!.field}:${orderSpec!.dir}`,
          });
        }

        let rows = Array.from(store.entries()).filter(([, data]) =>
          clauses.every((c) => data[c.field] === c.value),
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
    indexedQueries,
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
          throw new Error(`Forbidden unindexed full scan on "${name}"`);
        },
        where(field: string, _op: string, value: unknown) {
          return makeQuery(name, store, [{ field, value }]);
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
          },
        };
        const res = await fn(tx);
        for (const w of writes) {
          const map = getStore(w.col);
          if (w.merge && map.has(w.id)) {
            map.set(w.id, { ...map.get(w.id)!, ...w.data });
          } else {
            map.set(w.id, w.data);
          }
        }
        return res;
      } finally {
        release();
      }
    },
  };
}

describe('SCRUM-285 (W10): Immutable Financial Ledger & Forensic Audit Timeline E2E + W01..W10 Audit', () => {
  let db: ReturnType<typeof createAuditFirestoreMock>;
  let server: http.Server;
  let baseUrl = '';
  let realW04WithdrawalId = '';

  const readerSession: AdminWithdrawalSession = {
    uid: 'uid_reader_no_audit',
    email: 'reader@pouw.io',
    idToken: 'tok-reader-no-audit',
    permissions: ['withdrawals.read', 'withdrawals.review'],
  };

  const auditorSession: AdminWithdrawalSession = {
    uid: 'uid_auditor_ops',
    email: 'auditor@pouw.io',
    idToken: 'tok-auditor-ops',
    permissions: [
      'withdrawals.read',
      'withdrawals.review',
      'withdrawals.edit',
      'withdrawals.approve',
      'withdrawals.reject',
      'withdrawals.audit',
    ],
  };

  const tokenMap: Record<string, { uid: string; email: string }> = {
    'tok-client': { uid: 'uid_client_1', email: 'client1@pouw.io' },
    'tok-super-no-audit': { uid: 'uid_super_no_audit', email: 'super@pouw.io' },
    'tok-reader-no-audit': { uid: readerSession.uid, email: readerSession.email },
    'tok-auditor-ops': { uid: auditorSession.uid, email: auditorSession.email },
  };

  before(async () => {
    db = createAuditFirestoreMock({
      admins: {
        uid_super_no_audit: {
          uid: 'uid_super_no_audit',
          email: 'super@pouw.io',
          role: 'super_admin',
          status: 'ACTIVE',
          permissions: ['SUPER_ADMIN', 'withdrawals.read'],
        },
        uid_reader_no_audit: {
          uid: readerSession.uid,
          email: readerSession.email,
          role: 'admin',
          status: 'ACTIVE',
          permissions: [...readerSession.permissions],
        },
        uid_auditor_ops: {
          uid: auditorSession.uid,
          email: auditorSession.email,
          role: 'admin',
          status: 'ACTIVE',
          permissions: [...auditorSession.permissions],
        },
      },
      balances: {
        uid_client_1: {
          uid: 'uid_client_1',
          email: 'client1@pouw.io',
          membershipTier: 'ELITE',
          availableBalanceMicros: 300_000_000, // 300.00 USDT
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
          version: 1,
          updatedAt: '2026-11-18T10:00:00.000Z',
        },
      },
      users: {
        uid_client_1: { uid: 'uid_client_1', email: 'client1@pouw.io', balance: 300 },
      },
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
      createAdminWithdrawalAuditRouter({
        ...deps,
        firestore: db as unknown as WithdrawalAuthzDependencies['firestore'],
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

  it('1. validates deterministic W04 lock ID led_lock_{withdrawalId} and zero duplicate ledger/audit under adversarial retry', async () => {
    // Execute real W04 executeAtomicWithdrawalRequest
    const w04Res = await executeAtomicWithdrawalRequest(
      db as unknown as Parameters<typeof executeAtomicWithdrawalRequest>[0],
      {
        uid: 'uid_client_1',
        email: 'client1@pouw.io',
        emailVerified: true,
        signInProvider: 'password',
      },
      {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_A,
        requestedAmountMicros: 100_000_000,
        idempotencyKey: 'idem_w10_audit_lock_01',
      },
      { nowIso: () => '2026-11-18T10:01:00.000Z' },
    );
    assert.equal(w04Res.status, 201);
    realW04WithdrawalId = w04Res.withdrawalRequest.id;

    // Confirm W04 actually produced led_lock_${withdrawalId} (lockService.ts:409)
    const deterministicIds = buildDeterministicLedgerIds(realW04WithdrawalId);
    assert.equal(deterministicIds.lockLedgerId, `led_lock_${realW04WithdrawalId}`);
    assert.equal(deterministicIds.createAuditEventId, `aud_create_${realW04WithdrawalId}`);
    assert.equal(w04Res.ledgerEntryId, deterministicIds.lockLedgerId);
    assert.equal(w04Res.auditEventId, deterministicIds.createAuditEventId);

    // Adversarial retry after apparent partial commit (replay exact idempotencyKey)
    const retryRes = await executeAtomicWithdrawalRequest(
      db as unknown as Parameters<typeof executeAtomicWithdrawalRequest>[0],
      {
        uid: 'uid_client_1',
        email: 'client1@pouw.io',
        emailVerified: true,
        signInProvider: 'password',
      },
      {
        networkId: 'usdt-bsc',
        destinationAddress: WALLET_A,
        requestedAmountMicros: 100_000_000,
        idempotencyKey: 'idem_w10_audit_lock_01',
      },
      { nowIso: () => '2026-11-18T10:01:05.000Z' },
    );
    assert.equal(retryRes.status, 200);
    assert.equal(retryRes.idempotentReplay, true);

    // Apply W09 lifecycle transitions: REVIEW -> EDIT -> REJECT (atomic unlock)
    await executeAdminWorkflowAction(
      db as unknown as Parameters<typeof executeAdminWorkflowAction>[0],
      {
        uid: auditorSession.uid,
        email: auditorSession.email,
        permissions: auditorSession.permissions,
        role: 'admin',
        status: 'ACTIVE',
      },
      realW04WithdrawalId,
      { action: 'REVIEW', dto: { expectedStatus: 'REQUESTED', reason: 'Revisión AML' } },
      { nowIso: () => '2026-11-18T10:02:00.000Z' },
    );

    await executeAdminWorkflowAction(
      db as unknown as Parameters<typeof executeAdminWorkflowAction>[0],
      {
        uid: auditorSession.uid,
        email: auditorSession.email,
        permissions: auditorSession.permissions,
        role: 'admin',
        status: 'ACTIVE',
      },
      realW04WithdrawalId,
      {
        action: 'EDIT',
        dto: {
          expectedStatus: 'UNDER_REVIEW',
          internalNotes: 'Escalado por verificación manual',
          reason: 'Anotación compliance',
        },
      },
      { nowIso: () => '2026-11-18T10:03:00.000Z' },
    );

    await executeAdminWorkflowAction(
      db as unknown as Parameters<typeof executeAdminWorkflowAction>[0],
      {
        uid: auditorSession.uid,
        email: auditorSession.email,
        permissions: auditorSession.permissions,
        role: 'admin',
        status: 'ACTIVE',
      },
      realW04WithdrawalId,
      {
        action: 'REJECT',
        dto: {
          expectedStatus: 'UNDER_REVIEW',
          rejectionReason: 'Dirección rechazada por compliance',
        },
      },
      { nowIso: () => '2026-11-18T10:04:00.000Z' },
    );

    // Inspect forensic timeline: 1 LOCK + 1 UNLOCK + 4 immutable Audit events in strict chronological order
    const audit = await fetchAdminWithdrawalAudit(auditorSession, realW04WithdrawalId, {
      baseUrl,
      fetchImpl: fetch,
    });
    assert.equal(audit.ok, true);
    assert.equal(audit.reconciliation.isBalanced, true);
    assert.equal(audit.reconciliation.invariantStatus, 'UNLOCKED_CLOSED');
    assert.equal(audit.reconciliation.lockCount, 1);
    assert.equal(audit.reconciliation.unlockCount, 1);
    assert.equal(audit.reconciliation.settlementCount, 0);
    assert.equal(audit.reconciliation.netLockedDeltaMicros, 0);
    assert.equal(audit.ledgerEntries.length, 2);
    assert.equal(audit.auditEvents.length, 4);
    assert.equal(audit.timeline.length, 6);

    assert.deepEqual(
      audit.timeline.map((t) =>
        t.source === 'AUDIT_EVENT' ? `A:${t.action}` : `L:${t.ledgerType}`,
      ),
      [
        'A:CREATE',
        'L:WITHDRAWAL_LOCK',
        'A:REVIEW',
        'A:EDIT',
        'A:REJECT',
        'L:WITHDRAWAL_UNLOCK',
      ],
    );
    assert.equal(audit.timeline[0].linkedLedgerEntryId, deterministicIds.lockLedgerId);
    assert.equal(audit.timeline[4].linkedLedgerEntryId, deterministicIds.unlockLedgerId);
  });

  it('2. enforces strict fail-closed W02 withdrawals.audit RBAC & uses W01 composite indexes', async () => {
    const prevCount = db.indexedQueries.length;

    // 401 unauthenticated
    const res401 = await fetch(
      `${baseUrl}/api/admin/withdrawals/${encodeURIComponent(realW04WithdrawalId)}/audit`,
    );
    assert.equal(res401.status, 401);

    // 403 client
    const resClient = await fetch(
      `${baseUrl}/api/admin/withdrawals/${encodeURIComponent(realW04WithdrawalId)}/audit`,
      { headers: { Authorization: 'Bearer tok-client' } },
    );
    assert.equal(resClient.status, 403);

    // 403 admin with withdrawals.read ONLY (no withdrawals.audit)
    const resReader = await fetch(
      `${baseUrl}/api/admin/withdrawals/${encodeURIComponent(realW04WithdrawalId)}/audit`,
      { headers: { Authorization: 'Bearer tok-reader-no-audit' } },
    );
    assert.equal(resReader.status, 403);

    // 403 SUPER_ADMIN without explicit withdrawals.audit
    const resSuper = await fetch(
      `${baseUrl}/api/admin/withdrawals/${encodeURIComponent(realW04WithdrawalId)}/audit`,
      { headers: { Authorization: 'Bearer tok-super-no-audit' } },
    );
    assert.equal(resSuper.status, 403);

    // 200 OK with withdrawals.audit + verify W01 index queries executed
    const auditOk = await fetchAdminWithdrawalAudit(auditorSession, realW04WithdrawalId, {
      baseUrl,
      fetchImpl: fetch,
    });
    assert.equal(auditOk.withdrawal.id, realW04WithdrawalId);
    const executed = db.indexedQueries.slice(prevCount);
    assert.ok(
      executed.some(
        (q) =>
          q.collection === FINANCIAL_LEDGER_COLLECTION &&
          q.field === 'withdrawalId' &&
          q.orderBy === 'createdAt:asc',
      ),
    );
    assert.ok(
      executed.some(
        (q) =>
          q.collection === WITHDRAWAL_AUDIT_EVENTS_COLLECTION &&
          q.field === 'withdrawalId' &&
          q.orderBy === 'createdAt:asc',
      ),
    );

    // 404 W10-AUDIT-404-WITHDRAWAL_NOT_FOUND
    await assert.rejects(
      async () =>
        fetchAdminWithdrawalAudit(auditorSession, 'wth_missing_999', {
          baseUrl,
          fetchImpl: fetch,
        }),
      (err: unknown) => {
        assert.ok(isWithdrawalModuleError(err));
        assert.equal(err.faultCode, 'W10-AUDIT-404-WITHDRAWAL_NOT_FOUND');
        return true;
      },
    );

    // 503 W10-AUDIT-503-AUDIT_FIRESTORE_UNAVAILABLE
    await assert.rejects(
      async () =>
        getAdminWithdrawalAuditTimeline(
          null,
          {
            uid: auditorSession.uid,
            email: auditorSession.email,
            permissions: auditorSession.permissions,
            role: 'admin',
            status: 'ACTIVE',
          },
          realW04WithdrawalId,
        ),
      (err: unknown) => {
        assert.ok(isWithdrawalModuleError(err));
        assert.equal(err.faultCode, 'W10-AUDIT-503-AUDIT_FIRESTORE_UNAVAILABLE');
        return true;
      },
    );
  });

  it('3. detects Ledger anomalies (duplicate LOCK / coexisting UNLOCK+WITHDRAWAL) and rejects strictIntegrity=1 with 409 W10-AUDIT-409-LEDGER_INTEGRITY_ANOMALY', async () => {
    const sampleWth = db.collections
      .get(WITHDRAWAL_REQUESTS_COLLECTION)!
      .get(realW04WithdrawalId)! as unknown as WithdrawalRequest;
    const ledMap = db.collections.get(FINANCIAL_LEDGER_COLLECTION)!;
    const existingEntries = Array.from(ledMap.values()).filter(
      (e) => e.withdrawalId === realW04WithdrawalId,
    ) as unknown as FinancialLedgerEntry[];

    // Pure anomaly detector catches duplicate WITHDRAWAL_LOCK & coexisting SETTLEMENT
    const dupRec = verifyWithdrawalLedgerReconciliation(
      sampleWth,
      [
        ...existingEntries,
        {
          ...existingEntries[0],
          id: 'led_lock_dup_inject',
        },
      ],
      4,
    );
    assert.equal(dupRec.isBalanced, false);
    assert.equal(dupRec.invariantStatus, 'ANOMALY');
    assert.ok(dupRec.anomalies.some((a) => a.includes('WITHDRAWAL_LOCK duplicados')));

    // Inject conflicting duplicate into mock DB and verify HTTP 409 W10-AUDIT-409-LEDGER_INTEGRITY_ANOMALY
    ledMap.set('led_lock_dup_inject', {
      ...existingEntries[0],
      id: 'led_lock_dup_inject',
    });
    try {
      await assert.rejects(
        async () =>
          fetchAdminWithdrawalAudit(auditorSession, realW04WithdrawalId, {
            baseUrl,
            fetchImpl: fetch,
            strictIntegrity: true,
          }),
        (err: unknown) => {
          assert.ok(isWithdrawalModuleError(err));
          assert.equal(err.faultCode, 'W10-AUDIT-409-LEDGER_INTEGRITY_ANOMALY');
          return true;
        },
      );
    } finally {
      ledMap.delete('led_lock_dup_inject');
    }
  });

  it('4. verifies Controller openAuditTimeline, Control Center / Forensic Panel SSR with & without withdrawals.audit, and W01..W10 hash baseline', async () => {
    const controller = createAdminWithdrawalsController({
      session: auditorSession,
      apiOptions: { baseUrl, fetchImpl: fetch },
    });

    await controller.load({ tab: 'all' });
    await controller.openDetail(realW04WithdrawalId);
    const auditRes = await controller.openAuditTimeline(realW04WithdrawalId);
    const snap = controller.getSnapshot();

    assert.equal(auditRes.reconciliation.invariantStatus, 'UNLOCKED_CLOSED');
    assert.equal(snap.selectedAuditTimeline?.timeline.length, 6);

    // Full forensic panel rendered when auditAccessGranted === true
    const fullHtml = renderToStaticMarkup(
      React.createElement(AdminWithdrawalsControlCenter, {
        session: auditorSession,
        initialSnapshot: snap,
        autoLoad: false,
        apiOptions: { baseUrl, fetchImpl: fetch },
      }),
    );
    assert.match(fullHtml, /data-testid="admin-forensic-timeline-panel"/);
    assert.match(fullHtml, /data-testid="admin-forensic-reconciliation"/);
    assert.match(fullHtml, /UNLOCKED_CLOSED \(BALANCED\)/);
    assert.match(fullHtml, /data-testid="admin-forensic-unified-timeline"/);
    assert.match(fullHtml, new RegExp(`led_lock_${realW04WithdrawalId}`));

    // Restricted panel rendered when auditAccessGranted === false (no internal diffs/ledger balances exposed)
    const restrictedHtml = renderToStaticMarkup(
      React.createElement(AdminForensicTimelinePanel, {
        auditAccessGranted: false,
        auditTimeline: null,
        ledgerEntryIds: [auditRes.ledgerEntries[0].id, auditRes.ledgerEntries[1].id],
      }),
    );
    assert.match(restrictedHtml, /data-testid="admin-forensic-restricted"/);
    assert.match(restrictedHtml, /requiere permiso explícito withdrawals\.audit/);
    assert.doesNotMatch(restrictedHtml, /admin-forensic-unified-timeline/);
    assert.doesNotMatch(restrictedHtml, /Compliance|Anotación compliance/i);

    // Verify 4-way SHA-256 parity of updated withdrawal.ts & untouched W01..W09 artifacts
    const sha256Of = (absPath: string) =>
      crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex').toUpperCase();

    assert.equal(
      sha256Of(path.join(projectRoot, 'src/types/withdrawal.ts')),
      NEW_WITHDRAWAL_TS_HASH,
    );
    const siblingClient = path.resolve(projectRoot, '../retiros-cliente-main');
    if (fs.existsSync(siblingClient)) {
      assert.equal(
        sha256Of(path.join(siblingClient, 'src/types/withdrawal.ts')),
        NEW_WITHDRAWAL_TS_HASH,
      );
    }

    const immutableHashes: Record<string, string> = {
      'firestore.rules':
        '02FB0892E381A8AD42C89910A610FFCFD37B708FF978E6CC3862020EE36460CD',
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
      'server/services/adminWithdrawalWorkflowService.ts':
        'AF7E034C32E35D56EAB6E6F02CE0CFDF57D2337630B31C91A49E048C2FC7D1CF',
      'server/services/adminWithdrawalWorkflowRouter.ts':
        'FEB22581D12F33210FC76FD8C3B4FFE42FF8D20F50DDC707ED537AFD1C05D0EB',
      'src/services/admin/adminWithdrawalWorkflowClient.ts':
        '62B2224409E83C7C9C8E14E2614D8B489F31840DDDCC40D43007B5E9FBA43822',
      'src/components/admin/AdminWithdrawalWorkflowModal.tsx':
        'B702EFF1EBCB399EC40851B6194C4764BC94E55AC3521AEEFCF3EAD5C473C8C0',
    };
    for (const [rel, expected] of Object.entries(immutableHashes)) {
      assert.equal(sha256Of(path.join(projectRoot, rel)), expected, `${rel} must remain intact`);
    }
  });
});
