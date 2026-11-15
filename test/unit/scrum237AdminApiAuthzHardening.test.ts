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
        return new Response(JSON.stringify({ success: true, offers: [], user: { balance: 42.0 } }), {
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
});
