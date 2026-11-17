import { motion } from 'framer-motion';

const values = [
  {
    num: '01',
    title: 'Investigación Aplicada',
    description: 'PEARL Research Lab investiga y construye soluciones técnicas en software de alta concurrencia, infraestructura distribuida y protocolos de computación útil.',
  },
  {
    num: '02',
    title: 'Infraestructura de Minería Digital',
    description: 'PouwMiner opera como la rama de ejecución que facilita el acceso a capacidad de hashrate industrial liquidada en PEARL sin requerir hardware en casa.',
  },
  {
    num: '03',
    title: 'Rigor de Ingeniería y Telemetría',
    description: 'Sistemas de telemetría continua para monitoreo térmico, eficiencia energética de 19.5 W/TH y trazabilidad en tiempo real.',
  },
];

export function AboutSection() {
  return (
    <section id="quienes-somos" className="relative py-28 px-6 bg-[#050505] text-white border-t border-white/10 select-none" aria-labelledby="about-title">
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* Left Text Column */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-5 space-y-6"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-white/40">09</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
                PEARL RESEARCH LAB
              </span>
            </div>

            <h2 id="about-title" className="text-5xl sm:text-7xl font-bold tracking-tighter text-white leading-none">
              Quiénes Somos.
            </h2>

            <div className="space-y-4 text-sm sm:text-base text-white/50 leading-relaxed font-normal">
              <p>
                <strong className="text-white">PouwMiner</strong> es la división operativa de{' '}
                <strong className="text-white">PEARL Research Lab</strong>, un equipo centrado en computación de alto rendimiento, infraestructura de hashrate y aceleración de algoritmos descentralizados.
              </p>
              <p>
                Desarrollamos soluciones que permiten operar potencia de procesamiento real sin fricciones de instalación, cableado, ruido o sobrecalentamiento residencial.
              </p>
            </div>
          </motion.div>

          {/* Right Values Cards */}
          <div className="lg:col-span-7 space-y-4">
            {values.map((val) => (
              <motion.div
                key={val.num}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="p-7 rounded-3xl bg-[#0a0a0a] border border-white/10 flex gap-6 items-start"
              >
                <span className="font-mono text-xs text-white/40 mt-1 block">
                  {val.num}
                </span>
                <div>
                  <h3 className="font-bold text-lg text-white mb-1.5 tracking-tight">
                    {val.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-white/50 leading-relaxed font-normal">
                    {val.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
