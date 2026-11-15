import { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { ArrowRight, Wallet, ShieldCheck, Activity, Zap, ChevronDown } from 'lucide-react';

interface HeroSectionProps {
  onOpenAuth?: (mode?: 'login' | 'register') => void;
}

export function HeroSection({ onOpenAuth }: HeroSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 24,
    restDelta: 0.001,
  });

  // Parallax multi-depth scroll transforms
  const yLeft = useTransform(smoothProgress, [0, 1], [0, 60]);
  const yRight = useTransform(smoothProgress, [0, 1], [0, -60]);
  const rotateXHardware = useTransform(smoothProgress, [0, 1], [0, 12]);
  const rotateYHardware = useTransform(smoothProgress, [0, 1], [0, -8]);
  const scaleHardware = useTransform(smoothProgress, [0, 0.5, 1], [1, 1.04, 0.96]);
  const yBg = useTransform(smoothProgress, [0, 1], [0, 140]);

  return (
    <section
      id="hero"
      ref={containerRef}
      className="relative min-h-screen flex flex-col justify-between pt-24 sm:pt-28 pb-10 px-4 sm:px-6 lg:px-12 bg-[#050505] text-white overflow-hidden select-none"
    >
      {/* Background Parallax Deep Luxury Nebula & Precision Grid */}
      <motion.div style={{ y: yBg }} className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] sm:w-[1000px] h-[550px] bg-purple-950/20 rounded-full blur-[180px]" />
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-white/[0.02] rounded-full blur-[120px]" />
      </motion.div>

      {/* Background Grid Pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.025] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]" />

      {/* Main Hero Split Content (Left: Copy & CTAs, Right: 3D Hardware) */}
      <div className="relative z-10 max-w-7xl mx-auto w-full my-auto grid lg:grid-cols-12 gap-8 lg:gap-12 items-center py-6 sm:py-10">
        {/* Left Column (58%): Typography, Earning Value Proposition & Dual Rounded CTAs */}
        <motion.div
          style={{ y: yLeft }}
          className="lg:col-span-7 flex flex-col items-start text-left space-y-6"
        >
          {/* Eyebrow / Section indicator */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-2.5 px-3 py-1 rounded-full border border-white/10 bg-white/[0.02]"
          >
            <span className="font-mono text-xs text-white/40">01</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[10px] font-semibold tracking-[0.35em] uppercase text-white/70">
              MINERÍA EN LA NUBE // POUW PROTOCOL
            </span>
          </motion.div>

          {/* Main Title: Big, Bold, Clean Apple Keynote Style */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-extrabold tracking-tighter text-white leading-[0.95] break-words"
          >
            PouwMiner
          </motion.h1>

          {/* Subtitle - Punchy & Direct to the point */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-white/95"
          >
            Gana dinero minando desde casa.
          </motion.p>

          {/* Core Description - Short, direct value proposition */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="text-xs sm:text-sm lg:text-base text-white/70 max-w-xl leading-relaxed font-normal"
          >
            Genera ingresos diarios en dólares y tokens PEARL con minería en la nube. Sin comprar tarjetas gráficas, sin ruido y con cero facturas de luz en tu hogar.
          </motion.p>

          {/* Realistic Benchmark Live Indicator */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 sm:p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 text-xs font-mono w-full sm:w-auto"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="text-white font-bold text-xs sm:text-sm">120 TH/s ≈ $2.30 USD / día</span>
            </div>
            <span className="hidden sm:inline text-white/30">|</span>
            <span className="text-white/60 text-[11px] sm:text-xs">~23.00 PEARL/d · Liquidación On-Chain</span>
          </motion.div>

          {/* Two Rounded CTAs: Primary White + Secondary Transparent with White Text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-wrap items-center gap-3.5 pt-2 w-full sm:w-auto"
          >
            {/* Primary Rounded CTA: White with Black Text */}
            <button
              type="button"
              onClick={() => onOpenAuth ? onOpenAuth('register') : window.location.assign('#preventa')}
              className="w-full sm:w-auto px-7 py-3.5 sm:px-8 sm:py-4 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97] shadow-xl shadow-white/5"
            >
              <span>Pre-ordenar Hashrate en Preventa</span>
              <ArrowRight className="w-4 h-4 text-[#050505]" />
            </button>

            {/* Secondary Rounded CTA: Transparent with White Text & White Border */}
            <button
              type="button"
              onClick={() => onOpenAuth ? onOpenAuth('register') : window.location.assign('#web3')}
              className="w-full sm:w-auto px-6 py-3.5 sm:px-7 sm:py-4 rounded-full border border-white/20 hover:border-white/50 bg-transparent text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            >
              <Wallet className="w-4 h-4 text-white/70" />
              <span>Conectar Wallet Web3</span>
            </button>
          </motion.div>

          {/* Institutional Trust Badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="flex items-center gap-4 sm:gap-6 pt-2 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] text-white/40 flex-wrap"
          >
            <span className="flex items-center gap-1.5 text-white/60">
              <ShieldCheck className="w-3.5 h-3.5 text-white/50" />
              Hardware Auditado
            </span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>+9 Data Centers</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-white/70 font-bold">19.5 W/TH Eficiencia</span>
          </motion.div>
        </motion.div>

        {/* Right Column (42%): Photorealistic 3D Titan Hardware Floating in Perspective */}
        <motion.div
          style={{ y: yRight }}
          className="lg:col-span-5 relative flex items-center justify-center perspective-[1200px] mt-6 lg:mt-0"
        >
          {/* Floating High-Yield Real-Time Badge (Top Left of Hardware) */}
          <motion.div
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="absolute -top-4 -left-2 sm:left-0 z-20 p-3 sm:p-3.5 rounded-2xl bg-[#0a0a0a]/90 border border-white/15 backdrop-blur-xl shadow-2xl shadow-black/80 max-w-[180px] sm:max-w-[200px]"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[9px] text-white/50 uppercase tracking-widest">
                Retorno Diario
              </span>
            </div>
            <div className="text-base font-bold font-mono text-white tracking-tight">
              +$2.30 <span className="text-[10px] text-emerald-400 font-normal">/día (120 TH)</span>
            </div>
            <div className="text-[8px] font-mono text-white/40 mt-0.5 flex items-center gap-1">
              <Activity className="w-2.5 h-2.5 text-white/60" />
              <span>Liquidación Directa en PEARL</span>
            </div>
          </motion.div>

          {/* Floating Efficiency Badge (Bottom Right of Hardware) */}
          <motion.div
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="absolute -bottom-4 -right-2 sm:right-0 z-20 p-3 sm:p-3.5 rounded-2xl bg-[#0a0a0a]/90 border border-white/15 backdrop-blur-xl shadow-2xl shadow-black/80 max-w-[180px] sm:max-w-[200px]"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span className="font-mono text-[9px] text-white/50 uppercase tracking-widest">
                Eficiencia ASIC
              </span>
            </div>
            <div className="text-base font-bold font-mono text-white tracking-tight">
              19.5 W/TH <span className="text-[10px] text-white/60 font-normal">Eco</span>
            </div>
            <div className="text-[8px] font-mono text-white/40 mt-0.5 flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-purple-400" />
              <span>0% Consumo en Tu Casa</span>
            </div>
          </motion.div>

          {/* Centered 3D Titan Hardware */}
          <motion.div
            style={{
              rotateX: rotateXHardware,
              rotateY: rotateYHardware,
              scale: scaleHardware,
            }}
            className="relative w-full flex items-center justify-center transform-gpu"
          >
            {/* Radial Deep Shadow */}
            <div className="absolute inset-x-8 bottom-4 h-10 bg-black/90 blur-xl rounded-full pointer-events-none" />

            <img
              src="/assets/powminer-titan-hero-transparent.png"
              alt="PouwMiner Titan Series Digital ASIC Hardware"
              className="relative w-full max-h-[380px] sm:max-h-[440px] object-contain drop-shadow-[0_25px_60px_rgba(0,0,0,0.98)] select-none"
              style={{
                maskImage: 'radial-gradient(ellipse at center, black 65%, transparent 95%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 65%, transparent 95%)',
              }}
              loading="eager"
            />
          </motion.div>
        </motion.div>
      </div>

      {/* Protocol Live Telemetry Ribbon */}
      <div className="relative z-10 w-full max-w-7xl mx-auto pt-4 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-white/40">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>PRÓXIMO REPARTO: <strong className="text-white/80">00:00 UTC (AUTOMÁTICO)</strong></span>
        </div>
        <div className="hidden sm:block">
          <span>BENCHMARK OFICIAL: <strong className="text-white/80">120 TH/s = ~$2.30 USD/DÍA (~23 PEARL)</strong></span>
        </div>
        <div>
          <span>PREVENTA FASE 1: <strong className="text-white">15 DÍAS RESTANTES</strong></span>
        </div>
      </div>

      {/* Bottom Scroll Prompt */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.6 }}
        className="relative z-10 flex flex-col items-center gap-1 text-white/40 hover:text-white/70 transition-colors pt-2 cursor-pointer"
        onClick={() => {
          document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' });
        }}
      >
        <span className="text-[9px] font-semibold tracking-[0.4em] uppercase text-white/40">
          SCROLL TO EXPLORE
        </span>
        <motion.div
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown className="w-3.5 h-3.5 text-white/40" />
        </motion.div>
      </motion.div>
    </section>
  );
}
