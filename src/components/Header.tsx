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
  Radio,
  Wallet,
  Check,
  Send,
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
  settings,
  activeTab,
  setActiveTab,
  onRefresh,
  isRefreshing,
  unresolvedAlertsCount,
  walletAddress,
  onUpdateWallet,
  poolInfo,
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
      {/* 1. TOP LIVE INSTITUTIONAL TELEMETRY STRIP */}
      <div className={`px-4 py-1.5 text-[11px] transition-colors ${
        isDarkTheme 
          ? 'border-b border-white/[0.04] bg-white/[0.015] text-slate-400' 
          : 'border-b border-slate-100 bg-slate-50/90 text-slate-600'
      }`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2.5 font-mono-num">
          
          {/* Stratum & Network status */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400"></span>
              </span>
              <span className="font-semibold text-slate-200">Kryptex Pool PRL</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-300 font-medium">PearlHash PoUW</span>
            </div>
            
            <div className="hidden md:flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-500">Hashrate Global:</span>
              <span className="text-cyan-400 font-semibold">
                {poolInfo.net_hashrate ? `${(poolInfo.net_hashrate / 1e18).toFixed(2)} EH/s` : '-- EH/s'}
              </span>
            </div>

            <div className="hidden lg:flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-500">Pool Kryptex:</span>
              <span className="text-slate-200">
                {poolInfo.hashrate ? `${(poolInfo.hashrate / 1e18).toFixed(2)} EH/s` : '-- EH/s'}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-500">Bloque:</span>
              <span className="text-emerald-400 font-semibold">
                {poolInfo.block_reward ? `${poolInfo.block_reward.toFixed(1)} PRL` : '-- PRL'}
              </span>
            </div>

            <div className="hidden xl:flex items-center gap-1.5 text-slate-400">
              <span className="text-slate-500">PPS+ Fee:</span>
              <span className="text-slate-300">{poolInfo.fee !== undefined ? `${poolInfo.fee}%` : '3%'}</span>
            </div>
          </div>

          {/* Quick Actions & Status Tools */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Telegram Bot status indicator */}
            {settings.telegramBotToken && settings.telegramChatId ? (
              <div className="flex items-center gap-1 text-[11px] text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                <Send className="h-3 w-3 text-cyan-400" />
                <span>Telegram Bot Online</span>
              </div>
            ) : (
              <button
                onClick={() => setActiveTab('apis')}
                className="hidden sm:flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/30 transition-all hover:bg-amber-500/20"
                title="Configurar bot de Telegram para recibir alertas en el móvil"
              >
                <Send className="h-2.5 w-2.5 text-amber-400" />
                <span>+ Vincular Bot Telegram</span>
              </button>
            )}

            {/* SaladCloud Real Balance & Runway Pill (Editable) */}
            {isEditingSalad ? (
              <form onSubmit={handleSaveSalad} className="flex items-center gap-1 bg-[#06070A] border border-cyan-400 rounded-full px-2.5 py-0.5 text-xs shadow-lg animate-in fade-in duration-200">
                <span className="text-cyan-400 font-bold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={saladInput}
                  onChange={(e) => setSaladInput(e.target.value)}
                  placeholder="0.00"
                  className="w-16 bg-transparent text-xs text-white font-jetbrains focus:outline-none"
                  autoFocus
                />
                <button type="submit" className="p-0.5 rounded text-emerald-400 hover:text-emerald-300 cursor-pointer" title="Guardar Saldo">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setIsEditingSalad(false)} className="p-0.5 rounded text-slate-400 hover:text-white cursor-pointer" title="Cancelar">
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <div 
                onClick={() => {
                  setSaladInput(saladBalance.totalBalanceUSD > 0 ? saladBalance.totalBalanceUSD.toString() : '');
                  setIsEditingSalad(true);
                }}
                className={`flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-all cursor-pointer hover:border-cyan-400 group ${
                  saladBalance.isRunwayCritical
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/40 animate-pulse shadow-[0_0_12px_rgba(255,42,85,0.3)]'
                    : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                }`}
                title="Haz clic para actualizar tu saldo real de SaladCloud"
              >
                <DollarSign className="h-3 w-3 text-cyan-400" />
                <span>Salad: <strong className="font-jetbrains text-white tabular-nums">${saladBalance.totalBalanceUSD.toFixed(2)}</strong></span>
                <span className="text-slate-600">•</span>
                <span className={saladBalance.isRunwayCritical ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                  Runway: <strong className="font-jetbrains tabular-nums">{saladBalance.hourlySpendingUSD > 0 ? `${saladBalance.runwayHours.toFixed(1)}h` : '0h (Inactivo)'}</strong>
                </span>
                <span className="text-[10px] text-slate-400 group-hover:text-cyan-300 hidden sm:inline ml-0.5">✏️</span>
              </div>
            )}

            {/* Live Mode FinTech Indicator */}
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-[0_0_12px_rgba(5,242,146,0.2)]"
              title="MinerX está operando en vivo con datos reales de Kryptex y SaladCloud"
            >
              <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
              <span>100% Datos en Vivo</span>
            </div>

            {/* Manual Sync Button */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1 rounded-lg bg-white/[0.05] border border-white/[0.08] px-2.5 py-1 text-slate-300 hover:bg-white/[0.1] hover:text-white transition-all active:scale-95"
              title="Sincronizar telemetría de red"
            >
              <RefreshCw className={`h-3 w-3 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN HEADER & FINTECH NAVIGATION BAR (Ref: Video Clean Header) */}
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

        {/* Center: Video-Cloned Pill Capsule Navigation */}
        <nav className={`hidden md:flex items-center p-1 rounded-full border shadow-inner transition-colors ${
          isDarkTheme ? 'bg-[#0A0D16] border-white/10' : 'bg-slate-100/90 border-slate-200/90'
        }`}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : isDarkTheme
                    ? 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[9px] font-mono font-bold ${
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
          {isEditingWallet ? (
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
