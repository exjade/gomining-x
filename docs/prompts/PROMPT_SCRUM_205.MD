[C2C]
STATE: INIT
TASK_ID: scrum_205_pouw_e1
JIRA_KEY: SCRUM-205
WORKSPACE: go-minning-app

GOAL:
Implementar SCRUM-205 — POUW-E1 "Catálogo dinámico de paquetes y campañas": que los paquetes administrados en la plataforma sean la fuente de datos del modal `/home?modal=paywall-create`, organizados por sección, persistidos completos en Firestore y compatibles con descuentos/campañas, SIN rediseñar la UI existente.

═══ PASO 0 — OBLIGATORIO ANTES DE TOCAR NADA ═══
1. Ejecuta `workspace_info`. Verifica workspaceName = `go-minning-app` y workspaceId = `7833f70b8b50`. Si no coincide, DETENTE.
2. Ejecuta `git status` y `git branch --show-current`. `main` puede tener cambios locales ajenos a esta tarea: NO los descartes, NO hagas reset/stash destructivo, NO los mezcles con SCRUM-205.
3. Crea el tag `pre-POUW-1` sobre el commit actual de `main` si no existe.
4. Crea la rama `feature/POUW-1-dynamic-packages` desde ese commit, preferentemente en un `git worktree` aislado (no contamines el working tree dirty). Reporta la ruta del worktree.
5. No modifiques `main`. No hagas push, PR ni merge sin autorización explícita.

═══ FUENTE DE VERDAD ═══
Lee primero `docs/JIRA_pouwminer_story_paquetes_dinamicos.md` (historia POUW-1 / SCRUM-205). Define el alcance funcional. Si algo contradice este prompt, gana la especificación, y lo reportas.
NO asumas que la arquitectura descrita ya existe: reconcílala con el código real.

Inspecciona como mínimo:
- `src/App.tsx`, `src/firebase.ts`, `firestore.rules`
- `src/components/miner-builder/*` (incluye `MinerBuilderDialog`)
- dónde se definen hoy: `oneTimeMinerPlans`, `presaleMinerPlans`, `launchMinerPlans`, `monthlyMinerPlans`, `customMinerPriceTiers`
- el panel admin existente (`?tab=admin_packages`)
- `DEFAULT_COMMERCIAL_PACKAGES` y `StorefrontSectionsConfig`
- configuración Firebase/emulador, scripts, tests y backend/Cloud Functions existentes (si los hay)
- cómo el proyecto identifica HOY a un administrador (claims, colección de admins, email, etc.). NO inventes roles ni claims nuevos.

Hechos ya detectados:
- `MinerBuilderDialog` selecciona datos desde constantes locales.
- `commercial_packages` existe con un modelo mucho más pequeño que el requerido.
- Existe fallback `DEFAULT_COMMERCIAL_PACKAGES` y control remoto de secciones `StorefrontSectionsConfig` (debe preservarse).
- Las reglas actuales de `commercial_packages` son `allow read, write: if true` → NO cumplen la seguridad requerida.

═══ REGLAS NO NEGOCIABLES ═══
- CERO rediseño UI/UX: sin cambios de CSS, layout, componentes visuales ni copy aprobado. El diseño costó ~10 horas y está aprobado. Solo cambia DE DÓNDE salen los datos.
- El frontend actual es la fuente de verdad del contenido: nombres, textos, precios, TH, cupos, ROI y orden se copian tal cual. No "mejores" ni renombres nada.
- Los docs de `Y:\ChatGPT\go-minning\docs` (si están en el repo, en `docs/`) solo contrastan; si difieren, gana el frontend y se reporta.
- No borres código salvo que sea estrictamente reemplazado por una abstracción equivalente y comprobada.
- No borres documentos Firestore ni sobrescribas ediciones del admin.
- Documentos legacy de `commercial_packages` sin `section` siguen existiendo, pero el storefront nuevo los ignora.
- `PACKAGES_FROM_DB` queda OFF por defecto.
- Si Firestore falla o una sección no devuelve paquetes válidos, usa EXACTAMENTE las constantes actuales de ESA sección. Nunca dejes el storefront vacío.
- Dinero en centavos enteros (int). Nunca `double` para importes.
- El frontend NO calcula el precio final de descuentos/campañas. `finalPriceUsdCents` debe venir de lógica confiable del servidor/backend.
  → Si el repo NO tiene backend/Cloud Functions donde calcularlo de forma confiable, NO lo calcules en el cliente: implementa la lógica pura y testeada en un módulo reutilizable, deja el despliegue como bloqueo documentado, y mientras tanto el cliente muestra el precio base.
