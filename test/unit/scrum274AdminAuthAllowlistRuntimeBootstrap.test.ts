import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { app, setUsersFilePath, writeUsers } from '../../server/server.js';
import {
  firebaseAdminAllowlistAdapter,
  type FirestoreLike,
} from '../../server/services/firebaseAdminAllowlistAdapter.js';
import { firebaseAdminAuthAdapter } from '../../server/services/firebaseAdminAuthAdapter.js';
import { provisionAdmin, runCli } from '../../scripts/provisionAdmin.js';

const adminToken = { uid: 'uid-admin-274', email: 'admin-274@example.com', email_verified: true };

function useAuthToken(
  token: { uid: string; email?: string | null; email_verified?: boolean } = adminToken
): void {
  firebaseAdminAuthAdapter.setAuthInstance({
    verifyIdToken: async (value: string) => (value === 'valid-token' ? token : null),
  } as any);
}

function createFirestore(options: {
  data?: Record<string, unknown>;
  legacyData?: Array<Record<string, unknown>>;
  error?: Error;
  legacyError?: Error;
  writes?: Array<{ id: string; data: Record<string, unknown>; options: unknown }>;
} = {}): FirestoreLike & { lookups: string[]; getCalls: number } {
  const lookups: string[] = [];
  let getCalls = 0;
  const writes = options.writes || [];
  return {
    lookups,
    get getCalls() {
      return getCalls;
    },
    collection(name: string) {
      assert.equal(name, 'admin_users');
      return {
        doc(id: string) {
          lookups.push(id);
          return {
            async get() {
              if (options.error) throw options.error;
              return {
                exists: Boolean(options.data),
                data: () => options.data,
              };
            },
            async set(data: Record<string, unknown>, setOptions?: { merge?: boolean }) {
              writes.push({ id, data, options: setOptions });
            },
          };
        },
        async get() {
          getCalls += 1;
          if (options.legacyError) throw options.legacyError;
          return {
            docs: (options.legacyData || []).map((data, index) => ({
              id: `legacy-${index}`,
              exists: true,
              data: () => data,
            })),
          };
        },
      };
    },
  };
}

async function requestMe(token?: string): Promise<{ status: number; body: any }> {
  const listener = app.listen(0);
  try {
    const address = listener.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/me`, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
}

async function requestRoute(
  route: string,
  init: RequestInit = {}
): Promise<{ status: number; body: any }> {
  const listener = app.listen(0);
  try {
    const address = listener.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}${route}`, init);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
}

