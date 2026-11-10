export type MinerPlan = {
  id: string
  packageId?: string
  label: string
  powerTh: number
  price: number
  currency: 'USD'
  cadence: 'once' | 'monthly'
  btcPerDay?: number
  roi?: number
  limitUnits?: number
  isPresale?: boolean
}

export const MINER_CATALOG_OBSERVED_AT = '2026-11-06T00:00:00Z'

// Preventa (Presale): 4 niveles limitados a 30 unidades cada uno
export const presaleMinerPlans: MinerPlan[] = [
  {
    id: 'presale-1',
    label: '1.46 TH',
    powerTh: 1.46,
    price: 18.99,
    currency: 'USD',
    cadence: 'once',
    btcPerDay: 0.00000062,
    roi: 52.5,
    limitUnits: 30,
    isPresale: true,
  },
  {
    id: 'presale-2',
    label: '8.33 TH',
    powerTh: 8.33,
    price: 99.99,
    currency: 'USD',
    cadence: 'once',
    btcPerDay: 0.00000354,
    roi: 55.62,
    limitUnits: 30,
    isPresale: true,
  },
  {
    id: 'presale-3',
    label: '21.05 TH',
    powerTh: 21.05,
    price: 249.99,
    currency: 'USD',
    cadence: 'once',
    btcPerDay: 0.00000894,
    roi: 56.47,
    limitUnits: 30,
    isPresale: true,
  },
  {
    id: 'presale-4',
    label: '42.44 TH',
    powerTh: 42.44,
    price: 499.99,
    currency: 'USD',
    cadence: 'once',
    btcPerDay: 0.00001802,
    roi: 57.17,
    limitUnits: 30,
    isPresale: true,
  },
]

// Lanzamiento (Launch / Marketplace): 16 niveles estándar desde 42.44 TH ($499.99) hasta 5,000 TH ($54,768.99)
export const launchMinerPlans: MinerPlan[] = [
  { id: 'launch-42', label: '42.44 TH', powerTh: 42.44, price: 499.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00001802, roi: 57.17 },
  { id: 'launch-64', label: '64 TH', powerTh: 64, price: 759.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00002717, roi: 57.2 },
  { id: 'launch-96', label: '96 TH', powerTh: 96, price: 1139.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00004075, roi: 57.2 },
  { id: 'launch-128', label: '128 TH', powerTh: 128, price: 1519.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00005434, roi: 57.2 },
  { id: 'launch-192', label: '192 TH', powerTh: 192, price: 2279.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00008150, roi: 57.2 },
  { id: 'launch-256', label: '256 TH', powerTh: 256, price: 3039.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00010867, roi: 57.2 },
  { id: 'launch-384', label: '384 TH', powerTh: 384, price: 4559.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00016301, roi: 57.2 },
  { id: 'launch-512', label: '512 TH', powerTh: 512, price: 6079.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00021734, roi: 57.2 },
  { id: 'launch-768', label: '768 TH', powerTh: 768, price: 9119.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00032602, roi: 57.2 },
  { id: 'launch-1024', label: '1,024 TH', powerTh: 1024, price: 12159.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00043469, roi: 57.2 },
  { id: 'launch-1536', label: '1,536 TH', powerTh: 1536, price: 18239.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00065203, roi: 57.2 },
  { id: 'launch-2048', label: '2,048 TH', powerTh: 2048, price: 24319.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00086938, roi: 57.2 },
  { id: 'launch-2560', label: '2,560 TH', powerTh: 2560, price: 30399.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00108672, roi: 57.2 },
  { id: 'launch-3584', label: '3,584 TH', powerTh: 3584, price: 42559.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00152141, roi: 57.2 },
  { id: 'launch-4096', label: '4,096 TH', powerTh: 4096, price: 48639.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00173875, roi: 57.2 },
  { id: 'launch-5000', label: '5,000 TH', powerTh: 5000, price: 54768.99, currency: 'USD', cadence: 'once', btcPerDay: 0.00212250, roi: 57.2 },
]

export const allMinerCatalogPlans: MinerPlan[] = [
  ...presaleMinerPlans,
  ...launchMinerPlans,
]

// Default one-time plans reference all available plans
export const oneTimeMinerPlans: MinerPlan[] = presaleMinerPlans

export const monthlyMinerPlans: MinerPlan[] = [
  { id: 'monthly-start', label: 'Inicio', powerTh: 3.82, price: 39.99, currency: 'USD', cadence: 'monthly' },
  { id: 'monthly-plus', label: 'Plus', powerTh: 9.61, price: 99.99, currency: 'USD', cadence: 'monthly' },
  { id: 'monthly-pro', label: 'Pro', powerTh: 24.20, price: 249.99, currency: 'USD', cadence: 'monthly' },
  { id: 'monthly-max', label: 'Máximo', powerTh: 48.66, price: 499.99, currency: 'USD', cadence: 'monthly' },
]

export function getSectionFallbackPlans(section: 'minerx' | 'preventa' | 'lanzamiento' | 'mensual'): MinerPlan[] {
  switch (section) {
    case 'minerx':
      return oneTimeMinerPlans
    case 'preventa':
      return presaleMinerPlans
    case 'lanzamiento':
      return launchMinerPlans
    case 'mensual':
      return monthlyMinerPlans
    default:
      return []
  }
}

export const customMinerPriceTiers: Array<{ powerTh: number; priceUsd: number }> = [
  { powerTh: 1, priceUsd: 12.99 },
  { powerTh: 2, priceUsd: 24.99 },
  { powerTh: 4, priceUsd: 49.99 },
  { powerTh: 8, priceUsd: 99.99 },
  { powerTh: 16, priceUsd: 189.99 },
  { powerTh: 32, priceUsd: 379.99 },
  { powerTh: 42.44, priceUsd: 499.99 },
  { powerTh: 64, priceUsd: 759.99 },
  { powerTh: 96, priceUsd: 1139.99 },
  { powerTh: 128, priceUsd: 1519.99 },
  { powerTh: 192, priceUsd: 2279.99 },
  { powerTh: 256, priceUsd: 3039.99 },
  { powerTh: 384, priceUsd: 4559.99 },
  { powerTh: 512, priceUsd: 6079.99 },
  { powerTh: 768, priceUsd: 9119.99 },
  { powerTh: 1024, priceUsd: 12159.99 },
  { powerTh: 1536, priceUsd: 18239.99 },
  { powerTh: 2048, priceUsd: 24319.99 },
  { powerTh: 2560, priceUsd: 30399.99 },
  { powerTh: 3584, priceUsd: 42559.99 },
  { powerTh: 4096, priceUsd: 48639.99 },
  { powerTh: 5000, priceUsd: 54768.99 },
]


