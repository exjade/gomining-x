import type { MinerPlan } from './minerCatalog.ts'
import { getSectionFallbackPlans } from './minerCatalog.ts'

export type CatalogSection = 'minerx' | 'preventa' | 'lanzamiento' | 'mensual'
export type ClientCategoryTab = 'packages' | 'presale' | 'launch' | 'monthly'

export const VALID_CATALOG_SECTIONS: readonly CatalogSection[] = [
  'minerx',
  'preventa',
  'lanzamiento',
  'mensual',
] as const

export const SECTION_TO_TAB: Record<CatalogSection, ClientCategoryTab> = {
  minerx: 'packages',
  preventa: 'presale',
  lanzamiento: 'launch',
  mensual: 'monthly',
}

export const TAB_TO_SECTION: Record<ClientCategoryTab, CatalogSection> = {
  packages: 'minerx',
  presale: 'preventa',
  launch: 'lanzamiento',
  monthly: 'mensual',
}

// In-memory catalog cache: hydrated at most once per section per session or modal open
// Managed by epoch / generation counter to prevent race conditions from stale in-flight requests
let currentEpoch = 0
const memoryCatalogCache = new Map<CatalogSection, MinerPlan[]>()

interface InFlightEntry {
  promise: Promise<MinerPlan[]>
  abortController: AbortController
  epoch: number
}
const inFlightRequests = new Map<CatalogSection, InFlightEntry>()

export function getCurrentCacheEpoch(): number {
  return currentEpoch
}

export function getCachedStorefrontCatalog(section: CatalogSection): MinerPlan[] | undefined {
  return memoryCatalogCache.get(section)
}

export function clearCatalogCache(): void {
  currentEpoch++
  for (const entry of inFlightRequests.values()) {
    try {
      entry.abortController.abort()
    } catch {
      // ignore
    }
  }
  memoryCatalogCache.clear()
  inFlightRequests.clear()
}

export function setCatalogCache(section: CatalogSection, plans: MinerPlan[]): void {
  memoryCatalogCache.set(section, plans)
}

/**
 * Adapts canonical CommercialPackage response to MinerPlan.
 * Preserves visible currency as USD without FX conversions.
 * Technical name priceUsdt preserved on source object.
 * Custom preserves literal 'Custom' label.
 * Never introduces commercial tiers (Entry, Standard, Pro, Master, Enterprise).
 */
export function adaptCommercialPackageToMinerPlan(pkg: any, section: CatalogSection): MinerPlan {
  const packageId = String(pkg.packageId || pkg.id || '').trim()
  const powerTh = Math.max(0, Number(pkg.powerTh) || 0)
  const price = Math.max(0, Number(pkg.priceUsdt ?? pkg.price) || 0)
  const rawDisplayName = typeof pkg.displayName === 'string' ? pkg.displayName.trim() : ''
  const rawName = typeof pkg.name === 'string' ? pkg.name.trim() : ''
  const isCustom = (
    String(pkg.packageType || '').toLowerCase() === 'custom' ||
    rawName.toLowerCase() === 'custom' ||
    rawDisplayName.toLowerCase() === 'custom'
  )

  let parsedBtcPerDay: number | undefined
  if (typeof pkg.dailyBtcText === 'string') {
    const parsed = parseFloat(pkg.dailyBtcText)
    if (Number.isFinite(parsed) && parsed > 0) {
      parsedBtcPerDay = parsed
    }
  } else if (typeof pkg.btcPerDay === 'number' && Number.isFinite(pkg.btcPerDay) && pkg.btcPerDay > 0) {
    parsedBtcPerDay = pkg.btcPerDay
  } else if (typeof pkg.dailyBtcText === 'number' && Number.isFinite(pkg.dailyBtcText) && pkg.dailyBtcText > 0) {
    parsedBtcPerDay = pkg.dailyBtcText
  } else if (typeof pkg.btcPerDay === 'string') {
    const parsed = parseFloat(pkg.btcPerDay)
    if (Number.isFinite(parsed) && parsed > 0) {
      parsedBtcPerDay = parsed
    }
  }

  let parsedRoi: number | undefined
  const rawRoi = pkg.roiPct ?? pkg.annualRoi ?? pkg.roi
  if (typeof rawRoi === 'number' && Number.isFinite(rawRoi) && rawRoi > 0) {
    parsedRoi = rawRoi
  } else if (typeof rawRoi === 'string') {
    const parsed = parseFloat(rawRoi)
    if (Number.isFinite(parsed) && parsed > 0) {
      parsedRoi = parsed
    }
  }

  let parsedLimitUnits: number | undefined
  const rawLimit = pkg.limitedUnits ?? pkg.availableUnits ?? pkg.limitUnits
  if (typeof rawLimit === 'number' && Number.isFinite(rawLimit) && rawLimit > 0) {
    parsedLimitUnits = rawLimit
  } else if (typeof rawLimit === 'string') {
    const parsed = parseInt(rawLimit, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      parsedLimitUnits = parsed
    }
  }

  return {
    id: packageId,
    packageId: packageId,
    label: isCustom ? 'Custom' : (rawDisplayName || rawName || `${powerTh} TH`),
    powerTh,
    price,
    currency: 'USD',
    cadence: section === 'mensual' ? 'monthly' : 'once',
    btcPerDay: parsedBtcPerDay,
    roi: parsedRoi,
    limitUnits: parsedLimitUnits,
    isPresale: section === 'preventa' || pkg.isPresale === true,
  }
}

/**
 * Fetches canonical managed storefront catalog via HTTP GET /api/catalog/storefront?section={section}.
 * No direct Firestore reads. No onSnapshot. No polling. No refetch on tab switching.
 * If section fails or returns malformed response, falls back exclusively to that section's exact fallback data.
 * Valid empty response [] is preserved and does NOT trigger fallback.
 */
