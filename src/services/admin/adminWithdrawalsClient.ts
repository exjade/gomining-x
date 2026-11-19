/**
 * SCRUM-275 / SCRUM-289 / SCRUM-283 (W08)
 * Isolated Frontend HTTP Client for Admin Withdrawals Control Center:
 * - `GET /api/admin/withdrawals` (paginated queue/history + authoritative KPIs + filters)
 * - `GET /api/admin/withdrawals/:withdrawalId` (detail + userBalance + Ledger + Audit timeline)
 *
 * Zero `localStorage` or mock fallback. Distinguishes `'load' | 'authz' | 'action_conflict' | 'stale'` errors.
 */

import {
  WITHDRAWAL_ASSET,
  WithdrawalModuleError,
  isWithdrawalModuleError,
  type AdminWithdrawalKpiSummary,
  type AdminWithdrawalsQueryFilter,
  type FinancialLedgerEntry,
  type MembershipTier,
  type UserFinancialBalance,
  type WithdrawalAuditEvent,
  type WithdrawalModuleOrigin,
  type WithdrawalNetworkCode,
  type WithdrawalRequest,
  type WithdrawalStatus,
  type WithdrawalTaskOrigin,
} from '../../types/withdrawal.js';

export const DEFAULT_ADMIN_HISTORY_LIMIT = 20 as const;
export const MAX_ADMIN_HISTORY_LIMIT = 50 as const;

export type AdminWithdrawalsTab = 'queue' | 'all';

export type AdminWithdrawalErrorCategory =
  | 'load'
  | 'authz'
  | 'action_conflict'
  | 'stale';

export interface AdminWithdrawalSession {
  uid: string;
  email: string;
  idToken: string;
  permissions: readonly string[];
}

export interface AdminWithdrawalsApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface AdminWithdrawalsListQuery extends AdminWithdrawalsQueryFilter {
  tab?: AdminWithdrawalsTab;
}

export interface AdminWithdrawalsListResponseDto {
  ok: true;
  tab: AdminWithdrawalsTab;
  items: WithdrawalRequest[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
  kpis: AdminWithdrawalKpiSummary;
  appliedFilter: {
    tab: AdminWithdrawalsTab;
    status: WithdrawalStatus | 'ALL';
    network: WithdrawalNetworkCode | 'ALL';
    membershipTier: MembershipTier | 'ALL';
    searchQuery: string;
    dateFrom?: string;
    dateTo?: string;
  };
}

export interface AdminWithdrawalDetailResponseDto {
  ok: true;
  withdrawal: WithdrawalRequest;
  userBalance: UserFinancialBalance | null;
  ledgerEntries: FinancialLedgerEntry[];
  ledgerEntryIds: string[];
  auditEvents: WithdrawalAuditEvent[];
  auditAccessGranted: boolean;
}

export interface ClassifiedAdminWithdrawalError {
  category: AdminWithdrawalErrorCategory;
  faultCode: string;
  code: string;
  httpStatus?: number;
  message: string;
}

function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl || !baseUrl.trim()) {
    return '';
  }
  return baseUrl.trim().replace(/\/+$/, '');
}

function buildAdminAuthHeaders(session: AdminWithdrawalSession | null | undefined): Record<string, string> {
  if (!session || !session.uid?.trim() || !session.idToken?.trim()) {
    throw new WithdrawalModuleError({
      originTask: 'W02',
      originModule: 'AUTHZ',
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
      message: 'Sesión administrativa sin token activo.',
    });
  }
  return {
    Authorization: `Bearer ${session.idToken.trim()}`,
    'Content-Type': 'application/json',
  };
}

export function classifyAdminWithdrawalError(
  err: unknown,
  hasLoadedData = false,
): ClassifiedAdminWithdrawalError {
  if (isWithdrawalModuleError(err)) {
    const status = err.httpStatus ?? 500;
    let category: AdminWithdrawalErrorCategory = 'load';
    if (status === 401 || status === 403 || err.originModule === 'AUTHZ') {
      category = 'authz';
    } else if (status === 409) {
      category = 'action_conflict';
    } else if (hasLoadedData) {
      category = 'stale';
    }

    return {
      category,
      faultCode: err.faultCode,
      code: err.code,
      httpStatus: err.httpStatus,
      message: err.message.replace(/^\[[^\]]+\]\s*[A-Z0-9_]+:\s*/i, '').trim(),
    };
  }

  const fallback = new WithdrawalModuleError({
    originTask: 'W08',
    originModule: 'ADMIN_UI',
    code: 'ADMIN_FETCH_FAILED',
    httpStatus: 503,
    message: err instanceof Error ? err.message : 'Error consultando el Centro de Control Admin.',
  });
  return {
    category: hasLoadedData ? 'stale' : 'load',
    faultCode: fallback.faultCode,
    code: fallback.code,
    httpStatus: fallback.httpStatus,
    message: fallback.message.replace(/^\[[^\]]+\]\s*[A-Z0-9_]+:\s*/i, '').trim(),
  };
}

