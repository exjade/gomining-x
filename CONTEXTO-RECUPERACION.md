# CONTEXTO COMPLETO — Landing Page PouwMiner.com (recuperación para agentes teamwork)

> Documento de recuperación de contexto, generado 2026-11-15 ~03:35 Caracas.
> Si perdiste el hilo, lee este archivo y continúa exactamente lo asignado.
> **No omitas ni alteres nada de lo aquí escrito.**
> Fuentes: `prompt-maestro-agy.md`, `plan-landing-preventa.md`, `prompt_draft_teamwork.md`
> (draft aprobado por Roman 23:10 del 14 nov), `PROJECT.md` y `TEST_INFRA.md` del run
> VM, SCRUM-251/252. Si este documento y otro archivo se contradicen, manda ESTE
> documento salvo que el PO (Roman) diga lo contrario en el chat.

## 1. Misión y alcance

- Producto: **PouwMiner.com** — acceso y operación de potencia de minado con mineros digitales.
- Epics: **SCRUM-251 [PRINCIPAL] POUW** (hub de contexto, Planning READY, Execution
  NOT_GRANTED, Mode BACKLOG_ONLY, vence 15 nov 2026, informador Eldrin Lobo, equipo
  Red PouWminers Team) y **SCRUM-252 [DESIGN]** rediseño de la landing (parent SCRUM-251).
- Propósito (respuesta del PO en entrevista): showcase / presentación premium estilo
  keynote Apple para revisión del Product Owner.
- Ejecución: con **/teamwork de agy** (Sentinel coordina, Project Orchestrator divide en
  hitos, agentes en paralelo con verificación en cada hito). NO sesiones tmux sueltas.
- Autorización: Roman aprobó el draft el 14 nov 23:10 ("envía para que lo hagan") y la
  implementación en la VM; el PC corre su propio run (ver §7).

## 2. Stack y rutas

- **Vite + React 19 + TypeScript + Tailwind CSS + Framer Motion + GSAP ScrollTrigger +
  Lenis** (+ Lucide React en el run VM).
- VM: `/home/hatch/workspace/landing-page/`. **NO tocar `~/workspace/gomining-x/`**
  (réplica GoMining, solo benchmark de lectura).
- PC: `C:\\Users\\Roman\\OneDrive\\Documentos\\Gomining-x\\Landing Page\\Laning_Page\\pouwminer-landing`.
- Assets: `assets/` (minero entero glassmorphism y vista explotada; SVG `miner-full.svg`,
  `miner-exploded.svg`, capas en `layers/`).

## 3. Dirección de diseño

- Estilo presentación **Apple Keynote / WWDC scrollytelling premium de $50K**; referencias
  Linear.app, Vercel.com.
- Fondo `#090b14`, paneles `#111420` / `#171a28`, texto `#f5f5fb`, muted `#8a8ea4`,
  morados `#874bff` `#b47bff` `#7c3aed` `#8b5cf6` `#6d28d9` `#4c1d95`, degradados
  `#a94eff → #713cff` y `#7845ef → #9754ff`, verde de ganancias `#4fdfa6`.
- Glassmorphism, bento grid, aurora/mesh gradients, magnetic buttons, barra de progreso
  de scroll con gradiente morado, titulares cinéticos 3D, Framer Product X-Ray /
  Scroll Explode, Text Scroll 3D, técnica ulunavia (imagen entera → imagen explotada
  animada por scroll).
- Responsive móvil primero, WCAG razonable (contraste, teclado, labels, foco, jerarquía),
  60fps, `prefers-reduced-motion` respetado, imágenes WebP, componentes/secciones
  editables sin hardcode innecesario.

## 4. Secciones en orden obligatorio (11, SCRUM-252)

