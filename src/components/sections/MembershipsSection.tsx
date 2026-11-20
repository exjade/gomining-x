import { useState, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Check, ArrowRight, Sparkles, Flame, Activity } from 'lucide-react';
import type { AuthMode } from '../ui/Navbar';

export type MembershipPlan = {
  id: string;
  name: string;
  priceQuarterly: number; // USDT
  priceAnnual: number; // USDT (con 15% de ahorro)
  badge?: string;
  maintenanceDiscount: string; // Descuento en tarifa de mantenimiento
  powerBoost: string; // Beneficio mensual de potencia
  withdrawalSpeed: string; // Procesamiento de retiros
  analytics: string;
  wallets: string;
  highlight?: boolean;
};

export const membershipPlans: MembershipPlan[] = [
  {
    id: 'explorer',
    name: 'Explorer',
    priceQuarterly: 0,
    priceAnnual: 0,
    maintenanceDiscount: '0%',
    powerBoost: 'Estándar',
    withdrawalSpeed: 'Estándar (SLA Base)',
    analytics: 'Dashboard Básico',
    wallets: 'Múltiples Wallets',
  },
  {
    id: 'starter',
    name: 'Starter',
    priceQuarterly: 30,
    priceAnnual: 102, // 15% ahorro
    badge: 'Starter',
    maintenanceDiscount: '5% Descuento',
    powerBoost: '+1% Potencia Boost',
    withdrawalSpeed: 'Estándar (SLA + Pool)',
    analytics: 'Dashboard & Referidos Avanzado',
    wallets: 'Múltiples Wallets + Alertas',
  },
  {
    id: 'pro',
    name: 'Pro VIP',
    priceQuarterly: 90,
    priceAnnual: 306, // 15% ahorro (25.5 USDT/mes)
    badge: 'Pro VIP',
    maintenanceDiscount: '10% Descuento',
    powerBoost: '+2% Potencia Boost',
    withdrawalSpeed: 'Prioritario Express (SLA Dedicado)',
    analytics: 'Analítica Institucional en Tiempo Real',
    wallets: 'Prioridad Multi-chain & Web3 VIP',
    highlight: true,
  },
];

interface MembershipsSectionProps {
  onOpenAuth?: (mode?: AuthMode) => void;
}

