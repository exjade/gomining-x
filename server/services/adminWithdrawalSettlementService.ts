/**
 * SCRUM-275 / SCRUM-289 / SCRUM-286 (W11)
 * Server-Authoritative Admin Broadcast, Confirmation Tracking & Final Atomic Settlement Service.
 *
 * Architectural & Security Guarantees:
 * 1. Executes inside `firestore.runTransaction(...)` with strict Phase 1 (all Reads) before
 *    Phase 2 (Atomic Writes). Zero external RPC/HTTP calls inside `runTransaction`.
 * 2. Protected by granular W02 permission `'withdrawals.broadcast'` (no `SUPER_ADMIN` bypass,
 *    and no bypass on `PATCH /:id/confirmations` even for webhook/worker callers).
 * 3. `BROADCAST` validates real network-family `txHash` (`EVM`, `TRON`, `SOLANA`), populates
 *    `explorerTxUrl`, freezes `IMMUTABLE_FROM_BROADCAST_FIELDS`, and supports idempotent retry
 *    for identical normalized `txHash` while rejecting conflicting hashes (`409`).
 * 4. `COMPLETE` settles `BROADCASTED -> COMPLETED` atomically with deterministic ledger key
 *    `${withdrawalId}__SETTLEMENT` (aligned 1:1 with W10 `buildDeterministicLedgerIds`),
 *    requiring `confirmations >= requiredConfirmations`, decrementing `lockedBalanceMicros`,
 *    incrementing `totalWithdrawnMicros`, syncing `/users/{uid}.balance`, and rejecting replays
 *    without double-debit or double-ledger entries.
 */

import crypto from 'node:crypto';
import type { FirestoreDocumentSnapshotLike } from './firebaseAdminAllowlistAdapter.js';
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
  hasWithdrawalPermission,
  isWithdrawalModuleError,
  isWithdrawalStatus,
  validateBlockchainTxHash,
  type AdminBroadcastWithdrawalDto,
  type AdminCompleteWithdrawalDto,
  type FinancialLedgerEntry,
  type UserFinancialBalance,
  type WithdrawalAuditEvent,
  type WithdrawalNetworkConfig,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from '../../src/types/withdrawal.js';

export type W11SettlementAction = 'BROADCAST' | 'UPDATE_CONFIRMATIONS' | 'COMPLETE';

export interface AdminUpdateConfirmationsDto {
  expectedStatus: WithdrawalStatus;
  confirmations: number;
  reason?: string;
}

export interface AdminSettlementExecutionOptions extends WithdrawalNetworksServiceOptions {
  nowIso?: () => string;
  generateAuditEventId?: (withdrawalId: string, action: W11SettlementAction) => string;
}

export interface AdminSettlementExecutionResponse {
  ok: true;
  action: W11SettlementAction;
  idempotentReplay: boolean;
  withdrawalRequest: WithdrawalRequest;
  userBalance?: UserFinancialBalance;
  syncedUserBalanceUsdt?: number;
  ledgerEntry?: FinancialLedgerEntry;
  ledgerEntryId?: string;
  auditEvent?: WithdrawalAuditEvent;
  auditEventId?: string;
}

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

function defaultAuditEventId(withdrawalId: string, action: W11SettlementAction): string {
  const rand = crypto.randomBytes(6).toString('hex');
  return `aud_${withdrawalId}_${action.toLowerCase()}_${Date.now()}_${rand}`;
}

export function deterministicSettlementLedgerId(withdrawalId: string): string {
  return `${withdrawalId}__SETTLEMENT`;
}

export function buildExplorerTxUrl(
  explorerTxUrlTemplate: string | undefined,
  normalizedTxHash: string,
): string | undefined {
  if (!explorerTxUrlTemplate || !explorerTxUrlTemplate.trim()) {
    return undefined;
  }
  const tpl = explorerTxUrlTemplate.trim();
  if (tpl.includes('{txHash}')) {
    return tpl.replace('{txHash}', normalizedTxHash);
  }
  return `${tpl.replace(/\/+$/, '')}/${normalizedTxHash}`;
}

