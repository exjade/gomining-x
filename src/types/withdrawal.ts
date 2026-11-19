/**
 * SCRUM-275 / SCRUM-289 / SCRUM-276 (W01) + Fault-Tracing System (W01..W13)
 * Canonical Domain Model, DTO Contracts, State Machine, RBAC Permissions,
 * Micro-USDT Arithmetic, Fault Origin Codes & Pure Accounting Evaluators.
 *
 * IMPORTANT: This file is the single source of truth shared byte-for-byte across:
 * - Client branch (`main` @ 62e5cb3)
 * - Admin & Backend branch (`release/pouw-admin-backend` @ faffbb11)
 */

// ============================================================================
// 0. TRACEABLE FAULT-CONTROL SYSTEM (W01..W13 ORIGIN IDENTIFICATION)
// ============================================================================

export type WithdrawalTaskOrigin =
  | 'W01'
  | 'W02'
  | 'W03'
  | 'W04'
  | 'W05'
  | 'W06'
  | 'W07'
  | 'W08'
  | 'W09'
  | 'W10'
  | 'W11'
  | 'W12'
  | 'W13';

export type WithdrawalModuleOrigin =
  | 'DOMAIN'
  | 'AUTHZ'
  | 'RBAC'
  | 'CLIENT_GUARD'
  | 'NETCFG'
  | 'QUOTE'
  | 'CLIENT_API'
  | 'LOCK_TX'
  | 'FORM_UI'
  | 'SHARED_UI'
  | 'HISTORY_UI'
  | 'ADMIN_UI'
  | 'WORKFLOW'
  | 'AUDIT'
  | 'LEDGER'
  | 'SETTLEMENT';

export interface WithdrawalFaultDescriptor {
  faultCode: string;
  originTask: WithdrawalTaskOrigin;
  originModule: WithdrawalModuleOrigin;
  code: string;
  httpStatus?: number;
  message: string;
}

export function formatWithdrawalFaultCode(
  originTask: WithdrawalTaskOrigin,
  originModule: WithdrawalModuleOrigin,
  code: string,
  httpStatus?: number,
): string {
  const cleanCode = code.trim().toUpperCase();
  if (typeof httpStatus === 'number' && Number.isInteger(httpStatus) && httpStatus > 0) {
    return `${originTask}-${originModule}-${httpStatus}-${cleanCode}`;
  }
  return `${originTask}-${originModule}-${cleanCode}`;
}

export class WithdrawalModuleError extends Error {
  public readonly faultCode: string;
  public readonly originTask: WithdrawalTaskOrigin;
  public readonly originModule: WithdrawalModuleOrigin;
  public readonly code: string;
  public readonly httpStatus?: number;
  public readonly details?: Record<string, unknown>;

  constructor(params: {
    originTask: WithdrawalTaskOrigin;
    originModule: WithdrawalModuleOrigin;
    code: string;
    message: string;
    httpStatus?: number;
    details?: Record<string, unknown>;
  }) {
    const faultCode = formatWithdrawalFaultCode(
      params.originTask,
      params.originModule,
      params.code,
      params.httpStatus,
    );
    super(`[${faultCode}] ${params.code}: ${params.message}`);
    this.name = 'WithdrawalModuleError';
    this.faultCode = faultCode;
    this.originTask = params.originTask;
    this.originModule = params.originModule;
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.details = params.details;
  }

