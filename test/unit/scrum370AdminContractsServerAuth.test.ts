// Browser global polyfills for Node.js unit test execution
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
  (globalThis as any).window = {
    location: { origin: 'http://localhost:3001', protocol: 'http:', search: '', pathname: '/' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
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

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import * as serverModule from '../../server/server.js';
import { HashrateAllocationService } from '../../src/services/admin/hashrateAllocationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

function readSource(relPath: string): string {
  return fs.readFileSync(path.resolve(projectRoot, relPath), 'utf8');
}

interface MockFirestoreState {
  collections: Map<string, Map<string, Record<string, any>>>;
  setCalls: Array<{ collection: string; id: string; data: Record<string, any>; options?: any }>;
}

function createMockAdminFirestore() {
  const state: MockFirestoreState = {
    collections: new Map(),
    setCalls: [],
  };

  const getCol = (name: string) => {
    let col = state.collections.get(name);
    if (!col) {
      col = new Map();
      state.collections.set(name, col);
    }
    return col;
  };

  const firestore = {
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            async get() {
              const data = getCol(name).get(id);
              return {
                id,
                exists: data !== undefined,
                data: () => (data ? structuredClone(data) : undefined),
              };
            },
            async set(data: Record<string, any>, options?: { merge?: boolean }) {
              const col = getCol(name);
              const prev = options?.merge ? (col.get(id) || {}) : {};
              const next = { ...prev, ...structuredClone(data) };
              col.set(id, next);
              state.setCalls.push({ collection: name, id, data: structuredClone(data), options });
            },
          };
        },
        async get() {
          const docs = Array.from(getCol(name).entries()).map(([id, data]) => ({
            id,
            exists: true,
            data: () => structuredClone(data),
          }));
          return { empty: docs.length === 0, docs };
        },
      };
    },
  };

  return { firestore, state };
}

