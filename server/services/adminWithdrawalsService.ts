/**
 * SCRUM-275 / SCRUM-289 / SCRUM-283 (W08)
 * Server-Authoritative Admin Withdrawals Control Center Service:
 * - `GET /api/admin/withdrawals` (paginated cursor-based Work Queue & Total History, real KPIs, search & filters)
 * - `GET /api/admin/withdrawals/:withdrawalId` (full authorized admin detail + userBalance + Ledger links + Audit timeline)
 *
 * Firestore Index & Security Invariants:
 * 1. Strictly uses ONLY W01 composite indexes (`firestore.indexes.json`) or single-field automatic indexes:
 *    - `(status, requestedAt DESC)`
 *    - `(network, requestedAt DESC)`
 *    - `(status, network, requestedAt DESC)`
 *    - `(membershipTierSnapshot, requestedAt DESC)`
 *    - `(userId, requestedAt DESC)`
 *    - Single-field equality searches (`txHash`, `destinationAddress`, `userEmail`) NEVER attach `orderBy('requestedAt')`
 *      and sort in memory after the single-field query; exact `withdrawalId` uses `.doc(id).get()`.
 * 2. Protected by `requireWithdrawalAdminPermission('withdrawals.read')` (W02).
 * 3. `auditEvents` and detailed `ledgerEntries` are further gated by `hasWithdrawalPermission(permissions, 'withdrawals.audit')`.
 */

import crypto from 'node:crypto';
import type {
  FirestoreDocumentSnapshotLike,
  FirestoreLike,
  FirestoreQuerySnapshotLike,
} from './firebaseAdminAllowlistAdapter.js';
import type { WithdrawalAdminPrincipal } from './withdrawalAuthzMiddleware.js';
import { isSafeFirestoreDocId } from './withdrawalNetworksService.js';
import type {
  FirestoreQueryLike,
  QueryableFirestoreCollectionLike,
} from './withdrawalClientHistoryService.js';
import {
  FINANCIAL_LEDGER_COLLECTION,
  MEMBERSHIP_TIERS,
  OPEN_WITHDRAWAL_STATUSES,
  USER_BALANCES_COLLECTION,
  WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
  WITHDRAWAL_NETWORK_CODES,
  WITHDRAWAL_REQUESTS_COLLECTION,
  WITHDRAWAL_STATUSES,
  WithdrawalModuleError,
  hasWithdrawalPermission,
  isWithdrawalModuleError,
  type AdminWithdrawalKpiSummary,
  type AdminWithdrawalsQueryFilter,
  type FinancialLedgerEntry,
  type MembershipTier,
  type UserFinancialBalance,
  type WithdrawalAuditEvent,
  type WithdrawalNetworkCode,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from '../../src/types/withdrawal.js';

export const DEFAULT_ADMIN_HISTORY_LIMIT = 20 as const;
export const MAX_ADMIN_HISTORY_LIMIT = 50 as const;

export type AdminWithdrawalsTab = 'queue' | 'all';

export interface AdminWithdrawalsListQueryInput extends AdminWithdrawalsQueryFilter {
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

interface DecodedAdminCursor {
  v: 1;
  scope: 'admin';
  filterHash: string;
  requestedAt: string;
  id: string;
}

interface OrderableFirestoreCollectionLike extends QueryableFirestoreCollectionLike {
  orderBy?(fieldPath: string, directionStr?: 'asc' | 'desc'): FirestoreQueryLike;
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

function computeFilterHash(filter: {
  tab: AdminWithdrawalsTab;
  status: WithdrawalStatus | 'ALL';
  network: WithdrawalNetworkCode | 'ALL';
  membershipTier: MembershipTier | 'ALL';
  searchQuery: string;
  dateFrom?: string;
  dateTo?: string;
}): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(filter))
    .digest('hex')
    .slice(0, 16);
}

export function encodeAdminWithdrawalsCursor(
  filterHash: string,
  requestedAt: string,
  id: string,
): string {
  const payload: DecodedAdminCursor = {
    v: 1,
    scope: 'admin',
    filterHash,
    requestedAt: requestedAt.trim(),
    id: id.trim(),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeAdminWithdrawalsCursor(
  rawCursor: string,
  expectedFilterHash: string,
): DecodedAdminCursor {
  const trimmed = typeof rawCursor === 'string' ? rawCursor.trim() : '';
  if (!trimmed || trimmed.length > 512) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_CURSOR',
      httpStatus: 400,
      message: 'El cursor de paginación Admin tiene formato inválido.',
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(trimmed, 'base64url').toString('utf8'));
  } catch {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_CURSOR',
      httpStatus: 400,
      message: 'No se pudo decodificar el cursor de paginación Admin.',
    });
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_CURSOR',
      httpStatus: 400,
      message: 'El cursor de paginación Admin está corrupto.',
    });
  }

  const candidate = parsed as Partial<DecodedAdminCursor>;
  if (
    candidate.v !== 1 ||
    candidate.scope !== 'admin' ||
    typeof candidate.filterHash !== 'string' ||
    !candidate.filterHash.trim() ||
    typeof candidate.requestedAt !== 'string' ||
    Number.isNaN(Date.parse(candidate.requestedAt)) ||
    typeof candidate.id !== 'string' ||
    !candidate.id.trim() ||
    !isSafeFirestoreDocId(candidate.id)
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_CURSOR',
      httpStatus: 400,
      message: 'El cursor de paginación Admin carece de campos requeridos válidos.',
    });
  }

  if (candidate.filterHash !== expectedFilterHash) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'CURSOR_FILTER_MISMATCH',
      httpStatus: 409,
      message: 'El cursor pertenece a otra combinación de filtros o pestaña. Reinicia la consulta.',
    });
  }

  return {
    v: 1,
    scope: 'admin',
    filterHash: candidate.filterHash,
    requestedAt: candidate.requestedAt.trim(),
    id: candidate.id.trim(),
  };
}