  public toJSON(): WithdrawalFaultDescriptor & { details?: Record<string, unknown> } {
    return {
      faultCode: this.faultCode,
      originTask: this.originTask,
      originModule: this.originModule,
      code: this.code,
      ...(typeof this.httpStatus === 'number' ? { httpStatus: this.httpStatus } : {}),
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function isWithdrawalModuleError(error: unknown): error is WithdrawalModuleError {
  return (
    error instanceof WithdrawalModuleError ||
    (typeof error === 'object' &&
      error !== null &&
      'faultCode' in error &&
      'originTask' in error &&
      'originModule' in error)
  );
}

// ============================================================================
// 1. CANONICAL CONSTANTS & COLLECTION NAMES
// ============================================================================

export const WITHDRAWAL_ASSET = 'USDT' as const;
export type WithdrawalAsset = typeof WITHDRAWAL_ASSET;

/** 1 USDT = 1,000,000 micro-USDT */
export const MICRO_USDT_SCALE = 1_000_000 as const;

/** Canonical minimum withdrawal: 10 USDT (10,000,000 micro-USDT) per SCRUM-275 */
export const MIN_WITHDRAWAL_USDT = 10 as const;
export const MIN_WITHDRAWAL_MICROS = 10_000_000 as const;

/** Default platform fee: 1% (100 basis points) */
export const DEFAULT_PLATFORM_FEE_BPS = 100 as const;

/** Canonical Firestore Collections (SCRUM-289 + Approved Decision 1) */
export const USER_BALANCES_COLLECTION = 'userBalances' as const;
export const WITHDRAWAL_REQUESTS_COLLECTION = 'withdrawalRequests' as const;
export const FINANCIAL_LEDGER_COLLECTION = 'financialLedger' as const;
export const WITHDRAWAL_AUDIT_EVENTS_COLLECTION = 'withdrawalAuditEvents' as const;
export const WITHDRAWAL_NETWORKS_COLLECTION = 'withdrawalNetworks' as const;
export const USERS_COLLECTION = 'users' as const;
export const ADMIN_USERS_COLLECTION = 'admin_users' as const;

// ============================================================================
// 2. CANONICAL STATE MACHINE & TRANSITION MATRIX
// ============================================================================

export const WITHDRAWAL_STATUSES = [
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PROCESSING',
  'BROADCASTED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;

export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

export const OPEN_WITHDRAWAL_STATUSES: readonly WithdrawalStatus[] = [
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PROCESSING',
  'BROADCASTED',
] as const;

export const TERMINAL_WITHDRAWAL_STATUSES: readonly WithdrawalStatus[] = [
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;

export const UNLOCK_FUNDS_STATUSES: readonly WithdrawalStatus[] = [
  'REJECTED',
  'CANCELLED',
] as const;

export const PRE_BROADCAST_EDITABLE_STATUSES: readonly WithdrawalStatus[] = [
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PROCESSING',
] as const;

export const IMMUTABLE_FROM_BROADCAST_FIELDS = [
  'destinationAddress',
  'network',
  'networkId',
  'asset',
  'requestedAmountMicros',
  'networkFeeMicros',
  'platformFeeMicros',
  'conversionFeeMicros',
  'totalDebitMicros',
  'netAmountMicros',
] as const;

export type ImmutableBroadcastField = (typeof IMMUTABLE_FROM_BROADCAST_FIELDS)[number];

export const ALLOWED_WITHDRAWAL_TRANSITIONS: Readonly<
  Record<WithdrawalStatus, readonly WithdrawalStatus[]>
> = {
  REQUESTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['PROCESSING', 'REJECTED', 'CANCELLED'],
  PROCESSING: ['BROADCASTED', 'REJECTED', 'CANCELLED'],
  BROADCASTED: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
} as const;

export function isWithdrawalStatus(value: unknown): value is WithdrawalStatus {
  return (
    typeof value === 'string' &&
    (WITHDRAWAL_STATUSES as readonly string[]).includes(value)
  );
}

export function isTerminalWithdrawalStatus(status: WithdrawalStatus): boolean {
  return (TERMINAL_WITHDRAWAL_STATUSES as readonly string[]).includes(status);
}

export function isOpenWithdrawalStatus(status: WithdrawalStatus): boolean {
  return (OPEN_WITHDRAWAL_STATUSES as readonly string[]).includes(status);
}

export function doesStatusUnlockFunds(status: WithdrawalStatus): boolean {
  return (UNLOCK_FUNDS_STATUSES as readonly string[]).includes(status);
}

export function isStatusFrozenForFinancialEdits(status: WithdrawalStatus): boolean {
  return (
    status === 'BROADCASTED' ||
    status === 'COMPLETED' ||
    status === 'REJECTED' ||
    status === 'CANCELLED'
  );
}

export function canTransitionWithdrawalStatus(
  from: WithdrawalStatus,
  to: WithdrawalStatus,
): boolean {
  if (!isWithdrawalStatus(from) || !isWithdrawalStatus(to)) {
    return false;
  }
  const allowed = ALLOWED_WITHDRAWAL_TRANSITIONS[from];
  return allowed.includes(to);
}

export function assertValidWithdrawalTransition(
  from: WithdrawalStatus,
  to: WithdrawalStatus,
): void {
  if (!canTransitionWithdrawalStatus(from, to)) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'INVALID_STATUS_TRANSITION',
      httpStatus: 409,
      message: `Transition from "${String(from)}" to "${String(to)}" is not permitted.`,
    });
  }
}

// ============================================================================
// 3. GRANULAR RBAC PERMISSIONS & AUDIT ACTIONS (SCRUM-289 §4.3)
// ============================================================================

export const WITHDRAWAL_ADMIN_PERMISSIONS = [
  'withdrawals.read',
  'withdrawals.review',
  'withdrawals.edit',
  'withdrawals.approve',
  'withdrawals.reject',
  'withdrawals.cancel',
  'withdrawals.process',
  'withdrawals.broadcast',
  'withdrawals.audit',
] as const;

export type WithdrawalAdminPermission = (typeof WITHDRAWAL_ADMIN_PERMISSIONS)[number];

export const WITHDRAWAL_AUDIT_ACTIONS = [
  'CREATE',
  'REVIEW',
  'APPROVE',
  'EDIT',
  'REJECT',
  'PROCESS',
  'BROADCAST',
  'COMPLETE',
  'CANCEL',
] as const;

export type WithdrawalAuditAction = (typeof WITHDRAWAL_AUDIT_ACTIONS)[number];

export const REQUIRED_PERMISSION_BY_AUDIT_ACTION: Readonly<
  Record<Exclude<WithdrawalAuditAction, 'CREATE'>, WithdrawalAdminPermission>
> = {
  REVIEW: 'withdrawals.review',
  APPROVE: 'withdrawals.approve',
  EDIT: 'withdrawals.edit',
  REJECT: 'withdrawals.reject',
  CANCEL: 'withdrawals.cancel',
  PROCESS: 'withdrawals.process',
  BROADCAST: 'withdrawals.broadcast',
  COMPLETE: 'withdrawals.broadcast',
} as const;

/**
 * Strict fail-closed permission evaluator.
 * Wildcard or localStorage SUPER_ADMIN bypasses are strictly rejected.
 */
export function hasWithdrawalPermission(
  grantedPermissions: readonly string[] | undefined | null,
  requiredPermission: WithdrawalAdminPermission,
): boolean {
  if (!Array.isArray(grantedPermissions) || grantedPermissions.length === 0) {
    return false;
  }
  if (!(WITHDRAWAL_ADMIN_PERMISSIONS as readonly string[]).includes(requiredPermission)) {
    return false;
  }
  return grantedPermissions.includes(requiredPermission);
}

// ============================================================================
// 4. NETWORKS, MEMBERSHIP TIERS & SLA DEFINITIONS
// ============================================================================

export const MEMBERSHIP_TIERS = ['NONE', 'STANDARD', 'PRO', 'ELITE', 'WHALE'] as const;
export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];

export interface WithdrawalSlaPolicy {
  tier: MembershipTier;
  hasActiveMembership: boolean;
  minHours: number;
  maxHours: number;
  priorityRank: number;
  displayLabel: string;
}

export const SLA_POLICY_BY_MEMBERSHIP: Readonly<Record<MembershipTier, WithdrawalSlaPolicy>> = {
  NONE: {
    tier: 'NONE',
    hasActiveMembership: false,
    minHours: 24,
    maxHours: 24,
    priorityRank: 0,
    displayLabel: 'Hasta 24 horas (Estándar sin membresía)',
  },
  STANDARD: {
    tier: 'STANDARD',
    hasActiveMembership: true,
    minHours: 1,
    maxHours: 5,
    priorityRank: 1,
    displayLabel: '1 a 5 horas (Prioridad Membresía Activa)',
  },
  PRO: {
    tier: 'PRO',
    hasActiveMembership: true,
    minHours: 1,
    maxHours: 5,
    priorityRank: 2,
    displayLabel: '1 a 5 horas (Prioridad Membresía PRO)',
  },
  ELITE: {
    tier: 'ELITE',
    hasActiveMembership: true,
    minHours: 1,
    maxHours: 5,
    priorityRank: 3,
    displayLabel: '1 a 5 horas (Prioridad Membresía ELITE)',
  },
  WHALE: {
    tier: 'WHALE',
    hasActiveMembership: true,
    minHours: 1,
    maxHours: 5,
    priorityRank: 4,
    displayLabel: '1 a 5 horas (Prioridad Membresía WHALE)',
  },
} as const;

export function resolveMembershipSlaPolicy(tier?: string | null): WithdrawalSlaPolicy {
  const normalized = typeof tier === 'string' ? tier.trim().toUpperCase() : 'NONE';
  if ((MEMBERSHIP_TIERS as readonly string[]).includes(normalized)) {
    return SLA_POLICY_BY_MEMBERSHIP[normalized as MembershipTier];
  }
  return SLA_POLICY_BY_MEMBERSHIP.NONE;
}

export const WITHDRAWAL_ADDRESS_TYPES = ['EVM', 'SOLANA', 'TRON'] as const;
export type WithdrawalAddressType = (typeof WITHDRAWAL_ADDRESS_TYPES)[number];

export const WITHDRAWAL_NETWORK_CODES = [
  'ETHEREUM',
  'BSC',
  'POLYGON',
  'SOLANA',
  'TRON',
] as const;
export type WithdrawalNetworkCode = (typeof WITHDRAWAL_NETWORK_CODES)[number];

export interface WithdrawalFeePolicy {
  networkFeeMicros: number;
  platformFeeBps: number;
  platformFeeMinMicros: number;
  conversionFeeMicros: number;
}

export interface WithdrawalNetworkConfig {
  id: string;
  asset: WithdrawalAsset;
  networkCode: WithdrawalNetworkCode;
  network: string;
  tokenStandard: string;
  enabled: boolean;
  minimumWithdrawalMicros: number;
  requiredConfirmations: number;
  explorerTxUrlTemplate: string;
  addressType: WithdrawalAddressType;
  feePolicy: WithdrawalFeePolicy;
  configVersion: number;
  updatedAt: string;
}

export const CANONICAL_USDT_NETWORKS: readonly WithdrawalNetworkConfig[] = [
  {
    id: 'usdt-bsc',
    asset: 'USDT',
    networkCode: 'BSC',
    network: 'BNB Smart Chain (BEP-20)',
    tokenStandard: 'BEP-20',
    enabled: true,
    minimumWithdrawalMicros: MIN_WITHDRAWAL_MICROS,
    requiredConfirmations: 15,
    explorerTxUrlTemplate: 'https://bscscan.com/tx/{txHash}',
    addressType: 'EVM',
    feePolicy: {
      networkFeeMicros: 500_000, // 0.50 USDT
      platformFeeBps: DEFAULT_PLATFORM_FEE_BPS, // 1%
      platformFeeMinMicros: 0,
      conversionFeeMicros: 0,
    },
    configVersion: 1,
    updatedAt: '2026-11-18T00:00:00.000Z',
  },
  {
    id: 'usdt-polygon',
    asset: 'USDT',
    networkCode: 'POLYGON',
    network: 'Polygon POS (ERC-20)',
    tokenStandard: 'Polygon',
    enabled: true,
    minimumWithdrawalMicros: MIN_WITHDRAWAL_MICROS,
    requiredConfirmations: 64,
    explorerTxUrlTemplate: 'https://polygonscan.com/tx/{txHash}',
    addressType: 'EVM',
    feePolicy: {
      networkFeeMicros: 800_000, // 0.80 USDT
      platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
      platformFeeMinMicros: 0,
      conversionFeeMicros: 0,
    },
    configVersion: 1,
    updatedAt: '2026-11-18T00:00:00.000Z',
  },
  {
    id: 'usdt-tron',
    asset: 'USDT',
    networkCode: 'TRON',
    network: 'Tron (TRC-20)',
    tokenStandard: 'TRC-20',
    enabled: true,
    minimumWithdrawalMicros: MIN_WITHDRAWAL_MICROS,
    requiredConfirmations: 20,
    explorerTxUrlTemplate: 'https://tronscan.org/#/transaction/{txHash}',
    addressType: 'TRON',
    feePolicy: {
      networkFeeMicros: 1_000_000, // 1.00 USDT
      platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
      platformFeeMinMicros: 0,
      conversionFeeMicros: 0,
    },
    configVersion: 1,
    updatedAt: '2026-11-18T00:00:00.000Z',
  },
  {
    id: 'usdt-solana',
    asset: 'USDT',
    networkCode: 'SOLANA',
    network: 'Solana (SPL)',
    tokenStandard: 'SPL',
    enabled: true,
    minimumWithdrawalMicros: MIN_WITHDRAWAL_MICROS,
    requiredConfirmations: 32,
    explorerTxUrlTemplate: 'https://solscan.io/tx/{txHash}',
    addressType: 'SOLANA',
    feePolicy: {
      networkFeeMicros: 600_000, // 0.60 USDT
      platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
      platformFeeMinMicros: 0,
      conversionFeeMicros: 0,
    },
    configVersion: 1,
    updatedAt: '2026-11-18T00:00:00.000Z',
  },
  {
    id: 'usdt-ethereum',
    asset: 'USDT',
    networkCode: 'ETHEREUM',
    network: 'Ethereum (ERC-20)',
    tokenStandard: 'ERC-20',
    enabled: true,
    minimumWithdrawalMicros: MIN_WITHDRAWAL_MICROS,
    requiredConfirmations: 12,
    explorerTxUrlTemplate: 'https://etherscan.io/tx/{txHash}',
    addressType: 'EVM',
    feePolicy: {
      networkFeeMicros: 3_500_000, // 3.50 USDT
      platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
      platformFeeMinMicros: 0,
      conversionFeeMicros: 0,
    },
    configVersion: 1,
    updatedAt: '2026-11-18T00:00:00.000Z',
  },
] as const;

// ============================================================================
// 5. CORE FIRESTORE DOCUMENT & API DTO INTERFACES
// ============================================================================

/**
 * `/userBalances/{uid}` — Private server-authoritative financial balance (Decision 1).
 * Client writes are forbidden (`allow write: if false`).
 */
export interface UserFinancialBalance {
  uid: string;
  email: string;
  membershipTier: MembershipTier;
  availableBalanceMicros: number;
  lockedBalanceMicros: number;
  totalWithdrawnMicros: number;
  version: number;
  updatedAt: string;
}

/**
 * `/withdrawalRequests/{withdrawalId}` — Single source of truth for withdrawal lifecycle.
 */
export interface WithdrawalRequest {
  id: string;
  userId: string;
  userEmail: string;
  asset: WithdrawalAsset;
  networkId: string;
  network: WithdrawalNetworkCode;
  networkDisplayName: string;
  addressType: WithdrawalAddressType;
  destinationAddress: string;

