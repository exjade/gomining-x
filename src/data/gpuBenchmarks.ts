export type SaladPriority = 'Lowest Priority' | 'Low Priority' | 'Medium Priority' | 'High Priority';
export { formatHashrate, formatHashrateCompact } from '../utils/hashrateFormatter';
export type { FormattedHashrate } from '../utils/hashrateFormatter';

export interface GPUBenchmark {
  id: string;
  model: string;
  type: 'NVIDIA Desktop' | 'NVIDIA Laptop' | 'NVIDIA Workstation' | 'AMD Desktop' | 'Cloud';
  vramGB: number;
  priority: SaladPriority;
  hourlyCost: number;
  dailyCost: number;
  expectedTHs: number;
  miningPool: string;
  expectedRevenue1h: number;
  expectedRevenue24h: number;
  expectedNet1h: number;
  expectedNet24h: number;
  efficiencyRatio: number; // TH/s per $ hourly cost
  statusRecommendation: 'HOT_PROFIT' | 'GOOD' | 'MARGINAL' | 'LOSS_RISK' | 'UNPROFITABLE';
}

// Global baseline PPS reward yield per TH/s / hr on Kryptex Pearl (PRL) pool
export const BASELINE_USD_PER_THS_HOUR = 0.0012395;
export const BASELINE_USD_PER_THS_DAY = BASELINE_USD_PER_THS_HOUR * 24;

// ---------------------------------------------------------------------------------
// CONSTANTES DE AUDITORÍA FINANCIERA REAL (DE CICLOS_DE_MINADO_PERL.XLSX)
// ---------------------------------------------------------------------------------
// 1. Spread interno no transparente de Kryptex al liquidar PRL a BTC: 3.91%
export const KRYPTEX_HIDDEN_SPREAD = 0.0391;
// 2. Fricción por comisiones de exchange y liquidación bancaria SPEI: 0.65%
export const EXCHANGE_SPEI_FRICTION = 0.0065;
// Nota: La comisión oficial de la pool (3% PPS+) ya viene descontada dentro del BASELINE_USD_PER_THS_HOUR
// Por lo tanto, la fricción adicional real no prevista en la recompensa PPS es del 4.56%:
export const TOTAL_FINANCIAL_FRICTION_PCT = 0.0456; // 4.56% de fricción neta adicional (Spread 3.91% + Exchange/SPEI 0.65%)
export const NET_AUDITED_USD_PER_THS_HOUR = BASELINE_USD_PER_THS_HOUR * (1 - TOTAL_FINANCIAL_FRICTION_PCT);
export const NET_AUDITED_USD_PER_THS_DAY = NET_AUDITED_USD_PER_THS_HOUR * 24;

