/**
 * SCRUM-275 / SCRUM-289 / SCRUM-282 (W07)
 * Client Withdrawal History Panel (`WithdrawalHistoryPanel.tsx`) + Headless Controller
 *
 * Strictly reuses W06 shared UI components (`WithdrawalHistory` + `WithdrawalDetailsModal` in `mode="client"`)
 * connected to W07 backend endpoints (`GET /api/withdrawals/me` & `GET /api/withdrawals/me/:withdrawalId`).
 * Zero duplicated table/card/modal renderers and zero direct Firestore client mutations.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import './withdrawalShared.css';
import {
  WithdrawalModuleError,
  isWithdrawalModuleError,
  type WithdrawalNetworkConfig,
  type WithdrawalRequest,
} from '../../types/withdrawal.ts';
import type { ClientWithdrawalAuthSession } from '../../services/withdrawals/withdrawalAuthGuard.ts';
import type { WithdrawalApiClientOptions } from '../../services/withdrawals/withdrawalConfigQuoteClient.ts';
import {
  DEFAULT_CLIENT_HISTORY_PAGE_SIZE,
  fetchClientWithdrawalDetail,
  fetchClientWithdrawalHistory,
} from '../../services/withdrawals/withdrawalClientHistoryService.ts';
import { WithdrawalHistory } from './WithdrawalHistory.tsx';
import { WithdrawalDetailsModal } from './WithdrawalDetailsModal.tsx';

export interface ClientWithdrawalHistorySnapshot {
  items: WithdrawalRequest[];
  nextCursor: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  isLoadingDetail: boolean;
  selectedWithdrawal: WithdrawalRequest | null;
  error: {
    faultCode: string;
    code: string;
    message: string;
  } | null;
  lastSyncedAt: string | null;
}

export interface CreateClientWithdrawalHistoryControllerOptions {
  session: ClientWithdrawalAuthSession | null | undefined;
  apiOptions?: WithdrawalApiClientOptions;
  pageSize?: number;
  initialItems?: readonly WithdrawalRequest[];
  initialNextCursor?: string | null;
  initialHasMore?: boolean;
  onStateChange?: (snapshot: ClientWithdrawalHistorySnapshot) => void;
}

export interface ClientWithdrawalHistoryController {
  getSnapshot(): ClientWithdrawalHistorySnapshot;
  loadInitial(): Promise<WithdrawalRequest[]>;
  refresh(): Promise<WithdrawalRequest[]>;
  loadMore(): Promise<WithdrawalRequest[]>;
  openDetail(withdrawalId: string): Promise<WithdrawalRequest>;
  closeDetail(): void;
}

function mapHistoryError(err: unknown): {
  faultCode: string;
  code: string;
  message: string;
} {
  if (isWithdrawalModuleError(err)) {
    return {
      faultCode: err.faultCode,
      code: err.code,
      message: err.message.replace(/^\[[^\]]+\]\s*[A-Z0-9_]+:\s*/i, '').trim(),
    };
  }
  const fallback = new WithdrawalModuleError({
    originTask: 'W07',
    originModule: 'HISTORY_UI',
    code: 'HISTORY_FETCH_FAILED',
    httpStatus: 503,
    message: err instanceof Error ? err.message : 'Error al consultar historial.',
  });
  return {
    faultCode: fallback.faultCode,
    code: fallback.code,
    message: fallback.message.replace(/^\[[^\]]+\]\s*[A-Z0-9_]+:\s*/i, '').trim(),
  };
}

