import type { MinerAppearance, MinerAppearanceDraft } from '../../nft-miners/appearance'
import type { MinerCustomizationMiner } from '../../nft-miners/miner-customization-model'

export type TeardownDesignSlug =
  | 'v01-scorpion'
  | 'v02-dragon'
  | 'v03-phantom'
  | 'v04-kraken'
  | 'v05-falcon'
  | 'v06-vortex'
  | 'v07-ronin'
  | 'v08-aurora'
  | 'v09-wolf'
  | 'v10-nova'

export type TeardownDesignCode =
  | 'V01'
  | 'V02'
  | 'V03'
  | 'V04'
  | 'V05'
  | 'V06'
  | 'V07'
  | 'V08'
  | 'V09'
  | 'V10'

export type TeardownViewMode = 'solid' | 'cutaway' | 'exploded'
export type TeardownTheme = 'dark' | 'light'

export interface TeardownDesignSpec {
  readonly slug: TeardownDesignSlug
  readonly designId: TeardownDesignCode
  readonly name: string
  readonly subtitle: string
  readonly accentHex: string
  readonly skinTraitId: string
  readonly skinLabel: string
  readonly htmlPath: `/teardown/${TeardownDesignSlug}-live.html`
}

export const FORBIDDEN_TEARDOWN_FILENAMES = [
  'pouw-miner-live.html',
  'pouw-network-live.html',
] as const

export const PRESALE_TEARDOWN_FREE_SKIN_COPY =
  'Personalización de skin y diseño 3D gratis por preventa ($0)'

export const TEARDOWN_PRESALE_DESIGNS: readonly TeardownDesignSpec[] = [
  {
    slug: 'v01-scorpion',
    designId: 'V01',
    name: 'V01 Scorpion',
    subtitle: 'Armadura Mate · Cola Scorpion',
    accentHex: '#ff3b14',
    skinTraitId: 'wall-black',
    skinLabel: 'Black',
    htmlPath: '/teardown/v01-scorpion-live.html',
  },
  {
    slug: 'v02-dragon',
    designId: 'V02',
    name: 'V02 Dragon',
    subtitle: 'Escamas Carmesí · Doble Turbina',
    accentHex: '#ef4444',
    skinTraitId: 'wall-red',
    skinLabel: 'Red',
    htmlPath: '/teardown/v02-dragon-live.html',
  },
  {
    slug: 'v03-phantom',
    designId: 'V03',
    name: 'V03 Phantom',
    subtitle: 'Sigilo Cobalto · Cristal Ahumado',
    accentHex: '#3b82f6',
    skinTraitId: 'wall-blue',
    skinLabel: 'Blue',
    htmlPath: '/teardown/v03-phantom-live.html',
  },
  {
    slug: 'v04-kraken',
    designId: 'V04',
    name: 'V04 Kraken',
    subtitle: 'Núcleo Esmeralda · Profundidad',
    accentHex: '#10b981',
    skinTraitId: 'wall-green',
    skinLabel: 'Green',
    htmlPath: '/teardown/v04-kraken-live.html',
  },
  {
    slug: 'v05-falcon',
    designId: 'V05',
    name: 'V05 Falcon',
    subtitle: 'Titanio Cepillado · Aero',
    accentHex: '#94a3b8',
    skinTraitId: 'wall-grey',
    skinLabel: 'Grey',
    htmlPath: '/teardown/v05-falcon-live.html',
  },
  {
    slug: 'v06-vortex',
    designId: 'V06',
    name: 'V06 Vortex',
    subtitle: 'Turbina Violeta · Plasma',
    accentHex: '#8b5cf6',
    skinTraitId: 'wall-violet',
    skinLabel: 'Violet',
    htmlPath: '/teardown/v06-vortex-live.html',
  },
  {
    slug: 'v07-ronin',
    designId: 'V07',
    name: 'V07 Ronin',
    subtitle: 'Filo Magenta · Neón',
    accentHex: '#ec4899',
    skinTraitId: 'wall-pink',
    skinLabel: 'Pink',
    htmlPath: '/teardown/v07-ronin-live.html',
  },
  {
    slug: 'v08-aurora',
    designId: 'V08',
    name: 'V08 Aurora',
    subtitle: 'Boreal · Prisma Verde',
    accentHex: '#34d399',
    skinTraitId: 'wall-green-plastic',
    skinLabel: 'Green Plastic',
    htmlPath: '/teardown/v08-aurora-live.html',
  },
  {
    slug: 'v09-wolf',
    designId: 'V09',
    name: 'V09 Wolf',
    subtitle: 'Ámbar Solar · Blindaje',
    accentHex: '#f59e0b',
    skinTraitId: 'wall-yellow',
    skinLabel: 'Yellow',
    htmlPath: '/teardown/v09-wolf-live.html',
  },
  {
    slug: 'v10-nova',
    designId: 'V10',
    name: 'V10 Nova',
    subtitle: 'Torre Blanca · Constelación RGB',
    accentHex: '#e2e8f0',
    skinTraitId: 'wall-white',
    skinLabel: 'White',
    htmlPath: '/teardown/v10-nova-live.html',
  },
] as const

export const DEFAULT_TEARDOWN_DESIGN: TeardownDesignSpec = TEARDOWN_PRESALE_DESIGNS[0]

