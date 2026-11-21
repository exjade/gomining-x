/**
 * SCRUM-275 / SCRUM-289 / SCRUM-282 (W07)
 * Server-Authoritative Client Withdrawal History & Detail Service:
 * - `GET /api/withdrawals/me` (cursor-based pagination, `where('userId', '==', uid).orderBy('requestedAt', 'desc')`)
 * - `GET /api/withdrawals/me/:withdrawalId` (strict UID ownership via W02 `assertClientWithdrawalOwnership`)
 *
 * Security & Index Invariants:
 * 1. Uses the exact single composite index `(userId ASC, requestedAt DESC)` from W01 `firestore.indexes.json`
 *    plus `startAfter(cursorDocumentSnapshot)` for implicit Firestore tie-breaking (no extra `orderBy` field).
 * 2. Cursor is bound to the authenticated `uid` (`W07-HISTORY_UI-403-FORBIDDEN_CROSS_UID_CURSOR` on cross-UID tamper,
 *    `W07-HISTORY_UI-400-INVALID_CURSOR` on malformed/missing snapshot).
 * 3. Strips internal administrative/audit fields (`internalNotes`, `reviewedBy`, `approvedBy`, `processedBy`,
 *    `broadcastedBy`, `completedBy`, `rejectedBy`, `cancelledBy`, `providerTransactionId`, `idempotencyKey`, `userEmail`)
 *    from all client-facing DTOs.
 */

import type {
  FirestoreCollectionLike,
  FirestoreDocumentSnapshotLike,
  FirestoreLike,
  FirestoreQuerySnapshotLike,
} from './firebaseAdminAllowlistAdapter.js';
import {
  assertClientWithdrawalOwnership,
  type WithdrawalClientPrincipal,
} from './withdrawalAuthzMiddleware.js';
import { isSafeFirestoreDocId } from './withdrawalNetworksService.js';
import {
  WITHDRAWAL_REQUESTS_COLLECTION,
  WithdrawalModuleError,
  isWithdrawalModuleError,
  type WithdrawalRequest,
} from '../../src/types/withdrawal.js';

export const DEFAULT_CLIENT_HISTORY_LIMIT = 15 as const;
export const MAX_CLIENT_HISTORY_LIMIT = 50 as const;

export type SanitizedClientWithdrawalDto = Omit<
  WithdrawalRequest,
  | 'userEmail'
  | 'idempotencyKey'
  | 'internalNotes'
  | 'reviewedBy'
  | 'approvedBy'
  | 'processedBy'
  | 'broadcastedBy'
  | 'completedBy'
  | 'rejectedBy'
  | 'cancelledBy'
  | 'providerTransactionId'
>;

export interface ClientWithdrawalHistoryQueryInput {
  cursor?: string | null;
  limit?: number | string | null;
}

