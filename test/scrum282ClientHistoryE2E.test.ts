/**
 * SCRUM-275 / SCRUM-289 / SCRUM-282 (W07)
 * Client History End-to-End & Cumulative Regression Suite (`W01..W07`):
 * - `withdrawalClientHistoryService.ts` (`GET /api/withdrawals/me` & `GET /api/withdrawals/me/:id`)
 * - `WithdrawalHistoryPanel.tsx` + `createClientWithdrawalHistoryController` reusing W06 (`WithdrawalHistory` + `WithdrawalDetailsModal` in `mode="client"`)
 * - Cursor pagination, authoritative refresh of status transitions, cross-UID fault propagation, and W01..W07 audit
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { registerHooks } from 'node:module';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

import {
  CANONICAL_USDT_NETWORKS,
  isWithdrawalModuleError,
  type WithdrawalRequest,
} from '../src/types/withdrawal.ts';
import type { ClientWithdrawalAuthSession } from '../src/services/withdrawals/withdrawalAuthGuard.ts';
import {
  fetchClientWithdrawalDetail,
  fetchClientWithdrawalHistory,
} from '../src/services/withdrawals/withdrawalClientHistoryService.ts';

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

const { WithdrawalHistoryPanel, createClientWithdrawalHistoryController } = await import(
  '../src/components/withdrawals/WithdrawalHistoryPanel.tsx'
);

const projectRoot = path.resolve(import.meta.dirname, '..');
const VALID_EVM_TX_HASH = '0x' + '1234abcd'.repeat(8);

function makeClientWithdrawal(
  id: string,
  userId: string,
  requestedAt: string,
  status: WithdrawalRequest['status'],
): Record<string, unknown> {
  return {
    id,
    userId,
    asset: 'USDT',
    networkId: 'usdt-bsc',
    network: 'BSC',
    networkDisplayName: 'BNB Smart Chain (BEP-20)',
    addressType: 'EVM',
    destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    requestedAmountMicros: 30_000_000,
    networkFeeMicros: 500_000,
    platformFeeMicros: 300_000,
    conversionFeeMicros: 0,
    totalDebitMicros: 30_800_000,
    netAmountMicros: 30_000_000,
    status,
    membershipTierSnapshot: 'PRO',
    slaDisplaySnapshot: '1 a 5 horas (Prioridad Membresía PRO)',
    confirmations: status === 'COMPLETED' ? 15 : status === 'BROADCASTED' ? 6 : 0,
    requiredConfirmations: 15,
    configVersion: 1,
    requestedAt,
    createdAt: requestedAt,
    updatedAt: requestedAt,
    ...(status === 'BROADCASTED' || status === 'COMPLETED'
      ? { txHash: VALID_EVM_TX_HASH, broadcastedAt: requestedAt }
      : {}),
  };
}

function createCoupledClientHistoryServer() {
  const rows: Record<string, unknown>[] = [
    makeClientWithdrawal('wth_c_03', 'uid_w07_client', '2026-11-18T08:03:00.000Z', 'REQUESTED'),
    makeClientWithdrawal('wth_c_02', 'uid_w07_client', '2026-11-18T08:02:00.000Z', 'BROADCASTED'),
    makeClientWithdrawal('wth_c_01', 'uid_w07_client', '2026-11-18T08:01:00.000Z', 'COMPLETED'),
    makeClientWithdrawal('wth_other_uid', 'uid_other_attacker', '2026-11-18T08:04:00.000Z', 'COMPLETED'),
  ];

  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer token_w07_valid') {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: false,
          code: 'UNAUTHENTICATED',
          faultCode: 'W02-AUTHZ-401-UNAUTHENTICATED',
          originTask: 'W02',
          originModule: 'AUTHZ',
          error: 'No autenticado.',
        }),
      );
      return;
    }

    const parsedUrl = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (req.method === 'GET' && parsedUrl.pathname === '/api/withdrawals/me') {
      const limit = Number(parsedUrl.searchParams.get('limit') ?? '15');
      const cursor = parsedUrl.searchParams.get('cursor');

      const own = rows
        .filter((r) => r.userId === 'uid_w07_client')
        .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));

      let startIdx = 0;
      if (cursor) {
        if (cursor === 'bad_cursor') {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: false,
              code: 'INVALID_CURSOR',
              faultCode: 'W07-HISTORY_UI-400-INVALID_CURSOR',
              originTask: 'W07',
              originModule: 'HISTORY_UI',
              error: 'Cursor inválido.',
            }),
          );
          return;
        }
        const idx = own.findIndex((r) => r.id === cursor);
        startIdx = idx >= 0 ? idx + 1 : own.length;
      }

      const slice = own.slice(startIdx, startIdx + limit + 1);
      const hasMore = slice.length > limit;
      const items = hasMore ? slice.slice(0, limit) : slice;
      const nextCursor = hasMore && items.length > 0 ? String(items[items.length - 1].id) : null;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          items,
          nextCursor,
          hasMore,
          limit,
        }),
      );
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname.startsWith('/api/withdrawals/me/')) {
      const targetId = decodeURIComponent(
        parsedUrl.pathname.slice('/api/withdrawals/me/'.length),
      );
      const found = rows.find((r) => r.id === targetId);
      if (!found) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: false,
            code: 'WITHDRAWAL_NOT_FOUND',
            faultCode: 'W07-HISTORY_UI-404-WITHDRAWAL_NOT_FOUND',
            originTask: 'W07',
            originModule: 'HISTORY_UI',
            error: 'Retiro no encontrado.',
          }),
        );
        return;
      }

      if (found.userId !== 'uid_w07_client') {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: false,
            code: 'FORBIDDEN_CROSS_UID_ACCESS',
            faultCode: 'W02-AUTHZ-403-FORBIDDEN_CROSS_UID_ACCESS',
            originTask: 'W02',
            originModule: 'AUTHZ',
            error: 'Acceso denegado.',
          }),
        );
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, withdrawal: found }));
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  return {
    server,
    promoteTopRequestToCompleted() {
      const target = rows.find((r) => r.id === 'wth_c_03');
      if (target) {
        target.status = 'COMPLETED';
        target.confirmations = 15;
        target.txHash = VALID_EVM_TX_HASH;
      }
    },
  };
}

test('SCRUM-282 (W07.1): Controller loads paginated client history (cursor), refreshes authoritative status updates, and opens own detail', async () => {
  const { server, promoteTopRequestToCompleted } = createCoupledClientHistoryServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const session: ClientWithdrawalAuthSession = {
      uid: 'uid_w07_client',
      email: 'client.w07@pouw.io',
      isAnonymous: false,
      idToken: 'token_w07_valid',
    };

    const ctrl = createClientWithdrawalHistoryController({
      session,
      apiOptions: { baseUrl },
      pageSize: 2,
    });

    // 1. Load initial page (2 items, hasMore: true)
    const page1 = await ctrl.loadInitial();
    assert.equal(page1.length, 2);
    assert.deepEqual(
      page1.map((i) => i.id),
      ['wth_c_03', 'wth_c_02'],
    );
    assert.equal(ctrl.getSnapshot().hasMore, true);
    assert.equal(ctrl.getSnapshot().nextCursor, 'wth_c_02');

    // 2. Load next page via cursor (total 3 items, hasMore: false)
    const allItems = await ctrl.loadMore();
    assert.equal(allItems.length, 3);
    assert.deepEqual(
      allItems.map((i) => i.id),
      ['wth_c_03', 'wth_c_02', 'wth_c_01'],
    );
    assert.equal(ctrl.getSnapshot().hasMore, false);
    assert.equal(ctrl.getSnapshot().nextCursor, null);

    // 3. Open detail via authoritative endpoint
    const detail = await ctrl.openDetail('wth_c_03');
    assert.equal(detail.status, 'REQUESTED');
    assert.equal(ctrl.getSnapshot().selectedWithdrawal?.id, 'wth_c_03');

    // 4. Backend transitions wth_c_03 -> COMPLETED; refresh pulls new state from backend
    promoteTopRequestToCompleted();
    await ctrl.refresh();
    assert.equal(ctrl.getSnapshot().items[0].status, 'COMPLETED');
    assert.equal(ctrl.getSnapshot().selectedWithdrawal?.status, 'COMPLETED');
    assert.equal(ctrl.getSnapshot().selectedWithdrawal?.confirmations, 15);
    assert.equal(ctrl.getSnapshot().selectedWithdrawal?.txHash, VALID_EVM_TX_HASH);

    // 5. Render <WithdrawalHistoryPanel /> reusing W06 shared UI components
    const html = renderToStaticMarkup(
      React.createElement(WithdrawalHistoryPanel, {
        session,
        apiOptions: { baseUrl },
        networksCatalog: CANONICAL_USDT_NETWORKS,
        autoLoad: false,
        initialItems: ctrl.getSnapshot().items,
      }),
    );
    assert.match(html, /data-testid="withdrawal-history-panel"/);
    assert.match(html, /data-testid="withdrawal-history-refresh-btn"/);
    assert.match(html, /data-testid="withdrawal-table"/);
    assert.match(html, /data-testid="withdrawal-cards"/);
    assert.match(html, /https:\/\/bscscan\.com\/tx\/0x/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('SCRUM-282 (W07.2): Client HTTP service rejects invalid limit pre-flight and propagates W02/W07 fault codes on cross-UID/cursor attacks', async () => {
  const { server } = createCoupledClientHistoryServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const session: ClientWithdrawalAuthSession = {
      uid: 'uid_w07_client',
      email: 'client.w07@pouw.io',
      isAnonymous: false,
      idToken: 'token_w07_valid',
    };

    await assert.rejects(
      async () => fetchClientWithdrawalHistory(session, { limit: 100 }, { baseUrl }),
      (err: unknown) => {
        assert.ok(isWithdrawalModuleError(err));
        assert.equal(err.faultCode, 'W07-HISTORY_UI-400-INVALID_PAGINATION_LIMIT');
        return true;
      },
    );

    await assert.rejects(
      async () => fetchClientWithdrawalHistory(session, { cursor: 'bad_cursor' }, { baseUrl }),
      (err: unknown) => {
        assert.ok(isWithdrawalModuleError(err));
        assert.equal(err.faultCode, 'W07-HISTORY_UI-400-INVALID_CURSOR');
        return true;
      },
    );

    await assert.rejects(
      async () => fetchClientWithdrawalDetail(session, 'wth_other_uid', { baseUrl }),
      (err: unknown) => {
        assert.ok(isWithdrawalModuleError(err));
        assert.equal(err.faultCode, 'W02-AUTHZ-403-FORBIDDEN_CROSS_UID_ACCESS');
        return true;
      },
    );

    await assert.rejects(
      async () => fetchClientWithdrawalDetail(session, '   ', { baseUrl }),
      (err: unknown) => {
        assert.ok(isWithdrawalModuleError(err));
        assert.equal(err.faultCode, 'W07-HISTORY_UI-400-WITHDRAWAL_ID_REQUIRED');
        return true;
      },
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('SCRUM-282 (W07.3 — Regresión e Integración Acumulada W01..W07): Verifies W06 reuse, W01..W06 integrity, and anti-emoji/craft compliance', () => {
  const sha256Of = (relPath: string) =>
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(projectRoot, relPath)))
      .digest('hex')
      .toUpperCase();

  // W01..W06 files remain byte-identical
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
    'F4313C04DD7595E1C84D8977299169EEA38C2B250F96E6916D68959CDAAA6779',
  );
  assert.equal(
    sha256Of('src/components/withdrawals/WithdrawalForm.tsx'),
    '9353DD259F83200FDB6E58EAF7E2EC1A09BA32B3E64C386E8993D7F01C7A5CDE',
  );
  assert.equal(
    sha256Of('src/components/withdrawals/WithdrawalHistory.tsx'),
    'F42BDA498A511279C308E7305FFE62FFB0AD0284D392525B3AAB73E613F908B3',
  );
  assert.equal(
    sha256Of('src/components/withdrawals/WithdrawalDetailsModal.tsx'),
    'EF99D93211230C69EC0988988B4564BDBA32D62A321189ACDE9246364C400268',
  );

  // Panel strictly reuses W06 shared UI and W07 service (no duplicate table/card/modal renderer)
  const panelSource = fs.readFileSync(
    path.join(projectRoot, 'src/components/withdrawals/WithdrawalHistoryPanel.tsx'),
    'utf8',
  );
  assert.match(panelSource, /from '\.\/WithdrawalHistory\.tsx'/);
  assert.match(panelSource, /from '\.\/WithdrawalDetailsModal\.tsx'/);
  assert.match(panelSource, /from '\.\.\/\.\.\/services\/withdrawals\/withdrawalClientHistoryService\.ts'/);
  assert.match(panelSource, /mode="client"/);
  assert.doesNotMatch(panelSource, /<table\b/i);
  assert.doesNotMatch(panelSource, /\p{Extended_Pictographic}/u);

  const clientServiceSource = fs.readFileSync(
    path.join(projectRoot, 'src/services/withdrawals/withdrawalClientHistoryService.ts'),
    'utf8',
  );
  assert.match(clientServiceSource, /\/api\/withdrawals\/me/);
  assert.match(clientServiceSource, /buildClientWithdrawalAuthHeaders/);
});
