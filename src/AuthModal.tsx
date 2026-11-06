import { useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import { useAppKit } from '@reown/appkit/react'
import { findUserByReferralCode } from './firebase'
import { usePersonalization } from './personalization'

export function AuthModal() {
  const {
    user,
    authModalOpen,
    authMode,
    referralCodeFromUrl,
    closeAuthModal,
    login,
    register,
    logout,
    resendVerification,
    checkVerification,
    resetPassword,
  } = useAuth()

  const { open: openAppKit } = useAppKit()
  const { t, language } = usePersonalization()

  const [mode, setMode] = useState<'login' | 'register' | 'verify-email' | 'forgot-password'>(authMode)
  const [step, setStep] = useState<1 | 2>(1)

  // Form states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [referralCode, setReferralCode] = useState(referralCodeFromUrl || '')
  const [refStatus, setRefStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [sponsorDetails, setSponsorDetails] = useState<string>('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    setMode(authMode)
    setError('')
    setInfo('')
  }, [authMode, authModalOpen])

  useEffect(() => {
    if (referralCodeFromUrl && !referralCode) {
      setReferralCode(referralCodeFromUrl)
    }
  }, [referralCodeFromUrl, referralCode])

  // Debounced check of referral code existence
  useEffect(() => {
    const code = referralCode.trim()
    if (!code) {
      setRefStatus('idle')
      setSponsorDetails('')
      return
    }

    setRefStatus('checking')
    const timer = window.setTimeout(async () => {
      try {
        const found = await findUserByReferralCode(code)
        if (found) {
          setRefStatus('valid')
          setSponsorDetails(
            found.email ? `${found.email.split('@')[0]} (${found.referralCode})` : found.referralCode
          )
        } else {
          setRefStatus('invalid')
          setSponsorDetails('')
        }
      } catch {
        setRefStatus('invalid')
        setSponsorDetails('')
      }
    }, 350)

    return () => window.clearTimeout(timer)
  }, [referralCode])

  // Cooldown countdown for resend verification email
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  if (!authModalOpen) return null

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !email.includes('@')) {
      setError(language === 'en' ? 'Please enter a valid email address.' : 'Por favor ingresa un correo electrónico válido.')
      return
    }
    setStep(2)
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    if (password.length < 6) {
      setError(language === 'en' ? 'Password must be at least 6 characters.' : 'La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError(language === 'en' ? 'Passwords do not match.' : 'Las contraseñas no coinciden.')
      return
    }
    if (referralCode.trim() && refStatus === 'invalid') {
      setError(
        language === 'en'
          ? 'Invalid referral code. Please correct or clear it if you do not have one.'
          : 'El código de referido ingresado no es válido. Corrígelo o bórralo si no tienes uno.'
      )
      return
    }

    setSubmitting(true)
    try {
      await register(email, password, referralCode)
      setMode('verify-email')
      setInfo(
        language === 'en'
          ? 'Account created successfully! We sent a verification email.'
          : 'Cuenta creada exitosamente. Hemos enviado un correo de verificación.'
      )
    } catch (err: any) {
      const code = err?.code || ''
      if (code === 'auth/email-already-in-use') {
        setError(
          language === 'en'
            ? 'This email address is already registered. Please log in.'
            : 'Este correo electrónico ya está registrado. Por favor inicia sesión.'
        )
      } else if (code === 'auth/weak-password') {
        setError(
          language === 'en'
            ? 'Password is too weak (minimum 6 characters).'
            : 'La contraseña es demasiado débil (mínimo 6 caracteres).'
        )
      } else {
        setError(err?.message || (language === 'en' ? 'Error creating account.' : 'Error al crear la cuenta.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    if (!email || !password) {
      setError(language === 'en' ? 'Please fill in all fields.' : 'Por favor completa todos los campos.')
      return
    }

    setSubmitting(true)
    try {
      await login(email, password)
    } catch (err: any) {
      const code = err?.code || ''
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setError(
          language === 'en'
            ? 'Incorrect email address or password.'
            : 'Correo electrónico o contraseña incorrectos.'
        )
      } else {
        setError(err?.message || (language === 'en' ? 'Error logging in.' : 'Error al iniciar sesión.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!email || !email.includes('@')) {
      setError(language === 'en' ? 'Please enter your email.' : 'Por favor ingresa tu correo electrónico.')
      return
    }
    setSubmitting(true)
    try {
      await resetPassword(email)
      setInfo(
        language === 'en'
          ? 'We have sent an email with instructions to reset your password.'
          : 'Te hemos enviado un correo con instrucciones para restablecer tu contraseña.'
      )
    } catch (err: any) {
      setError(err?.message || (language === 'en' ? 'Error sending recovery email.' : 'Error al enviar el correo de recuperación.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheckVerification = async () => {
    setSubmitting(true)
    setError('')
    try {
      const verified = await checkVerification()
      if (verified) {
        setInfo(language === 'en' ? 'Email verified successfully! Welcome to GoMining.' : '¡Correo verificado con éxito! Bienvenido a GoMining.')
        setTimeout(() => closeAuthModal(), 1000)
      } else {
        setError(
          language === 'en'
            ? 'Your email is not verified yet. Please click the link sent to your inbox.'
            : 'Tu correo aún no ha sido verificado. Por favor haz clic en el enlace que enviamos a tu buzón.'
        )
      }
    } catch (err: any) {
      setError(err?.message || (language === 'en' ? 'Error checking email status.' : 'Error al verificar el estado del correo.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    setSubmitting(true)
    setError('')
    try {
      await resendVerification()
      setInfo(
        language === 'en'
          ? 'Verification email resent. Please check your inbox and spam folder.'
          : 'Correo de verificación reenviado. Revisa tu bandeja de entrada y spam.'
      )
      setResendCooldown(30)
    } catch (err: any) {
      setError(err?.message || (language === 'en' ? 'Error resending email.' : 'Error al reenviar el correo.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-modal-overlay" onClick={closeAuthModal}>
      <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="auth-modal-close"
          onClick={closeAuthModal}
          aria-label={t('common.close')}
        >
          ×
        </button>

        {/* Top Mode Tabs for quick switching between Register and Login */}
        {(mode === 'login' || (mode === 'register' && step === 1)) && (
          <div className="auth-mode-tabs">
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setMode('register')
                setStep(1)
                setError('')
                setInfo('')
              }}
            >
              {t('auth.register_btn')}
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login')
                setError('')
                setInfo('')
              }}
            >
              {t('auth.login_btn')}
            </button>
          </div>
        )}

        {/* VERIFY EMAIL VIEW */}
        {mode === 'verify-email' && (
          <div className="auth-verification-view">
            <div className="auth-email-icon-wrapper">
              <span className="auth-email-icon">✉</span>
            </div>
            <h2 className="auth-title">{t('auth.email_verification_title')}</h2>
            <p className="auth-subtitle">
              {language === 'en' ? 'We sent a confirmation link to:' : 'Hemos enviado un enlace de confirmación a:'}
              <br />
              <strong>{user?.email || email}</strong>
            </p>

            <div className="auth-notice-card">
              <span className="auth-notice-bullet">✦</span>
              <p>{t('auth.email_verification_desc')}</p>
            </div>

            {error && <div className="auth-error-banner">{error}</div>}
            {info && <div className="auth-success-banner">{info}</div>}

            <div className="auth-button-group">
              <button
                type="button"
                className="button button-primary auth-submit-btn"
                onClick={handleCheckVerification}
                disabled={submitting}
              >
                {submitting ? t('common.loading') : `${t('auth.check_verified_btn')} ✓`}
              </button>

              <button
                type="button"
                className="button button-secondary auth-resend-btn"
                onClick={handleResend}
                disabled={submitting || resendCooldown > 0}
              >
                {resendCooldown > 0
                  ? `${language === 'en' ? 'Resend in' : 'Reenviar en'} ${resendCooldown}s`
                  : t('auth.resend_btn')}
              </button>

              <button
                type="button"
                className="auth-text-link auth-signout-link"
                onClick={logout}
              >
                {language === 'en' ? 'Log out or use another account' : 'Cerrar sesión o usar otra cuenta'}
              </button>
            </div>
          </div>
        )}

        {/* REGISTER VIEW - STEP 1 */}
        {mode === 'register' && step === 1 && (
          <div className="auth-register-step-1">
            <h2 className="auth-title">{t('auth.register_title')}</h2>
            <p className="auth-subtitle">{t('auth.register_desc')}</p>

            {error && <div className="auth-error-banner">{error}</div>}

            <form onSubmit={handleStep1Submit} className="auth-form">
              <div className="auth-field">
                <label htmlFor="register-email" className="auth-label">
                  {t('auth.email_label')}
                </label>
                <input
                  id="register-email"
                  type="email"
                  className="auth-input"
                  placeholder={t('auth.email_placeholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <button type="submit" className="button button-primary auth-submit-btn">
                {language === 'en' ? 'Continue' : 'Continuar'}
              </button>
            </form>

            <div className="auth-divider">
              <span>{language === 'en' ? 'OR' : 'O'}</span>
            </div>

            <div className="auth-connect-wallet-row">
              <button
                type="button"
                className="button button-secondary auth-wallet-btn"
                onClick={() => {
                  closeAuthModal()
                  openAppKit({ view: 'Connect' })
                }}
              >
                <span className="auth-wallet-icon">◈</span>
                <span>{t('auth.or_connect_wallet')}</span>
              </button>
            </div>

            <div className="auth-footer-prompt">
              <span>{t('auth.have_account')} </span>
              <button
                type="button"
                className="auth-text-link"
                onClick={() => {
                  setMode('login')
                  setError('')
                }}
              >
                {t('auth.login_link')}
              </button>
            </div>
          </div>
        )}

        {/* REGISTER VIEW - STEP 2 */}
        {mode === 'register' && step === 2 && (
          <div className="auth-register-step-2">
            <button
              type="button"
              className="auth-back-button"
              onClick={() => {
                setStep(1)
                setError('')
              }}
            >
              {t('common.back')}
            </button>

            <h2 className="auth-title">
              {language === 'en' ? 'Create password' : 'Crea tu contraseña'}
            </h2>
            <p className="auth-subtitle">
              {language === 'en' ? 'For ' : 'Para '} <strong>{email}</strong>
            </p>

            {error && <div className="auth-error-banner">{error}</div>}

            <form onSubmit={handleRegisterSubmit} className="auth-form">
              <div className="auth-field">
                <label htmlFor="register-password" className="auth-label">
                  {t('auth.password_label')}
                </label>
                <div className="auth-input-container">
                  <input
                    id="register-password"
                    type={showPassword ? 'text' : 'password'}
                    className="auth-input"
                    placeholder={t('auth.password_placeholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-show-pass-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (language === 'en' ? 'Hide' : 'Ocultar') : (language === 'en' ? 'Show' : 'Ver')}
                  </button>
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="register-confirm-password" className="auth-label">
                  {t('auth.confirm_password_label')}
                </label>
                <input
                  id="register-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder={t('auth.confirm_password_placeholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <div className="auth-field">
                <div className="auth-label-row">
                  <label htmlFor="register-ref" className="auth-label">
                    {t('auth.referral_code_label')}
                  </label>
                  <span className="auth-optional-badge">
                    {language === 'en' ? 'Optional' : 'Opcional'}
                  </span>
                </div>
                <input
                  id="register-ref"
                  type="text"
                  className={`auth-input auth-ref-input ${
                    refStatus === 'valid'
                      ? 'auth-input-valid'
                      : refStatus === 'invalid'
                      ? 'auth-input-invalid'
                      : ''
                  }`}
                  placeholder={t('auth.referral_code_placeholder')}
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                />
                {refStatus === 'checking' && (
                  <span className="auth-ref-hint" style={{ color: '#94a3b8' }}>
                    ◌ {language === 'en' ? 'Verifying sponsor code...' : 'Verificando código de patrocinador...'}
                  </span>
                )}
                {refStatus === 'valid' && (
                  <span className="auth-ref-hint auth-ref-hint-valid" style={{ color: '#22c55e' }}>
                    ✓ {t('auth.sponsor_found')} <strong>{sponsorDetails || referralCode}</strong> (10% Bonus)
                  </span>
                )}
                {refStatus === 'invalid' && (
                  <span className="auth-ref-hint auth-ref-hint-invalid" style={{ color: '#f59e0b' }}>
                    ✕ {t('auth.sponsor_invalid')}
                  </span>
                )}
              </div>

              <p className="auth-legal-text">
                {language === 'en'
                  ? 'By registering you accept our Terms of Service and Privacy Policy.'
                  : 'Al registrarte aceptas nuestros Términos de Servicio y Política de Privacidad.'}
              </p>

              <button
                type="submit"
                className="button button-primary auth-submit-btn"
                disabled={submitting}
              >
                {submitting ? t('common.loading') : t('auth.register_btn')}
              </button>
            </form>

            <div className="auth-footer-prompt">
              <span>{t('auth.have_account')} </span>
              <button
                type="button"
                className="auth-text-link"
                onClick={() => {
                  setMode('login')
                  setError('')
                }}
              >
                {t('auth.login_link')}
              </button>
            </div>
          </div>
        )}

        {/* LOGIN VIEW */}
        {mode === 'login' && (
          <div className="auth-login-view">
            <h2 className="auth-title">{t('auth.login_title')}</h2>
            <p className="auth-subtitle">{t('auth.login_desc')}</p>

            {error && <div className="auth-error-banner">{error}</div>}
            {info && <div className="auth-success-banner">{info}</div>}

            <form onSubmit={handleLoginSubmit} className="auth-form">
              <div className="auth-field">
                <label htmlFor="login-email" className="auth-label">
                  {t('auth.email_label')}
                </label>
                <input
                  id="login-email"
                  type="email"
                  className="auth-input"
                  placeholder={t('auth.email_placeholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="auth-field">
                <div className="auth-label-row">
                  <label htmlFor="login-password" className="auth-label">
                    {t('auth.password_label')}
                  </label>
                  <button
                    type="button"
                    className="auth-text-link auth-forgot-btn"
                    onClick={() => {
                      setMode('forgot-password')
                      setError('')
                      setInfo('')
                    }}
                  >
                    {t('auth.forgot_password')}
                  </button>
                </div>
                <div className="auth-input-container">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="auth-input"
                    placeholder={t('auth.password_placeholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-show-pass-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (language === 'en' ? 'Hide' : 'Ocultar') : (language === 'en' ? 'Show' : 'Ver')}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="button button-primary auth-submit-btn"
                disabled={submitting}
              >
                {submitting ? t('common.loading') : t('auth.login_btn')}
              </button>
            </form>

            <div className="auth-divider">
              <span>{language === 'en' ? 'OR' : 'O'}</span>
            </div>

            <div className="auth-connect-wallet-row">
              <button
                type="button"
                className="button button-secondary auth-wallet-btn"
                onClick={() => {
                  closeAuthModal()
                  openAppKit({ view: 'Connect' })
                }}
              >
                <span className="auth-wallet-icon">◈</span>
                <span>{t('auth.or_connect_wallet')}</span>
              </button>
            </div>

            <div className="auth-footer-prompt">
              <span>{t('auth.no_account')} </span>
              <button
                type="button"
                className="auth-text-link"
                onClick={() => {
                  setMode('register')
                  setStep(1)
                  setError('')
                }}
              >
                {t('auth.register_link')}
              </button>
            </div>
          </div>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {mode === 'forgot-password' && (
          <div className="auth-forgot-view">
            <button
              type="button"
              className="auth-back-button"
              onClick={() => {
                setMode('login')
                setError('')
                setInfo('')
              }}
            >
              {language === 'en' ? '← Back to Log in' : '← Volver al inicio de sesión'}
            </button>

            <h2 className="auth-title">
              {language === 'en' ? 'Reset password' : 'Restablecer contraseña'}
            </h2>
            <p className="auth-subtitle">
              {language === 'en'
                ? 'Enter your email and we will send you a reset link.'
                : 'Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.'}
            </p>

            {error && <div className="auth-error-banner">{error}</div>}
            {info && <div className="auth-success-banner">{info}</div>}

            <form onSubmit={handleForgotPassword} className="auth-form">
              <div className="auth-field">
                <label htmlFor="reset-email" className="auth-label">
                  {t('auth.email_label')}
                </label>
                <input
                  id="reset-email"
                  type="email"
                  className="auth-input"
                  placeholder={t('auth.email_placeholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="button button-primary auth-submit-btn"
                disabled={submitting}
              >
                {submitting ? t('common.loading') : (language === 'en' ? 'Send reset link' : 'Enviar enlace de restablecimiento')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
