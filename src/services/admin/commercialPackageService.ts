import type { CommercialPackage } from '../../types/admin';
import { AdminAuditService } from './adminAuditService';
import { db, collection, doc, getDocs, setDoc, onSnapshot } from '../../utils/firebaseAuth';
import { apiFetch } from '../../utils/apiConfig';

const STORAGE_KEY = 'minerx_admin_commercial_packages_v2';
export const COMMERCIAL_PACKAGES_COLLECTION = 'commercial_packages';

export const INITIAL_PACKAGES: CommercialPackage[] = [
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
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z'
  }
];

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
    return INITIAL_PACKAGES;
  }

  public getPackageById(id: string): CommercialPackage | undefined {
    const list = this.getPackages();
    return list.find(p => p.id === id || p.id.replace(/-/g, '_') === id.replace(/-/g, '_'));
  }

  /**
   * Fetch all commercial packages from Cloud Firestore collection /commercial_packages.
   * If remote collection is empty or fails, falls back to Express API endpoint (/api/packages) or local cache.
   */
  public async fetchFirestorePackages(): Promise<CommercialPackage[]> {
    if (db) {
      try {
        const snap = await getDocs(collection(db, COMMERCIAL_PACKAGES_COLLECTION));
        if (!snap.empty) {
          const remotePackages: CommercialPackage[] = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name || 'Paquete Minero',
              powerTh: Number(data.powerTh) || 0,
              priceUsdt: Number(data.priceUsdt) || 0,
              durationDays: Number(data.durationDays) || 365,
              status: data.status || 'ACTIVE',
              isPublished: data.isPublished ?? (data.status === 'ACTIVE'),
              variablePct: Number(data.variablePct) || 0,
              commissionPct: Number(data.commissionPct) || 2,
              version: Number(data.version) || 1,
              description: data.description || '',
              maxPurchasesPerUser: data.maxPurchasesPerUser,
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString()
            };
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remotePackages));
          return remotePackages;
        } else {
          await this.seedInitialPackagesToFirestore();
        }
      } catch (err) {
        console.warn('[CommercialPackageService] Notice fetching from Firestore, checking Express API:', err);
      }
    }

    // Secondary fallback: Express API Server
    try {
      const res = await apiFetch('/api/packages');
      if (res.ok) {
        const remoteApi = await res.json();
        if (Array.isArray(remoteApi) && remoteApi.length > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteApi));
          return remoteApi;
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
          const remotePackages: CommercialPackage[] = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name || 'Paquete Minero',
              powerTh: Number(data.powerTh) || 0,
              priceUsdt: Number(data.priceUsdt) || 0,
              durationDays: Number(data.durationDays) || 365,
              status: data.status || 'ACTIVE',
              isPublished: data.isPublished ?? (data.status === 'ACTIVE'),
              variablePct: Number(data.variablePct) || 0,
              commissionPct: Number(data.commissionPct) || 2,
              version: Number(data.version) || 1,
              description: data.description || '',
              maxPurchasesPerUser: data.maxPurchasesPerUser,
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString()
            };
          });
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
   * Seeds INITIAL_PACKAGES into Cloud Firestore (/commercial_packages)
   */
  public async seedInitialPackagesToFirestore(): Promise<number> {
    if (!db) return 0;
    let count = 0;
    for (const pkg of INITIAL_PACKAGES) {
      try {
        await setDoc(doc(db, COMMERCIAL_PACKAGES_COLLECTION, pkg.id), {
          ...pkg,
          isPublished: true,
          seededAt: new Date().toISOString()
        }, { merge: true });
        count++;
      } catch (e) {
        console.warn(`[CommercialPackageService] Failed to seed package ${pkg.id}:`, e);
      }
    }
    return count;
  }

  public savePackage(pkg: Omit<CommercialPackage, 'createdAt' | 'updatedAt' | 'version' | 'id'> & { id?: string }): CommercialPackage {
    const list = this.getPackages();
    const now = new Date().toISOString();
    let saved: CommercialPackage;

    if (pkg.id) {
      const idx = list.findIndex(p => p.id === pkg.id);
      const existing = list[idx];
      const newVersion = (existing?.version || 1) + 1;
      saved = {
        ...existing,
        ...pkg,
        isPublished: pkg.isPublished ?? (pkg.status ? pkg.status === 'ACTIVE' : (existing?.status === 'ACTIVE')),
        version: newVersion,
        updatedAt: now
      } as CommercialPackage;
      if (idx >= 0) {
        list[idx] = saved;
      } else {
        list.push(saved);
      }
      this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'SUPER_ADMIN', 'COMMERCIAL', 'UPDATE_PACKAGE_VERSION', saved.id, { version: newVersion, pkg: saved });
    } else {
      saved = {
        ...pkg,
        id: `pkg-${Date.now()}`,
        status: pkg.status || 'ACTIVE',
        isPublished: pkg.isPublished ?? true,
        version: 1,
        createdAt: now,
        updatedAt: now
      } as CommercialPackage;
      list.unshift(saved);
      this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'SUPER_ADMIN', 'COMMERCIAL', 'CREATE_PACKAGE', saved.id, { pkg: saved });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

    // Asynchronously synchronize with Cloud Firestore
    if (db) {
      setDoc(doc(db, COMMERCIAL_PACKAGES_COLLECTION, saved.id), saved, { merge: true }).catch(err => {
        console.error(`[CommercialPackageService] Error syncing package ${saved.id} to Firestore:`, err);
      });
    }

    // Asynchronously synchronize with Express API Server
    try {
      apiFetch('/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saved)
      }).catch(() => {});
    } catch {}

    return saved;
  }

  public updatePackageVariables(packageId: string, variablePct: number, commissionPct: number): CommercialPackage | null {
    const list = this.getPackages();
    const idx = list.findIndex(p => p.id === packageId || p.id.replace(/-/g, '_') === packageId.replace(/-/g, '_'));
    if (idx >= 0) {
      const updated: CommercialPackage = {
        ...list[idx],
        variablePct,
        commissionPct,
        version: list[idx].version + 1,
        updatedAt: new Date().toISOString()
      };
      list[idx] = updated;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'SUPER_ADMIN', 'COMMERCIAL', 'UPDATE_PACKAGE_VARIABLES', packageId, { variablePct, commissionPct });

      if (db) {
        setDoc(doc(db, COMMERCIAL_PACKAGES_COLLECTION, updated.id), updated, { merge: true }).catch(err => {
          console.error(`[CommercialPackageService] Error updating variables in Firestore:`, err);
        });
      }

      try {
        apiFetch('/api/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated)
        }).catch(() => {});
      } catch {}

      return updated;
    }
    return null;
  }

  public toggleArchive(packageId: string): void {
    const list = this.getPackages();
    const pkg = list.find(p => p.id === packageId);
    if (pkg) {
      pkg.status = pkg.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
      pkg.isPublished = pkg.status === 'ACTIVE';
      pkg.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'SUPER_ADMIN', 'COMMERCIAL', 'TOGGLE_PACKAGE_STATUS', packageId, { newStatus: pkg.status });

      if (db) {
        setDoc(doc(db, COMMERCIAL_PACKAGES_COLLECTION, packageId), {
          ...pkg,
          status: pkg.status,
          isPublished: pkg.isPublished,
          updatedAt: pkg.updatedAt
        }, { merge: true }).catch(err => {
          console.error(`[CommercialPackageService] Error updating archive status in Firestore:`, err);
        });
      }

      try {
        apiFetch('/api/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pkg)
        }).catch(() => {});
      } catch {}
    }
  }

  public togglePublish(packageId: string): void {
    const list = this.getPackages();
    const pkg = list.find(p => p.id === packageId);
    if (pkg) {
      pkg.isPublished = !pkg.isPublished;
      pkg.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'SUPER_ADMIN', 'COMMERCIAL', 'TOGGLE_PUBLISH_STATUS', packageId, { isPublished: pkg.isPublished });

      if (db) {
        setDoc(doc(db, COMMERCIAL_PACKAGES_COLLECTION, packageId), {
          ...pkg,
          isPublished: pkg.isPublished,
          updatedAt: pkg.updatedAt
        }, { merge: true }).catch(err => {
          console.error(`[CommercialPackageService] Error updating publish status in Firestore:`, err);
        });
      }

      try {
        apiFetch('/api/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pkg)
        }).catch(() => {});
      } catch {}
    }
  }
}