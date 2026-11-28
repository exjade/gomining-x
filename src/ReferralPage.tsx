import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions'
import { useAuth } from './AuthContext'
import {
  app,
  getReferralAccount,
  getReferralTransactions,
  getUserCommissions,
  assignSponsorToUser,
  type ReferralAccount,
  type ReferralTransaction,
  type ReferralCommission,
} from './firebase'
import { usePersonalization } from './personalization'
import './components/unilevel-farm/unilevelFarm.css'
import { MinerFarmMap, UnilevelAggregatedWithdrawalSection } from './components/unilevel-farm'

/* ============================================================================
 * Authoritative Gen 2 Callable Contracts (pouw-admin-backend @ 4e26060)
 * Source: functions/src/unilevel/unilevelReadApi.js & unilevelRates.js
 * MUST_PRESERVE: Zero client-side commission math. All monetary amounts are
 * displayed strictly from backend responses.
 * ========================================================================== */

export interface UnilevelStatsDto {
  ownMiningProfit: number
  organizationGeneratedProfitShare: number
  receivedUnilevelCommission: number
  directCount: number
  totalTeamCount: number
  activeReferredMinersCount: number
  eligibleForUnilevel: boolean
  planVersion: string
}

export interface UnilevelTreeNodeDto {
  level: number
  uid: string
  referralCode: string | null
  active: boolean
}

export interface UnilevelTreeDto {
  uid: string
  referralCode: string | null
  sponsorId: string | null
  uplines: UnilevelTreeNodeDto[]
  directCount: number
  totalTeamCount: number
  activeReferredMinersCount: number
}

export type UnilevelLevelStatus = 'CREDITED' | 'EMPTY' | 'INELIGIBLE' | 'CYCLE_CUT' | string

export interface UnilevelDistributionLevelDto {
  level: number
  uplineUserId: string | null
  rateInternalStr?: string
  rateString: string
  status: UnilevelLevelStatus
  eligible: boolean
  creditedInternalStr?: string
  creditedUsdt6: string
  undistributedInternalStr?: string
  roundingResidualInternalStr?: string
}

export interface UnilevelOwnDistributionDto {
  id: string
  distributionId?: string
  date?: string
  periodDate?: string
  planVersion: string
  minerUid: string
  sourceUserId?: string
  minerId: string
  dailyProfitId?: string | null
  currency?: string
  status: 'distributed' | 'REVERSED' | string
  eligibleProfitUsdt6: string
  expectedPoolUsdt6: string
  distributedUsdt6: string
  undistributedUsdt6: string
  userMiningPayoutUsdt6: string
  cycleDetected?: boolean
  levels: UnilevelDistributionLevelDto[]
}

export interface UnilevelReceivedCommissionDto {
  id: string
  distributionId: string
  type: 'UNILEVEL_PROFITSHARE_COMMISSION' | 'UNILEVEL_PROFITSHARE_REVERSAL' | string
  status: 'CREDITED' | 'REVERSED' | string
  currency: string
  level: number
  rateString?: string
  uplineUserId: string
  sourceUserId: string
  minerId?: string
  periodDate?: string
  planVersion?: string
  creditedUsdt6?: string
  deltaUsdt6?: string
}

export interface UnilevelHistoryDto {
  uid: string
  limit: number
  ownDistributions: UnilevelOwnDistributionDto[]
  receivedCommissions: UnilevelReceivedCommissionDto[]
}

export interface UnilevelScheduleRow {
  readonly level: number
  readonly pctLabel: string
  readonly rateString: string
  readonly barTrackPct: number
}

/**
 * Static protocol display table for UNILEVEL_V1 (unilevelRates.js):
 * L1 = 1.95% stepping down 0.10% per level to L20 = 0.05% (Sum = 20.00% of eligibleProfit).
 * Used exclusively to display the fixed protocol rate schedule (never multiplied on client).
 */
export const UNILEVEL_V1_SCHEDULE: readonly UnilevelScheduleRow[] = [
  { level: 1, pctLabel: '1.95%', rateString: '0.0195', barTrackPct: 100 },
  { level: 2, pctLabel: '1.85%', rateString: '0.0185', barTrackPct: 95 },
  { level: 3, pctLabel: '1.75%', rateString: '0.0175', barTrackPct: 90 },
  { level: 4, pctLabel: '1.65%', rateString: '0.0165', barTrackPct: 85 },
  { level: 5, pctLabel: '1.55%', rateString: '0.0155', barTrackPct: 79 },
  { level: 6, pctLabel: '1.45%', rateString: '0.0145', barTrackPct: 74 },
  { level: 7, pctLabel: '1.35%', rateString: '0.0135', barTrackPct: 69 },
  { level: 8, pctLabel: '1.25%', rateString: '0.0125', barTrackPct: 64 },
  { level: 9, pctLabel: '1.15%', rateString: '0.0115', barTrackPct: 59 },
  { level: 10, pctLabel: '1.05%', rateString: '0.0105', barTrackPct: 54 },
  { level: 11, pctLabel: '0.95%', rateString: '0.0095', barTrackPct: 49 },
  { level: 12, pctLabel: '0.85%', rateString: '0.0085', barTrackPct: 44 },
  { level: 13, pctLabel: '0.75%', rateString: '0.0075', barTrackPct: 38 },
  { level: 14, pctLabel: '0.65%', rateString: '0.0065', barTrackPct: 33 },
  { level: 15, pctLabel: '0.55%', rateString: '0.0055', barTrackPct: 28 },
  { level: 16, pctLabel: '0.45%', rateString: '0.0045', barTrackPct: 23 },
  { level: 17, pctLabel: '0.35%', rateString: '0.0035', barTrackPct: 18 },
  { level: 18, pctLabel: '0.25%', rateString: '0.0025', barTrackPct: 13 },
  { level: 19, pctLabel: '0.15%', rateString: '0.0015', barTrackPct: 8 },
  { level: 20, pctLabel: '0.05%', rateString: '0.0005', barTrackPct: 4 },
] as const

const RATE_LABEL_BY_STRING: Readonly<Record<string, string>> = Object.fromEntries(
  UNILEVEL_V1_SCHEDULE.map((item) => [item.rateString, item.pctLabel]),
)

let cachedFunctionsInstance: Functions | null = null
let functionsEmulatorBound = false

function getUnilevelFunctionsClient(): Functions {
  if (!cachedFunctionsInstance) {
    cachedFunctionsInstance = getFunctions(app, 'us-central1')
  }
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const emulatorHost = env?.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST?.trim()
  if (emulatorHost && !functionsEmulatorBound) {
    const emulatorPort = Number(env?.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001)
    try {
      connectFunctionsEmulator(cachedFunctionsInstance, emulatorHost, emulatorPort)
      functionsEmulatorBound = true
    } catch {
      functionsEmulatorBound = true
    }
  }
  return cachedFunctionsInstance
}

function formatUsdt2(value: number | undefined | null): string {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatUsdt6(value: number | undefined | null): string {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  })
}

function formatBackendUsdt6(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '0.000000'
  return raw
}

function formatRateLabel(rateString: string | undefined, level?: number): string {
  if (rateString && RATE_LABEL_BY_STRING[rateString]) {
    return RATE_LABEL_BY_STRING[rateString]
  }
  if (typeof level === 'number' && level >= 1 && level <= 20) {
    return UNILEVEL_V1_SCHEDULE[level - 1].pctLabel
  }
  return rateString || '—'
}

function maskIdentifier(id: string | null | undefined): string {
  if (!id) return '—'
  if (id.length <= 10) return id
  return `${id.slice(0, 6)}…${id.slice(-4)}`
}

type HistorySubTab = 'received' | 'distributions' | 'direct'

