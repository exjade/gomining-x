export const BENCHMARK_TH = 120;
export const BENCHMARK_USD_PER_DAY = 2.3;
export const DAILY_USD_PER_TH = BENCHMARK_USD_PER_DAY / BENCHMARK_TH;
export const PEARL_REFERENCE_PRICE_USD = 0.1;
export const DAILY_PEARL_PER_TH = DAILY_USD_PER_TH / PEARL_REFERENCE_PRICE_USD;

export interface LandingEarningsEstimate {
  powerTh: number;
  usdDay: number;
  usdMonth: number;
  usdYear: number;
  pearlDay: number;
  pearlMonth: number;
  pearlYear: number;
}

/**
 * Pure illustrative yield estimator for the public landing calculator.
 * Always returns finite non-negative numbers for continuous slider movement.
 */
export function calculateLandingEarnings(powerTh: number): LandingEarningsEstimate {
  const safeTh = Number.isFinite(powerTh) && powerTh > 0 ? powerTh : 0;
  const usdDay = safeTh * DAILY_USD_PER_TH;
  const pearlDay = safeTh * DAILY_PEARL_PER_TH;

  return {
    powerTh: safeTh,
    usdDay,
    usdMonth: usdDay * 30,
    usdYear: usdDay * 365,
    pearlDay,
    pearlMonth: pearlDay * 30,
    pearlYear: pearlDay * 365,
  };
}
