import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { appearanceDraftFromSaved, type MinerAppearanceDraft } from '../../nft-miners/appearance'
import type { CustomizationCatalog } from '../../nft-miners/catalog-contract'
import type { MinerCustomizationMiner } from '../../nft-miners/miner-customization-model'
import { MinerAppearancePreview } from '../../nft-miners/MinerAppearancePreview'
import {
  buildTeardownIframeUrl,
  buildTeardownPostMessagePayload,
  isTrustedTeardownMessage,
  resolveDesignSpecFromSkin,
  type TeardownTheme,
  type TeardownViewMode,
} from './designCatalog'
import './teardownMinerPreview.css'

export interface TeardownMinerPreviewProps {
  miner: MinerCustomizationMiner
  appearanceOverride?: MinerAppearanceDraft
  catalogOverride?: CustomizationCatalog
  designId?: string | null
  initialMode?: TeardownViewMode
  theme?: TeardownTheme
}

function detectWebGLSupport(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * EMBUDO-F2 (SCRUM-334):
 * Standalone 3D teardown preview wrapper mounted exclusively in Mi Miner (detail + customizer).
 * Preserves existing miner/trait connections, communicates strictly via validated same-origin postMessage,
 * and falls back gracefully to the 2D MinerAppearancePreview poster while loading or if WebGL is unavailable.
 */
export function TeardownMinerPreview({
  miner,
  appearanceOverride,
  catalogOverride,
  designId,
  initialMode = 'solid',
  theme = 'dark',
}: TeardownMinerPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [viewMode, setViewMode] = useState<TeardownViewMode>(initialMode)
  const [prefer2DPoster, setPrefer2DPoster] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [simReady, setSimReady] = useState(false)
  const [iframeError, setIframeError] = useState(false)

  const webglSupported = useMemo(() => detectWebGLSupport(), [])

  const effectiveAppearance = useMemo(
    () => appearanceOverride ?? appearanceDraftFromSaved(miner.appearance),
    [appearanceOverride, miner.appearance],
  )

  const design = useMemo(
    () =>
      resolveDesignSpecFromSkin({
        designId,
        appearance: effectiveAppearance,
      }),
    [designId, effectiveAppearance],
  )

  const iframeSrc = useMemo(
    () =>
      buildTeardownIframeUrl(design, {
        powerTh: miner.powerTh,
        theme,
        mode: initialMode,
      }),
    [design, initialMode, miner.powerTh, theme],
  )

  const payload = useMemo(
    () =>
      buildTeardownPostMessagePayload({
        miner,
        design,
        appearance: effectiveAppearance,
        theme,
        mode: viewMode,
      }),
    [design, effectiveAppearance, miner, theme, viewMode],
  )

  const postStateToSim = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow
    if (!frameWindow || typeof window === 'undefined') return
    const targetOrigin =
      window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'
    try {
      frameWindow.postMessage(payload, targetOrigin)
    } catch {
      // Non-fatal: iframe may still be navigating to the new design HTML
    }
  }, [payload])

  useEffect(() => {
    setIframeLoaded(false)
    setSimReady(false)
    setIframeError(false)
  }, [design.slug])

  useEffect(() => {
    if (iframeLoaded) {
      postStateToSim()
    }
  }, [iframeLoaded, postStateToSim])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const expectedOrigin = window.location.origin
    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedTeardownMessage(event.origin, expectedOrigin, event.data, design.designId)) {
        return
      }
      setSimReady(true)
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [design.designId])

  const show3DSim = webglSupported && !prefer2DPoster && !iframeError

  return (
    <div
      className="teardown-preview-shell"
      data-teardown-design={design.slug}
      data-teardown-design-id={design.designId}
      data-teardown-mode={show3DSim ? viewMode : 'poster-2d'}
      data-teardown-ready={simReady ? 'true' : 'false'}
    >
      <div className="teardown-preview-topbar">
        <div className="teardown-preview-identity">
          <span
            className="teardown-design-swatch"
            style={{ backgroundColor: design.accentHex }}
            aria-hidden="true"
          />
          <span className="teardown-design-code">{design.name}</span>
          <span className="teardown-free-badge">Preventa · Skin gratis ($0)</span>
        </div>

        <div className="teardown-view-controls" role="group" aria-label="Modo de visualización del minero">
          <button
            type="button"
            className={`teardown-view-btn${show3DSim && viewMode === 'solid' ? ' teardown-view-btn-active' : ''}`}
            disabled={!webglSupported}
            aria-pressed={show3DSim && viewMode === 'solid'}
            onClick={() => {
              setPrefer2DPoster(false)
              setIframeError(false)
              setViewMode('solid')
            }}
          >
            3D
          </button>
          <button
            type="button"
            className={`teardown-view-btn${show3DSim && viewMode === 'exploded' ? ' teardown-view-btn-active' : ''}`}
            disabled={!webglSupported}
            aria-pressed={show3DSim && viewMode === 'exploded'}
            onClick={() => {
              setPrefer2DPoster(false)
              setIframeError(false)
              setViewMode('exploded')
            }}
          >
            Despiece
          </button>
          <button
            type="button"
            className={`teardown-view-btn${!show3DSim ? ' teardown-view-btn-active' : ''}`}
            aria-pressed={!show3DSim}
            onClick={() => setPrefer2DPoster(true)}
          >
            2D
          </button>
        </div>
      </div>

      <div className="teardown-preview-stage">
        {(!show3DSim || !iframeLoaded) && (
          <div
            className={`teardown-poster-fallback${show3DSim && !iframeLoaded ? ' teardown-poster-loading' : ''}`}
            data-teardown-fallback="true"
          >
            <MinerAppearancePreview
              miner={miner}
              appearanceOverride={effectiveAppearance}
              catalogOverride={catalogOverride}
            />
          </div>
        )}

        {show3DSim && (
          <iframe
            key={design.slug}
            ref={iframeRef}
            className={`teardown-sim-iframe${iframeLoaded ? ' teardown-sim-iframe-visible' : ''}`}
            src={iframeSrc}
            title={`Simulador 3D ${design.name} · ${miner.name}`}
            sandbox="allow-scripts allow-same-origin"
            loading="eager"
            onLoad={() => {
              setIframeLoaded(true)
              postStateToSim()
            }}
            onError={() => {
              setIframeError(true)
              setIframeLoaded(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
