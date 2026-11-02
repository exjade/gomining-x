# Auditoría funcional GoMining — cierre con REA

**Fecha:** 1 de noviembre de 2026  
**Criterio:** checklist funcional entregado por el usuario (`Texto pegado.txt`), reflejado en [`gomining-replica-checklist.md`](./gomining-replica-checklist.md).  
**App revisada con REA:** build local aislado en `http://127.0.0.1:5183`, Chromium/Brave administrado por REA. El build se preparó sin variables de Firebase.  
**Alcance de seguridad:** no conecté una wallet real, no firmé mensajes, no aprobé transacciones, no envié fondos y no cambié ajustes de Firebase. Cada perfil temporal de REA cerró su proceso al terminar (`terminated-owned-process`).

## Resumen para decidir qué falta

La réplica sí tiene pantallas móviles legibles y los recorridos básicos de Inicio, crear minero, recargar y abrir el checkout responden. REA confirmó la apertura y cierre de los diálogos, cotización BNB, la pantalla de suscripciones y el historial público de Kryptex. El botón de Crear minero cambia la URL a `/home?modal=paywall-create`. El checkout se pudo cerrar con la X después de abrirlo desde Recargar.

La conexión y el cobro no están validados de extremo a extremo. El perfil temporal no tiene extensiones de wallet; al pulsar Conectar en MetaMask mostró correctamente que no está instalada. Los enlaces móviles existen en el código, pero no se usó un teléfono, una app wallet ni un dominio público HTTPS durante esta auditoría. No se confirmó ninguna transferencia. Un pago Mainnet aprobado podría mover fondos a la dirección configurada; la app no verifica ese pago ni lo relaciona con una orden o con la activación del minero, la suscripción o la recarga.

**Resultado global:**

- **Cumple en REA:** navegación de Inicio y logo; apertura de configurador desde Inicio; cierre del configurador; apertura de checkout desde Crear minero y Recargar; cierre del checkout en reposo; carga de una cotización BNB; acceso directo a Cartera; respuesta clara cuando falta MetaMask; lectura del historial público de operaciones y paginación.
- **Cumple en código, pendiente de proveedor/dispositivo:** conectores directos, envío de transacción con confirmación explícita, enlaces de apertura para algunas apps móviles, recuperación del checkout y simulaciones de negocio.
- **Demo:** saldos, mineros, suscripciones, referidos, retiros, preventa y economía del operador.
- **Pendiente crítico:** conexión y pago desde un teléfono real, cancelación de una solicitud pendiente de MetaMask, verificación de destinatarios/rutas Bridge, conciliación de órdenes y activación de productos. La restauración del saldo demo desde la interfaz ya se probó en una sesión Firebase aislada.

## Criterios de estado

| Estado | Significado |
|---|---|
| **Cumple · REA** | El paso se reprodujo en la app aislada y existe una evidencia REA identificada abajo. |
| **Parcial** | Se observó una parte del recorrido; falta una acción, tamaño o condición indicada. |
| **Código** | Existe implementación visible en el código; la integración no fue reproducida por REA. |
| **Demo** | Cambia estado local o muestra cifras de escenario; no acredita una operación comercial real. |
| **Pendiente / no verificado** | No se ejecutó, la evidencia no alcanza para confirmarlo o depende de wallet, backend, teléfono o cuenta externa. |

## Matriz del checklist entregado

### 1. Inicio, navegación y diseño

| ID | Requisito | Estado y evidencia |
|---|---|---|
| 1.1 | Abrir Inicio por URL y desde el logo | **Cumple · REA.** `/home` cargó a 390 px. Desde `/gmt-wallets`, el logo llevó a `/home` (`ev_b24d5d9c…`). |
| 1.2 | Crear minero, URL modal y cierre sin comprar | **Cumple · REA.** El botón cambió a `/home?modal=paywall-create` (`ev_88183282…`). La X del configurador volvió a `/home` y quitó el modal (`ev_340f36a5…`). No se completó una compra demo. |
| 1.3 | Accesos superiores, menú, perfil, carrito y wallet | **Parcial.** REA leyó logo, Mis mineros, Mercado, menú, saldo demo, wallet, carrito y perfil en el árbol accesible. Se activaron el logo, Recargar y Crear minero; no se abrió cada destino superior. |
| 1.4 | Inicio, Carteras y Operaciones a 390/768/1440 px | **Parcial; Operaciones móvil corregida después del cierre.** Inicio: capturas previas a 320, 390, 768 y 1440 px. Carteras: REA a 390 (`ev_1e4c6a6e…`), 768 (`ev_e177c01b…`) y 1440 (`ev_6b8ba143…`). La evidencia nueva muestra tarjetas de pagos a 390 (`ev_5eccfe4e…`) y 768 (`ev_b9308445…`), con tabla oculta; a 1280 px la tabla vuelve con 15 filas (CUA). La captura previa a 1440 px describe el diseño anterior. No se revisaron todas las rutas en esos tamaños. |
| 1.5 | Legibilidad al zoom normal | **Parcial; mejora verificada en Operaciones.** A 390/768 px las tarjetas apilan estado, importes y hash sin scroll de tabla. Inicio, Carteras y checkout tienen capturas previas legibles; faltan las demás rutas/modales y la evaluación de contraste integral. |
| 1.6 | Progreso de retos | **Código / demo.** No avancé retos mediante compras o activaciones. Las recompensas se etiquetan como demo. |
| 1.7 | Reducir movimiento | **Parcial.** Los recorridos REA se configuraron con movimiento reducido y CSS declara soporte; no se midieron todas las animaciones en cada pantalla. |
| 1.8 | Skeleton, demora, error y recuperación de datos | **Parcial.** En la primera carga se observó el skeleton de la ruta y, después, el contenido. No forcé error ni timeout de API; el fallback recuperable no queda probado con esta evidencia. |
| 1.9 | Todas las rutas directas | **Parcial, evidencia previa.** El barrido previo comprobó 56 URL/variantes a nivel de render inicial. No prueba el funcionamiento interno de cada sección. |

