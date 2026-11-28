import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  TOTAL_UNILEVEL_FARMS,
  UNILEVEL_FARM_ERAS,
  UNILEVEL_FARM_NAMES,
  buildUnilevelFarmSummary,
  filterFarmReferrals,
  shortenSourceUid,
  type UnilevelCommissionInput,
  type UnilevelScheduleItem,
  type UnilevelStatsHeaderInput,
} from '../src/components/unilevel-farm/unilevelFarmModel.ts'

const ROOT = path.resolve(import.meta.dirname, '..')

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function extractScheduleFromReferralPage(): readonly UnilevelScheduleItem[] {
  const src = readRepoFile('src/ReferralPage.tsx')
  const match = /UNILEVEL_V1_SCHEDULE[\s\S]*?=\s*\[([\s\S]*?)\]\s*as\s*const/.exec(src)
  assert.ok(match, 'UNILEVEL_V1_SCHEDULE must exist in src/ReferralPage.tsx')
  const rows: UnilevelScheduleItem[] = []
  const rowRegex =
    /\{\s*level:\s*(\d+),\s*pctLabel:\s*'([^']+)',\s*rateString:\s*'([^']+)',\s*barTrackPct:\s*(\d+)\s*\}/g
  let m: RegExpExecArray | null
  while ((m = rowRegex.exec(match[1])) !== null) {
    rows.push({
      level: Number(m[1]),
      pctLabel: m[2],
      rateString: m[3],
      barTrackPct: Number(m[4]),
    })
  }
  assert.equal(rows.length, 20)
  return rows
}

const UNILEVEL_V1_SCHEDULE = extractScheduleFromReferralPage()

test('EMBUDO-UNILEVEL-FARM (1): 20 farms in 4 eras with UNILEVEL_V1_SCHEDULE rates and Farm 1 always unlocked', () => {
  assert.equal(TOTAL_UNILEVEL_FARMS, 20)
  assert.equal(UNILEVEL_FARM_ERAS.length, 4)
  assert.deepEqual(
    UNILEVEL_FARM_ERAS.map((e) => [e.from, e.to]),
    [
      [1, 5],
      [6, 10],
      [11, 15],
      [16, 20],
    ],
  )
  assert.equal(Object.keys(UNILEVEL_FARM_NAMES).length, 20)

  const summary = buildUnilevelFarmSummary({
    stats: null,
    schedule: UNILEVEL_V1_SCHEDULE,
    receivedCommissions: [],
  })

  assert.equal(summary.farms.length, 20)
  assert.equal(summary.unlockedFarmsCount, 1)
  assert.equal(summary.activeFarmsCount, 0)
  assert.equal(summary.farms[0].state, 'empty')
  assert.equal(summary.farms[0].unlocked, true)
  assert.equal(summary.farms[0].pctLabel, '1.95%')
  assert.equal(summary.farms[0].side, 'left')
  assert.equal(summary.farms[1].side, 'right')

  for (let level = 2; level <= 20; level += 1) {
    assert.equal(summary.farms[level - 1].unlocked, false)
    assert.equal(summary.farms[level - 1].state, 'locked')
  }
  assert.equal(summary.farms[19].pctLabel, '0.05%')
  assert.equal(summary.nextLockedFarm?.level, 2)
  assert.equal(summary.nextLockedFarm?.requiredPrevLevel, 1)
  assert.equal(
    summary.unlockRuleDerivation,
    'CLIENT_DERIVED_FROM_RECEIVED_COMMISSIONS_SOURCE_UID',
  )
})

