/**
 * MinerX Profitability Domain Service
 * Pure mathematical, deterministic and verifiable calculation engine.
 * Complies with MinerX_CALCULADORA_RENTABILIDAD_Y_AUTOMATIZACION_VASTAI.md Section 5.3 & 11
 */

import type {
  ProfitabilityInput,
  ProfitabilityCalculationResult,
  ScenarioResult,
  HashrateUnit,
  GpuBenchmark
} from '../types/profitability';

/**
 * Normalizes any hashrate unit to TH/s
 */
export function normalizeToTHs(value: number, unit: HashrateUnit): number {
  if (value < 0 || !Number.isFinite(value)) return 0;
  switch (unit) {
    case 'TH/s':
      return value;
    case 'GH/s':
      return value / 1000;
    case 'MH/s':
      return value / 1000000;
    case 'H/s':
      return value / 1000000000000;
    default:
      return value;
  }
}

/**
 * Verifiable RTX 4090 PearlHash/PRL default benchmarks
 */
export const VERIFIED_BENCHMARKS: GpuBenchmark[] = [
  {
    id: 'rtx4090-kryptex-oct2026',
    gpuModel: 'RTX 4090',
    algorithm: 'PearlHash (PRL)',
    hashrateValue: 293,
    hashrateUnit: 'TH/s',
    hashrateTHs: 293,
    powerWatts: 450,
    sourceName: 'Kryptex Hardware Benchmark Table',
    sourceUrl: 'https://www.kryptex.com/en/hardware/nvidia-rtx-4090',
    observedAt: '2026-10-22T00:00:00Z',
    softwareVersion: 'Kryptex Pearl Miner v1.5+',
    configurationNotes: 'Stock clocks & power limit. Hashrate varies according to silicon lottery and driver thermal throttling.',
    confidence: 'HIGH',
    active: true
  },
  {
    id: 'rtx4090-sim-user',
    gpuModel: 'RTX 4090',
    algorithm: 'PearlHash (PRL)',
    hashrateValue: 310,
    hashrateUnit: 'TH/s',
    hashrateTHs: 310,
    powerWatts: 420,
    sourceName: 'User Simulation Scenario (prl_hr=310, cost=0.44)',
    sourceUrl: 'https://www.kryptex.com/es/mining-calculator',
    observedAt: '2026-10-22T00:00:00Z',
    configurationNotes: 'Overclocked memory / silicon lottery sample in high-end rig.',
    confidence: 'SIMULATED',
    active: true
  },
  {
    id: 'rtx5090-salad-lowest',
    gpuModel: 'RTX 5090',
    algorithm: 'PearlHash (PRL)',
    hashrateValue: 367,
    hashrateUnit: 'TH/s',
    hashrateTHs: 367,
    powerWatts: 500,
    sourceName: 'SaladCloud / MinerX Realized Telemetry Matrix',
    sourceUrl: 'Ciclos_de_minado_PERL.xlsx (Sheet GPUs)',
    observedAt: '2026-10-18T00:00:00Z',
    configurationNotes: 'Salad lowest priority average observed production.',
    confidence: 'MEDIUM',
    active: true
  },
  {
    id: 'rtx3090-kryptex',
    gpuModel: 'RTX 3090',
    algorithm: 'PearlHash (PRL)',
    hashrateValue: 110,
    hashrateUnit: 'TH/s',
    hashrateTHs: 110,
    powerWatts: 350,
    sourceName: 'Kryptex Hardware Benchmark Table',
    sourceUrl: 'https://www.kryptex.com/en/hardware',
    observedAt: '2026-10-22T00:00:00Z',
    configurationNotes: '24GB VRAM baseline.',
    confidence: 'HIGH',
    active: true
  }
];

/**
 * Calculates a single scenario outcome
 */
