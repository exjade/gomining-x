import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './landing.css'
import { useLenisScroll } from './hooks/useLenisScroll'
import { ScrollProgressBar } from './components/ui/ScrollProgressBar'
import { SideScrollTracker } from './components/ui/SideScrollTracker'
import { IntroPreloader } from './components/ui/IntroPreloader'
import { Navbar } from './components/ui/Navbar'
import { StickyEarningsBar } from './components/ui/StickyEarningsBar'
import { HeroSection } from './components/sections/HeroSection'
import { HowItWorksSection } from './components/sections/HowItWorksSection'
import { MiningAiSection } from './components/sections/MiningAiSection'
import { ProductSection } from './components/sections/ProductSection'
import { CalculatorSection } from './components/sections/CalculatorSection'
import { PresaleSection } from './components/sections/PresaleSection'
import { MembershipsSection } from './components/sections/MembershipsSection'
import { Web3CheckoutSection } from './components/sections/Web3CheckoutSection'
import { UnilevelSection } from './components/sections/UnilevelSection'
import { BattleMinerSection } from './components/sections/BattleMinerSection'
import { TransparencySection } from './components/sections/TransparencySection'
import { AboutSection } from './components/sections/AboutSection'
import { RoadmapSection } from './components/sections/RoadmapSection'
import { CtaSection } from './components/sections/CtaSection'
import { Footer } from './components/sections/Footer'
import { LegalModal, type LegalMode } from './components/legal/LegalModal'
import type { AuthMode } from './components/ui/Navbar'

interface LandingPageProps {
  openAuthModal: (mode?: 'login' | 'register' | 'verify-email') => void
}

export function LandingPage({ openAuthModal }: LandingPageProps) {
  useLenisScroll()

  // Intro Preloader State
  const [introFinished, setIntroFinished] = useState(false)

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

  const handleOpenAuth = (mode?: AuthMode) => {
    if (mode === 'login') {
      openAuthModal('login')
    } else {
      openAuthModal('register')
    }
  }

  const [legalMode, setLegalMode] = useState<LegalMode>(null)

  const handleOpenLegal = (mode: LegalMode = 'terms') => {
    setLegalMode(mode)
  }

  return (
    <div className="pouw-landing-root w-full relative bg-[#050505] text-white">
      {/* 3D Exploded Miner Intro Preloader */}
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
      <a href="#calculadora" className="sr-only focus:not-sr-only focus:fixed focus:top-14 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-white focus:text-[#050505] focus:rounded-lg focus:font-medium">
        Calculadora de Minería
      </a>

      {/* Viewport-fixed elements */}
      <ScrollProgressBar />
      <SideScrollTracker />
      <Navbar onOpenAuth={handleOpenAuth} onOpenLegal={handleOpenLegal} />
      <StickyEarningsBar onOpenAuth={handleOpenAuth} />

      {/* Landing Page Content with Smooth Fade-in once Intro Completes */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: introFinished ? 1 : 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="w-full relative"
      >
        <main id="main-content">
          <HeroSection onOpenAuth={handleOpenAuth} />
          <HowItWorksSection />
          <div id="vision-pearl">
            <MiningAiSection />
          </div>
          <ProductSection />
          <CalculatorSection onOpenAuth={handleOpenAuth} />
          <PresaleSection onOpenAuth={handleOpenAuth} />
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
        </main>

        <Footer onOpenLegal={handleOpenLegal} />
      </motion.div>
      <LegalModal mode={legalMode} onClose={() => setLegalMode(null)} />
    </div>
  )
}
