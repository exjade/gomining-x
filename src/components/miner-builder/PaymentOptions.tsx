import { useState } from 'react'

export type MaintenanceToken = 'PEARL' | 'USDT'

export function PaymentOptions({ maintenanceToken, onChange }: {
  maintenanceToken: MaintenanceToken
  onChange: (token: MaintenanceToken) => void
}) {
  return (
    <div className="miner-payment-option">
      <span>Token de mantenimiento</span>
      <div className="miner-payment-option-buttons" role="group" aria-label="Token de mantenimiento">
        <button type="button" aria-pressed={maintenanceToken === 'PEARL'} className={maintenanceToken === 'PEARL' ? 'miner-payment-option-active' : ''} onClick={() => onChange('PEARL')}>
          PEARL (-20%)
        </button>
        <button type="button" aria-pressed={maintenanceToken === 'USDT'} className={maintenanceToken === 'USDT' ? 'miner-payment-option-active' : ''} onClick={() => onChange('USDT')}>
          USDT
        </button>
      </div>
    </div>
  )
}

export function PaymentTimingOptions() {
  const [timing, setTiming] = useState<'now' | 'later'>('now')

  return (
    <div className="miner-payment-option miner-payment-timing">
      <span>Pago</span>
      <div className="miner-payment-option-buttons" role="group" aria-label="Momento del pago">
        <button type="button" aria-pressed={timing === 'now'} className={timing === 'now' ? 'miner-payment-option-active' : ''} onClick={() => setTiming('now')}>
          Pagar ahora
        </button>
        <button type="button" aria-pressed={timing === 'later'} className={timing === 'later' ? 'miner-payment-option-active' : ''} onClick={() => setTiming('later')}>
          Pagar después
        </button>
      </div>
    </div>
  )
}
