import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateAdminCatalogDocuments, toCustomizationCatalog } from '../../src/nft-miners/admin-catalog-contract.ts'
import { unlockRulesFromCatalog } from '../../src/nft-miners/catalog-unlocks.ts'
import { evaluatePieceAccess } from '../../src/nft-miners/piece-access.ts'
import { buildMinerLayerComposition } from '../../src/nft-miners/catalog-composition.ts'
import { APPEARANCE_PAYLOAD_KEY_BY_PART } from '../../src/nft-miners/catalog-types.ts'

const origin = 'https://assets.example'
const parts = ['wall', 'body', 'bottom', 'fans', 'screen', 'buttons', 'top', 'stickers']
const layerOrder = ['wall', 'base', 'body', 'bottom', 'fans', 'screen', 'buttons', 'top', 'stickers']

function documents() {
  const assets = parts.map((partKey, index) => ({
    assetId: `asset-${partKey}`,
    partKey,
    name: `EXAMPLE-NOT-DECISION ${partKey}`,
    status: 'published',
    sortOrder: index,
    thumbnailUrl: null,
    layerUrl: `https://assets.example/${partKey}.png`,
    layer: { canvasW: 600, canvasH: 600, zIndex: index, offsetX: 0, offsetY: 0, scale: 1 },
    requirements: [],
    benefitIds: [],
    version: 'test-v1',
    createdAt: '2026-11-09T00:00:00.000Z',
    updatedAt: '2026-11-09T00:00:00.000Z',
    updatedBy: 'test-admin',
  }))
  return {
    base: {
      canvas: { width: 600, height: 600 },
      layerOrder,
      defaultAppearance: Object.fromEntries(parts.map((part) => [part, part === 'wall' ? 'asset-wall' : 'none'])),
      fallbackImageUrl: `${origin}/fallback.png`,
      version: 'test-v1',
      updatedAt: '2026-11-09T00:00:00.000Z',
      updatedBy: 'test-admin',
    },
    assets,
    levels: Array.from({ length: 20 }, (_, index) => ({ level: index + 1, benefitIds: [], descriptionEs: '', isActive: true })),
    benefits: [],
  }
}

test('validates admin documents with all parts, global defaults, and 20 editable levels', () => {
  const input = documents()
  Object.assign(input.assets[0], {
    descriptionEs: 'EXAMPLE-NOT-DECISION descripción',
    buttonText: 'EXAMPLE-NOT-DECISION acción',
    linkTo: 'https://assets.example/action',
  })
  const parsed = validateAdminCatalogDocuments(input, new Set([origin]))
  const catalog = toCustomizationCatalog(parsed)
  assert.equal(catalog.assets.length, 8)
  assert.equal(catalog.levels.length, 20)
  assert.deepEqual(catalog.benefits, [])
  assert.equal(catalog.base.default_appearance.wall, 'asset-wall')
  assert.equal(catalog.base.default_appearance.body, null)
  assert.deepEqual(catalog.base.layer_order, layerOrder)
  assert.equal(catalog.assets[0].description_es, 'EXAMPLE-NOT-DECISION descripción')
  assert.equal(catalog.assets[0].button_text, 'EXAMPLE-NOT-DECISION acción')
  assert.equal(catalog.assets[0].link_to, 'https://assets.example/action')
})

test('rejects non-HTTPS, unapproved origins, and mismatched transparent-layer canvases', () => {
  const http = documents()
  http.assets[0].layerUrl = 'http://assets.example/wall.png'
  assert.throws(() => validateAdminCatalogDocuments(http, new Set([origin])), /HTTPS/)

  const external = documents()
  external.assets[0].layerUrl = 'https://outside.example/wall.png'
  assert.throws(() => validateAdminCatalogDocuments(external, new Set([origin])), /allowed asset origin/)

  const misaligned = documents()
  misaligned.assets[0].layer.canvasW = 512
  assert.throws(() => validateAdminCatalogDocuments(misaligned, new Set([origin])), /shared 600 × 600 canvas/)
})

test('requires global defaults to point to a published asset for the same part', () => {
  const draftDefault = documents()
  draftDefault.assets[0].status = 'draft'
  assert.throws(() => validateAdminCatalogDocuments(draftDefault, new Set([origin])), /published asset/)

  const wrongPart = documents()
  wrongPart.base.defaultAppearance.wall = 'asset-body'
  assert.throws(() => validateAdminCatalogDocuments(wrongPart, new Set([origin])), /published asset/)
})

