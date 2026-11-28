import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  SHOW_STAGE2_BATTLES_MINER_WARS,
  SHOW_STAGE2_EXTRA_EXPLORE_MODULES,
  SHOW_STAGE2_LEADERBOARDS,
  SHOW_STAGE2_MINER_TASKS_AND_UPGRADES,
  SHOW_STAGE2_POBOXES_AND_PROMOS,
  SHOW_STAGE2_SUBSCRIPTIONS,
  SHOW_STAGE2_TOPUP_AND_DEPOSIT,
  SHOW_STAGE2_TRAIT_CUSTOMIZER,
  isHiddenInPresaleStage1,
} from '../src/presaleStage1Flags.ts'
import {
  buildTeardownPostMessagePayload,
  resolveDesignSpecFromSkin,
} from '../src/components/teardown-miner-preview/designCatalog.ts'

const ROOT = path.resolve(import.meta.dirname, '..')

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function sha256File(relPath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, relPath))).digest('hex')
}

test('EMBUDO-REDISENO-TODO-PREVENTA (1): ClientPaymentHistory uses approved wth-* visual language without touching logic', () => {
  const historyTsx = readRepoFile('src/components/payments/ClientPaymentHistory.tsx')
  const historyCss = readRepoFile('src/components/payments/clientPaymentHistory.css')

  // Imports approved wth-* shared stylesheet + complementary cph-* stylesheet
  assert.match(historyTsx, /import '\.\.\/withdrawals\/withdrawalShared\.css'/)
  assert.match(historyTsx, /import '\.\/clientPaymentHistory\.css'/)

  // Uses wth-* layout, mono kicker, card, and status-tone classes
  for (const cls of [
    'wth-history-panel',
    'wth-history-panel-header',
    'wth-history-kicker wth-tabular-mono',
    'wth-history-shell',
    'wth-cards-list',
    'wth-history-card',
    'wth-status-badge wth-status-badge--',
    'wth-explorer-link',
    'wth-btn-detail',
    'wth-btn-secondary',
  ]) {
    assert.ok(historyTsx.includes(cls), `Expected ClientPaymentHistory.tsx to use class '${cls}'`)
  }

  // Logic 100% preserved: subscribeToClientOrders, 4 filters, cancelPaymentIntent, Ver tx, Ver minero
  assert.match(historyTsx, /subscribeToClientOrders\(/)
  for (const label of ['Todos', 'En proceso', 'Pagados', 'Cerrados']) {
    assert.ok(historyTsx.includes(`'${label}'`), `Filter '${label}' must remain intact`)
  }
  assert.match(historyTsx, /cancelPaymentIntent\(order\.intentId,\s*'USER_CANCELLED'\)/)
  assert.match(historyTsx, /canCancelClientOrder\(order\)/)
  assert.match(historyTsx, /buildClientOrderExplorerUrl\(order\)/)
  assert.match(historyTsx, /Ver tx \(/)
  assert.match(historyTsx, /Ver minero \(\{order\.activatedMinerId\}\)/)
  assert.match(historyTsx, /Paid — Minero Activo/)

  // Craft & anti-slop invariants: zero purple hexes, zero transition:all, tactile scale(0.97)
  assert.doesNotMatch(historyTsx, /#a78bfa|#7c3aed|#8b5cf6/i)
  assert.doesNotMatch(historyCss, /transition\s*:\s*all/i)
  assert.doesNotMatch(historyCss, /#a78bfa|#7c3aed|#8b5cf6/i)
  assert.match(historyCss, /transform:\s*scale\(0\.97\)/)
})

test('EMBUDO-REDISENO-TODO-PREVENTA (2): MinerDetails (/nft-miners/:id) mounts TeardownMinerPreview HUB with real/derived telemetry ONLY (no prlPerHour/pearlPerDay/usdPerDay) while Overview & MinerFarm have zero 3D sim', () => {
  const minerCustomizerTsx = readRepoFile('src/nft-miners/MinerCustomizer.tsx')
  const minerFarmTsx = readRepoFile('src/nft-miners/MinerFarm.tsx')
  const appTsx = readRepoFile('src/App.tsx')
  const tdCss = readRepoFile('src/components/teardown-miner-preview/teardownMinerPreview.css')

  // Mounted in MinerDetails inside pwm-detail-art-panel
  assert.match(minerCustomizerTsx, /import\s*\{[\s\S]*?TeardownMinerPreview[\s\S]*?resolveDesignSpecFromSkin[\s\S]*?\}\s*from\s*'\.\.\/components\/teardown-miner-preview'/)
  assert.match(minerCustomizerTsx, /className="pwm-detail-art-panel"[\s\S]*?<TeardownMinerPreview/)
  assert.match(minerCustomizerTsx, /fallbackSlug:\s*'v04-kraken'/)

  // Telemetry strictly omits prlPerHour, pearlPerDay, usdPerDay, and mining_daily_profit
  const telemetryBlockMatch = minerCustomizerTsx.match(/const hubTelemetry:\s*TeardownBackendTelemetry\s*=\s*\{[\s\S]*?const saveAppearance\b/)
  assert.ok(telemetryBlockMatch, 'hubTelemetry definition must exist in MinerCustomizer.tsx')
  const telemetryBlock = telemetryBlockMatch[0]
  assert.doesNotMatch(telemetryBlock, /prlPerHour|pearlPerDay|usdPerDay|prlPriceUsdt|mining_daily_profit/)
  for (const allowedKey of ['priceUsd', 'minerStatus', 'packageId', 'minerNetwork', 'ownerWallet', 'txHash', 'activeMinersCount', 'farmPowerTh', 'farmEfficiency']) {
    assert.ok(telemetryBlock.includes(allowedKey), `hubTelemetry should wire real/derived field ${allowedKey}`)
  }

  // Runtime check on resolveDesignSpecFromSkin (fallback V04 Kraken) and buildTeardownPostMessagePayload without reward rates
  const fallbackSpec = resolveDesignSpecFromSkin({ appearance: { wall_id: null }, fallbackSlug: 'v04-kraken' })
  assert.equal(fallbackSpec.designId, 'V04')
  assert.equal(fallbackSpec.slug, 'v04-kraken')

  const hubPayload = buildTeardownPostMessagePayload({
    miner: { id: 'miner_pi_1', name: 'Kraken 96', powerTh: 96, efficiency: 15 },
    design: fallbackSpec,
    appearance: { wall_id: 'wall-green' },
    telemetry: {
      priceUsd: 1139.99,
      packageId: 'custom-96th',
      minerStatus: 'active',
      minerNetwork: 'bsc',
      ownerWallet: '0x1234',
      txHash: '0xabcd',
      activeMinersCount: 1,
      farmPowerTh: 96,
      farmEfficiency: 15,
    },
  })
  assert.equal('prlPerHour' in hubPayload, false)
  assert.equal('pearlPerDay' in hubPayload, false)
  assert.equal('usdPerDay' in hubPayload, false)
  assert.equal(hubPayload.priceUsd, 1139.99)
  assert.equal(hubPayload.farmPowerTh, 96)

  // Overview (HomeDashboard) and MinerFarm have ZERO 3D simulator
  const homeBlock = appTsx.slice(appTsx.indexOf('function HomeDashboard('), appTsx.indexOf('function MiningQuestBoard('))
  assert.doesNotMatch(homeBlock, /TeardownMinerPreview|ChooseEarningsHud|<iframe/i)
  assert.doesNotMatch(minerFarmTsx, /TeardownMinerPreview|ChooseEarningsHud|<iframe|three|canvas/i)

  // teardownMinerPreview.css free of purple
  assert.doesNotMatch(tdCss, /#7540ed|#8452f7|#a57bff|#824ff6/i)
})

test('EMBUDO-REDISENO-TODO-PREVENTA (3): Hides Stage 2 non-presale surfaces via flags without deleting any component', () => {
  // All Stage 2 flags are false in Stage 1 Presale
  assert.equal(SHOW_STAGE2_SUBSCRIPTIONS, false)
  assert.equal(SHOW_STAGE2_TOPUP_AND_DEPOSIT, false)
  assert.equal(SHOW_STAGE2_TRAIT_CUSTOMIZER, false)
  assert.equal(SHOW_STAGE2_MINER_TASKS_AND_UPGRADES, false)
  assert.equal(SHOW_STAGE2_POBOXES_AND_PROMOS, false)
  assert.equal(SHOW_STAGE2_BATTLES_MINER_WARS, false)
  assert.equal(SHOW_STAGE2_LEADERBOARDS, false)
  assert.equal(SHOW_STAGE2_EXTRA_EXPLORE_MODULES, false)

  // Non-presale routes are marked hidden in Stage 1 while core Stage 1 routes stay accessible
  for (const hiddenRoute of [
    '/subscriptions',
    '/subscriptions?subscriptionType=platinum',
    '/deposit',
    '/goboxes',
    '/promos',
    '/miner-wars',
    '/nft-rewards/pool',
    '/leaderboard/nft',
    '/leaderboard/solo-mining',
    '/mining-calculator',
  ]) {
    assert.equal(isHiddenInPresaleStage1(hiddenRoute), true, `Expected ${hiddenRoute} to be hidden in Stage 1`)
  }

  for (const stage1Route of [
    '/',
    '/home',
    '/nft-miners',
    '/nft-referral',
    '/nft-referral/rewards',
    '/nft-referral/friends',
    '/gmt-wallets',
    '/withdraw/GOMINING',
    '/profile',
  ]) {
    assert.equal(isHiddenInPresaleStage1(stage1Route), false, `Expected Stage 1 route ${stage1Route} to stay visible`)
  }

  // Components remain in codebase (never deleted)
  const appTsx = readRepoFile('src/App.tsx')
  const subsTsx = readRepoFile('src/SubscriptionsPage.tsx')
  const customizerTsx = readRepoFile('src/nft-miners/MinerCustomizer.tsx')
  const profileTsx = readRepoFile('src/ProfilePage.tsx')

  assert.match(appTsx, /function DemoTopUpDialog\(/)
  assert.match(appTsx, /export function SubscriptionPlansPanel\(/)
  assert.match(appTsx, /function RewardsPanel\(/)
  assert.match(subsTsx, /export function SubscriptionsPage\(/)
  assert.match(subsTsx, /SHOW_STAGE2_SUBSCRIPTIONS && \(/)
  assert.match(customizerTsx, /function CustomizeMiner\(/)
  assert.match(customizerTsx, /SHOW_STAGE2_TRAIT_CUSTOMIZER/)
  assert.match(customizerTsx, /SHOW_STAGE2_MINER_TASKS_AND_UPGRADES/)
  assert.match(profileTsx, /SHOW_STAGE2_SUBSCRIPTIONS/)
  assert.match(profileTsx, /SHOW_STAGE2_TRAIT_CUSTOMIZER/)
})

test('EMBUDO-REDISENO-TODO-PREVENTA (4): Eldrin checkout, withdrawals shared CSS, unilevel, auth-gate, leads, and rules untouched', () => {
  const untouchedFiles = [
    'src/WalletPaymentCheckout.tsx',
    'src/services/payments/paymentGatewayClient.ts',
    'src/services/payments/checkoutIntentCoordinator.ts',
    'src/components/payments/clientPaymentHistoryService.ts',
    'src/paymentDestinations.ts',
    'src/paymentQuote.ts',
    'src/tronPayment.ts',
    'src/solanaPayment.ts',
    'firestore.rules',
  ]
  const diffOut = execFileSync('git', ['diff', '--name-only', 'f2e9c8a', '--', ...untouchedFiles], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()
  assert.equal(diffOut, '', `Eldrin files must have zero diff vs f2e9c8a: ${diffOut}`)

  // Zero reference to mining_daily_profit in client src
  assert.doesNotMatch(readRepoFile('src/App.tsx'), /mining_daily_profit/)
  assert.doesNotMatch(readRepoFile('src/nft-miners/MinerCustomizer.tsx'), /mining_daily_profit/)

  assert.equal(sha256File('src/WalletPaymentCheckout.tsx'), 'cf133aeca6fdf0aa1faa2c76016a5a75bb60ed5b4efef6dd45decc4eb6b974d1')
  assert.equal(sha256File('src/AuthContext.tsx'), '94bbd0c1dc6871abe4937312d8c14176f3d3506f35096273ad4a19374b6d77fc')
  assert.equal(sha256File('src/authRoutePolicy.ts'), '2eb67f4db450ef448bb4eb839fe26a769a1240444ec9493492efa8312f16a5f4')
  assert.equal(sha256File('src/ReferralPage.tsx'), '9282106c1a02d5504c0bb7a4256c3b03b3bd7ddc35b1cfdb311fed48598429d2')
})
