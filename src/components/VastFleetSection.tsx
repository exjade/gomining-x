import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiConfig';
import {
  Server,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Square,
  Trash2,
  Cpu,
  X,
  Plus
} from 'lucide-react';
import type { GpuInstance } from '../types/vast';
import { resolveGpuBenchmark } from '../data/gpuBenchmarks';

interface VastFleetSectionProps {
  onNavigateToMarketplace?: () => void;
}

export const VastFleetSection: React.FC<VastFleetSectionProps> = ({ onNavigateToMarketplace }) => {
  const [instances, setInstances] = useState<GpuInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Quick Simulation Modal
  const [showSimModal, setShowSimModal] = useState(false);
  const [simGpuModel, setSimGpuModel] = useState('RTX 4090');
  const [simHourlyCost, setSimHourlyCost] = useState(0.48);
  const [simHashrate, setSimHashrate] = useState(310);

  const fetchInstances = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/vast/instances');
      if (res.ok) {
        const data = await res.json();
        setInstances(data.instances || []);
      }
    } catch (err: any) {
      console.warn('[VastFleet] Error fetching instances:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstances();
    const interval = setInterval(fetchInstances, 15000);
    return () => clearInterval(interval);
  }, [fetchInstances]);

  const handleAction = async (instanceId: string, action: 'stop' | 'stop-miner' | 'delete' | 'sync') => {
    setActionLoading((prev) => ({ ...prev, [instanceId]: true }));
    setActionMessage(null);
    try {
      let res: Response;
      if (action === 'stop') {
        res = await apiFetch(`/api/vast/instances/${encodeURIComponent(instanceId)}/stop`, { method: 'POST' });
      } else if (action === 'stop-miner') {
        res = await apiFetch(`/api/vast/instances/${encodeURIComponent(instanceId)}/stop-miner`, { method: 'POST' });
      } else if (action === 'delete') {
        res = await apiFetch(`/api/vast/instances/${encodeURIComponent(instanceId)}`, { method: 'DELETE' });
      } else {
        res = await apiFetch('/api/vast/instances/sync', { method: 'POST' });
      }

      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({ text: data.message || `Acción '${action}' ejecutada correctamente`, type: 'success' });
        await fetchInstances();
      } else {
        setActionMessage({ text: data.message || 'Error al ejecutar la acción', type: 'error' });
      }
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Error de comunicación', type: 'error' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [instanceId]: false }));
      setConfirmDeleteId(null);
    }
  };

  const handleCreateSimulated = async () => {
    try {
      const res = await apiFetch('/api/vast/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerOfferId: `sim-offer-${Date.now().toString().slice(-5)}`,
          gpuModel: simGpuModel,
          gpuCount: 1,
          gpuMemoryGB: 24,
          hourlyComputeCostUSD: Number(simHourlyCost),
          hourlyStorageCostUSD: 0.015,
          initialStatus: 'RUNNING'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowSimModal(false);
        setActionMessage({ text: `Instancia simulada creada: ${data.instance.workerName}`, type: 'success' });
        await fetchInstances();
      }
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Error al crear instancia', type: 'error' });
    }
  };

  // Metrics
  const activeInstances = instances.filter((i) => i.status !== 'TERMINATED');
  const runningCount = instances.filter((i) => i.status === 'RUNNING' || i.status === 'MEASURING').length;
  const underperformingCount = instances.filter((i) => i.status === 'UNDERPERFORMING').length;
  const totalHashrateTHs = instances.reduce((acc, i) => acc + (i.lastHashrateTHs || 0), 0);
  const totalSpendPerHourUSD = activeInstances.reduce((acc, i) => acc + (i.estimatedHourlyCostUSD || 0), 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RUNNING':
      case 'QUALIFIED':
        return <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-mono-num font-bold">● {status}</span>;
      case 'WARMUP':
      case 'PROVISIONING':
      case 'STARTING':
        return <span className="bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded text-[10px] font-mono-num font-bold animate-pulse">⏳ {status}</span>;
      case 'UNDERPERFORMING':
        return <span className="bg-rose-500/15 border border-rose-500/30 text-rose-400 px-2 py-0.5 rounded text-[10px] font-mono-num font-bold">⚠️ BAJO RENDIMIENTO</span>;
      case 'STOPPED':
      case 'INSTANCE_STOPPING':
        return <span className="bg-slate-700/30 border border-slate-600 text-slate-300 px-2 py-0.5 rounded text-[10px] font-mono-num">⏹ {status}</span>;
      case 'TERMINATED':
        return <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded text-[10px] font-mono-num">✕ DESTRUIDA</span>;
      default:
        return <span className="bg-white/10 text-slate-300 px-2 py-0.5 rounded text-[10px] font-mono-num">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & KPIs */}
      <div className="fintech-card rounded-2xl p-5 border border-white/[0.08] shadow-xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-gradient-to-br from-cyan-500/10 to-blue-500/0 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-400 shadow-inner">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display-title text-base font-bold text-white tracking-wide">
                  Flota de Instancias Vast.ai
                </h3>
                <span className="flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono-num font-semibold text-cyan-400 border border-cyan-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  API Oficial v0
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Control de ciclo de vida de instancias, verificación post-acción y sincronización con Kryptex Stratum
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleAction('all', 'sync')}
              disabled={loading}
              className="bg-[#080B12] hover:bg-white/[0.05] text-cyan-400 rounded-xl px-3 py-2 border border-cyan-500/30 text-xs font-mono-num font-semibold flex items-center gap-1.5 transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Sincronizar Telemetría</span>
            </button>

            <button
              onClick={() => setShowSimModal(true)}
              className="bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-cyan-500/30 text-emerald-300 rounded-xl px-3 py-2 border border-emerald-500/30 text-xs font-mono-num font-semibold flex items-center gap-1.5 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+ Instancia Simulada</span>
            </button>
          </div>
        </div>

        {actionMessage && (
          <div
            className={`mt-3 p-3 rounded-xl border text-xs font-mono-num flex items-center justify-between animate-in fade-in ${
              actionMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-400" />
              )}
              <span>{actionMessage.text}</span>
            </div>
            <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Vast KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-[#080B12] rounded-xl p-3 border border-white/[0.06]">
            <span className="text-[10px] text-slate-400 font-mono-num uppercase block">Instancias Totales</span>
            <span className="font-display-title text-xl font-bold text-white">{instances.length}</span>
            <span className="text-[10px] text-slate-500 block font-mono-num mt-0.5">
              {activeInstances.length} activas{underperformingCount > 0 ? ` (${underperformingCount} bajo rendimiento)` : ''}
            </span>
          </div>

          <div className="bg-[#080B12] rounded-xl p-3 border border-white/[0.06]">
            <span className="text-[10px] text-slate-400 font-mono-num uppercase block">Minando en Vivo</span>
            <span className="font-display-title text-xl font-bold text-emerald-400">{runningCount}</span>
            <span className="text-[10px] text-slate-500 block font-mono-num mt-0.5">GPUs operativas</span>
          </div>

          <div className="bg-[#080B12] rounded-xl p-3 border border-white/[0.06]">
            <span className="text-[10px] text-slate-400 font-mono-num uppercase block">Potencia Vast.ai</span>
            <span className="font-display-title text-xl font-bold text-[#05F292]">{totalHashrateTHs.toFixed(1)} <span className="text-xs">TH/s</span></span>
            <span className="text-[10px] text-slate-500 block font-mono-num mt-0.5">Telemetría de Pool</span>
          </div>

          <div className="bg-[#080B12] rounded-xl p-3 border border-white/[0.06]">
            <span className="text-[10px] text-slate-400 font-mono-num uppercase block">Gasto Estimado</span>
            <span className="font-display-title text-xl font-bold text-cyan-300">${totalSpendPerHourUSD.toFixed(3)} <span className="text-xs">/h</span></span>
            <span className="text-[10px] text-slate-500 block font-mono-num mt-0.5">Cómputo + Storage</span>
          </div>
        </div>
      </div>

      {/* 2. List of Instances */}
      {instances.length === 0 ? (
        <div className="fintech-card rounded-2xl p-12 text-center border border-white/[0.08] space-y-4">
          <Server className="h-12 w-12 text-slate-600 mx-auto" />
          <h4 className="font-display-title text-base font-bold text-white">No hay instancias de Vast.ai registradas</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Puedes explorar y alquilar ofertas reales desde el Marketplace de Vast.ai, configurar una Estrategia Automatizada o crear una instancia de prueba simulada.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            {onNavigateToMarketplace && (
              <button
                onClick={onNavigateToMarketplace}
                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all"
              >
                Explorar Marketplace
              </button>
            )}
            <button
              onClick={() => setShowSimModal(true)}
              className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] text-white rounded-xl text-xs font-bold transition-all"
            >
              Crear Simulación de Prueba
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {instances.map((inst) => {
            const bench = resolveGpuBenchmark(inst.gpuModel);
            const ratioPct = inst.lastHashrateTHs && bench.expectedTHs > 0
              ? (inst.lastHashrateTHs / bench.expectedTHs) * 100
              : 0;

            const isDeleting = actionLoading[inst.id];

            return (
              <div
                key={inst.id}
                className="fintech-card rounded-xl p-4 border border-white/[0.08] hover:border-cyan-500/30 transition-all bg-[#080B12]/80 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.05]">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-cyan-400">
                      <Cpu className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display-title font-bold text-white text-sm">
                          {inst.gpuModel} <span className="text-xs text-slate-400 font-normal">({inst.gpuCount}x GPU, {inst.gpuMemoryGB} GB)</span>
                        </span>
                        {getStatusBadge(inst.status)}
                      </div>
                      <div className="text-[11px] font-mono-num text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                        <span>Worker: <strong className="text-cyan-300">{inst.workerName}</strong></span>
                        <span>•</span>
                        <span>ID Vast: <code className="text-slate-300">{inst.providerInstanceId || inst.id.slice(0, 8)}</code></span>
                        {inst.strategyId && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400">Estrategia Vinculada</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-mono-num block uppercase">Costo Estimado</span>
                    <span className="font-mono-num text-sm font-bold text-cyan-300">
                      ${inst.estimatedHourlyCostUSD?.toFixed(3) || '0.000'} <span className="text-xs text-slate-400 font-normal">/h</span>
                    </span>
                    <span className="text-[10px] text-slate-500 block font-mono-num">
                      Compute: ${inst.hourlyComputeCostUSD?.toFixed(3)} | Storage: ${inst.hourlyStorageCostUSD?.toFixed(3)}
                    </span>
                  </div>
                </div>

                {/* Telemetry and Benchmark Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono-num bg-[#06080E] p-3 rounded-lg border border-white/[0.04]">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Potencia Medida:</span>
                    <span className="text-[#05F292] font-bold text-xs">
                      {inst.lastHashrateTHs !== undefined ? `${inst.lastHashrateTHs.toFixed(1)} TH/s` : 'Sin datos'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block">Benchmark Esperado:</span>
                    <span className="text-slate-200 font-semibold">{bench.expectedTHs} TH/s</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block">Eficiencia Silicio:</span>
                    <span
                      className={`font-bold ${
                        ratioPct >= 95
                          ? 'text-emerald-400'
                          : ratioPct >= 80
                          ? 'text-cyan-300'
                          : ratioPct > 0
                          ? 'text-rose-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {ratioPct > 0 ? `${ratioPct.toFixed(1)}%` : 'Pendiente'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block">Ventanas Bajas:</span>
                    <span className={inst.consecutiveLowWindowsCount && inst.consecutiveLowWindowsCount > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                      {inst.consecutiveLowWindowsCount || 0} consecutivas
                    </span>
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.04]">
                  <div className="text-[10px] font-mono-num text-slate-500">
                    Creada: {new Date(inst.createdAt).toLocaleTimeString()}
                    {inst.startedAt && ` • Iniciada: ${new Date(inst.startedAt).toLocaleTimeString()}`}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Detener Minero */}
                    {inst.status === 'RUNNING' && (
                      <button
                        onClick={() => handleAction(inst.id, 'stop-miner')}
                        disabled={isDeleting}
                        title="Detiene el proceso del minero dentro del contenedor sin parar el hardware de Vast"
                        className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono-num font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                      >
                        <Square className="h-3 w-3" />
                        <span>Detener Minero</span>
                      </button>
                    )}

                    {/* Detener Instancia */}
                    {inst.status !== 'STOPPED' && inst.status !== 'TERMINATED' && (
                      <button
                        onClick={() => handleAction(inst.id, 'stop')}
                        disabled={isDeleting}
                        title="Pone la instancia en pausa en Vast.ai (se sigue cobrando storage pero no compute)"
                        className="px-2.5 py-1 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 text-slate-300 border border-slate-600 text-[10px] font-mono-num font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                      >
                        <Square className="h-3 w-3 text-slate-400" />
                        <span>Detener Instancia</span>
                      </button>
                    )}

                    {/* Destruir Instancia */}
                    {confirmDeleteId === inst.id ? (
                      <div className="flex items-center gap-1 animate-in fade-in">
                        <button
                          onClick={() => handleAction(inst.id, 'delete')}
                          disabled={isDeleting}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-mono-num font-bold flex items-center gap-1 transition-all"
                        >
                          {isDeleting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          <span>Confirmar Destrucción</span>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 text-slate-400 hover:text-white text-[10px] font-mono-num"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      inst.status !== 'TERMINATED' && (
                        <button
                          onClick={() => setConfirmDeleteId(inst.id)}
                          disabled={isDeleting}
                          title="Elimina y destruye permanentemente la instancia en Vast.ai deteniendo cualquier facturación"
                          className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-mono-num font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Destruir</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Modal para Crear Instancia Simulada */}
      {showSimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0A0D16] border border-cyan-500/30 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 font-mono-num">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-cyan-400" />
                <h4 className="font-bold text-white text-sm">Nueva Instancia Simulada</h4>
              </div>
              <button onClick={() => setShowSimModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Crea una instancia en modo simulación para verificar telemetría, monitoreo de bajo rendimiento y automatizaciones sin costos reales en Vast.ai.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Modelo de GPU:</label>
                <input
                  type="text"
                  value={simGpuModel}
                  onChange={(e) => setSimGpuModel(e.target.value)}
                  className="w-full bg-[#06080E] border border-white/[0.1] rounded-lg px-3 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Costo Cómputo ($/h):</label>
                <input
                  type="number"
                  step="0.01"
                  value={simHourlyCost}
                  onChange={(e) => setSimHourlyCost(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#06080E] border border-white/[0.1] rounded-lg px-3 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Hashrate Simulado (TH/s):</label>
                <input
                  type="number"
                  step="1"
                  value={simHashrate}
                  onChange={(e) => setSimHashrate(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#06080E] border border-white/[0.1] rounded-lg px-3 py-1.5 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowSimModal(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateSimulated}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-black text-xs font-bold"
              >
                Crear Instancia
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
