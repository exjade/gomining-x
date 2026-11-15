import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { app, setDataDir } from '../../server/server.js';
import { firebaseAdminAuthAdapter } from '../../server/services/firebaseAdminAuthAdapter.js';

type CycleRequest = {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
};

const USER_A_UID = 'firebase-user-a';
const USER_B_UID = 'firebase-user-b';
const USER_A_TOKEN = 'firebase-token-a';
const USER_B_TOKEN = 'firebase-token-b';
const INVALID_TOKEN = 'invalid-token';
const EXPIRED_TOKEN = 'expired-token';

const EMPTY_CYCLES = { activeCycle: null, closedCycles: [] };

function computeDirectoryHashes(dirPath: string): Map<string, string> {
  const hashes = new Map<string, string>();
  if (!fs.existsSync(dirPath)) return hashes;

  function visit(currentDir: string, relativeBase: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        visit(fullPath, relativePath);
      } else if (entry.isFile()) {
        hashes.set(
          relativePath,
          crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex').toUpperCase()
        );
      }
    }
  }

  visit(dirPath, '');
  return hashes;
}

function assertSameHashes(beforeHashes: Map<string, string>, afterHashes: Map<string, string>): void {
  assert.equal(afterHashes.size, beforeHashes.size, 'File count must remain unchanged');
  for (const [relativePath, hash] of beforeHashes) {
    assert.equal(afterHashes.get(relativePath), hash, `${relativePath} must remain byte-identical`);
  }
}

