import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PowMinerLogo } from './PowMinerLogo';
import { Cpu, Zap, Sparkles, Terminal, Coins, TrendingUp } from 'lucide-react';

interface IntroPreloaderProps {
  onComplete: () => void;
}

export const IntroPreloader: React.FC<IntroPreloaderProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [telemetryLog, setTelemetryLog] = useState('INICIALIZANDO SUBSISTEMAS CRIPTOGRÁFICOS...');

  useEffect(() => {
    // Smooth, methodical progression (~5.4 seconds)
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }

        let step = 1;
        if (prev < 20) step = 1;
        else if (prev < 50) step = 2;
        else if (prev < 75) step = 1;
        else if (prev < 92) step = 2;
        else step = 1;

        const next = Math.min(100, prev + step);

        if (next < 25) {
          setTelemetryLog('FASE 01/04 · CONECTANDO SILICIO 3nm CON DATA CENTERS HIDROELÉCTRICOS...');
        } else if (next < 55) {
          setTelemetryLog('FASE 02/04 · ACTIVANDO WING MINING CLOUD & CANALES USDT PAYOUT...');
        } else if (next < 85) {
          setTelemetryLog('FASE 03/04 · CALIBRANDO DISTRIBUCIÓN DIARIA ON-CHAIN EN TOKENS PEARL...');
        } else {
          setTelemetryLog('FASE 04/04 · MINERÍA EN LA NUBE PREPARADA · ACCESO AUTORIZADO');
        }

        return next;
      });
    }, 55);

    return () => clearInterval(interval);
  }, []);

  // When progress reaches 100%, trigger smooth exit
  useEffect(() => {
    if (progress === 100) {
      const timer = setTimeout(() => {
        onComplete();
      }, 750);
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
      className="fixed inset-0 z-50 flex flex-col justify-between bg-[#050505] text-white p-4 sm:p-10 overflow-hidden select-none"
    >
      {/* Background Deep Luxury Hue */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-purple-950/20 rounded-full blur-[170px]" />
        <div className="absolute top-1/4 right-1/4 w-[350px] h-[350px] bg-white/[0.02] rounded-full blur-[110px]" />
      </div>

      {/* Top Bar: Brand & HUD metadata */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PowMinerLogo size="md" showSubtitle />
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-white/[0.02] text-[10px] font-mono text-white/50 uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            WING CLOUD MINING ACTIVE
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

      {/* Center Cinematic Stage: New 3D Preloader Visual + Floating Micro-CTAs */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
        <div className="relative w-full max-w-[340px] sm:max-w-[480px] md:max-w-[560px] aspect-[4/3] flex items-center justify-center">
          {/* Circular HUD radar rings */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-2 sm:inset-4 rounded-full border border-white/[0.04] border-dashed pointer-events-none"
          />

          {/* New 3D Preloader Image with floating micro-CTAs */}
          <div className="relative w-full h-full rounded-3xl overflow-hidden border border-white/15 bg-[#0a0a0a]/90 backdrop-blur-2xl shadow-2xl shadow-purple-950/40 group">
            <img
              src="/assets/pouwminer-cloud-mining-preloader.jpg"
              alt="PouwMiner Cloud Mining Preloader 3D Core"
              className="w-full h-full object-cover object-center transform group-hover:scale-105 transition-transform duration-700 select-none"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent opacity-60" />

            {/* Micro-CTA 1: Wing Mining Cloud (Top Left) */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="absolute top-3 left-3 sm:top-4 sm:left-4 px-2.5 py-1 rounded-xl bg-[#0a0a0a]/90 border border-purple-500/40 backdrop-blur-md flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono shadow-xl"
            >
              <Zap className="w-3 h-3 text-purple-400" />
              <span className="font-bold text-white tracking-wider">WING MINING CLOUD</span>
            </motion.div>

            {/* Micro-CTA 2: USDT Cloud Payout (Top Right) */}
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 px-2.5 py-1 rounded-xl bg-[#0a0a0a]/90 border border-emerald-500/40 backdrop-blur-md flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono shadow-xl"
            >
              <Coins className="w-3 h-3 text-emerald-400" />
              <span className="font-bold text-emerald-400 tracking-wider">USDT CLOUD PAYOUT</span>
            </motion.div>

            {/* Micro-CTA 3: PEARL Reward (Bottom Left) */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 px-2.5 py-1 rounded-xl bg-[#0a0a0a]/90 border border-white/20 backdrop-blur-md flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono shadow-xl"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="font-bold text-white tracking-wider">💎 +PEARL REWARD</span>
            </motion.div>

            {/* Micro-CTA 4: +$2.30/d Benchmark (Bottom Right) */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 px-2.5 py-1 rounded-xl bg-[#0a0a0a]/90 border border-emerald-500/30 backdrop-blur-md flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono shadow-xl"
            >
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span className="font-bold text-white tracking-wider">+$2.30 USD / DÍA (120 TH)</span>
            </motion.div>
          </div>

          {/* Futuristic Animated Laser Scan Line */}
          <motion.div
            animate={{ y: ['-100%', '110%'] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-x-4 h-[2px] bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-80 pointer-events-none shadow-[0_0_15px_rgba(168,85,247,0.8)]"
          />
        </div>

        {/* Real-Time Telemetry Diagnostic Terminal Box */}
        <div className="mt-6 text-center space-y-2.5 max-w-xl mx-auto w-full px-2">
          <div className="flex items-center justify-center gap-2 text-[11px] sm:text-xs font-mono text-white/80 bg-[#0a0a0a]/80 border border-white/10 px-3.5 py-1.5 rounded-full backdrop-blur-md">
            <Terminal className="w-3.5 h-3.5 text-purple-400 animate-pulse flex-shrink-0" />
            <span className="tracking-widest uppercase truncate">{telemetryLog}</span>
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-6 text-[9px] sm:text-[10px] font-mono text-white/40 uppercase tracking-widest pt-1 flex-wrap">
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-white/60" /> 19.5 W/TH ECO
            </span>
            <span>·</span>
            <span>0% GASTO DE LUZ</span>
            <span>·</span>
            <span className="text-emerald-400 font-bold">GANANCIAS DESDE CASA</span>
          </div>
        </div>
      </div>

      {/* Bottom Counter & Precision Progress Gauge */}
      <div className="relative z-10 max-w-xl mx-auto w-full px-2">
        <div className="flex items-end justify-between mb-2 sm:mb-3 font-mono">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs text-white/50 uppercase tracking-[0.25em]">
            <Sparkles className="w-3.5 h-3.5 text-white/60 animate-spin" style={{ animationDuration: '4s' }} />
            <span>CARGANDO PLATAFORMA POUWMINER</span>
          </div>
          <div className="text-3xl sm:text-5xl font-bold tracking-tighter text-white">
            {String(progress).padStart(2, '0')}%
          </div>
        </div>

        {/* Progress Bar Track with Glow */}
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden relative">
          <motion.div
            className="h-full bg-white transition-all duration-100 ease-out rounded-full shadow-[0_0_12px_rgba(255,255,255,0.8)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between items-center text-[8px] sm:text-[9px] font-mono text-white/30 uppercase tracking-widest mt-2">
          <span>MINERÍA DIGITAL // RED PEARL</span>
          <span>ESTÁNDAR APPLE KEYNOTE</span>
        </div>
      </div>
    </motion.div>
  );
};
