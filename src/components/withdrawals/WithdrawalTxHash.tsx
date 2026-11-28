/**
 * SCRUM-275 / SCRUM-289 / SCRUM-281 (W06)
 * Shared UI: WithdrawalTxHash + Authoritative Explorer URL Builder
 *
 * Security invariant:
 * Explorer links are NEVER taken from untrusted user input or arbitrary URLs.
 * They are constructed exclusively from versioned W03 `WithdrawalNetworkConfig`
 * (or canonical `CANONICAL_USDT_NETWORKS` fallback), verified `https://` scheme,
 * and `validateBlockchainTxHash(txHash, addressType)` from W01.
 *
 * Byte-identical across Client (`main`) and Admin (`release/pouw-admin-backend`).
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  CANONICAL_USDT_NETWORKS,
  WithdrawalModuleError,
  validateBlockchainTxHash,
  type WithdrawalAddressType,
  type WithdrawalNetworkConfig,
} from '../../types/withdrawal.ts';
import { copyWithdrawalText, formatShortWithdrawalAddress } from './WithdrawalAddress.tsx';

export interface BuildSafeExplorerUrlInput {
  txHash?: string | null;
  networkId?: string;
  addressType: WithdrawalAddressType;
  networkConfig?: WithdrawalNetworkConfig | null;
  networksCatalog?: readonly WithdrawalNetworkConfig[];
}

export interface SafeExplorerUrlResult {
  valid: boolean;
  url: string | null;
  normalizedTxHash: string;
  templateUsed?: string;
  faultCode?: string;
  reason?: string;
}

const CANONICAL_ALLOWED_EXPLORER_HOSTS: ReadonlySet<string> = new Set(
  CANONICAL_USDT_NETWORKS.map((net) => {
    try {
      return new URL(net.explorerTxUrlTemplate.replace('{txHash}', '0'.repeat(64))).hostname.toLowerCase();
    } catch {
      return '';
    }
  }).filter(Boolean),
);

function assertSafeExplorerTemplate(template: string): { valid: boolean; reason?: string } {
  const clean = typeof template === 'string' ? template.trim() : '';
  if (!clean || !clean.includes('{txHash}')) {
    return {
      valid: false,
      reason: 'Plantilla de explorer inválida: debe incluir el marcador {txHash}.',
    };
  }
  try {
    const probe = new URL(clean.replace('{txHash}', '0'.repeat(64)));
    if (probe.protocol !== 'https:') {
      return {
        valid: false,
        reason: 'Plantilla de explorer rechazada: solo se permite protocolo https://.',
      };
    }
    const host = probe.hostname.toLowerCase();
    if (!host || (!CANONICAL_ALLOWED_EXPLORER_HOSTS.has(host) && !host.endsWith('.etherscan.io'))) {
      return {
        valid: false,
        reason: `Host de explorer no autorizado en configuración versionada: ${host}`,
      };
    }
    return { valid: true };
  } catch {
    return {
      valid: false,
      reason: 'Plantilla de explorer con formato URL malformado.',
    };
  }
}

/**
 * Builds an explorer URL strictly from W03 network config and validated on-chain txHash.
 */
