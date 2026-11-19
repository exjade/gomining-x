/**
 * SCRUM-275 / SCRUM-289 / SCRUM-279 (W04)
 * Isolated Frontend HTTP Client for Submitting Atomic USDT Withdrawal Requests:
 * - `POST /api/withdrawals/request`
 *
 * Enforces client-side pre-validation, deterministic/unique idempotency keys,
 * and propagates traceable fault codes (`W04-LOCK_TX-*`, `W04-CLIENT_API-*`, `W02-AUTHZ-*`).
 */

import {
  MIN_WITHDRAWAL_MICROS,
  WithdrawalModuleError,
  isValidMicrosInteger,
  type CreateWithdrawalRequestDto,
  type FinancialLedgerEntry,
  type UserFinancialBalance,
  type WithdrawalAuditEvent,
  type WithdrawalModuleOrigin,
  type WithdrawalRequest,
  type WithdrawalTaskOrigin,
} from '../../types/withdrawal.ts';
import {
  buildClientWithdrawalAuthHeaders,
  type ClientWithdrawalAuthSession,
} from './withdrawalAuthGuard.ts';
import type { WithdrawalApiClientOptions } from './withdrawalConfigQuoteClient.ts';

export interface SubmitWithdrawalRequestResponseDto {
  ok: true;
  status: 200 | 201;
  idempotentReplay: boolean;
  withdrawalRequest: WithdrawalRequest;
  userBalance: UserFinancialBalance;
  syncedUserBalanceUsdt: number;
  ledgerEntry?: FinancialLedgerEntry;
  auditEvent?: WithdrawalAuditEvent;
  ledgerEntryId: string;
  auditEventId: string;
}

function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl || !baseUrl.trim()) {
    return '';
  }
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * Generates a deterministic or unique idempotency key (`>= 8` chars) for a client withdrawal submission.
 */
export function createWithdrawalIdempotencyKey(
  uid: string,
  networkId: string,
  requestedAmountMicros: number,
  clientNonce?: string,
): string {
  const cleanUid = typeof uid === 'string' ? uid.trim() : 'anon';
  const cleanNet = typeof networkId === 'string' ? networkId.trim() : 'net';
  const nonce =
    typeof clientNonce === 'string' && clientNonce.trim()
      ? clientNonce.trim()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `idem_${cleanUid}_${cleanNet}_${requestedAmountMicros}_${nonce}`.replace(
    /[^a-zA-Z0-9_-]/g,
    '_',
  );
}

async function parseRequestErrorOrThrow(response: Response): Promise<never> {
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
      : 'W04';
  const originModule: WithdrawalModuleOrigin =
    body && typeof body.originModule === 'string'
      ? (body.originModule as WithdrawalModuleOrigin)
      : 'LOCK_TX';
  const rawMessage =
    body && typeof body.error === 'string' && body.error.trim()
      ? body.error.trim()
      : `Error HTTP ${response.status} al procesar la solicitud de retiro.`;

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
 * Submits a client USDT withdrawal request to `POST /api/withdrawals/request`.
 */
export async function submitWithdrawalRequest(
  session: ClientWithdrawalAuthSession | null | undefined,
  dto: CreateWithdrawalRequestDto,
  options: WithdrawalApiClientOptions = {},
): Promise<SubmitWithdrawalRequestResponseDto> {
  const headers = buildClientWithdrawalAuthHeaders(session);

  if (!dto || typeof dto !== 'object') {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'CLIENT_API',
      code: 'INVALID_REQUEST_PAYLOAD',
      httpStatus: 400,
      message: 'Los datos de la solicitud de retiro son obligatorios.',
    });
  }

  const cleanNetworkId = typeof dto.networkId === 'string' ? dto.networkId.trim() : '';
  if (!cleanNetworkId) {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'CLIENT_API',
      code: 'NETWORK_ID_REQUIRED',
      httpStatus: 400,
      message: 'Debe seleccionar una red USDT para solicitar el retiro.',
    });
  }

  const cleanAddress =
    typeof dto.destinationAddress === 'string' ? dto.destinationAddress.trim() : '';
  if (!cleanAddress) {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'CLIENT_API',
      code: 'DESTINATION_ADDRESS_REQUIRED',
      httpStatus: 400,
      message: 'Debe ingresar la dirección de billetera de destino.',
    });
  }

  const cleanIdempotencyKey =
    typeof dto.idempotencyKey === 'string' ? dto.idempotencyKey.trim() : '';
  if (cleanIdempotencyKey.length < 8 || cleanIdempotencyKey.length > 128) {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'CLIENT_API',
      code: 'INVALID_IDEMPOTENCY_KEY',
      httpStatus: 400,
      message: 'La clave de idempotencia debe tener entre 8 y 128 caracteres.',
    });
  }

  if (!isValidMicrosInteger(dto.requestedAmountMicros)) {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'CLIENT_API',
      code: 'INVALID_REQUESTED_AMOUNT',
      httpStatus: 400,
      message: 'El monto solicitado debe ser un entero válido en micro-USDT.',
    });
  }

  if (dto.requestedAmountMicros < MIN_WITHDRAWAL_MICROS) {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'CLIENT_API',
      code: 'MINIMUM_WITHDRAWAL_NOT_MET',
      httpStatus: 422,
      message: 'El monto mínimo de retiro es de 10.00 USDT.',
    });
  }

  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const url = `${normalizeBaseUrl(options.baseUrl)}/api/withdrawals/request`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        networkId: cleanNetworkId,
        destinationAddress: cleanAddress,
        requestedAmountMicros: dto.requestedAmountMicros,
        idempotencyKey: cleanIdempotencyKey,
      }),
    });
  } catch (err) {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'CLIENT_API',
      code: 'REQUEST_NETWORK_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? err.message
          : 'Fallo de red al enviar la solicitud de retiro a /api/withdrawals/request.',
    });
  }

  if (!response.ok) {
    return parseRequestErrorOrThrow(response);
  }

  const payload = (await response.json()) as SubmitWithdrawalRequestResponseDto;
  if (
    !payload ||
    payload.ok !== true ||
    !payload.withdrawalRequest ||
    payload.withdrawalRequest.asset !== 'USDT'
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'CLIENT_API',
      code: 'INVALID_REQUEST_RESPONSE',
      httpStatus: 502,
      message: 'Respuesta inválida del servidor en /api/withdrawals/request.',
    });
  }

  return payload;
}
