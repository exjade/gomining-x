'use strict';

const PLAN_VERSION_V1 = 'UNILEVEL_V1';
const MAX_UNILEVEL_DEPTH = 20;
const UNILEVEL_POOL_RATE_INTERNAL = 20_000_000n;
const BPS_TO_INTERNAL_FACTOR = 10_000n;

const UNILEVEL_V1_RATES = Object.freeze(
  Array.from({ length: MAX_UNILEVEL_DEPTH }, (_, index) => {
    const level = index + 1;
    const bps = 195 - index * 10;
    return Object.freeze({
      level,
      bps,
      rateInternal: BigInt(bps) * BPS_TO_INTERNAL_FACTOR,
      rateString: `0.${String(bps).padStart(4, '0')}`
    });
  })
);

function validateRatePlan(rates, expectedTotalInternal = UNILEVEL_POOL_RATE_INTERNAL) {
  if (!Array.isArray(rates) || rates.length !== MAX_UNILEVEL_DEPTH) {
    throw new Error(`Unilevel rate plan must define exactly ${MAX_UNILEVEL_DEPTH} levels`);
  }
  if (typeof expectedTotalInternal !== 'bigint' || expectedTotalInternal <= 0n) {
    throw new Error('expectedTotalInternal must be a positive BigInt');
  }

  let sum = 0n;
  for (let i = 0; i < rates.length; i += 1) {
    const entry = rates[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || entry.level !== i + 1) {
      throw new Error(`Invalid level at index ${i}: expected ${i + 1}`);
    }
    if (typeof entry.rateInternal !== 'bigint' || entry.rateInternal <= 0n) {
      throw new Error(`Invalid rateInternal at level index ${i}`);
    }
    sum += entry.rateInternal;
  }

  if (sum !== expectedTotalInternal) {
    throw new Error(`Unilevel rate sum mismatch: expected ${expectedTotalInternal}, got ${sum}`);
  }

  return sum;
}

// Startup invariant check: fail fast if UNILEVEL_V1 schedule is ever altered.
validateRatePlan(UNILEVEL_V1_RATES, UNILEVEL_POOL_RATE_INTERNAL);

const RATE_PLANS = new Map([
  [
    PLAN_VERSION_V1,
    Object.freeze({
      planVersion: PLAN_VERSION_V1,
      maxDepth: MAX_UNILEVEL_DEPTH,
      totalPoolRateInternal: UNILEVEL_POOL_RATE_INTERNAL,
      rates: UNILEVEL_V1_RATES
    })
  ]
]);

function getRatePlan(planVersion = PLAN_VERSION_V1) {
  const plan = RATE_PLANS.get(planVersion);
  if (!plan) {
    throw new RangeError(`Unknown unilevel rate plan: ${planVersion}`);
  }
  return plan;
}

module.exports = Object.freeze({
  PLAN_VERSION_V1,
  MAX_UNILEVEL_DEPTH,
  UNILEVEL_POOL_RATE_INTERNAL,
  UNILEVEL_V1_RATES,
  validateRatePlan,
  getRatePlan
});
