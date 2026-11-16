import { Link } from 'react-router-dom'
import { oneTimeMinerPlans } from './minerCatalog'
import { usePersonalization } from './personalization'

interface LandingPageProps {
  openAuthModal: (mode?: 'login' | 'register' | 'verify-email') => void
}

export function LandingPage({ openAuthModal }: LandingPageProps) {
  const { t } = usePersonalization()

  return (
    <div className="landing-container">
      {/* HERO SECTION */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-hero-badge">
            <span className="landing-badge-pulse" />
            <span>{t('landing.hero_badge')}</span>
          </div>

          <h1 className="landing-hero-title">
            {t('landing.hero_title_1')}{' '}
            <span className="text-gradient">{t('landing.hero_title_gradient')}</span>{' '}
            {t('landing.hero_title_2')}
          </h1>

          <p className="landing-hero-subtitle">{t('landing.hero_subtitle')}</p>

          <div className="landing-hero-actions">
            <button
              type="button"
              className="landing-btn landing-btn-primary"
              onClick={() => openAuthModal('register')}
            >
              <span>{t('landing.cta_register')}</span>
              <span className="landing-btn-arrow">→</span>
            </button>

            <button
              type="button"
              className="landing-btn landing-btn-secondary"
              onClick={() => openAuthModal('login')}
            >
              {t('landing.cta_login')}
            </button>

            <Link to="/mining-calculator" className="landing-btn landing-btn-outline">
              {t('landing.cta_calculator')}
            </Link>
          </div>

          {/* STATS RIBBON */}
          <div className="landing-stats-ribbon">
            <div className="landing-stat-card">
              <span className="landing-stat-value">+9</span>
              <span className="landing-stat-label">{t('landing.stat_datacenters')}</span>
            </div>
            <div className="landing-stat-divider" />
            <div className="landing-stat-card">
              <span className="landing-stat-value">100%</span>
              <span className="landing-stat-label">{t('landing.stat_payouts')}</span>
            </div>
            <div className="landing-stat-divider" />
            <div className="landing-stat-card">
              <span className="landing-stat-value">20-35</span>
              <span className="landing-stat-label">{t('landing.stat_efficiency')}</span>
            </div>
            <div className="landing-stat-divider" />
            <div className="landing-stat-card">
              <span className="landing-stat-value">10%</span>
              <span className="landing-stat-label">{t('landing.stat_referrals')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section className="landing-section">
        <div className="landing-section-header">
          <p className="eyebrow">{t('landing.how_it_works_eyebrow')}</p>
          <h2>{t('landing.how_it_works_title')}</h2>
          <p className="landing-section-sub">{t('landing.how_it_works_sub')}</p>
        </div>

        <div className="landing-steps-grid">
          <div className="landing-step-card">
            <div className="landing-step-num">01</div>
            <h3>{t('landing.step_1_title')}</h3>
            <p>{t('landing.step_1_desc')}</p>
          </div>

          <div className="landing-step-card">
            <div className="landing-step-num">02</div>
            <h3>{t('landing.step_2_title')}</h3>
            <p>{t('landing.step_2_desc')}</p>
          </div>

          <div className="landing-step-card">
            <div className="landing-step-num">03</div>
            <h3>{t('landing.step_3_title')}</h3>
            <p>{t('landing.step_3_desc')}</p>
          </div>
        </div>
      </section>

      {/* PROJECT VISION */}
      <section id="vision-pearl" className="landing-section landing-anchor-section" aria-labelledby="landing-vision-title">
        <div className="landing-section-header">
          <p className="eyebrow">{t('landing.vision_eyebrow')}</p>
          <h2 id="landing-vision-title">{t('landing.vision_title')}</h2>
          <p className="landing-section-sub">{t('landing.vision_sub')}</p>
        </div>

        <div className="landing-info-grid">
          <article className="landing-info-card">
            <span className="landing-info-index">01</span>
            <h3>{t('landing.vision_1_title')}</h3>
            <p>{t('landing.vision_1_desc')}</p>
          </article>
          <article className="landing-info-card">
            <span className="landing-info-index">02</span>
            <h3>{t('landing.vision_2_title')}</h3>
            <p>{t('landing.vision_2_desc')}</p>
          </article>
          <article className="landing-info-card">
            <span className="landing-info-index">03</span>
            <h3>{t('landing.vision_3_title')}</h3>
            <p>{t('landing.vision_3_desc')}</p>
          </article>
        </div>

        <p className="landing-disclosure">{t('landing.disclosure')}</p>
      </section>

      {/* POPULAR MINERS CATALOG SECTION */}
      <section className="landing-section">
        <div className="landing-section-header">
          <p className="eyebrow">{t('landing.catalog_eyebrow')}</p>
          <h2>{t('landing.catalog_title')}</h2>
          <p className="landing-section-sub">{t('landing.catalog_sub')}</p>
        </div>

        <div className="landing-miners-grid">
          {oneTimeMinerPlans.map((plan, index) => {
            const isFeatured = index === 1
            const efficiency = index === 0 ? '35 W/TH' : index === 1 ? '28 W/TH' : '20 W/TH'
            return (
              <div key={plan.id} className={`landing-miner-card ${isFeatured ? 'featured' : ''}`}>
                {isFeatured && <div className="landing-card-badge">{t('landing.catalog_badge')}</div>}
                <div className="landing-miner-visual">
                  <div className="miner-cube-icon">▦</div>
                  <div className="miner-power-tag">{plan.powerTh.toFixed(2)} TH/s</div>
                </div>

                <h3 className="landing-miner-title">
                  {t('landing.miner_prefix')} {plan.label}
                </h3>
                <p className="landing-miner-efficiency">
                  {t('landing.efficiency_label')} <strong>{efficiency}</strong>
                </p>

                <div className="landing-miner-pricing">
                  <span className="miner-price">
                    ${plan.price.toFixed(2)} {plan.currency}
                  </span>
                  <span className="miner-cadence">{t('landing.one_time_payment')}</span>
                </div>

                <ul className="landing-miner-perks">
                  <li>
                    <span>✓</span> {t('landing.perk_hardware')}
                  </li>
                  <li>
                    <span>✓</span> {t('landing.perk_daily_btc')}
                  </li>
                  <li>
                    <span>✓</span> {t('landing.perk_liquid_nft')}
                  </li>
                  <li>
                    <span>✓</span> {t('landing.perk_maintenance')}
                  </li>
                </ul>

                <button
                  type="button"
                  className={`landing-btn ${
                    isFeatured ? 'landing-btn-primary' : 'landing-btn-secondary'
                  } full-width`}
                  onClick={() => openAuthModal('register')}
                >
                  {t('landing.start_miner_btn')}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* PROFITABILITY CALCULATOR TEASER */}
      <section className="landing-section">
        <div className="landing-calc-banner">
          <div className="landing-calc-info">
            <span className="landing-calc-icon">∑</span>
            <div>
              <p className="eyebrow">{t('landing.calc_eyebrow')}</p>
              <h2>{t('landing.calc_title')}</h2>
              <p>{t('landing.calc_desc')}</p>
            </div>
          </div>
          <Link to="/mining-calculator" className="landing-btn landing-btn-primary">
            {t('landing.calc_btn')}
          </Link>
        </div>
      </section>

      {/* VALUE PROPOSITION GRID */}
      <section className="landing-section">
        <div className="landing-section-header">
          <p className="eyebrow">{t('landing.feat_eyebrow')}</p>
          <h2>{t('landing.feat_title')}</h2>
          <p className="landing-section-sub">{t('landing.feat_sub')}</p>
        </div>

        <div className="landing-features-grid">
          <div className="landing-feature-card">
            <div className="landing-feat-icon">⚡</div>
            <h3>{t('landing.feat_1_title')}</h3>
            <p>{t('landing.feat_1_desc')}</p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feat-icon">♧</div>
            <h3>{t('landing.feat_2_title')}</h3>
            <p>{t('landing.feat_2_desc')}</p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feat-icon">🌐</div>
            <h3>{t('landing.feat_3_title')}</h3>
            <p>{t('landing.feat_3_desc')}</p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feat-icon">💎</div>
            <h3>{t('landing.feat_4_title')}</h3>
            <p>{t('landing.feat_4_desc')}</p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feat-icon">🛡️</div>
            <h3>{t('landing.feat_5_title')}</h3>
            <p>{t('landing.feat_5_desc')}</p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feat-icon">✧</div>
            <h3>{t('landing.feat_6_title')}</h3>
            <p>{t('landing.feat_6_desc')}</p>
          </div>
        </div>
      </section>

      {/* WHO WE ARE */}
      <section id="quienes-somos" className="landing-section landing-anchor-section" aria-labelledby="landing-about-title">
        <div className="landing-section-header">
          <p className="eyebrow">{t('landing.about_eyebrow')}</p>
          <h2 id="landing-about-title">{t('landing.about_title')}</h2>
          <p className="landing-section-sub">{t('landing.about_sub')}</p>
        </div>

        <div className="landing-info-grid">
          <article className="landing-info-card">
            <span className="landing-info-index">01</span>
            <h3>{t('landing.about_1_title')}</h3>
            <p>{t('landing.about_1_desc')}</p>
          </article>
          <article className="landing-info-card">
            <span className="landing-info-index">02</span>
            <h3>{t('landing.about_2_title')}</h3>
            <p>{t('landing.about_2_desc')}</p>
          </article>
          <article className="landing-info-card">
            <span className="landing-info-index">03</span>
            <h3>{t('landing.about_3_title')}</h3>
            <p>{t('landing.about_3_desc')}</p>
          </article>
        </div>
      </section>

      {/* ROADMAP */}
      <section id="roadmap" className="landing-section landing-anchor-section" aria-labelledby="landing-roadmap-title">
        <div className="landing-section-header">
          <p className="eyebrow">{t('landing.roadmap_eyebrow')}</p>
          <h2 id="landing-roadmap-title">{t('landing.roadmap_title')}</h2>
          <p className="landing-section-sub">{t('landing.roadmap_sub')}</p>
        </div>

        <div className="landing-roadmap" role="list">
          <article className="landing-roadmap-item" role="listitem">
            <span className="landing-roadmap-marker">01</span>
            <div><h3>{t('landing.roadmap_1_title')}</h3><p>{t('landing.roadmap_1_desc')}</p></div>
          </article>
          <article className="landing-roadmap-item" role="listitem">
            <span className="landing-roadmap-marker">02</span>
            <div><h3>{t('landing.roadmap_2_title')}</h3><p>{t('landing.roadmap_2_desc')}</p></div>
          </article>
          <article className="landing-roadmap-item" role="listitem">
            <span className="landing-roadmap-marker">03</span>
            <div><h3>{t('landing.roadmap_3_title')}</h3><p>{t('landing.roadmap_3_desc')}</p></div>
          </article>
          <article className="landing-roadmap-item" role="listitem">
            <span className="landing-roadmap-marker">04</span>
            <div><h3>{t('landing.roadmap_4_title')}</h3><p>{t('landing.roadmap_4_desc')}</p></div>
          </article>
          <article className="landing-roadmap-item" role="listitem">
            <span className="landing-roadmap-marker">05</span>
            <div><h3>{t('landing.roadmap_5_title')}</h3><p>{t('landing.roadmap_5_desc')}</p></div>
          </article>
          <article className="landing-roadmap-item" role="listitem">
            <span className="landing-roadmap-marker">06</span>
            <div><h3>{t('landing.roadmap_6_title')}</h3><p>{t('landing.roadmap_6_desc')}</p></div>
          </article>
          <article className="landing-roadmap-item" role="listitem">
            <span className="landing-roadmap-marker">07</span>
            <div><h3>{t('landing.roadmap_7_title')}</h3><p>{t('landing.roadmap_7_desc')}</p></div>
          </article>
        </div>

        <p className="landing-disclosure">{t('landing.roadmap_disclosure')}</p>
      </section>

      {/* FINAL CALL TO ACTION BANNER */}
      <section className="landing-cta-section">
        <div className="landing-cta-card">
          <div className="landing-cta-content">
            <h2>{t('landing.cta_title')}</h2>
            <p>{t('landing.cta_desc')}</p>
            <div className="landing-cta-buttons">
              <button
                type="button"
                className="landing-btn landing-btn-primary"
                onClick={() => openAuthModal('register')}
              >
                {t('landing.cta_btn_primary')}
              </button>
              <button
                type="button"
                className="landing-btn landing-btn-secondary"
                onClick={() => openAuthModal('login')}
              >
                {t('landing.cta_btn_secondary')}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
