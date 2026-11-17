import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, User } from 'lucide-react';
import type { AuthMode } from './Navbar';

interface StickyEarningsBarProps {
  currentTh?: number;
  onOpenAuth?: (mode?: AuthMode) => void;
}

export function StickyEarningsBar({ currentTh, onOpenAuth }: StickyEarningsBarProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Appear once scrolled past the top hero banner (scrollY > 90)
      setShow(window.scrollY > 90);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (href: string) => {
    const el = document.querySelector(href);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          initial={{ y: -80, x: '-50%', opacity: 0 }}
          animate={{ y: 0, x: '-50%', opacity: 1 }}
          exit={{ y: -80, x: '-50%', opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="fixed top-2.5 sm:top-4 left-1/2 z-50 py-1.5 sm:py-2 px-3 sm:px-5 rounded-full bg-[#0a0a0a]/94 border border-white/15 backdrop-blur-2xl shadow-2xl shadow-black/95 flex items-center gap-2.5 sm:gap-4 text-xs select-none max-w-[95vw] w-auto whitespace-nowrap"
          aria-label="Barra flotante de rendimiento PouwMiner"
        >
          {/* Left: Active network status & Hashrate */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <a
              href="#hero"
              className="font-bold text-white tracking-tight text-[11px] sm:text-xs hover:text-white/80 transition-colors flex items-center gap-1.5"
            >
              <span className="text-white font-mono font-bold text-[11px] sm:text-xs">{currentTh ? `${currentTh} TH/s` : 'CATÁLOGO'}</span>
            </a>
            <span className="text-white/20 hidden sm:inline">·</span>
            <span className="hidden sm:inline font-mono text-[10px] text-white/50 tracking-wider">
              CLOUD MINING
            </span>
          </div>

          {/* Center: Live Earnings Indicator */}
          <div className="flex items-center gap-1.5 font-mono text-[11px] sm:text-xs border-x border-white/10 px-2.5 sm:px-3">
            <span className="text-white/40 hidden sm:inline">Día:</span>
            <strong className="text-emerald-400 font-bold">RECOMPENSAS VARIABLES</strong>
            <span className="text-white/40 text-[10px] hidden md:inline">DATOS INFORMATIVOS</span>
          </div>

          {/* Right: 15-day Badge & Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
            <span className="hidden sm:inline-flex text-[9px] sm:text-[10px] font-mono text-white/70 uppercase tracking-widest border border-white/15 bg-white/[0.03] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full whitespace-nowrap">
              CATÁLOGO MAIN
            </span>

            <button
              type="button"
              onClick={() => (onOpenAuth ? onOpenAuth('login') : handleNavClick('#comenzar'))}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-white/10 text-white/60 hover:text-white text-[11px] font-mono transition-colors active:scale-[0.97]"
              title="Iniciar Sesión"
            >
              <User className="w-3 h-3 text-white/50" />
              <span>Ingresar</span>
            </button>

            <button
              type="button"
              onClick={() => (onOpenAuth ? onOpenAuth('register') : handleNavClick('#preventa'))}
              className="px-3.5 py-1.5 sm:px-4 sm:py-1.5 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-[11px] sm:text-xs flex items-center gap-1.5 transition-all active:scale-[0.97] shadow-lg shadow-white/5 whitespace-nowrap"
            >
              <span>Pre-ordenar</span>
              <ArrowRight className="w-3 h-3 text-[#050505]" />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
