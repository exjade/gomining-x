import { customMinerPriceTiers } from '../../minerCatalog.ts'
import type { StorefrontSectionsConfig } from '../../firebase.ts'
import type { MinerCategoryTab } from './MinerTabs.tsx'

/**
 * EMBUDO-F3 (SCRUM-335):
 * During presale, fixed miner packages are retired from MinerBuilderDialog.
 * Users configure power exclusively via customMinerPriceTiers (22 tiers, 1 TH = $12.99 .. 5,000 TH = $54,768.99)
 * with free skin customization ($0 delta, never showing +$X).
 */
export const PRESALE_CUSTOM_ONLY_MODE = true

export const PRESALE_FREE_SKIN_COPY = {
  eyebrow: 'PREVENTA · CONFIGURADOR POR POTENCIA',
  skinTitle: 'Skin del minero · Gratis por preventa',
  skinSubtitlePrefix: 'Personalización solo skin · $0',
  reviewSkinLabel: 'Personalización (skin)',
  reviewSkinValue: 'Gratis por preventa ($0)',
  reviewModalityCustom: 'Preventa · Personalizado (skin gratis)',
} as const

export interface InitialMinerBuilderConfig {
  categoryTab: MinerCategoryTab
  presetId: string
  isCustomEditorOpen: boolean
  customPowerIndex: number
}

export interface PresaleTierSummary {
  index: number
  tierCount: number
  powerTh: number
  priceUsd: number
  pricePerTh: number
  skinCostUsd: 0
}

/**
 * Applies the presale custom-only policy on top of Firestore admin_settings/storefront_sections.
 * Hides fixed package tabs (showPresale, showLaunch, showMonthly) while preserving showCustom = true
 * and keeping subscribeToStorefrontSections intact for post-presale activation.
 */
export function resolvePresaleStorefrontSections(
  config: StorefrontSectionsConfig,
  customOnly: boolean = PRESALE_CUSTOM_ONLY_MODE,
): StorefrontSectionsConfig {
  if (!customOnly) {
    return { ...config }
  }
  return {
    ...config,
    showPresale: false,
    showLaunch: false,
    showMonthly: false,
    showCustom: true,
  }
}

/**
 * Resolves initial state of MinerBuilderDialog.
 * In presale custom-only mode (or inside EMBUDO-F1), opens directly into the custom power editor
 * starting at tier index 0 (1 TH/s = $12.99) with no fixed packages step.
 */
export function resolveInitialMinerBuilderConfig(options?: {
  customOnly?: boolean
  isEmbudoF1?: boolean
}): InitialMinerBuilderConfig {
  const customOnly = options?.customOnly ?? PRESALE_CUSTOM_ONLY_MODE
  const isEmbudoF1 = Boolean(options?.isEmbudoF1)

  if (customOnly || isEmbudoF1) {
    return {
      categoryTab: 'packages',
      presetId: 'custom',
      isCustomEditorOpen: true,
      customPowerIndex: 0,
    }
  }

  return {
    categoryTab: 'packages',
    presetId: 'presale-1',
    isCustomEditorOpen: false,
    customPowerIndex: 0,
  }
}

/**
 * Resolves the review screen modality label, making presale custom + free skin explicit.
 */
export function resolvePresaleReviewModalityLabel(
  isCustom: boolean,
  categoryTab: MinerCategoryTab,
): string {
  if (isCustom) {
    return PRESALE_FREE_SKIN_COPY.reviewModalityCustom
  }
  if (categoryTab === 'presale') return 'Preventa (Edición limitada)'
  if (categoryTab === 'monthly') return 'Mensual · 30 días'
  if (categoryTab === 'packages') return 'Paquetes MinerX'
  return 'Lanzamiento · Propiedad'
}

/**
 * Returns the canonical power/price tier summary strictly from customMinerPriceTiers.
 * Skin cost is always $0 in presale.
 */
export function getPresaleTierSummary(powerIndex: number): PresaleTierSummary {
  const maxIndex = customMinerPriceTiers.length - 1
  const safeIndex = Number.isFinite(powerIndex)
    ? Math.max(0, Math.min(maxIndex, Math.trunc(powerIndex)))
    : 0
  const tier = customMinerPriceTiers[safeIndex]
  return {
    index: safeIndex,
    tierCount: customMinerPriceTiers.length,
    powerTh: tier.powerTh,
    priceUsd: tier.priceUsd,
    pricePerTh: Number((tier.priceUsd / tier.powerTh).toFixed(2)),
    skinCostUsd: 0,
  }
}

const FORBIDDEN_SKIN_PRICE_PATTERNS: readonly RegExp[] = [
  /\+\s*\$\s*\d/i,
  /\+\s*\d+(?:[.,]\d+)?\s*(?:usd|usdt|\$)/i,
  /precio\s+de\s+skin/i,
  /costo\s+(?:de\s+)?skin/i,
  /skin\s+surcharge/i,
]

/**
 * Guards UI copy so presale customization never displays +$X or skin price breakdowns.
 */
export function hasForbiddenSkinPriceMarkup(copy: string): boolean {
  return FORBIDDEN_SKIN_PRICE_PATTERNS.some((pattern) => pattern.test(copy))
}