function assertSettlementPermission(
  adminPrincipal: WithdrawalAdminPrincipal,
  action: W11SettlementAction,
): void {
  const requiredPerm = REQUIRED_PERMISSION_BY_AUDIT_ACTION.BROADCAST;
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

function assertTransactionalFirestore(
  firestore: TransactionalFirestoreLike | null | undefined,
): asserts firestore is TransactionalFirestoreLike & {
  runTransaction<T>(fn: (tx: FirestoreTransactionLike) => Promise<T>): Promise<T>;
} {
  if (!firestore || typeof firestore.runTransaction !== 'function') {
    throw new WithdrawalModuleError({
      originTask: 'W11',
      originModule: 'SETTLEMENT',
      code: 'SETTLEMENT_FIRESTORE_UNAVAILABLE',
      httpStatus: 503,
      message: 'Firestore transaccional (runTransaction) no está disponible para broadcast/settlement.',
    });
  }
}

function assertCleanWithdrawalId(withdrawalId: string): string {
  const cleanId = typeof withdrawalId === 'string' ? withdrawalId.trim() : '';
  if (!cleanId) {
    throw new WithdrawalModuleError({
      originTask: 'W11',
      originModule: 'SETTLEMENT',
      code: 'WITHDRAWAL_ID_REQUIRED',
      httpStatus: 400,
      message: 'El identificador withdrawalId es obligatorio para operaciones W11.',
    });
  }
  if (!isSafeFirestoreDocId(cleanId)) {
    throw new WithdrawalModuleError({
      originTask: 'W11',
      originModule: 'SETTLEMENT',
      code: 'INVALID_SETTLEMENT_PAYLOAD',
      httpStatus: 400,
      message: 'El identificador withdrawalId contiene caracteres no permitidos.',
    });
  }
  return cleanId;
}

function assertValidExpectedStatus(rawStatus: unknown): WithdrawalStatus {
  if (!isWithdrawalStatus(rawStatus)) {
    throw new WithdrawalModuleError({
      originTask: 'W11',
      originModule: 'SETTLEMENT',
      code: 'INVALID_SETTLEMENT_PAYLOAD',
      httpStatus: 400,
      message: `expectedStatus inválido o ausente ("${String(rawStatus)}"). Valores permitidos: ${WITHDRAWAL_STATUSES.join(', ')}.`,
    });
  }
  return rawStatus;
}

function assertNonNegativeIntegerConfirmations(rawValue: unknown, fieldLabel = 'confirmations'): number {
  if (typeof rawValue !== 'number' || !Number.isSafeInteger(rawValue) || rawValue < 0) {
    throw new WithdrawalModuleError({
      originTask: 'W11',
      originModule: 'SETTLEMENT',
      code: 'INVALID_SETTLEMENT_PAYLOAD',
      httpStatus: 400,
      message: `${fieldLabel} debe ser un entero seguro >= 0.`,
    });
  }
  return rawValue;
}

async function resolveNetworkConfigInTx(
  firestore: TransactionalFirestoreLike,
  tx: FirestoreTransactionLike,
  networkId: string,
  _options: AdminSettlementExecutionOptions,
): Promise<WithdrawalNetworkConfig | undefined> {
  if (!networkId || !isSafeFirestoreDocId(networkId)) return undefined;
  const networkRef = firestore
    .collection(WITHDRAWAL_NETWORKS_COLLECTION)
    .doc(networkId);
  const netSnap = await tx.get(networkRef);

  if (unwrapExists(netSnap)) {
    const rawNet = unwrapData(netSnap);
    if (rawNet) {
      return validateWithdrawalNetworkConfigDoc(networkId, rawNet);
    }
  }

  return undefined;
}

function rethrowSettlementError(error: unknown, fallbackMessage: string): never {
  if (isWithdrawalModuleError(error)) {
    throw error;
  }
  const message = error instanceof Error && error.message ? error.message : fallbackMessage;
  throw new WithdrawalModuleError({
    originTask: 'W11',
    originModule: 'SETTLEMENT',
    code: 'SETTLEMENT_FAILED',
    httpStatus: 503,
    message,
  });
}

export async function executeAdminBroadcastWithdrawal(
  firestore: TransactionalFirestoreLike | null | undefined,
  adminPrincipal: WithdrawalAdminPrincipal,
  withdrawalId: string,
  dto: AdminBroadcastWithdrawalDto,
  options: AdminSettlementExecutionOptions = {},
): Promise<AdminSettlementExecutionResponse> {
  assertSettlementPermission(adminPrincipal, 'BROADCAST');
  assertTransactionalFirestore(firestore);

  const cleanId = assertCleanWithdrawalId(withdrawalId);
  const expectedStatus = assertValidExpectedStatus(dto?.expectedStatus);
  const initialConfirmations =
    dto?.confirmations !== undefined
      ? assertNonNegativeIntegerConfirmations(dto.confirmations, 'confirmations')
      : 0;
  const rawTxHash = typeof dto?.txHash === 'string' ? dto.txHash : '';
  const nowIso = (options.nowIso ?? (() => new Date().toISOString()))();
  const auditEventId = (options.generateAuditEventId ?? defaultAuditEventId)(cleanId, 'BROADCAST');

  const withdrawalRef = firestore.collection(WITHDRAWAL_REQUESTS_COLLECTION).doc(cleanId);
  const dummyBalanceRef = firestore.collection(USER_BALANCES_COLLECTION).doc('__unused__');
  void dummyBalanceRef;

  try {
    return await firestore.runTransaction(async (tx) => {
      // PHASE 1: READS
      const withdrawalSnap = await tx.get(withdrawalRef);
      if (!unwrapExists(withdrawalSnap)) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'WITHDRAWAL_NOT_FOUND',
          httpStatus: 404,
          message: `La solicitud "${cleanId}" no existe en /withdrawalRequests.`,
        });
      }

      const currentRequest = {
        id: cleanId,
        ...(unwrapData(withdrawalSnap) ?? {}),
      } as WithdrawalRequest;

      const networkConfig = await resolveNetworkConfigInTx(
        firestore,
        tx,
        currentRequest.networkId,
        options,
      );

      const txValidation = validateBlockchainTxHash(rawTxHash, currentRequest.addressType);
      if (!txValidation.valid) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'INVALID_TX_HASH',
          httpStatus: 422,
          message: txValidation.reason || 'El txHash proporcionado no cumple el formato de la red.',
        });
      }

      // Idempotent replay check when already BROADCASTED
      if (currentRequest.status === 'BROADCASTED') {
        if (currentRequest.txHash === txValidation.normalizedTxHash) {
          return {
            ok: true,
            action: 'BROADCAST',
            idempotentReplay: true,
            withdrawalRequest: currentRequest,
          };
        }
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'BROADCAST_TXHASH_CONFLICT',
          httpStatus: 409,
          message: `La solicitud "${cleanId}" ya fue transmitida con txHash "${currentRequest.txHash ?? ''}" y no puede sobrescribirse con "${txValidation.normalizedTxHash}".`,
        });
      }

      if (currentRequest.status !== 'PROCESSING' || currentRequest.status !== expectedStatus) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'CONCURRENCY_STATUS_MISMATCH',
          httpStatus: 409,
          message: `Conflicto de concurrencia en BROADCAST: estado real "${currentRequest.status}", esperado "${expectedStatus}".`,
        });
      }

      const placeholderBalance: UserFinancialBalance = {
        uid: currentRequest.userId,
        email: currentRequest.userEmail,
        membershipTier: currentRequest.membershipTierSnapshot,
        availableBalanceMicros: 0,
        lockedBalanceMicros: currentRequest.totalDebitMicros,
        totalWithdrawnMicros: 0,
        version: 1,
        updatedAt: nowIso,
      };

      const result = applyAdminWithdrawalAction(
        currentRequest,
        placeholderBalance,
        {
          action: 'BROADCAST',
          dto: {
            expectedStatus,
            txHash: txValidation.normalizedTxHash,
            confirmations: initialConfirmations,
            ...(typeof dto?.providerTransactionId === 'string' && dto.providerTransactionId.trim()
              ? { providerTransactionId: dto.providerTransactionId.trim() }
              : {}),
          },
        },
        {
          operatorUid: adminPrincipal.uid,
          operatorEmail: adminPrincipal.email,
          grantedPermissions: adminPrincipal.permissions,
          nowIso,
          auditEventId,
        },
      );

      const explorerTxUrl = buildExplorerTxUrl(
        networkConfig?.explorerTxUrlTemplate,
        txValidation.normalizedTxHash,
      );

      const finalRequest: WithdrawalRequest = {
        ...result.withdrawalRequest,
        ...(explorerTxUrl ? { explorerTxUrl } : {}),
      };

      const finalAuditEvent: WithdrawalAuditEvent = {
        ...result.auditEvent,
        changedValues: {
          ...(result.auditEvent.changedValues ?? {}),
          ...(explorerTxUrl ? { explorerTxUrl } : {}),
        },
      };

      // PHASE 2: ATOMIC WRITES (no balance release/debit during BROADCAST)
      const auditRef = firestore
        .collection(WITHDRAWAL_AUDIT_EVENTS_COLLECTION)
        .doc(auditEventId);

      tx.set(withdrawalRef, { ...finalRequest } as unknown as Record<string, unknown>);
      tx.set(auditRef, { ...finalAuditEvent } as unknown as Record<string, unknown>);

      return {
        ok: true,
        action: 'BROADCAST',
        idempotentReplay: false,
        withdrawalRequest: finalRequest,
        auditEvent: finalAuditEvent,
        auditEventId,
      };
    });
  } catch (error) {
    rethrowSettlementError(error, 'Error ejecutando broadcast on-chain de retiro.');
  }
}

