# Auditoría funcional de la réplica GoMining

**Fecha:** 1 de noviembre de 2026; seguimiento a la auditoría del 31 de octubre.  
**Entorno revisado:** aplicación local en `http://127.0.0.1:5173`, Brave/CUA, viewport de 475 × 960 px; el documento midió 460 px de ancho.  
**Alcance:** auditoría de código con REA, barrido directo de las 54 rutas/variantes del catálogo más la redirección de `/nft-rewards` y la apertura directa del configurador (56 URL comprobadas), y recorrido de compra, checkout, cierre, cotizaciones de seis redes y recarga. No se aprobó ni transmitió ningún pago.

## Resumen ejecutivo

La réplica es navegable y varias superficies tienen flujos de demostración, pero no equivale a una plataforma GoMining operativa. Las rutas existen; eso no significa que cada módulo tenga datos, reglas o acciones reales. Esta actualización verifica algunos defectos reportados y conserva los pendientes que requieren backend, proveedor externo o un teléfono real:

1. **Pago móvil:** el código ofrece abrir la página dentro de MetaMask, Solflare, Phantom, Coinbase Wallet, Trust Wallet o TronLink desde un dominio HTTPS público. UniSat no tiene deeplink móvil. No se ha probado la apertura, conexión ni firma en un teléfono real.
2. **Cierre del checkout:** Cancelar, X, clic fuera y Escape cierran la interfaz en reposo. La X queda fija arriba durante el scroll. Cerrar el modal no cancela una solicitud que siga abierta dentro de la wallet; se advirtió en pantalla. No se abrió una solicitud de firma real para probar el estado pendiente.
3. **Encabezado:** saldo de demostración, conexión de wallet, carrito y perfil aparecen separados. Se eliminó la campana de notificaciones que no tenía flujo funcional; Promos se oculta en el encabezado móvil y sigue en Más secciones.
4. **Recarga:** el CTA de Cartera virtual abre el diálogo de recarga; pagar desde ahí abre el mismo checkout de Connect Wallet que compra de minero.
5. **Riesgo de pago real:** si se pulsa Pagar y se aprueba en una wallet, los conectores actuales pueden enviar activos de Mainnet a los destinos configurados. Ese hash no se concilia con una orden y no activa el minero, suscripción ni saldo.
6. **Datos y economía:** suscripciones, workers, referidos, retiros y preventa son simulaciones locales. Pool usa lecturas públicas de Kryptex/Pearl; no demuestra la operación de una granja propia ni atribuye pagos a compradores.
7. **Persistencia y seguridad:** se publicaron reglas remotas de Firestore que deniegan todo acceso desde el cliente para cerrar las reglas temporales de prueba. La app aún no está conectada a Firebase; la autenticación anónima está desactivada y la sincronización demo no se habilitó. Falta responder la pregunta de autorización para habilitarla.

**Resultado general:** las 56 URL de la lista renderizan una vista local; eso verifica navegación, no la funcionalidad profunda de todas las rutas. Inicio, configurador, checkout hasta antes de pagar, recarga y cierre en reposo se recorrieron en navegador. Pagos móviles reales, conciliación, alta de productos, persistencia y operación real siguen pendientes.

## Leyenda

- **Verificado en navegador:** se observó directamente el resultado en la app local.
- **Verificado en código:** existe el comportamiento descrito, pero no se confirmó todo el recorrido de usuario.
- **Demo/local:** el estado solo cambia en la sesión o almacenamiento local de la réplica.
- **Parcial:** funciona una parte; quedan requisitos críticos sin implementar.
- **No verificado:** no se ejecutó, no hubo evidencia suficiente o requería una solicitud financiera/wallet.
- **Fallo:** resultado observado o defecto demostrado en el código.

## Registro de interacción

