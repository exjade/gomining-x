import { evaluatePieceAccess, getPieceUnlockRule, NullProgressProvider, validateAppearanceSelectionDraft, validateTraitUnlockMapForPieces, type PieceAccessMiner, type PieceAccessRule, type ProgressSnapshot } from './unlock-engine'
import { MINER_APPEARANCE_CATALOG_DATA, proposedTraitId } from './catalog-data'
import { APPEARANCE_PARTS, APPEARANCE_PAYLOAD_KEY_BY_PART, type AppearancePart, type AppearancePayloadKey } from './catalog-types'
export { APPEARANCE_PARTS, APPEARANCE_PAYLOAD_KEY_BY_PART } from './catalog-types'
export type { AppearancePart, AppearancePayloadKey } from './catalog-types'

export const MINER_APPEARANCE_CATALOG_ID = 'miner-customization-v1'
export const EXPLICIT_NONE_APPEARANCE = 'none'
export type TraitStatus = 'Available' | 'Applied' | 'Active' | 'Upcoming' | 'Inactive'

export type Trait = {
  trait_id: string
  value: string | null
  description: string | null
  category: AppearancePart | 'display' | 'items'
  link_catalogue: string | null
  link_picture: string | null
  status: TraitStatus
  completion_requirements: string | null
  link_to_task: string | null
  button_text: string | null
  unlocked_at: string | null
  is_external_link: boolean
  presentationKind?: 'overlay' | 'recolor' | 'blocked'
  blockedDetail?: string
}

export type AppearanceCategory = {
  id: AppearancePart
  payloadKey: Exclude<AppearancePayloadKey, 'items_id'>
  label: string
  traits: Trait[]
}

export type MinerAppearance = Partial<Record<AppearancePayloadKey, string>> & { updatedAt: string }
export type MinerAppearanceDraft = Record<AppearancePayloadKey, string | null>

export type TraitPresentation =
  | { kind: 'measured-color'; color: string }
  | { kind: 'miner-thumbnail' }
  | { kind: 'placeholder' }

export const MINER_APPEARANCE_PAGE_SIZE = 18

function traitId(category: Trait['category'], value: string) {
  return proposedTraitId(category, value)
}

function makeTraits(category: Trait['category'], values: readonly string[]) {
  return values.filter((value) => value !== 'None').map((value): Trait => ({
    trait_id: traitId(category, value),
    value,
    description: null,
    category,
    link_catalogue: null,
    link_picture: null,
    status: 'Available',
    completion_requirements: null,
    link_to_task: null,
    button_text: null,
    unlocked_at: null,
    is_external_link: false,
  }))
}

function makeCategory(id: AppearancePart, label: string, values: readonly string[]): AppearanceCategory {
  return {
    id,
    payloadKey: APPEARANCE_PAYLOAD_KEY_BY_PART[id],
    label,
    traits: makeTraits(id, values),
  }
}

export const MINER_APPEARANCE_CATEGORIES: AppearanceCategory[] = MINER_APPEARANCE_CATALOG_DATA.editable
  .map(({ id, label, values }) => makeCategory(id, label, values))

export const BLOCKED_ASSETS = MINER_APPEARANCE_CATALOG_DATA.editable.flatMap(({ id, values }) =>
  values
    .filter((piece) => piece !== 'None')
    .map((piece) => ({ category: id, piece, expectedCanvas: '600 × 600 CSS px' })),
)

export const MINER_DISPLAY_TRAITS = makeTraits('display', MINER_APPEARANCE_CATALOG_DATA.readOnly.display)
export const MINER_ITEM_TRAITS = makeTraits('items', MINER_APPEARANCE_CATALOG_DATA.readOnly.items)
export const MINER_APPEARANCE_EDITABLE_TRAITS = MINER_APPEARANCE_CATEGORIES.flatMap((category) => category.traits)
export const MINER_APPEARANCE_READ_ONLY_TRAITS = [...MINER_DISPLAY_TRAITS, ...MINER_ITEM_TRAITS]
export const MINER_APPEARANCE_PURCHASE_TRAITS = MINER_APPEARANCE_CATEGORIES.filter((category) => category.id !== 'bottom').flatMap((category) => category.traits)

export const MINER_APPEARANCE_CATALOG = {
  catalogId: MINER_APPEARANCE_CATALOG_ID,
  categories: MINER_APPEARANCE_CATEGORIES,
  readOnly: { display: MINER_DISPLAY_TRAITS, items: MINER_ITEM_TRAITS },
}

export const MINER_APPEARANCE_TRAITS = [...MINER_APPEARANCE_EDITABLE_TRAITS, ...MINER_APPEARANCE_READ_ONLY_TRAITS]
export const MINER_APPEARANCE_TRAIT_BY_ID = new Map(MINER_APPEARANCE_TRAITS.map((trait) => [trait.trait_id, trait]))
validateTraitUnlockMapForPieces(MINER_APPEARANCE_TRAITS)

export const TRAIT_PRESENTATION_BY_ID: Record<string, TraitPresentation> = {}

export function emptyMinerAppearanceDraft(): MinerAppearanceDraft {
  return {
    wall_id: null,
    body_id: null,
    bottom_id: null,
    buttons_id: null,
    fans_id: null,
    screen_id: null,
    stickers_id: null,
    top_id: null,
  }
}

export function getAppearancePageCount(traitCount: number) {
  return Math.ceil(traitCount / MINER_APPEARANCE_PAGE_SIZE)
}

