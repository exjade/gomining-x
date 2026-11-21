import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  EMBUDO_F1_BUILDER_ROUTE,
  EMBUDO_F1_STEPS,
  EMBUDO_F1_STORAGE_KEY,
  EMBUDO_F1_TTL_MS,
  advanceEmbudoF1Stage,
  clearEmbudoF1State,
  hasEmbudoF1QueryFlag,
  isEmbudoF1Active,
  readEmbudoF1State,
  resolvePostPaymentTransition,
  resolvePostRegisterTransition,
  startEmbudoF1Registration,
  type StorageLike,
} from '../src/components/embudo-f1/funnelState.ts'
import { customMinerPriceTiers } from '../src/minerCatalog.ts'
import { buildMinerBuilderCheckoutPayload } from '../src/minerPurchaseFlow.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
    removeItem: (key) => {
      store.delete(key)
    },
  }
}

function sha256File(relPath: string): string {
  const buf = fs.readFileSync(path.join(projectRoot, relPath))
  return crypto.createHash('sha256').update(buf).digest('hex')
}

test('EMBUDO-F1 (SCRUM-333): canonical 5-step order is Registro -> Configurar -> Pagar -> Verificar -> Dashboard', () => {
  assert.deepEqual(
    EMBUDO_F1_STEPS.map((s) => s.id),
    ['registering', 'configuring', 'paying', 'verify-email', 'dashboard'],
  )
})

test('EMBUDO-F1 (SCRUM-333): state machine executes full funnel with deferred verify-email after payment', () => {
  const storage = createMemoryStorage()
  const t0 = 1_795_000_000_000

  // 1. Starts idle
  assert.equal(isEmbudoF1Active(storage, t0), false)
  assert.equal(readEmbudoF1State(storage, t0).stage, 'idle')

  // 2. Landing CTA starts registration intent
  const regState = startEmbudoF1Registration('landing', storage, t0)
  assert.equal(regState.active, true)
  assert.equal(regState.stage, 'registering')
  assert.equal(regState.source, 'landing')
  assert.equal(isEmbudoF1Active(storage, t0 + 1000), true)

  // 3. Post-register fails closed if unauthenticated
  const blocked = resolvePostRegisterTransition({ isFunnelActive: true, isAuthenticated: false })
  assert.equal(blocked.allowBuilder, false)
  assert.equal(blocked.deferEmailVerification, false)
  assert.equal(blocked.nextRoute, '/')

  // 4. Authenticated post-register defers verify-email and routes straight to MinerBuilderDialog
  const postReg = resolvePostRegisterTransition({ isFunnelActive: true, isAuthenticated: true })
  assert.equal(postReg.allowBuilder, true)
  assert.equal(postReg.deferEmailVerification, true)
  assert.equal(postReg.nextStage, 'configuring')
  assert.equal(postReg.nextRoute, EMBUDO_F1_BUILDER_ROUTE)
  assert.equal(hasEmbudoF1QueryFlag('?modal=paywall-create&embudo=f1'), true)
  assert.equal(hasEmbudoF1QueryFlag('?modal=paywall-create'), false)

  // 5. Advance configuring -> paying
  const cfgState = advanceEmbudoF1Stage('configuring', storage, undefined, t0 + 2000)
  assert.equal(cfgState.stage, 'configuring')
  const payState = advanceEmbudoF1Stage('paying', storage, undefined, t0 + 3000)
  assert.equal(payState.stage, 'paying')

  // 6. Post-payment with unverified email navigates to /home (HomeDashboard) and opens verify-email
  const postPayUnverified = resolvePostPaymentTransition({
    isFunnelActive: true,
    isAuthenticated: true,
    isEmailVerified: false,
    minerId: 'miner-f1-001',
  })
  assert.equal(postPayUnverified.destination, '/home')
  assert.equal(postPayUnverified.openVerifyEmailModal, true)
  assert.equal(postPayUnverified.nextStage, 'verify-email')

  const verifyState = advanceEmbudoF1Stage('verify-email', storage, { lastMinerId: 'miner-f1-001' }, t0 + 4000)
  assert.equal(verifyState.stage, 'verify-email')
  assert.equal(verifyState.lastMinerId, 'miner-f1-001')

  // 7. Post-payment with already-verified email goes straight to /home without modal
  const postPayVerified = resolvePostPaymentTransition({
    isFunnelActive: true,
    isAuthenticated: true,
    isEmailVerified: true,
    minerId: 'miner-f1-002',
  })
  assert.equal(postPayVerified.destination, '/home')
  assert.equal(postPayVerified.openVerifyEmailModal, false)
  assert.equal(postPayVerified.nextStage, 'dashboard')

  // 8. Completing dashboard stage clears storage
  const doneState = advanceEmbudoF1Stage('dashboard', storage, undefined, t0 + 5000)
  assert.equal(doneState.active, false)
  assert.equal(storage.getItem(EMBUDO_F1_STORAGE_KEY), null)
})