async function parseAdminErrorOrThrow(response: Response): Promise<never> {
  let body: Record<string, unknown> | null = null;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  const code =
    body && typeof body.code === 'string' && body.code.trim()
      ? body.code.trim()
      : `HTTP_${response.status}`;
  const originTask: WithdrawalTaskOrigin =
    body && typeof body.originTask === 'string'
      ? (body.originTask as WithdrawalTaskOrigin)
      : 'W08';
  const originModule: WithdrawalModuleOrigin =
    body && typeof body.originModule === 'string'
      ? (body.originModule as WithdrawalModuleOrigin)
      : 'ADMIN_UI';
  const rawMessage =
    body && typeof body.error === 'string' && body.error.trim()
      ? body.error.trim()
      : `Error HTTP ${response.status} en Centro de Control Admin.`;

  throw new WithdrawalModuleError({
    originTask,
    originModule,
    code,
    httpStatus: response.status,
    message: rawMessage.replace(/^\[[^\]]+\]\s*[A-Z0-9_]+:\s*/i, '').trim() || rawMessage,
  });
}

export async function fetchAdminWithdrawals(
  session: AdminWithdrawalSession | null | undefined,
  query: AdminWithdrawalsListQuery = {},
  options: AdminWithdrawalsApiClientOptions = {},
): Promise<AdminWithdrawalsListResponseDto> {
  const headers = buildAdminAuthHeaders(session);

  const params = new URLSearchParams();
  if (query.tab) params.set('tab', query.tab);
  if (query.status) params.set('status', query.status);
  if (query.network) params.set('network', query.network);
  if (query.membershipTier) params.set('membershipTier', query.membershipTier);
  if (query.searchQuery && query.searchQuery.trim()) {
    params.set('searchQuery', query.searchQuery.trim());
  }
  if (query.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query.dateTo) params.set('dateTo', query.dateTo);
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.limit !== undefined) params.set('limit', String(query.limit));

  const qs = params.toString();
  const url = `${normalizeBaseUrl(options.baseUrl)}/api/admin/withdrawals${qs ? `?${qs}` : ''}`;
  const fetchFn = options.fetchImpl ?? globalThis.fetch;

  let response: Response;
  try {
    response = await fetchFn(url, { method: 'GET', headers });
  } catch (err) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'ADMIN_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? err.message
          : 'Fallo de red al consultar GET /api/admin/withdrawals.',
    });
  }

  if (!response.ok) {
    return parseAdminErrorOrThrow(response);
  }

  const payload = (await response.json()) as AdminWithdrawalsListResponseDto;
  if (
    !payload ||
    payload.ok !== true ||
    !Array.isArray(payload.items) ||
    !payload.kpis ||
    typeof payload.hasMore !== 'boolean'
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_ADMIN_RESPONSE',
      httpStatus: 502,
      message: 'Respuesta inválida del servidor en GET /api/admin/withdrawals.',
    });
  }

  for (const item of payload.items) {
    if (!item || typeof item.id !== 'string' || item.asset !== WITHDRAWAL_ASSET) {
      throw new WithdrawalModuleError({
        originTask: 'W08',
        originModule: 'ADMIN_UI',
        code: 'INVALID_ADMIN_RESPONSE',
        httpStatus: 502,
        message: 'Elemento de cola administrativa inválido o distinto de USDT.',
      });
    }
  }

  return payload;
}

export async function fetchAdminWithdrawalDetail(
  session: AdminWithdrawalSession | null | undefined,
  withdrawalId: string,
  options: AdminWithdrawalsApiClientOptions = {},
): Promise<AdminWithdrawalDetailResponseDto> {
  const headers = buildAdminAuthHeaders(session);
  const cleanId = typeof withdrawalId === 'string' ? withdrawalId.trim() : '';
  if (!cleanId) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'WITHDRAWAL_ID_REQUIRED',
      httpStatus: 400,
      message: 'El identificador withdrawalId es obligatorio.',
    });
  }

  const url = `${normalizeBaseUrl(options.baseUrl)}/api/admin/withdrawals/${encodeURIComponent(cleanId)}`;
  const fetchFn = options.fetchImpl ?? globalThis.fetch;

  let response: Response;
  try {
    response = await fetchFn(url, { method: 'GET', headers });
  } catch (err) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'ADMIN_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? err.message
          : 'Fallo de red al consultar GET /api/admin/withdrawals/:withdrawalId.',
    });
  }

  if (!response.ok) {
    return parseAdminErrorOrThrow(response);
  }

  const payload = (await response.json()) as AdminWithdrawalDetailResponseDto;
  if (
    !payload ||
    payload.ok !== true ||
    !payload.withdrawal ||
    payload.withdrawal.asset !== WITHDRAWAL_ASSET
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_ADMIN_RESPONSE',
      httpStatus: 502,
      message: 'Respuesta inválida del servidor en GET /api/admin/withdrawals/:withdrawalId.',
    });
  }

  return payload;
}
