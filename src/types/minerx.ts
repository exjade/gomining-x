import type { SaladPriority } from '../data/gpuBenchmarks';

export interface HashrateSample {
  time: string;
  ths: number;
}

export interface SaladAccountConfig {
  id: string;
  accountName: string;
  organizationName: string;
  projectName: string;
  apiKey: string;
  enabled: boolean;
  balanceUSD?: number;
  lastConnected?: string;
  status: 'connected' | 'error' | 'untested';
  errorMessage?: string;
}

export interface KryptexConfig {
  walletAddress: string;
  coin: string; // default: 'prl'
  poolUrl: string; // e.g. stratum+tcp://prl.kryptex.network:7048
  customPpsRewardPerTHs?: number;
  lastConnected?: string;
  status: 'connected' | 'error' | 'untested';
}

export interface AppSettings {
  refreshIntervalSeconds: number; // default: 45s
  underperformingThresholdPct: number; // default: 80% of benchmark
  maxShareInactivityMinutes: number; // default: 8 minutes
  enableSoundAlerts: boolean;
  discordWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  backendUrl?: string; // Optional custom backend / proxy URL
}

export interface SaladInstanceRaw {
  id: string; // UUID
  machine_id: string;
  state: 'allocating' | 'running' | 'stopping' | 'stopped';
  container_group_name: string;
  organization_name: string;
  project_name: string;
  gpu_class: string;
  priority: SaladPriority;
  create_time: string;
  update_time: string;
  version?: number;
}

export interface KryptexWorkerRaw {
  worker: string;
  scheme: string;
  hashrate: number; // in H/s
  shares: number;
  last_share: number; // unix timestamp in seconds
}

export interface KryptexPoolInfo {
  ticker: string;
  name: string;
  miners: number;
  workers: number;
  valid: number;
  stale: number;
  invalid: number;
  hashrate: number;
  net_hashrate: number;
  fee: number;
  block_reward: number;
  algo: string;
  estimated_profit_day: number;
}

export interface KryptexBalanceRaw {
  total: number;
  threshold: number;
  reached_pct: number;
  unconfirmed: number;
  confirmed: number;
}

export interface KryptexPayoutStatsRaw {
  paid: number;
  unpaid: number;
  reward: {
    week: number;
    month: number;
  };
}

export interface MergedGPUWorker {
  id: string;
  workerName: string;
  machineId: string;
  accountId: string;
  accountName: string;
  containerGroupName: string;
  gpuModel: string;
  vramGB: number;
  saladPriority: SaladPriority;
  saladStatus: 'allocating' | 'running' | 'stopping' | 'stopped';
  isMining: boolean;
  minutesSinceLastShare: number;
  currentHashrateTHs: number;
  saladLogHashrateTHs?: number;
  kryptexHashrateTHs?: number;
  expectedBenchmarkTHs: number;
  targetWindowMinTHs?: number;
  targetWindowMaxTHs?: number;
  isWithinWindow?: boolean;
  hashrateSamples?: HashrateSample[];
  staleRatioText?: string;
  latestLogTime?: string;
  performanceRatioPct: number;
  hourlySaladCost: number;
  dailySaladCost: number;
  hourlyGrossRevenue: number;
  dailyGrossRevenue: number;
  hourlyNetProfit: number;
  dailyNetProfit: number;
  profitMarginPct: number;
  efficiencyTHsPerDollar: number;
  validShares: number;
  staleShares?: number;
  invalidShares?: number;
  agent?: string;
  serverGeo?: string;
  connectedAt: string;
  lastShareTimestamp: number;
  hasAlert: boolean;
  alertType?: 'UNDERPERFORMING' | 'OFFLINE_NOT_MINING' | 'NEGATIVE_ROI' | 'ALLOCATING';
  alertMessage?: string;
  recommendation: 'OPTIMAL' | 'REALLOCATE_RECOMMENDED' | 'RESTART_CONTAINER' | 'TERMINATE_LOSS';
}

export interface FleetSummary {
  totalAllocatedGPUs: number;
  activeMiningGPUs: number;
  idleOrDeadGPUs: number;
  underperformingGPUs: number;
  totalHashrateTHs: number;
  benchmarkHashrateTHs: number;
  fleetEfficiencyPct: number;
  hourlyGrossRevenueUSD: number;
  dailyGrossRevenueUSD: number;
  hourlySaladCostUSD: number;
  dailySaladCostUSD: number;
  hourlyNetProfitUSD: number;
  dailyNetProfitUSD: number;
  monthlyNetProfitUSD: number;
  avgProfitMarginPct: number;
  estPayPerValidShareUSD: number;
  totalValidShares: number;
  totalStaleShares: number;
  totalInvalidShares?: number;
  totalAccountsConnected: number;
  poolBlockReward: number;
  networkDifficulty: string;
  lastUpdated: string;
}

