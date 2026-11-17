import React, { useState, useEffect } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

const sections = [
  { id: 'hero', num: '01', label: 'Inicio', tag: 'POUW' },
  { id: 'como-funciona', num: '02', label: 'Cómo Funciona', tag: 'FLUJO' },
  { id: 'producto', num: '03', label: 'Hardware 3D', tag: '3D CORE' },
  { id: 'calculadora', num: '04', label: 'Calculadora', tag: 'INGRESOS' },
  { id: 'preventa', num: '05', label: 'Preventa 15d', tag: 'PRE-VENTA' },
  { id: 'membresias', num: '06', label: 'Membresías', tag: 'BENEFICIOS' },
  { id: 'web3', num: '07', label: 'Web3 Checkout', tag: 'PAGOS' },
  { id: 'unilevel', num: '08', label: 'Red Unilevel', tag: 'AFILIADOS' },
  { id: 'battle-miner', num: '09', label: 'Battle Miner', tag: 'GAMEFI' },
  { id: 'roadmap', num: '10', label: 'Roadmap', tag: 'FASES' },
];

export const SideScrollTracker: React.FC = () => {
  const [scrollPercent, setScrollPercent] = useState(0);
  const [activeSection, setActiveSection] = useState('hero');
  const [hovered, setHovered] = useState(false);

  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 24,
    restDelta: 0.001,
  });

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = totalHeight > 0 ? Math.min(100, Math.max(0, Math.round((scrollY / totalHeight) * 100))) : 0;
      setScrollPercent(progress);

      // Detect active section
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= window.innerHeight * 0.45) {
            setActiveSection(sections[i].id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* Desktop & Tablet Floating HUD Side Tracker */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="fixed right-3 sm:right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-3 select-none"
        aria-label="Indicador de progreso de scroll y navegación lateral"
      >
        {/* Real-time Percentage Badge with Subtle Glowing Neon Border */}
        <motion.div
          animate={{
            scale: hovered ? 1.08 : 1,
            borderColor: scrollPercent > 0 ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.15)',
          }}
          className="px-2 py-1 rounded-md bg-[#0a0a0a]/95 border border-white/15 backdrop-blur-xl text-[10px] font-mono text-white tracking-widest text-center shadow-2xl min-w-[44px]"
        >
          <span className="text-white font-bold">{String(scrollPercent).padStart(2, '0')}</span>
          <span className="text-white/40 text-[9px]">%</span>
        </motion.div>

        {/* Vertical Progress Bar Track (Dynamic Height Fill with Smooth Spring) */}
        <div className="relative w-[3px] h-32 sm:h-40 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="w-full bg-gradient-to-b from-white via-purple-400 to-white rounded-full origin-top"
            style={{ scaleY: smoothProgress, height: '100%' }}
          />
        </div>

        {/* Section Navigation Nodes with Tooltips */}
        <div className="flex flex-col items-center gap-2.5">
          {sections.map((sec) => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => scrollTo(sec.id)}
                className="group relative flex items-center justify-end focus:outline-none py-0.5"
                aria-label={`Ir a sección ${sec.label}`}
              >
                {/* Flyout Tooltip Label on Hover */}
                {hovered && (
                  <motion.div
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="hidden sm:flex absolute right-7 items-center gap-2 px-2.5 py-1 rounded-lg bg-[#0a0a0a]/95 border border-white/15 backdrop-blur-xl text-[10px] font-mono text-white/90 whitespace-nowrap pointer-events-none shadow-xl"
                  >
                    <span className="text-white/40 font-bold">{sec.num}</span>
                    <span>{sec.label}</span>
                    <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[8px] font-mono border border-purple-500/30">
                      {sec.tag}
                    </span>
                  </motion.div>
                )}

                {/* Sleek Node Dot */}
                <div
                  className={`w-1.5 rounded-full transition-all duration-300 ${
                    isActive
                      ? 'h-4 bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] scale-110'
                      : 'h-1.5 bg-white/20 group-hover:bg-white/70 group-hover:h-2'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
};
