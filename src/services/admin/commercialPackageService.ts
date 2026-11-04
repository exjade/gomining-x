import type { CommercialPackage } from '../../types/admin';
import { AdminAuditService } from './adminAuditService';

const STORAGE_KEY = 'minerx_admin_commercial_packages_v2';

export const INITIAL_PACKAGES: CommercialPackage[] = [
  {
    id: 'pkg-miner-1',
    name: 'Minero 1 Entry',
    powerTh: 48,
    priceUsdt: 561.99,
    durationDays: 365,
    status: 'ACTIVE',
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
        version: 1,
        createdAt: now,
        updatedAt: now
      } as CommercialPackage;
      list.unshift(saved);
      this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'SUPER_ADMIN', 'COMMERCIAL', 'CREATE_PACKAGE', saved.id, { pkg: saved });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
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
      return updated;
    }
    return null;
  }

  public toggleArchive(packageId: string): void {
    const list = this.getPackages();
    const pkg = list.find(p => p.id === packageId);
    if (pkg) {
      pkg.status = pkg.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
      pkg.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'SUPER_ADMIN', 'COMMERCIAL', 'TOGGLE_PACKAGE_STATUS', packageId, { newStatus: pkg.status });
    }
  }
}