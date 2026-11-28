/**
 * SCRUM-275 / SCRUM-289 / SCRUM-281 (W06)
 * Shared UI: WithdrawalHistory, WithdrawalTable & WithdrawalCards
 *
 * Single data adapter (`buildWithdrawalHistoryRows`) feeding both responsive layouts:
 * - `WithdrawalTable` (desktop table view)
 * - `WithdrawalCards` (mobile card view)
 * Zero duplicate state/fee/address/txHash formatting logic.
 * Zero network fetches and zero Admin mutation buttons (those belong to W07/W08/W09).
 *
 * Byte-identical across Client (`main`) and Admin (`release/pouw-admin-backend`).
 */

import { type ReactElement, type ReactNode } from 'react';
import {
  formatMicrosAsUsdt,
  type WithdrawalNetworkConfig,
  type WithdrawalRequest,
} from '../../types/withdrawal.ts';
import {
  WithdrawalStatusBadge,
  assertWithdrawalUiMode,
  type WithdrawalUiMode,
} from './WithdrawalStatusBadge.tsx';
import { WithdrawalAddress } from './WithdrawalAddress.tsx';
import { WithdrawalTxHash } from './WithdrawalTxHash.tsx';

export interface WithdrawalHistoryRowModel {
  id: string;
  withdrawal: WithdrawalRequest;
  requestedAtFormatted: string;
  networkLabel: string;
  requestedUsdt: string;
  totalFeesUsdt: string;
  netUsdt: string;
  totalDebitUsdt: string;
  confirmationsLabel: string;
  userDisplayLabel: string;
}

function formatRowDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

/**
 * Shared pure mapper converting `WithdrawalRequest[]` into normalized row models
 * consumed identically by `WithdrawalTable` (desktop) and `WithdrawalCards` (mobile).
 */
export function buildWithdrawalHistoryRows(
  withdrawals: readonly WithdrawalRequest[],
): WithdrawalHistoryRowModel[] {
  return withdrawals.map((item) => {
    const totalFeesMicros =
      item.networkFeeMicros + item.platformFeeMicros + item.conversionFeeMicros;
    return {
      id: item.id,
      withdrawal: item,
      requestedAtFormatted: formatRowDate(item.requestedAt),
      networkLabel: item.networkDisplayName || item.network,
      requestedUsdt: formatMicrosAsUsdt(item.requestedAmountMicros, 2),
      totalFeesUsdt: formatMicrosAsUsdt(totalFeesMicros, 2),
      netUsdt: formatMicrosAsUsdt(item.netAmountMicros, 2),
      totalDebitUsdt: formatMicrosAsUsdt(item.totalDebitMicros, 2),
      confirmationsLabel: `${item.confirmations}/${item.requiredConfirmations}`,
      userDisplayLabel: item.userEmail || item.userId,
    };
  });
}

export interface WithdrawalHistoryProps {
  withdrawals: readonly WithdrawalRequest[];
  mode: WithdrawalUiMode;
  isLoading?: boolean;
  errorMessage?: string | null;
  errorFaultCode?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onSelectWithdrawal?: (withdrawal: WithdrawalRequest) => void;
  onCopyAddress?: (address: string) => Promise<void> | void;
  onCopyTxHash?: (txHash: string) => Promise<void> | void;
  networksCatalog?: readonly WithdrawalNetworkConfig[];
  renderActions?: (withdrawal: WithdrawalRequest) => ReactNode;
  className?: string;
}

export interface WithdrawalLayoutProps {
  rows: readonly WithdrawalHistoryRowModel[];
  mode: WithdrawalUiMode;
  networksCatalog?: readonly WithdrawalNetworkConfig[];
  onSelectWithdrawal?: (withdrawal: WithdrawalRequest) => void;
  onCopyAddress?: (address: string) => Promise<void> | void;
  onCopyTxHash?: (txHash: string) => Promise<void> | void;
  renderActions?: (withdrawal: WithdrawalRequest) => ReactNode;
}

