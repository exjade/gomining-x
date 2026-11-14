import { APPEARANCE_PARTS, DEFAULT_LAYER_ORDER, type AppearancePart } from './catalog-types.ts'
import type { PieceAccessRule } from './piece-access'
import type { RecolorTransform } from './recolor-pixels'

export type CatalogAssetLayer = {
  kind?: 'overlay' | 'recolor'
  canvas_w?: number
  canvas_h?: number
  offset_x?: number
  offset_y?: number
  scale?: number
  maskUrl?: string
  transform?: RecolorTransform
  source?: 'derived-demo' | 'admin'
}

export type ComposedCatalogAssetLayer =
  | { kind: 'overlay'; canvas_w: number; canvas_h: number; offset_x: number; offset_y: number; scale: number; source?: 'derived-demo' | 'admin' }
  | { kind: 'recolor'; maskUrl: string; transform: RecolorTransform; source?: 'derived-demo' | 'admin' }

export const CUSTOMIZATION_COLLECTIONS = {
  assets: 'custom_assets',
  base: 'custom_base',
  levels: 'custom_levels',
  benefits: 'custom_benefits',
} as const

export type CustomAsset = {
  asset_id: string
  trait_id: string
  part: AppearancePart
  value: string
  asset_url: string | null
  thumbnail_url: string | null
  z_index: number
  unlock_rule: PieceAccessRule | null
  benefit_ids?: readonly string[]
  layer?: CatalogAssetLayer
  description_es?: string
  button_text?: string
  link_to?: string
  status: 'draft' | 'published' | 'archived'
  version: string
  updated_at: string
}

export type CustomBaseCurrent = {
  base_image_url: string | null
  fallback_image_url?: string | null
  default_appearance: Record<AppearancePart, string | null>
  canvas?: { width: number; height: number }
  layer_order?: readonly (AppearancePart | 'base')[]
  version: string
  updated_at: string
}

export type CustomLevel = {
  level: number
  name?: string
  unilevel_ref?: string
  benefit_ids?: readonly string[]
  description_es?: string
  is_active?: boolean
  version: string
  updated_at: string
}

export type CustomBenefit = {
  benefit_id: string
  level: number | null
  kind?: string
  value?: unknown
  unit?: string
  label_es?: string
  description_es?: string
  definition: Record<string, unknown>
}

export type CustomizationCatalog = {
  version: string
  base: CustomBaseCurrent
  assets: readonly CustomAsset[]
  levels: readonly CustomLevel[]
  benefits: readonly CustomBenefit[]
}