export function parseMinerAppearance(value: unknown): MinerAppearance | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  if (typeof raw.updatedAt !== 'string') return undefined

  const parsed: Partial<Record<AppearancePayloadKey, string>> = {}
  for (const key of Object.keys(emptyMinerAppearanceDraft()) as AppearancePayloadKey[]) {
    const traitId = raw[key]
    if (traitId === null || traitId === undefined) continue
    if (typeof traitId !== 'string' || traitId.length === 0) return undefined
    if (traitId === EXPLICIT_NONE_APPEARANCE) {
      parsed[key] = traitId
      continue
    }
    const trait = MINER_APPEARANCE_TRAIT_BY_ID.get(traitId)
    if (trait) {
      const expectedCategory = APPEARANCE_PARTS.find((part) => APPEARANCE_PAYLOAD_KEY_BY_PART[part] === key)
      if (trait.category !== expectedCategory) return undefined
    }
    parsed[key] = traitId
  }

  return { ...parsed, updatedAt: raw.updatedAt }
}

export function appearanceDraftFromSaved(appearance?: MinerAppearance): MinerAppearanceDraft {
  if (!appearance) return emptyMinerAppearanceDraft()
  const draft = emptyMinerAppearanceDraft()
  for (const key of Object.keys(draft) as AppearancePayloadKey[]) draft[key] = appearance[key] ?? null
  return draft
}

export function minerAppearanceFromDraft(draft: MinerAppearanceDraft, updatedAt: string): MinerAppearance {
  return {
    ...Object.fromEntries(Object.entries(draft).filter(([, traitId]) => traitId !== null)),
    updatedAt,
  }
}

export function isMinerAppearanceDirty(draft: MinerAppearanceDraft, saved?: MinerAppearance) {
  const previous = saved ?? emptyMinerAppearanceDraft()
  return (Object.keys(draft) as AppearancePayloadKey[]).some((key) => draft[key] !== (previous[key] ?? null))
}

function getTraitUnlockRule(trait: Trait, unlockRules?: ReadonlyMap<string, PieceAccessRule>) {
  return unlockRules?.get(trait.trait_id) ?? getPieceUnlockRule(trait.trait_id)
}

export function getTraitAccess(
  trait: Trait,
  progress: ProgressSnapshot | null = NullProgressProvider.getSnapshot(),
  miner: PieceAccessMiner = {},
  unlockRules?: ReadonlyMap<string, PieceAccessRule>,
) {
  return evaluatePieceAccess({ piece: { trait_id: trait.trait_id, unlockRule: getTraitUnlockRule(trait, unlockRules) }, miner, progress })
}

export function isTraitLocked(
  trait: Trait,
  progress: ProgressSnapshot | null = NullProgressProvider.getSnapshot(),
  miner: PieceAccessMiner = {},
  unlockRules?: ReadonlyMap<string, PieceAccessRule>,
) {
  const access = getTraitAccess(trait, progress, miner, unlockRules).state
  return access === 'locked' || access === 'upcoming'
}

export function getTraitStatus(
  trait: Trait,
  saved: MinerAppearance | undefined,
  draft: MinerAppearanceDraft,
  progress: ProgressSnapshot | null = NullProgressProvider.getSnapshot(),
  miner: PieceAccessMiner = {},
  unlockRules?: ReadonlyMap<string, PieceAccessRule>,
): TraitStatus {
  if (trait.category === 'display' || trait.category === 'items') return 'Inactive'
  const payloadKey = APPEARANCE_PAYLOAD_KEY_BY_PART[trait.category]
  if (draft[payloadKey] === trait.trait_id) return saved?.[payloadKey] === trait.trait_id ? 'Applied' : 'Active'
  const access = getTraitAccess(trait, progress, miner, unlockRules).state
  return access === 'available' ? 'Available' : access === 'upcoming' ? 'Upcoming' : 'Inactive'
}

export function selectAppearanceTrait(
  draft: MinerAppearanceDraft,
  part: AppearancePart,
  traitId: string,
  progress: ProgressSnapshot | null = NullProgressProvider.getSnapshot(),
  miner: PieceAccessMiner = {},
  unlockRules?: ReadonlyMap<string, PieceAccessRule>,
  categories: readonly AppearanceCategory[] = MINER_APPEARANCE_CATEGORIES,
): MinerAppearanceDraft {
  const category = categories.find((item) => item.id === part)!
  const trait = category.traits.find((item) => item.trait_id === traitId)
  if (!trait || isTraitLocked(trait, progress, miner, unlockRules)) return draft
  return { ...draft, [category.payloadKey]: trait.trait_id }
}

export function validateAppearanceDraft(
  draft: MinerAppearanceDraft,
  miner: PieceAccessMiner,
  progress: ProgressSnapshot | null,
  saved?: MinerAppearance,
  unlockRules?: ReadonlyMap<string, PieceAccessRule>,
  categories: readonly AppearanceCategory[] = MINER_APPEARANCE_CATEGORIES,
) {
  const validationDraft = Object.fromEntries(Object.entries(draft).map(([key, traitId]) => [key, traitId === EXPLICIT_NONE_APPEARANCE ? null : traitId]))
  return validateAppearanceSelectionDraft({
    draft: validationDraft,
    saved: saved ?? emptyMinerAppearanceDraft(),
    categories: categories.map((category) => ({
      payloadKey: category.payloadKey,
      pieces: category.traits.map((trait) => ({
        trait_id: trait.trait_id,
        unlockRule: getTraitUnlockRule(trait, unlockRules),
      })),
    })),
    miner,
    progress,
  })
}

export function getSelectedAppearanceTraits(appearance: MinerAppearanceDraft | MinerAppearance, categories: readonly AppearanceCategory[] = MINER_APPEARANCE_CATEGORIES) {
  return categories.flatMap((category) => {
    const traitId = appearance[category.payloadKey]
    const trait = category.traits.find((item) => item.trait_id === traitId)
    return trait ? [{ category: category.id, trait }] : []
  })
}
