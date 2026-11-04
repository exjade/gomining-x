import React, { useState } from 'react';
import type { 
  AntminerPose, 
  AntminerSubassembly, 
  AntminerS9Telemetry 
} from './AntminerS9Model';
import { BASE_TELEMETRY } from './AntminerS9Model';
import { AntminerS9Figure } from './AntminerS9Figure';
import { AntminerS9TelemetryPanel } from './AntminerS9TelemetryPanel';

interface AntminerS9HeroViewProps {
  initialTelemetry?: AntminerS9Telemetry;
  isDarkTheme?: boolean;
}

export const AntminerS9HeroView: React.FC<AntminerS9HeroViewProps> = ({
  initialTelemetry = BASE_TELEMETRY,
  isDarkTheme = true
}) => {
  const [telemetry] = useState<AntminerS9Telemetry>(initialTelemetry);
  const [currentPose, setCurrentPose] = useState<AntminerPose>('ASSEMBLED');
  const [selectedSub, setSelectedSub] = useState<AntminerSubassembly | null>(null);

  const poses: { id: AntminerPose; label: string; icon: string }[] = [
    { id: 'ASSEMBLED', label: 'Operación Ensamblada', icon: '🔒' },
    { id: 'EXPLODED', label: 'Despiece Mecánico', icon: '🔍' },
    { id: 'FAN_CUTAWAY', label: 'Corte Ventilador Admisión', icon: '💨' },
    { id: 'CONTROL_TOP', label: 'Inspección Placa Control', icon: '⚡' }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* 1. HERO HEADER WITH POSE CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Anatomía de Hardware ASIC · Bitmain Antminer S9
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30">
              Hero Anatomy Figure
            </span>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            Ilustración técnica isométrica de alta fidelidad, 104 componentes mecánicos y telemetría de 189 chips BM1387.
          </p>
        </div>

        {/* POSE BUTTONS */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl border bg-black/20 border-white/5">
          {poses.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setCurrentPose(p.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
                currentPose === p.id
                  ? 'bg-[#05DF72] text-slate-950 shadow-md font-bold'
                  : isDarkTheme
                  ? 'text-slate-400 hover:text-white hover:bg-white/5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. THE ANATOMY ISOMETRIC FIGURE (HERO SVG CARD) */}
      <AntminerS9Figure
        telemetry={telemetry}
        initialPose={currentPose}
        isDarkTheme={isDarkTheme}
        onSelectSubassembly={(sub) => setSelectedSub(sub)}
        onPoseChange={(p) => setCurrentPose(p)}
      />

      {/* 3. EXTERNAL TELEMETRY PANEL (OUTSIDE REACT UI LAYER) */}
      <AntminerS9TelemetryPanel
        telemetry={telemetry}
        activeSubassembly={selectedSub}
        isDarkTheme={isDarkTheme}
      />
    </div>
  );
};
