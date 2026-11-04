import type {
  SaladAccountConfig,
  KryptexConfig,
  KryptexAccountConfig,
  VastAccountConfig,
  AppSettings,
  MergedGPUWorker,
  FleetSummary,
  AlertEvent,
  HashrateHistoryPoint,
  KryptexBalanceRaw,
  KryptexPoolInfo
} from '../types/minerx';
import { BASELINE_USD_PER_THS_HOUR } from './gpuBenchmarks';

export const INITIAL_SALAD_ACCOUNTS: SaladAccountConfig[] = [];

export const INITIAL_VAST_CONFIG: VastAccountConfig = {
  apiKey: '',
  enabled: false,
  balanceUSD: 0,
  status: 'untested',
};

export const INITIAL_KRYPTEX_CONFIG: KryptexConfig = {
  walletAddress: '',
  coin: 'prl',
  poolUrl: 'stratum+tcp://prl.kryptex.network:7048',
  status: 'untested',
};

export const INITIAL_KRYPTEX_ACCOUNTS: KryptexAccountConfig[] = [];

export const INITIAL_APP_SETTINGS: AppSettings = {
  refreshIntervalSeconds: 45,
  underperformingThresholdPct: 80,
  maxShareInactivityMinutes: 1,
  enableSoundAlerts: false,
  discordWebhookUrl: '',
  telegramBotToken: '8716259907:AAHiD3lHBasRoSr3kHBHPYoSUx0wzXX8cvo',
  telegramChatId: '1750489780',
};

export const DEMO_SALAD_ACCOUNTS: SaladAccountConfig[] = [
  {
    id: 'salad-acc-1',
    accountName: 'Salad Alpha Prod (US-East)',
    organizationName: 'mining-syndicate-01',
    projectName: 'prl-cluster-east',
    apiKey: 'salad_live_sk_demo_01',
    enabled: true,
    lastConnected: 'Conectado',
    status: 'connected',
  }
];

export const INITIAL_WORKERS: MergedGPUWorker[] = [];