function parseAdminLimit(rawLimit: unknown): number {
  if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
    return DEFAULT_ADMIN_HISTORY_LIMIT;
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
    parsed > MAX_ADMIN_HISTORY_LIMIT
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_PAGINATION_LIMIT',
      httpStatus: 400,
      message: `El parámetro limit debe ser un entero entre 1 y ${MAX_ADMIN_HISTORY_LIMIT}.`,
    });
  }
  return parsed;
}

function normalizeAdminFilter(input: AdminWithdrawalsListQueryInput) {
  const rawTab = typeof input.tab === 'string' ? input.tab.trim().toLowerCase() : 'all';
  if (rawTab !== 'queue' && rawTab !== 'all') {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_FILTER_PARAMS',
      httpStatus: 400,
      message: `Pestaña inválida "${String(input.tab)}". Use 'queue' o 'all'.`,
    });
  }
  const tab: AdminWithdrawalsTab = rawTab;

  const rawStatus =
    typeof input.status === 'string' && input.status.trim()
      ? input.status.trim().toUpperCase()
      : 'ALL';
  if (
    rawStatus !== 'ALL' &&
    !(WITHDRAWAL_STATUSES as readonly string[]).includes(rawStatus)
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_FILTER_PARAMS',
      httpStatus: 400,
      message: `Estado de filtro inválido: "${rawStatus}".`,
    });
  }

  const rawNetwork =
    typeof input.network === 'string' && input.network.trim()
      ? input.network.trim().toUpperCase()
      : 'ALL';
  if (
    rawNetwork !== 'ALL' &&
    !(WITHDRAWAL_NETWORK_CODES as readonly string[]).includes(rawNetwork)
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_FILTER_PARAMS',
      httpStatus: 400,
      message: `Red de filtro inválida: "${rawNetwork}".`,
    });
  }

  const rawTier =
    typeof input.membershipTier === 'string' && input.membershipTier.trim()
      ? input.membershipTier.trim().toUpperCase()
      : 'ALL';
  if (rawTier !== 'ALL' && !(MEMBERSHIP_TIERS as readonly string[]).includes(rawTier)) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_FILTER_PARAMS',
      httpStatus: 400,
      message: `Membresía de filtro inválida: "${rawTier}".`,
    });
  }

  const dateFrom =
    typeof input.dateFrom === 'string' && input.dateFrom.trim()
      ? input.dateFrom.trim()
      : undefined;
  const dateTo =
    typeof input.dateTo === 'string' && input.dateTo.trim()
      ? input.dateTo.trim()
      : undefined;

  if (dateFrom && Number.isNaN(Date.parse(dateFrom))) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_FILTER_PARAMS',
      httpStatus: 400,
      message: 'dateFrom debe ser una fecha ISO-8601 válida.',
    });
  }
  if (dateTo && Number.isNaN(Date.parse(dateTo))) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_FILTER_PARAMS',
      httpStatus: 400,
      message: 'dateTo debe ser una fecha ISO-8601 válida.',
    });
  }

  const searchQuery =
    typeof input.searchQuery === 'string' ? input.searchQuery.trim() : '';
  if (searchQuery.length > 256) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'INVALID_FILTER_PARAMS',
      httpStatus: 400,
      message: 'searchQuery excede el máximo permitido de 256 caracteres.',
    });
  }

  return {
    tab,
    status: rawStatus as WithdrawalStatus | 'ALL',
    network: rawNetwork as WithdrawalNetworkCode | 'ALL',
    membershipTier: rawTier as MembershipTier | 'ALL',
    searchQuery,
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };
}

