import type { MiningContract, ContractStatus, AllocationSummary } from '../../types/admin';
import { AdminAuditService } from './adminAuditService';

const STORAGE_CONTRACTS_KEY = 'minerx_admin_contracts_v3';

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

    return true;
  }
}
