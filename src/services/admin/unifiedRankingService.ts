import type { UnifiedRankingItem } from '../../types/admin';
import type { MergedGPUWorker } from '../../types/minerx';
import { VirtualWorkerService } from './virtualWorkerService';
import { MinerxProfitEngine } from './minerxProfitEngine';

export class UnifiedRankingService {
  private static instance: UnifiedRankingService;
  private virtualWorkerService = VirtualWorkerService.getInstance();

  private constructor() {}

  public static getInstance(): UnifiedRankingService {
    if (!UnifiedRankingService.instance) {
      UnifiedRankingService.instance = new UnifiedRankingService();
    }
    return UnifiedRankingService.instance;
  }

  public getUnifiedRanking(kryptexWorkers: MergedGPUWorker[] = []): UnifiedRankingItem[] {
    const virtualWorkers = this.virtualWorkerService.getVirtualWorkers();
    const engine = MinerxProfitEngine.getInstance();

    const items: UnifiedRankingItem[] = [];

    // Ingest Kryptex real workers
    for (const kw of kryptexWorkers) {
      const hashrate = kw.currentHashrateTHs || 0;
      const dailyProd = engine.calculateContractProduction(hashrate, 24);
      items.push({
        rank: 0,
        id: kw.workerName,
        name: kw.workerName,
        ownerLabel: 'Flota Interna Kryptex',
        source: 'KRYPTEX_REAL',
        hashrateTh: hashrate,
        efficiencyWattsPerTh: 1.45,
        totalPrlProduced: kw.validShares ? Number((kw.validShares * 0.008).toFixed(2)) : 120.5,
        status: kw.isMining ? 'ONLINE' : (kw.saladStatus === 'allocating' ? 'WARNING' : 'OFFLINE'),
        dailyPrl: dailyProd.produccionNeta,
        dailyUsd: dailyProd.valorUsd
      });
    }

    // Ingest Virtual workers
    for (const vw of virtualWorkers) {
      items.push({
        rank: 0,
        id: vw.id,
        name: vw.name,
        ownerLabel: `Cliente ${vw.userId.substring(0, 8)}`,
        source: 'MINERX_VIRTUAL',
        hashrateTh: vw.currentHashrateTh,
        efficiencyWattsPerTh: 1.25,
        totalPrlProduced: vw.accumulatedPrl,
        status: vw.status === 'ACTIVE' ? 'ONLINE' : 'OFFLINE',
        dailyPrl: vw.dailyPrl,
        dailyUsd: vw.dailyUsd
      });
    }

    // Sort descending by hashrate
    items.sort((a, b) => b.hashrateTh - a.hashrateTh);

    // Assign ranking position
    return items.map((item, idx) => ({
      ...item,
      rank: idx + 1
    }));
  }
}