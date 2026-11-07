import type { ReactNode } from 'react'

type ModalVariant = 'catalog' | 'custom' | 'workflow'

export function CreateMinerModal({ children, onClose, variant }: {
  children: ReactNode
  onClose: () => void
  variant: ModalVariant
}) {
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
        <button type="button" className="modal-close" aria-label="Cerrar configurador" onClick={onClose}>×</button>
        {children}
      </section>
    </div>
  )
}
