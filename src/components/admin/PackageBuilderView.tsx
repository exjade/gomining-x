import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit3, 
  Cpu, 
  X,
  Zap,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  UploadCloud,
  Globe,
  Users,
  Search,
  ShoppingCart,
  Sliders,
  Lock,
  ChevronDown
} from 'lucide-react';
import { CommercialPackageService } from '../../services/admin/commercialPackageService';
import { HashrateAllocationService } from '../../services/admin/hashrateAllocationService';
import { MinerxProfitEngine } from '../../services/admin/minerxProfitEngine';
import { StorefrontControlService, type StorefrontSectionsConfig } from '../../services/admin/storefrontControlService';
import type { CommercialPackage, MiningContract } from '../../types/admin';
import type { CatalogSection } from '../../services/catalogService';

interface PackageBuilderViewProps {
  isDarkTheme?: boolean;
  onNavigateToEngine?: (packageId?: string) => void;
  onNavigateTab?: (tabId: string) => void;
}

interface CanonicalFormData {
  name: string;
  displayName: string;
  section: CatalogSection | '';
  packageType: 'fixed' | 'subscription' | 'custom' | '';
  powerTh: string;
  priceUsdt: string;
  sortOrder: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT' | '';
  isPublished: boolean | null;
  cadence: string;
  dailyBtcText: string;
  roiPct: string;
  limitedUnits: string;
  availableUnits: string;
  soldUnits: string;
  frontendKey: string;
  description: string;
  durationDays: string;
  variablePct: string;
  commissionPct: string;
}

