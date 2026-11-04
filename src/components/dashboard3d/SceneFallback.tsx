import React from 'react';
import { 
  Server, 
  CheckCircle2,
  Activity,
  Layers,
  TrendingUp
} from 'lucide-react';
import type { 
  VisualizationMode, 
  ClientVisualizationContractNode, 
  AdminVisualizationState, 
  Selected3DObject 
} from '../../types/visualization';

interface SceneFallbackProps {
  mode: VisualizationMode;
  clientNode: ClientVisualizationContractNode | null;
  adminState: AdminVisualizationState | null;
  selectedObject: Selected3DObject | null;
  onSelectObject: (obj: Selected3DObject | null) => void;
  isDarkTheme?: boolean;
}

export const SceneFallback: React.FC<SceneFallbackProps> = ({
  mode,
  clientNode,
  adminState,
  selectedObject,
  onSelectObject,
  isDarkTheme = true
}) => {
  return (
    <div className={`w-full min-h-[580px] p-6 rounded-3xl border flex flex-col justify-between transition-all ${
      isDarkTheme
        ? 'bg-[#080B12] border-white/10 text-white'
        : 'bg-white border-slate-200 text-slate-900 shadow-sm'
    }`}>
      {/* ======================================================== */}
      {/* 1. MODO CLIENTE: INSTALACIÓN MODULAR TÁCTICA 2D           */}
      {/* ======================================================== */}
      {mode === 'CLIENT' && clientNode && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header de Contrato */}
          <div className={`flex flex-wrap items-center justify-between gap-4 pb-5 border-b ${
            isDarkTheme ? 'border-white/10' : 'border-slate-100'
          }`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-[#05DF72] border border-emerald-500/20">
                  ESQUEMA 2D TÁCTICO · CONTRATO EN TIEMPO REAL
                </span>
                <span className="text-xs font-mono text-slate-400">ID: {clientNode.contractId}</span>
              </div>
              <h3 className={`text-2xl font-bold font-sans mt-1.5 ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                {clientNode.packageName}
              </h3>
              <p className={`text-xs font-mono mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                {clientNode.contractedTh} TH/s Contratados • Asignación 100% Verificada en MinerX Profit Engine
              </p>
            </div>

            <div className={`p-4 rounded-2xl border text-right ${
              isDarkTheme ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400">Producción Neta Diaria</div>
              <div className="text-2xl font-mono font-bold text-[#05DF72]">
                {clientNode.productionCore.dailyPrlNet} <span className="text-xs">PRL/día</span>
              </div>
              <div className="text-xs font-mono text-emerald-400 font-semibold mt-0.5">
                ≈ ${clientNode.productionCore.dailyNetUsd} USD • ROI Proyectado: +{clientNode.productionCore.roiPct}% / año
              </div>
            </div>
          </div>

          {/* DIAGRAMA ISOMÉTRICO 2D: RACK DIGITAL Y MÓDULOS DE POTENCIA */}
          <div>
            <div className={`text-xs font-mono font-bold uppercase tracking-wider mb-3 flex items-center justify-between ${
              isDarkTheme ? 'text-slate-400' : 'text-slate-600'
            }`}>
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#05DF72]" />
                <span>Módulos de Cómputo Asignados (Power Blades)</span>
              </div>
              <span className="text-[11px] font-normal lowercase">haz clic en un blade para inspeccionar</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {clientNode.powerModules.map((mod) => {
                const isSelected = selectedObject?.id === mod.id;
                return (
                  <div
                    key={mod.id}
                    onClick={() => onSelectObject({
                      id: mod.id,
                      type: 'POWER_MODULE',
                      title: mod.label,
                      subtitle: `${mod.powerTh} TH/s • ${mod.producedPrl} PRL/día`,
                      healthStatus: mod.status,
                      position: [0, 0, 0],
                      rawPayload: mod
                    })}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/40 ring-2 ring-cyan-500/30 shadow-lg'
                        : isDarkTheme
                        ? 'bg-[#0B0F19] border-white/10 hover:border-[#05DF72]/40'
                        : 'bg-slate-50 border-slate-200 hover:border-[#05DF72]/40 shadow-sm'
                    }`}
                  >
                    {/* Top edge glow strip */}
                    <div className={`h-1 w-full absolute top-0 left-0 transition-opacity ${
                      isSelected ? 'bg-cyan-400 opacity-100' : 'bg-[#05DF72] opacity-40 group-hover:opacity-100'
                    }`} />

                    <div className="flex justify-between items-start mb-3 pt-1">
                      <div>
                        <span className={`text-xs font-bold font-mono block ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                          {mod.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">Eficiencia 17.5 J/TH</span>
                      </div>
                      <CheckCircle2 className="h-4 w-4 text-[#05DF72]" />
                    </div>

                    <div className="flex items-baseline justify-between pt-2 border-t border-white/5">
                      <span className="text-2xl font-mono font-bold text-[#05DF72]">
                        {mod.powerTh} <span className="text-xs text-slate-400">TH/s</span>
                      </span>
                      <span className="text-xs font-mono font-semibold text-cyan-400">
                        {mod.producedPrl} PRL/d
                      </span>
                    </div>

                    {/* Barra de progreso de actividad */}
                    <div className="w-full bg-black/20 h-1.5 rounded-full mt-3 overflow-hidden">
                      <div className="bg-[#05DF72] h-full rounded-full w-[94%]" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* NÚCLEO FINANCIERO Y PROYECCIÓN */}
          <div className={`p-5 rounded-2xl border ${
            isDarkTheme ? 'bg-[#0B0F19] border-white/10' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <h4 className={`text-sm font-bold font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    Rendimiento Acumulado del Contrato
                  </h4>
                  <p className="text-xs font-mono text-slate-400">
                    Proyección calculada con precio spot Kryptex de $1.47 USD / PEARL
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 font-mono">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block uppercase">Proyección 30 Días</span>
                  <span className="text-sm font-bold text-[#05DF72]">
                    ${clientNode.productionCore.monthlyNetUsd} USD
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block uppercase">Retorno Estimado</span>
                  <span className="text-sm font-bold text-cyan-400">
                    ~{clientNode.productionCore.breakEvenDays} días
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. MODO ADMIN: ESQUEMA DE DATACENTER FÍSICO 2D             */}
      {/* ======================================================== */}
      {mode === 'ADMIN' && adminState && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className={`flex flex-wrap items-center justify-between gap-4 pb-5 border-b ${
            isDarkTheme ? 'border-white/10' : 'border-slate-100'
          }`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  INFRAESTRUCTURA DE DATACENTER · ESQUEMA TÁCTICO
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {adminState.summary.activeMiningGPUs}/{adminState.summary.totalAllocatedGPUs} GPUs Minando
                </span>
              </div>
              <h3 className={`text-2xl font-bold font-sans mt-1.5 ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                Flota Global PoUW & Clústeres GPU
              </h3>
              <p className={`text-xs font-mono mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                Hashrate Observado: {adminState.summary.totalHashrateTHs.toFixed(1)} TH/s • Telemetría Kryptex Pool Verificada
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl border text-right ${
                isDarkTheme ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="block text-[10px] font-mono text-slate-400 uppercase">Tasa Base R_base</span>
                <span className={`font-mono font-bold text-xs ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  {adminState.profitEngineMetrics.baseRatePrlHour} PRL/h
                </span>
              </div>
              <div className={`p-3 rounded-2xl border text-right ${
                isDarkTheme ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="block text-[10px] font-mono text-slate-400 uppercase">Spot PEARL</span>
                <span className="font-mono font-bold text-cyan-400 text-xs">
                  ${adminState.profitEngineMetrics.prlPriceUsd.toFixed(2)} USD
                </span>
              </div>
            </div>
          </div>

          {/* Grilla de Racks Físicos del Datacenter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {adminState.racks.map((rack) => (
              <div
                key={rack.rackId}
                onClick={() => onSelectObject({
                  id: rack.rackId,
                  type: 'SERVER_RACK',
                  title: rack.rackLabel,
                  subtitle: `${rack.totalHashrateTh.toFixed(1)} TH/s • ${rack.activeGpus} GPUs`,
                  healthStatus: rack.status,
                  position: [0, 0, 0],
                  rawPayload: rack
                })}
                className={`p-5 rounded-3xl border transition-all cursor-pointer relative overflow-hidden group ${
                  selectedObject?.id === rack.rackId
                    ? 'bg-cyan-500/10 border-cyan-500/40 ring-2 ring-cyan-500/20'
                    : isDarkTheme
                    ? 'bg-[#0B0F19] border-white/10 hover:border-cyan-500/30'
                    : 'bg-slate-50 border-slate-200 hover:border-cyan-500/30 shadow-sm'
                }`}
              >
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                      <Server className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className={`text-sm font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                        {rack.rackLabel}
                      </h4>
                      <span className="text-[10px] font-mono text-slate-400">{rack.accountName}</span>
                    </div>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                    rack.status === 'OPTIMAL'
                      ? 'bg-emerald-500/10 text-[#05DF72] border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {rack.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className={`p-2.5 rounded-2xl border ${
                    isDarkTheme ? 'bg-black/30 border-white/5' : 'bg-white border-slate-200'
                  }`}>
                    <span className="block text-[10px] text-slate-400 font-mono">POTENCIA</span>
                    <span className={`font-mono font-bold text-xs ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                      {rack.totalHashrateTh.toFixed(1)} TH/s
                    </span>
                  </div>
                  <div className={`p-2.5 rounded-2xl border ${
                    isDarkTheme ? 'bg-black/30 border-white/5' : 'bg-white border-slate-200'
                  }`}>
                    <span className="block text-[10px] text-slate-400 font-mono">BLADES ACTIVA</span>
                    <span className="font-mono font-bold text-[#05DF72] text-xs">
                      {rack.activeGpus}/{rack.totalGpus}
                    </span>
                  </div>
                  <div className={`p-2.5 rounded-2xl border ${
                    isDarkTheme ? 'bg-black/30 border-white/5' : 'bg-white border-slate-200'
                  }`}>
                    <span className="block text-[10px] text-slate-400 font-mono">EFICIENCIA</span>
                    <span className="font-mono font-bold text-cyan-400 text-xs">
                      {rack.overallEfficiencyPct.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Sub-lista de servidores dentro del rack */}
                <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5">
                  <span className="text-[10px] font-mono text-slate-400 block uppercase">
                    Servidores Blade en Rack ({rack.miners.length}):
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {rack.miners.slice(0, 4).map((m, idx) => (
                      <div
                        key={idx}
                        className="px-2 py-1 rounded-lg bg-black/20 text-[10px] font-mono flex items-center justify-between"
                      >
                        <span className="text-slate-300 truncate max-w-[90px]">{m.worker.gpuModel}</span>
                        <span className="text-emerald-400 font-bold">{m.temperatureC.toFixed(0)}°C</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FOOTER INFORMATIVO */}
      <div className={`pt-4 border-t flex flex-wrap items-center justify-between text-xs font-mono ${
        isDarkTheme ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-500'
      }`}>
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-[#05DF72]" />
          <span>Modo 2D Táctico Operacional • Cero consumo de GPU WebGL</span>
        </div>
        <span className="text-[11px]">
          Fórmula Unificada MinerX Profit Engine v3
        </span>
      </div>
    </div>
  );
};
