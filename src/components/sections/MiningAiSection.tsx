import { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { ArrowRight, Cpu, Network, Binary } from 'lucide-react';

export function MiningAiSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 22,
    restDelta: 0.001,
  });

  const yChip = useTransform(smoothProgress, [0, 1], [-45, 45]);
  const rotateChip = useTransform(smoothProgress, [0, 1], [-2, 2]);
  const yText = useTransform(smoothProgress, [0, 1], [30, -30]);
  const yBg = useTransform(smoothProgress, [0, 1], [0, 100]);

  return (
    <section
      id="vision-pearl"
      ref={containerRef}
      className="relative py-36 px-4 sm:px-6 bg-[#050505] text-white overflow-hidden select-none border-t border-white/10"
      aria-labelledby="vision-title"
    >
      {/* Background Parallax Nebula */}
      <motion.div style={{ y: yBg }} className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[700px] h-[450px] bg-purple-950/15 rounded-full blur-[180px]" />
      </motion.div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Macro Neural Silicon Chip with 3D Parallax */}
          <motion.div
            style={{ y: yChip, rotate: rotateChip }}
            className="lg:col-span-6 relative flex items-center justify-center perspective-[1000px]"
          >
            <div className="relative w-full max-w-lg group">
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-purple-600/30 via-white/10 to-transparent blur-xl opacity-60 group-hover:opacity-100 transition-opacity" />

              <img
                src="/assets/pouwminer-neural-chip.jpg"
                alt="PoUW Core Matrix 3nm Neural Processor"
                className="relative w-full object-cover rounded-3xl border border-white/15 shadow-2xl drop-shadow-[0_25px_60px_rgba(0,0,0,0.98)]"
              />

              <div className="absolute top-4 left-4 px-3.5 py-1.5 rounded-full bg-[#050505]/90 backdrop-blur-md border border-white/20 text-[9px] font-mono tracking-widest text-white/80 uppercase flex items-center gap-1.5">
                <Binary className="w-3 h-3 text-purple-400" />
                <span>PoUW Neural Substrate</span>
              </div>

              <div className="absolute bottom-4 right-4 px-3.5 py-1.5 rounded-full bg-[#050505]/90 backdrop-blur-md border border-white/20 text-[9px] font-mono tracking-widest text-white uppercase">
                Litografía 3nm · 19.5 W/TH
              </div>
            </div>
          </motion.div>

          {/* Right Column: Narrative with Parallax */}
          <motion.div
            style={{ y: yText }}
            className="lg:col-span-6 flex flex-col justify-center space-y-6"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-white/40">05</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
                PEARL RESEARCH LAB // VISIÓN PoUW & IA
              </span>
            </div>

            <h2
              id="vision-title"
              className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-white leading-tight"
            >
              Cómputo Útil.
            </h2>

            <p className="text-sm sm:text-base text-white/60 leading-relaxed font-normal">
              La arquitectura Proof of Useful Work (PoUW) transforma la energía de hashrate tradicional en cómputo distribuido de alto valor para inferencia de inteligencia artificial y procesamiento científico, liquidando dividendos constantes en tokens PEARL.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="p-6 rounded-2xl bg-[#0a0a0a] border border-white/10 hover:border-purple-500/30 transition-colors space-y-2">
                <div className="flex items-center gap-2 text-white">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  <span className="text-[11px] font-mono uppercase tracking-[0.2em] font-bold">
                    Cálculo Dual
                  </span>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">
                  Hashrate criptográfico de consenso coordinado simultáneamente con aceleración de redes neuronales.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-[#0a0a0a] border border-white/10 hover:border-white/20 transition-colors space-y-2">
                <div className="flex items-center gap-2 text-white">
                  <Network className="w-4 h-4 text-white/70" />
                  <span className="text-[11px] font-mono uppercase tracking-[0.2em] font-bold">
                    Respaldo Físico
                  </span>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">
                  Infraestructura industrial verificable en 9 centros de datos hidroeléctricos con liquidación directa on-chain.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <a
                href="#roadmap"
                className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-white hover:text-white/70 transition-colors"
              >
                <span>Explorar fases del Roadmap institucional</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