describe('SCRUM-274 admin allowlist authority', () => {
  let temporaryDirectory: string | null = null;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.ADMIN_ALLOWLIST_SOURCE = 'firestore';
    useAuthToken();
  });

  afterEach(() => {
    firebaseAdminAuthAdapter.setAuthInstance(null);
    firebaseAdminAllowlistAdapter.setFirestoreInstance(null);
    setUsersFilePath(null);
    delete process.env.ADMIN_ALLOWLIST_SOURCE;
    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = null;
    }
  });

  after(() => {
    delete process.env.NODE_ENV;
  });

  it('returns 200 only for an exact approved Firestore UID document', async () => {
    firebaseAdminAllowlistAdapter.setFirestoreInstance(
      createFirestore({
        data: {
          uid: adminToken.uid,
          firebaseAuthUid: adminToken.uid,
          email: adminToken.email,
          role: 'admin',
        },
      })
    );

    const result = await requestMe('valid-token');

    assert.equal(result.status, 200);
    assert.equal(result.body.user.id, adminToken.uid);
  });

  it('keeps missing, invalid, and non-allowlisted tokens closed without a Firestore lookup', async () => {
    const firestore = createFirestore();
    firebaseAdminAllowlistAdapter.setFirestoreInstance(firestore);

    const missing = await requestMe();
    const invalid = await requestMe('invalid-token');
    const missingDocument = await requestMe('valid-token');

    assert.equal(missing.status, 401);
    assert.equal(invalid.status, 401);
    assert.equal(missingDocument.status, 401);
    assert.deepEqual(firestore.lookups, [adminToken.uid]);
  });

  it('requires the exact Firestore document to declare the admin role', async () => {
    for (const data of [
      { uid: adminToken.uid, email: adminToken.email },
      { uid: adminToken.uid, email: adminToken.email, role: '' },
      { uid: adminToken.uid, email: adminToken.email, role: 'user' },
    ]) {
      firebaseAdminAllowlistAdapter.setFirestoreInstance(createFirestore({ data }));
      const result = await requestMe('valid-token');
      assert.equal(result.status, 401);
    }
  });

  it('returns a safe 503 diagnostic when the Firestore authority is unavailable', async () => {
    firebaseAdminAllowlistAdapter.setFirestoreInstance(createFirestore({ error: new Error('secret path') }));

    const result = await requestMe('valid-token');

    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'ADMIN_ALLOWLIST_UNAVAILABLE');
    assert.equal(JSON.stringify(result.body).includes('secret path'), false);
    assert.equal(firebaseAdminAllowlistAdapter.getLastDiagnostic(), 'firestore-read-failed');
  });

  it('does not use email fallback after an exact UID binding conflict', async () => {
    const firestore = createFirestore({
      data: { uid: adminToken.uid, firebaseAuthUid: 'different-uid', email: adminToken.email, role: 'admin' },
      legacyData: [{ email: adminToken.email, role: 'admin' }],
    });
    firebaseAdminAllowlistAdapter.setFirestoreInstance(firestore);

    const result = await requestMe('valid-token');

    assert.equal(result.status, 401);
    assert.equal(firestore.getCalls, 0);

    firebaseAdminAllowlistAdapter.setFirestoreInstance(
      createFirestore({
        data: { uid: 'different-uid', firebaseAuthUid: adminToken.uid, email: adminToken.email, role: 'admin' },
      })
    );
    const reversedConflict = await requestMe('valid-token');
    assert.equal(reversedConflict.status, 401);
  });

  it('supports normalized legacy Firestore email matching and denies bound candidates', async () => {
    firebaseAdminAllowlistAdapter.setFirestoreInstance(
      createFirestore({ legacyData: [{ email: ` ${adminToken.email.toUpperCase()} `, role: ' ADMIN ' }] })
    );
    const legacy = await requestMe('valid-token');
    assert.equal(legacy.status, 200);

    firebaseAdminAllowlistAdapter.setFirestoreInstance(
      createFirestore({
        legacyData: [{ email: ` ${adminToken.email.toUpperCase()} `, role: 'admin', uid: 'bound-uid' }],
      })
    );
    const bound = await requestMe('valid-token');
    assert.equal(bound.status, 401);
  });

  it('requires a verified Firebase email for legacy fallback but not exact UID authorization', async () => {
    for (const token of [
      { uid: adminToken.uid, email: adminToken.email, email_verified: false },
      { uid: adminToken.uid, email: adminToken.email },
    ]) {
      useAuthToken(token);
      const firestore = createFirestore({
        data: {
          uid: adminToken.uid,
          firebaseAuthUid: adminToken.uid,
          email: adminToken.email,
          role: 'admin',
        },
        legacyData: [{ email: adminToken.email, role: 'admin' }],
      });
      firebaseAdminAllowlistAdapter.setFirestoreInstance(firestore);
      const exactUid = await requestMe('valid-token');
      assert.equal(exactUid.status, 200);
      assert.equal(firestore.getCalls, 0);
    }

    for (const token of [
      { uid: adminToken.uid, email: adminToken.email, email_verified: false },
      { uid: adminToken.uid, email: adminToken.email },
    ]) {
      useAuthToken(token);
      const firestore = createFirestore({ legacyData: [{ email: adminToken.email, role: 'admin' }] });
      firebaseAdminAllowlistAdapter.setFirestoreInstance(firestore);
      const legacy = await requestMe('valid-token');
      assert.equal(legacy.status, 401);
      assert.equal(firestore.getCalls, 0);
    }
  });

  it('denies ambiguous or unavailable legacy Firestore email lookup', async () => {
    firebaseAdminAllowlistAdapter.setFirestoreInstance(
      createFirestore({
        legacyData: [
          { email: adminToken.email, role: 'admin' },
          { email: adminToken.email, role: 'admin' },
        ],
      })
    );
    const ambiguous = await requestMe('valid-token');
    assert.equal(ambiguous.status, 401);

    firebaseAdminAllowlistAdapter.setFirestoreInstance(
      createFirestore({ legacyError: new Error('secret query path') })
    );
    const unavailable = await requestMe('valid-token');
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.code, 'ADMIN_ALLOWLIST_UNAVAILABLE');
    assert.equal(JSON.stringify(unavailable.body).includes('secret query path'), false);
  });

  it('denies a token without email and never falls back to local users.json in Firestore mode', async () => {
    const noEmailToken = { uid: 'uid-no-email-274' };
    firebaseAdminAuthAdapter.setAuthInstance({
      verifyIdToken: async (token: string) => (token === 'no-email-token' ? noEmailToken : null),
    } as any);
    const firestore = createFirestore();
    firebaseAdminAllowlistAdapter.setFirestoreInstance(firestore);
    const noEmail = await requestMe('no-email-token');
    assert.equal(noEmail.status, 401);
    assert.equal(firestore.getCalls, 0);

    temporaryDirectory = mkdtempSync(join(tmpdir(), 'scrum274-'));
    const usersFile = join(temporaryDirectory, 'users.json');
    setUsersFilePath(usersFile);
    writeUsers({
      users: [
        {
          id: 'legacy-admin',
          username: 'legacy-admin',
          email: adminToken.email,
          passwordHash: '',
          fullName: 'Legacy Admin',
          role: 'admin',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    firebaseAdminAuthAdapter.setAuthInstance({
      verifyIdToken: async (token: string) => (token === 'valid-token' ? adminToken : null),
    } as any);
    const localMatch = await requestMe('valid-token');
    assert.equal(localMatch.status, 401);
  });

  it('preserves allowlist infrastructure failures as 503 on canonical Admin catalog routes', async () => {
    firebaseAdminAllowlistAdapter.setFirestoreInstance(createFirestore({ error: new Error('secret route path') }));
    const routes: Array<[string, RequestInit]> = [
      ['/api/catalog/admin', { headers: { authorization: 'Bearer valid-token' } }],
      [
        '/api/catalog/packages',
        { method: 'POST', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' }, body: '{}' },
      ],
      [
        '/api/catalog/packages/pkg-274/archive',
        { method: 'POST', headers: { authorization: 'Bearer valid-token' } },
      ],
    ];

    for (const [route, init] of routes) {
      const result = await requestRoute(route, init);
      assert.equal(result.status, 503);
      assert.equal(result.body.code, 'ADMIN_ALLOWLIST_UNAVAILABLE');
      assert.equal(JSON.stringify(result.body).includes('secret route path'), false);
    }
  });

  it('retains the mount-time infrastructure error instead of logging out on a safe 503', () => {
    const source = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
    const mountAuth = source.slice(source.indexOf("apiFetch('/api/auth/me')"), source.indexOf('// Intercept 401'));
    assert.match(mountAuth, /res\.status === 503/);
    assert.match(mountAuth, /setAuthInfrastructureError\(/);
    assert.match(mountAuth, /return null;/);
    const unavailableBranch = mountAuth.slice(mountAuth.indexOf('if (res.status === 503)'), mountAuth.indexOf('handleLogout();'));
    assert.equal(unavailableBranch.includes('handleLogout'), false);
  });

  it('provisions Firestore authority idempotently without touching users.json', async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'scrum274-'));
    const usersFile = join(temporaryDirectory, 'users.json');
    const writes: Array<{ id: string; data: Record<string, unknown>; options: unknown }> = [];
    const firestore = createFirestore({ writes });
    const authAdapter = {
      isInitialized: () => true,
      getUser: async (uid: string) => ({ uid, email: adminToken.email, displayName: 'Admin 274' }),
      getUserByEmail: async () => ({ uid: adminToken.uid, email: adminToken.email, displayName: 'Admin 274' }),
      getApp: () => ({ name: 'test-app' }),
    } as any;

    const first = await provisionAdmin({
      uid: adminToken.uid,
      authority: 'firestore',
      authAdapter,
      firestoreInstance: firestore,
    });
    const second = await provisionAdmin({
      uid: adminToken.uid,
      authority: 'firestore',
      authAdapter,
      firestoreInstance: firestore,
    });

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(writes.length, 2);
    assert.equal(writes[0].id, adminToken.uid);
    assert.deepEqual(writes[0].options, { merge: true });
    assert.equal(existsSync(usersFile), false);
  });

  it('rejects nonexistent Firebase identities and keeps canonical CLI output free of identity values', async () => {
    const authAdapter = {
      isInitialized: () => true,
      getUser: async () => null,
      getUserByEmail: async () => null,
      getApp: () => ({ name: 'test-app' }),
    } as any;

    await assert.rejects(
      () =>
        provisionAdmin({
          uid: 'nonexistent-uid',
          authority: 'firestore',
          authAdapter,
          firestoreInstance: createFirestore(),
        }),
      /Identidad no encontrada/
    );

    firebaseAdminAuthAdapter.setAuthInstance(null);
    const originalError = console.error;
    const output: string[] = [];
    console.error = (...args: unknown[]) => output.push(args.join(' '));
    try {
      const cliResult = await runCli(['--authority=firestore', '--uid=nonexistent-uid']);
      assert.equal(cliResult.exitCode, 1);
    } finally {
      console.error = originalError;
    }
    assert.equal(output.join('\n').includes('nonexistent-uid'), false);
  });
});