export interface AlertEvent {
  id: string;
  timestamp: string;
  type: 'DISCONNECT' | 'UNDERPERFORMING' | 'NEGATIVE_PROFIT' | 'REALLOCATION' | 'RESTART' | 'RECREATE' | 'CONNECTED' | 'ALLOCATING';
  workerName: string;
  gpuModel: string;
  message: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  instanceId?: string;
  containerGroupName?: string;
  accountId?: string;
}

export interface HashrateHistoryPoint {
  time: string;
  timestamp: number;
  fleetHashrateTHs: number;
  netProfitPerHourUSD: number;
  saladCostPerHourUSD: number;
  activeGpus: number;
}

export interface SaladBalanceAccount {
  id: string;
  accountName?: string;
  organizationName: string;
  balanceUSD: number;
  hourlySpendingUSD?: number;
  runwayHours?: number;
  runningGpus?: number;
}

export interface SaladBalanceInfo {
  totalBalanceUSD: number;
  hourlySpendingUSD: number;
  runwayHours: number;
  isRunwayCritical: boolean; // true if runwayHours < 24
  accounts: SaladBalanceAccount[];
}

export interface FleetCapacitySummary {
  totalReplicas: number;
  runningGpus: number;
  allocatingGpus: number;
  stoppedGpus: number;
  totalSaladLogHashrateTHs: number;
  totalKryptexHashrateTHs: number;
}

export interface FintechCycleItem {
  id: string;
  startTime: string;
  endTime: string;
  initialGpuCostUSD: number;
  finalGpuCostUSD: number;
  initialCrypto: number;
  finalCrypto: number;
  currency: 'BTC' | 'PRL';
  yieldUSD: number;
  netProfitUSD: number;
  roiPct: number;
}

export interface MiningCycle {
  id: string;
  startTime: number; // ms timestamp
  endTime?: number;  // ms timestamp (undefined if active)
  startDateStr: string;
  endDateStr?: string;
  durationHours: number;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  containerGroupName: string;
  organizationName: string;
  activeGpuCount: number;
  gpuModel: string;
  hourlySaladRateUSD: number;
  totalSaladCostUSD: number;
  averageHashrateTHs: number;
  totalComputeTHh: number;
  acceptedShares: number;
  initialCryptoBalance: number;
  finalCryptoBalance: number;
  cryptoProduced: number;
  cryptoCurrency: 'PRL' | 'BTC';
  spotPriceUSD: number;
  grossRevenueUSD: number;
  netProfitUSD: number;
  roiPct: number;
  route: 'Kryptex' | 'PearlDirect';
  isProfitable: boolean;
  notes?: string;
}

export interface MiningCyclesData {
  activeCycle: MiningCycle | null;
  closedCycles: MiningCycle[];
}

export interface FintechAuditData {
  capitalBolsilloUSD: number;
  efectivoCobradoUSD: number;
  gananciaNetaRealizadaUSD: number;
  roiRealBolsilloPct: number;
  capitalReinvertidoUSD: number;
  criptoEnCarteraUSD: number;
  gananciaTotalEstimadaUSD: number;
  roiTotalEstimadoPct: number;
  costoTotalSaladUSD: number;
  saldoCreditoSaladUSD: number;
  operacionesLiquidadasBanco: number;
  friccionFinancieraUSD: number;
  rutas: {
    kryptexBtc: {
      nombre: string;
      gastoGpuUSD: number;
      recompensasGeneradasBTC: number;
      retiradoBTC: number;
      recibidoBinanceBTC: number;
      usdtNetos: number;
      cobradoLiquidadoUSD: number;
      estado: string;
    };
    pearlDirecta: {
      nombre: string;
      gastoGpuUSD: number;
      recompensasGeneradasPRL: number;
      retiradoPRL: number;
      recibidoBinanceUSDT: number;
      cobradoLiquidadoUSD: number;
      criptoEnCarteraUSD: number;
      estado: string;
    };
  };
  ciclosHistoricos: FintechCycleItem[];
}

export interface InstanceLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface AutoscaleConfig {
  enabled: boolean;
  targetMarginPct: number; // default: 30%
  maxInstances: number;
  minInstances: number;
  lastAction?: string;
  lastActionTime?: string;
}