export function ReferralPage({ pathname = '/nft-referral' }: { pathname?: string } = {}) {
  const { user, profile, refreshProfile, openAuthModal } = useAuth()
  const { t, language } = usePersonalization()
  const isEn = language === 'en'

  const isFriendsTab = pathname.endsWith('/friends')
  const isRewardsTab = pathname.endsWith('/rewards')

  // Direct Referral 10% (SCRUM-229) state — isolated from Unilevel 20L
  const [referralAccount, setReferralAccount] = useState<ReferralAccount | null>(null)
  const [referralTransactions, setReferralTransactions] = useState<ReferralTransaction[]>([])
  const [commissions, setCommissions] = useState<ReferralCommission[]>([])

  // Authoritative Gen 2 Unilevel (SCRUM-230) read-only state
  const [unilevelStats, setUnilevelStats] = useState<UnilevelStatsDto | null>(null)
  const [unilevelTree, setUnilevelTree] = useState<UnilevelTreeDto | null>(null)
  const [unilevelHistory, setUnilevelHistory] = useState<UnilevelHistoryDto | null>(null)
  const [unilevelLoading, setUnilevelLoading] = useState(false)
  const [unilevelError, setUnilevelError] = useState<string | null>(null)

  // UI interaction state
  const [copyFeedback, setCopyFeedback] = useState('')
  const [sponsorInput, setSponsorInput] = useState('')
  const [sponsorFeedback, setSponsorFeedback] = useState('')
  const [sponsorFeedbackTone, setSponsorFeedbackTone] = useState<'ok' | 'err'>('ok')
  const [settingSponsor, setSettingSponsor] = useState(false)
  const [historyTab, setHistoryTab] = useState<HistorySubTab>('received')

  // Unilevel 20-level distribution inspector modal state
  const [activeUnilevelView, setActiveUnilevelView] = useState<UnilevelOwnDistributionDto | null>(null)
  const [showUnilevelModal, setShowUnilevelModal] = useState(false)

  const loadUnilevelGen2 = useCallback(async () => {
    if (!user || user.isAnonymous) {
      setUnilevelStats(null)
      setUnilevelTree(null)
      setUnilevelHistory(null)
      setUnilevelLoading(false)
      setUnilevelError(null)
      return
    }

    setUnilevelLoading(true)
    setUnilevelError(null)

    try {
      const fns = getUnilevelFunctionsClient()
      const callStats = httpsCallable<Record<string, never>, UnilevelStatsDto>(fns, 'getUnilevelStats')
      const callTree = httpsCallable<Record<string, never>, UnilevelTreeDto>(fns, 'getUnilevelTree')
      const callHistory = httpsCallable<{ limit: number }, UnilevelHistoryDto>(fns, 'getUnilevelHistory')

      const [statsRes, treeRes, historyRes] = await Promise.allSettled([
        callStats({}),
        callTree({}),
        callHistory({ limit: 50 }),
      ])

      const errors: string[] = []

      if (statsRes.status === 'fulfilled' && statsRes.value?.data) {
        setUnilevelStats(statsRes.value.data)
      } else if (statsRes.status === 'rejected') {
        errors.push('getUnilevelStats')
      }

      if (treeRes.status === 'fulfilled' && treeRes.value?.data) {
        setUnilevelTree(treeRes.value.data)
      } else if (treeRes.status === 'rejected') {
        errors.push('getUnilevelTree')
      }

      if (historyRes.status === 'fulfilled' && historyRes.value?.data) {
        setUnilevelHistory(historyRes.value.data)
      } else if (historyRes.status === 'rejected') {
        errors.push('getUnilevelHistory')
      }

      if (errors.length > 0) {
        setUnilevelError(
          isEn
            ? `Unable to synchronize Gen 2 endpoints (${errors.join(', ')}). Check connection and retry.`
            : `No se pudo sincronizar la lectura Gen 2 (${errors.join(', ')}). Verifica la conexión y reintenta.`,
        )
      }
    } catch {
      setUnilevelError(
        isEn
          ? 'Unable to connect to Unilevel Gen 2 Cloud Functions.'
          : 'No se pudo conectar con las Cloud Functions Gen 2 de Unilevel.',
      )
    } finally {
      setUnilevelLoading(false)
    }
  }, [user, isEn])

  useEffect(() => {
    if (!user) return
    let active = true

    getReferralAccount(user.uid)
      .then((acc) => {
        if (active) setReferralAccount(acc)
      })
      .catch(() => {})

    getReferralTransactions(user.uid)
      .then((txs) => {
        if (active) setReferralTransactions(txs)
      })
      .catch(() => {})

    getUserCommissions(user.uid)
      .then((comms) => {
        if (active) setCommissions(comms)
      })
      .catch(() => {})

    void loadUnilevelGen2()

    return () => {
      active = false
    }
  }, [user, profile?.commissionBalance, loadUnilevelGen2])

  useEffect(() => {
    if (!showUnilevelModal) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowUnilevelModal(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showUnilevelModal])

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyFeedback(`${label} · ${t('common.copied')}`)
      setTimeout(() => setCopyFeedback(''), 2400)
    } catch {
      setCopyFeedback(isEn ? 'Could not copy to clipboard' : 'No se pudo copiar al portapapeles')
      setTimeout(() => setCopyFeedback(''), 2400)
    }
  }

  const referralCode =
    unilevelTree?.referralCode ||
    profile?.referral?.referralCode ||
    (user ? `GM${user.uid.slice(0, 6).toUpperCase()}` : 'GOMINING')

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${referralCode}`
      : `/?ref=${referralCode}`

  // Direct Referral 10% figures (isolated from Unilevel 20L)
  const directReferralsCount =
    unilevelStats?.directCount ??
    unilevelTree?.directCount ??
    profile?.referral?.userReferrals?.length ??
    referralAccount?.directReferralsCount ??
    0

  const totalCommissionsEarned =
    referralAccount?.totalCommissionsEarned ??
    profile?.totalCommissionsEarned ??
    commissions.reduce((sum, c) => sum + (c.commissionAmount || 0), 0)

  const withdrawableBalance =
    referralAccount?.withdrawableBalance ?? profile?.commissionBalance ?? 0

  const totalWithdrawn = referralAccount?.totalWithdrawn ?? 0

  // Authoritative Unilevel Gen 2 metrics (zero client calculation)
  const ownMiningProfit = unilevelStats?.ownMiningProfit ?? 0
  const organizationGeneratedProfitShare = unilevelStats?.organizationGeneratedProfitShare ?? 0
  const receivedUnilevelCommission = unilevelStats?.receivedUnilevelCommission ?? 0
  const totalTeamCount = unilevelStats?.totalTeamCount ?? unilevelTree?.totalTeamCount ?? 0
  const activeReferredMinersCount =
    unilevelStats?.activeReferredMinersCount ?? unilevelTree?.activeReferredMinersCount ?? 0
  const planVersion = unilevelStats?.planVersion || 'UNILEVEL_V1'

  // Upline eligibility breakdown (authoritative boolean from getUnilevelStats;
  // userData.status is evaluated server-side inside eligibleForUnilevel and is not exposed separately)
  const isEmailVerified = Boolean(user?.emailVerified || profile?.emailVerified)
  const hasActiveReferredMiner = activeReferredMinersCount >= 1
  const eligibleForUnilevel = unilevelStats?.eligibleForUnilevel === true
  const accountStatusGate: 'met' | 'unmet' | 'unverified' = eligibleForUnilevel
    ? 'met'
    : unilevelStats && isEmailVerified && hasActiveReferredMiner
      ? 'unmet'
      : 'unverified'

  const uplinesByLevel = new Map<number, UnilevelTreeNodeDto>()
  if (unilevelTree?.uplines) {
    for (const node of unilevelTree.uplines) {
      uplinesByLevel.set(node.level, node)
    }
  }

  const linkedSponsorDisplay =
    profile?.referral?.referrerBy ||
    uplinesByLevel.get(1)?.referralCode ||
    (unilevelTree?.sponsorId ? maskIdentifier(unilevelTree.sponsorId) : '')

  const ownDistributions = unilevelHistory?.ownDistributions ?? []
  const receivedCommissions = unilevelHistory?.receivedCommissions ?? []

  const handleAddSponsor = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !sponsorInput.trim()) return
    setSettingSponsor(true)
    setSponsorFeedback('')
    try {
      const result = await assignSponsorToUser(user.uid, user.email || '', sponsorInput.trim())
      if (!result.success) {
        setSponsorFeedbackTone('err')
        setSponsorFeedback(result.error || t('referral.invalid_sponsor_code'))
        return
      }
      await refreshProfile()
      await loadUnilevelGen2()
      setSponsorFeedbackTone('ok')
      setSponsorFeedback(`${t('referral.sponsor_linked_success')} (${result.sponsorCode})`)
      setSponsorInput('')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('referral.invalid_sponsor_code')
      setSponsorFeedbackTone('err')
      setSponsorFeedback(message)
    } finally {
      setSettingSponsor(false)
    }
  }

  if (!user || user.isAnonymous) {
    return (
      <div className="referral-page-container" data-testid="unilevel-referral-page">
        <style>{UNILEVEL_F5_STYLES}</style>
        <section className="uni-unauth-card">
          <div className="uni-unauth-badge">
            <span className="uni-live-dot" aria-hidden="true" />
            <span>UNILEVEL_V1 · 20 {isEn ? 'LEVELS' : 'NIVELES'}</span>
          </div>
          <h2>{t('referral.page_title')}</h2>
          <p>{t('referral.page_subtitle')}</p>
          <div className="uni-unauth-specs">
            <div className="uni-unauth-spec-item">
              <span>{isEn ? 'Miner Base Retention' : 'Retención Base Minero'}</span>
              <strong>80.00%</strong>
            </div>
            <div className="uni-unauth-spec-item">
              <span>{isEn ? '20-Level Unilevel Pool' : 'Pool Unilevel L1–L20'}</span>
              <strong>20.00%</strong>
            </div>
            <div className="uni-unauth-spec-item">
              <span>{isEn ? 'Direct Purchase Bonus' : 'Bono Directo Compra'}</span>
              <strong>10.00%</strong>
            </div>
          </div>
          <div className="uni-unauth-actions">
            <button
              type="button"
              className="uni-btn uni-btn--emerald"
              onClick={() => openAuthModal('register')}
            >
              {t('profile.create_account')}
            </button>
            <button
              type="button"
              className="uni-btn uni-btn--ghost"
              onClick={() => openAuthModal('login')}
            >
              {t('profile.login')}
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="referral-page-container" data-testid="unilevel-referral-page">
      <style>{UNILEVEL_F5_STYLES}</style>

      {copyFeedback && (
        <div className="uni-toast" role="status" aria-live="polite">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3.5 8.5L6.5 11.5L12.5 4.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{copyFeedback}</span>
        </div>
      )}

      {/* HERO & INVITE / SPONSOR / UNIFIED WITHDRAWAL GATEWAY */}
      <section className="uni-hero-panel" aria-label={t('referral.page_title')}>
        <div className="uni-hero-topbar">
          <div className="uni-kicker-pill">
            <span className="uni-live-dot" aria-hidden="true" />
            <span>
              {planVersion} · {isEn ? '20 LEVELS + 10% DIRECT' : '20 NIVELES + 10% DIRECTO'}
            </span>
          </div>
          <div className="uni-hero-topbar-actions">
            <span className="uni-protocol-tag">
              {isEn ? '80% MINER / 20% UNILEVEL POOL' : '80% MINERO / 20% POOL UNILEVEL'}
            </span>
            <button
              type="button"
              className="uni-btn uni-btn--subtle uni-btn--sm"
              onClick={() => void loadUnilevelGen2()}
              disabled={unilevelLoading}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M13.5 8A5.5 5.5 0 1 1 11.8 4M13.5 2.5V5.5H10.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>
                {unilevelLoading
                  ? isEn
                    ? 'Syncing…'
                    : 'Sincronizando…'
                  : isEn
                    ? 'Sync Gen 2'
                    : 'Sincronizar'}
              </span>
            </button>
          </div>
        </div>

        <div className="uni-hero-layout">
          <div className="uni-hero-main">
            <h2>
              {isEn
                ? '20-Level Unilevel Residual & Direct Royalties'
                : 'Arquitectura Unilevel de 20 Niveles y Regalías Directas'}
            </h2>
            <p className="uni-hero-lead">
              {isEn
                ? 'Two strictly separated server-settled economies: 10% direct bonus on miner purchases and 20.00% daily ProfitShare distribution across 20 levels (1.95% at L1 stepping -0.10% down to 0.05% at L20).'
                : 'Dos economías liquidadas en servidor y estrictamente separadas: bono directo del 10% sobre compras de mineros y distribución diaria del 20.00% de ProfitShare en 20 niveles (1.95% en L1 bajando 0.10% hasta 0.05% en L20).'}
            </p>

            <div className="uni-invite-grid">
              <div className="uni-copy-capsule">
                <span className="uni-field-label">{t('referral.your_code')}</span>
                <div className="uni-copy-row">
                  <code className="uni-mono-code" data-testid="unilevel-referral-code">
                    {referralCode}
                  </code>
                  <button
                    type="button"
                    className="uni-btn uni-btn--ghost uni-btn--sm"
                    onClick={() => copyToClipboard(referralCode, t('referral.your_code'))}
                  >
                    {t('common.copy')}
                  </button>
                </div>
              </div>

              <div className="uni-copy-capsule">
                <span className="uni-field-label">{t('referral.invite_link')}</span>
                <div className="uni-copy-row">
                  <span className="uni-invite-url" title={inviteUrl}>
                    {inviteUrl}
                  </span>
                  <button
                    type="button"
                    className="uni-btn uni-btn--emerald uni-btn--sm"
                    onClick={() => copyToClipboard(inviteUrl, t('referral.invite_link'))}
                  >
                    {t('common.copy')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <aside className="uni-hero-aside">
            <div className="uni-aside-block">
              <div className="uni-aside-header">
                <span className="uni-field-label">
                  {isEn ? 'DIRECT 10% COMMISSION BALANCE' : 'SALDO DE COMISIÓN DIRECTA 10%'}
                </span>
                <span className="uni-aside-tag">{isEn ? 'USD · DIRECT 10%' : 'USD · DIRECTO 10%'}</span>
              </div>
              <div className="uni-withdraw-row">
                <strong className="uni-withdraw-figure">${formatUsdt2(withdrawableBalance)}</strong>
                <Link
                  to="/withdraw/GOMINING"
                  className="uni-btn uni-btn--emerald uni-btn--sm"
                  data-testid="referral-unified-withdraw-link"
                >
                  <span>{t('referral.withdraw_btn')}</span>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M4.5 11.5L11.5 4.5M11.5 4.5H5.5M11.5 4.5V10.5"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              </div>
            </div>

            <div className="uni-aside-divider" />

            <div className="uni-aside-block">
              <span className="uni-field-label">
                {isEn ? 'ASCENDING UPLINE SPONSOR (L1)' : 'PATROCINADOR UPLINE ASCENDENTE (L1)'}
              </span>
              {linkedSponsorDisplay ? (
                <div className="uni-sponsor-linked">
                  <span className="uni-status-dot uni-status-dot--ok" aria-hidden="true" />
                  <span className="uni-sponsor-text">{t('referral.has_sponsor')}</span>
                  <code className="uni-mono-pill">{linkedSponsorDisplay}</code>
                </div>
              ) : (
                <form onSubmit={handleAddSponsor} className="uni-sponsor-form">
                  <input
                    type="text"
                    className="uni-input"
                    placeholder={t('referral.sponsor_input_ph')}
                    value={sponsorInput}
                    onChange={(e) => setSponsorInput(e.target.value.toUpperCase())}
                    aria-label={t('referral.sponsor_input_ph')}
                  />
                  <button
                    type="submit"
                    className="uni-btn uni-btn--ghost uni-btn--sm"
                    disabled={settingSponsor || !sponsorInput.trim()}
                  >
                    {settingSponsor ? t('referral.linking') : t('referral.link_sponsor_btn')}
                  </button>
                </form>
              )}
              {sponsorFeedback && (
                <p
                  className={`uni-sponsor-feedback ${
                    sponsorFeedbackTone === 'err' ? 'uni-sponsor-feedback--err' : ''
                  }`}
                >
                  {sponsorFeedback}
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>

      {unilevelError && (
        <div className="uni-error-banner" role="alert" data-testid="unilevel-gen2-error">
          <div className="uni-error-copy">
            <strong>{isEn ? 'Backend Read Notice' : 'Aviso de lectura Gen 2'}</strong>
            <span>{unilevelError}</span>
          </div>
          <button
            type="button"
            className="uni-btn uni-btn--ghost uni-btn--sm"
            onClick={() => void loadUnilevelGen2()}
          >
            {isEn ? 'Retry' : 'Reintentar'}
          </button>
        </div>
      )}

      {/* GAMIFIED 20-LEVEL UNILEVEL MINER FARM (4 ERAS, ZIGZAG, CHAIN LOCK, MODAL BY LEVEL) */}
      {!isFriendsTab && (
        <MinerFarmMap
          stats={unilevelStats}
          schedule={UNILEVEL_V1_SCHEDULE}
          receivedCommissions={receivedCommissions}
          inviteUrl={inviteUrl}
          referralCode={referralCode}
          loading={unilevelLoading}
          isEn={isEn}
          onCopyInvite={copyToClipboard}
          onSync={() => void loadUnilevelGen2()}
        />
      )}

      {/* (1) 3 SEPARATED UNILEVEL METRICS + ISOLATED DIRECT 10% STRIP */}
      {!isFriendsTab && (
        <section
          className="uni-panel"
          aria-labelledby="uni-metrics-heading"
          data-testid="unilevel-metrics-section"
        >
          <div className="uni-section-head">
            <div>
              <span className="uni-step-chip">
                {isEn ? '01 / SEPARATED METRICS' : '01 / MÉTRICAS SEPARADAS'}
              </span>
              <h3 id="uni-metrics-heading">
                {isEn
                  ? 'Authoritative Unilevel Accounting (getUnilevelStats)'
                  : 'Contabilidad Unilevel Separada (getUnilevelStats)'}
              </h3>
            </div>
            <span className="uni-readonly-chip">
              {isEn ? 'SERVER-AUTHORITATIVE · USDT (6 DEC)' : 'SERVIDOR AUTORITATIVO · USDT (6 DEC)'}
            </span>
          </div>

          <div className={`uni-metrics-deck ${unilevelLoading && !unilevelStats ? 'is-loading' : ''}`}>
            <article className="uni-metric-card" data-testid="metric-own-mining-profit">
              <div className="uni-metric-top">
                <span className="uni-metric-kicker">
                  {isEn ? 'OWN MINING PROFIT' : 'GANANCIA PROPIA DE MINADO'}
                </span>
                <code className="uni-metric-key">ownMiningProfit</code>
              </div>
              <div className="uni-metric-value-row">
                <strong className="uni-metric-figure">${formatUsdt2(ownMiningProfit)}</strong>
                <span className="uni-metric-unit">USDT</span>
              </div>
              <span className="uni-metric-exact">
                {isEn ? 'Exact ledger:' : 'Precisión 6 dec:'} ${formatUsdt6(ownMiningProfit)} USDT
              </span>
              <p className="uni-metric-desc">
                {isEn
                  ? '80.00% base yield of your active miners plus 100% of vacant or ineligible upline slices returned to you.'
                  : '80.00% base de tus mineros activos más el retorno íntegro de niveles vacantes o no elegibles.'}
              </p>
            </article>

            <article
              className="uni-metric-card"
              data-testid="metric-organization-generated-profitshare"
            >
              <div className="uni-metric-top">
                <span className="uni-metric-kicker">
                  {isEn ? 'GROSS NETWORK PROFITSHARE' : 'BRUTO GENERADO POR LA RED'}
                </span>
                <code className="uni-metric-key">organizationGeneratedProfitShare</code>
              </div>
              <div className="uni-metric-value-row">
                <strong className="uni-metric-figure">
                  ${formatUsdt2(organizationGeneratedProfitShare)}
                </strong>
                <span className="uni-metric-unit">USDT</span>
              </div>
              <span className="uni-metric-exact">
                {isEn ? 'Exact ledger:' : 'Precisión 6 dec:'} $
                {formatUsdt6(organizationGeneratedProfitShare)} USDT
              </span>
              <p className="uni-metric-desc">
                {isEn
                  ? 'Gross ProfitShare volume generated across your downline organization before per-level settlement.'
                  : 'Volumen bruto de ProfitShare originado por la red descendente antes de la liquidación por nivel.'}
              </p>
            </article>

            <article
              className="uni-metric-card uni-metric-card--emerald"
              data-testid="metric-received-unilevel-commission"
            >
              <div className="uni-metric-top">
                <span className="uni-metric-kicker uni-metric-kicker--emerald">
                  {isEn ? 'NET UNILEVEL RECEIVED' : 'NETO UNILEVEL RECIBIDO'}
                </span>
                <code className="uni-metric-key uni-metric-key--emerald">
                  receivedUnilevelCommission
                </code>
              </div>
              <div className="uni-metric-value-row">
                <strong className="uni-metric-figure uni-metric-figure--emerald">
                  +${formatUsdt2(receivedUnilevelCommission)}
                </strong>
                <span className="uni-metric-unit uni-metric-unit--emerald">USDT</span>
              </div>
              <span className="uni-metric-exact uni-metric-exact--emerald">
                {isEn ? 'Net credited:' : 'Neto acreditado:'} +$
                {formatUsdt6(receivedUnilevelCommission)} USDT
              </span>
              <p className="uni-metric-desc">
                {isEn
                  ? 'Net Unilevel residual effectively credited to your account across levels L1–L20.'
                  : 'Comisión residual Unilevel neta efectivamente acreditada a tu favor en los niveles L1–L20.'}
              </p>
            </article>
          </div>

          {/* STRICT SEPARATION: DIRECT 10% ECONOMY */}
          <div className="uni-direct-strip" data-testid="direct-referral-10-strip">
            <div className="uni-direct-strip-label">
              <span className="uni-direct-tag">
                {isEn ? 'SEPARATE ECONOMY · DIRECT 10%' : 'ECONOMÍA SEPARADA · DIRECTO 10%'}
              </span>
              <span>
                {isEn
                  ? 'One-shot 10% commission on direct miner purchases & repurchases (independent from Unilevel 20L).'
                  : 'Bono del 10% por compra y recompra directa de mineros (independiente del residual Unilevel 20N).'}
              </span>
            </div>
            <div className="uni-direct-strip-stats">
              <div className="uni-direct-stat">
                <span>{t('referral.commissions_earned')}</span>
                <strong>${formatUsdt2(totalCommissionsEarned)} USD</strong>
              </div>
              <div className="uni-direct-stat">
                <span>{t('referral.total_withdrawn')}</span>
                <strong>${formatUsdt2(totalWithdrawn)} USD</strong>
              </div>
              <div className="uni-direct-stat">
                <span>{t('referral.direct_referrals')}</span>
                <strong>{directReferralsCount}</strong>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* (3) UPLINE ELIGIBILITY STATE */}
      <section
        className="uni-panel"
        aria-labelledby="uni-eligibility-heading"
        data-testid="unilevel-eligibility-section"
      >
        <div className="uni-section-head">
          <div>
            <span className="uni-step-chip">
              {isEn ? '02 / UPLINE ELIGIBILITY GATE' : '02 / ELEGIBILIDAD DEL UPLINE'}
            </span>
            <h3 id="uni-eligibility-heading">
              {isEn
                ? 'Upline Qualification Status (isUplineEligible)'
                : 'Estado de Calificación Upline (isUplineEligible)'}
            </h3>
          </div>
          <span
            className={`uni-eligibility-pill ${
              eligibleForUnilevel ? 'uni-eligibility-pill--active' : 'uni-eligibility-pill--pending'
            }`}
            data-testid="unilevel-eligibility-badge"
          >
            <span className="uni-eligibility-dot" aria-hidden="true" />
            <span>
              {eligibleForUnilevel
                ? isEn
                  ? 'ELIGIBLE · RECEIVING L1–L20'
                  : 'ELEGIBLE ACTIVO · RECIBE L1–L20'
                : isEn
                  ? 'INELIGIBLE · OPTION A RETURN ACTIVE'
                  : 'PENDIENTE DE ELEGIBILIDAD · OPCIÓN A'}
            </span>
          </span>
        </div>

        <div className="uni-eligibility-grid">
          <div className={`uni-req-card is-${accountStatusGate}`}>
            <div className="uni-req-header">
              <span className="uni-req-icon" aria-hidden="true">
                {accountStatusGate === 'met' ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3.5 8.5L6.5 11.5L12.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                )}
              </span>
              <code className="uni-req-code">status === &apos;active&apos;</code>
            </div>
            <strong className="uni-req-title">
              {isEn ? 'Active Account Status' : 'Cuenta Operativa Activa'}
            </strong>
            <span className="uni-req-state">
              {accountStatusGate === 'met'
                ? isEn
                  ? 'Confirmed by server (eligibleForUnilevel)'
                  : 'Confirmada por servidor (eligibleForUnilevel)'
                : accountStatusGate === 'unmet'
                  ? isEn
                    ? 'Account inactive or restricted on server'
                    : 'Cuenta inactiva o restringida en servidor'
                  : isEn
                    ? 'Validated on server alongside the other 2 gates'
                    : 'Se valida en servidor junto con los otros 2 requisitos'}
            </span>
          </div>

          <div className={`uni-req-card ${isEmailVerified ? 'is-met' : 'is-unmet'}`}>
            <div className="uni-req-header">
              <span className="uni-req-icon" aria-hidden="true">
                {isEmailVerified ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3.5 8.5L6.5 11.5L12.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                )}
              </span>
              <code className="uni-req-code">emailVerified === true</code>
            </div>
            <strong className="uni-req-title">
              {isEn ? 'Verified Email Identity' : 'Correo Electrónico Verificado'}
            </strong>
            <span className="uni-req-state">
              {isEmailVerified
                ? isEn
                  ? 'Email verified in Auth'
                  : 'Identidad confirmada en Auth'
                : isEn
                  ? 'Pending email verification'
                  : 'Pendiente confirmar correo'}
            </span>
          </div>

          <div className={`uni-req-card ${hasActiveReferredMiner ? 'is-met' : 'is-unmet'}`}>
            <div className="uni-req-header">
              <span className="uni-req-icon" aria-hidden="true">
                {hasActiveReferredMiner ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3.5 8.5L6.5 11.5L12.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                )}
              </span>
              <code className="uni-req-code">activeReferredMinersCount ≥ 1</code>
            </div>
            <strong className="uni-req-title">
              {isEn
                ? '≥ 1 Direct Referral with Active Miner'
                : '≥ 1 Referido Directo con Minero Activo'}
            </strong>
            <span className="uni-req-state uni-req-counter">
              {activeReferredMinersCount} / 1{' '}
              {isEn ? 'active referred miners' : 'mineros referidos activos'}
            </span>
          </div>
        </div>

        <p className="uni-eligibility-note">
          <strong>{isEn ? 'Option A — No Dynamic Compression:' : 'Opción A — Sin compresión dinámica:'}</strong>{' '}
          {isEn
            ? 'Every level L1–L20 is evaluated at settlement cut-off. Vacant or ineligible levels are never compressed upward; their exact share returns to the miner owner.'
            : 'Cada nivel L1–L20 se evalúa en el corte diario. Los niveles vacantes o no elegibles no comprimen hacia arriba: su porcentaje exacto retorna al dueño del minero.'}
        </p>
      </section>

      {/* (2) 20-LEVEL UNILEVEL_V1 TREE & RATE BREAKDOWN */}
      {!isRewardsTab && (
        <section
          className="uni-panel"
          aria-labelledby="uni-tree-heading"
          data-testid="unilevel-tree-20-section"
        >
          <div className="uni-section-head">
            <div>
              <span className="uni-step-chip">
                {isEn
                  ? '03 / 20-LEVEL UNILEVEL_V1 SCHEDULE & TREE'
                  : '03 / ÁRBOL Y ESCALA UNILEVEL_V1 · 20 NIVELES'}
              </span>
              <h3 id="uni-tree-heading">
                {isEn
                  ? '20-Level Residual Breakdown (1.95% L1 → 0.05% L20 = 20.00%)'
                  : 'Desglose de 20 Niveles UNILEVEL_V1 (1.95% L1 → 0.05% L20 = 20.00%)'}
              </h3>
            </div>
            <div className="uni-tree-counters">
              <span className="uni-counter-chip">
                {t('referral.direct_referrals')}: <strong>{directReferralsCount}</strong>
              </span>
              <span className="uni-counter-chip">
                {t('referral.network_team')}: <strong>{totalTeamCount}</strong>
              </span>
              <span className="uni-counter-chip uni-counter-chip--emerald">
                {t('referral.upline_chain')}:{' '}
                <strong>
                  {unilevelTree?.uplines?.length ?? 0} / 20
                </strong>
              </span>
            </div>
          </div>

          {/* 80 / 20 PROTOCOL ALLOCATION BAR */}
          <div className="uni-allocation-box">
            <div className="uni-allocation-labels">
              <span>
                <strong>80.00%</strong>{' '}
                {isEn
                  ? 'Miner Owner Base (+ undistributed return)'
                  : 'Base Dueño del Minero (+ retorno no distribuido)'}
              </span>
              <span className="uni-allocation-emerald">
                <strong>20.00%</strong>{' '}
                {isEn
                  ? 'Max Unilevel Pool (−0.10% step/level · L1 1.95% → L20 0.05%)'
                  : 'Pool Máximo Unilevel (paso −0.10%/nivel · L1 1.95% → L20 0.05%)'}
              </span>
            </div>
            <div className="uni-allocation-track" aria-hidden="true">
              <div className="uni-allocation-segment uni-allocation-segment--miner" />
              <div className="uni-allocation-segment uni-allocation-segment--pool" />
            </div>
          </div>

          <div className="uni-levels-columns">
            {[UNILEVEL_V1_SCHEDULE.slice(0, 10), UNILEVEL_V1_SCHEDULE.slice(10, 20)].map(
              (columnRows, colIdx) => (
                <div key={colIdx} className="uni-levels-col">
                  <div className="uni-levels-col-header">
                    <span>{isEn ? 'LEVEL' : 'NIVEL'}</span>
                    <span>{isEn ? 'RATE' : 'TASA'}</span>
                    <span>{isEn ? 'WEIGHT' : 'PESO'}</span>
                    <span>{isEn ? 'ASCENDING UPLINE NODE' : 'NODO UPLINE ASCENDENTE'}</span>
                  </div>
                  {columnRows.map((row) => {
                    const node = uplinesByLevel.get(row.level)
                    const levelTag = `L${String(row.level).padStart(2, '0')}`
                    return (
                      <div
                        key={row.level}
                        className={`uni-level-row ${node ? 'has-upline' : 'is-vacant'}`}
                        data-testid={`unilevel-row-L${row.level}`}
                      >
                        <span className="uni-level-badge">{levelTag}</span>
                        <strong className="uni-level-pct">{row.pctLabel}</strong>
                        <span className="uni-level-bar-wrap" aria-hidden="true">
                          <span
                            className="uni-level-bar-fill"
                            style={{ width: `${row.barTrackPct}%` }}
                          />
                        </span>
                        {node ? (
                          <span className="uni-level-node">
                            <code className="uni-node-code">
                              {node.referralCode || maskIdentifier(node.uid)}
                            </code>
                            <span
                              className={`uni-node-status ${
                                node.active ? 'uni-node-status--active' : 'uni-node-status--inactive'
                              }`}
                            >
                              {node.active
                                ? isEn
                                  ? 'ACTIVE'
                                  : 'ACTIVO'
                                : isEn
                                  ? 'INACTIVE'
                                  : 'INACTIVO'}
                            </span>
                          </span>
                        ) : (
                          <span className="uni-level-vacant">
                            {isEn ? 'Vacant · returns to miner' : 'Vacante · retorna al minero'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ),
            )}
          </div>
        </section>
      )}

      {/* (4) UNILEVEL GEN 2 LEDGER, DISTRIBUTIONS & DIRECT REFERRALS */}
      <section
        className="uni-panel"
        aria-labelledby="uni-history-heading"
        data-testid="unilevel-history-section"
      >
        <div className="uni-section-head">
          <div>
            <span className="uni-step-chip">
              {isEn ? '04 / AUDITABLE LEDGER & NETWORK' : '04 / LEDGER AUDITABLE Y RED'}
            </span>
            <h3 id="uni-history-heading">
              {isEn
                ? 'Unilevel Ledger, Miner Distributions & Direct Network'
                : 'Historial Unilevel (getUnilevelHistory) y Red Directa'}
            </h3>
          </div>

          <div className="uni-subtabs" role="tablist" aria-label="Unilevel & Referral Ledgers">
            {!isFriendsTab && (
              <>
                <button
                  type="button"
                  role="tab"
                  aria-selected={historyTab === 'received'}
                  className={`uni-subtab ${historyTab === 'received' ? 'is-active' : ''}`}
                  onClick={() => setHistoryTab('received')}
                >
                  <span>{isEn ? 'Unilevel Received' : 'Comisiones Unilevel'}</span>
                  <span className="uni-subtab-count">{receivedCommissions.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={historyTab === 'distributions'}
                  className={`uni-subtab ${historyTab === 'distributions' ? 'is-active' : ''}`}
                  onClick={() => setHistoryTab('distributions')}
                >
                  <span>{isEn ? 'My Miner Splits' : 'Cortes de Mis Mineros'}</span>
                  <span className="uni-subtab-count">{ownDistributions.length}</span>
                </button>
              </>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={isFriendsTab || historyTab === 'direct'}
              className={`uni-subtab ${isFriendsTab || historyTab === 'direct' ? 'is-active' : ''}`}
              onClick={() => setHistoryTab('direct')}
            >
              <span>{isEn ? 'Direct 10%' : 'Directos 10%'}</span>
              <span className="uni-subtab-count">{directReferralsCount}</span>
            </button>
          </div>
        </div>

        {/* SUB-VIEW A: RECEIVED UNILEVEL COMMISSIONS (unilevel_ledger) */}
        {!isFriendsTab && historyTab === 'received' && (
          <div className="uni-ledger-wrap" data-testid="unilevel-received-ledger">
            {receivedCommissions.length > 0 ? (
              <div className="uni-ledger-list">
                <div className="uni-ledger-head uni-ledger-head--received">
                  <span>{isEn ? 'PERIOD' : 'PERIODO'}</span>
                  <span>{isEn ? 'LEVEL / RATE' : 'NIVEL / TASA'}</span>
                  <span>{isEn ? 'SOURCE MINER' : 'MINERO ORIGEN'}</span>
                  <span>{isEn ? 'STATUS' : 'ESTADO'}</span>
                  <span className="uni-align-right">{isEn ? 'AMOUNT (USDT)' : 'MONTO (USDT)'}</span>
                </div>
                {receivedCommissions.map((entry) => {
                  const isReversed =
                    entry.status === 'REVERSED' || entry.type === 'UNILEVEL_PROFITSHARE_REVERSAL'
                  const amountStr = entry.deltaUsdt6 || entry.creditedUsdt6 || '0.000000'
                  const signedDisplay = amountStr.startsWith('-')
                    ? `${amountStr} USDT`
                    : isReversed
                      ? `-${amountStr} USDT`
                      : `+${amountStr} USDT`
                  return (
                    <div key={entry.id} className="uni-ledger-row uni-ledger-row--received">
                      <span className="uni-cell-mono">{entry.periodDate || '—'}</span>
                      <span className="uni-cell-badges">
                        <span className="uni-level-badge">
                          L{String(entry.level || 1).padStart(2, '0')}
                        </span>
                        <span className="uni-rate-pill">
                          {formatRateLabel(entry.rateString, entry.level)}
                        </span>
                      </span>
                      <code className="uni-mono-capsule">
                        {entry.minerId ? maskIdentifier(entry.minerId) : maskIdentifier(entry.distributionId)}
                      </code>
                      <span
                        className={`uni-state-pill ${
                          isReversed ? 'uni-state-pill--reversed' : 'uni-state-pill--credited'
                        }`}
                      >
                        {isReversed
                          ? isEn
                            ? 'REVERSED'
                            : 'REVERTIDO'
                          : isEn
                            ? 'CREDITED'
                            : 'ACREDITADO'}
                      </span>
                      <strong
                        className={`uni-cell-amount ${
                          isReversed ? 'uni-cell-amount--neg' : 'uni-cell-amount--pos'
                        }`}
                      >
                        {signedDisplay}
                      </strong>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="uni-empty-box">
                <p>
                  {isEn
                    ? 'No Unilevel commissions recorded in unilevel_ledger yet.'
                    : 'Aún no registras comisiones residuales acreditadas en unilevel_ledger.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* SUB-VIEW B: OWN MINER DISTRIBUTIONS (unilevel_distributions) */}
        {!isFriendsTab && historyTab === 'distributions' && (
          <div className="uni-ledger-wrap" data-testid="unilevel-own-distributions">
            {ownDistributions.length > 0 ? (
              <div className="uni-ledger-list">
                <div className="uni-ledger-head uni-ledger-head--dist">
                  <span>{isEn ? 'DATE / MINER' : 'FECHA / MINERO'}</span>
                  <span>{isEn ? 'ELIGIBLE PROFIT' : 'PROFIT ELEGIBLE'}</span>
                  <span>{isEn ? 'DISTRIBUTED' : 'DISTRIBUIDO'}</span>
                  <span>{isEn ? 'RETURNED' : 'RETORNADO'}</span>
                  <span>{isEn ? 'YOUR PAYOUT' : 'TU PAGO MINERO'}</span>
                  <span className="uni-align-right">{isEn ? 'DETAIL' : 'DETALLE'}</span>
                </div>
                {ownDistributions.map((dist) => (
                  <div key={dist.id} className="uni-ledger-row uni-ledger-row--dist">
                    <div className="uni-dist-primary">
                      <span className="uni-cell-mono">{dist.periodDate || dist.date || '—'}</span>
                      <code className="uni-mono-capsule">{maskIdentifier(dist.minerId)}</code>
                    </div>
                    <span className="uni-cell-mono">
                      ${formatBackendUsdt6(dist.eligibleProfitUsdt6)}
                    </span>
                    <span className="uni-cell-mono uni-text-emerald">
                      ${formatBackendUsdt6(dist.distributedUsdt6)}
                    </span>
                    <span className="uni-cell-mono">
                      ${formatBackendUsdt6(dist.undistributedUsdt6)}
                    </span>
                    <strong className="uni-cell-mono uni-text-bright">
                      ${formatBackendUsdt6(dist.userMiningPayoutUsdt6)} USDT
                    </strong>
                    <div className="uni-dist-action">
                      <button
                        type="button"
                        className="uni-btn uni-btn--ghost uni-btn--sm"
                        data-testid={`inspect-distribution-${dist.id}`}
                        onClick={() => {
                          setActiveUnilevelView(dist)
                          setShowUnilevelModal(true)
                        }}
                      >
                        {isEn ? '20 Levels' : 'Ver 20 niveles'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="uni-empty-box">
                <p>
                  {isEn
                    ? 'No daily Unilevel distributions generated by your miners yet.'
                    : 'Aún no hay distribuciones diarias de ProfitShare registradas para tus mineros.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* SUB-VIEW C: DIRECT REFERRALS 10% LIST & TRANSACTIONS */}
        {(isFriendsTab || historyTab === 'direct') && (
          <div className="uni-direct-panel" data-testid="direct-referrals-subview">
            <div className="uni-direct-subblock">
              <h4 className="uni-subheading">
                {t('referral.direct_referrals')} ({directReferralsCount})
              </h4>
              {profile?.referral?.userReferrals && profile.referral.userReferrals.length > 0 ? (
                <div className="uni-direct-list">
                  {profile.referral.userReferrals.map((refItem, idx) => {
                    const record =
                      typeof refItem === 'object' && refItem !== null
                        ? (refItem as { email?: string; uid?: string })
                        : null
                    const refEmail =
                      typeof refItem === 'string' ? refItem : record?.email || record?.uid || ''
                    const userTxs = referralTransactions.filter(
                      (tx) => tx.buyerEmail?.toLowerCase() === refEmail.toLowerCase(),
                    )
                    const userComms = commissions.filter(
                      (c) => c.buyerEmail?.toLowerCase() === refEmail.toLowerCase(),
                    )
                    const repurchases =
                      userTxs.filter((tx) => tx.purchaseType === 'repurchase').length +
                      userComms.filter((c) => c.type === 'repurchase').length
                    const firstPurchases =
                      userTxs.filter((tx) => tx.purchaseType === 'first_purchase').length +
                      userComms.filter((c) => c.type === 'first_purchase').length

                    const statusLabel =
                      repurchases > 0
                        ? `${t('referral.repurchases')} (${repurchases})`
                        : firstPurchases > 0
                          ? t('referral.first_purchase')
                          : t('referral.registered')

                    return (
                      <div key={idx} className="uni-direct-row">
                        <span className="uni-level-badge">#{idx + 1}</span>
                        <span className="uni-direct-email">
                          {refEmail || t('referral.active_referral')}
                        </span>
                        <span className="uni-state-pill uni-state-pill--neutral">{statusLabel}</span>
                        <span className="uni-rate-pill">{t('referral.direct_bonus_badge')}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="uni-empty-box">
                  <p>{t('referral.empty_referrals')}</p>
                </div>
              )}
            </div>

            {!isFriendsTab && (referralTransactions.length > 0 || commissions.length > 0) && (
              <div className="uni-direct-subblock">
                <h4 className="uni-subheading">{t('referral.ledger_title')}</h4>
                <div className="uni-direct-list">
                  {referralTransactions.length > 0
                    ? referralTransactions.map((tx) => (
                        <div key={tx.id} className="uni-direct-row">
                          <span className="uni-state-pill uni-state-pill--credited">
                            {tx.type === 'withdrawal'
                              ? t('referral.type_withdrawal')
                              : tx.purchaseType === 'first_purchase'
                                ? t('referral.type_first_purchase')
                                : tx.purchaseType === 'repurchase'
                                  ? t('referral.type_repurchase')
                                  : `${t('referral.type_unilevel')} L${tx.level || 1}`}
                          </span>
                          <span className="uni-direct-email">{tx.description}</span>
                          <strong
                            className={`uni-cell-amount ${
                              tx.amount < 0 ? 'uni-cell-amount--neg' : 'uni-cell-amount--pos'
                            }`}
                          >
                            {tx.amount < 0
                              ? `-$${Math.abs(tx.amount).toFixed(2)} USD`
                              : `+$${tx.amount.toFixed(2)} USD`}
                          </strong>
                        </div>
                      ))
                    : commissions.map((c) => (
                        <div key={c.id} className="uni-direct-row">
                          <span className="uni-state-pill uni-state-pill--credited">
                            {c.type === 'repurchase'
                              ? t('referral.type_repurchase')
                              : t('referral.type_first_purchase')}
                          </span>
                          <span className="uni-direct-email">
                            {c.buyerEmail} · {c.minerId}
                          </span>
                          <strong className="uni-cell-amount uni-cell-amount--pos">
                            +${c.commissionAmount.toFixed(2)} USD
                          </strong>
                        </div>
                      ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* (5) REUSED AGGREGATED WITHDRAWALS FLOW (POST /api/withdrawals/request, MIN 10 USDT, GET /api/withdrawals/me) */}
      {!isFriendsTab && (
        <UnilevelAggregatedWithdrawalSection
          user={user}
          connectedWalletAddress={(profile as { walletAddress?: string | null } | null)?.walletAddress ?? null}
          receivedUnilevelCommission={receivedUnilevelCommission}
          organizationGeneratedProfitShare={organizationGeneratedProfitShare}
          ownMiningProfit={ownMiningProfit}
          isEn={isEn}
        />
      )}

      {showUnilevelModal && activeUnilevelView && renderUnilevelModal()}
    </div>
  )

  function renderUnilevelModal() {
    if (!activeUnilevelView) return null

    const modalNode = (
      <div
        className="uni-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="uni-modal-title"
        onClick={() => setShowUnilevelModal(false)}
      >
        <div className="uni-modal-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="uni-modal-header">
            <div>
              <span className="uni-step-chip">
                {activeUnilevelView.planVersion || 'UNILEVEL_V1'} ·{' '}
                {activeUnilevelView.periodDate || activeUnilevelView.date || '—'}
              </span>
              <h3 id="uni-modal-title">{t('unilevel.modal_title')}</h3>
            </div>
            <button
              type="button"
              className="uni-btn uni-btn--ghost uni-btn--sm"
              onClick={() => setShowUnilevelModal(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="uni-modal-summary">
            <div className="uni-modal-stat">
              <span>{t('unilevel.eligible_profit')}</span>
              <strong>${formatBackendUsdt6(activeUnilevelView.eligibleProfitUsdt6)} USDT</strong>
            </div>
            <div className="uni-modal-stat">
              <span>{t('unilevel.pool_20')}</span>
              <strong>${formatBackendUsdt6(activeUnilevelView.expectedPoolUsdt6)} USDT</strong>
            </div>
            <div className="uni-modal-stat uni-modal-stat--emerald">
              <span>{t('unilevel.total_credited')}</span>
              <strong>${formatBackendUsdt6(activeUnilevelView.distributedUsdt6)} USDT</strong>
            </div>
            <div className="uni-modal-stat">
              <span>{isEn ? 'Returned to Miner' : 'Retornado al Minero'}</span>
              <strong>${formatBackendUsdt6(activeUnilevelView.undistributedUsdt6)} USDT</strong>
            </div>
          </div>

          <div className="uni-modal-meta">
            <span>
              {t('unilevel.distribution_id')}{' '}
              <code>{activeUnilevelView.distributionId || activeUnilevelView.id}</code>
            </span>
            <span>
              {isEn ? 'Miner Total Payout:' : 'Pago Total Minero:'}{' '}
              <strong>${formatBackendUsdt6(activeUnilevelView.userMiningPayoutUsdt6)} USDT</strong>
            </span>
          </div>

          <div className="uni-modal-levels">
            {(activeUnilevelView.levels || []).map((lvl) => {
              const isCredited = lvl.status === 'CREDITED'
              return (
                <div key={lvl.level} className="uni-modal-level-row">
                  <span className="uni-level-badge">L{String(lvl.level).padStart(2, '0')}</span>
                  <span className="uni-level-pct">
                    {formatRateLabel(lvl.rateString, lvl.level)}
                  </span>
                  <span className="uni-modal-upline">
                    {lvl.uplineUserId ? (
                      <code>{maskIdentifier(lvl.uplineUserId)}</code>
                    ) : (
                      <span>{t('unilevel.sponsor_empty')}</span>
                    )}
                  </span>
                  <span
                    className={`uni-state-pill ${
                      isCredited ? 'uni-state-pill--credited' : 'uni-state-pill--neutral'
                    }`}
                  >
                    {lvl.status}
                  </span>
                  <strong
                    className={`uni-cell-amount ${
                      isCredited ? 'uni-cell-amount--pos' : 'uni-cell-amount--muted'
                    }`}
                  >
                    ${formatBackendUsdt6(lvl.creditedUsdt6)} USDT
                  </strong>
                </div>
              )
            })}
          </div>

          <div className="uni-modal-footer">
            <span>
              {t('unilevel.unclaimed_pool')}{' '}
              <strong>${formatBackendUsdt6(activeUnilevelView.undistributedUsdt6)} USDT</strong>
            </span>
            <button
              type="button"
              className="uni-btn uni-btn--emerald uni-btn--sm"
              onClick={() => setShowUnilevelModal(false)}
            >
              {t('common.understood')}
            </button>
          </div>
        </div>
      </div>
    )

    if (typeof document !== 'undefined' && document.body) {
      return createPortal(modalNode, document.body)
    }
    return modalNode
  }
}

const UNILEVEL_F5_STYLES = `
.referral-page-container[data-testid="unilevel-referral-page"],
.uni-modal-backdrop {
  --uni-bg-deep: #050505;
  --uni-surface: #0a0b0e;
  --uni-surface-elevated: #0e1015;
  --uni-surface-subtle: #12151c;
  --uni-border: rgba(255, 255, 255, 0.09);
  --uni-border-strong: rgba(255, 255, 255, 0.15);
  --uni-emerald: #10b981;
  --uni-emerald-bright: #34d399;
  --uni-emerald-soft: rgba(16, 185, 129, 0.12);
  --uni-emerald-border: rgba(16, 185, 129, 0.30);
  --uni-amber: #f59e0b;
  --uni-amber-soft: rgba(245, 158, 11, 0.12);
  --uni-danger: #ef4444;
  --uni-text: #f4f4f5;
  --uni-text-secondary: #a1a1aa;
  --uni-text-muted: #71717a;
  --uni-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --uni-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}

