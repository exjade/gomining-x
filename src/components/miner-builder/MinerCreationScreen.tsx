import type { ReactNode } from 'react'

export function MinerCreationScreen({ children, customMode = false, onBack }: {
  children: ReactNode
  customMode?: boolean
  onBack?: () => void
}) {
  if (customMode) {
    return (
      <div className="miner-creation-screen miner-creation-screen-custom">
        <header className="miner-custom-header">
          <button type="button" className="miner-custom-back" aria-label="Volver a los paquetes" onClick={onBack}>‹</button>
          <div>
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
