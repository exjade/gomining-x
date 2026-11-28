import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { customMinerPriceTiers } from '../src/minerCatalog.ts'
import { subscribeToUserMiners, isUserMinersListenerActive } from '../src/userMinersStore.ts'

const ROOT = path.resolve(import.meta.dirname, '..')

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function sha256File(relPath: string): string {
  const buf = fs.readFileSync(path.join(ROOT, relPath))
  return crypto.createHash('sha256').update(buf).digest('hex')
}

test('SCRUM-337 (F5): 5 real screens expose unified F5 Landing-parity classes and testids', () => {
  const appTsx = readRepoFile('src/App.tsx')
  const minerFarmTsx = readRepoFile('src/nft-miners/MinerFarm.tsx')
  const walletPanelTsx = readRepoFile('src/WalletPanel.tsx')
  const referralPageTsx = readRepoFile('src/ReferralPage.tsx')
  const subscriptionsPageTsx = readRepoFile('src/SubscriptionsPage.tsx')

  assert.match(appTsx, /data-testid="f5-home-dashboard"/)
  assert.match(appTsx, /className="account-hero f5-glass-card"/)
  assert.match(minerFarmTsx, /data-testid="f5-miner-farm"/)
  assert.match(minerFarmTsx, /data-authenticated-miner-farm="true"/)
  assert.match(walletPanelTsx, /data-testid="f5-wallet-panel"/)
  assert.match(walletPanelTsx, /className="wallet-universal-banner f5-glass-card"/)
  assert.match(walletPanelTsx, /<ClientPaymentHistory uid=\{authenticatedUid\} \/>/)
  assert.match(referralPageTsx, /className="referral-page-container"/)
  assert.match(subscriptionsPageTsx, /data-testid="f5-subscriptions-page"/)
  assert.match(subscriptionsPageTsx, /data-testid="subscriptions-22-tiers-grid"/)
})

test('SCRUM-337 (F5): HomeDashboard renders zero 3D simulator/iframe and preserves auth gate + banner + null-profile error', () => {
  const appTsx = readRepoFile('src/App.tsx')
  const homeStart = appTsx.indexOf('function HomeDashboard(')
  const questStart = appTsx.indexOf('function MiningQuestBoard(')
  assert.ok(homeStart > 0 && questStart > homeStart, 'HomeDashboard block must exist')
  const homeBlock = appTsx.slice(homeStart, questStart)

  // Zero 3D simulator or iframe inside HomeDashboard
  assert.doesNotMatch(homeBlock, /TeardownMinerPreview|ChooseEarningsHud|<iframe/i)
  assert.doesNotMatch(homeBlock, /hero-mining-visual/)

  // Preserves pending-miner-banner, post-payment verify-email gate, and null-profile error card
  assert.match(homeBlock, /data-testid="pending-miner-banner"/)
  assert.match(appTsx, /data-testid="home-verify-email-gate"/)
  assert.match(appTsx, /data-testid="profile-missing-error"/)
})

test('SCRUM-337 (F5): MinerFarm renders MinerAppearancePreview strictly in 2D without 3D simulator', () => {
  const minerFarmTsx = readRepoFile('src/nft-miners/MinerFarm.tsx')

  assert.match(minerFarmTsx, /<MinerAppearancePreview miner=\{miner\} compact \/>/)
  assert.match(minerFarmTsx, /data-testid="f5-miner-farm-2d-grid"/)
  assert.doesNotMatch(minerFarmTsx, /TeardownMinerPreview|ChooseEarningsHud|<iframe|three|canvas/i)
  assert.match(minerFarmTsx, /useRealtimeUserMiners\(minersOverride \? undefined : uid\)/)
})

