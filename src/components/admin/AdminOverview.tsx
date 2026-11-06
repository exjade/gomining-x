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
import { ClientWithdrawalsService } from '../../services/admin/clientWithdrawalsService';
import type { ProfitEngineGlobalConfig, AllocationSummary } from '../../types/admin';

interface AdminOverviewProps {
  onNavigateTab: (tabId: string) => void;
  isDarkTheme?: boolean;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  onNavigateTab,
  isDarkTheme = true
}) => {
  const engine = MinerxProfitEngine.getInstance();
  const allocationService = HashrateAllocationService.getInstance();
  const packageService = CommercialPackageService.getInstance();
  const userService = UserManagementService.getInstance();
  const paymentsService = PackagePaymentsService.getInstance();
  const withdrawalsService = ClientWithdrawalsService.getInstance();

  const [globalConfig, setGlobalConfig] = useState<ProfitEngineGlobalConfig>(engine.getGlobalConfig());
  const [allocation, setAllocation] = useState<AllocationSummary>(allocationService.getAllocationSummary(1200));
  const [usersCount, setUsersCount] = useState<number>(userService.getUsers().length);
  const [packagesCount, setPackagesCount] = useState<number>(packageService.getPackages().length);
  const [paymentsSummary] = useState(paymentsService.getSummary());
  const [withdrawalsSummary] = useState(withdrawalsService.getSummary());

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
    <div className="minerx-admin-view space-y-6 animate-in fade-in duration-300 pb-16">
      {/* 1. TOP EXECUTIVE KPI BANNER */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* KPI 1: Usuarios & Contratos */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition-all ${
            isDarkTheme
              ? 'bg-[#0E1320]/80 border-white/[0.08] shadow-lg text-white'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-semibold'}`}>
            <span className="uppercase tracking-wider">Usuarios & Contratos</span>
            <Users className="h-4 w-4 text-[#05DF72]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono">
            {usersCount} <span className={`text-xs font-normal font-sans ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>usuarios</span>
          </div>
          <div className="text-xs font-mono text-emerald-500 mt-1 flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="h-3 w-3" />
            <span>{activeContracts.length} contratos activos</span>
          </div>
        </div>

        {/* KPI 2: Hashrate Contratado vs Asignado */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition-all ${
            isDarkTheme
              ? 'bg-[#0E1320]/80 border-white/[0.08] shadow-lg text-white'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-semibold'}`}>
            <span className="uppercase tracking-wider">Potencia Asignada</span>
            <Cpu className="h-4 w-4 text-cyan-400" />
          </div>
          <div className={`text-2xl sm:text-3xl font-bold font-mono ${isDarkTheme ? 'text-cyan-400' : 'text-cyan-700'}`}>
            {allocation.totalAllocatedTh}{' '}
            <span className={`text-xs font-normal font-sans ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>/ {allocation.totalContractedTh} TH/s</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
            {allocation.utilizationRatePct}% capacidad respaldada
          </div>
        </div>

        {/* KPI 3: Tasa Base R_base */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition-all ${
            isDarkTheme
              ? 'bg-[#0E1320]/80 border-white/[0.08] shadow-lg text-white'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-semibold'}`}>
            <span className="uppercase tracking-wider">Tasa R_Base Unificada</span>
            <Zap className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono">
            {baseRate.toFixed(4)}{' '}
            <span className={`text-xs font-normal font-sans ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>PRL/TH/h</span>
          </div>
          <div className="text-xs font-mono text-amber-500 mt-1 flex items-center gap-1 font-semibold">
            <span>Kryptex Pool Automática</span>
          </div>
        </div>

        {/* KPI 4: Rendimiento Estimado Diario */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition-all ${
            isDarkTheme
              ? 'bg-[#0E1320]/80 border-white/[0.08] shadow-lg text-white'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-semibold'}`}>
            <span className="uppercase tracking-wider">Producción Neta Día</span>
            <DollarSign className="h-4 w-4 text-[#05DF72]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#05DF72]">
            ${dailyNetUsd.toFixed(2)}{' '}
            <span className={`text-xs font-normal font-sans ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>USD/día</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
            {(netHourlyPrl * 24).toFixed(2)} PRL/24h neta
          </div>
        </div>
      </div>

      {/* 2. MAIN CENTER: RESUMEN DE TELEMETRÍA DE INFRAESTRUCTURA (ESTILO FLOTA TAB) + ACCIONES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Resumen de Flota y Telemetría Operativa 2D */}
        <div className="lg:col-span-2 space-y-4">
          <div className={`p-5 rounded-2xl border transition-all ${
            isDarkTheme ? 'bg-[#0A0E17]/90 border-white/[0.08] text-white shadow-xl' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'} mb-4`}>
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-[#05DF72]" />
                <h3 className={`text-xs font-mono font-bold uppercase tracking-wider ${isDarkTheme ? 'text-slate-200' : 'text-slate-900'}`}>
                  Supervisión Operativa de la Infraestructura Física
                </h3>
              </div>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30">
                <span className="h-1.5 w-1.5 rounded-full bg-[#05DF72] animate-pulse" />
                ONLINE
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className={`p-3 rounded-xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                <span className={`text-[10px] font-mono block mb-1 uppercase font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>Flota GPU SaladCloud</span>
                <div className={`font-mono font-bold text-base ${isDarkTheme ? 'text-cyan-400' : 'text-cyan-700'}`}>
                  216 Nodos Activos
                </div>
                <span className={`text-[10px] font-mono block mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  RTX 4090 / 3090 Clusters
                </span>
              </div>

              <div className={`p-3 rounded-xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                <span className={`text-[10px] font-mono block mb-1 uppercase font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>Workers Kryptex Pool</span>
                <div className="font-mono font-bold text-base text-[#05DF72]">
                  1,371 Mineros
                </div>
                <span className={`text-[10px] font-mono block mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  1.36 EH/s Hashrate Global
                </span>
              </div>

              <div className={`p-3 rounded-xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                <span className={`text-[10px] font-mono block mb-1 uppercase font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>Eficiencia Térmica</span>
                <div className="font-mono font-bold text-base text-emerald-500">
                  62.4 °C Media
                </div>
                <span className={`text-[10px] font-mono block mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                  0 alertas críticas
                </span>
              </div>
            </div>

            {/* Barra de Distribución y Respaldo */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-700 font-semibold'}>Capacidad Contratada vs Respaldo Físico:</span>
                <span className="font-bold text-[#05DF72]">{allocation.utilizationRatePct}% Asignado</span>
              </div>
              <div className={`w-full rounded-full h-3 overflow-hidden p-0.5 border mb-2 ${isDarkTheme ? 'bg-slate-800/40 border-white/5' : 'bg-slate-200 border-slate-300'}`}>
                <div
                  className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-emerald-500 to-cyan-400 shadow-sm"
                  style={{ width: `${Math.min(100, allocation.utilizationRatePct)}%` }}
                />
              </div>
              <div className={`flex justify-between text-[11px] font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                <span>0 TH/s</span>
                <span>Asignado: {allocation.totalAllocatedTh} TH/s</span>
                <span>Tope Respaldo: {allocation.totalBackedCapacityTh} TH/s</span>
              </div>
            </div>

            {allocation.isOverallocated && (
              <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-500 text-xs font-mono font-bold">
                <ShieldAlert className="h-4 w-4 shrink-0 animate-pulse" />
                <span>ALERTA: Potencia sobreasignada por encima del respaldo físico disponible.</span>
              </div>
            )}
          </div>

          {/* Estado de Stratum y Pool */}
          <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs font-mono ${
            isDarkTheme ? 'bg-[#0A0E17]/90 border-white/[0.08] text-slate-300' : 'bg-white border-slate-200 text-slate-800 shadow-sm'
          }`}>
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-[#05DF72] animate-pulse" />
              <span>Pool Kryptex Stratum: <strong className="text-[#05DF72]">prl.kryptex.network:7048</strong></span>
            </div>
            <div className={`flex items-center gap-3 text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              <span>Latencia: <strong className={isDarkTheme ? 'text-cyan-400' : 'text-cyan-700 font-bold'}>18ms</strong></span>
              <span>Dificultad: <strong className={isDarkTheme ? 'text-white' : 'text-slate-900 font-bold'}>Auto (PPS+)</strong></span>
              <span>Moneda: <strong className="text-emerald-500 font-bold">PEARL (PRL)</strong></span>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Quick Control Hub (Sin sticker icons) */}
        <div className="flex flex-col gap-4">
          <div
            className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
              isDarkTheme
                ? 'bg-[#0E1320]/80 border-white/[0.08] text-white shadow-lg'
                : 'bg-white border-slate-200 text-slate-900 shadow-sm'
            }`}
          >
            <div>
              <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'} mb-3`}>
                <span className={`text-xs font-mono font-bold tracking-wider uppercase ${isDarkTheme ? 'text-slate-400' : 'text-slate-700'}`}>
                  Accesos Rápidos de Control
                </span>
                <span className="text-[10px] font-mono text-[#05DF72] font-bold">
                  {allocation.availableCapacityTh} TH/s Libre
                </span>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => onNavigateTab('admin_engine')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-mono font-bold transition-all active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? 'bg-white/[0.03] hover:bg-[#05DF72]/10 border-white/10 hover:border-[#05DF72]/40 text-white'
                      : 'bg-slate-50 hover:bg-emerald-50 border-slate-200 hover:border-emerald-300 text-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-[#05DF72]" />
                    <span>Ajustar Variables del Motor</span>
                  </span>
                  <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
                </button>

                <button
                  onClick={() => onNavigateTab('admin_packages')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-mono font-bold transition-all active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? 'bg-white/[0.03] hover:bg-cyan-500/10 border-white/10 hover:border-cyan-500/40 text-white'
                      : 'bg-slate-50 hover:bg-cyan-50 border-slate-200 hover:border-cyan-300 text-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-cyan-500" />
                    <span>Constructor de Paquetes ({packagesCount})</span>
                  </span>
                  <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
                </button>

                <button
                  onClick={() => onNavigateTab('admin_orders')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-mono font-bold transition-all active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? 'bg-white/[0.03] hover:bg-emerald-500/10 border-white/10 hover:border-emerald-500/40 text-white'
                      : 'bg-slate-50 hover:bg-emerald-50 border-slate-200 hover:border-emerald-300 text-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-[#05DF72]" />
                    <span>Pagos de Paquetes (${paymentsSummary.totalVolumeUsd.toFixed(0)})</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {paymentsSummary.pendingCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-400 font-mono">
                        {paymentsSummary.pendingCount} pend.
                      </span>
                    )}
                    <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
                  </div>
                </button>

                <button
                  onClick={() => onNavigateTab('admin_withdrawals')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-mono font-bold transition-all active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? 'bg-white/[0.03] hover:bg-amber-500/10 border-white/10 hover:border-amber-500/40 text-white'
                      : 'bg-slate-50 hover:bg-amber-50 border-slate-200 hover:border-amber-300 text-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ArrowDownRight className="h-4 w-4 text-amber-500" />
                    <span>Solicitudes de Retiro</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {withdrawalsSummary.pendingCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-500 font-mono font-bold animate-pulse">
                        {withdrawalsSummary.pendingCount} pend.
                      </span>
                    )}
                    <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
                  </div>
                </button>

                <button
                  onClick={() => onNavigateTab('admin_referrals')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-mono font-bold transition-all active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? 'bg-white/[0.03] hover:bg-amber-500/10 border-white/10 hover:border-amber-500/40 text-white'
                      : 'bg-slate-50 hover:bg-amber-50 border-slate-200 hover:border-amber-300 text-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-amber-500" />
                    <span>Programa de Referidos</span>
                  </span>
                  <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
                </button>

                <button
                  onClick={() => onNavigateTab('admin_allocations')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-mono font-bold transition-all active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? 'bg-white/[0.03] hover:bg-white/10 border-white/10 text-white'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-[#F59E0B]" />
                    <span>Asignación Centralizada</span>
                  </span>
                  <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
                </button>

                <button
                  onClick={() => onNavigateTab('admin_ledger')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-mono font-bold transition-all active:scale-[0.98] cursor-pointer ${
                    isDarkTheme
                      ? 'bg-white/[0.03] hover:bg-emerald-500/10 border-white/10 hover:border-emerald-500/40 text-white'
                      : 'bg-slate-50 hover:bg-emerald-50 border-slate-200 hover:border-emerald-300 text-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                    <span>Libro Contable & Ledger</span>
                  </span>
                  <ArrowUpRight className={`h-3.5 w-3.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
                </button>
              </div>
            </div>

            <div className={`mt-4 pt-3 border-t ${isDarkTheme ? 'border-white/5 text-slate-400' : 'border-slate-100 text-slate-600'} text-[11px] font-mono flex items-center justify-between`}>
              <span>Profit Engine v2</span>
              <span className="text-emerald-500 font-bold">Activo</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
