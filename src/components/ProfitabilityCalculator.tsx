import React, { useState, useMemo } from 'react';
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Cpu,
  DollarSign,
  Activity,
  RotateCcw
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar
} from 'recharts';
import {
  calculateProfitability,
  VERIFIED_BENCHMARKS
} from '../services/profitabilityService';
import type {
  ProfitabilityInput,
  DataTrustSource
} from '../types/profitability';
import { BASELINE_USD_PER_THS_HOUR } from '../data/gpuBenchmarks';

interface ProfitabilityCalculatorProps {
  onSelectOfferForSimulation?: (offer: any) => void;
}

export const ProfitabilityCalculator: React.FC<ProfitabilityCalculatorProps> = () => {
  // 1. Interactive Form State
  const [provider, setProvider] = useState<'vastai' | 'salad' | 'generic'>('vastai');
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string>('rtx4090-kryptex-oct2026');
  const [gpuModel, setGpuModel] = useState<string>('RTX 4090');
  const [gpuCount, setGpuCount] = useState<number>(1);
  const [algorithm, setAlgorithm] = useState<string>('PearlHash (PRL)');

  // Hashrates
  const [referenceHashrateTHs, setReferenceHashrateTHs] = useState<number>(293);
  const [measuredHashrateTHs, setMeasuredHashrateTHs] = useState<string>('');

  // Costs
  const [hourlyComputeCostUSD, setHourlyComputeCostUSD] = useState<number>(0.28);
  const [hourlyStorageCostUSD, setHourlyStorageCostUSD] = useState<number>(0.02);
  const [hourlyOtherCostUSD, setHourlyOtherCostUSD] = useState<number>(0.00);

  // Time & Uptime
  const [billableHoursPerDay, setBillableHoursPerDay] = useState<number>(24);
  const [expectedUptimePct, setExpectedUptimePct] = useState<number>(98);

  // Market & Rewards
  const [prlPriceUSD, setPrlPriceUSD] = useState<number>(0.40);
  const [rewardUSDPerTHh, setRewardUSDPerTHh] = useState<number>(BASELINE_USD_PER_THS_HOUR);

  // Friction & Operations
  const [poolFeePct, setPoolFeePct] = useState<number>(2);
  const [minerFeePct, setMinerFeePct] = useState<number>(1);
  const [rejectedSharePct, setRejectedSharePct] = useState<number>(0.5);
  const [warmupMinutes, setWarmupMinutes] = useState<number>(5);
  const [safetyMarginPct, setSafetyMarginPct] = useState<number>(15);

  // Time Window toggle: '1h' | '24h' | '7d' | '30d'
  const [timeWindow, setTimeWindow] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  // Sensitivity Metric toggle: 'cost' | 'hashrate'
  const [sensitivityMetric, setSensitivityMetric] = useState<'cost' | 'hashrate'>('cost');

  // Trust Source
  const [sourceType, setSourceType] = useState<DataTrustSource>('EXTERNAL_BENCHMARK');

  // Handle Preset Selection
  const handleBenchmarkSelect = (bId: string) => {
    setSelectedBenchmarkId(bId);
    const bm = VERIFIED_BENCHMARKS.find((b) => b.id === bId);
    if (bm) {
      setGpuModel(bm.gpuModel);
      setReferenceHashrateTHs(bm.hashrateTHs);
      setAlgorithm(bm.algorithm);
      setSourceType(bm.confidence === 'SIMULATED' ? 'SIMULATED' : 'EXTERNAL_BENCHMARK');
    }
  };

  // 2. Perform Pure Mathematical Calculation
  const calculation = useMemo(() => {
    const input: ProfitabilityInput = {
      provider,
      gpuModel,
      gpuCount,
      algorithm,
      referenceHashrateTHs,
      measuredHashrateTHs: measuredHashrateTHs ? parseFloat(measuredHashrateTHs) : undefined,
      hourlyComputeCostUSD,
      hourlyStorageCostUSD,
      hourlyOtherCostUSD,
      billableHoursPerDay,
      expectedUptimePct,
      prlPriceUSD,
      rewardUSDPerTHh,
      poolFeePct,
      minerFeePct,
      rejectedSharePct,
      warmupMinutes,
      safetyMarginPct,
      sourceType
    };

    return calculateProfitability(input);
  }, [
    provider,
    gpuModel,
    gpuCount,
    algorithm,
    referenceHashrateTHs,
    measuredHashrateTHs,
    hourlyComputeCostUSD,
    hourlyStorageCostUSD,
    hourlyOtherCostUSD,
    billableHoursPerDay,
    expectedUptimePct,
    prlPriceUSD,
    rewardUSDPerTHh,
    poolFeePct,
    minerFeePct,
    rejectedSharePct,
    warmupMinutes,
    safetyMarginPct,
    sourceType
  ]);

  // Multiplier based on timeWindow
  const windowMultiplier = useMemo(() => {
    switch (timeWindow) {
      case '1h':
        return 1;
      case '24h':
        return billableHoursPerDay;
      case '7d':
        return billableHoursPerDay * 7;
      case '30d':
        return billableHoursPerDay * 30;
      default:
        return billableHoursPerDay;
    }
  }, [timeWindow, billableHoursPerDay]);

  const windowGrossUSD = calculation.grossHourlyUSD * windowMultiplier;
  const windowCostUSD = calculation.totalHourlyCostUSD * windowMultiplier;
  const windowNetUSD = calculation.netHourlyProfitUSD * windowMultiplier;

  // 3. Generate Sensitivity Curves for Interactive Charts
  const costSensitivityData = useMemo(() => {
    const points = [];
    const baseCost = hourlyComputeCostUSD;
    const minC = Math.max(0.05, baseCost * 0.5);
    const maxC = baseCost * 2.0;
    const step = (maxC - minC) / 10;

    for (let c = minC; c <= maxC + 0.001; c += step) {
      const totalCost = (c * gpuCount) + hourlyStorageCostUSD + hourlyOtherCostUSD;
      const netHourly = (calculation.grossHourlyUSD * (1 - ((poolFeePct + minerFeePct) / 100))) - totalCost;
      points.push({
        label: `$${c.toFixed(2)}`,
        netDaily: Number((netHourly * billableHoursPerDay).toFixed(3))
      });
    }
    return points;
  }, [
    hourlyComputeCostUSD,
    gpuCount,
    hourlyStorageCostUSD,
    hourlyOtherCostUSD,
    calculation.grossHourlyUSD,
    poolFeePct,
    minerFeePct,
    billableHoursPerDay
  ]);

  const hashrateSensitivityData = useMemo(() => {
    const points = [];
    const baseHash = referenceHashrateTHs * gpuCount;
    const minH = Math.max(50, baseHash * 0.6);
    const maxH = baseHash * 1.5;
    const step = (maxH - minH) / 10;

    for (let h = minH; h <= maxH + 0.001; h += step) {
      const gross = h * (expectedUptimePct / 100) * (1 - (rejectedSharePct / 100)) * rewardUSDPerTHh;
      const netMining = gross * (1 - ((poolFeePct + minerFeePct) / 100));
      const net = netMining - calculation.totalHourlyCostUSD;
      points.push({
        label: `${Math.round(h)}TH`,
        netDaily: Number((net * billableHoursPerDay).toFixed(3))
      });
    }
    return points;
  }, [
    referenceHashrateTHs,
    gpuCount,
    expectedUptimePct,
    rejectedSharePct,
    rewardUSDPerTHh,
    poolFeePct,
    minerFeePct,
    calculation.totalHourlyCostUSD,
    billableHoursPerDay
  ]);

  const scenariosComparisonData = [
    {
      name: 'Conservador',
      netDaily: calculation.scenarios.conservative.dailyNetUSD,
      margin: calculation.scenarios.conservative.marginPct
    },
    {
      name: 'Base Nominal',
      netDaily: calculation.scenarios.base.dailyNetUSD,
      margin: calculation.scenarios.base.marginPct
    },
    {
      name: 'Optimista',
      netDaily: calculation.scenarios.optimistic.dailyNetUSD,
      margin: calculation.scenarios.optimistic.marginPct
    }
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Provenance Notice */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/80 p-5 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 text-cyan-400">
              <Calculator className="h-6 w-6 text-[#05F292]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white font-rajdhani tracking-wide">
                  Calculadora Realista de Rentabilidad Cloud GPU
                </h2>
                <span className="rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  Vast.ai & Salad
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluación financiera pura basada en benchmarks de silicio, mediciones de pool y costos de alquiler verificados.
              </p>
            </div>
          </div>

          {/* Trust Provenance Badge */}
          <div className="flex items-center gap-2 bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs">
            <span className="text-slate-400 text-[11px]">Nivel de Confianza:</span>
            <span
              className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase border ${
                sourceType === 'INSTANCE_MEASURED'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : sourceType === 'EXTERNAL_BENCHMARK'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : sourceType === 'SIMULATED'
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
            >
              {sourceType}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Interactive Input Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Hardware & Preset Config */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/80 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Cpu className="h-4 w-4 text-cyan-400" />
              <span>1. Configuración de Hardware & Proveedor</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">STEP 1</span>
          </div>

          {/* Provider Selection */}
          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1.5">
              Proveedor de Cómputo
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setProvider('vastai');
                  setHourlyComputeCostUSD(0.28);
                  setHourlyStorageCostUSD(0.02);
                }}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  provider === 'vastai'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                    : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06]'
                }`}
              >
                Vast.ai
              </button>
              <button
                type="button"
                onClick={() => {
                  setProvider('salad');
                  setHourlyComputeCostUSD(0.16);
                  setHourlyStorageCostUSD(0.00);
                }}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  provider === 'salad'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(5,242,146,0.2)]'
                    : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06]'
                }`}
              >
                SaladCloud
              </button>
              <button
                type="button"
                onClick={() => {
                  setProvider('generic');
                  setSourceType('SIMULATED');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  provider === 'generic'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                    : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06]'
                }`}
              >
                Simulador
              </button>
            </div>
          </div>

          {/* Benchmark Preset Selector */}
          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1.5">
              Benchmark Verificado de Referencia
            </label>
            <select
              value={selectedBenchmarkId}
              onChange={(e) => handleBenchmarkSelect(e.target.value)}
              className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
            >
              {VERIFIED_BENCHMARKS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.gpuModel} — {b.hashrateTHs} TH/s ({b.sourceName.substring(0, 32)}...)
                </option>
              ))}
            </select>
          </div>

          {/* GPU Count & Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">
                Modelo GPU
              </label>
              <input
                type="text"
                value={gpuModel}
                onChange={(e) => setGpuModel(e.target.value)}
                className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">
                Cantidad GPUs
              </label>
              <input
                type="number"
                min="1"
                max="64"
                value={gpuCount}
                onChange={(e) => setGpuCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
          </div>

          {/* Reference TH/s vs Measured TH/s */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">
                TH/s Referencia (x1)
              </label>
              <input
                type="number"
                step="1"
                value={referenceHashrateTHs}
                onChange={(e) => setReferenceHashrateTHs(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">
                TH/s Medido (Opcional)
              </label>
              <input
                type="number"
                step="1"
                placeholder="Auto o Real"
                value={measuredHashrateTHs}
                onChange={(e) => {
                  setMeasuredHashrateTHs(e.target.value);
                  if (e.target.value) setSourceType('INSTANCE_MEASURED');
                }}
                className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-emerald-400 placeholder-slate-600 focus:outline-none focus:border-emerald-400 font-mono"
              />
            </div>
          </div>

          {/* Algorithm selection */}
          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1">
              Algoritmo & Criptoactivo
            </label>
            <input
              type="text"
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value)}
              className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>
        </div>

        {/* Center Column: Costs & Financial Assumptions */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/80 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              <span>2. Costos de Alquiler & Fricción</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">STEP 2</span>
          </div>

          {/* Hourly Compute & Storage Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">
                Costo Cómputo ($/h/GPU)
              </label>
              <input
                type="number"
                step="0.005"
                min="0"
                value={hourlyComputeCostUSD}
                onChange={(e) => setHourlyComputeCostUSD(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">
                Disco/Almacén ($/h Instancia)
              </label>
              <input
                type="number"
                step="0.005"
                min="0"
                value={hourlyStorageCostUSD}
                onChange={(e) => setHourlyStorageCostUSD(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
          </div>

          {/* Other Cost */}
          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1">
              Otros Costos Adicionales ($/h)
            </label>
            <input
              type="number"
              step="0.005"
              min="0"
              value={hourlyOtherCostUSD}
              onChange={(e) => setHourlyOtherCostUSD(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          {/* Billable Hours & Expected Uptime */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">
                Horas Facturadas / Día
              </label>
              <input
                type="number"
                min="1"
                max="24"
                value={billableHoursPerDay}
                onChange={(e) => setBillableHoursPerDay(Math.min(24, Math.max(1, parseInt(e.target.value) || 24)))}
                className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">
                Disponibilidad / Uptime (%)
              </label>
              <input
                type="number"
                min="10"
                max="100"
                value={expectedUptimePct}
                onChange={(e) => setExpectedUptimePct(Math.min(100, Math.max(1, parseFloat(e.target.value) || 100)))}
                className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
          </div>

          {/* Fees & Warmup */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Pool Fee (%)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="20"
                value={poolFeePct}
                onChange={(e) => setPoolFeePct(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Miner Fee (%)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="10"
                value={minerFeePct}
                onChange={(e) => setMinerFeePct(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Warmup (Min)
              </label>
              <input
                type="number"
                min="0"
                max="60"
                value={warmupMinutes}
                onChange={(e) => setWarmupMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Rejected shares */}
          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1">
              Shares Rechazados Estimados (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="20"
              value={rejectedSharePct}
              onChange={(e) => setRejectedSharePct(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono"
            />
          </div>
        </div>

        {/* Right Column: Pool Yield & PRL Spot Market */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/80 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <TrendingUp className="h-4 w-4 text-amber-400" />
              <span>3. Recompensa Pool & Spot PRL</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">STEP 3</span>
          </div>

          {/* Reward Rate USD per TH·h */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-slate-400 font-medium">
                Tasa Recompensa (USD / TH·h)
              </label>
              <button
                type="button"
                onClick={() => setRewardUSDPerTHh(BASELINE_USD_PER_THS_HOUR)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>Restablecer PPS</span>
              </button>
            </div>
            <input
              type="number"
              step="0.00001"
              min="0"
              value={rewardUSDPerTHh}
              onChange={(e) => setRewardUSDPerTHh(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-amber-300 focus:outline-none focus:border-amber-400 font-mono font-bold"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Base PPS Kryptex PRL: ${BASELINE_USD_PER_THS_HOUR} / TH·h (Octubre 2026).
            </p>
          </div>

          {/* PRL Price USD */}
          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1">
              Precio Spot PRL ($ USD)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={prlPriceUSD}
              onChange={(e) => setPrlPriceUSD(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          {/* Safety Margin */}
          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1">
              Margen de Seguridad Requerido (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={safetyMarginPct}
              onChange={(e) => setSafetyMarginPct(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full bg-[#06080E] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          {/* Time Window Buttons */}
          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1.5">
              Periodo de Proyección
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['1h', '24h', '7d', '30d'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setTimeWindow(period)}
                  className={`py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    timeWindow === period
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                      : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06]'
                  }`}
                >
                  {period === '1h' ? '1 Hora' : period === '24h' ? '24 Horas' : period === '7d' ? '7 Días' : '30 Días'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Real-Time Output KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Effective Hashrate & Ratio */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/80 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-mono flex items-center justify-between">
            <span>Hashrate Efectivo</span>
            <Activity className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
            {calculation.effectiveHashrateTHs.toLocaleString()} <span className="text-xs text-slate-400">TH/s</span>
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
            <span>Ratio vs Ref:</span>
            <span className={`font-mono font-bold ${calculation.performanceRatioPct >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {calculation.performanceRatioPct}%
            </span>
          </div>
        </div>

        {/* Card 2: Revenue for Window */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/80 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-mono flex items-center justify-between">
            <span>Ingreso Bruto ({timeWindow})</span>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            ${windowGrossUSD.toFixed(3)}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            ${calculation.grossHourlyUSD.toFixed(4)} / hora cómputo
          </div>
        </div>

        {/* Card 3: Total Cost for Window */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/80 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-mono flex items-center justify-between">
            <span>Costo Total ({timeWindow})</span>
            <DollarSign className="h-3.5 w-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
            ${windowCostUSD.toFixed(3)}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Cómputo: ${calculation.totalComputeCostHourlyUSD.toFixed(2)}/h • Disco: ${calculation.totalStorageCostHourlyUSD.toFixed(3)}/h
          </div>
        </div>

        {/* Card 4: Net Profit & Margin */}
        <div className={`rounded-2xl border p-4 ${
          windowNetUSD >= 0
            ? 'border-emerald-500/30 bg-emerald-950/20'
            : 'border-rose-500/30 bg-rose-950/20'
        }`}>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono flex items-center justify-between">
            <span>Beneficio Neto ({timeWindow})</span>
            {windowNetUSD >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-[#05F292]" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
            )}
          </div>
          <div className={`text-2xl font-bold font-mono mt-1 ${
            windowNetUSD >= 0 ? 'text-[#05F292]' : 'text-rose-400'
          }`}>
            {windowNetUSD >= 0 ? '+' : ''}${windowNetUSD.toFixed(3)}
          </div>
          <div className="text-xs text-slate-300 mt-2 flex items-center justify-between">
            <span>Margen Neto:</span>
            <span className={`font-mono font-bold ${calculation.netProfitMarginPct >= 0 ? 'text-[#05F292]' : 'text-rose-400'}`}>
              {calculation.netProfitMarginPct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* 4. Break-Even & Risk Analysis Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/60 p-4">
          <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">Break-Even Alquiler</span>
          <div className="text-lg font-bold text-white font-mono mt-1">
            ${calculation.breakEvenHourlyRentUSD.toFixed(4)} <span className="text-xs text-slate-500">/ GPU / h</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Precio máximo de alquiler por GPU para no entrar en pérdida.
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/60 p-4">
          <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">TH/s Mínimos Requeridos</span>
          <div className="text-lg font-bold text-amber-400 font-mono mt-1">
            {calculation.breakEvenHashrateTHs === Infinity ? 'N/A' : `${calculation.breakEvenHashrateTHs.toLocaleString()} TH/s`}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Hashrate necesario para pagar el 100% de los costos por hora.
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/60 p-4">
          <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">Pérdida en Warmup</span>
          <div className="text-lg font-bold text-rose-400 font-mono mt-1">
            ${calculation.potentialWarmupLossUSD.toFixed(4)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Costo pagado durante los {warmupMinutes} min de arranque sin minar.
          </p>
        </div>
      </div>

      {/* 5. Sensitivity & Stress Test Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Interactive Sensitivity Curve (Toggleable Cost vs Hashrate) */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" />
                <span>Curva de Sensibilidad: Ganancia Neta Diaria</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Impacto de variaciones en {sensitivityMetric === 'cost' ? 'costo por hora' : 'hashrate entregado'}
              </p>
            </div>

            <div className="flex items-center gap-1 bg-[#06080E] p-1 rounded-xl border border-white/[0.06]">
              <button
                type="button"
                onClick={() => setSensitivityMetric('cost')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                  sensitivityMetric === 'cost' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                $/h
              </button>
              <button
                type="button"
                onClick={() => setSensitivityMetric('hashrate')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                  sensitivityMetric === 'hashrate' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                TH/s
              </button>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sensitivityMetric === 'cost' ? costSensitivityData : hashrateSensitivityData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#05F292" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#05F292" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                <XAxis dataKey="label" stroke="#6B7280" fontSize={11} />
                <YAxis stroke="#6B7280" fontSize={11} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#06080E', borderColor: '#374151', borderRadius: '0.75rem', fontSize: '12px' }}
                  formatter={(val: any) => [`$${val} USD`, 'Ganancia Neta / Día']}
                />
                <Area type="monotone" dataKey="netDaily" stroke="#05F292" strokeWidth={2} fillOpacity={1} fill="url(#profitGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Scenario Comparison (Conservative, Nominal, Optimistic) */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E121C]/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Escenarios de Estrés (Test de Resiliencia)</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Comparativa Conservador (-15%), Nominal Base y Optimista (+10%)
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scenariosComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                <XAxis dataKey="name" stroke="#6B7280" fontSize={11} />
                <YAxis stroke="#6B7280" fontSize={11} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#06080E', borderColor: '#374151', borderRadius: '0.75rem', fontSize: '12px' }}
                  formatter={(val: any) => [`$${val} USD`, 'Neto Diario']}
                />
                <Bar dataKey="netDaily" fill="#06B6D4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
