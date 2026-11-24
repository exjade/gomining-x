'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  INTERNAL_DECIMALS,
  INTERNAL_SCALE,
  USDT_DECIMALS,
  USDT_SCALE,
  INTERNAL_TO_USDT6_FACTOR,
  ROUNDING_POLICY,
  parseUsdtToInternal,
  parseRateToInternal,
  roundInternalToUsdt6,
  formatInternalToUsdt6,
  formatInternal,
  mulRateRoundDown,
  mulInternalRoundDown
} = require('../src/shared/money');

const {
  PLAN_VERSION_V1,
  MAX_UNILEVEL_DEPTH,
  UNILEVEL_POOL_RATE_INTERNAL,
  UNILEVEL_V1_RATES,
  validateRatePlan,
  getRatePlan
} = require('../src/unilevel/unilevelRates');

const {
  BASE_EFFICIENCY_W_PER_TH,
  BASE_MAINTENANCE_RATE_INTERNAL,
  MEMBERSHIP_DISCOUNT_CAPS,
  calculateEligibleProfit
} = require('../src/unilevel/calculateEligibleProfit');

const {
  isUplineEligible,
  calculateUnilevelDistribution
} = require('../src/unilevel/calculateDistribution');

function makeEligibleUpline(uid, overrides = {}) {
  return {
    uid,
    status: 'active',
    emailVerified: true,
    activeReferredMinersCount: 1,
    ...overrides
  };
}

function makeChain(count, prefix = 'u') {
  return Array.from({ length: count }, (_, idx) => makeEligibleUpline(`${prefix}${idx + 1}`));
}

function assertAccountingInvariants(result) {
  assert.equal(
    result.distributedInternal + result.undistributedInternal + result.roundingResidualInternal,
    result.expectedPoolInternal,
    'distributed + undistributed + residual must equal expectedPool'
  );
  assert.equal(
    result.userMiningPayoutInternal + result.distributedInternal + result.roundingResidualInternal,
    result.eligibleProfitInternal,
    'userMiningPayout + distributed + residual must equal eligibleProfit'
  );
  assert.ok(
    result.distributedInternal <= result.expectedPoolInternal,
    'distributed must never exceed expectedPool'
  );
  assert.ok(
    result.roundingResidualInternal >= 0n,
    'roundingResidual must be non-negative'
  );
  const sumLevelResidualsInternal = result.levels.reduce(
    (acc, level) => acc + level.roundingResidualInternal,
    0n
  );
  assert.ok(
    typeof result.poolTruncationResidualInternal === 'bigint' && result.poolTruncationResidualInternal >= 0n,
    'poolTruncationResidualInternal must be a non-negative BigInt'
  );
  assert.equal(
    sumLevelResidualsInternal + result.poolTruncationResidualInternal,
    result.roundingResidualInternal,
    'sum(levels[].roundingResidualInternal) + poolTruncationResidualInternal must equal roundingResidualInternal'
  );
  assert.equal(
    result.userMiningPayoutInternalStr,
    formatInternal(result.userMiningPayoutInternal),
    'userMiningPayoutInternalStr must match exact 8-decimal userMiningPayoutInternal'
  );
  assert.ok(
    typeof result.userMiningPayoutRoundingResidualInternal === 'bigint' &&
      result.userMiningPayoutRoundingResidualInternal >= 0n &&
      result.userMiningPayoutRoundingResidualInternal < INTERNAL_TO_USDT6_FACTOR,
    'userMiningPayoutRoundingResidualInternal must be within [0n, 99n]'
  );
  assert.equal(
    parseUsdtToInternal(result.userMiningPayoutUsdt6) + result.userMiningPayoutRoundingResidualInternal,
    result.userMiningPayoutInternal,
    'parseUsdtToInternal(userMiningPayoutUsdt6) + userMiningPayoutRoundingResidualInternal must equal userMiningPayoutInternal'
  );
  assert.equal(result.levels.length, MAX_UNILEVEL_DEPTH);
}

