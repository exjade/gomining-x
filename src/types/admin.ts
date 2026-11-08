/**
 * MINERX — MASTER ADMIN & UNIFIED PROFIT ENGINE TYPES
 * Based on:
 * - MINERX — MODELO UNIFICADO DE CÁLCULO DE PRODUCCIÓN, PROFIT Y ROI.md
 * - ACTUALIZACIÓN MAESTRA — MOTOR HÍBRIDO, WORKERS VIRTUALES Y RANKING MINERX.md
 * - Master Instruction_Dashboard.md
 * - MINERX — MASTER DESIGN SYSTEM & EXPERIENCE BLUEPRINT.md
 */

export type TelemetryQualityStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'DEGRADED'
  | 'STALE_DATA'
  | 'ERROR'
  | 'MANUAL_MODE';

export type DataProvenance =
  | 'POOL_OBSERVED'
  | 'INSTANCE_MEASURED'
  | 'FINANCIAL_REALIZED'
  | 'SIMULATED';

export type EngineCalculationMode = 'AUTOMATIC' | 'MANUAL_AUTHORIZED';

export interface ProfitEngineGlobalConfig {
  engineStatus: TelemetryQualityStatus;
  calculationMode: EngineCalculationMode;
  baseRateSource: 'POOL_OBSERVED' | 'MANUAL_OVERRIDE';
  manualBaseRatePrlPerThsHour: number;
  globalVariablePct: number;
  globalCommissionPct: number;
  prlPriceUsd: number;
  prlPriceSource: 'KRYPTEX_PUBLIC' | 'COINGECKO' | 'MANUAL_OVERRIDE';
  prlManualOverridePrice: number | null;
  staleDataThresholdMinutes: number;
  calculationWindowHours: number;
  roundingDecimals: number;
  configurationVersion: number;
  lastSyncTimestamp: string;
  updatedAt: string;
  updatedBy: string;
}

export interface MinerConfiguration {
  id: string;
  name: string;
  type: 'PACKAGE' | 'CUSTOM_MINER';
  powerTh: number;
  variablePct?: number;
  commissionPct?: number;
  enabled: boolean;
  applicableCostsUsdPerHour?: number;
  updatedAt: string;
  updatedBy: string;
}

export interface ContractProfitConfig {
  contractId: string;
  variablePct?: number;
  commissionPct?: number;
  applicableCostsUsdPerHour?: number;
  manualRateOverride?: number;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface ResolvedContractParameters {
  effectiveVariablePct: number;
  effectiveCommissionPct: number;
  effectiveCostsUsdPerHour: number;
  variableSource: 'CONTRACT' | 'CUSTOM_MINER' | 'PACKAGE' | 'GLOBAL';
  commissionSource: 'CONTRACT' | 'CUSTOM_MINER' | 'PACKAGE' | 'GLOBAL';
  costsSource: 'CONTRACT' | 'CUSTOM_MINER' | 'PACKAGE' | 'GLOBAL';
}

export interface RateObservation {
  baseRate: number;
  observedRewardPrl: number;
  averageHashrateThs: number;
  periodHours: number;
  periodStart: string;
  periodEnd: string;
  provenance: DataProvenance;
  qualityStatus: TelemetryQualityStatus;
  recordedAt: string;
}

export interface ContractProductionResult {
  contractedTh: number;
  activeHours: number;
  baseRate: number;
  produccionBase: number;
  produccionAjustada: number;
  produccionNeta: number;
  valorUsd: number;
  costosAplicablesUsd: number;
  profitNetoUsd: number;
  effectiveVariablePct: number;
  effectiveCommissionPct: number;
  prlPriceUsd: number;
  provenance: DataProvenance;
  qualityStatus: TelemetryQualityStatus;
  calculatedAt: string;
}

export interface ProfitRoiSummary {
  initialInvestmentUsd: number;
  accumulatedProductionPrl: number;
  accumulatedValueUsd: number;
  accumulatedCostsUsd: number;
  netProfitUsd: number;
  roiPct: number;
  breakEvenUsd: number;
  isBreakEvenReached: boolean;
  estimatedDaysToBreakEven: number | null;
  calculationTimestamp: string;
}

export interface ProcessedPeriod {
  periodId: string;
  contractId: string;
  periodStart: string;
  periodEnd: string;
  netPrl: number;
  netUsd: number;
  provenance: DataProvenance;
  processedAt: string;
}

// RBAC & Security Roles
export type AdminRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'FINANCE_ADMIN'
  | 'MINING_OPERATOR'
  | 'MARKETING_ADMIN'
  | 'AUDITOR_VIEWER';

export type AdminPermission =
  | 'dashboard.view'
  | 'mining.view'
  | 'mining.engine.manage'
  | 'mining.virtual_workers.manage'
  | 'mining.allocation.manage'
  | 'commercial.packages.manage'
  | 'commercial.memberships.manage'
  | 'finance.ledger.view'
  | 'finance.operations.manage'
  | 'marketing.promos.manage'
  | 'marketing.ranking.manage'
  | 'security.roles.manage'
  | 'security.audit.view';

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: AdminRole;
  customPermissions?: AdminPermission[];
  lastLoginAt: string;
}

