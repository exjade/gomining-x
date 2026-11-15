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

  const yClock = useTransform(smoothProgress, [0, 1], [-20, 20]);
  const yCards = useTransform(smoothProgress, [0, 1], [15, -15]);
  const yBg = useTransform(smoothProgress, [0, 1], [0, 100]);

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
      className="relative py-20 sm:py-32 px-3 sm:px-6 bg-[#050505] text-white border-t border-white/10 overflow-hidden select-none"
      aria-labelledby="presale-title"
    >
      {/* Background Parallax Atmosphere */}
      <motion.div style={{ y: yBg }} className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[500px] bg-purple-950/20 rounded-full blur-[190px]" />
      </motion.div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="font-mono text-xs text-white/40">05</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[10px] sm:text-[11px] font-semibold tracking-[0.35em] uppercase text-white/60">
              PRESALE FASE 1 // CATÁLOGO OFICIAL NOTION
            </span>
          </div>

          <h2
            id="presale-title"
            className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-white mb-3 sm:mb-4 leading-none"
          >
            Fase de Preventa.
          </h2>
          <p className="text-xs sm:text-sm md:text-base text-white/60 max-w-xl mx-auto leading-relaxed px-2">
            Asegura tu minero digital al precio preferencial de génesis. <strong className="text-white">Presiona el botón púrpura en cada minero</strong> para disparar el efecto cuántico y ver su precio regular de lanzamiento en mainnet.
          </p>
        </div>

        {/* 15-DAY LAUNCH TIMER (Adaptive for 360px) */}
        <motion.div
          style={{ y: yClock }}
          className="max-w-3xl mx-auto mb-12 sm:mb-16 p-4 sm:p-8 md:p-10 rounded-3xl bg-[#0a0a0a]/85 backdrop-blur-2xl border border-white/15 hover:border-purple-500/30 transition-all text-center shadow-2xl relative overflow-hidden"
        >
          <div className="absolute -top-16 -right-16 w-36 h-36 bg-purple-600/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.25em] sm:tracking-[0.35em] text-white/50 mb-4 sm:mb-6">
            <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-400" />
            <span>TIEMPO RESTANTE DE PREVENTA FASE 1</span>
          </div>

          {/* Time digits grid - Fluid responsive down to 360px */}
          <div className="grid grid-cols-4 gap-1.5 sm:gap-3 md:gap-4 mb-6 sm:mb-8">
            {[
              { label: 'DÍAS', val: String(timeLeft.days).padStart(2, '0') },
              { label: 'HORAS', val: String(timeLeft.hours).padStart(2, '0') },
              { label: 'MINUTOS', val: String(timeLeft.minutes).padStart(2, '0') },
              { label: 'SEGUNDOS', val: String(timeLeft.seconds).padStart(2, '0') },
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/20 transition-colors"
              >
                <span className="text-xl sm:text-4xl md:text-5xl font-mono font-bold text-white tracking-tighter">
                  {item.val}
                </span>
                <span className="text-[8px] sm:text-[10px] font-mono uppercase tracking-[0.15em] sm:tracking-[0.25em] text-white/40 mt-1 sm:mt-2">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          {/* Progress FOMO Bar */}
          <div className="space-y-2 max-w-xl mx-auto px-1">
            <div className="flex justify-between text-[10px] sm:text-xs font-mono text-white/60">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Lote 01: 78% Asignado
              </span>
              <span className="text-white font-bold flex items-center gap-1 text-emerald-400">
                <Clock className="w-3 h-3" />
                Quedan 26 de 120 Cupos
              </span>
            </div>
            <div className="w-full h-1.5 sm:h-2 rounded-full bg-white/10 overflow-hidden relative">
              <div className="h-full bg-gradient-to-r from-purple-500 via-white to-purple-400 rounded-full w-[78%] shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse" />
            </div>
            <p className="text-[9px] sm:text-[10px] font-mono text-white/40 mt-1">
              Al completarse el cupo de cada nivel, la tasa de preventa desaparece definitivamente.
            </p>
          </div>
        </motion.div>

        {/* 4 OFFICIAL NOTION PRESALE TIERS with Pulsing Interactive Button & Particle Dissolve */}
        <motion.div style={{ y: yCards }} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12">
          {presalePlans.map((plan, i) => {
            const isPopular = plan.badge === 'Popular';
            const isRevealed = Boolean(activeRevealed[plan.id]);
            const isHovered = hoveredCardId === plan.id || isRevealed;
            const unitsLeft = remainingUnits[plan.id] || 5;
            const retailPrice = plan.launchPrice || plan.price * 2.5;
            const savings = retailPrice - plan.price;
            const percentSavings = Math.round((savings / retailPrice) * 100);

            return (
              <div
                key={plan.id}
                onMouseEnter={() => setHoveredCardId(plan.id)}
                onMouseLeave={() => setHoveredCardId(null)}
                className={`relative group flex flex-col justify-between p-4 sm:p-6 lg:p-7 rounded-3xl backdrop-blur-3xl transition-all duration-500 overflow-hidden transform-gpu select-none ${
                  isPopular
                    ? 'bg-[#0e0e0e]/95 border border-purple-500/50 shadow-2xl shadow-purple-950/40'
                    : 'bg-[#0a0a0a]/85 border border-white/15 hover:border-purple-400/40 shadow-xl'
                }`}
              >
                {/* PARTICLE DISSOLVE MASK OVERLAY */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35 }}
                      className="absolute inset-0 pointer-events-none z-0"
                    >
                      {/* Radial particle aura */}
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.22),transparent_70%)]" />
                      {/* Animated particle dots */}
                      <div className="absolute top-3 left-4 w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                      <div className="absolute top-1/2 right-4 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      <div className="absolute bottom-1/3 left-6 w-1 h-1 rounded-full bg-emerald-400 animate-ping" />
                      <div className="absolute top-1/4 left-1/2 w-1 h-1 rounded-full bg-purple-300 animate-pulse" />
                      {/* Laser sweep line */}
                      <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-purple-400 to-transparent animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-white text-[8px] sm:text-[9px] font-bold text-[#050505] font-mono uppercase tracking-widest shadow-lg z-20">
                    Recomendado
                  </div>
                )}

                <div className="relative z-10">
                  {/* TOP ROW: Identifier + PULSING PURPLE BUTTON */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[10px] font-mono text-white/40 block">0{i + 1} //</span>

                    {/* BOTONCITO MORADO PULSANTE DE PREVENTA / LANZAMIENTO */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleReveal(plan.id);
                      }}
                      className="group/btn relative px-2.5 py-1 sm:px-3 sm:py-1 rounded-full border border-purple-500/50 bg-purple-600/25 hover:bg-purple-600/40 text-purple-200 text-[9px] sm:text-[10px] font-mono font-bold flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(168,85,247,0.4)] active:scale-[0.95] cursor-pointer"
                      title="Presiona para alternar entre precio de Preventa y Lanzamiento"
                    >
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-400" />
                      </span>
                      <span>{isRevealed ? 'LANZAMIENTO' : 'PREVENTA'}</span>
                      <Sparkles className="w-2.5 h-2.5 text-purple-300 animate-pulse" />
                    </button>
                  </div>

                  {/* Card Title */}
                  <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-mono mb-1">
                    {plan.label}
                  </h3>

                  {/* Cupos Restantes Tag */}
                  <div className="flex items-center gap-1.5 mb-3 text-[9px] sm:text-[10px] font-mono text-rose-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                    <span className="font-semibold uppercase tracking-wider">
                      Solo {unitsLeft} de 30 cupos génesis
                    </span>
                  </div>

                  {/* PRICE AREA: INTERACTIVE STATE DRIVEN BY PURPLE BUTTON */}
                  <div className="mb-4 p-3 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/10 transition-all">
                    {/* Price Header */}
                    <div className="flex items-baseline justify-between mb-1">
                      <div>
                        <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono">
                          ${isRevealed ? retailPrice : plan.price}
                        </span>
                        <span className="text-[10px] sm:text-xs font-mono text-white/40 uppercase ml-1">USDT</span>
                      </div>
                      <span
                        className={`text-[8px] sm:text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                          isRevealed
                            ? 'text-purple-300 bg-purple-500/20 border border-purple-500/40'
                            : 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/30'
                        }`}
                      >
                        {isRevealed ? 'LANZAMIENTO' : 'PREVENTA'}
                      </span>
                    </div>

                    {/* Sub-details */}
                    <div className="pt-2 border-t border-white/5 mt-1.5 space-y-1">
                      {isRevealed ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-white/40">Precio en Preventa:</span>
                            <span className="text-emerald-400 font-bold">${plan.price} USDT</span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-mono">
                            <span className="text-purple-300 font-semibold">Ahorro Génesis:</span>
                            <span className="text-purple-300 font-bold px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                              -${savings} USDT (-{percentSavings}%)
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-white/40">En Lanzamiento:</span>
                            <span className="text-white/50 line-through">${retailPrice} USDT</span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-mono">
                            <span className="text-emerald-400 font-semibold">Ahorras Ahora:</span>
                            <span className="text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                              -${savings} USDT ({percentSavings}%)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Specs Table adapted for small viewports */}
                  <div className="space-y-2.5 py-2.5 border-t border-b border-white/10 mb-4 text-[11px] sm:text-xs text-white/70">
                    <div className="flex justify-between items-center">
                      <span className="text-white/40 text-[10px] sm:text-[11px]">Potencia Asignada</span>
                      <strong className="text-white font-mono text-[11px] sm:text-xs">
                        {isRevealed ? `${plan.launchPowerTh || plan.powerTh} TH/s (Boost)` : `${plan.powerTh} TH/s`}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/40 text-[10px] sm:text-[11px]">Eficiencia Térmica</span>
                      <strong className="text-white font-mono text-[11px] sm:text-xs">19.5 W/TH</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/40 text-[10px] sm:text-[11px]">Liquidación Diaria</span>
                      <strong className="text-emerald-400 font-mono text-[10px] sm:text-[11px]">
                        ~${plan.usdPerDay.toFixed(2)}/d ({plan.pearlPerDay.toFixed(1)} PEARL)
                      </strong>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-white/40">Límite Génesis</span>
                      <strong className="text-white/80 font-mono">30 Cupos Totales</strong>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 pt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAuth ? onOpenAuth('register') : window.location.assign('#comenzar');
                    }}
                    className={`w-full py-3 sm:py-3.5 rounded-full font-semibold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] shadow-xl ${
                      isPopular
                        ? 'bg-white text-[#050505] hover:bg-white/90 shadow-white/10'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-current flex-shrink-0" />
                    <span className="truncate">Asegurar {plan.label} (${plan.price} USDT)</span>
                    <ArrowRight className="w-3 h-3 flex-shrink-0" />
                  </button>
                  <span className="text-[8px] sm:text-[9px] font-mono text-white/40 text-center block mt-1.5">
                    ⚠️ Precio preferencial por {timeLeft.days} días restantes
                  </span>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Bottom Trust Line */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.15em] sm:tracking-[0.2em] text-white/40 text-center flex-wrap px-2">
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
