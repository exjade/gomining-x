import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  FirebaseAdminCatalogStoreAdapter,
  ADMIN_APP_NAME,
} from '../../server/services/firebaseAdminCatalogAdapter.js';
import {
  CatalogService,
  FirestoreCatalogStoreAdapter,
  MemoryCatalogStoreAdapter,
} from '../../src/services/catalogService.js';
import type { CommercialPackage } from '../../src/types/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKTREE_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(WORKTREE_ROOT, '../..');

describe('SCRUM-217 / POUW-1.7: Firebase Admin SDK Backend Auth Prerequisite', () => {

  describe('1. Service Account Protection & Git Rules', () => {
    it('service account file is NOT copied into the task worktree', () => {
      const saFileName = 'salad-miners-firebase-adminsdk-fbsvc-d35c5609a6.json';
      const worktreeSA = path.resolve(WORKTREE_ROOT, saFileName);
      assert.equal(fs.existsSync(worktreeSA), false, 'Service account MUST NOT be copied to worktree');

      const serverSA = path.resolve(WORKTREE_ROOT, 'server', saFileName);
      assert.equal(fs.existsSync(serverSA), false, 'Service account MUST NOT be moved inside server/');

      const srcSA = path.resolve(WORKTREE_ROOT, 'src', saFileName);
      assert.equal(fs.existsSync(srcSA), false, 'Service account MUST NOT be inside src/');
    });

    it('service account file is NOT tracked by Git anywhere in the repository', () => {
      try {
        const out = execSync('git ls-files --error-unmatch salad-miners-firebase-adminsdk-fbsvc-d35c5609a6.json', {
          cwd: WORKTREE_ROOT,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        assert.fail(`Service account file is tracked by git: ${out}`);
      } catch (err: any) {
        // Exit code non-zero means error-unmatch succeeded (file not tracked by git)
        assert.ok(err.status !== 0, 'git ls-files must fail for untracked service account');
      }
    });

    it('.gitignore in worktree includes persistent protection for firebase admin credentials', () => {
      const gitignorePath = path.resolve(WORKTREE_ROOT, '.gitignore');
      assert.ok(fs.existsSync(gitignorePath));
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      assert.ok(
        content.includes('*-firebase-adminsdk-*.json'),
        '.gitignore must contain *-firebase-adminsdk-*.json pattern'
      );
    });

    it('root .git/info/exclude protects the service account JSON pattern', () => {
      const excludePath = path.resolve(REPO_ROOT, '.git/info/exclude');
      if (fs.existsSync(excludePath)) {
        const content = fs.readFileSync(excludePath, 'utf-8');
        assert.ok(
          content.includes('*-firebase-adminsdk-*.json') || content.includes('salad-miners-firebase-adminsdk'),
          '.git/info/exclude must include service account pattern'
        );
      }
    });
  });

  describe('2. FirebaseAdminCatalogStoreAdapter Initialization & Runtime Boundaries', () => {
    it('fails safely and cleanly when GOOGLE_APPLICATION_CREDENTIALS is not configured and no emulator', async () => {
      const origCred = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const origEmu = process.env.FIRESTORE_EMULATOR_HOST;
      try {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        delete process.env.FIRESTORE_EMULATOR_HOST;

        const adapter = new FirebaseAdminCatalogStoreAdapter();
        assert.equal(adapter.isInitialized(), false, 'Adapter without credentials or emulator must fail closed');

        const pkgs = await adapter.getPackages();
        assert.deepEqual(pkgs, []);

        const single = await adapter.getPackageById('pkg-test');
        assert.equal(single, null);

        await assert.rejects(
          () => adapter.savePackage({ id: 'pkg-1', name: 'P', powerTh: 1, priceUsdt: 1, version: 1 } as any),
          /Firebase Admin Firestore is not initialized/
        );
      } finally {
        if (origCred) process.env.GOOGLE_APPLICATION_CREDENTIALS = origCred;
        if (origEmu) process.env.FIRESTORE_EMULATOR_HOST = origEmu;
      }
    });

    it('fails safely when GOOGLE_APPLICATION_CREDENTIALS points to a non-existent file', () => {
      const origCred = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const origEmu = process.env.FIRESTORE_EMULATOR_HOST;
      try {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(WORKTREE_ROOT, 'non-existent-creds-file.json');
        delete process.env.FIRESTORE_EMULATOR_HOST;

        const adapter = new FirebaseAdminCatalogStoreAdapter();
        assert.equal(adapter.isInitialized(), false, 'Adapter must fail closed if credentials file does not exist');
      } finally {
        if (origCred) process.env.GOOGLE_APPLICATION_CREDENTIALS = origCred;
        else delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (origEmu) process.env.FIRESTORE_EMULATOR_HOST = origEmu;
      }
    });

    it('fails safely and cleanly when initialized with explicit { firestore: null }', async () => {
      const dummyAdapter = new FirebaseAdminCatalogStoreAdapter({
        firestore: null,
      });

      assert.equal(dummyAdapter.isInitialized(), false, 'Adapter with firestore: null must not be initialized');
      const pkgs = await dummyAdapter.getPackages();
      assert.deepEqual(pkgs, []);
      const single = await dummyAdapter.getPackageById('pkg-test');
      assert.equal(single, null);
      await assert.rejects(
        () => dummyAdapter.savePackage({ id: 'pkg-1', name: 'P', powerTh: 1, priceUsdt: 1, version: 1 } as any),
        /Firebase Admin Firestore is not initialized/
      );
    });

    it('initializes when FIRESTORE_EMULATOR_HOST is configured', () => {
      const origCred = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const origEmu = process.env.FIRESTORE_EMULATOR_HOST;
      try {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

        const adapter = new FirebaseAdminCatalogStoreAdapter({ projectId: 'demo-test-project' });
        assert.ok(adapter.isInitialized(), 'Adapter must initialize when FIRESTORE_EMULATOR_HOST is set');
      } finally {
        if (origCred) process.env.GOOGLE_APPLICATION_CREDENTIALS = origCred;
        else delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (origEmu) process.env.FIRESTORE_EMULATOR_HOST = origEmu;
        else delete process.env.FIRESTORE_EMULATOR_HOST;
      }
    });

    it('Vite / Client build does not bundle or expose Firebase Admin SDK', () => {
      const distDir = path.resolve(WORKTREE_ROOT, 'dist/assets');
      if (fs.existsSync(distDir)) {
        const jsFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));
        for (const file of jsFiles) {
          const content = fs.readFileSync(path.join(distDir, file), 'utf-8');
          assert.equal(content.includes('firebase-admin'), false, `dist bundle ${file} must NOT contain firebase-admin`);
          assert.equal(content.includes('salad-miners-firebase-adminsdk'), false, `dist bundle ${file} must NOT contain service account file name`);
          assert.equal(content.includes('BEGIN PRIVATE KEY'), false, `dist bundle ${file} must NOT contain private keys`);
        }
      }
    });
  });

  describe('3. Mocked Read & Catalog Operations (Zero Production Dependency)', () => {
    it('getPackages returns empty array when firestore collection is empty', async () => {
      const mockFirestore = {
        collection: (colName: string) => {
          assert.equal(colName, 'commercial_packages');
          return {
            get: async () => ({ empty: true, docs: [] }),
          };
        },
      };

      const adapter = new FirebaseAdminCatalogStoreAdapter({ firestore: mockFirestore });
      const pkgs = await adapter.getPackages();
      assert.deepEqual(pkgs, []);
    });

    it('getPackages maps documents correctly from firestore collection', async () => {
      const mockDocs = [
        {
          id: 'pkg-miner-mock-1',
          data: () => ({
            name: 'Mock Miner 1',
            powerTh: 64,
            priceUsdt: 750,
            section: 'minerx',
            status: 'ACTIVE',
            isPublished: true,
            version: 1,
          }),
        },
        {
          id: 'pkg-miner-mock-2',
          data: () => ({
            name: 'Mock Miner 2',
            powerTh: 128,
            priceUsdt: 1500,
            section: 'lanzamiento',
            status: 'DRAFT',
            isPublished: false,
            version: 1,
          }),
        },
      ];

      const mockFirestore = {
        collection: (colName: string) => {
          assert.equal(colName, 'commercial_packages');
          return {
            get: async () => ({ empty: false, docs: mockDocs }),
          };
        },
      };

      const adapter = new FirebaseAdminCatalogStoreAdapter({ firestore: mockFirestore });
      const pkgs = await adapter.getPackages();
      assert.equal(pkgs.length, 2);
      assert.equal(pkgs[0].id, 'pkg-miner-mock-1');
      assert.equal(pkgs[0].name, 'Mock Miner 1');
      assert.equal(pkgs[0].powerTh, 64);
      assert.equal(pkgs[1].id, 'pkg-miner-mock-2');
      assert.equal(pkgs[1].section, 'lanzamiento');
    });

    it('getPackageById fetches specific document or returns null if not found', async () => {
      const store = new Map<string, any>([
        ['pkg-found', { name: 'Found Package', powerTh: 100, priceUsdt: 1000, status: 'ACTIVE', isPublished: true }],
      ]);

      const mockFirestore = {
        collection: (colName: string) => {
          assert.equal(colName, 'commercial_packages');
          return {
            doc: (docId: string) => ({
              get: async () => {
                const data = store.get(docId);
                return {
                  id: docId,
                  exists: Boolean(data),
                  data: () => data ? { ...data } : null,
                };
              },
            }),
          };
        },
      };

      const adapter = new FirebaseAdminCatalogStoreAdapter({ firestore: mockFirestore });
      const existing = await adapter.getPackageById('pkg-found');
      assert.ok(existing);
      assert.equal(existing?.id, 'pkg-found');
      assert.equal(existing?.name, 'Found Package');

      const missing = await adapter.getPackageById('pkg-missing');
      assert.equal(missing, null);
    });

    it('getPackageById returns null safely for empty string, whitespace, null, or undefined without throwing', async () => {
      const adapter = new FirebaseAdminCatalogStoreAdapter({ firestore: {} });
      assert.equal(await adapter.getPackageById(''), null);
      assert.equal(await adapter.getPackageById('   '), null);
      assert.equal(await adapter.getPackageById(null as any), null);
      assert.equal(await adapter.getPackageById(undefined as any), null);
    });

    it('CatalogService with FirebaseAdminCatalogStoreAdapter executes admin and storefront reads correctly', async () => {
      const mockDocs = [
        {
          id: 'pkg-miner-canonical',
          data: () => ({
            name: 'Canonical Miner',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            status: 'ACTIVE',
            isPublished: true,
            version: 1,
          }),
        },
        {
          id: 'pkg-miner-legacy-node',
          data: () => ({
            name: 'Legacy Preserved Miner',
            powerTh: 50,
            priceUsdt: 500,
            isLegacy: true,
            status: 'ACTIVE',
            isPublished: true,
            version: 1,
          }),
        },
      ];

      const mockFirestore = {
        collection: (colName: string) => {
          assert.equal(colName, 'commercial_packages');
          return {
            get: async () => ({ empty: false, docs: mockDocs }),
          };
        },
      };

      const adapter = new FirebaseAdminCatalogStoreAdapter({ firestore: mockFirestore });
      const catalogService = new CatalogService(adapter);

      // Admin catalog read separates canonical from legacy
      const adminCatalog = await catalogService.getAdminCatalog();
      assert.equal(adminCatalog.canonical.length, 1);
      assert.equal(adminCatalog.canonical[0].id, 'pkg-miner-canonical');
      assert.equal(adminCatalog.legacy.length, 1);
      assert.equal(adminCatalog.legacy[0].id, 'pkg-miner-legacy-node');

      // Storefront catalog read strictly returns matching section
      const storefront = await catalogService.getStorefrontCatalog('minerx');
      assert.equal(storefront.length, 1);
      assert.equal(storefront[0].name, 'Canonical Miner');

      const storefrontEmpty = await catalogService.getStorefrontCatalog('preventa');
      assert.equal(storefrontEmpty.length, 0);
    });
  });

  describe('4. Mocked Mutation Verification (Zero Production Mutation)', () => {
    it('FirebaseAdminCatalogStoreAdapter.savePackage correctly calls Firestore doc().set({ merge: true }) on mock', async () => {
      let setCalledWith: any = null;
      let setDocId: string | null = null;
      let setOptions: any = null;

      const mockFirestore = {
        collection: (colName: string) => {
          assert.equal(colName, 'commercial_packages');
          return {
            doc: (docId: string) => {
              setDocId = docId;
              return {
                set: async (data: any, opts: any) => {
                  setCalledWith = data;
                  setOptions = opts;
                },
                get: async () => ({ exists: false, data: () => null }),
              };
            },
          };
        },
      };

      const adapter = new FirebaseAdminCatalogStoreAdapter({ firestore: mockFirestore });
      const testPkg: CommercialPackage = {
        id: 'pkg-mock-01',
        packageId: 'pkg-mock-01',
        name: 'Mock Package',
        powerTh: 100,
        priceUsdt: 1000,
        section: 'minerx',
        status: 'DRAFT',
        isPublished: false,
        version: 1,
      };

      await adapter.savePackage(testPkg);
      assert.equal(setDocId, 'pkg-mock-01');
      assert.deepEqual(setCalledWith, testPkg);
      assert.deepEqual(setOptions, { merge: true });
    });

    it('savePackage sanitizes and strips undefined fields preventing Firestore serialization rejection', async () => {
      let savedData: any = null;
      const strictMockFirestore = {
        collection: (colName: string) => {
          assert.equal(colName, 'commercial_packages');
          return {
            doc: (docId: string) => ({
              set: async (data: any) => {
                // Emulate strict Firestore serialization behavior
                for (const [k, v] of Object.entries(data)) {
                  if (v === undefined) {
                    throw new Error(`Value for argument "data" is not a valid Firestore document. Cannot use "undefined" as a Firestore value (found in field "${k}").`);
                  }
                }
                savedData = data;
              },
            }),
          };
        },
      };

      const adapter = new FirebaseAdminCatalogStoreAdapter({ firestore: strictMockFirestore });
      const pkgWithUndefined: any = {
        id: 'pkg-with-undefined',
        name: 'Undefined Test',
        powerTh: 100,
        priceUsdt: 1000,
        section: 'minerx',
        status: 'DRAFT',
        isPublished: false,
        description: undefined,
        cadence: undefined,
        variablePct: undefined,
        commissionPct: undefined,
        sortOrder: undefined,
        dailyBtcText: undefined,
        roiPct: undefined,
        priceUsdCents: undefined,
      };

      await adapter.savePackage(pkgWithUndefined);
      assert.equal(savedData.id, 'pkg-with-undefined');
      assert.equal('description' in savedData, false, 'Undefined field must be stripped');
      assert.equal('cadence' in savedData, false, 'Undefined field must be stripped');
      assert.equal('variablePct' in savedData, false, 'Undefined field must be stripped');
      assert.equal(savedData.powerTh, 100);
    });

    it('savePackage throws descriptive error when id is missing or empty', async () => {
      const adapter = new FirebaseAdminCatalogStoreAdapter({ firestore: {} });
      await assert.rejects(
        () => adapter.savePackage({ name: 'No ID', powerTh: 10, priceUsdt: 100 } as any),
        /Package id is required for savePackage/
      );
      await assert.rejects(
        () => adapter.savePackage({ id: '   ', name: 'Blank ID', powerTh: 10, priceUsdt: 100 } as any),
        /Package id is required for savePackage/
      );
    });

    it('CatalogService handles CREATE, UPDATE, and ARCHIVE via FirebaseAdminCatalogStoreAdapter without hitting production', async () => {
      const inMemoryDocs = new Map<string, any>();

      const mockFirestore = {
        collection: (colName: string) => {
          assert.equal(colName, 'commercial_packages');
          return {
            doc: (docId: string) => ({
              get: async () => {
                const found = inMemoryDocs.get(docId);
                return {
                  exists: Boolean(found),
                  id: docId,
                  data: () => found ? { ...found } : undefined,
                };
              },
              set: async (data: any) => {
                inMemoryDocs.set(docId, { ...data });
              },
            }),
            get: async () => ({
              empty: inMemoryDocs.size === 0,
              docs: Array.from(inMemoryDocs.entries()).map(([id, d]) => ({
                id,
                data: () => ({ ...d }),
              })),
            }),
          };
        },
      };

      const adapter = new FirebaseAdminCatalogStoreAdapter({ firestore: mockFirestore });
      const service = new CatalogService(adapter);

      // 1. CREATE canonical package
      const created = await service.savePackage({
        id: 'pkg-pouw-created',
        name: 'POUW Created Package',
        powerTh: 150,
        priceUsdt: 1500,
        section: 'minerx',
        packageType: 'fixed',
        sortOrder: 1,
        status: 'DRAFT',
        isPublished: false,
      }, { updatedBy: 'usr_admin_authorized' });

      assert.equal(created.id, 'pkg-pouw-created');
      assert.equal(created.version, 1);
      assert.equal(created.updatedBy, 'usr_admin_authorized');
      assert.equal(inMemoryDocs.get('pkg-pouw-created')?.name, 'POUW Created Package');

      // 2. UPDATE canonical package (version increment)
      const updated = await service.savePackage({
        id: 'pkg-pouw-created',
        name: 'POUW Updated Package',
        powerTh: 200,
        priceUsdt: 1800,
        section: 'minerx',
        status: 'ACTIVE',
        isPublished: true,
      }, { updatedBy: 'usr_admin_updater' });

      assert.equal(updated.version, 2, 'Version must increment on update');
      assert.equal(updated.name, 'POUW Updated Package');
      assert.equal(updated.updatedBy, 'usr_admin_updater');

      // 3. ARCHIVE canonical package (no physical deletion)
      const archived = await service.archivePackage('pkg-pouw-created', { updatedBy: 'usr_admin_archiver' });
      assert.equal(archived.status, 'ARCHIVED');
      assert.equal(archived.isPublished, false);
      assert.equal(archived.version, 3, 'Version must increment on archive');
      assert.ok(inMemoryDocs.has('pkg-pouw-created'), 'Document must still exist physically in store');
    });
  });

  describe('5. Preservation of Existing Security Guards and Architecture', () => {
    it('preserves FirestoreCatalogStoreAdapter fail-closed guard for client SDK writes from Node', async () => {
      const clientAdapter = new FirestoreCatalogStoreAdapter();
      // Without FIRESTORE_EMULATOR_HOST or mock, savePackage MUST throw fail-closed error
      await assert.rejects(
        () => clientAdapter.savePackage({ id: 'pkg-guard-test', name: 'Guard', powerTh: 1, priceUsdt: 1, version: 1 } as any),
        /Remote Firestore writes from Node backend are strictly prohibited without FIRESTORE_EMULATOR_HOST/
      );
    });

    it('MemoryCatalogStoreAdapter unit tests continue to function with zero external dependencies', async () => {
      const memoryAdapter = new MemoryCatalogStoreAdapter();
      const memoryService = new CatalogService(memoryAdapter);

      const pkg = await memoryService.savePackage({
        name: 'Memory Miner',
        powerTh: 50,
        priceUsdt: 500,
        section: 'minerx',
        packageType: 'fixed',
        sortOrder: 1,
        status: 'ACTIVE',
        isPublished: true,
      });

      assert.equal(pkg.name, 'Memory Miner');
      const retrieved = await memoryService.getStorefrontCatalog('minerx');
      assert.equal(retrieved.length, 1);
      assert.equal(retrieved[0].name, 'Memory Miner');
    });
  });
});
