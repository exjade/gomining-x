import { useState } from 'react'
import { PaymentOptions, type MaintenanceToken } from './PaymentOptions'

export type RewardPeriod = 'daily' | 'monthly' | 'annual'

const periods: Array<{ id: RewardPeriod; label: string }> = [
  { id: 'daily', label: 'A diario' },
  { id: 'monthly', label: 'Mensual' },
  { id: 'annual', label: 'Anual' },
]

export function RewardsCalculator({
  roiPeriod,
  setRoiPeriod,
  maintenanceToken,
  setMaintenanceToken,
  btcPriceUsd,
  poolPayoutUsd,
  periodBtcEstimate,
  periodMaintenanceUsd,
  periodMaintenanceTokenAmount,
  netRewardUsd,
  displayRoi,
  showCurrencySelector = false,
}: {
  roiPeriod: RewardPeriod
  setRoiPeriod: (period: RewardPeriod) => void
  maintenanceToken: MaintenanceToken
  setMaintenanceToken: (token: MaintenanceToken) => void
  btcPriceUsd: number
  poolPayoutUsd: number
  periodBtcEstimate: number
  periodMaintenanceUsd: number
  periodMaintenanceTokenAmount: number
  netRewardUsd: number
  displayRoi: number
  showCurrencySelector?: boolean
}) {
  const [maintenanceCurrency, setMaintenanceCurrency] = useState<'GOMINING' | 'BTC'>('GOMINING')
  const maintenanceDisplayAmount = maintenanceCurrency === 'BTC'
    ? periodMaintenanceUsd / btcPriceUsd
    : periodMaintenanceTokenAmount

  return (
    <section className="miner-rewards-calculator">
      <div className="miner-rewards-periods" role="group" aria-label="Periodo de recompensas">
        {periods.map((period) => (
          <button key={period.id} type="button" aria-pressed={roiPeriod === period.id} className={roiPeriod === period.id ? 'miner-rewards-period-active' : ''} onClick={() => setRoiPeriod(period.id)}>
            {period.label}
          </button>
        ))}
      </div>
      <div className="miner-rewards-reference">
        <div className="miner-rewards-value-row">
          <span>Precio BTC de referencia <span className="miner-info-icon" aria-hidden="true">i</span></span>
          <strong>${btcPriceUsd.toLocaleString('en-US')} USD <span className="miner-rewards-chevron" aria-hidden="true">⌄</span></strong>
        </div>
        <PaymentOptions maintenanceToken={maintenanceToken} onChange={setMaintenanceToken} />
        {showCurrencySelector && (
          <div className="miner-rewards-currency">
            <span>Mantenimiento</span>
            <div role="group" aria-label="Moneda de mantenimiento" className="miner-rewards-currency-buttons">
              {(['GOMINING', 'BTC'] as const).map((currency) => (
                <button key={currency} type="button" aria-pressed={maintenanceCurrency === currency} className={maintenanceCurrency === currency ? 'miner-rewards-currency-active' : ''} onClick={() => setMaintenanceCurrency(currency)}>
                  {currency}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="miner-rewards-metrics">
        <div className="miner-rewards-metric">
          <span>Pago estimado de pool:</span>
          <strong>${poolPayoutUsd.toFixed(2)} USD<small>{periodBtcEstimate.toFixed(8)} BTC{showCurrencySelector && <span className="miner-coin-icon miner-coin-icon-btc" aria-hidden="true">₿</span>}</small></strong>
        </div>
        <div className="miner-rewards-metric">
          <span className="miner-maintenance-label">
            Mantenimiento:
            {maintenanceToken === 'PEARL' && <small>HASTA -20%</small>}
          </span>
          <strong>-${periodMaintenanceUsd.toFixed(2)} USD<small>{(showCurrencySelector ? maintenanceDisplayAmount : periodMaintenanceTokenAmount).toFixed(8)} {showCurrencySelector ? maintenanceCurrency : maintenanceToken}{showCurrencySelector && <span className={maintenanceCurrency === 'BTC' ? 'miner-coin-icon miner-coin-icon-btc' : 'miner-coin-icon miner-coin-icon-gomining'} aria-hidden="true">{maintenanceCurrency === 'BTC' ? '₿' : 'G'}</span>}</small></strong>
        </div>
        <div className="miner-rewards-metric miner-rewards-net">
          <span>Recompensa neta estimada: <span className="miner-info-icon" aria-hidden="true">i</span></span>
          <strong>${netRewardUsd.toFixed(2)} USD</strong>
        </div>
        <div className="miner-rewards-metric miner-rewards-roi">
          <span>ROI estimado anual: <span className="miner-info-icon" aria-hidden="true">i</span></span>
          <strong>hasta {displayRoi}%</strong>
        </div>
      </div>
      <small className="miner-rewards-note">
        *El token de mantenimiento ({maintenanceToken}) se deposita y se convierte en Crédito de Mantenimiento para descontar costos diarios.
      </small>
      {showCurrencySelector && (
        <div className="miner-reward-history" role="note">
          <span className="miner-reward-history-icon" aria-hidden="true">◷</span>
          <span>Historial de recompensas</span>
        </div>
      )}
    </section>
  )
}
