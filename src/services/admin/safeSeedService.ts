import type { Firestore } from 'firebase/firestore';
import {
  db,
  collection,
  doc,
  getDocs,
  setDoc,
} from '../../utils/firebaseAuth';
import { COMMERCIAL_PACKAGES_COLLECTION, validatePackageSchema } from './commercialPackageService';
import { TARGET_PACKAGES_MANIFEST, type SeedPackageItem } from '../../data/seedManifest';

/**
 * Storage adapter abstraction for Cloud Firestore commercial_packages.
 * Decouples seed engine logic from live Firestore SDK gRPC streams,
 * allowing 100% deterministic testing without network dependencies.
 */
export interface PackageStoreAdapter {
  getExistingPackages(): Promise<Map<string, any>>;
  setPackageDoc(id: string, data: any): Promise<void>;
}

export class DefaultFirestorePackageStore implements PackageStoreAdapter {
  private firestoreInstance: Firestore | null;

  constructor(firestoreInstance: Firestore | null = db) {
    this.firestoreInstance = firestoreInstance;
  }

  async getExistingPackages(): Promise<Map<string, any>> {
    const map = new Map<string, any>();
    if (!this.firestoreInstance) return map;
    try {
      const snap = await getDocs(collection(this.firestoreInstance, COMMERCIAL_PACKAGES_COLLECTION));
      if (snap && snap.docs) {
        for (const d of snap.docs) {
          map.set(d.id, d.data());
        }
      }
    } catch (err: any) {
      console.warn('[DefaultFirestorePackageStore] Notice reading existing packages:', err?.message || err);
    }
    return map;
  }

  async setPackageDoc(id: string, data: any): Promise<void> {
    if (!this.firestoreInstance) {
      throw new Error('Cloud Firestore instance is not initialized');
    }
    await setDoc(doc(this.firestoreInstance, COMMERCIAL_PACKAGES_COLLECTION, id), data);
  }
}

export interface SafeSeedOptions {
  /** If false or omitted, runs in simulation mode without writing to Firestore */
  apply?: boolean;
  /** Explicit dryRun flag; if true, overrides apply */
  dryRun?: boolean;
  /** Optional custom PackageStoreAdapter or Firestore instance */
  storeAdapter?: PackageStoreAdapter;
  firestore?: Firestore;
  /** Optional custom catalog (defaults to TARGET_PACKAGES_MANIFEST) */
  targetCatalog?: SeedPackageItem[];
  /** Optional logger function */
  logger?: (msg: string) => void;
}

export interface SafeSeedReport {
  dryRun: boolean;
  applied: boolean;
  created: Array<{ id: string; name: string; section: string; powerTh: number; priceUsdt: number }>;
  skipped: Array<{ id: string; reason: string }>;
  blocked: Array<{ id: string; reason: string }>;
  preservedLegacy: Array<{ id: string; name?: string }>;
  summary: {
    totalCatalogCount: number;
    createdCount: number;
    skippedCount: number;
    blockedCount: number;
    preservedLegacyCount: number;
  };
}

export class SafeSeedService {
  private static instance: SafeSeedService;

  public static getInstance(): SafeSeedService {
    if (!SafeSeedService.instance) {
      SafeSeedService.instance = new SafeSeedService();
    }
    return SafeSeedService.instance;
  }

