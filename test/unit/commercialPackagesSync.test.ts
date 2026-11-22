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
  CommercialPackageService,
  INITIAL_PACKAGES,
  COMMERCIAL_PACKAGES_COLLECTION,
} from '../../src/services/admin/commercialPackageService.js';
import {
  HashrateAllocationService,
  INITIAL_CONTRACTS,
  ADMIN_CONTRACTS_COLLECTION,
} from '../../src/services/admin/hashrateAllocationService.js';
import {
  PackagePaymentsService,
  ADMIN_ORDERS_COLLECTION,
} from '../../src/services/admin/packagePaymentsService.js';
import { VirtualWorkerService } from '../../src/services/admin/virtualWorkerService.js';
import { resolveTabFromUrl } from '../../src/utils/urlRouting.js';
import type { CommercialPackage, MiningContract } from '../../src/types/admin.js';

describe('Commercial Packages & Admin Synchronization Unit Tests', () => {
  const packageService = CommercialPackageService.getInstance();
  const allocationService = HashrateAllocationService.getInstance();
  const paymentService = PackagePaymentsService.getInstance();

  it('exports correct Firestore collection names matching client app expectations', () => {
    assert.equal(COMMERCIAL_PACKAGES_COLLECTION, 'commercial_packages');
    assert.equal(ADMIN_CONTRACTS_COLLECTION, 'admin_contracts');
    assert.equal(ADMIN_ORDERS_COLLECTION, 'admin_orders');
  });

  it('provides valid INITIAL_PACKAGES with power, price, and publication fields', () => {
    assert.ok(Array.isArray(INITIAL_PACKAGES));
    assert.ok(INITIAL_PACKAGES.length >= 5);

    for (const pkg of INITIAL_PACKAGES) {
      assert.ok(pkg.id, 'Package must have an ID');
      assert.ok(pkg.name, 'Package must have a name');
      assert.ok(pkg.powerTh > 0, 'Package must have positive powerTh');
      assert.ok(pkg.priceUsdt > 0, 'Package must have positive priceUsdt');
      assert.ok(pkg.durationDays > 0, 'Package must have duration');
      assert.equal(pkg.status, 'ACTIVE');
      assert.ok(pkg.isPublished !== false, 'Initial packages should be published by default');
      assert.ok(typeof pkg.variablePct === 'number', 'Package must have variablePct');
      assert.ok(typeof pkg.commissionPct === 'number', 'Package must have commissionPct');
    }
  });

  it('allows saving and updating packages with version increments', () => {
    const testPkg = {
      name: 'Minero Personalizado Test',
      powerTh: 150,
      priceUsdt: 1800,
      durationDays: 365,
      status: 'ACTIVE' as const,
      isPublished: true,
      variablePct: 8.5,
      commissionPct: 1.5,
      description: 'Paquete de pruebas para verificación automatizada',
    };

    const created = packageService.savePackage(testPkg);
    assert.ok(created.id);
    assert.equal(created.version, 1);
    assert.equal(created.powerTh, 150);

    const updated = packageService.savePackage({
      ...created,
      powerTh: 160,
      priceUsdt: 1900,
    });
    assert.equal(updated.id, created.id);
    assert.equal(updated.version, 2, 'Version should increment on update');
    assert.equal(updated.powerTh, 160);
  });

  it('allows toggling publication status of a package', () => {
    const pkg = packageService.getPackages()[0];
    assert.ok(pkg);

    const initialPublished = pkg.isPublished ?? true;
    packageService.togglePublish(pkg.id);

    const afterFirstToggle = packageService.getPackageById(pkg.id);
    assert.equal(afterFirstToggle?.isPublished, !initialPublished);

    // Toggle back
    packageService.togglePublish(pkg.id);
    const afterSecondToggle = packageService.getPackageById(pkg.id);
    assert.equal(afterSecondToggle?.isPublished, initialPublished);
  });

  it('allows updating variable commission percentages', () => {
    const pkg = packageService.getPackages()[0];
    assert.ok(pkg);

    const updated = packageService.updatePackageVariables(pkg.id, 9.9, 1.2);
    assert.ok(updated);
    assert.equal(updated.variablePct, 9.9);
    assert.equal(updated.commissionPct, 1.2);
  });

  it('validates and registers mining contracts from client acquisitions', async () => {
    const initialContracts = allocationService.getContracts();
    assert.ok(Array.isArray(initialContracts));
    assert.ok(initialContracts.length >= 3);

    const newContract: MiningContract = {
      id: 'ctr-test-buyer-101',
      userId: 'usr_client_buyer_101',
      userEmail: 'comprador@gomining.cloud',
      packageId: 'pkg-miner-3',
      packageName: 'Minero 3 Pro',
      contractedTh: 96,
      allocatedTh: 96,
      status: 'ACTIVE',
      pricePaidUsdt: 1111.99,
      variablePct: 5.0,
      commissionPct: 1.8,
      workerId: 'vwk-buyer101',
      activatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
      accumulatedProductionPrl: 0,
      accumulatedNetProfitUsd: 0,
      lastCalculatedAt: new Date().toISOString(),
    };

    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : newContract;
      return new Response(JSON.stringify({ success: true, contract: body }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    try {
      const registered = await allocationService.registerContract(newContract);
      assert.equal(registered.id, 'ctr-test-buyer-101');
      assert.equal(registered.userEmail, 'comprador@gomining.cloud');
      assert.equal(registered.contractedTh, 96);
      assert.equal(registered.pricePaidUsdt, 1111.99);

      const summary = allocationService.getAllocationSummary();
      assert.ok(summary.totalContractedTh >= 96);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('starts package orders clean with zero hardcoded mocks and computes pure summary', () => {
    const payments = paymentService.getPayments();
    assert.ok(Array.isArray(payments));
    assert.equal(payments.length, 0);

    const summary = paymentService.getSummary(payments);
    assert.equal(summary.totalOrdersCount, 0);
    assert.equal(summary.totalVolumeUsd, 0);
    assert.equal(summary.totalThSold, 0);
  });

  it('maps navigation tab URL query parameters and paths correctly using resolveTabFromUrl', () => {
    const testCases = [
      { search: '?tab=admin_packages', path: '/', expectedTab: 'admin_packages', expectedSuite: 'admin' },
      { search: '?tab=packages', path: '/', expectedTab: 'admin_packages', expectedSuite: 'admin' },
      { search: '?tab=paquetes', path: '/', expectedTab: 'admin_packages', expectedSuite: 'admin' },
      { search: '?tab=contracts', path: '/', expectedTab: 'admin_allocations', expectedSuite: 'admin' },
      { search: '?tab=contratos', path: '/', expectedTab: 'admin_allocations', expectedSuite: 'admin' },
      { search: '?tab=allocations', path: '/', expectedTab: 'admin_allocations', expectedSuite: 'admin' },
      { search: '?tab=orders', path: '/', expectedTab: 'admin_orders', expectedSuite: 'admin' },
      { search: '?tab=pagos', path: '/', expectedTab: 'admin_orders', expectedSuite: 'admin' },
      { search: '?tab=admin_orders', path: '/', expectedTab: 'admin_orders', expectedSuite: 'admin' },
      { search: '', path: '/paquetes', expectedTab: 'admin_packages', expectedSuite: 'admin' },
      { search: '', path: '/packages', expectedTab: 'admin_packages', expectedSuite: 'admin' },
      { search: '', path: '/orders', expectedTab: 'admin_orders', expectedSuite: 'admin' },
      { search: '', path: '/allocations', expectedTab: 'admin_allocations', expectedSuite: 'admin' },
      { search: '?tab=overview', path: '/', expectedTab: 'overview', expectedSuite: 'fleet' },
    ];

    for (const { search, path, expectedTab, expectedSuite } of testCases) {
      const res = resolveTabFromUrl(search, path);
      assert.ok(res, `resolveTabFromUrl should return a result for search="${search}" path="${path}"`);
      assert.equal(res.tab, expectedTab, `Query/Path ${search || path} should resolve tab to ${expectedTab}`);
      assert.equal(res.suite, expectedSuite, `Query/Path ${search || path} should resolve suite to ${expectedSuite}`);
    }
  });

  it('guarantees VirtualWorkerService generates workers for newly registered client contracts', async () => {
    const vWorkerService = VirtualWorkerService.getInstance();
    const uniqueContractId = `ctr-virtual-check-${Date.now()}`;
    const clientContract: MiningContract = {
      id: uniqueContractId,
      userId: 'usr_client_dynamic',
      userEmail: 'dynamic@buyer.com',
      packageId: 'pkg-miner-2',
      packageName: 'Minero 2 Standard',
      contractedTh: 64,
      allocatedTh: 64,
      status: 'ACTIVE',
      pricePaidUsdt: 744.99,
      variablePct: 2.5,
      commissionPct: 2.0,
      workerId: `vwk-${uniqueContractId}`,
      activatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
      accumulatedProductionPrl: 0,
      accumulatedNetProfitUsd: 0,
      lastCalculatedAt: new Date().toISOString(),
    };

    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : clientContract;
      return new Response(JSON.stringify({ success: true, contract: body }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    try {
      await allocationService.registerContract(clientContract);
    } finally {
      globalThis.fetch = originalFetch;
    }
    const workers = vWorkerService.getVirtualWorkers();
    const matchingWorker = workers.find(w => w.contractId === uniqueContractId);

    assert.ok(matchingWorker, 'A virtual worker must be generated for newly registered client contract');
    assert.equal(matchingWorker.assignedTh, 64);
    assert.equal(matchingWorker.status, 'ACTIVE');
  });

  it('provides real-time subscription methods that return clean unsubscribe functions', () => {
    const unsubPackages = packageService.subscribeToFirestorePackages(() => {});
    assert.equal(typeof unsubPackages, 'function');
    unsubPackages();

    const unsubContracts = allocationService.subscribeToFirestoreContracts(() => {});
    assert.equal(typeof unsubContracts, 'function');
    unsubContracts();

    const unsubPayments = paymentService.subscribeToFirestorePayments(() => {});
    assert.equal(typeof unsubPayments, 'function');
    unsubPayments();
  });
});
