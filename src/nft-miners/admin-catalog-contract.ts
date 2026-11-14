import { APPEARANCE_PARTS, type AppearancePart } from './catalog-types.ts'
import type { UnlockRequirement } from './piece-access'
import { validateCustomizationCatalog, type CustomAsset, type CustomBenefit, type CustomLevel, type CustomizationCatalog } from './catalog-contract.ts'

export type CatalogAssetDocument = {
  assetId: string
  partKey: AppearancePart
  name: string
  status: 'draft' | 'published' | 'archived'
  sortOrder: number
  thumbnailUrl: string | null
  layerUrl: string | null
  layer: { canvasW: number; canvasH: number; zIndex?: number; offsetX: number; offsetY: number; scale: number }
  rarityWeightBp?: number
  requirements: readonly UnlockRequirement[]
  operator?: 'all' | 'any'
  benefitIds: readonly string[]
  descriptionEs?: string
  buttonText?: string
  linkTo?: string
  version: string
  createdAt: string
  updatedAt: string
  updatedBy: string
}

export type CatalogCanvas = { width: number; height: number }
export type CatalogLayerKey = AppearancePart | 'base'

export type CatalogBaseDocument = {
  baseLayerUrl?: string | null
  canvas: CatalogCanvas
  layerOrder: readonly CatalogLayerKey[]
  defaultAppearance: Readonly<Record<AppearancePart, string | 'none'>>
  fallbackImageUrl: string | null
  version: string
  updatedAt: string
  updatedBy: string
}

export type CatalogLevelDocument = {
  level: number
  name?: string
  unilevelRef?: string
  benefitIds: readonly string[]
  descriptionEs: string
  isActive: boolean
}

export type CatalogBenefitDocument = {
  benefitId: string
  kind: string
  value?: unknown
  unit?: string
  labelEs: string
  descriptionEs: string
}

const requirementSchema = {
  type: 'object', additionalProperties: false, required: ['kind'],
  properties: {
    kind: { enum: ['purchase_roll', 'always', 'progression_level', 'task', 'upcoming'] },
    minLevel: { type: 'integer', minimum: 1 },
    taskId: { type: 'string', minLength: 1 }, taskKind: { type: 'string' },
    descriptionEs: { type: 'string' }, buttonText: { type: 'string' }, linkTo: { type: 'string' },
  },
} as const

export const ADMIN_CATALOG_DOCUMENTS_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Admin miner customization documents',
  type: 'object', additionalProperties: false, required: ['base', 'assets', 'levels', 'benefits'],
  properties: {
    base: { $ref: '#/$defs/base' },
    assets: { type: 'array', items: { $ref: '#/$defs/asset' } },
    levels: { type: 'array', items: { $ref: '#/$defs/level' } },
    benefits: { type: 'array', items: { $ref: '#/$defs/benefit' } },
  },
  $defs: {
    partKey: { enum: [...APPEARANCE_PARTS] },
    asset: {
      type: 'object', additionalProperties: false,
      required: ['assetId', 'partKey', 'name', 'status', 'sortOrder', 'thumbnailUrl', 'layerUrl', 'layer', 'requirements', 'benefitIds', 'version', 'createdAt', 'updatedAt', 'updatedBy'],
      properties: {
        assetId: { type: 'string', minLength: 1 }, partKey: { $ref: '#/$defs/partKey' }, name: { type: 'string', minLength: 1 },
        status: { enum: ['draft', 'published', 'archived'] }, sortOrder: { type: 'integer' },
        thumbnailUrl: { anyOf: [{ type: 'string', format: 'uri' }, { type: 'null' }] },
        layerUrl: { anyOf: [{ type: 'string', format: 'uri' }, { type: 'null' }] },
        layer: { type: 'object', additionalProperties: false, required: ['canvasW', 'canvasH', 'offsetX', 'offsetY', 'scale'], properties: {
          canvasW: { type: 'integer', minimum: 1 }, canvasH: { type: 'integer', minimum: 1 }, zIndex: { type: 'integer' },
          offsetX: { type: 'number' }, offsetY: { type: 'number' }, scale: { type: 'number', exclusiveMinimum: 0 },
        } },
        rarityWeightBp: { type: 'integer', minimum: 0, maximum: 10000 },
        requirements: { type: 'array', items: { $ref: '#/$defs/requirement' } }, operator: { enum: ['all', 'any'] },
        benefitIds: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
        descriptionEs: { type: 'string' }, buttonText: { type: 'string' }, linkTo: { type: 'string' },
        version: { type: 'string', minLength: 1 }, createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }, updatedBy: { type: 'string', minLength: 1 },
      },
    },
    base: {
      type: 'object', additionalProperties: false,
      required: ['canvas', 'layerOrder', 'defaultAppearance', 'fallbackImageUrl', 'version', 'updatedAt', 'updatedBy'],
      properties: {
        baseLayerUrl: { anyOf: [{ type: 'string', format: 'uri' }, { type: 'null' }] },
        canvas: { type: 'object', additionalProperties: false, required: ['width', 'height'], properties: { width: { const: 600 }, height: { const: 600 } } },
        layerOrder: { type: 'array', minItems: 9, maxItems: 9, uniqueItems: true, items: { enum: ['wall', 'base', ...APPEARANCE_PARTS.filter((part) => part !== 'wall')] } },
        defaultAppearance: { type: 'object', additionalProperties: false, required: [...APPEARANCE_PARTS], properties: Object.fromEntries(APPEARANCE_PARTS.map((part) => [part, { oneOf: [{ type: 'string', minLength: 1 }, { const: 'none' }] }])) },
        fallbackImageUrl: { anyOf: [{ type: 'string', format: 'uri' }, { type: 'null' }] }, version: { type: 'string', minLength: 1 },
        updatedAt: { type: 'string', format: 'date-time' }, updatedBy: { type: 'string', minLength: 1 },
      },
    },
    level: {
      type: 'object', additionalProperties: false, required: ['level', 'benefitIds', 'descriptionEs', 'isActive'],
      properties: { level: { type: 'integer', minimum: 1 }, name: { type: 'string' }, unilevelRef: { type: 'string' },
        benefitIds: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } }, descriptionEs: { type: 'string' }, isActive: { type: 'boolean' } },
    },
    benefit: {
      type: 'object', additionalProperties: false, required: ['benefitId', 'kind', 'labelEs', 'descriptionEs'],
      properties: { benefitId: { type: 'string', minLength: 1 }, kind: { type: 'string', minLength: 1 }, value: {}, unit: { type: 'string' }, labelEs: { type: 'string' }, descriptionEs: { type: 'string' } },
    },
    requirement: requirementSchema,
  },
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, field: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) throw new Error(`${field} must be ${allowEmpty ? 'text' : 'non-empty text'}`)
}

