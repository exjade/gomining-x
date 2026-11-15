# PouwMiner Landing Page — PROJECT.md

> **Estado:** Construcción y verificación de Hitos activa (SCRUM-252 / SCRUM-251)
> **Directiva PO Canónica:** `CONTEXTO-RECUPERACION.md` (Moneda de minería y recompensa: **exclusivamente PEARL, nunca BTC**).
> **Ruta del proyecto (PC):** `C:\Users\Roman\OneDrive\Documentos\Gomining-x\Landing Page\Laning_Page\pouwminer-landing\`
> **Build Status:** ✅ `npm run build` PASS (0 errores TypeScript, dist/ generado exitosamente)

---

## 1. Stack Tecnológico

| Tecnología | Versión | Rol |
|---|---|---|
| Vite | ^6.0.1 | Bundler y dev server |
| React | ^19.0.0 | UI framework |
| TypeScript | ^5.6.3 | Tipado estricto |
| Tailwind CSS | ^3.4.14 | Design tokens & estilos utilitarios |
| Framer Motion | ^11.11.17 | Micro-interacciones y animaciones React |
| GSAP + ScrollTrigger | ^3.12.5 | Scrollytelling, pinned timeline & exploded view |
| Lenis | ^1.0.42 | Smooth scrolling a 60fps |
| Lucide React | ^0.460.0 | Iconografía |

---

## 2. Paleta de Colores & Design Tokens

```css
--bg-base: #090b14;        /* Fondo principal */
--bg-panel: #111420;       /* Paneles y tarjetas glassmorphism */
--bg-elevated: #171a28;    /* Nodos elevados y popovers */
--purple-500: #874bff;     /* Morado principal Pouw */
--purple-400: #b47bff;     /* Morado acento */
--purple-700: #7c3aed;     /* Royal Purple */
--purple-800: #6d28d9;
--purple-900: #4c1d95;
--green-accent: #4fdfa6;   /* Verde de recompensas PEARL */
--text-primary: #f5f5fb;   /* Texto principal de alto contraste */
--text-muted: #8a8ea4;     /* Texto secundario */
--gradient-purple: #a94eff → #713cff;
--gradient-violet: #7845ef → #9754ff;
```

---

## 3. Las 11 Secciones en Orden Obligatorio (SCRUM-252 / CONTEXTO-RECUPERACION.md)

| # | Sección | ID Canónico | Componente | Estado |
|---|---|---|---|---|
| 1 | Hero + propuesta de valor (barra fija de ganancias visible) | `#hero` | `HeroSection.tsx` & `StickyEarningsBar.tsx` | ✅ PASS |
| 2 | Cómo funciona (3 pasos con Auth, minero, recompensas variables) | `#como-funciona` | `HowItWorksSection.tsx` | ✅ PASS |
| 3 | Minería + AI / PEARL (visión PEARL Research Lab) | `#vision-pearl` | `MiningAiSection.tsx` | ✅ PASS |
| 4 | Producto / mineros (vista explotada sticky animada por scroll) | `#producto` | `ProductSection.tsx` | ✅ PASS |
| 5 | Calculadora interactiva de proyección (PEARL/día, mes, año) | `#calculadora` | `CalculatorSection.tsx` | ✅ PASS |
| 6 | Preventa con niveles de referencia y FOMO honesto | `#preventa` | `PresaleSection.tsx` | ✅ PASS |
| 7 | Transparencia / gestión de riesgos | `#transparencia` | `TransparencySection.tsx` | ✅ PASS |
| 8 | Quiénes somos — rama operativa de PEARL Research Lab | `#quienes-somos` | `AboutSection.tsx` | ✅ PASS |
| 9 | Roadmap interactivo destacado (Milestone Timeline Nexus UI) | `#roadmap` | `RoadmapSection.tsx` | ✅ PASS |
| 10 | CTA hacia Auth rediseñado (SCRUM-248) + FAQ | `#comenzar` | `CtaSection.tsx` | ✅ PASS |
| 11 | Footer legal con reserva expresa de TOS y Privacy | `#footer` | `Footer.tsx` | ✅ PASS |

---

## 4. Reglas de Cumplimiento Mandatorias

1. **Moneda Exclusiva:** Toda recompensa y cálculo opera en **PEARL** (nunca BTC). Hero badge: `"MINERÍA DIGITAL · PEARL HASHRATE"`.
2. **Cero Promesas de ROI:** Etiqueta obligatoria `"Proyección variable, no garantizada"` en calculadora, barra fija y secciones comerciales.
3. **Benchmark:** Datos de GoMining se declaran como referencia de modelado, no contrato definitivo.
4. **PEARL Research Lab:** Identidad veraz, sin inventar sedes, licencias ni cifras de usuarios inexistentes. La IA se circunscribe a telemetría y software, sin garantizar rentabilidad.
5. **Separación de Rasgos:** Estética y skins separadas de potencia, eficiencia y recompensas.
6. **Roadmap Verificable:** 9 fases sin fechas inventadas, navegables por teclado y enlazadas a Jira.
7. **Barra Fija Visible:** `StickyEarningsBar` presente de forma persistente con lecturas en tiempo real de PEARL/día, mes y año.