export const DEMO_WORKERS: MergedGPUWorker[] = [
  {
    id: 'inst-5090-01',
    workerName: 'salad-east-5090-a',
    machineId: 'mach_89fa12b',
    accountId: 'salad-acc-1',
    accountName: 'Salad Alpha Prod (US-East)',
    containerGroupName: 'prl-group-5090',
    gpuModel: 'RTX 5090',
    vramGB: 32,
    saladPriority: 'Lowest Priority',
    saladStatus: 'running',
    isMining: true,
    minutesSinceLastShare: 0.4,
    currentHashrateTHs: 371.4,
    expectedBenchmarkTHs: 367,
    performanceRatioPct: 101.2,
    hourlySaladCost: 0.250,
    dailySaladCost: 6.00,
    hourlyGrossRevenue: 371.4 * BASELINE_USD_PER_THS_HOUR,
    dailyGrossRevenue: 371.4 * BASELINE_USD_PER_THS_HOUR * 24,
    hourlyNetProfit: (371.4 * BASELINE_USD_PER_THS_HOUR) - 0.250,
    dailyNetProfit: ((371.4 * BASELINE_USD_PER_THS_HOUR) - 0.250) * 24,
    profitMarginPct: (((371.4 * BASELINE_USD_PER_THS_HOUR) - 0.250) / (371.4 * BASELINE_USD_PER_THS_HOUR)) * 100,
    efficiencyTHsPerDollar: 371.4 / 0.250,
    validShares: 14820,
    connectedAt: 'hace 18h 42m',
    lastShareTimestamp: Math.floor(Date.now() / 1000) - 24,
    hasAlert: false,
    recommendation: 'OPTIMAL'
  },
  {
    id: 'inst-4090-01',
    workerName: 'salad-east-4090-a',
    machineId: 'mach_45dd98a',
    accountId: 'salad-acc-1',
    accountName: 'Salad Alpha Prod (US-East)',
    containerGroupName: 'prl-group-4090',
    gpuModel: 'RTX 4090',
    vramGB: 24,
    saladPriority: 'Lowest Priority',
    saladStatus: 'running',
    isMining: true,
    minutesSinceLastShare: 0.8,
    currentHashrateTHs: 304.8,
    expectedBenchmarkTHs: 300,
    performanceRatioPct: 101.6,
    hourlySaladCost: 0.160,
    dailySaladCost: 3.84,
    hourlyGrossRevenue: 304.8 * BASELINE_USD_PER_THS_HOUR,
    dailyGrossRevenue: 304.8 * BASELINE_USD_PER_THS_HOUR * 24,
    hourlyNetProfit: (304.8 * BASELINE_USD_PER_THS_HOUR) - 0.160,
    dailyNetProfit: ((304.8 * BASELINE_USD_PER_THS_HOUR) - 0.160) * 24,
    profitMarginPct: (((304.8 * BASELINE_USD_PER_THS_HOUR) - 0.160) / (304.8 * BASELINE_USD_PER_THS_HOUR)) * 100,
    efficiencyTHsPerDollar: 304.8 / 0.160,
    validShares: 12150,
    connectedAt: 'hace 14h 10m',
    lastShareTimestamp: Math.floor(Date.now() / 1000) - 48,
    hasAlert: false,
    recommendation: 'OPTIMAL'
  },
  {
    id: 'inst-4090-02',
    workerName: 'salad-east-4090-b',
    machineId: 'mach_66190ec',
    accountId: 'salad-acc-1',
    accountName: 'Salad Alpha Prod (US-East)',
    containerGroupName: 'prl-group-4090',
    gpuModel: 'RTX 4090',
    vramGB: 24,
    saladPriority: 'Lowest Priority',
    saladStatus: 'running',
    isMining: true,
    minutesSinceLastShare: 1.2,
    currentHashrateTHs: 298.2,
    expectedBenchmarkTHs: 300,
    performanceRatioPct: 99.4,
    hourlySaladCost: 0.160,
    dailySaladCost: 3.84,
    hourlyGrossRevenue: 298.2 * BASELINE_USD_PER_THS_HOUR,
    dailyGrossRevenue: 298.2 * BASELINE_USD_PER_THS_HOUR * 24,
    hourlyNetProfit: (298.2 * BASELINE_USD_PER_THS_HOUR) - 0.160,
    dailyNetProfit: ((298.2 * BASELINE_USD_PER_THS_HOUR) - 0.160) * 24,
    profitMarginPct: (((298.2 * BASELINE_USD_PER_THS_HOUR) - 0.160) / (298.2 * BASELINE_USD_PER_THS_HOUR)) * 100,
    efficiencyTHsPerDollar: 298.2 / 0.160,
    validShares: 11980,
    connectedAt: 'hace 11h 25m',
    lastShareTimestamp: Math.floor(Date.now() / 1000) - 72,
    hasAlert: false,
    recommendation: 'OPTIMAL'
  },
  {
    // UNDERPERFORMING SILICON LOTTERY NODE EXAMPLE (Triggers Reallocation Alert!)
    id: 'inst-4090-03-slow',
    workerName: 'salad-east-4090-c',
    machineId: 'mach_910bba4',
    accountId: 'salad-acc-1',
    accountName: 'Salad Alpha Prod (US-East)',
    containerGroupName: 'prl-group-4090',
    gpuModel: 'RTX 4090',
    vramGB: 24,
    saladPriority: 'Lowest Priority',
    saladStatus: 'running',
    isMining: true,
    minutesSinceLastShare: 2.1,
    currentHashrateTHs: 185.0, // Only 61.6% of 300 TH/s benchmark!
    expectedBenchmarkTHs: 300,
    performanceRatioPct: 61.7,
    hourlySaladCost: 0.160,
    dailySaladCost: 3.84,
    hourlyGrossRevenue: 185.0 * BASELINE_USD_PER_THS_HOUR,
    dailyGrossRevenue: 185.0 * BASELINE_USD_PER_THS_HOUR * 24,
    hourlyNetProfit: (185.0 * BASELINE_USD_PER_THS_HOUR) - 0.160,
    dailyNetProfit: ((185.0 * BASELINE_USD_PER_THS_HOUR) - 0.160) * 24,
    profitMarginPct: (((185.0 * BASELINE_USD_PER_THS_HOUR) - 0.160) / (185.0 * BASELINE_USD_PER_THS_HOUR)) * 100,
    efficiencyTHsPerDollar: 185.0 / 0.160,
    validShares: 6810,
    connectedAt: 'hace 5h 30m',
    lastShareTimestamp: Math.floor(Date.now() / 1000) - 126,
    hasAlert: true,
    alertType: 'UNDERPERFORMING',
    alertMessage: 'Potencia deficiente: 185 TH/s (61.7% del benchmark de 300 TH/s). Pierde ~$3.20/día en comparación con un nodo óptimo.',
    recommendation: 'REALLOCATE_RECOMMENDED'
  },
  {
    id: 'inst-5080-01',
    workerName: 'salad-bravo-5080-a',
    machineId: 'mach_33458ff',
    accountId: 'salad-acc-2',
    accountName: 'Salad Bravo High-VRAM (EU-Central)',
    containerGroupName: 'prl-group-5080',
    gpuModel: 'RTX 5080',
    vramGB: 16,
    saladPriority: 'Lowest Priority',
    saladStatus: 'running',
    isMining: true,
    minutesSinceLastShare: 0.9,
    currentHashrateTHs: 206.5,
    expectedBenchmarkTHs: 205,
    performanceRatioPct: 100.7,
    hourlySaladCost: 0.150,
    dailySaladCost: 3.60,
    hourlyGrossRevenue: 206.5 * BASELINE_USD_PER_THS_HOUR,
    dailyGrossRevenue: 206.5 * BASELINE_USD_PER_THS_HOUR * 24,
    hourlyNetProfit: (206.5 * BASELINE_USD_PER_THS_HOUR) - 0.150,
    dailyNetProfit: ((206.5 * BASELINE_USD_PER_THS_HOUR) - 0.150) * 24,
    profitMarginPct: (((206.5 * BASELINE_USD_PER_THS_HOUR) - 0.150) / (206.5 * BASELINE_USD_PER_THS_HOUR)) * 100,
    efficiencyTHsPerDollar: 206.5 / 0.150,
    validShares: 8740,
    connectedAt: 'hace 9h 15m',
    lastShareTimestamp: Math.floor(Date.now() / 1000) - 54,
    hasAlert: false,
    recommendation: 'OPTIMAL'
  },
  {
    id: 'inst-5070ti-01',
    workerName: 'salad-bravo-5070ti-a',
    machineId: 'mach_11029ba',
    accountId: 'salad-acc-2',
    accountName: 'Salad Bravo High-VRAM (EU-Central)',
    containerGroupName: 'prl-group-5070ti',
    gpuModel: 'RTX 5070 Ti',
    vramGB: 16,
    saladPriority: 'Lowest Priority',
    saladStatus: 'running',
    isMining: true,
    minutesSinceLastShare: 1.1,
    currentHashrateTHs: 166.2,
    expectedBenchmarkTHs: 165,
    performanceRatioPct: 100.7,
    hourlySaladCost: 0.100,
    dailySaladCost: 2.40,
    hourlyGrossRevenue: 166.2 * BASELINE_USD_PER_THS_HOUR,
    dailyGrossRevenue: 166.2 * BASELINE_USD_PER_THS_HOUR * 24,
    hourlyNetProfit: (166.2 * BASELINE_USD_PER_THS_HOUR) - 0.100,
    dailyNetProfit: ((166.2 * BASELINE_USD_PER_THS_HOUR) - 0.100) * 24,
    profitMarginPct: (((166.2 * BASELINE_USD_PER_THS_HOUR) - 0.100) / (166.2 * BASELINE_USD_PER_THS_HOUR)) * 100,
    efficiencyTHsPerDollar: 166.2 / 0.100,
    validShares: 7120,
    connectedAt: 'hace 7h 50m',
    lastShareTimestamp: Math.floor(Date.now() / 1000) - 66,
    hasAlert: false,
    recommendation: 'OPTIMAL'
  },
  {
    // DISCONNECTED / DEAD CONTAINER EXAMPLE (Triggers Offline Alert!)
    id: 'inst-3090-01-offline',
    workerName: 'salad-bravo-3090-a',
    machineId: 'mach_558712c',
    accountId: 'salad-acc-2',
    accountName: 'Salad Bravo High-VRAM (EU-Central)',
    containerGroupName: 'prl-group-3090',
    gpuModel: 'RTX 3090',
    vramGB: 24,
    saladPriority: 'Lowest Priority',
    saladStatus: 'stopped',
    isMining: false,
    minutesSinceLastShare: 42.0,
    currentHashrateTHs: 0,
    expectedBenchmarkTHs: 110,
    performanceRatioPct: 0,
    hourlySaladCost: 0.090,
    dailySaladCost: 2.16,
    hourlyGrossRevenue: 0,
    dailyGrossRevenue: 0,
    hourlyNetProfit: -0.090,
    dailyNetProfit: -2.16,
    profitMarginPct: -100,
    efficiencyTHsPerDollar: 0,
    validShares: 3910,
    connectedAt: 'Desconectado hace 42m',
    lastShareTimestamp: Math.floor(Date.now() / 1000) - 2520,
    hasAlert: true,
    alertType: 'OFFLINE_NOT_MINING',
    alertMessage: 'GPU Desconectada: El contenedor en Salad reporta detenido y no envía shares a Kryptex hace 42 minutos.',
    recommendation: 'RESTART_CONTAINER'
  }
];

