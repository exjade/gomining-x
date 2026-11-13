import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runRemoteSeed,
  validateManifest,
  buildCanonicalPackagePayload,
  verifyStorefrontCatalog,
} from '../../scripts/remoteSeedPackages.js';
import {
  TARGET_PACKAGES_MANIFEST,
} from '../../src/data/seedManifest.js';

/**
 * Mock Catalog Store Adapter to test create-only semantics in isolation.
 * Strictly records every operation and traps forbidden mutations (update/merge/delete).
 */
class MockCatalogStoreAdapter {
  public docs = new Map<string, any>();
  public calls: Array<{ method: string; id?: string; payload?: any }> = [];

  constructor(initialDocs?: Map<string, any>) {
    if (initialDocs) {
      for (const [k, v] of initialDocs.entries()) {
        this.docs.set(k, { ...v });
      }
    }
  }

  async getExistingPackages(): Promise<Map<string, any>> {
    this.calls.push({ method: 'getExistingPackages' });
    const copy = new Map<string, any>();
    for (const [k, v] of this.docs.entries()) {
      copy.set(k, { ...v });
    }
    return copy;
  }

  async getPackages(): Promise<any[]> {
    this.calls.push({ method: 'getPackages' });
    return Array.from(this.docs.values());
  }

  async createPackageDoc(id: string, payload: any): Promise<void> {
    this.calls.push({ method: 'createPackageDoc', id, payload });
    if (this.docs.has(id)) {
      const err: any = new Error(`ALREADY_EXISTS: Document '${id}' already exists.`);
      err.code = 6;
      throw err;
    }
    this.docs.set(id, { ...payload });
  }

  // Traps for forbidden mutations
  async updatePackageDoc(id: string, payload: any): Promise<void> {
    this.calls.push({ method: 'updatePackageDoc', id, payload });
    throw new Error('Forbidden mutation: updatePackageDoc invoked');
  }

  async deletePackageDoc(id: string): Promise<void> {
    this.calls.push({ method: 'deletePackageDoc', id });
    throw new Error('Forbidden mutation: deletePackageDoc invoked');
  }

  async setPackage(id: string, payload: any): Promise<void> {
    this.calls.push({ method: 'setPackage', id, payload });
    throw new Error('Forbidden mutation: setPackage invoked');
  }
}

describe('SCRUM-224 / POUW-1.9: Remote Seed Manifest Validation', () => {
  it('TARGET_PACKAGES_MANIFEST contains exactly 29 packages total', () => {
    assert.equal(TARGET_PACKAGES_MANIFEST.length, 29);
  });

  it('section breakdown matches exactly: 5 MinerX, 4 Preventa, 16 Lanzamiento, 4 Mensual', () => {
    const counts: Record<string, number> = {
      minerx: 0,
      preventa: 0,
      lanzamiento: 0,
      mensual: 0,
    };

    for (const pkg of TARGET_PACKAGES_MANIFEST) {
      counts[pkg.section] = (counts[pkg.section] || 0) + 1;
    }

    assert.equal(counts.minerx, 5, 'minerx section count must be 5');
    assert.equal(counts.preventa, 4, 'preventa section count must be 4');
    assert.equal(counts.lanzamiento, 16, 'lanzamiento section count must be 16');
    assert.equal(counts.mensual, 4, 'mensual section count must be 4');
    assert.equal(
      counts.minerx + counts.preventa + counts.lanzamiento + counts.mensual,
      29,
      'sum of section counts must equal 29'
    );
  });

  it('validateManifest passes with canonical manifest', () => {
    assert.doesNotThrow(() => {
      validateManifest(TARGET_PACKAGES_MANIFEST);
    });
  });

  it('validateManifest fails fast if package count is not 29 or section counts mismatch', () => {
    // Fewer than 29 items
    const incomplete = TARGET_PACKAGES_MANIFEST.slice(0, 28);
    assert.throws(
      () => validateManifest(incomplete),
      /Manifest validation failed: expected exactly 29 packages/
    );

    // 29 items but distorted section distribution
    const distorted = [
      ...TARGET_PACKAGES_MANIFEST.slice(0, 28),
      { ...TARGET_PACKAGES_MANIFEST[0], section: 'minerx' as const }, // replaces a mensual item with minerx
    ];
    assert.throws(
      () => validateManifest(distorted),
      /Manifest distribution mismatch for section/
    );
  });

  it('every manifest package complies with canonical schema (status ACTIVE, isPublished true, valid sortOrder, powerTh, priceUsdt)', () => {
    for (const pkg of TARGET_PACKAGES_MANIFEST) {
      assert.ok(pkg.id && typeof pkg.id === 'string' && pkg.id.trim().length > 0, `Package ${pkg.id} missing valid id`);
      assert.ok(pkg.name && typeof pkg.name === 'string', `Package ${pkg.id} missing name`);
      assert.ok(typeof pkg.powerTh === 'number' && pkg.powerTh > 0, `Package ${pkg.id} powerTh must be > 0`);
      assert.ok(typeof pkg.priceUsdt === 'number' && pkg.priceUsdt > 0, `Package ${pkg.id} priceUsdt must be > 0`);
      assert.ok(typeof pkg.sortOrder === 'number' && pkg.sortOrder >= 0, `Package ${pkg.id} sortOrder must be non-negative`);

      const payload = buildCanonicalPackagePayload(pkg, '2026-11-13T16:00:00.000Z');
      assert.equal(payload.status, 'ACTIVE', `Package ${pkg.id} must be ACTIVE`);
      assert.equal(payload.isPublished, true, `Package ${pkg.id} must be isPublished: true`);
      assert.equal(payload.currency, pkg.currency, `Package ${pkg.id} currency must match manifest`);
      assert.equal(
        payload.priceUsdCents,
        undefined,
        `Package ${pkg.id} must NOT materialize priceUsdCents to Firestore (remains PROPOSED)`
      );
    }
  });
});

