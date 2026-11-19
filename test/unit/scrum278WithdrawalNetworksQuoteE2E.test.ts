import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  CANONICAL_USDT_NETWORKS,
  MIN_WITHDRAWAL_MICROS,
  WithdrawalModuleError,
  formatWithdrawalFaultCode,
  isWithdrawalModuleError,
  usdtToMicros,
} from '../../src/types/withdrawal.js';
import {
  validateWithdrawalNetworkConfigDoc,
  seedCanonicalUsdtNetworks,
  listEnabledWithdrawalNetworks,
  resolveAuthoritativeUserBalance,
} from '../../server/services/withdrawalNetworksService.js';
import { createWithdrawalConfigQuoteRouter } from '../../server/services/withdrawalConfigQuoteRouter.js';
import type { FirestoreLike } from '../../server/services/firebaseAdminAllowlistAdapter.js';

describe('SCRUM-278 (W03): USDT Withdrawal Networks Service, Fault-Tracing Codes & Express Config/Quote E2E', () => {
  it('1. validates withdrawalNetworks documents fail-closed and emits W03-NETCFG-* fault codes on corrupt data', () => {
    const validBsc = validateWithdrawalNetworkConfigDoc('usdt-bsc', {
      ...CANONICAL_USDT_NETWORKS[0],
    });
    assert.equal(validBsc.id, 'usdt-bsc');
    assert.equal(validBsc.asset, 'USDT');
    assert.equal(validBsc.minimumWithdrawalMicros, MIN_WITHDRAWAL_MICROS);

    // Reject non-USDT asset
    assert.throws(
      () =>
        validateWithdrawalNetworkConfigDoc('btc-net', {
          ...CANONICAL_USDT_NETWORKS[0],
          asset: 'BTC',
        }),
      (err: unknown) => {
        assert.equal(isWithdrawalModuleError(err), true);
        if (isWithdrawalModuleError(err)) {
          assert.equal(err.faultCode, 'W03-NETCFG-422-INVALID_NETWORK_ASSET');
        }
        return true;
      },
    );

    // Reject minimumWithdrawalMicros < 10_000_000 (10 USDT)
    assert.throws(
      () =>
        validateWithdrawalNetworkConfigDoc('usdt-bsc-low-min', {
          ...CANONICAL_USDT_NETWORKS[0],
          minimumWithdrawalMicros: 5_000_000,
        }),
      (err: unknown) => {
        assert.equal(isWithdrawalModuleError(err), true);
        if (isWithdrawalModuleError(err)) {
          assert.equal(err.faultCode, 'W03-NETCFG-422-INVALID_NETWORK_SCHEMA');
        }
        return true;
      },
    );

    // Reject missing {txHash} placeholder in explorerTxUrlTemplate
    assert.throws(
      () =>
        validateWithdrawalNetworkConfigDoc('usdt-bsc-bad-explorer', {
          ...CANONICAL_USDT_NETWORKS[0],
          explorerTxUrlTemplate: 'https://bscscan.com/tx/static',
        }),
      (err: unknown) => {
        assert.equal(isWithdrawalModuleError(err), true);
        if (isWithdrawalModuleError(err)) {
          assert.equal(err.faultCode, 'W03-NETCFG-422-INVALID_NETWORK_SCHEMA');
        }
        return true;
      },
    );
  });

  it('2. seeds canonical USDT networks idempotently and resolves authoritative user balance from /userBalances with /users fallback', async () => {
    const collections = new Map<string, Map<string, Record<string, unknown>>>();
    const getColMap = (name: string) => {
      if (!collections.has(name)) {
        collections.set(name, new Map());
      }
      return collections.get(name)!;
    };

    const mockFirestore: FirestoreLike = {
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            const col = getColMap(name);
            const data = col.get(id);
            return {
              id,
              exists: data !== undefined,
              data: () => data,
            };
          },
          set: async (data: Record<string, unknown>) => {
            const col = getColMap(name);
            col.set(id, { ...(col.get(id) || {}), ...data });
          },
        }),
        get: async () => {
          const col = getColMap(name);
          return {
            docs: Array.from(col.entries()).map(([id, data]) => ({
              id,
              exists: true,
              data: () => data,
            })),
          };
        },
      }),
    };

    // 1. Seed canonical networks
    const seeded = await seedCanonicalUsdtNetworks(mockFirestore);
    assert.equal(seeded.length, 5);

    const enabledList = await listEnabledWithdrawalNetworks(mockFirestore);
    assert.equal(enabledList.length, 5);

    // 2. User with /userBalances/{uid} document (Decision 1 Option A)
    getColMap('userBalances').set('uid-with-private-bal', {
      uid: 'uid-with-private-bal',
      email: 'whale@pouw.io',
      membershipTier: 'WHALE',
      availableBalanceMicros: 250_000_000,
      lockedBalanceMicros: 50_000_000,
      totalWithdrawnMicros: 500_000_000,
      version: 3,
      updatedAt: '2026-11-18T01:00:00.000Z',
    });

    const resolvedPrimary = await resolveAuthoritativeUserBalance(mockFirestore, {
      uid: 'uid-with-private-bal',
      email: 'whale@pouw.io',
    });
    assert.equal(resolvedPrimary.availableBalanceMicros, 250_000_000);
    assert.equal(resolvedPrimary.lockedBalanceMicros, 50_000_000);
    assert.equal(resolvedPrimary.membershipTier, 'WHALE');

    // 3. User without /userBalances/{uid} yet falls back cleanly to /users/{uid}.balance
    getColMap('users').set('uid-legacy-mirror', {
      email: 'legacy@pouw.io',
      balance: 42.75,
      membershipTier: 'STANDARD',
    });

    const resolvedFallback = await resolveAuthoritativeUserBalance(mockFirestore, {
      uid: 'uid-legacy-mirror',
      email: 'legacy@pouw.io',
    });
    assert.equal(resolvedFallback.availableBalanceMicros, 42_750_000);
    assert.equal(resolvedFallback.membershipTier, 'STANDARD');
  });

  describe('3. E2E Express Router Verification: GET /api/withdrawals/config & POST /api/withdrawals/quote', () => {
    let server: http.Server;
    let baseUrl = '';

    const collections = new Map<string, Map<string, Record<string, unknown>>>();
    const getColMap = (name: string) => {
      if (!collections.has(name)) {
        collections.set(name, new Map());
      }
      return collections.get(name)!;
    };

    const mockFirestore: FirestoreLike = {
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            const col = getColMap(name);
            const data = col.get(id);
            return {
              id,
              exists: data !== undefined,
              data: () => data,
            };
          },
          set: async (data: Record<string, unknown>) => {
            const col = getColMap(name);
            col.set(id, { ...(col.get(id) || {}), ...data });
          },
        }),
        get: async () => {
          const col = getColMap(name);
          return {
            docs: Array.from(col.entries()).map(([id, data]) => ({
              id,
              exists: true,
              data: () => data,
            })),
          };
        },
      }),
    };

    const tokenMap: Record<string, any> = {
      'tok-pro-miner': {
        uid: 'uid-pro-miner',
        email: 'pro@pouw.io',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      },
      'tok-anon-user': {
        uid: 'uid-anon',
        email: null,
        email_verified: false,
        firebase: { sign_in_provider: 'anonymous' },
      },
    };

    before(async () => {
      await seedCanonicalUsdtNetworks(mockFirestore);
      // Add one disabled network to verify it is filtered out
      getColMap('withdrawalNetworks').set('usdt-disabled-test', {
        ...CANONICAL_USDT_NETWORKS[0],
        id: 'usdt-disabled-test',
        enabled: false,
      });

      getColMap('userBalances').set('uid-pro-miner', {
        uid: 'uid-pro-miner',
        email: 'pro@pouw.io',
        membershipTier: 'PRO',
        availableBalanceMicros: usdtToMicros(100), // 100.00 USDT
        lockedBalanceMicros: usdtToMicros(15),
        totalWithdrawnMicros: usdtToMicros(80),
        version: 2,
        updatedAt: '2026-11-18T02:00:00.000Z',
      });

      const app = express();
      app.use(express.json());
      app.use(
        '/api/withdrawals',
        createWithdrawalConfigQuoteRouter({
          authAdapter: {
            isInitialized: () => true,
            getApp: () => null,
            verifyIdToken: async (tok: string) => tokenMap[tok] ?? null,
          },
          firestore: mockFirestore,
        }),
      );

      server = http.createServer(app);
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

    it('GET /api/withdrawals/config returns only enabled USDT networks, private balance, and SLA policy (and blocks 401/403 with W02-AUTHZ-* faultCode)', async () => {
      // 1. Unauthenticated -> 401 with W02-AUTHZ-401-UNAUTHENTICATED
      const unauthRes = await fetch(`${baseUrl}/api/withdrawals/config`);
      assert.equal(unauthRes.status, 401);
      const unauthBody = (await unauthRes.json()) as any;
      assert.equal(unauthBody.faultCode, 'W02-AUTHZ-401-UNAUTHENTICATED');

      // 2. Anonymous -> 403 with W02-AUTHZ-403-ANONYMOUS_AUTH_FORBIDDEN
      const anonRes = await fetch(`${baseUrl}/api/withdrawals/config`, {
        headers: { Authorization: 'Bearer tok-anon-user' },
      });
      assert.equal(anonRes.status, 403);
      const anonBody = (await anonRes.json()) as any;
      assert.equal(anonBody.faultCode, 'W02-AUTHZ-403-ANONYMOUS_AUTH_FORBIDDEN');

      // 3. Authenticated PRO miner -> 200 OK with 5 enabled networks (disabled network excluded)
      const okRes = await fetch(`${baseUrl}/api/withdrawals/config`, {
        headers: { Authorization: 'Bearer tok-pro-miner' },
      });
      assert.equal(okRes.status, 200);
      const cfg = (await okRes.json()) as any;
      assert.equal(cfg.ok, true);
      assert.equal(cfg.asset, 'USDT');
      assert.equal(cfg.minimumWithdrawalMicros, 10_000_000);
      assert.equal(cfg.networks.length, 5);
      assert.equal(
        cfg.networks.some((n: any) => n.id === 'usdt-disabled-test'),
        false,
      );
      assert.equal(cfg.userBalance.availableBalanceMicros, 100_000_000);
      assert.equal(cfg.slaPolicy.tier, 'PRO');
    });

    it('POST /api/withdrawals/quote computes exact & MAX quotes and emits W03-QUOTE-* fault codes on invalid requests', async () => {
      // 1. Missing networkId -> 400 W03-QUOTE-400-NETWORK_ID_REQUIRED
      const missingNetRes = await fetch(`${baseUrl}/api/withdrawals/quote`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok-pro-miner',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestedAmountMicros: 20_000_000 }),
      });
      assert.equal(missingNetRes.status, 400);
      const missingNetBody = (await missingNetRes.json()) as any;
      assert.equal(missingNetBody.faultCode, 'W03-QUOTE-400-NETWORK_ID_REQUIRED');

      // 2. Disabled network -> 404 W03-QUOTE-404-NETWORK_NOT_ENABLED
      const disabledNetRes = await fetch(`${baseUrl}/api/withdrawals/quote`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok-pro-miner',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          networkId: 'usdt-disabled-test',
          requestedAmountMicros: 20_000_000,
        }),
      });
      assert.equal(disabledNetRes.status, 404);
      const disabledNetBody = (await disabledNetRes.json()) as any;
      assert.equal(disabledNetBody.faultCode, 'W03-QUOTE-404-NETWORK_NOT_ENABLED');

      // 3. Valid EXACT_AMOUNT quote on Solana (40 USDT -> 0.60 network fee + 0.40 platform fee = 41.00 USDT total debit)
      const solQuoteRes = await fetch(`${baseUrl}/api/withdrawals/quote`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok-pro-miner',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          networkId: 'usdt-solana',
          requestedAmountMicros: usdtToMicros(40),
          destinationAddress: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
        }),
      });
      assert.equal(solQuoteRes.status, 200);
      const solQuoteBody = (await solQuoteRes.json()) as any;
      assert.equal(solQuoteBody.ok, true);
      assert.equal(solQuoteBody.quote.networkFeeMicros, 600_000);
      assert.equal(solQuoteBody.quote.platformFeeMicros, 400_000);
      assert.equal(solQuoteBody.quote.totalDebitMicros, 41_000_000);
      assert.equal(solQuoteBody.quote.netAmountMicros, 40_000_000);
      assert.equal(solQuoteBody.quote.addressValidation.valid, true);

      // 4. MAX_AVAILABLE quote on Ethereum (3.50 USDT network fee + 1% platform fee <= 100.00 USDT)
      const ethMaxRes = await fetch(`${baseUrl}/api/withdrawals/quote`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok-pro-miner',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          networkId: 'usdt-ethereum',
          mode: 'MAX_AVAILABLE',
        }),
      });
      assert.equal(ethMaxRes.status, 200);
      const ethMaxBody = (await ethMaxRes.json()) as any;
      assert.equal(ethMaxBody.ok, true);
      assert.equal(ethMaxBody.quote.meetsMinimum, true);
      assert.equal(ethMaxBody.quote.withinAvailableBalance, true);
      assert.ok(ethMaxBody.quote.totalDebitMicros <= 100_000_000);
    });
  });
});
