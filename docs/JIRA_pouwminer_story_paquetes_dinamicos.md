# PROYECTO: pouwminer.com

- **Tipo de proyecto:** Scrum
- **Clave sugerida:** `POUW`
- **Modo:** backonly (subtareas etiquetadas `[BACK]` y `[FRONT-BIND]`; si backonly excluye frontend, solo se toman las `[BACK]`)

---

## ÉPICA POUW-E1: Catálogo dinámico de paquetes y campañas de la tienda

Que los paquetes que el administrador gestiona en `?tab=admin_packages` sean los que se muestran en el modal "Crear un minero", por sección de la tienda, con **todos sus campos en la base de datos** y con **descuentos/campañas por paquete**.

---

## HISTORIA POUW-1: Sembrar y mostrar dinámicamente los paquetes desde Firestore (sin rediseño)

**Como** administrador, **quiero** que cada paquete de cada sección viva completo en la base de datos, sea editable y pueda recibir descuentos o campañas, **para** operar la tienda sin tocar código, y que el cliente vea siempre lo publicado.

### REGLAS NO NEGOCIABLES

1. **CERO rediseño UI/UX.** No se modifica CSS, layout, componentes visuales ni copy del modal. El diseño actual costó ~10 horas y está aprobado. Solo cambia *de dónde salen los datos*.
2. **Rama aislada.** Todo el trabajo va en una rama nueva; **nada se toca en `main`** hasta que el PO apruebe un PR (ver POUW-1.0).
3. **El frontend actual es la fuente de verdad del contenido** (nombres, textos, precios, TH, cupos, ROI, orden). Se copia tal cual; nadie renombra ni "mejora". Los `.docx` de `Y:\ChatGPT\go-minning\docs` solo contrastan.
4. **Prohibido borrar o sobrescribir:** ni código del frontend, ni documentos existentes en Firestore, ni ediciones del admin.
5. **Todo valor que el frontend muestre por paquete debe existir como campo en la base de datos** (ver cobertura de campos).

### Secciones y fases de la tienda

Fases de la plataforma: **Preventa → Lanzamiento → MinerX**. Los paquetes **MinerX son el catálogo permanente** que queda al terminar las fases de preventa y lanzamiento.

| Tab (tal como aparece) | `section` | Contenido |
| --- | --- | --- |
| Paquetes MinerX | `minerx` (+ fila Custom `packageType: custom`) | Catálogo permanente: Minero 1–5 (48 / 64 / 96 / 128 / 192 TH; 561.99 / 744.99 / 1,111.99 / 1,474.99 / 2,201.99 USDT según doc de negocio) |
| Preventa | `preventa` | 1.46 / 8.33 / 21.05 / 42.44 TH, 30 cupos c/u |
| Lanzamiento | `lanzamiento` | Niveles de lanzamiento (constantes del frontend) |
| Mensual | `mensual` | Inicio / Plus / Pro (constantes del frontend) |

> Nota: hoy el tab MinerX del frontend muestra datos de Preventa (provisional). Con la aclaración del PO, el seed de `minerx` usa Minero 1–5. Los **nombres visibles** de esos 5 paquetes deben confirmarse (ver Discrepancias); no se usan los nombres del DB actual.

### Modelo de datos: colección `commercial_packages/{id}`

ID determinístico y legible (`preventa-01`, `lanzamiento-07`, `mensual-inicio`, `minerx-01`, `minerx-custom`), no el nombre comercial. Cambios **aditivos**: los documentos actuales siguen siendo válidos.

**Se conservan:** `availableUnits`, `soldUnits`, `badgeText`, `commissionPct`, `variablePct`, `createdAt`, `updatedAt`, `description`, `durationDays`, `efficiencyWattsPerTh`, `isPublished`, `publishedToStorefront`, `name`, `powerTh`, `status`, `version`, `seededAt`.

**Nuevos (opcionales):**

