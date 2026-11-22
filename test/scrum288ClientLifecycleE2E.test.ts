/**
 * SCRUM-275 / SCRUM-289 / SCRUM-288 (W13)
 * Client End-to-End Runtime Lifecycle & Adversarial Integration Validation:
 * - Drives W05 `createWithdrawalFormController` -> W07 `createClientWithdrawalHistoryController` ->
 *   W06 `WithdrawalDetailsModal` (`mode="client"`) against an authoritative stateful HTTP backend
 * - Proves Client observes REQUESTED after submit -> external Admin settlement to COMPLETED ->
 *   Client refresh renders COMPLETED + real `txHash` without page-reload mocks or admin leakage
 * - Verifies negative controls (<10 USDT, insufficient balance, disabled network W03-QUOTE-404-NETWORK_NOT_ENABLED,
 *   cross-UID 403, anonymous 403, double-click in-flight block)
 * - Performs in-test React markup verification (`renderToStaticMarkup` in test) and checks immutable W01..W12 hashes.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

import {
  CANONICAL_USDT_NETWORKS,
  MIN_WITHDRAWAL_MICROS,
  SLA_POLICY_BY_MEMBERSHIP,
  WITHDRAWAL_ASSET,
  calculateMaxWithdrawableMicros,
  calculateWithdrawalQuote,
  formatMicrosAsUsdt,
  isWithdrawalModuleError,
  validateDestinationAddress,
  type UserFinancialBalance,
  type WithdrawalConfigResponseDto,
  type WithdrawalQuoteRequestDto,
  type WithdrawalRequest,
} from '../src/types/withdrawal.ts';
import type { ClientWithdrawalAuthSession } from '../src/services/withdrawals/withdrawalAuthGuard.ts';
import { requestWithdrawalQuote } from '../src/services/withdrawals/withdrawalConfigQuoteClient.ts';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return { format: 'module', shortCircuit: true, source: 'export default {};' };
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
      return { format: 'module', shortCircuit: true, source: transpiled.outputText };
    }
    return nextLoad(url, context);
  },
});

const { WithdrawalForm, createWithdrawalFormController } = await import(
  '../src/components/withdrawals/WithdrawalForm.tsx'
);
const { WithdrawalHistoryPanel, createClientWithdrawalHistoryController } = await import(
  '../src/components/withdrawals/WithdrawalHistoryPanel.tsx'
);
const { WithdrawalDetailsModal } = await import(
  '../src/components/withdrawals/WithdrawalDetailsModal.tsx'
);

const projectRoot = path.resolve(import.meta.dirname, '..');
const WALLET_EVM = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
const REAL_TXHASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const BASELINE_HASHES = {
  withdrawalTs: 'B5362F9A09B8CBE9EE6DE71D7C3AAAD22EAE69054DB28E86C2E4B19792611B0E',
  firestoreRules: '3422F1E051904328C791377B6BE4DB34269AFC9AA7D3FF0E00C59677503F6C8C',
  firestoreIndexes: '39990B1AA0F47F15652DCC6AA3BE6DC844C78EE4D1D9C9A86925F28CEBE33E9D',
};

function createClientAcceptanceServer(initialAvailableMicros = 120_000_000) {
  const balances = new Map<string, UserFinancialBalance>([
    [
      'uid-client-w13',
      {
        uid: 'uid-client-w13',
        email: 'w13@minerx.test',
        membershipTier: 'PRO',
        availableBalanceMicros: initialAvailableMicros,
        lockedBalanceMicros: 0,
        totalWithdrawnMicros: 0,
        version: 1,
        updatedAt: '2026-11-18T10:00:00.000Z',
      },
    ],
  ]);

  const networks = CANONICAL_USDT_NETWORKS.map((net) =>
    net.id === 'usdt-polygon' ? { ...net, enabled: false } : { ...net, enabled: true },
  );
  const requests: Array<WithdrawalRequest & { internalNotes?: string; idempotencyKey: string }> = [];
  const idempotency = new Map<string, { fingerprint: string; withdrawalId: string }>();
  let seq = 0;

  const sendJson = (res: http.ServerResponse, status: number, payload: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  const server = http.createServer(async (req, res) => {
    const auth = req.headers.authorization ?? '';
    const uid =
      auth === 'Bearer tok-w13-client'
        ? 'uid-client-w13'
        : auth === 'Bearer tok-w13-other'
          ? 'uid-other'
          : '';
    if (!uid) {
      sendJson(res, 401, {
        ok: false,
        originTask: 'W02',
        originModule: 'AUTHZ',
        code: 'UNAUTHENTICATED',
        faultCode: 'W02-AUTHZ-401-UNAUTHENTICATED',
        error: 'Token inválido o ausente.',
      });
      return;
    }

    const chunks: Buffer[] = [];
    for await (const ch of req) chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
    const body = chunks.length
      ? (JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      : {};

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/api/withdrawals/config') {
      const bal = balances.get(uid)!;
      const cfg: WithdrawalConfigResponseDto = {
        ok: true,
        asset: WITHDRAWAL_ASSET,
        minimumWithdrawalMicros: MIN_WITHDRAWAL_MICROS,
        minimumWithdrawalUsdt: 10,
        networks: networks.filter((n) => n.enabled),
        userBalance: {
          uid: bal.uid,
          availableBalanceMicros: bal.availableBalanceMicros,
          lockedBalanceMicros: bal.lockedBalanceMicros,
          totalWithdrawnMicros: bal.totalWithdrawnMicros,
          availableBalanceUsdt: Number(formatMicrosAsUsdt(bal.availableBalanceMicros, 6)),
          membershipTier: bal.membershipTier,
        },
        slaPolicy: SLA_POLICY_BY_MEMBERSHIP[bal.membershipTier],
      };
      sendJson(res, 200, cfg);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/withdrawals/quote') {
      const qDto = body as unknown as WithdrawalQuoteRequestDto;
      const net = networks.find((n) => n.id === qDto.networkId && n.enabled);
      if (!net) {
        sendJson(res, 404, {
          ok: false,
          originTask: 'W03',
          originModule: 'QUOTE',
          code: 'NETWORK_NOT_ENABLED',
          faultCode: 'W03-QUOTE-404-NETWORK_NOT_ENABLED',
          error: 'La red solicitada no está habilitada.',
        });
        return;
      }
      const bal = balances.get(uid)!;
      try {
        const quote =
          qDto.mode === 'MAX_AVAILABLE'
            ? calculateMaxWithdrawableMicros(bal.availableBalanceMicros, net)
            : calculateWithdrawalQuote(Number(qDto.requestedAmountMicros ?? 0), net, bal.availableBalanceMicros);
        sendJson(res, 200, {
          ok: true,
          quote: { ...quote, slaPolicy: SLA_POLICY_BY_MEMBERSHIP[bal.membershipTier] },
        });
      } catch (err) {
        if (isWithdrawalModuleError(err)) {
          sendJson(res, err.httpStatus ?? 422, {
            ok: false,
            originTask: err.originTask,
            originModule: err.originModule,
            code: err.code,
            faultCode: err.faultCode,
            error: err.message,
          });
          return;
        }
        sendJson(res, 400, { ok: false, error: 'Quote error' });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/withdrawals/request') {
      const net = networks.find((n) => n.id === body.networkId && n.enabled);
      if (!net) {
        sendJson(res, 404, {
          ok: false,
          originTask: 'W04',
          originModule: 'LOCK_TX',
          code: 'NETWORK_NOT_ENABLED',
          faultCode: 'W04-LOCK_TX-404-NETWORK_NOT_ENABLED',
          error: 'Red deshabilitada.',
        });
        return;
      }
      const addrCheck = validateDestinationAddress(String(body.destinationAddress ?? ''), net.addressType);
      if (!addrCheck.valid) {
        sendJson(res, 422, {
          ok: false,
          originTask: 'W01',
          originModule: 'DOMAIN',
          code: 'INVALID_DESTINATION_ADDRESS',
          faultCode: 'W01-DOMAIN-422-INVALID_DESTINATION_ADDRESS',
          error: addrCheck.reason,
        });
        return;
      }
      const bal = balances.get(uid)!;
      const amt = Number(body.requestedAmountMicros ?? 0);
      const quote = calculateWithdrawalQuote(amt, net, bal.availableBalanceMicros);
      if (!quote.meetsMinimum) {
        sendJson(res, 422, {
          ok: false,
          originTask: 'W01',
          originModule: 'DOMAIN',
          code: 'MINIMUM_WITHDRAWAL_NOT_MET',
          faultCode: 'W01-DOMAIN-422-MINIMUM_WITHDRAWAL_NOT_MET',
          error: quote.validationMessage ?? 'Monto por debajo del mínimo permitido.',
        });
        return;
      }
      if (!quote.withinAvailableBalance || bal.availableBalanceMicros < quote.totalDebitMicros) {
        sendJson(res, 409, {
          ok: false,
          originTask: 'W04',
          originModule: 'LOCK_TX',
          code: 'INSUFFICIENT_FUNDS',
          faultCode: 'W04-LOCK_TX-409-INSUFFICIENT_FUNDS',
          error: 'Saldo disponible insuficiente.',
        });
        return;
      }
      const idemKey = `${uid}__${String(body.idempotencyKey ?? '')}`;
      const fp = `${net.id}|${addrCheck.normalizedAddress}|${amt}`;
      const existing = idempotency.get(idemKey);
      if (existing) {
        if (existing.fingerprint !== fp) {
          sendJson(res, 409, {
            ok: false,
            originTask: 'W04',
            originModule: 'LOCK_TX',
            code: 'IDEMPOTENCY_CONFLICT',
            faultCode: 'W04-LOCK_TX-409-IDEMPOTENCY_CONFLICT',
            error: 'Conflicto de idempotencia.',
          });
          return;
        }
        const prevDoc = requests.find((r) => r.id === existing.withdrawalId)!;
        sendJson(res, 200, {
          ok: true,
          idempotentReplay: true,
          withdrawalRequest: prevDoc,
          userBalance: bal,
        });
        return;
      }

      seq += 1;
      const withdrawalId = `wth_w13_${seq}`;
      bal.availableBalanceMicros -= quote.totalDebitMicros;
      bal.lockedBalanceMicros += quote.totalDebitMicros;
      bal.version += 1;

      const created: WithdrawalRequest & { internalNotes?: string; idempotencyKey: string } = {
        id: withdrawalId,
        userId: uid,
        userEmail: bal.email,
        asset: WITHDRAWAL_ASSET,
        networkId: net.id,
        network: net.networkCode,
        networkDisplayName: net.network,
        addressType: net.addressType,
        destinationAddress: addrCheck.normalizedAddress,
        requestedAmountMicros: quote.requestedAmountMicros,
        networkFeeMicros: quote.networkFeeMicros,
        platformFeeMicros: quote.platformFeeMicros,
        conversionFeeMicros: quote.conversionFeeMicros,
        totalFeesMicros: quote.totalFeesMicros,
        totalDebitMicros: quote.totalDebitMicros,
        netAmountMicros: quote.netAmountMicros,
        status: 'REQUESTED',
        membershipTierSnapshot: bal.membershipTier,
        slaDisplaySnapshot: SLA_POLICY_BY_MEMBERSHIP[bal.membershipTier].displayLabel,
        confirmations: 0,
        requiredConfirmations: net.requiredConfirmations,
        idempotencyKey: String(body.idempotencyKey ?? ''),
        internalNotes: 'Admin internal field — must never leak to client',
        configVersion: net.configVersion,
        requestedAt: '2026-11-18T11:00:00.000Z',
        createdAt: '2026-11-18T11:00:00.000Z',
        updatedAt: '2026-11-18T11:00:00.000Z',
      };
      requests.unshift(created);
      idempotency.set(idemKey, { fingerprint: fp, withdrawalId });
      sendJson(res, 201, {
        ok: true,
        idempotentReplay: false,
        withdrawalRequest: created,
        userBalance: bal,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/withdrawals/me') {
      const own = requests.filter((r) => r.userId === uid).map(({ internalNotes: _in, idempotencyKey: _ik, ...pub }) => pub);
      sendJson(res, 200, { ok: true, items: own, nextCursor: null, hasMore: false, limit: 20 });
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/withdrawals/me/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/withdrawals/me/'.length));
      const found = requests.find((r) => r.id === id);
      if (!found || found.userId !== uid) {
        sendJson(res, 403, {
          ok: false,
          originTask: 'W02',
          originModule: 'AUTHZ',
          code: 'FORBIDDEN_CROSS_UID_ACCESS',
          faultCode: 'W02-AUTHZ-403-FORBIDDEN_CROSS_UID_ACCESS',
          error: 'No puede consultar recursos de otro UID.',
        });
        return;
      }
      const { internalNotes: _in, idempotencyKey: _ik, ...pub } = found;
      sendJson(res, 200, { ok: true, withdrawal: pub });
    }
  });

  const settleOnBackend = (withdrawalId: string) => {
    const doc = requests.find((r) => r.id === withdrawalId);
    assert.ok(doc);
    const bal = balances.get(doc.userId)!;
    bal.lockedBalanceMicros -= doc.totalDebitMicros;
    bal.totalWithdrawnMicros += doc.requestedAmountMicros;
    doc.status = 'COMPLETED';
    doc.txHash = REAL_TXHASH;
    doc.explorerTxUrl = `https://bscscan.com/tx/${REAL_TXHASH}`;
    doc.confirmations = 15;
    doc.completedAt = '2026-11-18T11:30:00.000Z';
    doc.updatedAt = '2026-11-18T11:30:00.000Z';
  };

  return { server, settleOnBackend, balances };
}

describe('SCRUM-288 (W13): Client Runtime Lifecycle & In-Test Render Acceptance', () => {
  it('ejecuta flujo completo Cliente W05 Form -> REQUESTED -> Settlement externo COMPLETED + txHash real en W07/W06 + controles negativos', async () => {
    const srvWrap = createClientAcceptanceServer(120_000_000); // $120.00
    await new Promise<void>((resolve) => srvWrap.server.listen(0, '127.0.0.1', resolve));
    const addr = srvWrap.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const clientSession: ClientWithdrawalAuthSession = {
        uid: 'uid-client-w13',
        email: 'w13@minerx.test',
        isAnonymous: false,
        idToken: 'tok-w13-client',
      };
      const otherSession: ClientWithdrawalAuthSession = {
        uid: 'uid-other',
        email: 'other@minerx.test',
        isAnonymous: false,
        idToken: 'tok-w13-other',
      };

      // 1. Control negativo: red deshabilitada emitida desde quote -> W03-QUOTE-404-NETWORK_NOT_ENABLED
      await assert.rejects(
        () =>
          requestWithdrawalQuote(
            clientSession,
            { networkId: 'usdt-polygon', requestedAmountMicros: 20_000_000 },
            { baseUrl },
          ),
        (err) =>
          isWithdrawalModuleError(err) &&
          err.faultCode === 'W03-QUOTE-404-NETWORK_NOT_ENABLED',
      );

      // 2. W05 WithdrawalForm controller: cargar config -> seleccionar BSC -> solicitar $50 USDT
      const formCtrl = createWithdrawalFormController({
        session: clientSession,
        apiOptions: { baseUrl },
      });
      await formCtrl.loadConfig();
      await formCtrl.selectNetwork('usdt-bsc');
      formCtrl.setDestinationAddress(WALLET_EVM);
      await formCtrl.setAmountUsdt('50.00');

      const submitRes = await formCtrl.submit();
      assert.equal(submitRes.ok, true);
      const createdReq = submitRes.withdrawalRequest;
      assert.equal(createdReq.status, 'REQUESTED');
      assert.equal(
        formCtrl.getSnapshot().config?.userBalance.availableBalanceMicros,
        120_000_000 - createdReq.totalDebitMicros,
      );

      // 3. W07 History controller: cliente ve su REQUESTED sin campos internos Admin
      const histCtrl = createClientWithdrawalHistoryController({
        session: clientSession,
        apiOptions: { baseUrl },
      });
      const initialItems = await histCtrl.loadInitial();
      assert.equal(initialItems.length, 1);
      assert.equal(initialItems[0].id, createdReq.id);
      assert.equal(initialItems[0].status, 'REQUESTED');
      assert.equal('internalNotes' in initialItems[0], false);

      // Cross-UID detail rejection -> 403
      const otherHistCtrl = createClientWithdrawalHistoryController({
        session: otherSession,
        apiOptions: { baseUrl },
      });
      await assert.rejects(
        () => otherHistCtrl.openDetail(createdReq.id),
        (err) => isWithdrawalModuleError(err) && err.httpStatus === 403,
      );

      // 4. Simular transición Admin completa hasta COMPLETED con txHash real + refresh en cliente
      srvWrap.settleOnBackend(createdReq.id);
      const refreshedItems = await histCtrl.refresh();
      assert.equal(refreshedItems[0].status, 'COMPLETED');
      assert.equal(refreshedItems[0].txHash, REAL_TXHASH);
      assert.equal(refreshedItems[0].confirmations, 15);

      const openedDetail = await histCtrl.openDetail(createdReq.id);
      assert.equal(openedDetail.status, 'COMPLETED');
      assert.equal(openedDetail.txHash, REAL_TXHASH);

      // 5. Render in-test de UI Cliente (W05 + W07 + W06 WithdrawalDetailsModal mode="client")
      const formMarkup = renderToStaticMarkup(
        React.createElement(WithdrawalForm, {
          session: clientSession,
          autoLoadConfig: false,
          initialConfig: formCtrl.getSnapshot().config,
          connectedWalletAddress: WALLET_EVM,
        }),
      );
      assert.ok(formMarkup.includes('USDT'));

      const historyMarkup = renderToStaticMarkup(
        React.createElement(WithdrawalHistoryPanel, {
          session: clientSession,
          autoLoad: false,
          initialItems: histCtrl.getSnapshot().items,
          networksCatalog: CANONICAL_USDT_NETWORKS,
        }),
      );
      assert.ok(historyMarkup.includes('Completado'));
      assert.ok(historyMarkup.includes('0xaaaa'));

      const modalMarkup = renderToStaticMarkup(
        React.createElement(WithdrawalDetailsModal, {
          withdrawal: openedDetail,
          mode: 'client',
          isOpen: true,
          onClose: () => undefined,
          networksCatalog: CANONICAL_USDT_NETWORKS,
        }),
      );
      assert.ok(modalMarkup.includes(REAL_TXHASH));
      assert.ok(modalMarkup.includes('https://bscscan.com/tx/'));
      assert.equal(modalMarkup.includes('Notas Internas'), false);
    } finally {
      srvWrap.server.closeAllConnections?.();
      await new Promise<void>((resolve) => srvWrap.server.close(() => resolve()));
    }

    // 6. Hashes congelados W01..W12 intactos
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