function calculateScenario(
  label: string,
  baseHashrate: number,
  rewardRate: number,
  hourlyCost: number,
  feeFraction: number,
  uptimeFraction: number,
  rejectedFraction: number
): ScenarioResult {
  const effectiveHashrate = Math.max(0, baseHashrate * uptimeFraction * (1 - rejectedFraction));
  const hourlyGross = effectiveHashrate * rewardRate;
  const netRevenue = hourlyGross * (1 - feeFraction);
  const hourlyNet = netRevenue - hourlyCost;
  const dailyNet = hourlyNet * 24;
  const marginPct = netRevenue > 0 ? (hourlyNet / netRevenue) * 100 : (hourlyCost === 0 ? 0 : -100);

  const netRewardMultiplier = rewardRate * (1 - feeFraction);
  const breakEvenHashrateTHs =
    netRewardMultiplier > 0 ? Number((hourlyCost / netRewardMultiplier).toFixed(2)) : Infinity;

  return {
    label,
    hashrateTHs: Number(effectiveHashrate.toFixed(2)),
    rewardUSDPerTHh: Number(rewardRate.toFixed(8)),
    hourlyGrossUSD: Number(hourlyGross.toFixed(4)),
    hourlyCostUSD: Number(hourlyCost.toFixed(4)),
    hourlyNetUSD: Number(hourlyNet.toFixed(4)),
    dailyNetUSD: Number(dailyNet.toFixed(4)),
    marginPct: Number(marginPct.toFixed(2)),
    breakEvenHashrateTHs
  };
}

/**
 * Core Pure Calculation Engine
 */