describe('shared/money (BigInt 8-dec internal / 6-dec USDT ROUND_DOWN)', () => {
  it('exposes exact scale and rounding constants', () => {
    assert.equal(INTERNAL_DECIMALS, 8);
    assert.equal(INTERNAL_SCALE, 100_000_000n);
    assert.equal(USDT_DECIMALS, 6);
    assert.equal(USDT_SCALE, 1_000_000n);
    assert.equal(INTERNAL_TO_USDT6_FACTOR, 100n);
    assert.equal(ROUNDING_POLICY, 'ROUND_DOWN');
  });

  it('parses valid decimal strings and finite non-negative numbers to 1e8 BigInt', () => {
    assert.equal(parseUsdtToInternal('0'), 0n);
    assert.equal(parseUsdtToInternal(0), 0n);
    assert.equal(parseUsdtToInternal('0.00000001'), 1n);
    assert.equal(parseUsdtToInternal('0.000001'), 100n);
    assert.equal(parseUsdtToInternal('2.1762'), 217_620_000n);
    assert.equal(parseUsdtToInternal(2.85), 285_000_000n);
    assert.equal(parseUsdtToInternal('999999.99999999'), 99_999_999_999_999n);
  });

  it('supports finite non-negative JS numbers in (0, 1e-6) up to 8 decimals and rejects >8 decimals or scientific strings', () => {
    assert.equal(parseUsdtToInternal(1e-7), 10n);
    assert.equal(parseUsdtToInternal(0.0000001), 10n);
    assert.equal(parseUsdtToInternal(1e-8), 1n);
    assert.equal(parseUsdtToInternal(1.5e-7), 15n);
    assert.equal(parseUsdtToInternal(9.9e-7), 99n);
    assert.equal(parseUsdtToInternal(1e-6), 100n);

    for (const bad of [1e-9, 1.23e-7, 9.99e-7, 5e-9, Number.MIN_VALUE, -1e-7, '1e-7', '1e-8', '1.5e-7']) {
      assert.throws(() => parseUsdtToInternal(bad), RangeError, `Expected RangeError for ${String(bad)}`);
    }
  });

  it('rejects negative, NaN, Infinity, malformed, non-numeric, and >8-decimal inputs', () => {
    const invalidInputs = [
      -1,
      -0.000001,
      '-1',
      '-0.01',
      '+1.00',
      NaN,
      Infinity,
      -Infinity,
      '',
      '   ',
      'abc',
      '1.2.3',
      '.5',
      '5.',
      '1e-6',
      '0.123456789',
      ' 1.00 ',
      null,
      undefined,
      {},
      [],
      true,
      100n
    ];

    for (const input of invalidInputs) {
      assert.throws(() => parseUsdtToInternal(input), { name: /Error/ }, `Expected throw for ${String(input)}`);
    }
  });

  it('parses rates strictly within [0, 1] and rejects out-of-range values', () => {
    assert.equal(parseRateToInternal(0), 0n);
    assert.equal(parseRateToInternal('0.0195'), 1_950_000n);
    assert.equal(parseRateToInternal('0.20'), 20_000_000n);
    assert.equal(parseRateToInternal('1'), 100_000_000n);
    assert.throws(() => parseRateToInternal('1.00000001'));
    assert.throws(() => parseRateToInternal('-0.01'));
    assert.throws(() => parseRateToInternal(1.5));
  });

  it('rounds down internal amounts to 6-decimal micro-USDT with explicit residual', () => {
    const rounded = roundInternalToUsdt6(4_243_590n);
    assert.deepEqual(rounded, {
      amountInternal: 4_243_500n,
      microUsdt: 42_435n,
      usdt6: '0.042435',
      roundingResidualInternal: 90n
    });
    assert.equal(formatInternalToUsdt6(4_243_590n), '0.042435');
    assert.equal(formatInternal(4_243_590n), '0.04243590');
    assert.equal(formatInternal(1_000n), '0.00001000');

    // Never rounds up even at .xxxxxx99
    const nearBoundary = roundInternalToUsdt6(99n);
    assert.equal(nearBoundary.amountInternal, 0n);
    assert.equal(nearBoundary.usdt6, '0.000000');
    assert.equal(nearBoundary.roundingResidualInternal, 99n);
  });

  it('multiplies by rate with ROUND_DOWN and exposes exactInternal and residual', () => {
    const res = mulRateRoundDown(217_620_000n, 1_950_000n);
    assert.deepEqual(res, {
      exactInternal: 4_243_590n,
      amountInternal: 4_243_500n,
      microUsdt: 42_435n,
      usdt6: '0.042435',
      roundingResidualInternal: 90n
    });
    assert.equal(mulInternalRoundDown(217_620_000n, 20_000_000n), 43_524_000n);
    assert.throws(() => mulInternalRoundDown(-1n, 100n));
    assert.throws(() => roundInternalToUsdt6(-1n));
  });
});