export interface ClientWithdrawalHistoryResponseDto {
  ok: true;
  items: SanitizedClientWithdrawalDto[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface ClientWithdrawalDetailResponseDto {
  ok: true;
  withdrawal: SanitizedClientWithdrawalDto;
}

interface DecodedClientHistoryCursor {
  v: 1;
  uid: string;
  requestedAt: string;
  id: string;
}

export interface QueryableFirestoreCollectionLike extends FirestoreCollectionLike {
  where?(fieldPath: string, opStr: '==' | string, value: unknown): FirestoreQueryLike;
}

export interface FirestoreQueryLike {
  where?(fieldPath: string, opStr: string, value: unknown): FirestoreQueryLike;
  orderBy(fieldPath: string, directionStr?: 'asc' | 'desc'): FirestoreQueryLike;
  startAfter(snapshotOrValue: unknown): FirestoreQueryLike;
  limit(limit: number): FirestoreQueryLike;
  get(): Promise<FirestoreQuerySnapshotLike>;
}

function unwrapSnapshotExists(snap: FirestoreDocumentSnapshotLike | undefined | null): boolean {
  if (!snap) return false;
  const rawExists = (snap as { exists: boolean | (() => boolean) }).exists;
  return typeof rawExists === 'function' ? Boolean(rawExists.call(snap)) : Boolean(rawExists);
}

function unwrapSnapshotData(
  snap: FirestoreDocumentSnapshotLike | undefined | null,
): Record<string, unknown> | undefined {
  if (!snap) return undefined;
  return typeof snap.data === 'function' ? snap.data() : undefined;
}

function resolveSnapshotId(
  snap: FirestoreDocumentSnapshotLike,
  data: Record<string, unknown> | undefined,
): string {
  if (typeof snap.id === 'string' && snap.id.trim()) {
    return snap.id.trim();
  }
  if (data && typeof data.id === 'string' && data.id.trim()) {
    return data.id.trim();
  }
  return '';
}

export function encodeClientHistoryCursor(
  uid: string,
  requestedAt: string,
  id: string,
): string {
  const payload: DecodedClientHistoryCursor = {
    v: 1,
    uid: uid.trim(),
    requestedAt: requestedAt.trim(),
    id: id.trim(),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeClientHistoryCursor(
  rawCursor: string,
  authenticatedUid: string,
): DecodedClientHistoryCursor {
  const trimmed = typeof rawCursor === 'string' ? rawCursor.trim() : '';
  if (!trimmed || trimmed.length > 512) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'INVALID_CURSOR',
      httpStatus: 400,
      message: 'El cursor de paginación tiene formato inválido.',
    });
  }

  let parsed: unknown;
  try {
    const json = Buffer.from(trimmed, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'INVALID_CURSOR',
      httpStatus: 400,
      message: 'No se pudo decodificar el cursor de paginación.',
    });
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'INVALID_CURSOR',
      httpStatus: 400,
      message: 'El cursor de paginación está corrupto.',
    });
  }

  const candidate = parsed as Partial<DecodedClientHistoryCursor>;
  if (
    candidate.v !== 1 ||
    typeof candidate.uid !== 'string' ||
    !candidate.uid.trim() ||
    typeof candidate.requestedAt !== 'string' ||
    !candidate.requestedAt.trim() ||
    Number.isNaN(Date.parse(candidate.requestedAt)) ||
    typeof candidate.id !== 'string' ||
    !candidate.id.trim() ||
    !isSafeFirestoreDocId(candidate.id)
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'INVALID_CURSOR',
      httpStatus: 400,
      message: 'El cursor de paginación carece de campos requeridos válidos.',
    });
  }

  if (candidate.uid.trim() !== authenticatedUid.trim()) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'FORBIDDEN_CROSS_UID_CURSOR',
      httpStatus: 403,
      message: 'Acceso denegado: el cursor de paginación pertenece a otro usuario.',
    });
  }

  return {
    v: 1,
    uid: candidate.uid.trim(),
    requestedAt: candidate.requestedAt.trim(),
    id: candidate.id.trim(),
  };
}

export function parseClientHistoryLimit(rawLimit: unknown): number {
  if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
    return DEFAULT_CLIENT_HISTORY_LIMIT;
  }
  const parsed =
    typeof rawLimit === 'number'
      ? rawLimit
      : typeof rawLimit === 'string' && /^\d+$/.test(rawLimit.trim())
        ? Number(rawLimit.trim())
        : Number.NaN;

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_CLIENT_HISTORY_LIMIT
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'INVALID_PAGINATION_LIMIT',
      httpStatus: 400,
      message: `El parámetro limit debe ser un entero entre 1 y ${MAX_CLIENT_HISTORY_LIMIT}.`,
    });
  }
  return parsed;
}

/**
 * Strips all internal administrative/audit fields (`internalNotes`, `reviewedBy`,
 * `approvedBy`, `processedBy`, `broadcastedBy`, `completedBy`, `rejectedBy`,
 * `cancelledBy`, `providerTransactionId`, `idempotencyKey`, `userEmail`) from a
 * `/withdrawalRequests` document before returning it to a client session.
 */
