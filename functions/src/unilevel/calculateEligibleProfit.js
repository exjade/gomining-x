'use strict';

const {
  INTERNAL_SCALE,
  parseUsdtToInternal,
  parseRateToInternal,
  formatInternalToUsdt6
} = require('../shared/money');

const BASE_EFFICIENCY_W_PER_TH = 15;
const BASE_MAINTENANCE_RATE_INTERNAL = 10_000_000n;
const WATTS_PER_KW = 1000n;
const HOURS_PER_DAY = 24n;
const INTERNAL_SCALE_SQ = INTERNAL_SCALE * INTERNAL_SCALE;

const MEMBERSHIP_DISCOUNT_CAPS = Object.freeze({
  explorer: Object.freeze({
    electricityMaxInternal: 5_000_000n,
    maintenanceMaxInternal: 0n
  }),
  starter: Object.freeze({
    electricityMaxInternal: 10_000_000n,
    maintenanceMaxInternal: 5_000_000n
  }),
  pro: Object.freeze({
    electricityMaxInternal: 20_000_000n,
    maintenanceMaxInternal: 10_000_000n
  })
});

function calculateEligibleProfit(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('calculateEligibleProfit requires a non-array object');
  }

  const {
    grossRevenueUsdt,
    powerTh,
    effectiveEfficiencyWPerTh = BASE_EFFICIENCY_W_PER_TH,
    baseElectricityUsdPerKwh,
    membershipTier = 'explorer',
    electricityDiscountPct = 0,
    maintenanceDiscountPct = 0
  } = input;
  if (typeof membershipTier !== 'string' || !Object.hasOwn(MEMBERSHIP_DISCOUNT_CAPS, membershipTier)) {
    throw new RangeError(`Invalid membershipTier: ${membershipTier}`);
  }

  const caps = MEMBERSHIP_DISCOUNT_CAPS[membershipTier];
  const grossRevenueInternal = parseUsdtToInternal(grossRevenueUsdt);
  const powerThInternal = parseUsdtToInternal(powerTh);
  const efficiencyInternal = parseUsdtToInternal(effectiveEfficiencyWPerTh);
  const baseElectricityInternal = parseUsdtToInternal(baseElectricityUsdPerKwh);

  const requestedElectricityDiscount = parseRateToInternal(electricityDiscountPct);
  const requestedMaintenanceDiscount = parseRateToInternal(maintenanceDiscountPct);

  const effectiveElectricityDiscountInternal =
    requestedElectricityDiscount > caps.electricityMaxInternal
      ? caps.electricityMaxInternal
      : requestedElectricityDiscount;
  const effectiveMaintenanceDiscountInternal =
    requestedMaintenanceDiscount > caps.maintenanceMaxInternal
      ? caps.maintenanceMaxInternal
      : requestedMaintenanceDiscount;

  const electricityKwhInternal =
    (powerThInternal * efficiencyInternal * HOURS_PER_DAY) / (WATTS_PER_KW * INTERNAL_SCALE);

  const electricityCostInternal =
    (electricityKwhInternal * baseElectricityInternal * (INTERNAL_SCALE - effectiveElectricityDiscountInternal)) /
    INTERNAL_SCALE_SQ;

  const afterElectricityInternal =
    grossRevenueInternal > electricityCostInternal ? grossRevenueInternal - electricityCostInternal : 0n;

  const maintenanceCostInternal =
    (afterElectricityInternal *
      BASE_MAINTENANCE_RATE_INTERNAL *
      (INTERNAL_SCALE - effectiveMaintenanceDiscountInternal)) /
    INTERNAL_SCALE_SQ;

  const eligibleProfitInternal =
    afterElectricityInternal > maintenanceCostInternal ? afterElectricityInternal - maintenanceCostInternal : 0n;

  return {
    membershipTier,
    grossRevenueInternal,
    electricityKwhInternal,
    electricityCostInternal,
    afterElectricityInternal,
    maintenanceCostInternal,
    eligibleProfitInternal,
    effectiveElectricityDiscountInternal,
    effectiveMaintenanceDiscountInternal,
    electricityCostUsdt6: formatInternalToUsdt6(electricityCostInternal),
    afterElectricityUsdt6: formatInternalToUsdt6(afterElectricityInternal),
    maintenanceCostUsdt6: formatInternalToUsdt6(maintenanceCostInternal),
    eligibleProfitUsdt6: formatInternalToUsdt6(eligibleProfitInternal)
  };
}

module.exports = Object.freeze({
  BASE_EFFICIENCY_W_PER_TH,
  BASE_MAINTENANCE_RATE_INTERNAL,
  MEMBERSHIP_DISCOUNT_CAPS,
  calculateEligibleProfit
});
