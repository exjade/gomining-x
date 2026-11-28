import { lazy, Suspense, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './landing.css'
import { useLenisScroll } from './hooks/useLenisScroll'
import { ScrollProgressBar } from './components/ui/ScrollProgressBar'
import { SideScrollTracker } from './components/ui/SideScrollTracker'
import { IntroPreloader } from './components/ui/IntroPreloader'
import { Navbar } from './components/ui/Navbar'
import { StickyEarningsBar } from './components/ui/StickyEarningsBar'
import { HeroSection } from './components/sections/HeroSection'
import { ChooseEarningsSection } from './components/sections/ChooseEarningsSection'
import { WhyPouwMinerSection } from './components/sections/WhyPouwMinerSection'
import { LegalModal, type LegalMode } from './components/legal/LegalModal'
import type { AuthMode } from './components/ui/Navbar'
import {
  clearEmbudoF1State,
  saveEmbudoPresaleSelection,
  startEmbudoF1Registration,
  type EmbudoPresaleSelection,
} from './components/embudo-f1'

// Code-split heavy below-the-fold sections so initial landing boot stays lightweight
const HowItWorksSection = lazy(() =>
  import('./components/sections/HowItWorksSection').then((m) => ({ default: m.HowItWorksSection })),
)
const MiningAiSection = lazy(() =>
  import('./components/sections/MiningAiSection').then((m) => ({ default: m.MiningAiSection })),
)
const ProductSection = lazy(() =>
  import('./components/sections/ProductSection').then((m) => ({ default: m.ProductSection })),
)
const CalculatorSection = lazy(() =>
  import('./components/sections/CalculatorSection').then((m) => ({ default: m.CalculatorSection })),
)
const MembershipsSection = lazy(() =>
  import('./components/sections/MembershipsSection').then((m) => ({ default: m.MembershipsSection })),
)
const Web3CheckoutSection = lazy(() =>
  import('./components/sections/Web3CheckoutSection').then((m) => ({ default: m.Web3CheckoutSection })),
)
const UnilevelSection = lazy(() =>
  import('./components/sections/UnilevelSection').then((m) => ({ default: m.UnilevelSection })),
)
const BattleMinerSection = lazy(() =>
  import('./components/sections/BattleMinerSection').then((m) => ({ default: m.BattleMinerSection })),
)
const TransparencySection = lazy(() =>
  import('./components/sections/TransparencySection').then((m) => ({ default: m.TransparencySection })),
)
const AboutSection = lazy(() =>
  import('./components/sections/AboutSection').then((m) => ({ default: m.AboutSection })),
)
const RoadmapSection = lazy(() =>
  import('./components/sections/RoadmapSection').then((m) => ({ default: m.RoadmapSection })),
)
const CtaSection = lazy(() =>
  import('./components/sections/CtaSection').then((m) => ({ default: m.CtaSection })),
)
const Footer = lazy(() =>
  import('./components/sections/Footer').then((m) => ({ default: m.Footer })),
)

// Flag de reactivación de la sección Calculadora: poner SHOW_CALCULATOR_SECTION = true para volver a mostrarla en la landing.
export const SHOW_CALCULATOR_SECTION = false

interface LandingPageProps {
  openAuthModal: (mode?: 'login' | 'register' | 'verify-email') => void
}

export function LandingPage({ openAuthModal }: LandingPageProps) {
  useLenisScroll()

  // Let IntroPreloader complete its full animation via onComplete (never cutting it short on mobile)
  const [introFinished, setIntroFinished] = useState<boolean>(false)
  // Defer heavy below-the-fold lazy chunks & 3.1MB offscreen JPEGs during initial boot/intro so mobile load never stutters
  const [belowFoldReady, setBelowFoldReady] = useState<boolean>(false)

  useEffect(() => {
    if (introFinished) {
      setBelowFoldReady(true)
      return
    }
    const timer = window.setTimeout(() => {
      setBelowFoldReady(true)
    }, 2800)
    return () => window.clearTimeout(timer)
  }, [introFinished])

  // Lock scroll during intro
  useEffect(() => {
    if (!introFinished) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [introFinished])

  // Set document language
  useEffect(() => {
    document.documentElement.lang = 'es'
    document.documentElement.dataset.publicShell = 'true'
    document.title = 'PouwMiner.com · experiencia pública'
  }, [])

  const handleOpenAuth = (mode?: AuthMode, prefill?: Partial<EmbudoPresaleSelection>) => {
    if (mode === 'login') {
      clearEmbudoF1State()
      openAuthModal('login')
    } else {
      // Save chosen presale config (or default 1 TH / $12.99 when no config was selected)
      saveEmbudoPresaleSelection(prefill ?? null)
      startEmbudoF1Registration('landing')
      openAuthModal('register')
    }
  }

  const [legalMode, setLegalMode] = useState<LegalMode>(null)

  const handleOpenLegal = (mode: LegalMode = 'terms') => {
    setLegalMode(mode)
  }

  return (
    <div className="pouw-landing-root w-full relative bg-[#050505] text-white">
      {/* 3D Exploded Miner Intro Preloader — governed naturally by onComplete */}
      <AnimatePresence>
        {!introFinished && (
          <IntroPreloader onComplete={() => setIntroFinished(true)} />
        )}
      </AnimatePresence>

      {/* Skip to main content & accessible direct links */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-white focus:text-[#050505] focus:rounded-lg focus:font-medium"
      >
        Ir al contenido principal
      </a>
      {SHOW_CALCULATOR_SECTION && (
        <a href="#calculadora" className="sr-only focus:not-sr-only focus:fixed focus:top-14 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-white focus:text-[#050505] focus:rounded-lg focus:font-medium">
          Calculadora de Minería
        </a>
      )}

      {/* Viewport-fixed elements (continuously floating across the entire landing) */}
      <ScrollProgressBar />
      <SideScrollTracker />
      <Navbar onOpenAuth={handleOpenAuth} onOpenLegal={handleOpenLegal} />
      <StickyEarningsBar onOpenAuth={handleOpenAuth} />

      {/* Landing Page Content with Smooth Reveal once Intro Completes */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: introFinished ? 1 : 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full relative"
      >
        <main id="main-content">
          <HeroSection onOpenAuth={handleOpenAuth} />
          {belowFoldReady ? (
            <Suspense fallback={<div style={{ minHeight: '3400px' }} aria-hidden="true" />}>
              <HowItWorksSection />
              <div id="vision-pearl">
                <MiningAiSection />
              </div>
              <ProductSection />
              {SHOW_CALCULATOR_SECTION && <CalculatorSection onOpenAuth={handleOpenAuth} />}
            </Suspense>
          ) : (
            <div id="vision-pearl" style={{ minHeight: '3400px' }} aria-hidden="true" />
          )}
          <ChooseEarningsSection onOrderPresale={(prefill) => handleOpenAuth('register', prefill)} />
          <WhyPouwMinerSection />
          {belowFoldReady ? (
            <Suspense fallback={<div style={{ minHeight: '1800px' }} aria-hidden="true" />}>
              <MembershipsSection onOpenAuth={handleOpenAuth} />
              <Web3CheckoutSection onOpenAuth={handleOpenAuth} />
              <UnilevelSection onOpenAuth={handleOpenAuth} />
              <BattleMinerSection onOpenAuth={handleOpenAuth} />
              <TransparencySection />
              <div id="quienes-somos">
                <AboutSection />
              </div>
              <div id="roadmap">
                <RoadmapSection />
              </div>
              <CtaSection onOpenAuth={handleOpenAuth} />
            </Suspense>
          ) : (
            <div style={{ minHeight: '1800px' }} aria-hidden="true">
              <div id="quienes-somos" />
              <div id="roadmap" />
            </div>
          )}
        </main>

        {belowFoldReady && (
          <Suspense fallback={null}>
            <Footer onOpenLegal={handleOpenLegal} />
          </Suspense>
        )}
      </motion.div>
      <LegalModal mode={legalMode} onClose={() => setLegalMode(null)} />
    </div>
  )
}
