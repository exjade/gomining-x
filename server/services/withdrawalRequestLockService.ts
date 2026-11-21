/**
 * SCRUM-275 / SCRUM-289 / SCRUM-279 (W04)
 * Server-Authoritative Atomic Withdrawal Request & Balance Lock Service (`POST /api/withdrawals/request`).
 *
 * Architectural Guarantees:
 * 1. Executes strictly inside `firestore.runTransaction(async (tx) => ...)` with Phase 1 (Reads)
 *    and Phase 2 (Atomic Writes), and ZERO external network/blockchain calls inside the transaction callback.
 * 2. Deterministic idempotency via `/withdrawal_idempotency/{uid}__{idempotencyKey}` (server-only collection
 *    covered by `firestore.rules` default-deny):
 *    - Exact payload replay returns `200 OK` (`idempotentReplay: true`) without re-debiting or duplicating ledger entries.
 *    - Payload mismatch under the same `idempotencyKey` fails closed with `409 W04-LOCK_TX-409-IDEMPOTENCY_KEY_PAYLOAD_CONFLICT`.
 * 3. Atomic balance reservation (`AVAILABLE -> LOCKED`) in `/userBalances/{uid}` + mirror sync of `/users/{uid}.balance`
 *    (Decision 1 compatibility with SCRUM-221 `platformBalancePurchaseService`).
 * 4. Atomic creation of `/withdrawalRequests/{withdrawalId}` (`REQUESTED`), `/financialLedger/{ledgerEntryId}`
 *    (`WITHDRAWAL_LOCK`), and `/withdrawalAuditEvents/{auditEventId}` (`CREATE`).
 */

import crypto from 'node:crypto';
import type {
  FirestoreCollectionLike,
  FirestoreDocumentSnapshotLike,
  FirestoreLike,
} from './firebaseAdminAllowlistAdapter.js';
import type { WithdrawalClientPrincipal } from './withdrawalAuthzMiddleware.js';
import {
  extractUsersMirrorBalanceMicros,
  isSafeFirestoreDocId,
  normalizePlatformMembershipTier,
  validateWithdrawalNetworkConfigDoc,
  type WithdrawalNetworksServiceOptions,
} from './withdrawalNetworksService.js';
import {
  sanitizeClientWithdrawalRecord,
  type SanitizedClientWithdrawalDto,
} from './withdrawalClientHistoryService.js';
import {
  FINANCIAL_LEDGER_COLLECTION,
  USERS_COLLECTION,
  USER_BALANCES_COLLECTION,
  WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
  WITHDRAWAL_NETWORKS_COLLECTION,
  WITHDRAWAL_REQUESTS_COLLECTION,
  WithdrawalModuleError,
  applyAtomicWithdrawalLock,
  isValidMicrosInteger,
  isWithdrawalModuleError,
  microsToUsdt,
  type CreateWithdrawalRequestDto,
  type FinancialLedgerEntry,
  type UserFinancialBalance,
  type WithdrawalAuditEvent,
  type WithdrawalNetworkConfig,
} from '../../src/types/withdrawal.js';

export const WITHDRAWAL_IDEMPOTENCY_COLLECTION = 'withdrawal_idempotency' as const;

export interface FirestoreDocRefLike {
  id?: string;
  get(): Promise<FirestoreDocumentSnapshotLike>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
}

export interface FirestoreTransactionLike {
  get(ref: FirestoreDocRefLike): Promise<FirestoreDocumentSnapshotLike>;
  set(
    ref: FirestoreDocRefLike,
    data: Record<string, unknown>,
    options?: { merge?: boolean },
  ): unknown;
  update?(ref: FirestoreDocRefLike, data: Record<string, unknown>): unknown;
}

export interface TransactionalFirestoreLike extends FirestoreLike {
  collection(name: string): FirestoreCollectionLike;
  runTransaction?<T>(
    updateFunction: (transaction: FirestoreTransactionLike) => Promise<T>,
  ): Promise<T>;
}

export interface AtomicWithdrawalRequestOptions extends WithdrawalNetworksServiceOptions {
  nowIso?: () => string;
  generateWithdrawalId?: (uid: string, idempotencyKey: string) => string;
}