export const GPU_BENCHMARKS: GPUBenchmark[] = [
  // --- LOWEST PRIORITY (Best margins on SaladCloud) ---
  {
    id: 'rtx-5090-lowest',
    model: 'RTX 5090',
    type: 'NVIDIA Desktop',
    vramGB: 32,
    priority: 'Lowest Priority',
    hourlyCost: 0.250,
    dailyCost: 6.00,
    expectedTHs: 367,
    miningPool: 'pearl',
    expectedRevenue1h: 0.4549,
    expectedRevenue24h: 10.92,
    expectedNet1h: 0.2049,
    expectedNet24h: 4.9175,
    efficiencyRatio: 367 / 0.250,
    statusRecommendation: 'HOT_PROFIT'
  },
  {
    id: 'rtx-4090-lowest',
    model: 'RTX 4090',
    type: 'NVIDIA Desktop',
    vramGB: 24,
    priority: 'Lowest Priority',
    hourlyCost: 0.160,
    dailyCost: 3.84,
    expectedTHs: 300,
    miningPool: 'pearl',
    expectedRevenue1h: 0.3718,
    expectedRevenue24h: 8.92,
    expectedNet1h: 0.2118,
    expectedNet24h: 5.0844,
    efficiencyRatio: 300 / 0.160,
    statusRecommendation: 'HOT_PROFIT'
  },
  {
    id: 'rtx-5080-lowest',
    model: 'RTX 5080',
    type: 'NVIDIA Desktop',
    vramGB: 16,
    priority: 'Lowest Priority',
    hourlyCost: 0.150,
    dailyCost: 3.60,
    expectedTHs: 205,
    miningPool: 'pearl',
    expectedRevenue1h: 0.2541,
    expectedRevenue24h: 6.10,
    expectedNet1h: 0.1041,
    expectedNet24h: 2.4983,
    efficiencyRatio: 205 / 0.150,
    statusRecommendation: 'HOT_PROFIT'
  },
  {
    id: 'rtx-5070ti-lowest',
    model: 'RTX 5070 Ti',
    type: 'NVIDIA Desktop',
    vramGB: 16,
    priority: 'Lowest Priority',
    hourlyCost: 0.100,
    dailyCost: 2.40,
    expectedTHs: 165,
    miningPool: 'pearl',
    expectedRevenue1h: 0.2045,
    expectedRevenue24h: 4.91,
    expectedNet1h: 0.1045,
    expectedNet24h: 2.5084,
    efficiencyRatio: 165 / 0.100,
    statusRecommendation: 'HOT_PROFIT'
  },
  {
    id: 'rtx-3090ti-lowest',
    model: 'RTX 3090 Ti',
    type: 'NVIDIA Desktop',
    vramGB: 24,
    priority: 'Lowest Priority',
    hourlyCost: 0.100,
    dailyCost: 2.40,
    expectedTHs: 124,
    miningPool: 'pearl',
    expectedRevenue1h: 0.1537,
    expectedRevenue24h: 3.69,
    expectedNet1h: 0.0537,
    expectedNet24h: 1.2887,
    efficiencyRatio: 124 / 0.100,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-5070-lowest',
    model: 'RTX 5070',
    type: 'NVIDIA Desktop',
    vramGB: 12,
    priority: 'Lowest Priority',
    hourlyCost: 0.080,
    dailyCost: 1.92,
    expectedTHs: 120,
    miningPool: 'pearl',
    expectedRevenue1h: 0.1487,
    expectedRevenue24h: 3.57,
    expectedNet1h: 0.0687,
    expectedNet24h: 1.65,
    efficiencyRatio: 120 / 0.080,
    statusRecommendation: 'HOT_PROFIT'
  },
  {
    id: 'rtx-3090-lowest',
    model: 'RTX 3090',
    type: 'NVIDIA Desktop',
    vramGB: 24,
    priority: 'Lowest Priority',
    hourlyCost: 0.090,
    dailyCost: 2.16,
    expectedTHs: 110,
    miningPool: 'pearl',
    expectedRevenue1h: 0.1363,
    expectedRevenue24h: 3.27,
    expectedNet1h: 0.0463,
    expectedNet24h: 1.1123,
    efficiencyRatio: 110 / 0.090,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-5090-laptop-lowest',
    model: 'RTX 5090 Laptop',
    type: 'NVIDIA Laptop',
    vramGB: 24,
    priority: 'Lowest Priority',
    hourlyCost: 0.100,
    dailyCost: 2.40,
    expectedTHs: 110,
    miningPool: 'pearl',
    expectedRevenue1h: 0.1363,
    expectedRevenue24h: 3.27,
    expectedNet1h: 0.0363,
    expectedNet24h: 0.8723,
    efficiencyRatio: 110 / 0.100,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-5080-laptop-lowest',
    model: 'RTX 5080 Laptop',
    type: 'NVIDIA Laptop',
    vramGB: 16,
    priority: 'Lowest Priority',
    hourlyCost: 0.080,
    dailyCost: 1.92,
    expectedTHs: 105,
    miningPool: 'pearl',
    expectedRevenue1h: 0.1301,
    expectedRevenue24h: 3.12,
    expectedNet1h: 0.0501,
    expectedNet24h: 1.2035,
    efficiencyRatio: 105 / 0.080,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-5060ti-lowest',
    model: 'RTX 5060 Ti',
    type: 'NVIDIA Desktop',
    vramGB: 16,
    priority: 'Lowest Priority',
    hourlyCost: 0.070,
    dailyCost: 1.68,
    expectedTHs: 88,
    miningPool: 'pearl',
    expectedRevenue1h: 0.1091,
    expectedRevenue24h: 2.62,
    expectedNet1h: 0.0391,
    expectedNet24h: 0.9378,
    efficiencyRatio: 88 / 0.070,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-4060ti-lowest',
    model: 'RTX 4060 Ti',
    type: 'NVIDIA Desktop',
    vramGB: 8,
    priority: 'Lowest Priority',
    hourlyCost: 0.065,
    dailyCost: 1.56,
    expectedTHs: 80,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0992,
    expectedRevenue24h: 2.38,
    expectedNet1h: 0.0342,
    expectedNet24h: 0.8198,
    efficiencyRatio: 80 / 0.065,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-2080ti-lowest',
    model: 'RTX 2080 Ti',
    type: 'NVIDIA Desktop',
    vramGB: 11,
    priority: 'Lowest Priority',
    hourlyCost: 0.060,
    dailyCost: 1.44,
    expectedTHs: 68,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0843,
    expectedRevenue24h: 2.02,
    expectedNet1h: 0.0243,
    expectedNet24h: 0.5829,
    efficiencyRatio: 68 / 0.060,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-2080-lowest',
    model: 'RTX 2080',
    type: 'NVIDIA Desktop',
    vramGB: 8,
    priority: 'Lowest Priority',
    hourlyCost: 0.050,
    dailyCost: 1.20,
    expectedTHs: 60,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0744,
    expectedRevenue24h: 1.78,
    expectedNet1h: 0.0244,
    expectedNet24h: 0.5849,
    efficiencyRatio: 60 / 0.050,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-3060-lowest-8g',
    model: 'RTX 3060',
    type: 'NVIDIA Desktop',
    vramGB: 8,
    priority: 'Lowest Priority',
    hourlyCost: 0.030,
    dailyCost: 0.72,
    expectedTHs: 60,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0744,
    expectedRevenue24h: 1.78,
    expectedNet1h: 0.0444,
    expectedNet24h: 1.0649,
    efficiencyRatio: 60 / 0.030,
    statusRecommendation: 'HOT_PROFIT'
  },
  {
    id: 'rtx-4060-lowest',
    model: 'RTX 4060',
    type: 'NVIDIA Desktop',
    vramGB: 8,
    priority: 'Lowest Priority',
    hourlyCost: 0.050,
    dailyCost: 1.20,
    expectedTHs: 55,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0682,
    expectedRevenue24h: 1.64,
    expectedNet1h: 0.0182,
    expectedNet24h: 0.4361,
    efficiencyRatio: 55 / 0.050,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-3060-lowest-12g',
    model: 'RTX 3060',
    type: 'NVIDIA Desktop',
    vramGB: 12,
    priority: 'Lowest Priority',
    hourlyCost: 0.040,
    dailyCost: 0.96,
    expectedTHs: 43,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0533,
    expectedRevenue24h: 1.28,
    expectedNet1h: 0.0133,
    expectedNet24h: 0.3192,
    efficiencyRatio: 43 / 0.040,
    statusRecommendation: 'MARGINAL'
  },
  {
    id: 'rtx-5070ti-laptop-lowest',
    model: 'RTX 5070 Ti Laptop',
    type: 'NVIDIA Laptop',
    vramGB: 12,
    priority: 'Lowest Priority',
    hourlyCost: 0.060,
    dailyCost: 1.44,
    expectedTHs: 45,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0558,
    expectedRevenue24h: 1.34,
    expectedNet1h: -0.0042,
    expectedNet24h: -0.1013,
    efficiencyRatio: 45 / 0.060,
    statusRecommendation: 'UNPROFITABLE'
  },
  {
    id: 'rtx-3050-lowest',
    model: 'RTX 3050',
    type: 'NVIDIA Desktop',
    vramGB: 8,
    priority: 'Lowest Priority',
    hourlyCost: 0.030,
    dailyCost: 0.72,
    expectedTHs: 28,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0347,
    expectedRevenue24h: 0.83,
    expectedNet1h: 0.0047,
    expectedNet24h: 0.1129,
    efficiencyRatio: 28 / 0.030,
    statusRecommendation: 'MARGINAL'
  },
  {
    id: 'rtx-3060-laptop-lowest',
    model: 'RTX 3060 Laptop',
    type: 'NVIDIA Laptop',
    vramGB: 6,
    priority: 'Lowest Priority',
    hourlyCost: 0.023,
    dailyCost: 0.55,
    expectedTHs: 25,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0310,
    expectedRevenue24h: 0.74,
    expectedNet1h: 0.0080,
    expectedNet24h: 0.1917,
    efficiencyRatio: 25 / 0.023,
    statusRecommendation: 'MARGINAL'
  },
  {
    id: 'gtx-1660s-lowest',
    model: 'GTX 1660 Super',
    type: 'NVIDIA Desktop',
    vramGB: 6,
    priority: 'Lowest Priority',
    hourlyCost: 0.020,
    dailyCost: 0.48,
    expectedTHs: 1,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0012,
    expectedRevenue24h: 0.03,
    expectedNet1h: -0.0188,
    expectedNet24h: -0.4503,
    efficiencyRatio: 1 / 0.020,
    statusRecommendation: 'UNPROFITABLE'
  },

  // --- LOW PRIORITY ---
  {
    id: 'rtx-5090-low',
    model: 'RTX 5090',
    type: 'NVIDIA Desktop',
    vramGB: 32,
    priority: 'Low Priority',
    hourlyCost: 0.333,
    dailyCost: 7.99,
    expectedTHs: 367,
    miningPool: 'pearl',
    expectedRevenue1h: 0.4549,
    expectedRevenue24h: 10.92,
    expectedNet1h: 0.1219,
    expectedNet24h: 2.9255,
    efficiencyRatio: 367 / 0.333,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-5080-low',
    model: 'RTX 5080',
    type: 'NVIDIA Desktop',
    vramGB: 16,
    priority: 'Low Priority',
    hourlyCost: 0.187,
    dailyCost: 4.49,
    expectedTHs: 205,
    miningPool: 'pearl',
    expectedRevenue1h: 0.2541,
    expectedRevenue24h: 6.10,
    expectedNet1h: 0.0671,
    expectedNet24h: 1.6103,
    efficiencyRatio: 205 / 0.187,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-5070ti-low',
    model: 'RTX 5070 Ti',
    type: 'NVIDIA Desktop',
    vramGB: 16,
    priority: 'Low Priority',
    hourlyCost: 0.142,
    dailyCost: 3.41,
    expectedTHs: 165,
    miningPool: 'pearl',
    expectedRevenue1h: 0.2045,
    expectedRevenue24h: 4.91,
    expectedNet1h: 0.0625,
    expectedNet24h: 1.5004,
    efficiencyRatio: 165 / 0.142,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-3090ti-low',
    model: 'RTX 3090 Ti',
    type: 'NVIDIA Desktop',
    vramGB: 24,
    priority: 'Low Priority',
    hourlyCost: 0.130,
    dailyCost: 3.12,
    expectedTHs: 124,
    miningPool: 'pearl',
    expectedRevenue1h: 0.1537,
    expectedRevenue24h: 3.69,
    expectedNet1h: 0.0237,
    expectedNet24h: 0.5687,
    efficiencyRatio: 124 / 0.130,
    statusRecommendation: 'MARGINAL'
  },
  {
    id: 'rtx-5070-low',
    model: 'RTX 5070',
    type: 'NVIDIA Desktop',
    vramGB: 12,
    priority: 'Low Priority',
    hourlyCost: 0.108,
    dailyCost: 2.59,
    expectedTHs: 120,
    miningPool: 'pearl',
    expectedRevenue1h: 0.1487,
    expectedRevenue24h: 3.57,
    expectedNet1h: 0.0407,
    expectedNet24h: 0.9777,
    efficiencyRatio: 120 / 0.108,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-3090-low',
    model: 'RTX 3090',
    type: 'NVIDIA Desktop',
    vramGB: 24,
    priority: 'Low Priority',
    hourlyCost: 0.117,
    dailyCost: 2.81,
    expectedTHs: 110,
    miningPool: 'pearl',
    expectedRevenue1h: 0.1363,
    expectedRevenue24h: 3.27,
    expectedNet1h: 0.0193,
    expectedNet24h: 0.4643,
    efficiencyRatio: 110 / 0.117,
    statusRecommendation: 'MARGINAL'
  },
  {
    id: 'rtx-5090-laptop-low',
    model: 'RTX 5090 Laptop',
    type: 'NVIDIA Laptop',
    vramGB: 24,
    priority: 'Low Priority',
    hourlyCost: 0.145,
    dailyCost: 3.48,
    expectedTHs: 110,
    miningPool: 'pearl',
    expectedRevenue1h: 0.1363,
    expectedRevenue24h: 3.27,
    expectedNet1h: -0.0087,
    expectedNet24h: -0.2077,
    efficiencyRatio: 110 / 0.145,
    statusRecommendation: 'UNPROFITABLE'
  },
  {
    id: 'rtx-4060ti-low',
    model: 'RTX 4060 Ti',
    type: 'NVIDIA Desktop',
    vramGB: 16,
    priority: 'Low Priority',
    hourlyCost: 0.100,
    dailyCost: 2.40,
    expectedTHs: 80,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0992,
    expectedRevenue24h: 2.38,
    expectedNet1h: -0.0008,
    expectedNet24h: -0.0202,
    efficiencyRatio: 80 / 0.100,
    statusRecommendation: 'LOSS_RISK'
  },
  {
    id: 'rtx-3070ti-low',
    model: 'RTX 3070 Ti',
    type: 'NVIDIA Desktop',
    vramGB: 8,
    priority: 'Low Priority',
    hourlyCost: 0.073,
    dailyCost: 1.75,
    expectedTHs: 70,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0868,
    expectedRevenue24h: 2.08,
    expectedNet1h: 0.0138,
    expectedNet24h: 0.3303,
    efficiencyRatio: 70 / 0.073,
    statusRecommendation: 'MARGINAL'
  },
  {
    id: 'rtx-2080ti-low',
    model: 'RTX 2080 Ti',
    type: 'NVIDIA Desktop',
    vramGB: 11,
    priority: 'Low Priority',
    hourlyCost: 0.073,
    dailyCost: 1.75,
    expectedTHs: 68,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0843,
    expectedRevenue24h: 2.02,
    expectedNet1h: 0.0113,
    expectedNet24h: 0.2709,
    efficiencyRatio: 68 / 0.073,
    statusRecommendation: 'MARGINAL'
  },
  {
    id: 'rtx-2080-low',
    model: 'RTX 2080',
    type: 'NVIDIA Desktop',
    vramGB: 8,
    priority: 'Low Priority',
    hourlyCost: 0.060,
    dailyCost: 1.44,
    expectedTHs: 60,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0744,
    expectedRevenue24h: 1.78,
    expectedNet1h: 0.0144,
    expectedNet24h: 0.3449,
    efficiencyRatio: 60 / 0.060,
    statusRecommendation: 'MARGINAL'
  },
  {
    id: 'rtx-4060-low',
    model: 'RTX 4060',
    type: 'NVIDIA Desktop',
    vramGB: 8,
    priority: 'Low Priority',
    hourlyCost: 0.060,
    dailyCost: 1.44,
    expectedTHs: 55,
    miningPool: 'pearl',
    expectedRevenue1h: 0.0682,
    expectedRevenue24h: 1.64,
    expectedNet1h: 0.0082,
    expectedNet24h: 0.1961,
    efficiencyRatio: 55 / 0.060,
    statusRecommendation: 'MARGINAL'
  },

  // --- MEDIUM & HIGH PRIORITY ---
  {
    id: 'rtx-4090-high',
    model: 'RTX 4090',
    type: 'NVIDIA Desktop',
    vramGB: 24,
    priority: 'High Priority',
    hourlyCost: 0.330,
    dailyCost: 7.92,
    expectedTHs: 307,
    miningPool: 'pearl',
    expectedRevenue1h: 0.3805,
    expectedRevenue24h: 9.13,
    expectedNet1h: 0.0505,
    expectedNet24h: 1.2126,
    efficiencyRatio: 307 / 0.330,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-4090-medium',
    model: 'RTX 4090',
    type: 'NVIDIA Desktop',
    vramGB: 24,
    priority: 'Medium Priority',
    hourlyCost: 0.273,
    dailyCost: 6.55,
    expectedTHs: 300,
    miningPool: 'pearl',
    expectedRevenue1h: 0.3718,
    expectedRevenue24h: 8.92,
    expectedNet1h: 0.0988,
    expectedNet24h: 2.3724,
    efficiencyRatio: 300 / 0.273,
    statusRecommendation: 'GOOD'
  },
  {
    id: 'rtx-5080-medium',
    model: 'RTX 5080',
    type: 'NVIDIA Desktop',
    vramGB: 16,
    priority: 'Medium Priority',
    hourlyCost: 0.223,
    dailyCost: 5.35,
    expectedTHs: 205,
    miningPool: 'pearl',
    expectedRevenue1h: 0.2541,
    expectedRevenue24h: 6.10,
    expectedNet1h: 0.0311,
    expectedNet24h: 0.7463,
    efficiencyRatio: 205 / 0.223,
    statusRecommendation: 'MARGINAL'
  },
  {
    id: 'rtx-5070ti-medium',
    model: 'RTX 5070 Ti',
    type: 'NVIDIA Desktop',
    vramGB: 16,
    priority: 'Medium Priority',
    hourlyCost: 0.183,
    dailyCost: 4.39,
    expectedTHs: 165,
    miningPool: 'pearl',
    expectedRevenue1h: 0.2045,
    expectedRevenue24h: 4.91,
    expectedNet1h: 0.0215,
    expectedNet24h: 0.5164,
    efficiencyRatio: 165 / 0.183,
    statusRecommendation: 'MARGINAL'
  },
  {
    id: 'rtx-3090-medium',
    model: 'RTX 3090',
    type: 'NVIDIA Desktop',
    vramGB: 24,
    priority: 'Medium Priority',
    hourlyCost: 0.143,
    dailyCost: 3.43,
    expectedTHs: 110,
    miningPool: 'pearl',
    expectedRevenue1h: 0.1363,
    expectedRevenue24h: 3.27,
    expectedNet1h: -0.0067,
    expectedNet24h: -0.1597,
    efficiencyRatio: 110 / 0.143,
    statusRecommendation: 'LOSS_RISK'
  }
];

