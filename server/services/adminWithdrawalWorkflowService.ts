/**
 * SCRUM-275 / SCRUM-289 / SCRUM-284 (W09)
 * Server-Authoritative Admin Withdrawals Workflow Service (`review`, `edit`, `approve`, `process`, `reject`, `cancel`).
 *
 * Architectural & Security Guarantees:
 * 1. Executes inside `firestore.runTransaction(async (tx) => ...)` with Phase 1 (all Reads)
 *    before Phase 2 (Atomic Writes). Zero external calls inside transactions.
 * 2. Enforces granular W02 RBAC permissions per action (`withdrawals.review`, `.edit`, `.approve`,
 *    `.process`, `.reject`, `.cancel`) without `SUPER_ADMIN` wildcard bypass.
 * 3. Optimistic concurrency control (`expectedStatus`) + W01 `applyAdminWithdrawalAction` state machine.
 * 4. Fast-path `REQUESTED -> APPROVED` populates `reviewedBy` & `reviewedAt` atomically alongside audit trail.
 * 5. `EDIT` enforces strict allowlist: `requestedAmountMicros` & fee/ledger fields are immutable (`422 W09-WORKFLOW-422-IMMUTABLE_FINANCIAL_FIELD`),
 *    `destinationAddress`/`networkId` editable only in `REQUESTED | UNDER_REVIEW` with W03 revalidation, `internalNotes` pre-broadcast,
 *    and complete freeze from `BROADCASTED` onward.
 * 6. `REJECT` / `CANCEL` unlock `LOCKED -> AVAILABLE` atomically ONCE via triple barrier + deterministic
 *    `/financialLedger/{withdrawalId}__UNLOCK` record + `/users/{uid}.balance` mirror sync.
 */

