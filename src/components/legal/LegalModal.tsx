import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, FileText, Lock, Cpu, AlertTriangle, CheckCircle } from 'lucide-react';

export type LegalMode = 'terms' | 'security' | null;

interface LegalModalProps {
  mode: LegalMode;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ mode, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (mode) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode, onClose]);

  if (!mode) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-3xl bg-[#0a0a0a] border border-white/10 shadow-2xl text-white overflow-hidden z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-[#050505]/90 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white">
                {mode === 'terms' ? <FileText className="w-5 h-5 text-white/80" /> : <ShieldCheck className="w-5 h-5 text-white/80" />}
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {mode === 'terms' ? 'Términos y Condiciones de Servicio' : 'Políticas de Seguridad & Privacidad'}
                </h3>
                <p className="text-[11px] font-mono text-white/40 tracking-wider">
                  POUWMINER PLATFORM · PEARL RESEARCH LAB · 2026.2
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors active:scale-[0.97]"
              aria-label="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-sm leading-relaxed text-white/70">
            {mode === 'terms' ? (
              <>
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-white font-semibold text-base">
                    <span className="font-mono text-xs text-white/40">01</span>
                    <Cpu className="w-4 h-4 text-white/70" />
                    <h4>Definición del Servicio & Potencia Digital (PoUW)</h4>
                  </div>
                  <p>
                    PouwMiner es una plataforma tecnológica desarrollada y operada en coordinación técnica con <strong className="text-white">PEARL Research Lab</strong>. Los servicios consisten en el aprovisionamiento, asignación y gestión de potencia de procesamiento informático (hashrate) respaldada por infraestructura física dedicada e instalaciones de computación de alto rendimiento.
                  </p>
                  <p className="text-white/50 text-xs">
                    La adquisición de un minero digital confiere al titular derechos operativos sobre la cuota de hashrate estipulada en las especificaciones del lote o paquete contratado, sin que ello requiera la entrega física ni el mantenimiento domiciliario de componentes de hardware por parte del usuario.
                  </p>
                </section>

                <section className="space-y-3 p-5 rounded-2xl bg-white/[0.03] border border-white/10 text-white/80">
                  <div className="flex items-center gap-2 text-white font-semibold text-base">
                    <span className="font-mono text-xs text-white/40">02</span>
                    <AlertTriangle className="w-4 h-4 text-white/70" />
                    <h4>Naturaleza Variable de las Recompensas (Sin Rendimiento Fijo)</h4>
                  </div>
                  <p className="text-xs sm:text-sm">
                    Las recompensas generadas por la operación de hashrate se liquidan en la unidad de cuenta nativa de la red (<strong className="text-white">PEARL</strong>). El usuario comprende y acepta explícitamente que:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-white/60">
                    <li>Las recompensas son <strong className="text-white">estrictamente variables</strong> y fluctúan en función de la dificultad global de la red, los costos operativos energéticos y la tasa de acierto de bloques de cómputo.</li>
                    <li><strong className="text-white">PouwMiner NO promete, asegura ni garantiza ningún porcentaje de Retorno sobre la Inversión (ROI) fijo</strong>, ni montos diarios predeterminados.</li>
                    <li>Cualquier simulador o estimación numérica exhibida en la plataforma constituye una proyección referencial basada en condiciones de red observadas al momento del cálculo y no un compromiso contractual de rentabilidad.</li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-white font-semibold text-base">
                    <span className="font-mono text-xs text-white/40">03</span>
                    <Lock className="w-4 h-4 text-white/70" />
                    <h4>Custodia Descentralizada y Responsabilidad de Wallet</h4>
                  </div>
                  <p>
                    Los accesos, claves privadas y firmas criptográficas vinculadas a billeteras Web3 son de exclusiva custodia y soberanía del usuario. PouwMiner no custodia claves privadas de wallets externas ni tiene capacidad para revertir transacciones liquidadas on-chain.
                  </p>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-white font-semibold text-base">
                    <span className="font-mono text-xs text-white/40">04</span>
                    <CheckCircle className="w-4 h-4 text-white/70" />
                    <h4>Operatividad y Mantenimiento Técnico</h4>
                  </div>
                  <p className="text-white/60 text-xs">
                    Los centros de datos asociados operan bajo acuerdos de nivel de servicio (SLA) industriales con redundancia eléctrica y enfriamiento controlado. PouwMiner se reserva el derecho de ejecutar tareas de mantenimiento preventivo y optimización de firmware sin alterar la asignación nominal contratada por el usuario.
                  </p>
                </section>
              </>
            ) : (
              <>
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-white font-semibold text-base">
                    <span className="font-mono text-xs text-white/40">01</span>
                    <ShieldCheck className="w-4 h-4 text-white/70" />
                    <h4>Protocolos Criptográficos y Encriptación Extremo a Extremo</h4>
                  </div>
                  <p>
                    La seguridad de los datos de nuestros usuarios es prioritaria. Todos los canales de comunicación emplean transporte cifrado <strong className="text-white">TLS 1.3 con curvas elípticas de alta resistencia</strong>. La información almacenada en bases de datos distribuidas se encuentra cifrada bajo el estándar <strong className="text-white">AES-256</strong> en reposo.
                  </p>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-white font-semibold text-base">
                    <span className="font-mono text-xs text-white/40">02</span>
                    <Lock className="w-4 h-4 text-white/70" />
                    <h4>Arquitectura de Identidad Zero-Knowledge</h4>
                  </div>
                  <p>
                    Las contraseñas de las cuentas registradas nunca se almacenan en texto plano. Se procesan mediante funciones hash resistentes a ataques cuánticos con sal aleatoria (Argon2 / PBKDF2). El sistema implementa autenticación multifactorial (2FA / TOTP) y tokens de sesión con expiración dinámica.
                  </p>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-white font-semibold text-base">
                    <span className="font-mono text-xs text-white/40">03</span>
                    <Cpu className="w-4 h-4 text-white/70" />
                    <h4>Protección Perimetral y Monitoreo de Intrusiones</h4>
                  </div>
                  <p>
                    Nuestros nodos y balanceadores de carga están respaldados por escudos anti-DDoS de grado industrial capaces de absorber ataques volumétricos superiores a 2 Tbps. La telemetría operativa auditada por algoritmos de detección autónoma previene accesos anómalos o intentos de fuerza bruta.
                  </p>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-white font-semibold text-base">
                    <span className="font-mono text-xs text-white/40">04</span>
                    <CheckCircle className="w-4 h-4 text-white/70" />
                    <h4>Política de Cero Venta de Datos</h4>
                  </div>
                  <p className="text-white/60 text-xs">
                    PouwMiner no comercializa, monetiza ni transfiere información identificable de sus usuarios a terceros anunciantes ni corredores de datos. La recolección de métricas se limita a fines técnicos operativos de optimización de la red y cumplimiento regulatorio.
                  </p>
                </section>
              </>
            )}
          </div>

          {/* Footer Action */}
          <div className="px-6 py-4 border-t border-white/10 bg-[#050505] flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-full bg-white text-[#050505] hover:bg-white/90 font-semibold text-xs tracking-wider uppercase transition-all active:scale-[0.97]"
            >
              Comprendido y Aceptado
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
