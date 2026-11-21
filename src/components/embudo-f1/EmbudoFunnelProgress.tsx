import { EMBUDO_F1_STEPS, type EmbudoF1Stage } from './funnelState'
import './embudoF1.css'

interface EmbudoFunnelProgressProps {
  currentStep: Exclude<EmbudoF1Stage, 'idle'>
  language?: 'es' | 'en'
  variant?: 'modal' | 'builder'
}

export function EmbudoFunnelProgress({
  currentStep,
  language = 'es',
  variant = 'builder',
}: EmbudoFunnelProgressProps) {
  const activeIndex = EMBUDO_F1_STEPS.findIndex((step) => step.id === currentStep)
  const ariaLabel =
    language === 'en'
      ? 'Presale registration and checkout steps'
      : 'Pasos de registro y compra en preventa'

  return (
    <nav
      className={`embudo-f1-progress embudo-f1-progress-${variant}`}
      aria-label={ariaLabel}
      data-embudo-step={currentStep}
    >
      <ol className="embudo-f1-step-list">
        {EMBUDO_F1_STEPS.map((step, index) => {
          const isCompleted = activeIndex > index
          const isCurrent = activeIndex === index
          const stateClass = isCurrent
            ? 'embudo-f1-step-current'
            : isCompleted
              ? 'embudo-f1-step-done'
              : 'embudo-f1-step-upcoming'

          return (
            <li
              key={step.id}
              className={`embudo-f1-step ${stateClass}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="embudo-f1-step-index" aria-hidden="true">
                {isCompleted ? (
                  <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                    <path
                      d="M2.25 6.25L4.75 8.75L9.75 3.5"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  step.num
                )}
              </span>
              <span className="embudo-f1-step-label">
                {language === 'en' ? step.labelEn : step.labelEs}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function EmbudoPresaleSkinNotice({ language = 'es' }: { language?: 'es' | 'en' }) {
  return (
    <div className="embudo-f1-presale-notice" role="note">
      <span className="embudo-f1-presale-tag">
        {language === 'en' ? 'PRESALE' : 'PREVENTA'}
      </span>
      <span className="embudo-f1-presale-copy">
        {language === 'en'
          ? 'Free presale customization ($0 per skin) — price scales strictly by TH/s power.'
          : 'Personalización gratis por preventa ($0 por skin) — el precio varía solo por potencia TH/s.'}
      </span>
    </div>
  )
}
