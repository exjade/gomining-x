import { ShieldCheck, FileText, ArrowUpRight } from 'lucide-react';
import { PowMinerLogo } from '../ui/PowMinerLogo';
import { LegalMode } from '../legal/LegalModal';

interface FooterProps {
  onOpenLegal?: (mode: LegalMode) => void;
}

export function Footer({ onOpenLegal }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      id="footer"
      className="relative border-t border-white/10 bg-[#050505] text-white/60 py-20 px-6"
      aria-label="Pie de página legal"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Brand & About */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <PowMinerLogo size="md" showSubtitle />
            </div>

            <p className="text-xs text-white/50 max-w-sm leading-relaxed">
              Infraestructura institucional de minería digital y computación Proof of Useful Work (PoUW).
              Rama operativa de <strong className="text-white">PEARL Research Lab</strong>.
            </p>

            <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 border border-white/10 bg-white/[0.02]">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-mono text-white/60">FASE 1 PREVENTA · 15 DÍAS RESTANTES</span>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="text-[11px] font-mono font-bold text-white uppercase tracking-[0.2em] mb-4">
              Navegación
            </h4>
            <ul className="space-y-3 text-xs text-white/50">
              <li>
                <a href="#como-funciona" className="hover:text-white transition-colors">
                  Cómo Funciona
                </a>
              </li>
              <li>
                <a href="#producto" className="hover:text-white transition-colors">
                  Hardware 3D Despiezado
                </a>
              </li>
              <li>
                <a href="#calculadora" className="hover:text-white transition-colors">
                  Calculadora de Potencia
                </a>
              </li>
              <li>
                <a href="#preventa" className="hover:text-white transition-colors">
                  Preventa Titan Series
                </a>
              </li>
              <li>
                <a href="#membresias" className="hover:text-white transition-colors">
                  Membresías & Beneficios
                </a>
              </li>
              <li>
                <a href="#web3" className="hover:text-white transition-colors">
                  Web3 Connect Wallet
                </a>
              </li>
              <li>
                <a href="#unilevel" className="hover:text-white transition-colors">
                  Red Unilevel & Afiliados
                </a>
              </li>
              <li>
                <a href="#battle-miner" className="hover:text-white transition-colors">
                  Battle Miner NFT
                </a>
              </li>
              <li>
                <a href="#roadmap" className="hover:text-white transition-colors">
                  Roadmap de 9 Fases
                </a>
              </li>
            </ul>
          </div>

          {/* Compliance & Legal */}
          <div>
            <h4 className="text-[11px] font-mono font-bold text-white uppercase tracking-[0.2em] mb-4">
              Marco Legal & Seguridad
            </h4>
            <ul className="space-y-3 text-xs text-white/50">
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal?.('terms')}
                  className="hover:text-white flex items-center gap-1.5 transition-colors text-left"
                >
                  <FileText className="w-3.5 h-3.5 text-white/70" />
                  <span>Términos y Condiciones</span>
                  <ArrowUpRight className="w-3 h-3 text-white/40" />
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal?.('security')}
                  className="hover:text-white flex items-center gap-1.5 transition-colors text-left"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-white/70" />
                  <span>Políticas de Seguridad & Privacidad</span>
                  <ArrowUpRight className="w-3 h-3 text-white/40" />
                </button>
              </li>
              <li>
                <a href="#transparencia" className="hover:text-white transition-colors">
                  Protocolo de Transparencia
                </a>
              </li>
              <li>
                <a href="#quienes-somos" className="hover:text-white transition-colors">
                  PEARL Research Lab
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Clean Footer Bottom Bar */}
        <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-white/40 text-[11px] font-mono">
          <p>© {currentYear} POUWMINER.COM · PEARL RESEARCH LAB · ALL RIGHTS RESERVED.</p>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => onOpenLegal?.('terms')}
              className="hover:text-white transition-colors"
            >
              TÉRMINOS
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => onOpenLegal?.('security')}
              className="hover:text-white transition-colors"
            >
              PRIVACIDAD
            </button>
            <span>·</span>
            <a href="#hero" className="hover:text-white transition-colors">
              TOP ↑
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