| Grupo | Campo | Tipo | Para qué |
| --- | --- | --- | --- |
| Identidad | `section` | enum | `minerx` \| `preventa` \| `lanzamiento` \| `mensual` |
| | `packageType` | enum | `fixed` \| `subscription` \| `custom` |
| | `sortOrder` | int | Orden exacto de las filas |
| | `displayName` | string | Texto **literal** del frontend (ej. `1.46 TH`, `Inicio`) |
| | `frontendKey` | string | Clave estable al ítem original (idempotencia/auditoría) |
| | `source` | enum | `frontend-seed` \| `admin` |
| Precio | `priceUsdCents` | int64 | Precio base exacto en centavos |
| | `pricePerThCents` | int64 | Precio por TH (Lanzamiento) |
| | `priceUsdtCents` | int64 | Precio en USDT si se usa |
| | `billing` | enum | `one_time` \| `monthly` |
| | `finalPriceUsdCents` | int64 | **Calculado por servidor**: base − descuentos vigentes. Sin descuento = base |
| Rendimiento | `dailyBtcText` | string | Literal ej. `0.00000062` (sin pérdida de precisión) |
| | `roiPct` | number | ej. `52.5` |
| | `maintenance` | map | Mantenimiento y electricidad por TH/periodo, exactos como los muestra el frontend |
| Cupos | `limitedUnits` | int | Cupos de preventa (30) |
| Suscripción | `subscription` | map | `{ initialTh: 3.20, upgradeTargetTh: 3.82 }` |
| Custom | `custom` | map | `{ minTh, maxTh, levels, minPriceUsdCents, maxPriceUsdCents }` |
| Textos | `uiText` | map | Subencabezados, badges y notas que el frontend muestra por paquete/sección |
| Descuentos | `discount` | map | Descuento directo del paquete: `{ isActive, type: percent\|fixed, value, label, startsAt, endsAt }` |
| | `campaignIds` | array | Campañas aplicadas a este paquete |
| | `maintenanceDiscountPct` | map | Descuentos de mantenimiento por nivel de membresía (Starter/Pro, regular/preventa) |
| Futuro | `minerTemplateId` | string\|null | Gancho a la colección de mineros (NFT, deducciones, electricidad). `null` por ahora |
| Auditoría | `updatedBy` | string | UID del admin |

**Hallazgo de tipos:** `priceUsd` hoy es `int64` y no puede guardar `18.99` ni `99.99`; por eso el dinero se guarda en centavos enteros (nunca `double`).

### Descuentos y campañas

Colección nueva `campaigns/{id}`: `name`, `type` (`percent`|`fixed`), `value`, `startsAt`, `endsAt`, `isActive`, `priority`, `stackable`, `appliesTo` (`{ packageIds[] | sections[] | all }`), `badgeText`, `maxRedemptions`, `redeemedCount`, `createdBy`.

Reglas:
- Un descuento puede aplicarse a **un paquete específico** (campo `discount` o `campaignIds`) o a una sección completa.
- El **servidor calcula** `finalPriceUsdCents`; el frontend nunca calcula ni confía en precios locales. Se aplican solo descuentos vigentes (fechas + `isActive`); si hay varios, se respeta `priority`/`stackable`.
- **Sin UI nueva:** con un descuento activo, el precio final ocupa el **mismo elemento de precio existente** y la etiqueta usa el **mismo elemento de badge existente**. Tachado, contadores u otros elementos visuales nuevos quedan para una historia futura que el PO apruebe.
- Con ningún descuento activo, la tienda se ve **idéntica** a hoy.

### Criterios de aceptación

1. `?modal=paywall-create` muestra, por tab, los paquetes de su `section` con `isPublished && publishedToStorefront`, ordenados por `sortOrder`.
2. **Paridad visual:** capturas antes/después de los 4 tabs y Miner creation (1 TH y 32 TH), mismo viewport; sin diferencias de píxel ni de texto.
3. **Cobertura de campos:** script que compara cada valor renderizado por paquete contra los campos del documento y **falla si algún valor visible no tiene campo**.
4. En `admin_packages` el admin edita todos los campos, publica/despublica, asigna descuentos y campañas por paquete; no puede borrar paquetes sembrados (solo despublicar).
5. Un paquete despublicado desaparece del modal; uno editado refleja su nuevo valor; un descuento vigente cambia el precio mostrado y al vencer vuelve al precio base.
6. **Fallback seguro:** si Firestore falla o una sección viene vacía, el modal muestra las constantes actuales (feature flag `PACKAGES_FROM_DB`, **apagado por defecto**). Nunca una tienda vacía.
7. Seed **idempotente y no destructivo**: crea solo lo que no existe (por `frontendKey`), no pisa ediciones del admin, nunca borra.
8. Documentos antiguos (`pkg-miner-1`, "Minero 1 Entry", etc.) **no se tocan**; sin `section`, la tienda los ignora.
9. Seguridad: lectura pública solo de publicados; escritura solo admin (paquetes y campañas).
10. Copy en español, sin cambios.

### Subtareas

