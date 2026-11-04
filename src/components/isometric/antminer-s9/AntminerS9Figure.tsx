import React, { useState, useEffect, useMemo } from 'react';
import type { 
  AntminerPose, 
  AntminerSubassembly, 
  AntminerS9Telemetry 
} from './AntminerS9Model';
import { 
  BASE_TELEMETRY,
  formatReadout 
} from './AntminerS9Model';
import { AntminerS9Geometry } from './AntminerS9Geometry';
import './antminer-s9.css';
import '../anatomy-kit/iso.css';

interface AntminerS9FigureProps {
  telemetry?: AntminerS9Telemetry;
  initialPose?: AntminerPose;
  isDarkTheme?: boolean;
  onSelectSubassembly?: (sub: AntminerSubassembly | null) => void;
  onPoseChange?: (pose: AntminerPose) => void;
}

export const AntminerS9Figure: React.FC<AntminerS9FigureProps> = ({
  telemetry = BASE_TELEMETRY,
  initialPose = 'ASSEMBLED',
  isDarkTheme = true,
  onSelectSubassembly,
  onPoseChange
}) => {
  const [pose, setPose] = useState<AntminerPose>(initialPose);
  const [activeSub, setActiveSub] = useState<AntminerSubassembly | null>(null);
  const [fanAngle, setFanAngle] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Instancia única del generador de geometría
  const geometry = useMemo(() => new AntminerS9Geometry(), []);

  // Animación suave de rotación de las aspas de ventilación
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setFanAngle((prev) => (prev + 18) % 360);
    }, 40);
    return () => clearInterval(interval);
  }, [isPaused]);

  const handleTogglePose = () => {
    const nextPose: AntminerPose = pose === 'ASSEMBLED' ? 'EXPLODED' : 'ASSEMBLED';
    setPose(nextPose);
    onPoseChange?.(nextPose);
  };

  const handleSubassemblyClick = (sub: AntminerSubassembly) => {
    const next = activeSub === sub ? null : sub;
    setActiveSub(next);
    onSelectSubassembly?.(next);
  };

  // Generar todos los elementos y el halo de contacto
  const { items, haloSvg } = useMemo(() => {
    return geometry.generateScene(pose, activeSub, fanAngle);
  }, [geometry, pose, activeSub, fanAngle]);

  const readoutText = useMemo(() => {
    return formatReadout(telemetry, activeSub, pose);
  }, [telemetry, activeSub, pose]);

  return (
    <div className={`iso ${isDarkTheme ? '' : 'iso-light'} s9-anatomy-container`} data-theme={isDarkTheme ? 'dark' : 'light'}>
      {/* 1. CONTENEDOR FIGURA ANATOMY (PLATE) */}
      <div className="s9-card">
        {/* ESQUINAS ANATOMY: FIGURA, TÍTULO, PISTA Y LIVE READOUT */}
        <div className="s9-card-corners">
          <div className="flex items-center gap-3">
            <span className="s9-corner-badge">
              FIG 01 · ANATOMY HARDWARE
            </span>
            <span className="s9-corner-title">
              BITMAIN ANTMINER S9 (16nm FinFET BM1387)
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="s9-corner-hint hidden sm:inline">
              Click o Barra Espaciadora para {pose === 'ASSEMBLED' ? 'Explosionar' : 'Ensamblar'}
            </span>
            <span className="s9-corner-readout">
              {readoutText}
            </span>
          </div>
        </div>

        {/* 2. ESCENARIO ISOMÉTRICO SVG */}
        <div 
          className="s9-viewport"
          tabIndex={0}
          role="region"
          aria-label="Ilustración técnica isométrica interactiva del Antminer S9"
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              handleTogglePose();
            }
          }}
          onClick={handleTogglePose}
        >
          <svg
            viewBox="0 0 800 480"
            className="s9-svg-canvas"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Gradiente metálico para bujes de motor */}
              <linearGradient id="metallicGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#CBD5E1" />
                <stop offset="50%" stopColor="#64748B" />
                <stop offset="100%" stopColor="#334155" />
              </linearGradient>

              {/* Filtro de halo para LEDs y contactos activos */}
              <filter id="glowGreen" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* HALO DE CONTACTO SUAVE EN EL BANCO */}
            <g dangerouslySetInnerHTML={{ __html: haloSvg }} />

            {/* ELEMENTOS ORDENADOS EN PROFUNDIDAD (PAINTER'S ORDER) */}
            {items.map((item) => (
              <g
                key={item.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSubassemblyClick(item.subassembly);
                }}
                onMouseEnter={() => setActiveSub(item.subassembly)}
                onMouseLeave={() => setActiveSub(null)}
                style={{ cursor: 'pointer' }}
                dangerouslySetInnerHTML={{ __html: item.svg }}
              />
            ))}
          </svg>
        </div>

        {/* 3. LEYENDA Y CONTROL DE POSE */}
        <div className="s9-legend">
          <div className="s9-legend-keys">
            <span 
              className={`s9-legend-key ${activeSub === 'CHASSIS' ? 'active' : ''}`}
              onClick={() => handleSubassemblyClick('CHASSIS')}
            >
              <span className="s9-swatch-dot" style={{ background: '#64748B' }} />
              Chasis Aluminio
            </span>
            <span 
              className={`s9-legend-key ${activeSub === 'FAN_FRONT' ? 'active' : ''}`}
              onClick={() => handleSubassemblyClick('FAN_FRONT')}
            >
              <span className="s9-swatch-dot" style={{ background: '#05DF72' }} />
              Ventilador Admisión (120mm)
            </span>
            <span 
              className={`s9-legend-key ${activeSub === 'CONTROL_BOARD' ? 'active' : ''}`}
              onClick={() => handleSubassemblyClick('CONTROL_BOARD')}
            >
              <span className="s9-swatch-dot" style={{ background: '#38BDF8' }} />
              Placa Control Xilinx
            </span>
            <span 
              className={`s9-legend-key ${activeSub === 'HASHBOARD_0' || activeSub === 'HASHBOARD_1' || activeSub === 'HASHBOARD_2' ? 'active' : ''}`}
              onClick={() => handleSubassemblyClick('HASHBOARD_1')}
            >
              <span className="s9-swatch-dot" style={{ background: '#10B981' }} />
              3x Hashboards (189 BM1387)
            </span>
            <span 
              className={`s9-legend-key ${activeSub === 'PCIE_POWER' ? 'active' : ''}`}
              onClick={() => handleSubassemblyClick('PCIE_POWER')}
            >
              <span className="s9-swatch-dot" style={{ background: '#F59E0B' }} />
              10x PCIe 12V
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePose();
              }}
              className="px-3 py-1 rounded-xl text-xs font-mono font-bold border transition-all active:scale-[0.97] cursor-pointer bg-white/5 border-white/10 hover:bg-white/10 text-slate-200"
            >
              {pose === 'ASSEMBLED' ? '🔍 Modo Explosionado' : '🔒 Ensamblar'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPaused(!isPaused);
              }}
              className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold border transition-all active:scale-[0.97] cursor-pointer bg-white/5 border-white/10 text-slate-400 hover:text-white"
              title="Pausar o reanudar rotación demostrativa de aspas"
            >
              {isPaused ? '▶ Reanudar' : '⏸ Pausar'}
            </button>
          </div>
        </div>
      </div>

      {/* PIE DE FIGURA EXPLICATIVO (CAPTION) */}
      <p className="text-[11px] font-mono text-slate-500 mt-2.5 px-2 leading-relaxed">
        <strong>Bitmain Antminer S9 · Arquitectura de Túnel Térmico Dual:</strong> Túnel de extrusión de aluminio con 3 tarjetas hashboard paralelas deslizables. Cada tarjeta porta 63 procesadores ASIC BM1387 de 16nm con disipadores individuales de aletas fresadas. El flujo es forzado por un ventilador frontal de admisión PWM y un extractor posterior de 120mm a 4,320 RPM.
      </p>
    </div>
  );
};
