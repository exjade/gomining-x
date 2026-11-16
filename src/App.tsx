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

// Admin Control Center Views (Unified Calculation Model & Hybrid Mining Architecture)
import { AdminOverview } from './components/admin/AdminOverview';
import { MiningEngineControlView } from './components/admin/MiningEngineControlView';
import { PackageBuilderView } from './components/admin/PackageBuilderView';
import { ContractsAllocationView } from './components/admin/ContractsAllocationView';
import { VirtualWorkersView } from './components/admin/VirtualWorkersView';
import { LedgerView } from './components/admin/LedgerView';
import { UserManagementView } from './components/admin/UserManagementView';
import { PromotionsManagerView } from './components/admin/PromotionsManagerView';
import { AuditLogsView } from './components/admin/AuditLogsView';
import { ReferralsView } from './components/admin/ReferralsView';
import { WithdrawalsView } from './components/admin/WithdrawalsView';
import { PackagePaymentsView } from './components/admin/PackagePaymentsView';
import { MinerxProfitEngine } from './services/admin/minerxProfitEngine';

import { 
  INITIAL_SALAD_ACCOUNTS, 
  INITIAL_KRYPTEX_CONFIG, 
  INITIAL_KRYPTEX_ACCOUNTS,
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
import { logoutFirebase } from './utils/firebaseAuth';
import type { 
  SaladAccountConfig, 
  KryptexConfig, 
  KryptexAccountConfig,
  AppSettings, 
  MergedGPUWorker, 
  AlertEvent, 
  HashrateHistoryPoint, 
  KryptexBalanceRaw, 
  KryptexPoolInfo,
  KryptexPayoutStatsRaw,
  SaladBalanceInfo 
} from './types/minerx';

// Helper to parse initial tab from URL params or pathname
export { resolveTabFromUrl } from './utils/urlRouting';
import { resolveTabFromUrl } from './utils/urlRouting';

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

  const [kryptexAccounts, setKryptexAccounts] = useState<KryptexAccountConfig[]>(() => {
    const saved = localStorage.getItem('minerx_kryptex_accounts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    const legacySaved = localStorage.getItem('minerx_kryptex_config');
    if (legacySaved) {
      try {
        const parsed = JSON.parse(legacySaved);
        if (parsed.walletAddress && parsed.walletAddress !== 'prl1qy7997hvd3l0628e3k4mfx5z4ptslqgww99d8v9') {
          return [{
            id: 'kryptex-acc-primary',
            accountName: 'Billetera Principal Kryptex',
            walletAddress: parsed.walletAddress,
            coin: parsed.coin || 'prl',
            poolUrl: parsed.poolUrl || 'stratum+tcp://prl.kryptex.network:7048',
            enabled: true,
            status: parsed.status || 'connected',
            lastConnected: parsed.lastConnected
          }];
        }
      } catch {}
    }
    return INITIAL_KRYPTEX_ACCOUNTS;
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
  const [prlRateUSD, setPrlRateUSD] = useState<number>(1.43);
  const [poolInfo, setPoolInfo] = useState<KryptexPoolInfo>(INITIAL_POOL_INFO);

  const [saladBalance, setSaladBalance] = useState<SaladBalanceInfo | null>(null);

  // User Authentication & Session State - Requiere autenticación verificada para entrar al dashboard
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authInfrastructureError, setAuthInfrastructureError] = useState<string | null>(null);
  const [isSessionChecking, setIsSessionChecking] = useState<boolean>(() => {
    return typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('minerx_auth_token'));
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

  // Synchronize theme class on root HTML and body elements
  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    }
  }, [themeMode]);

  const handleLogout = useCallback(() => {
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    logoutFirebase().catch(() => {});
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('minerx_auth_token');
      localStorage.removeItem('minerx_user');
      localStorage.removeItem('minerx_auth_user');
    }
    setCurrentUser(null);
    setAuthInfrastructureError(null);
    setSaladBalance(null);
  }, []);

  // Verify auth session on mount (SCRUM-222)
  useEffect(() => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('minerx_auth_token') : null;
    if (!token) {
      handleLogout();
      setIsSessionChecking(false);
      return;
    }

    apiFetch('/api/auth/me')
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 503) {
            setAuthInfrastructureError('La autoridad de autorización administrativa no está disponible.');
            return null;
          }
          handleLogout();
          return null;
        }
        setAuthInfrastructureError(null);
        return res.json();
      })
      .then((data) => {
        if (data?.success && data.user && data.user.role === 'admin') {
          setCurrentUser(data.user);
          localStorage.setItem('minerx_user', JSON.stringify(data.user));
        } else if (data) {
          handleLogout();
        }
      })
      .catch(() => {
        handleLogout();
      })
      .finally(() => {
        setIsSessionChecking(false);
      });
  }, [handleLogout]);

  // Intercept 401 unauthorized events to purge session and reset UI (SCRUM-222)
  useEffect(() => {
    const onUnauthorized = () => {
      handleLogout();
    };
    window.addEventListener('minerx:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('minerx:unauthorized', onUnauthorized);
    };
  }, [handleLogout]);

  const handleLogin = async (_user: any, token: string): Promise<boolean> => {
    // 1. Guardar token temporal en localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('minerx_auth_token', token);
    }

    try {
      // 2. Pre-dashboard authorization check: solo permitir entrar con 200 y rol admin aprobado
      const res = await apiFetch('/api/auth/me');
      if (!res.ok) {
        if (res.status === 503) {
          throw new Error('La autoridad de autorización administrativa no está disponible.');
        }
        throw new Error('Sesión no autorizada para el panel de administración.');
      }
      const data = await res.json();
      if (!data?.success || !data?.user || data?.user?.role !== 'admin') {
        throw new Error('Se requiere un usuario con rol de administrador aprobado.');
      }

      // 3. 200 Admin aprobado: autorizar sesión y abrir dashboard
      setCurrentUser(data.user);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('minerx_user', JSON.stringify(data.user));
      }
      setViewMode('dashboard');
      return true;
    } catch (err: any) {
      // 4. No aprobado o error: purgar credenciales y permanecer en AuthScreen
      handleLogout();
      throw err;
    }
  };

  const getInitialTabFromUrl = (): { tab: string; suite: 'fleet' | 'admin' } | null => {
    return resolveTabFromUrl(window.location.search, window.location.pathname);
  };

  const initialUrlRouting = getInitialTabFromUrl();

  // Operational Suite Mode (Fleet Management vs Admin Control Center)
  const [suiteMode, setSuiteMode] = useState<'fleet' | 'admin'>(() => {
    if (initialUrlRouting) return initialUrlRouting.suite;
    const saved = localStorage.getItem('minerx_suite_mode');
    if (saved === 'admin' || saved === 'fleet') return saved;
    return 'admin';
  });

  const handleToggleSuiteMode = (mode: 'fleet' | 'admin') => {
    setSuiteMode(mode);
    localStorage.setItem('minerx_suite_mode', mode);
  };

  // UI State
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (initialUrlRouting) return initialUrlRouting.tab;
    const savedSuite = localStorage.getItem('minerx_suite_mode');
    return savedSuite === 'fleet' ? 'overview' : 'admin_overview';
  });

  // Keep URL query parameter ?tab=... synchronized with active tab
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') !== activeTab) {
        url.searchParams.set('tab', activeTab);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {}
  }, [activeTab]);
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
            if (cfg.kryptexAccounts && Array.isArray(cfg.kryptexAccounts) && cfg.kryptexAccounts.length > 0) {
              setKryptexAccounts(cfg.kryptexAccounts);
            } else if (cfg.kryptexConfig && cfg.kryptexConfig.walletAddress) {
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
    localStorage.setItem('minerx_kryptex_accounts', JSON.stringify(kryptexAccounts));
  }, [kryptexAccounts]);

  useEffect(() => {
    const firstActive = kryptexAccounts.find(a => a.enabled && a.walletAddress.trim()) || kryptexAccounts[0];
    if (firstActive) {
      setKryptexConfig({
        walletAddress: firstActive.walletAddress,
        coin: firstActive.coin,
        poolUrl: firstActive.poolUrl,
        status: firstActive.status,
        lastConnected: firstActive.lastConnected
      });
    }
  }, [kryptexAccounts]);

  useEffect(() => {
    localStorage.setItem('minerx_settings', JSON.stringify(settings));
  }, [settings]);

  // Sync to backend config only on explicit user actions (User-Isolated with Bearer Auth)
  const syncBackendConfig = useCallback((accs: SaladAccountConfig[], kcfg: KryptexConfig, sett: AppSettings, kAccs?: KryptexAccountConfig[]) => {
    apiFetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saladAccounts: accs,
        kryptexConfig: kcfg,
        kryptexAccounts: kAccs || kryptexAccounts,
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
      // Resolve active Kryptex accounts (Multi-API support)
      const activeKryptexAccounts = kryptexAccounts.filter(a => a.enabled && a.walletAddress && a.walletAddress.trim());
      const effectiveKryptexAccounts: KryptexAccountConfig[] = activeKryptexAccounts.length > 0
        ? activeKryptexAccounts
        : (kryptexConfig.walletAddress && kryptexConfig.walletAddress.trim() ? [{
            id: 'kryptex-acc-primary',
            accountName: 'Billetera Principal Kryptex',
            walletAddress: kryptexConfig.walletAddress.trim(),
            coin: kryptexConfig.coin || 'prl',
            poolUrl: kryptexConfig.poolUrl || 'stratum+tcp://prl.kryptex.network:7048',
            enabled: true,
            status: kryptexConfig.status || 'connected'
          }] : []);

      // If neither Kryptex wallet nor Salad accounts exist, keep everything cleanly at zero
      if (effectiveKryptexAccounts.length === 0 && accounts.length === 0) {
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

      // 2. Fetch Kryptex Live Data (Pool, Workers, Balance, Payouts, Rates) unified across all accounts
      if (effectiveKryptexAccounts.length > 0) {
        try {
          // 2a. Kryptex Pool Info & Spot Market Rates
          const primaryCoin = effectiveKryptexAccounts[0].coin || 'prl';
          const poolRes = await apiFetch(`/api/kryptex/pool?coin=${primaryCoin}`);
          let liveFetchedPrlRate = prlRateUSD;
          let poolJsonData: any = null;
          if (poolRes.ok) {
            poolJsonData = await poolRes.json();
            setPoolInfo((prev) => ({ ...prev, ...poolJsonData }));
          }

          try {
            const ratesRes = await apiFetch('/api/kryptex/rates');
            if (ratesRes.ok) {
              const rData = await ratesRes.json();
              const rate = Number(
                rData?.crypto?.PRL ??
                rData?.crypto?.prl ??
                rData?.rates?.crypto?.PRL ??
                rData?.rates?.crypto?.prl ??
                rData?.PRL ??
                rData?.prl ??
                rData?.rates?.PRL ??
                0
              );
              if (rate > 0.05 && rate < 50) {
                liveFetchedPrlRate = rate;
                setPrlRateUSD(rate);
              }
            }
          } catch (rErr) {
            console.warn('Error fetching Kryptex rates:', rErr);
          }

          // Fallback a Kryptex daily-revenue o pool info si rates no entregó precio válido
          if (!liveFetchedPrlRate || liveFetchedPrlRate < 0.05) {
            try {
              const revRes = await apiFetch('/api/kryptex/daily-revenue?hashrate=1000000000000');
              if (revRes.ok) {
                const revData = await revRes.json();
                const first = Array.isArray(revData) ? revData[0] : revData;
                const usd = Number(first?.usd);
                const coins = Number(first?.coins);
                if (usd > 0 && coins > 0) {
                  const calculatedPrice = Number((usd / coins).toFixed(4));
                  if (calculatedPrice > 0.05 && calculatedPrice < 50) {
                    liveFetchedPrlRate = calculatedPrice;
                    setPrlRateUSD(calculatedPrice);
                  }
                }
              }
            } catch {}
          }

          // Fallback adicional con poolJsonData
          if ((!liveFetchedPrlRate || liveFetchedPrlRate < 0.05) && poolJsonData) {
            const pPrice = Number(poolJsonData.usd_rate || poolJsonData.price || poolJsonData.prices?.usd || 0);
            if (pPrice > 0.05 && pPrice < 50) {
              liveFetchedPrlRate = pPrice;
              setPrlRateUSD(pPrice);
            }
          }

          // Sincronización bidireccional inmediata con el Motor Híbrido MinerX
          try {
            MinerxProfitEngine.getInstance().syncFromFleetTelemetry({
              prlPriceUsd: liveFetchedPrlRate > 0.05 ? liveFetchedPrlRate : undefined,
              poolInfo: poolJsonData
            });
          } catch (peErr) {
            console.warn('No se pudo sincronizar Profit Engine desde telemetría de flota:', peErr);
          }

          // 2b, 2c, 2d. Concurrently query all connected Kryptex accounts & unify data
          let aggregatedTotal = 0;
          let aggregatedConfirmed = 0;
          let aggregatedUnconfirmed = 0;
          let aggregatedThreshold = 0;
          const balanceAccountsBreakdown: any[] = [];

          let aggregatedPaid = 0;
          let aggregatedUnpaid = 0;
          let aggregatedWeekReward = 0;
          let aggregatedMonthReward = 0;
          const payoutAccountsBreakdown: any[] = [];

          await Promise.allSettled(
            effectiveKryptexAccounts.map(async (acc) => {
              const coin = acc.coin || 'prl';
              const wallet = (acc.walletAddress || '').split('?')[0].trim();
              if (!wallet) return;

              // Active Workers for this wallet
              try {
                const workersRes = await apiFetch(`/api/kryptex/workers/${wallet}?coin=${coin}`);
                if (workersRes.ok) {
                  const wData = await workersRes.json();
                  const results = (wData?.results || []).map((w: any) => ({
                    ...w,
                    _kryptexAccountId: acc.id,
                    _kryptexAccountName: acc.accountName,
                    _kryptexWallet: wallet
                  }));
                  kryptexLiveWorkers.push(...results);
                }
              } catch (wErr) {
                console.error(`Error fetching workers for ${acc.accountName}:`, wErr);
              }

              // Balance for this wallet
              try {
                const balRes = await apiFetch(`/api/kryptex/balance/${wallet}?coin=${coin}`);
                if (balRes.ok) {
                  const bData = await balRes.json();
                  const t = Number(bData?.total || 0);
                  const c = Number(bData?.confirmed || 0);
                  const u = Number(bData?.unconfirmed || 0);
                  const th = Number(bData?.threshold || 1.0);
                  aggregatedTotal += t;
                  aggregatedConfirmed += c;
                  aggregatedUnconfirmed += u;
                  aggregatedThreshold += th;
                  balanceAccountsBreakdown.push({
                    id: acc.id,
                    accountName: acc.accountName,
                    walletAddress: wallet,
                    total: t,
                    confirmed: c,
                    unconfirmed: u,
                    threshold: th,
                    reached_pct: th > 0 ? (t / th) * 100 : 0
                  });
                }
              } catch (bErr) {
                console.error(`Error fetching balance for ${acc.accountName}:`, bErr);
              }

              // Payouts for this wallet
              try {
                const payoutsRes = await apiFetch(`/api/kryptex/payouts/${wallet}?coin=${coin}`);
                if (payoutsRes.ok) {
                  const payData = await payoutsRes.json();
                  const pPaid = Number(payData?.paid || 0);
                  const pUnpaid = Number(payData?.unpaid || 0);
                  const pWeek = Number(payData?.reward?.week || 0);
                  const pMonth = Number(payData?.reward?.month || 0);
                  aggregatedPaid += pPaid;
                  aggregatedUnpaid += pUnpaid;
                  aggregatedWeekReward += pWeek;
                  aggregatedMonthReward += pMonth;
                  payoutAccountsBreakdown.push({
                    id: acc.id,
                    accountName: acc.accountName,
                    walletAddress: wallet,
                    paid: pPaid,
                    unpaid: pUnpaid,
                    reward: {
                      week: pWeek,
                      month: pMonth
                    }
                  });
                }
              } catch (pErr) {
                console.error(`Error fetching payouts for ${acc.accountName}:`, pErr);
              }
            })
          );

          const finalThreshold = aggregatedThreshold > 0 ? aggregatedThreshold : 1.0;
          setBalance({
            total: aggregatedTotal,
            confirmed: aggregatedConfirmed,
            unconfirmed: aggregatedUnconfirmed,
            threshold: finalThreshold,
            reached_pct: finalThreshold > 0 ? Math.min(100, Number(((aggregatedTotal / finalThreshold) * 100).toFixed(1))) : 0,
            accounts: balanceAccountsBreakdown
          });

          setPayoutStats({
            paid: aggregatedPaid,
            unpaid: aggregatedUnpaid,
            reward: {
              week: aggregatedWeekReward,
              month: aggregatedMonthReward
            },
            accounts: payoutAccountsBreakdown
          });
        } catch (kryptexErr) {
          console.error('Error fetching live Kryptex APIs:', kryptexErr);
        }
      }

      // 3. Merged Fleet Synthesis (Cross-reference Salad instances & unified Kryptex workers)
      const mergedWorkersList: MergedGPUWorker[] = [];

      if (saladLiveInstances.length > 0) {
        const totalPoolHashNum = kryptexLiveWorkers.reduce((acc, kw) => {
          const rawHash = kw.avg_hashrate_30m || kw.avg_hashrate_3h || kw.avg_hashrate_24h || '0';
          return acc + (parseFloat(rawHash) || 0);
        }, 0);
        const kryptexPoolHashTHs = Number((totalPoolHashNum / 1e12).toFixed(1));

        const totalValidSharesPool = kryptexLiveWorkers.reduce((acc, kw) => acc + (kw.valid || 0), 0);
        const totalStaleSharesPool = kryptexLiveWorkers.reduce((acc, kw) => acc + (kw.stale || 0), 0);
        const totalInvalidSharesPool = kryptexLiveWorkers.reduce((acc, kw) => acc + (kw.invalid || 0), 0);

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
            validShares: totalValidSharesPool > 0 ? Math.round(totalValidSharesPool / runningCount) : 0,
            staleShares: totalStaleSharesPool > 0 ? Math.round(totalStaleSharesPool / runningCount) : 0,
            invalidShares: totalInvalidSharesPool > 0 ? Math.round(totalInvalidSharesPool / runningCount) : 0,
            agent: 'Fl4shMiner/1.5.2',
            serverGeo: 'US',
            connectedAt: isRunning ? 'Minando activamente' : isAllocating ? 'En asignación (Allocating)' : 'Inactivo',
            lastShareTimestamp: isRunning ? Date.now() - 30000 : 0,
            hasAlert: isUnderperforming || isAllocating,
            alertType: alertType,
            alertMessage: alertMessage,
            recommendation: recommendation
          });
        });

        // Add any non-Salad standalone Kryptex workers (from other Kryptex accounts or rigs)
        const saladShortIds = new Set(saladLiveInstances.map((si: any, idx: number) => {
          return si.machine_id && si.machine_id.length > 8 ? si.machine_id.slice(0, 8) : si.machineId && si.machineId.length > 8 ? si.machineId.slice(0, 8) : `node-${idx + 1}`;
        }));

        kryptexLiveWorkers.forEach((kw: any, idx: number) => {
          const isMatchedToSalad = Array.from(saladShortIds).some(sId => kw.worker && kw.worker.includes(sId));
          if (!isMatchedToSalad) {
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
              accountName: kw._kryptexAccountName || accounts[0]?.accountName || 'Kryptex Rig',
              kryptexAccountId: kw._kryptexAccountId,
              kryptexAccountName: kw._kryptexAccountName,
              kryptexWallet: kw._kryptexWallet,
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
          }
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
            accountName: kw._kryptexAccountName || accounts[0]?.accountName || 'SaladCloud Cluster',
            kryptexAccountId: kw._kryptexAccountId,
            kryptexAccountName: kw._kryptexAccountName,
            kryptexWallet: kw._kryptexWallet,
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

      // Macro Alerts: Financial Decadence & Massive Fleet Outage
      const totalSaladCostCalc = mergedWorkersList.reduce((acc, w) => acc + (w.hourlySaladCost || 0), 0);
      const totalGrossRevCalc = mergedWorkersList.reduce((acc, w) => acc + (w.isMining ? w.currentHashrateTHs : 0), 0) * BASELINE_USD_PER_THS_HOUR;
      const totalNetProfitCalc = totalGrossRevCalc - totalSaladCostCalc;
      const offlineWorkersCount = mergedWorkersList.filter((w) => !w.isMining || w.saladStatus !== 'running').length;

      if (totalSaladCostCalc > totalNetProfitCalc && totalSaladCostCalc > 0) {
        liveAlerts.unshift({
          id: 'macro-alert-cost-dominance',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'UNDERPERFORMING',
          workerName: 'Alerta Financiera Flota',
          gpuModel: 'Costo Alquiler > Ganancia Neta',
          message: `Decadencia de Rentabilidad: El costo de alquiler ($${totalSaladCostCalc.toFixed(2)}/h) supera la ganancia neta ($${totalNetProfitCalc.toFixed(2)}/h). El margen está comprometido por máquinas inactivas o tarifas elevadas.`,
          severity: 'critical'
        });
      }

      if (offlineWorkersCount > 10 && (offlineWorkersCount / mergedWorkersList.length) > 0.15) {
        liveAlerts.unshift({
          id: 'macro-alert-fleet-offline',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'DISCONNECT',
          workerName: 'Supervisión de Clúster',
          gpuModel: `${offlineWorkersCount} de ${mergedWorkersList.length} GPUs Offline`,
          message: `Decadencia de Flota: ${offlineWorkersCount} trabajadores están desconectados sin enviar shares (${((offlineWorkersCount / mergedWorkersList.length) * 100).toFixed(0)}% de la flota caída). La eficiencia de silicio está en nivel crítico.`,
          severity: 'critical'
        });
      }

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

        // Sincronizar potencia total de flota y cotización viva con el Motor Híbrido
        try {
          MinerxProfitEngine.getInstance().syncFromFleetTelemetry({
            prlPriceUsd: prlRateUSD > 0.05 ? prlRateUSD : undefined,
            totalFleetHashrateThs: totalH
          });
        } catch {}
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

  // Kryptex Multi-Account Handlers
  const handleAddKryptexAccount = (newAcc: Omit<KryptexAccountConfig, 'id' | 'status'>) => {
    const acc: KryptexAccountConfig = {
      ...newAcc,
      id: `kryptex-acc-${Date.now()}`,
      status: 'untested'
    };
    const updated = [...kryptexAccounts, acc];
    setKryptexAccounts(updated);
    if (!kryptexConfig.walletAddress && updated.length === 1) {
      setKryptexConfig({
        walletAddress: acc.walletAddress,
        coin: acc.coin,
        poolUrl: acc.poolUrl,
        status: acc.status
      });
    }
    syncBackendConfig(accounts, kryptexConfig, settings, updated);
    setTimeout(() => refreshTelemetry(false), 300);
  };

  const handleDeleteKryptexAccount = (id: string) => {
    const updated = kryptexAccounts.filter((a) => a.id !== id);
    setKryptexAccounts(updated);
    const firstActive = updated.find(a => a.enabled) || updated[0];
    setKryptexConfig(prev => ({
      ...prev,
      walletAddress: firstActive ? firstActive.walletAddress : '',
      coin: firstActive ? firstActive.coin : 'prl',
      poolUrl: firstActive ? firstActive.poolUrl : 'stratum+tcp://prl.kryptex.network:7048',
      status: firstActive ? firstActive.status : 'untested'
    }));
    syncBackendConfig(accounts, kryptexConfig, settings, updated);
    setTimeout(() => refreshTelemetry(false), 300);
  };

  const handleToggleKryptexAccount = (id: string) => {
    const updated = kryptexAccounts.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a));
    setKryptexAccounts(updated);
    syncBackendConfig(accounts, kryptexConfig, settings, updated);
    setTimeout(() => refreshTelemetry(false), 300);
  };

  const handleUpdateKryptexAccount = (updatedAcc: KryptexAccountConfig) => {
    const updated = kryptexAccounts.map((a) => (a.id === updatedAcc.id ? updatedAcc : a));
    setKryptexAccounts(updated);
    syncBackendConfig(accounts, kryptexConfig, settings, updated);
    setTimeout(() => refreshTelemetry(false), 300);
  };

  const handleTestSingleKryptexAccount = async (acc: KryptexAccountConfig): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await apiFetch(`/api/kryptex/workers/${acc.walletAddress}?coin=${acc.coin || 'prl'}`);
      if (res.ok) {
        const data = await res.json();
        const count = data?.results?.length || 0;
        const updated = kryptexAccounts.map((a) => a.id === acc.id ? { ...a, status: 'connected' as const, lastConnected: 'Conectado' } : a);
        setKryptexAccounts(updated);
        syncBackendConfig(accounts, kryptexConfig, settings, updated);
        return { success: true, message: `Conexión a Kryptex exitosa (${count} workers detectados)` };
      }
      let errorMsg = `Error HTTP ${res.status} al consultar pool de Kryptex`;
      try {
        const errJson = await res.json();
        if (errJson?.message) errorMsg = errJson.message;
      } catch {}
      return { success: false, message: errorMsg };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error de red' };
    }
  };

  // Android & Mobile Picture-in-Picture Mode State
  const [isPiP, setIsPiP] = useState(false);
  useEffect(() => {
    const handlePiP = (e: any) => {
      setIsPiP(!!e.detail?.isPiP);
    };
    window.addEventListener('pipmodechange', handlePiP);
    return () => window.removeEventListener('pipmodechange', handlePiP);
  }, []);

  // Picture-in-Picture Floating Mode (External Android Mobile Screen Widget)
  if (isPiP) {
    const totalTHs = fleetSummary.totalHashrateTHs || 0;
    const netUSD = fleetSummary.hourlyNetProfitUSD || 0;
    const runningCount = workers.filter((w) => w.isMining || w.saladStatus === 'running').length;
    const totalCount = workers.length;

    return (
      <div className="fixed inset-0 bg-[#06080E] text-white flex flex-col justify-between p-3 select-none overflow-hidden border border-emerald-500/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#05DF72] animate-pulse" />
            <span className="font-rajdhani font-black text-xs uppercase tracking-wider text-white">MinerX ⚡ LIVE</span>
          </div>
          <span className="text-[10px] font-mono text-slate-300 bg-white/10 px-2 py-0.5 rounded-full">
            {runningCount}/{totalCount} GPUs
          </span>
        </div>

        <div className="flex items-baseline justify-between my-auto">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-2xl sm:text-3xl font-extrabold text-[#05DF72] leading-none">
              {totalTHs.toFixed(1)}
            </span>
            <span className="text-xs font-mono text-slate-400">TH/s</span>
          </div>
          <div className={`font-mono font-bold text-sm ${netUSD >= 0 ? 'text-[#05DF72]' : 'text-rose-500'}`}>
            {netUSD >= 0 ? '+' : ''}${netUSD.toFixed(3)}/h
          </div>
        </div>

        <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 border-t border-white/10 pt-1">
          <span>Salad: ${(saladBalance?.totalBalanceUSD ?? 0).toFixed(2)}</span>
          <span className="text-emerald-400 font-semibold">{poolInfo.ticker || 'PRL'} Pool</span>
        </div>
      </div>
    );
  }

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

  if (isSessionChecking) {
    return (
      <div className={`min-h-screen flex items-center justify-center font-sans ${themeMode === 'light' ? 'bg-[#EDEFF8]' : 'bg-[#07090F]'}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono text-slate-500">Verificando sesión administrativa...</span>
        </div>
      </div>
    );
  }

  // Si el usuario aún NO ha iniciado sesión, mostrar directamente la pantalla de Login / Registro
  if (!currentUser) {
    return (
      <div className={`min-h-screen font-sans ${themeMode === 'light' ? 'bg-[#EDEFF8]' : 'bg-[#07090F]'}`}>
        {authInfrastructureError && (
          <div role="alert" className="mx-auto max-w-xl px-4 pt-6 text-center text-sm text-amber-700">
            {authInfrastructureError}
          </div>
        )}
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
    <div className={`min-h-screen ${suiteMode === 'admin' ? `minerx-admin-page ${themeMode === 'dark' ? 'is-dark' : 'is-light'}` : ''} font-sans selection:bg-[#05DF72]/20 selection:text-[#05DF72] transition-colors p-0 sm:p-3 md:p-6 lg:p-8 flex justify-center items-start ${
      themeMode === 'light' ? 'bg-[#EDEFF8] text-slate-900' : 'bg-[#07090F] text-slate-100'
    }`}>
      {/* MAIN ELEVATED CARD CONTAINER (Edge-to-edge on mobile, elevated card on desktop) */}
      <div className={`w-full max-w-7xl ${suiteMode === 'admin' ? 'minerx-admin-shell' : ''} flex flex-col rounded-none sm:rounded-[32px] md:rounded-[36px] border-0 sm:border shadow-none sm:shadow-2xl overflow-hidden transition-all ${
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
          suiteMode={suiteMode}
          onToggleSuiteMode={handleToggleSuiteMode}
          onOpenHub={() => {
            if ((window as any).electronAPI?.toggleDesktopWidget) {
              (window as any).electronAPI.toggleDesktopWidget();
            } else {
              window.open('#widget', 'MinerX_HUD', 'width=360,height=520,frame=false,alwaysOnTop=true');
            }
          }}
        />

        {/* Content Area - Generous bottom padding (pb-28) ensures MobileNav never covers content */}
        <main className="minerx-admin-main flex-1 w-full px-3 sm:px-6 md:px-8 pt-3 sm:pt-5 pb-28 md:pb-8 overflow-y-auto">
          {activeTab === 'overview' && (
            <OverviewTab
              summary={fleetSummary}
              workers={workers}
              history={history}
              balance={balance}
              poolInfo={poolInfo}
              payoutStats={payoutStats}
              prlRateUSD={prlRateUSD}
              kryptexAccounts={kryptexAccounts}
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
              isDarkTheme={themeMode === 'dark'}
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
              isDarkTheme={themeMode === 'dark'}
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
              kryptexAccounts={kryptexAccounts}
              onAddKryptexAccount={handleAddKryptexAccount}
              onUpdateKryptexAccount={handleUpdateKryptexAccount}
              onDeleteKryptexAccount={handleDeleteKryptexAccount}
              onToggleKryptexAccount={handleToggleKryptexAccount}
              onTestSingleKryptexAccount={handleTestSingleKryptexAccount}
              settings={settings}
              onUpdateSettings={(st) => {
                const updated = { ...settings, ...st };
                setSettings(updated);
                syncBackendConfig(accounts, kryptexConfig, updated);
              }}
              onTestSaladAccount={handleTestSaladAccount}
              onTestKryptex={handleTestKryptex}
              onTestWebhook={handleTestWebhook}
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertsTab
              alerts={alerts}
              workers={workers}
              onClearAlerts={handleClearAlerts}
              onOpenReallocate={(w) => setReallocatingWorker(w)}
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {/* Admin Control Center Views */}
          {activeTab === 'admin_overview' && (
            <AdminOverview
              onNavigateTab={(tabId) => setActiveTab(tabId)}
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {activeTab === 'admin_engine' && (
            <MiningEngineControlView
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {activeTab === 'admin_referrals' && (
            <ReferralsView
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {activeTab === 'admin_packages' && (
            <PackageBuilderView
              isDarkTheme={themeMode === 'dark'}
              onNavigateToEngine={(_pkgId) => setActiveTab('admin_engine')}
              onNavigateTab={(tabId) => setActiveTab(tabId)}
            />
          )}

          {activeTab === 'admin_orders' && (
            <PackagePaymentsView
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {activeTab === 'admin_withdrawals' && (
            <WithdrawalsView
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {activeTab === 'admin_allocations' && (
            <ContractsAllocationView
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {activeTab === 'admin_workers' && (
            <VirtualWorkersView
              realWorkers={workers}
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {activeTab === 'admin_ledger' && (
            <LedgerView
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {activeTab === 'admin_users' && (
            <UserManagementView
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {activeTab === 'admin_promos' && (
            <PromotionsManagerView
              isDarkTheme={themeMode === 'dark'}
            />
          )}

          {activeTab === 'admin_audit' && (
            <AuditLogsView
              isDarkTheme={themeMode === 'dark'}
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
        isDarkTheme={themeMode === 'dark'}
      />

      {/* Bottom Navigation for Mobile Smartphones */}
      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unresolvedAlertsCount={unresolvedAlertsCount}
        totalGpus={workers.length}
        isDarkTheme={themeMode === 'dark'}
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
        isModalOpen={!!reallocatingWorker}
      />
    </div>
  );
};
export default App;