- NO ejecutes seed contra producción, NO `firebase deploy` a producción, NO alteres datos de producción.
- NO resuelvas discrepancias de producto por tu cuenta ni inventes contenido. Si una decisión requiere al PO: conserva el comportamiento actual y registra el bloqueo.
- Una rama de git NO aísla la base de datos: trabaja solo contra emulador de Firestore o staging.

═══ CONTEXTO DE NEGOCIO ═══
Fases: Preventa → Lanzamiento → MinerX. MinerX es el catálogo PERMANENTE que queda al terminar las fases anteriores.
Mapeo UI → Firestore:
- `packages` (tab "Paquetes MinerX") → `section: minerx` (incluye la fila Custom como `packageType: custom`, controlada por `showCustom`)
- `presale` → `preventa`
- `launch` → `lanzamiento`
- `monthly` → `mensual`
Hoy el tab MinerX del frontend muestra datos provisionales de Preventa; MinerX definitivo = Minero 1–5 (48/64/96/128/192 TH; 561.99/744.99/1,111.99/1,474.99/2,201.99 USDT según doc de negocio). Los NOMBRES visibles de MinerX 1–5 están pendientes del PO: no los inventes ni uses los nombres del DB actual ("Minero 1 Entry", etc.).

═══ IMPLEMENTACIÓN (subtareas) ═══

POUW-1.0 AISLAMIENTO
Rama/worktree/tag listos, flag OFF, guardia contra cambios de UI (checklist + comparación de capturas en el PR).

POUW-1.1 INVENTARIO
Mecanismo reproducible (script) que EXTRAIGA del frontend actual todos los valores visibles por paquete y genere `seed-manifest.json` por sección y paquete (nombre visible, TH, precios, precio/TH, cupos, ROI, BTC/día, badges, subencabezados, orden, etc.). No copies a mano lo que pueda extraerse de las fuentes.

POUW-1.2 DISCREPANCIAS
Reporte frontend vs docs. SOLO reporta, NO corrijas. Debe cubrir: nombres MinerX 1–5; niveles 1–3 de Lanzamiento ("16 niveles" vs tabla que empieza en 4); niveles Custom (22 en frontend vs 20/16 en docs); posible cuarto plan Mensual (48.66 TH / $499.99) y su nombre; USD vs USDT (`priceUsd` 599 vs `priceUsdt` 561.99); total de Preventa (26,037 vs 26,068.80); nombre pouwminer.com vs pouwminers.com.

POUW-1.3 MODELO DE DATOS
Extiende `commercial_packages` de forma ADITIVA. Conserva: availableUnits, soldUnits, badgeText, commissionPct, variablePct, createdAt, updatedAt, description, durationDays, efficiencyWattsPerTh, isPublished, publishedToStorefront, name, powerTh, status, version, seededAt.
Agrega (opcionales): section, packageType (fixed|subscription|custom), sortOrder, displayName (texto literal del frontend), frontendKey, source (frontend-seed|admin), priceUsdCents, pricePerThCents, priceUsdtCents, billing (one_time|monthly), finalPriceUsdCents, dailyBtcText (string literal), roiPct, maintenance, limitedUnits, subscription {initialTh, upgradeTargetTh}, custom {minTh, maxTh, levels, minPriceUsdCents, maxPriceUsdCents}, uiText, discount {isActive, type percent|fixed, value, label, startsAt, endsAt}, campaignIds[], maintenanceDiscountPct, minerTemplateId (null por ahora), updatedBy.
Crea `campaigns/{id}`: name, type (percent|fixed), value, startsAt, endsAt, isActive, priority, stackable, appliesTo ({packageIds[] | sections[] | all}), badgeText, maxRedemptions, redeemedCount, createdBy.
IDs determinísticos: `preventa-01`, `lanzamiento-07`, `mensual-inicio`, `minerx-01`, `minerx-custom`. Nunca el nombre comercial como ID.

POUW-1.3 SEGURIDAD
Corrige `firestore.rules` según la autenticación admin REAL del repo:
- público: solo lectura de paquetes con `isPublished && publishedToStorefront`;
- packages/campaigns: escritura solo admin;
- campañas: exposición pública solo lo estrictamente necesario para la tienda.
Pruébalas en emulador/staging. Verifica explícitamente que un cliente anónimo NO puede escribir.

POUW-1.4 SEED
Idempotente y no destructivo: `--dry-run` por defecto; `--apply` explícito; create-only-if-not-exists; idempotencia por `frontendKey`; sin update de docs existentes; sin delete; log de creados/omitidos; no tocar legacy.
HARD GATE: NO ejecutes `--apply` (ni siquiera contra staging real) hasta que el PO apruebe explícitamente `seed-manifest.json`. Sí puedes implementarlo, correr dry-run y probar idempotencia con fixtures/emulador.
Los paquetes cuyo contenido dependa de una decisión abierta del PO (p. ej. nombres MinerX 1–5) no se siembran con valores inventados: quedan marcados como bloqueados en el manifest.