export function sanitizeClientWithdrawalRecord(
  docId: string,
  raw: Record<string, unknown>,
): SanitizedClientWithdrawalDto {
  const id =
    typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : docId.trim();

  const sanitized: SanitizedClientWithdrawalDto = {
    id,
    userId: String(raw.userId ?? ''),
    asset: (raw.asset as WithdrawalRequest['asset']) ?? 'USDT',
    networkId: String(raw.networkId ?? ''),
    network: raw.network as WithdrawalRequest['network'],
    networkDisplayName: String(raw.networkDisplayName ?? ''),
    addressType: raw.addressType as WithdrawalRequest['addressType'],
    destinationAddress: String(raw.destinationAddress ?? ''),
    requestedAmountMicros: Number(raw.requestedAmountMicros ?? 0),
    networkFeeMicros: Number(raw.networkFeeMicros ?? 0),
    platformFeeMicros: Number(raw.platformFeeMicros ?? 0),
    conversionFeeMicros: Number(raw.conversionFeeMicros ?? 0),
    totalDebitMicros: Number(raw.totalDebitMicros ?? 0),
    netAmountMicros: Number(raw.netAmountMicros ?? 0),
    status: raw.status as WithdrawalRequest['status'],
    membershipTierSnapshot:
      raw.membershipTierSnapshot as WithdrawalRequest['membershipTierSnapshot'],
    slaDisplaySnapshot: String(raw.slaDisplaySnapshot ?? ''),
    confirmations: Number(raw.confirmations ?? 0),
    requiredConfirmations: Number(raw.requiredConfirmations ?? 0),
    configVersion: Number(raw.configVersion ?? 1),
    requestedAt: String(raw.requestedAt ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
    ...(typeof raw.txHash === 'string' && raw.txHash.trim()
      ? { txHash: raw.txHash.trim() }
      : {}),
    ...(typeof raw.explorerTxUrl === 'string' && raw.explorerTxUrl.trim()
      ? { explorerTxUrl: raw.explorerTxUrl.trim() }
      : {}),
    ...(typeof raw.rejectionReason === 'string' && raw.rejectionReason.trim()
      ? { rejectionReason: raw.rejectionReason.trim() }
      : {}),
    ...(typeof raw.cancellationReason === 'string' && raw.cancellationReason.trim()
      ? { cancellationReason: raw.cancellationReason.trim() }
      : {}),
    ...(typeof raw.reviewedAt === 'string' && raw.reviewedAt.trim()
      ? { reviewedAt: raw.reviewedAt.trim() }
      : {}),
    ...(typeof raw.approvedAt === 'string' && raw.approvedAt.trim()
      ? { approvedAt: raw.approvedAt.trim() }
      : {}),
    ...(typeof raw.processingAt === 'string' && raw.processingAt.trim()
      ? { processingAt: raw.processingAt.trim() }
      : {}),
    ...(typeof raw.broadcastedAt === 'string' && raw.broadcastedAt.trim()
      ? { broadcastedAt: raw.broadcastedAt.trim() }
      : {}),
    ...(typeof raw.completedAt === 'string' && raw.completedAt.trim()
      ? { completedAt: raw.completedAt.trim() }
      : {}),
    ...(typeof raw.rejectedAt === 'string' && raw.rejectedAt.trim()
      ? { rejectedAt: raw.rejectedAt.trim() }
      : {}),
    ...(typeof raw.cancelledAt === 'string' && raw.cancelledAt.trim()
      ? { cancelledAt: raw.cancelledAt.trim() }
      : {}),
  };

  return sanitized;
}

/**
 * Lists paginated withdrawal requests belonging strictly to `principal.uid`,
 * ordered by `requestedAt DESC` using cursor pagination (`startAfter(docSnapshot)`).
 */
export async function listClientWithdrawalsHistory(
  firestore: FirestoreLike | null | undefined,
  principal: WithdrawalClientPrincipal,
  queryInput: ClientWithdrawalHistoryQueryInput = {},
): Promise<ClientWithdrawalHistoryResponseDto> {
  if (!firestore) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'HISTORY_FIRESTORE_UNAVAILABLE',
      httpStatus: 503,
      message: 'Firestore no está disponible para consultar el historial de retiros.',
    });
  }

  const limit = parseClientHistoryLimit(queryInput.limit);
  const rawCursor =
    typeof queryInput.cursor === 'string' ? queryInput.cursor.trim() : '';
  const decodedCursor = rawCursor
    ? decodeClientHistoryCursor(rawCursor, principal.uid)
    : null;

  const collection = firestore.collection(
    WITHDRAWAL_REQUESTS_COLLECTION,
  ) as QueryableFirestoreCollectionLike;

  let cursorSnap: FirestoreDocumentSnapshotLike | null = null;
  if (decodedCursor) {
    try {
      cursorSnap = await collection.doc(decodedCursor.id).get();
    } catch (err) {
      throw new WithdrawalModuleError({
        originTask: 'W07',
        originModule: 'HISTORY_UI',
        code: 'HISTORY_FETCH_FAILED',
        httpStatus: 503,
        message:
          err instanceof Error
            ? err.message
            : 'Error al validar el cursor del historial.',
      });
    }

    if (!unwrapSnapshotExists(cursorSnap)) {
      throw new WithdrawalModuleError({
        originTask: 'W07',
        originModule: 'HISTORY_UI',
        code: 'INVALID_CURSOR',
        httpStatus: 400,
        message: 'El documento referenciado por el cursor ya no existe.',
      });
    }

    const cursorData = unwrapSnapshotData(cursorSnap) || {};
    const cursorOwner =
      typeof cursorData.userId === 'string' ? cursorData.userId.trim() : '';
    if (cursorOwner !== principal.uid) {
      throw new WithdrawalModuleError({
        originTask: 'W07',
        originModule: 'HISTORY_UI',
        code: 'FORBIDDEN_CROSS_UID_CURSOR',
        httpStatus: 403,
        message: 'Acceso denegado: el cursor apunta a un retiro de otro usuario.',
      });
    }

    if (String(cursorData.requestedAt ?? '').trim() !== decodedCursor.requestedAt) {
      throw new WithdrawalModuleError({
        originTask: 'W07',
        originModule: 'HISTORY_UI',
        code: 'INVALID_CURSOR',
        httpStatus: 400,
        message: 'El cursor de paginación no coincide con la marca temporal del retiro.',
      });
    }
  }

  let docs: FirestoreDocumentSnapshotLike[] = [];
  try {
    if (typeof collection.where === 'function') {
      // Canonical indexed query: where('userId', '==', uid).orderBy('requestedAt', 'desc')
      let q = collection
        .where('userId', '==', principal.uid)
        .orderBy('requestedAt', 'desc');
      if (cursorSnap) {
        q = q.startAfter(cursorSnap);
      }
      const querySnapshot = await q.limit(limit + 1).get();
      docs = querySnapshot.docs;
    } else {
      // Minimal collection fallback (used only by basic in-memory test adapters without `.where`)
      const fullSnap = await collection.get();
      const ownDocs = fullSnap.docs
        .filter((snap) => {
          const data = unwrapSnapshotData(snap);
          return (
            unwrapSnapshotExists(snap) &&
            data &&
            String(data.userId ?? '').trim() === principal.uid
          );
        })
        .sort((a, b) => {
          const dataA = unwrapSnapshotData(a) || {};
          const dataB = unwrapSnapshotData(b) || {};
          const cmpTime = String(dataB.requestedAt ?? '').localeCompare(
            String(dataA.requestedAt ?? ''),
          );
          if (cmpTime !== 0) return cmpTime;
          return resolveSnapshotId(b, dataB).localeCompare(
            resolveSnapshotId(a, dataA),
          );
        });

      let startIndex = 0;
      if (decodedCursor) {
        const idx = ownDocs.findIndex(
          (snap) =>
            resolveSnapshotId(snap, unwrapSnapshotData(snap)) === decodedCursor.id,
        );
        startIndex = idx >= 0 ? idx + 1 : ownDocs.length;
      }
      docs = ownDocs.slice(startIndex, startIndex + limit + 1);
    }
  } catch (err) {
    if (isWithdrawalModuleError(err)) {
      throw err;
    }
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'HISTORY_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? err.message
          : 'Error al consultar las solicitudes de retiro en Firestore.',
    });
  }

  const hasMore = docs.length > limit;
  const pageDocs = hasMore ? docs.slice(0, limit) : docs;

  const items: SanitizedClientWithdrawalDto[] = [];
  for (const snap of pageDocs) {
    if (!unwrapSnapshotExists(snap)) continue;
    const data = unwrapSnapshotData(snap) || {};
    const docId = resolveSnapshotId(snap, data);
    const ownership = assertClientWithdrawalOwnership(
      principal.uid,
      String(data.userId ?? ''),
    );
    if (!ownership.allowed) {
      throw new WithdrawalModuleError({
        originTask: 'W02',
        originModule: 'AUTHZ',
        code: ownership.code ?? 'FORBIDDEN_CROSS_UID_ACCESS',
        httpStatus: 403,
        message: ownership.error ?? 'Acceso denegado a registro de otro usuario.',
      });
    }
    items.push(sanitizeClientWithdrawalRecord(docId, data));
  }

  const lastItem = items.length > 0 ? items[items.length - 1] : null;
  const nextCursor =
    hasMore && lastItem
      ? encodeClientHistoryCursor(principal.uid, lastItem.requestedAt, lastItem.id)
      : null;

  return {
    ok: true,
    items,
    nextCursor,
    hasMore,
    limit,
  };
}

