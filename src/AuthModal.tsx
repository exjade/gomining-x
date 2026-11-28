import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from './AuthContext'
import {
  applyEmailVerificationActionCode,
  findUserByReferralCode,
  useFirebaseEmulators,
} from './firebase'
import { usePersonalization } from './personalization'
import {
  decrementResendCooldown,
  extractVerificationOobCode,
  shouldShowEmulatorVerifyDevTools,
  validateForgotPasswordEmail,
  validateLoginFields,
  validateRegisterStep2,
  validateStep1Email,
} from './authModalValidation'
import {
  EMBUDO_F1_BUILDER_ROUTE,
  EmbudoFunnelProgress,
  advanceEmbudoF1Stage,
  clearEmbudoF1State,
  readEmbudoF1State,
  readEmbudoPresaleSelection,
  resolvePostRegisterTransition,
  saveEmbudoPresaleSelection,
  startEmbudoF1Registration,
  type EmbudoPresaleSelection,
} from './components/embudo-f1'
import './landing.css'

export type AuthMode = 'login' | 'register' | 'forgot-password' | 'verify-email' | 'email-verified'

export function AuthModal() {
  const {
    user,
    authModalOpen,
    authMode,
    verifyEmailLocked,
    referralCodeFromUrl,
    closeAuthModal,
    login,
    register,
    logout,
    resendVerification,
    checkVerification,
    resetPassword,
  } = useAuth()

  const { t, language } = usePersonalization()
  const navigate = useNavigate()

  const [mode, setMode] = useState<AuthMode>('login')
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
  const [emulatorOobInput, setEmulatorOobInput] = useState('')
  const [embudoF1Active, setEmbudoF1Active] = useState(false)
  const [preloadedConfig, setPreloadedConfig] = useState<EmbudoPresaleSelection>(() =>
    readEmbudoPresaleSelection(),
  )

  // Live FOMO countdown matching Landing_Page official design
  const [fomoTime, setFomoTime] = useState({ d: 14, h: 23, m: 48, s: 35 })
  useEffect(() => {
    if (!authModalOpen) return
    const timer = setInterval(() => {
      setFomoTime((prev) => {
        if (prev.s > 0) return { ...prev, s: prev.s - 1 }
        if (prev.m > 0) return { ...prev, m: prev.m - 1, s: 59 }
        if (prev.h > 0) return { ...prev, h: prev.h - 1, m: 59, s: 59 }
        if (prev.d > 0) return { ...prev, d: prev.d - 1, h: 23, m: 59, s: 59 }
        return prev
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [authModalOpen])

  useEffect(() => {
    if (authMode) {
      setMode(authMode as AuthMode)
    }
    setError('')
    setInfo('')
    if (authMode === 'register') setStep(1)
    setEmbudoF1Active(authModalOpen && readEmbudoF1State().active)
    if (authModalOpen) {
      setPreloadedConfig(readEmbudoPresaleSelection())
    }
    if (!authModalOpen) {
      const snap = readEmbudoF1State()
      if (snap.revisitingRegister) {
        clearEmbudoF1State()
      }
    }
  }, [authMode, authModalOpen])

  const isVerifyGateLocked = Boolean(verifyEmailLocked && mode === 'verify-email')

  useEffect(() => {
    if (!authModalOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isVerifyGateLocked) closeAuthModal()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [authModalOpen, isVerifyGateLocked, closeAuthModal])

  useEffect(() => {
    if (referralCodeFromUrl && !referralCode) {
      setReferralCode(referralCodeFromUrl)
    }
  }, [referralCodeFromUrl, referralCode])

  // Debounced check of referral code existence via real backend function (350ms)
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
      setResendCooldown((prev) => decrementResendCooldown(prev))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (authModalOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [authModalOpen])

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const validationError = validateStep1Email(email, language)
    if (validationError) {
      setError(validationError)
      return
    }
    setStep(2)
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    const validationError = validateRegisterStep2({
      password,
      confirmPassword,
      referralCode,
      refStatus,
      language,
    })
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    try {
      const funnelActive = readEmbudoF1State().active
      const postRegister = resolvePostRegisterTransition({
        isFunnelActive: funnelActive,
        isAuthenticated: true,
      })
      await register(email, password, referralCode)
      if (postRegister.deferEmailVerification) {
        advanceEmbudoF1Stage('configuring')
        closeAuthModal()
        navigate(postRegister.nextRoute, { replace: true })
      } else {
        setMode('verify-email')
        setResendCooldown(30)
      }
    } catch (err: any) {
      setError(err?.message || (language === 'en' ? 'Error processing registration.' : 'Error al procesar el registro.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    const validationError = validateLoginFields(email, password, language)
    if (validationError) {
      setError(validationError)
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
    const validationError = validateForgotPasswordEmail(email, language)
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    try {
      await resetPassword(email)
      setInfo(
        language === 'en'
          ? 'We have sent an email with instructions to reset your password.'
          : 'Hemos enviado un enlace seguro a tu bandeja de entrada.'
      )
    } catch (err: any) {
      setError(err?.message || (language === 'en' ? 'Error sending recovery email.' : 'No pudimos procesar la solicitud.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheckVerification = async () => {
    setSubmitting(true)
    setError('')
    try {
      const funnelBeforeCheck = readEmbudoF1State()
      const verified = await checkVerification()
      if (verified) {
        if (funnelBeforeCheck.active) {
          advanceEmbudoF1Stage('dashboard')
        }
        setEmulatorOobInput('')
        navigate('/home', { replace: true })
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

  const handleApplyEmulatorVerification = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError('')
    setInfo('')
    const extracted = extractVerificationOobCode(emulatorOobInput)
    if (!extracted) {
      setError(
        language === 'en'
          ? 'Paste a valid verification link or oobCode from the Firebase Emulator logs.'
          : 'Pega un enlace de verificación o código oobCode válido desde los logs del emulador.'
      )
      return
    }
    setSubmitting(true)
    try {
      const funnelBeforeCheck = readEmbudoF1State()
      await applyEmailVerificationActionCode(extracted)
      const verified = await checkVerification()
      if (verified) {
        if (funnelBeforeCheck.active) {
          advanceEmbudoF1Stage('dashboard')
        }
        setEmulatorOobInput('')
        navigate('/home', { replace: true })
      } else {
        setError(
          language === 'en'
            ? 'Action code applied, please click check verification status again.'
            : 'Código aplicado; pulsa nuevamente "Ya verifiqué mi correo" para actualizar el estado.'
        )
      }
    } catch (err: any) {
      setError(
        err?.message ||
          (language === 'en'
            ? 'Invalid or expired emulator verification code.'
            : 'El enlace o código oobCode del emulador es inválido o ya fue usado.')
      )
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
          : 'Nuevo enlace de verificación enviado.'
      )
      setResendCooldown(30)
    } catch (err: any) {
      setError(err?.message || (language === 'en' ? 'Error resending email.' : 'Error al reenviar el correo.'))
    } finally {
      setSubmitting(false)
    }
  }

  const funnelSnapshot = readEmbudoF1State()
  const isRevisitingRegister = Boolean(funnelSnapshot.active && funnelSnapshot.revisitingRegister)
  const hideCompletedFunnelRegister =
    Boolean(user && !user.isAnonymous) &&
    !isRevisitingRegister &&
    (mode === 'register' || mode === 'verify-email') &&
    funnelSnapshot.active &&
    (funnelSnapshot.stage === 'registering' || funnelSnapshot.stage === 'configuring')

  useEffect(() => {
    if (hideCompletedFunnelRegister && authModalOpen) {
      if (readEmbudoF1State().stage === 'registering') {
        advanceEmbudoF1Stage('configuring')
      }
      closeAuthModal()
    }
  }, [hideCompletedFunnelRegister, authModalOpen, closeAuthModal])

  return (
    <AnimatePresence>
      {authModalOpen && !hideCompletedFunnelRegister && (
        <div className="pouw-landing-root pouw-auth-modal-scope">
          <div className="pouw-auth-modal-root">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={isVerifyGateLocked ? undefined : closeAuthModal}
              className="pouw-auth-modal-backdrop"
              data-testid="auth-modal-backdrop"
            />

            {/* Modal Box — Compact Dark Obsidian Surface */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="relative w-full max-w-[640px] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl bg-[#0b0c10] border border-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_72px_-16px_rgba(0,0,0,0.85)] text-white z-10 px-4 py-4 sm:px-6 sm:py-5 select-none transition-[border-color,box-shadow] duration-200"
              role="dialog"
              aria-modal="true"
              aria-label={language === 'en' ? 'PouwMiner account access' : 'Acceso a cuenta PouwMiner'}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top Bar: Brand + Close aligned optically on one row */}
              <div className="flex items-center justify-between gap-3 mb-2.5 relative z-10">
                <span className="auth-brand inline-flex items-center gap-2 text-white">
                  PouwMiner <span className="auth-brand-tag text-white/45 uppercase pl-2 border-l border-white/15">Auth</span>
                </span>
                {isVerifyGateLocked ? (
                  <span
                    data-testid="verify-gate-locked-badge"
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/25 text-emerald-300"
                  >
                    {language === 'en' ? 'Verification required' : 'Verificación requerida'}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={closeAuthModal}
                    className="auth-close rounded-lg flex items-center justify-center text-white/45 hover:text-white hover:bg-white/[0.08] transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]"
                    aria-label={t('common.close')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* FOMO Live Countdown Banner — Single-line: PREVENTA TITAN + Countdown */}
              <div className="mb-2.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex flex-nowrap items-center justify-between gap-2 relative z-10">
                <div className="flex items-center gap-1.5 text-white/90 whitespace-nowrap shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="auth-fomo-label uppercase whitespace-nowrap">Preventa Titan</span>
                </div>
                <div className="auth-fomo-timer flex items-center gap-1 text-white whitespace-nowrap shrink-0">
                  <span>{fomoTime.d}d</span>
                  <span className="text-white/30">:</span>
                  <span>{String(fomoTime.h).padStart(2, '0')}h</span>
                  <span className="text-white/30">:</span>
                  <span>{String(fomoTime.m).padStart(2, '0')}m</span>
                  <span className="text-white/30">:</span>
                  <span className="text-emerald-400">{String(fomoTime.s).padStart(2, '0')}s</span>
                </div>
              </div>

              {/* Embudo F1 Step Progress Indicator */}
              {embudoF1Active && (mode === 'register' || mode === 'verify-email') && (
                <EmbudoFunnelProgress
                  currentStep={mode === 'verify-email' ? 'verify-email' : 'registering'}
                  language={language}
                  variant="modal"
                />
              )}

              {/* Pre-loaded Presale Configuration Badge (ChooseEarnings / Calculator / Default 1 TH) */}
              {embudoF1Active && mode === 'register' && (
                <div
                  className="embudo-preloaded-config"
                  data-testid="auth-preloaded-config"
                  data-preloaded-th={String(preloadedConfig.powerTh)}
                  data-preloaded-price={preloadedConfig.priceUsd.toFixed(2)}
                  data-preloaded-design={preloadedConfig.designSlug}
                  data-preloaded-skin={preloadedConfig.skinCode}
                >
                  <span className="embudo-preloaded-k">
                    {language === 'en' ? 'Selected configuration' : 'Configuración seleccionada'}
                  </span>
                  <span className="embudo-preloaded-v">
                    {preloadedConfig.powerTh.toLocaleString('es-MX')} TH/s · $
                    {preloadedConfig.priceUsd.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    USD · {preloadedConfig.designName} ({preloadedConfig.skinCode})
                  </span>
                </div>
              )}

              {/* Feedback banners */}
              {error && (
                <div
                  className="auth-feedback mb-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/20 text-white flex items-start gap-2"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-white/65" />
                  <span>{error}</span>
                </div>
              )}

              {info && (
                <div
                  className="auth-feedback mb-3 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-400/25 text-white flex items-start gap-2"
                  role="status"
                  aria-live="polite"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <span>{info}</span>
                </div>
              )}

              {/* ========================================================
                  VIEW 1: LOGIN
                  ======================================================== */}
              {mode === 'login' && (
                <div>
                  <div className="mb-3.5">
                    <span className="auth-eyebrow uppercase text-emerald-400/85 block mb-1">
                      01 / ACCESO
                    </span>
                    <h3 className="auth-title mb-1">
                      {t('auth.login_title')}
                    </h3>
                    <p className="auth-subtitle text-white/55">
                      {t('auth.login_desc')}
                    </p>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="space-y-3">
                    <div>
                      <label htmlFor="login-email" className="auth-label block text-white/85 mb-1">
                        {t('auth.email_label')}
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" />
                        <input
                          id="login-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={t('auth.email_placeholder')}
                          className="auth-input w-full pl-10 pr-3.5 rounded-xl bg-white/[0.035] border border-white/[0.11] text-white focus:border-white/60 focus:bg-white/[0.05] focus:outline-none transition-[border-color,background-color] duration-150 placeholder:text-white/30"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="login-password" className="auth-label text-white/85">
                          {t('auth.password_label')}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setMode('forgot-password')
                            setError('')
                            setInfo('')
                          }}
                          className="auth-back-btn text-white/50 hover:text-white transition-colors"
                        >
                          {t('auth.forgot_password')}
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" />
                        <input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="auth-input w-full pl-10 pr-10 rounded-xl bg-white/[0.035] border border-white/[0.11] text-white focus:border-white/60 focus:bg-white/[0.05] focus:outline-none transition-[border-color,background-color] duration-150 placeholder:text-white/30"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="auth-icon-btn absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                          aria-label={showPassword ? (language === 'en' ? 'Hide password' : 'Ocultar contraseña') : (language === 'en' ? 'Show password' : 'Mostrar contraseña')}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="auth-cta w-full mt-1 rounded-full bg-white hover:bg-white/90 text-[#050505] flex items-center justify-center gap-2 transition-[background-color,transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:opacity-50"
                    >
                      {submitting ? (language === 'en' ? 'Authenticating...' : 'Autenticando...') : t('auth.login_btn')}
                      {!submitting && <ArrowRight className="w-4 h-4" />}
                    </button>
                  </form>

                  <div className="auth-footer mt-3.5 pt-3 border-t border-white/[0.07] text-center text-white/45">
                    {language === 'en' ? "Don't have an account yet?" : '¿Aún no tienes cuenta?'}{' '}
                    <button
                      type="button"
                      onClick={() => {
                        saveEmbudoPresaleSelection(null)
                        setPreloadedConfig(readEmbudoPresaleSelection())
                        startEmbudoF1Registration('landing')
                        setEmbudoF1Active(true)
                        setMode('register')
                        setStep(1)
                        setError('')
                        setInfo('')
                      }}
                      className="auth-inline-btn text-white hover:underline ml-1"
                    >
                      {t('auth.register_btn')}
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================
                  VIEW 2: REGISTER (STEP 1 & 2)
                  ======================================================== */}
              {mode === 'register' && step === 1 && Boolean(user && !user.isAnonymous) && isRevisitingRegister && (
                <div data-testid="auth-revisit-register-panel">
                  <div className="mb-3.5">
                    <span className="auth-eyebrow uppercase text-emerald-400/85 block mb-1">
                      01 / REGISTRO
                    </span>
                    <h3 className="auth-title mb-1">
                      {language === 'en' ? 'Account Registered' : 'Cuenta Registrada'}
                    </h3>
                    <p className="auth-subtitle text-white/55">
                      {language === 'en'
                        ? 'You are signed in and ready to configure your presale miner, or you can sign out to register with another email.'
                        : 'Tu sesión ya está activa para configurar tu minero de preventa, o puedes cerrar sesión para registrar otro correo.'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.09] mb-3.5 flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-sm text-white font-mono truncate">{user?.email || email}</span>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      data-testid="auth-return-to-builder-btn"
                      onClick={() => {
                        advanceEmbudoF1Stage('configuring')
                        closeAuthModal()
                        navigate(EMBUDO_F1_BUILDER_ROUTE, { replace: true })
                      }}
                      className="auth-cta w-full rounded-full bg-white hover:bg-white/90 text-[#050505] flex items-center justify-center gap-2 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]"
                    >
                      {language === 'en' ? 'Continue to Configure' : 'Continuar a Configurar'}
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      data-testid="auth-switch-account-btn"
                      onClick={async () => {
                        await logout()
                        startEmbudoF1Registration('landing')
                        setEmbudoF1Active(true)
                        setMode('register')
                        setStep(1)
                        setEmail('')
                        setPassword('')
                        setConfirmPassword('')
                        setError('')
                        setInfo('')
                      }}
                      className="auth-secondary-btn w-full rounded-full border border-white/15 hover:border-white/30 text-white transition-[border-color,transform] duration-150 ease-out active:scale-[0.97]"
                    >
                      {language === 'en' ? 'Use another email (Log out)' : 'Usar otro correo (Cerrar sesión)'}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'register' && step === 1 && !(Boolean(user && !user.isAnonymous) && isRevisitingRegister) && (
                <div>
                  <div className="mb-3.5">
                    <span className="auth-eyebrow uppercase text-emerald-400/85 block mb-1">
                      01 / REGISTRO
                    </span>
                    <h3 className="auth-title mb-1">
                      {t('auth.register_title')}
                    </h3>
                    <p className="auth-subtitle text-white/55">
                      {t('auth.register_desc')}
                    </p>
                  </div>

                  <form onSubmit={handleStep1Submit} className="space-y-3">
                    <div>
                      <label htmlFor="register-email" className="auth-label block text-white/85 mb-1">
                        {t('auth.email_label')}
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" />
                        <input
                          id="register-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={t('auth.email_placeholder')}
                          className="auth-input w-full pl-10 pr-3.5 rounded-xl bg-white/[0.035] border border-white/[0.11] text-white focus:border-white/60 focus:bg-white/[0.05] focus:outline-none transition-[border-color,background-color] duration-150 placeholder:text-white/30"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="auth-cta w-full rounded-full bg-white hover:bg-white/90 text-[#050505] flex items-center justify-center gap-2 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]"
                    >
                      {language === 'en' ? 'Continue' : 'Continuar'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>

                  <div className="auth-footer mt-3.5 pt-3 border-t border-white/[0.07] text-center text-white/45">
                    {language === 'en' ? 'Already have an account?' : '¿Ya tienes una cuenta registrada?'}{' '}
                    <button
                      type="button"
                      onClick={() => {
                        clearEmbudoF1State()
                        setEmbudoF1Active(false)
                        setMode('login')
                        setError('')
                        setInfo('')
                      }}
                      className="auth-inline-btn text-white hover:underline ml-1"
                    >
                      {t('auth.login_btn')}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'register' && step === 2 && (
                <div>
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="auth-eyebrow uppercase text-emerald-400/85">
                        02 / SEGURIDAD
                      </span>
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="auth-back-btn inline-flex items-center gap-1 text-white/50 hover:text-white transition-[color,transform] duration-150 active:scale-[0.97]"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        {language === 'en' ? 'Back' : 'Volver'}
                      </button>
                    </div>
                    <h3 className="auth-title mb-1">
                      {language === 'en' ? 'Set Credentials' : 'Establecer Credenciales'}
                    </h3>
                    <p className="auth-subtitle text-white/55 truncate">
                      {language === 'en' ? 'For account ' : 'Para el usuario '}<span className="text-white font-medium">{email}</span>
                    </p>
                  </div>

                  <form onSubmit={handleRegisterSubmit} className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="register-password" className="auth-label block text-white/85 mb-1">
                          {t('auth.password_label')}
                        </label>
                        <div className="relative">
                          <input
                            id="register-password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={language === 'en' ? 'Minimum 6 characters' : 'Mínimo 6 caracteres'}
                            className="auth-input w-full pl-3.5 pr-9 rounded-xl bg-white/[0.035] border border-white/[0.11] text-white focus:border-white/60 focus:bg-white/[0.05] focus:outline-none transition-[border-color,background-color] duration-150 placeholder:text-white/30"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="auth-icon-btn absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                            aria-label={showPassword ? (language === 'en' ? 'Hide password' : 'Ocultar contraseña') : (language === 'en' ? 'Show password' : 'Mostrar contraseña')}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="register-confirm-password" className="auth-label block text-white/85 mb-1">
                          {language === 'en' ? 'Confirm Password' : 'Confirmar Contraseña'}
                        </label>
                        <input
                          id="register-confirm-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder={language === 'en' ? 'Repeat your password' : 'Repite tu contraseña'}
                          className="auth-input w-full px-3.5 rounded-xl bg-white/[0.035] border border-white/[0.11] text-white focus:border-white/60 focus:bg-white/[0.05] focus:outline-none transition-[border-color,background-color] duration-150 placeholder:text-white/30"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label htmlFor="register-ref" className="auth-label text-white/85">
                          {t('auth.referral_code_label')}
                        </label>
                        <span className="auth-optional text-white/35 uppercase shrink-0">
                          {language === 'en' ? 'Optional' : 'Opcional'}
                        </span>
                      </div>
                      <input
                        id="register-ref"
                        type="text"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        placeholder={t('auth.referral_code_placeholder')}
                        className="auth-input w-full px-3.5 rounded-xl bg-white/[0.035] border border-white/[0.11] text-white uppercase tracking-wider focus:border-white/60 focus:bg-white/[0.05] focus:outline-none transition-[border-color,background-color] duration-150 placeholder:text-white/30"
                      />
                      {refStatus === 'checking' && (
                        <p className="auth-note text-white/45 mt-1 flex items-center gap-1 font-mono">
                          <RefreshCw className="w-3 h-3 animate-spin" /> {language === 'en' ? 'Verifying code...' : 'Verificando código...'}
                        </p>
                      )}
                      {refStatus === 'valid' && (
                        <p className="auth-note text-emerald-300 mt-1 flex items-center gap-1 font-mono">
                          ✓ {language === 'en' ? 'Sponsor confirmed: ' : 'Patrocinador confirmado: '}<strong>{sponsorDetails || referralCode}</strong>
                        </p>
                      )}
                      {refStatus === 'invalid' && (
                        <p className="auth-note text-white/50 mt-1 font-mono">
                          ✕ {language === 'en' ? 'Unrecognized code. You may continue without a code.' : 'Código no reconocido. Puedes continuar sin código.'}
                        </p>
                      )}
                    </div>

                    {/* Passive informative legal note without blocking checkbox per SCRUM-317 / SCRUM-257 */}
                    <div className="auth-note text-white/45 pt-0.5">
                      <span>{t('auth.legal_pending')}</span>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="auth-cta w-full rounded-full bg-white hover:bg-white/90 text-[#050505] flex items-center justify-center gap-2 transition-[background-color,transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:opacity-50"
                    >
                      {submitting ? (language === 'en' ? 'Creating Account...' : 'Creando Cuenta...') : t('auth.register_btn')}
                    </button>
                  </form>
                </div>
              )}

              {/* ========================================================
                  VIEW 3: FORGOT PASSWORD
                  ======================================================== */}
              {mode === 'forgot-password' && (
                <div>
                  <div className="mb-3.5">
                    <span className="auth-eyebrow uppercase text-emerald-400/85 block mb-1">
                      03 / RECUPERACIÓN
                    </span>
                    <h3 className="auth-title mb-1">
                      {language === 'en' ? 'Reset password' : 'Recuperar contraseña'}
                    </h3>
                    <p className="auth-subtitle text-white/55">
                      {language === 'en'
                        ? 'Enter your email and we will send you a secure reset link.'
                        : 'Ingresa tu correo y te enviaremos un enlace de restablecimiento seguro.'}
                    </p>
                  </div>

                  <form onSubmit={handleForgotPassword} className="space-y-3">
                    <div>
                      <label htmlFor="reset-email" className="auth-label block text-white/85 mb-1">
                        {t('auth.email_label')}
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" />
                        <input
                          id="reset-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={t('auth.email_placeholder')}
                          className="auth-input w-full pl-10 pr-3.5 rounded-xl bg-white/[0.035] border border-white/[0.11] text-white focus:border-white/60 focus:bg-white/[0.05] focus:outline-none transition-[border-color,background-color] duration-150 placeholder:text-white/30"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="auth-cta w-full rounded-full bg-white hover:bg-white/90 text-[#050505] flex items-center justify-center gap-2 transition-[background-color,transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:opacity-50"
                    >
                      {submitting ? (language === 'en' ? 'Sending...' : 'Enviando...') : (language === 'en' ? 'Send instructions' : 'Enviar instrucciones')}
                    </button>
                  </form>

                  <div className="auth-footer mt-3.5 pt-3 border-t border-white/[0.07] text-center text-white/45">
                    <button
                      type="button"
                      onClick={() => {
                        clearEmbudoF1State()
                        setEmbudoF1Active(false)
                        setMode('login')
                        setError('')
                        setInfo('')
                      }}
                      className="auth-inline-btn text-white hover:underline"
                    >
                      {language === 'en' ? '← Back to Log In' : '← Volver a Iniciar Sesión'}
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================
                  VIEW 4: VERIFY EMAIL
                  ======================================================== */}
              {mode === 'verify-email' && (
                <div className="text-center py-1">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-400/25 flex items-center justify-center mx-auto mb-2.5 text-emerald-300">
                    <Mail className="w-5 h-5" />
                  </div>

                  <h3 className="auth-title mb-1.5">
                    {t('auth.email_verification_title')}
                  </h3>
                  <p className="auth-subtitle text-white/55 mb-3.5 max-w-sm mx-auto">
                    {language === 'en' ? 'We sent a confirmation link to:' : 'Hemos enviado un enlace de confirmación a:'}
                    <br />
                    <span className="text-white font-mono font-semibold">{email || user?.email || (language === 'en' ? 'your email' : 'tu correo')}</span>
                  </p>

                  <div className="p-3 rounded-xl bg-white/[0.025] border border-white/[0.08] text-left mb-3.5 space-y-1">
                    <div className="auth-label flex items-center gap-2 text-white">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      {language === 'en' ? 'Step required for activation:' : 'Paso requerido para activación:'}
                    </div>
                    <p className="auth-note text-white/45 pl-5">
                      {language === 'en'
                        ? 'Click the link sent to your inbox or spam folder to activate your presale rights.'
                        : 'Haz clic en el enlace enviado a tu bandeja de entrada o carpeta de spam para activar tus derechos de preventa.'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleCheckVerification}
                      disabled={submitting}
                      className="auth-cta w-full rounded-full bg-white hover:bg-white/90 text-[#050505] flex items-center justify-center gap-2 transition-[background-color,transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:opacity-50"
                    >
                      {submitting ? (language === 'en' ? 'Checking status...' : 'Comprobando estado...') : (language === 'en' ? "I've verified my email ✓" : 'Ya verifiqué mi correo ✓')}
                    </button>

                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendCooldown > 0 || submitting}
                      className="auth-secondary-btn w-full rounded-full border border-white/15 hover:border-white/30 text-white transition-[border-color,transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:opacity-40"
                    >
                      {resendCooldown > 0
                        ? (language === 'en' ? `Resend email in ${resendCooldown}s` : `Reenviar correo en ${resendCooldown}s`)
                        : (language === 'en' ? 'Resend verification link' : 'Reenviar enlace de verificación')}
                    </button>
                  </div>

                  {shouldShowEmulatorVerifyDevTools(useFirebaseEmulators) && (
                    <div
                      data-testid="verify-emulator-devtools"
                      className="mt-3.5 p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-400/25 text-left space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                          {language === 'en' ? 'DEV · Firebase Emulators' : 'DEV · Emulador Firebase'}
                        </span>
                        <span className="text-[11px] font-mono text-white/45">UI :4000 → Logs</span>
                      </div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        {language === 'en'
                          ? 'Open the Emulator UI (:4000 → Logs), copy the verification link or oobCode emitted by Auth (:9099), and paste it below:'
                          : 'Abre la UI del emulador (:4000 → Logs), copia el enlace de verificación o el oobCode emitido por Auth (:9099) y pégalo aquí:'}
                      </p>
                      <div className="space-y-2">
                        <label htmlFor="verify-emulator-oob" className="block text-[11px] font-medium text-white/70">
                          {language === 'en' ? 'Verification link or oobCode' : 'Enlace de verificación o código oobCode'}
                        </label>
                        <input
                          id="verify-emulator-oob"
                          data-testid="verify-emulator-oob-input"
                          type="text"
                          value={emulatorOobInput}
                          onChange={(e) => setEmulatorOobInput(e.target.value)}
                          placeholder="http://127.0.0.1:9099/emulator/action?mode=verifyEmail&oobCode=..."
                          className="auth-input w-full px-3 rounded-xl bg-white/[0.04] border border-white/[0.14] text-white text-xs font-mono focus:border-emerald-400/70 focus:outline-none transition-[border-color,background-color] duration-150 placeholder:text-white/30"
                        />
                        <button
                          type="button"
                          data-testid="verify-emulator-apply-btn"
                          disabled={submitting || !emulatorOobInput.trim()}
                          onClick={() => void handleApplyEmulatorVerification()}
                          className="w-full py-2 px-3.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-[#050505] text-xs font-semibold flex items-center justify-center gap-1.5 transition-[background-color,transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:opacity-45"
                        >
                          {submitting
                            ? (language === 'en' ? 'Applying code...' : 'Aplicando código...')
                            : (language === 'en' ? 'Verify with emulator link / oobCode' : 'Verificar con enlace / oobCode del emulador')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="auth-footer mt-3.5 pt-3 border-t border-white/[0.07] text-center">
                    <button
                      type="button"
                      onClick={() => {
                        clearEmbudoF1State()
                        setEmbudoF1Active(false)
                        logout()
                        setMode('login')
                        setError('')
                        setInfo('')
                      }}
                      className="auth-back-btn text-white/45 hover:text-white transition-colors"
                    >
                      {language === 'en' ? 'Log out or use another account' : 'Cerrar sesión o usar otra cuenta'}
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================
                  VIEW 5: EMAIL VERIFIED SUCCESS
                  ======================================================== */}
              {mode === 'email-verified' && (
                <div className="text-center py-1">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center mx-auto mb-2.5 text-emerald-300">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>

                  <h3 className="auth-title mb-1.5">
                    {language === 'en' ? 'Email Verified!' : '¡Correo Verificado!'}
                  </h3>
                  <p className="auth-subtitle text-white/55 mb-3.5 max-w-sm mx-auto">
                    {language === 'en'
                      ? 'Your digital identity has been confirmed on the PouwMiner network. Your account is active and enabled for presale reservation.'
                      : 'Tu identidad digital ha sido confirmada en la red PouwMiner. Tu cuenta se encuentra activa y habilitada para reservar hashrate en la preventa.'}
                  </p>

                  <div className="p-3 rounded-xl bg-white/[0.025] border border-white/[0.08] text-left mb-3.5">
                    <p className="auth-fomo-label text-white uppercase">
                      {language === 'en' ? 'Presale Account Allocation' : 'Asignación de Cuenta en Preventa'}
                    </p>
                    <p className="auth-note text-white/45 mt-0.5">
                      {language === 'en' ? 'Access to Titan Series 15-day batches.' : 'Acceso a los lotes Titan Series de 15 días.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const funnelDone = readEmbudoF1State()
                      const targetMinerId = funnelDone.lastMinerId
                      if (funnelDone.active) {
                        advanceEmbudoF1Stage('dashboard')
                      }
                      closeAuthModal()
                      if (targetMinerId) {
                        navigate(`/nft-miners/${encodeURIComponent(targetMinerId)}`, { replace: true })
                      } else if (funnelDone.active) {
                        navigate('/nft-miners', { replace: true })
                      }
                    }}
                    className="auth-cta w-full rounded-full bg-white hover:bg-white/90 text-[#050505] transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]"
                  >
                    {funnelSnapshot.lastMinerId
                      ? (language === 'en' ? 'Open My Miner Live →' : 'Ir a Mi Miner en vivo →')
                      : (language === 'en' ? 'Continue to Miner Presale' : 'Continuar a la Preventa de Mineros')}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}
