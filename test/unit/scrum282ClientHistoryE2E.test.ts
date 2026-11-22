/**
 * SCRUM-275 / SCRUM-289 / SCRUM-282 (W07)
 * Backend Express Router & Firestore Index Verification E2E Suite:
 * - `GET /api/withdrawals/me` (cursor-based pagination, `where('userId', '==', uid).orderBy('requestedAt', 'desc')`)
 * - `GET /api/withdrawals/me/:withdrawalId` (strict UID ownership via W02)
 * - Enforces single composite index (`userId ASC, requestedAt DESC`) + `startAfter(docSnapshot)` tie-breaker
 * - Adversarial cross-UID cursor & ID manipulation, limit validation, DTO sanitization, and W01..W07 regression
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
  WITHDRAWAL_REQUESTS_COLLECTION,
  type WithdrawalRequest,
} from '../../src/types/withdrawal.js';
import { createWithdrawalConfigQuoteRouter } from '../../server/services/withdrawalConfigQuoteRouter.js';
import { encodeClientHistoryCursor } from '../../server/services/withdrawalClientHistoryService.js';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const VALID_EVM_TX_HASH = '0x' + 'abcd1234'.repeat(8);

function makeStoredWithdrawal(
  id: string,
  userId: string,
  requestedAt: string,
  status: WithdrawalRequest['status'] = 'REQUESTED',
): WithdrawalRequest {
  return {
    id,
    userId,
    userEmail: `${userId}@private.pouw.io`,
    asset: 'USDT',
    networkId: 'usdt-bsc',
    network: 'BSC',
    networkDisplayName: 'BNB Smart Chain (BEP-20)',
    addressType: 'EVM',
    destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    requestedAmountMicros: 25_000_000,
    networkFeeMicros: 500_000,
    platformFeeMicros: 250_000,
    conversionFeeMicros: 0,
    totalDebitMicros: 25_750_000,
    netAmountMicros: 25_000_000,
    status,
    membershipTierSnapshot: 'PRO',
    slaDisplaySnapshot: '1 a 5 horas (Prioridad Membresía PRO)',
    confirmations: status === 'COMPLETED' ? 15 : 0,
    requiredConfirmations: 15,
    idempotencyKey: `idem_secret_${id}`,
    configVersion: 1,
    internalNotes: `CONFIDENTIAL_NOTE_${id}`,
    reviewedBy: `admin_rev_${id}`,
    approvedBy: `admin_apr_${id}`,
    providerTransactionId: `prov_secret_${id}`,
    requestedAt,
    createdAt: requestedAt,
    updatedAt: requestedAt,
    ...(status === 'BROADCASTED' || status === 'COMPLETED'
      ? { txHash: VALID_EVM_TX_HASH, broadcastedAt: requestedAt }
      : {}),
  };
}

/**
 * In-memory Firestore mock that strictly mirrors Firestore composite-index semantics:
 * - Allows ONLY `where('userId', '==', uid)` + single `orderBy('requestedAt', 'desc')`
 * - Rejects a second `orderBy(...)` call to prove we stay within W01's existing composite index
 * - Uses document snapshot implicit tie-breaker with `startAfter(docSnapshot)`
 */
function createIndexedFirestoreMock(initialRequests: WithdrawalRequest[]) {
  const store = new Map<string, Record<string, unknown>>();
  for (const item of initialRequests) {
    store.set(item.id, { ...item });
  }

  return {
    store,
    collection(name: string) {
      assert.equal(name, WITHDRAWAL_REQUESTS_COLLECTION);
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
          throw new Error('W07 must use indexed where().orderBy().limit() query, never full collection.get()');
        },
        where(field: string, op: string, value: unknown) {
          assert.equal(field, 'userId');
          assert.equal(op, '==');
          let orderField: string | null = null;
          let orderDir: 'asc' | 'desc' = 'desc';
          let afterDocId: string | null = null;
          let queryLimit = 1000;

          const queryObj = {
            orderBy(nextField: string, dir: 'asc' | 'desc' = 'asc') {
              if (orderField !== null) {
                throw new Error(
                  `Composite index violation: second orderBy("${nextField}") is forbidden by W01 index.`,
                );
              }
              assert.equal(nextField, 'requestedAt');
              assert.equal(dir, 'desc');
              orderField = nextField;
              orderDir = dir;
              return queryObj;
            },
            startAfter(snapshot: { id?: string }) {
              afterDocId = snapshot?.id ?? null;
              return queryObj;
            },
            limit(n: number) {
              queryLimit = n;
              return queryObj;
            },
            async get() {
              const matching = Array.from(store.entries())
                .filter(([, data]) => data.userId === value)
                .sort(([idA, dataA], [idB, dataB]) => {
                  const cmp =
                    orderDir === 'desc'
                      ? String(dataB[orderField ?? 'requestedAt']).localeCompare(
                          String(dataA[orderField ?? 'requestedAt']),
                        )
                      : String(dataA[orderField ?? 'requestedAt']).localeCompare(
                          String(dataB[orderField ?? 'requestedAt']),
                        );
                  if (cmp !== 0) return cmp;
                  // Implicit Firestore document ID tie-breaker
                  return idB.localeCompare(idA);
                });

              let startIdx = 0;
              if (afterDocId) {
                const idx = matching.findIndex(([docId]) => docId === afterDocId);
                startIdx = idx >= 0 ? idx + 1 : matching.length;
              }

              const sliced = matching.slice(startIdx, startIdx + queryLimit);
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
        },
      };
    },
  };
}