/**
 * Fetches a single withdrawal detail for `principal.uid`, enforcing W02 ownership
 * (`403 W02-AUTHZ-403-FORBIDDEN_CROSS_UID_ACCESS` on cross-UID access).
 */
export async function getClientWithdrawalDetail(
  firestore: FirestoreLike | null | undefined,
  principal: WithdrawalClientPrincipal,
  withdrawalId: string,
): Promise<ClientWithdrawalDetailResponseDto> {
  if (!firestore) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'HISTORY_FIRESTORE_UNAVAILABLE',
      httpStatus: 503,
      message: 'Firestore no está disponible para consultar el detalle del retiro.',
    });
  }

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
  if (!isSafeFirestoreDocId(cleanId)) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'INVALID_WITHDRAWAL_ID',
      httpStatus: 400,
      message: 'El identificador withdrawalId contiene caracteres no permitidos.',
    });
  }

  let snap: FirestoreDocumentSnapshotLike;
  try {
    snap = await firestore
      .collection(WITHDRAWAL_REQUESTS_COLLECTION)
      .doc(cleanId)
      .get();
  } catch (err) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'HISTORY_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? err.message
          : 'Error al consultar el detalle del retiro en Firestore.',
    });
  }

  if (!unwrapSnapshotExists(snap)) {
    throw new WithdrawalModuleError({
      originTask: 'W07',
      originModule: 'HISTORY_UI',
      code: 'WITHDRAWAL_NOT_FOUND',
      httpStatus: 404,
      message: `No se encontró la solicitud de retiro "${cleanId}".`,
    });
  }

  const data = unwrapSnapshotData(snap) || {};
  const ownership = assertClientWithdrawalOwnership(
    principal.uid,
    String(data.userId ?? ''),
  );
  if (!ownership.allowed) {
    throw new WithdrawalModuleError({
      originTask: 'W02',
      originModule: 'AUTHZ',
      code: ownership.code ?? 'FORBIDDEN_CROSS_UID_ACCESS',
      httpStatus: 403,
      message:
        ownership.error ??
        'Acceso denegado: no puede consultar solicitudes de retiro de otro usuario.',
    });
  }

  return {
    ok: true,
    withdrawal: sanitizeClientWithdrawalRecord(resolveSnapshotId(snap, data), data),
  };
}