export async function executeAdminUpdateConfirmations(
  firestore: TransactionalFirestoreLike | null | undefined,
  adminPrincipal: WithdrawalAdminPrincipal,
  withdrawalId: string,
  dto: AdminUpdateConfirmationsDto,
  options: AdminSettlementExecutionOptions = {},
): Promise<AdminSettlementExecutionResponse> {
  assertSettlementPermission(adminPrincipal, 'UPDATE_CONFIRMATIONS');
  assertTransactionalFirestore(firestore);

  const cleanId = assertCleanWithdrawalId(withdrawalId);
  const expectedStatus = assertValidExpectedStatus(dto?.expectedStatus);
  const nextConfirmations = assertNonNegativeIntegerConfirmations(
    dto?.confirmations,
    'confirmations',
  );
  const nowIso = (options.nowIso ?? (() => new Date().toISOString()))();
  const auditEventId = (options.generateAuditEventId ?? defaultAuditEventId)(
    cleanId,
    'UPDATE_CONFIRMATIONS',
  );

  const withdrawalRef = firestore.collection(WITHDRAWAL_REQUESTS_COLLECTION).doc(cleanId);

  try {
    return await firestore.runTransaction(async (tx) => {
      // PHASE 1: READS
      const withdrawalSnap = await tx.get(withdrawalRef);
      if (!unwrapExists(withdrawalSnap)) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'WITHDRAWAL_NOT_FOUND',
          httpStatus: 404,
          message: `La solicitud "${cleanId}" no existe en /withdrawalRequests.`,
        });
      }

      const currentRequest = {
        id: cleanId,
        ...(unwrapData(withdrawalSnap) ?? {}),
      } as WithdrawalRequest;

      if (currentRequest.status !== 'BROADCASTED' || currentRequest.status !== expectedStatus) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'CONCURRENCY_STATUS_MISMATCH',
          httpStatus: 409,
          message: `Solo se pueden actualizar confirmaciones en estado BROADCASTED (actual: "${currentRequest.status}", esperado: "${expectedStatus}").`,
        });
      }

      const txCheck = validateBlockchainTxHash(
        currentRequest.txHash ?? '',
        currentRequest.addressType,
      );
      if (!txCheck.valid) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'INVALID_TX_HASH',
          httpStatus: 422,
          message: 'El retiro en BROADCASTED no posee un txHash válido.',
        });
      }

      const prevConfirmations = currentRequest.confirmations ?? 0;
      if (nextConfirmations === prevConfirmations) {
        return {
          ok: true,
          action: 'UPDATE_CONFIRMATIONS',
          idempotentReplay: true,
          withdrawalRequest: currentRequest,
        };
      }

      if (nextConfirmations < prevConfirmations) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'INVALID_SETTLEMENT_PAYLOAD',
          httpStatus: 400,
          message: `No se permite reducir confirmaciones observadas (${nextConfirmations} < ${prevConfirmations}).`,
        });
      }

      const updatedRequest: WithdrawalRequest = {
        ...currentRequest,
        confirmations: nextConfirmations,
        updatedAt: nowIso,
      };

      const auditEvent: WithdrawalAuditEvent = {
        id: auditEventId,
        withdrawalId: currentRequest.id,
        operatorUid: adminPrincipal.uid,
        operatorEmail: adminPrincipal.email,
        action: 'EDIT',
        previousStatus: 'BROADCASTED',
        newStatus: 'BROADCASTED',
        previousValues: {
          confirmations: prevConfirmations,
        },
        changedValues: {
          confirmations: nextConfirmations,
          requiredConfirmations: currentRequest.requiredConfirmations,
        },
        reason:
          typeof dto?.reason === 'string' && dto.reason.trim()
            ? dto.reason.trim()
            : 'Actualización on-chain de confirmaciones.',
        createdAt: nowIso,
      };

      // PHASE 2: ATOMIC WRITES (immutable post-broadcast fields stay untouched)
      const auditRef = firestore
        .collection(WITHDRAWAL_AUDIT_EVENTS_COLLECTION)
        .doc(auditEventId);

      tx.set(withdrawalRef, { ...updatedRequest } as unknown as Record<string, unknown>);
      tx.set(auditRef, { ...auditEvent } as unknown as Record<string, unknown>);

      return {
        ok: true,
        action: 'UPDATE_CONFIRMATIONS',
        idempotentReplay: false,
        withdrawalRequest: updatedRequest,
        auditEvent,
        auditEventId,
      };
    });
  } catch (error) {
    rethrowSettlementError(error, 'Error actualizando confirmaciones on-chain del retiro.');
  }
}

