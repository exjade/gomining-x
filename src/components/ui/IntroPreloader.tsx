import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PowMinerLogo } from './PowMinerLogo';
import {
  Zap,
  Sparkles,
  Terminal,
  Wallet,
  Server,
  Activity,
} from 'lucide-react';

interface IntroPreloaderProps {
  onComplete: () => void;
}

interface PreloadStage {
  id: number;
  title: string;
  subtitle: string;
  image: string;
  tag: string;
  tagColor: string;
  badge1: { text: string; sub: string };
  badge2: { text: string; sub: string };
  accent: string;
  log: string;
}

const STAGES: PreloadStage[] = [
  {
    id: 0,
    title: 'CONEXIÓN WEB3 & WALLET HANDSHAKE',
    subtitle: 'Vinculando billetera descentralizada con nodos cloud PoUW',
    image: '/assets/web3-cloud-mining-isometric.jpg',
    tag: 'FASE 01 · WEB3 GATEWAY',
    tagColor: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    badge1: { text: 'WALLET 0x71C...8294', sub: 'Autenticación On-Chain' },
    badge2: { text: 'CONTRATO INTELIGENTE', sub: 'Asignación Génesis' },
    accent: 'emerald',
    log: 'FASE 01/04 · VINCULANDO WALLET WEB3 Y GENERANDO CANAL SEGURO DE RETIRO...',
  },
  {
    id: 1,
    title: 'CALIBRACIÓN SILICIO NEURAL 3nm',
    subtitle: 'Arquitectura PoUW optimizada para inferencia de IA y minería digital',
    image: '/assets/pouwminer-neural-chip.jpg',
    tag: 'FASE 02 · 3nm SILICON MATRIX',
    tagColor: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
    badge1: { text: '19.5 W/TH EFICIENCIA', sub: 'Cero Calor en Hogar' },
    badge2: { text: 'BENCHMARK 120 TH/s', sub: 'Frecuencia Calibrada' },
    accent: 'purple',
    log: 'FASE 02/04 · ACTIVANDO MATRIZ DE SILICIO NEURAL 3nm EN DATA CENTERS...',
  },
  {
    id: 2,
    title: 'RED CLOUD & DATA CENTERS VERDES',
    subtitle: 'Despliegue distribuido en 9 data centers con energía hidroeléctrica',
    image: '/assets/pouwminer-titan-hero.jpg',
    tag: 'FASE 03 · WING MINING CLOUD',
    tagColor: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    badge1: { text: '+9 DATA CENTERS', sub: '100% Energía Hidroeléctrica' },
    badge2: { text: '0% GASTO DE LUZ', sub: 'Hardware Remoto Gestionado' },
    accent: 'blue',
    log: 'FASE 03/04 · SINCRONIZANDO WING MINING CLOUD Y ENERGÍA HIDROELÉCTRICA...',
  },
  {
    id: 3,
    title: 'LIQUIDACIÓN DIARIA & DIVIDENDOS',
    subtitle: 'Flujo automático en dólares USDT y tokens nativos PEARL',
    image: '/assets/battle-miner-cards-3d.jpg',
    tag: 'FASE 04 · DAILY PAYOUT STREAM',
    tagColor: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    badge1: { text: '+$2.30 USD / DÍA', sub: '120 TH/s Rendimiento Neto' },
    badge2: { text: '~23.00 PEARL / DÍA', sub: 'Liquidación Directa 24H' },
    accent: 'amber',
    log: 'FASE 04/04 · CANALES DE PAGO ACTIVOS · PREPARADO PARA GENERAR INGRESOS...',
  },
];

