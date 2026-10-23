import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../utils/apiConfig';
import { 
  TrendingUp, 
  TrendingDown, 
  Cpu, 
  Zap, 
  Activity, 
  DollarSign, 
  AlertTriangle, 
  ArrowUpRight, 
  ShieldCheck, 
  ShieldAlert, 
  Wallet, 
  RefreshCw, 
  Layers, 
  Sparkles, 
  CreditCard, 
  ExternalLink,
  Search,
  Star,
  CheckCircle2
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid,
  ReferenceLine,
  Legend
} from 'recharts';
import { BASELINE_USD_PER_THS_HOUR, calculateBreakEvenTHs } from '../data/gpuBenchmarks';
import type { 
  FleetSummary, 
  MergedGPUWorker, 
  HashrateHistoryPoint, 
  KryptexBalanceRaw, 
  KryptexPoolInfo,
  KryptexPayoutStatsRaw,
  MiningCycle
} from '../types/minerx';

export interface OverviewTabProps {
  summary: FleetSummary;
  workers: MergedGPUWorker[];
  history: HashrateHistoryPoint[];
  balance: KryptexBalanceRaw;
  poolInfo: KryptexPoolInfo;
  payoutStats?: KryptexPayoutStatsRaw | null;
  walletAddress?: string;
  onOpenReallocate: (worker: MergedGPUWorker) => void;
  onNavigateToFleet: () => void;
  onNavigateToApis: () => void;
  isDarkTheme?: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  summary,
  workers,
  history,
  balance,
  poolInfo,
  payoutStats,
  walletAddress,
  onOpenReallocate,
  onNavigateToFleet,
  onNavigateToApis,
  isDarkTheme = false
}) => {
  const isLight = !isDarkTheme;
  const borderDivider = isLight ? 'border-slate-100' : 'border-white/[0.08]';
  // Timeframe selector for cashflow KPIs: 'hour' | 'day' | 'month'
  const [timeframe, setTimeframe] = useState<'hour' | 'day' | 'month'>('hour');
  // Chart visual toggle: 'hashrate' | 'cashflow'
  const [chartMode, setChartMode] = useState<'hashrate' | 'cashflow'>('hashrate');
  // Video-clone states: Search and bottom switch toggle
  const [searchQuery, setSearchQuery] = useState('');
  const [fleetActiveTab, setFleetActiveTab] = useState<'all' | 'alerts'>('all');

  // Global fleet breakeven TH/s calculation con auditoría de fricción real (4.56% de spread Kryptex y liquidación SPEI)
  const fleetBreakevenTHs = useMemo(() => {
    if (!summary.hourlySaladCostUSD || summary.hourlySaladCostUSD <= 0) return 0;
    return calculateBreakEvenTHs(summary.hourlySaladCostUSD, BASELINE_USD_PER_THS_HOUR, true);
  }, [summary.hourlySaladCostUSD]);

  // Mining cycles data for area chart
  const [cycles, setCycles] = useState<MiningCycle[]>([]);

  useEffect(() => {
    apiFetch('/api/mining/cycles')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.closedCycles) {
          setCycles(data.closedCycles);
        }
      })
      .catch((err) => console.warn('Could not load cycles in Overview:', err));
  }, []);

  const totalCycleHours = useMemo(() => {
    return cycles.reduce((acc, c) => acc + (c.durationHours || 0), 0);
  }, [cycles]);

  const totalCycleNetUSD = useMemo(() => {
    return cycles.reduce((acc, c) => acc + (c.netProfitUSD || 0), 0);
  }, [cycles]);

  const cyclesChartData = useMemo(() => {
    if (cycles.length === 0) return [];
    return cycles.map((c, idx) => ({
      name: `Ciclo ${idx + 1}`,
      id: c.id,
      date: c.startDateStr,
      cryptoProduced: c.cryptoProduced || Number((c.grossRevenueUSD / (c.spotPriceUSD || 94500)).toFixed(6)),
      grossRevenueUSD: c.grossRevenueUSD,
      netProfitUSD: c.netProfitUSD,
      hashrateTHs: c.averageHashrateTHs,
      durationHours: c.durationHours,
      roiPct: c.roiPct,
      currency: c.cryptoCurrency || 'PRL'
    }));
  }, [cycles]);

  // Computed Kryptex Balance Values strictly from wallet / pool
  const totalMinedPRL = balance.total || (balance.confirmed + balance.unconfirmed) || 0;
  const confirmedPRL = balance.confirmed || 0;
  const unconfirmedPRL = balance.unconfirmed || 0;
  const payoutThreshold = balance.threshold || 1.0;
  const payoutProgressPct = payoutThreshold > 0 
    ? Math.min(100, Number(((totalMinedPRL / payoutThreshold) * 100).toFixed(1)))
    : (balance.reached_pct || 0);
  const remainingPRL = Math.max(0, payoutThreshold - totalMinedPRL);

  // Is the fleet currently profitable?
  const isNetProfitable = summary.hourlyNetProfitUSD > 0;
  const isNearBreakeven = isNetProfitable && summary.totalHashrateTHs < (fleetBreakevenTHs * 1.15);

  // Dynamic values based on selected timeframe
  const currentNetProfit = useMemo(() => {
    switch (timeframe) {
      case 'day':
        return summary.dailyNetProfitUSD;
      case 'month':
        return summary.monthlyNetProfitUSD;
      case 'hour':
      default:
        return summary.hourlyNetProfitUSD;
    }
  }, [timeframe, summary]);

  const currentGrossRevenue = useMemo(() => {
    switch (timeframe) {
      case 'day':
        return summary.dailyGrossRevenueUSD;
      case 'month':
        return summary.dailyGrossRevenueUSD * 30;
      case 'hour':
      default:
        return summary.hourlyGrossRevenueUSD;
    }
  }, [timeframe, summary]);

  const currentRentalCost = useMemo(() => {
    switch (timeframe) {
      case 'day':
        return summary.dailySaladCostUSD;
      case 'month':
        return summary.dailySaladCostUSD * 30;
      case 'hour':
      default:
        return summary.hourlySaladCostUSD;
    }
  }, [timeframe, summary]);

  // Sparkline data for KPI 3 (Total Hashrate)
  const sparklineData = useMemo(() => {
    if (history && history.length > 0) {
      return history.slice(-12).map((h) => h.fleetHashrateTHs);
    }
    // Fallback smooth curve based on current hashrate
    const base = summary.totalHashrateTHs || 100;
    return [base * 0.94, base * 0.96, base * 0.98, base * 0.95, base * 1.02, base * 0.99, base * 1.01, base];
  }, [history, summary.totalHashrateTHs]);

  // SVG Sparkline path generator
  const sparklineSvgPath = useMemo(() => {
    if (!sparklineData || sparklineData.length < 2) return '';
    const min = Math.min(...sparklineData);
    const max = Math.max(...sparklineData);
    const range = max - min || 1;
    const width = 160;
    const height = 48;
    const points = sparklineData.map((val, i) => {
      const x = (i / (sparklineData.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points.join(' L ')}`;
  }, [sparklineData]);

  // Dynamic gradient offset calculation for Recharts:
  // If hashrate falls below breakeven, gradient transitions to crimson red.
  const gradientOffset = useMemo(() => {
    if (!history || history.length === 0 || fleetBreakevenTHs <= 0) return 0;
    const hashrates = history.map((d) => d.fleetHashrateTHs);
    const max = Math.max(...hashrates, fleetBreakevenTHs * 1.2);
    const min = Math.min(...hashrates, fleetBreakevenTHs * 0.8);
    if (max <= min) return 0;
    // Offset represents where the breakeven sits from 0 (top) to 1 (bottom)
    const ratio = (max - fleetBreakevenTHs) / (max - min);
    return Math.max(0, Math.min(1, ratio));
  }, [history, fleetBreakevenTHs]);

  // Circular progress metrics for KPI 2 (Fleet Efficiency)
  const efficiencyPct = Math.max(0, Math.min(100, summary.fleetEfficiencyPct || 0));
  const strokeDashoffset = 100 - efficiencyPct;
  const efficiencyColor = 
    efficiencyPct >= 90 
      ? '#05F292' // Cyber Neon Emerald
      : efficiencyPct >= 75 
      ? '#F59E0B' // Tactical Amber
      : '#FF2A55'; // Crimson Alert

  // Underperforming & Offline workers for immediate action
  const problematicWorkers = useMemo(() => {
    return workers.filter(
      (w) => (!w.isMining && w.saladStatus === 'running') || w.performanceRatioPct < 80
    );
  }, [workers]);

  // Filtered workers list for the video-cloned Silicio Surveillance card
  const filteredWorkers = useMemo(() => {
    let list = fleetActiveTab === 'alerts' ? problematicWorkers : workers;
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (w) =>
        w.workerName.toLowerCase().includes(q) ||
        w.gpuModel.toLowerCase().includes(q) ||
        w.saladStatus.toLowerCase().includes(q)
    );
  }, [workers, problematicWorkers, fleetActiveTab, searchQuery]);

  // --------------------------------------------------------------------------
  // EMPTY / ZERO-STATE ONBOARDING BANNER (When no accounts or wallet connected)
  // --------------------------------------------------------------------------
  if (workers.length === 0 && summary.totalAllocatedGPUs === 0) {
    return (
      <div className="space-y-6 pb-24 md:pb-12 animate-in fade-in duration-300">
        {/* Tactical Onboarding Terminal */}
        <div className={`relative overflow-hidden rounded-3xl border p-6 sm:p-8 transition-all ${
          isLight 
            ? 'bg-white border-slate-200/90 shadow-sm' 
            : 'border-white/10 bg-[#080B11]/90 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.7)]'
        }`}>
          <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#05DF72] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#05DF72]"></span>
                </span>
                <span className="font-rajdhani text-sm font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  MinerX Telemetry Hub • Modo Datos en Vivo
                </span>
              </div>
              <h2 className={`font-rajdhani text-2xl sm:text-3xl font-extrabold tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Terminal de Control & Vigilancia de Flota
              </h2>
              <p className={`text-sm max-w-2xl leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                El sistema está listo para vigilar tus GPUs de <span className="text-emerald-600 dark:text-cyan-400 font-semibold">SaladCloud</span> y contrastar los shares válidos en el pool de <span className="text-[#05DF72] font-semibold">Kryptex (Pearl PRL)</span>. Conecta tus credenciales para activar la telemetría en tiempo real y el protector contra la lotería de silicio.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onNavigateToApis}
                className="flex items-center justify-center gap-2 rounded-2xl bg-[#05DF72] px-6 py-3.5 text-sm font-rajdhani font-bold text-slate-950 uppercase tracking-wider hover:brightness-105 active:scale-95 transition-all shadow-sm"
              >
                <Sparkles className="h-4 w-4" />
                <span>Conectar APIs & Wallet</span>
              </button>
            </div>
          </div>
        </div>

        {/* Informative Bento Quick Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`rounded-3xl border p-5 transition-all ${
            isLight ? 'bg-white border-slate-200/90 shadow-sm text-slate-900' : 'border-white/10 bg-[#0C101A]/80 backdrop-blur-xl text-white'
          }`}>
            <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
              <DollarSign className="h-5 w-5" />
            </div>
            <h3 className={`font-rajdhani text-lg font-bold uppercase ${isLight ? 'text-slate-900' : 'text-white'}`}>Protección de Capital</h3>
            <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Monitorea el costo en USD de cada contenedor de Salad contra las recompensas de Kryptex para evitar quemar capital.
            </p>
          </div>

          <div className={`rounded-3xl border p-5 transition-all ${
            isLight ? 'bg-white border-slate-200/90 shadow-sm text-slate-900' : 'border-white/10 bg-[#0C101A]/80 backdrop-blur-xl text-white'
          }`}>
            <div className="h-10 w-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 mb-4">
              <RefreshCw className="h-5 w-5" />
            </div>
            <h3 className={`font-rajdhani text-lg font-bold uppercase ${isLight ? 'text-slate-900' : 'text-white'}`}>Reasignación 1-Click</h3>
            <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Descarta nodos de silicio defectuosos con menos del 80% de rendimiento invocando la API oficial de SaladCloud.
            </p>
          </div>

          <div className={`rounded-3xl border p-5 transition-all ${
            isLight ? 'bg-white border-slate-200/90 shadow-sm text-slate-900' : 'border-white/10 bg-[#0C101A]/80 backdrop-blur-xl text-white'
          }`}>
            <div className="h-10 w-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mb-4">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <h3 className={`font-rajdhani text-lg font-bold uppercase ${isLight ? 'text-slate-900' : 'text-white'}`}>Vigilante Autónomo 24/7</h3>
            <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Alertas automáticas al instante a tu Telegram o Discord ante desconexiones o caída de hashrate sin tocar nada.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MAIN BENTO GRID DASHBOARD
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-5 pb-24 md:pb-12 animate-in fade-in duration-300">
      
      {/* 1. TOP TACTICAL HUD BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <div className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#05DF72] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#05DF72]"></span>
          </div>
          <span className={`font-rajdhani text-sm font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
            Telemetría de Red • <span className="text-[#05DF72]">Pearl PRL Kryptex Pool</span>
          </span>
          <span className={`hidden sm:inline-block text-[11px] font-jetbrains px-2 py-0.5 rounded border ${
            isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-white/[0.04] text-slate-400 border-white/10'
          }`}>
            Dificultad: {summary.networkDifficulty || 'Auto PPS'}
          </span>
        </div>

        {/* Timeframe Control (1h / 24h / 30d) */}
        <div className={`flex items-center gap-1 self-start sm:self-auto rounded-2xl p-1 shadow-inner backdrop-blur-md transition-colors ${
          isLight ? 'border border-slate-200 bg-slate-100/90' : 'border border-white/10 bg-[#0A0D15]/90'
        }`}>
          {(['hour', 'day', 'month'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`rounded-xl px-3 py-1 text-xs font-rajdhani font-bold transition-all ${
                timeframe === t
                  ? 'bg-[#05DF72] text-slate-950 font-bold shadow-sm'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t === 'hour' ? '1 HORA' : t === 'day' ? '24 HORAS' : '30 DÍAS'}
            </button>
          ))}
        </div>
      </div>

      {/* 2. MAIN 2-COLUMN BENTO: LEFT 3 STACKED PASTEL CARDS, RIGHT WIDE CHART + 2 BENTO CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* LEFT COLUMN: 3 STACKED PASTEL KPI CARDS (4 COLS ON DESKTOP) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          {/* Header & Video-Cloned Search Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className={`font-rajdhani text-sm font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  Flota & Silicio
                </h3>
                <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {summary.activeMiningGPUs} nodos minando en tiempo real
                </p>
              </div>
              <span className="text-[10px] font-jetbrains font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-[#05DF72] border border-emerald-500/20">
                {summary.totalAllocatedGPUs} GPUs
              </span>
            </div>

            <div className="relative flex items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar GPUs o nodos..."
                className={`w-full rounded-full py-2 pl-4 pr-10 text-xs font-rajdhani font-medium transition-all outline-none border ${
                  isLight
                    ? 'bg-white border-slate-200/90 text-slate-900 placeholder:text-slate-400 focus:border-[#05DF72]'
                    : 'bg-[#080B11] border-white/10 text-white placeholder:text-slate-500 focus:border-[#05DF72]'
                }`}
              />
              <div className="absolute right-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white">
                <Search className="h-3 w-3" />
              </div>
            </div>
          </div>
          
          {/* KPI 1: RENTABILIDAD NETA (hourlyNetProfitUSD) - Video Clone: "Speak with Confidence" (Pastel Violet) */}
          <div 
            className={`relative overflow-hidden rounded-[26px] border p-5 sm:p-6 transition-all duration-300 hover:shadow-md ${
              isLight
                ? 'bg-[#F1EEFC] border-purple-200/80 text-slate-900 shadow-xs'
                : 'bg-[#141226] border-purple-500/20 text-white shadow-xl'
            }`}
          >
            {/* Subtle Ambient Glow */}
            <div 
              className={`absolute -top-12 -right-12 h-32 w-32 rounded-full blur-2xl pointer-events-none ${
                isNetProfitable ? 'bg-purple-500/15' : 'bg-rose-500/20'
              }`} 
            />

            <div className="flex items-center justify-between gap-2 relative z-10">
              <div>
                <h4 className="font-bold text-base tracking-tight text-slate-900 dark:text-white font-sans">
                  Rentabilidad Neta en Vivo
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Flujo neto tras costos de alquiler y fricción SPEI
                </p>
              </div>

              <div 
                className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase border ${
                  !isNetProfitable
                    ? 'bg-rose-500/15 text-rose-500 border-rose-500/30'
                    : isNearBreakeven
                    ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-[#05DF72] border-emerald-500/30'
                }`}
              >
                {!isNetProfitable ? (
                  <>
                    <TrendingDown className="h-3 w-3 text-rose-500" />
                    <span>Quema Capital</span>
                  </>
                ) : isNearBreakeven ? (
                  <>
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span>Margen Ajustado</span>
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-3 w-3 text-[#05DF72]" />
                    <span>ROI Positivo</span>
                  </>
                )}
              </div>
            </div>

            {/* Primary Value with bold tabular font */}
            <div className="mt-4 flex items-baseline gap-2 relative z-10">
              <span 
                className={`font-jetbrains text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums ${
                  isNetProfitable ? 'text-slate-900 dark:text-white' : 'text-rose-500'
                }`}
              >
                {currentNetProfit >= 0 ? '+' : ''}${currentNetProfit.toFixed(3)}
              </span>
              <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 font-mono">
                USD / {timeframe === 'hour' ? 'hr' : timeframe === 'day' ? 'día' : 'mes'}
              </span>
            </div>

            {/* Breakdown: Gross Rev vs Rental Cost */}
            <div className="mt-3 pt-2.5 border-t border-purple-200/60 dark:border-white/10 grid grid-cols-2 gap-2 text-xs relative z-10">
              <div>
                <span className="text-[10px] block text-slate-500 dark:text-slate-400">Ingreso Bruto:</span>
                <span className="font-jetbrains font-bold tabular-nums text-xs text-slate-900 dark:text-white">
                  +${currentGrossRevenue.toFixed(3)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] block text-slate-500 dark:text-slate-400">Costo Alquiler:</span>
                <span className="font-jetbrains font-bold text-rose-500 tabular-nums text-xs">
                  -${currentRentalCost.toFixed(3)}
                </span>
              </div>
            </div>

            {/* Video-replica bottom bar: Solid Black Pill on left + Avatar rings on right */}
            <div className="mt-3.5 pt-2.5 border-t border-purple-200/60 dark:border-white/10 flex items-center justify-between relative z-10">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 text-white px-3.5 py-1 text-xs font-semibold shadow-xs">
                <span>{new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
                <span className="text-slate-400">•</span>
                <span className="text-[#05DF72]">ROI Positivo</span>
              </div>
              <div className="flex -space-x-2 overflow-hidden">
                <div className="inline-flex h-6.5 w-6.5 items-center justify-center rounded-full ring-2 ring-white dark:ring-slate-900 bg-emerald-500/20 text-[#05DF72] text-[10px] font-bold">
                  <Zap className="h-3 w-3 fill-[#05DF72]" />
                </div>
                <div className="inline-flex h-6.5 w-6.5 items-center justify-center rounded-full ring-2 ring-white dark:ring-slate-900 bg-cyan-500/20 text-cyan-400 text-[10px] font-bold">
                  <Cpu className="h-3 w-3" />
                </div>
                <div className="inline-flex h-6.5 w-6.5 items-center justify-center rounded-full ring-2 ring-white dark:ring-slate-900 bg-slate-900 text-white text-[9px] font-extrabold font-mono">
                  {summary.activeMiningGPUs || 1}x
                </div>
              </div>
            </div>
          </div>

          {/* KPI 2: EFICIENCIA DE FLOTA - Video Clone: "Master the Basics" (Pastel Sky Blue) */}
          <div className={`relative overflow-hidden rounded-[26px] border p-5 sm:p-6 transition-all duration-300 hover:shadow-md ${
            isLight 
              ? 'bg-[#E0F2FE] border-sky-200/80 text-slate-900 shadow-xs' 
              : 'bg-[#0B1E30] border-sky-500/20 text-white shadow-xl'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-base tracking-tight text-slate-900 dark:text-white font-sans">
                  Eficiencia de Silicio & Flota
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Rendimiento real vs benchmark de silicio
                </p>
              </div>

              <span 
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase"
                style={{
                  color: efficiencyColor,
                  backgroundColor: `${efficiencyColor}18`,
                  borderColor: `${efficiencyColor}40`
                }}
              >
                {efficiencyPct >= 90 ? 'Saludable' : efficiencyPct >= 75 ? 'Atención' : 'Crítico'}
              </span>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span 
                    className="font-jetbrains text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white"
                  >
                    {efficiencyPct.toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs mt-1 uppercase font-semibold text-slate-500 dark:text-slate-400 font-mono">
                  Vs Benchmark Teórico
                </p>
              </div>

              {/* SVG Circular Progress Ring */}
              <div className="relative h-16 w-16 flex-shrink-0 flex items-center justify-center">
                <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                  <path
                    className={isLight ? 'text-sky-200/80' : 'text-white/10'}
                    strokeWidth="3.2"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    stroke={efficiencyColor}
                    strokeWidth="3.2"
                    strokeDasharray="100, 100"
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Cpu className={`h-4 w-4 ${isLight ? 'text-slate-700' : 'text-slate-300'}`} />
                </div>
              </div>
            </div>

            {/* Video-replica bottom bar: Solid Black Pill on left + Avatar rings on right */}
            <div className="mt-3.5 pt-2.5 border-t border-sky-200/60 dark:border-white/10 flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 text-white px-3.5 py-1 text-xs font-semibold shadow-xs">
                <span>{summary.activeMiningGPUs} GPUs Activas</span>
                <span className="text-slate-400">•</span>
                <span className={efficiencyPct >= 80 ? 'text-[#05DF72]' : 'text-amber-400'}>
                  {efficiencyPct >= 80 ? 'Saludable' : 'Alerta'}
                </span>
              </div>
              <div className="flex -space-x-2 overflow-hidden">
                {workers.slice(0, 3).map((w, idx) => (
                  <div 
                    key={w.id || idx}
                    title={`${w.workerName} (${w.gpuModel})`}
                    className="inline-flex h-6.5 w-6.5 items-center justify-center rounded-full ring-2 ring-white dark:ring-slate-900 bg-slate-800 text-white text-[9px] font-mono font-bold"
                  >
                    {w.gpuModel.includes('4090') ? '49' : w.gpuModel.includes('3090') ? '39' : 'GPU'}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* KPI 3: POTENCIA TOTAL - Video Clone: "Sound Like a Native" (Pastel Mint Green) */}
          <div className={`relative overflow-hidden rounded-[26px] border p-5 sm:p-6 transition-all duration-300 hover:shadow-md flex flex-col justify-between ${
            isLight 
              ? 'bg-[#DCFCE7] border-emerald-200/80 text-slate-900 shadow-xs' 
              : 'bg-[#0B251A] border-emerald-500/20 text-white shadow-xl'
          }`}>
            
            {/* Background SVG Sparkline Fluid Effect */}
            <div className="absolute right-0 bottom-2 w-44 h-16 opacity-35 pointer-events-none">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 160 48">
                <defs>
                  <linearGradient id="kpiSparklineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#05DF72" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#00E5FF" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                {sparklineSvgPath && (
                  <>
                    <path
                      d={sparklineSvgPath}
                      fill="none"
                      stroke="#05DF72"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={`${sparklineSvgPath} L 160,48 L 0,48 Z`}
                      fill="url(#kpiSparklineGradient)"
                    />
                  </>
                )}
              </svg>
            </div>

            <div className="flex items-center justify-between gap-2 relative z-10">
              <div>
                <h4 className="font-bold text-base tracking-tight text-slate-900 dark:text-white font-sans">
                  Potencia Total de Minado
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Algoritmo PearlHash • PoUW Pearl
                </p>
              </div>

              <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 dark:text-[#05DF72] bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                <Zap className="h-3 w-3 fill-[#05DF72] text-[#05DF72]" />
                <span>PearlHash</span>
              </div>
            </div>

            {/* Primary Hashrate */}
            <div className="mt-4 relative z-10">
              <div className="flex items-baseline gap-2">
                <span className="font-jetbrains text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white">
                  {summary.totalHashrateTHs.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="text-sm font-bold text-emerald-700 dark:text-[#05DF72] uppercase font-mono">
                  TH/s
                </span>
              </div>
              <p className="text-xs mt-1 uppercase font-semibold text-slate-500 dark:text-slate-400 font-mono">
                Teórico Silicio: <span className="font-jetbrains font-bold tabular-nums text-slate-700 dark:text-slate-200">{summary.benchmarkHashrateTHs.toFixed(1)} TH/s</span>
              </p>
            </div>

            {/* Video-replica bottom bar: Solid Black Pill on left + Kryptex PPS on right */}
            <div className="mt-3.5 pt-2.5 border-t border-emerald-200/60 dark:border-white/10 flex items-center justify-between text-xs relative z-10">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 text-white px-3.5 py-1 text-xs font-semibold shadow-xs">
                <span className="text-amber-400">Equilibrio: {fleetBreakevenTHs.toFixed(1)} TH/s</span>
              </div>
              <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-white/80 dark:bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 shadow-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#05DF72]" />
                <span>Kryptex PPS</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: WIDE RECHARTS AREA ON TOP + 2 SIDE-BY-SIDE CARDS BELOW (8 COLS ON DESKTOP) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          
          {/* MAIN RECHARTS AREA ("Performance Chart" Video Clone) */}
          <div className={`rounded-3xl border p-5 sm:p-6 flex flex-col justify-between transition-all ${
            isLight ? 'bg-white border-slate-200/90 shadow-xs hover:shadow-md text-slate-900' : 'border-white/10 bg-[#080B11]/90 backdrop-blur-xl shadow-xl text-white'
          }`}>
            
            {/* Header of Area Chart with Video-Cloned Indicators */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#05DF72]" />
                  <h3 className={`font-rajdhani text-base font-bold uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Performance Chart
                  </h3>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs">
                  <span className="flex items-center gap-1 text-xs font-rajdhani font-semibold text-[#05DF72]">
                    <span className="h-2 w-2 rounded-full bg-[#05DF72]"></span>
                    Hashrate TH/s
                  </span>
                  <span className="flex items-center gap-1 text-xs font-rajdhani font-semibold text-cyan-500">
                    <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
                    Ganancia Neta
                  </span>
                  <span className="flex items-center gap-1 text-xs font-rajdhani font-semibold text-rose-500">
                    <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                    Costo Salad
                  </span>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className={`flex items-center gap-1 rounded-2xl p-1 self-start sm:self-auto transition-colors ${
                isLight ? 'border border-slate-200 bg-slate-100' : 'border border-white/10 bg-[#06080D]'
              }`}>
                <button
                  onClick={() => setChartMode('hashrate')}
                  className={`rounded-xl px-3 py-1 text-xs font-rajdhani font-bold transition-all ${
                    chartMode === 'hashrate'
                      ? 'bg-[#05DF72] text-slate-950 font-bold shadow-sm'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Hashrate (TH/s)
                </button>
                <button
                  onClick={() => setChartMode('cashflow')}
                  className={`rounded-xl px-3 py-1 text-xs font-rajdhani font-bold transition-all ${
                    chartMode === 'cashflow'
                      ? 'bg-[#05DF72] text-slate-950 font-bold shadow-sm'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Flujo ($ USD/h)
                </button>
              </div>
            </div>

            {/* Interactive Recharts Canvas */}
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'hashrate' ? (
                  <AreaChart
                    data={history}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="hashrateAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        {isNetProfitable ? (
                          <>
                            <stop offset="0%" stopColor="#00E5FF" stopOpacity={0.45} />
                            <stop offset={`${Math.min(100, Math.max(0, gradientOffset * 100))}%`} stopColor="#05F292" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#FF2A55" stopOpacity={0.05} />
                          </>
                        ) : (
                          <>
                            <stop offset="0%" stopColor="#FF2A55" stopOpacity={0.5} />
                            <stop offset="50%" stopColor="#E11D48" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#881337" stopOpacity={0.05} />
                          </>
                        )}
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    
                    <XAxis 
                      dataKey="time" 
                      stroke="#64748B" 
                      fontSize={11} 
                      tickLine={false}
                      axisLine={{ stroke: '#ffffff15' }}
                      tick={{ fill: '#94A3B8', fontFamily: 'JetBrains Mono', fontSize: 10 }}
                    />
                    
                    <YAxis 
                      stroke="#64748B" 
                      fontSize={11} 
                      tickLine={false}
                      axisLine={{ stroke: '#ffffff15' }}
                      tick={{ fill: '#94A3B8', fontFamily: 'JetBrains Mono', fontSize: 10 }}
                      unit=" T"
                    />

                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const val = Number(payload[0].value);
                          const isAbove = val >= fleetBreakevenTHs;
                          return (
                            <div className="rounded-xl border border-white/15 bg-[#06080E]/95 p-3 backdrop-blur-xl shadow-2xl">
                              <span className="font-jetbrains text-[10px] text-slate-400 block mb-1">
                                {label}
                              </span>
                              <div className="flex items-center gap-2">
                                <span 
                                  className="font-jetbrains text-base font-bold tabular-nums"
                                  style={{ color: isAbove ? '#05F292' : '#FF2A55' }}
                                >
                                  {val.toFixed(1)} TH/s
                                </span>
                                <span 
                                  className={`text-[10px] font-rajdhani font-bold px-1.5 py-0.5 rounded border ${
                                    isAbove 
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                  }`}
                                >
                                  {isAbove ? 'Ganancia' : 'Bajo Umbral'}
                                </span>
                              </div>
                              <div className="mt-1.5 pt-1.5 border-t border-white/10 text-[10px] text-slate-400 flex justify-between gap-3 font-jetbrains">
                                <span>Punto Equilibrio:</span>
                                <span className="text-amber-300 font-bold">{fleetBreakevenTHs.toFixed(1)} TH/s</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />

                    {fleetBreakevenTHs > 0 && (
                      <ReferenceLine 
                        y={fleetBreakevenTHs} 
                        stroke="#F59E0B" 
                        strokeDasharray="4 4" 
                        strokeWidth={1.5}
                        label={{ 
                          value: 'EQUILIBRIO', 
                          fill: '#F59E0B', 
                          fontSize: 9, 
                          fontFamily: 'Rajdhani', 
                          position: 'insideTopRight' 
                        }} 
                      />
                    )}

                    <Area 
                      type="monotone" 
                      dataKey="fleetHashrateTHs" 
                      stroke={isNetProfitable ? '#00E5FF' : '#FF2A55'} 
                      strokeWidth={2.5} 
                      fill="url(#hashrateAreaGradient)" 
                      activeDot={{ r: 5, fill: '#05F292', stroke: '#080B11', strokeWidth: 2 }}
                    />
                  </AreaChart>
                ) : (
                  <AreaChart
                    data={history}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="profitCashflowGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#05F292" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#05F292" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="costCashflowGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF2A55" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#FF2A55" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    
                    <XAxis 
                      dataKey="time" 
                      stroke="#64748B" 
                      fontSize={11} 
                      tickLine={false}
                      tick={{ fill: '#94A3B8', fontFamily: 'JetBrains Mono', fontSize: 10 }}
                    />
                    
                    <YAxis 
                      stroke="#64748B" 
                      fontSize={11} 
                      tickLine={false}
                      tick={{ fill: '#94A3B8', fontFamily: 'JetBrains Mono', fontSize: 10 }}
                      unit="$"
                    />

                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="rounded-xl border border-white/15 bg-[#06080E]/95 p-3 backdrop-blur-xl shadow-2xl font-jetbrains">
                              <span className="text-[10px] text-slate-400 block mb-1">{label}</span>
                              {payload.map((entry, idx) => (
                                <div key={idx} className="flex justify-between gap-4 text-xs py-0.5">
                                  <span style={{ color: entry.color }}>{entry.name}:</span>
                                  <span className="font-bold text-white tabular-nums">${Number(entry.value).toFixed(3)}/h</span>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    
                    <Legend 
                      wrapperStyle={{ paddingTop: '8px', fontSize: '11px', fontFamily: 'Rajdhani' }} 
                    />

                    <Area 
                      name="Ganancia Neta"
                      type="monotone" 
                      dataKey="netProfitPerHourUSD" 
                      stroke="#05F292" 
                      strokeWidth={2} 
                      fill="url(#profitCashflowGradient)" 
                    />
                    
                    <Area 
                      name="Costo Alquiler Salad"
                      type="monotone" 
                      dataKey="saladCostPerHourUSD" 
                      stroke="#FF2A55" 
                      strokeWidth={1.5} 
                      strokeDasharray="3 3"
                      fill="url(#costCashflowGradient)" 
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2 SIDE-BY-SIDE BENTO CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            
            {/* CARD A: VIGILANCIA SILICIO ("Homework" Video Clone) */}
            <div className={`rounded-3xl border p-5 sm:p-6 flex flex-col justify-between transition-all ${
              isLight ? 'bg-white border-slate-200/90 shadow-xs hover:shadow-md text-slate-900' : 'border-white/10 bg-[#080B11]/90 backdrop-blur-xl shadow-xl text-white'
            }`}>
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-[#05DF72]" />
                      <h3 className={`font-rajdhani text-base font-bold uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        Vigilancia de Silicio
                      </h3>
                    </div>
                    <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Supervisión activa de contenedores y nodos
                    </p>
                  </div>
                  <button
                    onClick={onNavigateToFleet}
                    className="text-xs font-rajdhani font-bold text-[#05DF72] hover:underline flex items-center gap-1 uppercase transition-colors"
                  >
                    <span>Flota ({workers.length})</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Worker List Cloned like Homework Items */}
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {(filteredWorkers.length > 0 ? filteredWorkers.slice(0, 4) : workers.slice(0, 4)).map((w) => {
                    const isLowPerf = w.performanceRatioPct < 80;
                    return (
                      <div 
                        key={w.id} 
                        className={`flex items-center justify-between gap-3 rounded-2xl border p-3 transition-all ${
                          isLowPerf
                            ? (isLight ? 'bg-rose-50/70 border-rose-200' : 'bg-rose-500/[0.06] border-rose-500/20')
                            : (isLight ? 'bg-slate-50 border-slate-100 hover:border-slate-200' : 'bg-[#06080D] border-white/[0.06] hover:border-white/10')
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Dark square icon tile matching video */}
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-xs">
                            <Cpu className={`h-4 w-4 ${isLowPerf ? 'text-rose-400' : 'text-[#05DF72]'}`} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`font-rajdhani font-bold text-sm truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                {w.workerName}
                              </span>
                              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                                isLight ? 'bg-white text-slate-600 border-slate-200' : 'bg-white/[0.06] text-slate-300 border-white/10'
                              }`}>
                                {w.gpuModel}
                              </span>
                            </div>
                            <div className={`text-[11px] font-jetbrains ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                              {w.currentHashrateTHs.toFixed(1)} / {w.expectedBenchmarkTHs.toFixed(1)} TH/s
                            </div>
                          </div>
                        </div>

                        {/* Right Action / Percentage Pill */}
                        {isLowPerf ? (
                          <button
                            onClick={() => onOpenReallocate(w)}
                            className="shrink-0 flex items-center gap-1 rounded-full bg-rose-500 hover:bg-rose-600 px-2.5 py-1 text-[11px] font-rajdhani font-bold text-white uppercase tracking-wider transition-all shadow-xs"
                          >
                            <RefreshCw className="h-3 w-3" />
                            <span>{w.performanceRatioPct.toFixed(0)}%</span>
                          </button>
                        ) : (
                          <div className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-jetbrains font-bold text-[#05DF72]">
                            {w.performanceRatioPct.toFixed(0)}%
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {workers.length === 0 && (
                    <div className={`p-4 rounded-2xl border text-center text-xs flex flex-col items-center gap-1.5 ${
                      isLight ? 'bg-slate-50 border-slate-100 text-slate-500' : 'bg-[#06080D] border-white/[0.04] text-slate-400'
                    }`}>
                      <ShieldCheck className="h-4 w-4 text-[#05DF72]" />
                      <span>Sin trabajadores activos registrados.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Exact replica of the video's bottom capsule switch: [ Themes ] [ Amber ] */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <div className={`flex rounded-full p-1 border transition-colors ${
                  isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#06080D] border-white/10'
                }`}>
                  <button
                    onClick={() => setFleetActiveTab('all')}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-rajdhani font-bold transition-all ${
                      fleetActiveTab === 'all'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>◉ Flota Activa ({workers.length})</span>
                  </button>
                  <button
                    onClick={() => setFleetActiveTab('alerts')}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-rajdhani font-bold transition-all ${
                      fleetActiveTab === 'alerts'
                        ? 'bg-[#05DF72] text-slate-950 font-bold shadow-xs'
                        : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>⚠ Alertas ({problematicWorkers.length})</span>
                  </button>
                </div>
              </div>
            </div>

            {/* CARD B: BALANCE & PAGOS KRYPTEX ("Friends Score" Video Clone) */}
            <div className={`rounded-3xl border p-5 sm:p-6 flex flex-col justify-between transition-all ${
              isLight ? 'bg-white border-slate-200/90 shadow-xs hover:shadow-md text-slate-900' : 'border-white/10 bg-[#080B11]/90 backdrop-blur-xl shadow-xl text-white'
            }`}>
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-[#05DF72]" />
                      <h3 className={`font-rajdhani text-base font-bold uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        Friends Score & Pool
                      </h3>
                    </div>
                    <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Estadísticas y pagos de pool Kryptex
                    </p>
                  </div>
                  <span className="font-rajdhani text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    PoUW Pearl
                  </span>
                </div>

                {/* 4 Ranked Items exactly matching video layout */}
                <div className="space-y-2.5">
                  
                  {/* Rank 1: Confirmado */}
                  <div className={`flex items-center justify-between p-2.5 rounded-2xl border transition-colors ${
                    isLight ? 'bg-slate-50/80 border-slate-100' : 'bg-[#06080D] border-white/[0.04]'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white font-jetbrains text-xs font-bold">
                        1
                      </div>
                      <div>
                        <span className={`font-rajdhani text-xs font-bold block ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          Balance Confirmado
                        </span>
                        <div className="flex gap-0.5 mt-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className="h-2.5 w-2.5 fill-[#05DF72] text-[#05DF72]" />
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="font-jetbrains text-xs font-bold text-[#05DF72] tabular-nums">
                      {confirmedPRL.toFixed(4)} PRL
                    </span>
                  </div>

                  {/* Rank 2: Inmaduro */}
                  <div className={`flex items-center justify-between p-2.5 rounded-2xl border transition-colors ${
                    isLight ? 'bg-slate-50/80 border-slate-100' : 'bg-[#06080D] border-white/[0.04]'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-white font-jetbrains text-xs font-bold">
                        2
                      </div>
                      <div>
                        <span className={`font-rajdhani text-xs font-bold block ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          Inmaduro (Unconfirmed)
                        </span>
                        <div className="flex gap-0.5 mt-0.5">
                          {[...Array(4)].map((_, i) => (
                            <Star key={i} className="h-2.5 w-2.5 fill-cyan-400 text-cyan-400" />
                          ))}
                          <Star className="h-2.5 w-2.5 text-slate-400" />
                        </div>
                      </div>
                    </div>
                    <span className={`font-jetbrains text-xs font-bold tabular-nums ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                      {unconfirmedPRL.toFixed(4)} PRL
                    </span>
                  </div>

                  {/* Rank 3: Pagos */}
                  <div className={`flex items-center justify-between p-2.5 rounded-2xl border transition-colors ${
                    isLight ? 'bg-slate-50/80 border-slate-100' : 'bg-[#06080D] border-white/[0.04]'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-white font-jetbrains text-xs font-bold">
                        3
                      </div>
                      <div>
                        <span className={`font-rajdhani text-xs font-bold block ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          Total Pagado (Kryptex)
                        </span>
                        <div className="flex gap-0.5 mt-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className="h-2.5 w-2.5 fill-[#05DF72] text-[#05DF72]" />
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="font-jetbrains text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {(payoutStats?.paid ?? 0).toFixed(2)} PRL
                    </span>
                  </div>

                  {/* Rank 4: Hashrate Rate */}
                  <div className={`flex items-center justify-between p-2.5 rounded-2xl border transition-colors ${
                    isLight ? 'bg-slate-50/80 border-slate-100' : 'bg-[#06080D] border-white/[0.04]'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-white font-jetbrains text-xs font-bold">
                        4
                      </div>
                      <div>
                        <span className={`font-rajdhani text-xs font-bold block ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          Hashrate Pool Reportado
                        </span>
                        <div className="flex gap-0.5 mt-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className="h-2.5 w-2.5 fill-[#05DF72] text-[#05DF72]" />
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="font-jetbrains text-xs font-bold text-cyan-400 tabular-nums">
                      {summary.totalHashrateTHs.toFixed(1)} TH/s
                    </span>
                  </div>

                </div>
              </div>

              {/* Payout Progress at bottom of Card B */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className={`font-rajdhani text-[11px] font-bold uppercase ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                    Progreso Umbral de Pago
                  </span>
                  <span className="font-jetbrains font-bold text-[#05DF72] tabular-nums text-xs">
                    {payoutProgressPct.toFixed(1)}%
                  </span>
                </div>
                <div className={`h-2 w-full rounded-full overflow-hidden p-0.5 ${isLight ? 'bg-slate-100' : 'bg-white/[0.08]'}`}>
                  <div 
                    className="h-full rounded-full bg-[#05DF72] transition-all duration-500 shadow-xs"
                    style={{ width: `${Math.min(100, Math.max(2, payoutProgressPct))}%` }}
                  />
                </div>
                <div className={`mt-1.5 flex justify-between items-center text-[10px] font-jetbrains ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  <span>Mínimo: {payoutThreshold} PRL</span>
                  <span>Restante: {remainingPRL.toFixed(4)} PRL</span>
                </div>
              </div>

              {walletAddress && (
                <a
                  href={`https://pool.kryptex.com/${(poolInfo.ticker || 'prl').toLowerCase()}/miner/${walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-rajdhani font-bold border transition-all ${
                    isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border-white/[0.06]'
                  }`}
                >
                  <CreditCard className="h-3 w-3 text-[#05DF72]" />
                  <span>Explorador Kryptex Pool</span>
                  <ExternalLink className="h-3 w-3 text-[#05DF72]" />
                </a>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* 3. CALIDAD DE SHARES KRYPTEX */}
      <div className={`rounded-3xl border p-5 sm:p-6 transition-all ${
        isLight ? 'bg-white border-slate-200/90 shadow-xs hover:shadow-md text-slate-900' : 'border-white/10 bg-[#080B11]/90 backdrop-blur-xl shadow-xl text-white'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#05DF72]" />
            <h3 className={`font-rajdhani text-base font-bold uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Calidad de Shares Kryptex
            </h3>
          </div>
          <span className={`font-jetbrains text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Ciclo Actual
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <div className={`rounded-2xl border p-3.5 ${
            isLight ? 'bg-emerald-50/70 border-emerald-200' : 'border-emerald-500/20 bg-emerald-500/[0.05]'
          }`}>
            <span className="font-rajdhani text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase block">Válidos</span>
            <span className={`font-jetbrains text-xl font-bold tabular-nums mt-1 block ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {summary.totalValidShares.toLocaleString()}
            </span>
          </div>
          <div className={`rounded-2xl border p-3.5 ${
            isLight ? 'bg-amber-50/70 border-amber-200' : 'border-amber-500/20 bg-amber-500/[0.05]'
          }`}>
            <span className="font-rajdhani text-[11px] font-bold text-amber-500 uppercase block">Stale</span>
            <span className={`font-jetbrains text-xl font-bold tabular-nums mt-1 block ${isLight ? 'text-slate-900' : 'text-amber-300'}`}>
              {summary.totalStaleShares || 0}
            </span>
          </div>
          <div className={`rounded-2xl border p-3.5 ${
            isLight ? 'bg-rose-50/70 border-rose-200' : 'border-rose-500/20 bg-rose-500/[0.05]'
          }`}>
            <span className="font-rajdhani text-[11px] font-bold text-rose-500 uppercase block">Inválidos</span>
            <span className="font-jetbrains text-xl font-bold text-rose-500 tabular-nums mt-1 block">
              {summary.totalInvalidShares || 0}
            </span>
          </div>
        </div>

        {(() => {
          const totalFleetShares = summary.totalValidShares + (summary.totalStaleShares || 0) + (summary.totalInvalidShares || 0);
          const realRejectionRate = totalFleetShares > 0
            ? (((summary.totalStaleShares || 0) + (summary.totalInvalidShares || 0)) / totalFleetShares * 100).toFixed(2)
            : '0.00';
          return (
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Valor estimado por share válido: <strong className="font-jetbrains text-[#05DF72] tabular-nums">${summary.estPayPerValidShareUSD.toFixed(7)} USD</strong>.
                Tasa de rechazo calculada: <strong className={`font-jetbrains tabular-nums ${isLight ? 'text-slate-900' : 'text-white'}`}>{realRejectionRate}%</strong> ({summary.totalStaleShares || 0} stale de {totalFleetShares} shares totales).
              </p>
              <span className={`text-[11px] font-jetbrains text-slate-400 shrink-0`}>
                Sincronización: {summary.lastUpdated || 'En vivo'}
              </span>
            </div>
          );
        })()}
      </div>

      {/* 5. HISTORIAL DE PRODUCCIÓN CRIPTO POR CICLO */}
      <div className={`rounded-3xl border p-5 sm:p-6 space-y-5 transition-all ${
        isLight ? 'bg-white border-slate-200/90 shadow-sm hover:shadow-md text-slate-900' : 'border-white/10 bg-[#080B11]/90 backdrop-blur-xl shadow-xl text-white'
      }`}>
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 ${borderDivider}`}>
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#05DF72]" />
              <h3 className={`font-rajdhani text-base font-bold uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Producción Cripto & Minado por Ciclo
              </h3>
              <span className="text-[10px] font-rajdhani font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-[#05DF72] border border-emerald-500/20">
                Billetera: {poolInfo.ticker || 'PRL'}
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Telemetría real de potencia y cripto producida por cada ciclo de minado registrado
            </p>
          </div>

          <div className={`flex items-center gap-2 text-xs font-jetbrains px-3 py-1.5 rounded-xl border ${
            isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-black/40 border-white/10 text-slate-300'
          }`}>
            <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Billetera Conectada:</span>
            <span className="font-bold text-[#05DF72] truncate max-w-[160px] sm:max-w-[220px]">
              {poolInfo.ticker || 'PRL'} • {totalMinedPRL.toFixed(4)} {poolInfo.ticker || 'PRL'}
            </span>
          </div>
        </div>

        {/* Dynamic Area Chart: Cripto Mined per Cycle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold flex items-center gap-2 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              <TrendingUp className="w-4 h-4 text-[#05DF72]" />
              Curva de Criptomoneda Minada por Ciclo (Producción Bruta & Margen Neto)
            </span>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-[#05DF72]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#05DF72]" /> Cripto Producida ($ USD)
              </span>
              <span className={`flex items-center gap-1.5 ${isLight ? 'text-emerald-700' : 'text-[#00F0FF]'}`}>
                <span className={`w-2.5 h-2.5 rounded-sm ${isLight ? 'bg-emerald-700' : 'bg-[#00F0FF]'}`} /> Ganancia Neta ($ USD)
              </span>
            </div>
          </div>

          <div className={`h-64 w-full rounded-2xl border p-2 transition-colors ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#06080E] border-white/[0.06]'
          }`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cyclesChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCycleCrypto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#05DF72" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#05DF72" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorCycleNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isLight ? '#059669' : '#00F0FF'} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={isLight ? '#059669' : '#00F0FF'} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#e2e8f0' : '#ffffff10'} vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(val) => `$${val}`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className={`border p-3 rounded-2xl shadow-xl text-xs space-y-1 font-mono ${
                          isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#0D1322] border-white/[0.15] text-white'
                        }`}>
                          <div className={`font-bold text-sm mb-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>{data.id} ({label})</div>
                          <div className={isLight ? 'text-slate-500' : 'text-slate-400'}>Fecha: {data.date}</div>
                          <div className={isLight ? 'text-slate-500' : 'text-slate-400'}>Duración: {data.durationHours}h • Potencia: {data.hashrateTHs} TH/s</div>
                          <div className="text-[#05DF72] font-semibold">
                            Cripto Generada: {data.cryptoProduced} {data.currency} (${data.grossRevenueUSD.toFixed(2)} USD)
                          </div>
                          <div className={`font-bold border-t pt-1 ${isLight ? 'border-slate-100 text-emerald-700' : 'border-white/[0.1] text-[#00F0FF]'}`}>
                            Ganancia Neta: +${data.netProfitUSD.toFixed(2)} USD
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="grossRevenueUSD" stroke="#05DF72" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCycleCrypto)" />
                <Area type="monotone" dataKey="netProfitUSD" stroke={isLight ? '#059669' : '#00F0FF'} strokeWidth={2} fillOpacity={1} fill="url(#colorCycleNet)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Wallet & Real Mining Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className={`p-3.5 rounded-2xl border transition-colors ${
            isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#06080D] border-white/[0.08] text-white'
          }`}>
            <span className={`text-[11px] font-mono block uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Balance en Wallet ({poolInfo.ticker || 'PRL'})</span>
            <div className={`text-lg font-bold font-mono mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {totalMinedPRL.toFixed(4)} <span className="text-xs text-[#05DF72]">{poolInfo.ticker || 'PRL'}</span>
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 block">
              Confirmado: {confirmedPRL.toFixed(4)}
            </span>
          </div>

          <div className={`p-3.5 rounded-2xl border transition-colors ${
            isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#06080D] border-cyan-500/20 text-white'
          }`}>
            <span className={`text-[11px] font-mono block uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Progreso Umbral</span>
            <div className="text-lg font-bold font-mono text-[#05DF72] mt-1">
              {payoutProgressPct.toFixed(1)}%
            </div>
            <span className={`text-[10px] font-mono mt-0.5 block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Mínimo: {payoutThreshold} {poolInfo.ticker || 'PRL'}
            </span>
          </div>

          <div className={`p-3.5 rounded-2xl border transition-colors ${
            isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#06080D] border-white/[0.08] text-white'
          }`}>
            <span className={`text-[11px] font-mono block uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Horas Totales Minadas</span>
            <div className={`text-lg font-bold font-mono mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {totalCycleHours.toFixed(1)} hrs
            </div>
            <span className={`text-[10px] font-mono mt-0.5 block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {cycles.length} ciclos auditados
            </span>
          </div>

          <div className={`p-3.5 rounded-2xl border transition-colors ${
            isLight ? 'bg-emerald-50/70 border-emerald-200 text-slate-900' : 'bg-emerald-950/20 border-emerald-500/30 text-white'
          }`}>
            <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300 block uppercase">Utilidad Neta de Ciclos</span>
            <div className="text-lg font-bold font-mono text-[#05DF72] mt-1">
              +${totalCycleNetUSD.toFixed(2)} <span className="text-xs text-emerald-600 dark:text-emerald-400">USD</span>
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 block">
              {totalCycleHours > 0 ? `+$${(totalCycleNetUSD / totalCycleHours).toFixed(3)} USD/h prom.` : 'Auditoría 100% USD'}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
};
