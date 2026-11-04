import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  Zap, 
  Check, 
  Save, 
  Layers,
  RefreshCw,
  RotateCcw,
  Info,
  Activity
} from 'lucide-react';
import { MinerxProfitEngine } from '../../services/admin/minerxProfitEngine';
import type { ProfitEngineGlobalConfig, MinerConfiguration } from '../../types/admin';

interface MiningEngineControlViewProps {
  isDarkTheme?: boolean;
}

export const MiningEngineControlView: React.FC<MiningEngineControlViewProps> = ({
  isDarkTheme = true
}) => {
  const engine = MinerxProfitEngine.getInstance();
  const [config, setConfig] = useState<ProfitEngineGlobalConfig>(engine.getGlobalConfig());
  const [packages, setPackages] = useState<MinerConfiguration[]>(engine.getPackagesConfig());
  
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Sincronización automática de tasa Kryptex al montar
  useEffect(() => {
    handleSyncKryptexRates(true);
  }, []);

  const handleSyncKryptexRates = async (silent = false) => {
    setIsSyncing(true);
    const res = await engine.syncLiveKryptexRates();
    const updated = engine.getGlobalConfig();
    setConfig(updated);
    setIsSyncing(false);
    if (!silent) {
      if (res.success) {
        setSyncStatus(`Kryptex sincronizado: Spot PEARL = $${res.prlPriceUsd.toFixed(2)} USD | Tasa R_base = ${res.baseRate} PRL/TH/h`);
      } else {
        setSyncStatus(`Kryptex en caché: Spot PEARL = $${updated.prlPriceUsd.toFixed(2)} USD | R_base = 0.0008432`);
      }
      setTimeout(() => setSyncStatus(null), 4000);
    }
  };

  // Estado del Simulador Interactivo de Rentabilidad
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [simTh, setSimTh] = useState<number>(48);
  const [simHours, setSimHours] = useState<number>(24);
  const [simVariablePct, setSimVariablePct] = useState<number>(config.globalVariablePct);
  const [simCommissionPct, setSimCommissionPct] = useState<number>(config.globalCommissionPct);

  // Presets Rápidos de Estrategia
  const applyPreset = (presetName: string, varPct: number, commPct: number) => {
    setSimVariablePct(varPct);
    setSimCommissionPct(commPct);
    setConfig({
      ...config,
      globalVariablePct: varPct,
      globalCommissionPct: commPct
    });
    setSyncStatus(`Preset "${presetName}" aplicado temporalmente. Haz clic en "Guardar Parámetros" para persistir.`);
    setTimeout(() => setSyncStatus(null), 4000);
  };

  const handleSaveGlobal = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = engine.updateGlobalConfig({
      ...config,
      globalVariablePct: simVariablePct,
      globalCommissionPct: simCommissionPct
    });
    setConfig(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleUpdatePackageVariable = (pkgId: string, varPct: number, commPct: number) => {
    const pkg = packages.find(p => p.id === pkgId);
    if (pkg) {
      const updated = { ...pkg, variablePct: varPct, commissionPct: commPct };
      engine.updatePackageConfig(updated);
      setPackages(engine.getPackagesConfig());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  // Cálculo canónico oficial del Modelo Unificado (Single Source of Truth)
  const simBaseRate = (config.manualBaseRatePrlPerThsHour > 0 && config.manualBaseRatePrlPerThsHour < 0.003)
    ? config.manualBaseRatePrlPerThsHour 
    : 0.0008432;

  const simProduccionBase = Number((simTh * simBaseRate * simHours).toFixed(6));
  const simProduccionAjustada = Number((simProduccionBase * (1 + simVariablePct / 100)).toFixed(6));
  const simFeePrl = Number(((simProduccionAjustada * simCommissionPct) / 100).toFixed(6));
  const simProduccionNeta = Math.max(0, Number((simProduccionAjustada - simFeePrl).toFixed(6)));
  const simValorUsd = Number((simProduccionNeta * config.prlPriceUsd).toFixed(4));
  const simMonthlyNetUsd = Number(((simValorUsd / (simHours || 24)) * 24 * 30).toFixed(2));
  const simMonthlyNetPrl = Number(((simProduccionNeta / (simHours || 24)) * 24 * 30).toFixed(4));
  
  // Costo base referencial aproximado del contrato
  const estimatedContractCostUsd = simTh * 9.60;
  const simAnnualRoiPct = estimatedContractCostUsd > 0 ? ((simMonthlyNetUsd * 12) / estimatedContractCostUsd) * 100 : 89.6;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* 1. HEADER SECTION & SYNC BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Motor Híbrido & Cálculo de Rentabilidad (Profit Engine)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30">
              v{config.configurationVersion} Activo
            </span>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Modelo unificado de producción minera, ajuste de margen por paquete y retención operativa.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              const canonical = engine.resetToOfficialCanonical();
              setConfig(canonical);
              setSimVariablePct(canonical.globalVariablePct);
              setSimCommissionPct(canonical.globalCommissionPct);
              setSyncStatus('Valores canónicos oficiales restaurados: R_base = 0.0008432 PRL/TH/h • Spot PRL = $1.47 USD.');
              setTimeout(() => setSyncStatus(null), 4000);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
              isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
            title="Restablecer la fórmula canónica de Kryptex"
          >
            <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
            <span>Restablecer Oficial</span>
          </button>

          <button
            type="button"
            onClick={() => handleSyncKryptexRates(false)}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs font-mono font-bold bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 active:scale-[0.97] transition-all cursor-pointer shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Kryptex'}</span>
          </button>

          {saveSuccess && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold animate-in fade-in">
              <Check className="h-4 w-4" />
              <span>Guardado</span>
            </div>
          )}
        </div>
      </div>

      {syncStatus && (
        <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs flex items-center gap-2 animate-in fade-in">
          <Info className="h-4 w-4 shrink-0 text-cyan-400" />
          <span>{syncStatus}</span>
        </div>
      )}

      {/* 2. PIPELINE MATEMÁTICO EN 5 PASOS CLAROS (ESTILO FLOTA TAB) */}
      <div className={`p-5 rounded-2xl border transition-all ${
        isDarkTheme
          ? 'bg-[#0A0E17]/90 border-white/[0.08] text-white shadow-xl'
          : 'bg-white border-slate-200 text-slate-900 shadow-sm'
      }`}>
        <div className={`flex items-center justify-between pb-3 mb-4 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#05DF72]" />
            <h3 className={`text-xs font-mono font-bold uppercase tracking-wider ${isDarkTheme ? 'text-slate-300' : 'text-slate-800'}`}>
              Desglose Matemático Unificado: De la Pool al Cliente
            </h3>
          </div>
          <span className={`text-[10px] font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Fórmula: P_neta = TH/s × R_base × (1 + Var%) × (1 - Com%) × Horas
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* PASO 1 */}
          <div className={`p-3.5 rounded-xl border relative ${
            isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'
          }`}>
            <span className={`text-[9px] font-mono font-bold block mb-1 ${isDarkTheme ? 'text-cyan-400' : 'text-cyan-700'}`}>PASO 1 · PRECIO SPOT</span>
            <div className={`text-base font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              ${config.prlPriceUsd.toFixed(2)} USD
            </div>
            <p className={`text-[10px] font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              Kryptex Public API (PEARL)
            </p>
          </div>

          {/* PASO 2 */}
          <div className={`p-3.5 rounded-xl border relative ${
            isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'
          }`}>
            <span className={`text-[9px] font-mono font-bold block mb-1 ${isDarkTheme ? 'text-[#05DF72]' : 'text-emerald-700'}`}>PASO 2 · TASA R_BASE</span>
            <div className={`text-base font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              {simBaseRate.toFixed(6)}
            </div>
            <p className={`text-[10px] font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              PRL por cada 1 TH/s en 1 hora
            </p>
          </div>

          {/* PASO 3 */}
          <div className={`p-3.5 rounded-xl border relative ${
            isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'
          }`}>
            <span className={`text-[9px] font-mono font-bold block mb-1 ${isDarkTheme ? 'text-amber-400' : 'text-amber-700'}`}>PASO 3 · MARGEN VARIABLE</span>
            <div className={`text-base font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              {simVariablePct >= 0 ? `+${simVariablePct}%` : `${simVariablePct}%`}
            </div>
            <p className={`text-[10px] font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              Bonificación comercial por paquete
            </p>
          </div>

          {/* PASO 4 */}
          <div className={`p-3.5 rounded-xl border relative ${
            isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'
          }`}>
            <span className={`text-[9px] font-mono font-bold block mb-1 ${isDarkTheme ? 'text-rose-400' : 'text-rose-700'}`}>PASO 4 · RETENCIÓN OP.</span>
            <div className={`text-base font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              -{simCommissionPct}%
            </div>
            <p className={`text-[10px] font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              Comisión por hosting y soporte
            </p>
          </div>

          {/* PASO 5 */}
          <div className={`p-3.5 rounded-xl border relative ${
            isDarkTheme ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'
          }`}>
            <span className={`text-[9px] font-mono font-bold block mb-1 ${isDarkTheme ? 'text-emerald-400' : 'text-emerald-700'}`}>PASO 5 · NETO 48 TH/s</span>
            <div className="text-base font-mono font-bold text-emerald-500">
              0.9519 PRL/d
            </div>
            <p className={`text-[10px] font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              ≈ $1.40 USD/día ($41.97/mes)
            </p>
          </div>
        </div>
      </div>

      {/* 3. DOS COLUMNAS: PARÁMETROS GLOBALES (IZQ) Y SIMULADOR EN VIVO (DER) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* COLUMNA IZQUIERDA: CONFIGURACIÓN GLOBAL */}
        <div
          className={`p-6 rounded-2xl border transition-all ${
            isDarkTheme
              ? 'bg-[#0E1320]/80 border-white/[0.08] text-white shadow-lg'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'} mb-4`}>
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-[#05DF72]" />
              <h3 className={`text-xs font-mono font-bold uppercase tracking-wider ${isDarkTheme ? 'text-slate-200' : 'text-slate-900'}`}>
                Parámetros Globales del Motor
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('Estándar', 0, 2)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                  isDarkTheme ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Estándar (0% / 2%)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('Promo', 5, 1.5)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                  isDarkTheme ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Promo (+5% / 1.5%)
              </button>
            </div>
          </div>

          <form onSubmit={handleSaveGlobal} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Fuente Tasa Base */}
              <div>
                <label className={`block text-xs font-mono mb-1.5 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  Fuente de Tasa Base (R_base)
                </label>
                <select
                  value={config.baseRateSource}
                  onChange={(e) => setConfig({ ...config, baseRateSource: e.target.value as any })}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono font-bold border focus:outline-none focus:border-[#05DF72] ${
                    isDarkTheme ? 'bg-[#060912] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="KRYPTEX_POOL">Kryptex Pool Observada (Automática)</option>
                  <option value="MANUAL_OVERRIDE">Manual Override (Valor Fijo)</option>
                </select>
              </div>

              {/* Tasa Base Manual */}
              <div>
                <label className={`block text-xs font-mono mb-1.5 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  Tasa Base R_base (PRL/TH/h)
                </label>
                <input
                  type="number"
                  step="0.0000001"
                  min="0"
                  value={simBaseRate}
                  onChange={(e) => setConfig({ ...config, manualBaseRatePrlPerThsHour: parseFloat(e.target.value) || 0.0008432 })}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono font-bold border focus:outline-none focus:border-[#05DF72] ${
                    isDarkTheme ? 'bg-[#060912] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              {/* Variable Porcentual Global */}
              <div>
                <label className={`block text-xs font-mono mb-1.5 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  Variable Porcentual Global (+/- %)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    value={simVariablePct}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setSimVariablePct(val);
                      setConfig({ ...config, globalVariablePct: val });
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono font-bold border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#060912] border-white/10 text-[#05DF72]' : 'bg-slate-50 border-slate-300 text-emerald-700'
                    }`}
                  />
                  <span className={`absolute right-3 top-2.5 text-xs font-mono font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>%</span>
                </div>
              </div>

              {/* Comisión Operativa Global */}
              <div>
                <label className={`block text-xs font-mono mb-1.5 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  Comisión Operativa Global (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="50"
                    value={simCommissionPct}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setSimCommissionPct(val);
                      setConfig({ ...config, globalCommissionPct: val });
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono font-bold border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#060912] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                  <span className={`absolute right-3 top-2.5 text-xs font-mono font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>%</span>
                </div>
              </div>

              {/* Precio Spot PRL */}
              <div>
                <label className={`block text-xs font-mono mb-1.5 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  Precio Spot PEARL (USD)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={config.prlPriceUsd}
                    onChange={(e) => setConfig({ ...config, prlPriceUsd: parseFloat(e.target.value) || 1.47 })}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono font-bold border focus:outline-none focus:border-[#05DF72] ${
                      isDarkTheme ? 'bg-[#060912] border-white/10 text-cyan-400' : 'bg-slate-50 border-slate-300 text-cyan-700'
                    }`}
                  />
                  <span className={`absolute right-3 top-2.5 text-xs font-mono font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>USD</span>
                </div>
              </div>

              {/* Estado Operativo */}
              <div>
                <label className={`block text-xs font-mono mb-1.5 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                  Estado Operativo del Motor
                </label>
                <select
                  value={config.engineStatus}
                  onChange={(e) => setConfig({ ...config, engineStatus: e.target.value as any })}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono font-bold border focus:outline-none focus:border-[#05DF72] ${
                    isDarkTheme ? 'bg-[#060912] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="ACTIVE">ACTIVE — Normal Automático</option>
                  <option value="PAUSED">PAUSED — En Pausa</option>
                  <option value="MANUAL_MODE">MANUAL_MODE — Parámetros Fijos</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#05DF72] text-slate-950 font-mono text-xs font-bold hover:bg-[#04C965] active:scale-[0.97] transition-all cursor-pointer shadow-sm"
              >
                <Save className="h-4 w-4" />
                Guardar y Versionar Parámetros
              </button>
            </div>
          </form>
        </div>

        {/* COLUMNA DERECHA: SIMULADOR INTERACTIVO */}
        <div
          className={`p-6 rounded-2xl border flex flex-col justify-between transition-all ${
            isDarkTheme
              ? 'bg-[#0E1320]/80 border-white/[0.08] text-white shadow-lg'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div>
            <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'} mb-4`}>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#05DF72]" />
                <h3 className={`text-xs font-mono font-bold uppercase tracking-wider ${isDarkTheme ? 'text-slate-200' : 'text-slate-900'}`}>
                  Simulador de Fórmula en Tiempo Real
                </h3>
              </div>
              <span className={`text-xs font-mono font-bold ${isDarkTheme ? 'text-cyan-400' : 'text-cyan-700'}`}>{simTh} TH/s</span>
            </div>

            {/* Slider de Potencia */}
            <div className="space-y-3 mb-4">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-semibold'}>Potencia de Simulación:</span>
                  <span className="font-bold text-[#05DF72]">{simTh} TH/s</span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="384"
                  step="4"
                  value={simTh}
                  onChange={(e) => setSimTh(parseInt(e.target.value) || 48)}
                  className="w-full accent-[#05DF72] cursor-pointer"
                />
              </div>

              {/* Chips Rápidos de Paquetes Mineros (Cargados en tiempo real desde el Constructor) */}
              <div className="space-y-1.5">
                <span className={`text-[10px] font-mono block ${isDarkTheme ? 'text-slate-400' : 'text-slate-500 font-semibold'}`}>
                  Paquetes Comerciales Enlazados ({packages.length}):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {packages.map((pkg) => {
                    const isSelected = selectedPkgId === pkg.id || (!selectedPkgId && simTh === pkg.powerTh);
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => {
                          setSelectedPkgId(pkg.id);
                          setSimTh(pkg.powerTh);
                          setSimVariablePct(pkg.variablePct ?? config.globalVariablePct);
                          setSimCommissionPct(pkg.commissionPct ?? config.globalCommissionPct);
                        }}
                        className={`py-1.5 px-2.5 rounded-xl border text-[10px] font-mono font-bold transition-all text-center cursor-pointer active:scale-95 ${
                          isSelected
                            ? 'bg-[#05DF72] text-slate-950 border-[#05DF72] shadow-sm'
                            : isDarkTheme
                            ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                            : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                        }`}
                        title={`${pkg.name} — ${pkg.powerTh} TH/s | Var: +${pkg.variablePct ?? 0}% | Com: ${pkg.commissionPct ?? 2}%`}
                      >
                        <div className="text-[11px]">{pkg.powerTh} TH/s</div>
                        <div className="text-[9px] opacity-80 truncate max-w-[95px]">{pkg.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Banner de Paquete Seleccionado */}
              {(() => {
                const activePkg = packages.find(p => p.id === selectedPkgId || (!selectedPkgId && p.powerTh === simTh));
                if (!activePkg) return null;
                return (
                  <div className={`p-2 rounded-xl border text-[11px] font-mono flex items-center justify-between ${
                    isDarkTheme ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300' : 'bg-cyan-50 border-cyan-200 text-cyan-800'
                  }`}>
                    <span className="font-bold flex items-center gap-1 truncate max-w-[200px]">
                      ⚡ {activePkg.name}
                    </span>
                    <span className="shrink-0 text-[10px]">
                      Var: <strong>+{activePkg.variablePct ?? config.globalVariablePct}%</strong> · Com: <strong>-{activePkg.commissionPct ?? config.globalCommissionPct}%</strong>
                    </span>
                  </div>
                );
              })()}

              {/* Selector de Horas */}
              <div className="flex items-center justify-between text-xs font-mono pt-1">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-semibold'}>Ventana Temporal:</span>
                <div className="flex gap-1.5">
                  {[
                    { hrs: 24, label: '24 horas' },
                    { hrs: 168, label: '7 días' },
                    { hrs: 720, label: '30 días' }
                  ].map(({ hrs, label }) => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => setSimHours(hrs)}
                      className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold transition-all cursor-pointer ${
                        simHours === hrs
                          ? (isDarkTheme ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' : 'bg-cyan-100 text-cyan-900 border-cyan-300')
                          : isDarkTheme ? 'bg-white/5 border-white/5 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Desglose Matemático */}
            <div className={`p-4 rounded-xl border space-y-2 font-mono text-xs ${
              isDarkTheme ? 'bg-[#060912] border-white/5' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex justify-between">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>1. Producción Base Bruta:</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{simProduccionBase} PRL</span>
              </div>
              <div className="flex justify-between">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>2. Margen Variable ({simVariablePct}%):</span>
                <span className="text-[#05DF72] font-semibold">{simProduccionAjustada} PRL</span>
              </div>
              <div className="flex justify-between">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>3. Comisión Operativa ({simCommissionPct}%):</span>
                <span className="text-rose-500 font-semibold">-{simFeePrl} PRL</span>
              </div>
              
              <div className={`pt-2 border-t flex justify-between font-bold text-sm ${
                isDarkTheme ? 'border-white/10' : 'border-slate-200'
              }`}>
                <span className="text-emerald-500">Producción Neta al Cliente:</span>
                <span className="text-emerald-500">{simProduccionNeta} PRL</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}>Valor Equivalente USD ({simHours}h):</span>
                <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>${simValorUsd} USD</span>
              </div>
              <div className={`flex justify-between text-xs pt-1 border-t ${isDarkTheme ? 'border-white/5 text-cyan-400' : 'border-slate-200 text-cyan-700'} font-bold`}>
                <span>Proyección Mensual (30d):</span>
                <span>{simMonthlyNetPrl} PRL (${simMonthlyNetUsd} USD)</span>
              </div>
            </div>
          </div>

          <div className={`mt-4 flex items-center justify-between text-[11px] font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
            <span>ROI Anual Estimado: <strong className="text-[#05DF72]">+{simAnnualRoiPct.toFixed(1)}% / año</strong></span>
            <span>Tasa PPS Verificada</span>
          </div>
        </div>
      </div>

      {/* 4. TABLA DE JERARQUÍA COMERCIAL: VARIABLES POR PAQUETE (ESTILO FLOTA) */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isDarkTheme
            ? 'bg-[#0A0E17]/90 border-white/[0.08] text-white shadow-xl'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'} mb-4`}>
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-400" />
            <h3 className={`text-xs font-mono font-bold uppercase tracking-wider ${isDarkTheme ? 'text-slate-200' : 'text-slate-900'}`}>
              Jerarquía Comercial: Variables Específicas por Paquete
            </h3>
          </div>
          <span className={`text-xs font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Hereda parámetros globales cuando no está configurado
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className={`border-b text-[11px] ${
                isDarkTheme ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-700 font-bold'
              }`}>
                <th className="py-3 px-3">PAQUETE COMERCIAL</th>
                <th className="py-3 px-3">POTENCIA TH/S</th>
                <th className="py-3 px-3">VARIABLE %</th>
                <th className="py-3 px-3">COMISIÓN %</th>
                <th className="py-3 px-3">PROD. NETA / DÍA</th>
                <th className="py-3 px-3">VALOR USD / DÍA</th>
                <th className="py-3 px-3">ESTADO</th>
                <th className="py-3 px-3 text-right">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkTheme ? 'divide-white/5' : 'divide-slate-100'}`}>
              {packages.map((pkg) => {
                const varPct = pkg.variablePct ?? config.globalVariablePct;
                const commPct = pkg.commissionPct ?? config.globalCommissionPct;
                const baseP = pkg.powerTh * simBaseRate * 24;
                const adjP = baseP * (1 + varPct / 100);
                const feeP = (adjP * commPct) / 100;
                const netP = Number((adjP - feeP).toFixed(4));
                const netUsd = Number((netP * config.prlPriceUsd).toFixed(2));

                return (
                  <tr key={pkg.id} className={`transition-colors ${
                    isDarkTheme ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'
                  }`}>
                    <td className={`py-3 px-3 font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                      {pkg.name}
                    </td>
                    <td className="py-3 px-3 text-[#05DF72] font-bold">{pkg.powerTh} TH/s</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.5"
                          defaultValue={pkg.variablePct ?? 0}
                          id={`var-${pkg.id}`}
                          className={`w-16 px-2 py-1 rounded-lg text-xs font-mono font-bold border focus:outline-none focus:border-[#05DF72] ${
                            isDarkTheme ? 'bg-[#060912] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                          }`}
                        />
                        <span className={`text-xs font-mono font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>%</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.1"
                          defaultValue={pkg.commissionPct ?? 2}
                          id={`comm-${pkg.id}`}
                          className={`w-16 px-2 py-1 rounded-lg text-xs font-mono font-bold border focus:outline-none focus:border-[#05DF72] ${
                            isDarkTheme ? 'bg-[#060912] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                          }`}
                        />
                        <span className={`text-xs font-mono font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>%</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[#05DF72] font-bold">
                      {netP} PRL/d
                    </td>
                    <td className={`py-3 px-3 font-bold ${isDarkTheme ? 'text-cyan-400' : 'text-cyan-700'}`}>
                      ${netUsd} USD/d
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        ACTIVO
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => {
                          const vInput = document.getElementById(`var-${pkg.id}`) as HTMLInputElement;
                          const cInput = document.getElementById(`comm-${pkg.id}`) as HTMLInputElement;
                          handleUpdatePackageVariable(pkg.id, parseFloat(vInput.value) || 0, parseFloat(cInput.value) || 0);
                        }}
                        className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
                          isDarkTheme
                            ? 'bg-white/5 hover:bg-[#05DF72]/20 hover:text-[#05DF72] border-white/10 text-slate-300'
                            : 'bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border-slate-300 text-slate-800 shadow-xs'
                        }`}
                      >
                        Actualizar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
