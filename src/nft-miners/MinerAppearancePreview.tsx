import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { usePersonalization } from '../personalization'
import {
  appearanceDraftFromSaved,
  getSelectedAppearanceTraits,
  type MinerAppearanceDraft,
} from './appearance'
import { buildMinerLayerComposition, resolveLoadedMinerLayers, type ComposedMinerAsset } from './catalog-composition'
import { useCustomizationCatalog } from './catalog-repository'
import type { ComposedCatalogAssetLayer, CustomizationCatalog } from './catalog-contract'
import { MINER_REFERENCE_URL } from './derived-demo-recolor'
import type { MinerCustomizationMiner } from './miner-customization-model'
import { composeRecolorPixels } from './recolor-pixels'

type DecodedComposition = {
  key: string
  baseLoaded: boolean
  fallbackLoaded: boolean
  loadedSources: ReadonlySet<string>
  composition: ReturnType<typeof buildMinerLayerComposition>
}

type RecolorCompositionLayer = ComposedMinerAsset & {
  layer: Extract<ComposedCatalogAssetLayer, { kind: 'recolor' }>
  loadState: 'ready' | 'fallback'
}

function preloadImage(source: string) {
  const image = new Image()
  image.src = source
  return image.decode().then(() => true, () => false)
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = source
  })
}

function MinerRecolorCanvas({ layers, baseImageUrl }: { layers: readonly RecolorCompositionLayer[]; baseImageUrl: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const baseSource = baseImageUrl ?? MINER_REFERENCE_URL
  const cropSource = baseImageUrl === null
  const layerKey = `${baseSource}|${layers.map((layer) => `${layer.layer.maskUrl}:${JSON.stringify(layer.layer.transform)}`).join('|')}`

  useEffect(() => {
    let active = true
    Promise.all([loadImage(baseSource), ...layers.map((layer) => loadImage(layer.layer.maskUrl))]).then(([baseImage, ...loadedMasks]) => {
      const masks = loadedMasks.filter((mask): mask is HTMLImageElement => mask !== null)
      if (!active || !canvasRef.current || !baseImage || masks.length !== layers.length) return
      const stagingCanvas = document.createElement('canvas')
      stagingCanvas.width = 600
      stagingCanvas.height = 600
      const context = stagingCanvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Miner recolor canvas is unavailable')
      const baseCrop = cropSource ? [630, 280, 990, 990] as const : [0, 0, baseImage.naturalWidth, baseImage.naturalHeight] as const
      context.drawImage(baseImage, baseCrop[0], baseCrop[1], baseCrop[2], baseCrop[3], 0, 0, 600, 600)
      const imageData = context.getImageData(0, 0, 600, 600)

      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = 600
      maskCanvas.height = 600
      const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })
      if (!maskContext) throw new Error('Miner recolor mask canvas is unavailable')
      const recolorInputs = layers.map((layer, index) => {
        maskContext.clearRect(0, 0, 600, 600)
        const mask = masks[index]
        const maskCrop = cropSource ? [630, 280, 990, 990] as const : [0, 0, mask.naturalWidth, mask.naturalHeight] as const
        maskContext.drawImage(mask, maskCrop[0], maskCrop[1], maskCrop[2], maskCrop[3], 0, 0, 600, 600)
        const maskData = maskContext.getImageData(0, 0, 600, 600)
        const maskAlpha = new Uint8ClampedArray(600 * 600)
        for (let pixel = 0; pixel < maskAlpha.length; pixel += 1) maskAlpha[pixel] = maskData.data[pixel * 4 + 3]
        return { maskAlpha, transform: layer.layer.transform }
      })
      imageData.data.set(composeRecolorPixels(imageData.data, recolorInputs))
      context.putImageData(imageData, 0, 0)
      const canvas = canvasRef.current
      if (!active || !canvas) return
      canvas.width = 600
      canvas.height = 600
      const visibleContext = canvas.getContext('2d')
      if (!visibleContext) throw new Error('Miner recolor canvas is unavailable')
      visibleContext.drawImage(stagingCanvas, 0, 0)
      setReady(true)
    })
    return () => { active = false }
  }, [baseSource, cropSource, layerKey, layers])

  return <canvas ref={canvasRef} className="pwm-miner-recolor-layer" data-parts={layers.map((layer) => layer.part).join(',')} data-layer-load-states={layers.map((layer) => `${layer.part}:${layer.loadState}`).join(',')} data-recolor-key={layerKey} aria-hidden="true" style={{ zIndex: 2, visibility: ready ? 'visible' : 'hidden' }} />
}