test('EMBUDO-F1 (SCRUM-333): expired funnel state resets cleanly and non-funnel flows preserve legacy routes', () => {
  const storage = createMemoryStorage()
  const t0 = 1_795_000_000_000

  startEmbudoF1Registration('app', storage, t0)
  assert.equal(readEmbudoF1State(storage, t0 + EMBUDO_F1_TTL_MS + 1).active, false)
  assert.equal(storage.getItem(EMBUDO_F1_STORAGE_KEY), null)

  // Non-funnel post-register does NOT defer email verification
  const legacyReg = resolvePostRegisterTransition({ isFunnelActive: false, isAuthenticated: true })
  assert.equal(legacyReg.deferEmailVerification, false)
  assert.equal(legacyReg.allowBuilder, false)
  assert.equal(legacyReg.nextRoute, '/home')

  // Non-funnel post-payment keeps legacy customize destination
  const legacyPay = resolvePostPaymentTransition({
    isFunnelActive: false,
    isAuthenticated: true,
    isEmailVerified: true,
    minerId: 'miner-legacy-77',
  })
  assert.equal(legacyPay.destination, '/miners/miner-legacy-77/customize')
  assert.equal(legacyPay.openVerifyEmailModal, false)

  // Unauthenticated post-payment fails closed
  const unauthPay = resolvePostPaymentTransition({
    isFunnelActive: true,
    isAuthenticated: false,
    isEmailVerified: false,
    minerId: 'miner-x',
  })
  assert.equal(unauthPay.destination, '/')
  assert.equal(unauthPay.openVerifyEmailModal, false)

  // Explicit clear
  startEmbudoF1Registration('landing', storage, t0)
  clearEmbudoF1State(storage)
  assert.equal(isEmbudoF1Active(storage, t0), false)
})

test('EMBUDO-F1 (SCRUM-333): custom miner pricing starts at 1 TH/s = $12.99 with 22 tiers and $0 skin delta', () => {
  assert.equal(customMinerPriceTiers.length, 22)
  assert.equal(customMinerPriceTiers[0].powerTh, 1)
  assert.equal(customMinerPriceTiers[0].priceUsd, 12.99)
  assert.equal(customMinerPriceTiers[21].powerTh, 5000)
  assert.equal(customMinerPriceTiers[21].priceUsd, 54768.99)

  const payload = buildMinerBuilderCheckoutPayload({
    selected: undefined,
    isCustom: true,
    customTier: customMinerPriceTiers[0],
    categoryTab: 'packages',
  })
  assert.equal(payload.powerTh, 1)
  assert.equal(payload.amount, 12.99)
  assert.equal(payload.currency, 'USD')
  assert.equal(payload.packageId, 'minerx-custom')
})

