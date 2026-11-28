import { useState } from 'react'
import { useDemoSession, activateDemoSubscription, cancelDemoSubscription } from './demoStore'
import { useAuth } from './AuthContext'
import { usePersonalization } from './personalization'
import { customMinerPriceTiers } from './minerCatalog'
import type { PaymentCurrency } from './paymentQuote'

export function SubscriptionsPage({
  onPayWithWallet,
  openTopUp,
}: {
  onPayWithWallet: (productName: string, amount: number, currency?: PaymentCurrency) => void
  openTopUp: () => void
}) {
  const demo = useDemoSession()
  const { user, isEmailVerified, openAuthModal } = useAuth()
  const { language } = usePersonalization()
  const isEn = language === 'en'

  type PlanCycle = 'monthly' | 'semiannual' | 'annual'
  const [selectedCycle, setSelectedCycle] = useState<PlanCycle>('monthly')
  const [feedback, setFeedback] = useState('')

  const planOptions: Record<
    PlanCycle,
    { name: string; price: number; period: string; savings?: string; perMonth: string }
  > = {
    monthly: {
      name: isEn ? 'Monthly' : 'Mensual',
      price: 30,
      period: isEn ? 'Billed every month' : 'Cobro cada mes',
      perMonth: isEn ? '$30 / mo' : '$30 / mes',
    },
    semiannual: {
      name: isEn ? 'Semiannual' : 'Semestral',
      price: 180,
      period: isEn ? 'Billed every 6 months' : 'Cobro cada 6 meses',
      perMonth: isEn ? '$30 / mo' : '$30 / mes',
    },
    annual: {
      name: isEn ? 'Annual' : 'Anual',
      price: 324,
      period: isEn ? 'Billed every year' : 'Cobro cada año',
      savings: isEn ? 'Annual boost' : 'Ahorro anual',
      perMonth: isEn ? '$27 / mo' : '$27 / mes',
    },
  }

  const currentPlan = planOptions[selectedCycle]

  const handleActivateWithBalance = () => {
    if (!user || user.isAnonymous) {
      openAuthModal('register')
      return
    }
    if (!isEmailVerified) {
      openAuthModal('verify-email')
      return
    }

    const cycleMap: Record<PlanCycle, 'monthly' | 'annual'> = {
      monthly: 'monthly',
      semiannual: 'monthly',
      annual: 'annual',
    }
    const result = activateDemoSubscription(cycleMap[selectedCycle], currentPlan.price)
    if (!result.ok) {
      setFeedback(
        isEn
          ? `Missing $${(result.required - result.available).toFixed(2)} USD in balance. Please top up.`
          : `Faltan $${(result.required - result.available).toFixed(2)} USD en tu saldo. Recarga para continuar.`
      )
      openTopUp()
      return
    }
    setFeedback(
      isEn
        ? `Platinum+ (${currentPlan.name}) subscription activated successfully!`
        : `¡Suscripción Platinum+ (${currentPlan.name}) activada con éxito!`
    )
  }

  const handlePayWithWallet = () => {
    if (!user || user.isAnonymous) {
      openAuthModal('register')
      return
    }
    if (!isEmailVerified) {
      openAuthModal('verify-email')
      return
    }
    onPayWithWallet(`Platinum+ ${currentPlan.name}`, currentPlan.price, 'USD')
  }

  return (
    <div className="subscription-container f5-subscriptions-page" data-testid="f5-subscriptions-page">
      {feedback && (
        <div className="toast" role="status">
          <span>✓</span>
          {feedback}
        </div>
      )}

      <div className="subscription-platinum-card f5-glass-card">
        <div className="subscription-header-banner">
          <div className="subscription-star-wrapper">
            <span className="subscription-star-glow">✦</span>
          </div>
          <p className="eyebrow">{isEn ? 'VIP MEMBERSHIP · PLATINUM+' : 'MEMBRESÍA VIP · PLATINUM+'}</p>
          <h1 className="subscription-platinum-title">Platinum+</h1>
          <p className="subscription-platinum-subtitle">
            {isEn
              ? 'Unlock VIP Platinum I benefits, active power boost and priority withdrawal queue'
              : 'Desbloquea los beneficios VIP de Platinum I, impulso de potencia activa y cola prioritaria'}
          </p>
        </div>

        {/* Membership Pass Box */}
        <div className="subscription-plastic-card-teaser">
          <div className="subscription-card-chip">VIP</div>
          <div className="subscription-card-info">
            <strong>{isEn ? 'PouwMiner VIP Pass' : 'Pase VIP PouwMiner'}</strong>
            <p>{isEn ? 'Included on this plan · Free 2D skins in presale' : 'Incluido en este plan · Skins 2D gratis en preventa'}</p>
          </div>
          <span className="subscription-soon-badge">{isEn ? 'SOON' : 'PRONTO'}</span>
        </div>

        {/* Perks Grid */}
        <div className="subscription-perks-list">
          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">◈</span>
            <div className="subscription-perk-text">
              <strong>
                {isEn ? '+1% boost on active farm power' : '+1% de impulso sobre potencia activa en granja'}
              </strong>
              <small>Platinum+ VIP</small>
            </div>
          </div>

          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">⚙</span>
            <div className="subscription-perk-text">
              <strong>
                {isEn
                  ? '2.1% VIP discount on miner maintenance'
                  : '2.1% de descuento VIP en mantenimiento de mineros'}
              </strong>
            </div>
          </div>

          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">▤</span>
            <div className="subscription-perk-text">
              <strong>{isEn ? 'Priority withdrawal queue' : 'Cola preferencial de retiros'}</strong>
            </div>
          </div>

          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">⚡</span>
            <div className="subscription-perk-text">
              <strong>{isEn ? 'x1.2 Simple earn multiplier' : 'Multiplicador x1.2 en Simple Earn'}</strong>
            </div>
          </div>

          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">◎</span>
            <div className="subscription-perk-text">
              <strong>
                {isEn
                  ? '1.83% fee on getting stablecoins in Instant Funds'
                  : '1.83% de comisión al obtener stablecoins en Fondos Instantáneos'}
              </strong>
            </div>
          </div>

          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">✦</span>
            <div className="subscription-perk-text">
              <strong>
                {isEn
                  ? 'VIP support, clan ownership and reinvestment in TH'
                  : 'Soporte VIP, creación de clanes y reinversión automática en TH'}
              </strong>
            </div>
          </div>
        </div>

        {/* Plan Billing Cycle Selector */}
        <div className="subscription-cycle-selector">
          {(['monthly', 'semiannual', 'annual'] as PlanCycle[]).map((cycle) => {
            const opt = planOptions[cycle]
            const isSelected = selectedCycle === cycle
            return (
              <button
                key={cycle}
                type="button"
                className={`subscription-cycle-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedCycle(cycle)}
              >
                {opt.savings && <span className="subscription-cycle-badge">{opt.savings}</span>}
                <strong className="subscription-cycle-name">{opt.name}</strong>
                <span className="subscription-cycle-price">${opt.price} USD</span>
                <span className="subscription-cycle-period">{opt.perMonth}</span>
              </button>
            )
          })}
        </div>

        {/* Active subscription banner or payment actions */}
        {demo.subscription ? (
          <div className="subscription-active-status-box">
            <div className="subscription-active-indicator">
              <span>●</span>
              <strong>
                {isEn
                  ? `Active subscription (${demo.subscription.cycle === 'monthly' ? 'Monthly' : 'Annual'})`
                  : `Suscripción activa (${demo.subscription.cycle === 'monthly' ? 'Mensual' : 'Anual'})`}
              </strong>
            </div>
            <p>
              {isEn
                ? `Valid until ${demo.subscription.endsAt}. You have +1% boost and priority queue.`
                : `Válida hasta ${demo.subscription.endsAt}. Tienes +1% de potencia activa y retiro preferencial.`}
            </p>
            <button
              type="button"
              className="button button-quiet button-small"
              onClick={() => {
                cancelDemoSubscription()
                setFeedback(isEn ? 'Subscription cancelled.' : 'Suscripción cancelada.')
              }}
            >
              {isEn ? 'Cancel Subscription' : 'Cancelar suscripción'}
            </button>
          </div>
        ) : (
          <div className="subscription-actions-block">
            <div className="subscription-pricing-summary">
              <span>{isEn ? 'Total due today:' : 'Total a pagar hoy:'}</span>
              <strong>${currentPlan.price}.00 USD</strong>
            </div>

            <div className="subscription-payment-buttons">
              <button
                type="button"
                className="button button-primary subscription-pay-btn"
                onClick={handlePayWithWallet}
              >
                {isEn ? '◈ Pay with Connect Wallet' : '◈ Pagar con Connect Wallet'}
              </button>
              <button
                type="button"
                className="button button-secondary subscription-pay-btn"
                onClick={handleActivateWithBalance}
              >
                {isEn
                  ? `Pay with Balance ($${currentPlan.price} USD)`
                  : `Pagar con Saldo ($${currentPlan.price} USD)`}
              </button>
            </div>
            <p className="subscription-disclaimer">
              {isEn
                ? 'Applicable legal documents will be shown after approval.'
                : 'Los documentos legales aplicables se mostrarán después de su aprobación.'}
            </p>
          </div>
        )}
      </div>

      {/* Canonical 22 Power Tiers Matrix (customMinerPriceTiers: price strictly by power, skins free in presale) */}
      <section className="subscription-tiers-panel f5-glass-card" aria-labelledby="subscription-tiers-heading">
        <div className="subscription-tiers-head">
          <div>
            <p className="eyebrow">
              {isEn ? 'PRESALE POWER MATRIX · 22 TIERS' : 'MATRIZ DE POTENCIA PREVENTA · 22 NIVELES'}
            </p>
            <h2 id="subscription-tiers-heading">
              {isEn ? 'Price strictly by TH/s power' : 'Precio definido solo por potencia (TH/s)'}
            </h2>
            <p className="subscription-tiers-sub">
              {isEn
                ? 'All 10 presale skins are included free ($0 USD). Your tier price depends solely on selected TH/s.'
                : 'Las 10 skins de preventa son gratis ($0 USD). El importe depende únicamente de los TH/s elegidos.'}
            </p>
          </div>
          <div className="subscription-tiers-badges">
            <span className="subscription-tier-pill subscription-tier-pill-emerald">
              {isEn ? 'Free skins in presale ($0)' : 'Skins gratis en preventa ($0)'}
            </span>
            <span className="subscription-tier-pill">
              {isEn ? `${customMinerPriceTiers.length} official tiers` : `${customMinerPriceTiers.length} niveles oficiales`}
            </span>
          </div>
        </div>

        <div className="subscription-tiers-grid" data-testid="subscriptions-22-tiers-grid">
          {customMinerPriceTiers.map((tier) => (
            <article
              key={tier.powerTh}
              className="subscription-tier-card"
              data-testid="subscription-tier-item"
              data-power-th={String(tier.powerTh)}
            >
              <div className="subscription-tier-top">
                <strong className="subscription-tier-th">
                  {tier.powerTh.toLocaleString('es-MX')} <small>TH/s</small>
                </strong>
                <span className="subscription-tier-skin-tag">Skin $0</span>
              </div>
              <div className="subscription-tier-price">
                ${tier.priceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small>USD</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
