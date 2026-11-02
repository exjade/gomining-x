export type MinerPlan = {
  id: string
  label: string
  powerTh: number
  price: number
  currency: 'MXN' | 'USD'
  cadence: 'once' | 'monthly'
}

// Prices read from the authenticated GoMining configurator on 2026-10-31.
// One-time checkout totals are shown in MXN for the account's selected region;
// recurring miner plans are quoted in USD per month.
export const MINER_CATALOG_OBSERVED_AT = '2026-10-31T07:45:59Z'

export const oneTimeMinerPlans: MinerPlan[] = [
  { id: 'entry', label: 'Esencial', powerTh: 1.12, price: 272.22, currency: 'MXN', cadence: 'once' },
  { id: 'classic', label: 'Clásico', powerTh: 8.33, price: 1878.43, currency: 'MXN', cadence: 'once' },
  { id: 'pro', label: 'Pro', powerTh: 21.05, price: 4696.35, currency: 'MXN', cadence: 'once' },
  { id: 'max', label: 'Máximo', powerTh: 42.44, price: 9392.89, currency: 'MXN', cadence: 'once' },
]

export const monthlyMinerPlans: MinerPlan[] = [
  { id: 'monthly-start', label: 'Inicio', powerTh: 3.82, price: 39.99, currency: 'USD', cadence: 'monthly' },
  { id: 'monthly-plus', label: 'Plus', powerTh: 9.61, price: 99.99, currency: 'USD', cadence: 'monthly' },
  { id: 'monthly-pro', label: 'Pro', powerTh: 24.20, price: 249.99, currency: 'USD', cadence: 'monthly' },
  { id: 'monthly-max', label: 'Máximo', powerTh: 48.66, price: 499.99, currency: 'USD', cadence: 'monthly' },
]

// Totals observed in GoMining's custom one-time calculator for each supported
// power level. Use exact tiers; don't interpolate a price between observations.
export const customMinerPriceTiers: Array<{ powerTh: number; priceMxn: number }> = [
  { powerTh: 1, priceMxn: 244.04 },
  { powerTh: 2, priceMxn: 469.47 },
  { powerTh: 4, priceMxn: 901.55 },
  { powerTh: 8, priceMxn: 1803.29 },
  { powerTh: 16, priceMxn: 3569.19 },
  { powerTh: 32, priceMxn: 7082.20 },
  { powerTh: 48, priceMxn: 10557.63 },
  { powerTh: 64, priceMxn: 13995.50 },
  { powerTh: 96, priceMxn: 20890.02 },
  { powerTh: 128, priceMxn: 27709.39 },
  { powerTh: 192, priceMxn: 41366.92 },
  { powerTh: 256, priceMxn: 54874.16 },
  { powerTh: 384, priceMxn: 81869.86 },
  { powerTh: 512, priceMxn: 108621.34 },
  { powerTh: 768, priceMxn: 162105.51 },
  { powerTh: 1024, priceMxn: 215026.09 },
  { powerTh: 1536, priceMxn: 320923.62 },
  { powerTh: 2560, priceMxn: 532155.09 },
  { powerTh: 3584, priceMxn: 741244.94 },
  { powerTh: 5000, priceMxn: 1028898.47 },
]
