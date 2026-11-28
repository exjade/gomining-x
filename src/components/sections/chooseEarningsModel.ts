import { customMinerPriceTiers } from '../../minerCatalog.ts'

export type EarningsPeriod = 'daily' | 'monthly' | 'yearly'

export interface ChooseEarningsTier {
  readonly powerTh: number
  readonly priceUsd: number
}

export interface ChooseEarningsMetrics {
  readonly tierIndex: number
  readonly tier: ChooseEarningsTier
  readonly hourlyUsd: number
  readonly dailyUsd: number
  readonly monthlyUsd: number
  readonly yearlyUsd: number
  readonly periodUsd: number
  readonly periodLabel: '/ día' | '/ mes' | '/ año'
  readonly periodUnit: 'día' | 'mes' | 'año'
  readonly hourlyPearl: number
  readonly dailyPearl: number
  readonly monthlyPearl: number
  readonly periodPearl: number
  readonly launchPriceUsd: number
  readonly savingsUsd: number
  readonly savingsPct: number
  readonly pricePerTh: number
  readonly roiAnnualPct: number
  readonly paybackDays: number
  readonly paybackLabel: string
  readonly wattsEstimate: number
}

export interface PresaleActivityItem {
  readonly designIndex: number
  readonly tierIndex: number
  readonly when: string
}

export const CHOOSE_EARNINGS_TIERS: readonly ChooseEarningsTier[] = customMinerPriceTiers
export const DEFAULT_TIER_INDEX = 3 // 8 TH · $99.99
export const DEFAULT_DESIGN_INDEX = 3 // V04 Kraken
export const QUICK_TIER_INDICES: readonly number[] = [0, 3, 5, 9, 13, 21] // 1, 8, 32, 128, 512, 5,000 TH

export const GENESIS_TOTAL_SPOTS = 30
export const GENESIS_REMAINING_SPOTS = 7
export const GENESIS_TAKEN_SPOTS = GENESIS_TOTAL_SPOTS - GENESIS_REMAINING_SPOTS
export const EFFICIENCY_W_PER_TH = 15.0

const DAILY_YIELD_FACTOR = 0.1
const PEARL_USD_REF = 0.1

export const PRESALE_ACTIVITY_FEED: readonly PresaleActivityItem[] = [
  { designIndex: 5, tierIndex: 5, when: 'hace 4 min' },
  { designIndex: 3, tierIndex: 3, when: 'hace 9 min' },
  { designIndex: 8, tierIndex: 4, when: 'hace 13 min' },
  { designIndex: 1, tierIndex: 6, when: 'hace 18 min' },
  { designIndex: 9, tierIndex: 2, when: 'hace 24 min' },
  { designIndex: 6, tierIndex: 7, when: 'hace 31 min' },
]

export function clampTierIndex(index: number): number {
  if (!Number.isFinite(index)) return DEFAULT_TIER_INDEX
  return Math.max(0, Math.min(CHOOSE_EARNINGS_TIERS.length - 1, Math.round(index)))
}

export function computeLaunchPriceUsd(genesisPriceUsd: number): number {
  return Math.floor(genesisPriceUsd * 2) + 0.99
}

export function formatPaybackLabel(paybackDays: number): string {
  if (!Number.isFinite(paybackDays) || paybackDays <= 0) return '—'
  if (paybackDays < 30) {
    const rounded = Math.round(paybackDays)
    return `≈ ${rounded} ${rounded === 1 ? 'día' : 'días'}`
  }
  const months = paybackDays / 30
  return `≈ ${months.toFixed(paybackDays >= 300 ? 0 : 1)} meses`
}

export function computeChooseEarningsMetrics(
  tierIndex: number,
  period: EarningsPeriod,
): ChooseEarningsMetrics {
  const safeIndex = clampTierIndex(tierIndex)
  const tier = CHOOSE_EARNINGS_TIERS[safeIndex]
  const dailyUsd = tier.priceUsd * DAILY_YIELD_FACTOR
  const hourlyUsd = dailyUsd / 24
  const monthlyUsd = dailyUsd * 30
  const yearlyUsd = dailyUsd * 365

  const periodUsd =
    period === 'daily' ? dailyUsd : period === 'monthly' ? monthlyUsd : yearlyUsd
  const periodLabel: '/ día' | '/ mes' | '/ año' =
    period === 'daily' ? '/ día' : period === 'monthly' ? '/ mes' : '/ año'
  const periodUnit: 'día' | 'mes' | 'año' =
    period === 'daily' ? 'día' : period === 'monthly' ? 'mes' : 'año'

  const hourlyPearl = hourlyUsd / PEARL_USD_REF
  const dailyPearl = dailyUsd / PEARL_USD_REF
  const monthlyPearl = monthlyUsd / PEARL_USD_REF
  const periodPearl = periodUsd / PEARL_USD_REF
  const launchPriceUsd = computeLaunchPriceUsd(tier.priceUsd)
  const savingsUsd = Number((launchPriceUsd - tier.priceUsd).toFixed(2))
  const savingsPct =
    launchPriceUsd > 0 ? Math.round((savingsUsd / launchPriceUsd) * 100) : 0
  const pricePerTh = tier.powerTh > 0 ? tier.priceUsd / tier.powerTh : 0
  const roiAnnualPct =
    tier.priceUsd > 0 ? Math.round(((dailyUsd * 365) / tier.priceUsd) * 100) : 0
  const paybackDays = dailyUsd > 0 ? tier.priceUsd / dailyUsd : 0

  return {
    tierIndex: safeIndex,
    tier,
    hourlyUsd,
    dailyUsd,
    monthlyUsd,
    yearlyUsd,
    periodUsd,
    periodLabel,
    periodUnit,
    hourlyPearl,
    dailyPearl,
    monthlyPearl,
    periodPearl,
    launchPriceUsd,
    savingsUsd,
    savingsPct,
    pricePerTh,
    roiAnnualPct,
    paybackDays,
    paybackLabel: formatPaybackLabel(paybackDays),
    wattsEstimate: Math.round(tier.powerTh * EFFICIENCY_W_PER_TH),
  }
}

export function formatUsd(amount: number, decimals = 2): string {
  return (
    '$' +
    amount.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  )
}

export function formatTh(powerTh: number): string {
  return powerTh.toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

export function formatPearl(amount: number): string {
  const maxDecimals = amount >= 100 ? 0 : amount >= 1 ? 1 : 2
  return amount.toLocaleString('es-MX', {
    maximumFractionDigits: maxDecimals,
  })
}
