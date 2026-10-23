import React, { useState } from 'react';
import { 
  Zap, 
  Lock, 
  Mail, 
  User, 
  ArrowRight, 
  ShieldCheck, 
  Sparkles, 
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { registerWithFirebase, loginWithFirebase } from '../utils/firebaseAuth';
import { registerLocalUser, loginLocalUser } from '../utils/localAuthService';
import { apiFetch } from '../utils/apiConfig';

interface AuthScreenProps {
  onLogin: (user: any, token: string) => void;
  onOpenLanding?: () => void;
  isDarkTheme?: boolean;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, onOpenLanding, isDarkTheme = false }) => {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let isCompleted = false;

      // 1. Firebase Auth Engine
      try {
        if (authMode === 'register') {
          const targetEmail = email.trim() || `${username.trim().toLowerCase()}@minerx.local`;
          const fbRes = await registerWithFirebase(targetEmail, password, fullName || username);
          if (fbRes.success && fbRes.token && fbRes.user) {
            localStorage.setItem('minerx_auth_token', fbRes.token);
            onLogin(fbRes.user, fbRes.token);
            isCompleted = true;
          }
        } else if (username.includes('@')) {
          const fbRes = await loginWithFirebase(username, password);
          if (fbRes.success && fbRes.token && fbRes.user) {
            localStorage.setItem('minerx_auth_token', fbRes.token);
            onLogin(fbRes.user, fbRes.token);
            isCompleted = true;
          }
        }
      } catch (fbErr: any) {
        console.warn('[MinerX AuthScreen] Firebase client notice:', fbErr?.message);
      }

      // 2. Remote Backend
      if (!isCompleted) {
        try {
          const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
          const body = authMode === 'register'
            ? { username, email: email || `${username}@minerx.local`, password, fullName }
            : { usernameOrEmail: username, password };

          const res = await apiFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const data = await res.json();
          if (data && data.success && data.token) {
            localStorage.setItem('minerx_auth_token', data.token);
            onLogin(data.user, data.token);
            isCompleted = true;
          } else if (data && data.message && !data.error?.includes('OFFLINE') && !data.error?.includes('NETWORK')) {
            throw new Error(data.message);
          }
        } catch (remoteErr: any) {
          if (remoteErr.message && !remoteErr.message.includes('JSON') && !remoteErr.message.includes('fetch') && !remoteErr.message.includes('segundo plano')) {
            throw remoteErr;
          }
        }
      }

      // 3. Autonomous Local Vault Fallback (Guarantees login/register ALWAYS works offline)
      if (!isCompleted) {
        if (authMode === 'register') {
          const result = registerLocalUser(
            username, 
            email || `${username}@minerx.local`, 
            password, 
            fullName || username
          );
          if (!result.success) throw new Error(result.message || 'Error en el registro');
          localStorage.setItem('minerx_auth_token', result.token!);
          onLogin(result.user, result.token!);
        } else {
          const result = loginLocalUser(username, password);
          if (!result.success) throw new Error(result.message || 'Credenciales incorrectas');
          localStorage.setItem('minerx_auth_token', result.token!);
          onLogin(result.user, result.token!);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = () => {
    const res = loginLocalUser('admin', 'admin123');
    if (res.success && res.token && res.user) {
      localStorage.setItem('minerx_auth_token', res.token);
      onLogin(res.user, res.token);
    }
  };

  return (
    <div className={`min-h-screen w-full flex items-center justify-center p-4 sm:p-6 select-none font-sans relative overflow-hidden ${
      isDarkTheme ? 'bg-[#07090F] text-white' : 'bg-[#EDEFF8] text-slate-900'
    }`}>
      {/* Soft Pastel Background Ambient Glows */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Authentication Card */}
      <div className={`w-full max-w-md rounded-[32px] backdrop-blur-xl border p-6 sm:p-8 relative z-10 space-y-6 ${
        isDarkTheme ? 'bg-[#0B0F19]/95 border-white/[0.08] text-white shadow-2xl' : 'bg-white/95 border-slate-200/90 text-slate-900 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.07)]'
      }`}>
        
        {/* Top Header & Logo */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-slate-900 flex items-center justify-center text-[#05DF72] shadow-md border border-slate-800">
            <Zap className="h-7 w-7 fill-[#05DF72]" />
          </div>
          <h1 className={`text-2xl font-extrabold tracking-tight font-rajdhani uppercase pt-1 ${
            isDarkTheme ? 'text-white' : 'text-slate-900'
          }`}>
            MinerX <span className="text-[#05DF72]">PRO</span>
          </h1>
          <p className={`text-xs font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            Terminal de Telemetría Kryptex PRL & Flota SaladCloud
          </p>
        </div>

        {/* Tab Switcher (Iniciar Sesión / Crear Cuenta) */}
        <div className={`flex rounded-2xl p-1 border ${
          isDarkTheme ? 'bg-white/[0.04] border-white/10' : 'bg-slate-100 border-slate-200/70'
        }`}>
          <button
            type="button"
            onClick={() => { setAuthMode('login'); setError(null); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all font-rajdhani uppercase cursor-pointer ${
              authMode === 'login'
                ? 'bg-slate-900 text-white shadow-sm ring-1 ring-[#05DF72]/40'
                : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode('register'); setError(null); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all font-rajdhani uppercase cursor-pointer ${
              authMode === 'register'
                ? 'bg-[#05DF72] text-slate-950 font-bold shadow-sm'
                : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Crear Cuenta
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {authMode === 'register' && (
            <div>
              <label className={`text-[11px] font-bold uppercase tracking-wider block mb-1 font-rajdhani ${
                isDarkTheme ? 'text-slate-300' : 'text-slate-600'
              }`}>
                Nombre Completo
              </label>
              <div className="relative">
                <User className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej. Roman Miner"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#05DF72]/40 transition-all ${
                    isDarkTheme 
                      ? 'bg-white/[0.05] border border-white/10 text-white placeholder-slate-500 focus:bg-white/[0.08]' 
                      : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white'
                  }`}
                />
              </div>
            </div>
          )}

          <div>
            <label className={`text-[11px] font-bold uppercase tracking-wider block mb-1 font-rajdhani ${
              isDarkTheme ? 'text-slate-300' : 'text-slate-600'
            }`}>
              Usuario o Correo
            </label>
            <div className="relative">
              <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={authMode === 'register' ? 'usuario o email' : 'admin o tu correo'}
                className={`w-full pl-10 pr-4 py-2.5 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#05DF72]/40 transition-all ${
                  isDarkTheme 
                    ? 'bg-white/[0.05] border border-white/10 text-white placeholder-slate-500 focus:bg-white/[0.08]' 
                    : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white'
                }`}
              />
            </div>
          </div>

          {authMode === 'register' && (
            <div>
              <label className={`text-[11px] font-bold uppercase tracking-wider block mb-1 font-rajdhani ${
                isDarkTheme ? 'text-slate-300' : 'text-slate-600'
              }`}>
                Correo Electrónico (Opcional)
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#05DF72]/40 transition-all ${
                    isDarkTheme 
                      ? 'bg-white/[0.05] border border-white/10 text-white placeholder-slate-500 focus:bg-white/[0.08]' 
                      : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white'
                  }`}
                />
              </div>
            </div>
          )}

          <div>
            <label className={`text-[11px] font-bold uppercase tracking-wider block mb-1 font-rajdhani ${
              isDarkTheme ? 'text-slate-300' : 'text-slate-600'
            }`}>
              Contraseña
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full pl-10 pr-10 py-2.5 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#05DF72]/40 transition-all ${
                  isDarkTheme 
                    ? 'bg-white/[0.05] border border-white/10 text-white placeholder-slate-500 focus:bg-white/[0.08]' 
                    : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-2xl bg-[#05DF72] hover:bg-[#00E599] text-slate-950 font-bold text-xs uppercase tracking-wider font-rajdhani flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer mt-2"
          >
            {loading ? (
              <span className="animate-spin h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full" />
            ) : (
              <>
                <span>{authMode === 'login' ? 'Entrar al Dashboard' : 'Crear Cuenta y Entrar'}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Access Button */}
        <div className={`pt-2 border-t flex flex-col items-center gap-2 ${
          isDarkTheme ? 'border-white/10' : 'border-slate-100'
        }`}>
          <button
            type="button"
            onClick={handleQuickDemoLogin}
            className={`w-full py-2.5 px-3 rounded-2xl font-bold text-xs font-rajdhani uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              isDarkTheme 
                ? 'bg-white/[0.06] hover:bg-white/[0.1] text-slate-200' 
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-[#05DF72]" />
            <span>Acceso Rápido Administrador (1-Click)</span>
          </button>

          {onOpenLanding && (
            <button
              type="button"
              onClick={onOpenLanding}
              className="text-[11px] text-slate-400 hover:text-emerald-500 font-medium transition-colors mt-1 cursor-pointer"
            >
              Ver página de inicio y descargas web
            </button>
          )}
        </div>

        {/* Security & Cloud Badge */}
        <div className="flex items-center justify-center gap-2 pt-1 text-[10px] text-slate-400 font-mono">
          <ShieldCheck className="h-3.5 w-3.5 text-[#05DF72]" />
          <span>Protegido con Firebase Auth & Bóveda Local</span>
        </div>

      </div>
    </div>
  );
};
