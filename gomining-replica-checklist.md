# Checklist funcional — réplica GoMining

**Estado vigente tras la integración Reown AppKit y optimización anti-freeze — 3-nov-2026:** 74/77 cumplidas. Conexión de wallets dual (Directa EIP-1193 / Solana nativa para extensiones sin intermediarios y Universal Reown AppKit con WalletConnect v2 y Project ID configurado para móviles). Se corrigió la saturación de CPU y bucles de reconexión de Brave Shields configurando TanStack Query con `retry: 0` y memoizando `useWalletSession`. Se implementó el checkout para 4 cadenas (BSC, Ethereum, Polygon, Solana) con opción nativa y USDT, recargo de comisión del 1.5%, enlaces directos al explorador de bloques, flujo post-pago hacia el Personalizador Visual de Mineros (`/miners/:minerId/customize`), motor de simulación de minería persistido en Firestore y selector de tema claro/oscuro. Build y preview verificados al 100%. Consulta el [informe de auditoría móvil](./gomining-replica-mobile-wallet-audit-2026-11-03.md).
**Reconciliación con el checklist adjunto de 64 puntos:** el archivo compartido era una captura anterior con 10/64 casillas marcadas (54 sin revisar en ese momento). La auditoría posterior actualizó los requisitos originales y añadió comprobaciones de navegación, wallets, Bridge y persistencia demo. El corte anterior fue 69/76. La instrucción “Marca `[x]` al completar…” es texto, no una casilla del checklist; el archivo adjunto no refleja el avance posterior. El desglose está en [el informe detallado del 2 de noviembre](./gomining-replica-audit-2026-11-02.md) y [el informe de rutas](./gomining-replica-audit-completa-2026-11-01.md#auditoria-de-rutas-directas-y-navegacion-1-nov-2026).
**Base local:** `http://127.0.0.1:5173`  
**Preview local:** `http://127.0.0.1:4174`  
**Preview REA de referencia:** `http://127.0.0.1:5184` y [HTTPS temporal para probar en móvil](https://luis-reach-award-publicity.trycloudflare.com/home). El túnel Quick Tunnel es temporal y público; la URL puede cambiar al reiniciarlo. En la revisión final el enlace devolvió HTTP 200 y el título `GoMining · réplica local`. REA abrió el configurador a 390 × 844 px, restauró un checkout desde `gmPay` y comprobó que la X lo cierra y limpia esos parámetros; los perfiles terminaron con `terminated-owned-process`. Evidencia de cierre: `ev_282d93b555ff50a8a19c3dad00cd928b32ca61a047430e8984c4969915015a79`. La ida/vuelta de Firebase se verificó por separado en una sesión aislada de `localhost:5173`; las capturas REA no confirman por sí mismas el estado remoto de Firebase.  
**Catálogo de rutas:** [`src/catalog.ts`](./src/catalog.ts)  
**Guía de ingeniería inversa:** [`gomining-replica-guide.md`](./gomining-replica-guide.md)  
**Informe detallado REA actual:** [`gomining-replica-audit-2026-11-02.md`](./gomining-replica-audit-2026-11-02.md) · [informe histórico completo](./gomining-replica-audit-completa-2026-11-01.md)  
**Seguimiento de cierre y Firebase:** [`gomining-replica-audit-2026-11-01-seguimiento.md`](./gomining-replica-audit-2026-11-01-seguimiento.md)  
**Auditoría interactiva del checklist:** [`gomining-replica-audit-interaccion-2026-11-01.md`](./gomining-replica-audit-interaccion-2026-11-01.md)  
**Informes anteriores:** [`gomining-replica-audit-2026-11-01.md`](./gomining-replica-audit-2026-11-01.md) · [`gomining-replica-audit-2026-10-31.md`](./gomining-replica-audit-2026-10-31.md)

**Nota de alcance:** se confirmaron 70 de 77 verificaciones combinando recorridos UI, simulaciones demo, proveedores EIP-1193 falsos limitados a QA, capturas aportadas por el usuario, documentación oficial, evidencia de código, pruebas Firebase y la retirada del enlace `/dapp/` de MetaMask móvil. No equivale a 70 pruebas de integración ni a funciones de producción. Los proveedores falsos no llaman una wallet real ni transmiten; sus comprobantes llevan un aviso de QA. Además se ejecutó un smoke aislado de 11 reglas de `demoStore.ts` en memoria; ese smoke no se suma al conteo: no escribió en Firebase, no conectó wallets ni envió pagos. El detalle está en el [informe REA del 2 de noviembre](./gomining-replica-audit-2026-11-02.md), la actualización del [informe interactivo](./gomining-replica-audit-interaccion-2026-11-01.md#smoke-aislado-de-reglas-demo) y el [informe REA completo](./gomining-replica-audit-completa-2026-11-01.md).

**Validación tras autorización de Firebase CLI — 1-nov-2026:** el CLI autenticado enumeró `salad-miners`; `firebase deploy --only auth` confirmó `Auth providers enabled: anonymous` y `firebase deploy --only firestore:rules` confirmó que las reglas restringidas estaban vigentes. Tras habilitar Auth se probó el inicio anónimo y se eliminó inmediatamente la cuenta temporal. En una sesión aislada de `localhost:5173`, USD 1 demo se guardó, sobrevivió a una recarga y mostró `Demo guardado`. `functions:list` terminó con error genérico, por lo que no se infiere si hay Functions remotas. La configuración Firebase de la réplica no enlaza un codebase de Functions; el código de `unilevel-ejemplo/1nvezt` pertenece a un producto separado y no se ha validado para este checkout. No se imprimieron valores de `.env.local` ni se tocó la sesión de trabajo `127.0.0.1`. Una captura REA anterior tuvo `cleanup_incomplete`; no se repitió la escena ni se abrió otro perfil. Siguen pendientes las pruebas con wallet real, el mapeo Bridge y el backend de pagos.

**Comprobación de autorización CLI — 2-nov-2026:** la sesión Firebase CLI autenticada enumeró `salad-miners` como proyecto actual. `functions:list` devolvió `Failed to list functions for salad-miners`; no permite concluir si existen funciones remotas. Esta verificación fue de lectura; no desplegué cambios. La configuración Firebase de la réplica contiene Auth anónimo y Firestore, pero no un codebase de Functions. El subproyecto `unilevel-ejemplo/1nvezt` sí incluye Functions de ventas/pagos de otro producto, con configuración independiente; no está integrado ni verificado para estos cobros.

**Validación de errores de pool — 1-nov-2026:** en un servidor Vite desechable en el puerto 5174 se interceptaron únicamente lecturas `/api/pool/*`, se demoraron siete segundos y se respondió HTTP 502. En `/data-centers/pool` apareció el skeleton de `Ingreso bruto estimado` y el botón `Consultando…`; al fallar, se mostró `Falló la lectura simulada de pool.` y quedó habilitado `Actualizar ingreso`. En `/data-centers/operations` se vio `Cargando historial de pagos`; al fallar apareció el error y quedó habilitado `Actualizar`. CUA comprobó el árbol accesible; el código vincula los controles a `refresh`/`setRevision` y muestra `MetricValueSkeleton` durante la carga. La escena no usó REA, Firebase, una wallet ni la fuente de producción. Se cerraron sus pestañas, se eliminó la configuración temporal y se confirmó puerto 5174 cerrado mientras 5173 permaneció activo.

**Validación de legibilidad a escala predeterminada — 1-nov-2026:** CUA inspeccionó Inicio, configurador, revisión de compra, recarga, Carteras, Pool y Operaciones en el navegador integrado a 1280 × 720; `devicePixelRatio=1` y `visualViewport.scale=1`. Las capturas mostraron texto legible y sin recorte horizontal; los modales conservan su desplazamiento vertical. No se cambió el zoom del navegador ni se modificó la vista principal. La revisión no cubre todas las rutas ni todos los tamaños.

**Revalidación del build y las URL — 1-nov-2026:** `npm run build` pasó (`tsc -b && vite build`, 563 módulos); queda un aviso de Rollup por el chunk de Solana de 695.66 kB. Se obtuvieron HTTP 200 en 16 URL del mapa, incluida la ruta directa del configurador. Esto confirma el shell de la SPA, no el render o las acciones de cada pantalla; por eso no suma casillas al checklist.

**Comprobación REA de reanudación y cierre — 1-nov-2026:** en Chromium temporal a 390 × 844 px, se abrió una URL HTTPS con un checkout de prueba reconstruido desde `gmPay`, se esperó el título del checkout, se pulsó la X y se confirmó que el diálogo desapareció y que la URL quedó en `/home` sin parámetros de pago. Evidence `ev_282d93b555ff50a8a19c3dad00cd928b32ca61a047430e8984c4969915015a79`; cleanup `terminated-owned-process`. No hubo proveedor conectado ni llamada de pago. Esto verifica el cierre de la página tras reanudar el checkout; no equivale a rechazar un permiso dentro de MetaMask real.

**Comprobación REA de conexión pendiente y cierre — 1-nov-2026:** el proveedor EIP-1193 de QA dejó `eth_requestAccounts` sin resolver. En dos perfiles temporales, REA inició Connect Wallet y cerró el checkout una vez con **Cancelar/Cerrar pantalla** (`ev_12aec889b4dc50699d3e485f583f8c028fcb22b2d1c02cdc0d8166ea8d7bcab5`) y otra con la **X** (`ev_16781c6d439c4d9ceb251be8bacf0a280950461231501f2aa859cb85cf262d91`). En ambos casos el diálogo desapareció, los parámetros `gmPay` se limpiaron y no hubo errores de página. El aviso aclara que la solicitud podría seguir abierta dentro de la wallet. El fixture no transmitió ni solicitó pago; esto no sustituye la prueba de cancelación con MetaMask real.

## Checklist de reducción del MVP · 2-nov-2026

Este bloque registra la limpieza solicitada aparte de las 70/77 comprobaciones del checklist funcional.

- [x] El menú ya no presenta los grupos **Explorar** ni **Academia**.
- [x] Mercado/Marketplace y sus rutas relacionadas están desactivados; `/marketplace` y las rutas conocidas redirigen a `/home`. El código del componente se conserva para una fase futura.
- [x] La franja BTC/GOMINING de Inicio solo es informativa y quedó etiquetada `Referencia de precios · demo`; no ofrece acceso ni acciones de Marketplace (DOM REA `ev_e9d15833aa8278d710f21d6ff3666e9029f362d70defee3b4f391fb9259071e0`).
- [x] Carrito desactivado: no hay botón ni ruta que abra `PurchaseDialog`; su implementación queda dormida en código.
- [x] Tarjetas/Visa desactivadas en `/finance/banking-cards`; no se encontró dependencia de su ruta en otras secciones MVP. La categoría `Cards` de royalties de referidos se conserva porque describe recompensas, no una tarjeta financiera.
- [x] Simple Earn desactivado. `/finance/simple-earn/overview` conserva compatibilidad y redirige a `/finance/earn-summary`.
- [x] Fondos instantáneos (`/finance/instant-funds`) y Resumen de ganancias (`/finance/earn-summary`) permanecen accesibles.
- [x] `/operator-economics` redirige al calculador `/mining-calculator` (`ev_d50bed8f8b489370a67b6dc8a692e82ecf0357a81644a358a8d8a97bc99e765a`), que permite seleccionar equipos y consultar estimaciones BTC/USD públicas con costos editables. `/finance/simple-earn/overview` lleva a `/finance/earn-summary` (`ev_1913a7c8fbe29b4af7cef599f19c8a28d0c20949c6510e1e3c6c0baefdfcb360`).
- [x] Rifas, Ofertas, GoBoxes, Minero Bonus, Rareza, Solo Mining y Ranking de liquidez están desactivados. Se retiró además el enlace a Minero Bonus que seguía apareciendo dentro de Mineros.
- [x] Estado vigente: `/buy/GOMINING`, `/liquidity`, `/ve-tokenomics` y `/lock/ve-my-lock` redirigen a Inicio; `/lock/ve-voting` permanece accesible. La fila y las evidencias anteriores de Comprar GOMINING son históricas y quedaron sustituidas por la revalidación del 2-nov.
- [x] REA confirmó que siguen abriendo `/finance/instant-funds`, `/finance/earn-summary`, `/subscriptions`, `/data-centers` y `/lock/ve-voting`; también confirmó que el menú no contiene enlaces a las rutas desactivadas.

Evidencia de menú y Mineros: `ev_9ebb2d8d824d8ea34156b177959395d825d6bbc3400aabdc391467958dfef848`, `ev_20eaf02065029d8b7cefca19a516338abc665264c5842a95169a7dd1c3a5f7cc`. Redirecciones directas de comunidad y Academia: `ev_34d76f047ff41a19c70b5691e9a6b4c7b5df298f98ce7d10d10867100122ba6d`, `ev_b910ff20a8b5bde75836b2554777ea6132f2af0c5dbe8aff670fdf608eae9974`, `ev_58344757349e0f55496147a1752285fd7ebec4c2b56f90bfcc086bf3c2f5f6a1`, `ev_41da8c6e4454d88418cd8d6cd2c1d623e94a44007098ad5b38ed75344de85de1`, `ev_8ad12b6ac5352aef07310c2bdaaf8ce0350285eda939ae0a00a0328c4fda7868`, `ev_5e16947252cce95099222d288fdc8ce2596df497e1d7a3f438ee6568e9f827f6`, `ev_8a409544ee1b0482d8c08b2d4af7e6d61ca3d5c4e02dc14d1bc4edf621382430`. Rutas preservadas: `ev_73e370837d9486d444ba6e4be5e93ebe87529644be13580dc798f25044c3c302`, `ev_6625bb3f07e786260f743691918c5bbbc50b6be90d2545cb7aed2fd30cbe7a42`, `ev_7eaaad29496a5737b44edfe0c5e07280d6e2fe8192d3d643fe8c3f6e4ef8db7f`, `ev_1363a160370afed1cd80994b9c660ed22521e4ec220b45b1304095a7f40cb942`, `ev_58e0f03f1e3bcc209b0828a77221385b5e8b3463313a5542923b3a1ab148af2c`. Más detalle en [`gomining-replica-guide.md`](./gomining-replica-guide.md#addendum-simplificacion-del-alcance-mvp--2026-11-02).

## Cómo usar este checklist

- Marca `[x]` al completar el recorrido en tu navegador.
- `Código listo` indica que existe la función en la réplica; no significa que se haya probado con una wallet real.
- `Verificado` significa que se comprobó en navegador o por respuesta local documentada.
- `Demo` significa que solo cambia el estado local de la sesión.
- `Pendiente` significa que falta backend, fuente de datos, integración o validación.
- **No apruebes una transacción de Mainnet para probar la interfaz.** El checkout puede transmitir fondos reales después de que la wallet lo apruebe. Para revisar el detalle, abre la solicitud y recházala.

## Resultado del cierre REA del 1 de noviembre

La matriz punto por punto y los Evidence IDs están en el [informe de cierre actualizado](./gomining-replica-audit-completa-2026-11-01.md). `Cumple · REA` indica que se reprodujo esa interacción en el navegador temporal; `Código`, `Demo` y `Pendiente` no equivalen a un pago real probado.

| Área | Estado | Qué quedó comprobado | Qué sigue pendiente |
|---|---|---|---|
| Compra de minero | Parcial · interacción local + REA estática | Configurador → consentimiento → checkout. En un proveedor falso cuya promesa queda pendiente, la X y Cancelar cerraron la interfaz sin firmar ni transmitir. REA analizó estáticamente el código actualizado. | Proveedor real, recibo on-chain, verificación, conciliación y activación. Catálogo estático y fechado. |
| Cierre de checkout | UI verificada en reposo, con envío simulado pendiente y tras restaurar `gmPay`; wallet real pendiente | La X y Cancelar cerraron el modal; la X también cerró el checkout restaurado desde URL en REA a 390 × 844 px y quitó los parámetros (`ev_282d93b555ff50a8a19c3dad00cd928b32ca61a047430e8984c4969915015a79`). Un proveedor local falso mantuvo `sendPayment()` pendiente y la interfaz se cerró mostrando el aviso correcto. | No se probó con un prompt real de conexión ni un rechazo real. La página no cancela el diálogo que siga abierto dentro de la wallet. |
| Recargar | Saldo demo persistente y checkout verificados · REA | Añadir USD 42 demo → recargar página → saldo conservado; luego abrir checkout común y cancelarlo. | No conecté wallet ni acredité saldo real. Hace falta verificador de depósitos. |
| Cotizaciones | Seis redes vistas; vencimiento y refresco observados en navegador aislado | La cotización BNB mostró “vencida” tras 30 s; Actualizar solicitó otro valor y cambió el importe. El botón de pago depende de `quoteFresh` en el código. | No se forzó caída de la fuente con una wallet conectada; fees Bridge reales y depósito final no se verificaron. |
| MetaMask sin proveedor | Falla reproducida por REA y mensaje recuperable corregido | En perfil Chromium aislado, Connect sin proveedor inyectado falló antes de abrir wallet. El mensaje indica revisar que el dominio HTTPS sea accesible y aclara que no se envió pago. Evidencia `ev_c49c506f61a2fb3ec96ab95f2f4da297c0dd3fc12bd785b25596c6992b9dd614`. | No prueba la app móvil, apertura, retorno ni cancelación real. |
| Wallet en móvil | Configuración de handoff MetaMask, Solflare y Phantom en código; prueba física pendiente | MetaMask Connect selecciona el Universal/App Link HTTPS MWP en móviles. Solflare y Phantom usan Connect cifrado y envío preparado para aprobación en la app con retorno HTTPS; mocks verifican payloads/callbacks. REA restauró el checkout a 390 × 844 px (`ev_262dde8859959bece2ea32531379edf15f29914211de3fc6ae28e2d339554cd2`). | No se probó en teléfono la apertura/retorno, conexión, rechazo ni aprobación reales. UniSat móvil no está integrado. |
| Encabezado e iconos | Verificado en DOM y viewport de 390 px | Un acceso de wallet, saldo demo, carrito y perfil; no hay botones de notificación duplicados. La nueva escala móvil eleva a 12 px los metadatos que estaban por debajo. | La captura nueva cubre Inicio y checkout a 390 px; no repite la inspección completa de todas las rutas a 768/1440 px. |
| Suscripciones | Checkout mensual y cotización · REA, 390 × 844 | Se abrió **Pagar mensual con wallet · $29.99**; apareció el skeleton de cotización y después cargó el importe BNB. Evidencias: `ev_3c3f1b2478bcd39b5cde729bf0fd377eb3d83f2fdcace175259022a19cf6d4d5` y `ev_71a0c8a50e5d5b94486bbbfc0f18a9234ddee12d7e52eb18a03aab46c3ccb40a`. | No se conectó wallet ni se firmó. El +1%, retiro sin cola, renovación y activación tras pago son simulaciones/no ejecutadas. |
| Pool/operaciones | Historial público y paginación · REA | Se capturaron 56 pagos públicos y se avanzó a página 2 de 4. En la revisión nueva, 15 pagos aparecen como tarjetas accesibles a 390 y 768 px; la tabla queda para escritorio. Evidencia REA: `ev_5eccfe4e…` y `ev_b9308445…`. | No son datos de una granja propia; workers y granjas no tienen telemetría real. Faltan otras rutas y vistas en revisión visual integral. |
| Referidos, economía y preventa | Demo/código | La implementación muestra escenarios y deja claro su carácter local. | No corrí todos los escenarios ni existe ledger/pago/campaña real. |
| Firebase y persistencia | Servicio, SDK y vuelta UI verificados | Auth anónimo y reglas están desplegados en `salad-miners`; REST y SDK Web validaron aislamiento, escritura y lectura. En una sesión aislada de `localhost:5173` añadí USD 1 demo; apareció `Demo guardado` y, tras recargar, se restauraron USD 1. | La comprobación no modificó la sesión de `127.0.0.1`. Pagos reales siguen sin verificador ni conciliador. |

**Revisión interactiva complementaria — cortes históricos:** el primer corte tuvo **36 de 65** recorridos confirmados y **29 pendientes**. Los cortes posteriores de 59/67, 62/67, 64/69, 66/73, 67/74, 68/75 y 69/76 son históricos. Los mocks de handoff cifrado Solflare y Phantom acreditan solicitudes y respuestas simuladas; el total vigente es **70/77**, con siete pendientes. También registra brechas de cobertura de tokens y política KYC de terceros. Las casillas no equivalen a integración productiva. Ver el [informe detallado del 2 de noviembre](./gomining-replica-audit-2026-11-02.md) y la [matriz anterior](./gomining-replica-audit-completa-2026-11-01.md).

**Actualización incremental — 1-nov-2026:** REA/Linux encontró y se corrigió un desajuste en la detección de Trust Wallet: el proveedor bajo `window.trustwallet.ethereum` no siempre trae los metadatos EIP-6963 que el selector esperaba. Ahora se etiqueta esa inyección directa como Trust Wallet y se detecta también en el navegador integrado móvil. Build correcto. La revisión REA de dos archivos fuente terminó sin errores de parseo; el detalle y sus límites están en el [seguimiento](./gomining-replica-audit-2026-11-01-seguimiento.md#actualización-incremental-rea--1-nov-2026). No se conectó una extensión ni una app móvil real; esa comprobación sigue pendiente.

**Actualización de interacción móvil y cierre — 1-nov-2026:** el checkout se abrió en viewport 390 × 844 px. Antes del ajuste, la X quedaba por encima del viewport al desplazarse al final; ahora queda fija y visible. Cancelar y X cerraron el checkout en reposo. Un harness temporal, retirado tras la prueba, usó un proveedor falso con `sendPayment()` pendiente: cerrar con X o Cancelar desmontó el diálogo y mostró el aviso de solicitud pendiente, sin llamar a una wallet real. El importe refrescado tolera cambios menores al 0.1%; cambios mayores, vencimiento o variación USD/MXN requieren volver a revisar. La cotización no se aprueba automáticamente. REA/Linux analizó siete archivos fuente actualizados (`ev_e7c570b1aa11b89102e89eedd481406fe3c28c8837785596d490af3b3b4206a`), 7 parseados, cero fallos de parseo, 421 hallazgos estáticos; cobertura parcial y 16 archivos sin seleccionar. `npm run build` pasó. No se conectó ni se probó una wallet real; los deeplinks requieren HTTPS y validación en teléfono.

**Actualización REA de checkout móvil — 1-nov-2026:** Inicio y el pago mensual se recorrieron en preview a 390 × 844 px. REA capturó el loader esquelético específico del checkout, la X visible y después el importe BNB cargado. Evidencias: Inicio `ev_7ac451ef72995ef030dc401f5ea5f0fe7851a45e072b8c8524d52bdf503f4cb2`; skeleton `ev_3c3f1b2478bcd39b5cde729bf0fd377eb3d83f2fdcace175259022a19cf6d4d5`; cotización completa `ev_71a0c8a50e5d5b94486bbbfc0f18a9234ddee12d7e52eb18a03aab46c3ccb40a`. No se conectó una wallet, no se pulsó Pagar y no hubo firma ni envío. Inicio mostró `Conectando guardado demo…`; esa pantalla no confirma el resultado de Firebase ni si se creó una sesión anónima. El flujo móvil real sigue pendiente de teléfono y dominio HTTPS estable.

**Actualización de Operaciones móvil — 1-nov-2026:** la tabla del historial ahora se transforma en tarjetas con fecha, estado, importe, comisión, enlace Pearl y botón Copiar en anchos de hasta 900 px. El skeleton de carga tiene una estructura de tarjetas equivalente. REA capturó 15 registros y una lista accesible, sin exponer la tabla a 390 × 844 (`ev_5eccfe4e546bb27997b66e4b999039ca2debacdabf728e74c7ddd5012419b0de`) y 768 × 1024 px (`ev_b9308445ef0966d2822339314111c3bfa614300a125efb1a1e3c9a7d76354f02`). A 1280 px una lectura del DOM mostró tabla visible con 15 filas y tarjetas ocultas. La compilación pasó. REA/Linux analizó estáticamente `App.tsx` y `Skeletons.tsx`: `ev_4511b4eff6505f67e0e45b0a9ba3e919d8bffc3156db75c414c5d82fe359d52c`, 24,325 nodos AST, 263 hallazgos, cero errores de parseo; un archivo inventariado no fue seleccionado y la cobertura semántica sigue parcial. Capturas conservadas en [390 px](./.rea-mobile-audit-2026-11-01/operations-390.png) y carpeta `.rea-mobile-audit-2026-11-01`.

**Registro de configuración móvil anterior — MetaMask/Firebase, 1-nov-2026:** en ese corte el usuario reportó que `/dapp/` abría un navegador interno en blanco, así que se retiró ese flujo para MetaMask. Carteras y checkout invocaban `@metamask/connect-evm`; `client.connect({ chainIds })` usaba el deeplink nativo (`mobile.useDeeplink: true`). El checkout agregaba el estado no sensible `gmPay` a la URL antes del salto. La restauración se confirmó con REA; no se abrió la app ni se autorizó una conexión real. `npm run build` pasó. REA CLI 6.8.0 analizó seis módulos de `src` sin errores de parseo (31,860 nodos AST, 365 hallazgos); evidencia padre `ev_155313638a0cd547812aeadc92495936c02d8f81980479b5a472a397c3ee43d4`, resumen `ev_5d79d2da0d8911c6685d53b42167dc423f772531ae69a76196ce0ccf99ea6e6b`. La cobertura fue parcial y no probó Android. El dominio ngrok respondía con `ERR_NGROK_6024`; para probar el retorno se inició un HTTPS temporal sin esa intersticial. REA abrió el configurador y restauró `gmPay` a 390 × 844 px (`ev_a05448b8e41650438bba29e38b0e0d672a3c775436c3d15a9860ad6a8e8e7b6c`, `ev_262dde8859959bece2ea32531379edf15f29914211de3fc6ae28e2d339554cd2`). Esa configuración quedó supersedida por la corrección posterior descrita abajo. Auth anónimo, reglas Firestore y persistencia demo de `salad-miners` ya se habían probado; no se redeplegó Firebase en ese corte. Detalles en [`firestore-schema.md`](./firestore-schema.md).

**Revisión intermedia de MetaMask móvil y autorización Firebase CLI — 1-nov-2026:** la primera corrección posterior al reporte Android seleccionó `mobile.useDeeplink: true` en Android (`metamask://`) y Universal Link en iOS/escritorio. Esa configuración se sustituyó después por `mobile.useDeeplink: false` para seleccionar el Universal Link HTTPS MWP `/connect/mwp`; el estado y la evidencia actuales constan en §4. La evidencia REA de aquella revisión intermedia (`ev_8f3c7827986885a42e73daaa91ce21ab6e3edfea60d3a7cc2f66b04bace14a51`) fue estática, sin prueba de teléfono. Tras tu autorización, Firebase Auth anónimo y las reglas restringidas ya constan desplegados y probados en `salad-miners`; `firebase projects:list` confirmó el acceso mediante lectura. No se redeplegó Firebase ni se alteró la sesión de `127.0.0.1` en ese cierre.

En esta auditoría no se aprobó ni firmó ninguna transacción. El informe REA separa por requisito lo reproducido, el código, la demo y los bloqueos. El seguimiento adjunto registra el estado actualizado de `5173` y Firestore.

**Actualización de interfaz — 1-nov-2026:** Inicio, Carteras y Operaciones se recorrieron a 390 × 844, 768 × 1024 y 1440 × 960 px. Se corrigieron el ancho del menú móvil y el de la barra de pestañas de Operaciones; las tres rutas quedaron sin desbordamiento horizontal de página. Esto confirma el recorrido visual en esos anchos, no el zoom al 100% de cada ruta.

## Registro de auditoría anterior (histórico; reemplazado por el cierre REA)

Esta tabla resume el corte anterior a la corrección final de MetaMask móvil; no reemplaza las casillas de recorrido manual. “Verificado” corresponde a pasos concretos reproducidos en el navegador; “código” no significa prueba de dispositivo, firma o pago real.

| Área | Estado | Qué quedó comprobado | Qué sigue pendiente |
|---|---|---|---|
| Compra de minero | Parcial | Configurador → revisión → checkout; cotización y destino cargados. | Firma, recibo, conciliación y activación del minero. |
| Cierre de checkout | Verificado en reposo; corrección nueva en código | Cancelar, X y Escape lo cerraron sin solicitud pendiente. Ahora el rechazo de wallet también cierra el checkout con aviso; la X sigue disponible durante una solicitud pendiente. | No se volvió a probar con rechazo real de MetaMask. Cerrar la web no cancela una petición que la wallet no haya resuelto. |
| Recargar | Verificado hasta checkout | Cartera virtual → Recargar → Pagar con wallet abrió el checkout común. | Pago y acreditación automática de saldo. |
| Cotizaciones | Lecturas verificadas | Cargaron BNB, BTC, ETH, TRX, USDT/Solana y POL con precio, importe, destino configurado y vigencia. | Expiración/errores simulados, fees de Bridge reales y confirmación de depósitos. |
| Wallet en móvil | Handoff de MetaMask, Solflare y Phantom en código; falta prueba física | Solflare y Phantom usan `/ul/v1/connect` y `/ul/v1/signAndSendTransaction`, cifrado X25519/NaCl, retorno HTTPS y estado temporal de sesión. QA mocks cubrieron conexión/descifrado, transacción cifrada, firma de respuesta y rechazo de conexión. MetaMask Connect selecciona Universal/App Link HTTPS MWP en móviles. | No se probó en teléfono apertura, retorno, conexión, rechazo ni aprobación. UniSat móvil no está integrado. |
| RPC Solana | Fallback de lectura probado | Los dos endpoints oficiales devolvieron 403 desde este equipo; PublicNode respondió 200 y un blockhash reciente. No se emitió transacción. | RPC compartido sin garantía; no usar como infraestructura final de producción. |
| Encabezado | Cambios de código; revisión visual anterior | El JSX actual tiene un botón de wallet, saldo demo, carrito y perfil; no renderiza botones de notificación. El saldo y el menú dicen `Saldo demo` para distinguirlo de `Conectar wallet`. | No se pudo capturar la vista actual por Computer Use; revisar 390/475/768/1440 px y confirmar qué muestra el navegador. |
| Suscripciones, referidos, pool y granjas | Demo/lectura | El informe anterior contiene el recorrido de rutas y las fuentes públicas identificadas. | Reglas comerciales reales, activación, ledger, minería propia y telemetría. |
| Firebase y persistencia | Actualización posterior: conectada y vuelta UI verificada | La ejecución histórica de preview no tenía Firebase. En una sesión aislada `localhost:5173`, el flujo UI guardó USD 1 demo en `salad-miners`; `Demo guardado` apareció y el saldo reapareció tras recargar. Las pruebas REST/SDK remotas pasaron y las reglas limitan el snapshot por UID. | Esta prueba no modificó la sesión de `127.0.0.1`. No hay backend de órdenes ni conciliador. |

El recorrido adicional se hizo en Brave con viewport de 475 × 960 px; el contenido de la página midió 460 px de ancho y no mostró desbordamiento horizontal. No se abrió ni se aprobó una transacción en MetaMask, y no se transmitieron fondos. La compilación de producción pasó; Rollup mantiene un aviso por un bloque de Solana de más de 500 kB.

**Seguimiento de código y REA — 1-nov-2026:** se cierra el checkout cuando la wallet devuelve rechazo; el enlace móvil conserva wallet/red seleccionadas; saldo demo y wallet conectada tienen nombres distintos; se añadió un RPC alternativo de lectura; y la sincronización demo ya no debe sobrescribir una acción local si tarda su lectura inicial. `npm run build` pasa y el constructor de URL se probó localmente. Una captura REA inicial tuvo `cleanup_incomplete`; escenas posteriores abrieron, capturaron y cerraron sus perfiles temporales correctamente. No se afirma prueba móvil ni rechazo real de MetaMask. Consulta el [informe detallado actualizado](./gomining-replica-audit-completa-2026-11-01.md).

**Actualización de auditoría — 1-nov-2026:** Firebase UI guardó y restauró USD 1 demo en una sesión aislada de `localhost:5173`; no se alteró la sesión principal de `127.0.0.1`. Una nueva solicitud REA/Linux para ampliar el análisis de fuente excedió el límite del cliente de 450 s y no devolvió Evidence; se conserva como evidencia válida la revisión previa de ocho archivos y no se repitió la llamada.

**Actualización REA móvil y tipográfica — 1-nov-2026:** Inicio, configurador y revisión de compra se volvieron a capturar a 390 × 844 px. Se normalizaron 158 estilos de texto por debajo de 12 px en móvil: metadatos quedan en 12 px como mínimo; texto de lectura y controles usan 14 px. La captura muestra Inicio, precio/consentimiento y controles sin recorte visible. El botón de pago quedó deshabilitado porque el perfil temporal no tenía wallet conectada. REA pulsó la X accesible `Cerrar configurador`; el diálogo desapareció y la URL volvió a `/home`. Evidencias: Inicio `ev_6ebdd4fedaa0084c58edfb3bcc0b9241fa8c4b9a99d59ee9751f013531cda35d`; revisión `ev_89c34d3b593d6ec7996e68e71ad37efd2800fb6a0cfd7875821906935c37e97d`; cierre `ev_186f4edc8829898b29d9c3f02d937678f68589f9bb8890110ed5d2db6c73eb3b`. Los perfiles temporales terminaron con `terminated-owned-process`; no se conectó wallet, no se abrió un prompt de firma y no se pagó.

## 1. Inicio, navegación y diseño

- [x] Abrir [`/home`](http://127.0.0.1:5173/home) por URL y también desde el logo. Esperado: carga Inicio con saldo demo, acciones rápidas y tarjetas. Verificado en el navegador local; el logo vuelve a `/home`.
- [x] Desde Inicio, abrir Crear minero y confirmar que la URL termina en `/home?modal=paywall-create`. Esperado: aparece el configurador y se puede cerrar sin cambiar saldo. REA: `ev_168c4e79957698e3165b0a924710a07d9ef0f73b508ae2b24766ebad5ff33156`.
- [x] Revisar los accesos superiores, menú de secciones, perfil, carrito y wallet conectada. Esperado: cada vínculo abre su ruta local. Menú, Carteras, carrito abrir/cerrar y Perfil comprobados; Perfil lleva a una vista genérica parcial, documentada como faltante de funcionalidad.
- [x] Revisar Inicio, Carteras y Operaciones en viewport móvil (390 px), tablet (768 px) y escritorio (1440 px). Las tres vistas no desbordan horizontalmente; en Operaciones las pestañas se desplazan dentro de su propia franja. El menú móvil quedó en una columna y sin cortes. Ver informe de interacción actualizado.
- [x] Abrir Inicio, configurador/revisión de compra, recarga, carteras, pool y tablas al 100% de zoom del navegador. CUA comprobó esas siete vistas a escala predeterminada 1280 × 720 (`devicePixelRatio=1`, `visualViewport.scale=1`); las capturas mostraron texto legible y sin recorte horizontal. Los modales usan desplazamiento vertical. No equivale a una revisión de todas las rutas y tamaños.
- [x] Revisar el nuevo progreso de retos: avanza al crear mineros o activar suscripción demo y deja claro que no paga recompensas. Observado en estado demo; Inicio dice que los retos no otorgan recompensas reales.
- [x] Corregir y revisar la escala tipográfica móvil en Inicio y revisión de compra a 390 × 844 px. Metadatos desde 12 px; controles y texto de lectura a 14 px. REA: `ev_6ebdd4fedaa0084c58edfb3bcc0b9241fa8c4b9a99d59ee9751f013531cda35d` y `ev_89c34d3b593d6ec7996e68e71ad37efd2800fb6a0cfd7875821906935c37e97d`.
- [x] Revisar Inicio con la preferencia `reduced_motion` emulada en el perfil REA. CSS desactiva animaciones/transiciones decorativas; no se cambió la preferencia del sistema operativo del equipo.
- [x] Simular demora y fallo de lecturas de pool. En servidor aislado (puerto 5174) ambas lecturas `/data-centers/pool` y `/data-centers/operations` mostraron sus estados de carga; tras HTTP 502 apareció el mensaje recuperable y el control de actualización volvió a habilitarse. CUA + revisión del handler; no es evidencia REA ni se modificó el servidor principal.
- [x] Abrir cada ruta de [`src/catalog.ts`](./src/catalog.ts) directamente por URL. Esperado: renderiza la vista local; rutas incompletas deben mostrar claramente su estado demo/desconectado. Smoke de 56 URLs: todas cargaron después del skeleton; esto no certifica las funciones internas de cada ruta.

**Estado ya registrado:** se recorrieron 54 rutas del mapa, una variante de consulta (`/subscriptions?subscriptionType=platinum`) y la apertura directa de `/home?modal=paywall-create`. En un corte posterior se recorrieron 55 URLs directas: 54 claves de `screens` y la variante de suscripción; todas cargaron tras el skeleton. `/nft-rewards` redirigió a `/nft-rewards/solo`. Esto comprueba navegación y carga inicial, no la funcionalidad completa de cada pantalla. La revisión visual de todas las rutas y tamaños sigue pendiente. Ver el [informe de interacción](./gomining-replica-audit-completa-2026-11-01.md#auditoria-de-rutas-directas-y-navegacion-1-nov-2026).

**Revisión visual y de carga — 31-oct-2026:** REA recorrió 41 destinos del menú y abrió Inicio en escritorio y móvil, además de Carteras y Pool. Se corrigió el contraste global de encabezados y nombres de activos. La carga ahora compone skeletons por ruta con primitivas reutilizables para texto, botones, métricas, tablas, tarjetas y paneles; checkout, pool y economía muestran placeholders en los valores que esperan datos. La identidad de wallet tiene un skeleton compacto mientras se consulta una autorización ya concedida, con límite de espera para no dejar el botón cargando indefinidamente. El primer HTML selecciona una silueta por ruta antes de montar React y el error de renderizado tiene recuperación. La navegación de las rutas está cubierta; la revisión píxel por píxel de cada vista y los fallos de cada proveedor de wallet siguen pendientes.

**Prueba interactiva — 1-nov-2026:** en Brave a 475 × 960 se abrió el configurador, revisión y checkout; Cancelar, X y Escape cerraron la interfaz sin firma pendiente. Se probó una URL de reanudación; Recargar desde Cartera virtual abrió el diálogo y checkout común. Las cotizaciones de seis redes cargaron con importe, fuente, destino y vigencia. No se pulsó Pagar ni se probó en un teléfono. La conexión existente de MetaMask se dejó intacta. El informe actualizado contiene los detalles y los límites: [`gomining-replica-audit-2026-11-01.md`](./gomining-replica-audit-2026-11-01.md).

## 2. Crear y comprar un minero

Ruta: [`/home?modal=paywall-create`](http://127.0.0.1:5173/home?modal=paywall-create)

- [x] Abrir el configurador desde Inicio y comprobar que la X lo cierra y limpia `modal=paywall-create` (REA, 390 × 844; evidencia `ev_168c4e79957698e3165b0a924710a07d9ef0f73b508ae2b24766ebad5ff33156`).
- [x] Revisar los paquetes de compra única y los importes. Esencial, Clásico, Pro y Máximo visibles.
- [x] Seleccionar una potencia y verificar que moneda e importe coincidan con el catálogo capturado el 31-oct-2026. Esperado: compra única en MXN; catálogo fechado, sin sincronización en vivo con GoMining. Selección Esencial revisada; importe MXN 272.22.
- [x] Revisar opciones mensuales y personalizadas. Esperado: solo aparecen potencias/precios incluidos en el catálogo. Vistos cuatro planes mensuales y el deslizador personalizado 1–5,000 TH con 20 niveles; catálogo fechado.
- [x] Pulsar Continuar y revisar producto, potencia, precio y consentimiento antes de pagar. Se abrió la revisión sin aprobar ni firmar.
- [x] En móvil, cerrar la revisión con la X. REA confirmó que desaparece el diálogo y vuelve a `/home` (`ev_186f4edc8829898b29d9c3f02d937678f68589f9bb8890110ed5d2db6c73eb3b`); no había wallet conectada ni solicitud de pago abierta.
- [x] Abrir checkout, cambiar red y comprobar importe cripto, destino y vencimiento de cotización. Se recorrieron BNB, BTC, ETH, TRX, Solana USDT y POL; no se abrió una solicitud de wallet.
- [x] Probar rechazo de pago con proveedor EIP-1193 simulado en modo QA. REA abrió la compra del minero, conectó la cuenta ficticia, rechazó el envío y confirmó que el checkout se cerró sin recibo: `ev_b530e05439cd11d4c19d83b5844e031a970b028bb45231371ccbe39ea8c84f`. No sustituye el rechazo en MetaMask real (pendiente en §4).
- [x] Probar la vista del recibo con fixture QA: identifica hash ficticio, estado de transferencia de origen no verificado y Bridge pendiente; REA capturó `ev_23d1b94ef1f11eb913169b2195c7d6366c0c9aa384028c3f6f6018f8583463a2`. No existe transacción real asociada.
- [x] **No aprobar un pago real como prueba.** No se aprobó ni transmitió ninguna transacción durante la auditoría. Un hash enviado no crea una orden verificada, no acredita el saldo y no activa el minero.
- [x] Probar compra demo: se creó un worker marcado como demo, bajó el saldo demo y avanzó el reto. No hubo wallet ni pago.

**Estado:** el configurador y el envío firmado están en el código. Precios leídos del dashboard son estáticos/fechados. Activación de un minero pagado y conciliación automática están pendientes.

## 3. Recargar

Entrada: botón **Recargar** de [`/home`](http://127.0.0.1:5173/home) o [`/finance/wallets/virtual`](http://127.0.0.1:5173/finance/wallets/virtual).

- [x] Abrir Recargar, añadir USD 42 demo y comprobar que el saldo sobrevive a una recarga de página (REA; evidencia `ev_1eb8b5dd6686327d484f0759422794bfbbcf7d77893cf9df06034f7da4012081`).
- [x] Elegir pago con wallet. Esperado: abre el mismo checkout del comprador; REA abrió y canceló el checkout. No se conectó una wallet.
- [x] Rechazar el pago de Recargar con el proveedor EIP-1193 simulado en modo QA. REA confirmó checkout y aviso tras el rechazo: `ev_a6adf1e07670f1e7ef2ab1ec622b29d495ded317289cb0c2060af2114cabbb7c`. No se abrió ni aprobó una wallet real.
- [x] Usar “Añadir saldo demo”. El saldo cambió y sobrevivió a la recarga; queda persistido como estado demo local/Firebase anónimo, no como saldo real.
- [x] Revisar el camino de transferencia en código/Firebase: un hash/recibo no acredita saldo ni activa productos; la colección de demo no guarda direcciones ni recibos on-chain. No se envió una transferencia real.

**Estado:** flujo de recarga demo y apertura/cierre del checkout verificados; acreditación automática real pendiente. El saldo se conserva localmente y puede sincronizarse como demo en Firebase; si Firebase no está disponible, funciona el almacenamiento local.

## 4. Connect Wallet

Ruta: [`/gmt-wallets`](http://127.0.0.1:5173/gmt-wallets)

- [ ] Probar conexión/desconexión con cada proveedor instalado: Solflare, Phantom, MetaMask, Coinbase Wallet, Trust Wallet, TronLink y UniSat. En móvil, abrir la app o su navegador DApp no cuenta como conexión; en el navegador DApp todavía hay que pulsar **Conectar**.
- [x] Confirmar con el fixture de MetaMask que conectar expone solo la dirección pública, aparece en la cabecera y desaparece al desconectar. Recepción UI: `ev_23d1b94ef1f11eb913169b2195c7d6366c0c9aa384028c3f6f6018f8583463a2`; desconexión y estado `SIN CONECTAR`: `ev_67ec330f77cd54ede39bab7d652af9a2ca60436ec1098d64cc4ccaa9c68103dc`. No se verificó una wallet real.
- [x] Implementación: distinguir conexión aprobada, rechazada y fallida. En el checkout, rechazo explícito cierra el modal y avisa que no hubo pago; REA verificó la estructura actual del código, pero no simuló una extensión real.
- [x] Cerrar checkout mientras la solicitud de conexión permanece pendiente, con **Cancelar/Cerrar pantalla** y con la **X**, usando un proveedor falso que nunca responde. REA confirmó en ambos recorridos que el diálogo desaparece, se limpian los parámetros `gmPay` y no hay errores; evidencias `ev_12aec889b4dc50699d3e485f583f8c028fcb22b2d1c02cdc0d8166ea8d7bcab5` y `ev_16781c6d439c4d9ceb251be8bacf0a280950461231501f2aa859cb85cf262d91`. No se abrió ni firmó una wallet real.
- [ ] Probar en MetaMask real cancelar/rechazar la conexión. El usuario reportó que en ngrok MetaMask solo muestra Inicio; no se recibió permiso ni dirección. El botón de MetaMask Connect ahora se intenta en cualquier HTTPS público, incluido ngrok; el enlace al navegador DApp se mantiene como alternativa. Trust abre Browser/DApps con `trust://open_url`; su alternativa HTTPS también se muestra. Sin Project ID, Trust necesita que la réplica cargue dentro de Browser/DApps y que luego se toque **Conectar**. Falta comprobar en teléfono que la página carga, aparece el permiso, aceptar/rechazar funciona y regresa la dirección.
- [x] Mantener el permiso bajo una acción explícita del usuario. MetaMask Connect y Coinbase Wallet SDK solicitan al tocar **Conectar** en HTTPS público. Trust y TronLink primero abren su navegador DApp; después se pulsa **Conectar** dentro de la réplica. Los parámetros de retorno solo guardan el estado del checkout; no piden permiso automáticamente. Ningún enlace que solo abre una app autoriza una dirección.
- [x] Abrir compra o recarga. Esperado: se reutiliza la conexión; si el proveedor no es compatible con esa red, la pantalla pide conectar uno compatible. Verificado en Brave: compra y Recargar detectaron la conexión existente; al cambiar el checkout de Ethereum a Solana apareció “Está conectada MetaMask. Para esta red conecta Solflare” y el botón “Conectar Solflare”. No se conectó otra wallet ni se firmó.
- [x] Confirmar que no aparecen WalletConnect, Project ID, Rango, frase semilla ni clave privada. Carteras ofrece siete conectores directos; sin solicitud de secretos.
- [x] Registrar proveedores ausentes en el perfil aislado de auditoría: no había extensiones/proveedores inyectados; MetaMask falló de forma recuperable. Esto no describe las extensiones instaladas en el navegador personal.
- [x] Configurar MetaMask Connect con MWP para HTTPS limpio (`mobile.useDeeplink: false`); el toque explícito llama a `client.connect()`. En dominios ngrok gratuitos, abrir primero el DApp Browser y usar el proveedor EIP-1193 inyectado. No requiere WalletConnect Project ID ni firma para conectar. Build verificado; falta confirmar handoff, prompt, rechazo y retorno en teléfono. Fuentes: [MetaMask Connect](https://docs.metamask.io/metamask-connect/), [Quickstart](https://docs.metamask.io/quickstart/).
- [x] Implementar Solflare nativo móvil con el protocolo oficial cifrado: `/ul/v1/connect` devuelve dirección y sesión; `/ul/v1/signAndSendTransaction` envía el payload cifrado para aprobación nativa. La clave de cifrado y sesión quedan en `sessionStorage` de la pestaña y se eliminan al desconectar; no se guardan en archivos ni en Firebase. Un harness mock comprobó conexión/descifrado, payload de transacción, callback con firma, enlace de estado y limpieza de URL. No abrió Solflare, no firmó ni transmitió. Fuentes: [Connect](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect), [SignAndSendTransaction](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/signandsendtransaction), [cifrado](https://docs.solflare.com/solflare/technical/deeplinks/encryption).
- [x] Implementar Phantom nativo móvil con `/ul/v1/connect` y `/ul/v1/signAndSendTransaction`; conservar checkout en `gmPay`, sesión/clave temporal solo en `sessionStorage`, validar estado, descifrar respuesta, comprobar firma y mostrar recibo sin acreditar el producto. Harness mock de conexión cifrada, payload USDT SPL, callback aprobado y rechazo de conexión pasó. No abrió Phantom, firmó ni transmitió. El host de universal links se actualizó a `phantom.com`, según su documentación vigente. Fuentes: [deeplinks Phantom](https://docs.phantom.com/phantom-deeplinks/deeplinks-ios-and-android), [Connect](https://docs.phantom.com/phantom-deeplinks/provider-methods/connect), [SignAndSendTransaction](https://docs.phantom.com/phantom-deeplinks/provider-methods/signandsendtransaction), [cifrado](https://docs.phantom.com/phantom-deeplinks/encryption).

**Estado:** conectores directos implementados; la interacción móvil con apps reales sigue pendiente. MetaMask usa `@metamask/connect-evm` desde el botón de la réplica, en lugar de mandar solamente a su navegador DApp. Coinbase Wallet tiene el SDK oficial como alternativa a su proveedor inyectado; no requiere WalletConnect Project ID. Trust Wallet y TronLink abren la página en su navegador DApp y piden un segundo toque en **Conectar** cuando la réplica cargue allí. Trust Wallet desde un navegador móvil externo requeriría WalletConnect v2 y su Project ID; ese camino no se incluye. Solflare y Phantom usan handoff cifrado nativo. La conexión solo lee la dirección; no firma ni paga. X/Cancelar cierran la interfaz web aunque una solicitud real siga abierta en la app. Build verificado; faltan handoff, prompt, rechazo y retorno con cada app. El dominio ngrok gratuito añade un intersticial que puede impedir cargar la réplica en navegadores DApp. UniSat no tiene handoff móvil documentado. Fuentes: [MetaMask Connect EVM](https://docs.metamask.io/metamask-connect/evm/), [Coinbase Wallet SDK](https://github.com/coinbase/coinbase-wallet-sdk), [Trust Wallet deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [WalletConnect en Trust Wallet](https://developer.trustwallet.com/developer/develop-for-trust/mobile), [Phantom mobile connections](https://help.phantom.com/articles/29995498642195).

**Incidencia Android reportada — 2-nov-2026:** el usuario probó la revisión anterior y reportó un navegador interno vacío, sin autorización. La causa exacta no se confirmó; la revisión actual corrige el formato del deeplink y evita una solicitud automática al cargar, que ahora requiere pulsar **Conectar** dentro de la wallet. REA confirma solo configuración estática; no hay teléfono disponible para verificar la corrección. La incidencia permanece abierta hasta que se observe la pantalla de conexión en el dispositivo.

## 5. Cotización, red y recepción

- [x] En checkout, observar la vigencia y actualizar la cotización. La interfaz cambió a “vencida · actualiza antes de pagar” a los 30 s; Actualizar cotización solicitó otro valor y cambió el importe BNB. Se hizo en navegador aislado sin conectar wallet; no se envió.
- [x] Confirmar la barrera de cotización vencida: el checkout muestra el estado vencido y la condición de `Pagar` depende de `quoteFresh` en `src/WalletPaymentCheckout.tsx`. No se forzó un fallo de la fuente pública con wallet conectada.
- [x] Revisar las rutas BNB Chain, Bitcoin, Ethereum, TRON y Polygon. Esperado: red, activo y dirección configurados para esa ruta. Se revisaron junto a Solana.
- [x] En una ruta Bridge, comprobar que 1% aparece como **estimación** y que se distingue del gas que muestra la wallet. La interfaz muestra la estimación Bridge aparte; el gas queda a cargo de la wallet.
- [x] En Solana, comprobar que solo se ofrece USDT SPL directo y que se muestra el costo de red en la wallet. Se muestra el aviso de posible costo SOL si debe crearse la cuenta de token receptora. Una lectura RPC sin wallet el 1-nov-2026 había respondido HTTP 200 en tres endpoints desde el host de auditoría. Un sondeo posterior reprodujo `Origin` y las cabeceras de `web3.js` para `localhost:5173` y el HTTPS temporal: los dos RPC oficiales contestaron HTTP 403 al `POST getLatestBlockhash`; `solana-rpc.publicnode.com` respondió HTTP 200 y un blockhash en ambos orígenes. Se cambió el orden para probar PublicNode primero y mantener los otros dos como respaldo. El sondeo HTTP no sustituye una prueba en Chrome ni en el teléfono.
- [ ] Revisar el recibo después de una transacción existente; debe separar hash de origen y Bridge pendiente.
- [x] Comparar en las capturas de Solflare compartidas por el usuario los destinos de BNB Chain, Bitcoin, Ethereum, TRON y Polygon con la configuración de la réplica. Las cinco capturas muestran la red, el destino permanente y USDT como token de recepción; la comparación es visual y corresponde al momento de esas capturas, no confirma vigencia actual.
- [x] Verificar en la documentación oficial vigente de Solflare las redes Bridge, la regla de tarifas, el slippage y los mínimos: enumera Bitcoin, Ethereum, Arbitrum, BNB Chain, Polygon, Tron y Base; permite activos sujetos a liquidez; indica 0.1% para stablecoin→stablecoin, 1% para otras combinaciones y gas de origen aparte; límite de slippage 5%; mínimos variables por token y posibilidad de reembolso bajo mínimo/sin liquidez. Consultado el 1-nov-2026: [redes, tokens y tarifas](https://help.solflare.com/en/articles/17692897-bridge-supported-chains-tokens-and-fees), [FAQ](https://help.solflare.com/en/articles/17692854-bridge-faq) y [dirección permanente](https://help.solflare.com/en/articles/17692907-your-permanent-bridge-deposit-address-explained). Esto documenta el funcionamiento del servicio, no confirma los datos de tu cuenta.
- [ ] Antes de aceptar pagos reales, refrescar en Solflare una cotización para cada ruta y confirmar mínimo, fee, disponibilidad y neto vigente. Las capturas aportadas sí muestran BNB, BTC, Ethereum, TRON y Polygon con USDT como destino, y sus direcciones coinciden con la configuración; esa evidencia corresponde al momento de las capturas, no a la cotización actual. La documentación pública actual de Solflare fija 0.1% para combinaciones stablecoin→stablecoin y 1% para las demás combinaciones; el gas de origen va aparte y la disponibilidad depende de liquidez. Eso respalda el 1% estimado para los activos nativos listados hacia USDT, pero no confirma la cotización/minimum/neto de la cuenta. Solflare explica que la dirección permanente depende de la cadena origen y el token receptor. [Tarifas y activos](https://help.solflare.com/en/articles/17692897-bridge-supported-chains-tokens-and-fees) · [direcciones permanentes](https://help.solflare.com/en/articles/17692907-your-permanent-bridge-deposit-address-explained).
- [ ] Ampliar el checkout a todos los tokens compatibles de las cinco cadenas si hay una fuente de ruta/cotización verificable. La réplica hoy permite BNB, BTC, ETH, TRX y POL nativos, además de USDT SPL directo; no permite elegir tokens ERC-20/BEP-20/TRC-20 adicionales ni solicita una cotización Bridge por token. Solflare dice que puede aceptar muchos tokens si existe liquidez, pero advierte que la compatibilidad varía y un activo no soportado puede perderse. Sin una matriz/cotización actual no es seguro adivinar contratos, decimales o montos. [Activos, fees y liquidez](https://help.solflare.com/en/articles/17692897-bridge-supported-chains-tokens-and-fees) · [direcciones permanentes](https://help.solflare.com/en/articles/17692907-your-permanent-bridge-deposit-address-explained).
- [ ] Verificar las condiciones de KYC/eligibilidad de Solflare Bridge y de sus proveedores para las redes, región y montos que se usarían. La documentación oficial dice que crear y usar la wallet Solflare no requiere KYC; también dice que terceros aplican sus propias comprobaciones y que la elegibilidad depende de la región. No encontré una confirmación específica de que todas las rutas Bridge y sus proveedores estén libres de KYC; queda pendiente confirmar con Solflare para las redes y montos previstos. [FAQ de seguridad de Solflare](https://www.solflare.com/security/) · [Términos y elegibilidad](https://www.solflare.com/terms/)

**Estado:** cálculo spot y destinos configurados para monedas nativas. La documentación actual confirma redes, tarifas, slippage y mínimo variable; las capturas que compartiste confirman visualmente cinco destinos al momento de captura. Falta confirmar las direcciones/ruta en Solflare en vivo, compatibilidad de cada activo, mínimos y resultado de USDT. La réplica no implementa la matriz de tokens Bridge adicionales. Solflare afirma que crear y usar la wallet no requiere KYC; sigue sin confirmarse la elegibilidad/KYC de cada ruta Bridge y proveedor externo.

## 6. Suscripciones

Ruta: [`/subscriptions`](http://127.0.0.1:5173/subscriptions)

- [x] Probar la activación demo mensual: se descontó el importe demo y quedó un periodo de 30 días; no hubo pago recurrente.
- [x] Con workers demo activos, verificar el bonus de 1% de potencia mostrado en la granja/demo. Es una regla de simulación mientras dura la suscripción demo.
- [x] Probar retiro demo con y sin suscripción: la cola diaria simulada cambia según el estado; no se ejecutó un retiro real.
- [x] Confirmar que el plan anual sigue deshabilitado. La vista indica precio sin confirmar y no permite continuar con el anual.
- [x] Abrir el pago mensual y revisar el checkout; no esperar que un hash active automáticamente la suscripción. REA 390 × 844: skeleton y cotización BNB cargados; no se conectó wallet ni se pagó (`ev_3c3f1b2478bcd39b5cde729bf0fd377eb3d83f2fdcace175259022a19cf6d4d5`, `ev_71a0c8a50e5d5b94486bbbfc0f18a9234ddee12d7e52eb18a03aab46c3ccb40a`).

**Estado:** beneficio mensual simulado; no hay alta real, renovación ni activación tras pago. Anual deshabilitado por indicación del usuario.

## 7. Referidos y Unilevel

Ruta: [`/nft-referral`](http://127.0.0.1:5173/nft-referral)

- [x] Abrir resumen, recompensas y amigos: [`/nft-referral/rewards`](http://127.0.0.1:5173/nft-referral/rewards), [`/nft-referral/friends`](http://127.0.0.1:5173/nft-referral/friends). Resumen calculable; las otras vistas cargan como tabla demo vacía, sin datos privados.
- [x] En el simulador, usar una base después de costos y verificar 10% directo sobre el pago final al minero. Escenario observado: base elegible USD 833.33; 10% directo USD 83.33. Es simulación, no ledger.
- [x] Cambiar profundidad, pesos y cantidad de niveles superiores elegibles. Esperado: niveles sin referido elegible quedan retenidos. Se cambió la profundidad y un peso temporalmente; niveles fuera de profundidad se excluyeron y el reinicio restauró los valores.
- [x] Usar “Acreditar recompensa directa demo”: el saldo demo aumentó y se mostró recibo local.
- [x] Revisar que no existe pago real a referidos ni ledger de pagos conectado a Firebase; solo se conserva el estado demo permitido.

**Estado:** simulador local, máximo diez niveles. No hay distribución de fondos ni decisión comercial final para Unilevel.

## 8. Pool, pagos, workers y granjas

- [x] Abrir [`/data-centers/pool`](http://127.0.0.1:5173/data-centers/pool). Esperado: ingreso diario PRL de Kryptex identificado como estimación, con hora de consulta. Se cargó una estimación pública y hora de consulta.
- [x] Abrir [`/data-centers/operations`](http://127.0.0.1:5173/data-centers/operations). Esperado: lista paginada de pagos públicos de Kryptex y enlaces a transacciones Pearl. Se observaron 56 registros públicos, cuatro páginas.
- [x] Cambiar de página y abrir un enlace de transacción Pearl. No tomar el estado de la pool como prueba de conversión a USDT o pago a un comprador. Se abrió la página 2 de 4 y un detalle de transacción Pearl; ambos son datos públicos de la pool.
- [x] Abrir [`/data-centers/miners`](http://127.0.0.1:5173/data-centers/miners). Crear/activar worker demo y cambiar modo automático/manual. Etiqueta demo; no hay conexión de workers a Kryptex.
- [x] Abrir [`/data-centers/farms`](http://127.0.0.1:5173/data-centers/farms). Esperado: estado sin datos verificables, sin granjas ficticias. La vista informa que no hay datos del operador y no inventa ubicaciones ni capacidades.
- [x] Confirmar que el ingreso de Kryptex es una estimación y no se acredita como ganancia real de un worker.

**Estado ya verificado:** `/api/pool/payouts` devolvió dos páginas de 15 pagos en la lectura revisada; POST fue rechazado con HTTP 405. El recuento publicado puede cambiar. El ingreso diario y el historial de pagos son fuentes distintas.

## 9. Economía del operador

Ruta: [`/operator-economics`](http://127.0.0.1:5173/operator-economics)

- [x] Cambiar TH, W/TH, tarifa eléctrica, mantenimiento y costos auxiliares. Esperado: recalcula energía y costos. Escenario temporal: 400 TH, 10 W/TH y tarifa USD 0.10/kWh → 96 kWh/día y USD 9.60/día de electricidad; valores restaurados al final.
- [x] Cambiar ingresos mensuales por suscripciones/mantenimiento. Esperado: aparecen como valores de escenario, no como ventas conciliadas. La calculadora reflejó supuestos editables, sin afirmarlos como ventas.
- [x] Cambiar niveles Unilevel y comparar neto/pago/reserva. Profundidad y peso cambiaron el escenario; se restauraron las reglas originales.
- [x] Dejar costos sin dato. Esperado: el resultado no se presenta como margen real confirmado. Se mantuvo “Pendiente” hasta rellenar costos; después de restaurar vuelve a “Pendiente”.

**Estado:** calculadora en memoria con cotización PRL estimada; faltan costos, volumen y payouts verificados para conocer margen real.

## 10. Preventa

Ruta: [`/launchpad`](http://127.0.0.1:5173/launchpad)

- [x] Ingresar cantidad y precio en preventa demo, simular la asignación y revisar el recibo local; no se envió dinero.
- [x] Confirmar que tokens solo aparecen como asignación demo; no hay campaña, contrato ni emisión real.

## 11. Firebase y datos persistentes

- [x] Revisar [`firestore-schema.md`](./firestore-schema.md), [`firestore.rules`](./firestore.rules), [`firebase.json`](./firebase.json) y [`.firebaserc`](./.firebaserc).
- [x] Habilitar Auth anónimo y publicar las reglas restringidas de estado demo en el proyecto de prueba `salad-miners`.
- [x] Probar el servicio remoto con cuenta anónima temporal: autenticación 200; lectura propia sin documento 404 (permitida); lectura de otro usuario 403; escritura demo válida 200; lectura posterior 200; limpieza de documento y cuenta 200.
- [x] Probar el SDK Web de Firebase usado por la app: inicio anónimo, lectura, escritura con `serverTimestamp`, lectura de regreso y limpieza de la cuenta/documento temporales.
- [x] Confirmar en navegador el guardado/restauración desde la app tras añadir USD 1 demo y recargar (`localhost:5173`; sesión aislada de `127.0.0.1`).
- [ ] Implementar backend autenticado para órdenes, verificación de pagos, idempotencia, activación y auditoría antes de acreditar fondos o productos reales.

### Ajuste de Connect Wallet después del reporte “solo abre la wallet” · 2-nov-2026

- El fallo de MetaMask estaba en la selección del botón: aunque `client.connect()` existía, el botón principal priorizaba un deeplink `/dapp/` que solo navega al navegador interno. Ahora el botón principal ejecuta MetaMask Connect desde el toque; el deeplink `/dapp/` queda como alternativa manual.
- Trust Wallet ahora intenta primero `trust://open_url` y conserva el Universal Link HTTPS como respaldo. Ambos son navegación al DApp Browser; ninguno conecta por sí mismo.
- Quité las solicitudes de conexión ejecutadas en `useEffect` al cargar el regreso desde la wallet. En el DApp Browser la persona debe tocar **Conectar**; al aprobar solo comparte la dirección. **Pagar** sigue siendo una aprobación posterior e independiente.
- `npm run build` pasó (TypeScript + Vite, 945 módulos). Rollup conserva el aviso no bloqueante del chunk Solana de 695.66 kB. `git diff --check` pasó.
- REA/Linux no produjo captura: después de corregir el esquema de una petición inválida, el escenario de navegador terminó con `cleanup_incomplete` y sin Evidence. No repetí el escenario. `rea doctor` encontró la integración Codex alineada; `binary_session` reportó que no hay análisis binario abierto, pero no confirma la liberación del cleanup del escenario de navegador. No hubo teléfono ni proveedor MetaMask/Trust para verificar el prompt.

El checklist sigue en **70/77, siete pendientes**. La conexión móvil y el rechazo/aceptación solo se cerrarán al repetirlo en un teléfono y observar que la página carga dentro del navegador DApp, aparece el permiso y vuelve la dirección. Abrir la pantalla inicial de la wallet no es una conexión.

**Estado:** la nube de demostración está habilitada y sus reglas se probaron en el servicio real. El recorrido adicional de interfaz usó una sesión anónima aislada en `localhost:5173`: se añadieron USD 1 demo, la app indicó `Demo guardado` y el mismo saldo reapareció tras recargar. Esa sesión de prueba creó un snapshot demo en `salad-miners`; la sesión de trabajo en `127.0.0.1` no se tocó. Solo se sincroniza estado demo; no se guardan direcciones de wallet ni recibos on-chain. Los pagos siguen sin verificación ni activación automática; consulta el [seguimiento](./gomining-replica-audit-2026-11-01-seguimiento.md#firebase-y-persistencia).

## Registro de cambios de diseño solicitados

Añade una fila cuando observes algo que quieras ajustar; la revisión y el cambio de diseño se anotan aquí para mantener el historial.

| Fecha | Ruta | Qué observaste | Cambio solicitado | Estado / referencia |
|---|---|---|---|---|
| 2026-10-31 | `/home`, global | Diseño poco legible y no se sentía vivo | Sistema premium GoMining + Apple/Geist, mobile-first, animaciones, fallbacks, loaders y retos demo | Implementado en [`src/App.tsx`](./src/App.tsx) y [`src/styles.css`](./src/styles.css); build pasó. |
| 2026-10-31 | Plataforma completa, en especial checkout | Captura a 100% mostraba etiquetas de 8–10 px y obligaba a usar 150% | Escala tipográfica legible en todas las rutas y modales, controles grandes y reorganización móvil | Escala global y checkout actualizados; build pasó. La inspección visual posterior solo cubre viewport de 475 × 960 px; revisar otras anchuras y todas las vistas. |
| 2026-11-01 | Compra/recarga en móvil | La apertura previa de MetaMask dejó una pantalla en blanco | Abrir MetaMask mediante MetaMask Connect y conservar el checkout y la red | Registro del corte de ese día: se retiró `/dapp/` y `client.connect()` conserva la ruta en `gmPay`. La opción de transporte móvil cambió el 2-nov; consulta la fila vigente abajo. Falta probar Android. |
| 2026-11-01 | Checkout | X/Cancelar no cerraban después de salir de MetaMask | Permitir cerrar checkout y explicar que la solicitud de firma puede seguir abierta | X sticky, Cancelar, clic fuera y Escape habilitados incluso durante `sending`; cierre en reposo comprobado. No se probó con solicitud de firma pendiente; cerrar el checkout no cancela la solicitud en la wallet. |
| 2026-11-01 | Encabezado móvil | Dos iconos parecían wallets y dos parecían notificaciones | Separar visualmente wallet, carrito, notificaciones y promociones | Un acceso de wallet con dirección abreviada; carrito distinto; se eliminó la campana sin función y Promos se oculta en móvil. |
| 2026-11-01 | Inicio | El saldo demo podía confundirse con el saldo de la wallet conectada | Nombrar explícitamente el indicador como saldo demo | Etiqueta de Inicio actualizada a “SALDO DEMO”; se mantiene separado del acceso que muestra la dirección de wallet. |
| 2026-11-01 | `/finance/wallets/virtual` | Recargar abría una acción genérica | Enlazar Recargar al flujo de wallet común | Diálogo de recarga y checkout común verificados hasta antes de Pagar. |
| 2026-11-01 | Pago móvil con Trust Wallet | El deeplink usaba el ID de Ethereum también para BNB y Polygon | Abrir el navegador dApp con el ID de red correspondiente | IDs corregidos según documentación oficial; build correcto. Falta validación en un teléfono con Trust Wallet instalado. |
| 2026-11-01 | MetaMask móvil y cancelación de conexión | La ruta `/dapp/` abrió una pantalla en blanco; antes cancelar/X no cerraban siempre el checkout | Abrir la app nativa mediante MetaMask Connect y conservar controles de cierre | Se retiró `/dapp/`; el botón llama `client.connect()` y preserva el checkout en `gmPay`. X/Cancelar cierran el checkout mientras `session.connectingWallet` está pendiente y avisan que la solicitud puede seguir en la wallet. Build pasó; prueba Android real pendiente. |
| 2026-11-01 | Checkout móvil | Pagar desde la app móvil de la wallet | Abrir la app nativa con producto y red conservados | MetaMask Connect gestiona el handoff a MetaMask; Solflare, Phantom, Coinbase, Trust y TronLink conservan sus enlaces móviles. Sin prueba en teléfono; UniSat no está integrado. |
| 2026-11-01 | Checkout | La X podía quedar fuera de vista al desplazarse; cancelar MetaMask dejaba incertidumbre | Mantener cierre visible y explicar límites de una solicitud pendiente | X sticky en móvil; X/Cancelar y proveedor falso con envío pendiente verificados. La página no puede cancelar una aprobación abierta dentro de la wallet. |
| 2026-11-01 | Carteras y encabezado | Confirmar iconos repetidos y legibilidad en móvil | Auditar Inicio/Carteras/Operaciones en 390, 768 y 1440 px | REA ve un botón de wallet y cero botones de notificación; el rótulo Conectar se lee. Operaciones ahora muestra tarjetas a 390/768 px y tabla a 1280 px. La revisión visual del resto de rutas y la comparación completa a 1440 px siguen pendientes. Véase el [informe de seguimiento](./gomining-replica-audit-2026-11-01-seguimiento.md#actualizacion-rea-operaciones-en-movil--1-nov-2026). |

| 2026-11-01 | `/data-centers/operations` | El historial se cortaba y exigía scroll horizontal | Tarjetas móviles accesibles y skeleton de tarjetas responsive | Implementado y comprobado por REA a 390/768 px; tabla preservada en escritorio. |
| 2026-11-01 | Plataforma, Inicio y checkout móvil | Tipografía microscópica y etiquetas ilegibles al zoom 100% | Escala común de metadatos y texto de lectura en móvil | Override móvil: mínimo 12 px para metadatos y 14 px para controles/texto. REA 390 × 844: `ev_6ebdd4…`, `ev_89c34d…`; build pasó. Verificar todas las rutas a 768/1440 px. |
| 2026-11-01 | Firebase demo | El indicador mostraba un error genérico y el texto podía sugerir guardado persistente aunque fallara la nube | Persistir una copia segura en este navegador y sincronizar solo el estado demo propio | Auth anónimo y reglas de `salad-miners` están desplegados. Pruebas REST/SDK Web pasaron; una sesión UI aislada guardó USD 1 y lo restauró tras recargar. La sesión de trabajo `127.0.0.1` no se modificó. |
| 2026-11-01 | MetaMask móvil · configuración intermedia | El usuario reportó un navegador interno en blanco; la URL/esquema exacto de esa prueba no quedó registrado | Se comparó el Universal Link HTTPS MWP con el deeplink nativo | Fila histórica: en ese corte se seleccionó `mobile.useDeeplink: true`; el ajuste fue sustituido el 2-nov. La prueba en teléfono sigue pendiente. |
| 2026-11-01 | MetaMask Android · Universal Link intermedio | Se evaluó como alternativa durante el diagnóstico | Se probó `mobile.useDeeplink: false` en el SDK | Fila histórica: esa opción selecciona `https://metamask.app.link/connect/mwp`. Se volvió a seleccionar en el ajuste actual del 2-nov; la resolución en Android nunca se confirmó en dispositivo. Véase también [`gomining-replica-audit-2026-11-02.md`](./gomining-replica-audit-2026-11-02.md). |
| 2026-11-01 | MetaMask Android · estado vigente en ese corte | El usuario observó un navegador interno en blanco y quiere aprobar conexión y pagos en la app MetaMask | Probar el handoff Connect/MWP | Fila histórica: la opción `mobile.useDeeplink: true` se sustituyó el 2-nov por el Universal/App Link HTTPS móvil. La navegación en Android real sigue pendiente. |
| 2026-11-02 | MetaMask Android · configuración actual | Se revisó la pantalla blanca y el comportamiento del enlace nativo reportado | Seleccionar un App Link HTTPS para Connect/MWP y conservar `gmPay` al volver | `src/metamaskConnect.ts` usa `mobile.useDeeplink: !isMobileBrowser()`; REA estático inspeccionó el workspace (`ev_fca8030ec6d03a3836d545034975e83381ea9e8e4cd6ea2c8386f14dce05161d`). El build pasó. Solo se verificó fuente/configuración; faltan apertura, aprobación/rechazo y regreso en Android real. |

## Referencias de implementación

- Rutas y navegación: [`src/catalog.ts`](./src/catalog.ts)
- Pantallas y flujos: [`src/App.tsx`](./src/App.tsx)
- Carteras y envío: [`src/WalletPanel.tsx`](./src/WalletPanel.tsx), [`src/walletSession.ts`](./src/walletSession.ts), [`src/WalletPaymentCheckout.tsx`](./src/WalletPaymentCheckout.tsx)
- Precios y destinos: [`src/minerCatalog.ts`](./src/minerCatalog.ts), [`src/paymentQuote.ts`](./src/paymentQuote.ts), [`src/paymentDestinations.ts`](./src/paymentDestinations.ts)
- Demo y economía: [`src/demoStore.ts`](./src/demoStore.ts), [`src/miningConfig.ts`](./src/miningConfig.ts), [`src/miningEconomics.ts`](./src/miningEconomics.ts)
- Kryptex/Pool: [`src/poolRevenue.ts`](./src/poolRevenue.ts), [`src/poolPayouts.ts`](./src/poolPayouts.ts), [`vite.config.ts`](./vite.config.ts)

## Revalidación tras autorización completa de Firebase CLI · 1-nov-2026

- Se aplicó `firebase deploy --only auth --project salad-miners --non-interactive`; Firebase confirmó que Auth anónimo quedó habilitado.
- Una cuenta anónima temporal inició sesión correctamente y se eliminó inmediatamente. No se mostraron ni guardaron API key, token o UID.
- Las reglas de Firestore para el documento propio de estado demo ya estaban vigentes; su compilación y despliegue limitado se habían confirmado en el seguimiento anterior. No se añadieron documentos de demo en esta revalidación.
- `npm run build` pasó: TypeScript y Vite compilaron 554 módulos. Queda el aviso no bloqueante de Rollup por un chunk de 695.66 kB.
- El recuento directo encontró 69 casillas completas y 7 pendientes en 76 puntos. La instrucción “Marca `[x]` al completar…” no se cuenta como casilla. Los estados anteriores 67/74 y 68/75 corresponden a cortes antes de los nuevos puntos confirmados de Solflare y Phantom.
- Esto completa persistencia privada de **datos demo** por navegador. No añade autenticación de compradores, verificación de pagos, pedidos, activación de mineros ni backend financiero.

### Comprobación posterior de acceso Firebase y estado de sincronización · 1-nov-2026

- El CLI autenticado listó `salad-miners` como proyecto accesible. No se mostró ni guardó la cuenta, tokens ni API keys; no se volvió a desplegar configuración.
- REA abrió `http://localhost:5173/home` en un perfil temporal aislado y observó el estado final de sincronización demo (`.persistence-status` guardado). El proceso temporal terminó limpiamente. Evidencia `ev_e759388fedbc7a5a7b0e359c220fba2b66661857cfc15e25c7f9dcc608d8eb87`.
- La captura no solicitó DOM, red ni almacenamiento y por sí sola solo confirma el estado visible. La prueba anterior del SDK/API y la ida/vuelta de USD 1 tras recargar siguen siendo las que acreditan la persistencia.
- REA analizó dos módulos instalados de MetaMask Connect como artefacto estático: `dist/src/multichain/utils/index.js` y `dist/src/config/index.js`. Evidencia `ev_f060eed40eeacf014cba127f7f060b8693da0eed35ea1c9bacf5f9aee7b3078f`; 2 archivos parseados, 0 errores, 1,503 nodos AST y 26 hallazgos. El grafo general es parcial porque 277 archivos no fueron seleccionados. El modo deeplink usa `metamask://connect/mwp`; el Universal Link es un modo alternativo del SDK. No se reprodujo el blanco en Android ni se conectó ni firmó una wallet real.
- El estado del checklist queda en **70/77; siete pendientes reales**. El corte anterior verificaba que el flujo del SDK no usara su ruta `/dapp/` y mantuviera Connect/MWP. El ajuste de hoy añadió el deeplink oficial `link.metamask.io/dapp/{url}` como ruta directa al navegador integrado; no verifica la apertura ni el retorno en Android real.

### Comprobación UI adicional tras autorización del CLI · 2-nov-2026

- En Brave local sin proveedor MetaMask inyectado, abrí un checkout restaurado desde `gmPay`. **Cancelar** y la X cerraron el diálogo y limpiaron la URL. Es una comprobación de UI, sin conexión ni pago real; la comprobación controlada equivalente con REA y proveedores de QA está documentada arriba.
- Desde Inicio abrí **Recargar**, seleccioné USD 500 y pasé al checkout común. **Cancelar** cerró el flujo completo y volvió a Inicio; para reintentar hay que abrir Recargar de nuevo. Los datos de cotización y destinos se mostraron, pero sin proveedor no fue posible conectar una wallet.
- Con el CLI autenticado, `projects:list` enumeró `salad-miners`; `functions:list` devolvió `Failed to list functions for salad-miners`, sin evidencia para inferir el estado remoto de Functions. No desplegué nada.
- La configuración raíz `firebase.json` define Auth anónimo y Firestore, no Functions. `unilevel-ejemplo/1nvezt` tiene un codebase Firebase separado con funciones de venta/pago de otro producto; no se copia ni se acredita como backend del checkout de GoMining réplica.

### Revalidación de autorización Firebase y checkout móvil · 2-nov-2026

- Tras la autorización CLI confirmada por el usuario, la lectura `firestore:databases:list --project salad-miners --json` devolvió Firestore Native `(default)` en `nam5`, `freeTier: true`. Firebase Console muestra Auth anónimo habilitado y reglas restringidas a la sesión demo del propietario. No se desplegó nada en esta revalidación.
- La integración cliente ya guarda solo el snapshot demo privado por UID y usa `localStorage` como respaldo. No escribe direcciones de wallet ni recibos de cadena. La autenticación anónima es persistencia de una sesión de navegador, no una cuenta recuperable del comprador.
- `functions:list` siguió devolviendo error genérico; no permite afirmar si hay Functions en la nube. `firebase.json` en la raíz no tiene un codebase de Functions. La réplica carece de verificador de cobros y activación automática.
- Para desplegar Firebase Cloud Functions, Firebase requiere plan Blaze con facturación vinculada ([documentación oficial](https://firebase.google.com/docs/functions/faq-and-troubleshooting)). No cambié el plan ni habilité facturación.
- Computer Use abrió el configurador a 390 × 844 px: cargó skeleton, formulario y revisión tras **Continuar**. **Cerrar configurador** cerró el modal y volvió a `/home`, limpiando la query. Es un viewport de navegador de escritorio, no una prueba en Android.
- REA completó análisis estático anterior del workspace (`ev_fca8030ec6d03a3836d545034975e83381ea9e8e4cd6ea2c8386f14dce05161d`, padre `ev_73626ea5d1d69812686f2c3fce2e26dd11f76894f16a48ee09b245592ceae7e5`), con cobertura parcial, 9,092 nodos vistos y 19,282 archivos fuera de selección. La petición nueva de análisis de cuatro módulos superó el timeout del cliente de 450 s y no devolvió Evidence; no repetí la llamada idéntica.

## Revalidación tras autorización de Firebase CLI · 2-nov-2026

- Se confirmó el acceso de Firebase CLI a `salad-miners` con `firebase-tools 15.34.2`.
- Se ejecutó `firebase deploy --only auth,firestore:rules --project salad-miners --non-interactive`. Firebase confirmó Auth anónimo habilitado; compiló y publicó `firestore.rules`, indicando que la versión local ya estaba vigente. No se desplegó Hosting ni Functions y no se cambió el plan de facturación.
- La regla activa sigue restringiendo al usuario autenticado a su propio `users/{uid}/demoState/current`; no habilita documentos de órdenes ni transacciones.
- `functions:list` falló con `Failed to list functions for salad-miners`; el error no demuestra si existe o no una función remota. En este workspace no hay un codebase de Functions configurado en `firebase.json`.
- `npm run build` pasó: TypeScript y Vite compilaron 564 módulos. Sigue el aviso no bloqueante de Rollup por un chunk minificado de 695.66 kB.
- REA/Linux devolvió un límite del cliente (`timed out awaiting tools/call after 450s`) al pedir una pasada estática de ocho archivos. No llegó Evidence nueva y no repetí la misma solicitud. La evidencia REA anterior se conserva con su alcance documentado; no acredita ejecución móvil.
- La consulta ADB de REA no encontró dispositivos Android (`ev_75a6248230841cbf135cfd6cbcce39e9bb3958c9cf71465f19b63d70ce23d9fb`).
- La matriz sigue en **70 de 77 comprobaciones confirmadas; 7 abiertas**. No se marcó como completa ninguna prueba de wallet real, pago, cotización privada de Bridge, KYC o backend financiero.

## Revalidación de flujos, rutas y menú · 2-nov-2026

- [x] Checkout con conexión pendiente: tras abrir la solicitud simulada de conexión, la X cerró el checkout, limpió los parámetros y volvió a `/home` (`ev_919588e6c9b5579fc37d268197b5dc51afd8740e96c298d06b3629117b2f325c`). No se transmitió ningún pago; cerrar la página no cancela un prompt ya abierto dentro de una wallet real.
- [x] Recargar con proveedor EIP-1193 de QA conectado: el modal reutilizó MetaMask y BNB Chain, mostró la wallet detectada y habilitó el botón de pago (`ev_d018735c7fa715ffe617fda88ead8ca7e5c076360485dfa61e1e07805e688497`). No se pulsó pagar.
- [x] Retirar con wallet de QA conectada: se mostró la dirección conectada y la ruta permaneció en `/withdraw/GOMINING`; no hubo redirección a Recargar (`ev_f705dd4f27848801b2a841e3bf6261fc535b5a1aee97a7de4b1a0dbf1b554253`). La solicitud local no se completó porque el saldo de sesión era insuficiente.
- [x] Rutas directas: `/buy/GOMINING` (`ev_5a0d9de3b9718922229564e3b635ae5143e7ed6615ebe6fcadd29e9be2fbe78f`), `/liquidity` (`ev_15ed752e850be116150948907601f475aadb4ee3821d72fba7439f4e3ce94056`), `/ve-tokenomics` (`ev_3699ea0a5fe7cd434042e8f7216a72094788c1c42fad38b98084467ff8f9362a`) y `/lock/ve-my-lock` (`ev_602e590b27fa97ac2f293c3c67e3545e09d2af6092fc43545024fb671ccdfaa6`) terminaron en `/home`; `/lock/ve-voting` quedó en su ruta (`ev_694598a935a0ae139c4137357ff105f8dd744d568655da2818fa81af99b03cea`).
- [x] Menú a 686 × 477 px: REA abrió el menú y confirmó que Votación sigue visible. La captura completa terminó con `terminated-owned-process` (`ev_c163f26943ddfbc432dc1b65868b85890613ea61e466bc8f9e9ee39742e5bfb6`). Otra captura REA registró screenshot a la misma resolución (`ev_2870938b4d405c7b1e551b10d6e87cb4b11318ad39df92b3108f67bc4a2a66d5`). La comprobación DOM previa encontró un botón de wallet en cabecera y cero botones de notificación (`ev_36150c744d8a3abc889dbf872b54af504c8d945da0d2f18125de2e981b811a51`); el enlace “Conectar una wallet” del header también está confirmado en el código.
- [x] El menú móvil se limita a la altura visible y desplaza su contenido cuando no cabe; se eliminó el `bottom` que colapsaba el panel fijo. La captura REA nueva confirma que el panel y el enlace de Votación se renderizan, pero no reemplaza una revisión visual en teléfono físico.
- [x] `npm run build` terminó correctamente: TypeScript y Vite compilaron 566 módulos. Queda el aviso no bloqueante de Rollup por el chunk Solana de 695.66 kB.

La captura de navegador de REA Linux falló con un error del proveedor antes de producir evidencia utilizable. Se completó la comprobación con el proveedor REA de Windows y Brave temporal; esa escena sí terminó y reportó limpieza correcta. La autorización/despliegue de Auth y reglas de Firestore ya documentados no se tocaron en este cierre. Estos recorridos usan una wallet falsa de QA: no prueban extensiones reales, Android, aprobación de transacciones ni depósitos. La matriz funcional sigue en **70/77**; estas pruebas de cierre no se añaden al conteo base.

## Cierre adicional de errores reportados · 2-nov-2026

Estas casillas complementan la matriz de 70/77; los resultados de QA no se presentan como pruebas con dinero real. Evidencia detallada y límites: [informe REA del 2 de noviembre](./gomining-replica-audit-2026-11-02.md#auditoria-adicional-de-bugs-recarga-y-retiro-local--2-de-noviembre-de-2026).

- [x] Comprar GOMINING, Liquidez, ve Tokenómica y Mi bloqueo redirigen a Inicio; Votación permanece disponible. REA: `ev_1e34b0ac40018ca976ca7e66e2a3c31a6be1cf8709fd757f8186a2ad13f004ce`, `ev_114385391b290cd28afba88f8963021f06e124bf7fa8d30025b04246e31921fb`, `ev_b3b655e113dde664fc533681e911587a5b49abe8e9387b408d76d41bc04affb3`, `ev_2334a3e91aecf9c04afbc1b360b4b7ccd87f023cc945cb7da20dcdfeb215e8d5`.
- [x] El menú omite esas rutas desactivadas; en las vistas auditadas el texto visible usa “local” o “simulada” y no muestra la palabra `DEMO`. El prefijo de recibo local es `LOCAL-`. La comprobación de texto visible cubre las pantallas auditadas, no un análisis visual exhaustivo de cada estado posible.
- [x] El loader de detección de wallet termina y presenta “Conectar una wallet” si no existe una conexión guardada (`ev_1e1d5e9a47d46564fb6b39fdc7dc75a66986c1d0eb956923a60a3814faa18354`). La detección con extensiones reales queda pendiente.
- [x] Recargar presenta opciones compatibles según red: MetaMask/Coinbase/Trust en BNB Chain y Solflare/Phantom en Solana (`ev_d23bdbd062545d141a735deb115f155dea9c3aeee7061ca0e6ec4c11996badc5`, `ev_7a40556066ef63e22fc9ce57e83a1070b4cb53a37b69db66f6d6dcd117e75960`). Se verificó la UI y el fixture de MetaMask, no las wallets instaladas.
- [x] La X cierra checkout con conexión QA pendiente; un rechazo QA cierra el modal con mensaje y sin recibo (`ev_308f6184070031109529bbcac782dc84037696f6803546484931c3b13e3fa490`, `ev_91d2eb33579cb042058b5c8a9e5d4583697179b0ef87f3815cad3435b5caac82`). La web no puede cerrar una solicitud que permanece abierta dentro de una app real.
- [x] Retirar mantiene su ruta y toma la dirección de la wallet conectada en el fixture (`ev_94640207c8fcb02c9c2c4eab381c58a707e5cd14519da26c778de4659ae1a578`). Una solicitud local con USD 500 de saldo, USD 100 bruto y USD 1 de comisión refleja USD 99 netos, reduce saldo a USD 400 y crea recibo `LOCAL-…` (`ev_4c73aa2085b31c7a87e398155d2d2eef74bfe93abb3e7e1599a1bda40f0c9483`). No firma ni envía fondos; el retiro real y su servicio de tesorería siguen pendientes.
- [x] La autorización Firebase CLI permite leer el proyecto `salad-miners` y enumerar Firestore `(default)`; no hubo despliegue en esta comprobación. Persistencia demo y reglas ya estaban desplegadas según el informe previo. No existe aquí un conciliador financiero verificado.

**Pendiente:** conexión real por wallet/extensión y móvil, apertura de MetaMask en teléfono, pagos y recibos reales, confirmación de Bridge y retiros salientes con backend. El informe detalla los prerequisitos. `npm run build` pasa; sigue el aviso de tamaño del chunk de Solana (~695.66 kB).

### Handoff móvil MetaMask y Trust Wallet · corte previo, 2-nov-2026

- [x] El botón principal de MetaMask usa `@metamask/connect-evm` y precarga su cliente en móvil; el enlace alternativo `https://link.metamask.io/dapp/{dappUrl}` solo abre la réplica en el navegador DApp. Allí se requiere un segundo toque en **Conectar MetaMask** para solicitar la dirección. Se conserva la query en el enlace, pero no está confirmada su preservación al volver al teléfono. Fuente: [MetaMask Connect](https://docs.metamask.io/metamask-connect/) y [deeplinks](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks.md).
- [x] Trust Wallet usa `trust://open_url` como apertura directa de su navegador DApp cuando está instalada y ofrece `https://link.trustwallet.com/open_url` como alternativa. Ambas rutas solo abren la página, no autorizan la dirección. En ese navegador el usuario toca **Conectar**; el proveedor inyectado pide acceso sin Project ID. El flujo desde un navegador externo por WalletConnect v2 no está habilitado. Coinbase Wallet y TronLink también tienen rutas de navegador DApp en el código, pero la llegada de URL, prompt y regreso siguen sin probarse en sus apps. Fuentes: [Trust Wallet deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Trust Wallet provider EVM](https://developer.trustwallet.com/developer/develop-for-trust/browser-extension/evm), [Trust Wallet Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile), [TronLink DeepLink](https://docs.tronlink.org/mobile/deeplink/).
- [x] Se actualizó UniSat según sus requisitos de UX: `requestAccounts()` solo ocurre tras toque explícito y nunca al cargar; la integración móvil en un navegador general sigue sin enlace oficial verificado. Fuente: [UniSat Wallet API](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet).
- [x] Phantom ahora usa los Universal Links `https://phantom.com/ul/v1/...`; Phantom documenta que los enlaces antiguos `phantom.app` deben migrarse a `phantom.com`. Phantom mobile requiere el navegador integrado o el protocolo cifrado de connect. Fuentes: [Phantom deep links](https://docs.phantom.com/phantom-deeplinks/deeplinks-ios-and-android), [instrucciones de conexión móvil](https://help.phantom.com/articles/29995498642195).
- [x] Solflare mantiene el protocolo cifrado de `connect` y `signAndSendTransaction`; la conexión devuelve una dirección/sesión y el envío necesita aprobación separada en la app. Fuentes: [Connect](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect), [SignAndSendTransaction](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/signandsendtransaction).
- [x] TronLink mantiene `action=open`, que abre el sitio en DApp Explorer; el botón **Conectar** obtiene autorización usando el proveedor allí. Un flujo alternativo `action=login` usa callback y `actionId`, pero no se implementa en esta réplica. Fuente: [TronLink DeepLink](https://docs.tronlink.org/mobile/deeplink/).
- [x] Coinbase Wallet conserva el conector EIP-1193 inyectado y su enlace móvil actual, pero la documentación vigente de Coinbase ha cambiado hacia Base Account SDK; no se encontró una referencia oficial actual que confirme el deeplink `go.cb-w.com/dapp`. La navegación móvil de Coinbase queda marcada como sin validar, no como funcional confirmada. Fuente: [Coinbase Wallet SDK overview](https://docs.cdp.coinbase.com/coinbase-wallet/overview).
- [x] El build de esta revisión pasó con TypeScript y Vite, 566 módulos. Rollup conserva el aviso no bloqueante por el bundle de Solana de 695.66 kB.
- [x] Se confirmó desde este equipo que el host gratuito ngrok muestra el intersticial antes de la app (`HTTP 200`, `text/plain`); el Quick Tunnel HTTPS devolvió la app (`HTTP 200`, `text/html`, título GoMining). En móvil es preferible probar el Quick Tunnel temporal o el dominio oficial, no el host ngrok con intersticial.

**Pendiente de la casilla de MetaMask real en la sección 4:** confirmar en el teléfono la apertura del checkout, el toque en **Conectar**, la solicitud de permiso, el rechazo y el cierre del modal. La navegación y el prompt reales de Trust Wallet, Phantom, Solflare, Coinbase Wallet y TronLink también necesitan dispositivo; la documentación y el build solo confirman el contrato del flujo. Este detalle no agrega otro pendiente a los **7 abiertos de la matriz 70/77**.

REA/Linux no produjo evidencia nueva en esta revisión: `capture_browser_scenario` devolvió `execution_failure` y `cleanup_incomplete`, sin captura utilizable. `rea doctor --client codex --json` confirmó que la instalación/registro del cliente Codex está alineado, pero el estado del servidor quedó como desconocido. Un análisis estático posterior, limitado a cuatro fuentes, agotó el tiempo del cliente tras 450 s y no devolvió Evidence; no se repitió. Las comprobaciones anteriores y sus Evidence IDs permanecen como evidencia del corte previo. El usuario confirma que MetaMask y Trust Wallet solo abren su pantalla principal mientras usa ngrok; esto no demuestra que la página llegó a cargarse en el navegador DApp ni que se haya enviado un permiso. Se cambió el enlace Trust de https universal a su esquema documentado `trust://open_url` y se dejó la ruta HTTPS como alternativa. El host ngrok gratuito muestra un intersticial que puede impedir que cargue la réplica; la secuencia completa debe probarse con un teléfono y un dominio HTTPS que sirva la aplicación directamente.

### Revalidación previa tras confirmar que solo abre la pantalla principal · corte histórico

- [x] REA abrió `/gmt-wallets` en Chromium temporal a 390 × 844 px. La página mostró los siete conectores y el estado sin conexión (`ev_5b424d0a89fc132caddddfb793110bd2b003d1c898828570e65539b744508a24`); la captura visual del mismo recorrido terminó con limpieza correcta (`ev_dcaaca7f9225bd4e69e75895b0159b6e27f055f2c0a6af28ccda1f9553931eb2`). Es una vista web con viewport móvil, no ejecución en MetaMask/Trust ni teléfono real.
- [x] El host ngrok gratuito actual responde `200 text/plain` con su aviso; con `ngrok-skip-browser-warning: 1` responde `200 text/html` con la réplica. Añadir `?ngrok-skip-browser-warning=1` o `?ngrok-skip-browser-warning=true` a la URL no omite el aviso. El navegador DApp no añade la cabecera, por lo que este dominio es un impedimento confirmado para cargar la página dentro de la wallet.
- [x] El Quick Tunnel temporal `https://luis-reach-award-publicity.trycloudflare.com/gmt-wallets` entrega directamente `200 text/html` durante esta revisión. No es un dominio permanente.
- [x] Se actualizó el copy de Carteras y checkout para explicar que abrir la app no equivale a conectar y que ngrok puede bloquear la página dentro del navegador DApp. Si el handoff MetaMask queda pendiente, ahora se puede cancelar sin dejar el botón atascado. MetaMask Connect se invoca directamente; el enlace alternativo `/dapp/` solo abre el navegador de MetaMask. Trust `open_url` también abre el navegador y necesita el toque **Conectar** después de cargar la réplica. No se añadió un Project ID.

**La casilla real de móvil continúa pendiente:** el usuario aún no ve el prompt de MetaMask/Trust, no se verificó aceptar/rechazar/regreso en teléfono y no se hizo una conexión ni pago. Este diagnóstico no cambia el recuento base: **70/77, siete pendientes**. Consulta la [auditoría detallada](./gomining-replica-audit-2026-11-02.md#resultado-del-handoff-reportado-en-android--2-de-noviembre).

La ruta Trust `trust://open_url` y su fallback HTTPS compilaron correctamente. No se atribuye a ese cambio la corrección del flujo móvil hasta observar que Trust muestra la página de la réplica dentro de su navegador y luego solicita conexión.

### Corrección tras el reporte “solo abre la pantalla principal” · 2-nov-2026

- [x] Confirmé de nuevo que el enlace ngrok gratuito responde `200 text/plain` con la pantalla de aviso; el Quick Tunnel temporal responde `200 text/html` con la app. El host ngrok no se trata como un destino móvil utilizable.
- [x] Añadí `mobileTargetCanOpenWallet()`: MetaMask, Trust Wallet, TronLink, Solflare y Phantom no reciben un enlace de handoff cuando el host es ngrok gratuito. El panel explica que la pantalla principal de una wallet no significa que su navegador DApp haya cargado la réplica.
- [x] Eliminé el fallback móvil de MetaMask Connect cuando no hay proveedor inyectado. El botón dentro de MetaMask ahora busca el proveedor de su navegador DApp; si no está presente, devuelve una indicación clara y no vuelve a abrir la pantalla principal de la app. MetaMask Connect sigue disponible en escritorio.
- [x] Conservé la conexión como gesto explícito del usuario: abrir la wallet no conecta; la persona debe cargar la réplica dentro de su navegador DApp y pulsar **Conectar**. No se firma ni se envía pago durante la conexión.
- [x] `npm run build` pasó con TypeScript y Vite (566 módulos). `git diff --check` no reportó errores de whitespace. Sigue el aviso no bloqueante de Rollup por el chunk Solana de 695.66 kB.

**Sin cerrar la casilla móvil real:** no hubo acceso a un teléfono con MetaMask o Trust Wallet para comprobar que la página se abre, que aparece el prompt, que aceptar/rechazar funciona y que la app regresa. La matriz permanece en **70/77; siete pendientes**. Para probar ahora, abre primero [el Quick Tunnel en Carteras](https://luis-reach-award-publicity.trycloudflare.com/gmt-wallets) desde el navegador normal del teléfono y toca **Abrir navegador de MetaMask**. En Trust, abre el navegador DApp de la app, visita la misma URL y luego pulsa **Conectar**. El Quick Tunnel es público y temporal.

### Actualización de conexión móvil y cierre de build · 2-nov-2026

- [x] MetaMask: al tocar **Conectar**, si el navegador no inyectó un proveedor, el código usa `@metamask/connect-evm` también en móvil. El cliente se calienta al abrir la sesión, sin pedir autorización hasta el toque; se omite la espera de anuncio EIP-6963 que demoraba el handoff. Cancelar limpia el intento pendiente. `mobile.useDeeplink: false` selecciona el flujo HTTPS del SDK, no el enlace que solo abre el navegador DApp. Esto es la corrección implementada, no una verificación del prompt del teléfono.
- [x] Coinbase Wallet: se integró `@coinbase/wallet-sdk` como conector EIP-1193 si no hay proveedor inyectado. Usa metadatos de app y redes BNB, Ethereum y Polygon; no usa WalletConnect Project ID. El SDK conserva su propia sesión; el sitio guarda únicamente un indicador local no secreto para intentar restaurarla.
- [x] Trust Wallet: el botón ahora prioriza su Universal Link oficial `https://link.trustwallet.com/open_url`; `trust://open_url` queda como alternativa. El enlace solo abre el navegador DApp. La conexión directa sin Project ID requiere que cargue la réplica dentro de ese navegador y que el usuario toque **Conectar**. El WalletConnect móvil de Trust requiere Project ID y permanece fuera de alcance.
- [x] Conservé una alerta visible para ngrok gratuito. La lectura HTTP documentada anteriormente encontró un intersticial `text/plain` sin cabecera; por ello no se puede usar para validar que Trust/TronLink carguen la web dentro de su navegador DApp. MetaMask Connect puede probarse desde el HTTPS abierto, pero aún debe observarse en el teléfono.
- [x] `npm run build` pasó con TypeScript y Vite, 945 módulos. Rollup mantiene el aviso de un chunk de Solana de 695.66 kB. `git diff --check` se repetirá tras este addendum.

La matriz de interacción permanece en **70/77 con 7 pendientes**; esta actualización corrige e integra código, pero no cambia el resultado físico que el usuario debe observar. No se hizo una nueva captura REA/Linux en esta pasada: el intento anterior dejó `cleanup_incomplete` sin confirmación del dueño de la sesión temporal, así que se evitó reabrir otro escenario REA. El build y la revisión de archivos no sustituyen esa evidencia ni la prueba del móvil.

### Resultado tras la última prueba del usuario · 2-nov-2026

- [x] El usuario confirmó que MetaMask y Trust Wallet solo muestran la pantalla principal al abrirse desde ngrok. Eso significa **app abierta, wallet no conectada**: no se recibió permiso, no se compartió dirección y no hubo firma ni pago.
- [x] Revalidé el host: ngrok responde `200 text/plain` con su página intermedia; el Quick Tunnel `https://luis-reach-award-publicity.trycloudflare.com/gmt-wallets` responde `200 text/html` con la réplica. Es temporal y puede cambiar.
- [x] El checkout y Carteras ahora bloquean el intento de MetaMask en dominios ngrok gratuitos y explican que se necesita una URL HTTPS que sirva la réplica directamente. En un dominio directo, MetaMask Connect sigue intentando la conexión; su alternativa `/dapp/` abre el navegador interno y después requiere tocar **Conectar**. Trust `open_url` solo lleva al navegador DApp; no aprueba la conexión.
- [x] `npm run build` y `git diff --check` se ejecutaron después del cambio de bloqueo de ngrok.
Prueba de MetaMask en cartera/checkout y Trust en DApp Browser, ya contabilizada en la casilla pendiente de la sección 4: requiere ver el permiso, aceptar/rechazar y volver al sitio en un teléfono.

No se creó Evidence REA nuevo: el intento previo de captura dejó `cleanup_incomplete` sin confirmar el dueño/liberación del perfil, y no se inició otro escenario. El checklist permanece en **70/77, 7 pendientes**; los otros seis pendientes siguen siendo los puntos enumerados en la sección “Siete comprobaciones que siguen pendientes” del informe REA.


### Corrección del handoff móvil tras ver solo el inicio de las wallets · 2-nov-2026

- [x] MetaMask móvil usa ahora el Universal Link de MetaMask Connect: la configuración anterior forzaba metamask://, que el README del SDK define como el modo de esquema personalizado. El modo actualizado mobile.useDeeplink: false selecciona Universal Links. Esto corrige la selección del enlace en código, pero aún falta comprobar que la app muestre la solicitud real.
- [x] Trust Wallet usa ahora https://link.trustwallet.com/open_url como acción principal y deja trust://open_url como alternativa. Ambos abren su navegador DApp, no autorizan por sí mismos. Una vez cargada la réplica, el usuario toca Conectar.
- [x] Los enlaces móviles se habilitan en HTTPS público, incluso ngrok gratuito. La pantalla explica que ngrok puede mostrar “Visit”; al aceptarlo, se carga el sitio. No se añade un bypass ni se afirma que el aviso haya desaparecido.
- [x] La consulta actual de ngrok con User-Agent de Android devolvió HTTP 200 text/plain y el texto “You are about to visit”. La doc oficial explica el intersticial y la cookie de siete días ([ngrok Free Plan Limits](https://ngrok.com/docs/pricing-limits/free-plan-limits)).
- [x] npm run build pasó con 945 módulos; git diff --check pasó. Sigue el aviso de Rollup por el chunk de Solana de 695.66 kB.
El detalle de aceptación/rechazo y regreso móvil queda cubierto por la casilla pendiente de la sección 4; el usuario observó únicamente Inicio de ambas wallets en ngrok.

La matriz sigue en **70/77, siete pendientes**. Esta revisión no cuenta los cambios de código como prueba de wallet real. Los intentos de REA anteriores tampoco acreditan la app móvil: la pasada estática nueva quedó sin respuesta utilizable, y no se capturó un escenario de navegador por el cleanup_incomplete sin liberar.

### Resultado de revisión documental para todas las wallets · 2-nov-2026

- [x] Consulté documentación oficial de MetaMask, Trust Wallet, Coinbase Wallet, Solflare, Phantom, TronLink y UniSat. La guía contiene la matriz de protocolo, requisito móvil y estado implementado.
- [x] Corregí la diferencia entre el checklist y el código: `mobileTargetCanOpenWallet()` ahora pausa los enlaces automáticos desde dominios gratuitos de ngrok; Carteras y checkout explican que abrir la app no autoriza una cuenta y permiten copiar la URL para abrirla en el navegador DApp.
- [x] Revalidé desde un User-Agent móvil: ngrok devuelve `200 text/plain` con su aviso; el Quick Tunnel temporal devuelve `200 text/html` con la réplica.
- [x] La página estática de Trust Wallet confirma que `open_url` solo abre una URL en el navegador DApp; para pedir conexión se necesita un proveedor inyectado y un toque en **Conectar**. El flujo móvil externo con Trust usa WalletConnect v2 y requiere `projectId`, por lo que permanece excluido según el requisito del producto.
- [x] La documentación oficial de MetaMask Connect anuncia conexión móvil vía app/Universal Link; el SDK instalado está configurado con `mobile.useDeeplink: false`. La apertura del inicio de MetaMask reportada por el usuario todavía no es una autorización observada.
La prueba en dispositivo para MetaMask, Trust y los demás conectores queda contabilizada en las dos casillas pendientes de la sección 4.

La matriz total permanece **70/77**. Esta revisión documental y de código no sustituye la aprobación/rechazo real ni la observación del regreso a la página. REA no generó Evidence nueva en este corte: la captura anterior dejó `cleanup_incomplete` sin liberar el perfil y no se volvió a abrir otro escenario. La URL de prueba sin intersticial es [Carteras en el Quick Tunnel](https://luis-reach-award-publicity.trycloudflare.com/gmt-wallets), pública y temporal.

### Resultado real reportado desde el teléfono · 2-nov-2026

- [x] **MetaMask en el enlace ngrok: FALLA en este entorno.** El usuario confirma que solo aparece la pantalla principal de la wallet: no se muestra solicitud de conexión, no se devuelve dirección y no puede aprobarse un pago. El intento queda registrado como resultado observado, no como funcionalidad completada.
- [x] **Trust Wallet en el enlace ngrok: FALLA en este entorno.** También muestra únicamente su pantalla principal. `open_url` es navegación al navegador DApp; no concede permisos por sí solo. Sin WalletConnect Project ID, la conexión debe hacerse desde el navegador DApp con la réplica cargada y el botón Conectar.
- [x] Se cambió el texto de ayuda en Carteras y checkout para indicar el camino manual: MetaMask → **Explorar** → icono de navegador; Trust Wallet → navegador DApp; pegar el enlace, aceptar **Visit** si aparece, esperar a que cargue la réplica y después tocar **Conectar**. La pantalla principal de la wallet no equivale a una conexión.
La comprobación en navegador DApp y la prueba de los conectores móviles siguen abiertas en la sección 4; no se observaron prompts reales para estas apps.

La observación confirma que el intento con ngrok no conectó; no determina si MetaMask Connect funcionará desde un dominio limpio ni si la carga manual funcionará dentro del DApp browser. El total base sigue en **70/77**; la prueba real de wallets permanece pendiente. No se obtuvo Evidence REA nueva: el perfil REA anterior aún no tenía liberación confirmada, por lo que no se inició otra captura.

### Ajuste de handoff móvil tras el reporte del usuario · 2-nov-2026

- [x] Después del reporte “solo abre Inicio”, Carteras y checkout pausaron el handoff móvil de MetaMask/Trust sobre dominios ngrok gratuitos conocidos. MetaMask Connect sigue disponible en HTTPS que sirve la réplica directamente; la conexión se pide tras el toque del usuario. La alternativa `/dapp/` abre el navegador de MetaMask, pero no concede permisos.
- [x] Trust Wallet ahora prioriza su Universal Link `https://link.trustwallet.com/open_url`; `trust://open_url` queda como alternativa. Ambos solo navegan al navegador DApp; el usuario debe tocar **Conectar** cuando la réplica haya cargado.
- [x] Revalidación HTTP actual: el enlace ngrok devolvió `HTTP 200 text/plain`, `ERR_NGROK_6024` y el aviso de visita; el Quick Tunnel temporal `https://luis-reach-award-publicity.trycloudflare.com/gmt-wallets` devolvió `HTTP 200 text/html` con título `GoMining · réplica local`.
- [x] `npm run build` pasó después del ajuste en TypeScript y Vite. Permanece el aviso no bloqueante por el chunk de Solana de 695.66 kB.
- [x] Las casillas móviles repetidas en addenda se consolidaron en las dos casillas abiertas de la sección 4; quedan **7 casillas abiertas únicas** en el archivo. La matriz sigue en **70/77**.
**Prueba física abierta:** el usuario confirma que MetaMask y Trust en ngrok muestran solo Inicio. Verificar en el teléfono el permiso, aceptar/rechazar, dirección y regreso desde un HTTPS sin intersticial; esta prueba ya está incluida en las casillas pendientes de la sección 4.

No se hizo una nueva captura REA de navegador porque la sesión previa dejó `cleanup_incomplete` sin dueño/liberación confirmados. El análisis estático REA/Linux de cinco fuentes venció el límite del cliente a los 450 s y no devolvió Evidence; no se repitió. El control local de Brave falló dos veces al resolver el identificador de ventana; no se hizo clic ni se abrió una wallet. Estos límites no se cuentan como pruebas satisfactorias.

### Actualización posterior: REA y resultado móvil reportado · 2-nov-2026

- La observación del usuario confirma que MetaMask y Trust Wallet, abiertas desde el enlace ngrok, solo muestran Inicio. No hubo permiso, dirección, firma ni pago. Se registra como fallo de ese flujo, no como requisito completado.
- REA verificó `/gmt-wallets` en Chromium temporal a 390 × 844 px: `ev_536edf81046fe338e1535541ad1de0ac9332d298485dbd8c2cdde6c64c24aef1`. Se capturaron screenshot, DOM y accesibilidad con un perfil vacío, sin proveedores de wallet. Cleanup: `terminated-owned-process`; no valida un dispositivo físico ni una conexión real.
- Tras confirmar que REA no tenía limpieza pendiente, se retiró el enlace alternativo de MetaMask que podía abrir la app sin cargar la web en hosts ngrok gratuitos. La pantalla de Carteras/checkout dice que **Inicio no significa conectado** y guía al navegador DApp manual. No se intenta evitar el intersticial.
- La guía ahora compara WalletConnect, Keplr, xDeFi/Ctrl, Safe y las wallets existentes. WalletConnect móvil en Trust requiere `projectId`; Keplr no cubre los destinos actuales; Safe necesita el contexto de Safe App; xDeFi/Ctrl requiere validar el proveedor por red. No se confirmó la cifra de USD 89 por 500 usuarios.

El checklist base sigue en **70/77, siete pendientes**. La captura REA confirma la interfaz y los mensajes; la aprobación/rechazo, dirección devuelta y regreso desde MetaMask/Trust siguen abiertos hasta una prueba con teléfono real. La descripción completa y las fuentes están en la [guía](./gomining-replica-guide.md#matriz-extendida-de-carteras-sin-walletconnect--2-nov-2026) y el [informe de auditoría](./gomining-replica-audit-2026-11-02.md#interaccion-movil-reportada-y-revalidacion-rea--2-nov-2026).

### Ajuste de enlaces móviles después del reporte · 2-nov-2026

Esta nota supersede la frase anterior que decía que se había retirado todo enlace alternativo de MetaMask en ngrok: se habilitó un enlace explícito al navegador DApp para que la persona pueda cargar el sitio dentro de la wallet, sin dar por conectada la cuenta.

- **MetaMask:** si el dominio ngrok no completa el retorno de Connect, el botón abre la URL de la réplica en el navegador interno con `https://link.metamask.io/dapp/{dappUrl}`. La página debe terminar de cargar; entonces la persona toca **Conectar** y autoriza la lectura de la dirección. La app abierta en Inicio no es una conexión.
- **Trust Wallet:** el botón abre `trust://open_url` con el URL de la réplica. El URL conserva producto, precio, moneda, red y wallet cuando se inicia desde checkout. Si el URI no se procesa, hay un fallback HTTPS. Después de cargar la página en DApp Browser se toca **Conectar**; sin WalletConnect/Project ID, abrir la app por sí solo no puede entregar una sesión a un navegador externo.
- **Estado de la casilla móvil:** sigue pendiente. El usuario confirmó que el flujo anterior desde ngrok abre únicamente la pantalla principal de MetaMask y Trust. El ajuste de enlaces pasa compilación, pero todavía no hay prueba posterior en un teléfono que confirme que la app cargó el sitio, mostró el prompt, devolvió una dirección y permitió cancelar/rechazar.
- **Comprobación local:** `npm run build` completó TypeScript y Vite (945 módulos); `git diff --check` no reportó whitespace inválido. Queda el aviso de Rollup por el chunk de Solana de 695.66 kB. REA/Linux no se conectó al CDP local en esta actualización; la evidencia REA existente verifica la interfaz a viewport móvil, no el contenido dentro de una wallet física.

El conteo no cambia: **70/77, siete casillas pendientes únicas**. El procedimiento para repetirlo desde Android: abrir `/gmt-wallets` en Chrome/Brave, pulsar **Abrir navegador de MetaMask** o **Abrir navegador DApp de Trust Wallet**, aceptar el aviso `Visit` de ngrok si aparece, esperar a que se muestre la página GoMining local y luego tocar **Conectar** en esa página. En checkout se conserva el carrito/importe; aprobar la conexión solo muestra la dirección y no paga.

### Revisión documental adicional de carteras · 2-nov-2026

- [x] Se leyó la respuesta del usuario: al abrir MetaMask/Trust desde ngrok solo aparece Inicio. Se clasifica como **hand-off móvil fallido**, sin permiso, dirección, firma o pago. No se cuenta como funcionalidad de conexión completada.
- [x] Se contrastó MetaMask con su ayuda oficial: si el navegador móvil externo no conecta, cargar la dapp en el navegador integrado de MetaMask y después tocar **Conectar**. El build no debe mostrar conectado si no vuelve una cuenta. [Ayuda oficial](https://support.metamask.io/es/configure/wallet/how-to-use-the-metamask-mobile-browser/).
- [x] Se corrigió la ficha UniSat: su app móvil tiene un deeplink `method=connect`, pero devuelve por `unisat://response` con `nonce`; esta SPA no puede manejar ese callback nativo. El conector disponible continúa limitado a extensión. [UniSat Mobile Connect](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet/connect-with-unisat-mobile-wallet).
- [x] Se actualizó la evaluación de Coinbase: el conector instalado es el SDK heredado; los docs actuales recomiendan `@base-org/account` hasta que salga la siguiente versión del SDK. Móvil no se marca validado. [Docs Coinbase](https://docs.cdp.coinbase.com/coinbase-wallet/overview).
- [x] Se aclaró el candidato xDeFi/CTRL: Via se conecta mediante `window.xfi.ethereum` y añade adaptación Bitcoin; CTRL es la marca actual tras la migración de XDEFI. Es opción posible de extensión sin WalletConnect Project ID para EVM/BTC, pero aún no está implementada ni probada aquí. [Código Via](https://github.com/viaprotocol/web3-wallets/blob/main/src/context/WalletProvider.tsx) · [CTRL](https://ctrlwallet.to/).
- [x] Se mantuvieron Keplr y Safe fuera del checkout genérico: Keplr cubre redes Cosmos ajenas a los destinos configurados; Safe Apps requiere contexto Safe, no una extensión genérica.
- [x] Se corrigió la respuesta de costo de Reown: Pro es USD 89/mes o USD 890/año y Multi-wallet Linking requiere Pro; 500 MAU no describe un límite plano de conexiones autocustodiadas. Starter publica 500 para Auth/SIWX o wallets embebidas y el sitio muestra MAUs autocustodiados como “within acceptable limits”; sus términos también refieren 2.5 M RPC o 500 MAU según la definición de licencia. [Precios](https://reown.com/pricing) · [Términos](https://reown.com/terms-of-service).

La matriz funcional no cambia: **70/77; siete pendientes**. La captura REA `ev_536edf81046fe338e1535541ad1de0ac9332d298485dbd8c2cdde6c64c24aef1` sigue limitada a Chromium con perfil vacío; no demuestra conexión real. El conteo pendiente incluye wallets reales, handoff móvil, recibo on-chain, ruta actual de Solflare Bridge, tokens adicionales, KYC/eligibilidad de terceros y conciliación/activación de pagos en backend.

### Revalidación final tras la respuesta móvil · 2-nov-2026

El usuario confirma que desde ngrok MetaMask y Trust Wallet solo muestran Inicio: no aparece permiso, no regresa una dirección y no hay firma ni pago. Se registra como handoff fallido, no como conexión. La build actual pasó (`tsc -b && vite build`, 945 módulos); permanece el aviso de Rollup por el chunk Solana de 695.66 kB. `git diff --check` quedó limpio. No se añadieron casillas duplicadas: la matriz conserva las **7 pendientes únicas** que aparecen arriba. REA verificó el sitio web a viewport móvil, no el prompt dentro de una wallet física. La pantalla intermedia de ngrok es una causa probable, no confirmada por una repetición en el teléfono.

### Corrección del flujo ngrok tras el reporte del teléfono · 2-nov-2026

Esta nota supersede las indicaciones anteriores que sugerían usar MetaMask Connect directamente desde ngrok.

- **MetaMask:** si el sitio abre en ngrok gratuito, el botón principal ahora abre la réplica en el navegador DApp de MetaMask. Cuando la página realmente cargue dentro de la wallet, se toca **Conectar** y el proveedor inyectado solicita permiso para leer la dirección. En un dominio HTTPS limpio se conserva MetaMask Connect con `client.connect()`. Abrir la app y ver Inicio no es conexión.
- **Trust Wallet:** se usa `trust://open_url` como enlace principal y el Universal Link documentado `https://link.trustwallet.com/open_url` como alternativa. Ambos solo navegan; no crean una sesión ni solicitan acceso por sí mismos. Sin Project ID, la página debe cargar dentro de Trust y la persona toca **Conectar**. Si solo aparece Inicio, la réplica no recibió dirección.
- **Conectar no firma:** el permiso de conexión solo autoriza la lectura de una dirección pública. No existe una firma de mensaje para “conectar” en estos flujos; la aprobación de una transferencia se solicita aparte al pulsar **Pagar**.
- **Límite observado:** el usuario probó la versión anterior desde ngrok y vio solo Inicio en MetaMask y Trust. El código ya cambió, pero no hay una prueba posterior en teléfono. Ngrok gratuito puede interceptar la carga; esta es una explicación probable, no una causa física confirmada.
- **REA:** la sesión REA/Linux informa `open: false` y `cleanup_pending: false`. No había endpoint CDP del teléfono ni dispositivo Android accesible en este turno; no se generó una nueva captura y no se afirma que se haya observado el prompt real.
- **Validación local:** la nueva condición del botón está en `src/WalletPanel.tsx` y `src/WalletPaymentCheckout.tsx`. `npm run build` pasó (`tsc -b && vite build`, 945 módulos); queda el aviso no bloqueante de Rollup por el chunk Solana de 695.66 kB. `git diff --check` pasó. No cambia el conteo hasta repetirlo en teléfono.

#### Las siete comprobaciones que siguen pendientes

1. Conectar y desconectar los siete proveedores reales en sus redes compatibles: Solflare, Phantom, MetaMask, Coinbase Wallet, Trust Wallet, TronLink y UniSat. MetaMask Android ya llegó a la aprobación según reporte; falta confirmar dirección, rechazo, desconexión y los demás proveedores.
2. Completar en teléfonos reales el handoff móvil, la solicitud, aprobación/rechazo y regreso. MetaMask llegó a la firma desde ngrok; Trust abrió solo el inicio antes del ajuste de deeplink y requiere retest.
3. Inspeccionar un recibo originado por una transacción real y validar hash, remitente, destino y estado Bridge.
4. Confirmar en vivo para cada ruta de Solflare Bridge el mínimo, tarifa, liquidez, disponibilidad y neto recibido.
5. Añadir otros tokens solo con contratos, decimales y rutas vigentes confirmados.
6. Confirmar requisitos KYC y elegibilidad de Solflare Bridge y proveedores por región, ruta y monto.
7. Implementar backend financiero con órdenes, monitoreo de cadena, confirmaciones, idempotencia, conciliación, recibos y activación.

El checklist permanece en **70/77, siete pendientes**. El cambio de interfaz y una build correcta no sustituyen el punto 2 ni los demás controles de producción.

### Corrección tras el último reporte de pantalla principal · 2-nov-2026

- **MetaMask:** en HTTPS directo se mantiene `client.connect()`. En dominios gratuitos de ngrok el botón principal abre el Universal Link `/dapp/` hacia el navegador DApp, ya que el usuario reportó que el handoff directo solo muestra Inicio. Al cargar la página dentro de MetaMask, toca **Conectar** para solicitar acceso a la dirección.
- **Trust Wallet:** el enlace principal ahora es el Universal Link oficial `https://link.trustwallet.com/open_url`; `trust://open_url` queda como alternativa. Sin WalletConnect/Project ID, Trust solo puede autorizar desde su navegador DApp cuando la réplica está cargada y el proveedor está inyectado.
- **Compra y Recargar:** el deeplink conserva los parámetros del checkout. En la wallet primero se conecta la cuenta y luego se pulsa **Pagar** para revisar y aprobar la transferencia.
- **Verificación local:** `npm run build` terminó correctamente con 945 módulos; Rollup mantiene el aviso no bloqueante por el chunk de Solana de 695.66 kB. `git diff --check` terminó sin errores de whitespace. No se aprobó ni envió ninguna transacción real.
- **Límite REA:** la solicitud enfocada de análisis estático a cuatro módulos no devolvió Evidence después de más de cinco minutos; se detuvo la espera y no se repitió. No hay nueva evidencia REA de teléfono ni de prompt wallet.

El conteo se mantiene en **70/77**. La segunda casilla móvil sigue abierta: hay que comprobar en teléfono que el DApp Browser cargue, aparezca la solicitud, se pueda aceptar o rechazar y la dirección vuelva a la página. Las siete casillas abiertas permanecen listadas arriba. Fuentes: [MetaMask Connect](https://docs.metamask.io/quickstart/), [Universal Link de MetaMask](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/), [Trust Wallet deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Trust Wallet móvil](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

### Ajuste de navegación móvil tras confirmar que las apps solo muestran Inicio · 2-nov-2026

- Verificado en el código: MetaMask Connect estaba deshabilitado en ngrok; la acción principal abría el navegador DApp y no pedía permiso. Se habilitó `client.connect()` en HTTPS público, incluido ngrok, y se mantuvo el navegador DApp como alternativa.
- Verificado en el código: Trust Wallet ahora prueba primero `trust://open_url` y conserva el Universal Link HTTPS como alternativa. Solflare y Phantom muestran enlaces Browse al navegador DApp cuando el host es ngrok.
- Verificado localmente: `npm run build` y `git diff --check` pasaron. No se conectó una wallet real ni se envió una transacción.
- Pendiente de prueba en teléfono: confirmar que los enlaces cargan esta réplica dentro de la wallet, que aparece el permiso, que aceptar/rechazar producen los estados correctos y que la dirección regresa al sitio. Esto sigue siendo la casilla móvil existente, no una casilla adicional.

La matriz general permanece en **70/77**. Estas correcciones no cierran la casilla de conexión móvil ni la de proveedores reales; las cinco restantes siguen abiertas para pagos/Bridge, tokens, elegibilidad y backend.

- Límite de auditoría: las llamadas REA de esta edición no devolvieron Evidence utilizable; los registros retenidos son de revisiones previas. La corrección se validó por código y compilación. La prueba con teléfono sigue siendo la casilla móvil pendiente.

### Recorrido móvil corregido tras el último reporte · 2-nov-2026

El usuario confirma que al abrir MetaMask o Trust Wallet desde ngrok solo aparece la pantalla principal; no se muestra la réplica ni una solicitud. Se registra como conexión fallida hasta que una wallet devuelva la dirección.

- En `src/walletAppLinks.ts`, los enlaces móviles de MetaMask y Trust conservan el destino de la réplica dentro de su navegador DApp; Trust usa el Universal Link oficial y el esquema de app como respaldo. Checkout mantiene el producto, importe, red y wallet en la URL.
- En `src/WalletPanel.tsx` y `src/WalletPaymentCheckout.tsx`, el destino incluye una intención `gmWalletConnect`. Cuando la página llega al navegador DApp y el proveedor aparece, el sitio solicita acceso a la cuenta una sola vez. No firma ni envía pagos. Si el proveedor no aparece, queda la acción para reabrir el checkout y copiar la URL.
- En `src/walletSession.ts`, se busca primero el proveedor ya inyectado antes de esperar la detección asíncrona; esto evita perder la activación del toque en los navegadores DApp.
- La documentación oficial coincide con este modelo: MetaMask recomienda su navegador móvil integrado cuando otro navegador no conecta; Trust `open_url` abre una URL dentro de DApp Browser. Trust desde un navegador externo usa WalletConnect v2 y requiere `projectId`, que se mantiene excluido. [MetaMask](https://support.metamask.io/configure/wallet/how-to-use-the-metamask-mobile-browser/) · [MetaMask deeplink](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust WalletConnect móvil](https://developer.trustwallet.com/developer/develop-for-trust/mobile).
- `npm run build` pasó (945 módulos); continúa el aviso no bloqueante por el chunk Solana de 695.66 kB. El Vite local responde `200` y sirve el código nuevo. No se observó una wallet física ni se aprobó una transacción. No se generó nueva Evidence REA de una app móvil.

El conteo sigue en **70/77**; la comprobación móvil permanece abierta. Para cerrarla, el teléfono debe abrir la réplica dentro del navegador DApp, mostrar o resolver la solicitud de conexión, devolver la dirección y permitir rechazo/desconexión. Si al tocar el botón solo aparece Inicio, abre manualmente el navegador DApp de la wallet, pega la URL copiada, acepta el aviso `Visit` de ngrok si aparece y espera a que cargue la réplica antes de conectar. Las siete casillas abiertas siguen siendo las listadas en la sección 4.

### Corrección vigente tras confirmar que las apps solo muestran Inicio · 2-nov-2026

Esta nota supersede las indicaciones móviles anteriores de este archivo:

- MetaMask en ngrok ahora abre primero el checkout o la página dentro del navegador DApp de MetaMask. Cuando carga, la réplica intenta solicitar automáticamente acceso a la dirección porque el comprador ya pulsó **Conectar**; si no aparece, toca Conectar dentro de la página. En otros dominios HTTPS públicos se conserva MetaMask Connect SDK.
- Trust Wallet ahora abre primero su Universal Link HTTPS `open_url`; el esquema `trust://open_url` queda como alternativa. Tras cargar la página en su navegador DApp, la réplica intenta la solicitud de dirección. Si la app solo muestra Inicio, carga manualmente la URL copiada dentro de su navegador DApp y pulsa **Conectar** si no aparece el permiso.
- El checkout conserva producto, importe, red y wallet en el enlace. La conexión de cuenta no firma ni paga; **Pagar** sigue siendo una aprobación posterior en la wallet.
- Ver solo Inicio es **fallo**, nunca conexión. La respuesta reciente del usuario cierra esa interacción como fallida, pero no cierra la casilla de integración móvil porque no hubo dirección devuelta.
- Verificación de este cambio: compilación TypeScript/Vite y `git diff --check` completados. El intento automático ocurre solo después de `gmWalletConnect` de MetaMask/Trust, solo pide dirección y deja disponible el botón manual. Sin teléfono conectado, no se verificaron la carga dentro de la app, el prompt, aceptar/rechazar ni retorno. Sin nueva Evidence REA del dispositivo.

El estado sigue en **70/77, siete pendientes**. El punto móvil requiere una prueba posterior en el teléfono con MetaMask y Trust; las seis casillas restantes son proveedores reales, recibo on-chain, rutas Bridge, activos admitidos, elegibilidad regional/KYC y backend financiero.

### Revisión tras el reporte de que MetaMask y Trust abren solo Inicio · 2-nov-2026

- **Incidencia registrada:** desde el enlace ngrok el usuario solo ve la pantalla principal de MetaMask o Trust; no llega la web, no aparece el permiso y no vuelve una dirección. La clasificación sigue siendo **fallida**.
- **Causa de código confirmada:** el checkout y Carteras ejecutaban `eth_requestAccounts` desde un `useEffect` tras cargar `gmWalletConnect`. La documentación de MetaMask Connect recomienda iniciar la conexión desde una acción explícita del usuario y desaconseja conectar al cargar la página. Se retiró la solicitud automática; tras volver a la réplica, el comprador toca **Conectar** dentro del navegador DApp.
- **MetaMask:** se habilitó MetaMask Connect en cualquier HTTPS público, incluido ngrok, para que el botón de conexión invoque el SDK en la misma acción del usuario. Se conserva el enlace al navegador DApp como alternativa manual si el handoff solo abre Inicio.
- **Trust Wallet:** el enlace principal usa ahora `trust://open_url` porque el usuario ya tiene la app; el Universal Link `https://link.trustwallet.com/open_url` queda como alternativa web. La conexión sin WalletConnect/Project ID requiere que la réplica cargue dentro del navegador DApp y que el usuario toque **Conectar**.
- **Compra y Recargar:** mantienen producto, importe, red y wallet en el checkout. Conectar solo lee una dirección; firmar y enviar solo ocurre después de tocar **Pagar** y confirmar en la wallet.
- **Validación local:** `npm run build` pasó con TypeScript y Vite (945 módulos). Persiste el aviso no bloqueante de Rollup por el chunk Solana de 695.66 kB. `git diff --check` pasó; Git reportó solamente avisos LF/CRLF.
- **REA/dispositivo:** se intentó `rea_linux.list_browser_targets` contra `127.0.0.1:9222`, pero REA devolvió `provider_unavailable` porque Brave no tiene un endpoint CDP local expuesto. No hay un dispositivo móvil accesible por REA en esta sesión. La captura REA anterior de Chromium no equivale a probar MetaMask o Trust en un teléfono.

El checklist permanece en **70/77**. La casilla móvil no se cierra hasta que el mismo enlace/ngrok cargue la réplica dentro de cada wallet, el toque en **Conectar** muestre la solicitud, aceptar devuelva una dirección y cancelar/rechazar cierre la solicitud sin enviar fondos. Tampoco se cierra el control de los siete proveedores reales ni las cinco comprobaciones financieras/de negocio restantes listadas en la sección 4.

### Investigación comparativa de wallets · 2-nov-2026

La matriz detallada de MetaMask, Trust, Coinbase, Phantom, Solflare, TronLink, UniSat, Keplr, CTRL/xDeFi, Safe y WalletConnect está en la [guía de compatibilidad](./gomining-replica-guide.md). Diferencia proveedor directo, DApp Browser, callback requerido, Project ID y ajuste con las seis redes de pago actuales.

Esta investigación documental **no cierra** las casillas de wallet real o móvil. Se conserva **70/77**: el usuario vio Inicio al intentar conectar MetaMask y Trust desde ngrok, sin permiso ni dirección; no se pudo probar el prompt en un teléfono desde esta sesión. Trust Wallet desde un navegador externo requiere WalletConnect v2 con Project ID, excluido por la preferencia del proyecto; su ruta sin ID requiere abrir la web dentro de Trust DApp Browser. Keplr no corresponde a las redes de cobro actuales, Safe requiere contexto Safe App, UniSat móvil requiere callback nativo no disponible en esta SPA y CTRL/xDeFi queda como candidato de extensión no integrado. No se confirma el precio de WalletConnect de USD 89 por 500 usuarios.

Build local actual: aprobada (`tsc -b && vite build`, 945 módulos); persiste el aviso de Rollup por el chunk Solana de 695.66 kB. `git diff --check` pasó. No se observó ni conectó una wallet en teléfono.

### Resultado móvil y estado vigente · 2-nov-2026

- [x] Se registró el resultado confirmado por el usuario: desde ngrok, MetaMask no muestra la solicitud y Trust Wallet abre su pantalla de inicio. Clasificación: **fallido**, sin provider, dirección, firma ni pago.
- [x] En ngrok, el botón **Conectar con MetaMask** llama MetaMask Connect desde el toque; el deeplink `/dapp/` queda como alternativa manual. Trust prioriza el Universal Link HTTPS `open_url` y deja `trust://open_url` como alternativa. El resultado de los dos saltos aún no se confirmó en teléfono.
- [x] Al volver con `gmWalletConnect`, la réplica ya no solicita acceso automáticamente: muestra instrucciones y espera que se toque **Conectar** dentro de la página. Conectar solo lee dirección; la transferencia necesita tocar **Pagar** y aprobar otra solicitud.
- [x] Se documentó la compatibilidad de MetaMask, Trust, Coinbase, Phantom, Solflare, TronLink, UniSat, Keplr, CTRL/xDeFi, Safe y WalletConnect, incluida la dependencia de Project ID y la correspondencia de redes. La matriz está en la guía.
- [x] `npm run build` pasó: TypeScript + Vite; 945 módulos. Sigue el aviso de Rollup por el bundle Solana (695.66 kB).
Pendiente fuera del conteo de la matriz: repetir en teléfono MetaMask y Trust con la versión actual, comprobar carga de la réplica dentro del navegador DApp, el prompt tras tocar Conectar, aceptar/rechazar, retorno de la dirección y desconexión.

Límite REA: no hubo target móvil ni captura nueva del prompt. La última consulta al endpoint CDP de Brave devolvió `provider_unavailable`; no se repitió. Se mantiene **70/77** y las **siete comprobaciones abiertas** enumeradas en las secciones 4, 5 y 11. Trust desde un navegador móvil externo requiere WalletConnect v2 con `projectId`; sin ese ID, la web debe cargarse dentro del DApp Browser de Trust.

### Primer ajuste tras la respuesta del usuario · corte histórico

El usuario confirmó que MetaMask y Trust Wallet muestran solo el inicio al abrir el enlace de ngrok. Se registra como **fallo de handoff**, no como conexión rechazada: no llegó la página a la wallet ni apareció solicitud de dirección.

- En ese primer corte, MetaMask Connect se intentó como ruta principal en ngrok y el enlace al navegador DApp quedó como alternativa. El usuario volvió a reportar que veía solo Inicio, así que esa configuración se sustituyó después.
- El deep link MetaMask de respaldo se ajustó al formato de ruta `https://link.metamask.io/dapp/{dappUrl}`. Tampoco está validado en el teléfono.
- Trust `open_url` solo intenta abrir la página dentro del navegador DApp. Sin WalletConnect Project ID, Connect solo es posible dentro de ese navegador; si el enlace deja Trust en Inicio, abre Browser/DApps desde la propia wallet y carga la URL HTTPS.
- La comparación técnica de las demás opciones está en [la guía](./gomining-replica-guide.md#evaluacion-de-wallets-sin-walletconnect-project-id). EIP-1193/EIP-6963 detecta proveedores EVM ya inyectados; no abre apps móviles. Solana Wallet Standard tampoco reemplaza los deeplinks y callbacks particulares.
- Fuentes: [MetaMask Connect](https://docs.metamask.io/metamask-connect/), [MetaMask deeplinks](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/), [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Trust Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile), [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963).
- El hilo de Reddit compartido recomienda el navegador integrado de MetaMask para ese síntoma. Es anecdótico y antiguo; se usa como contexto, no como prueba del flujo actual. [Hilo de r/MetaMask](https://www.reddit.com/r/Metamask/comments/rjz6r7/need_help_i_cant_use_metamask_mobile_to_connect/).
- La pasada REA/Linux de este corte sobre `src/walletAppLinks.ts` terminó en timeout del cliente a los 450 s y no produjo Evidence. No se repitió; el análisis estático retenido de cortes anteriores no incluye este último cambio.

**Conteo:** 70/77, siete pendientes. La conexión móvil real sigue pendiente; no se marcó como cumplida porque no hay un teléfono accesible por REA en esta sesión.

### Ajuste posterior al resultado del teléfono · 2-nov-2026

- MetaMask en ngrok ahora abre directamente el navegador DApp y mantiene la ruta/query del checkout; al entrar en la página, el intento `gmWalletConnect` solicita el provider si ya está inyectado.
- Trust Wallet ahora usa `trust://open_url` como primera ruta hacia DApp Browser y el Universal Link HTTPS como alternativa. Una pantalla de Inicio sigue significando que no se cargó la página ni hubo conexión.
- El checkout copia un enlace que preserva el producto, importe, red, wallet e intención; si la app cae en Inicio, ese enlace se puede pegar manualmente en Browser/DApps.
- `npm run build` pasó (`tsc -b && vite build`, 945 módulos); `git diff --check` pasó. Sigue el aviso de Rollup por el bundle Solana de 695.66 kB.
- El intersticial de ngrok gratuito debe aceptarse con **Visit** cuando aparezca. No se obtuvo nueva evidencia REA de un teléfono y no se probó prompt real ni pago.

**Estado vigente:** 70/77, siete pendientes; la integración móvil no se marca como funcional hasta que una wallet real cargue la réplica, muestre el permiso y devuelva la dirección tras aceptación.

### Revalidación después del reporte “solo aparece Inicio” · 2-nov-2026

- El usuario confirma que, al abrir desde ngrok, MetaMask y Trust muestran únicamente la pantalla principal. Resultado: **falló el handoff**; no hay provider, dirección, permiso ni pago.
- Cambio vigente en el código: para un dominio ngrok, el botón principal de MetaMask abre primero la URL oficial del navegador DApp con la URL de regreso. Cuando la réplica cargue dentro de MetaMask, el usuario toca **Conectar**; no se manda una solicitud al montar la página. En otros HTTPS públicos continúa el botón MetaMask Connect.
- Trust Wallet conserva el enlace documentado `open_url`. Si el teléfono solo muestra Inicio, el camino de contingencia es copiar la URL con `gmWalletConnect=trustwallet`, abrir **Browser/DApps** manualmente dentro de Trust, pegar la URL, aceptar el aviso de ngrok si aparece y tocar **Conectar** cuando la réplica cargue. La navegación a la app no crea una sesión.
- Se corrigieron los mensajes de Carteras y checkout para mostrar esos pasos. Producto, importe y red se mantienen al copiar el enlace de checkout. **Conectar** solo pide la dirección; **Pagar** es una aprobación aparte.
- `npm run build` y `git diff --check` se ejecutaron después del cambio. La revisión local confirma selección del enlace por código; no confirma que una wallet real abra la página ni muestre el permiso. No hubo nueva Evidence REA ni se hizo una transferencia.

Las **siete pendientes** de la matriz siguen abiertas y enumeradas en la sección 4; esta revisión no convierte el reporte de fallo ni el cambio de código en una prueba de wallet real.

### Revisión documental y ajuste de fallbacks móviles · 2-nov-2026

- [x] Se contrastaron con documentación oficial los flujos de MetaMask Connect, Trust Wallet, Coinbase Wallet, Solflare, Phantom, TronLink, UniSat y los candidatos Keplr, CTRL/xDeFi, Safe y WalletConnect. La matriz por wallet, compatibilidad con redes del checkout y requisito de Project ID está en [la guía](./gomining-replica-guide.md#investigacion-documental-y-fallback-movil-actualizado--2-nov-2026).
- [x] Se aclaró el paso posterior al deep link: si la réplica carga en el navegador de la wallet, el botón cambia a **Conectar … ahora**. Solo una pulsación solicita la dirección; no firma ni paga.
- [x] Se añadieron alternativas de navegador DApp y copiar URL en Carteras y checkout para las wallets con un flujo web recuperable. La URL preserva `gmWalletConnect` y, en checkout, los datos del producto.
- [x] `npm run build` pasó con TypeScript y Vite: 945 módulos. `git diff --check` pasó; continúan avisos de LF/CRLF y el aviso de Rollup por el chunk Solana de 695.66 kB.
- [ ] MetaMask y Trust Wallet siguen fallando desde el enlace ngrok observado: solo aparece Inicio. No hubo autorización, dirección ni pago. Hace falta probar la URL dentro del navegador DApp del teléfono y observar aceptación/rechazo y el retorno.
- [ ] REA no produjo Evidence nueva: una pasada terminó `integrity_mismatch` porque `src/walletAppLinks.ts` cambió durante el inventario. Una pasada posterior con el código estable agotó el límite del cliente de 450 s sin resultado; no se repitió la misma llamada. No se presenta el análisis como una auditoría completada.

La matriz base sigue en **70/77 con siete pendientes**. Esta investigación resuelve la documentación y mejora el fallback de interfaz; no sustituye pruebas con wallets móviles reales ni cierra las comprobaciones de pagos/Bridge/backend.

### Revisión documental adicional de wallets móviles · 2-nov-2026

- [x] Se contrastaron MetaMask Connect y la ayuda de MetaMask Mobile. MetaMask recomienda abrir la dapp desde Explore → navegador si un navegador móvil externo no conecta; `/dapp/{dappUrl}` solo abre la página y el permiso llega después de tocar **Conectar**. [MetaMask Mobile](https://support.metamask.io/es/configure/wallet/how-to-use-the-metamask-mobile-browser/) · [MetaMask Connect](https://docs.metamask.io/metamask-connect/).
- [x] Se contrastó Trust Wallet: `open_url` solo navega; desde un navegador externo, su conexión móvil usa WalletConnect v2 y `projectId`. Sin ID, el flujo requiere Browser/DApps con provider inyectado. [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile).
- [x] Se añadió a la [guía](./gomining-replica-guide.md#contraste-de-documentacion-movil-proporcionada-por-el-usuario--2-nov-2026) la matriz oficial para Coinbase, Solflare, Phantom, TronLink, UniSat, Keplr, CTRL/xDeFi, Safe y WalletConnect, distinguiendo lo que funciona desde una página web y lo que requiere navegador integrado, callback nativo, contexto Safe o Project ID.
- [x] Se revisó la página oficial de Reown: Starter indica 500 MAU para wallets embebidas o autenticación SIWX y 2.5 M RPC; las conexiones autocustodiadas figuran “within acceptable limits”. Pro se publica a USD 89/mes y agrega multiwallet linking y cuotas mayores. No se interpreta 500 como límite general de conexiones autocustodiadas. [Precios Reown](https://reown.com/pricing).
- [ ] No cambia el resultado funcional: **70/77**. La prueba en teléfono HTTPS sin intersticial, con prompt de conexión y retorno de dirección sigue pendiente. Esta revisión documental no se presenta como evidencia REA móvil.

### Estado vigente después de la respuesta del usuario · 2-nov-2026

- [x] El usuario confirma que al abrir MetaMask y Trust Wallet desde ngrok solo aparece la pantalla principal. Registro: **handoff fallido**, sin página de la réplica, prompt, permiso, dirección, firma ni pago.
- [x] MetaMask Connect usa `metamask://` para iniciar `client.connect()` desde el toque; el enlace oficial `/dapp/{dappUrl}` sigue como alternativa para abrir la réplica dentro del navegador de MetaMask. No se ha probado el cambio en teléfono. [MetaMask Connect](https://docs.metamask.io/metamask-connect/) · [deeplink DApp](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/).
- [x] Trust Wallet prioriza `https://link.trustwallet.com/open_url` y conserva `trust://open_url` como alternativa. Ambos solo navegan; sin Project ID de WalletConnect, conectar requiere cargar la réplica dentro de Browser/DApps y tocar **Conectar**. [Deep links Trust](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile).
- [x] Checkout y Carteras conservan la URL para pegar manualmente en el navegador DApp y diferencian **Conectar** (dirección) de **Pagar** (aprobación de transferencia).
- [x] El build TypeScript/Vite y `git diff --check` se ejecutaron después de los cambios.
- [ ] Repetir en teléfono con MetaMask y Trust: comprobar que la réplica cargue, aparezca el permiso, aceptar/rechazar, obtener dirección y desconectar.
- [ ] REA intentó el análisis amplio de wallet y luego una lectura acotada de los dos módulos cambiados; ambas terminaron en timeout del cliente a los 450 s sin Evidence. No repetí una llamada idéntica. Hace falta aumentar el límite del host para cerrar esta auditoría; no se afirma que el teléfono haya sido probado.

El balance vigente es **70/77 cumplidas, una fallida observada y seis abiertas**: (1) conexión/desconexión real de cada wallet en extensiones y móviles; (2) hash/recibo de una transferencia on-chain; (3) cotización, mínimo, fee, liquidez y llegada final de cada ruta Bridge; (4) contrato, decimales y disponibilidad de tokens extra; (5) elegibilidad/KYC por proveedor, red, región y monto; (6) backend de órdenes, verificación, idempotencia, conciliación y activación. El handoff móvil desde ngrok es la falla observada y queda aparte de las seis abiertas. El build posterior al ajuste de enlaces pasó; el teléfono no se volvió a probar.

### Cambio correctivo para el caso ngrok del usuario · 2-nov-2026

Esta es la instrucción vigente y reemplaza las notas anteriores de este archivo que describían otra prioridad de enlaces para MetaMask o Trust.

- MetaMask: en un dominio ngrok, **Conectar** dirige primero al enlace oficial `/dapp/{dappUrl}` para cargar la réplica dentro del navegador MetaMask. Quité `useDeeplink: true`, que forzaba `metamask://connect/mwp`; en dominios HTTPS públicos sin ngrok se conserva MetaMask Connect con su flujo Universal Link predeterminado.
- Si la réplica aún no detecta el provider de MetaMask dentro del navegador DApp, el checkout ya no vuelve a lanzar la app externa desde ngrok: explica que hace falta abrir la página dentro de MetaMask. El checkout tampoco reescribe la ruta al tocar Conectar después de volver por `gmWalletConnect`.
- Trust Wallet: el botón principal usa `trust://open_url` para entrar a Browser/DApps, con `https://link.trustwallet.com/open_url` como alternativa. Cuando el sitio cargue dentro de la wallet, hay que tocar **Conectar** para que aparezca el permiso. Abrir la app no equivale a conectar.
- Compra y **Recargar** usan la misma selección de wallet y conservan en el enlace los datos del checkout. El pago sigue separado y requiere una segunda aprobación.
- Verificación local: `npm run build` completó (`tsc -b && vite build`, 945 módulos); permanece el aviso de Rollup por el chunk Solana de 695.66 kB. La integración física no se reprobó. El informe REA de esta revisión no obtuvo evidencia de teléfono; las llamadas anteriores de análisis de módulos agotaron el límite del cliente y no se repitieron.
- **Casilla móvil: sigue fallida/no verificada** hasta que MetaMask y Trust carguen esta réplica desde ngrok, el toque en **Conectar** muestre el permiso, aceptar devuelva una dirección y rechazar/cancelar no envíe nada. La respuesta de ahora confirmó que ambas apps solo mostraban Inicio antes de este cambio.
- Entorno reportado por el usuario: teléfono Android; navegadores de origen Brave y Chrome.

Fuentes: [MetaMask Connect y gestión de cuentas](https://docs.metamask.io/metamask-connect/evm/guides/manage-user-accounts/) · [deeplink DApp de MetaMask](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Trust deeplinks](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Wallet móvil](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

### Revisión del fallo móvil en Android Brave/Chrome · 2-nov-2026

- [x] Identificada la diferencia de flujo: MetaMask Connect puede pedir permiso desde Brave/Chrome móvil; el deep link /dapp/ solo abre el sitio. Trust open_url también solo navega; sin WalletConnect Project ID, la conexión requiere el provider dentro de Browser/DApps.
- [x] Cambiado MetaMask para intentar la conexión asistida también desde ngrok público HTTPS, precargando el SDK; se conserva abrir la réplica en el navegador DApp como fallback.
- [x] Trust prueba primero su Universal Link HTTPS y mantiene el esquema de app como fallback. La pantalla advierte que el enlace no concede acceso por sí solo.
- [x] Validación local: npm run build pasó; git diff --check pasó; http://127.0.0.1:5173/home respondió 200.
- [ ] Android: el usuario debe volver a probar MetaMask en Brave/Chrome y Trust desde Browser/DApps; comprobar que la réplica cargue, aparezca el permiso, aceptar y rechazar, ver la dirección tras aceptar y desconectar. No se marca cumplido a partir de documentación o código.
- [ ] REA: no hay CDP local expuesto por Brave ni Android enlazado; no se obtuvo una nueva captura REA. El último intento no se repitió sin cambiar la condición del endpoint.

El conteo general sigue **70/77**: una interacción móvil fallida observada y seis comprobaciones externas abiertas (wallets reales; recibos on-chain; rutas Bridge; tokens adicionales; KYC/elegibilidad; backend financiero). El ajuste es un intento de corrección en código, pendiente de retest físico; no cierra esa casilla.

### Seguimiento tras confirmar Android + Brave/Chrome · 2-nov-2026

- [x] Revisión de la ruta Trust: el CTA ahora usa primero el esquema `trust://open_url`, que la documentación oficial describe como deeplink directo a la ruta dentro de la app; el Universal Link HTTPS queda como alternativa. La pantalla explica qué hacer si la app muestra solo Inicio.
- [x] Build posterior al cambio: `npm run build` pasó (`tsc -b && vite build`, 945 módulos); permanece el aviso de Rollup por el chunk Solana de 695.66 kB.
- [ ] **Falla móvil observada, no cerrada:** desde Android + Brave/Chrome, MetaMask no mostró prompt y Trust Wallet abrió Inicio. Reprobar ambos con el build actual; Trust debe abrir Browser/DApps, cargar la réplica y pedir autorización al tocar **Conectar**. La conexión por Trust desde navegador externo necesita WalletConnect v2 con `projectId`, que sigue excluido.
- [ ] **Seis verificaciones externas:** (1) conexiones/desconexiones reales en extensiones y móviles; (2) recibo y hash on-chain; (3) precio, mínimo, comisión, liquidez y conversión final de Bridge; (4) contratos, decimales y disponibilidad de tokens adicionales; (5) elegibilidad/KYC por wallet, red, región e importe; (6) backend de órdenes, verificación, idempotencia, conciliación y activación.
- [ ] REA: el análisis acotado actual devolvió `Transport closed` sin Evidence. La captura móvil continúa sin evidencia; no se repitió el análisis tras los fallos anteriores.

El conteo continúa en **70/77**. Una compilación y una revisión de documentación no cierran la falla de prompt móvil ni las seis verificaciones externas.

### Ajuste actual para Android + Brave/Chrome · 2-nov-2026

La prueba que el usuario reportó ocurrió antes de este ajuste: desde ngrok, MetaMask no mostró permiso y Trust Wallet abrió Inicio. La falla observada se conserva; aún falta probar la versión actual en ese teléfono.

- [x] MetaMask en ngrok ahora prioriza el enlace oficial `/dapp/{dappUrl}`. Ese enlace solo abre la réplica dentro del navegador de MetaMask. Al cargar allí, hay que tocar **Conectar MetaMask ahora** para que el provider solicite la dirección. En HTTPS limpio, MetaMask Connect conserva su flujo móvil por SDK.
- [x] Trust mantiene `trust://open_url` y un Universal Link HTTPS. Ambos solo navegan. Si aparece Inicio, copiar la URL de `/gmt-wallets` o del checkout y pegarla manualmente en **Browser/DApps**; cuando la réplica cargue, tocar **Conectar Trust Wallet ahora**. Sin WalletConnect Project ID no hay solicitud desde Brave/Chrome externos.
- [x] Carteras muestra esta diferencia de rutas en Android/ngrok y checkout conserva producto, importe y red al copiar la URL.
- [x] `npm run build` pasó: TypeScript + Vite, 945 módulos. Queda el aviso no bloqueante del chunk Solana de 695.66 kB.
- [ ] Retest físico: abrir el sitio en cada navegador DApp, observar permiso, aceptar y rechazar, comprobar dirección tras aceptar, desconectar y repetir en checkout/Recargar. No se marca cumplido por documentación o compilación.
- [ ] REA: `capture_browser_scenario` en Chromium temporal devolvió `Transport closed` antes de Evidence; no se repitió la captura porque los intentos previos de REA también fallaron. No se afirma que esta actualización tenga auditoría REA nueva. Para reintentar hará falta restablecer REA MCP.

**Estado base:** 70/77; la incidencia móvil sigue fallida/no revalidada y las seis comprobaciones externas enumeradas en la sección 4 permanecen abiertas.

### Alcance móvil confirmado · 3-nov-2026

- Se requiere cubrir Android e iOS. La prueba reportada hasta ahora es solo Android + Brave/Chrome + ngrok; no hay resultado de iPhone/iOS ni de la prueba posterior al último cambio.
- MetaMask: en HTTPS público sin intersticial, MetaMask Connect está diseñado para solicitar acceso desde el navegador móvil. En ngrok, la réplica prioriza abrirse dentro del navegador DApp; ese enlace solo navega. Ya cargada la página allí, hay que pulsar **Conectar** para conceder acceso a la dirección.
- Trust Wallet: sin WalletConnect/Project ID, el enlace `open_url` solo abre Browser/DApps; no genera la solicitud. La página debe estar cargada dentro del navegador de Trust y luego se pulsa **Conectar**. Desde Brave/Chrome externos no se espera un permiso directo.
- Conectar solicita acceso a la dirección pública; no pide firma de mensaje. La firma/envío pertenece al paso independiente **Pagar**.
- La casilla móvil permanece abierta hasta probar aceptación, rechazo, retorno de dirección, desconexión y cancelación en dispositivos reales. El intento actual de REA (`rea/capture_browser_scenario`) devolvió `Transport closed` sin Evidence; no se atribuye auditoría REA a esta revisión.

El conteo sigue en **70/77**. La evidencia requerida para el punto móvil no puede sustituirse con una captura desktop o una compilación.

### Ajuste posterior tras el reporte de Android · 2-nov-2026

- [x] MetaMask Connect se habilita en cualquier URL pública HTTPS, también en ngrok. El SDK abre con Universal Link HTTPS en Android (`mobile.useDeeplink: false`); se mantiene el enlace del navegador DApp como alternativa. La documentación oficial indica que `client.connect()` usa deeplink desde navegadores móviles; la corrección todavía requiere retest en el teléfono.
- [x] Trust Wallet ahora intenta primero `https://link.trustwallet.com/open_url` y muestra `trust://open_url` como alternativa. Ambos solo navegan a Browser/DApps; no conceden acceso.
- [x] `npm run build` pasó (`tsc -b && vite build`, 945 módulos). Sigue el aviso de Rollup por el chunk Solana de 695.66 kB. `git diff --check` pasó con avisos de conversión LF/CRLF.
- [ ] Retest en Android + Brave y Chrome: MetaMask debe abrir la solicitud; aceptar debe devolver la dirección, rechazar no debe conectar y desconectar debe limpiar la sesión. Repetir conectar desde compra y Recargar; no aprobar pagos durante esta comprobación.
- [ ] Trust Wallet sin Project ID: abrir la página dentro de Browser/DApps y tocar Conectar. Desde Brave/Chrome externos no se espera una solicitud, porque Trust documenta WalletConnect v2 como vía de conexión móvil.
- [ ] REA no produjo Evidence por `Transport closed`; esperar a que se restablezca REA MCP antes de una nueva captura. El Android no está conectado al entorno de REA.

El total permanece **70/77**. Este ajuste de código no cierra la falla móvil ni las seis comprobaciones externas; la lista de esas siete pendientes está arriba.

### Cambio aplicado para Android + Brave/Chrome · 3-nov-2026

En la ruta ngrok, MetaMask ahora abre la réplica en su navegador DApp antes de pedir el permiso; Trust Wallet ofrece copiar el checkout para pegarlo en Browser/DApps, porque la conexión directa desde Brave/Chrome requiere WalletConnect v2 y `projectId`. El enlace alternativo de Trust solo navega. En ambos casos la conexión sigue solicitando únicamente la dirección pública; el pago necesita aprobación aparte.

`npm run build` pasó y `git diff --check` no encontró errores. No hubo nueva prueba física ni nueva Evidence REA: la última llamada REA/Linux había cerrado con `Transport closed`. **No se cuenta este cambio como una casilla funcional aprobada.** El checklist general continúa en **70/77**: una incidencia móvil observada y seis verificaciones externas abiertas. Las siete están enumeradas en `#### Las siete comprobaciones que siguen pendientes`.

### Corrección del intento móvil y cobertura Android/iOS · 3-nov-2026

- [x] MetaMask: el botón ahora inicia `client.connect()` en HTTPS público, también en ngrok. El enlace oficial al navegador DApp queda como fallback si la app solo muestra Inicio. La documentación oficial soporta deeplinks desde navegadores móviles, pero la corrección aún no se ha reprobado en el dispositivo.
- [x] Trust Wallet: se conserva el flujo sin Project ID. En móvil se copia la URL para abrirla desde Browser/DApps y se pide acceso desde el provider inyectado; `open_url` solo navega y no muestra Connect.
- [x] Validación local: build correcta (945 módulos, aviso existente de chunk Solana), `/gmt-wallets` respondió HTTP 200 y `git diff --check` pasó.
- [ ] Android + Brave/Chrome + ngrok: verificar MetaMask prompt, aceptar, cancelar/rechazar, retorno de dirección, desconectar, y repetir acceso desde compra y Recargar; sin aprobar pagos.
- [ ] iOS + Safari/Chrome/Brave: repetir el flujo MetaMask/Trust y las wallets Solflare/Phantom en dispositivo real. iOS Safari requiere invocar aperturas externas sincronizadas con el toque en protocolos que usan `window.open`; no asumir paridad por la build.
- [ ] Trust desde navegador externo sin Project ID: no soportado por la vía móvil documentada; utilizar Browser/DApps. Cambiarlo requiere aprobar una solución WalletConnect con Project ID.
- [ ] REA: `mcp__rea__list_browser_targets` respondió `Transport closed` en dos intentos de solo lectura. No hubo Evidence ni inspección REA nueva; reiniciar/reconectar el cliente MCP antes de reintentar.

El conteo permanece en **70/77**. El punto móvil y las otras seis validaciones externas siguen abiertos según `#### Las siete comprobaciones que siguen pendientes`; no se marca una conexión como funcional hasta ver dirección devuelta en el dispositivo.

### Matriz de prueba móvil por wallet · revisión documental · 3-nov-2026

El dispositivo reportado es Android con Brave/Chrome; los dos enlaces probados fueron ngrok y mostraron solo la pantalla inicial. Esta tabla aclara qué resultado esperar y qué prueba real falta. No cambia el total hasta completar cada recorrido en un teléfono.

| Wallet | Prueba Android que corresponde | Resultado que cierra la parte móvil | Estado actual |
| --- | --- | --- | --- |
| MetaMask | En Android + Brave/Chrome + ngrok, la prueba más reciente cargó dentro del browser DApp y llegó a la aprobación reportada. Falta obtener hash si fue enviada; para conexión completa falta verificar dirección, rechazo, regreso y desconexión. | Ver solicitud de conexión, aceptar/rechazar, retornar dirección, desconectar y repetir desde compra/Recargar. Sin enviar otro pago. | Handoff y aprobación reportados; recibo y estados restantes pendientes. |
| Trust Wallet | Sin Project ID, abrir Browser/DApps, cargar URL de `/gmt-wallets` o checkout y tocar **Conectar**. El `open_url` ahora usa `coin_id=714` (índice SLIP-44). | Provider inyectado y dirección visible; rechazo/desconexión limpian estado. | El último intento abrió Inicio. La corrección requiere retest; desde Brave/Chrome externos no se espera solicitud sin WalletConnect. |
| Solflare / Phantom | En HTTPS limpio, tocar **Conectar** y revisar el deeplink cifrado que invoca la app; ngrok puede usar Browser DApp como fallback. | Aceptar/rechazar y retornar la dirección/sesión al checkout. | Flujo documentado/código integrado, no probado en teléfono. |
| Coinbase Wallet / Base App | En HTTPS limpio, tocar el CTA de conexión del SDK; usar Browser DApp como respaldo. En ngrok abrir el browser DApp y tocar **Conectar**. | Solicitud visible, dirección recuperada después del retorno y rechazo sin conectar. | CTA ajustado en código; sin prueba Android. |
| TronLink | Abrir DApp Explorer desde el enlace; dentro de la réplica tocar **Conectar**. | Provider inyectado devuelve dirección. Probar `action: login` solo cuando el callback HTTPS esté desarrollado. | Solo apertura + provider; login callback pendiente. |
| UniSat | Instalar extensión en desktop para conexión web. | En móvil, validar solo después de implementar un callback/app bridge que reciba `unisat://response`. | Sin conexión móvil funcional en esta SPA. |
| Keplr, Safe, CTRL/xDeFi | No son un camino al checkout actual de BTC/BNB/ETH/TRX/SOL/POL (Keplr) o requieren una integración/contexto aparte (Safe); CTRL no se incorpora sin soporte vigente confirmado. | No aplicable al checkout actual. | Fuera del conjunto móvil soportado en esta versión. |

Para decidir sobre WalletConnect: Reown muestra un nivel Starter de USD 0 y 2.5M RPC, pero sus Términos actuales detallan umbrales de licencia y posibles requisitos Enterprise para servicios que reciben pagos. No se debe interpretar “500” como un cargo automático de USD 89 al alcanzar esa cantidad; confirmar con Reown la elegibilidad del modelo comercial antes de crear el Project ID. Fuentes: [Trust Wallet Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile), [Coinbase SDK mobile](https://docs.cdp.coinbase.com/wallet-sdk/docs/environments), [Reown pricing](https://reown.com/pricing), [Reown terms](https://reown.com/terms-of-service).

Se ajustó el CTA Coinbase para que, en HTTPS sin intersticial, llame al SDK desde el toque principal en vez de abrir solo la app. `npm run build` pasó con 945 módulos; queda el aviso no bloqueante del chunk Solana de 695.66 kB. La comprobación móvil no se cierra hasta repetir el flujo en Android. Total provisional: **70/77**.

### Corrección de navegación móvil según dispositivo confirmado · 3-nov-2026

- MetaMask: el teléfono confirmado es Android con Brave/Chrome y ngrok. Para evitar el handoff de conexión a través del intersticial HTML gratuito, en ngrok el CTA principal abre la URL completa del checkout en el navegador DApp de MetaMask. Cuando carga allí, el usuario toca **Conectar** y el proveedor inyectado solicita acceso. En HTTPS público sin intersticial sigue disponible MetaMask Connect desde Brave/Chrome.
- Trust Wallet: el CTA principal abre `open_url` para llevar el checkout a Browser/DApps; el enlace `trust://open_url` queda como alternativa y se puede copiar la URL si la app solo muestra Inicio. Sin WalletConnect/Project ID no se solicita una sesión directamente desde Brave/Chrome; hay que cargar la página en el navegador integrado y tocar **Conectar**.
- Al volver desde la app a la página externa sin un proveedor o permiso, no se registra una conexión ni queda un pago pendiente. El checkout sigue exigiendo aprobación aparte para enviar.
- Validación local: `npm run build` pasó con 945 módulos; `git diff --check` no encontró errores de whitespace (Git mostró solo avisos LF/CRLF). Validación física pendiente: en Android, confirmar que la réplica carga dentro de cada Browser DApp, que aparece el prompt y que aceptar/rechazar/volver/desconectar dejan el estado correcto. No pagar.
- REA no produjo Evidence nueva: los intentos previos de captura/inventario terminaron en `Transport closed`; no se repitieron. Esta revisión se apoya en documentación oficial y lectura del código, no se etiqueta como auditoría REA ejecutada.

La matriz sigue en **70/77**: una falla móvil observada antes del ajuste, pendiente de retest, y seis verificaciones externas abiertas. La lista está en [el informe detallado](./gomining-replica-mobile-wallet-audit-2026-11-03.md#siete-comprobaciones-que-siguen-abiertas).


### Ajuste de handoff móvil tras confirmar Android + Brave/Chrome · 3-nov-2026

- [x] MetaMask: el CTA principal intenta `client.connect()` también en el dominio HTTPS de ngrok. Se conserva el enlace `/dapp/` como fallback manual. El cambio corrige que el CTA anterior solo navegaba al browser DApp en ngrok; aún no prueba el permiso de MetaMask en el teléfono.
- [x] Trust Wallet: el CTA principal usa el esquema oficial instalado `trust://open_url`; el Universal Link HTTPS se conserva como alternativa. Los dos solo abren una ruta; sin WalletConnect y `projectId`, el usuario debe cargar la réplica en Browser/DApps y tocar **Conectar**.
- [x] Se corrigieron las instrucciones en Carteras y checkout: distinguen intento directo de MetaMask, fallback DApp y navegación Trust; indican que ngrok puede exigir aceptar **Visit**.
- [x] REA/Linux `binary_session` respondió y reportó `cleanup_pending: false`, sin target abierto. Esto confirma disponibilidad del servidor, no una interacción de navegador ni una prueba Android. No hay Evidence REA nueva en este corte.
- [ ] Android + Brave y Chrome + ngrok: MetaMask: prompt, aceptar/rechazar, dirección, volver y desconectar; repetir entrada desde compra y Recargar. Sin pagar.
- [ ] Android + Trust Wallet: probar el deep link directo; si solo abre Inicio, copiar y pegar la URL en Browser/DApps; aceptar **Visit**, cargar la réplica, conectar, probar rechazo, retorno y desconexión. Sin pagar.
- [ ] Probar iOS y los otros conectores móviles por separado; la compilación no verifica deeplinks, prompts ni callbacks reales.

El balance general continúa en **70/77**: esta corrección de código no aprueba una casilla móvil sin dirección observada en dispositivo real. Las seis comprobaciones externas restantes siguen listadas en `#### Las siete comprobaciones que siguen pendientes`.

- [x] Se intentó REA estático sobre los cinco módulos del flujo; tras más de tres minutos no hubo resultado ni Evidence y se detuvo la espera. No se presenta como auditoría REA completada ni se repite la misma llamada.

### Actualización tras la respuesta del usuario y retesteo local · 3-nov-2026

El usuario confirmó que probó **MetaMask y Trust Wallet** en **Android + Brave/Chrome** desde ngrok; ambas abrieron la pantalla principal de la wallet, sin Connect ni firma. No se observó dirección, autorización ni transacción.

- [x] En ngrok, el CTA de MetaMask ahora abre la página dentro del navegador DApp; al cargar la réplica, la persona toca **Conectar** para pedir acceso. Se quitó `forceRequest` del flujo SDK y se sigue el `client.connect({ chainIds })` estándar. En HTTPS público sin ngrok continúa el intento directo de MetaMask Connect.
- [x] Trust usa como enlace principal el Universal Link HTTPS oficial `link.trustwallet.com/open_url`. Si solo abre Inicio, se ofrece copiar la URL para cargarla desde Browser/DApps. Sin WalletConnect y Project ID no se pide conexión desde Brave/Chrome externos.
- [x] Validación local: `npm run build` pasó (945 módulos); `/gmt-wallets` respondió HTTP 200; `git diff --check` no encontró errores de whitespace. Continúa el aviso no bloqueante de Rollup por el chunk Solana (695.66 kB).
- [ ] Retest Android: MetaMask debe abrir la DApp o cargarla desde Explorar/Browser; Trust debe cargarla desde Browser/DApps. En ambas, confirmar que el segundo toque muestra el permiso, aceptar devuelve la dirección, rechazar no conecta, volver sin aceptar limpia el pendiente y desconectar quita la dirección. Repetir desde compra y Recargar; no aprobar pagos.
- [ ] REA de navegador/dispositivo: `binary_session` confirmó que REA/Linux estaba disponible sin target abierto y sin limpieza pendiente. `inspect_adb_client` devolvió Evidence `ev_c2f258da5495c64796e7bdf9feafb2243079b6c8e4bb3330c9499b478852088d`, con `contacted_adb_server: false`; no se consultó el teléfono. `list_browser_targets` con el endpoint local `127.0.0.1:9222` devolvió `provider_unavailable/endpoint_unreachable`. Por tanto no hay captura REA del prompt ni del teléfono.

El conteo general sigue en **70/77**: la falla móvil reportada continúa abierta hasta completar el retest; las otras seis validaciones externas no cambian. La disponibilidad del servidor REA o una compilación no cuentan como una conexión móvil funcional.
### Resultado móvil confirmado por el usuario y ajuste Trust Wallet · 3-nov-2026

El usuario probó desde **Android + Brave/Chrome + ngrok**. MetaMask cargó la URL dentro de su navegador integrado y permitió llegar a la firma de la transacción. Trust Wallet abrió la app como acceso directo, pero no cargó la réplica ni mostró una solicitud de conexión. La firma observada en MetaMask no acredita por sí sola confirmación on-chain, recepción Bridge ni activación del producto.

- [x] MetaMask: resultado reportado como funcional para abrir la DApp en su navegador y llegar a la aprobación de la transacción.
- [x] Trust: la ruta primaria ahora usa el esquema oficial trust://open_url, reservado por la documentación para dirigir directamente a una página dentro de la app cuando está instalada. Se conserva el Universal Link HTTPS como alternativa.
- [x] Handoff de conexión: si la página llega con gmWalletConnect dentro del navegador DApp y detecta el proveedor de esa wallet, Carteras y el checkout solicitan permiso para leer la dirección. No se firma mensaje ni se envía el pago en este paso.
- [x] Validación de código: npm run build pasó con 945 módulos; persiste el aviso no bloqueante del bloque Solana (695.66 kB). git diff --check terminó sin errores de whitespace; Git mostró avisos LF/CRLF.
- [ ] Trust Android: repetir el enlace primario. Si abre Inicio, abrir Browser/DApps, pegar la URL copiada, aceptar Visit si ngrok lo pide y confirmar que aparezca el permiso de conexión y vuelva la dirección. Probar rechazo, volver y desconectar; repetir desde compra y Recargar sin enviar fondos.
- [ ] Completar rechazos, desconexiones y callbacks reales de todos los conectores móviles; la prueba de MetaMask comunicada no cubre los demás ni confirma el recibo.
- [ ] REA de navegador/teléfono: no hay Evidence nueva. La captura anterior no alcanzó un target CDP; esta entrega no se etiqueta como inspección REA del Android.

El conteo general sigue en **70/77**: el caso móvil compuesto permanece abierto por Trust y por los estados de rechazo, retorno y desconexión que faltan. Las otras seis comprobaciones están enumeradas en [las siete comprobaciones pendientes](./gomining-replica-checklist.md#las-siete-comprobaciones-que-siguen-pendientes).

### Resultado adicional de prueba Android · 3-nov-2026

- [x] MetaMask: el usuario informa que Android + Brave/Chrome abrió la réplica en el navegador interno y permitió llegar a la aprobación/firma de la transacción. Falta el hash/estado on-chain para confirmar el envío y la recepción.
- [ ] Trust Wallet: Android + Brave/Chrome abrió la app en Inicio, sin cargar la réplica ni mostrar Connect. Se cambió el orden de enlaces: Universal Link HTTPS oficial primero y `trust://` como alternativa; falta repetirlo.
- [x] Corrección local del deeplink: `open_url` documenta `coin_id` como índice SLIP-44. El código ahora usa `714` para BNB; `20000714` es el ID interno de Trust Wallet Core para BNB Smart Chain y no corresponde al parámetro documentado.
- [ ] Retest físico de Trust tras priorizar el Universal Link HTTPS; si sigue en Inicio, copiar el enlace `gmWalletConnect=trustwallet`, abrir Browser/DApps manualmente y pegarlo. Desde Brave/Chrome externos, Trust documenta WalletConnect v2 con Project ID, opción que permanece excluida.
- [ ] REA Android: sin Evidence de teléfono. El endpoint CDP local no respondió; el reporte del usuario no se etiqueta como captura REA.

El checklist general sigue en **70/77**; la casilla móvil permanece abierta hasta probar conexión, dirección, rechazo, retorno y desconexión con Trust, y completar los demás estados pendientes. La aprobación reportada de MetaMask no prueba que la transferencia se confirmara ni que el minero se activara.

### Resultado móvil confirmado y ajuste de instrucciones · 3-nov-2026

- [x] MetaMask: el usuario confirma que Android + Brave abrió el sitio en el navegador interno de MetaMask y permitió llegar a la aprobación de una transacción. No se recibió un hash ni confirmación de red.
- [x] Trust Wallet: el usuario confirma que tocar conectar abre la aplicación, pero queda en la pantalla principal; no aparece la réplica ni una solicitud de conexión. No indicó cuál de los enlaces de apertura tocó, así que no se atribuye el resultado a un esquema específico.
- [x] Interfaz: el CTA de Trust ahora dice **Probar apertura en Trust Wallet**, el alternativo identifica `trust://` y las instrucciones indican cómo copiar la URL y abrirla desde Browser/DApps. El checkout y Carteras explican que no se puede iniciar una sesión desde Brave/Chrome externo sin WalletConnect Project ID.
- [ ] Trust Android: probar la URL copiada dentro de Browser/DApps y verificar que carga la réplica, aparece el permiso, devuelve la dirección, y que rechazo/desconexión limpian el estado.
- [ ] Las siete comprobaciones siguen abiertas: el flujo de Trust, estados reales de las wallets, hash de transferencia, salida real de Bridge, contratos/tokens, KYC/eligibilidad y verificación backend. Se listan en el [informe móvil](./gomining-replica-mobile-wallet-audit-2026-11-03.md).

El total general permanece en **70/77**. La prueba reportada permite marcar solo el handoff de MetaMask hasta su pantalla de aprobación; no demuestra transferencia confirmada, recibo, conversión Bridge ni activación de producto. Trust no queda marcada funcional hasta ver una dirección devuelta dentro de su navegador DApp.

### Retest comunicado y cambio de Universal Link Trust · 3-nov-2026

- [x] MetaMask: el usuario informó que Android + Brave abrió el checkout dentro del navegador de MetaMask y permitió llegar a la aprobación/firma. El hash y la confirmación on-chain no están verificados.
- [x] Trust: el usuario confirmó que el esquema directo abría Inicio. La réplica ahora prioriza `https://link.trustwallet.com/open_url`; mantiene `trust://open_url` como alternativa.
- [x] Trust: las instrucciones ya explican que abrir la wallet no equivale a conectar. La página debe cargar en Browser/DApps; entonces la réplica solicita acceso a la dirección mediante el proveedor inyectado. Desde Brave/Chrome sin WalletConnect Project ID no hay sesión directa documentada.
- [x] Validación local: `npm run build` pasó (945 módulos); `/gmt-wallets` respondió HTTP 200; `git diff --check` pasó. Sigue el aviso no bloqueante del bloque Solana de 695.66 kB; esto no prueba el deeplink en un teléfono.
- [ ] Retest Android de Trust: que cargue la réplica, aparezca el permiso y devuelva la dirección; probar rechazo y desconexión. Si falla el enlace, pegar la URL copiada en Browser/DApps y aceptar el aviso de ngrok si aparece.
- [ ] El total permanece **70/77**. Los siete pendientes y sus límites están enumerados en el [informe móvil](./gomining-replica-mobile-wallet-audit-2026-11-03.md).

### Resultado más reciente comunicado · Android + Brave/Chrome + ngrok · 3-nov-2026

- [x] MetaMask abrió la réplica dentro de su navegador integrado y permitió llegar a la aprobación/firma de la transacción. No se recibió hash ni prueba de liquidación, así que no se marca como pago confirmado.
- [ ] Trust Wallet volvió a abrir Inicio tras el enlace directo `trust://open_url`; el Universal Link HTTPS ya había abierto Inicio en el intento anterior. Ninguno cargó la réplica ni mostró solicitud. Aún no se ha probado pegar la URL en Browser/DApps.
- [x] Carteras y el checkout ahora ofrecen como acción principal **Copiar URL para Trust Wallet**; el checkout conserva producto, importe y red. Las instrucciones guían a abrir Browser/DApps, pegar la URL y cargar la réplica.
- [x] Validación local de este ajuste: build pasó (945 módulos), `/gmt-wallets` dio HTTP 200 y `git diff --check` pasó; persiste el aviso no bloqueante del bloque Solana (695.66 kB).
- [ ] En Trust Browser/DApps: cargar la URL copiada, aprobar/denegar la solicitud, verificar dirección y desconexión; repetir la entrada desde compra y Recargar sin pagar.
- [ ] Mantener pendiente el cierre de MetaMask: el usuario reporta que firmó, pero faltan dirección registrada, rechazo, retorno, desconexión y hash/confirmación de red.

No cambia el total **70/77**. La evidencia de MetaMask llega a la pantalla de aprobación, no verifica la transferencia. Trust exige probar el camino manual sin Project ID; la conexión móvil directa desde Brave/Chrome requiere WalletConnect v2 y `projectId` según la [documentación oficial](https://developer.trustwallet.com/developer/develop-for-trust/mobile). REA no capturó el teléfono en esta prueba.

### Resultado informado y nuevo intento de Trust · 3-nov-2026

- [x] MetaMask: con Android + Brave/Chrome + ngrok, abrió la réplica en el navegador interno y permitió llegar al paso de firma/aprobación. No se recibió hash; no se puede confirmar el envío o liquidación. Si el usuario aprobó en la wallet, pudo ser una transferencia real.
- [ ] Trust Wallet: abrió la app pero permaneció en Inicio; no apareció la réplica ni un permiso. No se identificó si el intento anterior usó el enlace HTTPS o `trust://`.
- [x] Carteras y checkout ahora exponen el enlace directo `trust://open_url`, el Universal Link HTTPS y copiar la URL. El enlace para pegar conserva el destino del checkout y el parámetro de autoconexión, que solo pide lectura de dirección.
- [x] Validación local: `npm run build` pasó (945 módulos), `/gmt-wallets` respondió HTTP 200 y `git diff --check` pasó; Rollup mantiene el aviso de tamaño del bloque Solana.
- [ ] Trust en Android: falta abrir la página dentro de Browser/DApps y confirmar permiso, dirección, rechazo y desconexión. Si ambos enlaces solo abren Inicio, usar el copiado manual. El handoff directo desde Brave/Chrome necesita WalletConnect v2 y `projectId` según Trust, excluido del alcance actual.
- [ ] REA: no capturó Android. El análisis del código no devolvió evidencia porque el transporte REA local se cerró; la prueba de MetaMask es reporte del usuario y la nueva ruta Trust requiere retest en dispositivo.

La matriz continúa en **70/77**. No se marca conexión Trust ni transferencia de MetaMask como confirmadas sin ver dirección/hash. Para la matriz de compatibilidad y fuentes oficiales, consulta el [informe de auditoría móvil](./gomining-replica-mobile-wallet-audit-2026-11-03.md#opciones-de-wallet-móvil-sin-walletconnect-project-id).

### Resultado del retest Android y corrección del botón Trust · 3-nov-2026

- [x] MetaMask: el usuario reportó Android + Brave/Chrome + ngrok; la réplica cargó en el navegador interno de MetaMask y llegó al paso de aprobación/firma. No hay hash ni verificación de la red, Bridge o activación del producto.
- [x] Trust Wallet: el usuario reportó que la app abrió en Inicio, sin réplica ni prompt; no identificó cuál enlace usó.
- [x] Hallazgo local: el CTA principal en Carteras y checkout apuntaba a `trust://open_url`, mientras que el Universal Link oficial HTTPS estaba como alternativa. Android puede abrir la app pero dejarla en Inicio con el esquema directo.
- [x] Corrección local: el botón principal ahora abre `https://link.trustwallet.com/open_url` con la URL completa de la réplica; `trust://open_url` queda como alternativa y sigue disponible copiar/pegar manualmente en Browser/DApps.
- [ ] Android Trust: probar el botón principal nuevo; confirmar que la réplica carga dentro de Browser/DApps, que se solicita la dirección, aceptar/rechazar y desconectar. Si solo aparece Inicio, usar el enlace copiado dentro de Browser/DApps. No pulsar **Pagar**.
- [ ] REA de runtime móvil: no hay captura nueva de REA. La observación del teléfono es reporte del usuario; el defecto corregido se verificó por lectura local del JSX.

El total general continúa en **70/77**. El cambio de prioridad del enlace no basta para cerrar Trust hasta que aparezca la réplica dentro de la wallet y se verifique la dirección devuelta. Trust documenta `open_url` y, para conectar desde navegadores externos, WalletConnect v2 con `projectId`; la opción sigue excluida. [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Wallet Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

- [x] REA/Linux analizó estáticamente el bundle actual `dist/assets/App-DVyezqvW.js`: Evidence `ev_0ae756931f23b8cf4dcf5fe636fc9dca571d6f8540ccad83068cee2c4bbaf0ac` (resumen `ev_fa4ae0b9fe2029419f1c69baa39500b12934e8863d10fddc7536d7a8ff5acf3a`). 1 de 23 fuentes fue analizada; 22 quedaron fuera y el grafo sigue parcial. No es evidencia de ejecución móvil.
- [x] Build final posterior al cambio: `npm run build`, 945 módulos; `/gmt-wallets` dio HTTP 200 y `git diff --check` pasó. Persiste la advertencia de bundle Solana de 695.66 kB.
- [ ] El resultado en Trust Android aún requiere retest con el CTA HTTPS principal nuevo. El checklist total sigue en 70/77 hasta ver la réplica dentro de Browser/DApps y la dirección devuelta.

### Reporte de Android posterior al cambio HTTPS · 3-nov-2026

- [x] MetaMask en Android + Brave/Chrome + ngrok: reporte del usuario confirma que abrió el sitio en el browser interno y llegó a la solicitud para firmar/aprobar. Sin hash, no se confirma envío ni pago.
- [x] Trust Wallet con el CTA HTTPS principal: reporte del usuario confirma que la app abrió Inicio sin cargar la página ni solicitar conexión.
- [x] Se cambió el CTA principal a la ruta directa `trust://open_url`; el Universal Link HTTPS queda como alternativa. Este nuevo orden no se ha probado físicamente.
- [ ] Trust Android: abrir el checkout dentro de Browser/DApps y comprobar prompt de conexión, dirección y desconexión. Sin WalletConnect y Project ID, no existe una sesión de conexión automática desde Brave/Chrome que se salte el navegador DApp.
- [ ] No pulsar Pagar durante esta comprobación. La llegada a una pantalla de aprobación no demuestra por sí misma una transferencia o el registro de una compra.

La lista general continúa en **70/77**. El retest confirma MetaMask hasta la aprobación y deja Trust abierto; el esquema directo actualizado requiere prueba en el teléfono. [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Mobile/WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

**Resultado vigente comunicado por el usuario:** MetaMask abrió ngrok en su navegador integrado y permitió firmar la transacción; sin el hash no se puede saber si se transmitió. Trust abrió la app como acceso directo y no pidió conexión. El CTA actual ya no lanza Trust: copia la URL y pide abrir Browser/DApps manualmente. Este recorrido aún no tiene resultado físico.

**Implementación vigente:** Keplr solo consulta la dirección de Cosmos Hub; CTRL/xDeFi no está disponible en el selector actual. Safe y WalletConnect siguen fuera del checkout. `npm run build` pasó, `/gmt-wallets` respondió 200 y `git diff --check` pasó. REA/Linux analizó el bundle de forma estática y parcial; no ejecutó Android. Los siete puntos pendientes y su evidencia están en el [informe móvil](./gomining-replica-mobile-wallet-audit-2026-11-03.md).

### Estado vigente después de la última prueba Android · 3-nov-2026

Este bloque aclara la verificación; no cambia el denominador 77.

- MetaMask: el usuario reporta que Android + Brave/Chrome + ngrok abrió la réplica en el navegador interno y llegó al paso para firmar/aprobar. No hay hash ni confirmación; revisa Actividad de MetaMask antes de volver a pagar.
- Trust Wallet: abrió Inicio sin cargar la réplica ni mostrar permiso. Los enlaces automáticos se quitaron de Carteras y checkout en móvil; el botón principal ahora copia la URL para abrirla en **Trust Wallet → Browser/DApps**.
- La inspección del bundle compilado encontró los dos CTA de copia y no encontró los enlaces automáticos de Trust; confirma el contenido generado, no un retest físico en Android.
- Trust manual sigue pendiente: carga de la URL copiada, permiso de dirección aceptado/rechazado, dirección retornada y desconexión. No pulsar **Pagar** para esta comprobación.
- Build actual: `npm run build` pasó (945 módulos); `/gmt-wallets` y `git diff --check` quedan verificados en este corte. Rollup mantiene una advertencia no bloqueante sobre el chunk Solana.
- REA/Linux: análisis estático del bundle `dist/assets/App-BgZisbbC.js`, Evidence resumen `ev_b767b186ffc3f3c66b3c986f28377e681372f2bf97a8913de8ea805b832b7dd6`, padre `ev_9db331639a772cc22492a63a5edbda3ce445ddeff6ba873a1288eb757ede3ff5`. Se analizó 1 de 24 archivos JS; el grafo semántico quedó parcial. No ejecutó la página ni Android.
- Los otros pendientes: conexión y estados reales en las demás wallets, hash/confirmación, resultado Bridge, contratos/tokens, requisitos KYC/elegibilidad y backend de órdenes; se detallan en el [informe móvil](./gomining-replica-mobile-wallet-audit-2026-11-03.md#siete-comprobaciones-que-siguen-abiertas).

El total general permanece en **70/77**. La prueba de MetaMask es evidencia reportada de llegada a la firma; no demuestra pago confirmado. Trust no se marca como conectada hasta que el browser in-app cargue la web y devuelva su dirección.

### Retest móvil informado y rechazo controlado · 3-nov-2026

- [x] **MetaMask Android:** con Brave/Chrome y ngrok, la réplica abrió en el navegador integrado y mostró aprobación de la transacción; el usuario reporta que pudo firmarla. No hay hash ni confirmación; revisar Actividad de MetaMask antes de volver a intentar. No se repite el pago.
- [x] **Trust Android:** se confirmó el resultado reportado: la app abrió en Inicio sin página ni solicitud. La conexión desde Brave/Chrome externo sigue fuera del alcance sin WalletConnect v2 y `projectId`; el botón de la réplica copia la URL para cargarla en Trust → Browser/DApps.
- [x] **Cerrar X con conexión pendiente:** en el proveedor local de QA (`connect-pending`), inicié una solicitud ficticia y pulsé X. El checkout desapareció, regresó Inicio y dejó visible la advertencia sobre una solicitud externa que podría continuar.
- [x] **Cancelar pago en wallet simulado:** en `payment-reject`, el proveedor falso devolvió rechazo al método de envío. El checkout se cerró y mostró que no se envió pago. El fixture local intercepta la llamada; no se abrió una wallet real ni se transmitió una transacción.
- [ ] **Wallet real con solicitud pendiente:** la prueba controlada no demuestra el comportamiento del diálogo MetaMask real ni que cerrar la página cancele su solicitud. Cancelar desde la wallet y revisar Actividad sigue siendo necesario antes de cualquier reintento.
- [ ] **Trust Browser/DApps:** falta probar en el teléfono que la URL copiada cargue la réplica dentro de Trust, aparezca el permiso de dirección y la página reciba esa dirección.

El total de la matriz se mantiene en **70/77**. Esto cierra pruebas locales del modal y registra los dos resultados móviles reportados, pero no valida una transferencia on-chain ni conexión Trust. Ver el detalle en el [informe de auditoría móvil](./gomining-replica-mobile-wallet-audit-2026-11-03.md).

### Revisión documental de wallets móviles · 3-nov-2026

La guía de integración por wallet está contrastada con documentación oficial y el código local; esto no cuenta como validación en un teléfono. Consulta la [matriz completa, las fuentes y las seis tareas técnicas/dispositivo abiertas](./gomining-replica-mobile-wallet-audit-2026-11-03.md#investigación-documental-de-conexión-móvil-por-wallet--3-nov-2026).

- [x] **MetaMask Android:** el usuario informa que ngrok abrió dentro del navegador DApp y llegó a firmar/aprobar. Sin hash, la transferencia puede estar enviada pero no está verificada. Revisar Actividad antes de otro intento.
- [x] **Trust Android:** el usuario confirma que el enlace abrió Inicio sin cargar la web. Se mantiene el botón de copiar URL y usar Browser/DApps como fallback; esa ruta manual sigue abierta.
- [x] **Trust/WalletConnect:** la documentación oficial confirma Project ID necesario para conectar desde navegador móvil externo mediante WalletConnect v2; se excluye mientras no se configure ese servicio.
- [x] **Solflare y Phantom:** confirmado en documentación el protocolo de deeplink cifrado y sesión; en Phantom el endpoint de pago `signAndSendTransaction` usado por el código aparece marcado como obsoleto y requiere actualización antes de cerrar la integración.
- [x] **Coinbase:** documentación actual recomienda `@base-org/account`; el proyecto conserva `@coinbase/wallet-sdk` 4.4.0. Debe comprobarse la ruta móvil o decidir migración.
- [x] **Keplr, TronLink y UniSat:** sus docs distinguen navegador integrado, callback propio y receptor de esquema. La implementación actual es address-only para Keplr; provider en navegador DApp para TronLink; UniSat mobile requiere un retorno no implementado.
- [x] **CTRL/xDeFi y Safe:** no hay soporte en el checkout actual. La documentación disponible no valida un conector móvil genérico libre de WalletConnect Project ID; Safe usa WalletConnect para conexión general a dApps.
- [ ] **Pruebas reales:** sigue pendiente probar Trust Browser/DApps, conexión/permiso/rechazo/desconexión de cada proveedor, revisar hash previo de MetaMask, pagos de prueba y reconciliación real. No pagar durante validación de conexión.
- [ ] **Decisión técnica:** elegir entre rutas wallet-specific dentro de cada app o WalletConnect/Reown con Project ID; si se elige la segunda opción, revisar las cuotas/licencia actuales, que distinguen RPC y MAU autenticados/embebidos de visitas a wallets self-custodial.

La cifra base permanece provisionalmente en **70/77**; el análisis documental no suma una conexión móvil verificada. La auditoría REA/Linux volvió a devolver `Transport closed` al listar targets, por lo que no existe captura nueva de Android.

### Último resultado Android y estado corregido de Trust · 3-nov-2026

- [x] **MetaMask:** según el usuario, Android + Brave/Chrome + ngrok abrió la réplica en el navegador interno de MetaMask y dejó aprobar/firmar una transacción. Esto no prueba difusión ni confirmación: falta el hash/Actividad. Revisar antes de cualquier reintento; no hacer otro pago de prueba.
- [x] **Trust:** según el usuario, abrir desde Brave/Chrome solo mostró Inicio de Trust, sin réplica ni permiso. No se cuenta como conectada.
- [x] **Resultado atribuido con precisión:** no se identificó qué variante de enlace abrió la app; el CTA actualizado prueba primero `trust://open_url`.
- [x] **Nuevo deeplink:** el CTA principal de Carteras y checkout ahora intenta `trust://open_url`, con Universal Link HTTPS y copiar URL como alternativas. Conserva el marcador de conexión y el contexto del checkout. En la ruta manual, abrir la URL desde Trust → Browser/DApps permite usar el provider inyectado sin WalletConnect Project ID.
- [ ] **Prueba de dispositivo Trust:** comprobar que el deeplink nativo cargue la réplica en Browser/DApps, que aparezca el permiso, que aceptar devuelva la dirección, que rechazar no conecte y que desconectar limpie el estado. Repetir el punto de entrada desde compra y Recargar, sin pagar.
- [ ] **Fallback Trust:** si el deeplink abre Inicio, copiar la URL, pegarla en Trust → Browser/DApps, aceptar `Visit` si ngrok lo muestra y validar conexión/rechazo/desconexión.
- [ ] **MetaMask:** revisar Actividad y conservar el hash si la operación fue enviada. No repetir una firma de pago para probar.

**Puntuación:** se conserva **70/77**; el reporte de aprobación MetaMask no cierra estados de pago y Trust sigue sin devolver dirección. La nueva ruta `trust://` requiere prueba física. REA/Linux no se reintentó después de dos `Transport closed`; no hay evidencia de ejecución móvil nueva. Consulta el [informe móvil](./gomining-replica-mobile-wallet-audit-2026-11-03.md#resultado-de-la-última-prueba-android-y-ajuste-de-trust--3-nov-2026) para las fuentes oficiales y el detalle del cambio.

### Retest Android: MetaMask funciona hasta aprobación; Trust abre Inicio · 3-nov-2026

- [x] **MetaMask:** confirmaste Android + Brave/Chrome + ngrok: la página abrió en el navegador interno de MetaMask y te permitió llegar a firmar/aprobar la transacción. No se aportó hash; no puedo confirmar si se difundió ni liquidó. Revisa la Actividad de MetaMask antes de volver a intentarlo.
- [x] **Trust Wallet:** confirmaste que abre la app como acceso directo y no muestra la página ni una solicitud. El flujo anterior no tenía activo un Universal Link funcional en el botón principal.
- [x] **Corrección local:** Carteras y checkout ahora forman el enlace Universal Link documentado `https://link.trustwallet.com/open_url?coin_id=…&url=…`. El destino lleva `gmWalletConnect=trustwallet`; si Trust carga la página en Browser/DApps, la réplica solicita acceso a la dirección. En el checkout, la URL conserva producto, importe y red. `coin_id` se define por la red elegida (714 BNB, 60 Ethereum, 966 Polygon).
- [x] **Respaldo:** ambos flujos conservan copiar URL para abrirla manualmente en Trust Wallet → Browser/DApps. El Universal Link solo navega; no concede permisos ni firma pagos. No hace falta WalletConnect Project ID cuando la conexión se completa dentro del navegador DApp de Trust. WalletConnect v2 sí necesita Project ID para una sesión originada en Brave/Chrome sin entrar al navegador DApp.
- [ ] **Retest físico Trust:** desde Android + Brave/Chrome + ngrok, pulsa **Abrir en Trust Wallet**. Si solo ves Inicio, vuelve y usa **Copiar URL**, abre Browser/DApps, pega la URL y acepta **Visit** si aparece. Carga `/gmt-wallets`, confirma que se muestre la solicitud de conexión, acepta y verifica la dirección; después desconecta. Repite al entrar desde **Crear minero** y **Recargar**, sin pulsar **Pagar**.
- [ ] **Verificación MetaMask restante:** repetir solo conexión, rechazo y desconexión; no pagar. La prueba previa alcanzó la aprobación y pudo haber transmitido una transferencia real, así que revisa Actividad antes de cualquier intento nuevo.
- [ ] **REA móvil:** la llamada a `rea/list_browser_targets` con origen limitado a `http://127.0.0.1:5173` se cerró con `Transport closed` en dos intentos. No hay captura REA de este Android. El informe separa esto de tu observación y del cambio verificado en el código; hace falta reiniciar/reconectar REA para una nueva captura.

El total general se mantiene provisionalmente en **70/77**: el enlace nuevo está implementado y compilable, pero la conexión de Trust todavía no se marca funcional hasta observar la dirección devuelta en Android. La prueba de MetaMask es un reporte de llegada a la aprobación, no una confirmación on-chain. La guía oficial de Trust define `open_url` como navegación a Browser/DApps y separa ese paso de WalletConnect: [deep links de Trust](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) y [conexión móvil con WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

### Estado final del retest Android y fallback de Trust · 3-nov-2026

Este bloque es el estado más reciente; sustituye las instrucciones previas que ponían el enlace automático de Trust como único camino recomendado.

- [x] **MetaMask Android:** desde Brave/Chrome + ngrok, la página abrió dentro del navegador de MetaMask y permitió llegar a firmar/aprobar. Es un resultado reportado por el usuario; no se recibió hash ni prueba de confirmación. Revisa Actividad de MetaMask antes de cualquier otro intento.
- [x] **Trust Android:** desde Brave/Chrome + ngrok, la app abrió en Inicio sin página ni prompt. El deep link automático no se considera funcional para este teléfono.
- [x] **Ajuste local:** en móvil, copiar la URL del sitio o el checkout es la acción principal para Trust; el enlace `open_url` queda secundario. El checkout copiado conserva `gmWalletConnect`, producto, importe, moneda y red. Al cargar en el navegador DApp, el provider solicita acceso a la dirección; pagar requiere aprobación separada.
- [ ] **Trust Browser/DApps:** en el teléfono abre Trust → Browser/DApps, pega la URL copiada y acepta **Visit** si ngrok lo muestra. Comprueba que aparezca la solicitud, acepta y confirma la dirección; después desconecta. Repite entrando desde Crear minero y Recargar, sin enviar fondos.
- [ ] **Transferencia MetaMask:** si aprobaste el envío, revisa Actividad y conserva el hash. No repitas la transferencia para probar; sin hash no se confirma el estado on-chain.
- [ ] **REA/Linux:** sigue sin captura de esta interacción; `list_browser_targets` devolvió `Transport closed` dos veces. Hace falta reconectar REA para una nueva captura.

No cambia el total de referencia **70/77**. La guía de Trust describe `open_url` como navegación; para conexión iniciada desde Brave/Chrome la ruta móvil oficial es WalletConnect v2, que exige `projectId` y continúa fuera del alcance acordado. [Deep links de Trust](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Wallet Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile).
