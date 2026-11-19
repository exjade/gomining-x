/**
 * SCRUM-275 / SCRUM-289 / SCRUM-285 (W10)
 * Typed Admin HTTP Client for Immutable Ledger & Forensic Audit Timeline:
 * - `GET /api/admin/withdrawals/:withdrawalId/audit`
 *
 * Strictly requires `withdrawals.audit` on the server (`W02-AUTHZ-*` fail-closed).
 * Emits and propagates `W10-AUDIT-*` fault codes. Zero `localStorage` or mock fallback.
 */

import {
  WithdrawalModuleError,
  type FinancialLedgerEntry,
  type UserFinancialBalance,
  type WithdrawalAuditEvent,
  type WithdrawalModuleOrigin,
  type WithdrawalRequest,
  type WithdrawalTaskOrigin,
} from '../../types/withdrawal.js';
import type {
  AdminWithdrawalSession,
  AdminWithdrawalsApiClientOptions,
} from './adminWithdrawalsClient.js';

export interface DeterministicLedgerIdsDto {
  lockLedgerId: string;
  createAuditEventId: string;
  unlockLedgerId: string;
  settlementLedgerId: string;
}

export type ForensicTimelineSource = 'AUDIT_EVENT' | 'FINANCIAL_LEDGER';

export interface ForensicTimelineEntryDto {
  timelineId: string;
  source: ForensicTimelineSource;
  createdAt: string;
  withdrawalId: string;
  title: string;
  actorUid?: string;
  actorEmail?: string;
  action?: WithdrawalAuditEvent['action'];
  previousStatus?: WithdrawalRequest['status'];
  newStatus?: WithdrawalRequest['status'];
  previousValues?: Record<string, unknown>;
  changedValues?: Record<string, unknown>;
  reason?: string;
  ledgerType?: FinancialLedgerEntry['type'];
  ledgerDirection?: FinancialLedgerEntry['direction'];
  amountMicros?: number;
  balanceBeforeMicros?: number;
  balanceAfterMicros?: number;
  lockedBeforeMicros?: number;
  lockedAfterMicros?: number;
  idempotencyKey?: string;
  linkedLedgerEntryId?: string;
}

export type LedgerReconciliationStatus =
  | 'LOCKED_OPEN'
  | 'UNLOCKED_CLOSED'
  | 'SETTLED_CLOSED'
  | 'ANOMALY';

export interface WithdrawalLedgerReconciliationDto {
  withdrawalId: string;
  expectedIds: DeterministicLedgerIdsDto;
  lockCount: number;
  unlockCount: number;
  settlementCount: number;
  totalLedgerEntries: number;
  totalAuditEvents: number;
  lockEntryPresent: boolean;
  unlockEntryPresent: boolean;
  settlementEntryPresent: boolean;
  netLockedDeltaMicros: number;
  isBalanced: boolean;
  invariantStatus: LedgerReconciliationStatus;
  anomalies: string[];
}

export interface AdminWithdrawalAuditTimelineResponseDto {
  ok: true;
  withdrawal: WithdrawalRequest;
  userBalance: UserFinancialBalance | null;
  ledgerEntries: FinancialLedgerEntry[];
  auditEvents: WithdrawalAuditEvent[];
  timeline: ForensicTimelineEntryDto[];
  reconciliation: WithdrawalLedgerReconciliationDto;
}

function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl || !baseUrl.trim()) {
    return '';
  }
  return baseUrl.trim().replace(/\/+$/, '');
}

function parseAuditErrorResponse(
  status: number,
  body: Record<string, unknown> | null,
): WithdrawalModuleError {
  const originTask: WithdrawalTaskOrigin =
    body && typeof body.originTask === 'string'
      ? (body.originTask as WithdrawalTaskOrigin)
      : 'W10';
  const originModule: WithdrawalModuleOrigin =
    body && typeof body.originModule === 'string'
      ? (body.originModule as WithdrawalModuleOrigin)
      : 'AUDIT';
  const code =
    body && typeof body.code === 'string' && body.code.trim()
      ? body.code.trim()
      : 'AUDIT_FETCH_FAILED';
  const rawMessage =
    body && typeof body.error === 'string' && body.error.trim()
      ? body.error.trim()
      : 'Error consultando la línea de tiempo forense de auditoría.';
  const cleanedMessage = rawMessage
    .replace(/^\[[^\]]+\]\s*[A-Z0-9_]+:\s*/i, '')
    .trim();

  return new WithdrawalModuleError({
    originTask,
    originModule,
    code,
    httpStatus: status,
    message: cleanedMessage || rawMessage,
  });
}

export async function fetchAdminWithdrawalAudit(
  session: AdminWithdrawalSession | null | undefined,
  withdrawalId: string,
  options: AdminWithdrawalsApiClientOptions & { strictIntegrity?: boolean } = {},
): Promise<AdminWithdrawalAuditTimelineResponseDto> {
  if (!session || !session.uid?.trim() || !session.idToken?.trim()) {
    throw new WithdrawalModuleError({
      originTask: 'W02',
      originModule: 'AUTHZ',
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
      message: 'Sesión administrativa sin token activo para consultar auditoría forense.',
    });
  }

  const cleanId = typeof withdrawalId === 'string' ? withdrawalId.trim() : '';
  if (!cleanId) {
    throw new WithdrawalModuleError({
      originTask: 'W10',
      originModule: 'AUDIT',
      code: 'WITHDRAWAL_ID_REQUIRED',
      httpStatus: 400,
      message: 'El identificador withdrawalId es obligatorio.',
    });
  }

  const fetchFn = options.fetchImpl ?? fetch;
  const querySuffix = options.strictIntegrity ? '?strictIntegrity=1' : '';
  const url = `${normalizeBaseUrl(options.baseUrl)}/api/admin/withdrawals/${encodeURIComponent(cleanId)}/audit${querySuffix}`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.idToken.trim()}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    throw new WithdrawalModuleError({
      originTask: 'W10',
      originModule: 'AUDIT',
      code: 'AUDIT_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? `Fallo de red consultando auditoría forense: ${err.message}`
          : 'Error de red consultando auditoría forense.',
    });
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw parseAuditErrorResponse(response.status, parsed);
  }

  if (
    !parsed ||
    parsed.ok !== true ||
    !Array.isArray(parsed.timeline) ||
    !parsed.reconciliation ||
    typeof parsed.reconciliation !== 'object'
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W10',
      originModule: 'AUDIT',
      code: 'INVALID_AUDIT_RESPONSE',
      httpStatus: 502,
      message: 'Respuesta inválida del servidor en /api/admin/withdrawals/:id/audit.',
    });
  }

  return parsed as unknown as AdminWithdrawalAuditTimelineResponseDto;
}
