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
}

export const ReallocateModal: React.FC<ReallocateModalProps> = ({
  worker,
  isOpen,
  onClose,
  onConfirmReallocate,
  onConfirmRestart,
  onConfirmRecreate
}) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg fintech-card rounded-2xl p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.9)] border border-white/[0.1] overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.08] transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#05F292]/15 text-[#05F292] border border-[#05F292]/30 shadow-[0_0_15px_rgba(5,242,146,0.2)]">
            <RefreshCw className={`h-6 w-6 ${isSubmitting ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h3 className="font-display-title text-lg font-bold text-white flex items-center gap-2">
              Gestión & Remediación de Instancia
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono font-semibold">
                Salad API v1.2
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Control nativo de ciclo de vida del contenedor de cómputo GPU
            </p>
          </div>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-[#05F292] border border-emerald-500/40 shadow-[0_0_20px_rgba(5,242,146,0.3)]">
              <CheckCircle className="h-8 w-8" />
            </div>
            <h4 className="font-display-title text-base font-bold text-white">¡Acción Ejecutada!</h4>
            <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
              {successMessage}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Target Worker Diagnostics Box */}
            <div className="rounded-xl border border-white/[0.08] bg-[#080B12] p-4 text-xs font-mono space-y-2 shadow-inner">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5 text-cyan-400" />
                  Worker / Contenedor:
                </span>
                <span className="font-bold text-white">{worker.workerName}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Grupo Salad / Node ID:</span>
                <span className="text-cyan-300 font-semibold">{worker.containerGroupName} ({worker.machineId.slice(0, 10)}...)</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400 flex items-center gap-1">
                  <Cpu className="h-3 w-3 text-emerald-400" />
                  Modelo GPU:
                </span>
                <span className="text-slate-200 font-semibold">{worker.gpuModel} ({worker.vramGB}GB) • {worker.saladPriority}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Potencia Actual vs Benchmark:</span>
                <span className={worker.performanceRatioPct < 80 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {worker.currentHashrateTHs} TH/s / {expectedTHs} TH/s ({worker.performanceRatioPct.toFixed(1)}%)
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Costo Alquiler Salad:</span>
                <span className="text-slate-200 font-semibold">${worker.hourlySaladCost.toFixed(3)}/h</span>
              </div>
              {lossPerDay > 0 && (
                <div className="pt-2 border-t border-white/[0.06] flex justify-between items-center text-rose-400 font-semibold">
                  <span>Déficit Auditado Neto:</span>
                  <span>-${lossPerDay.toFixed(2)} USD / día (-4.56% fricción)</span>
                </div>
              )}
            </div>

            {/* 3 Salad Action Selector Tabs */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Selecciona la Acción Operativa de SaladCloud:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAction('restart')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedAction === 'restart'
                      ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-lg shadow-cyan-500/10'
                      : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white'
                  }`}
                >
                  <Zap className={`w-4 h-4 mb-1.5 ${selectedAction === 'restart' ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <div className="text-xs font-bold">Fast Restart</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Reinicia en el mismo nodo (rápido)</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedAction('recreate')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedAction === 'recreate'
                      ? 'bg-purple-500/15 border-purple-400 text-white shadow-lg shadow-purple-500/10'
                      : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white'
                  }`}
                >
                  <RotateCcw className={`w-4 h-4 mb-1.5 ${selectedAction === 'recreate' ? 'text-purple-400' : 'text-slate-500'}`} />
                  <div className="text-xs font-bold">Recreate</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Reconstruye contenedor limpio</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedAction('reallocate')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedAction === 'reallocate'
                      ? 'bg-[#05F292]/15 border-[#05F292] text-white shadow-lg shadow-[#05F292]/10'
                      : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className={`w-4 h-4 mb-1.5 ${selectedAction === 'reallocate' ? 'text-[#05F292]' : 'text-slate-500'}`} />
                  <div className="text-xs font-bold">Reallocate</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Silicon Lottery (cambio físico)</div>
                </button>
              </div>
            </div>

            {/* Explanation Warning */}
            <div className="rounded-xl border border-white/[0.08] bg-[#0A0E18] p-3 text-xs text-slate-300 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                {selectedAction === 'restart' && (
                  <span>Ejecuta <code className="text-cyan-300 bg-black/40 px-1 py-0.5 rounded">POST .../restart</code>. Mantiene la GPU física y reinicia el proceso del contenedor en segundos sin liberar la máquina.</span>
                )}
                {selectedAction === 'recreate' && (
                  <span>Ejecuta <code className="text-purple-300 bg-black/40 px-1 py-0.5 rounded">POST .../recreate</code>. Detiene y recrea la instancia sobre el mismo host desde cero.</span>
                )}
                {selectedAction === 'reallocate' && (
                  <span>Ejecuta <code className="text-[#05F292] bg-black/40 px-1 py-0.5 rounded">POST .../reallocate</code>. Desecha el nodo host actual y Salad busca otro servidor físico para cambiar de silicio.</span>
                )}
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-2.5 text-xs text-rose-300">
                {errorMessage}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecute}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#05F292] to-[#00F0FF] text-black font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#05F292]/25 cursor-pointer"
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