.referral-page-container[data-testid="unilevel-referral-page"] {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1140px;
  margin: 0 auto;
  padding: 6px 0 28px;
  width: 100%;
  color: var(--uni-text);
}

.referral-page-container[data-testid="unilevel-referral-page"] *,
.uni-modal-backdrop * {
  box-sizing: border-box;
}

.referral-page-container[data-testid="unilevel-referral-page"] :focus-visible,
.uni-modal-backdrop :focus-visible {
  outline: 2px solid rgba(52, 211, 153, 0.78);
  outline-offset: 2px;
}

.uni-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1250;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 12px;
  background: #0e1015;
  border: 1px solid var(--uni-emerald-border);
  color: var(--uni-emerald-bright);
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.55);
}

.uni-hero-panel,
.uni-panel,
.uni-unauth-card {
  background: var(--uni-surface);
  border: 1px solid var(--uni-border);
  border-radius: 20px;
  padding: 22px 24px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.uni-hero-panel {
  background:
    radial-gradient(ellipse 58% 85% at 6% 0%, rgba(16, 185, 129, 0.14), transparent 62%),
    var(--uni-surface);
}

.uni-unauth-card {
  max-width: 620px;
  margin: 28px auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background:
    radial-gradient(ellipse 65% 80% at 50% 0%, rgba(16, 185, 129, 0.14), transparent 64%),
    var(--uni-surface);
}

.uni-unauth-badge,
.uni-kicker-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  padding: 5px 11px;
  border-radius: 999px;
  background: var(--uni-emerald-soft);
  border: 1px solid var(--uni-emerald-border);
  color: var(--uni-emerald-bright);
  font-family: var(--uni-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.uni-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--uni-emerald-bright);
  box-shadow: 0 0 10px rgba(52, 211, 153, 0.75);
}

