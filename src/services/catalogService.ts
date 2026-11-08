import type { CommercialPackage } from '../types/admin';
import { db, collection, getDocs, doc, setDoc, getDoc } from '../utils/firebaseAuth';
import { deserializeCommercialPackageDoc, COMMERCIAL_PACKAGES_COLLECTION } from './admin/commercialPackageService';

export type CatalogSection = 'minerx' | 'preventa' | 'lanzamiento' | 'mensual';
export const VALID_SECTIONS: readonly CatalogSection[] = ['minerx', 'preventa', 'lanzamiento', 'mensual'] as const;
export const VALID_PACKAGE_TYPES = ['fixed', 'subscription', 'custom'] as const;
export const VALID_STATUSES = ['ACTIVE', 'ARCHIVED', 'DRAFT'] as const;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface AdminCatalogInventory {
  canonical: CommercialPackage[];
  legacy: CommercialPackage[];
}
export type AdminCatalogResult = AdminCatalogInventory;

export interface CatalogStoreAdapter {
  getPackages(): Promise<CommercialPackage[]>;
  savePackage(pkg: CommercialPackage): Promise<void>;
  getPackageById(id: string): Promise<CommercialPackage | null>;
}

/**
 * Default Firestore adapter for CatalogService.
 * Strictly read-only on reads; NEVER executes silent writes or auto-seed.
 */
export class FirestoreCatalogStoreAdapter implements CatalogStoreAdapter {
  async getPackages(): Promise<CommercialPackage[]> {
    if (!db) {
      return [];
    }
    const snap = await getDocs(collection(db, COMMERCIAL_PACKAGES_COLLECTION));
    if (snap.empty) {
      return [];
    }
    return snap.docs.map(d => deserializeCommercialPackageDoc(d.id, d.data()));
  }

  async savePackage(pkg: CommercialPackage): Promise<void> {
    if (!db) {
      throw new Error('Firestore is not initialized');
    }
    await setDoc(doc(db, COMMERCIAL_PACKAGES_COLLECTION, pkg.id), pkg, { merge: true });
  }

  async getPackageById(id: string): Promise<CommercialPackage | null> {
    if (!db) return null;
    const snap = await getDoc(doc(db, COMMERCIAL_PACKAGES_COLLECTION, id));
    if (!snap.exists()) return null;
    return deserializeCommercialPackageDoc(snap.id, snap.data());
  }
}

/**
 * In-memory store adapter for unit tests and local execution.
 * Zero external network or Firestore writes.
 */
export class MemoryCatalogStoreAdapter implements CatalogStoreAdapter {
  private store = new Map<string, CommercialPackage>();

  constructor(initialPackages: CommercialPackage[] = []) {
    for (const pkg of initialPackages) {
      this.store.set(pkg.id, { ...pkg });
    }
  }

  async getPackages(): Promise<CommercialPackage[]> {
    return Array.from(this.store.values()).map(p => ({ ...p }));
  }

  async savePackage(pkg: CommercialPackage): Promise<void> {
    this.store.set(pkg.id, { ...pkg });
  }

  async getPackageById(id: string): Promise<CommercialPackage | null> {
    const pkg = this.store.get(id);
    return pkg ? { ...pkg } : null;
  }
}

export class CatalogService {
  private adapter: CatalogStoreAdapter;

  constructor(adapter?: CatalogStoreAdapter) {
    this.adapter = adapter || new FirestoreCatalogStoreAdapter();
  }

  /**
   * Checks whether a package satisfies the canonical new catalog contract:
   * must have a valid section ('minerx' | 'preventa' | 'lanzamiento' | 'mensual').
   */
  public static isCanonicalPackage(pkg: Partial<CommercialPackage>): boolean {
    if (!pkg || typeof pkg !== 'object') return false;
    return typeof pkg.section === 'string' && VALID_SECTIONS.includes(pkg.section as CatalogSection);
  }

  /**
   * Identifies legacy documents (documents lacking a valid section or explicitly marked legacy).
   */
  public static isLegacyPackage(pkg: Partial<CommercialPackage>): boolean {
    return !CatalogService.isCanonicalPackage(pkg);
  }

