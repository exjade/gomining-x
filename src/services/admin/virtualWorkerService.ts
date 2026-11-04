import type { VirtualWorker } from '../../types/admin';
import { HashrateAllocationService } from './hashrateAllocationService';
import { MinerxProfitEngine } from './minerxProfitEngine';

const STORAGE_VIRTUAL_WORKERS_KEY = 'minerx_admin_virtual_workers_v4';

export class VirtualWorkerService {
  private static instance: VirtualWorkerService;
  private allocationService = HashrateAllocationService.getInstance();

  private constructor() {}

  public static getInstance(): VirtualWorkerService {
    if (!VirtualWorkerService.instance) {
      VirtualWorkerService.instance = new VirtualWorkerService();
    }
    return VirtualWorkerService.instance;
  }

  private loadRawWorkers(): VirtualWorker[] {
    try {
      const raw = localStorage.getItem(STORAGE_VIRTUAL_WORKERS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}

    // Fallback: intentar migración desde v3
    try {
      const legacy = localStorage.getItem('minerx_admin_virtual_workers_v3');
      if (legacy) return JSON.parse(legacy);
    } catch {}

    // Initial sync from contracts
    const contracts = this.allocationService.getContracts();
    const initialWorkers: VirtualWorker[] = contracts.map((c, idx) => ({
      id: c.workerId || `vwk-${c.id}-01`,
      contractId: c.id,
      userId: c.userId,
      name: `${c.packageName.replace(/\s+/g, '_').toLowerCase()}_${idx + 1}`,
      assignedTh: c.allocatedTh,
      status: c.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
      provenance: 'MINERX_VIRTUAL',
      mode: 'REAL',
      sharesAccepted: Math.floor(c.allocatedTh * 14.2),
      sharesRejected: Math.floor(c.allocatedTh * 0.05),
      accumulatedPrl: c.accumulatedProductionPrl,
      currentHashrateTh: c.allocatedTh,
      uptimeSeconds: 86400 * 14,
      lastHeartbeat: new Date().toISOString()
    }));

    localStorage.setItem(STORAGE_VIRTUAL_WORKERS_KEY, JSON.stringify(initialWorkers));
    return initialWorkers;
  }

  public getVirtualWorkers(): VirtualWorker[] {
    const rawList = this.loadRawWorkers();
    const engine = MinerxProfitEngine.getInstance();
    const globalCfg = engine.getGlobalConfig();
    const prlPrice = globalCfg.prlManualOverridePrice ?? globalCfg.prlPriceUsd;

    return rawList.map((w) => {
      // Calcular rendimiento diario real con el Motor Híbrido
      const prod24h = engine.calculateContractProduction(
        w.status === 'ACTIVE' ? w.assignedTh : 0,
        24,
        w.contractId
      );

      const baseRate = prod24h.baseRate;
      const effectiveRate = baseRate * (1 + prod24h.effectiveVariablePct / 100) * (1 - prod24h.effectiveCommissionPct / 100);

      return {
        ...w,
        dailyPrl: prod24h.produccionNeta,
        dailyUsd: prod24h.valorUsd,
        effectiveRate: Number(effectiveRate.toFixed(7)),
        prlPriceUsd: prlPrice,
        variablePct: prod24h.effectiveVariablePct,
        commissionPct: prod24h.effectiveCommissionPct
      };
    });
  }

  public toggleWorkerStatus(workerId: string): void {
    const list = this.loadRawWorkers();
    const worker = list.find(w => w.id === workerId);
    if (worker) {
      worker.status = worker.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      worker.lastHeartbeat = new Date().toISOString();
      localStorage.setItem(STORAGE_VIRTUAL_WORKERS_KEY, JSON.stringify(list));
    }
  }

  public addVirtualWorker(worker: Omit<VirtualWorker, 'id' | 'lastHeartbeat'>): VirtualWorker {
    const list = this.loadRawWorkers();
    const newWorker: VirtualWorker = {
      ...worker,
      id: `vwk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      lastHeartbeat: new Date().toISOString()
    };
    list.unshift(newWorker);
    localStorage.setItem(STORAGE_VIRTUAL_WORKERS_KEY, JSON.stringify(list));
    return newWorker;
  }
}