import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
  Moon 
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
  onToggleTheme
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

  const tabs = [
    { id: 'overview', label: 'Resumen', icon: Activity },
    { id: 'fleet', label: 'Flota GPUs', icon: Cpu, badge: summary.totalAllocatedGPUs },
    { id: 'economics', label: 'Economía & ROI', icon: DollarSign },
    { id: 'apis', label: 'APIs & Bot', icon: Layers },
    { id: 'alerts', label: 'Alertas', icon: Bell, badge: unresolvedAlertsCount > 0 ? unresolvedAlertsCount : undefined },
  ];

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
    <header className={`sticky top-0 z-40 w-full transition-all backdrop-blur-xl ${
      isDarkTheme 
        ? 'border-b border-white/[0.08] bg-[#06070A]/90 text-white' 
        : 'border-b border-slate-200/80 bg-white/95 text-slate-900 shadow-xs'
    }`}>
      {/* MAIN LUXURY HEADER & FINTECH NAVIGATION BAR (Ref: Video Clean Single-Tier Header) */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 py-3.5">
        
        {/* Left: Video-Cloned Squircle Logo Tile + "Dashboard" Title */}
        <div className="flex items-center gap-3">
          <div 
            onClick={onOpenLanding}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-[#05DF72] shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
            title={onOpenLanding ? "Ver Landing Page & Descargas (.EXE / .APK)" : "MinerX Telemetry Hub"}
          >
            <Flame className="h-5 w-5 fill-[#05DF72]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-xl sm:text-2xl font-bold tracking-tight font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                {activeTab === 'overview' ? 'Dashboard' : activeTab === 'fleet' ? 'Flota GPUs' : activeTab === 'economics' ? 'Calculadora' : activeTab === 'apis' ? 'APIs & Bot' : 'Alertas'}
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-[#05DF72] border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-[#05DF72] animate-pulse"></span>
                <span>PoUW</span>
              </span>
            </div>
          </div>
        </div>

        {/* Center: Video-Cloned Pill Capsule Navigation with Framer Motion sliding pill */}
        <nav className={`hidden md:flex items-center p-1 rounded-full border shadow-inner transition-colors ${
          isDarkTheme ? 'bg-[#0A0D16] border-white/10' : 'bg-slate-100/90 border-slate-200/90'
        }`}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? 'text-white'
                    : isDarkTheme
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="header-active-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="absolute inset-0 rounded-full bg-slate-900 shadow-xs"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`relative z-10 ml-0.5 rounded-full px-1.5 py-0.2 text-[9px] font-mono font-bold ${
                      tab.id === 'alerts' && unresolvedAlertsCount > 0
                        ? 'bg-rose-500 text-white animate-pulse'
                        : isActive
                        ? 'bg-[#05DF72] text-slate-950'
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

        {/* Right: Video-Cloned Action Circles (Search, Notification Bell, User Avatar) */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Quick Wallet & Salad status pill / Edit form */}
          {isEditingSalad ? (
            <form onSubmit={handleSaveSalad} className="flex items-center gap-1 bg-[#06070A] border border-[#05DF72] rounded-full px-2.5 py-1 text-xs shadow-lg animate-in fade-in duration-200">
              <span className="text-[#05DF72] font-bold">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={saladInput}
                onChange={(e) => setSaladInput(e.target.value)}
                placeholder="0.00"
                className="w-16 bg-transparent text-xs text-white font-mono focus:outline-none"
                autoFocus
              />
              <button type="submit" className="p-0.5 rounded text-emerald-400 hover:text-emerald-300 cursor-pointer" title="Guardar Saldo">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setIsEditingSalad(false)} className="p-0.5 rounded text-slate-400 hover:text-white cursor-pointer" title="Cancelar">
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : isEditingWallet ? (
            <form onSubmit={handleSaveWallet} className="flex items-center gap-1.5 bg-[#06070A] border border-[#05DF72] rounded-full px-2.5 py-1 text-xs shadow-lg animate-in fade-in duration-200">
              <Wallet className="h-3 w-3 text-[#05DF72]" />
              <input
                type="text"
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                placeholder="prl1q..."
                className="w-32 bg-transparent text-xs text-white font-mono focus:outline-none"
                autoFocus
              />
              <button type="submit" className="p-0.5 rounded text-emerald-400 hover:text-emerald-300 cursor-pointer" title="Guardar Wallet">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setIsEditingWallet(false)} className="p-0.5 rounded text-slate-400 hover:text-white cursor-pointer" title="Cancelar">
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
                isDarkTheme ? 'bg-white/[0.04] border-white/10 text-amber-400 hover:bg-white/[0.08]' : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
              title={isDarkTheme ? "Cambiar a modo Claro" : "Cambiar a modo Oscuro"}
            >
              {isDarkTheme ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            </button>
          )}

          {/* Search Button Circle */}
          <button
            onClick={() => setActiveTab('fleet')}
            className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all cursor-pointer ${
              isDarkTheme ? 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
            title="Buscar en Flota"
          >
            <Sparkles className="h-4 w-4 text-[#05DF72]" />
          </button>

          {/* Notification Bell Circle */}
          <button
            onClick={() => setActiveTab('alerts')}
            className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-all cursor-pointer ${
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
    </header>
  );
};
