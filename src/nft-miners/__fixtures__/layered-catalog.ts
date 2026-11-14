import { APPEARANCE_PARTS, APPEARANCE_PAYLOAD_KEY_BY_PART, DEFAULT_LAYER_ORDER, type AppearancePart } from '../catalog-types.ts'
import type { LayerAsset, LayerCatalog } from '../catalog-composition'

const fixtureColors = ['#6d42e9', '#31c7a1', '#f2a93b']
function svgData(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function drawBase() {
  return svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><g stroke="#10111b" stroke-width="12" stroke-linejoin="round"><path fill="#d7d9de" d="M126 116 178 84h244l52 32v348l-40 47H166l-40-47z"/><path fill="#8d919c" d="M126 450h348l-40 61H166z"/><path fill="#393c49" d="M156 391h288v68H156z"/></g><path d="M184 84 171 43m245 41 15-48" stroke="#686b76" stroke-width="12" stroke-linecap="round"/><circle cx="169" cy="40" r="13" fill="#343642"/><circle cx="434" cy="33" r="13" fill="#343642"/></svg>`)
}

function drawLayer(part: AppearancePart, color: string, variant: number) {
  const shapes: Record<AppearancePart, string[]> = {
    wall: [
      '<rect x="12" y="12" width="576" height="576" rx="28"/>',
      '<rect x="18" y="18" width="564" height="564" rx="20"/>',
      '<path d="M12 28Q12 12 28 12h544q16 0 16 16v544q0 16-16 16H28q-16 0-16-16z"/>',
    ],
    body: [
      '<path d="m166 127 25-17h208l25 17v263H166z" fill="none" stroke="#d9c5ff" stroke-width="9"/>',
      '<path d="M175 137h240v238H175z" fill="none" stroke="#fff" stroke-width="8" stroke-dasharray="18 10"/>',
      '<path d="M169 130h252v18H169zm0 221h252v18H169z"/>',
    ],
    bottom: [
      '<path d="M148 408h304v56H148z"/><path d="M164 416h18v38h-18zm48 0h18v38h-18zm48 0h18v38h-18zm48 0h18v38h-18zm48 0h18v38h-18zm48 0h18v38h-18z" fill="#292b36"/>',
      '<path d="M148 410h304v48H148z"/><path d="M158 415h30v38h-30zm64 0h30v38h-30zm64 0h30v38h-30zm64 0h30v38h-30zm64 0h30v38h-30z" fill="#292b36"/>',
      '<path d="M148 408h304v56H148z"/><path d="m170 416 22 40m20-40 22 40m20-40 22 40m20-40 22 40m20-40 22 40m20-40 22 40" fill="none" stroke="#292b36" stroke-width="10"/>',
    ],
    fans: [
      '<circle cx="220" cy="421" r="38" fill="none" stroke="#c6cad3" stroke-width="11"/><circle cx="380" cy="421" r="38" fill="none" stroke="#c6cad3" stroke-width="11"/><circle cx="220" cy="421" r="9"/><circle cx="380" cy="421" r="9"/>',
      '<circle cx="220" cy="421" r="38" fill="none" stroke="#c6cad3" stroke-width="8" stroke-dasharray="20 8"/><circle cx="380" cy="421" r="38" fill="none" stroke="#c6cad3" stroke-width="8" stroke-dasharray="20 8"/><circle cx="220" cy="421" r="9"/><circle cx="380" cy="421" r="9"/>',
      '<circle cx="220" cy="421" r="38" fill="none" stroke="#c6cad3" stroke-width="8"/><path d="M220 388v66m-33-33h66m-56-23 46 46m0-46-46 46M380 388v66m-33-33h66m-56-23 46 46m0-46-46 46" stroke="#c6cad3" stroke-width="6"/>',
    ],
    screen: [
      '<rect x="178" y="139" width="244" height="166" rx="20" stroke="#252735" stroke-width="12"/>',
      '<rect x="178" y="139" width="244" height="166" rx="8" stroke="#252735" stroke-width="12"/>',
      '<path d="M178 158q0-19 20-19h204q20 0 20 19v128q0 19-20 19H198q-20 0-20-19z" stroke="#252735" stroke-width="12"/>',
    ],
    buttons: [
      '<circle cx="195" cy="334" r="8"/><circle cx="228" cy="334" r="8"/><circle cx="261" cy="334" r="8"/><circle cx="294" cy="334" r="8"/><circle cx="327" cy="334" r="8"/><circle cx="360" cy="334" r="8"/><circle cx="393" cy="334" r="8"/>',
      '<rect x="187" y="326" width="22" height="16" rx="5"/><rect x="222" y="326" width="22" height="16" rx="5"/><rect x="257" y="326" width="22" height="16" rx="5"/><rect x="292" y="326" width="22" height="16" rx="5"/><rect x="327" y="326" width="22" height="16" rx="5"/><rect x="362" y="326" width="22" height="16" rx="5"/><rect x="397" y="326" width="22" height="16" rx="5"/>',
      '<path d="M190 334h230" stroke="#fff" stroke-width="9" stroke-dasharray="4 27" stroke-linecap="round"/>',
    ],
    top: [
      '<path d="m177 117 32-22h182l32 22-12 24H189z" stroke="#2b1c54" stroke-width="9"/>',
      '<path d="M187 112 220 91h160l33 21-10 24H197z" stroke="#2b1c54" stroke-width="9"/>',
      '<path d="m174 119 25-25h202l25 25-14 22H188z" stroke="#2b1c54" stroke-width="9"/>',
    ],
    stickers: [
      '<path d="M373 184h26v33h-26z"/><path d="m378 192 8 8 8-8m-8 8v10" fill="none" stroke="#fff" stroke-width="5"/>',
      '<circle cx="387" cy="208" r="18"/><path d="M387 195v26m-8-19h14m-14 11h14" stroke="#fff" stroke-width="4"/>',
      '<path d="m387 185 7 15 17 2-13 11 4 17-15-9-15 9 4-17-13-11 17-2z"/>',
    ],
  }
  return svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><g fill="${color}" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">${shapes[part][variant]}</g></svg>`)
}

const assets: LayerAsset[] = APPEARANCE_PARTS.flatMap((part) => fixtureColors.map((color, variant) => {
  const assetId = `fixture-${part}-${variant + 1}`
  return {
    asset_id: assetId,
    trait_id: assetId,
    part,
    value: `SYNTHETIC ${part} ${String.fromCharCode(65 + variant)}`,
    asset_url: drawLayer(part, color, variant),
    thumbnail_url: drawLayer(part, color, variant),
    z_index: DEFAULT_LAYER_ORDER.indexOf(part) * 100 + variant,
  }
}))

const defaultAppearance = Object.fromEntries(APPEARANCE_PARTS.map((part) => [part, null])) as Record<AppearancePart, string | null>

export const layeredCatalogFixture: LayerCatalog = {
  assets,
  base: {
    base_image_url: drawBase(),
    canvas: { width: 600, height: 600 },
    layer_order: DEFAULT_LAYER_ORDER,
    default_appearance: defaultAppearance,
  },
}

export const layeredCatalogFixtureSummary = {
  syntheticAssetCount: assets.length,
  partCount: APPEARANCE_PARTS.length,
  defaultAppearanceKeys: APPEARANCE_PARTS.map((part) => APPEARANCE_PAYLOAD_KEY_BY_PART[part]),
}
