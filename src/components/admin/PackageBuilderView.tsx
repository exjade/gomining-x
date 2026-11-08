import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit3, 
  Cpu, 
  X,
  Zap,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  UploadCloud,
  Globe,
  Users,
  Search,
  ShoppingCart,
  Sliders,
  Sparkles,
  Calendar
} from 'lucide-react';
import { CommercialPackageService } from '../../services/admin/commercialPackageService';
import { HashrateAllocationService } from '../../services/admin/hashrateAllocationService';
import { MinerxProfitEngine } from '../../services/admin/minerxProfitEngine';
import { StorefrontControlService, type StorefrontSectionsConfig } from '../../services/admin/storefrontControlService';
import type { CommercialPackage, MiningContract } from '../../types/admin';

interface PackageBuilderViewProps {
  isDarkTheme?: boolean;
  onNavigateToEngine?: (packageId?: string) => void;
  onNavigateTab?: (tabId: string) => void;
}

export const PackageBuilderView: React.FC<PackageBuilderViewProps> = ({
  isDarkTheme = true,
  onNavigateToEngine,
  onNavigateTab
}) => {
  const packageService = CommercialPackageService.getInstance();
  const allocationService = HashrateAllocationService.getInstance();
  const profitEngine = MinerxProfitEngine.getInstance();
  const storefrontService = StorefrontControlService.getInstance();

  const [packages, setPackages] = useState<CommercialPackage[]>(packageService.getPackages());
  const [contracts, setContracts] = useState<MiningContract[]>(allocationService.getContracts());
  const [storefrontConfig, setStorefrontConfig] = useState<StorefrontSectionsConfig>(storefrontService.getConfig());
  const [activeViewSubTab, setActiveViewSubTab] = useState<'catalog' | 'purchases' | 'storefront_controls'>('catalog');
  const [purchasesSearchTerm, setPurchasesSearchTerm] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingPkg, setEditingPkg] = useState<Partial<CommercialPackage> | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isUpdatingSection, setIsUpdatingSection] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Load from Cloud Firestore on mount and subscribe to live changes
  useEffect(() => {
    setIsSyncing(true);
    packageService.fetchFirestorePackages()
      .then((pkgs) => {
        setPackages(pkgs);
        setIsSyncing(false);
      })
      .catch(() => {
        setIsSyncing(false);
      });

    allocationService.fetchFirestoreContracts()
      .then((ctrs) => {
        setContracts(ctrs);
      })
      .catch(() => {});

    storefrontService.fetchFirestoreConfig()
      .then(setStorefrontConfig)
      .catch(() => {});

    const unsubPackages = packageService.subscribeToFirestorePackages((pkgs) => {
      setPackages(pkgs);
    });

    const unsubContracts = allocationService.subscribeToFirestoreContracts((ctrs) => {
      setContracts(ctrs);
    });

    const unsubStorefront = storefrontService.subscribeToFirestoreConfig((cfg) => {
      setStorefrontConfig(cfg);
    });

    return () => {
      unsubPackages();
      unsubContracts();
      unsubStorefront();
    };
  }, []);

  const handleToggleStorefrontSection = async (section: keyof Omit<StorefrontSectionsConfig, 'updatedAt' | 'updatedBy'>) => {
    setIsUpdatingSection(true);
    const nextVal = !storefrontConfig[section];
    try {
      const updated = await storefrontService.updateSectionToggle(section, nextVal);
      setStorefrontConfig(updated);
      const labels: Record<string, string> = {
        showPresale: 'Preventa',
        showLaunch: 'Lanzamiento',
        showMonthly: 'Mensual',
        showCustom: 'Personalizado'
      };
      setSyncFeedback(`Sección "${labels[section] || section}" ${nextVal ? 'habilitada' : 'oculta/deshabilitada'} en la app del cliente.`);
    } catch {
      setSyncFeedback('Error al actualizar visibilidad de sección.');
    } finally {
      setIsUpdatingSection(false);
      setTimeout(() => setSyncFeedback(null), 3000);
    }
  };

  const handleSyncFirestore = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const [remote, remoteContracts] = await Promise.all([
        packageService.fetchFirestorePackages(),
        allocationService.fetchFirestoreContracts()
      ]);
      setPackages(remote);
      setContracts(remoteContracts);
      setSyncFeedback(`Sincronizado: ${remote.length} paquetes y ${remoteContracts.length} contratos/mineros en Cloud Firestore.`);
    } catch {
      setSyncFeedback('Error al sincronizar con Cloud Firestore.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 3500);
    }
  };

  const handleSeedDefaults = async () => {
    setSyncFeedback('Siembra legacy inhabilitada por seguridad (SCRUM-211). Use el script CLI seguro con --apply.');
    setTimeout(() => setSyncFeedback(null), 4000);
  };

  const handleTogglePublish = (id: string) => {
    packageService.togglePublish(id);
    setPackages(packageService.getPackages());
  };

  // Modal de Simulación de Motor Híbrido
  const [simulationPkg, setSimulationPkg] = useState<CommercialPackage | null>(null);
  const [simHours, setSimHours] = useState<number>(24);
  const [modalSimVarPct, setModalSimVarPct] = useState<number>(0);
  const [modalSimCommPct, setModalSimCommPct] = useState<number>(2);

  const globalConfig = profitEngine.getGlobalConfig();
  const effectivePrlPrice = globalConfig.prlManualOverridePrice ?? globalConfig.prlPriceUsd;

  const [formData, setFormData] = useState({
    name: '',
    powerTh: 48,
    priceUsdt: 561.99,
    durationDays: 365,
    variablePct: 0.0,
    commissionPct: 2.0,
    description: ''
  });

  const handleOpenCreate = () => {
    setEditingPkg(null);
    setFormData({
      name: '',
      powerTh: 48,
      priceUsdt: 561.99,
      durationDays: 365,
      variablePct: 0.0,
      commissionPct: 2.0,
      description: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (pkg: CommercialPackage) => {
    setEditingPkg(pkg);
    setFormData({
      name: pkg.name,
      powerTh: pkg.powerTh,
      priceUsdt: pkg.priceUsdt,
      durationDays: pkg.durationDays,
      variablePct: pkg.variablePct,
      commissionPct: pkg.commissionPct,
      description: pkg.description || ''
    });
    setIsModalOpen(true);
  };

  const handleOpenSimulation = (pkg: CommercialPackage) => {
    setSimulationPkg(pkg);
    setModalSimVarPct(pkg.variablePct);
    setModalSimCommPct(pkg.commissionPct);
    setSimHours(24);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingPkg && editingPkg.id) {
      packageService.savePackage({
        id: editingPkg.id,
        name: formData.name,
        powerTh: formData.powerTh,
        priceUsdt: formData.priceUsdt,
        durationDays: formData.durationDays,
        variablePct: formData.variablePct,
        commissionPct: formData.commissionPct,
        description: formData.description,
        status: editingPkg.status || 'ACTIVE'
      });
    } else {
      packageService.savePackage({
        name: formData.name,
        powerTh: formData.powerTh,
        priceUsdt: formData.priceUsdt,
        durationDays: formData.durationDays,
        variablePct: formData.variablePct,
        commissionPct: formData.commissionPct,
        description: formData.description,
        status: 'ACTIVE'
      });
    }

    setPackages(packageService.getPackages());
    setIsModalOpen(false);
  };

  const handleToggleArchive = (id: string) => {
    packageService.toggleArchive(id);
    setPackages(packageService.getPackages());
  };

  // Cálculo en vivo para el formulario de creación/edición
  const formBaseRate = globalConfig.manualBaseRatePrlPerThsHour;
  const formDailyBasePrl = formData.powerTh * formBaseRate * 24;
  const formDailyAdjPrl = formDailyBasePrl * (1 + formData.variablePct / 100);
  const formDailyNetPrl = formDailyAdjPrl * (1 - formData.commissionPct / 100);
  const formDailyUsd = formDailyNetPrl * effectivePrlPrice;
  const formAnnualUsd = formDailyUsd * 365;
  const formAnnualRoi = formData.priceUsdt > 0 ? ((formAnnualUsd - formData.priceUsdt) / formData.priceUsdt) * 100 : 0;

  return (
    <div className="minerx-admin-view space-y-6 animate-in fade-in duration-300 pb-12">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Constructor de Paquetes y Máquinas Mineras
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30">
              Enlazado a Motor Híbrido
            </span>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Gestión comercial de hardware, TH/s, precios USDT, variables de rendimiento y simulación en tiempo real.
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-[11px] font-mono text-cyan-400">
            <Globe className="h-3 w-3" />
            <span>Colección Cloud Firestore: <code className="text-[#05DF72]">/commercial_packages</code> (consumido en vivo por GoMining)</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSyncFirestore}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
              isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
            title="Sincronizar paquetes en vivo con Cloud Firestore"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-[#05DF72]' : 'text-slate-400'}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Firestore'}</span>
          </button>

          <button
            onClick={handleSeedDefaults}
            disabled={true}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-mono font-bold transition-all cursor-not-allowed opacity-50 ${
              isDarkTheme ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' : 'bg-cyan-50 border-cyan-200 text-cyan-700'
            }`}
            title="Siembra legacy inhabilitada por seguridad (SCRUM-211). Use el script CLI seguro de siembra con --apply."
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span>Sembrar Paquetes (CLI)</span>
          </button>

          {onNavigateToEngine && (
            <button
              onClick={() => onNavigateToEngine()}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
                isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Zap className="h-3.5 w-3.5 text-[#05DF72]" />
              <span>Consola del Motor</span>
            </button>
          )}

          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#05DF72] text-slate-950 font-mono text-xs font-bold hover:bg-[#04C965] active:scale-[0.97] transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            <Plus className="h-4 w-4" />
            Crear Nuevo Paquete
          </button>
        </div>
      </div>

      {/* SYNC FEEDBACK BANNER */}
      {syncFeedback && (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-emerald-400 font-mono text-xs animate-in fade-in">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* EXECUTIVE SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className={`p-4 rounded-2xl border ${isDarkTheme ? 'bg-[#0E1320]/80 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'}`}>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span className="uppercase">Paquetes Totales</span>
            <Cpu className="h-3.5 w-3.5 text-[#05DF72]" />
          </div>
          <div className="text-2xl font-bold font-mono">{packages.length}</div>
          <div className="text-[10px] font-mono text-[#05DF72] mt-0.5">
            {packages.filter(p => p.status === 'ACTIVE' && p.isPublished !== false).length} activos en tienda
          </div>
        </div>

        <div className={`p-4 rounded-2xl border ${isDarkTheme ? 'bg-[#0E1320]/80 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'}`}>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span className="uppercase">Mineros Vendidos</span>
            <Users className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-400">{contracts.length}</div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
            adquiridos en GoMining
          </div>
        </div>

        <div className={`p-4 rounded-2xl border ${isDarkTheme ? 'bg-[#0E1320]/80 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'}`}>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span className="uppercase">Potencia Vendida</span>
            <Zap className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {contracts.reduce((sum, c) => sum + (c.contractedTh || 0), 0)} <span className="text-xs font-normal">TH/s</span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
            {contracts.reduce((sum, c) => sum + (c.allocatedTh || 0), 0)} TH/s asignados
          </div>
        </div>

        <div className={`p-4 rounded-2xl border ${isDarkTheme ? 'bg-[#0E1320]/80 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'}`}>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span className="uppercase">Volumen Cobrado</span>
            <ShoppingCart className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            ${contracts.reduce((sum, c) => sum + (c.pricePaidUsdt || 0), 0).toLocaleString()} <span className="text-xs font-normal">USDT</span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
            recaudado en ventas
          </div>
        </div>
      </div>

      {/* VIEW SUBTAB TOGGLE */}
      <div className={`flex items-center gap-2 p-1 rounded-2xl border w-fit ${
        isDarkTheme ? 'bg-white/[0.03] border-white/10' : 'bg-slate-100 border-slate-200'
      }`}>
        <button
          type="button"
          onClick={() => setActiveViewSubTab('catalog')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
            activeViewSubTab === 'catalog'
              ? isDarkTheme ? 'bg-white text-slate-950 shadow-sm' : 'bg-slate-900 text-white shadow-sm'
              : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Cpu className="h-3.5 w-3.5" />
          <span>Catálogo de Paquetes ({packages.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveViewSubTab('purchases')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
            activeViewSubTab === 'purchases'
              ? isDarkTheme ? 'bg-white text-slate-950 shadow-sm' : 'bg-slate-900 text-white shadow-sm'
              : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Mineros Adquiridos por Clientes ({contracts.length})</span>
          {contracts.length > 0 && (
            <span className="h-2 w-2 rounded-full bg-[#05DF72] animate-pulse"></span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveViewSubTab('storefront_controls')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
            activeViewSubTab === 'storefront_controls'
              ? isDarkTheme ? 'bg-white text-slate-950 shadow-sm' : 'bg-slate-900 text-white shadow-sm'
              : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sliders className="h-3.5 w-3.5 text-amber-400" />
          <span>Control de Secciones de Tienda</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
            Live
          </span>
        </button>
      </div>

      {activeViewSubTab === 'catalog' && (
        /* PACKAGES GRID */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {packages.map((pkg) => {
            const isArchived = pkg.status === 'ARCHIVED';
            
            // Cálculo de rendimiento para cada paquete usando la tasa canónica
            const basePrl = pkg.powerTh * formBaseRate * 24;
            const netDailyPrl = basePrl * (1 + pkg.variablePct / 100) * (1 - pkg.commissionPct / 100);
            const netDailyUsd = netDailyPrl * effectivePrlPrice;
            const pkgAnnualRoi = pkg.priceUsdt > 0 ? (((netDailyUsd * 365) - pkg.priceUsdt) / pkg.priceUsdt) * 100 : 0;

            return (
              <div
                key={pkg.id}
                className={`p-6 rounded-3xl border flex flex-col justify-between transition-all ${
                  isArchived
                    ? 'opacity-60 bg-slate-900/40 border-white/5'
                    : isDarkTheme
                    ? 'bg-[#0E1320]/80 border-white/[0.08] backdrop-blur-xl text-white shadow-lg'
                    : 'bg-white border-slate-200 text-slate-900 shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#05DF72]">
                      <Cpu className="h-4 w-4" />
                      {pkg.powerTh} TH/s
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        pkg.isPublished !== false && !isArchived
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                      }`}>
                        {pkg.isPublished !== false && !isArchived ? 'En GoMining' : 'Oculto'}
                      </span>
                      <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                        isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700 font-semibold'
                      }`}>
                        v{pkg.version}
                      </span>
                      <span className={`h-2 w-2 rounded-full ${isArchived ? 'bg-amber-500' : 'bg-[#05DF72]'}`} />
                    </div>
                  </div>

                  <h3 className={`text-lg font-bold font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{pkg.name}</h3>
                  <p className={`text-xs font-mono mt-1 line-clamp-2 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                    {pkg.description || 'Contrato de potencia garantizada en PearlHash.'}
                  </p>

                  <div className={`my-4 p-4 rounded-2xl border space-y-2 font-mono text-xs ${
                    isDarkTheme ? 'bg-white/[0.03] border-white/5' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Precio Comercial:</span>
                      <span className="font-bold text-[#05DF72] text-sm">${pkg.priceUsdt} USDT</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Rendimiento Estimado:</span>
                      <span className="font-bold text-cyan-400">
                        {netDailyPrl.toFixed(4)} PRL/d <span className="text-[10px] text-amber-400">($ {netDailyUsd.toFixed(2)}/d)</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Variable / Comisión:</span>
                      <span className="font-semibold text-purple-400">
                        {pkg.variablePct >= 0 ? `+${pkg.variablePct}%` : `${pkg.variablePct}%`} var / -{pkg.commissionPct}% com
                      </span>
                    </div>
                    <div className={`flex justify-between items-center pt-1 border-t ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>
                      <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>ROI Anual Proyectado:</span>
                      <span className={`font-bold ${pkgAnnualRoi >= 0 ? 'text-[#05DF72]' : 'text-rose-400'}`}>
                        {pkgAnnualRoi >= 0 ? `+${pkgAnnualRoi.toFixed(1)}%` : `${pkgAnnualRoi.toFixed(1)}%`} / año
                      </span>
                    </div>
                  </div>
                </div>

                <div className={`pt-3 border-t space-y-2 ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>
                  {/* BOTÓN PRIMARIO: SIMULAR EN MOTOR HÍBRIDO */}
                  <button
                    type="button"
                    onClick={() => handleOpenSimulation(pkg)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-mono font-bold transition-all active:scale-[0.98] cursor-pointer"
                    title="Abrir Simulador del Motor Híbrido con los parámetros de este paquete"
                  >
                    <Zap className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Simular en Motor</span>
                  </button>

                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleTogglePublish(pkg.id)}
                      title={pkg.isPublished !== false ? 'Ocultar de la app GoMining' : 'Publicar a la app GoMining'}
                      className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-mono font-bold transition-all active:scale-[0.97] cursor-pointer flex items-center gap-1 ${
                        pkg.isPublished !== false && !isArchived
                          ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                          : 'border-slate-500/30 text-slate-400 hover:bg-slate-500/10'
                      }`}
                    >
                      <Globe className="h-3 w-3" />
                      <span>{pkg.isPublished !== false && !isArchived ? 'En Tienda' : 'Oculto'}</span>
                    </button>

                    <button
                      onClick={() => handleToggleArchive(pkg.id)}
                      className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
                        isArchived
                          ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                          : isDarkTheme
                          ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                          : 'border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {isArchived ? 'Reactivar' : 'Archivar'}
                    </button>

                    <button
                      onClick={() => handleOpenEdit(pkg)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
                        isDarkTheme
                          ? 'bg-white/[0.05] hover:bg-[#05DF72]/20 hover:text-[#05DF72] border-white/10 text-slate-200'
                          : 'bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border-slate-300 text-slate-800'
                      }`}
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>Editar</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeViewSubTab === 'purchases' && (
        /* CLIENT PURCHASED MINERS TABLE (Real-time synchronization from GoMining client app) */
        <div className={`p-6 rounded-3xl border transition-all space-y-4 ${
          isDarkTheme ? 'bg-[#0E1320]/80 border-white/[0.08] text-white shadow-xl' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold font-sans flex items-center gap-2">
                <span>Mineros Adquiridos por Clientes</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30">
                  En Vivo Cloud Firestore
                </span>
              </h3>
              <p className={`text-xs font-mono mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                Registro administrativo central de cada máquina minera adquirida desde la app de clientes (GoMining).
              </p>
            </div>

            <div className="relative min-w-[240px]">
              <Search className={`absolute left-3 top-2.5 h-3.5 w-3.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
              <input
                type="text"
                placeholder="Buscar por usuario, ID o paquete..."
                value={purchasesSearchTerm}
                onChange={(e) => setPurchasesSearchTerm(e.target.value)}
                className={`w-full pl-9 pr-3 py-1.5 rounded-xl text-xs font-mono border focus:outline-none focus:border-[#05DF72] ${
                  isDarkTheme ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className={`border-b text-[11px] ${
                  isDarkTheme ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-700 font-bold'
                }`}>
                  <th className="py-2.5 px-3">MINERO / USUARIO</th>
                  <th className="py-2.5 px-3">PAQUETE ASOCIADO</th>
                  <th className="py-2.5 px-3">POTENCIA</th>
                  <th className="py-2.5 px-3">IMPORTE</th>
                  <th className="py-2.5 px-3">ESTADO</th>
                  <th className="py-2.5 px-3">FECHA ACTIVACIÓN</th>
                  <th className="py-2.5 px-3 text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkTheme ? 'divide-white/5' : 'divide-slate-100'}`}>
                {contracts
                  .filter((c) => {
                    const q = purchasesSearchTerm.toLowerCase();
                    return (
                      c.id.toLowerCase().includes(q) ||
                      c.userEmail.toLowerCase().includes(q) ||
                      c.packageName.toLowerCase().includes(q)
                    );
                  })
                  .map((c) => (
                    <tr key={c.id} className={`transition-colors ${isDarkTheme ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'}`}>
                      <td className="py-3 px-3">
                        <div className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{c.id}</div>
                        <div className={`text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{c.userEmail}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-cyan-400">{c.packageName}</span>
                        <div className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>ID: {c.packageId}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-[#05DF72]">{c.contractedTh} TH/s</span>
                        <div className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{c.allocatedTh} TH asignados</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold">${c.pricePaidUsdt} USDT</span>
                        <div className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{c.workerId || 'Worker Auto'}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          c.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : c.status === 'PARTIALLY_ALLOCATED'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-400">
                        {c.activatedAt ? new Date(c.activatedAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Reciente'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onNavigateTab && (
                            <button
                              type="button"
                              onClick={() => onNavigateTab('admin_allocations')}
                              className="px-2 py-1 rounded-lg border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 text-[11px] font-bold transition-all cursor-pointer"
                              title="Gestionar potencia en Asignación Centralizada"
                            >
                              Potencia
                            </button>
                          )}
                          {onNavigateTab && (
                            <button
                              type="button"
                              onClick={() => onNavigateTab('admin_orders')}
                              className="px-2 py-1 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-[11px] font-bold transition-all cursor-pointer"
                              title="Ver pago y liquidación de este paquete"
                            >
                              Pago
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeViewSubTab === 'storefront_controls' && (
        <div className={`p-6 rounded-3xl border transition-all space-y-6 ${
          isDarkTheme ? 'bg-[#0E1320]/80 border-white/[0.08] text-white shadow-xl' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}>
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
            <div>
              <h3 className="text-lg font-bold font-sans flex items-center gap-2">
                <span>Control de Secciones de Tienda ("Crear un minero")</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30">
                  Cloud Firestore Live
                </span>
              </h3>
              <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                Activa o desactiva las secciones de compra en la aplicación de clientes GoMining mediante renderizado condicional.
              </p>
            </div>
            {storefrontConfig.updatedAt && (
              <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <span>Último cambio:</span>
                <span className="font-semibold text-white">
                  {new Date(storefrontConfig.updatedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            )}
          </div>

          {/* Info Banner */}
          <div className={`p-4 rounded-2xl border text-xs font-mono flex items-start gap-3 ${
            isDarkTheme ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200' : 'bg-cyan-50 border-cyan-200 text-cyan-900'
          }`}>
            <Sliders className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-bold text-cyan-300">
                Sincronización Inmediata con la App del Cliente (GoMining)
              </p>
              <p className={`text-[11px] leading-relaxed ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                Cada interruptor modifica en tiempo real la configuración en Cloud Firestore (<code className="px-1 py-0.5 rounded bg-black/30 font-mono text-cyan-300">/admin_settings/storefront_sections</code>). Al apagar una sección (por ejemplo, la <strong>Preventa</strong> una vez agotadas las 30 unidades), el diálogo "Crear un minero" del cliente oculta instantáneamente esa pestaña y salta a la siguiente opción activa sin alterar el diseño visual original ni requerir despliegues de código.
              </p>
            </div>
          </div>

          {/* Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. PREVENTA */}
            <div className={`p-5 rounded-2xl border transition-all ${
              storefrontConfig.showPresale
                ? isDarkTheme ? 'bg-amber-500/5 border-amber-500/30' : 'bg-amber-50/50 border-amber-200'
                : isDarkTheme ? 'bg-slate-900/40 border-slate-800 opacity-70' : 'bg-slate-100/50 border-slate-200 opacity-70'
            }`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl border ${
                    storefrontConfig.showPresale
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : 'bg-slate-800 text-slate-500 border-slate-700'
                  }`}>
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">Pestaña: Preventa (30 unidades c/u)</h4>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-semibold">
                      Preventa Limitada
                    </span>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                  storefrontConfig.showPresale
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {storefrontConfig.showPresale ? 'ACTIVO EN CLIENTE' : 'OCULTO'}
                </span>
              </div>

              <p className="text-xs font-mono text-slate-400 mb-4 leading-relaxed">
                4 niveles exclusivos con cupo limitado de 30 unidades cada uno (1.46 TH a 42.44 TH). Al terminar la preventa, desactiva esta opción para removerla de la vista de compra.
              </p>

              <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">Visibilidad en Diálogo:</span>
                <button
                  type="button"
                  disabled={isUpdatingSection}
                  onClick={() => handleToggleStorefrontSection('showPresale')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    storefrontConfig.showPresale
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${storefrontConfig.showPresale ? 'bg-emerald-200 animate-pulse' : 'bg-slate-500'}`} />
                  <span>{storefrontConfig.showPresale ? 'Habilitado (Mostrar)' : 'Deshabilitado (Ocultar)'}</span>
                </button>
              </div>
            </div>

            {/* 2. LANZAMIENTO */}
            <div className={`p-5 rounded-2xl border transition-all ${
              storefrontConfig.showLaunch
                ? isDarkTheme ? 'bg-sky-500/5 border-sky-500/30' : 'bg-sky-50/50 border-sky-200'
                : isDarkTheme ? 'bg-slate-900/40 border-slate-800 opacity-70' : 'bg-slate-100/50 border-slate-200 opacity-70'
            }`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl border ${
                    storefrontConfig.showLaunch
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                      : 'bg-slate-800 text-slate-500 border-slate-700'
                  }`}>
                    <Cpu className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">Pestaña: Lanzamiento (16 niveles)</h4>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-semibold">
                      Pago Único (One-time)
                    </span>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                  storefrontConfig.showLaunch
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {storefrontConfig.showLaunch ? 'ACTIVO EN CLIENTE' : 'OCULTO'}
                </span>
              </div>

              <p className="text-xs font-mono text-slate-400 mb-4 leading-relaxed">
                Catálogo regular con 16 niveles de máquinas estándar desde 42.44 TH ($499.99 USD) hasta 5,000 TH respaldadas de por vida.
              </p>

              <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">Visibilidad en Diálogo:</span>
                <button
                  type="button"
                  disabled={isUpdatingSection}
                  onClick={() => handleToggleStorefrontSection('showLaunch')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    storefrontConfig.showLaunch
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${storefrontConfig.showLaunch ? 'bg-emerald-200 animate-pulse' : 'bg-slate-500'}`} />
                  <span>{storefrontConfig.showLaunch ? 'Habilitado (Mostrar)' : 'Deshabilitado (Ocultar)'}</span>
                </button>
              </div>
            </div>

            {/* 3. MENSUAL */}
            <div className={`p-5 rounded-2xl border transition-all ${
              storefrontConfig.showMonthly
                ? isDarkTheme ? 'bg-purple-500/5 border-purple-500/30' : 'bg-purple-50/50 border-purple-200'
                : isDarkTheme ? 'bg-slate-900/40 border-slate-800 opacity-70' : 'bg-slate-100/50 border-slate-200 opacity-70'
            }`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl border ${
                    storefrontConfig.showMonthly
                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                      : 'bg-slate-800 text-slate-500 border-slate-700'
                  }`}>
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">Pestaña: Suscripción Mensual</h4>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400 font-semibold">
                      Recurrente / 30 Días
                    </span>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                  storefrontConfig.showMonthly
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {storefrontConfig.showMonthly ? 'ACTIVO EN CLIENTE' : 'OCULTO'}
                </span>
              </div>

              <p className="text-xs font-mono text-slate-400 mb-4 leading-relaxed">
                Minero por suscripción mensual con cuota fija y upgrade acumulativo de potencia (desde $39.99/mes hasta $499.99/mes).
              </p>

              <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">Visibilidad en Diálogo:</span>
                <button
                  type="button"
                  disabled={isUpdatingSection}
                  onClick={() => handleToggleStorefrontSection('showMonthly')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    storefrontConfig.showMonthly
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${storefrontConfig.showMonthly ? 'bg-emerald-200 animate-pulse' : 'bg-slate-500'}`} />
                  <span>{storefrontConfig.showMonthly ? 'Habilitado (Mostrar)' : 'Deshabilitado (Ocultar)'}</span>
                </button>
              </div>
            </div>

            {/* 4. POTENCIA PERSONALIZADA (CUSTOM) */}
            <div className={`p-5 rounded-2xl border transition-all ${
              storefrontConfig.showCustom
                ? isDarkTheme ? 'bg-cyan-500/5 border-cyan-500/30' : 'bg-cyan-50/50 border-cyan-200'
                : isDarkTheme ? 'bg-slate-900/40 border-slate-800 opacity-70' : 'bg-slate-100/50 border-slate-200 opacity-70'
            }`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl border ${
                    storefrontConfig.showCustom
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                      : 'bg-slate-800 text-slate-500 border-slate-700'
                  }`}>
                    <Sliders className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">Selector: Potencia Personalizada</h4>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                      Control Slider (1-5,000 TH)
                    </span>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                  storefrontConfig.showCustom
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {storefrontConfig.showCustom ? 'ACTIVO EN CLIENTE' : 'OCULTO'}
                </span>
              </div>

              <p className="text-xs font-mono text-slate-400 mb-4 leading-relaxed">
                Opción "Personalizado" con selector de 22 niveles discretos y cálculo dinámico de ROI dentro del diálogo de compra.
              </p>

              <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">Visibilidad en Diálogo:</span>
                <button
                  type="button"
                  disabled={isUpdatingSection}
                  onClick={() => handleToggleStorefrontSection('showCustom')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                    storefrontConfig.showCustom
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${storefrontConfig.showCustom ? 'bg-emerald-200 animate-pulse' : 'bg-slate-500'}`} />
                  <span>{storefrontConfig.showCustom ? 'Habilitado (Mostrar)' : 'Deshabilitado (Ocultar)'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL DE MOTOR: SIMULADOR DE GANANCIA CON PARÁMETROS REALES
          ======================================================== */}
      {simulationPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className={`w-full max-w-2xl p-6 rounded-3xl border shadow-2xl overflow-hidden ${
              isDarkTheme
                ? 'bg-[#0E1320] border-white/15 text-white'
                : 'bg-white border-slate-200 text-slate-900 shadow-2xl'
            }`}
          >
            {/* Modal Header */}
            <div className={`flex items-center justify-between pb-4 border-b ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#05DF72]/20 border border-[#05DF72]/40 text-[#05DF72]">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className={`text-lg font-bold font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    Simulador del Motor Híbrido: {simulationPkg.name}
                  </h3>
                  <span className={`text-xs font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                    Cotización Spot PEARL = ${effectivePrlPrice.toFixed(2)} USD (Kryptex Live)
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSimulationPkg(null)}
                className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                  isDarkTheme ? 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            {(() => {
              const th = simulationPkg.powerTh;
              const rBase = formBaseRate;
              const varPct = modalSimVarPct;
              const commPct = modalSimCommPct;

              const baseProd = th * rBase * simHours;
              const adjProd = baseProd * (1 + varPct / 100);
              const feeProd = (adjProd * commPct) / 100;
              const netProd = adjProd - feeProd;
              const netUsd = netProd * effectivePrlPrice;

              const dailyNetUsd = (th * rBase * 24 * (1 + varPct / 100) * (1 - commPct / 100)) * effectivePrlPrice;
              const annualNetUsd = dailyNetUsd * 365;
              const annualRoiPct = simulationPkg.priceUsdt > 0 ? ((annualNetUsd - simulationPkg.priceUsdt) / simulationPkg.priceUsdt) * 100 : 0;
              const breakEvenDays = dailyNetUsd > 0 ? Math.ceil(simulationPkg.priceUsdt / dailyNetUsd) : 0;

              return (
                <div className="space-y-5 pt-4">
                  {/* Pipeline de 5 Pasos Matemáticos */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className={`p-3 rounded-2xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[10px] font-mono text-cyan-400 font-bold block">1. POTENCIA</span>
                      <span className={`text-base font-jetbrains font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{th} TH/s</span>
                      <span className="text-[10px] font-mono block text-slate-400">Contrato Base</span>
                    </div>

                    <div className={`p-3 rounded-2xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[10px] font-mono text-[#05DF72] font-bold block">2. TASA R_BASE</span>
                      <span className={`text-base font-jetbrains font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{rBase.toFixed(6)}</span>
                      <span className="text-[10px] font-mono block text-slate-400">PRL/TH/h</span>
                    </div>

                    <div className={`p-3 rounded-2xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[10px] font-mono text-purple-400 font-bold block">3. MULTIPLICADOR</span>
                      <span className={`text-base font-jetbrains font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                        {varPct >= 0 ? `+${varPct}%` : `${varPct}%`}
                      </span>
                      <span className="text-[10px] font-mono block text-slate-400">Bonificación Comercial</span>
                    </div>

                    <div className={`p-3 rounded-2xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[10px] font-mono text-rose-400 font-bold block">4. RETENCIÓN</span>
                      <span className={`text-base font-jetbrains font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>-{commPct}%</span>
                      <span className="text-[10px] font-mono block text-slate-400">Comisión Hosting</span>
                    </div>
                  </div>

                  {/* Proyecciones de Rentabilidad */}
                  <div className={`p-4 rounded-2xl border space-y-3 ${
                    isDarkTheme ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/5">
                      <span className="text-xs font-mono font-bold text-slate-400">VENTANA TEMPORAL SELECCIONADA:</span>
                      <div className="flex gap-1.5">
                        {[
                          { hrs: 24, label: '24 Horas' },
                          { hrs: 168, label: '7 Días' },
                          { hrs: 720, label: '30 Días (Mes)' },
                          { hrs: 8760, label: '365 Días (Año)' }
                        ].map(({ hrs, label }) => (
                          <button
                            key={hrs}
                            type="button"
                            onClick={() => setSimHours(hrs)}
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold transition-all cursor-pointer ${
                              simHours === hrs
                                ? 'bg-[#05DF72] text-slate-950 font-extrabold shadow-sm'
                                : isDarkTheme ? 'bg-white/5 text-slate-300 hover:bg-white/10' : 'bg-white text-slate-700 border border-slate-200'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                      <div>
                        <span className="text-xs font-mono text-slate-400 block mb-0.5">Producción Neta en Ventana:</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-jetbrains font-bold text-[#05DF72]">
                            {netProd.toFixed(4)} PRL
                          </span>
                          <span className="text-sm font-jetbrains font-bold text-amber-400">
                            ≈ ${netUsd.toFixed(2)} USD
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col justify-end">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-slate-400">ROI Anual Estimado:</span>
                          <strong className={annualRoiPct >= 0 ? 'text-[#05DF72]' : 'text-rose-400'}>
                            {annualRoiPct >= 0 ? `+${annualRoiPct.toFixed(1)}%` : `${annualRoiPct.toFixed(1)}%`} / año
                          </strong>
                        </div>
                        <div className="flex justify-between text-xs font-mono mt-1">
                          <span className="text-slate-400">Punto de Equilibrio:</span>
                          <strong className="text-cyan-400">~{breakEvenDays} días</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sliders para experimentar con los parámetros de este paquete */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-slate-400">Ajuste Variable Simulado:</span>
                        <strong className="text-purple-400">{modalSimVarPct >= 0 ? `+${modalSimVarPct}%` : `${modalSimVarPct}%`}</strong>
                      </div>
                      <input
                        type="range"
                        min="-10"
                        max="25"
                        step="0.5"
                        value={modalSimVarPct}
                        onChange={(e) => setModalSimVarPct(parseFloat(e.target.value) || 0)}
                        className="w-full accent-purple-400 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-slate-400">Ajuste Comisión Simulado:</span>
                        <strong className="text-rose-400">{modalSimCommPct}%</strong>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.1"
                        value={modalSimCommPct}
                        onChange={(e) => setModalSimCommPct(parseFloat(e.target.value) || 0)}
                        className="w-full accent-rose-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Footer & Acciones */}
                  <div className={`pt-4 border-t flex flex-wrap items-center justify-between gap-3 ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
                    <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-[#05DF72]" />
                      <span>Parámetros sincronizados con Kryptex PoUW</span>
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSimulationPkg(null)}
                        className={`px-4 py-2 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                          isDarkTheme ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5' : 'border-slate-300 text-slate-700 hover:text-slate-900'
                        }`}
                      >
                        Cerrar
                      </button>

                      {onNavigateToEngine && (
                        <button
                          type="button"
                          onClick={() => {
                            const pId = simulationPkg.id;
                            setSimulationPkg(null);
                            onNavigateToEngine(pId);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#05DF72] text-slate-950 font-mono text-xs font-bold hover:bg-[#04C965] active:scale-[0.97] transition-all cursor-pointer shadow-sm"
                        >
                          <span>Abrir en Consola del Motor</span>
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ========================================================
          CREATE / EDIT PACKAGE MODAL CON PREVISUALIZACIÓN EN VIVO
          ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-xl p-6 rounded-3xl border shadow-2xl ${
              isDarkTheme
                ? 'bg-[#0E1320] border-white/15 text-white'
                : 'bg-white border-slate-200 text-slate-900 shadow-xl'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b mb-5 ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-[#05DF72]" />
                <h3 className={`text-lg font-bold font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  {editingPkg ? `Editar ${editingPkg.name} (Nueva Versión)` : 'Crear Nuevo Paquete Minero'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                  isDarkTheme ? 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className={`block text-xs font-mono mb-1 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  Nombre Comercial del Paquete
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Minero 6 Extreme (256 TH/s)"
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-mono font-medium border focus:outline-none focus:border-[#05DF72] ${
                    isDarkTheme ? 'bg-[#090D16] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-mono mb-1 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                    Potencia Contratada (TH/s)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.powerTh}
                    onChange={(e) => setFormData({ ...formData, powerTh: parseInt(e.target.value) || 1 })}
                    className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-mono font-medium border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#090D16] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-mono mb-1 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                    Precio Comercial (USDT)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={formData.priceUsdt}
                    onChange={(e) => setFormData({ ...formData, priceUsdt: parseFloat(e.target.value) || 1 })}
                    className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-mono font-medium border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#090D16] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block text-xs font-mono mb-1 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                    Duración (Días)
                  </label>
                  <input
                    type="number"
                    min="30"
                    value={formData.durationDays}
                    onChange={(e) => setFormData({ ...formData, durationDays: parseInt(e.target.value) || 365 })}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-mono font-medium border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#090D16] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-mono mb-1 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                    Variable (+/- %)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.variablePct}
                    onChange={(e) => setFormData({ ...formData, variablePct: parseFloat(e.target.value) || 0 })}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-mono font-medium border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#090D16] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-mono mb-1 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                    Comisión (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.commissionPct}
                    onChange={(e) => setFormData({ ...formData, commissionPct: parseFloat(e.target.value) || 2 })}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-mono font-medium border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#090D16] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-mono mb-1 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  Descripción Comercial
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detalles sobre el contrato..."
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-mono border focus:outline-none focus:border-[#05DF72] ${
                    isDarkTheme ? 'bg-[#090D16] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                  }`}
                />
              </div>

              {/* CAJA DE PREVISUALIZACIÓN DE RENTABILIDAD EN VIVO */}
              <div className={`p-3.5 rounded-2xl border space-y-2 ${
                isDarkTheme ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-cyan-50 border-cyan-200'
              }`}>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="font-bold text-cyan-400 flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" />
                    Previsualización del Motor Híbrido:
                  </span>
                  <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600'}>
                    Spot PRL: ${effectivePrlPrice.toFixed(2)} USD
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Rendimiento Diario Neto:</span>
                    <strong className="text-[#05DF72]">{formDailyNetPrl.toFixed(4)} PRL/d</strong>
                    <span className="text-[10px] text-amber-400 block">≈ ${formDailyUsd.toFixed(2)} USD/d</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">ROI Anual Estimado:</span>
                    <strong className={formAnnualRoi >= 0 ? 'text-[#05DF72]' : 'text-rose-400'}>
                      {formAnnualRoi >= 0 ? `+${formAnnualRoi.toFixed(1)}%` : `${formAnnualRoi.toFixed(1)}%`} / año
                    </strong>
                    <span className="text-[10px] text-slate-400 block">sobre ${formData.priceUsdt} USDT</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={`px-4 py-2 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                    isDarkTheme ? 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5' : 'border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#05DF72] text-slate-950 font-mono text-xs font-bold hover:bg-[#04C965] active:scale-[0.97] transition-all cursor-pointer shadow-sm"
                >
                  {editingPkg ? 'Publicar Nueva Versión' : 'Crear y Sincronizar Paquete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
