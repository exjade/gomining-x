# Auditoría interactiva del checklist GoMining

**Fecha:** 1 de noviembre de 2026  
**Aplicación:** `http://127.0.0.1:5173`  
**Checklist de referencia:** [`gomining-replica-checklist.md`](./gomining-replica-checklist.md)  
**Catálogo de rutas:** [`src/catalog.ts`](./src/catalog.ts)

## Resultado ejecutivo

El primer corte confirmó **37 de 65 casillas**. En el cierre de esta matriz de interacción el checklist quedó en **64/69 confirmadas y 5 pendientes**. Los siguientes cortes fueron **67/74** y **68/75**; la implementación de Phantom nativo y su mock cifrado agregaron un punto confirmado y dejan el checklist vigente en **69/76 con 7 pendientes**. La frase instructiva que contiene `[x]` es texto, no una casilla. Se añadieron el contraste de documentación oficial, la vista QA del recibo ficticio y brechas del alcance Bridge/KYC. La revisión añadió comprobaciones de interfaz con proveedor wallet simulado, incluido cerrar mientras `eth_requestAccounts` queda pendiente, y contrastó cinco capturas de Solflare compartidas por el usuario con los destinos configurados. El conteo combina recorridos de interfaz, datos demo, evidencia aportada y análisis de código; no representa integraciones productivas ni significa que los pagos estén verificados o conciliados. Ver la [adenda REA actualizada](./gomining-replica-audit-2026-11-01-seguimiento.md#actualizacion--phantom-movil-y-verificacion-cli--2-nov-2026), la [adenda REA completa](./gomining-replica-audit-completa-2026-11-01.md#adenda-rea-y-documentación-oficial-de-pagos-1-nov-2026) y el [checklist vigente](./gomining-replica-checklist.md).

La réplica ya permite recorrer su mapa local, consultar cotizaciones indicativas para seis redes, abrir el checkout desde crear minero y recargar, probar simuladores de referidos/economía, ver datos públicos de una pool y conservar el estado demo de forma aislada en Firebase. Las brechas principales son: ninguna wallet real se conectó en esta auditoría; no se probó un envío real desde móvil; no existe backend que verifique una transferencia y active un producto; faltan estados interactivos de varias rutas, datos de granjas/workers y una revisión visual integral.

## Método y alcance de la evidencia

- La navegación local de esta revisión se hizo en una pestaña temporal con Computer Use (CUA), leyendo la interfaz y el árbol de accesibilidad. No se controló la pestaña que el usuario tenía abierta.
- Se reaprovechan las Evidence IDs REA que ya aparecen en el checklist y en el [informe REA](./gomining-replica-audit-REA-2026-11-01-cierre.md). Las interacciones CUA descritas aquí no se etiquetan como nuevas Evidence REA.
- En el primer corte no se abrió otra sesión interactiva porque un intento anterior señalaba `cleanup_incomplete`. Después se ejecutaron nuevas escenas REA temporales con cleanup verificado; esta actualización incluye la prueba de restauración/cierre con Evidence `ev_282d93b555ff50a8a19c3dad00cd928b32ca61a047430e8984c4969915015a79`. El análisis estático y sus límites están en el [seguimiento](./gomining-replica-audit-2026-11-01-seguimiento.md).
- Se recorrieron directamente 56 URLs del mapa en una pasada anterior: todas llegaron a contenido después de su skeleton. Eso prueba que cargan las rutas, no que cada pantalla tenga funcionalidad terminada.
- No se conectó una wallet, no se aprobó una firma, no se transmitieron fondos, no se activó un minero ni se acreditó una suscripción. Los cambios temporales de calculadoras se restauraron.

## Interacción comprobada

| Paso | Observación y resultado | Estado |
|---|---|---|
| Inicio y navegación | `/home` cargó saldo demo, acciones rápidas, retos demo, beneficios, pool y enlaces. El logo volvió a Inicio. Se desplegó el menú; Carteras abrió `/gmt-wallets`; el carrito abrió y cerró; Perfil abrió `/profile`. La pantalla de Perfil es un marcador genérico de contenido parcial. El encabezado mostró un acceso de wallet, saldo demo, carrito y perfil, sin dos iconos de notificación. | Navegación comprobada; Perfil incompleto. |
| Rutas directas | 56 URLs del mapa llegaron a contenido tras la carga esquelética. Algunas son placeholders o tablas demo vacías. | Smoke de rutas; no paridad funcional. |
| Crear minero | `/home?modal=paywall-create` abrió el modal. Se vieron compra única: Esencial 1.12 TH / MXN 272.22, Clásico 8.33 TH / MXN 1,878.43, Pro 21.05 TH / MXN 4,696.35 y Máximo 42.44 TH / MXN 9,392.89. El catálogo figura consultado el 31/10/2026. | Valores visibles; captura fechada, no precio sincronizado en vivo. |
| Modalidad mensual y custom | Se observaron Inicio 3.82 TH / USD 39.99 al mes, Plus 9.61 TH / USD 99.99, Pro 24.20 TH / USD 249.99 y Máximo 48.66 TH / USD 499.99. La modalidad personalizada mostró 1–5,000 TH y 20 niveles; con la selección inicial de 1 TH, el importe era MXN 244.04. | Navegación y presentación comprobadas; no se confirmó que el catálogo siga vigente hoy. |
| Revisión del minero | Continuar abrió el resumen de potencia, eficiencia 15 W/TH, modalidad, mantenimiento y precio con consentimiento antes de pagar. Cerrar la X quitó el parámetro modal y volvió a `/home`. | Comprobado sin firmar ni pagar. |
| Recargar | Recargar abrió un formulario demo con USD 500 por defecto y opciones USD 100/500/1,000. “Elegir wallet y pagar” abrió el checkout común; cerrar lo cerró sin pago. | Flujo local comprobado; no se añadió saldo en esta pasada. |
| Checkout/redes | Para una recarga de USD 500 se recorrieron BNB, BTC, ETH, TRX, Solana USDT SPL y Polygon POL. La cotización mostró precio de referencia, importe, destino por red y vigencia de 30 s. En Bridge se separa el 1% estimado del gas que calcula la wallet. Solana solo ofreció USDT SPL directo y avisa del posible costo SOL para crear la cuenta de token receptora. | Datos visibles por red; no se verificaron las direcciones en Solflare ni se aprobó una solicitud. |
| Carteras | La pantalla muestra Solflare, Phantom, MetaMask, Coinbase Wallet, Trust Wallet, TronLink y UniSat. No aparece WalletConnect, Project ID, Rango, solicitud de frase semilla o clave privada. | Lista visible; no se conectó/desconectó ninguna extensión o app. |
| Cancelación del checkout | En interacción anterior, X y Cancelar cerraron checkout en reposo y con un proveedor falso cuya promesa de envío quedaba pendiente. Esto no cierra una ventana interna real de MetaMask/Solflare ni demuestra que Android vuelva correctamente al checkout. | Cerrado con mock; falta wallet/dispositivo real. |
| X después de restaurar `gmPay` | REA inició a 390 × 844 px con un checkout reconstruido desde la URL, pulsó la X y confirmó que el modal desapareció y que la URL quedó en `/home`, sin parámetros de compra. Evidence `ev_282d93b555ff50a8a19c3dad00cd928b32ca61a047430e8984c4969915015a79`; cleanup correcto. | Cierre de UI verificado; no prueba el rechazo de permiso en MetaMask real. |
| Suscripciones | El plan mensual Platinum+ se muestra a USD 29.99 / 30 días. El anual aparece “Sin confirmar” y no deja continuar. El beneficio de +1% y retiro sin cola diaria está descrito como demo/local. | Precio mensual y bloqueo anual observados; activación y beneficios no se ejecutaron. |
| Referidos | Con escenario de USD 1,000 antes de la distribución, el simulador calculó USD 833.33 de pago neto al minero, USD 83.33 para el directo (10%) y USD 166.67 para el total Unilevel. Para tres niveles superiores, niveles 2–4 eran elegibles y los niveles sin referido quedaban retenidos. Profundidad/peso se cambiaron temporalmente y luego se restauraron. | Cálculo demo comprobado; no es ledger ni pago. |
| Recompensas y amigos | `/nft-referral/rewards` y `/nft-referral/friends` muestran datos sintéticos y tablas vacías, con mensajes de no conexión a datos de cuenta. | Rutas abren; funcionalidad de datos no disponible. |
| Pool y operaciones | Pool pública Kryptex mostró estimación de 3.750357 PRL/día para 300 TH/s y hora de consulta. Historial mostró 56 pagos públicos, 15 por página y 4 páginas; se abrió página 2 y un detalle de transacción Pearl. | Lectura pública comprobada; no representa la granja o pago de un cliente GoMining. |
| Granjas | `/data-centers/farms` informa que no hay datos del operador y no inventa ubicaciones, capacidad o estado de granjas. | Desconexión declarada correctamente. |
| Economía | Con valores temporales de 400 TH, 10 W/TH y USD 0.10/kWh, la calculadora mostró 96 kWh/día y USD 9.60/día de electricidad. También recalculó supuestos de mantenimiento, suscripciones, pool y margen; al faltar costos, el resultado vuelve a “Pendiente”. Valores originales restaurados. | Aritmética de escenarios comprobada; cifras no representan la operación real. |
| Firebase demo | Las pruebas REST, SDK y UI documentadas en el seguimiento verificaron Auth anónimo, aislamiento por UID, lectura/escritura de estado demo y restauración en una sesión `localhost` aislada. | Persistencia demo probada; no hay backend de órdenes/pagos. |

## Estado por grupo de casillas

Esta tabla conserva el corte histórico de **37/65** de la primera auditoría interactiva; no representa el estado actual. Las casillas vigentes están marcadas dentro del [checklist vivo](./gomining-replica-checklist.md), hoy **69/76**. La tabla siguiente sirve como registro de lo que estaba pendiente en aquel corte; las adendas posteriores cierran, entre otros, los recorridos demo, el error simulado de pool, la legibilidad de pantallas clave a escala predeterminada, la reutilización de la wallet en compra/recarga y los mocks del handoff móvil.

| Grupo | Pendiente | Qué falta para cerrarlo |
|---|---|---|
| Diseño y carga | Zoom 100%, retos demo, reducir movimiento, fallo del pool | Revisar texto/recortes al 100%; activar progreso tras cambios demo; aplicar `prefers-reduced-motion`; provocar demora/error y confirmar skeleton y recuperación. La revisión 390/768/1440 px está confirmada. |
| Compra de minero | Rechazo real; compra demo | Rechazar la solicitud en una wallet real y comprobar que no aparece recibo; crear worker y actualizar saldo en una sesión demo aislada. No aprobar pagos reales. |
| Recarga | Rechazo real; saldo demo; conciliación | Rechazar una wallet; comprobar “Añadir saldo demo” en sesión aislada; confirmar que transferencia no acredita saldo sin servidor. |
| Wallets | Conexión, dirección, desconexión, rechazo, reutilización | Verificar cada proveedor instalado y su ciclo de sesión, conexión compatible por red, proveedor ausente y flujo MetaMask en teléfono. No se lanzó solicitud de conexión. |
| Cotización y recibo | Actualización, vencimiento/error, recibo y destinos | Forzar refresco, expiración/error y botón deshabilitado; revisar un recibo existente; confirmar en Solflare que cada destino/red/activo coincide. No se envió dinero. |
| Suscripciones | Activación demo y beneficios | Probar activación mensual, bonus de 1% con workers demo y reglas de retiro demo con/sin suscripción en sesión aislada. |
| Referidos | Recompensa directa demo; separación de ledger | Ejecutar acreditación en demo y verificar que Firebase no se usa como ledger/pagos. Los cálculos ya probados no crean recibos. |
| Pool/workers | Worker demo, modo auto/manual, separar ingresos | Activar worker demo, cambiar modo y demostrar que ingreso público de Kryptex no se acredita como ganancia propia. |
| Preventa | Compra y asignación demo | Simular compra y revisar recibo; comprobar ausencia de campaña, contrato y emisión real. |
| Backend de pagos | Servicio de órdenes y conciliación | Falta API autenticada que verifique depósitos, evite duplicados, concilie órdenes y active productos con auditoría. Firebase solo conserva snapshot demo. |

## Hallazgos prioritarios para la siguiente implementación

1. **Wallet móvil — estado vigente:** el usuario reportó que una apertura anterior dejó MetaMask Android en blanco. El checkout usa `@metamask/connect-evm`; `mobile.useDeeplink: isMobileBrowser()` selecciona el deeplink nativo MWP (`metamask://connect/mwp`) en móviles y el Universal Link HTTPS en escritorio. No usa `/dapp/`. El flujo pide conexión por separado del pago, conserva el estado del checkout y solo solicita envío tras una aprobación explícita. El código actual se analizó estáticamente en REA, pero sigue sin probarse en teléfono. Necesita un dominio HTTPS accesible sin interstitial. MetaMask documenta el handoff móvil de Connect ([documentación](https://docs.metamask.io/metamask-connect/), [quickstart](https://docs.metamask.io/quickstart/), [SDK](https://github.com/MetaMask/connect-monorepo)).

## Configuración intermedia MetaMask Android — retirada · 1-nov-2026

Se probó como alternativa la ruta oficial `https://link.metamask.io/dapp/{host+path}`, que carga el sitio en el navegador de MetaMask. El usuario informó que en su Android dejó una página en blanco; esa ruta quedó retirada para MetaMask. Este texto preserva el registro histórico, no describe el código vigente.

La prueba de constructor pertenece a esa configuración retirada. En el corte intermedio, Android seleccionaba `mobile.useDeeplink: true`; después del reporte de pantalla en blanco, esa opción se sustituyó por `false` para seleccionar el Universal Link HTTPS MWP. El cierre del checkout reconoce una conexión pendiente (`session.connectingWallet`), deja cerrar X/Cancelar y avisa que el prompt puede seguir abierto en MetaMask. REA verificó después la X de un checkout reconstruido desde `gmPay` (`ev_282d93b555ff50a8a19c3dad00cd928b32ca61a047430e8984c4969915015a79`). La prueba Android del ajuste actual sigue pendiente. En ese corte, el contador funcional era **56/65, 9 pendientes**; ninguno de los pendientes de wallet real queda aprobado por esa revisión de código.
2. **Pago no equivale a compra activada:** la wallet puede enviar una transacción a las direcciones configuradas, pero no hay orden backend, detección/confirmación on-chain, idempotencia ni conciliación. Un hash local no debe activar un minero ni saldo.
3. **Destinos de recepción:** las direcciones se presentan en la UI por red; no se probó en Solflare que el Bridge acepte cada una, el token de destino o la conversión final. El 1% y el USDT neto son estimaciones, no confirmaciones.
4. **Rutas genéricas:** Perfil, amigos, royalties y otras áreas pueden abrir como placeholders. El resultado 56/56 solo significa “carga una pantalla”.
5. **Fuentes externas:** Pool/operaciones son de Kryptex/Pearl. No hay workers, granjas ni telemetría propia; la calculadora de operador usa supuestos del usuario y valores de escenario.
6. **Visual y accesibilidad:** la tabla de Operaciones ya tiene vistas y skeleton móvil REA a 390/768 px, y el modal móvil tiene evidencia previa a 390 px. No se hizo una inspección visual integral de Inicio/Carteras/Operaciones y todas las rutas a 390/768/1440 px ni al 100% de zoom.

## Archivos para visualizar y auditar

- [Checklist de 65 verificaciones](./gomining-replica-checklist.md)
- [Este informe interactivo](./gomining-replica-audit-interaccion-2026-11-01.md)
- [Informe REA con Evidence IDs](./gomining-replica-audit-REA-2026-11-01-cierre.md)
- [Seguimiento de REA, Firebase y límites](./gomining-replica-audit-2026-11-01-seguimiento.md)
- [Mapa de rutas](./src/catalog.ts)
- [Esquema y límites de Firebase demo](./firestore-schema.md)

## Compilación

`npm run build` terminó con código 0 después de los últimos cambios de interfaz y MetaMask. Vite transformó 553 módulos; el chunk `index.esm-BFHQ7gaW.js` mide 695.66 kB (181.51 kB gzip), por encima del aviso de Rollup de 500 kB. Es una advertencia de tamaño, no un error de compilación.

## Auditoría complementaria de Unilevel e ingresos de GPU · 1-nov-2026

- **Unilevel:** REA/Linux analizó estáticamente el ejemplo `unilevel-ejemplo/1nvezt` (evidencia `ev_44099cee80357648da18fcdfcb629b40c11be01db2738f50ef08935275e9b581`, módulo `distribution-handler.js`: `ev_84dc5ddc8079a771c0cdfb253826dcf8c7ac39cca195f2a43242dc0a03828d5f`). Ese ejemplo distribuye una venta completada de tokens con un fondo fijo de 20,000 tokens y pesos invariables de diez niveles; guarda asignaciones sin beneficiario y evita reprocesar la misma venta. No calcula el 20% de ingresos netos de minería ni es el backend de la réplica. La fórmula del Unilevel minero que aparece en el panel sigue siendo un escenario demo.
- **Ingresos GPU:** una auditoría de lectura de la hoja observó valores introducidos en la pestaña `GPUs`, no fórmulas. El parser del Apps Script esperaba una respuesta-array; la consulta de Kryptex en esa auditoría devolvió un objeto. Para 300 TH la lectura dio aproximadamente USD 5.72/día, que es una estimación de ese instante. No se editaron celdas ni se acreditó ingreso a una cuenta; sin shares y payouts verificados, no debe liquidarse como deuda al minero.
- Estos dos resultados no cambian el conteo de **56/65** ni cierran backend, verificación de pool, workers o liquidaciones.

## Actualización de viewport y menú móvil — 1 de noviembre de 2026

Se revisaron Inicio, Carteras y Operaciones a 390 × 844, 768 × 1024 y 1440 × 960 px en una pestaña de auditoría aislada. Ninguna ruta presentó desbordamiento horizontal del documento. En Operaciones, las pestañas conservan desplazamiento horizontal interno para no comprimir sus nombres; el resto de la página no se mueve lateralmente. El menú de navegación móvil quedó en una columna, con categorías legibles y sin ensanchar el encabezado. Se verificó que el encabezado muestra una sola entrada de conexión, saldo demo, carrito y perfil; no hay notificaciones duplicadas. Esta pasada confirma adaptación en esos tamaños, pero no sustituye la comprobación explícita al 100% de zoom de todas las rutas.

En el corte que documenta esta sección, MetaMask Connect estaba configurado con `mobile.useDeeplink: false` para seleccionar el Universal Link HTTPS MWP. Esa configuración fue reemplazada después por `mobile.useDeeplink: isMobileBrowser()`, que vuelve a usar el deeplink nativo solo en móviles y conserva HTTPS en escritorio. No se usa `/dapp/`. El estado vigente sigue requiriendo prueba en teléfono con HTTPS público sin interstitial. La evidencia REA citada abajo corresponde al corte anterior y no debe leerse como análisis de la configuración vigente; la pasada actual está registrada en la adenda final del [informe de cierre](./gomining-replica-audit-completa-2026-11-01.md).

## Smoke aislado de reglas demo — 1 de noviembre de 2026

Se transpuso `src/demoStore.ts` en memoria con `esbuild` y se ejecutó en un módulo Node aislado. Pasaron 11 aserciones: estado inicial aislado; recarga demo; compra demo con descuento de saldo y creación de minero/worker; potencia base del worker; suscripción mensual y bonus exacto del 1%; texto de cola de retiro con y sin suscripción; recompensa directa del 10%; asignación y recibo de preventa; exclusión de `ownerWallet` al serializar para persistencia; y rechazo de entradas inválidas. El estado final se descartó con el proceso.

Este smoke no pulsa la interfaz, no prueba su cableado de botones, ni llama a Firebase, RPC, proveedor de wallet o red. Por eso no cambia el conteo de aceptación visual/funcional de 37/65 y las casillas correspondientes a recorridos de demo siguen abiertas hasta probarse desde la app aislada.

## Adenda de estados de carga y error de pool — 1 de noviembre de 2026

Para la casilla de lecturas de pool se creó una escena desechable en `127.0.0.1:5174`; un middleware temporal interceptó solamente GET `/api/pool/*`, esperó siete segundos y devolvió HTTP 502.

- En `/data-centers/pool`, CUA observó el botón `Consultando…` deshabilitado durante la lectura y el componente `Ingreso bruto estimado` en carga. El código de `MiningMetric` muestra `MetricValueSkeleton` cuando `loading` es verdadero. Tras el 502, se mostraron `Falló la lectura simulada de pool.` y el aviso de lectura fallida; `Actualizar ingreso` volvió a estar habilitado.
- En `/data-centers/operations`, CUA observó `Cargando historial de pagos` durante la consulta. Tras el 502, desapareció el estado de carga, se mostró el error y quedó habilitado `Actualizar`.
- La revisión de código confirmó que ambos botones disparan su mecanismo de refresco. Las pestañas temporales se cerraron, se retiraron los dos archivos de configuración de auditoría y el puerto 5174 quedó cerrado; el Vite principal en 5173 siguió escuchando.

En ese corte posterior a la prueba de errores de pool, el checklist quedó en **55/65 confirmadas; 10 pendientes**. Es una verificación de interacción con CUA y lectura de fuente, no evidencia REA. No se probaron solicitudes reales de wallet, pagos o Firebase en esa escena; la adenda visual posterior llevó el estado a 56/65.

## Adenda de legibilidad a escala predeterminada — 1 de noviembre de 2026

En una pestaña CUA aislada se abrieron y capturaron Inicio, el configurador, la revisión de compra, el modal de recarga, Carteras, Pool y Operaciones. El viewport reportado fue 1280 × 720; `devicePixelRatio=1` y `visualViewport.scale=1`. Las capturas mostraron jerarquía legible a esa escala y no indicaron desbordamiento horizontal. El modal de compra y la recarga se desplazan verticalmente dentro de su panel y mantienen visibles sus controles de cierre y acción. Esto se registra como CUA + lectura de DOM, no como nueva captura REA; no cubre todas las rutas ni cada ancho. El estado vigente en ese corte fue **56/65**, con **9 pendientes**.

## Adenda de compra/recarga y compatibilidad de red · 1-nov-2026

En la pestaña Brave del usuario se comprobó el flujo ya conectado, sin usar controles de firma:

- **Compra:** Inicio → Crear minero → revisión → el panel detectó la conexión existente, permitió continuar al checkout y seleccionó MetaMask.
- **Recarga:** el diálogo indicó “Wallet detectada · MetaMask”; el botón “Pagar con MetaMask” abrió el checkout común con esa misma wallet seleccionada.
- **Red incompatible:** al cambiar de Ethereum a Solana, el checkout seleccionó Solflare y explicó “Está conectada MetaMask. Para esta red conecta Solflare”, con el botón “Conectar Solflare”. No conecté otra cartera.
- **Cierre:** cancelar el checkout devolvió a Inicio. La cotización de una de las pantallas expiró; el pago quedó deshabilitado y no se actualizó.

No se pulsó **Pagar**, no apareció una solicitud en MetaMask, no se firmó ni se transmitió ninguna transacción, y el identificador de la wallet no se copió a este informe. La casilla de reutilización de conexión y compatibilidad de red se marca como comprobada en UI local; la conexión/rechazo de cada proveedor y los pagos reales siguen pendientes. En ese corte, antes de añadir dos casillas, el conteo era **57/65; 8 pendientes**; el checklist vigente en ese momento pasó a 59/67. Esta observación es CUA sobre el navegador local; no es una nueva Evidence REA ni una prueba móvil.

## Actualización REA: pagos simulados y Firebase CLI — 1 de noviembre de 2026

Con Chromium temporal a 390 × 844 px ejecuté cuatro flujos controlados usando una wallet falsa disponible solo con `?gmWalletTest=...` en localhost y en desarrollo:

- **Compra de minero:** avanzar al checkout y rechazar un envío con el fixture; REA observó la notificación de cancelación, el modal cerrado y URL `/home`, sin recibo (`ev_b530e05439cd11d4c19d83b5844e031a970b028bb45231371ccbe39ea8c84f`).
- **Recargar:** abrir el checkout desde el botón Recargar, conectar el fixture y rechazar; el checkout mostró la notificación y no produjo recibo (`ev_a6adf1e07670f1e7ef2ab1ec622b29d495ded317289cb0c2060af2114cabbb7c`).
- **Comprobante de QA:** el hash mostrado lleva la etiqueta TEST y se identifica como ficticio; el estado de origen queda sin verificar y Bridge pendiente (`ev_23d1b94ef1f11eb913169b2195c7d6366c0c9aa384028c3f6f6018f8583463a2`).
- **Dirección y desconexión:** se vio la dirección de prueba en la cabecera y, tras pulsar Desconectar, la cabecera volvió a `Conectar una wallet` (`ev_67ec330f77cd54ede39bab7d652af9a2ca60436ec1098d64cc4ccaa9c68103dc`).

Los cuatro perfiles finalizaron con `terminated-owned-process`. La cuenta es sintética; no se abrió una wallet real ni se firmó/transmitió. Por esto, la auditoría da por comprobadas las rutas UI con proveedor simulado, pero deja pendiente la conexión real, móvil y el recibo on-chain. El checklist actualizado en ese corte quedó en **62/67, 5 pendientes**; después de probar el cierre en conexión pendiente y contrastar las capturas de Bridge, el estado vigente es **64/69, 5 pendientes**.

Después de tu autorización, `firebase projects:list --json` confirmó en modo lectura que `salad-miners` está activo. No cambié la configuración de Firebase ni desplegué funciones en esta actualización. El build de producción pasó; el marcador `gmWalletTest` y el proveedor simulado no aparecen en `dist/assets`.

