import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiFetch } from '../utils/apiConfig';
import { 
  Cpu, 
  Search, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Table, 
  LayoutGrid,
  Terminal,
  X,
  Copy,
  Check,
  Wallet,
  DollarSign,
  Edit3,
  Layers,
  Zap,
  Radio,
  Server,
  ShieldAlert,
  Play,
  Square,
  Sliders,
  Gauge,
  Plus,
  Minus,
  ExternalLink
} from 'lucide-react';
import { calculateBreakEvenTHs, BASELINE_USD_PER_THS_HOUR, resolveGpuBenchmark } from '../data/gpuBenchmarks';
import type { MergedGPUWorker, SaladAccountConfig, SaladBalanceInfo, SaladQuotas } from '../types/minerx';
import { VastFleetSection } from './VastFleetSection';

interface FleetTabProps {
  workers: MergedGPUWorker[];
  accounts: SaladAccountConfig[];
  saladBalance?: SaladBalanceInfo | null;
  onUpdateAccountBalance?: (accountId: string, newBalanceUSD: number) => void;
  onOpenReallocate: (worker: MergedGPUWorker) => void;
  onRefreshTelemetry?: () => void;
  isDarkTheme?: boolean;
}

export const FleetTab: React.FC<FleetTabProps> = ({
  workers,
  accounts,
  saladBalance,
  onUpdateAccountBalance,
  onOpenReallocate,
  onRefreshTelemetry,
  isDarkTheme = false,
}) => {
  const isLight = !isDarkTheme;
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [fleetProvider, setFleetProvider] = useState<'SALAD' | 'VAST'>('SALAD');

  // Container Group Interactive Replicas & Action State
  const [groupReplicasInput, setGroupReplicasInput] = useState<Record<string, number>>({});
  const [groupActionLoading, setGroupActionLoading] = useState<Record<string, boolean>>({});
  const [groupActionMessage, setGroupActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // SaladCloud Quotas Modal State
  const [showQuotasModal, setShowQuotasModal] = useState<boolean>(false);
  const [quotasLoading, setQuotasLoading] = useState<boolean>(false);
  const [quotasData, setQuotasData] = useState<SaladQuotas | null>(null);
  const [quotasOrg, setQuotasOrg] = useState<string>('');

  // Remote Container Logs state (Streaming en Vivo)
  const [logsWorker, setLogsWorker] = useState<MergedGPUWorker | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsRefreshing, setLogsRefreshing] = useState(false);
  const [logsList, setLogsList] = useState<any[]>([]);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Edit Balance Modal state
  const [editingAccount, setEditingAccount] = useState<{ id: string; name: string; currentBalance: number } | null>(null);
  const [balanceInput, setBalanceInput] = useState<string>('');

  const fetchLogs = useCallback(async (w: MergedGPUWorker, isSilent = false) => {
    if (!isSilent) setLogsLoading(true);
    else setLogsRefreshing(true);
    try {
      const acc = accounts.find((a) => a.id === w.accountId) || accounts[0];
      const org = acc?.organizationName || 'desing-canva';
      const proj = acc?.projectName || 'default';
      const group = w.containerGroupName || 'comfyui-video-wan25';
      const inst = w.id || w.machineId || 'node-01';

      const res = await apiFetch(
        `/api/salad/logs/${encodeURIComponent(org)}/${encodeURIComponent(proj)}/${encodeURIComponent(group)}/${encodeURIComponent(inst)}`
      );
      if (res.ok) {
        const data = await res.json();
        setLogsList(data.logs || []);
      }
    } catch {
      if (!isSilent) setLogsList([]);
    } finally {
      setLogsLoading(false);
      setLogsRefreshing(false);
    }
  }, [accounts]);

  const handleOpenLogs = (w: MergedGPUWorker) => {
    setLogsWorker(w);
    setLogsList([]);
    fetchLogs(w, false);
  };

  // Streaming en tiempo real: sondea logs cada 3.5 segundos mientras la terminal esté abierta
  useEffect(() => {
    if (!logsWorker) return;
    const timer = setInterval(() => {
      fetchLogs(logsWorker, true);
    }, 3500);
    return () => clearInterval(timer);
  }, [logsWorker, fetchLogs]);

  // Auto-scroll hacia los últimos logs recibidos
  useEffect(() => {
    if (logsWorker && autoScrollLogs && logsList.length > 0) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsList, logsWorker, autoScrollLogs]);

  const handleCopyLogs = () => {
    const raw = logsList.map((l) => `[${l.timestamp}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(raw);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleSaveBalance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount || !onUpdateAccountBalance) return;
    const num = parseFloat(balanceInput);
    if (!isNaN(num) && num >= 0) {
      onUpdateAccountBalance(editingAccount.id, num);
      setEditingAccount(null);
    }
  };

  const handleGroupAction = async (grp: any, action: 'start' | 'stop' | 'scale', requestedReplicas?: number) => {
    const acc = accounts.find((a) => a.id === grp.accountId) || accounts[0];
    if (!acc || !acc.apiKey || !acc.organizationName) {
      setGroupActionMessage({ text: 'Configura la API Key y Organización para ejecutar acciones en SaladCloud', type: 'error' });
      return;
    }
    const targetReplicas = requestedReplicas !== undefined ? requestedReplicas : (groupReplicasInput[grp.groupName] ?? grp.totalReplicas);
    setGroupActionLoading((prev) => ({ ...prev, [grp.groupName]: true }));
    setGroupActionMessage(null);
    try {
      const res = await apiFetch('/api/salad/container-group/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: grp.organizationName || acc.organizationName,
          projectName: acc.projectName || 'default',
          containerGroupName: grp.groupName,
          action,
          replicas: targetReplicas,
          apiKey: acc.apiKey
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGroupActionMessage({ text: data.message || `Acción '${action}' ejecutada exitosamente en SaladCloud`, type: 'success' });
        setTimeout(() => {
          onRefreshTelemetry?.();
        }, 1500);
      } else {
        setGroupActionMessage({ text: data.message || 'Error al ejecutar comando en SaladCloud', type: 'error' });
      }
    } catch (err: any) {
      setGroupActionMessage({ text: err.message || 'Error de red con SaladCloud', type: 'error' });
    } finally {
      setGroupActionLoading((prev) => ({ ...prev, [grp.groupName]: false }));
    }
  };

  const handleOpenQuotas = async (acc?: SaladAccountConfig) => {
    const targetAcc = acc || accounts[0];
    if (!targetAcc || !targetAcc.organizationName || !targetAcc.apiKey) {
      setGroupActionMessage({ text: 'Configura una cuenta con Organización y API Key para consultar cuotas', type: 'error' });
      return;
    }
    setShowQuotasModal(true);
    setQuotasLoading(true);
    setQuotasOrg(targetAcc.organizationName);
    try {
      const res = await apiFetch(`/api/salad/quotas?org=${encodeURIComponent(targetAcc.organizationName)}`, {
        headers: { 'Salad-Api-Key': targetAcc.apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        setQuotasData(data.quotas);
      } else {
        setQuotasData(null);
      }
    } catch {
      setQuotasData(null);
    } finally {
      setQuotasLoading(false);
    }
  };

  // Fleet Capacity Metrics Breakdown
  const totalReplicas = workers.length;
  const runningWorkers = workers.filter((w) => w.saladStatus === 'running');
  const allocatingWorkers = workers.filter((w) => w.saladStatus === 'allocating');
  const runningCount = runningWorkers.length;
  const allocatingCount = allocatingWorkers.length;
  
  // Local Salad Log Hashrate vs Pool Hashrate
  const totalSaladLogHashTHs = Number(
    runningWorkers.reduce((acc, w) => acc + (w.saladLogHashrateTHs ?? w.currentHashrateTHs ?? 0), 0).toFixed(1)
  );
  const poolReportedHashTHs = workers[0]?.kryptexHashrateTHs ?? (runningWorkers[0]?.currentHashrateTHs ?? 0);

  const underperformingCount = workers.filter(
    (w) => w.saladStatus === 'running' && (w.isWithinWindow === false || w.performanceRatioPct < 85)
  ).length;
  const offlineCount = workers.filter((w) => w.saladStatus !== 'running' && w.saladStatus !== 'allocating').length;

  // Desglose Ponderado por Grupo de Contenedores (ComfyUI / Pearl Miner / Salad Groups)
  const containerGroupsBreakdown = useMemo(() => {
    const groupsMap: Record<string, {
      groupName: string;
      accountName: string;
      organizationName: string;
      accountId: string;
      gpuModel: string;
      totalReplicas: number;
      runningCount: number;
      allocatingCount: number;
      stoppedCount: number;
      hourlyCost: number;
      saladLogHashrateTHs: number;
      benchmarkTHs: number;
      accountBalanceUSD: number;
    }> = {};

    workers.forEach((w) => {
      const gName = w.containerGroupName || 'comfyui-video-wan25';
      if (!groupsMap[gName]) {
        const acc = accounts.find((a) => a.id === w.accountId) || accounts[0];
        const bAcc = saladBalance?.accounts?.find((a) => a.id === w.accountId);
        const bal = bAcc?.balanceUSD ?? acc?.balanceUSD ?? 0;

        groupsMap[gName] = {
          groupName: gName,
          accountName: w.accountName || acc?.accountName || 'SaladCloud',
          organizationName: acc?.organizationName || 'desing-canva',
          accountId: w.accountId,
          gpuModel: w.gpuModel,
          totalReplicas: 0,
          runningCount: 0,
          allocatingCount: 0,
          stoppedCount: 0,
          hourlyCost: 0,
          saladLogHashrateTHs: 0,
          benchmarkTHs: 0,
          accountBalanceUSD: bal
        };
      }

      groupsMap[gName].totalReplicas += 1;
      if (w.saladStatus === 'running') {
        groupsMap[gName].runningCount += 1;
        groupsMap[gName].hourlyCost += w.hourlySaladCost;
        groupsMap[gName].saladLogHashrateTHs += (w.saladLogHashrateTHs ?? w.currentHashrateTHs ?? 0);
        groupsMap[gName].benchmarkTHs += (w.expectedBenchmarkTHs || resolveGpuBenchmark(w.gpuModel).expectedTHs);
      } else if (w.saladStatus === 'allocating') {
        groupsMap[gName].allocatingCount += 1;
      } else {
        groupsMap[gName].stoppedCount += 1;
      }
    });

    return Object.values(groupsMap).map((grp) => {
      const efficiencyPct = grp.benchmarkTHs > 0 ? (grp.saladLogHashrateTHs / grp.benchmarkTHs) * 100 : (grp.saladLogHashrateTHs > 0 ? 100 : 0);
      const totalFleetCost = saladBalance?.hourlySpendingUSD || (grp.hourlyCost > 0 ? grp.hourlyCost : resolveGpuBenchmark(grp.gpuModel).hourlyCost);
      const weightPct = totalFleetCost > 0 ? (grp.hourlyCost / totalFleetCost) * 100 : 100;
      const groupRunwayHours = grp.hourlyCost > 0 ? Number((grp.accountBalanceUSD / grp.hourlyCost).toFixed(1)) : 999;

      return {
        ...grp,
        efficiencyPct: Number(efficiencyPct.toFixed(1)),
        weightPct: Number(weightPct.toFixed(1)),
        saladLogHashrateTHs: Number(grp.saladLogHashrateTHs.toFixed(1)),
        hourlyCost: Number(grp.hourlyCost.toFixed(3)),
        groupRunwayHours
      };
    });
  }, [workers, accounts, saladBalance]);

  // Filter workers
  const filteredWorkers = workers.filter((w) => {
    if (selectedAccount !== 'ALL' && w.accountId !== selectedAccount) return false;

    if (selectedStatus === 'RUNNING' && w.saladStatus !== 'running') return false;
    if (selectedStatus === 'ALLOCATING' && w.saladStatus !== 'allocating') return false;
    if (selectedStatus === 'UNDERPERFORMING' && (w.saladStatus !== 'running' || w.isWithinWindow !== false)) return false;
    if (selectedStatus === 'OFFLINE' && (w.saladStatus === 'running' || w.saladStatus === 'allocating')) return false;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchName = w.workerName.toLowerCase().includes(q);
      const matchGpu = w.gpuModel.toLowerCase().includes(q);
      const matchMachine = w.machineId.toLowerCase().includes(q);
      const matchGroup = w.containerGroupName?.toLowerCase().includes(q);
      if (!matchName && !matchGpu && !matchMachine && !matchGroup) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6 pb-20 md:pb-10 animate-in fade-in duration-300">
      {/* 0. SELECTOR DE PROVEEDOR DE FLOTA */}
      <div className={`flex flex-wrap items-center justify-between gap-3 p-2 rounded-2xl border transition-all ${
        isLight ? 'bg-white border-slate-200/90 shadow-sm' : 'bg-[#080B12] border-white/[0.08]'
      }`}>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFleetProvider('SALAD')}
            className={`px-4 py-2 rounded-xl text-xs font-mono-num font-bold transition-all flex items-center gap-2 cursor-pointer ${
              fleetProvider === 'SALAD'
                ? isLight 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-sm' 
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>SaladCloud Flota ({workers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFleetProvider('VAST')}
            className={`px-4 py-2 rounded-xl text-xs font-mono-num font-bold transition-all flex items-center gap-2 cursor-pointer ${
              fleetProvider === 'VAST'
                ? isLight 
                  ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 shadow-sm' 
                  : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            <span>Vast.ai Flota & Instancias</span>
          </button>
        </div>

        <div className={`text-[11px] font-mono-num px-3 hidden sm:block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          {fleetProvider === 'SALAD' ? 'Supervisión de nodos SaladCloud, logs en vivo y réplicas' : 'Gestión de hardware físico Vast.ai y telemetría de worker'}
        </div>
      </div>

      {fleetProvider === 'VAST' ? (
        <VastFleetSection isDarkTheme={isDarkTheme} />
      ) : (
        <>
          {/* 1. SECCIÓN DE SALDO ACTUAL DE SALADCLOUD (TOTAL Y POR CUENTA) */}
      <div className={`rounded-2xl p-5 border shadow-xl relative overflow-hidden transition-all ${
        isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50 text-slate-900' : 'fintech-card border-white/[0.08] text-white'
      }`}>
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-gradient-to-br from-emerald-500/10 to-cyan-500/0 rounded-full blur-2xl pointer-events-none" />
        
        <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b ${
          isLight ? 'border-slate-100' : 'border-white/[0.06]'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl border shadow-inner ${
              isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border-emerald-500/30 text-emerald-400'
            }`}>
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-display-title text-base font-bold tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Saldo y Facturación SaladCloud
                </h3>
                <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono-num font-semibold border ${
                  isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Sincronizado
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Control de balance total consolidado y desglose individual por organización con cálculo de runway
              </p>
            </div>
          </div>

          {/* Saldo Total Consolidado */}
          <div className="flex flex-wrap items-center gap-3">
            <div className={`rounded-xl px-4 py-2 border transition-all ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#080B12] border-white/[0.08]'
            }`}>
              <span className={`text-[10px] font-mono-num block uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Saldo Total Flota
              </span>
              <div className={`font-display-title text-xl font-bold flex items-center gap-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                <span className="text-emerald-500">$</span>
                <span>{(saladBalance?.totalBalanceUSD ?? 0).toFixed(2)}</span>
                <span className={`text-xs font-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>USD</span>
              </div>
            </div>

            <div className={`rounded-xl px-4 py-2 border transition-all ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#080B12] border-white/[0.08]'
            }`}>
              <span className={`text-[10px] font-mono-num block uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Gasto Consolidado
              </span>
              <div className={`font-mono-num text-base font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                ${(saladBalance?.hourlySpendingUSD ?? 0).toFixed(3)}
                <span className={`text-[10px] font-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}> /hr</span>
              </div>
            </div>

            <div className={`rounded-xl px-4 py-2 border transition-all ${
              (saladBalance?.hourlySpendingUSD || 0) > 0 && (saladBalance?.runwayHours ?? 999) < 24
                ? isLight ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                : isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#080B12] border-white/[0.08] text-slate-200'
            }`}>
              <span className={`text-[10px] font-mono-num block uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Runway Estimado
              </span>
              <div className="font-mono-num text-base font-bold flex items-center gap-1.5">
                <Clock className={`h-4 w-4 ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`} />
                <span>{(saladBalance?.hourlySpendingUSD || 0) > 0 ? `${(saladBalance?.runwayHours ?? 0).toFixed(1)} hrs` : '0h (Pausa)'}</span>
              </div>
            </div>

            {/* Consultar Cuotas SaladCloud Button (API Oficial) */}
            <button
              onClick={() => handleOpenQuotas()}
              className={`rounded-xl px-3.5 py-2 border flex items-center gap-2 text-xs font-mono-num font-semibold transition-all shadow-sm active:scale-95 cursor-pointer ${
                isLight 
                  ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-200' 
                  : 'bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 hover:from-cyan-500/20 hover:to-emerald-500/20 text-cyan-300 hover:text-white border-cyan-500/30'
              }`}
            >
              <Gauge className="h-4 w-4 text-cyan-500" />
              <span>Ver Cuotas Salad</span>
            </button>
          </div>
        </div>

        {/* Banner de Feedback Acciones de Grupo SaladCloud */}
        {groupActionMessage && (
          <div className={`mt-3 p-3 rounded-xl border text-xs font-mono-num flex items-center justify-between animate-in fade-in ${
            groupActionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
          }`}>
            <div className="flex items-center gap-2">
              {groupActionMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-rose-400" />}
              <span>{groupActionMessage.text}</span>
            </div>
            <button onClick={() => setGroupActionMessage(null)} className="text-slate-400 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Desglose de Saldo por Cuenta Salad */}
        <div className="mt-4 pt-1">
          <div className={`text-[11px] font-mono-num uppercase tracking-wider mb-2.5 flex items-center gap-1.5 ${
            isLight ? 'text-slate-600' : 'text-slate-400'
          }`}>
            <Layers className="h-3.5 w-3.5 text-cyan-500" />
            <span>Desglose de Saldo por Cuenta ({accounts.length})</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map((acc) => {
              const bAccount = saladBalance?.accounts?.find((a) => a.id === acc.id);
              const balanceVal = bAccount?.balanceUSD ?? acc.balanceUSD ?? 0;
              const spendingVal = bAccount?.hourlySpendingUSD ?? 0;
              const runwayVal = spendingVal > 0 ? Number((balanceVal / spendingVal).toFixed(1)) : 0;
              const activeCount = bAccount?.runningGpus ?? runningCount;

              return (
                <div 
                  key={acc.id}
                  className={`rounded-xl border p-3.5 flex flex-col justify-between transition-all group ${
                    isLight 
                      ? 'bg-slate-50/80 border-slate-200/90 hover:border-cyan-500 hover:bg-white shadow-xs' 
                      : 'bg-[#0A0D16] border-white/[0.07] hover:border-cyan-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className={`font-bold text-sm flex items-center gap-1.5 ${
                        isLight ? 'text-slate-900' : 'text-white'
                      }`}>
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        {acc.accountName || 'Cuenta Salad'}
                      </div>
                      <div className={`text-[11px] font-mono-num mt-0.5 ${
                        isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        Org: <span className={`font-semibold ${isLight ? 'text-cyan-700' : 'text-cyan-300'}`}>{acc.organizationName}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setEditingAccount({
                          id: acc.id,
                          name: acc.accountName || acc.organizationName,
                          currentBalance: balanceVal
                        });
                        setBalanceInput(balanceVal.toString());
                      }}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                        isLight 
                          ? 'border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:border-cyan-500 hover:bg-slate-50' 
                          : 'border-white/[0.06] bg-white/[0.03] text-slate-400 hover:text-white hover:border-cyan-400/40 hover:bg-white/[0.06]'
                      }`}
                      title="Actualizar saldo de esta cuenta"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className={`grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t text-[11px] font-mono-num ${
                    isLight ? 'border-slate-200/80' : 'border-white/[0.04]'
                  }`}>
                    <div>
                      <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Saldo</span>
                      <span className="font-bold text-emerald-500 text-xs">
                        ${balanceVal.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Consumo</span>
                      <span className={isLight ? 'text-slate-800' : 'text-slate-300'}>
                        ${spendingVal.toFixed(3)}/h
                      </span>
                    </div>

                    <div className="text-right">
                      <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Runway</span>
                      <span className={runwayVal < 24 ? 'text-rose-500 font-bold' : isLight ? 'text-cyan-700' : 'text-cyan-300'}>
                        {runwayVal.toFixed(0)} hrs
                      </span>
                    </div>
                  </div>

                  <div className={`mt-2 text-[10px] font-mono-num flex items-center justify-between ${
                    isLight ? 'text-slate-600' : 'text-slate-400'
                  }`}>
                    <span>Nodos activos: <strong className={isLight ? 'text-slate-950 font-bold' : 'text-white'}>{activeCount} GPUs</strong></span>
                    <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Proyecto: {acc.projectName || 'default'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Desglose Ponderado por Grupo de Contenedores (Salad Groups) */}
        {containerGroupsBreakdown.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/[0.06]">
            <div className="text-[11px] font-mono-num uppercase tracking-wider text-slate-400 mb-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-emerald-400" />
                <span>Ponderado por Grupo de Contenedores ({containerGroupsBreakdown.length})</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono-num">
                Cálculo de costo y benchmark exclusivo de GPUs en estado Running
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {containerGroupsBreakdown.map((grp) => (
                <div
                  key={grp.groupName}
                  className={`rounded-xl border p-4 flex flex-col justify-between transition-all shadow-md ${
                    isLight 
                      ? 'bg-slate-50/80 border-slate-200/90 hover:border-emerald-500 hover:bg-white' 
                      : 'bg-[#080B12] border-white/[0.08] hover:border-emerald-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-display-title font-bold text-sm ${
                          isLight ? 'text-slate-900' : 'text-white'
                        }`}>
                          {grp.groupName}
                        </span>
                        <span className={`rounded-md font-mono-num text-[10px] px-2 py-0.5 border ${
                          isLight ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        }`}>
                          {grp.gpuModel}
                        </span>
                      </div>
                      <div className={`text-[11px] font-mono-num mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        Org: <span className={isLight ? 'text-cyan-700 font-semibold' : 'text-cyan-300'}>{grp.organizationName}</span> • Replicas: <strong className={isLight ? 'text-slate-950 font-bold' : 'text-white'}>{grp.totalReplicas}</strong> ({grp.runningCount} activas | {grp.allocatingCount} en asignación)
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`text-[10px] font-mono-num block uppercase ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Ponderado Gasto</span>
                      <span className="font-mono-num text-xs font-bold text-emerald-500">
                        {grp.weightPct}% Flota
                      </span>
                    </div>
                  </div>

                  <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 py-2.5 border-y text-[11px] font-mono-num ${
                    isLight ? 'border-slate-200/80' : 'border-white/[0.04]'
                  }`}>
                    <div>
                      <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Consumo Grupo:</span>
                      <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>${grp.hourlyCost.toFixed(3)}/h</span>
                    </div>

                    <div>
                      <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Runway Grupo:</span>
                      <span className={grp.groupRunwayHours < 24 ? 'text-amber-500 font-bold' : isLight ? 'text-cyan-700 font-semibold' : 'text-cyan-300'}>
                        {grp.groupRunwayHours.toFixed(1)} hrs
                      </span>
                    </div>

                    <div>
                      <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Potencia Salad Logs:</span>
                      <span className="text-[#05DF72] font-bold">
                        {grp.saladLogHashrateTHs > 0 ? `${grp.saladLogHashrateTHs} TH/s` : 'Sin lectura'}
                      </span>
                    </div>

                    <div className="text-right sm:text-left">
                      <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Eficiencia Silicio:</span>
                      <span className={grp.efficiencyPct >= 95 ? 'text-emerald-500 font-bold' : grp.efficiencyPct >= 80 ? (isLight ? 'text-cyan-700' : 'text-cyan-300') : 'text-amber-500'}>
                        {grp.efficiencyPct}% ({grp.benchmarkTHs} TH/s)
                      </span>
                    </div>
                  </div>

                  <div className={`flex items-center justify-between text-[10px] font-mono-num ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{grp.runningCount} GPUs facturando a ${grp.runningCount > 0 ? (grp.hourlyCost / grp.runningCount).toFixed(3) : resolveGpuBenchmark(grp.gpuModel).hourlyCost.toFixed(3)}/h</span>
                    </span>
                    <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Saldo: ${grp.accountBalanceUSD.toFixed(2)} USD</span>
                  </div>

                  {/* Control Remoto SaladCloud API: Réplicas & Start/Stop */}
                  <div className={`mt-3 pt-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-num ${
                    isLight ? 'border-slate-200/80' : 'border-white/[0.06]'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Réplicas:</span>
                      <div className={`flex items-center border rounded-lg p-0.5 ${
                        isLight ? 'bg-white border-slate-300 shadow-xs' : 'bg-[#06080E] border-white/[0.1]'
                      }`}>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = groupReplicasInput[grp.groupName] ?? grp.totalReplicas;
                            setGroupReplicasInput(prev => ({ ...prev, [grp.groupName]: Math.max(0, cur - 1) }));
                          }}
                          className={`h-6 w-6 rounded flex items-center justify-center transition-colors cursor-pointer ${
                            isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
                          }`}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className={`w-8 text-center font-bold text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {groupReplicasInput[grp.groupName] ?? grp.totalReplicas}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = groupReplicasInput[grp.groupName] ?? grp.totalReplicas;
                            setGroupReplicasInput(prev => ({ ...prev, [grp.groupName]: cur + 1 }));
                          }}
                          className={`h-6 w-6 rounded flex items-center justify-center transition-colors cursor-pointer ${
                            isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/[0.08]'
                          }`}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={groupActionLoading[grp.groupName]}
                        onClick={() => handleGroupAction(grp, 'scale')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 flex items-center gap-1 cursor-pointer ${
                          isLight 
                            ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200' 
                            : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30'
                        }`}
                      >
                        {groupActionLoading[grp.groupName] ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sliders className="h-3 w-3" />}
                        <span>Aplicar Escala</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={groupActionLoading[grp.groupName]}
                        onClick={() => handleGroupAction(grp, 'start')}
                        title="Iniciar grupo de contenedores en SaladCloud"
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer ${
                          isLight 
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200' 
                            : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        <Play className="h-3 w-3" />
                        <span>Iniciar</span>
                      </button>
                      <button
                        type="button"
                        disabled={groupActionLoading[grp.groupName]}
                        onClick={() => handleGroupAction(grp, 'stop')}
                        title="Detener grupo de contenedores en SaladCloud"
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer ${
                          isLight 
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200' 
                            : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        <Square className="h-3 w-3" />
                        <span>Detener</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. RESUMEN DE CAPACIDAD DE GPUS DE LA FLOTA & POTENCIAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total GPUs Solicitadas */}
        <div className={`rounded-2xl p-4 border transition-all ${
          isLight ? 'bg-white border-slate-200/90 shadow-sm text-slate-900' : 'fintech-card border-white/[0.08] text-white'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className={`text-xs font-mono-num uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Capacidad Total Flota</span>
            <Cpu className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`font-display-title text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {totalReplicas}
            </span>
            <span className={`text-xs font-mono-num ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>GPUs Contratadas</span>
          </div>
          <div className={`text-[11px] font-mono-num mt-1 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
            Replicas activas en SaladCloud Engine
          </div>
        </div>

        {/* GPUs Activas Minando (Running) */}
        <div className={`rounded-2xl p-4 border transition-all ${
          isLight 
            ? 'bg-emerald-50/70 border-emerald-200 text-slate-900 shadow-sm' 
            : 'fintech-card border-emerald-500/20 bg-emerald-950/10 text-white'
        }`}>
          <div className="flex items-center justify-between text-emerald-500 mb-1">
            <span className="text-xs font-mono-num uppercase tracking-wider">Minando en Vivo</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`font-display-title text-2xl font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
              {runningCount}
            </span>
            <span className={`text-xs font-mono-num ${isLight ? 'text-emerald-600' : 'text-emerald-400/80'}`}>GPUs Operativas</span>
          </div>
          <div className={`text-[11px] font-mono-num mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Enviando telemetría y cómputo continuo
          </div>
        </div>

        {/* GPUs en Aprovisionamiento (Allocating) */}
        <div className={`rounded-2xl p-4 border transition-all ${
          isLight 
            ? 'bg-cyan-50/70 border-cyan-200 text-slate-900 shadow-sm' 
            : 'fintech-card border-cyan-500/20 bg-cyan-950/10 text-white'
        }`}>
          <div className="flex items-center justify-between text-cyan-600 mb-1">
            <span className="text-xs font-mono-num uppercase tracking-wider">En Asignación</span>
            <RefreshCw className="h-3.5 w-3.5 text-cyan-500 animate-spin" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`font-display-title text-2xl font-bold ${isLight ? 'text-cyan-800' : 'text-cyan-300'}`}>
              {allocatingCount}
            </span>
            <span className={`text-xs font-mono-num ${isLight ? 'text-cyan-700' : 'text-cyan-400/80'}`}>GPUs Allocating</span>
          </div>
          <div className={`text-[11px] font-mono-num mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Salad buscando hardware físico ($0/h)
          </div>
        </div>

        {/* Potencia Salad Logs vs Kryptex Pool */}
        <div className={`rounded-2xl p-4 border transition-all ${
          isLight ? 'bg-white border-slate-200/90 shadow-sm text-slate-900' : 'fintech-card border-white/[0.08] text-white'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className={`text-xs font-mono-num uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Potencia Medida</span>
            <Radio className="h-4 w-4 text-[#05DF72]" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display-title text-xl font-bold text-[#05DF72]">
              {totalSaladLogHashTHs}
            </span>
            <span className={`text-xs font-mono-num ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>TH/s (Salad Logs)</span>
          </div>
          <div className={`text-[11px] font-mono-num mt-1 flex items-center justify-between ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            <span>Pool Kryptex:</span>
            <strong className={isLight ? 'text-cyan-700 font-bold' : 'text-cyan-300'}>{poolReportedHashTHs} TH/s</strong>
          </div>
        </div>
      </div>

      {/* 3. FILTROS & BÚSQUEDA */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-2xl p-4 border transition-all ${
        isLight ? 'bg-white border-slate-200/90 shadow-sm' : 'fintech-card border-white/[0.08]'
      }`}>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar worker, GPU o machine ID..."
            className={`w-full rounded-xl border pl-9 pr-3 py-2 text-xs transition-all font-mono-num focus:outline-none ${
              isLight 
                ? 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-[#05DF72]' 
                : 'bg-[#080B12] border-white/[0.08] text-white placeholder-slate-500 focus:border-cyan-400'
            }`}
          />
        </div>

        {/* Account Filter */}
        <div className="relative">
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className={`w-full rounded-xl border px-3 py-2 text-xs transition-colors focus:outline-none ${
              isLight 
                ? 'bg-white border-slate-200 text-slate-800 focus:border-[#05DF72]' 
                : 'bg-[#080B12] border-white/[0.08] text-white focus:border-cyan-400'
            }`}
          >
            <option value="ALL">Todas las Cuentas Salad ({accounts.length})</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.accountName || acc.organizationName}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="relative">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className={`w-full rounded-xl border px-3 py-2 text-xs transition-colors focus:outline-none ${
              isLight 
                ? 'bg-white border-slate-200 text-slate-800 focus:border-[#05DF72]' 
                : 'bg-[#080B12] border-white/[0.08] text-white focus:border-cyan-400'
            }`}
          >
            <option value="ALL">Todas las GPUs ({totalReplicas})</option>
            <option value="RUNNING">Minando Activas ({runningCount})</option>
            <option value="ALLOCATING">En Asignación / Provisión ({allocatingCount})</option>
            <option value="UNDERPERFORMING">⚠️ Fuera de Ventana / Anomalía ({underperformingCount})</option>
            <option value="OFFLINE">🔴 Desconectadas ({offlineCount})</option>
          </select>
        </div>

        {/* View Switcher */}
        <div className={`flex items-center justify-between rounded-xl px-2 py-1 border transition-all ${
          isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#080B12] border-white/[0.08]'
        }`}>
          <span className={`text-xs font-mono-num pl-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Vista:
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? isLight 
                    ? 'bg-white text-slate-950 font-bold shadow-xs' 
                    : 'bg-gradient-to-r from-emerald-500/25 to-cyan-500/25 text-white border border-emerald-500/40'
                  : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="h-3 w-3" />
              <span>Tarjetas</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'table'
                  ? isLight 
                    ? 'bg-white text-slate-950 font-bold shadow-xs' 
                    : 'bg-gradient-to-r from-emerald-500/25 to-cyan-500/25 text-white border border-emerald-500/40'
                  : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Table className="h-3 w-3" />
              <span>Tabla</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. DESGLOSE DETALLADO DE GPUS (GRID / CARDS VIEW) */}
      {workers.length === 0 ? (
        <div className="fintech-card rounded-2xl p-12 text-center space-y-3 max-w-lg mx-auto my-8 border border-white/[0.08]">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.08] mx-auto text-slate-500 shadow-lg">
            <Cpu className="h-7 w-7 text-cyan-400/80" />
          </div>
          <h4 className="font-display-title text-base font-bold text-white">
            No hay GPUs conectadas
          </h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            MinerX no pinta datos ficticios. Agrega tus credenciales de SaladCloud en la pestaña APIs & Bot para ver tus GPUs en tiempo real.
          </p>
        </div>
      ) : filteredWorkers.length === 0 ? (
        <div className="fintech-card rounded-2xl p-12 text-center space-y-3 border border-white/[0.08]">
          <Cpu className="h-10 w-10 text-slate-600 mx-auto" />
          <h4 className="font-display-title text-base font-semibold text-slate-300">
            No se encontraron GPUs con los filtros seleccionados
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Intenta cambiar los filtros de estado o término de búsqueda.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWorkers.map((worker) => {
            const isAllocating = worker.saladStatus === 'allocating';
            const isRunning = worker.saladStatus === 'running';
            const isDead = !isRunning && !isAllocating;
            const isOutOfWindow = isRunning && (worker.isWithinWindow === false || worker.performanceRatioPct < 85);

            // Hashrates
            const bench = resolveGpuBenchmark(worker.gpuModel);
            const saladLogHash = worker.saladLogHashrateTHs ?? worker.currentHashrateTHs;
            const kryptexHash = worker.kryptexHashrateTHs ?? worker.currentHashrateTHs;
            const targetMin = worker.targetWindowMinTHs ?? bench.targetMin;
            const targetMax = worker.targetWindowMaxTHs ?? bench.targetMax;
            const samples = worker.hashrateSamples || [];

            if (isAllocating) {
              return (
                <div 
                  key={worker.id}
                  className={`rounded-2xl p-5 border flex flex-col justify-between transition-all ${
                    isLight 
                      ? 'border-cyan-200 bg-cyan-50/70 shadow-sm text-slate-900' 
                      : 'fintech-card border-cyan-500/25 bg-cyan-950/10 text-white'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 animate-spin" />
                          <span className={`font-mono-num font-bold text-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            {worker.workerName}
                          </span>
                        </div>
                        <div className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          {worker.accountName} • Grupo: <span className={isLight ? 'text-cyan-700 font-semibold' : 'text-cyan-300'}>{worker.containerGroupName}</span>
                        </div>
                      </div>

                      <span className={`rounded-lg px-2.5 py-0.5 text-[11px] font-mono-num font-bold border ${
                        isLight ? 'bg-cyan-100 text-cyan-800 border-cyan-200' : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                      }`}>
                        {worker.gpuModel}
                      </span>
                    </div>

                    <div className={`rounded-xl border p-3 my-3 ${
                      isLight ? 'bg-white border-cyan-200 text-slate-800 shadow-xs' : 'bg-[#080B12]/80 border-cyan-500/20 text-slate-300'
                    }`}>
                      <div className={`flex items-center gap-2 text-xs font-semibold mb-1 ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>En Aprovisionamiento (Allocating)</span>
                      </div>
                      <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        SaladCloud está buscando un nodo físico con GPU disponible en la red distribuida. No hay costo de facturación ($0.00/h) hasta que la máquina inicie.
                      </p>
                    </div>

                    <div className={`grid grid-cols-2 gap-2 text-xs font-mono-num py-2 border-t ${
                      isLight ? 'border-slate-200/80 text-slate-600' : 'border-white/[0.04] text-slate-400'
                    }`}>
                      <div>
                        <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Costo Actual:</span>
                        <span className="text-emerald-500 font-bold">$0.000 /hr</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Ventana Esperada:</span>
                        <span className={isLight ? 'text-slate-800 font-semibold' : 'text-slate-300'}>{targetMin}-{targetMax} TH/s</span>
                      </div>
                    </div>
                  </div>

                  <div className={`pt-2 text-[10px] font-mono-num flex items-center justify-between border-t ${
                    isLight ? 'border-slate-200/80 text-cyan-700' : 'border-white/[0.04] text-cyan-400/80'
                  }`}>
                    <span>Prioridad: {worker.saladPriority}</span>
                    <span>Modo Auto-Attach</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={worker.id}
                className={`rounded-2xl p-5 transition-all flex flex-col justify-between border ${
                  isDead
                    ? isLight ? 'border-rose-300 bg-rose-50/70 shadow-sm text-slate-900' : 'border-rose-500/50 bg-rose-950/15 fintech-card text-white'
                    : isOutOfWindow
                    ? isLight ? 'border-amber-300 bg-amber-50/70 shadow-sm text-slate-900 ring-1 ring-amber-300' : 'border-amber-500/60 bg-amber-950/20 fintech-card text-white ring-1 ring-amber-500/30'
                    : isLight ? 'bg-white border-slate-200/90 shadow-sm text-slate-900 hover:border-emerald-400' : 'fintech-card fintech-card-interactive border-white/[0.08] text-white'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${
                          isDead ? 'bg-rose-500' : isOutOfWindow ? 'bg-amber-400 animate-ping' : 'bg-[#05F292]'
                        }`} />
                        <span className={`font-mono-num font-bold text-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {worker.workerName}
                        </span>
                      </div>
                      <div className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {worker.accountName} • <span className={`font-mono-num ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>ID: {worker.machineId.slice(0, 10)}...</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={`rounded-lg px-2.5 py-0.5 text-[11px] font-mono-num font-bold border ${
                        isLight ? 'bg-cyan-50 text-cyan-800 border-cyan-200' : 'bg-white/[0.05] text-cyan-300 border border-white/[0.08]'
                      }`}>
                        {worker.gpuModel}
                      </span>
                      <span className={`text-[10px] font-mono-num ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                        {worker.vramGB}GB VRAM
                      </span>
                    </div>
                  </div>

                  {/* Hashrate Comparison: Potencia Log Salad vs Potencia Kryptex */}
                  {(() => {
                    const breakEvenTHs = calculateBreakEvenTHs(worker.hourlySaladCost, BASELINE_USD_PER_THS_HOUR, true);
                    const isUnderBreakEven = isRunning && saladLogHash > 0 && saladLogHash < breakEvenTHs;
                    return (
                      <>
                        {isUnderBreakEven && (
                          <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 p-2.5 my-2 text-[11px] font-mono-num flex items-center justify-between text-rose-300 animate-pulse">
                            <div className="flex items-center gap-1.5">
                              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                              <span>🚨 PÉRDIDA: Rinde {saladLogHash} TH/s (requiere {breakEvenTHs} TH/s)</span>
                            </div>
                            <button
                              onClick={() => onOpenReallocate(worker)}
                              className="px-2 py-0.5 rounded bg-rose-500 text-black font-bold text-[10px] uppercase hover:bg-rose-400 transition-colors"
                            >
                              Remediar
                            </button>
                          </div>
                        )}

                        <div className={`rounded-xl p-3 border my-2.5 space-y-2 ${
                          isLight ? 'bg-slate-50 border-slate-200/90' : 'bg-[#080B12] border-white/[0.06]'
                        }`}>
                          <div className="flex justify-between items-center text-xs font-mono-num">
                            <span className={`flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                              <Zap className="h-3.5 w-3.5 text-[#05DF72]" />
                              <span>Potencia Log Salad:</span>
                            </span>
                            <span className={`font-display-title text-base font-bold ${isUnderBreakEven ? 'text-rose-500' : 'text-[#05DF72]'}`}>
                              {saladLogHash > 0 ? `${saladLogHash} TH/s` : 'Sin lectura'}
                            </span>
                          </div>

                          <div className={`flex justify-between items-center text-[11px] font-mono-num pt-1 border-t ${
                            isLight ? 'border-slate-200 text-slate-600' : 'border-white/[0.04] text-slate-400'
                          }`}>
                            <span>Punto de Equilibrio (Break-Even):</span>
                            <span className={isLight ? 'text-amber-600 font-bold' : 'text-amber-300 font-semibold'}>{breakEvenTHs} TH/s</span>
                          </div>

                          <div className={`flex justify-between items-center text-[11px] font-mono-num ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                            <span>Pool Kryptex (Ref):</span>
                            <span className={isLight ? 'text-cyan-700 font-semibold' : 'text-cyan-300 font-semibold'}>{kryptexHash} TH/s</span>
                          </div>

                          <div className={`flex justify-between items-center text-[11px] font-mono-num ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                            <span>Ventana Objetivo:</span>
                            <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-300'}`}>[{targetMin} - {targetMax} TH/s]</span>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {/* Ventana de TH/s e Indicador de Silicon Lottery */}
                  <div className="my-2 space-y-1.5">
                    <div className="flex justify-between items-center text-[11px] font-mono-num">
                      <span className="text-slate-400">Estado de Ventana:</span>
                      {isOutOfWindow ? (
                        <span className="rounded-md bg-amber-500/20 px-2 py-0.5 font-bold text-[10px] text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          FUERA DE VENTANA (THROTTLING)
                        </span>
                      ) : (
                        <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-bold text-[10px] text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          DENTRO DE VENTANA ÓPTIMA
                        </span>
                      )}
                    </div>

                    {/* Progress Bar vs Benchmark */}
                    <div className="h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isDead ? 'bg-rose-500 w-0' : isOutOfWindow ? 'bg-amber-400' : 'bg-gradient-to-r from-emerald-500 to-[#05F292]'
                        }`}
                        style={{ width: `${Math.min(100, (saladLogHash / (worker.expectedBenchmarkTHs || bench.expectedTHs || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Histórico Reciente de TH/s en Logs */}
                  {samples.length > 0 && (
                    <div className="my-2.5 p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                      <div className="text-[10px] font-mono-num text-slate-500 mb-1 flex items-center justify-between">
                        <span>Histórico de Lecturas (Salad Logs):</span>
                        <span className="text-slate-400">{samples.length} muestras</span>
                      </div>
                      <div className="flex items-center gap-1 overflow-x-auto py-1">
                        {samples.slice(-8).map((s, sIdx) => {
                          const isOk = s.ths >= targetMin;
                          return (
                            <span 
                              key={sIdx}
                              className={`text-[10px] font-mono-num px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                isOk 
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' 
                                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              }`}
                              title={new Date(s.time).toLocaleTimeString()}
                            >
                              {s.ths.toFixed(1)}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Telemetría Económica & Shares */}
                  <div className="grid grid-cols-2 gap-2 py-2 my-2 border-y border-white/[0.06] text-xs font-mono-num text-slate-300">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Costo Alquiler:</span>
                      <span>${worker.hourlySaladCost.toFixed(3)}/h</span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">Ganancia Neta:</span>
                      <span className={`font-bold ${worker.hourlyNetProfit >= 0 ? 'text-[#05F292]' : 'text-rose-400'}`}>
                        ${worker.hourlyNetProfit > 0 ? '+' : ''}{worker.hourlyNetProfit.toFixed(3)}/h
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block">Stale Ratio:</span>
                      <span className="text-slate-300">
                        {worker.staleRatioText 
                          ? worker.staleRatioText 
                          : (worker.validShares + (worker.staleShares || 0)) > 0 
                            ? `${(((worker.staleShares || 0) / (worker.validShares + (worker.staleShares || 0))) * 100).toFixed(1)}%` 
                            : '0.0%'}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">Shares Aceptados:</span>
                      <span className="text-cyan-400 font-semibold">{worker.validShares}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="pt-2 flex items-center gap-2">
                  <button
                    onClick={() => handleOpenLogs(worker)}
                    className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:border-cyan-400/40 transition-all shrink-0"
                    title="Ver logs remotos en vivo"
                  >
                    <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Logs Salad</span>
                  </button>

                  {isOutOfWindow ? (
                    <button
                      onClick={() => onOpenReallocate(worker)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition-all shadow-sm"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Reasignar GPU (Silicon Lottery)</span>
                    </button>
                  ) : isDead ? (
                    <button
                      onClick={() => onOpenReallocate(worker)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/30 transition-all shadow-sm"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Reasignar</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onOpenReallocate(worker)}
                      className="flex-1 text-slate-400 hover:text-white text-xs font-semibold transition-colors bg-white/[0.04] py-2 rounded-xl border border-white/[0.06] hover:border-cyan-400/30 flex items-center justify-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Reasignar GPU</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DENSE TABLE VIEW */
        <div className={`rounded-2xl overflow-hidden border shadow-xl transition-all ${
          isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50' : 'fintech-card border-white/[0.08]'
        }`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono-num">
              <thead className={`border-b text-[11px] uppercase tracking-wider transition-colors ${
                isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-[#090C12] text-slate-400 border-white/[0.08]'
              }`}>
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Worker / Nodo</th>
                  <th className="py-3.5 px-4 font-semibold">GPU & Prioridad</th>
                  <th className="py-3.5 px-4 font-semibold">Potencia Log Salad</th>
                  <th className="py-3.5 px-4 font-semibold">Pool Kryptex</th>
                  <th className="py-3.5 px-4 font-semibold">Ventana Objetivo</th>
                  <th className="py-3.5 px-4 font-semibold">Costo Salad</th>
                  <th className="py-3.5 px-4 font-semibold">Ganancia Neta</th>
                  <th className="py-3.5 px-4 font-semibold">Estado</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-white/[0.04]'}`}>
                {filteredWorkers.map((worker) => {
                  const isAllocating = worker.saladStatus === 'allocating';
                  const isRunning = worker.saladStatus === 'running';
                  const isDead = !isRunning && !isAllocating;
                  const isOutOfWindow = isRunning && (worker.isWithinWindow === false || worker.performanceRatioPct < 85);
                  const bench = resolveGpuBenchmark(worker.gpuModel);
                  const saladLogHash = worker.saladLogHashrateTHs ?? worker.currentHashrateTHs;
                  const kryptexHash = worker.kryptexHashrateTHs ?? worker.currentHashrateTHs;
                  const targetMin = worker.targetWindowMinTHs ?? bench.targetMin;
                  const targetMax = worker.targetWindowMaxTHs ?? bench.targetMax;

                  return (
                    <tr 
                      key={worker.id}
                      className={`transition-colors ${
                        isDead 
                          ? isLight ? 'bg-rose-50/70 hover:bg-rose-50' : 'bg-rose-950/15 hover:bg-rose-900/20' 
                          : isOutOfWindow 
                          ? isLight ? 'bg-amber-50/70 hover:bg-amber-50' : 'bg-amber-950/15 hover:bg-amber-900/20' 
                          : isAllocating 
                          ? isLight ? 'bg-cyan-50/50 hover:bg-cyan-50' : 'bg-cyan-950/10 hover:bg-cyan-900/20' 
                          : isLight ? 'hover:bg-slate-50' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className={`font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          <span className={`h-2 w-2 rounded-full ${
                            isDead ? 'bg-rose-500' : isOutOfWindow ? 'bg-amber-400' : isAllocating ? 'bg-cyan-400 animate-spin' : 'bg-[#05F292]'
                          }`} />
                          {worker.workerName}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{worker.accountName}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className={`font-semibold ${isLight ? 'text-cyan-800' : 'text-cyan-300'}`}>{worker.gpuModel}</div>
                        <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{worker.saladPriority}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#05F292]">
                          {isAllocating ? 'Asignando...' : `${saladLogHash} TH/s`}
                        </div>
                        <div className="text-[10px] text-slate-500">Log contenedor</div>
                      </td>

                      <td className={`py-3.5 px-4 font-semibold ${isLight ? 'text-cyan-800' : 'text-cyan-300'}`}>
                        {isAllocating ? 'N/A' : `${kryptexHash} TH/s`}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`rounded-md px-2 py-0.5 font-bold text-[10px] border ${
                          isAllocating
                            ? isLight ? 'bg-cyan-100 text-cyan-800 border-cyan-200' : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                            : isOutOfWindow 
                            ? isLight ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                            : isLight ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {isAllocating ? 'EN COLA' : isOutOfWindow ? 'FUERA DE VENTANA' : `[${targetMin}-${targetMax}] TH/s`}
                        </span>
                      </td>

                      <td className={`py-3.5 px-4 ${isLight ? 'text-slate-700 font-semibold' : 'text-slate-300'}`}>
                        ${worker.hourlySaladCost.toFixed(3)}/h
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`font-bold ${worker.hourlyNetProfit >= 0 ? 'text-[#05DF72]' : 'text-rose-500'}`}>
                          ${worker.hourlyNetProfit > 0 ? '+' : ''}{worker.hourlyNetProfit.toFixed(3)}/h
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {isAllocating ? (
                          <span className={`text-[11px] font-semibold flex items-center gap-1 ${isLight ? 'text-cyan-700' : 'text-cyan-300'}`}>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Allocating
                          </span>
                        ) : isOutOfWindow ? (
                          <span className={`text-[11px] font-semibold flex items-center gap-1 ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Anomalía
                          </span>
                        ) : (
                          <span className={`text-[11px] font-semibold flex items-center gap-1 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Óptimo
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenLogs(worker)}
                            className={`rounded-lg border px-2.5 py-1 text-xs transition-all flex items-center gap-1 cursor-pointer ${
                              isLight 
                                ? 'border-slate-200 bg-slate-50 text-slate-700 hover:text-slate-950 hover:bg-slate-100 hover:border-cyan-400' 
                                : 'border-white/[0.08] bg-white/[0.04] text-slate-300 hover:text-white hover:border-cyan-400/40'
                            }`}
                          >
                            <Terminal className={`h-3 w-3 ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`} />
                            <span>Logs</span>
                          </button>
                          <button
                            onClick={() => onOpenReallocate(worker)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition-all cursor-pointer ${
                              isLight 
                                ? 'bg-slate-100 text-slate-700 hover:text-slate-950 border-slate-200 hover:bg-slate-200' 
                                : 'bg-white/[0.04] text-slate-300 hover:text-white border-white/[0.06] hover:border-cyan-400/40'
                            }`}
                          >
                            Reasignar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL PARA ACTUALIZAR SALDO DE CUENTA SALAD */}
      {editingAccount && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
          isLight ? 'bg-slate-900/40 backdrop-blur-xs' : 'bg-black/85 backdrop-blur-md'
        } animate-in fade-in duration-200`}>
          <div className={`relative w-full max-w-md rounded-2xl border shadow-2xl p-6 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0C101A] border-white/10 text-white'
          }`}>
            <div className={`flex items-center justify-between pb-4 border-b mb-4 ${
              isLight ? 'border-slate-200' : 'border-white/[0.08]'
            }`}>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-emerald-500" />
                <h3 className={`font-display-title text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Actualizar Saldo de SaladCloud
                </h3>
              </div>
              <button
                onClick={() => setEditingAccount(null)}
                className={`p-1 rounded-lg transition-colors ${
                  isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBalance} className="space-y-4">
              <div>
                <label className={`text-xs block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Cuenta / Organización
                </label>
                <div className={`font-mono-num text-sm px-3 py-2 rounded-xl border ${
                  isLight 
                    ? 'text-cyan-800 bg-slate-50 border-slate-200 font-semibold' 
                    : 'text-cyan-300 bg-[#06080D] border-white/[0.06]'
                }`}>
                  {editingAccount.name}
                </div>
              </div>

              <div>
                <label className={`text-xs block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Saldo Actual en USD (visto en portal.salad.com)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-emerald-500" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={balanceInput}
                    onChange={(e) => setBalanceInput(e.target.value)}
                    placeholder="Ej. 0.00"
                    className={`w-full rounded-xl border pl-9 pr-3 py-2 text-sm font-mono-num focus:outline-none transition-all ${
                      isLight 
                        ? 'border-slate-300 bg-white text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500' 
                        : 'border-white/[0.1] bg-[#06080D] text-white focus:border-emerald-400'
                    }`}
                    required
                    autoFocus
                  />
                </div>
                <p className={`text-[11px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Este valor se reflejará de inmediato en los cálculos de runway y alertas del dashboard.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
                    isLight 
                      ? 'border-slate-200 bg-slate-100 text-slate-700 hover:text-slate-950 hover:bg-slate-200' 
                      : 'border-white/[0.08] bg-white/[0.04] text-slate-300 hover:text-white'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-[#05F292] text-slate-950 font-bold px-4 py-2 text-xs hover:brightness-110 transition-all shadow-md"
                >
                  Guardar Saldo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REMOTE TERMINAL LOGS MODAL (STREAMING EN TIEMPO REAL) */}
      {logsWorker && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
          isLight ? 'bg-slate-900/40 backdrop-blur-xs' : 'bg-black/85 backdrop-blur-md'
        } animate-in fade-in duration-200`}>
          <div className="relative w-full max-w-3xl bg-[#06080D] rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-3.5 bg-[#0C101A]">
              <div className="flex items-center gap-2.5">
                <Terminal className="h-4 w-4 text-[#05F292]" />
                <span className="font-display-title font-bold text-white text-sm uppercase tracking-wider">
                  Terminal de Logs • {logsWorker.workerName}
                </span>
                <span className="font-mono-num text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  {logsWorker.gpuModel}
                </span>
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono-num bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>Streaming en Vivo (3.5s)</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchLogs(logsWorker, false)}
                  disabled={logsLoading || logsRefreshing}
                  className="flex items-center gap-1 text-xs text-slate-300 hover:text-white bg-white/[0.05] px-2.5 py-1 rounded-lg border border-white/[0.08] transition-colors"
                  title="Forzar actualización de logs de Salad"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${logsRefreshing || logsLoading ? 'animate-spin' : ''}`} />
                  <span>Refrescar</span>
                </button>
                <button
                  onClick={handleCopyLogs}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-white/[0.05] px-2.5 py-1 rounded-lg border border-white/[0.08] transition-colors"
                >
                  {copiedLogs ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedLogs ? 'Copiado' : 'Copiar'}</span>
                </button>
                <button
                  onClick={() => setLogsWorker(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.08] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Terminal Body */}
            <div className="flex-1 overflow-y-auto p-4 font-jetbrains text-xs bg-black text-[#05F292] space-y-1.5 selection:bg-[#05F292]/30 selection:text-white">
              {logsLoading && logsList.length === 0 ? (
                <div className="flex items-center gap-2 text-slate-400 py-10 justify-center">
                  <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
                  <span>Consultando log-entries en vivo desde SaladCloud API...</span>
                </div>
              ) : logsList.length > 0 ? (
                <>
                  {logsList.map((log, idx) => (
                    <div key={idx} className="leading-relaxed flex items-start gap-2 hover:bg-white/[0.02] px-1 py-0.5 rounded">
                      <span className="text-slate-500 shrink-0 tabular-nums">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-slate-600 shrink-0">|</span>
                      <span className="text-[#05F292] break-all">{log.message}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </>
              ) : (
                <div className="text-slate-500 py-10 text-center space-y-2">
                  <p>No se encontraron logs de eventos recientes para este contenedor.</p>
                  <p className="text-[11px] text-slate-600">Si el nodo acaba de arrancar, Salad tardará unos segundos en indexar la primera salida de consola.</p>
                </div>
              )}
            </div>

            {/* Terminal Footer */}
            <div className="border-t border-white/[0.08] px-4 py-2.5 bg-[#0C101A] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-num text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#05F292] animate-pulse" />
                <span>Salad-Agent Log Poller: ACTIVO ({logsList.length} entradas)</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    autoScrollLogs ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-white/[0.04] text-slate-400 border-white/[0.06]'
                  }`}
                >
                  Auto-scroll: {autoScrollLogs ? 'ACTIVO' : 'PAUSADO'}
                </button>
                <span>Host ID: {logsWorker.machineId || 'salad-node'}</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 5. MODAL DE CUOTAS Y LÍMITES SALADCLOUD (API OFICIAL) */}
      {showQuotasModal && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
          isLight ? 'bg-slate-900/40 backdrop-blur-xs' : 'bg-black/80 backdrop-blur-sm'
        } animate-in fade-in duration-200`}>
          <div className={`rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0A0D16] border-cyan-500/30 text-white'
          }`}>
            <div className={`p-5 border-b flex items-center justify-between ${
              isLight ? 'border-slate-200 bg-slate-50' : 'border-white/[0.08] bg-[#0C101A]'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl border ${
                  isLight 
                    ? 'bg-cyan-50 border-cyan-200 text-cyan-700' 
                    : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                }`}>
                  <Gauge className="h-5 w-5" />
                </div>
                <div>
                  <h3 className={`font-display-title text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Cuotas y Límites de SaladCloud
                  </h3>
                  <p className={`text-xs font-mono-num ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Organización: <span className={isLight ? 'text-cyan-700 font-bold' : 'text-cyan-300 font-bold'}>{quotasOrg}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowQuotasModal(false)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
              {quotasLoading ? (
                <div className={`py-12 flex flex-col items-center justify-center gap-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  <RefreshCw className="h-6 w-6 text-cyan-500 animate-spin" />
                  <span className="text-xs font-mono-num">Consultando cuotas en api.salad.com...</span>
                </div>
              ) : quotasData ? (
                <div className="space-y-4 font-mono-num">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className={`p-3 rounded-xl border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#06080E] border-white/[0.06]'
                    }`}>
                      <span className={`text-[10px] block uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Grupos Contenedores</span>
                      <span className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {quotasData.container_groups_quota ?? quotasData.container_groups_count ?? 'Ilimitado'}
                      </span>
                    </div>
                    <div className={`p-3 rounded-xl border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#06080E] border-white/[0.06]'
                    }`}>
                      <span className={`text-[10px] block uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Workloads Concurrentes</span>
                      <span className={`text-lg font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                        {quotasData.max_concurrent_workloads ?? quotasData.concurrent_workloads_quota ?? 'Estándar'}
                      </span>
                    </div>
                    <div className={`p-3 rounded-xl border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#06080E] border-white/[0.06]'
                    }`}>
                      <span className={`text-[10px] block uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Límite CPUs</span>
                      <span className={`text-lg font-bold ${isLight ? 'text-cyan-700' : 'text-cyan-300'}`}>
                        {quotasData.cpu_quota ?? 'N/A'}
                      </span>
                    </div>
                  </div>

                  {quotasData.gpu_classes_quotas && quotasData.gpu_classes_quotas.length > 0 && (
                    <div className="mt-4">
                      <span className={`text-xs font-bold uppercase block mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        Cuotas por Clase de GPU:
                      </span>
                      <div className="space-y-2">
                        {quotasData.gpu_classes_quotas.map((gq: any, idx: number) => (
                          <div key={idx} className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
                            isLight 
                              ? 'bg-slate-50 border-slate-200 text-slate-800' 
                              : 'bg-[#06080E] border-white/[0.04] text-slate-200'
                          }`}>
                            <span className="font-semibold">{gq.name || gq.id}</span>
                            <span className={isLight ? 'text-cyan-700 font-bold' : 'text-cyan-400 font-bold'}>Cuota: {gq.quota ?? 'Sin límite'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={`p-3 rounded-xl border text-xs space-y-1 ${
                    isLight 
                      ? 'bg-emerald-50/70 border-emerald-200 text-slate-700' 
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-400'
                  }`}>
                    <div className={`flex items-center gap-1.5 font-semibold ${isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Conexión autenticada con SaladCloud Container Engine</span>
                    </div>
                    <p className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                      Las cuotas son administradas por Salad Technologies. Para aumentarlas, contacta a enterprise@salad.com o desde portal.salad.com.
                    </p>
                  </div>
                </div>
              ) : (
                <div className={`py-10 text-center text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                  <span>No se pudieron obtener las cuotas para la organización "{quotasOrg}". Verifica que tu API Key tenga permisos administrativos.</span>
                </div>
              )}
            </div>

            <div className={`p-4 border-t flex items-center justify-between ${
              isLight ? 'border-slate-200 bg-slate-50' : 'border-white/[0.08] bg-[#06080E]/60'
            }`}>
              <a
                href={`https://portal.salad.com/organizations/${encodeURIComponent(quotasOrg)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1.5 text-xs font-mono-num transition-colors ${
                  isLight ? 'text-cyan-700 hover:text-cyan-900' : 'text-cyan-400 hover:text-cyan-300'
                }`}
              >
                <span>Administrar en Portal SaladCloud</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                onClick={() => setShowQuotasModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                  isLight 
                    ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' 
                    : 'bg-white/[0.08] hover:bg-white/[0.12] text-white'
                }`}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
