import { useRef, useState } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Activity } from 'lucide-react';

interface PartSpec {
  id: string;
  num: string;
  name: string;
  subtitle: string;
  description: string;
  specValue: string;
  specLabel: string;
  profitImpact: string;
}

const hardwareParts: PartSpec[] = [
  {
    id: 'chassis',
    num: '01',
    name: 'Chasis de Titanio Grado Aeroespacial',
    subtitle: 'Arquitectura Unibody CNC para Inmersión Líquida',
    description:
      'Mecanizado a partir de aleación de titanio Ti-6Al-4V con tratamiento térmico anódico. Protege los módulos de computación en refrigeración líquida dieléctrica de alta densidad sin degradación de materiales.',
    specValue: 'Ti-6Al-4V',
    specLabel: 'Estructura Robusta',
    profitImpact: 'Cero Mantenimiento Físico',
  },
  {
    id: 'cooling',
    num: '02',
    name: 'Cámara de Vapor de Cobre Pulido',
    subtitle: 'Disipación Térmica Continua para Operación 24/7/365',
    description:
      'Matriz de micro-aletas de cobre electrolítico de 0.1 mm con fluido de cambio de fase. Mantiene los chips a < 58°C constantes, permitiendo aceleración sostenida del hashrate sin throttling.',
    specValue: '< 58°C Core',
    specLabel: 'Estabilidad Térmica',
    profitImpact: '100% Hashrate Sostenido',
  },
  {
    id: 'chipset',
    num: '03',
    name: 'Núcleo Neural PoUW 3nm',
    subtitle: 'Procesador ASIC de Cálculo Útil & Criptografía',
    description:
      'Arquitectura litografiada en 3nm con pines de oro puro. Procesa algoritmos criptográficos para la red PEARL y ejecuta paralelamente inferencia de IA institucional comercializable.',
    specValue: '19.5 W/TH',
    specLabel: 'Eficiencia Energética',
    profitImpact: 'Doble Vía de Ingresos (Hash + IA)',
  },
  {
    id: 'pcb',
    num: '04',
    name: 'Placa Madre PCB Multicapa',
    subtitle: 'Entrega de Energía de Ultra-baja Impedancia',
    description:
      'Placa de circuitos de 14 capas con pistas de potencia chapadas en oro de 24K y condensadores de tantalio de grado militar para suministro de corriente continuo sin micro-cortes.',
    specValue: '99.98% SLA',
    specLabel: 'Disponibilidad Industrial',
    profitImpact: 'Liquidaciones Diarias Ininterrumpidas',
  },
];

