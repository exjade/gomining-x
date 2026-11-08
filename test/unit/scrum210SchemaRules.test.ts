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
  CommercialPackageService,
  COMMERCIAL_PACKAGES_COLLECTION,
  deserializeCommercialPackageDoc,
  createPurchaseSnapshot,
  validatePackageSchema,
  INITIAL_PACKAGES,
} from '../../src/services/admin/commercialPackageService.js';
import type {
  CommercialPackage,
  PurchasedPackageSnapshot,
  PurchasedMinerInstance,
} from '../../src/types/admin.js';

describe('SCRUM-210: Firestore Schema, Indexes, Security Rules & Traceability Tests (Iteration 2)', () => {
  const packageService = CommercialPackageService.getInstance();

  it('exports correct canonical collection name and excludes campaigns from scope', () => {
    assert.equal(COMMERCIAL_PACKAGES_COLLECTION, 'commercial_packages');
    // Ensure campaigns collection is out of scope for SCRUM-210
    assert.equal((CommercialPackageService as any).CAMPAIGNS_COLLECTION, undefined);
  });

  it('deserializes raw Firestore document strictly with SCRUM-210 authorized fields', () => {
    const rawDoc = {
      name: 'Minero Preventa 1.46 TH',
      displayName: '1.46 TH',
      section: 'preventa',
      packageType: 'fixed',
      sortOrder: 1,
      frontendKey: 'packages-presale-1',
      source: 'frontend-seed',
      powerTh: 1.46,
      priceUsdt: 18.99,
      priceUsdCents: 1899,
      cadence: 'one_time',
      currency: 'USD',
      dailyBtcText: '0.00000062',
      roiPct: 52.5,
      limitedUnits: 30,
      availableUnits: 30,
      soldUnits: 0,
      durationDays: 365,
      variablePct: 0.0,
      commissionPct: 2.0,
      status: 'ACTIVE',
      isPublished: true,
      version: 1,
      description: 'Lote exclusivo de preventa con 30 cupos.',
      updatedBy: 'admin_sys',
      seededAt: '2026-11-07T00:00:00Z',
      createdAt: '2026-11-07T00:00:00Z',
      updatedAt: '2026-11-07T00:00:00Z',
      // Speculative/promotional fields that should NOT be in the typed schema
      discount: { isActive: true, value: 10 },
      campaignIds: ['camp-1'],
      publishedToStorefront: true,
      finalPriceUsdCents: 1500,
      subscription: { initialTh: 1 },
      custom: { minTh: 1 },
      uiText: { badge: 'hot' },
      maintenanceDiscountPct: { presale: 10 },
      minerTemplateId: 'tmpl-1',
    };

    const pkg = deserializeCommercialPackageDoc('preventa-01', rawDoc);

    // Verified KEEP fields
    assert.equal(pkg.id, 'preventa-01');
    assert.equal(pkg.packageId, 'preventa-01');
    assert.equal(pkg.name, 'Minero Preventa 1.46 TH');
    assert.equal(pkg.displayName, '1.46 TH');
    assert.equal(pkg.section, 'preventa');
    assert.equal(pkg.packageType, 'fixed');
    assert.equal(pkg.sortOrder, 1);
    assert.equal(pkg.frontendKey, 'packages-presale-1');
    assert.equal(pkg.source, 'frontend-seed');
    assert.equal(pkg.powerTh, 1.46);
    assert.equal(pkg.priceUsdCents, 1899);
    assert.equal(pkg.cadence, 'one_time');
    assert.equal(pkg.currency, 'USD');
    assert.equal(pkg.dailyBtcText, '0.00000062');
    assert.equal(pkg.roiPct, 52.5);
    assert.equal(pkg.limitedUnits, 30);
    assert.equal(pkg.availableUnits, 30);
    assert.equal(pkg.soldUnits, 0);
    assert.equal(pkg.status, 'ACTIVE');
    assert.equal(pkg.isPublished, true);
    assert.equal(pkg.version, 1);

    // Verified RETIRED / OUT OF SCOPE fields
    assert.equal((pkg as any).publishedToStorefront, undefined);
    assert.equal((pkg as any).finalPriceUsdCents, undefined);
    assert.equal((pkg as any).discount, undefined);
    assert.equal((pkg as any).campaignIds, undefined);
    assert.equal((pkg as any).subscription, undefined);
    assert.equal((pkg as any).custom, undefined);
    assert.equal((pkg as any).uiText, undefined);
    assert.equal((pkg as any).maintenanceDiscountPct, undefined);
    assert.equal((pkg as any).minerTemplateId, undefined);
    assert.equal((pkg as any).pricePerThCents, undefined);
    assert.equal((pkg as any).priceUsdtCents, undefined);
  });

  it('verifies cadence normalization and packageId alias', () => {
    // When only cadence is given
    const withCadence = deserializeCommercialPackageDoc('pkg-sub-1', {
      name: 'Plan Mensual Inicio',
      powerTh: 3.2,
      priceUsdt: 18.99,
      cadence: 'monthly',
    });
    assert.equal(withCadence.cadence, 'monthly');
    assert.equal(withCadence.packageId, 'pkg-sub-1');

    // Legacy fallback: if old doc has billing, it normalizes into cadence
    const withBilling = deserializeCommercialPackageDoc('pkg-one-1', {
      name: 'Plan Un Solo Pago',
      powerTh: 48,
      priceUsdt: 561.99,
      billing: 'one_time',
    });
    assert.equal(withBilling.cadence, 'one_time');

    // Snapshot retains cadence
    const snapshot = createPurchaseSnapshot(withCadence);
    assert.equal(snapshot.cadence, 'monthly');
  });

  it('maintains backwards compatibility with legacy documents lacking additive fields', () => {
    const legacyDoc = {
      name: 'Legacy Package 1',
      powerTh: 48,
      priceUsdt: 561.99,
      durationDays: 365,
    };

    const pkg = deserializeCommercialPackageDoc('pkg-legacy-1', legacyDoc);

    assert.equal(pkg.id, 'pkg-legacy-1');
    assert.equal(pkg.name, 'Legacy Package 1');
    assert.equal(pkg.powerTh, 48);
    assert.equal(pkg.priceUsdt, 561.99);
    assert.equal(pkg.priceUsdCents, undefined); // priceUsdCents is PROPOSED and NOT auto-inferred
    assert.equal(pkg.status, 'ACTIVE');
    assert.equal(pkg.isPublished, true);
    assert.equal(pkg.version, 1);
    assert.equal(pkg.section, undefined);
  });

  it('validates money integrity: exact integer cents with no floating point double precision loss', () => {
    const testPrices = [
      { usdt: 18.99, expectedCents: 1899 },
      { usdt: 99.99, expectedCents: 9999 },
      { usdt: 249.99, expectedCents: 24999 },
      { usdt: 499.99, expectedCents: 49999 },
      { usdt: 561.99, expectedCents: 56199 },
      { usdt: 744.99, expectedCents: 74499 },
      { usdt: 1111.99, expectedCents: 111199 },
      { usdt: 1474.99, expectedCents: 147499 },
      { usdt: 2201.99, expectedCents: 220199 },
    ];

    for (const { usdt, expectedCents } of testPrices) {
      const cents = Math.round(usdt * 100);
      assert.equal(cents, expectedCents);
      assert.ok(Number.isInteger(cents), `Price in cents for ${usdt} must be an integer`);
    }

    // Validation rejecting float in cents
    const floatValidation = validatePackageSchema({
      name: 'Invalid Money Package',
      powerTh: 10,
      priceUsdt: 100,
      priceUsdCents: 100.5 as any,
    });
    assert.equal(floatValidation.valid, false);
    assert.ok(floatValidation.errors.some(e => e.includes('integer representing cents')));
  });

  it('validates package schema rules via validatePackageSchema', () => {
    // Valid package
    const valid = validatePackageSchema({
      name: 'Minero Válido',
      powerTh: 64,
      priceUsdt: 744.99,
      priceUsdCents: 74499,
      section: 'minerx',
      packageType: 'fixed',
      status: 'ACTIVE',
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.errors.length, 0);

    // Invalid section
    const invalidSection = validatePackageSchema({
      name: 'Invalid Section',
      powerTh: 64,
      priceUsdt: 744.99,
      section: 'invalid_section' as any,
    });
    assert.equal(invalidSection.valid, false);

    // Negative power
    const invalidPower = validatePackageSchema({
      name: 'Invalid Power',
      powerTh: -10,
      priceUsdt: 744.99,
    });
    assert.equal(invalidPower.valid, false);

    // Units validation: soldUnits cannot exceed limitedUnits
    const oversold = validatePackageSchema({
      name: 'Oversold Package',
      powerTh: 10,
      priceUsdt: 50,
      priceUsdCents: 5000,
      limitedUnits: 30,
      soldUnits: 31,
    });
    assert.equal(oversold.valid, false);
    assert.ok(oversold.errors.some(e => e.includes('soldUnits cannot exceed limitedUnits')));

    // Units validation: negative units rejected
    const negativeUnits = validatePackageSchema({
      name: 'Negative Units',
      powerTh: 10,
      priceUsdt: 50,
      priceUsdCents: 5000,
      availableUnits: -5,
    });
    assert.equal(negativeUnits.valid, false);
    assert.ok(negativeUnits.errors.some(e => e.includes('availableUnits cannot be negative')));

    // Rejects package where priceUsdt is missing even if priceUsdCents is provided
    const missingPriceUsdt = validatePackageSchema({
      name: 'Missing priceUsdt',
      powerTh: 20,
      priceUsdCents: 1899,
      limitedUnits: 30,
      soldUnits: 5,
    });
    assert.equal(missingPriceUsdt.valid, false);
    assert.ok(missingPriceUsdt.errors.some(e => e.includes('priceUsdt must be a positive number')));

    // Invalid when both prices missing
    const noPrice = validatePackageSchema({
      name: 'No Price',
      powerTh: 20,
    });
    assert.equal(noPrice.valid, false);
  });

  it('guarantees purchase traceability: snapshot decouples purchased instance from future catalog edits (minerId != packageId)', () => {
    const originalPkg: CommercialPackage = {
      id: 'minerx-01',
      name: 'Minero 1',
      displayName: 'Minero 1 Entry',
      section: 'minerx',
      packageType: 'fixed',
      sortOrder: 1,
      powerTh: 48,
      priceUsdt: 561.99,
      priceUsdCents: 56199,
      currency: 'USD',
      cadence: 'one_time',
      durationDays: 365,
      variablePct: 0.0,
      commissionPct: 2.0,
      dailyBtcText: '0.00002100',
      roiPct: 45.0,
      status: 'ACTIVE',
      isPublished: true,
      version: 1,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    };

    // 1. Capture snapshot at time of user purchase (no discountApplied in SCRUM-210)
    const snapshot = createPurchaseSnapshot(originalPkg, 56199);

    const userMinerInstance: PurchasedMinerInstance = {
      minerId: 'MINER-USER-101',
      uid: 'USR-CLIENT-777',
      packageId: originalPkg.id,
      packageSnapshot: snapshot,
      createdAt: new Date().toISOString(),
    };

    assert.equal(userMinerInstance.packageId, 'minerx-01');
    assert.equal(userMinerInstance.minerId, 'MINER-USER-101');
    assert.notEqual(userMinerInstance.minerId, userMinerInstance.packageId, 'minerId must be distinct from packageId');
    assert.equal(userMinerInstance.packageSnapshot.packageVersion, 1);
    assert.equal(userMinerInstance.packageSnapshot.pricePaidCents, 56199);
    assert.equal(userMinerInstance.packageSnapshot.powerTh, 48);
    assert.equal((userMinerInstance.packageSnapshot as any).discountApplied, undefined);

    // 2. Later, Admin updates the commercial package (new price, different TH, updated name, version 2)
    const modifiedPkg: CommercialPackage = {
      ...originalPkg,
      name: 'Minero 1 Ultra Redesigned',
      powerTh: 60,
      priceUsdt: 699.99,
      priceUsdCents: 69999,
      version: 2,
      updatedAt: '2026-11-15T00:00:00Z',
    };

    // 3. User miner instance snapshot remains strictly unaffected
    assert.equal(userMinerInstance.packageSnapshot.packageVersion, 1);
    assert.equal(userMinerInstance.packageSnapshot.pricePaidCents, 56199);
    assert.equal(userMinerInstance.packageSnapshot.powerTh, 48);
    assert.equal(userMinerInstance.packageSnapshot.packageName, 'Minero 1');
    assert.notEqual(userMinerInstance.packageSnapshot.pricePaidCents, modifiedPkg.priceUsdCents);
    assert.notEqual(userMinerInstance.packageSnapshot.powerTh, modifiedPkg.powerTh);
  });

  it('verifies safe archiving contract: status ARCHIVED and isPublished false preserves package document', () => {
    // Verified concept: Archivar = status 'ARCHIVED' + isPublished false
    // Admin CRUD archivePackage() belongs to SCRUM-217 and is NOT implemented here
    assert.equal((packageService as any).archivePackage, undefined, 'archivePackage CRUD method belongs to SCRUM-217');

    const created = packageService.savePackage({
      name: 'Paquete Para Archivar',
      powerTh: 50,
      priceUsdt: 500,
      durationDays: 365,
      status: 'ACTIVE',
      isPublished: true,
      variablePct: 1,
      commissionPct: 2,
    });

    assert.equal(created.status, 'ACTIVE');
    assert.equal(created.isPublished, true);

    // Toggle archive preserves the document and updates status/isPublished
    packageService.toggleArchive(created.id);
    const archived = packageService.getPackageById(created.id);
    assert.ok(archived, 'Package must remain present in database, not hard-deleted');
    assert.equal(archived.status, 'ARCHIVED');
    assert.equal(archived.isPublished, false);
  });

  it('verifies firestore.indexes.json includes composite indexes for commercial_packages and NO campaigns/storefront duplicates', () => {
    const indexesPath = resolve(process.cwd(), 'firestore.indexes.json');
    const content = JSON.parse(readFileSync(indexesPath, 'utf-8'));
    assert.ok(Array.isArray(content.indexes));

    const packageIndexes = content.indexes.filter((idx: any) => idx.collectionGroup === 'commercial_packages');
    const campaignIndexes = content.indexes.filter((idx: any) => idx.collectionGroup === 'campaigns');

    // Campaigns composite indexes must be completely removed in SCRUM-210
    assert.equal(campaignIndexes.length, 0, 'Campaign indexes must be completely removed (OUT OF SCOPE)');

    // Commercial packages indexes must be present
    assert.ok(packageIndexes.length >= 6, `Expected at least 6 package indexes, found ${packageIndexes.length}`);

    // Must NOT contain publishedToStorefront in any index
    const hasPublishedToStorefront = packageIndexes.some((idx: any) => {
      const paths = idx.fields.map((f: any) => f.fieldPath);
      return paths.includes('publishedToStorefront');
    });
    assert.equal(hasPublishedToStorefront, false, 'No index should reference retired publishedToStorefront');

    // Verify section + isPublished + sortOrder index
    const hasSectionPublishedSort = packageIndexes.some((idx: any) => {
      const paths = idx.fields.map((f: any) => f.fieldPath);
      return paths.length === 3 && paths[0] === 'section' && paths[1] === 'isPublished' && paths[2] === 'sortOrder';
    });
    assert.ok(hasSectionPublishedSort, 'Must have index for section + isPublished + sortOrder');

    // Verify section + sortOrder index
    const hasSectionSort = packageIndexes.some((idx: any) => {
      const paths = idx.fields.map((f: any) => f.fieldPath);
      return paths.length === 2 && paths[0] === 'section' && paths[1] === 'sortOrder';
    });
    assert.ok(hasSectionSort, 'Must have index for section + sortOrder');

    // Verify isPublished + sortOrder index
    const hasPublishedSort = packageIndexes.some((idx: any) => {
      const paths = idx.fields.map((f: any) => f.fieldPath);
      return paths.length === 2 && paths[0] === 'isPublished' && paths[1] === 'sortOrder';
    });
    assert.ok(hasPublishedSort, 'Must have index for isPublished + sortOrder');

    // Verify section + status + sortOrder index
    const hasSectionStatusSort = packageIndexes.some((idx: any) => {
      const paths = idx.fields.map((f: any) => f.fieldPath);
      return paths.length === 3 && paths[0] === 'section' && paths[1] === 'status' && paths[2] === 'sortOrder';
    });
    assert.ok(hasSectionStatusSort, 'Must have index for section + status + sortOrder');

    // Verify section + updatedAt index
    const hasSectionUpdatedAt = packageIndexes.some((idx: any) => {
      const paths = idx.fields.map((f: any) => f.fieldPath);
      return paths.length === 2 && paths[0] === 'section' && paths[1] === 'updatedAt';
    });
    assert.ok(hasSectionUpdatedAt, 'Must have index for section + updatedAt');

    // Verify status + updatedAt index
    const hasStatusUpdatedAt = packageIndexes.some((idx: any) => {
      const paths = idx.fields.map((f: any) => f.fieldPath);
      return paths.length === 2 && paths[0] === 'status' && paths[1] === 'updatedAt';
    });
    assert.ok(hasStatusUpdatedAt, 'Must have index for status + updatedAt');
  });

  it('verifies firestore.rules source-contract: strictly forbids write on miners, requires explicit read/create/update and delete:false', () => {
    const rulesPath = resolve(process.cwd(), 'firestore.rules');
    const rulesContent = readFileSync(rulesPath, 'utf-8');

    // 1. Isolate the match block for /miners/{uid}/miner/{minerId}
    const minerMatchRegex = /match\s+\/miners\/\{uid\}\/miner\/\{minerId\}\s*\{([^}]+)\}/s;
    const minerMatch = rulesContent.match(minerMatchRegex);
    assert.ok(minerMatch, 'Must find match block for /miners/{uid}/miner/{minerId}');
    const minerBlockBody = minerMatch[1];

    // Source-contract check: MUST NOT contain allow write (including allow read, write: or allow write:)
    assert.equal(
      /\ballow\s+[^;:]*\bwrite\b/i.test(minerBlockBody),
      false,
      'SECURITY BUG FIX: /miners/{uid}/miner/{minerId} must NEVER grant "write" (e.g. allow write: or allow read, write:), as write grants delete!'
    );

    // Must explicitly declare read, create, update
    assert.ok(
      /allow\s+read:\s*if\s+isOwner\(uid\)\s*\|\|\s*isAdmin\(\);/.test(minerBlockBody),
      'Must have explicit allow read'
    );
    assert.ok(
      /allow\s+create:\s*if\s+isOwner\(uid\)\s*\|\|\s*isAdmin\(\);/.test(minerBlockBody),
      'Must have explicit allow create'
    );
    assert.ok(
      /allow\s+update:\s*if\s+isOwner\(uid\)\s*\|\|\s*isAdmin\(\);/.test(minerBlockBody),
      'Must have explicit allow update'
    );

    // Must explicitly forbid delete
    assert.ok(
      /allow\s+delete:\s*if\s+false;/.test(minerBlockBody),
      'Must have explicit allow delete: if false;'
    );

    // 2. Commercial packages: public read only if isPublished == true, write requires admin, delete is false
    const packageMatchRegex = /match\s+\/commercial_packages\/\{packageId\}\s*\{([^}]+)\}/s;
    const packageMatch = rulesContent.match(packageMatchRegex);
    assert.ok(packageMatch, 'Must find match block for /commercial_packages/{packageId}');
    const packageBlockBody = packageMatch[1];

    // Must NOT grant write on commercial packages (must separate create, update from delete)
    assert.equal(
      /\ballow\s+[^;:]*\bwrite\b/i.test(packageBlockBody),
      false,
      'Commercial packages must not grant "write" as write permits delete; must use explicit create, update'
    );

    assert.ok(packageBlockBody.includes('resource.data.isPublished == true'));
    assert.equal(packageBlockBody.includes('publishedToStorefront'), false, 'Must not reference retired publishedToStorefront');
    assert.ok(/allow\s+create,\s*update:\s*if\s+isAdmin\(\);/.test(packageBlockBody));
    assert.ok(/allow\s+delete:\s*if\s+false;/.test(packageBlockBody));

    // 3. Campaigns collection must NOT exist in firestore.rules (OUT OF SCOPE, SCRUM-213)
    assert.equal(
      rulesContent.includes('/campaigns'),
      false,
      'Campaigns collection rule must NOT exist in firestore.rules for SCRUM-210'
    );

    // 4. Default deny at end
    assert.ok(rulesContent.includes('match /{document=**} {\n      allow read, write: if false;'));
  });

  it('verifies that the rule-contract validator correctly flags and rejects the Iteration 1 bug pattern', () => {
    // Regression check: the exact bug from Iteration 1 was:
    // "allow read, write: if isOwner(uid) || isAdmin(); allow delete: if false;"
    const iteration1BuggyBlock = `
      allow read, write: if isOwner(uid) || isAdmin();
      allow delete: if false;
    `;

    // Must detect "write" granted in "allow read, write:"
    const hasForbiddenWrite = /\ballow\s+[^;:]*\bwrite\b/i.test(iteration1BuggyBlock);
    assert.equal(hasForbiddenWrite, true, 'Regex MUST detect and flag "allow read, write:" as granting write');

    // Also detect allow write: by itself
    const pureWriteBlock = 'allow write: if isOwner(uid);';
    assert.equal(/\ballow\s+[^;:]*\bwrite\b/i.test(pureWriteBlock), true);

    // Clean explicit block must NOT be flagged
    const cleanBlock = `
      allow read: if isOwner(uid) || isAdmin();
      allow create: if isOwner(uid) || isAdmin();
      allow update: if isOwner(uid) || isAdmin();
      allow delete: if false;
    `;
    assert.equal(/\ballow\s+[^;:]*\bwrite\b/i.test(cleanBlock), false);
  });

  it('handles null/undefined inputs and enforces integer cents on boundary functions', () => {
    // null data in deserializeCommercialPackageDoc
    const nullDoc = deserializeCommercialPackageDoc('pkg-null', null);
    assert.equal(nullDoc.id, 'pkg-null');
    assert.equal(nullDoc.priceUsdt, 0);

    // undefined data in deserializeCommercialPackageDoc
    const undefinedDoc = deserializeCommercialPackageDoc('pkg-undef', undefined);
    assert.equal(undefinedDoc.id, 'pkg-undef');

    // null pkg in validatePackageSchema
    const nullValidation = validatePackageSchema(null as any);
    assert.equal(nullValidation.valid, false);

    // float pricePaidCents in createPurchaseSnapshot is rounded to integer cents
    const snapshotFloat = createPurchaseSnapshot({
      id: 'pkg-1',
      name: 'Test',
      powerTh: 10,
      priceUsdt: 18.99,
      durationDays: 365,
      status: 'ACTIVE',
      variablePct: 0,
      commissionPct: 2,
      version: 1,
      createdAt: '2026-11-07T00:00:00Z',
      updatedAt: '2026-11-07T00:00:00Z',
    }, 1899.6);
    assert.equal(snapshotFloat.pricePaidCents, 1900);
    assert.ok(Number.isInteger(snapshotFloat.pricePaidCents));
  });

  it('verifies PurchasedMinerInstance supports client StoredMiner interoperability', () => {
    const purchasedInstance: PurchasedMinerInstance = {
      minerId: 'miner-98765',
      id: 'miner-98765',
      uid: 'user-abc',
      packageId: 'preventa-01',
      name: 'Minero Preventa 1.46 TH',
      powerTh: 1.46,
      price: 18.99,
      currency: 'USD',
      status: 'active',
      network: 'USDT',
      ownerWallet: '0x1234567890abcdef',
      packageSnapshot: {
        packageId: 'preventa-01',
        packageName: 'Minero Preventa 1.46 TH',
        section: 'preventa',
        packageType: 'fixed',
        powerTh: 1.46,
        pricePaidCents: 1899,
        pricePaidUsd: 18.99,
        currency: 'USD',
        cadence: 'one_time',
        durationDays: 365,
        variablePct: 0,
        commissionPct: 2,
        packageVersion: 1,
        purchasedAt: '2026-11-07T00:00:00Z',
      },
      createdAt: '2026-11-07T00:00:00Z',
    };

    assert.equal(purchasedInstance.minerId, 'miner-98765');
    assert.equal(purchasedInstance.id, 'miner-98765');
    assert.equal(purchasedInstance.packageId, 'preventa-01');
    assert.notEqual(purchasedInstance.minerId, purchasedInstance.packageId);
    assert.equal(purchasedInstance.packageSnapshot.pricePaidCents, 1899);
    assert.equal(purchasedInstance.packageSnapshot.cadence, 'one_time');
  });
});
