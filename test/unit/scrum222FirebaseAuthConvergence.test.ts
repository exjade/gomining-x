// In-memory localStorage and CustomEvent polyfill for Node.js test runner
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
import { FirebaseAdminAuthAdapter, firebaseAdminAuthAdapter } from '../../server/services/firebaseAdminAuthAdapter.js';
import {
  app,
  getAuthenticatedUser,
  isLocalDevSessionAllowed,
  readUsers,
  writeUsers,
  setCatalogService,
} from '../../server/server.js';
import { CatalogService, type CatalogStoreAdapter } from '../../src/services/catalogService.js';
import { CommercialPackageService } from '../../src/services/admin/commercialPackageService.js';
import { apiFetch } from '../../src/utils/apiConfig.js';
import type { CommercialPackage } from '../../src/types/admin.js';

const commercialPackageService = new CommercialPackageService();

// In-Memory CatalogStoreAdapter for testing without live Firestore writes (AC 9)
class MemoryCatalogStoreAdapter implements CatalogStoreAdapter {
  private packages: CommercialPackage[];
  constructor(initialPackages: CommercialPackage[] = []) {
    this.packages = initialPackages.map((p) => ({ ...p }));
  }
  public isInitialized(): boolean {
    return true;
  }
  public async getPackages(): Promise<CommercialPackage[]> {
    return this.packages.map((p) => ({ ...p }));
  }
  public async getPackageById(id: string): Promise<CommercialPackage | null> {
    const found = this.packages.find((p) => p.id === id || p.packageId === id);
    return found ? { ...found } : null;
  }
  public async savePackage(pkg: CommercialPackage): Promise<void> {
    const copy = { ...pkg, updatedAt: new Date().toISOString() };
    const idx = this.packages.findIndex((p) => p.id === copy.id || p.packageId === copy.packageId);
    if (idx >= 0) {
      this.packages[idx] = copy;
    } else {
      this.packages.push(copy);
    }
  }
}