test('SCRUM-337 (F5): SubscriptionsPage exposes all 22 customMinerPriceTiers, free skins ($0) and price strictly by TH/s power', () => {
  const subscriptionsPageTsx = readRepoFile('src/SubscriptionsPage.tsx')

  assert.equal(customMinerPriceTiers.length, 22)
  assert.equal(customMinerPriceTiers[0].powerTh, 1)
  assert.equal(customMinerPriceTiers[0].priceUsd, 12.99)
  assert.equal(customMinerPriceTiers[21].powerTh, 5000)
  assert.equal(customMinerPriceTiers[21].priceUsd, 54768.99)

  assert.match(subscriptionsPageTsx, /import \{ customMinerPriceTiers \} from '\.\/minerCatalog'/)
  assert.match(subscriptionsPageTsx, /customMinerPriceTiers\.map\(\(tier\)/)
  assert.match(subscriptionsPageTsx, /data-testid="subscription-tier-item"/)
  assert.match(subscriptionsPageTsx, /Skins gratis en preventa \(\$0\)/)
  assert.match(subscriptionsPageTsx, /Precio definido solo por potencia \(TH\/s\)/)
  assert.match(subscriptionsPageTsx, /Skin \$0/)

  // Preserves auth & emailVerified guards for subscription payment actions
  assert.match(subscriptionsPageTsx, /openAuthModal\('register'\)/)
  assert.match(subscriptionsPageTsx, /openAuthModal\('verify-email'\)/)
})

test('SCRUM-337 (F5): Connection audit — zero new Firestore listeners, single shared listener across consumers', () => {
  const appTsx = readRepoFile('src/App.tsx')
  const walletPanelTsx = readRepoFile('src/WalletPanel.tsx')
  const subscriptionsPageTsx = readRepoFile('src/SubscriptionsPage.tsx')
  const minerFarmTsx = readRepoFile('src/nft-miners/MinerFarm.tsx')

  // WalletPanel and SubscriptionsPage open zero Firestore listeners
  assert.doesNotMatch(walletPanelTsx, /onSnapshot|subscribeToUserMiners|useRealtimeUserMiners/)
  assert.doesNotMatch(subscriptionsPageTsx, /onSnapshot|subscribeToUserMiners|useRealtimeUserMiners/)
  assert.doesNotMatch(minerFarmTsx, /onSnapshot/)

  // HomeDashboard passes minerCountOverride to MiningQuestBoard so hook subscribes once
  assert.match(appTsx, /<MiningQuestBoard minerCountOverride=\{totalMinersCount\} \/>/)
  assert.match(
    appTsx,
    /useRealtimeUserMiners\(minerCountOverride !== undefined \? undefined : user\?\.uid\)/,
  )

  // Runtime verification: multiple consumers share strictly 1 collection listener
  let collectionAttachCount = 0
  let collectionDetachCount = 0
  const mockOnSnapshot = (_ref: unknown, onNext: (snap: unknown) => void) => {
    collectionAttachCount += 1
    onNext({
      docChanges: () => [
        {
          type: 'added',
          doc: {
            id: 'f5-miner-1',
            data: () => ({ name: 'Miner #1', powerTh: 20, efficiencyWTh: 15 }),
          },
        },
      ],
    })
    return () => {
      collectionDetachCount += 1
    }
  }

  const receivedA: number[] = []
  const receivedB: number[] = []
  const unsubA = subscribeToUserMiners('uid-f5-audit', (list) => receivedA.push(list.length), mockOnSnapshot)
  const unsubB = subscribeToUserMiners('uid-f5-audit', (list) => receivedB.push(list.length), mockOnSnapshot)

  assert.equal(collectionAttachCount, 1, 'Must attach strictly 1 shared listener for same uid')
  assert.equal(isUserMinersListenerActive('uid-f5-audit'), true)
  assert.deepEqual(receivedA, [1])
  assert.deepEqual(receivedB, [1])

  unsubA()
  assert.equal(collectionDetachCount, 0, 'Still active while second consumer remains')
  unsubB()
  assert.equal(collectionDetachCount, 1, 'Detaches cleanly when last consumer unmounts')
  assert.equal(isUserMinersListenerActive('uid-f5-audit'), false)
})

test('SCRUM-337 (F5): Unified CSS design system enforces Landing obsidian/emerald aesthetic, responsive 2-3 cols -> 1 col mobile, and zero transition:all', () => {
  const stylesCss = readRepoFile('src/styles.css')
  const f5Start = stylesCss.indexOf('EMBUDO-F5 (SCRUM-337): UNIFIED LANDING DESIGN FOR 5 REAL CLIENT SCREENS')
  assert.ok(f5Start > 0, 'F5 unified CSS block must exist in src/styles.css')
  const f5Css = stylesCss.slice(f5Start)

  // Landing route untouched: scoped to :not(.app-shell-source-landing)
  assert.match(f5Css, /\.app-shell:not\(\.app-shell-source-landing\)/)
  assert.match(f5Css, /--bg:\s*#050505/)
  assert.match(f5Css, /--panel:\s*#0a0b0e/)
  assert.match(f5Css, /--green:\s*#10b981/)

  // Anti-slop & craft invariants: zero transition: all, zero purple hexes (#7c3aed/#8b5cf6/#a78bfa), active scale(0.97)
  assert.doesNotMatch(f5Css, /transition\s*:\s*all/i)
  assert.doesNotMatch(f5Css, /#7c3aed|#8b5cf6|#a78bfa|#6d28d9/i)
  assert.match(f5Css, /transform:\s*scale\(0\.97\)/)

  // Responsive desktop 2-3 columns -> mobile 1 column
  assert.match(f5Css, /repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(f5Css, /@media\s*\(max-width:\s*640px\)/)
  assert.match(f5Css, /grid-template-columns:\s*1fr\s*!important/)
})

test('SCRUM-337 (F5): Re-anchored frozen contracts and ReferralPage/payment/rules remain 100% byte-identical', () => {
  assert.equal(
    sha256File('src/authRoutePolicy.ts'),
    '2eb67f4db450ef448bb4eb839fe26a769a1240444ec9493492efa8312f16a5f4',
  )
  assert.equal(
    sha256File('src/AuthContext.tsx'),
    '94bbd0c1dc6871abe4937312d8c14176f3d3506f35096273ad4a19374b6d77fc',
  )
  assert.equal(
    sha256File('src/components/embudo-f1/index.ts'),
    'fa3292d918d660cabee8c53413745e73876a01801b7bb784a9fb38e0e929de82',
  )
  assert.equal(
    sha256File('test/embudoAuthGateVerificacion.test.ts'),
    'bb130ac9958b643f1d57208025f288b551ee100dbe1b608af49d8dab062c8be2',
  )
  assert.equal(
    sha256File('test/embudoLandingEligeGanancia.test.ts'),
    '94ead6fc149cafd1fe360add8e5d6b154bf64d86b73904bf57730d5d1549fe86',
  )
  assert.equal(
    sha256File('src/WalletPaymentCheckout.tsx'),
    'cf133aeca6fdf0aa1faa2c76016a5a75bb60ed5b4efef6dd45decc4eb6b974d1',
  )
  assert.equal(
    sha256File('src/paymentDestinations.ts'),
    '3c4667f044640fa122c6e3c6af11e775ee8893162ed68d90b7a23e2950a5fdf5',
  )
  assert.equal(
    sha256File('src/paymentQuote.ts'),
    'b887c8f34853fd26a12a7911c2108f4f67fb849e4d3785395fc5ea62a3f9f172',
  )
  assert.equal(
    sha256File('src/firebase.ts'),
    '4b9890b34e5d903bc46d3e4bbe74fc1a7a5886b0d9b98d8ac4e5e5d785011812',
  )
  assert.equal(
    sha256File('src/ReferralPage.tsx'),
    '9282106c1a02d5504c0bb7a4256c3b03b3bd7ddc35b1cfdb311fed48598429d2',
  )

  // Verify zero git diff against HEAD f2e9c8a on payment files, landing.css, and firestore.rules
  const untouchedVsHead = [
    'src/WalletPaymentCheckout.tsx',
    'src/paymentDestinations.ts',
    'src/paymentQuote.ts',
    'src/minerPurchaseFlow.ts',
    'src/platformBalancePurchase.ts',
    'src/landing.css',
    'firestore.rules',
  ]
  const diffOutput = execFileSync('git', ['diff', 'f2e9c8a', '--', ...untouchedVsHead], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(diffOutput.trim(), '', 'Protected files must have zero diff vs f2e9c8a')
})
