import React, { useState } from 'react';
import { 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  RefreshCw, 
  Trash2
} from 'lucide-react';
import type { AlertEvent, MergedGPUWorker } from '../types/minerx';

interface AlertsTabProps {
  alerts: AlertEvent[];
  workers: MergedGPUWorker[];
  onClearAlerts: () => void;
  onOpenReallocate: (worker: MergedGPUWorker) => void;
}

export const AlertsTab: React.FC<AlertsTabProps> = ({
  alerts,
  workers,
  onClearAlerts,
  onOpenReallocate
}) => {
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');

  const filteredAlerts = alerts.filter((a) => {
    if (filterSeverity === 'ALL') return true;
    return a.severity === filterSeverity;
  });

  const getSeverityIcon = (sev: string) => {
    switch (sev) {
      case 'critical':
        return <AlertCircle className="h-5 w-5 text-rose-400" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-400" />;
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
      default:
        return <Info className="h-5 w-5 text-cyan-400" />;
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'critical':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'warning':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'success':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      default:
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-10 animate-in fade-in duration-300">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 fintech-card rounded-2xl p-5 border border-white/[0.08]">
        <div>
          <h2 className="font-display-title text-xl font-bold text-white flex items-center gap-2">
            Registro de Eventos & Alertas
            {alerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length > 0 ? (
              <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-mono-num font-semibold text-rose-400 border border-rose-500/30">
                {alerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length} Alertas Activas
              </span>
            ) : (
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-mono-num font-semibold text-emerald-400 border border-emerald-500/20">
                {alerts.length} Eventos ({alerts.filter(a => a.severity === 'info').length} Allocating)
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Supervisión continua de nodos en tiempo real, eventos de aprovisionamiento en SaladCloud y alertas de rendimiento
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Severity Filter */}
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="rounded-xl border border-white/[0.08] bg-[#080B12] px-3.5 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none font-mono-num"
          >
            <option value="ALL">Todas las Notificaciones ({alerts.length})</option>
            <option value="critical">Críticas (Desconexiones)</option>
            <option value="warning">Advertencias (Baja Potencia)</option>
            <option value="info">En Aprovisionamiento (Allocating)</option>
            <option value="success">Éxito (Reasignaciones)</option>
          </select>

          {alerts.length > 0 && (
            <button
              onClick={onClearAlerts}
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Limpiar Historial</span>
            </button>
          )}
        </div>
      </div>

      {/* Alerts Timeline List */}
      {filteredAlerts.length === 0 ? (
        <div className="fintech-card rounded-2xl p-12 text-center space-y-3 border border-white/[0.08]">
          <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
          <h4 className="font-display-title text-base font-semibold text-white">
            No hay alertas activas en este momento
          </h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Todas tus GPUs en SaladCloud están activas y minando dentro de los parámetros esperados.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            // Find worker if linked
            const linkedWorker = workers.find(
              w => w.id === alert.instanceId || w.workerName === alert.workerName
            );

            return (
              <div
                key={alert.id}
                className={`fintech-card rounded-2xl p-4.5 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  alert.severity === 'critical'
                    ? 'border-rose-500/40 bg-rose-950/15'
                    : alert.severity === 'warning'
                    ? 'border-amber-500/40 bg-amber-950/15'
                    : alert.severity === 'info'
                    ? 'border-cyan-500/30 bg-cyan-950/10'
                    : 'border-white/[0.08]'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="mt-0.5 p-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                    {getSeverityIcon(alert.severity)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-num font-bold text-white text-sm">
                        {alert.workerName}
                      </span>
                      <span className="text-xs text-cyan-400 font-mono-num">
                        ({alert.gpuModel})
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-mono-num font-bold border uppercase tracking-wider ${getSeverityBadge(
                          alert.severity
                        )}`}
                      >
                        {alert.type}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono-num">
                        • {alert.timestamp}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed font-mono-num">
                      {alert.message}
                    </p>
                  </div>
                </div>

                {/* Action button if actionable */}
                {linkedWorker && (alert.type === 'UNDERPERFORMING' || alert.type === 'DISCONNECT') && (
                  <button
                    onClick={() => onOpenReallocate(linkedWorker)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 hover:brightness-110 active:scale-95 transition-all shadow-md shrink-0 self-end sm:self-auto"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Reasignar Nodo</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
