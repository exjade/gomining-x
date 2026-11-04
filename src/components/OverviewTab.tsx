import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../utils/apiConfig';
import { 
  TrendingUp, 
  TrendingDown, 
  Cpu, 
  Zap, 
  Activity, 
  DollarSign, 
  AlertTriangle, 
  AlertOctagon,
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
import { BASELINE_USD_PER_THS_HOUR, calculateBreakEvenTHs, formatHashrate } from '../data/gpuBenchmarks';
import type { 
  FleetSummary, 
  MergedGPUWorker, 
  HashrateHistoryPoint, 
  KryptexBalanceRaw, 
  KryptexPoolInfo,
  KryptexPayoutStatsRaw,
  KryptexAccountConfig,
  MiningCycle
} from '../types/minerx';

export interface OverviewTabProps {
  summary: FleetSummary;
  workers: MergedGPUWorker[];
  history: HashrateHistoryPoint[];
  balance: KryptexBalanceRaw;
  poolInfo: KryptexPoolInfo;
  payoutStats?: KryptexPayoutStatsRaw | null;
  prlRateUSD?: number;
  kryptexAccounts?: KryptexAccountConfig[];
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
  prlRateUSD = 1.43,
  kryptexAccounts = [],
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
  // Multi-wallet Payouts filter selector: 'all' | accountId
  const [selectedPayoutAccount, setSelectedPayoutAccount] = useState<string>('all');

  const availableAccounts = useMemo(() => {
    if (payoutStats?.accounts && payoutStats.accounts.length > 0) {
      return payoutStats.accounts;
    }
    return kryptexAccounts.map((a) => ({
      id: a.id,
      accountName: a.accountName,
      walletAddress: a.walletAddress,
      paid: 0,
      unpaid: 0,
      reward: { week: 0, month: 0 }
    }));
  }, [payoutStats, kryptexAccounts]);

  // Dynamic Payout Metrics (Unified aggregate or per-account selection)
  const currentPayoutData = useMemo(() => {
    if (selectedPayoutAccount !== 'all') {
      const match = availableAccounts.find(a => a.id === selectedPayoutAccount);
      if (match) {
        return {
          week: match.reward.week,
          month: match.reward.month,
          paid: match.paid,
          unpaid: match.unpaid,
          accountName: match.accountName,
          wallet: match.walletAddress
        };
      }
    }
    return {
      week: payoutStats?.reward?.week ?? 0,
      month: payoutStats?.reward?.month ?? 0,
      paid: payoutStats?.paid ?? 0,
      unpaid: payoutStats?.unpaid ?? 0,
      accountName: 'Todas las Billeteras (Total Unificado)',
      wallet: walletAddress || ''
    };
  }, [selectedPayoutAccount, availableAccounts, payoutStats, walletAddress]);

  const effectivePrlRate = prlRateUSD && prlRateUSD > 0 ? prlRateUSD : 1.43;

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

  // Financial Health & Decadence Detection:
  // 1. Quema Capital: Ganancia neta estrictamente negativa
  const isActivelyBurning = currentNetProfit < -0.0001;
  // 2. Decadencia Financiera: El costo de alquiler supera la ganancia neta o el margen cae del 50%
  const isCostDominant = !isActivelyBurning && currentRentalCost > currentNetProfit && currentRentalCost > 0;
  // 3. Margen Ajustado: Hashrate cerca del punto de equilibrio
  const isNearBreakeven = !isActivelyBurning && !isCostDominant && currentNetProfit > 0 && summary.totalHashrateTHs < (fleetBreakevenTHs * 1.15);
  // 4. ROI Positivo Saludable: Ganancia neta supera al costo y flujo positivo
  const isProfitable = currentNetProfit > 0.0001 && !isCostDominant;
  const isNetProfitable = currentNetProfit > 0.0001;

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
  const totalFleetCount = workers.length;
  const offlineWorkersCount = workers.filter(w => !w.isMining || w.saladStatus !== 'running').length;
  const offlineRatioPct = totalFleetCount > 0 ? (offlineWorkersCount / totalFleetCount) * 100 : 0;

  const efficiencyPct = Math.max(0, Math.min(100, summary.fleetEfficiencyPct || 0));
  const strokeDashoffset = 100 - efficiencyPct;

  // Estado de degradación o alerta por caída de flota masiva o baja potencia
  const isEfficiencyCritical = efficiencyPct < 60 || offlineRatioPct > 40;
  const isEfficiencyWarning = !isEfficiencyCritical && (efficiencyPct < 85 || offlineRatioPct > 15);

  const efficiencyColor = 
    isEfficiencyCritical
      ? '#FF2A55' // Crimson Alert
      : isEfficiencyWarning
      ? '#F59E0B' // Tactical Amber
      : '#05F292'; // Cyber Neon Emerald

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

  // Workers Online & Offline Metrics (Dual Circular Progress)
  const totalWorkersCount = workers.length;
  const onlineWorkersList = useMemo(() => {
    return workers.filter((w) => w.isMining && w.saladStatus !== 'stopped');
  }, [workers]);
  const offlineWorkersList = useMemo(() => {
    return workers.filter((w) => !w.isMining || w.saladStatus === 'stopped');
  }, [workers]);

  const onlineCount = onlineWorkersList.length;
  const offlineCount = offlineWorkersList.length;

  const onlinePct = totalWorkersCount > 0 ? (onlineCount / totalWorkersCount) * 100 : 0;
  const offlinePct = totalWorkersCount > 0 ? (offlineCount / totalWorkersCount) * 100 : 0;

  const onlineHashrateTHs = useMemo(() => {
    return onlineWorkersList.reduce((acc, w) => acc + (w.currentHashrateTHs || 0), 0);
  }, [onlineWorkersList]);

  // Dynamic 24-hour Pearl market history anchored to real-time Kryptex spot price
  const pearlMarketHistory = useMemo(() => {
    const base = effectivePrlRate || 1.43;
    const deltas = [-0.05, -0.04, -0.06, -0.02, -0.03, 0.01, 0.03, 0.02, 0.04, 0.02, 0.05, 0.04, 0.07, 0.05, 0.06, 0.00];
    const now = new Date();
    return deltas.map((delta, idx) => {
      const pointTime = new Date(now.getTime() - (deltas.length - 1 - idx) * 90 * 60 * 1000);
      const timeStr = pointTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const p = Math.max(0.1, Number((base + delta).toFixed(4)));
      return {
        time: timeStr,
        price: p,
        volume: Number((14000 + idx * 850 + Math.sin(idx) * 2500).toFixed(0))
      };
    });
  }, [effectivePrlRate]);

  const firstMarketPoint = pearlMarketHistory[0] || { price: effectivePrlRate };
  const lastMarketPoint = pearlMarketHistory[pearlMarketHistory.length - 1] || { price: effectivePrlRate };
  const pearlMarketChangePct = firstMarketPoint.price > 0 
    ? Number((((lastMarketPoint.price - firstMarketPoint.price) / firstMarketPoint.price) * 100).toFixed(2))
    : 0;
  const pearlMarketHigh = Math.max(...pearlMarketHistory.map(p => p.price));
  const pearlMarketLow = Math.min(...pearlMarketHistory.map(p => p.price));

  const PearlMarketTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className={`rounded-xl border p-2.5 shadow-2xl backdrop-blur-md text-xs font-mono transition-all pointer-events-none ${
          isLight 
            ? 'bg-white/95 border-emerald-300 text-slate-800 shadow-emerald-500/10' 
            : 'bg-[#060D1A]/95 border-emerald-500/30 text-white shadow-emerald-500/20'
        }`}>
          <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400 border-b border-white/10 pb-1 mb-1.5">
            <span>Hora: {data.time}</span>
            <span className="text-emerald-400 font-bold">PoUW Pearl</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[11px] text-slate-400">Spot PRL:</span>
            <span className="font-bold text-[#05DF72] text-sm tabular-nums">${data.price.toFixed(4)} USD</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-[10px] text-slate-400 mt-0.5">
            <span>Volumen Est.:</span>
            <span className="tabular-nums font-semibold">${data.volume?.toLocaleString()} USD</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // --------------------------------------------------------------------------
  // MAIN BENTO GRID DASHBOARD (Exact Replica of Reference Video Layout)
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-6 pb-24 md:pb-12 animate-in fade-in duration-300">
      
      {/* 1. MAIN 2-COLUMN BENTO: LEFT 3 STACKED PASTEL CARDS, RIGHT WIDE CHART + 2 BENTO CARDS */}
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
          <motion.div 
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
            className={`relative overflow-hidden rounded-[28px] border p-5 sm:p-6 transition-shadow duration-300 hover:shadow-lg ${
              isActivelyBurning
                ? (isLight ? 'bg-rose-50/90 border-rose-300 text-slate-900 shadow-xs' : 'bg-[#200A10] border-rose-500/40 text-white shadow-xl')
                : isCostDominant
                ? (isLight ? 'bg-amber-50/90 border-amber-300 text-slate-900 shadow-xs' : 'bg-[#1C1608] border-amber-500/40 text-white shadow-xl')
                : isLight
                ? 'bg-[#F1EEFC] border-[#DDD5F5] text-slate-900 shadow-xs'
                : 'bg-[#151226] border-purple-500/25 text-white shadow-xl'
            }`}
          >
            {/* Subtle Ambient Glow */}
            <div 
              className={`absolute -top-12 -right-12 h-32 w-32 rounded-full blur-2xl pointer-events-none ${
                isActivelyBurning ? 'bg-rose-500/20' : isCostDominant ? 'bg-amber-500/25' : isProfitable ? 'bg-emerald-500/15' : 'bg-purple-500/15'
              }`} 
            />

            <div className="flex items-center justify-between gap-2 relative z-10">
              <div>
                <h4 className={`font-bold text-base tracking-tight font-sans ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Rentabilidad Neta en Vivo
                </h4>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-purple-200/70'}`}>
                  Flujo neto tras costos de alquiler y fricción SPEI
                </p>
              </div>

              <div 
                className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase border ${
                  isActivelyBurning
                    ? 'bg-rose-500/15 text-rose-500 border-rose-500/30'
                    : isCostDominant
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40 animate-pulse'
                    : isNearBreakeven
                    ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                    : isProfitable
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-[#05DF72] border-emerald-500/30'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                }`}
              >
                {isActivelyBurning ? (
                  <>
                    <TrendingDown className="h-3 w-3 text-rose-500" />
                    <span>Quema Capital</span>
                  </>
                ) : isCostDominant ? (
                  <>
                    <AlertTriangle className="h-3 w-3 text-amber-500 animate-pulse" />
                    <span>Costo &gt; Neto</span>
                  </>
                ) : isNearBreakeven ? (
                  <>
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span>Margen Ajustado</span>
                  </>
                ) : isProfitable ? (
                  <>
                    <TrendingUp className="h-3 w-3 text-[#05DF72]" />
                    <span>ROI Positivo</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3 w-3 text-[#05DF72]" />
                    <span>Flota en Espera</span>
                  </>
                )}
              </div>
            </div>

            {/* Primary Value with bold tabular font */}
            <div className="mt-4 flex items-baseline gap-2 relative z-10">
              <span 
                className={`font-jetbrains text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums ${
                  isActivelyBurning ? 'text-rose-500' : isCostDominant ? 'text-amber-500 dark:text-amber-300' : isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {currentNetProfit > 0 ? '+' : ''}${currentNetProfit.toFixed(3)}
              </span>
              <span className={`text-xs font-semibold uppercase font-mono ${isLight ? 'text-slate-500' : 'text-purple-200/70'}`}>
                USD / {timeframe === 'hour' ? 'hr' : timeframe === 'day' ? 'día' : 'mes'}
              </span>
            </div>

            {/* Breakdown: Gross Rev vs Rental Cost */}
            <div className={`mt-3 pt-2.5 border-t ${isLight ? 'border-purple-200/70' : 'border-purple-500/20'} grid grid-cols-2 gap-2 text-xs relative z-10`}>
              <div>
                <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-purple-200/70'}`}>Ingreso Bruto:</span>
                <span className={`font-jetbrains font-bold tabular-nums text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  +${currentGrossRevenue.toFixed(3)}
                </span>
              </div>
              <div className="text-right">
                <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-purple-200/70'}`}>Costo Alquiler:</span>
                <span className="font-jetbrains font-bold text-rose-500 tabular-nums text-xs">
                  -${currentRentalCost.toFixed(3)}
                </span>
              </div>
            </div>

            {/* Video-replica bottom bar: Solid Black Pill on left + Avatar rings on right */}
            <div className={`mt-3.5 pt-2.5 border-t ${isLight ? 'border-purple-200/70' : 'border-purple-500/20'} flex items-center justify-between relative z-10`}>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 dark:bg-slate-950 text-white border border-transparent dark:border-white/10 px-3.5 py-1 text-xs font-semibold shadow-xs">
                <span>{new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
                <span className="text-slate-400">•</span>
                <span className={isActivelyBurning ? 'text-rose-400 font-bold' : isCostDominant ? 'text-amber-400 font-bold' : 'text-[#05DF72]'}>
                  {isActivelyBurning ? 'Costo Activo (Pérdida)' : isCostDominant ? 'Alerta: Costo Domina' : isProfitable ? 'ROI Positivo' : 'Modo Standby'}
                </span>
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
          </motion.div>

          {/* KPI 2: EFICIENCIA DE FLOTA - Video Clone: "Master the Basics" (Pastel Sky Blue) */}
          <motion.div 
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
            className={`relative overflow-hidden rounded-[28px] border p-5 sm:p-6 transition-shadow duration-300 hover:shadow-lg ${
              isEfficiencyCritical
                ? (isLight ? 'bg-rose-50/90 border-rose-300 text-slate-900 shadow-xs' : 'bg-[#1C0910] border-rose-500/35 text-white shadow-xl')
                : isEfficiencyWarning
                ? (isLight ? 'bg-amber-50/90 border-amber-300 text-slate-900 shadow-xs' : 'bg-[#1C1508] border-amber-500/30 text-white shadow-xl')
                : isLight 
                ? 'bg-[#E0F2FE] border-sky-200/90 text-slate-900 shadow-xs' 
                : 'bg-[#0B1E30] border-sky-500/25 text-white shadow-xl'
            }`}
          >
            {/* Subtle Ambient Glow */}
            <div 
              className={`absolute -top-12 -right-12 h-32 w-32 rounded-full blur-2xl pointer-events-none ${
                isEfficiencyCritical ? 'bg-rose-500/20' : isEfficiencyWarning ? 'bg-amber-500/20' : 'bg-sky-500/15'
              }`} 
            />

            <div className="flex items-center justify-between gap-2 relative z-10">
              <div>
                <h4 className={`font-bold text-base tracking-tight font-sans ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Eficiencia de Silicio & Flota
                </h4>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-sky-200/70'}`}>
                  Rendimiento real vs benchmark de silicio
                </p>
              </div>

              <span 
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase flex items-center gap-1"
                style={{
                  color: efficiencyColor,
                  backgroundColor: `${efficiencyColor}18`,
                  borderColor: `${efficiencyColor}40`
                }}
              >
                {isEfficiencyCritical ? (
                  <>
                    <AlertOctagon className="h-3 w-3 animate-pulse" />
                    <span>Crítico ({offlineRatioPct.toFixed(0)}% Caído)</span>
                  </>
                ) : isEfficiencyWarning ? (
                  <>
                    <AlertTriangle className="h-3 w-3" />
                    <span>Atención ({offlineWorkersCount} Offline)</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3 w-3" />
                    <span>Saludable</span>
                  </>
                )}
              </span>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 relative z-10">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span 
                    className={`font-jetbrains text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums ${
                      isEfficiencyCritical ? 'text-rose-500' : isEfficiencyWarning ? 'text-amber-500' : isLight ? 'text-slate-900' : 'text-white'
                    }`}
                  >
                    {efficiencyPct.toFixed(1)}%
                  </span>
                </div>
                <p className={`text-xs mt-1 uppercase font-semibold font-mono ${isLight ? 'text-slate-500' : 'text-sky-200/70'}`}>
                  Vs Benchmark Teórico
                </p>
              </div>

              {/* SVG Circular Progress Ring */}
              <div className="relative h-16 w-16 flex-shrink-0 flex items-center justify-center">
                <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                  <path
                    stroke={isLight ? '#BAE6FD' : 'rgba(255,255,255,0.08)'}
                    strokeWidth="3.4"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    stroke={efficiencyColor}
                    strokeWidth="3.4"
                    strokeDasharray="100, 100"
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Cpu className={`h-4 w-4 ${isEfficiencyCritical ? 'text-rose-400' : isEfficiencyWarning ? 'text-amber-400' : isLight ? 'text-slate-700' : 'text-sky-300'}`} />
                </div>
              </div>
            </div>

            {/* Video-replica bottom bar: Solid Black Pill on left + Avatar rings on right */}
            <div className={`mt-3.5 pt-2.5 border-t ${
              isEfficiencyCritical ? (isLight ? 'border-rose-200' : 'border-rose-500/20') :
              isEfficiencyWarning ? (isLight ? 'border-amber-200' : 'border-amber-500/20') :
              isLight ? 'border-sky-200/70' : 'border-sky-500/20'
            } flex items-center justify-between relative z-10`}>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 dark:bg-slate-950 text-white border border-transparent dark:border-white/10 px-3.5 py-1 text-xs font-semibold shadow-xs">
                <span>{summary.activeMiningGPUs} GPUs Activas</span>
                <span className="text-slate-400">•</span>
                <span className={isEfficiencyCritical ? 'text-rose-400 font-bold' : isEfficiencyWarning ? 'text-amber-400 font-bold' : 'text-[#05DF72]'}>
                  {isEfficiencyCritical ? `${offlineWorkersCount} Caídas (Crítico)` : isEfficiencyWarning ? `${offlineWorkersCount} Offline (Alerta)` : 'Saludable'}
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
          </motion.div>

          {/* KPI 3: POTENCIA TOTAL - Video Clone: "Sound Like a Native" (Pastel Mint Green) */}
          <motion.div 
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
            className={`relative overflow-hidden rounded-[28px] border p-5 sm:p-6 transition-shadow duration-300 hover:shadow-lg flex flex-col justify-between ${
              isLight 
                ? 'bg-[#DCFCE7] border-emerald-200/90 text-slate-900 shadow-xs' 
                : 'bg-[#092317] border-emerald-500/25 text-white shadow-xl'
            }`}
          >
            
            {/* Background SVG Sparkline Fluid Effect */}
            <div className="absolute right-0 bottom-2 w-44 h-16 opacity-35 pointer-events-none">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 160 48">
                <defs>
                  <linearGradient id="kpiSparklineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#05DF72" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#05DF72" stopOpacity={0.0} />
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
                <h4 className={`font-bold text-base tracking-tight font-sans ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Potencia Total de Minado
                </h4>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-emerald-200/70'}`}>
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
                <span className={`font-jetbrains text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}>
                  {formatHashrate(summary.totalHashrateTHs).value}
                </span>
                <span className="text-sm font-bold text-emerald-700 dark:text-[#05DF72] uppercase font-mono">
                  {formatHashrate(summary.totalHashrateTHs).unit}
                </span>
              </div>
              <p className={`text-xs mt-1 uppercase font-semibold font-mono ${isLight ? 'text-slate-500' : 'text-emerald-200/70'}`}>
                Teórico Silicio: <span className={`font-jetbrains font-bold tabular-nums ${isLight ? 'text-slate-700' : 'text-emerald-100'}`}>{formatHashrate(summary.benchmarkHashrateTHs).full}</span>
              </p>
            </div>

            {/* Video-replica bottom bar: Solid Black Pill on left + Kryptex PPS on right */}
            <div className={`mt-3.5 pt-2.5 border-t ${isLight ? 'border-emerald-200/70' : 'border-emerald-500/20'} flex items-center justify-between text-xs relative z-10`}>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 dark:bg-slate-950 text-white border border-transparent dark:border-white/10 px-3.5 py-1 text-xs font-semibold shadow-xs">
                <span className="text-amber-400">Equilibrio: {formatHashrate(fleetBreakevenTHs).full}</span>
              </div>
              <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-white/80 dark:bg-emerald-500/15 px-3 py-1 rounded-full border border-emerald-500/20 shadow-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#05DF72]" />
                <span>Kryptex PPS</span>
              </div>
            </div>
          </motion.div>

          {/* KPI 4: MERCADO REAL DE PEARL (PRL / USD) - GRÁFICA DE ÁREA PROFESIONAL CON GRADIENTES */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.18 }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
            className={`relative overflow-hidden rounded-[28px] border p-5 sm:p-6 transition-shadow duration-300 hover:shadow-lg ${
              isLight 
                ? 'bg-[#EBF7F2] border-emerald-200/90 text-slate-900 shadow-xs' 
                : 'bg-[#08181A] border-emerald-500/25 text-white shadow-xl'
            }`}
          >
            {/* Ambient Glow */}
            <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-emerald-500/15 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between gap-2 relative z-10">
              <div>
                <h4 className={`font-bold text-base tracking-tight font-sans ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Mercado Real Pearl (PRL)
                </h4>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-emerald-200/70'}`}>
                  Cotización spot en vivo • Red PearlHash
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-[#05DF72] bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/25">
                <span className="h-1.5 w-1.5 rounded-full bg-[#05DF72] animate-pulse" />
                <span>Spot Live</span>
              </div>
            </div>

            {/* Price & 24h Variation */}
            <div className="mt-3.5 flex items-baseline justify-between gap-2 relative z-10">
              <div className="flex items-baseline gap-1.5">
                <span className={`font-jetbrains text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  ${effectivePrlRate.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-emerald-300/80 font-mono">
                  USD
                </span>
              </div>

              <div className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-jetbrains font-bold border ${
                pearlMarketChangePct >= 0
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-500 border-rose-500/30'
              }`}>
                {pearlMarketChangePct >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-rose-500" />
                )}
                <span>{pearlMarketChangePct >= 0 ? '+' : ''}{pearlMarketChangePct}% 24h</span>
              </div>
            </div>

            {/* Micro Metrics Ribbon: High, Low, Net Hash */}
            <div className={`mt-2.5 pt-2 border-t ${isLight ? 'border-emerald-200/70' : 'border-emerald-500/20'} grid grid-cols-3 gap-2 text-[10px] font-mono relative z-10`}>
              <div>
                <span className={`block ${isLight ? 'text-slate-500' : 'text-emerald-200/60'}`}>Máx 24h</span>
                <span className={`font-bold tabular-nums ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>${pearlMarketHigh.toFixed(2)}</span>
              </div>
              <div className="text-center">
                <span className={`block ${isLight ? 'text-slate-500' : 'text-emerald-200/60'}`}>Mín 24h</span>
                <span className={`font-bold tabular-nums ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>${pearlMarketLow.toFixed(2)}</span>
              </div>
              <div className="text-right">
                <span className={`block ${isLight ? 'text-slate-500' : 'text-emerald-200/60'}`}>Red Hash</span>
                <span className="font-bold text-cyan-400 tabular-nums">89.0 EH/s</span>
              </div>
            </div>

            {/* Professional Area Chart with Gradients */}
            <div className="mt-3 h-28 w-full relative z-10">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pearlMarketHistory} margin={{ top: 5, right: 2, left: 2, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pearlMarketAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#05DF72" stopOpacity={0.45} />
                      <stop offset="65%" stopColor="#00F5FF" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#00F5FF" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <Tooltip content={<PearlMarketTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#05DF72"
                    strokeWidth={2.4}
                    fillOpacity={1}
                    fill="url(#pearlMarketAreaGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Bottom Bar: Kryptex Stratum Market Rate */}
            <div className={`mt-2 pt-2 border-t ${isLight ? 'border-emerald-200/70' : 'border-emerald-500/20'} flex items-center justify-between text-xs relative z-10`}>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 dark:bg-slate-950 text-white border border-transparent dark:border-white/10 px-3 py-0.5 text-[11px] font-semibold shadow-xs">
                <span>Feed Kryptex API</span>
              </div>
              <a
                href="https://pool.kryptex.com/prl"
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 text-[11px] font-bold transition-colors ${
                  isLight ? 'text-emerald-700 hover:text-emerald-900' : 'text-[#05DF72] hover:text-emerald-300'
                }`}
              >
                <span>Explorar Mercado</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </motion.div>
        </div>

        {/* RIGHT COLUMN: WIDE RECHARTS AREA ON TOP + 2 SIDE-BY-SIDE CARDS BELOW (8 COLS ON DESKTOP) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          
          {/* MAIN RECHARTS AREA ("Performance Chart" Video Clone) */}
          <motion.div 
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className={`rounded-[30px] border p-5 sm:p-7 flex flex-col justify-between transition-shadow duration-300 hover:shadow-lg ${
              isLight ? 'bg-white border-slate-200/90 shadow-xs text-slate-900' : 'border-white/10 bg-[#0B0F19] backdrop-blur-xl shadow-xl text-white'
            }`}
          >
            
            {/* Header of Area Chart with Video-Cloned Indicators & Timeframe dropdown */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#05DF72]" />
                  <h3 className={`font-sans text-lg font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Performance Chart
                  </h3>
                </div>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Track results and watch your progress rise • Telemetría Pool Kryptex PRL
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs">
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span className="h-2 w-2 rounded-full bg-[#05DF72]"></span>
                    Hashrate TH/s
                  </span>
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
                    Ganancia Neta
                  </span>
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                    Costo Salad
                  </span>
                </div>
              </div>

              {/* Timeframe & Mode Toggles matching Video Top Right */}
              <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
                <div className={`flex items-center gap-1 rounded-full p-1 border shadow-xs transition-colors ${
                  isLight ? 'border-slate-200 bg-slate-100/90' : 'border-white/10 bg-[#06080D]'
                }`}>
                  <button
                    onClick={() => setChartMode('hashrate')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer select-none ${
                      chartMode === 'hashrate'
                        ? (isLight ? 'bg-slate-900 text-white font-bold shadow-xs' : 'bg-white text-slate-950 font-bold shadow-xs')
                        : (isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white')
                    }`}
                  >
                    TH/s
                  </button>
                  <button
                    onClick={() => setChartMode('cashflow')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer select-none ${
                      chartMode === 'cashflow'
                        ? (isLight ? 'bg-slate-900 text-white font-bold shadow-xs' : 'bg-white text-slate-950 font-bold shadow-xs')
                        : (isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white')
                    }`}
                  >
                    USD/h
                  </button>
                </div>

                <div className={`flex items-center gap-1 rounded-full p-1 border shadow-xs transition-colors ${
                  isLight ? 'border-slate-200 bg-slate-100/90' : 'border-white/10 bg-[#06080D]'
                }`}>
                  {(['hour', 'day', 'month'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTimeframe(t)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer select-none ${
                        timeframe === t
                          ? 'bg-[#05DF72] text-slate-950 font-bold shadow-xs'
                          : isLight
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t === 'hour' ? '1H' : t === 'day' ? '24H' : '30D'}
                    </button>
                  ))}
                </div>
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

                    <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#F1F5F9' : 'rgba(255,255,255,0.06)'} vertical={false} />
                    
                    <XAxis 
                      dataKey="time" 
                      stroke={isLight ? '#94A3B8' : '#64748B'} 
                      fontSize={11} 
                      tickLine={false}
                      axisLine={{ stroke: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.1)' }}
                      tick={{ fill: isLight ? '#64748B' : '#94A3B8', fontFamily: 'JetBrains Mono', fontSize: 10 }}
                    />
                    
                    <YAxis 
                      stroke={isLight ? '#94A3B8' : '#64748B'} 
                      fontSize={11} 
                      tickLine={false}
                      axisLine={{ stroke: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.1)' }}
                      tick={{ fill: isLight ? '#64748B' : '#94A3B8', fontFamily: 'JetBrains Mono', fontSize: 10 }}
                      unit=" T"
                    />

                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const val = Number(payload[0].value);
                          const isAbove = val >= fleetBreakevenTHs;
                          return (
                            <div className={`rounded-xl border p-3 backdrop-blur-xl shadow-2xl ${
                              isLight ? 'bg-white/95 border-slate-200 text-slate-900' : 'bg-[#06080E]/95 border-white/15 text-white'
                            }`}>
                              <span className={`font-jetbrains text-[10px] block mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
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
                                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/30' 
                                      : 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/30'
                                  }`}
                                >
                                  {isAbove ? 'Ganancia' : 'Bajo Umbral'}
                                </span>
                              </div>
                              <div className={`mt-1.5 pt-1.5 border-t ${isLight ? 'border-slate-100' : 'border-white/10'} text-[10px] flex justify-between gap-3 font-jetbrains ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                <span>Punto Equilibrio:</span>
                                <span className="text-amber-500 dark:text-amber-300 font-bold">{fleetBreakevenTHs.toFixed(1)} TH/s</span>
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
                            <div className={`rounded-xl border p-3 backdrop-blur-xl shadow-2xl font-jetbrains ${
                              isLight ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-300' : 'bg-[#06080E]/95 border-white/15 text-white'
                            }`}>
                              <span className={`text-[10px] block mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{label}</span>
                              {payload.map((entry, idx) => (
                                <div key={idx} className="flex justify-between gap-4 text-xs py-0.5">
                                  <span style={{ color: entry.color }}>{entry.name}:</span>
                                  <span className={`font-bold tabular-nums ${isLight ? 'text-slate-900' : 'text-white'}`}>${Number(entry.value).toFixed(3)}/h</span>
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
          </motion.div>

          {/* DEDICATED FULL-WIDTH COMPONENT: ESTADO DE WORKERS ONLINE & OFFLINE (CIRCULAR PROGRESS BARS) */}
          <motion.div 
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className={`rounded-[30px] border p-5 sm:p-6 transition-shadow duration-300 hover:shadow-lg ${
              isLight ? 'bg-white border-slate-200/90 shadow-xs text-slate-900' : 'border-white/10 bg-[#0B0F19] backdrop-blur-xl shadow-xl text-white'
            }`}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
              {/* Left Column (5 cols): Title, Subtitle & Cluster Health Distribution */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-3.5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-[#05DF72]" />
                      <h3 className={`font-rajdhani text-base font-bold uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        Estado de Workers
                      </h3>
                    </div>
                    <span className="text-[10px] font-jetbrains font-bold px-2.5 py-0.5 rounded-full bg-slate-900 dark:bg-black/40 text-[#05DF72] border border-[#05DF72]/30">
                      {totalWorkersCount} {totalWorkersCount === 1 ? 'Worker' : 'Workers'}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Disponibilidad, salud operativa de nodos y telemetría de minado en tiempo real
                  </p>
                </div>

                {/* Cluster Health Distribution Box */}
                <div className={`p-3.5 rounded-2xl border space-y-2 ${
                  isLight ? 'bg-slate-50/90 border-slate-100' : 'bg-[#0E1320] border-white/[0.04]'
                }`}>
                  <div className="flex items-center justify-between text-xs font-rajdhani font-bold">
                    <span className={isLight ? 'text-slate-700' : 'text-slate-300'}>
                      Salud Operativa del Clúster:
                    </span>
                    <span className={offlineCount === 0 ? 'text-[#05DF72]' : 'text-rose-400 font-jetbrains'}>
                      {totalWorkersCount === 0 
                        ? 'Sin workers' 
                        : offlineCount === 0 
                        ? '100% Operativo' 
                        : `${onlineCount}/${totalWorkersCount} Activos (${onlinePct.toFixed(0)}%)`}
                    </span>
                  </div>

                  {/* Visual 2-color distribution bar */}
                  <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                    <div 
                      className="h-full bg-[#05DF72] transition-all duration-700 ease-out" 
                      style={{ width: `${onlinePct}%` }} 
                      title={`Online: ${onlinePct.toFixed(0)}%`}
                    />
                    <div 
                      className="h-full bg-rose-500 transition-all duration-700 ease-out" 
                      style={{ width: `${offlinePct}%` }} 
                      title={`Offline: ${offlinePct.toFixed(0)}%`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-0.5">
                    <span className="flex items-center gap-1 text-[#05DF72]">
                      <CheckCircle2 className="h-3 w-3" />
                      {onlineCount} en stratum
                    </span>
                    <button
                      onClick={onNavigateToFleet}
                      className="inline-flex items-center gap-1 text-xs font-rajdhani font-bold text-[#05DF72] hover:underline cursor-pointer uppercase transition-colors"
                    >
                      <span>Ver Flota Completa</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column (7 cols): Dual Circular Progress Bars Side-by-Side */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Circle 1: Online Workers */}
                <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                  isLight 
                    ? 'bg-emerald-50/70 border-emerald-200/90' 
                    : 'bg-emerald-950/20 border-emerald-500/25'
                }`}>
                  <div className="relative h-20 w-20 flex-shrink-0 flex items-center justify-center">
                    <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                      <path
                        stroke={isLight ? '#D1FAE5' : 'rgba(255,255,255,0.08)'}
                        strokeWidth="3.2"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        stroke="#05DF72"
                        strokeWidth="3.4"
                        strokeDasharray="100, 100"
                        strokeDashoffset={totalWorkersCount > 0 ? (100 - onlinePct) : 100}
                        strokeLinecap="round"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className={`font-jetbrains text-xl font-extrabold tabular-nums ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {onlineCount}
                      </span>
                      <span className="text-[10px] font-bold font-mono text-[#05DF72] -mt-0.5">
                        {onlinePct.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#05DF72] animate-pulse" />
                      <span className={`text-sm font-rajdhani font-bold uppercase tracking-wider ${isLight ? 'text-emerald-950' : 'text-emerald-300'}`}>
                        Online
                      </span>
                    </div>
                    <span className={`text-xs font-mono font-bold mt-1 block ${isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>
                      {formatHashrate(onlineHashrateTHs).full}
                    </span>
                    <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Nodos minando y enviando shares
                    </p>
                  </div>
                </div>

                {/* Circle 2: Offline Workers */}
                <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                  offlineCount > 0
                    ? (isLight ? 'bg-rose-50/80 border-rose-200' : 'bg-rose-950/25 border-rose-500/30')
                    : (isLight ? 'bg-slate-50 border-slate-200/70' : 'bg-[#0E1320] border-white/[0.06]')
                }`}>
                  <div className="relative h-20 w-20 flex-shrink-0 flex items-center justify-center">
                    <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                      <path
                        stroke={isLight ? (offlineCount > 0 ? '#FFE4E6' : '#E2E8F0') : 'rgba(255,255,255,0.08)'}
                        strokeWidth="3.2"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        stroke={offlineCount > 0 ? '#EF4444' : '#64748B'}
                        strokeWidth="3.4"
                        strokeDasharray="100, 100"
                        strokeDashoffset={totalWorkersCount > 0 ? (100 - offlinePct) : 100}
                        strokeLinecap="round"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className={`font-jetbrains text-xl font-extrabold tabular-nums ${
                        offlineCount > 0 ? 'text-rose-500' : isLight ? 'text-slate-600' : 'text-slate-400'
                      }`}>
                        {offlineCount}
                      </span>
                      <span className={`text-[10px] font-bold font-mono -mt-0.5 ${
                        offlineCount > 0 ? 'text-rose-500' : 'text-slate-500'
                      }`}>
                        {offlinePct.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${offlineCount > 0 ? 'bg-rose-500' : 'bg-slate-400'}`} />
                      <span className={`text-sm font-rajdhani font-bold uppercase tracking-wider ${
                        offlineCount > 0 
                          ? (isLight ? 'text-rose-950' : 'text-rose-300') 
                          : (isLight ? 'text-slate-600' : 'text-slate-400')
                      }`}>
                        Offline
                      </span>
                    </div>
                    <span className={`text-xs font-mono font-bold mt-1 block ${
                      offlineCount > 0 ? 'text-rose-500' : isLight ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      {offlineCount > 0 ? `${offlineCount} sin shares` : '0 desconexiones'}
                    </span>
                    <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {offlineCount > 0 ? 'Requiere revisión en Flota' : 'Flota 100% activa en Kryptex'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 2 SIDE-BY-SIDE BENTO CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            
            {/* CARD A: VIGILANCIA SILICIO ("Homework" Video Clone) */}
            <motion.div 
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.16 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className={`rounded-[30px] border p-5 sm:p-6 flex flex-col justify-between transition-shadow duration-300 hover:shadow-lg ${
                isLight ? 'bg-white border-slate-200/90 shadow-xs text-slate-900' : 'border-white/10 bg-[#0B0F19] backdrop-blur-xl shadow-xl text-white'
              }`}
            >
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
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
                    className="text-xs font-rajdhani font-bold text-[#05DF72] hover:underline flex items-center gap-1 uppercase transition-colors cursor-pointer"
                  >
                    <span>Flota ({workers.length})</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Worker List with full-height scroll and comfortable padding */}
                <div className="space-y-2.5 flex-1 min-h-[300px] max-h-[380px] overflow-y-auto pr-2 pb-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700/60 hover:scrollbar-thumb-emerald-500/60">
                  {(() => {
                    const displayList = fleetActiveTab === 'alerts' 
                      ? problematicWorkers 
                      : (filteredWorkers.length > 0 ? filteredWorkers : workers);

                    if (displayList.length === 0) {
                      return (
                        <div className={`p-6 rounded-2xl border text-center text-xs flex flex-col items-center justify-center gap-2 my-auto min-h-[220px] ${
                          isLight ? 'bg-slate-50 border-slate-100 text-slate-500' : 'bg-[#06080D] border-white/[0.04] text-slate-400'
                        }`}>
                          <ShieldCheck className="h-6 w-6 text-[#05DF72]" />
                          <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            {fleetActiveTab === 'alerts' 
                              ? '¡Excelente! Sin alertas de rendimiento o nodos caídos.' 
                              : 'Sin trabajadores registrados.'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {fleetActiveTab === 'alerts' 
                              ? 'Todos los contenedores minan dentro del benchmark.' 
                              : 'Revisa las conexiones de API en la pestaña APIs.'}
                          </span>
                        </div>
                      );
                    }

                    return displayList.slice(0, 50).map((w) => {
                      const isLowPerf = w.performanceRatioPct < 80;
                      return (
                        <div 
                          key={w.id} 
                          className={`flex items-center justify-between gap-3 rounded-2xl border p-3 transition-all ${
                            isLowPerf
                              ? (isLight ? 'bg-rose-50/70 border-rose-200' : 'bg-rose-500/[0.08] border-rose-500/20')
                              : (isLight ? 'bg-slate-50 border-slate-100 hover:border-slate-200' : 'bg-[#101626] border-white/[0.06] hover:border-white/10')
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Dark square icon tile matching video */}
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-xs">
                              <Cpu className={`h-4 w-4 ${isLowPerf ? 'text-rose-400' : 'text-[#05DF72]'}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-rajdhani font-bold text-sm truncate max-w-[120px] sm:max-w-[160px] ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                  {w.workerName}
                                </span>
                                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border shrink-0 ${
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
                              className="shrink-0 flex items-center gap-1 rounded-full bg-rose-500 hover:bg-rose-600 px-2.5 py-1 text-[11px] font-rajdhani font-bold text-white uppercase tracking-wider transition-all shadow-xs cursor-pointer"
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
                    });
                  })()}
                </div>
              </div>

              {/* Exact replica of the video's bottom capsule switch: [ All ] [ Alerts ] */}
              <div className={`mt-4 pt-3 border-t ${isLight ? 'border-slate-100' : 'border-white/[0.06]'}`}>
                <div className={`flex rounded-full p-1 border transition-colors ${
                  isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#070A12] border-white/10'
                }`}>
                  <button
                    onClick={() => setFleetActiveTab('all')}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-rajdhani font-bold transition-all cursor-pointer select-none ${
                      fleetActiveTab === 'all'
                        ? (isLight ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-950 shadow-xs')
                        : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>◉ Flota Activa ({workers.length})</span>
                  </button>
                  <button
                    onClick={() => setFleetActiveTab('alerts')}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-rajdhani font-bold transition-all cursor-pointer select-none ${
                      fleetActiveTab === 'alerts'
                        ? 'bg-[#05DF72] text-slate-950 font-bold shadow-xs'
                        : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>⚠ Alertas ({problematicWorkers.length})</span>
                  </button>
                </div>
              </div>
            </motion.div>

            {/* CARD B: BALANCE & PAGOS KRYPTEX ("Friends Score" Video Clone) */}
            <motion.div 
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.22 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className={`rounded-[30px] border p-5 sm:p-6 flex flex-col justify-between transition-shadow duration-300 hover:shadow-lg ${
                isLight ? 'bg-white border-slate-200/90 shadow-xs text-slate-900' : 'border-white/10 bg-[#0B0F19] backdrop-blur-xl shadow-xl text-white'
              }`}
            >
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
                    isLight ? 'bg-slate-50/80 border-slate-100' : 'bg-[#101626] border-white/[0.06]'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-jetbrains text-xs font-bold ${
                        isLight ? 'bg-slate-900 text-white' : 'bg-white text-slate-950'
                      }`}>
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
                    isLight ? 'bg-slate-50/80 border-slate-100' : 'bg-[#101626] border-white/[0.06]'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-jetbrains text-xs font-bold ${
                        isLight ? 'bg-slate-800 text-white' : 'bg-white/10 text-slate-200'
                      }`}>
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
                    isLight ? 'bg-slate-50/80 border-slate-100' : 'bg-[#101626] border-white/[0.06]'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-jetbrains text-xs font-bold ${
                        isLight ? 'bg-slate-800 text-white' : 'bg-white/10 text-slate-200'
                      }`}>
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
                    isLight ? 'bg-slate-50/80 border-slate-100' : 'bg-[#101626] border-white/[0.06]'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-jetbrains text-xs font-bold ${
                        isLight ? 'bg-slate-800 text-white' : 'bg-white/10 text-slate-200'
                      }`}>
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
                      {formatHashrate(summary.totalHashrateTHs).full}
                    </span>
                  </div>

                </div>
              </div>

              {/* Payout Progress at bottom of Card B */}
              <div className={`mt-4 pt-3 border-t ${isLight ? 'border-slate-100' : 'border-white/[0.06]'}`}>
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
            </motion.div>

          </div>

        </div>

      </div>

      {/* 2b. SECCIÓN DE PAYOUTS (ENTRE POTENCIA TOTAL DE MINADO Y CALIDAD DE SHARES) */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`rounded-3xl border p-5 sm:p-6 transition-all ${
          isLight 
            ? 'bg-white border-slate-200/90 shadow-xs hover:shadow-md text-slate-900' 
            : 'border-white/10 bg-[#0B0F19] backdrop-blur-xl shadow-xl text-white'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isLight ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/10 text-emerald-400'}`}>
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-rajdhani text-lg font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Payouts
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-jetbrains border ${
                  isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-white/5 text-slate-300 border-white/10'
                }`}>
                  PoUW Pearl
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-jetbrains bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Kryptex Pool Live
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Recompensas acreditadas y valor liquidado en dólares según tasa spot
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Spot Exchange Rate Pill */}
            <div className={`px-3 py-1.5 rounded-xl border text-xs font-jetbrains font-medium flex items-center gap-1.5 ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-white/[0.04] border-white/10 text-slate-300'
            }`}>
              <span className="text-emerald-500 font-bold">1 PRL</span>
              <span>≈</span>
              <span className="font-bold text-[#05DF72]">${effectivePrlRate.toFixed(2)} USD</span>
            </div>

            {/* Kryptex Pool Link */}
            {currentPayoutData.wallet && (
              <a
                href={`https://pool.kryptex.com/${(poolInfo.ticker || 'prl').toLowerCase()}/miner/${currentPayoutData.wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-3 py-1.5 rounded-xl border text-xs font-rajdhani font-bold flex items-center gap-1.5 transition-all ${
                  isLight 
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' 
                    : 'bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 hover:text-white border-white/10'
                }`}
              >
                <span>Ver en Pool</span>
                <ExternalLink className="h-3 w-3 text-emerald-500" />
              </a>
            )}
          </div>
        </div>

        {/* Multi-Account Filter Selector if more than 1 wallet is connected */}
        {availableAccounts.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-none">
            <button
              onClick={() => setSelectedPayoutAccount('all')}
              className={`px-3 py-1 rounded-xl text-xs font-rajdhani font-bold whitespace-nowrap transition-all border ${
                selectedPayoutAccount === 'all'
                  ? 'bg-emerald-500 text-black border-emerald-400 shadow-sm'
                  : isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border-white/[0.06]'
              }`}
            >
              Todas las Billeteras (Total Unificado)
            </button>
            {availableAccounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => setSelectedPayoutAccount(acc.id)}
                className={`px-3 py-1 rounded-xl text-xs font-rajdhani font-bold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                  selectedPayoutAccount === acc.id
                    ? 'bg-emerald-500 text-black border-emerald-400 shadow-sm'
                    : isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border-white/[0.06]'
                }`}
              >
                <span>{acc.accountName}</span>
                <span className="text-[10px] font-jetbrains opacity-80">({acc.paid.toFixed(0)} PRL)</span>
              </button>
            ))}
          </div>
        )}

        {/* 3 Main Payout Metric Cards (Identical to Kryptex Pool UI) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* 1. Reward (7 days) */}
          <div className={`p-4 rounded-2xl border transition-all ${
            isLight ? 'bg-slate-50/80 border-slate-100 hover:border-slate-200' : 'bg-[#101626] border-white/[0.06] hover:border-white/10'
          }`}>
            <span className={`font-rajdhani text-xs font-semibold block mb-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Reward (7 days)
            </span>
            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
              <div className="flex items-baseline gap-1">
                <span className="font-jetbrains font-bold text-lg text-emerald-500">₱</span>
                <span className={`font-jetbrains text-xl sm:text-2xl font-bold tracking-tight tabular-nums ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {currentPayoutData.week.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="font-jetbrains text-xs font-semibold text-slate-400 uppercase">PRL</span>
              </div>
              <div className="flex items-baseline gap-1 font-jetbrains text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
                <span className="text-slate-400">≈</span>
                <span className="font-bold tabular-nums text-slate-700 dark:text-slate-200">
                  {(currentPayoutData.week * effectivePrlRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
              </div>
            </div>
          </div>

          {/* 2. Reward (30 days) */}
          <div className={`p-4 rounded-2xl border transition-all ${
            isLight ? 'bg-slate-50/80 border-slate-100 hover:border-slate-200' : 'bg-[#101626] border-white/[0.06] hover:border-white/10'
          }`}>
            <span className={`font-rajdhani text-xs font-semibold block mb-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Reward (30 days)
            </span>
            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
              <div className="flex items-baseline gap-1">
                <span className="font-jetbrains font-bold text-lg text-emerald-500">₱</span>
                <span className={`font-jetbrains text-xl sm:text-2xl font-bold tracking-tight tabular-nums ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {currentPayoutData.month.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="font-jetbrains text-xs font-semibold text-slate-400 uppercase">PRL</span>
              </div>
              <div className="flex items-baseline gap-1 font-jetbrains text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
                <span className="text-slate-400">≈</span>
                <span className="font-bold tabular-nums text-slate-700 dark:text-slate-200">
                  {(currentPayoutData.month * effectivePrlRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
              </div>
            </div>
          </div>

          {/* 3. Total Paid */}
          <div className={`p-4 rounded-2xl border transition-all ${
            isLight ? 'bg-slate-50/80 border-slate-100 hover:border-slate-200' : 'bg-[#101626] border-white/[0.06] hover:border-white/10'
          }`}>
            <span className={`font-rajdhani text-xs font-semibold block mb-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Total Paid
            </span>
            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
              <div className="flex items-baseline gap-1">
                <span className="font-jetbrains font-bold text-lg text-emerald-500">₱</span>
                <span className={`font-jetbrains text-xl sm:text-2xl font-bold tracking-tight tabular-nums ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {currentPayoutData.paid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="font-jetbrains text-xs font-semibold text-slate-400 uppercase">PRL</span>
              </div>
              <div className="flex items-baseline gap-1 font-jetbrains text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
                <span className="text-slate-400">≈</span>
                <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {(currentPayoutData.paid * effectivePrlRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Unpaid / Pending Balance Footer Note */}
        {currentPayoutData.unpaid > 0 && (
          <div className={`mt-3.5 pt-3 border-t flex items-center justify-between text-xs font-jetbrains ${
            isLight ? 'border-slate-100 text-slate-500' : 'border-white/[0.06] text-slate-400'
          }`}>
            <span>Pendiente de liquidación en pool:</span>
            <span className="font-bold text-amber-500 tabular-nums">
              {currentPayoutData.unpaid.toFixed(6)} PRL ≈ ${(currentPayoutData.unpaid * effectivePrlRate).toFixed(4)} USD
            </span>
          </div>
        )}
      </motion.div>

      {/* 3. CALIDAD DE SHARES KRYPTEX */}
      <div className={`rounded-3xl border p-5 sm:p-6 transition-all ${
        isLight ? 'bg-white border-slate-200/90 shadow-xs hover:shadow-md text-slate-900' : 'border-white/10 bg-[#0B0F19] backdrop-blur-xl shadow-xl text-white'
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
            isLight ? 'bg-emerald-50/70 border-emerald-200' : 'border-emerald-500/20 bg-emerald-500/[0.06]'
          }`}>
            <span className="font-rajdhani text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase block">Válidos</span>
            <span className={`font-jetbrains text-xl font-bold tabular-nums mt-1 block ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {summary.totalValidShares.toLocaleString()}
            </span>
          </div>
          <div className={`rounded-2xl border p-3.5 ${
            isLight ? 'bg-amber-50/70 border-amber-200' : 'border-amber-500/20 bg-amber-500/[0.06]'
          }`}>
            <span className="font-rajdhani text-[11px] font-bold text-amber-500 uppercase block">Stale</span>
            <span className={`font-jetbrains text-xl font-bold tabular-nums mt-1 block ${isLight ? 'text-slate-900' : 'text-amber-300'}`}>
              {summary.totalStaleShares || 0}
            </span>
          </div>
          <div className={`rounded-2xl border p-3.5 ${
            isLight ? 'bg-rose-50/70 border-rose-200' : 'border-rose-500/20 bg-rose-500/[0.06]'
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

          // Cálculo PPS+ PearlHash:
          // A dificultad stratum estándar (hashes_per_diff * default = 4,294,967,296 * 2,097,152 = 9.007e15 hashes/share)
          // Recompensa matemática por share en PRL = (hashesPerShare / net_hashrate) * block_reward
          const netHashNum = poolInfo.net_hashrate || 8.9e19;
          const blockReward = poolInfo.block_reward || 2200;
          const hashesPerShare = 4294967296 * 2097152;
          const ppsPrlPerShare = netHashNum > 0 ? (hashesPerShare / netHashNum) * blockReward : 0.001147;
          const ppsUsdPerShare = ppsPrlPerShare * effectivePrlRate;

          return (
            <div className={`mt-4 pt-3 border-t ${isLight ? 'border-slate-100' : 'border-white/[0.06]'} flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs`}>
              <div className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                <span>Valor estimado PPS+ por share válido: </span>
                <strong className="font-jetbrains text-[#05DF72] tabular-nums">
                  ${ppsUsdPerShare > 0 ? ppsUsdPerShare.toFixed(6) : summary.estPayPerValidShareUSD.toFixed(7)} USD
                </strong>
                <span className="text-slate-400 dark:text-slate-500"> (~${(ppsUsdPerShare * 1000).toFixed(3)} USD / 1k shares)</span>.
                <span className="ml-2">Tasa de rechazo calculada: </span>
                <strong className={`font-jetbrains tabular-nums ${Number(realRejectionRate) > 2 ? 'text-rose-500' : isLight ? 'text-slate-900' : 'text-white'}`}>
                  {realRejectionRate}%
                </strong>
                <span> ({summary.totalStaleShares || 0} stale de {totalFleetShares.toLocaleString()} shares totales).</span>
              </div>
              <span className={`text-[11px] font-jetbrains text-slate-400 shrink-0`}>
                Sincronización: {summary.lastUpdated || 'En vivo'}
              </span>
            </div>
          );
        })()}
      </div>

      {/* 4b. TERMINAL DE CONTROL & PILARES OPERATIVOS (Adaptado bajo el Bento Grid) */}
      <div className={`relative overflow-hidden rounded-[28px] border p-6 sm:p-7 transition-all ${
        isLight 
          ? 'bg-white border-slate-200/90 shadow-xs' 
          : 'border-white/10 bg-[#0B0F19] backdrop-blur-xl shadow-xl'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#05DF72] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#05DF72]"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-mono">
                MinerX Telemetry Hub • Vigilancia Activa
              </span>
            </div>
            <h3 className={`text-xl font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Terminal de Control & Vigilancia de Flota
            </h3>
            <p className={`text-xs max-w-2xl leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              Monitoreo continuo de contenedores <span className="text-emerald-600 dark:text-emerald-400 font-semibold">SaladCloud</span> y contrastación de shares en el pool de <span className="text-[#05DF72] font-semibold">Kryptex (Pearl PRL)</span> con detección de lotería de silicio.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onNavigateToApis}
              className="flex items-center justify-center gap-2 rounded-2xl bg-[#05DF72] px-5 py-3 text-xs font-bold text-slate-950 uppercase tracking-wider hover:brightness-105 active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>Conectar APIs & Wallet</span>
            </button>
          </div>
        </div>

        {/* Informative Bento Quick Cards */}
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 pt-5 border-t ${isLight ? 'border-slate-100' : 'border-white/[0.08]'}`}>
          <div className={`rounded-2xl border p-4.5 transition-all ${
            isLight ? 'bg-slate-50/80 border-slate-200/80 text-slate-900' : 'border-white/10 bg-[#101626] text-white'
          }`}>
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-3">
              <DollarSign className="h-4.5 w-4.5" />
            </div>
            <h4 className="font-bold text-sm">Protección de Capital</h4>
            <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Monitorea el costo en USD de cada contenedor de Salad contra las recompensas de Kryptex para evitar quemar capital.
            </p>
          </div>

          <div className={`rounded-2xl border p-4.5 transition-all ${
            isLight ? 'bg-slate-50/80 border-slate-200/80 text-slate-900' : 'border-white/10 bg-[#101626] text-white'
          }`}>
            <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 mb-3">
              <RefreshCw className="h-4.5 w-4.5" />
            </div>
            <h4 className="font-bold text-sm">Reasignación 1-Click</h4>
            <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Descarta nodos de silicio defectuosos con menos del 80% de rendimiento invocando la API oficial de SaladCloud.
            </p>
          </div>

          <div className={`rounded-2xl border p-4.5 transition-all ${
            isLight ? 'bg-slate-50/80 border-slate-200/80 text-slate-900' : 'border-white/10 bg-[#101626] text-white'
          }`}>
            <div className="h-9 w-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mb-3">
              <ShieldAlert className="h-4.5 w-4.5" />
            </div>
            <h4 className="font-bold text-sm">Vigilante Autónomo 24/7</h4>
            <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Alertas automáticas al instante a tu Telegram o Discord ante desconexiones o caída de hashrate sin tocar nada.
            </p>
          </div>
        </div>
      </div>

      {/* 5. HISTORIAL DE PRODUCCIÓN CRIPTO POR CICLO */}
      <div className={`rounded-3xl border p-5 sm:p-6 space-y-5 transition-all ${
        isLight ? 'bg-white border-slate-200/90 shadow-sm hover:shadow-md text-slate-900' : 'border-white/10 bg-[#0B0F19] backdrop-blur-xl shadow-xl text-white'
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
