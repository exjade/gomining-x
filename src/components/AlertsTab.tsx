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
  isDarkTheme?: boolean;
}

export const AlertsTab: React.FC<AlertsTabProps> = ({
  alerts,
  workers,
  onClearAlerts,
  onOpenReallocate,
  isDarkTheme = false
}) => {
  const isLight = !isDarkTheme;
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');

  const filteredAlerts = alerts.filter((a) => {
    if (filterSeverity === 'ALL') return true;
    return a.severity === filterSeverity;
  });

  const getSeverityIcon = (sev: string) => {
    switch (sev) {
      case 'critical':
        return <AlertCircle className="h-5 w-5 text-rose-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      default:
        return <Info className="h-5 w-5 text-cyan-500" />;
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'critical':
        return isLight 
          ? 'bg-rose-100 text-rose-700 border-rose-300' 
          : 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'warning':
        return isLight 
          ? 'bg-amber-100 text-amber-800 border-amber-300' 
          : 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'success':
        return isLight 
          ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      default:
        return isLight 
          ? 'bg-cyan-100 text-cyan-800 border-cyan-300' 
          : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-10 animate-in fade-in duration-300">
      {/* Header & Controls */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl p-5 border transition-all ${
        isLight 
          ? 'bg-white border-slate-200/90 shadow-sm text-slate-900' 
          : 'fintech-card border-white/[0.08] text-white'
      }`}>
        <div>
          <h2 className={`font-display-title text-xl font-bold flex items-center gap-2 ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}>
            Registro de Eventos & Alertas
            {alerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length > 0 ? (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-mono-num font-semibold border ${
                isLight 
                  ? 'bg-rose-100 text-rose-700 border-rose-200' 
                  : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
              }`}>
                {alerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length} Alertas Activas
              </span>
            ) : (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-mono-num font-semibold border ${
                isLight 
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                {alerts.length} Eventos ({alerts.filter(a => a.severity === 'info').length} Allocating)
              </span>
            )}
          </h2>
          <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Supervisión continua de nodos en tiempo real, eventos de aprovisionamiento en SaladCloud y alertas de rendimiento
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Severity Filter */}
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className={`rounded-xl border px-3.5 py-2 text-xs font-mono-num transition-all focus:outline-none ${
              isLight 
                ? 'bg-white border-slate-200 text-slate-800 focus:border-[#05DF72]' 
                : 'bg-[#080B12] border-white/[0.08] text-white focus:border-cyan-400'
            }`}
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
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors ${
                isLight 
                  ? 'bg-slate-100 border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-300' 
                  : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-rose-400 hover:border-rose-500/40'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Limpiar Historial</span>
            </button>
          )}
        </div>
      </div>

      {/* Alerts Timeline List */}
      {filteredAlerts.length === 0 ? (
        <div className={`rounded-2xl p-12 text-center space-y-3 border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'fintech-card border-white/[0.08]'
        }`}>
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
          <h4 className={`font-display-title text-base font-semibold ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}>
            No hay alertas activas en este momento
          </h4>
          <p className={`text-xs max-w-sm mx-auto ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}>
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
                className={`rounded-2xl p-4.5 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isLight
                    ? alert.severity === 'critical'
                      ? 'border-rose-200 bg-rose-50/70 shadow-sm'
                      : alert.severity === 'warning'
                      ? 'border-amber-200 bg-amber-50/70 shadow-sm'
                      : alert.severity === 'info'
                      ? 'border-cyan-200 bg-cyan-50/70 shadow-sm'
                      : 'border-slate-200 bg-white shadow-sm'
                    : alert.severity === 'critical'
                    ? 'border-rose-500/40 bg-rose-950/20 fintech-card'
                    : alert.severity === 'warning'
                    ? 'border-amber-500/40 bg-amber-950/20 fintech-card'
                    : alert.severity === 'info'
                    ? 'border-cyan-500/30 bg-cyan-950/15 fintech-card'
                    : 'border-white/[0.08] fintech-card'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div className={`mt-0.5 p-2 rounded-xl border ${
                    isLight 
                      ? 'bg-white border-slate-200 shadow-xs' 
                      : 'bg-white/[0.04] border-white/[0.08]'
                  }`}>
                    {getSeverityIcon(alert.severity)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-mono-num font-bold text-sm ${
                        isLight ? 'text-slate-900' : 'text-white'
                      }`}>
                        {alert.workerName}
                      </span>
                      <span className={`text-xs font-mono-num ${
                        isLight ? 'text-cyan-700 font-semibold' : 'text-cyan-400'
                      }`}>
                        ({alert.gpuModel})
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-mono-num font-bold border uppercase tracking-wider ${getSeverityBadge(
                          alert.severity
                        )}`}
                      >
                        {alert.type}
                      </span>
                      <span className={`text-[11px] font-mono-num ${
                        isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        • {alert.timestamp}
                      </span>
                    </div>

                    <p className={`text-xs leading-relaxed font-mono-num ${
                      isLight ? 'text-slate-700' : 'text-slate-300'
                    }`}>
                      {alert.message}
                    </p>
                  </div>
                </div>

                {/* Action button if actionable */}
                {linkedWorker && (alert.type === 'UNDERPERFORMING' || alert.type === 'DISCONNECT') && (
                  <button
                    onClick={() => onOpenReallocate(linkedWorker)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 hover:brightness-110 active:scale-95 transition-all shadow-md shrink-0 self-end sm:self-auto cursor-pointer"
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