function hydrateWithdrawalRecord(
  docId: string,
  raw: Record<string, unknown>,
): WithdrawalRequest {
  return {
    ...(raw as unknown as WithdrawalRequest),
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : docId,
  };
}

function sortByRequestedAtDesc(items: WithdrawalRequest[]): WithdrawalRequest[] {
  return [...items].sort((a, b) => {
    const cmp = String(b.requestedAt ?? '').localeCompare(String(a.requestedAt ?? ''));
    if (cmp !== 0) return cmp;
    return String(b.id ?? '').localeCompare(String(a.id ?? ''));
  });
}

function matchesNonIndexedFilters(
  item: WithdrawalRequest,
  filter: ReturnType<typeof normalizeAdminFilter>,
): boolean {
  if (
    filter.tab === 'queue' &&
    !(OPEN_WITHDRAWAL_STATUSES as readonly string[]).includes(item.status)
  ) {
    return false;
  }
  if (filter.status !== 'ALL' && item.status !== filter.status) {
    return false;
  }
  if (filter.network !== 'ALL' && item.network !== filter.network) {
    return false;
  }
  if (
    filter.membershipTier !== 'ALL' &&
    item.membershipTierSnapshot !== filter.membershipTier
  ) {
    return false;
  }
  if (filter.dateFrom) {
    const itemMs = Date.parse(item.requestedAt);
    const fromMs = Date.parse(filter.dateFrom);
    if (!Number.isNaN(itemMs) && itemMs < fromMs) {
      return false;
    }
  }
  if (filter.dateTo) {
    const itemMs = Date.parse(item.requestedAt);
    const toMs = Date.parse(filter.dateTo);
    if (!Number.isNaN(itemMs) && itemMs > toMs) {
      return false;
    }
  }
  return true;
}

function matchesSearchText(item: WithdrawalRequest, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return (
    item.id.toLowerCase() === q ||
    (item.txHash ?? '').toLowerCase() === q ||
    item.userId.toLowerCase() === q ||
    item.userEmail.toLowerCase().includes(q) ||
    item.destinationAddress.toLowerCase() === q
  );
}

function isTxHashLike(q: string): boolean {
  return (
    /^0x[a-fA-F0-9]{64}$/.test(q) ||
    /^[a-fA-F0-9]{64}$/.test(q) ||
    /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(q)
  );
}

function isWalletAddressLike(q: string): boolean {
  return (
    /^0x[a-fA-F0-9]{40}$/.test(q) ||
    /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(q) ||
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q)
  );
}