  // Exact micro-USDT amounts (1 USDT = 1,000,000 micros)
  requestedAmountMicros: number;
  networkFeeMicros: number;
  platformFeeMicros: number;
  conversionFeeMicros: number;
  totalDebitMicros: number;
  netAmountMicros: number;

  status: WithdrawalStatus;
  membershipTierSnapshot: MembershipTier;
  slaDisplaySnapshot: string;

  confirmations: number;
  requiredConfirmations: number;

  txHash?: string;
  explorerTxUrl?: string;
  providerTransactionId?: string;
  internalNotes?: string;

  reviewedBy?: string;
  approvedBy?: string;
  processedBy?: string;
  broadcastedBy?: string;
  completedBy?: string;
  rejectedBy?: string;
  cancelledBy?: string;
  rejectionReason?: string;
  cancellationReason?: string;

  idempotencyKey: string;
  configVersion: number;

  requestedAt: string;
  reviewedAt?: string;
  approvedAt?: string;
  processingAt?: string;
  broadcastedAt?: string;
  completedAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const FINANCIAL_LEDGER_ENTRY_TYPES = [
  'WITHDRAWAL_LOCK',
  'WITHDRAWAL_UNLOCK',
  'WITHDRAWAL',
] as const;
export type FinancialLedgerEntryType = (typeof FINANCIAL_LEDGER_ENTRY_TYPES)[number];

export type FinancialLedgerDirection = 'DEBIT' | 'CREDIT';

/**
 * `/financialLedger/{ledgerEntryId}` — Immutable double-entry financial ledger record.
 */
export interface FinancialLedgerEntry {
  id: string;
  userId: string;
  withdrawalId: string;
  type: FinancialLedgerEntryType;
  direction: FinancialLedgerDirection;
  currency: WithdrawalAsset;
  amountMicros: number;
  balanceBeforeMicros: number;
  balanceAfterMicros: number;
  lockedBeforeMicros: number;
  lockedAfterMicros: number;
  referenceType: 'WITHDRAWAL_REQUEST';
  referenceId: string;
  idempotencyKey: string;
  createdAt: string;
}

/**
 * `/withdrawalAuditEvents/{eventId}` — Immutable administrative audit trail.
 */
export interface WithdrawalAuditEvent {
  id: string;
  withdrawalId: string;
  operatorUid: string;
  operatorEmail: string;
  action: WithdrawalAuditAction;
  previousStatus?: WithdrawalStatus;
  newStatus: WithdrawalStatus;
  previousValues?: Record<string, unknown>;
  changedValues?: Record<string, unknown>;
  reason?: string;
  createdAt: string;
}

// ============================================================================
// 6. REQUEST / RESPONSE DTOs FOR CLIENT & ADMIN APIs
// ============================================================================

export interface WithdrawalConfigResponseDto {
  ok: true;
  asset: WithdrawalAsset;
  minimumWithdrawalMicros: number;
  minimumWithdrawalUsdt: number;
  networks: WithdrawalNetworkConfig[];
  userBalance: {
    uid: string;
    availableBalanceMicros: number;
    lockedBalanceMicros: number;
    totalWithdrawnMicros: number;
    availableBalanceUsdt: number;
    membershipTier: MembershipTier;
  };
  slaPolicy: WithdrawalSlaPolicy;
}

export interface WithdrawalQuoteRequestDto {
  networkId: string;
  requestedAmountMicros?: number;
  mode?: 'EXACT_AMOUNT' | 'MAX_AVAILABLE';
  destinationAddress?: string;
}

export interface WithdrawalQuoteResponseDto {
  asset: WithdrawalAsset;
  networkId: string;
  networkCode: WithdrawalNetworkCode;
  networkDisplayName: string;
  addressType: WithdrawalAddressType;
  minimumWithdrawalMicros: number;
  requestedAmountMicros: number;
  networkFeeMicros: number;
  platformFeeMicros: number;
  conversionFeeMicros: number;
  totalFeesMicros: number;
  totalDebitMicros: number;
  netAmountMicros: number;
  requiredConfirmations: number;
  configVersion: number;
  meetsMinimum: boolean;
  withinAvailableBalance: boolean;
  availableBalanceMicros?: number;
  slaPolicy?: WithdrawalSlaPolicy;
  addressValidation?: {
    valid: boolean;
    normalizedAddress: string;
    reason?: string;
  };
  validationMessage?: string;
  validationFaultCode?: string;
}

export interface CreateWithdrawalRequestDto {
  networkId: string;
  destinationAddress: string;
  requestedAmountMicros: number;
  idempotencyKey: string;
}

export interface AdminReviewWithdrawalDto {
  expectedStatus: WithdrawalStatus;
  reason?: string;
}

export interface AdminApproveWithdrawalDto {
  expectedStatus: WithdrawalStatus;
  reason?: string;
}

export interface AdminRejectWithdrawalDto {
  expectedStatus: WithdrawalStatus;
  rejectionReason: string;
}

export interface AdminCancelWithdrawalDto {
  expectedStatus: WithdrawalStatus;
  cancellationReason: string;
}

export interface AdminProcessWithdrawalDto {
  expectedStatus: WithdrawalStatus;
  providerTransactionId?: string;
  reason?: string;
}

export interface AdminBroadcastWithdrawalDto {
  expectedStatus: WithdrawalStatus;
  txHash: string;
  confirmations?: number;
  providerTransactionId?: string;
}

export interface AdminCompleteWithdrawalDto {
  expectedStatus: WithdrawalStatus;
  confirmations: number;
  reason?: string;
}

export interface AdminEditWithdrawalDto {
  expectedStatus: WithdrawalStatus;
  destinationAddress?: string;
  networkId?: string;
  internalNotes?: string;
  reason: string;
}

export interface AdminWithdrawalsQueryFilter {
  status?: WithdrawalStatus | 'ALL';
  network?: WithdrawalNetworkCode | 'ALL';
  membershipTier?: MembershipTier | 'ALL';
  searchQuery?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

export interface AdminWithdrawalKpiSummary {
  pendingReviewCount: number;
  lockedAmountMicros: number;
  processingAndBroadcastedCount: number;
  completedCount: number;
  totalSettledAmountMicros: number;
  rejectedOrCancelledCount: number;
}

export interface PaginatedWithdrawalsResponse {
  items: WithdrawalRequest[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ============================================================================
// 7. PURE DETERMINISTIC ARITHMETIC, VALIDATION & QUOTE HELPERS
// ============================================================================

export function isValidMicrosInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Converts a human USDT decimal value (number or string with up to 6 decimals)
 * into an exact integer in micro-USDT without IEEE-754 floating-point drift.
 */
export function usdtToMicros(amountUsdt: number | string): number {
  const raw = typeof amountUsdt === 'number' ? String(amountUsdt) : amountUsdt.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(raw)) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'INVALID_USDT_AMOUNT',
      httpStatus: 400,
      message: `"${String(amountUsdt)}" must be a non-negative number with at most 6 decimal places.`,
    });
  }
  const [wholePart, fracPart = ''] = raw.split('.');
  const paddedFrac = fracPart.padEnd(6, '0');
  const micros = Number(wholePart) * MICRO_USDT_SCALE + Number(paddedFrac);
  if (!Number.isSafeInteger(micros) || micros < 0) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'INVALID_USDT_MICROS_OVERFLOW',
      httpStatus: 400,
      message: `"${String(amountUsdt)}" exceeds safe integer bounds.`,
    });
  }
  return micros;
}

