import type { ReactNode } from 'react'
import './builderLandingTheme.css'

type ModalVariant = 'catalog' | 'custom' | 'workflow'

export function CreateMinerModal({ children, onClose, variant, showBrandTopbar = true }: {
  children: ReactNode
  onClose: () => void
  variant: ModalVariant
  showBrandTopbar?: boolean
}) {
  const useStructuredTopbar = showBrandTopbar && (variant === 'custom' || variant === 'workflow')
  return (
    <div
      className="modal-backdrop purchase-backdrop miner-builder-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section
        className={'purchase-modal miner-builder-modal miner-builder-modal-' + variant}
        role="dialog"
        aria-modal="true"
        aria-labelledby="miner-builder-title"
      >
        {useStructuredTopbar ? (
          <div className="builder-modal-topbar">
            <div className="builder-modal-topbar-left">
              <span className="builder-modal-brand">
                PouwMiner <span className="builder-modal-brand-tag">Builder</span>
              </span>
            </div>
            <button
              type="button"
              className="builder-modal-close-inline"
              aria-label="Cerrar configurador"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        ) : (
          <button type="button" className="modal-close" aria-label="Cerrar configurador" onClick={onClose}>×</button>
        )}
        {children}
      </section>
    </div>
  )
}
