import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ShoppingCart,
  Search,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Zap,
  DollarSign,
  Package,
  Cpu,
  X,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { PackagePaymentsService } from '../../services/admin/packagePaymentsService';
import type { PackageOrderPayment, OrderPaymentStatus } from '../../types/admin';

interface PackagePaymentsViewProps {
  isDarkTheme?: boolean;
}

const REVERIFY_ELIGIBLE_STATUSES = new Set<OrderPaymentStatus>([
  'OPEN',
  'AWAITING',
  'PROCESSING',
  'UNDERPAID',
]);

const STATUS_META: Record<
  OrderPaymentStatus,
  { label: string; className: string; dotClass: string }
> = {
  OPEN: {
    label: 'Abierta (Sin método)',
    className: 'admin-bg-subtle admin-text-secondary border admin-border',
    dotClass: 'admin-bg-subtle',
  },
  AWAITING: {
    label: 'Esperando Depósito',
    className: 'admin-bg-warning admin-text-warning border admin-border-warning',
    dotClass: 'admin-bg-warning',
  },
  PROCESSING: {
    label: 'Verificando Bloques',
    className: 'admin-bg-info admin-text-accent border admin-border-info',
    dotClass: 'admin-bg-info',
  },
  SETTLED: {
    label: 'Paid — Minero Activo',
    className: 'admin-bg-success admin-text-success border admin-border-success',
    dotClass: 'admin-bg-success',
  },
  UNDERPAID: {
    label: 'Pago Incompleto',
    className: 'admin-bg-danger admin-text-danger border admin-border-danger',
    dotClass: 'admin-bg-danger',
  },
  FAILED: {
    label: 'Fallido On-Chain',
    className: 'admin-bg-danger admin-text-danger border admin-border-danger',
    dotClass: 'admin-bg-danger',
  },
  EXPIRED: {
    label: 'Cotización Caducada',
    className: 'admin-bg-subtle admin-text-secondary border admin-border',
    dotClass: 'admin-bg-subtle',
  },
  CANCELLED: {
    label: 'Cancelada',
    className: 'admin-bg-subtle admin-text-secondary border admin-border',
    dotClass: 'admin-bg-subtle',
  },
  REVERSED: {
    label: 'Revertido (Histórico)',
    className: 'admin-bg-danger admin-text-danger border admin-border-danger',
    dotClass: 'admin-bg-danger',
  },
};

function buildAdminExplorerTxUrl(
  network: string,
  txHash?: string,
  networkMode?: 'testnet' | 'mainnet'
): string | null {
  const cleanHash = typeof txHash === 'string' ? txHash.trim() : '';
  if (!cleanHash) return null;
  const net = String(network || '').toUpperCase();
  const isMainnet = networkMode === 'mainnet';
  const encoded = encodeURIComponent(cleanHash);

  if (net === 'BSC' || net.includes('BNB')) {
    return `${isMainnet ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/tx/${encoded}`;
  }
  if (net.includes('POLY') || net === 'POL') {
    return `${isMainnet ? 'https://polygonscan.com' : 'https://amoy.polygonscan.com'}/tx/${encoded}`;
  }
  if (net.includes('ETH') || net === 'ERC20') {
    return `${isMainnet ? 'https://etherscan.io' : 'https://sepolia.etherscan.io'}/tx/${encoded}`;
  }
  if (net.includes('SOL')) {
    return `https://solscan.io/tx/${encoded}${isMainnet ? '' : '?cluster=devnet'}`;
  }
  return null;
}

function renderStatusBadge(status: OrderPaymentStatus) {
  const meta = STATUS_META[status] ?? STATUS_META.OPEN;
  return (
    <span
      className={`admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono font-semibold ${meta.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`}></span>
      {meta.label}
    </span>
  );
}