export async function fetchStorefrontCatalog(
  section: CatalogSection,
  options?: { bypassCache?: boolean; baseUrl?: string }
): Promise<MinerPlan[]> {
  if (!VALID_CATALOG_SECTIONS.includes(section)) {
    return []
  }

  if (!options?.bypassCache && memoryCatalogCache.has(section)) {
    return memoryCatalogCache.get(section)!
  }

  if (!options?.bypassCache && inFlightRequests.has(section)) {
    return inFlightRequests.get(section)!.promise
  }

  const requestEpoch = currentEpoch
  const abortController = new AbortController()

  const base = options?.baseUrl ?? ''
  const url = `${base}/api/catalog/storefront?section=${encodeURIComponent(section)}`

  const fetchPromise = (async (): Promise<MinerPlan[]> => {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: abortController.signal,
      })

      // HTTP 4xx (client error / invalid route / bad request): Option B specifies empty catalog, NO fallback.
      if (res.status >= 400 && res.status < 500) {
        if (requestEpoch === currentEpoch && !abortController.signal.aborted) {
          memoryCatalogCache.set(section, [])
        }
        return []
      }

      // HTTP 5xx or server failures: throw so catch block activates baseline fallback.
      if (!res.ok) {
        throw new Error(`Storefront endpoint returned HTTP status ${res.status}`)
      }

      const data = await res.json()
      if (!Array.isArray(data)) {
        throw new Error(`Storefront catalog response is not an array for section: ${section}`)
      }

      // Filter strictly:
      // - Must be object
      // - Must NOT be legacy (pkg-miner-* / pkg-miner_* in packageId or id, or legacy flag)
      // - Must NOT be Custom package (Custom is solely managed and rendered by MinerOptionList via includeCustom)
      // - Must have valid unique non-empty identity
      // - status must be explicitly 'ACTIVE' (missing status is NOT active)
      // - isPublished must be explicitly true (missing isPublished is NOT true)
      // - section must match canonical section explicitly
      // - power and price must be positive numbers
      const seenIds = new Set<string>()
      const activePackages = data.filter((p: any) => {
        if (!p || typeof p !== 'object') return false
        const pkgId = String(p.packageId || '').trim()
        const rawId = String(p.id || '').trim()
        const effectiveId = pkgId || rawId
        if (!effectiveId) return false
        const lowerId = effectiveId.toLowerCase()
        if (seenIds.has(lowerId)) return false

        const lowerPkgId = pkgId.toLowerCase()
        const lowerRawId = rawId.toLowerCase()
        const isLegacyId =
          lowerPkgId.startsWith('pkg-miner-') ||
          lowerPkgId.startsWith('pkg-miner_') ||
          lowerRawId.startsWith('pkg-miner-') ||
          lowerRawId.startsWith('pkg-miner_')
        const isLegacyFlag =
          p.isLegacy === true ||
          p.isLegacy === 'true' ||
          p.isLegacy === 1 ||
          p.legacy === true ||
          p.legacy === 'true' ||
          p.legacy === 1

        if (isLegacyId || isLegacyFlag) return false

        // Correction 2: Exclude custom package from fixed plans array.
        // The dedicated Client Custom control rendered by MinerOptionList (includeCustom)
        // remains the sole authoritative Custom UI option to prevent duplicate Custom entries.
        const isCustomPackage = (
          String(p.packageType || '').toLowerCase() === 'custom' ||
          String(p.name || '').trim().toLowerCase() === 'custom' ||
          String(p.displayName || '').trim().toLowerCase() === 'custom' ||
          lowerPkgId === 'minerx-custom' ||
          lowerRawId === 'minerx-custom'
        )
        if (isCustomPackage) return false

        if (p.status !== 'ACTIVE') return false
        if (p.isPublished !== true) return false
        if (typeof p.section !== 'string' || p.section.toLowerCase() !== section.toLowerCase()) return false
        const power = Number(p.powerTh)
        const price = Number(p.priceUsdt ?? p.price)
        if (!Number.isFinite(power) || power <= 0 || !Number.isFinite(price) || price <= 0) return false

        seenIds.add(lowerId)
        return true
      })

      // Respect sortOrder ascending stably, tie-breaking by powerTh ascending
      activePackages.sort((a: any, b: any) => {
        const orderDiff = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
        if (orderDiff !== 0) return orderDiff
        return (Number(a.powerTh) || 0) - (Number(b.powerTh) || 0)
      })

      const plans = activePackages.map((p) => adaptCommercialPackageToMinerPlan(p, section))

      // Correction 3: Discard and do not cache if the modal/generation was closed or aborted
      if (requestEpoch === currentEpoch && !abortController.signal.aborted) {
        memoryCatalogCache.set(section, plans)
      }
      return plans
    } catch (error: any) {
      // Correction 3: An aborted or stale request belonging to an older modal session
      // must NEVER populate the cache or fallback for the new modal generation.
      if (requestEpoch !== currentEpoch || abortController.signal.aborted || error?.name === 'AbortError') {
        return []
      }

      // Malformed response or network failure for the ACTIVE modal session:
      // fall back exclusively to that section's exact fallback
      const fallback = getSectionFallbackPlans(section)
      memoryCatalogCache.set(section, fallback)
      return fallback
    } finally {
      const existing = inFlightRequests.get(section)
      if (existing && existing.epoch === requestEpoch) {
        inFlightRequests.delete(section)
      }
    }
  })()

  if (!options?.bypassCache) {
    inFlightRequests.set(section, { promise: fetchPromise, abortController, epoch: requestEpoch })
  }

  return fetchPromise
}