### 2. Crear y comprar un minero

| ID | Requisito | Estado y evidencia |
|---|---|---|
| 2.1 | Abrir configurador y revisar paquetes de compra única | **Cumple · REA.** Se vieron Esencial, Clásico, Pro, Máximo y Personalizado (`ev_15d7e31d…`). |
| 2.2 | Coincidencia de precios con catálogo GoMining | **Parcial.** El configurador muestra una captura de catálogo fechada y el precio se etiqueta como observado. No comparé cada nivel contra GoMining en vivo durante esta sesión; el catálogo no se sincroniza en vivo. |
| 2.3 | Opciones mensual y personalizada | **Parcial.** Las opciones aparecen en la interfaz; no seleccioné y recalculé cada modalidad/nivel en esta sesión. |
| 2.4 | Revisión, consentimiento y apertura de checkout | **Cumple · REA hasta antes de pagar.** El recorrido abrir configurador → continuar → marcar consentimiento → abrir checkout terminó sin error (`ev_f64786c6…`). |
| 2.5 | Importe cripto, destino y vigencia | **Parcial.** La cotización BNB y sus campos aparecieron (`ev_8cf7bada…`). La vigencia de 30 s se muestra en código; no esperé a que venciera. El recorrido previo revisó las seis redes. |
| 2.6 | Rechazo de una solicitud en wallet | **Pendiente.** No se abrió solicitud de envío porque el perfil temporal no contenía MetaMask ni otra wallet. |
| 2.7 | Pago y activación del minero | **Pendiente crítico.** No envié fondos. La réplica no verifica confirmaciones ni crea/activa una orden pagada automáticamente. |
| 2.8 | Compra de minero demo | **Demo, no ejecutado.** No activé workers ni cambié saldo durante esta sesión. |

### 3. Recargar

| ID | Requisito | Estado y evidencia |
|---|---|---|
| 3.1 | Abrir recarga y probar importes sugeridos/personalizado | **Parcial.** Se abrió el diálogo desde Inicio; no probé cada botón de importe. |
| 3.2 | Pagar con wallet desde recarga | **Cumple · REA hasta checkout.** Recargar → Elegir wallet y pagar → checkout cargado (`ev_89abff99…`). No había wallet para reutilizar. |
| 3.3 | Rechazo de pago sin recibo | **Pendiente.** No hubo solicitud real que rechazar. |
| 3.4 | Añadir saldo demo | **Demo, no ejecutado.** No pulsé Añadir saldo demo. |
| 3.5 | Acreditación de transferencia real | **Pendiente crítico.** Una transferencia no acredita saldo; falta reconciliador de depósitos en servidor. |

### 4. Connect Wallet

| ID | Requisito | Estado y evidencia |
|---|---|---|
| 4.1 | Conectar y desconectar cada proveedor disponible | **Parcial.** REA encontró las siete opciones. En el perfil aislado no había extensiones; intentar MetaMask mostró “No se encontró MetaMask” (`ev_01a78b57…`). Ningún proveedor se conectó. |
| 4.2 | Mostrar dirección pública en encabezado y desconectar | **Código / pendiente de conexión real.** El encabezado muestra un botón Conectar y el código cambia a dirección abreviada al conectar. No había dirección en el perfil temporal. |
| 4.3 | Cancelar permiso de conexión | **Pendiente.** Sin proveedor no se pudo abrir ni rechazar un permiso de conexión. |
| 4.4 | Reutilizar conexión compatible en compra/recarga | **Código.** El checkout valida proveedor/red y reutiliza la sesión compatible. No se probó con una sesión conectada. |
| 4.5 | Sin WalletConnect/Project ID/Rango/frase semilla | **Cumple en código y texto observado.** La vista anuncia conexión directa y no pide frase semilla. La integración usa proveedores directos; el checkout no mostró WalletConnect ni Project ID. |
| 4.6 | Proveedores disponibles | **Cumple para detección negativa del perfil aislado.** MetaMask no estaba disponible; la réplica muestra un error claro. El inventario del navegador real del usuario no se inspeccionó. |

### 5. Cotización, red y recepción

| ID | Requisito | Estado y evidencia |
|---|---|---|
| 5.1 | Cotización pública, actualización y vencimiento | **Parcial.** BNB cotizó en el checkout aislado; la regla de vencimiento y actualización está en el código. No esperé 30 s ni comparé todos los activos otra vez. |
| 5.2 | Deshabilitar pago si cotización falla/vencida | **Código, no forzado.** No provoqué error o expiración en REA. |
| 5.3 | Redes BNB, BTC, ETH, TRON y Polygon | **Código y evidencia previa.** El checkout ofrece esas rutas y Solana/USDT. En este cierre se abrió BNB; el barrido anterior observó cotizaciones de las seis opciones. |
| 5.4 | Separar 1% estimado de gas | **Código.** El 1% Bridge es una estimación fija de la réplica; el gas final lo presenta la wallet. No se comparó contra una cotización Bridge viva. |
| 5.5 | USDT SPL directo en Solana | **Código.** La ruta queda configurada para USDT SPL; no se firmó desde Solflare. |
| 5.6 | Recibo, hash y conversión Bridge pendiente | **Pendiente.** Sin transacción no hay recibo/hash que revisar. La conversión final no se verifica en la réplica. |
| 5.7 | Verificar destinos y tokens dentro de Solflare Bridge | **Pendiente crítico.** No inicié el Bridge ni confirmé que cada dirección corresponda a la ruta/activo que el usuario desea. |

### 6. Suscripciones

