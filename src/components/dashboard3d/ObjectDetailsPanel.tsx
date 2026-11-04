import React from 'react';
import { 
  X, 
  Zap, 
  Thermometer, 
  Wind 
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts';
import type { Selected3DObject } from '../../types/visualization';

interface ObjectDetailsPanelProps {
  selectedObject: Selected3DObject | null;
  onClose: () => void;
  isDarkTheme?: boolean;
}

export const ObjectDetailsPanel: React.FC<ObjectDetailsPanelProps> = ({
  selectedObject,
  onClose,
  isDarkTheme = true
}) => {
  if (!selectedObject) return null;

  const { title, subtitle, type, healthStatus, rawPayload } = selectedObject;

  // Datos simulados para la micrográfica de Recharts
  const sparklineData = [
    { time: '00:00', yield: 0.92 },
    { time: '04:00', yield: 0.94 },
    { time: '08:00', yield: 0.96 },
    { time: '12:00', yield: 0.95 },
    { time: '16:00', yield: 0.97 },
    { time: '20:00', yield: 0.96 },
    { time: '24:00', yield: 0.971 }
  ];

  return (
    <div className={`w-full lg:w-96 p-5 rounded-3xl border shadow-2xl backdrop-blur-2xl transition-all animate-in slide-in-from-right duration-300 ${
      isDarkTheme 
        ? 'bg-[#0E1320]/95 border-white/10 text-white shadow-black/80' 
        : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-300'
    }`}>
      {/* Header con botón cerrar */}
      <div className={`flex items-start justify-between gap-3 pb-3 border-b mb-4 ${
        isDarkTheme ? 'border-white/10' : 'border-slate-100'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              healthStatus === 'OPTIMAL'
                ? 'bg-emerald-500/10 text-[#05DF72] border border-emerald-500/20'
                : healthStatus === 'DEGRADED'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              {healthStatus}
            </span>
            <span className={`text-[10px] font-mono uppercase tracking-wider ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
              {type.replace('_', ' ')}
            </span>
          </div>
          <h4 className={`text-base font-bold font-sans mt-1 ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{title}</h4>
          <p className={`text-xs font-mono mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{subtitle}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
            isDarkTheme 
              ? 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5 active:scale-[0.97]'
              : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-[0.97]'
          }`}
          title="Cerrar ficha"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Contenido según tipo de objeto */}
      <div className="space-y-4 font-mono text-xs">
        {/* CASO: CONTRACT_RACK o POWER_MODULE */}
        {(type === 'CONTRACT_RACK' || type === 'POWER_MODULE') && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className={`p-3 rounded-2xl border ${
                isDarkTheme ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-[10px] block mb-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>PRODUCCIÓN NETA</span>
                <span className="text-sm font-bold text-[#05DF72]">
                  {rawPayload?.productionCore?.dailyPrlNet || rawPayload?.producedPrl || '0.9519'} PRL/día
                </span>
              </div>
              <div className={`p-3 rounded-2xl border ${
                isDarkTheme ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-[10px] block mb-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>VALOR EN USD</span>
                <span className={`text-sm font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  ${rawPayload?.productionCore?.dailyNetUsd || '1.40'} USD/día
                </span>
              </div>
            </div>

            <div className={`p-3.5 rounded-2xl border space-y-1.5 ${
              isDarkTheme ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'
            }`}>
              <div className="flex justify-between">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>Proyección Mensual:</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  ${rawPayload?.productionCore?.monthlyNetUsd || '41.98'} USD/mes
                </span>
              </div>
              <div className="flex justify-between">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>Retorno Anual (ROI):</span>
                <span className="font-bold text-[#05DF72]">
                  ~{rawPayload?.productionCore?.roiPct || '89.6'}% anual
                </span>
              </div>
              <div className="flex justify-between">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>Tiempo de Retorno:</span>
                <span className="font-bold text-cyan-500">
                  ~{rawPayload?.productionCore?.breakEvenDays || '402'} días
                </span>
              </div>
            </div>
          </>
        )}

        {/* CASO: PRODUCTION_CORE o PROFIT_CORE */}
        {(type === 'PRODUCTION_CORE' || type === 'PROFIT_CORE') && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className={`p-3 rounded-2xl border ${
                isDarkTheme ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-[10px] block mb-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>PRECIO SPOT PRL</span>
                <span className="text-sm font-bold text-cyan-500">$1.47 USD</span>
              </div>
              <div className={`p-3 rounded-2xl border ${
                isDarkTheme ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`text-[10px] block mb-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>TASA BASE (R_BASE)</span>
                <span className="text-sm font-bold text-[#05DF72]">0.000843 PRL/h</span>
              </div>
            </div>

            <div className={`p-3 rounded-2xl border text-[11px] space-y-1 ${
              isDarkTheme ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex justify-between">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>Comisión Operativa:</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>2.0%</span>
              </div>
              <div className="flex justify-between">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>Fuente de Telemetría:</span>
                <span className="text-emerald-500 font-bold">Kryptex Public API</span>
              </div>
            </div>
          </>
        )}

        {/* CASO: PHYSICAL_MINER */}
        {type === 'PHYSICAL_MINER' && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className={`p-2.5 rounded-2xl border ${
                isDarkTheme ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'
              }`}>
                <Thermometer className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                <span className={`text-[10px] block ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>TEMP</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{rawPayload?.temperatureC?.toFixed(1) || '64.5'}°C</span>
              </div>
              <div className={`p-2.5 rounded-2xl border ${
                isDarkTheme ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'
              }`}>
                <Wind className="h-4 w-4 text-cyan-500 mx-auto mb-1" />
                <span className={`text-[10px] block ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>VENT</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{rawPayload?.fanRpm || '4850'} RPM</span>
              </div>
              <div className={`p-2.5 rounded-2xl border ${
                isDarkTheme ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'
              }`}>
                <Zap className="h-4 w-4 text-[#05DF72] mx-auto mb-1" />
                <span className={`text-[10px] block ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>WATTS</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{rawPayload?.powerWatts || '350'} W</span>
              </div>
            </div>

            <div className={`p-3 rounded-2xl border space-y-1 text-[11px] ${
              isDarkTheme ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex justify-between">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>GPU Model:</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{rawPayload?.worker?.gpuModel || 'NVIDIA RTX 4090'}</span>
              </div>
              <div className="flex justify-between">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>Salad Machine ID:</span>
                <span className={`font-mono text-[10px] ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>{rawPayload?.worker?.machineId?.substring(0, 16) || 'salad-node-8a3f'}</span>
              </div>
              <div className="flex justify-between">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>Shares Válidos:</span>
                <span className="text-[#05DF72] font-bold">{rawPayload?.worker?.validShares || 1420}</span>
              </div>
            </div>
          </>
        )}

        {/* Mini Gráfica de Tendencia */}
        <div className="pt-2">
          <div className="flex justify-between items-center text-[11px] mb-2">
            <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>Rendimiento Observado (24h)</span>
            <span className="text-[#05DF72] font-bold">Estable</span>
          </div>
          <div className="h-20 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData}>
                <defs>
                  <linearGradient id="yieldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#05DF72" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#05DF72" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: isDarkTheme ? '#0B0F19' : '#FFFFFF', borderColor: isDarkTheme ? '#334155' : '#E2E8F0', borderRadius: '12px', fontSize: '10px' }}
                />
                <Area type="monotone" dataKey="yield" stroke="#05DF72" strokeWidth={2} fill="url(#yieldGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Botón de acción contextual */}
        <div className="pt-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`w-full py-2.5 rounded-xl border active:scale-[0.97] transition-all cursor-pointer font-bold text-center ${
              isDarkTheme
                ? 'border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10'
                : 'border-slate-200 bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            Regresar a la Escena
          </button>
        </div>
      </div>
    </div>
  );
};
