import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeToTHs,
  calculateProfitability,
  VERIFIED_BENCHMARKS
} from '../../src/services/profitabilityService.js';
import type { ProfitabilityInput } from '../../src/types/profitability.js';

describe('Profitability Domain Service Tests', () => {
  it('correctly converts hashrate units to TH/s', () => {
    assert.equal(normalizeToTHs(1, 'TH/s'), 1);
    assert.equal(normalizeToTHs(1000, 'GH/s'), 1);
    assert.equal(normalizeToTHs(1000000, 'MH/s'), 1);
    assert.equal(normalizeToTHs(1000000000000, 'H/s'), 1);
    assert.equal(normalizeToTHs(-5, 'GH/s'), 0);
  });

  it('includes verified benchmarks with proper trust metadata and source URLs', () => {
    const rtx4090 = VERIFIED_BENCHMARKS.find((b) => b.id === 'rtx4090-kryptex-oct2026');
    assert.ok(rtx4090);
    assert.equal(rtx4090.hashrateTHs, 293);
    assert.equal(rtx4090.confidence, 'HIGH');
    assert.ok(rtx4090.sourceUrl.includes('kryptex.com'));

    const rtx4090Sim = VERIFIED_BENCHMARKS.find((b) => b.id === 'rtx4090-sim-user');
    assert.ok(rtx4090Sim);
    assert.equal(rtx4090Sim.hashrateTHs, 310);
    assert.equal(rtx4090Sim.confidence, 'SIMULATED');
  });

  it('calculates gross revenue, costs, net profit and margin accurately for a single GPU', () => {
    const input: ProfitabilityInput = {
      provider: 'vastai',
      gpuModel: 'RTX 4090',
      gpuCount: 1,
      algorithm: 'PearlHash (PRL)',
      referenceHashrateTHs: 293,
      measuredHashrateTHs: 293,
      hourlyComputeCostUSD: 0.30,
      hourlyStorageCostUSD: 0.02,
      hourlyOtherCostUSD: 0.00,
      billableHoursPerDay: 24,
      expectedUptimePct: 100,
      prlPriceUSD: 0.40,
      rewardUSDPerTHh: 0.0015,
      poolFeePct: 2,
      minerFeePct: 1,
      rejectedSharePct: 0,
      warmupMinutes: 10,
      safetyMarginPct: 15,
      sourceType: 'INSTANCE_MEASURED'
    };

    const res = calculateProfitability(input);

    // Gross hourly = 293 * 0.0015 = 0.4395
    assert.equal(res.grossHourlyUSD, 0.4395);
    // Total fees = 3%, so net mining revenue = 0.4395 * (1 - 0.03) = 0.426315
    // Total hourly cost = 0.30 + 0.02 = 0.32
    assert.equal(res.totalHourlyCostUSD, 0.32);
    // Net profit = 0.426315 - 0.32 = 0.106315 -> rounded to 4 decimals = 0.1063
    assert.equal(res.netHourlyProfitUSD, 0.1063);
    assert.ok(res.netProfitMarginPct > 24 && res.netProfitMarginPct < 26);
    assert.ok(res.breakEvenHashrateTHs > 0);
  });

  it('includes storage cost once per instance and compute cost per GPU count', () => {
    const input: ProfitabilityInput = {
      provider: 'vastai',
      gpuModel: 'RTX 4090',
      gpuCount: 4,
      algorithm: 'PearlHash (PRL)',
      referenceHashrateTHs: 300,
      measuredHashrateTHs: 300,
      hourlyComputeCostUSD: 0.25, // 4 * 0.25 = 1.00
      hourlyStorageCostUSD: 0.04, // 0.04 total for machine
      hourlyOtherCostUSD: 0.01,
      billableHoursPerDay: 24,
      expectedUptimePct: 100,
      prlPriceUSD: 0.40,
      rewardUSDPerTHh: 0.0012,
      poolFeePct: 0,
      minerFeePct: 0,
      rejectedSharePct: 0,
      warmupMinutes: 0,
      safetyMarginPct: 0,
      sourceType: 'OFFER_ESTIMATE'
    };

    const res = calculateProfitability(input);
    assert.equal(res.totalComputeCostHourlyUSD, 1.00);
    assert.equal(res.totalStorageCostHourlyUSD, 0.04);
    assert.equal(res.totalOtherCostHourlyUSD, 0.01);
    assert.equal(res.totalHourlyCostUSD, 1.05);
    // Effective hashrate = 4 * 300 = 1200 TH/s
    assert.equal(res.effectiveHashrateTHs, 1200);
  });

  it('does not apply double penalty when calculating effective hashrate with uptime and rejected shares', () => {
    const input: ProfitabilityInput = {
      provider: 'generic',
      gpuModel: 'RTX 4090',
      gpuCount: 1,
      algorithm: 'PearlHash (PRL)',
      referenceHashrateTHs: 300,
      measuredHashrateTHs: 300,
      hourlyComputeCostUSD: 0.20,
      hourlyStorageCostUSD: 0,
      hourlyOtherCostUSD: 0,
      billableHoursPerDay: 24,
      expectedUptimePct: 90, // 0.90
      prlPriceUSD: 0.40,
      rewardUSDPerTHh: 0.001,
      poolFeePct: 0,
      minerFeePct: 0,
      rejectedSharePct: 10, // 0.10 independent loss
      warmupMinutes: 0,
      safetyMarginPct: 0,
      sourceType: 'SIMULATED'
    };

    const res = calculateProfitability(input);
    // Effective hashrate = 300 * 0.90 * (1 - 0.10) = 300 * 0.9 * 0.9 = 243
    assert.equal(res.effectiveHashrateTHs, 243);
  });

  it('handles zero or missing reward rate gracefully without throwing and marks break-even as Infinity', () => {
    const input: ProfitabilityInput = {
      provider: 'salad',
      gpuModel: 'RTX 4090',
      gpuCount: 1,
      algorithm: 'PearlHash (PRL)',
      referenceHashrateTHs: 300,
      hourlyComputeCostUSD: 0.16,
      hourlyStorageCostUSD: 0,
      hourlyOtherCostUSD: 0,
      billableHoursPerDay: 24,
      expectedUptimePct: 100,
      prlPriceUSD: 0.40,
      rewardUSDPerTHh: 0,
      poolFeePct: 0,
      minerFeePct: 0,
      rejectedSharePct: 0,
      warmupMinutes: 15,
      safetyMarginPct: 10,
      sourceType: 'USER_ASSUMPTION'
    };

    const res = calculateProfitability(input);
    assert.equal(res.grossHourlyUSD, 0);
    assert.equal(res.netHourlyProfitUSD, -0.16);
    assert.equal(res.breakEvenHashrateTHs, Infinity);
    assert.equal(res.netProfitMarginPct, -100);
    assert.equal(res.potentialWarmupLossUSD, 0.04); // (15 / 60) * 0.16 = 0.04
  });

  it('generates three stress scenarios (conservative, base, optimistic)', () => {
    const input: ProfitabilityInput = {
      provider: 'vastai',
      gpuModel: 'RTX 4090',
      gpuCount: 1,
      algorithm: 'PearlHash (PRL)',
      referenceHashrateTHs: 293,
      measuredHashrateTHs: 293,
      hourlyComputeCostUSD: 0.35,
      hourlyStorageCostUSD: 0.01,
      hourlyOtherCostUSD: 0,
      billableHoursPerDay: 24,
      expectedUptimePct: 98,
      prlPriceUSD: 0.40,
      rewardUSDPerTHh: 0.0014,
      poolFeePct: 2,
      minerFeePct: 1,
      rejectedSharePct: 1,
      warmupMinutes: 5,
      safetyMarginPct: 10,
      sourceType: 'EXTERNAL_BENCHMARK'
    };

    const res = calculateProfitability(input);
    assert.ok(res.scenarios.conservative);
    assert.ok(res.scenarios.base);
    assert.ok(res.scenarios.optimistic);

    // Conservative should have lower hourly net than Base
    assert.ok(res.scenarios.conservative.hourlyNetUSD < res.scenarios.base.hourlyNetUSD);
    // Optimistic should have higher hourly net than Base
    assert.ok(res.scenarios.optimistic.hourlyNetUSD > res.scenarios.base.hourlyNetUSD);
  });
});