// Helper to look up baseline benchmark for a given model
export function getBenchmarkForModel(modelName: string, priority?: SaladPriority): GPUBenchmark | undefined {
  const norm = modelName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const matches = GPU_BENCHMARKS.filter(b => {
    const bNorm = b.model.toLowerCase().replace(/[^a-z0-9]/g, '');
    return bNorm === norm || norm.includes(bNorm) || bNorm.includes(norm);
  });

  if (matches.length === 0) return undefined;
  if (priority) {
    const exact = matches.find(m => m.priority.toLowerCase() === priority.toLowerCase());
    if (exact) return exact;
  }
  return matches[0];
}

// Calculate Break-even hashrate in TH/s required to not lose money
// applyFriction = true (por defecto): descuenta spread y pool fee de Kryptex para dar el valor REAL y evitar sesgos
export function calculateBreakEvenTHs(
  hourlyCost: number, 
  customYieldPerTHsHour = BASELINE_USD_PER_THS_HOUR,
  applyFriction: boolean = true
): number {
  const effectiveYield = applyFriction 
    ? (customYieldPerTHsHour * (1 - TOTAL_FINANCIAL_FRICTION_PCT))
    : customYieldPerTHsHour;
  if (effectiveYield <= 0) return 0;
  return Number((hourlyCost / effectiveYield).toFixed(1));
}

