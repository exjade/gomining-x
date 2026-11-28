/**
 * TASK_ID=EMBUDO-UNILEVEL-FARM
 * Pure, deterministic model for the 20-level Gamified Unilevel Miner Farm.
 *
 * Strict invariants:
 * - Zero client-side commission rate multiplication: all monetary amounts come strictly
 *   from backend responses (`getUnilevelStats` and `getUnilevelHistory.receivedCommissions`)
 *   summed using exact integer micro-USDT (`1 USDT = 1_000_000 micros`).
 * - Ascending upline callables are strictly excluded and NEVER accepted or read here.
 * - Zero invented person names, handles, or synthetic TH values: referrals in each farm
 *   are grouped strictly by `sourceUserId` and formatted as `first6…last4`.
 * - Chain lock (`candado en cadena`) is derived client-side over grouped `receivedCommissions`:
 *   Farm 1 is always unlocked; Farm N (2..20) unlocks if and only if Farm N-1 is unlocked
 *   and has at least 1 distinct `sourceUserId` in the grouped commission history.
 */

export interface UnilevelScheduleItem {
  readonly level: number
  readonly pctLabel: string
  readonly rateString: string
  readonly barTrackPct: number
}

export interface UnilevelStatsHeaderInput {
  readonly ownMiningProfit: number
  readonly organizationGeneratedProfitShare: number
  readonly receivedUnilevelCommission: number
  readonly directCount: number
  readonly totalTeamCount: number
  readonly activeReferredMinersCount: number
  readonly eligibleForUnilevel: boolean
  readonly planVersion: string
  readonly totalNetworkPowerTh?: number | null
}

export interface UnilevelCommissionInput {
  readonly id: string
  readonly distributionId: string
  readonly type: string
  readonly status: string
  readonly currency: string
  readonly level: number
  readonly rateString?: string
  readonly uplineUserId: string
  readonly sourceUserId: string
  readonly minerId?: string
  readonly periodDate?: string
  readonly planVersion?: string
  readonly creditedUsdt6?: string
  readonly deltaUsdt6?: string
  readonly createdAt?: unknown
}

export type FarmLevelState = 'locked' | 'empty' | 'active'

export interface UnilevelFarmEra {
  readonly id: 'basic' | 'industrial' | 'hightech' | 'megafarm'
  readonly from: number
  readonly to: number
  readonly nameEs: string
  readonly nameEn: string
  readonly descEs: string
  readonly descEn: string
}

export interface UnilevelFarmReferralItem {
  readonly sourceUserId: string
  readonly shortUid: string
  readonly avatarCode: string
  readonly totalEarnedMicros: bigint
  readonly totalEarnedUsdt2: string
  readonly totalEarnedUsdt6: string
  readonly creditedCount: number
  readonly reversedCount: number
  readonly totalEventsCount: number
  readonly latestDate: string | null
  readonly firstDate: string | null
  readonly minerIds: readonly string[]
  readonly hasPositiveNet: boolean
}

export interface UnilevelFarmLevelModel {
  readonly level: number
  readonly side: 'left' | 'right'
  readonly farmName: string
  readonly era: UnilevelFarmEra
  readonly pctLabel: string
  readonly rateString: string
  readonly barTrackPct: number
  readonly unlocked: boolean
  readonly state: FarmLevelState
  readonly sourceUserCount: number
  readonly commissionEntriesCount: number
  readonly totalEarnedMicros: bigint
  readonly totalEarnedUsdt2: string
  readonly totalEarnedUsdt6: string
  readonly positiveSourceUserCount: number
  readonly positiveRatioPct: number
  readonly referrals: readonly UnilevelFarmReferralItem[]
}

export interface UnilevelFarmMedal {
  readonly id: 'first-farm' | 'network-10' | 'full-map'
  readonly nameEs: string
  readonly nameEn: string
  readonly subEs: string
  readonly subEn: string
  readonly done: boolean
}

export interface UnilevelFarmNextUnlock {
  readonly level: number
  readonly farmName: string
  readonly requiredPrevLevel: number
  readonly prevSourceUserCount: number
}

