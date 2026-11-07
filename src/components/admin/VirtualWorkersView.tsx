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
    <div className="minerx-admin-view space-y-6 pb-12">
      {/* HEADER & VIEW TOGGLE */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-2xl font-semibold font-sans ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>
              Workers Digitales y Ranking Unificado
            </h2>
            <span className="admin-badge px-2 py-0.5 admin-radius-control text-xs font-mono font-semibold admin-bg-success admin-text-success border admin-border">
              Motor Híbrido v2
            </span>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>
            Asignación de ganancias derivada en tiempo real de Kryptex (Spot PEARL = ${effectivePrlPrice.toFixed(2)} USD).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncWithEngine}
            disabled={isRefreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 admin-radius-control text-xs font-mono font-semibold border active:scale-[0.97] cursor-pointer ${
              isDarkTheme 
                ? ' admin-bg-surface admin-border admin-text-secondary'
                : ' admin-bg-surface admin-border admin-text-primary'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? ' animate-spin admin-text-success' : ''}`} />
            <span>Recalcular Rentabilidad</span>
          </button>

          <div className={`admin-card flex items-center p-1 admin-radius-card border ${
            isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'
          }`}>
            <button
              onClick={() => setActiveTab('workers')}
              className={`px-4 py-1.5 admin-radius-control text-xs font-mono font-semibold cursor-pointer ${
                activeTab === 'workers'
                  ? ' admin-bg-primary admin-text-primary'
                  : isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'
              }`}
            >
              Workers Virtuales ({virtualWorkers.length})
            </button>
            <button
              onClick={() => setActiveTab('ranking')}
              className={`px-4 py-1.5 admin-radius-control text-xs font-mono font-semibold cursor-pointer ${
                activeTab === 'ranking'
                  ? ' admin-bg-primary admin-text-primary'
                  : isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'
              }`}
            >
              Ranking Unificado ({ranking.length})
            </button>
          </div>
        </div>
      </div>

      {syncNotice && (
        <div className="admin-card p-3 admin-radius-card admin-bg-success border admin-border-success admin-text-success text-xs font-mono flex items-center gap-2">
          <Check className="h-4 w-4" />
          <span>{syncNotice}</span>
        </div>
      )}

      {/* KPI BANNER VIRTUAL SUMMARY */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`admin-card p-4 admin-radius-card border ${
          isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'
        }`}>
          <span className={`text-xs font-mono block ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-semibold'}`}>
            POTENCIA ACTIVA CONTRATADA
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-jetbrains font-semibold admin-text-accent">{totalAssignedTh} TH/s</span>
            <span className={`text-xs font-mono ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
              en {virtualWorkers.filter(w => w.status === 'ACTIVE').length} workers
            </span>
          </div>
        </div>

        <div className={`admin-card p-4 admin-radius-card border ${
          isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'
        }`}>
          <span className={`text-xs font-mono block ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-semibold'}`}>
            PRODUCCIÓN DIARIA TOTAL (PRL)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-jetbrains font-semibold admin-text-success">{totalDailyPrl.toFixed(4)} PRL/d</span>
            <span className={`text-xs font-mono ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
              neto clientes
            </span>
          </div>
        </div>

        <div className={`admin-card p-4 admin-radius-card border ${
          isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'
        }`}>
          <span className={`text-xs font-mono block ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-semibold'}`}>
            VALOR DIARIO ESTIMADO (USD)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-jetbrains font-semibold admin-text-warning">${totalDailyUsd.toFixed(2)} USD/d</span>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded admin-bg-success admin-text-success border admin-border-success">
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
              className={`admin-card p-6 admin-radius-card border flex flex-col justify-between ${
                isDarkTheme
                  ? ' admin-bg-surface admin-border admin-text-primary'
                  : ' admin-bg-surface admin-border admin-text-primary'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="admin-badge px-2.5 py-0.5 admin-radius-control text-xs font-mono font-semibold admin-bg-info admin-text-accent border admin-border-info flex items-center gap-1">
                    <Cpu className="h-3 w-3" />
                    WORKER DIGITAL
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-semibold admin-text-secondary">
                      {vw.status}
                    </span>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        vw.status === 'ACTIVE'
                          ? ' admin-bg-success'
                          : ' admin-bg-warning'
                      }`}
                    />
                  </div>
                </div>

                <h3 className={`text-base font-semibold font-mono ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>{vw.name}</h3>
                <div className={`text-xs font-mono mt-0.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                  Contrato: <span className="font-semibold admin-text-success">{vw.contractId}</span> · Usuario: {vw.userId}
                </div>

                <div className={`admin-card my-4 p-4 admin-radius-card border space-y-2.5 font-mono text-xs ${
                  isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>Potencia Asignada:</span>
                    <span className="font-semibold admin-text-accent text-sm">{vw.assignedTh} TH/s</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>Ganancia Diaria:</span>
                    <div className="text-right">
                      <span className="font-semibold admin-text-success block">
                        {(vw.dailyPrl || 0).toFixed(4)} PRL/d
                      </span>
                      <span className="text-xs admin-text-warning">
                        ≈ ${(vw.dailyUsd || 0).toFixed(2)} USD/d
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary'}>Tasa Efectiva:</span>
                    <span className={`font-mono font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
                      {vw.effectiveRate || '0.0008432'} PRL/TH/h
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary'}>Parámetros Motor:</span>
                    <span className="admin-text-secondary font-semibold">
                      {vw.variablePct !== undefined ? (vw.variablePct >= 0 ? `+${vw.variablePct}%` : `${vw.variablePct}%`) : '+5%'} var / -{vw.commissionPct || 2}% com
                    </span>
                  </div>

                  <div className={`pt-2 border-t flex justify-between items-center ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
                    <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-medium'}>Producción Acumulada:</span>
                    <span className="admin-text-accent font-semibold text-xs">{vw.accumulatedPrl.toFixed(2)} PRL</span>
                  </div>

                  <div className="flex justify-between items-center text-xs admin-text-secondary">
                    <span>Shares Aceptadas / Rech.:</span>
                    <span>{vw.sharesAccepted.toLocaleString()} / {vw.sharesRejected}</span>
                  </div>
                </div>
              </div>

              <div className={`pt-3 border-t flex items-center justify-between ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
                <span className={`text-xs font-mono flex items-center gap-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>
                  <ShieldCheck className="h-3 w-3 admin-text-success" />
                  <span>Kryptex Spot: <strong>${(vw.prlPriceUsd || effectivePrlPrice).toFixed(2)}</strong></span>
                </span>

                <button
                  onClick={() => handleToggleWorker(vw.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 admin-radius-control border text-xs font-mono font-semibold active:scale-[0.97] cursor-pointer ${
                    vw.status === 'ACTIVE'
                      ? isDarkTheme ? ' admin-border-warning admin-text-warning' : ' admin-border-warning admin-text-warning'
                      : isDarkTheme ? ' admin-border-success admin-text-success' : ' admin-border-success admin-text-success'
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
              <tbody className={`divide-y ${isDarkTheme ? ' divide-white/5' : ' divide-slate-100'}`}>
                {ranking.map((item) => (
                  <tr key={`${item.source}-${item.id}`} className={`${isDarkTheme ? '' : ''}`}>
                    <td className="py-3 px-3 font-semibold text-sm">
                      {item.rank === 1 ? (
                        <span className="admin-text-warning flex items-center gap-1">🥇 #1</span>
                      ) : item.rank === 2 ? (
                        <span className={`flex items-center gap-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary font-semibold'}`}>🥈 #2</span>
                      ) : item.rank === 3 ? (
                        <span className="admin-text-warning flex items-center gap-1">🥉 #3</span>
                      ) : (
                        <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-semibold'}>#{item.rank}</span>
                      )}
                    </td>
                    <td className={`py-3 px-3 font-semibold ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>{item.name}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`admin-badge px-2 py-0.5 admin-radius-control text-xs font-semibold ${
                          item.source === 'KRYPTEX_REAL'
                            ? ' admin-bg-subtle admin-text-secondary border admin-border'
                            : ' admin-bg-info admin-text-accent border admin-border-info'
                        }`}
                      >
                        {item.source === 'KRYPTEX_REAL' ? 'KRYPTEX REAL' : 'MINERX VIRTUAL'}
                      </span>
                    </td>
                    <td className={`py-3 px-3 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>{item.ownerLabel}</td>
                    <td className="py-3 px-3 font-semibold admin-text-accent">{item.hashrateTh} TH/s</td>
                    <td className="py-3 px-3 font-semibold admin-text-success">
                      {item.dailyPrl !== undefined ? `${item.dailyPrl.toFixed(4)} PRL/d` : '-'}
                      {item.dailyUsd !== undefined && (
                        <span className="text-xs admin-text-warning block font-normal">
                          ≈ ${item.dailyUsd.toFixed(2)} USD
                        </span>
                      )}
                    </td>
                    <td className={`py-3 px-3 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>{item.totalPrlProduced.toFixed(2)} PRL</td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`admin-badge px-2 py-0.5 admin-radius-control text-xs font-semibold ${
                          item.status === 'ONLINE'
                            ? ' admin-bg-success admin-text-success border admin-border-success'
                            : item.status === 'WARNING'
                            ? ' admin-bg-warning admin-text-warning border admin-border-warning'
                            : ' admin-bg-danger admin-text-danger border admin-border-danger'
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