/**
 * Converts micro-USDT integer to standard decimal USDT number.
 */
export function microsToUsdt(amountMicros: number): number {
  if (!isValidMicrosInteger(amountMicros)) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'INVALID_MICROS_INTEGER',
      httpStatus: 400,
      message: `"${String(amountMicros)}" must be a non-negative safe integer.`,
    });
  }
  return amountMicros / MICRO_USDT_SCALE;
}

/**
 * Formats micro-USDT integer as a fixed decimal string (default 2 decimals, up to 6).
 */
export function formatMicrosAsUsdt(amountMicros: number, fractionDigits = 2): string {
  if (!isValidMicrosInteger(amountMicros)) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'INVALID_MICROS_INTEGER',
      httpStatus: 400,
      message: `"${String(amountMicros)}" must be a non-negative safe integer.`,
    });
  }
  return (amountMicros / MICRO_USDT_SCALE).toFixed(fractionDigits);
}

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TRON_ADDRESS_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function validateDestinationAddress(
  address: string,
  addressType: WithdrawalAddressType,
): { valid: boolean; normalizedAddress: string; reason?: string } {
  const trimmed = typeof address === 'string' ? address.trim() : '';
  if (!trimmed) {
    return {
      valid: false,
      normalizedAddress: '',
      reason: 'La dirección de destino es obligatoria.',
    };
  }

  switch (addressType) {
    case 'EVM':
      if (!EVM_ADDRESS_REGEX.test(trimmed)) {
        return {
          valid: false,
          normalizedAddress: trimmed,
          reason: 'Dirección EVM inválida: debe iniciar con 0x seguido de 40 caracteres hexadecimales.',
        };
      }
      return { valid: true, normalizedAddress: trimmed };
    case 'TRON':
      if (!TRON_ADDRESS_REGEX.test(trimmed)) {
        return {
          valid: false,
          normalizedAddress: trimmed,
          reason: 'Dirección TRON (TRC-20) inválida: debe iniciar con T y tener 34 caracteres Base58.',
        };
      }
      return { valid: true, normalizedAddress: trimmed };
    case 'SOLANA':
      if (!SOLANA_ADDRESS_REGEX.test(trimmed)) {
        return {
          valid: false,
          normalizedAddress: trimmed,
          reason: 'Dirección Solana inválida: debe contener entre 32 y 44 caracteres Base58.',
        };
      }
      return { valid: true, normalizedAddress: trimmed };
    default:
      return {
        valid: false,
        normalizedAddress: trimmed,
        reason: `Tipo de dirección no soportado: ${String(addressType)}`,
      };
  }
}

const EVM_TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const TRON_TX_HASH_REGEX = /^[a-fA-F0-9]{64}$/;
const SOLANA_TX_HASH_REGEX = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

/**
 * Validates a real on-chain transaction hash by network family.
 * Explicitly blocks empty strings or short synthetic random strings.
 */
export function validateBlockchainTxHash(
  txHash: string,
  addressType: WithdrawalAddressType,
): { valid: boolean; normalizedTxHash: string; reason?: string } {
  const trimmed = typeof txHash === 'string' ? txHash.trim() : '';
  if (!trimmed) {
    return {
      valid: false,
      normalizedTxHash: '',
      reason: 'El txHash real on-chain es obligatorio para registrar broadcast.',
    };
  }

  switch (addressType) {
    case 'EVM':
      if (!EVM_TX_HASH_REGEX.test(trimmed)) {
        return {
          valid: false,
          normalizedTxHash: trimmed,
          reason: 'txHash EVM inválido: debe iniciar con 0x seguido de exactamente 64 caracteres hexadecimales.',
        };
      }
      return { valid: true, normalizedTxHash: trimmed };
    case 'TRON':
      if (!TRON_TX_HASH_REGEX.test(trimmed)) {
        return {
          valid: false,
          normalizedTxHash: trimmed,
          reason: 'txHash TRON inválido: debe contener exactamente 64 caracteres hexadecimales.',
        };
      }
      return { valid: true, normalizedTxHash: trimmed };
    case 'SOLANA':
      if (!SOLANA_TX_HASH_REGEX.test(trimmed)) {
        return {
          valid: false,
          normalizedTxHash: trimmed,
          reason: 'Firma de transacción Solana inválida: debe tener entre 64 y 88 caracteres Base58.',
        };
      }
      return { valid: true, normalizedTxHash: trimmed };
    default:
      return {
        valid: false,
        normalizedTxHash: trimmed,
        reason: `Tipo de red no soportado para validar txHash: ${String(addressType)}`,
      };
  }
}