describe('unilevel/unilevelRates (UNILEVEL_V1 schedule & startup validation)', () => {
  it('defines exactly 20 descending levels from 1.95% to 0.05% summing to exactly 20%', () => {
    assert.equal(PLAN_VERSION_V1, 'UNILEVEL_V1');
    assert.equal(MAX_UNILEVEL_DEPTH, 20);
    assert.equal(UNILEVEL_POOL_RATE_INTERNAL, 20_000_000n);
    assert.equal(UNILEVEL_V1_RATES.length, 20);
    assert.ok(Object.isFrozen(UNILEVEL_V1_RATES));

    assert.equal(UNILEVEL_V1_RATES[0].level, 1);
    assert.equal(UNILEVEL_V1_RATES[0].bps, 195);
    assert.equal(UNILEVEL_V1_RATES[0].rateInternal, 1_950_000n);
    assert.equal(UNILEVEL_V1_RATES[0].rateString, '0.0195');

    assert.equal(UNILEVEL_V1_RATES[19].level, 20);
    assert.equal(UNILEVEL_V1_RATES[19].bps, 5);
    assert.equal(UNILEVEL_V1_RATES[19].rateInternal, 50_000n);
    assert.equal(UNILEVEL_V1_RATES[19].rateString, '0.0005');

    // Step is strictly -0.0010 (-10 bps / -100_000n) per level
    for (let i = 1; i < UNILEVEL_V1_RATES.length; i += 1) {
      assert.equal(UNILEVEL_V1_RATES[i - 1].rateInternal - UNILEVEL_V1_RATES[i].rateInternal, 100_000n);
      assert.equal(UNILEVEL_V1_RATES[i - 1].bps - UNILEVEL_V1_RATES[i].bps, 10);
      assert.ok(Object.isFrozen(UNILEVEL_V1_RATES[i]));
    }

    assert.equal(validateRatePlan(UNILEVEL_V1_RATES), 20_000_000n);
    const totalBps = UNILEVEL_V1_RATES.reduce((acc, entry) => acc + entry.bps, 0);
    assert.equal(totalBps, 2000);
  });

  it('rejects tampered length, non-positive rate, mismatched sum, or unknown plan version', () => {
    assert.throws(() => validateRatePlan(UNILEVEL_V1_RATES.slice(0, 19)));
    assert.throws(() => validateRatePlan([...UNILEVEL_V1_RATES, { level: 21, bps: 5, rateInternal: 50_000n }]));

    const tamperedSum = UNILEVEL_V1_RATES.map((r, idx) => (idx === 0 ? { ...r, rateInternal: r.rateInternal + 1n } : r));
    assert.throws(() => validateRatePlan(tamperedSum));

    const tamperedZero = UNILEVEL_V1_RATES.map((r, idx) => (idx === 19 ? { ...r, rateInternal: 0n } : r));
    assert.throws(() => validateRatePlan(tamperedZero));

    const plan = getRatePlan('UNILEVEL_V1');
    assert.equal(plan.planVersion, 'UNILEVEL_V1');
    assert.equal(plan.maxDepth, 20);
    assert.equal(plan.totalPoolRateInternal, 20_000_000n);
    assert.equal(plan.rates.length, 20);

    assert.throws(() => getRatePlan('UNILEVEL_V2'));
    assert.throws(() => getRatePlan(''));
  });

  it('rejects out-of-order or non-sequential level numbers in validateRatePlan', () => {
    const swapped = [...UNILEVEL_V1_RATES];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    assert.throws(() => validateRatePlan(swapped), /level/i);

    const reversed = [...UNILEVEL_V1_RATES].reverse();
    assert.throws(() => validateRatePlan(reversed), /level/i);

    const wrongLevel = UNILEVEL_V1_RATES.map((r, idx) => (idx === 5 ? { ...r, level: 99 } : r));
    assert.throws(() => validateRatePlan(wrongLevel), /level/i);

    const missingLevel = UNILEVEL_V1_RATES.map((r, idx) => (idx === 0 ? { rateInternal: r.rateInternal } : r));
    assert.throws(() => validateRatePlan(missingLevel), /level/i);
  });
});

