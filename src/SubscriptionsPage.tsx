import { useState } from 'react'
import { useDemoSession, activateDemoSubscription, cancelDemoSubscription } from './demoStore'
import { useAuth } from './AuthContext'
import { usePersonalization } from './personalization'
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

  type PlanCycle = 'monthly' | 'semiannual' | 'annual'
  const [selectedCycle, setSelectedCycle] = useState<PlanCycle>('monthly')
  const [feedback, setFeedback] = useState('')

  const planOptions: Record<
    PlanCycle,
    { name: string; price: number; period: string; savings?: string; perMonth: string }
  > = {
    monthly: {
      name: language === 'en' ? 'Monthly' : 'Mensual',
      price: 30,
      period: language === 'en' ? 'Billed every month' : 'Cobro cada mes',
      perMonth: language === 'en' ? '$30 / mo' : '$30 / mes',
    },
    semiannual: {
      name: language === 'en' ? 'Semiannual' : 'Semestral',
      price: 180,
      period: language === 'en' ? 'Billed every 6 months' : 'Cobro cada 6 meses',
      perMonth: language === 'en' ? '$30 / mo' : '$30 / mes',
    },
    annual: {
      name: language === 'en' ? 'Annual' : 'Anual',
      price: 324,
      period: language === 'en' ? 'Billed every year' : 'Cobro cada año',
      savings: language === 'en' ? '10% savings' : '10% de ahorro',
      perMonth: language === 'en' ? '$27 / mo' : '$27 / mes',
    },
  }

  const currentPlan = planOptions[selectedCycle]

  const handleActivateWithBalance = () => {
    const cycleMap: Record<PlanCycle, 'monthly' | 'annual'> = {
      monthly: 'monthly',
      semiannual: 'monthly',
      annual: 'annual',
    }
    const result = activateDemoSubscription(cycleMap[selectedCycle], currentPlan.price)
    if (!result.ok) {
      setFeedback(
        language === 'en'
          ? `Missing $${(result.required - result.available).toFixed(2)} USD in balance. Please top up.`
          : `Faltan $${(result.required - result.available).toFixed(2)} USD en tu saldo. Recarga para continuar.`
      )
      openTopUp()
      return
    }
    setFeedback(
      language === 'en'
        ? `Platinum+ (${currentPlan.name}) subscription activated successfully!`
        : `¡Suscripción Platinum+ (${currentPlan.name}) activada con éxito!`
    )
  }

  const handlePayWithWallet = () => {
    if (!user) {
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
    <div className="subscription-container">
      {feedback && (
        <div className="toast" role="status">
          <span>✓</span>
          {feedback}
        </div>
      )}

      <div className="subscription-platinum-card">
        <div className="subscription-header-banner">
          <div className="subscription-star-wrapper">
            <span className="subscription-star-glow">✦</span>
          </div>
          <h1 className="subscription-platinum-title">Platinum+</h1>
          <p className="subscription-platinum-subtitle">
            {language === 'en'
              ? 'Unlock VIP Platinum I benefits and exclusive extras'
              : 'Desbloquea los beneficios VIP de Platinum I y extras exclusivos'}
          </p>
        </div>

        {/* GoMining Physical Card Preview Box */}
        <div className="subscription-plastic-card-teaser">
          <div className="subscription-card-chip">VISA</div>
          <div className="subscription-card-info">
            <strong>{language === 'en' ? 'Plastic GoMining card' : 'Tarjeta física GoMining'}</strong>
            <p>{language === 'en' ? 'Free on this plan' : 'Gratis en este plan'}</p>
          </div>
          <span className="subscription-soon-badge">{language === 'en' ? 'SOON' : 'PRONTO'}</span>
        </div>

        {/* Perks List */}
        <div className="subscription-perks-list">
          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">⚔</span>
            <div className="subscription-perk-text">
              <strong>
                {language === 'en' ? '15% off spells in Miner Wars' : '15% de descuento en hechizos de Miner Wars'}
              </strong>
              <small>Platinum+ only</small>
            </div>
          </div>

          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">⚙</span>
            <div className="subscription-perk-text">
              <strong>
                {language === 'en'
                  ? '2.1% VIP discount on miner maintenance'
                  : '2.1% de descuento VIP en mantenimiento de mineros'}
              </strong>
            </div>
          </div>

          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">💳</span>
            <div className="subscription-perk-text">
              <strong>{language === 'en' ? '2% card hashback' : '2% de hashback con tarjeta'}</strong>
            </div>
          </div>

          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">⚡</span>
            <div className="subscription-perk-text">
              <strong>{language === 'en' ? 'x1.2 Simple earn multiplier' : 'Multiplicador x1.2 en Simple Earn'}</strong>
            </div>
          </div>

          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">✈</span>
            <div className="subscription-perk-text">
              <strong>
                {language === 'en'
                  ? '2.8% Travel cashback in mining power'
                  : '2.8% de cashback en viajes convertido en potencia'}
              </strong>
            </div>
          </div>

          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">◎</span>
            <div className="subscription-perk-text">
              <strong>
                {language === 'en'
                  ? '1.83% fee on getting stablecoins in Instant Funds'
                  : '1.83% de comisión al obtener stablecoins en Fondos Instantáneos'}
              </strong>
            </div>
          </div>

          <div className="subscription-perk-row">
            <span className="subscription-perk-icon">✦</span>
            <div className="subscription-perk-text">
              <strong>
                {language === 'en'
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
                {language === 'en'
                  ? `Active subscription (${demo.subscription.cycle === 'monthly' ? 'Monthly' : 'Annual'})`
                  : `Suscripción activa (${demo.subscription.cycle === 'monthly' ? 'Mensual' : 'Anual'})`}
              </strong>
            </div>
            <p>
              {language === 'en'
                ? `Valid until ${demo.subscription.endsAt}. You have +1% boost and priority queue.`
                : `Válida hasta ${demo.subscription.endsAt}. Tienes +1% de potencia activa y retiro preferencial.`}
            </p>
            <button
              type="button"
              className="button button-quiet button-small"
              onClick={() => {
                cancelDemoSubscription()
                setFeedback(language === 'en' ? 'Subscription cancelled.' : 'Suscripción cancelada.')
              }}
            >
              {language === 'en' ? 'Cancel Subscription' : 'Cancelar suscripción'}
            </button>
          </div>
        ) : (
          <div className="subscription-actions-block">
            <div className="subscription-pricing-summary">
              <span>{language === 'en' ? 'Total due today:' : 'Total a pagar hoy:'}</span>
              <strong>${currentPlan.price}.00 USD</strong>
            </div>

            <div className="subscription-payment-buttons">
              <button
                type="button"
                className="button button-primary subscription-pay-btn"
                onClick={handlePayWithWallet}
              >
                {language === 'en' ? '◈ Pay with Connect Wallet' : '◈ Pagar con Connect Wallet'}
              </button>
              <button
                type="button"
                className="button button-secondary subscription-pay-btn"
                onClick={handleActivateWithBalance}
              >
                {language === 'en'
                  ? `Pay with Balance ($${currentPlan.price} USD)`
                  : `Pagar con Saldo ($${currentPlan.price} USD)`}
              </button>
            </div>
            <p className="subscription-disclaimer">
              {language === 'en'
                ? 'By subscribing you accept the GoMining Terms of Service and Privacy Policy.'
                : 'Al suscribirte aceptas los Términos de Servicio y la Política de Privacidad de GoMining.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