export const CUSTOMIZATION_CATALOG_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Miner customization catalog snapshot',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'base', 'assets', 'levels', 'benefits'],
  properties: {
    version: { type: 'string', minLength: 1 },
    base: {
      type: 'object', additionalProperties: false,
      required: ['base_image_url', 'default_appearance', 'version', 'updated_at'],
      properties: {
        base_image_url: { anyOf: [{ type: 'string', format: 'uri' }, { type: 'null' }] },
        fallback_image_url: { anyOf: [{ type: 'string', format: 'uri' }, { type: 'null' }] },
        canvas: { type: 'object', additionalProperties: false, required: ['width', 'height'], properties: { width: { const: 600 }, height: { const: 600 } } },
        layer_order: { type: 'array', minItems: 9, maxItems: 9, uniqueItems: true, items: { enum: [...DEFAULT_LAYER_ORDER] } },
        default_appearance: {
          type: 'object', additionalProperties: false, required: [...APPEARANCE_PARTS],
          properties: Object.fromEntries(APPEARANCE_PARTS.map((part) => [part, { anyOf: [{ type: 'string' }, { type: 'null' }] }])),
        },
        version: { type: 'string', minLength: 1 }, updated_at: { type: 'string', format: 'date-time' },
      },
    },
    assets: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['asset_id', 'trait_id', 'part', 'value', 'asset_url', 'thumbnail_url', 'z_index', 'unlock_rule', 'status', 'version', 'updated_at'],
        properties: {
          asset_id: { type: 'string', minLength: 1 }, trait_id: { type: 'string', minLength: 1 },
          part: { enum: [...APPEARANCE_PARTS] }, value: { type: 'string', minLength: 1 },
          asset_url: { anyOf: [{ type: 'string', format: 'uri' }, { type: 'null' }] },
          thumbnail_url: { anyOf: [{ type: 'string', format: 'uri' }, { type: 'null' }] },
          z_index: { type: 'integer' }, unlock_rule: { anyOf: [{ type: 'object' }, { type: 'null' }] },
          benefit_ids: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
          layer: { type: 'object', additionalProperties: false, required: ['kind'], properties: {
            kind: { enum: ['overlay', 'recolor'] },
            canvas_w: { type: 'integer', minimum: 1 }, canvas_h: { type: 'integer', minimum: 1 }, offset_x: { type: 'number' }, offset_y: { type: 'number' }, scale: { type: 'number', exclusiveMinimum: 0 },
            maskUrl: { anyOf: [{ type: 'string', format: 'uri' }, { type: 'null' }] },
            transform: { type: 'object', additionalProperties: false, required: ['hueShift', 'saturation', 'lightness', 'tint'], properties: { hueShift: { type: 'number' }, saturation: { type: 'number', minimum: 0 }, lightness: { type: 'number', minimum: -1, maximum: 1 }, tint: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } } },
            source: { enum: ['derived-demo', 'admin'] },
          } },
          description_es: { type: 'string' }, button_text: { type: 'string' }, link_to: { type: 'string' },
          status: { enum: ['draft', 'published', 'archived'] },
          version: { type: 'string', minLength: 1 }, updated_at: { type: 'string', format: 'date-time' },
        },
      },
    },
    levels: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['level', 'version', 'updated_at'],
        properties: { level: { type: 'integer', minimum: 1 }, name: { type: 'string' }, unilevel_ref: { type: 'string' }, benefit_ids: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } }, description_es: { type: 'string' }, is_active: { type: 'boolean' }, version: { type: 'string', minLength: 1 }, updated_at: { type: 'string', format: 'date-time' } },
      },
    },
    benefits: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['benefit_id', 'level', 'definition'],
        properties: { benefit_id: { type: 'string', minLength: 1 }, level: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] }, kind: { type: 'string' }, value: {}, unit: { type: 'string' }, label_es: { type: 'string' }, description_es: { type: 'string' }, definition: { type: 'object' } },
      },
    },
  },
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertText(value: unknown, field: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) throw new Error(`Catalog ${field} must be ${allowEmpty ? 'text' : 'a non-empty string'}`)
}

function assertUrl(value: unknown, field: string, allowedOrigins: ReadonlySet<string>, allowFixtureDataUrls: boolean): asserts value is string | null {
  if (value === null) return
  assertText(value, field)
  if (allowFixtureDataUrls && (value.startsWith('data:image/') || value.startsWith('file://'))) return
  const url = new URL(value)
  if (url.protocol !== 'https:' || !allowedOrigins.has(url.origin)) throw new Error(`Catalog ${field} must use HTTPS on an allowed asset origin`)
}

