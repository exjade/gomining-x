import { useState, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Users, Award, Network, ChevronRight, CheckCircle2, TrendingUp, Sparkles, Smile } from 'lucide-react';
import type { AuthMode } from '../ui/Navbar';

interface UnilevelSectionProps {
  onOpenAuth?: (mode?: AuthMode) => void;
}

export function UnilevelSection({ onOpenAuth }: UnilevelSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'levels' | 'simulator'>('levels');
  const [directReferrals, setDirectReferrals] = useState<number>(5);
  const [avgHashrateTh, setAvgHashrateTh] = useState<number>(42.44);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 22,
    restDelta: 0.001,
  });

  const yBg = useTransform(smoothProgress, [0, 1], [0, 100]);
  const yCards = useTransform(smoothProgress, [0, 1], [25, -25]);

  // Notion Spec: 5 Tiers Unilevel System
  const tiers = [
    {
      level: 'NIVEL 1',
      title: 'Directos',
      hashCommission: '5.0%',
      yieldCommission: '5.0%',
      desc: 'Comisión directa sobre cada compra de miner + 5% del PEARL diario generado por tus invitados.',
      highlight: true,
      badge: 'DIRECTO',
    },
    {
      level: 'NIVEL 2',
      title: 'Indirectos N2',
      hashCommission: '3.0%',
      yieldCommission: '3.0%',
      desc: 'Generado por los invitados de tus directos. Comisiones perpetuas mientras minen.',
      highlight: false,
      badge: 'NIVEL 2',
    },
    {
      level: 'NIVEL 3',
      title: 'Red Expansión N3',
      hashCommission: '2.0%',
      yieldCommission: '2.0%',
      desc: 'Profundidad de tercer nivel para constructores de comunidad institucional.',
      highlight: false,
      badge: 'NIVEL 3',
    },
    {
      level: 'NIVEL 4',
      title: 'Red Élite N4',
      hashCommission: '1.0%',
      yieldCommission: '1.0%',
      desc: 'Volumen acumulado de gran escala con distribución on-chain transparente.',
      highlight: false,
      badge: 'NIVEL 4',
    },
    {
      level: 'NIVEL 5',
      title: 'Master Hub N5',
      hashCommission: '1.0%',
      yieldCommission: '1.0%',
      desc: 'Comisiones de clúster completo para líderes de nodo y validadores globales.',
      highlight: false,
      badge: 'NIVEL 5',
    },
  ];

  // Simulation calculation based on benchmark (120 TH = $2.30/d)
  const pricePerTh = 499.99 / 42.44; // ~$11.78 USD per TH
  const teamVolumeUsd = directReferrals * avgHashrateTh * pricePerTh;
  const directHashEarningsUsd = teamVolumeUsd * 0.05;
  const dailyTeamPearl = directReferrals * (avgHashrateTh * (2.30 / 120 / 0.10));
  const passivePearlPerDay = dailyTeamPearl * 0.05;
  const passiveUsdPerMonth = passivePearlPerDay * 0.10 * 30;

  return (
    <section
      id="unilevel"
      ref={containerRef}
      className="relative py-32 px-4 sm:px-6 bg-[#050505] text-white border-t border-white/10 select-none overflow-hidden"
      aria-labelledby="unilevel-title"
    >
      {/* Background Parallax Nebula */}
      <motion.div style={{ y: yBg }} className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[450px] bg-purple-950/25 rounded-full blur-[190px]" />
      </motion.div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="font-mono text-xs text-white/40">09</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
              PROGRAMA DE AFILIADOS // MODELO UNILEVEL DE 5 NIVELES
            </span>
          </div>

          <h2
            id="unilevel-title"
            className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter text-white mb-5 leading-none"
          >
            Gana Creando Red.
          </h2>
          <p className="text-sm sm:text-base text-white/60 max-w-xl mx-auto leading-relaxed">
            Multiplica tus ingresos recomendando la infraestructura de PouwMiner. Genera comisiones directas en USDT y un flujo pasivo diario continuo en tokens PEARL por el hashrate minado de tu equipo.
          </p>

          {/* Toggle mode: Levels vs Simulator */}
          <div className="inline-flex p-1 rounded-full bg-white/5 border border-white/10 mt-8">
            <button
              type="button"
              onClick={() => setActiveTab('levels')}
              className={`px-5 py-2 rounded-full text-xs font-mono transition-all ${
                activeTab === 'levels'
                  ? 'bg-white text-[#050505] font-semibold shadow-lg'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Estructura de Comisiones
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('simulator')}
              className={`px-5 py-2 rounded-full text-xs font-mono transition-all ${
                activeTab === 'simulator'
                  ? 'bg-white text-[#050505] font-semibold shadow-lg'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Simulador de Ganancias de Red
            </button>
          </div>
        </div>

        {/* CINEMATIC LEADER EMPOWERMENT & HAPPINESS SHOWCASE */}
        <div className="relative rounded-3xl overflow-hidden border border-white/15 bg-[#0a0a0a]/80 backdrop-blur-2xl shadow-2xl mb-16 group">
          <div className="grid lg:grid-cols-12 items-center">
            {/* Image Side: Cinematic Leaders */}
            <div className="lg:col-span-6 relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-auto lg:h-[400px] w-full overflow-hidden">
              <img
                src="/assets/unilevel-leader-empowerment.jpg"
                alt="Líderes de red PouwMiner empoderados y celebrando el éxito de su red en la nube"
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#050505]/30 to-[#0a0a0a] hidden lg:block" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent lg:hidden" />

              {/* Floating Live Badge: Leader Success */}
              <div className="absolute top-4 left-4 p-3 rounded-2xl bg-[#0a0a0a]/85 border border-white/15 backdrop-blur-xl flex items-center gap-2.5 shadow-xl">
                <Smile className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px] font-mono text-white font-bold">EMPODERAMIENTO DE COMUNIDAD</span>
              </div>

              {/* Floating Earning Metric Chip */}
              <div className="absolute bottom-4 left-4 p-3 rounded-2xl bg-[#0a0a0a]/90 border border-purple-500/30 backdrop-blur-xl shadow-2xl">
                <span className="text-[9px] font-mono text-purple-300 block uppercase tracking-wider">
                  Volumen Distribuido a Líderes
                </span>
                <span className="text-lg font-mono font-bold text-white flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  +1.2M PEARL On-Chain
                </span>
              </div>
            </div>

            {/* Content Side: Empowerment Narrative */}
            <div className="lg:col-span-6 p-4 sm:p-8 lg:p-12 space-y-4 sm:space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-mono">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>LIBERTAD FINANCIERA & CRECIMIENTO COLECTIVO</span>
              </div>

              <h3 className="text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                Construye un Imperio de Minería sin Comprar Tarjetas Físicas.
              </h3>

              <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                Nuestros líderes no tienen que lidiar con soporte técnico, servidores quemados ni facturas de luz. Simplemente conectan a su comunidad con el hashrate institucional de PouwMiner y disfrutan de comisiones directas y <strong className="text-white">regalías pasivas diarias de por vida</strong> en tokens PEARL.
              </p>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10 font-mono text-xs">
                <div>
                  <span className="text-white/40 block text-[10px]">Liquidación Directa:</span>
                  <strong className="text-emerald-400 font-bold">100% On-Chain Web3</strong>
                </div>
                <div>
                  <span className="text-white/40 block text-[10px]">Profundidad de Red:</span>
                  <strong className="text-white font-bold">5 Niveles Ilimitados</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab 1: Structure Grid */}
        {activeTab === 'levels' && (
          <motion.div
            style={{ y: yCards }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6 mb-16"
          >
            {/* 5 Levels Cards */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {tiers.map((tier) => (
                <div
                  key={tier.level}
                  className={`p-4 sm:p-6 rounded-3xl bg-[#0a0a0a]/85 backdrop-blur-2xl border transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between ${
                    tier.highlight
                      ? 'border-white bg-[#0e0e0e] shadow-2xl shadow-purple-950/30'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
                        {tier.level}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300">
                        {tier.badge}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-white tracking-tight mb-3">
                      {tier.title}
                    </h3>

                    {/* Commissions Pills */}
                    <div className="space-y-2 mb-4 font-mono">
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex justify-between items-center text-xs">
                        <span className="text-white/40 text-[11px]">Compra Miner:</span>
                        <span className="text-white font-bold">{tier.hashCommission}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20 flex justify-between items-center text-xs">
                        <span className="text-emerald-400/70 text-[11px]">Rendimiento Diario:</span>
                        <span className="text-emerald-400 font-bold">{tier.yieldCommission}</span>
                      </div>
                    </div>

                    <p className="text-xs text-white/50 leading-relaxed">
                      {tier.desc}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-white/5 mt-4 text-[10px] font-mono text-white/40 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Liquidación automática on-chain</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Visual Flow diagram banner */}
            <div className="p-4 sm:p-8 rounded-3xl bg-[#0a0a0a] border border-white/10 flex flex-col lg:flex-row items-center justify-between gap-4 sm:gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <Network className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white tracking-tight">
                    Doble Vía de Ganancia: Comisiones Directas + Regalías Pasivas Diarias
                  </h4>
                  <p className="text-xs text-white/50 mt-1 max-w-2xl leading-relaxed">
                    A diferencia de otros programas, no solo cobras una sola vez por la venta del hardware cloud: mientras el hashrate de tus referidos esté minando en los data centers, recibes diariamente un porcentaje de sus tokens PEARL en tu balance.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenAuth ? onOpenAuth('register') : window.location.assign('#preventa')}
                className="px-6 py-3 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-xs flex items-center gap-2 transition-all active:scale-[0.97] whitespace-nowrap shadow-xl"
              >
                <span>Activar Enlace de Referido</span>
                <ChevronRight className="w-4 h-4 text-[#050505]" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Tab 2: Interactive Network Simulator */}
        {activeTab === 'simulator' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="grid lg:grid-cols-12 gap-8 items-stretch mb-16"
          >
            {/* Simulator Controls */}
            <div className="lg:col-span-7 p-8 sm:p-10 rounded-3xl bg-[#0a0a0a] border border-white/10 space-y-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 mb-6">
                  <Users className="w-3.5 h-3.5 text-purple-400" />
                  <span>SIMULADOR DE RED DIRECTA (NIVEL 1)</span>
                </div>

                {/* Slider 1: Direct Referrals */}
                <div className="mb-8">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-mono text-white/60">Miembros Directos en tu Equipo:</span>
                    <span className="text-3xl font-mono font-bold text-white tracking-tight">
                      {directReferrals} <span className="text-xs text-white/40">amigos</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={directReferrals}
                    onChange={(e) => setDirectReferrals(Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none bg-white/10 accent-white cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-white/30 mt-2">
                    <span>1 referido</span>
                    <span>25 referidos</span>
                    <span>50 referidos</span>
                  </div>
                </div>

                {/* Slider 2: Average Hashrate per Member */}
                <div>
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-mono text-white/60">Hashrate Promedio por Miembro:</span>
                    <span className="text-3xl font-mono font-bold text-white tracking-tight">
                      {avgHashrateTh} <span className="text-xs text-white/40">TH/s</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1.46"
                    max="120"
                    step="5"
                    value={avgHashrateTh}
                    onChange={(e) => setAvgHashrateTh(Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none bg-white/10 accent-white cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-white/30 mt-2">
                    <span>1.46 TH/s (Inicio)</span>
                    <span className="text-emerald-400 font-bold">42.44 TH/s (Titan)</span>
                    <span>120 TH/s (Pro)</span>
                  </div>
                </div>
              </div>

              {/* Real Summary Callout */}
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 text-xs text-white/60 font-mono space-y-1.5">
                <div className="flex justify-between">
                  <span>Poder Total de Red Activo:</span>
                  <strong className="text-white">{(directReferrals * avgHashrateTh).toFixed(1)} TH/s</strong>
                </div>
                <div className="flex justify-between">
                  <span>Volumen Total de Hashrate:</span>
                  <strong className="text-white">${teamVolumeUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD</strong>
                </div>
              </div>
            </div>

            {/* Simulator Results Card */}
            <div className="lg:col-span-5 p-8 sm:p-10 rounded-3xl bg-[#0e0e0e] border border-white/20 shadow-2xl relative overflow-hidden flex flex-col justify-between space-y-6">
              <div className="absolute top-0 right-0 w-44 h-44 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

              <div>
                <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 block mb-6">
                  Tus Ganancias Estimadas
                </span>

                <div className="space-y-4">
                  {/* Direct commission upfront */}
                  <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10">
                    <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block mb-1">
                      Comisión Directa Inmediata (5%)
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-mono font-bold text-white tracking-tight">
                        ${directHashEarningsUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-xs font-mono text-white/50">USDT</span>
                    </div>
                    <span className="text-[10px] font-mono text-white/40 mt-1 block">
                      Pago al instante en tu billetera Web3 al activarse las órdenes.
                    </span>
                  </div>

                  {/* Daily ongoing mining yield */}
                  <div className="p-5 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/20">
                    <span className="text-[10px] font-mono text-emerald-400/70 uppercase tracking-widest block mb-1">
                      Regalía Pasiva Diaria de Minado (5%)
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-mono font-bold text-emerald-400 tracking-tight">
                        +{passivePearlPerDay.toFixed(2)}
                      </span>
                      <span className="text-xs font-mono text-emerald-400/80 font-bold">PEARL / día</span>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-emerald-500/15 text-[11px] font-mono text-emerald-400">
                      <span>Proyección Mensual:</span>
                      <span className="font-bold">~${passiveUsdPerMonth.toFixed(2)} USD/mes</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => onOpenAuth ? onOpenAuth('register') : window.location.assign('#preventa')}
                  className="w-full py-4 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.97] shadow-xl"
                >
                  <Award className="w-4 h-4 text-[#050505]" />
                  <span>Comenzar a Construir Mi Red</span>
                </button>
                <p className="text-[9px] font-mono text-white/40 text-center mt-2.5">
                  Sin cuotas mensuales de activación obligatorias en nivel Explorer.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Bottom Trust Line */}
        <div className="flex items-center justify-center gap-6 text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 text-center flex-wrap pt-4">
          <span>Smart Contract de Afiliación Transparente</span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span>Liquidación en Tokens PEARL</span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span>Dashboard de Red en Vivo</span>
        </div>
      </div>
    </section>
  );
}
