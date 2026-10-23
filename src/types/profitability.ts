/**
 * MinerX Profitability Domain Types & Trust Model
 * Complies with MinerX_CALCULADORA_RENTABILIDAD_Y_AUTOMATIZACION_VASTAI.md Section 4 & 11
 */

export type DataTrustSource =
  | 'EXTERNAL_BENCHMARK'
  | 'OFFER_ESTIMATE'
  | 'INSTANCE_MEASURED'
  | 'POOL_OBSERVED'
  | 'FINANCIAL_REALIZED'
  | 'USER_ASSUMPTION'
  | 'SIMULATED';

export type HashrateUnit = 'TH/s' | 'GH/s' | 'MH/s' | 'H/s';

export interface GpuBenchmark {
  id: string;
  gpuModel: string;
  algorithm: string;
  hashrateValue: number;
  hashrateUnit: HashrateUnit;
  hashrateTHs: number; // Normalized to TH/s
  powerWatts?: number;
  sourceName: string;
  sourceUrl: string;
  observedAt: string;
  softwareVersion?: string;
  configurationNotes?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'SIMULATED';
  active: boolean;
}

export interface ScenarioResult {
  label: string;
  hashrateTHs: number;
  rewardUSDPerTHh: number;
  hourlyGrossUSD: number;
  hourlyCostUSD: number;
  hourlyNetUSD: number;
  dailyNetUSD: number;
  marginPct: number;
  breakEvenHashrateTHs: number;
}

export interface ProfitabilityInput {
  provider: 'vastai' | 'salad' | 'generic';
  gpuModel: string;
  gpuCount: number;
  algorithm: string;
  referenceHashrateTHs: number;
  measuredHashrateTHs?: number;
  hourlyComputeCostUSD: number;
  hourlyStorageCostUSD: number;
  hourlyOtherCostUSD: number;
  billableHoursPerDay: number;
  expectedUptimePct: number; // 0-100
  prlPriceUSD: number;
  rewardUSDPerTHh: number; // USD per TH·h
  poolFeePct: number; // 0-100
  minerFeePct: number; // 0-100
  rejectedSharePct: number; // 0-100
  warmupMinutes: number;
  safetyMarginPct: number; // 0-100
  sourceType: DataTrustSource;
}

export interface ProfitabilityCalculationResult {
  referenceHashrateTHs: number;
  measuredHashrateTHs: number;
  performanceRatioPct: number;
  effectiveHashrateTHs: number;

  grossHourlyUSD: number;
  grossDailyUSD: number;
  grossWeeklyUSD: number;
  grossMonthlyUSD: number;

  totalComputeCostHourlyUSD: number;
  totalStorageCostHourlyUSD: number;
  totalOtherCostHourlyUSD: number;
  totalHourlyCostUSD: number;
  totalDailyCostUSD: number;
  totalWeeklyCostUSD: number;
  totalMonthlyCostUSD: number;

  netHourlyProfitUSD: number;
  netDailyProfitUSD: number;
  netWeeklyProfitUSD: number;
  netMonthlyProfitUSD: number;
  netProfitMarginPct: number;

  breakEvenHourlyRentUSD: number;
  breakEvenHashrateTHs: number;
  minimumRequiredGrossHourlyUSD: number;
  potentialWarmupLossUSD: number;

  scenarios: {
    conservative: ScenarioResult;
    base: ScenarioResult;
    optimistic: ScenarioResult;
  };

  trustMetadata: {
    sourceType: DataTrustSource;
    timestamp: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'SIMULATED';
    notes: string;
  };
}

export interface VastOfferNormalized {
  id: string; // ask id
  machineId?: number;
  hostId?: number;
  gpuModel: string;
  gpuCount: number;
  gpuMemoryGB: number;
  hourlyComputeCostUSD: number;
  hourlyStorageCostUSD: number;
  totalHourlyCostUSD: number;
  cpuCores: number;
  cpuRAMGB: number;
  diskSpaceGB: number;
  inetDownMbps: number;
  inetUpMbps: number;
  reliabilityScore: number; // 0-1
  geolocation: string;
  datacenter: boolean;
  rentable: boolean;
  rawOffer?: any;
}