function parseUnlockRule(value: unknown, field: string): PieceAccessRule {
  if (!isRecord(value) || !Array.isArray(value.requirements) || value.requirements.length === 0) throw new Error(`Catalog ${field} must contain requirements`)
  if (value.operator !== undefined && value.operator !== 'all' && value.operator !== 'any') throw new Error(`Catalog ${field}.operator must be all or any`)
  const requirements = value.requirements.map((raw, index) => {
    if (!isRecord(raw) || typeof raw.kind !== 'string') throw new Error(`Catalog ${field}.requirements[${index}] is invalid`)
    if (raw.kind === 'always' || raw.kind === 'upcoming') return { kind: raw.kind }
    if (raw.kind === 'purchase_roll') {
      if (raw.traitId !== undefined && typeof raw.traitId !== 'string') throw new Error(`Catalog ${field}.requirements[${index}].traitId must be text`)
      return { kind: 'purchase_roll', ...(raw.traitId === undefined ? {} : { traitId: raw.traitId }) }
    }
    if (raw.kind === 'progression_level') {
      if (typeof raw.minLevel !== 'number' || !Number.isInteger(raw.minLevel) || raw.minLevel < 1) throw new Error(`Catalog ${field}.requirements[${index}].minLevel must be a positive integer`)
      return { kind: 'progression_level', minLevel: raw.minLevel }
    }
    if (raw.kind === 'task') {
      if (typeof raw.taskId !== 'string' || raw.taskId.length === 0) throw new Error(`Catalog ${field}.requirements[${index}].taskId is required`)
      const optionalText = (key: string) => {
        if (raw[key] === undefined) return undefined
        if (typeof raw[key] !== 'string') throw new Error(`Catalog ${field}.requirements[${index}].${key} must be text`)
        return raw[key]
      }
      const taskKind = optionalText('taskKind')
      const descriptionEs = optionalText('descriptionEs')
      const buttonText = optionalText('buttonText')
      const linkTo = optionalText('linkTo')
      return {
        kind: 'task', taskId: raw.taskId,
        ...(taskKind === undefined ? {} : { taskKind }),
        ...(descriptionEs === undefined ? {} : { descriptionEs }),
        ...(buttonText === undefined ? {} : { buttonText }),
        ...(linkTo === undefined ? {} : { linkTo }),
      }
    }
    throw new Error(`Catalog ${field}.requirements[${index}].kind is unsupported`)
  })
  return { operator: value.operator as PieceAccessRule['operator'], requirements: requirements as PieceAccessRule['requirements'] }
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

export function validateCustomizationCatalog(value: unknown, allowedOrigins: ReadonlySet<string>, allowFixtureDataUrls = false): CustomizationCatalog {
  if (!isRecord(value) || !isRecord(value.base) || !Array.isArray(value.assets) || !Array.isArray(value.levels) || !Array.isArray(value.benefits)) {
    throw new Error('Customization catalog must include base, assets, levels, and benefits')
  }
  const base = value.base
  const defaultAppearance = base.default_appearance
  assertText(value.version, 'version')
  assertText(base.version, 'base.version')
  assertText(base.updated_at, 'base.updated_at')
  assertUrl(base.base_image_url, 'base.base_image_url', allowedOrigins, allowFixtureDataUrls)
  if (base.fallback_image_url !== undefined) assertUrl(base.fallback_image_url, 'base.fallback_image_url', allowedOrigins, allowFixtureDataUrls)
  if (base.canvas !== undefined && (!isRecord(base.canvas) || base.canvas.width !== 600 || base.canvas.height !== 600)) throw new Error('Catalog canvas must be 600 × 600')
  const layerOrder = base.layer_order
  if (layerOrder !== undefined && (!Array.isArray(layerOrder) || layerOrder.length !== DEFAULT_LAYER_ORDER.length || new Set(layerOrder).size !== DEFAULT_LAYER_ORDER.length || DEFAULT_LAYER_ORDER.some((key) => !layerOrder.includes(key)))) throw new Error('Catalog layer_order must contain wall, base, and each editable part exactly once')
  if (!isRecord(defaultAppearance)) throw new Error('Catalog default_appearance must be an object')
  for (const part of APPEARANCE_PARTS) {
    const traitId = defaultAppearance[part]
    if (traitId !== null && typeof traitId !== 'string') throw new Error(`Catalog default_appearance.${part} must be a trait id or null`)
  }

  const seenAssetIds = new Set<string>()
  const seenTraitIds = new Set<string>()
  const assets = value.assets.map((raw, index): CustomAsset => {
    if (!isRecord(raw) || !APPEARANCE_PARTS.includes(raw.part as AppearancePart)) throw new Error(`Catalog assets[${index}] has an invalid part`)
    assertText(raw.asset_id, `assets[${index}].asset_id`)
    assertText(raw.trait_id, `assets[${index}].trait_id`)
    if (seenAssetIds.has(raw.asset_id) || seenTraitIds.has(raw.trait_id)) throw new Error(`Catalog assets[${index}] has a duplicate id`)
    seenAssetIds.add(raw.asset_id)
    seenTraitIds.add(raw.trait_id)
    assertText(raw.value, `assets[${index}].value`)
    assertText(raw.version, `assets[${index}].version`)
    assertText(raw.updated_at, `assets[${index}].updated_at`)
    if (typeof raw.z_index !== 'number' || !Number.isInteger(raw.z_index)) throw new Error(`Catalog assets[${index}].z_index must be an integer`)
    if (raw.benefit_ids !== undefined && (!Array.isArray(raw.benefit_ids) || !raw.benefit_ids.every((benefitId) => typeof benefitId === 'string') || new Set(raw.benefit_ids).size !== raw.benefit_ids.length)) throw new Error(`Catalog assets[${index}].benefit_ids must be unique strings`)
    if (raw.layer !== undefined) {
      if (!isRecord(raw.layer)) throw new Error(`Catalog assets[${index}].layer is invalid`)
      if (raw.layer.kind !== undefined && raw.layer.kind !== 'overlay' && raw.layer.kind !== 'recolor') throw new Error(`Catalog assets[${index}].layer.kind is invalid`)
      if (raw.layer.canvas_w !== undefined && (typeof raw.layer.canvas_w !== 'number' || !Number.isInteger(raw.layer.canvas_w) || raw.layer.canvas_w < 1)) throw new Error(`Catalog assets[${index}].layer.canvas_w is invalid`)
      if (raw.layer.canvas_h !== undefined && (typeof raw.layer.canvas_h !== 'number' || !Number.isInteger(raw.layer.canvas_h) || raw.layer.canvas_h < 1)) throw new Error(`Catalog assets[${index}].layer.canvas_h is invalid`)
      if (raw.layer.offset_x !== undefined && (typeof raw.layer.offset_x !== 'number' || !Number.isFinite(raw.layer.offset_x))) throw new Error(`Catalog assets[${index}].layer.offset_x is invalid`)
      if (raw.layer.offset_y !== undefined && (typeof raw.layer.offset_y !== 'number' || !Number.isFinite(raw.layer.offset_y))) throw new Error(`Catalog assets[${index}].layer.offset_y is invalid`)
      if (raw.layer.scale !== undefined && (typeof raw.layer.scale !== 'number' || !Number.isFinite(raw.layer.scale) || raw.layer.scale <= 0)) throw new Error(`Catalog assets[${index}].layer.scale is invalid`)
      if (raw.layer.kind === 'recolor') {
        if (typeof raw.layer.maskUrl !== 'string' || raw.layer.maskUrl.length === 0 || !isRecord(raw.layer.transform)) throw new Error(`Catalog assets[${index}].layer recolor requires maskUrl and transform`)
        const transform = raw.layer.transform
        if (typeof transform.hueShift !== 'number' || !Number.isFinite(transform.hueShift) || typeof transform.saturation !== 'number' || !Number.isFinite(transform.saturation) || transform.saturation < 0 || typeof transform.lightness !== 'number' || !Number.isFinite(transform.lightness) || transform.lightness < -1 || transform.lightness > 1 || typeof transform.tint !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(transform.tint)) throw new Error(`Catalog assets[${index}].layer transform is invalid`)
        if (raw.layer.source !== undefined && raw.layer.source !== 'derived-demo' && raw.layer.source !== 'admin') throw new Error(`Catalog assets[${index}].layer.source is invalid`)
        if (raw.layer.source === 'derived-demo' && raw.layer.maskUrl.startsWith('/')) {
          // Bundled demo masks use same-origin asset paths; admin supplied assets remain HTTPS allowlisted.
        } else {
          assertUrl(raw.layer.maskUrl, `assets[${index}].layer.maskUrl`, allowedOrigins, allowFixtureDataUrls)
        }
      }
    }
    if (raw.description_es !== undefined) assertText(raw.description_es, `assets[${index}].description_es`, true)
    if (raw.button_text !== undefined) assertText(raw.button_text, `assets[${index}].button_text`, true)
    if (raw.link_to !== undefined) assertText(raw.link_to, `assets[${index}].link_to`, true)
    if (!['draft', 'published', 'archived'].includes(String(raw.status))) throw new Error(`Catalog assets[${index}].status is invalid`)
    assertUrl(raw.asset_url, `assets[${index}].asset_url`, allowedOrigins, allowFixtureDataUrls)
    assertUrl(raw.thumbnail_url, `assets[${index}].thumbnail_url`, allowedOrigins, allowFixtureDataUrls)
    const unlockRule = raw.unlock_rule === null ? null : parseUnlockRule(raw.unlock_rule, `assets[${index}].unlock_rule`)
    return { ...raw, ...(raw.layer ? { layer: { ...raw.layer, kind: raw.layer.kind ?? (raw.asset_url ? 'overlay' : undefined) } } : {}), unlock_rule: unlockRule } as CustomAsset
  })
  for (const [part, traitId] of Object.entries(defaultAppearance)) {
    if (traitId !== null && traitId !== 'none' && !seenTraitIds.has(String(traitId))) throw new Error(`Catalog default_appearance.${part} references an unknown trait_id`)
  }
  if (Object.keys(defaultAppearance).length !== APPEARANCE_PARTS.length || APPEARANCE_PARTS.some((part) => !(part in defaultAppearance))) throw new Error('Catalog default_appearance must include exactly the eight editable parts')
  const seenLevels = new Set<number>()
  const levels = value.levels.map((raw, index): CustomLevel => {
    if (!isRecord(raw) || typeof raw.level !== 'number' || !Number.isInteger(raw.level) || raw.level < 1) throw new Error(`Catalog levels[${index}] must have a positive integer level`)
    if (seenLevels.has(raw.level)) throw new Error(`Catalog levels[${index}] duplicates level ${raw.level}`)
    seenLevels.add(raw.level)
    assertText(raw.version, `levels[${index}].version`)
    assertText(raw.updated_at, `levels[${index}].updated_at`)
    if (raw.benefit_ids !== undefined && (!Array.isArray(raw.benefit_ids) || !raw.benefit_ids.every((benefitId) => typeof benefitId === 'string') || new Set(raw.benefit_ids).size !== raw.benefit_ids.length)) throw new Error(`Catalog levels[${index}].benefit_ids must be unique strings`)
    if (raw.name !== undefined) assertText(raw.name, `levels[${index}].name`, true)
    if (raw.unilevel_ref !== undefined) assertText(raw.unilevel_ref, `levels[${index}].unilevel_ref`, true)
    if (raw.description_es !== undefined) assertText(raw.description_es, `levels[${index}].description_es`, true)
    if (raw.is_active !== undefined && typeof raw.is_active !== 'boolean') throw new Error(`Catalog levels[${index}].is_active must be boolean`)
    return raw as CustomLevel
  })
  const benefits = value.benefits.map((raw, index): CustomBenefit => {
    if (!isRecord(raw) || (raw.level !== null && (typeof raw.level !== 'number' || !Number.isInteger(raw.level) || raw.level < 1)) || !isRecord(raw.definition) || !isJsonValue(raw.definition)) throw new Error(`Catalog benefits[${index}] is invalid`)
    assertText(raw.benefit_id, `benefits[${index}].benefit_id`)
    if (raw.kind !== undefined) assertText(raw.kind, `benefits[${index}].kind`)
    if (raw.unit !== undefined) assertText(raw.unit, `benefits[${index}].unit`, true)
    if (raw.label_es !== undefined) assertText(raw.label_es, `benefits[${index}].label_es`, true)
    if (raw.description_es !== undefined) assertText(raw.description_es, `benefits[${index}].description_es`, true)
    if (raw.value !== undefined && !isJsonValue(raw.value)) throw new Error(`Catalog benefits[${index}].value is invalid`)
    return raw as CustomBenefit
  })
  const knownBenefitIds = new Set(benefits.map((benefit) => benefit.benefit_id))
  for (const asset of assets) {
    if (asset.benefit_ids?.some((benefitId) => !knownBenefitIds.has(benefitId))) throw new Error(`Catalog asset ${asset.asset_id} references an unknown benefit`)
  }
  for (const level of levels) {
    if (level.benefit_ids?.some((benefitId) => !knownBenefitIds.has(benefitId))) throw new Error(`Catalog level ${level.level} references an unknown benefit`)
  }
  return { version: value.version, base: base as unknown as CustomBaseCurrent, assets, levels, benefits }
}
