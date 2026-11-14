import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMinerLayerComposition, resolveLoadedMinerLayers, resolvePartSelection } from '../../src/nft-miners/catalog-composition.ts'
import { APPEARANCE_PARTS, APPEARANCE_PAYLOAD_KEY_BY_PART, DEFAULT_LAYER_ORDER } from '../../src/nft-miners/catalog-types.ts'
import { layeredCatalogFixture } from '../../src/nft-miners/__fixtures__/layered-catalog.ts'

const emptyAppearance = () => ({
  wall_id: null,
  body_id: null,
  bottom_id: null,
  buttons_id: null,
  fans_id: null,
  screen_id: null,
  stickers_id: null,
  top_id: null,
})

function asset(part, traitId, zIndex) {
  return { asset_id: `${part}-${traitId}`, trait_id: traitId, part, value: traitId, asset_url: `https://assets.example/${traitId}.png`, thumbnail_url: null, z_index: zIndex }
}

test('a replacement changes only the selected part and keeps the configured stack order', () => {
  const catalog = {
    assets: [asset('wall', 'wall-1', 20), asset('wall', 'wall-2', 20), asset('body', 'body-1', 30), asset('bottom', 'bottom-1', 10), asset('screen', 'screen-1', 40)],
    base: { base_image_url: 'https://assets.example/base.png', default_appearance: { wall: 'wall-1', body: 'body-1', bottom: 'bottom-1', fans: null, screen: 'screen-1', buttons: null, top: null, stickers: null } },
  }
  const draft = emptyAppearance()
  draft.wall_id = 'wall-2'
  const composed = buildMinerLayerComposition(catalog, draft)

  assert.deepEqual(composed.layers.map(({ part, trait_id }) => [part, trait_id]), [
    ['bottom', 'bottom-1'], ['wall', 'wall-2'], ['body', 'body-1'], ['screen', 'screen-1'],
  ])
  assert.equal(composed.layers.filter(({ part }) => part === 'wall').length, 1)
  assert.equal(composed.layers.find(({ part }) => part === 'body').trait_id, 'body-1')
  assert.equal(composed.baseZIndex, DEFAULT_LAYER_ORDER.indexOf('base'))
})

test('explicit None suppresses a global default for only that part', () => {
  const catalog = {
    assets: [asset('wall', 'wall-1', 20), asset('body', 'body-1', 30)],
    base: { base_image_url: null, default_appearance: { wall: 'wall-1', body: 'body-1', bottom: null, fans: null, screen: null, buttons: null, top: null, stickers: null } },
  }
  const draft = emptyAppearance()
  draft.wall_id = 'none'
  const composed = buildMinerLayerComposition(catalog, draft)

  assert.deepEqual(composed.layers.map(({ part }) => part), ['body'])
  assert.equal(resolvePartSelection(draft, 'wall', catalog.base.default_appearance), null)
})

test('unselected parts resolve the current global default while explicit choices stay miner-scoped', () => {
  const catalog = {
    assets: [asset('wall', 'wall-default-a', 20), asset('wall', 'wall-default-b', 20)],
    base: { base_image_url: null, default_appearance: { wall: 'wall-default-a', body: null, bottom: null, fans: null, screen: null, buttons: null, top: null, stickers: null } },
  }
  const draft = emptyAppearance()
  assert.equal(buildMinerLayerComposition(catalog, draft).layers[0].trait_id, 'wall-default-a')

  const changedGlobalDefault = {
    ...catalog,
    base: { ...catalog.base, default_appearance: { ...catalog.base.default_appearance, wall: 'wall-default-b' } },
  }
  assert.equal(buildMinerLayerComposition(changedGlobalDefault, draft).layers[0].trait_id, 'wall-default-b')
  assert.equal(buildMinerLayerComposition(changedGlobalDefault, { ...draft, wall_id: 'wall-default-a' }).layers[0].trait_id, 'wall-default-a')
})