.uni-unauth-card h2,
.uni-hero-main h2 {
  margin: 0;
  font-size: clamp(21px, 2.3vw, 27px);
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--uni-text);
}

.uni-unauth-card p,
.uni-hero-lead {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--uni-text-secondary);
}

.uni-unauth-specs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.uni-unauth-spec-item {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--uni-surface-elevated);
  border: 1px solid var(--uni-border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.uni-unauth-spec-item span {
  font-size: 11px;
  color: var(--uni-text-muted);
}

.uni-unauth-spec-item strong {
  font-family: var(--uni-mono);
  font-size: 18px;
  color: var(--uni-emerald-bright);
  font-variant-numeric: tabular-nums;
}

.uni-unauth-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.uni-hero-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.uni-hero-topbar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.uni-protocol-tag,
.uni-readonly-chip {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--uni-border);
  font-family: var(--uni-mono);
  font-size: 11px;
  color: var(--uni-text-secondary);
  letter-spacing: 0.04em;
}

.uni-hero-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(300px, 0.9fr);
  gap: 18px;
  align-items: stretch;
}

.uni-hero-main {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
}

.uni-invite-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: 12px;
  margin-top: 4px;
}

.uni-copy-capsule {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--uni-surface-elevated);
  border: 1px solid var(--uni-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.uni-field-label {
  font-family: var(--uni-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--uni-text-muted);
}

.uni-copy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.uni-mono-code {
  font-family: var(--uni-mono);
  font-size: 15px;
  font-weight: 700;
  color: var(--uni-emerald-bright);
  letter-spacing: 0.04em;
}

.uni-invite-url {
  font-family: var(--uni-mono);
  font-size: 12px;
  color: var(--uni-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.uni-hero-aside {
  padding: 16px 18px;
  border-radius: 16px;
  background: var(--uni-surface-elevated);
  border: 1px solid var(--uni-border);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
}

.uni-aside-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.uni-aside-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.uni-aside-tag {
  font-family: var(--uni-mono);
  font-size: 10px;
  color: var(--uni-emerald-bright);
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--uni-emerald-soft);
  border: 1px solid var(--uni-emerald-border);
}

.uni-withdraw-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.uni-withdraw-figure {
  font-family: var(--uni-mono);
  font-size: 24px;
  font-weight: 800;
  color: var(--uni-text);
  font-variant-numeric: tabular-nums;
}

.uni-aside-divider {
  height: 1px;
  background: var(--uni-border);
}

.uni-sponsor-linked {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.uni-sponsor-text {
  font-size: 13px;
  color: var(--uni-text-secondary);
}

.uni-mono-pill,
.uni-mono-capsule {
  font-family: var(--uni-mono);
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--uni-border);
  color: var(--uni-emerald-bright);
}

.uni-sponsor-form {
  display: flex;
  gap: 8px;
  align-items: center;
}

.uni-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--uni-bg-deep);
  border: 1px solid var(--uni-border-strong);
  color: var(--uni-text);
  font-family: var(--uni-mono);
  font-size: 12.5px;
  transition: border-color 160ms var(--uni-ease-out), box-shadow 160ms var(--uni-ease-out);
}

