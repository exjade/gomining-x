import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Wallet,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { checkReferralCode, simulatedRegister, simulatedLogin, simulatedResetPassword } from '../../lib/authService';
import { LegalMode } from '../legal/LegalModal';

export type AuthMode = 'login' | 'register' | 'forgot-password' | 'verify-email' | 'email-verified' | null;

interface AuthModalProps {
  mode: AuthMode;
  onClose: () => void;
  onSwitchMode: (mode: AuthMode) => void;
  onOpenLegal: (mode: LegalMode) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  mode,
  onClose,
  onSwitchMode,
  onOpenLegal,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [refStatus, setRefStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [sponsorName, setSponsorName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Live FOMO countdown
  const [fomoTime, setFomoTime] = useState({ d: 14, h: 23, m: 48, s: 35 });
  useEffect(() => {
    const timer = setInterval(() => {
      setFomoTime((prev) => {
        if (prev.s > 0) return { ...prev, s: prev.s - 1 };
        if (prev.m > 0) return { ...prev, m: prev.m - 1, s: 59 };
        if (prev.h > 0) return { ...prev, h: prev.h - 1, m: 59, s: 59 };
        if (prev.d > 0) return { ...prev, d: prev.d - 1, h: 23, m: 59, s: 59 };
        return prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setError('');
    setInfo('');
    if (mode === 'register') setStep(1);
  }, [mode]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref') || localStorage.getItem('pouwminer_ref');
      if (ref) {
        setReferralCode(ref.toUpperCase());
        localStorage.setItem('pouwminer_ref', ref.toUpperCase());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const code = referralCode.trim();
    if (!code) {
      setRefStatus('idle');
      setSponsorName('');
      return;
    }

    setRefStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await checkReferralCode(code);
        if (res.valid) {
          setRefStatus('valid');
          setSponsorName(res.sponsorName || code);
        } else {
          setRefStatus('invalid');
          setSponsorName('');
        }
      } catch {
        setRefStatus('invalid');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [referralCode]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  useEffect(() => {
    if (mode) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mode]);

  if (!mode) return null;

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !email.includes('@')) {
      setError('Por favor ingresa un correo electrónico corporativo o personal válido.');
      return;
    }
    setStep(2);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (!acceptedTerms) {
      setError('Debes aceptar los Términos de Servicio y la Política de Privacidad.');
      return;
    }
    if (referralCode.trim() && refStatus === 'invalid') {
      setError('El código de patrocinador ingresado no es válido.');
      return;
    }

    setSubmitting(true);
    try {
      await simulatedRegister(email, password, referralCode);
      setSubmitting(false);
      onSwitchMode('verify-email');
      setResendCooldown(30);
    } catch (err: any) {
      setSubmitting(false);
      setError(err?.message || 'Error al procesar el registro.');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Por favor completa todos los campos.');
      return;
    }
    setSubmitting(true);
    try {
      await simulatedLogin(email, password);
      setSubmitting(false);
      setInfo('Inicio de sesión exitoso. Redirigiendo a la plataforma...');
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setSubmitting(false);
      setError(err?.message || 'Credenciales no válidas.');
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !email.includes('@')) {
      setError('Ingresa tu correo para enviarte las instrucciones.');
      return;
    }
    setSubmitting(true);
    try {
      await simulatedResetPassword(email);
      setSubmitting(false);
      setInfo('Hemos enviado un enlace seguro a tu bandeja de entrada.');
    } catch (err: any) {
      setSubmitting(false);
      setError('No pudimos procesar la solicitud.');
    }
  };

  const handleCheckVerification = () => {
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      onSwitchMode('email-verified');
    }, 700);
  };

  const handleResendVerification = () => {
    if (resendCooldown > 0) return;
    setResendCooldown(30);
    setInfo('Nuevo enlace de verificación enviado.');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/90 backdrop-blur-md"
        />

        {/* Modal Box with Subtle Purple Ambient Hover Glow */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="group relative w-full max-w-md rounded-3xl bg-[#0a0a0a] border border-white/10 hover:border-purple-500/30 shadow-2xl text-white overflow-hidden z-10 p-7 sm:p-8 select-none transition-all duration-500"
        >
          {/* Subtle blurred purple gradient on mouse hover */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-purple-600/10 group-hover:bg-purple-600/20 rounded-full blur-[80px] pointer-events-none transition-all duration-700" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-900/10 group-hover:bg-purple-900/25 rounded-full blur-[90px] pointer-events-none transition-all duration-700" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors active:scale-[0.97] z-20"
            aria-label="Cerrar"
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

          {/* Messages */}
          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-white/[0.03] border border-white/20 text-white text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-white/60" />
              <span>{error}</span>
            </div>
          )}
          {info && (
            <div className="mb-4 p-3.5 rounded-xl bg-white/[0.04] border border-white/20 text-white text-xs flex items-start gap-2.5">
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
                  Iniciar Sesión
                </h3>
                <p className="text-xs text-white/50">
                  Accede a tu panel de potencia y gestión de mineros digitales.
                </p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5 font-mono">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-white/30" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nombre@ejemplo.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-white/70 font-mono">Contraseña</label>
                    <button
                      type="button"
                      onClick={() => onSwitchMode('forgot-password')}
                      className="text-xs text-white/50 hover:text-white transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-white/30" />
                    <input
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
                  {submitting ? 'Autenticando...' : 'Entrar a la Plataforma'}
                  {!submitting && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">O</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <button
                type="button"
                onClick={() => alert('Conexión Web3 Wallet activa en preventa.')}
                className="w-full py-3 rounded-full border border-white/15 hover:border-white/30 bg-transparent text-white text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
              >
                <Wallet className="w-4 h-4 text-white/60" />
                Conectar con Billetera Web3
              </button>

              <div className="mt-6 text-center text-xs text-white/40">
                ¿Aún no tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => onSwitchMode('register')}
                  className="text-white hover:underline font-semibold ml-1"
                >
                  Crear Cuenta
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
                  Crear Cuenta PouwMiner
                </h3>
                <p className="text-xs text-white/50">
                  Reserva tu cupo de preventa y comienza a operar potencia digital.
                </p>
              </div>

              <form onSubmit={handleStep1Submit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5 font-mono">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-white/30" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nombre@ejemplo.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                >
                  Continuar
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">O</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <button
                type="button"
                onClick={() => alert('Conexión Web3 Wallet activa en preventa.')}
                className="w-full py-3 rounded-full border border-white/15 hover:border-white/30 bg-transparent text-white text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
              >
                <Wallet className="w-4 h-4 text-white/60" />
                Registrarse con Wallet Web3
              </button>

              <div className="mt-6 text-center text-xs text-white/40">
                ¿Ya tienes una cuenta registrada?{' '}
                <button
                  type="button"
                  onClick={() => onSwitchMode('login')}
                  className="text-white hover:underline font-semibold ml-1"
                >
                  Inicia Sesión
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
                Volver
              </button>

              <div className="mb-5">
                <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 block mb-1">
                  02 / SEGURIDAD
                </span>
                <h3 className="text-2xl font-bold tracking-tight text-white mb-1">
                  Establecer Credenciales
                </h3>
                <p className="text-xs text-white/50">
                  Para el usuario <span className="text-white font-medium">{email}</span>
                </p>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1 font-mono">Contraseña</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-white/40 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1 font-mono">Confirmar Contraseña</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite tu contraseña"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-white/70 font-mono">Código de Referido / Sponsor</label>
                    <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">Opcional</span>
                  </div>
                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="Ej. TITAN o PEARL"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm uppercase tracking-wider focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                  />
                  {refStatus === 'checking' && (
                    <p className="text-[11px] text-white/40 mt-1 flex items-center gap-1 font-mono">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Verificando código...
                    </p>
                  )}
                  {refStatus === 'valid' && (
                    <p className="text-[11px] text-white mt-1 flex items-center gap-1 font-mono">
                      ✓ Patrocinador confirmado: <strong>{sponsorName}</strong> (Beneficio 10%)
                    </p>
                  )}
                  {refStatus === 'invalid' && (
                    <p className="text-[11px] text-white/50 mt-1 font-mono">
                      ✕ Código no reconocido. Puedes continuar sin código.
                    </p>
                  )}
                </div>

                <div className="flex items-start gap-2 pt-1">
                  <input
                    id="terms-check"
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-white/5 text-white focus:ring-0 focus:ring-offset-0 cursor-pointer accent-white"
                  />
                  <label htmlFor="terms-check" className="text-[11px] text-white/50 leading-tight">
                    Acepto los{' '}
                    <button
                      type="button"
                      onClick={() => onOpenLegal('terms')}
                      className="text-white hover:underline font-medium"
                    >
                      Términos de Servicio
                    </button>{' '}
                    y las{' '}
                    <button
                      type="button"
                      onClick={() => onOpenLegal('security')}
                      className="text-white hover:underline font-medium"
                    >
                      Políticas de Seguridad y Privacidad
                    </button>
                    .
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 mt-2 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                >
                  {submitting ? 'Creando Cuenta...' : 'Finalizar Registro'}
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
                  Recuperar Contraseña
                </h3>
                <p className="text-xs text-white/50">
                  Ingresa tu correo y te enviaremos un enlace de restablecimiento seguro.
                </p>
              </div>

              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5 font-mono">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-white/30" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nombre@ejemplo.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-white focus:outline-none transition-colors placeholder:text-white/20"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                >
                  {submitting ? 'Enviando...' : 'Enviar Instrucciones'}
                </button>
              </form>

              <div className="mt-6 text-center text-xs text-white/40">
                <button
                  type="button"
                  onClick={() => onSwitchMode('login')}
                  className="text-white hover:underline font-semibold"
                >
                  ← Volver a Iniciar Sesión
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
                Verifica tu Correo Electrónico
              </h3>
              <p className="text-xs text-white/50 mb-5 max-w-sm mx-auto leading-relaxed">
                Hemos enviado un enlace de confirmación a:
                <br />
                <span className="text-white font-mono font-semibold">{email || 'tu correo'}</span>
              </p>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-left mb-6 text-xs text-white/60 space-y-1">
                <div className="flex items-center gap-2 text-white font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-white/70" />
                  Paso requerido para activación:
                </div>
                <p className="text-white/40 pl-5 text-[11px]">
                  Haz clic en el enlace enviado a tu bandeja de entrada o carpeta de spam para activar tus derechos de preventa.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleCheckVerification}
                  disabled={submitting}
                  className="w-full py-3.5 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                >
                  {submitting ? 'Comprobando estado...' : 'Ya verifiqué mi correo ✓'}
                </button>

                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendCooldown > 0}
                  className="w-full py-3 rounded-full border border-white/15 hover:border-white/30 text-white text-xs font-medium transition-all active:scale-[0.97] disabled:opacity-40"
                >
                  {resendCooldown > 0 ? `Reenviar correo en ${resendCooldown}s` : 'Reenviar enlace de verificación'}
                </button>
              </div>

              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => onSwitchMode('login')}
                  className="text-xs text-white/40 hover:text-white"
                >
                  Cerrar sesión o usar otra cuenta
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
                ¡Correo Verificado!
              </h3>
              <p className="text-xs text-white/50 mb-6 max-w-sm mx-auto leading-relaxed">
                Tu identidad digital ha sido confirmada en la red PowMiner. Tu cuenta se encuentra activa y habilitada para reservar hashrate en la preventa.
              </p>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-left mb-6 text-xs text-white/70">
                <p className="font-semibold text-white font-mono uppercase tracking-wider text-[11px]">Asignación de Preventa Garantizada</p>
                <p className="text-[11px] text-white/40 mt-1">Acceso preferencial a los lotes Titan Series de 15 días.</p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-4 rounded-full bg-white hover:bg-white/90 text-[#050505] font-bold text-sm transition-all active:scale-[0.97]"
              >
                Continuar a la Preventa de Mineros
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
