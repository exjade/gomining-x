import type { ReactNode } from 'react'

export function MinerCreationScreen({
  children,
  customMode = false,
  hideBackButton = false,
  eyebrow,
  backLabel = '‹',
  backAriaLabel = 'Volver a los paquetes',
  onBack,
}: {
  children: ReactNode
  customMode?: boolean
  hideBackButton?: boolean
  eyebrow?: string
  backLabel?: string
  backAriaLabel?: string
  onBack?: () => void
}) {
  if (customMode) {
    return (
      <div className="miner-creation-screen miner-creation-screen-custom">
        <header className="miner-custom-header">
          {!hideBackButton && (
            <button
              type="button"
              className="miner-custom-back"
              data-testid="miner-custom-back-btn"
              aria-label={backAriaLabel}
              onClick={onBack}
            >
              {backLabel}
            </button>
          )}
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id="miner-builder-title">Crear minero personalizado</h2>
          </div>
        </header>
        <div className="miner-creation-content miner-creation-content-custom">{children}</div>
      </div>
    )
  }

  return (
    <div className="miner-creation-screen">
      <header className="miner-creation-header">
        <div className="miner-creation-art" aria-hidden="true" />
        <div className="miner-creation-copy">
          <p className="eyebrow">CONFIGURADOR DE MINERO</p>
          <h2 id="miner-builder-title">Crear un minero</h2>
          <p className="purchase-muted">Elige tu minero digital respaldado por potencia real. Todos los precios en USD ($).</p>
        </div>
      </header>
      <div className="miner-creation-content">{children}</div>
    </div>
  )
}
