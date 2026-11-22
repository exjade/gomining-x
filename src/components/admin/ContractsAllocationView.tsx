import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  Search,
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  X,
} from 'lucide-react';
import { HashrateAllocationService } from '../../services/admin/hashrateAllocationService';
import type { MiningContract, ContractStatus } from '../../types/admin';

interface ContractsAllocationViewProps {
  isDarkTheme?: boolean;
}

export const ContractsAllocationView: React.FC<ContractsAllocationViewProps> = ({
  isDarkTheme = true,
}) => {
  const allocationService = HashrateAllocationService.getInstance();
  const [contracts, setContracts] = useState<MiningContract[]>(() => allocationService.getContracts());
  const [backedCapacity, setBackedCapacity] = useState<number>(1000);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [savingContractId, setSavingContractId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshContractsFromFirestore = useCallback(async () => {
    setIsSyncing(true);
    try {
      const updated = await allocationService.fetchFirestoreContracts();
      setContracts(updated);
    } catch (err: any) {
      setActionError(err?.message || 'Error al sincronizar contratos desde Firestore.');
    } finally {
      setIsSyncing(false);
    }
  }, [allocationService]);

  useEffect(() => {
    let cancelled = false;
    setIsSyncing(true);
    allocationService
      .fetchFirestoreContracts()
      .then((updated) => {
        if (!cancelled) setContracts(updated);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsSyncing(false);
      });

    const unsubscribe = allocationService.subscribeToFirestoreContracts((updated) => {
      if (!cancelled) setContracts(updated);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [allocationService]);

  const summary = useMemo(
    () => allocationService.getAllocationSummary(backedCapacity, contracts),
    [allocationService, backedCapacity, contracts]
  );

  const handleUpdateAllocation = async (contractId: string, val: number) => {
    setSavingContractId(contractId);
    setActionError(null);
    try {
      const updated = await allocationService.updateContractAllocation(
        contractId,
        val,
        'Ajuste manual de potencia'
      );
      setContracts((prev) => prev.map((c) => (c.id === contractId ? updated : c)));
    } catch (err: any) {
      setActionError(
        `No se pudo actualizar la asignación de ${contractId}: ${err?.message || 'Error del servidor'}`
      );
    } finally {
      setSavingContractId(null);
    }
  };

  const handleToggleStatus = async (contractId: string, currentStatus: ContractStatus) => {
    const nextStatus: ContractStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setSavingContractId(contractId);
    setActionError(null);
    try {
      const updated = await allocationService.updateContractStatus(
        contractId,
        nextStatus,
        'Cambio de estado administrativo'
      );
      setContracts((prev) => prev.map((c) => (c.id === contractId ? updated : c)));
    } catch (err: any) {
      setActionError(
        `No se pudo cambiar el estado de ${contractId}: ${err?.message || 'Error del servidor'}`
      );
    } finally {
      setSavingContractId(null);
    }
  };

  const filteredContracts = useMemo(() => {
    const queryLower = searchTerm.trim().toLowerCase();
    return contracts.filter((c) => {
      const matchesSearch =
        !queryLower ||
        c.id.toLowerCase().includes(queryLower) ||
        c.userEmail.toLowerCase().includes(queryLower) ||
        c.packageName.toLowerCase().includes(queryLower) ||
        (c.orderId && c.orderId.toLowerCase().includes(queryLower)) ||
        (c.activatedMinerId && c.activatedMinerId.toLowerCase().includes(queryLower));
      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contracts, searchTerm, statusFilter]);

  return (
    <div className="minerx-admin-view space-y-6 pb-12">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold font-sans admin-text-primary">
            Control de Contratos y Asignación Centralizada de Potencia
          </h2>
          <p
            className={`text-xs font-mono mt-1 ${
              isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'
            }`}
          >
            Gestión server-authoritative de contratos (/api/admin/contracts) con trazabilidad de orden y minero.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void refreshContractsFromFirestore()}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-2 admin-radius-control border text-xs font-mono font-semibold active:scale-[0.97] cursor-pointer ${
              isDarkTheme
                ? ' admin-bg-surface admin-border admin-text-secondary'
                : ' admin-bg-surface admin-border admin-text-primary'
            }`}
            title="Sincronizar mineros y contratos adquiridos por clientes desde Cloud Firestore (/admin_contracts)"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                isSyncing ? ' animate-spin admin-text-success' : ' admin-text-secondary'
              }`}
            />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Firestore'}</span>
          </button>

          {/* Global Capacity Gauge Input */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold admin-text-secondary">
              Capacidad de Respaldo:
            </span>
            <input
              type="number"
              step="50"
              value={backedCapacity}
              onChange={(e) => setBackedCapacity(parseInt(e.target.value, 10) || 0)}
              className="w-28 px-3 py-1.5 admin-radius-card text-xs font-mono font-semibold border admin-bg-surface admin-border admin-text-primary"
            />
            <span className="text-xs font-mono font-semibold admin-text-accent">TH/s</span>
          </div>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="admin-card p-3 admin-radius-card admin-bg-danger border admin-border-danger flex items-center justify-between gap-3 admin-text-danger font-mono text-xs"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="p-1 admin-radius-control cursor-pointer"
            aria-label="Cerrar error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* OVERALLOCATION OR WARNING ALERT */}
      {summary.isOverallocated && (
        <div className="admin-card p-4 admin-radius-card admin-bg-danger border admin-border-danger flex items-center gap-3 admin-text-danger font-mono text-xs">
          <ShieldAlert className="h-5 w-5 shrink-0 admin-text-danger" />
          <div>
            <strong className="block font-semibold">SOBREASIGNACIÓN DETECTADA:</strong>
            Potencia asignada ({summary.totalAllocatedTh} TH/s) supera la capacidad respaldada (
            {summary.totalBackedCapacityTh} TH/s). Reduce asignaciones para garantizar solidez
            financiera.
          </div>
        </div>
      )}

      {/* CAPACITY STATUS SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="admin-card p-4 admin-radius-card border admin-bg-surface admin-border admin-text-primary">
          <span className="text-xs font-mono font-semibold admin-text-secondary">
            POTENCIA CONTRATADA
          </span>
          <div className="text-2xl font-semibold font-mono mt-1 admin-text-primary">
            {summary.totalContractedTh} TH/s
          </div>
        </div>
        <div className="admin-card p-4 admin-radius-card border admin-bg-surface admin-border admin-text-primary">
          <span className="text-xs font-mono font-semibold admin-text-secondary">
            POTENCIA ASIGNADA
          </span>
          <div className="text-2xl font-semibold font-mono admin-text-success mt-1">
            {summary.totalAllocatedTh} TH/s
          </div>
        </div>
        <div className="admin-card p-4 admin-radius-card border admin-bg-surface admin-border admin-text-primary">
          <span className="text-xs font-mono font-semibold admin-text-secondary">
            CAPACIDAD DISPONIBLE
          </span>
          <div className="text-2xl font-semibold font-mono admin-text-accent mt-1">
            {summary.availableCapacityTh} TH/s
          </div>
        </div>
        <div className="admin-card p-4 admin-radius-card border admin-bg-surface admin-border admin-text-primary">
          <span className="text-xs font-mono font-semibold admin-text-secondary">
            TASA DE UTILIZACIÓN
          </span>
          <div className="text-2xl font-semibold font-mono admin-text-secondary mt-1">
            {summary.utilizationRatePct}%
          </div>
        </div>
      </div>

      {/* SEARCH AND FILTER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 admin-text-secondary" />
          <input
            type="text"
            placeholder="Buscar por contrato, orden, minero, usuario o paquete..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 admin-radius-card text-xs font-mono border admin-bg-surface admin-border admin-text-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 admin-radius-card text-xs font-mono border admin-bg-surface admin-border admin-text-primary"
          >
            <option value="ALL">Todos los Estados</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="PARTIALLY_ALLOCATED">PARTIALLY_ALLOCATED</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </div>
      </div>

      {/* CONTRACTS TABLE */}
      <div className="admin-card p-6 admin-radius-card border admin-bg-surface admin-border admin-text-primary">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr
                className={`border-b text-xs ${
                  isDarkTheme
                    ? ' admin-border admin-text-secondary'
                    : ' admin-border admin-text-primary font-semibold'
                }`}
              >
                <th className="py-3 px-3">CONTRATO / USUARIO</th>
                <th className="py-3 px-3">TRAZABILIDAD (ORDEN / MINERO)</th>
                <th className="py-3 px-3">PAQUETE</th>
                <th className="py-3 px-3">POTENCIA CONTRATADA</th>
                <th className="py-3 px-3">ASIGNACIÓN CENTRALIZADA</th>
                <th className="py-3 px-3">ESTADO</th>
                <th className="py-3 px-3 text-right">ACCIONES</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkTheme ? ' divide-white/5' : ' divide-slate-100'}`}>
              {filteredContracts.map((ctr) => {
                const isSaving = savingContractId === ctr.id;
                return (
                  <tr key={ctr.id}>
                    <td className="py-3 px-3">
                      <div className="font-semibold admin-text-primary">{ctr.id}</div>
                      <div className="text-xs admin-text-secondary">{ctr.userEmail}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-xs admin-text-accent">
                        Orden: <span className="font-semibold">{ctr.orderId || '—'}</span>
                      </div>
                      <div className="text-xs admin-text-success">
                        Minero: <span className="font-semibold">{ctr.activatedMinerId || '—'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold admin-text-accent">{ctr.packageName}</span>
                      <div className="text-xs admin-text-secondary">
                        Worker: {ctr.workerId || 'Auto'}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold admin-text-primary">
                        {ctr.contractedTh} TH/s
                      </span>
                      <div className="text-xs admin-text-secondary font-medium">
                        ${ctr.pricePaidUsdt} USDT
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max={ctr.contractedTh}
                          step="1"
                          disabled={isSaving}
                          value={ctr.allocatedTh}
                          onChange={(e) =>
                            void handleUpdateAllocation(ctr.id, parseInt(e.target.value, 10) || 0)
                          }
                          className="w-32 admin-accent-range cursor-pointer disabled:opacity-50"
                        />
                        <span className="font-semibold admin-text-success min-w-[65px]">
                          {ctr.allocatedTh} / {ctr.contractedTh} TH
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`admin-badge px-2 py-0.5 admin-radius-control text-xs font-semibold ${
                          ctr.status === 'ACTIVE'
                            ? ' admin-bg-success admin-text-success border admin-border-success'
                            : ctr.status === 'PARTIALLY_ALLOCATED'
                            ? ' admin-bg-warning admin-text-warning border admin-border-warning'
                            : ' admin-bg-danger admin-text-danger border admin-border-danger'
                        }`}
                      >
                        {ctr.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => void handleToggleStatus(ctr.id, ctr.status)}
                        className={`p-1.5 admin-radius-control border text-xs font-mono active:scale-[0.97] cursor-pointer disabled:opacity-50 ${
                          ctr.status === 'ACTIVE'
                            ? ' admin-border-warning admin-text-warning'
                            : ' admin-border-success admin-text-success'
                        }`}
                        title={ctr.status === 'ACTIVE' ? 'Suspender Contrato' : 'Reanudar Contrato'}
                      >
                        {ctr.status === 'ACTIVE' ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