test('EMBUDO-UNILEVEL-FARM (2): Chain lock unlocks Farm N only if Farm N-1 has >= 1 sourceUserId (no gap islands)', () => {
  const commissions: UnilevelCommissionInput[] = [
    {
      id: 'comm_l1_a',
      distributionId: 'dist_1',
      type: 'UNILEVEL_PROFITSHARE_COMMISSION',
      status: 'CREDITED',
      currency: 'USDT',
      level: 1,
      uplineUserId: 'upline_root_user',
      sourceUserId: 'uidAlpha0001xyz9',
      minerId: 'miner_alpha_01',
      periodDate: '2026-11-25',
      creditedUsdt6: '12.500000',
    },
    {
      id: 'comm_l1_a2',
      distributionId: 'dist_2',
      type: 'UNILEVEL_PROFITSHARE_COMMISSION',
      status: 'CREDITED',
      currency: 'USDT',
      level: 1,
      uplineUserId: 'upline_root_user',
      sourceUserId: 'uidAlpha0001xyz9',
      minerId: 'miner_alpha_01',
      periodDate: '2026-11-26',
      creditedUsdt6: '7.250000',
    },
    // Anomalous gap at L4 while L2 & L3 have 0 sourceUserIds: chain lock must keep L3 & L4 locked!
    {
      id: 'comm_l4_gap',
      distributionId: 'dist_3',
      type: 'UNILEVEL_PROFITSHARE_COMMISSION',
      status: 'CREDITED',
      currency: 'USDT',
      level: 4,
      uplineUserId: 'upline_root_user',
      sourceUserId: 'uidDelta9999end4',
      periodDate: '2026-11-26',
      creditedUsdt6: '1.650000',
    },
  ]

  const stats: UnilevelStatsHeaderInput = {
    ownMiningProfit: 80.5,
    organizationGeneratedProfitShare: 100,
    receivedUnilevelCommission: 21.4,
    directCount: 3,
    totalTeamCount: 11,
    activeReferredMinersCount: 2,
    eligibleForUnilevel: true,
    planVersion: 'UNILEVEL_V1',
  }

  const summary = buildUnilevelFarmSummary({
    stats,
    schedule: UNILEVEL_V1_SCHEDULE,
    receivedCommissions: commissions,
  })

  // Farm 1 has 1 sourceUserId with summed earnings 19.750000 USDT -> active
  assert.equal(summary.farms[0].state, 'active')
  assert.equal(summary.farms[0].sourceUserCount, 1)
  assert.equal(summary.farms[0].totalEarnedUsdt2, '19.75')
  assert.equal(summary.farms[0].totalEarnedUsdt6, '19.750000')
  assert.equal(summary.farms[0].referrals[0].shortUid, 'uidAlp…xyz9')
  assert.equal(summary.farms[0].referrals[0].latestDate, '2026-11-26')

  // Farm 2 unlocked because Farm 1 has >= 1 sourceUserId, and empty because Farm 2 has 0 sourceUserIds
  assert.equal(summary.farms[1].unlocked, true)
  assert.equal(summary.farms[1].state, 'empty')

  // Farm 3 & Farm 4 remain locked because Farm 2 has 0 sourceUserIds (strict chain lock)
  assert.equal(summary.farms[2].unlocked, false)
  assert.equal(summary.farms[2].state, 'locked')
  assert.equal(summary.farms[3].unlocked, false)
  assert.equal(summary.farms[3].state, 'locked')
  assert.equal(summary.unlockedFarmsCount, 2)
  assert.equal(summary.nextLockedFarm?.level, 3)

  // Header stats reflect getUnilevelStats + null TH (never invented)
  assert.equal(summary.directCount, 3)
  assert.equal(summary.totalTeamCount, 11)
  assert.equal(summary.activeReferredMinersCount, 2)
  assert.equal(summary.eligibleForUnilevel, true)
  assert.equal(summary.totalNetworkPowerTh, null)
})

