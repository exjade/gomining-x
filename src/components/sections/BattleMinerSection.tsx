import { useState, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Swords, Trophy, Zap, Sparkles, Flame, ArrowRight } from 'lucide-react';
import { AuthMode } from '../auth/AuthModal';

interface BattleMinerSectionProps {
  onOpenAuth?: (mode?: AuthMode) => void;
}

interface MinerCard {
  id: string;
  name: string;
  series: string;
  rarity: 'ÉPICO' | 'LEGENDARIO' | 'MÍTICO';
  powerTh: number;
  efficiency: string;
  poolBoost: string;
  winRate: string;
  avatarClass: string;
  accentColor: string;
}

const CARDS: MinerCard[] = [
  {
    id: 'miner-1',
    name: 'Titan Cyber-Beast',
    series: '#001 GENESIS',
    rarity: 'LEGENDARIO',
    powerTh: 140,
    efficiency: '18.2 W/TH',
    poolBoost: '+3.5% Pool Residual',
    winRate: '88.4%',
    avatarClass: 'from-purple-600 via-indigo-600 to-purple-900',
    accentColor: 'border-purple-500/50 text-purple-400',
  },
  {
    id: 'miner-2',
    name: 'Neural Driller X',
    series: '#042 CYBER-PUNK',
    rarity: 'ÉPICO',
    powerTh: 95,
    efficiency: '19.5 W/TH',
    poolBoost: '+2.0% Pool Residual',
    winRate: '82.1%',
    avatarClass: 'from-emerald-600 via-teal-700 to-emerald-950',
    accentColor: 'border-emerald-500/50 text-emerald-400',
  },
  {
    id: 'miner-3',
    name: 'Quantum Apex Pro',
    series: '#108 OVERCLOCK',
    rarity: 'MÍTICO',
    powerTh: 220,
    efficiency: '17.0 W/TH',
    poolBoost: '+5.5% Pool Residual',
    winRate: '94.8%',
    avatarClass: 'from-amber-500 via-rose-600 to-purple-900',
    accentColor: 'border-amber-500/50 text-amber-400',
  },
];

