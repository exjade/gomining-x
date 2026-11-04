/**
 * MINERX PROFIT ENGINE — UNIFIED PRODUCTION, PROFIT AND ROI DOMAIN SERVICE
 *
 * Implements 100% of the specification in:
 * "MINERX — MODELO UNIFICADO DE CÁLCULO DE PRODUCCIÓN, PROFIT Y ROI.md"
 */

import { AdminAuditService } from './adminAuditService';
import { CommercialPackageService } from './commercialPackageService';
import { BASELINE_USD_PER_THS_HOUR } from '../../data/gpuBenchmarks';
import { apiFetch } from '../../utils/apiConfig';
import type {
  ProfitEngineGlobalConfig,
  MinerConfiguration,
  ContractProfitConfig,
  ResolvedContractParameters,
  RateObservation,
  ContractProductionResult,
  ProfitRoiSummary,
  ProcessedPeriod,
  TelemetryQualityStatus,
  DataProvenance,
  AdminUser
} from '../../types/admin';

const STORAGE_GLOBAL_KEY = 'minerx_profit_engine_global_v5';
const STORAGE_PACKAGES_KEY = 'minerx_profit_engine_packages_v3';
const STORAGE_CUSTOM_KEY = 'minerx_profit_engine_custom_miners_v2';
const STORAGE_CONTRACTS_KEY = 'minerx_profit_engine_contracts_v2';
const STORAGE_PERIODS_KEY = 'minerx_profit_engine_processed_periods_v2';

// Precio spot real de mercado de Pearl (PRL) en Kryptex: $1.47 USD (verificable en https://pool.kryptex.com/api/v1/rates)
export const REAL_KRYPTEX_PRL_PRICE_USD = 1.47;

// Tasa Base Real de rendimiento por TH/s: Derivada directamente del benchmark de la Flota Kryptex ($0.0012395 USD/TH/h)
// 0.0012395 USD / 1.47 USD = 0.000843197 PRL / TH/s / hora (~0.020236 PRL por TH/s al día)
export const REAL_KRYPTEX_BASE_RATE_PRL_HOUR = Number((BASELINE_USD_PER_THS_HOUR / REAL_KRYPTEX_PRL_PRICE_USD).toFixed(7));

export const DEFAULT_GLOBAL_CONFIG: ProfitEngineGlobalConfig = {
  engineStatus: 'ACTIVE',
  calculationMode: 'AUTOMATIC',
  baseRateSource: 'POOL_OBSERVED',
  manualBaseRatePrlPerThsHour: REAL_KRYPTEX_BASE_RATE_PRL_HOUR,
  globalVariablePct: 0.0,
  globalCommissionPct: 2.0, // 2% de comisión base
  prlPriceUsd: REAL_KRYPTEX_PRL_PRICE_USD,
  prlPriceSource: 'KRYPTEX_PUBLIC',
  prlManualOverridePrice: null,
  staleDataThresholdMinutes: 15,
  calculationWindowHours: 24,
  roundingDecimals: 6,
  configurationVersion: 1,
  lastSyncTimestamp: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  updatedBy: 'system@minerx.cloud'
};

export const INITIAL_PACKAGES_CONFIG: MinerConfiguration[] = [
  {
    id: 'pkg_miner_1',
    name: 'Minero 1 (48 TH/s)',
    type: 'PACKAGE',
    powerTh: 48,
    variablePct: 0.0,
    commissionPct: 2.0,
    enabled: true,
    applicableCostsUsdPerHour: 0.0,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system@minerx.cloud'
  },
  {
    id: 'pkg_miner_2',
    name: 'Minero 2 (64 TH/s)',
    type: 'PACKAGE',
    powerTh: 64,
    variablePct: 2.5,
    commissionPct: 2.0,
    enabled: true,
    applicableCostsUsdPerHour: 0.0,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system@minerx.cloud'
  },
  {
    id: 'pkg_miner_3',
    name: 'Minero 3 (96 TH/s)',
    type: 'PACKAGE',
    powerTh: 96,
    variablePct: 5.0,
    commissionPct: 1.8,
    enabled: true,
    applicableCostsUsdPerHour: 0.0,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system@minerx.cloud'
  },
  {
    id: 'pkg_miner_4',
    name: 'Minero 4 (128 TH/s)',
    type: 'PACKAGE',
    powerTh: 128,
    variablePct: 7.5,
    commissionPct: 1.5,
    enabled: true,
    applicableCostsUsdPerHour: 0.0,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system@minerx.cloud'
  },
  {
    id: 'pkg_miner_5',
    name: 'Minero 5 Enterprise (192 TH/s)',
    type: 'PACKAGE',
    powerTh: 192,
    variablePct: 10.0,
    commissionPct: 1.0,
    enabled: true,
    applicableCostsUsdPerHour: 0.0,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system@minerx.cloud'
  }
];

