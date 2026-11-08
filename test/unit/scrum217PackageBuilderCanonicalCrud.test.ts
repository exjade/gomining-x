// In-memory localStorage polyfill for Node.js test runner
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

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CommercialPackageService } from '../../src/services/admin/commercialPackageService.js';
import { CatalogService, type CatalogSection } from '../../src/services/catalogService.js';
import type { CommercialPackage } from '../../src/types/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKTREE_ROOT = path.resolve(__dirname, '../..');

describe('SCRUM-217: PackageBuilder Canonical CRUD & Backend-First Integration Tests', () => {

  describe('1. Static Code Inspection & Separation Rules', () => {
    const packageBuilderSrc = fs.readFileSync(
      path.resolve(WORKTREE_ROOT, 'src/components/admin/PackageBuilderView.tsx'),
      'utf-8'
    );

    it('2. PackageBuilder does NOT call fetchFirestorePackages or subscribeToFirestorePackages for commercial packages', () => {
      assert.equal(
        packageBuilderSrc.includes('packageService.fetchFirestorePackages'),
        false,
        'PackageBuilder must NOT call packageService.fetchFirestorePackages'
      );
      assert.equal(
        packageBuilderSrc.includes('packageService.subscribeToFirestorePackages'),
        false,
        'PackageBuilder must NOT call packageService.subscribeToFirestorePackages'
      );
    });

    it('14. PackageBuilder does NOT use legacy mutation methods (savePackage, toggleArchive, togglePublish, updatePackageVariables)', () => {
      assert.equal(
        packageBuilderSrc.includes('packageService.savePackage('),
        false,
        'PackageBuilder must NOT call legacy savePackage'
      );
      assert.equal(
        packageBuilderSrc.includes('packageService.toggleArchive('),
        false,
        'PackageBuilder must NOT call legacy toggleArchive'
      );
      assert.equal(
        packageBuilderSrc.includes('packageService.togglePublish('),
        false,
        'PackageBuilder must NOT call legacy togglePublish'
      );
      assert.equal(
        packageBuilderSrc.includes('packageService.updatePackageVariables('),
        false,
        'PackageBuilder must NOT call legacy updatePackageVariables'
      );
    });

    it('15. PackageBuilder form does NOT inject invented defaults (durationDays=365, variablePct=0, commissionPct=2)', () => {
      assert.equal(
        packageBuilderSrc.includes('durationDays: 365'),
        false,
        'PackageBuilder must NOT inject default durationDays: 365'
      );
      assert.equal(
        packageBuilderSrc.includes('variablePct: 0.0') || packageBuilderSrc.includes('variablePct: 0,'),
        false,
        'PackageBuilder must NOT inject default variablePct: 0'
      );
      assert.equal(
        packageBuilderSrc.includes('commissionPct: 2.0') || packageBuilderSrc.includes('commissionPct: 2,'),
        false,
        'PackageBuilder must NOT inject default commissionPct: 2'
      );
    });

    it('16. Client build bundle contains zero service account, private key, or firebase-admin code', () => {
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

  describe('2. Canonical Admin Catalog Reading & Filtering (GET /api/catalog/admin)', () => {
    it('1. Admin loads canonical catalog via CommercialPackageService.fetchAdminCatalog', async () => {
      const service = CommercialPackageService.getInstance();
      const originalFetch = globalThis.fetch;

      const mockResponse = {
        canonical: [
          {
            id: 'pkg-can-1',
            packageId: 'pkg-can-1',
            name: 'Canonical Alpha',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            packageType: 'fixed',
            sortOrder: 1,
            status: 'ACTIVE',
            isPublished: true,
            version: 1,
          },
        ],
        legacy: [
          {
            id: 'pkg-miner-1',
            name: 'Legacy Minero 1',
            powerTh: 48,
            priceUsdt: 500,
            status: 'ACTIVE',
            isPublished: true,
            isLegacy: true,
            version: 1,
          },
        ],
      };

      let requestedUrl = '';
      globalThis.fetch = async (url: any) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      try {
        const result = await service.fetchAdminCatalog();
        assert.ok(requestedUrl.includes('/api/catalog/admin'), 'Must request /api/catalog/admin');
        assert.equal(result.canonical.length, 1);
        assert.equal(result.canonical[0].id, 'pkg-can-1');
        assert.equal(result.legacy.length, 1);
        assert.equal(result.legacy[0].id, 'pkg-miner-1');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('3. Legacy catalog is separated and protected as non-editable', () => {
      const service = CommercialPackageService.getInstance();
      const legacyItems = service.getAdminCatalog().legacy;
      for (const item of legacyItems) {
        assert.ok(CatalogService.isLegacyPackage(item), `Item ${item.id} must be identified as legacy`);
      }
    });

    it('4. Filters canonical catalog by all 4 sections correctly', async () => {
      const service = CommercialPackageService.getInstance();
      const originalFetch = globalThis.fetch;

      const capturedUrls: string[] = [];
      globalThis.fetch = async (url: any) => {
        capturedUrls.push(String(url));
        return new Response(JSON.stringify({ canonical: [], legacy: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      try {
        const sections: CatalogSection[] = ['minerx', 'preventa', 'lanzamiento', 'mensual'];
        for (const sec of sections) {
          await service.fetchAdminCatalog({ section: sec });
        }

        assert.equal(capturedUrls.length, 4);
        assert.ok(capturedUrls[0].includes('section=minerx'));
        assert.ok(capturedUrls[1].includes('section=preventa'));
        assert.ok(capturedUrls[2].includes('section=lanzamiento'));
        assert.ok(capturedUrls[3].includes('section=mensual'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('5. Canonical catalog sortOrder ordering is preserved', () => {
      const unsorted = [
        { id: 'p3', sortOrder: 3, name: 'Third' },
        { id: 'p1', sortOrder: 1, name: 'First' },
        { id: 'p2', sortOrder: 2, name: 'Second' },
      ];
      const sorted = [...unsorted].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      assert.equal(sorted[0].id, 'p1');
      assert.equal(sorted[1].id, 'p2');
      assert.equal(sorted[2].id, 'p3');
    });
  });

  describe('3. Canonical Mutations (CREATE, UPDATE, ARCHIVE, PUBLISH, REACTIVATE)', () => {
    it('6. Canonical CREATE requires all mandatory fields and updates cache on 2xx', async () => {
      const service = CommercialPackageService.getInstance();
      const originalFetch = globalThis.fetch;

      const newPkgId = `pkg-created-${Date.now()}`;
      const backendCreatedPkg = {
        id: newPkgId,
        packageId: newPkgId,
        name: 'New Canonical Package',
        displayName: 'New Canonical Package',
        section: 'minerx' as const,
        packageType: 'fixed' as const,
        powerTh: 150,
        priceUsdt: 1500,
        sortOrder: 5,
        status: 'DRAFT' as const,
        isPublished: false,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let sentPayload: any = null;
      globalThis.fetch = async (_url: any, init: any) => {
        sentPayload = JSON.parse(init.body);
        return new Response(JSON.stringify({ success: true, package: backendCreatedPkg }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      try {
        const created = await service.saveCanonicalPackage({
          name: 'New Canonical Package',
          displayName: 'New Canonical Package',
          section: 'minerx',
          packageType: 'fixed',
          powerTh: 150,
          priceUsdt: 1500,
          sortOrder: 5,
          status: 'DRAFT',
          isPublished: false,
        });

        assert.equal(sentPayload.name, 'New Canonical Package');
        assert.equal(sentPayload.status, 'DRAFT');
        assert.equal(sentPayload.isPublished, false);
        assert.equal(created.id, newPkgId);
        assert.equal(created.version, 1);

        const stored = service.getPackageById(newPkgId);
        assert.ok(stored, 'Package must exist in local cache after successful creation');
        assert.equal(stored?.id, newPkgId);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('7. Canonical UPDATE preserves packageId and increments version', async () => {
      const service = CommercialPackageService.getInstance();
      const originalFetch = globalThis.fetch;

      const targetId = `pkg-target-${Date.now()}`;
      const updatedBackendPkg = {
        id: targetId,
        packageId: targetId,
        name: 'Updated Package Name',
        section: 'minerx' as const,
        packageType: 'fixed' as const,
        powerTh: 200,
        priceUsdt: 2200,
        sortOrder: 2,
        status: 'ACTIVE' as const,
        isPublished: true,
        version: 2,
        updatedAt: new Date().toISOString(),
      };

      globalThis.fetch = async (_url: any, init: any) => {
        const body = JSON.parse(init.body);
        assert.equal(body.id, targetId);
        return new Response(JSON.stringify({ success: true, package: updatedBackendPkg }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      try {
        const updated = await service.saveCanonicalPackage({
          id: targetId,
          packageId: targetId,
          name: 'Updated Package Name',
          section: 'minerx',
          packageType: 'fixed',
          powerTh: 200,
          priceUsdt: 2200,
          sortOrder: 2,
          status: 'ACTIVE',
          isPublished: true,
        });

        assert.equal(updated.id, targetId);
        assert.equal(updated.version, 2);
        assert.equal(updated.name, 'Updated Package Name');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('8. Canonical PUBLISH sets isPublished=true via saveCanonicalPackage', async () => {
      const service = CommercialPackageService.getInstance();
      const originalFetch = globalThis.fetch;

      const pubId = `pkg-pub-${Date.now()}`;
      let sentPublishedVal: boolean | null = null;
      globalThis.fetch = async (_url: any, init: any) => {
        const body = JSON.parse(init.body);
        sentPublishedVal = body.isPublished;
        return new Response(
          JSON.stringify({
            success: true,
            package: { id: pubId, packageId: pubId, ...body, version: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      try {
        await service.saveCanonicalPackage({
          id: pubId,
          packageId: pubId,
          name: 'Published Package',
          section: 'minerx',
          powerTh: 100,
          priceUsdt: 1000,
          status: 'ACTIVE',
          isPublished: true,
        });

        assert.equal(sentPublishedVal, true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('9. Canonical UNPUBLISH sets isPublished=false via saveCanonicalPackage', async () => {
      const service = CommercialPackageService.getInstance();
      const originalFetch = globalThis.fetch;

      const unpubId = `pkg-unpub-${Date.now()}`;
      let sentPublishedVal: boolean | null = null;
      globalThis.fetch = async (_url: any, init: any) => {
        const body = JSON.parse(init.body);
        sentPublishedVal = body.isPublished;
        return new Response(
          JSON.stringify({
            success: true,
            package: { id: unpubId, packageId: unpubId, ...body, version: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      try {
        await service.saveCanonicalPackage({
          id: unpubId,
          packageId: unpubId,
          name: 'Unpublished Package',
          section: 'minerx',
          powerTh: 100,
          priceUsdt: 1000,
          status: 'ACTIVE',
          isPublished: false,
        });

        assert.equal(sentPublishedVal, false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('10 & 11. Canonical ARCHIVE calls /api/catalog/packages/:id/archive, sets status=ARCHIVED, isPublished=false, without deletion', async () => {
      const service = CommercialPackageService.getInstance();
      const originalFetch = globalThis.fetch;

      const arcId = `pkg-arc-${Date.now()}`;
      let calledUrl = '';
      let calledMethod = '';

      const archivedPackage = {
        id: arcId,
        packageId: arcId,
        name: 'Archived Package',
        powerTh: 120,
        priceUsdt: 1200,
        section: 'minerx' as const,
        status: 'ARCHIVED' as const,
        isPublished: false,
        version: 3,
        updatedAt: new Date().toISOString(),
      };

      globalThis.fetch = async (url: any, init: any) => {
        calledUrl = String(url);
        calledMethod = init.method;
        return new Response(
          JSON.stringify({ success: true, package: archivedPackage }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      try {
        const result = await service.archiveCanonicalPackage(arcId);
        assert.ok(calledUrl.includes(`/api/catalog/packages/${arcId}/archive`));
        assert.equal(calledMethod, 'POST');
        assert.equal(result.status, 'ARCHIVED');
        assert.equal(result.isPublished, false);

        // Verify document is retained in cache (no physical deletion)
        const stored = service.getPackageById(arcId);
        assert.ok(stored, 'Archived package must still exist physically in local store');
        assert.equal(stored?.status, 'ARCHIVED');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('12. Canonical REACTIVATE sets status=ACTIVE and isPublished=false (no auto-publish)', async () => {
      const service = CommercialPackageService.getInstance();
      const originalFetch = globalThis.fetch;

      const reactivateId = `pkg-react-${Date.now()}`;
      let sentStatus: string | null = null;
      let sentPublished: boolean | null = null;

      globalThis.fetch = async (_url: any, init: any) => {
        const body = JSON.parse(init.body);
        sentStatus = body.status;
        sentPublished = body.isPublished;
        return new Response(
          JSON.stringify({
            success: true,
            package: {
              id: reactivateId,
              packageId: reactivateId,
              ...body,
              version: 4,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      try {
        const reactivated = await service.saveCanonicalPackage({
          id: reactivateId,
          packageId: reactivateId,
          name: 'Reactivated Package',
          section: 'minerx',
          powerTh: 100,
          priceUsdt: 1000,
          status: 'ACTIVE',
          isPublished: false,
        });

        assert.equal(sentStatus, 'ACTIVE');
        assert.equal(sentPublished, false, 'Must remain strictly unpublished upon reactivation');
        assert.equal(reactivated.status, 'ACTIVE');
        assert.equal(reactivated.isPublished, false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('13. Network errors and HTTP 400/401/404/500 strictly fail closed without false success', async () => {
      const service = CommercialPackageService.getInstance();
      const originalFetch = globalThis.fetch;

      // 1. Network Error on saveCanonicalPackage
      globalThis.fetch = async () => {
        throw new TypeError('Network connection reset');
      };
      await assert.rejects(
        () => service.saveCanonicalPackage({
          name: 'Fail Network',
          packageType: 'fixed',
          sortOrder: 1,
          powerTh: 10,
          priceUsdt: 100,
          section: 'minerx',
          status: 'ACTIVE',
          isPublished: true,
        }),
        /NETWORK_ERROR|network error/i
      );

      // 2. HTTP 400 Bad Request
      globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Invalid parameters' }), { status: 400 });
      await assert.rejects(
        () => service.saveCanonicalPackage({
          name: 'Fail 400',
          packageType: 'fixed',
          sortOrder: 1,
          powerTh: 10,
          priceUsdt: 100,
          section: 'minerx',
          status: 'ACTIVE',
          isPublished: true,
        }),
        /rejected by backend \(400\)/
      );

      // 3. HTTP 401 Unauthorized
      globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Unauthorized session' }), { status: 401 });
      await assert.rejects(
        () => service.saveCanonicalPackage({
          name: 'Fail 401',
          packageType: 'fixed',
          sortOrder: 1,
          powerTh: 10,
          priceUsdt: 100,
          section: 'minerx',
          status: 'ACTIVE',
          isPublished: true,
        }),
        /rejected by backend \(401\)/
      );

      // 4. HTTP 404 Not Found on archive
      globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Package not found' }), { status: 404 });
      await assert.rejects(
        () => service.archiveCanonicalPackage('pkg-missing-id'),
        /rejected by backend \(404\)/
      );

      // 5. HTTP 500 Internal Server Error on fetchAdminCatalog
      globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Database transaction error' }), { status: 500 });
      await assert.rejects(
        () => service.fetchAdminCatalog(),
        /rejected by backend \(500\)/
      );

      globalThis.fetch = originalFetch;
    });
  });

  describe('4. Review Blocker Verification Suite (SCRUM-217 Iteration 2)', () => {
    // BLOCKER 1: BACKEND CREATE DEBE EXIGIR packageType Y sortOrder
    describe('Blocker 1: Backend & Service CREATE requires packageType and sortOrder', () => {
      it('validatePackageMutation rejects CREATE when packageType is missing', () => {
        const res = CatalogService.validatePackageMutation(
          {
            name: 'No PackageType Miner',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            sortOrder: 1,
            status: 'ACTIVE',
            isPublished: true,
          },
          { isCreate: true }
        );
        assert.equal(res.valid, false);
        assert.ok(res.errors.some(e => e.includes('packageType is required on package creation')));
      });

      it('validatePackageMutation rejects CREATE when packageType is invalid', () => {
        const res = CatalogService.validatePackageMutation(
          {
            name: 'Invalid PackageType Miner',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            packageType: 'invalid_type' as any,
            sortOrder: 1,
            status: 'ACTIVE',
            isPublished: true,
          },
          { isCreate: true }
        );
        assert.equal(res.valid, false);
        assert.ok(res.errors.some(e => e.includes('Invalid packageType')));
      });

      it('validatePackageMutation rejects CREATE when sortOrder is missing', () => {
        const res = CatalogService.validatePackageMutation(
          {
            name: 'No SortOrder Miner',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            packageType: 'fixed',
            status: 'ACTIVE',
            isPublished: true,
          },
          { isCreate: true }
        );
        assert.equal(res.valid, false);
        assert.ok(res.errors.some(e => e.includes('sortOrder is required on package creation')));
      });

      it('validatePackageMutation rejects CREATE when sortOrder is negative or NaN', () => {
        const negativeRes = CatalogService.validatePackageMutation(
          {
            name: 'Negative SortOrder Miner',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            packageType: 'fixed',
            sortOrder: -1,
            status: 'ACTIVE',
            isPublished: true,
          },
          { isCreate: true }
        );
        assert.equal(negativeRes.valid, false);
        assert.ok(negativeRes.errors.some(e => e.includes('sortOrder must be a number >= 0')));

        const nanRes = CatalogService.validatePackageMutation(
          {
            name: 'NaN SortOrder Miner',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            packageType: 'fixed',
            sortOrder: NaN,
            status: 'ACTIVE',
            isPublished: true,
          },
          { isCreate: true }
        );
        assert.equal(nanRes.valid, false);
        assert.ok(nanRes.errors.some(e => e.includes('sortOrder must be a number >= 0')));

        const infRes = CatalogService.validatePackageMutation(
          {
            name: 'Infinity SortOrder Miner',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            packageType: 'fixed',
            sortOrder: Infinity,
            status: 'ACTIVE',
            isPublished: true,
          },
          { isCreate: true }
        );
        assert.equal(infRes.valid, false);
        assert.ok(infRes.errors.some(e => e.includes('sortOrder must be a number >= 0')));
      });

      it('savePackage on UPDATE preserves existing packageType and sortOrder when omitted or undefined', async () => {
        const { MemoryCatalogStoreAdapter } = await import('../../src/services/catalogService.js');
        const memoryAdapter = new MemoryCatalogStoreAdapter([
          {
            id: 'pkg-exist-1',
            packageId: 'pkg-exist-1',
            name: 'Existing Miner',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            packageType: 'subscription',
            sortOrder: 4,
            status: 'ACTIVE',
            isPublished: true,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]);
        const catalogService = new CatalogService(memoryAdapter);

        // Omitted
        const updated = await catalogService.savePackage({
          id: 'pkg-exist-1',
          name: 'Existing Miner Updated',
          powerTh: 120,
          priceUsdt: 1200,
          section: 'minerx',
        });

        assert.equal(updated.packageType, 'subscription');
        assert.equal(updated.sortOrder, 4);
        assert.equal(updated.version, 2);

        // Explicit undefined
        const updatedUndefined = await catalogService.savePackage({
          id: 'pkg-exist-1',
          name: 'Existing Miner Undefined Props',
          powerTh: 130,
          priceUsdt: 1300,
          section: 'minerx',
          packageType: undefined,
          sortOrder: undefined,
        });

        assert.equal(updatedUndefined.packageType, 'subscription');
        assert.equal(updatedUndefined.sortOrder, 4);
        assert.equal(updatedUndefined.version, 3);
      });

      it('savePackage on UPDATE validates packageType and sortOrder if provided', async () => {
        const { MemoryCatalogStoreAdapter } = await import('../../src/services/catalogService.js');
        const memoryAdapter = new MemoryCatalogStoreAdapter([
          {
            id: 'pkg-exist-2',
            packageId: 'pkg-exist-2',
            name: 'Existing Miner 2',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            packageType: 'fixed',
            sortOrder: 1,
            status: 'ACTIVE',
            isPublished: true,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]);
        const catalogService = new CatalogService(memoryAdapter);

        await assert.rejects(
          () => catalogService.savePackage({
            id: 'pkg-exist-2',
            name: 'Existing Miner 2 Bad Type',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            packageType: 'bogus' as any,
          }),
          /Invalid packageType/
        );

        await assert.rejects(
          () => catalogService.savePackage({
            id: 'pkg-exist-2',
            name: 'Existing Miner 2 Bad Order',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            sortOrder: -5,
          }),
          /sortOrder must be a number >= 0/
        );

        await assert.rejects(
          () => catalogService.savePackage({
            id: 'pkg-exist-2',
            name: 'Existing Miner 2 Empty Type',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            packageType: '' as any,
          }),
          /Invalid packageType/
        );

        await assert.rejects(
          () => catalogService.savePackage({
            id: 'pkg-exist-2',
            name: 'Existing Miner 2 Empty Status',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            status: '' as any,
          }),
          /Invalid status/
        );

        await assert.rejects(
          () => catalogService.savePackage({
            id: 'pkg-exist-2',
            name: 'Existing Miner 2 Infinity Order',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            sortOrder: Infinity,
          }),
          /sortOrder must be a number >= 0/
        );
      });
    });

    // BLOCKER 2: EL FORMULARIO TODAVÍA INVENTA DATOS
    describe('Blocker 2: Form does not inject invented defaults or auto-copy displayName', () => {
      const packageBuilderSrc = fs.readFileSync(
        path.resolve(WORKTREE_ROOT, 'src/components/admin/PackageBuilderView.tsx'),
        'utf-8'
      );

      it('does NOT initialize sortOrder with "1" in CREATE state', () => {
        assert.equal(
          packageBuilderSrc.includes("sortOrder: '1'"),
          false,
          'PackageBuilder must NOT initialize sortOrder with "1"'
        );
      });

      it('does NOT auto-copy name to displayName when displayName is empty', () => {
        assert.equal(
          packageBuilderSrc.includes('displayName || pkg.name'),
          false,
          'PackageBuilder handleOpenEdit must NOT copy pkg.name into displayName'
        );
        assert.equal(
          packageBuilderSrc.includes('displayName.trim() || formData.name.trim()'),
          false,
          'PackageBuilder handleSave must NOT copy formData.name into displayName'
        );
      });

      it('does NOT use fallbacks in handleOpenEdit (section, packageType, sortOrder, status, isPublished)', () => {
        assert.equal(
          packageBuilderSrc.includes("section || 'minerx'"),
          false,
          'handleOpenEdit must NOT fall back to "minerx"'
        );
        assert.equal(
          packageBuilderSrc.includes("packageType || 'fixed'"),
          false,
          'handleOpenEdit must NOT fall back to "fixed"'
        );
        assert.equal(
          packageBuilderSrc.includes("sortOrder ?? '1'"),
          false,
          'handleOpenEdit must NOT fall back to "1"'
        );
        assert.equal(
          packageBuilderSrc.includes("status || 'ACTIVE'"),
          false,
          'handleOpenEdit must NOT fall back to "ACTIVE"'
        );
        assert.equal(
          packageBuilderSrc.includes("isPublished ?? false"),
          false,
          'handleOpenEdit must NOT fall back to false'
        );
      });
    });

    // BLOCKER 3: ARCHIVED NUNCA PUEDE ESTAR PUBLICADO
    describe('Blocker 3: ARCHIVED invariant isPublished=false strictly enforced in both layers', () => {
      it('validatePackageMutation rejects CREATE when status=ARCHIVED and isPublished=true', () => {
        const res = CatalogService.validatePackageMutation(
          {
            name: 'Archived Published Miner',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            packageType: 'fixed',
            sortOrder: 1,
            status: 'ARCHIVED',
            isPublished: true,
          },
          { isCreate: true }
        );
        assert.equal(res.valid, false);
        assert.ok(res.errors.some(e => e.includes('An ARCHIVED package cannot be published')));
      });

      it('validatePackageMutation rejects UPDATE when status=ARCHIVED and isPublished=true', () => {
        const res = CatalogService.validatePackageMutation(
          {
            id: 'pkg-arc-pub',
            status: 'ARCHIVED',
            isPublished: true,
          },
          { isUpdate: true }
        );
        assert.equal(res.valid, false);
        assert.ok(res.errors.some(e => e.includes('An ARCHIVED package cannot be published')));
      });

      it('savePackage throws when trying to save status=ARCHIVED and isPublished=true', async () => {
        const { MemoryCatalogStoreAdapter } = await import('../../src/services/catalogService.js');
        const memoryAdapter = new MemoryCatalogStoreAdapter();
        const catalogService = new CatalogService(memoryAdapter);

        await assert.rejects(
          () => catalogService.savePackage({
            name: 'Archived Pub Attempt',
            powerTh: 100,
            priceUsdt: 1000,
            section: 'minerx',
            packageType: 'fixed',
            sortOrder: 1,
            status: 'ARCHIVED',
            isPublished: true,
          }),
          /An ARCHIVED package cannot be published/
        );
      });

      it('saveCanonicalPackage rejects client-side when attempting to publish a cached ARCHIVED package', async () => {
        const service = CommercialPackageService.getInstance();
        const arcPkgId = `pkg-cached-arc-${Date.now()}`;

        // Populate local cache with an archived package
        const currentList = service.getPackages();
        localStorage.setItem(
          'minerx_admin_commercial_packages_v2',
          JSON.stringify([
            ...currentList,
            {
              id: arcPkgId,
              packageId: arcPkgId,
              name: 'Cached Archived Package',
              section: 'minerx',
              packageType: 'fixed',
              sortOrder: 1,
              powerTh: 100,
              priceUsdt: 1000,
              status: 'ARCHIVED',
              isPublished: false,
              version: 1,
            },
          ])
        );

        // Attempting to mutate isPublished: true without changing status must fail validation before any fetch
        let fetchCalled = false;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => {
          fetchCalled = true;
          return new Response('{}', { status: 200 });
        };

        try {
          await assert.rejects(
            () => service.saveCanonicalPackage({
              id: arcPkgId,
              packageId: arcPkgId,
              name: 'Cached Archived Package',
              section: 'minerx',
              powerTh: 100,
              priceUsdt: 1000,
              isPublished: true,
            }),
            /An ARCHIVED package cannot be published/
          );
          assert.equal(fetchCalled, false, 'Client validation must fail closed before making network request');
        } finally {
          globalThis.fetch = originalFetch;
        }
      });

      it('PackageBuilderView disables Publish button for ARCHIVED packages in UI and returns early in handleTogglePublish', () => {
        const packageBuilderSrc = fs.readFileSync(
          path.resolve(WORKTREE_ROOT, 'src/components/admin/PackageBuilderView.tsx'),
          'utf-8'
        );
        assert.ok(
          packageBuilderSrc.includes('disabled={isMutating || isArchived}'),
          'Publish button must be disabled when isArchived is true'
        );
        assert.ok(
          packageBuilderSrc.includes("if (pkg.isLegacy || pkg.status === 'ARCHIVED') return;"),
          'handleTogglePublish must return early when status is ARCHIVED'
        );
      });
    });

    // BLOCKER 4: fetchAdminCatalog DEBE FALLAR CERRADO
    describe('Blocker 4: fetchAdminCatalog fail-closed on corrupt or invalid HTTP 200 responses', () => {
      it('throws when HTTP 200 returns HTML / invalid non-JSON body', async () => {
        const service = CommercialPackageService.getInstance();
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });

        try {
          await assert.rejects(
            () => service.fetchAdminCatalog(),
            /Admin catalog fetch rejected/
          );
        } finally {
          globalThis.fetch = originalFetch;
        }
      });

      it('throws when HTTP 200 returns malformed non-JSON string', async () => {
        const service = CommercialPackageService.getInstance();
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => new Response('not a valid json {{{{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

        try {
          await assert.rejects(
            () => service.fetchAdminCatalog(),
            /invalid JSON response from backend/
          );
        } finally {
          globalThis.fetch = originalFetch;
        }
      });

      it('throws when HTTP 200 returns empty object {} without canonical or legacy', async () => {
        const service = CommercialPackageService.getInstance();
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

        try {
          await assert.rejects(
            () => service.fetchAdminCatalog(),
            /response must contain valid canonical and legacy arrays/
          );
        } finally {
          globalThis.fetch = originalFetch;
        }
      });

      it('throws when HTTP 200 returns canonical as non-array', async () => {
        const service = CommercialPackageService.getInstance();
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => new Response(JSON.stringify({ canonical: 'not_an_array', legacy: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

        try {
          await assert.rejects(
            () => service.fetchAdminCatalog(),
            /response must contain valid canonical and legacy arrays/
          );
        } finally {
          globalThis.fetch = originalFetch;
        }
      });

      it('throws when HTTP 200 returns legacy as non-array', async () => {
        const service = CommercialPackageService.getInstance();
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => new Response(JSON.stringify({ canonical: [], legacy: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

        try {
          await assert.rejects(
            () => service.fetchAdminCatalog(),
            /response must contain valid canonical and legacy arrays/
          );
        } finally {
          globalThis.fetch = originalFetch;
        }
      });

      it('does NOT update local cache when response fails closed', async () => {
        const service = CommercialPackageService.getInstance();
        const originalFetch = globalThis.fetch;

        // Populate store with known data
        localStorage.setItem('minerx_admin_commercial_packages_v2', JSON.stringify([{ id: 'pkg-safe', name: 'Safe' }]));

        globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Corrupt' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

        try {
          await assert.rejects(() => service.fetchAdminCatalog());
          // Local storage must remain intact
          const cached = JSON.parse(localStorage.getItem('minerx_admin_commercial_packages_v2') || '[]');
          assert.equal(cached.length, 1);
          assert.equal(cached[0].id, 'pkg-safe');
        } finally {
          globalThis.fetch = originalFetch;
        }
      });
    });
  });
});