const DESIGN_BY_SLUG = new Map<string, TeardownDesignSpec>(
  TEARDOWN_PRESALE_DESIGNS.map((design) => [design.slug, design]),
)
const DESIGN_BY_CODE = new Map<string, TeardownDesignSpec>(
  TEARDOWN_PRESALE_DESIGNS.map((design) => [design.designId.toLowerCase(), design]),
)
const DESIGN_BY_SKIN_TRAIT = new Map<string, TeardownDesignSpec>(
  TEARDOWN_PRESALE_DESIGNS.map((design) => [design.skinTraitId.toLowerCase(), design]),
)

export function getTeardownDesignById(designIdOrSlug?: string | null): TeardownDesignSpec | undefined {
  if (!designIdOrSlug || typeof designIdOrSlug !== 'string') return undefined
  const normalized = designIdOrSlug.trim().toLowerCase()
  if (!normalized) return undefined
  return (
    DESIGN_BY_SLUG.get(normalized) ??
    DESIGN_BY_CODE.get(normalized) ??
    DESIGN_BY_SKIN_TRAIT.get(normalized)
  )
}

export function resolveDesignSpecFromSkin(input: {
  designId?: string | null
  appearance?: Partial<MinerAppearanceDraft> | MinerAppearance | null
  fallbackSlug?: TeardownDesignSlug
}): TeardownDesignSpec {
  const fromExplicit = getTeardownDesignById(input.designId)
  if (fromExplicit) return fromExplicit

  const skinTraitId = input.appearance?.wall_id
  if (typeof skinTraitId === 'string') {
    const fromSkin = DESIGN_BY_SKIN_TRAIT.get(skinTraitId.trim().toLowerCase())
    if (fromSkin) return fromSkin
  }

  if (input.fallbackSlug) {
    const fallback = DESIGN_BY_SLUG.get(input.fallbackSlug)
    if (fallback) return fallback
  }

  return DEFAULT_TEARDOWN_DESIGN
}

export function resolveSkinTraitIdForDesign(designIdOrSlug: string): string {
  const match = getTeardownDesignById(designIdOrSlug)
  return match ? match.skinTraitId : DEFAULT_TEARDOWN_DESIGN.skinTraitId
}

export function buildTeardownIframeUrl(
  design: TeardownDesignSpec,
  options?: {
    powerTh?: number
    theme?: TeardownTheme
    mode?: TeardownViewMode
  },
): string {
  const params = new URLSearchParams()
  const safePower =
    typeof options?.powerTh === 'number' && Number.isFinite(options.powerTh) && options.powerTh > 0
      ? Number(options.powerTh.toFixed(2))
      : 1
  params.set('th', String(safePower))
  params.set('theme', options?.theme === 'light' ? 'light' : 'dark')
  if (options?.mode) {
    params.set('mode', options.mode)
  }
  return `${design.htmlPath}?${params.toString()}`
}

export interface TeardownPostMessageAppearance {
  wall?: string
  body?: string
  bottom?: string
  fans?: string
  screen?: string
  buttons?: string
  top?: string
  stickers?: string
}

export interface TeardownPostMessagePayload {
  type: 'sim:set-state'
  designId: TeardownDesignCode
  designSlug: TeardownDesignSlug
  powerTh: number
  efficiency: number
  minerId: string
  minerName: string
  theme: TeardownTheme
  mode: TeardownViewMode
  appearance: TeardownPostMessageAppearance
}

function cleanTrait(value: string | null | undefined): string | undefined {
  if (!value || value === 'none') return undefined
  return value
}

export function buildTeardownPostMessagePayload(input: {
  miner: Pick<MinerCustomizationMiner, 'id' | 'name' | 'powerTh' | 'efficiency'>
  design: TeardownDesignSpec
  appearance?: Partial<MinerAppearanceDraft> | MinerAppearance | null
  theme?: TeardownTheme
  mode?: TeardownViewMode
}): TeardownPostMessagePayload {
  const safePower = Number.isFinite(input.miner.powerTh) && input.miner.powerTh > 0 ? input.miner.powerTh : 1
  const safeEfficiency = Number.isFinite(input.miner.efficiency) && input.miner.efficiency > 0 ? input.miner.efficiency : 15

  return {
    type: 'sim:set-state',
    designId: input.design.designId,
    designSlug: input.design.slug,
    powerTh: safePower,
    efficiency: safeEfficiency,
    minerId: input.miner.id,
    minerName: input.miner.name,
    theme: input.theme === 'light' ? 'light' : 'dark',
    mode: input.mode ?? 'solid',
    appearance: {
      wall: cleanTrait(input.appearance?.wall_id),
      body: cleanTrait(input.appearance?.body_id),
      bottom: cleanTrait(input.appearance?.bottom_id),
      fans: cleanTrait(input.appearance?.fans_id),
      screen: cleanTrait(input.appearance?.screen_id),
      buttons: cleanTrait(input.appearance?.buttons_id),
      top: cleanTrait(input.appearance?.top_id),
      stickers: cleanTrait(input.appearance?.stickers_id),
    },
  }
}

export interface TeardownSimIncomingEvent {
  type: 'sim:state-change' | 'sim:intro-complete'
  designId: TeardownDesignCode
  mode?: TeardownViewMode
  theme?: TeardownTheme
}

export function isTrustedTeardownMessage(
  origin: string,
  expectedOrigin: string,
  data: unknown,
  expectedDesignId: TeardownDesignCode,
): data is TeardownSimIncomingEvent {
  if (!origin || !expectedOrigin || origin !== expectedOrigin) return false
  if (!data || typeof data !== 'object') return false
  const record = data as Record<string, unknown>
  if (record.designId !== expectedDesignId) return false
  return record.type === 'sim:state-change' || record.type === 'sim:intro-complete'
}
