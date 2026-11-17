import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import type { AuthMode } from '../ui/Navbar';

interface MembershipsSectionProps {
  onOpenAuth?: (mode?: AuthMode) => void;
}

export function MembershipsSection({ onOpenAuth }: MembershipsSectionProps) {
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
  const yCards = useTransform(smoothProgress, [0, 1], [25, -25]);
  const yBg = useTransform(smoothProgress, [0, 1], [0, 120]);

  return (
    <section
      id="membresias"
      ref={containerRef}
      className="relative py-32 px-4 sm:px-6 bg-[#050505] text-white border-t border-white/10 select-none overflow-hidden"
      aria-labelledby="memberships-title"
    >
      <motion.div style={{ y: yBg }} className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[750px] h-[450px] bg-purple-950/20 rounded-full blur-[180px]" />
      </motion.div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="font-mono text-xs text-white/40">06</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
              MEMBRESÍAS POUWMINER // SUPERFICIE ACTUAL
            </span>
          </div>
          <h2 id="memberships-title" className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter text-white mb-5 leading-none">
            Membresías.
          </h2>
          <p className="text-sm sm:text-base text-white/60 max-w-xl mx-auto leading-relaxed">
            La disponibilidad, los precios y los beneficios se consultan en la superficie actual de suscripciones. La landing conserva la presentación, pero no duplica ese catálogo ni procesa pagos.
          </p>
        </div>

        <motion.div style={{ y: yCards }} className="max-w-3xl mx-auto rounded-3xl p-5 sm:p-8 lg:p-12 bg-[#0a0a0a]/85 backdrop-blur-2xl border border-white/10 shadow-2xl">
          <div className="flex items-start gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Suscripciones del dashboard</h3>
              <p className="text-sm text-white/50 mt-2">Consulta el estado disponible y continúa en el flujo existente.</p>
            </div>
          </div>

          <div className="space-y-4 border-t border-white/10 pt-6 text-sm text-white/70">
            {[
              'Los planes y ciclos provienen de la superficie actual de suscripciones.',
              'La activación conserva la autenticación y las comprobaciones existentes.',
              'La landing no presenta precios, beneficios ni pagos paralelos.',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <Check className="w-4 h-4 mt-0.5 text-emerald-400 flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Link
              to="/subscriptions"
              className="flex-1 py-3.5 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            >
              <span>Ver suscripciones</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={() => onOpenAuth?.('register')}
              className="flex-1 py-3.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            >
              <span>Crear cuenta</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>

        <p className="text-center text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 mt-8">
          La landing no sustituye el catálogo ni el checkout del dashboard.
        </p>
      </div>
    </section>
  );
}
