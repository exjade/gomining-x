import type { CommercialPackage, PurchasedPackageSnapshot } from '../../types/admin';
import { AdminAuditService } from './adminAuditService';
import { db, collection, doc, getDocs, setDoc, onSnapshot } from '../../utils/firebaseAuth';
import { apiFetch } from '../../utils/apiConfig';
import { CatalogService, type CatalogSection } from '../catalogService';

const STORAGE_KEY = 'minerx_admin_commercial_packages_v2';
export const COMMERCIAL_PACKAGES_COLLECTION = 'commercial_packages';

/**
 * Deserializes raw Firestore document data into typed CommercialPackage
 * handling legacy fields as well as SCRUM-205 / SCRUM-210 additive fields.
 */
export function deserializeCommercialPackageDoc(id: string, data: any): CommercialPackage {
  const docData = data || {};
  const priceUsdt = Number(docData.priceUsdt) || 0;
  const priceUsdCents = typeof docData.priceUsdCents === 'number'
    ? docData.priceUsdCents
    : undefined;
  const status = docData.status || 'ACTIVE';
  const isPublished = docData.isPublished ?? (status === 'ACTIVE');

  return {
    id,
    name: docData.name || 'Paquete Minero',
    powerTh: Number(docData.powerTh) || 0,
    priceUsdt,
    durationDays: docData.durationDays !== undefined && docData.durationDays !== null
      ? Number(docData.durationDays)
      : undefined,
    status,
    isPublished,
    variablePct: docData.variablePct !== undefined && docData.variablePct !== null
      ? Number(docData.variablePct)
      : undefined,
    commissionPct: docData.commissionPct !== undefined && docData.commissionPct !== null
      ? Number(docData.commissionPct)
      : undefined,
    version: Number(docData.version) || 1,
    description: docData.description !== undefined && docData.description !== null && String(docData.description).trim().length > 0
      ? String(docData.description).trim()
      : undefined,
    maxPurchasesPerUser: docData.maxPurchasesPerUser,

    // Additive fields
    packageId: id,
    section: docData.section,
    packageType: docData.packageType,
    sortOrder: typeof docData.sortOrder === 'number' ? docData.sortOrder : undefined,
    displayName: docData.displayName,
    frontendKey: docData.frontendKey,
    source: docData.source,
    priceUsdCents,
    cadence: docData.cadence ?? docData.billing,
    currency: docData.currency,
    dailyBtcText: docData.dailyBtcText,
    roiPct: typeof docData.roiPct === 'number' ? docData.roiPct : undefined,
    limitedUnits: typeof docData.limitedUnits === 'number' ? docData.limitedUnits : undefined,
    availableUnits: typeof docData.availableUnits === 'number' ? docData.availableUnits : undefined,
    soldUnits: typeof docData.soldUnits === 'number' ? docData.soldUnits : undefined,
    updatedBy: docData.updatedBy,
    seededAt: docData.seededAt,

    createdAt: docData.createdAt || new Date().toISOString(),
    updatedAt: docData.updatedAt || new Date().toISOString(),
  };
}

/**
 * Creates an immutable snapshot of package economic data at purchase time.
 * Decouples the purchased miner instance from future catalog/price changes.
 */
export function createPurchaseSnapshot(
  pkg: CommercialPackage,
  pricePaidCents?: number
): PurchasedPackageSnapshot {
  const rawCents = pricePaidCents ?? pkg.priceUsdCents ?? Math.round(pkg.priceUsdt * 100);
  const finalCents = Math.round(rawCents);
  return {
    packageId: pkg.id,
    packageName: pkg.name,
    displayName: pkg.displayName,
    section: pkg.section,
    packageType: pkg.packageType,
    powerTh: pkg.powerTh,
    pricePaidCents: finalCents,
    pricePaidUsd: finalCents / 100,
    pricePaidUsdt: pkg.priceUsdt,
    currency: pkg.currency || 'USD',
    cadence: pkg.cadence,
    durationDays: pkg.durationDays,
    variablePct: pkg.variablePct,
    commissionPct: pkg.commissionPct,
    dailyBtcText: pkg.dailyBtcText,
    roiPct: pkg.roiPct,
    packageVersion: pkg.version,
    purchasedAt: new Date().toISOString(),
  };
}

