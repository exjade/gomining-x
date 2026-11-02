# Auditoría funcional de la réplica GoMining

**Fecha:** 31 de octubre de 2026  
**Entorno revisado:** aplicación local en `http://127.0.0.1:5173`, navegador Brave, viewport móvil observado de 460 × 960 px.  
**Alcance:** contraste del checklist funcional adjunto con navegación, flujos visibles y código fuente. No se aprobaron ni transmitieron pagos.

## Resumen ejecutivo

La réplica es navegable y varias superficies tienen flujos de demostración, pero no equivale a una plataforma GoMining operativa. Las rutas existen; eso no significa que cada módulo tenga datos, reglas o acciones reales. Las limitaciones que condicionan la siguiente implementación son:

1. **Pago móvil:** no está implementado un traspaso explícito del navegador móvil a la aplicación de wallet (deep link, callback/retorno o selector móvil). La interfaz y los conectores están planteados principalmente para extensiones inyectadas. No se probó ningún teléfono.
2. **Cierre del checkout durante la solicitud de wallet:** el código deshabilita la X, Cancelar y el cierre por fondo mientras espera la promesa de envío. Si la wallet cierra su ventana sin que el proveedor rechace/resuelva la promesa, el modal puede quedar bloqueado. El defecto se confirma en el código, pero no se abrió una solicitud real de pago para reproducirlo.
3. **Iconos duplicados:** el encabezado mezcla el acceso a Cartera virtual y el acceso de conexión de wallet; además, Notificaciones y Promociones usan el mismo símbolo. Son accesos distintos con iconografía indistinguible.
4. **Recarga inconsistente:** el CTA de Inicio abre el diálogo de recarga con pago de wallet; el CTA de Cartera virtual cae en una acción genérica de demostración.
5. **Riesgo de pago real:** si se pulsa Pagar y se aprueba en una wallet, los conectores actuales sí pueden enviar activos de Mainnet a los destinos configurados. Ese hash no se concilia con una orden y no activa el minero, suscripción ni saldo.
6. **Datos y economía:** suscripciones, workers, referidos, retiros y preventa son simulaciones locales. Pool usa lecturas públicas de Kryptex/Pearl; no demuestra la operación de una granja propia ni atribuye pagos a compradores.
7. **Persistencia:** Firebase no está conectado; las reglas del cliente deniegan lecturas y escrituras. Falta backend de órdenes y verificación de pagos.

**Resultado general:** Inicio y algunos recorridos de interfaz funcionan; pagos móviles, alta real de productos, persistencia y operación real siguen pendientes. El informe separa lo observado de lo deducido del código y de lo que no se pudo probar.

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
| 1 | Abrir Inicio en Brave, 460 × 960 | Inicio muestra saldo demo, acciones rápidas, retos, tarjetas, mercado y resumen de pool. La wallet MetaMask ya autorizada fue reconocida en el encabezado. | Verificado |
| 2 | Abrir Crear minero desde Inicio | Abrió el configurador; se mostraron catálogo, potencias y opciones. | Verificado |
| 3 | Continuar a revisión y checkout | Se pudo revisar el producto y abrir checkout. Se mostraron cotización, destino, caducidad y gas a confirmar en la wallet. | Verificado hasta antes de Pagar |
| 4 | Cerrar checkout con Cancelar | El checkout se cerró sin enviar una transacción. | Verificado |
| 5 | Abrir Recargar desde Inicio | Apareció el modal con importe, opciones de cantidad, pago con wallet, recarga demo y Cancelar. | Verificado hasta antes de Pagar |
| 6 | Cancelar Recargar | El diálogo se cerró; no se añadió saldo. | Verificado |
| 7 | Abrir Recargar desde Cartera virtual | Apareció un diálogo genérico de acción simulada en vez del flujo de recarga reutilizado desde Inicio. | Fallo |
| 8 | Abrir Carteras | Se mostró la lista de proveedores y el texto “Conectar una extensión”. MetaMask seguía conectada. No se conectó ni desconectó otro proveedor. | Parcial |
| 9 | Abrir Suscripciones, Referidos, Pool, Operaciones, Mineros, Granjas, Economía y Preventa | Las vistas y avisos de demo/desconexión cargaron; solo se hizo recorrido visual e interacción puntual de paginación de Operaciones. | Parcial |
| 10 | Recorrer rutas directamente | Las 55 rutas/variantes enumeradas más abajo renderizaron el contenedor local y un encabezado. Esto comprueba resolución de ruta, no funcionalidad completa de cada pantalla. | Verificado para enrutamiento |
| 11 | Pulsar Pagar para abrir MetaMask | No se hizo: habría iniciado una solicitud de transacción Mainnet en una cuenta conectada. No se aprobó ni se rechazó una solicitud. | No verificado |

