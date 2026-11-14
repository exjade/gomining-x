import { useEffect, useRef } from 'react'
import { usePersonalization } from '../personalization'
import { TRAIT_PRESENTATION_BY_ID, type Trait } from './appearance'
import type { UnlockRequirement } from './piece-access'
import type { CustomBenefit } from './catalog-contract'

export function LockedTraitModal({
  trait,
  missing,
  benefits,
  returnFocusTo,
  onClose,
}: {
  trait: Trait
  missing: readonly UnlockRequirement[]
  benefits: readonly CustomBenefit[]
  returnFocusTo: { current: HTMLButtonElement | null }
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const { t } = usePersonalization()
  const presentation = TRAIT_PRESENTATION_BY_ID[trait.trait_id]
  const copyRequirements = missing.filter((requirement) => requirement.descriptionEs || requirement.buttonText || requirement.linkTo)
  const showTraitCopy = trait.description || trait.button_text

  useEffect(() => {
    const dialog = dialogRef.current!
    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    focusables()[0]?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusables()
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      returnFocusTo.current?.focus()
    }
  }, [onClose, returnFocusTo])

  return (
    <div className="pwm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="pwm-lock-modal" role="dialog" aria-modal="true" aria-labelledby="pwm-lock-title">
        <button type="button" className="pwm-modal-close" aria-label={t('minerCustomization.close')} onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        {presentation?.kind === 'measured-color'
          ? <div className="pwm-lock-thumbnail pwm-lock-thumbnail-measured" style={{ backgroundColor: presentation.color }} role="img" aria-label={trait.value ?? t('minerCustomization.visualUnavailable')} />
          : trait.link_picture
            ? <img className="pwm-lock-thumbnail" src={trait.link_picture} alt={trait.value ?? ''} />
            : <div className="pwm-lock-thumbnail pwm-lock-thumbnail-placeholder" role="img" aria-label={t('minerCustomization.visualUnavailable')}>▧</div>}
        <h2 id="pwm-lock-title">{trait.value}</h2>
        {benefits.flatMap((benefit) => {
          const lines = [benefit.label_es, benefit.description_es].filter((line): line is string => Boolean(line))
          return lines.length ? [<div className="pwm-lock-benefit" key={benefit.benefit_id}>{lines.map((line, index) => index === 0 && benefit.label_es ? <strong key={index}>{line}</strong> : <p key={index}>{line}</p>)}</div>] : []
        })}
        {showTraitCopy && <div className="pwm-lock-copy">
          {trait.description && <p>{trait.description}</p>}
          {trait.button_text && (trait.link_to_task
            ? <a className="pwm-button pwm-button-primary" href={trait.link_to_task}>{trait.button_text}</a>
            : <button className="pwm-button pwm-button-primary" type="button" disabled>{trait.button_text}</button>)}
        </div>}
        {copyRequirements.map((requirement, index) => (requirement.descriptionEs || requirement.buttonText) && <div className="pwm-lock-copy" key={`${requirement.kind}-${index}`}>
          {requirement.descriptionEs && <p>{requirement.descriptionEs}</p>}
          {requirement.buttonText && (requirement.linkTo
            ? <a className="pwm-button pwm-button-primary" href={requirement.linkTo}>{requirement.buttonText}</a>
            : <button className="pwm-button pwm-button-primary" type="button" disabled>{requirement.buttonText}</button>)}
        </div>)}
      </section>
    </div>
  )
}
