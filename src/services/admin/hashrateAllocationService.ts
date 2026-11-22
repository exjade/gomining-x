import type { MiningContract, ContractStatus, AllocationSummary } from '../../types/admin';
import { AdminAuditService } from './adminAuditService';
import { db, collection, getDocs, onSnapshot } from '../../utils/firebaseAuth';
import { apiFetch } from '../../utils/apiConfig';

export const ADMIN_CONTRACTS_COLLECTION = 'admin_contracts';

export const INITIAL_CONTRACTS: MiningContract[] = [
  {
    id: 'ctr-1001',
    userId: 'usr_roman_01',
    userEmail: 'roman@minerx.cloud',
    packageId: 'pkg-miner-5',
    packageName: 'Minero 5 Enterprise',
    contractedTh: 192,
    allocatedTh: 192,
    status: 'ACTIVE',
    pricePaidUsdt: 2201.99,
    variablePct: 10.0,
    commissionPct: 1.0,
    workerId: 'vwk-1001-01',
    activatedAt: '2026-10-15T12:00:00Z',
    expiresAt: '2027-10-15T12:00:00Z',
    accumulatedProductionPrl: 85.40,
    accumulatedNetProfitUsd: 125.54,
    lastCalculatedAt: new Date().toISOString()
  },
  {
    id: 'ctr-1002',
    userId: 'usr_alpha_99',
    userEmail: 'operator.alpha@minerx.cloud',
    packageId: 'pkg-miner-4',
    packageName: 'Minero 4 Master',
    contractedTh: 128,
    allocatedTh: 128,
    status: 'ACTIVE',
    pricePaidUsdt: 1474.99,
    variablePct: 7.5,
    commissionPct: 1.5,
    workerId: 'vwk-1002-01',
    activatedAt: '2026-10-18T09:30:00Z',
    expiresAt: '2027-10-18T09:30:00Z',
    accumulatedProductionPrl: 49.30,
    accumulatedNetProfitUsd: 72.47,
    lastCalculatedAt: new Date().toISOString()
  },
  {
    id: 'ctr-1003',
    userId: 'usr_beta_04',
    userEmail: 'investor.beta@gmail.com',
    packageId: 'pkg-miner-3',
    packageName: 'Minero 3 Pro',
    contractedTh: 96,
    allocatedTh: 96,
    status: 'ACTIVE',
    pricePaidUsdt: 1111.99,
    variablePct: 5.0,
    commissionPct: 1.8,
    workerId: 'vwk-1003-01',
    activatedAt: '2026-10-25T14:15:00Z',
    expiresAt: '2027-10-25T14:15:00Z',
    accumulatedProductionPrl: 21.60,
    accumulatedNetProfitUsd: 31.75,
    lastCalculatedAt: new Date().toISOString()
  },
  {
    id: 'ctr-1004',
    userId: 'usr_gamma_12',
    userEmail: 'miner.gamma@proton.me',
    packageId: 'pkg-miner-2',
    packageName: 'Minero 2 Standard',
    contractedTh: 64,
    allocatedTh: 64,
    status: 'ACTIVE',
    pricePaidUsdt: 744.99,
    variablePct: 2.5,
    commissionPct: 2.0,
    workerId: 'vwk-1004-01',
    activatedAt: '2026-10-28T16:00:00Z',
    expiresAt: '2027-10-28T16:00:00Z',
    accumulatedProductionPrl: 10.20,
    accumulatedNetProfitUsd: 14.99,
    lastCalculatedAt: new Date().toISOString()
  }
];

export type { AllocationSummary };