export const INITIAL_ALERTS: AlertEvent[] = [];

export const DEMO_ALERTS: AlertEvent[] = [
  {
    id: 'alert-01',
    timestamp: 'Hace 6 minutos',
    type: 'UNDERPERFORMING',
    workerName: 'salad-east-4090-c',
    gpuModel: 'RTX 4090',
    message: 'Potencia deficiente detectada: 185.0 TH/s vs 300 TH/s de benchmark esperado (61.7%). Se sugiere reallocate para renovar nodo.',
    severity: 'warning',
    instanceId: 'inst-4090-03-slow',
    containerGroupName: 'prl-group-4090',
    accountId: 'salad-acc-1'
  },
  {
    id: 'alert-02',
    timestamp: 'Hace 42 minutos',
    type: 'DISCONNECT',
    workerName: 'salad-bravo-3090-a',
    gpuModel: 'RTX 3090',
    message: 'GPU Desconectada: La instancia se detuvo o perdió conexión con el stratum de Kryptex.',
    severity: 'critical',
    instanceId: 'inst-3090-01-offline',
    containerGroupName: 'prl-group-3090',
    accountId: 'salad-acc-2'
  }
];

export const INITIAL_HASHRATE_HISTORY: HashrateHistoryPoint[] = [];

export const DEMO_HASHRATE_HISTORY: HashrateHistoryPoint[] = [
  { time: '05:00', timestamp: Date.now() - 21600000, fleetHashrateTHs: 1420.5, netProfitPerHourUSD: 0.82, saladCostPerHourUSD: 0.91, activeGpus: 6 },
  { time: '06:00', timestamp: Date.now() - 18000000, fleetHashrateTHs: 1485.2, netProfitPerHourUSD: 0.89, saladCostPerHourUSD: 0.91, activeGpus: 6 },
  { time: '07:00', timestamp: Date.now() - 14400000, fleetHashrateTHs: 1510.8, netProfitPerHourUSD: 0.93, saladCostPerHourUSD: 0.91, activeGpus: 6 },
  { time: '08:00', timestamp: Date.now() - 10800000, fleetHashrateTHs: 1390.4, netProfitPerHourUSD: 0.78, saladCostPerHourUSD: 0.91, activeGpus: 5 },
  { time: '09:00', timestamp: Date.now() - 7200000, fleetHashrateTHs: 1532.1, netProfitPerHourUSD: 0.96, saladCostPerHourUSD: 0.91, activeGpus: 6 },
  { time: '10:00', timestamp: Date.now() - 3600000, fleetHashrateTHs: 1528.0, netProfitPerHourUSD: 0.95, saladCostPerHourUSD: 0.91, activeGpus: 6 },
  { time: '11:00', timestamp: Date.now() - 1800000, fleetHashrateTHs: 1532.1, netProfitPerHourUSD: 0.96, saladCostPerHourUSD: 0.91, activeGpus: 6 },
  { time: 'Ahora', timestamp: Date.now(), fleetHashrateTHs: 1532.1, netProfitPerHourUSD: 0.96, saladCostPerHourUSD: 0.91, activeGpus: 6 },
];