export interface AdminAuditLog {
  id: string;
  timestamp: string;
  actorUid: string;
  actorEmail: string;
  actorRole: AdminRole;
  action: string;
  module: 'AUTH' | 'MINING_ENGINE' | 'VIRTUAL_WORKERS' | 'ALLOCATION' | 'COMMERCIAL' | 'FINANCE' | 'MARKETING' | 'SECURITY';
  targetId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  status: 'SUCCESS' | 'FAILED' | 'WARNING';
}

// Commercial Package Specification
export interface CommercialPackage {
  id: string;
  name: string;
  powerTh: number;
  priceUsdt: number;
  durationDays?: number;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  variablePct?: number;
  commissionPct?: number;
  version: number;
  maxPurchasesPerUser?: number;
  description?: string | null;
  isPublished?: boolean;
  createdAt: string;
  updatedAt: string;

  // Additive fields for dynamic storefront catalog (SCRUM-210)
  packageId?: string;
  section?: 'minerx' | 'preventa' | 'lanzamiento' | 'mensual';
  packageType?: 'fixed' | 'subscription' | 'custom';
  sortOrder?: number;
  displayName?: string;
  frontendKey?: string; // PROPOSED: stable key observed in frontend seeds
  source?: 'frontend-seed' | 'admin';
  priceUsdCents?: number; // PROPOSED: integer cents for precise financial operations
  currency?: 'USDT' | 'USD';
  cadence?: 'one_time' | 'monthly' | string;
  dailyBtcText?: string;
  roiPct?: number;
  limitedUnits?: number;
  availableUnits?: number;
  soldUnits?: number;
  updatedBy?: string;
  seededAt?: string;
}

// Purchased Package Snapshot for immutable audit & purchase traceability
export interface PurchasedPackageSnapshot {
  packageId: string;
  packageName: string;
  displayName?: string;
  section?: 'minerx' | 'preventa' | 'lanzamiento' | 'mensual';
  packageType?: 'fixed' | 'subscription' | 'custom';
  powerTh: number;
  pricePaidCents: number;
  pricePaidUsd: number;
  pricePaidUsdt?: number;
  currency: string;
  cadence?: 'one_time' | 'monthly' | string;
  durationDays?: number;
  variablePct?: number;
  commissionPct?: number;
  dailyBtcText?: string;
  roiPct?: number;
  packageVersion: number;
  purchasedAt: string;
}

// Client Miner Instance with Purchase Snapshot
export interface PurchasedMinerInstance {
  minerId: string;
  id?: string;
  uid: string;
  packageId: string;
  packageSnapshot: PurchasedPackageSnapshot;
  name?: string;
  powerTh?: number;
  price?: number;
  currency?: string;
  status?: string;
  txHash?: string;
  network?: string;
  ownerWallet?: string;
  createdAt: string;
}

// Contract & Allocation
export type ContractStatus = 'ACTIVE' | 'PENDING' | 'PARTIALLY_ALLOCATED' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';

export interface AllocationSummary {
  totalContractedTh: number;
  totalAllocatedTh: number;
  totalBackedCapacityTh: number;
  availableCapacityTh: number;
  utilizationRatePct: number;
  isOverallocated: boolean;
  unallocatedContractsCount: number;
}

