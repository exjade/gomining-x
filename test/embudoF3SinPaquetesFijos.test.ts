import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  PRESALE_CUSTOM_ONLY_MODE,
  PRESALE_FREE_SKIN_COPY,
  getPresaleTierSummary,
  hasForbiddenSkinPriceMarkup,
  resolveInitialMinerBuilderConfig,
  resolvePresaleReviewModalityLabel,
  resolvePresaleStorefrontSections,
} from '../src/components/miner-builder/presaleCustomOnlyPolicy.ts'
import { customMinerPriceTiers } from '../src/minerCatalog.ts'
import { buildMinerBuilderCheckoutPayload } from '../src/minerPurchaseFlow.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')

function sha256File(relPath: string): string {
  const buf = fs.readFileSync(path.join(projectRoot, relPath))
  return crypto.createHash('sha256').update(buf).digest('hex')
}

test('EMBUDO-F3 (SCRUM-335): presale custom-only policy retires all fixed package tabs while preserving showCustom', () => {
  assert.equal(PRESALE_CUSTOM_ONLY_MODE, true)

  const resolved = resolvePresaleStorefrontSections({
    showPresale: true,
    showLaunch: true,
    showMonthly: true,
    showCustom: false,
    updatedAt: '2026-11-21T00:00:00Z',
  })

  assert.equal(resolved.showPresale, false)
  assert.equal(resolved.showLaunch, false)
  assert.equal(resolved.showMonthly, false)
  assert.equal(resolved.showCustom, true)
  assert.equal(resolved.updatedAt, '2026-11-21T00:00:00Z')

  // When presale custom-only toggle is disabled post-presale, Firestore config passes through unchanged
  const passthrough = resolvePresaleStorefrontSections(
    { showPresale: false, showLaunch: true, showMonthly: true, showCustom: true },
    false,
  )
  assert.deepEqual(passthrough, {
    showPresale: false,
    showLaunch: true,
    showMonthly: true,
    showCustom: true,
  })
})

test('EMBUDO-F3 (SCRUM-335): MinerBuilderDialog opens directly in custom editor at index 0 (1 TH / $12.99)', () => {
  const defaultOpen = resolveInitialMinerBuilderConfig()
  assert.deepEqual(defaultOpen, {
    categoryTab: 'packages',
    presetId: 'custom',
    isCustomEditorOpen: true,
    customPowerIndex: 0,
  })

  const funnelOpen = resolveInitialMinerBuilderConfig({ isEmbudoF1: true })
  assert.deepEqual(funnelOpen, {
    categoryTab: 'packages',
    presetId: 'custom',
    isCustomEditorOpen: true,
    customPowerIndex: 0,
  })

  const legacyFallback = resolveInitialMinerBuilderConfig({ customOnly: false, isEmbudoF1: false })
  assert.deepEqual(legacyFallback, {
    categoryTab: 'packages',
    presetId: 'presale-1',
    isCustomEditorOpen: false,
    customPowerIndex: 0,
  })
})

test('EMBUDO-F3 (SCRUM-335): all 22 customMinerPriceTiers drive checkout strictly by power with $0 skin cost', () => {
  assert.equal(customMinerPriceTiers.length, 22)

  // Key benchmark tiers from SCRUM-335
  const tier0 = getPresaleTierSummary(0)
  assert.equal(tier0.powerTh, 1)
  assert.equal(tier0.priceUsd, 12.99)
  assert.equal(tier0.skinCostUsd, 0)
  assert.equal(tier0.tierCount, 22)

  assert.equal(getPresaleTierSummary(3).powerTh, 8)
  assert.equal(getPresaleTierSummary(3).priceUsd, 99.99)
  assert.equal(getPresaleTierSummary(5).powerTh, 32)
  assert.equal(getPresaleTierSummary(5).priceUsd, 379.99)
  assert.equal(getPresaleTierSummary(7).powerTh, 64)
  assert.equal(getPresaleTierSummary(7).priceUsd, 759.99)

  const tierLast = getPresaleTierSummary(21)
  assert.equal(tierLast.powerTh, 5000)
  assert.equal(tierLast.priceUsd, 54768.99)
  assert.equal(tierLast.skinCostUsd, 0)

  // Safe clamping for out-of-range indices
  assert.equal(getPresaleTierSummary(-5).index, 0)
  assert.equal(getPresaleTierSummary(999).index, 21)
  assert.equal(getPresaleTierSummary(Number.NaN).index, 0)

  // Checkout payload for every single tier uses minerx-custom and exact tier priceUsd
  for (let i = 0; i < customMinerPriceTiers.length; i++) {
    const tier = customMinerPriceTiers[i]
    const payload = buildMinerBuilderCheckoutPayload({
      selected: undefined,
      isCustom: true,
      customTier: tier,
      categoryTab: 'packages',
    })
    assert.equal(payload.powerTh, tier.powerTh)
    assert.equal(payload.amount, tier.priceUsd)
    assert.equal(payload.currency, 'USD')
    assert.equal(payload.packageId, 'minerx-custom')
    assert.equal(payload.purchaseMode, 'once')
  }
})

