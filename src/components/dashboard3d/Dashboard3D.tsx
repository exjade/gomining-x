import React, { useState } from 'react';
import { 
  Box, 
  Cpu, 
  Zap, 
  DollarSign, 
  Activity, 
  ShieldCheck, 
  Layers,
  Crosshair,
  Server,
  Radio,
  Clock,
  Compass,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { MiningScene } from '../3d/MiningScene';
import { SceneToolbar } from './SceneToolbar';
import { ObjectDetailsPanel } from './ObjectDetailsPanel';
import { AccessibleObjectList } from './AccessibleObjectList';
import { useMiningVisualization } from '../../hooks/useMiningVisualization';
import { useSceneSelection } from '../../hooks/useSceneSelection';
import type { VisualizationMode } from '../../types/visualization';
import type { CameraAnglePreset } from '../3d/SceneCamera';
import type { MergedGPUWorker, FleetSummary } from '../../types/minerx';

interface Dashboard3DProps {
  summary?: FleetSummary;
  workers?: MergedGPUWorker[];
  alertsCount?: number;
  defaultMode?: VisualizationMode;
  isDarkTheme?: boolean;
}

export const Dashboard3D: React.FC<Dashboard3DProps> = ({
  summary,
  workers = [],
  alertsCount = 0,
  defaultMode = 'CLIENT',
  isDarkTheme = true
}) => {
  // 1. Adaptador de Datos (Mining Visualization Service + Profit Engine)
  const {
    clientNode,
    adminState
  } = useMiningVisualization(summary, workers, alertsCount);

  // 2. Hook de Selección 3D y Lerp de Cámara
  const {
    selectedObject,
    cameraTarget,
    selectObject,
    resetSelection
  } = useSceneSelection();

  // 3. Controles de Visualización y Cámara estilo WareTrack
  const [mode, setMode] = useState<VisualizationMode>(defaultMode);
  const [cameraPreset, setCameraPreset] = useState<CameraAnglePreset>('ISO_45');
  const [is3D, setIs3D] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [healthFilter, setHealthFilter] = useState<string>('ALL');
  const [showAccessibleList, setShowAccessibleList] = useState<boolean>(false);
  const [activeSite, setActiveSite] = useState<string>('all');

  // Cálculos de KPIs financieros unificados (Profit Engine como fuente de verdad)
  const prlPrice = adminState?.profitEngineMetrics.prlPriceUsd || 1.47;
  const baseRate = adminState?.profitEngineMetrics.baseRatePrlHour || 0.0008432;
  const clientHashrate = clientNode?.contractedTh || 48;
  const clientDailyPrl = clientNode?.productionCore.dailyPrlNet || 0.9519;
  const clientDailyUsd = clientNode?.productionCore.dailyNetUsd || 1.40;
  const clientRoi = clientNode?.productionCore.roiPct || 89.6;

  const fleetHashrate = summary?.totalHashrateTHs 
    ? `${summary.totalHashrateTHs.toFixed(1)} TH/s`
    : '1.36 EH/s';
  const fleetWorkersCount = workers.length || 216;

  // WareTrack Feed Items simulados en tiempo real con datos de Kryptex / SaladCloud
  const feedItems = [
    {
      id: 'f1',
      severity: 'ok',
      title: 'Pool Kryptex PearlHash Sincronizado',
      desc: `1371 workers activos • ${fleetHashrate} reportado`,
      time: 'Hace 1m'
    },
    {
      id: 'f2',
      severity: 'ok',
      title: 'SaladCloud GPU Nodes Operativos',
      desc: `${fleetWorkersCount} instancias saludables en contenedor PBR`,
      time: 'Hace 3m'
    },
    {
      id: 'f3',
      severity: 'info',
      title: 'Profit Engine v2 Verificado',
      desc: `R_base fijada en ${baseRate.toFixed(6)} PRL/TH/h`,
      time: 'Hace 7m'
    },
    {
      id: 'f4',
      severity: alertsCount > 0 ? 'warn' : 'ok',
      title: alertsCount > 0 ? `${alertsCount} Alertas en Telemetría` : 'Telemetría de Flota Óptima',
      desc: alertsCount > 0 ? 'Revisar workers con shares rechazados' : '0 cuellos de botella térmicos detectados',
      time: 'Hace 12m'
    }
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-12 select-none">
      {/* ========================================================
          BARRA DE CONTROL SUPERIOR ESTILO WARETRACK
          ======================================================== */}
      <SceneToolbar
        mode={mode}
        onToggleMode={(newMode) => {
          setMode(newMode);
          resetSelection();
        }}
        is3D={is3D}
        onToggle3D={() => setIs3D(!is3D)}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(!isPaused)}
        onResetCamera={() => {
          resetSelection();
          setCameraPreset('ISO_45');
        }}
        healthFilter={healthFilter}
        onSelectHealthFilter={setHealthFilter}
        cameraPreset={cameraPreset}
        onSelectCameraPreset={setCameraPreset}
        isDarkTheme={isDarkTheme}
      />

      {/* ========================================================
          FULL-BLEED 3D COMMAND STAGE CON 4 CORNER HUDs WARETRACK
          ======================================================== */}
      <div className={`relative w-full rounded-3xl border overflow-hidden transition-all shadow-2xl ${
        isDarkTheme 
          ? 'bg-[#060912] border-white/10 shadow-black/80' 
          : 'bg-[#0F1420] border-slate-300 shadow-slate-400/30'
      }`}>
        {/* VIEWPORT CANVAS 3D (Full-Bleed Height 740px - 820px) */}
        <div className="w-full h-[740px] md:h-[820px]">
          <MiningScene
            mode={mode}
            clientNode={clientNode}
            adminState={adminState}
            selectedObject={selectedObject}
            cameraTarget={cameraTarget}
            onSelectObject={selectObject}
            isPaused={isPaused}
            forced2D={!is3D}
            isDarkTheme={isDarkTheme}
            cameraPreset={cameraPreset}
          />
        </div>

        {/* ----------------------------------------------------
            HUD TOP-LEFT (#hud-tl): FLEET & CONTRACT MACRO KPI
            ---------------------------------------------------- */}
        <div className="absolute top-4 left-4 z-20 w-80 max-w-[calc(100vw-2rem)] pointer-events-auto">
          <div className={`p-4 rounded-2xl border backdrop-blur-2xl transition-all shadow-2xl ${
            isDarkTheme 
              ? 'bg-[#0A0E17]/85 border-white/10 text-white shadow-black/70' 
              : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-400/40'
          }`}>
            {/* Header */}
            <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#05DF72]/20 border border-[#05DF72]/40 text-[#05DF72]">
                  <Box className="h-4 w-4" />
                </div>
                <div>
                  <h3 className={`text-xs font-bold font-mono tracking-wider uppercase ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    MinerX Command Tower
                  </h3>
                  <span className={`text-[10px] font-mono block -mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                    {mode === 'CLIENT' ? 'Bóveda de Producción Contratada' : 'Telemetría de Flota e Infraestructura'}
                  </span>
                </div>
              </div>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30 animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-[#05DF72]" />
                LIVE
              </span>
            </div>

            {/* Grid de Métricas Principales */}
            <div className="grid grid-cols-2 gap-2 pt-3">
              <div className={`p-2.5 rounded-xl border ${isDarkTheme ? 'bg-white/[0.03] border-white/5' : 'bg-slate-50 border-slate-200 shadow-xs'}`}>
                <span className={`text-[9px] font-mono uppercase block mb-0.5 font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  {mode === 'CLIENT' ? 'Potencia Minera' : 'Flota Observada'}
                </span>
                <div className={`text-sm font-mono font-bold flex items-center gap-1 ${isDarkTheme ? 'text-cyan-400' : 'text-cyan-700'}`}>
                  <Cpu className="h-3.5 w-3.5" />
                  <span>{mode === 'CLIENT' ? `${clientHashrate} TH/s` : fleetHashrate}</span>
                </div>
                <span className={`text-[9px] font-mono block mt-0.5 font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  {mode === 'CLIENT' ? 'Minero 1 Dedicado' : `${fleetWorkersCount} Workers Activos`}
                </span>
              </div>

              <div className={`p-2.5 rounded-xl border ${isDarkTheme ? 'bg-white/[0.03] border-white/5' : 'bg-slate-50 border-slate-200 shadow-xs'}`}>
                <span className={`text-[9px] font-mono uppercase block mb-0.5 font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  Precio Spot PRL
                </span>
                <div className={`text-sm font-mono font-bold flex items-center gap-1 ${isDarkTheme ? 'text-[#05DF72]' : 'text-emerald-700'}`}>
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>${prlPrice.toFixed(2)} USD</span>
                </div>
                <span className={`text-[9px] font-mono block mt-0.5 font-bold ${isDarkTheme ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  Kryptex Public API
                </span>
              </div>

              <div className={`p-2.5 rounded-xl border ${isDarkTheme ? 'bg-white/[0.03] border-white/5' : 'bg-slate-50 border-slate-200 shadow-xs'}`}>
                <span className={`text-[9px] font-mono uppercase block mb-0.5 font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  Retorno Neto / Día
                </span>
                <div className={`text-sm font-mono font-bold flex items-center gap-1 ${isDarkTheme ? 'text-amber-400' : 'text-amber-700'}`}>
                  <Zap className="h-3.5 w-3.5" />
                  <span>{clientDailyPrl.toFixed(4)} PRL</span>
                </div>
                <span className={`text-[9px] font-mono block mt-0.5 font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  ≈ ${clientDailyUsd.toFixed(2)} USD / día
                </span>
              </div>

              <div className={`p-2.5 rounded-xl border ${isDarkTheme ? 'bg-white/[0.03] border-white/5' : 'bg-slate-50 border-slate-200 shadow-xs'}`}>
                <span className={`text-[9px] font-mono uppercase block mb-0.5 font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  ROI Anual Proyectado
                </span>
                <div className={`text-sm font-mono font-bold ${isDarkTheme ? 'text-[#05DF72]' : 'text-emerald-700'}`}>
                  +{clientRoi.toFixed(1)}% / año
                </div>
                <span className={`text-[9px] font-mono block mt-0.5 font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  s/ Costo Base
                </span>
              </div>
            </div>

            {/* Micro Badge Profit Engine Single Source of Truth */}
            <div className={`mt-3 pt-2.5 border-t flex items-center justify-between text-[10px] font-mono ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
              <span className={`flex items-center gap-1 font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-700'}`}>
                <ShieldCheck className={`h-3.5 w-3.5 ${isDarkTheme ? 'text-[#05DF72]' : 'text-emerald-600'}`} />
                Profit Engine v2
              </span>
              <span className={`font-bold ${isDarkTheme ? 'text-[#05DF72]' : 'text-emerald-700'}`}>VERIFICADO</span>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------
            HUD TOP-RIGHT (#hud-tr): WARETRACK FACILITY SWITCHER
            ---------------------------------------------------- */}
        <div className="absolute top-4 right-4 z-20 pointer-events-auto hidden sm:block">
          <div className={`p-2 rounded-2xl border backdrop-blur-2xl transition-all shadow-2xl flex flex-col gap-1.5 w-56 ${
            isDarkTheme 
              ? 'bg-[#0A0E17]/85 border-white/10 text-white shadow-black/70' 
              : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-400/40'
          }`}>
            <div className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider font-bold flex items-center gap-1.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-700'}`}>
              <Compass className="h-3 w-3 text-cyan-500" />
              <span>Instalaciones & Sitios</span>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveSite('kryptex');
                setMode('ADMIN');
                setCameraPreset('ISO_45');
              }}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-mono transition-all text-left active:scale-[0.97] cursor-pointer ${
                activeSite === 'kryptex' && mode === 'ADMIN'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 font-bold'
                  : isDarkTheme ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <span className="truncate flex items-center gap-1.5">
                <Server className="h-3 w-3 text-cyan-400 shrink-0" />
                Pool Kryptex PearlHash
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-bold">1.36 EH</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSite('salad');
                setMode('ADMIN');
                setCameraPreset('TOP_DOWN');
              }}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-mono transition-all text-left active:scale-[0.97] cursor-pointer ${
                activeSite === 'salad' && mode === 'ADMIN'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold'
                  : isDarkTheme ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <span className="truncate">SaladCloud GPU Farm</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">216 W</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSite('contract');
                setMode('CLIENT');
                setCameraPreset('FOCUS');
              }}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-mono transition-all text-left active:scale-[0.97] cursor-pointer ${
                mode === 'CLIENT'
                  ? 'bg-[#05DF72]/20 text-[#05DF72] border border-[#05DF72]/40 font-bold'
                  : isDarkTheme ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <span className="truncate">Bóveda Contrato (48 TH)</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#05DF72]/10 text-[#05DF72] font-bold">CLIENT</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSite('all');
                resetSelection();
                setCameraPreset('ORBIT');
              }}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-mono transition-all text-left active:scale-[0.97] cursor-pointer ${
                cameraPreset === 'ORBIT'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 font-bold'
                  : isDarkTheme ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <span className="truncate">Panorama Órbita 360°</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold">360°</span>
            </button>
          </div>
        </div>

        {/* ----------------------------------------------------
            HUD BOTTOM-LEFT (#hud-bl): WARETRACK LIVE INCIDENT FEED
            ---------------------------------------------------- */}
        <div className="absolute bottom-4 left-4 z-20 w-80 max-w-[calc(100vw-2rem)] pointer-events-auto hidden md:block">
          <div className={`p-3.5 rounded-2xl border backdrop-blur-2xl transition-all shadow-2xl ${
            isDarkTheme 
              ? 'bg-[#0A0E17]/85 border-white/10 text-white shadow-black/70' 
              : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-400/40'
          }`}>
            <div className={`flex items-center justify-between pb-2 mb-2 border-b ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
              <span className={`text-[10px] font-mono uppercase tracking-wider font-bold flex items-center gap-1.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-700'}`}>
                <Radio className="h-3.5 w-3.5 text-[#05DF72] animate-pulse" />
                Live Incident & Shift Feed
              </span>
              <span className="text-[9px] font-mono text-cyan-500 font-bold">ACTIVO</span>
            </div>

            <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
              {feedItems.map((item) => (
                <div 
                  key={item.id}
                  className={`p-2 rounded-xl border transition-all text-xs font-mono relative overflow-hidden ${
                    isDarkTheme ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {/* Barra lateral de severidad WareTrack */}
                  <div className={`absolute top-0 left-0 bottom-0 w-1 ${
                    item.severity === 'bad' ? 'bg-rose-500' :
                    item.severity === 'warn' ? 'bg-amber-400' :
                    item.severity === 'info' ? 'bg-cyan-400' : 'bg-[#05DF72]'
                  }`} />
                  
                  <div className="pl-2 flex items-start justify-between gap-1">
                    <span className="font-bold text-[11px] truncate flex items-center gap-1">
                      {item.severity === 'bad' || item.severity === 'warn' ? (
                        <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 text-[#05DF72] shrink-0" />
                      )}
                      <span className={isDarkTheme ? 'text-white' : 'text-slate-900'}>{item.title}</span>
                    </span>
                    <span className={`text-[9px] shrink-0 flex items-center gap-0.5 ${isDarkTheme ? 'text-slate-500' : 'text-slate-600'}`}>
                      <Clock className="h-2.5 w-2.5" />
                      {item.time}
                    </span>
                  </div>
                  <p className={`pl-2 text-[10px] mt-0.5 truncate ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------
            HUD BOTTOM-RIGHT (#hud-br): CONTEXTUAL TACTICAL INSPECTOR
            ---------------------------------------------------- */}
        <div className="absolute bottom-4 right-4 z-20 max-w-sm sm:max-w-md w-full pointer-events-auto">
          {selectedObject ? (
            <div className="animate-in slide-in-from-right duration-300">
              <ObjectDetailsPanel
                selectedObject={selectedObject}
                onClose={resetSelection}
                isDarkTheme={isDarkTheme}
              />
            </div>
          ) : (
            <div className={`p-4 rounded-2xl border backdrop-blur-2xl transition-all shadow-2xl hidden sm:block ${
              isDarkTheme 
                ? 'bg-[#0A0E17]/85 border-white/10 text-white shadow-black/70' 
                : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-400/40'
            }`}>
              <div className={`flex items-center gap-2 pb-2 border-b ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
                <Crosshair className="h-4 w-4 text-cyan-500 animate-spin" style={{ animationDuration: '8s' }} />
                <span className={`text-xs font-mono font-bold tracking-wider uppercase ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  Inspector Táctico en Espera
                </span>
              </div>
              <p className={`text-[11px] font-mono mt-2 leading-relaxed ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                Selecciona cualquier Rack, Servidor, Módulo o Núcleo en el espacio 3D para activar la retícula vectorial WareTrack y ver telemetría de producción.
              </p>
              <div className={`flex items-center gap-2 mt-3 pt-2 border-t ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-600 border border-cyan-500/20 font-bold">
                  Retícula 3D Activa
                </span>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold">
                  Telemetría Unificada
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Floating Mobile Hint */}
        <div className="absolute bottom-2 left-2 z-10 sm:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/70 border border-white/10 backdrop-blur-md text-[10px] font-mono text-slate-300 pointer-events-none">
          <Activity className="h-2.5 w-2.5 text-[#05DF72] animate-pulse" />
          <span>Toca un objeto 3D para inspección</span>
        </div>
      </div>

      {/* ========================================================
          ACCESIBILIDAD 2D (WCAG) Y NAVEGACIÓN ALTERNATIVA
          ======================================================== */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => setShowAccessibleList(!showAccessibleList)}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
            showAccessibleList
              ? 'bg-[#05DF72]/15 border-[#05DF72]/40 text-[#05DF72]'
              : isDarkTheme
              ? 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
              : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>{showAccessibleList ? 'Ocultar Navegación Accesible 2D' : 'Mostrar Lista de Elementos Accesible (WCAG)'}</span>
        </button>

        <span className={`text-[11px] font-mono hidden sm:inline ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
          Retícula Vectorial PBR • OrbitControls • React Three Fiber 19
        </span>
      </div>

      {showAccessibleList && (
        <AccessibleObjectList
          mode={mode}
          clientNode={clientNode}
          adminState={adminState}
          onSelectObject={(obj) => {
            selectObject(obj);
            window.scrollTo({ top: 120, behavior: 'smooth' });
          }}
          isDarkTheme={isDarkTheme}
        />
      )}
    </div>
  );
};