export function BattleMinerSection({ onOpenAuth }: BattleMinerSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedCard, setSelectedCard] = useState<MinerCard>(CARDS[0]);
  const [battleState, setBattleState] = useState<'idle' | 'battling' | 'victory'>('idle');
  const [rewardAmount, setRewardAmount] = useState<number>(250);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 22,
    restDelta: 0.001,
  });

  const yBg = useTransform(smoothProgress, [0, 1], [0, 120]);
  const yHero = useTransform(smoothProgress, [0, 1], [30, -30]);

  const handleStartBattle = () => {
    setBattleState('battling');
    setTimeout(() => {
      setBattleState('victory');
      setRewardAmount(Math.floor(200 + Math.random() * 150));
    }, 1800);
  };

  const handleResetBattle = () => {
    setBattleState('idle');
  };

  return (
    <section
      id="battle-miner"
      ref={containerRef}
      className="relative py-32 px-4 sm:px-6 bg-[#050505] text-white border-t border-white/10 select-none overflow-hidden"
      aria-labelledby="battle-miner-title"
    >
      {/* Background Parallax Cyber Nebula */}
      <motion.div style={{ y: yBg }} className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-[750px] h-[450px] bg-purple-950/20 rounded-full blur-[180px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[350px] bg-indigo-950/25 rounded-full blur-[170px]" />
      </motion.div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="font-mono text-xs text-white/40">08</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
              GAMEFI & NFT MINERS // PROTOCOLO BATTLE MINER
            </span>
          </div>

          <h2
            id="battle-miner-title"
            className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter text-white mb-5 leading-none"
          >
            Battle Miner.
          </h2>
          <p className="text-sm sm:text-base text-white/60 max-w-2xl mx-auto leading-relaxed">
            El futuro de la minería gamificada. Colecciona mineros NFT 3D con silicio dinámico, compite en batallas estratégicas contra otros clústeres y <strong className="text-white">gana residuales adicionales de la pool global de minería</strong> en cada victoria.
          </p>

          <div className="inline-flex items-center gap-2 mt-6 px-4 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-mono">
            <Swords className="w-3.5 h-3.5 text-purple-400" />
            <span>ENFRENTAMIENTOS DE MINEROS NFT: RESIDUALES DE POOL + OVERCLOCK DE POTENCIA</span>
          </div>
        </div>

        {/* Main Gamified Showcase: 3D Art Asset + Interactive Battle Arena */}
        <div className="grid lg:grid-cols-12 gap-8 items-center mb-16">
          {/* Left: 3D Isometric Card Art Showcase */}
          <motion.div
            style={{ y: yHero }}
            className="lg:col-span-6 relative rounded-3xl overflow-hidden border border-white/15 bg-[#0a0a0a]/90 backdrop-blur-2xl shadow-2xl shadow-purple-950/30 group"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden">
              <img
                src="/assets/battle-miner-cards-3d.jpg"
                alt="Cartas coleccionables 3D NFT Battle Miner de PouwMiner"
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent opacity-80" />

              {/* Floating Live Telemetry Chip */}
              <div className="absolute top-4 left-4 p-3 rounded-2xl bg-[#0a0a0a]/85 border border-white/20 backdrop-blur-xl flex items-center gap-2.5 shadow-xl">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-400" />
                </span>
                <span className="text-[11px] font-mono text-white">BATTLE ARENA: ACTIVA</span>
              </div>

              {/* Pool Jackpot Badge */}
              <div className="absolute bottom-4 right-4 p-3.5 rounded-2xl bg-[#0a0a0a]/90 border border-emerald-500/30 backdrop-blur-xl text-right shadow-2xl">
                <span className="text-[9px] font-mono text-emerald-400/80 block uppercase tracking-wider">
                  Bote Residual de Pool
                </span>
                <span className="text-xl font-mono font-bold text-emerald-400">
                  +14,850 PEARL
                </span>
              </div>
            </div>

            {/* Info footer */}
            <div className="p-6 border-t border-white/10 flex items-center justify-between text-xs font-mono text-white/50">
              <span>ESTÉTICA ISOMÉTRICA 3D // UNREAL ENGINE 5</span>
              <span className="text-white font-bold">100% RESPALDADO POR HASHRATE</span>
            </div>
          </motion.div>

          {/* Right: Interactive Card Deck & Battle Arena */}
          <div className="lg:col-span-6 p-4 sm:p-8 lg:p-10 rounded-3xl bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/15 shadow-2xl flex flex-col justify-between space-y-4 sm:space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.25em] text-white/40">
                  SELECCIONA TU MINER NFT DE BATALLA
                </span>
                <span className="text-[8px] sm:text-[9px] font-mono text-purple-300 border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 rounded-full">
                  Temporada 1
                </span>
              </div>

              {/* 3 Selectable Fighter Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
                {CARDS.map((card) => {
                  const isSelected = selectedCard.id === card.id;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => {
                        setSelectedCard(card);
                        setBattleState('idle');
                      }}
                      className={`p-2.5 sm:p-3.5 rounded-2xl border text-left transition-all duration-300 active:scale-[0.97] flex flex-col justify-between ${
                        isSelected
                          ? 'border-white bg-[#161616] ring-1 ring-white/40 shadow-xl shadow-purple-950/40'
                          : 'border-white/10 hover:border-white/20 bg-white/[0.02] text-white/60'
                      }`}
                    >
                      <div>
                        <span className="text-[8px] font-mono uppercase tracking-wider text-purple-300 block mb-1">
                          {card.rarity}
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight line-clamp-1">
                          {card.name}
                        </h4>
                      </div>
                      <div className="mt-2 sm:mt-3 pt-1.5 sm:pt-2 border-t border-white/5">
                        <span className="text-xs sm:text-sm font-mono font-bold text-white block">
                          {card.powerTh} TH
                        </span>
                        <span className="text-[8px] sm:text-[9px] font-mono text-emerald-400 block">
                          {card.winRate} Win
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Card HUD & Active Stats */}
              <div className="p-3.5 sm:p-6 rounded-2xl bg-white/[0.02] border border-white/10 mb-4 sm:mb-6 space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest block">
                      Fighter Activo
                    </span>
                    <h3 className="text-xl font-bold text-white font-mono flex items-center gap-2">
                      <span>{selectedCard.name}</span>
                      <span className="text-xs text-purple-300 font-normal">({selectedCard.series})</span>
                    </h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-xs font-mono text-purple-300 font-bold">
                    {selectedCard.rarity}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-[9px] text-white/40 block">Hashrate</span>
                    <strong className="text-white text-sm">{selectedCard.powerTh} TH/s</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-[9px] text-white/40 block">Eficiencia</span>
                    <strong className="text-white text-sm">{selectedCard.efficiency}</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/20">
                    <span className="text-[9px] text-emerald-400/70 block">Bono Pool</span>
                    <strong className="text-emerald-400 text-sm">{selectedCard.poolBoost}</strong>
                  </div>
                </div>
              </div>

              {/* BATTLE SIMULATION ARENA INTERFACE */}
              <div className="relative p-6 rounded-2xl bg-gradient-to-b from-[#111] to-[#080808] border border-white/10 overflow-hidden text-center min-h-[140px] flex flex-col items-center justify-center">
                {battleState === 'idle' && (
                  <div className="space-y-3">
                    <p className="text-xs text-white/60">
                      Reta al Clúster Adversario para disputar la recompensa del bloque.
                    </p>
                    <button
                      type="button"
                      onClick={handleStartBattle}
                      className="px-6 py-3 rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600 hover:opacity-90 text-white font-semibold text-xs flex items-center gap-2 transition-all active:scale-[0.97] shadow-xl shadow-purple-950/50 mx-auto"
                    >
                      <Swords className="w-4 h-4" />
                      <span>Iniciar Batalla PoUW</span>
                    </button>
                  </div>
                )}

                {battleState === 'battling' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 text-purple-300 font-mono text-xs">
                      <Flame className="w-4 h-4 text-amber-400 animate-spin" />
                      <span>CALCULANDO INFERENCIA DE CLÚSTER & HASHRATE CLASH...</span>
                    </div>
                    <div className="w-48 h-1.5 rounded-full bg-white/10 mx-auto overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-amber-400 animate-pulse w-full" />
                    </div>
                  </div>
                )}

                {battleState === 'victory' && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="space-y-3"
                  >
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-mono text-xs font-bold">
                      <Trophy className="w-3.5 h-3.5" />
                      <span>¡VICTORIA DE CLÚSTER CONFIRMADA!</span>
                    </div>
                    <p className="text-xs text-white/80 font-mono">
                      Has obtenido <strong className="text-emerald-400">+{rewardAmount} PEARL</strong> de residuales de la pool y desbloqueaste un <strong className="text-purple-300">+2.5% de Overclock Boost</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={handleResetBattle}
                      className="text-[11px] font-mono text-white/50 hover:text-white underline transition-colors"
                    >
                      Simular Otra Batalla
                    </button>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Bottom Section Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onOpenAuth ? onOpenAuth('register') : window.location.assign('#preventa')}
                className="w-full py-4 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.97] shadow-xl"
              >
                <span>Asegurar Miner NFT para Battle Miner</span>
                <ArrowRight className="w-4 h-4 text-[#050505]" />
              </button>
              <p className="text-[9px] font-mono text-white/40 text-center mt-2">
                Los mineros adquiridos en preventa incluirán pase de batalla génesis gratuito.
              </p>
            </div>
          </div>
        </div>

        {/* 3 Core GameFi Pillars */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#0a0a0a] border border-white/10 hover:border-white/20 transition-all">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <h4 className="text-base font-bold text-white mb-2 tracking-tight">
              Hardware Real detrás de cada NFT
            </h4>
            <p className="text-xs text-white/50 leading-relaxed">
              No es un juego cosmético pasivo: cada carta representa potencia de silicio real de 3nm minando en centros de datos hidroeléctricos.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0a0a0a] border border-white/10 hover:border-white/20 transition-all">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
              <Trophy className="w-5 h-5 text-emerald-400" />
            </div>
            <h4 className="text-base font-bold text-white mb-2 tracking-tight">
              Residuales Directos de la Pool
            </h4>
            <p className="text-xs text-white/50 leading-relaxed">
              Las batallas reparten una porción directa de las tarifas de bloque de la pool de minería, creando un flujo de ingresos activo y competitivo.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0a0a0a] border border-white/10 hover:border-white/20 transition-all">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <h4 className="text-base font-bold text-white mb-2 tracking-tight">
              Fusión y Overclocking
            </h4>
            <p className="text-xs text-white/50 leading-relaxed">
              Combina mineros de menor rango para evolucionar la arquitectura de tu procesador y maximizar tu ratio W/TH en el ecosistema PEARL.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