export interface AtomicWithdrawalRequestResponse {
  ok: true;
  status: 200 | 201;
  idempotentReplay: boolean;
  withdrawalRequest: SanitizedClientWithdrawalDto;
  userBalance: UserFinancialBalance;
  syncedUserBalanceUsdt: number;
  ledgerEntry?: FinancialLedgerEntry;
  auditEvent?: WithdrawalAuditEvent;
  ledgerEntryId: string;
  auditEventId: string;
}

function unwrapSnapshotExists(snap: FirestoreDocumentSnapshotLike | any): boolean {
  if (!snap) return false;
  return typeof snap.exists === 'function' ? Boolean(snap.exists()) : Boolean(snap.exists);
}

function unwrapSnapshotData(
  snap: FirestoreDocumentSnapshotLike | any,
): Record<string, unknown> | undefined {
  if (!snap) return undefined;
  return typeof snap.data === 'function' ? snap.data() : snap.data;
}

function sanitizeIdempotencyKeyForDocId(key: string): string {
  return key.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
}

function mapDomainLockErrorToW04(error: unknown): never {
  if (isWithdrawalModuleError(error)) {
    const httpStatus =
      error.code === 'INSUFFICIENT_AVAILABLE_BALANCE'
        ? 409
        : (error.httpStatus ?? 422);
    const cleanMsg = error.message.replace(/^\[[^\]]+\]\s*[A-Z0-9_]+:\s*/i, '').trim();
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'LOCK_TX',
      code: error.code,
      httpStatus,
      message: cleanMsg || error.message,
    });
  }
  throw error;
}

/**
 * Executes an atomic USDT withdrawal request inside a Firestore transaction.
 */
