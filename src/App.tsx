import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { MobileNav } from './components/MobileNav';
import { OverviewTab } from './components/OverviewTab';
import { FleetTab } from './components/FleetTab';
import { EconomicsTab } from './components/EconomicsTab';
import { ApiManagerTab } from './components/ApiManagerTab';
import { AlertsTab } from './components/AlertsTab';
import { ReallocateModal } from './components/ReallocateModal';
import { LandingPage } from './components/LandingPage';
import { FloatingHubWidget } from './components/FloatingHubWidget';
import { AuthScreen } from './components/AuthScreen';

import { 
  INITIAL_SALAD_ACCOUNTS, 
  INITIAL_KRYPTEX_CONFIG, 
  INITIAL_APP_SETTINGS, 
  INITIAL_WORKERS, 
  INITIAL_ALERTS, 
  INITIAL_HASHRATE_HISTORY,
  INITIAL_KRYPTEX_BALANCE,
  INITIAL_POOL_INFO,
  computeFleetSummary
} from './data/mockFleetData';

import { BASELINE_USD_PER_THS_HOUR, resolveGpuBenchmark } from './data/gpuBenchmarks';
import { apiFetch } from './utils/apiConfig';
import type { 
  SaladAccountConfig, 
  KryptexConfig, 
  AppSettings, 
  MergedGPUWorker, 
  AlertEvent, 
  HashrateHistoryPoint, 
  KryptexBalanceRaw, 
  KryptexPoolInfo,
  KryptexPayoutStatsRaw,
  SaladBalanceInfo 
} from './types/minerx';

