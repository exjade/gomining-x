/**
 * SCRUM-275 / SCRUM-289 / SCRUM-281 (W06)
 * Shared UI E2E & Cumulative Regression Suite (`W01..W06`):
 * - WithdrawalStatusBadge (8 canonical statuses)
 * - WithdrawalAddress (monospace formatting + copy + W06-SHARED_UI-400-CLIPBOARD_UNAVAILABLE)
 * - WithdrawalTxHash + buildSafeWithdrawalExplorerUrl (W03 config-only explorer + W06-SHARED_UI-422-*)
 * - WithdrawalDetailsModal (strict `client` vs `admin` isolation)
 * - WithdrawalHistory / WithdrawalTable / WithdrawalCards (single data adapter, loading/empty/error/pagination)
 * - Cross-task contract, SHA-256 byte-parity (Client == Admin) & UI/UX craft audit (`W01..W06`)
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
  type WithdrawalNetworkConfig,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from '../src/types/withdrawal.ts';

// Register synchronous loader hooks so Node's native test runner can import `.tsx` and `.css`
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
  '../src/components/withdrawals/WithdrawalStatusBadge.tsx'
);
const { WithdrawalAddress, copyWithdrawalText, formatShortWithdrawalAddress } = await import(
  '../src/components/withdrawals/WithdrawalAddress.tsx'
);
const { WithdrawalTxHash, buildSafeWithdrawalExplorerUrl } = await import(
  '../src/components/withdrawals/WithdrawalTxHash.tsx'
);
const { WithdrawalDetailsModal } = await import(
  '../src/components/withdrawals/WithdrawalDetailsModal.tsx'
);
const {
  WithdrawalHistory,
  WithdrawalTable,
  WithdrawalCards,
  buildWithdrawalHistoryRows,
} = await import('../src/components/withdrawals/WithdrawalHistory.tsx');

const projectRoot = path.resolve(import.meta.dirname, '..');
const VALID_EVM_TX_HASH = '0x' + 'a1b2c3d4'.repeat(8);

function makeSampleWithdrawal(
  status: WithdrawalStatus,
  overrides: Partial<WithdrawalRequest> = {},
): WithdrawalRequest {
  return {
    id: `wth_${status.toLowerCase()}_01`,
    userId: 'uid_w06_client_01',
    userEmail: 'secret.miner@pouw.io',
    asset: 'USDT',
    networkId: 'usdt-bsc',
    network: 'BSC',
    networkDisplayName: 'BNB Smart Chain (BEP-20)',
    addressType: 'EVM',
    destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    requestedAmountMicros: 50_000_000,
    networkFeeMicros: 500_000,
    platformFeeMicros: 500_000,
    conversionFeeMicros: 0,
    totalDebitMicros: 51_000_000,
    netAmountMicros: 50_000_000,
    status,
    membershipTierSnapshot: 'PRO',
    slaDisplaySnapshot: '1 a 5 horas (Prioridad Membresía PRO)',
    confirmations: status === 'COMPLETED' ? 15 : status === 'BROADCASTED' ? 4 : 0,
    requiredConfirmations: 15,
    idempotencyKey: 'idem_w06_00000001',
    configVersion: 1,
    requestedAt: '2026-11-18T08:00:00.000Z',
    createdAt: '2026-11-18T08:00:00.000Z',
    updatedAt: '2026-11-18T08:05:00.000Z',
    ...(status === 'BROADCASTED' || status === 'COMPLETED'
      ? { txHash: VALID_EVM_TX_HASH, broadcastedAt: '2026-11-18T08:03:00.000Z' }
      : {}),
    ...(status === 'COMPLETED' ? { completedAt: '2026-11-18T08:05:00.000Z' } : {}),
    ...(status === 'REJECTED' ? { rejectionReason: 'Wallet de riesgo sancionada' } : {}),
    ...(status === 'CANCELLED' ? { cancellationReason: 'Solicitud cancelada por usuario' } : {}),
    ...overrides,
  };
}

test('SCRUM-281 (W06.1): WithdrawalStatusBadge renders all 8 canonical W01 statuses identically and rejects invalid mode', () => {
  assert.equal(assertWithdrawalUiMode('client'), 'client');
  assert.equal(assertWithdrawalUiMode('admin'), 'admin');
  assert.throws(
    () => assertWithdrawalUiMode('superadmin'),
    (err: unknown) => {
      assert.ok(isWithdrawalModuleError(err));
      assert.equal(err.faultCode, 'W06-SHARED_UI-422-INVALID_WITHDRAWAL_MODE');
      return true;
    },
  );

  for (const status of WITHDRAWAL_STATUSES) {
    const meta = getWithdrawalStatusMeta(status);
    assert.equal(meta.status, status);
    const html = renderToStaticMarkup(
      React.createElement(WithdrawalStatusBadge, { status, showCode: true }),
    );
    assert.match(html, new RegExp(`data-testid="withdrawal-status-badge-${status}"`));
    assert.match(html, new RegExp(meta.label));
  }
});

test('SCRUM-281 (W06.2): WithdrawalAddress & WithdrawalTxHash support safe copying and config-only explorer URLs with W06-SHARED_UI-* faults', async () => {
  // 1. Address formatting & copy handler
  assert.equal(
    formatShortWithdrawalAddress('0x71C7656EC7ab88b098defB751B7401B5f6d8976F'),
    '0x71C7...d8976F',
  );
  let copiedValue = '';
  await copyWithdrawalText('0x71C7656EC7ab88b098defB751B7401B5f6d8976F', (text) => {
    copiedValue = text;
  });
  assert.equal(copiedValue, '0x71C7656EC7ab88b098defB751B7401B5f6d8976F');

  // Empty copy emits W06-SHARED_UI-400-CLIPBOARD_UNAVAILABLE
  await assert.rejects(
    async () => copyWithdrawalText('   '),
    (err: unknown) => {
      assert.ok(isWithdrawalModuleError(err));
      assert.equal(err.faultCode, 'W06-SHARED_UI-400-CLIPBOARD_UNAVAILABLE');
      return true;
    },
  );

  const addrHtml = renderToStaticMarkup(
    React.createElement(WithdrawalAddress, {
      address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      addressType: 'EVM',
      showTypeTag: true,
    }),
  );
  assert.match(addrHtml, /data-testid="withdrawal-address-copy-btn"/);
  assert.match(addrHtml, /EVM/);

  // 2. Valid explorer URL constructed strictly from W03 canonical network config
  const safeRes = buildSafeWithdrawalExplorerUrl({
    txHash: VALID_EVM_TX_HASH,
    networkId: 'usdt-bsc',
    addressType: 'EVM',
    networksCatalog: CANONICAL_USDT_NETWORKS,
  });
  assert.equal(safeRes.valid, true);
  assert.equal(safeRes.url, `https://bscscan.com/tx/${VALID_EVM_TX_HASH}`);

  // 3. Synthetic txHash blocked with W06-SHARED_UI-422-UNSAFE_EXPLORER_URL
  const syntheticRes = buildSafeWithdrawalExplorerUrl({
    txHash: 'tx-fake-12345',
    networkId: 'usdt-bsc',
    addressType: 'EVM',
    networksCatalog: CANONICAL_USDT_NETWORKS,
  });
  assert.equal(syntheticRes.valid, false);
  assert.equal(syntheticRes.url, null);
  assert.equal(syntheticRes.faultCode, 'W06-SHARED_UI-422-UNSAFE_EXPLORER_URL');

  // 4. Malicious/http/javascript explorer template blocked with W06-SHARED_UI-422-INVALID_EXPLORER_TEMPLATE
  const bscNet = CANONICAL_USDT_NETWORKS.find((n) => n.id === 'usdt-bsc')!;
  const evilConfig: WithdrawalNetworkConfig = {
    ...bscNet,
    explorerTxUrlTemplate: 'https://evil-phishing.example/tx/{txHash}',
  };
  const evilRes = buildSafeWithdrawalExplorerUrl({
    txHash: VALID_EVM_TX_HASH,
    networkId: 'usdt-bsc',
    addressType: 'EVM',
    networkConfig: evilConfig,
  });
  assert.equal(evilRes.valid, false);
  assert.equal(evilRes.url, null);
  assert.equal(evilRes.faultCode, 'W06-SHARED_UI-422-INVALID_EXPLORER_TEMPLATE');

  // 5. Render WithdrawalTxHash pending vs broadcasted
  const pendingHtml = renderToStaticMarkup(
    React.createElement(WithdrawalTxHash, {
      txHash: undefined,
      networkId: 'usdt-bsc',
      addressType: 'EVM',
    }),
  );
  assert.match(pendingHtml, /Pendiente de emisión/);

  const broadcastedHtml = renderToStaticMarkup(
    React.createElement(WithdrawalTxHash, {
      txHash: VALID_EVM_TX_HASH,
      networkId: 'usdt-bsc',
      addressType: 'EVM',
      networksCatalog: CANONICAL_USDT_NETWORKS,
    }),
  );
  assert.match(broadcastedHtml, /https:\/\/bscscan\.com\/tx\/0x/);
  assert.match(broadcastedHtml, /data-testid="withdrawal-txhash-explorer-link"/);
});

test('SCRUM-281 (W06.3): WithdrawalHistory shares one data model across WithdrawalTable (desktop) and WithdrawalCards (mobile), covering loading, empty & error states', () => {
  const dataset: WithdrawalRequest[] = [
    makeSampleWithdrawal('REQUESTED'),
    makeSampleWithdrawal('BROADCASTED'),
    makeSampleWithdrawal('COMPLETED'),
    makeSampleWithdrawal('REJECTED'),
  ];

  // Single shared row mapper
  const rows = buildWithdrawalHistoryRows(dataset);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].requestedUsdt, '50.00');
  assert.equal(rows[0].totalFeesUsdt, '1.00');
  assert.equal(rows[0].netUsdt, '50.00');

  // Empty state
  const emptyHtml = renderToStaticMarkup(
    React.createElement(WithdrawalHistory, {
      withdrawals: [],
      mode: 'client',
    }),
  );
  assert.match(emptyHtml, /data-testid="withdrawal-history-empty"/);
  assert.match(emptyHtml, /Sin solicitudes de retiro registradas/);

  // Loading state
  const loadingHtml = renderToStaticMarkup(
    React.createElement(WithdrawalHistory, {
      withdrawals: [],
      mode: 'client',
      isLoading: true,
    }),
  );
  assert.match(loadingHtml, /data-testid="withdrawal-history-loading"/);

  // Error state with traceable faultCode
  const errorHtml = renderToStaticMarkup(
    React.createElement(WithdrawalHistory, {
      withdrawals: [],
      mode: 'client',
      errorMessage: 'Fallo al consultar historial',
      errorFaultCode: 'W07-HISTORY_UI-503-UNAVAILABLE',
    }),
  );
  assert.match(errorHtml, /data-testid="withdrawal-history-error"/);
  assert.match(errorHtml, /W07-HISTORY_UI-503-UNAVAILABLE/);

  // Full history renders BOTH responsive views (WithdrawalTable + WithdrawalCards) from same rows
  const clientHistoryHtml = renderToStaticMarkup(
    React.createElement(WithdrawalHistory, {
      withdrawals: dataset,
      mode: 'client',
      hasMore: true,
      onLoadMore: () => {},
      onSelectWithdrawal: () => {},
      networksCatalog: CANONICAL_USDT_NETWORKS,
    }),
  );
  assert.match(clientHistoryHtml, /data-testid="withdrawal-table"/);
  assert.match(clientHistoryHtml, /data-testid="withdrawal-cards"/);
  assert.match(clientHistoryHtml, /data-testid="withdrawal-history-load-more-btn"/);
  // Client mode must NOT expose userEmail column
  assert.doesNotMatch(clientHistoryHtml, /secret\.miner@pouw\.io/);

  // Admin mode renders same components with User column
  const adminHistoryHtml = renderToStaticMarkup(
    React.createElement(WithdrawalHistory, {
      withdrawals: dataset,
      mode: 'admin',
      networksCatalog: CANONICAL_USDT_NETWORKS,
    }),
  );
  assert.match(adminHistoryHtml, /secret\.miner@pouw\.io/);
  assert.match(adminHistoryHtml, /<th>Usuario<\/th>/);
});

test('SCRUM-281 (W06.4): WithdrawalDetailsModal enforces client vs admin operational field separation', () => {
  const richWithdrawal = makeSampleWithdrawal('COMPLETED', {
    internalNotes: 'OPERATIONAL_INTERNAL_NOTE_CONFIDENTIAL',
    reviewedBy: 'admin_uid_reviewer_99',
    approvedBy: 'admin_uid_approver_77',
    providerTransactionId: 'prov_tx_991122',
  });

  // Client mode: hides internalNotes, userEmail, idempotencyKey, reviewedBy/approvedBy
  const clientModalHtml = renderToStaticMarkup(
    React.createElement(WithdrawalDetailsModal, {
      withdrawal: richWithdrawal,
      mode: 'client',
      isOpen: true,
      onClose: () => {},
      networksCatalog: CANONICAL_USDT_NETWORKS,
    }),
  );
  assert.match(clientModalHtml, /data-testid="withdrawal-details-modal"/);
  assert.match(clientModalHtml, /50\.00 USDT/);
  assert.match(clientModalHtml, /https:\/\/bscscan\.com\/tx\/0x/);
  assert.doesNotMatch(clientModalHtml, /OPERATIONAL_INTERNAL_NOTE_CONFIDENTIAL/);
  assert.doesNotMatch(clientModalHtml, /admin_uid_reviewer_99/);
  assert.doesNotMatch(clientModalHtml, /data-testid="withdrawal-details-admin-metadata"/);

  // Admin mode: shows operational metadata & operator trail
  const adminModalHtml = renderToStaticMarkup(
    React.createElement(WithdrawalDetailsModal, {
      withdrawal: richWithdrawal,
      mode: 'admin',
      isOpen: true,
      onClose: () => {},
      networksCatalog: CANONICAL_USDT_NETWORKS,
    }),
  );
  assert.match(adminModalHtml, /data-testid="withdrawal-details-admin-metadata"/);
  assert.match(adminModalHtml, /OPERATIONAL_INTERNAL_NOTE_CONFIDENTIAL/);
  assert.match(adminModalHtml, /admin_uid_reviewer_99/);
  assert.match(adminModalHtml, /prov_tx_991122/);
});

test('SCRUM-281 (W06.5 — Regresión e Integración Acumulada W01..W06 + Paridad Client/Admin + Reglas UI/UX)', () => {
  const sharedFiles = [
    'src/components/withdrawals/WithdrawalStatusBadge.tsx',
    'src/components/withdrawals/WithdrawalAddress.tsx',
    'src/components/withdrawals/WithdrawalTxHash.tsx',
    'src/components/withdrawals/WithdrawalDetailsModal.tsx',
    'src/components/withdrawals/WithdrawalHistory.tsx',
    'src/components/withdrawals/withdrawalShared.css',
  ];

  // 1. Verify W01..W05 immutable hashes in Client worktree (zero regressions)
  const sha256Of = (absPath: string) =>
    crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex').toUpperCase();

  assert.equal(
    sha256Of(path.join(projectRoot, 'src/types/withdrawal.ts')),
    'B5362F9A09B8CBE9EE6DE71D7C3AAAD22EAE69054DB28E86C2E4B19792611B0E',
  );
  assert.equal(
    sha256Of(path.join(projectRoot, 'firestore.indexes.json')),
    '39990B1AA0F47F15652DCC6AA3BE6DC844C78EE4D1D9C9A86925F28CEBE33E9D',
  );
  assert.equal(
    sha256Of(path.join(projectRoot, 'firestore.rules')),
    '3422F1E051904328C791377B6BE4DB34269AFC9AA7D3FF0E00C59677503F6C8C',
  );
  assert.equal(
    sha256Of(path.join(projectRoot, 'src/components/withdrawals/WithdrawalForm.tsx')),
    'D2DC0DA56B2C84865011FB6DB071BC71A7EF0EC914C021765425877AFE889BA0',
  );
  assert.equal(
    sha256Of(path.join(projectRoot, 'src/components/withdrawals/withdrawalForm.css')),
    '49B916AB377507D936CCE7882F9D7213A9F637582AE28F17CD32D5BBD41F139B',
  );

  // 2. Verify byte-for-byte parity between Client worktree and Admin worktree (if sibling exists)
  const adminSiblingRoot = path.resolve(projectRoot, '..', 'retiros-admin-backend');
  const hasAdminSibling = fs.existsSync(adminSiblingRoot);

  for (const rel of sharedFiles) {
    const clientAbs = path.join(projectRoot, rel);
    const content = fs.readFileSync(clientAbs, 'utf8');

    // No emojis anywhere in W06 shared UI
    assert.doesNotMatch(content, /\p{Extended_Pictographic}/u, `${rel} must not contain emojis`);

    // Must not perform any direct API calls or import server-only / W05 form code
    if (rel.endsWith('.tsx')) {
      assert.doesNotMatch(content, /\bfetch\s*\(/, `${rel} must not call fetch() directly`);
      assert.doesNotMatch(content, /WithdrawalForm/, `${rel} must stay decoupled from WithdrawalForm`);
      assert.match(content, /\.\.\/\.\.\/types\/withdrawal\.ts/, `${rel} must consume W01 types`);
    }

    if (hasAdminSibling) {
      const adminAbs = path.join(adminSiblingRoot, rel);
      assert.equal(
        sha256Of(clientAbs),
        sha256Of(adminAbs),
        `${rel} must be byte-identical across Client and Admin worktrees`,
      );
    }
  }

  // 3. Audit CSS craft rules (`emil-design-eng` + `design-taste-frontend`)
  const cssSource = fs.readFileSync(
    path.join(projectRoot, 'src/components/withdrawals/withdrawalShared.css'),
    'utf8',
  );
  assert.doesNotMatch(cssSource, /transition\s*:\s*all\b/i);
  assert.doesNotMatch(cssSource, /\bease-in\b(?!-out)/i);
  assert.match(cssSource, /transform:\s*scale\(0\.97\)/);
  assert.match(cssSource, /cubic-bezier\(0\.23,\s*1,\s*0\.32,\s*1\)/);
  assert.match(cssSource, /font-variant-numeric:\s*tabular-nums/);
  assert.match(cssSource, /@starting-style/);
  assert.match(cssSource, /scale\(0\.95\)/);
  assert.match(cssSource, /@media\s*\(max-width:\s*860px\)/);
  assert.match(cssSource, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
  assert.match(cssSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

  // Confirm shared components are callable
  assert.equal(typeof WithdrawalHistory, 'function');
  assert.equal(typeof WithdrawalTable, 'function');
  assert.equal(typeof WithdrawalCards, 'function');
  assert.equal(typeof WithdrawalDetailsModal, 'function');
  assert.equal(typeof WithdrawalStatusBadge, 'function');
  assert.equal(typeof WithdrawalAddress, 'function');
  assert.equal(typeof WithdrawalTxHash, 'function');
});