export interface AuditedProfitReport {
  hashrateTHs: number;
  hourlyCostUSD: number;
  grossRevenue1h: number;
  frictionDeduction1h: number;
  netRevenue1h: number;
  netProfit1h: number;
  netProfit24h: number;
  breakEvenTHs: number;
  safetyMarginPct: number;
  verdict: 'HOT_PROFIT' | 'MARGINAL_RISK' | 'LOSS_RISK' | 'CRITICAL_LOSS';
  verdictMessage: string;
}

// Auditoría financiera completa sin sesgo para una GPU o Flota
export function calculateAuditedProfitability(
  hashrateTHs: number,
  hourlyCostUSD: number,
  customYieldPerTHsHour = BASELINE_USD_PER_THS_HOUR
): AuditedProfitReport {
  const grossRevenue1h = hashrateTHs * customYieldPerTHsHour;
  const frictionDeduction1h = grossRevenue1h * TOTAL_FINANCIAL_FRICTION_PCT;
  const netRevenue1h = grossRevenue1h - frictionDeduction1h;
  const netProfit1h = netRevenue1h - hourlyCostUSD;
  const netProfit24h = netProfit1h * 24;
  
  const breakEvenTHs = calculateBreakEvenTHs(hourlyCostUSD, customYieldPerTHsHour, true);
  const safetyMarginPct = breakEvenTHs > 0 ? ((hashrateTHs - breakEvenTHs) / breakEvenTHs) * 100 : 0;
  
  let verdict: 'HOT_PROFIT' | 'MARGINAL_RISK' | 'LOSS_RISK' | 'CRITICAL_LOSS';
  let verdictMessage: string;
  
  if (netProfit1h > 0 && safetyMarginPct >= 25) {
    verdict = 'HOT_PROFIT';
    verdictMessage = `Operación altamente rentable (+${safetyMarginPct.toFixed(0)}% sobre punto de equilibrio de ${breakEvenTHs} TH/s).`;
  } else if (netProfit1h > 0) {
    verdict = 'MARGINAL_RISK';
    verdictMessage = `Margen estrecho (+${safetyMarginPct.toFixed(0)}%). Sensible a caídas de hashrate o aumento de dificultad.`;
  } else if (netProfit1h >= -0.02) {
    verdict = 'LOSS_RISK';
    verdictMessage = `Operando en pérdida leve (-$${Math.abs(netProfit1h).toFixed(3)}/h). Requiere al menos ${breakEvenTHs} TH/s.`;
  } else {
    verdict = 'CRITICAL_LOSS';
    verdictMessage = `🚨 PÉRDIDA CRÍTICA: Gasto de Salad ($${hourlyCostUSD.toFixed(3)}/h) supera ingresos reales (-$${Math.abs(netProfit1h).toFixed(3)}/h).`;
  }
  
  return {
    hashrateTHs,
    hourlyCostUSD,
    grossRevenue1h,
    frictionDeduction1h,
    netRevenue1h,
    netProfit1h,
    netProfit24h,
    breakEvenTHs,
    safetyMarginPct,
    verdict,
    verdictMessage
  };
}

