import { useEffect, useRef, type ReactNode } from 'react'
import { customMinerPriceTiers, type MinerPlan } from '../../minerCatalog'
import { formatCatalogPrice } from '../../paymentQuote'
import type { MinerCategoryTab } from './MinerTabs'

export function MinerOptionList({
  activeTab,
  plans,
  selectedId,
  onSelect,
  heading,
  badge,
  includeCustom = false,
  children,
}: {
  activeTab: MinerCategoryTab
  plans: MinerPlan[]
  selectedId: string
  onSelect: (id: string) => void
  heading?: ReactNode
  badge?: ReactNode
  includeCustom?: boolean
  children?: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedMonthlyPlan = activeTab === 'monthly' ? plans.find((plan) => plan.id === selectedId) : undefined
  const selectedCustom = includeCustom && selectedId === 'custom'

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [activeTab])

  return (
    <div
      className={'miner-option-panel miner-option-panel-' + activeTab + (selectedCustom ? ' miner-option-panel-custom' : '')}
      id="miner-option-panel"
      role="tabpanel"
      aria-labelledby={'miner-tab-' + activeTab}
    >
      <div className="miner-option-scroll" ref={scrollRef}>
        <div className="miner-option-heading">
          {heading}
          {badge}
        </div>
        <div className="miner-option-list">
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              className={'miner-option-row' + (plan.cadence === 'monthly' ? ' miner-option-row-monthly' : '') + (selectedId === plan.id ? ' miner-option-row-active' : '')}
              aria-pressed={selectedId === plan.id}
              onClick={() => onSelect(plan.id)}
            >
              <span className="miner-option-title">
                <strong>{plan.label}</strong>
                {plan.limitUnits ? <small>{plan.limitUnits} disp.</small> : null}
              </span>
              <strong className="miner-option-price">{formatCatalogPrice(plan.price, 'USD')}</strong>
              <span className="miner-option-detail">
                {plan.btcPerDay !== undefined
                  ? plan.btcPerDay.toFixed(8) + ' BTC/día'
                  : plan.cadence === 'monthly'
                    ? plan.powerTh.toFixed(2) + ' TH'
                    : ''}
              </span>
              <small className="miner-option-roi">
                {plan.roi !== undefined
                  ? 'ROI ' + plan.roi + '%*'
                  : plan.cadence === 'monthly'
                    ? '/ mes'
                    : ''}
              </small>
            </button>
          ))}
          {includeCustom && (
            <button
              type="button"
              className={'miner-option-row miner-option-row-custom' + (selectedId === 'custom' ? ' miner-option-row-active' : '')}
              aria-pressed={selectedId === 'custom'}
              onClick={() => onSelect('custom')}
            >
              <span className="miner-option-title">
                <span className="miner-option-custom-icon" aria-hidden="true">✦</span>
                <strong>Custom</strong>
              </span>
              <strong className="miner-option-price">
                {formatCatalogPrice(customMinerPriceTiers[0].priceUsd, 'USD')} – {formatCatalogPrice(customMinerPriceTiers[customMinerPriceTiers.length - 1].priceUsd, 'USD')}
              </strong>
              <span className="miner-option-detail">1–5,000 TH · {customMinerPriceTiers.length} niveles</span>
            </button>
          )}
        </div>
        {selectedMonthlyPlan && (
          <div className="miner-monthly-selection-detail" aria-live="polite">
            <strong>{selectedMonthlyPlan.label}</strong>
            <span>{selectedMonthlyPlan.powerTh.toFixed(2)} TH · {formatCatalogPrice(selectedMonthlyPlan.price, 'USD')} / mes</span>
            <small>Elige un plan superior para aumentar la potencia de tu minero.</small>
          </div>
        )}
        {children ? <div className="miner-option-extra">{children}</div> : null}
      </div>
    </div>
  )
}
