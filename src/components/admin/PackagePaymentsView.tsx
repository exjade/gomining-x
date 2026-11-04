import React, { useState, useMemo } from 'react';
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

  const refreshList = () => {
    setPayments(service.getPayments());
  };

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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            Liquidado & Minero Activo
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
            Confirmando en Bloque
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            Esperando Depósito
          </span>
        );
      case 'UNDERPAID':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
            Pago Incompleto
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
            Cotización Caducada
          </span>
        );
      case 'REVERSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Revertido
          </span>
        );
    }
  };

  const getNetworkBadge = (network: PackageOrderPayment['paymentNetwork']) => {
    switch (network) {
      case 'TRON':
        return <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">TRON TRC20</span>;
      case 'ETHEREUM':
        return <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">ETH ERC20</span>;
      case 'SOLANA':
        return <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">SOLANA</span>;
      case 'BITCOIN':
        return <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">BITCOIN</span>;
      case 'POLYGON':
        return <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">POLYGON</span>;
      case 'BRIDGE_SPEI':
        return <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">PUENTE SPEI</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[#05DF72]">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h2 className={`text-xl sm:text-2xl font-bold font-sans tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Pagos de Paquetes Comprados
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Verificación on-chain de órdenes de compra, pagos en criptoactivos y activación automática de mineros
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshList}
            className={`px-3 py-2 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer ${
              isLight 
                ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-xs' 
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-200'
            }`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Volumen Facturado */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-emerald-50/80 border-emerald-200 shadow-xs' : 'bg-[#081C10]/80 border-emerald-500/30 shadow-lg text-white'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono uppercase tracking-wider font-semibold ${isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>
              Volumen Total Facturado
            </span>
            <DollarSign className="h-4 w-4 text-[#05DF72]" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-[#05DF72]">
            ${summary.totalVolumeUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}{' '}
            <span className="text-xs font-normal font-sans text-slate-400">USD</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? 'text-emerald-700 font-medium' : 'text-emerald-300/80'}`}>
            {summary.settledCount} órdenes liquidadas con éxito
          </div>
        </div>

        {/* KPI 2: Potencia TH/s Vendida */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-cyan-50/80 border-cyan-200 shadow-xs' : 'bg-[#081828]/80 border-cyan-500/30 shadow-lg text-white'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono uppercase tracking-wider font-semibold ${isLight ? 'text-cyan-800' : 'text-cyan-400'}`}>
              Potencia Total Vendida
            </span>
            <Zap className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-cyan-400">
            {summary.totalThSold}{' '}
            <span className="text-xs font-normal font-sans text-slate-400">TH/s</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? 'text-cyan-700 font-medium' : 'text-cyan-300/80'}`}>
            Asignada a mineros digitales activos
          </div>
        </div>

        {/* KPI 3: Órdenes Pendientes de Confirmación */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-amber-50/80 border-amber-200 shadow-xs' : 'bg-[#1C1508]/80 border-amber-500/30 shadow-lg text-white'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono uppercase tracking-wider font-semibold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
              En Verificación On-Chain
            </span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-amber-500">
            {summary.pendingCount}
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? 'text-amber-700 font-medium' : 'text-amber-300/80'}`}>
            Acumulando confirmaciones de red
          </div>
        </div>

        {/* KPI 4: Caducadas / Expiradas */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-slate-50/80 border-slate-200 shadow-xs' : 'bg-[#101420]/80 border-white/[0.08] shadow-lg text-white'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono uppercase tracking-wider font-semibold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Cotizaciones Expiradas
            </span>
            <Package className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight">
            {summary.expiredCount}
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Superaron TTL de 30 minutos
          </div>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-3 ${
        isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0E1320]/80 border-white/[0.08]'
      }`}>
        <div className="relative w-full md:w-80">
          <Search className={`absolute left-3 top-2.5 h-4 w-4 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
          <input
            type="text"
            placeholder="Buscar por ID orden, cliente, paquete o txHash..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs font-mono border focus:outline-hidden transition-all ${
              isLight 
                ? 'bg-slate-50 border-slate-200 text-slate-800 focus:border-emerald-500' 
                : 'bg-white/[0.04] border-white/10 text-white focus:border-emerald-400'
            }`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1 text-xs font-mono">
            <span className={`text-[11px] font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Estado:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-mono border cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-900 border-white/10 text-slate-200'
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
            <span className={`text-[11px] font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Red / Método:</span>
            <select
              value={networkFilter}
              onChange={(e) => setNetworkFilter(e.target.value)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-mono border cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-900 border-white/10 text-slate-200'
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
      <div className={`overflow-hidden rounded-2xl border ${
        isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0E1320]/80 border-white/[0.08]'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className={`border-b ${isLight ? 'bg-slate-50/80 border-slate-200 text-slate-700' : 'bg-white/[0.02] border-white/[0.06] text-slate-400'}`}>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider">Orden / Fecha</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider">Cliente</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider">Paquete / Potencia</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider text-right">Importe Facturado</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider">Red & Confirmaciones</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider">Estado</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`py-8 text-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    No se encontraron pagos u órdenes con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((item) => (
                  <tr 
                    key={item.orderId}
                    className={`transition-colors ${
                      isLight ? 'hover:bg-slate-50/60' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-cyan-400">{item.orderId}</div>
                      <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                        {new Date(item.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className={`font-bold font-sans ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {item.userName}
                      </div>
                      <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {item.userEmail}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold">{item.packageName}</div>
                      <div className="text-[10px] text-[#05DF72] font-semibold flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        <span>{item.contractedTh} TH/s de Potencia</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-sm text-[#05DF72]">
                        ${item.amountUsd.toFixed(2)} USD
                      </div>
                      <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {item.cryptoAmount}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 mb-1">
                        {getNetworkBadge(item.paymentNetwork)}
                      </div>
                      <div className={`text-[10px] flex items-center gap-1.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        <span>Bloques: {item.confirmations}/{item.requiredConfirmations}</span>
                        {item.confirmations >= item.requiredConfirmations && (
                          <CheckCircle2 className="h-3 w-3 text-[#05DF72]" />
                        )}
                      </div>
                      {item.txHash && (
                        <div className="text-[9px] text-cyan-400 truncate max-w-[120px]">
                          tx: {item.txHash.slice(0, 10)}...
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {getStatusBadge(item.status)}
                      {item.activatedMinerId && (
                        <div className="text-[10px] text-[#05DF72] mt-0.5 flex items-center gap-1">
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
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-[#05DF72] border border-emerald-500/30 font-bold text-[11px] transition-all active:scale-[0.97] cursor-pointer"
                            title="Verificar y activar minero"
                          >
                            Activar Minero
                          </button>
                        )}

                        <button
                          onClick={() => setSelectedPayment(item)}
                          className={`p-1.5 rounded-lg border text-[11px] flex items-center gap-1 ${
                            isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/5 hover:bg-white/10 text-slate-300'
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0E1320] border-white/10 text-white'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#05DF72]" />
                <h3 className="font-bold text-base">Liquidar Orden y Activar Minero</h3>
              </div>
              <button 
                onClick={() => setSettleModalItem(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[#05DF72]">
                <div className="font-bold text-sm">
                  {settleModalItem.packageName} — {settleModalItem.contractedTh} TH/s
                </div>
                <div className="text-[11px] text-emerald-400/80 mt-1">
                  Cliente: {settleModalItem.userName} (${settleModalItem.amountUsd.toFixed(2)} USD)
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Hash de Transacción On-Chain:
                </label>
                <input
                  type="text"
                  placeholder="0x... (deja vacío para usar o simular hash verificado)"
                  value={manualTxHash}
                  onChange={(e) => setManualTxHash(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-mono ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/5 border-white/10 text-white'
                  }`}
                />
              </div>

              <div className="text-[11px] text-slate-400 italic">
                Al confirmar, se generará el documento <code>miners/{`{minerId}`}</code> en Firestore, se registrará el crédito en el Ledger contable y se sumará la potencia a la asignación de contratos.
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button
                onClick={() => setSettleModalItem(null)}
                className="px-3 py-1.5 rounded-xl border text-xs font-mono hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSettle}
                className="px-4 py-1.5 rounded-xl bg-[#05DF72] hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono transition-all active:scale-[0.98] cursor-pointer"
              >
                Confirmar y Activar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ver Recibo Completo */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className={`w-full max-w-lg p-6 rounded-2xl border shadow-2xl ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0E1320] border-white/10 text-white'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <ReceiptIcon className="h-5 w-5 text-cyan-400" />
                <h3 className="font-bold text-base">Comprobante de Pago & Conciliación</h3>
              </div>
              <button 
                onClick={() => setSelectedPayment(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-slate-400">ID de Orden:</span>
                <span className="font-bold text-cyan-400">{selectedPayment.orderId}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-slate-400">Cliente Comprador:</span>
                <span className="font-bold">{selectedPayment.userName} ({selectedPayment.userEmail})</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-slate-400">Paquete & Potencia:</span>
                <span className="font-bold text-[#05DF72]">
                  {selectedPayment.packageName} ({selectedPayment.contractedTh} TH/s)
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-slate-400">Importe USD:</span>
                <span className="font-bold text-sm">${selectedPayment.amountUsd.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-slate-400">Importe Cripto / Red:</span>
                <span className="font-bold">{selectedPayment.cryptoAmount} en {selectedPayment.paymentNetwork}</span>
              </div>
              <div className="flex flex-col py-1.5 border-b border-white/5">
                <span className="text-slate-400 mb-1">Dirección Receptora:</span>
                <span className="font-mono text-[11px] break-all bg-white/5 p-2 rounded-lg">
                  {selectedPayment.recipientAddress}
                </span>
              </div>
              {selectedPayment.txHash && (
                <div className="flex flex-col py-1.5 border-b border-white/5">
                  <span className="text-slate-400 mb-1">Hash de Depósito On-Chain:</span>
                  <span className="font-mono text-[11px] text-cyan-400 break-all bg-cyan-500/10 p-2 rounded-lg border border-cyan-500/20">
                    {selectedPayment.txHash}
                  </span>
                </div>
              )}
              {selectedPayment.activatedMinerId && (
                <div className="flex justify-between py-1.5 border-b border-white/5">
                  <span className="text-slate-400">Minero Digital Creado:</span>
                  <span className="font-bold text-[#05DF72]">{selectedPayment.activatedMinerId}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-slate-400">Clave de Idempotencia:</span>
                <span className="font-mono text-[10px] text-slate-400 truncate max-w-[200px]">
                  {selectedPayment.idempotencyKey}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">Confirmaciones de Red:</span>
                <span className="font-bold text-[#05DF72]">
                  {selectedPayment.confirmations} / {selectedPayment.requiredConfirmations}
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end pt-3 border-t border-white/10">
              <button
                onClick={() => setSelectedPayment(null)}
                className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-mono font-bold"
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