No se copiaron al informe direcciones de wallet, identificadores de cuenta, balances personales ni secretos. La conexión ya existente se dejó intacta. La pestaña Brave quedó en Inicio.

## Estado por sección del checklist

### 1. Inicio, navegación y diseño — **Parcial**

- Inicio cargó por URL y mostró los módulos principales y la conexión de wallet.
- El acceso Crear minero abrió el configurador. La comprobación de logo, todos los enlaces y controles de perfil/carrito no se completó individualmente.
- Se probaron 55 rutas/variantes directas, no cada interacción interna de todas ellas.
- Se hizo una observación móvil en 460 px. En Inicio, el ancho del documento coincidió con el viewport y no se observó desbordamiento horizontal; esto no cubre 390, 768 o 1440 px.
- En Inicio, el texto común se observó a 14 px y el cuerpo a 16 px. En checkout, el diseño es de una columna y los detalles requieren scroll; no se hizo revisión visual de todos los estados a 100% en cada ruta.
- La captura anterior de texto negro no se reprodujo en Inicio durante esta auditoría. No es evidencia de que todas las páginas/modales tengan contraste correcto.
- No se probó la preferencia de reducir movimiento. Los skeletons se vieron durante la carga normal, pero no se forzaron fallos o demoras de API para comprobar cada fallback.
- **Defecto de iconografía:** App.tsx muestra una Cartera virtual (símbolo ▱) y un acceso a Carteras/wallet conectada (◉). También muestra Notificaciones y Promociones con el mismo símbolo ♧. La primera pareja puede tener funciones distintas, pero la iconografía no las diferencia; la segunda pareja comparte exactamente el mismo icono pese a abrir funciones diferentes.
- Revisión visual completa de todos los componentes, breakpoints, loaders, accesibilidad y animaciones: **pendiente**.