POUW-1.5 SERVICIO DE CATÁLOGO
Capa independiente de la UI (servicio/adaptador único, sin consultas Firestore sueltas en componentes): obtener por `section`; solo `isPublished && publishedToStorefront`; orden por `sortOrder`; fallback por sección; validación (precio > 0, TH > 0, cupos ≥ vendidos, section válida); updates admin con `version + 1`, `updatedAt`, `updatedBy`.

POUW-1.6 PRECIOS/CAMPAÑAS
Lógica pura y testeada para: descuento por paquete; campaña por packageIds, por sections y global; startsAt/endsAt; isActive; priority; stackable; percent y fixed. Produce `finalPriceUsdCents`. Sin descuento vigente: `finalPriceUsdCents === precio base`. El cliente nunca decide un precio menor al autorizado. Sin UI nueva: el precio final usa el elemento de precio existente y la etiqueta el badge existente.

POUW-1.7 BIND DEL STOREFRONT
Integra el catálogo en `MinerBuilderDialog` mediante adaptador/view-model (la UI no conoce el documento Firestore). Preserva `StorefrontSectionsConfig`, auto-switch entre tabs, fallback de Packages, `showCustom`, selección, navegación, modal y markup existente salvo lo estrictamente necesario para el binding.
- `PACKAGES_FROM_DB=false` → comportamiento EXACTAMENTE el actual.
- `PACKAGES_FROM_DB=true` → Firestore por sección con fallback seguro a las constantes de ESA sección.

POUW-1.8 ADMIN
Ubica el panel admin existente (`?tab=admin_packages`); NO crees un segundo panel. Por sección permite editar todos los campos relevantes, publicar/despublicar, orden, precio, potencia, cupos, textos, descuentos y campañas. Un paquete sembrado NO se borra: solo se despublica. Sin rediseñar el panel más allá de exponer campos.

POUW-1.9 TESTS
Pruebas reproducibles de: manifest/inventario; cobertura 100% de valores visibles; parseo del modelo; orden por sortOrder; filtro por section; publicar/despublicar; fallback por sección; flag en false; idempotencia y no destructividad del seed; percent; fixed; vigencia por fecha; priority; stackable; campañas por paquete/sección/all; reglas Firestore; versión/auditoría; legacy ignorados; Firestore vacío/error.
COBERTURA DE CAMPOS: un test/script que FALLE si un valor visible de un paquete proviene de una constante o cálculo no respaldado por su documento (excepto valores explícitamente globales según la especificación).

═══ PARIDAD VISUAL ═══
No confíes solo en `npm run build`. Captura antes/después los 4 tabs (Paquetes MinerX, Preventa, Lanzamiento, Mensual) y el flujo Custom/Miner creation con 1 TH y 32 TH, mismo viewport. No debe haber cambio visual ni textual por el cambio de origen de datos. No retoques CSS para "hacer coincidir": se conserva el DOM/UI existente.

═══ VALIDACIÓN ═══
Ejecuta: tests relevantes, suite de reglas/emulador si existe, `npm run build`, `git diff --check`. Revisa el diff completo antes de declarar éxito.

═══ NO HAGAS ═══
Seed/deploy/escritura en producción · push · merge a main · borrar documentos · sobrescribir datos · resolver discrepancias de producto · cambiar el diseño · inventar contenido.

═══ GATE DE APROBACIÓN ═══
Cuando `seed-manifest.json` y el reporte de discrepancias estén listos, indica claramente que requieren aprobación del PO. Si el resto puede avanzar sin aplicar el seed, continúa.

═══ ENTREGA FINAL ═══
[C2C]
STATE: EXECUTED | NEEDS_APPROVAL | BLOCKED
TASK_ID: scrum_205_pouw_e1
JIRA_KEY: SCRUM-205
ITERATION: <n>
BRANCH: feature/POUW-1-dynamic-packages
WORKTREE: <ruta>
RESULT: <resumen concreto>
CHANGED_FILES: <lista>
MANIFEST: <ruta + estado>
DISCREPANCIES: <ruta + decisiones pendientes>
FEATURE_FLAG: <estado y ubicación>
TESTS: <comandos y resultados>
FIRESTORE: <qué se probó y contra qué entorno>
PRODUCTION_WRITES: NONE
UI_PARITY: <evidencia>
OPEN_PO_DECISIONS: <solo las que realmente requieren decisión>
NEXT_EXPECTED_STEP: <siguiente acción concreta>

NO declares DONE si: falta cobertura de campos · hay cambios visuales no autorizados · el fallback no está probado · las reglas aún permiten escritura pública · el seed puede sobrescribir documentos · se usaron datos inventados · el precio final lo calcula el cliente.