import crypto from 'node:crypto';
import type {
  FirestoreDocumentSnapshotLike,
} from './firebaseAdminAllowlistAdapter.js';
import type { WithdrawalAdminPrincipal } from './withdrawalAuthzMiddleware.js';
import {
  isSafeFirestoreDocId,
  validateWithdrawalNetworkConfigDoc,
  type WithdrawalNetworksServiceOptions,
} from './withdrawalNetworksService.js';
import type {
  FirestoreTransactionLike,
  TransactionalFirestoreLike,
} from './withdrawalRequestLockService.js';
import {
  FINANCIAL_LEDGER_COLLECTION,
  REQUIRED_PERMISSION_BY_AUDIT_ACTION,
  USERS_COLLECTION,
  USER_BALANCES_COLLECTION,
  WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
  WITHDRAWAL_NETWORKS_COLLECTION,
  WITHDRAWAL_REQUESTS_COLLECTION,
  WITHDRAWAL_STATUSES,
  WithdrawalModuleError,
  applyAdminWithdrawalAction,
  calculateWithdrawalQuote,
  hasWithdrawalPermission,
  isWithdrawalModuleError,
  isWithdrawalStatus,
  type AdminApproveWithdrawalDto,
  type AdminCancelWithdrawalDto,
  type AdminEditWithdrawalDto,
  type AdminProcessWithdrawalDto,
  type AdminRejectWithdrawalDto,
  type AdminReviewWithdrawalDto,
  type FinancialLedgerEntry,
  type UserFinancialBalance,
  type WithdrawalAuditEvent,
  type WithdrawalNetworkConfig,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from '../../src/types/withdrawal.js';

export type W09WorkflowAction =
  | 'REVIEW'
  | 'EDIT'
  | 'APPROVE'
  | 'PROCESS'
  | 'REJECT'
  | 'CANCEL';

export interface AdminWorkflowExecutionOptions extends WithdrawalNetworksServiceOptions {
  nowIso?: () => string;
  generateAuditEventId?: (withdrawalId: string, action: W09WorkflowAction) => string;
}

export interface AdminWorkflowExecutionResponse {
  ok: true;
  action: W09WorkflowAction;
  withdrawalRequest: WithdrawalRequest;
  userBalance?: UserFinancialBalance;
  syncedUserBalanceUsdt?: number;
  ledgerEntry?: FinancialLedgerEntry;
  ledgerEntryId?: string;
  auditEvent: WithdrawalAuditEvent;
  auditEventId: string;
}

const FORBIDDEN_EDIT_KEYS = [
  'id',
  'userId',
  'userEmail',
  'asset',
  'requestedAmountMicros',
  'requestedAmount',
  'amount',
  'amountMicros',
  'networkFeeMicros',
  'platformFeeMicros',
  'conversionFeeMicros',
  'totalDebitMicros',
  'netAmountMicros',
  'status',
  'membershipTierSnapshot',
  'slaDisplaySnapshot',
  'confirmations',
  'requiredConfirmations',
  'txHash',
  'explorerTxUrl',
  'idempotencyKey',
  'configVersion',
  'requestedAt',
  'createdAt',
] as const;

const ALLOWED_EDIT_REQUEST_KEYS = new Set<string>([
  'expectedStatus',
  'destinationAddress',
  'networkId',
  'internalNotes',
  'reason',
]);

function unwrapExists(snap: FirestoreDocumentSnapshotLike | undefined | null): boolean {
  if (!snap) return false;
  const raw = (snap as { exists: boolean | (() => boolean) }).exists;
  return typeof raw === 'function' ? Boolean(raw.call(snap)) : Boolean(raw);
}

function unwrapData(
  snap: FirestoreDocumentSnapshotLike | undefined | null,
): Record<string, unknown> | undefined {
  if (!snap) return undefined;
  return typeof snap.data === 'function' ? snap.data() : undefined;
}

function defaultAuditEventId(withdrawalId: string, action: W09WorkflowAction): string {
  const rand = crypto.randomBytes(6).toString('hex');
  return `aud_${withdrawalId}_${action.toLowerCase()}_${Date.now()}_${rand}`;
}

export function deterministicUnlockLedgerId(withdrawalId: string): string {
  return `${withdrawalId}__UNLOCK`;
}

function assertValidExpectedStatus(rawStatus: unknown): WithdrawalStatus {
  if (!isWithdrawalStatus(rawStatus)) {
    throw new WithdrawalModuleError({
      originTask: 'W09',
      originModule: 'WORKFLOW',
      code: 'INVALID_WORKFLOW_PAYLOAD',
      httpStatus: 400,
      message: `expectedStatus inválido o ausente ("${String(rawStatus)}"). Valores permitidos: ${WITHDRAWAL_STATUSES.join(', ')}.`,
    });
  }
  return rawStatus;
}

function assertTransactionalFirestore(
  firestore: TransactionalFirestoreLike | null | undefined,
): asserts firestore is TransactionalFirestoreLike & {
  runTransaction<T>(fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T>;
} {
  if (!firestore || typeof firestore.runTransaction !== 'function') {
    throw new WithdrawalModuleError({
      originTask: 'W09',
      originModule: 'WORKFLOW',
      code: 'WORKFLOW_FIRESTORE_UNAVAILABLE',
      httpStatus: 503,
      message: 'Firestore transaccional (runTransaction) no está disponible para operaciones de workflow Admin.',
    });
  }
}

function assertWorkflowPermission(
  adminPrincipal: WithdrawalAdminPrincipal,
  action: W09WorkflowAction,
): void {
  const requiredPerm = REQUIRED_PERMISSION_BY_AUDIT_ACTION[action];
  if (!hasWithdrawalPermission(adminPrincipal.permissions, requiredPerm)) {
    throw new WithdrawalModuleError({
      originTask: 'W02',
      originModule: 'AUTHZ',
      code: 'FORBIDDEN_WITHDRAWAL_PERMISSION',
      httpStatus: 403,
      message: `Operador "${adminPrincipal.uid}" carece del permiso granular requerido "${requiredPerm}" para ${action}.`,
    });
  }
}

function assertCleanWithdrawalId(withdrawalId: string): string {
  const cleanId = typeof withdrawalId === 'string' ? withdrawalId.trim() : '';
  if (!cleanId) {
    throw new WithdrawalModuleError({
      originTask: 'W09',
      originModule: 'WORKFLOW',
      code: 'WITHDRAWAL_ID_REQUIRED',
      httpStatus: 400,
      message: 'El identificador withdrawalId es obligatorio.',
    });
  }
  if (!isSafeFirestoreDocId(cleanId)) {
    throw new WithdrawalModuleError({
      originTask: 'W09',
      originModule: 'WORKFLOW',
      code: 'INVALID_WORKFLOW_PAYLOAD',
      httpStatus: 400,
      message: 'El identificador withdrawalId contiene caracteres no permitidos.',
    });
  }
  return cleanId;
}

function assertNoForbiddenEditFields(rawBody: Record<string, unknown>): void {
  for (const forbiddenKey of FORBIDDEN_EDIT_KEYS) {
    if (forbiddenKey in rawBody && rawBody[forbiddenKey] !== undefined) {
      throw new WithdrawalModuleError({
        originTask: 'W09',
        originModule: 'WORKFLOW',
        code: 'IMMUTABLE_FINANCIAL_FIELD',
        httpStatus: 422,
        message: `El campo "${forbiddenKey}" es inmutable en W09 EDIT y no puede modificarse post-solicitud.`,
      });
    }
  }
  for (const key of Object.keys(rawBody)) {
    if (!ALLOWED_EDIT_REQUEST_KEYS.has(key) && rawBody[key] !== undefined) {
      throw new WithdrawalModuleError({
        originTask: 'W09',
        originModule: 'WORKFLOW',
        code: 'INVALID_WORKFLOW_PAYLOAD',
        httpStatus: 400,
        message: `Campo no permitido en la allowlist de PATCH: "${key}".`,
      });
    }
  }
}

async function resolveNetworkForEditInTx(
  firestore: TransactionalFirestoreLike,
  tx: FirestoreTransactionLike,
  networkId: string,
  _options: AdminWorkflowExecutionOptions,
): Promise<WithdrawalNetworkConfig> {
  if (!isSafeFirestoreDocId(networkId)) {
    throw new WithdrawalModuleError({
      originTask: 'W09',
      originModule: 'WORKFLOW',
      code: 'INVALID_WORKFLOW_PAYLOAD',
      httpStatus: 400,
      message: `El identificador de red "${networkId}" contiene caracteres no permitidos.`,
    });
  }
  const networkRef = firestore
    .collection(WITHDRAWAL_NETWORKS_COLLECTION)
    .doc(networkId);
  const netSnap = await tx.get(networkRef);

  if (unwrapExists(netSnap)) {
    const rawNet = unwrapData(netSnap);
    if (!rawNet || rawNet.enabled !== true) {
      throw new WithdrawalModuleError({
        originTask: 'W09',
        originModule: 'WORKFLOW',
        code: 'INVALID_WORKFLOW_PAYLOAD',
        httpStatus: 404,
        message: `La red "${networkId}" está deshabilitada y no puede asignarse en EDIT.`,
      });
    }
    return validateWithdrawalNetworkConfigDoc(networkId, rawNet);
  }

  // F-CRIT-01: Fail-closed strictly to Firestore /withdrawalNetworks (zero canonical fallback)
  throw new WithdrawalModuleError({
    originTask: 'W09',
    originModule: 'WORKFLOW',
    code: 'INVALID_WORKFLOW_PAYLOAD',
    httpStatus: 404,
    message: `La red de destino "${networkId}" no existe en /withdrawalNetworks.`,
  });
}

function hydrateWithdrawal(docId: string, raw: Record<string, unknown>): WithdrawalRequest {
  return {
    ...(raw as unknown as WithdrawalRequest),
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : docId,
  };
}

function buildFallbackBalancePlaceholder(req: WithdrawalRequest): UserFinancialBalance {
  return {
    uid: req.userId,
    email: req.userEmail,
    membershipTier: req.membershipTierSnapshot,
    availableBalanceMicros: 0,
    lockedBalanceMicros: req.totalDebitMicros,
    totalWithdrawnMicros: 0,
    version: 0,
    updatedAt: req.updatedAt,
  };
}

function mapDomainConflictToWorkflow(err: unknown): never {
  if (isWithdrawalModuleError(err)) {
    if (err.originTask === 'W01' && err.code === 'CONCURRENCY_STATUS_MISMATCH') {
      throw new WithdrawalModuleError({
        originTask: 'W09',
        originModule: 'WORKFLOW',
        code: 'CONCURRENCY_STATUS_MISMATCH',
        httpStatus: 409,
        message: err.message.replace(/^\[[^\]]+\]\s*[A-Z0-9_]+:\s*/i, '').trim(),
      });
    }
    throw err;
  }
  throw new WithdrawalModuleError({
    originTask: 'W09',
    originModule: 'WORKFLOW',
    code: 'WORKFLOW_FAILED',
    httpStatus: 503,
    message: err instanceof Error ? err.message : 'Error inesperado en el workflow Admin.',
  });
}

export async function executeAdminWorkflowAction(
  firestore: TransactionalFirestoreLike | null | undefined,
  adminPrincipal: WithdrawalAdminPrincipal,
  withdrawalId: string,
  payload:
    | { action: 'REVIEW'; dto: AdminReviewWithdrawalDto }
    | { action: 'APPROVE'; dto: AdminApproveWithdrawalDto }
    | { action: 'PROCESS'; dto: AdminProcessWithdrawalDto }
    | { action: 'EDIT'; dto: AdminEditWithdrawalDto; rawBody?: Record<string, unknown> }
    | { action: 'REJECT'; dto: AdminRejectWithdrawalDto }
    | { action: 'CANCEL'; dto: AdminCancelWithdrawalDto },
  options: AdminWorkflowExecutionOptions = {},
): Promise<AdminWorkflowExecutionResponse> {
  assertTransactionalFirestore(firestore);
  assertWorkflowPermission(adminPrincipal, payload.action);
  const cleanId = assertCleanWithdrawalId(withdrawalId);

  if (!payload.dto || typeof payload.dto !== 'object') {
    throw new WithdrawalModuleError({
      originTask: 'W09',
      originModule: 'WORKFLOW',
      code: 'INVALID_WORKFLOW_PAYLOAD',
      httpStatus: 400,
      message: 'El cuerpo de la solicitud de workflow es obligatorio.',
    });
  }

  const expectedStatus = assertValidExpectedStatus(payload.dto.expectedStatus);

  if (payload.action === 'EDIT') {
    const rawForValidation =
      payload.rawBody ?? (payload.dto as unknown as Record<string, unknown>);
    assertNoForbiddenEditFields(rawForValidation);
    if (
      typeof payload.dto.reason !== 'string' ||
      !payload.dto.reason.trim()
    ) {
      throw new WithdrawalModuleError({
        originTask: 'W01',
        originModule: 'DOMAIN',
        code: 'EDIT_REASON_REQUIRED',
        httpStatus: 422,
        message: 'Debe especificar un motivo de auditoría para editar la solicitud.',
      });
    }
  }

  if (
    payload.action === 'REJECT' &&
    (typeof payload.dto.rejectionReason !== 'string' ||
      !payload.dto.rejectionReason.trim())
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'REASON_REQUIRED',
      httpStatus: 422,
      message: 'Es obligatorio registrar el motivo (rejectionReason) para rechazar un retiro.',
    });
  }

  if (
    payload.action === 'CANCEL' &&
    (typeof payload.dto.cancellationReason !== 'string' ||
      !payload.dto.cancellationReason.trim())
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W01',
      originModule: 'DOMAIN',
      code: 'REASON_REQUIRED',
      httpStatus: 422,
      message: 'Es obligatorio registrar el motivo (cancellationReason) para cancelar un retiro.',
    });
  }

  const nowIso = (options.nowIso ?? (() => new Date().toISOString()))();
  const auditEventId = (options.generateAuditEventId ?? defaultAuditEventId)(
    cleanId,
    payload.action,
  );
  const isUnlockAction = payload.action === 'REJECT' || payload.action === 'CANCEL';
  const unlockLedgerId = deterministicUnlockLedgerId(cleanId);

  return await firestore.runTransaction(async (tx: FirestoreTransactionLike) => {
    // ========================================================================
    // PHASE 1: READS ONLY
    // ========================================================================
    const withdrawalRef = firestore
      .collection(WITHDRAWAL_REQUESTS_COLLECTION)
      .doc(cleanId);
    const withdrawalSnap = await tx.get(withdrawalRef);
    if (!unwrapExists(withdrawalSnap)) {
      throw new WithdrawalModuleError({
        originTask: 'W09',
        originModule: 'WORKFLOW',
        code: 'WITHDRAWAL_NOT_FOUND',
        httpStatus: 404,
        message: `No se encontró la solicitud de retiro "${cleanId}".`,
      });
    }

    const currentRequest = hydrateWithdrawal(
      cleanId,
      unwrapData(withdrawalSnap) || {},
    );

    if (currentRequest.status !== expectedStatus) {
      throw new WithdrawalModuleError({
        originTask: 'W09',
        originModule: 'WORKFLOW',
        code: 'CONCURRENCY_STATUS_MISMATCH',
        httpStatus: 409,
        message: `Se esperaba estado "${expectedStatus}" pero la solicitud "${cleanId}" ahora está en "${currentRequest.status}".`,
      });
    }

    const balanceRef = firestore
      .collection(USER_BALANCES_COLLECTION)
      .doc(currentRequest.userId);
    const balanceSnap = await tx.get(balanceRef);
    const hasBalanceDoc = unwrapExists(balanceSnap);

    if (isUnlockAction && !hasBalanceDoc) {
      throw new WithdrawalModuleError({
        originTask: 'W09',
        originModule: 'WORKFLOW',
        code: 'BALANCE_NOT_FOUND',
        httpStatus: 404,
        message: `No existe documento /userBalances/${currentRequest.userId} para desbloquear fondos.`,
      });
    }

    const currentBalance = hasBalanceDoc
      ? (unwrapData(balanceSnap) as unknown as UserFinancialBalance)
      : buildFallbackBalancePlaceholder(currentRequest);

    let userRef: ReturnType<typeof firestore.collection> extends { doc(id: string): infer R }
      ? R
      : never;
    let userData: Record<string, unknown> = {};

    if (isUnlockAction) {
      const unlockLedgerRef = firestore
        .collection(FINANCIAL_LEDGER_COLLECTION)
        .doc(unlockLedgerId);
      userRef = firestore.collection(USERS_COLLECTION).doc(currentRequest.userId);

      const [unlockLedgerSnap, userSnap] = await Promise.all([
        tx.get(unlockLedgerRef),
        tx.get(userRef),
      ]);

      // Barrier 2: Prevent duplicate WITHDRAWAL_UNLOCK even under concurrent admin requests
      if (unwrapExists(unlockLedgerSnap)) {
        throw new WithdrawalModuleError({
          originTask: 'W09',
          originModule: 'WORKFLOW',
          code: 'ALREADY_UNLOCKED',
          httpStatus: 409,
          message: `Los fondos de "${cleanId}" ya fueron desbloqueados previamente (${unlockLedgerId}).`,
        });
      }

      if (unwrapExists(userSnap)) {
        userData = unwrapData(userSnap) || {};
      }
    }

    let editTargetNetworkConfig: WithdrawalNetworkConfig | undefined;
    if (payload.action === 'EDIT') {
      const wantsAddressChange =
        typeof payload.dto.destinationAddress === 'string' &&
        payload.dto.destinationAddress.trim() !== currentRequest.destinationAddress;
      const requestedNetId =
        typeof payload.dto.networkId === 'string' && payload.dto.networkId.trim()
          ? payload.dto.networkId.trim()
          : undefined;
      const wantsNetworkChange =
        requestedNetId !== undefined && requestedNetId !== currentRequest.networkId;
      const wantsNotesChange =
        typeof payload.dto.internalNotes === 'string' &&
        payload.dto.internalNotes !== (currentRequest.internalNotes ?? '');

      if (wantsAddressChange || wantsNetworkChange) {
        if (
          currentRequest.status !== 'REQUESTED' &&
          currentRequest.status !== 'UNDER_REVIEW'
        ) {
          throw new WithdrawalModuleError({
            originTask: 'W09',
            originModule: 'WORKFLOW',
            code: 'EDIT_STAGE_RESTRICTED',
            httpStatus: 422,
            message: `Solo se puede editar destinationAddress o networkId en estados REQUESTED o UNDER_REVIEW (actual: "${currentRequest.status}").`,
          });
        }

        const effectiveNetId = requestedNetId ?? currentRequest.networkId;
        editTargetNetworkConfig = await resolveNetworkForEditInTx(
          firestore,
          tx,
          effectiveNetId,
          options,
        );

        if (wantsNetworkChange) {
          const recalculatedQuote = calculateWithdrawalQuote(
            currentRequest.requestedAmountMicros,
            editTargetNetworkConfig,
          );
          const sameEconomics =
            recalculatedQuote.networkFeeMicros === currentRequest.networkFeeMicros &&
            recalculatedQuote.platformFeeMicros === currentRequest.platformFeeMicros &&
            recalculatedQuote.conversionFeeMicros === currentRequest.conversionFeeMicros &&
            recalculatedQuote.totalDebitMicros === currentRequest.totalDebitMicros;

          if (!sameEconomics) {
            throw new WithdrawalModuleError({
              originTask: 'W09',
              originModule: 'WORKFLOW',
              code: 'NETWORK_FEE_CHANGE_REQUIRES_REJECT',
              httpStatus: 422,
              message: `Cambiar a la red "${editTargetNetworkConfig.id}" modifica los fees (${recalculatedQuote.totalDebitMicros} vs ${currentRequest.totalDebitMicros} micro-USDT bloqueados). Rechaza o cancela la solicitud para crear una nueva.`,
            });
          }
        }
      }

      if (!wantsAddressChange && !wantsNetworkChange && !wantsNotesChange) {
        throw new WithdrawalModuleError({
          originTask: 'W09',
          originModule: 'WORKFLOW',
          code: 'NO_EDIT_CHANGES',
          httpStatus: 400,
          message: 'No se detectaron cambios reales en destinationAddress, networkId ni internalNotes.',
        });
      }
    }

    // Evaluate transition using W01 domain evaluator
    let result;
    try {
      const actionContext = {
        operatorUid: adminPrincipal.uid,
        operatorEmail: adminPrincipal.email,
        grantedPermissions: adminPrincipal.permissions,
        auditEventId,
        ...(isUnlockAction ? { ledgerEntryId: unlockLedgerId } : {}),
        nowIso,
      };

      if (payload.action === 'EDIT') {
        result = applyAdminWithdrawalAction(
          currentRequest,
          currentBalance,
          {
            action: 'EDIT',
            dto: payload.dto,
            ...(editTargetNetworkConfig
              ? { targetNetworkConfig: editTargetNetworkConfig }
              : {}),
          },
          actionContext,
        );
      } else if (payload.action === 'REVIEW') {
        result = applyAdminWithdrawalAction(
          currentRequest,
          currentBalance,
          { action: 'REVIEW', dto: payload.dto },
          actionContext,
        );
      } else if (payload.action === 'APPROVE') {
        result = applyAdminWithdrawalAction(
          currentRequest,
          currentBalance,
          { action: 'APPROVE', dto: payload.dto },
          actionContext,
        );
      } else if (payload.action === 'PROCESS') {
        result = applyAdminWithdrawalAction(
          currentRequest,
          currentBalance,
          { action: 'PROCESS', dto: payload.dto },
          actionContext,
        );
      } else if (payload.action === 'REJECT') {
        result = applyAdminWithdrawalAction(
          currentRequest,
          currentBalance,
          { action: 'REJECT', dto: payload.dto },
          actionContext,
        );
      } else {
        result = applyAdminWithdrawalAction(
          currentRequest,
          currentBalance,
          { action: 'CANCEL', dto: payload.dto },
          actionContext,
        );
      }
    } catch (err) {
      mapDomainConflictToWorkflow(err);
    }

    let finalRequest = result.withdrawalRequest;
    let finalAuditEvent = result.auditEvent;

    // Fast-path REQUESTED -> APPROVED guarantee (SCRUM-289): backfill reviewedBy/reviewedAt atomically
    if (
      payload.action === 'APPROVE' &&
      currentRequest.status === 'REQUESTED'
    ) {
      const reviewedBy = finalRequest.reviewedBy ?? adminPrincipal.uid;
      const reviewedAt = finalRequest.reviewedAt ?? nowIso;
      finalRequest = {
        ...finalRequest,
        reviewedBy,
        reviewedAt,
      };
      finalAuditEvent = {
        ...finalAuditEvent,
        changedValues: {
          ...(finalAuditEvent.changedValues ?? {}),
          fastPathReview: true,
          reviewedBy,
          reviewedAt,
          approvedBy: finalRequest.approvedBy,
          approvedAt: finalRequest.approvedAt,
        },
      };
    }

    // Apply validated network metadata updates on EDIT (same-economics network change)
    if (
      payload.action === 'EDIT' &&
      editTargetNetworkConfig &&
      editTargetNetworkConfig.id !== currentRequest.networkId
    ) {
      finalRequest = {
        ...finalRequest,
        networkId: editTargetNetworkConfig.id,
        network: editTargetNetworkConfig.networkCode,
        networkDisplayName: editTargetNetworkConfig.network,
        addressType: editTargetNetworkConfig.addressType,
        requiredConfirmations: editTargetNetworkConfig.requiredConfirmations,
        configVersion: editTargetNetworkConfig.configVersion,
      };
      finalAuditEvent = {
        ...finalAuditEvent,
        previousValues: {
          ...(finalAuditEvent.previousValues ?? {}),
          networkId: currentRequest.networkId,
          network: currentRequest.network,
        },
        changedValues: {
          ...(finalAuditEvent.changedValues ?? {}),
          networkId: editTargetNetworkConfig.id,
          network: editTargetNetworkConfig.networkCode,
        },
      };
    }

    // ========================================================================
    // PHASE 2: ATOMIC WRITES
    // ========================================================================
    const auditRef = firestore
      .collection(WITHDRAWAL_AUDIT_EVENTS_COLLECTION)
      .doc(auditEventId);

    tx.set(
      withdrawalRef,
      { ...finalRequest } as unknown as Record<string, unknown>,
    );
    tx.set(
      auditRef,
      { ...finalAuditEvent } as unknown as Record<string, unknown>,
    );

    if (isUnlockAction && result.updatedBalance && result.ledgerEntry) {
      const unlockLedgerRef = firestore
        .collection(FINANCIAL_LEDGER_COLLECTION)
        .doc(unlockLedgerId);

      tx.set(
        balanceRef,
        { ...result.updatedBalance } as unknown as Record<string, unknown>,
        { merge: true },
      );

      tx.set(
        userRef!,
        {
          ...userData,
          uid: currentRequest.userId,
          email: currentRequest.userEmail || userData.email || '',
          balance: result.syncedUserBalanceUsdt,
          updatedAt: nowIso,
        },
        { merge: true },
      );

      tx.set(
        unlockLedgerRef,
        { ...result.ledgerEntry } as unknown as Record<string, unknown>,
      );
    }

    return {
      ok: true,
      action: payload.action,
      withdrawalRequest: finalRequest,
      ...(result.updatedBalance ? { userBalance: result.updatedBalance } : {}),
      ...(typeof result.syncedUserBalanceUsdt === 'number'
        ? { syncedUserBalanceUsdt: result.syncedUserBalanceUsdt }
        : {}),
      ...(result.ledgerEntry
        ? { ledgerEntry: result.ledgerEntry, ledgerEntryId: unlockLedgerId }
        : {}),
      auditEvent: finalAuditEvent,
      auditEventId,
    };
  });
}
