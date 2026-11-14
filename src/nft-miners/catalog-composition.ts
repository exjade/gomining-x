import { APPEARANCE_PARTS, APPEARANCE_PAYLOAD_KEY_BY_PART, DEFAULT_LAYER_ORDER, type AppearancePart } from './catalog-types.ts'
import type { MinerAppearanceDraft } from './appearance'
import type { CatalogAssetLayer, ComposedCatalogAssetLayer } from './catalog-contract'
import type { RecolorTransform } from './recolor-pixels'

export type LayerAsset = {
  asset_id: string
  trait_id: string
  part: AppearancePart
  value: string
  asset_url: string | null
  thumbnail_url: string | null
  z_index: number
  layer?: CatalogAssetLayer
}

export type LayerCatalog = {
  assets: readonly LayerAsset[]
  base: {
    base_image_url: string | null
    fallback_image_url?: string | null
    canvas?: { width: number; height: number }
    default_appearance: Record<AppearancePart, string | null>
    layer_order?: readonly (AppearancePart | 'base')[]
  }
}

export type ComposedMinerAsset = Omit<LayerAsset, 'layer'> & { layer?: ComposedCatalogAssetLayer }

export type ComposedMinerLayer = ComposedMinerAsset & { fallback: boolean; fallbackAsset?: ComposedMinerAsset }

export type ResolvedMinerLayer = {
  part: AppearancePart
  state: 'ready' | 'fallback' | 'failed'
  asset?: ComposedMinerAsset
}

function isRecolorLayer(layer: CatalogAssetLayer | undefined): layer is CatalogAssetLayer & { kind: 'recolor'; maskUrl: string; transform: RecolorTransform } {
  return layer?.kind === 'recolor' && typeof layer.maskUrl === 'string' && layer.transform !== undefined
}

function composeAssetLayer(asset: LayerAsset): ComposedMinerAsset {
  return {
    asset_id: asset.asset_id,
    trait_id: asset.trait_id,
    part: asset.part,
    value: asset.value,
    asset_url: asset.asset_url,
    thumbnail_url: asset.thumbnail_url,
    z_index: asset.z_index,
    ...(asset.asset_url ? { layer: {
      kind: 'overlay',
      canvas_w: asset.layer?.canvas_w ?? 600,
      canvas_h: asset.layer?.canvas_h ?? 600,
      offset_x: asset.layer?.offset_x ?? 0,
      offset_y: asset.layer?.offset_y ?? 0,
      scale: asset.layer?.scale ?? 1,
      ...(asset.layer?.source ? { source: asset.layer.source } : {}),
    } as const } : isRecolorLayer(asset.layer) ? { layer: asset.layer } : {}),
  }
}

function isAssetLayerLoaded(asset: ComposedMinerAsset, loadedSources: ReadonlySet<string>) {
  if (asset.layer?.kind === 'recolor') return loadedSources.has(asset.layer.maskUrl)
  return asset.asset_url !== null && loadedSources.has(asset.asset_url)
}

export function resolveLoadedMinerLayers(layers: readonly ComposedMinerLayer[], loadedSources: ReadonlySet<string>): ResolvedMinerLayer[] {
  return layers.map((layer) => {
    if (isAssetLayerLoaded(layer, loadedSources)) return {
      part: layer.part,
      state: layer.fallback ? 'fallback' : 'ready',
      asset: layer,
    }
    if (layer.fallbackAsset && isAssetLayerLoaded(layer.fallbackAsset, loadedSources)) return {
      part: layer.part,
      state: 'fallback',
      asset: layer.fallbackAsset,
    }
    return { part: layer.part, state: 'failed' }
  })
}

export function resolvePartSelection(
  draft: MinerAppearanceDraft,
  part: AppearancePart,
  defaults: Record<AppearancePart, string | null>,
) {
  const selected = draft[APPEARANCE_PAYLOAD_KEY_BY_PART[part]]
  if (selected === 'none') return null
  return selected ?? defaults[part]
}

export function buildMinerLayerComposition(catalog: LayerCatalog, draft: MinerAppearanceDraft) {
  const assetsByTrait = new Map(catalog.assets.map((asset) => [asset.trait_id, asset]))
  const layers: ComposedMinerLayer[] = []
  const layerOrder = catalog.base.layer_order ?? DEFAULT_LAYER_ORDER
  const canRender = (asset: LayerAsset | undefined): asset is LayerAsset => Boolean(asset && (asset.asset_url || isRecolorLayer(asset.layer)))

  for (const part of APPEARANCE_PARTS) {
    const selectedTrait = resolvePartSelection(draft, part, catalog.base.default_appearance)
    if (selectedTrait === null) continue
    const selectedAsset = assetsByTrait.get(selectedTrait)
    const defaultTrait = catalog.base.default_appearance[part]
    const defaultAsset = defaultTrait === null ? undefined : assetsByTrait.get(defaultTrait)
    const asset = canRender(selectedAsset) ? selectedAsset : canRender(defaultAsset) ? defaultAsset : undefined
    if (asset) {
      const fallbackAsset = asset === selectedAsset && defaultAsset !== selectedAsset && canRender(defaultAsset)
        ? composeAssetLayer(defaultAsset)
        : undefined
      layers.push({
      ...composeAssetLayer(asset),
      fallback: asset !== selectedAsset,
      ...(fallbackAsset ? { fallbackAsset } : {}),
      })
    }
  }

  layers.sort((left, right) => left.z_index - right.z_index)
  return {
    baseImageUrl: catalog.base.base_image_url,
    fallbackImageUrl: catalog.base.fallback_image_url ?? null,
    baseZIndex: layerOrder.indexOf('base'),
    layers,
    usesLayeredComposition: layers.length > 0 || catalog.base.base_image_url !== null || catalog.base.fallback_image_url != null,
  }
}