export const IntroPreloader: React.FC<IntroPreloaderProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);

  // Determine current active visual stage based on progress (0-25: 0, 25-50: 1, 50-75: 2, 75-100: 3)
  const currentStageIndex = Math.min(3, Math.floor(progress / 25));
  const activeStage = STAGES[currentStageIndex];

  useEffect(() => {
    // Methodical progression (~5.6 seconds total)
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }

        let step = 1;
        if (prev < 15) step = 1;
        else if (prev < 40) step = 2;
        else if (prev < 65) step = 1;
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
      exit={{ opacity: 0, scale: 1.03, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex flex-col justify-between bg-[#050505] text-white p-3 sm:p-8 md:p-10 overflow-hidden select-none"
    >
      {/* Background Deep Luxury Hue */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-purple-950/20 rounded-full blur-[170px]" />
        <div className="absolute top-1/4 right-1/4 w-[350px] h-[350px] bg-emerald-950/15 rounded-full blur-[110px]" />
      </div>

      {/* Top Bar: Brand & HUD metadata */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PowMinerLogo size="md" showSubtitle />
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-white/[0.02] text-[10px] font-mono text-white/50 uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            CONEXIÓN WEB3 & MINERÍA CLOUD
          </span>
        </div>

        <button
          type="button"
          onClick={onComplete}
          className="text-[10px] sm:text-[11px] font-mono text-white/40 hover:text-white uppercase tracking-[0.25em] transition-colors px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full border border-white/10 hover:border-white/30 active:scale-[0.97]"
        >
          Saltar [ESC]
        </button>
      </div>

      {/* Center Cinematic Stage: Dynamic Multi-Image Collage & Web3 Isometric Pipeline */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center max-w-4xl mx-auto w-full px-2">
        {/* Main Stage Frame */}
        <div className="relative w-full max-w-[340px] sm:max-w-[500px] md:max-w-[620px] aspect-[16/10] sm:aspect-[16/9] flex items-center justify-center">
          {/* Circular HUD radar rings */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 45, repeat: Infinity, ease: 'linear' }}
            className="absolute -inset-4 sm:-inset-6 rounded-full border border-white/[0.05] border-dashed pointer-events-none"
          />

          {/* DYNAMIC CROSSFADE IMAGE COLLAGE STAGE */}
          <div className="relative w-full h-full rounded-3xl overflow-hidden border border-white/15 bg-[#0a0a0a]/90 backdrop-blur-2xl shadow-2xl shadow-purple-950/40">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStage.id}
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0"
              >
                <img
                  src={activeStage.image}
                  alt={activeStage.title}
                  className="w-full h-full object-cover object-center select-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/30 to-[#050505]/40" />
              </motion.div>
            </AnimatePresence>

            {/* ISOMETRIC WEB3 CONNECTION LASER CONDUIT OVERLAY */}
            <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-3.5 sm:p-5">
              {/* Top Row: Stage Tag + Live Telemetry */}
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`px-2.5 py-1 rounded-xl border text-[9px] sm:text-[10px] font-mono font-bold tracking-wider uppercase backdrop-blur-md ${activeStage.tagColor}`}
                >
                  {activeStage.tag}
                </span>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#0a0a0a]/85 border border-white/15 text-[9px] sm:text-[10px] font-mono text-white/70 backdrop-blur-md">
                  <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                  <span>120 TH/s STREAM</span>
                </div>
              </div>

              {/* Center Holographic Web3 Mining Bridge Visualization */}
              <div className="relative my-auto flex items-center justify-between px-2 sm:px-6">
                {/* Left Node: Web3 Wallet */}
                <motion.div
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="flex flex-col items-center gap-1 p-2.5 sm:p-3 rounded-2xl bg-[#0a0a0a]/90 border border-emerald-500/40 backdrop-blur-xl shadow-xl shadow-black/80"
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                    <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                  </div>
                  <span className="text-[8px] sm:text-[9px] font-mono font-bold text-white uppercase tracking-wider">
                    Tu Wallet
                  </span>
                  <span className="text-[7px] sm:text-[8px] font-mono text-emerald-400">0x71C...8294</span>
                </motion.div>

                {/* Animated Bridge Conduit with Traveling Coins */}
                <div className="flex-1 relative mx-3 sm:mx-6 h-12 flex items-center justify-center">
                  {/* Glowing Laser Conduits */}
                  <div className="w-full h-[2px] bg-gradient-to-r from-emerald-500 via-white to-purple-500 opacity-80 shadow-[0_0_12px_rgba(168,85,247,0.9)]" />

                  {/* Traveling PEARL Coin from Cloud to Wallet */}
                  <motion.div
                    animate={{ x: ['120%', '-120%'], opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0a0a0a] border border-white/40 shadow-lg shadow-purple-500/50"
                  >
                    <img src="/assets/pearl-coin-3d.png" alt="PEARL" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="text-[8px] font-mono font-bold text-white">+PEARL</span>
                  </motion.div>

                  {/* Traveling USDT Coin from Cloud to Wallet */}
                  <motion.div
                    animate={{ x: ['120%', '-120%'], opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 1.1 }}
                    className="absolute flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0a0a0a] border border-emerald-500/40 shadow-lg shadow-emerald-500/50"
                  >
                    <img src="/assets/usdt-coin-3d.png" alt="USDT" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="text-[8px] font-mono font-bold text-emerald-400">+USDT</span>
                  </motion.div>
                </div>

                {/* Right Node: Cloud Miner Supercomputer */}
                <motion.div
                  initial={{ x: 10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="flex flex-col items-center gap-1 p-2.5 sm:p-3 rounded-2xl bg-[#0a0a0a]/90 border border-purple-500/40 backdrop-blur-xl shadow-xl shadow-black/80"
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                    <Server className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
                  </div>
                  <span className="text-[8px] sm:text-[9px] font-mono font-bold text-white uppercase tracking-wider">
                    Miner Cloud
                  </span>
                  <span className="text-[7px] sm:text-[8px] font-mono text-purple-300">PoUW 120 TH/s</span>
                </motion.div>
              </div>

              {/* Bottom Row Badges */}
              <div className="flex items-center justify-between gap-2">
                <div className="px-2.5 py-1 rounded-xl bg-[#0a0a0a]/90 border border-white/15 backdrop-blur-md text-[8px] sm:text-[9px] font-mono">
                  <span className="text-white/40 block">{activeStage.badge1.sub}</span>
                  <strong className="text-white font-bold">{activeStage.badge1.text}</strong>
                </div>

                <div className="px-2.5 py-1 rounded-xl bg-[#0a0a0a]/90 border border-white/15 backdrop-blur-md text-[8px] sm:text-[9px] font-mono text-right">
                  <span className="text-white/40 block">{activeStage.badge2.sub}</span>
                  <strong className="text-emerald-400 font-bold">{activeStage.badge2.text}</strong>
                </div>
              </div>
            </div>

            {/* Animated Laser Scan Bar */}
            <motion.div
              animate={{ y: ['-100%', '110%'] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-70 pointer-events-none shadow-[0_0_15px_rgba(168,85,247,0.8)] z-20"
            />
          </div>
        </div>

        {/* 4-STAGE FILMSTRIP / COLLAGE INDICATORS */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-[340px] sm:max-w-[500px] md:max-w-[620px] w-full mt-4">
          {STAGES.map((stg, i) => {
            const isCurrent = i === currentStageIndex;
            const isPast = i < currentStageIndex;
            return (
              <div
                key={stg.id}
                className={`p-2 rounded-xl border transition-all duration-300 flex items-center gap-2 ${
                  isCurrent
                    ? 'border-white bg-[#141414] shadow-lg ring-1 ring-white/30'
                    : isPast
                    ? 'border-white/20 bg-white/[0.03] text-white/60'
                    : 'border-white/5 bg-transparent text-white/30'
                }`}
              >
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                  <img src={stg.image} alt={stg.title} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 hidden sm:block">
                  <span className="text-[8px] font-mono uppercase tracking-wider block text-white/40 leading-none">
                    0{i + 1}
                  </span>
                  <span className="text-[9px] font-mono font-bold truncate block text-white leading-tight mt-0.5">
                    {stg.title.split(' ')[0]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Real-Time Telemetry Terminal Box */}
        <div className="mt-4 text-center space-y-2 max-w-xl mx-auto w-full px-2">
          <div className="flex items-center justify-center gap-2 text-[10px] sm:text-xs font-mono text-white/80 bg-[#0a0a0a]/80 border border-white/10 px-3.5 py-1.5 rounded-full backdrop-blur-md">
            <Terminal className="w-3.5 h-3.5 text-purple-400 animate-pulse flex-shrink-0" />
            <span className="tracking-widest uppercase truncate">{activeStage.log}</span>
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-5 text-[9px] sm:text-[10px] font-mono text-white/40 uppercase tracking-widest flex-wrap">
            <span className="flex items-center gap-1 text-white/60">
              <Zap className="w-3 h-3 text-emerald-400" /> GANANCIAS EN LA NUBE
            </span>
            <span>·</span>
            <span>0% GASTO DE LUZ</span>
            <span>·</span>
            <span className="text-emerald-400 font-bold">+$2.30 USD / DÍA</span>
          </div>
        </div>
      </div>

      {/* Bottom Counter & Precision Progress Bar */}
      <div className="relative z-10 max-w-xl mx-auto w-full px-2">
        <div className="flex items-end justify-between mb-2 sm:mb-2.5 font-mono">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs text-white/50 uppercase tracking-[0.25em]">
            <Sparkles className="w-3.5 h-3.5 text-white/60 animate-spin" style={{ animationDuration: '4s' }} />
            <span>SINCRONIZANDO PLATAFORMA POUWMINER</span>
          </div>
          <div className="text-3xl sm:text-5xl font-bold tracking-tighter text-white">
            {String(progress).padStart(2, '0')}%
          </div>
        </div>

        {/* Progress Bar Track */}
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden relative">
          <motion.div
            className="h-full bg-gradient-to-r from-purple-500 via-white to-emerald-400 transition-all duration-100 ease-out rounded-full shadow-[0_0_12px_rgba(255,255,255,0.8)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between items-center text-[8px] sm:text-[9px] font-mono text-white/30 uppercase tracking-widest mt-2">
          <span>MINERÍA WEB3 // POUW NETWORK</span>
          <span>ESTÁNDAR APPLE KEYNOTE</span>
        </div>
      </div>
    </motion.div>
  );
};
