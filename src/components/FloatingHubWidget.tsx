import React, { useState, useRef, useMemo } from 'react';
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
  X,
  GripHorizontal,
  Smartphone,
  Pin,
  Move,
  PictureInPicture
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

  // Widget Mode: 'island' (docked at the top like Dynamic Island) or 'floating' (freely draggable anywhere)
  // Default on mobile devices (< 768px) is 'island' so it never blocks the bottom menu!
  const [hubMode, setHubMode] = useState<'island' | 'floating'>(() => {
    if (isStandalone) return 'floating';
    try {
      const saved = localStorage.getItem('minerx_hub_mode_v4');
      if (saved === 'island' || saved === 'floating') return saved;
    } catch {}
    return (typeof window !== 'undefined' && window.innerWidth < 768) ? 'island' : 'floating';
  });

  // Position for Free Floating Draggable Pill (Persistent in localStorage)
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('minerx_hub_coords_v4');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed;
        }
      }
    } catch {}
    // Safe default: On mobile, bottom-right ABOVE the MobileNav (84px from bottom)
    if (typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 768;
      return {
        x: Math.max(16, window.innerWidth - 300),
        y: isMobile ? Math.max(80, window.innerHeight - 150) : Math.max(80, window.innerHeight - 90)
      };
    }
    return { x: 20, y: 200 };
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isNearIslandZone, setIsNearIslandZone] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

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

  // Save mode preference
  const toggleHubMode = (newMode: 'island' | 'floating') => {
    setHubMode(newMode);
    try {
      localStorage.setItem('minerx_hub_mode_v4', newMode);
    } catch {}
  };

  // Handler for Android Picture-in-Picture Mode (External Floating Phone Screen Widget)
  const handleTriggerAndroidPiP = () => {
    const win = window as any;
    if (win.AndroidPiP?.enterPiP) {
      const ok = win.AndroidPiP.enterPiP();
      if (ok) return;
    }

    // Also send an ongoing mobile notification with live telemetry
    sendNativeNotification('MinerX ⚡ Telemetría en Vivo', {
      body: `${totalTHs.toFixed(1)} TH/s | +$${netProfitUSD.toFixed(3)}/h | ${runningCount}/${totalCount} GPUs Activas`,
      silent: true,
      tag: 'minerx-live-telemetry'
    });

    // If running in Desktop / Electron
    if (win.electronAPI?.toggleDesktopWidget) {
      win.electronAPI.toggleDesktopWidget();
    }
  };

  // Handler for Desktop Floating Window (Electron or Browser Pop-out)
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

  // Dragging logic for 'floating' mode
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isStandalone) return;
    // Don't drag if user clicked a button or interactive child
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) return;

    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: position.x,
      initY: position.y
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const widgetW = isExpanded ? 330 : 260;
    const widgetH = isExpanded ? 360 : 44;

    const newX = Math.max(8, Math.min(screenW - widgetW - 8, dragRef.current.initX + dx));
    const newY = Math.max(8, Math.min(screenH - widgetH - 8, dragRef.current.initY + dy));

    // If dragged into the top 60px, indicate snap to Dynamic Island!
    if (newY < 65) {
      setIsNearIslandZone(true);
    } else {
      setIsNearIslandZone(false);
    }

    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    // If dropped near the top edge, snap to Dynamic Island mode!
    if (isNearIslandZone) {
      toggleHubMode('island');
      setIsNearIslandZone(false);
      return;
    }

    try {
      localStorage.setItem('minerx_hub_coords_v4', JSON.stringify(position));
    } catch {}
    dragRef.current = null;
  };

  // Determine container positioning style based on mode
  const containerStyle: React.CSSProperties = useMemo(() => {
    if (isStandalone) {
      return { position: 'relative', width: '340px' };
    }

    if (hubMode === 'island') {
      // Anchored cleanly at the top center of the phone screen (under the camera notch)
      return {
        position: 'fixed',
        top: 'max(8px, env(safe-area-inset-top, 8px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: 'calc(100vw - 20px)'
      };
    }

    // Floating Mode: positioned at free coordinates (x, y)
    return {
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      zIndex: 9999,
      maxWidth: 'calc(100vw - 20px)',
      touchAction: 'none'
    };
  }, [isStandalone, hubMode, position]);

  return (
    <div
      style={containerStyle}
      className="select-none font-sans"
      onPointerDown={hubMode === 'floating' ? handlePointerDown : undefined}
      onPointerMove={hubMode === 'floating' ? handlePointerMove : undefined}
      onPointerUp={hubMode === 'floating' ? handlePointerUp : undefined}
      onPointerCancel={hubMode === 'floating' ? handlePointerUp : undefined}
    >
      {/* Visual snap feedback when dragging near top */}
      {isNearIslandZone && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#05DF72] text-slate-950 text-[10px] font-bold shadow-lg whitespace-nowrap animate-pulse">
          Soltar para anclar en Isla del Teléfono 🏝️
        </div>
      )}

      <AnimatePresence>
        {!isExpanded && !isStandalone ? (
          /* ========================================================================= */
          /* COLLAPSED HUD CAPSULE (Dynamic Island Pill or Floating Draggable Capsule)  */
          /* ========================================================================= */
          <motion.div
            initial={{ scale: 0.88, opacity: 0, y: hubMode === 'island' ? -10 : 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full backdrop-blur-2xl transition-all cursor-pointer shadow-[0_10px_30px_rgba(0,0,0,0.35)] border ${
              hubMode === 'island'
                ? 'bg-[#06080E]/95 text-white border-white/[0.16] ring-1 ring-emerald-500/20'
                : isDarkTheme
                ? 'bg-[#0A0E1A]/95 text-white border-white/[0.14] ring-1 ring-[#05DF72]/15'
                : 'bg-white/95 text-slate-900 border-slate-200/90 shadow-slate-300/40'
            }`}
          >
            {/* Drag Handle (Visible in Floating Mode) */}
            {hubMode === 'floating' && (
              <div 
                className="text-slate-400 hover:text-[#05DF72] cursor-grab active:cursor-grabbing p-0.5"
                title="Arrastrar píldora por la pantalla"
              >
                <GripHorizontal className="h-3.5 w-3.5" />
              </div>
            )}

            {/* Glowing Tech Green Pulse Badge */}
            <div 
              onClick={() => setIsExpanded(true)}
              className="relative flex items-center justify-center shrink-0 cursor-pointer"
            >
              <span className="h-6 w-6 rounded-full bg-emerald-500/15 flex items-center justify-center text-[#05DF72]">
                <Zap className="h-3.5 w-3.5 fill-[#05DF72]" />
              </span>
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#05DF72] ring-2 ring-black animate-pulse" />
            </div>

            {/* Live Metrics: Hashrate, Net Yield & GPUs */}
            <div 
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-2 font-mono cursor-pointer"
            >
              <div className="flex flex-col">
                <span className="text-xs font-bold leading-tight">
                  {totalTHs.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">TH/s</span>
                </span>
                <span className={`text-[10px] font-bold -mt-0.5 ${netProfitUSD >= 0 ? 'text-[#05DF72]' : 'text-rose-500'}`}>
                  {netProfitUSD >= 0 ? '+' : ''}${netProfitUSD.toFixed(3)}/h
                </span>
              </div>

              <div className="h-4 w-[1px] bg-white/[0.12] mx-0.5" />

              <span className="text-[10px] font-semibold text-slate-300">
                {runningCount}/{totalCount} <span className="hidden xs:inline">GPUs</span>
              </span>
            </div>

            {/* Quick Mode Pin / Expand Chevron */}
            <div className="flex items-center gap-1 pl-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleHubMode(hubMode === 'island' ? 'floating' : 'island');
                }}
                className={`p-1 rounded-full transition-colors cursor-pointer ${
                  hubMode === 'island' 
                    ? 'text-[#05DF72] hover:bg-emerald-500/20' 
                    : 'text-slate-400 hover:text-[#05DF72] hover:bg-white/[0.08]'
                }`}
                title={hubMode === 'island' ? 'Cambiar a Píldora Flotante Libre' : 'Anclar en la Isla del Teléfono'}
              >
                {hubMode === 'island' ? <Smartphone className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="h-5 w-5 rounded-full bg-white/[0.08] flex items-center justify-center text-slate-300 hover:text-[#05DF72] transition-colors cursor-pointer"
                title="Expandir telemetría"
              >
                {hubMode === 'island' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </button>
            </div>
          </motion.div>
        ) : (
          /* ========================================================================= */
          /* EXPANDED MICRO-BENTO FLOATING HUB                                         */
          /* ========================================================================= */
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: hubMode === 'island' ? -8 : 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: hubMode === 'island' ? -8 : 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={`w-[330px] rounded-[26px] backdrop-blur-2xl p-3.5 shadow-[0_25px_60px_rgba(0,0,0,0.5)] space-y-2.5 border transition-all ${
              isDarkTheme || hubMode === 'island'
                ? 'bg-[#080B14]/95 border-white/[0.14] text-white'
                : 'bg-white/95 border-slate-200/90 text-slate-900 shadow-slate-300/40'
            }`}
          >
            {/* Top Bar with Mode Controls & External Launcher */}
            <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.08] dark:border-white/[0.08]">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-slate-900 border border-[#05DF72]/30 flex items-center justify-center text-[#05DF72]">
                  <Zap className="h-3.5 w-3.5 fill-[#05DF72]" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold uppercase font-rajdhani tracking-wide flex items-center gap-1.5 leading-none">
                    MinerX Hub
                    <span className="text-[8px] px-1 py-0.2 rounded-full bg-emerald-500/10 text-[#05DF72] border border-emerald-500/20 font-mono">
                      {hubMode === 'island' ? 'ISLA DOCK' : 'FLOTANTE'}
                    </span>
                  </h4>
                  <span className="text-[9px] text-[#05DF72] font-mono leading-tight">Telemetría en Vivo</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Switch between Island and Floating Mode */}
                {!isStandalone && (
                  <button
                    type="button"
                    onClick={() => toggleHubMode(hubMode === 'island' ? 'floating' : 'island')}
                    title={hubMode === 'island' ? 'Cambiar a modo Flotante Libre' : 'Anclar en la Isla Superior del Teléfono'}
                    className={`h-6 px-2 rounded-full text-[10px] font-bold font-mono flex items-center gap-1 transition-colors border ${
                      hubMode === 'island'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-[#05DF72]'
                        : 'bg-white/[0.06] border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {hubMode === 'island' ? (
                      <>
                        <Smartphone className="h-3 w-3" />
                        <span>Isla</span>
                      </>
                    ) : (
                      <>
                        <Move className="h-3 w-3" />
                        <span>Libre</span>
                      </>
                    )}
                  </button>
                )}

                {/* External Mobile / Desktop Widget Trigger */}
                <button
                  type="button"
                  onClick={handleTriggerAndroidPiP}
                  title="Flotar en la pantalla del teléfono (Widget externo PiP)"
                  className="h-6 w-6 rounded-full bg-white/[0.06] hover:bg-[#05DF72]/20 flex items-center justify-center text-slate-300 hover:text-[#05DF72] transition-colors"
                >
                  <PictureInPicture className="h-3 w-3" />
                </button>

                {!isStandalone && (
                  <button
                    type="button"
                    onClick={handleLaunchDesktopWidget}
                    title="Abrir como ventana flotante en escritorio de PC"
                    className="h-6 w-6 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-slate-400 hover:text-[#05DF72] transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                )}

                {isStandalone ? (
                  <button
                    type="button"
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
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className="h-6 w-6 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Minimizar hub"
                  >
                    {hubMode === 'island' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Micro Bento KPI Grid */}
            <div className="grid grid-cols-2 gap-2 font-mono">
              <div className={`p-2.5 rounded-2xl border ${
                isDarkTheme || hubMode === 'island' ? 'bg-[#121828] border-white/[0.06]' : 'bg-slate-50 border-slate-200/90'
              }`}>
                <span className="text-[9px] text-slate-400 uppercase block font-semibold">Potencia Pool</span>
                <div className="text-sm font-bold mt-0.5">
                  {totalTHs.toFixed(1)} <span className="text-[9px] font-normal text-slate-400">TH/s</span>
                </div>
                <span className="text-[9px] text-[#05DF72] font-semibold block mt-0.5 truncate">
                  {efficiencyPct.toFixed(0)}% vs Silicio ({benchmarkTHs.toFixed(0)} TH/s)
                </span>
              </div>

              <div className={`p-2.5 rounded-2xl border ${
                isDarkTheme || hubMode === 'island' ? 'bg-[#121828] border-white/[0.06]' : 'bg-slate-50 border-slate-200/90'
              }`}>
                <span className="text-[9px] text-slate-400 uppercase block font-semibold">Utilidad Neta</span>
                <div className={`text-sm font-bold mt-0.5 ${netProfitUSD >= 0 ? 'text-[#05DF72]' : 'text-rose-500'}`}>
                  {netProfitUSD >= 0 ? '+' : ''}${netProfitUSD.toFixed(3)}
                  <span className="text-[9px] font-normal text-slate-400">/h</span>
                </div>
                <span className="text-[9px] text-slate-400 block mt-0.5">
                  ${dailyProfitUSD.toFixed(2)} USD/día
                </span>
              </div>
            </div>

            {/* Sparkline Hashrate Area Chart */}
            <div className={`p-2 rounded-2xl border space-y-1 ${
              isDarkTheme || hubMode === 'island' ? 'bg-[#121828] border-white/[0.06]' : 'bg-slate-50 border-slate-200/90'
            }`}>
              <div className="flex items-center justify-between text-[9px] font-mono px-1">
                <span className="text-slate-400 flex items-center gap-1">
                  <Activity className="h-2.5 w-2.5 text-[#05DF72]" />
                  <span>Curva Hashrate en Vivo</span>
                </span>
                <span className="font-bold text-[#05DF72]">
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
            <div className={`grid grid-cols-2 gap-1.5 text-[9px] font-mono p-2 rounded-2xl border ${
              isDarkTheme || hubMode === 'island' ? 'bg-[#121828] border-white/[0.06]' : 'bg-slate-50 border-slate-200/90'
            }`}>
              <div>
                <span className="text-slate-400 block">Salad Saldo:</span>
                <span className="font-bold text-[#05DF72]">
                  ${saladTotalUSD.toFixed(2)} USD
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Balance Kryptex:</span>
                <span className="font-bold">
                  {prlTotal.toFixed(4)} {poolTicker}
                </span>
              </div>
              <div className="mt-0.5">
                <span className="text-slate-400 block">Ingreso Bruto:</span>
                <span className="font-semibold text-slate-300">
                  +${grossRevenueUSD.toFixed(3)}/h
                </span>
              </div>
              <div className="mt-0.5">
                <span className="text-slate-400 block">Costo Alquiler:</span>
                <span className="font-semibold text-rose-400">
                  -${saladCostUSD.toFixed(3)}/h
                </span>
              </div>
            </div>

            {/* Kryptex Shares & Online Hardware Row */}
            <div className="flex items-center justify-between p-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono">
              <span className="text-slate-200 flex items-center gap-1 font-semibold">
                <Cpu className="h-3 w-3 text-[#05DF72]" />
                <span>{runningCount}/{totalCount} GPUs Activas</span>
              </span>
              <span className="font-bold">
                <span className="text-[#05DF72]">{validShares.toLocaleString()}</span> v / <span className="text-amber-400">{staleShares}</span> s
              </span>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-4 gap-1.5 pt-0.5 text-[11px] font-rajdhani font-bold uppercase">
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="py-1.5 px-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-white flex items-center justify-center gap-1 transition-all cursor-pointer"
                title="Sincronizar telemetría"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin text-[#05DF72]' : ''}`} />
                <span>Sync</span>
              </button>

              <button
                type="button"
                onClick={onToggleTheme}
                className="py-1.5 px-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-white flex items-center justify-center gap-1 transition-all cursor-pointer"
                title={isDarkTheme ? 'Cambiar a modo Claro' : 'Cambiar a modo Oscuro'}
              >
                <Sparkles className="h-3 w-3 text-[#05DF72]" />
                <span>{isDarkTheme ? 'Oscuro' : 'Claro'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onNavigateToTab('fleet');
                  if (!isStandalone) setIsExpanded(false);
                }}
                className="py-1.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white border border-white/10 flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer"
                title="Ver lista de GPUs"
              >
                <Layers className="h-3 w-3 text-[#05DF72]" />
                <span>Flota</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onNavigateToTab('economics');
                  if (!isStandalone) setIsExpanded(false);
                }}
                className="py-1.5 px-2 rounded-xl bg-[#05DF72] hover:bg-[#00E599] text-slate-950 flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer"
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