export function normalizeMiningContractDoc(id: string, data: Record<string, any>): MiningContract {
  const contractedTh = Number(data.contractedTh ?? data.powerTh ?? 0);
  const allocatedTh = Number(data.allocatedTh ?? data.contractedTh ?? data.powerTh ?? 0);
  return {
    id,
    orderId: typeof data.orderId === 'string' && data.orderId.trim() ? data.orderId.trim() : undefined,
    activatedMinerId:
      typeof data.activatedMinerId === 'string' && data.activatedMinerId.trim()
        ? data.activatedMinerId.trim()
        : undefined,
    intentId: typeof data.intentId === 'string' && data.intentId.trim() ? data.intentId.trim() : undefined,
    userId: data.userId || 'usr_client',
    userEmail: data.userEmail || 'cliente@gomining.cloud',
    packageId: data.packageId || 'pkg-custom',
    packageName: data.packageName || data.name || 'Minero Digital',
    contractedTh: Number.isFinite(contractedTh) ? contractedTh : 0,
    allocatedTh: Number.isFinite(allocatedTh) ? allocatedTh : 0,
    status: (data.status as ContractStatus) || 'ACTIVE',
    pricePaidUsdt: Number(data.pricePaidUsdt ?? data.price ?? 0),
    variablePct: Number(data.variablePct) || 0,
    commissionPct: Number(data.commissionPct) || 2,
    workerId: data.workerId || `vwk-${id.slice(0, 8)}`,
    activatedAt: data.activatedAt || data.createdAt || new Date().toISOString(),
    expiresAt: data.expiresAt || new Date(Date.now() + 365 * 86400000).toISOString(),
    accumulatedProductionPrl: Number(data.accumulatedProductionPrl) || 0,
    accumulatedNetProfitUsd: Number(data.accumulatedNetProfitUsd) || 0,
    lastCalculatedAt: data.lastCalculatedAt || new Date().toISOString(),
  };
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error.trim()) return body.error;
    if (body && typeof body.message === 'string' && body.message.trim()) return body.message;
  } catch {
    // Non-JSON error body
  }
  return `${fallback} (HTTP ${res.status})`;
}

export class HashrateAllocationService {
  private static instance: HashrateAllocationService;
  private audit = AdminAuditService.getInstance();
  private cachedContracts: MiningContract[] | null = null;

  private constructor() {}

  public static getInstance(): HashrateAllocationService {
    if (!HashrateAllocationService.instance) {
      HashrateAllocationService.instance = new HashrateAllocationService();
    }
    return HashrateAllocationService.instance;
  }

  public getContracts(): MiningContract[] {
    if (this.cachedContracts !== null) {
      return this.cachedContracts;
    }
    return INITIAL_CONTRACTS.map((c) => ({ ...c }));
  }

  private upsertCache(contract: MiningContract): void {
    const list = this.getContracts().slice();
    const idx = list.findIndex((c) => c.id === contract.id);
    if (idx >= 0) {
      list[idx] = contract;
    } else {
      list.unshift(contract);
    }
    this.cachedContracts = list;
  }

  public getAllocationSummary(backedCapacityTh = 1000, contractsOverride?: MiningContract[]): AllocationSummary {
    const contracts = contractsOverride ?? this.getContracts();
    const activeContracts = contracts.filter((c) => c.status === 'ACTIVE' || c.status === 'PARTIALLY_ALLOCATED');

    const totalContractedTh = activeContracts.reduce((sum, c) => sum + c.contractedTh, 0);
    const totalAllocatedTh = activeContracts.reduce((sum, c) => sum + c.allocatedTh, 0);
    const availableCapacityTh = Math.max(0, backedCapacityTh - totalAllocatedTh);
    const utilizationRatePct = backedCapacityTh > 0 ? (totalAllocatedTh / backedCapacityTh) * 100 : 0;
    const isOverallocated = totalAllocatedTh > backedCapacityTh;
    const unallocatedContractsCount = activeContracts.filter((c) => c.allocatedTh < c.contractedTh).length;

    return {
      totalContractedTh,
      totalAllocatedTh,
      totalBackedCapacityTh: backedCapacityTh,
      availableCapacityTh,
      utilizationRatePct: Number(utilizationRatePct.toFixed(1)),
      isOverallocated,
      unallocatedContractsCount,
    };
  }

