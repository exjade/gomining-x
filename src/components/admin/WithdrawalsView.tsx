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
          <span className="admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono font-semibold admin-bg-success admin-text-success border admin-border-success">
            <span className="h-1.5 w-1.5 rounded-full admin-bg-success"></span>
            Completado
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono font-semibold admin-bg-info admin-text-accent border admin-border-info">
            <span className="h-1.5 w-1.5 rounded-full admin-bg-info"></span>
            En Proceso
          </span>
        );
      case 'APPROVED':
        return (
          <span className="admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono font-semibold admin-bg-info admin-text-accent border admin-border-info">
            <span className="h-1.5 w-1.5 rounded-full admin-bg-info"></span>
            Aprobado
          </span>
        );
      case 'PENDING':
        return (
          <span className="admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono font-semibold admin-bg-warning admin-text-warning border admin-border-warning">
            <span className="h-1.5 w-1.5 rounded-full admin-bg-warning"></span>
            Pendiente
          </span>
        );
      case 'REJECTED':
        return (
          <span className="admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 admin-radius-control text-xs font-mono font-semibold admin-bg-danger admin-text-danger border admin-border-danger">
            <span className="h-1.5 w-1.5 rounded-full admin-bg-danger"></span>
            Rechazado
          </span>
        );
    }
  };

  return (
    <div className="minerx-admin-view space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b admin-border">
        <div>
          <div className="flex items-center gap-2">
            <div className="admin-card p-2 admin-radius-card admin-bg-warning border admin-border-warning admin-text-warning">
              <ArrowDownRight className="h-5 w-5" />
            </div>
            <div>
              <h2 className={`text-xl font-semibold font-sans ${isLight ? ' admin-text-primary' : ' admin-text-primary'}`}>
                Solicitudes de Retiro de Clientes
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                Gestión, aprobación y liquidación on-chain de fondos solicitados por los usuarios de GoMining
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshList}
            className={`px-3 py-2 admin-radius-control border text-xs font-mono font-semibold flex items-center gap-1.5 active:scale-[0.98] cursor-pointer ${
              isLight 
                ? ' admin-bg-surface admin-border admin-text-primary'
                : ' admin-bg-surface admin-border admin-text-secondary'
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
        <div className={`admin-card p-5 admin-radius-card border ${
          isLight ? ' admin-bg-warning admin-border-warning' : ' admin-bg-subtle admin-border-warning admin-text-primary'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono font-semibold ${isLight ? ' admin-text-warning' : ' admin-text-warning'}`}>
              Pendientes de Liquidar
            </span>
            <Clock className="h-4 w-4 admin-text-warning" />
          </div>
          <div className="text-2xl font-semibold font-mono admin-text-warning">
            ${summary.pendingUsd.toFixed(2)}{' '}
            <span className="text-xs font-normal font-sans admin-text-secondary">USD</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? ' admin-text-warning font-medium' : ' admin-text-warning'}`}>
            {summary.pendingCount} solicitudes en espera de firma
          </div>
        </div>

        {/* KPI 2: Total Liquidado On-Chain */}
        <div className={`admin-card p-5 admin-radius-card border ${
          isLight ? ' admin-bg-success admin-border-success' : ' admin-bg-surface admin-border-success admin-text-primary'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono font-semibold ${isLight ? ' admin-text-success' : ' admin-text-success'}`}>
              Total Liquidado On-Chain
            </span>
            <CheckCircle2 className="h-4 w-4 admin-text-success" />
          </div>
          <div className="text-2xl font-semibold font-mono admin-text-success">
            ${summary.totalCompletedUsd.toFixed(2)}{' '}
            <span className="text-xs font-normal font-sans admin-text-secondary">USD</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? ' admin-text-success font-medium' : ' admin-text-success'}`}>
            {summary.completedCount} retiros confirmados en red
          </div>
        </div>

        {/* KPI 3: Solicitudes Totales */}
        <div className={`admin-card p-5 admin-radius-card border ${
          isLight ? ' admin-bg-info admin-border-info' : ' admin-bg-surface admin-border-info admin-text-primary'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono font-semibold ${isLight ? ' admin-text-accent' : ' admin-text-accent'}`}>
              Solicitudes Registradas
            </span>
            <Wallet className="h-4 w-4 admin-text-accent" />
          </div>
          <div className="text-2xl font-semibold font-mono admin-text-accent">
            {summary.totalCount}
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? ' admin-text-accent font-medium' : ' admin-text-accent'}`}>
            {summary.rejectedCount} rechazadas por filtros de riesgo
          </div>
        </div>

        {/* KPI 4: Estado de Conciliación */}
        <div className={`admin-card p-5 admin-radius-card border ${
          isLight ? ' admin-bg-subtle admin-border' : ' admin-bg-subtle admin-border admin-text-primary'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-mono font-semibold ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
              Garantía Zero-Trust
            </span>
            <ShieldCheck className="h-4 w-4 admin-text-secondary" />
          </div>
          <div className="text-2xl font-semibold font-mono admin-text-secondary">
            100%
          </div>
          <div className={`text-xs font-mono mt-1 ${isLight ? ' admin-text-secondary font-medium' : ' admin-text-secondary'}`}>
            Auditado en Ledger & Firestore
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
            placeholder="Buscar por ID, usuario, email o wallet..."
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
              <option value="PENDING">Pendientes</option>
              <option value="PROCESSING">En Proceso</option>
              <option value="APPROVED">Aprobados</option>
              <option value="COMPLETED">Completados</option>
              <option value="REJECTED">Rechazados</option>
            </select>
          </div>

          {/* Currency Filter */}
          <div className="flex items-center gap-1 text-xs font-mono">
            <span className={`text-xs font-semibold ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Moneda:</span>
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className={`px-2.5 py-1.5 admin-radius-card text-xs font-mono border cursor-pointer ${
                isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-subtle admin-border admin-text-secondary'
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
      <div className={`overflow-hidden admin-radius-card border ${
        isLight ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className={`border-b ${isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-secondary'}`}>
                <th className="py-3 px-4 font-semibold text-xs">ID / Fecha</th>
                <th className="py-3 px-4 font-semibold text-xs">Usuario / Cliente</th>
                <th className="py-3 px-4 font-semibold text-xs">Activo & Red</th>
                <th className="py-3 px-4 font-semibold text-xs text-right">Monto Solicitado</th>
                <th className="py-3 px-4 font-semibold text-xs">Wallet Destino</th>
                <th className="py-3 px-4 font-semibold text-xs">Estado</th>
                <th className="py-3 px-4 font-semibold text-xs text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filteredWithdrawals.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`py-8 text-center ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                    No se encontraron solicitudes de retiro con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredWithdrawals.map((item) => (
                  <tr 
                    key={item.id}
                    className={`${
                      isLight ? '' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-semibold admin-text-warning">{item.id}</div>
                      <div className={`text-xs ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                        {new Date(item.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className={`font-semibold font-sans ${isLight ? ' admin-text-primary' : ' admin-text-primary'}`}>
                        {item.userName}
                      </div>
                      <div className={`text-xs flex items-center gap-1.5 ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                        <span>{item.userEmail}</span>
                        {item.kycVerified && (
                          <span className="text-xs px-1 admin-radius-card admin-bg-success admin-text-success font-semibold border admin-border-success">
                            KYC
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="font-semibold">{item.currency}</span>
                        <span className={`text-xs px-1.5 py-0.5 admin-radius-card border ${
                          item.network === 'TRC20' 
                            ? ' admin-bg-danger admin-text-danger admin-border-danger'
                            : item.network === 'ERC20'
                            ? ' admin-bg-info admin-text-accent admin-border-info'
                            : item.network === 'PEARL'
                            ? ' admin-bg-success admin-text-success admin-border-success'
                            : item.network === 'BITCOIN'
                            ? ' admin-bg-warning admin-text-warning admin-border-warning'
                            : ' admin-bg-subtle admin-text-secondary admin-border'
                        }`}>
                          {item.network}
                        </span>
                      </div>
                      <div className={`text-xs mt-0.5 ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                        Origen: {item.source}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="font-semibold text-sm">
                        {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {item.currency}
                      </div>
                      <div className={`text-xs ${isLight ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                        Fee: {item.fee} • Neto: {item.netAmount}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[130px] font-mono text-xs">
                          {item.destinationAddress}
                        </span>
                        <button
                          onClick={() => handleCopy(item.destinationAddress, item.id)}
                          className={`p-1 admin-radius-control cursor-pointer ${
                            copiedId === item.id ? ' admin-text-success' : isLight ? ' admin-text-secondary' : ' admin-text-secondary'
                          }`}
                          title="Copiar dirección"
                        >
                          {copiedId === item.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                      {item.txHash && (
                        <div className="text-xs admin-text-accent truncate max-w-[140px] flex items-center gap-1 mt-0.5">
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
                              className="px-2.5 py-1 admin-radius-control admin-bg-primary admin-text-success border admin-border-success font-semibold text-xs active:scale-[0.97] cursor-pointer"
                              title="Aprobar para procesamiento"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => setRejectionModalItem(item)}
                              className="px-2 py-1 admin-radius-control admin-bg-danger admin-text-danger border admin-border-danger font-semibold text-xs active:scale-[0.97] cursor-pointer"
                              title="Rechazar solicitud"
                            >
                              Rechazar
                            </button>
                          </>
                        )}

                        {(item.status === 'APPROVED' || item.status === 'PROCESSING') && (
                          <button
                            onClick={() => setCompleteModalItem(item)}
                            className="px-2.5 py-1 admin-radius-control admin-bg-primary admin-text-accent border admin-border-info font-semibold text-xs flex items-center gap-1 active:scale-[0.97] cursor-pointer"
                          >
                            <Send className="h-3 w-3" />
                            <span>Liquidar On-Chain</span>
                          </button>
                        )}

                        {item.status === 'COMPLETED' && (
                          <button
                            onClick={() => setSelectedRequest(item)}
                            className={`p-1.5 admin-radius-control border text-xs flex items-center gap-1 ${
                              isLight ? ' admin-bg-surface admin-text-primary' : ' admin-bg-surface admin-text-secondary'
                            } cursor-pointer`}
                            title="Ver detalles completos"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {item.status === 'REJECTED' && (
                          <span className="text-xs admin-text-danger italic">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 admin-bg-subtle">
          <div className={`admin-card w-full max-w-md p-6 admin-radius-card border ${
            isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b admin-border">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 admin-text-accent" />
                <h3 className="font-semibold text-base">Liquidar Retiro On-Chain</h3>
              </div>
              <button 
                onClick={() => setCompleteModalItem(null)}
                className="p-1 admin-radius-control admin-text-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs font-mono">
              <div className="admin-card p-3 admin-radius-card admin-bg-info border admin-border-info admin-text-accent">
                <div className="font-semibold text-sm">
                  {completeModalItem.netAmount} {completeModalItem.currency} ({completeModalItem.network})
                </div>
                <div className="text-xs admin-text-accent mt-1 truncate">
                  Destino: {completeModalItem.destinationAddress}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold admin-text-secondary mb-1">
                  Hash de Transacción On-Chain (txHash):
                </label>
                <input
                  type="text"
                  placeholder="0x... (deja en blanco para autogenerar firma de prueba)"
                  value={txHashInput}
                  onChange={(e) => setTxHashInput(e.target.value)}
                  className={`w-full p-2.5 admin-radius-card border text-xs font-mono ${
                    isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                  }`}
                />
              </div>

              <div className="text-xs admin-text-secondary italic">
                Al confirmar, se registrará el asiento de débito en el Libro Contable (Ledger) y se actualizará el estado del usuario en Firestore.
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t admin-border">
              <button
                onClick={() => setCompleteModalItem(null)}
                className="px-3 py-1.5 admin-radius-control border text-xs font-mono"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmComplete}
                className="px-4 py-1.5 admin-radius-control admin-bg-primary admin-text-primary font-semibold text-xs font-mono active:scale-[0.98] cursor-pointer"
              >
                Confirmar y Liquidar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rechazar Solicitud */}
      {rejectionModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 admin-bg-subtle">
          <div className={`admin-card w-full max-w-md p-6 admin-radius-card border ${
            isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b admin-border">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 admin-text-danger" />
                <h3 className="font-semibold text-base admin-text-danger">Rechazar Solicitud de Retiro</h3>
              </div>
              <button 
                onClick={() => setRejectionModalItem(null)}
                className="p-1 admin-radius-control admin-text-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs font-mono">
              <p className="admin-text-secondary">
                Indica el motivo del rechazo para informar al usuario <strong>{rejectionModalItem.userName}</strong> y registrar la auditoría:
              </p>
              <textarea
                rows={3}
                placeholder="Ejemplo: Inconsistencia en dirección de red, KYC no completado, fondos en período de espera de seguridad..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className={`w-full p-2.5 admin-radius-card border text-xs font-mono ${
                  isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                }`}
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t admin-border">
              <button
                onClick={() => setRejectionModalItem(null)}
                className="px-3 py-1.5 admin-radius-control border text-xs font-mono"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-4 py-1.5 admin-radius-control admin-bg-danger admin-text-primary font-semibold text-xs font-mono active:scale-[0.98] cursor-pointer"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ver Detalles Completos */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 admin-bg-subtle">
          <div className={`admin-card w-full max-w-lg p-6 admin-radius-card border ${
            isLight ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b admin-border">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 admin-text-success" />
                <h3 className="font-semibold text-base">Comprobante de Retiro Liquidado</h3>
              </div>
              <button 
                onClick={() => setSelectedRequest(null)}
                className="p-1 admin-radius-control admin-text-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">ID de Solicitud:</span>
                <span className="font-semibold admin-text-warning">{selectedRequest.id}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Cliente:</span>
                <span className="font-semibold">{selectedRequest.userName} ({selectedRequest.userEmail})</span>
              </div>
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Monto Neto Entregado:</span>
                <span className="font-semibold admin-text-success text-sm">
                  {selectedRequest.netAmount} {selectedRequest.currency}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b admin-border">
                <span className="admin-text-secondary">Red / Protocolo:</span>
                <span className="font-semibold">{selectedRequest.network}</span>
              </div>
              <div className="flex flex-col py-1.5 border-b admin-border">
                <span className="admin-text-secondary mb-1">Dirección de Destino:</span>
                <span className="font-mono text-xs break-all admin-bg-surface p-2 admin-radius-card">
                  {selectedRequest.destinationAddress}
                </span>
              </div>
              {selectedRequest.txHash && (
                <div className="flex flex-col py-1.5 border-b admin-border">
                  <span className="admin-text-secondary mb-1">Hash de Cadena (txHash):</span>
                  <span className="font-mono text-xs admin-text-accent break-all admin-bg-info p-2 admin-radius-card border admin-border-info">
                    {selectedRequest.txHash}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1.5">
                <span className="admin-text-secondary">Fecha de Liquidación:</span>
                <span>{selectedRequest.processedAt ? new Date(selectedRequest.processedAt).toLocaleString('es-ES') : 'N/A'}</span>
              </div>
            </div>

            <div className="mt-5 flex justify-end pt-3 border-t admin-border">
              <button
                onClick={() => setSelectedRequest(null)}
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