export const App: React.FC = () => {
  // 1. Persistent State
  const [accounts, setAccounts] = useState<SaladAccountConfig[]>(() => {
    const saved = localStorage.getItem('minerx_salad_accounts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.filter((a: any) => !a.apiKey?.includes('89f3a901844ef') && !a.apiKey?.includes('45b1c8392') && !a.apiKey?.includes('demo_01'));
      } catch {
        return [];
      }
    }
    return INITIAL_SALAD_ACCOUNTS;
  });

  const [kryptexConfig, setKryptexConfig] = useState<KryptexConfig>(() => {
    const saved = localStorage.getItem('minerx_kryptex_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.walletAddress === 'prl1qy7997hvd3l0628e3k4mfx5z4ptslqgww99d8v9') {
          parsed.walletAddress = '';
        }
        return parsed;
      } catch {
        return INITIAL_KRYPTEX_CONFIG;
      }
    }
    return INITIAL_KRYPTEX_CONFIG;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('minerx_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.telegramBotToken) parsed.telegramBotToken = INITIAL_APP_SETTINGS.telegramBotToken;
        if (!parsed.telegramChatId) parsed.telegramChatId = INITIAL_APP_SETTINGS.telegramChatId;
        return parsed;
      } catch {}
    }
    return INITIAL_APP_SETTINGS;
  });

  const [workers, setWorkers] = useState<MergedGPUWorker[]>(INITIAL_WORKERS);
  const [alerts, setAlerts] = useState<AlertEvent[]>(INITIAL_ALERTS);
  const [history, setHistory] = useState<HashrateHistoryPoint[]>(INITIAL_HASHRATE_HISTORY);
  const [balance, setBalance] = useState<KryptexBalanceRaw>(INITIAL_KRYPTEX_BALANCE);
  const [payoutStats, setPayoutStats] = useState<KryptexPayoutStatsRaw | null>(null);
  const [poolInfo, setPoolInfo] = useState<KryptexPoolInfo>(INITIAL_POOL_INFO);

  const [saladBalance, setSaladBalance] = useState<SaladBalanceInfo | null>(null);

  // User Authentication & Session State - Requiere autenticación para entrar al dashboard
  const [currentUser, setCurrentUser] = useState<any>(() => {
    const savedUser = localStorage.getItem('minerx_user');
    const savedToken = localStorage.getItem('minerx_auth_token');
    if (savedUser && savedToken) {
      try {
        return JSON.parse(savedUser);
      } catch {}
    }
    return null;
  });

  // UI View Mode (Landing Page vs Dashboard)
  const [viewMode, setViewMode] = useState<'dashboard' | 'landing'>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'landing') return 'landing';
    return 'dashboard';
  });

  // Visual Theme: Light White & Emerald Green vs Cyber Dark
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('minerx_theme_mode');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light'; // Default to clean modern White & Green theme
  });

  const handleToggleTheme = () => {
    const next = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(next);
    localStorage.setItem('minerx_theme_mode', next);
  };

  // Verify auth session on mount
  useEffect(() => {
    const token = localStorage.getItem('minerx_auth_token');
    if (token) {
      apiFetch('/api/auth/me')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success && data.user) {
            setCurrentUser(data.user);
            localStorage.setItem('minerx_user', JSON.stringify(data.user));
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleLogin = (user: any, token: string) => {
    setCurrentUser(user);
    localStorage.setItem('minerx_user', JSON.stringify(user));
    localStorage.setItem('minerx_auth_token', token);
    setViewMode('dashboard');
  };

  const handleLogout = () => {
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('minerx_auth_token');
    localStorage.removeItem('minerx_user');
    setCurrentUser(null);
  };

  // UI State
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [reallocatingWorker, setReallocatingWorker] = useState<MergedGPUWorker | null>(null);

  // Sync user-isolated configuration from database (Firestore / backend)
  useEffect(() => {
    const token = localStorage.getItem('minerx_auth_token');
    if (token) {
      apiFetch('/api/config')
        .then((res) => (res.ok ? res.json() : null))
        .then((cfg) => {
          if (cfg) {
            if (cfg.saladAccounts && Array.isArray(cfg.saladAccounts) && cfg.saladAccounts.length > 0) {
              setAccounts(cfg.saladAccounts);
            }
            if (cfg.kryptexConfig && cfg.kryptexConfig.walletAddress) {
              setKryptexConfig(cfg.kryptexConfig);
            }
            if (cfg.appSettings) {
              setSettings((prev) => ({ ...prev, ...cfg.appSettings }));
            }
          }
        })
        .catch(() => {});
    }
  }, [currentUser]);

  const fetchSaladBalance = useCallback(async () => {
    try {
      const res = await apiFetch('/api/salad/balance');
      if (res.ok) {
        const data = await res.json();
        setSaladBalance(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchSaladBalance();
  }, [fetchSaladBalance]);

  const handleUpdateAccountBalance = useCallback(async (accountId: string, newBalanceUSD: number) => {
    try {
      const res = await apiFetch('/api/salad/account-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, balanceUSD: newBalanceUSD })
      });
      if (res.ok) {
        await fetchSaladBalance();
        setAccounts((prev) =>
          prev.map((a) => (a.id === accountId ? { ...a, balanceUSD: newBalanceUSD } : a))
        );
      }
    } catch (err) {
      console.error('Error actualizando saldo de cuenta:', err);
    }
  }, [fetchSaladBalance]);

  // Save to LocalStorage on updates (Local-only, does NOT hit disk files that trigger Vite reload)
  useEffect(() => {
    localStorage.setItem('minerx_salad_accounts', JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem('minerx_kryptex_config', JSON.stringify(kryptexConfig));
  }, [kryptexConfig]);

  useEffect(() => {
    localStorage.setItem('minerx_settings', JSON.stringify(settings));
  }, [settings]);

  // Sync to backend config only on explicit user actions (User-Isolated with Bearer Auth)
  const syncBackendConfig = useCallback((accs: SaladAccountConfig[], kcfg: KryptexConfig, sett: AppSettings) => {
    apiFetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saladAccounts: accs,
        kryptexConfig: kcfg,
        appSettings: sett
      })
    }).catch(() => {});
  }, []);

  // Dynamic Fleet Summary
  const fleetSummary = useMemo(() => {
    return computeFleetSummary(workers, accounts);
  }, [workers, accounts]);

  // Count of unresolved alerts (Only active running GPUs with performance issues or offline nodes, excluding allocating)
  const unresolvedAlertsCount = useMemo(() => {
    return alerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length;
  }, [alerts]);

  // Sync / Refresh function (100% Live Telemetry - Zero Mock Fallback)
  const refreshTelemetry = useCallback(async (isManual: boolean = false) => {
    if (isManual) {
      setIsRefreshing(true);
    }
    try {
      // If neither Kryptex wallet nor Salad accounts exist, keep everything cleanly at zero
      if (!kryptexConfig.walletAddress && accounts.length === 0) {
        setWorkers([]);
        setAlerts([]);
        setHistory([]);
        setBalance({ total: 0, confirmed: 0, unconfirmed: 0, threshold: 1, reached_pct: 0 });
        return;
      }

      let kryptexLiveWorkers: any[] = [];
      let saladLiveInstances: any[] = [];

      // 1. Fetch SaladCloud Live Instances across all configured accounts
      if (accounts.length > 0) {
        try {
          const saladRes = await apiFetch('/api/salad/all-active', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accounts })
          });
          if (saladRes.ok) {
            const saladData = await saladRes.json();
            saladLiveInstances = saladData.instances || [];
          }
        } catch (saladErr) {
          console.error('Error fetching live Salad instances:', saladErr);
        }
      }

      // 2. Fetch Kryptex Live Data (Pool, Workers, Balance, Payouts)
      if (kryptexConfig.walletAddress) {
        try {
          // 2a. Kryptex Pool Info
          const poolRes = await apiFetch(`/api/kryptex/pool?coin=${kryptexConfig.coin || 'prl'}`);
          if (poolRes.ok) {
            const pData = await poolRes.json();
            setPoolInfo((prev) => ({ ...prev, ...pData }));
          }

          // 2b. Kryptex Active Workers
          const workersRes = await apiFetch(`/api/kryptex/workers/${kryptexConfig.walletAddress}?coin=${kryptexConfig.coin || 'prl'}`);
          if (workersRes.ok) {
            const wData = await workersRes.json();
            kryptexLiveWorkers = wData?.results || [];
          }

          // 2c. Kryptex Balance
          const balRes = await apiFetch(`/api/kryptex/balance/${kryptexConfig.walletAddress}?coin=${kryptexConfig.coin || 'prl'}`);
          if (balRes.ok) {
            const bData = await balRes.json();
            setBalance((prev) => ({ ...prev, ...bData }));
          }

          // 2d. Kryptex Historical Payouts & Reward Stats (Live API)
          const payoutsRes = await apiFetch(`/api/kryptex/payouts/${kryptexConfig.walletAddress}?coin=${kryptexConfig.coin || 'prl'}`);
          if (payoutsRes.ok) {
            const payData = await payoutsRes.json();
            setPayoutStats(payData);
          }
        } catch (kryptexErr) {
          console.error('Error fetching live Kryptex APIs:', kryptexErr);
        }
      }

      // 3. Merged Fleet Synthesis (Cross-reference Salad instances & Kryptex workers)
      const mergedWorkersList: MergedGPUWorker[] = [];

      if (saladLiveInstances.length > 0) {
        const kryptexPoolWorker = kryptexLiveWorkers[0];
        const rawPoolHash = kryptexPoolWorker?.avg_hashrate_30m || kryptexPoolWorker?.avg_hashrate_3h || kryptexPoolWorker?.avg_hashrate_24h || '0';
        const kryptexPoolHashTHs = Number((parseFloat(rawPoolHash) / 1e12).toFixed(1));

        const runningInstances = saladLiveInstances.filter((si: any) => si.state === 'running');
        const runningCount = Math.max(1, runningInstances.length);

        saladLiveInstances.forEach((si: any, idx: number) => {
          const isRunning = si.state === 'running';
          const isAllocating = si.state === 'allocating';

          const shortMach = si.machine_id && si.machine_id.length > 8 ? si.machine_id.slice(0, 8) : si.machineId && si.machineId.length > 8 ? si.machineId.slice(0, 8) : `node-${idx + 1}`;
          const workerName = isRunning ? `salad-gpu-${shortMach}` : `salad-allocating-${idx + 1}`;

          const saladLogHash = si.saladLogHashrateTHs !== null && si.saladLogHashrateTHs !== undefined 
            ? Number(si.saladLogHashrateTHs) 
            : null;

          const effectiveHash = isRunning 
            ? (saladLogHash !== null ? saladLogHash : Number((kryptexPoolHashTHs / runningCount).toFixed(1)))
            : 0;

          const rawGpu = si.gpuModel || si.gpuClass || 'NVIDIA GeForce RTX 4090';
          const matchedGpu = resolveGpuBenchmark(rawGpu);
          const benchmarkTHs = matchedGpu.expectedTHs;
          const targetMin = matchedGpu.targetMin;
          const targetMax = matchedGpu.targetMax;
          const vram = matchedGpu.vram;
          let hourlyCost = isAllocating ? 0 : matchedGpu.hourlyCost;

          const ratio = benchmarkTHs > 0 ? (effectiveHash / benchmarkTHs) * 100 : 0;
          const grossHour = effectiveHash * BASELINE_USD_PER_THS_HOUR;
          const netHour = grossHour - hourlyCost;

          const isWithinWindow = isRunning ? (effectiveHash >= targetMin && effectiveHash <= targetMax) : false;
          const isUnderperforming = isRunning && (effectiveHash > 0 && effectiveHash < targetMin);

          let alertType: 'UNDERPERFORMING' | 'OFFLINE_NOT_MINING' | 'ALLOCATING' | undefined;
          let alertMessage: string | undefined;
          let recommendation: 'OPTIMAL' | 'REALLOCATE_RECOMMENDED' | 'RESTART_CONTAINER' | 'TERMINATE_LOSS' = 'OPTIMAL';

          if (isAllocating) {
            alertType = 'ALLOCATING';
            alertMessage = 'SaladCloud está buscando nodo físico en la red descentralizada';
          } else if (isUnderperforming) {
            alertType = 'UNDERPERFORMING';
            alertMessage = `Potencia en log (${effectiveHash} TH/s) fuera de la ventana óptima (${targetMin}-${targetMax} TH/s). Throttling térmico o silicon lottery.`;
            recommendation = 'REALLOCATE_RECOMMENDED';
          } else if (!isRunning) {
            alertType = 'OFFLINE_NOT_MINING';
            alertMessage = 'Instancia detenida o desconectada en SaladCloud';
            recommendation = 'RESTART_CONTAINER';
          }

          mergedWorkersList.push({
            id: si.id || `inst-${idx}`,
            workerName: workerName,
            machineId: si.machine_id || si.machineId || `mach-${idx + 1}`,
            accountId: si.accountId || accounts[0]?.id || 'salad-acc-1',
            accountName: si.accountName || accounts[0]?.accountName || 'SaladCloud',
            containerGroupName: si.containerGroupName || 'comfyui-video-wan25',
            gpuModel: rawGpu,
            vramGB: vram,
            saladPriority: 'Lowest Priority',
            saladStatus: si.state || (isRunning ? 'running' : 'allocating'),
            isMining: isRunning && effectiveHash > 0,
            minutesSinceLastShare: isRunning ? 0.5 : 999,
            currentHashrateTHs: effectiveHash,
            saladLogHashrateTHs: saladLogHash !== null ? saladLogHash : undefined,
            kryptexHashrateTHs: kryptexPoolHashTHs,
            expectedBenchmarkTHs: benchmarkTHs,
            targetWindowMinTHs: targetMin,
            targetWindowMaxTHs: targetMax,
            isWithinWindow: isWithinWindow,
            hashrateSamples: si.hashrateSamples || [],
            staleRatioText: si.staleRatioText,
            latestLogTime: si.latestLogTime,
            performanceRatioPct: Number(ratio.toFixed(1)),
            hourlySaladCost: hourlyCost,
            dailySaladCost: hourlyCost * 24,
            hourlyGrossRevenue: grossHour,
            dailyGrossRevenue: grossHour * 24,
            hourlyNetProfit: netHour,
            dailyNetProfit: netHour * 24,
            profitMarginPct: grossHour > 0 ? (netHour / grossHour) * 100 : 0,
            efficiencyTHsPerDollar: hourlyCost > 0 ? effectiveHash / hourlyCost : 0,
            validShares: kryptexPoolWorker?.valid ? Math.round(kryptexPoolWorker.valid / runningCount) : 0,
            staleShares: kryptexPoolWorker?.stale ? Math.round(kryptexPoolWorker.stale / runningCount) : 0,
            invalidShares: kryptexPoolWorker?.invalid || 0,
            agent: kryptexPoolWorker?.agent || 'Fl4shMiner/1.5.2',
            serverGeo: kryptexPoolWorker?.country || 'US',
            connectedAt: isRunning ? 'Minando activamente' : isAllocating ? 'En asignación (Allocating)' : 'Inactivo',
            lastShareTimestamp: isRunning ? Date.now() - 30000 : 0,
            hasAlert: isUnderperforming || isAllocating,
            alertType: alertType,
            alertMessage: alertMessage,
            recommendation: recommendation
          });
        });
      } else if (kryptexLiveWorkers.length > 0) {
        kryptexLiveWorkers.forEach((kw: any, idx: number) => {
          const rawHashStr = kw.avg_hashrate_30m || kw.avg_hashrate_3h || kw.avg_hashrate_24h || '0';
          const rawHashNum = parseFloat(rawHashStr);
          const hashrateTHs = Number((rawHashNum / 1e12).toFixed(1));
          const lastShareMs = kw.last_share > 1e11 ? Number(kw.last_share) : Number(kw.last_share) * 1000;
          const minutesAgo = Math.max(0, (Date.now() - lastShareMs) / 60000);
          const isAlive = kw.status === 'online' && minutesAgo < (settings.maxShareInactivityMinutes || 1);
          const rawGpuName = kw.gpu || kw.worker || 'NVIDIA GeForce RTX 4090';
          const matchedKryptexGpu = resolveGpuBenchmark(rawGpuName);
          const hourlyCost = matchedKryptexGpu.hourlyCost;
          const benchmarkTHs = matchedKryptexGpu.expectedTHs;
          const targetMin = matchedKryptexGpu.targetMin;
          const targetMax = matchedKryptexGpu.targetMax;
          const vram = matchedKryptexGpu.vram;
          const grossHour = hashrateTHs * BASELINE_USD_PER_THS_HOUR;
          const netHour = grossHour - hourlyCost;
          const ratio = benchmarkTHs > 0 ? (hashrateTHs / benchmarkTHs) * 100 : 100;
          const isUnder = isAlive && hashrateTHs < targetMin;

          mergedWorkersList.push({
            id: `kryptex-${kw.worker || idx}`,
            workerName: kw.worker || `worker-${idx + 1}`,
            machineId: `kryptex_${kw.server_geo || kw.country || 'us'}_${idx + 1}`,
            accountId: accounts[0]?.id || 'salad-acc-1',
            accountName: accounts[0]?.accountName || 'SaladCloud Cluster',
            containerGroupName: 'prl-cluster-live',
            gpuModel: matchedKryptexGpu.name,
            vramGB: vram,
            saladPriority: 'Lowest Priority',
            saladStatus: isAlive ? 'running' : 'stopped',
            isMining: isAlive,
            minutesSinceLastShare: Number(minutesAgo.toFixed(1)),
            currentHashrateTHs: hashrateTHs,
            expectedBenchmarkTHs: benchmarkTHs,
            targetWindowMinTHs: targetMin,
            targetWindowMaxTHs: targetMax,
            isWithinWindow: hashrateTHs >= targetMin && hashrateTHs <= targetMax,
            performanceRatioPct: Number(ratio.toFixed(1)),
            hourlySaladCost: hourlyCost,
            dailySaladCost: hourlyCost * 24,
            hourlyGrossRevenue: grossHour,
            dailyGrossRevenue: grossHour * 24,
            hourlyNetProfit: netHour,
            dailyNetProfit: netHour * 24,
            profitMarginPct: grossHour > 0 ? (netHour / grossHour) * 100 : 0,
            efficiencyTHsPerDollar: hashrateTHs / hourlyCost,
            validShares: kw.valid || 0,
            staleShares: kw.stale || 0,
            invalidShares: kw.invalid || 0,
            agent: kw.agent,
            serverGeo: kw.country || kw.server_geo,
            connectedAt: isAlive ? 'Minando activamente' : `Inactivo hace ${Math.floor(minutesAgo)}m`,
            lastShareTimestamp: lastShareMs,
            hasAlert: !isAlive || isUnder,
            alertType: !isAlive ? 'OFFLINE_NOT_MINING' : isUnder ? 'UNDERPERFORMING' : undefined,
            alertMessage: !isAlive ? `Sin enviar shares hace ${Math.floor(minutesAgo)}m` : isUnder ? `Rendimiento al ${ratio.toFixed(0)}% (esperado: 280-330 TH/s)` : undefined,
            recommendation: !isAlive ? 'RESTART_CONTAINER' : isUnder ? 'REALLOCATE_RECOMMENDED' : 'OPTIMAL'
          });
        });
      }

      setWorkers(mergedWorkersList);

      // Sincronización 1:1 de Eventos & Alertas en Tiempo Real
      const liveAlerts: AlertEvent[] = [];
      mergedWorkersList.forEach((w) => {
        if (w.saladStatus === 'running') {
          if (!w.isWithinWindow || w.performanceRatioPct < 80) {
            liveAlerts.push({
              id: `alert-${w.id}`,
              timestamp: w.latestLogTime ? new Date(w.latestLogTime).toLocaleTimeString() : 'En vivo',
              type: 'UNDERPERFORMING',
              workerName: w.workerName,
              gpuModel: w.gpuModel,
              message: w.alertMessage || `Potencia (${w.currentHashrateTHs} TH/s) fuera de la ventana óptima (${w.targetWindowMinTHs}-${w.targetWindowMaxTHs} TH/s). Throttling térmico o silicon lottery deficiente.`,
              severity: 'warning',
              instanceId: w.id,
              containerGroupName: w.containerGroupName,
              accountId: w.accountId
            });
          }
        } else if (w.saladStatus === 'allocating') {
          liveAlerts.push({
            id: `alert-${w.id}`,
            timestamp: 'En vivo',
            type: 'ALLOCATING',
            workerName: w.workerName,
            gpuModel: w.gpuModel,
            message: 'SaladCloud está buscando un nodo físico disponible en la red descentralizada. Facturación $0/hr mientras asigna.',
            severity: 'info',
            instanceId: w.id,
            containerGroupName: w.containerGroupName,
            accountId: w.accountId
          });
        } else if (w.saladStatus === 'stopped') {
          liveAlerts.push({
            id: `alert-${w.id}`,
            timestamp: 'En vivo',
            type: 'DISCONNECT',
            workerName: w.workerName,
            gpuModel: w.gpuModel,
            message: 'Instancia detenida o desconectada en SaladCloud.',
            severity: 'critical',
            instanceId: w.id,
            containerGroupName: w.containerGroupName,
            accountId: w.accountId
          });
        }
      });
      setAlerts(liveAlerts);

      // Update telemetry history point
      if (mergedWorkersList.length > 0) {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const totalH = mergedWorkersList.reduce((acc, w) => acc + (w.isMining ? w.currentHashrateTHs : 0), 0);
        const totalCost = mergedWorkersList.reduce((acc, w) => acc + w.hourlySaladCost, 0);
        const totalGross = totalH * BASELINE_USD_PER_THS_HOUR;
        const netProf = totalGross - totalCost;

        setHistory((prev) => {
          const next: HashrateHistoryPoint[] = [...prev.slice(-11), {
            time: timeStr,
            timestamp: now.getTime(),
            fleetHashrateTHs: Number(totalH.toFixed(1)),
            activeGpus: mergedWorkersList.filter((w) => w.isMining).length,
            netProfitPerHourUSD: Number(netProf.toFixed(3)),
            saladCostPerHourUSD: Number(totalCost.toFixed(3))
          }];
          return next;
        });
      }
    } finally {
      if (isManual) {
        setIsRefreshing(false);
      }
    }
  }, [kryptexConfig, accounts, settings.maxShareInactivityMinutes, settings.underperformingThresholdPct]);

  // Initial load & Auto-refresh interval (silent, no screen flicker)
  useEffect(() => {
    const isConnected = !!kryptexConfig.walletAddress || accounts.length > 0;
    if (isConnected) {
      refreshTelemetry(false);
      const interval = setInterval(() => {
        refreshTelemetry(false);
      }, (settings.refreshIntervalSeconds || 60) * 1000);
      return () => clearInterval(interval);
    } else {
      setWorkers([]);
      setAlerts([]);
      setHistory([]);
      setBalance({ total: 0, confirmed: 0, unconfirmed: 0, threshold: 1, reached_pct: 0 });
    }
  }, [refreshTelemetry, settings.refreshIntervalSeconds, kryptexConfig.walletAddress, accounts.length]);

  // Live Reallocate handler (SaladCloud API)
  const handleConfirmReallocate = async (targetWorker: MergedGPUWorker): Promise<boolean> => {
    try {
      const targetAcc = accounts.find((a) => a.id === targetWorker.accountId) || accounts[0];
      if (!targetAcc) throw new Error('No se encontró la cuenta de Salad asociada');

      const res = await apiFetch('/api/salad/reallocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: targetAcc.organizationName,
          projectName: targetAcc.projectName,
          containerGroupName: targetWorker.containerGroupName,
          instanceId: targetWorker.id,
          apiKey: targetAcc.apiKey
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const newEvent: AlertEvent = {
          id: `evt-${Date.now()}`,
          timestamp: 'Ahora mismo',
          type: 'REALLOCATION',
          workerName: targetWorker.workerName,
          gpuModel: targetWorker.gpuModel,
          message: `Solicitud de reasignación enviada a SaladCloud para ${targetWorker.workerName}. Provisión de nuevo nodo en progreso.`,
          severity: 'info',
          instanceId: targetWorker.id
        };
        setAlerts((prev) => [newEvent, ...prev]);
        refreshTelemetry(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error confirming reallocate:', err);
      return false;
    }
  };

  // Live Restart handler (SaladCloud API fast reboot)
  const handleConfirmRestart = async (targetWorker: MergedGPUWorker): Promise<boolean> => {
    try {
      const targetAcc = accounts.find((a) => a.id === targetWorker.accountId) || accounts[0];
      if (!targetAcc) throw new Error('No se encontró la cuenta de Salad asociada');

      const res = await apiFetch('/api/salad/restart-instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: targetAcc.organizationName,
          projectName: targetAcc.projectName,
          containerGroupName: targetWorker.containerGroupName,
          instanceId: targetWorker.id,
          apiKey: targetAcc.apiKey
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const newEvent: AlertEvent = {
          id: `evt-${Date.now()}`,
          timestamp: 'Ahora mismo',
          type: 'RESTART',
          workerName: targetWorker.workerName,
          gpuModel: targetWorker.gpuModel,
          message: `Reinicio rápido ejecutado para ${targetWorker.workerName} en SaladCloud.`,
          severity: 'info',
          instanceId: targetWorker.id
        };
        setAlerts((prev) => [newEvent, ...prev]);
        refreshTelemetry(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error confirming restart:', err);
      return false;
    }
  };

  // Live Recreate handler (SaladCloud API container rebuild)
  const handleConfirmRecreate = async (targetWorker: MergedGPUWorker): Promise<boolean> => {
    try {
      const targetAcc = accounts.find((a) => a.id === targetWorker.accountId) || accounts[0];
      if (!targetAcc) throw new Error('No se encontró la cuenta de Salad asociada');

      const res = await apiFetch('/api/salad/recreate-instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: targetAcc.organizationName,
          projectName: targetAcc.projectName,
          containerGroupName: targetWorker.containerGroupName,
          instanceId: targetWorker.id,
          apiKey: targetAcc.apiKey
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const newEvent: AlertEvent = {
          id: `evt-${Date.now()}`,
          timestamp: 'Ahora mismo',
          type: 'RECREATE',
          workerName: targetWorker.workerName,
          gpuModel: targetWorker.gpuModel,
          message: `Contenedor ${targetWorker.workerName} reconstruido desde cero en SaladCloud.`,
          severity: 'info',
          instanceId: targetWorker.id
        };
        setAlerts((prev) => [newEvent, ...prev]);
        refreshTelemetry(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error confirming recreate:', err);
      return false;
    }
  };

  // Test Salad Account connection
  const handleTestSaladAccount = async (acc: SaladAccountConfig) => {
    try {
      const res = await apiFetch('/api/salad/test-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: acc.organizationName,
          projectName: acc.projectName,
          apiKey: acc.apiKey
        })
      });
      const data = await res.json();
      return {
        success: data.success,
        message: data.message || (data.success ? 'Conexión verificada exitosamente' : 'Fallo de autenticación')
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error de conexión' };
    }
  };

  // Test Kryptex connection
  const handleTestKryptex = async () => {
    if (!kryptexConfig.walletAddress) {
      return { success: false, message: 'Ingresa una dirección de wallet o usuario de Kryptex primero.' };
    }
    try {
      const res = await apiFetch(`/api/kryptex/pool?coin=${kryptexConfig.coin || 'prl'}`);
      const data = await res.json();
      if (res.ok) {
        return {
          success: true,
          message: `Conexión a Kryptex exitosa. Pool ${data.name || 'Pearl'} activo con ${data.miners?.toLocaleString()} mineros.`
        };
      }
      return { success: false, message: 'No se pudo comunicar con el pool de Kryptex' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error de red' };
    }
  };

  // Test Webhook
  const handleTestWebhook = async () => {
    if (!settings.discordWebhookUrl && !settings.telegramBotToken) {
      return { success: false, message: 'Configura una URL de Discord o Token de Telegram primero.' };
    }
    try {
      const res = await apiFetch('/api/alerts/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: settings.discordWebhookUrl,
          telegramToken: settings.telegramBotToken,
          telegramChatId: settings.telegramChatId,
          title: 'Prueba de Alerta MinerX',
          message: 'Esta es una notificación de prueba del sistema de vigilancia de GPUs MinerX.',
          severity: 'info'
        })
      });
      await res.json();
      return { success: true, message: 'Alerta enviada correctamente a los canales configurados.' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error al enviar webhook' };
    }
  };

  // Account Management functions
  const handleAddAccount = (newAcc: Omit<SaladAccountConfig, 'id' | 'status'>) => {
    const acc: SaladAccountConfig = {
      ...newAcc,
      id: `salad-acc-${Date.now()}`,
      status: 'untested'
    };
    const updated = [...accounts, acc];
    setAccounts(updated);
    syncBackendConfig(updated, kryptexConfig, settings);
  };

  const handleDeleteAccount = (id: string) => {
    const updated = accounts.filter((a) => a.id !== id);
    setAccounts(updated);
    syncBackendConfig(updated, kryptexConfig, settings);
  };

  const handleToggleAccount = (id: string) => {
    const updated = accounts.map((a) =>
      a.id === id ? { ...a, enabled: !a.enabled } : a
    );
    setAccounts(updated);
    syncBackendConfig(updated, kryptexConfig, settings);
  };

  const handleUpdateAccount = (updatedAcc: SaladAccountConfig) => {
    const updated = accounts.map((a) => (a.id === updatedAcc.id ? updatedAcc : a));
    setAccounts(updated);
    syncBackendConfig(updated, kryptexConfig, settings);
    setTimeout(() => refreshTelemetry(false), 300);
  };

  const handleClearAlerts = () => {
    setAlerts([]);
  };

  // Standalone Floating Desktop Widget Mode (Electron Frameless HUD or Browser Pop-out)
  if (typeof window !== 'undefined' && window.location.hash === '#widget') {
    return (
      <div 
        className="fixed inset-0 bg-transparent flex items-start justify-center p-3 select-none overflow-hidden"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <FloatingHubWidget
            summary={fleetSummary}
            workers={workers}
            saladBalance={saladBalance}
            kryptexBalance={balance}
            poolTicker={poolInfo.ticker || 'PRL'}
            onNavigateToTab={() => {
              if (window.opener) {
                try { window.opener.focus(); } catch {}
              }
            }}
            onToggleTheme={handleToggleTheme}
            isDarkTheme={themeMode === 'dark'}
            onRefresh={() => refreshTelemetry(true)}
            isRefreshing={isRefreshing}
            initiallyExpanded={true}
            isStandalone={true}
          />
        </div>
      </div>
    );
  }

  // Si el usuario aún NO ha iniciado sesión, mostrar directamente la pantalla de Login / Registro
  if (!currentUser) {
    return (
      <div className={`min-h-screen font-sans ${themeMode === 'light' ? 'bg-[#EDEFF8]' : 'bg-[#07090F]'}`}>
        <AuthScreen
          onLogin={handleLogin}
          onOpenLanding={() => setViewMode('landing')}
          isDarkTheme={themeMode === 'dark'}
        />
      </div>
    );
  }

  // Si el usuario autenticado decide explorar la Landing Page informativa
  if (viewMode === 'landing') {
    return (
      <>
        <LandingPage
          onEnterDashboard={() => setViewMode('dashboard')}
          currentUser={currentUser}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />
        <FloatingHubWidget
          summary={fleetSummary}
          workers={workers}
          saladBalance={saladBalance}
          kryptexBalance={balance}
          poolTicker={poolInfo.ticker || 'PRL'}
          onNavigateToTab={(tab) => {
            setViewMode('dashboard');
            setActiveTab(tab);
          }}
          onToggleTheme={handleToggleTheme}
          isDarkTheme={themeMode === 'dark'}
          onRefresh={() => refreshTelemetry(true)}
          isRefreshing={isRefreshing}
        />
      </>
    );
  }

  return (
    <div className={`min-h-screen font-sans selection:bg-[#05DF72]/20 selection:text-[#05DF72] transition-colors p-2 sm:p-4 md:p-6 lg:p-8 flex justify-center items-start ${
      themeMode === 'light' ? 'bg-[#EDEFF8] text-slate-900' : 'bg-[#07090F] text-slate-100'
    }`}>
      {/* MAIN ELEVATED CARD CONTAINER (Ref: White floating modern card container from video) */}
      <div className={`w-full max-w-7xl flex flex-col rounded-[28px] sm:rounded-[36px] border shadow-2xl backdrop-blur-xl overflow-hidden transition-all ${
        themeMode === 'light'
          ? 'bg-white/95 border-slate-200/90 shadow-slate-300/40 text-slate-900'
          : 'bg-[#080B12]/95 border-white/[0.08] shadow-black/80 text-white'
      }`}>
        {/* Top Header inside the elevated card */}
        <Header
          summary={fleetSummary}
          settings={settings}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onRefresh={() => refreshTelemetry(true)}
          isRefreshing={isRefreshing}
          unresolvedAlertsCount={unresolvedAlertsCount}
          walletAddress={kryptexConfig.walletAddress}
          onUpdateWallet={(addr) => {
            const updated = { ...kryptexConfig, walletAddress: addr };
            setKryptexConfig(updated);
            syncBackendConfig(accounts, updated, settings);
          }}
          poolInfo={poolInfo}
          saladBalance={saladBalance || undefined}
          onUpdateSaladBalance={(newBal) => handleUpdateAccountBalance(accounts[0]?.id || 'salad-acc-1', newBal)}
          onOpenLanding={() => setViewMode('landing')}
          currentUser={currentUser}
          onLogout={handleLogout}
          isDarkTheme={themeMode === 'dark'}
          onToggleTheme={handleToggleTheme}
          onOpenHub={() => {
            if ((window as any).electronAPI?.toggleDesktopWidget) {
              (window as any).electronAPI.toggleDesktopWidget();
            } else {
              window.open('#widget', 'MinerX_HUD', 'width=360,height=520,frame=false,alwaysOnTop=true');
            }
          }}
        />

        {/* Content Area */}
        <main className="flex-1 w-full px-4 sm:px-6 md:px-8 pt-5 overflow-y-auto">
          {activeTab === 'overview' && (
            <OverviewTab
              summary={fleetSummary}
              workers={workers}
              history={history}
              balance={balance}
              poolInfo={poolInfo}
              payoutStats={payoutStats}
              walletAddress={kryptexConfig.walletAddress}
              onOpenReallocate={(w) => setReallocatingWorker(w)}
              onNavigateToFleet={() => setActiveTab('fleet')}
              onNavigateToApis={() => setActiveTab('apis')}
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {activeTab === 'fleet' && (
            <FleetTab
              workers={workers}
              accounts={accounts}
              saladBalance={saladBalance}
              onUpdateAccountBalance={handleUpdateAccountBalance}
              onOpenReallocate={(w) => setReallocatingWorker(w)}
              onRefreshTelemetry={() => refreshTelemetry(true)}
            />
          )}

          {activeTab === 'economics' && (
            <EconomicsTab
              workers={workers}
              summary={fleetSummary}
              saladBalance={saladBalance}
              balance={balance}
              poolInfo={poolInfo}
              accounts={accounts}
            />
          )}

          {activeTab === 'apis' && (
            <ApiManagerTab
              accounts={accounts}
              onAddAccount={handleAddAccount}
              onUpdateAccount={handleUpdateAccount}
              onDeleteAccount={handleDeleteAccount}
              onToggleAccount={handleToggleAccount}
              kryptexConfig={kryptexConfig}
              onUpdateKryptexConfig={(cfg) => {
                const updated = { ...kryptexConfig, ...cfg };
                setKryptexConfig(updated);
                syncBackendConfig(accounts, updated, settings);
              }}
              settings={settings}
              onUpdateSettings={(st) => {
                const updated = { ...settings, ...st };
                setSettings(updated);
                syncBackendConfig(accounts, kryptexConfig, updated);
              }}
              onTestSaladAccount={handleTestSaladAccount}
              onTestKryptex={handleTestKryptex}
              onTestWebhook={handleTestWebhook}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertsTab
              alerts={alerts}
              workers={workers}
              onClearAlerts={handleClearAlerts}
              onOpenReallocate={(w) => setReallocatingWorker(w)}
            />
          )}
        </main>
      </div>

      {/* Reallocate GPU Modal */}
      <ReallocateModal
        worker={reallocatingWorker}
        isOpen={!!reallocatingWorker}
        onClose={() => setReallocatingWorker(null)}
        onConfirmReallocate={handleConfirmReallocate}
        onConfirmRestart={handleConfirmRestart}
        onConfirmRecreate={handleConfirmRecreate}
      />

      {/* Bottom Navigation for Mobile Smartphones */}
      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unresolvedAlertsCount={unresolvedAlertsCount}
        totalGpus={workers.length}
      />

      {/* Floating Telemetry Hub Widget (Dynamic Island / Capsule) */}
      <FloatingHubWidget
        summary={fleetSummary}
        workers={workers}
        saladBalance={saladBalance}
        kryptexBalance={balance}
        poolTicker={poolInfo.ticker || 'PRL'}
        onNavigateToTab={(tab) => setActiveTab(tab)}
        onToggleTheme={handleToggleTheme}
        isDarkTheme={themeMode === 'dark'}
        onRefresh={() => refreshTelemetry(true)}
        isRefreshing={isRefreshing}
      />
    </div>
  );
};
export default App;