export async function executeAtomicWithdrawalRequest(
  firestore: TransactionalFirestoreLike | null | undefined,
  principal: Pick<WithdrawalClientPrincipal, 'uid' | 'email'>,
  dto: CreateWithdrawalRequestDto,
  options: AtomicWithdrawalRequestOptions = {},
): Promise<AtomicWithdrawalRequestResponse> {
  if (!firestore || typeof firestore.runTransaction !== 'function') {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'LOCK_TX',
      code: 'TRANSACTION_FIRESTORE_UNAVAILABLE',
      httpStatus: 503,
      message: 'Firestore transaccional no está disponible para procesar solicitudes de retiro.',
    });
  }

  if (!dto || typeof dto !== 'object') {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'LOCK_TX',
      code: 'INVALID_REQUEST_PAYLOAD',
      httpStatus: 400,
      message: 'El cuerpo de la solicitud de retiro es obligatorio.',
    });
  }

  const cleanNetworkId = typeof dto.networkId === 'string' ? dto.networkId.trim() : '';
  if (!cleanNetworkId) {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'LOCK_TX',
      code: 'NETWORK_ID_REQUIRED',
      httpStatus: 400,
      message: 'Debe especificar networkId para solicitar el retiro.',
    });
  }
  if (!isSafeFirestoreDocId(cleanNetworkId)) {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'LOCK_TX',
      code: 'INVALID_NETWORK_ID',
      httpStatus: 400,
      message: 'El identificador networkId contiene caracteres no permitidos.',
    });
  }

  const cleanDestinationAddress =
    typeof dto.destinationAddress === 'string' ? dto.destinationAddress.trim() : '';
  if (!cleanDestinationAddress) {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'LOCK_TX',
      code: 'DESTINATION_ADDRESS_REQUIRED',
      httpStatus: 400,
      message: 'La dirección de destino es obligatoria.',
    });
  }

  const cleanIdempotencyKey =
    typeof dto.idempotencyKey === 'string' ? dto.idempotencyKey.trim() : '';
  if (cleanIdempotencyKey.length < 8 || cleanIdempotencyKey.length > 128) {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'LOCK_TX',
      code: 'INVALID_IDEMPOTENCY_KEY',
      httpStatus: 400,
      message: 'idempotencyKey es obligatoria y debe tener entre 8 y 128 caracteres.',
    });
  }

  if (!isValidMicrosInteger(dto.requestedAmountMicros)) {
    throw new WithdrawalModuleError({
      originTask: 'W04',
      originModule: 'LOCK_TX',
      code: 'INVALID_REQUESTED_AMOUNT',
      httpStatus: 400,
      message: 'requestedAmountMicros debe ser un entero válido en micro-USDT.',
    });
  }

  const safeKeySuffix = sanitizeIdempotencyKeyForDocId(cleanIdempotencyKey);
  const idempotencyDocId = `${principal.uid}__${safeKeySuffix}`;

  return await firestore.runTransaction(async (tx: FirestoreTransactionLike) => {
    // ========================================================================
    // PHASE 1: READS ONLY (Zero external calls inside Firestore transaction)
    // ========================================================================

    // 1. Check deterministic idempotency record
    const idempotencyRef = firestore
      .collection(WITHDRAWAL_IDEMPOTENCY_COLLECTION)
      .doc(idempotencyDocId);
    const idempotencySnap = await tx.get(idempotencyRef);

    if (unwrapSnapshotExists(idempotencySnap)) {
      const cached = unwrapSnapshotData(idempotencySnap) || {};
      const sameNetwork =
        cached.networkId === cleanNetworkId || cached.requestedNetworkId === cleanNetworkId;
      const sameAddress = cached.destinationAddress === cleanDestinationAddress;
      const sameAmount = cached.requestedAmountMicros === dto.requestedAmountMicros;

      if (!sameNetwork || !sameAddress || !sameAmount) {
        throw new WithdrawalModuleError({
          originTask: 'W04',
          originModule: 'LOCK_TX',
          code: 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT',
          httpStatus: 409,
          message:
            'La clave idempotencyKey ya fue utilizada con parámetros financieros distintos (red, dirección o monto).',
        });
      }

      const existingWithdrawalId = String(cached.withdrawalId || '');
      const existingWithdrawalRef = firestore
        .collection(WITHDRAWAL_REQUESTS_COLLECTION)
        .doc(existingWithdrawalId);
      const userBalanceRef = firestore
        .collection(USER_BALANCES_COLLECTION)
        .doc(principal.uid);

      const [existingWithdrawalSnap, existingBalanceSnap] = await Promise.all([
        tx.get(existingWithdrawalRef),
        tx.get(userBalanceRef),
      ]);

      const existingWithdrawalRaw = unwrapSnapshotData(existingWithdrawalSnap) || {};
      const existingBalance = unwrapSnapshotData(
        existingBalanceSnap,
      ) as unknown as UserFinancialBalance;

      // F-CRIT-04: Always sanitize withdrawal DTO on idempotent replay so internal admin fields
      // (`internalNotes`, `reviewedBy`, ..., `idempotencyKey`, `userEmail`) never leak to the client.
      const sanitizedReplay = sanitizeClientWithdrawalRecord(
        existingWithdrawalId,
        existingWithdrawalRaw,
      );

      return {
        ok: true,
        status: 200,
        idempotentReplay: true,
        withdrawalRequest: sanitizedReplay,
        userBalance: existingBalance,
        syncedUserBalanceUsdt: microsToUsdt(existingBalance?.availableBalanceMicros ?? 0),
        ledgerEntryId: String(cached.ledgerEntryId || ''),
        auditEventId: String(cached.auditEventId || ''),
      };
    }

    // 2. Read target network config strictly from /withdrawalNetworks (F-CRIT-01: fail-closed,
    //    zero canonical fallback by networkCode alias, zero fee downgrade)
    const networkRef = firestore
      .collection(WITHDRAWAL_NETWORKS_COLLECTION)
      .doc(cleanNetworkId);
    const networkSnap = await tx.get(networkRef);

    let networkConfig: WithdrawalNetworkConfig | null = null;
    if (unwrapSnapshotExists(networkSnap)) {
      const rawNet = unwrapSnapshotData(networkSnap);
      if (rawNet && rawNet.enabled === true) {
        try {
          networkConfig = validateWithdrawalNetworkConfigDoc(cleanNetworkId, rawNet);
        } catch (err) {
          if (isWithdrawalModuleError(err)) {
            throw new WithdrawalModuleError({
              originTask: 'W04',
              originModule: 'LOCK_TX',
              code: err.code,
              httpStatus: err.httpStatus ?? 422,
              message: err.message.replace(/^\[[^\]]+\]\s*[A-Z0-9_]+:\s*/i, '').trim(),
            });
          }
          throw err;
        }
      }
    }

    if (!networkConfig || !networkConfig.enabled) {
      throw new WithdrawalModuleError({
        originTask: 'W04',
        originModule: 'LOCK_TX',
        code: 'NETWORK_NOT_ENABLED',
        httpStatus: 404,
        message: `La red "${cleanNetworkId}" no existe o no está habilitada para retiros USDT.`,
      });
    }

    // 3. Read /userBalances/{uid} and /users/{uid} inside the same transaction
    const userBalanceRef = firestore.collection(USER_BALANCES_COLLECTION).doc(principal.uid);
    const userRef = firestore.collection(USERS_COLLECTION).doc(principal.uid);
    const [userBalanceSnap, userSnap] = await Promise.all([
      tx.get(userBalanceRef),
      tx.get(userRef),
    ]);

    const userExists = unwrapSnapshotExists(userSnap);
    const userData = userExists ? unwrapSnapshotData(userSnap) || {} : {};
    const usersMirrorMicros = userExists ? extractUsersMirrorBalanceMicros(userData) : null;
    const nowIso = options.nowIso ? options.nowIso() : new Date().toISOString();

    let currentBalance: UserFinancialBalance;
    if (unwrapSnapshotExists(userBalanceSnap)) {
      const balData = unwrapSnapshotData(userBalanceSnap) || {};
      const membershipTier = normalizePlatformMembershipTier(balData.membershipTier);
      const rawAvailableBalanceMicros = isValidMicrosInteger(balData.availableBalanceMicros)
        ? balData.availableBalanceMicros
        : 0;
      // F-CRIT-03: Cap effective withdrawable balance at min(/userBalances.available, /users.balance)
      // read in the SAME transaction — enforces conservation of money across SCRUM-221 purchases
      // and SCRUM-279 withdrawals without rejecting legitimate post-purchase divergence.
      const effectiveAvailableBalanceMicros =
        usersMirrorMicros !== null
          ? Math.min(rawAvailableBalanceMicros, usersMirrorMicros)
          : rawAvailableBalanceMicros;

      currentBalance = {
        uid: principal.uid,
        email:
          typeof balData.email === 'string' && balData.email.trim()
            ? balData.email.trim().toLowerCase()
            : principal.email,
        membershipTier,
        availableBalanceMicros: effectiveAvailableBalanceMicros,
        lockedBalanceMicros: isValidMicrosInteger(balData.lockedBalanceMicros)
          ? balData.lockedBalanceMicros
          : 0,
        totalWithdrawnMicros: isValidMicrosInteger(balData.totalWithdrawnMicros)
          ? balData.totalWithdrawnMicros
          : 0,
        version:
          typeof balData.version === 'number' &&
          Number.isSafeInteger(balData.version) &&
          balData.version >= 1
            ? balData.version
            : 1,
        updatedAt:
          typeof balData.updatedAt === 'string' && balData.updatedAt.trim()
            ? balData.updatedAt
            : nowIso,
      };
    } else {
      // Initialize from /users/{uid}.balance mirror on first transactional withdrawal
      const membershipTier = normalizePlatformMembershipTier(
        userData.membershipTier ?? userData.subscriptionTier,
      );
      const availableBalanceMicros = usersMirrorMicros ?? 0;

      currentBalance = {
        uid: principal.uid,
        email: principal.email,
        membershipTier,
        availableBalanceMicros,
        lockedBalanceMicros: 0,
        totalWithdrawnMicros: 0,
        version: 0,
        updatedAt: nowIso,
      };
    }

    // ========================================================================
    // PURE DOMAIN EVALUATION (Atomic Lock + Fee Calculation + SLA Snapshot)
    // ========================================================================
    // F-MED-02: Opaque CSPRNG UUID withdrawalId (no embedded UID or predictable suffix)
    const withdrawalId = options.generateWithdrawalId
      ? options.generateWithdrawalId(principal.uid, cleanIdempotencyKey)
      : `wth_${crypto.randomUUID()}`;
    const ledgerEntryId = `led_lock_${withdrawalId}`;
    const auditEventId = `aud_create_${withdrawalId}`;

    let lockResult;
    try {
      lockResult = applyAtomicWithdrawalLock(
        currentBalance,
        {
          networkId: networkConfig.id,
          destinationAddress: cleanDestinationAddress,
          requestedAmountMicros: dto.requestedAmountMicros,
          idempotencyKey: cleanIdempotencyKey,
        },
        networkConfig,
        {
          withdrawalId,
          ledgerEntryId,
          auditEventId,
          nowIso,
        },
      );
    } catch (err) {
      mapDomainLockErrorToW04(err);
    }

    // ========================================================================
    // PHASE 2: ATOMIC WRITES (All 6 documents committed together)
    // ========================================================================
    const withdrawalRef = firestore
      .collection(WITHDRAWAL_REQUESTS_COLLECTION)
      .doc(withdrawalId);
    const ledgerRef = firestore
      .collection(FINANCIAL_LEDGER_COLLECTION)
      .doc(ledgerEntryId);
    const auditRef = firestore
      .collection(WITHDRAWAL_AUDIT_EVENTS_COLLECTION)
      .doc(auditEventId);

    // 1. Update private authoritative balance `/userBalances/{uid}`
    tx.set(
      userBalanceRef,
      { ...lockResult.updatedBalance } as unknown as Record<string, unknown>,
      { merge: true },
    );

    // 2. Synchronize `/users/{uid}.balance` mirror (Decision 1 for SCRUM-221 & AuthContext topbar)
    tx.set(
      userRef,
      {
        ...userData,
        uid: principal.uid,
        email: principal.email || userData.email || '',
        balance: lockResult.syncedUserBalanceUsdt,
        updatedAt: nowIso,
      },
      { merge: true },
    );

    // 3. Create `/withdrawalRequests/{withdrawalId}` (`REQUESTED`)
    tx.set(
      withdrawalRef,
      { ...lockResult.withdrawalRequest } as unknown as Record<string, unknown>,
    );

    // 4. Create immutable `/financialLedger/{ledgerEntryId}` (`WITHDRAWAL_LOCK`)
    tx.set(
      ledgerRef,
      { ...lockResult.ledgerEntry } as unknown as Record<string, unknown>,
    );

    // 5. Create immutable `/withdrawalAuditEvents/{auditEventId}` (`CREATE`)
    tx.set(
      auditRef,
      { ...lockResult.auditEvent } as unknown as Record<string, unknown>,
    );

    // 6. Create deterministic idempotency record `/withdrawal_idempotency/{uid}__{idempotencyKey}`
    tx.set(idempotencyRef, {
      uid: principal.uid,
      idempotencyKey: cleanIdempotencyKey,
      requestedNetworkId: cleanNetworkId,
      networkId: networkConfig.id,
      destinationAddress: cleanDestinationAddress,
      requestedAmountMicros: dto.requestedAmountMicros,
      totalDebitMicros: lockResult.withdrawalRequest.totalDebitMicros,
      withdrawalId,
      ledgerEntryId,
      auditEventId,
      status: 'COMPLETED',
      createdAt: nowIso,
    });

    // F-CRIT-04: Return strictly sanitized client DTO (strips all 11 internal fields)
    const sanitizedCreated = sanitizeClientWithdrawalRecord(
      withdrawalId,
      lockResult.withdrawalRequest as unknown as Record<string, unknown>,
    );

    return {
      ok: true,
      status: 201,
      idempotentReplay: false,
      withdrawalRequest: sanitizedCreated,
      userBalance: lockResult.updatedBalance,
      syncedUserBalanceUsdt: lockResult.syncedUserBalanceUsdt,
      ledgerEntryId,
      auditEventId,
    };
  });
}
