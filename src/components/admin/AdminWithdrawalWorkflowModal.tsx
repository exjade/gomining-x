/**
 * SCRUM-275 / SCRUM-289 / SCRUM-284 (W09)
 * Audited Admin Workflow Action Modal & Toolbar (`AdminWithdrawalWorkflowModal.tsx`).
 *
 * - Renders only actions permitted by W02 `evaluateAvailableWithdrawalActions` (`REVIEW`, `EDIT`,
 *   `APPROVE`, `PROCESS`, `REJECT`, `CANCEL` — `BROADCAST` & `COMPLETE` deferred to W11).
 * - Requires mandatory reasons on `REJECT`, `CANCEL`, and `EDIT`.
 * - Enforces stage gating in UI as defense-in-depth: `destinationAddress`/`networkId` editable only in
 *   `REQUESTED | UNDER_REVIEW`, while `requestedAmountMicros` & fees remain strictly read-only.
 * - Transmits optimistic `expectedStatus` on every mutation so concurrent conflicts surface clearly.
 */

import { useEffect, useState, type ReactElement } from 'react';
import {
  CANONICAL_USDT_NETWORKS,
  WITHDRAWAL_ASSET,
  formatMicrosAsUsdt,
  type WithdrawalNetworkConfig,
  type WithdrawalRequest,
} from '../../types/withdrawal.js';
import type { AvailableWithdrawalActions } from '../../services/admin/withdrawalRbacService.js';
import type { AdminWorkflowMutationAction } from '../../services/admin/adminWithdrawalWorkflowClient.js';

export type AdminWorkflowModalSubmitPayload =
  | { action: 'REVIEW'; expectedStatus: WithdrawalRequest['status']; reason?: string }
  | {
      action: 'EDIT';
      expectedStatus: WithdrawalRequest['status'];
      destinationAddress?: string;
      networkId?: string;
      internalNotes?: string;
      reason: string;
    }
  | { action: 'APPROVE'; expectedStatus: WithdrawalRequest['status']; reason?: string }
  | {
      action: 'PROCESS';
      expectedStatus: WithdrawalRequest['status'];
      providerTransactionId?: string;
      reason?: string;
    }
  | {
      action: 'REJECT';
      expectedStatus: WithdrawalRequest['status'];
      rejectionReason: string;
    }
  | {
      action: 'CANCEL';
      expectedStatus: WithdrawalRequest['status'];
      cancellationReason: string;
    };

export interface AdminWorkflowToolbarProps {
  withdrawal: WithdrawalRequest;
  rbac: AvailableWithdrawalActions | null;
  disabled?: boolean;
  onSelectAction: (action: AdminWorkflowMutationAction) => void;
}

