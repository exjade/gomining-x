/**
 * SCRUM-275 / SCRUM-289 / SCRUM-283 (W08)
 * Admin Withdrawals Control Center (`AdminWithdrawalsControlCenter.tsx`) + Headless Controller
 *
 * Replaces `localStorage`/mock `ClientWithdrawalsService` with real backend authority:
 * - Authoritative KPIs (`pendingReviewCount`, `lockedAmountMicros`, `processingAndBroadcastedCount`,
 *   `completedCount`, `totalSettledAmountMicros`, `rejectedOrCancelledCount`)
 * - Work Queue (`tab='queue'`) & Total History (`tab='all'`)
 * - Server-side search (`withdrawalId`, `txHash`, `userId`, `userEmail`, `destinationAddress`) & filters (`status`, `network`, `membershipTier`, dates)
 * - Cursor-based pagination without full-collection browser scan
 * - Reuses W06 shared UI (`WithdrawalHistory` & `WithdrawalDetailsModal` in `mode="admin"`)
 * - Evaluates granular W02 RBAC (`evaluateAvailableWithdrawalActions`) without `SUPER_ADMIN` bypass
 * - Explicitly distinguishes `load` | `authz` | `action_conflict` | `stale` states
 * - Zero workflow mutations (those are out of scope in W08 and implemented in W09)
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import '../withdrawals/withdrawalShared.css';
import {
  MEMBERSHIP_TIERS,
  WITHDRAWAL_ASSET,
  WITHDRAWAL_NETWORK_CODES,
  WITHDRAWAL_STATUSES,
  formatMicrosAsUsdt,
  type AdminWithdrawalKpiSummary,
  type MembershipTier,
  type WithdrawalNetworkCode,
  type WithdrawalNetworkConfig,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from '../../types/withdrawal.js';
import {
  evaluateAvailableWithdrawalActions,
  type AvailableWithdrawalActions,
} from '../../services/admin/withdrawalRbacService.js';
import {
  DEFAULT_ADMIN_HISTORY_LIMIT,
  classifyAdminWithdrawalError,
  fetchAdminWithdrawalDetail,
  fetchAdminWithdrawals,
  type AdminWithdrawalDetailResponseDto,
  type AdminWithdrawalSession,
  type AdminWithdrawalsApiClientOptions,
  type AdminWithdrawalsTab,
  type ClassifiedAdminWithdrawalError,
} from '../../services/admin/adminWithdrawalsClient.js';
import { WithdrawalHistory } from '../withdrawals/WithdrawalHistory.js';
import { WithdrawalDetailsModal } from '../withdrawals/WithdrawalDetailsModal.js';
import {
  approveAdminWithdrawal,
  cancelAdminWithdrawal,
  editAdminWithdrawal,
  processAdminWithdrawal,
  rejectAdminWithdrawal,
  reviewAdminWithdrawal,
  type AdminWorkflowMutationAction,
  type AdminWorkflowMutationResponseDto,
} from '../../services/admin/adminWithdrawalWorkflowClient.js';
import {
  AdminWithdrawalWorkflowModal,
  AdminWithdrawalWorkflowToolbar,
  type AdminWorkflowModalSubmitPayload,
} from './AdminWithdrawalWorkflowModal.js';
import {
  fetchAdminWithdrawalAudit,
  type AdminWithdrawalAuditTimelineResponseDto,
} from '../../services/admin/adminWithdrawalAuditClient.js';
import { AdminForensicTimelinePanel } from './AdminForensicTimelinePanel.js';
import {
  broadcastAdminWithdrawal,
  completeAdminWithdrawal,
  updateAdminWithdrawalConfirmations,
  type AdminSettlementMutationAction,
  type AdminSettlementMutationResponseDto,
} from '../../services/admin/adminWithdrawalSettlementClient.js';
import {
  AdminWithdrawalSettlementModal,
  AdminWithdrawalSettlementToolbar,
  type AdminSettlementModalSubmitPayload,
} from './AdminWithdrawalSettlementModal.js';

export interface AdminWithdrawalsFilterState {
  tab: AdminWithdrawalsTab;
  status: WithdrawalStatus | 'ALL';
  network: WithdrawalNetworkCode | 'ALL';
  membershipTier: MembershipTier | 'ALL';
  searchQuery: string;
  dateFrom: string;
  dateTo: string;
}

export interface AdminWithdrawalsSnapshot {
  filter: AdminWithdrawalsFilterState;
  kpis: AdminWithdrawalKpiSummary;
  items: WithdrawalRequest[];
  nextCursor: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  isLoadingDetail: boolean;
  isStale: boolean;
  selectedDetail: AdminWithdrawalDetailResponseDto | null;
  selectedRbacActions: AvailableWithdrawalActions | null;
  selectedAuditTimeline?: AdminWithdrawalAuditTimelineResponseDto | null;
  isLoadingAudit?: boolean;
  error: ClassifiedAdminWithdrawalError | null;
}

export interface CreateAdminWithdrawalsControllerOptions {
  session: AdminWithdrawalSession | null | undefined;
  apiOptions?: AdminWithdrawalsApiClientOptions;
  pageSize?: number;
  initialTab?: AdminWithdrawalsTab;
  initialSnapshot?: AdminWithdrawalsSnapshot;
  onStateChange?: (snapshot: AdminWithdrawalsSnapshot) => void;
}

export interface AdminWithdrawalsController {
  getSnapshot(): AdminWithdrawalsSnapshot;
  load(overrideFilter?: Partial<AdminWithdrawalsFilterState>): Promise<WithdrawalRequest[]>;
  setTab(tab: AdminWithdrawalsTab): Promise<WithdrawalRequest[]>;
  applyFilters(patch: Partial<AdminWithdrawalsFilterState>): Promise<WithdrawalRequest[]>;
  loadMore(): Promise<WithdrawalRequest[]>;
  refresh(): Promise<WithdrawalRequest[]>;
  openDetail(withdrawalId: string): Promise<AdminWithdrawalDetailResponseDto>;
  closeDetail(): void;
  openAuditTimeline(
    withdrawalId: string,
  ): Promise<AdminWithdrawalAuditTimelineResponseDto>;
  executeWorkflowAction(
    withdrawalId: string,
    payload: AdminWorkflowModalSubmitPayload,
  ): Promise<AdminWorkflowMutationResponseDto>;
  executeSettlementAction(
    withdrawalId: string,
    payload: AdminSettlementModalSubmitPayload,
  ): Promise<AdminSettlementMutationResponseDto>;
}

const EMPTY_KPIS: AdminWithdrawalKpiSummary = {
  pendingReviewCount: 0,
  lockedAmountMicros: 0,
  processingAndBroadcastedCount: 0,
  completedCount: 0,
  totalSettledAmountMicros: 0,
  rejectedOrCancelledCount: 0,
};

function mergeUniqueById(
  existing: readonly WithdrawalRequest[],
  incoming: readonly WithdrawalRequest[],
): WithdrawalRequest[] {
  const map = new Map<string, WithdrawalRequest>();
  for (const item of existing) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values());
}

export function createAdminWithdrawalsController(
  options: CreateAdminWithdrawalsControllerOptions,
): AdminWithdrawalsController {
  const limit = options.pageSize ?? DEFAULT_ADMIN_HISTORY_LIMIT;

  let state: AdminWithdrawalsSnapshot = options.initialSnapshot
    ? {
        ...options.initialSnapshot,
        filter: { ...options.initialSnapshot.filter },
        kpis: { ...options.initialSnapshot.kpis },
        items: [...options.initialSnapshot.items],
      }
    : {
        filter: {
          tab: options.initialTab ?? 'queue',
          status: 'ALL',
          network: 'ALL',
          membershipTier: 'ALL',
          searchQuery: '',
          dateFrom: '',
          dateTo: '',
        },
        kpis: { ...EMPTY_KPIS },
        items: [],
        nextCursor: null,
        hasMore: false,
        isLoading: false,
        isLoadingMore: false,
        isRefreshing: false,
        isLoadingDetail: false,
        isStale: false,
        selectedDetail: null,
        selectedRbacActions: null,
        error: null,
      };

  const notify = () => {
    options.onStateChange?.({
      ...state,
      filter: { ...state.filter },
      kpis: { ...state.kpis },
      items: [...state.items],
    });
  };

  const updateState = (patch: Partial<AdminWithdrawalsSnapshot>) => {
    state = { ...state, ...patch };
    notify();
  };

  const fetchFirstPage = async (
    nextFilter: AdminWithdrawalsFilterState,
    isRefresh: boolean,
  ): Promise<WithdrawalRequest[]> => {
    updateState(
      isRefresh
        ? { filter: nextFilter, isRefreshing: true, error: null }
        : { filter: nextFilter, isLoading: true, error: null },
    );

    try {
      const response = await fetchAdminWithdrawals(
        options.session,
        {
          tab: nextFilter.tab,
          status: nextFilter.status,
          network: nextFilter.network,
          membershipTier: nextFilter.membershipTier,
          searchQuery: nextFilter.searchQuery || undefined,
          dateFrom: nextFilter.dateFrom || undefined,
          dateTo: nextFilter.dateTo || undefined,
          limit,
        },
        options.apiOptions,
      );

      updateState({
        filter: nextFilter,
        kpis: response.kpis,
        items: response.items,
        nextCursor: response.nextCursor,
        hasMore: response.hasMore,
        isLoading: false,
        isRefreshing: false,
        isStale: false,
        error: null,
      });
      return response.items;
    } catch (err) {
      const hasData = state.items.length > 0;
      const classified = classifyAdminWithdrawalError(err, hasData);
      updateState({
        isLoading: false,
        isRefreshing: false,
        isStale: hasData && classified.category !== 'authz',
        error: classified,
      });
      throw err;
    }
  };

  return {
    getSnapshot(): AdminWithdrawalsSnapshot {
      return {
        ...state,
        filter: { ...state.filter },
        kpis: { ...state.kpis },
        items: [...state.items],
      };
    },

    async load(overrideFilter?: Partial<AdminWithdrawalsFilterState>): Promise<WithdrawalRequest[]> {
      const merged: AdminWithdrawalsFilterState = {
        ...state.filter,
        ...(overrideFilter ?? {}),
      };
      return fetchFirstPage(merged, false);
    },

    async setTab(tab: AdminWithdrawalsTab): Promise<WithdrawalRequest[]> {
      const nextFilter: AdminWithdrawalsFilterState = {
        ...state.filter,
        tab,
      };
      return fetchFirstPage(nextFilter, false);
    },

    async applyFilters(
      patch: Partial<AdminWithdrawalsFilterState>,
    ): Promise<WithdrawalRequest[]> {
      const nextFilter: AdminWithdrawalsFilterState = {
        ...state.filter,
        ...patch,
      };
      return fetchFirstPage(nextFilter, false);
    },

    async refresh(): Promise<WithdrawalRequest[]> {
      return fetchFirstPage(state.filter, true);
    },

    async loadMore(): Promise<WithdrawalRequest[]> {
      if (!state.hasMore || !state.nextCursor || state.isLoadingMore) {
        return state.items;
      }

      updateState({ isLoadingMore: true, error: null });
      try {
        const response = await fetchAdminWithdrawals(
          options.session,
          {
            tab: state.filter.tab,
            status: state.filter.status,
            network: state.filter.network,
            membershipTier: state.filter.membershipTier,
            searchQuery: state.filter.searchQuery || undefined,
            dateFrom: state.filter.dateFrom || undefined,
            dateTo: state.filter.dateTo || undefined,
            cursor: state.nextCursor,
            limit,
          },
          options.apiOptions,
        );
        const merged = mergeUniqueById(state.items, response.items);
        updateState({
          kpis: response.kpis,
          items: merged,
          nextCursor: response.nextCursor,
          hasMore: response.hasMore,
          isLoadingMore: false,
          isStale: false,
          error: null,
        });
        return merged;
      } catch (err) {
        const classified = classifyAdminWithdrawalError(err, state.items.length > 0);
        updateState({
          isLoadingMore: false,
          isStale: classified.category === 'stale' || classified.category === 'action_conflict',
          error: classified,
        });
        throw err;
      }
    },

    async openDetail(withdrawalId: string): Promise<AdminWithdrawalDetailResponseDto> {
      updateState({ isLoadingDetail: true, error: null });
      try {
        const detail = await fetchAdminWithdrawalDetail(
          options.session,
          withdrawalId,
          options.apiOptions,
        );
        const w = detail.withdrawal;
        const rbac = evaluateAvailableWithdrawalActions(
          options.session?.permissions,
          w.status,
          {
            confirmations: w.confirmations,
            requiredConfirmations: w.requiredConfirmations,
            hasTxHash: Boolean(w.txHash),
          },
        );
        updateState({
          isLoadingDetail: false,
          selectedDetail: detail,
          selectedRbacActions: rbac,
          selectedAuditTimeline: null,
          error: null,
        });
        return detail;
      } catch (err) {
        const classified = classifyAdminWithdrawalError(err, state.items.length > 0);
        updateState({
          isLoadingDetail: false,
          error: classified,
        });
        throw err;
      }
    },

    closeDetail(): void {
      updateState({
        selectedDetail: null,
        selectedRbacActions: null,
        selectedAuditTimeline: null,
      });
    },

    async openAuditTimeline(
      withdrawalId: string,
    ): Promise<AdminWithdrawalAuditTimelineResponseDto> {
      updateState({ isLoadingAudit: true, error: null });
      try {
        const auditTimeline = await fetchAdminWithdrawalAudit(
          options.session,
          withdrawalId,
          options.apiOptions,
        );
        updateState({
          isLoadingAudit: false,
          selectedAuditTimeline: auditTimeline,
          error: null,
        });
        return auditTimeline;
      } catch (err) {
        const classified = classifyAdminWithdrawalError(err, state.items.length > 0);
        updateState({
          isLoadingAudit: false,
          error: classified,
        });
        throw err;
      }
    },

    async executeWorkflowAction(
      withdrawalId: string,
      payload: AdminWorkflowModalSubmitPayload,
    ): Promise<AdminWorkflowMutationResponseDto> {
      updateState({ isRefreshing: true, error: null });
      try {
        let mutationResult: AdminWorkflowMutationResponseDto;
        if (payload.action === 'REVIEW') {
          mutationResult = await reviewAdminWithdrawal(
            options.session,
            withdrawalId,
            { expectedStatus: payload.expectedStatus, reason: payload.reason },
            options.apiOptions,
          );
        } else if (payload.action === 'EDIT') {
          mutationResult = await editAdminWithdrawal(
            options.session,
            withdrawalId,
            {
              expectedStatus: payload.expectedStatus,
              ...(payload.destinationAddress !== undefined
                ? { destinationAddress: payload.destinationAddress }
                : {}),
              ...(payload.networkId !== undefined ? { networkId: payload.networkId } : {}),
              ...(payload.internalNotes !== undefined
                ? { internalNotes: payload.internalNotes }
                : {}),
              reason: payload.reason,
            },
            options.apiOptions,
          );
        } else if (payload.action === 'APPROVE') {
          mutationResult = await approveAdminWithdrawal(
            options.session,
            withdrawalId,
            { expectedStatus: payload.expectedStatus, reason: payload.reason },
            options.apiOptions,
          );
        } else if (payload.action === 'PROCESS') {
          mutationResult = await processAdminWithdrawal(
            options.session,
            withdrawalId,
            {
              expectedStatus: payload.expectedStatus,
              ...(payload.providerTransactionId
                ? { providerTransactionId: payload.providerTransactionId }
                : {}),
              ...(payload.reason ? { reason: payload.reason } : {}),
            },
            options.apiOptions,
          );
        } else if (payload.action === 'REJECT') {
          mutationResult = await rejectAdminWithdrawal(
            options.session,
            withdrawalId,
            {
              expectedStatus: payload.expectedStatus,
              rejectionReason: payload.rejectionReason,
            },
            options.apiOptions,
          );
        } else {
          mutationResult = await cancelAdminWithdrawal(
            options.session,
            withdrawalId,
            {
              expectedStatus: payload.expectedStatus,
              cancellationReason: payload.cancellationReason,
            },
            options.apiOptions,
          );
        }

        // Refresh list/KPIs + open detail from backend authority
        await fetchFirstPage(state.filter, true);
        if (state.selectedDetail?.withdrawal.id === withdrawalId) {
          await this.openDetail(withdrawalId);
        }
        return mutationResult;
      } catch (err) {
        const classified = classifyAdminWithdrawalError(err, state.items.length > 0);
        updateState({
          isRefreshing: false,
          isStale: classified.category === 'stale' || classified.category === 'action_conflict',
          error: classified,
        });
        throw err;
      }
    },

    async executeSettlementAction(
      withdrawalId: string,
      payload: AdminSettlementModalSubmitPayload,
    ): Promise<AdminSettlementMutationResponseDto> {
      updateState({ isRefreshing: true, error: null });
      try {
        let settlementResult: AdminSettlementMutationResponseDto;
        if (payload.action === 'BROADCAST') {
          settlementResult = await broadcastAdminWithdrawal(
            options.session,
            withdrawalId,
            {
              expectedStatus: payload.expectedStatus,
              txHash: payload.txHash,
              confirmations: payload.confirmations,
              ...(payload.providerTransactionId
                ? { providerTransactionId: payload.providerTransactionId }
                : {}),
            },
            options.apiOptions,
          );
        } else if (payload.action === 'UPDATE_CONFIRMATIONS') {
          settlementResult = await updateAdminWithdrawalConfirmations(
            options.session,
            withdrawalId,
            {
              expectedStatus: payload.expectedStatus,
              confirmations: payload.confirmations,
              ...(payload.reason ? { reason: payload.reason } : {}),
            },
            options.apiOptions,
          );
        } else {
          settlementResult = await completeAdminWithdrawal(
            options.session,
            withdrawalId,
            {
              expectedStatus: payload.expectedStatus,
              confirmations: payload.confirmations,
              ...(payload.reason ? { reason: payload.reason } : {}),
            },
            options.apiOptions,
          );
        }

        // Refresh KPIs, paginated queue, and open detail (including txHash & confirmations) from backend
        await fetchFirstPage(state.filter, true);
        if (state.selectedDetail?.withdrawal.id === withdrawalId) {
          await this.openDetail(withdrawalId);
        }
        return settlementResult;
      } catch (err) {
        const classified = classifyAdminWithdrawalError(err, state.items.length > 0);
        updateState({
          isRefreshing: false,
          isStale: classified.category === 'stale' || classified.category === 'action_conflict',
          error: classified,
        });
        throw err;
      }
    },
  };
}

export interface AdminWithdrawalsControlCenterProps {
  session: AdminWithdrawalSession | null | undefined;
  apiOptions?: AdminWithdrawalsApiClientOptions;
  networksCatalog?: readonly WithdrawalNetworkConfig[];
  pageSize?: number;
  autoLoad?: boolean;
  initialSnapshot?: AdminWithdrawalsSnapshot;
}

export function AdminWithdrawalsControlCenter({
  session,
  apiOptions,
  networksCatalog,
  pageSize = DEFAULT_ADMIN_HISTORY_LIMIT,
  autoLoad = true,
  initialSnapshot,
}: AdminWithdrawalsControlCenterProps): ReactElement {
  const controllerRef = useRef<AdminWithdrawalsController | null>(null);
  const [searchDraft, setSearchDraft] = useState(
    initialSnapshot?.filter.searchQuery ?? '',
  );
  const [activeWorkflowAction, setActiveWorkflowAction] =
    useState<AdminWorkflowMutationAction | null>(null);
  const [workflowSubmitting, setWorkflowSubmitting] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [activeSettlementAction, setActiveSettlementAction] =
    useState<AdminSettlementMutationAction | null>(null);
  const [settlementSubmitting, setSettlementSubmitting] = useState(false);
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AdminWithdrawalsSnapshot>(() => {
    const ctrl = createAdminWithdrawalsController({
      session,
      apiOptions,
      pageSize,
      initialSnapshot,
    });
    controllerRef.current = ctrl;
    return ctrl.getSnapshot();
  });

  useEffect(() => {
    const ctrl = createAdminWithdrawalsController({
      session,
      apiOptions,
      pageSize,
      initialSnapshot,
      onStateChange: (next) => setSnapshot(next),
    });
    controllerRef.current = ctrl;
    setSnapshot(ctrl.getSnapshot());

    if (autoLoad && !initialSnapshot && session?.uid && session?.idToken) {
      void ctrl.load().catch(() => {
        /* captured in snapshot.error */
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.uid, session?.idToken, pageSize]);

  const handleTabSwitch = useCallback(async (tab: AdminWithdrawalsTab) => {
    if (!controllerRef.current) return;
    try {
      await controllerRef.current.setTab(tab);
    } catch {
      /* captured in snapshot.error */
    }
  }, []);

  const handleFilterChange = useCallback(
    async (patch: Partial<AdminWithdrawalsFilterState>) => {
      if (!controllerRef.current) return;
      try {
        await controllerRef.current.applyFilters(patch);
      } catch {
        /* captured in snapshot.error */
      }
    },
    [],
  );

  const handleSearchSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await handleFilterChange({ searchQuery: searchDraft });
    },
    [handleFilterChange, searchDraft],
  );

  const handleRefresh = useCallback(async () => {
    if (!controllerRef.current) return;
    try {
      await controllerRef.current.refresh();
    } catch {
      /* captured in snapshot.error */
    }
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!controllerRef.current) return;
    try {
      await controllerRef.current.loadMore();
    } catch {
      /* captured in snapshot.error */
    }
  }, []);

  const handleSelectWithdrawal = useCallback(async (w: WithdrawalRequest) => {
    if (!controllerRef.current) return;
    setWorkflowError(null);
    setActiveWorkflowAction(null);
    setSettlementError(null);
    setActiveSettlementAction(null);
    try {
      await controllerRef.current.openDetail(w.id);
    } catch {
      /* captured in snapshot.error */
    }
  }, []);

  const handleSubmitWorkflowModal = useCallback(
    async (payload: AdminWorkflowModalSubmitPayload) => {
      if (!controllerRef.current || !snapshot.selectedDetail) return;
      setWorkflowSubmitting(true);
      setWorkflowError(null);
      try {
        await controllerRef.current.executeWorkflowAction(
          snapshot.selectedDetail.withdrawal.id,
          payload,
        );
        setActiveWorkflowAction(null);
      } catch (err) {
        const classified = classifyAdminWithdrawalError(err, snapshot.items.length > 0);
        setWorkflowError(`[${classified.faultCode}] ${classified.message}`);
      } finally {
        setWorkflowSubmitting(false);
      }
    },
    [snapshot.selectedDetail, snapshot.items.length],
  );

  const handleSubmitSettlementModal = useCallback(
    async (payload: AdminSettlementModalSubmitPayload) => {
      if (!controllerRef.current || !snapshot.selectedDetail) return;
      setSettlementSubmitting(true);
      setSettlementError(null);
      try {
        await controllerRef.current.executeSettlementAction(
          snapshot.selectedDetail.withdrawal.id,
          payload,
        );
        setActiveSettlementAction(null);
      } catch (err) {
        const classified = classifyAdminWithdrawalError(err, snapshot.items.length > 0);
        setSettlementError(`[${classified.faultCode}] ${classified.message}`);
      } finally {
        setSettlementSubmitting(false);
      }
    },
    [snapshot.selectedDetail, snapshot.items.length],
  );

  const kpis = snapshot.kpis;
  const detail = snapshot.selectedDetail;
  const rbac = snapshot.selectedRbacActions;

  return (
    <section
      className="wth-admin-center"
      aria-label="Centro de Control Administrativo de Retiros USDT"
      data-testid="admin-withdrawals-control-center"
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#f3f5fa' }}>
            Centro de Control de Retiros ({WITHDRAWAL_ASSET})
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#9ba3b8' }}>
            Cola operativa autoritativa, KPIs en micro-USDT y trazabilidad hacia Ledger y Auditoría.
          </p>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          {snapshot.isStale && (
            <span
              className="wth-mini-tag"
              style={{ color: '#fcd34d', borderColor: 'rgba(245,158,11,0.4)' }}
              data-testid="admin-withdrawals-stale-badge"
            >
              Datos desactualizados (stale)
            </span>
          )}
          <button
            type="button"
            className="wth-btn-secondary"
            onClick={() => void handleRefresh()}
            disabled={snapshot.isLoading || snapshot.isRefreshing}
            data-testid="admin-withdrawals-refresh-btn"
          >
            {snapshot.isRefreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </header>

      {/* 4 Authoritative KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
        data-testid="admin-withdrawals-kpis"
      >
        <div className="wth-history-card" data-testid="kpi-pending-review">
          <span className="wth-cell-secondary">Pendientes / En Revisión</span>
          <strong className="wth-tabular-mono" style={{ fontSize: '20px', color: '#fcd34d' }}>
            {kpis.pendingReviewCount}
          </strong>
          <span className="wth-cell-secondary wth-tabular-mono">
            Locked: {formatMicrosAsUsdt(kpis.lockedAmountMicros, 2)} {WITHDRAWAL_ASSET}
          </span>
        </div>

        <div className="wth-history-card" data-testid="kpi-processing-broadcasted">
          <span className="wth-cell-secondary">Aprobados / Procesando / Emitidos</span>
          <strong className="wth-tabular-mono" style={{ fontSize: '20px', color: '#7dd3fc' }}>
            {kpis.processingAndBroadcastedCount}
          </strong>
          <span className="wth-cell-secondary">En cola o esperando confirmaciones</span>
        </div>

        <div className="wth-history-card" data-testid="kpi-completed-settled">
          <span className="wth-cell-secondary">Total Liquidado On-Chain</span>
          <strong className="wth-tabular-mono" style={{ fontSize: '20px', color: '#34d399' }}>
            {formatMicrosAsUsdt(kpis.totalSettledAmountMicros, 2)} {WITHDRAWAL_ASSET}
          </strong>
          <span className="wth-cell-secondary wth-tabular-mono">
            {kpis.completedCount} retiros completados
          </span>
        </div>

        <div className="wth-history-card" data-testid="kpi-rejected-cancelled">
          <span className="wth-cell-secondary">Rechazados / Cancelados</span>
          <strong className="wth-tabular-mono" style={{ fontSize: '20px', color: '#fda4af' }}>
            {kpis.rejectedOrCancelledCount}
          </strong>
          <span className="wth-cell-secondary">Fondos desbloqueados atómicamente</span>
        </div>
      </div>

      {/* Distinct Error Categories: authz | action_conflict | load | stale */}
      {snapshot.error && (
        <div
          className="wth-history-error-box"
          role="alert"
          data-error-category={snapshot.error.category}
          data-testid="admin-withdrawals-error-banner"
        >
          <span className="wth-mini-tag wth-tabular-mono">{snapshot.error.faultCode}</span>
          <span>
            [{snapshot.error.category.toUpperCase()}] {snapshot.error.message}
          </span>
        </div>
      )}

      {/* Tabs + Server-Side Search & Filter Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '12px',
        }}
      >
        <div role="tablist" aria-label="Vistas de retiros" style={{ display: 'inline-flex', gap: '8px' }}>
          <button
            type="button"
            role="tab"
            aria-selected={snapshot.filter.tab === 'queue'}
            className="wth-btn-secondary"
            onClick={() => void handleTabSwitch('queue')}
            data-testid="admin-tab-queue"
          >
            Cola Activa
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={snapshot.filter.tab === 'all'}
            className="wth-btn-secondary"
            onClick={() => void handleTabSwitch('all')}
            data-testid="admin-tab-all"
          >
            Historial Total
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSearchSubmit(e)}
          style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}
        >
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="ID retiro, txHash, UID, email o wallet..."
            aria-label="Buscar retiros"
            data-testid="admin-search-input"
            style={{
              minHeight: '32px',
              padding: '0 10px',
              borderRadius: '8px',
              background: '#0c101a',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#f3f5fa',
              fontSize: '12px',
            }}
          />
          <select
            aria-label="Filtrar por estado"
            value={snapshot.filter.status}
            onChange={(e) =>
              void handleFilterChange({
                status: e.target.value as WithdrawalStatus | 'ALL',
              })
            }
            data-testid="admin-filter-status"
          >
            <option value="ALL">Todos los estados</option>
            {WITHDRAWAL_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por red"
            value={snapshot.filter.network}
            onChange={(e) =>
              void handleFilterChange({
                network: e.target.value as WithdrawalNetworkCode | 'ALL',
              })
            }
            data-testid="admin-filter-network"
          >
            <option value="ALL">Todas las redes</option>
            {WITHDRAWAL_NETWORK_CODES.map((net) => (
              <option key={net} value={net}>
                {net}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por membresía"
            value={snapshot.filter.membershipTier}
            onChange={(e) =>
              void handleFilterChange({
                membershipTier: e.target.value as MembershipTier | 'ALL',
              })
            }
            data-testid="admin-filter-membership"
          >
            <option value="ALL">Todas las membresías</option>
            {MEMBERSHIP_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="wth-btn-secondary"
            data-testid="admin-search-submit-btn"
          >
            Buscar
          </button>
        </form>
      </div>

      {/* Shared W06 History Table / Mobile Cards in Admin Mode */}
      <WithdrawalHistory
        withdrawals={snapshot.items}
        mode="admin"
        isLoading={snapshot.isLoading}
        hasMore={snapshot.hasMore}
        isLoadingMore={snapshot.isLoadingMore}
        onLoadMore={() => void handleLoadMore()}
        onSelectWithdrawal={(w) => void handleSelectWithdrawal(w)}
        networksCatalog={networksCatalog}
        emptyTitle="Sin solicitudes que coincidan con los filtros"
        emptyDescription="Ajusta la pestaña, búsqueda o filtros para consultar otros registros de /withdrawalRequests."
      />

      {/* Shared W06 Details Modal + Admin Balance, Ledger Links & Audit Timeline */}
      <WithdrawalDetailsModal
        withdrawal={detail?.withdrawal ?? null}
        mode="admin"
        isOpen={detail !== null}
        onClose={() => controllerRef.current?.closeDetail()}
        networksCatalog={networksCatalog}
        renderAdminSection={() =>
          detail ? (
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {detail.userBalance && (
                <div data-testid="admin-detail-user-balance">
                  <h5 className="wth-detail-section-title">Balance Privado del Usuario (/userBalances)</h5>
                  <div className="wth-detail-grid wth-tabular-mono">
                    <div className="wth-detail-row">
                      <dt>Disponible / Locked</dt>
                      <dd>
                        {formatMicrosAsUsdt(detail.userBalance.availableBalanceMicros, 2)} /{' '}
                        {formatMicrosAsUsdt(detail.userBalance.lockedBalanceMicros, 2)} {WITHDRAWAL_ASSET}
                      </dd>
                    </div>
                    <div className="wth-detail-row">
                      <dt>Total Retirado Histórico</dt>
                      <dd>
                        {formatMicrosAsUsdt(detail.userBalance.totalWithdrawnMicros, 2)} {WITHDRAWAL_ASSET}
                      </dd>
                    </div>
                  </div>
                </div>
              )}

              <div data-testid="admin-detail-ledger-links">
                <h5 className="wth-detail-section-title">
                  Referencias Ledger ({detail.ledgerEntryIds.length})
                </h5>
                <div className="wth-detail-grid wth-tabular-mono">
                  {detail.ledgerEntryIds.length === 0 ? (
                    <span className="wth-cell-secondary">Sin asientos vinculados aún.</span>
                  ) : (
                    detail.ledgerEntryIds.map((id) => (
                      <div key={id} className="wth-detail-row">
                        <dt>Asiento</dt>
                        <dd>{id}</dd>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div data-testid="admin-detail-audit-timeline">
                <h5 className="wth-detail-section-title">Línea de Auditoría (withdrawalAuditEvents)</h5>
                <div className="wth-detail-grid wth-tabular-mono">
                  {!detail.auditAccessGranted ? (
                    <span className="wth-cell-secondary">
                      Acceso restringido: requiere permiso explícito withdrawals.audit.
                    </span>
                  ) : detail.auditEvents.length === 0 ? (
                    <span className="wth-cell-secondary">Sin eventos de auditoría.</span>
                  ) : (
                    detail.auditEvents.map((ev) => (
                      <div key={ev.id} className="wth-detail-row">
                        <dt>
                          {ev.action} ({ev.newStatus})
                        </dt>
                        <dd>
                          {ev.operatorEmail} · {ev.createdAt}
                        </dd>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <AdminForensicTimelinePanel
                auditAccessGranted={detail.auditAccessGranted}
                auditTimeline={snapshot.selectedAuditTimeline ?? null}
                fallbackAuditEvents={detail.auditEvents}
                fallbackLedgerEntries={detail.ledgerEntries}
                ledgerEntryIds={detail.ledgerEntryIds}
                isLoadingAudit={Boolean(snapshot.isLoadingAudit)}
                onRefreshAudit={() => {
                  void controllerRef.current
                    ?.openAuditTimeline(detail.withdrawal.id)
                    .catch(() => {
                      /* captured in snapshot.error */
                    });
                }}
              />

              {rbac && (
                <div data-testid="admin-detail-rbac-capabilities">
                  <span className="wth-cell-secondary wth-tabular-mono">
                    Capacidades permitidas para este estado (W09):{' '}
                    {rbac.allowedWorkflowActions.length > 0
                      ? rbac.allowedWorkflowActions.join(', ')
                      : 'Solo lectura'}
                  </span>
                  <AdminWithdrawalWorkflowToolbar
                    withdrawal={detail.withdrawal}
                    rbac={rbac}
                    disabled={workflowSubmitting || settlementSubmitting || snapshot.isRefreshing}
                    onSelectAction={(nextAction) => {
                      setWorkflowError(null);
                      setActiveWorkflowAction(nextAction);
                    }}
                  />
                  <AdminWithdrawalSettlementToolbar
                    withdrawal={detail.withdrawal}
                    rbac={rbac}
                    grantedPermissions={session?.permissions ?? []}
                    disabled={workflowSubmitting || settlementSubmitting || snapshot.isRefreshing}
                    onSelectAction={(nextAction) => {
                      setSettlementError(null);
                      setActiveSettlementAction(nextAction);
                    }}
                  />
                </div>
              )}
            </div>
          ) : null
        }
      />

      <AdminWithdrawalWorkflowModal
        withdrawal={detail?.withdrawal ?? null}
        action={activeWorkflowAction}
        isSubmitting={workflowSubmitting}
        errorMessage={workflowError}
        networksCatalog={networksCatalog}
        onClose={() => {
          setWorkflowError(null);
          setActiveWorkflowAction(null);
        }}
        onSubmit={handleSubmitWorkflowModal}
      />

      <AdminWithdrawalSettlementModal
        withdrawal={detail?.withdrawal ?? null}
        action={activeSettlementAction}
        isSubmitting={settlementSubmitting}
        errorMessage={settlementError}
        onClose={() => {
          setSettlementError(null);
          setActiveSettlementAction(null);
        }}
        onSubmit={handleSubmitSettlementModal}
      />
    </section>
  );
}