.uni-input:focus {
  outline: none;
  border-color: var(--uni-emerald-bright);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.16);
}

.uni-sponsor-feedback {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--uni-emerald-bright);
}

.uni-sponsor-feedback--err {
  color: #f87171;
}

/* Interactive Buttons (Emil Kowalski: explicit property transitions + scale(0.97) on press) */
.uni-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  padding: 0 16px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
  user-select: none;
  transition:
    transform 150ms var(--uni-ease-out),
    background-color 170ms var(--uni-ease-out),
    border-color 170ms var(--uni-ease-out),
    color 170ms var(--uni-ease-out);
}

.uni-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.uni-btn:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.uni-btn--sm {
  height: 34px;
  padding: 0 12px;
  font-size: 12px;
  border-radius: 9px;
}

.uni-btn--emerald {
  background: var(--uni-emerald);
  border-color: rgba(52, 211, 153, 0.45);
  color: #04130d;
  font-weight: 700;
}

.uni-btn--emerald:hover:not(:disabled) {
  background: var(--uni-emerald-bright);
}

.uni-btn--ghost {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--uni-border-strong);
  color: var(--uni-text);
}

.uni-btn--ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(52, 211, 153, 0.40);
}

.uni-btn--subtle {
  background: transparent;
  border-color: var(--uni-border);
  color: var(--uni-text-secondary);
}

