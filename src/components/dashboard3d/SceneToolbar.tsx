import React from 'react';
import { 
  RotateCcw, 
  Play, 
  Pause, 
  Box, 
  Layers, 
  ShieldCheck, 
  AlertTriangle,
  User,
  Shield,
  Compass,
  Crosshair
} from 'lucide-react';
import type { VisualizationMode } from '../../types/visualization';
import type { CameraAnglePreset } from '../3d/SceneCamera';

interface SceneToolbarProps {
  mode: VisualizationMode;
  onToggleMode: (m: VisualizationMode) => void;
  is3D: boolean;
  onToggle3D: () => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onResetCamera: () => void;
  healthFilter: string;
  onSelectHealthFilter: (f: string) => void;
  cameraPreset?: CameraAnglePreset;
  onSelectCameraPreset?: (preset: CameraAnglePreset) => void;
  isDarkTheme?: boolean;
}

export const SceneToolbar: React.FC<SceneToolbarProps> = ({
  mode,
  onToggleMode,
  is3D,
  onToggle3D,
  isPaused,
  onTogglePause,
  onResetCamera,
  healthFilter,
  onSelectHealthFilter,
  cameraPreset = 'ISO_45',
  onSelectCameraPreset,
  isDarkTheme = true
}) => {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2.5 p-2 rounded-2xl border backdrop-blur-2xl transition-all shadow-xl ${
      isDarkTheme 
        ? 'bg-[#0A0E17]/85 border-white/[0.08] text-white shadow-black/60' 
        : 'bg-white/90 border-slate-200/90 text-slate-900 shadow-slate-300/40'
    }`}>
      {/* 1. Selector de Modo: [Cliente 3D] | [Admin Infra] */}
      <div className={`flex items-center gap-1 p-1 rounded-xl border ${
        isDarkTheme ? 'bg-[#080B12]/80 border-white/5' : 'bg-slate-100 border-slate-200'
      }`}>
        <button
          type="button"
          onClick={() => onToggleMode('CLIENT')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
            mode === 'CLIENT'
              ? 'bg-[#05DF72] text-slate-950 shadow-sm'
              : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <User className="h-3.5 w-3.5" />
          <span>Cliente 3D</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleMode('ADMIN')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
            mode === 'ADMIN'
              ? 'bg-[#00F0FF] text-slate-950 shadow-sm'
              : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Shield className="h-3.5 w-3.5" />
          <span>Admin Infra</span>
        </button>
      </div>

      {/* 2. ÁNGULOS DE CÁMARA WARETRACK (ISO, TOP-DOWN, FOCUS, ORBIT) */}
      <div className={`flex items-center gap-1 p-1 rounded-xl border ${
        isDarkTheme ? 'bg-[#080B12]/80 border-white/5' : 'bg-slate-100 border-slate-200'
      }`}>
        <button
          type="button"
          onClick={() => onSelectCameraPreset?.('ISO_45')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
            cameraPreset === 'ISO_45'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
              : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Vista Isométrica 45° de Comando"
        >
          <Box className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">ISO 45°</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectCameraPreset?.('TOP_DOWN')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
            cameraPreset === 'TOP_DOWN'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
              : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Vista Cenital Táctica 60° (Grid Aéreo)"
        >
          <Compass className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Cenital 60°</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectCameraPreset?.('FOCUS')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
            cameraPreset === 'FOCUS'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
              : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Zoom y enfoque táctico al componente seleccionado"
        >
          <Crosshair className="h-3.5 w-3.5 text-amber-400" />
          <span className="hidden sm:inline">Focus</span>
        </button>
      </div>

      {/* 3. Filtros de Estado */}
      <div className="hidden md:flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSelectHealthFilter('ALL')}
          className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
            healthFilter === 'ALL'
              ? isDarkTheme ? 'bg-white/10 text-white border border-white/10' : 'bg-slate-200 text-slate-900'
              : isDarkTheme ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Todos
        </button>
        <button
          type="button"
          onClick={() => onSelectHealthFilter('OPTIMAL')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
            healthFilter === 'OPTIMAL'
              ? 'bg-emerald-500/20 text-[#05DF72] border border-emerald-500/30'
              : isDarkTheme ? 'text-slate-400 hover:text-emerald-400' : 'text-slate-500 hover:text-emerald-700'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Óptimos</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectHealthFilter('ALERTS')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
            healthFilter === 'ALERTS'
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : isDarkTheme ? 'text-slate-400 hover:text-rose-400' : 'text-slate-500 hover:text-rose-700'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Alertas</span>
        </button>
      </div>

      {/* 4. Acciones de Escena: Reset Cámara, Pausa de Animaciones, Conmutador 3D/2D */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onResetCamera}
          className={`p-2 rounded-xl border text-xs transition-all active:scale-[0.97] cursor-pointer ${
            isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
          }`}
          title="Restablecer posición de cámara al centro"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onTogglePause}
          className={`p-2 rounded-xl border text-xs transition-all active:scale-[0.97] cursor-pointer ${
            isPaused
              ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
              : isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
          }`}
          title={isPaused ? "Reanudar animaciones" : "Pausar animaciones (Ahorro GPU)"}
        >
          {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={onToggle3D}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
            is3D
              ? 'bg-emerald-500/15 border-emerald-500/30 text-[#05DF72]'
              : 'bg-cyan-500/15 border-cyan-500/30 text-[#00F0FF]'
          }`}
          title="Alternar entre motor 3D interactivo y esquema 2D táctico"
        >
          {is3D ? <Box className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
          <span>{is3D ? 'Modo 3D' : 'Modo 2D'}</span>
        </button>
      </div>
    </div>
  );
};
