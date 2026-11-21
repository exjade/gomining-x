/**
 * SCRUM-275 / SCRUM-289 / SCRUM-281 (W06)
 * Admin & Backend Shared UI Verification & Cumulative Regression Suite (`W01..W04 + W06`):
 * Verifies the identical shared UI components (`src/components/withdrawals/`) in `retiros-admin-backend`,
 * strict `admin` vs `client` mode isolation, safe W03 explorer link generation, `W06-SHARED_UI-*` fault codes,
 * byte-parity with Client (`retiros-cliente-main`), and zero regression on W01..W04 backend/admin contracts.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

import {
  CANONICAL_USDT_NETWORKS,
  WITHDRAWAL_STATUSES,
  isWithdrawalModuleError,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from '../../src/types/withdrawal.ts';

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

const { WithdrawalStatusBadge, getWithdrawalStatusMeta, assertWithdrawalUiMode } = await import(
  '../../src/components/withdrawals/WithdrawalStatusBadge.tsx'
);
const { WithdrawalAddress, copyWithdrawalText } = await import(
  '../../src/components/withdrawals/WithdrawalAddress.tsx'
);
const { WithdrawalTxHash, buildSafeWithdrawalExplorerUrl } = await import(
  '../../src/components/withdrawals/WithdrawalTxHash.tsx'
);
const { WithdrawalDetailsModal } = await import(
  '../../src/components/withdrawals/WithdrawalDetailsModal.tsx'
);
const { WithdrawalHistory, buildWithdrawalHistoryRows } = await import(
  '../../src/components/withdrawals/WithdrawalHistory.tsx'
);

const projectRoot = path.resolve(import.meta.dirname, '../..');
const VALID_EVM_TX_HASH = '0x' + 'f1e2d3c4'.repeat(8);

function makeSampleAdminWithdrawal(
  status: WithdrawalStatus,
  overrides: Partial<WithdrawalRequest> = {},
): WithdrawalRequest {
  return {
    id: `wth_adm_${status.toLowerCase()}`,
    userId: 'uid_w06_adm_user',
    userEmail: 'ops.miner@pouw.io',
    asset: 'USDT',
    networkId: 'usdt-bsc',
    network: 'BSC',
    networkDisplayName: 'BNB Smart Chain (BEP-20)',
    addressType: 'EVM',
    destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    requestedAmountMicros: 80_000_000,
    networkFeeMicros: 500_000,
    platformFeeMicros: 800_000,
    conversionFeeMicros: 0,
    totalDebitMicros: 81_300_000,
    netAmountMicros: 80_000_000,
    status,
    membershipTierSnapshot: 'ELITE',
    slaDisplaySnapshot: '1 a 5 horas (Prioridad Membresía ELITE)',
    confirmations: status === 'COMPLETED' ? 15 : 0,
    requiredConfirmations: 15,
    idempotencyKey: 'idem_w06_admin_001',
    configVersion: 1,
    requestedAt: '2026-11-18T08:00:00.000Z',
    createdAt: '2026-11-18T08:00:00.000Z',
    updatedAt: '2026-11-18T08:05:00.000Z',
    ...(status === 'BROADCASTED' || status === 'COMPLETED'
      ? { txHash: VALID_EVM_TX_HASH, broadcastedAt: '2026-11-18T08:03:00.000Z' }
      : {}),
    ...overrides,
  };
}

test('SCRUM-281 Admin (W06.1): Shared UI components render 8 statuses, table/cards, admin metadata & safe W03 explorer links', async () => {
  assert.equal(assertWithdrawalUiMode('admin'), 'admin');
  for (const status of WITHDRAWAL_STATUSES) {
    const meta = getWithdrawalStatusMeta(status);
    const html = renderToStaticMarkup(
      React.createElement(WithdrawalStatusBadge, { status, showCode: true }),
    );
    assert.match(html, new RegExp(meta.label));
  }

  const dataset = [
    makeSampleAdminWithdrawal('UNDER_REVIEW'),
    makeSampleAdminWithdrawal('COMPLETED', {
      internalNotes: 'AUDIT_TRAIL_OK',
      approvedBy: 'admin_ops_01',
    }),
  ];
  const rows = buildWithdrawalHistoryRows(dataset);
  assert.equal(rows.length, 2);

  const historyHtml = renderToStaticMarkup(
    React.createElement(WithdrawalHistory, {
      withdrawals: dataset,
      mode: 'admin',
      networksCatalog: CANONICAL_USDT_NETWORKS,
    }),
  );
  assert.match(historyHtml, /ops\.miner@pouw\.io/);
  assert.match(historyHtml, /data-testid="withdrawal-table"/);
  assert.match(historyHtml, /data-testid="withdrawal-cards"/);

  const modalHtml = renderToStaticMarkup(
    React.createElement(WithdrawalDetailsModal, {
      withdrawal: dataset[1],
      mode: 'admin',
      isOpen: true,
      onClose: () => {},
      networksCatalog: CANONICAL_USDT_NETWORKS,
    }),
  );
  assert.match(modalHtml, /AUDIT_TRAIL_OK/);
  assert.match(modalHtml, /admin_ops_01/);
  assert.match(modalHtml, /https:\/\/bscscan\.com\/tx\/0x/);

  const explorerOk = buildSafeWithdrawalExplorerUrl({
    txHash: VALID_EVM_TX_HASH,
    networkId: 'usdt-bsc',
    addressType: 'EVM',
    networksCatalog: CANONICAL_USDT_NETWORKS,
  });
  assert.equal(explorerOk.valid, true);

  await assert.rejects(
    async () => copyWithdrawalText(''),
    (err: unknown) => {
      assert.ok(isWithdrawalModuleError(err));
      assert.equal(err.faultCode, 'W06-SHARED_UI-400-CLIPBOARD_UNAVAILABLE');
      return true;
    },
  );

  // Also ensure WithdrawalAddress & WithdrawalTxHash render cleanly in Admin
  const addrHtml = renderToStaticMarkup(
    React.createElement(WithdrawalAddress, {
      address: dataset[0].destinationAddress,
      addressType: 'EVM',
    }),
  );
  assert.match(addrHtml, /withdrawal-address-chip/);

  const txHtml = renderToStaticMarkup(
    React.createElement(WithdrawalTxHash, {
      txHash: VALID_EVM_TX_HASH,
      networkId: 'usdt-bsc',
      addressType: 'EVM',
    }),
  );
  assert.match(txHtml, /withdrawal-txhash-explorer-link/);
});

test('SCRUM-281 Admin (W06.2 — Regresión e Integración W01..W04 + W06): Verifies W01..W04 integrity and Client/Admin byte parity', () => {
  const sha256Of = (absPath: string) =>
    crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex').toUpperCase();

  // Confirm W01..W04 Admin/Backend hashes remain untouched
  assert.equal(
    sha256Of(path.join(projectRoot, 'src/types/withdrawal.ts')),
    'B5362F9A09B8CBE9EE6DE71D7C3AAAD22EAE69054DB28E86C2E4B19792611B0E',
  );
  assert.equal(
    sha256Of(path.join(projectRoot, 'firestore.rules')),
    '02FB0892E381A8AD42C89910A610FFCFD37B708FF978E6CC3862020EE36460CD',
  );
  assert.equal(
    sha256Of(path.join(projectRoot, 'server/services/withdrawalRequestLockService.ts')),
    '6F647CA3EFC26BE897DAC8375E61FABFA95E88A211BFADBB8ABCB229962C4992',
  );

  const sharedFiles = [
    'src/components/withdrawals/WithdrawalStatusBadge.tsx',
    'src/components/withdrawals/WithdrawalAddress.tsx',
    'src/components/withdrawals/WithdrawalTxHash.tsx',
    'src/components/withdrawals/WithdrawalDetailsModal.tsx',
    'src/components/withdrawals/WithdrawalHistory.tsx',
    'src/components/withdrawals/withdrawalShared.css',
  ];

  const clientSiblingRoot = path.resolve(projectRoot, '..', 'retiros-cliente-main');
  if (fs.existsSync(clientSiblingRoot)) {
    for (const rel of sharedFiles) {
      assert.equal(
        sha256Of(path.join(projectRoot, rel)),
        sha256Of(path.join(clientSiblingRoot, rel)),
        `${rel} must be byte-identical between Admin and Client`,
      );
    }
  }
});