describe('unilevel/calculateEligibleProfit', () => {
  it('computes the exact reference case (2.85 -> 2.1762 USDT) with default efficiency 15 W/TH', () => {
    assert.equal(BASE_EFFICIENCY_W_PER_TH, 15);
    assert.equal(BASE_MAINTENANCE_RATE_INTERNAL, 10_000_000n);

    const res = calculateEligibleProfit({
      grossRevenueUsdt: '2.85',
      powerTh: '120',
      baseElectricityUsdPerKwh: '0.01',
      membershipTier: 'explorer',
      electricityDiscountPct: 0,
      maintenanceDiscountPct: 0
    });

    assert.equal(res.membershipTier, 'explorer');
    assert.equal(res.grossRevenueInternal, 285_000_000n);
    assert.equal(res.electricityKwhInternal, 4_320_000_000n); // 43.2 kWh
    assert.equal(res.electricityCostInternal, 43_200_000n);
    assert.equal(res.electricityCostUsdt6, '0.432000');
    assert.equal(res.afterElectricityInternal, 241_800_000n);
    assert.equal(res.afterElectricityUsdt6, '2.418000');
    assert.equal(res.maintenanceCostInternal, 24_180_000n);
    assert.equal(res.maintenanceCostUsdt6, '0.241800');
    assert.equal(res.eligibleProfitInternal, 217_620_000n);
    assert.equal(res.eligibleProfitUsdt6, '2.176200');
  });

  it('enforces and clamps membership discount caps for Explorer, Starter, and Pro', () => {
    assert.equal(MEMBERSHIP_DISCOUNT_CAPS.explorer.electricityMaxInternal, 5_000_000n);
    assert.equal(MEMBERSHIP_DISCOUNT_CAPS.explorer.maintenanceMaxInternal, 0n);
    assert.equal(MEMBERSHIP_DISCOUNT_CAPS.starter.electricityMaxInternal, 10_000_000n);
    assert.equal(MEMBERSHIP_DISCOUNT_CAPS.starter.maintenanceMaxInternal, 5_000_000n);
    assert.equal(MEMBERSHIP_DISCOUNT_CAPS.pro.electricityMaxInternal, 20_000_000n);
    assert.equal(MEMBERSHIP_DISCOUNT_CAPS.pro.maintenanceMaxInternal, 10_000_000n);

    // Explorer requesting 0.50 elec / 0.50 maint -> clamped to 0.05 / 0
    const explorer = calculateEligibleProfit({
      grossRevenueUsdt: '2.85',
      powerTh: 120,
      effectiveEfficiencyWPerTh: 15,
      baseElectricityUsdPerKwh: '0.01',
      membershipTier: 'explorer',
      electricityDiscountPct: '0.50',
      maintenanceDiscountPct: '0.50'
    });
    assert.equal(explorer.effectiveElectricityDiscountInternal, 5_000_000n);
    assert.equal(explorer.effectiveMaintenanceDiscountInternal, 0n);
    // elec = 0.432 * 0.95 = 0.4104; after = 2.4396; maint = 0.24396; eligible = 2.19564
    assert.equal(explorer.electricityCostUsdt6, '0.410400');
    assert.equal(explorer.afterElectricityUsdt6, '2.439600');
    assert.equal(explorer.maintenanceCostUsdt6, '0.243960');
    assert.equal(explorer.eligibleProfitUsdt6, '2.195640');

    // Starter requesting 0.30 elec / 0.20 maint -> clamped to 0.10 / 0.05
    const starter = calculateEligibleProfit({
      grossRevenueUsdt: '2.85',
      powerTh: 120,
      baseElectricityUsdPerKwh: '0.01',
      membershipTier: 'starter',
      electricityDiscountPct: '0.30',
      maintenanceDiscountPct: '0.20'
    });
    assert.equal(starter.effectiveElectricityDiscountInternal, 10_000_000n);
    assert.equal(starter.effectiveMaintenanceDiscountInternal, 5_000_000n);
    // elec = 0.432 * 0.90 = 0.3888; after = 2.4612; maint = 2.4612 * 0.095 = 0.233814; eligible = 2.227386
    assert.equal(starter.electricityCostUsdt6, '0.388800');
    assert.equal(starter.afterElectricityUsdt6, '2.461200');
    assert.equal(starter.maintenanceCostUsdt6, '0.233814');
    assert.equal(starter.eligibleProfitUsdt6, '2.227386');

    // Pro requesting 0.50 elec / 0.50 maint -> clamped to 0.20 / 0.10
    const pro = calculateEligibleProfit({
      grossRevenueUsdt: '2.85',
      powerTh: 120,
      baseElectricityUsdPerKwh: '0.01',
      membershipTier: 'pro',
      electricityDiscountPct: '0.50',
      maintenanceDiscountPct: '0.50'
    });
    assert.equal(pro.effectiveElectricityDiscountInternal, 20_000_000n);
    assert.equal(pro.effectiveMaintenanceDiscountInternal, 10_000_000n);
    // elec = 0.432 * 0.80 = 0.3456; after = 2.5044; maint = 2.5044 * 0.09 = 0.225396; eligible = 2.279004
    assert.equal(pro.electricityCostUsdt6, '0.345600');
    assert.equal(pro.afterElectricityUsdt6, '2.504400');
    assert.equal(pro.maintenanceCostUsdt6, '0.225396');
    assert.equal(pro.eligibleProfitUsdt6, '2.279004');
  });

  it('floors afterElectricity, maintenanceCost, and eligibleProfit at 0 when grossRevenue <= electricityCost', () => {
    const equalCase = calculateEligibleProfit({
      grossRevenueUsdt: '0.432',
      powerTh: '120',
      baseElectricityUsdPerKwh: '0.01'
    });
    assert.equal(equalCase.afterElectricityInternal, 0n);
    assert.equal(equalCase.maintenanceCostInternal, 0n);
    assert.equal(equalCase.eligibleProfitInternal, 0n);

    const deficitCase = calculateEligibleProfit({
      grossRevenueUsdt: '0.10',
      powerTh: '120',
      baseElectricityUsdPerKwh: '0.01'
    });
    assert.equal(deficitCase.afterElectricityInternal, 0n);
    assert.equal(deficitCase.maintenanceCostInternal, 0n);
    assert.equal(deficitCase.eligibleProfitInternal, 0n);
    assert.equal(deficitCase.eligibleProfitUsdt6, '0.000000');
  });

  it('rejects invalid membership tiers and negative discounts', () => {
    assert.throws(() => calculateEligibleProfit({
      grossRevenueUsdt: '2.85',
      powerTh: '120',
      baseElectricityUsdPerKwh: '0.01',
      membershipTier: 'enterprise'
    }));
    assert.throws(() => calculateEligibleProfit({
      grossRevenueUsdt: '2.85',
      powerTh: '120',
      baseElectricityUsdPerKwh: '0.01',
      membershipTier: 'toString'
    }));
    assert.throws(() => calculateEligibleProfit({
      grossRevenueUsdt: '2.85',
      powerTh: '120',
      baseElectricityUsdPerKwh: '0.01',
      electricityDiscountPct: '-0.01'
    }));
    assert.throws(() => calculateEligibleProfit({
      grossRevenueUsdt: '2.85',
      powerTh: '120',
      baseElectricityUsdPerKwh: '0.01',
      maintenanceDiscountPct: '-0.01'
    }));
  });

  it('rejects null, undefined, primitives, and arrays with a descriptive TypeError', () => {
    for (const bad of [null, undefined, [], 'invalid', 123, true]) {
      assert.throws(
        () => calculateEligibleProfit(bad),
        (err) => err instanceof TypeError && /object/i.test(err.message),
        `Expected descriptive TypeError for ${String(bad)}`
      );
    }
  });
});

