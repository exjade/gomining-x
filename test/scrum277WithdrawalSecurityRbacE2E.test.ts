import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateClientWithdrawalSession,
  buildClientWithdrawalAuthHeaders,
  canClientAccessWithdrawalRecord,
  filterClientOwnedWithdrawals,
} from '../src/services/withdrawals/withdrawalAuthGuard.ts';
import {
  REQUIRED_PERMISSION_BY_AUDIT_ACTION,
  hasWithdrawalPermission,
  type WithdrawalAdminPermission,
  type WithdrawalRequest,
} from '../src/types/withdrawal.ts';

describe('SCRUM-277 (W02): Firestore Security Rules, Client Auth Guard & Coupled E2E AuthZ/RBAC', () => {
  it('1. verifies firestore.rules enforces Decision 1 (/userBalances private, zero client balance mutations) and canonical withdrawal collections', () => {
    const rulesPath = resolve(process.cwd(), 'firestore.rules');
    const rulesContent = readFileSync(rulesPath, 'utf8').replace(/\r\n/g, '\n');

    // 1. /userBalances/{uid}: owner or admin with withdrawals.read, zero client writes
    const userBalancesMatch = rulesContent.match(/match\s+\/userBalances\/\{uid\}\s*\{([^}]+)\}/s);
    assert.ok(userBalancesMatch, 'Must define match /userBalances/{uid}');
    assert.ok(/allow\s+read:\s*if\s+isOwner\(uid\)\s*\|\|\s*(isAdmin\(\)|hasAdminPermission\('withdrawals\.read'\));/.test(userBalancesMatch[1]));
    assert.ok(/allow\s+create,\s*update,\s*delete:\s*if\s+false;/.test(userBalancesMatch[1]));

    // 2. /withdrawalNetworks/{networkId}: authenticated read, zero client writes
    const networksMatch = rulesContent.match(/match\s+\/withdrawalNetworks\/\{networkId\}\s*\{([^}]+)\}/s);
    assert.ok(networksMatch, 'Must define match /withdrawalNetworks/{networkId}');
    assert.ok(/allow\s+read:\s*if\s+isAuthenticated\(\);/.test(networksMatch[1]));
    assert.ok(/allow\s+create,\s*update,\s*delete:\s*if\s+false;/.test(networksMatch[1]));

    // 3. /withdrawalRequests/{withdrawalId}: F-CRIT-04 blocks direct client SDK read; admin withdrawals.read only, zero client writes
    const requestsMatch = rulesContent.match(/match\s+\/withdrawalRequests\/\{withdrawalId\}\s*\{([^}]+)\}/s);
    assert.ok(requestsMatch, 'Must define match /withdrawalRequests/{withdrawalId}');
    assert.ok(/allow\s+read:\s*if\s+hasAdminPermission\('withdrawals\.read'\);/.test(requestsMatch[1]));
    assert.ok(/allow\s+create,\s*update,\s*delete:\s*if\s+false;/.test(requestsMatch[1]));

    // 4. /financialLedger/{ledgerEntryId}: strict UID isolation on read, zero client writes
    const ledgerMatch = rulesContent.match(/match\s+\/financialLedger\/\{ledgerEntryId\}\s*\{([^}]+)\}/s);
    assert.ok(ledgerMatch, 'Must define match /financialLedger/{ledgerEntryId}');
    assert.ok(ledgerMatch[1].includes('resource.data.userId == request.auth.uid'));
    assert.ok(/allow\s+create,\s*update,\s*delete:\s*if\s+false;/.test(ledgerMatch[1]));

    // 5. /withdrawalAuditEvents/{eventId}: admin audit permission only, zero client writes
    const auditMatch = rulesContent.match(/match\s+\/withdrawalAuditEvents\/\{eventId\}\s*\{([^}]+)\}/s);
    assert.ok(auditMatch, 'Must define match /withdrawalAuditEvents/{eventId}');
    assert.ok(/allow\s+read:\s*if\s+(isAdmin\(\)|hasAdminPermission\('withdrawals\.audit'\));/.test(auditMatch[1]));
    assert.ok(/allow\s+create,\s*update,\s*delete:\s*if\s+false;/.test(auditMatch[1]));

    // 5b. F-CRIT-02: isAdmin requires status == 'ACTIVE' + explicit permissions, /admin_users writes require admin.users.manage,
    // and subcollection wildcards must require a child segment ({subcollection}/{docId=**}) to avoid Rules v2 0-segment bypass.
    assert.ok(rulesContent.includes("data.status == 'ACTIVE'"));
    assert.ok(rulesContent.includes("hasAdminPermission('admin.users.manage')"));
    assert.ok(!rulesContent.includes("match /users/{userId} {\n      allow read: if true;"));
    assert.ok(rulesContent.includes("match /{subcollection}/{docId=**}"));

    // 5c. F-HIGH-01: /users/{userId} is NOT publicly readable; public referral lookup uses /publicReferralCodes/{code}
    const usersMatch = rulesContent.match(/match\s+\/users\/\{userId\}\s*\{([^}]+)\}/s);
    assert.ok(usersMatch, 'Must define match /users/{userId}');
    assert.equal(/allow\s+read:\s*if\s+true;/.test(usersMatch[1]), false, '/users/{userId} must NOT allow public read');
    assert.ok(rulesContent.includes('match /publicReferralCodes/{code}'));

    // 6. /users/{userId}: blocks client balance/commissionBalance/totalCommissionsEarned mutation
    assert.ok(rulesContent.includes('!touchesProtectedFinancialFields()'));
    const usersSection = rulesContent.split('match /users/{userId}')[1]?.split('match /miners/')[0] || '';
    assert.equal(
      usersSection.includes("'commissionBalance', 'balance'"),
      false,
      'Must remove commissionBalance and balance from client-mutable sponsor fields on /users/{userId}',
    );

    // 7. /referrals/{uid}: blocks direct withdrawal transactions from client
    assert.ok(rulesContent.includes("request.resource.data.type != 'withdrawal'"));

    // 8. Byte-parity check between retiros-cliente-main and retiros-admin-backend firestore.rules
    const adminRulesPath = resolve(process.cwd(), '../retiros-admin-backend/firestore.rules');
    if (existsSync(adminRulesPath)) {
      const adminRules = readFileSync(adminRulesPath, 'utf8').replace(/\r\n/g, '\n');
      assert.equal(
        rulesContent,
        adminRules,
        'firestore.rules MUST be byte-identical across Client and Admin/Backend isolated folders',
      );
    }
  });

  it('2. enforces client session validation, non-anonymous requirement, and strict UID ownership isolation', () => {
    assert.equal(validateClientWithdrawalSession(null).allowed, false);
    assert.equal(
      validateClientWithdrawalSession({ uid: 'anon-1', isAnonymous: true, idToken: 'tok' }).allowed,
      false,
    );
    assert.equal(
      validateClientWithdrawalSession({ uid: 'user-1', isAnonymous: false, idToken: '' }).allowed,
      false,
    );

    const validSession = {
      uid: 'user-pouw-100',
      email: 'USER@POUW.IO',
      isAnonymous: false,
      idToken: 'valid-jwt-token-100',
    };
    const check = validateClientWithdrawalSession(validSession);
    assert.equal(check.allowed, true);
    if (check.allowed) {
      assert.equal(check.email, 'user@pouw.io');
    }

    const headers = buildClientWithdrawalAuthHeaders(validSession);
    assert.equal(headers.Authorization, 'Bearer valid-jwt-token-100');
    assert.equal((headers as any)['x-admin-role'], undefined);

    const records: Array<Pick<WithdrawalRequest, 'id' | 'userId'>> = [
      { id: 'wth-1', userId: 'user-pouw-100' },
      { id: 'wth-2', userId: 'user-pouw-999' },
      { id: 'wth-3', userId: 'user-pouw-100' },
    ];

    assert.equal(canClientAccessWithdrawalRecord('user-pouw-100', records[0]), true);
    assert.equal(canClientAccessWithdrawalRecord('user-pouw-100', records[1]), false);

    const filtered = filterClientOwnedWithdrawals('user-pouw-100', records);
    assert.deepEqual(
      filtered.map((r) => r.id),
      ['wth-1', 'wth-3'],
    );
  });

  describe('3. E2E HTTP Boundary Verification: Client Auth, Cross-UID Isolation & Granular Admin RBAC', () => {
    let server: http.Server;
    let baseUrl = '';

    const mockWithdrawals: Record<string, { id: string; userId: string; amountMicros: number }> = {
      'wth-user-a': { id: 'wth-user-a', userId: 'uid-client-a', amountMicros: 25_000_000 },
      'wth-user-b': { id: 'wth-user-b', userId: 'uid-client-b', amountMicros: 40_000_000 },
    };

    const mockTokens: Record<
      string,
      { uid: string; email: string; signInProvider: string }
    > = {
      'token-client-a': { uid: 'uid-client-a', email: 'a@pouw.io', signInProvider: 'password' },
      'token-anon': { uid: 'uid-anon', email: '', signInProvider: 'anonymous' },
      'token-admin-readonly': {
        uid: 'uid-admin-ro',
        email: 'ro@pouw.io',
        signInProvider: 'password',
      },
      'token-admin-approver': {
        uid: 'uid-admin-ap',
        email: 'approver@pouw.io',
        signInProvider: 'password',
      },
    };

    const mockAdminAllowlist: Record<
      string,
      { role: string; status: string; permissions: string[] }
    > = {
      'uid-admin-ro': {
        role: 'admin',
        status: 'ACTIVE',
        // Has SUPER_ADMIN string in permissions to verify that SUPER_ADMIN wildcard does NOT bypass withdrawals.approve
        permissions: ['SUPER_ADMIN', 'withdrawals.read'],
      },
      'uid-admin-ap': {
        role: 'admin',
        status: 'ACTIVE',
        permissions: ['withdrawals.read', 'withdrawals.approve'],
      },
    };

    before(async () => {
      server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const authHeader = req.headers.authorization || '';
        const match = /^Bearer\s+([^\s]+)$/i.exec(authHeader.trim());
        if (!match) {
          res.statusCode = 401;
          res.end(JSON.stringify({ ok: false, code: 'UNAUTHENTICATED' }));
          return;
        }
        const token = match[1];
        const decoded = mockTokens[token];
        if (!decoded) {
          res.statusCode = 401;
          res.end(JSON.stringify({ ok: false, code: 'INVALID_AUTH_TOKEN' }));
          return;
        }
        if (decoded.signInProvider === 'anonymous') {
          res.statusCode = 403;
          res.end(JSON.stringify({ ok: false, code: 'ANONYMOUS_AUTH_FORBIDDEN' }));
          return;
        }

        const url = new URL(req.url || '/', 'http://127.0.0.1');

        // Client endpoint: GET /api/withdrawals/:id
        if (req.method === 'GET' && url.pathname.startsWith('/api/withdrawals/')) {
          const wthId = url.pathname.replace('/api/withdrawals/', '');
          const record = mockWithdrawals[wthId];
          if (!record) {
            res.statusCode = 404;
            res.end(JSON.stringify({ ok: false, code: 'NOT_FOUND' }));
            return;
          }
          if (!canClientAccessWithdrawalRecord(decoded.uid, record)) {
            res.statusCode = 403;
            res.end(JSON.stringify({ ok: false, code: 'FORBIDDEN_CROSS_UID_ACCESS' }));
            return;
          }
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, item: record }));
          return;
        }

        // Admin endpoint: POST /api/admin/withdrawals/:id/approve
        if (req.method === 'POST' && url.pathname.endsWith('/approve')) {
          const adminDoc = mockAdminAllowlist[decoded.uid];
          if (!adminDoc || adminDoc.role !== 'admin' || adminDoc.status !== 'ACTIVE') {
            res.statusCode = 403;
            res.end(JSON.stringify({ ok: false, code: 'FORBIDDEN_NOT_ADMIN' }));
            return;
          }
          const requiredPerm: WithdrawalAdminPermission =
            REQUIRED_PERMISSION_BY_AUDIT_ACTION.APPROVE;
          if (!hasWithdrawalPermission(adminDoc.permissions, requiredPerm)) {
            res.statusCode = 403;
            res.end(
              JSON.stringify({
                ok: false,
                code: 'FORBIDDEN_WITHDRAWAL_PERMISSION',
                requiredPermission: requiredPerm,
              }),
            );
            return;
          }
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, status: 'APPROVED' }));
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

    it('rejects unauthenticated (401), anonymous (403), and cross-UID access (403), while allowing own UID (200)', async () => {
      // 1. Missing token -> 401
      const unauthRes = await fetch(`${baseUrl}/api/withdrawals/wth-user-a`);
      assert.equal(unauthRes.status, 401);

      // 2. Anonymous token -> 403
      const anonRes = await fetch(`${baseUrl}/api/withdrawals/wth-user-a`, {
        headers: { Authorization: 'Bearer token-anon' },
      });
      assert.equal(anonRes.status, 403);
      const anonBody = (await anonRes.json()) as any;
      assert.equal(anonBody.code, 'ANONYMOUS_AUTH_FORBIDDEN');

      // 3. Client A attempting to read Client B withdrawal -> 403 FORBIDDEN_CROSS_UID_ACCESS
      const headersA = buildClientWithdrawalAuthHeaders({
        uid: 'uid-client-a',
        email: 'a@pouw.io',
        isAnonymous: false,
        idToken: 'token-client-a',
      });
      const crossUidRes = await fetch(`${baseUrl}/api/withdrawals/wth-user-b`, {
        headers: headersA,
      });
      assert.equal(crossUidRes.status, 403);
      const crossBody = (await crossUidRes.json()) as any;
      assert.equal(crossBody.code, 'FORBIDDEN_CROSS_UID_ACCESS');

      // 4. Client A reading own withdrawal -> 200 OK
      const ownRes = await fetch(`${baseUrl}/api/withdrawals/wth-user-a`, {
        headers: headersA,
      });
      assert.equal(ownRes.status, 200);
      const ownBody = (await ownRes.json()) as any;
      assert.equal(ownBody.ok, true);
      assert.equal(ownBody.item.id, 'wth-user-a');
    });

    it('rejects client on admin route (403) and SUPER_ADMIN without explicit withdrawals.approve (403), allowing only explicit permission (200)', async () => {
      // 1. Regular client calling admin approve -> 403 FORBIDDEN_NOT_ADMIN
      const clientAdminRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth-user-a/approve`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-client-a' },
      });
      assert.equal(clientAdminRes.status, 403);

      // 2. Admin with SUPER_ADMIN + withdrawals.read (but NOT withdrawals.approve) -> 403 FORBIDDEN_WITHDRAWAL_PERMISSION
      const roAdminRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth-user-a/approve`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-admin-readonly',
          'x-admin-role': 'SUPER_ADMIN',
        },
      });
      assert.equal(roAdminRes.status, 403);
      const roBody = (await roAdminRes.json()) as any;
      assert.equal(roBody.code, 'FORBIDDEN_WITHDRAWAL_PERMISSION');
      assert.equal(roBody.requiredPermission, 'withdrawals.approve');

      // 3. Admin with explicit withdrawals.approve -> 200 OK
      const apAdminRes = await fetch(`${baseUrl}/api/admin/withdrawals/wth-user-a/approve`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-admin-approver' },
      });
      assert.equal(apAdminRes.status, 200);
      const apBody = (await apAdminRes.json()) as any;
      assert.equal(apBody.ok, true);
      assert.equal(apBody.status, 'APPROVED');
    });
  });
});