export function calculatePlatformFeeMicros(
  requestedAmountMicros: number,
  feePolicy: WithdrawalFeePolicy,
): number {
  if (!isValidMicrosInteger(requestedAmountMicros) || requestedAmountMicros <= 0) {
    return 0;
  }
  const proportionalFee = Math.round((requestedAmountMicros * feePolicy.platformFeeBps) / 10_000);
  return Math.max(proportionalFee, feePolicy.platformFeeMinMicros);
}

/**
 * Server-authoritative fee & total debit calculator.
 * Total Debit = requestedAmountMicros + networkFeeMicros + platformFeeMicros + conversionFeeMicros.
 * Net Amount received at destination = requestedAmountMicros.
 */
export function calculateWithdrawalQuote(
  requestedAmountMicros: number,
  networkConfig: WithdrawalNetworkConfig,
  availableBalanceMicros?: number,
): WithdrawalQuoteResponseDto {
  if (!networkConfig || !networkConfig.enabled || networkConfig.asset !== WITHDRAWAL_ASSET) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'WITHDRAWAL_NETWORK_UNAVAILABLE',
      httpStatus: 404,
      message: 'La red seleccionada no está habilitada para USDT.',
    });
  }
  if (!isValidMicrosInteger(requestedAmountMicros)) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'INVALID_REQUESTED_AMOUNT',
      httpStatus: 400,
      message: 'El monto solicitado debe ser un entero válido en micro-USDT.',
    });
  }

  const minMicros = Math.max(networkConfig.minimumWithdrawalMicros, MIN_WITHDRAWAL_MICROS);
  const networkFeeMicros = networkConfig.feePolicy.networkFeeMicros;
  const platformFeeMicros = calculatePlatformFeeMicros(requestedAmountMicros, networkConfig.feePolicy);
  const conversionFeeMicros = networkConfig.feePolicy.conversionFeeMicros;
  const totalFeesMicros = networkFeeMicros + platformFeeMicros + conversionFeeMicros;
  const totalDebitMicros = requestedAmountMicros > 0 ? requestedAmountMicros + totalFeesMicros : 0;
  const netAmountMicros = requestedAmountMicros;

  const meetsMinimum = requestedAmountMicros >= minMicros;
  const withinAvailableBalance =
    typeof availableBalanceMicros === 'number'
      ? totalDebitMicros > 0 && totalDebitMicros <= availableBalanceMicros
      : true;

  let validationMessage: string | undefined;
  let validationFaultCode: string | undefined;
  if (!meetsMinimum) {
    validationMessage = `El retiro mínimo es de ${formatMicrosAsUsdt(minMicros)} USDT.`;
    validationFaultCode = formatWithdrawalFaultCode(
      'W03',
      'QUOTE',
      'MINIMUM_WITHDRAWAL_NOT_MET',
      422,
    );
  } else if (!withinAvailableBalance) {
    validationMessage = 'Saldo disponible insuficiente para cubrir el monto solicitado más las comisiones de red y plataforma.';
    validationFaultCode = formatWithdrawalFaultCode(
      'W03',
      'QUOTE',
      'INSUFFICIENT_AVAILABLE_BALANCE',
      422,
    );
  }

  return {
    asset: WITHDRAWAL_ASSET,
    networkId: networkConfig.id,
    networkCode: networkConfig.networkCode,
    networkDisplayName: networkConfig.network,
    addressType: networkConfig.addressType,
    minimumWithdrawalMicros: minMicros,
    requestedAmountMicros,
    networkFeeMicros,
    platformFeeMicros,
    conversionFeeMicros,
    totalFeesMicros,
    totalDebitMicros,
    netAmountMicros,
    requiredConfirmations: networkConfig.requiredConfirmations,
    configVersion: networkConfig.configVersion,
    meetsMinimum,
    withinAvailableBalance,
    ...(typeof availableBalanceMicros === 'number' ? { availableBalanceMicros } : {}),
    validationMessage,
    ...(validationFaultCode ? { validationFaultCode } : {}),
  };
}

/**
 * Authoritative MAX withdrawal calculator ensuring:
 * requestedAmountMicros + networkFeeMicros + platformFeeMicros + conversionFeeMicros <= availableBalanceMicros.
 */
export function calculateMaxWithdrawableMicros(
  availableBalanceMicros: number,
  networkConfig: WithdrawalNetworkConfig,
): WithdrawalQuoteResponseDto {
  if (!isValidMicrosInteger(availableBalanceMicros)) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'INVALID_AVAILABLE_BALANCE',
      httpStatus: 400,
      message: 'El saldo disponible debe ser un entero en micro-USDT.',
    });
  }

  const fixedFees =
    networkConfig.feePolicy.networkFeeMicros + networkConfig.feePolicy.conversionFeeMicros;
  if (availableBalanceMicros <= fixedFees) {
    return calculateWithdrawalQuote(0, networkConfig, availableBalanceMicros);
  }

  const distributable = availableBalanceMicros - fixedFees;
  const bps = networkConfig.feePolicy.platformFeeBps;
  // Solve: requested + round(requested * bps / 10000) <= distributable
  let candidate = Math.floor((distributable * 10_000) / (10_000 + bps));

  while (candidate > 0) {
    const platformFee = calculatePlatformFeeMicros(candidate, networkConfig.feePolicy);
    if (candidate + fixedFees + platformFee <= availableBalanceMicros) {
      break;
    }
    candidate -= 1;
  }

  if (candidate < 0) {
    candidate = 0;
  }

  return calculateWithdrawalQuote(candidate, networkConfig, availableBalanceMicros);
}

// ============================================================================
// 8. COUPLED DOMAIN STATE & ACCOUNTING EVALUATORS (SERVER-AUTHORITATIVE)
// ============================================================================

export interface AtomicWithdrawalLockResult {
  updatedBalance: UserFinancialBalance;
  syncedUserBalanceUsdt: number;
  withdrawalRequest: WithdrawalRequest;
  ledgerEntry: FinancialLedgerEntry;
  auditEvent: WithdrawalAuditEvent;
}

/**
 * Evaluates a new client withdrawal request atomically:
 * - Validates network, address format, minimum 10 USDT, and sufficient availableBalanceMicros.
 * - Decrements availableBalanceMicros and increments lockedBalanceMicros by totalDebitMicros.
 * - Computes syncedUserBalanceUsdt for `/users/{uid}.balance` (Decision 1 compatibility with SCRUM-221).
 * - Creates the `REQUESTED` withdrawal document, `WITHDRAWAL_LOCK` ledger entry, and `CREATE` audit event.
 */
