export const REFERRAL_LEVEL_WEIGHTS = [16, 15, 14, 11, 10, 9, 8, 7, 6, 4] as const

export type MiningCostInputs = {
  powerTh: number
  efficiencyWattsPerTh: number
  electricityUsdPerKwh: number
  maintenanceUsdPerThPerDay: number
  unilevelPercentOfClientPayout: number
  directReferralPercentOfClientPayout: number
  activeLevels: number
  eligibleUplineLevels?: number
  levelWeights?: readonly number[]
}

export type MiningSettlementPreview = {
  grossPoolUsd: number
  powerTh: number
  electricityKwh: number
  electricityUsd: number
  maintenanceUsd: number
  availableBeforeReferralUsd: number
  clientPayoutUsd: number
  commissionBudgetUsd: number
  directReferralUsd: number
  unilevelUsd: number
  retainedForMissingUplinesUsd: number
  levels: Array<{ level: number; weight: number; percentOfClientPayout: number; amountUsd: number; reservedUsd: number; eligible: boolean }>
}

function nonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

/**
 * Computes the mining payout with Unilevel defined as a share of the final
 * client payout. If N is the pool revenue after operating costs, P is the
 * client payout and U is the referral budget, then N = P + U and U = r * P.
 * Therefore P = N / (1 + r). The fixed direct share is part of U.
 */
export function calculateMiningSettlement(grossPoolUsd: number, input: MiningCostInputs): MiningSettlementPreview {
  const powerTh = nonNegative(input.powerTh)
  const electricityKwh = powerTh * nonNegative(input.efficiencyWattsPerTh) / 1000 * 24
  const electricityUsd = electricityKwh * nonNegative(input.electricityUsdPerKwh)
  const maintenanceUsd = powerTh * nonNegative(input.maintenanceUsdPerThPerDay)
  const safeGrossPoolUsd = nonNegative(grossPoolUsd)
  const availableBeforeReferralUsd = Math.max(0, safeGrossPoolUsd - electricityUsd - maintenanceUsd)

  const directPercent = Math.min(100, nonNegative(input.directReferralPercentOfClientPayout))
  const unilevelPercent = Math.min(100, Math.max(directPercent, nonNegative(input.unilevelPercentOfClientPayout)))
  const clientPayoutUsd = availableBeforeReferralUsd / (1 + unilevelPercent / 100)
  const commissionBudgetUsd = clientPayoutUsd * unilevelPercent / 100
  const directReferralUsd = clientPayoutUsd * directPercent / 100
  const uplinesBudget = Math.max(0, commissionBudgetUsd - directReferralUsd)

  const configuredWeights = input.levelWeights?.length ? input.levelWeights : REFERRAL_LEVEL_WEIGHTS
  const depth = Math.min(REFERRAL_LEVEL_WEIGHTS.length, Math.max(1, Math.floor(input.activeLevels)))
  const uplineWeights = configuredWeights.slice(1, depth).map(nonNegative)
  const totalWeight = uplineWeights.reduce((sum, weight) => sum + weight, 0)
  const eligibleUplineLevels = Math.min(uplineWeights.length, Math.max(0, Math.floor(input.eligibleUplineLevels ?? uplineWeights.length)))
  const levels = uplineWeights.map((weight, index) => {
    const allocationUsd = totalWeight ? uplinesBudget * weight / totalWeight : 0
    const eligible = index < eligibleUplineLevels
    const amountUsd = eligible ? allocationUsd : 0
    return {
      level: index + 2,
      weight,
      percentOfClientPayout: clientPayoutUsd ? allocationUsd / clientPayoutUsd * 100 : 0,
      amountUsd,
      reservedUsd: eligible ? 0 : allocationUsd,
      eligible,
    }
  })
  const distributedUsd = levels.reduce((sum, level) => sum + level.amountUsd, 0)

  return {
    grossPoolUsd: safeGrossPoolUsd,
    powerTh,
    electricityKwh,
    electricityUsd,
    maintenanceUsd,
    availableBeforeReferralUsd,
    clientPayoutUsd,
    commissionBudgetUsd,
    directReferralUsd,
    unilevelUsd: directReferralUsd + distributedUsd,
    retainedForMissingUplinesUsd: Math.max(0, commissionBudgetUsd - directReferralUsd - distributedUsd),
    levels,
  }
}
