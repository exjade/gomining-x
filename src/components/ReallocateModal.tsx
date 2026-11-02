import React, { useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, X, Sparkles, Server, Zap, RotateCcw, Cpu } from 'lucide-react';
import { NET_AUDITED_USD_PER_THS_HOUR, resolveGpuBenchmark } from '../data/gpuBenchmarks';
import type { MergedGPUWorker } from '../types/minerx';

export type SaladRemediationAction = 'restart' | 'recreate' | 'reallocate';

interface ReallocateModalProps {
  worker: MergedGPUWorker | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmReallocate: (worker: MergedGPUWorker) => Promise<boolean>;
  onConfirmRestart?: (worker: MergedGPUWorker) => Promise<boolean>;
  onConfirmRecreate?: (worker: MergedGPUWorker) => Promise<boolean>;
  isDarkTheme?: boolean;
}

export const ReallocateModal: React.FC<ReallocateModalProps> = ({
  worker,
  isOpen,
  onClose,
  onConfirmReallocate,
  onConfirmRestart,
  onConfirmRecreate,
  isDarkTheme = false
}) => {
  const isLight = !isDarkTheme;
  const [selectedAction, setSelectedAction] = useState<SaladRemediationAction>('reallocate');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !worker) return null;

  const handleExecute = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      let ok = false;
      if (selectedAction === 'restart' && onConfirmRestart) {
        ok = await onConfirmRestart(worker);
        setSuccessMessage('¡Instancia reiniciada! El proceso minero se reinició en el mismo nodo.');
      } else if (selectedAction === 'recreate' && onConfirmRecreate) {
        ok = await onConfirmRecreate(worker);
        setSuccessMessage('¡Contenedor reconstruido desde cero con éxito en el mismo host!');
      } else {
        ok = await onConfirmReallocate(worker);
        setSuccessMessage('¡Solicitud de reasignación enviada! SaladCloud está migrando a un nuevo nodo físico.');
      }

      if (ok) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setIsSubmitting(false);
          onClose();
        }, 1600);
      } else {
        setErrorMessage('La API de SaladCloud rechazó la acción o falló la conexión.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al conectar con la API de SaladCloud');
      setIsSubmitting(false);
    }
  };

  const bench = resolveGpuBenchmark(worker.gpuModel);
  const expectedTHs = worker.expectedBenchmarkTHs || bench.expectedTHs;
  const shortfallTHs = Math.max(0, expectedTHs - worker.currentHashrateTHs);
  const lossPerDay = Math.max(0, shortfallTHs * NET_AUDITED_USD_PER_THS_HOUR * 24);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200 ${
      isLight ? 'bg-slate-900/40' : 'bg-black/85'
    }`}>
      <div className={`relative w-full max-w-lg rounded-2xl p-6 sm:p-7 border shadow-2xl overflow-hidden transition-all ${
        isLight 
          ? 'bg-white border-slate-200 text-slate-900 shadow-xl' 
          : 'bg-[#0B0F19] border-white/[0.1] text-white shadow-[0_20px_50px_rgba(0,0,0,0.9)]'
      }`}>
        {/* Glow decoration */}
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className={`absolute top-4 right-4 p-1 rounded-lg transition-colors cursor-pointer ${
            isLight ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
          }`}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 shadow-[0_0_15px_rgba(5,242,146,0.2)]">
            <RefreshCw className={`h-6 w-6 ${isSubmitting ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h3 className={`font-display-title text-lg font-bold flex items-center gap-2 ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              Gestión & Remediación de Instancia
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold border ${
                isLight ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
              }`}>
                Salad API v1.2
              </span>
            </h3>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Control nativo de ciclo de vida del contenedor de cómputo GPU
            </p>
          </div>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-[#05F292] border border-emerald-500/40 shadow-[0_0_20px_rgba(5,242,146,0.3)]">
              <CheckCircle className="h-8 w-8" />
            </div>
            <h4 className={`font-display-title text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>¡Acción Ejecutada!</h4>
            <p className={`text-xs max-w-xs mx-auto leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              {successMessage}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Target Worker Diagnostics Box */}
            <div className={`rounded-xl border p-4 text-xs font-mono space-y-2 shadow-inner ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#080B12] border-white/[0.08] text-slate-300'
            }`}>
              <div className="flex justify-between items-center">
                <span className={`flex items-center gap-1.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Server className="h-3.5 w-3.5 text-cyan-500" />
                  Worker / Contenedor:
                </span>
                <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{worker.workerName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Grupo Salad / Node ID:</span>
                <span className={`font-semibold ${isLight ? 'text-cyan-700' : 'text-cyan-300'}`}>{worker.containerGroupName} ({worker.machineId.slice(0, 10)}...)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className={`flex items-center gap-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Cpu className="h-3 w-3 text-emerald-500" />
                  Modelo GPU:
                </span>
                <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{worker.gpuModel} ({worker.vramGB}GB) • {worker.saladPriority}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Potencia Actual vs Benchmark:</span>
                <span className={worker.performanceRatioPct < 80 ? 'text-amber-500 font-bold' : 'text-emerald-500 font-bold'}>
                  {worker.currentHashrateTHs} TH/s / {expectedTHs} TH/s ({worker.performanceRatioPct.toFixed(1)}%)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Costo Horario Salad:</span>
                <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>${worker.hourlySaladCost.toFixed(3)}/h</span>
              </div>
              {lossPerDay > 0 && (
                <div className={`pt-2 border-t flex justify-between items-center font-semibold text-rose-500 ${
                  isLight ? 'border-rose-100' : 'border-white/[0.06]'
                }`}>
                  <span>Déficit Auditado Neto:</span>
                  <span>-${lossPerDay.toFixed(2)} USD / día (-4.56% fricción)</span>
                </div>
              )}
            </div>

            {/* 3 Salad Action Selector Tabs */}
            <div className="space-y-2">
              <label className={`text-xs font-semibold block ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Selecciona la Acción Operativa de SaladCloud:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAction('restart')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedAction === 'restart'
                      ? isLight 
                        ? 'bg-cyan-50 border-cyan-500 text-cyan-950 shadow-md ring-1 ring-cyan-400' 
                        : 'bg-cyan-500/15 border-cyan-400 text-white shadow-lg shadow-cyan-500/10'
                      : isLight 
                      ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900' 
                      : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white'
                  }`}
                >
                  <Zap className={`w-4 h-4 mb-1.5 ${selectedAction === 'restart' ? 'text-cyan-500' : 'text-slate-400'}`} />
                  <div className="text-xs font-bold">Fast Restart</div>
                  <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Reinicia en el mismo nodo</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedAction('recreate')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedAction === 'recreate'
                      ? isLight 
                        ? 'bg-purple-50 border-purple-500 text-purple-950 shadow-md ring-1 ring-purple-400' 
                        : 'bg-purple-500/15 border-purple-400 text-white shadow-lg shadow-purple-500/10'
                      : isLight 
                      ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900' 
                      : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white'
                  }`}
                >
                  <RotateCcw className={`w-4 h-4 mb-1.5 ${selectedAction === 'recreate' ? 'text-purple-500' : 'text-slate-400'}`} />
                  <div className="text-xs font-bold">Recreate</div>
                  <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Reconstruye contenedor</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedAction('reallocate')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedAction === 'reallocate'
                      ? isLight 
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-md ring-1 ring-emerald-400' 
                        : 'bg-[#05F292]/15 border-[#05F292] text-white shadow-lg shadow-[#05F292]/10'
                      : isLight 
                      ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900' 
                      : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className={`w-4 h-4 mb-1.5 ${selectedAction === 'reallocate' ? 'text-emerald-500' : 'text-slate-400'}`} />
                  <div className="text-xs font-bold">Reallocate</div>
                  <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Silicon Lottery (nuevo)</div>
                </button>
              </div>
            </div>

            {/* Explanation Warning */}
            <div className={`rounded-xl border p-3 text-xs flex items-start gap-2.5 ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-[#0A0E18] border-white/[0.08] text-slate-300'
            }`}>
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                {selectedAction === 'restart' && (
                  <span>Ejecuta <code className={`px-1 py-0.5 rounded font-mono ${isLight ? 'bg-slate-200 text-cyan-800' : 'text-cyan-300 bg-black/40'}`}>POST .../restart</code>. Mantiene la GPU física y reinicia el proceso del contenedor en segundos sin liberar la máquina.</span>
                )}
                {selectedAction === 'recreate' && (
                  <span>Ejecuta <code className={`px-1 py-0.5 rounded font-mono ${isLight ? 'bg-slate-200 text-purple-800' : 'text-purple-300 bg-black/40'}`}>POST .../recreate</code>. Detiene y recrea la instancia sobre el mismo host desde cero.</span>
                )}
                {selectedAction === 'reallocate' && (
                  <span>Ejecuta <code className={`px-1 py-0.5 rounded font-mono ${isLight ? 'bg-slate-200 text-emerald-800' : 'text-[#05F292] bg-black/40'}`}>POST .../reallocate</code>. Desecha el nodo host actual y Salad busca otro servidor físico para cambiar de silicio.</span>
                )}
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-2.5 text-xs text-rose-500 font-semibold">
                {errorMessage}
              </div>
            )}

            {/* Actions */}
            <div className={`flex items-center justify-end gap-3 pt-2 border-t ${
              isLight ? 'border-slate-100' : 'border-white/[0.06]'
            }`}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecute}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#05DF72] to-[#00F0FF] text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Ejecutando en SaladCloud...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 fill-current" />
                    <span>Confirmar Acción ({selectedAction.toUpperCase()})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
