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
  const tokenPrecision = maintenanceToken === 'USDT' ? 2 : 4

  return (
    <section className="miner-rewards-calculator" data-testid="builder-rewards-calculator">
      <div className="miner-rewards-periods" role="group" aria-label="Periodo de recompensas">
        {periods.map((period) => (
          <button
            key={period.id}
            type="button"
            aria-pressed={roiPeriod === period.id}
            className={roiPeriod === period.id ? 'miner-rewards-period-active' : ''}
            onClick={() => setRoiPeriod(period.id)}
          >
            {period.label}
          </button>
        ))}
      </div>

      <div className="miner-rewards-reference">
        <div className="miner-rewards-value-row">
          <span>Precio BTC de referencia</span>
          <strong>${btcPriceUsd.toLocaleString('en-US')} USD</strong>
        </div>
        <PaymentOptions maintenanceToken={maintenanceToken} onChange={setMaintenanceToken} />
      </div>

      <div className="miner-rewards-metrics">
        <div className="miner-rewards-metric">
          <div className="miner-rewards-metric-copy">
            <span>Pago estimado de pool</span>
            <p className="miner-rewards-explain">
              Lo que produce tu potencia (TH/s) en el pool antes de descontar operación.
            </p>
          </div>
          <strong>
            ${poolPayoutUsd.toFixed(2)} USD
            <small>{periodBtcEstimate.toFixed(8)} BTC</small>
          </strong>
        </div>

        <div className="miner-rewards-metric">
          <div className="miner-rewards-metric-copy">
            <span className="miner-maintenance-label">
              Mantenimiento
              {maintenanceToken === 'PEARL' && <small>HASTA -20%</small>}
            </span>
            <p className="miner-rewards-explain">
              Electricidad y hospedaje en data center. Con PEARL ahorras hasta 20% frente a USDT.
            </p>
          </div>
          <strong>
            -${periodMaintenanceUsd.toFixed(2)} USD
            <small>
              ≈ {periodMaintenanceTokenAmount.toFixed(tokenPrecision)} {maintenanceToken}
            </small>
          </strong>
        </div>

        <div className="miner-rewards-metric miner-rewards-net">
          <div className="miner-rewards-metric-copy">
            <span>Recompensa neta estimada</span>
            <p className="miner-rewards-explain">
              Ganancia limpia que queda para ti después de cubrir el mantenimiento.
            </p>
          </div>
          <strong>${netRewardUsd.toFixed(2)} USD</strong>
        </div>

        <div className="miner-rewards-metric miner-rewards-roi">
          <div className="miner-rewards-metric-copy">
            <span>ROI estimado anual</span>
            <p className="miner-rewards-explain">
              Porcentaje anual proyectado sobre el valor del minero (referencia variable).
            </p>
          </div>
          <strong>hasta {displayRoi}%</strong>
        </div>
      </div>

      <small className="miner-rewards-note">
        *El token de mantenimiento ({maintenanceToken}) se usa como Crédito de Mantenimiento para cubrir los costos diarios de operación en USD.
      </small>
    </section>
  )
}
