import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiConfig';
import { 
  Activity, 
  Cpu, 
  DollarSign, 
  Bell, 
  Layers, 
  RefreshCw, 
  Flame, 
  Wallet, 
  Check, 
  Copy, 
  X, 
  Sparkles, 
  Sun, 
  Moon,
  AppWindow,
  Sliders,
  Package,
  Users,
  ShieldCheck,
  Server,
  Share2,
  ShoppingCart,
  ArrowDownRight
} from 'lucide-react';
import type { FleetSummary, AppSettings, KryptexPoolInfo, SaladBalanceInfo } from '../types/minerx';

interface HeaderProps {
  summary: FleetSummary;
  settings: AppSettings;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  unresolvedAlertsCount: number;
  walletAddress: string;
  onUpdateWallet: (address: string) => void;
  poolInfo: KryptexPoolInfo;
  saladBalance?: SaladBalanceInfo | null;
  onUpdateSaladBalance?: (newBalance: number) => void;
  onOpenLanding?: () => void;
  currentUser?: { id: string; username: string; email: string; fullName: string } | null;
  onLogout?: () => void;
  isDarkTheme?: boolean;
  onToggleTheme?: () => void;
  onOpenHub?: () => void;
  suiteMode?: 'fleet' | 'admin';
  onToggleSuiteMode?: (mode: 'fleet' | 'admin') => void;
}

