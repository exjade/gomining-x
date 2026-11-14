import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMinerLayerComposition } from './catalog-composition.ts'
import { composeRecolorPixels } from './recolor-pixels.ts'

test('the default composition preserves the source pixels exactly', () => {
  const source = Uint8ClampedArray.of(
    34, 87, 120, 255,
    240, 220, 180, 255,
    0, 0, 0, 0,
  )

  assert.deepEqual(composeRecolorPixels(source, []), source)
})

test('wall, body, and screen recolors compose together on their source regions', () => {
  const source = Uint8ClampedArray.of(
    128, 128, 128, 255,
    128, 128, 128, 255,
    128, 128, 128, 255,
    128, 128, 128, 255,
  )
  const tint = (color) => ({ hueShift: 0, saturation: 1, lightness: 0, tint: color })
  const parts = ['wall', 'body', 'bottom', 'fans', 'screen', 'buttons', 'top', 'stickers']
  const defaults = Object.fromEntries(parts.map((part) => [part, null]))
  const masks = {
    wall: Uint8ClampedArray.of(255, 0, 0, 0),
    body: Uint8ClampedArray.of(0, 255, 0, 0),
    screen: Uint8ClampedArray.of(0, 0, 255, 0),
  }
  const composition = buildMinerLayerComposition({
    assets: [
      { asset_id: 'wall-red', trait_id: 'wall-red', part: 'wall', value: 'Wall red', asset_url: null, thumbnail_url: null, z_index: 0, layer: { kind: 'recolor', maskUrl: 'wall-mask', transform: tint('#ff0000') } },
      { asset_id: 'body-green', trait_id: 'body-green', part: 'body', value: 'Body green', asset_url: null, thumbnail_url: null, z_index: 200, layer: { kind: 'recolor', maskUrl: 'body-mask', transform: tint('#00ff00') } },
      { asset_id: 'screen-blue', trait_id: 'screen-blue', part: 'screen', value: 'Screen blue', asset_url: null, thumbnail_url: null, z_index: 500, layer: { kind: 'recolor', maskUrl: 'screen-mask', transform: tint('#0000ff') } },
    ],
    base: { base_image_url: null, default_appearance: defaults, layer_order: ['wall', 'base', ...parts.slice(1)] },
  }, { wall_id: 'wall-red', body_id: 'body-green', screen_id: 'screen-blue' })
  assert.deepEqual(composition.layers.map(({ part }) => part), ['wall', 'body', 'screen'])
  const composed = composeRecolorPixels(source, composition.layers.map(({ part, layer }) => ({
    maskAlpha: masks[part],
    transform: layer.transform,
  })))

  assert.deepEqual([...composed.slice(0, 4)], [255, 1, 1, 255])
  assert.deepEqual([...composed.slice(4, 8)], [1, 255, 1, 255])
  assert.deepEqual([...composed.slice(8, 12)], [1, 1, 255, 255])
  assert.deepEqual([...composed.slice(12, 16)], [...source.slice(12, 16)])
})
