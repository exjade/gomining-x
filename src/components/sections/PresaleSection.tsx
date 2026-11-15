import { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import { ArrowRight, Flame, Clock, Sparkles, ShieldCheck, Zap } from 'lucide-react';
import { presalePlans } from '@/data/catalog';
import { AuthMode } from '../auth/AuthModal';

interface PresaleSectionProps {
  onOpenAuth?: (mode?: AuthMode) => void;
}

export function PresaleSection({ onOpenAuth }: PresaleSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [activeRevealed, setActiveRevealed] = useState<Record<string, boolean>>({});

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 22,
    restDelta: 0.001,
  });

  const yClock = useTransform(smoothProgress, [0, 1], [-25, 25]);
  const yCards = useTransform(smoothProgress, [0, 1], [20, -20]);
  const yBg = useTransform(smoothProgress, [0, 1], [0, 110]);

  // 15 days launch countdown timer
  const [timeLeft, setTimeLeft] = useState({
    days: 14,
    hours: 23,
    minutes: 58,
    seconds: 40,
  });

  useEffect(() => {
    const target = new Date();
    target.setDate(target.getDate() + 15);
    const targetMs = target.getTime();

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, targetMs - now);

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const toggleReveal = (id: string) => {
    setActiveRevealed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const remainingUnits: Record<string, number> = {
    'presale-1': 4,
    'presale-2': 7,
    'presale-3': 6,
    'presale-4': 9,
  };

  return (
    <section
      id="preventa"
      ref={containerRef}
      className="relative py-32 px-4 sm:px-6 bg-[#050505] text-white border-t border-white/10 overflow-hidden select-none"
      aria-labelledby="presale-title"
    >
      {/* Background Parallax Atmosphere */}
      <motion.div style={{ y: yBg }} className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[500px] bg-purple-950/20 rounded-full blur-[190px]" />
      </motion.div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="font-mono text-xs text-white/40">05</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
              PRESALE FASE 1 // CATÁLOGO OFICIAL DE PRELステップ
            </span>
          </div>

          <h2
            id="presale-title"
            className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter text-white mb-4 leading-none"
          >
            Fase de Preventa.
          </h2>
          <p className="text-sm sm:text-base text-white/60 max-w-xl mx-auto leading-relaxed">
            Asegura tu minero digital al precio preferencial de génesis. <strong className="text-white">Pasa el cursor o toca cada tarjeta para disolver las partículas</strong> y revelar el precio de lanzamiento en mainnet.
          </p>

          {/* Particle Interaction Hint Badge */}
          <div className="inline-flex items-center gap-2 mt-6 px-4 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-mono">
            <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-spin" />
            <span>ENMASCARAMIENTO CUÁNTICO: HOVER O CLIC DISUELVE Y REVELA PRECIO FINAL</span>
          </div>
        </div>

        {/* 15-DAY LAUNCH TIMER (Parallax Depth + Glowing HUD) */}
        <motion.div
          style={{ y: yClock }}
          className="max-w-3xl mx-auto mb-16 p-8 sm:p-10 rounded-3xl bg-[#0a0a0a]/85 backdrop-blur-2xl border border-white/15 hover:border-purple-500/30 transition-all text-center shadow-2xl relative overflow-hidden"
        >
          <div className="absolute -top-16 -right-16 w-36 h-36 bg-purple-600/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-[0.35em] text-white/50 mb-6">
            <Flame className="w-3.5 h-3.5 text-purple-400" />
            <span>TIEMPO RESTANTE DE PREVENTA FASE 1</span>
          </div>

          {/* Time digits grid */}
          <div className="grid grid-cols-4 gap-3 sm:gap-4 mb-8">
            {[
              { label: 'DÍAS', val: String(timeLeft.days).padStart(2, '0') },
              { label: 'HORAS', val: String(timeLeft.hours).padStart(2, '0') },
              { label: 'MINUTOS', val: String(timeLeft.minutes).padStart(2, '0') },
              { label: 'SEGUNDOS', val: String(timeLeft.seconds).padStart(2, '0') },
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/20 transition-colors"
              >
                <span className="text-4xl sm:text-6xl font-mono font-bold text-white tracking-tighter">
                  {item.val}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40 mt-2">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          {/* Progress FOMO Bar with animated pulse */}
          <div className="space-y-2.5 max-w-xl mx-auto">
            <div className="flex justify-between text-xs font-mono text-white/60">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Lote 01: 78% Asignado
              </span>
              <span className="text-white font-bold flex items-center gap-1 text-emerald-400">
                <Clock className="w-3 h-3" />
                Quedan 26 de 120 Cupos Totales
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden relative">
              <div className="h-full bg-gradient-to-r from-purple-500 via-white to-purple-400 rounded-full w-[78%] shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse" />
            </div>
            <p className="text-[10px] font-mono text-white/40 mt-1">
              Al completarse el cupo de cada nivel, la tasa de preventa desaparece definitivamente.
            </p>
          </div>
        </motion.div>

        {/* 4 OFFICIAL NOTION PRESALE TIERS with Glassmorphism & Particle Dissolve Animation */}
        <motion.div style={{ y: yCards }} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {presalePlans.map((plan, i) => {
            const isPopular = plan.badge === 'Popular';
            const isHovered = hoveredCardId === plan.id || activeRevealed[plan.id];
            const unitsLeft = remainingUnits[plan.id] || 5;
            const retailPrice = plan.launchPrice || plan.price * 2.5;
            const savings = retailPrice - plan.price;
            const percentSavings = Math.round((savings / retailPrice) * 100);

            return (
              <div
                key={plan.id}
                onMouseEnter={() => setHoveredCardId(plan.id)}
                onMouseLeave={() => setHoveredCardId(null)}
                onClick={() => toggleReveal(plan.id)}
                className={`relative group flex flex-col justify-between p-7 sm:p-8 rounded-3xl backdrop-blur-3xl transition-all duration-500 cursor-pointer overflow-hidden transform-gpu select-none ${
                  isPopular
                    ? 'bg-[#0e0e0e]/90 border border-white/40 shadow-2xl shadow-purple-950/40 hover:-translate-y-2'
                    : 'bg-[#0a0a0a]/80 border border-white/15 hover:border-purple-400/40 shadow-2xl hover:shadow-purple-950/30 hover:-translate-y-2'
                }`}
              >
                {/* PARTICLE DISSOLVE MASK OVERLAY */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="absolute inset-0 pointer-events-none z-0"
                    >
                      {/* Radial particle aura */}
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.18),transparent_70%)]" />
                      {/* Animated particle dots */}
                      <div className="absolute top-2 left-4 w-1 h-1 rounded-full bg-purple-400 animate-ping" />
                      <div className="absolute top-1/3 right-4 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      <div className="absolute bottom-1/4 left-6 w-1 h-1 rounded-full bg-emerald-400 animate-ping" />
                      {/* Laser sweep line */}
                      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-400 to-transparent animate-pulse" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-white text-[9px] font-bold text-[#050505] font-mono uppercase tracking-widest shadow-lg z-20">
                    Popular
                  </div>
                )}

                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-[10px] font-mono text-white/40 block">0{i + 1} //</span>
                      <h3 className="text-2xl font-bold tracking-tight text-white font-mono">
                        {plan.label}
                      </h3>
                    </div>
                    <span className="text-[9px] font-mono text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/10 uppercase">
                      Lote Limitado
                    </span>
                  </div>

                  {/* Cupos Restantes Tag */}
                  <div className="flex items-center gap-1.5 mb-4 text-[10px] font-mono text-rose-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                    <span className="font-semibold uppercase tracking-wider">
                      Solo {unitsLeft} de 30 cupos
                    </span>
                  </div>

                  {/* PRICE AREA: DISSOLVING REVEAL BETWEEN PRE-SALE & LAUNCH */}
                  <div className="mb-6 p-4 rounded-2xl bg-white/[0.02] border border-white/5 transition-all">
                    {/* Default State: Presale Price */}
                    <div className="flex items-baseline justify-between mb-1">
                      <div>
                        <span className="text-3xl sm:text-4xl font-bold tracking-tight text-white font-mono">
                          ${plan.price}
                        </span>
                        <span className="text-xs font-mono text-white/40 uppercase ml-1">USDT</span>
                      </div>
                      <span className="text-[9px] font-mono text-purple-300 uppercase px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/25">
                        PREVENTA
                      </span>
                    </div>

                    {/* Revealed Post-Hover State: Launch Price with Particle Dissolve */}
                    <div className="pt-2 border-t border-white/5 mt-2 space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-white/40 text-[11px]">En Lanzamiento:</span>
                        <span className={`font-bold transition-colors ${isHovered ? 'text-purple-300 scale-105' : 'text-white/60 line-through'}`}>
                          ${retailPrice} USDT
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-emerald-400 font-semibold">Ahorro Preventa:</span>
                        <span className="text-emerald-400 font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20">
                          -${savings} USDT ({percentSavings}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Specs */}
                  <div className="space-y-3 py-3 border-t border-b border-white/10 mb-6 text-xs text-white/70">
                    <div className="flex justify-between">
                      <span className="text-white/40">Potencia de Minado</span>
                      <strong className="text-white font-mono">{plan.powerTh} TH/s</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Eficiencia</span>
                      <strong className="text-white font-mono">19.5 W/TH</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Liquidación Diaria</span>
                      <strong className="text-emerald-400 font-mono">
                        ~${plan.usdPerDay.toFixed(2)} /d ({plan.pearlPerDay.toFixed(2)} PEARL)
                      </strong>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-white/40">Límite Total</span>
                      <strong className="text-white/80 font-mono">30 Unidades Génesis</strong>
                    </div>
                  </div>
                </div>

                <div className="relative z-10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAuth ? onOpenAuth('register') : window.location.assign('#comenzar');
                    }}
                    className={`w-full py-4 rounded-full font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] shadow-xl ${
                      isPopular
                        ? 'bg-white text-[#050505] hover:bg-white/90 shadow-white/10'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-current" />
                    <span>Asegurar {plan.label} en Preventa</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[9px] font-mono text-white/40 text-center block mt-2">
                    ⚠️ Este precio desaparece al agotarse las 30 unidades
                  </span>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Bottom Trust Line */}
        <div className="flex items-center justify-center gap-6 text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 text-center flex-wrap">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            Cupo Estricto de 30 Mineros por Nivel
          </span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span>Liquidación en Tokens PEARL</span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span>SLA 99.98% Garantizado</span>
        </div>
      </div>
    </section>
  );
}
