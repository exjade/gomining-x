import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { FarmEraArt, FarmLockIcon, FarmLockMiniIcon } from './FarmEraArt'
import { MinerFarmModal } from './MinerFarmModal'
import {
  UNILEVEL_FARM_ERAS,
  buildUnilevelFarmSummary,
  type UnilevelCommissionInput,
  type UnilevelScheduleItem,
  type UnilevelStatsHeaderInput,
} from './unilevelFarmModel'

export interface MinerFarmMapProps {
  stats: UnilevelStatsHeaderInput | null
  schedule: readonly UnilevelScheduleItem[]
  receivedCommissions: readonly UnilevelCommissionInput[]
  inviteUrl: string
  referralCode: string
  loading?: boolean
  isEn?: boolean
  onCopyInvite: (text: string, label: string) => void
  onSync?: () => void
}

function formatStatUsdt2(value: number | undefined | null): string {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function MinerFarmMap({
  stats,
  schedule,
  receivedCommissions,
  inviteUrl,
  referralCode,
  loading = false,
  isEn = false,
  onCopyInvite,
  onSync,
}: MinerFarmMapProps): ReactElement {
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null)
  const [shakingLevel, setShakingLevel] = useState<number | null>(null)
  const [lockToast, setLockToast] = useState<string>('')

  const summary = useMemo(
    () =>
      buildUnilevelFarmSummary({
        stats,
        schedule,
        receivedCommissions,
      }),
    [stats, schedule, receivedCommissions],
  )

  const selectedFarm = useMemo(
    () => (selectedLevel ? summary.farms.find((f) => f.level === selectedLevel) ?? null : null),
    [selectedLevel, summary.farms],
  )

  const triggerLockToast = useCallback((msg: string) => {
    setLockToast(msg)
    window.setTimeout(() => {
      setLockToast((prev) => (prev === msg ? '' : prev))
    }, 2800)
  }, [])

  const handleFarmClick = useCallback(
    (level: number) => {
      const farm = summary.farms[level - 1]
      if (!farm) return
      if (farm.state === 'locked') {
        setShakingLevel(null)
        window.requestAnimationFrame(() => setShakingLevel(level))
        window.setTimeout(() => setShakingLevel((cur) => (cur === level ? null : cur)), 500)
        triggerLockToast(
          isEn
            ? `Farm ${level} locked: requires at least 1 referred UID with commission in Farm ${level - 1}`
            : `Granja ${level} bloqueada: necesitas al menos 1 referido con comisión en la Granja ${level - 1}`,
        )
        return
      }
      setSelectedLevel(level)
    },
    [summary.farms, isEn, triggerLockToast],
  )

  const handleCopyModalInvite = useCallback(
    (url: string) => {
      onCopyInvite(url, isEn ? 'Invite link' : 'Enlace de invitación')
    },
    [onCopyInvite, isEn],
  )

  return (
    <section
      className="ufm-root"
      aria-label={isEn ? 'Unilevel Miner Farm 20-Level Map' : 'Mapa Gamificado Unilevel Miner Farm · 20 Granjas'}
      data-testid="unilevel-miner-farm-section"
    >
      <div className="ufm-header">
        <div className="ufm-kicker-row">
          <p className="ufm-kicker">
            PouwMiner · Red Unilevel · {summary.planVersion}
          </p>
          <div className="ufm-header-pills">
            <span
              className={`ufm-elig-chip ${
                summary.eligibleForUnilevel ? 'ufm-elig-chip--ok' : 'ufm-elig-chip--warn'
              }`}
              data-testid="ufm-header-eligibility"
            >
              <span className="ufm-elig-dot" aria-hidden="true" />
              {summary.eligibleForUnilevel
                ? isEn
                  ? 'Eligible · Receiving L1–L20'
                  : 'Elegible · Recibiendo L1–L20'
                : isEn
                  ? 'Pending Eligibility · Option A'
                  : 'Elegibilidad pendiente · Opción A'}
            </span>
            {onSync && (
              <button
                type="button"
                className="ufm-sync-btn"
                onClick={onSync}
                disabled={loading}
                data-testid="ufm-sync-btn"
              >
                {loading
                  ? isEn
                    ? 'Syncing…'
                    : 'Sincronizando…'
                  : isEn
                    ? 'Refresh Farm'
                    : 'Actualizar mapa'}
              </button>
            )}
          </div>
        </div>

        <div className="ufm-title-row">
          <div>
            <h2 className="ufm-h1">
              Unilevel Miner <span className="ufm-accent">Farm</span>
            </h2>
            <p className="ufm-subtitle">
              {isEn
                ? 'Your 20-level Unilevel network as a progressive mining farm map: Farm 1 is always open, and each next farm unlocks in chain once the previous level records at least 1 sourceUserId in your commission ledger.'
                : 'Tu red Unilevel de 20 niveles como un mapa progresivo de granjas de minado: la Granja 1 siempre está abierta y cada siguiente granja se desbloquea en cadena cuando la anterior registra al menos 1 sourceUserId con comisión.'}
            </p>
          </div>
        </div>

        {/* Real Invite Link Strip (Item 5) */}
        <div className="ufm-invite-banner" data-testid="ufm-real-invite-bar">
          <div className="ufm-invite-code-pill">
            <span>{isEn ? 'CODE' : 'CÓDIGO'}</span>
            <code>{referralCode}</code>
          </div>
          <div className="ufm-invite-box" title={inviteUrl} data-testid="ufm-real-invite-url">
            {inviteUrl}
          </div>
          <button
            type="button"
            className="ufm-invite-btn"
            onClick={() => onCopyInvite(inviteUrl, isEn ? 'Invite link' : 'Enlace de invitación')}
            data-testid="ufm-copy-invite-btn"
          >
            {isEn ? 'Copy invite link' : 'Copiar enlace real'}
          </button>
        </div>

        {/* Authoritative Header KPIs from getUnilevelStats + Chain State (Item 2) */}
        <div className="ufm-stats" aria-label={isEn ? 'Network summary' : 'Resumen de tu red'}>
          <div className="ufm-stat" data-testid="ufm-stat-network">
            <div className="ufm-stat-label">{isEn ? 'My Network (getUnilevelStats)' : 'Mi red (getUnilevelStats)'}</div>
            <div className="ufm-stat-value">
              {summary.totalTeamCount} <small>{isEn ? 'team' : 'en red'}</small>
            </div>
            <div className="ufm-stat-sub">
              {summary.directCount} {isEn ? 'direct' : 'directos'} · {summary.activeReferredMinersCount}{' '}
              {isEn ? 'active miners' : 'mineros activos'}
            </div>
          </div>

          <div className="ufm-stat" data-testid="ufm-stat-earnings">
            <div className="ufm-stat-label">{isEn ? 'Unilevel Earned' : 'Ganancia Unilevel'}</div>
            <div className="ufm-stat-value ufm-stat-value--green">
              ${formatStatUsdt2(summary.receivedUnilevelCommission)} <small>USDT</small>
            </div>
            <div className="ufm-stat-sub">
              {isEn ? 'Own:' : 'Propia:'} ${formatStatUsdt2(summary.ownMiningProfit)} ·{' '}
              {isEn ? 'Org pool:' : 'Bruto red:'} ${formatStatUsdt2(summary.organizationGeneratedProfitShare)}
            </div>
          </div>

          <div className="ufm-stat" data-testid="ufm-stat-farms">
            <div className="ufm-stat-label">{isEn ? 'Unlocked Farms' : 'Granjas desbloqueadas'}</div>
            <div className="ufm-stat-value ufm-stat-value--cyan">
              {summary.unlockedFarmsCount}/{summary.totalLevels}
            </div>
            <div className="ufm-stat-sub">
              {summary.activeFarmsCount} {isEn ? 'active with commission' : 'con comisión acreditada'}
            </div>
          </div>

          <div className="ufm-stat" data-testid="ufm-stat-power">
            <div className="ufm-stat-label">{isEn ? 'Network Hashrate (TH)' : 'Potencia de red (TH)'}</div>
            <div className="ufm-stat-value">
              {summary.totalNetworkPowerTh !== null ? (
                <>
                  {summary.totalNetworkPowerTh} <small>TH/s</small>
                </>
              ) : (
                <>
                  — <small>TH</small>
                </>
              )}
            </div>
            <div className="ufm-stat-sub">
              {summary.activeReferredMinersCount}{' '}
              {isEn ? 'referred active miners' : 'mineros referidos activos'}
            </div>
          </div>
        </div>

        {/* Next Chain Unlock Banner + Honest Client Derivation Disclosure (Item 3) */}
        <div className="ufm-unlock-banner" data-testid="ufm-unlock-banner">
          <div className="ufm-ub-icon">
            <FarmLockIcon size={24} />
          </div>
          {summary.nextLockedFarm ? (
            <>
              <div className="ufm-ub-copy">
                <p>
                  <strong>
                    {isEn
                      ? `Next unlock: Farm ${summary.nextLockedFarm.level}`
                      : `Próximo desbloqueo: Granja ${summary.nextLockedFarm.level}`}
                  </strong>{' '}
                  — {summary.nextLockedFarm.farmName}.{' '}
                  {isEn
                    ? `Opens in chain as soon as Farm ${summary.nextLockedFarm.requiredPrevLevel} records ≥ 1 sourceUserId in receivedCommissions.`
                    : `Se abre en cadena en cuanto la Granja ${summary.nextLockedFarm.requiredPrevLevel} registre al menos 1 sourceUserId en receivedCommissions.`}
                </p>
                <span className="ufm-derivation-note" data-testid="ufm-derivation-disclosure">
                  {isEn
                    ? 'Client-side derivation note: chain unlock evaluates ≥ 1 sourceUserId with commission in N-1 (earning a commission ≠ a registered referral with $0 profit).'
                    : 'Nota de derivación en cliente: el candado evalúa ≥ 1 sourceUserId con comisión en N-1 (tener comisión acreditada ≠ referido registrado aún sin ganancia).'}
                </span>
              </div>
              <span className="ufm-ub-chain-pill" data-testid="ufm-unlock-chain-badge">
                {isEn
                  ? `CHAIN · L${summary.nextLockedFarm.requiredPrevLevel} → L${summary.nextLockedFarm.level}`
                  : `CADENA · N${summary.nextLockedFarm.requiredPrevLevel} → N${summary.nextLockedFarm.level}`}
              </span>
            </>
          ) : (
            <div className="ufm-ub-copy">
              <p>
                <strong>{isEn ? 'Full 20-Farm Map Unlocked!' : '¡Mapa completo desbloqueado!'}</strong>{' '}
                {isEn
                  ? 'All 20 Unilevel farms are unlocked in chain.'
                  : 'Las 20 granjas de tu red Unilevel están desbloqueadas en cadena.'}
              </p>
            </div>
          )}
        </div>

        {/* Gamified Achievements */}
        <div className="ufm-medals" aria-label={isEn ? 'Achievements' : 'Logros'}>
          {summary.medals.map((medal) => (
            <div
              key={medal.id}
              className={`ufm-medal ${medal.done ? '' : 'is-locked'}`}
              data-testid={`ufm-medal-${medal.id}`}
            >
              <span className="ufm-medal-ico" aria-hidden="true">
                {medal.done ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3l2.5 5.6L20 9.6l-4 4 1 5.9-5-2.8-5 2.8 1-5.9-4-4 5.5-1z" />
                  </svg>
                ) : (
                  <FarmLockMiniIcon size={14} />
                )}
              </span>
              <span>
                <span className="ufm-medal-name">{isEn ? medal.nameEn : medal.nameEs}</span>
                <span className="ufm-medal-sub">{isEn ? medal.subEn : medal.subEs}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 20-FARM ZIGZAG MAP IN 4 ERAS */}
      <div className="ufm-map" data-testid="unilevel-farm-zigzag-map">
        {UNILEVEL_FARM_ERAS.map((era) => {
          const eraFarms = summary.farms.filter((f) => f.level >= era.from && f.level <= era.to)
          return (
            <div key={era.id} className="ufm-era-group" data-testid={`ufm-era-${era.id}`}>
              <div className="ufm-era-head">
                <span className="ufm-era-chip">
                  <span className="ufm-era-name">{isEn ? era.nameEn : era.nameEs}</span>
                  <span className="ufm-era-range">
                    {isEn ? `Farms ${era.from}–${era.to}` : `Granjas ${era.from}–${era.to}`}
                  </span>
                </span>
                <div className="ufm-era-desc">{isEn ? era.descEn : era.descEs}</div>
              </div>

              {eraFarms.map((farm) => {
                const isLocked = farm.state === 'locked'
                const isActive = farm.state === 'active'
                const isEmpty = farm.state === 'empty'

                const sideNote = isActive ? (
                  <>
                    <strong>
                      {farm.sourceUserCount}{' '}
                      {isEn
                        ? farm.sourceUserCount === 1
                          ? 'referral UID'
                          : 'referral UIDs'
                        : farm.sourceUserCount === 1
                          ? 'UID referido'
                          : 'UIDs referidos'}
                    </strong>
                    <br />
                    ${farm.totalEarnedUsdt2} USDT · {farm.pctLabel}
                  </>
                ) : isEmpty ? (
                  <>
                    <strong>{isEn ? 'Unlocked · Empty' : 'Desbloqueada · Vacía'}</strong>
                    <br />
                    {isEn ? `Protocol rate ${farm.pctLabel}` : `Tasa protocolo ${farm.pctLabel}`}
                  </>
                ) : (
                  <>
                    {isEn ? 'Unlocks in chain with' : 'Se desbloquea con'}
                    <br />
                    {isEn
                      ? `1 UID in Farm ${farm.level - 1}`
                      : `1 UID con comisión en Granja ${farm.level - 1}`}
                  </>
                )

                return (
                  <div
                    key={farm.level}
                    className="ufm-stop"
                    data-side={farm.side}
                    data-testid={`ufm-stop-${farm.level}`}
                  >
                    {farm.side === 'right' && <div className="ufm-side-note">{sideNote}</div>}

                    <button
                      type="button"
                      id={`ufm-farm-${farm.level}`}
                      data-testid={`ufm-farm-card-${farm.level}`}
                      data-level={farm.level}
                      data-state={farm.state}
                      className={`ufm-farm ${isLocked ? 'is-locked-art' : ''} ${
                        shakingLevel === farm.level ? 'is-shaking' : ''
                      }`}
                      onClick={() => handleFarmClick(farm.level)}
                      aria-label={`${isEn ? 'Farm' : 'Granja'} ${farm.level}, ${farm.farmName}, ${farm.pctLabel}`}
                    >
                      <div className="ufm-scene">
                        <FarmEraArt level={farm.level} idPrefix="map" lit={!isLocked} />
                        {isLocked && (
                          <div className="ufm-lock-overlay">
                            <div className="ufm-lock-badge">
                              <FarmLockIcon size={28} />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="ufm-farm-body">
                        <div className="ufm-farm-top">
                          <span className="ufm-farm-name">
                            {isEn ? `Farm ${farm.level}` : `Granja ${farm.level}`}
                          </span>
                          <span
                            className={`ufm-chip ${
                              isActive
                                ? 'ufm-chip--active'
                                : isEmpty
                                  ? 'ufm-chip--empty'
                                  : 'ufm-chip--locked'
                            }`}
                          >
                            {isActive
                              ? isEn
                                ? 'Active'
                                : 'Activa'
                              : isEmpty
                                ? isEn
                                  ? 'Unlocked'
                                  : 'Desbloqueada'
                                : isEn
                                  ? 'Locked'
                                  : 'Bloqueada'}
                          </span>
                        </div>

                        <div className="ufm-farm-sub">
                          {farm.farmName} · {isEn ? farm.era.nameEn : farm.era.nameEs} ·{' '}
                          <strong>{farm.pctLabel}</strong>
                        </div>

                        {isActive && (
                          <>
                            <div className="ufm-farm-stats">
                              <div className="ufm-farm-stat">
                                <div className="ufm-farm-stat-k">{isEn ? 'UIDs' : 'Referidos'}</div>
                                <div className="ufm-farm-stat-v">{farm.sourceUserCount}</div>
                              </div>
                              <div className="ufm-farm-stat">
                                <div className="ufm-farm-stat-k">{isEn ? 'Earned' : 'Ganancia'}</div>
                                <div className="ufm-farm-stat-v ufm-farm-stat-v--green">
                                  ${farm.totalEarnedUsdt2}
                                </div>
                              </div>
                              <div className="ufm-farm-stat">
                                <div className="ufm-farm-stat-k">{isEn ? 'Rate' : 'Tasa'}</div>
                                <div className="ufm-farm-stat-v">{farm.pctLabel}</div>
                              </div>
                            </div>
                            <div className="ufm-activity">
                              <div className="ufm-activity-cap">
                                <span>{isEn ? 'Credited UIDs' : 'UIDs con ganancia neta'}</span>
                                <span>{farm.positiveRatioPct}%</span>
                              </div>
                              <div className="ufm-progress">
                                <i style={{ width: `${farm.positiveRatioPct}%` }} />
                              </div>
                            </div>
                            <span className="ufm-cta">
                              {isEn ? 'Inspect level UIDs →' : 'Ver referidos del nivel →'}
                            </span>
                          </>
                        )}

                        {isEmpty && (
                          <>
                            <div className="ufm-farm-stats">
                              <div className="ufm-farm-stat">
                                <div className="ufm-farm-stat-k">{isEn ? 'UIDs' : 'Referidos'}</div>
                                <div className="ufm-farm-stat-v">0</div>
                              </div>
                              <div className="ufm-farm-stat">
                                <div className="ufm-farm-stat-k">{isEn ? 'Earned' : 'Ganancia'}</div>
                                <div className="ufm-farm-stat-v ufm-farm-stat-v--green">$0.00</div>
                              </div>
                              <div className="ufm-farm-stat">
                                <div className="ufm-farm-stat-k">{isEn ? 'Rate' : 'Tasa'}</div>
                                <div className="ufm-farm-stat-v">{farm.pctLabel}</div>
                              </div>
                            </div>
                            <div className="ufm-activity">
                              <div className="ufm-activity-cap">
                                <span>{isEn ? 'No commissions yet' : 'Sin comisiones todavía'}</span>
                                <span>0%</span>
                              </div>
                              <div className="ufm-progress">
                                <i style={{ width: '0%' }} />
                              </div>
                            </div>
                            <span className="ufm-cta">
                              {isEn ? 'Invite & open farm →' : 'Invitar a tu primer minero →'}
                            </span>
                          </>
                        )}

                        {isLocked && (
                          <p className="ufm-req">
                            <FarmLockMiniIcon size={15} />
                            <span>
                              {isEn ? (
                                <>
                                  Requires <strong>1 UID with commission in Farm {farm.level - 1}</strong> to unlock this farm ({farm.pctLabel}).
                                </>
                              ) : (
                                <>
                                  Necesitas <strong>1 referido con comisión en la Granja {farm.level - 1}</strong> para desbloquear esta granja ({farm.pctLabel}).
                                </>
                              )}
                            </span>
                          </p>
                        )}
                      </div>
                    </button>

                    <div
                      className={`ufm-node ${
                        isLocked ? 'is-locked' : isEmpty ? 'is-empty' : 'is-active'
                      }`}
                    >
                      {isLocked ? <FarmLockMiniIcon size={15} /> : farm.level}
                    </div>

                    {farm.side === 'left' && <div className="ufm-side-note">{sideNote}</div>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {lockToast && (
        <div className="ufm-toast is-visible is-warn" role="status" aria-live="polite" data-testid="ufm-lock-toast">
          {lockToast}
        </div>
      )}

      <MinerFarmModal
        farm={selectedFarm}
        inviteUrl={inviteUrl}
        isOpen={selectedFarm !== null}
        isEn={isEn}
        onClose={() => setSelectedLevel(null)}
        onCopyInvite={handleCopyModalInvite}
      />
    </section>
  )
}