export function applyAtomicWithdrawalLock(
  balance: UserFinancialBalance,
  input: CreateWithdrawalRequestDto,
  networkConfig: WithdrawalNetworkConfig,
  context: {
    withdrawalId: string;
    ledgerEntryId: string;
    auditEventId: string;
    nowIso: string;
  },
): AtomicWithdrawalLockResult {
  if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'INVALID_IDEMPOTENCY_KEY',
      httpStatus: 400,
      message: 'Se requiere una clave de idempotencia válida.',
    });
  }

  const addrValidation = validateDestinationAddress(
    input.destinationAddress,
    networkConfig.addressType,
  );
  if (!addrValidation.valid) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'INVALID_DESTINATION_ADDRESS',
      httpStatus: 422,
      message: addrValidation.reason || 'Dirección de destino inválida.',
    });
  }

  const quote = calculateWithdrawalQuote(
    input.requestedAmountMicros,
    networkConfig,
    balance.availableBalanceMicros,
  );

  if (!quote.meetsMinimum) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'MINIMUM_WITHDRAWAL_NOT_MET',
      httpStatus: 422,
      message: quote.validationMessage || 'No alcanza el mínimo de retiro.',
    });
  }
  if (!quote.withinAvailableBalance) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'INSUFFICIENT_AVAILABLE_BALANCE',
      httpStatus: 422,
      message: quote.validationMessage || 'Saldo disponible insuficiente.',
    });
  }

  const balanceBeforeMicros = balance.availableBalanceMicros;
  const lockedBeforeMicros = balance.lockedBalanceMicros;
  const balanceAfterMicros = balanceBeforeMicros - quote.totalDebitMicros;
  const lockedAfterMicros = lockedBeforeMicros + quote.totalDebitMicros;

  const updatedBalance: UserFinancialBalance = {
    ...balance,
    availableBalanceMicros: balanceAfterMicros,
    lockedBalanceMicros: lockedAfterMicros,
    version: balance.version + 1,
    updatedAt: context.nowIso,
  };

  const slaPolicy = resolveMembershipSlaPolicy(balance.membershipTier);

  const withdrawalRequest: WithdrawalRequest = {
    id: context.withdrawalId,
    userId: balance.uid,
    userEmail: balance.email,
    asset: WITHDRAWAL_ASSET,
    networkId: networkConfig.id,
    network: networkConfig.networkCode,
    networkDisplayName: networkConfig.network,
    addressType: networkConfig.addressType,
    destinationAddress: addrValidation.normalizedAddress,
    requestedAmountMicros: quote.requestedAmountMicros,
    networkFeeMicros: quote.networkFeeMicros,
    platformFeeMicros: quote.platformFeeMicros,
    conversionFeeMicros: quote.conversionFeeMicros,
    totalDebitMicros: quote.totalDebitMicros,
    netAmountMicros: quote.netAmountMicros,
    status: 'REQUESTED',
    membershipTierSnapshot: balance.membershipTier,
    slaDisplaySnapshot: slaPolicy.displayLabel,
    confirmations: 0,
    requiredConfirmations: quote.requiredConfirmations,
    idempotencyKey: input.idempotencyKey.trim(),
    configVersion: quote.configVersion,
    requestedAt: context.nowIso,
    createdAt: context.nowIso,
    updatedAt: context.nowIso,
  };

  const ledgerEntry: FinancialLedgerEntry = {
    id: context.ledgerEntryId,
    userId: balance.uid,
    withdrawalId: context.withdrawalId,
    type: 'WITHDRAWAL_LOCK',
    direction: 'DEBIT',
    currency: WITHDRAWAL_ASSET,
    amountMicros: quote.totalDebitMicros,
    balanceBeforeMicros,
    balanceAfterMicros,
    lockedBeforeMicros,
    lockedAfterMicros,
    referenceType: 'WITHDRAWAL_REQUEST',
    referenceId: context.withdrawalId,
    idempotencyKey: `${input.idempotencyKey.trim()}:LOCK`,
    createdAt: context.nowIso,
  };

  const auditEvent: WithdrawalAuditEvent = {
    id: context.auditEventId,
    withdrawalId: context.withdrawalId,
    operatorUid: balance.uid,
    operatorEmail: balance.email,
    action: 'CREATE',
    newStatus: 'REQUESTED',
    changedValues: {
      requestedAmountMicros: quote.requestedAmountMicros,
      totalDebitMicros: quote.totalDebitMicros,
      network: networkConfig.networkCode,
      destinationAddress: addrValidation.normalizedAddress,
    },
    createdAt: context.nowIso,
  };

  return {
    updatedBalance,
    syncedUserBalanceUsdt: microsToUsdt(balanceAfterMicros),
    withdrawalRequest,
    ledgerEntry,
    auditEvent,
  };
}

export interface AdminWorkflowTransitionContext {
  operatorUid: string;
  operatorEmail: string;
  grantedPermissions: readonly string[];
  auditEventId: string;
  ledgerEntryId?: string;
  nowIso: string;
}

export interface AdminWorkflowTransitionResult {
  withdrawalRequest: WithdrawalRequest;
  updatedBalance?: UserFinancialBalance;
  syncedUserBalanceUsdt?: number;
  ledgerEntry?: FinancialLedgerEntry;
  auditEvent: WithdrawalAuditEvent;
}

/**
 * Evaluates and applies an administrative workflow action (`REVIEW`, `APPROVE`, `PROCESS`,
 * `EDIT`, `BROADCAST`, `COMPLETE`, `REJECT`, `CANCEL`) with:
 * - Strict granular RBAC check
 * - Expected status concurrency check
 * - Pre-broadcast immutability enforcement
 * - Real txHash format validation on BROADCAST
 * - Confirmations threshold enforcement (`confirmations >= requiredConfirmations`) on COMPLETE
 * - Deterministic fund unlock (`LOCKED -> AVAILABLE` + `WITHDRAWAL_UNLOCK`) on REJECT / CANCEL
 * - Deterministic settlement (`LOCKED` consumed + `totalWithdrawnMicros` incremented + `WITHDRAWAL`) on COMPLETE
 */
