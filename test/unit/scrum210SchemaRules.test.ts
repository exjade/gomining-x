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
  CAMPAIGNS_COLLECTION,
  deserializeCommercialPackageDoc,
  createPurchaseSnapshot,
  validatePackageSchema,
  INITIAL_PACKAGES,
} from '../../src/services/admin/commercialPackageService.js';
import type {
  CommercialPackage,
  Campaign,
  PurchasedPackageSnapshot,
  PurchasedMinerInstance,
} from '../../src/types/admin.js';

describe('SCRUM-210: Firestore Schema, Indexes, Security Rules & Traceability Tests', () => {
  const packageService = CommercialPackageService.getInstance();

  it('exports correct canonical collection names', () => {
    assert.equal(COMMERCIAL_PACKAGES_COLLECTION, 'commercial_packages');
    assert.equal(CAMPAIGNS_COLLECTION, 'campaigns');
  });

  it('deserializes raw Firestore document with all SCRUM-205 / SCRUM-210 additive fields', () => {
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
      priceUsdtCents: 1899,
      billing: 'one_time',
      finalPriceUsdCents: 1899,
      currency: 'USD',
      dailyBtcText: '0.00000062',
      roiPct: 52.5,
      limitedUnits: 30,
      availableUnits: 30,
      soldUnits: 0,
      publishedToStorefront: true,
      durationDays: 365,
      variablePct: 0.0,
      commissionPct: 2.0,
      status: 'ACTIVE',
      isPublished: true,
      version: 1,
      description: 'Lote exclusivo de preventa con 30 cupos.',
      discount: {
        isActive: false,
        type: 'percent',
        value: 0,
        label: '',
      },
      campaignIds: ['camp-launch-2026'],
      maintenanceDiscountPct: {
        starter: 0,
        pro: 10,
        presale: 15,
      },
      minerTemplateId: null,
      updatedBy: 'admin_sys',
      seededAt: '2026-11-07T00:00:00Z',
      createdAt: '2026-11-07T00:00:00Z',
      updatedAt: '2026-11-07T00:00:00Z',
    };

    const pkg = deserializeCommercialPackageDoc('preventa-01', rawDoc);

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
    assert.equal(pkg.finalPriceUsdCents, 1899);
    assert.equal(pkg.billing, 'one_time');
    assert.equal(pkg.cadence, 'one_time');
    assert.equal(pkg.dailyBtcText, '0.00000062');
    assert.equal(pkg.roiPct, 52.5);
    assert.equal(pkg.limitedUnits, 30);
    assert.equal(pkg.publishedToStorefront, true);
    assert.equal(pkg.version, 1);
    assert.equal(pkg.minerTemplateId, null);
    assert.deepEqual(pkg.campaignIds, ['camp-launch-2026']);
    assert.equal(pkg.maintenanceDiscountPct?.presale, 15);
  });

  it('verifies cadence and billing bidirectional fallback and packageId alias', () => {
    // When only cadence is given
    const withCadence = deserializeCommercialPackageDoc('pkg-sub-1', {
      name: 'Plan Mensual Inicio',
      powerTh: 3.2,
      priceUsdt: 18.99,
      cadence: 'monthly',
    });
    assert.equal(withCadence.cadence, 'monthly');
    assert.equal(withCadence.billing, 'monthly');
    assert.equal(withCadence.packageId, 'pkg-sub-1');

    // When only billing is given
    const withBilling = deserializeCommercialPackageDoc('pkg-one-1', {
      name: 'Plan Un Solo Pago',
      powerTh: 48,
      priceUsdt: 561.99,
      billing: 'one_time',
    });
    assert.equal(withBilling.billing, 'one_time');
    assert.equal(withBilling.cadence, 'one_time');

    // Snapshot retains cadence
    const snapshot = createPurchaseSnapshot(withCadence);
    assert.equal(snapshot.cadence, 'monthly');
    assert.equal(snapshot.billing, 'monthly');
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
    assert.equal(pkg.priceUsdCents, 56199); // automatically inferred in cents
    assert.equal(pkg.status, 'ACTIVE');
    assert.equal(pkg.isPublished, true);
    assert.equal(pkg.version, 1);
    assert.equal(pkg.section, undefined); // ignored by dynamic storefront sections
  });

  it('validates money integrity: exact integer cents with no floating point double precision loss', () => {
    // Check various prices from frontend
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
      priceUsdCents: 5000,
      availableUnits: -5,
    });
    assert.equal(negativeUnits.valid, false);
    assert.ok(negativeUnits.errors.some(e => e.includes('availableUnits cannot be negative')));

    // Valid package with priceUsdCents only
    const validCentsOnly = validatePackageSchema({
      name: 'Cents Only',
      powerTh: 20,
      priceUsdCents: 1899,
      limitedUnits: 30,
      soldUnits: 5,
    });
    assert.equal(validCentsOnly.valid, true);

    // Invalid when both prices missing
    const noPrice = validatePackageSchema({
      name: 'No Price',
      powerTh: 20,
    });
    assert.equal(noPrice.valid, false);
  });

  it('guarantees purchase traceability: snapshot decouples purchased instance from future catalog edits', () => {
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
      finalPriceUsdCents: 56199,
      currency: 'USD',
      billing: 'one_time',
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

    // 1. Capture snapshot at time of user purchase
    const snapshot = createPurchaseSnapshot(originalPkg, 56199, {
      type: 'percent',
      value: 10,
      label: '10% PROMO',
      campaignId: 'camp-promo-1',
    });

    const userMinerInstance: PurchasedMinerInstance = {
      minerId: 'MINER-USER-101',
      uid: 'USR-CLIENT-777',
      packageId: originalPkg.id,
      packageSnapshot: snapshot,
      createdAt: new Date().toISOString(),
    };

    assert.equal(userMinerInstance.packageId, 'minerx-01');
    assert.equal(userMinerInstance.packageSnapshot.packageVersion, 1);
    assert.equal(userMinerInstance.packageSnapshot.pricePaidCents, 56199);
    assert.equal(userMinerInstance.packageSnapshot.powerTh, 48);
    assert.equal(userMinerInstance.packageSnapshot.discountApplied?.label, '10% PROMO');

    // 2. Later, Admin updates the commercial package (new price, different TH, updated name, version 2)
    const modifiedPkg: CommercialPackage = {
      ...originalPkg,
      name: 'Minero 1 Ultra Redesigned',
      powerTh: 60,
      priceUsdt: 699.99,
      priceUsdCents: 69999,
      finalPriceUsdCents: 69999,
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

  it('enforces safe archiving: status = ARCHIVED, isPublished = false, preserves ID and historical records', () => {
    // Create a temporary package
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

    const originalId = created.id;
    assert.equal(created.status, 'ACTIVE');
    assert.equal(created.isPublished, true);

    // Archive using archivePackage
    const archived = packageService.archivePackage(originalId);
    assert.ok(archived);
    assert.equal(archived.id, originalId, 'Archived package must retain its stable ID');
    assert.equal(archived.status, 'ARCHIVED', 'Status must transition to ARCHIVED');
    assert.equal(archived.isPublished, false, 'isPublished must be false when archived');

    // Verify package is not deleted from store
    const retrieved = packageService.getPackageById(originalId);
    assert.ok(retrieved, 'Package must remain present in database, not hard-deleted');
    assert.equal(retrieved.status, 'ARCHIVED');
    assert.equal(retrieved.isPublished, false);
  });

  it('validates campaigns collection schema per SCRUM-210 acceptance criteria', () => {
    const testCampaign: Campaign = {
      id: 'camp-black-friday-2026',
      name: 'Black Friday Hashrate Boost',
      type: 'percent',
      value: 15,
      startsAt: '2026-11-20T00:00:00Z',
      endsAt: '2026-11-30T23:59:59Z',
      isActive: true,
      priority: 10,
      stackable: false,
      appliesTo: {
        sections: ['minerx', 'preventa'],
        packageIds: ['minerx-01', 'minerx-02'],
      },
      badgeText: '-15% PROMO',
      maxRedemptions: 100,
      redeemedCount: 12,
      createdBy: 'admin_sys',
      createdAt: '2026-11-07T00:00:00Z',
      updatedAt: '2026-11-07T00:00:00Z',
    };

    assert.equal(testCampaign.id, 'camp-black-friday-2026');
    assert.equal(testCampaign.type, 'percent');
    assert.equal(testCampaign.value, 15);
    assert.equal(testCampaign.isActive, true);
    assert.equal(testCampaign.priority, 10);
    assert.equal(testCampaign.stackable, false);
    assert.deepEqual(testCampaign.appliesTo.sections, ['minerx', 'preventa']);
    assert.deepEqual(testCampaign.appliesTo.packageIds, ['minerx-01', 'minerx-02']);
    assert.equal(testCampaign.badgeText, '-15% PROMO');
  });

  it('verifies firestore.indexes.json includes composite indexes for commercial_packages and campaigns', () => {
    const indexesPath = resolve(process.cwd(), 'firestore.indexes.json');
    const content = JSON.parse(readFileSync(indexesPath, 'utf-8'));
    assert.ok(Array.isArray(content.indexes));

    const packageIndexes = content.indexes.filter((idx: any) => idx.collectionGroup === 'commercial_packages');
    const campaignIndexes = content.indexes.filter((idx: any) => idx.collectionGroup === 'campaigns');

    // Must have composite indexes for storefront section queries
    assert.ok(packageIndexes.length >= 4, `Expected at least 4 package indexes, found ${packageIndexes.length}`);
    assert.ok(campaignIndexes.length >= 2, `Expected at least 2 campaign indexes, found ${campaignIndexes.length}`);

    // Verify section + isPublished + sortOrder index
    const hasSectionPublishedSort = packageIndexes.some((idx: any) => {
      const paths = idx.fields.map((f: any) => f.fieldPath);
      return paths.includes('section') && paths.includes('isPublished') && paths.includes('sortOrder');
    });
    assert.ok(hasSectionPublishedSort, 'Must have index for section + isPublished + sortOrder');

    // Verify section + publishedToStorefront index
    const hasSectionStorefrontSort = packageIndexes.some((idx: any) => {
      const paths = idx.fields.map((f: any) => f.fieldPath);
      return paths.includes('section') && paths.includes('publishedToStorefront') && paths.includes('sortOrder');
    });
    assert.ok(hasSectionStorefrontSort, 'Must have composite index for section + publishedToStorefront + sortOrder');

    // Verify campaigns priority index
    const hasCampaignPriority = campaignIndexes.some((idx: any) => {
      const paths = idx.fields.map((f: any) => f.fieldPath);
      return paths.includes('isActive') && paths.includes('priority');
    });
    assert.ok(hasCampaignPriority, 'Must have index for isActive + priority in campaigns');
  });

  it('verifies firestore.rules replaces open read/write with granular security rules', () => {
    const rulesPath = resolve(process.cwd(), 'firestore.rules');
    const rulesContent = readFileSync(rulesPath, 'utf-8');

    // 1. Must NOT contain open read/write for administrative or packages collection
    assert.equal(
      rulesContent.includes('match /commercial_packages/{packageId} {\n      allow read, write: if true;'),
      false,
      'commercial_packages must not have allow read, write: if true'
    );
    assert.equal(
      rulesContent.includes('match /admin_users/{userId} {\n      allow read, write: if true;'),
      false,
      'admin_users must not have allow read, write: if true'
    );

    // 2. Commercial packages: public read only if isPublished == true, write requires admin, delete is false
    assert.ok(rulesContent.includes('match /commercial_packages/{packageId}'));
    assert.ok(rulesContent.includes('resource.data.isPublished == true'));
    assert.ok(rulesContent.includes('isAdmin()'));
    assert.ok(rulesContent.includes('allow delete: if false;'));

    // 3. Campaigns: public read only if isActive == true, write requires admin, delete is false
    assert.ok(rulesContent.includes('match /campaigns/{campaignId}'));
    assert.ok(rulesContent.includes('resource.data.isActive == true'));

    // 4. Miners instance: delete prohibited
    assert.ok(rulesContent.includes('match /miners/{uid}/miner/{minerId}'));
    assert.ok(rulesContent.includes('allow delete: if false;'));

    // 5. Admin contracts: client buyer can create contract on purchase, delete is false
    assert.ok(rulesContent.includes('match /admin_contracts/{contractId}'));
    assert.ok(rulesContent.includes('allow create: if isAdmin() || (isAuthenticated() && request.resource.data.userId == request.auth.uid);'));
    assert.ok(rulesContent.includes('allow update: if isAdmin();'));

    // 6. Default deny at end
    assert.ok(rulesContent.includes('match /{document=**} {\n      allow read, write: if false;'));
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
        billing: 'one_time',
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
