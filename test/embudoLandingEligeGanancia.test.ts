import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { customMinerPriceTiers } from '../src/minerCatalog.ts'
import {
  TEARDOWN_PRESALE_DESIGNS,
  buildTeardownIframeUrl,
  buildTeardownPostMessagePayload,
  isTrustedTeardownMessage,
} from '../src/components/teardown-miner-preview/designCatalog.ts'
import {
  CHOOSE_EARNINGS_TIERS,
  GENESIS_REMAINING_SPOTS,
  GENESIS_TAKEN_SPOTS,
  GENESIS_TOTAL_SPOTS,
  computeChooseEarningsMetrics,
  computeLaunchPriceUsd,
  formatPaybackLabel,
} from '../src/components/sections/chooseEarningsModel.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const landingSource = fs.readFileSync(path.join(projectRoot, 'src/LandingPage.tsx'), 'utf8')
const sectionSource = fs.readFileSync(
  path.join(projectRoot, 'src/components/sections/ChooseEarningsSection.tsx'),
  'utf8',
)
const hudSource = fs.readFileSync(
  path.join(projectRoot, 'src/components/sections/ChooseEarningsHud.tsx'),
  'utf8',
)
const modelSource = fs.readFileSync(
  path.join(projectRoot, 'src/components/sections/chooseEarningsModel.ts'),
  'utf8',
)
const cssSource = fs.readFileSync(
  path.join(projectRoot, 'src/components/sections/chooseEarningsSection.css'),
  'utf8',
)
const calculatorSource = fs.readFileSync(
  path.join(projectRoot, 'src/components/sections/CalculatorSection.tsx'),
  'utf8',
)
const whyPouwMinerSource = fs.readFileSync(
  path.join(projectRoot, 'src/components/sections/WhyPouwMinerSection.tsx'),
  'utf8',
)

test('EMBUDO-LANDING-ELIGE-GANANCIA: LandingPage replaces PresaleSection with ChooseEarningsSection', () => {
  assert.match(landingSource, /import\s*\{\s*ChooseEarningsSection\s*\}\s*from\s*'\.\/components\/sections\/ChooseEarningsSection'/)
  assert.match(landingSource, /import\s*\{\s*WhyPouwMinerSection\s*\}\s*from\s*'\.\/components\/sections\/WhyPouwMinerSection'/)
  assert.match(landingSource, /export const SHOW_CALCULATOR_SECTION = false/)
  assert.match(landingSource, /\{SHOW_CALCULATOR_SECTION && <CalculatorSection onOpenAuth=\{handleOpenAuth\} \/>\}/)
  assert.match(
    landingSource,
    /<ChooseEarningsSection onOrderPresale=\{\(prefill\) => handleOpenAuth\('register', prefill\)\} \/>\s*<WhyPouwMinerSection \/>/,
  )
  assert.doesNotMatch(landingSource, /<PresaleSection\b/)
  assert.match(calculatorSource, /Pre-ordenar Miner Preventa/)
  assert.doesNotMatch(calculatorSource, /¿Por Qué PouwMiner es Mucho Más Rentable\?/)
  assert.match(whyPouwMinerSource, /¿Por Qué PouwMiner es Mucho Más Rentable\?/)
  assert.match(whyPouwMinerSource, /Minería Física en Casa/)
  assert.match(whyPouwMinerSource, /PouwMiner Cloud Architecture/)
  assert.match(sectionSource, /id="preventa"/)
  assert.match(sectionSource, /Tú eliges/)
  assert.match(sectionSource, /cuánto <span className="ce-title-accent">ganar\.<\/span>/)
})

