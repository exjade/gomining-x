/**
 * SCRUM-275 / SCRUM-289 / SCRUM-283 (W08)
 * Admin Withdrawals Control Center End-to-End Verification & W01..W08 Cumulative Integrity Suite:
 * - `GET /api/admin/withdrawals` (authoritative KPIs, Work Queue vs All History, filters, cursor pagination)
 * - `GET /api/admin/withdrawals/:withdrawalId` (`/userBalances/{uid}`, Ledger links, Audit timeline gated by `withdrawals.audit`)
 * - Enforces W01 `firestore.indexes.json` immutability (forbids `orderBy('requestedAt')` on single-field `txHash`/`destinationAddress`/`userEmail`)
 * - Enforces W02 fail-closed RBAC (401/403 without `withdrawals.read`, zero `SUPER_ADMIN` bypass, `withdrawals.audit` gating)
 * - Verifies `createAdminWithdrawalsController`, `classifyAdminWithdrawalError` (`load` | `authz` | `action_conflict` | `stale`), SSR UI reuse of W06 (`mode="admin"`), and immutable W01..W07 file hashes
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
  USER_BALANCES_COLLECTION,
  WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
  WITHDRAWAL_REQUESTS_COLLECTION,
  isWithdrawalModuleError,
  type FinancialLedgerEntry,
  type UserFinancialBalance,
  type WithdrawalAuditEvent,
  type WithdrawalRequest,
} from '../../src/types/withdrawal.js';
import { createAdminWithdrawalsRouter } from '../../server/services/adminWithdrawalsRouter.js';
import { encodeAdminWithdrawalsCursor } from '../../server/services/adminWithdrawalsService.js';
import type { WithdrawalAuthzDependencies } from '../../server/services/withdrawalAuthzMiddleware.js';
import {
  classifyAdminWithdrawalError,
  type AdminWithdrawalSession,
} from '../../src/services/admin/adminWithdrawalsClient.js';

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

const projectRoot = path.resolve(import.meta.dirname, '../..');
const TX_HASH_A = '0x' + 'aa11bb22'.repeat(8);
const TX_HASH_B = '0x' + 'cc33dd44'.repeat(8);
const WALLET_A = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
const WALLET_B = '0x999999cf1046e68e36E1aA2E0E07105eDDD1f08E';

function makeWithdrawal(
  id: string,
  overrides: Partial<WithdrawalRequest> = {},
): WithdrawalRequest {
  const requestedAt = overrides.requestedAt ?? '2026-11-18T08:00:00.000Z';
  const status = overrides.status ?? 'REQUESTED';
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
    status,
    membershipTierSnapshot: 'PRO',
    slaDisplaySnapshot: '1 a 5 horas (Prioridad Membresía PRO)',
    confirmations: status === 'COMPLETED' ? 15 : 0,
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
 * Strict Firestore Mock validating W01 `firestore.indexes.json` immutability:
 * - Forbids unindexed `collection.get()` scans
 * - Forbids double `orderBy(...)`
 * - Enforces Roro's rule: single-field searches (`txHash`, `destinationAddress`, `userEmail`)
 *   MUST NOT attach `orderBy('requestedAt')`
 * - Validates composite indexes on `(status, requestedAt DESC)`, `(network, requestedAt DESC)`,
 *   `(status, network, requestedAt DESC)`, `(membershipTierSnapshot, requestedAt DESC)`,
 *   `(userId, requestedAt DESC)`, and `(withdrawalId, createdAt ASC)`
 */
