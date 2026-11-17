import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowRight, User, Shield, FileText } from 'lucide-react';
import { PowMinerLogo } from './PowMinerLogo';

export type AuthMode = 'login' | 'register';
export type LegalMode = 'terms' | 'security';

interface NavbarProps {
  onOpenAuth?: (mode?: AuthMode) => void;
  onOpenLegal?: (mode?: LegalMode) => void;
}

export function Navbar({ onOpenAuth, onOpenLegal }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 90);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body scroll when mobile/flyout menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const navItems = [
    { num: '01', label: 'Inicio', href: '#hero' },
    { num: '02', label: 'Cómo Funciona', href: '#como-funciona' },
    { num: '03', label: 'Hardware 3D', href: '#producto' },
    { num: '04', label: 'Calculadora de Rendimiento', href: '#calculadora' },
    { num: '05', label: 'Preventa Titan Series', href: '#preventa', badge: '15d' },
    { num: '06', label: 'Membresías PouwMiner', href: '#membresias' },
    { num: '07', label: 'Web3 Checkout', href: '#web3' },
    { num: '08', label: 'Red Unilevel & Afiliados', href: '#unilevel' },
    { num: '09', label: 'Battle Miner (GameFi)', href: '#battle-miner', badge: 'NFT' },
    { num: '10', label: 'Visión PoUW & IA', href: '#vision-pearl' },
    { num: '11', label: 'Protocolo de Transparencia', href: '#transparencia' },
    { num: '12', label: 'Roadmap de Fases', href: '#roadmap' },
    { num: '13', label: 'Preguntas Frecuentes', href: '#faq' },
  ];

  const handleNavClick = (href: string) => {
    setMenuOpen(false);
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* Intelligent Minimalist Header (Seamlessly hands off to StickyEarningsBar upon scroll) */}
      <motion.header
        initial={{ y: 0, opacity: 1 }}
        animate={scrolled ? { y: -90, opacity: 0, pointerEvents: 'none' } : { y: 0, opacity: 1, pointerEvents: 'auto' }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-0 left-0 right-0 z-40 bg-transparent py-5 sm:py-6"
        role="navigation"
        aria-label="Barra de cabecera PouwMiner"
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          {/* Brand Logo - SpaceX style custom typography */}
          <a
            href="#hero"
            className="flex items-center gap-3 focus:outline-none"
            aria-label="PouwMiner Inicio"
          >
            <PowMinerLogo size="md" showSubtitle />
          </a>

          {/* Right Action Island: Clean, uncluttered, no overlapping links */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenAuth ? onOpenAuth('login') : handleNavClick('#comenzar')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/15 hover:border-white/30 text-white/70 hover:text-white text-xs font-mono transition-all active:scale-[0.97]"
            >
              <User className="w-3.5 h-3.5 text-white/50" />
              <span>Ingresar</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenAuth ? onOpenAuth('register') : handleNavClick('#preventa')}
              className="px-4 py-1.5 sm:px-5 sm:py-2 rounded-full bg-white hover:bg-white/90 text-[#050505] font-semibold text-xs tracking-tight transition-all active:scale-[0.97] shadow-lg shadow-white/5"
            >
              <span>Pre-ordenar</span>
            </button>

            {/* Elegant Menu Drawer Trigger */}
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-white/15 hover:border-white/30 bg-[#0a0a0a]/80 backdrop-blur-md flex items-center justify-center text-white transition-all active:scale-[0.97]"
              aria-label={menuOpen ? 'Cerrar navegación' : 'Abrir navegación'}
            >
              {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </motion.header>

      {/* Fullscreen Backdrop Navigation Drawer */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/85 backdrop-blur-2xl"
          >
            {/* Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md h-full bg-[#0a0a0a] border-l border-white/10 p-6 sm:p-10 flex flex-col justify-between overflow-y-auto"
            >
              {/* Drawer Top */}
              <div>
                <div className="flex items-center justify-between pb-8 border-b border-white/10">
                  <PowMinerLogo size="sm" />
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/60 hover:text-white transition-colors active:scale-[0.97]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Navigation Links */}
                <div className="py-6 space-y-1">
                  {navItems.map((item) => (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => handleNavClick(item.href)}
                      className="w-full flex items-center justify-between py-3 px-3 rounded-xl hover:bg-white/5 transition-all text-left group"
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="font-mono text-xs text-white/30 group-hover:text-white/60">
                          {item.num}
                        </span>
                        <span className="text-sm font-medium text-white/80 group-hover:text-white tracking-tight">
                          {item.label}
                        </span>
                      </div>
                      {item.badge ? (
                        <span className="px-2 py-0.5 rounded-full border border-white/20 text-[10px] font-mono text-white/70">
                          {item.badge}
                        </span>
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white group-hover:translate-x-1 transition-all" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Drawer Bottom Actions */}
              <div className="pt-6 border-t border-white/10 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenAuth?.('login');
                    }}
                    className="w-full py-2.5 rounded-full border border-white/15 hover:border-white/30 text-white font-medium text-xs text-center transition-all"
                  >
                    Iniciar Sesión
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenAuth?.('register');
                    }}
                    className="w-full py-2.5 rounded-full bg-white text-[#050505] font-semibold text-xs text-center transition-all shadow-md"
                  >
                    Crear Cuenta
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-white/40 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenLegal?.('terms');
                    }}
                    className="hover:text-white flex items-center gap-1 transition-colors"
                  >
                    <FileText className="w-3 h-3 text-white/40" />
                    <span>Términos</span>
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenLegal?.('security');
                    }}
                    className="hover:text-white flex items-center gap-1 transition-colors"
                  >
                    <Shield className="w-3 h-3 text-white/40" />
                    <span>Privacidad</span>
                  </button>
                  <span>·</span>
                  <span>v2026.2</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