function createTestServer(initialRequests: WithdrawalRequest[]) {
  const firestore = createIndexedFirestoreMock(initialRequests);
  const app = express();
  app.use(express.json());
  app.use(
    '/api/withdrawals',
    createWithdrawalConfigQuoteRouter({
      authAdapter: {
        isInitialized: () => true,
        getApp: () => ({}) as any,
        async verifyIdToken(token: string) {
          if (token === 'token_alice') {
            return {
              uid: 'uid_alice',
              email: 'alice@pouw.io',
              email_verified: true,
              firebase: { sign_in_provider: 'password' },
            };
          }
          if (token === 'token_bob') {
            return {
              uid: 'uid_bob',
              email: 'bob@pouw.io',
              email_verified: true,
              firebase: { sign_in_provider: 'password' },
            };
          }
          if (token === 'token_anon') {
            return {
              uid: 'uid_anon',
              firebase: { sign_in_provider: 'anonymous' },
            };
          }
          return null;
        },
      },
      firestore: firestore as any,
    }),
  );
  const server = http.createServer(app);
  return { server, firestore };
}

describe('SCRUM-282 (W07): Client History GET /api/withdrawals/me & Detail E2E', () => {
  it('1. paginates own withdrawals by cursor in requestedAt DESC order (including same-timestamp tie-breaking) and strips admin fields', async () => {
    const dataset: WithdrawalRequest[] = [
      // Two items with IDENTICAL timestamp to prove stable snapshot startAfter tie-breaking
      makeStoredWithdrawal('wth_01', 'uid_alice', '2026-11-18T08:00:00.000Z', 'REQUESTED'),
      makeStoredWithdrawal('wth_02', 'uid_alice', '2026-11-18T08:00:00.000Z', 'UNDER_REVIEW'),
      makeStoredWithdrawal('wth_03', 'uid_alice', '2026-11-18T07:00:00.000Z', 'BROADCASTED'),
      makeStoredWithdrawal('wth_04', 'uid_alice', '2026-11-18T06:00:00.000Z', 'COMPLETED'),
      makeStoredWithdrawal('wth_05', 'uid_alice', '2026-11-18T05:00:00.000Z', 'REJECTED'),
      // Bob's withdrawal must NEVER leak into Alice's history
      makeStoredWithdrawal('wth_bob_01', 'uid_bob', '2026-11-18T09:00:00.000Z', 'COMPLETED'),
    ];

    const { server } = createTestServer(dataset);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Page 1 (limit=2)
      const res1 = await fetch(`${baseUrl}/api/withdrawals/me?limit=2`, {
        headers: { Authorization: 'Bearer token_alice' },
      });
      assert.equal(res1.status, 200);
      const page1 = (await res1.json()) as any;
      assert.equal(page1.ok, true);
      assert.equal(page1.items.length, 2);
      assert.equal(page1.hasMore, true);
      assert.ok(typeof page1.nextCursor === 'string' && page1.nextCursor.length > 10);
      assert.deepEqual(
        page1.items.map((i: any) => i.id),
        ['wth_02', 'wth_01'],
      );

      // Strict sanitization check on every returned item
      for (const item of page1.items) {
        assert.equal(item.userId, 'uid_alice');
        assert.equal('internalNotes' in item, false);
        assert.equal('reviewedBy' in item, false);
        assert.equal('approvedBy' in item, false);
        assert.equal('providerTransactionId' in item, false);
        assert.equal('idempotencyKey' in item, false);
        assert.equal('userEmail' in item, false);
      }

      // Page 2 (using nextCursor from page 1)
      const res2 = await fetch(
        `${baseUrl}/api/withdrawals/me?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
        { headers: { Authorization: 'Bearer token_alice' } },
      );
      assert.equal(res2.status, 200);
      const page2 = (await res2.json()) as any;
      assert.equal(page2.items.length, 2);
      assert.equal(page2.hasMore, true);
      assert.deepEqual(
        page2.items.map((i: any) => i.id),
        ['wth_03', 'wth_04'],
      );

      // Page 3 (final page)
      const res3 = await fetch(
        `${baseUrl}/api/withdrawals/me?limit=2&cursor=${encodeURIComponent(page2.nextCursor)}`,
        { headers: { Authorization: 'Bearer token_alice' } },
      );
      assert.equal(res3.status, 200);
      const page3 = (await res3.json()) as any;
      assert.equal(page3.items.length, 1);
      assert.equal(page3.hasMore, false);
      assert.equal(page3.nextCursor, null);
      assert.deepEqual(
        page3.items.map((i: any) => i.id),
        ['wth_05'],
      );

      // Own detail endpoint returns sanitized DTO
      const detailRes = await fetch(`${baseUrl}/api/withdrawals/me/wth_03`, {
        headers: { Authorization: 'Bearer token_alice' },
      });
      assert.equal(detailRes.status, 200);
      const detailJson = (await detailRes.json()) as any;
      assert.equal(detailJson.ok, true);
      assert.equal(detailJson.withdrawal.id, 'wth_03');
      assert.equal(detailJson.withdrawal.txHash, VALID_EVM_TX_HASH);
      assert.equal('internalNotes' in detailJson.withdrawal, false);
      assert.equal('idempotencyKey' in detailJson.withdrawal, false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('2. rejects cross-UID detail access (403 W02-AUTHZ-*), cross-UID cursor tamper (403), invalid cursors/limits (400), and anonymous/unauthenticated requests', async () => {
    const dataset: WithdrawalRequest[] = [
      makeStoredWithdrawal('wth_alice_1', 'uid_alice', '2026-11-18T08:00:00.000Z', 'REQUESTED'),
      makeStoredWithdrawal('wth_bob_secret', 'uid_bob', '2026-11-18T09:00:00.000Z', 'COMPLETED'),
    ];

    const { server } = createTestServer(dataset);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Unauthenticated -> 401 W02-AUTHZ-401-UNAUTHENTICATED
      const noAuth = await fetch(`${baseUrl}/api/withdrawals/me`);
      assert.equal(noAuth.status, 401);
      assert.equal(((await noAuth.json()) as any).faultCode, 'W02-AUTHZ-401-UNAUTHENTICATED');

      // 2. Anonymous -> 403 W02-AUTHZ-403-ANONYMOUS_AUTH_FORBIDDEN
      const anonRes = await fetch(`${baseUrl}/api/withdrawals/me`, {
        headers: { Authorization: 'Bearer token_anon' },
      });
      assert.equal(anonRes.status, 403);
      assert.equal(((await anonRes.json()) as any).faultCode, 'W02-AUTHZ-403-ANONYMOUS_AUTH_FORBIDDEN');

      // 3. Cross-UID detail manipulation -> 403 W02-AUTHZ-403-FORBIDDEN_CROSS_UID_ACCESS
      const crossDetail = await fetch(`${baseUrl}/api/withdrawals/me/wth_bob_secret`, {
        headers: { Authorization: 'Bearer token_alice' },
      });
      assert.equal(crossDetail.status, 403);
      assert.equal(
        ((await crossDetail.json()) as any).faultCode,
        'W02-AUTHZ-403-FORBIDDEN_CROSS_UID_ACCESS',
      );

      // 4. Cross-UID cursor manipulation (Bob's cursor used by Alice) -> 403 W07-HISTORY_UI-403-FORBIDDEN_CROSS_UID_CURSOR
      const bobCursor = encodeClientHistoryCursor(
        'uid_bob',
        '2026-11-18T09:00:00.000Z',
        'wth_bob_secret',
      );
      const crossCursorRes = await fetch(
        `${baseUrl}/api/withdrawals/me?cursor=${encodeURIComponent(bobCursor)}`,
        { headers: { Authorization: 'Bearer token_alice' } },
      );
      assert.equal(crossCursorRes.status, 403);
      assert.equal(
        ((await crossCursorRes.json()) as any).faultCode,
        'W07-HISTORY_UI-403-FORBIDDEN_CROSS_UID_CURSOR',
      );

      // 5. Forged cursor with Alice's UID pointing to Bob's doc ID -> still blocked 403
      const forgedCursor = encodeClientHistoryCursor(
        'uid_alice',
        '2026-11-18T09:00:00.000Z',
        'wth_bob_secret',
      );
      const forgedRes = await fetch(
        `${baseUrl}/api/withdrawals/me?cursor=${encodeURIComponent(forgedCursor)}`,
        { headers: { Authorization: 'Bearer token_alice' } },
      );
      assert.equal(forgedRes.status, 403);
      assert.equal(
        ((await forgedRes.json()) as any).faultCode,
        'W07-HISTORY_UI-403-FORBIDDEN_CROSS_UID_CURSOR',
      );

      // 6. Malformed cursor -> 400 W07-HISTORY_UI-400-INVALID_CURSOR
      const badCursorRes = await fetch(`${baseUrl}/api/withdrawals/me?cursor=not_valid_json`, {
        headers: { Authorization: 'Bearer token_alice' },
      });
      assert.equal(badCursorRes.status, 400);
      assert.equal(
        ((await badCursorRes.json()) as any).faultCode,
        'W07-HISTORY_UI-400-INVALID_CURSOR',
      );

      // 7. Invalid pagination limits -> 400 W07-HISTORY_UI-400-INVALID_PAGINATION_LIMIT
      for (const badLimit of ['0', '51', '-5', 'abc']) {
        const badLimitRes = await fetch(
          `${baseUrl}/api/withdrawals/me?limit=${encodeURIComponent(badLimit)}`,
          { headers: { Authorization: 'Bearer token_alice' } },
        );
        assert.equal(badLimitRes.status, 400);
        assert.equal(
          ((await badLimitRes.json()) as any).faultCode,
          'W07-HISTORY_UI-400-INVALID_PAGINATION_LIMIT',
        );
      }

      // 8. Non-existent withdrawal ID -> 404 W07-HISTORY_UI-404-WITHDRAWAL_NOT_FOUND
      const notFoundRes = await fetch(`${baseUrl}/api/withdrawals/me/wth_missing_999`, {
        headers: { Authorization: 'Bearer token_alice' },
      });
      assert.equal(notFoundRes.status, 404);
      assert.equal(
        ((await notFoundRes.json()) as any).faultCode,
        'W07-HISTORY_UI-404-WITHDRAWAL_NOT_FOUND',
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('3. Regression & Integration Audit (W01..W07): W01..W06 artifacts remain byte-identical and fail-closed 503 when Firestore unavailable', async () => {
    const sha256Of = (relPath: string) =>
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(projectRoot, relPath)))
        .digest('hex')
        .toUpperCase();

    assert.equal(
      sha256Of('src/types/withdrawal.ts'),
      'B5362F9A09B8CBE9EE6DE71D7C3AAAD22EAE69054DB28E86C2E4B19792611B0E',
    );
    assert.equal(
      sha256Of('firestore.indexes.json'),
      '39990B1AA0F47F15652DCC6AA3BE6DC844C78EE4D1D9C9A86925F28CEBE33E9D',
    );
    assert.equal(
      sha256Of('firestore.rules'),
      '3422F1E051904328C791377B6BE4DB34269AFC9AA7D3FF0E00C59677503F6C8C',
    );
    assert.equal(
      sha256Of('server/services/withdrawalRequestLockService.ts'),
      '6F647CA3EFC26BE897DAC8375E61FABFA95E88A211BFADBB8ABCB229962C4992',
    );

    const app = express();
    app.use(
      '/api/withdrawals',
      createWithdrawalConfigQuoteRouter({
        authAdapter: {
          isInitialized: () => true,
          getApp: () => ({}) as any,
          async verifyIdToken() {
            return { uid: 'uid_alice', email: 'alice@pouw.io', firebase: { sign_in_provider: 'password' } };
          },
        },
        firestore: null,
      }),
    );
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/withdrawals/me`, {
        headers: { Authorization: 'Bearer valid_token' },
      });
      assert.equal(res.status, 503);
      assert.equal(((await res.json()) as any).faultCode, 'W07-HISTORY_UI-503-HISTORY_FIRESTORE_UNAVAILABLE');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