function jsonRequest(token: string | undefined, method: 'GET' | 'POST', body?: Record<string, unknown>): RequestInit {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  return {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

describe('SCRUM-268: Mining cycles USER_AUTH hardening', () => {
  let server: http.Server;
  let baseUrl: string;
  let serverPort: number;
  let tempDir: string;
  let preSuiteHashes: Map<string, string>;
  let verifyCalls: string[];
  const realDataDir = path.join(process.cwd(), 'server', 'data');

  const request = (target: CycleRequest, token?: string): Promise<Response> =>
    fetch(`${baseUrl}${target.path}`, jsonRequest(token, target.method, target.body));

  const cycleFile = (uid: string): string => path.join(tempDir, 'users', uid, 'mining_cycles.json');

  before(async () => {
    preSuiteHashes = computeDirectoryHashes(realDataDir);
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    assertSameHashes(preSuiteHashes, computeDirectoryHashes(realDataDir));
    firebaseAdminAuthAdapter.setAuthInstance(null);
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrum268-store-'));
    setDataDir(tempDir);
    verifyCalls = [];
    firebaseAdminAuthAdapter.setAuthInstance({
      verifyIdToken: async (token: string) => {
        verifyCalls.push(token);
        if (token === USER_A_TOKEN) return { uid: USER_A_UID, email: 'a@example.test' };
        if (token === USER_B_TOKEN) return { uid: USER_B_UID, email: 'b@example.test' };
        if (token === EXPIRED_TOKEN) throw new Error('Firebase ID token has expired');
        throw new Error('Firebase ID token is invalid');
      },
    });
  });

  afterEach(() => {
    setDataDir(null);
    firebaseAdminAuthAdapter.setAuthInstance(null);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const protectedRoutes: CycleRequest[] = [
    { method: 'GET', path: '/api/mining/cycles' },
    { method: 'POST', path: '/api/mining/cycles/start', body: {} },
    { method: 'POST', path: '/api/mining/cycles/close', body: {} },
    { method: 'POST', path: '/api/mining/cycles/save', body: {} },
  ];

  it('rejects anonymous, invalid, expired, query-token, and legacy-session requests before storage access', async () => {
    const sentinel = { activeCycle: { id: 'default-sentinel' }, closedCycles: [] };
    const defaultDir = path.join(tempDir, 'users', 'usr_default_admin');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'mining_cycles.json'), JSON.stringify(sentinel), 'utf-8');
    fs.writeFileSync(path.join(defaultDir, 'mining_cycles.json'), JSON.stringify(sentinel), 'utf-8');
    const beforeRequests = computeDirectoryHashes(tempDir);

    for (const target of protectedRoutes) {
      assert.equal((await request(target)).status, 401, `anonymous ${target.method} ${target.path}`);
      assert.equal(
        (await request(target, INVALID_TOKEN)).status,
        401,
        `invalid ${target.method} ${target.path}`
      );
      assert.equal(
        (await request(target, EXPIRED_TOKEN)).status,
        401,
        `expired ${target.method} ${target.path}`
      );
    }

    assert.equal(
      (await request({ method: 'GET', path: '/api/mining/cycles?token=' + USER_A_TOKEN })).status,
      401,
      'query token must not authenticate'
    );
    assert.equal(
      (await request({ method: 'GET', path: '/api/mining/cycles' }, 'legacy-session-token')).status,
      401,
      'legacy sessionToken must not authenticate'
    );
    assert.deepEqual(computeDirectoryHashes(tempDir), beforeRequests, 'unauthenticated requests must not write any namespace');
    assert.deepEqual(verifyCalls, [
      INVALID_TOKEN, EXPIRED_TOKEN,
      INVALID_TOKEN, EXPIRED_TOKEN,
      INVALID_TOKEN, EXPIRED_TOKEN,
      INVALID_TOKEN, EXPIRED_TOKEN,
      'legacy-session-token',
    ]);
  });

  it('accepts any valid Firebase user without Admin registration and isolates User A from User B', async () => {
    const initialA = await request({ method: 'GET', path: '/api/mining/cycles' }, USER_A_TOKEN);
    const initialB = await request({ method: 'GET', path: '/api/mining/cycles' }, USER_B_TOKEN);
    assert.equal(initialA.status, 200);
    assert.equal(initialB.status, 200);
    assert.deepEqual(await initialA.json(), { success: true, ...EMPTY_CYCLES });
    assert.deepEqual(await initialB.json(), { success: true, ...EMPTY_CYCLES });

    const startA = await request(
      {
        method: 'POST',
        path: '/api/mining/cycles/start',
        body: {
          userId: USER_B_UID,
          containerGroupName: 'group-a',
          organizationName: 'org-a',
          activeGpuCount: 1,
          hourlySaladRateUSD: 2.5,
          initialCryptoBalance: 10,
          cryptoCurrency: 'PRL',
        },
      },
      USER_A_TOKEN
    );
    assert.equal(startA.status, 200);
    const startAData = await startA.json() as any;
    assert.equal(startAData.activeCycle.containerGroupName, 'group-a');
    assert.equal(startAData.activeCycle.status, 'ACTIVE');

    const readB = await request({ method: 'GET', path: `/api/mining/cycles?userId=${USER_A_UID}` }, USER_B_TOKEN);
    assert.equal(readB.status, 200);
    assert.deepEqual(await readB.json(), { success: true, ...EMPTY_CYCLES });

    const saveB = await request(
      {
        method: 'POST',
        path: '/api/mining/cycles/save',
        body: {
          userId: USER_A_UID,
          activeCycle: { id: 'cycle-b', status: 'ACTIVE' },
          closedCycles: [],
        },
      },
      USER_B_TOKEN
    );
    assert.equal(saveB.status, 200);

    const readA = await request({ method: 'GET', path: '/api/mining/cycles?userId=' + USER_B_UID }, USER_A_TOKEN);
    const readBAfterSave = await request({ method: 'GET', path: '/api/mining/cycles' }, USER_B_TOKEN);
    assert.equal((await readA.json() as any).activeCycle.id, startAData.activeCycle.id);
    assert.equal((await readBAfterSave.json() as any).activeCycle.id, 'cycle-b');

    assert.ok(fs.existsSync(cycleFile(USER_A_UID)));
    assert.ok(fs.existsSync(cycleFile(USER_B_UID)));
    assert.equal(fs.existsSync(path.join(tempDir, 'mining_cycles.json')), false, 'global cycle file must not be written');
    assert.equal(
      fs.existsSync(path.join(tempDir, 'users', 'usr_default_admin', 'mining_cycles.json')),
      false,
      'default admin namespace must not be written'
    );
  });

  it('preserves start, close, and save behavior inside the authenticated namespace', async () => {
    const start = await request(
      {
        method: 'POST',
        path: '/api/mining/cycles/start',
        body: {
          containerGroupName: 'regression-group',
          organizationName: 'regression-org',
          activeGpuCount: 2,
          gpuModel: 'test-gpu',
          hourlySaladRateUSD: 3,
          averageHashrateTHs: 5,
          initialCryptoBalance: 12,
          cryptoCurrency: 'PRL',
        },
      },
      USER_A_TOKEN
    );
    assert.equal(start.status, 200);
    const started = await start.json() as any;
    assert.equal(started.activeCycle.id, 'CICLO-001');
    assert.equal(started.activeCycle.containerGroupName, 'regression-group');
    assert.equal(started.activeCycle.initialCryptoBalance, 12);
    assert.equal(started.activeCycle.finalCryptoBalance, 12);

    const closed = await request(
      {
        method: 'POST',
        path: '/api/mining/cycles/close',
        body: {
          cycle: started.activeCycle,
          metrics: { acceptedShares: 9 },
        },
      },
      USER_A_TOKEN
    );
    assert.equal(closed.status, 200);
    const closedData = await closed.json() as any;
    assert.equal(closedData.closedCycle.status, 'CLOSED');
    assert.equal(closedData.closedCycle.acceptedShares, 9);
    assert.equal(closedData.closedCycles.length, 1);

    const savedPayload = {
      userId: USER_B_UID,
      activeCycle: { id: 'saved-a', status: 'ACTIVE' },
      closedCycles: [{ id: 'saved-closed-a', status: 'CLOSED' }],
    };
    const saved = await request(
      { method: 'POST', path: '/api/mining/cycles/save', body: savedPayload },
      USER_A_TOKEN
    );
    assert.equal(saved.status, 200);

    const afterSave = await request({ method: 'GET', path: '/api/mining/cycles' }, USER_A_TOKEN);
    assert.deepEqual(await afterSave.json(), {
      success: true,
      activeCycle: savedPayload.activeCycle,
      closedCycles: savedPayload.closedCycles,
    });
  });
});