// ---------------------------------------------------------------------------------
// TABLA AUTORITATIVA DE GPUS VERIFICADAS DEL EXCEL (Ciclos_de_minado_PERL.xlsx)
// ---------------------------------------------------------------------------------
export interface VerifiedExcelGPU {
  id: string;
  name: string;
  series: string;
  vram: number;
  expectedTHs: number;
  hourlyCost: number;
  dailyCost: number;
  targetMin: number;
  targetMax: number;
  badge?: string;
  isLiveFleet?: boolean;
}

export const VERIFIED_EXCEL_GPUS: VerifiedExcelGPU[] = [
  {
    id: 'live-fleet',
    name: 'Flota Real Activa (Telemetría en Vivo)',
    series: 'SaladCloud Multi-Node Live',
    vram: 48,
    expectedTHs: 614.0,
    hourlyCost: 0.660,
    dailyCost: 15.84,
    targetMin: 580,
    targetMax: 650,
    badge: 'TELEMETRÍA REAL',
    isLiveFleet: true
  },
  {
    id: 'rtx-5090',
    name: 'NVIDIA RTX 5090',
    series: 'Blackwell Desktop Flagship',
    vram: 32,
    expectedTHs: 367.0,
    hourlyCost: 0.333,
    dailyCost: 7.992,
    targetMin: 345,
    targetMax: 390,
    badge: 'MÁXIMO PODER'
  },
  {
    id: 'rtx-4090',
    name: 'NVIDIA RTX 4090',
    series: 'Ada Lovelace Desktop Flagship',
    vram: 24,
    expectedTHs: 307.0,
    hourlyCost: 0.330,
    dailyCost: 7.920,
    targetMin: 285,
    targetMax: 330,
    badge: 'TOP FLOTA ACTUAL'
  },
  {
    id: 'rtx-5080',
    name: 'NVIDIA RTX 5080',
    series: 'Blackwell Desktop High-End',
    vram: 16,
    expectedTHs: 205.0,
    hourlyCost: 0.187,
    dailyCost: 4.488,
    targetMin: 190,
    targetMax: 220,
    badge: 'ALTA EFICIENCIA'
  },
  {
    id: 'rtx-5070ti',
    name: 'NVIDIA RTX 5070 Ti',
    series: 'Blackwell Desktop Performance',
    vram: 16,
    expectedTHs: 165.0,
    hourlyCost: 0.142,
    dailyCost: 3.408,
    targetMin: 150,
    targetMax: 180,
    badge: 'EXCELENTE MARGEN'
  },
  {
    id: 'rtx-3090ti',
    name: 'NVIDIA RTX 3090 Ti',
    series: 'Ampere Desktop Flagship',
    vram: 24,
    expectedTHs: 124.0,
    hourlyCost: 0.130,
    dailyCost: 3.120,
    targetMin: 115,
    targetMax: 135,
    badge: 'ESTABLE'
  },
  {
    id: 'rtx-5070',
    name: 'NVIDIA RTX 5070',
    series: 'Blackwell Desktop Sweet-Spot',
    vram: 12,
    expectedTHs: 120.0,
    hourlyCost: 0.108,
    dailyCost: 2.592,
    targetMin: 110,
    targetMax: 130,
    badge: 'EQUILIBRADO'
  },
  {
    id: 'rtx-3090',
    name: 'NVIDIA RTX 3090',
    series: 'Ampere Desktop 24GB',
    vram: 24,
    expectedTHs: 110.0,
    hourlyCost: 0.117,
    dailyCost: 2.808,
    targetMin: 100,
    targetMax: 120,
    badge: 'RENTABLE'
  },
  {
    id: 'rtx-5090-laptop',
    name: 'NVIDIA RTX 5090 Laptop',
    series: 'Blackwell Mobile Flagship',
    vram: 24,
    expectedTHs: 110.0,
    hourlyCost: 0.145,
    dailyCost: 3.480,
    targetMin: 100,
    targetMax: 120,
    badge: 'MOBILE'
  },
  {
    id: 'rtx-5080-laptop',
    name: 'NVIDIA RTX 5080 Laptop',
    series: 'Blackwell Mobile High-End',
    vram: 16,
    expectedTHs: 105.0,
    hourlyCost: 0.112,
    dailyCost: 2.688,
    targetMin: 95,
    targetMax: 115,
    badge: 'MOBILE'
  },
  {
    id: 'rtx-5060ti',
    name: 'NVIDIA RTX 5060 Ti',
    series: 'Blackwell Desktop Mid-Range',
    vram: 16,
    expectedTHs: 88.0,
    hourlyCost: 0.097,
    dailyCost: 2.328,
    targetMin: 80,
    targetMax: 96,
    badge: 'BAJO CONSUMO'
  },
  {
    id: 'rtx-4060ti',
    name: 'NVIDIA RTX 4060 Ti',
    series: 'Ada Lovelace 16GB',
    vram: 16,
    expectedTHs: 80.0,
    hourlyCost: 0.100,
    dailyCost: 2.400,
    targetMin: 72,
    targetMax: 88,
    badge: 'ENTRY'
  },
  {
    id: 'rtx-2080ti',
    name: 'NVIDIA RTX 2080 Ti',
    series: 'Turing Desktop Flagship',
    vram: 11,
    expectedTHs: 68.0,
    hourlyCost: 0.073,
    dailyCost: 1.752,
    targetMin: 60,
    targetMax: 76,
    badge: 'ECONÓMICO'
  },
  {
    id: 'rtx-2080',
    name: 'NVIDIA RTX 2080',
    series: 'Turing Desktop Standard',
    vram: 8,
    expectedTHs: 60.0,
    hourlyCost: 0.060,
    dailyCost: 1.440,
    targetMin: 52,
    targetMax: 68,
    badge: 'MIN COST'
  },
  {
    id: 'rtx-5070ti-laptop',
    name: 'NVIDIA RTX 5070 Ti Laptop',
    series: 'Blackwell Mobile Mid',
    vram: 12,
    expectedTHs: 45.0,
    hourlyCost: 0.083,
    dailyCost: 1.992,
    targetMin: 38,
    targetMax: 52,
    badge: 'MOBILE'
  }
];

