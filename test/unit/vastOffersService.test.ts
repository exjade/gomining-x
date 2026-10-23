import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VastClient } from '../../server/services/vastClient.js';
import { VastOffersService } from '../../server/services/vastOffersService.js';

describe('Vast.ai Client & Offers Service Tests', () => {
  it('masks the API key safely without revealing secrets', () => {
    const client = new VastClient({ apiKey: 'vst-secret-super-key-9988' });
    assert.equal(client.hasKey(), true);
    assert.equal(client.getMaskedKey(), 'vst-...9988');
    assert.ok(!client.getMaskedKey().includes('secret-super'));
  });

  it('runs testAccount in mock mode without making real network requests', async () => {
    const client = new VastClient({ mockMode: true });
    const res = await client.testAccount();
    assert.equal(res.success, true);
    assert.ok(res.user);
    assert.equal(res.user.balance, 50.0);
    assert.ok(res.message.includes('Simulación Mock'));
  });

  it('correctly normalizes a raw Vast.ai bundle and calculates storage $/h', () => {
    const raw = {
      id: 55443,
      machine_id: 101,
      gpu_name: 'RTX 4090',
      num_gpus: 1,
      gpu_ram: 24576,
      cpu_ram: 65536,
      cpu_cores: 16,
      disk_space: 100, // 100 GB
      dph_total: 0.32, // $0.32/h compute
      storage_cost: 0.15, // $0.15/GB/month -> (0.15 / 720) * 100 = ~0.0208 $/h
      inet_down: 800,
      inet_up: 400,
      reliability2: 0.98,
      geolocation: 'US, Ohio',
      datacenter: true,
      rentable: true
    };

    const norm = VastOffersService.normalizeOffer(raw);
    assert.equal(norm.id, '55443');
    assert.equal(norm.gpuModel, 'RTX 4090');
    assert.equal(norm.hourlyComputeCostUSD, 0.32);
    assert.equal(norm.hourlyStorageCostUSD, 0.0208);
    assert.equal(norm.totalHourlyCostUSD, 0.3408);
    assert.equal(norm.datacenter, true);
    assert.equal(norm.gpuMemoryGB, 24);
  });

  it('evaluates and scores profitable offers higher than unprofitable offers', () => {
    const profitableRaw = {
      id: 1,
      gpu_name: 'RTX 4090',
      num_gpus: 1,
      gpu_ram: 24576,
      disk_space: 32,
      dph_total: 0.20, // Low cost -> high profit
      storage_cost: 0.10,
      reliability2: 0.99,
      datacenter: true,
      rentable: true
    };

    const expensiveRaw = {
      id: 2,
      gpu_name: 'RTX 4090',
      num_gpus: 1,
      gpu_ram: 24576,
      disk_space: 32,
      dph_total: 0.80, // High cost -> loss
      storage_cost: 0.10,
      reliability2: 0.90,
      datacenter: false,
      rentable: true
    };

    const normProf = VastOffersService.normalizeOffer(profitableRaw);
    const normExp = VastOffersService.normalizeOffer(expensiveRaw);

    const scoreProf = VastOffersService.scoreOffer(normProf);
    const scoreExp = VastOffersService.scoreOffer(normExp);

    assert.ok(scoreProf.estimatedNetHourlyUSD > scoreExp.estimatedNetHourlyUSD);
    assert.ok(scoreProf.suitabilityScore > scoreExp.suitabilityScore);
    assert.equal(scoreExp.qualificationBadge, 'LOSS_RISK');
  });

  it('filters offers by GPU model and max hourly price', () => {
    const rawOffers = [
      { id: 101, gpu_name: 'RTX 4090', num_gpus: 1, dph_total: 0.30, rentable: true },
      { id: 102, gpu_name: 'RTX 4090', num_gpus: 1, dph_total: 0.65, rentable: true },
      { id: 103, gpu_name: 'RTX 3090', num_gpus: 1, dph_total: 0.15, rentable: true },
      { id: 104, gpu_name: 'RTX 4090', num_gpus: 1, dph_total: 0.25, rentable: false } // Not rentable
    ];

    const results = VastOffersService.filterAndRankOffers(rawOffers as any, {
      gpuModel: '4090',
      maxHourlyPriceUSD: 0.50
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].offer.id, '101');
  });
});