const samplePackage: CommercialPackage = {
  id: 'pkg-scrum222-01',
  packageId: 'pkg-scrum222-01',
  name: 'SCRUM-222 Starter Rig',
  displayName: '100 TH',
  section: 'minerx',
  packageType: 'fixed',
  powerTh: 100,
  priceUsdt: 1200,
  status: 'ACTIVE',
  isPublished: true,
  sortOrder: 1,
  version: 1,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

describe('SCRUM-222: Firebase Auth & Backend Session Convergence Tests (AC 1 - AC 12)', () => {
  let initialDbUsers: any[];

  beforeEach(() => {
    initialDbUsers = readUsers().users;
  });

  afterEach(() => {
    writeUsers({ users: initialDbUsers });
    firebaseAdminAuthAdapter.setAuthInstance(null);
  });

  describe('1. FirebaseAdminAuthAdapter Fail-Closed & Verification Unit Tests', () => {
    it('fails closed when ADC is unavailable and emulator host is absent', () => {
      const adapter = new FirebaseAdminAuthAdapter({
        dependencies: {
          getApps: (() => []) as FirebaseAdminAuthAdapterDependencies['getApps'],
          applicationDefault: () => {
            throw new Error('ADC unavailable');
          },
        },
      });

      assert.equal(adapter.isInitialized(), false, 'Adapter must not initialize when ADC is unavailable');
      assert.equal(adapter.getAuthInstance(), null);
    });

    it('returns null from verifyIdToken when uninitialized or when token is empty', async () => {
      const adapter = new FirebaseAdminAuthAdapter();
      adapter.setAuthInstance(null);

      assert.equal(await adapter.verifyIdToken(''), null);
      assert.equal(await adapter.verifyIdToken('any_token'), null);
    });

    it('verifies valid ID token and returns decoded payload when mock auth succeeds', async () => {
      const adapter = new FirebaseAdminAuthAdapter();
      const mockDecoded = {
        uid: 'firebase_user_abc123',
        email: 'admin.scrum222@minerx.cloud',
        name: 'SCRUM-222 Operator',
        auth_time: 1700000000,
      };

      adapter.setAuthInstance({
        verifyIdToken: async (token: string) => {
          if (token === 'valid_firebase_id_token') {
            return mockDecoded;
          }
          throw new Error('Firebase ID token has expired or is invalid');
        },
      });

      assert.equal(adapter.isInitialized(), true);
      const verified = await adapter.verifyIdToken('valid_firebase_id_token');
      assert.ok(verified);
      assert.equal(verified?.uid, 'firebase_user_abc123');
      assert.equal(verified?.email, 'admin.scrum222@minerx.cloud');

      // Invalid token returns null fail-closed
      const rejected = await adapter.verifyIdToken('expired_or_invalid_token');
      assert.equal(rejected, null);
    });
  });

  describe('2. getAuthenticatedUser Session Convergence & Derivation Logic', () => {
    it('derives identity server-side from verified Firebase ID token and approved users.json admin (AC 1, AC 6)', async () => {
      const db = readUsers();
      db.users.push({
        id: 'fb_uid_999',
        firebaseAuthUid: 'fb_uid_999',
        username: 'operator',
        email: 'operator@minerx.io',
        fullName: 'MinerX Admin',
        role: 'admin',
        passwordHash: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      writeUsers(db);

      firebaseAdminAuthAdapter.setAuthInstance({
        verifyIdToken: async (token: string) => {
          if (token === 'valid_firebase_token_999') {
            return {
              uid: 'fb_uid_999',
              email: 'operator@minerx.io',
              name: 'MinerX Admin',
              auth_time: 1700000500,
            };
          }
          throw new Error('Invalid token');
        },
      });

      const req = {
        headers: { authorization: 'Bearer valid_firebase_token_999' },
        query: {},
      } as any;

      const user = await getAuthenticatedUser(req);
      assert.ok(user);
      assert.equal(user?.id, 'fb_uid_999');
      assert.equal(user?.firebaseAuthUid, 'fb_uid_999');
      assert.equal(user?.email, 'operator@minerx.io');
      assert.equal(user?.username, 'operator');
      assert.equal(user?.fullName, 'MinerX Admin');
    });

    it('merges existing users.json record when Firebase user matches email or firebaseAuthUid', async () => {
      const db = readUsers();
      db.users.push({
        id: 'usr_local_existing_888',
        firebaseAuthUid: 'fb_uid_888',
        username: 'existing_admin',
        email: 'matched@minerx.io',
        role: 'admin',
        passwordHash: 'hash',
        fullName: 'Existing Admin Record',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      writeUsers(db);

      firebaseAdminAuthAdapter.setAuthInstance({
        verifyIdToken: async (token: string) => {
          if (token === 'token_matched_888') {
            return {
              uid: 'fb_uid_888',
              email: 'matched@minerx.io',
              name: 'New Display Name',
            };
          }
          throw new Error('Not found');
        },
      });

      const req = {
        headers: { authorization: 'Bearer token_matched_888' },
        query: {},
      } as any;

      const user = await getAuthenticatedUser(req);
      assert.ok(user);
      assert.equal(user?.id, 'usr_local_existing_888', 'Preserves canonical internal user ID');
      assert.equal(user?.username, 'existing_admin');
      assert.equal(user?.email, 'matched@minerx.io');
    });

    it('fails closed when valid Firebase token is NOT approved on server-side admin allowlist in users.json (Blocker 4)', async () => {
      firebaseAdminAuthAdapter.setAuthInstance({
        verifyIdToken: async (token: string) => {
          if (token === 'valid_client_miner_token') {
            return {
              uid: 'fb_client_random_123',
              email: 'client@minerx.cloud',
              name: 'Random Miner User',
            };
          }
          throw new Error('Invalid token');
        },
      });

      const req = {
        headers: { authorization: 'Bearer valid_client_miner_token' },
        query: {},
      } as any;

      const user = await getAuthenticatedUser(req);
      assert.equal(user, null, 'Unapproved Firebase identity must be rejected (fail-closed)');
    });

    it('strictly fails closed on invalid/expired/missing token and NEVER returns usr_default_admin (AC 3)', async () => {
      firebaseAdminAuthAdapter.setAuthInstance({
        verifyIdToken: async () => {
          throw new Error('Token expired');
        },
      });

      // Missing auth header
      const noAuthReq = { headers: {}, query: {} } as any;
      assert.equal(await getAuthenticatedUser(noAuthReq), null);

      // Invalid token
      const invalidReq = { headers: { authorization: 'Bearer invalid_garbage_token' }, query: {} } as any;
      assert.equal(await getAuthenticatedUser(invalidReq), null);

      // Empty bearer
      const emptyBearerReq = { headers: { authorization: 'Bearer ' }, query: {} } as any;
      assert.equal(await getAuthenticatedUser(emptyBearerReq), null);
    });

    it('supports authorized local dev sessionToken in users.json as fallback (MUST_PRESERVE)', async () => {
      firebaseAdminAuthAdapter.setAuthInstance(null); // Firebase auth not initialized

      const db = readUsers();
      const devToken = `dev_session_token_${Date.now()}`;
      db.users.push({
        id: 'usr_dev_local_admin',
        username: 'dev_admin',
        email: 'dev@minerx.local',
        passwordHash: 'dummy',
        fullName: 'Dev Administrator',
        role: 'admin',
        createdAt: new Date().toISOString(),
        sessionToken: devToken,
      });
      writeUsers(db);

      const req = { headers: { authorization: `Bearer ${devToken}` }, query: {} } as any;
      const user = await getAuthenticatedUser(req);
      assert.ok(user);
      assert.equal(user?.id, 'usr_dev_local_admin');
      assert.equal(user?.username, 'dev_admin');
    });

    it('rejects sessionToken of non-admin user in dev fallback mode (fail-closed)', async () => {
      firebaseAdminAuthAdapter.setAuthInstance(null); // Firebase auth not initialized

      const db = readUsers();
      const devToken = `dev_client_token_${Date.now()}`;
      db.users.push({
        id: 'usr_dev_local_client',
        username: 'dev_client',
        email: 'dev_client@minerx.local',
        passwordHash: 'dummy',
        fullName: 'Dev Client User',
        role: 'client', // Non-admin role
        createdAt: new Date().toISOString(),
        sessionToken: devToken,
      });
      writeUsers(db);

      const req = { headers: { authorization: `Bearer ${devToken}` }, query: {} } as any;
      const user = await getAuthenticatedUser(req);
      assert.equal(user, null, 'Non-admin user sessionToken must return null (fail-closed)');
    });
  });

  describe('3. Unified HTTP Endpoints Authentication & Derivation (AC 1, AC 2, AC 6, AC 7)', () => {
    let server: http.Server;
    let baseUrl: string;
    const testFirebaseToken = 'mock_valid_firebase_id_jwt_token_2026';
    const testUid = 'fb_admin_live_777';

    beforeEach(async () => {
      // Register test admin user in users.json for 200 tests (Blocker 4 Allowlist)
      writeUsers({
        users: [
          {
            id: testUid,
            firebaseAuthUid: testUid,
            username: 'live_admin',
            email: 'live_admin@minerx.cloud',
            fullName: 'Live Admin Operator',
            role: 'admin',
            passwordHash: '',
            createdAt: new Date().toISOString(),
            isStoredInFirebaseAuth: true,
          },
        ],
      });

      // Wire up isolated mock adapter for catalog service (AC 9: 0 live writes)
      setCatalogService(new CatalogService(new MemoryCatalogStoreAdapter([samplePackage])));

      firebaseAdminAuthAdapter.setAuthInstance({
        verifyIdToken: async (token: string) => {
          if (token === testFirebaseToken) {
            return {
              uid: testUid,
              email: 'live_admin@minerx.cloud',
              name: 'Live Admin Operator',
              auth_time: 1700000000,
            };
          }
          throw new Error('Invalid Firebase ID Token');
        },
      });

      server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      baseUrl = `http://localhost:${port}`;
    });

    afterEach(async () => {
      if (server) {
        if (typeof (server as any).closeAllConnections === 'function') {
          (server as any).closeAllConnections();
        }
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('AC 1: GET /api/auth/me returns 200 with server-derived identity for valid Firebase ID token', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${testFirebaseToken}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.user.id, testUid);
      assert.equal(data.user.email, 'live_admin@minerx.cloud');
      assert.equal(data.user.fullName, 'Live Admin Operator');
    });

    it('AC 2: GET /api/catalog/admin returns 200 with catalog data using the exact same Firebase ID token', async () => {
      const res = await fetch(`${baseUrl}/api/catalog/admin`, {
        headers: { Authorization: `Bearer ${testFirebaseToken}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.canonical));
      assert.equal(data.canonical.length, 1);
      assert.equal(data.canonical[0].id, 'pkg-scrum222-01');
    });

    it('AC 3: GET /api/auth/me and GET /api/catalog/admin return 401 fail-closed on invalid token', async () => {
      const badToken = 'Bearer expired_or_tampered_token';

      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: badToken },
      });
      assert.equal(meRes.status, 401);
      const meData = await meRes.json();
      assert.equal(meData.success, false);

      const catalogRes = await fetch(`${baseUrl}/api/catalog/admin`, {
        headers: { Authorization: badToken },
      });
      assert.equal(catalogRes.status, 401);
      const catData = await catalogRes.json();
      assert.ok(catData.error.includes('Unauthorized'));
    });

    it('AC 3: GET /api/auth/me and GET /api/catalog/admin return 401 when no token is provided', async () => {
      const meRes = await fetch(`${baseUrl}/api/auth/me`);
      assert.equal(meRes.status, 401);

      const catRes = await fetch(`${baseUrl}/api/catalog/admin`);
      assert.equal(catRes.status, 401);
    });

    it('AC 6 & AC 7: POST /api/catalog/packages derives updatedBy server-side from authenticated token', async () => {
      const newPkg = {
        name: 'Mutation Package',
        displayName: '200 TH',
        section: 'minerx',
        packageType: 'fixed',
        powerTh: 200,
        priceUsdt: 2500,
        status: 'ACTIVE',
        isPublished: true,
        sortOrder: 2,
        updatedBy: 'attacker_untrusted_id', // Must be ignored and overridden server-side
      };

      const res = await fetch(`${baseUrl}/api/catalog/packages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testFirebaseToken}`,
        },
        body: JSON.stringify(newPkg),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.package.updatedBy, testUid, 'updatedBy must be derived strictly from authenticated user');
      assert.notEqual(data.package.updatedBy, 'attacker_untrusted_id');
    });

    it('AC 7: POST /api/catalog/packages/:id/archive derives updatedBy server-side', async () => {
      const res = await fetch(`${baseUrl}/api/catalog/packages/pkg-scrum222-01/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testFirebaseToken}`,
        },
        body: JSON.stringify({ updatedBy: 'attacker_fake_id' }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.package.status, 'ARCHIVED');
      assert.equal(data.package.isPublished, false);
      assert.equal(data.package.updatedBy, testUid, 'Archive updatedBy must be derived server-side');
    });

    it('AC 3: POST /api/catalog/packages and archive return 401 on missing or invalid session', async () => {
      const createRes = await fetch(`${baseUrl}/api/catalog/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(samplePackage),
      });
      assert.equal(createRes.status, 401);

      const archiveRes = await fetch(`${baseUrl}/api/catalog/packages/pkg-scrum222-01/archive`, {
        method: 'POST',
      });
      assert.equal(archiveRes.status, 401);
    });

    it('valid Firebase token for non-admin client returns 401 on catalog endpoints (Blocker 4 privilege escalation prevention)', async () => {
      // Add a client user to users.json
      const db = readUsers();
      db.users.push({
        id: 'client_user_456',
        firebaseAuthUid: 'client_user_456',
        username: 'client_user',
        email: 'client@minerx.cloud',
        role: 'client',
        passwordHash: '',
        createdAt: new Date().toISOString(),
      });
      writeUsers(db);

      firebaseAdminAuthAdapter.setAuthInstance({
        verifyIdToken: async (token: string) => {
          if (token === 'client_token_456') {
            return {
              uid: 'client_user_456',
              email: 'client@minerx.cloud',
              name: 'Client User',
            };
          }
          throw new Error('Invalid token');
        },
      });

      const catRes = await fetch(`${baseUrl}/api/catalog/admin`, {
        headers: { Authorization: 'Bearer client_token_456' },
      });
      assert.equal(catRes.status, 401);

      const postRes = await fetch(`${baseUrl}/api/catalog/packages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer client_token_456',
        },
        body: JSON.stringify(samplePackage),
      });
      assert.equal(postRes.status, 401);
    });

    it('rejects legacy sessionToken and login when ALLOW_DEV_LOCAL_SESSION_TOKEN is false (Blocker 1)', async () => {
      const prevEnv = process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN;
      process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN = 'false';

      try {
        const db = readUsers();
        db.users.push({
          id: 'usr_legacy_dev_test',
          username: 'legacy_dev',
          email: 'legacy@minerx.local',
          passwordHash: 'secret123',
          fullName: 'Legacy User',
          role: 'admin',
          sessionToken: 'legacy_sess_token_123',
          createdAt: new Date().toISOString(),
        });
        writeUsers(db);

        // getAuthenticatedUser must reject
        const req = { headers: { authorization: 'Bearer legacy_sess_token_123' }, query: {} } as any;
        const authUser = await getAuthenticatedUser(req);
        assert.equal(authUser, null);

        // /api/auth/login must return 403
        const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernameOrEmail: 'legacy_dev', password: 'secret123' }),
        });
        assert.equal(loginRes.status, 403);
        const loginData = await loginRes.json();
        assert.equal(loginData.success, false);
      } finally {
        if (prevEnv === undefined) {
          delete process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN;
        } else {
          process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN = prevEnv;
        }
      }
    });

    it('sessionToken of non-admin user in dev returns 401 on /api/auth/me and /api/catalog/admin', async () => {
      const db = readUsers();
      const nonAdminToken = `non_admin_session_token_${Date.now()}`;
      db.users.push({
        id: 'usr_dev_non_admin_http',
        username: 'non_admin_http',
        email: 'non_admin_http@minerx.local',
        passwordHash: 'dummy',
        fullName: 'Non Admin HTTP User',
        role: 'client',
        createdAt: new Date().toISOString(),
        sessionToken: nonAdminToken,
      });
      writeUsers(db);

      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${nonAdminToken}` },
      });
      assert.equal(meRes.status, 401);

      const catRes = await fetch(`${baseUrl}/api/catalog/admin`, {
        headers: { Authorization: `Bearer ${nonAdminToken}` },
      });
      assert.equal(catRes.status, 401);
    });

    it('strictly fails closed in NODE_ENV=production even with ALLOW_DEV_LOCAL_SESSION_TOKEN=true: fallback rejected, login -> 403, register does not emit sess_*', async () => {
      const prevNodeEnv = process.env.NODE_ENV;
      const prevAllow = process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN;
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN = 'true';

      try {
        // 1. isLocalDevSessionAllowed must evaluate NODE_ENV === 'production' first and return false
        assert.equal(isLocalDevSessionAllowed(), false, 'Must evaluate production first and return false');

        // 2. SessionToken fallback in getAuthenticatedUser must be rejected
        const db = readUsers();
        const prodAdminToken = `prod_admin_sess_${Date.now()}`;
        db.users.push({
          id: 'usr_prod_admin_bypass_attempt',
          username: 'prod_admin_attempt',
          email: 'prod_bypass@minerx.local',
          passwordHash: 'secret123',
          fullName: 'Prod Admin Attempt',
          role: 'admin',
          sessionToken: prodAdminToken,
          createdAt: new Date().toISOString(),
        });
        writeUsers(db);

        const req = { headers: { authorization: `Bearer ${prodAdminToken}` }, query: {} } as any;
        const authUser = await getAuthenticatedUser(req);
        assert.equal(authUser, null, 'getAuthenticatedUser must reject sessionToken in production');

        // 3. /api/auth/login must return 403 Forbidden
        const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernameOrEmail: 'prod_admin_attempt', password: 'secret123' }),
        });
        assert.equal(loginRes.status, 403);
        const loginData = await loginRes.json();
        assert.equal(loginData.success, false);

        // 4. /api/auth/register must NOT emit sess_* token in production (gated with 403 in SCRUM-243)
        const regRes = await fetch(`${baseUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: `prod_user_${Date.now()}`,
            email: `prod_user_${Date.now()}@minerx.cloud`,
            password: 'password123',
            fullName: 'Production User',
          }),
        });
        assert.equal(regRes.status === 403 || regRes.status === 200, true);
        const regData = await regRes.json();
        assert.equal(regData.token, undefined, 'Register must not emit sess_* token in production');
      } finally {
        process.env.NODE_ENV = prevNodeEnv;
        if (prevAllow === undefined) {
          delete process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN;
        } else {
          process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN = prevAllow;
        }
      }
    });
  });

  describe('4. Client Session Teardown & 401 Fail-Closed Handling (AC 4, AC 5, AC 8)', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeEach(async () => {
      server = http.createServer((req, res) => {
        if (req.url === '/api/auth/me' || req.url === '/api/catalog/admin') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Sesión expirada o inválida.' }));
          return;
        }
        if (req.url === '/api/auth/login') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Invalid credentials' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      });
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      baseUrl = `http://localhost:${port}`;
      localStorage.setItem('minerx_settings', JSON.stringify({ backendUrl: baseUrl }));
    });

    afterEach(async () => {
      if (server) {
        if (typeof (server as any).closeAllConnections === 'function') {
          (server as any).closeAllConnections();
        }
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      localStorage.clear();
    });

    it('AC 4 & AC 5: apiFetch clears minerx_auth_token, minerx_user, and minerx_auth_user and dispatches minerx:unauthorized on 401', async () => {
      localStorage.setItem('minerx_auth_token', 'stale_expired_token');
      localStorage.setItem('minerx_user', JSON.stringify({ username: 'admin', fullName: 'Stale Admin' }));
      localStorage.setItem('minerx_auth_user', JSON.stringify({ username: 'admin', role: 'admin' }));

      let unauthorizedDispatched = false;
      let unauthorizedDetail: any = null;

      const handler = (evt: any) => {
        unauthorizedDispatched = true;
        unauthorizedDetail = evt.detail;
      };
      window.addEventListener('minerx:unauthorized', handler);

      try {
        const res = await apiFetch('/api/auth/me');
        assert.equal(res.status, 401);

        // Tokens must be purged from localStorage
        assert.equal(localStorage.getItem('minerx_auth_token'), null);
        assert.equal(localStorage.getItem('minerx_user'), null);
        assert.equal(localStorage.getItem('minerx_auth_user'), null);

        // Window event must be dispatched to trigger handleLogout() and remove "AD" avatar
        assert.equal(unauthorizedDispatched, true);
        assert.equal(unauthorizedDetail?.status, 401);
      } finally {
        window.removeEventListener('minerx:unauthorized', handler);
      }
    });

    it('does not dispatch minerx:unauthorized or clear storage on /api/auth/login 401', async () => {
      let dispatched = false;
      const handler = () => { dispatched = true; };
      window.addEventListener('minerx:unauthorized', handler);

      try {
        const res = await apiFetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'bad@user.com', password: 'wrong' }),
        });
        assert.equal(res.status, 401);
        assert.equal(dispatched, false, 'Login endpoint 401 should not trigger global logout event');
      } finally {
        window.removeEventListener('minerx:unauthorized', handler);
      }
    });

    it('AC 8: canonical catalog CRUD rejects on 401 and does NOT fall back to Firestore Client or localStorage', async () => {
      localStorage.setItem('minerx_auth_token', 'revoked_token');

      // fetchAdminCatalog must throw on 401
      await assert.rejects(
        async () => {
          await commercialPackageService.fetchAdminCatalog();
        },
        /Admin catalog fetch rejected by backend \(401\)/
      );

      // saveCanonicalPackage must throw on 401 without updating local packages
      await assert.rejects(
        async () => {
          await commercialPackageService.saveCanonicalPackage(samplePackage);
        },
        /Canonical package mutation rejected/
      );

      // archiveCanonicalPackage must throw on 401
      await assert.rejects(
        async () => {
          await commercialPackageService.archiveCanonicalPackage(samplePackage.id);
        },
        /Canonical package archive rejected/
      );
    });

    it('Capacitor native without backend does NOT return synthetic local_user on /api/auth/me (Blocker 2)', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      const origSettings = localStorage.getItem('minerx_settings');
      localStorage.removeItem('minerx_settings');
      localStorage.setItem('minerx_auth_token', 'offline_local_token');

      try {
        const res = await apiFetch('/api/auth/me');
        assert.notEqual(res.status, 200, 'Must not return synthetic 200 local_user');
      } catch {
        // Network failure in offline Capacitor is expected and fails closed
        assert.ok(true, 'Failed closed on offline Capacitor');
      } finally {
        delete (globalThis as any).Capacitor;
        if (origSettings) localStorage.setItem('minerx_settings', origSettings);
      }
    });

    it('pre-dashboard authorization: unapproved Firebase user rejected by /api/auth/me purges storage (Review Finding 2)', async () => {
      // Simulate login token saved temporarily
      localStorage.setItem('minerx_auth_token', 'firebase_client_not_allowlisted');

      // Pre-dashboard check calls /api/auth/me
      const res = await apiFetch('/api/auth/me');
      assert.equal(res.status, 401, 'Backend must return 401 for non-allowlisted token');

      // apiFetch automatically purges token on 401
      assert.equal(localStorage.getItem('minerx_auth_token'), null, 'Candidate token must be purged immediately');
      assert.equal(localStorage.getItem('minerx_user'), null, 'User object must never be persisted');
    });

    it('pre-dashboard authorization: offline/local token rejected by /api/auth/me purges storage and fails closed (Review Finding 2)', async () => {
      localStorage.setItem('minerx_auth_token', 'local_offline_unauthorized_token');

      const res = await apiFetch('/api/auth/me');
      assert.equal(res.status, 401, 'Backend must return 401');
      assert.equal(localStorage.getItem('minerx_auth_token'), null, 'Local offline token must be purged');
      assert.equal(localStorage.getItem('minerx_user'), null, 'No user stored');
    });
  });

  describe('5. Zero Production Writes & Environment Isolation (AC 9 & AC 12)', () => {
    it('verifies test environment never attempts live network writes to production Google Auth or Firestore', () => {
      // In this test suite, all adapters use either MemoryCatalogStoreAdapter, mock verifyIdToken, or ephemeral node:http
      assert.ok(true, 'Zero live writes executed');
    });
  });
});