describe('SCRUM-224 / POUW-1.9: Create-Only Semantics & Adapter Mock', () => {
  it('creates all 29 missing packages when remote collection is empty', async () => {
    const adapter = new MockCatalogStoreAdapter();

    const summary = await runRemoteSeed({ dryRun: false, adapter });

    assert.equal(summary.total, 29);
    assert.equal(summary.created, 29);
    assert.equal(summary.skipped, 0);
    assert.equal(summary.blocked, 0);
    assert.equal(summary.legacyPreserved, 0);
    assert.equal(summary.missingIds.length, 29);
    assert.equal(summary.existingIds.length, 0);
    assert.equal(adapter.docs.size, 29);

    // Verify all 29 write calls used createPackageDoc
    const createCalls = adapter.calls.filter((c) => c.method === 'createPackageDoc');
    assert.equal(createCalls.length, 29);

    // Verify zero forbidden mutations
    const forbiddenCalls = adapter.calls.filter((c) =>
      ['updatePackageDoc', 'deletePackageDoc', 'setPackage'].includes(c.method)
    );
    assert.equal(forbiddenCalls.length, 0, 'No delete, update, or set calls allowed');
  });

  it('skips existing packages (never overwrites) and creates only missing ones', async () => {
    const preExistingDocs = new Map<string, any>();

    // Pre-populate with all 5 minerx packages with a distinct sentinel property
    const minerxPackages = TARGET_PACKAGES_MANIFEST.filter((p) => p.section === 'minerx');
    for (const pkg of minerxPackages) {
      preExistingDocs.set(pkg.id, {
        id: pkg.id,
        name: pkg.name,
        section: pkg.section,
        _sentinelPreserved: true,
      });
    }

    // Also include a legacy document
    preExistingDocs.set('pkg-miner-legacy-v1', {
      id: 'pkg-miner-legacy-v1',
      name: 'Legacy Antminer S19',
      isLegacy: true,
    });

    const adapter = new MockCatalogStoreAdapter(preExistingDocs);

    const summary = await runRemoteSeed({ dryRun: false, adapter });

    assert.equal(summary.total, 29);
    assert.equal(summary.created, 24); // 29 - 5 = 24
    assert.equal(summary.skipped, 5);
    assert.equal(summary.blocked, 0);
    assert.equal(summary.legacyPreserved, 1);
    assert.equal(summary.existingIds.length, 5);
    assert.equal(summary.missingIds.length, 24);

    // Total docs = 29 canonical + 1 legacy = 30
    assert.equal(adapter.docs.size, 30);

    // Verify existing packages were NOT overwritten (sentinel intact)
    for (const pkg of minerxPackages) {
      const stored = adapter.docs.get(pkg.id);
      assert.equal(stored._sentinelPreserved, true, `Package ${pkg.id} must not be overwritten`);
    }

    // Verify legacy document is untouched
    const legacyDoc = adapter.docs.get('pkg-miner-legacy-v1');
    assert.ok(legacyDoc, 'Legacy document must be preserved');
    assert.equal(legacyDoc.name, 'Legacy Antminer S19');

    // Verify zero deletes or updates
    const forbiddenCalls = adapter.calls.filter((c) =>
      ['updatePackageDoc', 'deletePackageDoc', 'setPackage'].includes(c.method)
    );
    assert.equal(forbiddenCalls.length, 0);
  });

  it('is 100% idempotent: re-running with all 29 packages results in 0 created, 29 skipped, 0 blocked', async () => {
    const allExistingDocs = new Map<string, any>();
    for (const pkg of TARGET_PACKAGES_MANIFEST) {
      allExistingDocs.set(pkg.id, buildCanonicalPackagePayload(pkg));
    }

    const adapter = new MockCatalogStoreAdapter(allExistingDocs);

    const summary = await runRemoteSeed({ dryRun: false, adapter });

    assert.equal(summary.total, 29);
    assert.equal(summary.created, 0, 'Re-run must create 0 packages');
    assert.equal(summary.skipped, 29, 'Re-run must skip all 29 packages');
    assert.equal(summary.blocked, 0);
    assert.equal(summary.existingIds.length, 29);
    assert.equal(summary.missingIds.length, 0);

    // Zero write operations of any kind
    const writeCalls = adapter.calls.filter((c) =>
      ['createPackageDoc', 'updatePackageDoc', 'deletePackageDoc', 'setPackage'].includes(c.method)
    );
    assert.equal(writeCalls.length, 0, 'Idempotent re-run must execute zero write operations');
  });

  it('strictly verifies zero deletes and zero updates/merges under all conditions', async () => {
    const adapter = new MockCatalogStoreAdapter();

    // Run first apply
    await runRemoteSeed({ dryRun: false, adapter });
    // Run second apply (idempotency)
    await runRemoteSeed({ dryRun: false, adapter });

    const deleteOrUpdateCalls = adapter.calls.filter((c) =>
      ['updatePackageDoc', 'deletePackageDoc', 'setPackage'].includes(c.method)
    );
    assert.equal(deleteOrUpdateCalls.length, 0, 'Must have zero delete, update, or set calls');
  });

  it('dry-run mode identifies existing vs missing without executing any writes', async () => {
    const partialDocs = new Map<string, any>();
    // 4 preventa packages pre-existing
    const preventaPackages = TARGET_PACKAGES_MANIFEST.filter((p) => p.section === 'preventa');
    for (const pkg of preventaPackages) {
      partialDocs.set(pkg.id, buildCanonicalPackagePayload(pkg));
    }

    const adapter = new MockCatalogStoreAdapter(partialDocs);

    const summary = await runRemoteSeed({ dryRun: true, adapter });

    assert.equal(summary.total, 29);
    assert.equal(summary.created, 25); // 29 - 4
    assert.equal(summary.skipped, 4);
    assert.equal(summary.blocked, 0);

    // Adapter state is unchanged: still exactly 4 documents
    assert.equal(adapter.docs.size, 4);

    // Zero write operations recorded
    const writeCalls = adapter.calls.filter((c) =>
      ['createPackageDoc', 'updatePackageDoc', 'deletePackageDoc', 'setPackage'].includes(c.method)
    );
    assert.equal(writeCalls.length, 0, 'Dry-run must not execute any writes');
  });

  it('treats ALREADY_EXISTS error at database level as skipped, preserving create-only safety', async () => {
    // Adapter that fails createPackageDoc with ALREADY_EXISTS code 6
    const rejectingAdapter = {
      async getExistingPackages() {
        return new Map(); // reports empty
      },
      async createPackageDoc(id: string) {
        const err: any = new Error(`Firestore collision: document '${id}' already exists.`);
        err.code = 6;
        throw err;
      },
    };

    const summary = await runRemoteSeed({ dryRun: false, adapter: rejectingAdapter });

    assert.equal(summary.total, 29);
    assert.equal(summary.created, 0);
    assert.equal(summary.skipped, 29, 'Collisions at DB level must be gracefully counted as skipped');
    assert.equal(summary.blocked, 0);
  });
});

