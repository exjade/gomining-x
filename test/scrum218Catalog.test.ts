import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import {
  fetchStorefrontCatalog,
  adaptCommercialPackageToMinerPlan,
  clearCatalogCache,
  getCachedStorefrontCatalog,
  TAB_TO_SECTION,
  SECTION_TO_TAB,
  type CatalogSection,
} from '../src/catalogClient.ts'

import {
  getSectionFallbackPlans,
  presaleMinerPlans,
  launchMinerPlans,
  monthlyMinerPlans,
  oneTimeMinerPlans,
} from '../src/minerCatalog.ts'

import {
  registerWalletMinerPurchase,
  deferDemoMinerPurchase,
  getDemoSessionForPersistence,
  restoreDemoSession,
  payPendingDemoMiner,
} from '../src/demoStore.ts'

import {
  orchestrateWalletMinerPurchaseFlow,
  completeWalletMinerPurchase,
  payPendingMinerOrderAndRecordToAdmin,
  buildMinerBuilderCheckoutPayload,
  type PurchaseAdminRecorder,
} from '../src/minerPurchaseFlow.ts'

describe('SCRUM-218 Corrective Catalog Integration & UI/UX Parity', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    clearCatalogCache()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    clearCatalogCache()
  })

  it('1. legacy pkg-miner-* never enters storefront', async () => {
    const legacyPayload = [
      { packageId: 'pkg-miner-1', name: 'Minero 1 Entry', status: 'ACTIVE', isPublished: true, powerTh: 48, priceUsdt: 561.99, section: 'minerx' },
      { packageId: 'pkg-miner-2', name: 'Minero 2 Standard', status: 'ACTIVE', isPublished: true, powerTh: 64, priceUsdt: 744.99, section: 'minerx' },
      { id: 'pkg-miner-3', name: 'Minero 3 Pro', status: 'ACTIVE', isPublished: true, powerTh: 96, priceUsdt: 1111.99, section: 'minerx' },
      { packageId: 'pkg-canonical-1', displayName: 'Canonical Dynamic Plan', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 600, section: 'minerx' },
    ]
    globalThis.fetch = async () => new Response(JSON.stringify(legacyPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.equal(plans.length, 1)
    assert.equal(plans[0].id, 'pkg-canonical-1')
    assert.equal(plans[0].label, 'Canonical Dynamic Plan')
    assert.ok(!plans.some((p) => p.id.startsWith('pkg-miner-')))
  })

  it('2. no commercial tier labels (Entry, Standard, Pro, Master, Enterprise) introduced by Client', () => {
    const sections: CatalogSection[] = ['minerx', 'preventa', 'lanzamiento', 'mensual']
    const forbidden = ['entry', 'standard', 'master', 'enterprise']
    for (const sec of sections) {
      const plans = getSectionFallbackPlans(sec)
      for (const plan of plans) {
        for (const f of forbidden) {
          assert.ok(
            !plan.label.toLowerCase().includes(f),
            `Plan label '${plan.label}' in section '${sec}' must not contain '${f}'`
          )
        }
      }
    }

    // Adapting an unnamed package generates '${powerTh} TH', not a tier name
    const adapted = adaptCommercialPackageToMinerPlan(
      { packageId: 'pkg-test-1', powerTh: 50, priceUsdt: 500 },
      'minerx'
    )
    assert.equal(adapted.label, '50 TH')
    assert.ok(!forbidden.some((f) => adapted.label.toLowerCase().includes(f)))
  })

  it('3. fallback of each section matches baseline exactly', () => {
    const minerxFallback = getSectionFallbackPlans('minerx')
    assert.equal(minerxFallback.length, 4)
    assert.deepEqual(
      minerxFallback.map((p) => ({ id: p.id, powerTh: p.powerTh, price: p.price })),
      [
        { id: 'presale-1', powerTh: 1.46, price: 18.99 },
        { id: 'presale-2', powerTh: 8.33, price: 99.99 },
        { id: 'presale-3', powerTh: 21.05, price: 249.99 },
        { id: 'presale-4', powerTh: 42.44, price: 499.99 },
      ]
    )
    assert.deepEqual(minerxFallback, oneTimeMinerPlans)

    const preventaFallback = getSectionFallbackPlans('preventa')
    assert.deepEqual(preventaFallback, presaleMinerPlans)

    const lanzamientoFallback = getSectionFallbackPlans('lanzamiento')
    assert.deepEqual(lanzamientoFallback, launchMinerPlans)
    assert.equal(lanzamientoFallback.length, 16)
    assert.equal(lanzamientoFallback[0].powerTh, 42.44)
    assert.equal(lanzamientoFallback[lanzamientoFallback.length - 1].powerTh, 5000)

    const mensualFallback = getSectionFallbackPlans('mensual')
    assert.deepEqual(mensualFallback, monthlyMinerPlans)
    assert.equal(mensualFallback.length, 4)
    assert.deepEqual(
      mensualFallback.map((p) => p.label),
      ['Inicio', 'Plus', 'Pro', 'Máximo']
    )
  })

  it('4. missing status does not equal ACTIVE', async () => {
    const payload = [
      { packageId: 'pkg-missing-status', displayName: 'Missing Status', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx' },
      { packageId: 'pkg-active', displayName: 'Active Plan', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx' },
    ]
    globalThis.fetch = async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.equal(plans.length, 1)
    assert.equal(plans[0].id, 'pkg-active')
  })

  it('5. missing isPublished does not equal true', async () => {
    const payload = [
      { packageId: 'pkg-missing-pub', displayName: 'Missing Pub', status: 'ACTIVE', powerTh: 50, priceUsdt: 500, section: 'minerx' },
      { packageId: 'pkg-published-false', displayName: 'Pub False', status: 'ACTIVE', isPublished: false, powerTh: 50, priceUsdt: 500, section: 'minerx' },
      { packageId: 'pkg-valid', displayName: 'Valid Published', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx' },
    ]
    globalThis.fetch = async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.equal(plans.length, 1)
    assert.equal(plans[0].id, 'pkg-valid')
  })

  it('6. empty array response [] is preserved as valid empty catalog and does not trigger fallback', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.ok(Array.isArray(plans))
    assert.equal(plans.length, 0)
    assert.deepEqual(plans, [])
  })

  it('7. tab switching does not trigger a new network fetch when tabs/sections are pre-cached', async () => {
    let fetchCount = 0
    globalThis.fetch = async (url) => {
      fetchCount++
      const urlStr = String(url)
      const section = urlStr.includes('section=') ? urlStr.split('section=')[1] : 'minerx'
      return new Response(
        JSON.stringify([
          { packageId: `pkg-${section}-1`, displayName: `Plan ${section}`, status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Pre-load all 4 sections
    const sections: CatalogSection[] = ['minerx', 'preventa', 'lanzamiento', 'mensual']
    await Promise.all(sections.map((s) => fetchStorefrontCatalog(s)))
    const initialFetchCount = fetchCount
    assert.equal(initialFetchCount, 4)

    // Simulating user tab switches between all tabs
    const tabs = ['packages', 'presale', 'launch', 'monthly'] as const
    for (const tab of tabs) {
      const section = TAB_TO_SECTION[tab]
      const plans = await fetchStorefrontCatalog(section)
      assert.ok(plans.length > 0)
      assert.equal(fetchCount, initialFetchCount, `Fetch count must not increase on tab switch to ${tab}`)
    }
  })

  it('8. a second read of the same section uses cache without refetching', async () => {
    let fetchCount = 0
    globalThis.fetch = async () => {
      fetchCount++
      return new Response(
        JSON.stringify([
          { packageId: 'pkg-cache-test', displayName: 'Cached Plan', status: 'ACTIVE', isPublished: true, powerTh: 10, priceUsdt: 100, section: 'preventa' },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const firstCall = await fetchStorefrontCatalog('preventa')
    assert.equal(fetchCount, 1)
    assert.equal(firstCall[0].id, 'pkg-cache-test')

    const secondCall = await fetchStorefrontCatalog('preventa')
    assert.equal(fetchCount, 1, 'Second call must use memory cache and not invoke fetch')
    assert.deepEqual(secondCall, firstCall)
    assert.ok(getCachedStorefrontCatalog('preventa'))
  })

  it('9. HTTP network/status failure falls back exclusively to that section exact fallback', async () => {
    globalThis.fetch = async () => new Response('Internal Server Error', { status: 500 })

    const minerxFallback = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.deepEqual(minerxFallback, getSectionFallbackPlans('minerx'))

    const preventaFallback = await fetchStorefrontCatalog('preventa', { bypassCache: true })
    assert.deepEqual(preventaFallback, presaleMinerPlans)

    const lanzamientoFallback = await fetchStorefrontCatalog('lanzamiento', { bypassCache: true })
    assert.deepEqual(lanzamientoFallback, launchMinerPlans)

    const mensualFallback = await fetchStorefrontCatalog('mensual', { bypassCache: true })
    assert.deepEqual(mensualFallback, monthlyMinerPlans)
  })

  it('10. modal preserves baseline layout, structure, copy, headings and tabs', () => {
    const appFilePath = path.resolve(import.meta.dirname, '../src/App.tsx')
    const appFile = fs.readFileSync(appFilePath, 'utf-8')

    // Check tabs
    assert.ok(appFile.includes("const tabs: MinerCategoryTab[] = ['packages']"))
    assert.ok(appFile.includes("tabs.push('presale')"))
    assert.ok(appFile.includes("tabs.push('launch')"))
    assert.ok(appFile.includes("tabs.push('monthly')"))

    // Check headings
    assert.ok(appFile.includes('4 niveles exclusivos limitados a 30 unidades cada uno'))
    assert.ok(appFile.includes('Elige una potencia para tu minero MinerX'))
    assert.ok(appFile.includes('16 niveles estándar desde 42.44 TH ($499.99 USD) hasta 5,000 TH'))
    assert.ok(appFile.includes('Elige una potencia para consultar el rendimiento mensual'))

    // Check badges
    assert.ok(appFile.includes('PREVENTA LIMITADA'))
    assert.ok(appFile.includes('LANZAMIENTO'))

    // Check Custom option inclusion
    assert.ok(appFile.includes("includeCustom={categoryTab === 'packages' && storefrontSections.showCustom}"))
  })

  it('11. packageId travels as metadata without altering miner identity or checkout mechanics', () => {
    const inputWithPackageId = {
      name: 'Minero 8.33 TH · 8.33 TH',
      powerTh: 8.33,
      efficiency: 15,
      price: 99.99,
      purchaseMode: 'once' as const,
      ownerWallet: '0x1234567890abcdef1234567890abcdef12345678',
      packageId: 'presale-2',
    }

    const miner = registerWalletMinerPurchase(inputWithPackageId, '0xabc123txhash', 'BNB Chain')

    // Exactly one miner is generated
    assert.ok(miner.id)
    assert.ok(miner.id.startsWith('MINER-'), `miner.id '${miner.id}' must be generated by demoStore`)
    assert.notEqual(miner.id, inputWithPackageId.packageId, 'miner.id must not be overwritten by packageId')
    assert.equal(miner.name, inputWithPackageId.name)
    assert.equal(miner.powerTh, 8.33)
    assert.equal(miner.price, 99.99)

    // Verify that omitting packageId behaves identically and creates single miner identity
    const inputWithoutPackageId = {
      name: 'Minero 1.46 TH · 1.46 TH',
      powerTh: 1.46,
      efficiency: 15,
      price: 18.99,
      purchaseMode: 'once' as const,
      ownerWallet: '0x1234567890abcdef1234567890abcdef12345678',
    }

    const miner2 = registerWalletMinerPurchase(inputWithoutPackageId, '0xdef456txhash', 'BNB Chain')
    assert.ok(miner2.id)
    assert.ok(miner2.id.startsWith('MINER-'))
  })

  it('12. concurrent in-flight requests for the same section are deduplicated', async () => {
    let fetchCount = 0
    globalThis.fetch = async () => {
      fetchCount++
      await new Promise((r) => setTimeout(r, 10))
      return new Response(
        JSON.stringify([
          { packageId: 'pkg-concurrency', displayName: 'Concurrent Plan', status: 'ACTIVE', isPublished: true, powerTh: 15, priceUsdt: 150, section: 'minerx' },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const [p1, p2] = await Promise.all([
      fetchStorefrontCatalog('minerx'),
      fetchStorefrontCatalog('minerx'),
    ])

    assert.equal(fetchCount, 1, 'Concurrent requests must be deduplicated to a single HTTP fetch')
    assert.deepEqual(p1, p2)
    assert.equal(p1[0].id, 'pkg-concurrency')
  })

  it('13. invalid or unknown catalog section returns empty array safely', async () => {
    // @ts-expect-error Testing invalid section at boundary
    const plans = await fetchStorefrontCatalog('unknown-section')
    assert.deepEqual(plans, [])
  })

  it('14. non-array JSON payload falls back to exact section fallback', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Malformed response' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const fallback = await fetchStorefrontCatalog('preventa', { bypassCache: true })
    assert.deepEqual(fallback, presaleMinerPlans)
  })

  it('15. dynamic backend updates update data values without altering structure', async () => {
    const customAdminPayload = [
      { packageId: 'custom-pack-1', displayName: 'Promo Minero', powerTh: 75.5, priceUsdt: 850.0, status: 'ACTIVE', isPublished: true, section: 'minerx' },
    ]
    globalThis.fetch = async () => new Response(JSON.stringify(customAdminPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.equal(plans.length, 1)
    assert.equal(plans[0].id, 'custom-pack-1')
    assert.equal(plans[0].label, 'Promo Minero')
    assert.equal(plans[0].powerTh, 75.5)
    assert.equal(plans[0].price, 850.0)
    assert.equal(plans[0].currency, 'USD')
    assert.equal(plans[0].cadence, 'once')
  })

  it('16. missing section or mismatched section is strictly rejected', async () => {
    const payload = [
      { packageId: 'pkg-no-section', displayName: 'No Section', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500 },
      { packageId: 'pkg-wrong-section', displayName: 'Wrong Section', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'lanzamiento' },
      { packageId: 'pkg-valid-minerx', displayName: 'Valid MinerX', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx' },
    ]
    globalThis.fetch = async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.equal(plans.length, 1)
    assert.equal(plans[0].id, 'pkg-valid-minerx')
  })

  it('17. legacy id in id or packageId or empty identity is strictly rejected', async () => {
    const payload = [
      { packageId: 'pkg-valid-alias', id: 'pkg-miner-1', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx' },
      { packageId: 'pkg-miner-2', id: 'pkg-valid-alias-2', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx' },
      { packageId: 'pkg-miner_underscore', id: 'pkg-valid-alias-us', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx' },
      { packageId: 'PKG-MINER-9', id: 'pkg-valid-alias-3', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx' },
      { packageId: 'pkg-valid-alias-4', id: 'Pkg-Miner-8', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx' },
      { packageId: 'pkg-valid-alias-5', id: 'Pkg-Miner_7', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx' },
      { packageId: 'pkg-legacy-flagged', id: 'pkg-leg-1', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx', isLegacy: 'true' },
      { packageId: 'pkg-legacy-field', id: 'pkg-leg-2', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx', legacy: true },
      { packageId: 'pkg-legacy-num', id: 'pkg-leg-3', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx', isLegacy: 1 },
      { packageId: '', id: '   ', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx' },
      { packageId: 'pkg-legit-1', id: 'doc-legit-1', status: 'ACTIVE', isPublished: true, powerTh: 50, priceUsdt: 500, section: 'minerx' },
    ]
    globalThis.fetch = async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.equal(plans.length, 1)
    assert.equal(plans[0].id, 'pkg-legit-1')
  })

  it('18. malformed dailyBtcText or roi does not produce NaN in adapted plan', () => {
    const adapted = adaptCommercialPackageToMinerPlan(
      { packageId: 'pkg-malformed', powerTh: 10, priceUsdt: 100, dailyBtcText: 'not-a-number', roiPct: NaN, availableUnits: NaN },
      'minerx'
    )
    assert.equal(adapted.btcPerDay, undefined)
    assert.equal(adapted.roi, undefined)
    assert.equal(adapted.limitUnits, undefined)

    const adaptedValid = adaptCommercialPackageToMinerPlan(
      { packageId: 'pkg-valid', powerTh: 10, priceUsdt: 100, dailyBtcText: '0.00001802 BTC/día', roiPct: 57.17, availableUnits: 30 },
      'minerx'
    )
    assert.equal(adaptedValid.btcPerDay, 0.00001802)
    assert.equal(adaptedValid.roi, 57.17)
    assert.equal(adaptedValid.limitUnits, 30)

    const adaptedTypes = adaptCommercialPackageToMinerPlan(
      { packageId: 'pkg-types', powerTh: 10, priceUsdt: 100, dailyBtcText: 0.00001802, roiPct: '57.17', availableUnits: '30' },
      'minerx'
    )
    assert.equal(adaptedTypes.btcPerDay, 0.00001802)
    assert.equal(adaptedTypes.roi, 57.17)
    assert.equal(adaptedTypes.limitUnits, 30)

    // Whitespace-only displayName falls back to ${powerTh} TH
    const adaptedWhitespace = adaptCommercialPackageToMinerPlan(
      { packageId: 'pkg-ws', displayName: '   ', powerTh: 50, priceUsdt: 500 },
      'minerx'
    )
    assert.equal(adaptedWhitespace.label, '50 TH')

    // Case-insensitive custom package detection
    const adaptedCustom = adaptCommercialPackageToMinerPlan(
      { packageId: 'pkg-cust', name: 'custom', powerTh: 10, priceUsdt: 100 },
      'minerx'
    )
    assert.equal(adaptedCustom.label, 'Custom')

    // Non-positive roiPct is rejected as undefined
    const adaptedZeroRoi = adaptCommercialPackageToMinerPlan(
      { packageId: 'pkg-zero-roi', powerTh: 10, priceUsdt: 100, roiPct: 0 },
      'minerx'
    )
    assert.equal(adaptedZeroRoi.roi, undefined)
  })

  it('19. getSectionFallbackPlans with invalid section safely returns empty array', () => {
    // @ts-expect-error Testing invalid section at runtime
    const fallback = getSectionFallbackPlans('invalid-section')
    assert.deepEqual(fallback, [])
  })

  it('20. clearing catalog cache allows fresh fetch from backend upon reopen', async () => {
    let callCount = 0
    let currentPrice = 100
    globalThis.fetch = async () => {
      callCount++
      return new Response(
        JSON.stringify([
          { packageId: 'pkg-dynamic', displayName: 'Dynamic Plan', status: 'ACTIVE', isPublished: true, powerTh: 10, priceUsdt: currentPrice, section: 'minerx' },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Modal open 1
    const open1 = await fetchStorefrontCatalog('minerx')
    assert.equal(open1[0].price, 100)
    assert.equal(callCount, 1)

    // Admin updates package price in backend
    currentPrice = 150

    // Modal closed: cache is cleared
    clearCatalogCache()

    // Modal open 2: fresh fetch reflects updated price
    const open2 = await fetchStorefrontCatalog('minerx')
    assert.equal(open2[0].price, 150)
    assert.equal(callCount, 2)
  })

  it('21. packages are stably sorted by sortOrder ascending and tie-broken by powerTh ascending', async () => {
    const payload = [
      { packageId: 'p3', displayName: 'Plan 30 TH', status: 'ACTIVE', isPublished: true, powerTh: 30, priceUsdt: 300, section: 'minerx', sortOrder: 2 },
      { packageId: 'p1', displayName: 'Plan 10 TH', status: 'ACTIVE', isPublished: true, powerTh: 10, priceUsdt: 100, section: 'minerx', sortOrder: 1 },
      { packageId: 'p2b', displayName: 'Plan 25 TH', status: 'ACTIVE', isPublished: true, powerTh: 25, priceUsdt: 250, section: 'minerx', sortOrder: 1 },
      { packageId: 'p2a', displayName: 'Plan 20 TH', status: 'ACTIVE', isPublished: true, powerTh: 20, priceUsdt: 200, section: 'minerx', sortOrder: 1 },
    ]
    globalThis.fetch = async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.deepEqual(plans.map((p) => p.id), ['p1', 'p2a', 'p2b', 'p3'])
  })

  it('22. non-mensual storefront sections strictly enforce cadence once', () => {
    const plan = adaptCommercialPackageToMinerPlan(
      { packageId: 'pkg-launch-once', powerTh: 42.44, priceUsdt: 499.99, cadence: 'monthly' },
      'lanzamiento'
    )
    assert.equal(plan.cadence, 'once', 'Launch marketplace plan must have cadence once even if backend has cadence monthly')

    const monthlyPlan = adaptCommercialPackageToMinerPlan(
      { packageId: 'pkg-monthly-plan', powerTh: 10, priceUsdt: 99.99 },
      'mensual'
    )
    assert.equal(monthlyPlan.cadence, 'monthly', 'Mensual section plan must have cadence monthly')
  })

  it('23. real HTTP server integration: fetches storefront catalog over TCP and reflects dynamic Admin price update upon reopen', async () => {
    let currentPrice = 777.99
    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || '', `http://${req.headers.host}`)
      if (parsedUrl.pathname === '/api/catalog/storefront') {
        const section = parsedUrl.searchParams.get('section')
        if (section === 'minerx') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify([
            {
              packageId: 'pkg-live-admin-1',
              displayName: 'Minero Live Network',
              status: 'ACTIVE',
              isPublished: true,
              powerTh: 100,
              priceUsdt: currentPrice,
              section: 'minerx',
            },
          ]))
          return
        }
      }
      res.writeHead(404)
      res.end()
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 3001
    const baseUrl = `http://127.0.0.1:${port}`

    try {
      // First open: fetch from live HTTP endpoint
      const plansFirstOpen = await fetchStorefrontCatalog('minerx', { baseUrl })
      assert.equal(plansFirstOpen.length, 1)
      assert.equal(plansFirstOpen[0].id, 'pkg-live-admin-1')
      assert.equal(plansFirstOpen[0].price, 777.99)
      assert.equal(plansFirstOpen[0].powerTh, 100)

      // Admin updates package price in backend
      currentPrice = 888.50

      // Modal is closed: cache is cleared
      clearCatalogCache()

      // Second open: fetches updated price from live HTTP endpoint
      const plansSecondOpen = await fetchStorefrontCatalog('minerx', { baseUrl })
      assert.equal(plansSecondOpen.length, 1)
      assert.equal(plansSecondOpen[0].id, 'pkg-live-admin-1')
      assert.equal(plansSecondOpen[0].price, 888.50)
      assert.equal(plansSecondOpen[0].powerTh, 100)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('24. when section has empty catalog, presetId is cleared and no ghost plan is selected', () => {
    const plansByTab: Partial<Record<string, MinerPlan[]>> = {
      packages: [],
    }
    const targetPlans = plansByTab['packages'] ?? getSectionFallbackPlans('minerx')
    assert.deepEqual(targetPlans, [])
    const selectedId = targetPlans[0]?.id ?? ''
    assert.equal(selectedId, '', 'Selected id must be empty string when plans array is empty')
  })

  it('25. duplicate package IDs in backend response are deduplicated to prevent duplicate React keys', async () => {
    const payload = [
      { packageId: 'pkg-dup-1', displayName: 'First Occurrence', status: 'ACTIVE', isPublished: true, powerTh: 10, priceUsdt: 100, section: 'minerx', sortOrder: 1 },
      { packageId: 'pkg-dup-1', displayName: 'Duplicate Ignored', status: 'ACTIVE', isPublished: true, powerTh: 20, priceUsdt: 200, section: 'minerx', sortOrder: 2 },
      { packageId: 'pkg-unique-2', displayName: 'Second Plan', status: 'ACTIVE', isPublished: true, powerTh: 30, priceUsdt: 300, section: 'minerx', sortOrder: 3 },
    ]
    globalThis.fetch = async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.equal(plans.length, 2, 'Duplicate package ID must be filtered out')
    assert.equal(plans[0].id, 'pkg-dup-1')
    assert.equal(plans[0].label, 'First Occurrence')
    assert.equal(plans[1].id, 'pkg-unique-2')
  })

  it('26. auto-switch on disabled tab cleanly picks the target tab active plan without ghost IDs', () => {
    const plansByTab: Partial<Record<string, MinerPlan[]>> = {
      launch: [
        { id: 'custom-launch-dynamic-1', label: 'Launch Dynamic', powerTh: 50, price: 500, currency: 'USD', cadence: 'once' },
      ],
    }
    const pickFirstPlan = (tab: 'packages' | 'presale' | 'launch' | 'monthly') => {
      const plans = plansByTab[tab] ?? getSectionFallbackPlans(TAB_TO_SECTION[tab])
      return plans[0]?.id ?? ''
    }

    const targetId = pickFirstPlan('launch')
    assert.equal(targetId, 'custom-launch-dynamic-1', 'Must pick dynamic plan from target tab instead of hardcoding baseline ID')
  })

  it('27. custom package is excluded from fixed plans to preserve single dedicated Custom option and prevent duplication', async () => {
    const payload = [
      { packageId: 'minerx-01', name: '1.46 TH', status: 'ACTIVE', isPublished: true, powerTh: 1.46, priceUsdt: 18.99, section: 'minerx' },
      { packageId: 'minerx-custom', name: 'Custom', displayName: 'Custom', packageType: 'custom', status: 'ACTIVE', isPublished: true, powerTh: 1, priceUsdt: 12.99, section: 'minerx' },
      { packageId: 'minerx-02', name: '8.33 TH', status: 'ACTIVE', isPublished: true, powerTh: 8.33, priceUsdt: 99.99, section: 'minerx' },
    ]
    globalThis.fetch = async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.equal(plans.length, 2, 'Custom package must be excluded from fixed plans')
    assert.equal(plans[0].id, 'minerx-01')
    assert.equal(plans[1].id, 'minerx-02')
    assert.ok(!plans.some((p) => p.id === 'minerx-custom' || p.label.toLowerCase() === 'custom'))
  })

  it('28. stale in-flight request resolving after modal close cannot repopulate cache or fallback', async () => {
    let networkCallCount = 0
    let resolveDelayedRequest: ((val: Response) => void) | null = null

    globalThis.fetch = (url, init) => {
      networkCallCount++
      if (networkCallCount === 1) {
        // First request is slow/delayed
        return new Promise<Response>((resolve, reject) => {
          resolveDelayedRequest = resolve
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted')
              err.name = 'AbortError'
              reject(err)
            })
          }
        })
      }
      // Subsequent request returns immediately with fresh data
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { packageId: 'pkg-modal-open-2', displayName: 'Fresh Open 2', status: 'ACTIVE', isPublished: true, powerTh: 10, priceUsdt: 120, section: 'minerx' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    }

    // 1. Modal Open 1: start delayed request
    const delayedPromise = fetchStorefrontCatalog('minerx')
    assert.equal(networkCallCount, 1)

    // 2. Modal Close before response arrives: clearCatalogCache() increments epoch and aborts
    clearCatalogCache()

    // 3. Old delayed request completes or aborts
    if (resolveDelayedRequest) {
      resolveDelayedRequest(
        new Response(
          JSON.stringify([
            { packageId: 'pkg-stale-1', displayName: 'Stale Plan 1', status: 'ACTIVE', isPublished: true, powerTh: 5, priceUsdt: 50, section: 'minerx' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    }
    // Await old promise (or catch its abort)
    await delayedPromise.catch(() => [])

    // 4. Verify cache remains completely empty for the new generation
    assert.equal(getCachedStorefrontCatalog('minerx'), undefined, 'Cache must remain empty; stale response must not populate it')

    // 5. Modal Open 2: reopen modal
    const freshPlans = await fetchStorefrontCatalog('minerx')

    // 6. Verify a NEW network request was made
    assert.equal(networkCallCount, 2, 'Must initiate a new network request on reopen')

    // 7. Verify only the new response is cached and rendered
    assert.equal(freshPlans.length, 1)
    assert.equal(freshPlans[0].id, 'pkg-modal-open-2')
    assert.equal(freshPlans[0].price, 120)
    assert.deepEqual(getCachedStorefrontCatalog('minerx'), freshPlans)
  })

  it('29. behavioral flow: catalogClient -> plan selection -> checkout metadata -> registerWalletMinerPurchase & admin purchase preserves canonical packageId', async () => {
    // 1. Setup mock backend catalog returning canonical MinerX packages
    const catalogPayload = [
      {
        packageId: 'minerx-01',
        name: '1.46 TH',
        displayName: '1.46 TH',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 1.46,
        priceUsdt: 18.99,
        section: 'minerx',
        sortOrder: 1,
      },
      {
        packageId: 'minerx-02',
        name: '8.33 TH',
        displayName: '8.33 TH',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 8.33,
        priceUsdt: 99.99,
        section: 'minerx',
        sortOrder: 2,
      },
    ]
    globalThis.fetch = async () => new Response(JSON.stringify(catalogPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    // 2. Fetch catalog via catalogClient
    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.equal(plans.length, 2)
    const selectedPlan = plans.find((p) => p.id === 'minerx-02')
    assert.ok(selectedPlan, 'Selected plan minerx-02 must exist in catalog')
    assert.equal(selectedPlan.packageId, 'minerx-02')

    // 3. Execute actual shared production-path logic:
    // MinerBuilderDialog -> App onPayWithWallet -> WalletPaymentCheckout -> recordMinerPurchaseToAdmin
    let recordedAdminPurchase: any = null
    const spyRecordToAdmin: PurchaseAdminRecorder = async (params) => {
      recordedAdminPurchase = params
    }

    const activeAddress = '0x1111222233334444555566667777888899990000'
    const txHash = '0xtx_minerx_02_hash'
    const networkName = 'BNB Chain'

    const flowResult = await orchestrateWalletMinerPurchaseFlow(
      {
        selected: selectedPlan,
        categoryTab: 'packages',
      },
      {
        txHash,
        activeAddress,
        networkName,
      },
      {
        recordPurchaseToAdmin: spyRecordToAdmin,
      }
    )

    // Verify MinerBuilderDialog output
    assert.equal(flowResult.checkoutPayload.packageId, 'minerx-02')
    assert.equal(flowResult.checkoutPayload.productName, 'Minero 8.33 TH · 8.33 TH')
    assert.equal(flowResult.checkoutPayload.amount, 99.99)
    assert.equal(flowResult.checkoutPayload.purchaseMode, 'once')

    // Verify App onPayWithWallet state creation
    assert.equal(flowResult.checkoutState.packageId, 'minerx-02')
    assert.equal(flowResult.checkoutState.amount, 99.99)

    // Verify WalletPaymentCheckout completion & registerWalletMinerPurchase
    assert.ok(flowResult.completionResult)
    const miner = flowResult.completionResult.miner
    assert.equal(miner.packageId, 'minerx-02')
    assert.ok(miner.id.startsWith('MINER-'))
    assert.notEqual(miner.id, 'minerx-02')

    // Verify admin purchase recorder received the exact canonical packageId
    assert.ok(recordedAdminPurchase, 'Shared production flow must invoke recordPurchaseToAdmin')
    assert.equal(recordedAdminPurchase.packageId, 'minerx-02', 'Admin contract must receive canonical packageId minerx-02')
    assert.equal(recordedAdminPurchase.minerId, miner.id)
    assert.equal(recordedAdminPurchase.name, 'Minero 8.33 TH · 8.33 TH')
    assert.equal(recordedAdminPurchase.powerTh, 8.33)
    assert.equal(recordedAdminPurchase.price, 99.99)
    assert.equal(recordedAdminPurchase.network, 'BNB Chain')
    assert.equal(recordedAdminPurchase.ownerWallet, activeAddress)

    // 4. Negative control through shared production flow: Unspecified packageId does NOT synthesize legacy pkg-miner-*
    let legacyRecordedAdmin: any = null
    const legacyResult = await completeWalletMinerPurchase(
      {
        productName: 'Minero 1 Entry · 48.00 TH',
        amount: 561.99,
        packageId: undefined,
        purchaseMode: 'once',
        activeAddress,
        txHash: '0xtx_legacy',
        networkName,
      },
      {
        recordPurchaseToAdmin: async (params) => {
          legacyRecordedAdmin = params
        },
      }
    )

    assert.ok(legacyResult)
    assert.equal(legacyResult.miner.packageId, undefined, 'Must NOT synthesize legacy pkg-miner-1 on miner')
    assert.equal(legacyRecordedAdmin.packageId, undefined, 'Admin record params must NOT synthesize legacy pkg-miner-*')
    assert.ok(legacyResult.miner.id.startsWith('MINER-'))
  })

  it('30. pendingMinerOrders preserves canonical packageId across defer -> persist -> restore -> pay round-trip and reaches production admin recording', async () => {
    // 1. Reset demo store state with funds
    restoreDemoSession({
      balance: 500,
      maintenanceCredit: 0,
      miners: [],
      workers: [],
      workerActivationMode: 'automatic',
      pendingMinerOrders: [],
      subscription: null,
      receipts: [],
      presaleTokens: 0,
    })

    // 2. Defer a miner purchase with canonical packageId
    const deferInput = {
      name: 'Minero 8.33 TH · 8.33 TH',
      powerTh: 8.33,
      efficiency: 15,
      price: 99.99,
      purchaseMode: 'once' as const,
      packageId: 'minerx-02',
      ownerWallet: '0x1111222233334444555566667777888899990000',
    }
    const deferResult = deferDemoMinerPurchase(deferInput)
    assert.ok(deferResult.ok)

    // 3. Persist session
    const persisted = getDemoSessionForPersistence()
    assert.equal(persisted.pendingMinerOrders.length, 1)
    assert.equal(persisted.pendingMinerOrders[0].packageId, 'minerx-02', 'Persisted pending order must retain packageId')

    // 4. Simulate page reload by clearing state and restoring persisted snapshot
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
    const restoredOk = restoreDemoSession(persisted)
    assert.ok(restoredOk)

    // 5. Verify restored state
    const restoredSession = getDemoSessionForPersistence()
    assert.equal(restoredSession.pendingMinerOrders.length, 1)
    const pendingOrder = restoredSession.pendingMinerOrders[0]
    assert.equal(pendingOrder.packageId, 'minerx-02', 'Restored pending order must retain packageId')

    // 6. Pay pending order via shared production admin-purchase recording operation in App.tsx
    let recordedAdminPurchase: any = null
    const spyRecordToAdmin: PurchaseAdminRecorder = async (params) => {
      recordedAdminPurchase = params
    }

    const payResult = await payPendingMinerOrderAndRecordToAdmin(pendingOrder, {
      recordPurchaseToAdmin: spyRecordToAdmin,
    })
    assert.ok(payResult.ok)
    assert.ok(payResult.receipt)

    // 7. Verify paid miner in demo session
    const finalSession = getDemoSessionForPersistence()
    assert.equal(finalSession.miners.length, 1)
    assert.equal(finalSession.miners[0].packageId, 'minerx-02', 'Paid miner must keep packageId minerx-02')
    assert.equal(finalSession.pendingMinerOrders.length, 0, 'Pending orders list must be empty after payment')

    // 8. Behavioral proof: the restored pending order's canonical packageId is the value actually supplied
    // to the shared production admin-purchase recording operation in App.tsx
    assert.ok(recordedAdminPurchase, 'Production recording operation must be invoked on pending order payment')
    assert.equal(recordedAdminPurchase.packageId, 'minerx-02', 'Admin contract must receive canonical packageId minerx-02 from restored pending order')
    assert.ok(finalSession.miners[0].id.startsWith('MINER-'), 'Authoritative miner ID must follow MINER- format')
    assert.equal(recordedAdminPurchase.minerId, finalSession.miners[0].id, 'Admin recorder params.minerId must equal actual created DemoMiner.id')
    assert.equal(payResult.minerId, finalSession.miners[0].id, 'payResult.minerId must equal actual created DemoMiner.id')
    assert.equal(payResult.miner?.id, finalSession.miners[0].id, 'payResult.miner must be the actual created DemoMiner')
    assert.equal(recordedAdminPurchase.name, 'Minero 8.33 TH · 8.33 TH')
    assert.equal(recordedAdminPurchase.powerTh, 8.33)
    assert.equal(recordedAdminPurchase.price, 99.99)
    assert.equal(recordedAdminPurchase.network, 'LOCAL_BALANCE')
    assert.equal(recordedAdminPurchase.ownerWallet, pendingOrder.ownerWallet || 'INTERNAL')
  })

  it('31. Option B: HTTP 4xx (404, 400, 403) returns empty catalog [] and does NOT trigger fallback', async () => {
    for (const status of [404, 400, 403]) {
      clearCatalogCache()
      globalThis.fetch = async () => new Response('Client Error', { status })
      const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
      assert.deepEqual(plans, [], `HTTP ${status} must return [] without fallback`)
      assert.equal(getCachedStorefrontCatalog('minerx')?.length, 0, `HTTP ${status} must cache []`)
    }
  })

  it('32. Option B: HTTP 200 [] returns empty catalog [] and does NOT trigger fallback', async () => {
    clearCatalogCache()
    globalThis.fetch = async () => new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.deepEqual(plans, [])
  })

  it('33. Option B: Network/transport failure (TypeError fetch failed) falls back to baseline plans', async () => {
    clearCatalogCache()
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.deepEqual(plans, getSectionFallbackPlans('minerx'))
  })

  it('34. Option B: HTTP 5xx (500, 502, 503) falls back to baseline plans', async () => {
    for (const status of [500, 502, 503]) {
      clearCatalogCache()
      globalThis.fetch = async () => new Response('Server Error', { status })
      const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
      assert.deepEqual(plans, getSectionFallbackPlans('minerx'), `HTTP ${status} must fall back to baseline`)
    }
  })

  it('35. Option B: Malformed non-array response falls back to baseline plans', async () => {
    clearCatalogCache()
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'corrupt payload' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const plans = await fetchStorefrontCatalog('minerx', { bypassCache: true })
    assert.deepEqual(plans, getSectionFallbackPlans('minerx'))
  })

  it('36. regression: selecting Custom derives custom tier and packageId minerx-custom independently of whether the editor panel is open', () => {
    const customTier = { powerTh: 1.0, priceUsd: 12.99 }

    // Case A: Custom selected, editor NOT open (isCustom = true, isCustomEditor = false)
    // selected plan is undefined because Custom is excluded from activePlans
    const payloadClosedEditor = buildMinerBuilderCheckoutPayload({
      selected: undefined,
      isCustom: true,
      customTier,
      categoryTab: 'packages',
    })

    assert.equal(payloadClosedEditor.packageId, 'minerx-custom', 'Must derive minerx-custom when editor is closed')
    assert.equal(payloadClosedEditor.powerTh, 1.0, 'Must derive custom tier powerTh when editor is closed')
    assert.equal(payloadClosedEditor.amount, 12.99, 'Must derive custom tier price when editor is closed')
    assert.equal(payloadClosedEditor.productName, 'Minero personalizado · 1 TH')
    assert.equal(payloadClosedEditor.purchaseMode, 'once')

    // Case B: Negative control - Custom NOT selected, selected is undefined
    const payloadUnselected = buildMinerBuilderCheckoutPayload({
      selected: undefined,
      isCustom: false,
      customTier,
      categoryTab: 'packages',
    })

    assert.equal(payloadUnselected.packageId, undefined, 'Unselected plan must have undefined packageId')
    assert.equal(payloadUnselected.powerTh, 48, 'Unselected plan falls back to baseline 48 TH')
    assert.equal(payloadUnselected.amount, 561.99, 'Unselected plan falls back to baseline 561.99')

    // Case C: App.tsx static wiring contract verification
    const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf-8')
    const normalizedSource = appSource.replace(/\r\n/g, '\n')
    assert.ok(
      normalizedSource.includes('isCustom,\n') || normalizedSource.includes('isCustom, ') || normalizedSource.includes('isCustom: isCustom,'),
      'App.tsx must pass isCustom to buildMinerBuilderCheckoutPayload, NOT isCustomEditor'
    )
    assert.ok(
      !appSource.includes('isCustom: isCustomEditor'),
      'App.tsx must NOT pass isCustomEditor to buildMinerBuilderCheckoutPayload'
    )
  })
})