| Paso | Interacción | Resultado observado | Estado |
|---|---|---|---|
| 1 | Abrir Inicio en Brave, 475 × 960 | Inicio muestra saldo demo, acciones rápidas, retos, tarjetas, mercado y resumen de pool. La wallet MetaMask ya autorizada fue reconocida en el encabezado. | Verificado |
| 2 | Abrir Crear minero desde Inicio | Abrió el configurador; se mostraron catálogo, potencias y opciones. | Verificado |
| 3 | Continuar a revisión y checkout | Se pudo revisar el producto y abrir checkout. Se mostraron cotización, destino, caducidad y gas a confirmar en la wallet. | Verificado hasta antes de Pagar |
| 4 | Cerrar checkout con Cancelar | El checkout se cerró sin enviar una transacción. | Verificado |
| 5 | Abrir Recargar desde Inicio | Apareció el modal con importe, opciones de cantidad, pago con wallet, recarga demo y Cancelar. | Verificado hasta antes de Pagar |
| 6 | Cancelar Recargar | El diálogo se cerró; no se añadió saldo. | Verificado |
| 7 | Abrir Recargar desde Cartera virtual (primer intento) | La primera interacción mostró un diálogo genérico; se corrigió durante esta revisión y se repitió el recorrido al final. | Incidencia corregida |
| 8 | Abrir Carteras | Se mostró la lista de proveedores y el texto “Conectar una extensión”. MetaMask seguía conectada. No se conectó ni desconectó otro proveedor. | Parcial |
| 9 | Abrir Suscripciones, Referidos, Pool, Operaciones, Mineros, Granjas, Economía y Preventa | Las vistas y avisos de demo/desconexión cargaron; solo se hizo recorrido visual e interacción puntual de paginación de Operaciones. | Parcial |
| 10 | Recorrer rutas directamente | 54 URL del catálogo renderizaron un encabezado y dejaron el skeleton inicial; además, `/nft-rewards` redirigió a `/nft-rewards/solo` y `/home?modal=paywall-create` abrió el diálogo. Total: 56 comprobaciones de URL. | Verificado para enrutamiento |
| 11 | Pulsar Pagar para abrir MetaMask | No se hizo: habría iniciado una solicitud de transacción Mainnet en una cuenta conectada. No se aprobó ni se rechazó una solicitud. | Deliberadamente no ejecutado |
| 12 | Abrir compra de minero y avanzar a checkout | Se revisaron potencia, precio, wallet detectada y consentimiento. El checkout abrió con cotización y destino. | Verificado hasta antes de Pagar |
| 13 | Cerrar checkout con Cancelar, X y Escape | Las tres acciones cerraron el modal. En un URL de retorno móvil de prueba, X también quitó los parámetros `gmPay` de la ruta. | Verificado sin solicitud de firma pendiente |
| 14 | Abrir checkout desde una URL de retorno de wallet | Se reconstruyó un checkout Solana/USDT SPL, eligió Solflare para esa red y mostró estado de wallet incompatible. | Verificado con datos de prueba |
| 15 | Cotizar BNB, BTC, ETH, TRX, SOL/USDT y POL | Las seis redes cargaron importe, fuente spot, destino configurado y vigencia de 30 segundos; no se envió ningún activo. | Verificado como lectura de cotización |
| 16 | Recargar desde Cartera virtual (repetición tras la corrección) | Recargar abrió el diálogo propio; “Pagar con MetaMask” abrió el checkout común para “Recarga de saldo”. | Verificado hasta antes de Pagar |
| 17 | Ver encabezado en viewport estrecho | A 475 × 960 px se ven saldo demo, una wallet con dirección abreviada, carrito y perfil, sin desbordamiento horizontal. Promos se oculta; no hay control de notificaciones duplicado. | Verificado visualmente |
| 18 | Barrido posterior de rutas | Se abrieron las 54 URL/variantes del mapa de navegación; todas terminaron de cargar y mostraron encabezado. No se encontró alerta de error. Se comprobaron aparte la redirección y la ruta del configurador. | Verificado para render y carga inicial, no para cada acción interna |

No se copiaron al informe direcciones de wallet, identificadores de cuenta, balances personales ni secretos. La conexión ya existente se dejó intacta. Al terminar, la pestaña Brave usada para la prueba volvió a su ruta inicial `/nft-miners`.

## Estado por sección del checklist

### 1. Inicio, navegación y diseño — **Parcial; navegación directa verificada**

- Inicio cargó por URL y mostró los módulos principales y la conexión de wallet.
- El acceso Crear minero abrió el configurador. La comprobación de logo, todos los enlaces y controles de perfil/carrito no se completó individualmente.
- Se abrieron 54 URL/variantes del catálogo más `/nft-rewards` y `/home?modal=paywall-create`; las 56 mostraron su título y dejaron el skeleton inicial. Esto no verifica cada interacción interna.
- El viewport observado fue 475 × 960 px. En Inicio, `documentElement.scrollWidth` fue 460 px y no se observó desbordamiento horizontal. No se midieron breakpoints de 390, 768 o 1440 px.
- En Inicio, el texto común se observó a 14 px y el cuerpo a 16 px. En checkout, el diseño es de una columna y los detalles requieren scroll; no se hizo revisión visual de todos los estados a 100% en cada ruta.
- La captura anterior de texto negro no se reprodujo en Inicio durante esta auditoría. No es evidencia de que todas las páginas/modales tengan contraste correcto.
- No se probó la preferencia de reducir movimiento. Los skeletons se vieron durante la carga normal, pero no se forzaron fallos o demoras de API para comprobar cada fallback.
- **Corregido en esta revisión:** el saldo enlaza a Cartera virtual; el acceso conectado tiene icono y dirección abreviada; el carrito tiene su propio icono. Se eliminó el control de notificaciones que no tenía funcionalidad. Promos se oculta a este ancho y se conserva en Más secciones.
- Los skeletons iniciales se limpiaron en las 56 comprobaciones de ruta; las llamadas de datos de Pool/Economía tienen placeholders propios. No se forzaron errores ni retardos de API, ni se comprobó cada recuperación/reintento.
- Revisión visual completa de todas las rutas, breakpoints 390/768/1440 px, loaders, accesibilidad y animaciones: **pendiente**.