export function calculateProfitability(input: ProfitabilityInput): ProfitabilityCalculationResult {
  const gpuCount = Math.max(1, Math.floor(input.gpuCount || 1));
  const refHashrate = Math.max(0, input.referenceHashrateTHs || 0);
  const measuredHashrate =
    input.measuredHashrateTHs !== undefined && input.measuredHashrateTHs > 0
      ? input.measuredHashrateTHs
      : refHashrate;

  const performanceRatioPct =
    refHashrate > 0 ? Number(((measuredHashrate / refHashrate) * 100).toFixed(2)) : 100;

  // Fraction conversions with safety bounds [0, 1]
  const uptimeFraction = Math.min(1, Math.max(0, (input.expectedUptimePct ?? 100) / 100));
  const rejectedFraction = Math.min(1, Math.max(0, (input.rejectedSharePct ?? 0) / 100));
  const poolFeeFraction = Math.min(1, Math.max(0, (input.poolFeePct ?? 0) / 100));
  const minerFeeFraction = Math.min(1, Math.max(0, (input.minerFeePct ?? 0) / 100));
  const totalFeeFraction = Math.min(0.99, poolFeeFraction + minerFeeFraction);

  // Effective Hashrate (adjusted for uptime and independently rejected shares)
  const effectiveHashrateTHs = Number(
    (measuredHashrate * gpuCount * uptimeFraction * (1 - rejectedFraction)).toFixed(3)
  );

  // Revenue Calculations
  const rewardRate = Math.max(0, input.rewardUSDPerTHh || 0);
  const grossHourlyUSD = Number((effectiveHashrateTHs * rewardRate).toFixed(5));
  const netMiningRevenueHourlyUSD = grossHourlyUSD * (1 - totalFeeFraction);

  const billableHours = Math.min(24, Math.max(1, input.billableHoursPerDay || 24));
  const grossDailyUSD = Number((grossHourlyUSD * billableHours).toFixed(4));
  const grossWeeklyUSD = Number((grossDailyUSD * 7).toFixed(4));
  const grossMonthlyUSD = Number((grossDailyUSD * 30).toFixed(4));

  // Cost Calculations
  const totalComputeCostHourlyUSD = Number(((input.hourlyComputeCostUSD || 0) * gpuCount).toFixed(4));
  const totalStorageCostHourlyUSD = Number((input.hourlyStorageCostUSD || 0).toFixed(4));
  const totalOtherCostHourlyUSD = Number((input.hourlyOtherCostUSD || 0).toFixed(4));

  const totalHourlyCostUSD = Number(
    (totalComputeCostHourlyUSD + totalStorageCostHourlyUSD + totalOtherCostHourlyUSD).toFixed(4)
  );
  const totalDailyCostUSD = Number((totalHourlyCostUSD * billableHours).toFixed(4));
  const totalWeeklyCostUSD = Number((totalDailyCostUSD * 7).toFixed(4));
  const totalMonthlyCostUSD = Number((totalDailyCostUSD * 30).toFixed(4));

  // Net Profit
  const netHourlyProfitUSD = Number((netMiningRevenueHourlyUSD - totalHourlyCostUSD).toFixed(4));
  const netDailyProfitUSD = Number((netHourlyProfitUSD * billableHours).toFixed(4));
  const netWeeklyProfitUSD = Number((netDailyProfitUSD * 7).toFixed(4));
  const netMonthlyProfitUSD = Number((netDailyProfitUSD * 30).toFixed(4));

  const netProfitMarginPct =
    netMiningRevenueHourlyUSD > 0
      ? Number(((netHourlyProfitUSD / netMiningRevenueHourlyUSD) * 100).toFixed(2))
      : totalHourlyCostUSD === 0
      ? 0
      : -100;

  // Break-even Calculations
  const breakEvenHourlyRentUSD = Number(
    Math.max(
      0,
      (netMiningRevenueHourlyUSD - totalStorageCostHourlyUSD - totalOtherCostHourlyUSD) / gpuCount
    ).toFixed(4)
  );

  const netRewardMultiplier = rewardRate * (1 - totalFeeFraction);
  const breakEvenHashrateTHs =
    netRewardMultiplier > 0
      ? Number((totalHourlyCostUSD / netRewardMultiplier).toFixed(2))
      : Infinity;

  const minimumRequiredGrossHourlyUSD =
    1 - totalFeeFraction > 0
      ? Number((totalHourlyCostUSD / (1 - totalFeeFraction)).toFixed(4))
      : totalHourlyCostUSD;

  // Warmup Loss: compute + storage cost during warmup period with 0 revenue
  const warmupHours = Math.max(0, (input.warmupMinutes || 0) / 60);
  const potentialWarmupLossUSD = Number((warmupHours * totalHourlyCostUSD).toFixed(4));

  // Scenarios
  // Conservative: -15% hashrate, -15% reward rate, +10% costs
  const conservative = calculateScenario(
    'Conservador (-15% TH/s, -15% Reward, +10% Costos)',
    measuredHashrate * gpuCount * 0.85,
    rewardRate * 0.85,
    totalHourlyCostUSD * 1.10,
    totalFeeFraction,
    uptimeFraction * 0.95,
    rejectedFraction
  );

  // Base: nominal values
  const base = calculateScenario(
    'Caso Base (Nominal)',
    measuredHashrate * gpuCount,
    rewardRate,
    totalHourlyCostUSD,
    totalFeeFraction,
    uptimeFraction,
    rejectedFraction
  );

  // Optimistic: +10% hashrate, +10% reward, 100% uptime, 0 rejected
  const optimistic = calculateScenario(
    'Optimista (+10% TH/s, +10% Reward, 100% Uptime)',
    measuredHashrate * gpuCount * 1.10,
    rewardRate * 1.10,
    totalHourlyCostUSD,
    totalFeeFraction,
    1.0,
    0
  );

  return {
    referenceHashrateTHs: refHashrate,
    measuredHashrateTHs: measuredHashrate,
    performanceRatioPct,
    effectiveHashrateTHs,
    grossHourlyUSD,
    grossDailyUSD,
    grossWeeklyUSD,
    grossMonthlyUSD,
    totalComputeCostHourlyUSD,
    totalStorageCostHourlyUSD,
    totalOtherCostHourlyUSD,
    totalHourlyCostUSD,
    totalDailyCostUSD,
    totalWeeklyCostUSD,
    totalMonthlyCostUSD,
    netHourlyProfitUSD,
    netDailyProfitUSD,
    netWeeklyProfitUSD,
    netMonthlyProfitUSD,
    netProfitMarginPct,
    breakEvenHourlyRentUSD,
    breakEvenHashrateTHs,
    minimumRequiredGrossHourlyUSD,
    potentialWarmupLossUSD,
    scenarios: {
      conservative,
      base,
      optimistic
    },
    trustMetadata: {
      sourceType: input.sourceType,
      timestamp: new Date().toISOString(),
      confidence:
        input.sourceType === 'INSTANCE_MEASURED'
          ? 'HIGH'
          : input.sourceType === 'EXTERNAL_BENCHMARK'
          ? 'MEDIUM'
          : input.sourceType === 'SIMULATED'
          ? 'SIMULATED'
          : 'LOW',
      notes:
        input.sourceType === 'SIMULATED'
          ? 'Resultado puramente hipotético; no garantiza rendimiento ni precio real.'
          : 'Cálculo formulado con metadatos de evidencia trazables.'
    }
  };
}
