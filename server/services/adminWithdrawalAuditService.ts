/**
 * SCRUM-275 / SCRUM-289 / SCRUM-285 (W10)
 * Server-Authoritative Withdrawal Accounting Reconciliation & Forensic Audit Timeline Service:
 * - `GET /api/admin/withdrawals/:withdrawalId/audit`
 *
 * Architectural & Integrity Guarantees:
 * 1. Zero data duplication: builds the unified forensic timeline on read by merging canonical
 *    `/withdrawalAuditEvents` + `/financialLedger` using existing W01 composite indexes
 *    `(withdrawalId ASC, createdAt ASC)` in `firestore.indexes.json`.
 * 2. Strict fail-closed RBAC: requires explicit `withdrawals.audit` permission (W02), zero `SUPER_ADMIN` bypass.
 * 3. Deterministic ledger IDs aligned with W04/W09/W11:
 *    - Lock (W04 `withdrawalRequestLockService.ts:409`): `led_lock_${withdrawalId}` (`aud_create_${withdrawalId}`)
 *    - Unlock (W09 `adminWithdrawalWorkflowService.ts:132`): `${withdrawalId}__UNLOCK`
 *    - Settlement (W11): `${withdrawalId}__SETTLEMENT`
 * 4. Verifies double-entry balanceBefore/After & lockedBefore/After arithmetic invariants in micro-USDT.
 */

import type {
  FirestoreDocumentSnapshotLike,
  FirestoreLike,
  FirestoreQuerySnapshotLike,
} from './firebaseAdminAllowlistAdapter.js';
import type { WithdrawalAdminPrincipal } from './withdrawalAuthzMiddleware.js';
import type { QueryableFirestoreCollectionLike } from './withdrawalClientHistoryService.js';
import { isSafeFirestoreDocId } from './withdrawalNetworksService.js';
import {
  FINANCIAL_LEDGER_COLLECTION,
  USER_BALANCES_COLLECTION,
  WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
  WITHDRAWAL_REQUESTS_COLLECTION,
  WithdrawalModuleError,
  hasWithdrawalPermission,
  isValidMicrosInteger,
  isWithdrawalModuleError,
  type FinancialLedgerEntry,
  type UserFinancialBalance,
  type WithdrawalAuditEvent,
  type WithdrawalRequest,
} from '../../src/types/withdrawal.js';

export interface DeterministicLedgerIds {
  lockLedgerId: string;
  createAuditEventId: string;
  unlockLedgerId: string;
  settlementLedgerId: string;
}

export type ForensicTimelineSource = 'AUDIT_EVENT' | 'FINANCIAL_LEDGER';

export interface ForensicTimelineEntry {
  timelineId: string;
  source: ForensicTimelineSource;
  createdAt: string;
  withdrawalId: string;
  title: string;
  actorUid?: string;
  actorEmail?: string;
  action?: WithdrawalAuditEvent['action'];
  previousStatus?: WithdrawalRequest['status'];
  newStatus?: WithdrawalRequest['status'];
  previousValues?: Record<string, unknown>;
  changedValues?: Record<string, unknown>;
  reason?: string;
  ledgerType?: FinancialLedgerEntry['type'];
  ledgerDirection?: FinancialLedgerEntry['direction'];
  amountMicros?: number;
  balanceBeforeMicros?: number;
  balanceAfterMicros?: number;
  lockedBeforeMicros?: number;
  lockedAfterMicros?: number;
  idempotencyKey?: string;
  linkedLedgerEntryId?: string;
}

export type LedgerReconciliationStatus =
  | 'LOCKED_OPEN'
  | 'UNLOCKED_CLOSED'
  | 'SETTLED_CLOSED'
  | 'ANOMALY';

export interface WithdrawalLedgerReconciliation {
  withdrawalId: string;
  expectedIds: DeterministicLedgerIds;
  lockCount: number;
  unlockCount: number;
  settlementCount: number;
  totalLedgerEntries: number;
  totalAuditEvents: number;
  lockEntryPresent: boolean;
  unlockEntryPresent: boolean;
  settlementEntryPresent: boolean;
  netLockedDeltaMicros: number;
  isBalanced: boolean;
  invariantStatus: LedgerReconciliationStatus;
  anomalies: string[];
}

