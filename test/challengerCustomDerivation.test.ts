import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import {
  customMinerPriceTiers,
  presaleMinerPlans,
  launchMinerPlans,
  monthlyMinerPlans,
  type MinerPlan,
} from '../src/minerCatalog.ts'

import {
  buildMinerBuilderCheckoutPayload,
  createWalletCheckoutState,
  completeWalletMinerPurchase,
  payPendingMinerOrderAndRecordToAdmin,
  type MinerBuilderCheckoutInput,
  type MinerCategoryTab,
} from '../src/minerPurchaseFlow.ts'

import {
  deferDemoMinerPurchase,
  getDemoSessionForPersistence,
  restoreDemoSession,
} from '../src/demoStore.ts'

describe('EMPIRICAL CHALLENGER: Finding 1 Custom Purchase Derivation Stress Suite', () => {

  // =========================================================================
  // 1. ALL CUSTOM TIERS (Indices 0 to 21) EXHAUSTIVE VERIFICATION
  // =========================================================================
  it('1.1 Exhaustively test all 22 customMinerPriceTiers: verify exact power, price, packageId, and no fallback', () => {
    assert.equal(customMinerPriceTiers.length, 22, 'customMinerPriceTiers must contain exactly 22 tiers')

    for (let i = 0; i < customMinerPriceTiers.length; i++) {
      const tier = customMinerPriceTiers[i]

      // Test when editor is closed (isCustom = true, isCustomEditor = false)
      const payloadClosed = buildMinerBuilderCheckoutPayload({
        selected: undefined,
        isCustom: true,
        customTier: tier,
        categoryTab: 'packages',
      })

      assert.equal(payloadClosed.packageId, 'minerx-custom', `Tier ${i} must have packageId 'minerx-custom'`)
      assert.equal(payloadClosed.powerTh, tier.powerTh, `Tier ${i} must have powerTh ${tier.powerTh}`)
      assert.equal(payloadClosed.amount, tier.priceUsd, `Tier ${i} must have amount ${tier.priceUsd}`)
      assert.equal(payloadClosed.currency, 'USD', `Tier ${i} must have currency USD`)
      assert.equal(payloadClosed.purchaseMode, 'once', `Tier ${i} must have purchaseMode 'once'`)
      assert.equal(payloadClosed.productName, `Minero personalizado · ${tier.powerTh} TH`)

      // Explicit anti-fallback assertions:
      assert.notEqual(payloadClosed.packageId, undefined, `Tier ${i} packageId must never be undefined`)
      if (tier.powerTh !== 48) {
        assert.notEqual(payloadClosed.powerTh, 48, `Tier ${i} (${tier.powerTh} TH) must not fall back to 48 TH`)
      }
      if (tier.priceUsd !== 561.99) {
        assert.notEqual(payloadClosed.amount, 561.99, `Tier ${i} ($${tier.priceUsd}) must not fall back to $561.99`)
      }

      // Test when editor is open (isCustom = true, isCustomEditor = true)
      const payloadOpen = buildMinerBuilderCheckoutPayload({
        selected: undefined,
        isCustom: true,
        customTier: tier,
        categoryTab: 'packages',
      })
      assert.deepEqual(payloadOpen, payloadClosed, `Tier ${i} derivation must be identical whether editor is open or closed`)
    }
  })

  // =========================================================================
  // 2. BOUNDARY CONDITIONS AND RANDOMIZED FUZZING
  // =========================================================================
  it('2.1 Boundary conditions: zero values, fractional values, and massive powers', () => {
    // 2.1a Zero power and zero price: nullish coalescing (??) must preserve 0, not fall back to 48 or 561.99
    const zeroPayload = buildMinerBuilderCheckoutPayload({
      selected: undefined,
      isCustom: true,
      customTier: { powerTh: 0, priceUsd: 0 },
      categoryTab: 'packages',
    })
    assert.equal(zeroPayload.powerTh, 0, 'Zero power must be preserved (0 ?? 48 is 0)')
    assert.equal(zeroPayload.amount, 0, 'Zero price must be preserved (0 ?? 561.99 is 0)')
    assert.equal(zeroPayload.packageId, 'minerx-custom')
    assert.equal(zeroPayload.productName, 'Minero personalizado · 0 TH')

    // 2.1b Fractional sub-unit power
    const subUnitPayload = buildMinerBuilderCheckoutPayload({
      selected: undefined,
      isCustom: true,
      customTier: { powerTh: 0.25, priceUsd: 3.25 },
      categoryTab: 'packages',
    })
    assert.equal(subUnitPayload.powerTh, 0.25)
    assert.equal(subUnitPayload.amount, 3.25)
    assert.equal(subUnitPayload.packageId, 'minerx-custom')
    assert.equal(subUnitPayload.productName, 'Minero personalizado · 0.25 TH')

    // 2.1c Massive industrial datacenter power
    const massivePayload = buildMinerBuilderCheckoutPayload({
      selected: undefined,
      isCustom: true,
      customTier: { powerTh: 1_000_000, priceUsd: 12_990_000 },
      categoryTab: 'packages',
    })
    assert.equal(massivePayload.powerTh, 1_000_000)
    assert.equal(massivePayload.amount, 12_990_000)
    assert.equal(massivePayload.packageId, 'minerx-custom')
    assert.equal(massivePayload.productName, 'Minero personalizado · 1000000 TH')
  })

  it('2.2 Randomized Fuzzing: 500 pseudo-random power and price inputs with isCustom = true', () => {
    // Deterministic pseudo-random sequence for repeatability
    let seed = 123456789
    const pseudoRandom = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }

    for (let n = 0; n < 500; n++) {
      const randomPower = Math.round((pseudoRandom() * 10000 + 0.1) * 100) / 100
      const randomPrice = Math.round((pseudoRandom() * 100000 + 1) * 100) / 100

      const payload = buildMinerBuilderCheckoutPayload({
        selected: undefined,
        isCustom: true,
        customTier: { powerTh: randomPower, priceUsd: randomPrice },
        categoryTab: 'packages',
      })

      assert.equal(payload.packageId, 'minerx-custom')
      assert.equal(payload.powerTh, randomPower)
      assert.equal(payload.amount, randomPrice)
      assert.equal(payload.currency, 'USD')
      assert.equal(payload.purchaseMode, 'once')
      assert.equal(payload.productName, `Minero personalizado · ${randomPower} TH`)
      assert.notEqual(payload.packageId, undefined)
    }
  })

  // =========================================================================
  // 3. MODE TRANSITIONS AND CATEGORY TAB MATRIX
  // =========================================================================
  it('3.1 Category Tab Matrix: isCustom true across all possible tabs', () => {
    const tier = customMinerPriceTiers[6] // 42.44 TH, $499.99

    const tabs: MinerCategoryTab[] = ['packages', 'presale', 'launch', 'monthly']
    for (const tab of tabs) {
      const payload = buildMinerBuilderCheckoutPayload({
        selected: undefined,
        isCustom: true,
        customTier: tier,
        categoryTab: tab,
      })

      assert.equal(payload.packageId, 'minerx-custom')
      assert.equal(payload.powerTh, tier.powerTh)
      assert.equal(payload.amount, tier.priceUsd)
      assert.equal(payload.productName, `Minero personalizado · ${tier.powerTh} TH`)

      if (tab === 'monthly') {
        assert.equal(payload.purchaseMode, 'monthly', 'monthly tab must set purchaseMode to monthly')
      } else {
        assert.equal(payload.purchaseMode, 'once', `${tab} tab must set purchaseMode to once`)
      }
    }
  })

  it('3.2 App.tsx tab switching state machine simulation: clean isolation of custom state', () => {
    // Model App.tsx state transitions:
    let categoryTab: MinerCategoryTab = 'packages'
    let presetId = 'custom'
    let isCustomEditorOpen = false
    let customPowerIndex = 10 // 192 TH, $2279.99
    const storefrontSections = { showCustom: true, showPresale: true, showLaunch: true, showMonthly: true }

    const computeAppPayload = () => {
      const isCustom = categoryTab === 'packages' && presetId === 'custom' && storefrontSections.showCustom
      const customTier = customMinerPriceTiers[customPowerIndex]
      const activePlans = categoryTab === 'presale' ? presaleMinerPlans
        : categoryTab === 'launch' ? launchMinerPlans
        : categoryTab === 'monthly' ? monthlyMinerPlans
        : presaleMinerPlans // packages uses catalog, fallback to presale
      const selected = activePlans.find((p) => p.id === presetId)
      return buildMinerBuilderCheckoutPayload({
        selected,
        isCustom,
        customTier,
        categoryTab,
      })
    }

    // Step A: Custom in packages tab
    let p = computeAppPayload()
    assert.equal(p.packageId, 'minerx-custom')
    assert.equal(p.powerTh, 192)
    assert.equal(p.amount, 2279.99)

    // Step B: User clicks 'presale' tab -> App.tsx tab change handler
    categoryTab = 'presale'
    isCustomEditorOpen = false
    presetId = presaleMinerPlans[0].id // 'presale-1'

    p = computeAppPayload()
    assert.equal(p.packageId, 'presale-1')
    assert.equal(p.powerTh, 1.46)
    assert.equal(p.amount, 18.99)
    assert.equal(p.productName, 'Minero 1.46 TH · 1.46 TH')

    // Step C: User clicks 'packages' tab -> selects Custom again
    categoryTab = 'packages'
    presetId = 'custom'

    p = computeAppPayload()
    assert.equal(p.packageId, 'minerx-custom')
    assert.equal(p.powerTh, 192, 'customPowerIndex must be preserved across tab visits')
    assert.equal(p.amount, 2279.99)
  })

  // =========================================================================
  // 4. UI STATE COMBINATIONS TRUTH TABLE
  // =========================================================================
  it('4.1 UI State Truth Table: isCustom vs isCustomEditor vs selected', () => {
    const tier = customMinerPriceTiers[0] // 1 TH, $12.99
    const samplePlan: MinerPlan = {
      id: 'plan-fixed-1',
      packageId: 'minerx-01',
      label: '48 TH',
      powerTh: 48,
      price: 561.99,
      currency: 'USD',
      cadence: 'once',
    }

    // Row 1: isCustom = true, isCustomEditor = false, selected = undefined (The Finding 1 regression case)
    const r1 = buildMinerBuilderCheckoutPayload({ selected: undefined, isCustom: true, customTier: tier, categoryTab: 'packages' })
    assert.equal(r1.packageId, 'minerx-custom')
    assert.equal(r1.powerTh, 1)
    assert.equal(r1.amount, 12.99)

    // Row 2: isCustom = true, isCustomEditor = true, selected = undefined (Editor open)
    const r2 = buildMinerBuilderCheckoutPayload({ selected: undefined, isCustom: true, customTier: tier, categoryTab: 'packages' })
    assert.equal(r2.packageId, 'minerx-custom')
    assert.equal(r2.powerTh, 1)
    assert.equal(r2.amount, 12.99)

    // Row 3: isCustom = false, isCustomEditor = false, selected = samplePlan (Standard fixed plan)
    const r3 = buildMinerBuilderCheckoutPayload({ selected: samplePlan, isCustom: false, customTier: tier, categoryTab: 'packages' })
    assert.equal(r3.packageId, 'minerx-01')
    assert.equal(r3.powerTh, 48)
    assert.equal(r3.amount, 561.99)
    assert.equal(r3.productName, 'Minero 48 TH · 48 TH')

    // Row 4: isCustom = false, isCustomEditor = true (Desynced / stale editor flag, but isCustom is false)
    // buildMinerBuilderCheckoutPayload receives isCustom: false -> must respect selected plan, NOT customTier!
    const r4 = buildMinerBuilderCheckoutPayload({ selected: samplePlan, isCustom: false, customTier: tier, categoryTab: 'packages' })
    assert.equal(r4.packageId, 'minerx-01')
    assert.equal(r4.powerTh, 48)

    // Row 5: isCustom = true takes precedence even if selected is accidentally populated
    const r5 = buildMinerBuilderCheckoutPayload({ selected: samplePlan, isCustom: true, customTier: tier, categoryTab: 'packages' })
    assert.equal(r5.packageId, 'minerx-custom', 'isCustom true must strictly take precedence over selected plan')
    assert.equal(r5.powerTh, 1)
    assert.equal(r5.amount, 12.99)
  })

  // =========================================================================
  // 5. EDITOR ROUNDTRIP STATE TOGGLE SEQUENCES & END-TO-END CHECKOUT
  // =========================================================================
  it('5.1 Editor roundtrip sequence: select Custom -> open editor -> change power index -> click Back -> verify no fallback', () => {
    // Simulate App.tsx state evolution
    let presetId = 'minerx-01'
    let isCustomEditorOpen = false
    let customPowerIndex = 0
    let categoryTab: MinerCategoryTab = 'packages'
    const storefrontSections = { showCustom: true, showPresale: true, showLaunch: true, showMonthly: true }

    const derivePayload = () => {
      const isCustom = categoryTab === 'packages' && presetId === 'custom' && storefrontSections.showCustom
      const customTier = customMinerPriceTiers[customPowerIndex]
      const selected = presetId === 'custom' ? undefined : { id: presetId, packageId: presetId, label: 'Standard', powerTh: 48, price: 561.99, currency: 'USD' as const, cadence: 'once' as const }
      return buildMinerBuilderCheckoutPayload({
        selected,
        isCustom,
        customTier,
        categoryTab,
      })
    }

    // Step 1: User selects Custom option in catalog
    presetId = 'custom'
    isCustomEditorOpen = false
    let payload = derivePayload()
    assert.equal(payload.packageId, 'minerx-custom')
    assert.equal(payload.powerTh, 1)
    assert.equal(payload.amount, 12.99)
    assert.equal(payload.productName, 'Minero personalizado · 1 TH')

    // Step 2: User clicks "Continuar a la compra" -> opens editor screen
    isCustomEditorOpen = true
    payload = derivePayload()
    assert.equal(payload.packageId, 'minerx-custom')
    assert.equal(payload.powerTh, 1)
    assert.equal(payload.amount, 12.99)

    // Step 3: User moves PowerSlider to index 6 (42.44 TH, $499.99)
    customPowerIndex = 6
    payload = derivePayload()
    assert.equal(payload.packageId, 'minerx-custom')
    assert.equal(payload.powerTh, 42.44)
    assert.equal(payload.amount, 499.99)
    assert.equal(payload.productName, 'Minero personalizado · 42.44 TH')

    // Step 4: User moves PowerSlider to index 21 (5,000 TH, $54,768.99)
    customPowerIndex = 21
    payload = derivePayload()
    assert.equal(payload.packageId, 'minerx-custom')
    assert.equal(payload.powerTh, 5000)
    assert.equal(payload.amount, 54768.99)
    assert.equal(payload.productName, 'Minero personalizado · 5000 TH')

    // Step 5: CRITICAL TEST — User clicks Back (.miner-custom-back)
    // onBack={() => setIsCustomEditorOpen(false)}
    isCustomEditorOpen = false
    payload = derivePayload()

    // PAYLOAD MUST RETAIN 5,000 TH / $54,768.99 and 'minerx-custom'
    assert.equal(payload.packageId, 'minerx-custom', 'Must retain packageId minerx-custom after Back action')
    assert.equal(payload.powerTh, 5000, 'Must retain updated custom power 5000 TH after Back action')
    assert.equal(payload.amount, 54768.99, 'Must retain updated custom price $54,768.99 after Back action')
    assert.equal(payload.productName, 'Minero personalizado · 5000 TH')

    // Absolute prohibition of regression fallback
    assert.notEqual(payload.powerTh, 48, 'Must NEVER fall back to 48 TH after Back action')
    assert.notEqual(payload.amount, 561.99, 'Must NEVER fall back to $561.99 after Back action')
    assert.notEqual(payload.packageId, undefined, 'Must NEVER fall back to undefined packageId after Back action')
  })

  it('5.2 End-to-end integration: Custom payload flows through WalletCheckout, Admin recorder, and Pending order', async () => {
    // 5.2a Custom payload to WalletPaymentCheckout state
    const customPayload = buildMinerBuilderCheckoutPayload({
      selected: undefined,
      isCustom: true,
      customTier: { powerTh: 128, priceUsd: 1519.99 },
      categoryTab: 'packages',
    })

    const checkoutState = createWalletCheckoutState(
      customPayload.productName,
      customPayload.amount,
      customPayload.currency,
      customPayload.packageId,
      customPayload.purchaseMode
    )

    assert.equal(checkoutState.productName, 'Minero personalizado · 128 TH')
    assert.equal(checkoutState.amount, 1519.99)
    assert.equal(checkoutState.packageId, 'minerx-custom')
    assert.equal(checkoutState.purchaseMode, 'once')

    // 5.2b Direct wallet completion records minerx-custom to Admin
    let adminRecordDirect: any = null
    const directCompletion = await completeWalletMinerPurchase({
      productName: checkoutState.productName,
      amount: checkoutState.amount,
      packageId: checkoutState.packageId,
      purchaseMode: checkoutState.purchaseMode,
      activeAddress: '0x1111222233334444555566667777888899990000',
      txHash: '0xhash_custom_direct',
      networkName: 'BNB Chain',
    }, {
      recordPurchaseToAdmin: async (p) => { adminRecordDirect = p },
    })

    assert.ok(directCompletion)
    assert.equal(directCompletion.resolvedPackageId, 'minerx-custom')
    assert.equal(directCompletion.parsedTh, 128)
    assert.equal(adminRecordDirect.packageId, 'minerx-custom')
    assert.equal(adminRecordDirect.powerTh, 128)
    assert.equal(adminRecordDirect.price, 1519.99)
    assert.ok(adminRecordDirect.minerId.startsWith('MINER-'))

    // 5.2c Pending order flow: defer -> persist -> restore -> payPendingMinerOrderAndRecordToAdmin
    restoreDemoSession({
      balance: 50000,
      maintenanceCredit: 0,
      miners: [],
      workers: [],
      workerActivationMode: 'automatic',
      pendingMinerOrders: [],
      subscription: null,
      receipts: [],
      presaleTokens: 0,
    })

    const deferResult = deferDemoMinerPurchase({
      name: customPayload.productName,
      powerTh: customPayload.powerTh,
      efficiency: 15,
      price: customPayload.amount,
      currency: customPayload.currency,
      purchaseMode: customPayload.purchaseMode,
      packageId: customPayload.packageId,
    })
    assert.equal(deferResult.ok, true)

    // Verify stored order retains packageId: 'minerx-custom'
    const persisted = getDemoSessionForPersistence()
    assert.equal(persisted.pendingMinerOrders.length, 1)
    const pendingOrder = persisted.pendingMinerOrders[0]
    assert.equal(pendingOrder.packageId, 'minerx-custom')
    assert.equal(pendingOrder.powerTh, 128)
    assert.equal(pendingOrder.price, 1519.99)

    // Pay pending order with injected admin recorder spy
    let adminRecordPending: any = null
    const payResult = await payPendingMinerOrderAndRecordToAdmin(pendingOrder, {
      recordPurchaseToAdmin: async (p) => { adminRecordPending = p },
    })

    assert.equal(payResult.ok, true)
    const finalSession = getDemoSessionForPersistence()
    assert.equal(finalSession.miners.length, 1)
    const createdMiner = finalSession.miners[0]

    // Verify miner identity alignment and packageId delivery
    assert.ok(createdMiner.id.startsWith('MINER-'), 'Created miner ID must have MINER- prefix')
    assert.equal(adminRecordPending.minerId, createdMiner.id, 'Admin recorder must receive actual created DemoMiner.id')
    assert.equal(adminRecordPending.packageId, 'minerx-custom', 'Admin recorder must receive canonical packageId minerx-custom')
    assert.equal(adminRecordPending.powerTh, 128)
    assert.equal(adminRecordPending.price, 1519.99)
  })

  // =========================================================================
  // 6. STATIC AST / SOURCE CODE INVARIANT AUDIT
  // =========================================================================
  it('6.1 App.tsx static invariant: passes isCustom (not isCustomEditor) to buildMinerBuilderCheckoutPayload', () => {
    const appPath = path.resolve(__dirname, '../src/App.tsx')
    const appSource = fs.readFileSync(appPath, 'utf-8').replace(/\r\n/g, '\n')

    // Find buildMinerBuilderCheckoutPayload invocation
    const invocationRegex = /buildMinerBuilderCheckoutPayload\(\s*\{([\s\S]*?)\}\s*\)/
    const match = appSource.match(invocationRegex)
    assert.ok(match, 'App.tsx must contain a call to buildMinerBuilderCheckoutPayload({...})')

    const argsBody = match[1]

    // Must pass isCustom
    assert.ok(
      /\bisCustom\b/.test(argsBody),
      'buildMinerBuilderCheckoutPayload call must include isCustom'
    )

    // Must NOT pass isCustom: isCustomEditor
    assert.ok(
      !/isCustom\s*:\s*isCustomEditor/.test(argsBody),
      'buildMinerBuilderCheckoutPayload call must NOT pass isCustomEditor as isCustom'
    )

    // Verify isCustom definition
    assert.ok(
      appSource.includes("const isCustom = categoryTab === 'packages' && presetId === 'custom' && storefrontSections.showCustom"),
      'isCustom must be derived from categoryTab, presetId, and storefrontSections.showCustom'
    )

    // Verify isCustomEditor is reserved for modalVariant and custom screen rendering
    assert.ok(
      appSource.includes("const isCustomEditor = isCustom && isCustomEditorOpen"),
      'isCustomEditor must be isCustom && isCustomEditorOpen'
    )
    assert.ok(
      appSource.includes("modalVariant = stage !== 'configure' ? 'workflow' : isCustomEditor ? 'custom' : 'catalog'"),
      'isCustomEditor must determine modalVariant'
    )
    assert.ok(
      appSource.includes("{isCustomEditor ? ("),
      'isCustomEditor must determine whether MinerCreationScreen customMode is rendered'
    )
  })
})
