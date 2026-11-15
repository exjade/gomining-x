import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLenisScroll } from '@/hooks/useLenisScroll';
import { ScrollProgressBar } from '@/components/ui/ScrollProgressBar';
import { SideScrollTracker } from '@/components/ui/SideScrollTracker';
import { IntroPreloader } from '@/components/ui/IntroPreloader';
import { Navbar } from '@/components/ui/Navbar';
import { StickyEarningsBar } from '@/components/ui/StickyEarningsBar';
import { HeroSection } from '@/components/sections/HeroSection';
import { HowItWorksSection } from '@/components/sections/HowItWorksSection';
import { MiningAiSection } from '@/components/sections/MiningAiSection';
import { ProductSection } from '@/components/sections/ProductSection';
import { CalculatorSection } from '@/components/sections/CalculatorSection';
import { PresaleSection } from '@/components/sections/PresaleSection';
import { MembershipsSection } from '@/components/sections/MembershipsSection';
import { Web3CheckoutSection } from '@/components/sections/Web3CheckoutSection';
import { UnilevelSection } from '@/components/sections/UnilevelSection';
import { BattleMinerSection } from '@/components/sections/BattleMinerSection';
import { TransparencySection } from '@/components/sections/TransparencySection';
import { AboutSection } from '@/components/sections/AboutSection';
import { RoadmapSection } from '@/components/sections/RoadmapSection';
import { CtaSection } from '@/components/sections/CtaSection';
import { Footer } from '@/components/sections/Footer';

// Modals
import { AuthModal, AuthMode } from '@/components/auth/AuthModal';
import { LegalModal, LegalMode } from '@/components/legal/LegalModal';

function App() {
  useLenisScroll();

  // Intro Preloader State
  const [introFinished, setIntroFinished] = useState(false);

  // Global Modal States
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [legalMode, setLegalMode] = useState<LegalMode>(null);

  // Lock scroll during intro
  useEffect(() => {
    if (!introFinished) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [introFinished]);

  // Set document language
  useEffect(() => {
    document.documentElement.lang = 'es';
  }, []);

  const handleOpenAuth = (mode: AuthMode = 'register') => {
    setAuthMode(mode);
  };

  const handleOpenLegal = (mode: LegalMode = 'terms') => {
    setLegalMode(mode);
  };

  return (
    <>
      {/* 3D Exploded Miner Intro Preloader (Before Landing Page) */}
      <AnimatePresence>
        {!introFinished && (
          <IntroPreloader onComplete={() => setIntroFinished(true)} />
        )}
      </AnimatePresence>

      {/* Skip to main content (accessibility) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-white focus:text-[#050505] focus:rounded-lg focus:font-medium"
      >
        Ir al contenido principal
      </a>

      {/* GLOBAL VIEWPORT-FIXED ELEMENTS (Mounted outside transformed containers to ensure 100% viewport pinning) */}
      <ScrollProgressBar />
      <SideScrollTracker />
      <Navbar onOpenAuth={handleOpenAuth} onOpenLegal={handleOpenLegal} />
      <StickyEarningsBar currentTh={120} onOpenAuth={handleOpenAuth} />

      {/* Landing Page Content with Smooth Fade-in once Intro Completes */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: introFinished ? 1 : 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="w-full relative"
      >
        {/* Main content — Secciones canónicas (SCRUM-252 / CONTEXTO-RECUPERACION.md) */}
        <main id="main-content">
          {/* 1. Hero Split Keynote: Left text & CTAs, Right 3D Miner (#hero) */}
          <HeroSection onOpenAuth={handleOpenAuth} />

          {/* 2. Cómo funciona — 3 pasos institucionales (#como-funciona) */}
          <HowItWorksSection />

          {/* 3. Minería + AI / PEARL (visión PEARL Research Lab & Parallax) (#vision-pearl) */}
          <MiningAiSection />

          {/* 4. Producto / mineros — vista explotada 3D interactiva (#producto) */}
          <ProductSection />

          {/* 5. Calculadora interactiva de proyección realista (120 TH/s = $2.30/d) (#calculadora) */}
          <CalculatorSection onOpenAuth={handleOpenAuth} />

          {/* 6. Preventa con reloj contador de 15 días y alerta de cupos (#preventa) */}
          <PresaleSection onOpenAuth={handleOpenAuth} />

          {/* 7. Membresías PouwMiner: Explorer, Starter & Pro VIP (#membresias) */}
          <MembershipsSection onOpenAuth={handleOpenAuth} />

          {/* 8. Web3 Connect Wallet & Pagos Descentralizados (#web3) */}
          <Web3CheckoutSection onOpenAuth={handleOpenAuth} />

          {/* 9. Red Unilevel & Afiliados de 5 Niveles (#unilevel) */}
          <UnilevelSection onOpenAuth={handleOpenAuth} />

          {/* 10. Protocolo Gamificado Battle Miner (#battle-miner) */}
          <BattleMinerSection onOpenAuth={handleOpenAuth} />

          {/* 11. Transparencia / riesgos (#transparencia) */}
          <TransparencySection />

          {/* 11. Quiénes somos — rama operativa de PEARL Research Lab (#quienes-somos) */}
          <AboutSection />

          {/* 12. Roadmap interactivo de 9 fases (#roadmap) */}
          <RoadmapSection />

          {/* 13. FAQ + CTA hacia Auth rediseñado (#comenzar) */}
          <CtaSection onOpenAuth={handleOpenAuth} />
        </main>

        {/* Footer legal (#footer) */}
        <Footer onOpenLegal={handleOpenLegal} />
      </motion.div>

      {/* Authentication Modal (Login, Register, Forgot Password, Verify Email, Email Verified) */}
      <AuthModal
        mode={authMode}
        onClose={() => setAuthMode(null)}
        onSwitchMode={(mode) => setAuthMode(mode)}
        onOpenLegal={(mode) => setLegalMode(mode)}
      />

      {/* Legal & Security Policies Modal (Términos y Condiciones, Políticas de Seguridad) */}
      <LegalModal
        mode={legalMode}
        onClose={() => setLegalMode(null)}
      />
    </>
  );
}

export default App;