1. Hero + propuesta de valor, con barra fija de ganancias siempre visible.
2. Cómo funciona — 3 pasos (crear cuenta con Auth, elegir minero, recibir recompensas variables).
3. Minería + AI / PEARL (visión PEARL Research Lab).
4. Producto / mineros — vista explotada sticky animada por scroll.
5. Calculadora interactiva de proyección (PEARL/día, mes, año) con CTA "Quiero ver este nivel →".
6. Preventa con niveles de referencia GoMining y FOMO honesto sin datos falsos.
7. Transparencia / riesgos.
8. Quiénes somos — PouwMiner como rama operativa de PEARL Research Lab.
9. Roadmap interactivo destacado.
10. CTA hacia Auth rediseñado (SCRUM-248).
11. Footer legal con reserva expresa de TOS y Privacy.

IDs de sección: `#hero` `#como-funciona` `#vision-pearl` `#producto` `#calculadora`
`#preventa` `#transparencia` `#quienes-somos` `#roadmap` `#comenzar` `#footer`.

## 5. Roadmap destacado (pieza principal)

- Plantilla clave: **Milestone Timeline de Nexus UI** (React + Tailwind + Framer Motion).
- Sección fijada (pinned) al hacer scroll en escritorio con GSAP ScrollTrigger: la línea
  luminosa morada crece y cada fase se ilumina al llegar; en móvil, timeline vertical de
  una columna con swipe.
- Línea con estado: sólida + check violeta en fases entregadas, cuenta luminosa pulsante
  en la fase en curso, discontinua en las próximas.
- 9 fases: Foundation → Landing/educación/transparencia → Auth y wallet → Minería →
  Membresías → Referidos, Unilevel y ProfitShare → Customization, progresión y
  entitlements → Legal/compliance → Launch y post-launch.
- Cada fase muestra ESTADO (Completado / En curso / Próximo), **NUNCA fecha de release
  inventada**. Fase en curso y Lanzamiento en tarjetas grandes con glow morado, escala
  mayor y badges **AHORA** / **PRÓXIMO GRAN HITO**; resto en tarjetas glass compactas.
  Clic o flechas del teclado abren la tarjeta elevada con el detalle.
- Hilo luminoso morado (ribbon) que recorre la sección y se engrosa con el scroll.
  Fondo oscuro con aurora morada, nodos con anillo pulsante. Respeta
  `prefers-reduced-motion`.

## 6. Reglas de cumplimiento (obligatorias — si el copy las rompe, el diseño está mal)

- NUNCA "ROI garantizado", "ingreso fijo" ni "renta diaria asegurada". Recompensas
  VARIABLES. Toda cifra de ganancia lleva la etiqueta visible
  **\"Proyección variable, no garantizada\"**.
- GoMining es BENCHMARK/inspiración, no especificación contractual. Niveles observados
  (1.46 TH $18.99, 8.33 TH $99.99, 21.05 TH $249.99, 42.44 TH $499.99, 30 u./nivel;
  lanzamiento desde $499.99 hasta 5,000 TH / $54,768.99) son referencia pendiente de
  decisión del PO. Los % ROI observados (52.5–57.17%) NO se publican como promesa.
- AI: conectar minería con PEARL Research Lab y su línea de investigación/inferencia
  SIN afirmar que la AI controla, optimiza o garantiza rentabilidad/minería.
- Quiénes somos: PouwMiner como rama operativa de PEARL Research Lab (investigación
  aplicada, software, infraestructura/minería, AI). NO inventar entidad legal, sede,
  licencias, partners, número de usuarios, volumen, certificaciones ni historial.
- Diferenciar hashrate/capacidad física real de créditos, simulación o mecanismos
  sintéticos/de respaldo. Separar rasgos cosméticos de power/efficiency/reward.
- Roadmap sin fechas inventadas; decisiones económicas abiertas NO se publican como
  definitivas. Footer con reserva de TOS y Privacy (cambios legales requieren revisión
  humana competente).