describe('SCRUM-370 (PG-06) Task 1: Server-Authoritative /admin_contracts Migration', () => {
  it('1. Removes all browser setDoc writes on admin_contracts in hashrateAllocationService.ts', () => {
    const src = readSource('src/services/admin/hashrateAllocationService.ts');
    assert.equal(src.includes('setDoc('), false, 'hashrateAllocationService.ts must contain 0 setDoc( calls');
    assert.equal(src.includes('updateDoc('), false, 'hashrateAllocationService.ts must contain 0 updateDoc( calls');
    assert.equal(src.includes('deleteDoc('), false, 'hashrateAllocationService.ts must contain 0 deleteDoc( calls');
    assert.ok(src.includes('/api/admin/contracts'), 'hashrateAllocationService.ts must mutate via /api/admin/contracts');
    assert.ok(src.includes('orderId'), 'hashrateAllocationService.ts must map orderId');
    assert.ok(src.includes('activatedMinerId'), 'hashrateAllocationService.ts must map activatedMinerId');
    assert.ok(src.includes('intentId'), 'hashrateAllocationService.ts must map intentId');
  });

  it('2. Adds traceability fields orderId?, activatedMinerId?, intentId? to MiningContract in src/types/admin.ts', () => {
    const typesSrc = readSource('src/types/admin.ts');
    const match = typesSrc.match(/export interface MiningContract\s*\{[\s\S]*?\}/);
    assert.ok(match, 'MiningContract interface must exist');
    const block = match[0];
    assert.match(block, /orderId\?:\s*string/);
    assert.match(block, /activatedMinerId\?:\s*string/);
    assert.match(block, /intentId\?:\s*string/);
  });

  describe('3. Express POST /api/admin/contracts & PATCH /api/admin/contracts/:contractId with Admin SDK Firestore', () => {
    let server: http.Server;
    let baseUrl: string;
    let tempDir: string;
    let prevAllowlistSource: string | undefined;
    let prevAllowLocalDev: string | undefined;
    const adminToken = 'scrum370-admin-token-valid';
    const mock = createMockAdminFirestore();

    before(async () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrum370-contracts-'));
      prevAllowlistSource = process.env.ADMIN_ALLOWLIST_SOURCE;
      prevAllowLocalDev = process.env.ALLOW_LOCAL_DEV_SESSION;
      process.env.ADMIN_ALLOWLIST_SOURCE = 'file';
      process.env.ALLOW_LOCAL_DEV_SESSION = 'true';

      serverModule.setDataDir(tempDir);
      serverModule.setUsersFilePath(path.join(tempDir, 'users.json'));
      serverModule.writeUsers({
        users: [
          {
            id: 'adm_scrum370_01',
            username: 'admin370',
            email: 'admin370@pouwminer.com',
            fullName: 'Admin 370',
            role: 'admin',
            sessionToken: adminToken,
            passwordHash: '',
            createdAt: '2026-11-22T00:00:00.000Z',
          },
        ],
      });

      assert.equal(
        typeof (serverModule as any).setAdminContractsFirestore,
        'function',
        'server/server.ts must export setAdminContractsFirestore for Admin SDK injection',
      );
      (serverModule as any).setAdminContractsFirestore(mock.firestore);

      server = http.createServer(serverModule.app);
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
      });
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      baseUrl = `http://127.0.0.1:${address.port}`;
    });

    after(async () => {
      if (typeof (serverModule as any).setAdminContractsFirestore === 'function') {
        (serverModule as any).setAdminContractsFirestore(null);
      }
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      serverModule.setDataDir(null);
      if (prevAllowlistSource === undefined) delete process.env.ADMIN_ALLOWLIST_SOURCE;
      else process.env.ADMIN_ALLOWLIST_SOURCE = prevAllowlistSource;
      if (prevAllowLocalDev === undefined) delete process.env.ALLOW_LOCAL_DEV_SESSION;
      else process.env.ALLOW_LOCAL_DEV_SESSION = prevAllowLocalDev;
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    beforeEach(() => {
      mock.state.collections.clear();
      mock.state.setCalls.length = 0;
      serverModule.writeContracts([]);
    });

    it('rejects POST and PATCH without admin token with 401', async () => {
      const postRes = await fetch(`${baseUrl}/api/admin/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'ctr_unauth_1', contractedTh: 64, allocatedTh: 64 }),
      });
      assert.equal(postRes.status, 401);

      const patchRes = await fetch(`${baseUrl}/api/admin/contracts/ctr_unauth_1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocatedTh: 32 }),
      });
      assert.equal(patchRes.status, 401);
      assert.equal(mock.state.setCalls.length, 0);
    });

    it('validates safe contract id, allocatedTh range [0, contractedTh], and allowed status on POST', async () => {
      const badIdRes = await fetch(`${baseUrl}/api/admin/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: '../evil', contractedTh: 64, allocatedTh: 32 }),
      });
      assert.equal(badIdRes.status, 400);

      const overAllocRes = await fetch(`${baseUrl}/api/admin/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: 'ctr_over_1', contractedTh: 64, allocatedTh: 128 }),
      });
      assert.equal(overAllocRes.status, 400);

      const negAllocRes = await fetch(`${baseUrl}/api/admin/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: 'ctr_neg_1', contractedTh: 64, allocatedTh: -5 }),
      });
      assert.equal(negAllocRes.status, 400);

      const badStatusRes = await fetch(`${baseUrl}/api/admin/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: 'ctr_status_1', contractedTh: 64, allocatedTh: 64, status: 'HACKED' }),
      });
      assert.equal(badStatusRes.status, 400);
      assert.equal(mock.state.setCalls.length, 0);
    });

    it('persists POST /api/admin/contracts via Firebase Admin SDK Firestore and strips client authority fields', async () => {
      const res = await fetch(`${baseUrl}/api/admin/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          id: 'contract_ord_370',
          orderId: 'ord_370',
          activatedMinerId: 'miner_ord_370',
          intentId: 'pi_370',
          userId: 'buyer_uid_1',
          userEmail: 'buyer@pouwminer.com',
          packageId: 'pkg-miner-2',
          packageName: 'Minero 2 Standard',
          contractedTh: 64,
          allocatedTh: 64,
          status: 'ACTIVE',
          updatedBy: 'spoofed_actor',
          adminId: 'spoofed_admin',
          role: 'SUPER_ADMIN',
        }),
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as any;
      assert.equal(json.success, true);
      assert.equal(json.contract.id, 'contract_ord_370');
      assert.equal(json.contract.updatedBy, 'adm_scrum370_01');
      assert.equal(json.contract.adminId, undefined);
      assert.equal(json.contract.role, undefined);
      assert.equal(json.contract.orderId, 'ord_370');
      assert.equal(json.contract.activatedMinerId, 'miner_ord_370');
      assert.equal(json.contract.intentId, 'pi_370');

      const contractWrite = mock.state.setCalls.find((c) => c.collection === 'admin_contracts' && c.id === 'contract_ord_370');
      assert.ok(contractWrite, 'POST /api/admin/contracts must persist to Firestore admin_contracts/{id}');
      assert.equal(contractWrite.options?.merge, true);
      assert.equal(contractWrite.data.updatedBy, 'adm_scrum370_01');
      assert.equal(contractWrite.data.orderId, 'ord_370');
    });

    it('updates allocation & recalculates status via PATCH /api/admin/contracts/:contractId and persists via Admin SDK', async () => {
      // Seed contract directly into Firestore admin_contracts (simulating SCRUM-345 settlement write)
      await mock.firestore.collection('admin_contracts').doc('contract_patch_1').set({
        id: 'contract_patch_1',
        orderId: 'ord_patch_1',
        activatedMinerId: 'miner_ord_patch_1',
        intentId: 'pi_patch_1',
        userId: 'buyer_2',
        contractedTh: 96,
        allocatedTh: 96,
        status: 'ACTIVE',
      });
      mock.state.setCalls.length = 0;

      // Reject > contractedTh
      const overRes = await fetch(`${baseUrl}/api/admin/contracts/contract_patch_1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ allocatedTh: 120, reason: 'Over-allocation attempt' }),
      });
      assert.equal(overRes.status, 400);

      // Valid partial allocation -> PARTIALLY_ALLOCATED
      const partialRes = await fetch(`${baseUrl}/api/admin/contracts/contract_patch_1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          allocatedTh: 48,
          reason: 'Rebalance cluster',
          updatedBy: 'spoofed',
          role: 'SUPER_ADMIN',
        }),
      });
      assert.equal(partialRes.status, 200);
      const partialJson = (await partialRes.json()) as any;
      assert.equal(partialJson.success, true);
      assert.equal(partialJson.contract.allocatedTh, 48);
      assert.equal(partialJson.contract.status, 'PARTIALLY_ALLOCATED');
      assert.equal(partialJson.contract.updatedBy, 'adm_scrum370_01');
      assert.equal(partialJson.contract.role, undefined);

      const patchWrite = mock.state.setCalls.find((c) => c.collection === 'admin_contracts' && c.id === 'contract_patch_1');
      assert.ok(patchWrite, 'PATCH must write to Firestore admin_contracts/{contractId}');
      assert.equal(patchWrite.options?.merge, true);
      assert.equal(patchWrite.data.allocatedTh, 48);
      assert.equal(patchWrite.data.status, 'PARTIALLY_ALLOCATED');

      // Explicit status toggle -> SUSPENDED
      const suspendRes = await fetch(`${baseUrl}/api/admin/contracts/contract_patch_1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'SUSPENDED', reason: 'Maintenance pause' }),
      });
      assert.equal(suspendRes.status, 200);
      const suspendJson = (await suspendRes.json()) as any;
      assert.equal(suspendJson.contract.status, 'SUSPENDED');

      // Non-existent contract -> 404
      const missingRes = await fetch(`${baseUrl}/api/admin/contracts/does_not_exist_999`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'SUSPENDED' }),
      });
      assert.equal(missingRes.status, 404);
    });

    it('propagates HTTP 500 when configured Admin SDK Firestore write fails (never silently succeeds)', async () => {
      const failingFirestore = {
        collection() {
          return {
            doc() {
              return {
                async get() {
                  return { id: 'ctr_fail_500', exists: false, data: () => undefined };
                },
                async set() {
                  throw new Error('FIRESTORE_UNAVAILABLE_SIMULATED');
                },
              };
            },
          };
        },
      };

      (serverModule as any).setAdminContractsFirestore(failingFirestore);
      try {
        const res = await fetch(`${baseUrl}/api/admin/contracts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({
            id: 'ctr_fail_500',
            contractedTh: 64,
            allocatedTh: 64,
            status: 'ACTIVE',
          }),
        });
        assert.equal(res.status, 500, 'Firestore write failure must return HTTP 500');
      } finally {
        (serverModule as any).setAdminContractsFirestore(mock.firestore);
      }
    });
  });

  it('4. HashrateAllocationService.updateContractAllocation and updateContractStatus are async and throw on !res.ok', async () => {
    const service = HashrateAllocationService.getInstance();
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as any).fetch = async () =>
        new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });

      await assert.rejects(
        async () => {
          await service.updateContractAllocation('ctr-1001', 64, 'test fail');
        },
        /Forbidden|403|No se pudo/i,
        'updateContractAllocation must reject when backend returns !res.ok',
      );

      await assert.rejects(
        async () => {
          await service.updateContractStatus('ctr-1001', 'SUSPENDED', 'test fail');
        },
        /Forbidden|403|No se pudo/i,
        'updateContractStatus must reject when backend returns !res.ok',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