export interface UnilevelFarmSummaryModel {
  readonly totalLevels: 20
  readonly unlockRuleDerivation: 'CLIENT_DERIVED_FROM_RECEIVED_COMMISSIONS_SOURCE_UID'
  readonly planVersion: string
  readonly directCount: number
  readonly totalTeamCount: number
  readonly activeReferredMinersCount: number
  readonly eligibleForUnilevel: boolean
  readonly ownMiningProfit: number
  readonly organizationGeneratedProfitShare: number
  readonly receivedUnilevelCommission: number
  readonly totalNetworkPowerTh: number | null
  readonly unlockedFarmsCount: number
  readonly activeFarmsCount: number
  readonly totalDistinctSourceUsersAcrossLevels: number
  readonly groupedCommissionsTotalMicros: bigint
  readonly groupedCommissionsTotalUsdt2: string
  readonly nextLockedFarm: UnilevelFarmNextUnlock | null
  readonly medals: readonly UnilevelFarmMedal[]
  readonly farms: readonly UnilevelFarmLevelModel[]
}

export const TOTAL_UNILEVEL_FARMS = 20 as const

export const UNILEVEL_FARM_NAMES: Readonly<Record<number, string>> = {
  1: 'El Cobertizo',
  2: 'Rincón del Minero',
  3: 'Taller Esmeralda',
  4: 'Galpón Alfa',
  5: 'Base Semilla',
  6: 'Patio de Contenedores',
  7: 'Fila Industrial',
  8: 'Planta Ventilada',
  9: 'Complejo Cercado',
  10: 'Nave Central',
  11: 'Torre de Enfriamiento',
  12: 'Laboratorio TH',
  13: 'Hangar Esmeralda',
  14: 'Red de Paneles',
  15: 'Núcleo High-Tech',
  16: 'Ciudad Minera',
  17: 'Distrito Hash',
  18: 'Metrópoli Minera',
  19: 'Fortaleza TH/s',
  20: 'Mega Farm Prime',
} as const

export const UNILEVEL_FARM_ERAS: readonly UnilevelFarmEra[] = [
  {
    id: 'basic',
    from: 1,
    to: 5,
    nameEs: 'Era Básica',
    nameEn: 'Basic Era',
    descEs: 'Cobertizos, un par de rigs y panel solar. Así empieza toda granja.',
    descEn: 'Starter sheds, initial rigs, and solar arrays. Every mining network starts here.',
  },
  {
    id: 'industrial',
    from: 6,
    to: 10,
    nameEs: 'Era Industrial',
    nameEn: 'Industrial Era',
    descEs: 'Contenedores, filas de rigs y ventilación seria.',
    descEn: 'Modular containers, rig rows, and high-airflow industrial cooling.',
  },
  {
    id: 'hightech',
    from: 11,
    to: 15,
    nameEs: 'Era High-Tech',
    nameEn: 'High-Tech Era',
    descEs: 'Estructuras metálicas, torres de enfriamiento y luz esmeralda.',
    descEn: 'Pressurized hangars, cooling towers, and precision emerald infrastructure.',
  },
  {
    id: 'megafarm',
    from: 16,
    to: 20,
    nameEs: 'Era Mega Farm',
    nameEn: 'Mega Farm Era',
    descEs: 'Una mini ciudad minera. Solo llegan las redes más grandes.',
    descEn: 'Metropolitan-scale mining complex across the deepest Unilevel tiers.',
  },
] as const

export function getEraForLevel(level: number): UnilevelFarmEra {
  const found = UNILEVEL_FARM_ERAS.find((era) => level >= era.from && level <= era.to)
  return found ?? UNILEVEL_FARM_ERAS[0]
}

/**
 * Formats a `sourceUserId` strictly as `first6…last4` (never invents names or handles).
 */
