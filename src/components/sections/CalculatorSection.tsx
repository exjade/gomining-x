import { useState, useCallback, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { presalePlans, DAILY_USD_PER_TH, DAILY_PEARL_PER_TH } from '@/data/catalog';
import { ArrowRight, ShieldAlert, Sparkles, CheckCircle2, Zap } from 'lucide-react';
import { AuthMode } from '../auth/AuthModal';

interface CalculatorSectionProps {
  onOpenAuth?: (mode?: AuthMode) => void;
}

export function CalculatorSection({ onOpenAuth }: CalculatorSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Default to the 120 TH/s benchmark specified by Roman
  const [selectedTh, setSelectedTh] = useState<number>(120);
  const [activePlanId, setActivePlanId] = useState<string>('presale-3');

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

  // Exact math from Roman: 120 TH/s = 2.30 USD/day
  const calculateEarnings = useCallback(() => {
    const usdPerDay = selectedTh * DAILY_USD_PER_TH;
    const pearlPerDay = selectedTh * DAILY_PEARL_PER_TH;
    return {
      usdDay: usdPerDay,
      usdMonth: usdPerDay * 30,
      usdYear: usdPerDay * 365,
      pearlDay: pearlPerDay,
      pearlMonth: pearlPerDay * 30,
      pearlYear: pearlPerDay * 365,
    };
  }, [selectedTh]);

  const { usdDay, usdMonth, usdYear, pearlDay, pearlMonth, pearlYear } = calculateEarnings();

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
              HASHRATE YIELD ENGINE // DATOS REALES VERIFICADOS
            </span>
          </div>

          <h2
            id="calculator-title"
            className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter text-white mb-5 leading-none"
          >
            Calculadora.
          </h2>
          <p className="text-sm sm:text-base text-white/60 max-w-xl mx-auto leading-relaxed">
            Simulación realista basada en la dificultad de red y rendimiento verificado: <strong className="text-white">120 TH/s generan aprox. $2.30 USD al día</strong> (~23.00 PEARL) netos a tu billetera.
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
            className="lg:col-span-7 p-4 sm:p-8 lg:p-12 rounded-3xl bg-[#0a0a0a] border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between space-y-6 sm:space-y-8 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/[0.02] rounded-full blur-2xl pointer-events-none" />

            <div>
              <div className="flex justify-between items-center mb-3 sm:mb-4">
                <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.25em] text-white/50">
                  Potencia de Hashrate Cloud
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Tasa Oficial Activa
                </span>
              </div>

              <div className="flex items-baseline gap-2 sm:gap-3 mb-4 sm:mb-6">
                <span className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-mono font-bold text-white tracking-tighter">
                  {selectedTh.toFixed(1)}
                </span>
                <span className="text-base sm:text-2xl font-mono text-white/40 font-semibold">TH/s</span>
              </div>

              {/* Slider Component */}
              <input
                id="th-slider"
                type="range"
                min="1.46"
                max="500"
                step="0.5"
                value={selectedTh}
                onChange={(e) => {
                  setSelectedTh(Number(e.target.value));
                  setActivePlanId('');
                }}
                className="w-full h-2.5 sm:h-3 rounded-full appearance-none cursor-pointer bg-white/10 accent-white transition-all hover:bg-white/15"
                aria-label="Ajustar potencia de hashrate en TH/s"
              />
              <div className="flex justify-between text-[10px] sm:text-[11px] text-white/40 mt-3 font-mono">
                <span>1.46 TH/s (Base)</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTh(120);
                    setActivePlanId('benchmark-120');
                  }}
                  className="text-emerald-400 font-bold hover:underline cursor-pointer"
                >
                  120 TH/s ($2.30/d)
                </button>
                <span>500 TH/s (Inst.)</span>
              </div>
            </div>

            {/* PREVENTA MINERS WITH HOLOGRAPHIC SWEEP ANIMATION */}
            <div className="pt-4 sm:pt-6 border-t border-white/5 relative">
              {/* Header with animated radar sweep badge */}
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-400" />
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-mono font-bold text-white uppercase tracking-[0.2em] sm:tracking-[0.25em] flex items-center gap-1.5">
                    MINER PREVENTA · FASE 1
                  </span>
                </div>
                <span className="text-[9px] sm:text-[10px] font-mono text-purple-300 border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 rounded-full uppercase">
                  Tasa Preferencial Activa
                </span>
              </div>

              {/* Holographic sweep light effect container */}
              <div className="relative rounded-2xl overflow-hidden p-1 bg-white/[0.01] border border-white/5">
                {/* Continuous animated laser sweep beam */}
                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(90deg,transparent_0%,rgba(168,85,247,0.18)_50%,transparent_100%)] animate-pulse" />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 relative z-10">
                  {presalePlans.map((plan) => {
                    const isSelected = activePlanId === plan.id || Math.abs(selectedTh - plan.powerTh) < 0.1;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => handleSelectMiner(plan.id, plan.powerTh)}
                        className={`group relative p-2.5 sm:p-3.5 rounded-xl border text-left transition-all duration-300 active:scale-[0.97] overflow-hidden ${
                          isSelected
                            ? 'border-white bg-[#151515] text-white shadow-xl shadow-purple-950/40 ring-1 ring-white/30'
                            : 'border-white/10 hover:border-purple-500/40 bg-white/[0.02] text-white/50 hover:text-white'
                        }`}
                      >
                        {/* Shimmer sweep bar on button hover */}
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[8px] sm:text-[9px] font-mono uppercase tracking-wider text-purple-300 font-semibold truncate">
                            PREVENTA
                          </span>
                          {plan.badge === 'Popular' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          )}
                        </div>

                        <span className="block font-bold text-white font-mono text-xs sm:text-base">
                          {plan.powerTh} TH/s
                        </span>
                        <span className="text-[9px] sm:text-[10px] text-white/50 font-mono block mt-0.5">
                          ${plan.price} USDT
                        </span>
                        <span className="text-[9px] sm:text-[10px] text-emerald-400 font-mono font-bold block mt-0.5">
                          ~${formatUsd(plan.usdPerDay)}/d
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sub-label showing selection confirmation */}
              <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-mono text-white/40 mt-2.5">
                <span>Toca un miner para proyectar rendimiento</span>
                <span className="text-emerald-400 font-bold">120 TH/s = Benchmark</span>
              </div>
            </div>
          </motion.div>

          {/* Results Summary Box with High-Tech Ambient Hover Glow */}
          <motion.div
            style={{ y: yResult }}
            className="group lg:col-span-5 p-4 sm:p-8 lg:p-12 rounded-3xl bg-[#0a0a0a] border border-white/10 hover:border-purple-500/40 hover:shadow-[0_0_50px_-10px_rgba(168,85,247,0.25)] transition-all duration-300 flex flex-col justify-between space-y-4 sm:space-y-6 relative overflow-hidden shadow-2xl"
          >
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/15 rounded-full blur-[70px] pointer-events-none group-hover:bg-purple-600/30 transition-all" />

            <div>
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.25em] text-white/50">
                  Rendimiento Neto Proyectado
                </span>
                <span className="px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[8px] sm:text-[9px] font-mono text-emerald-400 tracking-wider">
                  LIQUIDACIÓN 24H
                </span>
              </div>

              {/* Staggered Returns Cards */}
              <div className="space-y-2.5 sm:space-y-3.5">
                {/* Daily */}
                <div className="p-3 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-colors">
                  <span className="text-[9px] sm:text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-1">
                    Liquidación Diaria
                  </span>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl sm:text-3xl font-mono font-bold text-emerald-400 tracking-tight">
                        ~${formatUsd(usdDay)}
                      </span>
                      <span className="text-[10px] sm:text-xs text-white/60 font-mono font-semibold ml-1">USD</span>
                    </div>
                    <span className="text-[10px] sm:text-xs font-mono text-white/70 font-semibold">
                      ≈ {formatPearl(pearlDay)} PEARL
                    </span>
                  </div>
                </div>

                {/* Monthly */}
                <div className="p-3 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-colors">
                  <span className="text-[9px] sm:text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-1">
                    Proyección Mensual (30 Días)
                  </span>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-xl sm:text-2xl font-mono font-bold text-white tracking-tight">
                        ~${formatUsd(usdMonth)}
                      </span>
                      <span className="text-[10px] sm:text-xs text-white/60 font-mono font-semibold ml-1">USD</span>
                    </div>
                    <span className="text-[10px] sm:text-xs font-mono text-white/70 font-semibold">
                      ≈ {formatPearl(pearlMonth)} PEARL
                    </span>
                  </div>
                </div>

                {/* Annual */}
                <div className="p-3 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-colors">
                  <span className="text-[9px] sm:text-[10px] font-mono text-white/40 uppercase tracking-wider block mb-1">
                    Proyección Anualizada (365 Días)
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
                onClick={() => onOpenAuth ? onOpenAuth('register') : window.location.assign('#preventa')}
                className="w-full py-3 sm:py-4 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.97] shadow-2xl shadow-white/5"
              >
                <Zap className="w-3.5 h-3.5 text-[#050505]" />
                <span className="truncate">Pre-ordenar Miner Preventa ({selectedTh.toFixed(0)} TH/s)</span>
                <ArrowRight className="w-4 h-4 text-[#050505] flex-shrink-0" />
              </button>
              <p className="text-[8px] sm:text-[9px] font-mono text-white/40 text-center mt-2">
                Garantía de cupo en bloque génesis · Descuento exclusivo Fase 1
              </p>
            </div>
          </motion.div>
        </div>

        {/* Comparison Table: Traditional Mining vs PouwMiner Cloud Mining */}
        <div className="p-4 sm:p-8 lg:p-10 rounded-3xl bg-[#0a0a0a] border border-white/10">
          <div className="text-center max-w-xl mx-auto mb-6 sm:mb-8">
            <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.25em] text-white/40 block mb-1.5">
              RENTABILIDAD LIMPIA
            </span>
            <h3 className="text-xl sm:text-3xl font-bold tracking-tight text-white">
              ¿Por Qué PouwMiner es Mucho Más Rentable?
            </h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/5">
              <div className="flex items-center gap-2 mb-4 text-rose-400 text-xs font-mono font-bold uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4" />
                <span>Minería Física en Casa</span>
              </div>
              <ul className="space-y-3 text-xs text-white/50 font-normal">
                <li className="flex items-start gap-2">
                  <span className="text-rose-500 font-bold">✕</span>
                  <span>Inversión de miles de dólares en GPUs que pierden valor cada 6 meses.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-500 font-bold">✕</span>
                  <span>Facturas de luz residencial de $150–$400/mes que se comen tus ganancias.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-500 font-bold">✕</span>
                  <span>Ruido de turbinas (&gt;75 dB), calor constante y caídas de internet casero.</span>
                </li>
              </ul>
            </div>

            <div className="p-6 rounded-2xl bg-purple-950/20 border border-purple-500/30">
              <div className="flex items-center gap-2 mb-4 text-purple-300 text-xs font-mono font-bold uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>PouwMiner Cloud Architecture</span>
              </div>
              <ul className="space-y-3 text-xs text-white/80 font-normal">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">✓</span>
                  <span><strong>120 TH/s = ~$2.30 USD/día</strong> limpios sin deducir costos de luz de tu bolsillo.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">✓</span>
                  <span>0 dB de ruido: operamos en centros de datos con refrigeración por inmersión líquida.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">✓</span>
                  <span>Liquidaciones diarias automatizadas en tokens PEARL directo a tu balance.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