export const Header: React.FC<HeaderProps> = ({
  summary,
  settings: _settings,
  activeTab,
  setActiveTab,
  onRefresh,
  isRefreshing,
  unresolvedAlertsCount,
  walletAddress,
  onUpdateWallet,
  poolInfo: _poolInfo,
  saladBalance: propSaladBalance,
  onUpdateSaladBalance,
  onOpenLanding,
  currentUser,
  onLogout,
  isDarkTheme = false,
  onToggleTheme,
  onOpenHub,
  suiteMode = 'fleet',
  onToggleSuiteMode
}) => {
  const [isEditingWallet, setIsEditingWallet] = useState(false);
  const [walletInput, setWalletInput] = useState(walletAddress);
  const [copiedWallet, setCopiedWallet] = useState(false);

  // SaladCloud Real Balance & Runway State
  const [isEditingSalad, setIsEditingSalad] = useState(false);
  const [saladInput, setSaladInput] = useState('');
  const [saladBalance, setSaladBalance] = useState<SaladBalanceInfo>(() => {
    if (propSaladBalance) return propSaladBalance;
    return {
      totalBalanceUSD: 0,
      hourlySpendingUSD: summary.hourlySaladCostUSD || 0,
      runwayHours: 0,
      isRunwayCritical: false,
      accounts: []
    };
  });

  useEffect(() => {
    if (propSaladBalance) {
      setSaladBalance(propSaladBalance);
    }
  }, [propSaladBalance]);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await apiFetch('/api/salad/balance');
        if (res.ok) {
          const data = await res.json();
          setSaladBalance(data);
        }
      } catch {}
    };
    fetchBalance();
    const timer = setInterval(fetchBalance, 45000);
    return () => clearInterval(timer);
  }, []);

  const currentSuite = suiteMode || (activeTab.startsWith('admin_') ? 'admin' : 'fleet');

  interface NavTabItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }

  const fleetTabs: NavTabItem[] = [
    { id: 'overview', label: 'Resumen', icon: Activity },
    { id: 'fleet', label: 'Flota', icon: Cpu, badge: summary.totalAllocatedGPUs },
    { id: 'economics', label: 'Economía', icon: DollarSign },
    { id: 'apis', label: 'APIs', icon: Layers },
    { id: 'alerts', label: 'Alertas', icon: Bell, badge: unresolvedAlertsCount > 0 ? unresolvedAlertsCount : undefined },
  ];

  const adminTabs: NavTabItem[] = [
    { id: 'admin_overview', label: 'Dashboard', icon: Activity },
    { id: 'admin_engine', label: 'Motor Híbrido', icon: Sliders },
    { id: 'admin_packages', label: 'Paquetes', icon: Package },
    { id: 'admin_orders', label: 'Pagos Paquetes', icon: ShoppingCart },
    { id: 'admin_withdrawals', label: 'Retiros', icon: ArrowDownRight },
    { id: 'admin_allocations', label: 'Potencia', icon: Cpu },
    { id: 'admin_workers', label: 'Workers', icon: Server },
    { id: 'admin_referrals', label: 'Referidos', icon: Share2 },
    { id: 'admin_ledger', label: 'Ledger', icon: DollarSign },
    { id: 'admin_users', label: 'Usuarios', icon: Users },
    { id: 'admin_promos', label: 'Promos', icon: Sparkles },
    { id: 'admin_audit', label: 'Auditoría', icon: ShieldCheck },
  ];

  const tabs = currentSuite === 'admin' ? adminTabs : fleetTabs;

  const handleSaveSalad = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const num = parseFloat(saladInput);
    if (!isNaN(num) && num >= 0) {
      if (onUpdateSaladBalance) {
        onUpdateSaladBalance(num);
      } else {
        try {
          await apiFetch('/api/salad/account-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ balanceUSD: num })
          });
          const res = await apiFetch('/api/salad/balance');
          if (res.ok) {
            const d = await res.json();
            setSaladBalance(d);
          }
        } catch (err) {
          console.error(err);
        }
      }
      setIsEditingSalad(false);
    }
  };

  const handleSaveWallet = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateWallet(walletInput.trim());
    setIsEditingWallet(false);
    onRefresh();
  };

  const handleCopyWallet = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 2000);
  };

  return (
    <header className={`minerx-admin-header sticky top-0 z-40 w-full transition-all backdrop-blur-xl ${
      isDarkTheme 
        ? 'border-b border-white/[0.08] bg-[#06070A]/90 text-white' 
        : 'border-b border-slate-200/80 bg-white/95 text-slate-900 shadow-xs'
    }`}>
      {/* MAIN LUXURY HEADER & FINTECH NAVIGATION BAR (Ref: Video Clean Single-Tier Header) */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 py-3.5">
        
        {/* Left: Video-Cloned Squircle Logo Tile + Brand + Suite Switcher */}
        <div className="flex items-center gap-3">
          <div 
            onClick={onOpenLanding}
            className="minerx-admin-brandmark flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-[#05DF72] shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
            title={onOpenLanding ? "Ver Landing Page & Descargas (.EXE / .APK)" : "MinerX Telemetry Hub"}
          >
            <Flame className="h-5 w-5 fill-[#05DF72]" />
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xl font-bold tracking-tight font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              MinerX
            </span>
            <span className="minerx-admin-badge hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-[#05DF72] border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-[#05DF72] animate-pulse"></span>
              <span>{currentSuite === 'admin' ? 'ADMIN' : 'PoUW'}</span>
            </span>

            {/* Luxury Suite Switcher (Flota Kryptex vs Admin Center) */}
            <div className={`minerx-admin-suite-switcher flex items-center gap-1 p-0.5 rounded-2xl border ml-2 ${
              isDarkTheme ? 'bg-[#0B0F19] border-white/10' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => {
                  onToggleSuiteMode?.('fleet');
                  setActiveTab('overview');
                }}
                className={`minerx-admin-suite-option ${currentSuite === 'fleet' ? 'is-active' : ''} px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer active:scale-[0.97] ${
                  currentSuite === 'fleet'
                    ? (isDarkTheme ? 'bg-[#05DF72] text-slate-950 shadow-sm' : 'bg-slate-900 text-[#05DF72]')
                    : (isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <Cpu className="h-3.5 w-3.5" />
                Flota
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleSuiteMode?.('admin');
                  setActiveTab('admin_overview');
                }}
                className={`minerx-admin-suite-option ${currentSuite === 'admin' ? 'is-active' : ''} px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer active:scale-[0.97] ${
                  currentSuite === 'admin'
                    ? (isDarkTheme ? 'bg-[#05DF72] text-slate-950 shadow-sm' : 'bg-slate-900 text-[#05DF72]')
                    : (isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin
              </button>
            </div>
          </div>
        </div>

        {/* Right: Video-Cloned Action Circles (Search, Notification Bell, User Avatar) */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Quick Wallet & Salad status pill / Edit form */}
          {isEditingSalad ? (
            <form onSubmit={handleSaveSalad} className={`flex items-center gap-1 border border-[#05DF72] rounded-full px-2.5 py-1 text-xs shadow-lg animate-in fade-in duration-200 ${
              isDarkTheme ? 'bg-[#06070A] text-white' : 'bg-white text-slate-900 shadow-slate-200'
            }`}>
              <span className="text-[#05DF72] font-bold">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={saladInput}
                onChange={(e) => setSaladInput(e.target.value)}
                placeholder="0.00"
                className={`w-16 bg-transparent text-xs font-mono focus:outline-none ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}
                autoFocus
              />
              <button type="submit" className="p-0.5 rounded text-emerald-500 hover:text-emerald-400 cursor-pointer" title="Guardar Saldo">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setIsEditingSalad(false)} className={`p-0.5 rounded cursor-pointer ${isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`} title="Cancelar">
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : isEditingWallet ? (
            <form onSubmit={handleSaveWallet} className={`flex items-center gap-1.5 border border-[#05DF72] rounded-full px-2.5 py-1 text-xs shadow-lg animate-in fade-in duration-200 ${
              isDarkTheme ? 'bg-[#06070A] text-white' : 'bg-white text-slate-900 shadow-slate-200'
            }`}>
              <Wallet className="h-3 w-3 text-[#05DF72]" />
              <input
                type="text"
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                placeholder="prl1q..."
                className={`w-32 bg-transparent text-xs font-mono focus:outline-none ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}
                autoFocus
              />
              <button type="submit" className="p-0.5 rounded text-emerald-500 hover:text-emerald-400 cursor-pointer" title="Guardar Wallet">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setIsEditingWallet(false)} className={`p-0.5 rounded cursor-pointer ${isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`} title="Cancelar">
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : (
            <div className={`hidden lg:flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono border transition-colors ${
              isDarkTheme ? 'bg-white/[0.03] border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}>
              <Wallet className="h-3.5 w-3.5 text-[#05DF72]" />
              <span 
                onClick={() => {
                  setWalletInput(walletAddress || '');
                  setIsEditingWallet(true);
                }} 
                className="cursor-pointer truncate max-w-[120px] font-semibold hover:text-[#05DF72]"
                title="Click para editar wallet"
              >
                {walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}` : 'Asignar Wallet'}
              </span>
              {walletAddress && (
                <button 
                  type="button" 
                  onClick={handleCopyWallet} 
                  className="text-slate-400 hover:text-emerald-400 cursor-pointer" 
                  title={copiedWallet ? "Copiado!" : "Copiar wallet"}
                >
                  {copiedWallet ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              )}
              <span className="text-slate-400">•</span>
              <span 
                onClick={() => {
                  setSaladInput(saladBalance.totalBalanceUSD > 0 ? saladBalance.totalBalanceUSD.toString() : '');
                  setIsEditingSalad(true);
                }}
                className="cursor-pointer font-bold text-[#05DF72] hover:underline"
                title="Click para actualizar saldo Salad"
              >
                ${saladBalance.totalBalanceUSD.toFixed(2)}
              </span>
            </div>
          )}

          {/* Sync Telemetry Circle Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all cursor-pointer ${
              isDarkTheme ? 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
            title="Sincronizar telemetría"
          >
            <RefreshCw className={`h-4 w-4 text-[#05DF72] ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Theme Toggle Button */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all cursor-pointer ${
                isDarkTheme ? 'bg-white/[0.04] border-white/10 text-amber-400 hover:bg-white/[0.08]' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
              title={isDarkTheme ? "Cambiar a modo Claro" : "Cambiar a modo Oscuro"}
            >
              {isDarkTheme ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
            </button>
          )}

          {/* Desktop Floating Hub Window Button */}
          {onOpenHub && (
            <button
              onClick={onOpenHub}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all cursor-pointer ${
                isDarkTheme ? 'bg-emerald-500/10 border-emerald-500/25 text-[#05DF72] hover:bg-emerald-500/20' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              }`}
              title="Abrir Hub Flotante / Widget"
            >
              <AppWindow className="h-4 w-4" />
            </button>
          )}

          {/* Search Button Circle (Desktop/Tablet) */}
          <button
            onClick={() => setActiveTab('fleet')}
            className={`hidden sm:flex h-9 w-9 items-center justify-center rounded-full border transition-all cursor-pointer ${
              isDarkTheme ? 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
            title="Buscar en Flota"
          >
            <Sparkles className="h-4 w-4 text-[#05DF72]" />
          </button>

          {/* Notification Bell Circle (Desktop/Tablet, on mobile handled by MobileNav) */}
          <button
            onClick={() => setActiveTab('alerts')}
            className={`hidden md:flex relative h-9 w-9 items-center justify-center rounded-full border transition-all cursor-pointer ${
              isDarkTheme ? 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
            title="Ver Alertas"
          >
            <Bell className="h-4 w-4" />
            {unresolvedAlertsCount > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 animate-ping"></span>
            )}
            {unresolvedAlertsCount > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900"></span>
            )}
          </button>

          {/* User Profile Avatar Circle with Status */}
          <div 
            onClick={onLogout}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold ring-2 ring-[#05DF72]/40 cursor-pointer shadow-xs hover:ring-[#05DF72] transition-all"
            title={currentUser ? `Conectado como ${currentUser.username} (Click para salir)` : 'Sesión Activa'}
          >
            <span>{currentUser?.username ? currentUser.username.substring(0, 2).toUpperCase() : 'MX'}</span>
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#05DF72] ring-2 ring-white dark:ring-slate-900"></span>
          </div>
        </div>
      </div>

      {/* TIER 2: EXPANSIVE FULL-WIDTH HORIZONTAL FINTECH NAVIGATION BAR */}
      <div className={`minerx-admin-header-secondary w-full border-t transition-colors ${
        isDarkTheme 
          ? 'border-white/[0.06] bg-[#0A0D16]/95' 
          : 'border-slate-200/80 bg-slate-50/90'
      }`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2">
          <nav className="minerx-admin-nav flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`minerx-admin-nav-item ${isActive ? 'is-active' : ''} relative flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer select-none shrink-0 active:scale-[0.97] ${
                    isActive
                      ? isDarkTheme 
                        ? 'bg-white text-slate-950 font-bold shadow-sm' 
                        : 'bg-slate-900 text-white font-bold shadow-sm'
                      : isDarkTheme
                        ? 'text-slate-400 hover:text-white hover:bg-white/5'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? (isDarkTheme ? 'text-slate-950' : 'text-[#05DF72]') : 'opacity-70'}`} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={`ml-1 rounded-full px-1.5 py-0.2 text-[9px] font-mono font-bold ${
                        tab.id === 'alerts' && unresolvedAlertsCount > 0
                          ? 'bg-rose-500 text-white animate-pulse'
                          : isActive
                          ? (isDarkTheme ? 'bg-slate-900 text-[#05DF72]' : 'bg-[#05DF72] text-slate-950')
                          : 'bg-emerald-500/20 text-[#05DF72]'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};