export function applyAdminWithdrawalAction(
  currentRequest: WithdrawalRequest,
  currentBalance: UserFinancialBalance,
  actionInput:
    | { action: 'REVIEW'; dto: AdminReviewWithdrawalDto }
    | { action: 'APPROVE'; dto: AdminApproveWithdrawalDto }
    | { action: 'PROCESS'; dto: AdminProcessWithdrawalDto }
    | { action: 'EDIT'; dto: AdminEditWithdrawalDto; targetNetworkConfig?: WithdrawalNetworkConfig }
    | { action: 'BROADCAST'; dto: AdminBroadcastWithdrawalDto }
    | { action: 'COMPLETE'; dto: AdminCompleteWithdrawalDto }
    | { action: 'REJECT'; dto: AdminRejectWithdrawalDto }
    | { action: 'CANCEL'; dto: AdminCancelWithdrawalDto },
  context: AdminWorkflowTransitionContext,
): AdminWorkflowTransitionResult {
  const requiredPerm = REQUIRED_PERMISSION_BY_AUDIT_ACTION[actionInput.action];
  if (!hasWithdrawalPermission(context.grantedPermissions, requiredPerm)) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'FORBIDDEN_WITHDRAWAL_PERMISSION',
      httpStatus: 403,
      message: `Operador "${context.operatorUid}" carece del permiso requerido "${requiredPerm}".`,
    });
  }

  if (currentRequest.status !== actionInput.dto.expectedStatus) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'CONCURRENCY_STATUS_MISMATCH',
      httpStatus: 409,
      message: `Se esperaba estado "${actionInput.dto.expectedStatus}" pero la solicitud está en "${currentRequest.status}".`,
    });
  }

  // Handle EDIT action (stays in same pre-broadcast status)
  if (actionInput.action === 'EDIT') {
    if (isStatusFrozenForFinancialEdits(currentRequest.status)) {
      throw new WithdrawalModuleError({
        originTask: 'W01',
        originModule: 'DOMAIN',
        code: 'IMMUTABLE_BROADCASTED_WITHDRAWAL',
        httpStatus: 409,
        message: `No se permite editar campos en estado "${currentRequest.status}".`,
      });
    }
    const reason = actionInput.dto.reason?.trim();
    if (!reason) {
      throw new WithdrawalModuleError({
        originTask: 'W01',
        originModule: 'DOMAIN',
        code: 'EDIT_REASON_REQUIRED',
        httpStatus: 422,
        message: 'Debe especificar un motivo de auditoría para editar la solicitud.',
      });
    }

    const previousValues: Record<string, unknown> = {};
    const changedValues: Record<string, unknown> = {};
    let nextAddress = currentRequest.destinationAddress;
    let nextNotes = currentRequest.internalNotes;

    if (
      typeof actionInput.dto.destinationAddress === 'string' &&
      actionInput.dto.destinationAddress.trim() !== currentRequest.destinationAddress
    ) {
      const targetAddrType =
        actionInput.targetNetworkConfig?.addressType ?? currentRequest.addressType;
      const validation = validateDestinationAddress(
        actionInput.dto.destinationAddress,
        targetAddrType,
      );
      if (!validation.valid) {
        throw new WithdrawalModuleError({
          originTask: 'W01',
          originModule: 'DOMAIN',
          code: 'INVALID_DESTINATION_ADDRESS',
          httpStatus: 422,
          message: validation.reason || 'Dirección inválida.',
        });
      }
      previousValues.destinationAddress = currentRequest.destinationAddress;
      changedValues.destinationAddress = validation.normalizedAddress;
      nextAddress = validation.normalizedAddress;
    }

    if (
      typeof actionInput.dto.internalNotes === 'string' &&
      actionInput.dto.internalNotes !== currentRequest.internalNotes
    ) {
      previousValues.internalNotes = currentRequest.internalNotes ?? null;
      changedValues.internalNotes = actionInput.dto.internalNotes;
      nextNotes = actionInput.dto.internalNotes;
    }

    const updatedRequest: WithdrawalRequest = {
      ...currentRequest,
      destinationAddress: nextAddress,
      internalNotes: nextNotes,
      updatedAt: context.nowIso,
    };

    const auditEvent: WithdrawalAuditEvent = {
      id: context.auditEventId,
      withdrawalId: currentRequest.id,
      operatorUid: context.operatorUid,
      operatorEmail: context.operatorEmail,
      action: 'EDIT',
      previousStatus: currentRequest.status,
      newStatus: currentRequest.status,
      previousValues,
      changedValues,
      reason,
      createdAt: context.nowIso,
    };

    return { withdrawalRequest: updatedRequest, auditEvent };
  }

  // Map action to target status
  const targetStatusMap: Record<
    Exclude<typeof actionInput.action, 'EDIT'>,
    WithdrawalStatus
  > = {
    REVIEW: 'UNDER_REVIEW',
    APPROVE: 'APPROVED',
    PROCESS: 'PROCESSING',
    BROADCAST: 'BROADCASTED',
    COMPLETE: 'COMPLETED',
    REJECT: 'REJECTED',
    CANCEL: 'CANCELLED',
  };

  const targetStatus = targetStatusMap[actionInput.action];
  assertValidWithdrawalTransition(currentRequest.status, targetStatus);

  if (actionInput.action === 'REVIEW') {
    const updatedRequest: WithdrawalRequest = {
      ...currentRequest,
      status: 'UNDER_REVIEW',
      reviewedBy: context.operatorUid,
      reviewedAt: context.nowIso,
      updatedAt: context.nowIso,
    };
    return {
      withdrawalRequest: updatedRequest,
      auditEvent: {
        id: context.auditEventId,
        withdrawalId: currentRequest.id,
        operatorUid: context.operatorUid,
        operatorEmail: context.operatorEmail,
        action: 'REVIEW',
        previousStatus: currentRequest.status,
        newStatus: 'UNDER_REVIEW',
        reason: actionInput.dto.reason,
        createdAt: context.nowIso,
      },
    };
  }

  if (actionInput.action === 'APPROVE') {
    const updatedRequest: WithdrawalRequest = {
      ...currentRequest,
      status: 'APPROVED',
      approvedBy: context.operatorUid,
      approvedAt: context.nowIso,
      updatedAt: context.nowIso,
    };
    return {
      withdrawalRequest: updatedRequest,
      auditEvent: {
        id: context.auditEventId,
        withdrawalId: currentRequest.id,
        operatorUid: context.operatorUid,
        operatorEmail: context.operatorEmail,
        action: 'APPROVE',
        previousStatus: currentRequest.status,
        newStatus: 'APPROVED',
        reason: actionInput.dto.reason,
        createdAt: context.nowIso,
      },
    };
  }

  if (actionInput.action === 'PROCESS') {
    const updatedRequest: WithdrawalRequest = {
      ...currentRequest,
      status: 'PROCESSING',
      processedBy: context.operatorUid,
      processingAt: context.nowIso,
      providerTransactionId:
        actionInput.dto.providerTransactionId ?? currentRequest.providerTransactionId,
      updatedAt: context.nowIso,
    };
    return {
      withdrawalRequest: updatedRequest,
      auditEvent: {
        id: context.auditEventId,
        withdrawalId: currentRequest.id,
        operatorUid: context.operatorUid,
        operatorEmail: context.operatorEmail,
        action: 'PROCESS',
        previousStatus: currentRequest.status,
        newStatus: 'PROCESSING',
        reason: actionInput.dto.reason,
        createdAt: context.nowIso,
      },
    };
  }

  if (actionInput.action === 'BROADCAST') {
    const txValidation = validateBlockchainTxHash(
      actionInput.dto.txHash,
      currentRequest.addressType,
    );
    if (!txValidation.valid) {
      throw new WithdrawalModuleError({
        originTask: 'W01',
        originModule: 'DOMAIN',
        code: 'INVALID_TX_HASH',
        httpStatus: 422,
        message: txValidation.reason || 'txHash inválido.',
      });
    }
    const observedConfirmations = actionInput.dto.confirmations ?? 0;
    if (!Number.isSafeInteger(observedConfirmations) || observedConfirmations < 0) {
      throw new WithdrawalModuleError({
        originTask: 'W01',
        originModule: 'DOMAIN',
        code: 'INVALID_CONFIRMATIONS',
        httpStatus: 422,
        message: 'El conteo de confirmaciones debe ser un entero >= 0.',
      });
    }

    const updatedRequest: WithdrawalRequest = {
      ...currentRequest,
      status: 'BROADCASTED',
      txHash: txValidation.normalizedTxHash,
      confirmations: observedConfirmations,
      broadcastedBy: context.operatorUid,
      broadcastedAt: context.nowIso,
      providerTransactionId:
        actionInput.dto.providerTransactionId ?? currentRequest.providerTransactionId,
      updatedAt: context.nowIso,
    };

    return {
      withdrawalRequest: updatedRequest,
      auditEvent: {
        id: context.auditEventId,
        withdrawalId: currentRequest.id,
        operatorUid: context.operatorUid,
        operatorEmail: context.operatorEmail,
        action: 'BROADCAST',
        previousStatus: currentRequest.status,
        newStatus: 'BROADCASTED',
        changedValues: {
          txHash: txValidation.normalizedTxHash,
          confirmations: observedConfirmations,
          requiredConfirmations: currentRequest.requiredConfirmations,
        },
        createdAt: context.nowIso,
      },
    };
  }

  if (actionInput.action === 'REJECT' || actionInput.action === 'CANCEL') {
    const rawReason =
      actionInput.action === 'REJECT'
        ? actionInput.dto.rejectionReason
        : actionInput.dto.cancellationReason;
    const trimmedReason = typeof rawReason === 'string' ? rawReason.trim() : '';
    if (!trimmedReason) {
      throw new WithdrawalModuleError({
        originTask: 'W01',
        originModule: 'DOMAIN',
        code: 'REASON_REQUIRED',
        httpStatus: 422,
        message: 'Es obligatorio registrar el motivo para rechazar o cancelar un retiro.',
      });
    }
    if (!context.ledgerEntryId) {
      throw new WithdrawalModuleError({
        originTask: 'W01',
        originModule: 'DOMAIN',
        code: 'LEDGER_ENTRY_ID_REQUIRED',
        httpStatus: 500,
        message: 'Se requiere ledgerEntryId para registrar WITHDRAWAL_UNLOCK.',
      });
    }
    if (currentBalance.lockedBalanceMicros < currentRequest.totalDebitMicros) {
      throw new WithdrawalModuleError({
        originTask: 'W01',
        originModule: 'DOMAIN',
        code: 'LOCKED_BALANCE_UNDERFLOW',
        httpStatus: 409,
        message: 'El saldo bloqueado es menor que el totalDebitMicros de la solicitud.',
      });
    }

    const balanceBeforeMicros = currentBalance.availableBalanceMicros;
    const lockedBeforeMicros = currentBalance.lockedBalanceMicros;
    const balanceAfterMicros = balanceBeforeMicros + currentRequest.totalDebitMicros;
    const lockedAfterMicros = lockedBeforeMicros - currentRequest.totalDebitMicros;

    const updatedBalance: UserFinancialBalance = {
      ...currentBalance,
      availableBalanceMicros: balanceAfterMicros,
      lockedBalanceMicros: lockedAfterMicros,
      version: currentBalance.version + 1,
      updatedAt: context.nowIso,
    };

    const updatedRequest: WithdrawalRequest =
      actionInput.action === 'REJECT'
        ? {
            ...currentRequest,
            status: 'REJECTED',
            rejectedBy: context.operatorUid,
            rejectionReason: trimmedReason,
            rejectedAt: context.nowIso,
            updatedAt: context.nowIso,
          }
        : {
            ...currentRequest,
            status: 'CANCELLED',
            cancelledBy: context.operatorUid,
            cancellationReason: trimmedReason,
            cancelledAt: context.nowIso,
            updatedAt: context.nowIso,
          };

    const ledgerEntry: FinancialLedgerEntry = {
      id: context.ledgerEntryId,
      userId: currentRequest.userId,
      withdrawalId: currentRequest.id,
      type: 'WITHDRAWAL_UNLOCK',
      direction: 'CREDIT',
      currency: WITHDRAWAL_ASSET,
      amountMicros: currentRequest.totalDebitMicros,
      balanceBeforeMicros,
      balanceAfterMicros,
      lockedBeforeMicros,
      lockedAfterMicros,
      referenceType: 'WITHDRAWAL_REQUEST',
      referenceId: currentRequest.id,
      idempotencyKey: `${currentRequest.idempotencyKey}:UNLOCK`,
      createdAt: context.nowIso,
    };

    const auditEvent: WithdrawalAuditEvent = {
      id: context.auditEventId,
      withdrawalId: currentRequest.id,
      operatorUid: context.operatorUid,
      operatorEmail: context.operatorEmail,
      action: actionInput.action,
      previousStatus: currentRequest.status,
      newStatus: targetStatus,
      reason: trimmedReason,
      changedValues: {
        unlockedMicros: currentRequest.totalDebitMicros,
        availableBalanceAfterMicros: balanceAfterMicros,
      },
      createdAt: context.nowIso,
    };

    return {
      withdrawalRequest: updatedRequest,
      updatedBalance,
      syncedUserBalanceUsdt: microsToUsdt(balanceAfterMicros),
      ledgerEntry,
      auditEvent,
    };
  }

  // actionInput.action === 'COMPLETE'
  if (!currentRequest.txHash) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'MISSING_TX_HASH',
      httpStatus: 422,
      message: 'No se puede completar un retiro sin txHash registrado en BROADCASTED.',
    });
  }
  const finalConfirmations = actionInput.dto.confirmations;
  if (
    !Number.isSafeInteger(finalConfirmations) ||
    finalConfirmations < currentRequest.requiredConfirmations
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'INSUFFICIENT_CONFIRMATIONS',
      httpStatus: 422,
      message: `Se requieren al menos ${currentRequest.requiredConfirmations} confirmaciones (actual: ${String(finalConfirmations)}).`,
    });
  }
  if (!context.ledgerEntryId) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'LEDGER_ENTRY_ID_REQUIRED',
      httpStatus: 500,
      message: 'Se requiere ledgerEntryId para registrar WITHDRAWAL.',
    });
  }
  if (currentBalance.lockedBalanceMicros < currentRequest.totalDebitMicros) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'LOCKED_BALANCE_UNDERFLOW',
      httpStatus: 409,
      message: 'El saldo bloqueado es menor que el totalDebitMicros a liquidar.',
    });
  }

  const balanceBeforeMicros = currentBalance.availableBalanceMicros;
  const lockedBeforeMicros = currentBalance.lockedBalanceMicros;
  const balanceAfterMicros = balanceBeforeMicros; // Available was already decremented at lock time
  const lockedAfterMicros = lockedBeforeMicros - currentRequest.totalDebitMicros;
  const totalWithdrawnAfterMicros =
    currentBalance.totalWithdrawnMicros + currentRequest.requestedAmountMicros;

  const updatedBalance: UserFinancialBalance = {
    ...currentBalance,
    lockedBalanceMicros: lockedAfterMicros,
    totalWithdrawnMicros: totalWithdrawnAfterMicros,
    version: currentBalance.version + 1,
    updatedAt: context.nowIso,
  };

  const updatedRequest: WithdrawalRequest = {
    ...currentRequest,
    status: 'COMPLETED',
    confirmations: finalConfirmations,
    completedBy: context.operatorUid,
    completedAt: context.nowIso,
    updatedAt: context.nowIso,
  };

  const ledgerEntry: FinancialLedgerEntry = {
    id: context.ledgerEntryId,
    userId: currentRequest.userId,
    withdrawalId: currentRequest.id,
    type: 'WITHDRAWAL',
    direction: 'DEBIT',
    currency: WITHDRAWAL_ASSET,
    amountMicros: currentRequest.totalDebitMicros,
    balanceBeforeMicros,
    balanceAfterMicros,
    lockedBeforeMicros,
    lockedAfterMicros,
    referenceType: 'WITHDRAWAL_REQUEST',
    referenceId: currentRequest.id,
    idempotencyKey: `${currentRequest.idempotencyKey}:SETTLE`,
    createdAt: context.nowIso,
  };

  const auditEvent: WithdrawalAuditEvent = {
    id: context.auditEventId,
    withdrawalId: currentRequest.id,
    operatorUid: context.operatorUid,
    operatorEmail: context.operatorEmail,
    action: 'COMPLETE',
    previousStatus: 'BROADCASTED',
    newStatus: 'COMPLETED',
    reason: actionInput.dto.reason,
    changedValues: {
      confirmations: finalConfirmations,
      settledDebitMicros: currentRequest.totalDebitMicros,
      netPaidMicros: currentRequest.netAmountMicros,
      totalWithdrawnMicros: totalWithdrawnAfterMicros,
    },
    createdAt: context.nowIso,
  };

  return {
    withdrawalRequest: updatedRequest,
    updatedBalance,
    syncedUserBalanceUsdt: microsToUsdt(balanceAfterMicros),
    ledgerEntry,
    auditEvent,
  };
}