function createStrictAdminFirestoreMock(seed: {
  admins: Record<string, Record<string, unknown>>;
  withdrawals: WithdrawalRequest[];
  balances: Record<string, UserFinancialBalance>;
  ledger: FinancialLedgerEntry[];
  auditEvents: WithdrawalAuditEvent[];
}) {
  const queryLog: Array<{ collection: string; filters: string[]; orderBy: string[] }> = [];

  function resolveCollectionMap(name: string): Map<string, Record<string, unknown>> {
    const map = new Map<string, Record<string, unknown>>();
    if (name === 'admin_users') {
      for (const [k, v] of Object.entries(seed.admins)) map.set(k, { ...v });
      return map;
    }
    if (name === WITHDRAWAL_REQUESTS_COLLECTION) {
      for (const item of seed.withdrawals) map.set(item.id, { ...item });
      return map;
    }
    if (name === USER_BALANCES_COLLECTION) {
      for (const [k, v] of Object.entries(seed.balances)) map.set(k, { ...v });
      return map;
    }
    if (name === FINANCIAL_LEDGER_COLLECTION) {
      for (const item of seed.ledger) map.set(item.id, { ...item });
      return map;
    }
    if (name === WITHDRAWAL_AUDIT_EVENTS_COLLECTION) {
      for (const item of seed.auditEvents) map.set(item.id, { ...item });
      return map;
    }
    throw new Error(`Unexpected Firestore collection access: ${name}`);
  }

  function buildQuery(
    colName: string,
    store: Map<string, Record<string, unknown>>,
    clauses: Array<{ field: string; op: string; value: unknown }>,
    orderSpec: { field: string; dir: 'asc' | 'desc' } | null = null,
    afterDocId: string | null = null,
    limitCount = 500,
  ) {
    const assertIndexAllowed = () => {
      const fields = clauses.map((c) => c.field);
      if (colName === WITHDRAWAL_REQUESTS_COLLECTION && orderSpec) {
        for (const forbiddenSingleField of ['txHash', 'destinationAddress', 'userEmail']) {
          if (fields.includes(forbiddenSingleField)) {
            throw new Error(
              `W01 Index Violation: single-field query "${forbiddenSingleField}" must NOT chain orderBy("${orderSpec.field}"). Sort in memory instead.`,
            );
          }
        }
        if (fields.length > 0) {
          const allowedCombinations = [
            'status',
            'network',
            'status+network',
            'membershipTierSnapshot',
            'userId',
          ];
          const sig = fields.join('+');
          assert.ok(
            allowedCombinations.includes(sig),
            `Composite index "${sig} + ${orderSpec.field}" is not defined in W01 firestore.indexes.json`,
          );
        }
      } else if (
        (colName === FINANCIAL_LEDGER_COLLECTION ||
          colName === WITHDRAWAL_AUDIT_EVENTS_COLLECTION) &&
        orderSpec
      ) {
        assert.deepEqual(fields, ['withdrawalId']);
        assert.equal(orderSpec.field, 'createdAt');
        assert.equal(orderSpec.dir, 'asc');
      }
    };

    const queryObj = {
      where(field: string, op: string, value: unknown) {
        assert.equal(op, '==');
        return buildQuery(
          colName,
          store,
          [...clauses, { field, op, value }],
          orderSpec,
          afterDocId,
          limitCount,
        );
      },
      orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
        if (orderSpec !== null) {
          throw new Error(
            `W01 Index Violation: double orderBy("${field}") is forbidden.`,
          );
        }
        return buildQuery(
          colName,
          store,
          clauses,
          { field, dir },
          afterDocId,
          limitCount,
        );
      },
      startAfter(snapshot: { id?: string }) {
        return buildQuery(
          colName,
          store,
          clauses,
          orderSpec,
          snapshot?.id ?? null,
          limitCount,
        );
      },
      limit(n: number) {
        return buildQuery(colName, store, clauses, orderSpec, afterDocId, n);
      },
      async get() {
        assertIndexAllowed();
        queryLog.push({
          collection: colName,
          filters: clauses.map((c) => `${c.field}==${String(c.value)}`),
          orderBy: orderSpec ? [`${orderSpec.field}:${orderSpec.dir}`] : [],
        });

        let entries = Array.from(store.entries()).filter(([, data]) =>
          clauses.every((c) => data[c.field] === c.value),
        );

        if (orderSpec) {
          entries = entries.sort(([idA, a], [idB, b]) => {
            const valA = String(a[orderSpec.field] ?? '');
            const valB = String(b[orderSpec.field] ?? '');
            const cmp =
              orderSpec.dir === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
            if (cmp !== 0) return cmp;
            return orderSpec.dir === 'desc'
              ? idB.localeCompare(idA)
              : idA.localeCompare(idB);
          });
        }

        let startIdx = 0;
        if (afterDocId) {
          const idx = entries.findIndex(([id]) => id === afterDocId);
          startIdx = idx >= 0 ? idx + 1 : entries.length;
        }
        const sliced = entries.slice(startIdx, startIdx + limitCount);
        return {
          docs: sliced.map(([docId, data]) => ({
            id: docId,
            exists: true,
            data: () => ({ ...data }),
          })),
        };
      },
    };
    return queryObj;
  }

  return {
    queryLog,
    collection(name: string) {
      const store = resolveCollectionMap(name);
      return {
        doc(id: string) {
          return {
            async get() {
              const row = store.get(id);
              return {
                id,
                exists: Boolean(row),
                data: () => (row ? { ...row } : undefined),
              };
            },
            async set(data: Record<string, unknown>) {
              store.set(id, { ...data });
            },
          };
        },
        async get() {
          throw new Error(
            `Forbidden unindexed full-collection scan on "${name}". Use indexed queries.`,
          );
        },
        where(field: string, op: string, value: unknown) {
          assert.equal(op, '==');
          return buildQuery(name, store, [{ field, op, value }]);
        },
        orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
          return buildQuery(name, store, [], { field, dir });
        },
      };
    },
  };
}

