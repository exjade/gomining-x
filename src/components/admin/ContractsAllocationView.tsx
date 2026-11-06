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
    <div className="minerx-admin-view space-y-6 animate-in fade-in duration-300 pb-12">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
            Control de Contratos y Asignación Centralizada de Potencia
          </h2>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Gestión de potencia contratada vs asignada con garantía de respaldo físico verificable.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={refreshContractsFromFirestore}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
              isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
            title="Sincronizar mineros y contratos adquiridos por clientes desde Cloud Firestore (/admin_contracts)"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-[#05DF72]' : 'text-slate-400'}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Firestore'}</span>
          </button>

          {/* Global Capacity Gauge Input */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>Capacidad de Respaldo:</span>
            <input
              type="number"
              step="50"
              value={backedCapacity}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                setBackedCapacity(val);
                setSummary(allocationService.getAllocationSummary(val));
              }}
              className={`w-28 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border focus:outline-none focus:border-[#05DF72] ${
                isDarkTheme ? 'bg-[#0E1320] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
              }`}
            />
            <span className="text-xs font-mono font-bold text-cyan-400">TH/s</span>
          </div>
        </div>
      </div>

      {/* OVERALLOCATION OR WARNING ALERT */}
      {summary.isOverallocated && (
        <div className="p-4 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-400 font-mono text-xs">
          <ShieldAlert className="h-5 w-5 shrink-0 animate-pulse text-rose-500" />
          <div>
            <strong className="block font-bold">SOBREASIGNACIÓN DETECTADA:</strong>
            Potencia asignada ({summary.totalAllocatedTh} TH/s) supera la capacidad respaldada ({summary.totalBackedCapacityTh} TH/s). Reduce asignaciones para garantizar solidez financiera.
          </div>
        </div>
      )}

      {/* CAPACITY STATUS SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`p-4 rounded-2xl border ${isDarkTheme ? 'bg-[#0E1320]/80 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'}`}>
          <span className={`text-[11px] font-mono font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>POTENCIA CONTRATADA</span>
          <div className={`text-2xl font-bold font-mono mt-1 ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{summary.totalContractedTh} TH/s</div>
        </div>
        <div className={`p-4 rounded-2xl border ${isDarkTheme ? 'bg-[#0E1320]/80 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'}`}>
          <span className={`text-[11px] font-mono font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>POTENCIA ASIGNADA</span>
          <div className="text-2xl font-bold font-mono text-[#05DF72] mt-1">{summary.totalAllocatedTh} TH/s</div>
        </div>
        <div className={`p-4 rounded-2xl border ${isDarkTheme ? 'bg-[#0E1320]/80 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'}`}>
          <span className={`text-[11px] font-mono font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>CAPACIDAD DISPONIBLE</span>
          <div className="text-2xl font-bold font-mono text-cyan-500 mt-1">{summary.availableCapacityTh} TH/s</div>
        </div>
        <div className={`p-4 rounded-2xl border ${isDarkTheme ? 'bg-[#0E1320]/80 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'}`}>
          <span className={`text-[11px] font-mono font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>TASA DE UTILIZACIÓN</span>
          <div className="text-2xl font-bold font-mono text-[#F59E0B] mt-1">{summary.utilizationRatePct}%</div>
        </div>
      </div>

      {/* SEARCH AND FILTER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className={`absolute left-3.5 top-2.5 h-4 w-4 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
          <input
            type="text"
            placeholder="Buscar por ID de contrato, usuario o paquete..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-2xl text-xs font-mono border focus:outline-none focus:border-[#05DF72] ${
              isDarkTheme ? 'bg-[#0E1320] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
            }`}
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`px-3 py-2 rounded-2xl text-xs font-mono border focus:outline-none ${
              isDarkTheme ? 'bg-[#0E1320] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
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
        className={`p-6 rounded-3xl border transition-all ${
          isDarkTheme
            ? 'bg-[#0E1320]/80 border-white/[0.08] backdrop-blur-xl text-white'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className={`border-b text-[11px] ${
                isDarkTheme ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-700 font-bold'
              }`}>
                <th className="py-3 px-3">CONTRATO / USUARIO</th>
                <th className="py-3 px-3">PAQUETE</th>
                <th className="py-3 px-3">POTENCIA CONTRATADA</th>
                <th className="py-3 px-3">ASIGNACIÓN CENTRALIZADA</th>
                <th className="py-3 px-3">ESTADO</th>
                <th className="py-3 px-3 text-right">ACCIONES</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkTheme ? 'divide-white/5' : 'divide-slate-100'}`}>
              {filteredContracts.map((ctr) => (
                <tr key={ctr.id} className={`transition-colors ${isDarkTheme ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'}`}>
                  <td className="py-3 px-3">
                    <div className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{ctr.id}</div>
                    <div className={`text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{ctr.userEmail}</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-bold text-cyan-500">{ctr.packageName}</span>
                    <div className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>Worker: {ctr.workerId || 'Auto'}</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{ctr.contractedTh} TH/s</span>
                    <div className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>${ctr.pricePaidUsdt} USDT</div>
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
                        className="w-32 accent-[#05DF72] cursor-pointer"
                      />
                      <span className="font-bold text-[#05DF72] min-w-[65px]">
                        {ctr.allocatedTh} / {ctr.contractedTh} TH
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        ctr.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : ctr.status === 'PARTIALLY_ALLOCATED'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {ctr.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => handleToggleStatus(ctr.id, ctr.status)}
                      className={`p-1.5 rounded-xl border text-xs font-mono transition-all active:scale-[0.97] cursor-pointer ${
                        ctr.status === 'ACTIVE'
                          ? isDarkTheme ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-amber-400 text-amber-700 hover:bg-amber-50'
                          : isDarkTheme ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' : 'border-emerald-400 text-emerald-700 hover:bg-emerald-50'
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