export function ProductSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activePart, setActivePart] = useState<PartSpec>(hardwareParts[0]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 22,
    restDelta: 0.001,
  });

  // Parallax Depth Transforms
  const yHardware = useTransform(smoothProgress, [0, 0.5, 1], [-60, 0, 60]);
  const scale = useTransform(smoothProgress, [0, 0.5, 1], [0.94, 1.04, 0.96]);
  const rotateGrid = useTransform(smoothProgress, [0, 1], [0, 60]);
  const yBg = useTransform(smoothProgress, [0, 1], [0, 120]);

  // Differential Parallax for Exploded Component Callouts
  const yPin1 = useTransform(smoothProgress, [0, 1], [-40, 20]);
  const yPin2 = useTransform(smoothProgress, [0, 1], [-20, 40]);
  const yPin3 = useTransform(smoothProgress, [0, 1], [-10, 50]);

  return (
    <section
      id="producto"
      ref={containerRef}
      className="relative min-h-[140vh] bg-[#050505] text-white py-32 px-4 sm:px-6 overflow-hidden select-none border-t border-white/10"
      aria-labelledby="product-title"
    >
      {/* Background Holographic Parallax Grid & Atmosphere */}
      <motion.div style={{ y: yBg }} className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-purple-950/15 rounded-full blur-[180px]" />
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-white/[0.02] rounded-full blur-[120px]" />
      </motion.div>

      {/* Rotating Parallax HUD Tech Ring */}
      <motion.div
        style={{ rotate: rotateGrid }}
        className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[650px] sm:w-[850px] h-[650px] sm:h-[850px] rounded-full border border-white/[0.03] border-dashed pointer-events-none hidden md:block"
      />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="font-mono text-xs text-white/40">02</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
              EXPLODED 3D ARCHITECTURE // HARDWARE NATIVO
            </span>
          </div>

          <h2
            id="product-title"
            className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter text-white mb-5 leading-none break-words"
          >
            Infraestructura 3D.
          </h2>
          <p className="text-sm sm:text-base text-white/60 max-w-2xl mx-auto leading-relaxed">
            No te vendemos hardware para instalar en tu casa: operamos esta arquitectura de alta densidad en granjas hidroeléctricas institucionales para que tú recibas dividendos en tokens PEARL diariamente, con cero gastos en luz y cero mantenimiento.
          </p>
        </div>

        {/* 3D Exploded View Showcase with Interactive Parallax Layers */}
        <div className="grid lg:grid-cols-12 gap-10 items-center mb-20">
          {/* Left / Center: Exploded 3D Stage with Parallax Elevation */}
          <div className="lg:col-span-7 relative flex items-center justify-center p-2 sm:p-6 perspective-[1200px]">
            {/* The Hardware Visual with Parallax Scroll */}
            <motion.div
              style={{ scale, y: yHardware }}
              className="relative w-full max-w-xl flex items-center justify-center"
            >
              <img
                src="/assets/powminer-titan-exploded-transparent.png"
                alt="PouwMiner Titan 3D Exploded Technical Breakdown"
                className="relative w-full object-contain drop-shadow-[0_30px_70px_rgba(0,0,0,0.98)] select-none"
                style={{
                  maskImage: 'radial-gradient(ellipse at center, black 65%, transparent 95%)',
                  WebkitMaskImage: 'radial-gradient(ellipse at center, black 65%, transparent 95%)',
                }}
              />

              {/* Dynamic Parallax Telemetry Pins (Floating over Hardware) */}
              <motion.div
                style={{ y: yPin1 }}
                className="absolute top-6 left-2 sm:left-4 px-3 py-1.5 rounded-full bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/20 text-[9px] sm:text-[10px] font-mono tracking-widest text-white/80 uppercase shadow-2xl flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span>01 TITANIO Ti-6Al-4V</span>
              </motion.div>

              <motion.div
                style={{ y: yPin2 }}
                className="absolute top-1/3 right-2 sm:right-4 px-3 py-1.5 rounded-full bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/20 text-[9px] sm:text-[10px] font-mono tracking-widest text-white/80 uppercase shadow-2xl flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                <span>02 CÁMARA VAPOR &lt; 58°C</span>
              </motion.div>

              <motion.div
                style={{ y: yPin3 }}
                className="absolute bottom-6 left-4 sm:left-8 px-3.5 py-1.5 rounded-full bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/25 text-[9px] sm:text-[10px] font-mono tracking-widest text-white uppercase shadow-2xl flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                <span>03 SILICIO 3nm · 19.5 W/TH</span>
              </motion.div>
            </motion.div>
          </div>

          {/* Right: Active Detail Callout (Apple Style 01, 02, 03, 04) with Earning Impact */}
          <div className="lg:col-span-5 flex flex-col justify-center space-y-6">
            <motion.div
              key={activePart.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="p-8 sm:p-10 rounded-3xl bg-[#0a0a0a] border border-white/10 hover:border-purple-500/30 hover:shadow-[0_0_40px_-10px_rgba(168,85,247,0.15)] transition-all duration-300 relative shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-6xl font-mono font-bold text-white/20 tracking-tighter">
                  {activePart.num}
                </span>
                <span className="px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-[10px] font-mono text-purple-300 uppercase tracking-widest flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-purple-400" />
                  {activePart.profitImpact}
                </span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tighter">
                {activePart.name}
              </h3>
              <p className="text-[11px] font-semibold text-white/40 tracking-[0.2em] uppercase mb-4">
                {activePart.subtitle}
              </p>
              <p className="text-sm text-white/60 leading-relaxed mb-6 font-normal">
                {activePart.description}
              </p>

              <div className="pt-5 border-t border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-white/30 uppercase tracking-[0.2em] block font-mono">
                    {activePart.specLabel}
                  </span>
                  <span className="text-lg font-bold text-white font-mono">
                    {activePart.specValue}
                  </span>
                </div>
                <div className="px-3 py-1 rounded-full border border-white/20 text-[10px] font-mono uppercase tracking-widest text-white/70">
                  Infraestructura Auditada
                </div>
              </div>
            </motion.div>

            {/* Quick Component Selector Buttons (Monochrome / High Contrast) */}
            <div className="grid grid-cols-2 gap-3">
              {hardwareParts.map((part) => {
                const isSelected = activePart.id === part.id;
                return (
                  <button
                    key={part.id}
                    onClick={() => setActivePart(part)}
                    className={`p-3.5 rounded-2xl border text-left text-xs transition-all active:scale-[0.97] ${
                      isSelected
                        ? 'border-white bg-white/15 text-white font-semibold shadow-lg shadow-white/5'
                        : 'border-white/10 hover:border-white/25 bg-white/[0.02] text-white/40 hover:text-white/80'
                    }`}
                  >
                    <span className="text-[10px] text-white/40 block font-mono font-bold">
                      {part.num} //
                    </span>
                    <span className="truncate block mt-0.5 font-medium">{part.name.split(' ')[0]} {part.name.split(' ')[1]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* High-Octane Financial & Technical Benchmark Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 sm:p-8 rounded-3xl bg-[#0a0a0a] border border-white/10 text-center">
          <div>
            <span className="text-3xl sm:text-4xl font-bold font-mono text-white block tracking-tight">19.5 W/TH</span>
            <span className="text-[10px] text-white/40 uppercase tracking-[0.2em] mt-1 block">Eficiencia Energética</span>
          </div>
          <div>
            <span className="text-3xl sm:text-4xl font-bold font-mono text-white block tracking-tight">+38.5% APY</span>
            <span className="text-[10px] text-white/40 uppercase tracking-[0.2em] mt-1 block">Rendimiento Proyectado</span>
          </div>
          <div>
            <span className="text-3xl sm:text-4xl font-bold font-mono text-white block tracking-tight">99.98%</span>
            <span className="text-[10px] text-white/40 uppercase tracking-[0.2em] mt-1 block">Disponibilidad de Red</span>
          </div>
          <div>
            <span className="text-3xl sm:text-4xl font-bold font-mono text-white block tracking-tight">DIARIO</span>
            <span className="text-[10px] text-white/40 uppercase tracking-[0.2em] mt-1 block">Liquidación en PEARL</span>
          </div>
        </div>
      </div>
    </section>
  );
}