function mergeDeduplicatedItems(
  existing: readonly WithdrawalRequest[],
  incoming: readonly WithdrawalRequest[],
): WithdrawalRequest[] {
  const map = new Map<string, WithdrawalRequest>();
  for (const item of existing) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

export function createClientWithdrawalHistoryController(
  options: CreateClientWithdrawalHistoryControllerOptions,
): ClientWithdrawalHistoryController {
  const limit = options.pageSize ?? DEFAULT_CLIENT_HISTORY_PAGE_SIZE;

  let state: ClientWithdrawalHistorySnapshot = {
    items: options.initialItems ? [...options.initialItems] : [],
    nextCursor: options.initialNextCursor ?? null,
    hasMore: options.initialHasMore ?? false,
    isLoading: false,
    isLoadingMore: false,
    isRefreshing: false,
    isLoadingDetail: false,
    selectedWithdrawal: null,
    error: null,
    lastSyncedAt: null,
  };

  const notify = () => {
    options.onStateChange?.({ ...state, items: [...state.items] });
  };

  const updateState = (patch: Partial<ClientWithdrawalHistorySnapshot>) => {
    state = { ...state, ...patch };
    notify();
  };

  const fetchFirstPage = async (mode: 'initial' | 'refresh'): Promise<WithdrawalRequest[]> => {
    updateState(
      mode === 'initial'
        ? { isLoading: true, error: null }
        : { isRefreshing: true, error: null },
    );

    try {
      const response = await fetchClientWithdrawalHistory(
        options.session,
        { limit },
        options.apiOptions,
      );

      const refreshedSelection =
        state.selectedWithdrawal
          ? response.items.find((i) => i.id === state.selectedWithdrawal?.id) ??
            state.selectedWithdrawal
          : null;

      updateState({
        items: response.items,
        nextCursor: response.nextCursor,
        hasMore: response.hasMore,
        isLoading: false,
        isRefreshing: false,
        selectedWithdrawal: refreshedSelection,
        error: null,
        lastSyncedAt: new Date().toISOString(),
      });
      return response.items;
    } catch (err) {
      updateState({
        isLoading: false,
        isRefreshing: false,
        error: mapHistoryError(err),
      });
      throw err;
    }
  };

  return {
    getSnapshot(): ClientWithdrawalHistorySnapshot {
      return { ...state, items: [...state.items] };
    },

    async loadInitial(): Promise<WithdrawalRequest[]> {
      return fetchFirstPage('initial');
    },

    async refresh(): Promise<WithdrawalRequest[]> {
      return fetchFirstPage('refresh');
    },

    async loadMore(): Promise<WithdrawalRequest[]> {
      if (!state.hasMore || !state.nextCursor || state.isLoadingMore) {
        return state.items;
      }

      updateState({ isLoadingMore: true, error: null });
      try {
        const response = await fetchClientWithdrawalHistory(
          options.session,
          { cursor: state.nextCursor, limit },
          options.apiOptions,
        );
        const merged = mergeDeduplicatedItems(state.items, response.items);
        updateState({
          items: merged,
          nextCursor: response.nextCursor,
          hasMore: response.hasMore,
          isLoadingMore: false,
          error: null,
          lastSyncedAt: new Date().toISOString(),
        });
        return merged;
      } catch (err) {
        updateState({
          isLoadingMore: false,
          error: mapHistoryError(err),
        });
        throw err;
      }
    },

    async openDetail(withdrawalId: string): Promise<WithdrawalRequest> {
      updateState({ isLoadingDetail: true, error: null });
      try {
        const response = await fetchClientWithdrawalDetail(
          options.session,
          withdrawalId,
          options.apiOptions,
        );
        const updatedItems = state.items.some((i) => i.id === response.withdrawal.id)
          ? state.items.map((i) =>
              i.id === response.withdrawal.id ? response.withdrawal : i,
            )
          : state.items;

        updateState({
          items: updatedItems,
          isLoadingDetail: false,
          selectedWithdrawal: response.withdrawal,
          error: null,
        });
        return response.withdrawal;
      } catch (err) {
        updateState({
          isLoadingDetail: false,
          error: mapHistoryError(err),
        });
        throw err;
      }
    },

    closeDetail(): void {
      updateState({ selectedWithdrawal: null });
    },
  };
}

export interface WithdrawalHistoryPanelProps {
  session: ClientWithdrawalAuthSession | null | undefined;
  apiOptions?: WithdrawalApiClientOptions;
  networksCatalog?: readonly WithdrawalNetworkConfig[];
  pageSize?: number;
  refreshTrigger?: number;
  pollIntervalMs?: number;
  autoLoad?: boolean;
  initialItems?: readonly WithdrawalRequest[];
  initialNextCursor?: string | null;
  initialHasMore?: boolean;
}

export function WithdrawalHistoryPanel({
  session,
  apiOptions,
  networksCatalog,
  pageSize = DEFAULT_CLIENT_HISTORY_PAGE_SIZE,
  refreshTrigger = 0,
  pollIntervalMs = 0,
  autoLoad = true,
  initialItems,
  initialNextCursor = null,
  initialHasMore = false,
}: WithdrawalHistoryPanelProps): ReactElement {
  const controllerRef = useRef<ClientWithdrawalHistoryController | null>(null);
  const [snapshot, setSnapshot] = useState<ClientWithdrawalHistorySnapshot>(() => {
    const ctrl = createClientWithdrawalHistoryController({
      session,
      apiOptions,
      pageSize,
      initialItems,
      initialNextCursor,
      initialHasMore,
    });
    controllerRef.current = ctrl;
    return ctrl.getSnapshot();
  });

  useEffect(() => {
    const ctrl = createClientWithdrawalHistoryController({
      session,
      apiOptions,
      pageSize,
      initialItems,
      initialNextCursor,
      initialHasMore,
      onStateChange: (next) => setSnapshot(next),
    });
    controllerRef.current = ctrl;
    setSnapshot(ctrl.getSnapshot());

    if (autoLoad && !initialItems && session?.uid && session?.idToken) {
      void ctrl.loadInitial().catch(() => {
        /* captured in snapshot.error */
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.uid, session?.idToken, pageSize]);

  useEffect(() => {
    if (refreshTrigger > 0 && controllerRef.current && session?.uid && session?.idToken) {
      void controllerRef.current.refresh().catch(() => {
        /* captured in snapshot.error */
      });
    }
  }, [refreshTrigger, session?.uid, session?.idToken]);

  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs < 1000 || !session?.uid || !session?.idToken) {
      return;
    }
    const timer = setInterval(() => {
      if (controllerRef.current) {
        void controllerRef.current.refresh().catch(() => {
          /* captured in snapshot.error */
        });
      }
    }, pollIntervalMs);
    return () => clearInterval(timer);
  }, [pollIntervalMs, session?.uid, session?.idToken]);

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

  const handleSelectWithdrawal = useCallback(async (withdrawal: WithdrawalRequest) => {
    if (!controllerRef.current) return;
    try {
      await controllerRef.current.openDetail(withdrawal.id);
    } catch {
      /* captured in snapshot.error */
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    controllerRef.current?.closeDetail();
  }, []);

  return (
    <section
      className="wth-history-panel"
      aria-label="Historial de Retiros USDT"
      data-testid="withdrawal-history-panel"
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 700,
              letterSpacing: '-0.015em',
              color: '#f3f5fa',
            }}
          >
            Historial de Retiros en USDT
          </h3>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '12px',
              color: '#9ba3b8',
            }}
          >
            Consulta tus solicitudes paginadas por orden cronológico descendente con confirmaciones y hash verificable.
          </p>
        </div>

        <button
          type="button"
          className="wth-btn-secondary"
          onClick={() => void handleRefresh()}
          disabled={snapshot.isLoading || snapshot.isRefreshing}
          data-testid="withdrawal-history-refresh-btn"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          </svg>
          {snapshot.isRefreshing ? 'Actualizando...' : 'Actualizar'}
        </button>
      </header>

      <WithdrawalHistory
        withdrawals={snapshot.items}
        mode="client"
        isLoading={snapshot.isLoading}
        errorMessage={snapshot.error?.message ?? null}
        errorFaultCode={snapshot.error?.faultCode ?? null}
        hasMore={snapshot.hasMore}
        isLoadingMore={snapshot.isLoadingMore}
        onLoadMore={() => void handleLoadMore()}
        onSelectWithdrawal={(w) => void handleSelectWithdrawal(w)}
        networksCatalog={networksCatalog}
      />

      <WithdrawalDetailsModal
        withdrawal={snapshot.selectedWithdrawal}
        mode="client"
        isOpen={snapshot.selectedWithdrawal !== null}
        onClose={handleCloseModal}
        networksCatalog={networksCatalog}
      />
    </section>
  );
}
