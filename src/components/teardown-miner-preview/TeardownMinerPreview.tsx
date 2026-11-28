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
  type TeardownBackendTelemetry,
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
  telemetry?: TeardownBackendTelemetry
  compact?: boolean
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
  telemetry,
  compact = false,
}: TeardownMinerPreviewProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [viewMode, setViewMode] = useState<TeardownViewMode>(initialMode)
  const [simTheme, setSimTheme] = useState<TeardownTheme>(theme)
  const [manualModeActive, setManualModeActive] = useState<boolean>(initialMode !== 'solid')
  const [prefer2DPoster, setPrefer2DPoster] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [simReady, setSimReady] = useState(false)
  const [iframeError, setIframeError] = useState(false)

  useEffect(() => {
    setSimTheme(theme)
  }, [theme])

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

  const initialPowerRef = useRef<number>(miner.powerTh)
  useEffect(() => {
    initialPowerRef.current = miner.powerTh
  }, [design.slug])

  const iframeSrc = useMemo(
    () =>
      buildTeardownIframeUrl(design, {
        powerTh: initialPowerRef.current,
        theme,
        mode: initialMode,
      }),
    [design, initialMode, theme],
  )

  const payload = useMemo(
    () =>
      buildTeardownPostMessagePayload({
        miner,
        design,
        appearance: effectiveAppearance,
        theme: simTheme,
        mode: viewMode,
        telemetry,
      }),
    [design, effectiveAppearance, miner, simTheme, telemetry, viewMode],
  )

  const postStateToSim = useCallback(
    (ensureAutoTour = false) => {
      const frameWindow = iframeRef.current?.contentWindow
      if (!frameWindow || typeof window === 'undefined') return
      const targetOrigin =
        window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'
      try {
        const messageToSend = manualModeActive ? payload : { ...payload, mode: undefined }
        frameWindow.postMessage(messageToSend, targetOrigin)
        if (ensureAutoTour && !manualModeActive) {
          frameWindow.postMessage({ type: 'sim:restart-tour', designId: design.designId }, targetOrigin)
        }
      } catch {
        // Non-fatal: iframe may still be navigating to the new design HTML
      }
    },
    [design.designId, manualModeActive, payload],
  )

  useEffect(() => {
    setIframeLoaded(false)
    setSimReady(false)
    setIframeError(false)
    setManualModeActive(initialMode !== 'solid')
    setViewMode(initialMode)
    setSimTheme(theme)
  }, [design.slug, initialMode, theme])

  useEffect(() => {
    if (iframeLoaded) {
      postStateToSim(!manualModeActive)
    }
  }, [iframeLoaded, manualModeActive, postStateToSim])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const expectedOrigin = window.location.origin
    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedTeardownMessage(event.origin, expectedOrigin, event.data, design.designId)) {
        return
      }
      if (event.data.theme === 'light' || event.data.theme === 'dark') {
        setSimTheme(event.data.theme)
      }
      setSimReady(true)
      if (event.data.type === 'sim:ready') {
        postStateToSim(true)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [design.designId, postStateToSim])

  // Pause simulation updates when TeardownMinerPreview scrolls out of view
  useEffect(() => {
    const el = stageRef.current
    if (!iframeLoaded || !el || typeof IntersectionObserver === 'undefined') return
    const targetOrigin =
      window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'
    const observer = new IntersectionObserver(
      (entries) => {
        const inView = entries.some((entry) => entry.isIntersecting)
        try {
          iframeRef.current?.contentWindow?.postMessage(
            { type: 'sim:set-paused', designId: design.designId, paused: !inView },
            targetOrigin,
          )
        } catch {
          // Non-fatal
        }
      },
      { rootMargin: '140px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [design.designId, iframeLoaded])

  const show3DSim = webglSupported && !prefer2DPoster && !iframeError

  return (
    <div
      className={`teardown-preview-shell${compact ? ' teardown-preview-shell-compact' : ''}`}
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
              setManualModeActive(true)
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
              setManualModeActive(true)
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

      <div ref={stageRef} className="teardown-preview-stage">
        {(!show3DSim || !simReady) && (
          <div
            className={`teardown-poster-fallback${show3DSim && !simReady ? ' teardown-poster-loading' : ''}`}
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
            className={`teardown-sim-iframe${simReady ? ' teardown-sim-iframe-visible' : ''}`}
            src={iframeSrc}
            title={`Simulador 3D ${design.name} · ${miner.name}`}
            sandbox="allow-scripts allow-same-origin"
            loading="eager"
            onLoad={() => {
              setIframeLoaded(true)
              postStateToSim(true)
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