export const INITIAL_KRYPTEX_BALANCE: KryptexBalanceRaw = {
  total: 0,
  confirmed: 0,
  unconfirmed: 0,
  threshold: 1,
  reached_pct: 0,
};

export const DEMO_KRYPTEX_BALANCE: KryptexBalanceRaw = {
  total: 4892.45,
  confirmed: 4520.10,
  unconfirmed: 372.35,
  threshold: 1000.0,
  reached_pct: 100,
};

export const INITIAL_POOL_INFO: KryptexPoolInfo = {
  ticker: 'prl',
  name: 'Pearl',
  miners: 22490,
  workers: 84108,
  valid: 12398149,
  stale: 39263,
  invalid: 10904,
  hashrate: 3.0058e19,
  net_hashrate: 6.1014e19,
  fee: 0.03, // 3%
  block_reward: 2247.70,
  algo: 'PearlHash (PoUW Matrix)',
  estimated_profit_day: 1.8609e-14
};

// Compute dynamic summary metrics
export function computeFleetSummary(workers: MergedGPUWorker[], accounts: SaladAccountConfig[]): FleetSummary {
  const runningWorkers = workers.filter(w => w.saladStatus === 'running');
  const activeWorkers = workers.filter(w => w.saladStatus === 'running' && w.isMining);
  const totalAllocated = workers.length;
  const activeCount = activeWorkers.length;
  const idleOrDead = workers.filter(w => !w.isMining || w.saladStatus !== 'running').length;
  const underperforming = runningWorkers.filter(w => w.isMining && (w.performanceRatioPct < 80 || !w.isWithinWindow)).length;

  const totalHashrate = Number(workers.reduce((acc, w) => acc + (w.isMining ? w.currentHashrateTHs : 0), 0).toFixed(1));
  
  // Benchmark teórico del total de la flota (toda máquina registrada o provisionada)
  const totalFleetBenchmark = Number(workers.reduce((acc, w) => acc + (w.expectedBenchmarkTHs || 0), 0).toFixed(1));
  // Benchmark de las que están activas
  const runningBenchmark = Number(runningWorkers.reduce((acc, w) => acc + (w.expectedBenchmarkTHs || 0), 0).toFixed(1));
  
  // Eficiencia real de flota: considera el total de la flota instalada/asignada.
  // Si hay trabajadores caídos/offline, la eficiencia de flota refleja esa pérdida real.
  const fleetEfficiency = totalFleetBenchmark > 0 
    ? Number(((totalHashrate / totalFleetBenchmark) * 100).toFixed(1))
    : (runningBenchmark > 0 ? Number(((totalHashrate / runningBenchmark) * 100).toFixed(1)) : (totalHashrate > 0 ? 100 : 0));

  // Costo real de alquiler de la flota de GPUs:
  // Considera todas las GPUs asignadas/alquiladas en la flota con costo horario activo
  // (coincidiendo con el cómputo real de facturación y el gráfico de rendimiento).
  const billableWorkers = workers.filter(w => w.saladStatus !== 'allocating');
  const totalSaladCostPerHour = Number(
    (billableWorkers.length > 0 ? billableWorkers : runningWorkers)
      .reduce((acc, w) => acc + (w.hourlySaladCost || 0), 0)
      .toFixed(3)
  );
  const totalSaladCostPerDay = Number((totalSaladCostPerHour * 24).toFixed(2));

  const totalGrossRevPerHour = Number((totalHashrate * BASELINE_USD_PER_THS_HOUR).toFixed(4));
  const totalGrossRevPerDay = Number((totalGrossRevPerHour * 24).toFixed(2));

  const totalNetProfitPerHour = Number((totalGrossRevPerHour - totalSaladCostPerHour).toFixed(4));
  const totalNetProfitPerDay = Number((totalNetProfitPerHour * 24).toFixed(2));
  const totalNetProfitPerMonth = Number((totalNetProfitPerDay * 30).toFixed(2));

  const avgMargin = totalGrossRevPerHour > 0 ? Number(((totalNetProfitPerHour / totalGrossRevPerHour) * 100).toFixed(1)) : 0;

  const totalValidShares = workers.reduce((acc, w) => acc + (w.validShares || 0), 0);
  const totalStaleShares = workers.reduce((acc, w) => acc + (w.staleShares || 0), 0);
  const totalInvalidShares = workers.reduce((acc, w) => acc + (w.invalidShares || 0), 0);
  const estPayPerValidShareUSD = totalValidShares > 0 && totalGrossRevPerHour > 0 ? Number((totalGrossRevPerHour / totalValidShares).toFixed(7)) : 0;

  return {
    totalAllocatedGPUs: totalAllocated,
    activeMiningGPUs: activeCount,
    idleOrDeadGPUs: idleOrDead,
    underperformingGPUs: underperforming,
    totalHashrateTHs: totalHashrate,
    benchmarkHashrateTHs: totalFleetBenchmark || runningBenchmark,
    fleetEfficiencyPct: fleetEfficiency,
    hourlyGrossRevenueUSD: totalGrossRevPerHour,
    dailyGrossRevenueUSD: totalGrossRevPerDay,
    hourlySaladCostUSD: totalSaladCostPerHour,
    dailySaladCostUSD: totalSaladCostPerDay,
    hourlyNetProfitUSD: totalNetProfitPerHour,
    dailyNetProfitUSD: totalNetProfitPerDay,
    monthlyNetProfitUSD: totalNetProfitPerMonth,
    avgProfitMarginPct: avgMargin,
    estPayPerValidShareUSD: estPayPerValidShareUSD,
    totalValidShares: totalValidShares,
    totalStaleShares: totalStaleShares,
    totalInvalidShares: totalInvalidShares,
    totalAccountsConnected: accounts.filter(a => a.enabled).length,
    poolBlockReward: 2247.70,
    networkDifficulty: '2.10 M',
    lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };
}
