// In-memory polyfills for browser globals (localStorage and window/CustomEvent) in Node.js test environment
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

if (typeof (globalThis as any).window === 'undefined') {
  const listeners: Record<string, Array<(event: any) => void>> = {};
  (globalThis as any).window = {
    location: {
      origin: 'http://localhost:3001',
      protocol: 'http:',
      search: '',
      pathname: '/',
    },
    addEventListener: (type: string, listener: any) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(listener);
    },
    removeEventListener: (type: string, listener: any) => {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((l) => l !== listener);
    },
    dispatchEvent: (event: any) => {
      const arr = listeners[event.type] || [];
      for (const listener of arr) {
        listener(event);
      }
      return true;
    },
  };
  (globalThis as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, params?: { detail?: any }) {
      this.type = type;
      this.detail = params?.detail;
    }
  };
}

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  app,
  requireAdmin,
  getAuthenticatedUser,
  setUsersFilePath,
  writeUsers,
  readContracts,
  writeContracts,
  readOrders,
  writeOrders,
  type UserAccount,
} from '../../server/server.js';
import { firebaseAdminAuthAdapter } from '../../server/services/firebaseAdminAuthAdapter.js';
import { StorefrontControlService } from '../../src/services/admin/storefrontControlService.js';

interface RouteTarget {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: Record<string, any>;
}

// Complete inventory of all 38 protected admin endpoint targets (Explorer 2 & 3 inventory)
const PROTECTED_ADMIN_ROUTES: RouteTarget[] = [
  // 1-2. Server Configuration
  { method: 'GET', path: '/api/config' },
  { method: 'POST', path: '/api/config', body: { vastConfig: {} } },

  // 3-4. Admin Contracts
  { method: 'GET', path: '/api/admin/contracts' },
  { method: 'POST', path: '/api/admin/contracts', body: { id: 'test_contract_scrum237' } },

  // 5-6. Admin Orders
  { method: 'GET', path: '/api/admin/orders' },
  { method: 'POST', path: '/api/admin/orders', body: { orderId: 'test_order_scrum237' } },

  // 7. Storefront Sections Mutation (GET is public)
  { method: 'POST', path: '/api/admin/storefront-sections', body: { showPresale: true } },

  // 8-9. Legacy Packages Mutation (GET is public legacy read)
  { method: 'POST', path: '/api/packages', body: { name: 'Legacy Package 1' } },
  { method: 'POST', path: '/api/commercial-packages', body: { name: 'Legacy Package 2' } },

  // 10-15. Vast.ai Configuration & GPU Management
  { method: 'GET', path: '/api/vast/config' },
  { method: 'POST', path: '/api/vast/config', body: { enabled: true } },
  { method: 'POST', path: '/api/vast/test-account', body: { apiKey: 'test_vast_api_key' } },
  { method: 'GET', path: '/api/vast/instances' },
  { method: 'POST', path: '/api/vast/instances', body: { offerId: '100' } },
  { method: 'POST', path: '/api/vast/instances/test-inst-1/stop', body: {} },
  { method: 'DELETE', path: '/api/vast/instances/test-inst-1' },

  // 16-21. Strategy Engine
  { method: 'GET', path: '/api/strategies' },
  { method: 'POST', path: '/api/strategies', body: { name: 'Test Strategy' } },
  { method: 'POST', path: '/api/strategies/strat-1/enable', body: {} },
  { method: 'POST', path: '/api/strategies/strat-1/disable', body: {} },
  { method: 'GET', path: '/api/strategies/audit' },
  { method: 'POST', path: '/api/strategies/evaluate', body: {} },

  // 22-32. SaladCloud Operations
  { method: 'POST', path: '/api/salad/test-account', body: { organizationName: 'org-test', apiKey: 'salad_test_key' } },
  { method: 'POST', path: '/api/salad/all-active', body: { accounts: [] } },
  { method: 'POST', path: '/api/salad/reallocate', body: { organizationName: 'org', projectName: 'proj', containerGroupName: 'grp', instanceId: 'inst', apiKey: 'key' } },
  { method: 'POST', path: '/api/salad/restart-instance', body: { organizationName: 'org', projectName: 'proj', containerGroupName: 'grp', instanceId: 'inst', apiKey: 'key' } },
  { method: 'POST', path: '/api/salad/recreate-instance', body: { organizationName: 'org', projectName: 'proj', containerGroupName: 'grp', instanceId: 'inst', apiKey: 'key' } },
  { method: 'GET', path: '/api/salad/quotas?org=myorg&apiKey=salad_key' },
  { method: 'GET', path: '/api/salad/gpu-classes?org=myorg&apiKey=salad_key' },
  { method: 'POST', path: '/api/salad/container-group/control', body: { organizationName: 'org', projectName: 'proj', containerGroupName: 'grp', action: 'start', apiKey: 'key' } },
  { method: 'POST', path: '/api/salad/account-balance', body: { balanceUSD: 25.5 } },
  { method: 'GET', path: '/api/salad/balance' },
  { method: 'GET', path: '/api/salad/logs/org/proj/grp/inst1' },

  // 33-34. Telegram Bot Integration
  { method: 'POST', path: '/api/telegram/test', body: { token: 'mock_bot_token', chatId: '123456' } },
  { method: 'POST', path: '/api/telegram/send-status', body: { token: 'mock_bot_token', chatId: '123456' } },

  // 35-36. Fleet Autoscale
  { method: 'GET', path: '/api/fleet/autoscale' },
  { method: 'POST', path: '/api/fleet/autoscale', body: { enabled: true } },

  // 37. Fintech Accounting Audit
  { method: 'GET', path: '/api/fintech/audit' },
];

