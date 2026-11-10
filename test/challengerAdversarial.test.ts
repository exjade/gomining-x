import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchStorefrontCatalog,
  clearCatalogCache,
  getCachedStorefrontCatalog,
  getCurrentCacheEpoch,
} from '../src/catalogClient.ts'
import { getSectionFallbackPlans, customMinerPriceTiers } from '../src/minerCatalog.ts'
import {
  deferDemoMinerPurchase,
  getDemoSessionForPersistence,
  restoreDemoSession,
  payPendingDemoMiner,
  registerWalletMinerPurchase,
  cancelPendingDemoMiner,
  useDemoSession,
} from '../src/demoStore.ts'
import {
  payPendingMinerOrderAndRecordToAdmin,
  completeWalletMinerPurchase,
  buildMinerBuilderCheckoutPayload,
  orchestrateWalletMinerPurchaseFlow,
} from '../src/minerPurchaseFlow.ts'

describe('EMPIRICAL CHALLENGER: Stress Harness for Bug 4 & Contract 6', () => {
  beforeEach(() => {
    clearCatalogCache()
    // Reset demo store state
    restoreDemoSession({
      balance: 10000,
      maintenanceCredit: 0,
      miners: [],
      workers: [],
      workerActivationMode: 'automatic',
      pendingMinerOrders: [],
      subscription: null,
      receipts: [],
      presaleTokens: 0,
    })
  })

  // =========================================================================
  // SECTION 1: Bug 4 — Demo Session Persistence & Pending Orders Stress Tests
  // =========================================================================

  it('1.1 Bug 4: Multiple pending orders with mixed packageId states survive defer -> persist -> JSON round-trip -> restore', () => {
    // Setup multiple orders:
    // Order 1: Canonical packageId
    const order1 = deferDemoMinerPurchase({
      name: 'Minero 1.46 TH · 1.46 TH',
      powerTh: 1.46,
      efficiency: 15,
      price: 18.99,
      purchaseMode: 'once',
      packageId: 'minerx-01',
    })
    assert.ok(order1.ok)

    // Order 2: NO packageId (undefined)
    const order2 = deferDemoMinerPurchase({
      name: 'Custom Minero 5.00 TH',
      powerTh: 5.00,
      efficiency: 15,
      price: 60.00,
      purchaseMode: 'once',
    })
    assert.ok(order2.ok)

    // Order 3: Preventa canonical packageId
    const order3 = deferDemoMinerPurchase({
      name: 'Preventa Tier 3 · 21.05 TH',
      powerTh: 21.05,
      efficiency: 14,
      price: 249.99,
      purchaseMode: 'once',
      packageId: 'preventa-tier-3',
    })
    assert.ok(order3.ok)

    // Order 4: Empty string packageId (falsy)
    const order4 = deferDemoMinerPurchase({
      name: 'Minero Empty String Pkg',
      powerTh: 3.00,
      efficiency: 15,
      price: 35.00,
      purchaseMode: 'once',
      packageId: '',
    })
    assert.ok(order4.ok)

    // Order 5: Monthly purchase mode with canonical packageId
    const order5 = deferDemoMinerPurchase({
      name: 'Mensual Minero 10 TH',
      powerTh: 10.00,
      efficiency: 15,
      price: 120.00,
      purchaseMode: 'monthly',
      durationDays: 30,
      packageId: 'mensual-02',
    })
    assert.ok(order5.ok)

    // Order 6: Excessively long packageId (>120 chars)
    const longId = 'minerx-' + 'z'.repeat(200)
    const order6 = deferDemoMinerPurchase({
      name: 'Minero Long ID',
      powerTh: 2.00,
      efficiency: 15,
      price: 25.00,
      purchaseMode: 'once',
      packageId: longId,
    })
    assert.ok(order6.ok)

    // Persist session
    const persisted = getDemoSessionForPersistence()
    assert.equal(persisted.pendingMinerOrders.length, 6)

    // Simulate real Firestore / localStorage JSON serialization
    const serializedJson = JSON.stringify(persisted)
    const deserialized = JSON.parse(serializedJson)

    // Reset store to empty
    restoreDemoSession({
      balance: 0,
      maintenanceCredit: 0,
      miners: [],
      workers: [],
      workerActivationMode: 'automatic',
      pendingMinerOrders: [],
      subscription: null,
      receipts: [],
      presaleTokens: 0,
    })

    // Restore from deserialized JSON
    const restoreOk = restoreDemoSession(deserialized)
    assert.ok(restoreOk)

    const restoredSession = getDemoSessionForPersistence()
    assert.equal(restoredSession.pendingMinerOrders.length, 6)

    // Order 1: Canonical preserved
    const restored1 = restoredSession.pendingMinerOrders.find((o) => o.name.includes('1.46 TH'))
    assert.ok(restored1)
    assert.equal(restored1.packageId, 'minerx-01')

    // Order 2: undefined packageId preserved as undefined (NOT mutated to pkg-miner-*)
    const restored2 = restoredSession.pendingMinerOrders.find((o) => o.name.includes('Custom Minero'))
    assert.ok(restored2)
    assert.equal(restored2.packageId, undefined)

    // Order 3: Preventa preserved
    const restored3 = restoredSession.pendingMinerOrders.find((o) => o.name.includes('Preventa Tier 3'))
    assert.ok(restored3)
    assert.equal(restored3.packageId, 'preventa-tier-3')

    // Order 4: Empty string packageId omitted during persistence, restored as undefined
    const restored4 = restoredSession.pendingMinerOrders.find((o) => o.name.includes('Empty String'))
    assert.ok(restored4)
    assert.equal(restored4.packageId, undefined)

    // Order 5: Monthly preserved
    const restored5 = restoredSession.pendingMinerOrders.find((o) => o.name.includes('Mensual Minero'))
    assert.ok(restored5)
    assert.equal(restored5.packageId, 'mensual-02')
    assert.equal(restored5.purchaseMode, 'monthly')

    // Order 6: Truncated to 120 chars safely without crashing
    const restored6 = restoredSession.pendingMinerOrders.find((o) => o.name.includes('Long ID'))
    assert.ok(restored6)
    assert.equal(restored6.packageId, longId.slice(0, 120))
  })

  it('1.2 Bug 4: Out-of-order payment and admin derivation preserves packageId without cross-talk or mutation to pkg-miner-*', async () => {
    // Add 3 orders
    deferDemoMinerPurchase({
      name: 'Order A',
      powerTh: 1,
      efficiency: 15,
      price: 10,
      purchaseMode: 'once',
      packageId: 'pkg-alpha-canonical',
    })
    deferDemoMinerPurchase({
      name: 'Order B (no pkgId)',
      powerTh: 2,
      efficiency: 15,
      price: 20,
      purchaseMode: 'once',
    })
    deferDemoMinerPurchase({
      name: 'Order C',
      powerTh: 3,
      efficiency: 15,
      price: 30,
      purchaseMode: 'once',
      packageId: 'pkg-gamma-canonical',
    })

    const initialPersisted = getDemoSessionForPersistence()
    const orderA = initialPersisted.pendingMinerOrders.find((o) => o.name === 'Order A')!
    const orderB = initialPersisted.pendingMinerOrders.find((o) => o.name.includes('Order B'))!
    const orderC = initialPersisted.pendingMinerOrders.find((o) => o.name === 'Order C')!

    // Pay Order C first (out of order payment)
    let adminRecordC: any = null
    const payCResult = await payPendingMinerOrderAndRecordToAdmin(orderC, {
      recordPurchaseToAdmin: async (p) => { adminRecordC = p },
    })
    assert.ok(payCResult.ok)
    assert.equal(adminRecordC?.packageId, 'pkg-gamma-canonical', 'Admin must receive exact canonical packageId for C')

    // Verify state after paying C: A and B must remain intact with their exact packageIds
    let midSession = getDemoSessionForPersistence()
    assert.equal(adminRecordC?.minerId, midSession.miners[0].id, 'Admin recorder must receive actual created DemoMiner.id for C')
    assert.ok(midSession.miners[0].id.startsWith('MINER-'), 'Created miner ID must follow MINER- format')
    assert.equal(midSession.pendingMinerOrders.length, 2)
    assert.equal(midSession.miners.length, 1)
    assert.equal(midSession.miners[0].packageId, 'pkg-gamma-canonical')

    const remainingA = midSession.pendingMinerOrders.find((o) => o.id === orderA.id)!
    assert.equal(remainingA.packageId, 'pkg-alpha-canonical')
    const remainingB = midSession.pendingMinerOrders.find((o) => o.id === orderB.id)!
    assert.equal(remainingB.packageId, undefined)

    // Pay Order B (the order with no packageId)
    let adminRecordB: any = null
    const payBResult = await payPendingMinerOrderAndRecordToAdmin(orderB, {
      recordPurchaseToAdmin: async (p) => { adminRecordB = p },
    })
    assert.ok(payBResult.ok)
    assert.equal(adminRecordB?.packageId, undefined, 'Admin record params must NOT synthesize pkg-miner-* when packageId was undefined')

    // Pay Order A
    let adminRecordA: any = null
    const payAResult = await payPendingMinerOrderAndRecordToAdmin(orderA, {
      recordPurchaseToAdmin: async (p) => { adminRecordA = p },
    })
    assert.ok(payAResult.ok)
    assert.equal(adminRecordA?.packageId, 'pkg-alpha-canonical', 'Admin must receive exact canonical packageId for A')

    // Final check: all pending orders cleared, all 3 miners in demo session have correct packageIds
    const finalSession = getDemoSessionForPersistence()
    assert.equal(finalSession.pendingMinerOrders.length, 0)
    assert.equal(finalSession.miners.length, 3)

    const finalA = finalSession.miners.find((m) => m.name === 'Order A')!
    assert.equal(finalA.packageId, 'pkg-alpha-canonical')

    const finalB = finalSession.miners.find((m) => m.name.includes('Order B'))!
    assert.equal(finalB.packageId, undefined)

    const finalC = finalSession.miners.find((m) => m.name === 'Order C')!
    assert.equal(finalC.packageId, 'pkg-gamma-canonical')
  })

  it('1.3 Bug 4 / Shared Flow: Error conditions, insufficient balance, non-miner products, throwing admin recorders, and null-safety', async () => {
    // 1. Insufficient balance: payment fails, recorder spy must NOT be called
    restoreDemoSession({
      balance: 10,
      maintenanceCredit: 0,
      miners: [],
      workers: [],
      workerActivationMode: 'automatic',
      pendingMinerOrders: [{
        id: 'order_expensive',
        name: 'Expensive Miner 100 TH',
        powerTh: 100,
        efficiency: 15,
        price: 1000,
        createdAt: '2026-11-09',
        purchaseMode: 'once',
        packageId: 'minerx-99',
      }],
      subscription: null,
      receipts: [],
      presaleTokens: 0,
    })

    let recorderInvoked = false
    const failResult = await payPendingMinerOrderAndRecordToAdmin({
      id: 'order_expensive',
      name: 'Expensive Miner 100 TH',
      powerTh: 100,
      price: 1000,
      createdAt: '2026-11-09',
      purchaseMode: 'once',
      packageId: 'minerx-99',
    }, {
      recordPurchaseToAdmin: async () => { recorderInvoked = true },
    })
    assert.equal(failResult.ok, false, 'Payment must fail when balance is insufficient')
    assert.equal(recorderInvoked, false, 'recordPurchaseToAdmin must NOT be invoked when payment fails')

    // 2. Non-existent order: payment fails, recorder spy must NOT be called
    const missingResult = await payPendingMinerOrderAndRecordToAdmin({
      id: 'order_nonexistent',
      name: 'Ghost Miner',
      powerTh: 1,
      price: 10,
      createdAt: '2026-11-09',
      purchaseMode: 'once',
    }, {
      recordPurchaseToAdmin: async () => { recorderInvoked = true },
    })
    assert.equal(missingResult.ok, false)
    assert.equal(recorderInvoked, false)

    // 3. Admin recorder throwing: payment itself succeeds, error is caught gracefully
    restoreDemoSession({
      balance: 500,
      maintenanceCredit: 0,
      miners: [],
      workers: [],
      workerActivationMode: 'automatic',
      pendingMinerOrders: [{
        id: 'order_throw',
        name: 'Throwing Recorder Miner',
        powerTh: 1,
        efficiency: 15,
        price: 10,
        createdAt: '2026-11-09',
        purchaseMode: 'once',
        packageId: 'minerx-throw',
      }],
      subscription: null,
      receipts: [],
      presaleTokens: 0,
    })
    const throwResult = await payPendingMinerOrderAndRecordToAdmin({
      id: 'order_throw',
      name: 'Throwing Recorder Miner',
      powerTh: 1,
      price: 10,
      createdAt: '2026-11-09',
      purchaseMode: 'once',
      packageId: 'minerx-throw',
    }, {
      recordPurchaseToAdmin: async () => { throw new Error('Simulated network failure') },
    })
    assert.equal(throwResult.ok, true, 'Payment must succeed even if admin sync fails')
    const throwSession = getDemoSessionForPersistence()
    assert.equal(throwResult.minerId, throwSession.miners[0].id, 'minerId must match actual created DemoMiner.id even if admin sync fails')
    assert.ok(throwResult.minerId?.startsWith('MINER-'), 'minerId must have MINER- prefix')

    // 4. Default execution without options parameter
    restoreDemoSession({
      balance: 500,
      maintenanceCredit: 0,
      miners: [],
      workers: [],
      workerActivationMode: 'automatic',
      pendingMinerOrders: [{
        id: 'order_noop',
        name: 'No Options Miner',
        powerTh: 2,
        efficiency: 15,
        price: 20,
        createdAt: '2026-11-09',
        purchaseMode: 'once',
      }],
      subscription: null,
      receipts: [],
      presaleTokens: 0,
    })
    const noOptResult = await payPendingMinerOrderAndRecordToAdmin({
      id: 'order_noop',
      name: 'No Options Miner',
      powerTh: 2,
      price: 20,
      createdAt: '2026-11-09',
      purchaseMode: 'once',
    })
    assert.equal(noOptResult.ok, true, 'Payment must succeed when options is omitted')
    const noOptSession = getDemoSessionForPersistence()
    assert.equal(noOptResult.minerId, noOptSession.miners[0].id, 'noOptResult.minerId must equal actual created DemoMiner.id')
    assert.ok(noOptResult.minerId?.startsWith('MINER-'), 'noOptResult.minerId must follow MINER- format')

    // 5. completeWalletMinerPurchase: Non-miner product returns null
    let adminParams: any = null
    const nonMiner = await completeWalletMinerPurchase(
      {
        productName: 'Recarga de saldo USD',
        amount: 50,
        txHash: '0xhash_topup',
        networkName: 'BNB Chain',
      },
      {
        recordPurchaseToAdmin: async (p) => { adminParams = p },
      }
    )
    assert.equal(nonMiner, null, 'Non-miner products must return null')
    assert.equal(adminParams, null, 'Non-miner products must not trigger admin recording')

    // 6. completeWalletMinerPurchase without options executes safely
    const minerNoOpt = await completeWalletMinerPurchase({
      productName: 'Minero 8.33 TH · 8.33 TH',
      amount: 99.99,
      packageId: 'minerx-02',
      txHash: '0xhash_solo',
      networkName: 'BNB Chain',
    })
    assert.ok(minerNoOpt)
    assert.equal(minerNoOpt.resolvedPackageId, 'minerx-02')

    // 7. buildMinerBuilderCheckoutPayload with null selected plan
    const nullPayload = buildMinerBuilderCheckoutPayload({ selected: null })
    assert.equal(nullPayload.powerTh, 48)
    assert.equal(nullPayload.amount, 561.99)
    assert.equal(nullPayload.packageId, undefined)
    assert.equal(nullPayload.purchaseMode, 'once')

    // 8. orchestrateWalletMinerPurchaseFlow with monthly cadence
    let monthlyAdminRecord: any = null
    const monthlyFlow = await orchestrateWalletMinerPurchaseFlow(
      {
        selected: {
          id: 'monthly-plus',
          packageId: 'monthly-plus-canonical',
          label: 'Plus 9.61 TH',
          powerTh: 9.61,
          price: 99.99,
          currency: 'USD',
          cadence: 'monthly',
        },
        categoryTab: 'monthly',
      },
      {
        txHash: '0xmonthly_tx',
        activeAddress: '0xmonthly_owner',
        networkName: 'BNB Chain',
      },
      {
        recordPurchaseToAdmin: async (p) => { monthlyAdminRecord = p },
      }
    )
    assert.equal(monthlyFlow.checkoutPayload.purchaseMode, 'monthly')
    assert.equal(monthlyFlow.checkoutPayload.packageId, 'monthly-plus-canonical')
    assert.equal(monthlyFlow.checkoutState.purchaseMode, 'monthly')
    assert.equal(monthlyFlow.completionResult?.miner.purchaseMode, 'monthly')
    assert.equal(monthlyFlow.completionResult?.miner.packageId, 'monthly-plus-canonical')
    assert.equal(monthlyAdminRecord.packageId, 'monthly-plus-canonical')

    // 9. Malformed, whitespace-only, and untrimmed packageId edge cases
    // 9a. Whitespace-only packageId in pending order normalizes to undefined
    restoreDemoSession({
      balance: 500,
      maintenanceCredit: 0,
      miners: [],
      workers: [],
      workerActivationMode: 'automatic',
      pendingMinerOrders: [{
        id: 'order_ws',
        name: 'Whitespace Pkg Miner',
        powerTh: 1,
        efficiency: 15,
        price: 15,
        createdAt: '2026-11-09',
        purchaseMode: 'once',
        packageId: '   ',
      }],
      subscription: null,
      receipts: [],
      presaleTokens: 0,
    })
    let wsAdminRecord: any = null
    const wsResult = await payPendingMinerOrderAndRecordToAdmin({
      id: 'order_ws',
      name: 'Whitespace Pkg Miner',
      powerTh: 1,
      price: 15,
      createdAt: '2026-11-09',
      purchaseMode: 'once',
      packageId: '   ',
    }, {
      recordPurchaseToAdmin: async (p) => { wsAdminRecord = p },
    })
    assert.equal(wsResult.ok, true)
    const wsSession = getDemoSessionForPersistence()
    assert.equal(wsAdminRecord?.minerId, wsSession.miners[0].id, 'wsAdminRecord.minerId must equal actual created DemoMiner.id')
    assert.equal(wsAdminRecord?.packageId, undefined, 'Whitespace packageId must normalize to undefined for admin recording')

    // 9b. Malformed non-string packageId in pending order normalizes to undefined
    restoreDemoSession({
      balance: 500,
      maintenanceCredit: 0,
      miners: [],
      workers: [],
      workerActivationMode: 'automatic',
      pendingMinerOrders: [{
        id: 'order_num',
        name: 'Number Pkg Miner',
        powerTh: 1,
        efficiency: 15,
        price: 15,
        createdAt: '2026-11-09',
        purchaseMode: 'once',
        packageId: 9999 as any,
      }],
      subscription: null,
      receipts: [],
      presaleTokens: 0,
    })
    let numAdminRecord: any = null
    const numResult = await payPendingMinerOrderAndRecordToAdmin({
      id: 'order_num',
      name: 'Number Pkg Miner',
      powerTh: 1,
      price: 15,
      createdAt: '2026-11-09',
      purchaseMode: 'once',
      packageId: 9999 as any,
    }, {
      recordPurchaseToAdmin: async (p) => { numAdminRecord = p },
    })
    assert.equal(numResult.ok, true)
    const numSession = getDemoSessionForPersistence()
    assert.equal(numAdminRecord?.minerId, numSession.miners[0].id, 'numAdminRecord.minerId must equal actual created DemoMiner.id')
    assert.equal(numAdminRecord?.packageId, undefined, 'Malformed non-string packageId must normalize to undefined')

    // 9c. Untrimmed packageId in pending order normalizes to trimmed string
    restoreDemoSession({
      balance: 500,
      maintenanceCredit: 0,
      miners: [],
      workers: [],
      workerActivationMode: 'automatic',
      pendingMinerOrders: [{
        id: 'order_trim',
        name: 'Untrimmed Pkg Miner',
        powerTh: 1,
        efficiency: 15,
        price: 15,
        createdAt: '2026-11-09',
        purchaseMode: 'once',
        packageId: '  minerx-trimmed  ',
      }],
      subscription: null,
      receipts: [],
      presaleTokens: 0,
    })
    let trimAdminRecord: any = null
    const trimResult = await payPendingMinerOrderAndRecordToAdmin({
      id: 'order_trim',
      name: 'Untrimmed Pkg Miner',
      powerTh: 1,
      price: 15,
      createdAt: '2026-11-09',
      purchaseMode: 'once',
      packageId: '  minerx-trimmed  ',
    }, {
      recordPurchaseToAdmin: async (p) => { trimAdminRecord = p },
    })
    assert.equal(trimResult.ok, true)
    const trimSession = getDemoSessionForPersistence()
    assert.equal(trimAdminRecord?.minerId, trimSession.miners[0].id, 'trimAdminRecord.minerId must equal actual created DemoMiner.id')
    assert.equal(trimAdminRecord?.packageId, 'minerx-trimmed', 'Untrimmed packageId must be trimmed')

    // 9d. Whitespace-only packageId in completeWalletMinerPurchase normalizes to undefined
    let wsWalletAdminRecord: any = null
    const wsWalletResult = await completeWalletMinerPurchase({
      productName: 'Minero 10 TH · 10 TH',
      amount: 100,
      packageId: '   ',
      txHash: '0xhash_ws_wallet',
      networkName: 'BNB Chain',
    }, {
      recordPurchaseToAdmin: async (p) => { wsWalletAdminRecord = p },
    })
    assert.ok(wsWalletResult)
    assert.equal(wsWalletResult.resolvedPackageId, undefined, 'Whitespace packageId in wallet purchase must normalize to undefined')
    assert.equal(wsWalletAdminRecord?.packageId, undefined)

    // 9e. Untrimmed packageId in completeWalletMinerPurchase normalizes to trimmed string
    let trimWalletAdminRecord: any = null
    const trimWalletResult = await completeWalletMinerPurchase({
      productName: 'Minero 10 TH · 10 TH',
      amount: 100,
      packageId: '  minerx-wallet-trim  ',
      txHash: '0xhash_trim_wallet',
      networkName: 'BNB Chain',
    }, {
      recordPurchaseToAdmin: async (p) => { trimWalletAdminRecord = p },
    })
    assert.ok(trimWalletResult)
    assert.equal(trimWalletResult.resolvedPackageId, 'minerx-wallet-trim')
    assert.equal(trimWalletAdminRecord?.packageId, 'minerx-wallet-trim')
  })

  // =========================================================================
  // SECTION 2: Contract 6 — Option B Fallback Matrix Stress Tests
  // =========================================================================

  it('2.1 Contract 6: HTTP 4xx status codes (400, 401, 403, 404, 422, 429) strictly return [] without fallback and cache []', async () => {
    const statuses = [400, 401, 403, 404, 422, 429]
    for (const status of statuses) {
      clearCatalogCache()
      let fetchCalled = false
      globalThis.fetch = async () => {
        fetchCalled = true
        return new Response(JSON.stringify({ error: `HTTP ${status}` }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const plans = await fetchStorefrontCatalog('minerx')
      assert.ok(fetchCalled, `Fetch must be called for status ${status}`)
      assert.deepEqual(plans, [], `HTTP ${status} must return [] without fallback`)
      assert.deepEqual(getCachedStorefrontCatalog('minerx'), [], `HTTP ${status} must cache []`)

      // Subsequent read must hit cache and return [] without refetching
      fetchCalled = false
      const cachedPlans = await fetchStorefrontCatalog('minerx')
      assert.equal(fetchCalled, false, 'Must hit memory cache on second read')
      assert.deepEqual(cachedPlans, [])
    }
  })

  it('2.2 Contract 6: HTTP 5xx status codes (500, 502, 503, 504) strictly fall back to baseline plans and cache fallback', async () => {
    const statuses = [500, 502, 503, 504]
    for (const status of statuses) {
      clearCatalogCache()
      let fetchCalled = false
      globalThis.fetch = async () => {
        fetchCalled = true
        return new Response(`Server error ${status}`, { status })
      }

      const plans = await fetchStorefrontCatalog('minerx')
      assert.ok(fetchCalled)
      assert.deepEqual(plans, getSectionFallbackPlans('minerx'), `HTTP ${status} must fall back to baseline plans`)
      assert.deepEqual(getCachedStorefrontCatalog('minerx'), getSectionFallbackPlans('minerx'))
    }
  })

  it('2.3 Contract 6: Malformed / non-array payloads strictly fall back to baseline plans', async () => {
    const malformedPayloads = [
      { plans: [] }, // Object wrapper instead of Array
      { error: 'Internal Error', status: 'error' },
      'Plain text response',
      '', // Empty string
      '<html><body>502 Bad Gateway</body></html>',
      null,
      12345,
    ]

    for (const payload of malformedPayloads) {
      clearCatalogCache()
      globalThis.fetch = async () => {
        const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': typeof payload === 'string' ? 'text/plain' : 'application/json' },
        })
      }

      const plans = await fetchStorefrontCatalog('minerx')
      assert.deepEqual(plans, getSectionFallbackPlans('minerx'), `Malformed payload ${JSON.stringify(payload)} must fall back to baseline`)
    }
  })

  it('2.4 Contract 6: Network transport drops, socket errors, and timeouts fall back to baseline plans', async () => {
    // 1. TypeError (standard browser/undici network drop or offline)
    clearCatalogCache()
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    const plans1 = await fetchStorefrontCatalog('minerx')
    assert.deepEqual(plans1, getSectionFallbackPlans('minerx'))

    // 2. Node socket error / ECONNRESET
    clearCatalogCache()
    globalThis.fetch = async () => {
      const err = new TypeError('fetch failed')
      ;(err as any).cause = new Error('ECONNRESET')
      throw err
    }
    const plans2 = await fetchStorefrontCatalog('minerx')
    assert.deepEqual(plans2, getSectionFallbackPlans('minerx'))

    // 3. Socket timeout (DOMException TimeoutError)
    clearCatalogCache()
    globalThis.fetch = async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    }
    const plans3 = await fetchStorefrontCatalog('minerx')
    assert.deepEqual(plans3, getSectionFallbackPlans('minerx'))

    // 4. Socket hangup Error
    clearCatalogCache()
    globalThis.fetch = async () => {
      throw new Error('socket hang up')
    }
    const plans4 = await fetchStorefrontCatalog('minerx')
    assert.deepEqual(plans4, getSectionFallbackPlans('minerx'))
  })

  it('2.5 Contract 6: AbortError behavior — modal close vs unexpected active-session abort', async () => {
    // Case A: Normal modal close — clearCatalogCache() triggers abort
    let delayedResolve: any
    globalThis.fetch = async (_, init: any) => {
      return new Promise((resolve, reject) => {
        delayedResolve = resolve
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('The user aborted a request.', 'AbortError'))
          })
        }
      })
    }

    const inFlightPromise = fetchStorefrontCatalog('minerx')
    // Modal is closed before fetch returns
    clearCatalogCache()
    const resultAfterClose = await inFlightPromise
    // Must return [] and must NOT populate cache
    assert.deepEqual(resultAfterClose, [], 'Aborted request from closed modal must return []')
    assert.equal(getCachedStorefrontCatalog('minerx'), undefined, 'Cache must remain undefined')

    // Case B: What happens if an external fetch mock throws AbortError while modal is STILL OPEN?
    clearCatalogCache()
    globalThis.fetch = async () => {
      throw new DOMException('Simulated network abort', 'AbortError')
    }
    const plansOpenAbort = await fetchStorefrontCatalog('minerx')
    // Notice: Line 267 checks `error?.name === 'AbortError'` and returns []
    assert.deepEqual(plansOpenAbort, [], 'AbortError currently returns [] by design')
  })

  // =========================================================================
  // SECTION 3: Concurrency, Epoch Management & Rapid Modal Toggling
  // =========================================================================

  it('3.1 Concurrency: 50 rapid open -> close -> reopen cycles do not corrupt cache or cause stale leaks', async () => {
    let callCounter = 0

    // Mock fetch with randomized latency (0ms - 20ms)
    globalThis.fetch = async () => {
      const callId = ++callCounter
      const latency = Math.floor(Math.random() * 20)
      await new Promise((r) => setTimeout(r, latency))
      return new Response(
        JSON.stringify([
          {
            packageId: `minerx-call-${callId}`,
            displayName: `Miner ${callId}`,
            status: 'ACTIVE',
            isPublished: true,
            powerTh: callId,
            priceUsdt: callId * 10,
            section: 'minerx',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const pendingPromises: Promise<any>[] = []

    for (let i = 0; i < 50; i++) {
      // 1. Open modal
      const promise = fetchStorefrontCatalog('minerx')
      pendingPromises.push(promise)

      // 2. Rapidly close modal on odd iterations
      if (i % 2 === 1) {
        clearCatalogCache()
      }
    }

    // Wait for all in-flight promises to settle
    await Promise.allSettled(pendingPromises)

    // Now open modal cleanly one final time
    clearCatalogCache()
    const finalEpochBefore = getCurrentCacheEpoch()
    const finalPlans = await fetchStorefrontCatalog('minerx')

    assert.equal(finalPlans.length, 1)
    assert.ok(finalPlans[0].id.startsWith('minerx-call-'))
    assert.deepEqual(getCachedStorefrontCatalog('minerx'), finalPlans)
    assert.equal(getCurrentCacheEpoch(), finalEpochBefore)
  })

  it('3.2 Concurrency: All 4 sections fetching simultaneously when modal abruptly closes', async () => {
    let abortCount = 0
    globalThis.fetch = async (_, init: any) => {
      return new Promise((resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            abortCount++
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }
      })
    }

    // Fetch all 4 sections concurrently
    const p1 = fetchStorefrontCatalog('minerx')
    const p2 = fetchStorefrontCatalog('preventa')
    const p3 = fetchStorefrontCatalog('lanzamiento')
    const p4 = fetchStorefrontCatalog('mensual')

    // Abruptly close modal
    clearCatalogCache()

    const results = await Promise.all([p1, p2, p3, p4])
    assert.deepEqual(results, [[], [], [], []], 'All aborted requests must return []')
    assert.equal(abortCount, 4, 'All 4 in-flight requests must be aborted')

    // Verify all caches remain undefined
    assert.equal(getCachedStorefrontCatalog('minerx'), undefined)
    assert.equal(getCachedStorefrontCatalog('preventa'), undefined)
    assert.equal(getCachedStorefrontCatalog('lanzamiento'), undefined)
    assert.equal(getCachedStorefrontCatalog('mensual'), undefined)
  })

  it('3.3 Concurrency: In-flight deduplication across multiple callers with modal close in between', async () => {
    let fetchCount = 0
    let resolveFirst: any

    globalThis.fetch = async (_, init: any) => {
      fetchCount++
      return new Promise<Response>((resolve, reject) => {
        resolveFirst = resolve
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('The user aborted a request.', 'AbortError'))
          })
        }
      })
    }

    // Caller 1 and Caller 2 call fetchStorefrontCatalog concurrently
    const call1 = fetchStorefrontCatalog('minerx')
    const call2 = fetchStorefrontCatalog('minerx')
    assert.equal(fetchCount, 1, 'In-flight requests must be deduplicated to 1 network call')

    // Modal closes before first fetch finishes
    clearCatalogCache()

    // Caller 3 calls fetchStorefrontCatalog for the NEW modal session
    let fetchCountNew = 0
    globalThis.fetch = async () => {
      fetchCountNew++
      return new Response(
        JSON.stringify([
          {
            packageId: 'minerx-fresh',
            displayName: 'Fresh Plan',
            status: 'ACTIVE',
            isPublished: true,
            powerTh: 10,
            priceUsdt: 100,
            section: 'minerx',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const call3 = fetchStorefrontCatalog('minerx')
    assert.equal(fetchCountNew, 1, 'Caller 3 must initiate a new network request for the new epoch')

    // If resolveFirst is still pending, resolve it with stale payload
    if (resolveFirst) {
      resolveFirst(
        new Response(
          JSON.stringify([
            {
              packageId: 'minerx-stale',
              displayName: 'Stale Plan',
              status: 'ACTIVE',
              isPublished: true,
              powerTh: 1,
              priceUsdt: 10,
              section: 'minerx',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    }

    const [res1, res2, res3] = await Promise.all([call1, call2, call3])

    // Calls 1 and 2 belonged to the aborted session
    assert.deepEqual(res1, [], 'Aborted call1 must return []')
    assert.deepEqual(res2, [], 'Aborted call2 must return []')

    // Call 3 is the active session
    assert.equal(res3.length, 1)
    assert.equal(res3[0].id, 'minerx-fresh')
    assert.deepEqual(getCachedStorefrontCatalog('minerx'), res3, 'Cache must reflect only the fresh plan')
  })

  it('3.4 Concurrency: Stale response resolving without abort signal does NOT overwrite cache of newer generation', async () => {
    let resolveStale: any
    // Simulate an uncooperative fetch mock that does not abort on signal
    globalThis.fetch = async () => {
      return new Promise<Response>((resolve) => {
        resolveStale = resolve
      })
    }

    // Modal open 1
    const stalePromise = fetchStorefrontCatalog('minerx')

    // Modal close & reopen -> generation advances
    clearCatalogCache()

    // Generation 2 fetch succeeds immediately
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify([
          {
            packageId: 'minerx-gen2',
            displayName: 'Generation 2 Plan',
            status: 'ACTIVE',
            isPublished: true,
            powerTh: 20,
            priceUsdt: 200,
            section: 'minerx',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    const gen2Plans = await fetchStorefrontCatalog('minerx')
    assert.equal(gen2Plans[0].id, 'minerx-gen2')
    assert.equal(getCachedStorefrontCatalog('minerx')![0].id, 'minerx-gen2')

    // Now delayed generation 1 finally resolves
    resolveStale(
      new Response(
        JSON.stringify([
          {
            packageId: 'minerx-stale-gen1',
            displayName: 'Stale Gen 1',
            status: 'ACTIVE',
            isPublished: true,
            powerTh: 1,
            priceUsdt: 10,
            section: 'minerx',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await stalePromise

    // Verify cache STILL contains gen2 plans and was NOT overwritten by stale gen1
    const cachedAfterStale = getCachedStorefrontCatalog('minerx')
    assert.ok(cachedAfterStale)
    assert.equal(cachedAfterStale[0].id, 'minerx-gen2', 'Generation 2 cache must remain intact')
  })

  it('Bug 4 Adversarial: Authoritative minerId alignment: actual created DemoMiner.id strictly matches Admin recorder params.minerId and is never synthesized from receipt', async () => {
    restoreDemoSession({
      balance: 1000,
      maintenanceCredit: 0,
      miners: [],
      workers: [],
      workerActivationMode: 'automatic',
      pendingMinerOrders: [{
        id: 'order_adv_align',
        name: 'Adversarial Align Miner',
        powerTh: 10.5,
        efficiency: 15,
        price: 150,
        createdAt: '2026-11-09',
        purchaseMode: 'once',
        packageId: 'minerx-03',
      }],
      subscription: null,
      receipts: [],
      presaleTokens: 0,
    })

    let spyParams: any = null
    const result = await payPendingMinerOrderAndRecordToAdmin({
      id: 'order_adv_align',
      name: 'Adversarial Align Miner',
      powerTh: 10.5,
      price: 150,
      createdAt: '2026-11-09',
      purchaseMode: 'once',
      packageId: 'minerx-03',
    }, {
      recordPurchaseToAdmin: async (p) => { spyParams = p },
    })

    assert.equal(result.ok, true, 'Payment must succeed')
    const finalSession = getDemoSessionForPersistence()
    assert.equal(finalSession.miners.length, 1)
    const createdMiner = finalSession.miners[0]

    // 1. Authoritative created miner ID starts with MINER-
    assert.ok(createdMiner.id.startsWith('MINER-'), 'Authoritative miner ID must start with MINER-')
    // 2. Admin recorder strictly received the actual created DemoMiner.id
    assert.equal(spyParams.minerId, createdMiner.id, 'Admin recorder minerId must match actual created DemoMiner.id')
    // 3. Admin recorder minerId is NOT synthesized from receipt ID (never miner_LOCAL...)
    assert.ok(!spyParams.minerId.startsWith('miner_LOCAL'), 'Admin minerId must not start with miner_LOCAL')
    assert.ok(!spyParams.minerId.startsWith('miner_'), 'Admin minerId must not be synthesized with miner_ prefix')
    // 4. Returned result.minerId strictly matches created miner
    assert.equal(result.minerId, createdMiner.id, 'Returned result.minerId must equal created miner id')
    // 5. Canonical packageId preserved
    assert.equal(spyParams.packageId, 'minerx-03', 'Canonical packageId must be passed to admin recorder')
  })

  it('Finding 1 Adversarial: Custom purchase derivation across arbitrary custom tiers after editor back navigation', () => {
    // Regression: Custom purchase derivation across all defined custom tiers
    for (const tier of customMinerPriceTiers) {
      const payload = buildMinerBuilderCheckoutPayload({
        selected: undefined,
        isCustom: true,
        customTier: tier,
        categoryTab: 'packages',
      })
      assert.equal(payload.packageId, 'minerx-custom', 'Custom tier must always yield minerx-custom')
      assert.equal(payload.powerTh, tier.powerTh, `Power must match tier power ${tier.powerTh}`)
      assert.equal(payload.amount, tier.priceUsd, `Amount must match tier price ${tier.priceUsd}`)
      assert.equal(payload.productName, `Minero personalizado · ${tier.powerTh} TH`)
      assert.equal(payload.purchaseMode, 'once')
    }

    // Negative control: isCustom = false with undefined selected must fallback to baseline 48 TH / $561.99
    const fallbackPayload = buildMinerBuilderCheckoutPayload({
      selected: undefined,
      isCustom: false,
      customTier: customMinerPriceTiers[0],
      categoryTab: 'packages',
    })
    assert.equal(fallbackPayload.packageId, undefined)
    assert.equal(fallbackPayload.powerTh, 48)
    assert.equal(fallbackPayload.amount, 561.99)
  })
})
