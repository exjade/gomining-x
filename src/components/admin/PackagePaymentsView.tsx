import React, { useState, useMemo, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { PackagePaymentsService } from '../../services/admin/packagePaymentsService';
import type { PackageOrderPayment, OrderPaymentStatus } from '../../types/admin';

interface PackagePaymentsViewProps {
  isDarkTheme?: boolean;
}

export const PackagePaymentsView: React.FC<PackagePaymentsViewProps> = ({ isDarkTheme = false }) => {
  const isLight = !isDarkTheme;
  const service = PackagePaymentsService.getInstance();

  const [payments, setPayments] = useState<PackageOrderPayment[]>(() => service.getPayments());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [networkFilter, setNetworkFilter] = useState<string>('ALL');
  const [selectedPayment, setSelectedPayment] = useState<PackageOrderPayment | null>(null);
  const [settleModalItem, setSettleModalItem] = useState<PackageOrderPayment | null>(null);
  const [manualTxHash, setManualTxHash] = useState('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refreshList = async () => {
    setIsSyncing(true);
    try {
      const updated = await service.fetchFirestorePayments();
      setPayments(updated);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    refreshList();
    const unsubscribe = service.subscribeToFirestorePayments((updated) => {
      setPayments(updated);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const summary = useMemo(() => service.getSummary(), [payments]);

  const filteredPayments = useMemo(() => {
    return payments.filter(item => {
      const matchesSearch = 
        item.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.packageName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.txHash && item.txHash.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesNetwork = networkFilter === 'ALL' || item.paymentNetwork === networkFilter;

      return matchesSearch && matchesStatus && matchesNetwork;
    });
  }, [payments, searchTerm, statusFilter, networkFilter]);

  const handleConfirmSettle = () => {
    if (!settleModalItem) return;
    service.confirmAndSettlePayment(settleModalItem.orderId, manualTxHash);
    setSettleModalItem(null);
    setManualTxHash('');
    refreshList();
  };

  const getStatusBadge = (status: OrderPaymentStatus) => {
    switch (status) {
      case 'SETTLED':
        return (
          <span className="admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono font-semibold admin-bg-success admin-text-success border admin-border-success">
            <span className="h-1.5 w-1.5 rounded-full admin-bg-success"></span>
            Liquidado & Minero Activo
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono font-semibold admin-bg-info admin-text-accent border admin-border-info">
            <span className="h-1.5 w-1.5 rounded-full admin-bg-info"></span>
            Confirmando en Bloque
          </span>
        );
      case 'PENDING':
        return (
          <span className="admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono font-semibold admin-bg-warning admin-text-warning border admin-border-warning">
            <span className="h-1.5 w-1.5 rounded-full admin-bg-warning"></span>
            Esperando Depósito
          </span>
        );
      case 'UNDERPAID':
        return (
          <span className="admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono font-semibold admin-bg-danger admin-text-danger border admin-border-danger">
            <span className="h-1.5 w-1.5 rounded-full admin-bg-danger"></span>
            Pago Incompleto
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono font-semibold admin-bg-subtle admin-text-secondary border admin-border">
            <span className="h-1.5 w-1.5 rounded-full admin-bg-subtle"></span>
            Cotización Caducada
          </span>
        );
      case 'REVERSED':
        return (
          <span className="admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono font-semibold admin-bg-danger admin-text-danger border admin-border-danger">
            Revertido
          </span>
        );
    }
  };

  const getNetworkBadge = (network: PackageOrderPayment['paymentNetwork'] | string) => {
    const net = String(network || '').toUpperCase();
    if (net.includes('TRON') || net === 'TRC20') {
      return <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-danger admin-text-danger border admin-border-danger">TRON TRC20</span>;
    }
    if (net.includes('ETH') || net === 'ERC20') {
      return <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-info admin-text-accent border admin-border-info">ETH ERC20</span>;
    }
    if (net.includes('SOL')) {
      return <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-subtle admin-text-secondary border admin-border">SOLANA</span>;
    }
    if (net.includes('BTC') || net.includes('BITCOIN')) {
      return <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-warning admin-text-warning border admin-border-warning">BITCOIN</span>;
    }
    if (net.includes('POLY') || net.includes('POL')) {
      return <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-accent-soft admin-text-accent border admin-border-accent">POLYGON</span>;
    }
    if (net.includes('BNB') || net.includes('BSC')) {
      return <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-warning admin-text-warning border admin-border-warning">BNB CHAIN</span>;
    }
    if (net.includes('LOCAL') || net.includes('BALANCE')) {
      return <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-success admin-text-success border admin-border-success">SALDO LOCAL</span>;
    }
    if (net.includes('SPEI')) {
      return <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-success admin-text-success border admin-border-success">PUENTE SPEI</span>;
    }
    return <span className="text-xs px-2 py-0.5 admin-radius-card font-semibold admin-bg-subtle admin-text-secondary border admin-border">{network || 'CRYPTO'}</span>;
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
              <h2 className={`text-xl font-semibold font-sans ${isLight ? ' admin-text-primary' : ' admin-text-primary'}`}>
                Pagos de Paquetes Comprados
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                Verificación on-chain de órdenes de compra, pagos en criptoactivos y activación automática de mineros
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshList}
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

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Volumen Facturado */}
        <div className={`admin-card p-5 admin-radius-card border ${
          isLight ? ' admin-bg-success admin-border-success' : ' admin-bg-surface admin-border-success admin-text-primary'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono font-semibold ${isLight ? ' admin-text-success' : ' admin-text-success'}`}>
              Volumen Total Facturado
            </span>
            <DollarSign className="h-4 w-4 admin-text-success" />
          </div>
          <div className="text-2xl font-semibold font-mono admin-text-success">
            ${summary.totalVolumeUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}{' '}
            <span className="text-xs font-normal font-sans admin-text-secondary">USD</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? ' admin-text-success font-medium' : ' admin-text-success'}`}>
            {summary.settledCount} órdenes liquidadas con éxito
          </div>
        </div>

        {/* KPI 2: Potencia TH/s Vendida */}
        <div className={`admin-card p-5 admin-radius-card border ${
          isLight ? ' admin-bg-info admin-border-info' : ' admin-bg-surface admin-border-info admin-text-primary'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono font-semibold ${isLight ? ' admin-text-accent' : ' admin-text-accent'}`}>
              Potencia Total Vendida
            </span>
            <Zap className="h-4 w-4 admin-text-accent" />
          </div>
          <div className="text-2xl font-semibold font-mono admin-text-accent">
            {summary.totalThSold}{' '}
            <span className="text-xs font-normal font-sans admin-text-secondary">TH/s</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? ' admin-text-accent font-medium' : ' admin-text-accent'}`}>
            Asignada a mineros digitales activos
          </div>
        </div>

        {/* KPI 3: Órdenes Pendientes de Confirmación */}
        <div className={`admin-card p-5 admin-radius-card border ${
          isLight ? ' admin-bg-warning admin-border-warning' : ' admin-bg-subtle admin-border-warning admin-text-primary'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono font-semibold ${isLight ? ' admin-text-warning' : ' admin-text-warning'}`}>
              En Verificación On-Chain
            </span>
            <Clock className="h-4 w-4 admin-text-warning" />
          </div>
          <div className="text-2xl font-semibold font-mono admin-text-warning">
            {summary.pendingCount}
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? ' admin-text-warning font-medium' : ' admin-text-warning'}`}>
            Acumulando confirmaciones de red
          </div>
        </div>

        {/* KPI 4: Caducadas / Expiradas */}
        <div className={`admin-card p-5 admin-radius-card border ${
          isLight ? ' admin-bg-surface admin-border' : ' admin-bg-subtle admin-border admin-text-primary'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono font-semibold ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
              Cotizaciones Expiradas
            </span>
            <Package className="h-4 w-4 admin-text-secondary" />
          </div>
          <div className="text-2xl font-semibold font-mono">
            {summary.expiredCount}
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
            Superaron TTL de 30 minutos
          </div>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className={`admin-card p-4 admin-radius-card border flex flex-col md:flex-row items-center justify-between gap-3 ${
        isLight ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'
      }`}>
        <div className="relative w-full md:w-80">
          <Search className={`absolute left-3 top-2.5 h-4 w-4 ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
          <input
            type="text"
            placeholder="Buscar por ID orden, cliente, paquete o txHash..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-9 pr-4 py-2 admin-radius-card text-xs font-mono border ${
              isLight 
                ? ' admin-bg-surface admin-border admin-text-primary'
                : ' admin-bg-surface admin-border admin-text-primary'
            }`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1 text-xs font-mono">
            <span className={`text-xs font-semibold ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Estado:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`px-2.5 py-1.5 admin-radius-card text-xs font-mono border cursor-pointer ${
                isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-subtle admin-border admin-text-secondary'
              }`}
            >
              <option value="ALL">Todos los Estados</option>
              <option value="SETTLED">Liquidados</option>
              <option value="CONFIRMED">En Confirmación</option>
              <option value="PENDING">Pendientes</option>
              <option value="UNDERPAID">Incompletos</option>
              <option value="EXPIRED">Expirados</option>
            </select>
          </div>

          {/* Network Filter */}
          <div className="flex items-center gap-1 text-xs font-mono">
            <span className={`text-xs font-semibold ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Red / Método:</span>
            <select
              value={networkFilter}
              onChange={(e) => setNetworkFilter(e.target.value)}
              className={`px-2.5 py-1.5 admin-radius-card text-xs font-mono border cursor-pointer ${
                isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-subtle admin-border admin-text-secondary'
              }`}
            >
              <option value="ALL">Todas las Redes</option>
              <option value="TRON">TRON TRC20</option>
              <option value="ETHEREUM">Ethereum ERC20</option>
              <option value="SOLANA">Solana</option>
              <option value="BITCOIN">Bitcoin</option>
              <option value="BRIDGE_SPEI">Puente SPEI</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className={`overflow-hidden admin-radius-card border ${
        isLight ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className={`border-b ${isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-secondary'}`}>
                <th className="py-3 px-4 font-semibold text-xs">Orden / Fecha</th>
                <th className="py-3 px-4 font-semibold text-xs">Cliente</th>
                <th className="py-3 px-4 font-semibold text-xs">Paquete / Potencia</th>
                <th className="py-3 px-4 font-semibold text-xs text-right">Importe Facturado</th>
                <th className="py-3 px-4 font-semibold text-xs">Red & Confirmaciones</th>
                <th className="py-3 px-4 font-semibold text-xs">Estado</th>
                <th className="py-3 px-4 font-semibold text-xs text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`py-8 text-center ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                    No se encontraron pagos u órdenes con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((item) => (
                  <tr 
                    key={item.orderId}
                    className={`${
                      isLight ? '' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-semibold admin-text-accent">{item.orderId}</div>
                      <div className={`text-xs ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                        {new Date(item.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className={`font-semibold font-sans ${isLight ? ' admin-text-primary' : ' admin-text-primary'}`}>
                        {item.userName}
                      </div>
                      <div className={`text-xs ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                        {item.userEmail}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold">{item.packageName}</div>
                      <div className="text-xs admin-text-success font-semibold flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        <span>{item.contractedTh} TH/s de Potencia</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="font-semibold text-sm admin-text-success">
                        ${item.amountUsd.toFixed(2)} USD
                      </div>
                      <div className={`text-xs ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                        {item.cryptoAmount}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 mb-1">
                        {getNetworkBadge(item.paymentNetwork)}
                      </div>
                      <div className={`text-xs flex items-center gap-1.5 ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                        <span>Bloques: {item.confirmations}/{item.requiredConfirmations}</span>
                        {item.confirmations >= item.requiredConfirmations && (
                          <CheckCircle2 className="h-3 w-3 admin-text-success" />
                        )}
                      </div>
                      {item.txHash && (
                        <div className="text-xs admin-text-accent truncate max-w-[120px]">
                          tx: {item.txHash.slice(0, 10)}...
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {getStatusBadge(item.status)}
                      {item.activatedMinerId && (
                        <div className="text-xs admin-text-success mt-0.5 flex items-center gap-1">
                          <Cpu className="h-2.5 w-2.5" />
                          <span>ID: {item.activatedMinerId}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {(item.status === 'PENDING' || item.status === 'CONFIRMED') && (
                          <button
                            onClick={() => setSettleModalItem(item)}
                            className="px-2.5 py-1 admin-radius-control admin-bg-primary admin-text-success border admin-border-success font-semibold text-xs active:scale-[0.97] cursor-pointer"
                            title="Verificar y activar minero"
                          >
                            Activar Minero
                          </button>
                        )}

                        <button
                          onClick={() => setSelectedPayment(item)}
                          className={`p-1.5 admin-radius-control border text-xs flex items-center gap-1 ${
                            isLight ? ' admin-bg-surface admin-text-primary' : ' admin-bg-surface admin-text-secondary'
                          } cursor-pointer`}
                          title="Ver recibo y detalles de liquidación"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Confirmar y Activar Minero */}
      {settleModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 admin-bg-subtle">
          <div className={`admin-card w-full max-w-md p-6 admin-radius-card border ${
            isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b admin-border">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 admin-text-success" />
                <h3 className="font-semibold text-base">Liquidar Orden y Activar Minero</h3>
              </div>
              <button 
                onClick={() => setSettleModalItem(null)}
                className="p-1 admin-radius-control admin-text-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs font-mono">
              <div className="admin-card p-3 admin-radius-card admin-bg-success border admin-border-success admin-text-success">
                <div className="font-semibold text-sm">
                  {settleModalItem.packageName} — {settleModalItem.contractedTh} TH/s
                </div>
                <div className="text-xs admin-text-success mt-1">
                  Cliente: {settleModalItem.userName} (${settleModalItem.amountUsd.toFixed(2)} USD)
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold admin-text-secondary mb-1">
                  Hash de Transacción On-Chain:
                </label>
                <input
                  type="text"
                  placeholder="0x... (deja vacío para usar o simular hash verificado)"
                  value={manualTxHash}
                  onChange={(e) => setManualTxHash(e.target.value)}
                  className={`w-full p-2.5 admin-radius-card border text-xs font-mono ${
                    isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                  }`}
                />
              </div>

              <div className="text-xs admin-text-secondary italic">
                Al confirmar, se generará el documento <code>miners/{`{minerId}`}</code> en Firestore, se registrará el crédito en el Ledger contable y se sumará la potencia a la asignación de contratos.
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t admin-border">
              <button
                onClick={() => setSettleModalItem(null)}
                className="px-3 py-1.5 admin-radius-control border text-xs font-mono"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSettle}
                className="px-4 py-1.5 admin-radius-control admin-bg-primary admin-text-primary font-semibold text-xs font-mono active:scale-[0.98] cursor-pointer"
              >
                Confirmar y Activar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ver Recibo Completo */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 admin-bg-subtle">
          <div className={`admin-card w-full max-w-lg p-6 admin-radius-card border ${
            isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b admin-border">
              <div className="flex items-center gap-2">
                <ReceiptIcon className="h-5 w-5 admin-text-accent" />
                <h3 className="font-semibold text-base">Comprobante de Pago & Conciliación</h3>
              </div>
              <button 
                onClick={() => setSelectedPayment(null)}
                className="p-1 admin-radius-control admin-text-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">ID de Orden:</span>
                <span className="font-semibold admin-text-accent">{selectedPayment.orderId}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Cliente Comprador:</span>
                <span className="font-semibold">{selectedPayment.userName} ({selectedPayment.userEmail})</span>
              </div>
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Paquete & Potencia:</span>
                <span className="font-semibold admin-text-success">
                  {selectedPayment.packageName} ({selectedPayment.contractedTh} TH/s)
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Importe USD:</span>
                <span className="font-semibold text-sm">${selectedPayment.amountUsd.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Importe Cripto / Red:</span>
                <span className="font-semibold">{selectedPayment.cryptoAmount} en {selectedPayment.paymentNetwork}</span>
              </div>
              <div className="flex flex-col py-1.5 border-b admin-border">
                <span className="admin-text-secondary mb-1">Dirección Receptora:</span>
                <span className="font-mono text-xs break-all admin-bg-surface p-2 admin-radius-card">
                  {selectedPayment.recipientAddress}
                </span>
              </div>
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
                  <span className="admin-text-secondary">Minero Digital Creado:</span>
                  <span className="font-semibold admin-text-success">{selectedPayment.activatedMinerId}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Clave de Idempotencia:</span>
                <span className="font-mono text-xs admin-text-secondary truncate max-w-[200px]">
                  {selectedPayment.idempotencyKey}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="admin-text-secondary">Confirmaciones de Red:</span>
                <span className="font-semibold admin-text-success">
                  {selectedPayment.confirmations} / {selectedPayment.requiredConfirmations}
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end pt-3 border-t admin-border">
              <button
                onClick={() => setSelectedPayment(null)}
                className="px-4 py-1.5 admin-radius-control admin-bg-surface text-xs font-mono font-semibold"
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
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/>
    <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/>
    <path d="M12 17.5v-11"/>
  </svg>
);
