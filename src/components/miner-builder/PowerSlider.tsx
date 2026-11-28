type MinerTier = { powerTh: number; priceUsd: number }

export function PowerSlider({ value, tiers, valueLabel, onChange }: {
  value: number
  tiers: MinerTier[]
  valueLabel: string
  onChange: (index: number) => void
}) {
  const safeIndex = Math.max(0, Math.min(tiers.length - 1, value))
  const currentTier = tiers[safeIndex]
  const pricePerTh = currentTier.priceUsd / currentTier.powerTh
  const pricePerThLabel = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(pricePerTh)
  const totalPriceLabel = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(currentTier.priceUsd)
  const fillPct = tiers.length > 1 ? (safeIndex / (tiers.length - 1)) * 100 : 0

  return (
    <div className="miner-power-control" data-testid="builder-power-slider">
      <div className="miner-power-range-control">
        <div className="miner-power-range-head">
          <label className="miner-power-range-label" htmlFor="custom-power-range">
            Desliza para elegir tu potencia
          </label>
          <span className="miner-power-range-tier">{valueLabel}</span>
        </div>
        <input
          id="custom-power-range"
          className="miner-power-range"
          type="range"
          min={0}
          max={Math.max(0, tiers.length - 1)}
          step={1}
          value={safeIndex}
          style={{ ['--slider-fill' as string]: `${fillPct}%` }}
          aria-label="Potencia del minero en TH/s"
          aria-valuetext={`${currentTier.powerTh.toLocaleString('es-MX')} TH/s · ${totalPriceLabel} USD`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <div className="miner-power-scale" aria-hidden="true">
          <span>1 TH</span>
          <span>32 TH</span>
          <span>512 TH</span>
          <span>5,000 TH</span>
        </div>
      </div>

      <div className="miner-power-price-grid">
        <div className="miner-power-price-cell">
          <span>Precio por TH</span>
          <strong>{pricePerThLabel} / TH</strong>
        </div>
        <div className="miner-power-price-cell miner-power-price-total">
          <span>Precio total</span>
          <strong>{totalPriceLabel} USD</strong>
        </div>
      </div>
    </div>
  )
}