export interface MiningContract {
  id: string;
  userId: string;
  userEmail: string;
  packageId: string;
  packageName: string;
  contractedTh: number;
  allocatedTh: number;
  status: ContractStatus;
  pricePaidUsdt: number;
  variablePct?: number;
  commissionPct?: number;
  workerId?: string;
  activatedAt: string;
  expiresAt: string;
  accumulatedProductionPrl: number;
  accumulatedNetProfitUsd: number;
  lastCalculatedAt: string;
}

// Virtual Worker Definition
export interface VirtualWorker {
  id: string;
  contractId: string;
  userId: string;
  name: string;
  assignedTh: number;
  status: 'ACTIVE' | 'STARTING' | 'PAUSED' | 'STOPPED' | 'EXPIRED';
  provenance: 'MINERX_VIRTUAL';
  mode: 'REAL' | 'SIMULATED';
  sharesAccepted: number;
  sharesRejected: number;
  accumulatedPrl: number;
  currentHashrateTh: number;
  uptimeSeconds: number;
  lastHeartbeat: string;
  // Campos dinámicos calculados por el Motor Híbrido MinerX
  dailyPrl?: number;
  dailyUsd?: number;
  effectiveRate?: number;
  prlPriceUsd?: number;
  variablePct?: number;
  commissionPct?: number;
}

// Unified Ranking Entry
export interface UnifiedRankingItem {
  rank: number;
  id: string;
  name: string;
  ownerLabel: string;
  source: 'KRYPTEX_REAL' | 'MINERX_VIRTUAL';
  hashrateTh: number;
  efficiencyWattsPerTh?: number;
  totalPrlProduced: number;
  status: 'ONLINE' | 'OFFLINE' | 'WARNING';
  dailyPrl?: number;
  dailyUsd?: number;
}

// Financial Ledger Entry
export interface LedgerEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail?: string;
  transactionType: 'DEPOSIT' | 'WITHDRAWAL' | 'PACKAGE_PURCHASE' | 'MINING_YIELD' | 'COMMISSION_PAYOUT' | 'ADJUSTMENT';
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  currency: 'USDT' | 'PRL' | 'USD';
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'SETTLED';
  referenceId: string;
  description: string;
  balanceAfter: number;
  provenance: DataProvenance;
}

// Marketing Promotions
export interface PromotionItem {
  id: string;
  title: string;
  badge: string;
  description: string;
  discountPct?: number;
  bonusTh?: number;
  targetPackageId?: string;
  active: boolean;
  startDate: string;
  endDate: string;
  imageUrl?: string;
  clicksCount: number;
  conversionsCount: number;
}

// Client Withdrawal Request
export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';

export interface ClientWithdrawalRequest {
  id: string;
  createdAt: string;
  userId: string;
  userEmail: string;
  userName: string;
  amount: number;
  currency: 'USDT' | 'PRL' | 'BTC' | 'SOL';
  network: 'TRC20' | 'ERC20' | 'PEARL' | 'BITCOIN' | 'SOLANA';
  destinationAddress: string;
  fee: number;
  netAmount: number;
  status: WithdrawalStatus;
  txHash?: string;
  processedAt?: string;
  processedBy?: string;
  riskScore: 'LOW' | 'MEDIUM' | 'HIGH';
  kycVerified: boolean;
  rejectionReason?: string;
  source: 'MINING_YIELD' | 'REFERRAL_COMMISSIONS' | 'BALANCE';
}

// Package Order & Payment Attempt
export type OrderPaymentStatus = 'SETTLED' | 'CONFIRMED' | 'PENDING' | 'UNDERPAID' | 'EXPIRED' | 'REVERSED';

export interface PackageOrderPayment {
  orderId: string;
  attemptId: string;
  createdAt: string;
  userId: string;
  userEmail: string;
  userName: string;
  packageId: string;
  packageName: string;
  contractedTh: number;
  amountUsd: number;
  cryptoAsset: 'USDT' | 'BTC' | 'ETH' | 'SOL' | 'POL' | 'MXN';
  cryptoAmount: string;
  paymentNetwork: 'TRON' | 'ETHEREUM' | 'SOLANA' | 'BITCOIN' | 'POLYGON' | 'BRIDGE_SPEI';
  recipientAddress: string;
  txHash?: string;
  confirmations: number;
  requiredConfirmations: number;
  status: OrderPaymentStatus;
  bridgeStatus?: 'NONE' | 'INITIATED' | 'COMPLETED' | 'FAILED';
  activatedMinerId?: string;
  idempotencyKey: string;
  settledAt?: string;
}