export const PackageBuilderView: React.FC<PackageBuilderViewProps> = ({
  isDarkTheme = true,
  onNavigateToEngine,
}) => {
  const packageService = CommercialPackageService.getInstance();
  const allocationService = HashrateAllocationService.getInstance();
  const profitEngine = MinerxProfitEngine.getInstance();
  const storefrontService = StorefrontControlService.getInstance();

  const [canonicalPackages, setCanonicalPackages] = useState<CommercialPackage[]>([]);
  const [legacyPackages, setLegacyPackages] = useState<CommercialPackage[]>([]);
  const [contracts, setContracts] = useState<MiningContract[]>(allocationService.getContracts());
  const [storefrontConfig, setStorefrontConfig] = useState<StorefrontSectionsConfig>(storefrontService.getConfig());
  const [activeViewSubTab, setActiveViewSubTab] = useState<'catalog' | 'purchases' | 'storefront_controls'>('catalog');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<'all' | CatalogSection>('all');
  const [purchasesSearchTerm, setPurchasesSearchTerm] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingPkg, setEditingPkg] = useState<CommercialPackage | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [isUpdatingSection, setIsUpdatingSection] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [crudError, setCrudError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [showAdvancedFields, setShowAdvancedFields] = useState<boolean>(false);

  // Canonical Admin Catalog loader
  const loadCanonicalCatalog = async () => {
    setIsSyncing(true);
    setCrudError(null);
    try {
      const res = await packageService.fetchAdminCatalog();
      setCanonicalPackages(res.canonical || []);
      setLegacyPackages(res.legacy || []);
    } catch (err: any) {
      setCrudError(err?.message || 'Error cargando catálogo canónico');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadCanonicalCatalog();

    allocationService.fetchFirestoreContracts()
      .then(setContracts)
      .catch(() => {});

    storefrontService.fetchFirestoreConfig()
      .then(setStorefrontConfig)
      .catch(() => {});

    const unsubContracts = allocationService.subscribeToFirestoreContracts((ctrs) => {
      setContracts(ctrs);
    });

    const unsubStorefront = storefrontService.subscribeToFirestoreConfig((cfg) => {
      setStorefrontConfig(cfg);
    });

    return () => {
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
        showCustom: 'Custom'
      };
      setSyncFeedback(`Sección "${labels[section] || section}" ${nextVal ? 'habilitada' : 'oculta/deshabilitada'} en la app del cliente.`);
    } catch {
      setSyncFeedback('Error al actualizar visibilidad de sección.');
    } finally {
      setIsUpdatingSection(false);
      setTimeout(() => setSyncFeedback(null), 3000);
    }
  };

  const handleRefreshCatalog = async () => {
    setIsSyncing(true);
    setCrudError(null);
    setSyncFeedback(null);
    try {
      const [catalogRes, remoteContracts] = await Promise.all([
        packageService.fetchAdminCatalog(),
        allocationService.fetchFirestoreContracts()
      ]);
      setCanonicalPackages(catalogRes.canonical || []);
      setLegacyPackages(catalogRes.legacy || []);
      setContracts(remoteContracts);
      setSyncFeedback(`Catálogo actualizado: ${catalogRes.canonical.length} canónicos, ${catalogRes.legacy.length} legacy.`);
    } catch (err: any) {
      setCrudError(err?.message || 'Error al actualizar catálogo administrativo.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 3500);
    }
  };

  const handleTogglePublish = async (pkg: CommercialPackage) => {
    if (pkg.isLegacy || pkg.status === 'ARCHIVED') return;
    setIsMutating(true);
    setCrudError(null);
    try {
      const nextPublished = pkg.isPublished !== false ? false : true;
      const updated = await packageService.saveCanonicalPackage({
        ...pkg,
        isPublished: nextPublished,
      });
      setCanonicalPackages(prev => prev.map(p => (p.id === updated.id ? updated : p)));
      setSyncFeedback(`Paquete "${updated.name}" ${updated.isPublished ? 'publicado en tienda' : 'ocultado'}.`);
    } catch (err: any) {
      setCrudError(err?.message || 'Error al modificar publicación del paquete.');
    } finally {
      setIsMutating(false);
      setTimeout(() => setSyncFeedback(null), 3000);
    }
  };

  const handleToggleArchive = async (pkg: CommercialPackage) => {
    if (pkg.isLegacy) return;
    setIsMutating(true);
    setCrudError(null);
    try {
      let updated: CommercialPackage;
      if (pkg.status === 'ARCHIVED') {
        // Reactivate: status = ACTIVE, isPublished = false (per contract: no auto-publish)
        updated = await packageService.saveCanonicalPackage({
          ...pkg,
          status: 'ACTIVE',
          isPublished: false,
        });
        setSyncFeedback(`Paquete "${updated.name}" reactivado como ACTIVE (no publicado).`);
      } else {
        // Canonical archive
        updated = await packageService.archiveCanonicalPackage(pkg.id);
        setSyncFeedback(`Paquete "${updated.name}" archivado correctamente.`);
      }
      setCanonicalPackages(prev => prev.map(p => (p.id === updated.id ? updated : p)));
    } catch (err: any) {
      setCrudError(err?.message || 'Error al archivar/reactivar paquete.');
    } finally {
      setIsMutating(false);
      setTimeout(() => setSyncFeedback(null), 3000);
    }
  };

  // Hybrid engine simulation state
  const [simulationPkg, setSimulationPkg] = useState<CommercialPackage | null>(null);
  const [simHours, setSimHours] = useState<number>(24);
  const [modalSimVarPct, setModalSimVarPct] = useState<number>(0);
  const [modalSimCommPct, setModalSimCommPct] = useState<number>(2);

  const globalConfig = profitEngine.getGlobalConfig();
  const effectivePrlPrice = globalConfig.prlManualOverridePrice ?? globalConfig.prlPriceUsd;
  const formBaseRate = globalConfig.manualBaseRatePrlPerThsHour;

  const [formData, setFormData] = useState<CanonicalFormData>({
    name: '',
    displayName: '',
    section: '',
    packageType: '',
    powerTh: '',
    priceUsdt: '',
    sortOrder: '',
    status: '',
    isPublished: null,
    cadence: '',
    dailyBtcText: '',
    roiPct: '',
    limitedUnits: '',
    availableUnits: '',
    soldUnits: '',
    frontendKey: '',
    description: '',
    durationDays: '',
    variablePct: '',
    commissionPct: ''
  });

  const handleOpenCreate = () => {
    setEditingPkg(null);
    setModalError(null);
    setShowAdvancedFields(false);
    setFormData({
      name: '',
      displayName: '',
      section: '',
      packageType: '',
      powerTh: '',
      priceUsdt: '',
      sortOrder: '',
      status: '',
      isPublished: null,
      cadence: '',
      dailyBtcText: '',
      roiPct: '',
      limitedUnits: '',
      availableUnits: '',
      soldUnits: '',
      frontendKey: '',
      description: '',
      durationDays: '',
      variablePct: '',
      commissionPct: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (pkg: CommercialPackage) => {
    if (pkg.isLegacy) return;
    setEditingPkg(pkg);
    setModalError(null);
    setShowAdvancedFields(false);
    setFormData({
      name: pkg.name || '',
      displayName: pkg.displayName || '',
      section: (pkg.section as CatalogSection) || '',
      packageType: (pkg.packageType as any) || '',
      powerTh: pkg.powerTh !== undefined && pkg.powerTh !== null ? String(pkg.powerTh) : '',
      priceUsdt: pkg.priceUsdt !== undefined && pkg.priceUsdt !== null ? String(pkg.priceUsdt) : '',
      sortOrder: pkg.sortOrder !== undefined && pkg.sortOrder !== null ? String(pkg.sortOrder) : '',
      status: pkg.status || '',
      isPublished: typeof pkg.isPublished === 'boolean' ? pkg.isPublished : null,
      cadence: pkg.cadence || '',
      dailyBtcText: pkg.dailyBtcText || '',
      roiPct: pkg.roiPct !== undefined ? String(pkg.roiPct) : '',
      limitedUnits: pkg.limitedUnits !== undefined ? String(pkg.limitedUnits) : '',
      availableUnits: pkg.availableUnits !== undefined ? String(pkg.availableUnits) : '',
      soldUnits: pkg.soldUnits !== undefined ? String(pkg.soldUnits) : '',
      frontendKey: pkg.frontendKey || '',
      description: pkg.description || '',
      durationDays: pkg.durationDays !== undefined ? String(pkg.durationDays) : '',
      variablePct: pkg.variablePct !== undefined ? String(pkg.variablePct) : '',
      commissionPct: pkg.commissionPct !== undefined ? String(pkg.commissionPct) : ''
    });
    setIsModalOpen(true);
  };

  const handleOpenSimulation = (pkg: CommercialPackage) => {
    setSimulationPkg(pkg);
    setModalSimVarPct(pkg.variablePct ?? 0);
    setModalSimCommPct(pkg.commissionPct ?? 0);
    setSimHours(24);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!formData.name.trim()) {
      setModalError('El nombre comercial del paquete es obligatorio.');
      return;
    }
    if (!formData.section) {
      setModalError('Debe seleccionar una sección de catálogo obligatoria.');
      return;
    }
    if (!formData.packageType) {
      setModalError('Debe seleccionar un tipo de paquete obligatorio.');
      return;
    }
    const powerNum = Number(formData.powerTh);
    if (isNaN(powerNum) || powerNum <= 0) {
      setModalError('La potencia (TH/s) debe ser un número positivo.');
      return;
    }
    const priceNum = Number(formData.priceUsdt);
    if (isNaN(priceNum) || priceNum <= 0) {
      setModalError('El precio (USDT) debe ser un número positivo.');
      return;
    }
    if (formData.sortOrder === '' || formData.sortOrder === null || formData.sortOrder === undefined) {
      setModalError('El orden de presentación (sortOrder) es obligatorio y debe ser un número mayor o igual a 0.');
      return;
    }
    const sortOrderNum = Number(formData.sortOrder);
    if (isNaN(sortOrderNum) || sortOrderNum < 0) {
      setModalError('El orden de presentación (sortOrder) debe ser un número mayor o igual a 0.');
      return;
    }
    if (!formData.status) {
      setModalError('Debe seleccionar explícitamente el estado (ACTIVE, DRAFT o ARCHIVED).');
      return;
    }
    if (formData.isPublished === null || typeof formData.isPublished !== 'boolean') {
      setModalError('Debe indicar explícitamente si el paquete está publicado en tienda.');
      return;
    }
    if (formData.status === 'ARCHIVED' && formData.isPublished === true) {
      setModalError('Un paquete con estado ARCHIVED no puede estar publicado (isPublished debe ser falso).');
      return;
    }

    const payload: any = {
      name: formData.name.trim(),
      section: formData.section,
      packageType: formData.packageType,
      powerTh: powerNum,
      priceUsdt: priceNum,
      sortOrder: sortOrderNum,
      status: formData.status,
      isPublished: formData.isPublished,
    };

    if (formData.displayName.trim()) {
      payload.displayName = formData.displayName.trim();
    }

    if (editingPkg) {
      payload.id = editingPkg.id;
      payload.packageId = editingPkg.packageId || editingPkg.id;
    }

    // Optional fields only included if supplied (no invented defaults)
    if (formData.cadence.trim()) payload.cadence = formData.cadence.trim();
    if (formData.dailyBtcText.trim()) payload.dailyBtcText = formData.dailyBtcText.trim();
    if (formData.frontendKey.trim()) payload.frontendKey = formData.frontendKey.trim();
    if (formData.description.trim()) payload.description = formData.description.trim();

    if (formData.roiPct.trim()) {
      const r = Number(formData.roiPct);
      if (!isNaN(r)) payload.roiPct = r;
    }
    if (formData.limitedUnits.trim()) {
      const u = Number(formData.limitedUnits);
      if (!isNaN(u)) payload.limitedUnits = u;
    }
    if (formData.availableUnits.trim()) {
      const u = Number(formData.availableUnits);
      if (!isNaN(u)) payload.availableUnits = u;
    }
    if (formData.soldUnits.trim()) {
      const u = Number(formData.soldUnits);
      if (!isNaN(u)) payload.soldUnits = u;
    }
    if (formData.durationDays.trim()) {
      const d = Number(formData.durationDays);
      if (!isNaN(d)) payload.durationDays = d;
    }
    if (formData.variablePct.trim()) {
      const v = Number(formData.variablePct);
      if (!isNaN(v)) payload.variablePct = v;
    }
    if (formData.commissionPct.trim()) {
      const c = Number(formData.commissionPct);
      if (!isNaN(c)) payload.commissionPct = c;
    }

    setIsMutating(true);
    try {
      const saved = await packageService.saveCanonicalPackage(payload);
      setCanonicalPackages(prev => {
        const exists = prev.some(p => p.id === saved.id);
        if (exists) {
          return prev.map(p => (p.id === saved.id ? saved : p));
        } else {
          return [saved, ...prev];
        }
      });
      setSyncFeedback(`Paquete "${saved.name}" guardado exitosamente.`);
      setIsModalOpen(false);
    } catch (err: any) {
      // Fail closed: display error in modal, do not close modal or fake success
      setModalError(err?.message || 'Error guardando paquete canónico.');
    } finally {
      setIsMutating(false);
      setTimeout(() => setSyncFeedback(null), 3000);
    }
  };

  // Live simulation calculation for modal preview
  const formPowerNum = Number(formData.powerTh) || 0;
  const formPriceNum = Number(formData.priceUsdt) || 0;
  const formVarNum = Number(formData.variablePct) || 0;
  const formCommNum = Number(formData.commissionPct) || 0;
  const formDailyBasePrl = formPowerNum * formBaseRate * 24;
  const formDailyAdjPrl = formDailyBasePrl * (1 + formVarNum / 100);
  const formDailyNetPrl = formDailyAdjPrl * (1 - formCommNum / 100);
  const formDailyUsd = formDailyNetPrl * effectivePrlPrice;
  const formAnnualUsd = formDailyUsd * 365;
  const formAnnualRoi = formPriceNum > 0 ? ((formAnnualUsd - formPriceNum) / formPriceNum) * 100 : 0;

  // Filtered canonical packages
  const filteredCanonical = canonicalPackages
    .filter(p => selectedSectionFilter === 'all' || p.section === selectedSectionFilter)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const totalPackagesCount = canonicalPackages.length + legacyPackages.length;
  const activeInStorefrontCount = canonicalPackages.filter(p => p.status === 'ACTIVE' && p.isPublished === true).length;

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
              CRUD Canónico Backend-First
            </span>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Gestión comercial autorizada contra Express Backend / Firestore Admin SDK.
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-[11px] font-mono text-cyan-400">
            <Globe className="h-3 w-3" />
            <span>Endpoint Canónico: <code className="text-[#05DF72]">/api/catalog/admin</code></span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRefreshCatalog}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
              isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
            title="Refrescar catálogo canónico desde el backend"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-[#05DF72]' : 'text-slate-400'}`} />
            <span>{isSyncing ? 'Actualizando...' : 'Refrescar Catálogo'}</span>
          </button>

          <button
            onClick={() => {}}
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
            Crear Nuevo Paquete Canónico
          </button>
        </div>
      </div>

      {/* FEEDBACK & ERROR BANNERS */}
      {syncFeedback && (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-emerald-400 font-mono text-xs animate-in fade-in">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {crudError && (
        <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-2 text-rose-400 font-mono text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{crudError}</span>
          </div>
          <button
            onClick={() => setCrudError(null)}
            className="text-rose-400 hover:text-white p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* EXECUTIVE SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className={`p-4 rounded-2xl border ${isDarkTheme ? 'bg-[#0E1320]/80 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'}`}>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span className="uppercase">Paquetes Totales</span>
            <Cpu className="h-3.5 w-3.5 text-[#05DF72]" />
          </div>
          <div className="text-2xl font-bold font-mono">{totalPackagesCount}</div>
          <div className="text-[10px] font-mono text-[#05DF72] mt-0.5">
            {activeInStorefrontCount} activos en tienda ({canonicalPackages.length} canónicos)
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
          <span>Catálogo de Paquetes ({canonicalPackages.length} Canónicos + {legacyPackages.length} Legacy)</span>
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
        <div className="space-y-6">
          {/* SECTION FILTER BAR */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-mono text-slate-400 mr-2 font-bold uppercase">Filtrar Sección:</span>
              {[
                { id: 'all', label: 'Todas las Secciones' },
                { id: 'minerx', label: 'MinerX' },
                { id: 'preventa', label: 'Preventa' },
                { id: 'lanzamiento', label: 'Lanzamiento' },
                { id: 'mensual', label: 'Mensual' },
              ].map(sec => (
                <button
                  key={sec.id}
                  onClick={() => setSelectedSectionFilter(sec.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    selectedSectionFilter === sec.id
                      ? 'bg-[#05DF72] text-slate-950 shadow-sm'
                      : isDarkTheme
                      ? 'bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
                      : 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {sec.label}
                </button>
              ))}
            </div>

            <div className="text-xs font-mono text-slate-400">
              Mostrando <strong className="text-white">{filteredCanonical.length}</strong> paquetes ordenados por <code className="text-[#05DF72]">sortOrder ASC</code>
            </div>
          </div>

          {/* CANONICAL PACKAGES GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredCanonical.map((pkg) => {
              const isArchived = pkg.status === 'ARCHIVED';
              const basePrl = pkg.powerTh * formBaseRate * 24;
              const varPct = pkg.variablePct ?? 0;
              const comPct = pkg.commissionPct ?? 0;
              const netDailyPrl = basePrl * (1 + varPct / 100) * (1 - comPct / 100);
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
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-cyan-500/10 text-cyan-400 border-cyan-500/20 font-bold uppercase">
                          {pkg.section || '—'}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold ${
                          pkg.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : pkg.status === 'DRAFT'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        }`}>
                          {pkg.status}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                          pkg.isPublished && !isArchived
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        }`}>
                          {pkg.isPublished && !isArchived ? 'En Tienda' : 'Oculto'}
                        </span>
                        <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                          isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700 font-semibold'
                        }`}>
                          v{pkg.version}
                        </span>
                      </div>
                    </div>

                    <h3 className={`text-lg font-bold font-sans ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{pkg.name}</h3>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      ID: <code className="text-slate-300 font-bold">{pkg.packageId || pkg.id}</code>
                      {pkg.sortOrder !== undefined && (
                        <span className="ml-2 px-1.5 py-0.2 rounded bg-white/5 text-[10px]">Orden: {pkg.sortOrder}</span>
                      )}
                    </div>
                    <p className={`text-xs font-mono mt-2 line-clamp-2 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
                      {pkg.description || 'Contrato canónico dinámico respaldado por backend.'}
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
                      <div className={`flex justify-between items-center pt-1 border-t ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>
                        <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>ROI Anual Proyectado:</span>
                        <span className={`font-bold ${pkgAnnualRoi >= 0 ? 'text-[#05DF72]' : 'text-rose-400'}`}>
                          {pkgAnnualRoi >= 0 ? `+${pkgAnnualRoi.toFixed(1)}%` : `${pkgAnnualRoi.toFixed(1)}%`} / año
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={`pt-3 border-t space-y-2 ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>
                    {/* SIMULATE BUTTON */}
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
                        onClick={() => handleTogglePublish(pkg)}
                        disabled={isMutating || isArchived}
                        title={
                          isArchived
                            ? 'Un paquete archivado no puede ser publicado'
                            : pkg.isPublished
                            ? 'Ocultar de la app GoMining'
                            : 'Publicar a la app GoMining'
                        }
                        className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-mono font-bold transition-all flex items-center gap-1 ${
                          isArchived
                            ? 'opacity-40 cursor-not-allowed border-slate-700 text-slate-500'
                            : pkg.isPublished
                            ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 cursor-pointer active:scale-[0.97]'
                            : 'border-slate-500/30 text-slate-400 hover:bg-slate-500/10 cursor-pointer active:scale-[0.97]'
                        }`}
                      >
                        <Globe className="h-3 w-3" />
                        <span>{pkg.isPublished && !isArchived ? 'En Tienda' : 'Oculto'}</span>
                      </button>

                      <button
                        onClick={() => handleToggleArchive(pkg)}
                        disabled={isMutating}
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
                        disabled={isMutating}
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

          {filteredCanonical.length === 0 && (
            <div className="p-8 text-center rounded-3xl border border-white/10 bg-white/[0.02] font-mono text-xs text-slate-400">
              No hay paquetes canónicos en la sección seleccionada. Presiona "Crear Nuevo Paquete Canónico" para agregar uno.
            </div>
          )}

          {/* LEGACY PRESERVED PACKAGES (READ-ONLY) */}
          {legacyPackages.length > 0 && (
            <div className="mt-10 pt-6 border-t border-white/10 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-amber-400" />
                  <h3 className="text-base font-bold font-sans text-slate-200">
                    Catálogo Legacy Preservado (Pre-SCRUM-210)
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Solo Lectura / Físicamente Preservado
                  </span>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {legacyPackages.length} paquetes estáticos legacy (inmutables)
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400">
                Estos paquetes representan los registros locales iniciales históricos. No forman parte del catálogo dinámico canónico y no pueden ser editados ni mutados.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 opacity-75">
                {legacyPackages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="p-5 rounded-3xl border border-amber-500/20 bg-amber-500/[0.03] text-white flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1">
                          <Cpu className="h-3.5 w-3.5" />
                          {pkg.powerTh} TH/s
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold">
                          LEGACY
                        </span>
                      </div>
                      <h4 className="text-base font-bold font-sans">{pkg.name}</h4>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">ID: {pkg.id}</div>
                      <p className="text-xs font-mono text-slate-400 mt-2 line-clamp-2">
                        {pkg.description || 'Definición estática de hardware minero legacy.'}
                      </p>
                      <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 font-mono text-xs flex justify-between items-center">
                        <span className="text-slate-400">Precio:</span>
                        <span className="text-amber-300 font-bold">${pkg.priceUsdt} USDT</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-amber-500/10 flex items-center justify-between text-[11px] font-mono text-slate-500">
                      <span>Inmutable</span>
                      <span className="flex items-center gap-1 text-amber-400/80">
                        <Lock className="h-3 w-3" />
                        No editable
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeViewSubTab === 'purchases' && (
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
                  <th className="pb-3 pr-4">ID Contrato / Minero</th>
                  <th className="pb-3 px-4">Usuario</th>
                  <th className="pb-3 px-4">Paquete Base</th>
                  <th className="pb-3 px-4 text-right">Potencia TH/s</th>
                  <th className="pb-3 px-4 text-right">Monto Pagado</th>
                  <th className="pb-3 px-4">Fecha Alta</th>
                  <th className="pb-3 pl-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {contracts
                  .filter(c => 
                    !purchasesSearchTerm ||
                    c.id.toLowerCase().includes(purchasesSearchTerm.toLowerCase()) ||
                    c.userId.toLowerCase().includes(purchasesSearchTerm.toLowerCase()) ||
                    c.packageName.toLowerCase().includes(purchasesSearchTerm.toLowerCase())
                  )
                  .map((c) => (
                    <tr key={c.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 pr-4 text-[#05DF72] font-bold">{c.id}</td>
                      <td className="py-3 px-4 text-cyan-400">{c.userId}</td>
                      <td className="py-3 px-4">{c.packageName}</td>
                      <td className="py-3 px-4 text-right font-bold">{c.contractedTh} TH/s</td>
                      <td className="py-3 px-4 text-right text-emerald-400">${c.pricePaidUsdt} USDT</td>
                      <td className="py-3 px-4 text-slate-400">{new Date(c.activatedAt || (c as any).purchasedAt).toLocaleDateString()}</td>
                      <td className="py-3 pl-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {c.status}
                        </span>
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
          <div>
            <h3 className="text-lg font-bold font-sans flex items-center gap-2">
              <Sliders className="h-4 w-4 text-amber-400" />
              <span>Control de Secciones del Catálogo de Tienda</span>
            </h3>
            <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              Habilita u oculta pestañas y secciones completas en la interfaz del cliente GoMining.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* PREVENTA */}
            <div className={`p-5 rounded-2xl border ${
              storefrontConfig.showPresale
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-white/[0.02] border-white/5 opacity-60'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm font-sans">1. Sección Preventa</span>
                <button
                  type="button"
                  disabled={isUpdatingSection}
                  onClick={() => handleToggleStorefrontSection('showPresale')}
                  className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all ${
                    storefrontConfig.showPresale
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {storefrontConfig.showPresale ? 'Habilitada' : 'Deshabilitada'}
                </button>
              </div>
              <p className="text-xs font-mono text-slate-400">
                Pestaña de preventa exclusiva con tarifas promocionales para nuevos operadores.
              </p>
            </div>

            {/* LANZAMIENTO */}
            <div className={`p-5 rounded-2xl border ${
              storefrontConfig.showLaunch
                ? 'bg-cyan-500/10 border-cyan-500/30'
                : 'bg-white/[0.02] border-white/5 opacity-60'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm font-sans">2. Sección Lanzamiento</span>
                <button
                  type="button"
                  disabled={isUpdatingSection}
                  onClick={() => handleToggleStorefrontSection('showLaunch')}
                  className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all ${
                    storefrontConfig.showLaunch
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {storefrontConfig.showLaunch ? 'Habilitada' : 'Deshabilitada'}
                </button>
              </div>
              <p className="text-xs font-mono text-slate-400">
                Catálogo estándar de máquinas mineras de lanzamiento en GoMining.
              </p>
            </div>

            {/* MENSUAL */}
            <div className={`p-5 rounded-2xl border ${
              storefrontConfig.showMonthly
                ? 'bg-purple-500/10 border-purple-500/30'
                : 'bg-white/[0.02] border-white/5 opacity-60'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm font-sans">3. Suscripción Mensual</span>
                <button
                  type="button"
                  disabled={isUpdatingSection}
                  onClick={() => handleToggleStorefrontSection('showMonthly')}
                  className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all ${
                    storefrontConfig.showMonthly
                      ? 'bg-purple-500 text-white shadow-sm'
                      : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {storefrontConfig.showMonthly ? 'Habilitada' : 'Deshabilitada'}
                </button>
              </div>
              <p className="text-xs font-mono text-slate-400">
                Modalidad de alquiler recurrente mensual con cuota y upgrade escalable.
              </p>
            </div>

            {/* CUSTOM */}
            <div className={`p-5 rounded-2xl border ${
              storefrontConfig.showCustom
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-white/[0.02] border-white/5 opacity-60'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm font-sans">4. Potencia Personalizada (Custom)</span>
                <button
                  type="button"
                  disabled={isUpdatingSection}
                  onClick={() => handleToggleStorefrontSection('showCustom')}
                  className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all ${
                    storefrontConfig.showCustom
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {storefrontConfig.showCustom ? 'Habilitada' : 'Deshabilitada'}
                </button>
              </div>
              <p className="text-xs font-mono text-slate-400">
                Selector flexible de hashrate a medida para clientes avanzados.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL DE CREACIÓN / EDICIÓN CANÓNICO (SCRUM-217)
          ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className={`w-full max-w-2xl p-6 rounded-3xl border shadow-2xl overflow-y-auto max-h-[90vh] ${
              isDarkTheme
                ? 'bg-[#0E1320] border-white/15 text-white'
                : 'bg-white border-slate-200 text-slate-900 shadow-2xl'
            }`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between pb-4 border-b ${isDarkTheme ? 'border-white/10' : 'border-slate-200'}`}>
              <div>
                <h3 className="text-lg font-bold font-sans">
                  {editingPkg ? `Editar Paquete Canónico: ${editingPkg.name}` : 'Crear Nuevo Paquete Canónico'}
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  {editingPkg ? `v${editingPkg.version} → v${(Number(editingPkg.version) || 1) + 1} (Gestión Backend-First)` : 'Sin defaults inventados; selección explícita requerida'}
                </span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl border border-white/10 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 font-mono text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 pt-4 font-mono text-xs">
              {/* packageId immutable notice when editing */}
              {editingPkg && (
                <div>
                  <label className="block text-xs font-mono mb-1 font-semibold text-slate-400">
                    Identificador Canónico (packageId) — Inmutable
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingPkg.packageId || editingPkg.id}
                    className="w-full px-3.5 py-2.5 rounded-2xl text-xs font-mono bg-white/5 border border-white/10 text-slate-400 cursor-not-allowed font-bold"
                  />
                </div>
              )}

              {/* Nombre Comercial & DisplayName */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">
                    Nombre Comercial *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Minero 6 Pro"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#090D16] border border-white/10 text-white focus:border-[#05DF72] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">
                    Nombre Mostrado (displayName)
                  </label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="Opcional"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#090D16] border border-white/10 text-white focus:border-[#05DF72] outline-none"
                  />
                </div>
              </div>

              {/* Sección & Tipo de Paquete */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">
                    Sección de Catálogo *
                  </label>
                  <select
                    required
                    value={formData.section}
                    onChange={(e) => setFormData({ ...formData, section: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#090D16] border border-white/10 text-white focus:border-[#05DF72] outline-none"
                  >
                    <option value="">-- Seleccionar Sección --</option>
                    <option value="minerx">MinerX</option>
                    <option value="preventa">Preventa</option>
                    <option value="lanzamiento">Lanzamiento</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">
                    Tipo de Paquete (packageType) *
                  </label>
                  <select
                    required
                    value={formData.packageType}
                    onChange={(e) => setFormData({ ...formData, packageType: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#090D16] border border-white/10 text-white focus:border-[#05DF72] outline-none"
                  >
                    <option value="">-- Seleccionar Tipo --</option>
                    <option value="fixed">Fijo (fixed / pago único)</option>
                    <option value="subscription">Suscripción (subscription)</option>
                    <option value="custom">Personalizado (custom)</option>
                  </select>
                </div>
              </div>

              {/* Potencia & Precio */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">
                    Potencia Contratada (TH/s) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={formData.powerTh}
                    onChange={(e) => setFormData({ ...formData, powerTh: e.target.value })}
                    placeholder="Ej: 100"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#090D16] border border-white/10 text-white focus:border-[#05DF72] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">
                    Precio Comercial (USDT) *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={formData.priceUsdt}
                    onChange={(e) => setFormData({ ...formData, priceUsdt: e.target.value })}
                    placeholder="Ej: 1200"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#090D16] border border-white/10 text-white focus:border-[#05DF72] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">
                    Orden de Visualización *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                    placeholder="Ej: 1"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#090D16] border border-white/10 text-white focus:border-[#05DF72] outline-none"
                  />
                </div>
              </div>

              {/* Estado & Publicación (Selección Explícita / Sin Defaults) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">
                    Estado Canónico (status) *
                  </label>
                  <select
                    required
                    value={formData.status}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setFormData(prev => ({
                        ...prev,
                        status: val,
                        isPublished: val === 'ARCHIVED' ? false : prev.isPublished,
                      }));
                    }}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#090D16] border border-white/10 text-white focus:border-[#05DF72] outline-none"
                  >
                    <option value="">-- Seleccionar Estado --</option>
                    <option value="ACTIVE">ACTIVE (Activo)</option>
                    <option value="DRAFT">DRAFT (Borrador)</option>
                    <option value="ARCHIVED">ARCHIVED (Archivado)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">
                    ¿Publicado en Tienda? (isPublished) *
                  </label>
                  <select
                    required
                    value={formData.isPublished === null ? '' : String(formData.isPublished)}
                    onChange={(e) => setFormData({ ...formData, isPublished: e.target.value === 'true' ? true : e.target.value === 'false' ? false : null })}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#090D16] border border-white/10 text-white focus:border-[#05DF72] outline-none"
                  >
                    <option value="">-- Seleccionar Publicación --</option>
                    <option value="true" disabled={formData.status === 'ARCHIVED'}>Sí (Visible en GoMining)</option>
                    <option value="false">No (Oculto)</option>
                  </select>
                </div>
              </div>

              {/* CAMPOS AVANZADOS OPCIONALES */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFields(!showAdvancedFields)}
                  className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300 font-bold"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvancedFields ? 'rotate-180' : ''}`} />
                  <span>{showAdvancedFields ? 'Ocultar Parámetros Adicionales' : 'Mostrar Parámetros Adicionales (Cadencia, Unidades, ROI, etc.)'}</span>
                </button>
              </div>

              {showAdvancedFields && (
                <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] space-y-3 animate-in fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Cadencia</label>
                      <input
                        type="text"
                        value={formData.cadence}
                        onChange={(e) => setFormData({ ...formData, cadence: e.target.value })}
                        placeholder="one_time o monthly"
                        className="w-full px-3 py-1.5 rounded-xl bg-[#090D16] border border-white/10 text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Daily BTC Text</label>
                      <input
                        type="text"
                        value={formData.dailyBtcText}
                        onChange={(e) => setFormData({ ...formData, dailyBtcText: e.target.value })}
                        placeholder="Ej: 0.000045 BTC/d"
                        className="w-full px-3 py-1.5 rounded-xl bg-[#090D16] border border-white/10 text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">ROI Proyectado (%)</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.roiPct}
                        onChange={(e) => setFormData({ ...formData, roiPct: e.target.value })}
                        placeholder="Ej: 35.5"
                        className="w-full px-3 py-1.5 rounded-xl bg-[#090D16] border border-white/10 text-white outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Unidades Limitadas</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.limitedUnits}
                        onChange={(e) => setFormData({ ...formData, limitedUnits: e.target.value })}
                        placeholder="Opcional"
                        className="w-full px-3 py-1.5 rounded-xl bg-[#090D16] border border-white/10 text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Unidades Disponibles</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.availableUnits}
                        onChange={(e) => setFormData({ ...formData, availableUnits: e.target.value })}
                        placeholder="Opcional"
                        className="w-full px-3 py-1.5 rounded-xl bg-[#090D16] border border-white/10 text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Unidades Vendidas</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.soldUnits}
                        onChange={(e) => setFormData({ ...formData, soldUnits: e.target.value })}
                        placeholder="Opcional"
                        className="w-full px-3 py-1.5 rounded-xl bg-[#090D16] border border-white/10 text-white outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Frontend Key</label>
                      <input
                        type="text"
                        value={formData.frontendKey}
                        onChange={(e) => setFormData({ ...formData, frontendKey: e.target.value })}
                        placeholder="Clave frontend"
                        className="w-full px-3 py-1.5 rounded-xl bg-[#090D16] border border-white/10 text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Duración (Días)</label>
                      <input
                        type="number"
                        min="1"
                        value={formData.durationDays}
                        onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                        placeholder="Sin default"
                        className="w-full px-3 py-1.5 rounded-xl bg-[#090D16] border border-white/10 text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Variable (+/- %)</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.variablePct}
                        onChange={(e) => setFormData({ ...formData, variablePct: e.target.value })}
                        placeholder="Sin default"
                        className="w-full px-3 py-1.5 rounded-xl bg-[#090D16] border border-white/10 text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Comisión (%)</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.commissionPct}
                        onChange={(e) => setFormData({ ...formData, commissionPct: e.target.value })}
                        placeholder="Sin default"
                        className="w-full px-3 py-1.5 rounded-xl bg-[#090D16] border border-white/10 text-white outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Descripción Comercial</label>
                    <textarea
                      rows={2}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Descripción opcional..."
                      className="w-full px-3 py-1.5 rounded-xl bg-[#090D16] border border-white/10 text-white outline-none"
                    />
                  </div>
                </div>
              )}

              {/* CAJA DE PREVISUALIZACIÓN DE RENTABILIDAD */}
              {formPowerNum > 0 && formPriceNum > 0 && (
                <div className="p-3.5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="font-bold text-cyan-400 flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5" />
                      Previsualización de Rendimiento Estimado:
                    </span>
                    <span className="text-slate-400">Spot PRL: ${effectivePrlPrice.toFixed(2)} USD</span>
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
                      <span className="text-[10px] text-slate-400 block">sobre ${formPriceNum} USDT</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-white/10 text-slate-300 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isMutating}
                  className="px-5 py-2 rounded-xl bg-[#05DF72] text-slate-950 font-bold hover:bg-[#04C965] active:scale-[0.97] transition-all cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isMutating ? 'Guardando en Backend...' : editingPkg ? 'Guardar Versión Canónica' : 'Crear Paquete Canónico'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL DE SIMULACIÓN DE MOTOR HÍBRIDO
          ======================================================== */}
      {simulationPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-2xl p-6 rounded-3xl border border-white/15 bg-[#0E1320] text-white shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#05DF72]/20 border border-[#05DF72]/40 text-[#05DF72]">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-sans">
                    Simulador del Motor Híbrido: {simulationPkg.name}
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    Cotización Spot PEARL = ${effectivePrlPrice.toFixed(2)} USD (Kryptex Live)
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSimulationPkg(null)}
                className="p-1.5 rounded-xl border border-white/10 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

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
                <div className="space-y-5 pt-4 font-mono text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-2xl border bg-white/[0.02] border-white/5">
                      <span className="text-[10px] text-cyan-400 font-bold block">1. POTENCIA</span>
                      <span className="text-base font-bold text-white">{th} TH/s</span>
                    </div>
                    <div className="p-3 rounded-2xl border bg-white/[0.02] border-white/5">
                      <span className="text-[10px] text-[#05DF72] font-bold block">2. TASA R_BASE</span>
                      <span className="text-base font-bold text-white">{rBase.toFixed(6)}</span>
                    </div>
                    <div className="p-3 rounded-2xl border bg-white/[0.02] border-white/5">
                      <span className="text-[10px] text-purple-400 font-bold block">3. VARIABLE</span>
                      <span className="text-base font-bold text-white">{varPct >= 0 ? `+${varPct}%` : `${varPct}%`}</span>
                    </div>
                    <div className="p-3 rounded-2xl border bg-white/[0.02] border-white/5">
                      <span className="text-[10px] text-rose-400 font-bold block">4. RETENCIÓN</span>
                      <span className="text-base font-bold text-white">-{commPct}%</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/5">
                      <span className="text-xs font-bold text-slate-400">VENTANA TEMPORAL:</span>
                      <div className="flex gap-1.5">
                        {[
                          { hrs: 24, label: '24 Horas' },
                          { hrs: 168, label: '7 Días' },
                          { hrs: 720, label: '30 Días' },
                          { hrs: 8760, label: '365 Días' }
                        ].map(({ hrs, label }) => (
                          <button
                            key={hrs}
                            type="button"
                            onClick={() => setSimHours(hrs)}
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all ${
                              simHours === hrs
                                ? 'bg-[#05DF72] text-slate-950 font-extrabold shadow-sm'
                                : 'bg-white/5 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                      <div>
                        <span className="text-slate-400 block mb-0.5">Producción Neta:</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-[#05DF72]">{netProd.toFixed(4)} PRL</span>
                          <span className="text-sm font-bold text-amber-400">≈ ${netUsd.toFixed(2)} USD</span>
                        </div>
                      </div>
                      <div className="flex flex-col justify-end">
                        <div className="flex justify-between">
                          <span className="text-slate-400">ROI Anual:</span>
                          <strong className={annualRoiPct >= 0 ? 'text-[#05DF72]' : 'text-rose-400'}>
                            {annualRoiPct >= 0 ? `+${annualRoiPct.toFixed(1)}%` : `${annualRoiPct.toFixed(1)}%`}
                          </strong>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-slate-400">Punto de Equilibrio:</span>
                          <strong className="text-cyan-400">~{breakEvenDays} días</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
