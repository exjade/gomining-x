import { useEffect, useRef, useState } from 'react'

type MinerTier = { powerTh: number; priceUsd: number }

export function PowerSlider({ value, tiers, valueLabel, onChange }: {
  value: number
  tiers: MinerTier[]
  valueLabel: string
  onChange: (index: number) => void
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const scrollViewport = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(tiers.length > 1)

  const updateScrollState = () => {
    const viewport = scrollViewport.current
    if (!viewport) return
    setCanScrollLeft(viewport.scrollLeft > 1)
    setCanScrollRight(viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1)
  }

  const moveTo = (index: number) => {
    const nextIndex = Math.max(0, Math.min(tiers.length - 1, index))
    onChange(nextIndex)
    buttons.current[nextIndex]?.focus()
    buttons.current[nextIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  const scrollCarousel = (direction: -1 | 1) => {
    const viewport = scrollViewport.current
    if (!viewport) return
    viewport.scrollBy({ left: direction * viewport.clientWidth * 0.7, behavior: 'smooth' })
  }

  useEffect(() => {
    updateScrollState()
  }, [tiers.length])

  const pricePerTh = tiers[value].priceUsd / tiers[value].powerTh
  const pricePerThLabel = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(pricePerTh)

  return (
    <div className="miner-power-control">
      <div className="miner-power-label">
        <span>Nivel y Potencia <span className="miner-info-icon" aria-hidden="true">i</span></span>
        <strong>{valueLabel}</strong>
      </div>
      <div className="miner-power-carousel">
        <button type="button" className="miner-power-arrow" aria-label="Nivel anterior" disabled={!canScrollLeft} onClick={() => scrollCarousel(-1)}>‹</button>
        <div ref={scrollViewport} className="miner-power-scroll" role="group" aria-label="Niveles de potencia" onScroll={updateScrollState}>
          {tiers.map((tier, index) => (
            <button
              key={tier.powerTh + '-' + index}
              ref={(element) => { buttons.current[index] = element }}
              type="button"
              className={value === index ? 'miner-power-chip miner-power-chip-active' : 'miner-power-chip'}
              aria-pressed={value === index}
              tabIndex={value === index ? 0 : -1}
              onClick={() => {
                onChange(index)
                buttons.current[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') { event.preventDefault(); moveTo(index + 1) }
                if (event.key === 'ArrowLeft') { event.preventDefault(); moveTo(index - 1) }
                if (event.key === 'Home') { event.preventDefault(); moveTo(0) }
                if (event.key === 'End') { event.preventDefault(); moveTo(tiers.length - 1) }
              }}
            >
              <span className="miner-power-chip-main"><span className="miner-power-mark" aria-hidden="true">⚡</span>{tier.powerTh.toLocaleString('es-MX')} TH</span>
            </button>
          ))}
        </div>
        <button type="button" className="miner-power-arrow" aria-label="Nivel siguiente" disabled={!canScrollRight} onClick={() => scrollCarousel(1)}>›</button>
      </div>
      <div className="miner-power-price">
        <span>Precio por TH</span>
        <strong>{pricePerThLabel} / TH</strong>
      </div>
    </div>
  )
}
