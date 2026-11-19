/**
 * SCRUM-275 / SCRUM-289 / SCRUM-286 (W11)
 * Audited Admin On-Chain Broadcast & Final Settlement Modal + Toolbar (`AdminWithdrawalSettlementModal.tsx`).
 *
 * - Renders `BROADCAST` (`PROCESSING`), `UPDATE_CONFIRMATIONS` (`BROADCASTED`), and
 *   `COMPLETE` (`BROADCASTED`, when confirmations >= requiredConfirmations or pre-validated).
 * - Validates `txHash` family syntax client-side via W01 `validateBlockchainTxHash` as UX guard
 *   while server remains final authority (`W11-SETTLEMENT-422-INVALID_TX_HASH`).
 * - Displays live `confirmations / requiredConfirmations` progress and settlement preview.
 */

import { useEffect, useState, type ReactElement } from 'react';
import {
  WITHDRAWAL_ASSET,
  formatMicrosAsUsdt,
  hasWithdrawalPermission,
  validateBlockchainTxHash,
  type WithdrawalRequest,
} from '../../types/withdrawal.js';
import type { AvailableWithdrawalActions } from '../../services/admin/withdrawalRbacService.js';
import type { AdminSettlementMutationAction } from '../../services/admin/adminWithdrawalSettlementClient.js';

export type AdminSettlementModalSubmitPayload =
  | {
      action: 'BROADCAST';
      expectedStatus: WithdrawalRequest['status'];
      txHash: string;
      confirmations: number;
      providerTransactionId?: string;
    }
  | {
      action: 'UPDATE_CONFIRMATIONS';
      expectedStatus: WithdrawalRequest['status'];
      confirmations: number;
      reason?: string;
    }
  | {
      action: 'COMPLETE';
      expectedStatus: WithdrawalRequest['status'];
      confirmations: number;
      reason?: string;
    };

export interface AdminSettlementToolbarProps {
  withdrawal: WithdrawalRequest;
  rbac: AvailableWithdrawalActions | null;
  grantedPermissions: readonly string[];
  disabled?: boolean;
  onSelectAction: (action: AdminSettlementMutationAction) => void;
}

export function AdminWithdrawalSettlementToolbar({
  withdrawal,
  rbac,
  grantedPermissions,
  disabled = false,
  onSelectAction,
}: AdminSettlementToolbarProps): ReactElement | null {
  if (!rbac) {
    return null;
  }

  const hasBroadcastPermission = hasWithdrawalPermission(
    grantedPermissions,
    'withdrawals.broadcast',
  );
  const canUpdateConfirmations =
    hasBroadcastPermission && withdrawal.status === 'BROADCASTED';
  const currentConfirmations = withdrawal.confirmations ?? 0;

  const buttons: Array<{
    action: AdminSettlementMutationAction;
    label: string;
    allowed: boolean;
    tone: 'accent' | 'neutral';
  }> = [
    {
      action: 'BROADCAST',
      label: 'Transmitir txHash On-Chain',
      allowed: rbac.canBroadcast,
      tone: 'accent',
    },
    {
      action: 'UPDATE_CONFIRMATIONS',
      label: `Actualizar Confirmaciones (${currentConfirmations}/${withdrawal.requiredConfirmations})`,
      allowed: canUpdateConfirmations,
      tone: 'neutral',
    },
    {
      action: 'COMPLETE',
      label: 'Liquidar a COMPLETED',
      allowed: rbac.canComplete,
      tone: 'accent',
    },
  ];

  const visibleButtons = buttons.filter((b) => b.allowed);
  if (visibleButtons.length === 0 && withdrawal.status !== 'BROADCASTED') {
    return null;
  }

  return (
    <div
      style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', alignItems: 'center' }}
      data-testid="admin-settlement-toolbar"
    >
      {visibleButtons.map((btn) => (
        <button
          key={btn.action}
          type="button"
          className="wth-btn-secondary"
          disabled={disabled}
          onClick={() => onSelectAction(btn.action)}
          data-testid={`admin-settlement-btn-${btn.action.toLowerCase()}`}
          style={
            btn.tone === 'accent'
              ? { borderColor: 'rgba(52,211,153,0.45)', color: '#6ee7b7' }
              : { borderColor: 'rgba(125,211,252,0.45)', color: '#7dd3fc' }
          }
        >
          {btn.label}
        </button>
      ))}
      {withdrawal.status === 'BROADCASTED' && !rbac.canComplete && hasBroadcastPermission && (
        <span
          className="wth-cell-secondary wth-tabular-mono"
          data-testid="admin-settlement-confirmations-hint"
        >
          Confirmaciones on-chain: {currentConfirmations}/{withdrawal.requiredConfirmations} requeridas para liquidar.
        </span>
      )}
    </div>
  );
}

