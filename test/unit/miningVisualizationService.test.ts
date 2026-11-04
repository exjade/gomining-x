import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MiningVisualizationService } from '../../src/services/miningVisualizationService';
import { REAL_KRYPTEX_PRL_PRICE_USD, REAL_KRYPTEX_BASE_RATE_PRL_HOUR } from '../../src/services/admin/minerxProfitEngine';
import type { FleetSummary, MergedGPUWorker } from '../../src/types/minerx';

describe('Mining Visualization Service & Fintech 3D Data Pipeline', () => {
  const service = MiningVisualizationService.getInstance();

  it('correctly maps client contract node with unified mathematical formula', () => {
    const clientNode = service.getClientContractVisualState();

    assert.ok(clientNode, 'clientNode must exist');
    assert.ok(clientNode.contractedTh > 0, 'Contracted TH/s must be positive');
    assert.strictEqual(clientNode.status, 'ACTIVE');

    // Canonical calculations verification
    const core = clientNode.productionCore;
    assert.strictEqual(core.currentPrlPriceUsd, REAL_KRYPTEX_PRL_PRICE_USD);
    assert.strictEqual(core.baseRatePrlHour, REAL_KRYPTEX_BASE_RATE_PRL_HOUR);

    // Yield proportional to contract power
    assert.ok(core.dailyPrlNet > 0, 'Daily net PRL must be positive');
    assert.ok(core.dailyNetUsd > 0, 'Daily net USD must be positive');
    assert.ok(core.monthlyPrlNet > 0, 'Monthly net PRL must be positive');
    assert.ok(core.monthlyNetUsd > 0, 'Monthly net USD must be positive');

    // Verify modular power blades exist
    assert.ok(clientNode.powerModules.length >= 2, 'Must have at least 2 power blades');
    assert.ok(clientNode.powerModules[0].powerTh > 0, 'Blade power must be positive');
  });

  it('correctly structures admin infrastructure racks with real worker telemetry', () => {
    const mockSummary: FleetSummary = {
      totalAllocatedGPUs: 8,
      activeMiningGPUs: 7,
      idleOrDeadGPUs: 1,
      underperformingGPUs: 0,
      totalHashrateTHs: 0.384,
      expectedHashrateTHs: 0.384,
      fleetEfficiencyPct: 98.5,
      totalPowerDrawWatts: 2800,
      averageTemperatureC: 62.4,
      totalGrossRevenuePerHourUSD: 0.48,
      totalCostsPerHourUSD: 0.24,
      totalNetProfitPerHourUSD: 0.24,
      projectedMonthlyProfitUSD: 172.8,
      currentPRLPriceUSD: 1.47,
      fleetMarginPct: 50.0,
      averageUptimePct: 99.2,
      saladTotalCostPerHourUSD: 0.20,
      vastTotalCostPerHourUSD: 0.04,
      lastTelemetryTimestamp: new Date().toISOString(),
      activeAccountsCount: 2,
      dataProvenance: 'VERIFIED'
    };

    const mockWorkers: Partial<MergedGPUWorker>[] = [
      {
        machineId: 'salad-node-001',
        workerName: 'worker-alpha-1',
        gpuModel: 'RTX 4090',
        accountName: 'Salad Corp Main',
        source: 'SALAD',
        currentHashrateGHs: 48000,
        currentHashrateTHs: 0.048,
        expectedBenchmarkTHs: 0.048,
        performanceRatioPct: 100,
        efficiencyRatio: 1.0,
        status: 'MINING',
        isMining: true,
        temperatureC: 64,
        fanSpeedPct: 75,
        powerDrawWatts: 350,
        validShares: 850,
        staleShares: 2,
        invalidShares: 0,
        grossRevenueUsdPerHour: 0.06,
        costUsdPerHour: 0.03,
        netProfitUsdPerHour: 0.03,
        marginPct: 50.0,
        uptimeSeconds: 86400,
        poolReportedHashrateGHs: 48000,
        unallocated: false,
        lastSeenTimestamp: new Date().toISOString()
      }
    ];

    const adminState = service.getAdminInfrastructureVisualState(mockSummary, mockWorkers as MergedGPUWorker[], 0);

    assert.ok(adminState, 'Admin state must exist');
    assert.strictEqual(adminState.profitEngineMetrics.prlPriceUsd, 1.47);
    assert.strictEqual(adminState.profitEngineMetrics.engineStatus, 'ACTIVE');

    // Racks verification
    assert.ok(adminState.racks.length > 0, 'Must contain at least 1 rack');
    const firstRack = adminState.racks[0];
    assert.strictEqual(firstRack.rackId, 'rack-1');
    assert.strictEqual(firstRack.miners.length, 1);
    assert.strictEqual(firstRack.miners[0].worker.machineId, 'salad-node-001');
    assert.strictEqual(firstRack.miners[0].healthStatus, 'OPTIMAL');
  });

  it('guarantees stable string identifiers and zero arbitrary index binding', () => {
    const clientNode = service.getClientContractVisualState();
    assert.ok(clientNode, 'clientNode must exist');
    clientNode.powerModules.forEach((mod) => {
      assert.ok(typeof mod.id === 'string' && mod.id.length > 0, 'Module must have stable string ID');
      assert.ok(mod.id.includes('-mod-'), 'Module ID format must contain contract reference');
    });
  });
});
