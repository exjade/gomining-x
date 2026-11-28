import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Cpu, X } from 'lucide-react'
import {
  buildTeardownIframeUrl,
  buildTeardownPostMessagePayload,
  isTrustedTeardownMessage,
  type TeardownDesignSpec,
  type TeardownTheme,
  type TeardownViewMode,
} from '../teardown-miner-preview/designCatalog'
import {
  EFFICIENCY_W_PER_TH,
  formatPearl,
  formatTh,
  formatUsd,
  type ChooseEarningsMetrics,
} from './chooseEarningsModel'

export interface ChooseEarningsHudProps {
  design: TeardownDesignSpec
  metrics: ChooseEarningsMetrics
  isOpen: boolean
  onClose: () => void
  onScrollToOrder: () => void
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

function formatUptime(seconds: number): string {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

interface ChooseEarningsLiveTelemetryProps {
  powerTh: number
  wattsEstimate: number
  accentHex: string
  isOpen: boolean
}

/** Isolated 1Hz telemetry strip so live ticks never re-render the parent HUD or 3D iframe. */
const ChooseEarningsLiveTelemetry = memo(function ChooseEarningsLiveTelemetry({
  powerTh,
  wattsEstimate,
  accentHex,
  isOpen,
}: ChooseEarningsLiveTelemetryProps) {
  const [liveHashrate, setLiveHashrate] = useState<number>(powerTh)
  const [liveTemp, setLiveTemp] = useState<number>(61.2)
  const [uptimeSeconds, setUptimeSeconds] = useState<number>(15157)
  const tempTickRef = useRef(0)

  useEffect(() => {
    setLiveHashrate(powerTh)
  }, [powerTh])

  useEffect(() => {
    if (!isOpen) return
    const tick = () => {
      const jitter = 0.985 + Math.random() * 0.03
      setLiveHashrate(powerTh * jitter)
      tempTickRef.current += 1
      setLiveTemp(60.4 + Math.sin(tempTickRef.current / 3) * 1.8 + Math.random() * 0.7)
      setUptimeSeconds((prev) => prev + 1)
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [isOpen, powerTh])

  return (
    <div className="ce-tele">
      <div className="ce-tele-cell">
        <span className="ce-tele-k">
          <span className="ce-tele-dot" style={{ backgroundColor: accentHex }} aria-hidden="true" />
          Hashrate vivo
        </span>
        <span className="ce-tele-v">
          {liveHashrate.toFixed(4)} <small>TH/s</small>
        </span>
      </div>
      <div className="ce-tele-cell">
        <span className="ce-tele-k">
          <span className="ce-tele-dot" style={{ backgroundColor: accentHex }} aria-hidden="true" />
          Potencia base
        </span>
        <span className="ce-tele-v">
          {formatTh(powerTh)} <small>TH/s</small>
        </span>
      </div>
      <div className="ce-tele-cell">
        <span className="ce-tele-k">
          <span className="ce-tele-dot" style={{ backgroundColor: accentHex }} aria-hidden="true" />
          Eficiencia
        </span>
        <span className="ce-tele-v">
          {EFFICIENCY_W_PER_TH.toFixed(1)} <small>W/TH</small>
        </span>
      </div>
      <div className="ce-tele-cell">
        <span className="ce-tele-k">
          <span className="ce-tele-dot" style={{ backgroundColor: accentHex }} aria-hidden="true" />
          Consumo
        </span>
        <span className="ce-tele-v">
          {wattsEstimate.toLocaleString('es-MX')} <small>W</small>
        </span>
      </div>
      <div className="ce-tele-cell">
        <span className="ce-tele-k">
          <span className="ce-tele-dot" style={{ backgroundColor: accentHex }} aria-hidden="true" />
          Temperatura
        </span>
        <span className="ce-tele-v">
          {liveTemp.toFixed(1)} <small>°C</small>
        </span>
      </div>
      <div className="ce-tele-cell">
        <span className="ce-tele-k">
          <span className="ce-tele-dot" style={{ backgroundColor: accentHex }} aria-hidden="true" />
          Uptime
        </span>
        <span className="ce-tele-v">{formatUptime(uptimeSeconds)}</span>
      </div>
    </div>
  )
})

/**
 * Full-bleed expandable HUD for ChooseEarningsSection (PASO 2).
 * Renders the real static 3D HTML sim (/teardown/<design>-live.html) at full
 * width & height with lazy mount (strictly while open) and same-origin
 * state-only postMessage. Telemetry, selected power (TH/s), and hourly/daily/monthly
 * earnings sit in a clean docked console below the full-bleed sim canvas.
 */
export function ChooseEarningsHud({
  design,
  metrics,
  isOpen,
  onClose,
  onScrollToOrder,
}: ChooseEarningsHudProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [viewMode, setViewMode] = useState<TeardownViewMode>('solid')
  const [simTheme, setSimTheme] = useState<TeardownTheme>('dark')
  const [manualModeActive, setManualModeActive] = useState(false)
  const [prefer2D, setPrefer2D] = useState(false)
  const [iframeMountReady, setIframeMountReady] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [simReady, setSimReady] = useState(false)
  const [iframeError, setIframeError] = useState(false)

  // Defer mounting the heavy 3D iframe until after the HUD shell & 2D poster finish their first paint
  useEffect(() => {
    if (!isOpen) {
      setIframeMountReady(false)
      setIframeLoaded(false)
      setSimReady(false)
      return
    }
    const rafId = window.requestAnimationFrame(() => {
      setIframeMountReady(true)
    })
    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [isOpen, design.slug])

  const webglSupported = useMemo(() => detectWebGLSupport(), [])

  // Keep iframe src stable while HUD is open so changing powerTh updates via postMessage without reloading the 3D iframe
  const initialPowerRef = useRef<number>(metrics.tier.powerTh)
  if (!isOpen) {
    initialPowerRef.current = metrics.tier.powerTh
  }
  useEffect(() => {
    initialPowerRef.current = metrics.tier.powerTh
    setSimTheme('dark')
  }, [design.slug])

  const iframeSrc = useMemo(
    () =>
      buildTeardownIframeUrl(design, {
        powerTh: initialPowerRef.current,
        theme: 'dark',
        mode: 'solid',
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [design, isOpen],
  )

  const postMessagePayload = useMemo(
    () =>
      buildTeardownPostMessagePayload({
        miner: {
          id: `PRESALE-${design.designId}`,
          name: design.name,
          powerTh: metrics.tier.powerTh,
          efficiency: EFFICIENCY_W_PER_TH,
        },
        design,
        appearance: { wall_id: design.skinTraitId },
        theme: simTheme,
        mode: viewMode,
        telemetry: {
          priceUsd: metrics.tier.priceUsd,
          pearlPerDay: metrics.dailyPearl,
          prlPerHour: metrics.hourlyPearl,
          usdPerDay: metrics.dailyUsd,
          prlPriceUsdt: metrics.dailyPearl > 0 ? Number((metrics.dailyUsd / metrics.dailyPearl).toFixed(4)) : 0.1,
          farmPowerTh: metrics.tier.powerTh,
          farmEfficiency: EFFICIENCY_W_PER_TH,
          activeMinersCount: 1,
          currency: 'USD',
          minerStatus: 'presale-preview',
          packageId: 'minerx-custom',
        },
      }),
    [
      design,
      metrics.dailyPearl,
      metrics.dailyUsd,
      metrics.hourlyPearl,
      metrics.tier.powerTh,
      metrics.tier.priceUsd,
      simTheme,
      viewMode,
    ],
  )

  const postStateToSim = useCallback(
    (ensureAutoTour = false) => {
      const frameWindow = iframeRef.current?.contentWindow
      if (!frameWindow || typeof window === 'undefined') return
      const targetOrigin =
        window.location.origin && window.location.origin !== 'null'
          ? window.location.origin
          : '*'
      try {
        // Keep auto-tour active by default: only send explicit `mode` when the user switched view manually
        const messageToSend = manualModeActive
          ? postMessagePayload
          : { ...postMessagePayload, mode: undefined }
        frameWindow.postMessage(messageToSend, targetOrigin)
        if (ensureAutoTour && !manualModeActive) {
          frameWindow.postMessage({ type: 'sim:restart-tour', designId: design.designId }, targetOrigin)
        }
      } catch {
        // Non-fatal while iframe navigates between designs
      }
    },
    [design.designId, manualModeActive, postMessagePayload],
  )

  useEffect(() => {
    setIframeLoaded(false)
    setSimReady(false)
    setIframeError(false)
    setManualModeActive(false)
    setViewMode('solid')
  }, [design.slug])

  useEffect(() => {
    if (isOpen && iframeLoaded) {
      postStateToSim(!manualModeActive)
    }
  }, [isOpen, iframeLoaded, manualModeActive, postStateToSim])

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return
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
  }, [design.designId, isOpen, postStateToSim])

  // Pause 3D simulation loop when HUD stage scrolls out of the viewport on mobile/desktop
  useEffect(() => {
    const el = stageRef.current
    if (!isOpen || !iframeLoaded || !el || typeof IntersectionObserver === 'undefined') return
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
  }, [design.designId, iframeLoaded, isOpen])

  const show3DSim = isOpen && webglSupported && !prefer2D && !iframeError

  return (
    <div
      id="choose-earnings-hud-shell"
      className={`ce-hud-shell${isOpen ? ' ce-hud-shell-open' : ''}`}
      data-testid="choose-earnings-hud-shell"
      data-hud-open={isOpen ? 'true' : 'false'}
      data-teardown-design={design.slug}
      data-teardown-design-id={design.designId}
      data-teardown-mode={show3DSim ? viewMode : 'poster-2d'}
      data-teardown-ready={simReady ? 'true' : 'false'}
    >
      <div className="ce-hud-clip">
        <article
          className="ce-hud"
          aria-label={`HUD del Miner ${design.name}`}
          aria-hidden={!isOpen}
        >
          {/* Top chrome bar: status, skin chip, power pill, 3D/Despiece/2D toggle, close */}
          <div className="ce-hud-topbar">
            <span className="ce-hud-live">
              <span className="ce-hud-live-dot" aria-hidden="true" />
              HUD · En vivo
            </span>

            <span className="ce-skin-chip" data-testid="choose-earnings-hud-skin-chip">
              <span
                className="ce-skin-chip-dot"
                style={{ backgroundColor: design.accentHex }}
                aria-hidden="true"
              />
              {design.designId} · {design.shortName.toUpperCase()} · {design.skinCode}
            </span>

            <span className="ce-hud-power-pill" data-testid="choose-earnings-hud-power">
              <Cpu size={13} aria-hidden="true" />
              <span>{formatTh(metrics.tier.powerTh)} TH/s</span>
            </span>

            <span className="ce-sim-status">
              {show3DSim ? (simReady ? 'SIM 3D ACTIVO' : 'CONECTANDO') : 'VISTA 2D'}
            </span>

            <div className="ce-hud-controls" role="group" aria-label="Modo de visualización del HUD">
              <button
                type="button"
                className={`ce-hud-mode-btn${show3DSim && viewMode === 'solid' ? ' ce-hud-mode-btn-active' : ''}`}
                disabled={!webglSupported}
                aria-pressed={show3DSim && viewMode === 'solid'}
                onClick={() => {
                  setPrefer2D(false)
                  setIframeError(false)
                  setManualModeActive(true)
                  setViewMode('solid')
                }}
              >
                3D
              </button>
              <button
                type="button"
                className={`ce-hud-mode-btn${show3DSim && viewMode === 'exploded' ? ' ce-hud-mode-btn-active' : ''}`}
                disabled={!webglSupported}
                aria-pressed={show3DSim && viewMode === 'exploded'}
                onClick={() => {
                  setPrefer2D(false)
                  setIframeError(false)
                  setManualModeActive(true)
                  setViewMode('exploded')
                }}
              >
                Despiece
              </button>
              <button
                type="button"
                className={`ce-hud-mode-btn${!show3DSim ? ' ce-hud-mode-btn-active' : ''}`}
                aria-pressed={!show3DSim}
                onClick={() => setPrefer2D(true)}
              >
                2D
              </button>
            </div>

            <button
              type="button"
              className="ce-hud-close"
              onClick={onClose}
              aria-label="Cerrar HUD"
              data-testid="choose-earnings-hud-close"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          {/* Full-bleed 100% width 3D Simulator Viewport */}
          <div ref={stageRef} className="ce-hud-stage-full" data-testid="choose-earnings-hud-stage">
            {isOpen && (!show3DSim || !simReady) && (
              <div className="ce-hud-poster" data-teardown-fallback="true">
                <img
                  src={design.transparentImagePath}
                  alt={`Miner ${design.name} — ${design.subtitle}`}
                  loading="eager"
                  decoding="async"
                />
                {show3DSim && !simReady && (
                  <div className="ce-hud-skeleton-bar" role="status" aria-live="polite">
                    <span className="ce-hud-poster-loading-pill">
                      Construyendo tu miner {design.designId} · {design.shortName}...
                    </span>
                    <span className="ce-hud-skeleton-track" aria-hidden="true">
                      <span className="ce-hud-skeleton-fill" />
                    </span>
                  </div>
                )}
              </div>
            )}

            {show3DSim && iframeMountReady && (
              <iframe
                key={design.slug}
                ref={iframeRef}
                className={`ce-hud-iframe${simReady ? ' ce-hud-iframe-visible' : ''}`}
                src={iframeSrc}
                title={`Simulador 3D ${design.name} · Preventa POUW`}
                sandbox="allow-scripts allow-same-origin"
                data-testid="choose-earnings-hud-iframe"
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

          {/* Docked telemetry, selected power, hourly/daily/monthly earnings & CTA panel below the sim */}
          <div className="ce-hud-dock" data-testid="choose-earnings-hud-dock">
            <div className="ce-hud-dock-head">
              <div className="ce-hud-id">
                <span className="ce-hud-code">{design.designId}</span>
                <h3>{design.shortName}</h3>
                <span className="ce-hud-free">Skin gratis · $0</span>
              </div>
              <div className="ce-hud-selected-power" data-testid="choose-earnings-hud-power-hero">
                <span className="ce-hud-selected-power-k">Potencia seleccionada</span>
                <span className="ce-hud-selected-power-v">
                  {formatTh(metrics.tier.powerTh)} <small>TH/s</small>
                </span>
              </div>
            </div>

            {/* Earnings Grid: Por hora · Por día · Por mes (USD + PEARL) */}
            <div className="ce-hud-earn-grid" data-testid="choose-earnings-hud-earnings">
              <div className="ce-hud-earn-card ce-hud-earn-card-accent" data-testid="choose-earnings-hud-hourly">
                <span className="ce-hud-earn-k">Ganancia por hora</span>
                <span className="ce-hud-earn-v">
                  <b>{formatUsd(metrics.hourlyUsd, 2)}</b> / hora
                </span>
                <span className="ce-hud-earn-pearl">
                  ≈ {formatPearl(metrics.hourlyPearl)} PEARL / hora
                </span>
              </div>
              <div className="ce-hud-earn-card" data-testid="choose-earnings-hud-daily">
                <span className="ce-hud-earn-k">Ganancia diaria</span>
                <span className="ce-hud-earn-v">
                  <b>{formatUsd(metrics.dailyUsd, 2)}</b> / día
                </span>
                <span className="ce-hud-earn-pearl">
                  ≈ {formatPearl(metrics.dailyPearl)} PEARL / día
                </span>
              </div>
              <div className="ce-hud-earn-card" data-testid="choose-earnings-hud-monthly">
                <span className="ce-hud-earn-k">Ganancia mensual</span>
                <span className="ce-hud-earn-v">
                  <b>{formatUsd(metrics.monthlyUsd, metrics.monthlyUsd >= 1000 ? 0 : 2)}</b> / mes
                </span>
                <span className="ce-hud-earn-pearl">
                  ≈ {formatPearl(metrics.monthlyPearl)} PEARL / mes
                </span>
              </div>
            </div>

            {/* 6-cell Live Telemetry Strip (memoized so 1Hz ticks never re-render parent/iframe) */}
            <ChooseEarningsLiveTelemetry
              powerTh={metrics.tier.powerTh}
              wattsEstimate={metrics.wattsEstimate}
              accentHex={design.accentHex}
              isOpen={isOpen}
            />

            {/* Footer CTA + Skin note */}
            <div className="ce-hud-foot">
              <button
                type="button"
                className="ce-btn-cta"
                onClick={onScrollToOrder}
                data-testid="choose-earnings-hud-cta"
              >
                <span>
                  Asegurar {formatTh(metrics.tier.powerTh)} TH/s ({formatUsd(metrics.tier.priceUsd, 2)})
                </span>
                <ArrowDown size={15} aria-hidden="true" />
              </button>
              <span className="ce-hud-note">
                Skin <b>{design.shortName}</b> ({design.skinCode}) incluida gratis en preventa · El
                precio depende solo de la potencia elegida.
              </span>
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}