async function computeAuthoritativeKpis(
  collection: OrderableFirestoreCollectionLike,
): Promise<AdminWithdrawalKpiSummary> {
  const summary: AdminWithdrawalKpiSummary = {
    pendingReviewCount: 0,
    lockedAmountMicros: 0,
    processingAndBroadcastedCount: 0,
    completedCount: 0,
    totalSettledAmountMicros: 0,
    rejectedOrCancelledCount: 0,
  };

  let allSnaps: FirestoreDocumentSnapshotLike[] = [];
  if (typeof collection.where === 'function') {
    // Query each canonical status using existing `(status, requestedAt DESC)` index or single-field index
    const statusesQueryResults = await Promise.all(
      WITHDRAWAL_STATUSES.map((status) =>
        collection.where!('status', '==', status).get(),
      ),
    );
    allSnaps = statusesQueryResults.flatMap((res) => res.docs);
  } else {
    const snap = await collection.get();
    allSnaps = snap.docs;
  }

  for (const docSnap of allSnaps) {
    if (!unwrapExists(docSnap)) continue;
    const raw = unwrapData(docSnap);
    if (!raw) continue;
    const item = hydrateWithdrawalRecord(resolveDocId(docSnap, raw), raw);

    if (item.status === 'REQUESTED' || item.status === 'UNDER_REVIEW') {
      summary.pendingReviewCount += 1;
    }
    if ((OPEN_WITHDRAWAL_STATUSES as readonly string[]).includes(item.status)) {
      summary.lockedAmountMicros += Number(item.totalDebitMicros || 0);
    }
    if (
      item.status === 'APPROVED' ||
      item.status === 'PROCESSING' ||
      item.status === 'BROADCASTED'
    ) {
      summary.processingAndBroadcastedCount += 1;
    }
    if (item.status === 'COMPLETED') {
      summary.completedCount += 1;
      summary.totalSettledAmountMicros += Number(item.netAmountMicros || 0);
    }
    if (item.status === 'REJECTED' || item.status === 'CANCELLED') {
      summary.rejectedOrCancelledCount += 1;
    }
  }

  return summary;
}

async function executeSearchQuery(
  collection: OrderableFirestoreCollectionLike,
  searchQuery: string,
): Promise<WithdrawalRequest[]> {
  const q = searchQuery.trim();
  if (!q) return [];

  // 1. Exact withdrawalId lookup O(1) — F-MED-01: only call .doc(q) on safe Firestore doc IDs
  if (isSafeFirestoreDocId(q)) {
    const directSnap = await collection.doc(q).get();
    if (unwrapExists(directSnap)) {
      const data = unwrapData(directSnap) || {};
      return [hydrateWithdrawalRecord(resolveDocId(directSnap, data), data)];
    }
  }

  // 2. Single-field automatic-index equality queries (NO orderBy('requestedAt') to stay within W01 indexes!)
  if (typeof collection.where === 'function') {
    if (isTxHashLike(q)) {
      const snap = await collection.where('txHash', '==', q).get();
      return sortByRequestedAtDesc(
        snap.docs
          .filter(unwrapExists)
          .map((d) => hydrateWithdrawalRecord(resolveDocId(d, unwrapData(d)), unwrapData(d) || {})),
      );
    }

    if (isWalletAddressLike(q)) {
      const snap = await collection.where('destinationAddress', '==', q).get();
      return sortByRequestedAtDesc(
        snap.docs
          .filter(unwrapExists)
          .map((d) => hydrateWithdrawalRecord(resolveDocId(d, unwrapData(d)), unwrapData(d) || {})),
      );
    }

    if (q.includes('@')) {
      const snap = await collection.where('userEmail', '==', q.toLowerCase()).get();
      return sortByRequestedAtDesc(
        snap.docs
          .filter(unwrapExists)
          .map((d) => hydrateWithdrawalRecord(resolveDocId(d, unwrapData(d)), unwrapData(d) || {})),
      );
    }

    // Exact UID search uses W01 composite index `(userId ASC, requestedAt DESC)`
    const uidSnap = await collection
      .where('userId', '==', q)
      .orderBy('requestedAt', 'desc')
      .get();
    if (uidSnap.docs.length > 0) {
      return uidSnap.docs
        .filter(unwrapExists)
        .map((d) => hydrateWithdrawalRecord(resolveDocId(d, unwrapData(d)), unwrapData(d) || {}));
    }
  }

  // 3. Fallback when mock collection only supports `.get()`
  if (typeof collection.where !== 'function') {
    const allSnap = await collection.get();
    return sortByRequestedAtDesc(
      allSnap.docs
        .filter(unwrapExists)
        .map((d) => hydrateWithdrawalRecord(resolveDocId(d, unwrapData(d)), unwrapData(d) || {}))
        .filter((item) => matchesSearchText(item, q)),
    );
  }

  return [];
}