export function MembershipsSection({ onOpenAuth }: MembershipsSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [billingCycle, setBillingCycle] = useState<'quarterly' | 'annual'>('annual');
  const [poolVolumePearl, setPoolVolumePearl] = useState<number>(100000);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 22,
    restDelta: 0.001,
  });

  const yCards = useTransform(smoothProgress, [0, 1], [25, -25]);
  const yBg = useTransform(smoothProgress, [0, 1], [0, 120]);

  // Illustrative pool residual simulation: 5% of pool volume at $0.10/PEARL reference
  const monthlyLeaderResidualUsd = poolVolumePearl * 0.05 * 0.1;
  const dailyLeaderPearl = (poolVolumePearl * 0.05) / 30;

  return (
    <section
      id="membresias"
      ref={containerRef}
      className="relative py-32 px-4 sm:px-6 bg-[#050505] text-white border-t border-white/10 select-none overflow-hidden"
      aria-labelledby="memberships-title"
    >
      {/* Background Parallax Subtle Hue */}
      <motion.div style={{ y: yBg }} className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[750px] h-[450px] bg-purple-950/20 rounded-full blur-[180px]" />
      </motion.div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="font-mono text-xs text-white/40">06</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
              MEMBRESÍAS POUWMINER // VENTAJAS & RESIDUALES DE POOL
            </span>
          </div>

          <h2
            id="memberships-title"
            className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter text-white mb-5 leading-none"
          >
            Membresías.
          </h2>
          <p className="text-sm sm:text-base text-white/60 max-w-xl mx-auto leading-relaxed">
            Optimiza tu operación de minado. Las membresías reducen tarifas de mantenimiento, otorgan <strong className="text-white">boost de potencia mensual (+1% y +2%)</strong> y habilitan acceso a <strong className="text-emerald-400">residuales variables de la pool global</strong> para líderes calificados.
          </p>

          {/* Billing Cycle Switch */}
          <div className="flex items-center justify-center gap-2 mt-8">
            <div className="p-1 rounded-full bg-[#0a0a0a] border border-white/15 flex items-center">
              <button
                type="button"
                onClick={() => setBillingCycle('quarterly')}
                className={`px-5 py-1.5 rounded-full text-xs font-mono transition-all ${
                  billingCycle === 'quarterly'
                    ? 'bg-white text-[#050505] font-semibold shadow-md'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Trimestral
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('annual')}
                className={`px-5 py-1.5 rounded-full text-xs font-mono transition-all flex items-center gap-1.5 ${
                  billingCycle === 'annual'
                    ? 'bg-white text-[#050505] font-semibold shadow-md'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                <span>Anual</span>
                <span className="px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[9px] font-bold">
                  -15% Ahorro
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 3 Membership Cards */}
        <motion.div style={{ y: yCards }} className="grid md:grid-cols-3 gap-6 sm:gap-8 mb-16 sm:mb-20">
          {membershipPlans.map((plan) => {
            const isHighlight = plan.highlight;
            const price = billingCycle === 'annual' ? plan.priceAnnual : plan.priceQuarterly;
            const periodLabel = billingCycle === 'annual' ? '/ año' : '/ trimestre';

            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 ${
                  isHighlight
                    ? 'bg-[#0f0a1c] border-2 border-purple-500/60 shadow-[0_0_60px_rgba(135,75,255,0.25)] hover:border-purple-400'
                    : 'bg-[#0a0a0a]/90 border border-white/10 hover:border-white/20'
                }`}
              >
                {/* Header card */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono text-white/50 uppercase tracking-widest">
                      {plan.name}
                    </span>
                    {plan.badge && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                        {isHighlight ? <Flame className="w-3 h-3 text-purple-400" /> : <Sparkles className="w-3 h-3" />}
                        <span>{plan.badge}</span>
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-2 mb-6">
                    <span className="text-4xl sm:text-5xl font-bold font-mono tracking-tight text-white">
                      ${price}
                    </span>
                    <span className="text-xs font-mono text-white/40">USDT {periodLabel}</span>
                  </div>

                  {/* Key Highlights */}
                  <div className="space-y-3.5 mb-8 text-xs font-mono">
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                      <span className="text-white/50">Comisión Mantenimiento:</span>
                      <strong className="text-emerald-400 font-bold">{plan.maintenanceDiscount}</strong>
                    </div>
                    <div className="p-3 rounded-xl bg-purple-500/[0.06] border border-purple-500/20 flex items-center justify-between">
                      <span className="text-white/50">Boost Mensual:</span>
                      <strong className="text-purple-300 font-bold">{plan.powerBoost}</strong>
                    </div>
                  </div>

                  {/* Benefit list */}
                  <div className="space-y-3 pt-6 border-t border-white/10 text-xs">
                    {[plan.withdrawalSpeed, plan.analytics, plan.wallets].map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span className="text-white/70">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <div className="mt-8 pt-6 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => (onOpenAuth ? onOpenAuth('register') : window.location.assign('#comenzar'))}
                    className={`w-full py-3.5 rounded-full font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.97] ${
                      isHighlight
                        ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:brightness-110 shadow-lg shadow-purple-500/25'
                        : 'bg-white hover:bg-white/90 text-[#050505]'
                    }`}
                  >
                    <span>{plan.priceQuarterly === 0 ? 'Comenzar Gratis' : `Elegir ${plan.name}`}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* POOL RESIDUAL SIMULATOR */}
        <div className="rounded-3xl p-4 sm:p-8 lg:p-10 bg-[#0a0a0a]/90 border border-white/10 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

          <div className="grid lg:grid-cols-12 gap-8 items-center">
            {/* Left: Dynamic Control */}
            <div className="lg:col-span-7 space-y-5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.2em] text-emerald-400">
                  Simulador de Residuales de Pool (Líderes)
                </span>
              </div>

              <h3 className="text-xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                Participa hasta en un 5% de la producción de minado de tu comunidad en PEARL.
              </h3>

              <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                Los suscriptores <strong className="text-white">Pro VIP</strong> desbloquean la licencia de líder. Si el volumen acumulado de tu comunidad produce tokens a diario, recibes una fracción variable proporcional de cada bloque minado.
              </p>

              {/* Slider for volume */}
              <div className="pt-2">
                <div className="flex justify-between items-center mb-2 font-mono text-xs">
                  <span className="text-white/60">Volumen Diario de la Pool:</span>
                  <span className="font-bold text-white">
                    {poolVolumePearl.toLocaleString()}{' '}
                    <span className="text-[10px] sm:text-xs text-purple-300">PEARL / d</span>
                  </span>
                </div>
                <input
                  type="range"
                  min="20000"
                  max="300000"
                  step="10000"
                  value={poolVolumePearl}
                  onChange={(e) => setPoolVolumePearl(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none bg-white/10 accent-purple-400 cursor-pointer"
                  aria-label="Volumen diario de la pool en PEARL"
                />
                <div className="flex justify-between text-[9px] sm:text-[10px] font-mono text-white/40 mt-2">
                  <span>20k (Básico)</span>
                  <span className="text-purple-300">100k (Estándar)</span>
                  <span>300k (Global)</span>
                </div>
              </div>

              {/* Cloud Node Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 pt-4 border-t border-white/5 text-[10px] sm:text-[11px] font-mono">
                <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.02] border border-white/5 flex sm:flex-col justify-between sm:justify-start items-center sm:items-start">
                  <span className="text-white/40 block text-[8px] sm:text-[9px]">Hashrate de Pool</span>
                  <strong className="text-white text-xs sm:text-sm">184.25 PH/s</strong>
                </div>
                <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.02] border border-white/5 flex sm:flex-col justify-between sm:justify-start items-center sm:items-start">
                  <span className="text-white/40 block text-[8px] sm:text-[9px]">Data Centers</span>
                  <strong className="text-white text-xs sm:text-sm">+9 Nodos</strong>
                </div>
                <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/20 flex sm:flex-col justify-between sm:justify-start items-center sm:items-start">
                  <span className="text-emerald-400/70 block text-[8px] sm:text-[9px]">Reparto Automático</span>
                  <strong className="text-emerald-400 text-xs sm:text-sm">Cada 24 Horas</strong>
                </div>
              </div>
            </div>

            {/* Right: Earnings Result */}
            <div className="lg:col-span-5 p-3.5 sm:p-6 lg:p-8 rounded-2xl bg-[#120d20] border border-purple-500/40 shadow-2xl space-y-3 sm:space-y-4">
              <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.2em] sm:tracking-[0.25em] text-purple-300 block">
                Tu Residual Estimado como Líder
              </span>

              <div className="space-y-2.5 sm:space-y-3">
                <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/10">
                  <span className="text-[9px] sm:text-[10px] font-mono text-white/40 block mb-0.5 sm:mb-1">
                    Goteo Diario Estimado en PEARL
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-mono font-bold text-emerald-400">
                      +{dailyLeaderPearl.toFixed(1)}
                    </span>
                    <span className="text-[11px] sm:text-xs font-mono text-emerald-400 font-bold">PEARL / día</span>
                  </div>
                </div>

                <div className="p-3 sm:p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
                  <span className="text-[9px] sm:text-[10px] font-mono text-emerald-400/80 block mb-0.5 sm:mb-1">
                    Proyección Residual Mensual
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-mono font-bold text-white">
                      ~${monthlyLeaderResidualUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[11px] sm:text-xs font-mono text-white/50">USD / mes</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => (onOpenAuth ? onOpenAuth('register') : window.location.assign('#comenzar'))}
                className="w-full py-3 sm:py-3.5 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.97] shadow-xl"
              >
                <Activity className="w-4 h-4 text-[#050505]" />
                <span>Desbloquear Residuales con Pro VIP</span>
              </button>

              <p className="text-[9px] font-mono text-white/45 text-center leading-relaxed">
                Simulación ilustrativa. Las recompensas y residuales son variables según volumen real de red y dificultad; no garantizan ROI fijo.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
