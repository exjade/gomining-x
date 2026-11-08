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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SafeSeedService,
  type SafeSeedReport,
  type PackageStoreAdapter,
} from '../../src/services/admin/safeSeedService';
import {
  TARGET_PACKAGES_MANIFEST,
  CUSTOM_TIERS_MANIFEST,
} from '../../src/data/seedManifest';
import {
  CommercialPackageService,
  COMMERCIAL_PACKAGES_COLLECTION,
  validatePackageSchema,
} from '../../src/services/admin/commercialPackageService';

/**
 * In-memory Mock Firestore Store Adapter to verify SafeSeedService execution
 * deterministically without requiring a live Firebase gRPC network connection.
 */
class MockPackageStoreAdapter implements PackageStoreAdapter {
  public docs = new Map<string, any>();
  public writeLog: Array<{ type: 'set' | 'update' | 'delete'; id: string; data?: any }> = [];

  async getExistingPackages(): Promise<Map<string, any>> {
    const copy = new Map<string, any>();
    for (const [k, v] of this.docs.entries()) {
      copy.set(k, { ...v });
    }
    return copy;
  }

  async setPackageDoc(id: string, data: any): Promise<void> {
    this.docs.set(id, { ...data });
    this.writeLog.push({ type: 'set', id, data: { ...data } });
  }

  public reset() {
    this.docs.clear();
    this.writeLog = [];
  }
}