describe('unilevel/calculateDistribution (eligibility, anti-cycle, depth 20, Option A, scenarios, PBT)', () => {
  it('enforces strict upline eligibility criteria', () => {
    assert.equal(isUplineEligible(makeEligibleUpline('u1')), true);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { activeReferredMinersCount: 5 })), true);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: 'ACTIVE' })), true);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: 'Active' })), true);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: ' active ' })), true);

    assert.equal(isUplineEligible(null), false);
    assert.equal(isUplineEligible(undefined), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: 'inactive' })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: 'INACTIVE' })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: 'blocked' })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: 'BLOCKED' })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: 'suspended' })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: 'SUSPENDED' })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: undefined })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: null })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: '' })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: '   ' })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: true })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: 1 })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: {} })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { status: 'unknown' })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { emailVerified: false })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { emailVerified: 'true' })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { activeReferredMinersCount: 0 })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { activeReferredMinersCount: -1 })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { activeReferredMinersCount: 1.5 })), false);
    assert.equal(isUplineEligible(makeEligibleUpline('u1', { activeReferredMinersCount: '1' })), false);
  });

  it('cuts chain immediately on self-referral (A -> A) and cycles (A -> B -> A, A -> B -> C -> B -> D)', () => {
    // Self-referral A -> A
    const selfRef = calculateUnilevelDistribution({
      sourceUserId: 'A',
      eligibleProfitUsdt: '2.1762',
      uplines: [makeEligibleUpline('A'), makeEligibleUpline('B')]
    });
    assert.equal(selfRef.cycleDetected, true);
    assert.equal(selfRef.distributedInternal, 0n);
    assert.equal(selfRef.undistributedInternal, selfRef.expectedPoolInternal);
    assert.equal(selfRef.userMiningPayoutInternal, selfRef.eligibleProfitInternal);
    assert.equal(selfRef.levels[0].status, 'CYCLE_CUT');
    assert.equal(selfRef.levels[1].status, 'CYCLE_CUT');
    assertAccountingInvariants(selfRef);

    // Cycle A -> B -> A
    const abCycle = calculateUnilevelDistribution({
      sourceUserId: 'A',
      eligibleProfitUsdt: '2.1762',
      uplines: [makeEligibleUpline('B'), makeEligibleUpline('A'), makeEligibleUpline('C')]
    });
    assert.equal(abCycle.cycleDetected, true);
    assert.equal(abCycle.levels[0].status, 'CREDITED');
    assert.equal(abCycle.levels[0].uplineUserId, 'B');
    assert.equal(abCycle.levels[0].creditedUsdt6, '0.042435');
    assert.equal(abCycle.levels[1].status, 'CYCLE_CUT');
    assert.equal(abCycle.levels[2].status, 'CYCLE_CUT');
    assert.equal(abCycle.distributedInternal, 4_243_500n);
    assertAccountingInvariants(abCycle);

    // Mid-chain cycle A -> B -> C -> B -> D (credits B at L1, C at L2; cuts at L3 and drops D at L4)
    const midCycle = calculateUnilevelDistribution({
      sourceUserId: 'A',
      eligibleProfitUsdt: '2.1762',
      uplines: [
        makeEligibleUpline('B'),
        makeEligibleUpline('C'),
        makeEligibleUpline('B'),
        makeEligibleUpline('D')
      ]
    });
    assert.equal(midCycle.cycleDetected, true);
    assert.equal(midCycle.levels[0].status, 'CREDITED');
    assert.equal(midCycle.levels[1].status, 'CREDITED');
    assert.equal(midCycle.levels[2].status, 'CYCLE_CUT');
    assert.equal(midCycle.levels[3].status, 'CYCLE_CUT');
    assert.equal(midCycle.levels[3].creditedInternal, 0n);
    assert.equal(midCycle.distributedInternal, 4_243_500n + 4_025_900n);
    assertAccountingInvariants(midCycle);
  });

  it('rejects non-object/array inputs and normalizes whitespace in sourceUserId and upline.uid for anti-cycle detection', () => {
    for (const bad of [null, undefined, [], 'invalid', 42, false]) {
      assert.throws(
        () => calculateUnilevelDistribution(bad),
        (err) => err instanceof TypeError && /object/i.test(err.message),
        `Expected descriptive TypeError for ${String(bad)}`
      );
    }
    assert.equal(isUplineEligible([]), false);

    // Self-referral evasion via trailing/leading whitespace ('u1' vs 'u1 ')
    const paddedSelf = calculateUnilevelDistribution({
      sourceUserId: ' u1 ',
      eligibleProfitUsdt: '2.1762',
      uplines: [makeEligibleUpline('u1 ')]
    });
    assert.equal(paddedSelf.sourceUserId, 'u1');
    assert.equal(paddedSelf.cycleDetected, true);
    assert.equal(paddedSelf.levels[0].status, 'CYCLE_CUT');
    assert.equal(paddedSelf.levels[0].uplineUserId, 'u1');
    assert.equal(paddedSelf.distributedInternal, 0n);
    assertAccountingInvariants(paddedSelf);

    // Upline-to-upline cycle evasion via whitespace ('u1' vs 'u1 ')
    const paddedChain = calculateUnilevelDistribution({
      sourceUserId: ' owner ',
      eligibleProfitUsdt: '2.1762',
      uplines: [makeEligibleUpline(' u1'), makeEligibleUpline('u1 '), makeEligibleUpline('u2')]
    });
    assert.equal(paddedChain.sourceUserId, 'owner');
    assert.equal(paddedChain.cycleDetected, true);
    assert.equal(paddedChain.levels[0].status, 'CREDITED');
    assert.equal(paddedChain.levels[0].uplineUserId, 'u1');
    assert.equal(paddedChain.levels[1].status, 'CYCLE_CUT');
    assert.equal(paddedChain.levels[1].uplineUserId, 'u1');
    assert.equal(paddedChain.levels[2].status, 'CYCLE_CUT');
    assert.equal(paddedChain.levels[2].creditedInternal, 0n);
    assertAccountingInvariants(paddedChain);
  });

  it('ignores L21+ uplines strictly beyond depth 20', () => {
    const res = calculateUnilevelDistribution({
      sourceUserId: 'miner-owner',
      eligibleProfitUsdt: '2.1762',
      uplines: makeChain(25)
    });
    assert.equal(res.levels.length, 20);
    assert.equal(res.levels[19].level, 20);
    assert.equal(res.levels[19].uplineUserId, 'u20');
    assert.equal(res.levels.some((l) => l.uplineUserId === 'u21'), false);
    assert.equal(res.distributedUsdt6, '0.435230');
    assertAccountingInvariants(res);
  });

  it('applies Option A (no compression) and returns undistributedAmount to userMiningPayout', () => {
    // Sparse gaps [u1, null, u3]: u3 stays at L3 (1.75%), NOT L2 (1.85%)
    const sparse = calculateUnilevelDistribution({
      sourceUserId: 'owner',
      eligibleProfitUsdt: '2.1762',
      uplines: [makeEligibleUpline('u1'), null, makeEligibleUpline('u3')]
    });
    assert.equal(sparse.cycleDetected, false);
    assert.equal(sparse.levels[0].status, 'CREDITED');
    assert.equal(sparse.levels[0].creditedUsdt6, '0.042435'); // L1 1.95%
    assert.equal(sparse.levels[1].status, 'EMPTY');
    assert.equal(sparse.levels[1].creditedInternal, 0n);
    assert.equal(sparse.levels[2].status, 'CREDITED');
    assert.equal(sparse.levels[2].rateString, '0.0175');
    assert.equal(sparse.levels[2].creditedUsdt6, '0.038083'); // L3 1.75% of 2.1762 = 0.03808350 -> 0.038083
    assert.equal(sparse.roundingResidualInternal, 140n); // 90n + 50n
    assertAccountingInvariants(sparse);

    // Ineligible L2 adds L2 share to undistributed without shifting L3
    const ineligL2 = calculateUnilevelDistribution({
      sourceUserId: 'owner',
      eligibleProfitUsdt: '2.1762',
      uplines: [
        makeEligibleUpline('u1'),
        makeEligibleUpline('u2', { emailVerified: false }),
        makeEligibleUpline('u3')
      ]
    });
    assert.equal(ineligL2.levels[1].status, 'INELIGIBLE');
    assert.equal(ineligL2.levels[2].creditedUsdt6, '0.038083');
    assert.equal(ineligL2.undistributedInternal, sparse.undistributedInternal);
    assertAccountingInvariants(ineligL2);

    // Empty uplines returns 100% of eligibleProfit to userMiningPayout with 0 residual
    const empty = calculateUnilevelDistribution({
      sourceUserId: 'owner',
      eligibleProfitUsdt: '2.1762',
      uplines: []
    });
    assert.equal(empty.distributedInternal, 0n);
    assert.equal(empty.undistributedInternal, 43_524_000n);
    assert.equal(empty.roundingResidualInternal, 0n);
    assert.equal(empty.userMiningPayoutInternal, 217_620_000n);
    assert.equal(empty.userMiningPayoutUsdt6, '2.176200');
    assertAccountingInvariants(empty);
  });

  it('matches Official Scenario 1: 1 miner, 20 eligible uplines (eligibleProfit = 2.1762)', () => {
    const res = calculateUnilevelDistribution({
      sourceUserId: 'miner-1',
      eligibleProfitUsdt: '2.1762',
      uplines: makeChain(20)
    });

    assert.equal(res.expectedPoolInternal, 43_524_000n);
    assert.equal(res.expectedPoolUsdt6, '0.435240');
    assert.equal(res.levels[0].creditedUsdt6, '0.042435');
    assert.equal(res.levels[0].roundingResidualInternal, 90n);
    assert.equal(res.levels[19].creditedUsdt6, '0.001088');
    assert.equal(res.levels[19].roundingResidualInternal, 10n);
    assert.equal(res.distributedInternal, 43_523_000n);
    assert.equal(res.distributedUsdt6, '0.435230');
    assert.equal(res.undistributedInternal, 0n);
    assert.equal(res.roundingResidualInternal, 1_000n);
    assert.equal(res.roundingResidualInternalStr, '0.00001000');
    assert.equal(res.userMiningPayoutInternal, 174_096_000n);
    assert.equal(res.userMiningPayoutUsdt6, '1.740960');
    assertAccountingInvariants(res);
  });

  it('reconciles poolTruncationResidualInternal and userMiningPayout 1e8->1e6 residual on Starter (2.227386) and 1.000001', () => {
    const starterDist = calculateUnilevelDistribution({
      sourceUserId: 'starter-owner',
      eligibleProfitUsdt: '2.227386',
      uplines: makeChain(20)
    });
    assert.equal(starterDist.poolTruncationResidualInternal, 10n);
    assert.equal(starterDist.userMiningPayoutInternal, 178_190_880n);
    assert.equal(starterDist.userMiningPayoutInternalStr, '1.78190880');
    assert.equal(starterDist.userMiningPayoutUsdt6, '1.781908');
    assert.equal(starterDist.userMiningPayoutRoundingResidualInternal, 80n);
    assertAccountingInvariants(starterDist);

    const microDist = calculateUnilevelDistribution({
      sourceUserId: 'micro-owner',
      eligibleProfitUsdt: '1.000001',
      uplines: makeChain(20)
    });
    assert.equal(microDist.poolTruncationResidualInternal, 10n);
    assert.equal(microDist.userMiningPayoutInternal, 80_000_080n);
    assert.equal(microDist.userMiningPayoutInternalStr, '0.80000080');
    assert.equal(microDist.userMiningPayoutUsdt6, '0.800000');
    assert.equal(microDist.userMiningPayoutRoundingResidualInternal, 80n);
    assertAccountingInvariants(microDist);
  });

  it('matches Official Scenarios 2, 3, and 4 (20, 100, and 2,000 miners across 20 levels)', () => {
    const leader = makeEligibleUpline('leader');
    const scenarios = [
      {
        name: 'Scenario 2: 20 miners (1/level)',
        minersPerLevel: 1,
        expectedNetworkPoolUsdt6: '8.704800',
        expectedLeaderCreditedUsdt6: '0.435230',
        expectedLeaderResidualInternal: 1_000n,
        expectedLeaderExactUsdt6: '0.435240'
      },
      {
        name: 'Scenario 3: 100 miners (5/level)',
        minersPerLevel: 5,
        expectedNetworkPoolUsdt6: '43.524000',
        expectedLeaderCreditedUsdt6: '2.176150',
        expectedLeaderResidualInternal: 5_000n,
        expectedLeaderExactUsdt6: '2.176200'
      },
      {
        name: 'Scenario 4: 2,000 miners (100/level)',
        minersPerLevel: 100,
        expectedNetworkPoolUsdt6: '870.480000',
        expectedLeaderCreditedUsdt6: '43.523000',
        expectedLeaderResidualInternal: 100_000n,
        expectedLeaderExactUsdt6: '43.524000'
      }
    ];

    for (const sc of scenarios) {
      let networkPoolInternal = 0n;
      let leaderCreditedInternal = 0n;
      let leaderResidualInternal = 0n;

      for (let depth = 1; depth <= MAX_UNILEVEL_DEPTH; depth += 1) {
        // Place leader at exact depth `depth` (index `depth - 1`) in each miner's upline chain
        const uplines = makeChain(20, `d${depth}-u`);
        uplines[depth - 1] = leader;

        for (let m = 0; m < sc.minersPerLevel; m += 1) {
          const dist = calculateUnilevelDistribution({
            sourceUserId: `miner-d${depth}-m${m}`,
            eligibleProfitUsdt: '2.1762',
            uplines
          });
          networkPoolInternal += dist.expectedPoolInternal;
          const leaderEntry = dist.levels[depth - 1];
          assert.equal(leaderEntry.uplineUserId, 'leader');
          leaderCreditedInternal += leaderEntry.creditedInternal;
          leaderResidualInternal += leaderEntry.roundingResidualInternal;
        }
      }

      assert.equal(formatInternalToUsdt6(networkPoolInternal), sc.expectedNetworkPoolUsdt6, sc.name);
      assert.equal(formatInternalToUsdt6(leaderCreditedInternal), sc.expectedLeaderCreditedUsdt6, sc.name);
      assert.equal(leaderResidualInternal, sc.expectedLeaderResidualInternal, sc.name);
      assert.equal(
        formatInternalToUsdt6(leaderCreditedInternal + leaderResidualInternal),
        sc.expectedLeaderExactUsdt6,
        sc.name
      );
    }
  });

  it('satisfies exact accounting invariants across 70+ deterministic property-based cases', () => {
    const profits = [
      '0',
      '0.00000001',
      '0.00000007',
      '0.000001',
      '0.000003',
      '0.000007',
      '0.000019',
      '0.000123',
      '0.01',
      '0.123456',
      '0.999999',
      '1.000001',
      '2.1762',
      '3.141592',
      '7.777777',
      '19.999999',
      '100.000001',
      '999.999999',
      '12345.678901',
      '100000.123456',
      '999999.999999'
    ];

    const chainBuilders = [
      () => [],
      () => makeChain(1),
      () => makeChain(20),
      () => makeChain(25),
      () => Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? makeEligibleUpline(`e${i}`) : null)),
      () => Array.from({ length: 20 }, (_, i) =>
        i % 3 === 0
          ? makeEligibleUpline(`i${i}`, { status: 'inactive' })
          : i % 3 === 1
            ? makeEligibleUpline(`v${i}`, { emailVerified: false })
            : makeEligibleUpline(`m${i}`, { activeReferredMinersCount: 0 })
      ),
      () => [makeEligibleUpline('c1'), makeEligibleUpline('c2'), makeEligibleUpline('c1'), makeEligibleUpline('c3')]
    ];

    let caseCount = 0;
    for (let pIdx = 0; pIdx < profits.length; pIdx += 1) {
      for (let cIdx = 0; cIdx < chainBuilders.length; cIdx += 1) {
        // Deterministic subset yielding 21 * 4 = 84 varied cases (>= 60 required)
        if ((pIdx + cIdx) % 2 !== 0 && cIdx > 2) continue;
        const uplines = chainBuilders[cIdx]();
        const result = calculateUnilevelDistribution({
          sourceUserId: `pbt-user-${pIdx}-${cIdx}`,
          eligibleProfitUsdt: profits[pIdx],
          uplines
        });
        assertAccountingInvariants(result);
        if (uplines.length === 0) {
          assert.equal(result.roundingResidualInternal, 0n);
          assert.equal(result.userMiningPayoutInternal, result.eligibleProfitInternal);
        }
        caseCount += 1;
      }
    }

    assert.ok(caseCount >= 60, `Expected >= 60 PBT cases, executed ${caseCount}`);
  });
});