Evidencia: [App.tsx, encabezado y acciones](src/App.tsx#L130), [catálogo de rutas](src/catalog.ts), [Skeletons.tsx](src/Skeletons.tsx), [estilos responsive y movimiento reducido](src/styles.css).

### 2. Crear y comprar un minero — **Parcial; cobro no verificado**

- Configurador, selección, revisión y apertura de checkout: verificados.
- El catálogo de mineros está guardado como observación fechada; no se sincroniza en vivo con GoMining. El anual está deshabilitado por decisión del usuario.
- El checkout consulta cotización y muestra importe/destino/vencimiento. Se cargaron cotizaciones de seis redes con un importe de prueba; se canceló antes de abrir la wallet.
- No se verificaron rechazo de una solicitud de transacción, recibo on-chain, conciliación de una orden ni activación de un minero pagado.
- El flujo demo puede cambiar workers/saldo local, pero no prueba una compra cobrada.

Evidencia: [minerCatalog.ts](src/minerCatalog.ts), [MinerBuilderDialog en App.tsx](src/App.tsx#L1011), [WalletPaymentCheckout.tsx](src/WalletPaymentCheckout.tsx#L102).

### 3. Recargar — **La entrada abre el checkout correcto; acreditación pendiente**

- **Inicio → Recargar:** se observó el modal correcto y su botón para pago con wallet; no se solicitó el pago.
- **Cartera virtual → Recargar:** en esta revisión abrió el diálogo de recarga; “Pagar con MetaMask” abrió el checkout de Connect Wallet correspondiente.
- “Añadir saldo demo” está implementado en memoria, pero no se pulsó en esta auditoría.
- Una transferencia real no acredita saldo por sí misma; falta verificación backend.

Evidencia: [acciones del encabezado y top-up](src/App.tsx#L136), [modal de recarga](src/App.tsx#L1091), [definición de Cartera virtual](src/catalog.ts#L135).

### 4. Connect Wallet — **Conexión en escritorio observada; app móvil implementada en código y pendiente de teléfono**

- MetaMask ya conectada fue detectada y mostrada en el encabezado y reconocida en el checkout.
- Carteras presenta Solflare, Phantom, MetaMask, Coinbase Wallet, Trust Wallet, TronLink y UniSat.
- No se probó conectar, cancelar permiso, desconectar ni cambiar cuenta para cada proveedor.
- Los enlaces de Solflare, Phantom, Coinbase Wallet, Trust Wallet y TronLink conservan producto, importe, moneda y red. En el código vigente MetaMask Connect usa `mobile.useDeeplink: isMobileBrowser()`: el SDK recibe la opción nativa MWP en móviles y el Universal Link HTTPS en escritorio; no usa `/dapp/`. La autorización y el pago se confirman por separado. La configuración se analizó estáticamente, pero aún no se ha verificado en un teléfono.
- UniSat no tiene un enlace de apertura de dApp implementado; si no hay proveedor inyectado, la interfaz lo muestra como no disponible en móvil. No se añadió WalletConnect ni un Project ID.
- El navegador de esta comprobación era Brave de escritorio con viewport estrecho; no era un teléfono. El esquema de enlaces está en código, pero apertura real, conexión, regreso, rechazo y firma en cada app **siguen sin prueba de dispositivo**.

Evidencia: [WalletPanel.tsx](src/WalletPanel.tsx#L1), [walletSession.ts](src/walletSession.ts#L260), [dependencias instaladas](package.json).

### 5. Cotización, red y recepción — **Parcial; no aceptable como recepción Bridge verificada**

- Se cargaron precios públicos para el activo elegido y tipo de cambio de referencia cuando el catálogo está en MXN. Checkout marca una cotización válida por 30 segundos y vuelve a consultar antes de solicitar el pago.
- Las cotizaciones de BNB, BTC, ETH, TRX, POL y USDT/Solana cargaron en el recorrido de prueba. No se probó la expiración esperando 30 s, ni un fallo de proveedor, ni el resultado de una transacción.
- La red Solana queda configurada para USDT SPL directo. En otras redes se envía el activo nativo de origen a un destino fijo.
- El 1% de Bridge está codificado como estimación; no viene de una cotización viva del Bridge. Gas lo calcula la wallet.
- La réplica no confirma que cada destino configurado esté emparejado correctamente con la red/token en Solflare Bridge; tampoco confirma el USDT final, mínimos, liquidez o resultado de slippage.
- Un hash de origen queda como “enviado”/Bridge “pendiente”; no hay indexador, confirmación on-chain ni crédito en una orden.
- **No aceptar pagos reales hasta verificar cada ruta y dirección en el servicio receptor y definir conciliación.**

Evidencia: [paymentQuote.ts](src/paymentQuote.ts), [destinos y advertencia de verificación](src/paymentDestinations.ts#L14), [recibo y checkout](src/WalletPaymentCheckout.tsx#L102).

### 6. Suscripciones — **Demo; anual deshabilitado**

- La vista muestra plan mensual de $29.99 USD por 30 días y ofrece activación demo local.
- El beneficio de +1% sobre potencia activa se calcula en el almacén de demo. No se ejecutó el botón de activar ni se verificó expiración de extremo a extremo.
- El anual permanece deshabilitado.
- El pago mensual real solo transmitiría fondos al destino; no activa Platinum+, no renueva y no aplica beneficios automáticamente.
- **Corrección de código, no validada con cambio de sesión:** el retiro demo ahora comprueba la fecha `endsAt` antes de mostrar “sin cola diaria”. No se activó ni expiró una suscripción durante el recorrido.

Evidencia: [vista de suscripciones](src/App.tsx#L431), [cálculo de potencia y retiro](src/demoStore.ts#L288).

### 7. Referidos y Unilevel — **Simulador local**

- Se puede consultar el simulador de recompensa directa y niveles; la configuración está pensada como escenario de hasta diez niveles.
- La tasa directa del 10% y el presupuesto/ponderaciones de Unilevel son parámetros de simulación, no pagos confirmados ni reglas comerciales auditadas.
- Las páginas de referidos/recompensas/amigos son vistas locales/ vacías o no conectadas; no existe ledger persistente ni distribución a wallets.
- No se ejecutaron los botones de acreditación demo durante esta revisión.

Evidencia: [referidos en App.tsx](src/App.tsx#L493), [miningEconomics.ts](src/miningEconomics.ts), [configuración local](src/miningConfig.ts).

### 8. Pool, operaciones, workers y granjas — **Lectura pública + demo**

- Pool muestra una estimación pública de Kryptex/PRL, no el hashrate ni la ganancia atribuida a esta réplica.
- Operaciones muestra pagos públicos de pool; la paginación se recorrió. Historial de pool y estimación diaria son fuentes distintas.
- Mineros/workers son asignaciones demo; el estado de sesión mantiene poolConnected en falso. No hay telemetría de ASIC, granjas o worker conectada.
- Granjas informa explícitamente que no hay datos verificables y no inventa ubicaciones.
- No se encontró una forma de acreditar automáticamente el pago de la pool al comprador.

Evidencia: [datos demo de worker](src/demoStore.ts#L25), [Pool](src/poolRevenue.ts), [pagos públicos](src/poolPayouts.ts), [pantallas de trazabilidad](src/App.tsx#L543).

### 9. Economía del operador — **Calculadora de escenario**

- Hay campos para potencia, eficiencia, electricidad, mantenimiento, ingresos por suscripción, infraestructura y retiros.
- Se pueden introducir costos para calcular un escenario; no hay importes reales conciliados ni datos confirmados de granja, pool o suscripciones cobradas.
- Si faltan entradas, la rentabilidad real queda sin confirmar. No debe presentarse como contabilidad.

Evidencia: [calculadora en App.tsx](src/App.tsx#L695), [poolRevenue.ts](src/poolRevenue.ts).

### 10. Preventa — **Demo**

- La pantalla tiene una simulación de asignación por cantidad y precio.
- No hay campaña, token contract, emisión, escrow ni pago de preventa.
- El estado de tokens/recibos es local.

Evidencia: [flujo de preventa](src/App.tsx#L670), [simulateDemoPresale](src/demoStore.ts#L302).

### 11. Firebase y persistencia — **Código preparado, app sin conectar; acceso remoto cerrado**

- Firebase SDK está instalado y hay una integración opcional de persistencia demo por UID anónimo en `src/firestoreDemoSync.ts`, pero no hay `.env.local` ni configuración leída en la app: el hook queda deshabilitado. No se persistieron datos.
- En la consola del proyecto de prueba `salad-miners` se publicaron reglas remotas de denegación total para cerrar las reglas temporales abiertas; no hay colecciones/documentos de la app. Esta publicación es un cierre de seguridad, no una conexión.
- Las reglas locales de `firestore.rules` permiten solo lectura/escritura del documento de estado demo del UID autenticado; no se desplegaron. La autenticación anónima sigue desactivada mientras se espera respuesta del usuario.
- No existe backend de órdenes/verificación de pagos. La integración no envía recibos reales ni direcciones de wallet; los cambios demo no forman todavía una cuenta persistente.

Evidencia: [firestore.rules](firestore.rules#L8), [firestore-schema.md](firestore-schema.md).

## Cierre de checkout mientras la wallet espera

La X, Cancelar, clic fuera y Escape permanecen activos aunque `sendPayment` esté esperando. Se comprobó en navegador el cierre por Cancelar, X y Escape cuando no había una firma pendiente. También se comprobó que X elimina los parámetros de reanudación `gmPay` del URL.

Una página web no puede revocar con garantía una solicitud ya enviada al proveedor de wallet. Si se cierra el checkout mientras MetaMask u otra wallet muestra su aprobación, esa solicitud puede seguir en la app; si la persona la aprueba después, el pago podría transmitirse. El aviso amarillo de “La wallet todavía tiene una solicitud abierta” explica ese límite. No se inició ninguna solicitud real para simular el cierre en estado `sending`.

**Estado:** el modal ya se puede cerrar; cancelar el modal no equivale a cancelar la transacción en la wallet. Antes de volver a intentar, hay que revisar la actividad de la wallet.

Evidencia: [WalletPaymentCheckout.tsx, controles y estado pendiente](src/WalletPaymentCheckout.tsx#L102), [App.tsx, cierre y limpieza del URL](src/App.tsx#L98).

## Pagos móviles: alcance y prueba pendiente

En celular, el checkout inicia la conexión con la wallet que corresponda. MetaMask usa `@metamask/connect-evm` con `mobile.useDeeplink: isMobileBrowser()`, que selecciona el deeplink nativo MWP en teléfonos; escritorio conserva el Universal Link HTTPS. Solflare, Phantom, Coinbase Wallet, Trust Wallet y TronLink conservan sus enlaces móviles configurados. MetaMask no usa `/dapp/`: la conexión es con `client.connect()` y el pago requiere otra acción y aprobación en la wallet. No se exportan claves ni frases semilla. El handoff, retorno y rechazo del flujo actual siguen pendientes de validación en teléfono.

| Wallet | Apertura móvil configurada | Límite actual |
|---|---|---|
| MetaMask | Deeplink nativo `metamask://` por MetaMask Connect | SDK `client.connect()` y sesión EIP-1193; falta verificar apertura y retorno en teléfono. |
| Solflare | Browse deeplink documentado para abrir su navegador DApp | La documentación permite abrir antes de Connect; en esta réplica el Connect y el pago usan el proveedor inyectado. No se validó en teléfono. |
| Phantom | Universal link `browse` | Phantom exige su navegador integrado para conectar desde móvil. |
| Coinbase Wallet | Universal link `go.cb-w.com/dapp?cb_url=…` | No se probó compatibilidad en versiones actuales de la app. |
| Trust Wallet | `link.trustwallet.com/open_url` con red | No se probó el retorno en teléfono. |
| TronLink | Esquema `tronlinkoutside://…` | El navegador puede pedir permiso para abrir la aplicación. |
| UniSat | Sin enlace de apertura DApp en esta réplica | Solo conecta si ya existe el proveedor `window.unisat`; en móvil sin proveedor se deshabilita. |

La conexión móvil requiere que la aplicación esté disponible desde el teléfono; `127.0.0.1`/`localhost` del ordenador no sirve como destino móvil. Para MetaMask, el SDK usa `metamask://` para abrir la app y devolver la sesión por relay; no carga la réplica dentro del navegador de la wallet. Solflare y Phantom siguen usando sus flujos de navegador integrado; Solflare no implementa aquí el protocolo Connect/SignAndSendTransaction con sesión cifrada y redirección.

No se simuló un User-Agent móvil ni se abrió una wallet app desde este escritorio. Así que los enlaces están implementados y compilados, pero instalación, apertura, conexión, rechazo, regreso, firma y compatibilidad por versión **siguen pendientes de prueba en un dispositivo real**. No se añadió WalletConnect, Project ID ni otro servicio con cuota.

Referencias técnicas: [MetaMask Connect: compatibilidad entre navegador y app móvil](https://docs.metamask.io/metamask-connect/), [Solflare Browse](https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse), [Solflare Connect y sesiones](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect), [Phantom: browse deeplink](https://docs.phantom.com/phantom-deeplinks/other-methods/browse) y [conexión móvil dentro de Phantom](https://help.phantom.com/articles/29995498642195), [Coinbase: enlace al navegador DApp](https://main.d39g7xymw2r1c0.amplifyapp.com/wallet-sdk/docs/deep-link), [Trust Wallet: deeplinking](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [TronLink: abrir una DApp](https://docs.tronlink.org/mobile/deeplink/).

## Rutas recorridas directamente

Las rutas siguientes renderizaron el contenedor de la réplica y un título. El recorrido no certifica que los datos/acciones internos de todas estén completos:

- /home
- /nft-miners
- /nft-rewards
- /nft-rewards/solo
- /nft-rewards/pool
- /miner-wars
- /marketplace
- /gominers-collection
- /travel
- /shop
- /nft-sell
- /launchpad
- /buy/GOMINING
- /liquidity
- /ve-tokenomics
- /lock/ve-my-lock
- /lock/ve-voting
- /gmt-wallets
- /finance/wallets/virtual
- /finance/wallets/virtual/GOMINING/transactions
- /finance/banking-cards
- /finance/instant-funds
- /finance/simple-earn
- /finance/simple-earn/overview
- /operator-economics
- /buy
- /deposit
- /withdraw/GOMINING
- /promos
- /raffles
- /offers
- /goboxes
- /bonus-miner-v3
- /subscriptions
- /subscriptions?subscriptionType=platinum
- /leaderboard/nft
- /leaderboard/nft-rarity
- /leaderboard/solo-mining
- /leaderboard/liquidity
- /profile
- /raffle/036a5b85-4b51-471b-b639-2ffb9afba920
- /nft-referral
- /nft-referral/rewards
- /nft-referral/friends
- /data-centers
- /data-centers/pool
- /data-centers/operations
- /data-centers/miners
- /data-centers/farms
- /academy
- /academy/courses/bitcoin-and-mining
- /academy/courses/blockchain-and-crypto-course
- /academy/courses/gomining-basics-course
- /blog/how-to-set-up-2fa
- /blog/how-to-withdraw-rewards-safely
- /home?modal=paywall-create

El barrido de esta auditoría contiene 56 URL/variantes. Se abre cada URL directamente; `/nft-rewards` redirige a `/nft-rewards/solo`, y `/home?modal=paywall-create` abre el configurador. El resultado confirma resolución y carga inicial, no el funcionamiento completo de todas las acciones.

## REA y límites de evidencia

REA/Linux analizó estáticamente la carpeta `src/` del estado del proyecto tras el último ajuste de la etiqueta de saldo, con selección explícita de 10 fuentes: `App.tsx`, `WalletPaymentCheckout.tsx`, `WalletPanel.tsx`, `walletSession.ts`, `walletAppLinks.ts`, `paymentQuote.ts`, `paymentDestinations.ts`, `demoStore.ts`, `firestoreDemoSync.ts` y `catalog.ts`. Evidencia padre del análisis: `ev_136317b30d0eac09d735672d812feb3fe165699172977733abaa292d395a5c1e`; vista de resumen: `ev_f4df1c9e218db598f35432b9679a7078cb8a242801d4d668feb2f862590b33b4`; digest de la carpeta analizada `7d818a2547447607ba44403d4706d6941d09e626bd587d242cfddbf4051d132c`. El inventario de `src/` contiene 22 archivos: 10 seleccionados y 12 fuera de alcance. REA dejó 12 incógnitas de aplicación y 4,797 incógnitas semánticas; los hallazgos son estáticos, no prueban ejecución ni resultado de wallets en runtime.

Una primera pasada desde la raíz completa excedió el límite de espera del host; REA retuvo un análisis incompleto. Se acotó el objetivo a `src/` y la pasada anterior es la evidencia utilizable. No se ejecutó `rea doctor`: REA inició y completó el análisis acotado, por lo que el bloqueo fue de tiempo/cobertura en el árbol grande, no de arranque o registro MCP.

La inspección visual y las acciones descritas arriba se hicieron con Computer Use en el navegador local, no con REA. La captura dinámica de REA/Linux del corte anterior no llegó a obtener un endpoint CDP válido y no se volvió a intentar con la misma configuración. No se afirma haber hecho ingeniería inversa visual de la sesión autenticada de GoMining ni prueba de paridad total.

## Defectos y pendientes que conviene convertir en trabajo

| Prioridad | Tema | Evidencia/impacto |
|---|---|---|
| P0 | Verificación/conciliación antes de vender | Un pago Mainnet puede llegar a un destino sin orden verificada; no activa producto y no hay backend que lo reconcilie. Validar destino, red, activo, monto, confirmaciones, idempotencia y reembolsos antes de producción. |
| P1 | Pago desde móvil | Enlaces a navegadores de wallets comunes configurados en código. Falta probar apertura, conexión y aprobación en teléfonos reales; UniSat no tiene deeplink integrado. |
| P1 | Solicitud pendiente de wallet | El modal se puede cerrar, pero cerrar la página no cancela una aprobación que siga activa dentro de la app. Falta una prueba controlada de rechazo/cierre del proveedor; no se debe reintentar hasta revisar la actividad. |
| P1 | Rutas/destinos Bridge | La tasa 1% es fija/estimada y la réplica no valida la cotización ni la asociación de direcciones con Solflare Bridge. |
| P1 | Recarga desde Cartera virtual | Corregido en código y observado: abre el diálogo de recarga y el checkout común. Falta prueba de firma. |
| P1 | Persistencia y activación | La app no se conecta a Firebase y espera autorización para Auth anónimo. Las reglas remotas se cerraron con deny-all; el borrador local solo permitiría un estado demo por UID. Siguen faltando backend de órdenes, indexador de pagos y activación idempotente. |
| P2 | Iconografía del encabezado | Corregido y visto en viewport estrecho: saldo, wallet, carrito y perfil se distinguen; se retiró la notificación que no tenía flujo y Promos se oculta en el encabezado móvil. |
| P2 | Retiro demo al expirar suscripción | Corregido en el cálculo `endsAt`; falta comprobarlo con una suscripción demo expirada. |
| P2 | Revisión responsive completa | Solo se observó 460 px en esta auditoría; falta 390/768/1440 y revisión por ruta, zoom 100%, legibilidad y controles táctiles. |
| P2 | Carga y fallbacks | Se observó skeleton normal; falta forzar error/demora de cada fuente y verificar recuperación, timeout y retry. |
| P3 | Cobertura real de módulos | Muchas rutas son genéricas, de demo, vacías o muestran que falta fuente de datos; no equivalen a funcionalidad GoMining. |

## Conclusión para preparar la siguiente especificación

Puedes usar este resultado para dividir el siguiente encargo en tres frentes:

1. **Checkout seguro y móvil:** escoger integración de conexión móvil, conservar el checkout al regresar de la wallet, permitir cancelar/recuperar y probar en testnet/mocks antes de Mainnet.
2. **Venta verificable:** obtener cotización/ruta verificable y construir backend que asocie el pago confirmado a una orden; solo después activar minero/suscripción o acreditar saldo.
3. **Pulido UX y cobertura:** terminar la matriz responsive, legibilidad, accesibilidad y fallbacks por ruta; validar la expiración de suscripción demo y los estados de error/recuperación de datos.

Este informe es una auditoría del estado actual; no modifica la implementación de pagos ni autoriza transferencias reales.

## Addendum de seguimiento: pago móvil, cierre e iconos · 1-nov-2026

Esta sección actualiza la auditoría anterior tras la solicitud de revisión móvil. Distingue evidencia estática del código, comprobaciones locales de solo lectura y acciones de interfaz que no se pudieron repetir.

### Resultado por requisito

| Requisito | Estado actual | Evidencia y límite |
|---|---|---|
| Abrir la app móvil de MetaMask desde el checkout | **SDK cableado; teléfono pendiente.** | MetaMask Connect recibe `client.connect({ chainIds })` y `mobile.useDeeplink: isMobileBrowser()` selecciona la opción MWP nativa en teléfonos; escritorio usa Universal Link HTTPS. La página no abre `/dapp/`. El checkout preserva la compra en la URL. No se probó ningún teléfono ni autorización real. |
| Conectar y pagar desde MetaMask móvil | **Implementado en código; aprobación real pendiente.** | El SDK devuelve un proveedor EIP-1193. La transferencia solo se solicita después de pulsar Pagar y requiere aprobación en MetaMask. `localhost` no sirve como origen móvil. No se hizo firma ni envío de prueba. |
| Cerrar checkout después de cancelar en MetaMask | **Corrección implementada; interacción pendiente.** | La X, Cancelar y Escape siguen cerrando el checkout local mientras hay una promesa de envío pendiente. Si la wallet devuelve rechazo/cancelación (incluido código EIP-1193 4001), ahora se cierra el checkout y aparece un aviso de que no se envió pago. No se pudo reproducir MetaMask en esta revisión. Si la app solo se cierra y el proveedor nunca resuelve la petición, X oculta el checkout local, pero no puede cancelar la ventana/solicitud dentro de la wallet. |
| Distinguir saldo, wallet y notificaciones en el encabezado | **Etiquetas corregidas en código; captura pendiente.** | El JSX actual muestra saldo demo, un botón con `WalletGlyph`, carrito y perfil; no renderiza botones de notificaciones. El saldo usa ahora una D de demo, y el menú/pantallas dicen `Saldo demo` y `Conectar wallet`. La inspección de Computer Use se detuvo antes de capturar la página porque no pudo determinar la URL activa; no afirmo que esta revisión confirme visualmente el encabezado en pantalla. |
| Error 403 de Solflare al pedir blockhash | **Respaldo añadido y lectura probada.** | En esta máquina, ambos endpoints públicos oficiales de Solana devolvieron HTTP 403. `https://solana-rpc.publicnode.com` respondió HTTP 200 a `getLatestBlockhash` y permitió CORS `*`. Se añadió como tercer fallback de solo lectura; no se envió ninguna transacción. Es un servicio público compartido: no debe considerarse una garantía de disponibilidad para producción. Solana advierte que sus RPC públicos están limitados y no son adecuados para pagos en producción ([endpoints y códigos 403/429](https://solana.com/docs/references/clusters), [guía de pagos](https://solana.com/docs/payments/interacting-with-solana)). |
| Recarga con Connect Wallet | **Flujo de checkout verificado anteriormente; acreditación pendiente.** | La interacción del 1-nov ya registrada confirmó Cartera virtual → Recargar → checkout común. Recibir una transferencia no acredita saldo automáticamente: hace falta un verificador de pagos y una orden en servidor. |
| Firebase y persistencia | **Desconectados en este checkout.** | No existe `.env.local`; la aplicación no se conecta al proyecto en esta ejecución. El archivo local `firestore.rules` solo permite leer/escribir el documento de demostración del usuario; no se pudo confirmar en consola el despliegue remoto actual. Se añadió una protección para no sobrescribir una acción local si la lectura inicial remota tarda, pero no se probó contra Firebase. |

### Compatibilidad móvil consultada

- Se retiró `https://link.metamask.io/dapp/{dappUrl}` después de que el usuario reportara una pantalla vacía en Android; ese formato abre el sitio dentro del navegador de MetaMask ([deeplinks de MetaMask](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks.md)). El flujo actual usa MetaMask Connect ([documentación](https://docs.metamask.io/metamask-connect/), [quickstart](https://docs.metamask.io/quickstart/)).
- Solflare permite abrir el navegador integrado con `https://solflare.com/ul/v1/browse/<url>?ref=<ref>` antes de conectar la wallet ([browse de Solflare](https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse)). Phantom también admite navegador móvil y deeplinks ([integración de Phantom](https://docs.phantom.com/solana/integrating-phantom)).
- Trust Wallet y TronLink documentan respectivamente `open_url` y `tronlinkoutside://pull.activity` para abrir un dApp dentro de la app ([Trust Wallet](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [TronLink](https://docs.tronlink.org/mobile/deeplink/)). Coinbase documenta `https://go.cb-w.com/dapp?cb_url=...` ([Coinbase Wallet SDK](https://main.d39g7xymw2r1c0.amplifyapp.com/wallet-sdk/docs/deep-link)). Estos documentos confirman los formatos; no sustituyen la prueba en iOS y Android con las versiones de wallet que usarán tus clientes.

### REA y validación de este seguimiento

- REA completó un nuevo análisis **estático** de ocho archivos (`App.tsx`, `WalletPaymentCheckout.tsx`, `walletSession.ts`, `walletAppLinks.ts`, `paymentDestinations.ts`, `demoStore.ts`, `firestoreDemoSync.ts` y `catalog.ts`). Evidence de resumen: `ev_c1d0d62ff0981e83d8c827e54303d2cb36626a5bb2677ca5461aa324e6fb28e2`; evidencia padre: `ev_cbaf0f2b58949d94bd153ca2f75fce9d4d0c20075b9f3fffea20fc6cdeaa76eb`; digest `43c17d1bc7cbb4d0b898c72e5d89a78539172632c63977ed249ff7efcf6974a3`. El inventario tenía 22 fuentes: 8 analizadas y 14 fuera de alcance; el grafo es parcial. REA no ejecutó el JavaScript. Esta evidencia posterior reemplaza el análisis de siete fuentes citado en una versión anterior de este addendum.
- La captura interactiva de REA terminó con `execution_failure` y `cleanup_incomplete`. `rea doctor` informó que el registro/conexión de REA está sano, pero no que se haya liberado el dueño de la limpieza del navegador. Computer Use también se detuvo antes de una acción porque no pudo determinar la URL activa de Brave. No se abrió otro perfil ni se presentó esta revisión como captura interactiva de REA.
- `npm run build` terminó correctamente. Rollup aún avisa que el bloque de Solana supera 500 kB. La página local `/home?modal=paywall-create` respondió HTTP 200. La prueba local del enlace confirmó que la red y wallet seleccionadas sobreviven a la reanudación. No se aprobó, firmó ni emitió ninguna transacción.

### Bloqueos que siguen abiertos

1. Hace falta repetir el recorrido visual de checkout y encabezado después de reiniciar/reconectar el proveedor REA para que libere el estado `cleanup_incomplete`; la captura actual no es evidencia de interacción.
2. Hace falta un teléfono iOS y uno Android, las apps de wallet instaladas y un dominio HTTPS accesible. La prueba debe detenerse antes de aprobar una transacción real; para validar firma se debe usar una red de prueba y un destino de prueba.
3. Antes de vender mineros o acreditar recargas se necesita conciliación en servidor: asociar dirección, red, activo, importe, vigencia, confirmaciones y orden; actualmente una transferencia enviada no activa ni acredita un producto.
4. El RPC compartido agregado es una salida temporal para desarrollo. Una tienda pública necesita una opción RPC mantenida/privada o propia, además de monitoreo, límites y comportamiento ante fallos; no se debe publicar el pago como verificado mientras eso no exista.

