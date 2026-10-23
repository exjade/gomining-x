/**
 * Vast.ai Offers & Marketplace Service
 * Normalizes, filters and scores GPU offers from Vast.ai API.
 * Complies with MinerX_CALCULADORA_RENTABILIDAD_Y_AUTOMATIZACION_VASTAI.md Section 7.3 & 10
 */

import type { VastApiRawBundle } from './vastClient.js';
import type { VastOfferNormalized } from '../../src/types/profitability.js';
import type { OfferScoreDetails } from '../../src/types/vast.js';
import { BASELINE_USD_PER_THS_HOUR } from '../../src/data/gpuBenchmarks.js';
import { VERIFIED_BENCHMARKS } from '../../src/services/profitabilityService.js';

export type { OfferScoreDetails };

export class VastOffersService {
  /**
   * Normalizes a raw Vast.ai bundle into a clean domain model
   */
  public static normalizeOffer(raw: VastApiRawBundle, defaultDiskGB: number = 32): VastOfferNormalized {
    const computeHourly = typeof raw.dph_total === 'number'
      ? raw.dph_total
      : (raw.dph_base || 0.30);

    const storageMonthRate = typeof raw.storage_cost === 'number' ? raw.storage_cost : 0.15; // $/GB/month
    const allocatedDisk = raw.disk_space || defaultDiskGB;
    // Monthly rate to hourly rate conversion (30 days * 24 hours = 720 hours)
    const storageHourly = Number(((storageMonthRate / 720) * allocatedDisk).toFixed(4));

    const totalHourly = Number((computeHourly + storageHourly).toFixed(4));

    return {
      id: String(raw.id),
      machineId: raw.machine_id,
      hostId: raw.host_id,
      gpuModel: raw.gpu_name || 'Generic GPU',
      gpuCount: raw.num_gpus || 1,
      gpuMemoryGB: Number(((raw.gpu_ram || 24576) / 1024).toFixed(1)),
      hourlyComputeCostUSD: computeHourly,
      hourlyStorageCostUSD: storageHourly,
      totalHourlyCostUSD: totalHourly,
      cpuCores: raw.cpu_cores || 8,
      cpuRAMGB: Number(((raw.cpu_ram || 32768) / 1024).toFixed(1)),
      diskSpaceGB: allocatedDisk,
      inetDownMbps: raw.inet_down || 100,
      inetUpMbps: raw.inet_up || 50,
      reliabilityScore: typeof raw.reliability2 === 'number' ? raw.reliability2 : 0.95,
      geolocation: raw.geolocation || 'Unknown',
      datacenter: !!raw.datacenter,
      rentable: raw.rentable !== false,
      rawOffer: raw
    };
  }

  /**
   * Resolves expected benchmark TH/s for a given GPU model
   */
  public static resolveBenchmarkTHs(gpuModel: string): number {
    const clean = gpuModel.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const b of VERIFIED_BENCHMARKS) {
      const cleanB = b.gpuModel.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean.includes(cleanB) || cleanB.includes(clean)) {
        return b.hashrateTHs;
      }
    }
    if (clean.includes('5090')) return 367;
    if (clean.includes('4090')) return 293;
    if (clean.includes('5080')) return 205;
    if (clean.includes('4080')) return 180;
    if (clean.includes('3090')) return 110;
    return 100; // Baseline fallback
  }

  /**
   * Evaluates and scores an offer against PearlHash/PRL economics
   */
  public static scoreOffer(
    offer: VastOfferNormalized,
    rewardUSDPerTHh: number = BASELINE_USD_PER_THS_HOUR
  ): OfferScoreDetails {
    const singleBenchmark = this.resolveBenchmarkTHs(offer.gpuModel);
    const totalBenchmarkTHs = singleBenchmark * offer.gpuCount;

    // Gross Hourly with 98% nominal uptime and 0.5% rejected
    const effectiveTHs = totalBenchmarkTHs * 0.98 * 0.995;
    const grossHourly = effectiveTHs * rewardUSDPerTHh;
    // Deduct standard 3% pool & miner fees
    const netMiningHourly = grossHourly * 0.97;
    const netHourly = netMiningHourly - offer.totalHourlyCostUSD;
    const dailyNet = netHourly * 24;

    const marginPct = netMiningHourly > 0
      ? Number(((netHourly / netMiningHourly) * 100).toFixed(2))
      : (offer.totalHourlyCostUSD === 0 ? 0 : -100);

    // Score from 0 to 100 based on net profit, margin, reliability & network speed
    let score = 50;
    if (netHourly > 0) {
      score += Math.min(30, netHourly * 100); // Up to +30 for profit
    } else {
      score -= Math.min(40, Math.abs(netHourly) * 150); // Penalty for loss
    }

    // Reliability bonus (0.9 to 1.0 -> up to +15)
    score += (offer.reliabilityScore - 0.85) * 100;

    // Datacenter bonus (+5)
    if (offer.datacenter) score += 5;

    // Internet bandwidth check
    if (offer.inetDownMbps >= 500 && offer.inetUpMbps >= 200) score += 5;

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));

    let badge: 'EXCELLENT' | 'GOOD' | 'MARGINAL' | 'LOSS_RISK' = 'MARGINAL';
    if (finalScore >= 80 && netHourly > 0.10) {
      badge = 'EXCELLENT';
    } else if (finalScore >= 65 && netHourly > 0) {
      badge = 'GOOD';
    } else if (netHourly < 0) {
      badge = 'LOSS_RISK';
    }

    return {
      offer,
      benchmarkTHs: totalBenchmarkTHs,
      expectedGrossHourlyUSD: Number(grossHourly.toFixed(4)),
      estimatedNetHourlyUSD: Number(netHourly.toFixed(4)),
      estimatedDailyNetUSD: Number(dailyNet.toFixed(3)),
      marginPct,
      suitabilityScore: finalScore,
      qualificationBadge: badge
    };
  }

  /**
   * Filters and sorts offers
   */
  public static filterAndRankOffers(
    rawOffers: VastApiRawBundle[],
    filters?: {
      gpuModel?: string;
      maxHourlyPriceUSD?: number;
      minVRAMGB?: number;
      minReliability?: number;
      datacenterOnly?: boolean;
    }
  ): OfferScoreDetails[] {
    const normalized = rawOffers.map((o) => this.normalizeOffer(o));

    const filtered = normalized.filter((o) => {
      if (!o.rentable) return false;
      if (filters?.maxHourlyPriceUSD && o.totalHourlyCostUSD > filters.maxHourlyPriceUSD) {
        return false;
      }
      if (filters?.minVRAMGB && o.gpuMemoryGB < filters.minVRAMGB) {
        return false;
      }
      if (filters?.minReliability && o.reliabilityScore < filters.minReliability) {
        return false;
      }
      if (filters?.datacenterOnly && !o.datacenter) {
        return false;
      }
      if (filters?.gpuModel) {
        const cleanO = o.gpuModel.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanFilter = filters.gpuModel.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!cleanO.includes(cleanFilter)) return false;
      }
      return true;
    });

    const scored = filtered.map((o) => this.scoreOffer(o));
    // Sort highest suitability score first
    return scored.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
  }
}