  /**
   * Executes a safe, idempotent, non-destructive seed of commercial packages.
   * - Defaults to dry-run mode unless options.apply is explicitly true.
   * - Create-only: never overwrites existing documents.
   * - Zero deletes: never removes existing packages or legacy records.
   * - Preserves legacy documents (e.g. pkg-miner-2 / "Minero 2 Standard").
   * - priceUsdCents remains PROPOSED and is NOT materialized in Firestore writes.
   */
  public async executeSafeSeed(options: SafeSeedOptions = {}): Promise<SafeSeedReport> {
    const isDryRun = options.dryRun !== undefined ? options.dryRun : !options.apply;
    const isApply = !isDryRun && !!options.apply;
    const log = options.logger || (() => {});
    const catalog = options.targetCatalog || TARGET_PACKAGES_MANIFEST;

    const store: PackageStoreAdapter =
      options.storeAdapter ||
      new DefaultFirestorePackageStore(options.firestore || db);

    const report: SafeSeedReport = {
      dryRun: isDryRun,
      applied: isApply,
      created: [],
      skipped: [],
      blocked: [],
      preservedLegacy: [],
      summary: {
        totalCatalogCount: catalog.length,
        createdCount: 0,
        skippedCount: 0,
        blockedCount: 0,
        preservedLegacyCount: 0,
      },
    };

    log(`[SafeSeedService] Starting seed execution. Mode: ${isDryRun ? 'DRY-RUN (SIMULATION)' : 'APPLY (WRITE)'}`);

    // 1. Scan existing documents from Firestore via store adapter
    let existingDocsMap = new Map<string, any>();
    try {
      existingDocsMap = await store.getExistingPackages();
    } catch (err: any) {
      log(`[SafeSeedService] Notice inspecting existing documents: ${err?.message || err}`);
    }

    // 2. Identify and preserve legacy documents
    for (const [id, data] of existingDocsMap.entries()) {
      const isLegacy = id.startsWith('pkg-miner-') || !data?.section;
      if (isLegacy) {
        report.preservedLegacy.push({ id, name: data?.name });
      }
    }
    report.summary.preservedLegacyCount = report.preservedLegacy.length;
    if (report.preservedLegacy.length > 0) {
      log(`[SafeSeedService] Found ${report.preservedLegacy.length} legacy document(s) in Firestore. Preserving intact.`);
    }

    // 3. Process target catalog items: create-only, never overwrite
    const nowIso = new Date().toISOString();

    for (const pkg of catalog) {
      // Validate schema
      const validation = validatePackageSchema(pkg);
      if (!validation.valid) {
        report.blocked.push({ id: pkg.id, reason: `Schema validation failed: ${validation.errors.join(', ')}` });
        report.summary.blockedCount++;
        continue;
      }

      // Check existence by exact ID (create-only / no-overwrite)
      if (existingDocsMap.has(pkg.id)) {
        report.skipped.push({ id: pkg.id, reason: 'Document ID already exists in Firestore (create-only / no-overwrite)' });
        report.summary.skippedCount++;
        continue;
      }

      // Check existence by frontendKey collision if present
      let collisionByFrontendKey = false;
      if (pkg.frontendKey) {
        for (const [existingId, existingData] of existingDocsMap.entries()) {
          if (existingData?.frontendKey === pkg.frontendKey) {
            collisionByFrontendKey = true;
            report.skipped.push({
              id: pkg.id,
              reason: `frontendKey '${pkg.frontendKey}' already assigned to existing document '${existingId}'`,
            });
            report.summary.skippedCount++;
            break;
          }
        }
      }
      if (collisionByFrontendKey) continue;

      // Item is eligible for creation
      if (isApply) {
        // Construct safe document per SCRUM-210 contract:
        // Do NOT materialize priceUsdCents in Firestore per PO mandate (priceUsdCents remains PROPOSED).
        const docPayload: Record<string, any> = {
          id: pkg.id,
          packageId: pkg.id,
          name: pkg.name,
          displayName: pkg.displayName,
          section: pkg.section,
          packageType: pkg.packageType,
          sortOrder: pkg.sortOrder,
          powerTh: pkg.powerTh,
          priceUsdt: pkg.priceUsdt,
          currency: pkg.currency || 'USD',
          cadence: pkg.cadence,
          durationDays: pkg.durationDays,
          status: 'ACTIVE',
          isPublished: true,
          version: 1,
          variablePct: pkg.variablePct ?? 0,
          commissionPct: pkg.commissionPct ?? 2,
          frontendKey: pkg.frontendKey,
          source: 'frontend-seed',
          description: pkg.description || '',
          seededAt: nowIso,
          createdAt: pkg.createdAt || nowIso,
          updatedAt: pkg.updatedAt || nowIso,
        };

        if (pkg.dailyBtcText !== undefined) docPayload.dailyBtcText = pkg.dailyBtcText;
        if (pkg.roiPct !== undefined) docPayload.roiPct = pkg.roiPct;
        if (pkg.limitedUnits !== undefined) docPayload.limitedUnits = pkg.limitedUnits;
        if (pkg.availableUnits !== undefined) docPayload.availableUnits = pkg.availableUnits;
        if (pkg.soldUnits !== undefined) docPayload.soldUnits = pkg.soldUnits;

        try {
          await store.setPackageDoc(pkg.id, docPayload);
          existingDocsMap.set(pkg.id, docPayload);
          report.created.push({
            id: pkg.id,
            name: pkg.name,
            section: pkg.section,
            powerTh: pkg.powerTh,
            priceUsdt: pkg.priceUsdt,
          });
          report.summary.createdCount++;
        } catch (err: any) {
          report.blocked.push({ id: pkg.id, reason: `Write failed: ${err?.message || err}` });
          report.summary.blockedCount++;
        }
      } else {
        // Simulation / Dry-Run: Record simulated creation without writing
        report.created.push({
          id: pkg.id,
          name: pkg.name,
          section: pkg.section,
          powerTh: pkg.powerTh,
          priceUsdt: pkg.priceUsdt,
        });
        report.summary.createdCount++;
      }
    }

    log(`[SafeSeedService] Execution finished: Created=${report.summary.createdCount}, Skipped=${report.summary.skippedCount}, Blocked=${report.summary.blockedCount}, PreservedLegacy=${report.summary.preservedLegacyCount}`);

    return report;
  }
}
