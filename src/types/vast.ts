/**
 * Vast.ai & Strategy Domain Types
 * Complies with MinerX_CALCULADORA_RENTABILIDAD_Y_AUTOMATIZACION_VASTAI.md Section 6, 7, 8 & 11
 */

import type { DataTrustSource, VastOfferNormalized } from './profitability';

export interface OfferScoreDetails {
  offer: VastOfferNormalized;
  benchmarkTHs: number;
  expectedGrossHourlyUSD: number;
  estimatedNetHourlyUSD: number;
  estimatedDailyNetUSD: number;
  marginPct: number;
  suitabilityScore: number; // 0 - 100
  qualificationBadge: 'EXCELLENT' | 'GOOD' | 'MARGINAL' | 'LOSS_RISK';
}

export type StrategyMode = 'SIMULATION' | 'MANUAL_APPROVAL' | 'AUTOMATIC';

export type FailureActionPolicy =
  | 'ALERT_ONLY'
  | 'STOP_MINER'
  | 'STOP_INSTANCE'
  | 'DESTROY_INSTANCE'
  | 'DISABLE_STRATEGY'
  | 'STOP_AND_DISABLE';

export type InstanceLifecycleStatus =
  | 'DISCOVERED'
  | 'OFFER_SELECTED'
  | 'PROVISIONING'
  | 'STARTING'
  | 'WARMUP'
  | 'MEASURING'
  | 'QUALIFIED'
  | 'RUNNING'
  | 'UNDERPERFORMING'
  | 'ALERTED'
  | 'MINER_STOPPING'
  | 'INSTANCE_STOPPING'
  | 'STOPPED'
  | 'TERMINATING'
  | 'TERMINATED'
  | 'ERROR'
  | 'MANUAL_REVIEW'
  | 'NO_DATA';

export interface RentalStrategy {
  id: string;
  name: string;
  provider: 'vastai' | 'salad';
  mode: StrategyMode;
  enabled: boolean;
  gpuModel: string;
  gpuCount: number;
  maxHourlyCostUSD: number;
  maxTotalSpendUSD: number;
  maxDailySpendUSD: number;
  minimumHashrateTHs: number;
  minimumPerformancePct: number; // e.g. 80%
  measurementWindowMinutes: number; // default: 15
  warmupMinutes: number; // default: 5
  consecutiveFailWindows: number; // default: 3
  minAcceptedShares: number; // default: 5
  maxRejectedSharePct: number; // default: 5
  maxConcurrentInstances: number; // default: 2
  failureAction: FailureActionPolicy;
  noDataAction: 'ALERT_ONLY' | 'MANUAL_REVIEW';
  cooldownMinutes: number; // default: 30
  requireManualApproval: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GpuInstance {
  id: string; // internal UUID
  provider: 'vastai' | 'salad';
  providerOfferId: string;
  providerInstanceId?: string;
  strategyId?: string;
  gpuModel: string;
  gpuCount: number;
  gpuMemoryGB: number;
  hourlyComputeCostUSD: number;
  hourlyStorageCostUSD: number;
  estimatedHourlyCostUSD: number;
  actualCostUSD?: number;
  status: InstanceLifecycleStatus;
  workerName: string;
  minerSessionId: string;
  poolWallet: string;
  createdAt: string;
  startedAt?: string;
  minerStartedAt?: string;
  firstAcceptedShareAt?: string;
  qualifiedAt?: string;
  stoppedAt?: string;
  terminatedAt?: string;
  terminationReason?: string;
  lastHashrateTHs?: number;
  lastPerformanceRatioPct?: number;
  consecutiveLowWindowsCount?: number;
  notes?: string;
}

export interface MiningMeasurement {
  id: string;
  instanceId: string;
  workerName: string;
  periodStart: string;
  periodEnd: string;
  hashrateTHs: number;
  acceptedShares: number;
  rejectedShares: number;
  rejectedSharePct: number;
  estimatedPRL: number;
  revenueUSD: number;
  sourceType: DataTrustSource;
  sourceTimestamp: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'SIMULATED';
}

export interface AuditRunEvent {
  id: string;
  timestamp: string;
  strategyId?: string;
  strategyName?: string;
  instanceId?: string;
  workerName?: string;
  action: string;
  actor: 'SYSTEM_AUTONOMOUS' | 'USER_ACTION' | 'STRATEGY_ENGINE';
  outcome: 'SUCCESS' | 'FAILURE' | 'SKIPPED' | 'WARNING';
  details: Record<string, any>;
  errorSanitized?: string;
}

export interface VastConfig {
  apiKey: string;
  enabled: boolean;
  balanceUSD?: number;
  lastTested?: string;
  status: 'connected' | 'error' | 'untested';
  errorMessage?: string;
}