.uni-btn--subtle:hover:not(:disabled) {
  color: var(--uni-text);
  border-color: var(--uni-border-strong);
}

.uni-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 13px 18px;
  border-radius: 14px;
  background: rgba(245, 158, 11, 0.09);
  border: 1px solid rgba(245, 158, 11, 0.30);
}

.uni-error-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
  color: #fde68a;
}

/* Section Headers */
.uni-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 18px;
}

.uni-step-chip {
  display: inline-block;
  font-family: var(--uni-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--uni-emerald-bright);
  margin-bottom: 5px;
}

.uni-section-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--uni-text);
}

/* (1) 3 Separated Metrics Deck */
.uni-metrics-deck {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.uni-metrics-deck.is-loading {
  opacity: 0.72;
}

.uni-metric-card {
  padding: 18px 20px;
  border-radius: 16px;
  background: var(--uni-surface-elevated);
  border: 1px solid var(--uni-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.uni-metric-card--emerald {
  background:
    radial-gradient(ellipse 80% 90% at 100% 0%, rgba(16, 185, 129, 0.14), transparent 64%),
    var(--uni-surface-elevated);
  border-color: var(--uni-emerald-border);
}

.uni-metric-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.uni-metric-kicker {
  font-family: var(--uni-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--uni-text-secondary);
}

.uni-metric-kicker--emerald {
  color: var(--uni-emerald-bright);
}

.uni-metric-key {
  font-family: var(--uni-mono);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--uni-text-muted);
}

.uni-metric-key--emerald {
  background: var(--uni-emerald-soft);
  color: var(--uni-emerald-bright);
}

.uni-metric-value-row {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin-top: 2px;
}

.uni-metric-figure {
  font-family: var(--uni-mono);
  font-size: clamp(24px, 2.4vw, 30px);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--uni-text);
  font-variant-numeric: tabular-nums;
}

.uni-metric-figure--emerald {
  color: var(--uni-emerald-bright);
}

.uni-metric-unit {
  font-family: var(--uni-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--uni-text-muted);
}

.uni-metric-unit--emerald {
  color: var(--uni-emerald-bright);
}

.uni-metric-exact {
  font-family: var(--uni-mono);
  font-size: 11.5px;
  color: var(--uni-text-secondary);
  font-variant-numeric: tabular-nums;
}

.uni-metric-exact--emerald {
  color: #6ee7b7;
}

.uni-metric-desc {
  margin: 2px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--uni-text-muted);
}

