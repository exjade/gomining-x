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
import {
  CatalogService,
  MemoryCatalogStoreAdapter,
  VALID_SECTIONS,
  type CatalogSection,
} from '../../src/services/catalogService';
import {
  CommercialPackageService,
  INITIAL_PACKAGES,
  validatePackageSchema,
} from '../../src/services/admin/commercialPackageService';
import type { CommercialPackage } from '../../src/types/admin';

describe('SCRUM-212: Dynamic Catalog Service & Legacy Decoupling Tests', () => {
  // Test Fixtures
  const fixtureMinerxPublished: CommercialPackage = {
    id: 'pkg-minerx-01',
    packageId: 'pkg-minerx-01',
    name: 'MinerX Beast 100 TH',
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

  const fixturePreventaPublished: CommercialPackage = {
    id: 'pkg-preventa-01',
    packageId: 'pkg-preventa-01',
    name: 'Preventa Early 50 TH',
    displayName: '50 TH',
    section: 'preventa',
    packageType: 'fixed',
    powerTh: 50,
    priceUsdt: 600,
    status: 'ACTIVE',
    isPublished: true,
    sortOrder: 1,
    version: 1,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const fixtureLanzamiento1: CommercialPackage = {
    id: 'pkg-lanzamiento-01',
    packageId: 'pkg-lanzamiento-01',
    name: 'Lanzamiento Tier A',
    displayName: 'Tier A',
    section: 'lanzamiento',
    packageType: 'fixed',
    powerTh: 75,
    priceUsdt: 900,
    status: 'ACTIVE',
    isPublished: true,
    sortOrder: 10,
    version: 1,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const fixtureLanzamiento2: CommercialPackage = {
    id: 'pkg-lanzamiento-02',
    packageId: 'pkg-lanzamiento-02',
    name: 'Lanzamiento Tier B',
    displayName: 'Tier B',
    section: 'lanzamiento',
    packageType: 'fixed',
    powerTh: 150,
    priceUsdt: 1800,
    status: 'ACTIVE',
    isPublished: true,
    sortOrder: 5, // Lower sortOrder should appear first
    version: 1,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const fixtureMensualPublished: CommercialPackage = {
    id: 'pkg-mensual-01',
    packageId: 'pkg-mensual-01',
    name: 'Mensual Subscription 25 TH',
    displayName: '25 TH Sub',
    section: 'mensual',
    packageType: 'subscription',
    powerTh: 25,
    priceUsdt: 150,
    status: 'ACTIVE',
    isPublished: true,
    sortOrder: 1,
    version: 1,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const fixtureDraftPackage: CommercialPackage = {
    id: 'pkg-mensual-draft',
    packageId: 'pkg-mensual-draft',
    name: 'Mensual Draft 30 TH',
    section: 'mensual',
    packageType: 'subscription',
    powerTh: 30,
    priceUsdt: 200,
    status: 'DRAFT',
    isPublished: true,
    sortOrder: 2,
    version: 1,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const fixtureArchivedPackage: CommercialPackage = {
    id: 'pkg-preventa-archived',
    packageId: 'pkg-preventa-archived',
    name: 'Preventa Old Batch',
    section: 'preventa',
    packageType: 'fixed',
    powerTh: 40,
    priceUsdt: 450,
    status: 'ARCHIVED',
    isPublished: false,
    sortOrder: 3,
    version: 2,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const fixtureUnpublishedPackage: CommercialPackage = {
    id: 'pkg-minerx-unpublished',
    packageId: 'pkg-minerx-unpublished',
    name: 'MinerX Hidden',
    section: 'minerx',
    packageType: 'fixed',
    powerTh: 80,
    priceUsdt: 950,
    status: 'ACTIVE',
    isPublished: false,
    sortOrder: 4,
    version: 1,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  // Legacy packages (no section, e.g. Minero 2 Standard)
  const fixtureLegacyPackage1: CommercialPackage = {
    id: 'pkg-miner-1',
    name: 'Minero 1 Entry',
    powerTh: 48,
    priceUsdt: 561.99,
    status: 'ACTIVE',
    isPublished: true,
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  const fixtureLegacyPackage2: CommercialPackage = {
    id: 'pkg-miner-2',
    name: 'Minero 2 Standard',
    powerTh: 64,
    priceUsdt: 744.99,
    status: 'ACTIVE',
    isPublished: true,
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  const allFixtures: CommercialPackage[] = [
    fixtureMinerxPublished,
    fixturePreventaPublished,
    fixtureLanzamiento1,
    fixtureLanzamiento2,
    fixtureMensualPublished,
    fixtureDraftPackage,
    fixtureArchivedPackage,
    fixtureUnpublishedPackage,
    fixtureLegacyPackage1,
    fixtureLegacyPackage2,
  ];

  function createTestCatalogService() {
    const memoryAdapter = new MemoryCatalogStoreAdapter(allFixtures);
    return {
      service: new CatalogService(memoryAdapter),
      adapter: memoryAdapter,
    };
  }

  // 1. lectura minerx solo devuelve minerx
  it('1. lectura minerx solo devuelve minerx', async () => {
    const { service } = createTestCatalogService();
    const result = await service.getStorefrontCatalog('minerx');
    assert.ok(result.length > 0);
    for (const pkg of result) {
      assert.equal(pkg.section, 'minerx');
    }
  });

  // 2. lectura preventa solo devuelve preventa
  it('2. lectura preventa solo devuelve preventa', async () => {
    const { service } = createTestCatalogService();
    const result = await service.getStorefrontCatalog('preventa');
    assert.ok(result.length > 0);
    for (const pkg of result) {
      assert.equal(pkg.section, 'preventa');
    }
  });

  // 3. lectura lanzamiento ordenada por sortOrder
  it('3. lectura lanzamiento ordenada por sortOrder', async () => {
    const { service } = createTestCatalogService();
    const result = await service.getStorefrontCatalog('lanzamiento');
    assert.equal(result.length, 2);
    // fixtureLanzamiento2 has sortOrder: 5, fixtureLanzamiento1 has sortOrder: 10
    assert.equal(result[0].id, 'pkg-lanzamiento-02');
    assert.equal(result[0].sortOrder, 5);
    assert.equal(result[1].id, 'pkg-lanzamiento-01');
    assert.equal(result[1].sortOrder, 10);
  });

  // 4. lectura mensual solo publicada/ACTIVE
  it('4. lectura mensual solo publicada/ACTIVE', async () => {
    const { service } = createTestCatalogService();
    const result = await service.getStorefrontCatalog('mensual');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'pkg-mensual-01');
    assert.equal(result[0].status, 'ACTIVE');
    assert.equal(result[0].isPublished, true);
  });

  // 5. legacy sin section queda fuera del storefront
  it('5. legacy sin section queda fuera del storefront', async () => {
    const { service } = createTestCatalogService();
    for (const sec of VALID_SECTIONS) {
      const result = await service.getStorefrontCatalog(sec);
      const hasLegacy1 = result.some(p => p.id === 'pkg-miner-1');
      const hasLegacy2 = result.some(p => p.id === 'pkg-miner-2');
      assert.equal(hasLegacy1, false, 'pkg-miner-1 must not appear in storefront');
      assert.equal(hasLegacy2, false, 'pkg-miner-2 must not appear in storefront');
      assert.ok(result.every(p => Boolean(p.section)), 'all storefront packages must have section');
    }
  });

  // 6. ARCHIVED queda fuera del storefront
  it('6. ARCHIVED queda fuera del storefront', async () => {
    const { service } = createTestCatalogService();
    const result = await service.getStorefrontCatalog('preventa');
    const hasArchived = result.some(p => p.id === 'pkg-preventa-archived' || p.status === 'ARCHIVED');
    assert.equal(hasArchived, false, 'ARCHIVED packages must never appear in storefront');
  });

  // 7. isPublished=false queda fuera del storefront
  it('7. isPublished=false queda fuera del storefront', async () => {
    const { service } = createTestCatalogService();
    const result = await service.getStorefrontCatalog('minerx');
    const hasUnpublished = result.some(p => p.id === 'pkg-minerx-unpublished' || p.isPublished === false);
    assert.equal(hasUnpublished, false, 'isPublished=false must never appear in storefront');
  });

  // 8. DRAFT queda fuera del storefront
  it('8. DRAFT queda fuera del storefront', async () => {
    const { service } = createTestCatalogService();
    const result = await service.getStorefrontCatalog('mensual');
    const hasDraft = result.some(p => p.id === 'pkg-mensual-draft' || p.status === 'DRAFT');
    assert.equal(hasDraft, false, 'DRAFT packages must never appear in storefront');
  });

  // 9. Admin sí puede listar catálogo canónico no publicado
  it('9. Admin sí puede listar catálogo canónico no publicado (DRAFT, ARCHIVED, isPublished=false)', async () => {
    const { service } = createTestCatalogService();
    const adminCatalog = await service.getAdminCatalog();
    assert.ok(Array.isArray(adminCatalog.canonical));
    const ids = adminCatalog.canonical.map(p => p.id);
    assert.ok(ids.includes('pkg-mensual-draft'), 'Admin can list DRAFT packages');
    assert.ok(ids.includes('pkg-preventa-archived'), 'Admin can list ARCHIVED packages');
    assert.ok(ids.includes('pkg-minerx-unpublished'), 'Admin can list unpublished packages');
  });

  // 10. legacy queda identificado por separado
  it('10. legacy queda identificado por separado en lectura administrativa', async () => {
    const { service } = createTestCatalogService();
    const adminCatalog = await service.getAdminCatalog();
    assert.ok(Array.isArray(adminCatalog.legacy));
    assert.equal(adminCatalog.legacy.length, 2);
    const legacyIds = adminCatalog.legacy.map(p => p.id);
    assert.ok(legacyIds.includes('pkg-miner-1'));
    assert.ok(legacyIds.includes('pkg-miner-2'));
    for (const leg of adminCatalog.legacy) {
      assert.equal(leg.isLegacy, true);
    }
  });

  // 11. lectura no hace writes
  it('11. lectura no hace writes', async () => {
    const memoryAdapter = new MemoryCatalogStoreAdapter(allFixtures);
    let writeHappened = false;
    const originalSave = memoryAdapter.savePackage.bind(memoryAdapter);
    memoryAdapter.savePackage = async (pkg) => {
      writeHappened = true;
      return originalSave(pkg);
    };

    const service = new CatalogService(memoryAdapter);
    await service.getStorefrontCatalog('minerx');
    await service.getStorefrontCatalog('preventa');
    await service.getStorefrontCatalog('lanzamiento');
    await service.getStorefrontCatalog('mensual');
    await service.getAdminCatalog();

    assert.equal(writeHappened, false, 'Catalog reading must be purely read-only and never trigger writes');
  });

  // 12. no auto-seed
  it('12. no auto-seed on empty catalog read', async () => {
    const emptyAdapter = new MemoryCatalogStoreAdapter([]);
    const service = new CatalogService(emptyAdapter);
    const storefront = await service.getStorefrontCatalog('minerx');
    assert.deepEqual(storefront, []);
    const packagesAfter = await emptyAdapter.getPackages();
    assert.equal(packagesAfter.length, 0, 'Empty catalog read must not seed any default packages');
  });

  // 13. validación rechaza powerTh <= 0
  it('13. validación rechaza powerTh <= 0', () => {
    const zeroPower = CatalogService.validatePackageMutation({
      name: 'Test Miner',
      powerTh: 0,
      priceUsdt: 100,
      section: 'minerx',
    });
    assert.equal(zeroPower.valid, false);
    assert.ok(zeroPower.errors.some(e => e.includes('powerTh must be a positive number')));

    const negativePower = CatalogService.validatePackageMutation({
      name: 'Test Miner',
      powerTh: -10,
      priceUsdt: 100,
      section: 'minerx',
    });
    assert.equal(negativePower.valid, false);
    assert.ok(negativePower.errors.some(e => e.includes('powerTh must be a positive number')));
  });

  // 14. validación rechaza precio <= 0
  it('14. validación rechaza precio <= 0', () => {
    const zeroPrice = CatalogService.validatePackageMutation({
      name: 'Free Miner',
      powerTh: 10,
      priceUsdt: 0,
      section: 'preventa',
    });
    assert.equal(zeroPrice.valid, false);
    assert.ok(zeroPrice.errors.some(e => e.includes('priceUsdt must be a positive number')));

    const negativePrice = CatalogService.validatePackageMutation({
      name: 'Negative Miner',
      powerTh: 10,
      priceUsdt: -50,
      section: 'preventa',
    });
    assert.equal(negativePrice.valid, false);
    assert.ok(negativePrice.errors.some(e => e.includes('priceUsdt must be a positive number')));
  });

  // 15. soldUnits > limitedUnits rechazado
  it('15. soldUnits > limitedUnits rechazado', () => {
    const oversold = CatalogService.validatePackageMutation({
      name: 'Oversold Batch',
      powerTh: 50,
      priceUsdt: 500,
      section: 'lanzamiento',
      limitedUnits: 10,
      soldUnits: 11,
    });
    assert.equal(oversold.valid, false);
    assert.ok(oversold.errors.some(e => e.includes('soldUnits cannot exceed limitedUnits')));

    const validUnits = CatalogService.validatePackageMutation({
      name: 'Valid Batch',
      powerTh: 50,
      priceUsdt: 500,
      section: 'lanzamiento',
      limitedUnits: 10,
      soldUnits: 10,
    });
    assert.equal(validUnits.valid, true);
  });

  // 16. update incrementa version y updatedAt
  it('16. update incrementa version y actualiza updatedAt', async () => {
    const { service } = createTestCatalogService();
    const updated = await service.savePackage({
      id: 'pkg-minerx-01',
      name: 'MinerX Beast 100 TH Updated',
      powerTh: 110,
      priceUsdt: 1250,
      section: 'minerx',
    }, { updatedBy: 'admin_real_operator' });

    assert.equal(updated.id, 'pkg-minerx-01');
    assert.equal(updated.version, 2, 'Version must increment by 1 on update');
    assert.equal(updated.powerTh, 110);
    assert.equal(updated.updatedBy, 'admin_real_operator');
    assert.ok(updated.updatedAt > fixtureMinerxPublished.updatedAt);
  });

  // 17. archive no elimina documento
  it('17. archive no elimina documento físicamente, preserva packageId y marca ARCHIVED / isPublished=false', async () => {
    const { service, adapter } = createTestCatalogService();
    const archived = await service.archivePackage('pkg-minerx-01', { updatedBy: 'admin_real_operator' });
    assert.equal(archived.id, 'pkg-minerx-01');
    assert.equal(archived.status, 'ARCHIVED');
    assert.equal(archived.isPublished, false);
    assert.equal(archived.version, 2);

    // Verify document still exists in store
    const inStore = await adapter.getPackageById('pkg-minerx-01');
    assert.ok(inStore !== null, 'Archived document must be physically preserved');
    assert.equal(inStore?.status, 'ARCHIVED');
    assert.equal(inStore?.isPublished, false);
  });

  // 18. no finalPriceUsdCents
  it('18. no finalPriceUsdCents: rejected by validation as out of scope for SCRUM-212 (belongs to SCRUM-213)', () => {
    const withFinalPrice = CatalogService.validatePackageMutation({
      name: 'Miner With Final Price',
      powerTh: 10,
      priceUsdt: 100,
      section: 'minerx',
      finalPriceUsdCents: 9900,
    } as any);
    assert.equal(withFinalPrice.valid, false);
    assert.ok(withFinalPrice.errors.some(e => e.includes('finalPriceUsdCents is out of scope for SCRUM-212')));

    const schemaValidation = validatePackageSchema({
      name: 'Miner Schema Check',
      powerTh: 10,
      priceUsdt: 100,
      finalPriceUsdCents: 9900,
    } as any);
    assert.equal(schemaValidation.valid, false);
    assert.ok(schemaValidation.errors.some(e => e.includes('finalPriceUsdCents is out of scope for SCRUM-212')));
  });

  // 19. no campaigns/discounts
  it('19. no campaigns/discounts: rejected by validation as out of scope for SCRUM-212 (belongs to SCRUM-213)', () => {
    const withCampaigns = CatalogService.validatePackageMutation({
      name: 'Miner With Campaign',
      powerTh: 10,
      priceUsdt: 100,
      section: 'preventa',
      campaigns: [{ id: 'camp-1' }],
    } as any);
    assert.equal(withCampaigns.valid, false);
    assert.ok(withCampaigns.errors.some(e => e.includes('campaigns and discounts are out of scope for SCRUM-212')));

    const withDiscounts = CatalogService.validatePackageMutation({
      name: 'Miner With Discount',
      powerTh: 10,
      priceUsdt: 100,
      section: 'preventa',
      discounts: [10],
    } as any);
    assert.equal(withDiscounts.valid, false);
    assert.ok(withDiscounts.errors.some(e => e.includes('campaigns and discounts are out of scope for SCRUM-212')));
  });

  // 20. no Client changes and no synthetic credentials (admin_sys / admin@minerx.cloud)
  it('20. no Client changes and no synthetic credentials invented when updatedBy is not supplied', async () => {
    const { service } = createTestCatalogService();
    // Update without updatedBy
    const updated = await service.savePackage({
      id: 'pkg-minerx-01',
      name: 'MinerX Clean Update',
      powerTh: 105,
      priceUsdt: 1200,
      section: 'minerx',
    });

    assert.equal(updated.updatedBy, undefined, 'Must NOT invent admin_sys or admin@minerx.cloud when no real identity is provided');
    assert.notEqual(updated.updatedBy, 'admin_sys');
    assert.notEqual(updated.updatedBy, 'admin@minerx.cloud');
  });

  // CommercialPackageService integration tests
  it('CommercialPackageService provides clean getStorefrontPackages filtering without legacy fallback', () => {
    const commercialService = CommercialPackageService.getInstance();
    // getStorefrontPackages with no matching canonical packages returns empty array, never INITIAL_PACKAGES
    const storefront = commercialService.getStorefrontPackages('minerx');
    assert.ok(Array.isArray(storefront));
    for (const p of storefront) {
      assert.equal(p.section, 'minerx');
      assert.equal(p.status, 'ACTIVE');
      assert.equal(p.isPublished, true);
    }

    // getAdminCatalog separates canonical and legacy cleanly
    const adminCatalog = commercialService.getAdminCatalog();
    assert.ok(Array.isArray(adminCatalog.canonical));
    assert.ok(Array.isArray(adminCatalog.legacy));
    for (const leg of adminCatalog.legacy) {
      assert.equal(leg.isLegacy, true);
      assert.equal(leg.section, undefined);
    }
  });

  // PackageId stability test
  it('enforces packageId stability on mutations', () => {
    const unstableMutation = CatalogService.validatePackageMutation(
      {
        id: 'mutated-id',
        packageId: 'mutated-id',
        name: 'Unstable Miner',
        powerTh: 50,
        priceUsdt: 500,
        section: 'minerx',
      },
      {
        isUpdate: true,
        existingPackage: fixtureMinerxPublished,
      }
    );
    assert.equal(unstableMutation.valid, false);
    assert.ok(unstableMutation.errors.some(e => e.includes('packageId must remain stable')));
  });
});