test('an unavailable selected asset falls back per part to its global default', () => {
  const catalog = {
    assets: [asset('wall', 'wall-default', 20), { ...asset('wall', 'wall-selected', 20), asset_url: null }],
    base: { base_image_url: null, default_appearance: { wall: 'wall-default', body: null, bottom: null, fans: null, screen: null, buttons: null, top: null, stickers: null } },
  }
  const draft = emptyAppearance()
  draft.wall_id = 'wall-selected'
  const composed = buildMinerLayerComposition(catalog, draft)

  assert.equal(composed.layers.length, 1)
  assert.equal(composed.layers[0].trait_id, 'wall-default')
  assert.equal(composed.layers[0].fallback, true)
})

test('a decode failure falls back to that part default and keeps other loaded layers', () => {
  const catalog = {
    assets: [
      { ...asset('wall', 'wall-default', 0), asset_url: null, layer: { kind: 'recolor', maskUrl: 'https://assets.example/wall-mask.png', transform: { hueShift: 0, saturation: 1, lightness: 0, tint: '#112233' } } },
      asset('wall', 'wall-selected', 0),
      asset('body', 'body-selected', 200),
      asset('screen', 'screen-selected', 500),
    ],
    base: { base_image_url: 'https://assets.example/base.png', default_appearance: { wall: 'wall-default', body: null, bottom: null, fans: null, screen: null, buttons: null, top: null, stickers: null } },
  }
  const draft = emptyAppearance()
  draft.wall_id = 'wall-selected'
  draft.body_id = 'body-selected'
  draft.screen_id = 'screen-selected'
  const composition = buildMinerLayerComposition(catalog, draft)
  const resolved = resolveLoadedMinerLayers(composition.layers, new Set([
    'https://assets.example/wall-mask.png',
    'https://assets.example/body-selected.png',
  ]))

  assert.deepEqual(resolved.map(({ part, state, asset: loadedAsset }) => [part, state, loadedAsset?.trait_id]), [
    ['wall', 'fallback', 'wall-default'],
    ['body', 'ready', 'body-selected'],
    ['screen', 'failed', undefined],
  ])
  assert.equal(resolved[0].asset.layer.kind, 'recolor')
})

test('the dev fixture has three transparent SVG layers for every editable part and a code-drawn base', () => {
  assert.equal(layeredCatalogFixture.assets.length, 24)
  for (const part of ['wall', 'body', 'bottom', 'fans', 'screen', 'buttons', 'top', 'stickers']) {
    assert.equal(layeredCatalogFixture.assets.filter((asset) => asset.part === part).length, 3)
  }
  assert.ok(layeredCatalogFixture.base.base_image_url.startsWith('data:image/svg+xml;'))
  assert.deepEqual(layeredCatalogFixture.base.layer_order, DEFAULT_LAYER_ORDER)
  const baseOnly = buildMinerLayerComposition(layeredCatalogFixture, emptyAppearance())
  assert.deepEqual(baseOnly.layers, [])
  assert.equal(baseOnly.baseZIndex, 1)
  const allPartsDraft = Object.fromEntries(APPEARANCE_PARTS.map((part) => [
    APPEARANCE_PAYLOAD_KEY_BY_PART[part], layeredCatalogFixture.assets.find((asset) => asset.part === part).trait_id,
  ]))
  const composition = buildMinerLayerComposition(layeredCatalogFixture, allPartsDraft)
  assert.deepEqual(composition.layers.map(({ part }) => part), ['wall', 'body', 'bottom', 'fans', 'screen', 'buttons', 'top', 'stickers'])
  assert.equal(composition.baseZIndex, 1)
  for (const asset of layeredCatalogFixture.assets) {
    assert.ok(asset.asset_url.startsWith('data:image/svg+xml;'))
    const svg = decodeURIComponent(asset.asset_url.split(',')[1])
    assert.doesNotMatch(svg, /<rect[^>]+width=["']600["']/)
  }
})