| ID | Requisito | Estado y evidencia |
|---|---|---|
| 6.1 | Activar suscripción mensual demo | **Demo, no ejecutado.** La vista ofrece activar 30 días localmente. |
| 6.2 | Aplicar 1% a potencia activa | **Demo / código.** La regla está implementada; no activé suscripción ni comparé potencia en una granja con workers. |
| 6.3 | Retiro demo con/sin suscripción | **Demo / no probado.** No ejecuté retiros. |
| 6.4 | Plan anual deshabilitado | **Cumple · REA.** La pantalla muestra el plan Anual deshabilitado (`ev_2e29b450…`). |
| 6.5 | Checkout mensual y activación tras pago | **Checkout verificado · REA 390 × 844.** La acción mensual abrió checkout, se vio el skeleton y cargó la cotización BNB (`ev_3c3f1b2478bcd39b5cde729bf0fd377eb3d83f2fdcace175259022a19cf6d4d5`, `ev_71a0c8a50e5d5b94486bbbfc0f18a9234ddee12d7e52eb18a03aab46c3ccb40a`). No se conectó wallet ni se pagó. Un hash tampoco activa el beneficio; activación sigue pendiente. |

### 7. Referidos y Unilevel

| ID | Requisito | Estado y evidencia |
|---|---|---|
| 7.1 | Resumen, recompensas y amigos | **Ruta previa / profundidad pendiente.** Las rutas están en el catálogo; no recorrí las tres páginas en este cierre. |
| 7.2 | Verificar 10% directo sobre base posterior a costos | **Código / escenario.** La fórmula aparece en la calculadora; no corrí el caso numérico en la interfaz durante este cierre. |
| 7.3 | Ajustar profundidad, pesos y elegibilidad | **Demo / código.** Configuración local, no aprobada como regla comercial real. |
| 7.4 | Acreditar recompensa demo | **Demo, no ejecutado.** |
| 7.5 | Ledger y pagos reales | **Pendiente.** No existe ledger conectado ni pago real a referidos. |

### 8. Pool, operaciones, workers y granjas

| ID | Requisito | Estado y evidencia |
|---|---|---|
| 8.1 | Ingreso diario Kryptex/PRL con hora | **Lectura pública previa; no repetida en este cierre.** No representa el ingreso de esta réplica. |
| 8.2 | Historial público y enlaces Pearl | **Cumple para la vista y datos mostrados · REA.** Operaciones mostró 56 registros, 15 filas por página y marcas “Confirmado en pool” (`ev_ec547793…`, `ev_3845086b…`, `ev_71cc6af5…`). El historial no demuestra conversión a USDT ni pago a un comprador. |
| 8.3 | Paginación y transacción Pearl | **Parcial.** REA avanzó a Página 2 de 4 (`ev_7ddcd1f8…`). No abrí el enlace externo de una transacción. |
| 8.4 | Workers demo y modo automático/manual | **Demo / código.** No cambié workers ni modo en este cierre. No existe conexión de telemetría de ASIC. |
| 8.5 | Granjas sin datos inventados | **Código / evidencia previa.** No consulté de nuevo esa ruta en este cierre. No hay evidencia de granjas reales conectadas. |
| 8.6 | No atribuir ingreso público a compradores | **Cumple en el aviso observado.** La vista advierte que el estado de pool no deduce llegada final a otra wallet. |

### 9. Economía del operador

| ID | Requisito | Estado y evidencia |
|---|---|---|
| 9.1 | Cambiar TH, W/TH, electricidad, mantenimiento y auxiliares | **Código / escenario no ejecutado.** |
| 9.2 | Ingresos mensuales por suscripción/mantenimiento | **Código / escenario.** No son ventas conciliadas. |
| 9.3 | Comparar niveles Unilevel | **Código / escenario no ejecutado.** |
| 9.4 | No afirmar margen real si faltan costos | **Cumple en la presentación de escenario; cálculos reales pendientes.** |

### 10. Preventa

| ID | Requisito | Estado y evidencia |
|---|---|---|
| 10.1 | Simular cantidad, precio y recibo | **Demo / no ejecutado.** |
| 10.2 | Sin campaña, contrato ni emisión real | **Cumple como límite de implementación.** No hay token contract ni preventa real. |

### 11. Firebase y persistencia

| ID | Requisito | Estado y evidencia |
|---|---|---|
| 11.1 | Revisar esquema y reglas | **Verificado en adenda.** Auth anónimo y reglas están desplegados en `salad-miners`; se comprobaron lectura, escritura y aislamiento por UID. En una sesión aislada `localhost:5173` se guardó USD 1 demo desde la UI y reapareció tras recargar. La sesión de trabajo `127.0.0.1` no se modificó. |
| 11.2 | Backend autenticado, verificador, idempotencia, activación y auditoría | **Pendiente crítico.** No existe prueba de un backend completo de órdenes/pagos que cierre este flujo. |

## Hallazgos específicos solicitados

### Pago desde la app móvil de una wallet

El código actual usa MetaMask Connect para abrir la app nativa de MetaMask y establecer una sesión EIP-1193; el usuario había reportado que la ruta previa `/dapp/` abría una pantalla en blanco, por lo que se retiró. Solflare, Phantom, Coinbase Wallet, Trust Wallet y TronLink conservan enlaces de apertura móvil. El checkout conserva producto, monto, moneda y red. UniSat requiere proveedor de extensión y no tiene enlace móvil. No se usó un teléfono durante esta revisión, por lo que la apertura, conexión, regreso, rechazo y firma en cada app siguen **sin validar**.