export class MinerxProfitEngine {
  private static instance: MinerxProfitEngine;
  private auditService: AdminAuditService;

  private constructor() {
    this.auditService = AdminAuditService.getInstance();
  }

  public static getInstance(): MinerxProfitEngine {
    if (!MinerxProfitEngine.instance) {
      MinerxProfitEngine.instance = new MinerxProfitEngine();
    }
    return MinerxProfitEngine.instance;
  }

  // --- 1. CONFIGURACIÓN GLOBAL ---
  public getGlobalConfig(): ProfitEngineGlobalConfig {
    try {
      const raw = localStorage.getItem(STORAGE_GLOBAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Migración y saneamiento: Si la tasa base guardada es anormalmente alta (ej. 0.005) o el precio es obsoleto (< 0.10)
        const isAbnormalRate = !parsed.manualBaseRatePrlPerThsHour || parsed.manualBaseRatePrlPerThsHour > 0.002 || Math.abs(parsed.manualBaseRatePrlPerThsHour - 0.005) < 0.0001;
        const isAbnormalPrice = !parsed.prlPriceUsd || parsed.prlPriceUsd < 0.10 || parsed.prlPriceUsd > 20;

        if (isAbnormalRate || isAbnormalPrice) {
          const migrated: ProfitEngineGlobalConfig = {
            ...DEFAULT_GLOBAL_CONFIG,
            ...parsed,
            prlPriceUsd: isAbnormalPrice ? REAL_KRYPTEX_PRL_PRICE_USD : parsed.prlPriceUsd,
            manualBaseRatePrlPerThsHour: isAbnormalRate ? REAL_KRYPTEX_BASE_RATE_PRL_HOUR : parsed.manualBaseRatePrlPerThsHour
          };
          localStorage.setItem(STORAGE_GLOBAL_KEY, JSON.stringify(migrated));
          return migrated;
        }
        return { ...DEFAULT_GLOBAL_CONFIG, ...parsed };
      }
    } catch {
      // fallback
    }
    return { ...DEFAULT_GLOBAL_CONFIG };
  }

  /**
   * Restaura la configuración a los parámetros matemáticos oficiales de Kryptex y elimina cualquier valor mock obsoleto
   */
  public resetToOfficialCanonical(): ProfitEngineGlobalConfig {
    try {
      localStorage.removeItem(STORAGE_GLOBAL_KEY);
      localStorage.removeItem('minerx_profit_engine_global_v4');
      localStorage.removeItem('minerx_profit_engine_global_v3');
      localStorage.removeItem('minerx_profit_engine_global_v2');
      localStorage.removeItem('minerx_profit_engine_global');
      localStorage.setItem(STORAGE_GLOBAL_KEY, JSON.stringify(DEFAULT_GLOBAL_CONFIG));
    } catch {
      // ignore
    }
    return { ...DEFAULT_GLOBAL_CONFIG };
  }

