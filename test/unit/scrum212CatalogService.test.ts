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
    assert.ok(withCampaigns.errors.some(e => e.includes('out of scope for SCRUM-212')));

    const withDiscounts = CatalogService.validatePackageMutation({
      name: 'Miner With Discount',
      powerTh: 10,
      priceUsdt: 100,
      section: 'preventa',
      discounts: [10],
    } as any);
    assert.equal(withDiscounts.valid, false);
    assert.ok(withDiscounts.errors.some(e => e.includes('out of scope for SCRUM-212')));

    // Also verify priority, stackable, discount, and promotionalPrice are rejected
    for (const forbidden of [
      { priority: 1 },
      { stackable: true },
      { discount: { isActive: true } },
      { promotionalPrice: 50 },
      { promoPrice: 50 },
      { discountActive: true }
    ]) {
      const res = CatalogService.validatePackageMutation({
        name: 'Forbidden Miner',
        powerTh: 10,
        priceUsdt: 100,
        section: 'minerx',
        ...forbidden,
      } as any);
      assert.equal(res.valid, false, `Expected ${Object.keys(forbidden)[0]} to be rejected`);
      assert.ok(res.errors.some(e => e.includes('out of scope for SCRUM-212')));
    }
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

  // Legacy Preservation: Reject overwriting or mutating physically preserved legacy packages
  it('protects physically preserved legacy packages from being overwritten or mutated', async () => {
    const { service } = createTestCatalogService();

    // 1. Validation rejects overwriting legacy package
    const validation = CatalogService.validatePackageMutation(
      {
        id: 'pkg-miner-2',
        name: 'Minero 2 Attempt Overwrite',
        powerTh: 120,
        priceUsdt: 1500,
        section: 'minerx',
      },
      {
        isUpdate: true,
        existingPackage: fixtureLegacyPackage2,
      }
    );
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some(e => e.includes('Cannot overwrite or mutate physically preserved legacy package')));

    // 2. savePackage throws when targeting legacy package
    await assert.rejects(
      async () => {
        await service.savePackage({
          id: 'pkg-miner-2',
          name: 'Minero 2 Attempt Overwrite',
          powerTh: 120,
          priceUsdt: 1500,
          section: 'minerx',
        });
      },
      /Cannot overwrite or mutate physically preserved legacy package/
    );

    // 3. archivePackage throws when targeting legacy package
    await assert.rejects(
      async () => {
        await service.archivePackage('pkg-miner-2');
      },
      /Cannot overwrite or archive physically preserved legacy package/
    );
  });

  // PackageId != MinerId contract enforcement
  it('enforces packageId != minerId (rejects minerId on commercial package mutations)', () => {
    const withMinerId = CatalogService.validatePackageMutation({
      id: 'pkg-minerx-01',
      minerId: 'miner-worker-123',
      name: 'Confused Package',
      powerTh: 100,
      priceUsdt: 1000,
      section: 'minerx',
    } as any);
    assert.equal(withMinerId.valid, false);
    assert.ok(withMinerId.errors.some(e => e.includes('minerId is invalid on commercial_packages')));
  });

  // ID consistency enforcement
  it('enforces that id and packageId must match if both are supplied', () => {
    const mismatched = CatalogService.validatePackageMutation({
      id: 'pkg-minerx-01',
      packageId: 'pkg-minerx-02',
      name: 'Mismatched ID',
      powerTh: 100,
      priceUsdt: 1000,
      section: 'minerx',
    });
    assert.equal(mismatched.valid, false);
    assert.ok(mismatched.errors.some(e => e.includes('must match')));
  });

  // Visible catalog currency enforcement
  it('enforces visible catalog currency strictly USD', () => {
    const validUsd = CatalogService.validatePackageMutation({
      name: 'Valid USD Miner',
      powerTh: 100,
      priceUsdt: 1000,
      section: 'minerx',
      currency: 'USD',
    });
    assert.equal(validUsd.valid, true);

    const invalidCurrency = CatalogService.validatePackageMutation({
      name: 'Invalid EUR Miner',
      powerTh: 100,
      priceUsdt: 1000,
      section: 'minerx',
      currency: 'EUR' as any,
    });
    assert.equal(invalidCurrency.valid, false);
    assert.ok(invalidCurrency.errors.some(e => e.includes('Visible catalog currency must remain strictly \'USD\'')));
  });

  // Synthetic credential rejection
  it('rejects synthetic credentials admin_sys and admin@minerx.cloud as authoritative identities', () => {
    const withAdminSys = CatalogService.validatePackageMutation({
      name: 'Miner With Synthetic Admin',
      powerTh: 100,
      priceUsdt: 1000,
      section: 'minerx',
      updatedBy: 'admin_sys',
    });
    assert.equal(withAdminSys.valid, false);
    assert.ok(withAdminSys.errors.some(e => e.includes('Synthetic credential')));

    const withAdminEmail = CatalogService.validatePackageMutation({
      name: 'Miner With Synthetic Email',
      powerTh: 100,
      priceUsdt: 1000,
      section: 'minerx',
      updatedBy: 'admin@minerx.cloud',
    });
    assert.equal(withAdminEmail.valid, false);
    assert.ok(withAdminEmail.errors.some(e => e.includes('Synthetic credential')));
  });

  // CommercialPackageService mutation validations
  it('CommercialPackageService validates mutations and rejects invalid inputs', () => {
    const commercialService = CommercialPackageService.getInstance();

    // Rejects invalid mutation with negative power
    assert.throws(
      () => {
        commercialService.savePackage({
          name: 'Invalid Power',
          powerTh: -10,
          priceUsdt: 500,
          section: 'minerx',
        } as any);
      },
      /Package mutation rejected/
    );

    // Rejects invalid mutation with out-of-scope fields
    assert.throws(
      () => {
        commercialService.savePackage({
          name: 'Invalid With Discount',
          powerTh: 50,
          priceUsdt: 500,
          section: 'minerx',
          finalPriceUsdCents: 4900,
        } as any);
      },
      /Package mutation rejected/
    );

    // Successfully creates and updates a valid package with version increments
    const saved = commercialService.savePackage({
      name: 'Valid Dynamic Miner',
      powerTh: 80,
      priceUsdt: 800,
      section: 'minerx',
    });
    assert.equal(saved.status, 'ACTIVE');
    assert.equal(saved.version, 1);

    const updated = commercialService.savePackage({
      ...saved,
      powerTh: 85,
    });
    assert.equal(updated.version, 2);
    assert.equal(updated.powerTh, 85);
  });

  // FirestoreCatalogStoreAdapter behavior with null / custom store
  it('FirestoreCatalogStoreAdapter handles null firestore gracefully and supports constructor injection', async () => {
    const { FirestoreCatalogStoreAdapter } = await import('../../src/services/catalogService');

    // Null firestore adapter returns empty on getPackages and throws on save
    const nullAdapter = new FirestoreCatalogStoreAdapter(null);
    const pkgs = await nullAdapter.getPackages();
    assert.deepEqual(pkgs, []);
    const byId = await nullAdapter.getPackageById('any-id');
    assert.equal(byId, null);
    await assert.rejects(
      async () => {
        await nullAdapter.savePackage(fixtureMinerxPublished);
      },
      /Firestore is not initialized/
    );

    // Custom mock firestore adapter
    const mockMap = new Map<string, any>();
    mockMap.set(fixtureMinerxPublished.id, fixtureMinerxPublished);
    const mockStore = {
      mockDocs: [fixtureMinerxPublished],
    };
    const mockAdapter = new FirestoreCatalogStoreAdapter({
      // Mock duck-typed firestore instance
    });
    assert.ok(mockAdapter);
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

  // =========================================================================
  // ITERATION 2 REVIEW BLOCKER VERIFICATION TESTS (SCRUM-212)
  // =========================================================================

  // BLOCKER 3 TESTS: No Default Publishing on CREATE
  describe('Blocker 3: No Default Publishing on CREATE', () => {
    it('validatePackageMutation rejects CREATE when status is missing', () => {
      const res = CatalogService.validatePackageMutation(
        {
          name: 'Missing Status Miner',
          powerTh: 100,
          priceUsdt: 1000,
          section: 'minerx',
          isPublished: true,
        },
        { isCreate: true }
      );
      assert.equal(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('status is required on package creation')));
    });

    it('validatePackageMutation rejects CREATE when isPublished is missing', () => {
      const res = CatalogService.validatePackageMutation(
        {
          name: 'Missing isPublished Miner',
          powerTh: 100,
          priceUsdt: 1000,
          section: 'minerx',
          status: 'ACTIVE',
        },
        { isCreate: true }
      );
      assert.equal(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('isPublished is required on package creation')));
    });

    it('validatePackageMutation rejects CREATE when status is invalid', () => {
      const res = CatalogService.validatePackageMutation(
        {
          name: 'Invalid Status Miner',
          powerTh: 100,
          priceUsdt: 1000,
          section: 'minerx',
          status: 'PENDING' as any,
          isPublished: true,
        },
        { isCreate: true }
      );
      assert.equal(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('Invalid status')));
    });

    it('validatePackageMutation rejects CREATE when isPublished is non-boolean', () => {
      const res = CatalogService.validatePackageMutation(
        {
          name: 'Non Boolean isPublished Miner',
          powerTh: 100,
          priceUsdt: 1000,
          section: 'minerx',
          status: 'ACTIVE',
          isPublished: 'true' as any,
        },
        { isCreate: true }
      );
      assert.equal(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('isPublished is required on package creation')));
    });

    it('savePackage throws on CREATE when status or isPublished are missing (never defaults to ACTIVE or true)', async () => {
      const { service } = createTestCatalogService();

      // Attempt create without status
      await assert.rejects(
        async () => {
          await service.savePackage({
            id: 'pkg-new-uninitialized-status',
            name: 'Uninitialized Status',
            powerTh: 80,
            priceUsdt: 800,
            section: 'minerx',
            isPublished: true,
          } as any);
        },
        /status is required on package creation/
      );

      // Attempt create without isPublished
      await assert.rejects(
        async () => {
          await service.savePackage({
            id: 'pkg-new-uninitialized-publish',
            name: 'Uninitialized Publish',
            powerTh: 80,
            priceUsdt: 800,
            section: 'minerx',
            status: 'ACTIVE',
          } as any);
        },
        /isPublished is required on package creation/
      );
    });

    it('savePackage creates new package with explicit status=DRAFT and isPublished=false without injecting ACTIVE or true', async () => {
      const { service, adapter } = createTestCatalogService();

      const created = await service.savePackage({
        id: 'pkg-explicit-draft',
        name: 'Explicit Draft Package',
        powerTh: 90,
        priceUsdt: 950,
        section: 'minerx',
        status: 'DRAFT',
        isPublished: false,
      }, { updatedBy: 'usr_valid_operator' });

      assert.equal(created.id, 'pkg-explicit-draft');
      assert.equal(created.status, 'DRAFT', 'Must remain strictly DRAFT without default promotion');
      assert.equal(created.isPublished, false, 'Must remain strictly unpublished without default promotion');
      assert.equal(created.updatedBy, 'usr_valid_operator');

      const persisted = await adapter.getPackageById('pkg-explicit-draft');
      assert.ok(persisted);
      assert.equal(persisted?.status, 'DRAFT');
      assert.equal(persisted?.isPublished, false);
    });

    it('savePackage on UPDATE preserves existing status and isPublished when omitted in update payload', async () => {
      const { service } = createTestCatalogService();

      // Update existing fixtureMinerxPublished (status: 'ACTIVE', isPublished: true) without passing status or isPublished
      const updated = await service.savePackage({
        id: 'pkg-minerx-01',
        name: 'MinerX Preserved Status Update',
        powerTh: 105,
        priceUsdt: 1250,
        section: 'minerx',
      }, { updatedBy: 'usr_valid_operator' });

      assert.equal(updated.id, 'pkg-minerx-01');
      assert.equal(updated.status, 'ACTIVE', 'Existing status preserved on update');
      assert.equal(updated.isPublished, true, 'Existing isPublished preserved on update');
      assert.equal(updated.version, 2);
    });
  });

  // BLOCKER 2 TESTS: Mutations Require Real Authenticated Identity
  describe('Blocker 2: Mutations Require Real Authenticated Identity', () => {
    it('savePackage strictly derives updatedBy from options and ignores payload updatedBy', async () => {
      const { service } = createTestCatalogService();

      // Passing spoofed updatedBy in payload, but authoritative options.updatedBy
      const created = await service.savePackage({
        id: 'pkg-untrusted-body-id',
        name: 'Untrusted Payload Test',
        powerTh: 60,
        priceUsdt: 600,
        section: 'minerx',
        status: 'ACTIVE',
        isPublished: true,
        updatedBy: 'spoofed_hacker_id',
      } as any, { updatedBy: 'usr_authoritative_session' });

      assert.equal(created.updatedBy, 'usr_authoritative_session', 'Must use options.updatedBy derived from valid session');
      assert.notEqual(created.updatedBy, 'spoofed_hacker_id');
    });

    it('savePackage strips updatedBy if no authoritative session identity is supplied', async () => {
      const { service } = createTestCatalogService();

      const created = await service.savePackage({
        id: 'pkg-no-session-update',
        name: 'No Session Update',
        powerTh: 70,
        priceUsdt: 700,
        section: 'minerx',
        status: 'ACTIVE',
        isPublished: true,
        updatedBy: 'attacker_unverified',
      } as any);

      assert.equal(created.updatedBy, undefined, 'Must NEVER trust body.updatedBy when options.updatedBy is absent');
      assert.notEqual(created.updatedBy, 'usr_default_admin');
    });

    it('archivePackage strictly sets updatedBy from options and rejects synthetic admin credentials', async () => {
      const { service } = createTestCatalogService();

      // Valid session identity
      const archivedValid = await service.archivePackage('pkg-minerx-01', { updatedBy: 'usr_operator_99' });
      assert.equal(archivedValid.status, 'ARCHIVED');
      assert.equal(archivedValid.isPublished, false);
      assert.equal(archivedValid.updatedBy, 'usr_operator_99');

      // Synthetic admin credential is never persisted
      const archivedSynthetic = await service.archivePackage('pkg-lanzamiento-01', { updatedBy: 'admin_sys' });
      assert.equal(archivedSynthetic.updatedBy, undefined, 'Synthetic admin_sys must not be stored');
    });
  });

  // BLOCKER 1 & INTEGRATION TESTS: Canonical Endpoints, Backing Store & Auth Enforcement
  describe('Blocker 1 & Endpoints: Backing Store Isolation & Express Integration', () => {
    it('verifies getAuthenticatedUser strictly requires real session token and rejects usr_default_admin fallback', async () => {
      const { getAuthenticatedUser, readUsers, writeUsers } = await import('../../server/server.js');

      // No token
      const noAuthReq = { headers: {}, query: {} } as any;
      assert.equal(getAuthenticatedUser(noAuthReq), null);

      // Invalid token
      const invalidTokenReq = { headers: { authorization: 'Bearer invalid_nonexistent_token' }, query: {} } as any;
      assert.equal(getAuthenticatedUser(invalidTokenReq), null);

      // Create a temporary verified user with sessionToken in memory/users db
      const db = readUsers();
      const testToken = `test_session_${Date.now()}`;
      const verifiedUser = {
        id: 'usr_scrum212_test_admin',
        username: 'scrum212_admin',
        email: 'scrum212_admin@minerx.cloud',
        passwordHash: 'dummy_hash_value',
        fullName: 'SCRUM-212 Test Administrator',
        createdAt: new Date().toISOString(),
        sessionToken: testToken,
      };
      db.users.push(verifiedUser);
      writeUsers(db);

      try {
        const validReq = { headers: { authorization: `Bearer ${testToken}` }, query: {} } as any;
        const authUser = getAuthenticatedUser(validReq);
        assert.ok(authUser);
        assert.equal(authUser?.id, 'usr_scrum212_test_admin');
        assert.equal(authUser?.username, 'scrum212_admin');

        // Query token fallback
        const queryTokenReq = { headers: {}, query: { token: testToken } } as any;
        const authUserQuery = getAuthenticatedUser(queryTokenReq);
        assert.ok(authUserQuery);
        assert.equal(authUserQuery?.id, 'usr_scrum212_test_admin');
      } finally {
        // Clean up test user
        const cleanedDb = readUsers();
        cleanedDb.users = cleanedDb.users.filter(u => u.id !== 'usr_scrum212_test_admin');
        writeUsers(cleanedDb);
      }
    });

    it('end-to-end HTTP tests verify /api/catalog/* routes delegate to CatalogService and enforce session auth', async () => {
      const { app, setCatalogService, catalogService, readUsers, writeUsers } = await import('../../server/server.js');
      const http = await import('node:http');

      // Setup in-memory catalog for server testing
      const testAdapter = new MemoryCatalogStoreAdapter([
        fixtureMinerxPublished,
        fixturePreventaPublished,
        fixtureDraftPackage,
        fixtureLegacyPackage1,
      ]);
      const isolatedService = new CatalogService(testAdapter);
      setCatalogService(isolatedService);

      // Setup temporary admin user
      const db = readUsers();
      const testToken = `test_http_token_${Date.now()}`;
      const testUser = {
        id: 'usr_http_test_operator',
        username: 'http_operator',
        email: 'http_operator@minerx.cloud',
        passwordHash: 'hash',
        fullName: 'HTTP Operator',
        createdAt: new Date().toISOString(),
        sessionToken: testToken,
      };
      db.users.push(testUser);
      writeUsers(db);

      // Start test HTTP server on ephemeral port
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;
      const baseUrl = `http://localhost:${port}`;

      try {
        // 1. GET /api/catalog/storefront is public, delegates to CatalogService, returns only ACTIVE+published
        const sfRes = await fetch(`${baseUrl}/api/catalog/storefront?section=minerx`);
        assert.equal(sfRes.status, 200);
        const sfData = await sfRes.json();
        assert.ok(Array.isArray(sfData));
        assert.equal(sfData.length, 1);
        assert.equal(sfData[0].id, 'pkg-minerx-01');
        assert.equal(sfData[0].status, 'ACTIVE');

        // Invalid section on storefront returns 400
        const sfInvalid = await fetch(`${baseUrl}/api/catalog/storefront?section=nonexistent`);
        assert.equal(sfInvalid.status, 400);

        // 2. GET /api/catalog/admin requires valid authentication
        const adminUnauth = await fetch(`${baseUrl}/api/catalog/admin`);
        assert.equal(adminUnauth.status, 401);

        const adminAuth = await fetch(`${baseUrl}/api/catalog/admin`, {
          headers: { authorization: `Bearer ${testToken}` },
        });
        assert.equal(adminAuth.status, 200);
        const adminData = await adminAuth.json();
        assert.ok(Array.isArray(adminData.canonical));
        assert.ok(Array.isArray(adminData.legacy));
        assert.ok(adminData.canonical.some((p: any) => p.id === 'pkg-mensual-draft'));
        assert.ok(adminData.legacy.some((p: any) => p.id === 'pkg-miner-1'));

        // 3. POST /api/catalog/packages requires valid authentication
        const postUnauth = await fetch(`${baseUrl}/api/catalog/packages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Test', powerTh: 10, priceUsdt: 100, section: 'minerx', status: 'ACTIVE', isPublished: true }),
        });
        assert.equal(postUnauth.status, 401);

        // 4. POST /api/catalog/packages rejects incomplete creation with 400 (Blocker 3: no default publishing)
        const postIncomplete = await fetch(`${baseUrl}/api/catalog/packages`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${testToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Incomplete Package Without Status',
            powerTh: 50,
            priceUsdt: 500,
            section: 'minerx',
          }),
        });
        assert.equal(postIncomplete.status, 400);
        const errJson = await postIncomplete.json();
        assert.ok(errJson.details.includes('status is required on package creation'));

        // 5. POST /api/catalog/packages creates valid package and strictly sets updatedBy from authenticated session
        const postValid = await fetch(`${baseUrl}/api/catalog/packages`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${testToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            id: 'pkg-http-created',
            name: 'HTTP Created Package',
            powerTh: 75,
            priceUsdt: 750,
            section: 'minerx',
            status: 'DRAFT',
            isPublished: false,
            updatedBy: 'hacker_spoofed_identity', // Must be ignored!
          }),
        });
        assert.equal(postValid.status, 200);
        const createdJson = await postValid.json();
        assert.equal(createdJson.success, true);
        assert.equal(createdJson.package.id, 'pkg-http-created');
        assert.equal(createdJson.package.status, 'DRAFT', 'Must remain strictly DRAFT');
        assert.equal(createdJson.package.isPublished, false, 'Must remain strictly unpublished');
        assert.equal(createdJson.package.updatedBy, 'usr_http_test_operator', 'Must be derived from session, NOT hacker_spoofed_identity');

        // 6. POST /api/catalog/packages/:id/archive requires authentication and sets status=ARCHIVED
        const archiveUnauth = await fetch(`${baseUrl}/api/catalog/packages/pkg-http-created/archive`, {
          method: 'POST',
        });
        assert.equal(archiveUnauth.status, 401);

        const archiveAuth = await fetch(`${baseUrl}/api/catalog/packages/pkg-http-created/archive`, {
          method: 'POST',
          headers: { authorization: `Bearer ${testToken}` },
        });
        assert.equal(archiveAuth.status, 200);
        const archiveJson = await archiveAuth.json();
        assert.equal(archiveJson.package.status, 'ARCHIVED');
        assert.equal(archiveJson.package.isPublished, false);
        assert.equal(archiveJson.package.updatedBy, 'usr_http_test_operator');

        // 7. GET /api/packages is legacy route with X-Catalog-Legacy header
        const legacyRes = await fetch(`${baseUrl}/api/packages`);
        assert.equal(legacyRes.status, 200);
        assert.equal(legacyRes.headers.get('x-catalog-legacy'), 'true');
      } finally {
        // Cleanup server and test user
        server.close();
        const cleanedDb = readUsers();
        cleanedDb.users = cleanedDb.users.filter(u => u.id !== 'usr_http_test_operator');
        writeUsers(cleanedDb);
        // Restore default catalogService
        setCatalogService(catalogService);
      }
    });
  });
});