test('EMBUDO-UNILEVEL-FARM (3): UID shortening (first 6 + … + last 4), reversal micro-USDT accounting, and modal search/filter', () => {
  assert.equal(shortenSourceUid('abcdef1234567890wxyz'), 'abcdef…wxyz')
  assert.equal(shortenSourceUid('shortuid10'), 'shortuid10')
  assert.equal(shortenSourceUid(''), '—')

  const commissions: UnilevelCommissionInput[] = [
    {
      id: 'c1',
      distributionId: 'd1',
      type: 'UNILEVEL_PROFITSHARE_COMMISSION',
      status: 'CREDITED',
      currency: 'USDT',
      level: 1,
      uplineUserId: 'me',
      sourceUserId: 'usrFirst00001111',
      periodDate: '2026-11-20',
      creditedUsdt6: '5.500000',
    },
    {
      id: 'c2_rev',
      distributionId: 'd1',
      type: 'UNILEVEL_PROFITSHARE_REVERSAL',
      status: 'REVERSED',
      currency: 'USDT',
      level: 1,
      uplineUserId: 'me',
      sourceUserId: 'usrFirst00001111',
      periodDate: '2026-11-21',
      deltaUsdt6: '-5.500000',
    },
    {
      id: 'c3',
      distributionId: 'd2',
      type: 'UNILEVEL_PROFITSHARE_COMMISSION',
      status: 'CREDITED',
      currency: 'USDT',
      level: 1,
      uplineUserId: 'me',
      sourceUserId: 'usrSecond9992222',
      periodDate: '2026-11-27',
      creditedUsdt6: '14.123456',
    },
  ]

  const summary = buildUnilevelFarmSummary({
    stats: null,
    schedule: UNILEVEL_V1_SCHEDULE,
    receivedCommissions: commissions,
  })

  const refs = summary.farms[0].referrals
  assert.equal(refs.length, 2)
  assert.equal(refs[0].sourceUserId, 'usrSecond9992222')
  assert.equal(refs[0].shortUid, 'usrSec…2222')
  assert.equal(refs[0].totalEarnedUsdt6, '14.123456')
  assert.equal(refs[1].sourceUserId, 'usrFirst00001111')
  assert.equal(refs[1].totalEarnedUsdt6, '0.000000')
  assert.equal(refs[1].reversedCount, 1)

  assert.equal(filterFarmReferrals(refs, { filter: 'positive' }).length, 1)
  assert.equal(filterFarmReferrals(refs, { filter: 'reversed' }).length, 1)
  assert.equal(filterFarmReferrals(refs, { search: 'usrSec…2222' }).length, 1)
})