function renderNetworkBadge(network: PackageOrderPayment['paymentNetwork'] | string) {
  const net = String(network || '').toUpperCase();
  if (net.includes('BNB') || net.includes('BSC')) {
    return (
      <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-warning admin-text-warning border admin-border-warning">
        BNB CHAIN
      </span>
    );
  }
  if (net.includes('POLY') || net === 'POL') {
    return (
      <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-accent-soft admin-text-accent border admin-border-accent">
        POLYGON
      </span>
    );
  }
  if (net.includes('ETH') || net === 'ERC20') {
    return (
      <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-info admin-text-accent border admin-border-info">
        ETH ERC20
      </span>
    );
  }
  if (net.includes('SOL')) {
    return (
      <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-subtle admin-text-secondary border admin-border">
        SOLANA
      </span>
    );
  }
  if (net.includes('LOCAL') || net.includes('BALANCE')) {
    return (
      <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-success admin-text-success border admin-border-success">
        SALDO LOCAL
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-subtle admin-text-secondary border admin-border">
      {network || 'SIN RED'}
    </span>
  );
}

function renderModeBadge(networkMode?: 'testnet' | 'mainnet') {
  if (!networkMode) return null;
  const isMainnet = networkMode === 'mainnet';
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 admin-radius-control font-mono font-semibold border ${
        isMainnet
          ? 'admin-bg-success admin-text-success admin-border-success'
          : 'admin-bg-warning admin-text-warning admin-border-warning'
      }`}
    >
      {isMainnet ? 'MAINNET' : 'TESTNET'}
    </span>
  );
}

export const PackagePaymentsView: React.FC<PackagePaymentsViewProps> = ({ isDarkTheme = false }) => {
  const isLight = !isDarkTheme;
  const service = PackagePaymentsService.getInstance();

  const [payments, setPayments] = useState<PackageOrderPayment[]>(() => service.getPayments());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [networkFilter, setNetworkFilter] = useState<string>('ALL');
  const [selectedPayment, setSelectedPayment] = useState<PackageOrderPayment | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [verifyingOrderId, setVerifyingOrderId] = useState<string | null>(null);
  const [reverifyFeedback, setReverifyFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const refreshList = useCallback(async () => {
    setIsSyncing(true);
    try {
      const updated = await service.fetchFirestorePayments();
      setPayments(updated);
    } catch (err: any) {
      setReverifyFeedback({
        type: 'error',
        message: err?.message || 'Error al sincronizar /admin_orders desde Firestore.',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [service]);

  useEffect(() => {
    let cancelled = false;
    setIsSyncing(true);
    service
      .fetchFirestorePayments()
      .then((updated) => {
        if (!cancelled) setPayments(updated);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsSyncing(false);
      });

    const unsubscribe = service.subscribeToFirestorePayments((updated) => {
      if (!cancelled) setPayments(updated);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [service]);

  const summary = useMemo(() => service.getSummary(payments), [service, payments]);

  const filteredPayments = useMemo(() => {
    const queryLower = searchTerm.trim().toLowerCase();
    return payments.filter((item) => {
      const matchesSearch =
        !queryLower ||
        item.orderId.toLowerCase().includes(queryLower) ||
        (item.intentId && item.intentId.toLowerCase().includes(queryLower)) ||
        item.userName.toLowerCase().includes(queryLower) ||
        item.userEmail.toLowerCase().includes(queryLower) ||
        item.packageName.toLowerCase().includes(queryLower) ||
        (item.txHash && item.txHash.toLowerCase().includes(queryLower));

      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesNetwork =
        networkFilter === 'ALL' || String(item.paymentNetwork || '').toUpperCase() === networkFilter;

      return matchesSearch && matchesStatus && matchesNetwork;
    });
  }, [payments, searchTerm, statusFilter, networkFilter]);

  const handleReverifyOnChain = async (item: PackageOrderPayment) => {
    const targetIntentId = item.intentId || item.orderId;
    setVerifyingOrderId(item.orderId);
    setReverifyFeedback(null);
    try {
      const result = await service.reverifyPaymentOnChain(targetIntentId, item.txHash);
      setReverifyFeedback({
        type: 'success',
        message: `Orden ${item.orderId}: ${result.outcome} (estado ${result.status}${
          result.confirmations !== undefined && result.requiredConfirmations !== undefined
            ? `, bloques ${result.confirmations}/${result.requiredConfirmations}`
            : ''
        }).`,
      });
      await refreshList();
    } catch (err: any) {
      setReverifyFeedback({
        type: 'error',
        message: `Re-verificación rechazada para ${item.orderId}: ${err?.message || 'Error desconocido'}`,
      });
    } finally {
      setVerifyingOrderId(null);
    }
  };

  return (
    <div className="minerx-admin-view space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b admin-border">
        <div>
          <div className="flex items-center gap-2">
            <div className="admin-card p-2 admin-radius-card admin-bg-success border admin-border-success admin-text-success">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold font-sans admin-text-primary">
                Pagos de Paquetes Comprados
              </h2>
              <p className="text-xs mt-0.5 admin-text-secondary">
                Tracking en tiempo real sobre /admin_orders y re-verificación server-authoritative (confirmPaymentIntent)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void refreshList()}
            disabled={isSyncing}
            className={`px-3 py-2 admin-radius-control border text-xs font-mono font-semibold flex items-center gap-1.5 active:scale-[0.98] cursor-pointer ${
              isLight
                ? ' admin-bg-surface admin-border admin-text-primary'
                : ' admin-bg-surface admin-border admin-text-secondary'
            }`}
            title="Sincronizar órdenes y pagos de paquetes desde Cloud Firestore (/admin_orders)"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? ' animate-spin admin-text-success' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Firestore'}</span>
          </button>
        </div>
      </div>

      {reverifyFeedback && (
        <div
          role="status"
          className={`admin-card p-3 admin-radius-card border text-xs font-mono flex items-center justify-between gap-2 ${
            reverifyFeedback.type === 'success'
              ? 'admin-bg-success admin-border-success admin-text-success'
              : 'admin-bg-danger admin-border-danger admin-text-danger'
          }`}
        >
          <span className="flex items-center gap-2">
            {reverifyFeedback.type === 'success' ? (
              <ShieldCheck className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{reverifyFeedback.message}</span>
          </span>
          <button
            type="button"
            onClick={() => setReverifyFeedback(null)}
            className="p-1 admin-radius-control cursor-pointer"
            aria-label="Cerrar notificación"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Volumen Facturado (SETTLED only) */}
        <div
          className={`admin-card p-5 admin-radius-card border ${
            isLight
              ? ' admin-bg-success admin-border-success'
              : ' admin-bg-surface admin-border-success admin-text-primary'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-semibold admin-text-success">
              Volumen Liquidado (SETTLED)
            </span>
            <DollarSign className="h-4 w-4 admin-text-success" />
          </div>
          <div className="text-2xl font-semibold font-mono admin-text-success">
            ${summary.totalVolumeUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}{' '}
            <span className="text-xs font-normal font-sans admin-text-secondary">USD</span>
          </div>
          <div className="text-xs font-mono mt-1 admin-text-success font-medium">
            {summary.settledCount} órdenes liquidadas
          </div>
        </div>

        {/* KPI 2: Potencia TH/s Vendida (SETTLED only) */}
        <div
          className={`admin-card p-5 admin-radius-card border ${
            isLight
              ? ' admin-bg-info admin-border-info'
              : ' admin-bg-surface admin-border-info admin-text-primary'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-semibold admin-text-accent">
              Potencia Total Vendida
            </span>
            <Zap className="h-4 w-4 admin-text-accent" />
          </div>
          <div className="text-2xl font-semibold font-mono admin-text-accent">
            {summary.totalThSold}{' '}
            <span className="text-xs font-normal font-sans admin-text-secondary">TH/s</span>
          </div>
          <div className="text-xs font-mono mt-1 admin-text-accent font-medium">
            Asignada únicamente tras SETTLED
          </div>
        </div>

        {/* KPI 3: En Proceso (OPEN + AWAITING + PROCESSING) */}
        <div
          className={`admin-card p-5 admin-radius-card border ${
            isLight
              ? ' admin-bg-warning admin-border-warning'
              : ' admin-bg-subtle admin-border-warning admin-text-primary'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-semibold admin-text-warning">
              En Proceso On-Chain
            </span>
            <Clock className="h-4 w-4 admin-text-warning" />
          </div>
          <div className="text-2xl font-semibold font-mono admin-text-warning">
            {summary.pendingCount}
          </div>
          <div className="text-xs font-mono mt-1 admin-text-warning font-medium">
            OPEN + AWAITING + PROCESSING
          </div>
        </div>

        {/* KPI 4: Incidencias & Cerradas */}
        <div
          className={`admin-card p-5 admin-radius-card border ${
            isLight ? ' admin-bg-surface admin-border' : ' admin-bg-subtle admin-border admin-text-primary'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-semibold admin-text-secondary">
              Incidencias / Cerradas
            </span>
            <Package className="h-4 w-4 admin-text-secondary" />
          </div>
          <div className="text-2xl font-semibold font-mono">
            {summary.underpaidCount +
              summary.failedCount +
              summary.expiredCount +
              summary.cancelledCount +
              summary.reversedCount}
          </div>
          <div className="text-[11px] font-mono mt-1 admin-text-secondary">
            Sub:{summary.underpaidCount} · Fall:{summary.failedCount} · Exp:{summary.expiredCount} · Canc:{summary.cancelledCount}
            {summary.reversedCount > 0 ? ` · Rev:${summary.reversedCount}` : ''}
          </div>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="admin-card p-4 admin-radius-card border admin-bg-surface admin-border flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 admin-text-secondary" />
          <input
            type="text"
            placeholder="Buscar por orden, intentId, cliente, paquete o txHash..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 admin-radius-card text-xs font-mono border admin-bg-surface admin-border admin-text-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1 text-xs font-mono">
            <span className="text-xs font-semibold admin-text-secondary">Estado:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`px-2.5 py-1.5 admin-radius-card text-xs font-mono border cursor-pointer ${
                isLight
                  ? ' admin-bg-surface admin-border admin-text-primary'
                  : ' admin-bg-subtle admin-border admin-text-secondary'
              }`}
            >
              <option value="ALL">Todos los Estados</option>
              <option value="OPEN">OPEN</option>
              <option value="AWAITING">AWAITING</option>
              <option value="PROCESSING">PROCESSING</option>
              <option value="SETTLED">SETTLED (Paid — Minero Activo)</option>
              <option value="UNDERPAID">UNDERPAID</option>
              <option value="FAILED">FAILED</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="REVERSED">REVERSED (Histórico)</option>
            </select>
          </div>

          <div className="flex items-center gap-1 text-xs font-mono">
            <span className="text-xs font-semibold admin-text-secondary">Red:</span>
            <select
              value={networkFilter}
              onChange={(e) => setNetworkFilter(e.target.value)}
              className={`px-2.5 py-1.5 admin-radius-card text-xs font-mono border cursor-pointer ${
                isLight
                  ? ' admin-bg-surface admin-border admin-text-primary'
                  : ' admin-bg-subtle admin-border admin-text-secondary'
              }`}
            >
              <option value="ALL">Todas las Redes</option>
              <option value="BSC">BNB Chain (BSC)</option>
              <option value="POLYGON">Polygon</option>
              <option value="ETHEREUM">Ethereum</option>
              <option value="SOLANA">Solana</option>
              <option value="LOCAL_BALANCE">Saldo Local</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden admin-radius-card border admin-bg-surface admin-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr
                className={`border-b admin-bg-surface admin-border ${
                  isLight ? ' admin-text-primary' : ' admin-text-secondary'
                }`}
              >
                <th className="py-3 px-4 font-semibold text-xs">Orden / Fecha</th>
                <th className="py-3 px-4 font-semibold text-xs">Cliente</th>
                <th className="py-3 px-4 font-semibold text-xs">Paquete / Potencia</th>
                <th className="py-3 px-4 font-semibold text-xs text-right">Importe</th>
                <th className="py-3 px-4 font-semibold text-xs">Red &amp; Bloques</th>
                <th className="py-3 px-4 font-semibold text-xs">Estado</th>
                <th className="py-3 px-4 font-semibold text-xs text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center admin-text-secondary">
                    No hay órdenes en /admin_orders para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((item) => {
                  const progressPct = Math.min(
                    100,
                    Math.round((item.confirmations / Math.max(1, item.requiredConfirmations)) * 100)
                  );
                  const explorerUrl = buildAdminExplorerTxUrl(
                    item.paymentNetwork,
                    item.txHash,
                    item.networkMode
                  );
                  const canReverify = REVERIFY_ELIGIBLE_STATUSES.has(item.status);
                  const isVerifying = verifyingOrderId === item.orderId;

                  return (
                    <tr key={item.orderId}>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold admin-text-accent">{item.orderId}</div>
                        <div className="text-xs admin-text-secondary">
                          {new Date(item.createdAt).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold font-sans admin-text-primary">{item.userName}</div>
                        <div className="text-xs admin-text-secondary">{item.userEmail || item.userId}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold">{item.packageName}</div>
                        <div className="text-xs admin-text-success font-semibold flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          <span>
                            {item.productType === 'subscription'
                              ? 'Suscripción'
                              : `${item.contractedTh} TH/s`}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="font-semibold text-sm admin-text-success">
                          ${item.amountUsd.toFixed(2)} USD
                        </div>
                        <div className="text-xs admin-text-secondary">{item.cryptoAmount}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          {renderNetworkBadge(item.paymentNetwork)}
                          {renderModeBadge(item.networkMode)}
                        </div>
                        <div className="text-xs flex items-center gap-1.5 admin-text-secondary">
                          <span>
                            Bloques: {item.confirmations}/{item.requiredConfirmations}
                          </span>
                          {item.confirmations >= item.requiredConfirmations && item.status === 'SETTLED' && (
                            <CheckCircle2 className="h-3 w-3 admin-text-success" />
                          )}
                        </div>
                        <div className="w-28 h-1.5 rounded-full admin-bg-subtle overflow-hidden mt-1">
                          <div
                            className="h-full admin-bg-primary transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        {item.txHash && (
                          <div className="text-xs mt-1">
                            {explorerUrl ? (
                              <a
                                href={explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="admin-text-accent hover:underline inline-flex items-center gap-1"
                              >
                                <span>tx: {item.txHash.slice(0, 10)}...</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="admin-text-secondary truncate max-w-[120px] block">
                                tx: {item.txHash.slice(0, 10)}...
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {renderStatusBadge(item.status)}
                        {item.activatedMinerId && (
                          <div className="text-xs admin-text-success mt-0.5 flex items-center gap-1">
                            <Cpu className="h-2.5 w-2.5" />
                            <span>Minero: {item.activatedMinerId}</span>
                          </div>
                        )}
                        {item.contractId && (
                          <div className="text-[11px] admin-text-secondary mt-0.5">
                            Contrato: {item.contractId}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canReverify && (
                            <button
                              type="button"
                              disabled={isVerifying}
                              onClick={() => void handleReverifyOnChain(item)}
                              className="px-2.5 py-1 admin-radius-control admin-bg-primary admin-text-primary border admin-border-accent font-semibold text-xs active:scale-[0.97] cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                              title="Invocar confirmPaymentIntent (Cloud Function Gen 2) para re-verificar on-chain"
                            >
                              <RefreshCw className={`h-3 w-3 ${isVerifying ? 'animate-spin' : ''}`} />
                              <span>{isVerifying ? 'Verificando...' : 'Re-verificar On-Chain'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedPayment(item)}
                            className={`p-1.5 admin-radius-control border text-xs flex items-center gap-1 ${
                              isLight
                                ? ' admin-bg-surface admin-text-primary'
                                : ' admin-bg-surface admin-text-secondary'
                            } cursor-pointer`}
                            title="Ver recibo y detalles de conciliación"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Ver Recibo Completo (Read-Only) */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 admin-bg-subtle">
          <div className="admin-card w-full max-w-lg p-6 admin-radius-card border admin-bg-surface admin-border admin-text-primary">
            <div className="flex items-center justify-between pb-3 border-b admin-border">
              <div className="flex items-center gap-2">
                <ReceiptIcon className="h-5 w-5 admin-text-accent" />
                <h3 className="font-semibold text-base">Comprobante de Pago &amp; Conciliación</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="p-1 admin-radius-control admin-text-secondary cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">ID de Orden / Intent:</span>
                <span className="font-semibold admin-text-accent">
                  {selectedPayment.orderId}
                  {selectedPayment.intentId && selectedPayment.intentId !== selectedPayment.orderId
                    ? ` (${selectedPayment.intentId})`
                    : ''}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Estado Canónico:</span>
                {renderStatusBadge(selectedPayment.status)}
              </div>
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Cliente Comprador:</span>
                <span className="font-semibold">
                  {selectedPayment.userName} ({selectedPayment.userEmail || selectedPayment.userId})
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Paquete &amp; Potencia:</span>
                <span className="font-semibold admin-text-success">
                  {selectedPayment.packageName} ({selectedPayment.contractedTh} TH/s)
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Importe USD / Cripto:</span>
                <span className="font-semibold">
                  ${selectedPayment.amountUsd.toFixed(2)} USD · {selectedPayment.cryptoAmount}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Red &amp; Entorno:</span>
                <span className="flex items-center gap-1.5">
                  {renderNetworkBadge(selectedPayment.paymentNetwork)}
                  {renderModeBadge(selectedPayment.networkMode)}
                </span>
              </div>
              {selectedPayment.recipientAddress && (
                <div className="flex flex-col py-1.5 border-b admin-border">
                  <span className="admin-text-secondary mb-1">Dirección Tesorería:</span>
                  <span className="font-mono text-xs break-all admin-bg-surface p-2 admin-radius-card">
                    {selectedPayment.recipientAddress}
                  </span>
                </div>
              )}
              {selectedPayment.txHash && (
                <div className="flex flex-col py-1.5 border-b admin-border">
                  <span className="admin-text-secondary mb-1">Hash de Depósito On-Chain:</span>
                  <span className="font-mono text-xs admin-text-accent break-all admin-bg-info p-2 admin-radius-card border admin-border-info">
                    {selectedPayment.txHash}
                  </span>
                </div>
              )}
              {selectedPayment.activatedMinerId && (
                <div className="flex justify-between py-1.5 border-b admin-border">
                  <span className="admin-text-secondary">Minero Activado:</span>
                  <span className="font-semibold admin-text-success">
                    {selectedPayment.activatedMinerId}
                  </span>
                </div>
              )}
              {selectedPayment.contractId && (
                <div className="flex justify-between py-1.5 border-b admin-border">
                  <span className="admin-text-secondary">Contrato Admin:</span>
                  <span className="font-semibold">{selectedPayment.contractId}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5">
                <span className="admin-text-secondary">Confirmaciones de Red:</span>
                <span className="font-semibold admin-text-success">
                  {selectedPayment.confirmations} / {selectedPayment.requiredConfirmations}
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end pt-3 border-t admin-border">
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="px-4 py-1.5 admin-radius-control admin-bg-surface text-xs font-mono font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ReceiptIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
    <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
    <path d="M12 17.5v-11" />
  </svg>
);