export function shortenSourceUid(uid: string | null | undefined): string {
  const clean = typeof uid === 'string' ? uid.trim() : ''
  if (!clean) return '—'
  if (clean.length <= 10) return clean
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`
}

/**
 * Extracts deterministic 2-character badge from `sourceUserId` without inventing initials.
 */
export function sourceUidAvatarBadge(uid: string | null | undefined): string {
  const clean = typeof uid === 'string' ? uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : ''
  if (!clean) return 'ID'
  return clean.slice(0, 2)
}

/**
 * Exact string-to-micros parser (6 decimal places, zero floating-point multiplication).
 */
export function parseSignedUsdt6ToMicros(
  raw: string | undefined | null,
  forceNegative = false,
): bigint {
  if (typeof raw !== 'string') return 0n
  const trimmed = raw.trim()
  if (!trimmed) return 0n

  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(trimmed)
  if (!match) return 0n

  const explicitSign = match[1]
  const wholePart = BigInt(match[2])
  const fracRaw = (match[3] ?? '').padEnd(6, '0').slice(0, 6)
  const fracPart = BigInt(fracRaw || '0')
  const absMicros = wholePart * 1_000_000n + fracPart

  const isNegative = explicitSign === '-' || (explicitSign !== '+' && forceNegative)
  return isNegative ? -absMicros : absMicros
}

export function resolveCommissionSignedMicros(entry: UnilevelCommissionInput): bigint {
  const isReversed =
    entry.status === 'REVERSED' || entry.type === 'UNILEVEL_PROFITSHARE_REVERSAL'
  if (typeof entry.deltaUsdt6 === 'string' && entry.deltaUsdt6.trim() !== '') {
    return parseSignedUsdt6ToMicros(entry.deltaUsdt6, isReversed)
  }
  if (typeof entry.creditedUsdt6 === 'string' && entry.creditedUsdt6.trim() !== '') {
    return parseSignedUsdt6ToMicros(entry.creditedUsdt6, isReversed)
  }
  return 0n
}

export function formatMicrosAsUsdt6(micros: bigint): string {
  const isNeg = micros < 0n
  const abs = isNeg ? -micros : micros
  const whole = abs / 1_000_000n
  const frac = (abs % 1_000_000n).toString().padStart(6, '0')
  const wholeFormatted = Number(whole).toLocaleString('en-US')
  return `${isNeg ? '-' : ''}${wholeFormatted}.${frac}`
}

export function formatMicrosAsUsdt2(micros: bigint): string {
  const isNeg = micros < 0n
  const abs = isNeg ? -micros : micros
  // Half-up rounding at cents for 2-decimal summary display while preserving exact 6-decimal ledger string
  const cents = (abs + 5_000n) / 10_000n
  const whole = cents / 100n
  const rem = (cents % 100n).toString().padStart(2, '0')
  const wholeFormatted = Number(whole).toLocaleString('en-US')
  return `${isNeg ? '-' : ''}${wholeFormatted}.${rem}`
}

export function extractCommissionDateIso(entry: UnilevelCommissionInput): string | null {
  if (typeof entry.periodDate === 'string' && entry.periodDate.trim()) {
    return entry.periodDate.trim()
  }
  const ca = entry.createdAt
  if (typeof ca === 'string' && ca.trim()) {
    return ca.trim().slice(0, 10)
  }
  if (ca && typeof ca === 'object') {
    const rec = ca as { seconds?: unknown; _seconds?: unknown }
    const secs =
      typeof rec.seconds === 'number'
        ? rec.seconds
        : typeof rec._seconds === 'number'
          ? rec._seconds
          : null
    if (secs !== null && Number.isFinite(secs)) {
      return new Date(secs * 1000).toISOString().slice(0, 10)
    }
  }
  return null
}

export function buildUnilevelFarmSummary(params: {
  stats: UnilevelStatsHeaderInput | null | undefined
  schedule: readonly UnilevelScheduleItem[]
  receivedCommissions: readonly UnilevelCommissionInput[]
}): UnilevelFarmSummaryModel {
  const { stats, schedule, receivedCommissions } = params

  // Group receivedCommissions by level (1..20) -> sourceUserId
  interface MutableRefAccumulator {
    sourceUserId: string
    totalEarnedMicros: bigint
    creditedCount: number
    reversedCount: number
    totalEventsCount: number
    latestDate: string | null
    firstDate: string | null
    minerIdSet: Set<string>
  }

  const byLevel = new Map<number, Map<string, MutableRefAccumulator>>()
  const entriesCountByLevel = new Map<number, number>()
  const globalDistinctSourceUsers = new Set<string>()
  let groupedCommissionsTotalMicros = 0n

  for (let lvl = 1; lvl <= TOTAL_UNILEVEL_FARMS; lvl += 1) {
    byLevel.set(lvl, new Map())
    entriesCountByLevel.set(lvl, 0)
  }

  for (const entry of receivedCommissions || []) {
    if (!entry || typeof entry !== 'object') continue
    const level = Number(entry.level)
    if (!Number.isInteger(level) || level < 1 || level > TOTAL_UNILEVEL_FARMS) continue
    const sourceUid = typeof entry.sourceUserId === 'string' ? entry.sourceUserId.trim() : ''
    if (!sourceUid) continue

    const levelMap = byLevel.get(level)!
    entriesCountByLevel.set(level, (entriesCountByLevel.get(level) ?? 0) + 1)
    globalDistinctSourceUsers.add(sourceUid)

    const signedMicros = resolveCommissionSignedMicros(entry)
    groupedCommissionsTotalMicros += signedMicros
    const isReversed =
      entry.status === 'REVERSED' || entry.type === 'UNILEVEL_PROFITSHARE_REVERSAL'
    const dateStr = extractCommissionDateIso(entry)

    let acc = levelMap.get(sourceUid)
    if (!acc) {
      acc = {
        sourceUserId: sourceUid,
        totalEarnedMicros: 0n,
        creditedCount: 0,
        reversedCount: 0,
        totalEventsCount: 0,
        latestDate: null,
        firstDate: null,
        minerIdSet: new Set<string>(),
      }
      levelMap.set(sourceUid, acc)
    }

    acc.totalEarnedMicros += signedMicros
    acc.totalEventsCount += 1
    if (isReversed) {
      acc.reversedCount += 1
    } else {
      acc.creditedCount += 1
    }
    if (dateStr) {
      if (!acc.latestDate || dateStr > acc.latestDate) {
        acc.latestDate = dateStr
      }
      if (!acc.firstDate || dateStr < acc.firstDate) {
        acc.firstDate = dateStr
      }
    }
    if (typeof entry.minerId === 'string' && entry.minerId.trim()) {
      acc.minerIdSet.add(entry.minerId.trim())
    }
  }

  const farms: UnilevelFarmLevelModel[] = []

  for (let level = 1; level <= TOTAL_UNILEVEL_FARMS; level += 1) {
    const scheduleRow = schedule[level - 1] ?? {
      level,
      pctLabel: '—',
      rateString: '0',
      barTrackPct: 0,
    }
    const levelMap = byLevel.get(level)!
    const referrals: UnilevelFarmReferralItem[] = Array.from(levelMap.values())
      .map((acc) => ({
        sourceUserId: acc.sourceUserId,
        shortUid: shortenSourceUid(acc.sourceUserId),
        avatarCode: sourceUidAvatarBadge(acc.sourceUserId),
        totalEarnedMicros: acc.totalEarnedMicros,
        totalEarnedUsdt2: formatMicrosAsUsdt2(acc.totalEarnedMicros),
        totalEarnedUsdt6: formatMicrosAsUsdt6(acc.totalEarnedMicros),
        creditedCount: acc.creditedCount,
        reversedCount: acc.reversedCount,
        totalEventsCount: acc.totalEventsCount,
        latestDate: acc.latestDate,
        firstDate: acc.firstDate,
        minerIds: Array.from(acc.minerIdSet),
        hasPositiveNet: acc.totalEarnedMicros > 0n,
      }))
      .sort((a, b) => {
        if (b.totalEarnedMicros !== a.totalEarnedMicros) {
          return b.totalEarnedMicros > a.totalEarnedMicros ? 1 : -1
        }
        const dateCmp = (b.latestDate ?? '').localeCompare(a.latestDate ?? '')
        if (dateCmp !== 0) return dateCmp
        return a.sourceUserId.localeCompare(b.sourceUserId)
      })

    const prevFarm = level > 1 ? farms[level - 2] : null
    // Chain lock: Farm 1 is always open; Farm N opens only if Farm N-1 is unlocked AND has >= 1 sourceUserId
    const unlocked = level === 1 ? true : Boolean(prevFarm && prevFarm.unlocked && prevFarm.sourceUserCount >= 1)
    const state: FarmLevelState = !unlocked
      ? 'locked'
      : referrals.length > 0
        ? 'active'
        : 'empty'

    let levelTotalMicros = 0n
    let positiveCount = 0
    for (const ref of referrals) {
      levelTotalMicros += ref.totalEarnedMicros
      if (ref.hasPositiveNet) positiveCount += 1
    }

    const positiveRatioPct =
      referrals.length > 0 ? Math.round((positiveCount / referrals.length) * 100) : 0

    farms.push({
      level,
      side: level % 2 === 1 ? 'left' : 'right',
      farmName: UNILEVEL_FARM_NAMES[level] ?? `Granja ${level}`,
      era: getEraForLevel(level),
      pctLabel: scheduleRow.pctLabel,
      rateString: scheduleRow.rateString,
      barTrackPct: scheduleRow.barTrackPct,
      unlocked,
      state,
      sourceUserCount: referrals.length,
      commissionEntriesCount: entriesCountByLevel.get(level) ?? 0,
      totalEarnedMicros: levelTotalMicros,
      totalEarnedUsdt2: formatMicrosAsUsdt2(levelTotalMicros),
      totalEarnedUsdt6: formatMicrosAsUsdt6(levelTotalMicros),
      positiveSourceUserCount: positiveCount,
      positiveRatioPct,
      referrals,
    })
  }

  const unlockedFarmsCount = farms.filter((f) => f.unlocked).length
  const activeFarmsCount = farms.filter((f) => f.state === 'active').length
  const firstLocked = farms.find((f) => !f.unlocked) ?? null
  const nextLockedFarm: UnilevelFarmNextUnlock | null = firstLocked
    ? {
        level: firstLocked.level,
        farmName: firstLocked.farmName,
        requiredPrevLevel: firstLocked.level - 1,
        prevSourceUserCount: farms[firstLocked.level - 2]?.sourceUserCount ?? 0,
      }
    : null

  const totalTeamCount = stats?.totalTeamCount ?? 0
  const directCount = stats?.directCount ?? 0
  const activeReferredMinersCount = stats?.activeReferredMinersCount ?? 0
  const totalNetworkPowerTh =
    typeof stats?.totalNetworkPowerTh === 'number' && Number.isFinite(stats.totalNetworkPowerTh)
      ? stats.totalNetworkPowerTh
      : null

  const medals: readonly UnilevelFarmMedal[] = [
    {
      id: 'first-farm',
      nameEs: 'Primera Granja',
      nameEn: 'First Farm',
      subEs: farms[0]?.state === 'active' ? 'Granja 1 con comisión activa' : 'Esperando 1ª comisión en N1',
      subEn: farms[0]?.state === 'active' ? 'Farm 1 earning commissions' : 'Awaiting 1st L1 commission',
      done: farms[0]?.state === 'active',
    },
    {
      id: 'network-10',
      nameEs: 'Red de 10',
      nameEn: 'Team of 10',
      subEs: `${totalTeamCount} / 10 miembros en red`,
      subEn: `${totalTeamCount} / 10 team members`,
      done: totalTeamCount >= 10,
    },
    {
      id: 'full-map',
      nameEs: 'Mapa Completo',
      nameEn: 'Full Map',
      subEs: `${unlockedFarmsCount} / ${TOTAL_UNILEVEL_FARMS} granjas abiertas`,
      subEn: `${unlockedFarmsCount} / ${TOTAL_UNILEVEL_FARMS} farms unlocked`,
      done: unlockedFarmsCount >= TOTAL_UNILEVEL_FARMS,
    },
  ]

  return {
    totalLevels: TOTAL_UNILEVEL_FARMS,
    unlockRuleDerivation: 'CLIENT_DERIVED_FROM_RECEIVED_COMMISSIONS_SOURCE_UID',
    planVersion: stats?.planVersion || 'UNILEVEL_V1',
    directCount,
    totalTeamCount,
    activeReferredMinersCount,
    eligibleForUnilevel: stats?.eligibleForUnilevel === true,
    ownMiningProfit: stats?.ownMiningProfit ?? 0,
    organizationGeneratedProfitShare: stats?.organizationGeneratedProfitShare ?? 0,
    receivedUnilevelCommission: stats?.receivedUnilevelCommission ?? 0,
    totalNetworkPowerTh,
    unlockedFarmsCount,
    activeFarmsCount,
    totalDistinctSourceUsersAcrossLevels: globalDistinctSourceUsers.size,
    groupedCommissionsTotalMicros,
    groupedCommissionsTotalUsdt2: formatMicrosAsUsdt2(groupedCommissionsTotalMicros),
    nextLockedFarm,
    medals,
    farms,
  }
}

export type FarmModalReferralFilter = 'all' | 'positive' | 'reversed'

export function filterFarmReferrals(
  referrals: readonly UnilevelFarmReferralItem[],
  options: { search?: string; filter?: FarmModalReferralFilter },
): UnilevelFarmReferralItem[] {
  const query = (options.search ?? '').trim().toLowerCase()
  const filter = options.filter ?? 'all'

  return referrals.filter((item) => {
    if (filter === 'positive' && !item.hasPositiveNet) return false
    if (filter === 'reversed' && item.reversedCount === 0) return false
    if (!query) return true
    const haystack = [
      item.sourceUserId,
      item.shortUid,
      item.latestDate ?? '',
      item.firstDate ?? '',
      ...item.minerIds,
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(query)
  })
}
