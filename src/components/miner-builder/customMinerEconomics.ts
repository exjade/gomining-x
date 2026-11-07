import type { RewardPeriod } from './RewardsCalculator'

type MonthlyFixture = {
  poolPayoutUsd: number
  btc: number
  maintenanceUsd: number
  maintenanceTokenAmount: number
  netRewardUsd: number
  annualRoi: number
}

const monthlyFixtures: Record<number, MonthlyFixture> = {
  1: {
    poolPayoutUsd: 1.14615,
    btc: 0.00001273,
    maintenanceUsd: 0.61,
    maintenanceTokenAmount: 1.59987908,
    netRewardUsd: 0.53,
    annualRoi: 49.97,
  },
  32: {
    poolPayoutUsd: 36.83,
    btc: 0.00040917,
    maintenanceUsd: 19.37,
    maintenanceTokenAmount: 50.60235737,
    netRewardUsd: 17.45,
    annualRoi: 56.33,
  },
}

export function customMinerEconomics(powerTh: number, period: RewardPeriod, maintenanceToken: 'PEARL' | 'USDT') {
  const fixture = monthlyFixtures[powerTh]
  if (!fixture || maintenanceToken !== 'PEARL') return null

  const multiplier = period === 'daily' ? 1 / 30 : period === 'monthly' ? 1 : 365 / 30
  return {
    poolPayoutUsd: fixture.poolPayoutUsd * multiplier,
    periodBtcEstimate: fixture.btc * multiplier,
    periodMaintenanceUsd: fixture.maintenanceUsd * multiplier,
    periodMaintenanceTokenAmount: fixture.maintenanceTokenAmount * multiplier,
    netRewardUsd: fixture.netRewardUsd * multiplier,
    annualRoi: fixture.annualRoi,
  }
}
