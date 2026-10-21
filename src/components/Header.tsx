import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Cpu, 
  DollarSign, 
  TrendingUp, 
  Bell, 
  Layers, 
  RefreshCw, 
  Flame, 
  Radio,
  Wallet,
  Check,
  Send,
  Copy,
  X
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
  onLogout
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
        const res = await fetch('/api/salad/balance');
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
          await fetch('/api/salad/account-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ balanceUSD: num })
          });
          const res = await fetch('/api/salad/balance');
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
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#06070A]/90 backdrop-blur-xl transition-all">
      {/* 1. TOP LIVE INSTITUTIONAL TELEMETRY STRIP */}
      <div className="border-b border-white/[0.04] bg-white/[0.015] px-4 py-1.5 text-[11px]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2.5 font-mono-num text-slate-400">
          
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

      {/* 2. MAIN HEADER & FINTECH NAVIGATION BAR */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:py-3.5">
        
        {/* Brand Identity & Version */}
        <div 
          onClick={onOpenLanding}
          className={`flex items-center gap-3 ${onOpenLanding ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
          title={onOpenLanding ? "Ver Landing Page & Descargas (.EXE / .APK)" : undefined}
        >
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 via-cyan-500/20 to-slate-900 border border-emerald-500/30 shadow-[0_0_20px_rgba(5,242,146,0.2)]">
            <Flame className="h-5 w-5 text-[#05F292]" />
            <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#06070A]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-display-title text-xl font-extrabold tracking-tight text-white">
                Miner<span className="text-[#05F292]">X</span>
              </span>
              <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono-num font-semibold text-emerald-400 border border-emerald-500/20">
                PRO FINTECH
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              SaladCloud GPU Farm & Kryptex Pool Intelligence
            </p>
          </div>
        </div>

        {/* Quick Wallet Address Bar with 1-Click Copy */}
        <div className="flex items-center gap-2 bg-[#0C0F17] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs font-mono-num shadow-inner">
          <Wallet className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          {isEditingWallet ? (
            <form onSubmit={handleSaveWallet} className="flex items-center gap-1.5">
              <input
                type="text"
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                placeholder="prl1q..."
                className="w-48 sm:w-64 bg-[#06070A] border border-cyan-500/50 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
                autoFocus
              />
              <button
                type="submit"
                className="bg-emerald-500 text-slate-950 font-bold p-1 rounded-lg hover:bg-emerald-400 transition-colors"
                title="Guardar Wallet"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-slate-500 hidden sm:inline">Wallet:</span>
              <span 
                onClick={() => setIsEditingWallet(true)} 
                className="text-slate-200 hover:text-cyan-300 cursor-pointer font-bold truncate max-w-[140px] sm:max-w-[190px]"
                title="Haz clic para cambiar dirección"
              >
                {walletAddress ? `${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 6)}` : 'Sin Wallet (Asignar)'}
              </span>
              
              {walletAddress && (
                <button
                  onClick={handleCopyWallet}
                  className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                  title="Copiar billetera completa"
                >
                  {copiedWallet ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              )}

              <button
                onClick={() => setIsEditingWallet(true)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                Editar
              </button>
            </div>
          )}
        </div>

        {/* Quick KPI Ribbon (Desktop) */}
        <div className="hidden xl:flex items-center gap-5 rounded-xl border border-white/[0.08] bg-[#0E121C]/80 px-4 py-1.5 font-mono-num shadow-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Hashrate Flota</div>
            <div className="text-sm font-bold text-cyan-400 flex items-center gap-1">
              {summary.totalHashrateTHs.toLocaleString()} <span className="text-xs text-slate-400 font-normal">TH/s</span>
            </div>
          </div>
          
          <div className="h-6 w-[1px] bg-white/[0.08]" />
          
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">GPUs Minando</div>
            <div className="text-sm font-bold text-slate-200 flex items-center gap-1">
              <span className="text-emerald-400">{summary.activeMiningGPUs}</span>
              <span className="text-slate-500">/</span>
              <span>{summary.totalAllocatedGPUs}</span>
            </div>
          </div>

          <div className="h-6 w-[1px] bg-white/[0.08]" />

          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Yield Neto / hr</div>
            <div className={`text-sm font-bold flex items-center gap-1 ${summary.hourlyNetProfitUSD >= 0 ? 'text-[#05F292]' : 'text-rose-400'}`}>
              <TrendingUp className="h-3.5 w-3.5" />
              <span>${summary.hourlyNetProfitUSD > 0 ? '+' : ''}{summary.hourlyNetProfitUSD.toFixed(3)}</span>
            </div>
          </div>
        </div>

        {/* FinTech Pill Navigation (Desktop) */}
        <nav className="hidden md:flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-white border border-emerald-500/40 shadow-[0_0_12px_rgba(5,242,146,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-[#05F292]' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-mono-num font-bold ${
                      tab.id === 'alerts' && unresolvedAlertsCount > 0
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                        : isActive
                        ? 'bg-emerald-500/30 text-emerald-200'
                        : 'bg-white/[0.08] text-slate-300'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Session & Landing Page Link */}
        <div className="flex items-center gap-2">
          {onOpenLanding && (
            <button
              onClick={onOpenLanding}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08] transition-all cursor-pointer"
              title="Descargas .EXE/.APK y Presentación"
            >
              <span>Landing & Apps</span>
            </button>
          )}

          {currentUser && (
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs">
              <span className="w-2 h-2 rounded-full bg-[#05F292]" />
              <span className="text-slate-200 font-mono text-[11px] font-medium">{currentUser.username}</span>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="text-slate-400 hover:text-rose-400 p-0.5 cursor-pointer"
                  title="Cerrar sesión"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
