import { APPEARANCE_PARTS, APPEARANCE_PAYLOAD_KEY_BY_PART, type AppearancePart } from '../catalog-types.ts'
import { buildMinerLayerComposition } from '../catalog-composition.ts'
import { MINER_REFERENCE_URL } from '../derived-demo-recolor.ts'
import { composeRecolorPixels } from '../recolor-pixels.ts'
import type { MinerAppearanceDraft } from '../appearance.ts'
import { layeredCatalogFixture } from './layered-catalog.ts'

const result = document.querySelector<HTMLParagraphElement>('#result')!
const checks = document.querySelector<HTMLOListElement>('#checks')!
const preview = document.querySelector<HTMLCanvasElement>('#preview')!

function reportCheck(label: string, passed: boolean) {
  const item = document.createElement('li')
  item.textContent = `${passed ? 'PASS' : 'FAIL'} · ${label}`
  checks.append(item)
  if (!passed) throw new Error(label)
}

function loadImage(source: string) {
  const image = new Image()
  image.src = source
  return image.decode().then(() => image)
}

function pixelAt(context: CanvasRenderingContext2D, x: number, y: number) {
  return [...context.getImageData(x, y, 1, 1).data] as [number, number, number, number]
}

function sameBytes(left: Uint8ClampedArray, right: Uint8ClampedArray) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

async function run() {
  const reference = await loadImage(MINER_REFERENCE_URL)
  const originalCanvas = document.createElement('canvas')
  originalCanvas.width = 600
  originalCanvas.height = 600
  const originalContext = originalCanvas.getContext('2d', { willReadFrequently: true })!
  originalContext.drawImage(reference, 630, 280, 990, 990, 0, 0, 600, 600)
  const originalPixels = originalContext.getImageData(0, 0, 600, 600).data
  const unchangedPixels = composeRecolorPixels(originalPixels, [])
  reportCheck('el compositor sin selecciones conserva exactamente los 360 000 píxeles del minero real', sameBytes(originalPixels, unchangedPixels))

  const asset = (part: AppearancePart, variant: number) => layeredCatalogFixture.assets.find((entry) => entry.asset_id === `fixture-${part}-${variant}`)!
  const wall = asset('wall', 1)
  const body = asset('body', 3)
  const screen = asset('screen', 2)
  const draft = Object.fromEntries(APPEARANCE_PARTS.map((part) => [APPEARANCE_PAYLOAD_KEY_BY_PART[part], null])) as MinerAppearanceDraft
  draft.wall_id = wall.trait_id
  draft.body_id = body.trait_id
  draft.screen_id = screen.trait_id
  const composition = buildMinerLayerComposition(layeredCatalogFixture, draft)
  const drawQueue = [
    { zIndex: composition.baseZIndex, source: composition.baseImageUrl! },
    ...composition.layers.map(({ z_index, asset_url }) => ({ zIndex: z_index, source: asset_url! })),
  ].sort((left, right) => left.zIndex - right.zIndex)
  const images = await Promise.all(drawQueue.map(({ source }) => loadImage(source)))
  const context = preview.getContext('2d', { willReadFrequently: true })!
  images.forEach((image) => context.drawImage(image, 0, 0, 600, 600))

  const wallPixel = pixelAt(context, 30, 30)
  const bodyPixel = pixelAt(context, 300, 131)
  const screenPixel = pixelAt(context, 220, 220)
  reportCheck(`Wall A permanece visible en su región (${wallPixel.join(',')})`, wallPixel.join(',') === '109,66,233,255')
  reportCheck(`Body C permanece visible en su región (${bodyPixel.join(',')})`, bodyPixel.join(',') === '242,169,59,255')
  reportCheck(`Screen B permanece visible en su región (${screenPixel.join(',')})`, screenPixel.join(',') === '49,199,161,255')
  result.dataset.result = 'PASS'
  result.textContent = 'PASS · todos los píxeles esperados coinciden'
}

run().catch((error: unknown) => {
  result.dataset.result = 'FAIL'
  result.textContent = error instanceof Error ? `FAIL · ${error.message}` : `FAIL · ${String(error)}`
})
