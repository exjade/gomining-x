/**
 * SCRUM-275 / SCRUM-289 / SCRUM-281 (W06)
 * Shared UI: WithdrawalAddress (Monospace Address Formatter + Safe Clipboard Copy)
 *
 * Byte-identical across Client (`main`) and Admin (`release/pouw-admin-backend`).
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  WithdrawalModuleError,
  type WithdrawalAddressType,
} from '../../types/withdrawal.ts';

export function formatShortWithdrawalAddress(
  address: string,
  headChars = 6,
  tailChars = 6,
): string {
  const clean = typeof address === 'string' ? address.trim() : '';
  if (!clean) {
    return '—';
  }
  if (clean.length <= headChars + tailChars + 3) {
    return clean;
  }
  return `${clean.slice(0, headChars)}...${clean.slice(-tailChars)}`;
}

export async function copyWithdrawalText(
  value: string,
  customCopyHandler?: (text: string) => Promise<void> | void,
): Promise<void> {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean) {
    throw new WithdrawalModuleError({
      originTask: 'W06',
      originModule: 'SHARED_UI',
      code: 'CLIPBOARD_UNAVAILABLE',
      httpStatus: 400,
      message: 'No hay contenido válido para copiar al portapapeles.',
    });
  }

  if (customCopyHandler) {
    await customCopyHandler(clean);
    return;
  }

  const nav = typeof globalThis !== 'undefined' ? (globalThis as { navigator?: Navigator }).navigator : undefined;
  if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
    await nav.clipboard.writeText(clean);
    return;
  }

  throw new WithdrawalModuleError({
    originTask: 'W06',
    originModule: 'SHARED_UI',
    code: 'CLIPBOARD_UNAVAILABLE',
    httpStatus: 400,
    message: 'El portapapeles del navegador no está disponible en este entorno.',
  });
}

export interface WithdrawalAddressProps {
  address: string;
  addressType?: WithdrawalAddressType;
  truncate?: boolean;
  showTypeTag?: boolean;
  onCopy?: (copiedAddress: string) => Promise<void> | void;
  onCopyError?: (error: WithdrawalModuleError) => void;
  className?: string;
}

export function WithdrawalAddress({
  address,
  addressType,
  truncate = true,
  showTypeTag = false,
  onCopy,
  onCopyError,
  className = '',
}: WithdrawalAddressProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const cleanAddress = typeof address === 'string' ? address.trim() : '';
  const displayValue = truncate
    ? formatShortWithdrawalAddress(cleanAddress)
    : cleanAddress || '—';

  const handleCopy = useCallback(async () => {
    try {
      await copyWithdrawalText(cleanAddress, onCopy);
      setCopied(true);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      const fault =
        err instanceof WithdrawalModuleError
          ? err
          : new WithdrawalModuleError({
              originTask: 'W06',
              originModule: 'SHARED_UI',
              code: 'CLIPBOARD_UNAVAILABLE',
              httpStatus: 400,
              message: err instanceof Error ? err.message : 'Error al copiar dirección.',
            });
      onCopyError?.(fault);
    }
  }, [cleanAddress, onCopy, onCopyError]);

  return (
    <span
      className={`wth-chip-inline wth-chip-inline--address${className ? ` ${className}` : ''}`}
      data-testid="withdrawal-address-chip"
    >
      {showTypeTag && addressType && (
        <span className="wth-mini-tag wth-tabular-mono">{addressType}</span>
      )}
      <code
        className="wth-mono-value wth-mono-capsule wth-tabular-mono"
        title={cleanAddress}
        data-testid="withdrawal-address-value"
      >
        {displayValue}
      </code>
      {cleanAddress && (
        <button
          type="button"
          className={`wth-icon-btn${copied ? ' wth-icon-btn--copied' : ''}`}
          onClick={() => void handleCopy()}
          aria-label={copied ? 'Dirección copiada' : `Copiar dirección ${cleanAddress}`}
          title={copied ? 'Copiado' : 'Copiar dirección'}
          data-testid="withdrawal-address-copy-btn"
        >
          {copied ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      )}
    </span>
  );
}