export function AdminWithdrawalWorkflowToolbar({
  rbac,
  disabled = false,
  onSelectAction,
}: AdminWorkflowToolbarProps): ReactElement {
  if (!rbac) {
    return <span className="wth-cell-secondary">Cargando permisos RBAC...</span>;
  }

  const buttons: Array<{
    action: AdminWorkflowMutationAction;
    label: string;
    allowed: boolean;
    tone: 'neutral' | 'accent' | 'danger';
  }> = [
    { action: 'REVIEW', label: 'Tomar en Revisión', allowed: rbac.canReview, tone: 'neutral' },
    { action: 'EDIT', label: 'Editar Datos', allowed: rbac.canEdit, tone: 'neutral' },
    { action: 'APPROVE', label: 'Aprobar Retiro', allowed: rbac.canApprove, tone: 'accent' },
    { action: 'PROCESS', label: 'Iniciar Proceso', allowed: rbac.canProcess, tone: 'accent' },
    { action: 'REJECT', label: 'Rechazar y Desbloquear', allowed: rbac.canReject, tone: 'danger' },
    { action: 'CANCEL', label: 'Cancelar y Desbloquear', allowed: rbac.canCancel, tone: 'danger' },
  ];

  const visibleButtons = buttons.filter((b) => b.allowed);

  if (visibleButtons.length === 0) {
    return (
      <span
        className="wth-cell-secondary wth-tabular-mono"
        data-testid="admin-workflow-readonly-hint"
      >
        Sin mutaciones W09 habilitadas para este estado/operador.
      </span>
    );
  }

  return (
    <div
      style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}
      data-testid="admin-workflow-toolbar"
    >
      {visibleButtons.map((btn) => (
        <button
          key={btn.action}
          type="button"
          className="wth-btn-secondary"
          disabled={disabled}
          onClick={() => onSelectAction(btn.action)}
          data-testid={`admin-workflow-btn-${btn.action.toLowerCase()}`}
          style={
            btn.tone === 'danger'
              ? { borderColor: 'rgba(251,113,133,0.45)', color: '#fda4af' }
              : btn.tone === 'accent'
                ? { borderColor: 'rgba(52,211,153,0.45)', color: '#6ee7b7' }
                : undefined
          }
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}

export interface AdminWithdrawalWorkflowModalProps {
  withdrawal: WithdrawalRequest | null;
  action: AdminWorkflowMutationAction | null;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  networksCatalog?: readonly WithdrawalNetworkConfig[];
  onClose: () => void;
  onSubmit: (payload: AdminWorkflowModalSubmitPayload) => Promise<void> | void;
}

const ACTION_TITLES: Record<AdminWorkflowMutationAction, string> = {
  REVIEW: 'Tomar Solicitud en Revisión',
  EDIT: 'Editar Solicitud Autorizada (Allowlist W09)',
  APPROVE: 'Aprobar Solicitud de Retiro',
  PROCESS: 'Pasar Retiro a Procesamiento',
  REJECT: 'Rechazar Retiro y Desbloquear Saldo',
  CANCEL: 'Cancelar Retiro y Desbloquear Saldo',
};

export function AdminWithdrawalWorkflowModal({
  withdrawal,
  action,
  isSubmitting = false,
  errorMessage = null,
  networksCatalog = CANONICAL_USDT_NETWORKS,
  onClose,
  onSubmit,
}: AdminWithdrawalWorkflowModalProps): ReactElement | null {
  const [reason, setReason] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [networkId, setNetworkId] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [providerTxId, setProviderTxId] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (withdrawal && action) {
      setReason('');
      setDestinationAddress(withdrawal.destinationAddress);
      setNetworkId(withdrawal.networkId);
      setInternalNotes(withdrawal.internalNotes ?? '');
      setProviderTxId(withdrawal.providerTransactionId ?? '');
      setLocalError(null);
    }
  }, [withdrawal, action]);

  if (!withdrawal || !action) {
    return null;
  }

  const canEditDestinationOrNetwork =
    withdrawal.status === 'REQUESTED' || withdrawal.status === 'UNDER_REVIEW';
  const requiresMandatoryReason =
    action === 'EDIT' || action === 'REJECT' || action === 'CANCEL';
  const isUnlockMutation = action === 'REJECT' || action === 'CANCEL';

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    const trimmedReason = reason.trim();

    if (requiresMandatoryReason && !trimmedReason) {
      setLocalError('El motivo de auditoría es obligatorio para esta acción.');
      return;
    }

    if (action === 'EDIT') {
      await onSubmit({
        action: 'EDIT',
        expectedStatus: withdrawal.status,
        ...(canEditDestinationOrNetwork &&
        destinationAddress.trim() !== withdrawal.destinationAddress
          ? { destinationAddress: destinationAddress.trim() }
          : {}),
        ...(canEditDestinationOrNetwork && networkId !== withdrawal.networkId
          ? { networkId }
          : {}),
        ...(internalNotes !== (withdrawal.internalNotes ?? '')
          ? { internalNotes }
          : {}),
        reason: trimmedReason,
      });
      return;
    }

    if (action === 'REJECT') {
      await onSubmit({
        action: 'REJECT',
        expectedStatus: withdrawal.status,
        rejectionReason: trimmedReason,
      });
      return;
    }

    if (action === 'CANCEL') {
      await onSubmit({
        action: 'CANCEL',
        expectedStatus: withdrawal.status,
        cancellationReason: trimmedReason,
      });
      return;
    }

    if (action === 'PROCESS') {
      await onSubmit({
        action: 'PROCESS',
        expectedStatus: withdrawal.status,
        ...(providerTxId.trim() ? { providerTransactionId: providerTxId.trim() } : {}),
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      });
      return;
    }

    await onSubmit({
      action,
      expectedStatus: withdrawal.status,
      ...(trimmedReason ? { reason: trimmedReason } : {}),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ACTION_TITLES[action]}
      data-testid="admin-workflow-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'rgba(6, 9, 16, 0.78)',
      }}
    >
      <form
        onSubmit={(e) => void handleFormSubmit(e)}
        className="wth-history-card"
        style={{
          width: '100%',
          maxWidth: '520px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          background: '#111624',
          border: '1px solid rgba(255,255,255,0.14)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: '16px', color: '#f3f5fa' }}>
            {ACTION_TITLES[action]}
          </h4>
          <button
            type="button"
            className="wth-btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
            data-testid="admin-workflow-modal-close"
          >
            Cerrar
          </button>
        </div>

        <div className="wth-detail-grid wth-tabular-mono" style={{ fontSize: '12px' }}>
          <div className="wth-detail-row">
            <dt>ID Solicitud</dt>
            <dd>{withdrawal.id}</dd>
          </div>
          <div className="wth-detail-row">
            <dt>Estado Esperado (Lock Optimista)</dt>
            <dd>{withdrawal.status}</dd>
          </div>
          <div className="wth-detail-row">
            <dt>Monto Solicitado (Inmutable)</dt>
            <dd>
              {formatMicrosAsUsdt(withdrawal.requestedAmountMicros, 2)} {WITHDRAWAL_ASSET}
            </dd>
          </div>
        </div>

        {isUnlockMutation && (
          <div
            className="wth-mini-tag"
            data-testid="admin-workflow-unlock-notice"
            style={{
              borderColor: 'rgba(251,113,133,0.45)',
              color: '#fda4af',
              padding: '8px 10px',
            }}
          >
            Desbloqueará atómicamente {formatMicrosAsUsdt(withdrawal.totalDebitMicros, 2)}{' '}
            {WITHDRAWAL_ASSET} de LOCKED a AVAILABLE (asiento WITHDRAWAL_UNLOCK).
          </div>
        )}

        {action === 'APPROVE' && withdrawal.status === 'REQUESTED' && (
          <div
            className="wth-mini-tag"
            data-testid="admin-workflow-fastpath-notice"
            style={{
              borderColor: 'rgba(125,211,252,0.45)',
              color: '#7dd3fc',
              padding: '8px 10px',
            }}
          >
            Fast-path REQUESTED → APPROVED: registrará revisión y aprobación atómicamente.
          </div>
        )}

        {action === 'EDIT' && (
          <>
            {canEditDestinationOrNetwork ? (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                  <span>Red USDT permitida (solo si conserva fees)</span>
                  <select
                    value={networkId}
                    onChange={(e) => setNetworkId(e.target.value)}
                    data-testid="admin-workflow-edit-network"
                  >
                    {networksCatalog
                      .filter((n) => n.enabled)
                      .map((net) => (
                        <option key={net.id} value={net.id}>
                          {net.network} ({net.networkCode})
                        </option>
                      ))}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                  <span>Dirección de destino</span>
                  <input
                    type="text"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    data-testid="admin-workflow-edit-address"
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      background: '#0c101a',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#f3f5fa',
                    }}
                  />
                </label>
              </>
            ) : (
              <span className="wth-cell-secondary" data-testid="admin-workflow-stage-note">
                En estado {withdrawal.status}, red y dirección están bloqueadas; solo se permite editar notas internas.
              </span>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
              <span>Notas internas administrativas</span>
              <textarea
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                data-testid="admin-workflow-edit-notes"
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: '#0c101a',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#f3f5fa',
                }}
              />
            </label>
          </>
        )}

        {action === 'PROCESS' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            <span>Referencia externa de proveedor (opcional)</span>
            <input
              type="text"
              value={providerTxId}
              onChange={(e) => setProviderTxId(e.target.value)}
              placeholder="Ej. fireblocks_batch_001"
              data-testid="admin-workflow-process-provider-id"
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                background: '#0c101a',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#f3f5fa',
              }}
            />
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
          <span>
            Motivo / Nota de Auditoría {requiresMandatoryReason ? '(Obligatorio)' : '(Opcional)'}
          </span>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required={requiresMandatoryReason}
            placeholder="Describe el motivo auditable de esta acción..."
            data-testid="admin-workflow-reason-input"
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              background: '#0c101a',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#f3f5fa',
            }}
          />
        </label>

        {(localError || errorMessage) && (
          <div
            className="wth-history-error-box"
            role="alert"
            data-testid="admin-workflow-modal-error"
          >
            {localError ?? errorMessage}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            className="wth-btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="wth-btn-secondary"
            disabled={isSubmitting}
            data-testid="admin-workflow-modal-submit"
            style={
              isUnlockMutation
                ? { borderColor: 'rgba(251,113,133,0.6)', color: '#fda4af' }
                : { borderColor: 'rgba(52,211,153,0.6)', color: '#6ee7b7' }
            }
          >
            {isSubmitting ? 'Procesando...' : 'Confirmar Acción'}
          </button>
        </div>
      </form>
    </div>
  );
}
