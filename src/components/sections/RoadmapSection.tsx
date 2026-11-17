import { useState, useRef, useEffect } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { roadmapPhases, type RoadmapPhase } from '../../landingRoadmap';

function StatusBadge({ status }: { status: RoadmapPhase['status'] }) {
  const config = {
    completed: { label: 'Completado', cls: 'text-white/80 bg-white/10 border-white/20' },
    'in-progress': { label: 'En curso', cls: 'text-white bg-white/20 border-white font-bold' },
    upcoming: { label: 'Próximo', cls: 'text-white/40 bg-white/[0.02] border-white/10' },
  };
  const { label, cls } = config[status];
  return (
    <span className={`text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

function PhaseNode({ phase, isActive, onClick }: {
  phase: RoadmapPhase;
  isActive: boolean;
  onClick: () => void;
}) {
  const isCompleted = phase.status === 'completed';
  const isInProgress = phase.status === 'in-progress';

  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-4 md:gap-6 w-full text-left p-6 rounded-3xl transition-all duration-300 active:scale-[0.98] ${
        isActive
          ? 'bg-[#0e0e0e] border border-white/25 shadow-2xl shadow-purple-950/10'
          : 'bg-[#0a0a0a]/60 border border-white/5 hover:border-white/15 hover:bg-white/[0.02]'
      }`}
      aria-expanded={isActive}
      aria-label={`Fase ${phase.number}: ${phase.title}`}
    >
      {/* Node indicator */}
      <div className="flex-shrink-0 relative flex flex-col items-center pt-0.5">
        <div
          className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center font-mono text-xs transition-all ${
            isCompleted
              ? 'bg-white text-[#050505] font-bold shadow-md'
              : isInProgress
              ? 'bg-white/20 border-2 border-white text-white font-bold scale-110 shadow-[0_0_15px_rgba(255,255,255,0.4)]'
              : 'bg-[#0a0a0a] border border-white/20 text-white/40'
          }`}
          aria-hidden="true"
        >
          {isCompleted ? '✓' : phase.number}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 pb-1">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-bold text-lg sm:text-xl tracking-tight text-white">
              {phase.number}. {phase.title}
            </h3>
            {phase.badge && (
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-white text-[#050505] uppercase tracking-wider shadow-sm">
                {phase.badge}
              </span>
            )}
          </div>
          <StatusBadge status={phase.status} />
        </div>
        <p className="text-sm text-white/60 leading-relaxed font-normal">{phase.description}</p>
      </div>
    </button>
  );
}

function PhaseDetail({ phase }: { phase: RoadmapPhase }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="ml-6 md:ml-16 mt-3 mb-6 p-7 rounded-3xl bg-[#0a0a0a] border border-white/15 shadow-xl relative overflow-hidden group"
      role="region"
      aria-label={`Detalles de la fase ${phase.number}: ${phase.title}`}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 rounded-full blur-[40px] pointer-events-none" />

      <div className="flex items-center justify-between mb-5 border-b border-white/10 pb-3">
        <h4 className="font-mono text-xs uppercase tracking-[0.25em] text-white/40">Entregables Técnicos Auditables</h4>
        {phase.jiraRef && (
          <span className="text-[10px] font-mono text-white/70 px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.02]">
            {phase.jiraRef}
          </span>
        )}
      </div>
      <ul className="space-y-3" role="list">
        {phase.details.map((detail, i) => (
          <li key={i} className="flex gap-3 items-start text-xs sm:text-sm text-white/70">
            <span className="text-white/40 mt-0.5 flex-shrink-0 font-mono">
              {phase.status === 'completed' ? '✓' : '—'}
            </span>
            <span>{detail}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export function RoadmapSection() {
  const [activePhase, setActivePhase] = useState<string | null>('phase-2');
  const sectionRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start 80%', 'end 20%'],
  });

  const lineHeight = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activePhase) return;
      const currentIndex = roadmapPhases.findIndex(p => p.id === activePhase);
      if (e.key === 'ArrowDown' && currentIndex < roadmapPhases.length - 1) {
        setActivePhase(roadmapPhases[currentIndex + 1].id);
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        setActivePhase(roadmapPhases[currentIndex - 1].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePhase]);

  const togglePhase = (id: string) => {
    setActivePhase(prev => prev === id ? null : id);
  };

  return (
    <section ref={sectionRef} id="roadmap" className="relative py-36 px-6 bg-[#050505] text-white border-t border-white/10 select-none overflow-hidden" aria-labelledby="roadmap-title">
      {/* Background Subtle Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[650px] h-[350px] bg-purple-950/10 rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-20">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="font-mono text-xs text-white/40">07</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[11px] font-semibold tracking-[0.4em] uppercase text-white/60">
              MILESTONE ROADMAP
            </span>
          </div>

          <h2 id="roadmap-title" className="text-5xl sm:text-7xl font-bold tracking-tighter text-white mb-6 leading-none">
            Hoja de Ruta.
          </h2>
          <p className="text-base sm:text-lg text-white/60 max-w-md mx-auto leading-relaxed">
            9 fases de desarrollo e infraestructura sincronizadas con la ejecución de Jira.
          </p>

          <div className="mt-4 inline-flex items-center gap-2 text-[10px] font-mono text-white/40 uppercase tracking-widest px-3 py-1 rounded-full border border-white/10 bg-white/[0.02]">
            <span>Usa las teclas ↑ / ↓ para navegar</span>
          </div>
        </div>

        {/* Timeline list with dynamic progress line */}
        <div className="relative">
          {/* Vertical line track */}
          <div className="absolute left-[18px] md:left-[22px] top-6 bottom-6 w-px bg-white/10" aria-hidden="true">
            <motion.div
              style={{ height: lineHeight }}
              className="w-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            />
          </div>

          <div className="space-y-6">
            {roadmapPhases.map((phase) => (
              <div key={phase.id}>
                <PhaseNode
                  phase={phase}
                  isActive={activePhase === phase.id}
                  onClick={() => togglePhase(phase.id)}
                />
                <AnimatePresence>
                  {activePhase === phase.id && (
                    <PhaseDetail phase={phase} />
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