  /**
   * Fetches contracts directly from Cloud Firestore /admin_contracts without stale localStorage merge.
   * Falls back to authenticated Express REST endpoint (/api/admin/contracts).
   */
  public async fetchFirestoreContracts(): Promise<MiningContract[]> {
    if (db) {
      try {
        const snap = await getDocs(collection(db, ADMIN_CONTRACTS_COLLECTION));
        const firestoreContracts = snap.docs.map((d) => normalizeMiningContractDoc(d.id, d.data()));
        this.cachedContracts = firestoreContracts;
        return firestoreContracts;
      } catch (err) {
        console.warn('[HashrateAllocationService] Notice fetching from Firestore, checking Express API:', err);
      }
    }

    try {
      const res = await apiFetch('/api/admin/contracts');
      if (res.ok) {
        const remoteContracts = await res.json();
        if (Array.isArray(remoteContracts)) {
          const normalized = remoteContracts.map((rc) => normalizeMiningContractDoc(rc.id, rc));
          this.cachedContracts = normalized;
          return normalized;
        }
      }
    } catch {
      // Backend unavailable
    }

    return this.getContracts();
  }

  /**
   * Real-time subscription to Cloud Firestore collection /admin_contracts (server-authoritative).
   */
  public subscribeToFirestoreContracts(callback: (contracts: MiningContract[]) => void): () => void {
    if (!db) return () => {};
    try {
      const colRef = collection(db, ADMIN_CONTRACTS_COLLECTION);
      return onSnapshot(
        colRef,
        (snap) => {
          const firestoreContracts = snap.docs.map((d) => normalizeMiningContractDoc(d.id, d.data()));
          this.cachedContracts = firestoreContracts;
          callback(firestoreContracts);
        },
        (err) => {
          console.warn('[HashrateAllocationService] onSnapshot subscription notice:', err);
        }
      );
    } catch {
      return () => {};
    }
  }

  public async updateContractAllocation(
    contractId: string,
    newAllocatedTh: number,
    reason: string
  ): Promise<MiningContract> {
    const res = await apiFetch(`/api/admin/contracts/${encodeURIComponent(contractId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocatedTh: newAllocatedTh, reason }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'No se pudo actualizar la asignación del contrato'));
    }

    const payload = await res.json();
    const updated = normalizeMiningContractDoc(payload?.contract?.id || contractId, payload?.contract || {});
    this.upsertCache(updated);
    this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'MINING_OPERATOR', 'ALLOCATION', 'UPDATE_HASHRATE_ALLOCATION', contractId, {
      newAllocatedTh: updated.allocatedTh,
      contractedTh: updated.contractedTh,
      reason,
    });
    return updated;
  }

  public async updateContractStatus(
    contractId: string,
    status: ContractStatus,
    reason: string
  ): Promise<MiningContract> {
    const res = await apiFetch(`/api/admin/contracts/${encodeURIComponent(contractId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'No se pudo actualizar el estado del contrato'));
    }

    const payload = await res.json();
    const updated = normalizeMiningContractDoc(payload?.contract?.id || contractId, payload?.contract || {});
    this.upsertCache(updated);
    this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'MINING_OPERATOR', 'ALLOCATION', 'UPDATE_CONTRACT_STATUS', contractId, {
      newStatus: updated.status,
      reason,
    });
    return updated;
  }

  public async registerContract(contract: MiningContract): Promise<MiningContract> {
    const res = await apiFetch('/api/admin/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contract),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'No se pudo registrar el contrato en el backend'));
    }

    const payload = await res.json();
    const saved = payload?.contract
      ? normalizeMiningContractDoc(payload.contract.id || contract.id, payload.contract)
      : contract;
    this.upsertCache(saved);
    return saved;
  }
}