export interface AdminWithdrawalAuditTimelineResponseDto {
  ok: true;
  withdrawal: WithdrawalRequest;
  userBalance: UserFinancialBalance | null;
  ledgerEntries: FinancialLedgerEntry[];
  auditEvents: WithdrawalAuditEvent[];
  timeline: ForensicTimelineEntry[];
  reconciliation: WithdrawalLedgerReconciliation;
}

export interface AdminWithdrawalAuditOptions {
  strictIntegrity?: boolean;
}

interface OrderableAuditCollectionLike extends QueryableFirestoreCollectionLike {
  orderBy?(
    fieldPath: string,
    directionStr?: 'asc' | 'desc',
  ): {
    where?(fieldPath: string, opStr: '==', value: unknown): unknown;
    get(): Promise<FirestoreQuerySnapshotLike>;
  };
}

export function buildDeterministicLedgerIds(
  withdrawalId: string,
): DeterministicLedgerIds {
  const cleanId = typeof withdrawalId === 'string' ? withdrawalId.trim() : '';
  return {
    lockLedgerId: `led_lock_${cleanId}`,
    createAuditEventId: `aud_create_${cleanId}`,
    unlockLedgerId: `${cleanId}__UNLOCK`,
    settlementLedgerId: `${cleanId}__SETTLEMENT`,
  };
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

function resolveDocId(
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

async function queryWithdrawalHistoryCollection(
  firestore: FirestoreLike,
  collectionName: string,
  withdrawalId: string,
): Promise<Record<string, unknown>[]> {
  const col = firestore.collection(collectionName) as OrderableAuditCollectionLike;
  let snap: FirestoreQuerySnapshotLike;
  if (typeof col.where === 'function') {
    // Uses W01 composite index: `(withdrawalId ASC, createdAt ASC)`
    snap = await col
      .where('withdrawalId', '==', withdrawalId)
      .orderBy('createdAt', 'asc')
      .get();
  } else {
    const full = await col.get();
    const filtered = full.docs
      .filter((d) => {
        const data = unwrapData(d);
        return unwrapExists(d) && data && String(data.withdrawalId ?? '') === withdrawalId;
      })
      .sort((a, b) =>
        String(unwrapData(a)?.createdAt ?? '').localeCompare(
          String(unwrapData(b)?.createdAt ?? ''),
        ),
      );
    snap = { docs: filtered };
  }

  return snap.docs.filter(unwrapExists).map((d) => {
    const data = unwrapData(d) || {};
    return {
      ...data,
      id: resolveDocId(d, data),
    };
  });
}

export function verifyWithdrawalLedgerReconciliation(
  withdrawal: WithdrawalRequest,
  ledgerEntries: readonly FinancialLedgerEntry[],
  auditEventsCount = 0,
): WithdrawalLedgerReconciliation {
  const expectedIds = buildDeterministicLedgerIds(withdrawal.id);
  const anomalies: string[] = [];

  const locks = ledgerEntries.filter((e) => e.type === 'WITHDRAWAL_LOCK');
  const unlocks = ledgerEntries.filter((e) => e.type === 'WITHDRAWAL_UNLOCK');
  const settlements = ledgerEntries.filter((e) => e.type === 'WITHDRAWAL');

  if (locks.length === 0) {
    anomalies.push(`Falta asiento obligatorio WITHDRAWAL_LOCK (${expectedIds.lockLedgerId}).`);
  } else if (locks.length > 1) {
    anomalies.push(`Se detectaron ${locks.length} asientos WITHDRAWAL_LOCK duplicados.`);
  }

  if (unlocks.length > 1) {
    anomalies.push(`Se detectaron ${unlocks.length} asientos WITHDRAWAL_UNLOCK duplicados.`);
  }

  if (settlements.length > 1) {
    anomalies.push(`Se detectaron ${settlements.length} asientos WITHDRAWAL duplicados.`);
  }

  if (unlocks.length > 0 && settlements.length > 0) {
    anomalies.push(
      'Conflicto contable: coexisten asientos WITHDRAWAL_UNLOCK y WITHDRAWAL final para la misma solicitud.',
    );
  }

  let lockedDelta = 0;

  for (const entry of ledgerEntries) {
    if (entry.withdrawalId !== withdrawal.id || entry.referenceId !== withdrawal.id) {
      anomalies.push(
        `Asiento ${entry.id} no coincide con withdrawalId/referenceId (${withdrawal.id}).`,
      );
    }

    if (
      !isValidMicrosInteger(entry.amountMicros) ||
      !isValidMicrosInteger(entry.balanceBeforeMicros) ||
      !isValidMicrosInteger(entry.balanceAfterMicros) ||
      !isValidMicrosInteger(entry.lockedBeforeMicros) ||
      !isValidMicrosInteger(entry.lockedAfterMicros)
    ) {
      anomalies.push(`Asiento ${entry.id} contiene valores micro-USDT inválidos.`);
      continue;
    }

    if (entry.type === 'WITHDRAWAL_LOCK') {
      if (entry.id !== expectedIds.lockLedgerId) {
        anomalies.push(
          `LOCK ID no determinista: esperado "${expectedIds.lockLedgerId}", recibido "${entry.id}".`,
        );
      }
      if (entry.amountMicros !== withdrawal.totalDebitMicros) {
        anomalies.push(
          `LOCK amountMicros (${entry.amountMicros}) difiere de totalDebitMicros (${withdrawal.totalDebitMicros}).`,
        );
      }
      if (
        entry.balanceAfterMicros !== entry.balanceBeforeMicros - entry.amountMicros ||
        entry.lockedAfterMicros !== entry.lockedBeforeMicros + entry.amountMicros
      ) {
        anomalies.push(`LOCK ${entry.id} presenta descuadre aritmético en balanceBefore/After.`);
      }
      lockedDelta += entry.amountMicros;
    } else if (entry.type === 'WITHDRAWAL_UNLOCK') {
      if (entry.id !== expectedIds.unlockLedgerId) {
        anomalies.push(
          `UNLOCK ID no determinista: esperado "${expectedIds.unlockLedgerId}", recibido "${entry.id}".`,
        );
      }
      if (entry.amountMicros !== withdrawal.totalDebitMicros) {
        anomalies.push(
          `UNLOCK amountMicros (${entry.amountMicros}) difiere de totalDebitMicros (${withdrawal.totalDebitMicros}).`,
        );
      }
      if (
        entry.balanceAfterMicros !== entry.balanceBeforeMicros + entry.amountMicros ||
        entry.lockedAfterMicros !== entry.lockedBeforeMicros - entry.amountMicros
      ) {
        anomalies.push(`UNLOCK ${entry.id} presenta descuadre aritmético en balanceBefore/After.`);
      }
      lockedDelta -= entry.amountMicros;
    } else if (entry.type === 'WITHDRAWAL') {
      if (entry.amountMicros !== withdrawal.totalDebitMicros) {
        anomalies.push(
          `WITHDRAWAL amountMicros (${entry.amountMicros}) difiere de totalDebitMicros (${withdrawal.totalDebitMicros}).`,
        );
      }
      if (
        entry.balanceAfterMicros !== entry.balanceBeforeMicros ||
        entry.lockedAfterMicros !== entry.lockedBeforeMicros - entry.amountMicros
      ) {
        anomalies.push(
          `SETTLEMENT ${entry.id} presenta descuadre aritmético en lockedBefore/After.`,
        );
      }
      lockedDelta -= entry.amountMicros;
    }
  }

  // Verify ledger state consistency against withdrawal status
  if (
    (withdrawal.status === 'REJECTED' || withdrawal.status === 'CANCELLED') &&
    unlocks.length === 0
  ) {
    anomalies.push(
      `Solicitud en estado terminal ${withdrawal.status} carece de asiento WITHDRAWAL_UNLOCK.`,
    );
  }
  if (withdrawal.status === 'COMPLETED' && settlements.length === 0) {
    anomalies.push('Solicitud COMPLETED carece de asiento contable WITHDRAWAL final.');
  }

  let invariantStatus: LedgerReconciliationStatus = 'ANOMALY';
  if (anomalies.length === 0) {
    if (settlements.length === 1 && lockedDelta === 0) {
      invariantStatus = 'SETTLED_CLOSED';
    } else if (unlocks.length === 1 && lockedDelta === 0) {
      invariantStatus = 'UNLOCKED_CLOSED';
    } else if (locks.length === 1 && lockedDelta === withdrawal.totalDebitMicros) {
      invariantStatus = 'LOCKED_OPEN';
    } else {
      anomalies.push(`Delta bloqueado inconsistente: ${lockedDelta} micro-USDT.`);
      invariantStatus = 'ANOMALY';
    }
  }

  return {
    withdrawalId: withdrawal.id,
    expectedIds,
    lockCount: locks.length,
    unlockCount: unlocks.length,
    settlementCount: settlements.length,
    totalLedgerEntries: ledgerEntries.length,
    totalAuditEvents: auditEventsCount,
    lockEntryPresent: locks.length > 0,
    unlockEntryPresent: unlocks.length > 0,
    settlementEntryPresent: settlements.length > 0,
    netLockedDeltaMicros: lockedDelta,
    isBalanced: anomalies.length === 0,
    invariantStatus,
    anomalies,
  };
}

export function buildForensicTimeline(
  auditEvents: readonly WithdrawalAuditEvent[],
  ledgerEntries: readonly FinancialLedgerEntry[],
): ForensicTimelineEntry[] {
  const byTypeMap = new Map<FinancialLedgerEntry['type'], string>();
  for (const le of ledgerEntries) {
    if (!byTypeMap.has(le.type)) {
      byTypeMap.set(le.type, le.id);
    }
  }

  const timeline: ForensicTimelineEntry[] = [];

  for (const ev of auditEvents) {
    let linkedLedgerEntryId: string | undefined;
    if (ev.action === 'CREATE') linkedLedgerEntryId = byTypeMap.get('WITHDRAWAL_LOCK');
    else if (ev.action === 'REJECT' || ev.action === 'CANCEL') {
      linkedLedgerEntryId = byTypeMap.get('WITHDRAWAL_UNLOCK');
    } else if (ev.action === 'COMPLETE') {
      linkedLedgerEntryId = byTypeMap.get('WITHDRAWAL');
    }

    timeline.push({
      timelineId: `audit:${ev.id}`,
      source: 'AUDIT_EVENT',
      createdAt: ev.createdAt,
      withdrawalId: ev.withdrawalId,
      title: `Evento Audit: ${ev.action} (${ev.newStatus})`,
      actorUid: ev.operatorUid,
      actorEmail: ev.operatorEmail,
      action: ev.action,
      ...(ev.previousStatus ? { previousStatus: ev.previousStatus } : {}),
      newStatus: ev.newStatus,
      ...(ev.previousValues ? { previousValues: ev.previousValues } : {}),
      ...(ev.changedValues ? { changedValues: ev.changedValues } : {}),
      ...(ev.reason ? { reason: ev.reason } : {}),
      ...(linkedLedgerEntryId ? { linkedLedgerEntryId } : {}),
    });
  }

  for (const le of ledgerEntries) {
    timeline.push({
      timelineId: `ledger:${le.id}`,
      source: 'FINANCIAL_LEDGER',
      createdAt: le.createdAt,
      withdrawalId: le.withdrawalId,
      title: `Asiento Ledger: ${le.type} (${le.direction})`,
      ledgerType: le.type,
      ledgerDirection: le.direction,
      amountMicros: le.amountMicros,
      balanceBeforeMicros: le.balanceBeforeMicros,
      balanceAfterMicros: le.balanceAfterMicros,
      lockedBeforeMicros: le.lockedBeforeMicros,
      lockedAfterMicros: le.lockedAfterMicros,
      idempotencyKey: le.idempotencyKey,
      linkedLedgerEntryId: le.id,
    });
  }

  return timeline.sort((a, b) => {
    const dateCmp = String(a.createdAt).localeCompare(String(b.createdAt));
    if (dateCmp !== 0) return dateCmp;
    if (a.source !== b.source) {
      return a.source === 'AUDIT_EVENT' ? -1 : 1;
    }
    return a.timelineId.localeCompare(b.timelineId);
  });
}

/**
 * Retrieves unified immutable Ledger + Audit forensic timeline for a withdrawal request.
 * Strictly guarded by W02 `withdrawals.audit`.
 */
export async function getAdminWithdrawalAuditTimeline(
  firestore: FirestoreLike | null | undefined,
  adminPrincipal: WithdrawalAdminPrincipal,
  withdrawalId: string,
  options: AdminWithdrawalAuditOptions = {},
): Promise<AdminWithdrawalAuditTimelineResponseDto> {
  if (!firestore) {
    throw new WithdrawalModuleError({
      originTask: 'W10',
      originModule: 'AUDIT',
      code: 'AUDIT_FIRESTORE_UNAVAILABLE',
      httpStatus: 503,
      message: 'Firestore no está disponible para consultar la línea de tiempo forense.',
    });
  }

  if (!hasWithdrawalPermission(adminPrincipal.permissions, 'withdrawals.audit')) {
    throw new WithdrawalModuleError({
      originTask: 'W02',
      originModule: 'AUTHZ',
      code: 'FORBIDDEN_WITHDRAWAL_PERMISSION',
      httpStatus: 403,
      message: 'El operador carece del permiso granular requerido: "withdrawals.audit".',
    });
  }

  const cleanId = typeof withdrawalId === 'string' ? withdrawalId.trim() : '';
  if (!cleanId) {
    throw new WithdrawalModuleError({
      originTask: 'W10',
      originModule: 'AUDIT',
      code: 'WITHDRAWAL_ID_REQUIRED',
      httpStatus: 400,
      message: 'El identificador withdrawalId es obligatorio para auditoría forense.',
    });
  }
  if (!isSafeFirestoreDocId(cleanId)) {
    throw new WithdrawalModuleError({
      originTask: 'W10',
      originModule: 'AUDIT',
      code: 'INVALID_WITHDRAWAL_ID',
      httpStatus: 400,
      message: 'El identificador withdrawalId contiene caracteres no permitidos.',
    });
  }

  try {
    const reqSnap = await firestore
      .collection(WITHDRAWAL_REQUESTS_COLLECTION)
      .doc(cleanId)
      .get();
    if (!unwrapExists(reqSnap)) {
      throw new WithdrawalModuleError({
        originTask: 'W10',
        originModule: 'AUDIT',
        code: 'WITHDRAWAL_NOT_FOUND',
        httpStatus: 404,
        message: `No se encontró la solicitud de retiro "${cleanId}".`,
      });
    }

    const reqData = unwrapData(reqSnap) || {};
    const withdrawal: WithdrawalRequest = {
      ...(reqData as unknown as WithdrawalRequest),
      id: resolveDocId(reqSnap, reqData) || cleanId,
    };

    const [balanceSnap, rawLedger, rawAudit] = await Promise.all([
      firestore.collection(USER_BALANCES_COLLECTION).doc(withdrawal.userId).get(),
      queryWithdrawalHistoryCollection(firestore, FINANCIAL_LEDGER_COLLECTION, withdrawal.id),
      queryWithdrawalHistoryCollection(
        firestore,
        WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
        withdrawal.id,
      ),
    ]);

    const userBalance = unwrapExists(balanceSnap)
      ? ((unwrapData(balanceSnap) || null) as unknown as UserFinancialBalance | null)
      : null;

    const ledgerEntries = rawLedger as unknown as FinancialLedgerEntry[];
    const auditEvents = rawAudit as unknown as WithdrawalAuditEvent[];
    const reconciliation = verifyWithdrawalLedgerReconciliation(
      withdrawal,
      ledgerEntries,
      auditEvents.length,
    );

    if (options.strictIntegrity && !reconciliation.isBalanced) {
      throw new WithdrawalModuleError({
        originTask: 'W10',
        originModule: 'AUDIT',
        code: 'LEDGER_INTEGRITY_ANOMALY',
        httpStatus: 409,
        message: `Anomalía de integridad contable en "${withdrawal.id}": ${reconciliation.anomalies.join(' | ')}`,
      });
    }

    const timeline = buildForensicTimeline(auditEvents, ledgerEntries);

    return {
      ok: true,
      withdrawal,
      userBalance,
      ledgerEntries,
      auditEvents,
      timeline,
      reconciliation,
    };
  } catch (err) {
    if (isWithdrawalModuleError(err)) {
      throw err;
    }
    throw new WithdrawalModuleError({
      originTask: 'W10',
      originModule: 'AUDIT',
      code: 'AUDIT_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? err.message
          : 'Error consultando trazabilidad Ledger/Audit en Firestore.',
    });
  }
}