  /**
   * Pure storefront filter.
   * Only returns packages where:
   *   section == requestedSection
   *   isPublished == true
   *   status == ACTIVE
   * Sorted stably by sortOrder ASC.
   * Completely excludes legacy, DRAFT, ARCHIVED, or isPublished=false documents.
   */
  public static filterStorefrontPackages(packages: CommercialPackage[], section: CatalogSection): CommercialPackage[] {
    if (!VALID_SECTIONS.includes(section)) {
      return [];
    }

    return packages
      .filter(pkg =>
        CatalogService.isCanonicalPackage(pkg) &&
        pkg.section === section &&
        pkg.isPublished === true &&
        pkg.status === 'ACTIVE'
      )
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  /**
   * Separates a list of packages into canonical catalog documents and physically preserved legacy items.
   * Legacy packages are tagged with isLegacy: true and never silently mixed with the canonical catalog.
   */
  public static separateCatalogAndLegacy(packages: CommercialPackage[]): AdminCatalogResult {
    const canonical: CommercialPackage[] = [];
    const legacy: CommercialPackage[] = [];

    for (const pkg of packages) {
      if (CatalogService.isCanonicalPackage(pkg)) {
        canonical.push(pkg);
      } else {
        legacy.push({
          ...pkg,
          isLegacy: true,
        });
      }
    }

    return { canonical, legacy };
  }

  /**
   * Validates package mutations per SCRUM-210 and SCRUM-212 rules:
   * - powerTh > 0
   * - priceUsdt > 0
   * - limitedUnits >= 0 (if exists)
   * - availableUnits >= 0 (if exists)
   * - soldUnits >= 0 (if exists)
   * - soldUnits <= limitedUnits (if both exist)
   * - valid section
   * - valid packageType (if exists)
   * - valid status (if exists)
   * - packageId stable
   * - no finalPriceUsdCents, campaigns, discounts, or promotional pricing (SCRUM-213)
   */
  public static validatePackageMutation(
    pkg: Partial<CommercialPackage>,
    options?: { isUpdate?: boolean; existingPackage?: CommercialPackage }
  ): ValidationResult {
    const p = pkg || {};
    const errors: string[] = [];

    // packageId stability
    if (options?.isUpdate && options.existingPackage) {
      const existingId = options.existingPackage.packageId || options.existingPackage.id;
      const targetId = p.packageId || p.id;
      if (targetId && targetId !== existingId) {
        errors.push(`packageId must remain stable: cannot mutate ${existingId} to ${targetId}`);
      }
    } else if (!options?.isUpdate) {
      const id = p.packageId || p.id;
      if (id !== undefined && (typeof id !== 'string' || !id.trim())) {
        errors.push('packageId must be a non-empty string when provided');
      }
    }

    // Name
    if (!p.name || typeof p.name !== 'string' || !p.name.trim()) {
      errors.push('Package name is required');
    }

    // Power
    if (typeof p.powerTh !== 'number' || p.powerTh <= 0 || isNaN(p.powerTh)) {
      errors.push('powerTh must be a positive number');
    }

    // Price USDT
    if (typeof p.priceUsdt !== 'number' || p.priceUsdt <= 0 || isNaN(p.priceUsdt)) {
      errors.push('priceUsdt must be a positive number');
    }

    // Section is mandatory for canonical catalog packages
    if (!p.section || !VALID_SECTIONS.includes(p.section as CatalogSection)) {
      errors.push(`Invalid or missing section: must be one of [${VALID_SECTIONS.join(', ')}]`);
    }

    // PackageType
    if (p.packageType && !VALID_PACKAGE_TYPES.includes(p.packageType as any)) {
      errors.push(`Invalid packageType: must be one of [${VALID_PACKAGE_TYPES.join(', ')}]`);
    }

    // Status
    if (p.status && !VALID_STATUSES.includes(p.status as any)) {
      errors.push(`Invalid status: must be one of [${VALID_STATUSES.join(', ')}]`);
    }

    // Units validations
    if (p.limitedUnits !== undefined && (typeof p.limitedUnits !== 'number' || p.limitedUnits < 0 || isNaN(p.limitedUnits))) {
      errors.push('limitedUnits cannot be negative');
    }
    if (p.availableUnits !== undefined && (typeof p.availableUnits !== 'number' || p.availableUnits < 0 || isNaN(p.availableUnits))) {
      errors.push('availableUnits cannot be negative');
    }
    if (p.soldUnits !== undefined && (typeof p.soldUnits !== 'number' || p.soldUnits < 0 || isNaN(p.soldUnits))) {
      errors.push('soldUnits cannot be negative');
    }
    if (typeof p.limitedUnits === 'number' && typeof p.soldUnits === 'number' && p.soldUnits > p.limitedUnits) {
      errors.push('soldUnits cannot exceed limitedUnits');
    }

    // priceUsdCents rule: PROPOSED only, if present must be positive integer cents
    if (p.priceUsdCents !== undefined && (!Number.isInteger(p.priceUsdCents) || p.priceUsdCents <= 0)) {
      errors.push('priceUsdCents must be a positive integer representing cents');
    }

    // Out of scope boundaries: SCRUM-213 price fields
    if ((p as any).finalPriceUsdCents !== undefined) {
      errors.push('finalPriceUsdCents is out of scope for SCRUM-212 and belongs to SCRUM-213');
    }
    if ((p as any).campaigns !== undefined || (p as any).discounts !== undefined || (p as any).promotions !== undefined) {
      errors.push('campaigns and discounts are out of scope for SCRUM-212 and belong to SCRUM-213');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Reads storefront packages by section.
   * Strictly read-only; does not write or auto-seed.
   */
  public async getStorefrontCatalog(section: CatalogSection): Promise<CommercialPackage[]> {
    const all = await this.adapter.getPackages();
    return CatalogService.filterStorefrontPackages(all, section);
  }

  /**
   * Reads administrative catalog.
   * Can include ACTIVE, DRAFT, ARCHIVED of canonical contract.
   * Legacy packages are returned separately in the legacy array.
   */
  public async getAdminCatalog(filter?: {
    section?: CatalogSection;
    status?: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  }): Promise<AdminCatalogInventory> {
    const all = await this.adapter.getPackages();
    const separated = CatalogService.separateCatalogAndLegacy(all);

    let canonicalFiltered = separated.canonical;
    if (filter?.section) {
      canonicalFiltered = canonicalFiltered.filter((p: CommercialPackage) => p.section === filter.section);
    }
    if (filter?.status) {
      canonicalFiltered = canonicalFiltered.filter((p: CommercialPackage) => p.status === filter.status);
    }

    return {
      canonical: canonicalFiltered,
      legacy: separated.legacy,
    };
  }

  /**
   * Saves or updates a canonical package.
   * On UPDATE:
   *   - increments version (+1)
   *   - sets updatedAt
   *   - sets updatedBy ONLY if real identity is provided (no synthetic admin_sys)
   *   - validates packageId stability
   */
  public async savePackage(
    pkg: Partial<CommercialPackage> & { name: string; powerTh: number; priceUsdt: number; section: CatalogSection },
    options?: { updatedBy?: string }
  ): Promise<CommercialPackage> {
    const targetId = pkg.packageId || pkg.id;
    let existing: CommercialPackage | null = null;

    if (targetId) {
      existing = await this.adapter.getPackageById(targetId);
    }

    const isUpdate = Boolean(existing);
    const validation = CatalogService.validatePackageMutation(pkg, {
      isUpdate,
      existingPackage: existing || undefined,
    });

    if (!validation.valid) {
      throw new Error(`Package mutation rejected: ${validation.errors.join('; ')}`);
    }

    const now = new Date().toISOString();
    let saved: CommercialPackage;

    if (existing) {
      const nextVersion = (Number(existing.version) || 1) + 1;
      saved = {
        ...existing,
        ...pkg,
        id: existing.id,
        packageId: existing.packageId || existing.id,
        version: nextVersion,
        updatedAt: now,
      };

      if (options?.updatedBy && typeof options.updatedBy === 'string' && options.updatedBy.trim()) {
        saved.updatedBy = options.updatedBy.trim();
      } else {
        delete saved.updatedBy;
      }
    } else {
      const generatedId = targetId || `pkg-${Date.now()}`;
      saved = {
        ...pkg,
        id: generatedId,
        packageId: generatedId,
        status: pkg.status || 'ACTIVE',
        isPublished: pkg.isPublished ?? true,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      if (options?.updatedBy && typeof options.updatedBy === 'string' && options.updatedBy.trim()) {
        saved.updatedBy = options.updatedBy.trim();
      }
    }

    await this.adapter.savePackage(saved);
    return saved;
  }

  /**
   * Archive semantics:
   * status = ARCHIVED
   * isPublished = false
   * Preserves packageId, history, orders, contracts.
   * NO physical deletion.
   */
  public async archivePackage(packageId: string, options?: { updatedBy?: string }): Promise<CommercialPackage> {
    const existing = await this.adapter.getPackageById(packageId);
    if (!existing) {
      throw new Error(`Package not found: ${packageId}`);
    }

    const now = new Date().toISOString();
    const nextVersion = (Number(existing.version) || 1) + 1;

    const archived: CommercialPackage = {
      ...existing,
      status: 'ARCHIVED',
      isPublished: false,
      version: nextVersion,
      updatedAt: now,
    };

    if (options?.updatedBy && typeof options.updatedBy === 'string' && options.updatedBy.trim()) {
      archived.updatedBy = options.updatedBy.trim();
    } else {
      delete archived.updatedBy;
    }

    await this.adapter.savePackage(archived);
    return archived;
  }
}
