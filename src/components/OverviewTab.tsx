import React, { useState, useEffect, useMemo } from 'react';
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
  ExternalLink
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
}) => {
  // Timeframe selector for cashflow KPIs: 'hour' | 'day' | 'month'
  const [timeframe, setTimeframe] = useState<'hour' | 'day' | 'month'>('hour');
  // Chart visual toggle: 'hashrate' | 'cashflow'
  const [chartMode, setChartMode] = useState<'hashrate' | 'cashflow'>('hashrate');

  // Global fleet breakeven TH/s calculation con auditoría de fricción real (4.56% de spread Kryptex y liquidación SPEI)
  const fleetBreakevenTHs = useMemo(() => {
    if (!summary.hourlySaladCostUSD || summary.hourlySaladCostUSD <= 0) return 0;
    return calculateBreakEvenTHs(summary.hourlySaladCostUSD, BASELINE_USD_PER_THS_HOUR, true);
  }, [summary.hourlySaladCostUSD]);

  // Mining cycles data for area chart
  const [cycles, setCycles] = useState<MiningCycle[]>([]);

  useEffect(() => {
    fetch('/api/mining/cycles')
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

  // --------------------------------------------------------------------------
  // EMPTY / ZERO-STATE ONBOARDING BANNER (When no accounts or wallet connected)
  // --------------------------------------------------------------------------
  if (workers.length === 0 && summary.totalAllocatedGPUs === 0) {
    return (
      <div className="space-y-6 pb-24 md:pb-12 animate-in fade-in duration-300">
        {/* Tactical Onboarding Terminal */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#080B11]/90 p-6 sm:p-8 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.7)]">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#05F292] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#05F292]"></span>
                </span>
                <span className="font-rajdhani text-sm font-bold uppercase tracking-wider text-emerald-400">
                  MinerX Telemetry Hub • Modo Datos en Vivo
                </span>
              </div>
              <h2 className="font-rajdhani text-2xl sm:text-3xl font-extrabold text-white tracking-wide">
                Terminal de Control & Vigilancia de Flota
              </h2>
              <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                El sistema está listo para vigilar tus GPUs de <span className="text-cyan-400 font-semibold">SaladCloud</span> y contrastar los shares válidos en el pool de <span className="text-emerald-400 font-semibold">Kryptex (Pearl PRL)</span>. Conecta tus credenciales para activar la telemetría en tiempo real y el protector contra la lotería de silicio.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onNavigateToApis}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-3 text-sm font-rajdhani font-bold text-black uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(5,242,146,0.3)]"
              >
                <Sparkles className="h-4 w-4" />
                <span>Conectar APIs & Wallet</span>
              </button>
            </div>
          </div>
        </div>

        {/* Informative Bento Quick Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#0C101A]/80 p-5 backdrop-blur-xl">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <DollarSign className="h-5 w-5" />
            </div>
            <h3 className="font-rajdhani text-lg font-bold text-white uppercase">Protección de Capital</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Monitorea el costo en USD de cada contenedor de Salad contra las recompensas de Kryptex para evitar quemar capital.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0C101A]/80 p-5 backdrop-blur-xl">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4">
              <RefreshCw className="h-5 w-5" />
            </div>
            <h3 className="font-rajdhani text-lg font-bold text-white uppercase">Reasignación 1-Click</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Descarta nodos de silicio defectuosos con menos del 80% de rendimiento invocando la API oficial de SaladCloud.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0C101A]/80 p-5 backdrop-blur-xl">
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <h3 className="font-rajdhani text-lg font-bold text-white uppercase">Vigilante Autónomo 24/7</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
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
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#05F292] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#05F292]"></span>
          </div>
          <span className="font-rajdhani text-sm font-bold uppercase tracking-wider text-slate-200">
            Telemetría de Red • <span className="text-emerald-400">Pearl PRL Kryptex Pool</span>
          </span>
          <span className="hidden sm:inline-block text-[11px] font-jetbrains text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/10">
            Dificultad: {summary.networkDifficulty || 'Auto PPS'}
          </span>
        </div>

        {/* Timeframe Control (1h / 24h / 30d) */}
        <div className="flex items-center gap-1 self-start sm:self-auto rounded-xl border border-white/10 bg-[#0A0D15]/90 p-1 shadow-inner backdrop-blur-md">
          <button
            onClick={() => setTimeframe('hour')}
            className={`rounded-lg px-2.5 py-1 text-xs font-rajdhani font-bold transition-all ${
              timeframe === 'hour'
                ? 'bg-emerald-500/20 text-[#05F292] border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            1 HORA
          </button>
          <button
            onClick={() => setTimeframe('day')}
            className={`rounded-lg px-2.5 py-1 text-xs font-rajdhani font-bold transition-all ${
              timeframe === 'day'
                ? 'bg-emerald-500/20 text-[#05F292] border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            24 HORAS
          </button>
          <button
            onClick={() => setTimeframe('month')}
            className={`rounded-lg px-2.5 py-1 text-xs font-rajdhani font-bold transition-all ${
              timeframe === 'month'
                ? 'bg-emerald-500/20 text-[#05F292] border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            30 DÍAS
          </button>
        </div>
      </div>

      {/* 2. TOP ROW: 3 KEY PERFORMANCE INDICATOR (KPI) BENTO CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* KPI 1: RENTABILIDAD NETA (hourlyNetProfitUSD) */}
        <div 
          className={`relative overflow-hidden rounded-2xl border p-5 backdrop-blur-xl transition-all duration-300 ${
            isNetProfitable
              ? 'bg-gradient-to-b from-[#081512]/90 to-[#06090F]/95 border-emerald-500/30 shadow-[0_10px_30px_rgba(5,242,146,0.12)]'
              : 'bg-gradient-to-b from-[#180A0E]/90 to-[#06090F]/95 border-rose-500/30 shadow-[0_10px_30px_rgba(255,42,85,0.15)]'
          }`}
        >
          {/* Subtle Ambient Glow */}
          <div 
            className={`absolute -top-12 -right-12 h-32 w-32 rounded-full blur-2xl pointer-events-none ${
              isNetProfitable ? 'bg-emerald-500/15' : 'bg-rose-500/20'
            }`} 
          />

          <div className="flex items-center justify-between gap-2 relative z-10">
            <span className="font-rajdhani text-xs font-bold uppercase tracking-wider text-slate-300">
              Rentabilidad Neta ({timeframe === 'hour' ? '1h' : timeframe === 'day' ? '24h' : '30d'})
            </span>
            <div 
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-rajdhani font-extrabold uppercase border ${
                !isNetProfitable
                  ? 'bg-rose-500/15 text-[#FF2A55] border-rose-500/30'
                  : isNearBreakeven
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/15 text-[#05F292] border-emerald-500/30'
              }`}
            >
              {!isNetProfitable ? (
                <>
                  <TrendingDown className="h-3 w-3" />
                  <span>Quema Capital</span>
                </>
              ) : isNearBreakeven ? (
                <>
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                  <span>Margen Ajustado</span>
                </>
              ) : (
                <>
                  <TrendingUp className="h-3 w-3" />
                  <span>ROI Positivo</span>
                </>
              )}
            </div>
          </div>

          {/* Primary Value with font-jetbrains */}
          <div className="mt-3 flex items-baseline gap-2 relative z-10">
            <span 
              className={`font-jetbrains text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums ${
                isNetProfitable ? 'text-[#05F292] drop-shadow-[0_0_12px_rgba(5,242,146,0.4)]' : 'text-[#FF2A55] drop-shadow-[0_0_12px_rgba(255,42,85,0.4)]'
              }`}
            >
              {currentNetProfit >= 0 ? '+' : ''}${currentNetProfit.toFixed(3)}
            </span>
            <span className="font-rajdhani text-xs font-semibold text-slate-400 uppercase">
              USD / {timeframe === 'hour' ? 'hr' : timeframe === 'day' ? 'día' : 'mes'}
            </span>
          </div>

          {/* Breakdown: Gross Rev vs Rental Cost */}
          <div className="mt-4 pt-3 border-t border-white/[0.08] grid grid-cols-2 gap-2 text-xs relative z-10">
            <div>
              <span className="text-[11px] text-slate-400 block">Ingreso Bruto:</span>
              <span className="font-jetbrains font-bold text-white tabular-nums">
                +${currentGrossRevenue.toFixed(3)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">Costo Salad:</span>
              <span className="font-jetbrains font-bold text-rose-400 tabular-nums">
                -${currentRentalCost.toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        {/* KPI 2: EFICIENCIA DE FLOTA (fleetEfficiencyPct) CON INDICADOR CIRCULAR */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#0C101A]/90 to-[#06090F]/95 p-5 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-rajdhani text-xs font-bold uppercase tracking-wider text-slate-300">
              Eficiencia de Flota
            </span>
            <span 
              className="text-[10px] font-rajdhani font-bold px-2 py-0.5 rounded-full border"
              style={{
                color: efficiencyColor,
                backgroundColor: `${efficiencyColor}18`,
                borderColor: `${efficiencyColor}40`
              }}
            >
              {efficiencyPct >= 90 ? 'Saludable' : efficiencyPct >= 75 ? 'Atención' : 'Crítico'}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span 
                  className="font-jetbrains text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums"
                  style={{ color: efficiencyColor }}
                >
                  {efficiencyPct.toFixed(1)}%
                </span>
              </div>
              <p className="font-rajdhani text-xs text-slate-400 mt-1 uppercase font-semibold">
                Vs Benchmark Teórico
              </p>
            </div>

            {/* SVG Circular Progress Ring */}
            <div className="relative h-16 w-16 flex-shrink-0 flex items-center justify-center">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                {/* Background Track */}
                <path
                  className="text-white/10"
                  strokeWidth="3.2"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                {/* Dynamic Stroke */}
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
                <Cpu className="h-4 w-4 text-slate-300" />
              </div>
            </div>
          </div>

          {/* Secondary stats */}
          <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs">
            <span className="text-slate-400">
              GPUs Activas: <strong className="font-jetbrains text-white tabular-nums">{summary.activeMiningGPUs}</strong> de <span className="font-jetbrains text-slate-300">{summary.totalAllocatedGPUs}</span>
            </span>
            {summary.underperformingGPUs > 0 && (
              <span className="font-rajdhani font-bold text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                <span className="font-jetbrains tabular-nums">{summary.underperformingGPUs}</span> Bajo TH/s
              </span>
            )}
          </div>
        </div>

        {/* KPI 3: POTENCIA TOTAL (totalHashrateTHs) CON SPARKLINE DE FONDO */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#0C101A]/90 to-[#06090F]/95 p-5 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex flex-col justify-between">
          
          {/* Background SVG Sparkline Fluid Effect */}
          <div className="absolute right-0 bottom-2 w-44 h-16 opacity-35 pointer-events-none">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 160 48">
              <defs>
                <linearGradient id="kpiSparklineGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#05F292" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {sparklineSvgPath && (
                <>
                  <path
                    d={sparklineSvgPath}
                    fill="none"
                    stroke="#00E5FF"
                    strokeWidth="2.5"
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
            <span className="font-rajdhani text-xs font-bold uppercase tracking-wider text-slate-300">
              Potencia Total de Minado
            </span>
            <div className="flex items-center gap-1 text-[10px] font-rajdhani font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
              <Zap className="h-3 w-3 text-cyan-400" />
              <span>PearlHash</span>
            </div>
          </div>

          {/* Primary Hashrate with font-jetbrains */}
          <div className="mt-3 relative z-10">
            <div className="flex items-baseline gap-2">
              <span className="font-jetbrains text-3xl sm:text-4xl font-extrabold text-white tracking-tight tabular-nums drop-shadow-[0_0_15px_rgba(0,229,255,0.3)]">
                {summary.totalHashrateTHs.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <span className="font-rajdhani text-sm font-bold text-cyan-400 uppercase">
                TH/s
              </span>
            </div>
            <p className="font-rajdhani text-xs text-slate-400 mt-1 uppercase font-semibold">
              Teórico Silicio: <span className="font-jetbrains font-bold text-slate-200 tabular-nums">{summary.benchmarkHashrateTHs.toFixed(1)} TH/s</span>
            </p>
          </div>

          {/* Secondary stats: Safety distance to Break-even */}
          <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs relative z-10">
            <span className="text-slate-400">
              Punto de Equilibrio:
            </span>
            <span className="font-jetbrains font-bold text-amber-300 tabular-nums">
              {fleetBreakevenTHs.toFixed(1)} TH/s
            </span>
          </div>
        </div>
      </div>

      {/* 3. CENTRAL BENTO SECTION: RECHARTS 24H AREA CHART + KRYPTEX BALANCE CARD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* MAIN RECHARTS AREA (8 COLS ON DESKTOP) */}
        <div className="lg:col-span-8 rounded-2xl border border-white/10 bg-[#080B11]/90 p-5 sm:p-6 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex flex-col justify-between">
          
          {/* Header of Area Chart */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                <h3 className="font-rajdhani text-base font-bold text-white uppercase tracking-wider">
                  {chartMode === 'hashrate' ? 'Potencia de Hashrate vs Tiempo (24h)' : 'Flujo de Caja Real (USD/h)'}
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {chartMode === 'hashrate' 
                  ? 'Telemetría histórica con detección visual de umbral de rentabilidad'
                  : 'Rendimiento neto en USD por hora contra tarifa de alquiler'}
              </p>
            </div>

            {/* Mode Toggle */}
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#06080D] p-1 self-start sm:self-auto">
              <button
                onClick={() => setChartMode('hashrate')}
                className={`rounded-lg px-2.5 py-1 text-xs font-rajdhani font-bold transition-all ${
                  chartMode === 'hashrate'
                    ? 'bg-gradient-to-r from-cyan-500/25 to-emerald-500/25 text-white border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Hashrate (TH/s)
              </button>
              <button
                onClick={() => setChartMode('cashflow')}
                className={`rounded-lg px-2.5 py-1 text-xs font-rajdhani font-bold transition-all ${
                  chartMode === 'cashflow'
                    ? 'bg-gradient-to-r from-emerald-500/25 to-cyan-500/25 text-white border border-emerald-500/40 shadow-sm'
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
                    {/* DYNAMIC LINEAR GRADIENT THAT CHANGES ACCORDING TO PROFITABILITY THRESHOLD */}
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

                  {/* Reference line for the break-even threshold */}
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
                /* CASHFLOW RECHARTS VIEW */
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

        {/* SIDE BENTO CARD: KRYPTEX BALANCE & PAYOUT PROGRESS (4 COLS ON DESKTOP) */}
        <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#080B11]/90 p-5 sm:p-6 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-cyan-400" />
                <h3 className="font-rajdhani text-base font-bold text-white uppercase tracking-wider">
                  Balance Kryptex (PRL)
                </h3>
              </div>
              <span className="font-rajdhani text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                PoUW Pearl
              </span>
            </div>

            {/* Total balance in Pearl */}
            <div className="rounded-xl border border-white/[0.08] bg-[#06080D] p-4">
              <span className="font-rajdhani text-xs font-semibold text-slate-400 uppercase block">
                Balance Acumulado Total
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-jetbrains text-2xl sm:text-3xl font-extrabold text-white tabular-nums tracking-tight">
                  {totalMinedPRL.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                </span>
                <span className="font-rajdhani text-xs font-bold text-cyan-400 uppercase">
                  {poolInfo.ticker || 'PRL'}
                </span>
              </div>
              
              <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[11px] text-slate-400 block">Confirmado:</span>
                  <span className="font-jetbrains font-bold text-[#05F292] tabular-nums">
                    {confirmedPRL.toFixed(4)} {poolInfo.ticker || 'PRL'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Inmaduro:</span>
                  <span className="font-jetbrains font-bold text-slate-300 tabular-nums">
                    {unconfirmedPRL.toFixed(4)} {poolInfo.ticker || 'PRL'}
                  </span>
                </div>
              </div>
            </div>

            {/* Payout Progress to Minimum Threshold */}
            <div className="mt-4 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-rajdhani font-semibold text-slate-300 uppercase">
                  Progreso Umbral de Pago
                </span>
                <span className="font-jetbrains font-bold text-cyan-400 tabular-nums">
                  {payoutProgressPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/[0.08] overflow-hidden p-0.5">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500 shadow-[0_0_8px_rgba(0,229,255,0.5)]"
                  style={{ width: `${Math.min(100, Math.max(2, payoutProgressPct))}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] font-jetbrains text-slate-400">
                <span>Mínimo: {payoutThreshold} {poolInfo.ticker || 'PRL'}</span>
                <span>Restante: {remainingPRL.toFixed(4)} {poolInfo.ticker || 'PRL'}</span>
              </div>
            </div>
          </div>

          {/* Quick Pool Stats Footer */}
          <div className="mt-5 pt-4 border-t border-white/[0.08] space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Tasa PPS Est.:</span>
              <span className="font-jetbrains font-bold text-emerald-400 tabular-nums">
                ${BASELINE_USD_PER_THS_HOUR.toFixed(7)} / TH/h
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Recompensa Bloque:</span>
              <span className="font-jetbrains font-bold text-slate-200 tabular-nums">
                {poolInfo.block_reward ? `${poolInfo.block_reward.toFixed(1)} PRL` : '-- PRL'}
              </span>
            </div>
          </div>

          {/* Kryptex Historical Payouts & Reward Stats (Live API) */}
          <div className="mt-4 pt-4 border-t border-white/[0.08]">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-rajdhani text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-[#05F292]" />
                Historial de Pagos Kryptex
              </span>
              <span className="text-[10px] font-rajdhani text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                Live Stats
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-black/40 border border-white/[0.04] p-2.5">
                <span className="text-[10px] text-slate-400 block uppercase font-rajdhani font-semibold">Total Pagado</span>
                <span className="font-jetbrains font-bold text-[#05F292] text-sm tabular-nums">
                  {(payoutStats?.paid ?? 0).toFixed(4)} <span className="text-[10px] text-slate-400 font-normal">{poolInfo.ticker || 'PRL'}</span>
                </span>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/[0.04] p-2.5">
                <span className="text-[10px] text-slate-400 block uppercase font-rajdhani font-semibold">Pendiente Pago</span>
                <span className="font-jetbrains font-bold text-cyan-300 text-sm tabular-nums">
                  {(payoutStats?.unpaid ?? 0).toFixed(4)} <span className="text-[10px] text-slate-400 font-normal">{poolInfo.ticker || 'PRL'}</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs mt-2">
              <div className="rounded-lg bg-black/40 border border-white/[0.04] p-2">
                <span className="text-[10px] text-slate-400 block font-rajdhani">Recompensa 7d (Semana):</span>
                <span className="font-jetbrains font-semibold text-slate-200 tabular-nums">
                  {(payoutStats?.reward?.week ?? 0).toFixed(4)} {poolInfo.ticker || 'PRL'}
                </span>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/[0.04] p-2">
                <span className="text-[10px] text-slate-400 block font-rajdhani">Recompensa 30d (Mes):</span>
                <span className="font-jetbrains font-semibold text-slate-200 tabular-nums">
                  {(payoutStats?.reward?.month ?? 0).toFixed(4)} {poolInfo.ticker || 'PRL'}
                </span>
              </div>
            </div>

            {walletAddress && (
              <a
                href={`https://pool.kryptex.com/${(poolInfo.ticker || 'prl').toLowerCase()}/miner/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-rajdhani font-bold text-slate-300 hover:text-white border border-white/[0.06] transition-all"
              >
                <span>Ver en Explorador Kryptex Pool</span>
                <ExternalLink className="h-3 w-3 text-cyan-400" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 4. BOTTOM BENTO SECTION: ACTIONABLE SILICON LOTTERY & QUICK FLEET TABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* CRITICAL / UNDERPERFORMING WORKERS CALLOUT (7 COLS) */}
        <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#080B11]/90 p-5 sm:p-6 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              <h3 className="font-rajdhani text-base font-bold text-white uppercase tracking-wider">
                Vigilancia Silicio & Reasignación Inmediata
              </h3>
            </div>
            <button
              onClick={onNavigateToFleet}
              className="text-xs font-rajdhani font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 uppercase transition-colors"
            >
              <span>Ver Flota ({workers.length})</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {problematicWorkers.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-300">
                Se han detectado <span className="font-jetbrains font-bold text-rose-400 tabular-nums">{problematicWorkers.length}</span> nodo(s) rindiendo por debajo del umbral del 80% o sin enviar shares:
              </p>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {problematicWorkers.map((w) => (
                  <div 
                    key={w.id} 
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3 hover:border-rose-500/40 transition-all"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-rajdhani font-bold text-white text-sm">
                          {w.workerName}
                        </span>
                        <span className="font-jetbrains text-[10px] text-slate-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
                          {w.gpuModel}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-400 font-jetbrains">
                        <span>Actual: <strong className="text-rose-400 tabular-nums">{w.currentHashrateTHs.toFixed(1)} TH/s</strong></span>
                        <span>Esperado: <strong className="text-slate-300 tabular-nums">{w.expectedBenchmarkTHs.toFixed(1)} TH/s</strong></span>
                        <span className="text-rose-400 font-bold tabular-nums">({w.performanceRatioPct.toFixed(0)}%)</span>
                      </div>
                    </div>

                    <button
                      onClick={() => onOpenReallocate(w)}
                      className="self-start sm:self-auto flex items-center gap-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 px-3 py-1.5 text-xs font-rajdhani font-bold text-white uppercase tracking-wider transition-all shadow-[0_0_12px_rgba(255,42,85,0.4)]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Reasignar Nodo</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-white/[0.06] bg-[#06080D]">
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2 shadow-[0_0_15px_rgba(5,242,146,0.2)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h4 className="font-rajdhani font-bold text-white text-sm uppercase">Flota en Rendimiento Óptimo</h4>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Todas las GPUs asignadas en SaladCloud están entregando más del 80% de su benchmark de silicio y enviando shares estables.
              </p>
            </div>
          )}
        </div>

        {/* SHARES TELEMETRY & POOL HEALTH (5 COLS) */}
        <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#080B11]/90 p-5 sm:p-6 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-cyan-400" />
                <h3 className="font-rajdhani text-base font-bold text-white uppercase tracking-wider">
                  Calidad de Shares Kryptex
                </h3>
              </div>
              <span className="font-jetbrains text-xs text-slate-400">
                Ciclo Actual
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
                <span className="font-rajdhani text-[11px] font-bold text-emerald-400 uppercase block">Válidos</span>
                <span className="font-jetbrains text-xl font-bold text-white tabular-nums mt-1 block">
                  {summary.totalValidShares.toLocaleString()}
                </span>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
                <span className="font-rajdhani text-[11px] font-bold text-amber-400 uppercase block">Stale</span>
                <span className="font-jetbrains text-xl font-bold text-amber-300 tabular-nums mt-1 block">
                  {summary.totalStaleShares || 0}
                </span>
              </div>
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3">
                <span className="font-rajdhani text-[11px] font-bold text-rose-400 uppercase block">Inválidos</span>
                <span className="font-jetbrains text-xl font-bold text-rose-400 tabular-nums mt-1 block">
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
                <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                  Valor estimado por share válido: <strong className="font-jetbrains text-emerald-400 tabular-nums">${summary.estPayPerValidShareUSD.toFixed(7)} USD</strong>.
                  Tasa de rechazo calculada: <strong className="font-jetbrains text-white tabular-nums">{realRejectionRate}%</strong> ({summary.totalStaleShares || 0} stale de {totalFleetShares} shares totales).
                </p>
              );
            })()}
          </div>

          <div className="mt-4 pt-4 border-t border-white/[0.08] flex items-center justify-between text-xs">
            <span className="text-slate-400">Última sincronización:</span>
            <span className="font-jetbrains text-slate-300 tabular-nums">{summary.lastUpdated || 'En vivo'}</span>
          </div>
        </div>

      </div>

      {/* 5. HISTORIAL DE PRODUCCIÓN CRIPTO POR CICLO (ÁREA CON DEGRADADOS) */}
      <div className="rounded-2xl border border-white/10 bg-[#080B11]/90 p-5 sm:p-6 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#05F292]" />
              <h3 className="font-rajdhani text-base font-bold text-white uppercase tracking-wider">
                Producción Cripto & Minado por Ciclo
              </h3>
              <span className="text-[10px] font-rajdhani font-bold px-2 py-0.5 rounded-full bg-[#05F292]/10 text-[#05F292] border border-[#05F292]/20">
                Billetera: {poolInfo.ticker || 'PRL'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Telemetría real de potencia y cripto producida por cada ciclo de minado registrado
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-jetbrains text-slate-300 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10">
            <span className="text-slate-500">Billetera Conectada:</span>
            <span className="font-bold text-[#00F0FF] truncate max-w-[160px] sm:max-w-[220px]">
              {poolInfo.ticker || 'PRL'} • {totalMinedPRL.toFixed(4)} {poolInfo.ticker || 'PRL'}
            </span>
          </div>
        </div>

        {/* Dynamic Area Chart: Cripto Mined per Cycle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#05F292]" />
              Curva de Criptomoneda Minada por Ciclo (Producción Bruta & Margen Neto)
            </span>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-[#05F292]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#05F292]" /> Cripto Producida ($ USD)
              </span>
              <span className="flex items-center gap-1.5 text-[#00F0FF]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#00F0FF]" /> Ganancia Neta ($ USD)
              </span>
            </div>
          </div>

          <div className="h-64 w-full bg-[#06080E] rounded-xl border border-white/[0.06] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cyclesChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCycleCrypto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#05F292" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#05F292" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorCycleNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#00F0FF" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(val) => `$${val}`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#0D1322] border border-white/[0.15] p-3 rounded-xl shadow-2xl text-xs space-y-1 font-mono">
                          <div className="font-bold text-white text-sm mb-1">{data.id} ({label})</div>
                          <div className="text-slate-400">Fecha: {data.date}</div>
                          <div className="text-slate-400">Duración: {data.durationHours}h • Potencia: {data.hashrateTHs} TH/s</div>
                          <div className="text-[#05F292] font-semibold">
                            Cripto Generada: {data.cryptoProduced} {data.currency} (${data.grossRevenueUSD.toFixed(2)} USD)
                          </div>
                          <div className="text-[#00F0FF] font-bold border-t border-white/[0.1] pt-1">
                            Ganancia Neta: +${data.netProfitUSD.toFixed(2)} USD
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="grossRevenueUSD" stroke="#05F292" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCycleCrypto)" />
                <Area type="monotone" dataKey="netProfitUSD" stroke="#00F0FF" strokeWidth={2} fillOpacity={1} fill="url(#colorCycleNet)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Wallet & Real Mining Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-[#06080D] border border-white/[0.08]">
            <span className="text-[11px] font-mono-num text-slate-400 block uppercase">Balance en Wallet ({poolInfo.ticker || 'PRL'})</span>
            <div className="text-lg font-bold font-mono text-white mt-1">
              {totalMinedPRL.toFixed(4)} <span className="text-xs text-cyan-400">{poolInfo.ticker || 'PRL'}</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono mt-0.5 block">
              Confirmado: {confirmedPRL.toFixed(4)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#06080D] border border-cyan-500/20">
            <span className="text-[11px] font-mono-num text-slate-400 block uppercase">Progreso Umbral</span>
            <div className="text-lg font-bold font-mono text-cyan-300 mt-1">
              {payoutProgressPct.toFixed(1)}%
            </div>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
              Mínimo: {payoutThreshold} {poolInfo.ticker || 'PRL'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#06080D] border border-white/[0.08]">
            <span className="text-[11px] font-mono-num text-slate-400 block uppercase">Horas Totales Minadas</span>
            <div className="text-lg font-bold font-mono text-white mt-1">
              {totalCycleHours.toFixed(1)} hrs
            </div>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
              {cycles.length} ciclos auditados
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
            <span className="text-[11px] font-mono-num text-emerald-300 block uppercase">Utilidad Neta de Ciclos</span>
            <div className="text-lg font-bold font-mono text-[#05F292] mt-1">
              +${totalCycleNetUSD.toFixed(2)} <span className="text-xs text-emerald-400">USD</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono mt-0.5 block">
              {totalCycleHours > 0 ? `+$${(totalCycleNetUSD / totalCycleHours).toFixed(3)} USD/h prom.` : 'Auditoría 100% USD'}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
};
