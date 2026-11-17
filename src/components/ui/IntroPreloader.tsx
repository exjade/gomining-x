import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PowMinerLogo } from './PowMinerLogo';
import {
  Zap,
  Sparkles,
  Terminal,
  Activity,
} from 'lucide-react';

interface IntroPreloaderProps {
  onComplete: () => void;
}

interface PreloadStage {
  id: number;
  tag: string;
  title: string;
  subtitle: string;
  imageType: 'isometric-web3' | 'exploded-titan' | 'neural-chip' | 'titan-hero-stream';
  image: string;
  calloutLeft: { label: string; val: string };
  calloutRight: { label: string; val: string };
  telemetry: string;
}

const STAGES: PreloadStage[] = [
  {
    id: 0,
    tag: 'FASE 01 · CONEXIÓN WEB3 & WALLET',
    title: 'GATEWAY DESCENTRALIZADO',
    subtitle: 'Vinculando firma Web3 con clústeres cloud de minería',
    imageType: 'isometric-web3',
    image: '/assets/web3-cloud-mining-isometric.jpg',
    calloutLeft: { label: 'BILLETERA AUTORIZADA', val: '0x71C...8294' },
    calloutRight: { label: 'CANAL DE COMUNICACIÓN', val: 'RPC Criptográfico' },
    telemetry: 'CONECTANDO WALLET DESCENTRALIZADA A NODO CLOUD GÉNESIS...',
  },
  {
    id: 1,
    tag: 'FASE 02 · MATRIZ DE SILICIO 3nm',
    title: 'PROCESADOR NEURAL POUW',
    subtitle: 'Arquitectura de cálculo útil para IA y validación de bloques',
    imageType: 'exploded-titan',
    image: '/assets/powminer-titan-exploded-transparent.png',
    calloutLeft: { label: 'EFICIENCIA TÉRMICA', val: '19.5 W/TH' },
    calloutRight: { label: 'FRECUENCIA DE MINADO', val: '120 TH/s' },
    telemetry: 'CALIBRANDO MATRIZ DE SILICIO 3nm TITAN-X (CERO CALOR EN CASA)...',
  },
  {
    id: 2,
    tag: 'FASE 03 · NUBE HIDROELÉCTRICA',
    title: 'INFRAESTRUCTURA TITAN',
    subtitle: 'Nueve centros de datos remotos alimentados por energía verde',
    imageType: 'neural-chip',
    image: '/assets/pouwminer-neural-chip.jpg',
    calloutLeft: { label: 'DATA CENTERS ACTIVOS', val: '+9 Nodos' },
    calloutRight: { label: 'COSTO DE LUZ RESIDENCIAL', val: '$0.00' },
    telemetry: 'ENRUTANDO POTENCIA CLOUD A TRAVÉS DE DATA CENTERS VERDES...',
  },
  {
    id: 3,
    tag: 'FASE 04 · FLUJO DE GANANCIAS',
    title: 'LIQUIDACIÓN ON-CHAIN 24H',
    subtitle: 'Dividendos diarios automáticos en dólares y tokens PEARL',
    imageType: 'titan-hero-stream',
    image: '/assets/powminer-titan-hero-transparent.png',
    calloutLeft: { label: 'BENCHMARK DIARIO', val: '+$2.30 USD / d' },
    calloutRight: { label: 'REPARTO EN PEARL', val: '~23.00 PEARL / d' },
    telemetry: 'CANALES DE LIQUIDACIÓN LISTOS · GENERANDO GANANCIAS DIARIAS...',
  },
];

