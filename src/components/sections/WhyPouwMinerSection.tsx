import { ShieldAlert, Sparkles } from 'lucide-react'

export function WhyPouwMinerSection() {
  return (
    <section
      id="por-que-pouwminer"
      data-testid="why-pouwminer-section"
      className="relative py-16 sm:py-24 px-4 sm:px-6 bg-[#050505] text-white border-t border-white/10 select-none overflow-hidden"
      aria-label="¿Por Qué PouwMiner es Mucho Más Rentable?"
    >
      <div className="max-w-7xl mx-auto relative z-10">
        {/* Comparison Table: Traditional Mining vs PouwMiner Cloud Mining */}
        <div className="p-4 sm:p-8 lg:p-10 rounded-3xl bg-[#0a0a0a] border border-white/10">
          <div className="text-center max-w-xl mx-auto mb-6 sm:mb-8">
            <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.25em] text-white/40 block mb-1.5">
              EFICIENCIA OPERATIVA
            </span>
            <h3 className="text-xl sm:text-3xl font-bold tracking-tight text-white">
              ¿Por Qué PouwMiner es Mucho Más Rentable?
            </h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/5">
              <div className="flex items-center gap-2 mb-4 text-rose-400 text-xs font-mono font-bold uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4" />
                <span>Minería Física en Casa</span>
              </div>
              <ul className="space-y-3 text-xs text-white/50 font-normal">
                <li className="flex items-start gap-2">
                  <span className="text-rose-500 font-bold">✕</span>
                  <span>Inversión de miles de dólares en GPUs que pierden valor cada 6 meses.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-500 font-bold">✕</span>
                  <span>Facturas de luz residencial de $150–$400/mes que se comen tus ganancias.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-500 font-bold">✕</span>
                  <span>Ruido de turbinas (&gt;75 dB), calor constante y caídas de internet casero.</span>
                </li>
              </ul>
            </div>

            <div className="p-6 rounded-2xl bg-purple-950/20 border border-purple-500/30">
              <div className="flex items-center gap-2 mb-4 text-purple-300 text-xs font-mono font-bold uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>PouwMiner Cloud Architecture</span>
              </div>
              <ul className="space-y-3 text-xs text-white/80 font-normal">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">✓</span>
                  <span><strong>120 TH/s ≈ $2.30 USD/día estimados</strong> sin facturas de electricidad residencial.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">✓</span>
                  <span>0 dB de ruido: operamos en centros de datos con refrigeración por inmersión líquida.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">✓</span>
                  <span>Liquidaciones diarias variables en tokens PEARL directo a tu balance.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
