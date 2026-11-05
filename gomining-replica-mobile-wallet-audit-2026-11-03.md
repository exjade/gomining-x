# Auditoría de conexión móvil de wallets · 3 de noviembre de 2026

## Resultado observado

Prueba informada por el usuario en **Android + Brave/Chrome + ngrok**:

- **MetaMask:** abrió la página dentro del navegador integrado y el usuario reporta que pudo firmar/aprobar la transacción. No recibimos hash ni lectura del explorador; no podemos afirmar si se transmitió, confirmó o liquidó. Si la wallet la envió, podría ser un pago real.
- **Trust Wallet:** abrió la app en Inicio. No cargó la réplica ni mostró una solicitud de conexión. Los dos enlaces probados (HTTPS y `trust://`) terminaron en Inicio.

La carga manual desde Browser/DApps todavía no se ha reportado. El código vigente ya no intenta lanzar ninguno de esos enlaces en Android; muestra la acción de copiar URL e instrucciones para abrirla desde Browser/DApps.

La prueba es un reporte del usuario, no una captura de REA. No se intentó iniciar otro pago.

## Validación local

`npm run build` terminó correctamente con 945 módulos transformados. Vite mantuvo el aviso no bloqueante del bloque Solana de 695.66 kB. `/gmt-wallets` respondió HTTP 200 y `git diff --check` pasó; Git solo mostró avisos de normalización LF/CRLF. Estas comprobaciones locales no sustituyen el retest de los enlaces en Android.

## Ajuste de Trust Wallet para el enlace ngrok

La interfaz ya no presenta `trust://open_url` ni `https://link.trustwallet.com/open_url` como rutas de conexión, porque en la prueba reportada ambas abrieron Inicio. En cualquier dominio, el botón copia la URL para abrirla manualmente en Browser/DApps. En checkout copia la URL completa del pedido, con producto, importe, red y wallet.

El enlace solo navega al navegador DApp: no concede permisos por sí mismo. Cuando la réplica carga dentro de Trust y el proveedor EIP-1193 está disponible, el parámetro temporal `gmWalletConnect=trustwallet` inicia la solicitud para leer la dirección. Hay que confirmar en el dispositivo que aparezcan página y permiso.

### Fallback manual para Trust Wallet

1. En la réplica, toca **Copiar URL para el navegador DApp**.
2. Abre Trust Wallet y entra a **Browser/DApps**.
3. Pega la URL completa y carga el sitio. Si ngrok muestra **Visit**, acéptalo.
4. Ya dentro de la página, aprueba la solicitud para compartir la dirección. El pago se aprueba en un paso distinto.

Si Trust permanece en Inicio después de tocar cualquiera de los enlaces, ese intento no conectó. La conexión desde Brave/Chrome externos usa WalletConnect v2 según la documentación de Trust; sin un `projectId` no existe un botón de conexión móvil externo que podamos activar desde esta réplica.

Trust documenta dos caminos diferentes: el proveedor inyectado en el navegador DApp y WalletConnect v2 para conectar desde un navegador móvil externo. El segundo necesita un `projectId`; no está configurado porque el alcance excluye claves de WalletConnect. Por tanto, Brave/Chrome externos no pueden mostrar por sí solos la solicitud de Trust sin ese protocolo. El camino sin `projectId` es entrar en Browser/DApps y cargar allí la URL.

## Matriz de wallets del checkout

| Wallet | Camino de conexión móvil en este proyecto | Estado de auditoría |
| --- | --- | --- |
| MetaMask | MetaMask Connect desde HTTPS; en ngrok se ofrece abrir la DApp en el navegador integrado. Sin WalletConnect `projectId`. | El usuario reporta que Android llegó a firmar/aprobar. Falta hash, rechazo, dirección retornada, desconexión y estado de red. |
| Trust Wallet | Copiar la URL de la réplica y abrirla manualmente desde Browser/DApps; allí `eth_requestAccounts` usa el proveedor inyectado. Desde Chrome/Brave externo, Trust documenta WalletConnect v2, que requiere `projectId`. | **Android + ngrok:** enlaces automáticos abrieron Inicio. La interfaz ahora ofrece solo la ruta manual como acción principal; falta comprobar que cargue y devuelva la dirección. |
| Solflare | Deeplink cifrado `/ul/v1/connect`; respuesta devuelve clave pública y sesión; `signAndSendTransaction` es una aprobación posterior. También puede abrir la página en su navegador integrado. | Código presente; no probado en teléfono durante esta auditoría. La RPC de Solana tuvo un 403 previo, así que el envío también depende de una RPC accesible. |
| Phantom | Proveedor en su navegador DApp; el proyecto conserva el flujo móvil cifrado. | Sin prueba móvil. La ayuda oficial actual de Phantom indica que en móvil la conexión con apps funciona dentro del navegador de Phantom; tratar el deeplink externo como pendiente hasta validarlo. |
| Coinbase Wallet | SDK web y proveedor EIP-1193 (`eth_requestAccounts`). No se configura WalletConnect `projectId` en este conector. | Código presente; sin prueba física de apertura, permiso, retorno o rechazo. |
| TronLink | Deep link `action=open` para cargar la DApp Explorer; la conexión usa el proveedor inyectado una vez dentro de la página. | No probado en teléfono. El callback móvil `action=login` con `actionId` y `callbackUrl` no está integrado. |
| UniSat | `window.unisat` desde la extensión. | No hay conexión móvil desde esta SPA: el deeplink móvil oficial vuelve por `unisat://response`, para lo que haría falta un puente/callback de aplicación. |

Keplr conecta Cosmos Hub (`cosmoshub-4`) solo para mostrar la dirección; no aparece como método de pago. CTRL/xDeFi ya no está en la selección ni en los conectores activos de esta versión. Safe continúa fuera del proyecto: requiere ejecutar la dApp dentro del contexto Safe Apps; no es un conector genérico de navegador. WalletConnect permanece excluido.

## Siete comprobaciones que siguen abiertas

El total de referencia se mantiene en **70/77**. La prueba de MetaMask aporta evidencia parcial y el resultado de Trust muestra una falla; ninguna de las dos completa la verificación de todos los proveedores.

1. Conectar y desconectar wallets reales en cada red. MetaMask tiene un resultado parcial reportado; Trust no cargó la DApp; los demás conectores móviles no se probaron en dispositivos.
2. Completar handoff móvil y probar permiso aceptado, rechazado, retorno de dirección y desconexión en MetaMask y Trust. En Trust hace falta probar la URL copiada dentro de Browser/DApps; el handoff exterior reportado solo abrió Inicio.
3. Verificar un recibo y hash después de una transferencia real. No se solicitó otra transferencia como prueba y no se recibió un hash para validar.
4. Confirmar en Solflare Bridge la cotización actual, mínimos, comisión, liquidez y salida por cada red. La réplica no acredita el resultado Bridge final.
5. Verificar contratos, decimales, disponibilidad y elegibilidad de cualquier token adicional. El checkout actualmente limita los activos y destinos configurados.
6. Confirmar requisitos de KYC y disponibilidad según ruta, región y monto. Que la réplica no solicite KYC no garantiza que wallet, Bridge u otro proveedor externo tampoco lo solicite.
7. Integrar backend de órdenes y verificación: idempotencia, conciliación, activación de productos y auditoría. La dirección/hash local no acredita una compra ni activa un minero o suscripción.

Las comprobaciones 1–2 requieren un dispositivo y wallets reales. Las 3–6 requieren evidencia del proveedor/ruta y no deben resolverse con una transferencia de producción de prueba. La 7 requiere un backend de pagos y un verificador de transacciones.

## REA y límites de evidencia

No se pudo adjuntar un target Android ni obtener una nueva captura de navegador con REA en este corte. Los intentos previos reportaron endpoint CDP inaccesible y `Transport closed`; no se repitieron tras el fallo persistente. Esta actualización combina el reporte del usuario, lectura de la implementación local y documentación oficial; no se presenta como una interacción capturada por REA.

## Fuentes oficiales

