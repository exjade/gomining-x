import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePersonalization } from '../personalization'
import { useRealtimeUserMiners } from '../userMinersStore'
import { MinerAppearancePreview } from './MinerAppearancePreview'
import { customizationMinerFromStored, type MinerCustomizationMiner } from './miner-customization-model'

export function MinerFarm({ openMinerBuilder, uid, minersOverride }: { openMinerBuilder: () => void; uid: string; minersOverride?: readonly MinerCustomizationMiner[] }) {
  const { t } = usePersonalization()
  const realtime = useRealtimeUserMiners(minersOverride ? undefined : uid)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [applied, setApplied] = useState(false)
  const displayMiners = useMemo(() => minersOverride ?? realtime.miners.map(customizationMinerFromStored), [minersOverride, realtime.miners])
  const loading = minersOverride ? false : realtime.loading
  const miners = displayMiners
  const totalPowerTh = miners.reduce((total, miner) => total + miner.powerTh, 0)
  const efficiencyValues = miners
    .map((miner) => miner.efficiency)
    .filter((efficiency) => Number.isFinite(efficiency))
  const averageEfficiency = efficiencyValues.length > 0
    ? efficiencyValues.reduce((total, efficiency) => total + efficiency, 0) / efficiencyValues.length
    : null

  return (
    <div className="miner-page-stack pwm-miner-page-stack f5-miner-farm" data-authenticated-miner-farm="true" data-testid="f5-miner-farm">
      <section className="pwm-mining-farm f5-glass-card">
        <div className="pwm-farm-header">
          <div>
            <h2>{t('minerCustomization.farmTitle')}</h2>
          </div>
          <div className="pwm-farm-header-actions">
            <button className="pwm-button pwm-button-muted" type="button" disabled aria-label={t('minerCustomization.service')}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14.6 6.2 3.2-3.2a5.5 5.5 0 0 1-7.3 7.3L4 16.8a2.3 2.3 0 0 0 3.2 3.2l6.5-6.5a5.5 5.5 0 0 0 7.3-7.3l-3.2 3.2z"/><circle cx="5.5" cy="18.5" r=".7"/></svg>{t('minerCustomization.service')}</button>
            <button className="pwm-button pwm-button-muted" type="button" disabled aria-label={t('minerCustomization.settings')}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9.7 2.8 10.3 1h3.4l.6 1.8 2 .8 1.7-1 2.4 2.4-1 1.7.8 2 1.8.6v3.4l-1.8.6-.8 2 1 1.7-2.4 2.4-1.7-1-2 .8-.6 1.8h-3.4l-.6-1.8-2-.8-1.7 1-2.4-2.4 1-1.7-.8-2L2 12.7V9.3l1.8-.6.8-2-1-1.7L6 2.6l1.7 1z"/><circle cx="12" cy="11" r="3.2"/></svg>{t('minerCustomization.settings')}</button>
          </div>
        </div>
        <div className="pwm-farm-metrics">
          <div className="pwm-farm-metric"><span className="pwm-farm-metric-icon pwm-farm-icon-miners"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3M4.8 4.8l2.1 2.1m10.2 10.2 2.1 2.1m0-14.4-2.1 2.1M6.9 17.1l-2.1 2.1"/></svg></span><span><small>{t('minerCustomization.miners').toUpperCase()}</small><strong>{miners.length}</strong></span><button type="button" aria-label={t('minerCustomization.createMiner')} onClick={openMinerBuilder}>＋</button></div>
          <div className="pwm-farm-metric"><span className="pwm-farm-metric-icon pwm-farm-icon-power"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M13.4 1.8 4.5 13h6l-.1 9.2L19.5 11h-6.1z" fill="currentColor" stroke="none"/></svg></span><span><small>{t('minerCustomization.power').toUpperCase()}</small><strong>{totalPowerTh.toFixed(2)} TH</strong></span></div>
          <div className="pwm-farm-metric"><span className="pwm-farm-metric-icon pwm-farm-icon-efficiency"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 2v5m8-5v5M6 7h12v4a6 6 0 0 1-5 5.9V22h-2v-5.1A6 6 0 0 1 6 11z" fill="currentColor" stroke="none"/></svg></span><span><small>{t('minerCustomization.efficiency').toUpperCase()}</small><strong>{averageEfficiency === null ? '—' : `${averageEfficiency.toFixed(0)} W/TH`}</strong></span></div>
          <div className="pwm-farm-metric"><span className="pwm-farm-metric-icon pwm-farm-icon-discount"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 2 2.2 2 3-.4 1.1 2.8 2.8 1.1-.4 3 2 2.2-2 2.2.4 3-2.8 1.1-1.1 2.8-3-.4-2.2-2-3 .4-1.1-2.8-2.8-1.1.4-3-2-2.2-2-2.2-.4-3 2.8-1.1 1.1-2.8 3 .4z"/><circle cx="9" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1" fill="currentColor" stroke="none"/><path d="m15.8 8.2-7.6 7.6"/></svg></span><span><small>{t('minerCustomization.discount').toUpperCase()}</small><strong title={t('minerCustomization.metricUnavailable')}>—</strong></span><button type="button" aria-label={t('minerCustomization.metricUnavailable')} disabled>＋</button></div>
        </div>
      </section>
      <div className="pwm-farm-banner f5-glass-card"><span className="pwm-farm-banner-mark">P</span><span><strong>{t('minerCustomization.bannerTitle')}</strong><small>{t('minerCustomization.bannerDescription')}</small></span><span aria-hidden="true">›</span></div>
      <section className="pwm-farm-miners f5-glass-card">
        <div className="pwm-farm-miners-heading"><h2>{t('minerCustomization.miners')} <span>{miners.length}</span></h2><div className="pwm-farm-tools">
          <button type="button" aria-label={t('minerCustomization.filters')} onClick={() => setFiltersOpen((open) => !open)}>☷</button>
          <button type="button" aria-label={t('minerCustomization.refresh')} disabled>⟳</button>
          <button type="button" aria-label={t('minerCustomization.history')} disabled>◷</button>
          <button type="button" aria-label={t('minerCustomization.download')} disabled>⇩</button>
        </div></div>
        {filtersOpen && <div className="miner-filter-panel"><label className="search-box"><span>⌕</span><input placeholder="Buscar mineros" /></label><button className="filter-chip">Estado <span>⌄</span></button><button className="filter-chip">Colección <span>⌄</span></button><button className="button button-primary button-small" onClick={() => setApplied(true)}>Aplicar</button><button className="button button-quiet button-small" onClick={() => { setApplied(false); setFiltersOpen(false) }}>Limpiar</button></div>}
        {applied && <div className="filter-applied">Filtros aplicados en esta vista.</div>}
        {loading ? (
          <div className="f5-skeleton-grid" aria-busy="true" aria-label={t('minerCustomization.loading')}>
            <div className="f5-skeleton-card"><span className="f5-skeleton-line" /><strong>{t('minerCustomization.loading')}</strong></div>
            <div className="f5-skeleton-card" aria-hidden="true" />
            <div className="f5-skeleton-card" aria-hidden="true" />
          </div>
        ) : displayMiners.length === 0 ? (
          <div className="pwm-farm-empty">
            <div className="pwm-farm-empty-icon">▧</div>
            <div className="pwm-farm-empty-content">
              <strong>{t('minerCustomization.emptyTitle')}</strong>
              <p>{t('minerCustomization.emptyDescription')}</p>
              <div className="pwm-farm-empty-actions">
                <button className="pwm-button pwm-button-primary" type="button" onClick={openMinerBuilder}>{t('minerCustomization.createMiner')} <span>↗</span></button>
              </div>
            </div>
          </div>
        ) : (
          <div className="pwm-miner-grid" data-testid="f5-miner-farm-2d-grid">
            {displayMiners.map((miner) => (
              <Link
                className="pwm-miner-tile"
                key={miner.id}
                to={`/nft-miners/${encodeURIComponent(miner.id)}`}
                aria-label={t('minerCustomization.openMiner').replace('{name}', miner.name)}
                data-miner-id={miner.id}
              >
                <MinerAppearancePreview miner={miner} compact />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
