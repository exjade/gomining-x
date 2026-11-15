import { useState, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Wallet, ArrowRight, Zap, Lock } from 'lucide-react';
import { AuthMode } from '../auth/AuthModal';

interface Web3CheckoutSectionProps {
  onOpenAuth?: (mode?: AuthMode) => void;
}

export function Web3CheckoutSection({ onOpenAuth }: Web3CheckoutSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedWallet, setSelectedWallet] = useState<string>('metamask');

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 22,
    restDelta: 0.001,
  });

  const yCoins = useTransform(smoothProgress, [0, 1], [-30, 30]);
  const yContent = useTransform(smoothProgress, [0, 1], [20, -20]);

  return (
    <section
      id="web3"
      ref={containerRef}
      className="relative py-32 px-4 sm:px-6 bg-[#050505] text-white border-t border-white/10 select-none overflow-hidden"
      aria-labelledby="web3-title"
    >
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-purple-950/20 rounded-full blur-[180px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* Left Column (50%): 3D Coins Showcase Floating with Parallax Bobbing */}
          <motion.div
            style={{ y: yCoins }}
            className="lg:col-span-6 flex flex-col items-center justify-center relative perspective-[1200px]"
          >
            <div className="relative w-full max-w-lg aspect-square flex items-center justify-center">
              {/* Center Ring Ambient */}
              <div className="absolute w-72 h-72 rounded-full border border-white/10 border-dashed animate-[spin_60s_linear_infinite] pointer-events-none" />
              <div className="absolute w-48 h-48 rounded-full bg-purple-600/10 blur-2xl pointer-events-none" />

              {/* 4 3D Coins Floating in Geometric Cross Layout */}
              {/* 1. Main Center: PEARL Coin */}
              <motion.div
                animate={{ y: [0, -10, 0], rotateZ: [-2, 2, -2] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                className="relative z-20 w-44 sm:w-52 filter drop-shadow-[0_20px_40px_rgba(168,85,247,0.35)]"
              >
                <img
                  src="/assets/pearl-coin-3d.png"
                  alt="PEARL 3D Native Token"
                  className="w-full object-contain"
                />
                <div className="text-center mt-2">
                  <span className="px-3 py-1 rounded-full bg-[#0a0a0a]/90 border border-purple-500/40 text-[10px] font-mono text-purple-300 font-bold uppercase tracking-wider backdrop-blur-md shadow-lg">
                    PEARL NATIVE
                  </span>
                </div>
              </motion.div>

              {/* 2. Top Right: USDT Coin */}
              <motion.div
                animate={{ y: [0, 8, 0], rotateZ: [2, -2, 2] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                className="absolute top-4 right-4 z-10 w-28 sm:w-36 filter drop-shadow-[0_15px_30px_rgba(38,161,123,0.3)]"
              >
                <img
                  src="/assets/usdt-coin-3d.png"
                  alt="USDT 3D Coin"
                  className="w-full object-contain"
                />
              </motion.div>

              {/* 3. Bottom Left: USDC Coin */}
              <motion.div
                animate={{ y: [0, -8, 0], rotateZ: [-1, 2, -1] }}
                transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                className="absolute bottom-4 left-4 z-10 w-28 sm:w-36 filter drop-shadow-[0_15px_30px_rgba(39,117,202,0.3)]"
              >
                <img
                  src="/assets/usdc-coin-3d.png"
                  alt="USDC 3D Coin"
                  className="w-full object-contain"
                />
              </motion.div>

              {/* 4. Top Left: SOL Coin */}
              <motion.div
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
                className="absolute top-6 left-6 z-10 w-24 sm:w-32 filter drop-shadow-[0_15px_30px_rgba(130,50,190,0.3)]"
              >
                <img
                  src="/assets/sol-coin-3d.png"
                  alt="Solana 3D Coin"
                  className="w-full object-contain"
                />
              </motion.div>
            </div>

            {/* Supported Networks Strip */}
            <div className="flex items-center gap-3 mt-4 text-[11px] font-mono text-white/50">
              <span>REDES:</span>
              <span className="px-2.5 py-0.5 rounded-full border border-white/10 bg-white/[0.02]">Polygon</span>
              <span className="px-2.5 py-0.5 rounded-full border border-white/10 bg-white/[0.02]">Solana</span>
              <span className="px-2.5 py-0.5 rounded-full border border-white/10 bg-white/[0.02]">Ethereum</span>
              <span className="px-2.5 py-0.5 rounded-full border border-white/10 bg-white/[0.02]">BNB Chain</span>
            </div>
          </motion.div>

          {/* Right Column (50%): High-Influence Web3 Connect CTA & FOMO */}
          <motion.div
            style={{ y: yContent }}
            className="lg:col-span-6 flex flex-col justify-center space-y-6"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-white/40">07</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
                PAGOS DESCENTRALIZADOS // WEB3 CHECKOUT
              </span>
            </div>

            <h2
              id="web3-title"
              className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-white leading-tight"
            >
              Conecta tu Wallet. Activa tu Minero al Instante.
            </h2>

            <p className="text-sm sm:text-base text-white/60 leading-relaxed font-normal">
              Sin intermediarios bancarios, sin esperas de aprobación y sin comisiones ocultas. Adquiere tu cuota de hashrate institucional conectando tu billetera Web3 preferida y liquidando directamente en <strong className="text-white">USDT, USDC o SOL</strong>.
            </p>

            {/* FOMO Benefit Box */}
            <div className="p-6 rounded-3xl bg-[#0a0a0a] border border-purple-500/30 shadow-[0_0_40px_-10px_rgba(168,85,247,0.15)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-purple-300 font-bold flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  BENEFICIO EXCLUSIVO DE PREVENTA
                </span>
                <span className="text-[10px] font-mono text-white/50">LOTE FASE 1</span>
              </div>
              <p className="text-xs text-white/80 leading-relaxed">
                Los participantes de la preventa obtienen un <strong className="text-white">-25% de descuento en el costo por TH/s</strong> y prioridad de asignación en los nuevos clusters PoUW con refrigeración por inmersión líquida.
              </p>
              <div className="pt-2 flex items-center gap-4 text-[10px] font-mono text-white/50">
                <span>✓ Smart Contracts Auditados</span>
                <span>✓ Custodia Propia de Claves</span>
                <span>✓ Liquidación Diaria Automática</span>
              </div>
            </div>

            {/* Wallet Selection Grid */}
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40 block mb-3">
                Selecciona tu Billetera Web3:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { id: 'metamask', label: 'MetaMask' },
                  { id: 'phantom', label: 'Phantom' },
                  { id: 'walletconnect', label: 'WalletConnect' },
                  { id: 'coinbase', label: 'Coinbase' },
                ].map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedWallet(w.id)}
                    className={`py-3 px-3 rounded-2xl border text-xs font-mono transition-all active:scale-[0.97] ${
                      selectedWallet === w.id
                        ? 'border-white bg-white/15 text-white font-bold shadow-lg'
                        : 'border-white/10 hover:border-white/20 bg-white/[0.02] text-white/50 hover:text-white'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Primary Magnetic CTA */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onOpenAuth ? onOpenAuth('register') : window.location.assign('#preventa')}
                className="w-full sm:w-auto px-8 py-4 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-sm flex items-center justify-center gap-2.5 transition-all active:scale-[0.97] shadow-2xl shadow-white/10"
              >
                <Wallet className="w-4 h-4 text-[#050505]" />
                <span>Conectar Wallet & Asegurar Hashrate</span>
                <ArrowRight className="w-4 h-4 text-[#050505]" />
              </button>
              <p className="text-[10px] font-mono text-white/40 mt-2 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-white/40" />
                <span>Protocolo Web3 auditado · Transacciones 100% on-chain verificables</span>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
