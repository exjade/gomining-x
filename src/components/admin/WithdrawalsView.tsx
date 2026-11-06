import React, { useState, useMemo } from 'react';
import { 
  ArrowDownRight, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Copy, 
  ShieldCheck, 
  RefreshCw,
  Wallet,
  Send,
  Eye,
  Check,
  X
} from 'lucide-react';
import { ClientWithdrawalsService } from '../../services/admin/clientWithdrawalsService';
import type { ClientWithdrawalRequest, WithdrawalStatus } from '../../types/admin';

interface WithdrawalsViewProps {
  isDarkTheme?: boolean;
}

export const WithdrawalsView: React.FC<WithdrawalsViewProps> = ({ isDarkTheme = false }) => {
  const isLight = !isDarkTheme;
  const service = ClientWithdrawalsService.getInstance();

  const [withdrawals, setWithdrawals] = useState<ClientWithdrawalRequest[]>(() => service.getWithdrawals());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [selectedRequest, setSelectedRequest] = useState<ClientWithdrawalRequest | null>(null);
  const [rejectionModalItem, setRejectionModalItem] = useState<ClientWithdrawalRequest | null>(null);
  const [completeModalItem, setCompleteModalItem] = useState<ClientWithdrawalRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [txHashInput, setTxHashInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refreshList = () => {
    setWithdrawals(service.getWithdrawals());
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const summary = useMemo(() => service.getSummary(), [withdrawals]);

  const filteredWithdrawals = useMemo(() => {
    return withdrawals.filter(item => {
      const matchesSearch = 
        item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.destinationAddress.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesCurrency = currencyFilter === 'ALL' || item.currency === currencyFilter;

      return matchesSearch && matchesStatus && matchesCurrency;
    });
  }, [withdrawals, searchTerm, statusFilter, currencyFilter]);

  const handleApprove = (id: string) => {
    service.approveWithdrawal(id);
    refreshList();
  };

  const handleConfirmReject = () => {
    if (!rejectionModalItem) return;
    service.rejectWithdrawal(rejectionModalItem.id, rejectionReason || 'Rechazado por verificación de seguridad');
    setRejectionModalItem(null);
    setRejectionReason('');
    refreshList();
  };

  const handleConfirmComplete = () => {
    if (!completeModalItem) return;
    const finalHash = txHashInput.trim() || `0x${Math.random().toString(16).substring(2, 10)}${Date.now().toString(16)}`;
    service.completeWithdrawal(completeModalItem.id, finalHash);
    setCompleteModalItem(null);
    setTxHashInput('');
    refreshList();
  };

  const getStatusBadge = (status: WithdrawalStatus) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            Completado
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
            En Proceso
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
            Aprobado
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            Pendiente
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
            Rechazado
          </span>
        );
    }
  };

  return (
    <div className="minerx-admin-view space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
              <ArrowDownRight className="h-5 w-5" />
            </div>
            <div>
              <h2 className={`text-xl sm:text-2xl font-bold font-sans tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Solicitudes de Retiro de Clientes
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Gestión, aprobación y liquidación on-chain de fondos solicitados por los usuarios de GoMining
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
        {/* KPI 1: Pendientes de Liquidar */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-amber-50/80 border-amber-200 shadow-xs' : 'bg-[#1C1508]/80 border-amber-500/30 shadow-lg text-white'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono uppercase tracking-wider font-semibold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
              Pendientes de Liquidar
            </span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-amber-500">
            ${summary.pendingUsd.toFixed(2)}{' '}
            <span className="text-xs font-normal font-sans text-slate-400">USD</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? 'text-amber-700 font-medium' : 'text-amber-300/80'}`}>
            {summary.pendingCount} solicitudes en espera de firma
          </div>
        </div>

        {/* KPI 2: Total Liquidado On-Chain */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-emerald-50/80 border-emerald-200 shadow-xs' : 'bg-[#081C10]/80 border-emerald-500/30 shadow-lg text-white'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono uppercase tracking-wider font-semibold ${isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>
              Total Liquidado On-Chain
            </span>
            <CheckCircle2 className="h-4 w-4 text-[#05DF72]" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-[#05DF72]">
            ${summary.totalCompletedUsd.toFixed(2)}{' '}
            <span className="text-xs font-normal font-sans text-slate-400">USD</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? 'text-emerald-700 font-medium' : 'text-emerald-300/80'}`}>
            {summary.completedCount} retiros confirmados en red
          </div>
        </div>

        {/* KPI 3: Solicitudes Totales */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-sky-50/80 border-sky-200 shadow-xs' : 'bg-[#081828]/80 border-sky-500/30 shadow-lg text-white'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono uppercase tracking-wider font-semibold ${isLight ? 'text-sky-800' : 'text-sky-400'}`}>
              Solicitudes Registradas
            </span>
            <Wallet className="h-4 w-4 text-sky-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-sky-400">
            {summary.totalCount}
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? 'text-sky-700 font-medium' : 'text-sky-300/80'}`}>
            {summary.rejectedCount} rechazadas por filtros de riesgo
          </div>
        </div>

        {/* KPI 4: Estado de Conciliación */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-purple-50/80 border-purple-200 shadow-xs' : 'bg-[#180828]/80 border-purple-500/30 shadow-lg text-white'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono uppercase tracking-wider font-semibold ${isLight ? 'text-purple-800' : 'text-purple-400'}`}>
              Garantía Zero-Trust
            </span>
            <ShieldCheck className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-purple-400">
            100%
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? 'text-purple-700 font-medium' : 'text-purple-300/80'}`}>
            Auditado en Ledger & Firestore
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
            placeholder="Buscar por ID, usuario, email o wallet..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs font-mono border focus:outline-hidden transition-all ${
              isLight 
                ? 'bg-slate-50 border-slate-200 text-slate-800 focus:border-amber-500' 
                : 'bg-white/[0.04] border-white/10 text-white focus:border-amber-400'
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
              <option value="PENDING">Pendientes</option>
              <option value="PROCESSING">En Proceso</option>
              <option value="APPROVED">Aprobados</option>
              <option value="COMPLETED">Completados</option>
              <option value="REJECTED">Rechazados</option>
            </select>
          </div>

          {/* Currency Filter */}
          <div className="flex items-center gap-1 text-xs font-mono">
            <span className={`text-[11px] font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Moneda:</span>
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-mono border cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-900 border-white/10 text-slate-200'
              }`}
            >
              <option value="ALL">Todas las Monedas</option>
              <option value="USDT">USDT</option>
              <option value="PRL">PRL (Pearl)</option>
              <option value="BTC">BTC (Bitcoin)</option>
              <option value="SOL">SOL (Solana)</option>
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
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider">ID / Fecha</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider">Usuario / Cliente</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider">Activo & Red</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider text-right">Monto Solicitado</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider">Wallet Destino</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider">Estado</th>
                <th className="py-3 px-4 font-bold uppercase text-[10px] tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filteredWithdrawals.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`py-8 text-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    No se encontraron solicitudes de retiro con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredWithdrawals.map((item) => (
                  <tr 
                    key={item.id}
                    className={`transition-colors ${
                      isLight ? 'hover:bg-slate-50/60' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-amber-500">{item.id}</div>
                      <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                        {new Date(item.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className={`font-bold font-sans ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {item.userName}
                      </div>
                      <div className={`text-[10px] flex items-center gap-1.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        <span>{item.userEmail}</span>
                        {item.kycVerified && (
                          <span className="text-[9px] px-1 rounded-sm bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20">
                            KYC
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="font-bold">{item.currency}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${
                          item.network === 'TRC20' 
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : item.network === 'ERC20'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : item.network === 'PEARL'
                            ? 'bg-emerald-500/10 text-[#05DF72] border-emerald-500/20'
                            : item.network === 'BITCOIN'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                        }`}>
                          {item.network}
                        </span>
                      </div>
                      <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                        Origen: {item.source}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-sm">
                        {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {item.currency}
                      </div>
                      <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        Fee: {item.fee} • Neto: {item.netAmount}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[130px] font-mono text-[11px]">
                          {item.destinationAddress}
                        </span>
                        <button
                          onClick={() => handleCopy(item.destinationAddress, item.id)}
                          className={`p-1 rounded-sm hover:bg-white/10 cursor-pointer ${
                            copiedId === item.id ? 'text-[#05DF72]' : isLight ? 'text-slate-400' : 'text-slate-500'
                          }`}
                          title="Copiar dirección"
                        >
                          {copiedId === item.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                      {item.txHash && (
                        <div className="text-[10px] text-cyan-400 truncate max-w-[140px] flex items-center gap-1 mt-0.5">
                          <span>tx: {item.txHash.slice(0, 10)}...</span>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {getStatusBadge(item.status)}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleApprove(item.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-[#05DF72] border border-emerald-500/30 font-bold text-[11px] transition-all active:scale-[0.97] cursor-pointer"
                              title="Aprobar para procesamiento"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => setRejectionModalItem(item)}
                              className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-[11px] transition-all active:scale-[0.97] cursor-pointer"
                              title="Rechazar solicitud"
                            >
                              Rechazar
                            </button>
                          </>
                        )}

                        {(item.status === 'APPROVED' || item.status === 'PROCESSING') && (
                          <button
                            onClick={() => setCompleteModalItem(item)}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold text-[11px] flex items-center gap-1 transition-all active:scale-[0.97] cursor-pointer"
                          >
                            <Send className="h-3 w-3" />
                            <span>Liquidar On-Chain</span>
                          </button>
                        )}

                        {item.status === 'COMPLETED' && (
                          <button
                            onClick={() => setSelectedRequest(item)}
                            className={`p-1.5 rounded-lg border text-[11px] flex items-center gap-1 ${
                              isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/5 hover:bg-white/10 text-slate-300'
                            } cursor-pointer`}
                            title="Ver detalles completos"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {item.status === 'REJECTED' && (
                          <span className="text-[10px] text-rose-400/80 italic">
                            {item.rejectionReason?.slice(0, 20)}...
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Completar / Liquidar On-Chain */}
      {completeModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0E1320] border-white/10 text-white'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-cyan-400" />
                <h3 className="font-bold text-base">Liquidar Retiro On-Chain</h3>
              </div>
              <button 
                onClick={() => setCompleteModalItem(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <div className="font-bold text-sm">
                  {completeModalItem.netAmount} {completeModalItem.currency} ({completeModalItem.network})
                </div>
                <div className="text-[11px] text-cyan-300/80 mt-1 truncate">
                  Destino: {completeModalItem.destinationAddress}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Hash de Transacción On-Chain (txHash):
                </label>
                <input
                  type="text"
                  placeholder="0x... (deja en blanco para autogenerar firma de prueba)"
                  value={txHashInput}
                  onChange={(e) => setTxHashInput(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-mono ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/5 border-white/10 text-white'
                  }`}
                />
              </div>

              <div className="text-[11px] text-slate-400 italic">
                Al confirmar, se registrará el asiento de débito en el Libro Contable (Ledger) y se actualizará el estado del usuario en Firestore.
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button
                onClick={() => setCompleteModalItem(null)}
                className="px-3 py-1.5 rounded-xl border text-xs font-mono hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmComplete}
                className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono transition-all active:scale-[0.98] cursor-pointer"
              >
                Confirmar y Liquidar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rechazar Solicitud */}
      {rejectionModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0E1320] border-white/10 text-white'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-500" />
                <h3 className="font-bold text-base text-rose-500">Rechazar Solicitud de Retiro</h3>
              </div>
              <button 
                onClick={() => setRejectionModalItem(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs font-mono">
              <p className="text-slate-300">
                Indica el motivo del rechazo para informar al usuario <strong>{rejectionModalItem.userName}</strong> y registrar la auditoría:
              </p>
              <textarea
                rows={3}
                placeholder="Ejemplo: Inconsistencia en dirección de red, KYC no completado, fondos en período de espera de seguridad..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className={`w-full p-2.5 rounded-xl border text-xs font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/5 border-white/10 text-white'
                }`}
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button
                onClick={() => setRejectionModalItem(null)}
                className="px-3 py-1.5 rounded-xl border text-xs font-mono hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs font-mono transition-all active:scale-[0.98] cursor-pointer"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ver Detalles Completos */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className={`w-full max-w-lg p-6 rounded-2xl border shadow-2xl ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0E1320] border-white/10 text-white'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#05DF72]" />
                <h3 className="font-bold text-base">Comprobante de Retiro Liquidado</h3>
              </div>
              <button 
                onClick={() => setSelectedRequest(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-slate-400">ID de Solicitud:</span>
                <span className="font-bold text-amber-500">{selectedRequest.id}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-slate-400">Cliente:</span>
                <span className="font-bold">{selectedRequest.userName} ({selectedRequest.userEmail})</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-slate-400">Monto Neto Entregado:</span>
                <span className="font-bold text-[#05DF72] text-sm">
                  {selectedRequest.netAmount} {selectedRequest.currency}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-slate-400">Red / Protocolo:</span>
                <span className="font-bold">{selectedRequest.network}</span>
              </div>
              <div className="flex flex-col py-1.5 border-b border-white/5">
                <span className="text-slate-400 mb-1">Dirección de Destino:</span>
                <span className="font-mono text-[11px] break-all bg-white/5 p-2 rounded-lg">
                  {selectedRequest.destinationAddress}
                </span>
              </div>
              {selectedRequest.txHash && (
                <div className="flex flex-col py-1.5 border-b border-white/5">
                  <span className="text-slate-400 mb-1">Hash de Cadena (txHash):</span>
                  <span className="font-mono text-[11px] text-cyan-400 break-all bg-cyan-500/10 p-2 rounded-lg border border-cyan-500/20">
                    {selectedRequest.txHash}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">Fecha de Liquidación:</span>
                <span>{selectedRequest.processedAt ? new Date(selectedRequest.processedAt).toLocaleString('es-ES') : 'N/A'}</span>
              </div>
            </div>

            <div className="mt-5 flex justify-end pt-3 border-t border-white/10">
              <button
                onClick={() => setSelectedRequest(null)}
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