/* Direct 10% Separation Strip */
.uni-direct-strip {
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #08090c;
  border: 1px solid var(--uni-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.uni-direct-strip-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12.5px;
  color: var(--uni-text-secondary);
  max-width: 560px;
}

.uni-direct-tag {
  width: fit-content;
  font-family: var(--uni-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--uni-text);
}

.uni-direct-strip-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px;
}

.uni-direct-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.uni-direct-stat span {
  font-size: 11px;
  color: var(--uni-text-muted);
}

.uni-direct-stat strong {
  font-family: var(--uni-mono);
  font-size: 14px;
  color: var(--uni-text);
  font-variant-numeric: tabular-nums;
}

/* (3) Eligibility Section */
.uni-eligibility-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  font-family: var(--uni-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.uni-eligibility-pill--active {
  background: var(--uni-emerald-soft);
  border: 1px solid var(--uni-emerald-border);
  color: var(--uni-emerald-bright);
}

.uni-eligibility-pill--pending {
  background: var(--uni-amber-soft);
  border: 1px solid rgba(245, 158, 11, 0.34);
  color: #fbbf24;
}

.uni-eligibility-dot,
.uni-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
}

.uni-status-dot--ok {
  color: var(--uni-emerald-bright);
}

.uni-eligibility-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.uni-req-card {
  padding: 15px 16px;
  border-radius: 14px;
  background: var(--uni-surface-elevated);
  border: 1px solid var(--uni-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.uni-req-card.is-met {
  border-color: rgba(16, 185, 129, 0.28);
}

.uni-req-card.is-unmet {
  border-color: rgba(245, 158, 11, 0.28);
}

.uni-req-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.uni-req-icon {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.uni-req-card.is-met .uni-req-icon {
  background: var(--uni-emerald-soft);
  color: var(--uni-emerald-bright);
}

.uni-req-card.is-unmet .uni-req-icon {
  background: var(--uni-amber-soft);
  color: #fbbf24;
}

.uni-req-card.is-unverified .uni-req-icon {
  background: rgba(255, 255, 255, 0.05);
  color: var(--uni-text-secondary);
}

.uni-req-code {
  font-family: var(--uni-mono);
  font-size: 10.5px;
  color: var(--uni-text-muted);
}

.uni-req-title {
  font-size: 13.5px;
  color: var(--uni-text);
}

.uni-req-state {
  font-size: 12px;
  color: var(--uni-text-secondary);
}

.uni-req-counter {
  font-family: var(--uni-mono);
  color: var(--uni-emerald-bright);
  font-variant-numeric: tabular-nums;
}

.uni-req-card.is-unmet .uni-req-counter {
  color: #fbbf24;
}

.uni-eligibility-note {
  margin: 14px 0 0;
  padding: 11px 14px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid var(--uni-border);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--uni-text-secondary);
}

.uni-eligibility-note strong {
  color: var(--uni-text);
}

/* (2) 20-Level Tree & Breakdown */
.uni-tree-counters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.uni-counter-chip {
  padding: 5px 10px;
  border-radius: 9px;
  background: var(--uni-surface-elevated);
  border: 1px solid var(--uni-border);
  font-size: 12px;
  color: var(--uni-text-secondary);
}

.uni-counter-chip strong {
  font-family: var(--uni-mono);
  color: var(--uni-text);
  margin-left: 3px;
  font-variant-numeric: tabular-nums;
}

.uni-counter-chip--emerald {
  border-color: var(--uni-emerald-border);
  background: var(--uni-emerald-soft);
}

.uni-counter-chip--emerald strong {
  color: var(--uni-emerald-bright);
}

.uni-allocation-box {
  padding: 13px 16px;
  border-radius: 14px;
  background: var(--uni-surface-elevated);
  border: 1px solid var(--uni-border);
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.uni-allocation-labels {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: var(--uni-text-secondary);
}

.uni-allocation-labels strong {
  font-family: var(--uni-mono);
  color: var(--uni-text);
}

.uni-allocation-emerald,
.uni-allocation-emerald strong {
  color: var(--uni-emerald-bright);
}

.uni-allocation-track {
  display: flex;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: #181b22;
  gap: 3px;
}

.uni-allocation-segment--miner {
  width: 80%;
  background: rgba(244, 244, 245, 0.28);
  border-radius: 999px 2px 2px 999px;
}

.uni-allocation-segment--pool {
  width: 20%;
  background: linear-gradient(90deg, #10b981, #34d399);
  border-radius: 2px 999px 999px 2px;
}

.uni-levels-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.uni-levels-col {
  border-radius: 14px;
  background: var(--uni-surface-elevated);
  border: 1px solid var(--uni-border);
  overflow: hidden;
}

.uni-levels-col-header {
  display: grid;
  grid-template-columns: 52px 62px minmax(52px, 0.65fr) minmax(0, 1.35fr);
  gap: 10px;
  padding: 9px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid var(--uni-border);
  font-family: var(--uni-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--uni-text-muted);
}

.uni-level-row {
  display: grid;
  grid-template-columns: 52px 62px minmax(52px, 0.65fr) minmax(0, 1.35fr);
  gap: 10px;
  align-items: center;
  padding: 8px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.045);
  font-size: 12.5px;
}

.uni-level-row:last-child {
  border-bottom: none;
}

.uni-level-row.has-upline {
  background: rgba(16, 185, 129, 0.04);
}

.uni-level-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-width: 40px;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--uni-border);
  font-family: var(--uni-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--uni-text);
  font-variant-numeric: tabular-nums;
}

.uni-level-pct {
  font-family: var(--uni-mono);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--uni-emerald-bright);
  font-variant-numeric: tabular-nums;
}