export async function executeAdminCompleteWithdrawal(
  firestore: TransactionalFirestoreLike | null | undefined,
  adminPrincipal: WithdrawalAdminPrincipal,
  withdrawalId: string,
  dto: AdminCompleteWithdrawalDto,
  options: AdminSettlementExecutionOptions = {},
): Promise<AdminSettlementExecutionResponse> {
  assertSettlementPermission(adminPrincipal, 'COMPLETE');
  assertTransactionalFirestore(firestore);

  const cleanId = assertCleanWithdrawalId(withdrawalId);
  const expectedStatus = assertValidExpectedStatus(dto?.expectedStatus);
  const requestedConfirmations = assertNonNegativeIntegerConfirmations(
    dto?.confirmations,
    'confirmations',
  );
  const nowIso = (options.nowIso ?? (() => new Date().toISOString()))();
  const auditEventId = (options.generateAuditEventId ?? defaultAuditEventId)(cleanId, 'COMPLETE');
  const settlementLedgerId = deterministicSettlementLedgerId(cleanId);
  const unlockLedgerId = `${cleanId}__UNLOCK`;

  const withdrawalRef = firestore.collection(WITHDRAWAL_REQUESTS_COLLECTION).doc(cleanId);
  const settlementLedgerRef = firestore
    .collection(FINANCIAL_LEDGER_COLLECTION)
    .doc(settlementLedgerId);
  const unlockLedgerRef = firestore.collection(FINANCIAL_LEDGER_COLLECTION).doc(unlockLedgerId);

  try {
    return await firestore.runTransaction(async (tx) => {
      // PHASE 1: ALL READS FIRST
      const withdrawalSnap = await tx.get(withdrawalRef);
      if (!unwrapExists(withdrawalSnap)) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'WITHDRAWAL_NOT_FOUND',
          httpStatus: 404,
          message: `La solicitud "${cleanId}" no existe en /withdrawalRequests.`,
        });
      }

      const currentRequest = {
        id: cleanId,
        ...(unwrapData(withdrawalSnap) ?? {}),
      } as WithdrawalRequest;

      const balanceRef = firestore
        .collection(USER_BALANCES_COLLECTION)
        .doc(currentRequest.userId);
      const userRef = firestore.collection(USERS_COLLECTION).doc(currentRequest.userId);

      const [balanceSnap, userSnap, settlementSnap, unlockSnap] = await Promise.all([
        tx.get(balanceRef),
        tx.get(userRef),
        tx.get(settlementLedgerRef),
        tx.get(unlockLedgerRef),
      ]);

      if (unwrapExists(unlockSnap)) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'CONFLICTING_UNLOCK',
          httpStatus: 409,
          message: `El retiro "${cleanId}" ya posee asiento "${unlockLedgerId}" (UNLOCK) y no puede liquidarse como COMPLETED.`,
        });
      }

      const existingBalance = unwrapExists(balanceSnap)
        ? ({
            uid: currentRequest.userId,
            email: currentRequest.userEmail,
            membershipTier: currentRequest.membershipTierSnapshot,
            ...(unwrapData(balanceSnap) ?? {}),
          } as UserFinancialBalance)
        : undefined;

      // Idempotent replay when already COMPLETED with its deterministic settlement entry
      if (currentRequest.status === 'COMPLETED') {
        if (!unwrapExists(settlementSnap)) {
          throw new WithdrawalModuleError({
            originTask: 'W11',
            originModule: 'SETTLEMENT',
            code: 'ALREADY_SETTLED',
            httpStatus: 409,
            message: `Inconsistencia en "${cleanId}": estado COMPLETED sin asiento "${settlementLedgerId}".`,
          });
        }
        const existingSettlement = {
          id: settlementLedgerId,
          ...(unwrapData(settlementSnap) ?? {}),
        } as FinancialLedgerEntry;

        return {
          ok: true,
          action: 'COMPLETE',
          idempotentReplay: true,
          withdrawalRequest: currentRequest,
          ...(existingBalance ? { userBalance: existingBalance } : {}),
          ledgerEntry: existingSettlement,
          ledgerEntryId: settlementLedgerId,
        };
      }

      if (unwrapExists(settlementSnap)) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'ALREADY_SETTLED',
          httpStatus: 409,
          message: `El asiento determinista "${settlementLedgerId}" ya existe en /financialLedger (bloqueo anti doble settlement).`,
        });
      }

      if (currentRequest.status !== 'BROADCASTED' || currentRequest.status !== expectedStatus) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'CONCURRENCY_STATUS_MISMATCH',
          httpStatus: 409,
          message: `Conflicto de concurrencia en COMPLETE: estado real "${currentRequest.status}", esperado "${expectedStatus}".`,
        });
      }

      const txCheck = validateBlockchainTxHash(
        currentRequest.txHash ?? '',
        currentRequest.addressType,
      );
      if (!txCheck.valid) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'INVALID_TX_HASH',
          httpStatus: 422,
          message: 'No se puede completar a COMPLETED sin un txHash on-chain válido.',
        });
      }

      const prevConfirmations = currentRequest.confirmations ?? 0;
      if (requestedConfirmations < prevConfirmations) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'INVALID_SETTLEMENT_PAYLOAD',
          httpStatus: 400,
          message: `confirmations (${requestedConfirmations}) no puede ser menor al conteo ya observado (${prevConfirmations}).`,
        });
      }

      if (requestedConfirmations < currentRequest.requiredConfirmations) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'INSUFFICIENT_CONFIRMATIONS',
          httpStatus: 422,
          message: `Confirmaciones insuficientes: observadas ${requestedConfirmations}, requeridas ${currentRequest.requiredConfirmations}.`,
        });
      }

      if (!existingBalance) {
        throw new WithdrawalModuleError({
          originTask: 'W11',
          originModule: 'SETTLEMENT',
          code: 'BALANCE_NOT_FOUND',
          httpStatus: 404,
          message: `No existe documento /userBalances/${currentRequest.userId} para liquidar el retiro.`,
        });
      }

      const result = applyAdminWithdrawalAction(
        currentRequest,
        existingBalance,
        {
          action: 'COMPLETE',
          dto: {
            expectedStatus,
            confirmations: requestedConfirmations,
            ...(typeof dto?.reason === 'string' && dto.reason.trim()
              ? { reason: dto.reason.trim() }
              : {}),
          },
        },
        {
          operatorUid: adminPrincipal.uid,
          operatorEmail: adminPrincipal.email,
          grantedPermissions: adminPrincipal.permissions,
          nowIso,
          auditEventId,
          ledgerEntryId: settlementLedgerId,
        },
      );

      const userData = unwrapExists(userSnap) ? (unwrapData(userSnap) ?? {}) : {};

      // PHASE 2: ALL ATOMIC WRITES
      const auditRef = firestore
        .collection(WITHDRAWAL_AUDIT_EVENTS_COLLECTION)
        .doc(auditEventId);

      tx.set(
        withdrawalRef,
        { ...result.withdrawalRequest } as unknown as Record<string, unknown>,
      );
      tx.set(
        balanceRef,
        { ...result.updatedBalance } as unknown as Record<string, unknown>,
        { merge: true },
      );
      tx.set(
        userRef,
        {
          ...userData,
          uid: currentRequest.userId,
          email: currentRequest.userEmail || (typeof userData.email === 'string' ? userData.email : ''),
          balance: result.syncedUserBalanceUsdt,
          updatedAt: nowIso,
        },
        { merge: true },
      );
      tx.set(
        settlementLedgerRef,
        { ...result.ledgerEntry } as unknown as Record<string, unknown>,
      );
      tx.set(
        auditRef,
        { ...result.auditEvent } as unknown as Record<string, unknown>,
      );

      return {
        ok: true,
        action: 'COMPLETE',
        idempotentReplay: false,
        withdrawalRequest: result.withdrawalRequest,
        ...(result.updatedBalance ? { userBalance: result.updatedBalance } : {}),
        ...(typeof result.syncedUserBalanceUsdt === 'number'
          ? { syncedUserBalanceUsdt: result.syncedUserBalanceUsdt }
          : {}),
        ...(result.ledgerEntry
          ? { ledgerEntry: result.ledgerEntry, ledgerEntryId: settlementLedgerId }
          : {}),
        auditEvent: result.auditEvent,
        auditEventId,
      };
    });
  } catch (error) {
    rethrowSettlementError(error, 'Error liquidando atómicamente el retiro a COMPLETED.');
  }
}
