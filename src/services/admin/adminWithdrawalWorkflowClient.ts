/**
 * SCRUM-275 / SCRUM-289 / SCRUM-284 (W09)
 * Typed Admin HTTP Client for Withdrawal Workflow Mutations:
 * - `POST   /api/admin/withdrawals/:id/review`
 * - `PATCH  /api/admin/withdrawals/:id`
 * - `POST   /api/admin/withdrawals/:id/approve`
 * - `POST   /api/admin/withdrawals/:id/process`
 * - `POST   /api/admin/withdrawals/:id/reject`
 * - `POST   /api/admin/withdrawals/:id/cancel`
 *
 * Zero `localStorage` or mock fallback. Strictly propagates `W09-WORKFLOW-*`,
 * `W02-AUTHZ-*`, and `W01-DOMAIN-*` fault codes.
 */

import {
  WithdrawalModuleError,
  type AdminApproveWithdrawalDto,
  type AdminCancelWithdrawalDto,
  type AdminEditWithdrawalDto,
  type AdminProcessWithdrawalDto,
  type AdminRejectWithdrawalDto,
  type AdminReviewWithdrawalDto,
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

export type AdminWorkflowMutationAction =
  | 'REVIEW'
  | 'EDIT'
  | 'APPROVE'
  | 'PROCESS'
  | 'REJECT'
  | 'CANCEL';

export interface AdminWorkflowMutationResponseDto {
  ok: true;
  action: AdminWorkflowMutationAction;
  withdrawalRequest: WithdrawalRequest;
  userBalance?: UserFinancialBalance;
  syncedUserBalanceUsdt?: number;
  ledgerEntry?: FinancialLedgerEntry;
  ledgerEntryId?: string;
  auditEvent: WithdrawalAuditEvent;
  auditEventId: string;
}

function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl || !baseUrl.trim()) {
    return '';
  }
  return baseUrl.trim().replace(/\/+$/, '');
}

function buildWorkflowHeaders(
  session: AdminWithdrawalSession | null | undefined,
): Record<string, string> {
  if (!session || !session.uid?.trim() || !session.idToken?.trim()) {
    throw new WithdrawalModuleError({
      originTask: 'W02',
      originModule: 'AUTHZ',
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
      message: 'Sesión administrativa sin token activo para ejecutar mutaciones de workflow.',
    });
  }
  return {
    Authorization: `Bearer ${session.idToken.trim()}`,
    'Content-Type': 'application/json',
  };
}

function parseWorkflowErrorResponse(
  status: number,
  body: Record<string, unknown> | null,
): WithdrawalModuleError {
  const originTask: WithdrawalTaskOrigin =
    body && typeof body.originTask === 'string'
      ? (body.originTask as WithdrawalTaskOrigin)
      : 'W09';
  const originModule: WithdrawalModuleOrigin =
    body && typeof body.originModule === 'string'
      ? (body.originModule as WithdrawalModuleOrigin)
      : 'WORKFLOW';
  const code =
    body && typeof body.code === 'string' && body.code.trim()
      ? body.code.trim()
      : 'WORKFLOW_FAILED';
  const rawMessage =
    body && typeof body.error === 'string' && body.error.trim()
      ? body.error.trim()
      : 'Error ejecutando operación de workflow administrativo.';
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

async function sendWorkflowMutation(
  session: AdminWithdrawalSession | null | undefined,
  method: 'POST' | 'PATCH',
  path: string,
  payload: unknown,
  options: AdminWithdrawalsApiClientOptions = {},
): Promise<AdminWorkflowMutationResponseDto> {
  const headers = buildWorkflowHeaders(session);
  const fetchFn = options.fetchImpl ?? fetch;
  const url = `${normalizeBaseUrl(options.baseUrl)}${path}`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method,
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new WithdrawalModuleError({
      originTask: 'W09',
      originModule: 'WORKFLOW',
      code: 'WORKFLOW_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? `Fallo de red en workflow Admin: ${err.message}`
          : 'Error de red ejecutando workflow Admin.',
    });
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw parseWorkflowErrorResponse(response.status, parsed);
  }

  if (
    !parsed ||
    parsed.ok !== true ||
    !parsed.withdrawalRequest ||
    typeof parsed.withdrawalRequest !== 'object' ||
    !parsed.auditEvent ||
    typeof parsed.auditEvent !== 'object'
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W09',
      originModule: 'WORKFLOW',
      code: 'INVALID_WORKFLOW_RESPONSE',
      httpStatus: 502,
      message: 'Respuesta inválida del servidor para mutación de workflow Admin.',
    });
  }

  return parsed as unknown as AdminWorkflowMutationResponseDto;
}

