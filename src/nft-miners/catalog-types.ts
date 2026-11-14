export const APPEARANCE_PARTS = ['wall', 'body', 'bottom', 'fans', 'screen', 'buttons', 'top', 'stickers'] as const
export const DEFAULT_LAYER_ORDER = ['wall', 'base', 'body', 'bottom', 'fans', 'screen', 'buttons', 'top', 'stickers'] as const

export type AppearancePart = typeof APPEARANCE_PARTS[number]
export type CatalogLayerOrderKey = typeof DEFAULT_LAYER_ORDER[number]
export type AppearancePayloadKey = 'wall_id' | 'body_id' | 'bottom_id' | 'buttons_id' | 'fans_id' | 'screen_id' | 'stickers_id' | 'top_id'

export const APPEARANCE_PAYLOAD_KEY_BY_PART: Record<AppearancePart, Exclude<AppearancePayloadKey, 'items_id'>> = {
  wall: 'wall_id',
  body: 'body_id',
  bottom: 'bottom_id',
  fans: 'fans_id',
  screen: 'screen_id',
  buttons: 'buttons_id',
  top: 'top_id',
  stickers: 'stickers_id',
}