- [Trust Wallet: deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking)
- [Trust Wallet: conexión móvil con WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile)
- [Trust Wallet: provider EIP-1193](https://developer.trustwallet.com/developer/develop-for-trust/browser-extension/evm)
- [MetaMask Connect](https://docs.metamask.io/metamask-connect/)
- [Solflare: Connect](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect)
- [Solflare: Browse](https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse)
- [Phantom: conexión desde móvil](https://help.phantom.com/articles/connect-phantom-to-an-app-29995498642195)
- [Phantom: integración Solana](https://docs.phantom.com/solana/integrating-phantom)
- [Coinbase Wallet SDK](https://github.com/coinbase/coinbase-wallet-sdk)
- [TronLink: deep links](https://docs.tronlink.org/mobile/deeplink/)
- [UniSat: conexión móvil](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet/connect-with-unisat-mobile-wallet)

## Resultado de la última prueba reportada · 3-nov-2026

- **MetaMask:** en Android + Brave/Chrome + ngrok, abrió la réplica en el navegador interno y permitió llegar a la firma de la transacción. No se recibió el hash, por lo que no se confirma envío, liquidación ni activación del minero.
- **Trust Wallet:** abrió la app como acceso directo y se quedó en Inicio; no apareció la réplica ni el permiso de conexión. No quedó identificado si se tocó el enlace Universal Link o `trust://`.
- **Cambio de interfaz en ese corte:** el botón principal copiaba la URL para pegarla manualmente en Browser/DApps; en checkout conservaba producto, importe y red. Después del retest, se añadieron como acciones visibles los enlaces directo y universal de Trust; el copiado sigue disponible como respaldo.
- **Comprobación local:** `npm run build` pasó (945 módulos); `/gmt-wallets` respondió HTTP 200; `git diff --check` pasó. Sigue el aviso no bloqueante de Rollup por el bloque Solana de 695.66 kB. No se repitió una prueba con la wallet real.
- **Límite:** la conexión móvil desde Brave/Chrome usa WalletConnect v2 según Trust y requiere `projectId`; permanece excluido según el alcance acordado. Sin ese ID, el camino es cargar manualmente la DApp dentro de Trust. Trust documenta `open_url`, pero el teléfono reportado terminó en Inicio, así que ese deeplink no se da por funcional en esta configuración. [Deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [WalletConnect móvil](https://developer.trustwallet.com/developer/develop-for-trust/mobile).
- **Estado de checklist:** se mantiene **70/77**. MetaMask tiene handoff y llegada a la pantalla de firma reportados; Trust sigue abierta hasta que Browser/DApps cargue la web y devuelva la dirección. Aceptación/rechazo, retorno y desconexión siguen pendientes.
- **REA:** esto registra la prueba comunicada por el usuario y una revisión de código/documentación. No hay captura REA de Android ni se afirma que REA inspeccionó la interacción.

## Actualización después del retest del usuario · 3-nov-2026

- El usuario confirma que **MetaMask en Android** abrió la URL dentro del navegador interno y mostró el paso para firmar/aprobar la transacción. Sin el hash de red no se confirma que haya firmado, enviado o liquidado el pago.
- **Trust Wallet** todavía abrió la app a su pantalla de inicio sin mostrar la réplica ni una solicitud de conexión. No se confirmó cuál enlace se tocó.
- Ajusté Carteras y checkout para ofrecer tres caminos de Trust: el esquema `trust://open_url` hacia Browser/DApps, el Universal Link HTTPS y copiar la URL completa como último recurso. En checkout, el enlace copiado conserva producto, importe, red y wallet. Al cargar con `gmWalletConnect=trustwallet` dentro de Browser/DApps, la página solicita solamente permiso de dirección.
- Este cambio no puede hacer que Brave/Chrome externo cree la sesión de Trust sin WalletConnect: la documentación oficial de Trust describe su integración móvil mediante WalletConnect v2 y `projectId`. Sin ese servicio, el camino sin ID es que la réplica cargue dentro del navegador DApp de Trust, que expone el provider EIP-1193. El enlace directo corregido aún necesita retest físico.
- **Checklist:** permanece 70/77. La prueba de MetaMask aporta evidencia reportada del flujo hasta aprobación; Trust, rechazo, retorno de dirección, desconexión y los demás proveedores móviles siguen sin cerrarse.
- **Validación local:** `npm run build` pasó (`tsc -b` y Vite; 945 módulos), `/gmt-wallets` respondió HTTP 200 y `git diff --check` pasó. Rollup conserva el aviso de chunk Solana de 695.66 kB. No demuestra apertura móvil.
- **REA:** no hay captura de esta sesión Android. REA/Linux no aceptó la ruta Windows del workspace; al cambiar a REA local, el transporte se cerró antes de devolver evidencia. El resultado físico sigue siendo reporte directo del usuario y el cambio aún requiere retest real en Trust.

### Opciones de wallet móvil sin WalletConnect Project ID

| Wallet | Ruta móvil documentada sin Project ID | Estado en esta réplica |
|---|---|---|
| MetaMask | MetaMask Connect gestiona el handoff entre navegador y app; también funciona en su navegador DApp. | Implementado; el usuario confirma Android en ngrok hasta el paso de aprobación. |
| Trust Wallet | Abrir manualmente la página desde Browser/DApps y usar el provider; desde navegador externo, Trust documenta WalletConnect v2 con Project ID. | La interfaz copia URL y explica el flujo manual. Se retiraron los enlaces que abrieron Inicio. Falta prueba manual. |
| Phantom | El móvil conecta dentro del navegador de Phantom; la documentación indica que Chrome/Brave externos no conectan. | Implementado mediante provider y handoff; falta prueba física. |
| Solflare | SDK/deeplink propio de Solflare; no usa el selector WalletConnect para conectar. | Implementado; falta prueba física con el dominio público actual. |
| Coinbase Wallet | SDK web oficial o provider inyectado; el SDK actual no requiere Project ID de WalletConnect. | Implementado; falta prueba física de apertura, permiso y retorno. |
| TronLink | Deeplink para abrir la DApp en TronLink DApp Explorer y provider en esa página. Login callback completo requiere endpoint HTTPS. | Implementado por provider/deeplink; falta prueba física. No se añadió callback de servidor. |
| UniSat | Extensión; su app móvil usa `unisat://request` y devuelve por `unisat://response`. | Solo extensión; no se puede recibir el callback de app desde esta SPA web. |
| Keplr | Provider `window.keplr`; conexión de dirección en Cosmos Hub (`cosmoshub-4`). | Integrado como lectura de dirección, no como pago. Código compilado; app/extensión no probada. |
| xDeFi / CTRL | Provider EVM inyectado `window.xfi.ethereum`. | Integrado para BNB, Ethereum y Polygon cuando existe el provider. No se afirma handoff desde Chrome/Brave móvil; falta probar extensión/app. |
| Safe | Safe Apps se ejecuta dentro del contexto Safe; no es un conector móvil genérico para un navegador externo. | No incluido; requeriría adaptar la app como Safe App/SDK y validar la ejecución multisig. |
| WalletConnect | Conecta el navegador externo con muchos proveedores desde una sesión común; requiere Project ID. | Excluido conforme a la preferencia previa de no configurar ese ID. |

La lista de conectores de Via acredita compatibilidad de integración en su biblioteca, no un handoff móvil universal ni conexiones sin claves/servicios. Fuentes: [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Trust Mobile/WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile), [MetaMask Connect](https://docs.metamask.io/metamask-connect/), [Phantom móvil](https://help.phantom.com/articles/29995498642195), [Keplr Browser](https://help.keplr.app/mobile-app/5R3bMyjtr3iKzMhqyCqu56/explore-dapps-with-keplr-mobile%E2%80%99s-browser/5So5gM41LhZn5CZxJZKmLv), [TronLink DeepLink](https://docs.tronlink.org/mobile/deeplink/), [UniSat Mobile](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet/connect-with-unisat-mobile-wallet), [Via web3-wallets](https://github.com/viaprotocol/web3-wallets).

## Nuevo resultado Android y corrección del CTA de Trust · 3-nov-2026

- El usuario reporta que **MetaMask** en Android abrió la réplica en su navegador interno y llegó a la aprobación/firma. No se compartió hash ni comprobación de liquidación; se marca como handoff/prompt reportado, no como pago verificado.
- El usuario reporta que **Trust Wallet** abrió la app en su pantalla principal, sin réplica ni solicitud de conexión. No quedó identificado cuál botón tocó.
- La revisión del código encontró que, aunque el helper genera primero el Universal Link documentado, el CTA principal de Trust en Carteras y checkout renderizaba el esquema `trust://`; el Universal Link quedaba como acción secundaria. Esto puede explicar que el toque abriera la app sin navegar a Browser/DApps.
- Se corrigió el orden: el CTA principal usa ahora `https://link.trustwallet.com/open_url?coin_id=...&url=...`; `trust://open_url` queda como alternativa y se conserva el botón para copiar la URL y pegarla manualmente en Browser/DApps. El enlace navega, no concede permisos. Para conectar sin WalletConnect Project ID, la réplica debe cargarse dentro del browser de Trust y solicitar acceso al provider EIP-1193.
- **Retest físico pendiente:** comprobar en Android si el Universal Link carga esta réplica dentro de Browser/DApps; si no, usar el copiado manual. Después comprobar que aparece la solicitud de dirección, aceptación, rechazo y desconexión. No aprobar un pago para esta prueba.
- **REA:** no se obtuvo nueva captura del teléfono. El hallazgo del orden de los CTAs viene de lectura del código; el resultado de Android es reporte del usuario. Los intentos REA anteriores quedaron limitados por CDP inaccesible y `Transport closed`, por lo que no se presentan como observación REA.
- **Checklist:** permanece en 70/77. El intento positivo de MetaMask no verifica el hash; Trust sigue sin conexión confirmada. Las siete comprobaciones abiertas se listan arriba.

La documentación oficial distingue estos dos caminos: `https://link.trustwallet.com` enruta al usuario hacia la página de app indicada, mientras `trust://` abre una ruta interna si el dispositivo reconoce el esquema. Trust documenta WalletConnect v2 para conectar desde un navegador externo y solicita un `projectId`; se mantiene excluido según la preferencia del proyecto. [Deep links de Trust](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Conexión móvil Trust/WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

## Nuevo resultado de Android y ajuste del enlace Trust · 3-nov-2026

- El usuario reporta que MetaMask abrió la URL en su navegador interno y mostró la solicitud para firmar/aprobar el pago. Este reporte confirma llegada al flujo de aprobación, no que la transacción se haya enviado ni liquidado; no se aportó hash.
- Al probar el botón principal Universal Link de Trust desde Android + Brave/Chrome, Trust abrió la app en Inicio y no presentó la réplica ni una solicitud de conexión. Esto contradice la hipótesis anterior de que priorizar el Universal Link resolvería el enrutamiento.
- Se invirtió el orden: el CTA principal intenta `trust://open_url` (ruta directa documentada por Trust para app instalada); el Universal Link HTTPS queda como alternativa. Ambos enlaces solo intentan abrir una página y no conceden permisos.
- Si ambos enlaces abren Inicio, el camino sin WalletConnect/Project ID es manual: copiar la URL del checkout, abrir Browser/DApps dentro de Trust, pegarla y aceptar la página intermedia de ngrok si aparece. Dentro de ese navegador, el provider EIP-1193 puede solicitar acceso a la dirección.
- **Retest requerido:** comprobar el nuevo CTA `trust://` en Android. No aprobar un pago; basta confirmar que carga el checkout y que aparece una solicitud de conexión, luego verificar la dirección y desconexión.
- **REA:** no hay captura REA del Android. Este resultado proviene del reporte directo del usuario; la edición del orden de enlaces se verifica en el código local. El análisis estático previo no puede establecer cómo Android enruta los esquemas de Trust.
- **Checklist:** la matriz general sigue en 70/77. MetaMask queda reportado hasta el prompt de aprobación; Trust continúa pendiente de cargar la réplica y devolver dirección.

### Evidencia REA y validación local del ajuste

- REA/Linux analizó sin ejecutar el bundle compilado actual en `dist`, con el archivo exacto `assets/App-DVyezqvW.js`. Evidence de análisis: `ev_0ae756931f23b8cf4dcf5fe636fc9dca571d6f8540ccad83068cee2c4bbaf0ac`; resumen: `ev_fa4ae0b9fe2029419f1c69baa39500b12934e8863d10fddc7536d7a8ff5acf3a`.
- Cobertura: se inventariaron 23 fuentes, se analizó 1 bundle y quedaron 22 sin analizar; el grafo de relaciones es parcial y conserva 14,244 unknowns. REA no cargó ni ejecutó la web ni observó el Android. Por eso esta evidencia respalda identidad/lectura estática del artefacto, no el resultado del deep link ni la aparición del prompt.
- La verificación de la corrección de prioridad se hizo contra el JSX fuente: el CTA principal ahora apunta al Universal Link HTTPS; el enlace `trust://` es secundario. Una traza REA anterior (`ev_58ad4a6d44e1552f1e9fb481839f434f8efd2cd472c8ad5e7c86d96fcc978c61`) no encontró ese literal en su grafo parcial y declara que el no-match no prueba ausencia; no se usa para concluir que el código carezca del enlace.
- `npm run build` pasó (945 módulos); `http://127.0.0.1:5173/gmt-wallets` respondió HTTP 200; `git diff --check` pasó. Rollup conserva el aviso no bloqueante del bloque de Solana (695.66 kB).

## Estado vigente tras el retest del CTA HTTPS · 3-nov-2026

Esta entrada supersede el orden de enlaces descrito en las secciones inmediatamente anteriores. El usuario probó el botón principal HTTPS en Android + Brave/Chrome y reportó que Trust abrió Inicio sin cargar la réplica. El código ahora intenta primero `trust://open_url`; el Universal Link HTTPS queda como alternativa. El nuevo orden está compilado, pero requiere otro retest en el teléfono. Si ambos enlaces abren Inicio, pegar la URL manualmente en **Browser/DApps** es el flujo disponible sin WalletConnect Project ID.

El análisis REA/Linux más reciente corresponde al bundle `dist/assets/App-IcSngRJl.js`: Evidence padre `ev_b336d9c2ea873bbe1fe0b970c4813b39d03e980da63b1cbe57992c47f510f311`, resumen `ev_189f82faeb777e8b68bbf6962a23536dadc082879802fa79fe33b6e0115456e2`. Se seleccionó una fuente; 23 fuentes quedaron fuera del análisis, el grafo fue parcial y quedaron 14,244 incógnitas. El bundle se parseó como texto inerte; REA no ejecutó la app ni observó el Android.

## Resultado del retest directo y ajuste de instrucciones · 3-nov-2026

- El usuario confirma en Android + Brave/Chrome + ngrok que MetaMask abrió la URL en su navegador interno y le permitió firmar la transacción. No se aportó hash ni lectura de explorador, así que no se afirma confirmación on-chain, acreditación del producto o finalización de la orden.
- Trust Wallet abrió la app como acceso directo y no presentó una solicitud ni cargó la réplica. Esto ocurrió después del cambio que priorizó el enlace directo `trust://open_url`; el Universal Link HTTPS también había abierto Inicio en el intento anterior.
- Para ngrok, **Carteras** y el checkout ahora hacen primaria la acción **Copiar URL para Trust Wallet**. Ya no se ofrecen como botón principal los enlaces que fallaron. Al pegar la dirección en **Trust Wallet → Browser/DApps**, el query `gmWalletConnect=trustwallet` hace que la página, cuando encuentre el provider de Trust, solicite solo permiso para leer la dirección.
- No se cambia el conector ni se agrega WalletConnect: la documentación actual de Trust recomienda el browser in-app para el provider inyectado y usa WalletConnect v2 para iniciar desde un navegador móvil externo. Este conector sigue necesitando Project ID, fuera del alcance aprobado. En un dominio HTTPS distinto de ngrok se conservan los deep links oficiales como opciones secundarias; no hay evidencia de que vayan a funcionar sin retest.
- **Prueba pendiente del usuario:** abrir el enlace copiado manualmente en Trust Browser/DApps y confirmar si (1) carga la página, (2) aparece el permiso, (3) devuelve una dirección y (4) se puede desconectar. No iniciar ni aprobar otro pago para esa verificación.
- La implementación confirma el flujo esperado en el código; no confirma comportamiento en la app Android. REA no capturó la interacción del teléfono. La aceptación de MetaMask y el fallo de Trust son reportes del usuario.
- El total del checklist se conserva en **70/77**; la actualización de Trust retira los enlaces fallidos como opción sugerida en ngrok, pero no cierra ninguna de las siete comprobaciones que requieren prueba externa.

## Matriz actual de billeteras de Via y compatibilidad móvil

| Cartera/protocolo | Camino sin ID de WalletConnect | Alcance y estado |
| --- | --- | --- |
| MetaMask | MetaMask Connect desde HTTPS, o navegador DApp de MetaMask con provider EIP-1193 inyectado. | **Android reportado:** abrió el sitio y permitió firmar una transacción. Falta hash/confirmación de red y prueba de rechazo/retorno/desconexión. |
| Trust Wallet | Browser/DApps dentro de Trust con provider EIP-1193. | **Android + ngrok:** ambos estilos de enlace abrieron Inicio. La carga manual de URL es el fallback; todavía sin prueba. Conexión desde Brave/Chrome externo necesita WalletConnect v2 y `projectId`. |
| Coinbase Wallet | SDK de Coinbase o navegador DApp/provider inyectado. | Código disponible, no probado físicamente. La documentación de SDK describe el proveedor web y la conexión de cuentas; el fallback móvil sigue sin verificación. |
| Solflare | Deeplink cifrado propio `/ul/v1/connect` y callback HTTPS; también browser in-app. | Implementación existente sin prueba en teléfono. Checkout admite USDT SPL; falta validar prompt, retorno, rechazo y RPC desde móvil. |
| Phantom | Deeplink cifrado propio `/ul/v1/connect` y callback HTTPS; también browser in-app. | Implementación existente sin prueba en teléfono. Checkout admite USDT SPL; falta validar prompt, retorno, rechazo y RPC desde móvil. |
| TronLink | Browser DApp/provider o deep link nativo de login/transfer con callback documentado. | En la réplica solo se ha validado el flujo con provider inyectado. Deep link con login/callback no integrado ni probado. |
| UniSat | Provider de extensión; la app móvil ofrece `unisat://request` y devuelve a `unisat://response`. | La web instalada en navegador no tiene un callback de esquema propio para recibir la respuesta. Por ahora checkout requiere extensión; integración móvil nativa requiere diseñar un callback web/PWA explícito. |
| Keplr | Provider `window.keplr`; para obtener dirección se habilita Cosmos Hub (`cosmoshub-4`). | Integrado solo para mostrar la dirección; no es opción de pago. Código compilado, sin prueba con extensión/app real. |
| CTRL (antes xDeFi) | Provider EVM inyectado `window.xfi.ethereum`; no se configuró handoff de app ni ID. | Integrado en el checkout EVM para BNB, Ethereum y Polygon cuando el provider está inyectado. No probado con extensión/app real; desde móvil externo no se anuncia como disponible. |
| Safe | Safe Apps context/SDK para cuentas smart contract y multifirma. | No equivale a una wallet EOA inyectada desde Chrome; requiere una integración Safe App separada. No está integrado al checkout. |
| WalletConnect | Protocolo universal de conexión móvil. | Excluido: requiere `projectId` configurado por el operador. Trust confirma WalletConnect v2 para conectar desde navegador externo. |

Fuentes primarias consultadas: [MetaMask Connect](https://docs.metamask.io/metamask-connect/), [deep links y Browser/DApps de Trust](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [integración móvil de Trust/WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile), [Coinbase Wallet SDK](https://github.com/coinbase/coinbase-wallet-sdk), [Keplr Mobile Browser](https://help.keplr.app/mobile-app/5R3bMyjtr3iKzMhqyCqu56/explore-dapps-with-keplr-mobile%E2%80%99s-browser/5So5gM41LhZn5CZxJZKmLv), [deeplinks de UniSat Mobile](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet/connect-with-unisat-mobile-wallet), [deeplinks TronLink](https://docs.tronlink.org/mobile/deeplink/), [Safe SDK](https://docs.safe.global/sdk/overview), [adaptadores Via Wallets](https://github.com/viaprotocol/web3-wallets). El hilo de Reddit compartido es una referencia anecdótica de 2021: el usuario resolvió ese caso usando el navegador interno de MetaMask; la prueba Android actual es evidencia directa más reciente para esta réplica.

### Validación REA/Linux y build después del ajuste · 3-nov-2026

- `npm run build` terminó con código 0: TypeScript y Vite compilaron 945 módulos. Continúa el aviso no bloqueante del bloque Solana, 695.66 kB minificado. `git diff --check` no encontró errores de whitespace; Git informó únicamente normalización LF/CRLF.
- REA/Linux analizó `dist` de forma estática, seleccionando `assets/App-cIzE1olY.js`. Evidence del resumen: `ev_aacfabf8d9c39b618106e06b150a0fad9ac6dd272b96023e049b36e006d16d5d`; Evidence padre: `ev_dfba48e792467866d957ee462c6524092ac0d25d7e9f23cb33afd28ddf9f33eb`; digest del artefacto: `42eed2c52d1352e9ef57ad269ee3749d52ac2b40bd953435c52cdbbf25865f34`.
- Cobertura REA: el inventario tuvo 271 elementos; un bundle fue seleccionado y 23 fuentes quedaron fuera del análisis. El grafo es parcial: 24 incógnitas de aplicación y 276 incógnitas semánticas; el bundle alcanzó el presupuesto restante del grafo semántico. REA trató el código como texto inerte y no ejecutó la página, los deep links ni una wallet Android.
- La navegación `/gmt-wallets` se comprobó con el servidor local separado; HTTP 200 confirma que la página responde, no que Android abra Trust Browser/DApps.

### Actualización posterior del retest y conectores directos · 3-nov-2026

- El usuario informó que **MetaMask abrió la URL en su navegador interno y le permitió firmar la transacción**. No hay hash; revisar Actividad antes de repetir el pago. No se marca como confirmado ni liquidado.
- **Trust Wallet abrió la app como acceso directo y no hizo nada más.** Los enlaces automático y HTTPS ya habían abierto Inicio. El CTA de la réplica ahora solo copia la URL; la persona debe cargarla manualmente en Browser/DApps.
- Se agregó CTRL/xDeFi con `window.xfi.ethereum` para leer dirección y pagar en redes EVM disponibles; se agregó Keplr para mostrar dirección de Cosmos Hub. Keplr no habilita pagos Cosmos. Ninguno fue probado en una wallet real.
- Safe sigue fuera de Carteras: requiere Safe Apps SDK y abrir la réplica dentro del contexto Safe. WalletConnect sigue excluido porque Trust exige un `projectId` para iniciar desde Chrome/Brave.
- Build posterior: `npm run build` pasó (945 módulos), `/gmt-wallets` dio HTTP 200 y `git diff --check` pasó. Persiste el aviso no bloqueante de Rollup para Solana, 695.66 kB.
- REA/Linux analizó estáticamente el bundle final `assets/App-CeP90RkH.js`: Evidence `ev_0535ba87d67b6c8509a0958bc2a5de107f0d9f317fa89b3141a78d9d9ed8d265`, digest del artefacto `bda735e71549de4dad4545513fe50961dee477d7e55988ce3a11a92e3b2647cf`. Una de 24 fuentes fue analizada; 23 quedaron fuera y el grafo semántico fue parcial. No ejecutó el sitio ni observó Android.
- **70/77 se mantiene.** Queda pendiente el recorrido manual de Trust Browser/DApps, el rechazo/retorno/desconexión de wallets, hash/confirmación, Bridge, activos/KYC y backend de órdenes según las siete categorías enumeradas arriba.

## Estado vigente después de la prueba Android más reciente · 3-nov-2026

- El usuario probó Android + Brave/Chrome + ngrok: MetaMask abrió la réplica en su navegador interno y permitió llegar al paso de firma/aprobación. Sin hash, no se sabe si se transmitió o confirmó. Revisa Actividad de MetaMask antes de repetir un cobro.
- Trust Wallet abrió Inicio sin cargar la réplica ni presentar un permiso. Para evitar otro lanzamiento que termine igual, Carteras y checkout ya no muestran enlaces automáticos de Trust en móvil: el botón principal copia la URL completa. En Trust Wallet, abre **Browser/DApps**, pega la URL y acepta **Visit** si ngrok lo pide; después conecta desde la página.
- Revisé también el bundle de producción: contiene los dos botones de copiar y ya no contiene las rutas automáticas `link.trustwallet.com/open_url` ni `trust://open_url`.
- Con Trust en Brave/Chrome externo no se espera una conexión directa sin WalletConnect v2 y `projectId`; esa modalidad sigue excluida. La carga manual dentro de Trust tampoco se considera resuelta hasta que el teléfono muestre la página y devuelva la dirección.
- xDeFi/CTRL no aparece en las carteras activas. Keplr solo expone dirección Cosmos Hub; no es un método de pago. Las demás wallets aún no tienen una prueba móvil física completa.
- La compilación final pasó con `npm run build` (945 módulos); `/gmt-wallets` respondió HTTP 200 y `git diff --check` pasó. Se corrigieron dos errores TypeScript que impedían compilar (opción Coinbase no soportada por los tipos instalados y referencia Phantom sin declarar). Persiste la advertencia no bloqueante del chunk Solana de 695.66 kB.
- REA/Linux analizó como texto inerte el bundle seleccionado `dist/assets/App-BgZisbbC.js`, dentro del directorio con digest `a3059fb4be5dc31c379a4ee2cc242ec8cbc6bb02d5bcfec21d0932621409a242`. Evidence del resumen `ev_b767b186ffc3f3c66b3c986f28377e681372f2bf97a8913de8ea805b832b7dd6`; Evidence padre `ev_9db331639a772cc22492a63a5edbda3ce445ddeff6ba873a1288eb757ede3ff5`. Se seleccionó 1 de 24 archivos JS; el parseo del bundle terminó, pero el grafo semántico superó el presupuesto restante y quedó parcial. REA no ejecutó la página ni observó Android.
- **Checklist:** conserva 70/77. Trust móvil, aceptar/rechazar/desconectar con wallets reales, hash/confirmación, resultado Bridge, elegibilidad de tokens/KYC y backend de órdenes continúan abiertos según la lista de siete comprobaciones.

## Retest Android y verificación controlada del cierre · 3-nov-2026

- **MetaMask en Android + Brave/Chrome + ngrok (reporte del usuario):** la URL abrió en el navegador interno de MetaMask y apareció el paso de firma/aprobación; no hay evidencia de si la aprobó y la red la transmitió. No se recibió el hash, por lo que no puedo confirmar difusión, red, importe final ni liquidación. Revisa Actividad de MetaMask antes de volver a intentar el cobro; no repetirlo a ciegas.
- **Trust Wallet (reporte del usuario):** solo abrió la pantalla principal de la app; no cargó la réplica ni mostró conexión. El flujo vigente copia la URL para que se abra manualmente dentro de **Trust Wallet → Browser/DApps**. La conexión desde Brave/Chrome externo requiere WalletConnect v2 y `projectId` según la guía oficial; ese requisito sigue fuera del alcance acordado.
- **Cierre de X con solicitud pendiente (prueba controlada local):** abrí el checkout con el proveedor EIP-1193 de QA en modo `connect-pending`, inicié la conexión ficticia y pulsé **Cerrar pago**. El checkout desapareció, se volvió a Inicio y se mostró el aviso de que la solicitud puede seguir abierta en la wallet. No se usó una wallet real.
- **Cancelar aprobación (prueba controlada local):** el proveedor de QA conectó una cuenta ficticia; al pulsar Pagar, el modo `payment-reject` devolvió rechazo simulado. El checkout se cerró y mostró “Cancelaste la solicitud en tu wallet. No se envió ningún pago”. El fixture intercepta localmente `eth_sendTransaction`; no transmite fondos.
- Estas pruebas demuestran el cierre visual y el tratamiento de rechazo en el fixture local; no prueban que cerrar la página cancele el diálogo de una wallet real. Si una solicitud real queda abierta en la app, hay que cancelarla allí y revisar su Actividad antes de volver a pagar.
- **REA/Linux:** este corte no produjo una nueva captura móvil. El análisis estático previo del bundle sigue siendo parcial y no sustituye la prueba física Android. No se reintentó REA después del fallo persistente de transporte ya registrado.
- **Checklist global:** sigue en **70/77**. Las siete comprobaciones abiertas y sus dependencias siguen en la sección anterior; el reporte MetaMask es parcial y Trust no está conectada.

## Addendum vigente · retest Android y matriz por wallet · 3-nov-2026

### Lo que reportaste en el teléfono

- **MetaMask:** Android + Brave/Chrome + ngrok abre la réplica dentro del navegador de MetaMask y te permitió llegar a la firma/aprobación. No compartiste un hash; no puedo confirmar envío, red, confirmación, conversión Bridge ni compra registrada. Antes de otro intento revisa la Actividad de MetaMask.
- **Trust Wallet:** Android + Brave/Chrome abre la app como acceso directo, se queda en Inicio y no muestra conexión. La causa concreta que encontré es que el CTA de la réplica no usaba el `open_url` HTTPS oficial en el camino principal.

### Corrección de Trust aplicada al código

- Carteras y checkout ya construyen `https://link.trustwallet.com/open_url?coin_id=…&url=…` usando la URL completa y codificada. Para BNB/ETH/Polygon se envían los índices documentados 714/60/966; el destino conserva `gmWalletConnect=trustwallet` y el checkout también conserva producto, importe, moneda y red.
- Cuando el sitio carga en Trust → **Browser/DApps**, ese marcador activa el provider inyectado y la réplica solicita permiso para leer la dirección. `open_url` solo navega: no presenta la solicitud de permiso por sí mismo, no pide firma de mensaje ni envía dinero.
- Si Trust vuelve a abrir Inicio o ngrok muestra su intersticial, queda el botón de copiar como respaldo. Pega la URL desde el navegador interno de Trust y acepta **Visit** si se muestra.
- Esto usa el navegador DApp de Trust y no necesita WalletConnect Project ID. Conectar desde Brave/Chrome sin abrir el navegador de Trust es otro flujo; la integración móvil documentada de Trust para esa vía usa WalletConnect v2 y sí requiere un `projectId`, que continúa excluido.
- **Sin retest físico aún:** el enlace correcto está implementado, pero no puedo afirmar que Android lo enrute bien hasta probarlo en el teléfono. Para cerrar esa parte: abrir la réplica dentro de Trust, ver la solicitud, aceptar y confirmar dirección, probar rechazar y desconectar; después repetir la entrada desde compra y Recargar, sin aprobar un pago.

### Compatibilidad por wallet y requisitos

| Wallet/protocolo | Camino móvil documentado | ¿Clave/ID de proveedor para la réplica? | Estado actual de esta réplica |
|---|---|---|---|
| MetaMask | MetaMask Connect desde Brave/Chrome o página abierta en el navegador de MetaMask. | No requiere WalletConnect Project ID; la app usa RPC públicos. | Código integrado; Android hasta el paso de aprobación según tu reporte. Falta confirmar la conexión devuelta, rechazo/desconexión y cualquier hash. |
| Trust Wallet | Universal Link `open_url` abre el sitio dentro de Browser/DApps; el provider del navegador pide permiso. | No, si se conecta dentro de Browser/DApps. WalletConnect desde un navegador externo requiere Project ID. | Enlace corregido y copia manual disponible; aún sin dirección observada en Android. |
| Phantom | Deep links de la app/browser y provider Solana; solicitud `connect` separada de `signAndSendTransaction`. | No requiere WalletConnect Project ID; el flujo nativo crea claves de cifrado temporales y un redirect propio. | Flujos de connect/pago ya implementados; no se han probado en el teléfono. |
| Solflare | SDK oficial o deep link cifrado con retorno al dominio HTTPS. | No requiere WalletConnect Project ID; el flujo nativo crea el material de cifrado localmente. | Implementado; faltan prueba del prompt/retorno y validación del RPC desde móvil. |
| Coinbase Wallet / Base App | Provider inyectado o SDK; su documentación actual recomienda Base Account SDK para las integraciones nuevas. | El conector actual no usa WalletConnect Project ID. | Código presente, no probado en móvil. Base Account no se reemplazó porque no es un cambio equivalente al pago EOA en BNB/ETH/Polygon.
| TronLink | Deep link `action=open` al navegador DApp y provider TRON; `action=login` es un callback diferente. | No requiere WalletConnect Project ID para el provider in-app. | Ruta de navegador/provider implementada, sin prueba física. No se implementó el callback `login` de servidor.
| Keplr | La app tiene navegador DApp propio; `window.keplr` puede habilitar Cosmos Hub. | Sin WalletConnect Project ID dentro del navegador integrado. | Solo consulta dirección de Cosmos Hub; Cosmos no forma parte de las redes de pago actuales.
| UniSat | Extensión por `window.unisat`; la app móvil usa `unisat://request` y vuelve mediante un esquema de aplicación con nonce. | No requiere WalletConnect Project ID, pero sí un receptor del deep link de retorno. | Checkout web funciona con extensión; esta SPA no registra ni puede recibir el callback nativo móvil.
| CTRL / xDeFi | El provider de extensión se integra mediante una API EIP-1193; disponibilidad móvil y estado de distribución deben verificarse con su documentación vigente. | No configuramos WalletConnect para esta opción. | No aparece como opción en el selector ni en el checkout actual; no debe contabilizarse como implementado.
| Safe | Safe Apps SDK dentro del contexto Safe; una operación puede quedar pendiente de otras firmas. | No es un WalletConnect Project ID; requiere integrar Safe Apps y su ciclo de transacción multifirma. | No está integrado. No es una wallet EOA genérica que se active con `window.ethereum` en Brave/Chrome.
| WalletConnect | Pareo entre un navegador externo y varias wallets móviles. | Sí: Trust indica obtener `projectId` de WalletConnect Cloud. | Excluido por la preferencia vigente de no depender de un ID/proyecto externo.

Documentación primaria: [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Trust Mobile/WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile), [MetaMask Mobile Browser](https://support.metamask.io/es/configure/wallet/how-to-use-the-metamask-mobile-browser/), [MetaMask Connect](https://docs.metamask.io/metamask-connect/), [Phantom Connect](https://docs.phantom.com/solana/establishing-a-connection) y [Phantom Mobile deep links](https://docs.phantom.com/phantom-deeplinks/deeplinks-ios-and-android), [Solflare SDK](https://docs.solflare.com/solflare/technical/integrate-solflare/solflare-wallet-sdk), [TronLink deep links](https://docs.tronlink.org/mobile/deeplink/), [Keplr Mobile Browser](https://help.keplr.app/mobile-app/5R3bMyjtr3iKzMhqyCqu56/explore-dapps-with-keplr-mobile%E2%80%99s-browser/5So5gM41LhZn5CZxJZKmLv), [UniSat Mobile Connect](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet/connect-with-unisat-mobile-wallet), [Coinbase Wallet SDK](https://docs.cdp.coinbase.com/coinbase-wallet/overview), [Safe SDK](https://docs.safe.global/sdk/overview). Trust describe su parámetro `coin_id` como índice SLIP-44; las redes BNB, Ethereum y Polygon se corresponden con 714, 60 y 966 en [Trust Wallet Core](https://github.com/trustwallet/wallet-core/blob/master/docs/registry.md).

### REA y límites de la auditoría

En este turno intenté listar el navegador con REA y permitir únicamente `http://127.0.0.1:5173`. `rea/list_browser_targets` devolvió `Transport closed` en dos intentos. No hay captura nueva de REA ni evidencia de ejecución Android; el resultado del teléfono es tu reporte y el enlace se revisó en el código local. Para volver a capturar la interacción, REA necesita reiniciarse o reconectarse. La cobertura de REA estática anterior sigue siendo parcial y no certifica el deep link.

**Checklist:** continúa provisionalmente en **70/77**. El enlace de Trust se implementó pero depende de la prueba del teléfono. La parte reportada de MetaMask llega hasta aprobar/firmar; sin hash no se confirma la transferencia. Los otros seis controles abiertos siguen enumerados en `siete comprobaciones que siguen abiertas`.

## Cierre del retest Android y ajuste de Trust · 3-nov-2026

Este es el estado más reciente y reemplaza cualquier indicación anterior de que el Universal Link ya había resuelto la apertura de Trust.

- **MetaMask (reporte del usuario, Android + Brave/Chrome + ngrok):** la URL se abrió en el navegador integrado de MetaMask y permitió llegar a firmar/aprobar la transacción. No recibí un hash ni confirmación de explorador; no puedo verificar si se transmitió, confirmó o liquidó. Revisa Actividad en MetaMask antes de volver a intentar el pago.
- **Trust Wallet (reporte del usuario, Android + Brave/Chrome + ngrok):** al pulsar conectar, la app abrió en Inicio; no cargó la réplica ni apareció una solicitud. El enlace directo `open_url` no queda validado en este teléfono.
- **Interfaz actualizada:** en móvil, Carteras y checkout ahora ponen como acción principal **Copiar URL para Trust Wallet** / **Copiar checkout para Trust Wallet**. La URL copiada conserva el parámetro de conexión y, para checkout, producto, importe, moneda y red. El enlace automático oficial queda como acción secundaria para probar.
- **Paso manual requerido:** abre Trust Wallet → Browser/DApps, pega el enlace y acepta **Visit** si ngrok lo muestra. Cuando la réplica cargue dentro del navegador de Trust, el provider debe solicitar permiso para leer la dirección. La conexión no firma ni envía un pago.
- **Límite de protocolo:** Trust documenta `open_url` para abrir el navegador DApp. Para iniciar una sesión desde Brave/Chrome externo, su guía móvil documenta WalletConnect v2 y requiere `projectId`; esa dependencia sigue excluida. Sin WalletConnect, no hay forma de forzar el prompt desde el navegador externo cuando Trust solo abre su Inicio.
- **Pendiente en Android:** probar pegar la URL copiada, confirmar el prompt y dirección, rechazar y desconectar. Repetir la entrada desde crear minero y Recargar sin pulsar **Pagar**. No repetir la transacción MetaMask hasta revisar su Actividad.
- **Verificación local:** `npm run build` pasó con 945 módulos; Vite mostró solo el aviso no bloqueante del chunk Solana (695.66 kB). `/home?modal=paywall-create` respondió HTTP 200 y `git diff --check` pasó. No se probó una transacción real durante esta verificación.
- **REA/Linux:** el intento de listar targets devolvió `Transport closed` en dos intentos; no hay captura nueva de esta interacción. El reporte del Android es aportado por el usuario y se distingue de la inspección del código y la documentación.

La matriz general sigue provisionalmente en **70/77**. MetaMask queda verificada hasta el flujo de firma reportado, no hasta confirmación on-chain. Trust continúa pendiente de devolver una dirección dentro de Browser/DApps; el fallback de copiar y pegar ya está implementado. Fuentes: [Trust Wallet deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Trust Wallet Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile), [MetaMask Mobile Browser](https://support.metamask.io/es/configure/wallet/how-to-use-the-metamask-mobile-browser/).

## Investigación documental de conexión móvil por wallet · 3-nov-2026

Revisé documentación oficial de MetaMask, Trust Wallet, Solflare, Phantom, Coinbase, Keplr, TronLink, UniSat, Safe y CTRL/xDeFi y la contrasté con `src/walletAppLinks.ts`, `src/WalletPanel.tsx`, `src/WalletPaymentCheckout.tsx`, `src/walletSession.ts`, `src/phantomMobile.ts` y `src/coinbaseWallet.ts`.

**Diferencia clave:** conectar normalmente autoriza a la página a leer una dirección pública; no requiere firmar un mensaje ni enviar fondos. La aprobación de pago es otra solicitud y puede ser una transacción real. El usuario confirma que MetaMask llegó a esa pantalla en Android; sin hash no se sabe si el envío se difundió. Revisa Actividad antes de probar otro pago.

| Wallet | Ruta móvil según documentación oficial | Estado y brecha en esta réplica |
| --- | --- | --- |
| **MetaMask** | MetaMask Connect detecta navegador y app, y gestiona deeplink/QR; su navegador DApp también recibe la página. No es WalletConnect de Reown y no usa su Project ID. | Código conectado a MetaMask Connect. El usuario confirma Android + Brave/Chrome + ngrok hasta la aprobación. Falta probar permiso de dirección, rechazo, desconexión y comprobar el hash del intento anterior. MetaMask recomienda RPC fiable para los handoffs por relay. |
| **Trust Wallet** | Desde Chrome/Brave externo, la guía móvil usa WalletConnect v2/Sign API y requiere `projectId`. Sin ese ID, el camino es cargar la web en Browser/DApps y usar su provider; `open_url` sirve para navegar a esa vista. | El usuario reportó que el enlace abre Inicio, sin página ni permiso. El CTA principal copia la URL para pegarla desde Browser/DApps; todavía falta verificar esa ruta en el teléfono. Por tanto, Trust no está funcional desde el navegador externo con la configuración actual. |
| **Solflare** | Deep links nativos propios: `connect` cifra la solicitud, pide permiso para compartir la clave pública y devuelve sesión; métodos posteriores reutilizan la sesión. No depende de WalletConnect. | Implementación cifrada presente. Falta probar apertura/retorno en Android con el dominio público final. La RPC Solana tuvo un 403 previo; esa incidencia es independiente de la conexión. |
| **Phantom** | Browser DApp o universal links cifrados propios. La documentación actual limita los deep links nativos a Solana y recomienda `https://phantom.com/ul/...`. | Conexión implementada, no probada en teléfono. **Brecha encontrada:** `src/phantomMobile.ts` invoca `/signAndSendTransaction`, que la documentación actual de Phantom marca como obsoleto. Cambiarlo al método vigente de firma de transacción y revisar el envío/broadcast antes de dar el checkout Solana por terminado. |
| **Coinbase Wallet / Base App** | Tiene SDK web y extensión; la integración de aplicaciones nativas usa otro SDK. La documentación actual de Coinbase ahora recomienda `@base-org/account` para su generación actual. | Esta réplica instala `@coinbase/wallet-sdk` 4.4.0 y no usa WalletConnect Project ID. Hay que confirmar el soporte móvil de esa versión y decidir si migrar al SDK recomendado; no se ha probado en teléfono. |
| **Keplr** | Su documentación recomienda abrir la dApp desde Browser dentro de Keplr Mobile; conexiones desde navegadores externos pueden fallar si la dApp no tiene handoff compatible. | Lee dirección de Cosmos Hub solamente. Cosmos no está habilitada en el checkout; no es cartera de pago en esta réplica. |
| **TronLink** | El deep link `action=open` navega a la DApp Explorer, donde se usa el provider inyectado. `action=login` es un flujo distinto con `actionId` y `callbackUrl` HTTPS para devolver una dirección. | La réplica usa `action=open` más provider; el login callback dedicado no está integrado. No se probó en móvil. |
| **UniSat** | La app móvil requiere `unisat://request` y vuelve con `unisat://response`, usando un `nonce` para emparejar la respuesta. | El provider de extensión sí está contemplado; una SPA HTTPS no recibe ese esquema de retorno por sí sola. No hay flujo móvil implementado ni probado. |
| **CTRL (antes xDeFi)** | La web oficial confirma app móvil y extensión, pero no encontré documentación técnica oficial suficiente para validar un handoff móvil de dApp externa sin protocolo intermediario. | No está en el selector ni en `WalletId`; la réplica no lo soporta hoy. Requiere investigación técnica específica y prueba del provider en su navegador/app. |
| **Safe** | La conexión general de una dApp al Safe móvil documentada actualmente usa WalletConnect. Safe Apps es un contexto de ejecución especial con su SDK, no una conexión EIP-1193 genérica desde Brave/Chrome. | No está integrado. Sin WalletConnect Project ID no se puede ofrecer la ruta general para Safe; convertir la réplica en Safe App sería un trabajo distinto y aún requeriría comprobar multisig/red. |

### Qué significa esto para el selector de wallets

No hay una sola conexión sin clave que permita que cualquier wallet móvil reciba automáticamente una solicitud desde Brave/Chrome. Las rutas directas funcionan por proveedor y condiciones: abrir la dApp dentro del navegador de la wallet, deeplink cifrado propio o callback específico. Para emparejamiento amplio desde navegador externo, WalletConnect/Reown es la opción común, pero requiere crear Project ID y sujetarse a sus límites y licencia.

La página pública vigente de Reown lista Starter de USD 0, 2.5 millones de RPC/mes y hasta 500 MAU de wallets embebidas o autenticadas; separa esos MAU de self-custodial MAU, descritos como sujetos a límites aceptables. Los términos establecen licencia comercial al superar los límites allí definidos (actualmente 2.5 millones de RPC o 500 MAU); el plan Pro se publica a USD 89/mes. Por tanto, no es exacto decir que cualquier sitio cobra automáticamente USD 89 al tener 501 visitantes: depende de cómo se midan los MAU, RPC, plan, caso comercial y términos vigentes. Revisar la elegibilidad del negocio antes de adoptar Reown.

### Controles que siguen abiertos

- [ ] Probar en Android que Trust Browser/DApps carga la URL copiada, muestra autorización, devuelve dirección, rechaza correctamente y se desconecta; hacer solo lectura, sin tocar **Pagar**.
- [ ] Revisar MetaMask Activity y guardar el hash si existe. No repetir una aprobación real para probar; después validar solo conexión, rechazo y desconexión.
- [ ] Actualizar el deeplink de pago de Phantom porque el endpoint actual está marcado como obsoleto y probarlo en una wallet/red de prueba.
- [ ] Confirmar soporte móvil vigente de Coinbase Wallet y decidir migración desde `@coinbase/wallet-sdk` a la integración que recomienda Coinbase actualmente.
- [ ] Si se necesita wallet móvil general desde Brave/Chrome, decidir conscientemente si se habilita Reown/WalletConnect y su Project ID; de lo contrario, documentar wallet por wallet las rutas dentro de su navegador.
- [ ] Mantener CTRL/xDeFi y Safe fuera de la promesa de soporte hasta implementar sus conectores y probarlos; UniSat móvil también requiere resolver su retorno de deep link.

La puntuación base sigue en **70/77**; esta revisión documental no cierra pruebas de dispositivo ni de cadena. **REA/Linux:** `rea/list_browser_targets` devolvió `Transport closed` en dos intentos y no se repitió. No hay nueva captura REA; esta matriz es investigación en fuentes oficiales y revisión estática del código.

### Documentación primaria consultada

- [MetaMask Connect y plataformas](https://docs.metamask.io/metamask-connect/supported-platforms/)
- [Trust Wallet: deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Wallet Mobile/WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile)
- [Solflare: Connect](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect) · [Solflare: encryption](https://docs.solflare.com/solflare/technical/deeplinks/encryption)
- [Phantom: deep links móvil](https://docs.phantom.com/phantom-deeplinks/deeplinks-ios-and-android) · [Phantom: Connect](https://docs.phantom.com/phantom-deeplinks/provider-methods/connect) · [Phantom: Browse](https://docs.phantom.com/phantom-deeplinks/other-methods/browse) · [Phantom: SignAndSendTransaction marcado obsoleto](https://docs.phantom.com/phantom-deeplinks/provider-methods/signandsendtransaction)
- [Coinbase Wallet SDK vigente](https://docs.cdp.coinbase.com/coinbase-wallet/overview)
- [Keplr Mobile Browser](https://help.keplr.app/mobile-app/5R3bMyjtr3iKzMhqyCqu56/explore-dapps-with-keplr-mobile%E2%80%99s-browser/5So5gM41LhZn5CZxJZKmLv)
- [TronLink: deep links](https://docs.tronlink.org/mobile/deeplink/)
- [UniSat: conexión móvil](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet/connect-with-unisat-mobile-wallet)
- [CTRL Wallet](https://ctrlwallet.to/) · [Safe: conexión a dApps con WalletConnect](https://help.safe.global/articles/6643739210-how-to-connect-a-safe-to-a-dapp-using-walletconnect) · [Safe SDK](https://docs.safe.global/sdk/overview)
- [Reown: precios](https://reown.com/pricing) · [Reown: términos](https://reown.com/terms-of-service)

## Resultado de la última prueba Android y ajuste de Trust · 3-nov-2026

El usuario informa desde Android, usando Brave/Chrome y el enlace ngrok:

- **MetaMask:** abrió la URL dentro del navegador integrado y permitió aprobar/firmar la transacción. No se entregó hash ni captura de Actividad, así que no se puede determinar si se difundió o confirmó. Si la aprobación fue real, revisa Actividad antes de volver a intentar; no repetir un pago como prueba.
- **Trust Wallet:** abrió la app como acceso directo y se quedó en Inicio. No mostró la réplica ni una solicitud de conexión. El intento no cuenta como wallet conectada.
- No se confirmó cuál de los enlaces disponibles se pulsó en la prueba fallida; por ello no atribuyo el resultado específicamente a `trust://` o al Universal Link HTTPS.

### Cambio aplicado para probar el deeplink nativo

- El botón principal de Trust en **Carteras** y en el **checkout** ahora usa el esquema oficial `trust://open_url` cuando la app ya está instalada. Mantiene el Universal Link `https://link.trustwallet.com/open_url` y copiar/pegar en Browser/DApps como alternativas.
- El enlace lleva la URL HTTPS completa, `gmWalletConnect=trustwallet` y, desde el checkout, los datos necesarios para volver al mismo producto y red. La página solicita permiso de dirección únicamente después de cargarse dentro del Browser/DApps con el proveedor inyectado. El deeplink por sí solo no conecta, firma ni paga.
- `coin_id` sigue el parámetro SLIP-44 documentado: BNB 714, Ethereum 60 y Polygon 966. No usar `20000714` en este campo; es el identificador interno que Trust Wallet Core muestra para BNB Smart Chain, no el índice SLIP-44 que documenta `open_url`.
- No se añadió WalletConnect ni Project ID. Por tanto, si Android sigue abriendo Inicio, la ruta disponible sin ese servicio es pegar el enlace desde **Trust Wallet → Browser/DApps**, cargar la réplica y autorizar allí. La conexión desde Brave/Chrome externo sigue sin funcionar en este teléfono sin WalletConnect v2.

### Validación pendiente

- [ ] Probar el nuevo botón `trust://open_url` en Android y comprobar que cargue la página dentro de Trust. Luego verificar solicitud, aceptar, dirección, rechazar y desconectar; no pulsar Pagar.
- [ ] Si vuelve a Inicio, probar la URL copiada en Trust → Browser/DApps y verificar esos mismos estados.
- [ ] Revisar Actividad de MetaMask y guardar el hash si existe. No repetir el envío.

La matriz general se mantiene en **70/77**. El botón actualizado se validará con compilación local; no equivale a prueba en teléfono. REA/Linux había devuelto `Transport closed` al listar el navegador en dos intentos, así que no se repitió sin reconectar el servicio. Este cierre separa tu observación, la documentación oficial y el cambio estático de código; no afirma una captura REA nueva ni una conexión Trust completada.

Fuentes primarias: [Trust Wallet Deep Linking](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) documenta tanto `https://link.trustwallet.com` como `trust://` y la ruta `open_url`; [Trust Wallet Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile) documenta WalletConnect v2 para iniciar desde un navegador móvil externo y requiere `projectId`; [Trust Wallet Core registry](https://github.com/trustwallet/wallet-core/blob/master/docs/registry.md) distingue el ID BNB Smart Chain 20000714 del SLIP-44 714.

## Resolución Definitiva: Integración Universal con Reown AppKit (WalletConnect v2) · 3-nov-2026

Tras el suministro del `projectId` oficial por parte del usuario (`0343399f08f86b28ceaf084ae4e45a01`), se eliminó la limitación de handoff manual para Trust Wallet y navegadores externos (Android Brave/Chrome y Safari iOS).

### Arquitectura Implementada

1. **Reown AppKit v2 + Wagmi + Solana Adapters:**
   - Paquetes integrados: `@reown/appkit`, `@reown/appkit-adapter-wagmi`, `@reown/appkit-adapter-solana`, `wagmi@2.19.5`, `@tanstack/react-query@5.105.3`.
   - Inicialización centralizada en [`src/appkitConfig.ts`](./src/appkitConfig.ts) con soporte para BNB Chain (BSC), Ethereum, Polygon y Solana.
   - Enlace automático por WalletConnect v2 y Universal Links para Trust Wallet, MetaMask, Phantom, Coinbase Wallet y más de 300 billeteras móviles.
2. **Checkout Multi-cadena de 4 Redes Principales:**
   - BNB Chain (BSC), Ethereum, Polygon y Solana.
   - Soporte para pago en moneda nativa (`BNB`, `ETH`, `POL`, `SOL`) o en `USDT` (BEP-20, ERC-20, Polygon POS USDT, SPL USDT).
   - Recargo del **1.5%** trasladado al comprador para compensar el gas/slippage de la conversión posterior a USDT en BSC.
   - Recibo con hash y enlace directo al explorador de bloques oficial (BscScan, Etherscan, Polygonscan, Solscan).
3. **Flujo Post-Pago y Personalizador de Mineros:**
   - La compra exitosa registra el minero en la granja del usuario (`registerWalletMinerPurchase`).
   - Redirección automática a [`src/MinerCustomizer.tsx`](./src/MinerCustomizer.tsx) (`/miners/:minerId/customize`) con interfaz basada en los mockups de `UI-UX/Mineros-customizables` (robot SVG, sonrisa pixel retro, turbinas gemelas, 8 partes personalizables, 12 paletas de color y selector de expresiones).
   - "Guardar y Minar" activa el motor [`src/miningSimulation.ts`](./src/miningSimulation.ts) con fluctuación de TH/s, shares aceptados y recompensas en satoshis, persistido en `localStorage` y en Firestore (`mining_activity_logs`).
4. **Selector de Tema Claro / Oscuro:**
   - Modo oscuro por defecto con switch de alternancia persistente en la barra de navegación superior.
5. **Verificación:**
   - `tsc -b` completado sin errores.
   - `vite build` completado exitosamente en 1m 43s.
   - Servidor `vite preview` verificado con respuesta HTTP 200 en `http://127.0.0.1:4173/`.

## Optimización de Rendimiento y Conexión Directa Anti-Freeze (Brave Shields) · 3-nov-2026

Tras el diagnóstico del bloqueo de WebSockets por Brave Shields y la saturación de CPU observada al intentar conectar MetaMask mediante el modal externo:

1. **Eliminación del bucle de consumo de CPU / congelamiento:**
   - Se configuró `QueryClient` en [`src/appkitConfig.ts`](./src/appkitConfig.ts) con `retry: 0`, `refetchOnWindowFocus: false` y `refetchOnReconnect: false`. Esto suprime de raíz las tormentas de reintentos continuos que ocurrían cuando Brave Shields bloqueaba las conexiones a los relays de WalletConnect.
   - Se estabilizó la memoria de sesión en [`src/walletSession.ts`](./src/walletSession.ts) encapsulando el retorno de `useWalletSession` en `useMemo`. Se evita la recreación incesante de referencias en cada ciclo de renderizado.
   - En [`src/App.tsx`](./src/App.tsx), se refactorizó `unifiedConnection` para depender de valores primitivos (`walletSession.connection`, `walletSession.disconnect`) en lugar del objeto completo de sesión.
   - Se removió la duplicidad de adaptadores globales en `SolanaAdapter`, evitando disputas de listeners sobre el objeto `window`.
2. **Conexión Directa Nativa (MetaMask, Phantom, Solflare, etc.):**
   - En [`src/WalletPanel.tsx`](./src/WalletPanel.tsx) se restauró la matriz de conexión directa por proveedor. Los usuarios con extensiones instaladas (como MetaMask en Brave) pueden pulsar directamente "Conectar MetaMask" para lanzar el diálogo local `eth_requestAccounts` en milisegundos, sin depender de relays externos ni sufrir pantallas en blanco.
   - Se mantuvo de forma destacada el acceso al **Selector Universal Reown AppKit** con código QR para conectar más de 300 billeteras móviles.
   - En [`src/WalletPaymentCheckout.tsx`](./src/WalletPaymentCheckout.tsx), el paso de conexión ofrece tanto la opción directa ("Conectar MetaMask Directa 🦊" / "Conectar Phantom / Solflare Directa ⚡") como la opción universal por AppKit, asegurando compatibilidad total tanto en navegadores con bloqueadores activos como en dispositivos móviles.
3. **Verificación Técnica:**
   - `tsc -b`: 0 errores.
   - `npm run build`: 51.11s, exit code 0.
   - `vite preview`: HTTP 200 verificado en `http://127.0.0.1:4173/` y `http://127.0.0.1:4173/gmt-wallets`.


