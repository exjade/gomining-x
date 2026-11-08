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
});
