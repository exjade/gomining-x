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
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  app,
  getAuthenticatedUser,
  isLocalDevSessionAllowed,
  readUsers,
  writeUsers,
  setUsersFilePath,
  type UserAccount,
} from '../../server/server.js';
import {
  firebaseAdminAuthAdapter,
  FirebaseAdminAuthAdapter,
} from '../../server/services/firebaseAdminAuthAdapter.js';
import { provisionAdmin, parseCliArgs } from '../../scripts/provisionAdmin.js';
import {
  isDevSessionAllowed,
  isValidEmail,
  getFirebaseAuthErrorMessage,
  REGISTRATION_PENDING_ADMIN_NOTICE,
} from '../../src/utils/authFlow.js';
import {
  registerLocalUser,
  loginLocalUser,
  getLocalSession,
  auditLocalUsers,
  repairLocalUsers,
} from '../../src/utils/localAuthService.js';

describe('SCRUM-243: Admin Registration Convergence & Security Tests (12 ACs)', () => {
  let tempDir: string;
  let tempUsersFile: string;
  let server: http.Server;
  let baseUrl: string;

  const realAdminUid = 'fb_admin_scrum243_real_111';
  const realAdminEmail = 'approved.admin@minerx.cloud';
  const realUserUid = 'fb_user_regular_scrum243_222';
  const realUserEmail = 'new.user@minerx.cloud';

  beforeEach(async () => {
    // Isolated temp users.json per test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrum243-test-'));
    tempUsersFile = path.join(tempDir, 'users.json');
    setUsersFilePath(tempUsersFile);

    const initialUsers: UserAccount[] = [
      {
        id: realAdminUid,
        firebaseAuthUid: realAdminUid,
        username: 'approved_admin',
        email: realAdminEmail,
        fullName: 'Approved Admin Operator',
        role: 'admin',
        passwordHash: '',
        createdAt: '2026-11-13T00:00:00.000Z',
        isStoredInFirebaseAuth: true,
      },
    ];
    writeUsers({ users: initialUsers });

    // Setup mock Firebase Admin Auth Adapter
    const mockFirebaseUsers = new Map<string, any>([
      [
        realAdminUid,
        {
          uid: realAdminUid,
          email: realAdminEmail,
          displayName: 'Approved Admin Operator',
        },
      ],
      [
        realUserUid,
        {
          uid: realUserUid,
          email: realUserEmail,
          displayName: 'New Regular User',
        },
      ],
    ]);

    firebaseAdminAuthAdapter.setAuthInstance({
      verifyIdToken: async (token: string) => {
        if (token === 'valid_admin_token') {
          return {
            uid: realAdminUid,
            email: realAdminEmail,
            name: 'Approved Admin Operator',
          };
        }
        if (token === 'valid_user_token') {
          return {
            uid: realUserUid,
            email: realUserEmail,
            name: 'New Regular User',
          };
        }
        throw new Error('Invalid token');
      },
      getUser: async (uid: string) => {
        return mockFirebaseUsers.get(uid) || null;
      },
      getUserByEmail: async (email: string) => {
        for (const u of mockFirebaseUsers.values()) {
          if (u.email.toLowerCase() === email.toLowerCase()) {
            return u;
          }
        }
        return null;
      },
    });

    // Start local ephemeral HTTP server
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    setUsersFilePath(null);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}

    if (server) {
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // --------------------------------------------------------------------------
  // AC 1: Successful Firebase registration without auto-admin / local fallback
  // --------------------------------------------------------------------------
  it('AC 1: Successful Firebase registration does not auto-admin, gives clear notice, and does not invoke legacy /api/auth/register', async () => {
    // 1. Notice text matches contract
    assert.equal(
      REGISTRATION_PENDING_ADMIN_NOTICE,
      'Cuenta creada en Firebase Authentication. Requiere autorización de administrador para acceder al panel.'
    );

    // 2. Newly registered account is absent from users.json admin allowlist
    const db = readUsers();
    const foundAdmin = db.users.find((u) => u.email === realUserEmail && u.role === 'admin');
    assert.equal(foundAdmin, undefined, 'New Firebase account must NOT be auto-promoted to admin');

    // 3. In production-like mode, /api/auth/register is rejected with 403
    const savedAllowDev = process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN;
    const savedNodeEnv = process.env.NODE_ENV;
    process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN = 'false';
    process.env.NODE_ENV = 'production';

    try {
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'newuser',
          email: realUserEmail,
          password: 'password123',
        }),
      });
      assert.equal(regRes.status, 403, 'Must reject legacy backend register in production-like mode');
      const data = await regRes.json();
      assert.equal(data.success, false);
      assert.ok(data.message.includes('disabled in this environment'));
    } finally {
      process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN = savedAllowDev;
      process.env.NODE_ENV = savedNodeEnv;
    }
  });

  // --------------------------------------------------------------------------
  // AC 2: Valid Firebase user not allowlisted -> 401 DENY
  // --------------------------------------------------------------------------
  it('AC 2: Valid Firebase user not in allowlist receives 401 DENY on /api/auth/me', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer valid_user_token' },
    });
    assert.equal(res.status, 401, 'Unapproved Firebase account must receive 401 Unauthorized');
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.message.includes('Sesión expirada o inválida'));
  });

  // --------------------------------------------------------------------------
  // AC 3: Explicit admin provisioning CLI with real UID/email and --dry-run
  // --------------------------------------------------------------------------
  it('AC 3: provisionAdmin requires real Firebase identity, supports --dry-run, and never invents synthetic UIDs', async () => {
    // A. Dry run: Validates identity without writing to disk
    const dryResult = await provisionAdmin({
      email: realUserEmail,
      role: 'admin',
      dryRun: true,
      skipFirestore: true,
    });
    assert.equal(dryResult.success, true);
    assert.equal(dryResult.dryRun, true);
    assert.equal(dryResult.user.id, realUserUid);
    assert.equal(dryResult.user.email, realUserEmail);
    assert.equal(dryResult.user.role, 'admin');

    // Confirm nothing written to disk
    let db = readUsers();
    assert.equal(
      db.users.find((u) => u.id === realUserUid),
      undefined,
      'Dry run must not persist changes'
    );

    // B. Real provisioning: Writes real UID and email into users.json
    const realResult = await provisionAdmin({
      email: realUserEmail,
      role: 'admin',
      dryRun: false,
      skipFirestore: true,
    });
    assert.equal(realResult.success, true);
    assert.equal(realResult.dryRun, false);

    db = readUsers();
    const provisioned = db.users.find((u) => u.id === realUserUid);
    assert.ok(provisioned, 'User must be persisted to users.json');
    assert.equal(provisioned?.firebaseAuthUid, realUserUid, 'Must store exact real Firebase UID');
    assert.equal(provisioned?.email, realUserEmail);
    assert.equal(provisioned?.role, 'admin');
    assert.equal(provisioned?.passwordHash, '', 'Never store password');

    // C. Rejects non-existent identity in Firebase Authentication
    await assert.rejects(
      async () => {
        await provisionAdmin({
          email: 'unknown_not_in_firebase@minerx.cloud',
          dryRun: false,
        });
      },
      /Identidad no encontrada en Firebase Authentication/,
      'Must fail when identity does not exist in Firebase Auth'
    );

    // D. CLI argument parser supports both space-separated and equals-separated styles
    const parsedEquals = parseCliArgs([
      '--email=admin@minerx.cloud',
      '--uid=uid_123',
      '--role=operator',
      '--dry-run',
      '--skip-firestore',
    ]);
    assert.equal(parsedEquals.email, 'admin@minerx.cloud');
    assert.equal(parsedEquals.uid, 'uid_123');
    assert.equal(parsedEquals.role, 'operator');
    assert.equal(parsedEquals.dryRun, true);
    assert.equal(parsedEquals.skipFirestore, true);

    const parsedSpaces = parseCliArgs([
      '--email',
      'admin@minerx.cloud',
      '--uid',
      'uid_123',
      '--role',
      'admin',
      '--dry-run',
    ]);
    assert.equal(parsedSpaces.email, 'admin@minerx.cloud');
    assert.equal(parsedSpaces.uid, 'uid_123');
    assert.equal(parsedSpaces.role, 'admin');
    assert.equal(parsedSpaces.dryRun, true);
  });

  // --------------------------------------------------------------------------
  // AC 4: Approved admin -> 200 OK & dashboard authorization
  // --------------------------------------------------------------------------
  it('AC 4: Approved admin with valid Firebase ID token receives 200 OK on /api/auth/me', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer valid_admin_token' },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.user.id, realAdminUid);
    assert.equal(data.user.email, realAdminEmail);
    assert.equal(data.user.role, 'admin');
  });

  // --------------------------------------------------------------------------
  // AC 5: Invalid credential -> visible error, 0 fallback
  // --------------------------------------------------------------------------
  it('AC 5: Invalid credential returns visible error without silent fallback', () => {
    const errorMsg1 = getFirebaseAuthErrorMessage({ code: 'auth/invalid-credential' });
    assert.equal(errorMsg1, 'Correo o contraseña incorrectos en Firebase.');

    const errorMsg2 = getFirebaseAuthErrorMessage({ code: 'auth/user-not-found' });
    assert.equal(errorMsg2, 'Correo o contraseña incorrectos en Firebase.');

    const errorMsg3 = getFirebaseAuthErrorMessage({ code: 'auth/wrong-password' });
    assert.equal(errorMsg3, 'Correo o contraseña incorrectos en Firebase.');
  });

  // --------------------------------------------------------------------------
  // AC 6: Username-only input in production-like -> clear UX, no legacy fallback
  // --------------------------------------------------------------------------
  it('AC 6: Non-email username in production-like mode fails email validation without legacy fallback', () => {
    assert.equal(isValidEmail('admin'), false);
    assert.equal(isValidEmail('roman'), false);
    assert.equal(isValidEmail('user@'), false);
    assert.equal(isValidEmail('admin@minerx.cloud'), true);
  });

  // --------------------------------------------------------------------------
  // AC 7: Quick Admin gating -> disabled/hidden in production-like
  // --------------------------------------------------------------------------
  it('AC 7: isDevSessionAllowed() is false by default in production-like and requires explicit authorization', () => {
    const saved = process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN;
    const savedNodeEnv = process.env.NODE_ENV;
    const savedTest = process.env.NODE_TEST_CONTEXT;

    try {
      process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN = 'false';
      delete process.env.NODE_TEST_CONTEXT;
      process.env.NODE_ENV = 'production';

      assert.equal(isDevSessionAllowed(), false, 'Quick admin must be disabled in production-like');

      process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN = 'true';
      assert.equal(isDevSessionAllowed(), true, 'Only enabled when explicitly set to true');
    } finally {
      process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN = saved;
      process.env.NODE_ENV = savedNodeEnv;
      process.env.NODE_TEST_CONTEXT = savedTest;
    }
  });

  // --------------------------------------------------------------------------
  // AC 8: Audit truthfulness -> VERIFIED, NOT_FOUND, AUTH_UNAVAILABLE, UID_MISMATCH
  // --------------------------------------------------------------------------
  it('AC 8: /api/auth/audit authoritatively verifies accounts and requires admin authentication', async () => {
    // 1. Unauthenticated request -> 401
    const unauthRes = await fetch(`${baseUrl}/api/auth/audit`);
    assert.equal(unauthRes.status, 401, 'Audit must require authenticated admin session');

    // 2. Prepare test records in users.json
    const db = readUsers();
    db.users.push(
      {
        id: 'usr_mismatch',
        firebaseAuthUid: 'fb_wrong_mismatch_uid',
        username: 'mismatch_user',
        email: realUserEmail, // Email exists in Firebase, but UID is different
        fullName: 'Mismatch User',
        role: 'user',
        passwordHash: '',
        createdAt: '2026-11-13T00:00:00.000Z',
      },
      {
        id: 'usr_not_found',
        firebaseAuthUid: 'fb_ghost_uid_999',
        username: 'ghost_user',
        email: 'ghost@nonexistent.minerx',
        fullName: 'Ghost User',
        role: 'user',
        passwordHash: '',
        createdAt: '2026-11-13T00:00:00.000Z',
      }
    );
    writeUsers(db);

    // 3. Authenticated audit query
    const auditRes = await fetch(`${baseUrl}/api/auth/audit`, {
      headers: { Authorization: 'Bearer valid_admin_token' },
    });
    assert.equal(auditRes.status, 200);
    const auditData = await auditRes.json();
    assert.equal(auditData.success, true);
    assert.equal(auditData.summary.firebaseAuthOperational, true);

    const verifiedUser = auditData.users.find((u: any) => u.id === realAdminUid);
    assert.equal(verifiedUser.status, 'VERIFIED');

    const mismatchUser = auditData.users.find((u: any) => u.id === 'usr_mismatch');
    assert.equal(mismatchUser.status, 'UID_MISMATCH');

    const notFoundUser = auditData.users.find((u: any) => u.id === 'usr_not_found');
    assert.equal(notFoundUser.status, 'NOT_FOUND');
  });

  // --------------------------------------------------------------------------
  // AC 9: Repair restraint -> never fabricates fb_auth_*, no privilege escalation
  // --------------------------------------------------------------------------
  it('AC 9: /api/auth/audit-repair reconciles only verified Firebase users and never invents synthetic UIDs', async () => {
    // 1. Unauthenticated request -> 401
    const unauthRes = await fetch(`${baseUrl}/api/auth/audit-repair`, { method: 'POST' });
    assert.equal(unauthRes.status, 401, 'Repair must require authenticated admin session');

    // 2. Add users: one exists in Firebase (realUserEmail), one does not (ghost)
    const db = readUsers();
    db.users.push(
      {
        id: 'usr_to_repair',
        firebaseAuthUid: null,
        username: 'repairable',
        email: realUserEmail, // Exists in mock Firebase!
        fullName: 'Repairable User',
        role: 'operator',
        passwordHash: '',
        createdAt: '2026-11-13T00:00:00.000Z',
      },
      {
        id: 'usr_ghost_unrepairable',
        firebaseAuthUid: null,
        username: 'unrepairable',
        email: 'ghost_never_in_firebase@minerx.cloud',
        fullName: 'Ghost',
        role: 'operator',
        passwordHash: '',
        createdAt: '2026-11-13T00:00:00.000Z',
      }
    );
    writeUsers(db);

    // 3. Execute repair
    const repairRes = await fetch(`${baseUrl}/api/auth/audit-repair`, {
      method: 'POST',
      headers: { Authorization: 'Bearer valid_admin_token' },
    });
    assert.equal(repairRes.status, 200);
    const repairData = await repairRes.json();
    assert.equal(repairData.success, true);
    assert.equal(repairData.repairedCount, 1, 'Only real Firebase user must be repaired');
    assert.equal(repairData.repairedUsers[0].newUid, realUserUid, 'Must assign real Firebase UID');

    // 4. Verify in-database persistence
    const updatedDb = readUsers();
    const repairedUser = updatedDb.users.find((u) => u.id === 'usr_to_repair');
    assert.equal(repairedUser?.firebaseAuthUid, realUserUid);
    assert.equal(repairedUser?.role, 'operator', 'Must NOT escalate role to admin');

    const ghostUser = updatedDb.users.find((u) => u.id === 'usr_ghost_unrepairable');
    assert.equal(ghostUser?.firebaseAuthUid, null, 'Must NOT synthesize fake fb_auth_* for unknown users');
  });

  // --------------------------------------------------------------------------
  // AC 10: /api/auth/register -> gated/truthful in production-like
  // --------------------------------------------------------------------------
  it('AC 10: /api/auth/register is truthful in dev mode and does not falsely claim Firebase sync', async () => {
    // In dev mode (default when NODE_ENV is test)
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'dev_user_789',
        email: 'dev_user_789@minerx.local',
        password: 'devpassword123',
      }),
    });

    assert.equal(regRes.status, 200);
    const data = await regRes.json();
    assert.equal(data.success, true);
    assert.equal(data.user.isStoredInFirebaseAuth, false, 'Must not claim false Firebase sync');
    assert.equal(data.user.isPublishedToFirestore, false, 'Must not claim false Firestore publish');
    assert.equal(data.user.firebaseAuthUid, undefined, 'Must not synthesize fake fb_auth_*');
  });

  // --------------------------------------------------------------------------
  // AC 11: Firestore fail-closed -> normal user cannot self-promote
  // --------------------------------------------------------------------------
  it('AC 11: Normal user cannot self-promote, and provisionAdmin projects server-side with real UID', async () => {
    const mockFirestoreDocs = new Map<string, any>();
    const mockFirestore = {
      collection: (colName: string) => ({
        doc: (docId: string) => ({
          set: async (data: any, options?: any) => {
            mockFirestoreDocs.set(`${colName}/${docId}`, data);
          },
        }),
      }),
    };

    const result = await provisionAdmin({
      email: realUserEmail,
      role: 'admin',
      dryRun: false,
      skipFirestore: false,
      firestoreInstance: mockFirestore,
    });

    assert.equal(result.success, true);
    assert.equal(result.firestoreProjected, true);

    const projectedDoc = mockFirestoreDocs.get(`admin_users/${realUserUid}`);
    assert.ok(projectedDoc, 'Approved admin must be projected to /admin_users/{realUid}');
    assert.equal(projectedDoc.uid, realUserUid);
    assert.equal(projectedDoc.role, 'admin');
    assert.equal(projectedDoc.provisionedBy, 'cli');
  });

  // --------------------------------------------------------------------------
  // AC 12: SCRUM-222 regression preservation
  // --------------------------------------------------------------------------
  it('AC 12: Preserves SCRUM-222 fail-closed security guarantees', async () => {
    // 1. Approved admin token -> 200
    const adminRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer valid_admin_token' },
    });
    assert.equal(adminRes.status, 200);

    // 2. Unapproved user token -> 401
    const unapprovedRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer valid_user_token' },
    });
    assert.equal(unapprovedRes.status, 401);

    // 3. Invalid token -> 401
    const invalidRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer invalid_garbage_token' },
    });
    assert.equal(invalidRes.status, 401);

    // 4. Missing token -> 401
    const missingRes = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(missingRes.status, 401);
  });

  // ==========================================================================
  // SCRUM-243 Remediated Blockers Verification (B1, B2, B3)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Blocker B1: Reject UID mismatch even when email matches allowlist
  // --------------------------------------------------------------------------
  it('Blocker B1: Reject authorization with null / 401 when verified Firebase UID differs from allowlist UID (prevent email match bypass)', async () => {
    const adminEmail = 'admin@minerx.cloud';
    const approvedUidA = 'UID_ADMIN_A';
    const mismatchedUidB = 'UID_ADMIN_B';

    // 1. Allowlist entry has firebaseAuthUid = 'UID_ADMIN_A' and email = 'admin@minerx.cloud'
    const db = readUsers();
    db.users.push({
      id: approvedUidA,
      firebaseAuthUid: approvedUidA,
      username: 'admin_a',
      email: adminEmail,
      fullName: 'Approved Admin A',
      role: 'admin',
      passwordHash: '',
      createdAt: '2026-11-13T00:00:00.000Z',
      isStoredInFirebaseAuth: true,
    });
    writeUsers(db);

    // 2. Verified Firebase token arrives with uid = 'UID_ADMIN_B' and email = 'admin@minerx.cloud'
    firebaseAdminAuthAdapter.setAuthInstance({
      verifyIdToken: async (token: string) => {
        if (token === 'mismatched_token_b') {
          return {
            uid: mismatchedUidB,
            email: adminEmail,
            name: 'Mismatched Attacker',
          };
        }
        throw new Error('Invalid token');
      },
    });

    // 3. Direct getAuthenticatedUser(req) assertion: rejects with null
    const fakeReq: any = {
      headers: {
        authorization: 'Bearer mismatched_token_b',
      },
    };
    const authenticated = await getAuthenticatedUser(fakeReq);
    assert.equal(
      authenticated,
      null,
      'getAuthenticatedUser must reject authorization with null when token UID does not match allowlist UID'
    );

    // 4. HTTP endpoint assertion: /api/auth/me returns 401 Unauthorized
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer mismatched_token_b' },
    });
    assert.equal(res.status, 401, 'HTTP /api/auth/me must return 401 Unauthorized on UID mismatch');
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.message.includes('Sesión expirada o inválida'));
  });

  // --------------------------------------------------------------------------
  // Blocker B2: localAuthService produces honest local dev identities
  // --------------------------------------------------------------------------
  it('Blocker B2: localAuthService produces honest local identities (local_user_*, firebaseAuthUid: null, isStoredInFirebaseAuth: false, isPublishedToFirestore: false)', () => {
    (globalThis as any).localStorage.clear();

    // 1. Dev registration produces honest local user
    const regRes = registerLocalUser('localdev', 'localdev@minerx.local', 'password123', 'Local Dev User');
    assert.equal(regRes.success, true);
    assert.ok(regRes.user.id.startsWith('local_user_'), `User ID must start with local_user_, got: ${regRes.user.id}`);
    assert.equal(regRes.user.firebaseAuthUid, null, 'firebaseAuthUid must be null for local user');
    assert.equal(regRes.user.isStoredInFirebaseAuth, false, 'isStoredInFirebaseAuth must be false for local user');
    assert.equal(regRes.user.isPublishedToFirestore, false, 'isPublishedToFirestore must be false for local user');
    assert.ok(regRes.message.includes('sesión local de desarrollo'));

    // 2. Dev login produces honest local user
    const loginRes = loginLocalUser('localdev@minerx.local', 'password123');
    assert.equal(loginRes.success, true);
    assert.ok(loginRes.user.id.startsWith('local_user_'), `User ID must start with local_user_, got: ${loginRes.user.id}`);
    assert.equal(loginRes.user.firebaseAuthUid, null, 'firebaseAuthUid must remain null upon login');
    assert.equal(loginRes.user.isStoredInFirebaseAuth, false, 'isStoredInFirebaseAuth must remain false upon login');
    assert.equal(loginRes.user.isPublishedToFirestore, false, 'isPublishedToFirestore must remain false upon login');

    // 3. Stored session returns honest flags
    const session = getLocalSession();
    assert.ok(session.user, 'Session user must be present');
    assert.ok(session.user.id.startsWith('local_user_'));
    assert.equal(session.user.firebaseAuthUid, null);
    assert.equal(session.user.isStoredInFirebaseAuth, false);
    assert.equal(session.user.isPublishedToFirestore, false);

    // 4. Audit reports AUTH_UNAVAILABLE with no false synchronization
    const audit = auditLocalUsers();
    assert.equal(audit.success, true);
    assert.equal(audit.summary.firebaseAuthOperational, false);
    assert.equal(audit.summary.firestoreOperational, false);
    assert.equal(audit.summary.synchronizedCount, 0);
    assert.ok(
      audit.users.every(
        (u: any) => u.inFirebaseAuth === false && u.inFirestore === false && u.status === 'AUTH_UNAVAILABLE'
      ),
      'All local users in dev mode must have AUTH_UNAVAILABLE status'
    );

    // 5. Repair normalizes records without synthesizing fake Firebase claims
    const repair = repairLocalUsers();
    assert.equal(repair.success, true);
    assert.equal(repair.repairedCount, 0, 'repairedCount must be 0 (no false Firebase sync claims)');
  });

  // --------------------------------------------------------------------------
  // Blocker B3: Firestore projection failure/unavailable safety in provisionAdmin
  // --------------------------------------------------------------------------
  it('Blocker B3: provisionAdmin ensures isPublishedToFirestore remains false and success is false if Firestore throws or is unavailable', async () => {
    // Case 1: Firestore throws error during .set()
    const failingFirestore = {
      collection: () => ({
        doc: () => ({
          set: async () => {
            throw new Error('Firestore connection timeout / simulated rejection');
          },
        }),
      }),
    };

    const failResult = await provisionAdmin({
      email: realUserEmail,
      role: 'admin',
      dryRun: false,
      skipFirestore: false,
      firestoreInstance: failingFirestore,
    });

    assert.equal(failResult.success, false, 'success must be false when Firestore projection throws');
    assert.equal(failResult.firestoreProjected, false, 'firestoreProjected must be false when Firestore throws');
    assert.equal(failResult.user.isPublishedToFirestore, false, 'result.user.isPublishedToFirestore must remain false');
    assert.ok(
      failResult.firestoreError?.includes('Firestore connection timeout'),
      'firestoreError must capture error message'
    );

    let db = readUsers();
    let savedUser = db.users.find((u) => u.email === realUserEmail);
    assert.ok(savedUser, 'User must be recorded in users.json');
    assert.equal(
      savedUser?.isPublishedToFirestore,
      false,
      'users.json must record isPublishedToFirestore=false when Firestore write throws'
    );

    // Case 2: Firestore unavailable (null instance and not skipped)
    const unavailResult = await provisionAdmin({
      email: realUserEmail,
      role: 'admin',
      dryRun: false,
      skipFirestore: false,
      firestoreInstance: null,
    });

    assert.equal(unavailResult.success, false, 'success must be false when Firestore is unavailable and not skipped');
    assert.equal(unavailResult.firestoreProjected, false, 'firestoreProjected must be false');
    assert.equal(unavailResult.user.isPublishedToFirestore, false, 'isPublishedToFirestore must be false');

    db = readUsers();
    savedUser = db.users.find((u) => u.email === realUserEmail);
    assert.ok(savedUser);
    assert.equal(
      savedUser?.isPublishedToFirestore,
      false,
      'users.json must record isPublishedToFirestore=false when Firestore is unavailable'
    );

    // Case 3: Firestore explicitly skipped
    const skippedResult = await provisionAdmin({
      email: realUserEmail,
      role: 'admin',
      dryRun: false,
      skipFirestore: true,
    });

    assert.equal(skippedResult.success, true, 'success must be true when Firestore is explicitly skipped');
    assert.equal(skippedResult.firestoreProjected, false, 'firestoreProjected must be false when skipped');
    assert.equal(skippedResult.user.isPublishedToFirestore, false, 'isPublishedToFirestore must remain false');

    db = readUsers();
    savedUser = db.users.find((u) => u.email === realUserEmail);
    assert.ok(savedUser);
    assert.equal(
      savedUser?.isPublishedToFirestore,
      false,
      'users.json must record isPublishedToFirestore=false when skipped'
    );
  });
});