describe('SCRUM-237: Admin API AuthZ Hardening Suite', () => {
  let server: http.Server;
  let baseUrl: string;
  let serverPort: number;
  let tempDir: string;
  let tempUsersFile: string;
  let originalFetch: typeof globalThis.fetch;
  let initialContractsBackup: any[];
  let initialOrdersBackup: any[];

  const adminUidA = 'admin_uid_scrum237_A';
  const adminEmailA = 'adminA@minerx.cloud';
  const adminTokenA = 'bearer_mock_admin_token_A';

  const adminUidB = 'admin_uid_scrum237_B';
  const adminEmailB = 'adminB@minerx.cloud';
  const adminTokenB = 'bearer_mock_admin_token_B';

  const nonAdminUid = 'client_user_scrum237';
  const nonAdminEmail = 'client@minerx.cloud';
  const nonAdminToken = 'bearer_mock_client_token';

  const expiredToken = 'bearer_mock_expired_token';
  const invalidToken = 'bearer_mock_invalid_token';

  beforeEach(async () => {
    // 0. Backup contracts and orders disk state for strict test isolation
    initialContractsBackup = JSON.parse(JSON.stringify(readContracts()));
    initialOrdersBackup = JSON.parse(JSON.stringify(readOrders()));

    // 1. Temporary users.json isolation
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrum237-auth-'));
    tempUsersFile = path.join(tempDir, 'users.json');
    setUsersFilePath(tempUsersFile);

    const initialUsers: UserAccount[] = [
      {
        id: adminUidA,
        firebaseAuthUid: adminUidA,
        username: 'adminA',
        email: adminEmailA,
        fullName: 'Admin User A',
        role: 'admin',
        passwordHash: '',
        createdAt: '2026-11-15T00:00:00.000Z',
        isStoredInFirebaseAuth: true,
      },
      {
        id: adminUidB,
        firebaseAuthUid: adminUidB,
        username: 'adminB',
        email: adminEmailB,
        fullName: 'Admin User B',
        role: 'admin',
        passwordHash: '',
        createdAt: '2026-11-15T00:00:00.000Z',
        isStoredInFirebaseAuth: true,
      },
      {
        id: nonAdminUid,
        firebaseAuthUid: nonAdminUid,
        username: 'clientUser',
        email: nonAdminEmail,
        fullName: 'Regular Non-Admin User',
        role: 'client', // Not admin!
        passwordHash: '',
        createdAt: '2026-11-15T00:00:00.000Z',
        isStoredInFirebaseAuth: true,
      },
    ];
    writeUsers({ users: initialUsers });

    // 2. Firebase Admin Auth Adapter Mock
    firebaseAdminAuthAdapter.setAuthInstance({
      verifyIdToken: async (token: string) => {
        if (token === adminTokenA) {
          return { uid: adminUidA, email: adminEmailA, name: 'Admin A' };
        }
        if (token === adminTokenB) {
          return { uid: adminUidB, email: adminEmailB, name: 'Admin B' };
        }
        if (token === nonAdminToken) {
          return { uid: nonAdminUid, email: nonAdminEmail, name: 'Regular Client' };
        }
        if (token === expiredToken) {
          throw new Error('Firebase ID token has expired');
        }
        throw new Error('Firebase ID token verification failed');
      },
      getUser: async (uid: string) => {
        if (uid === adminUidA) return { uid: adminUidA, email: adminEmailA };
        if (uid === adminUidB) return { uid: adminUidB, email: adminEmailB };
        if (uid === nonAdminUid) return { uid: nonAdminUid, email: nonAdminEmail };
        return null;
      },
      getUserByEmail: async (email: string) => {
        if (email.toLowerCase() === adminEmailA.toLowerCase()) return { uid: adminUidA, email: adminEmailA };
        if (email.toLowerCase() === adminEmailB.toLowerCase()) return { uid: adminUidB, email: adminEmailB };
        if (email.toLowerCase() === nonAdminEmail.toLowerCase()) return { uid: nonAdminUid, email: nonAdminEmail };
        return null;
      },
    });

    // 3. Local ephemeral HTTP server binding explicitly on 127.0.0.1
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    // 4. Selective Fetch Interceptor (§27 Compliance: zero external side-effects)
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: any, init?: any) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.startsWith(`http://127.0.0.1:${serverPort}`) || urlStr.startsWith(baseUrl)) {
        return originalFetch(input, init);
      }
      if (urlStr.includes('api.telegram.org')) {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 8888 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('api.salad.com')) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('vast.ai')) {
        return new Response(JSON.stringify({ success: true, balance: 42.0, user: { balance: 42.0 }, offers: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('pool.kryptex.com')) {
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`[Security Violation] Unmocked live external call intercepted: ${urlStr}`);
    };
  });

  afterEach(async () => {
    // Restore contracts and orders disk state
    if (initialContractsBackup) writeContracts(initialContractsBackup);
    if (initialOrdersBackup) writeOrders(initialOrdersBackup);

    globalThis.fetch = originalFetch;
    setUsersFilePath(null);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}

    // Clean up created user directories under data/users/
    const dataUsersDir = path.join(process.cwd(), 'server', 'data', 'users');
    for (const testUid of [adminUidA, adminUidB, nonAdminUid, 'attacker_uid', 'victim_admin']) {
      try {
        const uDir = path.join(dataUsersDir, testUid);
        if (fs.existsSync(uDir)) {
          fs.rmSync(uDir, { recursive: true, force: true });
        }
      } catch {}
    }

    if (server) {
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // ==========================================================================
  // Section 1: Parametric 401 Testing Across All 38 Protected Admin Endpoints
  // ==========================================================================
  describe('AC1 & AC5: Parametric 401 Security Barrier (38 Endpoints)', () => {
    it('rejects anonymous requests without authorization header with 401 across all 38 endpoints', async () => {
      for (const target of PROTECTED_ADMIN_ROUTES) {
        const url = `${baseUrl}${target.path}`;
        const init: RequestInit = {
          method: target.method,
          headers: target.body ? { 'Content-Type': 'application/json' } : {},
          body: target.body ? JSON.stringify(target.body) : undefined,
        };
        const res = await fetch(url, init);
        assert.equal(
          res.status,
          401,
          `Expected 401 for anonymous request to ${target.method} ${target.path}, got ${res.status}`
        );
      }
    });

    it('rejects requests with invalid Bearer token with 401 across all 38 endpoints', async () => {
      for (const target of PROTECTED_ADMIN_ROUTES) {
        const url = `${baseUrl}${target.path}`;
        const init: RequestInit = {
          method: target.method,
          headers: {
            Authorization: `Bearer ${invalidToken}`,
            ...(target.body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: target.body ? JSON.stringify(target.body) : undefined,
        };
        const res = await fetch(url, init);
        assert.equal(
          res.status,
          401,
          `Expected 401 for invalid token to ${target.method} ${target.path}, got ${res.status}`
        );
      }
    });

    it('rejects requests with expired Firebase ID token with 401 across all 38 endpoints', async () => {
      for (const target of PROTECTED_ADMIN_ROUTES) {
        const url = `${baseUrl}${target.path}`;
        const init: RequestInit = {
          method: target.method,
          headers: {
            Authorization: `Bearer ${expiredToken}`,
            ...(target.body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: target.body ? JSON.stringify(target.body) : undefined,
        };
        const res = await fetch(url, init);
        assert.equal(
          res.status,
          401,
          `Expected 401 for expired token to ${target.method} ${target.path}, got ${res.status}`
        );
      }
    });

    it('rejects requests from valid Firebase non-admin users with 401 across all 38 endpoints', async () => {
      for (const target of PROTECTED_ADMIN_ROUTES) {
        const url = `${baseUrl}${target.path}`;
        const init: RequestInit = {
          method: target.method,
          headers: {
            Authorization: `Bearer ${nonAdminToken}`,
            ...(target.body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: target.body ? JSON.stringify(target.body) : undefined,
        };
        const res = await fetch(url, init);
        assert.equal(
          res.status,
          401,
          `Expected 401 for non-admin user to ${target.method} ${target.path}, got ${res.status}`
        );
      }
    });
  });

  // ==========================================================================
  // Section 2: AC5 Storefront Sections Policy (GET Public, POST Protected)
  // ==========================================================================
  describe('AC5: Storefront Sections Policy', () => {
    it('allows anonymous GET /api/admin/storefront-sections returning HTTP 200 (Client compatibility)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/storefront-sections`);
      assert.equal(res.status, 200, 'GET /api/admin/storefront-sections must be publicly accessible');
      const data = await res.json() as any;
      assert.ok(typeof data === 'object', 'Must return sections config object');
    });

    it('rejects anonymous POST /api/admin/storefront-sections with 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/storefront-sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showPresale: false }),
      });
      assert.equal(res.status, 401, 'Anonymous modification of storefront sections must be blocked');
    });

    it('allows authorized Admin POST /api/admin/storefront-sections and attributes updatedBy to admin.id', async () => {
      const res = await fetch(`${baseUrl}/api/admin/storefront-sections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({ showPresale: false, updatedBy: 'untrusted_spoofed_identity' }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      // Untrusted body updatedBy must be overridden by admin.id
      assert.equal(data.config.updatedBy, adminUidA, 'updatedBy must be server-authoritative admin.id');
      assert.equal(data.config.showPresale, false);
    });
  });

  // ==========================================================================
  // Section 3: AC5 Legacy Packages Policy (GET Public Legacy Read, POST Protected)
  // ==========================================================================
  describe('AC5: Legacy Packages Policy', () => {
    it('allows anonymous GET /api/packages and /api/commercial-packages returning 200 and X-Catalog-Legacy headers', async () => {
      for (const p of ['/api/packages', '/api/commercial-packages']) {
        const res = await fetch(`${baseUrl}${p}`);
        assert.equal(res.status, 200, `GET ${p} must be public for backward compatibility`);
        assert.equal(res.headers.get('x-catalog-legacy'), 'true');
        assert.ok(res.headers.get('x-catalog-notice')?.includes('Legacy'));
      }
    });

    it('rejects anonymous POST to /api/packages and /api/commercial-packages with 401', async () => {
      for (const p of ['/api/packages', '/api/commercial-packages']) {
        const res = await fetch(`${baseUrl}${p}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Hacker Package', priceUsdt: 1 }),
        });
        assert.equal(res.status, 401, `Anonymous POST ${p} must be rejected with 401`);
      }
    });

    it('allows authorized Admin POST /api/packages returning 200 and legacy headers', async () => {
      const res = await fetch(`${baseUrl}/api/packages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({ name: 'Authorized Admin Package', priceUsdt: 500 }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-catalog-legacy'), 'true');
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.equal(data.package.name, 'Authorized Admin Package');
    });
  });

  // ==========================================================================
  // Section 4: AC4 Order Settlement Decoupling (No Default SETTLED on New Orders)
  // ==========================================================================
  describe('AC4: Order Settlement Decoupling', () => {
    it('defaults new order to PENDING instead of SETTLED when status is omitted', async () => {
      const res = await fetch(`${baseUrl}/api/admin/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          orderId: `ord_decouple_new_${Date.now()}`,
          packageId: 'pkg_test_1',
          amount: 250,
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.equal(
        data.order.status,
        'PENDING',
        'New order must default to PENDING, never SETTLED'
      );
    });

    it('does not allow untrusted body status: SETTLED to force immediate settlement on new orders', async () => {
      const res = await fetch(`${baseUrl}/api/admin/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          orderId: `ord_spoofed_settle_${Date.now()}`,
          packageId: 'pkg_test_2',
          amount: 1000,
          status: 'SETTLED', // Attacker attempts to forge settled status
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.notEqual(
        data.order.status,
        'SETTLED',
        'Body status: SETTLED must NOT force a new order into SETTLED status without settlement pipeline'
      );
      assert.equal(data.order.status, 'PENDING');
    });
  });

  // ==========================================================================
  // Section 5: AC2 & §28 Identity Propagation (admin.id Isolation vs usr_default_admin)
  // ==========================================================================
  describe('AC2 & §28: Identity Propagation and Isolation', () => {
    it('Admin A config write is stored under Admin A id and isolated from usr_default_admin and Admin B', async () => {
      // 1. Admin A writes sensitive config
      const resA = await fetch(`${baseUrl}/api/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          vastConfig: { apiKey: 'secret_key_admin_A_999', enabled: true },
          appSettings: { telegramBotToken: 'token_A' },
          kryptexConfig: { walletAddress: 'wallet_A_address', coin: 'prl' },
        }),
      });
      assert.equal(resA.status, 200);
      const dataA = await resA.json() as any;
      assert.equal(dataA.userId, adminUidA, 'Returned userId must strictly match admin.id');

      // 2. Verify file persisted under Admin A directory
      const dataUsersDir = path.join(process.cwd(), 'server', 'data', 'users');
      const adminAConfigFile = path.join(dataUsersDir, adminUidA, 'config.json');
      assert.ok(fs.existsSync(adminAConfigFile), `Config file must exist at ${adminAConfigFile}`);
      const adminAContent = JSON.parse(fs.readFileSync(adminAConfigFile, 'utf-8'));
      assert.equal(adminAContent.vastConfig?.apiKey, 'secret_key_admin_A_999');

      // 3. Verify usr_default_admin was NOT mutated with Admin A secrets
      const defaultAdminConfigFile = path.join(dataUsersDir, 'usr_default_admin', 'config.json');
      if (fs.existsSync(defaultAdminConfigFile)) {
        const defaultAdminContent = JSON.parse(fs.readFileSync(defaultAdminConfigFile, 'utf-8'));
        assert.notEqual(
          defaultAdminContent.vastConfig?.apiKey,
          'secret_key_admin_A_999',
          'usr_default_admin config must never receive Admin A secrets'
        );
      }

      // 4. Admin B reads /api/config and does not receive Admin A secrets
      const resB = await fetch(`${baseUrl}/api/config`, {
        headers: {
          Authorization: `Bearer ${adminTokenB}`,
        },
      });
      assert.equal(resB.status, 200);
      const dataB = await resB.json() as any;
      assert.notEqual(
        dataB.vastConfig?.apiKey,
        'secret_key_admin_A_999',
        'Admin B must not access Admin A configuration'
      );
    });

    it('Vast config GET & POST propagates admin.id without usr_default_admin fallback', async () => {
      // Admin A sets Vast config
      const postRes = await fetch(`${baseUrl}/api/vast/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          apiKey: 'vast_admin_A_12345678',
          enabled: true,
        }),
      });
      assert.equal(postRes.status, 200);

      // Admin A reads Vast config -> maskedKey shows proper format
      const getResA = await fetch(`${baseUrl}/api/vast/config`, {
        headers: {
          Authorization: `Bearer ${adminTokenA}`,
        },
      });
      assert.equal(getResA.status, 200);
      const cfgA = await getResA.json() as any;
      assert.equal(cfgA.enabled, true);
      assert.equal(cfgA.hasKey, true);
      assert.ok(cfgA.maskedKey.startsWith('vast'));

      // Admin B reads Vast config -> does not have Admin A key
      const getResB = await fetch(`${baseUrl}/api/vast/config`, {
        headers: {
          Authorization: `Bearer ${adminTokenB}`,
        },
      });
      assert.equal(getResB.status, 200);
      const cfgB = await getResB.json() as any;
      assert.equal(cfgB.hasKey, false);
      assert.equal(cfgB.maskedKey, 'No configurada');
    });
  });

  // ==========================================================================
  // Section 6: Spoofing Immunity (req.body Identity Tampering Ignored)
  // ==========================================================================
  describe('Spoofing Immunity', () => {
    it('ignores attacker body fields (userId, updatedBy, role, adminId) across hardened endpoints', async () => {
      // 1. POST /api/config with spoofed userId
      const resConfig = await fetch(`${baseUrl}/api/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          userId: 'victim_admin',
          updatedBy: 'attacker',
          role: 'superadmin',
          vastConfig: { apiKey: 'spoofed_test_key' },
        }),
      });
      assert.equal(resConfig.status, 200);
      const bodyConfig = await resConfig.json() as any;
      assert.equal(bodyConfig.userId, adminUidA, 'Server must enforce authenticated admin.id over body.userId');

      const dataUsersDir = path.join(process.cwd(), 'server', 'data', 'users');
      assert.equal(
        fs.existsSync(path.join(dataUsersDir, 'victim_admin', 'config.json')),
        false,
        'Must not write to spoofed victim_admin path'
      );
    });
  });

  // ==========================================================================
  // Section 7: Preserved Public Routes Verification
  // ==========================================================================
  describe('AC5: Preserved Public Routes Contract', () => {
    it('preserves public access (200 OK) for designated telemetry and marketplace routes', async () => {
      const publicEndpoints = [
        '/api/health',
        '/api/catalog/storefront?section=preventa',
        '/api/vast/offers',
        '/api/history',
        '/api/kryptex/pool',
        '/api/kryptex/rates',
        '/api/kryptex/daily-revenue',
      ];

      for (const endpoint of publicEndpoints) {
        const res = await fetch(`${baseUrl}${endpoint}`);
        assert.equal(
          res.status,
          200,
          `Expected 200 OK for public route ${endpoint}, got ${res.status}`
        );
      }
    });

    it('preserves canonical catalog gates on /api/catalog/admin', async () => {
      const anonRes = await fetch(`${baseUrl}/api/catalog/admin`);
      assert.equal(anonRes.status, 401, 'Anonymous /api/catalog/admin must fail with 401');

      const adminRes = await fetch(`${baseUrl}/api/catalog/admin`, {
        headers: { Authorization: `Bearer ${adminTokenA}` },
      });
      assert.equal(adminRes.status, 200, 'Admin /api/catalog/admin must succeed with 200');
    });
  });

  // ==========================================================================
  // Section 8: Admin Client StorefrontControlService Integration
  // ==========================================================================
  describe('AC8 & AC11: Admin Client StorefrontControlService Integration', () => {
    it('verifies storefrontControlService source code no longer calls raw unauthenticated fetch', () => {
      const serviceFilePath = path.join(
        process.cwd(),
        'src',
        'services',
        'admin',
        'storefrontControlService.ts'
      );
      const fileContent = fs.readFileSync(serviceFilePath, 'utf-8');
      assert.ok(
        !fileContent.includes("fetch('http://127.0.0.1:3001/api/admin/storefront-sections'"),
        'storefrontControlService.ts must NOT use raw unauthenticated fetch'
      );
      assert.ok(
        fileContent.includes("apiFetch('/api/admin/storefront-sections'"),
        'storefrontControlService.ts must use apiFetch'
      );
    });

    it('StorefrontControlService updates section toggle using apiFetch with bearer token', async () => {
      // Configure localStorage to point to ephemeral test server with valid admin token
      (globalThis as any).localStorage.setItem(
        'minerx_settings',
        JSON.stringify({ backendUrl: baseUrl })
      );
      (globalThis as any).localStorage.setItem('minerx_auth_token', adminTokenA);

      const service = StorefrontControlService.getInstance();
      const updated = await service.updateSectionToggle('showPresale', false);
      assert.equal(updated.showPresale, false);

      // Verify server received and persisted change
      const verifyRes = await fetch(`${baseUrl}/api/admin/storefront-sections`);
      assert.equal(verifyRes.status, 200);
      const serverConfig = await verifyRes.json() as any;
      assert.equal(serverConfig.showPresale, false);
      assert.equal(serverConfig.updatedBy, adminUidA);
    });
  });

  // ==========================================================================
  // Section 9: AC6 & F3: Authorized Admin Operational Success Verification
  // ==========================================================================
  describe('AC6 & F3: Authorized Admin Operational Success Verification', () => {
    // 1. Strategies Operational Action
    it('allows authorized Admin to manage and create strategies (POST & GET /api/strategies)', async () => {
      const stratId = `strat_success_${Date.now()}`;
      const postRes = await fetch(`${baseUrl}/api/strategies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          id: stratId,
          name: 'Authorized Strategy A',
          type: 'threshold',
          enabled: true,
          config: { targetMargin: 0.25 },
        }),
      });
      assert.equal(postRes.status, 200, 'Admin must be permitted to save strategy');
      const postData = await postRes.json() as any;
      assert.equal(postData.success, true);
      assert.equal(postData.strategy.id, stratId);

      const getRes = await fetch(`${baseUrl}/api/strategies`, {
        headers: { Authorization: `Bearer ${adminTokenA}` },
      });
      assert.equal(getRes.status, 200);
      const getData = await getRes.json() as any;
      assert.equal(getData.success, true);
      assert.ok(Array.isArray(getData.strategies));
      assert.ok(getData.strategies.some((s: any) => s.id === stratId));
    });

    // 2. Vast.ai Operational Action
    it('allows authorized Admin to execute Vast operational account check (POST /api/vast/test-account)', async () => {
      const res = await fetch(`${baseUrl}/api/vast/test-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({ apiKey: 'vast_mock_api_key_valid' }),
      });
      assert.equal(res.status, 200, 'Admin must be permitted to test Vast account');
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.equal(data.user.balance, 42.0);

      const instRes = await fetch(`${baseUrl}/api/vast/instances`, {
        headers: { Authorization: `Bearer ${adminTokenA}` },
      });
      assert.equal(instRes.status, 200);
      const instData = await instRes.json() as any;
      assert.equal(instData.success, true);
      assert.ok(Array.isArray(instData.instances));
    });

    // 3. SaladCloud Operational Action
    it('allows authorized Admin to execute Salad container control action (POST /api/salad/container-group/control)', async () => {
      const res = await fetch(`${baseUrl}/api/salad/container-group/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          organizationName: 'test-org',
          projectName: 'test-proj',
          containerGroupName: 'test-grp',
          action: 'start',
          apiKey: 'salad_mock_key',
        }),
      });
      assert.equal(res.status, 200, 'Admin must be permitted to start container group');
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.ok(data.message.includes('start'));

      const testAccRes = await fetch(`${baseUrl}/api/salad/test-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          organizationName: 'test-org',
          apiKey: 'salad_mock_key',
        }),
      });
      assert.equal(testAccRes.status, 200);
      const testAccData = await testAccRes.json() as any;
      assert.equal(testAccData.success, true);
    });

    // 4. Telegram Bot Operational Action
    it('allows authorized Admin to trigger Telegram integration test (POST /api/telegram/test)', async () => {
      const res = await fetch(`${baseUrl}/api/telegram/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          token: 'mock_telegram_token',
          chatId: '12345678',
          customMessage: 'Admin authorized test message',
        }),
      });
      assert.equal(res.status, 200, 'Admin must be permitted to send Telegram test message');
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.equal(data.telegramResult.message_id, 8888);
    });

    // 5. Fleet Autoscale Operational Action
    it('allows authorized Admin to configure and read Fleet autoscale policy (POST & GET /api/fleet/autoscale)', async () => {
      const postRes = await fetch(`${baseUrl}/api/fleet/autoscale`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          enabled: true,
          minInstances: 3,
          maxInstances: 9,
        }),
      });
      assert.equal(postRes.status, 200, 'Admin must be permitted to update fleet autoscale');
      const postData = await postRes.json() as any;
      assert.equal(postData.success, true);
      assert.equal(postData.autoscaleConfig.enabled, true);
      assert.equal(postData.autoscaleConfig.minInstances, 3);
      assert.equal(postData.autoscaleConfig.maxInstances, 9);

      const getRes = await fetch(`${baseUrl}/api/fleet/autoscale`, {
        headers: { Authorization: `Bearer ${adminTokenA}` },
      });
      assert.equal(getRes.status, 200);
      const getData = await getRes.json() as any;
      assert.equal(getData.enabled, true);
      assert.equal(getData.minInstances, 3);
    });

    // 6. Fintech Accounting Audit Read
    it('allows authorized Admin to read Fintech accounting audit reconciliation (GET /api/fintech/audit)', async () => {
      const res = await fetch(`${baseUrl}/api/fintech/audit`, {
        headers: { Authorization: `Bearer ${adminTokenA}` },
      });
      assert.equal(res.status, 200, 'Admin must be permitted to read fintech audit');
      const data = await res.json() as any;
      assert.ok(typeof data === 'object');
      assert.ok(typeof data.capitalBolsilloUSD === 'number');
      assert.ok(typeof data.efectivoCobradoUSD === 'number');
      assert.ok(data.rutas && typeof data.rutas === 'object');
    });
  });

  // ==========================================================================
  // Section 10: AC4 & F1: Existing Order Settlement Adversarial Barrier
  // ==========================================================================
  describe('AC4 & F1: Existing Order Settlement Adversarial Barrier', () => {
    it('blocks transition to SETTLED when client sends status: SETTLED for an existing unsettled order', async () => {
      const orderId = `ord_exist_pending_${Date.now()}`;

      // 1. Create a legitimate pending order
      const createRes = await fetch(`${baseUrl}/api/admin/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          orderId,
          packageId: 'pkg_miner_standard',
          amount: 750,
          status: 'PENDING',
        }),
      });
      assert.equal(createRes.status, 200);
      const createData = await createRes.json() as any;
      assert.equal(createData.order.status, 'PENDING');

      // 2. Adversarial update: attempt to force transition to SETTLED
      const updateRes = await fetch(`${baseUrl}/api/admin/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          orderId,
          status: 'SETTLED', // Malicious attempt to force settlement
          notes: 'Client attempted settlement transition',
        }),
      });
      assert.equal(updateRes.status, 200);
      const updateData = await updateRes.json() as any;
      assert.notEqual(
        updateData.order.status,
        'SETTLED',
        'Existing unsettled order must NOT transition to SETTLED via body.status'
      );
      assert.equal(updateData.order.status, 'PENDING');
      assert.equal(updateData.order.notes, 'Client attempted settlement transition');

      // 3. Verify disk persistence integrity
      const persisted = readOrders().find((o: any) => o.orderId === orderId);
      assert.ok(persisted, 'Order must exist in persistence');
      assert.equal(persisted.status, 'PENDING');
    });

    it('preserves existing legitimate SETTLED status when administrative updates modify other fields', async () => {
      const orderId = `ord_exist_settled_${Date.now()}`;

      // 1. Pre-seed a legitimately settled order directly into storage
      const orders = readOrders();
      orders.unshift({
        orderId,
        packageId: 'pkg_settled_vip',
        amount: 2500,
        status: 'SETTLED',
        createdAt: new Date().toISOString(),
        settledAt: new Date().toISOString(),
      });
      writeOrders(orders);

      // 2. Admin updates auxiliary fields (e.g. notes, tracking ID)
      const updateRes = await fetch(`${baseUrl}/api/admin/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          orderId,
          notes: 'Administrative tracking: invoice mailed',
          trackingNumber: 'TRACK-998877',
        }),
      });
      assert.equal(updateRes.status, 200);
      const updateData = await updateRes.json() as any;
      assert.equal(
        updateData.order.status,
        'SETTLED',
        'Pre-existing SETTLED status must be preserved and never reset or corrupted'
      );
      assert.equal(updateData.order.notes, 'Administrative tracking: invoice mailed');
      assert.equal(updateData.order.trackingNumber, 'TRACK-998877');

      // 3. Verify disk persistence preserves SETTLED
      const persisted = readOrders().find((o: any) => o.orderId === orderId);
      assert.ok(persisted);
      assert.equal(persisted.status, 'SETTLED');
    });
  });

  // ==========================================================================
  // Section 11: AC2, §28 & F2: Contract & Order Authority Spoofing Immunity
  // ==========================================================================
  describe('AC2, §28 & F2: Contract & Order Authority Spoofing Immunity', () => {
    it('strips authority metadata and derives updatedBy from admin.id when creating a contract (POST /api/admin/contracts)', async () => {
      const contractId = `cnt_spoof_new_${Date.now()}`;
      const res = await fetch(`${baseUrl}/api/admin/contracts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          id: contractId,
          minerModel: 'Antminer S19 Pro+ Hyd',
          hashrateTH: 198,
          userId: 'attacker_target_user',
          updatedBy: 'spoofed_root_admin',
          role: 'superadmin',
          adminId: 'hacker_admin_id',
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.equal(data.contract.updatedBy, adminUidA, 'Returned contract updatedBy must derive from admin.id');
      assert.equal(data.contract.role, undefined, 'Returned contract must not have role');
      assert.equal(data.contract.adminId, undefined, 'Returned contract must not have adminId');
      assert.equal(data.contract.userId, undefined, 'Returned contract must not have userId');

      // Verify stored contract
      const contracts = readContracts();
      const stored = contracts.find((c: any) => c.id === contractId);
      assert.ok(stored, 'Contract must be persisted');
      assert.equal(stored.updatedBy, adminUidA, 'updatedBy must strictly derive from authenticated admin.id');
      assert.equal(stored.role, undefined, 'Client-supplied role must be stripped from stored contract');
      assert.equal(stored.adminId, undefined, 'Client-supplied adminId must be stripped from stored contract');
      assert.equal(stored.userId, undefined, 'Client-supplied userId must be stripped from stored contract');
      assert.equal(stored.minerModel, 'Antminer S19 Pro+ Hyd');
    });

    it('strips authority metadata and updates updatedBy to admin.id when updating an existing contract', async () => {
      const contractId = `cnt_spoof_exist_${Date.now()}`;
      // 1. Seed contract created by Admin B
      const contracts = readContracts();
      contracts.unshift({
        id: contractId,
        minerModel: 'WhatsMiner M30S',
        status: 'ACTIVE',
        updatedBy: adminUidB,
        createdAt: new Date().toISOString(),
      });
      writeContracts(contracts);

      // 2. Admin A updates contract with spoofed body authority fields
      const res = await fetch(`${baseUrl}/api/admin/contracts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          id: contractId,
          minerModel: 'WhatsMiner M30S++',
          updatedBy: 'forged_identity',
          role: 'god_mode',
          adminId: 'injected_admin_id',
          userId: 'injected_user_id',
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.contract.updatedBy, adminUidA);
      assert.equal(data.contract.role, undefined);

      // 3. Verify stored contract has updatedBy = adminUidA and no spoofed fields
      const stored = readContracts().find((c: any) => c.id === contractId);
      assert.ok(stored);
      assert.equal(stored.updatedBy, adminUidA, 'updatedBy must be overwritten with current authenticated admin.id');
      assert.equal(stored.role, undefined);
      assert.equal(stored.adminId, undefined);
      assert.equal(stored.userId, undefined);
      assert.equal(stored.minerModel, 'WhatsMiner M30S++');
    });

    it('strips authority metadata and derives updatedBy from admin.id for order creation and updates (POST /api/admin/orders)', async () => {
      const orderId = `ord_spoof_auth_${Date.now()}`;
      const res = await fetch(`${baseUrl}/api/admin/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTokenA}`,
        },
        body: JSON.stringify({
          orderId,
          packageId: 'pkg_cloud_gpu',
          amount: 1500,
          updatedBy: 'spoofed_operator',
          role: 'admin_override',
          adminId: 'fake_admin_999',
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.order.updatedBy, adminUidA);
      assert.equal(data.order.role, undefined);
      assert.equal(data.order.adminId, undefined);

      const stored = readOrders().find((o: any) => o.orderId === orderId);
      assert.ok(stored, 'Order must be persisted');
      assert.equal(stored.updatedBy, adminUidA, 'Order updatedBy must derive from admin.id');
      assert.equal(stored.role, undefined, 'Spoofed role must be stripped from order');
      assert.equal(stored.adminId, undefined, 'Spoofed adminId must be stripped from order');
    });
  });
});
