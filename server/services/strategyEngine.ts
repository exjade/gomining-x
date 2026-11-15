/**
 * Rental Strategy Automation & Decision Engine
 * Complies with MinerX_CALCULADORA_RENTABILIDAD_Y_AUTOMATIZACION_VASTAI.md Section 7, 8 & 11
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import type {
  RentalStrategy,
  GpuInstance,
  AuditRunEvent
} from '../../src/types/vast.js';
import { VastClient } from './vastClient.js';
import { VastOffersService } from './vastOffersService.js';
import { VastInstanceService } from './vastInstanceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getEphemeralTestDataDir(): string {
  const testDir = path.join(os.tmpdir(), `minerx-test-${process.pid}`);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
    process.once('exit', () => {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    });
  }
  return testDir;
}

const getDataDir = () => {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === 'test') {
    return getEphemeralTestDataDir();
  }
  return path.join(__dirname, '..', 'data');
};
const getStrategiesFile = () => path.join(getDataDir(), 'vast_strategies.json');
const getAuditFile = () => path.join(getDataDir(), 'vast_audit_runs.json');

export class StrategyEngine {
  private instanceService: VastInstanceService;
  private vastClient: VastClient;
  private lastEvaluationTime: number = 0;

  constructor(instanceService?: VastInstanceService, vastClient?: VastClient) {
    this.vastClient = vastClient || new VastClient();
    this.instanceService = instanceService || new VastInstanceService(this.vastClient);
    this.ensureDataFiles();
  }

  private ensureDataFiles() {
    const dataDir = getDataDir();
    const strategiesFile = getStrategiesFile();
    const auditFile = getAuditFile();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(strategiesFile)) {
      fs.writeFileSync(strategiesFile, JSON.stringify({ strategies: [] }, null, 2), 'utf-8');
    }
    if (!fs.existsSync(auditFile)) {
      fs.writeFileSync(auditFile, JSON.stringify({ runs: [] }, null, 2), 'utf-8');
    }
  }

  public getStrategies(): RentalStrategy[] {
    try {
      const strategiesFile = getStrategiesFile();
      if (fs.existsSync(strategiesFile)) {
        const parsed = JSON.parse(fs.readFileSync(strategiesFile, 'utf-8'));
        return Array.isArray(parsed.strategies) ? parsed.strategies : [];
      }
    } catch (err) {
      console.error('Error reading strategies:', err);
    }
    return [];
  }

  public saveStrategies(strategies: RentalStrategy[]) {
    try {
      this.ensureDataFiles();
      fs.writeFileSync(getStrategiesFile(), JSON.stringify({ strategies }, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving strategies:', err);
    }
  }

  public getAuditRuns(strategyId?: string): AuditRunEvent[] {
    try {
      const auditFile = getAuditFile();
      if (fs.existsSync(auditFile)) {
        const parsed = JSON.parse(fs.readFileSync(auditFile, 'utf-8'));
        const all: AuditRunEvent[] = Array.isArray(parsed.runs) ? parsed.runs : [];
        if (strategyId) {
          return all.filter((r) => r.strategyId === strategyId);
        }
        return all;
      }
    } catch (err) {
      console.error('Error reading audit runs:', err);
    }
    return [];
  }

  public recordAudit(event: Omit<AuditRunEvent, 'id' | 'timestamp'>) {
    try {
      this.ensureDataFiles();
      const all = this.getAuditRuns();
      const newEvent: AuditRunEvent = {
        ...event,
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString()
      };
      all.push(newEvent);
      // Keep last 1000 events
      const trimmed = all.slice(-1000);
      fs.writeFileSync(getAuditFile(), JSON.stringify({ runs: trimmed }, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error recording audit:', err);
    }
  }

  /**
   * Creates or updates a strategy with safe defaults (SIMULATION mode)
   */
  public saveStrategy(input: Partial<RentalStrategy>): RentalStrategy {
    const strategies = this.getStrategies();
    const isNew = !input.id;
    const id = input.id || `strat-${Date.now()}`;

    const strategy: RentalStrategy = {
      id,
      name: input.name || 'Estrategia RTX 4090 Automática',
      provider: input.provider || 'vastai',
      mode: input.mode || 'SIMULATION', // DEFAULT IS ALWAYS SIMULATION
      enabled: input.enabled !== undefined ? input.enabled : false,
      gpuModel: input.gpuModel || 'RTX 4090',
      gpuCount: input.gpuCount || 1,
      maxHourlyCostUSD: input.maxHourlyCostUSD || 0.40,
      maxTotalSpendUSD: input.maxTotalSpendUSD || 20.0,
      maxDailySpendUSD: input.maxDailySpendUSD || 10.0,
      minimumHashrateTHs: input.minimumHashrateTHs || 230,
      minimumPerformancePct: input.minimumPerformancePct || 80,
      measurementWindowMinutes: input.measurementWindowMinutes || 15,
      warmupMinutes: input.warmupMinutes || 5,
      consecutiveFailWindows: input.consecutiveFailWindows || 3,
      minAcceptedShares: input.minAcceptedShares || 5,
      maxRejectedSharePct: input.maxRejectedSharePct || 5,
      maxConcurrentInstances: input.maxConcurrentInstances || 2,
      failureAction: input.failureAction || 'STOP_AND_DISABLE',
      noDataAction: input.noDataAction || 'ALERT_ONLY',
      cooldownMinutes: input.cooldownMinutes || 30,
      requireManualApproval: input.requireManualApproval !== undefined ? input.requireManualApproval : true,
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const idx = strategies.findIndex((s) => s.id === id);
    if (idx >= 0) {
      strategies[idx] = strategy;
    } else {
      strategies.push(strategy);
    }

    this.saveStrategies(strategies);
    this.recordAudit({
      strategyId: id,
      strategyName: strategy.name,
      action: isNew ? 'STRATEGY_CREATED' : 'STRATEGY_UPDATED',
      actor: 'USER_ACTION',
      outcome: 'SUCCESS',
      details: { mode: strategy.mode, enabled: strategy.enabled }
    });

    return strategy;
  }

  /**
   * Main Strategy Cycle: Evaluates offers & active instances
   */
  public async executeStrategyCycle(
    walletAddress: string,
    onAlert?: (title: string, message: string, severity: 'critical' | 'warning' | 'info') => void
  ): Promise<{ evaluatedStrategies: number; actionsTaken: string[] }> {
    const strategies = this.getStrategies().filter((s) => s.enabled);
    const actionsTaken: string[] = [];

    // Cooldown check for cycle execution (at least 30s between global evaluations)
    const now = Date.now();
    if (now - this.lastEvaluationTime < 30000) {
      return { evaluatedStrategies: strategies.length, actionsTaken: ['SKIPPED_CYCLE_COOLDOWN'] };
    }
    this.lastEvaluationTime = now;

    for (const strat of strategies) {
      // 1. Check current instances for this strategy
      const allInstances = this.instanceService.getInstances();
      const stratInstances = allInstances.filter(
        (i) => i.strategyId === strat.id && i.status !== 'TERMINATED'
      );

      // 2. Check underperformance on active instances
      for (const inst of stratInstances) {
        await this.superviseInstancePerformance(inst, strat, onAlert);
      }

      // 3. If below max concurrent instances, look for matching offers
      if (stratInstances.length < strat.maxConcurrentInstances) {
        const canRent = strat.mode === 'AUTOMATIC' && !strat.requireManualApproval;

        // Search offers
        const searchRes = await this.vastClient.searchOffers({
          gpuName: strat.gpuModel,
          maxDph: strat.maxHourlyCostUSD,
          rentableOnly: true
        });

        if (searchRes.success && searchRes.offers.length > 0) {
          const ranked = VastOffersService.filterAndRankOffers(searchRes.offers, {
            gpuModel: strat.gpuModel,
            maxHourlyPriceUSD: strat.maxHourlyCostUSD
          });

          const best = ranked[0];
          if (best && best.qualificationBadge !== 'LOSS_RISK') {
            if (canRent) {
              // Check cooldown: was an instance terminated recently (< cooldownMinutes)?
              const lastTerminated = allInstances.find(
                (i) =>
                  i.strategyId === strat.id &&
                  i.status === 'TERMINATED' &&
                  i.terminatedAt &&
                  now - new Date(i.terminatedAt).getTime() < strat.cooldownMinutes * 60000
              );

              if (lastTerminated) {
                this.recordAudit({
                  strategyId: strat.id,
                  strategyName: strat.name,
                  action: 'COOLDOWN_PROTECTION',
                  actor: 'STRATEGY_ENGINE',
                  outcome: 'SKIPPED',
                  details: {
                    reason: `Estrategia en cooldown de ${strat.cooldownMinutes}m tras baja de ${lastTerminated.workerName}.`
                  }
                });
                continue;
              }

              // AUTO-RENT INSTANCE
              const provRes = await this.instanceService.provisionInstance({
                offerId: best.offer.id,
                gpuModel: best.offer.gpuModel,
                gpuCount: best.offer.gpuCount,
                gpuMemoryGB: best.offer.gpuMemoryGB,
                hourlyComputeCostUSD: best.offer.hourlyComputeCostUSD,
                hourlyStorageCostUSD: best.offer.hourlyStorageCostUSD,
                poolWallet: walletAddress,
                strategyId: strat.id
              });

              if (provRes.success && provRes.instance) {
                const actionMsg = `Instancia ${provRes.instance.workerName} alquilada automáticamente en Vast.ai ($${best.offer.totalHourlyCostUSD}/h).`;
                actionsTaken.push(actionMsg);
                if (onAlert) {
                  onAlert(
                    '⚡ [Vast.ai] Nueva GPU Alquilada',
                    `Estrategia "${strat.name}" alquiló ${best.offer.gpuModel} (Oferta #${best.offer.id}) a $${best.offer.totalHourlyCostUSD}/h.\nWorker: ${provRes.instance.workerName}`,
                    'info'
                  );
                }
                this.recordAudit({
                  strategyId: strat.id,
                  strategyName: strat.name,
                  instanceId: provRes.instance.id,
                  workerName: provRes.instance.workerName,
                  action: 'AUTO_RENT_SUCCESS',
                  actor: 'STRATEGY_ENGINE',
                  outcome: 'SUCCESS',
                  details: { offerId: best.offer.id, cost: best.offer.totalHourlyCostUSD }
                });
              }
            } else {
              // SIMULATION or MANUAL_APPROVAL
              const note =
                strat.mode === 'SIMULATION'
                  ? `[SIMULACIÓN] Oferta encontrada #${best.offer.id} (${best.offer.gpuModel} a $${best.offer.totalHourlyCostUSD}/h). No se gasta en modo simulación.`
                  : `[APROBACIÓN REQUERIDA] Oferta elegible #${best.offer.id} a $${best.offer.totalHourlyCostUSD}/h.`;

              actionsTaken.push(note);
              this.recordAudit({
                strategyId: strat.id,
                strategyName: strat.name,
                action: strat.mode === 'SIMULATION' ? 'SIMULATION_MATCH' : 'APPROVAL_PENDING',
                actor: 'STRATEGY_ENGINE',
                outcome: 'SUCCESS',
                details: { offerId: best.offer.id, score: best.suitabilityScore }
              });
            }
          }
        }
      }
    }

    return { evaluatedStrategies: strategies.length, actionsTaken };
  }

  /**
   * Evaluates instance telemetry against strategy minimum hashrate & executes policy
   */
  public async superviseInstancePerformance(
    inst: GpuInstance,
    strat: RentalStrategy,
    onAlert?: (title: string, message: string, severity: 'critical' | 'warning' | 'info') => void
  ) {
    const elapsedMinutes = (Date.now() - new Date(inst.createdAt).getTime()) / 60000;

    // 1. Warmup window grace period
    if (elapsedMinutes < strat.warmupMinutes) {
      if (inst.status !== 'WARMUP') {
        inst.status = 'WARMUP';
        this.instanceService.saveInstances(this.instanceService.getInstances());
      }
      return;
    }

    // 2. Fetch measurements for this instance
    const measurements = this.instanceService.getMeasurements(inst.id);
    const lastM = measurements[measurements.length - 1];

    if (!lastM) {
      // No data yet
      if (elapsedMinutes > strat.warmupMinutes + strat.measurementWindowMinutes) {
        inst.status = 'NO_DATA';
        if (strat.noDataAction === 'MANUAL_REVIEW') {
          inst.status = 'MANUAL_REVIEW';
        }
      }
      return;
    }

    // 3. Compare hashrate against absolute and relative thresholds
    const currentHashrate = lastM.hashrateTHs;
    const singleBenchmark = VastOffersService.resolveBenchmarkTHs(inst.gpuModel);
    const expectedBenchmark = singleBenchmark * inst.gpuCount;
    const requiredRelativeTHs = (strat.minimumPerformancePct / 100) * expectedBenchmark;
    const requiredTHs = Math.max(strat.minimumHashrateTHs, requiredRelativeTHs);

    const isUnderperforming = currentHashrate < requiredTHs;

    if (isUnderperforming) {
      inst.consecutiveLowWindowsCount = (inst.consecutiveLowWindowsCount || 0) + 1;
      inst.status = 'UNDERPERFORMING';

      // Has it failed consecutively past the threshold?
      if (inst.consecutiveLowWindowsCount >= strat.consecutiveFailWindows) {
        inst.status = 'ALERTED';

        const alertTitle = `🚨 [MinerX] Bajo Rendimiento Confirmado: ${inst.workerName}`;
        const alertMsg =
          `Worker: ${inst.workerName}\n` +
          `GPU: ${inst.gpuModel} x${inst.gpuCount}\n` +
          `Hashrate entregado: ${currentHashrate.toFixed(1)} TH/s\n` +
          `Mínimo configurado: ${requiredTHs.toFixed(1)} TH/s\n` +
          `Ventanas fallidas consecutivas: ${inst.consecutiveLowWindowsCount} / ${strat.consecutiveFailWindows}\n` +
          `Política ejecutada: ${strat.failureAction}`;

        if (onAlert) {
          onAlert(alertTitle, alertMsg, 'critical');
        }

        // Execute Authorized Failure Policy
        switch (strat.failureAction) {
          case 'ALERT_ONLY':
            // Only notification, keep instance running
            break;

          case 'STOP_MINER':
          case 'STOP_INSTANCE':
            await this.instanceService.stopInstance(
              inst.id,
              `Bajo rendimiento: ${currentHashrate} TH/s < ${requiredTHs} TH/s`
            );
            break;

          case 'DESTROY_INSTANCE':
            await this.instanceService.deleteInstance(
              inst.id,
              `Eliminada por bajo rendimiento continuo: ${currentHashrate} TH/s`
            );
            break;

          case 'DISABLE_STRATEGY':
            strat.enabled = false;
            this.saveStrategy(strat);
            break;

          case 'STOP_AND_DISABLE':
          default:
            await this.instanceService.stopInstance(
              inst.id,
              `Detenida por bajo rendimiento: ${currentHashrate} TH/s`
            );
            strat.enabled = false;
            this.saveStrategy(strat);
            break;
        }

        this.recordAudit({
          strategyId: strat.id,
          strategyName: strat.name,
          instanceId: inst.id,
          workerName: inst.workerName,
          action: `FAILURE_POLICY_${strat.failureAction}`,
          actor: 'STRATEGY_ENGINE',
          outcome: 'SUCCESS',
          details: {
            currentHashrate,
            requiredTHs,
            consecutiveFails: inst.consecutiveLowWindowsCount,
            actionExecuted: strat.failureAction
          }
        });
      }
    } else {
      // Qualified
      inst.consecutiveLowWindowsCount = 0;
      inst.status = 'QUALIFIED';
      if (!inst.qualifiedAt) {
        inst.qualifiedAt = new Date().toISOString();
      }
    }

    inst.lastHashrateTHs = currentHashrate;
    inst.lastPerformanceRatioPct = Number(((currentHashrate / expectedBenchmark) * 100).toFixed(1));
    this.instanceService.saveInstances(this.instanceService.getInstances());
  }
}