El flujo móvil requiere una URL HTTPS accesible desde el teléfono; `127.0.0.1`/`localhost` apunta al propio dispositivo. Para MetaMask, `client.connect()` de MetaMask Connect usa un enlace de conexión a la app nativa; el universal link evita la página `/dapp/` que el usuario reportó vacía. No autoriza ni firma por sí solo. Solflare y Phantom conservan sus flujos de navegador integrado. Fuentes: [MetaMask Connect](https://docs.metamask.io/metamask-connect/), [quickstart](https://docs.metamask.io/quickstart/), [Solflare Browse](https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse), [Phantom deep links](https://docs.phantom.com/phantom-deeplinks/deeplinks-ios-and-android), [Trust Wallet deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) y [TronLink deep links](https://docs.tronlink.org/mobile/deeplink/).

### Cierre después de cancelar en MetaMask

En el checkout aislado, la X y Cancelar cerraron el diálogo cuando no había una solicitud pendiente (`ev_89abff99…`, `ev_f64786c6…`). La X del configurador también cerró y limpió el parámetro modal. La implementación conserva X, Cancelar, clic fuera y Escape; al detectar un rechazo normalizado muestra aviso y cierra el checkout.

**La queja original no queda completamente resuelta por esta prueba:** no había MetaMask real y no reproduje cerrar o cancelar el cuadro de confirmación del proveedor mientras `sendPayment` esperaba. Si la wallet rechaza con un error reconocido, el checkout debería cerrarse. Si la wallet deja la promesa abierta, cerrar la página solo oculta el checkout de la réplica; la página no puede cancelar la solicitud dentro de MetaMask. Este punto necesita un ensayo seguro en testnet o una wallet simulada antes de declararse resuelto. No hagas otro intento de pago hasta revisar Actividad en la wallet.

### Iconos duplicados en la barra superior

En las capturas REA actuales se distinguen el logo, saldo demo, un botón Conectar, carrito y perfil. El árbol accesible muestra un solo enlace de wallet y no hay control de notificaciones renderizado. En 390 px se lee “Conectar”; en 768 y 1440 px también se ve el rótulo. El icono del carrito es independiente. Las capturas actuales no muestran dos botones de wallet ni dos campanas. Si el navegador de `5173` muestra otra barra, se está mirando otra instancia/build: el recorrido REA de este informe se hizo en el preview aislado `5183`.

### Legibilidad y adaptación

- **Inicio móvil (390 px):** saldo demo, acciones en cuadrícula 2×2, retos y textos legibles (`ev_ecde8dd2…`).
- **Carteras (390/768/1440 px):** tarjetas en una columna móvil y rejilla mayor en pantallas amplias. El texto de conexión y los siete proveedores son distinguibles en el árbol accesible.
- **Checkout móvil (390 px):** formulario de una columna, importe y botones grandes; la X permanece visible al inicio del diálogo (`ev_8cf7bada…`). La parte inferior necesita scroll vertical.
- **Checkout de suscripción móvil (390 × 844 px):** REA volvió a recorrer el pago mensual; primero apareció el skeleton de cotización y después cargó el importe BNB. Evidencias nuevas: `ev_3c3f1b2478bcd39b5cde729bf0fd377eb3d83f2fdcace175259022a19cf6d4d5`, `ev_71a0c8a50e5d5b94486bbbfc0f18a9234ddee12d7e52eb18a03aab46c3ccb40a`. No hubo conexión, firma ni envío.
- **Operaciones (evidencia histórica sustituida):** el diseño anterior requería scroll horizontal a 390/768 px. La actualización posterior cambió esos anchos a tarjetas accesibles y mantuvo la tabla a 1280 px. Véase la nueva evidencia `ev_5eccfe4e…` (390), `ev_b9308445…` (768) y el addendum en [`gomining-replica-audit-2026-11-01-seguimiento.md`](./gomining-replica-audit-2026-11-01-seguimiento.md#actualizacion-rea-operaciones-en-movil--1-nov-2026). La auditoría a 1440 px corresponde al diseño anterior.
- El perfil REA se configuró con `reduced_motion`; no se hizo evaluación completa de todas las animaciones ni una prueba de fallo de fuente de datos.

## Registro REA para auditoría

Las entradas siguientes identifican replays controlados del navegador. Las tres últimas se añadieron en la ejecución de checkout móvil descrita abajo; su captura no confirma el resultado de Firebase. Ninguna evidencia representa una wallet conectada o un pago aprobado.

| Evidence ID | Pantalla/acción comprobada |
|---|---|
| `ev_ecde8dd2b6fd5cf83e327224871987c1b37c148a2e6498a5e2982fe5d6b9c8a0` | Inicio, 390 px, barra superior y retos visibles. |
| `ev_b24d5d9c8fcac391839dba11f5b611748ab5efaee59992d6fe2c6fef77e5aaa4` | Logo desde Carteras lleva a Inicio. |
| `ev_88183282cb72a02e26b02f205870189be5097a0b5590b98ec713a43128f1a7cd` | Botón Crear minero abre el configurador y actualiza URL. |
| `ev_340f36a5b821fa0b61e2028b0cc3e3c1b2d6a4f9a233e4015227e60bd5ee6547` | X del configurador cierra y limpia `modal=paywall-create`. |
| `ev_f64786c6e1903f2d8a4c1407231f12fdcc2c046fcf53677c92c2022f955b421f` | Configurar → aceptar → abrir checkout → cerrar; sin pago. |
| `ev_8cf7bada66bed486725900af327473cfd83f70bd6d208dd02f973d7b47980f1d` | Checkout BNB, cotización y campos del pago; wallet sin conectar. |
| `ev_89abff9913d594d37cfeb86079c36e2a60e952dfb1a3cf4259c76a5e26e30519` | Recargar → checkout → cerrar con X; sin pago. |
| `ev_1e4c6a6e23c97c2eeb5affe5352358f54243b97ef5b482842815a700de141e56` | Carteras a 390 px tras completar carga. |
| `ev_01a78b576bb5843bc5144494c72f6bc6e41a44ca820d099d1ae28cbe526d4524` | MetaMask ausente: mensaje recuperable, sin solicitud de transacción. |
| `ev_e177c01b940de8e2c6f8404726e870e96ddff3093ec67a10bd996fef811e00fc` | Carteras a 768 px, siete opciones y rótulo Conectar. |
| `ev_6b8ba1430e467c06a66082bdc80572eb6a90c44b9dc21970352255499670da2c` | Carteras a 1440 px, rejilla de proveedores. |
| `ev_2e29b4501bce74755424a4d8288d06bdc61dcc819e157eda2640e2647b639a77` | Suscripciones: $29.99/30 días; anual disabled. |
| `ev_ec54779393a73f9603038857ad8b5bb6baad26060be0e30738490b9fa0bbce50` | Operaciones a 390 px; tabla pública de pagos. |
| `ev_3845086b7664c095fae4f4a2bd8cfa0abeecdbf0dabd322ac8713c0a2950aaed` | Operaciones a 768 px. |
| `ev_71cc6af5783302b8c073e6519461e209e681ad392041cce78006705f365f1a58` | Operaciones a 1440 px. |
| `ev_7ddcd1f811d3917aead1227c2cad991dfce1c29160eb575f595529305ef78d65` | Paginación de Operaciones a Página 2 de 4. |
| `ev_7ac451ef72995ef030dc401f5ea5f0fe7851a45e072b8c8524d52bdf503f4cb2` | Inicio en preview con viewport 390 × 844; visible el estado `Conectando guardado demo…`. No confirma el resultado de Firebase. |
| `ev_3c3f1b2478bcd39b5cde729bf0fd377eb3d83f2fdcace175259022a19cf6d4d5` | Checkout mensual en 390 × 844 durante la carga; skeleton de cotización visible, X disponible, sin wallet conectada. |
| `ev_71a0c8a50e5d5b94486bbbfc0f18a9234ddee12d7e52eb18a03aab46c3ccb40a` | Checkout mensual en 390 × 844 con cotización BNB cargada; no se pulsó Pagar. |

## Incidencia del entorno y límites

Una primera prueba se había iniciado sobre el servidor de desarrollo `5173`, donde aparecieron dos errores HTTP 400 de Firestore y un aviso genérico de conexión. Detuve ese recorrido y usé para el resto un build de preview local compilado sin variables Firebase. No vi evidencia de que la acción hubiera guardado datos, pero tampoco puedo certificar que el primer intento no creara una sesión anónima antes del error. No consulté Firebase Console, no cambié configuración remota y no declaré confirmada la configuración de reglas remotas.

El replay REA sobre el preview no registró errores de consola o página en las pantallas enumeradas. La captura de eventos de red de esa pasada devolvió cero transacciones; por sí sola no es prueba de que nunca exista tráfico externo. Los precios de mineros son una observación fechada, las cifras de pool vienen de lectura pública y el flujo de ingresos/costos es un escenario.

## Qué debe resolverse antes de llamar a esto “pago funcional”

1. Probar enlaces móviles en iOS y Android con un dominio HTTPS estable y cada wallet/app objetivo. Registrar apertura, retorno, conexión, cancelación y proveedor detectado, sin aceptar un pago Mainnet.
2. Probar la cancelación de una solicitud pendiente en testnet/mock, incluida la X de la wallet, el botón Cerrar del checkout y un provider que deje pendiente la promesa.
3. Verificar con Solflare cada dirección por red/token y la conversión Bridge, tarifas, mínimos y proceso de reembolso.
4. Crear una orden de servidor antes de mostrar un destino, asociar monto/red/token/cotización, verificar confirmaciones y procesar pagos de forma idempotente antes de acreditar saldo o activar productos.
5. **Operaciones móvil resuelta:** tarjetas apiladas y skeleton móvil a 390/768 px, tabla a 1280 px. Sigue pendiente volver a revisar todas las demás rutas a 390/768/1440 px.
6. **Cerrado para estado demo:** en una sesión aislada `localhost:5173`, añadir USD 1 mostró `Demo guardado` y la recarga restauró USD 1. No modifica la validación de pagos reales ni el resto de la sesión `127.0.0.1`.

**Cierre:** este informe separa implementación de evidencia real. El checkout visual está conectado al código de wallets y su cotización, pero la venta, el abono y la activación automática no están completos ni verificados. No se hicieron pagos de prueba.

## Adenda posterior · 1-nov-2026

### Firebase de demostración

Después de la autorización del usuario, se desplegaron Auth anónimo y las reglas locales en `salad-miners`. El source remoto de Firestore coincide con `firestore.rules`; solo permite el documento de demo del UID autenticado y niega otras rutas. Una cuenta anónima temporal pudo leer el estado propio, no leer otro UID, escribir y leer un snapshot demo; el documento y la cuenta se eliminaron al terminar. Una segunda comprobación con el SDK Web de Firebase (igual al SDK que usa la app) también inició sesión, leyó, guardó y volvió a leer un snapshot, y luego limpió la prueba. No se guardaron direcciones de wallet ni recibos de cadena.

La ida/vuelta desde la UI también se comprobó en una sesión anónima aislada de `localhost:5173`: Recargar → añadir USD 1 demo → `Demo guardado` → recargar → USD 1 restaurado. La sesión de Brave en `127.0.0.1` no se alteró; ahí se comprobaron por separado el indicador `Demo guardado` y el cierre en reposo de Recargar y del configurador. El snapshot de prueba permanece en el proyecto Firebase bajo esa cuenta anónima y contiene únicamente estado demo. El backend de órdenes, conciliación de pagos, idempotencia y activación de mineros/suscripciones siguen pendientes.

### Ajuste del deeplink móvil de Trust Wallet

La implementación enviaba `coin_id=60` para todas las redes EVM. Se corrigió para que BNB use 714 y Polygon 966, junto con Ethereum 60, Bitcoin 0, TRON 195 y Solana 501. La generación local de los seis enlaces pasó; no se probó abriendo Trust Wallet en un teléfono.

REA/Linux analizó estáticamente `walletAppLinks.ts`, `walletSession.ts`, `WalletPaymentCheckout.tsx`, `firestoreDemoSync.ts` y `demoStore.ts` (`ev_02d4fc721e880ac45a6bce16f48087cd67cddfe7701c16195b0fd65835dee9dc`, `complete-within-view`). `npm run build` pasó y cinco rutas clave respondieron HTTP 200. La limitación de dispositivos reales, solicitud de wallet pendiente y pago de prueba continúa vigente.

## Adenda de cierre · interacción móvil y cancelación simulada · 1-nov-2026

### Resultados de reproducción

La inspección local a 390 × 844 px encontró la X fuera del viewport después de desplazar el checkout al final. Se corrigió con posición sticky: al volver a abrir el checkout, la X quedó visible en el encabezado incluso con el contenido desplazado. X y Cancelar cerraron la interfaz en reposo.

Se probó por separado un provider de wallet falso cuya operación `sendPayment()` permanece pendiente. X y Cancelar cerraron el modal y el checkout mostró el estado de solicitud pendiente. La pantalla explica que cerrar el modal no cancela el aviso que la extensión/app de una wallet real conserve. El harness fue eliminado; no se conectó wallet, no se mostró una solicitud nativa y no se firmó/transmitió nada.

El checkout ahora separa “actualizar cotización” de “esperar la respuesta de wallet”. Antes comparaba el importe cripto con igualdad exacta y podía exigir otro clic por redondeo de los últimos decimales. La nueva regla usa variación relativa >0.1% como material; una diferencia menor permite seguir con el nuevo importe mostrado. Una cotización vencida, variación material o cambio del tipo USD/MXN exige revisar el nuevo valor antes de abrir la wallet. No significa que la cotización esté garantizada por el operador ni que se haya completado una compra.

El encabezado en Inicio, a 390 px, mostró un único acceso a wallet, saldo demo, carrito y perfil, sin controles de notificación duplicados. El ancho de contenido no superó el viewport; la etiqueta de Saldo demo se aumentó a 8 px. Esta comprobación no cubre todas las rutas ni el escritorio.

### Evidencia REA/Linux actualizada

REA/Linux analizó de forma estática siete archivos actualizados: `WalletPaymentCheckout.tsx`, `walletSession.ts`, `walletAppLinks.ts`, `paymentQuote.ts`, `App.tsx`, `firestoreDemoSync.ts` y `demoStore.ts`. Evidence `ev_e7c570b1aa11b89102e89eedd481406fe3c28c8837785596d490af3b3b4206a`; análisis padre `ev_563c3f625c3d83867baacc49f75d744f26ce55472548eb2829df22877592eb4d`; raíz de staging `ac62fcc0b64aa403e5339768a8113485df55fe48ba07c884a8486929fecef547`. Los siete seleccionados parsearon: 35,563 nodos AST, 421 hallazgos estáticos y cero errores de parseo. Dieciséis archivos no se seleccionaron; la cobertura de aplicación y relaciones sigue parcial con 4,904 incógnitas semánticas. REA analizó texto de código inerte: no ejecutó un navegador ni demuestra una integración móvil/on-chain.

Se ejecutó `rea doctor` con Node portable 24.22.2 y el alcance del cliente Codex resultó saludable. La observación histórica sobre Node global 22.17.1 queda superada para esta revisión; no se modificó el Node global ni la configuración de otros clientes. No se repitió el análisis completo de la raíz que había excedido el límite del cliente.

### Compilación

`npm run build` pasó con TypeScript y Vite. Permanece el aviso de Rollup por un chunk de 695.91 kB. El harness temporal se retiró después de probar la ruta simulada.

### Pendientes

- Reproducir rechazo y cancelación dentro de MetaMask/Solflare reales en testnet o mediante mocks de extensión más fieles; una página web no puede cancelar una petición que la wallet mantiene internamente.
- Validar deeplinks en iOS y Android con dominio HTTPS estable y cada app objetivo.
- Añadir backend autenticado de órdenes, verificación on-chain, control de duplicados y activación idempotente antes de tratar depósitos como compras.
- Mantener como demostración la suscripción, retiros, referidos, preventa y telemetría de granjas hasta que existan reglas y servicios reales.

La tabla punto por punto y el checklist operativo actualizado están en [`gomining-replica-checklist.md`](./gomining-replica-checklist.md); el registro narrativo extendido está en [`gomining-replica-audit-2026-11-01-seguimiento.md`](./gomining-replica-audit-2026-11-01-seguimiento.md).

## Adenda de verificación · Firebase CLI y limpieza REA · 1-nov-2026

### Firebase demo

Después de que el usuario autorizó Firebase CLI, `firebase projects:list` identificó el proyecto `salad-miners`. El ensayo `firebase deploy --only auth,firestore:rules --dry-run` compiló correctamente `firestore.rules`. Se publicó solamente Auth y las reglas: el CLI informó `Auth providers enabled: anonymous`, Firestore indicó que el ruleset local ya era la última versión y publicó su release. No se desplegaron Hosting, Functions, usuarios ni pagos. El CLI se ejecutó temporalmente con `npx`; no se instaló globalmente. Los nombres de las seis variables Firebase de `.env.local` estaban presentes; sus valores no se leyeron ni se incluyeron en esta guía.

En una pestaña de auditoría separada, `localhost:5173/home` mostró primero la composición de skeletons; al completar Firebase aparecieron `Demo guardado` y USD 1 de saldo demo. Tras una recarga se restauraron el mismo saldo y el indicador. La pestaña usada se cerró al terminar. La sesión `127.0.0.1` del usuario no fue modificada. Esta comprobación confirma la restauración demo en el cliente actual, no la recuperación entre navegadores/dispositivos ni pagos reales.

### REA

La captura controlada solicitada para `localhost:5173/home` no produjo una captura: `capture_browser_scenario` devolvió `execution_failure` en `rea-playwright-browser-scenario`, seguido de `cleanup_incomplete`; `resources` vino vacío y el servidor indicó que mantenía capacidades de limpieza. Se siguió la guía del skill y se ejecutó el diagnóstico de REA. Con Node portable 24.22.1, doctor reportó saludable la dependencia Node y la inscripción Codex; el entorno global quedó marcado no saludable por motores nativos opcionales ausentes y registros de otros clientes, no requeridos para esta web. No se volvió a lanzar otro escenario REA y no se atribuye evidencia de navegador a REA en esta adenda.

La revisión visual adicional de esta fecha se hizo con el navegador integrado y se limita a la secuencia de carga y restauración de Inicio indicada arriba. Una prueba posterior con CUA verificó por separado los skeletons y mensajes recuperables de error en Pool y Operaciones, como se registra en la adenda final; no se presenta como evidencia REA. Siguen pendientes la revisión de todas las rutas a zoom 100%, providers reales, comprobación Bridge en Solflare, recibo on-chain y backend autenticado de pagos. La cuenta anónima puede leer/escribir solamente su documento demo; órdenes y activaciones continúan fuera del alcance del cliente Firebase.

## Addendum posterior: Operaciones móvil · 1 nov 2026

La vista de pagos públicos ahora cambia a tarjetas a 390 × 844 y 768 × 1024 px. Cada tarjeta conserva fecha, estado, importes, comisión, enlace y acción de copiar hash. El árbol accesible contiene una lista de 15 registros y no expone la tabla de escritorio a esos tamaños. La tabla sigue visible a 1280 px con 15 filas.

Capturas verificables: [390 px](./.rea-mobile-audit-2026-11-01/operations-390.png) y [768 px](./.rea-mobile-audit-2026-11-01/operations-768.png). Evidence REA completa: `ev_5eccfe4e546bb27997b66e4b999039ca2debacdabf728e74c7ddd5012419b0de` y `ev_b9308445ef0966d2822339314111c3bfa614300a125efb1a1e3c9a7d76354f02`.

REA/Linux estático leyó `App.tsx` y `Skeletons.tsx` en el staging del cambio: `ev_4511b4eff6505f67e0e45b0a9ba3e919d8bffc3156db75c414c5d82fe359d52c`; raíz `02f659def980ab82fbed52e089a6abf8139938c4f0b80cb5e9e7156288571bb5`. Se analizaron dos archivos, con 24,325 nodos AST, 263 hallazgos estáticos y cero errores de parseo. Un tercer archivo inventariado no fue seleccionado y la semántica de la app permanece parcial. Build correcto; persiste el aviso de Rollup por el chunk Solana de 695.91 kB.

Este arreglo no convierte la telemetría en datos propios ni valida pagos. La revisión visual completa de todas las rutas a 390/768/1440 px sigue pendiente; no se conectó una wallet ni se envió dinero.

## Cierre interactivo adicional · cotización, MetaMask y checklist · 1-nov-2026

### Cotización de compra observada

En un navegador Chromium aislado servido desde `http://127.0.0.1:5174`, abrí Inicio, el configurador y el checkout de un minero personalizado. La página pasó por el skeleton de cotización y mostró una cantidad BNB calculada desde el precio público. Dejé el checkout abierto sin conectar proveedor; tras más de 30 segundos, la interfaz indicó **“vencida · actualiza antes de pagar”**. Al pulsar **Actualizar cotización** obtuvo un precio y una cantidad BNB distintos, con una nueva vigencia de 30 segundos. Son importes de demostración de esa hora, no precios permanentes ni una promesa de conversión.

La regla del botón de pago depende de `quoteFresh` en `src/WalletPaymentCheckout.tsx`; el botón se deshabilita cuando la cotización venció. En esta revisión no forcé una caída de la API de precios con una wallet conectada. No se conectó una wallet, no se abrió una confirmación de transacción y no se firmó ni transmitió nada.

### Error de conexión MetaMask sin proveedor

REA/Linux reprodujo un intento de conexión en un perfil Chromium temporal sin extensión ni proveedor EVM inyectado. El SDK terminó en el error interno `Cannot read properties of undefined (reading 'create')`, antes de abrir una wallet. Evidencia REA: `ev_c49c506f61a2fb3ec96ab95f2f4da297c0dd3fc12bd785b25596c6992b9dd614`. Se corrigió la presentación para traducir ese error a instrucciones recuperables: actualizar o abrir desde el navegador MetaMask con HTTPS, indicando que no se envió un pago. Repetí el clic en el navegador aislado y vi el nuevo mensaje. Esto corrige el error visible en ese contexto; no prueba que el deeplink de MetaMask funcione o vuelva al checkout en un teléfono.

El teléfono real y la apertura desde MetaMask siguen sin probar. El enlace público usado anteriormente por el usuario presentó el interstitial de ngrok; por eso no tomé un intento en ese enlace como prueba de carga móvil confiable. El deeplink directo al navegador MetaMask está implementado, pero la apertura en un dominio HTTPS accesible continúa pendiente.

### Encabezado e iconos

La revisión previa a 390 px y el control de `src/App.tsx` muestran un único acceso a cartera, saldo demo, carrito y perfil, sin botones de notificación duplicados en el encabezado actual. Esta observación cubre Inicio y el código del encabezado; no es una inspección visual completa de todas las rutas ni de cada ancho.

### Checklist y compilación

En ese corte, el checklist quedó en **56/65 marcadas y 9 pendientes**. Una interacción posterior con la pestaña Brave comprobó el reuso de la conexión existente tanto en compra como en recarga, además del mensaje de wallet incompatible al elegir otra red; el checklist actual queda en **57/65 marcadas y 8 pendientes**. Las casillas incluyen verificaciones estáticas o de flujo demo: no deben leerse como funciones de producción. Siguen pendientes providers reales y sus rechazos, conexión/desconexión de cada wallet, cancelación de MetaMask en teléfono, recibo de transferencia preexistente, validación de direcciones/rutas en Solflare y backend de órdenes/conciliación. La falla de pool y las vistas clave se verificaron con CUA, no con REA.

`npm run build` terminó con código 0: TypeScript y Vite generaron 553 módulos en 15.93 s. Rollup mantiene un aviso no bloqueante por un chunk JavaScript de aproximadamente 696 kB, sobre el umbral recomendado de 500 kB. No ejecuté una transferencia para validar una compilación.

**Límite final:** el flujo demo y la cotización del checkout funcionan en las rutas recorridas; falta validar conexión y retorno móvil con una wallet real y HTTPS estable. La app no tiene verificador on-chain, órdenes pagadas ni activación automática. El botón Pagar puede solicitar a una wallet compatible una transferencia real si se aprueba; no debe usarse para probar con fondos principales.

## Adenda de error de lecturas de pool · 1-nov-2026

Para cerrar el estado de carga/error pendiente, se levantó un Vite desechable en `127.0.0.1:5174` con interceptación temporal de las lecturas `/api/pool/*`: retardo de siete segundos y respuesta HTTP 502. En `/data-centers/pool`, el árbol accesible mostró `Consultando…` mientras el código renderizaba `MetricValueSkeleton`; tras el fallo, mostró `Falló la lectura simulada de pool.` y el botón `Actualizar ingreso` habilitado. En `/data-centers/operations`, se observó `Cargando historial de pagos`; tras el fallo, se mostró el mismo mensaje y el botón `Actualizar` habilitado. El código enlaza dichos botones a la función de refresco. No se modificaron fuentes de la app ni se usó Firebase, una wallet o la API de producción en esta escena. Se cerraron las dos pestañas, se retiró la configuración temporal y se verificó que 5174 quedó cerrado y 5173 siguió activo. Esta es evidencia CUA + revisión de código, no Evidence REA.

## Adenda de escala predeterminada · 1-nov-2026

CUA capturó Inicio, configurador, revisión de compra, modal de recarga, Carteras, Pool y Operaciones en una pestaña integrada aislada. El viewport observado fue 1280 × 720, con `devicePixelRatio=1` y `visualViewport.scale=1`; no se alteró el zoom. El texto y las etiquetas principales fueron legibles en las capturas y no hubo corte horizontal del documento. Los modales del configurador/revisión/recarga desplazaron su contenido verticalmente dentro de su panel. La X, selección de planes y controles esenciales quedaron dentro del área visible o del scroll previsto. Esto cierra la casilla de pantallas clave a escala predeterminada, no una inspección visual de todas las rutas ni de cada viewport. Evidencia CUA, no Evidence REA.

## Actualización REA estática del deeplink móvil MetaMask · 1-nov-2026

REA/Linux completó un análisis estático inerte del directorio actual (`Y:\ChatGPT\go-minning`, SHA-256 `446dd6c996a72b98ca47479185ce135acd973bc2b4f74342652c238eb16f0bfc`). La selección exacta fue `src/walletAppLinks.ts`, `src/WalletPanel.tsx`, `src/WalletPaymentCheckout.tsx` y `src/metamaskConnect.ts`. Evidencia padre: `ev_40653bdf3a012cafdeb36d7991b54041e411dba9af65b185ad684a215bea2cd4`; vista resumen: `ev_2b9ab500ae7e5c7ee022a7c374e97f7bd717f65e4f62e7d03213e29cc198c665`.

Los cuatro archivos seleccionados se parsearon sin errores: 5,364 nodos AST, 37,591 bytes de texto y 84 hallazgos estáticos. La vista examinó sus 9,034 elementos resumidos. REA dejó 19,248 archivos inventariados fuera del análisis fuente; el grafo de aplicación/semántica quedó parcial y las incógnitas semánticas alcanzaron el límite de retención de 100,000. No se ejecutó JavaScript ni el navegador. Esta Evidence documenta estáticamente el enlace y checkout; no confirma apertura de MetaMask en Android/iOS, retorno, cancelación de solicitud real, conexión, firma ni pago.

La primera tentativa coincidió con una edición de fuente y REA la rechazó por inconsistencia de integridad; el resultado anterior no se usó. La evidencia descrita arriba corresponde al reintento con los cuatro archivos estables. No se abrió otra escena interactiva REA; la captura previa del navegador sigue con el antecedente `cleanup_incomplete`.

## Adenda posterior: compra, recarga y wallet incompatible · 1-nov-2026

En el navegador local del usuario se reprodujo el flujo sin aprobar solicitudes de wallet. Crear minero detectó la wallet conectada y la reutilizó al abrir el checkout. Recargar mostró la misma wallet y abrió el mismo checkout. Al cambiar a Solana, el checkout mostró que la wallet conectada era incompatible, indicó Solflare como opción admitida y ofreció “Conectar Solflare”. Cancelar cerró el checkout y devolvió a Inicio. Una cotización expiró y el botón Pagar permaneció deshabilitado.

No se abrió un popup de transacción ni se conectó otra wallet. No se pulsó Pagar, firmó ni transmitió una operación. No se incorporó la dirección pública al informe. Esto prueba visualmente la reutilización de una conexión ya existente y el manejo de la incompatibilidad en el navegador de escritorio; no prueba la conexión/rechazo de otros proveedores ni el flujo móvil. Evidencia de interacción CUA; no es una nueva captura REA.