test('EMBUDO-UNILEVEL-FARM (4): Static source audit — zero getUnilevelTree in downline farm, zero invented names, aggregated withdrawals reused, protected files untouched', () => {
  const modelSrc = readRepoFile('src/components/unilevel-farm/unilevelFarmModel.ts')
  const mapSrc = readRepoFile('src/components/unilevel-farm/MinerFarmMap.tsx')
  const modalSrc = readRepoFile('src/components/unilevel-farm/MinerFarmModal.tsx')
  const withdrawSecSrc = readRepoFile('src/components/unilevel-farm/UnilevelAggregatedWithdrawalSection.tsx')
  const farmCss = readRepoFile('src/components/unilevel-farm/unilevelFarm.css')
  const referralPageSrc = readRepoFile('src/ReferralPage.tsx')

  // getUnilevelTree is strictly upline and NEVER passed to or used in MinerFarmMap / Modal / Model
  for (const src of [modelSrc, mapSrc, modalSrc]) {
    assert.doesNotMatch(src, /\bgetUnilevelTree\b/)
    assert.doesNotMatch(src, /\bunilevelTree\b/)
    assert.doesNotMatch(src, /José Martínez|María González|minero-demo/i)
  }
  const minerFarmMountMatch = referralPageSrc.match(/<MinerFarmMap\b[\s\S]*?\/>/)
  assert.ok(minerFarmMountMatch, 'ReferralPage must mount <MinerFarmMap />')
  assert.doesNotMatch(minerFarmMountMatch[0], /\bunilevelTree\b/)

  // Aggregated withdrawal flow reused cleanly (WithdrawalForm + WithdrawalHistoryPanel, min 10 USDT, no separate unilevel withdrawal)
  assert.match(withdrawSecSrc, /WithdrawalForm/)
  assert.match(withdrawSecSrc, /WithdrawalHistoryPanel/)
  assert.match(withdrawSecSrc, /MIN_WITHDRAWAL_USDT/)
  assert.match(withdrawSecSrc, /POST \/api\/withdrawals\/request/)
  assert.match(withdrawSecSrc, /GET \/api\/withdrawals\/me/)
  assert.doesNotMatch(withdrawSecSrc, /\bunilevelBalance\b/)
  assert.doesNotMatch(referralPageSrc, /\bunilevelBalance\b/)
  // Hero aside accurately labels Direct 10% commission balance (not aggregated), while aggregated label lives in UnilevelAggregatedWithdrawalSection
  assert.match(referralPageSrc, /DIRECT 10% COMMISSION BALANCE/)
  assert.match(referralPageSrc, /SALDO DE COMISIÓN DIRECTA 10%/)
  assert.doesNotMatch(referralPageSrc, /SALDO RETIRABLE AGREGADO/)
  // Unlock banner has no dead 0/1 progress bar
  assert.doesNotMatch(mapSrc, /prevSourceUserCount\}\s*\/\s*1/)

  // Forbidden dead/conflicting APIs and placeholders NEVER appear in unilevel-farm components
  for (const src of [modelSrc, mapSrc, modalSrc, withdrawSecSrc]) {
    assert.doesNotMatch(src, /\bUNILEVEL_20_LEVEL_PERCENTAGES\b/)
    assert.doesNotMatch(src, /\bgetUserCommissions\b/)
    assert.doesNotMatch(src, /\bexecuteUnilevelDistribution\b/)
    assert.doesNotMatch(src, /\bgetMiningDailyProfits\b/)
    assert.doesNotMatch(src, /pouwminer\.com\/ref|minero-demo/i)
  }

  // Design standards: obsidian/emerald (#050505 / #10b981), Chakra Petch + Rajdhani, glass blur 16-22px saturate 150-160%, breakpoints, hidden scrollbars, zero purple hexes, zero transition: all
  assert.match(farmCss, /#050505/i)
  assert.match(farmCss, /#10b981/i)
  assert.match(farmCss, /Chakra\+Petch/)
  assert.match(farmCss, /Rajdhani/)
  assert.match(farmCss, /backdrop-filter:\s*blur\((16|18|22)px\)\s*saturate\((150|160)%\)/)
  assert.match(farmCss, /@media\s*\(min-width:\s*760px\)/)
  assert.match(farmCss, /@media\s*\(max-width:\s*680px\)/)
  assert.match(farmCss, /@media\s*\(max-width:\s*420px\)/)
  assert.match(farmCss, /scrollbar-width:\s*none/)
  assert.match(farmCss, /::-webkit-scrollbar/)
  assert.doesNotMatch(farmCss, /#(7c3aed|8b5cf6|a855f7|a78bfa)/i)
  assert.doesNotMatch(farmCss, /transition\s*:\s*all\b/i)
  assert.match(farmCss, /scale\(0\.97\)/)

  // Protected rules and withdrawal modules have zero diff vs HEAD f2e9c8a
  const untouchedFiles = [
    'firestore.rules',
    'src/types/withdrawal.ts',
    'src/services/withdrawals/withdrawalAuthGuard.ts',
    'src/services/withdrawals/withdrawalConfigQuoteClient.ts',
    'src/services/withdrawals/withdrawalRequestClient.ts',
    'src/services/withdrawals/withdrawalClientHistoryService.ts',
  ]
  const diffOut = execFileSync('git', ['diff', '--name-only', 'f2e9c8a', '--', ...untouchedFiles], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()
  assert.equal(diffOut, '', `Protected files must remain untouched vs f2e9c8a: ${diffOut}`)
})