export function WithdrawalTable({
  rows,
  mode,
  networksCatalog,
  onSelectWithdrawal,
  onCopyAddress,
  onCopyTxHash,
  renderActions,
}: WithdrawalLayoutProps): ReactElement {
  const safeMode = assertWithdrawalUiMode(mode);

  return (
    <div className="wth-table-scroll" data-testid="withdrawal-table-container">
      <table className="wth-history-table" data-mode={safeMode} data-testid="withdrawal-table">
        <thead>
          <tr>
            <th>Fecha / ID</th>
            {safeMode === 'admin' && <th>Usuario</th>}
            <th>Red</th>
            <th>Billetera Destino</th>
            <th className="wth-col-numeric">Solicitado</th>
            <th className="wth-col-numeric">Fees</th>
            <th className="wth-col-numeric">Neto</th>
            <th>Estado</th>
            <th>txHash / Explorer</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const w = row.withdrawal;
            const netCfg = networksCatalog?.find((n) => n.id === w.networkId) ?? null;
            return (
              <tr key={row.id} className="wth-table-row" data-testid={`withdrawal-table-row-${row.id}`}>
                <td>
                  <div className="wth-cell-stack">
                    <span className="wth-tabular-mono wth-cell-primary">
                      {row.requestedAtFormatted}
                    </span>
                    <span className="wth-tabular-mono wth-cell-secondary">{w.id}</span>
                  </div>
                </td>

                {safeMode === 'admin' && (
                  <td>
                    <div className="wth-cell-stack">
                      <span className="wth-cell-primary">{row.userDisplayLabel}</span>
                      <span className="wth-tabular-mono wth-cell-secondary">
                        {w.membershipTierSnapshot}
                      </span>
                    </div>
                  </td>
                )}

                <td>
                  <div className="wth-cell-stack">
                    <span className="wth-network-tag wth-tabular-mono">{w.network}</span>
                    <span className="wth-tabular-mono wth-cell-secondary">
                      {row.confirmationsLabel} conf.
                    </span>
                  </div>
                </td>

                <td>
                  <WithdrawalAddress
                    address={w.destinationAddress}
                    addressType={w.addressType}
                    onCopy={onCopyAddress}
                  />
                </td>

                <td className="wth-col-numeric wth-tabular-mono">
                  {row.requestedUsdt} {w.asset}
                </td>

                <td className="wth-col-numeric wth-tabular-mono wth-cell-secondary">
                  {row.totalFeesUsdt} {w.asset}
                </td>

                <td className="wth-col-numeric wth-tabular-mono wth-text-accent">
                  {row.netUsdt} {w.asset}
                </td>

                <td>
                  <WithdrawalStatusBadge status={w.status} />
                </td>

                <td>
                  <WithdrawalTxHash
                    txHash={w.txHash}
                    networkId={w.networkId}
                    addressType={w.addressType}
                    networkConfig={netCfg}
                    networksCatalog={networksCatalog}
                    onCopy={onCopyTxHash}
                  />
                </td>

                <td>
                  <div className="wth-row-actions">
                    {onSelectWithdrawal && (
                      <button
                        type="button"
                        className="wth-btn-detail"
                        onClick={() => onSelectWithdrawal(w)}
                        data-testid={`withdrawal-detail-btn-${row.id}`}
                      >
                        <span>Detalle</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </button>
                    )}
                    {renderActions?.(w)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function WithdrawalCards({
  rows,
  mode,
  networksCatalog,
  onSelectWithdrawal,
  onCopyAddress,
  onCopyTxHash,
  renderActions,
}: WithdrawalLayoutProps): ReactElement {
  const safeMode = assertWithdrawalUiMode(mode);

  return (
    <div className="wth-cards-list" data-mode={safeMode} data-testid="withdrawal-cards">
      {rows.map((row) => {
        const w = row.withdrawal;
        const netCfg = networksCatalog?.find((n) => n.id === w.networkId) ?? null;

        return (
          <article
            key={row.id}
            className="wth-history-card"
            data-testid={`withdrawal-card-${row.id}`}
          >
            <div className="wth-card-top">
              <div className="wth-cell-stack">
                <span className="wth-tabular-mono wth-cell-secondary">
                  {row.requestedAtFormatted} · {w.id}
                </span>
                <strong className="wth-tabular-mono wth-card-amount">
                  {row.netUsdt} {w.asset}
                  <span className="wth-card-network"> · {w.network}</span>
                </strong>
              </div>
              <WithdrawalStatusBadge status={w.status} compact />
            </div>

            {safeMode === 'admin' && (
              <div className="wth-card-meta-row">
                <span className="wth-cell-secondary">Usuario</span>
                <span className="wth-tabular-mono">{row.userDisplayLabel}</span>
              </div>
            )}

            <div className="wth-card-meta-row">
              <span className="wth-cell-secondary">Destino</span>
              <WithdrawalAddress
                address={w.destinationAddress}
                addressType={w.addressType}
                onCopy={onCopyAddress}
              />
            </div>

            <div className="wth-card-meta-row">
              <span className="wth-cell-secondary">Solicitado / Fees</span>
              <span className="wth-tabular-mono">
                {row.requestedUsdt} / {row.totalFeesUsdt} {w.asset}
              </span>
            </div>

            <div className="wth-card-meta-row">
              <span className="wth-cell-secondary">txHash</span>
              <WithdrawalTxHash
                txHash={w.txHash}
                networkId={w.networkId}
                addressType={w.addressType}
                networkConfig={netCfg}
                networksCatalog={networksCatalog}
                onCopy={onCopyTxHash}
              />
            </div>

            <div className="wth-card-actions">
              {onSelectWithdrawal && (
                <button
                  type="button"
                  className="wth-btn-detail"
                  onClick={() => onSelectWithdrawal(w)}
                  data-testid={`withdrawal-card-detail-btn-${row.id}`}
                >
                  Ver detalle
                </button>
              )}
              {renderActions?.(w)}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function WithdrawalHistory({
  withdrawals,
  mode,
  isLoading = false,
  errorMessage = null,
  errorFaultCode = null,
  emptyTitle = 'Sin solicitudes de retiro registradas',
  emptyDescription = 'Cuando envíes un retiro en USDT aparecerá aquí con su estado, comisiones y enlace de verificación en blockchain.',
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onSelectWithdrawal,
  onCopyAddress,
  onCopyTxHash,
  networksCatalog,
  renderActions,
  className = '',
}: WithdrawalHistoryProps): ReactElement {
  const safeMode = assertWithdrawalUiMode(mode);
  const rows = buildWithdrawalHistoryRows(withdrawals);

  if (isLoading && rows.length === 0) {
    return (
      <section
        className={`wth-history-shell${className ? ` ${className}` : ''}`}
        aria-busy="true"
        data-testid="withdrawal-history-loading"
      >
        <div className="wth-skeleton-row" />
        <div className="wth-skeleton-row" />
        <div className="wth-skeleton-row" />
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section
        className={`wth-history-shell${className ? ` ${className}` : ''}`}
        role="alert"
        data-testid="withdrawal-history-error"
      >
        <div className="wth-history-error-box">
          {errorFaultCode && (
            <span className="wth-mini-tag wth-tabular-mono" data-testid="withdrawal-history-fault-code">
              {errorFaultCode}
            </span>
          )}
          <span>{errorMessage}</span>
        </div>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section
        className={`wth-history-shell${className ? ` ${className}` : ''}`}
        data-testid="withdrawal-history-empty"
      >
        <div className="wth-empty-state">
          <div className="wth-empty-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 10h18M7 15h4" />
            </svg>
          </div>
          <h4 className="wth-empty-title">{emptyTitle}</h4>
          <p className="wth-empty-desc">{emptyDescription}</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`wth-history-shell${className ? ` ${className}` : ''}`}
      data-mode={safeMode}
      data-testid="withdrawal-history-shell"
    >
      <div className="wth-desktop-only">
        <WithdrawalTable
          rows={rows}
          mode={safeMode}
          networksCatalog={networksCatalog}
          onSelectWithdrawal={onSelectWithdrawal}
          onCopyAddress={onCopyAddress}
          onCopyTxHash={onCopyTxHash}
          renderActions={renderActions}
        />
      </div>

      <div className="wth-mobile-only">
        <WithdrawalCards
          rows={rows}
          mode={safeMode}
          networksCatalog={networksCatalog}
          onSelectWithdrawal={onSelectWithdrawal}
          onCopyAddress={onCopyAddress}
          onCopyTxHash={onCopyTxHash}
          renderActions={renderActions}
        />
      </div>

      {hasMore && onLoadMore && (
        <div className="wth-pagination-bar">
          <button
            type="button"
            className="wth-btn-secondary"
            disabled={isLoadingMore}
            onClick={onLoadMore}
            data-testid="withdrawal-history-load-more-btn"
          >
            {isLoadingMore ? 'Cargando más retiros...' : 'Cargar más registros'}
          </button>
        </div>
      )}
    </section>
  );
}
