/**
 * SCRUM-275 / SCRUM-289 / SCRUM-285 (W10)
 * Immutable Read-Only Forensic Timeline & Ledger Reconciliation Panel (`AdminForensicTimelinePanel.tsx`).
 *
 * - Strictly gated by `withdrawals.audit`: operators with only `withdrawals.read` see an explicit
 *   restricted banner and opaque ledger IDs only (never internal diffs, operator emails, reasons,
 *   or before/after micro-USDT balance snapshots).
 * - Displays unified chronological `AUDIT_EVENT` + `FINANCIAL_LEDGER` events without duplication
 *   or destructive overwrite/delete actions.
 */

import type { ReactElement } from 'react';
import {
  WITHDRAWAL_ASSET,
  formatMicrosAsUsdt,
  type FinancialLedgerEntry,
  type WithdrawalAuditEvent,
} from '../../types/withdrawal.js';
import type { AdminWithdrawalAuditTimelineResponseDto } from '../../services/admin/adminWithdrawalAuditClient.js';

export interface AdminForensicTimelinePanelProps {
  auditAccessGranted: boolean;
  auditTimeline: AdminWithdrawalAuditTimelineResponseDto | null;
  fallbackAuditEvents?: readonly WithdrawalAuditEvent[];
  fallbackLedgerEntries?: readonly FinancialLedgerEntry[];
  ledgerEntryIds?: readonly string[];
  isLoadingAudit?: boolean;
  onRefreshAudit?: () => void;
}

function summarizeValues(values: Record<string, unknown> | undefined): string {
  if (!values) return '';
  const keys = Object.keys(values);
  if (keys.length === 0) return '';
  return keys.map((k) => `${k}=${JSON.stringify(values[k])}`).join(', ');
}

