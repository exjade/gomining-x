import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMinerLayerComposition } from './catalog-composition.ts'
import { layeredCatalogFixture } from './__fixtures__/layered-catalog.ts'
import { LOCAL_SEED_CATALOG } from './catalog-repository.ts'
import { loadDevCatalogFixture } from './dev-catalog-fixture.ts'
import { APPEARANCE_PARTS } from './catalog-types.ts'
import { isDevCatalogLabRequest } from './catalog-dev-route.ts'

test('the dev fixture provides three selectable synthetic assets for every editable part', () => {
  const catalog = loadDevCatalogFixture(LOCAL_SEED_CATALOG)
  const fixtureAssets = catalog.assets.filter(({ asset_id }) => asset_id.startsWith('fixture-'))

  assert.equal(fixtureAssets.length, APPEARANCE_PARTS.length * 3)
  assert.deepEqual(
    Object.fromEntries(APPEARANCE_PARTS.map((part) => [part, fixtureAssets.filter((asset) => asset.part === part).length])),
    Object.fromEntries(APPEARANCE_PARTS.map((part) => [part, 3])),
  )
  assert.equal(catalog.base.base_image_url, layeredCatalogFixture.base.base_image_url)
  assert.ok(fixtureAssets.every(({ asset_url, layer }) => asset_url?.startsWith('data:image/svg+xml') && layer?.kind === 'overlay'))
})

test('the fixture route is dev gated and requires the explicit fixture query', () => {
  assert.equal(isDevCatalogLabRequest(true, '/nft-miners/__lab/customize', '?__devCatalog=fixture'), true)
  assert.equal(isDevCatalogLabRequest(false, '/nft-miners/__lab/customize', '?__devCatalog=fixture'), false)
  assert.equal(isDevCatalogLabRequest(true, '/nft-miners/__lab/customize', ''), false)
})

test('reselecting a part replaces only that part and four selected parts follow catalog z-order', () => {
  const catalog = loadDevCatalogFixture(LOCAL_SEED_CATALOG)
  const asset = (part, index = 0) => catalog.assets.filter((entry) => entry.part === part && entry.asset_id.startsWith('fixture-'))[index]
  const emptyDraft = Object.fromEntries(APPEARANCE_PARTS.map((part) => [`${part}_id`, null]))
  const wallA = asset('wall', 0)
  const wallB = asset('wall', 1)
  const screenX = asset('screen', 0)
  const firstWall = buildMinerLayerComposition(catalog, { ...emptyDraft, wall_id: wallA.trait_id })
  const replacementWall = buildMinerLayerComposition(catalog, { ...emptyDraft, wall_id: wallB.trait_id })
  const wallAndScreen = buildMinerLayerComposition(catalog, { ...emptyDraft, wall_id: wallB.trait_id, screen_id: screenX.trait_id })
  const fourParts = buildMinerLayerComposition(catalog, {
    ...emptyDraft,
    wall_id: wallB.trait_id,
    body_id: asset('body').trait_id,
    screen_id: screenX.trait_id,
    buttons_id: asset('buttons').trait_id,
  })

  assert.deepEqual(firstWall.layers.map(({ trait_id }) => trait_id), [wallA.trait_id])
  assert.deepEqual(replacementWall.layers.map(({ trait_id }) => trait_id), [wallB.trait_id])
  assert.deepEqual(wallAndScreen.layers.map(({ trait_id }) => trait_id), [wallB.trait_id, screenX.trait_id])
  assert.deepEqual(fourParts.layers.map(({ part }) => part), ['wall', 'body', 'screen', 'buttons'])
  assert.deepEqual(fourParts.layers.map(({ trait_id }) => trait_id), [wallB.trait_id, asset('body').trait_id, screenX.trait_id, asset('buttons').trait_id])
})