test('EMBUDO-F1 (SCRUM-333): wiring preserves auth gate, hooks register -> MinerBuilderDialog -> WalletCheckout -> verify-email -> /home', () => {
  const authContextSrc = fs.readFileSync(path.join(projectRoot, 'src/AuthContext.tsx'), 'utf8')
  const authModalSrc = fs.readFileSync(path.join(projectRoot, 'src/AuthModal.tsx'), 'utf8')
  const landingSrc = fs.readFileSync(path.join(projectRoot, 'src/LandingPage.tsx'), 'utf8')
  const appSrc = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8')
  const walletCheckoutSrc = fs.readFileSync(path.join(projectRoot, 'src/WalletPaymentCheckout.tsx'), 'utf8')

  // AuthContext stays untouched (17/17 frozen contracts preserved)
  assert.match(authContextSrc, /const register = async \(email: string, pass: string, refCode\?: string\) => \{/)
  assert.match(authContextSrc, /setAuthMode\('verify-email'\)/)

  // LandingPage starts F1 intent on register and clears on login
  assert.match(landingSrc, /startEmbudoF1Registration\('landing'\)/)
  assert.match(landingSrc, /clearEmbudoF1State\(\)/)

  // AuthModal calls real register(email, password, referralCode), defers verify-email by closing modal onto MinerBuilderDialog, and renders step indicator
  assert.match(authModalSrc, /resolvePostRegisterTransition\(/)
  assert.match(authModalSrc, /await register\(email, password, referralCode\)/)
  assert.match(authModalSrc, /if \(postRegister\.deferEmailVerification\) \{\s*advanceEmbudoF1Stage\('configuring'\)\s*closeAuthModal\(\)/)
  assert.match(authModalSrc, /<EmbudoFunnelProgress/)

  // App preserves non-anonymous auth gate in MinerBuilderDialog -> WalletPaymentCheckout
  assert.match(appSrc, /onPayWithWallet=\{\(productName, amount, currency, packageId, purchaseMode\) => \{\s*if \(!user \|\| user\.isAnonymous\)/)
  assert.match(walletCheckoutSrc, /if \(!user \|\| user\.isAnonymous\)/)

  // App hooks post-register configuring -> /home?modal=paywall-create&embudo=f1 and post-payment -> /home + verify-email
  assert.match(appSrc, /funnelState\.stage === 'configuring' && location\.pathname === '\/home'/)
  assert.match(appSrc, /resolvePostPaymentTransition\(/)
  assert.match(appSrc, /openAuthModal\('verify-email'\)/)
  assert.match(appSrc, /<EmbudoPresaleSkinNotice \/>/)
  assert.match(appSrc, /const \[customPowerIndex, setCustomPowerIndex\] = useState\(0\)/)
})

test('EMBUDO-F1 (SCRUM-333): frozen SHA-256 contracts and ReferralPage remain 100% untouched', () => {
  const expectedHashes: Record<string, string> = {
    'src/minerPurchaseFlow.ts': '7710cee507a2b9b7d1f65351340115c52d5ef9651b22c022e928903747a1a2cb',
    'src/WalletPaymentCheckout.tsx': '033b63bbee3379c2661d63b5a6a4e9f5000fc467d0d868d9e34b23595e53c95e',
    'src/paymentQuote.ts': 'ea35ce7f0e9616b9f84c97ce19c9aee905dd4717dde30e9636418c7ee4c41e0a',
    'src/paymentDestinations.ts': '7184573212113c11012d39ca1cd473a974f9f85ae0c5c363f073336abf99d5bd',
    'src/solanaPayment.ts': '20a6d480799dce936075c0dcda65c9c3d202c3363b2669f91d4a5889dd0acc62',
    'src/platformBalancePurchase.ts': '4e1c7c1d8dd1fc12658c69255035bf553c5ec8c764d7dc91567fb45a8219d8db',
    'src/userMinersStore.ts': '1b444a70b77fa6f53e065b763908af59801111db1496e14f406db45057560479',
    'src/minerCatalog.ts': 'fa3827ae019bdf5cc6d6bc7319db221cf8b366268d885346808292ac8ced94a0',
    'src/catalogClient.ts': 'ec7c690b83a3eea24e2fa984dd6469574f9c10042f33ab4fcbfdb72bbdb3789c',
    'src/AuthContext.tsx': '3bc654d1c4724f13934e15fe452ae8219cc3ca64e859956da8b4a3835b772cf6',
    'src/authRoutePolicy.ts': 'a10b68876e14c45b5c516e39e969b918d37df9c00249a65254aa45722504aedf',
    'src/firebase.ts': 'b3eceeef1d0618567add84293519f4dec153ecb194115978ecf095c1d28cf915',
    'src/nft-miners/miner-customization-repository.ts': '53eae2d9828e4f66ac5c39448ddac61926c6232968ebe66721f8b63a14498dab',
    'src/nft-miners/miner-customization-model.ts': 'e33fbefca0c13aebe67778510f14a55d13f0f766e822e7578b8d1dd7769c72bf',
    'src/nft-miners/catalog-contract.ts': '2a62041940ef8c9fa69fc269f28e25f1758f96cea6c639e6718119ad70728af7',
    'src/nft-miners/unlock-engine.ts': '95b3066468f7b2d6a5127493b1e690b9b1a19a8637b025a3fe6fea07232b6edb',
    'firestore.rules': '07622669fbe9668c720fc645ec6fe085bccb6242f3c5615868970307d1916571',
  }

  for (const [relPath, expected] of Object.entries(expectedHashes)) {
    assert.equal(sha256File(relPath), expected, `EMBUDO_CONTRACT_HASH_DRIFT on ${relPath}`)
  }

  const referralSrc = fs.readFileSync(path.join(projectRoot, 'src/ReferralPage.tsx'), 'utf8')
  assert.doesNotMatch(referralSrc, /handleTriggerUnilevel/, 'EMBUDO_REFERRAL_SCOPE_VIOLATION')
  assert.equal(referralSrc.replace(/\r?\n$/, '').split(/\r?\n/).length, 822, 'ReferralPage.tsx must stay untouched at 822 lines')
})
