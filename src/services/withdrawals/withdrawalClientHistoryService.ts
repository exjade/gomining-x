/**
 * SCRUM-275 / SCRUM-289 / SCRUM-282 (W07)
 * Isolated Frontend HTTP Client for Authenticated Client Withdrawal History & Detail:
 * - `GET /api/withdrawals/me` (cursor-based pagination, `requestedAt DESC`)
 * - `GET /api/withdrawals/me/:withdrawalId` (strict UID ownership enforced by server)
 *
 * Propagates traceable fault codes (`W07-HISTORY_UI-*`, `W02-AUTHZ-*`, `W02-CLIENT_GUARD-*`).
 */

import {
  WITHDRAWAL_ASSET,
  WithdrawalModuleError,
  type WithdrawalModuleOrigin,
  type WithdrawalRequest,
  type WithdrawalTaskOrigin,
} from '../../types/withdrawal.ts';
import {
  buildClientWithdrawalAuthHeaders,
  type ClientWithdrawalAuthSession,
} from './withdrawalAuthGuard.ts';
import type { WithdrawalApiClientOptions } from './withdrawalConfigQuoteClient.ts';

export const DEFAULT_CLIENT_HISTORY_PAGE_SIZE = 15 as const;
export const MAX_CLIENT_HISTORY_PAGE_SIZE = 50 as const;

export interface FetchClientWithdrawalHistoryParams {
  cursor?: string | null;
  limit?: number;
}

export interface ClientWithdrawalHistoryApiResponse {
  ok: true;
  items: WithdrawalRequest[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface ClientWithdrawalDetailApiResponse {
  ok: true;
  withdrawal: WithdrawalRequest;
}

function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl || !baseUrl.trim()) {
    return '';
  }
  return baseUrl.trim().replace(/\/+$/, '');
}

async function parseHistoryErrorOrThrow(response: Response): Promise<never> {
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
      : 'W07';
  const originModule: WithdrawalModuleOrigin =
    body && typeof body.originModule === 'string'
      ? (body.originModule as WithdrawalModuleOrigin)
      : 'HISTORY_UI';
  const rawMessage =
    body && typeof body.error === 'string' && body.error.trim()
      ? body.error.trim()
      : `Error HTTP ${response.status} al consultar el historial de retiros.`;

  const strippedMessage = rawMessage
    .replace(/^\[[^\]]+\]\s*[A-Z0-9_]+:\s*/i, '')
    .trim();

  throw new WithdrawalModuleError({
    originTask,
    originModule,
    code,
    httpStatus: response.status,
    message: strippedMessage || rawMessage,
  });
}

/**
 * Fetches a cursor-paginated slice of the authenticated user's own withdrawal requests
 * from `GET /api/withdrawals/me`.
 */
export async function fetchClientWithdrawalHistory(
  session: ClientWithdrawalAuthSession | null | undefined,
  params: FetchClientWithdrawalHistoryParams = {},
  options: WithdrawalApiClientOptions = {},
): Promise<ClientWithdrawalHistoryApiResponse> {
  const headers = buildClientWithdrawalAuthHeaders(session);

  const requestedLimit =
    params.limit === undefined ? DEFAULT_CLIENT_HISTORY_PAGE_SIZE : params.limit;
  if (
    typeof requestedLimit !== 'number' ||
    !Number.isSafeInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > MAX_CLIENT_HISTORY_PAGE_SIZE
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'INVALID_PAGINATION_LIMIT',
      httpStatus: 400,
      message: `El parámetro limit debe ser un entero entre 1 y ${MAX_CLIENT_HISTORY_PAGE_SIZE}.`,
    });
  }

  const query = new URLSearchParams();
  query.set('limit', String(requestedLimit));
  if (typeof params.cursor === 'string' && params.cursor.trim()) {
    query.set('cursor', params.cursor.trim());
  }

  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const url = `${normalizeBaseUrl(options.baseUrl)}/api/withdrawals/me?${query.toString()}`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers,
    });
  } catch (err) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'HISTORY_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? err.message
          : 'Fallo de red al consultar GET /api/withdrawals/me.',
    });
  }

  if (!response.ok) {
    return parseHistoryErrorOrThrow(response);
  }

  const payload = (await response.json()) as ClientWithdrawalHistoryApiResponse;
  if (
    !payload ||
    payload.ok !== true ||
    !Array.isArray(payload.items) ||
    typeof payload.hasMore !== 'boolean'
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'INVALID_HISTORY_RESPONSE',
      httpStatus: 502,
      message: 'Respuesta inválida del servidor en GET /api/withdrawals/me.',
    });
  }

  for (const item of payload.items) {
    if (!item || typeof item.id !== 'string' || item.asset !== WITHDRAWAL_ASSET) {
      throw new WithdrawalModuleError({
        originTask: 'W07',
        originModule: 'HISTORY_UI',
        code: 'INVALID_HISTORY_RESPONSE',
        httpStatus: 502,
        message: 'Elemento de historial inválido o con activo distinto de USDT.',
      });
    }
  }

  return payload;
}

/**
 * Fetches authoritative single-withdrawal details for the authenticated owner
 * from `GET /api/withdrawals/me/:withdrawalId`.
 */
export async function fetchClientWithdrawalDetail(
  session: ClientWithdrawalAuthSession | null | undefined,
  withdrawalId: string,
  options: WithdrawalApiClientOptions = {},
): Promise<ClientWithdrawalDetailApiResponse> {
  const headers = buildClientWithdrawalAuthHeaders(session);

  const cleanId = typeof withdrawalId === 'string' ? withdrawalId.trim() : '';
  if (!cleanId) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'WITHDRAWAL_ID_REQUIRED',
      httpStatus: 400,
      message: 'El identificador withdrawalId es obligatorio.',
    });
  }

  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const url = `${normalizeBaseUrl(options.baseUrl)}/api/withdrawals/me/${encodeURIComponent(cleanId)}`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers,
    });
  } catch (err) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'HISTORY_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? err.message
          : 'Fallo de red al consultar GET /api/withdrawals/me/:withdrawalId.',
    });
  }

  if (!response.ok) {
    return parseHistoryErrorOrThrow(response);
  }

  const payload = (await response.json()) as ClientWithdrawalDetailApiResponse;
  if (
    !payload ||
    payload.ok !== true ||
    !payload.withdrawal ||
    payload.withdrawal.asset !== WITHDRAWAL_ASSET
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'INVALID_HISTORY_RESPONSE',
      httpStatus: 502,
      message: 'Respuesta inválida del servidor en GET /api/withdrawals/me/:withdrawalId.',
    });
  }

  return payload;
}