describe('shared/accountStatus (ADR-0009 canonical normalization & fail-closed boundaries)', () => {
  it('exports canonical statuses and normalizes legacy, casing, !exists, non-string, and unknown values', () => {
    const {
      CANONICAL_ACCOUNT_STATUSES,
      KNOWN_ACCOUNT_STATUS_SET,
      INACTIVE_ACCOUNT_STATUSES,
      normalizeAccountStatus,
      isAccountStatusActive
    } = require('../src/shared/accountStatus');

    assert.deepEqual(CANONICAL_ACCOUNT_STATUSES, {
      ACTIVE: 'active',
      INACTIVE: 'inactive',
      SUSPENDED: 'suspended',
      BLOCKED: 'blocked'
    });
    assert.equal(Object.isFrozen(CANONICAL_ACCOUNT_STATUSES), true);
    assert.deepEqual([...KNOWN_ACCOUNT_STATUS_SET].sort(), ['active', 'blocked', 'inactive', 'suspended']);
    assert.deepEqual([...INACTIVE_ACCOUNT_STATUSES].sort(), ['blocked', 'inactive', 'suspended']);

    // Fail-closed when document does not exist
    for (const raw of [undefined, null, '', '   ', 'active', 'ACTIVE', 'suspended', true]) {
      assert.equal(normalizeAccountStatus(raw, { exists: false }), 'inactive');
      assert.equal(isAccountStatusActive(raw, { exists: false }), false);
    }

    // Legacy compatibility on existing documents
    for (const legacyRaw of [undefined, null, '', '   ']) {
      assert.equal(normalizeAccountStatus(legacyRaw), 'active');
      assert.equal(normalizeAccountStatus(legacyRaw, { exists: true }), 'active');
      assert.equal(isAccountStatusActive(legacyRaw), true);
    }

    // Case-insensitive + trimmed canonical strings
    for (const activeRaw of ['active', 'ACTIVE', 'Active', '  aCtIvE  ']) {
      assert.equal(normalizeAccountStatus(activeRaw), 'active');
      assert.equal(isAccountStatusActive(activeRaw), true);
    }
    assert.equal(normalizeAccountStatus('INACTIVE'), 'inactive');
    assert.equal(normalizeAccountStatus(' suspended '), 'suspended');
    assert.equal(normalizeAccountStatus('SUSPENDED'), 'suspended');
    assert.equal(normalizeAccountStatus('BLOCKED'), 'blocked');
    assert.equal(isAccountStatusActive('INACTIVE'), false);
    assert.equal(isAccountStatusActive('SUSPENDED'), false);
    assert.equal(isAccountStatusActive('BLOCKED'), false);

    // Fail-closed on non-strings and unknown strings
    for (const invalidRaw of [true, false, 0, 1, {}, [], 'unknown', 'pending', 'deleted']) {
      assert.equal(normalizeAccountStatus(invalidRaw), 'inactive');
      assert.equal(isAccountStatusActive(invalidRaw), false);
    }
  });
});
