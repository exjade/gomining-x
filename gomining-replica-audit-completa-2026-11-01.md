# Auditoría funcional completa de la réplica GoMining

**Corte:** 1 de noviembre de 2026 (hora local de Ojinaga)  
**Checklist en la última actualización de este informe (2-nov-2026):** 69 de 76 verificaciones confirmadas; 7 siguen pendientes. El corte interactivo original fue el 1-nov-2026; la adenda de Phantom está en [`gomining-replica-audit-2026-11-01-seguimiento.md`](./gomining-replica-audit-2026-11-01-seguimiento.md). El conteo excluye el marcador `[x]` que aparece en una instrucción de uso del checklist.  
**Entorno de interacción REA:** Chromium temporal, viewport móvil 390 × 844 px, tema oscuro, movimiento reducido. Esta actualización usó preview local `http://127.0.0.1:5184` y el HTTPS temporal [trycloudflare](https://luis-reach-award-publicity.trycloudflare.com/home).  
**Conclusión:** los recorridos de interfaz y las simulaciones están avanzados. MetaMask, Solflare y Phantom tienen handoff móvil implementado en código; conexión, aprobación y retorno desde aplicaciones reales aún no están verificados. La conciliación de pagos reales y la activación automática de productos no están implementadas de extremo a extremo.

## Evidencia REA adicional: cerrar checkout reanudado

REA abrió a 390 × 844 px una URL HTTPS de prueba que reconstruye el checkout a partir de `gmPay`. Después de esperar a que apareciera el checkout, pulsó **Cerrar pago**. El modal desapareció y la URL quedó en `/home` sin parámetros `gmPay`. Evidence `ev_282d93b555ff50a8a19c3dad00cd928b32ca61a047430e8984c4969915015a79`; cleanup `terminated-owned-process`. No había una wallet conectada ni se llamó al pago. Esto verifica la X al regresar a la página con el checkout restaurado, pero no una cancelación/rechazo dentro de una wallet real.

En el corte de esta evidencia el checklist estaba en **59/67**; revisiones posteriores lo dejaron en **62/67**, **63/68** y **64/69**. La adenda documental de MetaMask y Solflare, la comprobación QA del recibo y las brechas de cobertura de tokens/KYC llevaron el corte a **67/74**. La adenda posterior del handoff nativo cifrado de Solflare añadió un punto confirmado y dejó el total vigente en **68/75**, con siete pendientes. La frase instructiva que contiene `[x]` no es una casilla; el error anterior fue tratar el corte 67/74 como vigente después de agregar el nuevo punto.

## Cierre REA con Connect Wallet pendiente · 1-nov-2026

Se reprodujo la conexión MetaMask bloqueada con el fixture local de QA: `eth_requestAccounts` queda sin resolver y no implementa envío de transacciones. En un Chromium temporal a 390 × 844 px, REA esperó a que cargara la cotización, pulsó **Conectar MetaMask**, esperó el estado pendiente y cerró el checkout de dos formas:

| Acción | Evidence ID | Resultado |
|---|---|---|
| **Cerrar pantalla/Cancelar** | `ev_12aec889b4dc50699d3e485f583f8c028fcb22b2d1c02cdc0d8166ea8d7bcab5` | El diálogo cerró; la página principal volvió a mostrarse y desaparecieron los parámetros del checkout. |
| **X · Cerrar pago** | `ev_16781c6d439c4d9ceb251be8bacf0a280950461231501f2aa859cb85cf262d91` | El diálogo cerró; la URL quedó en `/home` con solo el parámetro `gmWalletTest` del fixture. No se registraron errores de página. |

REA terminó ambos perfiles con `terminated-owned-process`. El aviso indica que cerrar la réplica no cierra un prompt que continúe dentro de la aplicación de wallet. Esta prueba confirma la cancelación de la conexión pendiente en la UI usando un proveedor falso; no acredita el cierre de una solicitud de MetaMask Android/iOS ni prueba el retorno desde un teléfono. No se inició una solicitud de pago, no se firmó y no hubo transferencia.

## Contraste de destinos con capturas de Solflare aportadas · 1-nov-2026

Comparé visualmente las capturas Bridge compartidas por el usuario con `src/paymentDestinations.ts`. Las cinco vistas de BNB Chain, Bitcoin, Ethereum, TRON y Polygon muestran su red, dirección de depósito permanente y USDT como token de recepción, y coinciden con la configuración de la réplica. Esta verificación proviene de imágenes aportadas en la conversación, no de una sesión REA o una lectura en vivo de Solflare; no confirma que los destinos, mínimos, activos compatibles o tarifas sigan vigentes. La captura de la billetera Solana no muestra la dirección USDT SPL en contexto de recepción, así que esa ruta directa sigue pendiente de comprobar dentro de Solflare.

## Actualización posterior: enlace móvil y reanudación del checkout

El dominio ngrok compartido anteriormente devolvía `ERR_NGROK_6024` a la primera visita: el navegador del comprador veía la intersticial y no la app. Evidencia REA del error: `ev_1d2bbf30ad98bd842cc20422f1b5c7350aa685e590a91b56f0a2ab63f0f74b36`. La lectura HTTP con el encabezado de omisión sí llegaba a Vite, pero un enlace web/MetaMask no podía añadir ese encabezado. Inicié un Quick Tunnel HTTPS temporal de Cloudflare, configuré el preview para aceptar únicamente ese host y comprobé que entrega la réplica con HTTP 200. La URL temporal es pública y puede cambiar al reiniciar el túnel.

En el corte de esa revisión, Android usaba `mobile.useDeeplink: true`, que genera `metamask://`; la biblioteca también ofrece el Universal Link HTTPS. El SDK pide la conexión por separado del pago. La reanudación conserva producto, importe, moneda, red y wallet seleccionada en `gmPay`, de forma que el checkout se pueda reconstruir si el navegador recarga al volver de MetaMask. Este párrafo describe el comportamiento anterior al reporte de pantalla en blanco; véase el ajuste posterior al final del informe.

> Esta descripción refleja la configuración de ese corte. Tras el reporte de Android, la configuración se cambió a `mobile.useDeeplink: false` para seleccionar el Universal Link HTTPS MWP. No se ha comprobado en el teléfono si el handoff resuelve la pantalla en blanco.

REA verificó en Chromium móvil que el host HTTPS abre Inicio y `?modal=paywall-create` (`ev_a05448b8e41650438bba29e38b0e0d672a3c775436c3d15a9860ad6a8e8e7b6c`), y que una URL `gmPay` restaura el checkout con el producto, Ethereum y MetaMask seleccionados (`ev_262dde8859959bece2ea32531379edf15f29914211de3fc6ae28e2d339554cd2`). Ambos perfiles terminaron con `terminated-owned-process`. Esto prueba la web HTTPS y el mecanismo de reconstrucción de ruta; **no** prueba que un teléfono abra MetaMask, regrese, autorice la conexión o firme una transacción.

En ese corte actualicé [WalletPaymentCheckout.tsx](./src/WalletPaymentCheckout.tsx) y [App.tsx](./src/App.tsx) para persistir la URL temporal antes del handoff de MetaMask. `npm run build` pasó; el total actual aparece en el resumen de este informe.

## Qué hice en esta revisión

- Ajusté la escala tipográfica móvil de toda la plataforma. En anchos de hasta 900 px, los metadatos que caían por debajo de 12 px pasan a 12 px; los controles y textos de lectura se muestran a 14 px. El ajuste está al final de [styles.css](./src/styles.css).
- Usé REA para capturar Inicio y el configurador/revisión en 390 × 844 px. Desde el configurador pulsé **Continuar** y luego la X **Cerrar configurador**. El modal desapareció, la URL volvió a `/home` y no quedó ningún diálogo abierto.
- El checkout apareció sin wallet conectada y dejó **Conectar wallet y pagar** deshabilitado. No abrí una wallet, no aprobé una firma y no envié fondos.
- Ejecuté `npm run build`: TypeScript y Vite terminaron correctamente. Sigue el aviso de Rollup por un chunk de 695.66 kB sin comprimir.

## Resultado por área

| Área | Estado | Evidencia y alcance |
|---|---|---|
| Inicio y navegación | **Cumple en interfaz/demo** | Inicio cargó a 390 px con saldo demo, acciones y tarjetas; la cabecera mostró un botón de conexión, saldo, carrito y perfil. No hay dos botones de wallet ni iconos de notificación en la cabecera actual. Captura REA `ev_6ebdd4fedaa0084c58edfb3bcc0b9241fa8c4b9a99d59ee9751f013531cda35d`. |
| Tipografía y layout móvil | **Mejorado; revisión parcial** | Se eliminaron los tamaños móviles de 6–11 px: mínimo de 12 px para metadatos y 14 px para lectura/controles. Inicio y checkout se ven completos en la captura de 390 px; no repetí todas las rutas a 768/1440 px ni medí cada breakpoint. |
| Configurador | **Cumple en interfaz** | `/home?modal=paywall-create` mostró compra única, planes y configuración personalizada. El catálogo visible es una captura fechada, no una consulta en vivo a GoMining. Captura REA del configurador: `ev_d7bddb60ee6e572aad40b5f3d6eda2a066cabd9f3e2a7295cb0b196a4f1aff54`. |
| Revisión y cierre con X | **UI y rechazo simulado verificados; wallet real pendiente** | En móvil, **Continuar** abrió la revisión y la X la cerró. REA restauró y cerró un checkout desde `gmPay` (`ev_282d93b555ff50a8a19c3dad00cd928b32ca61a047430e8984c4969915015a79`). Una prueba QA con rechazo EIP-1193 en la compra cerró checkout y mostró aviso sin recibo (`ev_b530e05439cd11d4c19d83b5844e031a970b028bb45231371ccbe39ea8c84f`). La X y Cancelar también cerraron mientras `eth_requestAccounts` permanecía pendiente (evidencias `ev_16781c6d439c4d9ceb251be8bacf0a280950461231501f2aa859cb85cf262d91` y `ev_12aec889b4dc50699d3e485f583f8c028fcb22b2d1c02cdc0d8166ea8d7bcab5`). No se rechazó en MetaMask real. |
| Checkout de minero | **Flujo de rechazo cubierto con fixture; pago real pendiente** | REA recorrió configuración, consentimiento, cotización, conexión simulada y solicitud rechazada. El checkout se cerró y no apareció recibo: `ev_b530e05439cd11d4c19d83b5844e031a970b028bb45231371ccbe39ea8c84f`. No se transmitió una transacción. |
| Recargar | **Rechazo UI verificado con fixture; pago real pendiente** | REA abrió Recargar, conectó el proveedor falso, solicitó el pago y observó el aviso tras el rechazo: `ev_a6adf1e07670f1e7ef2ab1ec622b29d495ded317289cb0c2060af2114cabbb7c`. No se creó recibo. Una transferencia real no acredita saldo hasta que un backend la verifique. |
| Connect Wallet | **Interfaz verificada con fixture; proveedores reales pendientes** | REA conectó el proveedor MetaMask simulado y vio la dirección pública en el encabezado (`ev_23d1b94ef1f11eb913169b2195c7d6366c0c9aa384028c3f6f6018f8583463a2`); al desconectar, el encabezado volvió a `Conectar una wallet` (`ev_67ec330f77cd54ede39bab7d652af9a2ca60436ec1098d64cc4ccaa9c68103dc`). También confirmó el cierre de checkout si el permiso no responde, mediante X y Cancelar. No se conectó una wallet real. |
| Pagos móviles | **Pendiente de teléfono y dominio HTTPS** | MetaMask usa su SDK de conexión móvil; las otras integraciones construyen enlaces de apertura del navegador dApp de la wallet. La interacción se hizo en un navegador headless sin wallet, no en iOS/Android. `127.0.0.1` por HTTP no demuestra ni permite validar el retorno desde una wallet móvil. |
| Cotizaciones y gas | **Parcial** | La réplica obtiene precios spot y calcula el importe antes del envío; la wallet es quien presenta el gas final al usuario. El 1% de Bridge es una estimación, no una cotización garantizada. El precio de catálogo GoMining es una captura fechada y puede cambiar. |
| Destinos y Solflare Bridge | **Parcial; no apto para aceptar pagos reales todavía** | Cinco capturas compartidas por el usuario (BNB Chain, Bitcoin, Ethereum, TRON y Polygon) coinciden con los destinos configurados y muestran USDT como recepción. No se reabrió Solflare para verificar vigencia; la ruta USDT SPL directa carece de captura de recepción verificable. Mínimos, tarifas, liquidez, slippage y recepción final aún requieren validación. No puede prometerse que el Bridge o una wallet externa nunca solicite KYC. |
| Suscripciones | **Demo parcial** | El mensual de USD 29.99/30 días y sus beneficios se simulan: +1% de potencia y retiro demo sin cola diaria. El anual permanece deshabilitado por indicación del usuario. No hay alta, renovación ni activación reales al recibir una transferencia. |
| Referidos y Unilevel | **Simulador solamente** | El 10% directo y el simulador de niveles no generan liquidaciones. REA encontró en el ejemplo `unilevel-ejemplo/1nvezt` una distribución fija de 10 pesos `[16, 15, 14, 11, 10, 9, 8, 7, 6, 4]` sobre 20,000 tokens por venta; no representa reparto de ganancias de minería ni configuración administrativa. Evidencias REA: `ev_44099cee80357648da18fcdfcb629b40c11be01db2738f50ef08935275e9b581` y vista `ev_84dc5ddc8079a771c0cdfb253826dcf8c7ac39cca195f2a43242dc0a03828d5f`. El 10% directo debe reconciliarse con el fondo Unilevel para no contabilizar la misma recompensa dos veces. |
| Pool, operaciones, workers y granjas | **Lecturas públicas y demo** | El historial público de pagos de Kryptex/Pearl y la estimación PRL son datos de terceros. Workers y granjas de la réplica son demo; no hay telemetría de equipos propios ni reparto de ingresos por usuario. Se comprobaron skeletons y error recuperable de lecturas de pool en una escena local aislada. |
| Economía del operador | **Calculadora demo** | Permite escenarios de potencia, electricidad y mantenimiento; no constituye contabilidad real. Faltan tarifas y consumos verificados, ingresos conciliados y liquidaciones de pool. |
| Preventa | **Demo** | La asignación y el recibo son locales; no hay campaña, contrato ni emisión real. |
| Firebase | **Persistencia demo verificada** | Tras la autorización, `firebase projects:list --json` volvió a enumerar `salad-miners` como activo (lectura solamente). El proyecto tiene Auth anónimo y reglas limitadas al documento propio de estado demo; el servicio y el SDK se probaron con lectura/escritura y aislamiento. En una sesión aislada, USD 1 demo persistió tras recargar. Esto no es un backend de pagos. No observé ni afirmo limpieza de identidades anónimas remotas creadas por perfiles temporales. |
| Backend de pagos y activación | **No implementado** | No hay orden autenticada, verificador on-chain, conciliación, idempotencia ni activación de minero/suscripción. Un hash o una transferencia a una dirección estática no prueba por sí sola qué producto compró una persona. |

## Cinco comprobaciones pendientes del checklist

1. Conectar y desconectar cada proveedor real disponible: Solflare, Phantom, MetaMask, Coinbase Wallet, Trust Wallet, TronLink y UniSat.
2. Cancelar o rechazar la conexión desde MetaMask real, incluida la vuelta desde su aplicación móvil.
3. Revisar el recibo de una transacción real existente y separar hash de origen de conversión Bridge pendiente.
4. Revalidar en Solflare en vivo la ruta directa USDT SPL y que las cinco rutas Bridge sigan vigentes, incluidos activos, mínimos, tarifas y destinos, antes de aceptar pagos.
5. Implementar el backend autenticado de órdenes, verificación de pagos, idempotencia, activación y auditoría.

Los rechazos, recibos de QA y conexión/desconexión de MetaMask se ejercitaron con un proveedor local falso que no transmite. No hubo firma ni pago real. Las primeras cuatro casillas requieren una wallet real o evidencia verificable en Solflare; la quinta es trabajo de backend y producto, no una prueba de navegador.

## Adenda REA — pagos simulados y autorización de Firebase · 1-nov-2026

Se añadió un proveedor EIP-1193 **solo para desarrollo local** (`gmWalletTest` en localhost); responde con una cuenta de prueba y simula rechazo o un hash ficticio. `eth_chainId` devuelve BNB Chain (`0x38`), red por defecto en Recargar. No existe una operación de broadcast en este fixture.

| Escena REA | Evidence | Resultado observado |
|---|---|---|
| Compra de minero con rechazo, 390 × 844 | `ev_b530e05439cd11d4c19d83b5844e031a970b028bb45231371ccbe39ea8c84f` | Se avanzó a checkout, se conectó el fixture, se rechazó el envío; checkout cerrado, aviso visible y sin recibo. URL final `/home`. |
| Recargar con rechazo, 390 × 844 | `ev_a6adf1e07670f1e7ef2ab1ec622b29d495ded317289cb0c2060af2114cabbb7c` | Recargar abrió checkout, conexión y cotización; rechazo llevó al aviso, no a un recibo. |
| Comprobante de transferencia simulado, 390 × 844 | `ev_23d1b94ef1f11eb913169b2195c7d6366c0c9aa384028c3f6f6018f8583463a2` | El recibo dice `TEST`, identifica el hash como ficticio/inexistente y muestra origen no verificado y Bridge pendiente. No representa un recibo real. |
| Dirección en cabecera y desconexión, 390 × 844 | `ev_67ec330f77cd54ede39bab7d652af9a2ca60436ec1098d64cc4ccaa9c68103dc` | El fixture conectó; se pulsó **Desconectar**; la vista quedó en `SIN CONECTAR` y la cabecera mostró `Conectar una wallet`. |

Las cuatro escenas acabaron con `cleanup: terminated-owned-process`. La cuenta `0x1111…1111` pertenece al fixture. No se abrió MetaMask, no se solicitó firma, no se transmitió ni verificó una transacción real. La compilación `npm run build` pasó (554 módulos); queda el aviso no bloqueante de Rollup por el chunk de Solana de 695.66 kB. La búsqueda en `dist/assets` no encontró los marcadores `gmWalletTest`, `payment-success` ni el texto del proveedor QA. `firebase projects:list --json` confirmó por lectura que `salad-miners` está activo; no se desplegaron funciones ni se cambiaron servicios de pago.

## Evidencia REA de esta revisión

| Escena | Evidencia | Resultado |
|---|---|---|
| Inicio después del ajuste tipográfico, 390 × 844 | `ev_6ebdd4fedaa0084c58edfb3bcc0b9241fa8c4b9a99d59ee9751f013531cda35d` | Inicio visible y adaptable; sin wallet conectada. |
| Configurador directo, 390 × 844 | `ev_d7bddb60ee6e572aad40b5f3d6eda2a066cabd9f3e2a7295cb0b196a4f1aff54` | Paquetes y navegación del configurador visibles. |
| Revisión del minero tras **Continuar**, 390 × 844 | `ev_89c34d3b593d6ec7996e68e71ad37efd2800fb6a0cfd7875821906935c37e97d` | Consentimiento visible; pagar deshabilitado al no haber wallet. |
| Cierre con X y regreso a Inicio | `ev_186f4edc8829898b29d9c3f02d937678f68589f9bb8890110ed5d2db6c73eb3b` | URL `/home`, sin diálogo. El perfil temporal terminó correctamente. |
| X del checkout restaurado desde `gmPay`, 390 × 844 | `ev_282d93b555ff50a8a19c3dad00cd928b32ca61a047430e8984c4969915015a79` | REA abrió checkout, lo cerró y comprobó URL `/home` limpia; perfil temporal terminado correctamente. Sin wallet/pago. |

REA capturó el sitio local con un Chromium temporal y ejecutó únicamente la navegación, el botón **Continuar**, el botón X y esperas de carga. No se introdujeron credenciales, no se conectó wallet y no se firmó ni transmitió ninguna transacción. Las capturas son evidencia de interfaz, no de pago real ni de ejecución en un teléfono.

## Referencias para continuar

- Checklist vigente y rutas: [gomining-replica-checklist.md](./gomining-replica-checklist.md) y [catalog.ts](./src/catalog.ts).
- Checkout y cierre: [WalletPaymentCheckout.tsx](./src/WalletPaymentCheckout.tsx), [walletSession.ts](./src/walletSession.ts), [metamaskConnect.ts](./src/metamaskConnect.ts) y [walletAppLinks.ts](./src/walletAppLinks.ts).
- Cotizaciones y destinos: [paymentQuote.ts](./src/paymentQuote.ts), [paymentDestinations.ts](./src/paymentDestinations.ts) y [minerCatalog.ts](./src/minerCatalog.ts).
- Firebase de demo: [firebase.json](./firebase.json), [firestore.rules](./firestore.rules) y [firestoreDemoSync.ts](./src/firestoreDemoSync.ts).
- Informe anterior de código, reglas y persistencia: [gomining-replica-audit-2026-11-01-seguimiento.md](./gomining-replica-audit-2026-11-01-seguimiento.md).

## Adenda final: ajuste de MetaMask móvil, cierre de modal y Firebase · 1-nov-2026

El usuario reportó que, desde Android, abrir MetaMask podía dejar un navegador interno en blanco. Antes el código usaba `mobile.useDeeplink: true` en Android; después del reporte se cambió a `false`, para que el SDK construya el Universal Link HTTPS `/connect/mwp`. En el navegador interno de MetaMask se espera usar el proveedor inyectado sin navegar fuera. `src/walletSession.ts` espera 500 ms por proveedores EVM inyectados tardíamente. El checkout preserva `gmPay` antes del handoff. X y Cancelar se probaron con un proveedor EIP-1193 falso cuya solicitud queda pendiente: cierran la interfaz y muestran el aviso; no cancelan un prompt que permanezca abierto en la app de wallet. La prueba Android real sigue pendiente.

REA analizó estáticamente dos archivos antes del cambio del Universal Link: Evidence padre `ev_1462eab72b32466f33553c63bc56571802871181481c8ac27ab1fa1d36115725`, resumen `ev_2422ccebb25c2cb79267ca1c0bf5f7c8b7527a681054d60185f0f67a5fd167a`. Se parsearon ambos, con 5,908 nodos AST, 43 hallazgos y cero fallos de parseo; cobertura semántica parcial y 1,436 incógnitas. Esto valida estructura estática, no ejecución de MetaMask ni el handoff móvil. El archivo actualizado recibió una nueva pasada REA al final de este informe; `npm run build` pasó y conserva el aviso no bloqueante de tamaño del chunk.

Una captura REA adicional en Chromium temporal a 390 × 844 px terminó con `execution_failure` y `cleanup_incomplete`. Se siguió la guía de recuperación y no se inició otra escena de navegador REA durante este cierre. La navegación web de checkout restaurado y su cierre siguen sustentados por la evidencia REA previa `ev_282d93b555ff50a8a19c3dad00cd928b32ca61a047430e8984c4969915015a79`; las pruebas de cierre con una conexión EIP-1193 pendiente son `ev_12aec889b4dc50699d3e485f583f8c028fcb22b2d1c02cdc0d8166ea8d7bcab5` y `ev_16781c6d439c4d9ceb251be8bacf0a280950461231501f2aa859cb85cf262d91`. Ninguna prueba conectó o firmó con una wallet real.

Tras la autorización CLI del usuario, una consulta de lectura confirmó acceso a `salad-miners`. La integración de estado demo ya usa Auth anónimo, reglas restringidas y `src/firestoreDemoSync.ts`; la persistencia se había probado con REST, SDK Web y recarga de la interfaz en un origen aislado. No se redeplegó Firebase en esta revisión. El servicio no guarda wallets, hashes ni acredita compras; sigue pendiente un backend autenticado de órdenes y verificación on-chain.

## Auditoría de rutas directas y navegación (1 nov 2026)

En el navegador integrado se recorrieron **55 URLs directas** del catálogo: 54 rutas de `screens` y la variante `/subscriptions?subscriptionType=platinum`. Las 55 llegaron a una vista con contenido y ninguna produjo una página en blanco, un error de servidor o un error de ruta. `/nft-rewards` redirigió a `/nft-rewards/solo`. Los skeletons iniciales aparecieron mientras se resolvían los módulos; el estado final se consultó después de su carga.

Las rutas cubiertas fueron:

- Panel: `/home`, `/nft-miners`, `/nft-rewards`, `/nft-rewards/solo`, `/nft-rewards/pool`, `/miner-wars`.
- Explorar: `/marketplace`, `/gominers-collection`, `/travel`, `/shop`, `/nft-sell`, `/launchpad`.
- Tokenómica y carteras: `/buy/GOMINING`, `/liquidity`, `/ve-tokenomics`, `/lock/ve-my-lock`, `/lock/ve-voting`, `/gmt-wallets`.
- Finanzas: `/finance/wallets/virtual`, `/finance/wallets/virtual/GOMINING/transactions`, `/finance/banking-cards`, `/finance/instant-funds`, `/finance/simple-earn`, `/finance/simple-earn/overview`, `/operator-economics`, `/buy`, `/deposit`, `/withdraw/GOMINING`.
- Promociones: `/promos`, `/raffles`, `/raffle/036a5b85-4b51-471b-b639-2ffb9afba920`, `/offers`, `/goboxes`, `/bonus-miner-v3`, `/subscriptions`, `/subscriptions?subscriptionType=platinum`.
- Comunidad, referidos y trazabilidad: `/leaderboard/nft`, `/leaderboard/nft-rarity`, `/leaderboard/solo-mining`, `/leaderboard/liquidity`, `/profile`, `/nft-referral`, `/nft-referral/rewards`, `/nft-referral/friends`, `/data-centers`, `/data-centers/pool`, `/data-centers/operations`, `/data-centers/miners`, `/data-centers/farms`.
- Academia y ayuda: `/academy`, `/academy/courses/bitcoin-and-mining`, `/academy/courses/blockchain-and-crypto-course`, `/academy/courses/gomining-basics-course`, `/blog/how-to-set-up-2fa`, `/blog/how-to-withdraw-rewards-safely`.

Se desplegó el menú de secciones y sus enlaces coincidieron con el mapa del catálogo; el enlace del menú a `/operator-economics` abrió esa vista y el logo regresó a `/home`. La cabecera presentó controles separados para saldo demo, conexión de wallet, carrito y perfil, sin dos campanas ni dos enlaces de wallet. En las rutas sin datos privados la app mostró etiquetas de vista local, demo, contenido parcial o tabla vacía; **navegación correcta no significa réplica funcional de cada servicio original**.

La prueba se hizo sobre `http://localhost:5173` sin conectar una wallet ni modificar el estado demo. El navegador seguía mostrando el estado demo guardado que existía antes; no se copió ningún dato de cuenta al informe.

## Adenda REA y documentación oficial de pagos · 1-nov-2026

### MetaMask móvil: análisis REA y contraste oficial

REA analizó estáticamente `src/metamaskConnect.ts` y `src/walletAppLinks.ts` antes del último ajuste: padre `ev_81a5d8a55c67b3c2ec43175752b8520834bc527697b816fa29e99359aca2dd95`, vista `ev_b6a46f9b949fbe95164ec132b028b64af128de2566883ad6267b97b6f80164bb`; dos módulos parseados, cero errores de parseo y alcance parcial. Ese corte usaba la opción nativa de conexión y excluía `/dapp/`. La revisión posterior del archivo actualizado está documentada al final. MetaMask documenta el flujo móvil por deeplink + relay y el proveedor inyectado dentro de su navegador. La documentación y el análisis estático no demuestran el handoff real. Fuentes: [MetaMask Connect](https://docs.metamask.io/metamask-connect/), [plataformas compatibles](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/supported-platforms.md) y [quickstart oficial](https://docs.metamask.io/quickstart/).

### Solflare Bridge: documentación actual y alcance de la réplica

La documentación oficial consultada indica redes de origen Bitcoin, Ethereum, Arbitrum, BNB Chain, Polygon, Tron y Base; activos sujetos a disponibilidad de liquidez; tarifas de 0.1% para stablecoin→stablecoin y 1% para otras combinaciones; gas de origen aparte; slippage máximo de 5%; mínimos variables y posible reembolso cuando no hay liquidez o el importe no llega al mínimo. Las direcciones son permanentes para cada combinación de cadena de origen y token de recepción; activos diferentes pueden enviarse a una misma dirección de cadena si Bridge los admite y hay liquidez. La documentación no incluye la configuración privada de la wallet del usuario ni una lista completa de compatibilidad por cuenta. Fuentes: [redes, tokens y tarifas](https://help.solflare.com/en/articles/17692897-bridge-supported-chains-tokens-and-fees), [dirección permanente y distintos tokens de origen](https://help.solflare.com/en/articles/17692907-your-permanent-bridge-deposit-address-explained), [cómo depositar](https://help.solflare.com/en/articles/17692872-how-to-deposit-funds-using-bridge) y [FAQ](https://help.solflare.com/en/articles/17692854-bridge-faq).

La réplica calcula y envía actualmente BNB, BTC, ETH, TRX o POL nativos en esas rutas, y USDT SPL directo en Solana. No permite seleccionar otros tokens fuente ni obtiene del Bridge sus contratos, decimales, precio, mínimos o cotización de destino. Por ello, no satisface todavía una promesa de “cualquier criptomoneda compatible”. La política pública consultada tampoco garantiza que Solflare o sus proveedores nunca puedan aplicar comprobaciones KYC o restricciones de elegibilidad. El importe neto exacto y el destino configurado deben confirmarse dentro de Solflare antes de usar pagos reales.

### Estado actualizado del checklist

En ese corte, la matriz estaba en **67/74**, con siete puntos pendientes: (1) conectar y desconectar proveedores reales; (2) probar cancelación/rechazo real de MetaMask, incluido el handoff Android; (3) revisar un recibo producido por una transacción existente; (4) confirmar en vivo las direcciones, USDT de destino, activos, cotizaciones, mínimos y fees de Solflare; (5) implementar los activos Bridge adicionales que se quieran aceptar; (6) verificar KYC/eligibilidad de terceros; y (7) implementar y probar el backend de órdenes, confirmaciones, idempotencia y activación. La vista de recibo se comprobó en QA con hash ficticio, no en cadena. No hubo conexión de wallet, firma ni transferencia en esa adenda. La adenda nativa de Solflare posterior añadió el punto 75 y actualizó el resultado a 68/75.

La investigación documental sí redujo una parte de la incertidumbre y añadió la brecha de tokens al checklist. No reemplaza las pruebas externas que necesitan una wallet real, el estado privado de Solflare o un verificador de pagos.

`src/metamaskConnect.ts` se cambió a `mobile.useDeeplink: false`, que en el SDK instalado selecciona el Universal Link HTTPS de conexión. REA analizó el archivo actualizado: vista `ev_42f67664e72ae83548e90d6690cd9d264098bc27aacfbea77cffd9cc905f80c2`, evidencia padre `ev_9107a31cde09455deeacbb23ce5f4e0fc229260bac1e8e28dfc96a1ecb53ba57`; un archivo seleccionado, cero fallos de parseo y vista completa de 29/29 elementos. Otros 24 archivos quedaron fuera de esa vista. El SDK genera `/connect/mwp` para el Universal Link; la réplica sigue excluyendo `/dapp/`. El build pasó. Esto no demuestra que Android abra MetaMask, vuelva al checkout o gestione correctamente el rechazo en un dispositivo real.

`npm run build` pasó después del cambio. Rollup conserva un aviso no bloqueante por el chunk de Solana mayor de 500 kB. No se conectó ni firmó una wallet, no se transmitió una transacción y no se modificó Firebase en esta revisión.

## Reauditoría focalizada posterior · 1-nov-2026

REA/Linux analizó como texto inerte los cinco módulos de checkout, sesión de wallets, handoff MetaMask, enlaces móviles y normalización de rechazos: `WalletPaymentCheckout.tsx`, `walletSession.ts`, `metamaskConnect.ts`, `walletAppLinks.ts` y `walletError.ts`. Evidence `ev_16f6b33955acf0149ed636b1e21192c19ff34dfff11bea8c055c96570e77739c` (análisis padre `ev_23d9a905b3de8430dc9577271230b3cd458a76b5185b7279b39db8a786555e3a`): cinco archivos parseados, cero errores, 110 hallazgos; veinte fuentes no seleccionadas. Esto confirma la estructura del código, no el comportamiento en la app MetaMask.

Se intentó abrir un Chromium REA temporal con un checkout local de QA, pulsar la X y observar que el modal desapareciera. El proveedor devolvió `execution_failure` y `cleanup_incomplete` antes de completar pasos o capturas (`resources: []`); no repetí el escenario. La captura previa de la X con el perfil aislado `5184` sigue siendo evidencia independiente y sí terminó con `terminated-owned-process`. El intento nuevo no comprueba el cierre.

`npm run build` volvió a pasar en ese corte anterior a Solflare: TypeScript y Vite transformaron 554 módulos. Se mantiene el aviso no bloqueante de Rollup por `index.esm-BFHQ7gaW.js` (695.66 kB). Entonces había **67/74 puntos confirmados y 7 pendientes**; la adenda de Solflare posterior elevó el estado a 68/75. El registro detallado está en [`gomining-replica-audit-2026-11-01-seguimiento.md`](./gomining-replica-audit-2026-11-01-seguimiento.md).

## Corrección posterior: handoff nativo de MetaMask móvil · 1-nov-2026

La revisión del SDK instalado y del resultado Android reportado cambió la configuración una vez más. **La configuración vigente en `src/metamaskConnect.ts` es `mobile.useDeeplink: isMobileBrowser()`**: usa `true` en teléfonos y conserva `false` en escritorio. REA analizó estáticamente los cinco módulos que componen este flujo (`metamaskConnect.ts`, `walletAppLinks.ts`, `walletSession.ts`, `WalletPaymentCheckout.tsx` y `App.tsx`), con Evidence `ev_316166f54159ed7a2cb19ead16d1c918bd5e0837eea51efb1509385cd5771d27`: cinco fuentes parseadas, cero errores de parseo, 359 hallazgos y cobertura parcial; veinte fuentes del directorio quedaron fuera de la selección.

El código del SDK `@metamask/connect-multichain` instalado en este proyecto diferencia los dos modos: `true` asigna el deeplink nativo `metamask://connect/mwp?...` a `window.location.href`; `false` construye y abre un enlace HTTPS `https://metamask.app.link/connect/mwp?...`. La app usa el primer modo para llevar la solicitud de conexión a MetaMask mediante Mobile Wallet Protocol (MWP), no el deeplink `/dapp/` que abre el sitio en el navegador integrado. Después de conectar, el checkout conserva el producto y la red y el proveedor EIP-1193 del SDK recibe `eth_sendTransaction` cuando el comprador pulsa **Pagar**. La confirmación final debe aparecer en la app MetaMask. MetaMask documenta conexiones móviles por deeplink y el transporte MWP con relay; esto corrobora el diseño, no el comportamiento en el dispositivo del usuario: [documentación MetaMask Connect](https://docs.metamask.io/metamask-connect/) y [arquitectura oficial](https://github.com/MetaMask/connect-monorepo/blob/main/docs/architecture.md).

`npm run build` pasó tras el cambio; las rutas locales principales respondieron HTTP 200. El navegador local del PC no puede demostrar el salto a Android. Por eso la integración queda **implementada en código, pendiente de validación en teléfono**: hace falta probar con un dominio HTTPS público que cargue sin intersticial, MetaMask instalado, conexión, rechazo, retorno al checkout y una firma de prueba en testnet. No se abrió la app MetaMask ni se conectó una wallet durante esta revisión. X/Cancelar desmontan el checkout; cerrar la página no puede cancelar una solicitud que siga abierta dentro de la wallet. No se aprobó ni transmitió pago real durante la auditoría. El backend de verificación de depósitos y activación sigue pendiente.

En ese corte, el archivo de texto adjunto tenía 64 casillas (10 marcadas y 54 pendientes) y la copia del checklist del workspace tenía 74 (67 marcadas y 7 pendientes). Son versiones con contenidos distintos; **no debe interpretarse el conteo de una como avance de la otra**. La cobertura y los puntos no demostrados se detallan en los informes enlazados. La posterior incorporación del punto de handoff nativo Solflare elevó la copia del workspace a 75 casillas, 68 marcadas y 7 pendientes.

### Verificación posterior de detección y entrega móvil · 1-nov-2026

La función de selección móvil se ejecutó en una VM aislada con cuatro user-agents: Android, iPhone, iPad en modo escritorio y Windows devolvieron los resultados esperados. Es una comprobación de detección, no una conexión de wallet. La fuente instalada `node_modules/@metamask/connect-multichain/dist/src/multichain/utils/index.js` muestra que `mobile.useDeeplink: true` asigna `metamask://connect/mwp` a `window.location.href`; el comentario del paquete dice que evita una pestaña en blanco. MetaMask documenta que Connect usa deeplinks para abrir su app móvil y un flujo distinto en escritorio ([MetaMask Connect](https://docs.metamask.io/metamask-connect/), [Quickstart](https://docs.metamask.io/quickstart/)). Ninguna fuente prueba que este dispositivo concreto abra la solicitud, autorice la dirección ni regrese al dominio.

La compilación final de ese corte previo a Solflare volvió a pasar (`tsc -b && vite build`, 554 módulos); permanece el aviso de Rollup por un bundle de 695.66 kB. El servidor local respondió HTTP 200 para 13 rutas directas, incluidas Inicio, compra, suscripción, wallet, pool y operaciones; esto valida la entrega de la SPA, no el render o interacción de cada pantalla. `package.json` no configura un runner de pruebas. Una prueba aislada que intentó importar directamente el paquete SDK desde Node no se pudo ejecutar porque el paquete usa imports de directorio que Node ESM no resuelve; no es un error reportado por la app y no se cuenta como prueba. En ese corte el checklist estaba en **67/74**; la adenda posterior de Solflare lo dejó en **68/75**, con las mismas siete comprobaciones externas y de backend pendientes.

## Addendum: flujo nativo móvil de Solflare · 1-nov-2026

Se sustituyó el enlace Solflare `/browse` en móvil por el protocolo nativo cifrado para que el usuario apruebe desde la aplicación de wallet y vuelva al checkout. En un navegador móvil normal con HTTPS público, Connect genera un par X25519 temporal, enlaza a `https://solflare.com/ul/v1/connect`, recibe y descifra la dirección pública y la sesión. El estado temporal vive solo en `sessionStorage`; no se copia a Firebase ni a archivos. Dentro del navegador de Solflare, si ya existe el proveedor inyectado, se usa ese proveedor.

Para pagar, el usuario actualiza la cotización, la réplica obtiene un blockhash, prepara USDT SPL y muestra un enlace de confirmación que abre `signAndSendTransaction` en Solflare. La transacción y la sesión se cifran según el protocolo oficial. Solo la wallet puede firmar y transmitir. Al regresar, la app descifra la firma, comprueba el estado de la solicitud y muestra un recibo con el hash. No consulta confirmaciones de red, no acredita saldo ni activa el producto. La verificación real Bridge y el registro de orden siguen pendientes.

**Validación efectuada:** `npm run build` pasó: 563 módulos; permanece el aviso de bundle de Solana de 695.66 kB. Un harness mock con claves, sesión, transacción y firma ficticias verificó connect/decrypt, contenido del payload, callback, enlace de estado y limpieza de URL; no abrió wallet ni hizo solicitud de red/transacción. REA analizó como texto inerte `solflareMobile.ts`, `walletSession.ts`, `WalletPaymentCheckout.tsx`, `walletAppLinks.ts`, `WalletPanel.tsx` y `App.tsx`: Evidence del análisis `ev_cd72d8a1ea3eba724dfde5b6230e4d637836d90aa5309bc6abbdda68e84ac39f`, resumen `ev_d8cca11a2fa8ecec54d16aa7745677b6bc4b64e84c87b66cde8819ca20b0f210`. Se parsearon 6 de 6 fuentes seleccionadas, cero fallos, 34,399 nodos AST, 423 hallazgos. El grafo queda parcial (límite alcanzado de 100,000 unknowns; 19,207 archivos quedaron fuera de la selección) y no prueba comportamiento runtime.

**Estado vigente del checklist (2-nov-2026):** la implementación y mocks QA de los handoffs nativos de Solflare y Phantom dejan la matriz en **69/76, con siete pendientes**: conexión/desconexión de wallets reales; rechazo/cancelación MetaMask real; recibo de transacción on-chain existente; validar dirección, cotización, mínimo, fee y disponibilidad actuales en Solflare Bridge; tokens Bridge adicionales; política de elegibilidad/KYC de terceros; backend de órdenes, confirmación, idempotencia y activación. MetaMask, Solflare y Phantom tienen handoff móvil en código, pero aún no se probó en Android/iOS que las apps abran la solicitud, permitan cancelarla, regresen la respuesta y restauren el checkout. Véase la [adenda de Phantom y REA](./gomining-replica-audit-2026-11-01-seguimiento.md#actualizacion--phantom-movil-y-verificacion-cli--2-nov-2026).

Fuentes oficiales: [Solflare Connect](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect), [SignAndSendTransaction](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/signandsendtransaction), [encryption](https://docs.solflare.com/solflare/technical/deeplinks/encryption), [redirects](https://docs.solflare.com/solflare/technical/deeplinks/specifying-redirects).

### Revalidación local del build y las rutas · 1-nov-2026

Después de esos cambios, `npm run build` volvió a pasar (`tsc -b && vite build`, 563 módulos). Persiste un aviso de Rollup por el chunk de Solana de 695.66 kB; no impide la compilación. Un recorrido HTTP directo obtuvo 200 en 16 URL del mapa (Inicio, modal de minero, mineros, mercado, referidos, suscripciones, carteras, data centers, pool, operaciones, workers, granjas, economía, saldo, transacciones y preventa). Ese resultado verifica que el servidor entrega la SPA para esas URL; por sí solo no valida que cada pantalla se renderice ni que sus controles funcionen. No se añadieron puntos al checklist a partir de este smoke.

