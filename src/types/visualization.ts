/**
 * MINERX DIGITAL OPERATIONS CENTER — VISUALIZATION TYPES
 *
 * Strict domain models for the 3D/2D digital center.
 * Follows the Fintech aesthetic and exact data contracts from MinerX Profit Engine and Kryptex.
 */

import type { MergedGPUWorker, FleetSummary } from './minerx';

export type VisualizationMode = 'CLIENT' | 'ADMIN';
export type SceneRenderMode = '3D' | '2D_FALLBACK';

export type VisualHealthStatus = 'OPTIMAL' | 'DEGRADED' | 'CRITICAL' | 'STANDBY';

export interface PowerModuleVisualItem {
  id: string;
  index: number;
  label: string;
  powerTh: number;
  status: VisualHealthStatus;
  efficiencyRatio: number; // J/TH or relative power
  activeHours: number;
  producedPrl: number;
}

export interface ClientVisualizationContractNode {
  contractId: string;
  userId: string;
  packageName: string;
  contractedTh: number;
  allocatedTh: number;
  pricePaidUsdt: number;
  status: 'ACTIVE' | 'PARTIALLY_ALLOCATED' | 'SUSPENDED';
  activatedAt: string;
  expiresAt: string;
  
  // Módulos físicos/digitales dentro del rack
  powerModules: PowerModuleVisualItem[];

  // Núcleo de producción (Profit Engine)
  productionCore: {
    baseRatePrlHour: number;
    hourlyPrlNet: number;
    dailyPrlNet: number;
    monthlyPrlNet: number;
    accumulatedPrl: number;
    currentPrlPriceUsd: number;
    dailyNetUsd: number;
    monthlyNetUsd: number;
    accumulatedNetProfitUsd: number;
    roiPct: number;
    breakEvenDays: number;
    effectiveVariablePct: number;
    effectiveCommissionPct: number;
    telemetryQuality: 'ACTIVE' | 'STALE_DATA';
    lastCalculatedAt: string;
  };

  // Flujo histórico de producción (para gráficas Recharts y partículas)
  historyFlow: Array<{
    timestamp: string;
    label: string;
    prlProduced: number;
    usdValue: number;
  }>;
}

export interface AdminVisualizationRackNode {
  rackId: string;
  rackLabel: string;
  accountName: string;
  totalGpus: number;
  activeGpus: number;
  totalHashrateTh: number;
  benchmarkHashrateTh: number;
  overallEfficiencyPct: number;
  status: VisualHealthStatus;
  
  // Servidores físicos individuales dentro del rack
  miners: Array<{
    worker: MergedGPUWorker;
    healthStatus: VisualHealthStatus;
    fanRpm: number;
    temperatureC: number;
    powerWatts: number;
    slotIndex: number;
  }>;
}

export interface AdminVisualizationState {
  summary: FleetSummary;
  racks: AdminVisualizationRackNode[];
  profitEngineMetrics: {
    prlPriceUsd: number;
    baseRatePrlHour: number;
    globalCommissionPct: number;
    globalVariablePct: number;
    engineStatus: string;
    lastSyncTimestamp: string;
  };
  unresolvedAlertsCount: number;
}

export interface Selected3DObject {
  id: string;
  type: 
    | 'CONTRACT_RACK' 
    | 'POWER_MODULE' 
    | 'PRODUCTION_CORE' 
    | 'FINANCIAL_PANEL' 
    | 'SERVER_RACK' 
    | 'PHYSICAL_MINER' 
    | 'PROFIT_CORE' 
    | 'TELEMETRY_BEACON';
  title: string;
  subtitle: string;
  healthStatus: VisualHealthStatus;
  position: [number, number, number];
  rawPayload: any;
}
