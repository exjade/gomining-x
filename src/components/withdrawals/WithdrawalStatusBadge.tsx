/**
 * SCRUM-275 / SCRUM-289 / SCRUM-281 (W06)
 * Shared UI: WithdrawalStatusBadge + Canonical Mode & Status Metadata Helpers
 *
 * Byte-identical across Client (`main`) and Admin (`release/pouw-admin-backend`).
 * Consumes exclusively the canonical 8 statuses from W01 (`src/types/withdrawal.ts`).
 */

import { type ReactElement } from 'react';
import {
  WithdrawalModuleError,
  isWithdrawalStatus,
  type WithdrawalStatus,
} from '../../types/withdrawal.ts';

export type WithdrawalUiMode = 'client' | 'admin';

export type WithdrawalStatusTone =
  | 'neutral'
  | 'info'
  | 'accent'
  | 'warning'
  | 'success'
  | 'danger';

export interface WithdrawalStatusDisplayMeta {
  status: WithdrawalStatus;
  label: string;
  shortLabel: string;
  tone: WithdrawalStatusTone;
  description: string;
  isTerminal: boolean;
}

const STATUS_META_MAP: Readonly<Record<WithdrawalStatus, WithdrawalStatusDisplayMeta>> = {
  REQUESTED: {
    status: 'REQUESTED',
    label: 'Solicitado',
    shortLabel: 'Solicitado',
    tone: 'neutral',
    description: 'Fondos bloqueados atómicamente en espera de revisión operativa.',
    isTerminal: false,
  },
  UNDER_REVIEW: {
    status: 'UNDER_REVIEW',
    label: 'En Revisión',
    shortLabel: 'Revisión',
    tone: 'warning',
    description: 'Solicitud tomada por cumplimiento/tesorería para verificación.',
    isTerminal: false,
  },
  APPROVED: {
    status: 'APPROVED',
    label: 'Aprobado',
    shortLabel: 'Aprobado',
    tone: 'info',
    description: 'Aprobado para cola de despacho on-chain.',
    isTerminal: false,
  },
  PROCESSING: {
    status: 'PROCESSING',
    label: 'Procesando',
    shortLabel: 'Procesando',
    tone: 'info',
    description: 'Transacción preparándose para firma y emisión en red.',
    isTerminal: false,
  },
  BROADCASTED: {
    status: 'BROADCASTED',
    label: 'Emitido On-Chain',
    shortLabel: 'Emitido',
    tone: 'accent',
    description: 'Hash de transacción real emitido; esperando confirmaciones.',
    isTerminal: false,
  },
  COMPLETED: {
    status: 'COMPLETED',
    label: 'Completado',
    shortLabel: 'Completado',
    tone: 'success',
    description: 'Liquidación final confirmada en blockchain.',
    isTerminal: true,
  },
  REJECTED: {
    status: 'REJECTED',
    label: 'Rechazado',
    shortLabel: 'Rechazado',
    tone: 'danger',
    description: 'Solicitud rechazada; fondos desbloqueados al saldo disponible.',
    isTerminal: true,
  },
  CANCELLED: {
    status: 'CANCELLED',
    label: 'Cancelado',
    shortLabel: 'Cancelado',
    tone: 'danger',
    description: 'Solicitud cancelada; fondos desbloqueados al saldo disponible.',
    isTerminal: true,
  },
} as const;

export function assertWithdrawalUiMode(mode: unknown): WithdrawalUiMode {
  if (mode === 'client' || mode === 'admin') {
    return mode;
  }
  throw new WithdrawalModuleError({
    originTask: 'W06',
    originModule: 'SHARED_UI',
    code: 'INVALID_WITHDRAWAL_MODE',
    httpStatus: 422,
    message: `Modo de interfaz de retiros inválido: "${String(mode)}". Debe ser 'client' o 'admin'.`,
  });
}

export function getWithdrawalStatusMeta(status: WithdrawalStatus): WithdrawalStatusDisplayMeta {
  if (isWithdrawalStatus(status)) {
    return STATUS_META_MAP[status];
  }
  return {
    status: 'REQUESTED',
    label: String(status),
    shortLabel: String(status),
    tone: 'neutral',
    description: 'Estado de retiro.',
    isTerminal: false,
  };
}

export interface WithdrawalStatusBadgeProps {
  status: WithdrawalStatus;
  compact?: boolean;
  showCode?: boolean;
  className?: string;
}

function StatusGlyph({ tone }: { tone: WithdrawalStatusTone }): ReactElement {
  if (tone === 'success') {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (tone === 'danger') {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    );
  }
  return <span className="wth-status-dot" aria-hidden="true" />;
}

export function WithdrawalStatusBadge({
  status,
  compact = false,
  showCode = false,
  className = '',
}: WithdrawalStatusBadgeProps): ReactElement {
  const meta = getWithdrawalStatusMeta(status);
  const labelText = compact ? meta.shortLabel : meta.label;

  return (
    <span
      className={`wth-status-badge wth-status-badge--${meta.tone}${className ? ` ${className}` : ''}`}
      title={meta.description}
      data-status={meta.status}
      data-testid={`withdrawal-status-badge-${meta.status}`}
    >
      <StatusGlyph tone={meta.tone} />
      <span>{labelText}</span>
      {showCode && <span className="wth-status-code wth-tabular-mono">{meta.status}</span>}
    </span>
  );
}
