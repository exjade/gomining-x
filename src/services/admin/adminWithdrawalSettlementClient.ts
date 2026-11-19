/**
 * SCRUM-275 / SCRUM-289 / SCRUM-286 (W11)
 * Typed Admin HTTP Client for On-Chain Broadcast, Confirmations & Atomic Settlement:
 * - `POST  /api/admin/withdrawals/:id/broadcast`
 * - `PATCH /api/admin/withdrawals/:id/confirmations`
 * - `POST  /api/admin/withdrawals/:id/complete`
 *
 * Zero `localStorage` or mock fallback. Strictly propagates `W11-SETTLEMENT-*`,
 * `W02-AUTHZ-*`, and `W01-DOMAIN-*` fault codes.
 */

import {
  WithdrawalModuleError,
  type AdminBroadcastWithdrawalDto,
  type AdminCompleteWithdrawalDto,
  type FinancialLedgerEntry,
  type UserFinancialBalance,
  type WithdrawalAuditEvent,
  type WithdrawalModuleOrigin,
  type WithdrawalRequest,
  type WithdrawalStatus,
  type WithdrawalTaskOrigin,
} from '../../types/withdrawal.js';
import type {
  AdminWithdrawalSession,
  AdminWithdrawalsApiClientOptions,
} from './adminWithdrawalsClient.js';

export type AdminSettlementMutationAction =
  | 'BROADCAST'
  | 'UPDATE_CONFIRMATIONS'
  | 'COMPLETE';

export interface AdminUpdateConfirmationsClientDto {
  expectedStatus: WithdrawalStatus;
  confirmations: number;
  reason?: string;
}

export interface AdminSettlementMutationResponseDto {
  ok: true;
  action: AdminSettlementMutationAction;
  idempotentReplay: boolean;
  withdrawalRequest: WithdrawalRequest;
  userBalance?: UserFinancialBalance;
  syncedUserBalanceUsdt?: number;
  ledgerEntry?: FinancialLedgerEntry;
  ledgerEntryId?: string;
  auditEvent?: WithdrawalAuditEvent;
  auditEventId?: string;
}

function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl || !baseUrl.trim()) {
    return '';
  }
  return baseUrl.trim().replace(/\/+$/, '');
}

function buildSettlementHeaders(
  session: AdminWithdrawalSession | null | undefined,
): Record<string, string> {
  if (!session || !session.uid?.trim() || !session.idToken?.trim()) {
    throw new WithdrawalModuleError({
      originTask: 'W02',
      originModule: 'AUTHZ',
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
      message: 'Sesión administrativa sin token activo para ejecutar broadcast/settlement W11.',
    });
  }
  return {
    Authorization: `Bearer ${session.idToken.trim()}`,
    'Content-Type': 'application/json',
  };
}

function parseSettlementErrorResponse(
  status: number,
  body: Record<string, unknown> | null,
): WithdrawalModuleError {
  const originTask: WithdrawalTaskOrigin =
    body && typeof body.originTask === 'string'
      ? (body.originTask as WithdrawalTaskOrigin)
      : 'W11';
  const originModule: WithdrawalModuleOrigin =
    body && typeof body.originModule === 'string'
      ? (body.originModule as WithdrawalModuleOrigin)
      : 'SETTLEMENT';
  const code =
    body && typeof body.code === 'string' && body.code.trim()
      ? body.code.trim()
      : 'SETTLEMENT_FAILED';
  const rawMessage =
    body && typeof body.error === 'string' && body.error.trim()
      ? body.error.trim()
      : 'Error ejecutando operación de broadcast/settlement on-chain.';
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

async function sendSettlementMutation(
  session: AdminWithdrawalSession | null | undefined,
  method: 'POST' | 'PATCH',
  path: string,
  payload: unknown,
  options: AdminWithdrawalsApiClientOptions = {},
): Promise<AdminSettlementMutationResponseDto> {
  const headers = buildSettlementHeaders(session);
  const fetchFn = options.fetchImpl ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const url = `${baseUrl}${path}`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method,
      headers,
      body: JSON.stringify(payload ?? {}),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new WithdrawalModuleError({
      originTask: 'W11',
      originModule: 'SETTLEMENT',
      code: 'SETTLEMENT_FAILED',
      httpStatus: 503,
      message: `Fallo de red en operación W11 (${method} ${path}): ${detail}`,
    });
  }

  let parsedBody: unknown = null;
  try {
    parsedBody = await response.json();
  } catch {
    if (!response.ok) {
      throw parseSettlementErrorResponse(response.status, null);
    }
    throw new WithdrawalModuleError({
      originTask: 'W11',
      originModule: 'SETTLEMENT',
      code: 'INVALID_SETTLEMENT_RESPONSE',
      httpStatus: 502,
      message: `Respuesta no-JSON del servidor en ${method} ${path}.`,
    });
  }

  const bodyObj =
    parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
      ? (parsedBody as Record<string, unknown>)
      : null;

  if (!response.ok) {
    throw parseSettlementErrorResponse(response.status, bodyObj);
  }

  if (
    !bodyObj ||
    bodyObj.ok !== true ||
    !bodyObj.withdrawalRequest ||
    typeof bodyObj.withdrawalRequest !== 'object'
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W11',
      originModule: 'SETTLEMENT',
      code: 'INVALID_SETTLEMENT_RESPONSE',
      httpStatus: 502,
      message: `Estructura de respuesta inválida en ${method} ${path}.`,
    });
  }

  return bodyObj as unknown as AdminSettlementMutationResponseDto;
}

export async function broadcastAdminWithdrawal(
  session: AdminWithdrawalSession | null | undefined,
  withdrawalId: string,
  dto: AdminBroadcastWithdrawalDto,
  options: AdminWithdrawalsApiClientOptions = {},
): Promise<AdminSettlementMutationResponseDto> {
  const cleanId = encodeURIComponent(withdrawalId.trim());
  return sendSettlementMutation(
    session,
    'POST',
    `/api/admin/withdrawals/${cleanId}/broadcast`,
    dto,
    options,
  );
}

export async function updateAdminWithdrawalConfirmations(
  session: AdminWithdrawalSession | null | undefined,
  withdrawalId: string,
  dto: AdminUpdateConfirmationsClientDto,
  options: AdminWithdrawalsApiClientOptions = {},
): Promise<AdminSettlementMutationResponseDto> {
  const cleanId = encodeURIComponent(withdrawalId.trim());
  return sendSettlementMutation(
    session,
    'PATCH',
    `/api/admin/withdrawals/${cleanId}/confirmations`,
    dto,
    options,
  );
}

export async function completeAdminWithdrawal(
  session: AdminWithdrawalSession | null | undefined,
  withdrawalId: string,
  dto: AdminCompleteWithdrawalDto,
  options: AdminWithdrawalsApiClientOptions = {},
): Promise<AdminSettlementMutationResponseDto> {
  const cleanId = encodeURIComponent(withdrawalId.trim());
  return sendSettlementMutation(
    session,
    'POST',
    `/api/admin/withdrawals/${cleanId}/complete`,
    dto,
    options,
  );
}
