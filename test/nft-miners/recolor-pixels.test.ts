import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import test from 'node:test'
import { composeRecolorPixels } from '../../src/nft-miners/recolor-pixels.ts'
import { buildMinerLayerComposition } from '../../src/nft-miners/catalog-composition.ts'
import { APPEARANCE_PARTS, APPEARANCE_PAYLOAD_KEY_BY_PART, DEFAULT_LAYER_ORDER } from '../../src/nft-miners/catalog-types.ts'

const CROP = { x: 630, y: 280, width: 990, height: 990 }
const SOURCE_URL = new URL('../../src/nft-miners/assets/bonus-miner-reference.png', import.meta.url)
const MASK_BASE_URL = new URL('../../src/nft-miners/assets/derived/', import.meta.url)
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function decodeRgbaCrop(imageUrl, crop = CROP) {
  const png = readFileSync(imageUrl)
  assert.deepEqual(png.subarray(0, 8), SIGNATURE)
  let cursor = 8
  let width
  let height
  let bitDepth
  let colorType
  const compressed = []
  while (cursor < png.length) {
    const length = png.readUInt32BE(cursor)
    const type = png.toString('ascii', cursor + 4, cursor + 8)
    const dataStart = cursor + 8
    if (type === 'IHDR') {
      width = png.readUInt32BE(dataStart)
      height = png.readUInt32BE(dataStart + 4)
      bitDepth = png[dataStart + 8]
      colorType = png[dataStart + 9]
    }
    if (type === 'IDAT') compressed.push(png.subarray(dataStart, dataStart + length))
    cursor = dataStart + length + 4
    if (type === 'IEND') break
  }

  assert.equal(bitDepth, 8, 'reference and generated masks use 8-bit PNG channels')
  assert.equal(colorType, 6, 'reference and generated masks use RGBA PNG pixels')
  assert.ok(crop.x + crop.width <= width && crop.y + crop.height <= height, 'crop fits source image')
  const scanlines = inflateSync(Buffer.concat(compressed))
  const stride = width * 4
  const output = new Uint8ClampedArray(crop.width * crop.height * 4)
  let previous = new Uint8Array(stride)
  let current = new Uint8Array(stride)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1)
    const filter = scanlines[rowStart]
    for (let x = 0; x < stride; x += 1) {
      const raw = scanlines[rowStart + x + 1]
      const left = x >= 4 ? current[x - 4] : 0
      const above = previous[x]
      const upperLeft = x >= 4 ? previous[x - 4] : 0
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : filter === 4 ? paeth(left, above, upperLeft)
                : (() => { throw new Error(`Unsupported PNG row filter ${filter}`) })()
      current[x] = (raw + predictor) & 255
    }
    if (y >= crop.y && y < crop.y + crop.height) {
      const sourceStart = crop.x * 4
      const outputStart = (y - crop.y) * crop.width * 4
      output.set(current.subarray(sourceStart, sourceStart + crop.width * 4), outputStart)
    }
    const previousRow = previous
    previous = current
    current = previousRow
  }
  return output
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left
    : aboveDistance <= upperLeftDistance ? above
      : upperLeft
}

const referencePixels = decodeRgbaCrop(SOURCE_URL)
const masks = Object.fromEntries(['wall', 'body', 'screen'].map((part) => {
  const rgba = decodeRgbaCrop(new URL(`${part}-mask.png`, MASK_BASE_URL))
  return [part, Uint8Array.from({ length: CROP.width * CROP.height }, (_, pixelIndex) => rgba[pixelIndex * 4 + 3])]
}))

function pixel(pixels, x, y) {
  const offset = (y * CROP.width + x) * 4
  return [...pixels.slice(offset, offset + 4)]
}

function sampleExclusivePixel(part) {
  const candidates = Object.entries(masks).filter(([otherPart]) => otherPart !== part).map(([, alpha]) => alpha)
  for (let index = 0; index < masks[part].length; index += 1) {
    if (masks[part][index] >= 250 && candidates.every((mask) => mask[index] === 0) && referencePixels[index * 4 + 3] > 0) {
      return { x: index % CROP.width, y: Math.floor(index / CROP.width) }
    }
  }
  assert.fail(`No exclusive opaque source pixels found for ${part} mask`)
}

test('the default compositor output is pixel-identical to the real miner render used by the detail view', () => {
  const realDetailRender = decodeRgbaCrop(SOURCE_URL)
  const defaultAppearance = Object.fromEntries(APPEARANCE_PARTS.map((part) => [part, null]))
  const defaultDraft = Object.fromEntries(APPEARANCE_PARTS.map((part) => [APPEARANCE_PAYLOAD_KEY_BY_PART[part], null]))
  const composition = buildMinerLayerComposition({
    assets: [],
    base: { base_image_url: null, fallback_image_url: null, default_appearance: defaultAppearance, layer_order: DEFAULT_LAYER_ORDER },
  }, defaultDraft)
  const defaultComposition = composeRecolorPixels(realDetailRender, composition.layers.map((layer) => ({
    maskAlpha: masks[layer.part],
    transform: layer.layer.transform,
  })))
  assert.deepEqual(composition.layers, [], 'the no-change default resolves to the original base with no recolor layers')
  assert.deepEqual(defaultComposition, realDetailRender)
})