Evidencia: [App.tsx, encabezado y acciones](src/App.tsx#L130), [catálogo de rutas](src/catalog.ts), [Skeletons.tsx](src/Skeletons.tsx), [estilos responsive y movimiento reducido](src/styles.css).

### 2. Crear y comprar un minero — **Parcial; cobro no verificado**

- Configurador, selección, revisión y apertura de checkout: verificados.
- El catálogo de mineros está guardado como observación fechada; no se sincroniza en vivo con GoMining. El anual está deshabilitado por decisión del usuario.
- El checkout consulta cotización y muestra importe/destino/vencimiento. En esta auditoría se canceló antes de abrir la wallet.
- No se verificaron rechazo de una solicitud de transacción, recibo on-chain, conciliación de una orden ni activación de un minero pagado.
- El flujo demo puede cambiar workers/saldo local, pero no prueba una compra cobrada.

Evidencia: [minerCatalog.ts](src/minerCatalog.ts), [MinerBuilderDialog en App.tsx](src/App.tsx#L1011), [WalletPaymentCheckout.tsx](src/WalletPaymentCheckout.tsx#L102).

### 3. Recargar — **Parcial; dos accesos inconsistentes**

- **Inicio → Recargar:** se observó el modal correcto y su botón para pago con wallet; no se solicitó el pago.
- **Cartera virtual → Recargar:** se observó un diálogo genérico. No llega al mismo checkout ni al diálogo específico de recarga.
- “Añadir saldo demo” está implementado en memoria, pero no se pulsó en esta auditoría.
- Una transferencia real no acredita saldo por sí misma; falta verificación backend.

Evidencia: [acciones del encabezado y top-up](src/App.tsx#L136), [modal de recarga](src/App.tsx#L1091), [definición de Cartera virtual](src/catalog.ts#L135).

### 4. Connect Wallet — **Parcial; móvil pendiente**

- MetaMask ya conectada fue detectada y mostrada en el encabezado y reconocida en el checkout.
- Carteras presenta Solflare, Phantom, MetaMask, Coinbase Wallet, Trust Wallet, TronLink y UniSat.
- No se probó conectar, cancelar permiso, desconectar ni cambiar cuenta para cada proveedor.
- El texto de la interfaz declara “Conectar una extensión”. El código busca proveedores inyectados para varias wallets y usa el SDK de Solflare; no aparece una implementación propia de enlaces universales móviles, callbacks de retorno ni WalletConnect/Reown/AppKit.
- **No hay evidencia de que una visita desde Safari/Chrome móvil abra la app correspondiente.** Una wallet podría proporcionar un navegador in-app con proveedor inyectado, pero ese caso tampoco se probó.
- Por tanto, “Connect Wallet desde el móvil y volver del wallet app al checkout” **no está verificado y no debe darse por implementado**.

Evidencia: [WalletPanel.tsx](src/WalletPanel.tsx#L1), [walletSession.ts](src/walletSession.ts#L260), [dependencias instaladas](package.json).

### 5. Cotización, red y recepción — **Parcial; no aceptable como recepción Bridge verificada**

- Se cargaron precios públicos para el activo elegido y tipo de cambio de referencia cuando el catálogo está en MXN. Checkout marca una cotización válida por 30 segundos y vuelve a consultar antes de solicitar el pago.
- No se probaron todas las redes, la expiración durante espera, el fallo de proveedores ni el resultado de una transacción.
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
- **Defecto de expiración:** el cálculo de potencia comprueba endsAt, pero el registro del retiro demo consulta solo si existe subscription. Una suscripción caducada puede seguir mostrando “sin cola diaria” en el retiro demo.

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

### 11. Firebase y persistencia — **No implementado**

- No hay SDK/configuración de Firebase conectada ni backend de órdenes.
- Las reglas locales deniegan lectura/escritura cliente; el esquema es una propuesta documental.
- Wallets, compras, recibos demo, saldos y simulaciones no forman una cuenta persistente compartida ni verifican pagos.

Evidencia: [firestore.rules](firestore.rules#L8), [firestore-schema.md](firestore-schema.md).

## Hallazgo crítico: por qué el checkout puede no cerrar

En WalletPaymentCheckout.tsx, requestPayment activa sending antes de actualizar la cotización y esperar sendPayment. Mientras sending permanezca en true:

- el botón X queda disabled;
- Cancelar queda disabled;
- el clic en el fondo no cierra el diálogo.

El finally vuelve a habilitar controles cuando la promesa resuelve o rechaza. Si el proveedor de wallet cierra su ventana pero deja la promesa pendiente, finally no se ejecuta y el checkout queda atrapado. Si MetaMask rechaza normalmente y la promesa termina, el código sí debería recuperar el modal.

**Clasificación:** defecto de resiliencia confirmado por inspección de código; la secuencia concreta “cerrar la ventana de MetaMask y quedarse bloqueado” no se reprodujo en esta sesión. No se abrió una solicitud de pago: el botón inicia una petición de transacción real para una cuenta conectada y ese paso se dejó sin ejecutar.

Evidencia: [WalletPaymentCheckout.tsx, requestPayment y controles de cierre](src/WalletPaymentCheckout.tsx#L102).

## Pagos móviles: estado exacto y referencia de integración

La réplica actual conecta desde extensiones/proveedores del navegador. El código de envío llama métodos de cada proveedor y algunos de ellos transmiten una transacción firmada a Mainnet si el usuario la aprueba. No se encontró flujo explícito para:

- detectar móvil y distinguir wallet disponible;
- abrir la aplicación mediante universal/deep link;
- conservar estado/cotización de checkout al cambiar de app;
- recibir callback o volver a la ruta de checkout;
- manejar wallet no instalada, rechazo, timeout, retorno cancelado o sesión expirada.

Esto requiere integrar y validar un mecanismo móvil. La documentación oficial de MetaMask Connect describe extensión, QR y deep link para su app móvil; Solflare documenta su propio proceso de deeplink Connect y el método separado para firmar/enviar. Son flujos específicos y no están implementados por el código actual: [MetaMask Connect](https://docs.metamask.io/metamask-connect/), [Solflare Deeplinks](https://docs.solflare.com/solflare/technical/deeplinks), [Solflare Connect](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect), [Solflare SignAndSendTransaction](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/signandsendtransaction).

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

El checklist del proyecto conserva una cifra previa de 56 URLs/variantes. El barrido que sustenta este informe lista 55; la diferencia de conteo debe resolverse si se actualiza automáticamente el checklist. No se usó el número como prueba de funcionalidad.

## REA y límites de evidencia

Se intentó usar REA/Linux para la captura del navegador. La búsqueda de targets de Chrome DevTools para la réplica local no encontró un endpoint disponible y la captura temporal de REA falló antes de producir recursos; devolvió cleanup incompleto y cero evidencias capturadas. Para respetar la propiedad/limpieza de recursos, no se repitió la captura ni se afirma que REA auditó visualmente GoMining en esta sesión.

La nota ya existente en el checklist que dice que REA recorrió 41 destinos es un registro previo del proyecto; no equivale a evidencia REA obtenida ahora. Esta auditoría combina CUA del navegador local y lectura de código. No es ingeniería inversa de la sesión autenticada de GoMining ni prueba de paridad visual completa.

## Defectos y pendientes que conviene convertir en trabajo

| Prioridad | Tema | Evidencia/impacto |
|---|---|---|
| P0 | Verificación/conciliación antes de vender | Un pago Mainnet puede llegar a un destino sin orden verificada; no activa producto y no hay backend que lo reconcilie. Validar destino, red, activo, monto, confirmaciones, idempotencia y reembolsos antes de producción. |
| P1 | Pago desde móvil | Faltan universal/deep links y retorno a checkout; el flujo no se ha probado en dispositivo móvil ni en wallet app. |
| P1 | Checkout bloqueado | Cierre bloqueado mientras sending; si el proveedor deja la promesa pendiente, modal atrapado. Falta timeout/abort/estado recuperable y prueba con rechazo/cierre. |
| P1 | Rutas/destinos Bridge | La tasa 1% es fija/estimada y la réplica no valida la cotización ni la asociación de direcciones con Solflare Bridge. |
| P1 | Recarga desde Cartera virtual | CTA presenta el modal genérico, mientras Inicio usa el checkout de recarga. |
| P1 | Persistencia y activación | Falta backend/Firebase, cuenta, pedido, procesador de eventos y activación idempotente. |
| P2 | Iconografía del encabezado | Wallet virtual vs wallet conectada y Notificaciones vs Promociones no se distinguen visualmente. |
| P2 | Retiro demo al expirar suscripción | Inconsistencia entre endsAt aplicado a potencia y la comprobación de cola del retiro. |
| P2 | Revisión responsive completa | Solo se observó 460 px en esta auditoría; falta 390/768/1440 y revisión por ruta, zoom 100%, legibilidad y controles táctiles. |
| P2 | Carga y fallbacks | Se observó skeleton normal; falta forzar error/demora de cada fuente y verificar recuperación, timeout y retry. |
| P3 | Cobertura real de módulos | Muchas rutas son genéricas, de demo, vacías o muestran que falta fuente de datos; no equivalen a funcionalidad GoMining. |

## Conclusión para preparar la siguiente especificación

Puedes usar este resultado para dividir el siguiente encargo en tres frentes:

1. **Checkout seguro y móvil:** escoger integración de conexión móvil, conservar el checkout al regresar de la wallet, permitir cancelar/recuperar y probar en testnet/mocks antes de Mainnet.
2. **Venta verificable:** obtener cotización/ruta verificable y construir backend que asocie el pago confirmado a una orden; solo después activar minero/suscripción o acreditar saldo.
3. **Pulido UX y cobertura:** resolver iconos, conectar ambos accesos de recarga al mismo flujo, corregir expiración demo y terminar la matriz responsive/loaders para las rutas prioritarias.

Este informe es una auditoría del estado actual; no modifica la implementación de pagos ni autoriza transferencias reales.