export interface AdminWithdrawalSettlementModalProps {
  withdrawal: WithdrawalRequest | null;
  action: AdminSettlementMutationAction | null;
  isSubmitting: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (payload: AdminSettlementModalSubmitPayload) => Promise<void> | void;
}

export function AdminWithdrawalSettlementModal({
  withdrawal,
  action,
  isSubmitting,
  errorMessage = null,
  onClose,
  onSubmit,
}: AdminWithdrawalSettlementModalProps): ReactElement | null {
  const [txHash, setTxHash] = useState('');
  const [confirmationsInput, setConfirmationsInput] = useState('0');
  const [providerTxId, setProviderTxId] = useState('');
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!withdrawal || !action) return;
    setTxHash(withdrawal.txHash ?? '');
    if (action === 'BROADCAST') {
      setConfirmationsInput('0');
    } else if (action === 'UPDATE_CONFIRMATIONS') {
      setConfirmationsInput(String(withdrawal.confirmations ?? 0));
    } else {
      setConfirmationsInput(
        String(Math.max(withdrawal.confirmations ?? 0, withdrawal.requiredConfirmations)),
      );
    }
    setProviderTxId(withdrawal.providerTransactionId ?? '');
    setReason('');
    setLocalError(null);
  }, [withdrawal?.id, action, withdrawal?.confirmations]);

  if (!withdrawal || !action) {
    return null;
  }

  const txPreview =
    action === 'BROADCAST' && txHash.trim()
      ? validateBlockchainTxHash(txHash, withdrawal.addressType)
      : null;

  const titleByAction: Record<AdminSettlementMutationAction, string> = {
    BROADCAST: 'Registrar Broadcast On-Chain (txHash real)',
    UPDATE_CONFIRMATIONS: 'Actualizar Confirmaciones On-Chain',
    COMPLETE: 'Liquidar Retiro Atómicamente a COMPLETED',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const parsedConfirmations = Number(confirmationsInput.trim());
    if (!Number.isSafeInteger(parsedConfirmations) || parsedConfirmations < 0) {
      setLocalError('Las confirmaciones deben ser un entero seguro >= 0.');
      return;
    }

    if (action === 'BROADCAST') {
      const check = validateBlockchainTxHash(txHash, withdrawal.addressType);
      if (!check.valid) {
        setLocalError(check.reason || 'txHash inválido para la red seleccionada.');
        return;
      }
      await onSubmit({
        action: 'BROADCAST',
        expectedStatus: withdrawal.status,
        txHash: check.normalizedTxHash,
        confirmations: parsedConfirmations,
        ...(providerTxId.trim() ? { providerTransactionId: providerTxId.trim() } : {}),
      });
      return;
    }

    if (action === 'UPDATE_CONFIRMATIONS') {
      await onSubmit({
        action: 'UPDATE_CONFIRMATIONS',
        expectedStatus: withdrawal.status,
        confirmations: parsedConfirmations,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      return;
    }

    if (parsedConfirmations < withdrawal.requiredConfirmations) {
      setLocalError(
        `Se requieren al menos ${withdrawal.requiredConfirmations} confirmaciones para liquidar a COMPLETED.`,
      );
      return;
    }

    await onSubmit({
      action: 'COMPLETE',
      expectedStatus: withdrawal.status,
      confirmations: parsedConfirmations,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
  };

  return (
    <div
      className="wth-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={titleByAction[action]}
      data-testid="admin-settlement-modal"
    >
      <form
        className="wth-modal-card"
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
      >
        <div className="wth-modal-header">
          <div>
            <h4 style={{ margin: 0, fontSize: '16px', color: '#f3f5fa' }}>
              {titleByAction[action]}
            </h4>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--wth-text-muted)' }}>
              W11 Settlement · Permiso: withdrawals.broadcast · Red: {withdrawal.networkDisplayName} ({withdrawal.addressType})
            </p>
          </div>
          <button
            type="button"
            className="wth-btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
            data-testid="admin-settlement-modal-close"
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
            <dt>Monto Neto / Débito Locked</dt>
            <dd>
              {formatMicrosAsUsdt(withdrawal.netAmountMicros, 2)} /{' '}
              {formatMicrosAsUsdt(withdrawal.totalDebitMicros, 2)} {WITHDRAWAL_ASSET}
            </dd>
          </div>
          <div className="wth-detail-row">
            <dt>Confirmaciones Actuales / Requeridas</dt>
            <dd>
              {withdrawal.confirmations ?? 0} / {withdrawal.requiredConfirmations}
            </dd>
          </div>
        </div>

        {action === 'BROADCAST' && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
              <span>Transaction Hash Real ({withdrawal.addressType}) *</span>
              <input
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                required
                placeholder={
                  withdrawal.addressType === 'EVM'
                    ? '0x...'
                    : withdrawal.addressType === 'TRON'
                      ? '64 caracteres hexadecimales...'
                      : 'Firma Base58 Solana...'
                }
                data-testid="admin-settlement-txhash-input"
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: '#0c101a',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#f3f5fa',
                  fontFamily: 'monospace',
                }}
              />
              {txPreview && !txPreview.valid && (
                <span style={{ color: '#fda4af', fontSize: '11px' }}>{txPreview.reason}</span>
              )}
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
              <span>Referencia externa de proveedor (opcional)</span>
              <input
                type="text"
                value={providerTxId}
                onChange={(e) => setProviderTxId(e.target.value)}
                placeholder="Ej. fireblocks_tx_901"
                data-testid="admin-settlement-provider-input"
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

        {action === 'COMPLETE' && (
          <div
            className="wth-mini-tag"
            data-testid="admin-settlement-ledger-notice"
            style={{
              borderColor: 'rgba(52,211,153,0.45)',
              color: '#6ee7b7',
              padding: '8px 10px',
            }}
          >
            Liquidará LOCKED (-{formatMicrosAsUsdt(withdrawal.totalDebitMicros, 2)} {WITHDRAWAL_ASSET}), sumará +{formatMicrosAsUsdt(withdrawal.requestedAmountMicros, 2)} {WITHDRAWAL_ASSET} a totalWithdrawn y creará asiento {withdrawal.id}__SETTLEMENT.
          </div>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
          <span>Confirmaciones On-Chain Observadas</span>
          <input
            type="number"
            min={0}
            step={1}
            value={confirmationsInput}
            onChange={(e) => setConfirmationsInput(e.target.value)}
            required
            data-testid="admin-settlement-confirmations-input"
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              background: '#0c101a',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#f3f5fa',
            }}
          />
        </label>

        {action !== 'BROADCAST' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            <span>Nota de Auditoría (Opcional)</span>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Verificado en explorador con finality alcanzada..."
              data-testid="admin-settlement-reason-input"
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

        {(localError || errorMessage) && (
          <div
            className="wth-history-error-box"
            role="alert"
            data-testid="admin-settlement-modal-error"
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
            data-testid="admin-settlement-modal-submit"
            style={{ borderColor: 'rgba(52,211,153,0.6)', color: '#6ee7b7' }}
          >
            {isSubmitting ? 'Procesando...' : 'Confirmar Operación W11'}
          </button>
        </div>
      </form>
    </div>
  );
}