test('EMBUDO-LANDING-ELIGE-GANANCIA PASO 1: 22 real catalog tiers, internal daily=price*0.10, PEARL=$0.10, ROI & payback, NEVER displays "10%"', () => {
  assert.equal(CHOOSE_EARNINGS_TIERS.length, 22)
  assert.deepEqual(CHOOSE_EARNINGS_TIERS, customMinerPriceTiers)
  assert.equal(CHOOSE_EARNINGS_TIERS[0].powerTh, 1)
  assert.equal(CHOOSE_EARNINGS_TIERS[0].priceUsd, 12.99)
  assert.equal(CHOOSE_EARNINGS_TIERS[21].powerTh, 5000)
  assert.equal(CHOOSE_EARNINGS_TIERS[21].priceUsd, 54768.99)

  // Check formula across all 22 tiers
  for (let i = 0; i < CHOOSE_EARNINGS_TIERS.length; i++) {
    const tier = CHOOSE_EARNINGS_TIERS[i]
    const daily = computeChooseEarningsMetrics(i, 'daily')
    const monthly = computeChooseEarningsMetrics(i, 'monthly')
    const yearly = computeChooseEarningsMetrics(i, 'yearly')

    const expectedDaily = tier.priceUsd * 0.1
    const expectedHourly = expectedDaily / 24
    assert.ok(Math.abs(daily.dailyUsd - expectedDaily) < 1e-9)
    assert.ok(Math.abs(daily.hourlyUsd - expectedHourly) < 1e-9)
    assert.ok(Math.abs(monthly.periodUsd - expectedDaily * 30) < 1e-9)
    assert.ok(Math.abs(yearly.periodUsd - expectedDaily * 365) < 1e-9)
    assert.ok(Math.abs(daily.hourlyPearl - expectedHourly / 0.1) < 1e-9)
    assert.ok(Math.abs(daily.dailyPearl - expectedDaily / 0.1) < 1e-9)
    assert.ok(Math.abs(daily.monthlyPearl - (expectedDaily * 30) / 0.1) < 1e-9)
    assert.equal(daily.launchPriceUsd, computeLaunchPriceUsd(tier.priceUsd))
    assert.ok(daily.launchPriceUsd >= tier.priceUsd * 2 - 1)
    assert.equal(daily.roiAnnualPct, Math.round(((expectedDaily * 365) / tier.priceUsd) * 100))
    assert.ok(Math.abs(daily.paybackDays - tier.priceUsd / expectedDaily) < 1e-9)
    assert.equal(daily.paybackLabel, '≈ 10 días')
  }

  assert.equal(formatPaybackLabel(10), '≈ 10 días')
  assert.equal(formatPaybackLabel(1), '≈ 1 día')
  assert.equal(formatPaybackLabel(45), '≈ 1.5 meses')
  assert.equal(GENESIS_TOTAL_SPOTS, 30)
  assert.equal(GENESIS_REMAINING_SPOTS, 7)
  assert.equal(GENESIS_TAKEN_SPOTS, 23)

  // Strict rule: NEVER show "10%" anywhere in visible UI or source of the new section
  assert.doesNotMatch(sectionSource, /10%/)
  assert.doesNotMatch(hudSource, /10%/)
  assert.doesNotMatch(modelSource, /10%/)
  assert.doesNotMatch(cssSource, /10%/)
})

