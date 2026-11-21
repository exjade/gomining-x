'use strict';

const {
  parseUsdtToInternal,
  roundInternalToUsdt6,
  formatInternalToUsdt6,
  formatInternal,
  mulRateRoundDown,
  mulInternalRoundDown
} = require('../shared/money');
const { PLAN_VERSION_V1, getRatePlan } = require('./unilevelRates');

const ZERO_USDT6 = '0.000000';

function isUplineEligible(upline) {
  if (!upline || typeof upline !== 'object' || Array.isArray(upline)) {
    return false;
  }
  return (
    upline.status === 'active' &&
    upline.emailVerified === true &&
    Number.isInteger(upline.activeReferredMinersCount) &&
    upline.activeReferredMinersCount >= 1
  );
}

function calculateUnilevelDistribution(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('calculateUnilevelDistribution requires a non-array object');
  }

  const {
    sourceUserId,
    eligibleProfitUsdt,
    uplines,
    planVersion = PLAN_VERSION_V1
  } = input;

  if (typeof sourceUserId !== 'string' || sourceUserId.trim() === '') {
    throw new TypeError('sourceUserId must be a non-empty string');
  }
  const normalizedSourceUserId = sourceUserId.trim();
  if (!Array.isArray(uplines)) {
    throw new TypeError('uplines must be an array');
  }

  const plan = getRatePlan(planVersion);
  const eligibleProfitInternal = parseUsdtToInternal(eligibleProfitUsdt);
  const expectedPoolInternal = mulInternalRoundDown(eligibleProfitInternal, plan.totalPoolRateInternal);

  const visited = new Set([normalizedSourceUserId]);
  const levels = new Array(plan.rates.length);
  let cycleDetected = false;
  let distributedInternal = 0n;
  let sumLevelResidualsInternal = 0n;
  let undistributedRateInternal = 0n;

  for (let i = 0; i < plan.rates.length; i += 1) {
    const rateEntry = plan.rates[i];

    if (cycleDetected) {
      undistributedRateInternal += rateEntry.rateInternal;
      levels[i] = {
        level: rateEntry.level,
        uplineUserId: null,
        rateInternal: rateEntry.rateInternal,
        rateString: rateEntry.rateString,
        status: 'CYCLE_CUT',
        eligible: false,
        creditedInternal: 0n,
        creditedUsdt6: ZERO_USDT6,
        undistributedInternal: mulInternalRoundDown(eligibleProfitInternal, rateEntry.rateInternal),
        roundingResidualInternal: 0n
      };
      continue;
    }

    const upline = uplines[i];
    if (!upline) {
      undistributedRateInternal += rateEntry.rateInternal;
      levels[i] = {
        level: rateEntry.level,
        uplineUserId: null,
        rateInternal: rateEntry.rateInternal,
        rateString: rateEntry.rateString,
        status: 'EMPTY',
        eligible: false,
        creditedInternal: 0n,
        creditedUsdt6: ZERO_USDT6,
        undistributedInternal: mulInternalRoundDown(eligibleProfitInternal, rateEntry.rateInternal),
        roundingResidualInternal: 0n
      };
      continue;
    }

    const uid = typeof upline.uid === 'string' && upline.uid.trim() !== '' ? upline.uid.trim() : null;
    if (uid && visited.has(uid)) {
      cycleDetected = true;
      undistributedRateInternal += rateEntry.rateInternal;
      levels[i] = {
        level: rateEntry.level,
        uplineUserId: uid,
        rateInternal: rateEntry.rateInternal,
        rateString: rateEntry.rateString,
        status: 'CYCLE_CUT',
        eligible: false,
        creditedInternal: 0n,
        creditedUsdt6: ZERO_USDT6,
        undistributedInternal: mulInternalRoundDown(eligibleProfitInternal, rateEntry.rateInternal),
        roundingResidualInternal: 0n
      };
      continue;
    }

    if (uid) {
      visited.add(uid);
    }

    if (!uid || !isUplineEligible(upline)) {
      undistributedRateInternal += rateEntry.rateInternal;
      levels[i] = {
        level: rateEntry.level,
        uplineUserId: uid,
        rateInternal: rateEntry.rateInternal,
        rateString: rateEntry.rateString,
        status: 'INELIGIBLE',
        eligible: false,
        creditedInternal: 0n,
        creditedUsdt6: ZERO_USDT6,
        undistributedInternal: mulInternalRoundDown(eligibleProfitInternal, rateEntry.rateInternal),
        roundingResidualInternal: 0n
      };
      continue;
    }

    const credit = mulRateRoundDown(eligibleProfitInternal, rateEntry.rateInternal);
    distributedInternal += credit.amountInternal;
    sumLevelResidualsInternal += credit.roundingResidualInternal;
    levels[i] = {
      level: rateEntry.level,
      uplineUserId: uid,
      rateInternal: rateEntry.rateInternal,
      rateString: rateEntry.rateString,
      status: 'CREDITED',
      eligible: true,
      creditedInternal: credit.amountInternal,
      creditedUsdt6: credit.usdt6,
      undistributedInternal: 0n,
      roundingResidualInternal: credit.roundingResidualInternal
    };
  }

  // Aggregate undistributed share from exact uncredited rate sum so 0% credited returns 100% of expectedPool with 0 residual.
  const undistributedInternal = mulInternalRoundDown(eligibleProfitInternal, undistributedRateInternal);
  const roundingResidualInternal = expectedPoolInternal - distributedInternal - undistributedInternal;
  const poolTruncationResidualInternal = roundingResidualInternal - sumLevelResidualsInternal;
  const userMiningPayoutInternal = eligibleProfitInternal - expectedPoolInternal + undistributedInternal;
  const userMiningPayoutRounded = roundInternalToUsdt6(userMiningPayoutInternal);

  return {
    planVersion: plan.planVersion,
    sourceUserId: normalizedSourceUserId,
    eligibleProfitInternal,
    eligibleProfitUsdt6: formatInternalToUsdt6(eligibleProfitInternal),
    expectedPoolInternal,
    expectedPoolUsdt6: formatInternalToUsdt6(expectedPoolInternal),
    distributedInternal,
    distributedUsdt6: formatInternalToUsdt6(distributedInternal),
    undistributedInternal,
    undistributedUsdt6: formatInternalToUsdt6(undistributedInternal),
    roundingResidualInternal,
    roundingResidualInternalStr: formatInternal(roundingResidualInternal),
    poolTruncationResidualInternal,
    userMiningPayoutInternal,
    userMiningPayoutInternalStr: formatInternal(userMiningPayoutInternal),
    userMiningPayoutUsdt6: userMiningPayoutRounded.usdt6,
    userMiningPayoutRoundingResidualInternal: userMiningPayoutRounded.roundingResidualInternal,
    cycleDetected,
    levels
  };
}

module.exports = Object.freeze({
  isUplineEligible,
  calculateUnilevelDistribution
});