/**
 * Lists paginated withdrawal requests for the Admin Control Center (`GET /api/admin/withdrawals`).
 * Requires `withdrawals.read` permission verified by W02 middleware.
 */
export async function listAdminWithdrawals(
  firestore: FirestoreLike | null | undefined,
  adminPrincipal: WithdrawalAdminPrincipal,
  queryInput: AdminWithdrawalsListQueryInput = {},
): Promise<AdminWithdrawalsListResponseDto> {
  if (!firestore) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'ADMIN_FIRESTORE_UNAVAILABLE',
      httpStatus: 503,
      message: 'Firestore no está disponible para el Centro de Control Admin.',
    });
  }

  if (!hasWithdrawalPermission(adminPrincipal.permissions, 'withdrawals.read')) {
    throw new WithdrawalModuleError({
      originTask: 'W02',
      originModule: 'AUTHZ',
      code: 'FORBIDDEN_WITHDRAWAL_PERMISSION',
      httpStatus: 403,
      message: 'El operador administrativo carece del permiso granular requerido: "withdrawals.read".',
    });
  }

  const limit = parseAdminLimit(queryInput.limit);
  const appliedFilter = normalizeAdminFilter(queryInput);
  const filterHash = computeFilterHash(appliedFilter);

  const rawCursor =
    typeof queryInput.cursor === 'string' ? queryInput.cursor.trim() : '';
  const decodedCursor = rawCursor
    ? decodeAdminWithdrawalsCursor(rawCursor, filterHash)
    : null;

  const collection = firestore.collection(
    WITHDRAWAL_REQUESTS_COLLECTION,
  ) as OrderableFirestoreCollectionLike;

  let cursorSnap: FirestoreDocumentSnapshotLike | null = null;
  if (decodedCursor) {
    cursorSnap = await collection.doc(decodedCursor.id).get();
    if (!unwrapExists(cursorSnap)) {
      throw new WithdrawalModuleError({
        originTask: 'W08',
        originModule: 'ADMIN_UI',
        code: 'INVALID_CURSOR',
        httpStatus: 400,
        message: 'El documento referenciado por el cursor Admin ya no existe.',
      });
    }
  }

  try {
    const kpis = await computeAuthoritativeKpis(collection);
    let pageItems: WithdrawalRequest[] = [];
    let hasMore = false;

    if (appliedFilter.searchQuery) {
      const searchMatches = (
        await executeSearchQuery(collection, appliedFilter.searchQuery)
      ).filter((item) => matchesNonIndexedFilters(item, appliedFilter));

      let startIdx = 0;
      if (decodedCursor) {
        const idx = searchMatches.findIndex((i) => i.id === decodedCursor.id);
        startIdx = idx >= 0 ? idx + 1 : searchMatches.length;
      }
      const slice = searchMatches.slice(startIdx, startIdx + limit + 1);
      hasMore = slice.length > limit;
      pageItems = hasMore ? slice.slice(0, limit) : slice;
    } else if (
      typeof collection.where === 'function' &&
      typeof collection.orderBy === 'function'
    ) {
      // Select the exact W01 composite index from `firestore.indexes.json`
      let baseQuery: FirestoreQueryLike;
      if (appliedFilter.status !== 'ALL' && appliedFilter.network !== 'ALL') {
        const statusFiltered = collection.where('status', '==', appliedFilter.status);
        if (typeof statusFiltered.where !== 'function') {
          throw new WithdrawalModuleError({
            originTask: 'W08',
            originModule: 'ADMIN_UI',
            code: 'ADMIN_FIRESTORE_UNAVAILABLE',
            httpStatus: 503,
            message: 'Firestore query encadenado (.where) no está disponible.',
          });
        }
        baseQuery = statusFiltered
          .where('network', '==', appliedFilter.network)
          .orderBy('requestedAt', 'desc');
      } else if (appliedFilter.status !== 'ALL') {
        baseQuery = collection
          .where('status', '==', appliedFilter.status)
          .orderBy('requestedAt', 'desc');
      } else if (appliedFilter.network !== 'ALL') {
        baseQuery = collection
          .where('network', '==', appliedFilter.network)
          .orderBy('requestedAt', 'desc');
      } else if (appliedFilter.membershipTier !== 'ALL') {
        baseQuery = collection
          .where('membershipTierSnapshot', '==', appliedFilter.membershipTier)
          .orderBy('requestedAt', 'desc');
      } else {
        baseQuery = collection.orderBy('requestedAt', 'desc');
      }

      // Bounded chunked cursor walk so secondary filters (`tab='queue'`, `dateFrom`/`dateTo`)
      // never create a new composite index requirement.
      const collected: WithdrawalRequest[] = [];
      let activeCursorSnap: FirestoreDocumentSnapshotLike | null = cursorSnap;
      const chunkSize = Math.min(Math.max(limit * 2, 25), 100);
      let safetyChunks = 0;

      while (collected.length < limit + 1 && safetyChunks < 10) {
        safetyChunks += 1;
        let q = baseQuery;
        if (activeCursorSnap) {
          q = q.startAfter(activeCursorSnap);
        }
        const snap = await q.limit(chunkSize).get();
        if (snap.docs.length === 0) {
          break;
        }
        for (const docSnap of snap.docs) {
          if (!unwrapExists(docSnap)) continue;
          const data = unwrapData(docSnap) || {};
          const item = hydrateWithdrawalRecord(resolveDocId(docSnap, data), data);
          if (matchesNonIndexedFilters(item, appliedFilter)) {
            collected.push(item);
            if (collected.length >= limit + 1) {
              break;
            }
          }
        }
        if (snap.docs.length < chunkSize) {
          break;
        }
        activeCursorSnap = snap.docs[snap.docs.length - 1];
      }

      hasMore = collected.length > limit;
      pageItems = hasMore ? collected.slice(0, limit) : collected;
    } else {
      // Minimal fallback for simple mock collections without `.where`/`.orderBy`
      const fullSnap = await collection.get();
      const sorted = sortByRequestedAtDesc(
        fullSnap.docs
          .filter(unwrapExists)
          .map((d) => hydrateWithdrawalRecord(resolveDocId(d, unwrapData(d)), unwrapData(d) || {}))
          .filter((item) => matchesNonIndexedFilters(item, appliedFilter)),
      );
      let startIdx = 0;
      if (decodedCursor) {
        const idx = sorted.findIndex((i) => i.id === decodedCursor.id);
        startIdx = idx >= 0 ? idx + 1 : sorted.length;
      }
      const slice = sorted.slice(startIdx, startIdx + limit + 1);
      hasMore = slice.length > limit;
      pageItems = hasMore ? slice.slice(0, limit) : slice;
    }

    const lastItem = pageItems.length > 0 ? pageItems[pageItems.length - 1] : null;
    const nextCursor =
      hasMore && lastItem
        ? encodeAdminWithdrawalsCursor(filterHash, lastItem.requestedAt, lastItem.id)
        : null;

    return {
      ok: true,
      tab: appliedFilter.tab,
      items: pageItems,
      nextCursor,
      hasMore,
      limit,
      kpis,
      appliedFilter,
    };
  } catch (err) {
    if (isWithdrawalModuleError(err)) {
      throw err;
    }
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'ADMIN_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? err.message
          : 'Error al consultar el Centro de Control Admin en Firestore.',
    });
  }
}