- FOMO honesto: contadores "quedan X de 30" y cuenta atrás SOLO con datos reales
  aprobados; si no hay dato real, el componente queda con TODO / valor neutro. NUNCA
  inventar cifras, fechas ni ventas.
- **DIRECTIVA DEL PO (vigente; prevalece sobre el texto BTC del plan y del draft): la
  moneda de minería y recompensa es exclusivamente PEARL (nunca BTC/Bitcoin).**
  Hero badge: "MINERÍA DIGITAL · PEARL HASHRATE". Proyecciones en PEARL. La
  calculadora y la barra fija muestran PEARL/día, mes y año.
- Restricciones del PO (entrevista 22:45–22:53 del 14 nov): NO copiar código OSS para la
  lógica principal; NO ejecutar scripts externos ni delegar ejecución (librerías como
  React/Framer/GSAP sí permitidas); el equipo PUEDE generar imágenes si hace falta
  cumpliendo todas las peticiones del diseño.
- Verificación exigida por el PO: `npm run build` sin errores + inspección
  visual/responsive + pruebas E2E + autocrítica del diseño + uso de skills de diseño.

## 7. Estado actual al recuperar el contexto (15 nov ~03:35 Caracas)

### Run VM (sesión agy en esta VM, padre 44172c9b-5f30-40bb-8b16-942dffb72f99)
- Step 0 Survey completo (3 explorers). `PROJECT.md`: 34 características, 5 hitos.
  `TEST_INFRA.md`: 4 niveles, 136 tests (Vitest + JSDOM + React Testing Library).
- **M1 Foundation: Gate PASS** (15 archivos, 137 tests vitest, Reviewer APPROVE,
  Challenger APPROVE, Forensic Auditor CLEAN).
- **M2 Top Funnel: EN CURSO** — worker_m2_1 desplegó HeroSection, StickyEarningsBar,
  HowItWorksSection, PearlVisionSection + App.tsx; build limpio; verificación final de
  tests pendiente (última actualización de progress.md: 01:38 Caracas).
- M3, M4, M5 pendientes. Pista E2E: Gen1 activo, ola de verificación final iteración 3.
- `dist/` construido (último 01:39 Caracas).

### Run PC (host Windows de Roman)
- Step 0 completo (29 características, 6 hitos). Cuota de teamwork agotada →
  implementación directa. 11 secciones creadas en `Laning_Page/pouwminer-landing`.
  `npm install` en curso. `PROJECT.md` generado para revisión del equipo.
- **NOTA: los dos runs tienen descomposiciones distintas (VM 34 características / 5
  hitos; PC 29 / 6 hitos).** Hasta que el PO decida cuál es canónica, cada run continúa
  su propio plan SIN mezclar archivos ni reescribir el trabajo del otro. No hay colisión
  de filesystem (rutas distintas, máquinas distintas).

### Pendiente de decisión del PO
- Precios, niveles y límites finales de preventa PouwMiner.
- Inventario real por nivel y fechas de preventa/lanzamiento.
- Métodos de pago en preventa y wallets.
- Entidad legal, sede, licencias, partners y cifras que SÍ se pueden publicar.
- Los 7 binarios del context pack (no adjuntos en Jira: PENDING_BINARY_UPLOAD).
- TOS y Privacy: quién los redacta/revisa.
- Cuenta alterna de GitHub para los pushes de `landing-page/`.\n\n## 8. Qué falta (en orden)\n\n- M2: cerrar verificación final y gate.\n- M3: minero explotado scrollytelling, calculadora, preventa.\n- M4: transparencia, quiénes somos, roadmap destacado, CTA Auth, footer legal.\n- M5: 100% E2E + Tier 5 adversarial + autocrítica de diseño + reporte final al PO.\n\n## 9. Regla de oro\n\nNo omitas secciones, no alteres el orden, no inventes datos. Si algo de este documento\nchoca con otro archivo, manda este documento salvo orden directa de Roman en el chat.\n