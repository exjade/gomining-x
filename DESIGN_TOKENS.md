# PouwMiner Landing Page — DESIGN_TOKENS.md

> Tokens de diseño verificados desde `gomining-x/src/styles.css` para coherencia con el dashboard del cliente.

## Colores

### Fondos
| Token CSS | Valor Hex | Uso |
|---|---|---|
| `--bg-base` | `#090b14` | Fondo principal de toda la landing |
| `--bg-panel` | `#111420` | Paneles y tarjetas base |
| `--bg-elevated` | `#171a28` | Tarjetas elevadas, modales |

### Morados (brand primario)
| Token | Hex | Tailwind | Uso |
|---|---|---|---|
| `--purple-400` | `#b47bff` | `text-purple-400` | Acentos, iconos |
| `--purple-500` | `#874bff` | `text-purple-500` | CTA primario, highlights |
| `--purple-600` | `#8b5cf6` | `text-purple-600` | Variante |
| `--purple-700` | `#7c3aed` | `text-purple-700` | Royal Purple |
| `--purple-800` | `#6d28d9` | `text-purple-800` | Bordes oscuros |
| `--purple-900` | `#4c1d95` | `text-purple-900` | Fondo secciones |

### Degradados
| Nombre | Valor | Uso |
|---|---|---|
| `--gradient-purple` | `#a94eff → #713cff (135°)` | CTA primario, barra de scroll |
| `--gradient-violet` | `#7845ef → #9754ff (135°)` | Hero text gradient |
| `gradient-dark` | `#7c3aed → #4c1d95 (135°)` | Fondos profundos |

### Texto
| Token | Hex | Uso |
|---|---|---|
| `--text-primary` | `#f5f5fb` | Texto principal |
| `--text-muted` | `#8a8ea4` | Texto secundario, placeholders |

### Acento de ganancias
| Token | Hex | Uso |
|---|---|---|
| `--green-accent` | `#4fdfa6` | PEARL/día, ganancias, check completado |

---

## Tipografía

| Rol | Fuente | Pesos | Uso |
|---|---|---|---|
| Body / UI | Inter | 300–900 | Todo el texto |
| Monospace | JetBrains Mono | 400–500 | Valores PEARL, hashes, código |
| Display (futuro) | Cal Sans | 700–800 | Titulares si se instala |

### Escala tipográfica

```css
.display-xl  — clamp(3rem, 7vw, 6rem)   — font-weight: 800 — letter-spacing: -0.04em
.display-lg  — clamp(2.25rem, 5vw, 4rem) — font-weight: 700 — letter-spacing: -0.03em
.display-md  — clamp(1.75rem, 3.5vw, 2.75rem) — font-weight: 700
.eyebrow     — 0.75rem — font-weight: 600 — tracking: 0.15em — UPPERCASE
```

---

## Efectos / Clases de utilidad

| Clase | Efecto |
|---|---|
| `.glass` | backdrop-blur(16px) + bg rgba + border purple/15 |
| `.glass-hover` | Hover con border purple/40 |
| `.glow-purple` | box-shadow purple glow |
| `.text-gradient` | Gradient #a94eff → #713cff on text |
| `.text-gradient-violet` | Gradient #7845ef → #9754ff |
| `.aurora-bg` | Radial purples sobre `--bg-base` |
| `.btn-primary` | Gradient purple, scale(0.97):active, hover shadow, spring cubic-bezier |
| `.btn-secondary` | Border purple/40, transparent bg, scale(0.97):active |
| `.btn-magnetic` | Base para efecto magnético (hook JS con useSpring) |

---

## Curvas de Easing (Emil Kowalski / emil-design-eng)

| Curva | Definición | Uso |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Interacciones UI instantáneas y nítidas |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Movimiento en pantalla |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Cajones y paneles emergentes |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Feedback táctil activo en botones (scale 0.97) |
| `--ease-apple` | `cubic-bezier(0.22, 1, 0.36, 1)` | Scrollytelling Apple Keynote / transiciones |

---

## Animaciones

| Animación | Duración | Uso |
|---|---|---|
| `float` | 6s ease-in-out infinite | Minero en hero |
| `pulse-purple` | 2s infinite | Nodo en progreso del roadmap |
| `glow` | 2s alternate | Glow de tarjetas destacadas |
| `ticker` | 20s linear infinite | Barra de logos/texto en hero |
| Framer spring default | stiffness:300, damping:20 | Botones magnéticos |
| GSAP ScrollTrigger | scrub:true | Product explode, roadmap progress |

---

## Breakpoints (mobile-first)

| Breakpoint | px | Tailwind |
|---|---|---|
| Mobile | < 768 | default |
| Tablet | 768px | `md:` |
| Desktop | 1024px | `lg:` |
| Wide | 1200px | container max-width |

---

*DESIGN_TOKENS.md · PouwMiner · SCRUM-252*