export function MinerAppearancePreview({
  miner,
  compact = false,
  appearanceOverride,
  catalogOverride,
}: {
  miner: MinerCustomizationMiner
  compact?: boolean
  appearanceOverride?: MinerAppearanceDraft
  catalogOverride?: CustomizationCatalog
}) {
  const { t } = usePersonalization()
  const location = useLocation()
  const { catalog: loadedCatalog } = useCustomizationCatalog(location.search, location.pathname)
  const catalog = catalogOverride ?? loadedCatalog
  const savedDraft = useMemo(() => appearanceDraftFromSaved(miner.appearance), [miner.appearance])
  const appearance = appearanceOverride ?? savedDraft
  const composition = useMemo(() => buildMinerLayerComposition(catalog, appearance), [catalog, appearance])
  const sources = useMemo(() => [...new Set([
    ...(composition.baseImageUrl ? [composition.baseImageUrl] : []),
    ...(composition.fallbackImageUrl ? [composition.fallbackImageUrl] : []),
    ...composition.layers.flatMap((layer) => [
      layer.asset_url,
      ...(layer.layer?.kind === 'recolor' ? [layer.layer.maskUrl] : []),
      layer.fallbackAsset?.asset_url ?? null,
      ...(layer.fallbackAsset?.layer?.kind === 'recolor' ? [layer.fallbackAsset.layer.maskUrl] : []),
    ].filter((source): source is string => source !== null)),
  ])], [composition.baseImageUrl, composition.layers])
  const compositionKey = JSON.stringify({ sources, layers: composition.layers })
  const [decoded, setDecoded] = useState<DecodedComposition | null>(null)
  useEffect(() => {
    if (!composition.usesLayeredComposition) {
      setDecoded({ key: compositionKey, baseLoaded: false, fallbackLoaded: false, loadedSources: new Set(), composition })
      return
    }
    let active = true
    Promise.all(sources.map(async (source) => [source, await preloadImage(source)] as const)).then((results) => {
      if (!active) return
      const loadedSources = new Set(results.filter(([, loaded]) => loaded).map(([source]) => source))
      setDecoded({
        key: compositionKey,
        baseLoaded: composition.baseImageUrl ? loadedSources.has(composition.baseImageUrl) : false,
        fallbackLoaded: composition.fallbackImageUrl ? loadedSources.has(composition.fallbackImageUrl) : false,
        loadedSources,
        composition,
      })
    })
    return () => { active = false }
  }, [composition.baseImageUrl, composition.usesLayeredComposition, compositionKey, sources])
  const displayComposition = decoded?.composition ?? composition
  const canShowComposition = displayComposition.usesLayeredComposition && decoded !== null
  const resolvedLayers = decoded ? resolveLoadedMinerLayers(displayComposition.layers, decoded.loadedSources) : []
  const recolorLayers = resolvedLayers.flatMap(({ asset, state }) => {
    if (!asset || state === 'failed' || asset.layer?.kind !== 'recolor') return []
    if (asset.layer.source === 'derived-demo' && displayComposition.baseImageUrl !== null) return []
    return [{ ...asset, layer: asset.layer, loadState: state }]
  })
  const renderBaseImageUrl = decoded?.baseLoaded && displayComposition.baseImageUrl
    ? displayComposition.baseImageUrl
    : decoded?.fallbackLoaded && displayComposition.fallbackImageUrl
      ? displayComposition.fallbackImageUrl
      : null
  const selectedTraits = displayComposition.layers.length > 0
    ? displayComposition.layers.map((layer) => ({ category: t(`minerCustomization.category.${layer.part}`), value: layer.value }))
    : getSelectedAppearanceTraits(appearance).map(({ category, trait }) => ({ category: t(`minerCustomization.category.${category}`), value: trait.value }))
  const showsBonusReference = /bonus miner|5422372/i.test(`${miner.name} ${miner.id}`)
  const showsCustomizerReference = showsBonusReference
    || appearanceOverride !== undefined
    || miner.appearance !== undefined
    || composition.usesLayeredComposition

  return (
    <div
      className={`pwm-miner-visual${compact ? ' pwm-miner-visual-compact' : ''}${showsCustomizerReference ? ' pwm-miner-visual-bonus' : ''}`}
      role="group"
      aria-label={`${miner.name}, ${miner.powerTh.toFixed(2)} TH, ${miner.efficiency} W/TH`}
      data-preview-state={canShowComposition ? 'LAYERED' : undefined}
      data-composition-load-state={decoded?.key === compositionKey ? 'ready' : 'loading'}
    >
      {showsCustomizerReference ? canShowComposition ? <div className="pwm-miner-layer-stack" aria-hidden="true">
        {displayComposition.baseImageUrl && decoded?.baseLoaded
          ? <img className="pwm-miner-base-layer" style={{ zIndex: displayComposition.baseZIndex }} src={displayComposition.baseImageUrl} alt="" />
          : displayComposition.fallbackImageUrl && decoded?.fallbackLoaded
            ? <img className="pwm-miner-base-layer" src={displayComposition.fallbackImageUrl} alt="" />
            : <div className="pwm-miner-reference-art" />}
        {recolorLayers.length > 0 && <MinerRecolorCanvas layers={recolorLayers} baseImageUrl={renderBaseImageUrl} />}
        {resolvedLayers.filter(({ asset }) => asset?.layer?.kind !== 'recolor').map(({ asset, part, state }) => {
          const overlay = asset?.layer?.kind === 'overlay' ? asset.layer : undefined
          return asset?.asset_url
            ? <img className="pwm-miner-part-layer" key={part} data-part={part} data-layer-load-state={state} style={{
              zIndex: asset.z_index,
              transform: overlay ? `translate(${overlay.offset_x / overlay.canvas_w * 100}%, ${overlay.offset_y / overlay.canvas_h * 100}%) scale(${overlay.scale})` : undefined,
              transformOrigin: 'top left',
            }} src={asset.asset_url} alt="" />
            : <div className="pwm-miner-layer-fallback" key={part} data-part={part} data-layer-load-state={state} />
        })}
      </div> : <div className="pwm-miner-reference-art" /> : <span className="pwm-miner-generic-art" aria-hidden="true">▧</span>}
      {compact && <>
        <span className="pwm-miner-metric"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.7 2 5.5 13h5.3L10.1 22 19 10.4h-5.4L13.7 2Z" /></svg>{miner.powerTh.toFixed(2)} TH</span>
        <span className="pwm-miner-efficiency"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v7M16 2v7M6 9h12v3a6 6 0 0 1-5 5.9V22h-2v-4.1A6 6 0 0 1 6 12V9Z" /></svg>{miner.efficiency} W/TH</span>
        <span className="pwm-miner-card-caption"><strong>#{miner.id}</strong><span>{miner.name}</span>{selectedTraits.length > 0 && <span className="pwm-miner-card-appearance" title={selectedTraits.map((trait) => `${trait.category}: ${trait.value}`).join(' · ')}>{selectedTraits.map((trait) => `${trait.category}: ${trait.value}`).join(' · ')}</span>}</span>
      </>}
      {!compact && selectedTraits.length > 0 && <span className="pwm-preview-selection">
        <strong>{t('minerCustomization.previewTitle')}</strong>
        <span>{selectedTraits.map((trait) => `${trait.category}: ${trait.value}`).join(' · ')}</span>
      </span>}
    </div>
  )
}
