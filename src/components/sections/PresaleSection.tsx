import { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { ArrowRight, Flame, Clock, Sparkles, ShieldCheck, Zap } from 'lucide-react';
import { presaleMinerPlans } from '../../minerCatalog';
import { calculateLandingEarnings } from '../../landingEarnings';
import type { AuthMode } from '../ui/Navbar';

interface PresalePresentationMeta {
  badge?: string;
  launchPrice: number;
  launchPowerTh: number;
}

// Presentation-only launch comparison metadata keyed by canonical plan.id from src/minerCatalog.ts
const PRESALE_PRESENTATION_META: Record<string, PresalePresentationMeta> = {
  'presale-1': { launchPrice: 49.99, launchPowerTh: 2.5 },
  'presale-2': { launchPrice: 199.99, launchPowerTh: 12.0 },
  'presale-3': { badge: 'Popular', launchPrice: 499.99, launchPowerTh: 30.0 },
  'presale-4': { launchPrice: 899.99, launchPowerTh: 64.0 },
};

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
              PRESALE FASE 1 // NIVELES DE PREVENTA
            </span>
          </div>

          <h2
            id="presale-title"
            className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-white mb-3 sm:mb-4 leading-none"
          >
            Fase de Preventa.
          </h2>
          <p className="text-xs sm:text-sm md:text-base text-white/60 max-w-xl mx-auto leading-relaxed px-2">
            Asegura tu minero digital al precio preferencial de génesis. <strong className="text-white">Presiona el botón púrpura en cada minero</strong> para disparar el efecto cuántico y comparar su referencia de lanzamiento en mainnet.
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
                <span className="text-xl sm:text-4xl md:text-5xl font-mono font-bold tracking-tight text-white mb-0.5 sm:mb-1">
                  {item.val}
                </span>
                <span className="text-[7px] sm:text-[9px] md:text-[10px] font-mono tracking-widest text-white/40">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 text-xs font-mono text-purple-300">
            <Clock className="w-3.5 h-3.5" />
            <span>Al finalizar, los siguientes lotes pasarán a las tarifas estándar de lanzamiento oficial.</span>
          </div>
        </motion.div>

        {/* 4 Canonical Presale Cards Grid - Fully responsive with dynamic reveal */}
        <motion.div
          style={{ y: yCards }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12 sm:mb-16"
        >
          {presaleMinerPlans.map((plan) => {
            const meta = PRESALE_PRESENTATION_META[plan.id];
            const isRevealed = !!activeRevealed[plan.id];
            const isHovered = hoveredCardId === plan.id;
            const isPopular = meta?.badge === 'Popular';
            const limitUnits = plan.limitUnits ?? 30;
            const retailPrice = meta?.launchPrice ?? Number((plan.price * 2).toFixed(2));
            const launchPowerTh = meta?.launchPowerTh ?? plan.powerTh;
            const displayedPrice = isRevealed ? retailPrice : plan.price;
            const savings = Math.max(0, retailPrice - plan.price).toFixed(2);
            const percentSavings =
              retailPrice > 0 ? Math.round(((retailPrice - plan.price) / retailPrice) * 100) : 0;
            const estimate = calculateLandingEarnings(plan.powerTh);

            return (
              <div
                key={plan.id}
                onMouseEnter={() => setHoveredCardId(plan.id)}
                onMouseLeave={() => setHoveredCardId(null)}
                className={`relative rounded-3xl p-4 sm:p-6 flex flex-col justify-between transition-all duration-300 border ${
                  isPopular
                    ? 'bg-[#0f0a1c] border-purple-500/50 shadow-2xl shadow-purple-950/30'
                    : 'bg-[#0a0a0a]/90 border-white/10 hover:border-white/20'
                } ${isHovered ? '-translate-y-1' : ''}`}
              >
                {/* Popular badge */}
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-purple-500 text-white shadow-lg shadow-purple-500/50 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Más Buscado</span>
                  </span>
                )}

                {/* Header card with toggle */}
                <div>
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <span className="text-[10px] sm:text-xs font-mono text-white/50 tracking-wider">
                      CUPO FASE 1: <strong className="text-purple-300">{limitUnits} UDS</strong>
                    </span>

                    {/* Interactive Quantum Reveal Button */}
                    <button
                      type="button"
                      onClick={() => toggleReveal(plan.id)}
                      className={`text-[9px] sm:text-[10px] font-mono font-bold px-2.5 py-1 rounded-full transition-all flex items-center gap-1.5 shadow-md ${
                        isRevealed
                          ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white'
                          : 'bg-purple-950/40 text-purple-300 border border-purple-500/30 hover:border-purple-400'
                      }`}
                      title="Haz clic para ver el precio oficial de lanzamiento"
                    >
                      {isRevealed ? (
                        <>
                          <Sparkles className="w-3 h-3 text-white" />
                          <span>LANZAMIENTO</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-purple-400" />
                          <span>PREVENTA</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Title & Price with Quantum Reveal Transition */}
                  <div className="mb-4">
                    <span className="text-xs font-mono text-white/40 block mb-1">
                      {isRevealed ? 'Referencia Regular en Mainnet' : 'Precio Especial Génesis'}
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl sm:text-4xl font-mono font-bold tracking-tight text-white transition-all">
                        ${displayedPrice}
                      </span>
                      <span className="text-xs font-mono text-white/40">{plan.currency}</span>
                    </div>

                    {/* Savings comparison badge */}
                    <div className="mt-2.5 p-2 rounded-xl bg-white/[0.02] border border-white/5">
                      {isRevealed ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-white/40">Precio Preventa:</span>
                            <span className="text-purple-300 font-bold">
                              ${plan.price} {plan.currency}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-mono">
                            <span className="text-white/50">Diferencia de Acceso:</span>
                            <span className="text-purple-400 font-bold px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                              -${savings} {plan.currency} (-{percentSavings}%)
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-white/40">En Lanzamiento:</span>
                            <span className="text-white/50 line-through">
                              ${retailPrice} {plan.currency}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-mono">
                            <span className="text-emerald-400 font-semibold">Ahorras Ahora:</span>
                            <span className="text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                              -${savings} {plan.currency} ({percentSavings}%)
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
                        {isRevealed ? `${launchPowerTh} TH/s (Ref.)` : `${plan.powerTh} TH/s`}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/40 text-[10px] sm:text-[11px]">Eficiencia Térmica</span>
                      <strong className="text-white font-mono text-[11px] sm:text-xs">19.5 W/TH</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/40 text-[10px] sm:text-[11px]">Estimación Diaria</span>
                      <strong className="text-emerald-400 font-mono text-[10px] sm:text-[11px]">
                        ~${estimate.usdDay.toFixed(2)}/d ({estimate.pearlDay.toFixed(1)} PEARL)
                      </strong>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-white/40">Límite Génesis</span>
                      <strong className="text-white/80 font-mono">{limitUnits} Cupos Totales</strong>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 pt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenAuth) {
                        onOpenAuth('register');
                      } else {
                        window.location.assign('#comenzar');
                      }
                    }}
                    className={`w-full py-3 sm:py-3.5 rounded-full font-semibold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] shadow-xl ${
                      isPopular
                        ? 'bg-white text-[#050505] hover:bg-white/90 shadow-white/10'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-current flex-shrink-0" />
                    <span className="truncate">
                      Asegurar {plan.powerTh} TH/s (${plan.price} {plan.currency})
                    </span>
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
          <span>Recompensas Variables en Tokens PEARL</span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span>Infraestructura Monitoreada 24/7</span>
        </div>
      </div>
    </section>
  );
}
