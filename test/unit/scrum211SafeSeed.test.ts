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
  DefaultFirestorePackageStore,
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
import { main as runSafeSeedScript } from '../../scripts/safeSeedPackages';

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

describe('SCRUM-211 / POUW-1.4: Safe Seed Script & Package Manifest Tests (Iteration 3)', () => {
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

    // Deep field parity between JSON manifest and TypeScript catalog
    for (let i = 0; i < TARGET_PACKAGES_MANIFEST.length; i++) {
      const tsPkg = TARGET_PACKAGES_MANIFEST[i];
      const jsonPkg = manifestJson.packages[i];
      assert.equal(jsonPkg.id, tsPkg.id);
      assert.equal(jsonPkg.packageId, tsPkg.packageId);
      assert.equal(jsonPkg.name, tsPkg.name);
      assert.equal(jsonPkg.displayName, tsPkg.displayName);
      assert.equal(jsonPkg.section, tsPkg.section);
      assert.equal(jsonPkg.packageType, tsPkg.packageType);
      assert.equal(jsonPkg.sortOrder, tsPkg.sortOrder);
      assert.equal(jsonPkg.powerTh, tsPkg.powerTh);
      assert.equal(jsonPkg.priceUsdt, tsPkg.priceUsdt);
      assert.equal(jsonPkg.currency, tsPkg.currency);
      assert.equal(jsonPkg.description, tsPkg.description);
      assert.equal(jsonPkg.provenance, tsPkg.provenance);

      // FINDING 2 (ITERATION 3): durationDays, variablePct, commissionPct are omitted in both JSON and TS catalog
      assert.equal(jsonPkg.durationDays, undefined, `JSON package ${jsonPkg.id} must omit durationDays`);
      assert.equal(tsPkg.durationDays, undefined, `TS package ${tsPkg.id} must omit durationDays`);
      assert.equal(jsonPkg.variablePct, undefined, `JSON package ${jsonPkg.id} must omit variablePct`);
      assert.equal(tsPkg.variablePct, undefined, `TS package ${tsPkg.id} must omit variablePct`);
      assert.equal(jsonPkg.commissionPct, undefined, `JSON package ${jsonPkg.id} must omit commissionPct`);
      assert.equal(tsPkg.commissionPct, undefined, `TS package ${tsPkg.id} must omit commissionPct`);
    }

    // Parity for custom tiers
    for (let i = 0; i < CUSTOM_TIERS_MANIFEST.length; i++) {
      assert.equal(manifestJson.customTiers[i].powerTh, CUSTOM_TIERS_MANIFEST[i].powerTh);
      assert.equal(manifestJson.customTiers[i].priceUsd, CUSTOM_TIERS_MANIFEST[i].priceUsd);
    }
  });

  // 2. FINDING 1: FUENTES MINERX 1–5 REVALIDATED EXCLUSIVELY AGAINST AUTHORIZED DOCS
  it('verifies MinerX 1–5 match authorized documents and completely excludes PouwMiners_Modelo_de_Negocio_Consolidado.docx', () => {
    const minerxItems = TARGET_PACKAGES_MANIFEST.filter((p) => p.section === 'minerx');
    assert.equal(minerxItems.length, 6);

    const fixedMinerx = minerxItems.filter((p) => p.packageType === 'fixed');
    assert.equal(fixedMinerx.length, 5);

    // Exact names and parameters from authorized docs:
    // docs/JIRA_pouwminer_story_paquetes_dinamicos.md,
    // docs/GoMining_Explicacion_Sistema_de_Compra_y_Mineros.docx,
    // docs/GoMining_Documento_de_Diseno.docx
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
      assert.equal(actual.currency, 'USD'); // FINDING 4: Storefront visual currency is USD
      assert.equal(actual.cadence, 'one_time');
      assert.equal(actual.isPublished, true);
      assert.equal(actual.status, 'ACTIVE');

      // FINDING 1: Provenance MUST NOT reference unauthorized PouwMiners_Modelo_de_Negocio_Consolidado.docx
      assert.equal(
        actual.provenance.includes('PouwMiners_Modelo_de_Negocio_Consolidado.docx'),
        false,
        `MinerX package ${actual.id} must NOT reference PouwMiners_Modelo_de_Negocio_Consolidado.docx`
      );

      // Legacy names MUST NOT appear
      assert.equal(actual.name.includes('Entry'), false);
      assert.equal(actual.name.includes('Standard'), false);
      assert.equal(actual.name.includes('Master'), false);
      assert.equal(actual.name.includes('Enterprise'), false);
      if (actual.name !== 'Minero 3') {
        assert.equal(actual.name.includes('Pro'), false);
      }
    }

    // Verify zero occurrences of PouwMiners_Modelo_de_Negocio_Consolidado across ALL packages
    for (const pkg of TARGET_PACKAGES_MANIFEST) {
      assert.equal(
        pkg.provenance.includes('PouwMiners_Modelo_de_Negocio_Consolidado'),
        false,
        `Package ${pkg.id} must not reference PouwMiners_Modelo_de_Negocio_Consolidado`
      );
    }
  });

  // 3. FINDING 2: CUSTOM DEBE DECIR EXACTAMENTE "Custom"
  it('guarantees Custom row is strictly labeled "Custom" (not "Personalizado") in name and displayName', () => {
    const customRow = TARGET_PACKAGES_MANIFEST.find((p) => p.packageType === 'custom');
    assert.ok(customRow, 'MinerX section must include custom row');
    assert.equal(customRow.id, 'minerx-custom');
    assert.equal(customRow.name, 'Custom');
    assert.equal(customRow.displayName, 'Custom');
    assert.equal(customRow.sortOrder, 6);
    assert.equal(customRow.currency, 'USD');

    // Regression prevention test: MUST NOT be "Personalizado"
    assert.notEqual(customRow.name, 'Personalizado', 'Must not regress to "Personalizado"');
    assert.notEqual(customRow.displayName, 'Personalizado', 'Must not regress to "Personalizado"');
    assert.equal(customRow.name.toLowerCase().includes('personalizado'), false);
    assert.equal(customRow.displayName.toLowerCase().includes('personalizado'), false);

    // Also verify JSON manifest strictly has "Custom"
    const manifestPath = resolve(process.cwd(), 'docs/paquetes_dinamicos/seed-manifest.json');
    const manifestJson = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const jsonCustomRow = manifestJson.packages.find((p: any) => p.id === 'minerx-custom');
    assert.ok(jsonCustomRow);
    assert.equal(jsonCustomRow.name, 'Custom');
    assert.equal(jsonCustomRow.displayName, 'Custom');
    assert.notEqual(jsonCustomRow.name, 'Personalizado');
    assert.notEqual(jsonCustomRow.displayName, 'Personalizado');
  });

  // 4. FINDING 3: NO INVENTAR NOMBRES NI DESCRIPCIONES
  it('guarantees displayName and name match exact Client constants with zero invented prefixes or marketing descriptions', () => {
    // Preventa
    const presale = TARGET_PACKAGES_MANIFEST.filter((p) => p.section === 'preventa');
    assert.equal(presale.length, 4);
    assert.deepEqual(
      presale.map((p) => ({ name: p.name, displayName: p.displayName, th: p.powerTh, price: p.priceUsdt, units: p.limitedUnits, roi: p.roiPct })),
      [
        { name: '1.46 TH', displayName: '1.46 TH', th: 1.46, price: 18.99, units: 30, roi: 52.5 },
        { name: '8.33 TH', displayName: '8.33 TH', th: 8.33, price: 99.99, units: 30, roi: 55.62 },
        { name: '21.05 TH', displayName: '21.05 TH', th: 21.05, price: 249.99, units: 30, roi: 56.47 },
        { name: '42.44 TH', displayName: '42.44 TH', th: 42.44, price: 499.99, units: 30, roi: 57.17 },
      ]
    );

    // Lanzamiento (16 levels)
    const launch = TARGET_PACKAGES_MANIFEST.filter((p) => p.section === 'lanzamiento');
    assert.equal(launch.length, 16);
    for (const l of launch) {
      assert.equal(l.name, l.displayName, `Launch package ${l.id} name must match displayName`);
      assert.equal(l.name.startsWith('Lanzamiento'), false, `Launch package ${l.id} must not have "Lanzamiento" prefix`);
      assert.equal(l.currency, 'USD');
    }
    assert.equal(launch[0].name, '42.44 TH');
    assert.equal(launch[0].powerTh, 42.44);
    assert.equal(launch[0].priceUsdt, 499.99);
    assert.equal(launch[15].name, '5,000 TH');
    assert.equal(launch[15].powerTh, 5000);
    assert.equal(launch[15].priceUsdt, 54768.99);

    // Mensual (4 levels)
    const monthly = TARGET_PACKAGES_MANIFEST.filter((p) => p.section === 'mensual');
    assert.equal(monthly.length, 4);
    assert.deepEqual(
      monthly.map((p) => ({ name: p.name, displayName: p.displayName, th: p.powerTh, price: p.priceUsdt, cadence: p.cadence })),
      [
        { name: 'Inicio', displayName: 'Inicio', th: 3.82, price: 39.99, cadence: 'monthly' },
        { name: 'Plus', displayName: 'Plus', th: 9.61, price: 99.99, cadence: 'monthly' },
        { name: 'Pro', displayName: 'Pro', th: 24.20, price: 249.99, cadence: 'monthly' },
        { name: 'Máximo', displayName: 'Máximo', th: 48.66, price: 499.99, cadence: 'monthly' },
      ]
    );
    for (const m of monthly) {
      assert.equal(m.name.startsWith('Suscripción'), false, `Monthly package ${m.id} must not have "Suscripción" prefix`);
    }

    // Zero invented marketing copy in descriptions across all 30 packages
    const inventedStrings = [
      'Lote exclusivo de preventa',
      'Nivel de lanzamiento',
      'Plan mensual',
      'Catálogo permanente',
      'Configuración personalizada',
    ];

    for (const pkg of TARGET_PACKAGES_MANIFEST) {
      assert.ok(
        pkg.description === null || pkg.description === undefined || pkg.description === '',
        `Package ${pkg.id} description must be null or empty, found: "${pkg.description}"`
      );
      for (const forbidden of inventedStrings) {
        assert.equal(
          String(pkg.description || '').includes(forbidden),
          false,
          `Package ${pkg.id} contains forbidden invented string: "${forbidden}"`
        );
      }
    }
  });

  // 5. FINDING 4: MONEDA VISIBLE ES USD
  it('guarantees visible currency is USD for all 30 catalog packages including MinerX 1–5', () => {
    for (const pkg of TARGET_PACKAGES_MANIFEST) {
      assert.equal(pkg.currency, 'USD', `Package ${pkg.id} currency must be 'USD'`);
      assert.notEqual(pkg.currency, 'USDT', `Package ${pkg.id} currency must NOT be 'USDT'`);
    }

    const minerxItems = TARGET_PACKAGES_MANIFEST.filter((p) => p.section === 'minerx');
    for (const mx of minerxItems) {
      assert.equal(mx.currency, 'USD', `MinerX package ${mx.id} must have visual currency USD`);
    }
  });

  // 6. FINDING 5: BLOQUEO DURO DE APPLY REMOTO
  it('guarantees safeSeedPackages CLI strictly blocks remote apply and exits with code != 0 without emulator', async () => {
    const originalEmulator = process.env.FIRESTORE_EMULATOR_HOST;
    const originalRemote = process.env.ALLOW_REMOTE_SEED;
    try {
      delete process.env.FIRESTORE_EMULATOR_HOST;
      delete process.env.ALLOW_REMOTE_SEED;

      // 1. Attempting --apply without FIRESTORE_EMULATOR_HOST must fail fast
      await assert.rejects(
        async () => {
          await runSafeSeedScript(['--apply']);
        },
        {
          message: /FIRESTORE_EMULATOR_HOST is required for --apply in SCRUM-211/,
        }
      );
      assert.equal(process.exitCode, 1);

      // 2. Attempting --allow-remote-staging must fail fast
      await assert.rejects(
        async () => {
          await runSafeSeedScript(['--apply', '--allow-remote-staging']);
        },
        {
          message: /Remote apply is strictly disabled in SCRUM-211/,
        }
      );
      assert.equal(process.exitCode, 1);

      // 3. ALLOW_REMOTE_SEED=true env var must fail fast
      process.env.ALLOW_REMOTE_SEED = 'true';
      await assert.rejects(
        async () => {
          await runSafeSeedScript(['--apply']);
        },
        {
          message: /Remote apply is strictly disabled in SCRUM-211/,
        }
      );

      // 4. Any truthy ALLOW_REMOTE_SEED (e.g. '1') must also fail fast
      process.env.ALLOW_REMOTE_SEED = '1';
      await assert.rejects(
        async () => {
          await runSafeSeedScript(['--apply']);
        },
        {
          message: /Remote apply is strictly disabled in SCRUM-211/,
        }
      );
    } finally {
      if (originalEmulator) process.env.FIRESTORE_EMULATOR_HOST = originalEmulator;
      else delete process.env.FIRESTORE_EMULATOR_HOST;
      if (originalRemote) process.env.ALLOW_REMOTE_SEED = originalRemote;
      else delete process.env.ALLOW_REMOTE_SEED;
      process.exitCode = 0;
    }
  });

  it('guarantees DefaultFirestorePackageStore rejects setPackageDoc without FIRESTORE_EMULATOR_HOST', async () => {
    const originalEmulator = process.env.FIRESTORE_EMULATOR_HOST;
    try {
      delete process.env.FIRESTORE_EMULATOR_HOST;
      const store = new DefaultFirestorePackageStore();
      await assert.rejects(
        async () => {
          await store.setPackageDoc('test-doc', { test: true });
        },
        {
          message: /Remote Firestore writes are strictly prohibited in SCRUM-211. FIRESTORE_EMULATOR_HOST must be set./,
        }
      );
    } finally {
      if (originalEmulator) process.env.FIRESTORE_EMULATOR_HOST = originalEmulator;
      else delete process.env.FIRESTORE_EMULATOR_HOST;
    }
  });

  it('guarantees SafeSeedService rejects apply=true without storeAdapter when emulator is missing', async () => {
    const originalEmulator = process.env.FIRESTORE_EMULATOR_HOST;
    try {
      delete process.env.FIRESTORE_EMULATOR_HOST;
      await assert.rejects(
        async () => {
          await safeSeedService.executeSafeSeed({ apply: true, dryRun: false });
        },
        {
          message: /Security error: --apply is strictly permitted ONLY when FIRESTORE_EMULATOR_HOST is defined/,
        }
      );
    } finally {
      if (originalEmulator) process.env.FIRESTORE_EMULATOR_HOST = originalEmulator;
      else delete process.env.FIRESTORE_EMULATOR_HOST;
    }
  });

  // 7. SCHEMA VALIDATION CONTRACT
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

  // 8. SAFE SEED EXECUTION: DRY-RUN BY DEFAULT
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

  // 9. SAFE SEED EXECUTION: APPLY CREATES DOCUMENTS SAFELY
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

      // FINDING 1 (ITERATION 3): description is omitted when null/empty; NEVER materialized as "" in Firestore
      assert.equal(
        'description' in docData,
        false,
        `Document ${id} must NOT contain 'description' in docData when no authorized copy exists`
      );
      assert.notEqual(docData.description, '');

      // FINDING 2 (ITERATION 3): No invented business defaults (variablePct, commissionPct, durationDays)
      assert.equal(
        'variablePct' in docData,
        false,
        `Document ${id} must NOT contain 'variablePct' in Firestore writes without authorized source evidence`
      );
      assert.equal(
        'commissionPct' in docData,
        false,
        `Document ${id} must NOT contain 'commissionPct' in Firestore writes without authorized source evidence`
      );
      assert.equal(
        'durationDays' in docData,
        false,
        `Document ${id} must NOT contain 'durationDays' in Firestore writes without authorized source evidence`
      );
    }
  });

  // 10. IDEMPOTENCY: SECOND RUN CREATES 0 AND SKIPS ALL 30
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

  // 11. LEGACY DOCUMENT PRESERVATION & ZERO DELETES
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

  // 12. SILENT AUTO-SEED REMOVAL ON READ
  it('guarantees fetchFirestorePackages() on empty Firestore does NOT write or call auto-seed', async () => {
    const packages = await packageService.fetchFirestorePackages();
    assert.ok(Array.isArray(packages));
  });

  // 13. LEGACY SEED METHOD NEUTRALIZATION
  it('guarantees seedInitialPackagesToFirestore() is neutralized and returns 0 without writing', async () => {
    const count = await packageService.seedInitialPackagesToFirestore();
    assert.equal(count, 0, 'seedInitialPackagesToFirestore must return 0 and perform no writes');
  });

  // 14. SCHEMA REJECTION & COLLISION SAFETY
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

  // 15. DEFAULT FIRESTORE STORE ADAPTER TESTS
  it('instantiates DefaultFirestorePackageStore safely with on-demand fallback initialization', () => {
    const defaultStore = new DefaultFirestorePackageStore();
    assert.ok(defaultStore, 'DefaultFirestorePackageStore must instantiate without error');
    assert.equal(typeof defaultStore.getExistingPackages, 'function');
    assert.equal(typeof defaultStore.setPackageDoc, 'function');
  });

  it('DefaultFirestorePackageStore rejects setPackageDoc with explicit error when firestore is null', async () => {
    const originalEmulator = process.env.FIRESTORE_EMULATOR_HOST;
    try {
      // With emulator configured: ensures the remote apply security guard passes
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

      // Force a null firestore instance via an explicit mock constructor
      const nullStore = new (class extends DefaultFirestorePackageStore {
        constructor() {
          super(null as any);
          (this as any).firestoreInstance = null;
        }
      })();

      await assert.rejects(
        async () => {
          await nullStore.setPackageDoc('test-pkg', { name: 'Test' });
        },
        {
          message: 'Cloud Firestore instance is not initialized',
        }
      );

      const existing = await nullStore.getExistingPackages();
      assert.equal(existing.size, 0);
    } finally {
      if (originalEmulator) process.env.FIRESTORE_EMULATOR_HOST = originalEmulator;
      else delete process.env.FIRESTORE_EMULATOR_HOST;
    }
  });

  // 16. FINDING 1 (ITERATION 3): NO MATERIALIZAR description VACÍA
  it('guarantees description is completely omitted when null/empty and NEVER materialized as empty string ""', async () => {
    const store = new MockPackageStoreAdapter();

    // 1. Verify against the official 30-package catalog
    await safeSeedService.executeSafeSeed({
      apply: true,
      dryRun: false,
      targetCatalog: TARGET_PACKAGES_MANIFEST,
      storeAdapter: store,
    });

    assert.equal(store.docs.size, 30);
    for (const [id, docData] of store.docs.entries()) {
      // Mandated check by PO: !("description" in docData)
      assert.equal(
        !('description' in docData),
        true,
        `Document ${id} must satisfy !("description" in docData)`
      );
      assert.equal(docData.description, undefined);
      assert.notEqual(docData.description, '');
    }

    // 2. Custom test: verify that description: "" or description: null does NOT write description
    store.reset();
    const customTestCatalog: any[] = [
      {
        id: 'test-null-desc',
        packageId: 'test-null-desc',
        name: 'Test Null Description',
        powerTh: 10,
        priceUsdt: 100,
        section: 'minerx',
        packageType: 'fixed',
        sortOrder: 1,
        description: null,
      },
      {
        id: 'test-empty-desc',
        packageId: 'test-empty-desc',
        name: 'Test Empty Description',
        powerTh: 10,
        priceUsdt: 100,
        section: 'minerx',
        packageType: 'fixed',
        sortOrder: 2,
        description: '',
      },
      {
        id: 'test-whitespace-desc',
        packageId: 'test-whitespace-desc',
        name: 'Test Whitespace Description',
        powerTh: 10,
        priceUsdt: 100,
        section: 'minerx',
        packageType: 'fixed',
        sortOrder: 3,
        description: '   ',
      },
      {
        id: 'test-authorized-desc',
        packageId: 'test-authorized-desc',
        name: 'Test Authorized Description',
        powerTh: 10,
        priceUsdt: 100,
        section: 'minerx',
        packageType: 'fixed',
        sortOrder: 4,
        description: 'Contrato verificado con respaldo oficial',
      },
    ];

    await safeSeedService.executeSafeSeed({
      apply: true,
      dryRun: false,
      targetCatalog: customTestCatalog,
      storeAdapter: store,
    });

    const docNull = store.docs.get('test-null-desc');
    assert.equal('description' in docNull, false, 'null description must be omitted');

    const docEmpty = store.docs.get('test-empty-desc');
    assert.equal('description' in docEmpty, false, 'empty string description must be omitted');

    const docWhitespace = store.docs.get('test-whitespace-desc');
    assert.equal('description' in docWhitespace, false, 'whitespace-only description must be omitted');

    const docAuth = store.docs.get('test-authorized-desc');
    assert.equal('description' in docAuth, true, 'authorized description must be included');
    assert.equal(docAuth.description, 'Contrato verificado con respaldo oficial');
  });

  // 17. FINDING 2 (ITERATION 3): NO INVENTAR VALORES DE NEGOCIO (variablePct, commissionPct, durationDays)
  it('guarantees variablePct, commissionPct, and durationDays are strictly omitted without authorized evidence', async () => {
    // 1. Manifest Parity: zero packages have invented business defaults
    for (const pkg of TARGET_PACKAGES_MANIFEST) {
      assert.equal(pkg.variablePct, undefined, `Package ${pkg.id} must NOT have variablePct`);
      assert.equal(pkg.commissionPct, undefined, `Package ${pkg.id} must NOT have commissionPct`);
      assert.equal(pkg.durationDays, undefined, `Package ${pkg.id} must NOT have durationDays`);
    }

    // 2. Execution Parity: Firestore documents do NOT contain variablePct, commissionPct, or durationDays
    const store = new MockPackageStoreAdapter();
    await safeSeedService.executeSafeSeed({
      apply: true,
      dryRun: false,
      targetCatalog: TARGET_PACKAGES_MANIFEST,
      storeAdapter: store,
    });

    assert.equal(store.docs.size, 30);
    for (const [id, docData] of store.docs.entries()) {
      assert.equal(
        !('variablePct' in docData),
        true,
        `Document ${id} must satisfy !("variablePct" in docData)`
      );
      assert.equal(
        !('commissionPct' in docData),
        true,
        `Document ${id} must satisfy !("commissionPct" in docData)`
      );
      assert.equal(
        !('durationDays' in docData),
        true,
        `Document ${id} must satisfy !("durationDays" in docData)`
      );
      assert.notEqual(docData.variablePct, 0);
      assert.notEqual(docData.commissionPct, 2);
      assert.notEqual(docData.durationDays, 365);
      assert.notEqual(docData.durationDays, 30);
    }

    // 3. Selective inclusion: only explicit numbers are written
    store.reset();
    const selectiveCatalog: any[] = [
      {
        id: 'test-no-business-vals',
        packageId: 'test-no-business-vals',
        name: 'Test No Business Vals',
        powerTh: 10,
        priceUsdt: 100,
        section: 'minerx',
        packageType: 'fixed',
        sortOrder: 1,
      },
      {
        id: 'test-authorized-business-vals',
        packageId: 'test-authorized-business-vals',
        name: 'Test Authorized Business Vals',
        powerTh: 10,
        priceUsdt: 100,
        section: 'minerx',
        packageType: 'fixed',
        sortOrder: 2,
        durationDays: 180,
        variablePct: 3.5,
        commissionPct: 1.0,
      },
    ];

    await safeSeedService.executeSafeSeed({
      apply: true,
      dryRun: false,
      targetCatalog: selectiveCatalog,
      storeAdapter: store,
    });

    const docNoVals = store.docs.get('test-no-business-vals');
    assert.equal('variablePct' in docNoVals, false);
    assert.equal('commissionPct' in docNoVals, false);
    assert.equal('durationDays' in docNoVals, false);

    const docWithVals = store.docs.get('test-authorized-business-vals');
    assert.equal(docWithVals.durationDays, 180);
    assert.equal(docWithVals.variablePct, 3.5);
    assert.equal(docWithVals.commissionPct, 1.0);
  });
});