  /**
   * Conecta y sincroniza el Motor Híbrido directamente con la telemetría viva de la sección Flota.
   * Recibe el precio real de PRL, información de pool y workers observados para alinear en tiempo real.
   */
  public syncFromFleetTelemetry(params: {
    prlPriceUsd?: number;
    poolInfo?: any;
    totalFleetHashrateThs?: number;
  }): ProfitEngineGlobalConfig {
    const current = this.getGlobalConfig();
    const livePrl = params.prlPriceUsd && params.prlPriceUsd > 0.05 && params.prlPriceUsd < 50
      ? params.prlPriceUsd
      : current.prlPriceUsd;

    // Calcular tasa base real en PRL por TH/s por hora basada en la rentabilidad viva
    const updatedBaseRate = Number((BASELINE_USD_PER_THS_HOUR / livePrl).toFixed(7));

    const updated = this.updateGlobalConfig({
      prlPriceUsd: livePrl,
      manualBaseRatePrlPerThsHour: updatedBaseRate,
      lastSyncTimestamp: new Date().toISOString()
    }, undefined, 'Sincronización automática con telemetría de Flota MinerX');

    return updated;
  }

  /**
   * Sincroniza en tiempo real el precio de PRL y la tasa base contra la API pública de Kryptex
   */
  public async syncLiveKryptexRates(): Promise<{ prlPriceUsd: number; baseRate: number; success: boolean }> {
    try {
      // 1. Intentar /api/kryptex/rates (analizando todas las variantes de esquema JSON de Kryptex)
      const res = await apiFetch('/api/kryptex/rates');
      if (res.ok) {
        const data = await res.json();
        const extracted = Number(
          data?.crypto?.PRL ??
          data?.crypto?.prl ??
          data?.rates?.crypto?.PRL ??
          data?.rates?.crypto?.prl ??
          data?.PRL ??
          data?.prl ??
          data?.rates?.PRL ??
          0
        );

        if (extracted > 0.05 && extracted < 50) {
          const baseRate = Number((BASELINE_USD_PER_THS_HOUR / extracted).toFixed(7));
          const updated = this.updateGlobalConfig({
            prlPriceUsd: extracted,
            manualBaseRatePrlPerThsHour: baseRate,
            lastSyncTimestamp: new Date().toISOString()
          }, undefined, 'Sincronización en vivo con API Kryptex Rates');
          return { prlPriceUsd: updated.prlPriceUsd, baseRate: updated.manualBaseRatePrlPerThsHour, success: true };
        }
      }

      // 2. Intentar /api/kryptex/daily-revenue (vía cálculo de cotización exacta de Kryptex)
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
              const baseRate = Number((coins / 24).toFixed(7));
              const updated = this.updateGlobalConfig({
                prlPriceUsd: calculatedPrice,
                manualBaseRatePrlPerThsHour: baseRate,
                lastSyncTimestamp: new Date().toISOString()
              }, undefined, 'Sincronización en vivo con Kryptex Daily Revenue');
              return { prlPriceUsd: updated.prlPriceUsd, baseRate: updated.manualBaseRatePrlPerThsHour, success: true };
            }
          }
        }
      } catch {}

      // 3. Intentar /api/kryptex/pool?coin=prl
      try {
        const poolRes = await apiFetch('/api/kryptex/pool?coin=prl');
        if (poolRes.ok) {
          const pData = await poolRes.json();
          const pPrice = Number(pData?.usd_rate || pData?.price || pData?.prices?.usd || 0);
          if (pPrice > 0.05 && pPrice < 50) {
            const baseRate = Number((BASELINE_USD_PER_THS_HOUR / pPrice).toFixed(7));
            const updated = this.updateGlobalConfig({
              prlPriceUsd: pPrice,
              manualBaseRatePrlPerThsHour: baseRate,
              lastSyncTimestamp: new Date().toISOString()
            }, undefined, 'Sincronización en vivo con Kryptex Pool Info');
            return { prlPriceUsd: updated.prlPriceUsd, baseRate: updated.manualBaseRatePrlPerThsHour, success: true };
          }
        }
      } catch {}
    } catch (err) {
      console.warn('[MinerxProfitEngine] Error durante sincronización con API Kryptex:', err);
    }

    const curr = this.getGlobalConfig();
    return { prlPriceUsd: curr.prlPriceUsd, baseRate: curr.manualBaseRatePrlPerThsHour, success: false };
  }

  public updateGlobalConfig(
    partial: Partial<ProfitEngineGlobalConfig>,
    actor?: AdminUser,
    reason = 'Actualización administrativa'
  ): ProfitEngineGlobalConfig {
    const current = this.getGlobalConfig();
    const updated: ProfitEngineGlobalConfig = {
      ...current,
      ...partial,
      configurationVersion: current.configurationVersion + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actor ? `${actor.displayName} (${actor.email})` : 'admin@minerx.cloud'
    };

    localStorage.setItem(STORAGE_GLOBAL_KEY, JSON.stringify(updated));

    this.auditService.logAction(
      actor?.uid || 'admin_sys',
      actor?.email || 'admin@minerx.cloud',
      actor?.role || 'SUPER_ADMIN',
      'MINING_ENGINE',
      'UPDATE_GLOBAL_PROFIT_CONFIG',
      'global_config',
      { previous: current, updated, reason }
    );

    return updated;
  }

  // --- 2. CONFIGURACIÓN DE PAQUETES Y MINERS PERSONALIZADOS ---
  public getPackagesConfig(): MinerConfiguration[] {
    try {
      const commercialService = CommercialPackageService.getInstance();
      const commercialPackages = commercialService.getPackages();
      if (commercialPackages && commercialPackages.length > 0) {
        return commercialPackages.map((cp) => ({
          id: cp.id,
          name: cp.name,
          type: 'PACKAGE',
          powerTh: cp.powerTh,
          variablePct: cp.variablePct,
          commissionPct: cp.commissionPct,
          enabled: cp.status === 'ACTIVE',
          applicableCostsUsdPerHour: 0.0,
          updatedAt: cp.updatedAt,
          updatedBy: 'system@minerx.cloud'
        }));
      }

      const raw = localStorage.getItem(STORAGE_PACKAGES_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return INITIAL_PACKAGES_CONFIG;
  }

  public updatePackageConfig(
    config: MinerConfiguration,
    actor?: AdminUser,
    reason = 'Ajuste de variable de paquete'
  ): void {
    // Sincronizar bidireccionalmente con CommercialPackageService
    try {
      const commercialService = CommercialPackageService.getInstance();
      commercialService.updatePackageVariables(config.id, config.variablePct ?? 0, config.commissionPct ?? 2);
    } catch {}

    const packages = this.getPackagesConfig();
    const idx = packages.findIndex((p) => p.id === config.id || p.id.replace(/-/g, '_') === config.id.replace(/-/g, '_'));
    const prev = idx >= 0 ? packages[idx] : null;

    if (idx >= 0) {
      packages[idx] = { ...config, updatedAt: new Date().toISOString() };
    } else {
      packages.push({ ...config, updatedAt: new Date().toISOString() });
    }

    localStorage.setItem(STORAGE_PACKAGES_KEY, JSON.stringify(packages));

    this.auditService.logAction(
      actor?.uid || 'admin_sys',
      actor?.email || 'admin@minerx.cloud',
      actor?.role || 'SUPER_ADMIN',
      'COMMERCIAL',
      'UPDATE_PACKAGE_VARIABLE',
      config.id,
      { previous: prev, updated: config, reason }
    );
  }

  public getCustomMinersConfig(): MinerConfiguration[] {
    try {
      const raw = localStorage.getItem(STORAGE_CUSTOM_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }

  public saveCustomMinerConfig(
    config: MinerConfiguration,
    actor?: AdminUser,
    reason = 'Alta o modificación de miner personalizado'
  ): void {
    const custom = this.getCustomMinersConfig();
    const idx = custom.findIndex((c) => c.id === config.id);
    const prev = idx >= 0 ? custom[idx] : null;

    if (idx >= 0) {
      custom[idx] = { ...config, updatedAt: new Date().toISOString() };
    } else {
      custom.push({ ...config, updatedAt: new Date().toISOString() });
    }

    localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(custom));

    this.auditService.logAction(
      actor?.uid || 'admin_sys',
      actor?.email || 'admin@minerx.cloud',
      actor?.role || 'SUPER_ADMIN',
      'MINING_ENGINE',
      'SAVE_CUSTOM_MINER_VARIABLE',
      config.id,
      { previous: prev, updated: config, reason }
    );
  }

  // --- 3. CONFIGURACIÓN INDIVIDUAL DE CONTRATOS ---
  public getContractProfitConfigs(): Record<string, ContractProfitConfig> {
    try {
      const raw = localStorage.getItem(STORAGE_CONTRACTS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  public setContractProfitConfig(
    config: ContractProfitConfig,
    actor?: AdminUser,
    reason = 'Ajuste contractual individual'
  ): void {
    const all = this.getContractProfitConfigs();
    const prev = all[config.contractId] || null;
    all[config.contractId] = { ...config, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_CONTRACTS_KEY, JSON.stringify(all));

    this.auditService.logAction(
      actor?.uid || 'admin_sys',
      actor?.email || 'admin@minerx.cloud',
      actor?.role || 'SUPER_ADMIN',
      'ALLOCATION',
      'SET_CONTRACT_PROFIT_CONFIG',
      config.contractId,
      { previous: prev, updated: config, reason }
    );
  }

  // --- 4. JERARQUÍA DE RESOLUCIÓN DE PARÁMETROS (Sección 6.3 del Blueprint) ---
  public resolveEffectiveParameters(
    contractId?: string,
    customMinerId?: string,
    packageId?: string
  ): ResolvedContractParameters {
    const globalConfig = this.getGlobalConfig();
    const contractConfigs = this.getContractProfitConfigs();
    const contract = contractId ? contractConfigs[contractId] : null;

    const customMiners = this.getCustomMinersConfig();
    const custom = customMinerId ? customMiners.find((c) => c.id === customMinerId) : null;

    const packages = this.getPackagesConfig();
    const pkg = packageId ? packages.find((p) => p.id === packageId || p.id.replace(/-/g, '_') === packageId.replace(/-/g, '_')) : null;

    // 1. Variable % (Prioridad: Contrato -> Custom Miner -> Paquete -> Global)
    let effectiveVariablePct = globalConfig.globalVariablePct;
    let variableSource: ResolvedContractParameters['variableSource'] = 'GLOBAL';

    if (contract && contract.enabled && contract.variablePct !== undefined) {
      effectiveVariablePct = contract.variablePct;
      variableSource = 'CONTRACT';
    } else if (custom && custom.enabled && custom.variablePct !== undefined) {
      effectiveVariablePct = custom.variablePct;
      variableSource = 'CUSTOM_MINER';
    } else if (pkg && pkg.enabled && pkg.variablePct !== undefined) {
      effectiveVariablePct = pkg.variablePct;
      variableSource = 'PACKAGE';
    }

    // 2. Comisión % (Prioridad: Contrato -> Custom Miner -> Paquete -> Global)
    let effectiveCommissionPct = globalConfig.globalCommissionPct;
    let commissionSource: ResolvedContractParameters['commissionSource'] = 'GLOBAL';

    if (contract && contract.enabled && contract.commissionPct !== undefined) {
      effectiveCommissionPct = contract.commissionPct;
      commissionSource = 'CONTRACT';
    } else if (custom && custom.enabled && custom.commissionPct !== undefined) {
      effectiveCommissionPct = custom.commissionPct;
      commissionSource = 'CUSTOM_MINER';
    } else if (pkg && pkg.enabled && pkg.commissionPct !== undefined) {
      effectiveCommissionPct = pkg.commissionPct;
      commissionSource = 'PACKAGE';
    }

    // 3. Costos Operativos por hora (Prioridad: Contrato -> Custom Miner -> Paquete -> Global)
    let effectiveCostsUsdPerHour = 0.0;
    let costsSource: ResolvedContractParameters['costsSource'] = 'GLOBAL';

    if (contract && contract.enabled && contract.applicableCostsUsdPerHour !== undefined) {
      effectiveCostsUsdPerHour = contract.applicableCostsUsdPerHour;
      costsSource = 'CONTRACT';
    } else if (custom && custom.enabled && custom.applicableCostsUsdPerHour !== undefined) {
      effectiveCostsUsdPerHour = custom.applicableCostsUsdPerHour;
      costsSource = 'CUSTOM_MINER';
    } else if (pkg && pkg.enabled && pkg.applicableCostsUsdPerHour !== undefined) {
      effectiveCostsUsdPerHour = pkg.applicableCostsUsdPerHour;
      costsSource = 'PACKAGE';
    }

    return {
      effectiveVariablePct,
      effectiveCommissionPct,
      effectiveCostsUsdPerHour,
      variableSource,
      commissionSource,
      costsSource
    };
  }

  // --- 5. CÁLCULO DE LA TASA REAL OBSERVADA (Sección 4 del Blueprint) ---
  public calculateObservedRate(
    observedRewardPrl: number,
    averageHashrateThs: number,
    periodHours: number
  ): RateObservation {
    const safeThs = Math.max(0, averageHashrateThs);
    const safeHours = Math.max(0.001, periodHours);
    const safeRewards = Math.max(0, observedRewardPrl);

    const denominator = safeThs * safeHours;
    let baseRate = 0;

    if (denominator > 0) {
      baseRate = safeRewards / denominator;
    }

    const now = new Date();
    const periodStart = new Date(now.getTime() - safeHours * 3600000).toISOString();
    const periodEnd = now.toISOString();

    return {
      baseRate,
      observedRewardPrl: safeRewards,
      averageHashrateThs: safeThs,
      periodHours: safeHours,
      periodStart,
      periodEnd,
      provenance: 'POOL_OBSERVED',
      qualityStatus: 'ACTIVE',
      recordedAt: now.toISOString()
    };
  }

  // --- 6. CÁLCULO DE PRODUCCIÓN POR MINER/CONTRATO (Sección 5 & 8 del Blueprint) ---
  public calculateContractProduction(
    contractedTh: number,
    hoursActive = 1,
    contractId?: string,
    customMinerId?: string,
    packageId?: string,
    manualRateOverride?: number,
    provenance: DataProvenance = 'POOL_OBSERVED'
  ): ContractProductionResult {
    const globalConfig = this.getGlobalConfig();
    const resolvedParams = this.resolveEffectiveParameters(contractId, customMinerId, packageId);

    // Determinar R_base
    let baseRate = globalConfig.manualBaseRatePrlPerThsHour;
    if (manualRateOverride !== undefined && manualRateOverride > 0) {
      baseRate = manualRateOverride;
    } else if (globalConfig.baseRateSource === 'POOL_OBSERVED') {
      baseRate = globalConfig.manualBaseRatePrlPerThsHour;
    }

    // Comprobación de obsolescencia
    const syncAgeMinutes = (Date.now() - new Date(globalConfig.lastSyncTimestamp).getTime()) / 60000;
    let qualityStatus: TelemetryQualityStatus = globalConfig.engineStatus;
    if (syncAgeMinutes > globalConfig.staleDataThresholdMinutes && qualityStatus === 'ACTIVE') {
      qualityStatus = 'STALE_DATA';
    }

    const safeTh = Math.max(0, contractedTh);
    const safeHours = Math.max(0, hoursActive);

    // 1. Producción Base = THs_contratados * R_base * horas
    const produccionBase = safeTh * baseRate * safeHours;

    // 2. Producción Ajustada = ProduccionBase * (1 + VariablePct/100)
    const factorVariable = 1 + resolvedParams.effectiveVariablePct / 100;
    const produccionAjustada = produccionBase * factorVariable;

    // 3. Producción Neta = ProduccionAjustada * (1 - Comision/100)
    const factorComision = 1 - resolvedParams.effectiveCommissionPct / 100;
    const produccionNeta = produccionAjustada * factorComision;

    // 4. Valor USD y Profit
    const effectivePrlPrice = globalConfig.prlManualOverridePrice ?? globalConfig.prlPriceUsd;
    const valorUsd = produccionNeta * effectivePrlPrice;
    const costosAplicablesUsd = resolvedParams.effectiveCostsUsdPerHour * safeHours;
    const profitNetoUsd = valorUsd - costosAplicablesUsd;

    return {
      contractedTh: safeTh,
      activeHours: safeHours,
      baseRate,
      produccionBase: Number(produccionBase.toFixed(globalConfig.roundingDecimals)),
      produccionAjustada: Number(produccionAjustada.toFixed(globalConfig.roundingDecimals)),
      produccionNeta: Number(produccionNeta.toFixed(globalConfig.roundingDecimals)),
      valorUsd: Number(valorUsd.toFixed(4)),
      costosAplicablesUsd: Number(costosAplicablesUsd.toFixed(4)),
      profitNetoUsd: Number(profitNetoUsd.toFixed(4)),
      effectiveVariablePct: resolvedParams.effectiveVariablePct,
      effectiveCommissionPct: resolvedParams.effectiveCommissionPct,
      prlPriceUsd: effectivePrlPrice,
      provenance,
      qualityStatus,
      calculatedAt: new Date().toISOString()
    };
  }

  // --- 7. CÁLCULO DE PROFIT ACUMULADO Y ROI (Sección 8 del Blueprint) ---
  public calculateProfitAndRoi(
    initialInvestmentUsd: number,
    accumulatedProductionPrl: number,
    accumulatedCostsUsd = 0.0,
    dailyNetUsdEstimate?: number
  ): ProfitRoiSummary {
    const globalConfig = this.getGlobalConfig();
    const effectivePrlPrice = globalConfig.prlManualOverridePrice ?? globalConfig.prlPriceUsd;

    const accumulatedValueUsd = accumulatedProductionPrl * effectivePrlPrice;
    const netProfitUsd = accumulatedValueUsd - accumulatedCostsUsd;

    const safeInvestment = Math.max(0.01, initialInvestmentUsd);
    // ROI = ((BeneficioNeto - Inversion) / Inversion) * 100
    const roiPct = ((netProfitUsd - safeInvestment) / safeInvestment) * 100;

    const breakEvenUsd = safeInvestment;
    const isBreakEvenReached = netProfitUsd >= safeInvestment;

    let estimatedDaysToBreakEven: number | null = null;
    if (!isBreakEvenReached && dailyNetUsdEstimate && dailyNetUsdEstimate > 0) {
      const remainingUsd = safeInvestment - netProfitUsd;
      estimatedDaysToBreakEven = Math.ceil(remainingUsd / dailyNetUsdEstimate);
    }

    return {
      initialInvestmentUsd: safeInvestment,
      accumulatedProductionPrl: Number(accumulatedProductionPrl.toFixed(globalConfig.roundingDecimals)),
      accumulatedValueUsd: Number(accumulatedValueUsd.toFixed(2)),
      accumulatedCostsUsd: Number(accumulatedCostsUsd.toFixed(2)),
      netProfitUsd: Number(netProfitUsd.toFixed(2)),
      roiPct: Number(roiPct.toFixed(2)),
      breakEvenUsd,
      isBreakEvenReached,
      estimatedDaysToBreakEven,
      calculationTimestamp: new Date().toISOString()
    };
  }

  // --- 8. IDEMPOTENCIA DE PERÍODOS DE LIQUIDACIÓN ---
  public isPeriodProcessed(periodId: string): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_PERIODS_KEY);
      if (raw) {
        const list: ProcessedPeriod[] = JSON.parse(raw);
        return list.some((p) => p.periodId === periodId);
      }
    } catch {}
    return false;
  }

  public registerProcessedPeriod(period: ProcessedPeriod): boolean {
    if (this.isPeriodProcessed(period.periodId)) {
      console.warn(`[MinerxProfitEngine] Período ${period.periodId} ya fue liquidado. Omitiendo duplicado.`);
      return false;
    }

    try {
      const raw = localStorage.getItem(STORAGE_PERIODS_KEY);
      const list: ProcessedPeriod[] = raw ? JSON.parse(raw) : [];
      list.push(period);
      localStorage.setItem(STORAGE_PERIODS_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  }
}