test('accepts free-text benefit kinds without requiring benefits in the seed', () => {
  const sample = documents()
  sample.benefits = [{ benefitId: 'benefit-1', kind: 'EXAMPLE-NOT-DECISION', value: { amount: 0 }, unit: 'EXAMPLE-NOT-DECISION', labelEs: '', descriptionEs: '' }]
  sample.assets[0].benefitIds = ['benefit-1']
  sample.levels[0].benefitIds = ['benefit-1']
  const parsed = validateAdminCatalogDocuments(sample, new Set([origin]))
  assert.equal(parsed.benefits[0].kind, 'EXAMPLE-NOT-DECISION')
})

test('keeps lifecycle status separate from upcoming requirements and evaluates all operators', () => {
  const anyRule = documents()
  anyRule.assets[0].requirements = [{ kind: 'always' }, { kind: 'upcoming' }]
  anyRule.assets[0].operator = 'any'
  const anyCatalog = toCustomizationCatalog(validateAdminCatalogDocuments(anyRule, new Set([origin])))
  const anyAsset = anyCatalog.assets.find((asset) => asset.trait_id === 'asset-wall')
  const anyRules = unlockRulesFromCatalog(anyCatalog)
  assert.equal(anyAsset.status, 'published')
  assert.deepEqual(anyRules.get('asset-wall'), { operator: 'any', requirements: [{ kind: 'always' }, { kind: 'upcoming' }] })
  assert.equal(evaluatePieceAccess({ piece: { trait_id: 'asset-wall', unlockRule: anyRules.get('asset-wall') }, miner: {}, progress: null }).state, 'available')

  const soonRule = documents()
  soonRule.assets[0].requirements = [{ kind: 'upcoming' }]
  const soonCatalog = toCustomizationCatalog(validateAdminCatalogDocuments(soonRule, new Set([origin])))
  const soonRules = unlockRulesFromCatalog(soonCatalog)
  assert.equal(evaluatePieceAccess({ piece: { trait_id: 'asset-wall', unlockRule: soonRules.get('asset-wall') }, miner: {}, progress: null }).state, 'upcoming')
})

test('admin layerOrder controls the rendered stack order', () => {
  const input = documents()
  const customOrder = ['wall', 'base', 'screen', 'body', 'buttons', 'fans', 'top', 'stickers', 'bottom']
  input.base.layerOrder = customOrder
  input.base.defaultAppearance = Object.fromEntries(parts.map((part) => [part, `asset-${part}`]))
  const catalog = toCustomizationCatalog(validateAdminCatalogDocuments(input, new Set([origin])))
  const emptyDraft = Object.fromEntries(parts.map((part) => [APPEARANCE_PAYLOAD_KEY_BY_PART[part], null]))
  const composed = buildMinerLayerComposition(catalog, emptyDraft)

  assert.deepEqual(composed.layers.map((layer) => layer.part), customOrder.filter((part) => part !== 'base'))
  assert.equal(composed.baseZIndex, customOrder.indexOf('base'))
})

test('accepts configurable levels and rejects non-positive levels or unknown benefit references', () => {
  const configured = documents()
  configured.levels.push({ level: 21, benefitIds: [], descriptionEs: '', isActive: true })
  assert.equal(validateAdminCatalogDocuments(configured, new Set([origin])).levels.length, 21)

  const badLevel = documents()
  badLevel.levels[0].level = 0
  assert.throws(() => validateAdminCatalogDocuments(badLevel, new Set([origin])), /positive integer/)

  const badBenefit = documents()
  badBenefit.assets[0].benefitIds = ['unknown']
  assert.throws(() => validateAdminCatalogDocuments(badBenefit, new Set([origin])), /unknown benefit/)
})

test('generated local seed contains 115 source traits, 20 empty levels, and no invented benefits', () => {
  const seed = JSON.parse(readFileSync(new URL('../../seed/custom-catalog.seed.json', import.meta.url), 'utf8'))
  const parsed = validateAdminCatalogDocuments(seed, new Set())
  assert.equal(parsed.assets.length, 115)
  assert.equal(parsed.levels.length, 20)
  assert.deepEqual(parsed.benefits, [])
  assert.ok(parsed.levels.every((level) => level.benefitIds.length === 0))
})
