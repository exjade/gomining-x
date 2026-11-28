import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const referralPagePath = path.resolve(import.meta.dirname, '../src/ReferralPage.tsx')
const referralPageBytes = fs.readFileSync(referralPagePath)
const referralPageSource = referralPageBytes.toString('utf8')

test('SCRUM-328/SCRUM-230: ReferralPage does not import or invoke executeUnilevelDistribution', () => {
  assert.doesNotMatch(referralPageSource, /\bexecuteUnilevelDistribution\b/)
})

test('SCRUM-328/SCRUM-230: ReferralPage removes client-side trigger handler, state, and synthetic miner ID', () => {
  assert.doesNotMatch(referralPageSource, /\bhandleTriggerUnilevel\b/)
  assert.doesNotMatch(referralPageSource, /\bsimulatingUnilevel\b/)
  assert.doesNotMatch(referralPageSource, /\bsetSimulatingUnilevel\b/)
  assert.ok(!referralPageSource.includes('MINER-SAMPLE-20L'))
})

test('SCRUM-328/SCRUM-230: ReferralPage removes manual trigger button and unused useRealtimeUserMiners listener', () => {
  assert.ok(!referralPageSource.includes('referral.run_unilevel_btn'))
  assert.ok(!referralPageSource.includes('referral.calculating'))
  assert.doesNotMatch(referralPageSource, /\buseRealtimeUserMiners\b/)
})

test('SCRUM-328/SCRUM-230: ReferralPage preserves read-only Unilevel, referral tree, commissions, sponsor, and withdrawal views', () => {
  assert.equal(
    crypto.createHash('sha256').update(referralPageBytes).digest('hex'),
    'cdf9f6fc15e833654161bf17e01fef023eb9ed409626fedbdd18f802847509ad',
  )
  assert.match(
    referralPageSource,
    /import\s*\{[\s\S]*\bgetFunctions\b[\s\S]*\bhttpsCallable\b[\s\S]*\}\s*from\s*['"]firebase\/functions['"]/,
  )
  assert.match(referralPageSource, /httpsCallable[\s\S]*['"]getUnilevelStats['"]/)
  assert.match(referralPageSource, /httpsCallable[\s\S]*['"]getUnilevelTree['"]/)
  assert.match(referralPageSource, /httpsCallable[\s\S]*['"]getUnilevelHistory['"]/)
  assert.doesNotMatch(referralPageSource, /\bgetUnilevelDistributions\b/)
  assert.doesNotMatch(referralPageSource, /\bgetUnilevelAccount\b/)
  assert.match(referralPageSource, /\bgetReferralAccount\b/)
  assert.match(referralPageSource, /\bgetReferralTransactions\b/)
  assert.match(referralPageSource, /\bgetUserCommissions\b/)
  assert.match(referralPageSource, /\brenderUnilevelModal\b/)
  assert.match(referralPageSource, /\bhandleAddSponsor\b/)
  assert.match(referralPageSource, /\bassignSponsorToUser\b/)
  assert.doesNotMatch(referralPageSource, /\bexecuteReferralWithdrawal\b/)
  assert.doesNotMatch(referralPageSource, /\bhandleExecuteWithdrawal\b/)
  assert.doesNotMatch(referralPageSource, /\brenderWithdrawalModal\b/)
  assert.match(referralPageSource, /to="\/withdraw\/GOMINING"/)
})