export const IntroPreloader: React.FC<IntroPreloaderProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);

  // Active stage (0, 1, 2, or 3)
  const currentStageIndex = Math.min(3, Math.floor(progress / 25));
  const activeStage = STAGES[currentStageIndex];

  useEffect(() => {
    // Smooth, cinematic 5.5s progression
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }

        let step = 1;
        if (prev < 20) step = 1;
        else if (prev < 45) step = 2;
        else if (prev < 70) step = 1;
        else if (prev < 90) step = 2;
        else step = 1;

        return Math.min(100, prev + step);
      });
    }, 55);

    return () => clearInterval(interval);
  }, []);

  // When progress reaches 100%, trigger smooth exit
  useEffect(() => {
    if (progress === 100) {
      const timer = setTimeout(() => {
        onComplete();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [progress, onComplete]);

  // ESC shortcut to skip
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onComplete();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.03, filter: 'blur(12px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex flex-col justify-between bg-[#050505] text-white p-4 sm:p-8 md:p-10 overflow-hidden select-none"
    >
      {/* KEYFRAME ANIMATIONS FOR ISOMETRIC LASERS AND VECTOR CONDUITS */}
      <style>{`
        @keyframes isoLaserStream {
          from { stroke-dashoffset: 48; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes isoLaserStreamRev {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: 48; }
        }
        .animate-iso-stream {
          animation: isoLaserStream 1.6s linear infinite;
        }
        .animate-iso-stream-fast {
          animation: isoLaserStream 1s linear infinite;
        }
      `}</style>

      {/* AMBIENT DEEP VOLUMETRIC GLOW (NO BOXES, NO HARD CARDS, SEAMLESS BLEND INTO #050505) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Core Volumetric Nebula */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[900px] h-[400px] sm:h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(147,51,234,0.18)_0%,rgba(16,185,129,0.06)_45%,transparent_75%)] blur-[120px]" />
        {/* Secondary Rim Atmospheric Glows */}
        <div className="absolute top-1/4 right-1/4 w-[350px] h-[350px] bg-purple-900/15 rounded-full blur-[140px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[350px] h-[350px] bg-emerald-950/20 rounded-full blur-[140px]" />
      </div>

      {/* TOP HUD: BRAND + MINIMALIST STATUS TICKER + ESC SKIP */}
      <div className="relative z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PowMinerLogo size="md" showSubtitle />
          <span className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.02] text-[10px] font-mono text-white/60 uppercase tracking-widest backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            NODO ISOMÉTRICO POUW ACTIVO
          </span>
        </div>

        <button
          type="button"
          onClick={onComplete}
          className="text-[10px] sm:text-[11px] font-mono text-white/50 hover:text-white uppercase tracking-[0.25em] transition-colors px-3.5 py-1.5 rounded-full border border-white/10 hover:border-white/30 active:scale-[0.97]"
        >
          Saltar [ESC]
        </button>
      </div>

      {/* CENTER STAGE: BORDERLESS VOLUMETRIC ISOMETRIC SCENE (NO BOXES, RADIAL MASK BLENDING) */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center max-w-5xl mx-auto w-full px-2">
        <div className="relative w-full max-w-[340px] sm:max-w-[560px] md:max-w-[720px] aspect-[16/10] flex items-center justify-center">

          {/* 1. ANIMATED ISOMETRIC GROUND GRID (30-DEGREE VECTOR PROJECTION ON GROUND) */}
          <div className="absolute inset-0 pointer-events-none z-0">
            <svg
              className="w-full h-full"
              viewBox="0 0 720 450"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="isoGridGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3" />
                  <stop offset="50%" stopColor="#ffffff" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.3" />
                </linearGradient>

                <linearGradient id="laserBeamGreen" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.8" />
                </linearGradient>

                <linearGradient id="laserBeamPurple" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.9" />
                </linearGradient>
              </defs>

              {/* Isometric Floor Grid Lines (30° angle: dx * 0.577) */}
              <g opacity="0.25">
                {/* 30° Axis Conduits (Left to Right Downward) */}
                {[-100, 0, 100, 200, 300, 400, 500, 600, 700].map((baseX, i) => (
                  <line
                    key={`iso-r-${i}`}
                    x1={baseX}
                    y1="220"
                    x2={baseX + 260}
                    y2="370"
                    stroke="#ffffff"
                    strokeWidth="0.8"
                    strokeDasharray="4 6"
                  />
                ))}

                {/* 150° Axis Conduits (Right to Left Downward) */}
                {[100, 200, 300, 400, 500, 600, 700, 800].map((baseX, i) => (
                  <line
                    key={`iso-l-${i}`}
                    x1={baseX}
                    y1="220"
                    x2={baseX - 260}
                    y2="370"
                    stroke="#ffffff"
                    strokeWidth="0.8"
                    strokeDasharray="4 6"
                  />
                ))}
              </g>

              {/* ISOMETRIC CONDUIT LASER TRACES (CONNECTING WEB3 NODE -> 3nm ASIC -> LIQUIDATION) */}
              {/* Left Conduit (Wallet to Core) */}
              <path
                d="M 110 300 L 220 365 L 360 365 L 360 300"
                stroke="url(#laserBeamGreen)"
                strokeWidth="1.8"
                strokeDasharray="8 6"
                className="animate-iso-stream"
              />
              {/* Right Conduit (Core to Payout Pool) */}
              <path
                d="M 360 300 L 360 365 L 500 365 L 610 300"
                stroke="url(#laserBeamPurple)"
                strokeWidth="1.8"
                strokeDasharray="8 6"
                className="animate-iso-stream-fast"
              />

              {/* Hairline Technical Dimension Brackets */}
              <g stroke="rgba(255,255,255,0.3)" strokeWidth="0.75">
                {/* Top Left Bracket */}
                <path d="M 40 40 L 40 20 L 70 20" />
                {/* Top Right Bracket */}
                <path d="M 680 40 L 680 20 L 650 20" />
                {/* Bottom Left Bracket */}
                <path d="M 40 410 L 40 430 L 70 430" />
                {/* Bottom Right Bracket */}
                <path d="M 680 410 L 680 430 L 650 430" />
              </g>

              {/* Minimalist Isometric Crosshairs & Target Rings */}
              {/* Left Node: Web3 Gateway */}
              <g transform="translate(110, 300)">
                <circle cx="0" cy="0" r="3" fill="#10b981" />
                <circle cx="0" cy="0" r="10" stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" className="animate-spin" />
              </g>

              {/* Center Node: PoUW 3nm Silicon Axis */}
              <g transform="translate(360, 365)">
                <circle cx="0" cy="0" r="3" fill="#ffffff" />
                <circle cx="0" cy="0" r="12" stroke="rgba(255,255,255,0.6)" strokeWidth="1" strokeDasharray="2 3" />
                {/* Vertical Laser Projection Line up through hardware */}
                <line x1="0" y1="0" x2="0" y2="-210" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3 4" />
              </g>

              {/* Right Node: Payout Node */}
              <g transform="translate(610, 300)">
                <circle cx="0" cy="0" r="3" fill="#a855f7" />
                <circle cx="0" cy="0" r="10" stroke="#a855f7" strokeWidth="1" strokeDasharray="3 3" className="animate-spin" />
              </g>

              {/* Fine Leader Lines with Technical Callouts */}
              {/* Leader to TSMC die */}
              <path d="M 330 180 L 250 130 L 160 130" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
              <circle cx="330" cy="180" r="2.5" fill="#a855f7" />

              {/* Leader to Cloud Uplink */}
              <path d="M 420 180 L 500 130 L 590 130" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
              <circle cx="420" cy="180" r="2.5" fill="#10b981" />
            </svg>
          </div>

          {/* 2. DYNAMIC 3D ASSETS (DIFFUSED / FEATHERED SEAMLESSLY INTO #050505) */}
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStage.id}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="relative w-full h-full flex items-center justify-center"
              >
                {/* 1. Isometric Web3 (Masked with smooth radial gradient, edges 100% transparent) */}
                {activeStage.imageType === 'isometric-web3' && (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img
                      src={activeStage.image}
                      alt={activeStage.title}
                      className="w-full h-full object-contain select-none [mask-image:radial-gradient(ellipse_at_center,black_28%,rgba(0,0,0,0.6)_48%,transparent_68%)] filter drop-shadow-[0_0_60px_rgba(168,85,247,0.4)]"
                    />
                  </div>
                )}

                {/* 2. Transparent Exploded Titan Core (100% Alpha, Floating directly on #050505) */}
                {activeStage.imageType === 'exploded-titan' && (
                  <motion.div
                    animate={{ y: [-6, 6, -6], rotateZ: [-0.5, 0.5, -0.5] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    className="relative w-full h-full flex items-center justify-center"
                  >
                    <img
                      src={activeStage.image}
                      alt={activeStage.title}
                      className="w-full h-full object-contain select-none filter drop-shadow-[0_30px_60px_rgba(0,0,0,0.98)] drop-shadow-[0_0_50px_rgba(168,85,247,0.35)]"
                    />
                  </motion.div>
                )}

                {/* 3. Neural 3nm Silicon Dies (Feathered seamlessly with cyan volumetric aura) */}
                {activeStage.imageType === 'neural-chip' && (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img
                      src={activeStage.image}
                      alt={activeStage.title}
                      className="w-full h-full object-contain select-none [mask-image:radial-gradient(ellipse_at_center,black_30%,rgba(0,0,0,0.5)_50%,transparent_70%)] filter drop-shadow-[0_0_65px_rgba(59,130,246,0.35)]"
                    />
                  </div>
                )}

                {/* 4. Titan Hero Stream with Floating 3D Tokens */}
                {activeStage.imageType === 'titan-hero-stream' && (
                  <motion.div
                    animate={{ y: [-5, 5, -5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="relative w-full h-full flex items-center justify-center"
                  >
                    <img
                      src={activeStage.image}
                      alt={activeStage.title}
                      className="w-full h-full object-contain select-none filter drop-shadow-[0_30px_60px_rgba(0,0,0,0.98)] drop-shadow-[0_0_50px_rgba(16,185,129,0.35)]"
                    />
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 3. TRAVELING 3D COINS STREAMING ALONG ISOMETRIC LASER AXIS */}
          <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
            {/* PEARL Token Pulse */}
            <motion.div
              animate={{
                x: ['570px', '110px'],
                y: ['280px', '295px'],
                opacity: [0, 1, 1, 0],
                scale: [0.75, 1.1, 1, 0.7],
              }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#050505]/90 border border-white/30 backdrop-blur-md shadow-[0_0_18px_rgba(255,255,255,0.7)]"
            >
              <img src="/assets/pearl-coin-3d.png" alt="PEARL" className="w-3.5 h-3.5" />
              <span className="text-[8px] font-mono font-bold text-white">+PEARL</span>
            </motion.div>

            {/* USDT Token Pulse */}
            <motion.div
              animate={{
                x: ['570px', '110px'],
                y: ['280px', '295px'],
                opacity: [0, 1, 1, 0],
                scale: [0.75, 1.1, 1, 0.7],
              }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 1.1 }}
              className="absolute flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#050505]/90 border border-emerald-500/40 backdrop-blur-md shadow-[0_0_18px_rgba(16,185,129,0.7)]"
            >
              <img src="/assets/usdt-coin-3d.png" alt="USDT" className="w-3.5 h-3.5" />
              <span className="text-[8px] font-mono font-bold text-emerald-400">+USDT</span>
            </motion.div>
          </div>

          {/* 4. MINIMALIST FLOATING TECHNICAL HUD ANNOTATIONS (PURE FLOATING HUD, NO BOX CARDS) */}
          <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-2 sm:p-4">
            {/* Top HUD: Micro Phase Badge + Live Hashes */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[10px] font-mono font-bold tracking-[0.25em] text-white/80 uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                {activeStage.tag}
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono text-emerald-400/95 tracking-wider flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                120 TH/s STREAM
              </span>
            </div>

            {/* In-Scene Leader Labels (Floating text over SVG leader lines) */}
            <div className="hidden sm:flex items-center justify-between text-[9px] font-mono text-white/60 px-4 -mt-10">
              <span className="bg-[#050505]/80 px-2 py-0.5 rounded border border-white/10 backdrop-blur-sm">
                [ 3nm TSMC FINFET · 19.5 W/TH ]
              </span>
              <span className="bg-[#050505]/80 px-2 py-0.5 rounded border border-white/10 backdrop-blur-sm text-emerald-400">
                [ ZERO NOISE // CLOUD ASIC ]
              </span>
            </div>

            {/* Bottom HUD: Dynamic Callout Values */}
            <div className="flex items-end justify-between font-mono text-[9px] sm:text-[10px]">
              {/* Left Callout */}
              <div className="space-y-0.5">
                <span className="text-white/40 block text-[8px] uppercase tracking-wider">
                  {activeStage.calloutLeft.label}
                </span>
                <strong className="text-white font-bold block text-xs sm:text-sm tracking-tight">
                  {activeStage.calloutLeft.val}
                </strong>
              </div>

              {/* Right Callout */}
              <div className="text-right space-y-0.5">
                <span className="text-white/40 block text-[8px] uppercase tracking-wider">
                  {activeStage.calloutRight.label}
                </span>
                <strong className="text-emerald-400 font-bold block text-xs sm:text-sm tracking-tight">
                  {activeStage.calloutRight.val}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* 5. MINIMALIST 4-PHASE TIMELINE (FINE HAIRLINE CONNECTORS, NO HEAVY BOXES) */}
        <div className="w-full max-w-[340px] sm:max-w-[540px] md:max-w-[620px] mt-6 px-2">
          {/* Timeline Nodes */}
          <div className="relative flex items-center justify-between">
            {/* Background 1px Line */}
            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-[1px] bg-white/10 z-0" />

            {/* Glowing Active Track */}
            <motion.div
              className="absolute left-2 top-1/2 -translate-y-1/2 h-[1.5px] bg-gradient-to-r from-emerald-400 via-white to-purple-400 z-0"
              style={{ width: `${Math.min(96, (currentStageIndex / 3) * 96)}%` }}
            />

            {STAGES.map((stg, i) => {
              const isCurrent = i === currentStageIndex;
              const isPast = i < currentStageIndex;

              return (
                <div key={stg.id} className="relative z-10 flex flex-col items-center">
                  <div
                    className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border transition-all duration-300 flex items-center justify-center ${
                      isCurrent
                        ? 'border-white bg-white shadow-[0_0_12px_rgba(255,255,255,0.95)] scale-125'
                        : isPast
                        ? 'border-emerald-400 bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                        : 'border-white/20 bg-[#050505]'
                    }`}
                  >
                    {isCurrent && <span className="w-1 h-1 rounded-full bg-[#050505]" />}
                  </div>
                  <span
                    className={`text-[8px] sm:text-[9px] font-mono uppercase tracking-widest mt-2 transition-colors ${
                      isCurrent ? 'text-white font-bold' : isPast ? 'text-white/60' : 'text-white/25'
                    }`}
                  >
                    0{i + 1} {stg.title.split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 6. MINIMALIST TELEMETRY TICKER */}
        <div className="mt-5 text-center space-y-1.5 max-w-xl mx-auto w-full px-2">
          <div className="flex items-center justify-center gap-2 text-[10px] sm:text-[11px] font-mono text-white/80">
            <Terminal className="w-3.5 h-3.5 text-purple-400 animate-pulse flex-shrink-0" />
            <span className="tracking-widest uppercase truncate">{activeStage.telemetry}</span>
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-6 text-[8px] sm:text-[9px] font-mono text-white/40 uppercase tracking-widest flex-wrap">
            <span className="text-white/60 flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400" /> CERO HARDWARE EN CASA
            </span>
            <span>·</span>
            <span>ENERGÍA 100% VERDE</span>
            <span>·</span>
            <span className="text-emerald-400 font-bold">+$2.30 USD / DÍA</span>
          </div>
        </div>
      </div>

      {/* 7. BOTTOM COUNTER & PRECISION PROGRESS GAUGE */}
      <div className="relative z-20 max-w-xl mx-auto w-full px-2">
        <div className="flex items-end justify-between mb-2 font-mono">
          <div className="flex items-center gap-2 text-[9px] sm:text-[11px] text-white/50 uppercase tracking-[0.25em]">
            <Sparkles className="w-3.5 h-3.5 text-white/60 animate-spin" style={{ animationDuration: '4s' }} />
            <span>SINCRONIZANDO SILICIO POUWMINER</span>
          </div>
          <div className="text-3xl sm:text-5xl font-bold tracking-tighter text-white">
            {String(progress).padStart(2, '0')}%
          </div>
        </div>

        {/* Progress Bar Track */}
        <div className="w-full h-1 sm:h-1.5 bg-white/10 rounded-full overflow-hidden relative">
          <motion.div
            className="h-full bg-gradient-to-r from-purple-500 via-white to-emerald-400 transition-all duration-100 ease-out rounded-full shadow-[0_0_12px_rgba(255,255,255,0.8)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between items-center text-[8px] sm:text-[9px] font-mono text-white/30 uppercase tracking-widest mt-1.5">
          <span>MINERÍA DIGITAL // RED PEARL</span>
          <span>ESTÁNDAR APPLE KEYNOTE</span>
        </div>
      </div>
    </motion.div>
  );
};
