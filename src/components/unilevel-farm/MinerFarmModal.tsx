import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { FarmEraArt } from './FarmEraArt'
import {
  TOTAL_UNILEVEL_FARMS,
  filterFarmReferrals,
  shortenSourceUid,
  type FarmModalReferralFilter,
  type UnilevelFarmLevelModel,
} from './unilevelFarmModel'

export interface MinerFarmModalProps {
  farm: UnilevelFarmLevelModel | null
  inviteUrl: string
  isOpen: boolean
  isEn?: boolean
  onClose: () => void
  onCopyInvite: (url: string) => void
}

export function MinerFarmModal({
  farm,
  inviteUrl,
  isOpen,
  isEn = false,
  onClose,
  onCopyInvite,
}: MinerFarmModalProps): ReactElement | null {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FarmModalReferralFilter>('all')

  useEffect(() => {
    if (!isOpen) return
    setSearch('')
    setFilter('all')
  }, [isOpen, farm?.level])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    const prevOverflow = typeof document !== 'undefined' ? document.body.style.overflow : ''
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden'
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow
      }
    }
  }, [isOpen, onClose])

  const filteredReferrals = useMemo(() => {
    if (!farm) return []
    return filterFarmReferrals(farm.referrals, { search, filter })
  }, [farm, search, filter])

  if (!isOpen || !farm) return null

  const eraName = isEn ? farm.era.nameEn : farm.era.nameEs
  const isFarmActive = farm.state === 'active'
  const statusText = isFarmActive
    ? isEn
      ? 'Active'
      : 'Activa'
    : isEn
      ? 'Unlocked · Empty'
      : 'Desbloqueada · Vacía'

  const modalContent = (
    <div
      className="ufm-overlay is-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ufm-modal-title"
      data-testid="unilevel-farm-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="ufm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ufm-modal-scene">
          <FarmEraArt level={farm.level} idPrefix="modal" lit={isFarmActive} />
          <button
            type="button"
            className="ufm-modal-close"
            onClick={onClose}
            aria-label={isEn ? 'Close farm modal' : 'Cerrar modal de granja'}
            data-testid="unilevel-farm-modal-close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>

        <div className="ufm-modal-head">
          <div className="ufm-modal-title-row">
            <h2 id="ufm-modal-title">
              {isEn ? `Farm ${farm.level}` : `Granja ${farm.level}`} · {farm.farmName}
            </h2>
            <span className={`ufm-chip ${isFarmActive ? 'ufm-chip--active' : 'ufm-chip--empty'}`}>
              {statusText}
            </span>
          </div>
          <p className="ufm-modal-sub">
            {eraName} · {isEn ? `Level ${farm.level} of your Unilevel network` : `Nivel ${farm.level} de tu red Unilevel`} ·{' '}
            {isEn ? 'Protocol rate' : 'Tasa protocolo'} <strong>{farm.pctLabel}</strong>
          </p>

          <div className="ufm-modal-stats">
            <div className="ufm-modal-stat">
              <div className="ufm-modal-stat-k">
                {isEn ? 'Referrals (with commission)' : 'Referidos (con comisión)'}
              </div>
              <div className="ufm-modal-stat-v" data-testid="unilevel-farm-modal-refs-count">
                {farm.sourceUserCount}
              </div>
            </div>
            <div className="ufm-modal-stat">
              <div className="ufm-modal-stat-k">
                {isEn ? 'Level Net Earned' : 'Ganancia del nivel'}
              </div>
              <div className="ufm-modal-stat-v ufm-modal-stat-v--green" data-testid="unilevel-farm-modal-earned">
                ${farm.totalEarnedUsdt2}
              </div>
              <div className="ufm-modal-stat-micro">${farm.totalEarnedUsdt6} USDT</div>
            </div>
            <div className="ufm-modal-stat">
              <div className="ufm-modal-stat-k">
                {isEn ? 'UNILEVEL_V1 Rate' : 'Tasa UNILEVEL_V1'}
              </div>
              <div className="ufm-modal-stat-v" data-testid="unilevel-farm-modal-rate">
                {farm.pctLabel}
              </div>
              <div className="ufm-modal-stat-micro">
                {farm.commissionEntriesCount}{' '}
                {isEn ? 'ledger entries' : 'registros en ledger'}
              </div>
            </div>
          </div>
        </div>

        <div className="ufm-invite">
          <div className="ufm-invite-box" title={inviteUrl} data-testid="unilevel-farm-modal-invite-link">
            {inviteUrl}
          </div>
          <button
            type="button"
            className="ufm-invite-btn"
            onClick={() => onCopyInvite(inviteUrl)}
            data-testid="unilevel-farm-modal-copy-btn"
          >
            {isEn ? 'Copy invite link' : 'Copiar enlace'}
          </button>
        </div>

        <div className="ufm-modal-tools">
          <div className="ufm-search">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.8-3.8" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isEn ? 'Search UID or date…' : 'Buscar por UID o fecha…'}
              aria-label={isEn ? 'Search referral by UID or date' : 'Buscar referido por UID o fecha'}
              data-testid="unilevel-farm-modal-search"
            />
          </div>
          <button
            type="button"
            className={`ufm-filter-btn ${filter === 'all' ? 'is-on' : ''}`}
            onClick={() => setFilter('all')}
          >
            {isEn ? 'All' : 'Todos'}
          </button>
          <button
            type="button"
            className={`ufm-filter-btn ${filter === 'positive' ? 'is-on' : ''}`}
            onClick={() => setFilter('positive')}
          >
            {isEn ? 'Net Credited' : 'Con ganancia'}
          </button>
          <button
            type="button"
            className={`ufm-filter-btn ${filter === 'reversed' ? 'is-on' : ''}`}
            onClick={() => setFilter('reversed')}
          >
            {isEn ? 'With Reversal' : 'Con reverso'}
          </button>
        </div>

        <div className="ufm-ref-list" data-testid="unilevel-farm-modal-referrals">
          {farm.sourceUserCount === 0 ? (
            <div className="ufm-empty-state" data-testid="unilevel-farm-modal-empty">
              <div className="ufm-empty-big">
                {isEn
                  ? 'This farm is unlocked and ready, with zero commissions yet'
                  : 'Esta granja está desbloqueada y lista, aún sin comisiones'}
              </div>
              <p>
                {farm.level < TOTAL_UNILEVEL_FARMS
                  ? isEn
                    ? `Share your real invite link. As soon as at least 1 referred UID generates a settled commission in Level ${farm.level}, Farm ${farm.level + 1} unlocks automatically in chain.`
                    : `Comparte tu enlace real de invitación. En cuanto al menos 1 UID referido acredite comisión en el Nivel ${farm.level}, se desbloqueará en cadena la Granja ${farm.level + 1}.`
                  : isEn
                    ? 'Level 20 reached. Commissions settled at this tier appear here grouped by sourceUserId.'
                    : 'Nivel 20 alcanzado. Las comisiones liquidadas en este nivel aparecerán aquí agrupadas por sourceUserId.'}
              </p>
            </div>
          ) : filteredReferrals.length === 0 ? (
            <div className="ufm-empty-state">
              <div className="ufm-empty-big">{isEn ? 'No matches' : 'Sin resultados'}</div>
              <p>
                {isEn
                  ? 'No sourceUserId in this level matches your current filter.'
                  : 'Ningún sourceUserId en este nivel coincide con ese filtro.'}
              </p>
            </div>
          ) : (
            <>
              {filteredReferrals.map((ref) => (
                <div
                  key={ref.sourceUserId}
                  className={`ufm-ref-row ${ref.hasPositiveNet ? '' : 'is-inactive'}`}
                  data-testid={`unilevel-farm-ref-${ref.sourceUserId}`}
                >
                  <div className="ufm-avatar" aria-hidden="true">
                    {ref.avatarCode}
                  </div>
                  <div className="ufm-ref-main">
                    <div className="ufm-ref-uid">
                      <code>UID {ref.shortUid}</code>
                    </div>
                    <div className="ufm-ref-meta">
                      <span>
                        {isEn ? 'Last date:' : 'Fecha:'} <strong>{ref.latestDate ?? '—'}</strong>
                      </span>
                      <span>
                        {ref.creditedCount}{' '}
                        {isEn
                          ? ref.creditedCount === 1
                            ? 'credit'
                            : 'credits'
                          : ref.creditedCount === 1
                            ? 'acreditación'
                            : 'acreditaciones'}
                      </span>
                      {ref.minerIds.length > 0 && (
                        <span>
                          {isEn ? 'Miner:' : 'Minero:'} <code>{shortenSourceUid(ref.minerIds[0])}</code>
                        </span>
                      )}
                      <span>
                        <span className={`ufm-dot ${ref.hasPositiveNet ? 'is-on' : 'is-off'}`} />
                        {ref.hasPositiveNet
                          ? isEn
                            ? 'Credited'
                            : 'Acreditado'
                          : isEn
                            ? 'Reversed / $0'
                            : 'Revertido / $0'}
                      </span>
                    </div>
                  </div>
                  <div className="ufm-ref-earn">
                    <div className="ufm-ref-amt">
                      {ref.totalEarnedMicros >= 0n ? `+$${ref.totalEarnedUsdt2}` : `-$${ref.totalEarnedUsdt2.replace(/^-/, '')}`}
                    </div>
                    <div className="ufm-ref-cur">${ref.totalEarnedUsdt6} USDT</div>
                  </div>
                </div>
              ))}
              <div className="ufm-list-end">
                {isEn
                  ? `Grouped by real sourceUserId · ${filteredReferrals.length} of ${farm.sourceUserCount} UIDs`
                  : `Agrupados por sourceUserId real · ${filteredReferrals.length} de ${farm.sourceUserCount} UIDs`}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body)
  }
  return modalContent
}