test('EMBUDO-LANDING-ELIGE-GANANCIA PASO 2: 10 transparent PNGs & 10 live HTML sims exist, carousel blends cleanly, HUD uses real iframe + state-only postMessage', () => {
  assert.equal(TEARDOWN_PRESALE_DESIGNS.length, 10)
  const expectedSlugs = [
    'v01-scorpion',
    'v02-dragon',
    'v03-phantom',
    'v04-kraken',
    'v05-falcon',
    'v06-vortex',
    'v07-ronin',
    'v08-aurora',
    'v09-wolf',
    'v10-nova',
  ]
  assert.deepEqual(
    TEARDOWN_PRESALE_DESIGNS.map((d) => d.slug),
    expectedSlugs,
  )

  for (const design of TEARDOWN_PRESALE_DESIGNS) {
    assert.equal(design.thumbnailPath, design.transparentImagePath)
    const pngPath = path.join(projectRoot, 'public', design.transparentImagePath.replace(/^\//, ''))
    const htmlPath = path.join(projectRoot, 'public', design.htmlPath.replace(/^\//, ''))
    assert.equal(fs.existsSync(pngPath), true, `Missing transparent PNG: ${pngPath}`)
    assert.equal(fs.existsSync(htmlPath), true, `Missing live HTML sim: ${htmlPath}`)
    assert.ok(fs.statSync(pngPath).size > 50_000, `PNG unexpectedly small: ${pngPath}`)
    assert.ok(fs.statSync(htmlPath).size > 500_000, `Sim HTML unexpectedly small: ${htmlPath}`)
    const htmlContent = fs.readFileSync(htmlPath, 'utf8')
    assert.match(htmlContent, /window\.__LOCKED_TH/)
    assert.match(htmlContent, /"pearlPerDay","prlPerHour","usdPerDay"/)
    assert.match(htmlContent, /\{th:96,priceUsd:1139\.99\}/)
    assert.match(htmlContent, /\{th:5e3,priceUsd:54768\.99\}/)
    assert.match(htmlContent, /antialias:!0/)
    assert.match(htmlContent, /shadowMap\.autoUpdate=!1/)
    assert.match(htmlContent, /pr:2/)
    assert.match(htmlContent, /@media \(max-width:767px\) and \(max-height:775px\)/)
    assert.match(htmlContent, /_earlyMsgs/)

    const url = buildTeardownIframeUrl(design, { powerTh: 8, theme: 'dark', mode: 'solid' })
    assert.equal(url, `/teardown/${design.slug}-live.html?th=8&theme=dark&mode=solid`)

    const payload = buildTeardownPostMessagePayload({
      miner: { id: `PRESALE-${design.designId}`, name: design.name, powerTh: 8, efficiency: 15 },
      design,
      appearance: { wall_id: design.skinTraitId },
      theme: 'dark',
      mode: 'solid',
    })
    assert.equal(payload.type, 'sim:set-state')
    assert.equal(payload.designId, design.designId)
    assert.equal(payload.appearance.wall, design.skinTraitId)
    assert.equal(
      isTrustedTeardownMessage('https://pouwminer.com', 'https://pouwminer.com', { type: 'sim:ready', designId: design.designId }, design.designId),
      true,
    )
    assert.equal(
      isTrustedTeardownMessage('https://evil.example', 'https://pouwminer.com', { type: 'sim:ready', designId: design.designId }, design.designId),
      false,
    )
  }

  // Carousel stage has transparent background (no box/grid/glow lights) & CSS stays strictly scoped with minimal !important
  assert.match(cssSource, /\.ce-carousel-zone\s*\{[\s\S]*background:\s*transparent/)
  assert.doesNotMatch(cssSource, /--zone-glow|--item-shadow/)
  assert.doesNotMatch(cssSource, /(^|\n)(html|body|\*|:root)\s*\{/)
  assert.doesNotMatch(cssSource, /transition:\s*all\b/)
  const importantCount = (cssSource.match(/!important/g) ?? []).length
  assert.ok(importantCount <= 10, `Expected <= 10 !important declarations in chooseEarningsSection.css, got ${importantCount}`)

  // HUD embeds full-bleed real iframe with same-origin sandbox, state-only postMessage, auto-tour active by default, selected TH/s & hourly earnings
  assert.match(hudSource, /<iframe/)
  assert.match(hudSource, /ce-hud-stage-full/)
  assert.match(hudSource, /sandbox="allow-scripts allow-same-origin"/)
  assert.match(hudSource, /buildTeardownIframeUrl/)
  assert.match(hudSource, /buildTeardownPostMessagePayload/)
  assert.match(hudSource, /isTrustedTeardownMessage/)
  assert.match(hudSource, /frameWindow\.postMessage\(messageToSend/)
  assert.match(hudSource, /sim:restart-tour/)
  assert.match(hudSource, /metrics\.hourlyUsd/)
  assert.match(hudSource, /metrics\.hourlyPearl/)
  assert.match(hudSource, /\/ hora/)
  assert.match(hudSource, /Potencia seleccionada/)
  assert.match(hudSource, /Construyendo tu miner \{design\.designId\} · \{design\.shortName\}\.\.\./)
  assert.doesNotMatch(hudSource, /Iniciando simulador 3D/)
  // Lazy mount: iframe only mounted when show3DSim (which requires isOpen)
  assert.match(hudSource, /const show3DSim = isOpen &&/)
})

test('EMBUDO-LANDING-ELIGE-GANANCIA PASO 3: order button saves presale config, opens redesigned onboarding modal, and does NOT touch checkout/payment/Firestore', () => {
  assert.match(sectionSource, /Ordenar preventa · \{formatUsd\(metrics\.tier\.priceUsd, 2\)\}/)
  assert.match(sectionSource, /data-price-usd=\{metrics\.tier\.priceUsd\.toFixed\(2\)\}/)
  assert.match(sectionSource, /data-th=\{String\(metrics\.tier\.powerTh\)\}/)
  assert.match(sectionSource, /data-design=\{activeDesign\.slug\}/)
  assert.match(sectionSource, /data-skin=\{activeDesign\.skinCode\}/)
  assert.match(sectionSource, /saveEmbudoPresaleSelection\(selection\)/)
  assert.match(sectionSource, /onOrderPresale\?\.\(selection\)/)

  // Must NOT touch payment, checkout, or Firestore directly from landing section
  for (const forbidden of [
    /WalletPaymentCheckout/,
    /prepareWalletMinerPurchase/,
    /completeWalletMinerPurchase/,
    /firebase/,
    /firestore/i,
  ]) {
    assert.doesNotMatch(sectionSource, forbidden)
    assert.doesNotMatch(hudSource, forbidden)
    assert.doesNotMatch(modelSource, forbidden)
  }

  // AuthModal uses redesigned onboarding funnel (stepper, preloaded config, no 24 Cupos)
  const authModalSource = fs.readFileSync(path.join(projectRoot, 'src/AuthModal.tsx'), 'utf8')
  assert.match(authModalSource, /EmbudoFunnelProgress/)
  assert.match(authModalSource, /data-testid="auth-preloaded-config"/)
  assert.doesNotMatch(authModalSource, /24 Cupos/)
})

test('EMBUDO-LANDING-ELIGE-GANANCIA: frozen main @ f2e9c8a checkout, payment, withdrawals, referrals, and SCRUM-251 locked files untouched', () => {
  const protectedPaths = [
    'src/WalletPaymentCheckout.tsx',
    'src/minerPurchaseFlow.ts',
    'src/paymentQuote.ts',
    'src/paymentDestinations.ts',
    'src/solanaPayment.ts',
    'src/platformBalancePurchase.ts',
    'src/minerCatalog.ts',
    'src/catalogClient.ts',
    'src/userMinersStore.ts',
    'src/components/sections/PresaleSection.tsx',
    'src/components/ui/IntroPreloader.tsx',
    'src/components/ui/SideScrollTracker.tsx',
    'src/components/sections/HeroSection.tsx',
    'src/components/sections/ProductSection.tsx',
    'src/landing.css',
    'firestore.rules',
    'vite.config.ts',
  ]
  const diffOut = execFileSync('git', ['diff', '--name-only', 'f2e9c8a', '--', ...protectedPaths], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim()
  assert.equal(diffOut, '', `Protected files must not be modified: ${diffOut}`)

  assert.equal(
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(projectRoot, 'src/WalletPaymentCheckout.tsx')))
      .digest('hex'),
    'cf133aeca6fdf0aa1faa2c76016a5a75bb60ed5b4efef6dd45decc4eb6b974d1',
  )
  assert.equal(
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(projectRoot, 'src/paymentDestinations.ts')))
      .digest('hex'),
    '3c4667f044640fa122c6e3c6af11e775ee8893162ed68d90b7a23e2950a5fdf5',
  )
  assert.equal(
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(projectRoot, 'src/paymentQuote.ts')))
      .digest('hex'),
    'b887c8f34853fd26a12a7911c2108f4f67fb849e4d3785395fc5ea62a3f9f172',
  )

  assert.equal(
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(projectRoot, 'src/ReferralPage.tsx')))
      .digest('hex'),
    'd3b4d651f0c37c9a38ac5da9a6ebb3dc1c43cc7dcdb2fe4b90e6579d170518d6',
  )

  // Verify payment, miner persistence, and commission functions in src/firebase.ts remain byte-identical to f2e9c8a
  const baseFirebase = execFileSync('git', ['show', 'f2e9c8a:src/firebase.ts'], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
  const curFirebase = fs.readFileSync(path.join(projectRoot, 'src/firebase.ts'), 'utf8')
  const basePaymentTail = baseFirebase.slice(baseFirebase.indexOf('/** Saves purchased miner to Firestore'))
  const curPaymentTail = curFirebase.slice(curFirebase.indexOf('/** Saves purchased miner to Firestore'))
  assert.equal(curPaymentTail, basePaymentTail, 'Payment, miner persistence, and unilevel/commission logic in src/firebase.ts must remain untouched')
})