async function queryByWithdrawalIdOrdered(
  firestore: FirestoreLike,
  collectionName: string,
  withdrawalId: string,
): Promise<Record<string, unknown>[]> {
  const col = firestore.collection(collectionName) as OrderableFirestoreCollectionLike;
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

/**
 * Fetches full authorized Admin detail for a withdrawal request (`GET /api/admin/withdrawals/:withdrawalId`).
 * Includes user's `/userBalances/{uid}` snapshot, Withdrawal↔Ledger links, and
 * `withdrawalAuditEvents` timeline (forensic audit/ledger details gated by `withdrawals.audit`).
 */
export async function getAdminWithdrawalDetail(
  firestore: FirestoreLike | null | undefined,
  adminPrincipal: WithdrawalAdminPrincipal,
  withdrawalId: string,
): Promise<AdminWithdrawalDetailResponseDto> {
  if (!firestore) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'ADMIN_FIRESTORE_UNAVAILABLE',
      httpStatus: 503,
      message: 'Firestore no está disponible para consultar el detalle Admin.',
    });
  }

  if (!hasWithdrawalPermission(adminPrincipal.permissions, 'withdrawals.read')) {
    throw new WithdrawalModuleError({
      originTask: 'W02',
      originModule: 'AUTHZ',
      code: 'FORBIDDEN_WITHDRAWAL_PERMISSION',
      httpStatus: 403,
      message: 'El operador administrativo carece del permiso granular requerido: "withdrawals.read".',
    });
  }

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
  if (!isSafeFirestoreDocId(cleanId)) {
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
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
        originTask: 'W08',
        originModule: 'ADMIN_UI',
        code: 'WITHDRAWAL_NOT_FOUND',
        httpStatus: 404,
        message: `No se encontró la solicitud de retiro "${cleanId}".`,
      });
    }

    const reqData = unwrapData(reqSnap) || {};
    const withdrawal = hydrateWithdrawalRecord(resolveDocId(reqSnap, reqData), reqData);

    const balanceSnap = await firestore
      .collection(USER_BALANCES_COLLECTION)
      .doc(withdrawal.userId)
      .get();
    const userBalance = unwrapExists(balanceSnap)
      ? ((unwrapData(balanceSnap) || null) as unknown as UserFinancialBalance | null)
      : null;

    const auditAccessGranted = hasWithdrawalPermission(
      adminPrincipal.permissions,
      'withdrawals.audit',
    );

    const rawLedger = await queryByWithdrawalIdOrdered(
      firestore,
      FINANCIAL_LEDGER_COLLECTION,
      withdrawal.id,
    );
    const ledgerEntryIds = rawLedger.map((entry) => String(entry.id ?? '')).filter(Boolean);

    const rawAudit = auditAccessGranted
      ? await queryByWithdrawalIdOrdered(
          firestore,
          WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
          withdrawal.id,
        )
      : [];

    return {
      ok: true,
      withdrawal,
      userBalance,
      ledgerEntries: auditAccessGranted
        ? (rawLedger as unknown as FinancialLedgerEntry[])
        : [],
      ledgerEntryIds,
      auditEvents: rawAudit as unknown as WithdrawalAuditEvent[],
      auditAccessGranted,
    };
  } catch (err) {
    if (isWithdrawalModuleError(err)) {
      throw err;
    }
    throw new WithdrawalModuleError({
      originTask: 'W08',
      originModule: 'ADMIN_UI',
      code: 'ADMIN_FETCH_FAILED',
      httpStatus: 503,
      message:
        err instanceof Error
          ? err.message
          : 'Error al consultar el detalle Admin en Firestore.',
    });
  }
}
