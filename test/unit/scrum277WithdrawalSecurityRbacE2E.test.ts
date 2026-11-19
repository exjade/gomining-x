import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import {
  extractBearerToken,
  assertClientWithdrawalOwnership,
  requireWithdrawalClientAuth,
  requireWithdrawalAdminPermission,
  requireWithdrawalAuditActionPermission,
  type WithdrawalAuthzDependencies,
} from '../../server/services/withdrawalAuthzMiddleware.js';
import {
  sanitizeGrantedWithdrawalPermissions,
  canPerformAdminWithdrawalAction,
  evaluateAvailableWithdrawalActions,
} from '../../src/services/admin/withdrawalRbacService.js';

describe('SCRUM-277 (W02): Firestore Security Rules, Express AuthZ/RBAC Middleware & E2E Enforcement', () => {
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
    const clientRulesPath = resolve(process.cwd(), '../retiros-cliente-main/firestore.rules');
    if (existsSync(clientRulesPath)) {
      const clientRules = readFileSync(clientRulesPath, 'utf8').replace(/\r\n/g, '\n');
      assert.equal(
        rulesContent,
        clientRules,
        'firestore.rules MUST be byte-identical across Client and Admin/Backend isolated folders',
      );
    }
  });

  it('2. evaluates Admin UI RBAC permissions and state constraints without SUPER_ADMIN bypass or localStorage', () => {
    const sanitized = sanitizeGrantedWithdrawalPermissions([
      'SUPER_ADMIN',
      'withdrawals.read',
      'withdrawals.review',
      'withdrawals.approve',
      'invalid.perm',
    ]);
    assert.deepEqual(sanitized, ['withdrawals.read', 'withdrawals.review', 'withdrawals.approve']);

    // In REQUESTED state with read+review+approve (no reject):
    const actionsRequested = evaluateAvailableWithdrawalActions(sanitized, 'REQUESTED');
    assert.equal(actionsRequested.canRead, true);
    assert.equal(actionsRequested.canReview, true);
    assert.equal(actionsRequested.canApprove, true);
    assert.equal(actionsRequested.canReject, false);
    assert.equal(actionsRequested.canEdit, false);

    // In BROADCASTED state, even with withdrawals.edit and withdrawals.broadcast:
    const fullPerms = [
      'withdrawals.read',
      'withdrawals.edit',
      'withdrawals.broadcast',
      'withdrawals.reject',
    ];
    assert.equal(canPerformAdminWithdrawalAction(fullPerms, 'EDIT', 'BROADCASTED'), false);
    assert.equal(canPerformAdminWithdrawalAction(fullPerms, 'REJECT', 'BROADCASTED'), false);

    // COMPLETE requires confirmations >= requiredConfirmations
    assert.equal(
      canPerformAdminWithdrawalAction(fullPerms, 'COMPLETE', 'BROADCASTED', {
        hasTxHash: true,
        confirmations: 10,
        requiredConfirmations: 15,
      }),
      false,
    );
    assert.equal(
      canPerformAdminWithdrawalAction(fullPerms, 'COMPLETE', 'BROADCASTED', {
        hasTxHash: true,
        confirmations: 15,
        requiredConfirmations: 15,
      }),
      true,
    );
  });

  describe('3. E2E Express Middleware Enforcement (401 / 503 / 403 Anonymous / 403 Cross-UID / 403 Granular RBAC / 200 OK)', () => {
    let server: http.Server;
    let baseUrl = '';
    let authInitialized = true;

    const tokenStore: Record<string, any> = {
      'tok-client-a': {
        uid: 'uid-client-a',
        email: 'clientA@pouw.io',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      },
      'tok-client-b': {
        uid: 'uid-client-b',
        email: 'clientB@pouw.io',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      },
      'tok-anon': {
        uid: 'uid-anon-99',
        email: null,
        email_verified: false,
        firebase: { sign_in_provider: 'anonymous' },
      },
      'tok-admin-reviewer': {
        uid: 'uid-admin-reviewer',
        email: 'reviewer@pouw.io',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      },
      'tok-admin-approver': {
        uid: 'uid-admin-approver',
        email: 'approver@pouw.io',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      },
      'tok-admin-suspended': {
        uid: 'uid-admin-suspended',
        email: 'suspended@pouw.io',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      },
    };

    const adminDocs: Record<string, Record<string, unknown>> = {
      'uid-admin-reviewer': {
        uid: 'uid-admin-reviewer',
        email: 'reviewer@pouw.io',
        role: 'admin',
        status: 'ACTIVE',
        // Contains SUPER_ADMIN to prove it does NOT grant withdrawals.approve
        permissions: ['SUPER_ADMIN', 'withdrawals.read', 'withdrawals.review'],
      },
      'uid-admin-approver': {
        uid: 'uid-admin-approver',
        email: 'approver@pouw.io',
        role: 'admin',
        status: 'ACTIVE',
        permissions: [
          'withdrawals.read',
          'withdrawals.review',
          'withdrawals.approve',
          'withdrawals.reject',
          'withdrawals.broadcast',
        ],
      },
      'uid-admin-suspended': {
        uid: 'uid-admin-suspended',
        email: 'suspended@pouw.io',
        role: 'admin',
        status: 'SUSPENDED',
        permissions: ['withdrawals.read', 'withdrawals.approve'],
      },
    };

    const withdrawalRecords: Record<string, { id: string; userId: string; status: string }> = {
      'wth-101': { id: 'wth-101', userId: 'uid-client-a', status: 'REQUESTED' },
      'wth-202': { id: 'wth-202', userId: 'uid-client-b', status: 'REQUESTED' },
    };

    const deps: WithdrawalAuthzDependencies = {
      authAdapter: {
        isInitialized: () => authInitialized,
        getApp: () => null,
        verifyIdToken: async (idToken: string) => tokenStore[idToken] ?? null,
      },
      firestore: {
        collection: (name: string) => ({
          doc: (id: string) => ({
            get: async () => {
              if (name === 'admin_users' && adminDocs[id]) {
                return { exists: true, id, data: () => adminDocs[id] };
              }
              return { exists: false, id, data: () => undefined };
            },
            set: async () => undefined,
          }),
          get: async () => ({ docs: [] }),
        }),
      },
    };

    before(async () => {
      const testApp = express();
      testApp.use(express.json());

      // Client Route: GET /api/withdrawals/:id
      testApp.get(
        '/api/withdrawals/:id',
        requireWithdrawalClientAuth(deps),
        (req, res) => {
          const record = withdrawalRecords[String(req.params.id)];
          if (!record) {
            res.status(404).json({ ok: false, code: 'NOT_FOUND' });
            return;
          }
          const ownership = assertClientWithdrawalOwnership(
            req.withdrawalClient!.uid,
            record.userId,
          );
          if (!ownership.allowed) {
            res.status(ownership.status).json({
              ok: false,
              code: ownership.code,
              error: ownership.error,
            });
            return;
          }
          res.status(200).json({ ok: true, item: record, principal: req.withdrawalClient });
        },
      );

      // Admin Route: GET /api/admin/withdrawals
      testApp.get(
        '/api/admin/withdrawals',
        requireWithdrawalAdminPermission('withdrawals.read', deps),
        (req, res) => {
          res.status(200).json({
            ok: true,
            items: Object.values(withdrawalRecords),
            operator: req.withdrawalAdmin,
          });
        },
      );

      // Admin Action Route: POST /api/admin/withdrawals/:id/approve
      testApp.post(
        '/api/admin/withdrawals/:id/approve',
        requireWithdrawalAuditActionPermission('APPROVE', deps),
        (req, res) => {
          res.status(200).json({
            ok: true,
            withdrawalId: req.params.id,
            approvedBy: req.withdrawalAdmin!.uid,
          });
        },
      );

      server = http.createServer(testApp);
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

    it('enforces 401 on missing/invalid token, 503 when auth adapter is unavailable, and 403 on anonymous tokens', async () => {
      assert.equal(extractBearerToken(undefined), null);
      assert.equal(extractBearerToken('Basic abc'), null);
      assert.equal(extractBearerToken('Bearer my-token'), 'my-token');

      // 1. Missing Authorization header -> 401
      const resNoAuth = await fetch(`${baseUrl}/api/withdrawals/wth-101`);
      assert.equal(resNoAuth.status, 401);
      const bodyNoAuth = (await resNoAuth.json()) as any;
      assert.equal(bodyNoAuth.code, 'UNAUTHENTICATED');

      // 2. Invalid token -> 401
      const resBadTok = await fetch(`${baseUrl}/api/withdrawals/wth-101`, {
        headers: { Authorization: 'Bearer unknown-token' },
      });
      assert.equal(resBadTok.status, 401);
      const bodyBadTok = (await resBadTok.json()) as any;
      assert.equal(bodyBadTok.code, 'INVALID_AUTH_TOKEN');

      // 3. Auth adapter unavailable -> 503 fail-closed
      authInitialized = false;
      try {
        const resDown = await fetch(`${baseUrl}/api/withdrawals/wth-101`, {
          headers: { Authorization: 'Bearer tok-client-a' },
        });
        assert.equal(resDown.status, 503);
        const bodyDown = (await resDown.json()) as any;
        assert.equal(bodyDown.code, 'AUTH_RUNTIME_UNAVAILABLE');
      } finally {
        authInitialized = true;
      }

      // 4. Anonymous token -> 403 ANONYMOUS_AUTH_FORBIDDEN
      const resAnon = await fetch(`${baseUrl}/api/withdrawals/wth-101`, {
        headers: { Authorization: 'Bearer tok-anon' },
      });
      assert.equal(resAnon.status, 403);
      const bodyAnon = (await resAnon.json()) as any;
      assert.equal(bodyAnon.code, 'ANONYMOUS_AUTH_FORBIDDEN');
    });

    it('enforces strict UID isolation on client withdrawal reads (403 on cross-UID, 200 on own UID)', async () => {
      // Client A trying to read Client B's withdrawal wth-202 -> 403
      const crossRes = await fetch(`${baseUrl}/api/withdrawals/wth-202`, {
        headers: { Authorization: 'Bearer tok-client-a' },
      });
      assert.equal(crossRes.status, 403);
      const crossBody = (await crossRes.json()) as any;
      assert.equal(crossBody.code, 'FORBIDDEN_CROSS_UID_ACCESS');

      // Client A reading own withdrawal wth-101 -> 200
      const ownRes = await fetch(`${baseUrl}/api/withdrawals/wth-101`, {
        headers: { Authorization: 'Bearer tok-client-a' },
      });
      assert.equal(ownRes.status, 200);
      const ownBody = (await ownRes.json()) as any;
      assert.equal(ownBody.ok, true);
      assert.equal(ownBody.item.id, 'wth-101');
      assert.equal(ownBody.principal.uid, 'uid-client-a');
    });

    it('enforces granular admin RBAC permissions fail-closed (blocks non-admin, suspended admin, and SUPER_ADMIN without explicit permission)', async () => {
      // 1. Regular client calling admin endpoint -> 403 FORBIDDEN_NOT_ADMIN
      const clientOnAdmin = await fetch(`${baseUrl}/api/admin/withdrawals`, {
        headers: { Authorization: 'Bearer tok-client-a' },
      });
      assert.equal(clientOnAdmin.status, 403);
      const clientOnAdminBody = (await clientOnAdmin.json()) as any;
      assert.equal(clientOnAdminBody.code, 'FORBIDDEN_NOT_ADMIN');

      // 2. Suspended admin -> 403 FORBIDDEN_NOT_ADMIN
      const suspendedRes = await fetch(`${baseUrl}/api/admin/withdrawals`, {
        headers: { Authorization: 'Bearer tok-admin-suspended' },
      });
      assert.equal(suspendedRes.status, 403);
      const suspendedBody = (await suspendedRes.json()) as any;
      assert.equal(suspendedBody.code, 'FORBIDDEN_NOT_ADMIN');

      // 3. Reviewer admin can read (/api/admin/withdrawals -> 200)
      const reviewerRead = await fetch(`${baseUrl}/api/admin/withdrawals`, {
        headers: { Authorization: 'Bearer tok-admin-reviewer' },
      });
      assert.equal(reviewerRead.status, 200);

      // 4. Reviewer admin (even with SUPER_ADMIN string in permissions and spoofed headers) cannot approve -> 403 FORBIDDEN_WITHDRAWAL_PERMISSION
      const reviewerApprove = await fetch(
        `${baseUrl}/api/admin/withdrawals/wth-101/approve`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer tok-admin-reviewer',
            'x-admin-role': 'SUPER_ADMIN',
            'x-admin-permissions': 'withdrawals.approve',
          },
        },
      );
      assert.equal(reviewerApprove.status, 403);
      const reviewerApproveBody = (await reviewerApprove.json()) as any;
      assert.equal(reviewerApproveBody.code, 'FORBIDDEN_WITHDRAWAL_PERMISSION');
      assert.equal(reviewerApproveBody.requiredPermission, 'withdrawals.approve');

      // 5. Approver admin with explicit withdrawals.approve -> 200 OK
      const approverRes = await fetch(
        `${baseUrl}/api/admin/withdrawals/wth-101/approve`,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer tok-admin-approver' },
        },
      );
      assert.equal(approverRes.status, 200);
      const approverBody = (await approverRes.json()) as any;
      assert.equal(approverBody.ok, true);
      assert.equal(approverBody.approvedBy, 'uid-admin-approver');
    });
  });
});
