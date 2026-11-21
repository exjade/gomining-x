import React, { useState, useEffect } from 'react'
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
import { findUserByReferralCode } from './firebase'
import { usePersonalization } from './personalization'
import {
  decrementResendCooldown,
  validateForgotPasswordEmail,
  validateLoginFields,
  validateRegisterStep2,
  validateStep1Email,
} from './authModalValidation'
import {
  EmbudoFunnelProgress,
  advanceEmbudoF1Stage,
  clearEmbudoF1State,
  readEmbudoF1State,
  resolvePostRegisterTransition,
} from './components/embudo-f1'
import './landing.css'

export type AuthMode = 'login' | 'register' | 'forgot-password' | 'verify-email' | 'email-verified'

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

  const { t, language } = usePersonalization()

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
  const [embudoF1Active, setEmbudoF1Active] = useState(false)

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
    if (!authModalOpen && readEmbudoF1State().stage === 'verify-email') {
      clearEmbudoF1State()
    }
  }, [authMode, authModalOpen])

  useEffect(() => {
    if (!authModalOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAuthModal()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [authModalOpen, closeAuthModal])

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
      const verified = await checkVerification()
      if (verified) {
        setMode('email-verified')
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
          : 'Nuevo enlace de verificación enviado.'
      )
      setResendCooldown(30)
    } catch (err: any) {
      setError(err?.message || (language === 'en' ? 'Error resending email.' : 'Error al reenviar el correo.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {authModalOpen && (
        <div className="pouw-landing-root pouw-auth-modal-scope">
          <div className="pouw-auth-modal-root">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeAuthModal}
              className="pouw-auth-modal-backdrop"
            />

            {/* Modal Box with Subtle Purple Ambient Hover Glow */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="group relative w-full max-w-md rounded-3xl bg-[#0a0a0a] border border-white/10 hover:border-purple-500/30 shadow-2xl text-white overflow-hidden z-10 p-7 sm:p-8 select-none transition-all duration-500"
              role="dialog"
              aria-modal="true"
              aria-label={language === 'en' ? 'PouwMiner account access' : 'Acceso a cuenta PouwMiner'}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Subtle blurred purple gradient on mouse hover */}
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-purple-600/10 group-hover:bg-purple-600/20 rounded-full blur-[80px] pointer-events-none transition-all duration-700" />
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-900/10 group-hover:bg-purple-900/25 rounded-full blur-[90px] pointer-events-none transition-all duration-700" />

              {/* Close button */}
              <button
                type="button"
                onClick={closeAuthModal}
                className="absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors active:scale-[0.97] z-20"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>

              {/* Logo / Badge */}
              <div className="flex items-center gap-2.5 mb-4 relative z-10">
                <span className="font-extrabold tracking-tight text-base text-white">
                  PouwMiner <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest pl-1 border-l border-white/20">Auth</span>
                </span>
              </div>

              {/* FOMO Live Countdown Banner */}
              <div className="mb-5 p-2.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-2 text-[10px] font-mono text-white/70 relative z-10">
                <div className="flex items-center gap-1.5 text-white">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                  <span className="font-bold tracking-wider uppercase">Preventa Titan</span>
                </div>
                <div className="flex items-center gap-1 font-bold text-white tracking-widest">
                  <span>{fomoTime.d}d</span> :
                  <span>{String(fomoTime.h).padStart(2, '0')}h</span> :
                  <span>{String(fomoTime.m).padStart(2, '0')}m</span> :
                  <span className="text-purple-300">{String(fomoTime.s).padStart(2, '0')}s</span>
                </div>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-[9px] text-white/50">
                  24 Cupos
                </span>
              </div>

              {/* Embudo F1 Step Progress Indicator */}
              {embudoF1Active && (mode === 'register' || mode === 'verify-email') && (
                <EmbudoFunnelProgress
                  currentStep={mode === 'verify-email' ? 'verify-email' : 'registering'}
                  language={language}
                  variant="modal"
                />
              )}

              {/* Feedback banners */}
              {error && (
                <div
                  className="mb-4 p-3.5 rounded-xl bg-white/[0.03] border border-white/20 text-white text-xs flex items-start gap-2.5"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-white/60" />
                  <span>{error}</span>
                </div>
              )}

              {info && (
                <div
                  className="mb-4 p-3.5 rounded-xl bg-white/[0.04] border border-white/20 text-white text-xs flex items-start gap-2.5"
                  role="status"
                  aria-live="polite"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-white" />
                  <span>{info}</span>
                </div>
              )}

              {/* ========================================================
                  VIEW 1: LOGIN
                  ======================================================== */}
              {mode === 'login' && (
                <div>
                  <div className="mb-6">
                    <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 block mb-1">
                      01 / ACCESO
                    </span>
                    <h3 className="text-2xl font-bold tracking-tight text-white mb-1">
                      {t('auth.login_title')}
                    </h3>
                    <p className="text-xs text-white/50">
                      {t('auth.login_desc')}
                    </p>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="login-email" className="block text-xs font-medium text-white/70 mb-1.5 font-mono">
                        {t('auth.email_label')}
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-3 w-4 h-4 text-white/30" />
                        <input
                          id="login-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={t('auth.email_placeholder')}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="login-password" className="text-xs font-medium text-white/70 font-mono">
                          {t('auth.password_label')}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setMode('forgot-password')
                            setError('')
                            setInfo('')
                          }}
                          className="text-xs text-white/50 hover:text-white transition-colors"
                        >
                          {t('auth.forgot_password')}
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-3 w-4 h-4 text-white/30" />
                        <input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-white/40 hover:text-white"
                          aria-label={showPassword ? (language === 'en' ? 'Hide password' : 'Ocultar contraseña') : (language === 'en' ? 'Show password' : 'Mostrar contraseña')}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3.5 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                    >
                      {submitting ? (language === 'en' ? 'Authenticating...' : 'Autenticando...') : t('auth.login_btn')}
                      {!submitting && <ArrowRight className="w-4 h-4" />}
                    </button>
                  </form>

                  <div className="mt-6 text-center text-xs text-white/40">
                    {language === 'en' ? "Don't have an account yet?" : '¿Aún no tienes cuenta?'}{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('register')
                        setStep(1)
                        setError('')
                        setInfo('')
                      }}
                      className="text-white hover:underline font-semibold ml-1"
                    >
                      {t('auth.register_btn')}
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================
                  VIEW 2: REGISTER (STEP 1 & 2)
                  ======================================================== */}
              {mode === 'register' && step === 1 && (
                <div>
                  <div className="mb-6">
                    <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 block mb-1">
                      01 / REGISTRO
                    </span>
                    <h3 className="text-2xl font-bold tracking-tight text-white mb-1">
                      {t('auth.register_title')}
                    </h3>
                    <p className="text-xs text-white/50">
                      {t('auth.register_desc')}
                    </p>
                  </div>

                  <form onSubmit={handleStep1Submit} className="space-y-4">
                    <div>
                      <label htmlFor="register-email" className="block text-xs font-medium text-white/70 mb-1.5 font-mono">
                        {t('auth.email_label')}
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-3 w-4 h-4 text-white/30" />
                        <input
                          id="register-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={t('auth.email_placeholder')}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3.5 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                    >
                      {language === 'en' ? 'Continue' : 'Continuar'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>

                  <div className="mt-6 text-center text-xs text-white/40">
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
                      className="text-white hover:underline font-semibold ml-1"
                    >
                      {t('auth.login_btn')}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'register' && step === 2 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center gap-1.5 text-xs font-mono text-white/40 hover:text-white mb-4 transition-colors active:scale-[0.97]"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    {language === 'en' ? 'Back' : 'Volver'}
                  </button>

                  <div className="mb-5">
                    <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 block mb-1">
                      02 / SEGURIDAD
                    </span>
                    <h3 className="text-2xl font-bold tracking-tight text-white mb-1">
                      {language === 'en' ? 'Set Credentials' : 'Establecer Credenciales'}
                    </h3>
                    <p className="text-xs text-white/50">
                      {language === 'en' ? 'For account ' : 'Para el usuario '}<span className="text-white font-medium">{email}</span>
                    </p>
                  </div>

                  <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                    <div>
                      <label htmlFor="register-password" className="block text-xs font-medium text-white/70 mb-1 font-mono">
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
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-white/40 hover:text-white"
                          aria-label={showPassword ? (language === 'en' ? 'Hide password' : 'Ocultar contraseña') : (language === 'en' ? 'Show password' : 'Mostrar contraseña')}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="register-confirm-password" className="block text-xs font-medium text-white/70 mb-1 font-mono">
                        {language === 'en' ? 'Confirm Password' : 'Confirmar Contraseña'}
                      </label>
                      <input
                        id="register-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={language === 'en' ? 'Repeat your password' : 'Repite tu contraseña'}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="register-ref" className="text-xs font-medium text-white/70 font-mono">
                          {t('auth.referral_code_label')}
                        </label>
                        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                          {language === 'en' ? 'Optional' : 'Opcional'}
                        </span>
                      </div>
                      <input
                        id="register-ref"
                        type="text"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        placeholder={t('auth.referral_code_placeholder')}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm uppercase tracking-wider focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                      />
                      {refStatus === 'checking' && (
                        <p className="text-[11px] text-white/40 mt-1 flex items-center gap-1 font-mono">
                          <RefreshCw className="w-3 h-3 animate-spin" /> {language === 'en' ? 'Verifying code...' : 'Verificando código...'}
                        </p>
                      )}
                      {refStatus === 'valid' && (
                        <p className="text-[11px] text-white mt-1 flex items-center gap-1 font-mono">
                          ✓ {language === 'en' ? 'Sponsor confirmed: ' : 'Patrocinador confirmado: '}<strong>{sponsorDetails || referralCode}</strong>
                        </p>
                      )}
                      {refStatus === 'invalid' && (
                        <p className="text-[11px] text-white/50 mt-1 font-mono">
                          ✕ {language === 'en' ? 'Unrecognized code. You may continue without a code.' : 'Código no reconocido. Puedes continuar sin código.'}
                        </p>
                      )}
                    </div>

                    {/* Passive informative legal note without blocking checkbox per SCRUM-317 / SCRUM-257 */}
                    <div className="pt-1 text-[11px] text-white/50 leading-tight">
                      <span>{t('auth.legal_pending')}</span>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3.5 mt-2 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
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
                  <div className="mb-6">
                    <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 block mb-1">
                      03 / RECUPERACIÓN
                    </span>
                    <h3 className="text-2xl font-bold tracking-tight text-white mb-1">
                      {language === 'en' ? 'Reset password' : 'Recuperar contraseña'}
                    </h3>
                    <p className="text-xs text-white/50">
                      {language === 'en'
                        ? 'Enter your email and we will send you a secure reset link.'
                        : 'Ingresa tu correo y te enviaremos un enlace de restablecimiento seguro.'}
                    </p>
                  </div>

                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div>
                      <label htmlFor="reset-email" className="block text-xs font-medium text-white/70 mb-1.5 font-mono">
                        {t('auth.email_label')}
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-3 w-4 h-4 text-white/30" />
                        <input
                          id="reset-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={t('auth.email_placeholder')}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3.5 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                    >
                      {submitting ? (language === 'en' ? 'Sending...' : 'Enviando...') : (language === 'en' ? 'Send instructions' : 'Enviar instrucciones')}
                    </button>
                  </form>

                  <div className="mt-6 text-center text-xs text-white/40">
                    <button
                      type="button"
                      onClick={() => {
                        clearEmbudoF1State()
                        setEmbudoF1Active(false)
                        setMode('login')
                        setError('')
                        setInfo('')
                      }}
                      className="text-white hover:underline font-semibold"
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
                <div className="text-center py-2">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/20 flex items-center justify-center mx-auto mb-4 text-white">
                    <Mail className="w-8 h-8 animate-pulse" />
                  </div>

                  <h3 className="text-2xl font-bold tracking-tight text-white mb-2">
                    {t('auth.email_verification_title')}
                  </h3>
                  <p className="text-xs text-white/50 mb-5 max-w-sm mx-auto leading-relaxed">
                    {language === 'en' ? 'We sent a confirmation link to:' : 'Hemos enviado un enlace de confirmación a:'}
                    <br />
                    <span className="text-white font-mono font-semibold">{email || user?.email || (language === 'en' ? 'your email' : 'tu correo')}</span>
                  </p>

                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-left mb-6 text-xs text-white/60 space-y-1">
                    <div className="flex items-center gap-2 text-white font-medium">
                      <Sparkles className="w-3.5 h-3.5 text-white/70" />
                      {language === 'en' ? 'Step required for activation:' : 'Paso requerido para activación:'}
                    </div>
                    <p className="text-white/40 pl-5 text-[11px]">
                      {language === 'en'
                        ? 'Click the link sent to your inbox or spam folder to activate your presale rights.'
                        : 'Haz clic en el enlace enviado a tu bandeja de entrada o carpeta de spam para activar tus derechos de preventa.'}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleCheckVerification}
                      disabled={submitting}
                      className="w-full py-3.5 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                    >
                      {submitting ? (language === 'en' ? 'Checking status...' : 'Comprobando estado...') : (language === 'en' ? "I've verified my email ✓" : 'Ya verifiqué mi correo ✓')}
                    </button>

                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendCooldown > 0 || submitting}
                      className="w-full py-3 rounded-full border border-white/15 hover:border-white/30 text-white text-xs font-medium transition-all active:scale-[0.97] disabled:opacity-40"
                    >
                      {resendCooldown > 0
                        ? (language === 'en' ? `Resend email in ${resendCooldown}s` : `Reenviar correo en ${resendCooldown}s`)
                        : (language === 'en' ? 'Resend verification link' : 'Reenviar enlace de verificación')}
                    </button>
                  </div>

                  <div className="mt-5 text-center">
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
                      className="text-xs text-white/40 hover:text-white"
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
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/30 flex items-center justify-center mx-auto mb-4 text-white">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>

                  <h3 className="text-3xl font-bold tracking-tight text-white mb-2">
                    {language === 'en' ? 'Email Verified!' : '¡Correo Verificado!'}
                  </h3>
                  <p className="text-xs text-white/50 mb-6 max-w-sm mx-auto leading-relaxed">
                    {language === 'en'
                      ? 'Your digital identity has been confirmed on the PouwMiner network. Your account is active and enabled for presale reservation.'
                      : 'Tu identidad digital ha sido confirmada en la red PouwMiner. Tu cuenta se encuentra activa y habilitada para reservar hashrate en la preventa.'}
                  </p>

                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-left mb-6 text-xs text-white/70">
                    <p className="font-semibold text-white font-mono uppercase tracking-wider text-[11px]">
                      {language === 'en' ? 'Presale Account Allocation' : 'Asignación de Cuenta en Preventa'}
                    </p>
                    <p className="text-[11px] text-white/40 mt-1">
                      {language === 'en' ? 'Access to Titan Series 15-day batches.' : 'Acceso a los lotes Titan Series de 15 días.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeAuthModal}
                    className="w-full py-4 rounded-full bg-white hover:bg-white/90 text-[#050505] font-bold text-sm transition-all active:scale-[0.97]"
                  >
                    {language === 'en' ? 'Continue to Miner Presale' : 'Continuar a la Preventa de Mineros'}
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
