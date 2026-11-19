import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  CANONICAL_USDT_NETWORKS,
  MIN_WITHDRAWAL_MICROS,
  MIN_WITHDRAWAL_USDT,
  WITHDRAWAL_ASSET,
  WithdrawalModuleError,
  calculateMaxWithdrawableMicros,
  calculateWithdrawalQuote,
  formatWithdrawalFaultCode,
  isWithdrawalModuleError,
  microsToUsdt,
  resolveMembershipSlaPolicy,
  usdtToMicros,
  validateDestinationAddress,
} from '../src/types/withdrawal.ts';
import {
  fetchWithdrawalConfig,
  requestMaxWithdrawalQuote,
  requestWithdrawalQuote,
} from '../src/services/withdrawals/withdrawalConfigQuoteClient.ts';

describe('SCRUM-278 (W03): USDT Withdrawal Networks, Fault-Tracing Codes & Coupled Config/Quote E2E', () => {
  it('1. enforces structured fault-tracing codes (W01-DOMAIN-*, W02-CLIENT_GUARD-*, W03-QUOTE-*) on every error', () => {
    assert.equal(
      formatWithdrawalFaultCode('W02', 'AUTHZ', 'FORBIDDEN_WITHDRAWAL_PERMISSION', 403),
      'W02-AUTHZ-403-FORBIDDEN_WITHDRAWAL_PERMISSION',
    );
    assert.equal(
      formatWithdrawalFaultCode('W01', 'DOMAIN', 'INVALID_USDT_AMOUNT'),
      'W01-DOMAIN-INVALID_USDT_AMOUNT',
    );

    try {
      usdtToMicros('-10');
      assert.fail('Should have thrown WithdrawalModuleError');
    } catch (err) {
      assert.equal(isWithdrawalModuleError(err), true);
      if (isWithdrawalModuleError(err)) {
        assert.equal(err.originTask, 'W01');
        assert.equal(err.originModule, 'DOMAIN');
        assert.equal(err.code, 'INVALID_USDT_AMOUNT');
        assert.equal(err.faultCode, 'W01-DOMAIN-400-INVALID_USDT_AMOUNT');
      }
    }
  });

  it('2. validates canonical USDT networks (BSC, POLYGON, TRON, SOLANA, ETHEREUM) and minimum 10 USDT policy', () => {
    assert.equal(CANONICAL_USDT_NETWORKS.length, 5);
    const codes = CANONICAL_USDT_NETWORKS.map((n) => n.networkCode);
    assert.deepEqual(codes, ['BSC', 'POLYGON', 'TRON', 'SOLANA', 'ETHEREUM']);

    for (const net of CANONICAL_USDT_NETWORKS) {
      assert.equal(net.asset, WITHDRAWAL_ASSET);
      assert.equal(net.enabled, true);
      assert.ok(net.minimumWithdrawalMicros >= MIN_WITHDRAWAL_MICROS);
      assert.ok(net.requiredConfirmations >= 1);
      assert.ok(net.explorerTxUrlTemplate.includes('{txHash}'));
    }
  });

  describe('3. E2E Coupled HTTP Flow: Client withdrawalConfigQuoteClient <-> /api/withdrawals/config & /quote', () => {
    let server: http.Server;
    let baseUrl = '';

    const mockBalances: Record<
      string,
      {
        availableBalanceMicros: number;
        lockedBalanceMicros: number;
        totalWithdrawnMicros: number;
        membershipTier: 'NONE' | 'PRO';
      }
    > = {
      'uid-miner-pro': {
        availableBalanceMicros: usdtToMicros(100), // 100.00 USDT
        lockedBalanceMicros: usdtToMicros(20),
        totalWithdrawnMicros: usdtToMicros(50),
        membershipTier: 'PRO',
      },
      'uid-miner-standard': {
        availableBalanceMicros: usdtToMicros('12.50'),
        lockedBalanceMicros: 0,
        totalWithdrawnMicros: 0,
        membershipTier: 'NONE',
      },
    };

    before(async () => {
      server = http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const authHeader = req.headers.authorization || '';
        const match = /^Bearer\s+([^\s]+)$/i.exec(authHeader.trim());
        if (!match) {
          const faultCode = formatWithdrawalFaultCode('W02', 'AUTHZ', 'UNAUTHENTICATED', 401);
          res.statusCode = 401;
          res.end(
            JSON.stringify({
              ok: false,
              code: 'UNAUTHENTICATED',
              faultCode,
              originTask: 'W02',
              originModule: 'AUTHZ',
              error: `[${faultCode}] UNAUTHENTICATED: Token requerido.`,
            }),
          );
          return;
        }

        const token = match[1];
        const uid = token === 'tok-pro' ? 'uid-miner-pro' : token === 'tok-std' ? 'uid-miner-standard' : '';
        if (!uid) {
          const faultCode = formatWithdrawalFaultCode('W02', 'AUTHZ', 'INVALID_AUTH_TOKEN', 401);
          res.statusCode = 401;
          res.end(
            JSON.stringify({
              ok: false,
              code: 'INVALID_AUTH_TOKEN',
              faultCode,
              originTask: 'W02',
              originModule: 'AUTHZ',
              error: `[${faultCode}] INVALID_AUTH_TOKEN: Token inválido.`,
            }),
          );
          return;
        }

        const userBal = mockBalances[uid];
        const slaPolicy = resolveMembershipSlaPolicy(userBal.membershipTier);
        const url = new URL(req.url || '/', 'http://127.0.0.1');

        if (req.method === 'GET' && url.pathname === '/api/withdrawals/config') {
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              ok: true,
              asset: WITHDRAWAL_ASSET,
              minimumWithdrawalMicros: MIN_WITHDRAWAL_MICROS,
              minimumWithdrawalUsdt: MIN_WITHDRAWAL_USDT,
              networks: CANONICAL_USDT_NETWORKS,
              userBalance: {
                uid,
                availableBalanceMicros: userBal.availableBalanceMicros,
                lockedBalanceMicros: userBal.lockedBalanceMicros,
                totalWithdrawnMicros: userBal.totalWithdrawnMicros,
                availableBalanceUsdt: microsToUsdt(userBal.availableBalanceMicros),
                membershipTier: userBal.membershipTier,
              },
              slaPolicy,
            }),
          );
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/withdrawals/quote') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.from(chunk));
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          const net = CANONICAL_USDT_NETWORKS.find(
            (n) => n.id === body.networkId || n.networkCode === body.networkId,
          );
          if (!net || !net.enabled) {
            const faultCode = formatWithdrawalFaultCode(
              'W03',
              'QUOTE',
              'NETWORK_NOT_ENABLED',
              404,
            );
            res.statusCode = 404;
            res.end(
              JSON.stringify({
                ok: false,
                code: 'NETWORK_NOT_ENABLED',
                faultCode,
                originTask: 'W03',
                originModule: 'QUOTE',
                error: `[${faultCode}] NETWORK_NOT_ENABLED: Red no habilitada.`,
              }),
            );
            return;
          }

          const baseQuote =
            body.mode === 'MAX_AVAILABLE'
              ? calculateMaxWithdrawableMicros(userBal.availableBalanceMicros, net)
              : calculateWithdrawalQuote(
                  body.requestedAmountMicros,
                  net,
                  userBal.availableBalanceMicros,
                );

          let addressValidation;
          let validationFaultCode = baseQuote.validationFaultCode;
          let validationMessage = baseQuote.validationMessage;

          if (typeof body.destinationAddress === 'string' && body.destinationAddress.trim()) {
            addressValidation = validateDestinationAddress(
              body.destinationAddress,
              net.addressType,
            );
            if (!addressValidation.valid) {
              validationFaultCode = formatWithdrawalFaultCode(
                'W03',
                'QUOTE',
                'INVALID_DESTINATION_ADDRESS',
                422,
              );
              validationMessage = addressValidation.reason;
            }
          }

          res.statusCode = 200;
          res.end(
            JSON.stringify({
              ok: true,
              quote: {
                ...baseQuote,
                availableBalanceMicros: userBal.availableBalanceMicros,
                slaPolicy,
                ...(addressValidation ? { addressValidation } : {}),
                ...(validationFaultCode ? { validationFaultCode } : {}),
                ...(validationMessage ? { validationMessage } : {}),
              },
            }),
          );
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false }));
      });

      await new Promise<void>((resolveListen) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as any;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolveListen();
        });
      });
    });

    after(async () => {
      if (server) {
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      }
    });

    it('fetches dynamic USDT networks, authoritative balance, and membership SLA via fetchWithdrawalConfig', async () => {
      const proSession = {
        uid: 'uid-miner-pro',
        email: 'pro@pouw.io',
        isAnonymous: false,
        idToken: 'tok-pro',
      };

      const cfg = await fetchWithdrawalConfig(proSession, { baseUrl });
      assert.equal(cfg.ok, true);
      assert.equal(cfg.asset, 'USDT');
      assert.equal(cfg.minimumWithdrawalMicros, 10_000_000);
      assert.equal(cfg.networks.length, 5);
      assert.equal(cfg.userBalance.availableBalanceMicros, 100_000_000);
      assert.equal(cfg.userBalance.availableBalanceUsdt, 100);
      assert.equal(cfg.slaPolicy.tier, 'PRO');
      assert.equal(cfg.slaPolicy.minHours, 1);
      assert.equal(cfg.slaPolicy.maxHours, 5);
    });

    it('computes exact quotes, MAX_AVAILABLE quotes across all 5 networks, and validates destinationAddress by addressType', async () => {
      const proSession = {
        uid: 'uid-miner-pro',
        email: 'pro@pouw.io',
        isAnonymous: false,
        idToken: 'tok-pro',
      };

      // 1. Exact 50 USDT on Polygon (0.80 network fee + 0.50 platform fee = 51.30 USDT total debit)
      const polyQuote = await requestWithdrawalQuote(
        proSession,
        {
          networkId: 'usdt-polygon',
          requestedAmountMicros: usdtToMicros(50),
          destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        },
        { baseUrl },
      );
      assert.equal(polyQuote.meetsMinimum, true);
      assert.equal(polyQuote.withinAvailableBalance, true);
      assert.equal(polyQuote.networkFeeMicros, 800_000);
      assert.equal(polyQuote.platformFeeMicros, 500_000);
      assert.equal(polyQuote.totalDebitMicros, 51_300_000);
      assert.equal(polyQuote.addressValidation?.valid, true);

      // 2. Wrong address family (EVM address on TRON network) -> flags W03-QUOTE-422-INVALID_DESTINATION_ADDRESS
      const badAddrQuote = await requestWithdrawalQuote(
        proSession,
        {
          networkId: 'usdt-tron',
          requestedAmountMicros: usdtToMicros(20),
          destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        },
        { baseUrl },
      );
      assert.equal(badAddrQuote.addressValidation?.valid, false);
      assert.equal(
        badAddrQuote.validationFaultCode,
        'W03-QUOTE-422-INVALID_DESTINATION_ADDRESS',
      );

      // 3. Below 10 USDT minimum (9.50 USDT) -> flags W03-QUOTE-422-MINIMUM_WITHDRAWAL_NOT_MET
      const belowMinQuote = await requestWithdrawalQuote(
        proSession,
        {
          networkId: 'usdt-bsc',
          requestedAmountMicros: usdtToMicros('9.50'),
        },
        { baseUrl },
      );
      assert.equal(belowMinQuote.meetsMinimum, false);
      assert.equal(
        belowMinQuote.validationFaultCode,
        'W03-QUOTE-422-MINIMUM_WITHDRAWAL_NOT_MET',
      );

      // 4. Authoritative MAX_AVAILABLE across all 5 canonical networks never exceeds 100 USDT
      for (const net of CANONICAL_USDT_NETWORKS) {
        const maxQ = await requestMaxWithdrawalQuote(proSession, net.id, undefined, { baseUrl });
        assert.equal(maxQ.meetsMinimum, true);
        assert.equal(maxQ.withinAvailableBalance, true);
        assert.ok(
          maxQ.totalDebitMicros <= 100_000_000,
          `MAX quote on ${net.id} must not exceed 100 USDT available balance`,
        );
      }

      // 5. Unknown/disabled network throws WithdrawalModuleError with W03-QUOTE-404-NETWORK_NOT_ENABLED
      await assert.rejects(
        () =>
          requestWithdrawalQuote(
            proSession,
            { networkId: 'usdt-unknown-chain', requestedAmountMicros: usdtToMicros(20) },
            { baseUrl },
          ),
        (err: unknown) => {
          assert.equal(isWithdrawalModuleError(err), true);
          if (isWithdrawalModuleError(err)) {
            assert.equal(err.faultCode, 'W03-QUOTE-404-NETWORK_NOT_ENABLED');
          }
          return true;
        },
      );
    });
  });
});
