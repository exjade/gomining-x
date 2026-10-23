import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VastClient } from '../../server/services/vastClient.js';
import { VastInstanceService } from '../../server/services/vastInstanceService.js';
import { StrategyEngine } from '../../server/services/strategyEngine.js';
import type { RentalStrategy, GpuInstance, MiningMeasurement } from '../../src/types/vast.js';

describe('Vast.ai Strategy Engine & Performance Supervisor Tests', () => {
  it('defaults new strategies to SIMULATION mode and disabled', () => {
    const mockClient = new VastClient({ mockMode: true });
    const engine = new StrategyEngine(new VastInstanceService(mockClient), mockClient);

    const strat = engine.saveStrategy({
      name: 'Test Strategy',
      gpuModel: 'RTX 4090'
    });

    assert.equal(strat.mode, 'SIMULATION');
    assert.equal(strat.enabled, false);
    assert.equal(strat.requireManualApproval, true);
    assert.equal(strat.failureAction, 'STOP_AND_DISABLE');
  });

  it('does NOT provision instances when strategy is in SIMULATION mode', async () => {
    const mockClient = new VastClient({ mockMode: true });
    const instanceService = new VastInstanceService(mockClient);
    const engine = new StrategyEngine(instanceService, mockClient);

    const initialInstancesCount = instanceService.getInstances().length;

    engine.saveStrategy({
      id: 'strat-sim-1',
      name: 'Simulation Strategy',
      mode: 'SIMULATION',
      enabled: true,
      gpuModel: 'RTX 4090',
      maxHourlyCostUSD: 1.00
    });

    const result = await engine.executeStrategyCycle('prl1testwallet');
    assert.ok(result.evaluatedStrategies >= 1);
    const newInstancesCount = instanceService.getInstances().length;
    // Count of instances MUST NOT increase in SIMULATION mode
    assert.equal(newInstancesCount, initialInstancesCount);
  });

  it('respects warmup period and does not fail instances during warmup', async () => {
    const mockClient = new VastClient({ mockMode: true });
    const instanceService = new VastInstanceService(mockClient);
    const engine = new StrategyEngine(instanceService, mockClient);

    const inst: GpuInstance = {
      id: 'inst-warmup-test',
      provider: 'vastai',
      providerOfferId: '70101',
      gpuModel: 'RTX 4090',
      gpuCount: 1,
      gpuMemoryGB: 24,
      hourlyComputeCostUSD: 0.28,
      hourlyStorageCostUSD: 0.02,
      estimatedHourlyCostUSD: 0.30,
      status: 'PROVISIONING',
      workerName: 'vast-4090-test',
      minerSessionId: 'sess-1',
      poolWallet: 'prl1test',
      createdAt: new Date().toISOString() // Brand new (0 minutes elapsed)
    };

    const strat: RentalStrategy = {
      id: 'strat-warmup',
      name: 'Warmup Test',
      provider: 'vastai',
      mode: 'AUTOMATIC',
      enabled: true,
      gpuModel: 'RTX 4090',
      gpuCount: 1,
      maxHourlyCostUSD: 0.40,
      maxTotalSpendUSD: 10,
      maxDailySpendUSD: 5,
      minimumHashrateTHs: 230,
      minimumPerformancePct: 80,
      measurementWindowMinutes: 15,
      warmupMinutes: 5, // 5 min warmup
      consecutiveFailWindows: 3,
      minAcceptedShares: 5,
      maxRejectedSharePct: 5,
      maxConcurrentInstances: 1,
      failureAction: 'STOP_AND_DISABLE',
      noDataAction: 'ALERT_ONLY',
      cooldownMinutes: 30,
      requireManualApproval: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    let alertCalled = false;
    await engine.superviseInstancePerformance(inst, strat, () => {
      alertCalled = true;
    });

    // Should NOT alert or terminate during warmup
    assert.equal(alertCalled, false);
    assert.equal(inst.status, 'WARMUP');
  });

  it('triggers STOP_AND_DISABLE and alerts when instance underperforms for consecutive windows', async () => {
    const mockClient = new VastClient({ mockMode: true });
    const instanceService = new VastInstanceService(mockClient);
    const engine = new StrategyEngine(instanceService, mockClient);

    // Create an instance created 20 minutes ago (past warmup)
    const pastTime = new Date(Date.now() - 20 * 60000).toISOString();
    const inst: GpuInstance = {
      id: 'inst-underperform-test',
      provider: 'vastai',
      providerOfferId: '70101',
      gpuModel: 'RTX 4090',
      gpuCount: 1,
      gpuMemoryGB: 24,
      hourlyComputeCostUSD: 0.28,
      hourlyStorageCostUSD: 0.02,
      estimatedHourlyCostUSD: 0.30,
      status: 'MEASURING',
      workerName: 'vast-4090-low',
      minerSessionId: 'sess-low',
      poolWallet: 'prl1test',
      createdAt: pastTime,
      consecutiveLowWindowsCount: 2 // Already failed 2 times, this will be 3rd
    };

    // Record low measurement: 150 TH/s (Benchmark is 293, required is 80% = 234.4 TH/s)
    const measurement: MiningMeasurement = {
      id: 'm-1',
      instanceId: inst.id,
      workerName: inst.workerName,
      periodStart: pastTime,
      periodEnd: new Date().toISOString(),
      hashrateTHs: 150.0, // Low hashrate!
      acceptedShares: 10,
      rejectedShares: 0,
      rejectedSharePct: 0,
      estimatedPRL: 0.5,
      revenueUSD: 0.2,
      sourceType: 'INSTANCE_MEASURED',
      sourceTimestamp: new Date().toISOString(),
      confidence: 'HIGH'
    };
    instanceService.recordMeasurement(measurement);

    const strat: RentalStrategy = {
      id: 'strat-fail',
      name: 'Failure Test',
      provider: 'vastai',
      mode: 'AUTOMATIC',
      enabled: true,
      gpuModel: 'RTX 4090',
      gpuCount: 1,
      maxHourlyCostUSD: 0.40,
      maxTotalSpendUSD: 10,
      maxDailySpendUSD: 5,
      minimumHashrateTHs: 230,
      minimumPerformancePct: 80,
      measurementWindowMinutes: 15,
      warmupMinutes: 5,
      consecutiveFailWindows: 3,
      minAcceptedShares: 5,
      maxRejectedSharePct: 5,
      maxConcurrentInstances: 1,
      failureAction: 'STOP_AND_DISABLE',
      noDataAction: 'ALERT_ONLY',
      cooldownMinutes: 30,
      requireManualApproval: false,
      createdAt: pastTime,
      updatedAt: pastTime
    };

    let alertTitleReceived = '';
    await engine.superviseInstancePerformance(inst, strat, (title) => {
      alertTitleReceived = title;
    });

    assert.ok(alertTitleReceived.includes('Bajo Rendimiento Confirmado'));
    assert.equal(strat.enabled, false); // Strategy was disabled automatically
  });
});
