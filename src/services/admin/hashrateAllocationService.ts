import type { MiningContract, ContractStatus, AllocationSummary } from '../../types/admin';
import { AdminAuditService } from './adminAuditService';
import { db, collection, doc, getDocs, setDoc, onSnapshot } from '../../utils/firebaseAuth';
import { apiFetch } from '../../utils/apiConfig';

const STORAGE_CONTRACTS_KEY = 'minerx_admin_contracts_v3';
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
    accumulatedNetProfitUsd: 125.54, // 85.40 PRL * $1.47 USD
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
    accumulatedNetProfitUsd: 72.47, // 49.30 PRL * $1.47 USD
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
    accumulatedNetProfitUsd: 31.75, // 21.60 PRL * $1.47 USD
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
    accumulatedNetProfitUsd: 14.99, // 10.20 PRL * $1.47 USD
    lastCalculatedAt: new Date().toISOString()
  }
];

export type { AllocationSummary };

export class HashrateAllocationService {
  private static instance: HashrateAllocationService;
  private audit = AdminAuditService.getInstance();

  private constructor() {}

  public static getInstance(): HashrateAllocationService {
    if (!HashrateAllocationService.instance) {
      HashrateAllocationService.instance = new HashrateAllocationService();
    }
    return HashrateAllocationService.instance;
  }

  public getContracts(): MiningContract[] {
    try {
      const raw = localStorage.getItem(STORAGE_CONTRACTS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return INITIAL_CONTRACTS;
  }

  public getAllocationSummary(backedCapacityTh = 1000): AllocationSummary {
    const contracts = this.getContracts();
    const activeContracts = contracts.filter(c => c.status === 'ACTIVE' || c.status === 'PARTIALLY_ALLOCATED');

    const totalContractedTh = activeContracts.reduce((sum, c) => sum + c.contractedTh, 0);
    const totalAllocatedTh = activeContracts.reduce((sum, c) => sum + c.allocatedTh, 0);
    const availableCapacityTh = Math.max(0, backedCapacityTh - totalAllocatedTh);
    const utilizationRatePct = backedCapacityTh > 0 ? (totalAllocatedTh / backedCapacityTh) * 100 : 0;
    const isOverallocated = totalAllocatedTh > backedCapacityTh;
    const unallocatedContractsCount = activeContracts.filter(c => c.allocatedTh < c.contractedTh).length;

    return {
      totalContractedTh,
      totalAllocatedTh,
      totalBackedCapacityTh: backedCapacityTh,
      availableCapacityTh,
      utilizationRatePct: Number(utilizationRatePct.toFixed(1)),
      isOverallocated,
      unallocatedContractsCount
    };
  }

  /**
   * Fetches contracts from Cloud Firestore /admin_contracts,
   * merging any client-purchased miners with local admin contracts.
   * Falls back to Express REST endpoint (/api/admin/contracts).
   */
  public async fetchFirestoreContracts(): Promise<MiningContract[]> {
    if (db) {
      try {
        const snap = await getDocs(collection(db, ADMIN_CONTRACTS_COLLECTION));
        if (!snap.empty) {
          const firestoreContracts: MiningContract[] = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              userId: data.userId || 'usr_client',
              userEmail: data.userEmail || 'cliente@gomining.cloud',
              packageId: data.packageId || 'pkg-custom',
              packageName: data.packageName || data.name || 'Minero Digital',
              contractedTh: Number(data.contractedTh ?? data.powerTh ?? 0),
              allocatedTh: Number(data.allocatedTh ?? data.contractedTh ?? data.powerTh ?? 0),
              status: (data.status as ContractStatus) || 'ACTIVE',
              pricePaidUsdt: Number(data.pricePaidUsdt ?? data.price ?? 0),
              variablePct: Number(data.variablePct) || 0,
              commissionPct: Number(data.commissionPct) || 2,
              workerId: data.workerId || `vwk-${d.id.slice(0, 8)}`,
              activatedAt: data.activatedAt || data.createdAt || new Date().toISOString(),
              expiresAt: data.expiresAt || new Date(Date.now() + 365 * 86400000).toISOString(),
              accumulatedProductionPrl: Number(data.accumulatedProductionPrl) || 0,
              accumulatedNetProfitUsd: Number(data.accumulatedNetProfitUsd) || 0,
              lastCalculatedAt: data.lastCalculatedAt || new Date().toISOString()
            };
          });

          const local = this.getContracts();
          const mergedMap = new Map<string, MiningContract>();
          for (const fc of firestoreContracts) {
            mergedMap.set(fc.id, fc);
          }
          for (const lc of local) {
            if (!mergedMap.has(lc.id)) {
              mergedMap.set(lc.id, lc);
            }
          }

          const mergedList = Array.from(mergedMap.values());
          localStorage.setItem(STORAGE_CONTRACTS_KEY, JSON.stringify(mergedList));
          return mergedList;
        }
      } catch (err) {
        console.warn('[HashrateAllocationService] Notice fetching from Firestore, checking Express API:', err);
      }
    }

    // Secondary fallback: Express API Server
    try {
      const res = await apiFetch('/api/admin/contracts');
      if (res.ok) {
        const remoteContracts = await res.json();
        if (Array.isArray(remoteContracts) && remoteContracts.length > 0) {
          const local = this.getContracts();
          const mergedMap = new Map<string, MiningContract>();
          for (const rc of remoteContracts) {
            mergedMap.set(rc.id, rc);
          }
          for (const lc of local) {
            if (!mergedMap.has(lc.id)) {
              mergedMap.set(lc.id, lc);
            }
          }
          const mergedList = Array.from(mergedMap.values());
          localStorage.setItem(STORAGE_CONTRACTS_KEY, JSON.stringify(mergedList));
          return mergedList;
        }
      }
    } catch {}