**[BACK] POUW-1.0 – Aislamiento y red de seguridad (PRIMERO)**
- `git tag pre-POUW-1` sobre `main` y crear rama `feature/POUW-1-dynamic-packages` desde `main`. Todo commit va en esa rama; PR a `main` solo con aprobación del PO.
- **La rama no aísla la base de datos:** si apunta al mismo Firestore, puede afectar a `main`. Por eso: desarrollar y sembrar contra **emulador de Firestore o proyecto de staging**. **No** ejecutar el seed ni `firebase deploy` (reglas/índices) contra producción desde la rama hasta el visto bueno del PO.
- Backup/export de `commercial_packages` antes de cualquier escritura real.
- Feature flag `PACKAGES_FROM_DB` en OFF por defecto.
- Guardia de PR: checklist + screenshot diff; cualquier cambio en estilos/markup del modal debe justificarse o se rechaza.

**[BACK] POUW-1.1 – Inventario de contenido actual (solo lectura)**
- Script que extrae de las constantes del frontend, por tab, todo lo que se renderiza por paquete. Entregable: `seed-manifest.json` + tabla en el PR para aprobación del PO **antes** de sembrar.

**[BACK] POUW-1.2 – Reporte de discrepancias frontend vs. docs** (informa, no corrige).

**[BACK] POUW-1.3 – Esquema, índices y reglas** (`section`, `isPublished`, `sortOrder`; colección `campaigns`), solo en emulador/staging.

**[BACK] POUW-1.4 – Script de siembra seguro**
- `--dry-run` por defecto; `--apply` explícito; create-only-if-not-exists; log de creados/omitidos; sin deletes.

**[BACK] POUW-1.5 – Servicio de catálogo y precios**
- Lectura por sección; escritura admin con validaciones (precio > 0, TH > 0, cupos ≥ vendidos); cálculo servidor de `finalPriceUsdCents`; `version` +1, `updatedAt`, `updatedBy`.

**[BACK] POUW-1.6 – Campañas y descuentos** (CRUD admin, vigencia, prioridad, aplicación por paquete/sección).

**[FRONT-BIND] POUW-1.7 – Enlazar el modal a la BD sin tocar UI**
- Reemplazar solo el origen de datos por Firestore, mapeando a los elementos existentes; flag + fallback; sin cambios visuales.

**[FRONT-BIND] POUW-1.8 – Panel `admin_packages` por sección** (edición completa, publicar, descuentos/campañas por paquete).

**[BACK] POUW-1.9 – Pruebas y paridad**
- Idempotencia del seed, reglas de seguridad, cálculo de descuentos, cobertura de campos, screenshot diff.

### Fuera de alcance

- **Cualquier rediseño o elemento visual nuevo** (incluye tachado de precios, banners de campaña).
- Colección de **mineros** con NFT/traits, mantenimiento, electricidad (se enlaza con `minerTemplateId`).
- Precios dinámicos por fecha/país, referidos, Unilevel y suscripciones Starter/Pro.
- Activar/desactivar fases (Preventa/Lanzamiento/MinerX) desde admin: `section` lo permite, historia futura.

### Discrepancias por resolver (el seed NO las decide)

1. **Nombres visibles de MinerX 1–5:** hoy el frontend no los muestra en ese tab y el DB tiene nombres incorrectos. Confirmar los textos exactos.
2. **Lanzamiento:** el tab dice "16 niveles", pero el doc solo trae los niveles 4 a 16. Los niveles 1–3 salen del frontend, no se inventan.
3. **Custom:** el frontend dice "22 niveles"; los docs dicen 20 y 16. Rango común: 1–5,000 TH y $12.99–$54,768.99.
4. **Mensual:** si existe un cuarto plan (48.66 TH, $499.99), su nombre debe salir del frontend.
5. **Moneda:** los docs de diseño piden solo USD; el de negocio usa USDT. El DB tiene `priceUsd` 599 y `priceUsdt` 561.99 para el mismo paquete; definir cuál se muestra.
6. **Preventa:** el doc declara 26,037 USDT de recaudación; la suma real (precio × 30) es 26,068.80.
7. **Nombre del proyecto:** `pouwminer.com` (los documentos dicen `pouwminers.com`).

### Definición de terminado

- [ ] Rama creada desde `main` con tag de respaldo; `main` intacto.
- [ ] Manifest aprobado por el PO antes de `--apply`.
- [ ] Seed probado en emulador/staging; producción solo tras aprobación y con backup.
- [ ] Paridad visual verificada (4 tabs + Miner creation).
- [ ] Cobertura de campos al 100%.
- [ ] Admin edita, publica y aplica descuentos por paquete; el cambio se ve en la tienda.
- [ ] Fallback probado (Firestore caído / sección vacía).
- [ ] Ningún documento ni código previo eliminado.
