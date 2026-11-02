import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Plus,
  X,
  History,
  RotateCcw
} from 'lucide-react';
import { apiFetch } from '../utils/apiConfig';
import type { RentalStrategy, AuditRunEvent, FailureActionPolicy, StrategyMode } from '../types/vast';

interface RentalStrategiesTabProps {
  isDarkTheme?: boolean;
}

export const RentalStrategiesTab: React.FC<RentalStrategiesTabProps> = ({ isDarkTheme = false }) => {
  const isLight = !isDarkTheme;
  const [strategies, setStrategies] = useState<RentalStrategy[]>([]);
  const [auditRuns, setAuditRuns] = useState<AuditRunEvent[]>([]);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // New Strategy Modal
  const [showModal, setShowModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('Estrategia RTX 4090 Automática');
  const [gpuModel, setGpuModel] = useState<string>('RTX 4090');
  const [gpuCount, setGpuCount] = useState<number>(1);
  const [mode, setMode] = useState<StrategyMode>('SIMULATION'); // Default SIMULATION
  const [maxHourlyCostUSD, setMaxHourlyCostUSD] = useState<number>(0.35);
  const [maxDailySpendUSD, setMaxDailySpendUSD] = useState<number>(8.0);
  const [maxTotalSpendUSD, setMaxTotalSpendUSD] = useState<number>(20.0);
  const [minimumHashrateTHs, setMinimumHashrateTHs] = useState<number>(230);
  const [minimumPerformancePct, setMinimumPerformancePct] = useState<number>(80);
  const [measurementWindowMinutes, setMeasurementWindowMinutes] = useState<number>(15);
  const [warmupMinutes, setWarmupMinutes] = useState<number>(5);
  const [consecutiveFailWindows, setConsecutiveFailWindows] = useState<number>(3);
  const [failureAction, setFailureAction] = useState<FailureActionPolicy>('STOP_AND_DISABLE');
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(30);

  const fetchStrategies = async () => {
    try {
      const res = await apiFetch('/api/strategies');
      if (res.ok) {
        const data = await res.json();
        setStrategies(data.strategies || []);
      }
    } catch {}
  };

  const fetchAudit = async () => {
    try {
      const res = await apiFetch('/api/strategies/audit');
      if (res.ok) {
        const data = await res.json();
        setAuditRuns(data.runs || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchStrategies();
    fetchAudit();
  }, []);

  const handleToggleStrategy = async (strat: RentalStrategy) => {
    const endpoint = strat.enabled
      ? `/api/strategies/${strat.id}/disable`
      : `/api/strategies/${strat.id}/enable`;

    try {
      const res = await apiFetch(endpoint, { method: 'POST' });
      if (res.ok) {
        await fetchStrategies();
        await fetchAudit();
        setFeedback({
          type: 'success',
          text: `Estrategia "${strat.name}" ${strat.enabled ? 'desactivada' : 'activada'}.`
        });
      }
    } catch {}
  };

  const handleCreateStrategy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          gpuModel,
          gpuCount,
          mode,
          enabled: false, // Created disabled by default
          maxHourlyCostUSD,
          maxDailySpendUSD,
          maxTotalSpendUSD,
          minimumHashrateTHs,
          minimumPerformancePct,
          measurementWindowMinutes,
          warmupMinutes,
          consecutiveFailWindows,
          failureAction,
          cooldownMinutes,
          requireManualApproval: mode !== 'AUTOMATIC'
        })
      });

      if (res.ok) {
        setShowModal(false);
        await fetchStrategies();
        await fetchAudit();
        setFeedback({
          type: 'success',
          text: `Estrategia "${name}" guardada en modo ${mode} (desactivada por seguridad).`
        });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Error creando estrategia.' });
    }
  };

  const handleTriggerEvaluation = async () => {
    setIsEvaluating(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/strategies/evaluate', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setFeedback({
          type: 'success',
          text: `Evaluación completada. Acciones tomadas: ${
            data.result?.actionsTaken?.join(', ') || 'Ninguna acción requerida.'
          }`
        });
        await fetchStrategies();
        await fetchAudit();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Error evaluando: ${err.message}` });
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header with Actions */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border shadow-sm transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0E121C]/80 border-white/[0.08] text-white'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <h3 className={`text-lg font-bold font-rajdhani flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              <Sliders className="h-5 w-5 text-emerald-500" />
              <span>Estrategias de Alquiler & Supervisión Automática</span>
            </h3>
            <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${
              isLight ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
            }`}>
              Modo Safe Guard
            </span>
          </div>
          <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Automatiza la búsqueda de ofertas, protección contra bajo hashrate y límites estrictos de gasto horario y diario.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTriggerEvaluation}
            disabled={isEvaluating}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              isLight
                ? 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'border-white/[0.1] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
            }`}
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isEvaluating ? 'animate-spin' : ''}`} />
            <span>{isEvaluating ? 'Evaluando...' : 'Evaluar Ahora'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition-all cursor-pointer shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Nueva Estrategia</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? isLight ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
              : isLight ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-rose-500/40 bg-rose-950/20 text-rose-300'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className={isLight ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-white'}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 2. Strategies Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {strategies.length === 0 ? (
          <div className={`col-span-full p-8 text-center rounded-2xl border border-dashed text-xs ${
            isLight ? 'border-slate-300 bg-slate-50/50 text-slate-500' : 'border-white/10 text-slate-400'
          }`}>
            No tienes ninguna estrategia configurada. Haz clic en <strong>Nueva Estrategia</strong> para crear una regla de alquiler o supervisión en modo Simulación.
          </div>
        ) : (
          strategies.map((strat) => (
            <div
              key={strat.id}
              className={`rounded-2xl border p-5 space-y-4 transition-all shadow-sm ${
                strat.enabled
                  ? isLight
                    ? 'border-emerald-400 bg-white ring-1 ring-emerald-400/20'
                    : 'border-emerald-500/40 bg-[#0E121C]/90'
                  : isLight
                    ? 'border-slate-200 bg-slate-50/80 opacity-90'
                    : 'border-white/[0.08] bg-[#0E121C]/50 opacity-80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-base font-rajdhani ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {strat.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                        strat.mode === 'AUTOMATIC'
                          ? isLight ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : strat.mode === 'MANUAL_APPROVAL'
                          ? isLight ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : isLight ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      }`}
                    >
                      {strat.mode}
                    </span>
                  </div>
                  <span className={`text-[11px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                    {strat.gpuModel} x{strat.gpuCount} • Proveedor: {strat.provider}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleStrategy(strat)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    strat.enabled
                      ? isLight ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : isLight ? 'bg-slate-200 text-slate-600 border-slate-300' : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                  }`}
                >
                  {strat.enabled ? 'Activa' : 'Pausada'}
                </button>
              </div>

              {/* Thresholds & Financial Limits */}
              <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono p-3 rounded-xl border ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#06080E] border-white/[0.04]'
              }`}>
                <div>
                  <span className={`block text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>TH/s Mínimo:</span>
                  <span className={`font-bold ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>{strat.minimumHashrateTHs} TH/s</span>
                </div>
                <div>
                  <span className={`block text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Benchmark %:</span>
                  <span className={`font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{strat.minimumPerformancePct}%</span>
                </div>
                <div>
                  <span className={`block text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Precio Máx:</span>
                  <span className={`font-bold ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>${strat.maxHourlyCostUSD}/h</span>
                </div>
                <div>
                  <span className={`block text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Gasto Diario:</span>
                  <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>${strat.maxDailySpendUSD} USD</span>
                </div>
              </div>

              {/* Action Policy & Timing */}
              <div className={`flex items-center justify-between text-[11px] font-mono pt-1 border-t ${
                isLight ? 'border-slate-200 text-slate-500' : 'border-white/[0.04] text-slate-400'
              }`}>
                <div>
                  <span>Política si falla: </span>
                  <strong className={isLight ? 'text-rose-600' : 'text-rose-400'}>{strat.failureAction}</strong>
                </div>
                <div>
                  <span>Warmup: </span>
                  <strong className={isLight ? 'text-slate-700' : 'text-slate-200'}>{strat.warmupMinutes}m</strong>
                  <span> • Cooldown: </span>
                  <strong className={isLight ? 'text-slate-700' : 'text-slate-200'}>{strat.cooldownMinutes}m</strong>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 3. Audit Runs History Log */}
      <div className={`rounded-2xl border p-5 space-y-3 shadow-sm ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'border-white/[0.08] bg-[#0E121C]/80 text-white'
      }`}>
        <div className={`flex items-center justify-between pb-3 border-b ${
          isLight ? 'border-slate-200' : 'border-white/[0.06]'
        }`}>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-cyan-500" />
            <h4 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Registro de Auditoría & Decisiones del Motor</h4>
          </div>
          <button
            onClick={fetchAudit}
            className={`text-[11px] cursor-pointer transition-colors ${
              isLight ? 'text-cyan-700 hover:text-cyan-800' : 'text-cyan-400 hover:text-cyan-300'
            }`}
          >
            Refrescar Logs
          </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-xs">
          {auditRuns.length === 0 ? (
            <div className={`p-4 text-center text-xs ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
              No hay eventos de auditoría registrados todavía.
            </div>
          ) : (
            auditRuns.slice().reverse().map((run) => (
              <div
                key={run.id}
                className={`flex items-start justify-between gap-3 p-2.5 rounded-xl border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#06080E] border-white/[0.04]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {new Date(run.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`font-bold ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>{run.action}</span>
                    {run.workerName && (
                      <span className={`font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>({run.workerName})</span>
                    )}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    {JSON.stringify(run.details)}
                  </div>
                </div>

                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${
                    run.outcome === 'SUCCESS'
                      ? isLight ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : run.outcome === 'SKIPPED'
                      ? isLight ? 'bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-700 text-slate-300 border-slate-600'
                      : isLight ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {run.outcome}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4. Modal: Create Strategy */}
      {showModal && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
          isLight ? 'bg-slate-900/40 backdrop-blur-xs' : 'bg-black/80 backdrop-blur-sm'
        } animate-in fade-in duration-200`}>
          <div className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0D111A] border-white/[0.1] text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isLight ? 'border-slate-200' : 'border-white/[0.08]'
            }`}>
              <h3 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                <Sliders className="h-5 w-5 text-emerald-500" />
                <span>Configurar Nueva Estrategia Vast.ai</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className={`p-1 rounded-lg transition-colors ${isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'}`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStrategy} className="space-y-4 text-xs">
              <div>
                <label className={`font-medium block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Nombre de la Estrategia</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 font-mono transition-all border focus:outline-none ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                  }`}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`font-medium block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Modo de Operación</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as StrategyMode)}
                    className={`w-full rounded-xl px-3 py-2 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  >
                    <option value="SIMULATION">SIMULATION (Sin gasto real)</option>
                    <option value="MANUAL_APPROVAL">MANUAL_APPROVAL (Requiere clic)</option>
                    <option value="AUTOMATIC">AUTOMATIC (Alquiler autónomo)</option>
                  </select>
                </div>
                <div>
                  <label className={`font-medium block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Modelo GPU</label>
                  <select
                    value={gpuModel}
                    onChange={(e) => setGpuModel(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  >
                    <option value="RTX 4090">RTX 4090 (24GB)</option>
                    <option value="RTX 5090">RTX 5090 (32GB)</option>
                    <option value="RTX 3090">RTX 3090 (24GB)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Cantidad GPUs</label>
                  <input
                    type="number"
                    min="1"
                    value={gpuCount}
                    onChange={(e) => setGpuCount(parseInt(e.target.value) || 1)}
                    className={`w-full rounded-xl px-2.5 py-1.5 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Presupuesto Diario ($)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={maxDailySpendUSD}
                    onChange={(e) => setMaxDailySpendUSD(parseFloat(e.target.value) || 0)}
                    className={`w-full rounded-xl px-2.5 py-1.5 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Presupuesto Total ($)</label>
                  <input
                    type="number"
                    step="1"
                    value={maxTotalSpendUSD}
                    onChange={(e) => setMaxTotalSpendUSD(parseFloat(e.target.value) || 0)}
                    className={`w-full rounded-xl px-2.5 py-1.5 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Warmup (Min)</label>
                  <input
                    type="number"
                    value={warmupMinutes}
                    onChange={(e) => setWarmupMinutes(parseInt(e.target.value) || 0)}
                    className={`w-full rounded-xl px-2.5 py-1.5 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Ventana Medición (Min)</label>
                  <input
                    type="number"
                    value={measurementWindowMinutes}
                    onChange={(e) => setMeasurementWindowMinutes(parseInt(e.target.value) || 0)}
                    className={`w-full rounded-xl px-2.5 py-1.5 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Ventanas Fallo</label>
                  <input
                    type="number"
                    value={consecutiveFailWindows}
                    onChange={(e) => setConsecutiveFailWindows(parseInt(e.target.value) || 0)}
                    className={`w-full rounded-xl px-2.5 py-1.5 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Precio Máx ($/h)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={maxHourlyCostUSD}
                    onChange={(e) => setMaxHourlyCostUSD(parseFloat(e.target.value) || 0)}
                    className={`w-full rounded-xl px-2.5 py-1.5 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>TH/s Mínimo</label>
                  <input
                    type="number"
                    value={minimumHashrateTHs}
                    onChange={(e) => setMinimumHashrateTHs(parseFloat(e.target.value) || 0)}
                    className={`w-full rounded-xl px-2.5 py-1.5 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>% Benchmark Mín</label>
                  <input
                    type="number"
                    value={minimumPerformancePct}
                    onChange={(e) => setMinimumPerformancePct(parseFloat(e.target.value) || 0)}
                    className={`w-full rounded-xl px-2.5 py-1.5 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Acción ante Bajo Hashrate</label>
                  <select
                    value={failureAction}
                    onChange={(e) => setFailureAction(e.target.value as FailureActionPolicy)}
                    className={`w-full rounded-xl px-3 py-2 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  >
                    <option value="STOP_AND_DISABLE">STOP_AND_DISABLE (Detener y Pausar)</option>
                    <option value="STOP_INSTANCE">STOP_INSTANCE (Detener)</option>
                    <option value="DESTROY_INSTANCE">DESTROY_INSTANCE (Eliminar y fin costo)</option>
                    <option value="ALERT_ONLY">ALERT_ONLY (Solo notificar)</option>
                  </select>
                </div>
                <div>
                  <label className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Cooldown tras Baja (Min)</label>
                  <input
                    type="number"
                    value={cooldownMinutes}
                    onChange={(e) => setCooldownMinutes(parseInt(e.target.value) || 0)}
                    className={`w-full rounded-xl px-3 py-2 font-mono transition-all border focus:outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white' : 'bg-[#06080E] border-white/[0.1] text-white focus:border-cyan-400'
                    }`}
                  />
                </div>
              </div>

              <div className={`flex items-center justify-end gap-2 pt-3 border-t ${isLight ? 'border-slate-200' : 'border-white/[0.08]'}`}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={`px-4 py-2 rounded-xl transition-colors ${
                    isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-colors shadow-sm"
                >
                  Guardar Estrategia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
