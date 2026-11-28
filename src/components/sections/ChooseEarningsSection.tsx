import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { ArrowRight, ChevronDown, Clock, Flame, ShieldCheck } from 'lucide-react'
import { TEARDOWN_PRESALE_DESIGNS } from '../teardown-miner-preview/designCatalog'
import { saveEmbudoPresaleSelection, type EmbudoPresaleSelection } from '../embudo-f1'
import {
  CHOOSE_EARNINGS_TIERS,
  DEFAULT_DESIGN_INDEX,
  DEFAULT_TIER_INDEX,
  GENESIS_REMAINING_SPOTS,
  GENESIS_TAKEN_SPOTS,
  GENESIS_TOTAL_SPOTS,
  PRESALE_ACTIVITY_FEED,
  QUICK_TIER_INDICES,
  computeChooseEarningsMetrics,
  formatPearl,
  formatTh,
  formatUsd,
  type EarningsPeriod,
} from './chooseEarningsModel'
import './chooseEarningsSection.css'

const ChooseEarningsHud = lazy(() =>
  import('./ChooseEarningsHud').then((m) => ({ default: m.ChooseEarningsHud })),
)

function circularDistance(index: number, center: number, length: number): number {
  let d = index - center
  if (d > length / 2) d -= length
  if (d < -length / 2) d += length
  return d
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Isolated 1-second countdown timer so ticks never re-render the slider or coverflow carousel. */
const PresaleCountdown = memo(function PresaleCountdown({ active }: { active: boolean }) {
  const targetMsRef = useRef<number>(Date.now() + 15 * 24 * 3600 * 1000)
  const [timeLeft, setTimeLeft] = useState({
    days: 14,
    hours: 23,
    minutes: 59,
    seconds: 48,
  })

  useEffect(() => {
    if (!active) return
    const tick = () => {
      const diff = Math.max(0, targetMsRef.current - Date.now())
      setTimeLeft({
        days: Math.floor(diff / 86_400_000),
        hours: Math.floor(diff / 3_600_000) % 24,
        minutes: Math.floor(diff / 60_000) % 60,
        seconds: Math.floor(diff / 1_000) % 60,
      })
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [active])

  return (
    <div className="ce-countdown" aria-label="Tiempo restante de preventa fase 1">
      <div className="ce-cd-label">
        <Flame className="ce-cd-icon" aria-hidden="true" />
        <span>Tiempo restante de preventa fase 1</span>
      </div>
      <div className="ce-cd-grid">
        <div className="ce-cd-cell">
          <span className="ce-cd-val">{String(timeLeft.days).padStart(2, '0')}</span>
          <span className="ce-cd-unit">DÍAS</span>
        </div>
        <div className="ce-cd-cell">
          <span className="ce-cd-val">{String(timeLeft.hours).padStart(2, '0')}</span>
          <span className="ce-cd-unit">HORAS</span>
        </div>
        <div className="ce-cd-cell">
          <span className="ce-cd-val">{String(timeLeft.minutes).padStart(2, '0')}</span>
          <span className="ce-cd-unit">MINUTOS</span>
        </div>
        <div className="ce-cd-cell">
          <span className="ce-cd-val">{String(timeLeft.seconds).padStart(2, '0')}</span>
          <span className="ce-cd-unit">SEGUNDOS</span>
        </div>
      </div>
      <div className="ce-cd-note">
        <Clock className="ce-cd-icon" aria-hidden="true" />
        <span>
          Al finalizar, los siguientes lotes pasarán a las tarifas estándar de lanzamiento oficial.
        </span>
      </div>
    </div>
  )
})

/** Isolated rotating FOMO activity feed so rotations never re-render the carousel. */
const PresaleActivityFeed = memo(function PresaleActivityFeed({ active }: { active: boolean }) {
  const [activityIdx, setActivityIdx] = useState<number>(0)
  const [activityFading, setActivityFading] = useState<boolean>(false)

  useEffect(() => {
    if (!active) return
    let swapTimer: number | null = null
    const interval = window.setInterval(() => {
      if (prefersReducedMotion()) {
        setActivityIdx((prev) => (prev + 1) % PRESALE_ACTIVITY_FEED.length)
        return
      }
      setActivityFading(true)
      swapTimer = window.setTimeout(() => {
        setActivityIdx((prev) => (prev + 1) % PRESALE_ACTIVITY_FEED.length)
        setActivityFading(false)
      }, 220)
    }, 5200)

    return () => {
      window.clearInterval(interval)
      if (swapTimer !== null) window.clearTimeout(swapTimer)
    }
  }, [active])

  const currentActivity = PRESALE_ACTIVITY_FEED[activityIdx]
  const activityDesign = TEARDOWN_PRESALE_DESIGNS[currentActivity.designIndex]
  const activityTier = CHOOSE_EARNINGS_TIERS[currentActivity.tierIndex]

  return (
    <div className="ce-activity" aria-live="polite" data-testid="choose-earnings-activity">
      <span className="ce-activity-av">
        <img
          src={activityDesign.transparentImagePath}
          alt={`Miner ${activityDesign.name}`}
          loading="lazy"
          decoding="async"
        />
      </span>
      <span className={`ce-activity-tx${activityFading ? ' ce-activity-tx-fading' : ''}`}>
        <b>Un minero</b> aseguró <b>{formatTh(activityTier.powerTh)} TH/s</b> con el{' '}
        <b>{activityDesign.name}</b> por{' '}
        <span className="ce-activity-amt">{formatUsd(activityTier.priceUsd, 2)}</span>
      </span>
      <span className="ce-activity-when">{currentActivity.when}</span>
    </div>
  )
})

const prefetchedSimUrls = new Set<string>()
let hudChunkPrefetched = false

function warmHudResources(htmlPath: string) {
  if (!hudChunkPrefetched) {
    hudChunkPrefetched = true
    void import('./ChooseEarningsHud').catch(() => {})
  }
  if (typeof window === 'undefined' || prefetchedSimUrls.has(htmlPath)) return
  prefetchedSimUrls.add(htmlPath)
  try {
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.as = 'document'
    link.href = htmlPath
    document.head.appendChild(link)
  } catch {
    // non-fatal
  }
}

export interface ChooseEarningsSectionProps {
  onOrderPresale?: (selection: Partial<EmbudoPresaleSelection>) => void
}

export function ChooseEarningsSection({ onOrderPresale }: ChooseEarningsSectionProps = {}) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [tierIndex, setTierIndex] = useState<number>(DEFAULT_TIER_INDEX)
  const [period, setPeriod] = useState<EarningsPeriod>('daily')
  const [designIndex, setDesignIndex] = useState<number>(DEFAULT_DESIGN_INDEX)
  const [hudOpen, setHudOpen] = useState<boolean>(false)
  const [hudEverOpened, setHudEverOpened] = useState<boolean>(false)
  const [orderNotice, setOrderNotice] = useState<string | null>(null)
  const [spotsBarReady, setSpotsBarReady] = useState<boolean>(false)
  const [sectionNearView, setSectionNearView] = useState<boolean>(false)
  const [sectionInView, setSectionInView] = useState<boolean>(false)

  // Responsive viewport width for coverflow step/visibility
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  )

  // Fluid drag + velocity inertia state for coverflow carousel
  const [dragOffset, setDragOffset] = useState<number>(0)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const dragRef = useRef<{
    active: boolean
    pointerId: number | null
    startX: number
    lastX: number
    lastTime: number
    velocityPxPerMs: number
    moved: boolean
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    lastX: 0,
    lastTime: 0,
    velocityPxPerMs: 0,
    moved: false,
  })
  const suppressClickRef = useRef<boolean>(false)
  const autoplayPausedRef = useRef<boolean>(false)
  const autoplayResumeTimeoutRef = useRef<number | null>(null)
  const hudToggleBtnRef = useRef<HTMLButtonElement | null>(null)
  const payCardRef = useRef<HTMLDivElement | null>(null)

  const metrics = useMemo(
    () => computeChooseEarningsMetrics(tierIndex, period),
    [tierIndex, period],
  )
  const activeDesign = TEARDOWN_PRESALE_DESIGNS[designIndex]
  const totalDesigns = TEARDOWN_PRESALE_DESIGNS.length

  const openHud = useCallback(() => {
    setHudEverOpened(true)
    setHudOpen(true)
  }, [])

  const toggleHud = useCallback(() => {
    setHudEverOpened(true)
    setHudOpen((prev) => !prev)
  }, [])

  // IntersectionObserver: defer eager PNG loading & pause timers while section is off-screen
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSectionNearView(true)
      setSectionInView(true)
      return
    }
    const nearObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSectionNearView(true)
        }
      },
      { rootMargin: '420px 0px' },
    )
    const viewObserver = new IntersectionObserver(
      (entries) => {
        setSectionInView(entries.some((entry) => entry.isIntersecting))
      },
      { rootMargin: '120px 0px' },
    )
    nearObserver.observe(el)
    viewObserver.observe(el)
    return () => {
      nearObserver.disconnect()
      viewObserver.disconnect()
    }
  }, [])

  // Smooth animated earnings headline
  const [displayedPeriodUsd, setDisplayedPeriodUsd] = useState<number>(metrics.periodUsd)
  const displayedRef = useRef<number>(metrics.periodUsd)

  useEffect(() => {
    const target = metrics.periodUsd
    if (prefersReducedMotion()) {
      displayedRef.current = target
      setDisplayedPeriodUsd(target)
      return
    }
    const from = displayedRef.current
    const duration = 220
    let startTs: number | null = null
    let rafId = 0

    const step = (ts: number) => {
      if (startTs === null) startTs = ts
      const t = Math.min(1, (ts - startTs) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = from + (target - from) * eased
      displayedRef.current = next
      setDisplayedPeriodUsd(next)
      if (t < 1) {
        rafId = window.requestAnimationFrame(step)
      }
    }

    rafId = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(rafId)
  }, [metrics.periodUsd])

  // Spots fill animation once near viewport
  useEffect(() => {
    if (!sectionNearView) return
    const raf = window.requestAnimationFrame(() => setSpotsBarReady(true))
    return () => window.cancelAnimationFrame(raf)
  }, [sectionNearView])

  // Responsive breakpoint listener
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handleResize, { passive: true })
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const scheduleAutoplayResume = useCallback(() => {
    if (autoplayResumeTimeoutRef.current !== null) {
      window.clearTimeout(autoplayResumeTimeoutRef.current)
    }
    autoplayPausedRef.current = true
    autoplayResumeTimeoutRef.current = window.setTimeout(() => {
      autoplayPausedRef.current = false
    }, 5000)
  }, [])

  useEffect(() => {
    return () => {
      if (autoplayResumeTimeoutRef.current !== null) {
        window.clearTimeout(autoplayResumeTimeoutRef.current)
      }
    }
  }, [])

  const selectDesign = useCallback(
    (nextIndex: number, fromUser = true) => {
      const normalized = ((nextIndex % totalDesigns) + totalDesigns) % totalDesigns
      setDesignIndex(normalized)
      if (fromUser) scheduleAutoplayResume()
    },
    [scheduleAutoplayResume, totalDesigns],
  )

  // Gentle autoplay strictly while visible in viewport, HUD closed, and user not interacting
  useEffect(() => {
    if (prefersReducedMotion() || hudOpen || !sectionInView) return
    const timer = window.setInterval(() => {
      if (!autoplayPausedRef.current && !dragRef.current.active) {
        setDesignIndex((prev) => (prev + 1) % totalDesigns)
      }
    }, 4400)
    return () => window.clearInterval(timer)
  }, [hudOpen, sectionInView, totalDesigns])

  const handlePointerDown = (ev: PointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return
    dragRef.current = {
      active: true,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      lastX: ev.clientX,
      lastTime: performance.now(),
      velocityPxPerMs: 0,
      moved: false,
    }
    autoplayPausedRef.current = true
  }

  const handlePointerMove = (ev: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d.active || d.pointerId !== ev.pointerId) return
    const now = performance.now()
    const dxTotal = ev.clientX - d.startX
    const dt = Math.max(1, now - d.lastTime)
    d.velocityPxPerMs = (ev.clientX - d.lastX) / dt
    d.lastX = ev.clientX
    d.lastTime = now

    if (!d.moved && Math.abs(dxTotal) > 8) {
      d.moved = true
      setIsDragging(true)
      try {
        ev.currentTarget.setPointerCapture(ev.pointerId)
      } catch {
        // Ignore if capture is unsupported
      }
    }
    if (d.moved) {
      setDragOffset(dxTotal * 0.62)
    }
  }

  const finishDrag = (ev: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = dragRef.current
    if (!d.active || d.pointerId !== ev.pointerId) return
    const dxTotal = ev.clientX - d.startX
    const velocity = d.velocityPxPerMs
    const moved = d.moved

    dragRef.current.active = false
    dragRef.current.pointerId = null
    setIsDragging(false)
    setDragOffset(0)

    if (moved) {
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 80)

      if (!cancelled) {
        // Inertia-aware step calculation: fast flicks glide up to 2 cards cleanly
        const projected = dxTotal + velocity * 140
        const threshold = isMobile ? 42 : 52
        if (projected <= -threshold * 2.4) {
          selectDesign(designIndex + 2, true)
        } else if (projected <= -threshold) {
          selectDesign(designIndex + 1, true)
        } else if (projected >= threshold * 2.4) {
          selectDesign(designIndex - 2, true)
        } else if (projected >= threshold) {
          selectDesign(designIndex - 1, true)
        }
      }
    }
    scheduleAutoplayResume()
  }

  const handleStageKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === 'ArrowRight') {
      ev.preventDefault()
      selectDesign(designIndex + 1, true)
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault()
      selectDesign(designIndex - 1, true)
    }
  }

  const handleSurpriseDesign = () => {
    let next = designIndex
    while (next === designIndex) {
      next = Math.floor(Math.random() * totalDesigns)
    }
    selectDesign(next, true)
  }

  const handleScrollToOrder = useCallback(() => {
    payCardRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    })
  }, [])

  const handleCloseHud = useCallback(() => {
    setHudOpen(false)
    hudToggleBtnRef.current?.focus()
  }, [])

  const handleOrderClick = () => {
    const selection: Partial<EmbudoPresaleSelection> = {
      powerTh: metrics.tier.powerTh,
      priceUsd: metrics.tier.priceUsd,
      tierIndex: metrics.tierIndex,
      designSlug: activeDesign.slug,
      designName: activeDesign.name,
      skinCode: activeDesign.skinCode,
      source: 'choose-earnings',
    }
    saveEmbudoPresaleSelection(selection)
    setOrderNotice(
      `Configuración guardada: ${formatUsd(metrics.tier.priceUsd, 2)} USD · ${activeDesign.name} · ${formatTh(metrics.tier.powerTh)} TH/s · skin ${activeDesign.skinCode} gratis ($0).`,
    )
    onOrderPresale?.(selection)
  }

  const sliderFillPct = (metrics.tierIndex / (CHOOSE_EARNINGS_TIERS.length - 1)) * 100

  return (
    <section
      ref={sectionRef}
      id="preventa"
      className="ce-section"
      aria-labelledby="choose-earnings-title"
      data-testid="choose-earnings-section"
    >
      <div className="ce-inner">
        {/* Header */}
        <div className="ce-head">
          <div className="ce-eyebrow">
            <span className="ce-eyebrow-num">05</span>
            <span className="ce-eyebrow-dot" aria-hidden="true" />
            <span className="ce-eyebrow-txt">Preventa Fase 1 // Tú eliges cuánto ganar</span>
          </div>
          <h2 id="choose-earnings-title" className="ce-title">
            Tú eliges
            <br />
            cuánto <span className="ce-title-accent">ganar.</span>
          </h2>
          <p className="ce-sub">
            Sin paquetes fijos y <strong>hasta 50% por debajo del precio de lanzamiento</strong>.
            Mueve el slider hasta la ganancia que quieres, elige el diseño de tu Miner entre las 10
            ediciones de preventa y <strong>asegúralo antes de que se agoten los cupos Génesis</strong>.
          </p>
        </div>

        {/* Presale Countdown (isolated timer component) */}
        <PresaleCountdown active={sectionInView} />

        {/* FOMO Strip: Cupos Génesis (7 de 30) + Feed de actividad */}
        <div
          className="ce-fomo-strip"
          aria-label="Disponibilidad de preventa y actividad reciente"
          data-testid="choose-earnings-fomo"
        >
          <div>
            <div className="ce-spots-head">
              <span className="ce-spots-k">
                <span className="ce-spots-dot" aria-hidden="true" />
                Cupos Génesis · Fase 1
              </span>
              <span className="ce-spots-n">
                <b>{GENESIS_TAKEN_SPOTS}</b> de {GENESIS_TOTAL_SPOTS} asegurados
              </span>
            </div>
            <div className="ce-spots-bar" aria-hidden="true">
              <span
                className="ce-spots-bar-fill"
                style={{
                  width: spotsBarReady
                    ? `${(GENESIS_TAKEN_SPOTS / GENESIS_TOTAL_SPOTS) * 100}%`
                    : '0%',
                }}
              />
            </div>
            <p className="ce-spots-note">
              Quedan <b>{GENESIS_REMAINING_SPOTS} cupos</b> a precio Génesis. Al agotarse, este
              mismo Miner pasa a <b>tarifa de lanzamiento</b> — hasta el doble.
            </p>
          </div>

          <PresaleActivityFeed active={sectionInView} />
        </div>

        {/* PASO 1 · SLIDER DE POTENCIA Y GANANCIA */}
        <div className="ce-step-label">
          <span className="ce-step-badge">
            <span className="ce-step-badge-dot" aria-hidden="true" />
            Paso 1
          </span>
          <h3 className="ce-step-title">¿Cuánto quieres ganar?</h3>
          <p className="ce-step-hint">22 niveles reales · de 1 TH a 5,000 TH</p>
        </div>

        <div className="ce-gain-card" data-testid="choose-earnings-step1">
          <div className="ce-gain-top">
            <div className="ce-gain-hero">
              <span className="ce-gain-k">Ganancia estimada</span>
              <div className="ce-gain-amount">
                <span className="ce-gain-big" data-testid="choose-earnings-headline">
                  ~{formatUsd(displayedPeriodUsd, displayedPeriodUsd >= 1000 ? 0 : 2)}
                </span>
                <span className="ce-gain-per">{metrics.periodLabel}</span>
              </div>
              <div className="ce-gain-pearl" data-testid="choose-earnings-pearl">
                ≈ <b>{formatPearl(metrics.periodPearl)} PEARL</b> por {metrics.periodUnit} · ref. $0.10
              </div>
            </div>

            <div className="ce-periods" role="group" aria-label="Periodo de ganancia estimada">
              {(
                [
                  { id: 'daily', label: 'Diario' },
                  { id: 'monthly', label: 'Mensual' },
                  { id: 'yearly', label: 'Anual' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="ce-period-btn"
                  aria-pressed={period === item.id}
                  data-testid={`choose-earnings-period-${item.id}`}
                  onClick={() => setPeriod(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ce-slider-wrap">
            <input
              type="range"
              className="ce-range"
              min={0}
              max={CHOOSE_EARNINGS_TIERS.length - 1}
              step={1}
              value={metrics.tierIndex}
              style={{ ['--ce-fill' as string]: `${sliderFillPct}%` }}
              aria-label="Potencia del Miner en TH por segundo"
              aria-valuetext={`${formatTh(metrics.tier.powerTh)} TH/s por ${formatUsd(metrics.tier.priceUsd, 2)} USD`}
              data-testid="choose-earnings-slider"
              onChange={(ev) => setTierIndex(Number(ev.target.value))}
            />
            <div className="ce-slider-scale">
              <span>1 TH · $12.99</span>
              <span>32 TH · $379.99</span>
              <span>512 TH · $6,079.99</span>
              <span>5,000 TH · $54,768.99</span>
            </div>
          </div>

          <div className="ce-gain-stats">
            <div className="ce-gain-stat">
              <span className="ce-gain-stat-k">Potencia</span>
              <span className="ce-gain-stat-v" data-testid="choose-earnings-stat-th">
                {formatTh(metrics.tier.powerTh)} TH/s
              </span>
            </div>
            <div className="ce-gain-stat">
              <span className="ce-gain-stat-k">Precio Génesis</span>
              <span className="ce-gain-stat-v" data-testid="choose-earnings-stat-price">
                {formatUsd(metrics.tier.priceUsd, 2)} <small>USD</small>
              </span>
            </div>
            <div className="ce-gain-stat">
              <span className="ce-gain-stat-k">En lanzamiento</span>
              <span className="ce-gain-stat-v ce-stat-strike" data-testid="choose-earnings-stat-launch">
                {formatUsd(metrics.launchPriceUsd, 2)} <small>USD</small>
              </span>
            </div>
            <div className="ce-gain-stat">
              <span className="ce-gain-stat-k">Ahorras hoy</span>
              <span className="ce-gain-stat-v ce-stat-emerald" data-testid="choose-earnings-stat-save">
                {formatUsd(metrics.savingsUsd, 2)} <small>({metrics.savingsPct}%)</small>
              </span>
            </div>
            <div className="ce-gain-stat">
              <span className="ce-gain-stat-k">Precio por TH</span>
              <span className="ce-gain-stat-v" data-testid="choose-earnings-stat-pth">
                {formatUsd(metrics.pricePerTh, 2)} <small>/ TH</small>
              </span>
            </div>
            <div className="ce-gain-stat">
              <span className="ce-gain-stat-k">ROI est. anual</span>
              <span className="ce-gain-stat-v" data-testid="choose-earnings-stat-roi">
                ≈ {metrics.roiAnnualPct.toLocaleString('es-MX')}%
              </span>
            </div>
            <div className="ce-gain-stat">
              <span className="ce-gain-stat-k">Recuperas en</span>
              <span className="ce-gain-stat-v" data-testid="choose-earnings-stat-payback">
                {metrics.paybackLabel}
              </span>
            </div>
            <div className="ce-gain-stat">
              <span className="ce-gain-stat-k">Cupos a este precio</span>
              <span className="ce-gain-stat-v ce-stat-emerald">
                {GENESIS_REMAINING_SPOTS} <small>de {GENESIS_TOTAL_SPOTS}</small>
              </span>
            </div>
          </div>

          <div className="ce-quick-tiers">
            <span className="ce-quick-lbl">Saltos rápidos</span>
            {QUICK_TIER_INDICES.map((idx) => {
              const tier = CHOOSE_EARNINGS_TIERS[idx]
              const isSelected = idx === metrics.tierIndex
              return (
                <button
                  key={tier.powerTh}
                  type="button"
                  className={`ce-tier-chip${isSelected ? ' ce-tier-chip-on' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => setTierIndex(idx)}
                >
                  {formatTh(tier.powerTh)} TH
                </button>
              )
            })}
          </div>
        </div>

        {/* PASO 2 · CARRUSEL DE 10 SKINS SIN FONDO + HUD FULL-BLEED DESPLEGABLE */}
        <div className="ce-step-label">
          <span className="ce-step-badge">
            <span className="ce-step-badge-dot" aria-hidden="true" />
            Paso 2
          </span>
          <h3 className="ce-step-title">Elige el diseño de tu Miner</h3>
          <p className="ce-step-hint">Skin 2D gratis por preventa ($0)</p>
        </div>

        <div
          className="ce-carousel-zone"
          data-testid="choose-earnings-carousel"
          onPointerEnter={() => {
            autoplayPausedRef.current = true
          }}
          onPointerLeave={() => {
            if (!dragRef.current.active) {
              scheduleAutoplayResume()
            }
          }}
        >
          <div
            className={`ce-stage${isDragging ? ' ce-stage-dragging' : ''}`}
            role="region"
            aria-label="Carrusel de diseños Miner 2D"
            tabIndex={0}
            onKeyDown={handleStageKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(ev) => finishDrag(ev, false)}
            onPointerCancel={(ev) => finishDrag(ev, true)}
          >
            <div className="ce-floor" aria-hidden="true">
              <div className="ce-floor-shadow" />
            </div>

            {TEARDOWN_PRESALE_DESIGNS.map((design, idx) => {
              const offset = circularDistance(idx, designIndex, totalDesigns)
              const absOffset = Math.abs(offset)
              const maxVisible = isMobile ? 1 : 2
              const isFar = absOffset > maxVisible
              const step = isMobile ? 108 : 222
              const x = offset * step + dragOffset
              const scale = absOffset === 0 ? 1 : absOffset === 1 ? 0.8 : 0.6
              const opacity = absOffset === 0 ? 1 : absOffset === 1 ? 0.78 : 0.42
              const isCenter = absOffset === 0
              const rotateY = offset === 0 ? 0 : offset > 0 ? -17 : 17
              // Only eager-load center + immediate neighbors once section approaches viewport
              const imgLoading: 'eager' | 'lazy' =
                sectionNearView && absOffset <= 1 ? 'eager' : 'lazy'

              return (
                <button
                  key={design.slug}
                  type="button"
                  className={`ce-miner-item${isCenter ? ' ce-miner-item-center' : ''}${isDragging ? ' ce-miner-item-no-anim' : ''}`}
                  aria-label={`Miner ${design.name} — ${design.subtitle}`}
                  aria-hidden={isFar}
                  tabIndex={isCenter ? 0 : -1}
                  data-testid={`choose-earnings-skin-${design.slug}`}
                  data-skin-center={isCenter ? 'true' : 'false'}
                  style={{
                    display: isFar ? 'none' : 'block',
                    transform: `translateX(${x}px) translateZ(${-absOffset * 130}px) rotateY(${rotateY}deg) scale(${scale})`,
                    opacity,
                    zIndex: 20 - absOffset,
                    pointerEvents: isFar ? 'none' : 'auto',
                    filter: isCenter ? 'none' : 'saturate(0.84) brightness(0.78)',
                  }}
                  onClick={() => {
                    if (suppressClickRef.current) return
                    if (!isCenter) {
                      selectDesign(idx, true)
                    }
                    openHud()
                  }}
                >
                  <span className="ce-miner-img-wrap">
                    <img
                      src={design.transparentImagePath}
                      alt={`Miner 2D ${design.name} — ${design.subtitle}`}
                      loading={imgLoading}
                      decoding="async"
                      draggable={false}
                    />
                    <span className="ce-miner-tag">
                      <span
                        className="ce-miner-tag-dot"
                        style={{ backgroundColor: design.accentHex }}
                        aria-hidden="true"
                      />
                      {design.designId} · {design.shortName.toUpperCase()}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            className="ce-car-nav ce-car-prev"
            aria-label="Diseño anterior"
            data-testid="choose-earnings-car-prev"
            onClick={() => selectDesign(designIndex - 1, true)}
          >
            ‹
          </button>
          <button
            type="button"
            className="ce-car-nav ce-car-next"
            aria-label="Diseño siguiente"
            data-testid="choose-earnings-car-next"
            onClick={() => selectDesign(designIndex + 1, true)}
          >
            ›
          </button>

          <div className="ce-car-meta" aria-live="polite">
            <h4 className="ce-car-name">
              <span className="ce-car-code">{activeDesign.designId}</span>
              <span>{activeDesign.shortName}</span>
            </h4>
            <p className="ce-car-sub">{activeDesign.subtitle}</p>
            <div className="ce-car-actions">
              <button
                ref={hudToggleBtnRef}
                type="button"
                className="ce-btn-hud"
                aria-expanded={hudOpen}
                aria-controls="choose-earnings-hud-shell"
                data-testid="choose-earnings-hud-toggle"
                onPointerEnter={() => warmHudResources(activeDesign.htmlPath)}
                onFocus={() => warmHudResources(activeDesign.htmlPath)}
                onClick={toggleHud}
              >
                <span>
                  {hudOpen
                    ? `Ocultar HUD del ${activeDesign.shortName}`
                    : `Ver HUD del ${activeDesign.shortName}`}
                </span>
                <span className="ce-chev" aria-hidden="true">
                  <ChevronDown size={16} />
                </span>
              </button>
              <button
                type="button"
                className="ce-btn-ghost"
                onClick={handleSurpriseDesign}
                data-testid="choose-earnings-car-random"
              >
                Aleatorio
              </button>
            </div>

            <div className="ce-dots" role="tablist" aria-label="Seleccionar diseño del Miner">
              {TEARDOWN_PRESALE_DESIGNS.map((design, idx) => (
                <button
                  key={design.slug}
                  type="button"
                  role="tab"
                  aria-selected={idx === designIndex}
                  aria-label={`Ir a ${design.name}`}
                  className={`ce-dot-btn${idx === designIndex ? ' ce-dot-btn-on' : ''}`}
                  onClick={() => selectDesign(idx, true)}
                >
                  <span className="ce-dot-pill" />
                </button>
              ))}
            </div>
            <p className="ce-car-hint">
              Haz clic en una skin para desplegar su HUD 3D completo · Arrastra para girar
            </p>
          </div>
        </div>

        {/* HUD full-bleed lazy-loaded only on first open */}
        {hudEverOpened && (
          <Suspense fallback={null}>
            <ChooseEarningsHud
              design={activeDesign}
              metrics={metrics}
              isOpen={hudOpen}
              onClose={handleCloseHud}
              onScrollToOrder={handleScrollToOrder}
            />
          </Suspense>
        )}

        {/* PASO 3 · RESUMEN Y ORDENAR PREVENTA (SIN DISPARAR PAGO) */}
        <div className="ce-step-label ce-step-label-spaced" id="ordenar-preventa">
          <span className="ce-step-badge">
            <span className="ce-step-badge-dot" aria-hidden="true" />
            Paso 3
          </span>
          <h3 className="ce-step-title">Ordena tu preventa</h3>
          <p className="ce-step-hint">El pago se completa en el modal de onboarding</p>
        </div>

        <div
          ref={payCardRef}
          className="ce-pay-card"
          aria-label="Resumen de tu orden de preventa"
          data-testid="choose-earnings-step3"
        >
          <div className="ce-pay-lines">
            <div className="ce-pay-line">
              <span className="ce-pay-line-k">
                Miner personalizado · <b>{activeDesign.name}</b>
              </span>
              <span className="ce-pay-line-v">{formatTh(metrics.tier.powerTh)} TH/s</span>
            </div>
            <div className="ce-pay-line">
              <span className="ce-pay-line-k">Precio Génesis (preventa Fase 1)</span>
              <span className="ce-pay-line-v">
                <del>{formatUsd(metrics.launchPriceUsd, 2)}</del>
                <span>{formatUsd(metrics.tier.priceUsd, 2)}</span>
              </span>
            </div>
            <div className="ce-pay-line">
              <span className="ce-pay-line-k">Skin 2D de preventa</span>
              <span className="ce-pay-line-v">
                <span className="ce-pay-save">GRATIS · $0</span>
              </span>
            </div>
            <div className="ce-pay-line">
              <span className="ce-pay-line-k">Ahorro frente a lanzamiento</span>
              <span className="ce-pay-line-v">
                <span className="ce-pay-save">
                  −{formatUsd(metrics.savingsUsd, 2)} ({metrics.savingsPct}%)
                </span>
              </span>
            </div>
            <div className="ce-pay-line">
              <span className="ce-pay-line-k">Ganancia estimada con esta configuración</span>
              <span className="ce-pay-line-v">
                <span className="ce-pay-save">
                  ~{formatUsd(metrics.dailyUsd, 2)} / día · ~
                  {formatUsd(metrics.monthlyUsd, metrics.monthlyUsd >= 1000 ? 0 : 2)} / mes
                </span>
              </span>
            </div>
          </div>

          <div className="ce-pay-side">
            <div>
              <span className="ce-pay-total-k">Total de tu orden</span>
              <span className="ce-pay-total-amt">
                {formatUsd(metrics.tier.priceUsd, 2)} <small>USD</small>
              </span>
            </div>
            <button
              type="button"
              className="ce-btn-order"
              data-testid="choose-earnings-order-btn"
              data-price-usd={metrics.tier.priceUsd.toFixed(2)}
              data-th={String(metrics.tier.powerTh)}
              data-design={activeDesign.slug}
              data-skin={activeDesign.skinCode}
              onClick={handleOrderClick}
            >
              <span>Ordenar preventa · {formatUsd(metrics.tier.priceUsd, 2)}</span>
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <p className="ce-pay-note">
              Precio Génesis bloqueado mientras dure la Fase 1.
              <br />
              Al ordenar reservas tu configuración; el pago vive únicamente en el modal de
              onboarding.
            </p>
            {orderNotice && (
              <div className="ce-order-feedback" role="status" data-testid="choose-earnings-order-notice">
                <b>Orden preparada:</b> {orderNotice}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Trust Line */}
        <div className="ce-trust">
          <span className="ce-trust-item">
            <ShieldCheck size={14} className="ce-cd-icon" aria-hidden="true" />
            Cupo estricto de {GENESIS_TOTAL_SPOTS} mineros por nivel
          </span>
          <span className="ce-trust-sep" aria-hidden="true" />
          <span>Recompensas variables en tokens PEARL</span>
          <span className="ce-trust-sep" aria-hidden="true" />
          <span>Infraestructura monitoreada 24/7</span>
        </div>
      </div>
    </section>
  )
}
