import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { PowMinerLogo } from '../ui/PowMinerLogo';
import { AuthMode } from '../auth/AuthModal';

const faqs = [
  {
    q: '¿Necesito comprar hardware físico o equipos de minería para casa?',
    a: 'No. Tu minero digital opera con hashrate respaldado en centros de datos especializados de grado industrial. Tú únicamente gestionas tu asignación y recibes recompensas en PEARL sin ruido ni consumo eléctrico residencial.',
  },
  {
    q: '¿Cómo funciona la liquidación de potencia y recompensas?',
    a: 'Las recompensas se acreditan periódicamente en tokens PEARL calculadas sobre el hashrate activo asignado y la dificultad algorítmica de la red. Toda la telemetría es auditable en tiempo real.',
  },
  {
    q: '¿Puedo transferir o comercializar mi minero digital?',
    a: 'Sí, los mineros son activos transferibles respaldados por infraestructura física. Puedes gestionarlos, transferirlos a otras billeteras compatibles o combinarlos según las normas del protocolo.',
  },
  {
    q: '¿Cuáles son los métodos de pago aceptados en la preventa?',
    a: 'Se aceptan criptomonedas nativas (USDT, USDC, SOL). Al crear tu cuenta puedes vincular directamente tu wallet Web3 o ingresar mediante correo verificado.',
  },
  {
    q: '¿Qué ocurre al agotarse los 120 cupos de la preventa?',
    a: 'Al finalizar la cuenta regresiva de 15 días o agotarse el inventario inicial, los siguientes lotes pasarán a los precios estándar de lanzamiento oficial. Se recomienda asegurar la cuota temprana.',
  },
];

interface CtaSectionProps {
  onOpenAuth?: (mode?: AuthMode) => void;
}

export function CtaSection({ onOpenAuth }: CtaSectionProps) {
  return (
    <>
      {/* 10. FAQ Section */}
      <section id="faq" className="py-32 px-6 bg-[#050505] text-white border-t border-white/10" aria-labelledby="faq-title">
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="font-mono text-xs text-white/40">10</span>
              <span className="text-[11px] font-mono uppercase tracking-[0.4em] text-white/50">
                Preguntas Frecuentes
              </span>
            </div>
            <h2 id="faq-title" className="text-4xl sm:text-6xl font-bold tracking-tighter text-white">
              Todo lo que necesitas saber.
            </h2>
          </motion.div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <motion.details
                key={faq.q}
                className="rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/20 group overflow-hidden transition-colors"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
              >
                <summary className="flex items-center justify-between p-6 cursor-pointer list-none font-medium text-white/90 group-open:text-white transition-colors">
                  <span className="text-sm sm:text-base tracking-tight">{faq.q}</span>
                  <span className="text-white/40 group-open:rotate-45 group-hover:text-white transition-all duration-200 flex-shrink-0 ml-4 font-mono text-xl">
                    +
                  </span>
                </summary>
                <div className="px-6 pb-6 pt-0 text-xs sm:text-sm text-white/60 leading-relaxed border-t border-white/5 mt-2 pt-4">
                  {faq.a}
                </div>
              </motion.details>
            ))}
          </div>
        </div>
      </section>

      {/* 11. Final CTA -> Clean Keynote #comenzar */}
      <section
        id="comenzar"
        className="relative py-36 px-6 bg-[#050505] text-white overflow-hidden text-center border-t border-white/10"
        aria-labelledby="cta-title"
      >
        <div className="max-w-4xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="font-mono text-xs text-white/40">11</span>
              <span className="text-[11px] font-mono uppercase tracking-[0.4em] text-white/50">
                Lanzamiento Institucional
              </span>
            </div>

            {/* Large PouwMiner Aerodynamic Logo Emblem */}
            <div className="flex justify-center items-center mb-8 relative">
              <div className="absolute inset-0 bg-purple-600/15 rounded-full blur-3xl pointer-events-none scale-150" />
              <PowMinerLogo size="hero" showSubtitle={false} className="justify-center relative z-10" />
            </div>

            <h2 id="cta-title" className="text-3xl sm:text-5xl md:text-6xl font-bold text-white tracking-tighter mb-4 leading-tight">
              Comienza a Minar en la Nube Hoy.
            </h2>

            <p className="text-xs sm:text-base text-white/60 mb-10 max-w-xl mx-auto leading-relaxed px-4">
              Crea tu cuenta en segundos, selecciona tu cuota de hashrate digital y recibe dividendos continuos liquidados directamente en tokens PEARL cada 24 horas.
            </p>

            <div className="flex flex-wrap gap-4 justify-center mb-12">
              <button
                type="button"
                onClick={() => onOpenAuth ? onOpenAuth('register') : window.location.assign('#preventa')}
                className="px-8 py-4 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-sm flex items-center gap-2 shadow-2xl transition-all active:scale-[0.97]"
              >
                <span>Crear Cuenta / Pre-ordenar</span>
                <ArrowRight className="w-4 h-4 text-[#050505]" />
              </button>

              <button
                type="button"
                onClick={() => onOpenAuth ? onOpenAuth('login') : window.location.assign('#comenzar')}
                className="px-8 py-4 rounded-full border border-white/20 hover:border-white/40 bg-transparent text-white font-medium text-sm transition-all active:scale-[0.97]"
              >
                Iniciar Sesión
              </button>
            </div>

            <div className="flex items-center justify-center gap-8 text-xs font-mono text-white/40 uppercase tracking-wider">
              <span>0% HARDWARE EN CASA</span>
              <span>·</span>
              <span>CONTRATOS AUDITADOS</span>
              <span>·</span>
              <span>LIQUIDACIÓN PEARL</span>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