    return this.getContracts();
  }

  /**
   * Real-time subscription to Cloud Firestore collection /admin_contracts
   */
  public subscribeToFirestoreContracts(callback: (contracts: MiningContract[]) => void): () => void {
    if (!db) return () => {};
    try {
      const colRef = collection(db, ADMIN_CONTRACTS_COLLECTION);
      return onSnapshot(colRef, (snap) => {
        if (!snap.empty) {
          const firestoreContracts: MiningContract[] = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              userId: data.userId || 'usr_client',
              userEmail: data.userEmail || 'cliente@gomining.cloud',
              packageId: data.packageId || 'pkg-custom',
              packageName: data.packageName || data.name || 'Minero Digital',
              contractedTh: Number(data.contractedTh ?? data.powerTh ?? 0),
              allocatedTh: Number(data.allocatedTh ?? data.contractedTh ?? data.powerTh ?? 0),
              status: (data.status as ContractStatus) || 'ACTIVE',
              pricePaidUsdt: Number(data.pricePaidUsdt ?? data.price ?? 0),
              variablePct: Number(data.variablePct) || 0,
              commissionPct: Number(data.commissionPct) || 2,
              workerId: data.workerId || `vwk-${d.id.slice(0, 8)}`,
              activatedAt: data.activatedAt || data.createdAt || new Date().toISOString(),
              expiresAt: data.expiresAt || new Date(Date.now() + 365 * 86400000).toISOString(),
              accumulatedProductionPrl: Number(data.accumulatedProductionPrl) || 0,
              accumulatedNetProfitUsd: Number(data.accumulatedNetProfitUsd) || 0,
              lastCalculatedAt: data.lastCalculatedAt || new Date().toISOString()
            };
          });

          const local = this.getContracts();
          const mergedMap = new Map<string, MiningContract>();
          for (const fc of firestoreContracts) {
            mergedMap.set(fc.id, fc);
          }
          for (const lc of local) {
            if (!mergedMap.has(lc.id)) {
              mergedMap.set(lc.id, lc);
            }
          }

          const mergedList = Array.from(mergedMap.values());
          localStorage.setItem(STORAGE_CONTRACTS_KEY, JSON.stringify(mergedList));
          callback(mergedList);
        }
      }, (err) => {
        console.warn('[HashrateAllocationService] onSnapshot subscription notice:', err);
      });
    } catch {
      return () => {};
    }
  }

  public updateContractAllocation(contractId: string, newAllocatedTh: number, reason: string): boolean {
    const list = this.getContracts();
    const contract = list.find(c => c.id === contractId);
    if (!contract) return false;

    const previousAllocated = contract.allocatedTh;
    contract.allocatedTh = Math.min(newAllocatedTh, contract.contractedTh);
    if (contract.allocatedTh === contract.contractedTh) {
      contract.status = 'ACTIVE';
    } else if (contract.allocatedTh > 0) {
      contract.status = 'PARTIALLY_ALLOCATED';
    } else {
      contract.status = 'SUSPENDED';
    }

    localStorage.setItem(STORAGE_CONTRACTS_KEY, JSON.stringify(list));
    this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'MINING_OPERATOR', 'ALLOCATION', 'UPDATE_HASHRATE_ALLOCATION', contractId, {
      previousAllocated,
      newAllocatedTh: contract.allocatedTh,
      contractedTh: contract.contractedTh,
      reason
    });

    if (db) {
      setDoc(doc(db, ADMIN_CONTRACTS_COLLECTION, contractId), contract, { merge: true }).catch(err => {
        console.error('[HashrateAllocationService] Error syncing allocation to Firestore:', err);
      });
    }

    try {
      apiFetch('/api/admin/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contract)
      }).catch(() => {});
    } catch {}

    return true;
  }

  public updateContractStatus(contractId: string, status: ContractStatus, reason: string): boolean {
    const list = this.getContracts();
    const contract = list.find(c => c.id === contractId);
    if (!contract) return false;

    const previousStatus = contract.status;
    contract.status = status;
    localStorage.setItem(STORAGE_CONTRACTS_KEY, JSON.stringify(list));

    this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'MINING_OPERATOR', 'ALLOCATION', 'UPDATE_CONTRACT_STATUS', contractId, {
      previousStatus,
      newStatus: status,
      reason
    });

    if (db) {
      setDoc(doc(db, ADMIN_CONTRACTS_COLLECTION, contractId), contract, { merge: true }).catch(err => {
        console.error('[HashrateAllocationService] Error syncing status to Firestore:', err);
      });
    }

    try {
      apiFetch('/api/admin/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contract)
      }).catch(() => {});
    } catch {}

    return true;
  }

  public async registerContract(contract: MiningContract): Promise<MiningContract> {
    const list = this.getContracts();
    const existingIdx = list.findIndex(c => c.id === contract.id);
    if (existingIdx >= 0) {
      list[existingIdx] = contract;
    } else {
      list.unshift(contract);
    }
    localStorage.setItem(STORAGE_CONTRACTS_KEY, JSON.stringify(list));
    if (db) {
      await setDoc(doc(db, ADMIN_CONTRACTS_COLLECTION, contract.id), contract, { merge: true }).catch(() => {});
    }
    try {
      apiFetch('/api/admin/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contract)
      }).catch(() => {});
    } catch {}
    return contract;
  }
}
