import { motion } from 'framer-motion';

const disclosures = [
  {
    num: '01',
    title: 'Recompensas Variables en PEARL',
    description: 'Las recompensas dependen de la dificultad algorítmica de la red y los costos de infraestructura. No son fijas ni prometen retornos predeterminados.',
  },
  {
    num: '02',
    title: 'Hashrate Físico en Centros de Datos',
    description: 'Cada minero digital representa capacidad real de procesamiento alojada en data centers. No es un token especulativo sin soporte físico.',
  },
  {
    num: '03',
    title: 'Rasgos Cosméticos Separados',
    description: 'La personalización visual o nivel de rareza del minero digital es estética y no altera la eficiencia energética (19.5 W/TH) ni la potencia.',
  },
  {
    num: '04',
    title: 'Parámetros de Preventa en Curso',
    description: 'Los cupos y niveles de preventa responden a parámetros de mercado observados y son auditados continuamente por el equipo de producto.',
  },
  {
    num: '05',
    title: 'Términos y Políticas Oficiales',
    description: 'Términos de Servicio y Políticas de Privacidad detalladas y accesibles en la plataforma para consulta y resguardo del usuario.',
  },
  {
    num: '06',
    title: 'Verificación Estricta de Hechos',
    description: 'Solo publicamos métricas de red, infraestructura y relaciones técnicas verificables bajo rigor documental con PEARL Research Lab.',
  },
];

export function TransparencySection() {
  return (
    <section id="transparencia" className="relative py-28 px-6 bg-[#050505] text-white border-t border-white/10 select-none" aria-labelledby="transparency-title">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="font-mono text-xs text-white/40">08</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
              CLARITY & DISCLOSURES
            </span>
          </div>

          <h2 id="transparency-title" className="text-5xl sm:text-7xl font-bold tracking-tighter text-white mb-4 leading-none">
            Transparencia.
          </h2>
          <p className="text-sm sm:text-base text-white/50 max-w-md mx-auto leading-relaxed">
            Seis principios de claridad técnica y gobernanza que rigen la plataforma.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {disclosures.map((item, i) => (
            <motion.div
              key={item.num}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="p-8 rounded-3xl bg-[#0a0a0a] border border-white/10 flex flex-col justify-between"
            >
              <div>
                <span className="font-mono text-xs text-white/40 block mb-4">
                  {item.num}
                </span>
                <h3 className="font-bold text-lg text-white mb-2 tracking-tight">
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm text-white/50 leading-relaxed font-normal">
                  {item.description}
                </p>
              </div>

              <div className="pt-4 border-t border-white/10 mt-6">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">
                  Verificado
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