function assertCleanId(withdrawalId: string): string {
  const cleanId = typeof withdrawalId === 'string' ? withdrawalId.trim() : '';
  if (!cleanId) {
    throw new WithdrawalModuleError({
      originTask: 'W09',
      originModule: 'WORKFLOW',
      code: 'WITHDRAWAL_ID_REQUIRED',
      httpStatus: 400,
      message: 'withdrawalId es obligatorio.',
    });
  }
  return encodeURIComponent(cleanId);
}

export async function reviewAdminWithdrawal(
  session: AdminWithdrawalSession | null | undefined,
  withdrawalId: string,
  dto: AdminReviewWithdrawalDto,
  options?: AdminWithdrawalsApiClientOptions,
): Promise<AdminWorkflowMutationResponseDto> {
  return sendWorkflowMutation(
    session,
    'POST',
    `/api/admin/withdrawals/${assertCleanId(withdrawalId)}/review`,
    dto,
    options,
  );
}

export async function editAdminWithdrawal(
  session: AdminWithdrawalSession | null | undefined,
  withdrawalId: string,
  dto: AdminEditWithdrawalDto,
  options?: AdminWithdrawalsApiClientOptions,
): Promise<AdminWorkflowMutationResponseDto> {
  return sendWorkflowMutation(
    session,
    'PATCH',
    `/api/admin/withdrawals/${assertCleanId(withdrawalId)}`,
    dto,
    options,
  );
}

export async function approveAdminWithdrawal(
  session: AdminWithdrawalSession | null | undefined,
  withdrawalId: string,
  dto: AdminApproveWithdrawalDto,
  options?: AdminWithdrawalsApiClientOptions,
): Promise<AdminWorkflowMutationResponseDto> {
  return sendWorkflowMutation(
    session,
    'POST',
    `/api/admin/withdrawals/${assertCleanId(withdrawalId)}/approve`,
    dto,
    options,
  );
}

export async function processAdminWithdrawal(
  session: AdminWithdrawalSession | null | undefined,
  withdrawalId: string,
  dto: AdminProcessWithdrawalDto,
  options?: AdminWithdrawalsApiClientOptions,
): Promise<AdminWorkflowMutationResponseDto> {
  return sendWorkflowMutation(
    session,
    'POST',
    `/api/admin/withdrawals/${assertCleanId(withdrawalId)}/process`,
    dto,
    options,
  );
}

export async function rejectAdminWithdrawal(
  session: AdminWithdrawalSession | null | undefined,
  withdrawalId: string,
  dto: AdminRejectWithdrawalDto,
  options?: AdminWithdrawalsApiClientOptions,
): Promise<AdminWorkflowMutationResponseDto> {
  return sendWorkflowMutation(
    session,
    'POST',
    `/api/admin/withdrawals/${assertCleanId(withdrawalId)}/reject`,
    dto,
    options,
  );
}

export async function cancelAdminWithdrawal(
  session: AdminWithdrawalSession | null | undefined,
  withdrawalId: string,
  dto: AdminCancelWithdrawalDto,
  options?: AdminWithdrawalsApiClientOptions,
): Promise<AdminWorkflowMutationResponseDto> {
  return sendWorkflowMutation(
    session,
    'POST',
    `/api/admin/withdrawals/${assertCleanId(withdrawalId)}/cancel`,
    dto,
    options,
  );
}
