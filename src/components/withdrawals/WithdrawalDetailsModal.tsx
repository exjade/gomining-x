/**
 * SCRUM-275 / SCRUM-289 / SCRUM-281 (W06)
 * Shared UI: WithdrawalDetailsModal (Client & Admin Detail Inspector)
 *
 * Preserves strict data separation via `mode: 'client' | 'admin'`:
 * - `client` mode renders only user-safe fields (amounts, fees, network, address, txHash, confirmations, SLA, rejection/cancellation reason, timestamps).
 * - `admin` mode additionally renders authorized operational metadata (`userId`, `userEmail`, `idempotencyKey`, `configVersion`, `internalNotes`, `providerTransactionId`, operator UIDs) and optional `renderAdminSection` / `renderActions` slots for W09/W10.
 *
 * Byte-identical across Client (`main`) and Admin (`release/pouw-admin-backend`).
 */

import { useEffect, useId, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  WITHDRAWAL_ASSET,
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

export interface WithdrawalDetailsModalProps {
  withdrawal: WithdrawalRequest | null;
  mode: WithdrawalUiMode;
  isOpen: boolean;
  onClose: () => void;
  networksCatalog?: readonly WithdrawalNetworkConfig[];
  onCopyAddress?: (address: string) => Promise<void> | void;
  onCopyTxHash?: (txHash: string) => Promise<void> | void;
  renderAdminSection?: (withdrawal: WithdrawalRequest) => ReactNode;
  renderActions?: (withdrawal: WithdrawalRequest) => ReactNode;
}

function formatIsoTimestamp(iso?: string): string {
  if (!iso || typeof iso !== 'string') {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function WithdrawalDetailsModal({
  withdrawal,
  mode,
  isOpen,
  onClose,
  networksCatalog,
  onCopyAddress,
  onCopyTxHash,
  renderAdminSection,
  renderActions,
}: WithdrawalDetailsModalProps): ReactElement | null {
  const safeMode = assertWithdrawalUiMode(mode);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    globalThis.addEventListener?.('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener?.('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !withdrawal) {
    return null;
  }

  const totalFeesMicros =
    withdrawal.networkFeeMicros +
    withdrawal.platformFeeMicros +
    withdrawal.conversionFeeMicros;
  const networkConfig = networksCatalog?.find((n) => n.id === withdrawal.networkId) ?? null;

  const modalContent = (
    <div
      className="wth-modal-backdrop"
      role="presentation"
      onClick={onClose}
      data-testid="withdrawal-details-backdrop"
    >
      <section
        className="wth-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        data-mode={safeMode}
        data-testid="withdrawal-details-modal"
      >
        <header className="wth-modal-header">
          <div className="wth-modal-heading">
            <div className="wth-modal-kicker-row">
              <span className="wth-mini-tag wth-mini-tag--emerald wth-tabular-mono">{WITHDRAWAL_ASSET}</span>
              <WithdrawalStatusBadge status={withdrawal.status} showCode={safeMode === 'admin'} />
            </div>
            <h3 id={titleId} className="wth-modal-title wth-tabular-mono">
              Retiro {withdrawal.id}
            </h3>
            <p className="wth-modal-subtitle">
              {withdrawal.networkDisplayName} · SLA: {withdrawal.slaDisplaySnapshot}
            </p>
          </div>

          <button
            type="button"
            className="wth-modal-close-btn"
            onClick={onClose}
            aria-label="Cerrar detalle de retiro"
            data-testid="withdrawal-details-close-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="wth-modal-body">
          {/* Financial Breakdown */}
          <div className="wth-detail-section">
            <h4 className="wth-detail-section-title">Desglose Financiero (Micro-USDT)</h4>
            <dl className="wth-detail-grid">
              <div className="wth-detail-row">
                <dt>Monto solicitado</dt>
                <dd className="wth-tabular-mono">
                  {formatMicrosAsUsdt(withdrawal.requestedAmountMicros, 2)} {withdrawal.asset}
                </dd>
              </div>
              <div className="wth-detail-row">
                <dt>Comisión de red ({withdrawal.network})</dt>
                <dd className="wth-tabular-mono">
                  {formatMicrosAsUsdt(withdrawal.networkFeeMicros, 2)} {withdrawal.asset}
                </dd>
              </div>
              <div className="wth-detail-row">
                <dt>Comisión plataforma</dt>
                <dd className="wth-tabular-mono">
                  {formatMicrosAsUsdt(withdrawal.platformFeeMicros, 2)} {withdrawal.asset}
                </dd>
              </div>
              <div className="wth-detail-row">
                <dt>Comisión conversión</dt>
                <dd className="wth-tabular-mono">
                  {formatMicrosAsUsdt(withdrawal.conversionFeeMicros, 2)} {withdrawal.asset}
                </dd>
              </div>
              <div className="wth-detail-row">
                <dt>Total comisiones</dt>
                <dd className="wth-tabular-mono">
                  {formatMicrosAsUsdt(totalFeesMicros, 2)} {withdrawal.asset}
                </dd>
              </div>
              <div className="wth-detail-row">
                <dt>Total debitado (Available → Locked)</dt>
                <dd className="wth-tabular-mono">
                  {formatMicrosAsUsdt(withdrawal.totalDebitMicros, 2)} {withdrawal.asset}
                </dd>
              </div>
              <div className="wth-detail-row wth-detail-row--highlight">
                <dt>Neto a recibir en destino</dt>
                <dd className="wth-tabular-mono wth-text-accent">
                  {formatMicrosAsUsdt(withdrawal.netAmountMicros, 2)} {withdrawal.asset}
                </dd>
              </div>
            </dl>
          </div>

          {/* On-chain Routing & Settlement */}
          <div className="wth-detail-section">
            <h4 className="wth-detail-section-title">Enrutamiento On-Chain y Liquidación</h4>
            <dl className="wth-detail-grid">
              <div className="wth-detail-row">
                <dt>Red / Estándar</dt>
                <dd>{withdrawal.networkDisplayName}</dd>
              </div>
              <div className="wth-detail-row">
                <dt>Billetera destino</dt>
                <dd>
                  <WithdrawalAddress
                    address={withdrawal.destinationAddress}
                    addressType={withdrawal.addressType}
                    truncate={false}
                    showTypeTag
                    onCopy={onCopyAddress}
                  />
                </dd>
              </div>
              <div className="wth-detail-row">
                <dt>Hash de transacción (txHash)</dt>
                <dd>
                  <WithdrawalTxHash
                    txHash={withdrawal.txHash}
                    networkId={withdrawal.networkId}
                    addressType={withdrawal.addressType}
                    networkConfig={networkConfig}
                    networksCatalog={networksCatalog}
                    truncate={false}
                    onCopy={onCopyTxHash}
                  />
                </dd>
              </div>
              <div className="wth-detail-row">
                <dt>Confirmaciones</dt>
                <dd className="wth-tabular-mono">
                  {withdrawal.confirmations} / {withdrawal.requiredConfirmations}
                </dd>
              </div>
              <div className="wth-detail-row">
                <dt>Solicitado el</dt>
                <dd className="wth-tabular-mono">{formatIsoTimestamp(withdrawal.requestedAt)}</dd>
              </div>
              {withdrawal.broadcastedAt && (
                <div className="wth-detail-row">
                  <dt>Emitido el</dt>
                  <dd className="wth-tabular-mono">{formatIsoTimestamp(withdrawal.broadcastedAt)}</dd>
                </div>
              )}
              {withdrawal.completedAt && (
                <div className="wth-detail-row">
                  <dt>Liquidado el</dt>
                  <dd className="wth-tabular-mono">{formatIsoTimestamp(withdrawal.completedAt)}</dd>
                </div>
              )}
              {(withdrawal.rejectionReason || withdrawal.cancellationReason) && (
                <div className="wth-detail-row wth-detail-row--danger">
                  <dt>{withdrawal.rejectionReason ? 'Motivo de rechazo' : 'Motivo de cancelación'}</dt>
                  <dd>{withdrawal.rejectionReason ?? withdrawal.cancellationReason}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Admin-only Authorized Operational Metadata */}
          {safeMode === 'admin' && (
            <div className="wth-detail-section" data-testid="withdrawal-details-admin-metadata">
              <h4 className="wth-detail-section-title">Metadatos Operativos (Admin)</h4>
              <dl className="wth-detail-grid">
                <div className="wth-detail-row">
                  <dt>Usuario (UID / Email)</dt>
                  <dd className="wth-tabular-mono">
                    {withdrawal.userId} · {withdrawal.userEmail}
                  </dd>
                </div>
                <div className="wth-detail-row">
                  <dt>Membresía / Config v.</dt>
                  <dd className="wth-tabular-mono">
                    {withdrawal.membershipTierSnapshot} · v{withdrawal.configVersion}
                  </dd>
                </div>
                <div className="wth-detail-row">
                  <dt>Clave de idempotencia</dt>
                  <dd className="wth-tabular-mono">{withdrawal.idempotencyKey}</dd>
                </div>
                {withdrawal.providerTransactionId && (
                  <div className="wth-detail-row">
                    <dt>ID proveedor</dt>
                    <dd className="wth-tabular-mono">{withdrawal.providerTransactionId}</dd>
                  </div>
                )}
                {withdrawal.internalNotes && (
                  <div className="wth-detail-row">
                    <dt>Notas internas</dt>
                    <dd>{withdrawal.internalNotes}</dd>
                  </div>
                )}
                {(withdrawal.reviewedBy ||
                  withdrawal.approvedBy ||
                  withdrawal.processedBy ||
                  withdrawal.broadcastedBy ||
                  withdrawal.completedBy ||
                  withdrawal.rejectedBy ||
                  withdrawal.cancelledBy) && (
                  <div className="wth-detail-row">
                    <dt>Trazabilidad operadores</dt>
                    <dd className="wth-tabular-mono">
                      {[
                        withdrawal.reviewedBy ? `Rev:${withdrawal.reviewedBy}` : null,
                        withdrawal.approvedBy ? `Apr:${withdrawal.approvedBy}` : null,
                        withdrawal.processedBy ? `Proc:${withdrawal.processedBy}` : null,
                        withdrawal.broadcastedBy ? `Bcast:${withdrawal.broadcastedBy}` : null,
                        withdrawal.completedBy ? `Comp:${withdrawal.completedBy}` : null,
                        withdrawal.rejectedBy ? `Rej:${withdrawal.rejectedBy}` : null,
                        withdrawal.cancelledBy ? `Canc:${withdrawal.cancelledBy}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </dd>
                  </div>
                )}
              </dl>
              {renderAdminSection?.(withdrawal)}
            </div>
          )}
        </div>

        <footer className="wth-modal-footer">
          <div className="wth-modal-actions-slot">
            {renderActions?.(withdrawal)}
          </div>
          <button
            type="button"
            className="wth-btn-secondary"
            onClick={onClose}
            data-testid="withdrawal-details-footer-close-btn"
          >
            Cerrar
          </button>
        </footer>
      </section>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
