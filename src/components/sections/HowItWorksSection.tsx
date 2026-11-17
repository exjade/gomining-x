import { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { ShieldCheck, Cpu, Coins, CheckCircle2 } from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Crea tu Cuenta en 30 Segundos',
    tagline: 'ACCESO INSTANTÁNEO & SEGURO',
    description: 'Inicia sesión con correo verificado o conecta tu wallet Web3. Sin papeleo bancario, sin burocracia y con custodia total de tus credenciales.',
    metric: 'Tiempo de Setup: < 1 min',
    icon: ShieldCheck,
  },
  {
    number: '02',
    title: 'Elige tu Hashrate Institucional',
    tagline: 'SIN COMPRA DE GPUS NI RUIDO',
    description: 'Selecciona la cuota de potencia digital que desees (desde 1.46 TH/s hasta clusters de 5,000 TH/s). Nuestros centros de datos refrigerados por inmersión la activan en red.',
    metric: 'Eficiencia: 19.5 W/TH',
    icon: Cpu,
  },
  {
    number: '03',
    title: 'Recibe Rendimiento Diario en PEARL',
    tagline: 'INGRESOS PASIVOS ON-CHAIN',
    description: 'Tus mineros en la nube operan 24/7 sin interrupciones. Cada 24 horas, el smart contract liquida automáticamente tus ganancias en tokens PEARL directo a tu balance.',
    metric: 'Pagos: Cada 24h · 00:00 UTC',
    icon: Coins,
  },
];

export function HowItWorksSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 24,
    restDelta: 0.001,
  });

  // Differential Parallax for the 3 steps
  const yCard1 = useTransform(smoothProgress, [0, 1], [-30, 20]);
  const yCard2 = useTransform(smoothProgress, [0, 1], [-10, 10]);
  const yCard3 = useTransform(smoothProgress, [0, 1], [10, -20]);
  const yBg = useTransform(smoothProgress, [0, 1], [0, 100]);

  const yCards = [yCard1, yCard2, yCard3];

  return (
    <section
      id="como-funciona"
      ref={containerRef}
      className="relative py-32 px-4 sm:px-6 bg-[#050505] text-white border-t border-white/10 select-none overflow-hidden"
      aria-labelledby="how-it-works-title"
    >
      {/* Background Parallax Ambient Glow */}
      <motion.div style={{ y: yBg }} className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[600px] h-[400px] bg-purple-950/15 rounded-full blur-[160px]" />
      </motion.div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header with High Breathing Room */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="font-mono text-xs text-white/40">03</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
              OPERATING PROTOCOL // FLUJO DE GANANCIAS
            </span>
          </div>

          <h2
            id="how-it-works-title"
            className="text-5xl sm:text-7xl font-bold tracking-tighter text-white mb-5 leading-none"
          >
            Cómo Funciona.
          </h2>
          <p className="text-sm sm:text-base text-white/60 max-w-xl mx-auto leading-relaxed">
            Eliminamos las barreras de la minería tradicional: sin comprar GPUs que se devalúan, sin altas facturas eléctricas y sin ruido ensordecedor en tu sala.
          </p>

          <div className="inline-flex items-center gap-2 mt-6 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.02] text-[10px] font-mono text-white/60 uppercase tracking-widest">
            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            <span>Infraestructura Institucional 100% Gestionada</span>
          </div>
        </div>

        {/* 3 Step Cards with Differential Parallax Float & Luxury Elevation */}
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                style={{ y: yCards[i] }}
                className="group p-8 sm:p-10 rounded-3xl bg-[#0a0a0a] border border-white/10 hover:border-purple-500/30 hover:shadow-[0_0_40px_-10px_rgba(168,85,247,0.15)] transition-all duration-300 flex flex-col justify-between relative shadow-2xl overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-600/10 transition-colors" />

                <div>
                  <div className="flex items-center justify-between mb-8">
                    <span className="font-mono text-5xl sm:text-6xl font-bold text-white/20 tracking-tighter group-hover:text-white/40 transition-colors">
                      {step.number}
                    </span>
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Icon className="w-5 h-5 text-white/80" />
                    </div>
                  </div>

                  <span className="text-[9px] font-mono font-bold uppercase tracking-[0.25em] text-white/40 block mb-2">
                    {step.tagline}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-4">
                    {step.title}
                  </h3>
                  <p className="text-sm text-white/60 leading-relaxed font-normal mb-8">
                    {step.description}
                  </p>
                </div>

                <div className="pt-5 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-white/70 font-semibold">
                    {step.metric}
                  </span>
                  <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                    Paso {step.number}/03
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
