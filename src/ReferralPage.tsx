import { useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import {
  getReferralAccount,
  getReferralTransactions,
  executeReferralWithdrawal,
  getUserCommissions,
  getUnilevelAccount,
  getUnilevelDistributions,
  executeUnilevelDistribution,
  assignSponsorToUser,
  useRealtimeUserMiners,
  type ReferralAccount,
  type ReferralTransaction,
  type ReferralCommission,
  type UnilevelAccount,
  type UnilevelDistributionDoc,
} from './firebase'
import { usePersonalization } from './personalization'

export function ReferralPage({ pathname = '/nft-referral' }: { pathname?: string } = {}) {
  const { user, profile, refreshProfile, openAuthModal } = useAuth()
  const { t } = usePersonalization()
  const isFriendsTab = pathname.endsWith('/friends')
  const isRewardsTab = pathname.endsWith('/rewards')

  const [referralAccount, setReferralAccount] = useState<ReferralAccount | null>(null)
  const [referralTransactions, setReferralTransactions] = useState<ReferralTransaction[]>([])
  const [commissions, setCommissions] = useState<ReferralCommission[]>([])
  const [unilevelAccount, setUnilevelAccount] = useState<UnilevelAccount | null>(null)
  const [unilevelHistory, setUnilevelHistory] = useState<UnilevelDistributionDoc[]>([])
  const { miners } = useRealtimeUserMiners(user?.uid)

  const [copyFeedback, setCopyFeedback] = useState('')
  const [sponsorInput, setSponsorInput] = useState('')
  const [sponsorFeedback, setSponsorFeedback] = useState('')
  const [settingSponsor, setSettingSponsor] = useState(false)

  // Withdrawal modal state
  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawWallet, setWithdrawWallet] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawFeedback, setWithdrawFeedback] = useState('')

  // Unilevel modal state
  const [simulatingUnilevel, setSimulatingUnilevel] = useState(false)
  const [activeUnilevelView, setActiveUnilevelView] = useState<UnilevelDistributionDoc | null>(null)
  const [showUnilevelModal, setShowUnilevelModal] = useState(false)

  // Load data from Firestore
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

    getUnilevelAccount(user.uid)
      .then((uni) => {
        if (active) setUnilevelAccount(uni)
      })
      .catch(() => {})

    getUnilevelDistributions(user.uid)
      .then((dists) => {
        if (active) setUnilevelHistory(dists)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [user, profile?.commissionBalance])

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyFeedback(`¡${label} ${t('common.copied')}!`)
      setTimeout(() => setCopyFeedback(''), 2500)
    } catch {
      setCopyFeedback('No se pudo copiar')
      setTimeout(() => setCopyFeedback(''), 2500)
    }
  }

  const referralCode =
    profile?.referral?.referralCode || (user ? `GM${user.uid.slice(0, 6).toUpperCase()}` : 'GOMINING')
  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${referralCode}`
      : `/?ref=${referralCode}`

  const directReferralsCount =
    profile?.referral?.userReferrals?.length || referralAccount?.directReferralsCount || 0
  const totalCommissionsEarned =
    referralAccount?.totalCommissionsEarned ??
    profile?.totalCommissionsEarned ??
    commissions.reduce((sum, c) => sum + (c.commissionAmount || 0), 0)
  const withdrawableBalance =
    referralAccount?.withdrawableBalance ?? profile?.commissionBalance ?? 0
  const totalWithdrawn = referralAccount?.totalWithdrawn ?? 0

  const handleExecuteWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    const numAmount = parseFloat(withdrawAmount)
    if (!numAmount || numAmount <= 0) {
      setWithdrawFeedback(t('referral.enter_valid_amount'))
      return
    }
    const currentAvailable = withdrawableBalance
    if (numAmount > currentAvailable) {
      setWithdrawFeedback(
        `${t('referral.insufficient_balance')} (max: $${currentAvailable.toFixed(2)} USD).`
      )
      return
    }

    setWithdrawing(true)
    setWithdrawFeedback('')
    try {
      const destWallet = withdrawWallet.trim() || profile?.walletAddress || undefined
      const res = await executeReferralWithdrawal(user.uid, numAmount, destWallet)
      if (!res.success) {
        setWithdrawFeedback(res.error || t('referral.withdrawal_error'))
        return
      }
      await refreshProfile()
      const acc = await getReferralAccount(user.uid)
      setReferralAccount(acc)
      const txs = await getReferralTransactions(user.uid)
      setReferralTransactions(txs)
      setWithdrawalModalOpen(false)
      setWithdrawAmount('')
      setWithdrawFeedback('')
      setCopyFeedback(
        `${t('referral.withdrawal_success')} ($${numAmount.toFixed(2)} USD)`
      )
      setTimeout(() => setCopyFeedback(''), 3000)
    } catch (err: any) {
      setWithdrawFeedback(err?.message || t('referral.withdrawal_error'))
    } finally {
      setWithdrawing(false)
    }
  }

  const handleAddSponsor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !sponsorInput.trim()) return
    setSettingSponsor(true)
    setSponsorFeedback('')
    try {
      const result = await assignSponsorToUser(user.uid, user.email || '', sponsorInput.trim())
      if (!result.success) {
        setSponsorFeedback(result.error || t('referral.invalid_sponsor_code'))
        return
      }
      await refreshProfile()
      const uni = await getUnilevelAccount(user.uid)
      setUnilevelAccount(uni)
      setSponsorFeedback(`${t('referral.sponsor_linked_success')} (${result.sponsorCode})`)
      setSponsorInput('')
    } catch (err: any) {
      setSponsorFeedback(err?.message || t('referral.invalid_sponsor_code'))
    } finally {
      setSettingSponsor(false)
    }
  }

  const handleTriggerUnilevel = async () => {
    if (!user) return
    setSimulatingUnilevel(true)
    try {
      const targetMinerId = miners[0]?.id || 'MINER-SAMPLE-20L'
      const grossDaily = 120 // $120 USD daily gross mining profit
      const dailyCosts = 20 // $20 USD operating costs
      const distDoc = await executeUnilevelDistribution(user.uid, targetMinerId, grossDaily, dailyCosts)
      setActiveUnilevelView(distDoc)
      setShowUnilevelModal(true)
      const updatedDists = await getUnilevelDistributions(user.uid)
      setUnilevelHistory(updatedDists)
    } catch (err) {
      console.error('Error running unilevel distribution:', err)
    } finally {
      setSimulatingUnilevel(false)
    }
  }

  if (!user) {
    return (
      <div className="referral-page-container">
        <div className="profile-unauth-card" style={{ maxWidth: 560, margin: '40px auto' }}>
          <div className="profile-unauth-icon">♧</div>
          <h2>{t('referral.page_title')}</h2>
          <p>{t('referral.page_subtitle')}</p>
          <div className="profile-unauth-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => openAuthModal('register')}
            >
              {t('profile.create_account')}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => openAuthModal('login')}
            >
              {t('profile.login')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="referral-page-container" style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 20px' }}>
      {copyFeedback && (
        <div className="toast" role="status">
          <span>✓</span>
          {copyFeedback}
        </div>
      )}

      {/* HEADER HERO */}
      <section className="content-panel referral-proposal-hero" style={{ marginBottom: 20 }}>
        <div className="referral-commission-icon">♧</div>
        <div className="referral-proposal-copy">
          <p className="card-kicker">{t('referral.kicker_20_levels')}</p>
          <h2>{t('referral.page_title')}</h2>
          <p>{t('referral.page_subtitle')}</p>
        </div>
        <span className="proposal-badge">{t('referral.badge_20_levels')}</span>
      </section>

      {/* FINANCIAL STATS CARDS */}
      {!isFriendsTab && (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--panel)',
            border: '1.5px solid var(--border)',
            borderRadius: 16,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            {t('referral.commissions_earned')}
          </span>
          <strong style={{ fontSize: 24, color: '#10b981' }}>
            ${totalCommissionsEarned.toFixed(2)} USD
          </strong>
        </div>

        <div
          style={{
            padding: '16px 20px',
            background: 'var(--panel)',
            border: '1.5px solid var(--border)',
            borderRadius: 16,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            {t('referral.withdrawable_balance')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 24, color: '#818cf8' }}>
              ${withdrawableBalance.toFixed(2)} USD
            </strong>
            {withdrawableBalance > 0 && (
              <button
                type="button"
                className="button button-primary button-small"
                onClick={() => setWithdrawalModalOpen(true)}
              >
                💸 {t('referral.withdraw_btn')}
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            background: 'var(--panel)',
            border: '1.5px solid var(--border)',
            borderRadius: 16,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            {t('referral.total_withdrawn')}
          </span>
          <strong style={{ fontSize: 24, color: totalWithdrawn > 0 ? '#ef4444' : 'var(--muted)' }}>
            ${totalWithdrawn.toFixed(2)} USD
          </strong>
        </div>
      </div>
      )}

      {/* UNILEVEL NETWORK OVERVIEW (20 LEVELS) */}
      {!isRewardsTab && (
        <>
          <div className="content-panel" style={{ padding: 22, marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>
              {t('referral.tree_structure_title')}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              {t('referral.tree_structure_sub')}
            </p>
          </div>
          <button
            type="button"
            className="button button-primary button-small"
            onClick={handleTriggerUnilevel}
            disabled={simulatingUnilevel}
          >
            {simulatingUnilevel ? t('referral.calculating') : t('referral.run_unilevel_btn')}
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}
          >
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
              {t('referral.direct_referrals')}
            </span>
            <strong style={{ fontSize: 20, color: 'var(--text)' }}>
              {unilevelAccount?.directCount ?? directReferralsCount}
            </strong>
          </div>

          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(124, 58, 237, 0.08)',
              border: '1.5px solid rgba(124, 58, 237, 0.25)',
              borderRadius: 12,
            }}
          >
            <span style={{ display: 'block', fontSize: 11, color: '#a78bfa' }}>
              {t('referral.network_team')}
            </span>
            <strong style={{ fontSize: 20, color: '#a78bfa' }}>
              {unilevelAccount?.totalTeamCount ?? directReferralsCount}
            </strong>
          </div>

          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1.5px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 12,
            }}
          >
            <span style={{ display: 'block', fontSize: 11, color: '#10b981' }}>
              {t('referral.active_levels')}
            </span>
            <strong style={{ fontSize: 20, color: '#10b981' }}>{t('referral.levels_20')}</strong>
          </div>

          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}
          >
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
              {t('referral.upline_chain')}
            </span>
            <strong style={{ fontSize: 20, color: 'var(--text)' }}>
              {unilevelAccount?.uplines?.length
                ? `${unilevelAccount.uplines.length} ${t('referral.uplines_word')}`
                : t('referral.root_node')}
            </strong>
          </div>
        </div>

        {/* INVITE CODE & LINK */}
        <div className="profile-referral-tools" style={{ marginTop: 14 }}>
          <div className="profile-ref-block">
            <span className="profile-ref-label">{t('referral.your_code')}</span>
            <div className="profile-ref-copy-box">
              <code>{referralCode}</code>
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => copyToClipboard(referralCode, t('referral.your_code'))}
              >
                {t('common.copy')}
              </button>
            </div>
          </div>

          <div className="profile-ref-block">
            <span className="profile-ref-label">{t('referral.invite_link')}</span>
            <div className="profile-ref-copy-box">
              <span className="profile-ref-link-text">{inviteUrl}</span>
              <button
                type="button"
                className="button button-primary button-small"
                onClick={() => copyToClipboard(inviteUrl, t('referral.invite_link'))}
              >
                {t('common.copy')}
              </button>
            </div>
          </div>
        </div>

        {/* SPONSOR STATUS OR LINK */}
        <div className="profile-sponsor-box" style={{ marginTop: 14 }}>
          {profile?.referral?.referrerBy ? (
            <div className="profile-sponsor-info">
              <span>{t('referral.has_sponsor')} </span>
              <strong style={{ color: '#818cf8' }}>{profile.referral.referrerBy}</strong>
            </div>
          ) : (
            <form onSubmit={handleAddSponsor} className="profile-add-sponsor-form">
              <div className="profile-sponsor-input-group">
                <input
                  type="text"
                  className="auth-input"
                  placeholder={t('referral.sponsor_input_ph')}
                  value={sponsorInput}
                  onChange={(e) => setSponsorInput(e.target.value.toUpperCase())}
                />
                <button
                  type="submit"
                  className="button button-secondary button-small"
                  disabled={settingSponsor}
                >
                  {settingSponsor ? t('referral.linking') : t('referral.link_sponsor_btn')}
                </button>
              </div>
              {sponsorFeedback && <p className="profile-sponsor-feedback">{sponsorFeedback}</p>}
            </form>
          )}
        </div>
      </div>

      {/* DIRECT REFERRALS LIST */}
      <div className="content-panel" style={{ padding: 22, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, color: 'var(--text)' }}>
          {t('referral.direct_referrals')} ({directReferralsCount})
        </h3>

        {directReferralsCount > 0 ? (
          <div className="profile-referrals-table">
            {profile?.referral?.userReferrals?.map((refItem, idx) => {
              const refEmail =
                typeof refItem === 'string'
                  ? refItem
                  : (refItem as any)?.email || (refItem as any)?.uid || ''
              const userTxs = referralTransactions.filter(
                (tx) => tx.buyerEmail?.toLowerCase() === refEmail.toLowerCase()
              )
              const userComms = commissions.filter(
                (c) => c.buyerEmail?.toLowerCase() === refEmail.toLowerCase()
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
              const badgeClass =
                repurchases > 0
                  ? 'badge-repurchase'
                  : firstPurchases > 0
                  ? 'badge-first-purchase'
                  : 'profile-status-pill muted'

              return (
                <div key={idx} className="profile-referral-table-row">
                  <span className="profile-referral-index">#{idx + 1}</span>
                  <span className="profile-referral-email">{refEmail || t('referral.active_referral')}</span>
                  <span className={badgeClass}>{statusLabel}</span>
                  <span className="profile-referral-badge">{t('referral.direct_bonus_badge')}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="profile-ref-empty" style={{ margin: '10px 0' }}>
            {t('referral.empty_referrals')}
          </p>
        )}
      </div>
      </>
      )}

      {/* FINANCIAL COMMISSION LEDGER (/referrals/{uid}) */}
      {!isFriendsTab && (
      <div className="content-panel" style={{ padding: 22 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text)' }}>
            {t('referral.ledger_title')}
          </h3>
          {withdrawableBalance > 0 && (
            <button
              type="button"
              className="button button-primary button-small"
              onClick={() => setWithdrawalModalOpen(true)}
            >
              {t('referral.request_withdrawal')}
            </button>
          )}
        </div>

        {referralTransactions.length > 0 ? (
          <div className="profile-referrals-table">
            {referralTransactions.map((tx) => (
              <div key={tx.id} className="profile-referral-table-row">
                <span
                  className={
                    tx.type === 'withdrawal'
                      ? 'badge-withdrawal'
                      : tx.purchaseType === 'first_purchase'
                      ? 'badge-first-purchase'
                      : tx.purchaseType === 'repurchase'
                      ? 'badge-repurchase'
                      : 'badge-unilevel'
                  }
                >
                  {tx.type === 'withdrawal'
                    ? t('referral.type_withdrawal')
                    : tx.purchaseType === 'first_purchase'
                    ? t('referral.type_first_purchase')
                    : tx.purchaseType === 'repurchase'
                    ? t('referral.type_repurchase')
                    : `${t('referral.type_unilevel')} L${tx.level || 1}`}
                </span>
                <span className="profile-referral-email" style={{ fontSize: 12 }}>
                  {tx.description}
                </span>
                <strong style={{ color: tx.amount < 0 ? '#ef4444' : '#10b981', fontSize: 13 }}>
                  {tx.amount < 0
                    ? `-$${Math.abs(tx.amount).toFixed(2)} USD`
                    : `+$${tx.amount.toFixed(2)} USD`}
                </strong>
              </div>
            ))}
          </div>
        ) : commissions.length > 0 ? (
          <div className="profile-referrals-table">
            {commissions.map((c) => (
              <div key={c.id} className="profile-referral-table-row">
                <span
                  className={
                    c.type === 'first_purchase'
                      ? 'badge-first-purchase'
                      : c.type === 'repurchase'
                      ? 'badge-repurchase'
                      : 'badge-first-purchase'
                  }
                >
                  {c.type === 'first_purchase'
                    ? t('referral.type_first_purchase')
                    : c.type === 'repurchase'
                    ? t('referral.type_repurchase')
                    : t('referral.direct_bonus_badge')}
                </span>
                <span className="profile-referral-email" style={{ fontSize: 12 }}>
                  De: {c.buyerEmail} · Minero: {c.minerId}
                </span>
                <strong style={{ color: '#10b981', fontSize: 13 }}>
                  +${c.commissionAmount.toFixed(2)} USD
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="profile-ref-empty">{t('referral.empty_ledger')}</p>
        )}

        {/* PAST UNILEVEL RUNS */}
        {unilevelHistory.length > 0 && (
          <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <span className="profile-ref-label">
              {t('referral.past_distributions')} ({unilevelHistory.length}):
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {unilevelHistory.slice(0, 6).map((dist) => (
                <button
                  key={dist.id}
                  type="button"
                  className="button button-quiet button-small"
                  onClick={() => {
                    setActiveUnilevelView(dist)
                    setShowUnilevelModal(true)
                  }}
                >
                  📊 {dist.date} ({t('referral.pool_fund')}: ${dist.unilevelPool.toFixed(2)})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {/* WITHDRAWAL MODAL */}
      {withdrawalModalOpen && renderWithdrawalModal()}

      {/* UNILEVEL 20 LEVELS MODAL */}
      {showUnilevelModal && activeUnilevelView && renderUnilevelModal()}
    </div>
  )

  function renderWithdrawalModal() {
    const available = withdrawableBalance

    return (
      <div className="profile-modal-overlay" onClick={() => setWithdrawalModalOpen(false)}>
        <div className="profile-modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
          <h3 className="profile-modal-title">{t('referral.withdrawal_modal_title')}</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 14px' }}>
            {t('referral.withdrawal_modal_desc')}
          </p>

          <form onSubmit={handleExecuteWithdrawal} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: 12,
              }}
            >
              <span style={{ fontSize: 11, color: '#a78bfa', display: 'block' }}>
                {t('referral.withdrawable_balance')}
              </span>
              <strong style={{ fontSize: 18, color: '#818cf8' }}>${available.toFixed(2)} USD</strong>
            </div>

            <div className="profile-field-group">
              <label className="profile-field-label">{t('referral.withdraw_amount')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={available}
                  className="profile-field-input"
                  style={{ flex: 1 }}
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => setWithdrawAmount(available.toString())}
                >
                  {t('referral.max_btn')}
                </button>
              </div>
            </div>

            <div className="profile-field-group">
              <label className="profile-field-label">{t('referral.dest_wallet')}</label>
              <input
                type="text"
                className="profile-field-input"
                placeholder={profile?.walletAddress || '0x... o dirección compatible'}
                value={withdrawWallet}
                onChange={(e) => setWithdrawWallet(e.target.value)}
              />
              <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {t('referral.default_wallet_note')}
              </span>
            </div>

            {withdrawFeedback && (
              <p style={{ color: '#ef4444', fontSize: 12, margin: 0 }}>{withdrawFeedback}</p>
            )}

            <div className="profile-modal-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setWithdrawalModalOpen(false)}
                disabled={withdrawing}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={withdrawing || available <= 0}
              >
                {withdrawing ? t('referral.processing') : t('referral.confirm_withdrawal')}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  function renderUnilevelModal() {
    if (!activeUnilevelView) return null

    return (
      <div className="profile-modal-overlay" onClick={() => setShowUnilevelModal(false)}>
        <div className="profile-modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="profile-modal-title">{t('unilevel.modal_title')}</h3>
            <button
              type="button"
              className="button button-quiet button-small"
              onClick={() => setShowUnilevelModal(false)}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, textAlign: 'center' }}>
            <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('unilevel.eligible_profit')}</span>
              <strong style={{ display: 'block', fontSize: 14, color: 'var(--text)' }}>
                ${activeUnilevelView.eligibleProfit.toFixed(2)} USD
              </strong>
            </div>
            <div style={{ padding: '8px 12px', background: 'rgba(124, 58, 237, 0.1)', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#a78bfa' }}>{t('unilevel.pool_20')}</span>
              <strong style={{ display: 'block', fontSize: 14, color: '#a78bfa' }}>
                ${activeUnilevelView.unilevelPool.toFixed(2)} USD
              </strong>
            </div>
            <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#10b981' }}>{t('unilevel.total_credited')}</span>
              <strong style={{ display: 'block', fontSize: 14, color: '#10b981' }}>
                ${activeUnilevelView.totalDistributed.toFixed(2)} USD
              </strong>
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            {t('unilevel.calculation_date')} <strong>{activeUnilevelView.date}</strong> ·{' '}
            {t('unilevel.distribution_id')} <code>{activeUnilevelView.id}</code>
          </p>

          <div className="unilevel-table-container">
            {activeUnilevelView.distributions.map((lvl) => (
              <div key={lvl.level} className="unilevel-row">
                <span className="unilevel-level-chip">
                  {t('unilevel.level')} {lvl.level}
                </span>
                <span className="unilevel-pct-chip">{lvl.percentage}%</span>
                <span className={`unilevel-sponsor-chip ${lvl.status === 'credited' ? 'active' : ''}`}>
                  {lvl.sponsorEmail ? lvl.sponsorEmail : t('unilevel.sponsor_empty')}
                </span>
                <span className={`unilevel-amount-chip ${lvl.status === 'credited' ? 'credited' : 'unclaimed'}`}>
                  ${lvl.amount.toFixed(4)} USD
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              color: 'var(--muted)',
            }}
          >
            <span>
              {t('unilevel.unclaimed_pool')}{' '}
              <strong>${activeUnilevelView.totalUnclaimed.toFixed(2)} USD</strong>
            </span>
            <button
              type="button"
              className="button button-primary button-small"
              onClick={() => setShowUnilevelModal(false)}
            >
              {t('common.understood')}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