// Resolución automática del benchmark verificado por modelo de GPU detectado
export function resolveGpuBenchmark(rawGpu: string): VerifiedExcelGPU {
  const norm = (rawGpu || '').toLowerCase();
  const isLaptop = norm.includes('laptop') || norm.includes('mobile');
  
  if (norm.includes('5090')) {
    return isLaptop 
      ? (VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-5090-laptop') || VERIFIED_EXCEL_GPUS[1])
      : (VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-5090') || VERIFIED_EXCEL_GPUS[1]);
  }
  if (norm.includes('4090')) {
    return VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-4090') || VERIFIED_EXCEL_GPUS[2];
  }
  if (norm.includes('5080')) {
    return isLaptop 
      ? (VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-5080-laptop') || VERIFIED_EXCEL_GPUS[3])
      : (VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-5080') || VERIFIED_EXCEL_GPUS[3]);
  }
  if (norm.includes('5070') && (norm.includes('ti') || norm.includes('super'))) {
    return isLaptop 
      ? (VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-5070ti-laptop') || VERIFIED_EXCEL_GPUS[4])
      : (VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-5070ti') || VERIFIED_EXCEL_GPUS[4]);
  }
  if (norm.includes('5070')) {
    return VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-5070') || VERIFIED_EXCEL_GPUS[6];
  }
  if (norm.includes('3090') && norm.includes('ti')) {
    return VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-3090ti') || VERIFIED_EXCEL_GPUS[5];
  }
  if (norm.includes('3090')) {
    return VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-3090') || VERIFIED_EXCEL_GPUS[7];
  }
  if (norm.includes('5060')) {
    return VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-5060ti') || VERIFIED_EXCEL_GPUS[10];
  }
  if (norm.includes('4060')) {
    return VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-4060ti') || VERIFIED_EXCEL_GPUS[11];
  }
  if (norm.includes('2080') && norm.includes('ti')) {
    return VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-2080ti') || VERIFIED_EXCEL_GPUS[12];
  }
  if (norm.includes('2080')) {
    return VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-2080') || VERIFIED_EXCEL_GPUS[13];
  }
  
  // Por defecto retorna RTX 4090 (base del clúster actual)
  return VERIFIED_EXCEL_GPUS.find(g => g.id === 'rtx-4090') || VERIFIED_EXCEL_GPUS[2];
}
