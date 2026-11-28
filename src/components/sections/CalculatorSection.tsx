import { useState, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { ArrowRight, Sparkles, CheckCircle2, Zap } from 'lucide-react';
import { presaleMinerPlans } from '../../minerCatalog';
import { calculateLandingEarnings } from '../../landingEarnings';
import type { AuthMode } from '../ui/Navbar';
import type { EmbudoPresaleSelection } from '../embudo-f1';

interface CalculatorSectionProps {
  onOpenAuth?: (mode?: AuthMode, prefill?: Partial<EmbudoPresaleSelection>) => void;
}

export function CalculatorSection({ onOpenAuth }: CalculatorSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Default to 120 TH/s benchmark without highlighting an unrelated presale preset
  const [selectedTh, setSelectedTh] = useState<number>(120);
  const [activePlanId, setActivePlanId] = useState<string>('');

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 22,
    restDelta: 0.001,
  });

  // Parallax Depth
  const ySlider = useTransform(smoothProgress, [0, 1], [-20, 20]);
  const yResult = useTransform(smoothProgress, [0, 1], [20, -20]);
  const yBg = useTransform(smoothProgress, [0, 1], [0, 120]);

  const minPlanTh = presaleMinerPlans[0]?.powerTh ?? 1.46;
  const { usdDay, usdMonth, usdYear, pearlDay, pearlMonth, pearlYear } =
    calculateLandingEarnings(selectedTh);

  const formatUsd = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatPearl = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSelectMiner = (planId: string, th: number) => {
    setActivePlanId(planId);
    setSelectedTh(th);
  };

  return (
    <section
      id="calculadora"
      ref={containerRef}
      className="relative py-32 px-4 sm:px-6 bg-[#050505] text-white border-t border-white/10 select-none overflow-hidden"
      aria-labelledby="calculator-title"
    >
      {/* Background Parallax Ambient Glow */}
      <motion.div style={{ y: yBg }} className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[450px] bg-purple-950/20 rounded-full blur-[180px]" />
      </motion.div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header with High Breathing Room */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="font-mono text-xs text-white/40">04</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
              HASHRATE YIELD ENGINE // SIMULADOR DE RENDIMIENTO
            </span>
          </div>

          <h2
            id="calculator-title"
            className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter text-white mb-5 leading-none"
          >
            Calculadora.
          </h2>
          <p className="text-sm sm:text-base text-white/60 max-w-xl mx-auto leading-relaxed">
            Simulación ilustrativa basada en la dificultad actual de red: <strong className="text-white">120 TH/s estiman aprox. $2.30 USD al día</strong> (~23.00 PEARL). Las recompensas son variables y no representan un retorno fijo ni garantizado.
          </p>

          {/* Key Value Badges */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6 text-[10px] font-mono text-white/50 uppercase tracking-widest">
            <span className="px-3.5 py-1.5 rounded-full border border-white/15 bg-white/[0.03] text-white flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              120 TH/s = ~$2.30 USD / DÍA
            </span>
            <span className="px-3.5 py-1.5 rounded-full border border-white/15 bg-white/[0.03] text-white">
              🏠 0% COSTO ELÉCTRICO EN HOGAR
            </span>
            <span className="px-3.5 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300">
              💎 REF: $0.10 USD POR TOKEN PEARL
            </span>
          </div>
        </div>

        {/* Main Calculator Grid with Differential Parallax Float */}
        <div className="grid lg:grid-cols-12 gap-8 items-stretch mb-16">
          {/* Controls Slider Panel */}
          <motion.div
            style={{ y: ySlider }}
            className="lg:col-span-7 p-6 sm:p-8 lg:p-10 rounded-3xl bg-[#0a0a0a]/90 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-widest text-white/50 block mb-1">
                    POTENCIA DE CÓMPUTO SELECCIONADA
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl sm:text-6xl font-mono font-bold tracking-tight text-white">
                      {selectedTh.toFixed(selectedTh % 1 === 0 ? 0 : 2)}
                    </span>
                    <span className="text-lg font-mono text-purple-400 font-semibold">TH/s</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-mono text-white/40 block mb-1">
                    ESTIMACIÓN DE RECOMPENSA
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>~${formatUsd(usdDay)} USD / d</span>
                  </span>
                </div>
              </div>

              {/* High-Precision Fluid Interactive Slider */}
              <div className="space-y-4 mb-8">
                <div className="relative flex items-center">
                  <input
                    type="range"
                    min={minPlanTh}
                    max="500"
                    step="0.5"
                    value={selectedTh}
                    onChange={(e) => {
                      setSelectedTh(Number(e.target.value));
                      setActivePlanId('');
                    }}
                    className="w-full h-3 rounded-full appearance-none bg-white/10 accent-purple-400 cursor-pointer focus:outline-none transition-all"
                    aria-label="Selector de Hashrate TH/s"
                  />
                </div>

                <div className="flex justify-between text-[10px] font-mono text-white/40">
                  <span>{minPlanTh} TH/s (Génesis)</span>
                  <span className="text-white/60">120 TH/s (Benchmark)</span>
                  <span>500 TH/s (Cluster)</span>
                </div>
              </div>

              {/* Fast Plan Presets from Canonical Presale */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 block">
                  O Elige un Nivel de Preventa Directo:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {presaleMinerPlans.map((plan) => {
                    const isSelected = activePlanId === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => handleSelectMiner(plan.id, plan.powerTh)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-purple-950/60 border-purple-400 text-white shadow-lg shadow-purple-900/30'
                            : 'bg-white/[0.02] border-white/10 text-white/60 hover:text-white hover:border-white/20'
                        }`}
                      >
                        <span className="block text-xs font-mono font-bold text-white">
                          {plan.powerTh} TH/s
                        </span>
                        <span className="block text-[10px] font-mono text-white/40">
                          ${plan.price} {plan.currency}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Micro Legal & Real-time Metrics */}
            <div className="pt-6 border-t border-white/5 mt-8 flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-white/40">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Telemetría de Pool en Vivo
              </span>
              <span>Dificultad de Red: 84.2 T</span>
              <span>Recompensas variables en PEARL</span>
            </div>
          </motion.div>

          {/* Results Display Panel (High Contrast Luxury Card) */}
          <motion.div
            style={{ y: yResult }}
            className="lg:col-span-5 p-6 sm:p-8 lg:p-10 rounded-3xl bg-[#0f0a1c] border-2 border-purple-500/40 shadow-2xl flex flex-col justify-between relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-xs font-mono uppercase tracking-[0.2em] text-purple-300">
                  Proyección Estimada
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Variable
                </span>
              </div>

              {/* Yield Breakdown */}
              <div className="space-y-4 mb-8">
                {/* Daily */}
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-1">
                    Estimación Diaria
                  </span>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-3xl sm:text-4xl font-mono font-bold text-emerald-400 tracking-tight">
                        ~${formatUsd(usdDay)}
                      </span>
                      <span className="text-xs text-white/60 font-mono font-semibold ml-1.5">USD</span>
                    </div>
                    <span className="text-xs font-mono text-emerald-400/90 font-semibold">
                      ≈ {formatPearl(pearlDay)} PEARL
                    </span>
                  </div>
                </div>

                {/* Monthly */}
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-1">
                    Proyección Mensual (30 días)
                  </span>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl sm:text-3xl font-mono font-bold text-white tracking-tight">
                        ~${formatUsd(usdMonth)}
                      </span>
                      <span className="text-xs text-white/60 font-mono font-semibold ml-1.5">USD</span>
                    </div>
                    <span className="text-xs font-mono text-purple-300 font-semibold">
                      ≈ {formatPearl(pearlMonth)} PEARL
                    </span>
                  </div>
                </div>

                {/* Annual */}
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-1">
                    Proyección Anual Estimativa (365 días)
                  </span>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-xl sm:text-2xl font-mono font-bold text-white tracking-tight">
                        ~${formatUsd(usdYear)}
                      </span>
                      <span className="text-[10px] sm:text-xs text-white/60 font-mono font-semibold ml-1">USD</span>
                    </div>
                    <span className="text-[10px] sm:text-xs font-mono text-white/70 font-semibold">
                      ≈ {formatPearl(pearlYear)} PEARL
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* HIGH-IMPACT NON-INTRUSIVE CALL TO ACTION */}
            <div className="pt-2">
              <button
                type="button"
                data-testid="calculator-preorder-btn"
                onClick={() =>
                  onOpenAuth
                    ? onOpenAuth('register', { powerTh: selectedTh, source: 'calculator' })
                    : window.location.assign('#preventa')
                }
                className="w-full py-3 sm:py-4 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.97] shadow-2xl shadow-white/5"
              >
                <Zap className="w-3.5 h-3.5 text-[#050505]" />
                <span className="truncate">Pre-ordenar Miner Preventa ({selectedTh.toFixed(0)} TH/s)</span>
                <ArrowRight className="w-4 h-4 text-[#050505] flex-shrink-0" />
              </button>
              <p className="text-[9px] font-mono text-white/45 text-center mt-2.5 leading-relaxed">
                Estimación ilustrativa sujeta a dificultad de red y condiciones de mercado. Sin ROI garantizado.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