export function buildSafeWithdrawalExplorerUrl(
  input: BuildSafeExplorerUrlInput,
): SafeExplorerUrlResult {
  const rawHash = typeof input.txHash === 'string' ? input.txHash.trim() : '';
  if (!rawHash) {
    return {
      valid: false,
      url: null,
      normalizedTxHash: '',
    };
  }

  const hashCheck = validateBlockchainTxHash(rawHash, input.addressType);
  if (!hashCheck.valid) {
    const err = new WithdrawalModuleError({
      originTask: 'W06',
      originModule: 'SHARED_UI',
      code: 'UNSAFE_EXPLORER_URL',
      httpStatus: 422,
      message: hashCheck.reason ?? 'txHash inválido para construir enlace de explorer.',
    });
    return {
      valid: false,
      url: null,
      normalizedTxHash: rawHash,
      faultCode: err.faultCode,
      reason: err.message,
    };
  }

  const matchedNetwork =
    input.networkConfig ??
    input.networksCatalog?.find((n) => n.id === input.networkId) ??
    CANONICAL_USDT_NETWORKS.find((n) => n.id === input.networkId) ??
    null;

  if (!matchedNetwork) {
    const err = new WithdrawalModuleError({
      originTask: 'W06',
      originModule: 'SHARED_UI',
      code: 'INVALID_EXPLORER_TEMPLATE',
      httpStatus: 422,
      message: `No existe configuración de explorer segura para la red "${String(input.networkId)}".`,
    });
    return {
      valid: false,
      url: null,
      normalizedTxHash: hashCheck.normalizedTxHash,
      faultCode: err.faultCode,
      reason: err.message,
    };
  }

  const templateCheck = assertSafeExplorerTemplate(matchedNetwork.explorerTxUrlTemplate);
  if (!templateCheck.valid) {
    const err = new WithdrawalModuleError({
      originTask: 'W06',
      originModule: 'SHARED_UI',
      code: 'INVALID_EXPLORER_TEMPLATE',
      httpStatus: 422,
      message: templateCheck.reason ?? 'Plantilla de explorer inválida.',
    });
    return {
      valid: false,
      url: null,
      normalizedTxHash: hashCheck.normalizedTxHash,
      templateUsed: matchedNetwork.explorerTxUrlTemplate,
      faultCode: err.faultCode,
      reason: err.message,
    };
  }

  const finalUrl = matchedNetwork.explorerTxUrlTemplate.replace(
    '{txHash}',
    encodeURIComponent(hashCheck.normalizedTxHash),
  );

  return {
    valid: true,
    url: finalUrl,
    normalizedTxHash: hashCheck.normalizedTxHash,
    templateUsed: matchedNetwork.explorerTxUrlTemplate,
  };
}

export interface WithdrawalTxHashProps {
  txHash?: string | null;
  networkId?: string;
  addressType: WithdrawalAddressType;
  networkConfig?: WithdrawalNetworkConfig | null;
  networksCatalog?: readonly WithdrawalNetworkConfig[];
  truncate?: boolean;
  onCopy?: (copiedTxHash: string) => Promise<void> | void;
  onCopyError?: (error: WithdrawalModuleError) => void;
  className?: string;
}

export function WithdrawalTxHash({
  txHash,
  networkId,
  addressType,
  networkConfig,
  networksCatalog,
  truncate = true,
  onCopy,
  onCopyError,
  className = '',
}: WithdrawalTxHashProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const cleanHash = typeof txHash === 'string' ? txHash.trim() : '';

  const handleCopy = useCallback(async () => {
    try {
      await copyWithdrawalText(cleanHash, onCopy);
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
              message: err instanceof Error ? err.message : 'Error al copiar txHash.',
            });
      onCopyError?.(fault);
    }
  }, [cleanHash, onCopy, onCopyError]);

  if (!cleanHash) {
    return (
      <span
        className={`wth-tx-pending wth-tabular-mono${className ? ` ${className}` : ''}`}
        data-testid="withdrawal-txhash-pending"
      >
        <span className="wth-tx-pending-dot" aria-hidden="true" />
        <span>Pendiente de emisión</span>
      </span>
    );
  }

  const explorerResult = buildSafeWithdrawalExplorerUrl({
    txHash: cleanHash,
    networkId,
    addressType,
    networkConfig,
    networksCatalog,
  });

  const displayHash = truncate
    ? formatShortWithdrawalAddress(cleanHash, 8, 6)
    : cleanHash;

  return (
    <span
      className={`wth-chip-inline wth-chip-inline--txhash${className ? ` ${className}` : ''}`}
      data-testid="withdrawal-txhash-chip"
    >
      <code
        className="wth-mono-value wth-mono-capsule wth-tabular-mono"
        title={cleanHash}
        data-testid="withdrawal-txhash-value"
      >
        {displayHash}
      </code>
      <button
        type="button"
        className={`wth-icon-btn${copied ? ' wth-icon-btn--copied' : ''}`}
        onClick={() => void handleCopy()}
        aria-label={copied ? 'txHash copiado' : `Copiar txHash ${cleanHash}`}
        title={copied ? 'Copiado' : 'Copiar txHash'}
        data-testid="withdrawal-txhash-copy-btn"
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
      {explorerResult.valid && explorerResult.url && (
        <a
          href={explorerResult.url}
          target="_blank"
          rel="noopener noreferrer"
          className="wth-explorer-link"
          title="Ver transacción en explorer oficial"
          aria-label="Abrir transacción en explorador blockchain"
          data-testid="withdrawal-txhash-explorer-link"
        >
          <span>Explorer</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M7 17 17 7M7 7h10v10" />
          </svg>
        </a>
      )}
    </span>
  );
}
