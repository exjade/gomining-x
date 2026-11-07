import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Search, 
  Play, 
  Pause,
  RefreshCw
} from 'lucide-react';
import { HashrateAllocationService } from '../../services/admin/hashrateAllocationService';
import type { MiningContract, AllocationSummary, ContractStatus } from '../../types/admin';

interface ContractsAllocationViewProps {
  isDarkTheme?: boolean;
}

export const ContractsAllocationView: React.FC<ContractsAllocationViewProps> = ({
  isDarkTheme = true
}) => {
  const allocationService = HashrateAllocationService.getInstance();
  const [contracts, setContracts] = useState<MiningContract[]>(allocationService.getContracts());
  const [backedCapacity, setBackedCapacity] = useState<number>(1000);
  const [summary, setSummary] = useState<AllocationSummary>(allocationService.getAllocationSummary(1000));
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refreshContractsFromFirestore = async () => {
    setIsSyncing(true);
    try {
      const updated = await allocationService.fetchFirestoreContracts();
      setContracts(updated);
      setSummary(allocationService.getAllocationSummary(backedCapacity));
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    refreshContractsFromFirestore();
    const unsubscribe = allocationService.subscribeToFirestoreContracts((updated) => {
      setContracts(updated);
      setSummary(allocationService.getAllocationSummary(backedCapacity));
    });
    return () => {
      unsubscribe();
    };
  }, [backedCapacity]);

  const handleUpdateAllocation = (contractId: string, val: number) => {
    allocationService.updateContractAllocation(contractId, val, 'Ajuste manual de potencia');
    const updated = allocationService.getContracts();
    setContracts(updated);
    setSummary(allocationService.getAllocationSummary(backedCapacity));
  };

  const handleToggleStatus = (contractId: string, currentStatus: ContractStatus) => {
    const nextStatus: ContractStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    allocationService.updateContractStatus(contractId, nextStatus, 'Cambio de estado administrativo');
    const updated = allocationService.getContracts();
    setContracts(updated);
    setSummary(allocationService.getAllocationSummary(backedCapacity));
  };

  const filteredContracts = contracts.filter((c) => {
    const matchesSearch = c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.packageName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="minerx-admin-view space-y-6 pb-12">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-semibold font-sans ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>
            Control de Contratos y Asignación Centralizada de Potencia
          </h2>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>
            Gestión de potencia contratada vs asignada con garantía de respaldo físico verificable.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={refreshContractsFromFirestore}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-2 admin-radius-control border text-xs font-mono font-semibold active:scale-[0.97] cursor-pointer ${
              isDarkTheme ? ' admin-bg-surface admin-border admin-text-secondary' : ' admin-bg-surface admin-border admin-text-primary'
            }`}
            title="Sincronizar mineros y contratos adquiridos por clientes desde Cloud Firestore (/admin_contracts)"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? ' animate-spin admin-text-success' : ' admin-text-secondary'}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Firestore'}</span>
          </button>

          {/* Global Capacity Gauge Input */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Capacidad de Respaldo:</span>
            <input
              type="number"
              step="50"
              value={backedCapacity}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                setBackedCapacity(val);
                setSummary(allocationService.getAllocationSummary(val));
              }}
              className={`w-28 px-3 py-1.5 admin-radius-card text-xs font-mono font-semibold border ${
                isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
              }`}
            />
            <span className="text-xs font-mono font-semibold admin-text-accent">TH/s</span>
          </div>
        </div>
      </div>

      {/* OVERALLOCATION OR WARNING ALERT */}
      {summary.isOverallocated && (
        <div className="admin-card p-4 admin-radius-card admin-bg-danger border admin-border-danger flex items-center gap-3 admin-text-danger font-mono text-xs">
          <ShieldAlert className="h-5 w-5 shrink-0 admin-text-danger" />
          <div>
            <strong className="block font-semibold">SOBREASIGNACIÓN DETECTADA:</strong>
            Potencia asignada ({summary.totalAllocatedTh} TH/s) supera la capacidad respaldada ({summary.totalBackedCapacityTh} TH/s). Reduce asignaciones para garantizar solidez financiera.
          </div>
        </div>
      )}

      {/* CAPACITY STATUS SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`admin-card p-4 admin-radius-card border ${isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'}`}>
          <span className={`text-xs font-mono font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>POTENCIA CONTRATADA</span>
          <div className={`text-2xl font-semibold font-mono mt-1 ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>{summary.totalContractedTh} TH/s</div>
        </div>
        <div className={`admin-card p-4 admin-radius-card border ${isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'}`}>
          <span className={`text-xs font-mono font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>POTENCIA ASIGNADA</span>
          <div className="text-2xl font-semibold font-mono admin-text-success mt-1">{summary.totalAllocatedTh} TH/s</div>
        </div>
        <div className={`admin-card p-4 admin-radius-card border ${isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'}`}>
          <span className={`text-xs font-mono font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>CAPACIDAD DISPONIBLE</span>
          <div className="text-2xl font-semibold font-mono admin-text-accent mt-1">{summary.availableCapacityTh} TH/s</div>
        </div>
        <div className={`admin-card p-4 admin-radius-card border ${isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'}`}>
          <span className={`text-xs font-mono font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>TASA DE UTILIZACIÓN</span>
          <div className="text-2xl font-semibold font-mono admin-text-secondary mt-1">{summary.utilizationRatePct}%</div>
        </div>
      </div>

      {/* SEARCH AND FILTER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className={`absolute left-3.5 top-2.5 h-4 w-4 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
          <input
            type="text"
            placeholder="Buscar por ID de contrato, usuario o paquete..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 admin-radius-card text-xs font-mono border ${
              isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
            }`}
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`px-3 py-2 admin-radius-card text-xs font-mono border ${
              isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
            }`}
          >
            <option value="ALL">Todos los Estados</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="PARTIALLY_ALLOCATED">PARTIALLY_ALLOCATED</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </div>
      </div>

      {/* CONTRACTS TABLE */}
      <div
        className={`admin-card p-6 admin-radius-card border ${
          isDarkTheme
            ? ' admin-bg-surface admin-border admin-text-primary'
            : ' admin-bg-surface admin-border admin-text-primary'
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className={`border-b text-xs ${
                isDarkTheme ? ' admin-border admin-text-secondary' : ' admin-border admin-text-primary font-semibold'
              }`}>
                <th className="py-3 px-3">CONTRATO / USUARIO</th>
                <th className="py-3 px-3">PAQUETE</th>
                <th className="py-3 px-3">POTENCIA CONTRATADA</th>
                <th className="py-3 px-3">ASIGNACIÓN CENTRALIZADA</th>
                <th className="py-3 px-3">ESTADO</th>
                <th className="py-3 px-3 text-right">ACCIONES</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkTheme ? ' divide-white/5' : ' divide-slate-100'}`}>
              {filteredContracts.map((ctr) => (
                <tr key={ctr.id} className={`${isDarkTheme ? '' : ''}`}>
                  <td className="py-3 px-3">
                    <div className={`font-semibold ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>{ctr.id}</div>
                    <div className={`text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>{ctr.userEmail}</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-semibold admin-text-accent">{ctr.packageName}</span>
                    <div className={`text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Worker: {ctr.workerId || 'Auto'}</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`font-semibold ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>{ctr.contractedTh} TH/s</span>
                    <div className={`text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>${ctr.pricePaidUsdt} USDT</div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max={ctr.contractedTh}
                        step="1"
                        value={ctr.allocatedTh}
                        onChange={(e) => handleUpdateAllocation(ctr.id, parseInt(e.target.value) || 0)}
                        className="w-32 admin-accent-range cursor-pointer"
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
                      onClick={() => handleToggleStatus(ctr.id, ctr.status)}
                      className={`p-1.5 admin-radius-control border text-xs font-mono active:scale-[0.97] cursor-pointer ${
                        ctr.status === 'ACTIVE'
                          ? isDarkTheme ? ' admin-border-warning admin-text-warning' : ' admin-border-warning admin-text-warning'
                          : isDarkTheme ? ' admin-border-success admin-text-success' : ' admin-border-success admin-text-success'
                      }`}
                      title={ctr.status === 'ACTIVE' ? 'Suspender Contrato' : 'Reanudar Contrato'}
                    >
                      {ctr.status === 'ACTIVE' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
