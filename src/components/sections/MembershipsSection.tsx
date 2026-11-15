import { useState, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { membershipPlans } from '@/data/catalog';
import { Check, Zap, ArrowRight, Sparkles, Award, Star, Flame, Activity } from 'lucide-react';
import { AuthMode } from '../auth/AuthModal';

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

  // Explosive pool residual calculation
  // 5% of global pool distributed among qualified leaders
  const monthlyLeaderResidualUsd = (poolVolumePearl * 0.05 * 0.10); // $0.10/PEARL
  const dailyLeaderPearl = (poolVolumePearl * 0.05 / 30);

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
            Optimiza tus dividendos de minado. Las membresías reducen tarifas de mantenimiento, otorgan <strong className="text-white">boost de potencia mensual (+1% y +2%)</strong> y desbloquean <strong className="text-emerald-400">residuales de la pool global de minería</strong> para líderes.
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
        <motion.div style={{ y: yCards }} className="grid md:grid-cols-3 gap-8 mb-20">
          {membershipPlans.map((plan) => {
            const isHighlight = plan.highlight;
            const price = billingCycle === 'annual' ? plan.priceAnnual : plan.priceQuarterly;
            const periodLabel = billingCycle === 'annual' ? '/ año' : '/ trimestre';

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between p-8 sm:p-10 rounded-3xl bg-[#0a0a0a]/85 backdrop-blur-2xl border transition-all duration-300 hover:scale-[1.02] shadow-2xl ${
                  isHighlight
                    ? 'border-purple-500/60 bg-[#0e0c14]/95 shadow-[0_0_50px_-10px_rgba(168,85,247,0.3)] ring-1 ring-purple-500/40'
                    : 'border-white/10 hover:border-white/30'
                }`}
              >
                {isHighlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 text-[10px] font-bold text-white font-mono uppercase tracking-widest shadow-lg flex items-center gap-1">
                    <Star className="w-3 h-3 fill-white" />
                    <span>Líder Pro VIP</span>
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-2xl font-bold tracking-tight text-white mb-1">
                        {plan.name}
                      </h3>
                      <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
                        Nivel de Plataforma
                      </span>
                    </div>
                    {plan.badge && (
                      <span className="px-2.5 py-1 rounded-full border border-white/15 bg-white/5 text-[10px] font-mono text-white/80">
                        {plan.badge}
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mb-8">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl sm:text-5xl font-bold tracking-tight text-white font-mono">
                        {price === 0 ? 'Gratis' : `$${price}`}
                      </span>
                      {price > 0 && (
                        <span className="text-xs font-mono text-white/40 uppercase">
                          USDT {periodLabel}
                        </span>
                      )}
                    </div>
                    {billingCycle === 'annual' && price > 0 && (
                      <span className="text-[10px] font-mono text-purple-400 mt-1 block">
                        Equivalente a ${(price / 12).toFixed(1)} USDT / mes
                      </span>
                    )}
                  </div>

                  {/* Feature Checkpoints */}
                  <div className="space-y-3.5 pt-6 border-t border-white/10 mb-8 text-xs text-white/70">
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-white/80">Crear cuenta & verificación Web3</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-white/80">Conectar múltiples wallets Web3</span>
                    </div>

                    {/* Maintenance Discount */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
                        <Zap className="w-3.5 h-3.5 text-purple-400" />
                      </div>
                      <span className="text-white font-medium">
                        Tarifa Mantenimiento: <strong className="text-purple-300">{plan.maintenanceDiscount}</strong>
                      </span>
                    </div>

                    {/* Power Boost */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <span className="text-white font-medium">
                        Hashrate Boost: <strong className="text-emerald-400">{plan.powerBoost}</strong>
                      </span>
                    </div>

                    {/* Mining Pool Residuals Bullet */}
                    <div className="flex items-center gap-2.5">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${isHighlight ? 'bg-amber-500/20 border border-amber-500/50' : 'bg-white/5'}`}>
                        <Flame className={`w-3.5 h-3.5 ${isHighlight ? 'text-amber-400' : 'text-white/40'}`} />
                      </div>
                      <span className={`${isHighlight ? 'text-amber-300 font-bold' : 'text-white/60'}`}>
                        {isHighlight ? 'Residuales de Pool Global: Desbloqueados' : plan.priceQuarterly > 0 ? 'Residuales de Pool Básicos' : 'Residuales de Pool: No incluidos'}
                      </span>
                    </div>

                    {/* Withdrawal Speed */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                        <Award className="w-3.5 h-3.5 text-white/70" />
                      </div>
                      <span className="text-white/80">
                        Retiros: {plan.withdrawalSpeed}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenAuth ? onOpenAuth('register') : window.location.assign('#comenzar')}
                  className={`w-full py-4 rounded-full font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] shadow-xl ${
                    isHighlight
                      ? 'bg-white text-[#050505] hover:bg-white/90 shadow-white/10'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  <span>{price === 0 ? 'Empezar Gratis' : 'Activar Membresía'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </motion.div>

        {/* EXPLOSIVE MINING POOL RESIDUALS SECTION IN THE CLOUDS */}
        <div className="relative rounded-3xl p-8 sm:p-14 bg-gradient-to-b from-[#0e0a19] via-[#090712] to-[#050505] border border-purple-500/30 overflow-hidden shadow-2xl shadow-purple-950/50">
          {/* Volumetric Glowing Cloud Explosions in the Background */}
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-purple-600/25 rounded-full blur-[100px] pointer-events-none animate-pulse" />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-emerald-600/20 rounded-full blur-[110px] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.12),transparent_70%)] pointer-events-none" />

          {/* Lightning / Particle Energy Sparks */}
          <div className="absolute top-6 right-8 flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 font-mono text-[10px] uppercase tracking-wider">
            <Flame className="w-3.5 h-3.5 animate-bounce" />
            <span>OPCIÓN EXPLOSIVA: RESIDUALES DE LA POOL DE MINERÍA</span>
          </div>

          <div className="max-w-3xl mb-10 relative z-10">
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-purple-400 block mb-2">
              DIVIDENDOS RESIDUALES INSTITUCIONALES EN LA NUBE
            </span>
            <h3 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-4">
              Residuales Directos de la Pool Global.
            </h3>
            <p className="text-sm text-white/70 leading-relaxed max-w-2xl">
              Los líderes con red activa o miembros con suscripción <strong className="text-white">Starter o Pro VIP</strong> reciben un porcentaje residual automático de todos los bloques minados en la pool institucional. Tus ganancias escalan con el volumen total de cómputo en la nube.
            </p>
          </div>

          {/* Dynamic Interactive Cloud Simulator */}
          <div className="grid lg:grid-cols-12 gap-8 items-center relative z-10">
            {/* Left: Volume Slider */}
            <div className="lg:col-span-7 p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-white/10 space-y-6">
              <div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-xs font-mono text-white/60">Volumen Diario Minado por la Pool:</span>
                  <span className="text-2xl sm:text-3xl font-mono font-bold text-white">
                    {poolVolumePearl.toLocaleString()} <span className="text-xs text-purple-300">PEARL / d</span>
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
                />
                <div className="flex justify-between text-[10px] font-mono text-white/40 mt-2">
                  <span>20,000 PEARL (Básico)</span>
                  <span className="text-purple-300">100,000 PEARL (Estándar)</span>
                  <span>300,000 PEARL (Clúster Global)</span>
                </div>
              </div>

              {/* Cloud Node Badges */}
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/5 text-[11px] font-mono">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-white/40 block text-[9px]">Hashrate de Pool</span>
                  <strong className="text-white">184.25 PH/s</strong>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-white/40 block text-[9px]">Data Centers</span>
                  <strong className="text-white">+9 Nodos</strong>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/20">
                  <span className="text-emerald-400/70 block text-[9px]">Reparto Automático</span>
                  <strong className="text-emerald-400">Cada 24 Horas</strong>
                </div>
              </div>
            </div>

            {/* Right: Explosive Earnings Result */}
            <div className="lg:col-span-5 p-6 sm:p-8 rounded-2xl bg-[#120d20] border border-purple-500/40 shadow-2xl space-y-4">
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-purple-300 block">
                Tu Residual Estimado como Líder
              </span>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
                  <span className="text-[10px] font-mono text-white/40 block mb-1">
                    Goteo Diario en PEARL
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-mono font-bold text-emerald-400">
                      +{dailyLeaderPearl.toFixed(1)}
                    </span>
                    <span className="text-xs font-mono text-emerald-400 font-bold">PEARL / día</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
                  <span className="text-[10px] font-mono text-emerald-400/80 block mb-1">
                    Proyección Residual Mensual
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-mono font-bold text-white">
                      ~${monthlyLeaderResidualUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs font-mono text-white/50">USD / mes</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenAuth ? onOpenAuth('register') : window.location.assign('#comenzar')}
                className="w-full py-3.5 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.97] shadow-xl"
              >
                <Activity className="w-4 h-4 text-[#050505]" />
                <span>Desbloquear Residuales con Pro VIP</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
