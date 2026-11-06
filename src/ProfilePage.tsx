import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import {
  getUserMiners,
  updateUserProfile,
  saveDetectedCountry,
  getUserCountryRecord,
  type StoredMiner,
} from './firebase'
import { detectUserGeo } from './geoIp'
import { usePersonalization } from './personalization'
import { useDemoSession } from './demoStore'
import type { WalletSession } from './walletSession'
import {
  generateBase32Secret,
  getOtpauthUri,
  generateQrCodeDataUrl,
  verifyTOTP,
} from './totp'

const AVATAR_PRESETS = [
  { id: 'miner', label: '👾 Cyber Miner', emoji: '👾' },
  { id: 'node', label: '⚡ Energy Node', emoji: '⚡' },
  { id: 'diamond', label: '💎 Diamond Rig', emoji: '💎' },
  { id: 'rocket', label: '🚀 Hash Rocket', emoji: '🚀' },
  { id: 'gold', label: '🦁 Gold Miner', emoji: '🦁' },
]

export function ProfilePage({
  walletSession,
  onOpenMinerBuilder,
}: {
  walletSession?: WalletSession
  onOpenMinerBuilder?: () => void
}) {
  const navigate = useNavigate()
  const { user, profile, isEmailVerified, logout, refreshProfile, openAuthModal } = useAuth()
  const demo = useDemoSession()
  const { theme, language, setAppTheme, setAppLanguage, t } = usePersonalization()

  const [view, setView] = useState<'overview' | 'details' | 'settings'>('overview')
  const [miners, setMiners] = useState<StoredMiner[]>([])
  const [loadingMiners, setLoadingMiners] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState('')

  // Profile Edit Modal State - Username and Country are NOT editable by user
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editTelegram, setEditTelegram] = useState('')
  const [editTwitter, setEditTwitter] = useState('')
  const [editPhotoURL, setEditPhotoURL] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // 2FA Modal State with Real QR and TOTP verification
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false)
  const [twoFactorSecret, setTwoFactorSecret] = useState('')
  const [twoFactorQrUrl, setTwoFactorQrUrl] = useState('')
  const [twoFactorInputCode, setTwoFactorInputCode] = useState('')
  const [twoFactorFeedback, setTwoFactorFeedback] = useState('')
  const [savingTwoFactor, setSavingTwoFactor] = useState(false)

  const activeWalletAddress = walletSession?.connection?.address || profile?.walletAddress || ''
  const shortWallet = activeWalletAddress
    ? `${activeWalletAddress.slice(0, 6)}...${activeWalletAddress.slice(-4)}`
    : ''

  // Load miners and ensure country detection
  useEffect(() => {
    if (!user) return
    let active = true
    setLoadingMiners(true)

    getUserMiners(user.uid)
      .then((loadedMiners) => {
        if (!active) return
        setMiners(loadedMiners)
      })
      .catch((err) => console.warn('Error loading miners from Firestore:', err))
      .finally(() => {
        if (active) setLoadingMiners(false)
      })

    // Automatic 100% background country detection (internal platform logic)
    // Saves to dedicated collection /countries/{uid} and updates profile.country
    void getUserCountryRecord(user.uid).then(async (rec) => {
      if (!rec || !profile?.country) {
        const geo = await detectUserGeo().catch(() => ({
          country: profile?.country || 'United States',
          ip: '127.0.0.1',
        }))
        if (geo && active) {
          await saveDetectedCountry(user.uid, geo.country || profile?.country || 'United States', geo.ip).catch(() => {})
          if (!profile?.country) {
            await updateUserProfile(user.uid, { country: geo.country }).catch(() => {})
            await refreshProfile()
          }
        }
      }
    })

    return () => {
      active = false
    }
  }, [user, profile?.country, refreshProfile])

  // Sync edit form with current profile
  useEffect(() => {
    if (profile) {
      setEditTelegram(profile.telegramHandle || '')
      setEditTwitter(profile.twitterHandle || '')
      setEditPhotoURL(profile.photoURL || '')
    }
  }, [profile])

  // Prepare 2FA secret and scannable QR when opening 2FA modal
  useEffect(() => {
    if (!twoFactorModalOpen || !user) return

    if (!profile?.twoFactorEnabled) {
      const secret = profile?.twoFactorSecret || generateBase32Secret(16)
      setTwoFactorSecret(secret)
      const uri = getOtpauthUri(user.email || 'user@gomining.com', secret, 'GoMining')
      generateQrCodeDataUrl(uri)
        .then((dataUrl) => {
          setTwoFactorQrUrl(dataUrl)
        })
        .catch((err) => console.error('Error generating 2FA QR code:', err))
    }
    setTwoFactorInputCode('')
    setTwoFactorFeedback('')
  }, [twoFactorModalOpen, user, profile?.twoFactorEnabled, profile?.twoFactorSecret])

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyFeedback(`¡${label} ${t('common.copied')}!`)
      setTimeout(() => setCopyFeedback(''), 2500)
    } catch {
      setCopyFeedback(language === 'es' ? 'No se pudo copiar' : 'Could not copy')
      setTimeout(() => setCopyFeedback(''), 2500)
    }
  }

  // Handle saving editable fields ONLY (Photo/Avatar, Telegram, Twitter)
  // Username and Country are strictly excluded from mutation
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSavingProfile(true)
    try {
      await updateUserProfile(user.uid, {
        telegramHandle: editTelegram.trim().replace(/^@/, ''),
        twitterHandle: editTwitter.trim().replace(/^@/, ''),
        photoURL: editPhotoURL.trim(),
      })
      await refreshProfile()
      setEditModalOpen(false)
      setCopyFeedback(t('profile.profile_updated'))
      setTimeout(() => setCopyFeedback(''), 3000)
    } catch (err) {
      console.error('Error saving profile:', err)
      setCopyFeedback(t('profile.error_saving_profile'))
      setTimeout(() => setCopyFeedback(''), 3000)
    } finally {
      setSavingProfile(false)
    }
  }

  // Handle 2FA activation / deactivation with real TOTP verification
  const handleVerifyAndEnableTwoFactor = async () => {
    if (!user || !twoFactorSecret) return
    const cleanCode = twoFactorInputCode.trim()

    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setTwoFactorFeedback(t('profile.enter_valid_6_digits'))
      return
    }

    setSavingTwoFactor(true)
    setTwoFactorFeedback('')

    try {
      const isValid = await verifyTOTP(twoFactorSecret, cleanCode, 1)
      if (!isValid) {
        setTwoFactorFeedback(t('twofa.code_invalid'))
        setSavingTwoFactor(false)
        return
      }

      await updateUserProfile(user.uid, {
        twoFactorEnabled: true,
        twoFactorSecret,
      })
      await refreshProfile()
      setTwoFactorModalOpen(false)
      setTwoFactorInputCode('')
      setCopyFeedback(t('twofa.success_enabled'))
      setTimeout(() => setCopyFeedback(''), 3000)
    } catch (err: any) {
      setTwoFactorFeedback(err?.message || t('profile.error_verify_2fa'))
    } finally {
      setSavingTwoFactor(false)
    }
  }

  const handleDisableTwoFactor = async () => {
    if (!user) return
    setSavingTwoFactor(true)
    setTwoFactorFeedback('')
    try {
      await updateUserProfile(user.uid, {
        twoFactorEnabled: false,
        twoFactorSecret: '',
      })
      await refreshProfile()
      setTwoFactorModalOpen(false)
      setCopyFeedback(t('twofa.success_disabled'))
      setTimeout(() => setCopyFeedback(''), 3000)
    } catch (err: any) {
      setTwoFactorFeedback(err?.message || t('profile.error_disable_2fa'))
    } finally {
      setSavingTwoFactor(false)
    }
  }

  // Fallback miners combining Firestore and demoStore
  const combinedMiners =
    miners.length > 0
      ? miners
      : demo.miners.map((m) => ({
          id: m.id,
          uid: user?.uid || 'demo-uid',
          name: m.name,
          powerTh: m.powerTh,
          efficiency: 15,
          efficiencyWattsPerTh: 15,
          price: m.price,
          currency: 'USD',
          status: (m.status === 'mining' ? 'active' : 'mining') as 'active' | 'mining',
          txHash: '0x3a91f487e834b...',
          createdAt: m.acquiredAt,
          network: 'BNB Chain',
          ownerWallet: m.ownerWallet || activeWalletAddress || '0x...',
          visualTraits: {
            wallColor: m.customization?.wallColor || '#7c3aed',
            bodyColor: m.customization?.bodyColor || '#1e1b4b',
            bottomColor: m.customization?.bottomColor || '#e2e8f0',
            fansColor: m.customization?.fansColor || '#1e293b',
            screenColor: m.customization?.screenColor || '#22c55e',
            buttonsColor: m.customization?.buttonsColor || '#64748b',
            topColor: m.customization?.topColor || '#0f172a',
            stickers: m.customization?.stickers || 'gomining-classic',
          },
        }))

  const avatarText =
    profile?.username?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'
  const isEmojiAvatar =
    profile?.photoURL && AVATAR_PRESETS.some((a) => a.emoji === profile.photoURL)

  // IF NOT LOGGED IN
  if (!user) {
    return (
      <div className="profile-container">
        <div className="profile-unauth-card">
          <div className="profile-unauth-icon">◉</div>
          <h2>{t('profile.title')}</h2>
          <p>{t('profile.unauth_desc')}</p>
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

  // ACCOUNT DETAILS SUBVIEW (Matches UI-UX/profile/app.gomining.com_profile_account-details.png)
  if (view === 'details') {
    return (
      <div className="profile-container">
        {copyFeedback && (
          <div className="toast" role="status">
            <span>✓</span>
            {copyFeedback}
          </div>
        )}

        <div className="profile-subview-card">
          <button
            type="button"
            className="profile-back-btn"
            onClick={() => setView('overview')}
          >
            {t('profile.back')}
          </button>

          <div className="profile-details-header">
            <div className="profile-large-avatar" style={{ overflow: 'hidden' }}>
              {isEmojiAvatar ? (
                <span style={{ fontSize: 34 }}>{profile?.photoURL}</span>
              ) : profile?.photoURL && profile.photoURL.startsWith('http') ? (
                <img
                  src={profile.photoURL}
                  alt="Avatar"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span>{avatarText}</span>
              )}
            </div>
            <h2>{profile?.username || user.email?.split('@')[0]}</h2>
            <p className="profile-details-uid">ID: {user.uid.slice(0, 10)}</p>
            <button
              type="button"
              className="button button-small button-secondary"
              onClick={() => setEditModalOpen(true)}
              style={{ marginTop: 6 }}
            >
              ✏ {t('profile.edit_profile')}
            </button>
          </div>

          <div className="profile-details-section">
            <h3 className="profile-section-title">{t('profile.personal_info')}</h3>
            <div className="profile-detail-row">
              <span className="profile-detail-label">{t('profile.alias')}</span>
              <span className="profile-detail-value">
                {profile?.username || user.email?.split('@')[0]}
              </span>
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">{t('profile.country')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="profile-detail-value">{profile?.country || 'United States'}</span>
                <span className="profile-status-pill muted" style={{ fontSize: 10 }}>
                  {t('profile.auto_ip_badge')}
                </span>
              </div>
            </div>
          </div>

          <div className="profile-details-section">
            <h3 className="profile-section-title">{t('profile.contact_details')}</h3>
            <div className="profile-detail-row">
              <span className="profile-detail-label">{t('profile.email')}</span>
              <div className="profile-email-badge-row">
                <span className="profile-detail-value">{user.email}</span>
                {isEmailVerified ? (
                  <span className="profile-verified-chip">{t('profile.verified')}</span>
                ) : (
                  <button
                    type="button"
                    className="button button-small button-quiet"
                    onClick={() => openAuthModal('verify-email')}
                  >
                    {t('profile.verify')}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="profile-details-section">
            <h3 className="profile-section-title">{t('profile.linked_accounts')}</h3>
            <div className="profile-detail-row">
              <span className="profile-detail-label">{t('profile.web3_wallet')}</span>
              <span className="profile-detail-value">
                {activeWalletAddress ? shortWallet : t('profile.not_linked')}
              </span>
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">{t('profile.telegram')}</span>
              {profile?.telegramHandle ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="profile-detail-value highlight">
                    @{profile.telegramHandle.replace('@', '')}
                  </span>
                  <button
                    type="button"
                    className="profile-link-action"
                    onClick={() => setEditModalOpen(true)}
                  >
                    {t('profile.edit')}
                  </button>
                </div>
              ) : (
                <span className="profile-link-action" onClick={() => setEditModalOpen(true)}>
                  {t('profile.link')}
                </span>
              )}
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">{t('profile.twitter')}</span>
              {profile?.twitterHandle ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="profile-detail-value highlight">
                    @{profile.twitterHandle.replace('@', '')}
                  </span>
                  <button
                    type="button"
                    className="profile-link-action"
                    onClick={() => setEditModalOpen(true)}
                  >
                    {t('profile.edit')}
                  </button>
                </div>
              ) : (
                <span className="profile-link-action" onClick={() => setEditModalOpen(true)}>
                  {t('profile.link')}
                </span>
              )}
            </div>
          </div>

          <div className="profile-details-danger">
            <button
              type="button"
              className="button button-quiet profile-logout-btn"
              onClick={logout}
            >
              {t('profile.logout')}
            </button>
          </div>
        </div>

        {/* PROFILE EDIT MODAL */}
        {editModalOpen && renderEditModal()}
      </div>
    )
  }

  // SETTINGS SUBVIEW (Matches UI-UX/profile/app.gomining.com_profile_settings.png)
  if (view === 'settings') {
    return (
      <div className="profile-container">
        {copyFeedback && (
          <div className="toast" role="status">
            <span>✓</span>
            {copyFeedback}
          </div>
        )}

        <div className="profile-subview-card">
          <button
            type="button"
            className="profile-back-btn"
            onClick={() => setView('overview')}
          >
            {t('profile.back')}
          </button>

          <h2 className="profile-subview-title">{t('settings.title')}</h2>

          <div className="profile-settings-group">
            <button
              type="button"
              className="profile-menu-row"
              onClick={() => setView('details')}
            >
              <span>{t('settings.account_details')}</span>
              <span>›</span>
            </button>
          </div>

          <div className="profile-details-section">
            <h3 className="profile-section-title">{t('settings.security')}</h3>
            <div
              className="profile-menu-row"
              onClick={() => copyToClipboard(user.email || '', t('profile.recovery_email_copied'))}
            >
              <span>{t('settings.change_password')}</span>
              <span>›</span>
            </div>
            {/* 2FA INTERACTIVE ROW */}
            <div
              className="profile-menu-row"
              style={{ cursor: 'pointer' }}
              onClick={() => setTwoFactorModalOpen(true)}
            >
              <span>{t('settings.two_factor')}</span>
              <span
                className={`profile-badge-${profile?.twoFactorEnabled ? 'verified' : 'muted'}`}
                style={{ color: profile?.twoFactorEnabled ? '#10b981' : '#64748b' }}
              >
                {profile?.twoFactorEnabled ? t('settings.enabled') : t('settings.disabled')} ›
              </span>
            </div>
            <div
              className="profile-menu-row"
              onClick={() => setCopyFeedback(t('profile.session_secure'))}
            >
              <span>{t('settings.activity')}</span>
              <span>›</span>
            </div>
          </div>

          {/* PERSONALIZATION (Theme & Language Selectors) */}
          <div className="profile-details-section">
            <h3 className="profile-section-title">{t('settings.personalization')}</h3>
            <div className="profile-detail-row">
              <span className="profile-detail-label">{t('settings.theme')}</span>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-btn ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setAppTheme('dark')}
                >
                  🌙 {t('settings.theme_dark')}
                </button>
                <button
                  type="button"
                  className={`segmented-btn ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => setAppTheme('light')}
                >
                  ☀️ {t('settings.theme_light')}
                </button>
              </div>
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">{t('settings.language')}</span>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-btn ${language === 'es' ? 'active' : ''}`}
                  onClick={() => setAppLanguage('es')}
                >
                  🇪🇸 {t('settings.lang_es')}
                </button>
                <button
                  type="button"
                  className={`segmented-btn ${language === 'en' ? 'active' : ''}`}
                  onClick={() => setAppLanguage('en')}
                >
                  🇺🇸 {t('settings.lang_en')}
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="button button-quiet profile-logout-btn"
            onClick={logout}
          >
            {t('profile.logout')}
          </button>
        </div>

        {/* 2FA MODAL */}
        {twoFactorModalOpen && renderTwoFactorModal()}
      </div>
    )
  }

  // OVERVIEW VIEW (Clean Profile strictly matching UI-UX/profile/app.gomining.com_profile.png)
  return (
    <div className="profile-container">
      {copyFeedback && (
        <div className="toast" role="status">
          <span>✓</span>
          {copyFeedback}
        </div>
      )}

      {/* TOP USER HERO CARD */}
      <div className="profile-hero-card">
        <div className="profile-user-info">
          <div className="profile-avatar-circle" style={{ overflow: 'hidden' }}>
            {isEmojiAvatar ? (
              <span style={{ fontSize: 28 }}>{profile?.photoURL}</span>
            ) : profile?.photoURL && profile.photoURL.startsWith('http') ? (
              <img
                src={profile.photoURL}
                alt="Avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span>{avatarText}</span>
            )}
          </div>
          <div className="profile-user-meta">
            {/* Username is NON-EDITABLE */}
            <h2 className="profile-username">{profile?.username || user.email?.split('@')[0]}</h2>
            <div className="profile-id-row">
              <span>ID: {user.uid.slice(0, 8)}</span>
              <button
                type="button"
                className="profile-copy-mini-btn"
                onClick={() => copyToClipboard(user.uid, 'ID')}
                title="Copiar ID"
              >
                ❐
              </button>
              {/* Country is READ-ONLY */}
              {profile?.country && (
                <span
                  className="profile-status-pill muted"
                  style={{ marginLeft: 6, fontSize: 11, fontWeight: 600 }}
                  title={t('profile.auto_ip_title')}
                >
                  🌍 {profile.country}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="profile-top-actions">
          <button
            type="button"
            className="button button-secondary profile-action-btn"
            onClick={() => setEditModalOpen(true)}
          >
            ✏ {t('profile.edit_profile')}
          </button>
          <button
            type="button"
            className="button button-quiet profile-settings-btn"
            onClick={() => setView('settings')}
            title={t('profile.settings')}
          >
            ⚙ {t('profile.settings')}
          </button>
        </div>
      </div>

      {/* VIP LEVEL & PLATINUM+ CARDS */}
      <div className="profile-tier-grid">
        <div className="profile-tier-card">
          <div className="profile-tier-icon gold">◈</div>
          <div className="profile-tier-info">
            <span className="profile-tier-label">{t('profile.vip_level')}</span>
            <strong className="profile-tier-value">Bronze I</strong>
          </div>
        </div>

        <Link to="/subscriptions" className="profile-tier-card interactive">
          <div className="profile-tier-icon platinum">✧</div>
          <div className="profile-tier-info">
            <span className="profile-tier-label">{t('profile.platinum_plus')}</span>
            <strong className="profile-tier-value">
              {demo.subscription ? t('profile.active_subscription') : t('profile.subscribe')}
            </strong>
          </div>
          <span className="profile-card-arrow">›</span>
        </Link>
      </div>

      {/* ACCOUNT SECURITY BLOCK: EMAIL (VERIFIED) & 2FA */}
      <div className="profile-section-card">
        <h3 className="profile-card-heading">{t('profile.security_title')}</h3>
        <div className="profile-security-grid">
          <div className="profile-security-item">
            <div className={`profile-security-icon ${isEmailVerified ? 'verified' : 'muted'}`}>
              {isEmailVerified ? '✓' : '!'}
            </div>
            <div>
              <strong>{t('profile.email')}</strong>
              <p>{isEmailVerified ? t('profile.verified') : t('common.pending')}</p>
            </div>
            {!isEmailVerified && (
              <button
                type="button"
                className="button button-small button-primary"
                onClick={() => openAuthModal('verify-email')}
              >
                {t('profile.verify')}
              </button>
            )}
          </div>

          <div
            className="profile-security-item"
            style={{ cursor: 'pointer' }}
            onClick={() => setTwoFactorModalOpen(true)}
          >
            <div className={`profile-security-icon ${profile?.twoFactorEnabled ? 'verified' : 'muted'}`}>
              🔑
            </div>
            <div>
              <strong>{t('profile.two_factor')}</strong>
              <p>{profile?.twoFactorEnabled ? t('settings.enabled') : t('settings.disabled')}</p>
            </div>
            <button
              type="button"
              className={`button button-small ${
                profile?.twoFactorEnabled ? 'button-quiet' : 'button-secondary'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                setTwoFactorModalOpen(true)
              }}
            >
              {profile?.twoFactorEnabled ? t('profile.configure') : t('profile.activate')}
            </button>
          </div>
        </div>
      </div>

      {/* GOMINERS BLOCK */}
      <div className="profile-section-card">
        <div className="profile-card-heading-row">
          <div>
            <h3 className="profile-card-heading">{t('profile.gominers_title')}</h3>
            <p className="profile-card-subheading">{t('profile.gominers_sub')}</p>
          </div>
          {onOpenMinerBuilder && (
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={onOpenMinerBuilder}
            >
              {t('profile.create_miner')}
            </button>
          )}
        </div>

        {loadingMiners ? (
          <div className="profile-miners-loading">{t('common.loading')}</div>
        ) : combinedMiners.length > 0 ? (
          <div className="profile-miners-list">
            {combinedMiners.map((m) => (
              <div key={m.id} className="profile-miner-row">
                <div
                  className="profile-miner-preview"
                  style={{ backgroundColor: m.visualTraits?.bodyColor || '#1e1b4b' }}
                >
                  <span className="profile-miner-symbol">▧</span>
                </div>

                <div className="profile-miner-details">
                  <div className="profile-miner-name-row">
                    <strong>{m.name}</strong>
                    <span className="profile-miner-status-pill">● {t('common.active')}</span>
                  </div>
                  <div className="profile-miner-specs">
                    <span>
                      <strong>{m.powerTh.toFixed(2)} TH</strong>
                    </span>
                    <span>·</span>
                    <span>15 W/TH</span>
                    {m.txHash && (
                      <>
                        <span>·</span>
                        <span className="profile-miner-tx" title={m.txHash}>
                          Tx: {m.txHash.slice(0, 8)}…
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="profile-miner-actions">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => navigate(`/miners/${m.id}/customize`)}
                  >
                    {t('profile.customize_miner')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="profile-empty-miners">
            <span className="profile-empty-icon">▧</span>
            <h4>{t('profile.no_miners')}</h4>
            <p>{t('profile.no_miners_desc')}</p>
            {onOpenMinerBuilder && (
              <button
                type="button"
                className="button button-primary"
                onClick={onOpenMinerBuilder}
              >
                {t('profile.buy_miner_btn')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* PAYMENTS QUICK LINKS (Matching UI-UX Screenshot) */}
      <div className="profile-section-card profile-menu-card">
        <h4 style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em' }}>
          {t('profile.payments_title')}
        </h4>
        <Link to="/finance/wallets/virtual" className="profile-menu-row">
          <div className="profile-menu-item-left">
            <span className="profile-menu-icon">💳</span>
            <span>{t('profile.my_cards')}</span>
          </div>
          <span>›</span>
        </Link>
        <Link to="/subscriptions" className="profile-menu-row">
          <div className="profile-menu-item-left">
            <span className="profile-menu-icon">✧</span>
            <span>{t('profile.subscriptions')}</span>
          </div>
          <span>›</span>
        </Link>
        <div
          className="profile-menu-row"
          style={{ cursor: 'pointer' }}
          onClick={() => copyToClipboard(t('profile.pay_later_info'), t('profile.info_label'))}
        >
          <div className="profile-menu-item-left">
            <span className="profile-menu-icon">⏱</span>
            <span>{t('profile.pay_later')}</span>
          </div>
          <span>›</span>
        </div>
      </div>

      {/* SUPPORT QUICK LINKS (Matching UI-UX Screenshot) */}
      <div className="profile-section-card profile-menu-card">
        <h4 style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em' }}>
          {t('profile.support_title')}
        </h4>
        <div
          className="profile-menu-row"
          style={{ cursor: 'pointer' }}
          onClick={() => copyToClipboard('soporte@gomining.com', t('profile.support_email_copied'))}
        >
          <div className="profile-menu-item-left">
            <span className="profile-menu-icon">🎧</span>
            <span>{t('profile.support')}</span>
          </div>
          <span>›</span>
        </div>
        <div
          className="profile-menu-row"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/academy/courses/bitcoin-and-mining')}
        >
          <div className="profile-menu-item-left">
            <span className="profile-menu-icon">?</span>
            <span>{t('profile.faq')}</span>
          </div>
          <span>›</span>
        </div>
      </div>

      {/* LOGOUT BUTTON */}
      <div className="profile-logout-container">
        <button
          type="button"
          className="button button-quiet profile-logout-button-bottom"
          onClick={logout}
        >
          {t('profile.logout')}
        </button>
      </div>

      {/* EDIT PROFILE MODAL (Only Avatar, Telegram, Twitter editable) */}
      {editModalOpen && renderEditModal()}

      {/* 2FA MODAL (With real scannable QR and TOTP verification) */}
      {twoFactorModalOpen && renderTwoFactorModal()}
    </div>
  )

  // ================= MODAL RENDERERS ================= //

  function renderEditModal() {
    return (
      <div className="profile-modal-overlay" onClick={() => setEditModalOpen(false)}>
        <div className="profile-modal-card" onClick={(e) => e.stopPropagation()}>
          <h3 className="profile-modal-title">{t('profile.edit_modal_title')}</h3>

          {/* READ-ONLY USER IDENTITY INFO */}
          <div
            style={{
              padding: '12px 14px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--muted)' }}>{t('profile.alias')}:</span>
              <strong style={{ color: 'var(--text)' }}>
                {profile?.username || user?.email?.split('@')[0] || 'User'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--muted)' }}>{t('profile.country')}:</span>
              <strong style={{ color: 'var(--text)' }}>
                🌍 {profile?.country || 'United States'} ({t('profile.auto_ip_badge')})
              </strong>
            </div>
            <span style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              {t('profile.read_only_notice')}
            </span>
          </div>

          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 1. Avatar selector */}
            <div className="profile-field-group">
              <label className="profile-field-label">{t('profile.avatar_photo')}</label>
              <div className="profile-avatar-selector">
                {AVATAR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`profile-avatar-pill ${editPhotoURL === preset.emoji ? 'selected' : ''}`}
                    onClick={() => setEditPhotoURL(preset.emoji)}
                    title={preset.label}
                  >
                    {preset.emoji}
                  </button>
                ))}
              </div>
              <input
                type="text"
                className="profile-field-input"
                style={{ marginTop: 8 }}
                value={editPhotoURL}
                onChange={(e) => setEditPhotoURL(e.target.value)}
                placeholder={t('profile.avatar_placeholder')}
              />
            </div>

            {/* 2. Telegram */}
            <div className="profile-field-group">
              <label className="profile-field-label">{t('profile.telegram')}</label>
              <input
                type="text"
                className="profile-field-input"
                value={editTelegram}
                onChange={(e) => setEditTelegram(e.target.value)}
                placeholder={t('profile.telegram_placeholder')}
              />
            </div>

            {/* 3. Twitter / X */}
            <div className="profile-field-group">
              <label className="profile-field-label">{t('profile.twitter')}</label>
              <input
                type="text"
                className="profile-field-input"
                value={editTwitter}
                onChange={(e) => setEditTwitter(e.target.value)}
                placeholder={t('profile.twitter_placeholder')}
              />
            </div>

            <div className="profile-modal-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setEditModalOpen(false)}
                disabled={savingProfile}
              >
                {t('profile.cancel')}
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={savingProfile}
              >
                {savingProfile ? t('common.loading') : t('profile.save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  function renderTwoFactorModal() {
    const isEnabled = profile?.twoFactorEnabled

    return (
      <div className="profile-modal-overlay" onClick={() => setTwoFactorModalOpen(false)}>
        <div className="profile-modal-card twofa-modal-box" onClick={(e) => e.stopPropagation()}>
          <h3 className="profile-modal-title">{t('twofa.modal_title')}</h3>

          {isEnabled ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div className="twofa-active-badge">
                ✓ {t('twofa.enabled_msg')}
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0', textAlign: 'center' }}>
                {t('twofa.enabled_desc')}
              </p>
              {profile?.twoFactorSecret && (
                <div className="twofa-secret-code-box">
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('twofa.active_key')}</span>
                  <code>{profile.twoFactorSecret}</code>
                </div>
              )}
              <p style={{ fontSize: 12, color: '#ef4444', margin: '8px 0 0', textAlign: 'center' }}>
                {t('twofa.disable_confirm')}
              </p>
              <div className="profile-modal-actions" style={{ width: '100%', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setTwoFactorModalOpen(false)}
                >
                  {t('common.close')}
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  style={{ background: '#ef4444' }}
                  onClick={handleDisableTwoFactor}
                  disabled={savingTwoFactor}
                >
                  {savingTwoFactor ? t('profile.deactivating') : t('twofa.disable_button')}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, textAlign: 'center' }}>
                {t('twofa.step1')}
              </p>

              {/* REAL, SCANNABLE QR CODE IMAGE GENERATED VIA STANDARD QRCODE */}
              <div
                className="twofa-qr-wrapper"
                style={{
                  background: '#ffffff',
                  padding: 12,
                  borderRadius: 16,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 220,
                  minHeight: 220,
                }}
              >
                {twoFactorQrUrl ? (
                  <img
                    src={twoFactorQrUrl}
                    alt="GoMining 2FA QR Code"
                    style={{ width: 200, height: 200, display: 'block' }}
                  />
                ) : (
                  <div style={{ color: '#0f172a', fontSize: 12 }}>{t('profile.generating_qr')}</div>
                )}
              </div>

              {/* Secret key displayed for manual entry */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('twofa.or_enter_key')}</span>
                <div className="twofa-secret-code-box" style={{ marginTop: 6 }}>
                  <code style={{ fontSize: 14, letterSpacing: '0.1em' }}>{twoFactorSecret}</code>
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    onClick={() => copyToClipboard(twoFactorSecret, t('profile.secret_key_copied'))}
                  >
                    {t('common.copy')}
                  </button>
                </div>
              </div>

              {/* Step 2: 6-digit TOTP verification */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  {t('twofa.step2')}
                </label>
                <input
                  type="text"
                  maxLength={6}
                  className="twofa-input-code"
                  placeholder="123456"
                  value={twoFactorInputCode}
                  onChange={(e) => setTwoFactorInputCode(e.target.value.replace(/\D/g, ''))}
                  autoComplete="one-time-code"
                />
              </div>

              {twoFactorFeedback && (
                <p style={{ color: '#ef4444', fontSize: 12, margin: 0, textAlign: 'center' }}>
                  {twoFactorFeedback}
                </p>
              )}

              <div className="profile-modal-actions" style={{ width: '100%', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setTwoFactorModalOpen(false)}
                  disabled={savingTwoFactor}
                >
                  {t('profile.cancel')}
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleVerifyAndEnableTwoFactor}
                  disabled={savingTwoFactor || twoFactorInputCode.length !== 6}
                >
                  {savingTwoFactor ? t('twofa.verifying') : t('twofa.enable_button')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
}
