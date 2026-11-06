import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause,
  RefreshCw,
  Cpu,
  ShieldCheck,
  Check
} from 'lucide-react';
import { VirtualWorkerService } from '../../services/admin/virtualWorkerService';
import { UnifiedRankingService } from '../../services/admin/unifiedRankingService';
import { MinerxProfitEngine } from '../../services/admin/minerxProfitEngine';
import type { VirtualWorker, UnifiedRankingItem } from '../../types/admin';
import type { MergedGPUWorker } from '../../types/minerx';

interface VirtualWorkersViewProps {
  realWorkers?: MergedGPUWorker[];
  isDarkTheme?: boolean;
}

export const VirtualWorkersView: React.FC<VirtualWorkersViewProps> = ({
  realWorkers = [],
  isDarkTheme = true
}) => {
  const virtualWorkerService = VirtualWorkerService.getInstance();
  const rankingService = UnifiedRankingService.getInstance();
  const profitEngine = MinerxProfitEngine.getInstance();

  const [virtualWorkers, setVirtualWorkers] = useState<VirtualWorker[]>(virtualWorkerService.getVirtualWorkers());
  const [ranking, setRanking] = useState<UnifiedRankingItem[]>([]);
  const [activeTab, setActiveTab] = useState<'workers' | 'ranking'>('workers');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const globalConfig = profitEngine.getGlobalConfig();
  const effectivePrlPrice = globalConfig.prlManualOverridePrice ?? globalConfig.prlPriceUsd;

  const refreshAll = () => {
    setIsRefreshing(true);
    const list = virtualWorkerService.getVirtualWorkers();
    setVirtualWorkers(list);
    setRanking(rankingService.getUnifiedRanking(realWorkers));
    setTimeout(() => {
      setIsRefreshing(false);
    }, 400);
  };

  useEffect(() => {
    refreshAll();
  }, [realWorkers]);

  const handleToggleWorker = (id: string) => {
    virtualWorkerService.toggleWorkerStatus(id);
    refreshAll();
  };

  const handleSyncWithEngine = async () => {
    setIsRefreshing(true);
    await profitEngine.syncLiveKryptexRates();
    refreshAll();
    setSyncNotice('¡Ganancias recalculadas en vivo con cotización de Kryptex!');
    setTimeout(() => setSyncNotice(null), 3500);
  };

  // Resumen de producción total de workers virtuales
  const totalAssignedTh = virtualWorkers.reduce((acc, w) => acc + (w.status === 'ACTIVE' ? w.assignedTh : 0), 0);
  const totalDailyPrl = virtualWorkers.reduce((acc, w) => acc + (w.status === 'ACTIVE' ? (w.dailyPrl || 0) : 0), 0);
  const totalDailyUsd = virtualWorkers.reduce((acc, w) => acc + (w.status === 'ACTIVE' ? (w.dailyUsd || 0) : 0), 0);

  return (
    <div className="minerx-admin-view space-y-6 animate-in fade-in duration-300 pb-12">
      {/* HEADER & VIEW TOGGLE */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Workers Digitales y Ranking Unificado
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30">
              Motor Híbrido v2
            </span>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Asignación de ganancias derivada en tiempo real de Kryptex (Spot PEARL = ${effectivePrlPrice.toFixed(2)} USD).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncWithEngine}
            disabled={isRefreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border active:scale-[0.97] cursor-pointer ${
              isDarkTheme 
                ? 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white hover:bg-white/10' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-[#05DF72]' : ''}`} />
            <span>Recalcular Rentabilidad</span>
          </button>

          <div className={`flex items-center p-1 rounded-2xl border ${
            isDarkTheme ? 'bg-white/[0.04] border-white/10' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setActiveTab('workers')}
              className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTab === 'workers'
                  ? 'bg-[#05DF72] text-slate-950 shadow-md'
                  : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Workers Virtuales ({virtualWorkers.length})
            </button>
            <button
              onClick={() => setActiveTab('ranking')}
              className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTab === 'ranking'
                  ? 'bg-[#05DF72] text-slate-950 shadow-md'
                  : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ranking Unificado ({ranking.length})
            </button>
          </div>
        </div>
      </div>

      {syncNotice && (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono flex items-center gap-2">
          <Check className="h-4 w-4" />
          <span>{syncNotice}</span>
        </div>
      )}

      {/* KPI BANNER VIRTUAL SUMMARY */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`p-4 rounded-2xl border ${
          isDarkTheme ? 'bg-[#0E1320]/80 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <span className={`text-[11px] font-mono block ${isDarkTheme ? 'text-slate-400' : 'text-slate-500 font-semibold'}`}>
            POTENCIA ACTIVA CONTRATADA
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-jetbrains font-bold text-cyan-400">{totalAssignedTh} TH/s</span>
            <span className={`text-xs font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              en {virtualWorkers.filter(w => w.status === 'ACTIVE').length} workers
            </span>
          </div>
        </div>

        <div className={`p-4 rounded-2xl border ${
          isDarkTheme ? 'bg-[#0E1320]/80 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <span className={`text-[11px] font-mono block ${isDarkTheme ? 'text-slate-400' : 'text-slate-500 font-semibold'}`}>
            PRODUCCIÓN DIARIA TOTAL (PRL)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-jetbrains font-bold text-[#05DF72]">{totalDailyPrl.toFixed(4)} PRL/d</span>
            <span className={`text-xs font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              neto clientes
            </span>
          </div>
        </div>

        <div className={`p-4 rounded-2xl border ${
          isDarkTheme ? 'bg-[#0E1320]/80 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <span className={`text-[11px] font-mono block ${isDarkTheme ? 'text-slate-400' : 'text-slate-500 font-semibold'}`}>
            VALOR DIARIO ESTIMADO (USD)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-jetbrains font-bold text-amber-400">${totalDailyUsd.toFixed(2)} USD/d</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              @ ${effectivePrlPrice.toFixed(2)} Spot
            </span>
          </div>
        </div>
      </div>

      {/* 1. WORKERS VIRTUALES TAB */}
      {activeTab === 'workers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {virtualWorkers.map((vw) => (
            <div
              key={vw.id}
              className={`p-6 rounded-3xl border flex flex-col justify-between transition-all ${
                isDarkTheme
                  ? 'bg-[#0E1320]/80 border-white/[0.08] backdrop-blur-xl text-white shadow-lg'
                  : 'bg-white border-slate-200 text-slate-900 shadow-sm'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1">
                    <Cpu className="h-3 w-3" />
                    WORKER DIGITAL
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-semibold uppercase text-slate-400">
                      {vw.status}
                    </span>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        vw.status === 'ACTIVE'
                          ? 'bg-[#05DF72] shadow-[0_0_8px_#05DF72]'
                          : 'bg-amber-500'
                      }`}
                    />
                  </div>
                </div>

                <h3 className={`text-base font-bold font-mono tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{vw.name}</h3>
                <div className={`text-[11px] font-mono mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                  Contrato: <span className="font-semibold text-[#05DF72]">{vw.contractId}</span> · Usuario: {vw.userId}
                </div>

                <div className={`my-4 p-4 rounded-2xl border space-y-2.5 font-mono text-xs ${
                  isDarkTheme ? 'bg-white/[0.03] border-white/5' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Potencia Asignada:</span>
                    <span className="font-bold text-cyan-400 text-sm">{vw.assignedTh} TH/s</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Ganancia Diaria:</span>
                    <div className="text-right">
                      <span className="font-bold text-[#05DF72] block">
                        {(vw.dailyPrl || 0).toFixed(4)} PRL/d
                      </span>
                      <span className="text-[10px] text-amber-400">
                        ≈ ${(vw.dailyUsd || 0).toFixed(2)} USD/d
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[11px]">
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>Tasa Efectiva:</span>
                    <span className={`font-mono font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                      {vw.effectiveRate || '0.0008432'} PRL/TH/h
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[11px]">
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>Parámetros Motor:</span>
                    <span className="text-purple-400 font-bold">
                      {vw.variablePct !== undefined ? (vw.variablePct >= 0 ? `+${vw.variablePct}%` : `${vw.variablePct}%`) : '+5%'} var / -{vw.commissionPct || 2}% com
                    </span>
                  </div>

                  <div className={`pt-2 border-t flex justify-between items-center ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Producción Acumulada:</span>
                    <span className="text-cyan-400 font-bold text-xs">{vw.accumulatedPrl.toFixed(2)} PRL</span>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>Shares Aceptadas / Rech.:</span>
                    <span>{vw.sharesAccepted.toLocaleString()} / {vw.sharesRejected}</span>
                  </div>
                </div>
              </div>

              <div className={`pt-3 border-t flex items-center justify-between ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>
                <span className={`text-[10px] font-mono flex items-center gap-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                  <ShieldCheck className="h-3 w-3 text-[#05DF72]" />
                  <span>Kryptex Spot: <strong>${(vw.prlPriceUsd || effectivePrlPrice).toFixed(2)}</strong></span>
                </span>

                <button
                  onClick={() => handleToggleWorker(vw.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
                    vw.status === 'ACTIVE'
                      ? isDarkTheme ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-amber-400 text-amber-700 hover:bg-amber-50'
                      : isDarkTheme ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' : 'border-emerald-400 text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  {vw.status === 'ACTIVE' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {vw.status === 'ACTIVE' ? 'Pausar' : 'Reanudar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. RANKING UNIFICADO TAB */}
      {activeTab === 'ranking' && (
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
                  <th className="py-3 px-3">POS</th>
                  <th className="py-3 px-3">WORKER / IDENTIFICADOR</th>
                  <th className="py-3 px-3">ORIGEN DE DATOS</th>
                  <th className="py-3 px-3">PROPIETARIO</th>
                  <th className="py-3 px-3">HASHRATE</th>
                  <th className="py-3 px-3">RENDIMIENTO DIARIO</th>
                  <th className="py-3 px-3">PRODUCCIÓN PRL ACUM.</th>
                  <th className="py-3 px-3 text-right">ESTADO</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkTheme ? 'divide-white/5' : 'divide-slate-100'}`}>
                {ranking.map((item) => (
                  <tr key={`${item.source}-${item.id}`} className={`transition-colors ${isDarkTheme ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'}`}>
                    <td className="py-3 px-3 font-bold text-sm">
                      {item.rank === 1 ? (
                        <span className="text-yellow-400 flex items-center gap-1">🥇 #1</span>
                      ) : item.rank === 2 ? (
                        <span className={`flex items-center gap-1 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700 font-bold'}`}>🥈 #2</span>
                      ) : item.rank === 3 ? (
                        <span className="text-amber-600 flex items-center gap-1">🥉 #3</span>
                      ) : (
                        <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-bold'}>#{item.rank}</span>
                      )}
                    </td>
                    <td className={`py-3 px-3 font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{item.name}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.source === 'KRYPTEX_REAL'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                        }`}
                      >
                        {item.source === 'KRYPTEX_REAL' ? 'KRYPTEX REAL' : 'MINERX VIRTUAL'}
                      </span>
                    </td>
                    <td className={`py-3 px-3 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>{item.ownerLabel}</td>
                    <td className="py-3 px-3 font-bold text-cyan-400">{item.hashrateTh} TH/s</td>
                    <td className="py-3 px-3 font-bold text-[#05DF72]">
                      {item.dailyPrl !== undefined ? `${item.dailyPrl.toFixed(4)} PRL/d` : '-'}
                      {item.dailyUsd !== undefined && (
                        <span className="text-[10px] text-amber-400 block font-normal">
                          ≈ ${item.dailyUsd.toFixed(2)} USD
                        </span>
                      )}
                    </td>
                    <td className={`py-3 px-3 ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>{item.totalPrlProduced.toFixed(2)} PRL</td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.status === 'ONLINE'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : item.status === 'WARNING'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
