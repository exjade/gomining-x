import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  TrendingUp,
  Layers,
  Sparkles,
  Cpu,
  ExternalLink,
  Activity,
  X
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis
} from 'recharts';
import type { FleetSummary, MergedGPUWorker, SaladBalanceInfo } from '../types/minerx';
import { sendNativeNotification } from '../utils/notifications';

interface FloatingHubWidgetProps {
  summary: FleetSummary;
  workers: MergedGPUWorker[];
  saladBalance?: SaladBalanceInfo | null;
  kryptexBalance?: { total: number; confirmed: number; unconfirmed: number; threshold: number } | null;
  poolTicker?: string;
  history?: Array<{ time: string; hashrateTHs: number; netYieldUSD: number }>;
  onNavigateToTab: (tab: string) => void;
  onToggleTheme: () => void;
  isDarkTheme: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  initiallyExpanded?: boolean;
  isStandalone?: boolean;
}

export const FloatingHubWidget: React.FC<FloatingHubWidgetProps> = ({
  summary,
  workers,
  saladBalance,
  kryptexBalance,
  poolTicker = 'PRL',
  history = [],
  onNavigateToTab,
  onToggleTheme,
  isDarkTheme,
  onRefresh,
  isRefreshing,
  initiallyExpanded = false,
  isStandalone = false
}) => {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

  // 100% REAL DATA EXTRACTION (NO HARDCODED NUMBERS)
  const totalTHs = typeof summary?.totalHashrateTHs === 'number' ? summary.totalHashrateTHs : 0;
  const benchmarkTHs = typeof summary?.benchmarkHashrateTHs === 'number' ? summary.benchmarkHashrateTHs : 0;
  const efficiencyPct = typeof summary?.fleetEfficiencyPct === 'number' ? summary.fleetEfficiencyPct : 0;
  const netProfitUSD = typeof summary?.hourlyNetProfitUSD === 'number' ? summary.hourlyNetProfitUSD : 0;
  const grossRevenueUSD = typeof summary?.hourlyGrossRevenueUSD === 'number' ? summary.hourlyGrossRevenueUSD : 0;
  const saladCostUSD = typeof summary?.hourlySaladCostUSD === 'number' ? summary.hourlySaladCostUSD : 0;
  const dailyProfitUSD = typeof summary?.dailyNetProfitUSD === 'number' ? summary.dailyNetProfitUSD : (netProfitUSD * 24);

  const runningCount = workers.filter((w) => w.isMining || w.saladStatus === 'running').length;
  const totalCount = workers.length;

  const validShares = summary?.totalValidShares ?? 0;
  const staleShares = summary?.totalStaleShares ?? 0;
  const saladTotalUSD = saladBalance?.totalBalanceUSD ?? 0;
  const prlTotal = kryptexBalance?.total ?? 0;

  // Real history points for sparkline chart
  const chartData = (history && history.length > 0)
    ? history.slice(-12).map((h) => ({ val: h.hashrateTHs, net: h.netYieldUSD }))
    : [
        { val: Math.max(0, totalTHs * 0.94), net: netProfitUSD },
        { val: Math.max(0, totalTHs * 0.98), net: netProfitUSD },
        { val: totalTHs, net: netProfitUSD }
      ];

  // Handler for Desktop Floating Window
  const handleLaunchDesktopWidget = () => {
    const win = window as any;
    if (win.electronAPI?.toggleDesktopWidget) {
      win.electronAPI.toggleDesktopWidget();
      return;
    }

    try {
      window.open(
        '#widget',
        'MinerX_Desktop_HUD',
        'width=360,height=340,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
      );
    } catch {}

    sendNativeNotification('MinerX ⚡ Telemetría en Vivo', {
      body: `Potencia: ${totalTHs.toFixed(1)} TH/s | Utilidad: +$${netProfitUSD.toFixed(3)}/h | ${runningCount}/${totalCount} GPUs`,
      silent: true
    });
  };

  return (
    <div
      style={isStandalone ? { position: 'relative', width: '340px' } : { position: 'fixed', right: '20px', bottom: '20px', zIndex: 9999 }}
      className="select-none font-sans"
    >
      <AnimatePresence>
        {!isExpanded && !isStandalone ? (
          /* COLLAPSED FLOATING CAPSULE (Dynamic Floating Pill in Emerald Green) */
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0 }}
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-3 px-3.5 py-2 rounded-full bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-2xl border border-slate-200/90 dark:border-white/[0.12] shadow-[0_12px_35px_rgba(5,223,114,0.15)] cursor-pointer group transition-all"
          >
            {/* Glowing Tech Green Pulse Badge */}
            <div className="relative flex items-center justify-center">
              <span className="h-6 w-6 rounded-full bg-emerald-500/15 flex items-center justify-center text-[#05DF72]">
                <Zap className="h-3.5 w-3.5 fill-[#05DF72]" />
              </span>
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#05DF72] ring-2 ring-white dark:ring-[#0F172A] animate-pulse" />
            </div>

            {/* Live Metrics */}
            <div className="flex items-center gap-2 font-mono">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  {totalTHs.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">TH/s</span>
                </span>
                <span className={`text-[10px] font-bold -mt-0.5 ${netProfitUSD >= 0 ? 'text-[#05DF72]' : 'text-rose-500'}`}>
                  {netProfitUSD >= 0 ? '+' : ''}${netProfitUSD.toFixed(3)}/h
                </span>
              </div>

              <div className="h-4 w-[1px] bg-slate-200 dark:bg-white/[0.1] mx-0.5" />

              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                {runningCount}/{totalCount} GPUs
              </span>
            </div>

            {/* Expand Indicator */}
            <div className="h-5 w-5 rounded-full bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-400 group-hover:text-[#05DF72] transition-colors">
              <ChevronUp className="h-3 w-3" />
            </div>
          </motion.div>
        ) : (
          /* EXPANDED MICRO-BENTO FLOATING HUB */
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="w-[330px] rounded-[26px] bg-white/95 dark:bg-[#0D1322]/95 backdrop-blur-2xl border border-slate-200/90 dark:border-white/[0.12] p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.18)] space-y-2.5 text-slate-800 dark:text-slate-100"
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-slate-900 flex items-center justify-center text-[#05DF72]">
                  <Zap className="h-3.5 w-3.5 fill-[#05DF72]" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase font-rajdhani tracking-wide flex items-center gap-1.5 leading-none">
                    MinerX Hub
                    <span className="text-[8px] px-1 py-0.2 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-[#05DF72] border border-emerald-500/20 font-mono">
                      LIVE
                    </span>
                  </h4>
                  <span className="text-[9px] text-[#05DF72] font-mono leading-tight">Telemetría en Vivo</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!isStandalone && (
                  <button
                    onClick={handleLaunchDesktopWidget}
                    title="Abrir como ventana flotante en escritorio"
                    className="h-6 w-6 rounded-full hover:bg-slate-100 dark:hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-[#05DF72] transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                )}
                {isStandalone ? (
                  <button
                    onClick={() => {
                      const win = window as any;
                      if (win.electronAPI?.closeWindow) win.electronAPI.closeWindow();
                      else window.close();
                    }}
                    className="h-6 w-6 rounded-full hover:bg-rose-500/10 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors"
                    title="Cerrar widget"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    onClick={() => setIsExpanded(false)}
                    className="h-6 w-6 rounded-full hover:bg-slate-100 dark:hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                    title="Minimizar hub"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Micro Bento KPI Grid */}
            <div className="grid grid-cols-2 gap-2 font-mono">
              <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#151E30] border border-slate-100 dark:border-white/[0.04]">
                <span className="text-[9px] text-slate-400 uppercase block font-semibold">Potencia Pool</span>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                  {totalTHs.toFixed(1)} <span className="text-[9px] font-normal text-slate-400">TH/s</span>
                </div>
                <span className="text-[9px] text-[#05DF72] font-semibold block mt-0.5 truncate">
                  {efficiencyPct.toFixed(0)}% vs Silicio ({benchmarkTHs.toFixed(0)} TH/s)
                </span>
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#151E30] border border-slate-100 dark:border-white/[0.04]">
                <span className="text-[9px] text-slate-400 uppercase block font-semibold">Utilidad Neta</span>
                <div className={`text-sm font-bold mt-0.5 ${netProfitUSD >= 0 ? 'text-[#05DF72]' : 'text-rose-500'}`}>
                  {netProfitUSD >= 0 ? '+' : ''}${netProfitUSD.toFixed(3)}
                  <span className="text-[9px] font-normal text-slate-400">/h</span>
                </div>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  ${dailyProfitUSD.toFixed(2)} USD/día
                </span>
              </div>
            </div>

            {/* Sparkline Hashrate Area Chart */}
            <div className="p-2 rounded-2xl bg-slate-50 dark:bg-[#151E30] border border-slate-100 dark:border-white/[0.04] space-y-1">
              <div className="flex items-center justify-between text-[9px] font-mono px-1">
                <span className="text-slate-400 flex items-center gap-1">
                  <Activity className="h-2.5 w-2.5 text-[#05DF72]" />
                  <span>Curva Hashrate en Vivo</span>
                </span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {totalTHs.toFixed(1)} TH/s
                </span>
              </div>

              <div className="h-9 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hubEmeraldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#05DF72" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#05DF72" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <YAxis domain={['dataMin - 10', 'dataMax + 10']} hide />
                    <Area
                      type="monotone"
                      dataKey="val"
                      stroke="#05DF72"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#hubEmeraldGrad)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Financial Details Strip (Salad & Kryptex) */}
            <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono p-2 rounded-2xl bg-slate-50/80 dark:bg-[#151E30]/70 border border-slate-100 dark:border-white/[0.04]">
              <div>
                <span className="text-slate-400 block">Salad Saldo:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  ${saladTotalUSD.toFixed(2)} USD
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Balance Kryptex:</span>
                <span className="font-bold text-[#05DF72]">
                  {prlTotal.toFixed(4)} {poolTicker}
                </span>
              </div>
              <div className="mt-0.5">
                <span className="text-slate-400 block">Ingreso Bruto:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  +${grossRevenueUSD.toFixed(3)}/h
                </span>
              </div>
              <div className="mt-0.5">
                <span className="text-slate-400 block">Costo Alquiler:</span>
                <span className="font-semibold text-rose-500">
                  -${saladCostUSD.toFixed(3)}/h
                </span>
              </div>
            </div>

            {/* Kryptex Shares & Online Hardware Row */}
            <div className="flex items-center justify-between p-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono">
              <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1 font-semibold">
                <Cpu className="h-3 w-3 text-[#05DF72]" />
                <span>{runningCount}/{totalCount} GPUs Activas</span>
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                <span className="text-[#05DF72]">{validShares.toLocaleString()}</span> v / <span className="text-amber-500">{staleShares}</span> s
              </span>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-4 gap-1.5 pt-0.5 text-[11px] font-rajdhani font-bold uppercase">
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="py-1.5 px-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1 transition-all"
                title="Sincronizar telemetría"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin text-[#05DF72]' : ''}`} />
                <span>Sync</span>
              </button>

              <button
                onClick={onToggleTheme}
                className="py-1.5 px-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1 transition-all"
                title={isDarkTheme ? 'Cambiar a modo Claro' : 'Cambiar a modo Oscuro'}
              >
                <Sparkles className="h-3 w-3 text-[#05DF72]" />
                <span>{isDarkTheme ? 'Oscuro' : 'Claro'}</span>
              </button>

              <button
                onClick={() => {
                  onNavigateToTab('fleet');
                  if (!isStandalone) setIsExpanded(false);
                }}
                className="py-1.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-1 transition-all shadow-xs"
                title="Ver lista de GPUs"
              >
                <Layers className="h-3 w-3 text-[#05DF72]" />
                <span>Flota</span>
              </button>

              <button
                onClick={() => {
                  onNavigateToTab('economics');
                  if (!isStandalone) setIsExpanded(false);
                }}
                className="py-1.5 px-2 rounded-xl bg-[#05DF72] hover:bg-[#00E599] text-slate-950 flex items-center justify-center gap-1 transition-all shadow-xs"
                title="Calculadora y ROI"
              >
                <TrendingUp className="h-3 w-3" />
                <span>Calc</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