/**
 * Validates package schema requirements per SCRUM-210 and SCRUM-212.
 * Canonical creations (isCreate = true) strictly require explicit status and isPublished boolean.
 */
export function validatePackageSchema(
  pkg: Partial<CommercialPackage>,
  options?: { isCreate?: boolean; isUpdate?: boolean }
): { valid: boolean; errors: string[] } {
  const p = pkg || {};
  const errors: string[] = [];
  if (!p.name || !p.name.trim()) errors.push('Package name is required');
  if (typeof p.powerTh !== 'number' || p.powerTh <= 0) errors.push('powerTh must be a positive number');
  
  if (typeof p.priceUsdt !== 'number' || p.priceUsdt <= 0) {
    errors.push('priceUsdt must be a positive number');
  }

  if (p.priceUsdCents !== undefined && (!Number.isInteger(p.priceUsdCents) || p.priceUsdCents <= 0)) {
    errors.push('priceUsdCents must be a positive integer representing cents');
  }
  if (typeof p.limitedUnits === 'number' && p.limitedUnits < 0) errors.push('limitedUnits cannot be negative');
  if (typeof p.availableUnits === 'number' && p.availableUnits < 0) errors.push('availableUnits cannot be negative');
  if (typeof p.soldUnits === 'number' && p.soldUnits < 0) errors.push('soldUnits cannot be negative');
  if (typeof p.limitedUnits === 'number' && typeof p.soldUnits === 'number' && p.soldUnits > p.limitedUnits) {
    errors.push('soldUnits cannot exceed limitedUnits');
  }
  if (p.section && !['minerx', 'preventa', 'lanzamiento', 'mensual'].includes(p.section)) {
    errors.push(`Invalid section: ${p.section}`);
  }
  if (p.packageType && !['fixed', 'subscription', 'custom'].includes(p.packageType)) {
    errors.push(`Invalid packageType: ${p.packageType}`);
  }

  // Canonical CREATE strictly requires explicit status and isPublished (no default assumptions or auto-publish)
  if (options?.isCreate) {
    if (p.status === undefined || p.status === null) {
      errors.push('status is required on package creation (must be explicitly ACTIVE, DRAFT, or ARCHIVED)');
    } else if (!['ACTIVE', 'ARCHIVED', 'DRAFT'].includes(p.status)) {
      errors.push(`Invalid status: ${p.status}`);
    }

    if (typeof p.isPublished !== 'boolean') {
      errors.push('isPublished is required on package creation (must be an explicit boolean true or false)');
    }
  } else {
    if (p.status && !['ACTIVE', 'ARCHIVED', 'DRAFT'].includes(p.status)) {
      errors.push(`Invalid status: ${p.status}`);
    }
    if (p.isPublished !== undefined && typeof p.isPublished !== 'boolean') {
      errors.push('isPublished must be a boolean (true or false)');
    }
  }

  if (p.currency !== undefined && p.currency !== 'USD') {
    errors.push(`Visible catalog currency must remain strictly 'USD' (received: '${p.currency}')`);
  }
  if ((p as any).minerId !== undefined) {
    errors.push('minerId is invalid on commercial_packages: a package is an offer/template, not a miner instance');
  }
  const outOfScopeScrum213Fields = [
    'finalPriceUsdCents',
    'campaigns',
    'discounts',
    'discount',
    'priority',
    'stackable',
    'promotions',
    'promotionalPrice',
    'promoPrice',
    'discountActive',
    'discountType',
    'discountValue',
    'discountLabel',
  ];
  for (const field of outOfScopeScrum213Fields) {
    if ((p as any)[field] !== undefined) {
      errors.push(`${field} is out of scope for SCRUM-212 and belongs to SCRUM-213`);
    }
  }
  if (p.updatedBy && (p.updatedBy === 'admin_sys' || p.updatedBy === 'admin@minerx.cloud')) {
    errors.push(`Synthetic credential '${p.updatedBy}' is not an authoritative administrative identity`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * LEGACY PACKAGES REPOSITORY (Pre-SCRUM-210 / Pre-SCRUM-212)
 *
 * EXPLICITLY ISOLATED AS LEGACY:
 * - These 5 static miner definitions represent legacy local-only seed items.
 * - They lack canonical 'section' metadata and are NOT part of the canonical dynamic catalog.
 * - Excluded from storefront catalog queries (/api/catalog/storefront).
 * - Separated into the 'legacy' bucket in admin catalog queries (/api/catalog/admin).
 * - Must NOT be used as the target path or schema for SCRUM-217.
 * - SCRUM-217 Admin CRUD must interact strictly with the canonical catalog path.
 */
export const LEGACY_INITIAL_PACKAGES: CommercialPackage[] = [
  {
    id: 'pkg-miner-1',
    name: 'Minero 1 Entry',
    powerTh: 48,
    priceUsdt: 561.99,
    durationDays: 365,
    status: 'ACTIVE',
    isPublished: true,
    variablePct: 0.0,
    commissionPct: 2.0,
    version: 1,
    description: 'Paquete de entrada optimizado para minería continua de PearlHash.',
    isLegacy: true,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z'
  },
  {
    id: 'pkg-miner-2',
    name: 'Minero 2 Standard',
    powerTh: 64,
    priceUsdt: 744.99,
    durationDays: 365,
    status: 'ACTIVE',
    isPublished: true,
    variablePct: 2.5,
    commissionPct: 2.0,
    version: 1,
    description: 'Rendimiento equilibrado con multiplicador variable del +2.5%.',
    isLegacy: true,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z'
  },
  {
    id: 'pkg-miner-3',
    name: 'Minero 3 Pro',
    powerTh: 96,
    priceUsdt: 1111.99,
    durationDays: 365,
    status: 'ACTIVE',
    isPublished: true,
    variablePct: 5.0,
    commissionPct: 1.8,
    version: 1,
    description: 'Alta potencia para operadores profesionales con +5.0% de variable.',
    isLegacy: true,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z'
  },
  {
    id: 'pkg-miner-4',
    name: 'Minero 4 Master',
    powerTh: 128,
    priceUsdt: 1474.99,
    durationDays: 365,
    status: 'ACTIVE',
    isPublished: true,
    variablePct: 7.5,
    commissionPct: 1.5,
    version: 1,
    description: 'Potencia industrial con tasa preferencial de comisión reducida.',
    isLegacy: true,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z'
  },
  {
    id: 'pkg-miner-5',
    name: 'Minero 5 Enterprise',
    powerTh: 192,
    priceUsdt: 2201.99,
    durationDays: 365,
    status: 'ACTIVE',
    isPublished: true,
    variablePct: 10.0,
    commissionPct: 1.0,
    version: 1,
    description: 'Máxima capacidad computacional con variable premium del +10.0%.',
    isLegacy: true,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z'
  }
];

export const INITIAL_PACKAGES: CommercialPackage[] = LEGACY_INITIAL_PACKAGES;

export class CommercialPackageService {
  private static instance: CommercialPackageService;
  private audit = AdminAuditService.getInstance();

  private constructor() {}

  public static getInstance(): CommercialPackageService {
    if (!CommercialPackageService.instance) {
      CommercialPackageService.instance = new CommercialPackageService();
    }
    return CommercialPackageService.instance;
  }

  public getPackages(): CommercialPackage[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return INITIAL_PACKAGES.map(p => ({ ...p }));
  }

  public getPackageById(id: string): CommercialPackage | undefined {
    const list = this.getPackages();
    return list.find(p => p.id === id || p.id.replace(/-/g, '_') === id.replace(/-/g, '_'));
  }

  /**
   * Fetch all commercial packages from Cloud Firestore collection /commercial_packages.
   * If remote collection is empty, returns empty list per SCRUM-211 (reads never write/auto-seed).
   * Decoupled from legacy fallback: legacy packages without section are never returned as storefront catalog.
   */
  public async fetchFirestorePackages(): Promise<CommercialPackage[]> {
    if (db) {
      try {
        const snap = await getDocs(collection(db, COMMERCIAL_PACKAGES_COLLECTION));
        if (!snap.empty) {
          const remotePackages: CommercialPackage[] = snap.docs.map(d =>
            deserializeCommercialPackageDoc(d.id, d.data())
          );
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remotePackages));
          return remotePackages;
        } else {
          // SCRUM-211: Silent auto-seed on empty read removed. A read NEVER triggers a write.
          console.warn('[CommercialPackageService] Remote commercial_packages collection is empty; silent auto-seed is removed per SCRUM-211.');
          return [];
        }
      } catch (err) {
        console.warn('[CommercialPackageService] Notice fetching from Firestore, checking Express API:', err);
      }
    }

    // Secondary fallback: Express API Server canonical endpoint
    try {
      const res = await apiFetch('/api/catalog/admin');
      if (res.ok) {
        const remoteApi = await res.json();
        const packages = Array.isArray(remoteApi) ? remoteApi : (remoteApi.canonical || []);
        if (packages.length > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(packages));
          return packages;
        }
      }
    } catch {}

    return this.getPackages();
  }

  /**
   * Real-time subscription to Cloud Firestore collection /commercial_packages
   */
  public subscribeToFirestorePackages(callback: (packages: CommercialPackage[]) => void): () => void {
    if (!db) return () => {};
    try {
      const colRef = collection(db, COMMERCIAL_PACKAGES_COLLECTION);
      return onSnapshot(colRef, (snap) => {
        if (!snap.empty) {
          const remotePackages: CommercialPackage[] = snap.docs.map(d =>
            deserializeCommercialPackageDoc(d.id, d.data())
          );
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remotePackages));
          callback(remotePackages);
        }
      }, (err) => {
        console.warn('[CommercialPackageService] onSnapshot subscription notice:', err);
      });
    } catch {
      return () => {};
    }
  }

  /**
   * Storefront read by section per SCRUM-212 contract.
   * Strictly returns published ACTIVE packages matching requested section ordered by sortOrder ASC.
   * Completely excludes legacy without section, DRAFT, ARCHIVED, or unpublished packages.
   */
  public getStorefrontPackages(section: CatalogSection): CommercialPackage[] {
    const list = this.getPackages();
    return CatalogService.filterStorefrontPackages(list, section);
  }

  /**
   * Administrative catalog view per SCRUM-212 contract.
   * Returns canonical packages (ACTIVE, DRAFT, ARCHIVED) and physically preserved legacy items separated.
   */
  public getAdminCatalog(): { canonical: CommercialPackage[]; legacy: CommercialPackage[] } {
    const list = this.getPackages();
    return CatalogService.separateCatalogAndLegacy(list);
  }

  /**
   * @deprecated Neutralized per SCRUM-211. Silent/legacy writes with INITIAL_PACKAGES are forbidden.
   * Seeding must only be performed via SafeSeedService / safeSeedPackages script with explicit --apply.
   */
  public async seedInitialPackagesToFirestore(): Promise<number> {
    console.warn('[CommercialPackageService] seedInitialPackagesToFirestore is deprecated and neutralized per SCRUM-211. Seeding is only authorized via safeSeedPackages CLI with explicit --apply.');
    return 0;
  }

  /**
   * LEGACY / NON-CANONICAL PATH:
   * Temporarily preserved for existing legacy UI until SCRUM-217 Admin CRUD.
   * Modifies packages locally and syncs to legacy Firestore/API.
   * MUST NOT be used as a fallback for saveCanonicalPackage().
   *
   * Validations enforced:
   * - Validates payload BEFORE any persistence (localStorage or Firestore).
   * - Strict CREATE validation: status and isPublished are required; NO defaults (status || 'ACTIVE' and isPublished ?? true are REMOVED).
   * - In Node backend, remote Firestore writes are guarded by FIRESTORE_EMULATOR_HOST.
   */
  public savePackage(
    pkg: Omit<CommercialPackage, 'createdAt' | 'updatedAt' | 'version' | 'id'> & {
      id?: string;
      updatedBy?: string;
      status?: CommercialPackage['status'];
      isPublished?: boolean;
    }
  ): CommercialPackage {
    const list = this.getPackages();
    const targetId = (pkg as any).packageId || pkg.id;
    const idx = targetId
      ? list.findIndex(p => p.id === targetId || p.id.replace(/-/g, '_') === targetId.replace(/-/g, '_'))
      : -1;
    const existing = idx >= 0 ? list[idx] : undefined;
    const isUpdate = Boolean(existing);
    const isCreate = !isUpdate;

    // Validate payload BEFORE any local storage or database persistence
    const validation = validatePackageSchema(pkg as Partial<CommercialPackage>, { isCreate, isUpdate });
    if (!validation.valid) {
      throw new Error(`Package mutation rejected: ${validation.errors.join('; ')}`);
    }

    // Additional canonical validation if package declares section (canonical path)
    if (pkg.section) {
      const canonicalValidation = CatalogService.validatePackageMutation(pkg as Partial<CommercialPackage>, {
        isCreate,
        isUpdate,
        existingPackage: existing,
      });
      if (!canonicalValidation.valid) {
        throw new Error(`Package mutation rejected: ${canonicalValidation.errors.join('; ')}`);
      }
    }

    const now = new Date().toISOString();
    let saved: CommercialPackage;

    if (existing) {
      const newVersion = (Number(existing.version) || 1) + 1;
      saved = {
        ...existing,
        ...pkg,
        packageId: existing.packageId || existing.id,
        cadence: pkg.cadence ?? existing?.cadence,
        priceUsdCents: typeof pkg.priceUsdCents === 'number' ? pkg.priceUsdCents : existing?.priceUsdCents,
        status: pkg.status ?? existing.status,
        isPublished: typeof pkg.isPublished === 'boolean' ? pkg.isPublished : existing.isPublished,
        version: newVersion,
        updatedAt: now,
      } as CommercialPackage;

      if (
        pkg.updatedBy &&
        typeof pkg.updatedBy === 'string' &&
        pkg.updatedBy.trim() &&
        pkg.updatedBy !== 'admin_sys' &&
        pkg.updatedBy !== 'admin@minerx.cloud'
      ) {
        saved.updatedBy = pkg.updatedBy.trim();
        this.audit.logAction(saved.updatedBy, saved.updatedBy, 'SUPER_ADMIN', 'COMMERCIAL', 'UPDATE_PACKAGE_VERSION', saved.id, {
          version: newVersion,
          pkg: saved,
        });
      } else {
        delete saved.updatedBy;
      }

      if (idx >= 0) {
        list[idx] = saved;
      } else {
        list.push(saved);
      }
    } else {
      const newId = targetId || `pkg-${Date.now()}`;
      saved = {
        ...pkg,
        id: newId,
        packageId: newId,
        cadence: pkg.cadence,
        priceUsdCents: typeof pkg.priceUsdCents === 'number' ? pkg.priceUsdCents : undefined,
        status: pkg.status as 'ACTIVE' | 'ARCHIVED' | 'DRAFT',
        isPublished: pkg.isPublished as boolean,
        version: 1,
        createdAt: now,
        updatedAt: now,
      } as CommercialPackage;

      if (
        pkg.updatedBy &&
        typeof pkg.updatedBy === 'string' &&
        pkg.updatedBy.trim() &&
        pkg.updatedBy !== 'admin_sys' &&
        pkg.updatedBy !== 'admin@minerx.cloud'
      ) {
        saved.updatedBy = pkg.updatedBy.trim();
        this.audit.logAction(saved.updatedBy, saved.updatedBy, 'SUPER_ADMIN', 'COMMERCIAL', 'CREATE_PACKAGE', saved.id, {
          pkg: saved,
        });
      } else {
        delete saved.updatedBy;
      }

      list.unshift(saved);
    }

    // Persist to local cache AFTER validation passes
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

    // Guard direct Firestore writes:
    // - In Node backend: prohibited without emulator host
    // - For canonical packages: client-side direct writes to Cloud Firestore are forbidden (must go through backend API)
    const isNode = typeof window === 'undefined';
    const nodeProcess = (globalThis as any).process;
    const emulatorHost = nodeProcess?.env?.FIRESTORE_EMULATOR_HOST;

    if (db && (!isNode || emulatorHost)) {
      if (!saved.section || emulatorHost) {
        setDoc(doc(db, COMMERCIAL_PACKAGES_COLLECTION, saved.id), saved, { merge: true }).catch(err => {
          console.error(`[CommercialPackageService] Error syncing package ${saved.id} to Firestore:`, err);
        });
      }
    }

    // Asynchronously synchronize with Express API Server
    try {
      apiFetch('/api/catalog/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saved),
      }).catch(() => {});
    } catch {}

    return saved;
  }

  /**
   * CANONICAL ADMIN CATALOG FETCH (SCRUM-212 / SCRUM-217):
   * Fetches administrative catalog directly from Express API endpoint (/api/catalog/admin).
   * Backend-first and fail-closed: returns { canonical: CommercialPackage[], legacy: CommercialPackage[] }.
   * Updates local cache upon successful 2xx response.
   */
  public async fetchAdminCatalog(query?: { section?: CatalogSection; status?: 'ACTIVE' | 'ARCHIVED' | 'DRAFT' }): Promise<{
    canonical: CommercialPackage[];
    legacy: CommercialPackage[];
  }> {
    let url = '/api/catalog/admin';
    const params = new URLSearchParams();
    if (query?.section) params.set('section', query.section);
    if (query?.status) params.set('status', query.status);
    const qs = params.toString();
    if (qs) url += `?${qs}`;

    let res: Response;
    try {
      res = await apiFetch(url);
    } catch (netErr: any) {
      throw new Error(`Error fetching admin catalog: network error (${netErr?.message || netErr})`);
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson?.error || errJson?.details || `Backend returned HTTP ${res.status}`;
      throw new Error(`Admin catalog fetch rejected by backend (${res.status}): ${msg}`);
    }

    const data = await res.json().catch(() => ({ canonical: [], legacy: [] }));
    const canonical: CommercialPackage[] = Array.isArray(data.canonical) ? data.canonical : [];
    const legacy: CommercialPackage[] = Array.isArray(data.legacy) ? data.legacy : [];

    // Cache the combined or canonical packages
    const all = [...canonical, ...legacy];
    if (all.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }

    return { canonical, legacy };
  }

  /**
   * CANONICAL ARCHIVE MUTATION PATH (SCRUM-212 / SCRUM-217):
   * Archives a canonical commercial package via backend Express API (/api/catalog/packages/:id/archive).
   * Strictly backend-first and fail-closed:
   * - Must NOT write to localStorage before backend confirms archive.
   * - If backend responds with error or fails, strictly throws.
   * - Only updates local cache upon HTTP 2xx confirmation.
   */
  public async archiveCanonicalPackage(packageId: string): Promise<CommercialPackage> {
    if (!packageId || typeof packageId !== 'string' || !packageId.trim()) {
      throw new Error('Package id is required for archiveCanonicalPackage');
    }

    let res: Response;
    try {
      res = await apiFetch(`/api/catalog/packages/${encodeURIComponent(packageId.trim())}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (netErr: any) {
      throw new Error(`Canonical package archive rejected: network error (${netErr?.message || netErr})`);
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const errMsg = errJson?.error || errJson?.details || `Backend returned HTTP ${res.status}`;
      throw new Error(`Canonical package archive rejected by backend (${res.status}): ${errMsg}`);
    }

    const data = await res.json().catch(() => ({}));
    if (!data?.package || data.success === false) {
      const detail = data?.error || data?.details || 'backend did not return confirmed archived package';
      throw new Error(`Canonical package archive rejected: ${detail}`);
    }

    // Only update local cache AFTER HTTP 2xx + confirmed package from backend
    const list = this.getPackages();
    const targetId = data.package.id;
    const targetPkgId = data.package.packageId;
    const idx = list.findIndex(
      p =>
        p.id === targetId ||
        (targetPkgId && p.id === targetPkgId) ||
        (p.packageId && (p.packageId === targetId || (targetPkgId && p.packageId === targetPkgId)))
    );
    if (idx >= 0) list[idx] = data.package;
    else list.unshift(data.package);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

    return data.package;
  }

  /**
   * CANONICAL MUTATION PATH (SCRUM-212 / Target for SCRUM-217 Admin CRUD):
   * Saves or updates a canonical commercial package via backend Express API.
   * Strictly backend-first and fail-closed:
   * - Must validate mutation contract before calling backend.
   * - Must NOT write to localStorage or Firestore before backend confirms mutation.
   * - If backend responds with any error (NETWORK_ERROR, BACKEND_NOT_FOUND_OR_BLAZE_REQUIRED, 401, 400, 500, etc.)
   *   or does not respond, it strictly REJECTS with an error.
   * - Has NO fallback to legacy local persistence (savePackage).
   * - Only updates local cache AFTER receiving HTTP 2xx and confirmed package from backend.
   */
  public async saveCanonicalPackage(
    pkg: Partial<CommercialPackage> & {
      id?: string;
      packageId?: string;
      name?: string;
      powerTh?: number;
      priceUsdt?: number;
      section?: CatalogSection;
      status?: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
      isPublished?: boolean;
    },
    options?: { updatedBy?: string }
  ): Promise<CommercialPackage> {
    const isCreate = !pkg.id && !pkg.packageId;
    const validation = CatalogService.validatePackageMutation(pkg, { isCreate, isUpdate: !isCreate });
    if (!validation.valid) {
      throw new Error(`Canonical package mutation rejected: ${validation.errors.join('; ')}`);
    }

    const payload = options?.updatedBy ? { ...pkg, updatedBy: options.updatedBy } : pkg;

    let res: Response;
    try {
      res = await apiFetch('/api/catalog/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (netErr: any) {
      throw new Error(`Canonical package mutation rejected: network error (${netErr?.message || netErr})`);
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const errMsg =
        errJson?.details
          ? `${errJson.error || 'Error'}: ${errJson.details}`
          : errJson?.message
            ? `${errJson.error || 'Error'}: ${errJson.message}`
            : errJson?.error || `Backend returned HTTP ${res.status}`;
      throw new Error(`Canonical package mutation rejected by backend (${res.status}): ${errMsg}`);
    }

    const data = await res.json().catch(() => ({}));
    if (!data?.package || data.success === false) {
      const detail = data?.error || data?.details || 'backend did not return confirmed package';
      throw new Error(`Canonical package mutation rejected: ${detail}`);
    }

    // Only update local cache AFTER HTTP 2xx + confirmed package from backend
    const list = this.getPackages();
    const targetId = data.package.id;
    const targetPkgId = data.package.packageId;
    const idx = list.findIndex(
      p =>
        p.id === targetId ||
        (targetPkgId && p.id === targetPkgId) ||
        (p.packageId && (p.packageId === targetId || (targetPkgId && p.packageId === targetPkgId)))
    );
    if (idx >= 0) list[idx] = data.package;
    else list.unshift(data.package);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return data.package;
  }

  /**
   * LEGACY / NON-CANONICAL PATH:
   * Temporarily preserved for existing legacy UI variable adjustments until SCRUM-217.
   * MUST NOT be used as a fallback for saveCanonicalPackage().
   */
  public updatePackageVariables(packageId: string, variablePct: number, commissionPct: number, updatedBy?: string): CommercialPackage | null {
    const list = this.getPackages();
    const idx = list.findIndex(p => p.id === packageId || p.id.replace(/-/g, '_') === packageId.replace(/-/g, '_'));
    if (idx >= 0) {
      const existing = list[idx];
      const updated: CommercialPackage = {
        ...existing,
        variablePct,
        commissionPct,
        version: (Number(existing.version) || 1) + 1,
        updatedAt: new Date().toISOString()
      };
      if (updatedBy && typeof updatedBy === 'string' && updatedBy.trim() && updatedBy !== 'admin_sys' && updatedBy !== 'admin@minerx.cloud') {
        updated.updatedBy = updatedBy.trim();
        this.audit.logAction(updated.updatedBy, updated.updatedBy, 'SUPER_ADMIN', 'COMMERCIAL', 'UPDATE_PACKAGE_VARIABLES', packageId, { variablePct, commissionPct });
      } else {
        delete updated.updatedBy;
      }

      list[idx] = updated;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

      if (db) {
        setDoc(doc(db, COMMERCIAL_PACKAGES_COLLECTION, updated.id), updated, { merge: true }).catch(err => {
          console.error(`[CommercialPackageService] Error updating variables in Firestore:`, err);
        });
      }

      try {
        apiFetch('/api/catalog/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated)
        }).catch(() => {});
      } catch {}

      return updated;
    }
    return null;
  }

  /**
   * LEGACY / NON-CANONICAL PATH:
   * Temporarily preserved for existing legacy UI archive toggling until SCRUM-217.
   * MUST NOT be used as a fallback for saveCanonicalPackage().
   */
  public toggleArchive(packageId: string, updatedBy?: string): void {
    const list = this.getPackages();
    const pkg = list.find(p => p.id === packageId);
    if (pkg) {
      const transitioningToArchive = pkg.status === 'ACTIVE';
      pkg.status = transitioningToArchive ? 'ARCHIVED' : 'ACTIVE';
      pkg.isPublished = pkg.status === 'ACTIVE';
      pkg.version = (Number(pkg.version) || 1) + 1;
      pkg.updatedAt = new Date().toISOString();
      if (updatedBy && typeof updatedBy === 'string' && updatedBy.trim() && updatedBy !== 'admin_sys' && updatedBy !== 'admin@minerx.cloud') {
        pkg.updatedBy = updatedBy.trim();
        this.audit.logAction(pkg.updatedBy, pkg.updatedBy, 'SUPER_ADMIN', 'COMMERCIAL', 'TOGGLE_PACKAGE_STATUS', packageId, { newStatus: pkg.status });
      } else {
        delete pkg.updatedBy;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

      if (db) {
        setDoc(doc(db, COMMERCIAL_PACKAGES_COLLECTION, packageId), {
          ...pkg,
          status: pkg.status,
          isPublished: pkg.isPublished,
          version: pkg.version,
          updatedAt: pkg.updatedAt
        }, { merge: true }).catch(err => {
          console.error(`[CommercialPackageService] Error updating archive status in Firestore:`, err);
        });
      }

      try {
        if (transitioningToArchive) {
          apiFetch(`/api/catalog/packages/${encodeURIComponent(pkg.id)}/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updatedBy: pkg.updatedBy })
          }).catch(() => {});
        } else {
          apiFetch('/api/catalog/packages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pkg)
          }).catch(() => {});
        }
      } catch {}
    }
  }

  /**
   * LEGACY / NON-CANONICAL PATH:
   * Temporarily preserved for existing legacy UI publish toggling until SCRUM-217.
   * MUST NOT be used as a fallback for saveCanonicalPackage().
   */
  public togglePublish(packageId: string, updatedBy?: string): void {
    const list = this.getPackages();
    const pkg = list.find(p => p.id === packageId);
    if (pkg) {
      pkg.isPublished = !pkg.isPublished;
      pkg.version = (Number(pkg.version) || 1) + 1;
      pkg.updatedAt = new Date().toISOString();
      if (updatedBy && typeof updatedBy === 'string' && updatedBy.trim() && updatedBy !== 'admin_sys' && updatedBy !== 'admin@minerx.cloud') {
        pkg.updatedBy = updatedBy.trim();
        this.audit.logAction(pkg.updatedBy, pkg.updatedBy, 'SUPER_ADMIN', 'COMMERCIAL', 'TOGGLE_PUBLISH_STATUS', packageId, { isPublished: pkg.isPublished });
      } else {
        delete pkg.updatedBy;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

      if (db) {
        setDoc(doc(db, COMMERCIAL_PACKAGES_COLLECTION, packageId), {
          ...pkg,
          isPublished: pkg.isPublished,
          version: pkg.version,
          updatedAt: pkg.updatedAt
        }, { merge: true }).catch(err => {
          console.error(`[CommercialPackageService] Error updating publish status in Firestore:`, err);
        });
      }

      try {
        apiFetch('/api/catalog/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pkg)
        }).catch(() => {});
      } catch {}
    }
  }
}