describe('SCRUM-224 / POUW-1.9: Real HTTP GET Storefront Verification', () => {
  it('executes real HTTP GET requests against Express app to verify all 4 canonical sections (5/4/16/4 = 29 total, 0 legacy)', async () => {
    const allDocs = new Map<string, any>();
    for (const pkg of TARGET_PACKAGES_MANIFEST) {
      allDocs.set(pkg.id, buildCanonicalPackagePayload(pkg));
    }
    // Also include a legacy package in the store to verify it does not leak into storefront
    allDocs.set('pkg-miner-1', {
      id: 'pkg-miner-1',
      name: 'Legacy Minero 1',
      isLegacy: true,
      priceUsdt: 561.99,
      powerTh: 48,
    });

    const adapter = new MockCatalogStoreAdapter(allDocs);
    const report = await verifyStorefrontCatalog(adapter);

    assert.equal(report.pass, true, `Verification failed with errors: ${report.errors.join('; ')}`);
    assert.equal(report.totalCanonical, 29);
    assert.equal(report.legacyCount, 0);
    assert.equal(report.sections.minerx.actualCount, 5);
    assert.equal(report.sections.preventa.actualCount, 4);
    assert.equal(report.sections.lanzamiento.actualCount, 16);
    assert.equal(report.sections.mensual.actualCount, 4);
    assert.equal(report.errors.length, 0);

    // Verify sortOrder ascending for each section
    for (const sec of ['minerx', 'preventa', 'lanzamiento', 'mensual'] as const) {
      const pkgs = report.sections[sec].packages;
      for (let i = 1; i < pkgs.length; i++) {
        assert.ok((pkgs[i].sortOrder ?? 0) >= (pkgs[i - 1].sortOrder ?? 0), `Section ${sec} sortOrder must be non-decreasing`);
      }
    }
  });

  it('detects and fails verification via HTTP when a section count is mismatched', async () => {
    // Populate with only 28 packages (missing 1 from preventa)
    const incompleteDocs = new Map<string, any>();
    const allExceptOne = TARGET_PACKAGES_MANIFEST.filter((p) => p.id !== 'preventa-01');
    for (const pkg of allExceptOne) {
      incompleteDocs.set(pkg.id, buildCanonicalPackagePayload(pkg));
    }

    const adapter = new MockCatalogStoreAdapter(incompleteDocs);
    const report = await verifyStorefrontCatalog(adapter);

    assert.equal(report.pass, false);
    assert.equal(report.sections.preventa.pass, false);
    assert.equal(report.sections.preventa.actualCount, 3);
    assert.equal(report.sections.preventa.expectedCount, 4);
    assert.ok(report.errors.some((e) => e.includes('count mismatch')));
  });

  it('detects and fails verification when a legacy package leaks into storefront', async () => {
    const docsWithLeak = new Map<string, any>();
    for (const pkg of TARGET_PACKAGES_MANIFEST) {
      docsWithLeak.set(pkg.id, buildCanonicalPackagePayload(pkg));
    }
    // Leaked legacy package claiming a section
    docsWithLeak.set('pkg-miner-leaked', {
      id: 'pkg-miner-leaked',
      name: 'Leaked Legacy Minero',
      section: 'minerx',
      status: 'ACTIVE',
      isPublished: true,
      priceUsdt: 100,
      powerTh: 10,
      sortOrder: 99,
    });

    const adapter = new MockCatalogStoreAdapter(docsWithLeak);
    const report = await verifyStorefrontCatalog(adapter);

    assert.equal(report.pass, false);
    assert.ok(report.legacyCount > 0);
    assert.ok(report.errors.some((e) => e.includes('Legacy package')));
  });

  it('detects and fails verification when package price, name, or TH mismatches manifest', async () => {
    const docsWithMismatch = new Map<string, any>();
    for (const pkg of TARGET_PACKAGES_MANIFEST) {
      if (pkg.id === 'minerx-01') {
        const altered = buildCanonicalPackagePayload(pkg);
        altered.priceUsdt = 999999;
        docsWithMismatch.set(pkg.id, altered);
      } else {
        docsWithMismatch.set(pkg.id, buildCanonicalPackagePayload(pkg));
      }
    }

    const adapter = new MockCatalogStoreAdapter(docsWithMismatch);
    const report = await verifyStorefrontCatalog(adapter);

    assert.equal(report.pass, false);
    assert.ok(report.errors.some((e) => e.includes('priceUsdt mismatch')));
  });

  it('supports custom baseUrl option for external or pre-existing HTTP server', async () => {
    const http = await import('node:http');
    const { app } = await import('../../server/server.js');

    const allDocs = new Map<string, any>();
    for (const pkg of TARGET_PACKAGES_MANIFEST) {
      allDocs.set(pkg.id, buildCanonicalPackagePayload(pkg));
    }
    const adapter = new MockCatalogStoreAdapter(allDocs);

    const testServer = http.createServer(app);
    await new Promise<void>((resolve) => {
      testServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = testServer.address() as any;
    const customBaseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const report = await verifyStorefrontCatalog({
        baseUrl: customBaseUrl,
        adapter,
      });

      assert.equal(report.pass, true);
      assert.equal(report.totalCanonical, 29);
      assert.equal(report.legacyCount, 0);
    } finally {
      if (typeof (testServer as any).closeAllConnections === 'function') {
        (testServer as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
  });
});