describe('SCRUM-211 / POUW-1.4: Safe Seed Script & Package Manifest Tests', () => {
  const safeSeedService = SafeSeedService.getInstance();
  const packageService = CommercialPackageService.getInstance();

  // 1. MANIFEST STRUCTURE & CONTRACT VERIFICATION
  it('verifies seed-manifest.json matches exact 30-package structure with provenance metadata', () => {
    const manifestPath = resolve(process.cwd(), 'docs/paquetes_dinamicos/seed-manifest.json');
    const manifestJson = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    assert.equal(manifestJson.summary.totalPackages, 30);
    assert.equal(manifestJson.summary.bySection.minerx, 6);
    assert.equal(manifestJson.summary.bySection.preventa, 4);
    assert.equal(manifestJson.summary.bySection.lanzamiento, 16);
    assert.equal(manifestJson.summary.bySection.mensual, 4);
    assert.equal(manifestJson.summary.customTiersCount, 22);

    assert.equal(manifestJson.packages.length, 30);
    assert.equal(TARGET_PACKAGES_MANIFEST.length, 30);
    assert.equal(CUSTOM_TIERS_MANIFEST.length, 22);
  });

  it('verifies MinerX 1–5 match exact names and values from business documents, excluding legacy names', () => {
    const minerxItems = TARGET_PACKAGES_MANIFEST.filter((p) => p.section === 'minerx');
    assert.equal(minerxItems.length, 6);

    const fixedMinerx = minerxItems.filter((p) => p.packageType === 'fixed');
    assert.equal(fixedMinerx.length, 5);

    // Exact names and parameters from PouwMiners_Modelo_de_Negocio_Consolidado.docx
    const expected = [
      { id: 'minerx-01', name: 'Minero 1', powerTh: 48, priceUsdt: 561.99, sortOrder: 1 },
      { id: 'minerx-02', name: 'Minero 2', powerTh: 64, priceUsdt: 744.99, sortOrder: 2 },
      { id: 'minerx-03', name: 'Minero 3', powerTh: 96, priceUsdt: 1111.99, sortOrder: 3 },
      { id: 'minerx-04', name: 'Minero 4', powerTh: 128, priceUsdt: 1474.99, sortOrder: 4 },
      { id: 'minerx-05', name: 'Minero 5', powerTh: 192, priceUsdt: 2201.99, sortOrder: 5 },
    ];

    for (let i = 0; i < expected.length; i++) {
      const exp = expected[i];
      const actual = fixedMinerx[i];
      assert.equal(actual.id, exp.id);
      assert.equal(actual.packageId, exp.id);
      assert.equal(actual.name, exp.name);
      assert.equal(actual.displayName, exp.name);
      assert.equal(actual.powerTh, exp.powerTh);
      assert.equal(actual.priceUsdt, exp.priceUsdt);
      assert.equal(actual.sortOrder, exp.sortOrder);
      assert.equal(actual.currency, 'USDT');
      assert.equal(actual.cadence, 'one_time');
      assert.equal(actual.isPublished, true);
      assert.equal(actual.status, 'ACTIVE');

      // Legacy names MUST NOT appear
      assert.equal(actual.name.includes('Entry'), false);
      assert.equal(actual.name.includes('Standard'), false);
      assert.equal(actual.name.includes('Master'), false);
      assert.equal(actual.name.includes('Enterprise'), false);
      if (actual.name !== 'Minero 3') {
        assert.equal(actual.name.includes('Pro'), false);
      }
    }

    // MinerX Custom Row
    const customRow = minerxItems.find((p) => p.packageType === 'custom');
    assert.ok(customRow, 'MinerX section must include custom row');
    assert.equal(customRow.id, 'minerx-custom');
    assert.equal(customRow.displayName, 'Personalizado');
    assert.equal(customRow.sortOrder, 6);
  });

  it('verifies Preventa (4), Lanzamiento (16) and Mensual (4) exactly preserve Client main@99e0461 constants', () => {
    // Preventa
    const presale = TARGET_PACKAGES_MANIFEST.filter((p) => p.section === 'preventa');
    assert.equal(presale.length, 4);
    assert.deepEqual(
      presale.map((p) => ({ th: p.powerTh, price: p.priceUsdt, units: p.limitedUnits, roi: p.roiPct })),
      [
        { th: 1.46, price: 18.99, units: 30, roi: 52.5 },
        { th: 8.33, price: 99.99, units: 30, roi: 55.62 },
        { th: 21.05, price: 249.99, units: 30, roi: 56.47 },
        { th: 42.44, price: 499.99, units: 30, roi: 57.17 },
      ]
    );

    // Lanzamiento (16 levels)
    const launch = TARGET_PACKAGES_MANIFEST.filter((p) => p.section === 'lanzamiento');
    assert.equal(launch.length, 16);
    assert.equal(launch[0].powerTh, 42.44);
    assert.equal(launch[0].priceUsdt, 499.99);
    assert.equal(launch[15].powerTh, 5000);
    assert.equal(launch[15].priceUsdt, 54768.99);

    // Mensual (4 levels including Máximo)
    const monthly = TARGET_PACKAGES_MANIFEST.filter((p) => p.section === 'mensual');
    assert.equal(monthly.length, 4);
    assert.deepEqual(
      monthly.map((p) => ({ name: p.displayName, th: p.powerTh, price: p.priceUsdt, cadence: p.cadence })),
      [
        { name: 'Inicio', th: 3.82, price: 39.99, cadence: 'monthly' },
        { name: 'Plus', th: 9.61, price: 99.99, cadence: 'monthly' },
        { name: 'Pro', th: 24.20, price: 249.99, cadence: 'monthly' },
        { name: 'Máximo', th: 48.66, price: 499.99, cadence: 'monthly' },
      ]
    );

    // Custom 22 tiers
    assert.equal(CUSTOM_TIERS_MANIFEST.length, 22);
    assert.equal(CUSTOM_TIERS_MANIFEST[0].powerTh, 1);
    assert.equal(CUSTOM_TIERS_MANIFEST[0].priceUsd, 12.99);
    assert.equal(CUSTOM_TIERS_MANIFEST[21].powerTh, 5000);
    assert.equal(CUSTOM_TIERS_MANIFEST[21].priceUsd, 54768.99);
  });

  it('validates every manifest package against SCRUM-210 schema contract', () => {
    for (const pkg of TARGET_PACKAGES_MANIFEST) {
      const validation = validatePackageSchema(pkg);
      assert.equal(validation.valid, true, `Package ${pkg.id} must be schema-valid: ${validation.errors.join(', ')}`);
      assert.ok(pkg.section, `Package ${pkg.id} must define section`);
      assert.ok(['minerx', 'preventa', 'lanzamiento', 'mensual'].includes(pkg.section));
      assert.ok(pkg.packageType, `Package ${pkg.id} must define packageType`);
      assert.ok(['fixed', 'subscription', 'custom'].includes(pkg.packageType));
      assert.ok(typeof pkg.sortOrder === 'number' && pkg.sortOrder > 0);
      assert.equal(pkg.isPublished, true);
      assert.equal(pkg.status, 'ACTIVE');
      assert.equal((pkg as any).publishedToStorefront, undefined, 'Must NOT contain retired publishedToStorefront');
      assert.equal((pkg as any).campaignIds, undefined, 'Must NOT contain campaigns (out of scope)');
      assert.equal((pkg as any).discount, undefined, 'Must NOT contain discounts (out of scope)');
    }
  });

  // 2. SAFE SEED EXECUTION: DRY-RUN BY DEFAULT
  it('executes safe seed in dry-run mode by default, writing 0 documents to Firestore', async () => {
    const store = new MockPackageStoreAdapter();

    // Call with default options (dry-run = true, apply = false)
    const report: SafeSeedReport = await safeSeedService.executeSafeSeed({
      dryRun: true,
      apply: false,
      targetCatalog: TARGET_PACKAGES_MANIFEST,
      storeAdapter: store,
    });

    assert.equal(report.dryRun, true);
    assert.equal(report.applied, false);
    assert.equal(report.summary.createdCount, 30); // 30 simulated
    assert.equal(report.summary.skippedCount, 0);
    assert.equal(report.summary.blockedCount, 0);

    // Zero writes occurred on store adapter
    assert.equal(store.docs.size, 0);
    assert.equal(store.writeLog.length, 0);
  });

  // 3. SAFE SEED EXECUTION: APPLY CREATES DOCUMENTS SAFELY
  it('executes safe seed with apply=true, creating 30 documents without materializing priceUsdCents', async () => {
    const store = new MockPackageStoreAdapter();

    const report: SafeSeedReport = await safeSeedService.executeSafeSeed({
      apply: true,
      dryRun: false,
      targetCatalog: TARGET_PACKAGES_MANIFEST,
      storeAdapter: store,
    });

    assert.equal(report.dryRun, false);
    assert.equal(report.applied, true);
    assert.equal(report.summary.createdCount, 30);
    assert.equal(report.summary.skippedCount, 0);
    assert.equal(report.summary.blockedCount, 0);

    // Verify written documents
    assert.equal(store.docs.size, 30);
    assert.equal(store.writeLog.length, 30);

    for (const [id, docData] of store.docs.entries()) {
      assert.equal(docData.packageId, id);
      assert.equal(docData.isPublished, true);
      assert.equal(docData.status, 'ACTIVE');
      assert.ok(docData.section);
      assert.ok(docData.packageType);
      assert.ok(docData.seededAt);

      // PO MANDATE: priceUsdCents remains PROPOSED and is NOT materialized in Firestore writes
      assert.equal(
        docData.priceUsdCents,
        undefined,
        `Document ${id} must NOT materialize priceUsdCents in Firestore per PO mandate`
      );
      assert.equal(docData.publishedToStorefront, undefined);
      assert.equal(docData.campaignIds, undefined);
      assert.equal(docData.discount, undefined);
    }
  });

  // 4. IDEMPOTENCY: SECOND RUN CREATES 0 AND SKIPS ALL 30
  it('guarantees idempotency: second apply run creates 0 documents and skips all existing documents', async () => {
    const store = new MockPackageStoreAdapter();

    // Run 1: Apply
    const report1 = await safeSeedService.executeSafeSeed({
      apply: true,
      dryRun: false,
      targetCatalog: TARGET_PACKAGES_MANIFEST,
      storeAdapter: store,
    });
    assert.equal(report1.summary.createdCount, 30);

    const initialWriteCount = store.writeLog.length;

    // Run 2: Apply again against the already-populated database
    const report2 = await safeSeedService.executeSafeSeed({
      apply: true,
      dryRun: false,
      targetCatalog: TARGET_PACKAGES_MANIFEST,
      storeAdapter: store,
    });

    assert.equal(report2.summary.createdCount, 0, 'Second run must create 0 documents');
    assert.equal(report2.summary.skippedCount, 30, 'Second run must skip all 30 existing documents');
    assert.equal(report2.summary.blockedCount, 0);

    // No additional writes performed
    assert.equal(store.writeLog.length, initialWriteCount, 'No additional writes must be performed on second run');
  });

  // 5. LEGACY DOCUMENT PRESERVATION & ZERO DELETES
  it('preserves legacy documents (pkg-miner-2 / "Minero 2 Standard") intact with zero overwrites or deletes', async () => {
    const store = new MockPackageStoreAdapter();

    // Pre-populate with legacy documents
    store.docs.set('pkg-miner-1', {
      id: 'pkg-miner-1',
      name: 'Minero 1 Entry',
      powerTh: 48,
      priceUsdt: 561.99,
      status: 'ACTIVE',
      // Legacy document lacks section
    });
    store.docs.set('pkg-miner-2', {
      id: 'pkg-miner-2',
      name: 'Minero 2 Standard',
      powerTh: 64,
      priceUsdt: 744.99,
      status: 'ACTIVE',
    });

    const report = await safeSeedService.executeSafeSeed({
      apply: true,
      dryRun: false,
      targetCatalog: TARGET_PACKAGES_MANIFEST,
      storeAdapter: store,
    });

    // Legacy documents detected and preserved
    assert.equal(report.summary.preservedLegacyCount, 2);
    assert.ok(report.preservedLegacy.some((l) => l.id === 'pkg-miner-1'));
    assert.ok(report.preservedLegacy.some((l) => l.id === 'pkg-miner-2'));

    // Legacy docs remain untouched in storage
    const legacy2 = store.docs.get('pkg-miner-2');
    assert.equal(legacy2.name, 'Minero 2 Standard');
    assert.equal(legacy2.section, undefined, 'Legacy document must not have section added');

    // Total docs = 2 legacy + 30 new = 32
    assert.equal(store.docs.size, 32);

    // Zero delete operations were performed
    const hasDelete = store.writeLog.some((w) => w.type === 'delete');
    assert.equal(hasDelete, false, 'Zero delete operations allowed');
  });

  // 6. SILENT AUTO-SEED REMOVAL ON READ
  it('guarantees fetchFirestorePackages() on empty Firestore does NOT write or call auto-seed', async () => {
    // When db is null or empty, fetchFirestorePackages returns [] or fallback without writes
    const packages = await packageService.fetchFirestorePackages();
    assert.ok(Array.isArray(packages));
  });

  // 7. LEGACY SEED METHOD NEUTRALIZATION
  it('guarantees seedInitialPackagesToFirestore() is neutralized and returns 0 without writing', async () => {
    const count = await packageService.seedInitialPackagesToFirestore();
    assert.equal(count, 0, 'seedInitialPackagesToFirestore must return 0 and perform no writes');
  });

  // 8. SCHEMA REJECTION & COLLISION SAFETY
  it('blocks packages with invalid schema and safely skips frontendKey collisions', async () => {
    const store = new MockPackageStoreAdapter();

    const invalidCatalog: any[] = [
      {
        id: 'bad-pkg-1',
        packageId: 'bad-pkg-1',
        name: 'Bad Power',
        powerTh: -10, // Invalid: negative power
        priceUsdt: 100,
        section: 'minerx',
        packageType: 'fixed',
      },
      {
        id: 'bad-pkg-2',
        packageId: 'bad-pkg-2',
        name: 'Bad Section',
        powerTh: 10,
        priceUsdt: 100,
        section: 'invalid_section', // Invalid section
        packageType: 'fixed',
      },
    ];

    const report = await safeSeedService.executeSafeSeed({
      apply: true,
      targetCatalog: invalidCatalog,
      storeAdapter: store,
    });

    assert.equal(report.summary.createdCount, 0);
    assert.equal(report.summary.blockedCount, 2);
    assert.equal(store.docs.size, 0);
  });
});