function timestamp(value: unknown, field: string) {
  text(value, field)
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} must be an ISO date-time`)
}

function jsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(jsonValue)
  return isRecord(value) && Object.values(value).every(jsonValue)
}

function safeAssetUrl(value: unknown, field: string, allowedOrigins: ReadonlySet<string>, allowFixtureDataUrls: boolean): asserts value is string | null {
  if (value === null) return
  text(value, field)
  if (allowFixtureDataUrls && value.startsWith('data:image/svg+xml;')) return
  const url = new URL(value)
  if (url.protocol !== 'https:' || !allowedOrigins.has(url.origin)) throw new Error(`${field} must use HTTPS on an allowed asset origin`)
}

export function validateAdminCatalogDocuments(
  value: unknown,
  allowedOrigins: ReadonlySet<string>,
  allowFixtureDataUrls = false,
) {
  if (!isRecord(value) || !isRecord(value.base) || !Array.isArray(value.assets) || !Array.isArray(value.levels) || !Array.isArray(value.benefits)) throw new Error('Admin catalog must include base, assets, levels, and benefits')

  const base = value.base
  const canvas = base.canvas
  if (!isRecord(canvas) || canvas.width !== 600 || canvas.height !== 600) throw new Error('Catalog canvas must be 600 × 600')
  const layerOrder = base.layerOrder
  if (!Array.isArray(layerOrder) || layerOrder.length !== 9 || new Set(layerOrder).size !== 9 || !['wall', 'base', ...APPEARANCE_PARTS.filter((part) => part !== 'wall')].every((part) => layerOrder.includes(part))) throw new Error('Catalog layerOrder must contain wall, base, and each editable part exactly once')
  if (!isRecord(base.defaultAppearance) || Object.keys(base.defaultAppearance).length !== APPEARANCE_PARTS.length) throw new Error('Catalog defaultAppearance must define the eight editable parts')
  for (const part of APPEARANCE_PARTS) {
    if (!(part in base.defaultAppearance) || (typeof base.defaultAppearance[part] !== 'string' && base.defaultAppearance[part] !== 'none')) throw new Error(`Catalog defaultAppearance.${part} must be an asset id or none`)
  }
  if (base.baseLayerUrl !== undefined) safeAssetUrl(base.baseLayerUrl, 'base.baseLayerUrl', allowedOrigins, allowFixtureDataUrls)
  safeAssetUrl(base.fallbackImageUrl, 'base.fallbackImageUrl', allowedOrigins, allowFixtureDataUrls)
  text(base.version, 'base.version')
  timestamp(base.updatedAt, 'base.updatedAt')
  text(base.updatedBy, 'base.updatedBy')
  const parsedBase = base as unknown as CatalogBaseDocument

  const assetIds = new Set<string>()
  const assets = value.assets.map((raw, index) => {
    if (!isRecord(raw) || !APPEARANCE_PARTS.includes(raw.partKey as AppearancePart)) throw new Error(`assets[${index}].partKey is invalid`)
    text(raw.assetId, `assets[${index}].assetId`)
    if (assetIds.has(raw.assetId)) throw new Error(`assets[${index}].assetId is duplicated`)
    assetIds.add(raw.assetId)
    text(raw.name, `assets[${index}].name`)
    if (!['draft', 'published', 'archived'].includes(String(raw.status))) throw new Error(`assets[${index}].status is invalid`)
    if (typeof raw.sortOrder !== 'number' || !Number.isInteger(raw.sortOrder)) throw new Error(`assets[${index}].sortOrder must be an integer`)
    safeAssetUrl(raw.thumbnailUrl, `assets[${index}].thumbnailUrl`, allowedOrigins, allowFixtureDataUrls)
    safeAssetUrl(raw.layerUrl, `assets[${index}].layerUrl`, allowedOrigins, allowFixtureDataUrls)
    if (!isRecord(raw.layer) || raw.layer.canvasW !== parsedBase.canvas.width || raw.layer.canvasH !== parsedBase.canvas.height || !Number.isFinite(raw.layer.offsetX) || !Number.isFinite(raw.layer.offsetY) || typeof raw.layer.scale !== 'number' || !Number.isFinite(raw.layer.scale) || raw.layer.scale <= 0 || (raw.layer.zIndex !== undefined && (!Number.isInteger(raw.layer.zIndex)))) throw new Error(`assets[${index}].layer must align to the shared 600 × 600 canvas`)
    if (raw.rarityWeightBp !== undefined && (typeof raw.rarityWeightBp !== 'number' || !Number.isInteger(raw.rarityWeightBp) || raw.rarityWeightBp < 0 || raw.rarityWeightBp > 10000)) throw new Error(`assets[${index}].rarityWeightBp must be from 0 to 10000`)
    if (!Array.isArray(raw.requirements) || !raw.requirements.every((requirement) => isRecord(requirement))) throw new Error(`assets[${index}].requirements must be an array`)
    if (raw.operator !== undefined && raw.operator !== 'all' && raw.operator !== 'any') throw new Error(`assets[${index}].operator must be all or any`)
    if (!Array.isArray(raw.benefitIds) || !raw.benefitIds.every((id) => typeof id === 'string') || new Set(raw.benefitIds).size !== raw.benefitIds.length) throw new Error(`assets[${index}].benefitIds must be unique strings`)
    if (raw.descriptionEs !== undefined) text(raw.descriptionEs, `assets[${index}].descriptionEs`, true)
    if (raw.buttonText !== undefined) text(raw.buttonText, `assets[${index}].buttonText`, true)
    if (raw.linkTo !== undefined) text(raw.linkTo, `assets[${index}].linkTo`, true)
    text(raw.version, `assets[${index}].version`)
    timestamp(raw.createdAt, `assets[${index}].createdAt`)
    timestamp(raw.updatedAt, `assets[${index}].updatedAt`)
    text(raw.updatedBy, `assets[${index}].updatedBy`)
    return raw as unknown as CatalogAssetDocument
  })

  for (const part of APPEARANCE_PARTS) {
    const selected = base.defaultAppearance[part]
    if (selected !== 'none' && !assets.some((asset) => asset.assetId === selected && asset.partKey === part && asset.status === 'published')) throw new Error(`base.defaultAppearance.${part} must reference a published asset for that part or none`)
  }

  const benefitIds = new Set<string>()
  const benefits = value.benefits.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`benefits[${index}] must be an object`)
    text(raw.benefitId, `benefits[${index}].benefitId`)
    if (benefitIds.has(raw.benefitId)) throw new Error(`benefits[${index}].benefitId is duplicated`)
    benefitIds.add(raw.benefitId)
    text(raw.kind, `benefits[${index}].kind`)
    if (raw.value !== undefined && !jsonValue(raw.value)) throw new Error(`benefits[${index}].value must be JSON data`)
    if (raw.unit !== undefined) text(raw.unit, `benefits[${index}].unit`, true)
    text(raw.labelEs, `benefits[${index}].labelEs`, true)
    text(raw.descriptionEs, `benefits[${index}].descriptionEs`, true)
    return raw as unknown as CatalogBenefitDocument
  })

  const levelIds = new Set<number>()
  const levels = value.levels.map((raw, index) => {
    if (!isRecord(raw) || typeof raw.level !== 'number' || !Number.isInteger(raw.level) || raw.level < 1) throw new Error(`levels[${index}].level must be a positive integer`)
    if (levelIds.has(raw.level)) throw new Error(`levels[${index}].level is duplicated`)
    levelIds.add(raw.level)
    if (raw.name !== undefined) text(raw.name, `levels[${index}].name`, true)
    if (raw.unilevelRef !== undefined) text(raw.unilevelRef, `levels[${index}].unilevelRef`, true)
    if (!Array.isArray(raw.benefitIds) || !raw.benefitIds.every((id) => typeof id === 'string') || new Set(raw.benefitIds).size !== raw.benefitIds.length) throw new Error(`levels[${index}].benefitIds must be unique strings`)
    if (!raw.benefitIds.every((id) => benefitIds.has(id))) throw new Error(`levels[${index}].benefitIds references an unknown benefit`)
    text(raw.descriptionEs, `levels[${index}].descriptionEs`, true)
    if (typeof raw.isActive !== 'boolean') throw new Error(`levels[${index}].isActive must be a boolean`)
    return raw as unknown as CatalogLevelDocument
  })
  for (const asset of assets) if (!asset.benefitIds.every((id) => benefitIds.has(id))) throw new Error(`assets[${asset.assetId}].benefitIds references an unknown benefit`)

  return { base: parsedBase, assets, levels, benefits }
}

export function toCustomizationCatalog(
  documents: ReturnType<typeof validateAdminCatalogDocuments>,
): CustomizationCatalog {
  const { base, assets, levels, benefits } = documents
  const publishedAssets: CustomAsset[] = assets.filter((asset) => asset.status === 'published').map((asset) => ({
    asset_id: asset.assetId,
    trait_id: asset.assetId,
    part: asset.partKey,
    value: asset.name,
    asset_url: asset.layerUrl,
    thumbnail_url: asset.thumbnailUrl,
    z_index: base.layerOrder.indexOf(asset.partKey) * 100 + (asset.layer.zIndex ?? 0),
    unlock_rule: asset.requirements.length > 0 ? { operator: asset.operator ?? 'any', requirements: asset.requirements } : null,
    benefit_ids: asset.benefitIds,
    ...(asset.descriptionEs === undefined ? {} : { description_es: asset.descriptionEs }),
    ...(asset.buttonText === undefined ? {} : { button_text: asset.buttonText }),
    ...(asset.linkTo === undefined ? {} : { link_to: asset.linkTo }),
    layer: {
      canvas_w: asset.layer.canvasW,
      canvas_h: asset.layer.canvasH,
      offset_x: asset.layer.offsetX,
      offset_y: asset.layer.offsetY,
      scale: asset.layer.scale,
    },
    status: 'published',
    version: asset.version,
    updated_at: asset.updatedAt,
  }))
  const internalLevels: CustomLevel[] = levels.map((level) => ({
    level: level.level,
    ...(level.name === undefined ? {} : { name: level.name }),
    ...(level.unilevelRef === undefined ? {} : { unilevel_ref: level.unilevelRef }),
    benefit_ids: level.benefitIds,
    description_es: level.descriptionEs,
    is_active: level.isActive,
    version: base.version,
    updated_at: base.updatedAt,
  }))
  const internalBenefits: CustomBenefit[] = benefits.map((benefit) => ({
    benefit_id: benefit.benefitId,
    level: levels.find((level) => level.benefitIds.includes(benefit.benefitId))?.level ?? null,
    kind: benefit.kind,
    ...(benefit.value === undefined ? {} : { value: benefit.value }),
    ...(benefit.unit === undefined ? {} : { unit: benefit.unit }),
    label_es: benefit.labelEs,
    description_es: benefit.descriptionEs,
    definition: {
      kind: benefit.kind,
      ...(benefit.value === undefined ? {} : { value: benefit.value }),
      ...(benefit.unit === undefined ? {} : { unit: benefit.unit }),
      labelEs: benefit.labelEs,
      descriptionEs: benefit.descriptionEs,
    },
  }))
  const defaultAppearance = Object.fromEntries(APPEARANCE_PARTS.map((part) => [
    part,
    base.defaultAppearance[part] === 'none' ? null : base.defaultAppearance[part],
  ])) as Record<AppearancePart, string | null>
  return validateCustomizationCatalog({
    version: base.version,
    base: {
      base_image_url: base.baseLayerUrl ?? null,
      fallback_image_url: base.fallbackImageUrl,
      default_appearance: defaultAppearance,
      canvas: base.canvas,
      layer_order: base.layerOrder,
      version: base.version,
      updated_at: base.updatedAt,
    },
    assets: publishedAssets,
    levels: internalLevels,
    benefits: internalBenefits,
  }, new Set([...assets.flatMap((asset) => [asset.layerUrl, asset.thumbnailUrl]), base.baseLayerUrl, base.fallbackImageUrl].filter((url): url is string => typeof url === 'string').map((url) => new URL(url).origin)))
}
