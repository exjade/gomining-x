import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../utils/apiConfig';
import { 
  Calculator, 
  TrendingUp, 
  Clock, 
  ShieldCheck, 
  ChevronDown, 
  ChevronUp,
  Zap,
  Cpu,
  Play,
  Square,
  CheckCircle2,
  DollarSign,
  Activity,
  Sparkles,
  Sliders,
  Flame,
  Coins,
  Check,
  BarChart3,
  Server
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import { 
  BASELINE_USD_PER_THS_HOUR, 
  calculateBreakEvenTHs,
  TOTAL_FINANCIAL_FRICTION_PCT,
  VERIFIED_EXCEL_GPUS
} from '../data/gpuBenchmarks';
import type { VerifiedExcelGPU } from '../data/gpuBenchmarks';
import type { 
  MergedGPUWorker, 
  FleetSummary, 
  SaladBalanceInfo, 
  KryptexBalanceRaw, 
  KryptexPoolInfo, 
  SaladAccountConfig,
  MiningCycle
} from '../types/minerx';

interface EconomicsTabProps {
  workers?: MergedGPUWorker[];
  summary?: FleetSummary;
  saladBalance?: SaladBalanceInfo | null;
  balance?: KryptexBalanceRaw;
  poolInfo?: KryptexPoolInfo;
  accounts?: SaladAccountConfig[];
}

// Preset GPU options from verified Excel sheet
const GPU_PRESETS: VerifiedExcelGPU[] = VERIFIED_EXCEL_GPUS;

export const EconomicsTab: React.FC<EconomicsTabProps> = ({
  workers = [],
  summary,
  balance,
  poolInfo,
  accounts = []
}) => {
  // ----------------------------------------------------
  // 1. LIVE FLEET TELEMETRY CALCULATIONS
  // ----------------------------------------------------
  const runningWorkers = useMemo(() => {
    return workers.filter((w) => w.saladStatus === 'running' || (w.isMining && w.saladStatus !== 'stopped'));
  }, [workers]);

  const runningCount = runningWorkers.length;

  // Real-time Salad cost from active workers
  const fleetHourlyCost = useMemo(() => {
    if (runningWorkers.length === 0) return 0;
    return runningWorkers.reduce((acc, w) => acc + (w.hourlySaladCost || 0.160), 0);
  }, [runningWorkers]);

  // Real-time Hashrate from logs or pool
  const fleetTotalTHs = useMemo(() => {
    if (runningWorkers.length === 0) return summary?.totalHashrateTHs || 0;
    const sum = runningWorkers.reduce((acc, w) => acc + (w.currentHashrateTHs || 0), 0);
    return sum > 0 ? Number(sum.toFixed(1)) : (summary?.totalHashrateTHs || 0);
  }, [runningWorkers, summary?.totalHashrateTHs]);

  // Accepted shares across fleet
  const totalAcceptedShares = useMemo(() => {
    const fromWorkers = workers.reduce((acc, w) => acc + (w.validShares || 0), 0);
    return fromWorkers > 0 ? fromWorkers : (poolInfo?.valid || summary?.totalValidShares || 0);
  }, [workers, poolInfo?.valid, summary?.totalValidShares]);

  // Hourly Gross & Net
  const fleetHourlyGross = fleetTotalTHs * BASELINE_USD_PER_THS_HOUR;
  const fleetHourlyNet = fleetHourlyGross - fleetHourlyCost;
  const fleetMarginPct = fleetHourlyGross > 0 ? ((fleetHourlyNet / fleetHourlyGross) * 100) : 0;

  // ----------------------------------------------------
  // 2. PERSISTENT MINING CYCLES STATE
  // ----------------------------------------------------
  const [activeCycle, setActiveCycle] = useState<MiningCycle | null>(null);
  const [closedCycles, setClosedCycles] = useState<MiningCycle[]>([]);
  const [isStartingCycle, setIsStartingCycle] = useState<boolean>(false);
  const [isClosingCycle, setIsClosingCycle] = useState<boolean>(false);
  const [cycleNotification, setCycleNotification] = useState<string | null>(null);

  // Live timer for active cycle
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Fetch cycles from server on mount
  const fetchCycles = async () => {
    try {
      const res = await apiFetch('/api/mining/cycles');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setActiveCycle(data.activeCycle || null);
          setClosedCycles(data.closedCycles || []);
          if (data.activeCycle) {
            const startSec = Math.floor((Date.now() - data.activeCycle.startTime) / 1000);
            setElapsedSeconds(Math.max(0, startSec));
          }
        }
      }
    } catch (err) {
      console.warn('[MinerX] Could not connect to cycles endpoint, using local fallback:', err);
    }
  };

  useEffect(() => {
    fetchCycles();
  }, []);

  // Timer tick for active cycle
  useEffect(() => {
    if (!activeCycle) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCycle]);

  // Auto-detect & suggest or start cycle if running fleet is detected
  const handleStartCycle = async () => {
    setIsStartingCycle(true);
    try {
      const res = await apiFetch('/api/mining/cycles/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          containerGroupName: runningWorkers[0]?.containerGroupName || 'prl-miner-east',
          organizationName: accounts[0]?.organizationName || 'desing-canva',
          activeGpuCount: runningCount > 0 ? runningCount : 2,
          gpuModel: runningWorkers[0]?.gpuModel || 'NVIDIA GeForce RTX 4090',
          hourlySaladRateUSD: fleetHourlyCost > 0 ? fleetHourlyCost : 0.320,
          averageHashrateTHs: fleetTotalTHs > 0 ? fleetTotalTHs : 620.3,
          route: 'Kryptex'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.cycle) {
          setActiveCycle(data.cycle);
          setElapsedSeconds(0);
          showToast('✅ Nuevo Ciclo de Minado INICIADO y registrado con éxito.');
        }
      }
    } catch (err) {
      console.error('Error starting cycle:', err);
      // Fallback local start
      const newCycle: MiningCycle = {
        id: `CICLO-${String(closedCycles.length + 1).padStart(3, '0')}`,
        startTime: Date.now(),
        startDateStr: new Date().toISOString().replace('T', ' ').substring(0, 16),
        durationHours: 0,
        status: 'ACTIVE',
        containerGroupName: 'prl-miner-east',
        organizationName: accounts[0]?.organizationName || 'desing-canva',
        activeGpuCount: runningCount > 0 ? runningCount : 2,
        gpuModel: 'NVIDIA GeForce RTX 4090',
        hourlySaladRateUSD: fleetHourlyCost > 0 ? fleetHourlyCost : 0.320,
        totalSaladCostUSD: 0,
        averageHashrateTHs: fleetTotalTHs > 0 ? fleetTotalTHs : 620.3,
        totalComputeTHh: 0,
        acceptedShares: totalAcceptedShares,
        initialCryptoBalance: balance?.total || 0,
        finalCryptoBalance: balance?.total || 0,
        cryptoProduced: 0,
        cryptoCurrency: 'BTC',
        spotPriceUSD: 94500,
        grossRevenueUSD: 0,
        netProfitUSD: 0,
        roiPct: 0,
        route: 'Kryptex',
        isProfitable: true
      };
      setActiveCycle(newCycle);
      setElapsedSeconds(0);
      showToast('✅ Ciclo de Minado iniciado en modo local.');
    } finally {
      setIsStartingCycle(false);
    }
  };

  const handleCloseCycle = async () => {
    if (!activeCycle) return;
    setIsClosingCycle(true);
    const durationHours = Math.max(0.01, Number((elapsedSeconds / 3600).toFixed(2)));
    const totalSaladCostUSD = Number((durationHours * (activeCycle.hourlySaladRateUSD || 0.320)).toFixed(2));
    const averageHashrate = fleetTotalTHs > 0 ? fleetTotalTHs : (activeCycle.averageHashrateTHs || 620.3);
    const totalComputeTHh = Number((durationHours * averageHashrate).toFixed(2));
    const grossRevenueUSD = Number((totalComputeTHh * BASELINE_USD_PER_THS_HOUR).toFixed(2));
    const netProfitUSD = Number((grossRevenueUSD - totalSaladCostUSD).toFixed(2));
    const roiPct = totalSaladCostUSD > 0 ? Number(((netProfitUSD / totalSaladCostUSD) * 100).toFixed(1)) : 0;

    const closedItem: MiningCycle = {
      ...activeCycle,
      endTime: Date.now(),
      endDateStr: new Date().toISOString().replace('T', ' ').substring(0, 16),
      durationHours,
      status: 'CLOSED',
      totalSaladCostUSD,
      averageHashrateTHs: averageHashrate,
      totalComputeTHh,
      acceptedShares: totalAcceptedShares,
      finalCryptoBalance: (activeCycle.initialCryptoBalance || 0) + (grossRevenueUSD / 94500),
      cryptoProduced: Number((grossRevenueUSD / 94500).toFixed(8)),
      grossRevenueUSD,
      netProfitUSD,
      roiPct,
      isProfitable: netProfitUSD > 0
    };

    try {
      const res = await apiFetch('/api/mining/cycles/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycle: closedItem })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setActiveCycle(null);
          setClosedCycles(data.closedCycles || [closedItem, ...closedCycles]);
          showToast(`🎉 Ciclo ${closedItem.id} CERRADO y auditado con +$${netProfitUSD} USD netos.`);
        }
      }
    } catch (err) {
      console.warn('Fallback closing locally:', err);
      setActiveCycle(null);
      setClosedCycles([closedItem, ...closedCycles]);
      showToast(`🎉 Ciclo ${closedItem.id} guardado localmente.`);
    } finally {
      setIsClosingCycle(false);
    }
  };

  const showToast = (msg: string) => {
    setCycleNotification(msg);
    setTimeout(() => setCycleNotification(null), 5000);
  };

  // ----------------------------------------------------
  // 3. INTERACTIVE SELECTABLE GPU CALCULATOR STATE
  // ----------------------------------------------------
  const [selectedPresetId, setSelectedPresetId] = useState<string>('live-fleet');
  const [fleetMultiplier, setFleetMultiplier] = useState<number>(2);
  const [timeHorizon, setTimeHorizon] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  const selectedPreset = useMemo(() => {
    return GPU_PRESETS.find((p) => p.id === selectedPresetId) || GPU_PRESETS[0];
  }, [selectedPresetId]);

  // Adjust fleet multiplier automatically when Live Fleet is selected
  useEffect(() => {
    if (selectedPresetId === 'live-fleet') {
      setFleetMultiplier(runningCount > 0 ? runningCount : 2);
    }
  }, [selectedPresetId, runningCount]);

  // Horizon multiplier in hours
  const horizonHours = useMemo(() => {
    switch (timeHorizon) {
      case '1h': return 1;
      case '24h': return 24;
      case '7d': return 168;
      case '30d': return 720;
    }
  }, [timeHorizon]);

  // Horizon label
  const horizonLabel = useMemo(() => {
    switch (timeHorizon) {
      case '1h': return '1 Hora';
      case '24h': return '24 Horas (1 Día)';
      case '7d': return '7 Días (1 Semana)';
      case '30d': return '30 Días (1 Mes)';
    }
  }, [timeHorizon]);

  // Calculations for simulated selection
  const calcGpuCount = selectedPreset.isLiveFleet ? fleetMultiplier : fleetMultiplier;
  const calcHashrateTHs = selectedPreset.isLiveFleet 
    ? (fleetTotalTHs > 0 ? fleetTotalTHs : (runningCount > 0 ? runningCount * 300 : 0))
    : (selectedPreset.expectedTHs * calcGpuCount);

  const calcHourlyCost = selectedPreset.isLiveFleet
    ? (fleetHourlyCost > 0 ? fleetHourlyCost : (runningCount > 0 ? runningCount * 0.160 : 0))
    : (selectedPreset.hourlyCost * calcGpuCount);

  const calcTotalSaladCost = calcHourlyCost * horizonHours;
  const calcTotalGrossRevenue = calcHashrateTHs * BASELINE_USD_PER_THS_HOUR * horizonHours;
  // Deducción financiera real auditada: 3.91% spread Kryptex + 0.65% exchange/spei = 4.56% (el 3% de la pool ya viene descontado en la tasa PPS)
  const calcTotalFrictionDeduction = calcTotalGrossRevenue * TOTAL_FINANCIAL_FRICTION_PCT;
  const calcTotalNetRevenueReal = calcTotalGrossRevenue - calcTotalFrictionDeduction;
  const calcTotalNetProfit = calcTotalNetRevenueReal - calcTotalSaladCost;
  const calcMarginPct = calcTotalNetRevenueReal > 0 ? ((calcTotalNetProfit / calcTotalNetRevenueReal) * 100) : 0;

  // Break-even hashrate per GPU con fricción auditada aplicada
  const singleGpuCost = selectedPreset.isLiveFleet ? 0.160 : selectedPreset.hourlyCost;
  const breakEvenTHsPerGpu = calculateBreakEvenTHs(singleGpuCost, BASELINE_USD_PER_THS_HOUR, true);
  const deliveredTHsPerGpu = selectedPreset.isLiveFleet ? (calcHashrateTHs / calcGpuCount) : selectedPreset.expectedTHs;
  const safetyMarginPct = breakEvenTHsPerGpu > 0 ? (((deliveredTHsPerGpu - breakEvenTHsPerGpu) / breakEvenTHsPerGpu) * 100) : 0;
  const isProfitableSelection = calcTotalNetProfit > 0;

  // ----------------------------------------------------
  // 5. CHART DATA: 24-HOUR ACCUMULATION AREA CURVES
  // ----------------------------------------------------
  const chartData = useMemo(() => {
    const points = [];
    const hourlyGross = calcHashrateTHs * BASELINE_USD_PER_THS_HOUR;
    const hourlyNetRevenue = hourlyGross * (1 - TOTAL_FINANCIAL_FRICTION_PCT);
    const hourlyCost = calcHourlyCost;

    for (let h = 0; h <= 24; h += 2) {
      const gross = Number((hourlyGross * h).toFixed(2));
      const netRev = Number((hourlyNetRevenue * h).toFixed(2));
      const cost = Number((hourlyCost * h).toFixed(2));
      const netProfit = Number((netRev - cost).toFixed(2));

      points.push({
        hour: `${h}h`,
        grossRevenue: gross,
        netRevenue: netRev,
        saladCost: cost,
        netProfit: netProfit
      });
    }
    return points;
  }, [calcHashrateTHs, calcHourlyCost]);

  // ----------------------------------------------------
  // 6. EXECUTIVE FINANCIAL AUDIT METRICS (FROM EXCEL)
  // ----------------------------------------------------
  const [showHistoryTable, setShowHistoryTable] = useState<boolean>(true);

  // Totals of all historical cycles
  const totalHistoricalCostUSD = useMemo(() => {
    return closedCycles.reduce((acc, c) => acc + (c.totalSaladCostUSD || 0), 0);
  }, [closedCycles]);

  const totalHistoricalGrossUSD = useMemo(() => {
    return closedCycles.reduce((acc, c) => acc + (c.grossRevenueUSD || 0), 0);
  }, [closedCycles]);

  const totalHistoricalNetUSD = useMemo(() => {
    return closedCycles.reduce((acc, c) => acc + (c.netProfitUSD || 0), 0);
  }, [closedCycles]);

  const totalHistoricalHours = useMemo(() => {
    return closedCycles.reduce((acc, c) => acc + (c.durationHours || 0), 0);
  }, [closedCycles]);

  // Formatter helpers
  const formatTimer = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6 pb-20 md:pb-12 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {cycleNotification && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 bg-[#0D1322] border border-[#05F292]/40 shadow-2xl shadow-[#05F292]/10 rounded-xl px-5 py-3 text-sm text-white animate-in slide-in-from-top-5 duration-300">
          <Sparkles className="w-5 h-5 text-[#05F292] animate-spin" />
          <span>{cycleNotification}</span>
        </div>
      )}

      {/* HEADER: TITLE & STATUS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0B0F19]/80 border border-white/[0.06] backdrop-blur-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-[#05F292]/20 to-[#00F0FF]/10 border border-[#05F292]/30 text-[#05F292]">
              <Coins className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold font-display-title text-white tracking-wide flex items-center gap-2">
                Economía, ROI & Ciclos de Minado
                <span className="text-[11px] font-mono font-medium px-2.5 py-0.5 rounded-full bg-[#05F292]/10 text-[#05F292] border border-[#05F292]/20">
                  GoMining Style Engine v1.2
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Supervisión contable estricta en base al modelo Excel: Rendimiento Real Kryptex PRL vs Gasto SaladCloud
              </p>
            </div>
          </div>
        </div>

        {/* Live Fleet Badge */}
        <div className="flex items-center gap-3 bg-[#06080E] p-3 rounded-xl border border-white/[0.08]">
          <div className="relative flex items-center justify-center">
            <span className="w-3 h-3 rounded-full bg-[#05F292] animate-ping absolute" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#05F292]" />
          </div>
          <div className="text-xs">
            <div className="text-slate-400">Flota Detectada en Tiempo Real:</div>
            <div className="font-bold text-white flex items-center gap-2">
              <span className="text-[#05F292] font-mono">{runningCount} GPUs Activas</span>
              <span className="text-slate-500">•</span>
              <span className="text-cyan-300 font-mono">{fleetTotalTHs} TH/s</span>
              <span className="text-slate-500">•</span>
              <span className="text-amber-300 font-mono">${fleetHourlyCost.toFixed(3)}/h</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: LIVE AUTOMATED MINING CYCLE ENGINE                             */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#0F1424] to-[#0A0D17] border border-[#05F292]/30 p-5 md:p-6 shadow-xl shadow-black/40">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#05F292]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#00F0FF]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-5">
          {/* Top Bar of Cycle Tracker */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border ${activeCycle ? 'bg-[#05F292]/10 border-[#05F292]/40 text-[#05F292]' : 'bg-slate-800/40 border-white/[0.08] text-slate-400'}`}>
                <Activity className={`w-5 h-5 ${activeCycle ? 'animate-bounce' : ''}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">
                    {activeCycle ? `Ciclo Activo en Ejecución: ${activeCycle.id}` : 'Ciclos de Minado Automatizados'}
                  </h3>
                  {activeCycle ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#05F292]/20 text-[#05F292] border border-[#05F292]/30 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#05F292]" /> EN VIVO
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-white/[0.05] text-slate-400">
                      En espera de ciclo
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {activeCycle 
                    ? `Iniciado el ${activeCycle.startDateStr} • Telemetría financiera auditada en tiempo real`
                    : 'Registra y concilia automáticamente horas minadas, shares aceptados y costo acumulado de SaladCloud'}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2.5">
              {activeCycle ? (
                <button
                  onClick={handleCloseCycle}
                  disabled={isClosingCycle}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  {isClosingCycle ? 'Cerrando...' : 'Cerrar Ciclo & Conciliar'}
                </button>
              ) : (
                <button
                  onClick={handleStartCycle}
                  disabled={isStartingCycle}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-[#05F292] to-[#00F0FF] hover:opacity-90 text-black shadow-lg shadow-[#05F292]/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {isStartingCycle ? 'Iniciando...' : 'Iniciar Nuevo Ciclo de Minado'}
                </button>
              )}
            </div>
          </div>

          {/* If Cycle is Active: Show Live Metrics Grid */}
          {activeCycle ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* 1. Tiempo Transcurrido */}
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Tiempo Minando</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-white">
                    {formatTimer(elapsedSeconds)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {(elapsedSeconds / 3600).toFixed(2)} horas efectivas
                  </div>
                </div>

                {/* 2. Gasto Real SaladCloud */}
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-amber-500/20">
                  <div className="text-[11px] font-medium text-amber-300 flex items-center gap-1.5 mb-1">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>Gasto Real Salad</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-amber-400">
                    ${((elapsedSeconds / 3600) * (activeCycle.hourlySaladRateUSD ?? fleetHourlyCost ?? 0)).toFixed(3)} USD
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Tasa: ${(activeCycle.hourlySaladRateUSD ?? fleetHourlyCost ?? 0).toFixed(3)}/h
                  </div>
                </div>

                {/* 3. Shares Aceptados Pool */}
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-cyan-500/20">
                  <div className="text-[11px] font-medium text-cyan-300 flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Shares Aceptados</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-cyan-300">
                    {totalAcceptedShares.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-0.5">
                    Kryptex Pool PRL
                  </div>
                </div>

                {/* 4. Ingreso Bruto Acumulado */}
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-1">
                    <Coins className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Ingreso Bruto Pool</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-white">
                    ${((elapsedSeconds / 3600) * (fleetTotalTHs || activeCycle.averageHashrateTHs || 0) * BASELINE_USD_PER_THS_HOUR).toFixed(3)} USD
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Rendimiento PearlHash (PPS)
                  </div>
                </div>

                {/* 5. Ganancia Neta Acumulada & Margen */}
                {(() => {
                  const effectiveHash = fleetTotalTHs || activeCycle.averageHashrateTHs || 0;
                  const effectiveRate = activeCycle.hourlySaladRateUSD ?? fleetHourlyCost ?? 0;
                  const grossAcc = (elapsedSeconds / 3600) * effectiveHash * BASELINE_USD_PER_THS_HOUR;
                  const costAcc = (elapsedSeconds / 3600) * effectiveRate;
                  const frictionAcc = grossAcc * TOTAL_FINANCIAL_FRICTION_PCT;
                  const netAcc = grossAcc - frictionAcc - costAcc;
                  const isPositive = netAcc >= 0;
                  const realRoiRatio = costAcc > 0 ? (grossAcc - frictionAcc) / costAcc : (netAcc > 0 ? 1 : 0);
                  const marginPct = (grossAcc - frictionAcc) > 0 ? (netAcc / (grossAcc - frictionAcc)) * 100 : 0;
                  return (
                    <>
                      <div className={`p-3.5 rounded-xl border ${isPositive ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-rose-950/20 border-rose-500/30'}`}>
                        <div className="text-[11px] font-medium text-emerald-300 flex items-center gap-1.5 mb-1">
                          <TrendingUp className={`w-3.5 h-3.5 ${isPositive ? 'text-[#05F292]' : 'text-rose-400'}`} />
                          <span className={isPositive ? 'text-emerald-300' : 'text-rose-400'}>Ganancia Neta Auditada</span>
                        </div>
                        <div className={`text-lg font-bold font-mono ${isPositive ? 'text-[#05F292]' : 'text-rose-400'}`}>
                          {netAcc >= 0 ? '+' : ''}${netAcc.toFixed(3)} USD
                        </div>
                        <div className={`text-[10px] mt-0.5 ${isPositive ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                          Fricción auditada: -4.56% (spread & retiro)
                        </div>
                      </div>

                      {/* 6. Margen Operativo % */}
                      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-1">
                          <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
                          <span>Margen Operativo</span>
                        </div>
                        <div className={`text-lg font-bold font-mono ${marginPct >= 0 ? 'text-purple-300' : 'text-rose-400'}`}>
                          {marginPct >= 0 ? '+' : ''}{marginPct.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Ratio ROI: {realRoiRatio > 0 ? `${realRoiRatio.toFixed(2)}x` : '--'}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Individual GPU Telemetry Breakdown */}
              <div className="p-4 rounded-xl bg-[#080B14] border border-white/[0.05] space-y-3">
                <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-[#05F292]" /> Desglose Individual por GPU Activa en este Ciclo:
                  </span>
                  <span className="text-[11px] font-normal text-slate-500">
                    Cada GPU debe superar el umbral de 129.1 TH/s para operar en beneficio neto
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {runningWorkers.length === 0 ? (
                    <div className="col-span-full text-center p-6 rounded-lg bg-white/[0.01] border border-dashed border-white/10 text-xs text-slate-400">
                      No hay GPUs activas en ejecución en este momento. La telemetría por GPU se actualizará automáticamente cuando arranquen tus nodos en SaladCloud.
                    </div>
                  ) : (
                    runningWorkers.map((w, idx) => {
                      const gHash = w.currentHashrateTHs || (fleetTotalTHs / (runningWorkers.length || 1));
                      const gCost = w.hourlySaladCost || 0.160;
                      const gGross = gHash * BASELINE_USD_PER_THS_HOUR;
                      const gNet = gGross - gCost;
                      const gMargin = gGross > 0 ? ((gNet / gGross) * 100) : 0;
                      const isOptimal = gHash >= 250;

                      return (
                        <div key={w.id || idx} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-[#05F292]/10 border border-[#05F292]/20 flex items-center justify-center text-[#05F292] font-mono text-xs font-bold">
                              #{idx + 1}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                <span>{w.workerName}</span>
                                <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/15 text-[#05F292] border border-emerald-500/30 font-mono">
                                  {w.saladStatus?.toUpperCase() || 'ONLINE'}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Potencia: <span className="text-cyan-300 font-mono font-medium">{gHash.toFixed(1)} TH/s</span> • Costo: <span className="text-amber-300 font-mono">${gCost.toFixed(3)}/h</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs font-mono font-bold text-[#05F292]">
                              +${gNet.toFixed(4)}/h
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              Margen: +{gMargin.toFixed(1)}% {isOptimal ? '🟢' : '🟡'}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Standby Card */
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.02] border border-dashed border-white/[0.1]">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {runningCount > 0 
                      ? `Flota de ${runningCount} GPU${runningCount > 1 ? 's' : ''} Detectada en Vivo y Lista para Iniciar Ciclo`
                      : 'Flota Lista para Iniciar Ciclo de Telemetría'}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Al iniciar el ciclo, MinerX registrará con precisión matemática cada minuto consumido en SaladCloud, los shares aceptados en Kryptex y la ganancia neta en USD.
                  </p>
                </div>
              </div>
              <button
                onClick={handleStartCycle}
                disabled={isStartingCycle}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-[#05F292] to-[#00F0FF] text-black shadow-lg shadow-[#05F292]/20 hover:opacity-90 transition-all active:scale-95 cursor-pointer"
              >
                {isStartingCycle ? 'Iniciando...' : 'Iniciar Ciclo de Minado'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: GOMINING KPI RIBBON METRICS                                    */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* KPI 1 */}
        <div className="p-4 rounded-2xl bg-[#0B0F19]/80 border border-white/[0.06] backdrop-blur-md relative overflow-hidden group hover:border-[#05F292]/30 transition-all">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Potencia Total Activa</span>
            <Zap className="w-4 h-4 text-[#05F292]" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {fleetTotalTHs} <span className="text-xs font-normal text-slate-400">TH/s</span>
          </div>
          <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
            <Check className="w-3 h-3" /> 2x RTX 4090 al 100%
          </div>
        </div>

        {/* KPI 2 */}
        <div className="p-4 rounded-2xl bg-[#0B0F19]/80 border border-white/[0.06] backdrop-blur-md relative overflow-hidden group hover:border-cyan-500/30 transition-all">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Rendimiento Neto / Hora</span>
            <DollarSign className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#05F292] mt-1">
            +${fleetHourlyNet.toFixed(4)} <span className="text-xs font-normal text-slate-400">USD/h</span>
          </div>
          <div className="text-[11px] text-cyan-300 mt-1">
            +${(fleetHourlyNet * 24).toFixed(2)} USD / día neto estimado
          </div>
        </div>

        {/* KPI 3 */}
        <div className="p-4 rounded-2xl bg-[#0B0F19]/80 border border-white/[0.06] backdrop-blur-md relative overflow-hidden group hover:border-amber-500/30 transition-all">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Costo Operativo Salad</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300 mt-1">
            ${fleetHourlyCost.toFixed(3)} <span className="text-xs font-normal text-slate-400">USD/h</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            ${(fleetHourlyCost * 24).toFixed(2)} USD / 24 horas
          </div>
        </div>

        {/* KPI 4 */}
        <div className="p-4 rounded-2xl bg-[#0B0F19]/80 border border-white/[0.06] backdrop-blur-md relative overflow-hidden group hover:border-purple-500/30 transition-all">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Margen Neto de la Flota</span>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-purple-300 mt-1">
            +{fleetMarginPct.toFixed(1)}%
          </div>
          <div className="text-[11px] text-purple-400 mt-1">
            Punto de Equilibrio: 129.1 TH/s
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: INTERACTIVE SELECTABLE GPU CALCULATOR (NO STATIC TABLE)        */}
      {/* ========================================================================= */}
      <div className="rounded-2xl bg-[#0B0F19]/90 border border-white/[0.08] p-5 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div>
            <h3 className="text-lg font-bold font-display-title text-white flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[#00F0FF]" />
              Calculadora Interactiva de GPUs & Proyecciones de Retorno
            </h3>
            <p className="text-xs text-slate-400">
              Selecciona cualquier tarjeta gráfica o tu flota real para visualizar instantáneamente lo que debes esperar en potencia, costos y ganancias
            </p>
          </div>

          {/* Time Horizon Selector */}
          <div className="flex items-center gap-1 bg-[#06080E] p-1 rounded-xl border border-white/[0.08]">
            {(['1h', '24h', '7d', '30d'] as const).map((h) => (
              <button
                key={h}
                onClick={() => setTimeHorizon(h)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  timeHorizon === h 
                    ? 'bg-[#00F0FF] text-black shadow-md shadow-[#00F0FF]/20 font-bold' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {h === '1h' ? '1 Hora' : h === '24h' ? '24 Horas' : h === '7d' ? '7 Días' : '30 Días'}
              </button>
            ))}
          </div>
        </div>

        {/* 1. SELECTABLE GPU CARDS (VISUAL SELECTOR) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            1. Elige el Modelo de GPU a Simular:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {GPU_PRESETS.map((preset) => {
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => setSelectedPresetId(preset.id)}
                  className={`text-left p-3.5 rounded-xl border transition-all relative flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-b from-[#05F292]/15 to-[#00F0FF]/5 border-[#05F292] shadow-lg shadow-[#05F292]/15 scale-[1.02]'
                      : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.12]'
                  }`}
                >
                  {preset.badge && (
                    <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-md mb-2 self-start ${
                      preset.isLiveFleet
                        ? 'bg-[#05F292]/20 text-[#05F292] border border-[#05F292]/30'
                        : isSelected
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'bg-white/[0.05] text-slate-400'
                    }`}>
                      {preset.badge}
                    </span>
                  )}
                  <div>
                    <div className="text-xs font-bold text-white line-clamp-1">{preset.name}</div>
                    <div className="text-[10px] text-slate-400">{preset.series}</div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-white/[0.06] space-y-0.5 text-[11px] font-mono">
                    <div className="text-cyan-300 font-semibold">{preset.expectedTHs} TH/s</div>
                    <div className="text-slate-400">${preset.hourlyCost.toFixed(3)}/h</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. REPLICAS / FLEET MULTIPLIER SLIDER */}
        <div className="p-4 rounded-xl bg-[#06080E] border border-white/[0.06] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#05F292]" />
              2. Cantidad de GPUs en la Flota: <span className="text-[#05F292] font-mono font-bold text-sm">{calcGpuCount} {calcGpuCount === 1 ? 'GPU' : 'GPUs'}</span>
            </label>

            {/* Quick Multiplier Buttons */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 5, 10, 20, 50].map((num) => (
                <button
                  key={num}
                  onClick={() => setFleetMultiplier(num)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer ${
                    fleetMultiplier === num 
                      ? 'bg-[#05F292] text-black font-bold' 
                      : 'bg-white/[0.04] text-slate-400 hover:text-white'
                  }`}
                >
                  {num}x
                </button>
              ))}
            </div>
          </div>

          <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={fleetMultiplier}
            onChange={(e) => setFleetMultiplier(Number(e.target.value))}
            className="w-full accent-[#05F292] bg-slate-800 h-2 rounded-lg cursor-pointer"
          />
        </div>

        {/* 3. VISUAL PROFITABILITY METER & "LO QUE DEBES ESPERAR" */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Verdict & Safety Margin Gauge */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[#0D1322] to-[#070A12] border border-[#05F292]/30 flex flex-col justify-between space-y-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#05F292] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" /> Veredicto Financiero
              </span>
              <h4 className="text-lg font-bold text-white mt-1">
                {isProfitableSelection ? '🔥 ZONA ALTAMENTE RENTABLE' : '⚠️ OPERACIÓN EN PÉRDIDA'}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                {isProfitableSelection
                  ? `La potencia de cómputo entregada (${(deliveredTHsPerGpu).toFixed(1)} TH/s por GPU) supera con creces el umbral mínimo de rentabilidad (${breakEvenTHsPerGpu.toFixed(1)} TH/s).`
                  : 'El costo de alquiler supera la producción bruta esperada en la pool.'}
              </p>
            </div>

            {/* Visual Safety Margin Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Punto de Equilibrio:</span>
                <span className="text-rose-400 font-bold">{breakEvenTHsPerGpu.toFixed(1)} TH/s</span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden relative">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 via-[#05F292] to-[#00F0FF] rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (deliveredTHsPerGpu / (breakEvenTHsPerGpu * 2.5)) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">Silicio Entregado:</span>
                <span className="text-[#05F292] font-mono font-bold">
                  {deliveredTHsPerGpu.toFixed(1)} TH/s ({safetyMarginPct.toFixed(0)}% de seguridad)
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs space-y-1">
              <div className="text-slate-300 font-semibold flex items-center justify-between">
                <span>Auditoría de Fricción Financiera:</span>
                <span className="text-amber-400 font-mono text-[11px]">-4.56% spread/retiro</span>
              </div>
              <div className="text-slate-400 text-[11px]">
                Descuenta 3.91% de spread oculto Kryptex (PRL→BTC) y 0.65% SPEI/exchange (el 3% de comisión del pool PPS+ ya está incluido en la tasa base). Cada GPU a ${singleGpuCost.toFixed(3)}/h requiere al menos <span className="text-rose-400 font-bold font-mono">{breakEvenTHsPerGpu.toFixed(1)} TH/s</span> netos para no incurrir en pérdidas.
              </div>
            </div>
          </div>

          {/* "Lo que debes esperar": 4 High-Visual Display Cards */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-3">
            {/* Card 1: Hashrate */}
            <div className="p-4 rounded-xl bg-[#06080E] border border-cyan-500/20 flex flex-col justify-between">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Hashrate Total Esperado</span>
                <Zap className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-cyan-300 my-2">
                {calcHashrateTHs.toLocaleString()} <span className="text-xs font-normal text-slate-400">TH/s</span>
              </div>
              <div className="text-[11px] text-slate-500">
                {(calcHashrateTHs * horizonHours).toLocaleString()} TH·h de cómputo en {horizonLabel}
              </div>
            </div>

            {/* Card 2: Cost */}
            <div className="p-4 rounded-xl bg-[#06080E] border border-amber-500/20 flex flex-col justify-between">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Costo SaladCloud ({horizonLabel})</span>
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-400 my-2">
                ${calcTotalSaladCost.toFixed(2)} <span className="text-xs font-normal text-slate-400">USD</span>
              </div>
              <div className="text-[11px] text-slate-500">
                ${(calcTotalSaladCost / horizonHours).toFixed(3)} USD/hora Salad
              </div>
            </div>

            {/* Card 3: Gross Revenue & Friction */}
            <div className="p-4 rounded-xl bg-[#06080E] border border-white/[0.08] flex flex-col justify-between">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Ingreso Bruto / Fricción</span>
                <Coins className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white my-2">
                ${calcTotalGrossRevenue.toFixed(2)} <span className="text-xs font-normal text-slate-400">USD</span>
              </div>
              <div className="text-[11px] text-rose-400 font-mono">
                -${calcTotalFrictionDeduction.toFixed(2)} USD (-4.56% spread & retiro)
              </div>
            </div>

            {/* Card 4: Net Profit (Audited) */}
            <div className={`p-4 rounded-xl border flex flex-col justify-between ${
              isProfitableSelection 
                ? 'bg-gradient-to-br from-emerald-950/30 to-[#06080E] border-emerald-500/30' 
                : 'bg-gradient-to-br from-rose-950/30 to-[#06080E] border-rose-500/40'
            }`}>
              <div className="text-xs flex items-center justify-between">
                <span className={isProfitableSelection ? 'text-emerald-300' : 'text-rose-400'}>
                  {isProfitableSelection ? 'Ganancia Neta Auditada' : '🚨 Pérdida Operativa'}
                </span>
                <TrendingUp className={`w-4 h-4 ${isProfitableSelection ? 'text-[#05F292]' : 'text-rose-400'}`} />
              </div>
              <div className={`text-2xl font-bold font-mono my-2 ${isProfitableSelection ? 'text-[#05F292]' : 'text-rose-400'}`}>
                {calcTotalNetProfit >= 0 ? `+$${calcTotalNetProfit.toFixed(2)}` : `-$${Math.abs(calcTotalNetProfit).toFixed(2)}`} <span className="text-xs font-normal text-slate-400">USD</span>
              </div>
              <div className={`text-[11px] font-bold ${isProfitableSelection ? 'text-emerald-400' : 'text-rose-400'}`}>
                {calcMarginPct.toFixed(1)}% margen neto auditado
              </div>
            </div>
          </div>
        </div>

        {/* 4. RECHARTS AREA CHART: 24H CUMULATIVE CURVES */}
        <div className="space-y-3 pt-3 border-t border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#05F292]" />
              Curva de Acumulación Financiera (24 Horas): Ingreso Bruto vs Gasto Salad vs Ganancia Neta
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-cyan-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#00F0FF]" /> Bruto
              </span>
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#FFAA00]" /> Costo Salad
              </span>
              <span className="flex items-center gap-1.5 text-[#05F292]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#05F292]" /> Ganancia Neta
              </span>
            </div>
          </div>

          <div className="h-64 w-full bg-[#06080E] rounded-xl border border-white/[0.06] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#05F292" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#05F292" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00F0FF" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFAA00" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#FFAA00" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(val) => `$${val}`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#0D1322] border border-white/[0.15] p-3 rounded-xl shadow-2xl text-xs space-y-1 font-mono">
                          <div className="font-bold text-white mb-1.5 text-sm">Tiempo: {label}</div>
                          <div className="text-cyan-300">Ingreso Bruto: ${data.grossRevenue.toFixed(2)} USD</div>
                          <div className="text-amber-400">Gasto Salad: ${data.saladCost.toFixed(2)} USD</div>
                          <div className="text-[#05F292] font-bold text-sm pt-1 border-t border-white/[0.1]">
                            Ganancia Neta: +${data.netProfit.toFixed(2)} USD
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="grossRevenue" stroke="#00F0FF" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                <Area type="monotone" dataKey="saladCost" stroke="#FFAA00" strokeWidth={2} fillOpacity={1} fill="url(#colorCost)" />
                <Area type="monotone" dataKey="netProfit" stroke="#05F292" strokeWidth={2.5} fillOpacity={1} fill="url(#colorNet)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4: LIVE BREAK-EVEN & PROFITABILITY MATRIX (ALL 14 EXCEL GPUS)     */}
      {/* ========================================================================= */}
      <div className="rounded-2xl bg-[#0B0F19]/90 border border-white/[0.08] p-5 md:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div>
            <h3 className="text-lg font-bold font-display-title text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#05F292]" />
              Matriz de Rentabilidad & Punto de Equilibrio (14 GPUs Verificadas del Excel)
            </h3>
            <p className="text-xs text-slate-400">
              Comparativa de potencia real, costo por hora en SaladCloud, hashrate mínimo de equilibrio y margen proyectado
            </p>
          </div>

          <div className="flex items-center gap-2 bg-[#06080E] px-3 py-1.5 rounded-xl border border-white/[0.08]">
            <span className="text-xs text-slate-400">Yield Base PPS:</span>
            <span className="text-sm font-bold font-mono text-[#00F0FF]">${BASELINE_USD_PER_THS_HOUR} USD/TH/h</span>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-[#06080E]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.02] text-slate-400 font-mono">
                <th className="py-3 px-4">Modelo GPU</th>
                <th className="py-3 px-3">VRAM</th>
                <th className="py-3 px-3">TH/s Base</th>
                <th className="py-3 px-3">Costo Salad/h</th>
                <th className="py-3 px-3">Ingreso/día</th>
                <th className="py-3 px-3">Neto/día</th>
                <th className="py-3 px-3">Punto Equilibrio</th>
                <th className="py-3 px-3">Margen %</th>
                <th className="py-3 px-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] font-mono">
              {VERIFIED_EXCEL_GPUS.filter(g => !g.isLiveFleet).map((gpu) => {
                const dayGross = gpu.expectedTHs * BASELINE_USD_PER_THS_HOUR * 24;
                const dayCost = gpu.dailyCost;
                const dayNet = dayGross - dayCost;
                const breakEven = calculateBreakEvenTHs(gpu.hourlyCost, BASELINE_USD_PER_THS_HOUR);
                const margin = dayGross > 0 ? (dayNet / dayGross) * 100 : 0;
                const isProfitable = dayNet > 0;

                return (
                  <tr 
                    key={gpu.id} 
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-bold text-white flex items-center gap-2">
                        {gpu.name}
                        {gpu.badge && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            {gpu.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-sans">{gpu.series}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-300">{gpu.vram} GB</td>
                    <td className="py-3 px-3 text-cyan-300 font-bold">{gpu.expectedTHs} TH/s</td>
                    <td className="py-3 px-3 text-slate-300">${gpu.hourlyCost.toFixed(3)}</td>
                    <td className="py-3 px-3 text-slate-200">${dayGross.toFixed(2)}</td>
                    <td className="py-3 px-3">
                      <span className={`font-bold ${isProfitable ? 'text-[#05F292]' : 'text-rose-400'}`}>
                        {isProfitable ? '+' : ''}${dayNet.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-amber-400">{breakEven} TH/s</span>
                      <span className="text-[10px] text-slate-500 ml-1">
                        ({gpu.expectedTHs > breakEven ? `+${(gpu.expectedTHs - breakEven).toFixed(0)}` : (gpu.expectedTHs - breakEven).toFixed(0)})
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        margin >= 25 
                          ? 'bg-[#05F292]/15 text-[#05F292] border border-[#05F292]/30' 
                          : margin > 0 
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => setSelectedPresetId(gpu.id)}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-[#05F292] hover:text-black text-slate-300 text-[11px] font-sans font-semibold transition-all cursor-pointer"
                      >
                        Simular
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>



      {/* ========================================================================= */}
      {/* SECTION 6: PERSISTENT HISTORICAL CYCLES LOG & AUDIT                       */}
      {/* ========================================================================= */}
      <div className="rounded-2xl bg-[#0B0F19]/90 border border-white/[0.08] p-5 md:p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div>
            <h3 className="text-lg font-bold font-display-title text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-400" />
              Historial de Ciclos de Minado Auditados
              <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-400">
                {closedCycles.length} ciclos cerrados
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Registro histórico persistente de cada ciclo finalizado, potencia consumida y ganancia neta verificada
            </p>
          </div>

          <button
            onClick={() => setShowHistoryTable(!showHistoryTable)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 transition-all cursor-pointer"
          >
            {showHistoryTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showHistoryTable ? 'Ocultar Detalle' : 'Mostrar Detalle'}
          </button>
        </div>

        {/* Historical Summary Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-[#06080E] border border-white/[0.06]">
            <div className="text-[11px] text-slate-400">Horas Totales Auditadas</div>
            <div className="text-lg font-bold font-mono text-white mt-1">
              {totalHistoricalHours.toFixed(2)} hrs
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[#06080E] border border-white/[0.06]">
            <div className="text-[11px] text-slate-400">Costo Acumulado Salad</div>
            <div className="text-lg font-bold font-mono text-amber-400 mt-1">
              ${totalHistoricalCostUSD.toFixed(2)} USD
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[#06080E] border border-white/[0.06]">
            <div className="text-[11px] text-slate-400">Ingreso Bruto Cripto</div>
            <div className="text-lg font-bold font-mono text-white mt-1">
              ${totalHistoricalGrossUSD.toFixed(2)} USD
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
            <div className="text-[11px] text-emerald-400">Ganancia Neta Auditada</div>
            <div className="text-lg font-bold font-mono text-[#05F292] mt-1">
              +${totalHistoricalNetUSD.toFixed(2)} USD
            </div>
          </div>
        </div>

        {/* Detailed Cycles Cards List */}
        {showHistoryTable && (
          <div className="space-y-3 pt-2">
            {closedCycles.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-white/[0.01] border border-dashed border-white/10 space-y-2">
                <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                <div className="text-sm font-semibold text-slate-300">0 Ciclos Cerrados en Historial</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  La base de datos se encuentra limpia y lista para registrar tus ciclos desde cero. Inicia un ciclo arriba para auditar en tiempo real tus horas minadas y rentabilidad real.
                </p>
              </div>
            ) : (
              closedCycles.map((cycle) => (
                <div 
                  key={cycle.id}
                  className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all space-y-3"
                >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-white/[0.06] text-white border border-white/[0.1]">
                      {cycle.id}
                    </span>
                    <span className="text-xs font-medium text-slate-300">
                      {cycle.startDateStr} → {cycle.endDateStr || 'Finalizado'}
                    </span>
                    <span className="text-xs font-mono text-cyan-300">
                      ({cycle.durationHours}h efectivas)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      {cycle.activeGpuCount}x {cycle.gpuModel.replace('NVIDIA GeForce ', '')}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#05F292]/10 text-[#05F292] border border-[#05F292]/20 font-bold">
                      +{cycle.roiPct}% ROI
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono pt-2 border-t border-white/[0.04]">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Costo Salad:</span>
                    <span className="text-amber-400 font-bold">${cycle.totalSaladCostUSD.toFixed(2)} USD</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Potencia Media:</span>
                    <span className="text-cyan-300 font-bold">{cycle.averageHashrateTHs} TH/s</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Ingreso Bruto:</span>
                    <span className="text-white font-bold">${cycle.grossRevenueUSD.toFixed(2)} USD</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Ganancia Neta:</span>
                    <span className="text-[#05F292] font-bold">+${cycle.netProfitUSD.toFixed(2)} USD</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Retorno ROI:</span>
                    <span className="text-emerald-400 font-bold">{cycle.roiPct}%</span>
                  </div>
                </div>

                {cycle.notes && (
                  <div className="text-[11px] text-slate-400 italic pt-1 border-t border-white/[0.03]">
                    "{cycle.notes}"
                  </div>
                )}
              </div>
            ))
          )}
          </div>
        )}
      </div>
    </div>
  );
};
