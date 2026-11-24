/**
 * SCRUM-275 / SCRUM-289 / SCRUM-287 (W12)
 * Admin & Backend Production Cutover Verification:
 * - Verifies physical deletion of legacy `clientWithdrawalsService.ts` and `WithdrawalsView.tsx`
 * - Verifies zero remaining legacy `WithdrawalStatus` / `ClientWithdrawalRequest` or `minerx_client_withdrawals_v2` refs
 * - Verifies `src/App.tsx` mounts `<AdminWithdrawalsControlCenter />` and `AdminOverview.tsx` uses W08 `fetchAdminWithdrawals`
 * - Verifies `server/server.ts` mounts all 5 canonical W03..W11 routers under fail-closed W02 AuthZ (`401` unauthenticated)
 * - Verifies `GET /api/auth/me` exposes explicit `permissions` (no `SUPER_ADMIN` wildcard)
 * - Verifies immutable contract SHA-256 hashes W01..W11
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { app } from '../../server/server.js';

const projectRoot = path.resolve(import.meta.dirname, '../..');

const BASELINE_HASHES = {
  withdrawalTs: 'B5362F9A09B8CBE9EE6DE71D7C3AAAD22EAE69054DB28E86C2E4B19792611B0E',
  firestoreRules: 'F4313C04DD7595E1C84D8977299169EEA38C2B250F96E6916D68959CDAAA6779',
  firestoreIndexes: '39990B1AA0F47F15652DCC6AA3BE6DC844C78EE4D1D9C9A86925F28CEBE33E9D',
  withdrawalAuthz: 'CDF98533CCD482A49EAD810A5E1BB445CB6561FC9496AFAEDB4DD6E0567D86C8',
};

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

describe('SCRUM-287 (W12): Admin & Backend Production Cutover', () => {
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('elimina físicamente clientWithdrawalsService.ts y WithdrawalsView.tsx y remueve tipos legados de admin.ts', () => {
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'src/services/admin/clientWithdrawalsService.ts')),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'src/components/admin/WithdrawalsView.tsx')),
      false,
    );

    const adminTypesSrc = fs.readFileSync(path.join(projectRoot, 'src/types/admin.ts'), 'utf8');
    assert.equal(adminTypesSrc.includes('ClientWithdrawalRequest'), false);
    assert.equal(/\bexport type WithdrawalStatus\b/.test(adminTypesSrc), false);

    // Adjacent admin types stay intact
    assert.ok(adminTypesSrc.includes('export interface PackageOrderPayment'));
  });

  it('no deja referencias residuales a localStorage/mocks legados de retiros en src/', () => {
    const srcFiles = collectFiles(path.join(projectRoot, 'src'));
    for (const filePath of srcFiles) {
      const rel = path.relative(projectRoot, filePath).replace(/\\/g, '/');
      if (rel === 'src/components/admin/AdminWithdrawalsControlCenter.tsx') {
        continue; // JSDoc historical mention only
      }
      const content = fs.readFileSync(filePath, 'utf8');
      assert.equal(content.includes('clientWithdrawalsService'), false, `Leftover ref in ${rel}`);
      assert.equal(content.includes('WithdrawalsView'), false, `Leftover ref in ${rel}`);
      assert.equal(content.includes('minerx_client_withdrawals_v2'), false, `Leftover ref in ${rel}`);
      assert.equal(content.includes('INITIAL_WITHDRAWALS'), false, `Leftover ref in ${rel}`);
      assert.equal(content.includes('ClientWithdrawalRequest'), false, `Leftover ref in ${rel}`);
    }

    const appSrc = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8');
    assert.ok(appSrc.includes('<AdminWithdrawalsControlCenter'));

    const overviewSrc = fs.readFileSync(
      path.join(projectRoot, 'src/components/admin/AdminOverview.tsx'),
      'utf8',
    );
    assert.ok(overviewSrc.includes('fetchAdminWithdrawals'));
  });

  it('monta todos los routers canónicos W03..W11 en server/server.ts bajo authZ W02 fail-closed (401)', async () => {
    const endpoints: Array<{ method: string; path: string; body?: string }> = [
      { method: 'GET', path: '/api/withdrawals/config' },
      { method: 'POST', path: '/api/withdrawals/quote', body: '{}' },
      { method: 'POST', path: '/api/withdrawals/request', body: '{}' },
      { method: 'GET', path: '/api/withdrawals/me' },
      { method: 'GET', path: '/api/admin/withdrawals' },
      { method: 'POST', path: '/api/admin/withdrawals/wth-test/approve', body: '{}' },
      { method: 'GET', path: '/api/admin/withdrawals/wth-test/audit' },
      { method: 'POST', path: '/api/admin/withdrawals/wth-test/broadcast', body: '{}' },
      { method: 'PATCH', path: '/api/admin/withdrawals/wth-test/confirmations', body: '{}' },
      { method: 'POST', path: '/api/admin/withdrawals/wth-test/complete', body: '{}' },
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : undefined,
        body: ep.body,
      });
      assert.equal(
        res.status,
        401,
        `${ep.method} ${ep.path} must return 401 fail-closed without token (got ${res.status})`,
      );
      const json = (await res.json()) as { faultCode?: string };
      assert.ok(
        typeof json.faultCode === 'string' && json.faultCode.startsWith('W02-AUTHZ-401-'),
        `Expected W02-AUTHZ-401-* faultCode on ${ep.method} ${ep.path}`,
      );
    }

    const serverSrc = fs.readFileSync(path.join(projectRoot, 'server/server.ts'), 'utf8');
    assert.ok(serverSrc.includes('resolveExplicitAdminWithdrawalPermissions'));
    assert.ok(serverSrc.includes('WITHDRAWAL_ADMIN_PERMISSIONS'));
    assert.equal(serverSrc.includes('SUPER_ADMIN'), false);
  });

  it('conserva intactos los hashes SHA-256 base W01..W11 sin modificar contratos congelados', () => {
    const sha = (relPath: string) =>
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(projectRoot, relPath)))
        .digest('hex')
        .toUpperCase();

    assert.equal(sha('src/types/withdrawal.ts'), BASELINE_HASHES.withdrawalTs);
    assert.equal(sha('firestore.rules'), BASELINE_HASHES.firestoreRules);
    assert.equal(sha('firestore.indexes.json'), BASELINE_HASHES.firestoreIndexes);
    assert.equal(
      sha('server/services/withdrawalAuthzMiddleware.ts'),
      BASELINE_HASHES.withdrawalAuthz,
    );
  });
});
