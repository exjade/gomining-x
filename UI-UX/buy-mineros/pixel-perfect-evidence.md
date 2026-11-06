# Evidencia de rediseño del modal de mineros

## Referencias

- `reference-A`: `app.gomining.com_home_modal=paywall-create.png` — hero y lista de mineros.
- `reference-B`: `app.gomining.com_home_modal=paywall-create (1).png` — configuración y economía.
- Dimensiones originales de ambas referencias: 3678 × 3334 px.

## Comparación iterativa (viewport 1280 × 900)

| Iteración | Hallazgo observado | Corrección aplicada | Residual |
| --- | --- | --- | --- |
| V1 — Geometría | Modal y tarjetas todavía se percibían genéricos; hero demasiado corto; panel económico sin la separación visual de la referencia. | Fijado ancho de 660 px, fondo `#1E1F2E`, radio de 24 px, overlay, tarjetas de 88 px y acciones sticky. | Faltaba sustituir el hero provisional y afinar la tarjeta económica. |
| V2 — Componentes | El hero provisional no correspondía a un activo real; la jerarquía superior estaba comprimida. | Sustituido por el minero real ya existente en `UI-UX/Mineros-customizables`, hero elevado a 286 px; tipografía, pestañas, lista y métricas alineadas con las referencias. | El repositorio no contiene el montaje exacto de varios mineros de `reference-A`. |
| V3 — Precisión | Separadores del panel económico y transición del hero necesitaban más contraste; borde interior poco perceptible. | Ajustados espaciados, borde interior, divisores de métricas, degradado inferior, estados activos y foco. | Se conserva un solo minero real en lugar del montaje de varios; no se inventó ni generó un recurso nuevo. |

## Resultado final observado

- `final-A`: comprobado visualmente a 1280 × 900 con hero, cierre, pestañas, selección activa, tarjetas y CTA visibles.
- `final-B`: comprobado visualmente a 1280 × 900 mediante scroll interno; controles de período, BTC, mantenimiento, métricas, totales, promoción y CTA permanecen accesibles.
- `final-mobile-390`: comprobado a 390 × 844 sin overflow horizontal; cierre, pestañas, tarjetas, scroll y acciones permanecen visibles.

Las vistas finales se observaron en el navegador local. Sus imágenes no están guardadas como archivos de evidencia: la descarga intentada desde el navegador fue rechazada por la política de seguridad. Por eso la revisión independiente todavía no puede cotejar los PNG de salida. El activo exacto de varios mineros tampoco existe en el repositorio; se conserva un minero existente y esa diferencia frente al hero de referencia queda abierta.

## Preservación y comprobaciones

- Baseline B1: estado efectivo de `src/App.tsx` y `src/styles.css` en el checkout `transactions` antes del rediseño.
- B2: solo reestructuración JSX presentacional dentro de `MinerBuilderDialog` y CSS scoped bajo `.miner-builder-modal`.
- Estadística B1 → B2 observada antes de promover B2 al checkout `transactions`: `App.tsx` 26 inserciones/28 eliminaciones presentacionales; `styles.css` 347 inserciones scoped.
- El checkout `transactions` ahora contiene B2 en esos dos archivos, por lo que ya no sirve como copia B1 y los comandos anteriores de comparación no deben usarse como diff B1 → B2. No se guardó un snapshot B1 independiente; la estadística anterior es el único registro de esa comparación.
- `git diff --check -- src/App.tsx src/styles.css`: sin errores.
- `npm run build`: exitoso; 7.211 módulos transformados. El recurso visual se emitió como `dist/assets/app.gomining.com_bonus-miner-v3_customize-*.png`.
- No se modificaron hooks, estado, cálculos, handlers, contratos, autenticación, dependencias ni datos.