export function AdminForensicTimelinePanel({
  auditAccessGranted,
  auditTimeline,
  fallbackAuditEvents = [],
  fallbackLedgerEntries = [],
  ledgerEntryIds = [],
  isLoadingAudit = false,
  onRefreshAudit,
}: AdminForensicTimelinePanelProps): ReactElement {
  if (!auditAccessGranted) {
    return (
      <div data-testid="admin-forensic-restricted" style={{ marginTop: '8px' }}>
        <h5 className="wth-detail-section-title">
          Trazabilidad Forense y Reconciliación Ledger (W10)
        </h5>
        <div
          className="wth-history-card wth-tabular-mono"
          style={{ fontSize: '12px', borderColor: 'rgba(245,158,11,0.35)' }}
        >
          <span className="wth-cell-secondary" data-testid="admin-forensic-restricted-msg">
            Acceso forense restringido: requiere permiso explícito withdrawals.audit.
          </span>
          <div style={{ marginTop: '6px' }}>
            <span className="wth-cell-secondary">
              Referencias opacas Ledger vinculadas: {ledgerEntryIds.length}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const reconciliation = auditTimeline?.reconciliation ?? null;
  const timeline = auditTimeline?.timeline ?? [];

  return (
    <div
      data-testid="admin-forensic-timeline-panel"
      style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h5 className="wth-detail-section-title" style={{ margin: 0 }}>
          Trazabilidad Forense Ledger + Audit (Inmutable W10)
        </h5>
        {onRefreshAudit && (
          <button
            type="button"
            className="wth-btn-secondary"
            disabled={isLoadingAudit}
            onClick={onRefreshAudit}
            data-testid="admin-forensic-load-btn"
          >
            {isLoadingAudit ? 'Consultando...' : 'Auditar Ledger/Audit'}
          </button>
        )}
      </div>

      {reconciliation && (
        <div
          className="wth-history-card wth-tabular-mono"
          data-testid="admin-forensic-reconciliation"
          style={{
            fontSize: '12px',
            borderColor: reconciliation.isBalanced
              ? 'rgba(52,211,153,0.4)'
              : 'rgba(251,113,133,0.55)',
          }}
        >
          <div className="wth-detail-grid">
            <div className="wth-detail-row">
              <dt>Invariante Contable</dt>
              <dd data-testid="admin-forensic-invariant-status">
                {reconciliation.invariantStatus} ({reconciliation.isBalanced ? 'BALANCED' : 'ANOMALY'})
              </dd>
            </div>
            <div className="wth-detail-row">
              <dt>Asientos LOCK / UNLOCK / WITHDRAWAL</dt>
              <dd>
                {reconciliation.lockCount} / {reconciliation.unlockCount} /{' '}
                {reconciliation.settlementCount}
              </dd>
            </div>
            <div className="wth-detail-row">
              <dt>Delta Bloqueado Neto</dt>
              <dd>
                {formatMicrosAsUsdt(reconciliation.netLockedDeltaMicros, 2)} {WITHDRAWAL_ASSET}
              </dd>
            </div>
            <div className="wth-detail-row">
              <dt>Llaves Deterministas</dt>
              <dd>
                {reconciliation.expectedIds.lockLedgerId} · {reconciliation.expectedIds.unlockLedgerId}
              </dd>
            </div>
          </div>
          {reconciliation.anomalies.length > 0 && (
            <div
              className="wth-history-error-box"
              role="alert"
              data-testid="admin-forensic-anomalies"
              style={{ marginTop: '8px' }}
            >
              {reconciliation.anomalies.join(' | ')}
            </div>
          )}
        </div>
      )}

      {timeline.length > 0 ? (
        <div
          data-testid="admin-forensic-unified-timeline"
          style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          {timeline.map((item) => (
            <div
              key={item.timelineId}
              className="wth-history-card wth-tabular-mono"
              data-testid={`forensic-item-${item.timelineId}`}
              style={{ padding: '8px 10px', fontSize: '11px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <strong style={{ color: item.source === 'FINANCIAL_LEDGER' ? '#6ee7b7' : '#7dd3fc' }}>
                  {item.title}
                </strong>
                <span className="wth-cell-secondary">{item.createdAt}</span>
              </div>
              {item.source === 'AUDIT_EVENT' ? (
                <div style={{ marginTop: '4px', color: '#cbd5e1' }}>
                  <span>
                    Operador: {item.actorEmail} ({item.actorUid})
                  </span>
                  {item.previousStatus && (
                    <span> · Estado: {item.previousStatus} → {item.newStatus}</span>
                  )}
                  {item.reason && <div>Motivo: {item.reason}</div>}
                  {item.previousValues && summarizeValues(item.previousValues) && (
                    <div>Previo: {summarizeValues(item.previousValues)}</div>
                  )}
                  {item.changedValues && summarizeValues(item.changedValues) && (
                    <div>Cambios: {summarizeValues(item.changedValues)}</div>
                  )}
                  {item.linkedLedgerEntryId && (
                    <div className="wth-cell-secondary">
                      Vínculo Ledger: {item.linkedLedgerEntryId}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: '4px', color: '#cbd5e1' }}>
                  <span>
                    Monto: {formatMicrosAsUsdt(item.amountMicros ?? 0, 2)} {WITHDRAWAL_ASSET}
                  </span>
                  <span>
                    {' '}· Disponible: {formatMicrosAsUsdt(item.balanceBeforeMicros ?? 0, 2)} →{' '}
                    {formatMicrosAsUsdt(item.balanceAfterMicros ?? 0, 2)}
                  </span>
                  <span>
                    {' '}· Locked: {formatMicrosAsUsdt(item.lockedBeforeMicros ?? 0, 2)} →{' '}
                    {formatMicrosAsUsdt(item.lockedAfterMicros ?? 0, 2)}
                  </span>
                  <div className="wth-cell-secondary">Idempotency: {item.idempotencyKey}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="wth-cell-secondary wth-tabular-mono" data-testid="admin-forensic-summary-counts">
          Eventos Audit: {fallbackAuditEvents.length} · Asientos Ledger: {fallbackLedgerEntries.length}
        </div>
      )}
    </div>
  );
}