.uni-level-bar-wrap {
  display: block;
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.uni-level-bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #059669, #34d399);
}

.uni-level-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}

.uni-node-code {
  font-family: var(--uni-mono);
  font-size: 11.5px;
  color: var(--uni-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.uni-node-status {
  font-family: var(--uni-mono);
  font-size: 9.5px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.uni-node-status--active {
  background: var(--uni-emerald-soft);
  color: var(--uni-emerald-bright);
  border: 1px solid var(--uni-emerald-border);
}

.uni-node-status--inactive {
  background: var(--uni-amber-soft);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.30);
}

.uni-level-vacant {
  font-size: 11.5px;
  color: var(--uni-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* (4) History & Subtabs */
.uni-subtabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px;
  border-radius: 12px;
  background: var(--uni-bg-deep);
  border: 1px solid var(--uni-border);
}

.uni-subtab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--uni-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 140ms var(--uni-ease-out),
    background-color 160ms var(--uni-ease-out),
    color 160ms var(--uni-ease-out);
}

.uni-subtab:active {
  transform: scale(0.97);
}

.uni-subtab.is-active {
  background: var(--uni-surface-elevated);
  color: var(--uni-emerald-bright);
  box-shadow: inset 0 0 0 1px var(--uni-emerald-border);
}

.uni-subtab-count {
  font-family: var(--uni-mono);
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-variant-numeric: tabular-nums;
}

.uni-ledger-list,
.uni-direct-list {
  border-radius: 14px;
  background: var(--uni-surface-elevated);
  border: 1px solid var(--uni-border);
  overflow: hidden;
}

.uni-ledger-head {
  display: grid;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid var(--uni-border);
  font-family: var(--uni-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--uni-text-muted);
}

.uni-ledger-head--received,
.uni-ledger-row--received {
  grid-template-columns: 110px 130px minmax(0, 1fr) 110px 160px;
}

.uni-ledger-head--dist,
.uni-ledger-row--dist {
  grid-template-columns: minmax(140px, 1.2fr) repeat(4, minmax(95px, 1fr)) 130px;
}

.uni-ledger-row,
.uni-direct-row {
  display: grid;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 12.5px;
}

.uni-ledger-row:last-child,
.uni-direct-row:last-child {
  border-bottom: none;
}

.uni-direct-row {
  grid-template-columns: auto minmax(0, 1fr) auto auto;
}

.uni-dist-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.uni-dist-action {
  display: flex;
  justify-content: flex-end;
}

.uni-align-right {
  text-align: right;
}

.uni-cell-mono {
  font-family: var(--uni-mono);
  font-size: 12px;
  color: var(--uni-text-secondary);
  font-variant-numeric: tabular-nums;
}

.uni-text-emerald {
  color: var(--uni-emerald-bright);
}

.uni-text-bright {
  color: var(--uni-text);
}

.uni-cell-badges {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.uni-rate-pill {
  font-family: var(--uni-mono);
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--uni-emerald-soft);
  color: var(--uni-emerald-bright);
  border: 1px solid var(--uni-emerald-border);
  font-variant-numeric: tabular-nums;
}

.uni-state-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  font-family: var(--uni-mono);
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0.04em;
}

.uni-state-pill--credited {
  background: var(--uni-emerald-soft);
  color: var(--uni-emerald-bright);
  border: 1px solid var(--uni-emerald-border);
}

.uni-state-pill--reversed {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.30);
}

.uni-state-pill--neutral {
  background: rgba(255, 255, 255, 0.05);
  color: var(--uni-text-secondary);
  border: 1px solid var(--uni-border);
}

.uni-cell-amount {
  font-family: var(--uni-mono);
  font-size: 13px;
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.uni-cell-amount--pos {
  color: var(--uni-emerald-bright);
}

.uni-cell-amount--neg {
  color: #f87171;
}

.uni-cell-amount--muted {
  color: var(--uni-text-muted);
}

.uni-direct-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.uni-subheading {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--uni-text);
}

.uni-direct-email {
  font-size: 12.5px;
  color: var(--uni-text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.uni-empty-box {
  padding: 26px 18px;
  border-radius: 14px;
  background: var(--uni-surface-elevated);
  border: 1px dashed var(--uni-border-strong);
  text-align: center;
}

.uni-empty-box p {
  margin: 0;
  font-size: 13px;
  color: var(--uni-text-muted);
}

/* Portal Modal (transform-origin: center, never scale(0)) */
.uni-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(5, 5, 5, 0.78);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}

.uni-modal-dialog {
  width: 100%;
  max-width: 680px;
  max-height: min(86vh, 760px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border-radius: 20px;
  background: #0a0b0e;
  border: 1px solid var(--uni-border-strong);
  color: var(--uni-text);
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.72);
  transform-origin: center;
  transition: transform 200ms var(--uni-ease-out), opacity 200ms var(--uni-ease-out);
}

@starting-style {
  .uni-modal-dialog {
    opacity: 0;
    transform: scale(0.96);
  }
}

.uni-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.uni-modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.uni-modal-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.uni-modal-stat {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--uni-surface-elevated);
  border: 1px solid var(--uni-border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.uni-modal-stat--emerald {
  border-color: var(--uni-emerald-border);
  background: var(--uni-emerald-soft);
}

.uni-modal-stat span {
  font-size: 10.5px;
  color: var(--uni-text-muted);
}

.uni-modal-stat strong {
  font-family: var(--uni-mono);
  font-size: 12.5px;
  color: var(--uni-text);
  font-variant-numeric: tabular-nums;
}

.uni-modal-stat--emerald strong {
  color: var(--uni-emerald-bright);
}

.uni-modal-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: var(--uni-text-secondary);
}

.uni-modal-meta code,
.uni-modal-upline code {
  font-family: var(--uni-mono);
  color: var(--uni-emerald-bright);
}

.uni-modal-levels {
  overflow-y: auto;
  border-radius: 12px;
  background: var(--uni-surface-elevated);
  border: 1px solid var(--uni-border);
  max-height: 340px;
}

.uni-modal-level-row {
  display: grid;
  grid-template-columns: 52px 62px minmax(0, 1fr) 96px 148px;
  gap: 10px;
  align-items: center;
  padding: 8px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.045);
  font-size: 12px;
}

.uni-modal-level-row:last-child {
  border-bottom: none;
}

.uni-modal-upline {
  color: var(--uni-text-muted);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.uni-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12.5px;
  color: var(--uni-text-secondary);
}

/* Responsive Breakpoints (Tablet & 390px Mobile — zero horizontal overflow) */
@media (max-width: 980px) {
  .uni-hero-layout,
  .uni-metrics-deck,
  .uni-eligibility-grid,
  .uni-levels-columns {
    grid-template-columns: minmax(0, 1fr);
  }

  .uni-invite-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .uni-modal-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .uni-hero-panel,
  .uni-panel,
  .uni-unauth-card {
    padding: 16px;
    border-radius: 16px;
  }

  .uni-unauth-specs {
    grid-template-columns: minmax(0, 1fr);
  }

  .uni-levels-col-header {
    display: none;
  }

  .uni-level-row {
    grid-template-columns: 44px 54px minmax(0, 1fr);
    gap: 8px;
    padding: 9px 12px;
  }

  .uni-level-bar-wrap {
    display: none;
  }

  .uni-ledger-head {
    display: none;
  }

  .uni-ledger-row--received,
  .uni-ledger-row--dist,
  .uni-direct-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding: 12px 14px;
  }

  .uni-cell-amount {
    text-align: left;
  }

  .uni-dist-action {
    justify-content: flex-start;
  }

  .uni-sponsor-form {
    flex-direction: column;
    align-items: stretch;
  }

  .uni-modal-dialog {
    padding: 16px;
  }

  .uni-modal-summary {
    grid-template-columns: minmax(0, 1fr);
  }

  .uni-modal-level-row {
    grid-template-columns: 46px 56px minmax(0, 1fr);
    gap: 6px;
  }

  .uni-modal-level-row .uni-cell-amount {
    grid-column: 1 / -1;
  }
}
`
