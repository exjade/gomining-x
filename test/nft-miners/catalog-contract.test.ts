import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCustomizationCatalog } from '../../src/nft-miners/catalog-contract.ts'

const stamp = '2026-11-09T00:00:00.000Z'
const emptyDefaults = { wall: null, body: null, bottom: null, fans: null, screen: null, buttons: null, top: null, stickers: null }

function catalog(assetUrl = 'https://assets.example/wall.png') {
  return {
    version: 'test-v1',
    base: { base_image_url: null, default_appearance: emptyDefaults, version: 'test-v1', updated_at: stamp },
    assets: [{ asset_id: 'wall-1', trait_id: 'wall-1', part: 'wall', value: 'Test wall', asset_url: assetUrl, thumbnail_url: null, z_index: 20, unlock_rule: null, status: 'published', version: 'test-v1', updated_at: stamp }],
    levels: Array.from({ length: 20 }, (_, index) => ({ level: index + 1, benefit_ids: [], description_es: '', is_active: true, version: 'test-v1', updated_at: stamp })),
    benefits: [],
  }
}

test('validates the local 20-level default and allowlisted assets', () => {
  const parsed = validateCustomizationCatalog(catalog(), new Set(['https://assets.example']))
  assert.equal(parsed.assets.length, 1)
  assert.equal(parsed.levels.length, 20)
  assert.deepEqual(parsed.benefits, [])
})

test('rejects non-HTTPS and non-allowlisted asset origins', () => {
  assert.throws(() => validateCustomizationCatalog(catalog('http://assets.example/wall.png'), new Set(['https://assets.example'])), /HTTPS/)
  assert.throws(() => validateCustomizationCatalog(catalog('https://other.example/wall.png'), new Set(['https://assets.example'])), /allowed asset origin/)
})

test('accepts synthetic data images only when the dev fixture boundary is explicit', () => {
  const fixture = catalog('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E')
  assert.throws(() => validateCustomizationCatalog(fixture, new Set()), /HTTPS/)
  assert.equal(validateCustomizationCatalog(fixture, new Set(), true).assets.length, 1)

  const imageMask = catalog('data:image/png;base64,AA==')
  assert.throws(() => validateCustomizationCatalog(imageMask, new Set()), /HTTPS/)
  assert.equal(validateCustomizationCatalog(imageMask, new Set(), true).assets.length, 1)
})

test('accepts a configured level count beyond the 20-level local default', () => {
  const configured = catalog()
  configured.levels.push({ level: 21, benefit_ids: [], description_es: '', is_active: true, version: 'test-v1', updated_at: stamp })
  assert.equal(validateCustomizationCatalog(configured, new Set(['https://assets.example'])).levels.length, 21)

  const invalid = catalog()
  invalid.levels[0].level = 0
  assert.throws(() => validateCustomizationCatalog(invalid, new Set(['https://assets.example'])), /positive integer/)
})

test('rejects duplicate catalog levels instead of inferring an asset-to-level map', () => {
  const duplicate = catalog()
  duplicate.levels[1].level = 1
  assert.throws(() => validateCustomizationCatalog(duplicate, new Set(['https://assets.example'])), /duplicates level/)
})
