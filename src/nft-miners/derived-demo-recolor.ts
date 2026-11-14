import type { AppearancePart } from './catalog-types'
import type { RecolorTransform } from './recolor-pixels'

export const MINER_REFERENCE_URL = new URL('./assets/bonus-miner-reference.png', import.meta.url).href

const MASK_URL_BY_PART: Partial<Record<AppearancePart, string>> = {
  wall: new URL('./assets/derived/wall-mask.png', import.meta.url).href,
  body: new URL('./assets/derived/body-mask.png', import.meta.url).href,
  bottom: new URL('./assets/derived/bottom-mask.png', import.meta.url).href,
  screen: new URL('./assets/derived/screen-mask.png', import.meta.url).href,
}

const TINT_BY_COLOR: Record<string, string> = {
  Black: '#282832',
  Blue: '#3877d1',
  Green: '#36a76b',
  'Green Plastic': '#74ae45',
  Grey: '#777d87',
  Pink: '#e270ab',
  Red: '#d94d4d',
  Violet: '#7547cd',
  White: '#e6e8eb',
  Yellow: '#dfbb31',
  Gold: '#d6a43c',
  Silver: '#afb7c2',
  Bronze: '#a96d49',
  Wood: '#91643b',
  Purple: '#7353bf',
}

function colorName(part: AppearancePart, value: string) {
  if (part === 'wall') return value in TINT_BY_COLOR ? value : undefined
  if (part === 'bottom') return /^(White|Black|Purple) treads$/.exec(value)?.[1]
  if (part === 'body' || part === 'screen') return /^(Gold|Silver|Bronze|Black|Green|Violet|Wood)(?: Curves| Holes| Lines)$/.exec(value)?.[1]
  return undefined
}

export function derivedDemoRecolor(part: AppearancePart, value: string) {
  const maskUrl = MASK_URL_BY_PART[part]
  const tint = TINT_BY_COLOR[colorName(part, value) ?? '']
  if (!maskUrl || !tint) return undefined
  const transform: RecolorTransform = { hueShift: 0, saturation: 1, lightness: 0, tint }
  return { kind: 'recolor' as const, maskUrl, transform, source: 'derived-demo' as const }
}

export function derivedDemoBlockedDetail(part: AppearancePart, value: string) {
  if (['fans', 'buttons', 'top', 'stickers'].includes(part)) return `BLOCKED_ASSETS: ${part}`
  if (/ (Curves|Holes|Lines)$/.test(value)) return `BLOCKED_ASSETS: patrón ${value.split(' ').at(-1)}`
  if (part === 'bottom' && value.endsWith(' treads')) return 'BLOCKED_ASSETS: textura de treads'
  return undefined
}
