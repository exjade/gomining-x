import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Cpu, 
  Zap, 
  DollarSign, 
  ShieldAlert, 
  ArrowUpRight, 
  CheckCircle2, 
  Sliders, 
  Package,
  Server,
  Share2,
  Radio,
  ShoppingCart,
  ArrowDownRight
} from 'lucide-react';
import { MinerxProfitEngine } from '../../services/admin/minerxProfitEngine';
import { HashrateAllocationService } from '../../services/admin/hashrateAllocationService';
import { CommercialPackageService } from '../../services/admin/commercialPackageService';
import { UserManagementService } from '../../services/admin/userManagementService';
import { PackagePaymentsService } from '../../services/admin/packagePaymentsService';
import { hasWithdrawalPermission } from '../../types/withdrawal';
import {
  fetchAdminWithdrawals,
  type AdminWithdrawalSession,
  type AdminWithdrawalsApiClientOptions,
} from '../../services/admin/adminWithdrawalsClient';
import type { ProfitEngineGlobalConfig, AllocationSummary } from '../../types/admin';

interface AdminOverviewProps {
  onNavigateTab: (tabId: string) => void;
  isDarkTheme?: boolean;
  withdrawalSession?: AdminWithdrawalSession | null;
  withdrawalApiOptions?: AdminWithdrawalsApiClientOptions;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  onNavigateTab,
  isDarkTheme = true,
  withdrawalSession = null,
  withdrawalApiOptions,
}) => {
  const engine = MinerxProfitEngine.getInstance();
  const allocationService = HashrateAllocationService.getInstance();
  const packageService = CommercialPackageService.getInstance();
  const userService = UserManagementService.getInstance();
  const paymentsService = PackagePaymentsService.getInstance();

  const [globalConfig, setGlobalConfig] = useState<ProfitEngineGlobalConfig>(engine.getGlobalConfig());
  const [allocation, setAllocation] = useState<AllocationSummary>(allocationService.getAllocationSummary(1200));
  const [usersCount, setUsersCount] = useState<number>(userService.getUsers().length);
  const [packagesCount, setPackagesCount] = useState<number>(packageService.getPackages().length);
  const [paymentsSummary] = useState(paymentsService.getSummary());
  const [pendingWithdrawalsCount, setPendingWithdrawalsCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    if (
      !withdrawalSession?.uid ||
      !withdrawalSession?.idToken ||
      !hasWithdrawalPermission(withdrawalSession.permissions, 'withdrawals.read')
    ) {
      setPendingWithdrawalsCount(0);
      return () => {
        cancelled = true;
      };
    }

    fetchAdminWithdrawals(
      withdrawalSession,
      { tab: 'queue', limit: 1 },
      withdrawalApiOptions,
    )
      .then((res) => {
        if (!cancelled) {
          setPendingWithdrawalsCount(res.kpis.pendingReviewCount);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPendingWithdrawalsCount(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    withdrawalSession?.uid,
    withdrawalSession?.idToken,
    withdrawalSession?.permissions,
    withdrawalApiOptions?.baseUrl,
  ]);

  useEffect(() => {
    setGlobalConfig(engine.getGlobalConfig());
    allocationService.fetchFirestoreContracts().then(() => {
      setAllocation(allocationService.getAllocationSummary(1200));
    }).catch(() => {});
    packageService.fetchFirestorePackages().then((pkgs) => {
      setPackagesCount(pkgs.length);
    }).catch(() => {});
    setUsersCount(userService.getUsers().length);

    const unsubscribe = allocationService.subscribeToFirestoreContracts(() => {
      setAllocation(allocationService.getAllocationSummary(1200));
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Cálculo de producción canónica unificada
  const activeContracts = allocationService.getContracts().filter(c => c.status === 'ACTIVE');
  const totalAllocatedTh = allocation.totalAllocatedTh;
  const baseRate = globalConfig.manualBaseRatePrlPerThsHour;
  const grossHourlyPrl = totalAllocatedTh * baseRate;
  const netHourlyPrl = grossHourlyPrl * (1 + globalConfig.globalVariablePct / 100) * (1 - globalConfig.globalCommissionPct / 100);
  const dailyNetUsd = netHourlyPrl * 24 * (globalConfig.prlManualOverridePrice ?? globalConfig.prlPriceUsd);

  return (
    <div className="minerx-admin-view space-y-6 pb-16">
      {/* 1. TOP EXECUTIVE KPI BANNER */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* KPI 1: Usuarios & Contratos */}
        <div
          className={`admin-card p-4 sm:p-5 admin-radius-card border ${
            isDarkTheme
              ? ' admin-bg-surface admin-border admin-text-primary'
              : ' admin-bg-surface admin-border admin-text-primary'
          }`}
        >
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-semibold'}`}>
            <span className="">Usuarios & Contratos</span>
            <Users className="h-4 w-4 admin-text-success" />
          </div>
          <div className="text-2xl font-semibold font-mono">
            {usersCount} <span className={`text-xs font-normal font-sans ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>usuarios</span>
          </div>
          <div className="text-xs font-mono admin-text-success mt-1 flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="h-3 w-3" />
            <span>{activeContracts.length} contratos activos</span>
          </div>
        </div>

        {/* KPI 2: Hashrate Contratado vs Asignado */}
        <div
          className={`admin-card p-4 sm:p-5 admin-radius-card border ${
            isDarkTheme
              ? ' admin-bg-surface admin-border admin-text-primary'
              : ' admin-bg-surface admin-border admin-text-primary'
          }`}
        >
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-semibold'}`}>
            <span className="">Potencia Asignada</span>
            <Cpu className="h-4 w-4 admin-text-accent" />
          </div>
          <div className={`text-2xl font-semibold font-mono ${isDarkTheme ? ' admin-text-accent' : ' admin-text-accent'}`}>
            {allocation.totalAllocatedTh}{' '}
            <span className={`text-xs font-normal font-sans ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>/ {allocation.totalContractedTh} TH/s</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
            {allocation.utilizationRatePct}% capacidad respaldada
          </div>
        </div>

        {/* KPI 3: Tasa Base R_base */}
        <div
          className={`admin-card p-4 sm:p-5 admin-radius-card border ${
            isDarkTheme
              ? ' admin-bg-surface admin-border admin-text-primary'
              : ' admin-bg-surface admin-border admin-text-primary'
          }`}
        >
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-semibold'}`}>
            <span className="">Tasa R_Base Unificada</span>
            <Zap className="h-4 w-4 admin-text-warning" />
          </div>
          <div className="text-2xl font-semibold font-mono">
            {baseRate.toFixed(4)}{' '}
            <span className={`text-xs font-normal font-sans ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>PRL/TH/h</span>
          </div>
          <div className="text-xs font-mono admin-text-warning mt-1 flex items-center gap-1 font-semibold">
            <span>Kryptex Pool Automática</span>
          </div>
        </div>

        {/* KPI 4: Rendimiento Estimado Diario */}
        <div
          className={`admin-card p-4 sm:p-5 admin-radius-card border ${
            isDarkTheme
              ? ' admin-bg-surface admin-border admin-text-primary'
              : ' admin-bg-surface admin-border admin-text-primary'
          }`}
        >
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-semibold'}`}>
            <span className="">Producción Neta Día</span>
            <DollarSign className="h-4 w-4 admin-text-success" />
          </div>
          <div className="text-2xl font-semibold font-mono admin-text-success">
            ${dailyNetUsd.toFixed(2)}{' '}
            <span className={`text-xs font-normal font-sans ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>USD/día</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
            {(netHourlyPrl * 24).toFixed(2)} PRL/24h neta
          </div>
        </div>
      </div>

      {/* 2. MAIN CENTER: RESUMEN DE TELEMETRÍA DE INFRAESTRUCTURA (ESTILO FLOTA TAB) + ACCIONES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Resumen de Flota y Telemetría Operativa 2D */}
        <div className="lg:col-span-2 space-y-4">
          <div className={`admin-card p-5 admin-radius-card border ${
            isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'} mb-4`}>
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 admin-text-success" />
                <h3 className={`text-xs font-mono font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
                  Supervisión Operativa de la Infraestructura Física
                </h3>
              </div>
              <span className="admin-badge flex items-center gap-1 px-2 py-0.5 admin-radius-control text-xs font-mono font-semibold admin-bg-success admin-text-success border admin-border">
                <span className="h-1.5 w-1.5 rounded-full admin-bg-success" />
                ONLINE
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className={`admin-card p-3 admin-radius-card border ${isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'}`}>
                <span className={`text-xs font-mono block mb-1 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Flota GPU SaladCloud</span>
                <div className={`font-mono font-semibold text-base ${isDarkTheme ? ' admin-text-accent' : ' admin-text-accent'}`}>
                  216 Nodos Activos
                </div>
                <span className={`text-xs font-mono block mt-0.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                  RTX 4090 / 3090 Clusters
                </span>
              </div>

              <div className={`admin-card p-3 admin-radius-card border ${isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'}`}>
                <span className={`text-xs font-mono block mb-1 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Workers Kryptex Pool</span>
                <div className="font-mono font-semibold text-base admin-text-success">
                  1,371 Mineros
                </div>
                <span className={`text-xs font-mono block mt-0.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                  1.36 EH/s Hashrate Global
                </span>
              </div>

              <div className={`admin-card p-3 admin-radius-card border ${isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'}`}>
                <span className={`text-xs font-mono block mb-1 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Eficiencia Térmica</span>
                <div className="font-mono font-semibold text-base admin-text-success">
                  62.4 °C Media
                </div>
                <span className={`text-xs font-mono block mt-0.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                  0 alertas críticas
                </span>
              </div>
            </div>

            {/* Barra de Distribución y Respaldo */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-primary font-semibold'}>Capacidad Contratada vs Respaldo Físico:</span>
                <span className="font-semibold admin-text-success">{allocation.utilizationRatePct}% Asignado</span>
              </div>
              <div className={`w-full rounded-full h-3 overflow-hidden p-0.5 border mb-2 ${isDarkTheme ? ' admin-bg-subtle admin-border' : ' admin-bg-subtle admin-border'}`}>
                <div
                  className="h-full admin-radius-control admin-bg-primary"
                  style={{ width: `${Math.min(100, allocation.utilizationRatePct)}%` }}
                />
              </div>
              <div className={`flex justify-between text-xs font-mono ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>
                <span>0 TH/s</span>
                <span>Asignado: {allocation.totalAllocatedTh} TH/s</span>
                <span>Tope Respaldo: {allocation.totalBackedCapacityTh} TH/s</span>
              </div>
            </div>

            {allocation.isOverallocated && (
              <div className="admin-card mt-3 p-3 admin-radius-card admin-bg-danger border admin-border-danger flex items-center gap-2 admin-text-danger text-xs font-mono font-semibold">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>ALERTA: Potencia sobreasignada por encima del respaldo físico disponible.</span>
              </div>
            )}
          </div>

          {/* Estado de Stratum y Pool */}
          <div className={`admin-card p-4 admin-radius-card border flex flex-wrap items-center justify-between gap-3 text-xs font-mono ${
            isDarkTheme ? ' admin-bg-surface admin-border admin-text-secondary' : ' admin-bg-surface admin-border admin-text-primary'
          }`}>
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 admin-text-success" />
              <span>Pool Kryptex Stratum: <strong className="admin-text-success">prl.kryptex.network:7048</strong></span>
            </div>
            <div className={`flex items-center gap-3 text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
              <span>Latencia: <strong className={isDarkTheme ? 'admin-text-accent' : 'admin-text-accent font-semibold'}>18ms</strong></span>
              <span>Dificultad: <strong className={isDarkTheme ? 'admin-text-primary' : 'admin-text-primary font-semibold'}>Auto (PPS+)</strong></span>
              <span>Moneda: <strong className="admin-text-success font-semibold">PEARL (PRL)</strong></span>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Quick Control Hub (Sin sticker icons) */}
        <div className="flex flex-col gap-4">
          <div
            className={`admin-card p-5 admin-radius-card border flex flex-col justify-between ${
              isDarkTheme
                ? ' admin-bg-surface admin-border admin-text-primary'
                : ' admin-bg-surface admin-border admin-text-primary'
            }`}
          >
            <div>
              <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'} mb-3`}>
                <span className={`text-xs font-mono font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
                  Accesos Rápidos de Control
                </span>
                <span className="text-xs font-mono admin-text-secondary font-semibold">
                  {allocation.availableCapacityTh} TH/s Libre
                </span>
              </div>

              <div className="admin-quick-access space-y-2">
                <button
                  onClick={() => onNavigateTab('admin_engine')}
                  className={`w-full flex items-center justify-between p-3 admin-radius-control border text-xs font-mono font-semibold active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? ' admin-bg-surface admin-border admin-text-primary'
                      : ' admin-bg-surface admin-border admin-text-primary'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 admin-text-success" />
                    <span>Ajustar Variables del Motor</span>
                  </span>
                  <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
                </button>

                <button
                  onClick={() => onNavigateTab('admin_packages')}
                  className={`w-full flex items-center justify-between p-3 admin-radius-control border text-xs font-mono font-semibold active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? ' admin-bg-surface admin-border admin-text-primary'
                      : ' admin-bg-surface admin-border admin-text-primary'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Package className="h-4 w-4 admin-text-accent" />
                    <span>Constructor de Paquetes ({packagesCount})</span>
                  </span>
                  <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
                </button>

                <button
                  onClick={() => onNavigateTab('admin_orders')}
                  className={`w-full flex items-center justify-between p-3 admin-radius-control border text-xs font-mono font-semibold active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? ' admin-bg-surface admin-border admin-text-primary'
                      : ' admin-bg-surface admin-border admin-text-primary'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 admin-text-success" />
                    <span>Pagos de Paquetes (${paymentsSummary.totalVolumeUsd.toFixed(0)})</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {paymentsSummary.pendingCount > 0 && (
                      <span className="admin-badge text-xs px-1.5 py-0.2 admin-radius-control admin-bg-warning admin-text-warning font-mono">
                        {paymentsSummary.pendingCount} pend.
                      </span>
                    )}
                    <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
                  </div>
                </button>

                <button
                  onClick={() => onNavigateTab('admin_withdrawals')}
                  className={`w-full flex items-center justify-between p-3 admin-radius-control border text-xs font-mono font-semibold active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? ' admin-bg-surface admin-border admin-text-primary'
                      : ' admin-bg-surface admin-border admin-text-primary'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ArrowDownRight className="h-4 w-4 admin-text-warning" />
                    <span>Solicitudes de Retiro</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {pendingWithdrawalsCount > 0 && (
                      <span className="admin-badge text-xs px-1.5 py-0.2 admin-radius-control admin-bg-warning admin-text-warning font-mono font-semibold">
                        {pendingWithdrawalsCount} pend.
                      </span>
                    )}
                    <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
                  </div>
                </button>

                <button
                  onClick={() => onNavigateTab('admin_referrals')}
                  className={`w-full flex items-center justify-between p-3 admin-radius-control border text-xs font-mono font-semibold active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? ' admin-bg-surface admin-border admin-text-primary'
                      : ' admin-bg-surface admin-border admin-text-primary'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Share2 className="h-4 w-4 admin-text-warning" />
                    <span>Programa de Referidos</span>
                  </span>
                  <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
                </button>

                <button
                  onClick={() => onNavigateTab('admin_allocations')}
                  className={`w-full flex items-center justify-between p-3 admin-radius-control border text-xs font-mono font-semibold active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? ' admin-bg-surface admin-border admin-text-primary'
                      : ' admin-bg-surface admin-border admin-text-primary'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 admin-text-secondary" />
                    <span>Asignación Centralizada</span>
                  </span>
                  <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
                </button>

                <button
                  onClick={() => onNavigateTab('admin_ledger')}
                  className={`w-full flex items-center justify-between p-3 admin-radius-control border text-xs font-mono font-semibold active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? ' admin-bg-surface admin-border admin-text-primary'
                      : ' admin-bg-surface admin-border admin-text-primary'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 admin-text-success" />
                    <span>Libro Contable & Ledger</span>
                  </span>
                  <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
                </button>
              </div>
            </div>

            <div className={`mt-4 pt-3 border-t ${isDarkTheme ? ' admin-border admin-text-secondary' : ' admin-border admin-text-secondary'} text-xs font-mono flex items-center justify-between`}>
              <span>Profit Engine v2</span>
              <span className="admin-text-success font-semibold">Activo</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
