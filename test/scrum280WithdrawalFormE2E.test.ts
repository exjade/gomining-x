/**
 * SCRUM-275 / SCRUM-289 / SCRUM-280 (W05)
 * End-to-End & Cumulative Regression Test Suite (`W01..W05`):
 * - Client `WithdrawalForm.tsx` + `withdrawalForm.css`
 * - Coupled HTTP E2E flow: `GET /api/withdrawals/config` (W03) -> `POST /api/withdrawals/quote` & `MAX` (W03)
 *   -> `POST /api/withdrawals/request` (W04) -> Authoritative refresh (`GET /api/withdrawals/config`)
 * - Traceable Fault Control (`W05-FORM_UI-*`, `W04-LOCK_TX-*`, `W03-QUOTE-*`, `W02-CLIENT_GUARD-*`)
 * - Cross-task contract & connection audit (`W01..W05`) + UI/UX craft audit (`design-taste-frontend` & `emil-design-eng`)
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
  FINANCIAL_LEDGER_COLLECTION,
  MIN_WITHDRAWAL_MICROS,
  SLA_POLICY_BY_MEMBERSHIP,
  USER_BALANCES_COLLECTION,
  WITHDRAWAL_ASSET,
  WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
  WITHDRAWAL_NETWORKS_COLLECTION,
  WITHDRAWAL_REQUESTS_COLLECTION,
  WITHDRAWAL_STATUSES,
  applyAtomicWithdrawalLock,
  calculateMaxWithdrawableMicros,
  calculateWithdrawalQuote,
  formatMicrosAsUsdt,
  isWithdrawalModuleError,
  usdtToMicros,
  type CreateWithdrawalRequestDto,
  type UserFinancialBalance,
  type WithdrawalConfigResponseDto,
  type WithdrawalQuoteRequestDto,
} from '../src/types/withdrawal.ts';
import {
  buildClientWithdrawalAuthHeaders,
  validateClientWithdrawalSession,
  type ClientWithdrawalAuthSession,
} from '../src/services/withdrawals/withdrawalAuthGuard.ts';
import {
  fetchWithdrawalConfig,
  requestMaxWithdrawalQuote,
  requestWithdrawalQuote,
} from '../src/services/withdrawals/withdrawalConfigQuoteClient.ts';
import {
  createWithdrawalIdempotencyKey,
  submitWithdrawalRequest,
} from '../src/services/withdrawals/withdrawalRequestClient.ts';

// Register synchronous loader hooks so Node's native test runner can import `.tsx` and `.css` directly
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

const {
  WithdrawalForm,
  createWithdrawalFormController,
  validateWithdrawalFormInput,
} = await import('../src/components/withdrawals/WithdrawalForm.tsx');

const projectRoot = path.resolve(import.meta.dirname, '..');

function createCoupledW03W04Server(initialAvailableMicros = 100_000_000) {
  let userBalance: UserFinancialBalance = {
    uid: 'user_w05_e2e',
    email: 'w05.miner@pouw.io',
    membershipTier: 'PRO',
    availableBalanceMicros: initialAvailableMicros,
    lockedBalanceMicros: 0,
    totalWithdrawnMicros: 0,
    version: 1,
    updatedAt: '2026-11-18T03:50:00.000Z',
  };

  let configHits = 0;
  let quoteHits = 0;
  let requestHits = 0;
  let artificialRequestDelayMs = 0;

  const idempotencyStore = new Map<string, any>();

  // Enable BSC, Tron, Solana, and Ethereum (leave Polygon disabled to prove dynamic filtering)
  const dynamicNetworks = CANONICAL_USDT_NETWORKS.map((net) =>
    net.id === 'usdt-polygon' ? { ...net, enabled: false } : { ...net, enabled: true },
  );

  const server = http.createServer(async (req, res) => {
    const authHeader = req.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer token_w05_valid')) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: false,
          faultCode: 'W02-AUTHZ-401-UNAUTHENTICATED',
          originTask: 'W02',
          originModule: 'AUTHZ',
          code: 'UNAUTHENTICATED',
          error: 'Token inválido.',
        }),
      );
      return;
    }

    const readJson = async (): Promise<Record<string, unknown>> => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    };

    if (req.method === 'GET' && req.url === '/api/withdrawals/config') {
      configHits += 1;
      const enabledOnly = dynamicNetworks.filter((n) => n.enabled);
      const payload: WithdrawalConfigResponseDto = {
        ok: true,
        asset: WITHDRAWAL_ASSET,
        minimumWithdrawalMicros: MIN_WITHDRAWAL_MICROS,
        minimumWithdrawalUsdt: 10,
        networks: enabledOnly,
        userBalance: {
          uid: userBalance.uid,
          availableBalanceMicros: userBalance.availableBalanceMicros,
          lockedBalanceMicros: userBalance.lockedBalanceMicros,
          totalWithdrawnMicros: userBalance.totalWithdrawnMicros,
          availableBalanceUsdt: Number(
            formatMicrosAsUsdt(userBalance.availableBalanceMicros, 6),
          ),
          membershipTier: userBalance.membershipTier,
        },
        slaPolicy: SLA_POLICY_BY_MEMBERSHIP[userBalance.membershipTier],
      };
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/withdrawals/quote') {
      quoteHits += 1;
      const body = (await readJson()) as unknown as WithdrawalQuoteRequestDto;
      const net = dynamicNetworks.find((n) => n.id === body.networkId && n.enabled);
      if (!net) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: false,
            faultCode: 'W03-QUOTE-404-NETWORK_NOT_ENABLED',
            originTask: 'W03',
            originModule: 'QUOTE',
            code: 'NETWORK_NOT_ENABLED',
            error: 'Red USDT no habilitada.',
          }),
        );
        return;
      }

      const quote =
        body.mode === 'MAX_AVAILABLE'
          ? calculateMaxWithdrawableMicros(userBalance.availableBalanceMicros, net)
          : calculateWithdrawalQuote(
              Number(body.requestedAmountMicros ?? 0),
              net,
              userBalance.availableBalanceMicros,
            );

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          quote: {
            ...quote,
            slaPolicy: SLA_POLICY_BY_MEMBERSHIP[userBalance.membershipTier],
          },
        }),
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/api/withdrawals/request') {
      requestHits += 1;
      if (artificialRequestDelayMs > 0) {
        await new Promise((r) => setTimeout(r, artificialRequestDelayMs));
      }
      const body = (await readJson()) as unknown as CreateWithdrawalRequestDto;
      const existing = idempotencyStore.get(body.idempotencyKey);
      if (existing) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ...existing, status: 200, idempotentReplay: true }));
        return;
      }

      const net = dynamicNetworks.find((n) => n.id === body.networkId && n.enabled);
      if (!net) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: false,
            faultCode: 'W04-LOCK_TX-404-NETWORK_NOT_ENABLED',
            originTask: 'W04',
            originModule: 'LOCK_TX',
            code: 'NETWORK_NOT_ENABLED',
            error: 'Red no habilitada.',
          }),
        );
        return;
      }

      try {
        const lockResult = applyAtomicWithdrawalLock(userBalance, body, net, {
          withdrawalId: `wth_w05_${requestHits}`,
          ledgerEntryId: `ldg_w05_${requestHits}`,
          auditEventId: `aud_w05_${requestHits}`,
          nowIso: '2026-11-18T03:55:00.000Z',
        });
        userBalance = lockResult.updatedBalance;

        const responsePayload = {
          ok: true as const,
          status: 201 as const,
          idempotentReplay: false,
          withdrawalRequest: lockResult.withdrawalRequest,
          userBalance: lockResult.updatedBalance,
          syncedUserBalanceUsdt: lockResult.syncedUserBalanceUsdt,
          ledgerEntry: lockResult.ledgerEntry,
          auditEvent: lockResult.auditEvent,
          ledgerEntryId: lockResult.ledgerEntry.id,
          auditEventId: lockResult.auditEvent.id,
        };
        idempotencyStore.set(body.idempotencyKey, responsePayload);

        res.statusCode = 201;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(responsePayload));
      } catch (err) {
        const status = isWithdrawalModuleError(err) ? (err.httpStatus ?? 422) : 500;
        const code = isWithdrawalModuleError(err) ? err.code : 'INTERNAL_ERROR';
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: false,
            faultCode: `W04-LOCK_TX-${status}-${code}`,
            originTask: 'W04',
            originModule: 'LOCK_TX',
            code,
            error: err instanceof Error ? err.message : 'Error',
          }),
        );
      }
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  return {
    server,
    getStats: () => ({ configHits, quoteHits, requestHits, userBalance }),
    setArtificialRequestDelayMs: (ms: number) => {
      artificialRequestDelayMs = ms;
    },
  };
}

test('SCRUM-280 (W05.1): Dynamic network loading from /config (no hardcoded BEP-20) and SSR markup verification of <WithdrawalForm />', async () => {
  const { server } = createCoupledW03W04Server(125_500_000); // 125.50 USDT
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const session: ClientWithdrawalAuthSession = {
      uid: 'user_w05_e2e',
      email: 'w05.miner@pouw.io',
      isAnonymous: false,
      idToken: 'token_w05_valid',
    };

    const controller = createWithdrawalFormController({
      session,
      apiOptions: { baseUrl },
      connectedWalletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    });

    const config = await controller.loadConfig();
    const snap = controller.getSnapshot();

    // Polygon was disabled on the server -> must only list the 4 enabled networks dynamically
    assert.equal(snap.enabledNetworks.length, 4);
    assert.equal(
      snap.enabledNetworks.some((n) => n.id === 'usdt-polygon'),
      false,
      'Disabled networks must never appear in the selector',
    );
    assert.deepEqual(
      snap.enabledNetworks.map((n) => n.id),
      ['usdt-bsc', 'usdt-tron', 'usdt-solana', 'usdt-ethereum'],
    );

    // Render `<WithdrawalForm />` via React SSR and verify all required SCRUM-280 / SCRUM-289 UI elements
    const html = renderToStaticMarkup(
      React.createElement(WithdrawalForm, {
        session,
        apiOptions: { baseUrl },
        connectedWalletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        initialConfig: config,
        autoLoadConfig: false,
      }),
    );

    assert.match(html, /data-testid="withdrawal-form-shell"/);
    assert.match(html, /125\.50/); // Available balance
    assert.match(html, /Prioridad PRO: 1 a 5 horas \(Prioridad Membresía PRO\)/);
    assert.match(html, /data-testid="withdrawal-network-option-usdt-bsc"/);
    assert.match(html, /data-testid="withdrawal-network-option-usdt-tron"/);
    assert.match(html, /data-testid="withdrawal-network-option-usdt-solana"/);
    assert.match(html, /data-testid="withdrawal-network-option-usdt-ethereum"/);
    assert.doesNotMatch(html, /data-testid="withdrawal-network-option-usdt-polygon"/);
    assert.match(html, /data-testid="withdrawal-prefill-wallet-btn"/);
    assert.match(html, /Usar wallet conectada \(0x71C7\.\.\.976F\)/);
    assert.match(html, /data-testid="withdrawal-max-btn"/);
    assert.match(html, /data-testid="quote-requested-amount"/);
    assert.match(html, /data-testid="quote-network-fee"/);
    assert.match(html, /data-testid="quote-platform-fee"/);
    assert.match(html, /data-testid="quote-conversion-fee"/);
    assert.match(html, /data-testid="quote-total-fees"/);
    assert.match(html, /data-testid="quote-total-debit"/);
    assert.match(html, /data-testid="quote-net-amount"/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('SCRUM-280 (W05.2): UX validations emit traceable W05-FORM_UI-* fault codes and support connected-wallet prefill + manual editing', async () => {
  const bscNet = CANONICAL_USDT_NETWORKS.find((n) => n.id === 'usdt-bsc')!;
  const tronNet = CANONICAL_USDT_NETWORKS.find((n) => n.id === 'usdt-tron')!;

  // 1. Missing network -> W05-FORM_UI-400-NETWORK_REQUIRED
  const noNetCheck = validateWithdrawalFormInput({
    selectedNetwork: null,
    destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    amountUsdtInput: '25.00',
    availableBalanceMicros: 100_000_000,
  });
  assert.equal(noNetCheck.valid, false);
  assert.equal(noNetCheck.faultCode, 'W05-FORM_UI-400-NETWORK_REQUIRED');

  // 2. Empty address -> W05-FORM_UI-400-ADDRESS_REQUIRED
  const noAddrCheck = validateWithdrawalFormInput({
    selectedNetwork: bscNet,
    destinationAddress: '   ',
    amountUsdtInput: '25.00',
    availableBalanceMicros: 100_000_000,
  });
  assert.equal(noAddrCheck.valid, false);
  assert.equal(noAddrCheck.faultCode, 'W05-FORM_UI-400-ADDRESS_REQUIRED');

  // 3. Invalid address for selected network (EVM address on TRON network) -> W05-FORM_UI-422-INVALID_DESTINATION_ADDRESS
  const wrongNetAddrCheck = validateWithdrawalFormInput({
    selectedNetwork: tronNet,
    destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    amountUsdtInput: '25.00',
    availableBalanceMicros: 100_000_000,
  });
  assert.equal(wrongNetAddrCheck.valid, false);
  assert.equal(wrongNetAddrCheck.faultCode, 'W05-FORM_UI-422-INVALID_DESTINATION_ADDRESS');

  // 4. Empty or malformed amount -> W05-FORM_UI-400-AMOUNT_REQUIRED
  const badAmountCheck = validateWithdrawalFormInput({
    selectedNetwork: bscNet,
    destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    amountUsdtInput: 'abc',
    availableBalanceMicros: 100_000_000,
  });
  assert.equal(badAmountCheck.valid, false);
  assert.equal(badAmountCheck.faultCode, 'W05-FORM_UI-400-AMOUNT_REQUIRED');

  // 5. Below 10 USDT minimum -> W05-FORM_UI-422-MINIMUM_WITHDRAWAL_NOT_MET
  const belowMinCheck = validateWithdrawalFormInput({
    selectedNetwork: bscNet,
    destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    amountUsdtInput: '9.99',
    availableBalanceMicros: 100_000_000,
  });
  assert.equal(belowMinCheck.valid, false);
  assert.equal(belowMinCheck.faultCode, 'W05-FORM_UI-422-MINIMUM_WITHDRAWAL_NOT_MET');

  // 6. Exceeds available balance -> W05-FORM_UI-422-INSUFFICIENT_AVAILABLE_BALANCE
  const overBalanceCheck = validateWithdrawalFormInput({
    selectedNetwork: bscNet,
    destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    amountUsdtInput: '99.50',
    availableBalanceMicros: 100_000_000,
    activeQuote: calculateWithdrawalQuote(99_500_000, bscNet, 100_000_000),
  });
  assert.equal(overBalanceCheck.valid, false);
  assert.equal(overBalanceCheck.faultCode, 'W05-FORM_UI-422-INSUFFICIENT_AVAILABLE_BALANCE');

  // 7. Connected wallet prefill is optional and always editable
  const controller = createWithdrawalFormController({
    session: {
      uid: 'user_w05_e2e',
      email: 'w05.miner@pouw.io',
      isAnonymous: false,
      idToken: 'token_w05_valid',
    },
    connectedWalletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
  });
  controller.prefillConnectedWallet();
  assert.equal(
    controller.getSnapshot().destinationAddress,
    '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
  );
  assert.equal(controller.getSnapshot().addressPrefilledFromWallet, true);

  // User manually edits the prefilled wallet to another address
  controller.setDestinationAddress('0x1111111111111111111111111111111111111111');
  assert.equal(
    controller.getSnapshot().destinationAddress,
    '0x1111111111111111111111111111111111111111',
  );
  assert.equal(controller.getSnapshot().addressPrefilledFromWallet, false);
});

test('SCRUM-280 (W05.3): Authoritative quote (EXACT_AMOUNT) and MAX button (MAX_AVAILABLE) respect balance and network fees across networks', async () => {
  const { server } = createCoupledW03W04Server(100_000_000); // 100.00 USDT
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const session: ClientWithdrawalAuthSession = {
      uid: 'user_w05_e2e',
      email: 'w05.miner@pouw.io',
      isAnonymous: false,
      idToken: 'token_w05_valid',
    };

    const controller = createWithdrawalFormController({
      session,
      apiOptions: { baseUrl },
    });
    await controller.loadConfig();

    // 1. Exact amount quote on BSC (50.00 USDT -> 0.50 network fee + 0.50 platform fee = 51.00 totalDebit)
    const exactQuote = await controller.setAmountUsdt('50.00');
    assert.ok(exactQuote);
    assert.equal(exactQuote.requestedAmountMicros, 50_000_000);
    assert.equal(exactQuote.networkFeeMicros, 500_000);
    assert.equal(exactQuote.platformFeeMicros, 500_000);
    assert.equal(exactQuote.totalFeesMicros, 1_000_000);
    assert.equal(exactQuote.totalDebitMicros, 51_000_000);
    assert.equal(exactQuote.netAmountMicros, 50_000_000);

    // 2. MAX button on BSC (100.00 USDT available -> max requested 98.514851 USDT, formatted 98.51 USDT)
    const maxBscQuote = await controller.applyMaxQuote();
    assert.ok(maxBscQuote.totalDebitMicros <= 100_000_000);
    assert.equal(controller.getSnapshot().amountUsdtInput, '98.51');
    assert.equal(maxBscQuote.withinAvailableBalance, true);

    // 3. Switch to Ethereum (3.50 USDT network fee + 1% platform fee) and click MAX
    await controller.selectNetwork('usdt-ethereum');
    const maxEthQuote = await controller.applyMaxQuote();
    assert.equal(maxEthQuote.networkId, 'usdt-ethereum');
    assert.equal(maxEthQuote.networkFeeMicros, 3_500_000);
    assert.ok(maxEthQuote.totalDebitMicros <= 100_000_000);
    assert.equal(controller.getSnapshot().amountUsdtInput, '95.54');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('SCRUM-280 (W05.4): Submit calls W04 endpoint, blocks double-click concurrent submits, and refreshes authoritative balance from backend', async () => {
  const { server, getStats, setArtificialRequestDelayMs } =
    createCoupledW03W04Server(100_000_000); // 100.00 USDT
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const session: ClientWithdrawalAuthSession = {
      uid: 'user_w05_e2e',
      email: 'w05.miner@pouw.io',
      isAnonymous: false,
      idToken: 'token_w05_valid',
    };

    let successCallbackCount = 0;
    let refreshedAvailableFromCallback = -1;

    const controller = createWithdrawalFormController({
      session,
      apiOptions: { baseUrl },
      onWithdrawalSuccess: (_response, refreshedConfig) => {
        successCallbackCount += 1;
        refreshedAvailableFromCallback =
          refreshedConfig?.userBalance.availableBalanceMicros ?? -1;
      },
    });

    await controller.loadConfig();
    controller.setDestinationAddress('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');
    await controller.setAmountUsdt('40.00'); // 40.00 + 0.50 net + 0.40 platform = 40.90 USDT (40_900_000 micros)

    // Add 40ms delay on POST /request to test double-click protection in flight
    setArtificialRequestDelayMs(40);

    const firstSubmitPromise = controller.submit();

    // Second click while first is in flight must fail closed with W05-FORM_UI-409-SUBMIT_ALREADY_IN_FLIGHT
    await assert.rejects(
      async () => controller.submit(),
      (err: unknown) => {
        assert.ok(isWithdrawalModuleError(err));
        assert.equal(err.faultCode, 'W05-FORM_UI-409-SUBMIT_ALREADY_IN_FLIGHT');
        return true;
      },
    );

    const submitResult = await firstSubmitPromise;
    assert.equal(submitResult.status, 201);
    assert.equal(submitResult.withdrawalRequest.status, 'REQUESTED');
    assert.equal(submitResult.withdrawalRequest.requestedAmountMicros, 40_000_000);
    assert.equal(submitResult.withdrawalRequest.totalDebitMicros, 40_900_000);
    assert.equal(submitResult.withdrawalRequest.netAmountMicros, 40_000_000);

    const stats = getStats();
    // Only 1 request hit the backend despite the double click!
    assert.equal(stats.requestHits, 1);
    // Config was fetched on initial loadConfig() AND refreshed on submit success
    assert.equal(stats.configHits, 2);

    // Authoritative balance refreshed from backend: 100.00 - 40.90 = 59.10 USDT (59_100_000 micros)
    const finalSnap = controller.getSnapshot();
    assert.equal(finalSnap.config?.userBalance.availableBalanceMicros, 59_100_000);
    assert.equal(finalSnap.config?.userBalance.lockedBalanceMicros, 40_900_000);
    assert.equal(successCallbackCount, 1);
    assert.equal(refreshedAvailableFromCallback, 59_100_000);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('SCRUM-280 (W05.5 — Regresión e Integración Acumulada W01..W05 + Reglas UI/UX design-taste-frontend y emil-design-eng)', () => {
  const formSource = fs.readFileSync(
    path.join(projectRoot, 'src/components/withdrawals/WithdrawalForm.tsx'),
    'utf8',
  );
  const cssSource = fs.readFileSync(
    path.join(projectRoot, 'src/components/withdrawals/withdrawalForm.css'),
    'utf8',
  );
  const configQuoteSource = fs.readFileSync(
    path.join(projectRoot, 'src/services/withdrawals/withdrawalConfigQuoteClient.ts'),
    'utf8',
  );
  const requestClientSource = fs.readFileSync(
    path.join(projectRoot, 'src/services/withdrawals/withdrawalRequestClient.ts'),
    'utf8',
  );

  // 1. Audit W01..W04 immutable file hashes in Client worktree (zero regression on approved foundation)
  const sha256Of = (relPath: string) =>
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(projectRoot, relPath)))
      .digest('hex')
      .toUpperCase();

  assert.equal(
    sha256Of('src/types/withdrawal.ts'),
    'B5362F9A09B8CBE9EE6DE71D7C3AAAD22EAE69054DB28E86C2E4B19792611B0E',
    'W01 src/types/withdrawal.ts must remain byte-identical',
  );
  assert.equal(
    sha256Of('firestore.indexes.json'),
    '39990B1AA0F47F15652DCC6AA3BE6DC844C78EE4D1D9C9A86925F28CEBE33E9D',
    'W01 firestore.indexes.json must remain byte-identical',
  );
  assert.equal(
    sha256Of('firestore.rules'),
    '02FB0892E381A8AD42C89910A610FFCFD37B708FF978E6CC3862020EE36460CD',
    'W02 firestore.rules must remain byte-identical',
  );
  assert.equal(
    sha256Of('src/services/withdrawals/withdrawalAuthGuard.ts'),
    'F3C73ED2D92D42BD26FF960A1CFE497AD75E27557E713AB67AC277237606AD71',
    'W02 withdrawalAuthGuard.ts must remain byte-identical',
  );
  assert.equal(
    sha256Of('src/services/withdrawals/withdrawalConfigQuoteClient.ts'),
    '507EEC03FB33E617F44BCDA469EAC3176BC995FE167A56C22B3339B6CDB864F4',
    'W03 withdrawalConfigQuoteClient.ts must remain byte-identical',
  );
  assert.equal(
    sha256Of('src/services/withdrawals/withdrawalRequestClient.ts'),
    'AF5243784C278CB0340A4E42E014E95D4A7D262BD0ECAF2F7AB257F23099584B',
    'W04 withdrawalRequestClient.ts must remain byte-identical',
  );

  // 2. Audit W05 connections to W01, W02, W03, W04 imports, states, collections & endpoints
  assert.match(formSource, /from '\.\.\/\.\.\/types\/withdrawal\.ts'/);
  assert.match(
    formSource,
    /from '\.\.\/\.\.\/services\/withdrawals\/withdrawalAuthGuard\.ts'/,
  );
  assert.match(
    formSource,
    /from '\.\.\/\.\.\/services\/withdrawals\/withdrawalConfigQuoteClient\.ts'/,
  );
  assert.match(
    formSource,
    /from '\.\.\/\.\.\/services\/withdrawals\/withdrawalRequestClient\.ts'/,
  );

  assert.deepEqual(WITHDRAWAL_STATUSES, [
    'REQUESTED',
    'UNDER_REVIEW',
    'APPROVED',
    'PROCESSING',
    'BROADCASTED',
    'COMPLETED',
    'REJECTED',
    'CANCELLED',
  ]);
  assert.deepEqual(
    {
      userBalances: USER_BALANCES_COLLECTION,
      withdrawalNetworks: WITHDRAWAL_NETWORKS_COLLECTION,
      withdrawalRequests: WITHDRAWAL_REQUESTS_COLLECTION,
      financialLedger: FINANCIAL_LEDGER_COLLECTION,
      withdrawalAuditEvents: WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
    },
    {
      userBalances: 'userBalances',
      withdrawalNetworks: 'withdrawalNetworks',
      withdrawalRequests: 'withdrawalRequests',
      financialLedger: 'financialLedger',
      withdrawalAuditEvents: 'withdrawalAuditEvents',
    },
  );

  // Endpoints wired in W03 & W04 and consumed by W05
  assert.match(configQuoteSource, /\/api\/withdrawals\/config/);
  assert.match(configQuoteSource, /\/api\/withdrawals\/quote/);
  assert.match(requestClientSource, /\/api\/withdrawals\/request/);

  // Confirm runtime exports from W01..W04 are callable functions
  assert.equal(typeof usdtToMicros, 'function');
  assert.equal(typeof validateClientWithdrawalSession, 'function');
  assert.equal(typeof buildClientWithdrawalAuthHeaders, 'function');
  assert.equal(typeof fetchWithdrawalConfig, 'function');
  assert.equal(typeof requestWithdrawalQuote, 'function');
  assert.equal(typeof requestMaxWithdrawalQuote, 'function');
  assert.equal(typeof submitWithdrawalRequest, 'function');
  assert.equal(typeof createWithdrawalIdempotencyKey, 'function');

  // 3. Audit `design-taste-frontend` anti-emoji rule (ZERO emojis in code or markup)
  assert.doesNotMatch(
    formSource,
    /\p{Extended_Pictographic}/u,
    'WithdrawalForm.tsx must not contain any emojis',
  );

  // 4. Audit `emil-design-eng` craft rules on withdrawalForm.css:
  // - No `transition: all`
  // - No `ease-in` (only custom cubic-bezier ease-out / ease-in-out)
  // - Tactile `:active` with `transform: scale(0.97)`
  // - `font-variant-numeric: tabular-nums` for zero layout shift (CLS = 0)
  // - `@media (hover: hover) and (pointer: fine)` and `@media (prefers-reduced-motion: reduce)`
  assert.doesNotMatch(cssSource, /transition\s*:\s*all\b/i);
  assert.doesNotMatch(cssSource, /\bease-in\b(?!-out)/i);
  assert.match(cssSource, /transform:\s*scale\(0\.97\)/);
  assert.match(cssSource, /cubic-bezier\(0\.23,\s*1,\s*0\.32,\s*1\)/);
  assert.match(cssSource, /font-variant-numeric:\s*tabular-nums/);
  assert.match(cssSource, /@media\s*\(max-width:\s*860px\)/);
  assert.match(cssSource, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
  assert.match(cssSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
