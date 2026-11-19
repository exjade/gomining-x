/**
 * SCRUM-275 / SCRUM-289 / SCRUM-277 (W02)
 * Isolated Client Authentication & Ownership Guard for USDT Withdrawals.
 *
 * Guarantees + Traceable Fault Codes (`W02-CLIENT_GUARD-*`):
 * 1. Only authenticated, non-anonymous Firebase users can request or read withdrawals.
 * 2. Strict UID isolation (`withdrawal.userId === session.uid`).
 * 3. Builds clean `Authorization: Bearer <idToken>` headers without any client role spoofing.
 */

import {
  WithdrawalModuleError,
  formatWithdrawalFaultCode,
  type WithdrawalRequest,
} from '../../types/withdrawal.ts';

export interface ClientWithdrawalAuthSession {
  uid: string;
  email?: string | null;
  isAnonymous?: boolean;
  idToken?: string | null;
}

export type ClientWithdrawalSessionCheck =
  | { allowed: true; uid: string; email: string; idToken: string }
  | {
      allowed: false;
      code: 'UNAUTHENTICATED' | 'ANONYMOUS_FORBIDDEN';
      faultCode: string;
      originTask: 'W02';
      originModule: 'CLIENT_GUARD';
      message: string;
    };

export function validateClientWithdrawalSession(
  session: ClientWithdrawalAuthSession | null | undefined,
): ClientWithdrawalSessionCheck {
  if (!session || typeof session.uid !== 'string' || !session.uid.trim()) {
    return {
      allowed: false,
      code: 'UNAUTHENTICATED',
      faultCode: formatWithdrawalFaultCode('W02', 'CLIENT_GUARD', 'UNAUTHENTICATED', 401),
      originTask: 'W02',
      originModule: 'CLIENT_GUARD',
      message: 'Debes iniciar sesión con tu cuenta para solicitar o consultar retiros.',
    };
  }

  if (session.isAnonymous === true) {
    return {
      allowed: false,
      code: 'ANONYMOUS_FORBIDDEN',
      faultCode: formatWithdrawalFaultCode('W02', 'CLIENT_GUARD', 'ANONYMOUS_FORBIDDEN', 403),
      originTask: 'W02',
      originModule: 'CLIENT_GUARD',
      message: 'Las sesiones de invitado/anónimas no pueden operar retiros de saldo real.',
    };
  }

  const token = typeof session.idToken === 'string' ? session.idToken.trim() : '';
  if (!token) {
    return {
      allowed: false,
      code: 'UNAUTHENTICATED',
      faultCode: formatWithdrawalFaultCode('W02', 'CLIENT_GUARD', 'UNAUTHENTICATED', 401),
      originTask: 'W02',
      originModule: 'CLIENT_GUARD',
      message: 'No se encontró un token de sesión activo. Vuelve a iniciar sesión.',
    };
  }

  return {
    allowed: true,
    uid: session.uid.trim(),
    email: typeof session.email === 'string' ? session.email.trim().toLowerCase() : '',
    idToken: token,
  };
}

export function buildClientWithdrawalAuthHeaders(
  session: ClientWithdrawalAuthSession | null | undefined,
): Record<string, string> {
  const check = validateClientWithdrawalSession(session);
  if (!check.allowed) {
    throw new WithdrawalModuleError({
      originTask: 'W02',
      originModule: 'CLIENT_GUARD',
      code: check.code,
      httpStatus: check.code === 'ANONYMOUS_FORBIDDEN' ? 403 : 401,
      message: check.message,
    });
  }
  return {
    Authorization: `Bearer ${check.idToken}`,
    'Content-Type': 'application/json',
  };
}

export function canClientAccessWithdrawalRecord(
  authenticatedUid: string | null | undefined,
  record: Pick<WithdrawalRequest, 'userId'> | null | undefined,
): boolean {
  const cleanAuthUid = typeof authenticatedUid === 'string' ? authenticatedUid.trim() : '';
  const cleanRecordUid =
    record && typeof record.userId === 'string' ? record.userId.trim() : '';
  if (!cleanAuthUid || !cleanRecordUid) {
    return false;
  }
  return cleanAuthUid === cleanRecordUid;
}

export function filterClientOwnedWithdrawals<T extends Pick<WithdrawalRequest, 'userId'>>(
  authenticatedUid: string | null | undefined,
  records: readonly T[],
): T[] {
  if (!Array.isArray(records)) {
    return [];
  }
  return records.filter((record) => canClientAccessWithdrawalRecord(authenticatedUid, record));
}