test('wall, body, and screen selections all remain visible in one composition from the original render', () => {
  const chosen = [
    { part: 'wall', traitId: 'wall-red', value: 'Red', tint: '#d94d4d', zIndex: 0 },
    { part: 'body', traitId: 'body-gold', value: 'Gold Curves', tint: '#d6a43c', zIndex: 200 },
    { part: 'screen', traitId: 'screen-green', value: 'Green Lines', tint: '#36a76b', zIndex: 500 },
  ]
  const defaultAppearance = Object.fromEntries(APPEARANCE_PARTS.map((part) => [part, null]))
  const draft = Object.fromEntries(APPEARANCE_PARTS.map((part) => [APPEARANCE_PAYLOAD_KEY_BY_PART[part], null]))
  for (const choice of chosen) draft[APPEARANCE_PAYLOAD_KEY_BY_PART[choice.part]] = choice.traitId
  const selection = buildMinerLayerComposition({
    assets: chosen.map(({ part, traitId, value, tint, zIndex }) => ({
      asset_id: `${part}-asset`, trait_id: traitId, part, value, asset_url: null, thumbnail_url: null, z_index: zIndex,
      layer: { kind: 'recolor', maskUrl: `${part}-mask.png`, transform: { hueShift: 0, saturation: 1, lightness: 0, tint } },
    })),
    base: { base_image_url: null, default_appearance: defaultAppearance, layer_order: DEFAULT_LAYER_ORDER },
  }, draft)
  assert.deepEqual(selection.layers.map(({ part }) => part), ['wall', 'body', 'screen'], 'the three chosen catalog traits enter one composition')
  const selectedLayers = selection.layers.map((layer) => ({ maskAlpha: masks[layer.part], transform: layer.layer.transform }))
  const samples = chosen.map(({ part }) => ({ part, ...sampleExclusivePixel(part) }))
  const originalSnapshot = referencePixels.slice()
  const previousDraft = composeRecolorPixels(referencePixels, [{ maskAlpha: masks.wall, transform: { hueShift: 0, saturation: 1, lightness: 0, tint: '#3877d1' } }])
  const composed = composeRecolorPixels(referencePixels, selectedLayers)

  for (const [index, sample] of samples.entries()) {
    assert.notDeepEqual(pixel(composed, sample.x, sample.y), pixel(referencePixels, sample.x, sample.y), `${sample.part} stays visible in the combined render`)
    const { tint } = chosen[index]
    const individuallyExpected = composeRecolorPixels(referencePixels, [{
      maskAlpha: masks[sample.part],
      transform: { hueShift: 0, saturation: 1, lightness: 0, tint },
    }])
    assert.deepEqual(pixel(composed, sample.x, sample.y), pixel(individuallyExpected, sample.x, sample.y), `${sample.part} keeps its expected color alongside the other selections`)
  }
  const outsideIndex = masks.wall.findIndex((_, index) => masks.wall[index] === 0 && masks.body[index] === 0 && masks.screen[index] === 0 && referencePixels[index * 4 + 3] > 0)
  assert.ok(outsideIndex >= 0, 'there are visible source pixels outside the three masks')
  assert.deepEqual(pixel(composed, outsideIndex % CROP.width, Math.floor(outsideIndex / CROP.width)), pixel(referencePixels, outsideIndex % CROP.width, Math.floor(outsideIndex / CROP.width)))
  assert.notDeepEqual(composed, previousDraft, 'editing the set of choices produces a new render from the unchanged original')
  assert.deepEqual(referencePixels, originalSnapshot, 'composing choices never mutates the original render')
})

test('changing the wall selection recalculates each choice from the original source', () => {
  const wall = sampleExclusivePixel('wall')
  const red = composeRecolorPixels(referencePixels, [{ maskAlpha: masks.wall, transform: { hueShift: 0, saturation: 1, lightness: 0, tint: '#d94d4d' } }])
  const blue = composeRecolorPixels(referencePixels, [{ maskAlpha: masks.wall, transform: { hueShift: 0, saturation: 1, lightness: 0, tint: '#3877d1' } }])
  assert.notDeepEqual(pixel(red, wall.x, wall.y), pixel(blue, wall.x, wall.y))
  assert.deepEqual(red, composeRecolorPixels(referencePixels, [{ maskAlpha: masks.wall, transform: { hueShift: 0, saturation: 1, lightness: 0, tint: '#d94d4d' } }]))
})
