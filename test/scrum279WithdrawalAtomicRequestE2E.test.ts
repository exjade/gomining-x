import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  CANONICAL_USDT_NETWORKS,
  applyAtomicWithdrawalLock,
  formatWithdrawalFaultCode,
  isWithdrawalModuleError,
  microsToUsdt,
  usdtToMicros,
  type UserFinancialBalance,
  type WithdrawalRequest,
} from '../src/types/withdrawal.ts';
import {
  createWithdrawalIdempotencyKey,
  submitWithdrawalRequest,
} from '../src/services/withdrawals/withdrawalRequestClient.ts';

describe('SCRUM-279 (W04): Client Atomic Withdrawal Request, Idempotency & Adversarial Concurrency E2E', () => {
  it('1. validates client pre-flight checks and emits W04-CLIENT_API-* fault codes before network call', async () => {
    const session = {
      uid: 'uid-client-w04',
      email: 'client@pouw.io',
      isAnonymous: false,
      idToken: 'tok-valid',
    };

    const key = createWithdrawalIdempotencyKey('uid-client-w04', 'usdt-bsc', 20_000_000, 'n1');
    assert.ok(key.startsWith('idem_uid-client-w04_usdt-bsc_20000000_'));

    // Short idempotency key -> W04-CLIENT_API-400-INVALID_IDEMPOTENCY_KEY
    await assert.rejects(
      () =>
        submitWithdrawalRequest(session, {
          networkId: 'usdt-bsc',
          destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
          requestedAmountMicros: 20_000_000,
          idempotencyKey: 'short',
        }),
      (err: unknown) => {
        assert.equal(isWithdrawalModuleError(err), true);
        if (isWithdrawalModuleError(err)) {
          assert.equal(err.faultCode, 'W04-CLIENT_API-400-INVALID_IDEMPOTENCY_KEY');
        }
        return true;
      },
    );

    // Below 10 USDT minimum -> W04-CLIENT_API-422-MINIMUM_WITHDRAWAL_NOT_MET
    await assert.rejects(
      () =>
        submitWithdrawalRequest(session, {
          networkId: 'usdt-bsc',
          destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
          requestedAmountMicros: usdtToMicros('9.99'),
          idempotencyKey: 'idem-valid-123456',
        }),
      (err: unknown) => {
        assert.equal(isWithdrawalModuleError(err), true);
        if (isWithdrawalModuleError(err)) {
          assert.equal(err.faultCode, 'W04-CLIENT_API-422-MINIMUM_WITHDRAWAL_NOT_MET');
        }
        return true;
      },
    );
  });

  describe('2. E2E Coupled HTTP Flow: submitWithdrawalRequest <-> POST /api/withdrawals/request (Atomic Lock, Idempotency & Concurrency)', () => {
    let server: http.Server;
    let baseUrl = '';

    // Serialized mutex to emulate Firestore runTransaction isolation
    let txChain: Promise<unknown> = Promise.resolve();
    function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
      const next = txChain.then(fn, fn);
      txChain = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    }

    const userBalances = new Map<string, UserFinancialBalance>();
    const usersMirror = new Map<string, { balance: number }>();
    const withdrawals = new Map<string, WithdrawalRequest>();
    const ledgerEntries = new Map<string, any>();
    const idempotencyStore = new Map<string, any>();

    before(async () => {
      userBalances.set('uid-pro-1', {
        uid: 'uid-pro-1',
        email: 'pro1@pouw.io',
        membershipTier: 'PRO',
        availableBalanceMicros: usdtToMicros(100), // 100.00 USDT
        lockedBalanceMicros: 0,
        totalWithdrawnMicros: 0,
        version: 1,
        updatedAt: '2026-11-18T03:00:00.000Z',
      });
      usersMirror.set('uid-pro-1', { balance: 100 });

      userBalances.set('uid-race-user', {
        uid: 'uid-race-user',
        email: 'race@pouw.io',
        membershipTier: 'STANDARD',
        availableBalanceMicros: usdtToMicros(100), // 100.00 USDT
        lockedBalanceMicros: 0,
        totalWithdrawnMicros: 0,
        version: 1,
        updatedAt: '2026-11-18T03:00:00.000Z',
      });
      usersMirror.set('uid-race-user', { balance: 100 });

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
              error: 'Token requerido.',
            }),
          );
          return;
        }

        const token = match[1];
        const uid =
          token === 'tok-pro-1'
            ? 'uid-pro-1'
            : token === 'tok-race'
              ? 'uid-race-user'
              : '';
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
              error: 'Token inválido.',
            }),
          );
          return;
        }

        if (req.method === 'POST' && req.url === '/api/withdrawals/request') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.from(chunk));
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

          try {
            const txResult = await runSerialized(async () => {
              const idemId = `${uid}__${body.idempotencyKey}`;
              if (idempotencyStore.has(idemId)) {
                const cached = idempotencyStore.get(idemId);
                if (
                  cached.networkId !== body.networkId ||
                  cached.destinationAddress !== body.destinationAddress ||
                  cached.requestedAmountMicros !== body.requestedAmountMicros
                ) {
                  const code = 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT';
                  const faultCode = formatWithdrawalFaultCode('W04', 'LOCK_TX', code, 409);
                  throw {
                    status: 409,
                    code,
                    faultCode,
                    originTask: 'W04',
                    originModule: 'LOCK_TX',
                    error: `[${faultCode}] ${code}: Conflicto de parámetros con idempotencyKey existente.`,
                  };
                }
                const wth = withdrawals.get(cached.withdrawalId)!;
                const bal = userBalances.get(uid)!;
                return {
                  ok: true,
                  status: 200 as const,
                  idempotentReplay: true,
                  withdrawalRequest: wth,
                  userBalance: bal,
                  syncedUserBalanceUsdt: microsToUsdt(bal.availableBalanceMicros),
                  ledgerEntryId: cached.ledgerEntryId,
                  auditEventId: cached.auditEventId,
                };
              }

              const net = CANONICAL_USDT_NETWORKS.find((n) => n.id === body.networkId);
              if (!net || !net.enabled) {
                const code = 'NETWORK_NOT_ENABLED';
                const faultCode = formatWithdrawalFaultCode('W04', 'LOCK_TX', code, 404);
                throw {
                  status: 404,
                  code,
                  faultCode,
                  originTask: 'W04',
                  originModule: 'LOCK_TX',
                  error: `[${faultCode}] ${code}: Red no habilitada.`,
                };
              }

              const currentBal = userBalances.get(uid)!;
              const withdrawalId = `wth_${uid}_${body.idempotencyKey}`;
              const ledgerEntryId = `led_lock_${withdrawalId}`;
              const auditEventId = `aud_create_${withdrawalId}`;

              let lockRes;
              try {
                lockRes = applyAtomicWithdrawalLock(
                  currentBal,
                  {
                    networkId: net.id,
                    destinationAddress: body.destinationAddress,
                    requestedAmountMicros: body.requestedAmountMicros,
                    idempotencyKey: body.idempotencyKey,
                  },
                  net,
                  {
                    withdrawalId,
                    ledgerEntryId,
                    auditEventId,
                    nowIso: '2026-11-18T03:05:00.000Z',
                  },
                );
              } catch (domErr: any) {
                const code = domErr.code || 'LOCK_VALIDATION_ERROR';
                const status = code === 'INSUFFICIENT_AVAILABLE_BALANCE' ? 409 : 422;
                const faultCode = formatWithdrawalFaultCode('W04', 'LOCK_TX', code, status);
                throw {
                  status,
                  code,
                  faultCode,
                  originTask: 'W04',
                  originModule: 'LOCK_TX',
                  error: `[${faultCode}] ${code}: ${domErr.message}`,
                };
              }

              userBalances.set(uid, lockRes.updatedBalance);
              usersMirror.set(uid, { balance: lockRes.syncedUserBalanceUsdt });
              withdrawals.set(withdrawalId, lockRes.withdrawalRequest);
              ledgerEntries.set(ledgerEntryId, lockRes.ledgerEntry);
              idempotencyStore.set(idemId, {
                networkId: net.id,
                destinationAddress: body.destinationAddress,
                requestedAmountMicros: body.requestedAmountMicros,
                withdrawalId,
                ledgerEntryId,
                auditEventId,
              });

              return {
                ok: true,
                status: 201 as const,
                idempotentReplay: false,
                withdrawalRequest: lockRes.withdrawalRequest,
                userBalance: lockRes.updatedBalance,
                syncedUserBalanceUsdt: lockRes.syncedUserBalanceUsdt,
                ledgerEntry: lockRes.ledgerEntry,
                auditEvent: lockRes.auditEvent,
                ledgerEntryId,
                auditEventId,
              };
            });

            res.statusCode = txResult.status;
            res.end(JSON.stringify(txResult));
          } catch (errObj: any) {
            res.statusCode = errObj.status || 500;
            res.end(JSON.stringify({ ok: false, ...errObj }));
          }
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

    it('creates withdrawal atomically (201), replays idempotently without double-debit (200), and rejects payload conflict (409)', async () => {
      const proSession = {
        uid: 'uid-pro-1',
        email: 'pro1@pouw.io',
        isAnonymous: false,
        idToken: 'tok-pro-1',
      };

      const idemKey = createWithdrawalIdempotencyKey('uid-pro-1', 'usdt-bsc', usdtToMicros(50), 'tx1');

      // 1. First submission -> 201 Created, locks 51.00 USDT (50 + 0.50 network + 0.50 platform)
      const created = await submitWithdrawalRequest(
        proSession,
        {
          networkId: 'usdt-bsc',
          destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
          requestedAmountMicros: usdtToMicros(50),
          idempotencyKey: idemKey,
        },
        { baseUrl },
      );

      assert.equal(created.status, 201);
      assert.equal(created.idempotentReplay, false);
      assert.equal(created.withdrawalRequest.status, 'REQUESTED');
      assert.equal(created.userBalance.availableBalanceMicros, 49_000_000);
      assert.equal(created.userBalance.lockedBalanceMicros, 51_000_000);
      assert.equal(created.syncedUserBalanceUsdt, 49);
      assert.equal(usersMirror.get('uid-pro-1')?.balance, 49);

      // 2. Exact idempotent replay -> 200 OK, no second debit
      const replayed = await submitWithdrawalRequest(
        proSession,
        {
          networkId: 'usdt-bsc',
          destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
          requestedAmountMicros: usdtToMicros(50),
          idempotencyKey: idemKey,
        },
        { baseUrl },
      );

      assert.equal(replayed.status, 200);
      assert.equal(replayed.idempotentReplay, true);
      assert.equal(replayed.withdrawalRequest.id, created.withdrawalRequest.id);
      assert.equal(replayed.userBalance.availableBalanceMicros, 49_000_000);
      assert.equal(ledgerEntries.size, 1);

      // 3. Reusing same idempotencyKey with different amount -> 409 W04-LOCK_TX-409-IDEMPOTENCY_KEY_PAYLOAD_CONFLICT
      await assert.rejects(
        () =>
          submitWithdrawalRequest(
            proSession,
            {
              networkId: 'usdt-bsc',
              destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
              requestedAmountMicros: usdtToMicros(20),
              idempotencyKey: idemKey,
            },
            { baseUrl },
          ),
        (err: unknown) => {
          assert.equal(isWithdrawalModuleError(err), true);
          if (isWithdrawalModuleError(err)) {
            assert.equal(
              err.faultCode,
              'W04-LOCK_TX-409-IDEMPOTENCY_KEY_PAYLOAD_CONFLICT',
            );
          }
          return true;
        },
      );
    });

    it('prevents double-spend under adversarial concurrency (two simultaneous 60 USDT withdrawals against 100 USDT balance)', async () => {
      const raceSession = {
        uid: 'uid-race-user',
        email: 'race@pouw.io',
        isAnonymous: false,
        idToken: 'tok-race',
      };

      const [resA, resB] = await Promise.allSettled([
        submitWithdrawalRequest(
          raceSession,
          {
            networkId: 'usdt-bsc',
            destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
            requestedAmountMicros: usdtToMicros(60),
            idempotencyKey: 'idem_race_concurrent_A',
          },
          { baseUrl },
        ),
        submitWithdrawalRequest(
          raceSession,
          {
            networkId: 'usdt-bsc',
            destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
            requestedAmountMicros: usdtToMicros(60),
            idempotencyKey: 'idem_race_concurrent_B',
          },
          { baseUrl },
        ),
      ]);

      const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
      const rejected = [resA, resB].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      assert.equal(fulfilled.length, 1, 'Exactly one concurrent withdrawal must succeed');
      assert.equal(rejected.length, 1, 'The second concurrent withdrawal must fail closed');

      const rejectErr = rejected[0].reason;
      assert.equal(isWithdrawalModuleError(rejectErr), true);
      assert.equal(
        rejectErr.faultCode,
        'W04-LOCK_TX-409-INSUFFICIENT_AVAILABLE_BALANCE',
      );

      // Final balance check: 100.00 - (60.00 + 0.50 + 0.60) = 38.90 USDT available, 61.10 USDT locked
      const finalBal = userBalances.get('uid-race-user')!;
      assert.equal(finalBal.availableBalanceMicros, 38_900_000);
      assert.equal(finalBal.lockedBalanceMicros, 61_100_000);
      assert.equal(usersMirror.get('uid-race-user')?.balance, 38.9);
    });
  });
});