describe('SCRUM-283 (W08): Admin Withdrawals Control Center E2E & Cumulative W01..W08 Audit', () => {
  const withdrawals: WithdrawalRequest[] = [
    makeWithdrawal('wth_05', {
      status: 'REQUESTED',
      network: 'SOL',
      networkId: 'usdt-sol',
      addressType: 'SOLANA',
      destinationAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      membershipTierSnapshot: 'ELITE',
      userId: 'uid_alice',
      userEmail: 'alice@pouw.io',
      totalDebitMicros: 101_000_000,
      netAmountMicros: 100_000_000,
      requestedAt: '2026-11-18T10:05:00.000Z',
    }),
    makeWithdrawal('wth_04', {
      status: 'UNDER_REVIEW',
      network: 'BSC',
      membershipTierSnapshot: 'VIP',
      userId: 'uid_bob',
      userEmail: 'bob@pouw.io',
      totalDebitMicros: 51_000_000,
      netAmountMicros: 50_000_000,
      requestedAt: '2026-11-18T10:04:00.000Z',
    }),
    makeWithdrawal('wth_03', {
      status: 'BROADCASTED',
      network: 'BSC',
      txHash: TX_HASH_A,
      destinationAddress: WALLET_B,
      membershipTierSnapshot: 'PRO',
      userId: 'uid_bob',
      userEmail: 'bob@pouw.io',
      totalDebitMicros: 31_000_000,
      netAmountMicros: 30_000_000,
      requestedAt: '2026-11-18T10:03:00.000Z',
      broadcastedAt: '2026-11-18T10:03:30.000Z',
    }),
    makeWithdrawal('wth_02', {
      status: 'COMPLETED',
      network: 'ETH',
      networkId: 'usdt-eth',
      txHash: TX_HASH_B,
      membershipTierSnapshot: 'ELITE',
      userId: 'uid_alice',
      userEmail: 'alice@pouw.io',
      totalDebitMicros: 205_000_000,
      netAmountMicros: 200_000_000,
      requestedAt: '2026-11-18T10:02:00.000Z',
      completedAt: '2026-11-18T10:02:50.000Z',
    }),
    makeWithdrawal('wth_01', {
      status: 'REJECTED',
      network: 'TRON',
      networkId: 'usdt-trc20',
      addressType: 'TRON',
      destinationAddress: 'TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL',
      membershipTierSnapshot: 'FREE',
      userId: 'uid_charlie',
      userEmail: 'charlie@pouw.io',
      totalDebitMicros: 15_000_000,
      netAmountMicros: 14_000_000,
      requestedAt: '2026-11-18T10:01:00.000Z',
      rejectedAt: '2026-11-18T10:01:30.000Z',
    }),
  ];

  const seedData = {
    admins: {
      uid_super_no_read: {
        uid: 'uid_super_no_read',
        email: 'legacy-super@pouw.io',
        role: 'super_admin',
        status: 'ACTIVE',
        permissions: ['SUPER_ADMIN'],
      },
      uid_admin_reader: {
        uid: 'uid_admin_reader',
        email: 'ops.reader@pouw.io',
        role: 'admin',
        status: 'ACTIVE',
        permissions: ['withdrawals.read', 'withdrawals.review'],
      },
      uid_admin_auditor: {
        uid: 'uid_admin_auditor',
        email: 'ops.auditor@pouw.io',
        role: 'admin',
        status: 'ACTIVE',
        permissions: [
          'withdrawals.read',
          'withdrawals.review',
          'withdrawals.approve',
          'withdrawals.audit',
        ],
      },
    },
    withdrawals,
    balances: {
      uid_alice: {
        userId: 'uid_alice',
        asset: 'USDT',
        availableBalanceMicros: 500_000_000,
        lockedBalanceMicros: 101_000_000,
        totalWithdrawnMicros: 200_000_000,
        membershipTier: 'ELITE',
        updatedAt: '2026-11-18T10:05:00.000Z',
      } as UserFinancialBalance,
    },
    ledger: [
      {
        id: 'led_wth_05_lock',
        userId: 'uid_alice',
        asset: 'USDT',
        entryType: 'WITHDRAWAL_LOCK',
        direction: 'DEBIT',
        amountMicros: 101_000_000,
        balanceAvailableBeforeMicros: 601_000_000,
        balanceAvailableAfterMicros: 500_000_000,
        balanceLockedBeforeMicros: 0,
        balanceLockedAfterMicros: 101_000_000,
        withdrawalId: 'wth_05',
        idempotencyKey: 'idem_wth_05_lock',
        createdAt: '2026-11-18T10:05:00.000Z',
      } as FinancialLedgerEntry,
    ],
    auditEvents: [
      {
        id: 'aud_wth_05_1',
        withdrawalId: 'wth_05',
        userId: 'uid_alice',
        action: 'CREATED',
        previousStatus: 'REQUESTED',
        newStatus: 'REQUESTED',
        operatorUid: 'uid_alice',
        operatorEmail: 'alice@pouw.io',
        operatorRole: 'client',
        reason: 'Solicitud iniciada desde cliente',
        createdAt: '2026-11-18T10:05:00.000Z',
      } as WithdrawalAuditEvent,
    ],
  };

  let strictFirestore = createStrictAdminFirestoreMock(seedData);
  let server: http.Server;
  let baseUrl = '';

  const tokenMap: Record<string, { uid: string; email: string }> = {
    'tok-client': { uid: 'uid_alice', email: 'alice@pouw.io' },
    'tok-super-no-read': { uid: 'uid_super_no_read', email: 'legacy-super@pouw.io' },
    'tok-admin-reader': { uid: 'uid_admin_reader', email: 'ops.reader@pouw.io' },
    'tok-admin-auditor': { uid: 'uid_admin_auditor', email: 'ops.auditor@pouw.io' },
  };

  const readerSession: AdminWithdrawalSession = {
    uid: 'uid_admin_reader',
    email: 'ops.reader@pouw.io',
    idToken: 'tok-admin-reader',
    permissions: ['withdrawals.read', 'withdrawals.review'],
  };

  const auditorSession: AdminWithdrawalSession = {
    uid: 'uid_admin_auditor',
    email: 'ops.auditor@pouw.io',
    idToken: 'tok-admin-auditor',
    permissions: [
      'withdrawals.read',
      'withdrawals.review',
      'withdrawals.approve',
      'withdrawals.audit',
    ],
  };

  before(async () => {
    strictFirestore = createStrictAdminFirestoreMock(seedData);
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
      firestore: strictFirestore,
    };

    const app = express();
    app.use(express.json());
    app.use(
      '/api/admin/withdrawals',
      createAdminWithdrawalsRouter({ ...deps, firestore: strictFirestore }),
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

  it('1. enforces fail-closed W02 RBAC (401/403, zero SUPER_ADMIN bypass) and keeps W09 mutations unmounted', async () => {
    // Unauthenticated
    const unauthRes = await fetch(`${baseUrl}/api/admin/withdrawals`);
    assert.equal(unauthRes.status, 401);

    // Client token denied on admin endpoint
    const clientRes = await fetch(`${baseUrl}/api/admin/withdrawals`, {
      headers: { Authorization: 'Bearer tok-client' },
    });
    assert.equal(clientRes.status, 403);

    // Legacy SUPER_ADMIN string without withdrawals.read denied (W02)
    const superRes = await fetch(`${baseUrl}/api/admin/withdrawals`, {
      headers: { Authorization: 'Bearer tok-super-no-read' },
    });
    assert.equal(superRes.status, 403);

    // W08 does not expose any mutation endpoints
    const mutateRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_05/approve`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-admin-auditor' },
    });
    assert.equal(mutateRes.status, 404);
  });

  it('2. computes authoritative KPIs, paginates Work Queue & All History by cursor, and validates filter mismatch/limit', async () => {
    // Queue tab (OPEN_WITHDRAWAL_STATUSES = wth_05 REQUESTED, wth_04 UNDER_REVIEW, wth_03 BROADCASTED) with limit=2
    const page1Res = await fetch(`${baseUrl}/api/admin/withdrawals?tab=queue&limit=2`, {
      headers: { Authorization: 'Bearer tok-admin-reader' },
    });
    assert.equal(page1Res.status, 200);
    const page1 = (await page1Res.json()) as {
      ok: boolean;
      tab: string;
      items: WithdrawalRequest[];
      hasMore: boolean;
      nextCursor: string | null;
      kpis: {
        pendingReviewCount: number;
        lockedAmountMicros: number;
        processingAndBroadcastedCount: number;
        completedCount: number;
        totalSettledAmountMicros: number;
        rejectedOrCancelledCount: number;
      };
    };

    assert.equal(page1.ok, true);
    assert.equal(page1.tab, 'queue');
    assert.deepEqual(
      page1.items.map((i) => i.id),
      ['wth_05', 'wth_04'],
    );
    assert.equal(page1.hasMore, true);
    assert.ok(page1.nextCursor);

    // Authoritative KPIs in micro-USDT across entire dataset
    assert.deepEqual(page1.kpis, {
      pendingReviewCount: 2, // REQUESTED + UNDER_REVIEW
      lockedAmountMicros: 183_000_000, // 101M + 51M + 31M
      processingAndBroadcastedCount: 1, // BROADCASTED
      completedCount: 1, // wth_02
      totalSettledAmountMicros: 200_000_000, // wth_02 netAmountMicros
      rejectedOrCancelledCount: 1, // wth_01
    });

    // Page 2 with same filter
    const page2Res = await fetch(
      `${baseUrl}/api/admin/withdrawals?tab=queue&limit=2&cursor=${encodeURIComponent(page1.nextCursor!)}`,
      { headers: { Authorization: 'Bearer tok-admin-reader' } },
    );
    assert.equal(page2Res.status, 200);
    const page2 = (await page2Res.json()) as { items: WithdrawalRequest[]; hasMore: boolean; nextCursor: string | null };
    assert.deepEqual(
      page2.items.map((i) => i.id),
      ['wth_03'],
    );
    assert.equal(page2.hasMore, false);
    assert.equal(page2.nextCursor, null);

    // Cursor filter mismatch -> 409 W08-ADMIN_UI-409-CURSOR_FILTER_MISMATCH
    const mismatchRes = await fetch(
      `${baseUrl}/api/admin/withdrawals?tab=all&limit=2&cursor=${encodeURIComponent(page1.nextCursor!)}`,
      { headers: { Authorization: 'Bearer tok-admin-reader' } },
    );
    assert.equal(mismatchRes.status, 409);
    const mismatchBody = (await mismatchRes.json()) as { faultCode: string };
    assert.equal(mismatchBody.faultCode, 'W08-ADMIN_UI-409-CURSOR_FILTER_MISMATCH');

    // Tampered cursor -> 400 W08-ADMIN_UI-400-INVALID_CURSOR
    const tamperedCursor = encodeAdminWithdrawalsCursor('deadbeef', '2026-11-18T10:04:00.000Z', 'wth_04').slice(0, -4) + 'xxxx';
    const badCursorRes = await fetch(
      `${baseUrl}/api/admin/withdrawals?tab=queue&cursor=${encodeURIComponent(tamperedCursor)}`,
      { headers: { Authorization: 'Bearer tok-admin-reader' } },
    );
    assert.equal(badCursorRes.status, 400);
    assert.equal(((await badCursorRes.json()) as { faultCode: string }).faultCode, 'W08-ADMIN_UI-400-INVALID_CURSOR');

    // Invalid limit (>50) -> 400 W08-ADMIN_UI-400-INVALID_PAGINATION_LIMIT
    const badLimitRes = await fetch(`${baseUrl}/api/admin/withdrawals?tab=all&limit=200`, {
      headers: { Authorization: 'Bearer tok-admin-reader' },
    });
    assert.equal(badLimitRes.status, 400);
    assert.equal(((await badLimitRes.json()) as { faultCode: string }).faultCode, 'W08-ADMIN_UI-400-INVALID_PAGINATION_LIMIT');
  });

  it('3. enforces W01 composite indexes and Roro rule (no orderBy on txHash/wallet/email searches)', async () => {
    const prevLogLen = strictFirestore.queryLog.length;

    // Combined status+network filter uses `(status, network, requestedAt DESC)`
    const filteredRes = await fetch(
      `${baseUrl}/api/admin/withdrawals?tab=all&status=BROADCASTED&network=BSC`,
      { headers: { Authorization: 'Bearer tok-admin-reader' } },
    );
    assert.equal(filteredRes.status, 200);
    const filtered = (await filteredRes.json()) as { items: WithdrawalRequest[] };
    assert.deepEqual(filtered.items.map((i) => i.id), ['wth_03']);

    // Search by exact withdrawalId -> .doc(id).get()
    const idRes = await fetch(`${baseUrl}/api/admin/withdrawals?tab=all&searchQuery=wth_05`, {
      headers: { Authorization: 'Bearer tok-admin-reader' },
    });
    assert.equal(idRes.status, 200);
    assert.deepEqual(
      ((await idRes.json()) as { items: WithdrawalRequest[] }).items.map((i) => i.id),
      ['wth_05'],
    );

    // Search by txHash -> single-field equality WITHOUT orderBy('requestedAt')
    const txRes = await fetch(
      `${baseUrl}/api/admin/withdrawals?tab=all&searchQuery=${encodeURIComponent(TX_HASH_A)}`,
      { headers: { Authorization: 'Bearer tok-admin-reader' } },
    );
    assert.equal(txRes.status, 200);
    assert.deepEqual(
      ((await txRes.json()) as { items: WithdrawalRequest[] }).items.map((i) => i.id),
      ['wth_03'],
    );

    // Search by destinationAddress -> single-field equality WITHOUT orderBy('requestedAt')
    const walletRes = await fetch(
      `${baseUrl}/api/admin/withdrawals?tab=all&searchQuery=${encodeURIComponent(WALLET_B)}`,
      { headers: { Authorization: 'Bearer tok-admin-reader' } },
    );
    assert.equal(walletRes.status, 200);
    assert.deepEqual(
      ((await walletRes.json()) as { items: WithdrawalRequest[] }).items.map((i) => i.id),
      ['wth_03'],
    );

    // Search by userEmail -> single-field equality WITHOUT orderBy('requestedAt') (sorted in memory DESC)
    const emailRes = await fetch(
      `${baseUrl}/api/admin/withdrawals?tab=all&searchQuery=${encodeURIComponent('bob@pouw.io')}`,
      { headers: { Authorization: 'Bearer tok-admin-reader' } },
    );
    assert.equal(emailRes.status, 200);
    assert.deepEqual(
      ((await emailRes.json()) as { items: WithdrawalRequest[] }).items.map((i) => i.id),
      ['wth_04', 'wth_03'],
    );

    // Search by UID -> `(userId ASC, requestedAt DESC)`
    const uidRes = await fetch(
      `${baseUrl}/api/admin/withdrawals?tab=all&searchQuery=uid_alice`,
      { headers: { Authorization: 'Bearer tok-admin-reader' } },
    );
    assert.equal(uidRes.status, 200);
    assert.deepEqual(
      ((await uidRes.json()) as { items: WithdrawalRequest[] }).items.map((i) => i.id),
      ['wth_05', 'wth_02'],
    );

    // Assert zero unindexed orderBy on txHash / destinationAddress / userEmail in queryLog
    const recentQueries = strictFirestore.queryLog.slice(prevLogLen);
    for (const q of recentQueries) {
      if (
        q.filters.some(
          (f) =>
            f.startsWith('txHash==') ||
            f.startsWith('destinationAddress==') ||
            f.startsWith('userEmail=='),
        )
      ) {
        assert.deepEqual(q.orderBy, [], `Query ${JSON.stringify(q)} must NOT specify orderBy`);
      }
    }
  });

  it('4. gates forensic auditEvents/ledgerEntries with withdrawals.audit while returning userBalance & ledgerEntryIds', async () => {
    // Reader without `withdrawals.audit`: receives userBalance + ledgerEntryIds, but auditEvents/ledgerEntries are hidden
    const readerDetailRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_05`, {
      headers: { Authorization: 'Bearer tok-admin-reader' },
    });
    assert.equal(readerDetailRes.status, 200);
    const readerDetail = (await readerDetailRes.json()) as {
      ok: boolean;
      withdrawal: WithdrawalRequest;
      userBalance: UserFinancialBalance | null;
      ledgerEntries: FinancialLedgerEntry[];
      ledgerEntryIds: string[];
      auditEvents: WithdrawalAuditEvent[];
      auditAccessGranted: boolean;
    };
    assert.equal(readerDetail.auditAccessGranted, false);
    assert.equal(readerDetail.userBalance?.lockedBalanceMicros, 101_000_000);
    assert.deepEqual(readerDetail.ledgerEntryIds, ['led_wth_05_lock']);
    assert.deepEqual(readerDetail.ledgerEntries, []);
    assert.deepEqual(readerDetail.auditEvents, []);

    // Auditor with `withdrawals.audit`: receives full timeline & ledger entries
    const auditorDetailRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_05`, {
      headers: { Authorization: 'Bearer tok-admin-auditor' },
    });
    assert.equal(auditorDetailRes.status, 200);
    const auditorDetail = (await auditorDetailRes.json()) as typeof readerDetail;
    assert.equal(auditorDetail.auditAccessGranted, true);
    assert.equal(auditorDetail.ledgerEntries.length, 1);
    assert.equal(auditorDetail.auditEvents.length, 1);
    assert.equal(auditorDetail.auditEvents[0].id, 'aud_wth_05_1');

    // Missing withdrawal -> 404 W08-ADMIN_UI-404-WITHDRAWAL_NOT_FOUND
    const notFoundRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth_does_not_exist`, {
      headers: { Authorization: 'Bearer tok-admin-auditor' },
    });
    assert.equal(notFoundRes.status, 404);
    assert.equal(
      ((await notFoundRes.json()) as { faultCode: string }).faultCode,
      'W08-ADMIN_UI-404-WITHDRAWAL_NOT_FOUND',
    );
  });

  it('5. verifies AdminWithdrawalsControlCenter controller, error classification, W06 reuse & SSR markup', async () => {
    const controller = createAdminWithdrawalsController({
      session: auditorSession,
      apiOptions: { baseUrl, fetchImpl: fetch },
      pageSize: 2,
    });

    await controller.load();
    let snap = controller.getSnapshot();
    assert.equal(snap.items.length, 2);
    assert.equal(snap.hasMore, true);
    assert.equal(snap.kpis.lockedAmountMicros, 183_000_000);

    await controller.loadMore();
    snap = controller.getSnapshot();
    assert.deepEqual(
      snap.items.map((i: WithdrawalRequest) => i.id),
      ['wth_05', 'wth_04', 'wth_03'],
    );
    assert.equal(snap.hasMore, false);

    // Detail + W02 RBAC capability preview (REQUESTED with read+review+approve => REVIEW & APPROVE allowed, REJECT/BROADCAST false)
    const detail = await controller.openDetail('wth_05');
    snap = controller.getSnapshot();
    assert.equal(detail.withdrawal.id, 'wth_05');
    assert.ok(snap.selectedRbacActions?.allowedWorkflowActions.includes('APPROVE'));
    assert.ok(!snap.selectedRbacActions?.allowedWorkflowActions.includes('REJECT'));

    // Error classification checks: authz vs action_conflict vs stale vs load
    const authErr = await fetch(`${baseUrl}/api/admin/withdrawals`, {
      headers: { Authorization: 'Bearer tok-super-no-read' },
    });
    assert.equal(authErr.status, 403);
    const classifiedAuthz = classifyAdminWithdrawalError({
      name: 'WithdrawalModuleError',
      originTask: 'W02',
      originModule: 'AUTHZ',
      code: 'FORBIDDEN_WITHDRAWAL_PERMISSION',
      faultCode: 'W02-AUTHZ-403-FORBIDDEN_WITHDRAWAL_PERMISSION',
      httpStatus: 403,
      message: 'Forbidden',
    });
    assert.equal(classifiedAuthz.category, 'authz');

    const classifiedConflict = classifyAdminWithdrawalError(
      {
        name: 'WithdrawalModuleError',
        originTask: 'W08',
        originModule: 'ADMIN_UI',
        code: 'CURSOR_FILTER_MISMATCH',
        faultCode: 'W08-ADMIN_UI-409-CURSOR_FILTER_MISMATCH',
        httpStatus: 409,
        message: 'Conflict',
      },
      true,
    );
    assert.equal(classifiedConflict.category, 'action_conflict');

    const classifiedStale = classifyAdminWithdrawalError(new Error('Network down'), true);
    assert.equal(classifiedStale.category, 'stale');

    const classifiedLoad = classifyAdminWithdrawalError(new Error('Network down'), false);
    assert.equal(classifiedLoad.category, 'load');

    // SSR markup renders KPIs, W06 table/modal in admin mode, /userBalances, Ledger, Audit timeline
    const html = renderToStaticMarkup(
      React.createElement(AdminWithdrawalsControlCenter, {
        session: readerSession,
        initialSnapshot: snap,
        autoLoad: false,
        apiOptions: { baseUrl, fetchImpl: fetch },
      }),
    );
    assert.match(html, /data-testid="admin-withdrawals-control-center"/);
    assert.match(html, /data-testid="admin-withdrawals-kpis"/);
    assert.match(html, /183\.00 USDT/);
    assert.match(html, /data-testid="withdrawal-table"/);
    assert.match(html, /data-testid="admin-detail-user-balance"/);
    assert.match(html, /data-testid="admin-detail-ledger-links"/);
    assert.match(html, /data-testid="admin-detail-audit-timeline"/);
    assert.match(html, /led_wth_05_lock/);
    assert.match(html, /CREATED \(REQUESTED\)/);
  });

  it('6. verifies zero regression on W01..W07 immutable files and Client/Admin byte parity', () => {
    const sha256Of = (absPath: string) =>
      crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex').toUpperCase();

    const expectedAdminHashes: Record<string, string> = {
      'src/types/withdrawal.ts':
        'B5362F9A09B8CBE9EE6DE71D7C3AAAD22EAE69054DB28E86C2E4B19792611B0E',
      'firestore.rules':
        '02FB0892E381A8AD42C89910A610FFCFD37B708FF978E6CC3862020EE36460CD',
      'firestore.indexes.json':
        '39990B1AA0F47F15652DCC6AA3BE6DC844C78EE4D1D9C9A86925F28CEBE33E9D',
      'server/services/withdrawalRequestLockService.ts':
        '6F647CA3EFC26BE897DAC8375E61FABFA95E88A211BFADBB8ABCB229962C4992',
      'server/services/withdrawalClientHistoryService.ts':
        '90B3DEB9DAC106D1E1348F92B6F421E1D333E18A663C60919332EAC0042B909D',
      'server/services/withdrawalConfigQuoteRouter.ts':
        '234B154B6BB511AC46A564975DF5B502FFF700EEF73C6B54F2047440777AC38E',
      'src/components/withdrawals/WithdrawalStatusBadge.tsx':
        '724D0680491082F74A4C8D73F7F8137249F70969219F44202983FB212FA20DD1',
      'src/components/withdrawals/WithdrawalAddress.tsx':
        '88B7F0288D674C7B90AFDBDFF53E8E2F5B34E3EAE79835016B82FF3C93E7C4D0',
      'src/components/withdrawals/WithdrawalTxHash.tsx':
        'DC18AE3C167A3E89A0FDCD9A488FC7EED64E5EBD6E03E740EB0AF57D53173657',
      'src/components/withdrawals/WithdrawalDetailsModal.tsx':
        '8026BB8E50582335B27BCB92882A40DF2398AA3FE299060C8D79AAFFDE99F5E3',
      'src/components/withdrawals/WithdrawalHistory.tsx':
        '53894AF4FC9943EBFBB057EEF84D283EF1BF0CF30E8C20BBB7614E20D6F23B4C',
      'src/components/withdrawals/withdrawalShared.css':
        '9DAF090E287C208A03B75C654E306E6977C9D0D4EBF48C9DFF25933B9212F153',
    };

    for (const [rel, expectedHash] of Object.entries(expectedAdminHashes)) {
      assert.equal(
        sha256Of(path.join(projectRoot, rel)),
        expectedHash,
        `Immutable artifact ${rel} must remain unmodified during W08`,
      );
    }

    assert.equal(isWithdrawalModuleError({}), false);
  });
});
