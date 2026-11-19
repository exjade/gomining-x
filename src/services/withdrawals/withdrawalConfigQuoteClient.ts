/**
 * SCRUM-275 / SCRUM-289 / SCRUM-278 (W03)
 * Isolated Frontend HTTP Client for USDT Withdrawal Configuration & Authoritative Quotes:
 * - `GET /api/withdrawals/config`
 * - `POST /api/withdrawals/quote`
 *
 * Propagates traceable fault codes (`W03-NETCFG-*`, `W03-QUOTE-*`, `W02-AUTHZ-*`, `W03-CLIENT_API-*`).
 */

import {
  WithdrawalModuleError,
  isValidMicrosInteger,
  type WithdrawalConfigResponseDto,
  type WithdrawalQuoteRequestDto,
  type WithdrawalQuoteResponseDto,
  type WithdrawalTaskOrigin,
  type WithdrawalModuleOrigin,
} from '../../types/withdrawal.ts';
import {
  buildClientWithdrawalAuthHeaders,
  type ClientWithdrawalAuthSession,
} from './withdrawalAuthGuard.ts';

export interface WithdrawalApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl || !baseUrl.trim()) {
    return '';
  }
  return baseUrl.trim().replace(/\/+$/, '');
}

async function parseErrorOrThrow(
  response: Response,
  fallbackModule: 'NETCFG' | 'QUOTE',
): Promise<never> {
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
      : 'W03';
  const originModule: WithdrawalModuleOrigin =
    body && typeof body.originModule === 'string'
      ? (body.originModule as WithdrawalModuleOrigin)
      : fallbackModule;
  const rawMessage =
    body && typeof body.error === 'string' && body.error.trim()
      ? body.error.trim()
      : `Error HTTP ${response.status} al comunicarse con el servidor de retiros.`;

  // Strip duplicate prefix if server already formatted `[faultCode] code: ...`
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
 * Fetches enabled USDT withdrawal networks, user balance summary, and SLA policy
 * from `GET /api/withdrawals/config`.
 */
export async function fetchWithdrawalConfig(
  session: ClientWithdrawalAuthSession | null | undefined,
  options: WithdrawalApiClientOptions = {},
): Promise<WithdrawalConfigResponseDto> {
  const headers = buildClientWithdrawalAuthHeaders(session);
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const url = `${normalizeBaseUrl(options.baseUrl)}/api/withdrawals/config`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers,
    });
  } catch (err) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'CLIENT_API',
      code: 'CONFIG_NETWORK_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? err.message
          : 'Fallo de red al consultar /api/withdrawals/config.',
    });
  }

  if (!response.ok) {
    return parseErrorOrThrow(response, 'NETCFG');
  }

  const data = (await response.json()) as WithdrawalConfigResponseDto;
  if (!data || data.ok !== true || data.asset !== 'USDT' || !Array.isArray(data.networks)) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'CLIENT_API',
      code: 'INVALID_CONFIG_RESPONSE',
      httpStatus: 502,
      message: 'Respuesta inválida del servidor en /api/withdrawals/config.',
    });
  }

  return data;
}

/**
 * Requests an authoritative withdrawal quote (`EXACT_AMOUNT` or `MAX_AVAILABLE`)
 * from `POST /api/withdrawals/quote`.
 */
export async function requestWithdrawalQuote(
  session: ClientWithdrawalAuthSession | null | undefined,
  requestDto: WithdrawalQuoteRequestDto,
  options: WithdrawalApiClientOptions = {},
): Promise<WithdrawalQuoteResponseDto> {
  const headers = buildClientWithdrawalAuthHeaders(session);
  const netId = typeof requestDto?.networkId === 'string' ? requestDto.networkId.trim() : '';
  if (!netId) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'CLIENT_API',
      code: 'NETWORK_ID_REQUIRED',
      httpStatus: 400,
      message: 'Debe seleccionar una red USDT antes de cotizar.',
    });
  }

  const mode = requestDto.mode === 'MAX_AVAILABLE' ? 'MAX_AVAILABLE' : 'EXACT_AMOUNT';
  if (mode === 'EXACT_AMOUNT' && !isValidMicrosInteger(requestDto.requestedAmountMicros)) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'CLIENT_API',
      code: 'INVALID_QUOTE_AMOUNT',
      httpStatus: 400,
      message: 'El monto a cotizar debe ser un entero válido en micro-USDT.',
    });
  }

  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const url = `${normalizeBaseUrl(options.baseUrl)}/api/withdrawals/quote`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        networkId: netId,
        mode,
        ...(typeof requestDto.requestedAmountMicros === 'number'
          ? { requestedAmountMicros: requestDto.requestedAmountMicros }
          : {}),
        ...(typeof requestDto.destinationAddress === 'string' &&
        requestDto.destinationAddress.trim()
          ? { destinationAddress: requestDto.destinationAddress.trim() }
          : {}),
      }),
    });
  } catch (err) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'CLIENT_API',
      code: 'QUOTE_NETWORK_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? err.message
          : 'Fallo de red al consultar /api/withdrawals/quote.',
    });
  }

  if (!response.ok) {
    return parseErrorOrThrow(response, 'QUOTE');
  }

  const payload = (await response.json()) as { ok?: boolean; quote?: WithdrawalQuoteResponseDto };
  if (!payload || payload.ok !== true || !payload.quote || payload.quote.asset !== 'USDT') {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'CLIENT_API',
      code: 'INVALID_QUOTE_RESPONSE',
      httpStatus: 502,
      message: 'Respuesta inválida del servidor en /api/withdrawals/quote.',
    });
  }

  return payload.quote;
}

/**
 * Convenience helper for the client `MAX` button: requests the maximum withdrawable
 * amount from the server such that `requestedAmount + fees <= availableBalance`.
 */
export async function requestMaxWithdrawalQuote(
  session: ClientWithdrawalAuthSession | null | undefined,
  networkId: string,
  destinationAddress?: string,
  options: WithdrawalApiClientOptions = {},
): Promise<WithdrawalQuoteResponseDto> {
  return requestWithdrawalQuote(
    session,
    {
      networkId,
      mode: 'MAX_AVAILABLE',
      ...(destinationAddress ? { destinationAddress } : {}),
    },
    options,
  );
}