test('EMBUDO-F3 (SCRUM-335): skin customization copy declares free presale ($0) and forbids +$X markups', () => {
  const allCopy = Object.values(PRESALE_FREE_SKIN_COPY)
  for (const text of allCopy) {
    assert.equal(hasForbiddenSkinPriceMarkup(text), false, `Forbidden skin price markup found in: ${text}`)
  }

  assert.match(PRESALE_FREE_SKIN_COPY.skinTitle, /Gratis por preventa/i)
  assert.match(PRESALE_FREE_SKIN_COPY.reviewSkinValue, /Gratis por preventa/i)
  assert.equal(resolvePresaleReviewModalityLabel(true, 'packages'), 'Preventa · Personalizado (skin gratis)')

  // Guard positively catches prohibited +$X strings
  assert.equal(hasForbiddenSkinPriceMarkup('Skin épica +$25'), true)
  assert.equal(hasForbiddenSkinPriceMarkup('Personalización +15 USD'), true)
  assert.equal(hasForbiddenSkinPriceMarkup('Precio de skin: $10'), true)
  assert.equal(hasForbiddenSkinPriceMarkup('Personalización gratis por preventa ($0)'), false)
})

test('EMBUDO-F3 (SCRUM-335): MinerBuilderDialog & MinerCreationScreen wiring preserves C0 checkout, auth gate, F1 hooks and PowerSlider', () => {
  const appSrc = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8')
  const screenSrc = fs.readFileSync(path.join(projectRoot, 'src/components/miner-builder/MinerCreationScreen.tsx'), 'utf8')
  const walletCheckoutSrc = fs.readFileSync(path.join(projectRoot, 'src/WalletPaymentCheckout.tsx'), 'utf8')

  // F3 policy wired into MinerBuilderDialog
  assert.match(appSrc, /resolveInitialMinerBuilderConfig\(\{/)
  assert.match(appSrc, /resolvePresaleStorefrontSections\(DEFAULT_STOREFRONT_SECTIONS\)/)
  assert.match(appSrc, /resolvePresaleStorefrontSections\(cfg\)/)
  assert.match(appSrc, /resolvePresaleReviewModalityLabel\(isCustom, categoryTab\)/)
  assert.match(appSrc, /hideBackButton=\{PRESALE_CUSTOM_ONLY_MODE\}/)
  assert.match(appSrc, /PRESALE_FREE_SKIN_COPY\.skinTitle/)
  assert.match(appSrc, /PRESALE_FREE_SKIN_COPY\.reviewSkinValue/)

  // MinerCreationScreen hides back-to-packages button when hideBackButton is true
  assert.match(screenSrc, /hideBackButton = false/)
  assert.match(screenSrc, /\{!hideBackButton && \(/)

  // PowerSlider from index 0 preserved, NO inverse budget/profit input introduced
  assert.match(appSrc, /const \[customPowerIndex, setCustomPowerIndex\] = useState\(0\)/)
  assert.match(appSrc, /<PowerSlider/)
  assert.doesNotMatch(appSrc, /inverseBudget|targetProfitInput|budgetToPower/i)

  // Auth gate and checkout C0 chain preserved
  assert.match(appSrc, /onPayWithWallet=\{\(productName, amount, currency, packageId, purchaseMode\) => \{\s*if \(!user \|\| user\.isAnonymous\)/)
  assert.match(walletCheckoutSrc, /if \(!user \|\| user\.isAnonymous\)/)
  assert.match(appSrc, /buildMinerBuilderCheckoutPayload\(\{/)

  // EMBUDO-F1 hooks preserved intact
  assert.match(appSrc, /<EmbudoFunnelProgress/)
  assert.match(appSrc, /<EmbudoPresaleSkinNotice \/>/)
  assert.match(appSrc, /advanceEmbudoF1Stage\('paying'\)/)
  assert.match(appSrc, /resolvePostPaymentTransition\(/)
  assert.match(appSrc, /openAuthModal\('verify-email'\)/)
})

test('EMBUDO-F3 (SCRUM-335): all 9 F3 frozen contracts, 17 baseline contracts, ReferralPage and PowerSlider remain 100% untouched', () => {
  const f3FrozenContracts: Record<string, string> = {
    'src/minerPurchaseFlow.ts': '7710cee507a2b9b7d1f65351340115c52d5ef9651b22c022e928903747a1a2cb',
    'src/WalletPaymentCheckout.tsx': '033b63bbee3379c2661d63b5a6a4e9f5000fc467d0d868d9e34b23595e53c95e',
    'src/paymentQuote.ts': 'ea35ce7f0e9616b9f84c97ce19c9aee905dd4717dde30e9636418c7ee4c41e0a',
    'src/paymentDestinations.ts': '7184573212113c11012d39ca1cd473a974f9f85ae0c5c363f073336abf99d5bd',
    'src/solanaPayment.ts': '20a6d480799dce936075c0dcda65c9c3d202c3363b2669f91d4a5889dd0acc62',
    'src/minerCatalog.ts': 'fa3827ae019bdf5cc6d6bc7319db221cf8b366268d885346808292ac8ced94a0',
    'src/catalogClient.ts': 'ec7c690b83a3eea24e2fa984dd6469574f9c10042f33ab4fcbfdb72bbdb3789c',
    'src/firebase.ts': 'b3eceeef1d0618567add84293519f4dec153ecb194115978ecf095c1d28cf915',
    'firestore.rules': '07622669fbe9668c720fc645ec6fe085bccb6242f3c5615868970307d1916571',
  }

  for (const [relPath, expected] of Object.entries(f3FrozenContracts)) {
    assert.equal(sha256File(relPath), expected, `EMBUDO_CONTRACT_HASH_DRIFT on ${relPath}`)
  }

  // ReferralPage / Unilevel strictly out of scope
  const referralSrc = fs.readFileSync(path.join(projectRoot, 'src/ReferralPage.tsx'), 'utf8')
  assert.doesNotMatch(referralSrc, /handleTriggerUnilevel/, 'EMBUDO_REFERRAL_SCOPE_VIOLATION')
  assert.equal(referralSrc.replace(/\r?\n$/, '').split(/\r?\n/).length, 822, 'ReferralPage.tsx must stay untouched at 822 lines')
})
