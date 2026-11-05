# Informe de auditoría REA — GoMining réplica · 2 de noviembre de 2026

## Resultado

El corte vigente tiene **70/77 comprobaciones cumplidas, una fallida observada y seis abiertas**. “Cumplida” incluye navegación, estado demo, revisión de código, cotizaciones observadas, mocks y recorridos REA; no significa que 70 funciones se hayan probado en producción. En el último resultado comunicado, MetaMask abrió la réplica en su navegador y llegó a la aprobación de la transacción; Trust sigue abriendo Inicio. No tenemos un hash para verificar el envío. El checklist punto por punto está en [`gomining-replica-checklist.md`](./gomining-replica-checklist.md).

REA reprodujo el cierre del checkout con la X y con **Cerrar pantalla** mientras una solicitud de conexión simulada seguía pendiente. También reprodujo un rechazo de Connect y una pantalla de recibo QA. Esas escenas no abrieron una wallet real ni transmitieron fondos. La integración móvil de MetaMask, Solflare y Phantom existe en código; sigue sin prueba física en un teléfono.

**Actualización tras el reporte móvil (3-nov):** el usuario confirma Android + Brave/Chrome + ngrok. MetaMask abrió la URL en su navegador interno y llegó a la aprobación/firma reportada; Trust abrió Inicio. La ruta Trust fue corregida para usar `coin_id=714`, conforme al índice SLIP-44 documentado; requiere retest. Trust no puede solicitar conexión desde Brave/Chrome externos sin WalletConnect/Project ID; dentro de Browser/DApps usa el proveedor inyectado. Los enlaces solo navegan. La matriz continúa en **70/77**: la falla móvil de Trust y seis validaciones externas siguen abiertas.

## Interacción capturada con REA

Los escenarios usaron la réplica local a 390 × 844 px y un proveedor EIP-1193 de QA. El proveedor es una fixture de prueba, no una extensión real. Cada perfil temporal terminó con `terminated-owned-process`.

| Recorrido | Evidencia REA | Resultado observado | Límite |
|---|---|---|---|
| Abrir checkout con `eth_requestAccounts` pendiente y pulsar X | `ev_f8a08d69c365a9a57e66c7c823cc72dd05d9b8b38679b4f5f996dd9941292943` | El diálogo desapareció, se limpiaron los parámetros de checkout de la URL y no hubo errores de página. | Cierre del checkout web; no cierra una solicitud que permanezca dentro de una wallet real. |
| Repetir el caso y pulsar **Cerrar pantalla** | `ev_2843c110ace4df295d3fc3b8f52979638146d09dd354ccc1def82ff3e57a1f52` | Se desmontó el checkout y se limpió la URL. | Proveedor simulado; no es prueba Android. |
| Rechazar Connect desde la fixture | `ev_c0f08ee0653e0e4eea949090d1763628ed9f1e904e4ebf6a31ab62f9043f420a` | El modal se cerró y apareció: “Cancelaste la conexión en tu wallet. No se envió ningún pago.” | Rechazo sintético; no se mostró un prompt real de MetaMask. |
| Simular una respuesta de pago exitosa de QA | `ev_be965379b8b4bbeb6aad604a1d69056f3a4741586f6f952f987341a08d2d2324` | La interfaz rotuló el hash como ficticio, el estado de origen como no verificado y Bridge como pendiente. | No existe esa transacción en una blockchain; no es un recibo real. |

La primera captura del rechazo (`ev_82d48b0c2f301c7c7f119682bbcf82b7f19a7fa0940bb50746183272c5783639`) tuvo un selector de estado ambiguo. Se conserva como historial; el resultado concluyente es la segunda escena `ev_c0f08…` citada arriba.

## MetaMask móvil: ruta anterior Connect/MWP (histórico)

Este bloque documenta la configuración previa a la [revalidación del handoff móvil](#revalidación-del-handoff-móvil--2-nov-2026). En ese corte el checkout usaba `@metamask/connect-evm` como ruta Connect/MWP, con `mobile.useDeeplink: !isMobileBrowser()` y el App Link HTTPS `https://metamask.app.link/connect/mwp` en teléfono. El usuario reportó que no apareció una solicitud de conexión. La integración de escritorio con el SDK se conserva; el CTA móvil ahora usa el Universal Link `/dapp/{dappUrl}`. Al cargar el sitio en el navegador integrado, el usuario pulsa **Conectar MetaMask** para solicitar acceso al proveedor EIP-1193. Ninguna de las configuraciones se ha validado en teléfono físico. [README oficial](https://github.com/MetaMask/connect-monorepo/blob/main/README.md) · [deeplinks oficiales](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks.md)

REA analizó estáticamente el workspace actual: Evidence de resumen `ev_fca8030ec6d03a3836d545034975e83381ea9e8e4cd6ea2c8386f14dce05161d`, análisis padre `ev_73626ea5d1d69812686f2c3fce2e26dd11f76894f16a48ee09b245592ceae7e5`. El resumen revisó 9,092 nodos de su vista; el grafo es parcial y dejó 19,282 archivos inventariados sin seleccionar. REA parseó código como texto: no ejecutó el bootstrap ni abrió MetaMask. En este turno, un nuevo análisis acotado de cuatro fuentes agotó el límite del cliente (450 s) y no devolvió Evidence; no repetí la misma llamada. Se conserva la evidencia REA completada anterior. El build pasó el 2-nov-2026. REA encontró ADB disponible (`ev_86e823114c9668c8a38f4cf9177d82290253537ada3ca48852df01c01195c113`), pero el inventario observó cero teléfonos (`ev_db2d0727a6fc6cd81e81dd67e3acfd1dbf336c337200a9a11833de8bb5ae181f`). El handoff real sigue sin probarse; no se firmó ni transmitió nada.

## Funcionalidad por área

| Área | Estado auditado | Qué se puede afirmar |
|---|---|---|
| Diseño y navegación | **Parcialmente verificada** | Se cargaron 55 URLs del mapa de rutas en una revisión anterior; Inicio, checkout, Carteras y Pool tienen recorridos móviles documentados. La apertura de una ruta no certifica todas sus funciones: algunas vistas son genéricas, demo o desconectadas. |
| Crear minero | **Flujo de demo** | Configurador → revisión → checkout y cierre están presentes. El catálogo es una observación fechada; el envío no crea una orden conciliada ni activa automáticamente un minero. |
| Recargar | **Flujo de demo + checkout común** | Abrir Recargar y llegar al checkout está verificado. El saldo demo puede persistir; una transferencia no acredita saldo automáticamente. |
| Connect Wallet | **Código y mocks** | El estado permite identificar wallet/red, reusar una conexión compatible y mostrar dirección pública. Se probaron conexión simulada, cierre y rechazo simulado. Proveedores reales no se probaron en esta sesión. |
| Pago desde móvil | **Código actualizado; teléfono pendiente** | MetaMask abre el deeplink oficial al navegador integrado; comprador toca **Conectar** dentro de la app para pedir `eth_requestAccounts`. Trust Wallet y TronLink abren el navegador dApp y también requieren toque explícito. Solflare/Phantom mantienen el protocolo cifrado; el host ngrok gratuito mostró un intersticial. No se aprobó una conexión ni transacción real en teléfono. |
| Precio y gas | **Cotización pública; coste final externo** | El checkout convierte el precio del catálogo con cotizaciones observadas, controla su caducidad y muestra el gas como estimado por la wallet. El gas definitivo y la confirmación dependen de la wallet/red; Bridge tiene mínimos, liquidez y resultado variables. |
| Suscripción y referidos | **Demo** | Se pueden recorrer y calcular beneficios de forma local. La transferencia no activa suscripción, bonificación ni renovación real. El anual permanece deshabilitado hasta confirmar su precio. |
| Pool y granjas | **Datos públicos/demostración** | Las vistas de pool pueden mostrar historial público de Kryptex; workers y granjas no son telemetría propia verificada ni operaciones de GoMining. |
| Firebase | **Persistencia demo verificada; backend financiero pendiente** | En la continuación tras la autorización se desplegaron únicamente Auth anónimo y las reglas restringidas de Firestore en `salad-miners`; el comando confirmó `Deploy complete`. No hubo despliegue de Hosting, Functions, facturación ni backend financiero. Las lecturas CLI posteriores encontraron la base `(default)` en `nam5`; `functions:list` falló de forma genérica y no permite afirmar si hay funciones remotas. El ejemplo `unilevel-ejemplo/1nvezt` pertenece a otro producto. [Requisitos oficiales de Cloud Functions](https://firebase.google.com/docs/functions/faq-and-troubleshooting) |
| Contabilidad y recepción Bridge | **No completa** | Las direcciones, fee y neto visibles no prueban que Solflare reciba o convierta el depósito. No se validó un recibo existente en cadena ni una cotización Bridge en cuenta autenticada. |

## Siete comprobaciones que siguen pendientes

1. **Wallets reales:** conectar y desconectar Solflare, Phantom, MetaMask, Coinbase Wallet, Trust Wallet, TronLink y UniSat, y comprobar el proveedor de cada red.
2. **Handoff real en teléfono:** el usuario informó que MetaMask y Trust Wallet abren solo Inicio. En ngrok, MetaMask ahora abre el navegador DApp y conserva la intención; Trust usa `trust://open_url` con Universal Link como alternativa. Si la réplica carga dentro de la wallet con `gmWalletConnect`, la conexión solicita solo la dirección al detectar el provider. Trust, MetaMask, Solflare, Phantom, Coinbase y TronLink aún necesitan comprobar el prompt, aceptar/rechazar y el regreso en teléfono. El cambio en código no cierra esta comprobación sin teléfono.
3. **Recibo on-chain real:** revisar una transferencia ya existente y verificar remitente, red, destino, activo, importe y estado. El recibo de QA usa un hash ficticio.
4. **Solflare Bridge en vivo:** confirmar en la cuenta/ruta disponible los destinos, tokens aceptados, cotización, mínimo, fee, neto y resultado real. Esta auditoría no puede inferir esos datos privados de capturas o direcciones aisladas.
5. **Tokens adicionales:** definir e implementar tokens de Bridge fuera de los activos nativos incluidos solo cuando contratos, decimales, red y compatibilidad estén confirmados. La réplica actualmente conserva el alcance conocido (BNB, BTC, ETH, TRX, POL y USDT SPL); no se debe asumir compatibilidad de tokens adicionales.
6. **Elegibilidad/KYC:** comprobar condiciones aplicables a cada tercero, ruta, monto y región. No se afirma que todos los proveedores/Bridge estén libres de verificación.
7. **Backend financiero:** pedidos autenticados, monitor de cadena, confirmaciones, idempotencia, conciliación, registro de recibos, protección contra pagos duplicados y activación de mineros/suscripciones. Firebase de demo no proporciona esto. La carpeta `unilevel-ejemplo/1nvezt/functions` es un ejemplo de otro producto, con su propio `firebase.json` y modelo `SALES`; no se despliega en `salad-miners` ni se puede reutilizar como verificador de estos pagos sin adaptación y auditoría.

Estas casillas requieren interacción externa, configuración privada de Solflare o desarrollo de backend. No se pueden cerrar con una simulación visual sin convertir el informe en una afirmación falsa.

## Integridad de datos y validación

- REA hizo una pasada estática previa del workspace (`ev_fca8030ec6d03a3836d545034975e83381ea9e8e4cd6ea2c8386f14dce05161d`, derivada de `ev_73626ea5d1d69812686f2c3fce2e26dd11f76894f16a48ee09b245592ceae7e5`). Después se completó otro análisis REA con selección exacta de `src/metamaskConnect.ts`, `src/walletSession.ts` y `src/WalletPaymentCheckout.tsx`: evidencia padre `ev_02b708677f6bcce8d19770c76b7000a73c15c8c2888aac9c4f3bed916150de03`, vista de resumen `ev_2980d7e6173661142e4d13a808d203ce58744257b99adb12513c1667321f5a07`. REA confirmó esos tres módulos como texto estático, sin ejecutar el bootstrap ni abrir MetaMask. El inventario conservó 19,283 archivos fuera de selección y la cobertura semántica es parcial; no prueba ejecución ni handoff Android. Una solicitud anterior de cuatro módulos expiró en el cliente tras 450 s y no se repitió idéntica.
- Las escenas de navegador controladas se ejecutaron con REA/Linux. En esta sesión, el montaje `Y:` no estaba disponible en el entorno de análisis Linux para leer fuentes; por eso la pasada estática final se hizo con REA sobre el workspace local. El cambio de proveedor no amplió el alcance ni ejecutó la app.
- `npm run build` pasó tras los cambios: TypeScript y Vite compilaron 564 módulos. Rollup conserva el aviso no bloqueante del bundle Solana de 695.66 kB.
- El host HTTPS temporal respondió HTTP 200 el 2 de noviembre. El enlace Quick Tunnel es público, temporal y puede cambiar; no es un dominio de producción.
- No se conectó una wallet real, no se aprobó una firma, no se hizo un pago ni se desplegó un backend financiero. Las únicas interacciones de pago fueron fixtures de QA.

## Comprobación adicional de UI y Firebase CLI · 2 de noviembre

- En una pestaña local de Brave sin proveedor MetaMask inyectado, abrí el checkout desde `gmPay`; **Cancelar** y la X quitaron el diálogo y limpiaron los parámetros de pago. La prueba verifica cierre de interfaz sin wallet ni transacción; REA ya había capturado antes la misma clase de cierre con fixtures controladas.
- En viewport 390 × 844 px abrí `/home?modal=paywall-create`; cargó el skeleton y el configurador. **Continuar** abrió el paso de revisión y **Cerrar configurador** regresó a `/home` y quitó la query modal. No conecté wallet ni cambié estado demo.
- Desde Inicio abrí **Recargar**, comprobé los importes demo de USD 100/500/1,000, seleccioné USD 500 y abrí el checkout compartido. **Cancelar** cerró el checkout y volvió a Inicio; para reintentar se abre Recargar de nuevo. Sin proveedor instalado, no apareció ninguna autorización ni se envió una solicitud.
- Con Computer Use fijé la vista a 390 × 844 px, abrí `/home?modal=paywall-create`, esperé la carga del skeleton y confirmé que aparece el configurador; **Continuar** abrió la revisión del minero. No envié el formulario ni abrí una wallet. El tamaño corresponde a viewport de escritorio ajustado, no a Android real.
- En la primera comprobación después de la autorización CLI, `projects:list` y `firestore:databases:list --project salad-miners` confirmaron Firestore Native `(default)`, `nam5`, `freeTier: true`. Firebase Console mostraba Auth anónimo habilitado y reglas restringidas a `users/{uid}/demoState/current`. En ese corte inicial aún no se había desplegado; el despliegue posterior se documenta en “Continuación tras autorización Firebase CLI”.
- La autorización se revalidó con Firebase CLI 11.11.0: `projects:list` encontró el proyecto y `firestore:databases:list` devolvió `(default)` en `nam5`. `functions:list` volvió a fallar con el error genérico; no permite inferir si hay funciones desplegadas. No se hicieron cambios en ese chequeo de lectura; el despliegue de Auth y reglas ya consta al final del informe.
- La lectura de `firebase.json` confirma Auth anónimo y reglas Firestore; la ruta `src/firestoreDemoSync.ts` sincroniza solo el snapshot demo y conserva respaldo `localStorage`. Las fuentes de Functions encontradas pertenecen a `unilevel-ejemplo/1nvezt`, otro producto. La réplica no integra verificación de cobros/órdenes. Firebase requiere el plan Blaze y facturación vinculada para desplegar Cloud Functions; no se cambió el plan ni se habilitó facturación.
### Prueba Android reportada y revalidación REA · 2 de noviembre

- El usuario informó que MetaMask Android abrió un navegador interno vacío, sin mostrar una aprobación de conexión. No se registró la URL exacta ni se puede demostrar que el teléfono cargara el build actual. REA ADB encontró cero dispositivos, así que no fue posible reproducirlo con captura controlada. La revalidación posterior corrigió el formato del Universal Link y cambió la solicitud automática al cargar por un toque explícito en **Conectar**. La documentación oficial distingue `/dapp/{dappUrl}` (abrir el navegador integrado) del protocolo de conexión MWP; este último se conserva en el SDK de escritorio. La incidencia móvil no se marca resuelta sin prueba en teléfono. [Plataformas compatibles](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/supported-platforms.md) · [Guía oficial de deeplinks](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks.md).

### Revalidación del host de MetaMask y aviso móvil · 2 de noviembre

- El host ngrok actual `sprinkler-wooing-graceful.ngrok-free.dev` responde `HTTP 200`, pero el cuerpo es la pantalla “You are about to visit…” de ngrok, no la app. Al enviar `ngrok-skip-browser-warning: 1`, la misma URL entrega el HTML real `GoMining · réplica local`. La app móvil no puede añadir ese encabezado al retorno desde la wallet; esta intercepción es una causa plausible del síntoma, no está demostrada como causa única. [Explicación de ngrok sobre el aviso gratuito](https://ngrok.com/blog/free-static-domains-ngrok-users).
- El Quick Tunnel HTTPS ya configurado, `https://luis-reach-award-publicity.trycloudflare.com`, se revalidó sin cabeceras especiales: `/home` devolvió `HTTP 200`, `lang="es-MX"`, título de la réplica y los bundles recién compilados. La URL debe tratarse como temporal.
- Se añadió `mobileTargetUsesNgrokFreeDomain` en `src/walletAppLinks.ts`; Carteras y checkout muestran una advertencia móvil cuando el host pertenece a ngrok gratuito. El mensaje dirige a probar con un HTTPS sin intersticial o el dominio oficial. `npm run build` pasó con 564 módulos; el Quick Tunnel sirve la nueva cadena y sus estilos.
- REA analizó como texto estático los tres módulos modificados o vinculados (`src/walletAppLinks.ts`, `src/WalletPanel.tsx`, `src/WalletPaymentCheckout.tsx`): `ev_cbebe4230ee8435917ef95fcc5cdefe4bbcf04f7aef8bb1d5e760e515da6bd75`, derivado de `ev_6703a2426e737457dcc6bb733a0499addfa7e0a5fbcbfb94bf7086ccbf7d2aaf`. Se parsearon 3/3 archivos (6,281 nodos, 108 hallazgos, cero errores). La cobertura es parcial: quedaron 19,283 archivos fuera de selección y la semántica alcanzó el límite de 100,000 incógnitas; REA no ejecutó el flujo ni abrió una wallet.
- No se aprobó ni rechazó una conexión real. El test del Quick Tunnel se hizo desde este equipo; REA ADB no ve teléfono. La prueba de apertura de la app, aprobación/rechazo y retorno en MetaMask Android continúa abierta.

## Archivos para revisar

- Checklist punto por punto: [`gomining-replica-checklist.md`](./gomining-replica-checklist.md)
- Checkout y wallet: [`src/WalletPaymentCheckout.tsx`](./src/WalletPaymentCheckout.tsx), [`src/walletAppLinks.ts`](./src/walletAppLinks.ts), [`src/walletSession.ts`](./src/walletSession.ts)
- Documentación de la réplica: [`gomining-replica-guide.md`](./gomining-replica-guide.md)
- Informes históricos y recorrido de rutas: [`gomining-replica-audit-completa-2026-11-01.md`](./gomining-replica-audit-completa-2026-11-01.md), [`gomining-replica-audit-2026-11-01-seguimiento.md`](./gomining-replica-audit-2026-11-01-seguimiento.md)

## Revalidación del handoff móvil · 2-nov-2026

- Se corrigió la ruta MetaMask. El CTA construye `https://link.metamask.io/dapp/{dappUrl}` con host/ruta de la réplica y adjunta la query del checkout al enlace; la documentación oficial confirma que abre una dapp dentro del navegador móvil, pero no especifica si todos los parámetros de query del enlace se trasladan al URL destino. El teléfono debe confirmar que producto, red y marcador de regreso sobreviven al handoff. Una vez cargada la réplica dentro de MetaMask, el usuario pulsa **Conectar MetaMask**; el checkout llama `eth_requestAccounts` y muestra la dirección solo si MetaMask autoriza. Conectar no firma ni envía un pago, no requiere Project ID ni usa relay en esta ruta. [Deeplinks MetaMask](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks.md).
- Se eliminó el intento de conexión automático al montar la página. MetaMask, Trust Wallet, Coinbase Wallet y TronLink requieren un toque en **Conectar** después de que su navegador integrado cargue la réplica; abrir la aplicación por sí solo no es una autorización. El proveedor MetaMask puede inyectarse tarde; `discoverEvmProviders` espera la señal EIP-6963/`ethereum#initialized` hasta 1.5 s después del toque.
- En la prueba de interfaz local con `gmWalletConnect=metamask`, la réplica mostró el aviso de regreso y el botón **Conectar MetaMask**. No se conectó ningún proveedor. Esto confirma el estado visual cuando el marcador llega al sitio, no la navegación desde ngrok ni el traspaso de query de MetaMask en un teléfono.
- La revisión documental confirma los contratos: Trust Wallet `open_url` abre el navegador dApp, pero conexión móvil directa sin WalletConnect ocurre dentro de ese navegador; Coinbase mantiene conexión EIP-1193 en el SDK/extensión, aunque su documentación actual migra hacia Base Account SDK y no confirma el deeplink legado `go.cb-w.com/dapp`; Solflare/Phantom usan protocolos cifrados nativos; Phantom ya apunta al dominio universal `phantom.com`; TronLink `action=open` solo abre DApp Explorer y `action=login` usa un callback separado; UniSat exige `requestAccounts()` por toque de usuario y no se encontró su flujo móvil en navegador externo. Fuentes: [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Trust EVM provider](https://developer.trustwallet.com/developer/develop-for-trust/browser-extension/evm), [Coinbase Wallet SDK](https://docs.cdp.coinbase.com/coinbase-wallet/overview), [Solflare Connect](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect), [Phantom deep links](https://docs.phantom.com/phantom-deeplinks/deeplinks-ios-and-android), [TronLink DeepLink](https://docs.tronlink.org/mobile/deeplink/) y [UniSat Wallet API](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet).
- Diagnóstico del host de prueba: `https://sprinkler-wooing-graceful.ngrok-free.dev/home` respondió `HTTP 200 text/plain` con el intersticial “You are about to visit…”, no con la aplicación. Este navegador no puede adjuntar `ngrok-skip-browser-warning` a la navegación de regreso desde una wallet. El Quick Tunnel `https://luis-reach-award-publicity.trycloudflare.com/home` respondió `HTTP 200 text/html` con el título de la réplica. Es una URL temporal y pública; se recomienda para probar este flujo mientras no exista el dominio oficial.
- `npm run build` pasó en esta revisión después de los cambios móviles: TypeScript y Vite compilaron 566 módulos. Rollup conserva el aviso no bloqueante por el chunk Solana de 695.66 kB.
- La captura REA/Linux solicitada en esta revisión devolvió `execution_failure` y `cleanup_incomplete`, sin screenshot, DOM ni Evidence utilizable. `rea doctor --client codex --json` mostró el registro de Codex alineado y el estado del servidor como desconocido; no identifica ni confirma limpieza del proveedor de escenario. No se reintentó el mismo escenario ni se iniciaron otras capturas con esa capacidad retenida.
- El usuario informó que MetaMask solo abre la app y Trust Wallet abre la app sin mostrar una solicitud, usando ngrok. En esta revisión no se ejecutó el flujo en un teléfono ni sabemos si la réplica cargó dentro del navegador DApp. Abrir una dapp no equivale a autorizar la wallet: la pantalla web debe cargarse y luego el usuario toca **Conectar** para pedir acceso a la dirección; el pago posterior sí es una aprobación separada. El intersticial gratuito de ngrok puede interrumpir la carga. Prompt real, aceptación/rechazo y regreso siguen pendientes; no hubo conexión, firma, transferencia ni pago real. La matriz sigue en **70/77**, con **7 pendientes**; la revisión documental/build no se presenta como validación en dispositivo.

## Continuación tras autorización Firebase CLI · 2 de noviembre de 2026

### Firebase de demostración

La autorización CLI permitió enumerar el proyecto `salad-miners` con `firebase-tools 15.34.2`. Desplegué únicamente Auth y reglas Firestore con `firebase deploy --only auth,firestore:rules --project salad-miners --non-interactive`. Firebase confirmó `Auth providers enabled: anonymous`, compiló las reglas, las liberó y terminó con `Deploy complete`; indicó que las reglas ya estaban vigentes y omitió su carga. No hubo despliegue de Hosting, Cloud Functions ni cambio de facturación. Las reglas siguen limitando la sincronización a `users/{uid}/demoState/current` y denegando las demás rutas; el cliente sigue guardando solo datos de demostración.

`firebase functions:list --project salad-miners` volvió a responder `Failed to list functions for salad-miners`. Es un error genérico y no permite concluir si existen funciones remotas. El `firebase.json` de este workspace no declara codebase de Functions, y el proyecto no tiene aquí código backend de pagos. La autorización CLI y el despliegue de Auth/Firestore no crean un conciliador ni habilitan compras automáticas.

### REA, Android y build

El análisis estático REA/Linux de ocho archivos fuente expiró a los 450 segundos en el cliente (`timed out awaiting tools/call`), sin Evidence entregada. No se repitió esa solicitud; se conserva la limitación de tiempo del host y la evidencia REA anterior del 2 de noviembre con su alcance de tres módulos. REA ADB volvió a informar cero dispositivos disponibles (`ev_75a6248230841cbf135cfd6cbcce39e9bb3958c9cf71465f19b63d70ce23d9fb`), por lo que el flujo MetaMask Android no pudo comprobarse físicamente.

`npm run build` pasó con TypeScript y Vite; se transformaron 564 módulos. Permanece el aviso no bloqueante de Rollup por el chunk Solana de 695.66 kB. No se conectó una wallet, no se abrió una aprobación, no se firmó ni transmitió un pago y no se desplegó un backend financiero.

### Estado de aceptación

El checklist conserva **70/77 comprobaciones confirmadas y 7 pendientes**. Los pendientes siguen siendo proveedores reales; MetaMask/Trust Wallet en teléfono; revisión de una transferencia real; rutas Bridge y sus cotizaciones vigentes; tokens Bridge adicionales con contrato confirmado; elegibilidad/KYC por proveedor, ruta, región y monto; y el backend de pedidos, verificación, idempotencia y activación. Ninguno puede darse por completo con el despliegue de persistencia demo.

## Simplificación del MVP y revalidación REA · 2 de noviembre

Esta revisión implementa la reducción de alcance solicitada en la página “Auditoria de web”; se registra aparte de la matriz funcional 70/77, que mide otras áreas.

| Decisión | Implementación y resultado verificado |
|---|---|
| Ocultar Explorar y Academia | Se quitaron ambos grupos del menú. REA abrió el menú desplegable y no encontró enlaces a los grupos o rutas desactivados (`ev_9ebb2d8d824d8ea34156b177959395d825d6bbc3400aabdc391467958dfef848`). |
| Desactivar Marketplace y carrito | `/marketplace` redirige a `/home` (`ev_4602f537d2fb66ac0ed613862905f2ca854695cfd04cecf6491967870630a6e9`). El panel Marketplace y el diálogo de carrito permanecen como código dormido, sin enlace en la cabecera ni ruta MVP que los monte. La franja BTC/GOMINING en Inicio quedó marcada `Referencia de precios · demo` y no ofrece acciones de compra (`ev_e9d15833aa8278d710f21d6ff3666e9029f362d70defee3b4f391fb9259071e0`). |
| Desactivar Visa y Simple Earn | `/finance/banking-cards` redirige a Inicio (`ev_913ac6f67f76cd38ec4c2c2ef9a8905585ab23122b1a898be29ba28e3557cd7a`); la ruta no tiene dependencia funcional en los paneles retenidos. `/finance/simple-earn` redirige a Inicio (`ev_a0e8c3f2b6b06b7919fc520b0a8174b5b6f52a11a0ffc026495cd0ee6205032a`); el legacy `/finance/simple-earn/overview` redirige al resumen de ganancias. La etiqueta `Cards` en royalties de referidos es una categoría de recompensa independiente. |
| Quitar beneficios y comunidad no necesarios | `/bonus-miner-v3` redirige a Inicio (`ev_386e5c40662fa2c24e64a098557850d3ed9118d3cef696584b2d4b95d6400832`); además se quitó el enlace que permanecía dentro de Mineros (`ev_20eaf02065029d8b7cefca19a516338abc665264c5842a95169a7dd1c3a5f7cc`). Rareza, Solo Mining y Ranking de liquidez también redirigen a Inicio (`ev_34d76f047ff41a19c70b5691e9a6b4c7b5df298f98ce7d10d10867100122ba6d`, `ev_b910ff20a8b5bde75836b2554777ea6132f2af0c5dbe8aff670fdf608eae9974`, `ev_58344757349e0f55496147a1752285fd7ebec4c2b56f90bfcc086bf3c2f5f6a1`). |
| Reemplazar Economía de la operación | `/operator-economics` redirige a `/mining-calculator` (`ev_d50bed8f8b489370a67b6dc8a692e82ecf0357a81644a358a8d8a97bc99e765a`); el calculador permite seleccionar los modelos de compra única, cantidad, eficiencia, disponibilidad, electricidad y mantenimiento. Consulta datos públicos de Bitcoin para estimar rendimiento bruto; no se interpreta como pago, ingreso realizado o rentabilidad garantizada. `/finance/simple-earn/overview` redirige a `/finance/earn-summary` (`ev_1913a7c8fbe29b4af7cef599f19c8a28d0c20949c6510e1e3c6c0baefdfcb360`). |
| Mantener funciones MVP · corte inicial | REA confirmó acceso directo a Fondos instantáneos, Resumen de ganancias, Comprar GOMINING, Suscripciones y Data centers (`ev_73e370837d9486d444ba6e4be5e93ebe87529644be13580dc798f25044c3c302`, `ev_6625bb3f07e786260f743691918c5bbbc50b6be90d2545cb7aed2fd30cbe7a42`, `ev_7eaaad29496a5737b44edfe0c5e07280d6e2fe8192d3d643fe8c3f6e4ef8db7f`, `ev_1363a160370afed1cd80994b9c660ed22521e4ec220b45b1304095a7f40cb942`, `ev_58e0f03f1e3bcc209b0828a77221385b5e8b3463313a5542923b3a1ab148af2c`). En la revalidación posterior se desactivó `/buy/GOMINING` y otras rutas de tokenómica; ver el apartado “Revalidación de interacción y rutas” que sigue. |

REA corrió los escenarios anteriores en Chromium temporal a 390 × 844 px, con viewport móvil y movimiento reducido; todas las sesiones registradas en ese corte terminaron con `terminated-owned-process`. Para el inventario de verificación de esa fase, consulta el [addendum de simplificación en la guía](./gomining-replica-guide.md#addendum-simplificacion-del-alcance-mvp--2026-11-02) y el [checklist separado](./gomining-replica-checklist.md#checklist-de-reduccion-del-mvp--2-nov-2026). La configuración Firebase no se cambió durante esa limpieza. `npm run build` terminó correctamente después de quitar el enlace Minero Bonus (TypeScript y Vite, 566 módulos); sigue el aviso no bloqueante de Rollup por el chunk de Solana de 695.66 kB.

## Revalidación de interacción y rutas · 2 de noviembre de 2026

Esta sección reemplaza el estado de rutas de tokenómica que aparece en la tabla “Simplificación del MVP” anterior. Los Evidence IDs son de recorridos controlados de REA; los escenarios de wallet usan proveedores de prueba y no autorizaron firmas ni pagos.

| Área | Resultado observado | Evidence |
|---|---|---|
| Cancelar checkout con conexión pendiente | Tras abrir el configurador, avanzar a revisión, aceptar el aviso y abrir el checkout, el proveedor de QA simuló una conexión pendiente. La X cerró el checkout, limpió la query y regresó a `/home`. Esto verifica que el modal no queda atrapado; no cancela una solicitud que ya esté abierta en una wallet real. | `ev_919588e6c9b5579fc37d268197b5dc51afd8740e96c298d06b3629117b2f325c` |
| Recargar con wallet conectada | Con un proveedor EIP-1193 falso de QA, Recargar reutilizó MetaMask y BNB Chain, mostró la dirección conectada y presentó la acción de pago. La prueba se detuvo antes del clic de pago. | `ev_d018735c7fa715ffe617fda88ead8ca7e5c076360485dfa61e1e07805e688497` |
| Retiro local | La vista presentó la dirección conectada y se mantuvo en `/withdraw/GOMINING`; no redirigió a Recargar. El intento local no se completó porque el saldo de sesión era insuficiente. | `ev_f705dd4f27848801b2a841e3bf6261fc535b5a1aee97a7de4b1a0dbf1b554253` |
| Desactivación de rutas | `/buy/GOMINING`, `/liquidity`, `/ve-tokenomics` y `/lock/ve-my-lock` redirigieron a `/home`. `/lock/ve-voting` permaneció accesible. Esto supersede el corte anterior en que `/buy/GOMINING` permanecía activo. | `ev_5a0d9de3b9718922229564e3b635ae5143e7ed6615ebe6fcadd29e9be2fbe78f`, `ev_15ed752e850be116150948907601f475aadb4ee3821d72fba7439f4e3ce94056`, `ev_3699ea0a5fe7cd434042e8f7216a72094788c1c42fad38b98084467ff8f9362a`, `ev_602e590b27fa97ac2f293c3c67e3545e09d2af6092fc43545024fb671ccdfaa6`, `ev_694598a935a0ae139c4137357ff105f8dd744d568655da2818fa81af99b03cea` |
| Menú y encabezado | REA abrió el menú a 686 × 477 px y encontró Votación accesible; capturó el screenshot del mismo viewport. El panel está limitado por la altura visible y su contenido puede desplazarse. Una inspección previa encontró un acceso de wallet y cero botones de notificación en la cabecera. | `ev_c163f26943ddfbc432dc1b65868b85890613ea61e466bc8f9e9ee39742e5bfb6`, `ev_2870938b4d405c7b1e551b10d6e87cb4b11318ad39df92b3108f67bc4a2a66d5`, `ev_36150c744d8a3abc889dbf872b54af504c8d945da0d2f18125de2e981b811a51` |

La captura nueva del menú se realizó con el proveedor REA de Windows y un perfil temporal de Brave/Chromium 156; concluyó con `terminated-owned-process` y captura completa. En el intento equivalente de REA/Linux, el proveedor falló antes de entregar una captura utilizable; `rea doctor` reportó salud global incompleta por motores nativos ausentes y registros de otros clientes, así que no usé esa salida para afirmar el estado de la interfaz. El fallback REA Windows sí ejecutó la escena y confirmó cleanup.

`npm run build` pasó después del ajuste del menú: TypeScript y Vite compilaron 566 módulos. Rollup mantiene un aviso no bloqueante porque el bundle Solana minificado supera 500 kB (695.66 kB). La matriz base sigue en **70/77**, con siete pendientes; los recorridos de cierre no se suman a esa matriz. Firebase no se volvió a desplegar ni configurar en esta revalidación.

## Auditoría adicional de bugs, recarga y retiro local · 2 de noviembre de 2026

Se repitieron recorridos con REA/Linux sobre la réplica local, en viewport móvil de 390 × 844 px. Cada perfil de navegador era temporal y el resultado de limpieza fue `terminated-owned-process`. Los escenarios de wallet usaron proveedores EIP-1193 de QA; no se conectó una wallet real ni se firmó o transmitió una transacción.

| Punto auditado | Resultado | Evidencia y alcance |
|---|---|---|
| Rutas de tokenómica fuera del MVP | `/buy/GOMINING`, `/liquidity`, `/ve-tokenomics` y `/lock/ve-my-lock` redirigen a `/home`. `/lock/ve-voting` permanece abierta. | `ev_1e34b0ac40018ca976ca7e66e2a3c31a6be1cf8709fd757f8186a2ad13f004ce`, `ev_114385391b290cd28afba88f8963021f06e124bf7fa8d30025b04246e31921fb`, `ev_b3b655e113dde664fc533681e911587a5b49abe8e9387b408d76d41bc04affb3`, `ev_2334a3e91aecf9c04afbc1b360b4b7ccd87f023cc945cb7da20dcdfeb215e8d5`. |
| Menú y texto de estado | El menú no muestra las cuatro rutas desactivadas. En las vistas de UI revisadas no aparece la palabra `DEMO`; el estado de prueba se comunica como local o simulado. El identificador de comprobante local usa `LOCAL-`. | Menú REA `ev_99401c64cb25677cad9255819e3460296275ee3e9a7567dfb61aae6aaa406243`; recibo de retiro local `ev_4c73aa2085b31c7a87e398155d2d2eef74bfe93abb3e7e1599a1bda40f0c9483`. Esta comprobación cubre el menú y el flujo observado, no cada texto de todas las rutas. |
| Carga del botón de wallet | El indicador transitorio “Detectando wallet autorizada” desaparece y, sin wallet conectada, queda “Conectar una wallet”. | `ev_1e1d5e9a47d46564fb6b39fdc7dc75a66986c1d0eb956923a60a3814faa18354`. La escena no prueba detección en una extensión real. |
| Recargar y wallets por red | El modal muestra las seis redes. En BNB Chain aparecen MetaMask, Coinbase Wallet y Trust Wallet; al cambiar a Solana aparecen Solflare y Phantom. | BNB `ev_d23bdbd062545d141a735deb115f155dea9c3aeee7061ca0e6ec4c11996badc5`; Solana `ev_7a40556066ef63e22fc9ce57e83a1070b4cb53a37b69db66f6d6dcd117e75960`. La lista se validó en UI; los proveedores reales no se conectaron. |
| X durante conexión pendiente | La X cierra el checkout aun cuando la promesa de conexión de la fixture no se resuelve. No se crea recibo ni pago. | `ev_308f6184070031109529bbcac782dc84037696f6803546484931c3b13e3fa490`. Cierra la vista web, no puede cerrar un prompt que siga abierto en la app de wallet. |
| Cancelación de conexión | La fixture de rechazo cierra el checkout y muestra “Cancelaste la conexión en tu wallet”; no se crea recibo. | `ev_91d2eb33579cb042058b5c8a9e5d4583697179b0ef87f3815cad3435b5caac82`. No equivale a probar Cancelar en MetaMask real. |
| Retiro y dirección conectada | La ruta `/withdraw/GOMINING` conserva la página de retiro y precarga la dirección de MetaMask QA; no deriva a Recargar. | `ev_94640207c8fcb02c9c2c4eab381c58a707e5cd14519da26c778de4659ae1a578`. Es una conexión ficticia; la dirección no se transmite a Firebase. |
| Solicitud de retiro local | Con saldo local de USD 500, importe bruto USD 100 y comisión introducida de USD 1, se registra una solicitud `LOCAL-…`, muestra neto USD 99 y deja saldo USD 400. La pantalla indica que no se envió una transacción. | `ev_4c73aa2085b31c7a87e398155d2d2eef74bfe93abb3e7e1599a1bda40f0c9483`. Esto resuelve la navegación y el cálculo de la simulación; **no implementa un retiro on-chain**. No hay tesorería, cotización/gas de retiro ni servicio de pago saliente. |

### Firebase CLI y persistencia

Tras la autorización del usuario, Firebase CLI pudo enumerar el proyecto `salad-miners` y consultar su base Firestore `(default)` en `nam5`. Esta lectura no desplegó ni modificó recursos en este recorrido. El estado remoto de Auth anónimo y las reglas restringidas ya se documentó en la sección anterior; `functions:list` sigue fallando con un error genérico, que no demuestra si hay Functions remotas. La sincronización configurada guarda únicamente estado local de usuario bajo `users/{uid}/demoState/current`; no es un backend de cobros ni de retiros.

El cambio visible de etiquetas y el manejo de la solicitud local pasan `npm run build` (`tsc -b && vite build`). Sigue el aviso de Rollup por el chunk de Solana de aproximadamente 695.66 kB. La matriz funcional general queda en **70/77**: estos casos de cierre de bugs son una verificación adicional y no se suman retroactivamente a sus 77 casillas.

### Pendiente para declarar los bugs cerrados en producción

- Probar conexión, rechazo y regreso con extensiones reales, incluida Trust Wallet y una wallet móvil; esta auditoría solo ejecutó fixtures QA.
- Probar el enlace de MetaMask desde un teléfono con el dominio HTTPS final.
- Para retiro real hacen falta un saldo pagadero verificado, reglas y reserva de tesorería, cotización/fee, transacción saliente, confirmaciones, idempotencia y recibo conciliado. La comisión editable de la vista actual solo afecta la simulación.
- La persistencia Firebase no verifica pagos ni activa productos. No se debe interpretar una transferencia entrante como compra completada.

## Resultado del handoff reportado en Android · 2 de noviembre

El usuario confirmó que al pulsar conectar MetaMask solo aparece la pantalla principal de la wallet; Trust Wallet también abre su pantalla principal sin mostrar permiso. El flujo ocurrió desde el enlace ngrok. Esto no es una conexión ni un rechazo: no se obtuvo dirección y no se creó solicitud de pago.

- Verifiqué por HTTP el host ngrok que está usando el proyecto. Sin encabezado, `/gmt-wallets` responde `200 text/plain` con la pantalla intermedia de ngrok. Con `ngrok-skip-browser-warning: 1`, responde `200 text/html` con título `GoMining · réplica local`. Probé también `?ngrok-skip-browser-warning=1` y `?ngrok-skip-browser-warning=true`; ambos siguen devolviendo la pantalla intermedia. El navegador de la wallet abre el enlace sin poder añadir la cabecera; por eso esa URL no es adecuada para probar el navegador DApp. Esto confirma un bloqueo del host para cargar la página dentro de la wallet; no demuestra por sí solo por qué MetaMask Connect no presentó su solicitud nativa.
- El Quick Tunnel HTTPS ya activo (`https://luis-reach-award-publicity.trycloudflare.com/gmt-wallets`) respondió `200 text/html` y el título de la réplica sin encabezados especiales durante esta revisión. Es un enlace temporal, no el dominio definitivo.
- El flujo en código mantiene dos rutas: MetaMask Connect llama `client.connect()` para solicitar la dirección mediante el handoff del SDK; el enlace alternativo `link.metamask.io/dapp/{dappUrl}` solo abre la réplica dentro del navegador de MetaMask, donde se debe tocar **Conectar**. Trust Wallet `open_url` también abre su navegador DApp; el permiso se pide después al tocar **Conectar** dentro de esa página. Abrir la wallet no autoriza una cuenta.
- Se evita esperar hasta 1.5 s por descubrimiento EIP-6963 antes del handoff MetaMask, se precarga el SDK y se mantiene un enlace alternativo al navegador DApp. Si la solicitud queda pendiente, Carteras permite cancelar el intento y muestra cómo abrir la dapp en el navegador integrado. Carteras y checkout indican que el host ngrok gratuito muestra una pantalla intermedia. No se añadió WalletConnect ni Project ID.
- REA hizo una captura controlada con Chromium temporal en viewport de 390 × 844 px: el listado de las siete wallets y sus estados informativos se renderizó; la escena terminó con `terminated-owned-process`. DOM/accesibilidad: `ev_5b424d0a89fc132caddddfb793110bd2b003d1c898828570e65539b744508a24`; captura visual: `ev_dcaaca7f9225bd4e69e75895b0159b6e27f055f2c0a6af28ccda1f9553931eb2`. Es una revisión web de viewport estrecho; no simula la app ni el proveedor móvil.
- `npm run build` pasó: TypeScript y Vite compilaron 566 módulos. Sigue el aviso no bloqueante por el chunk Solana de 695.66 kB; `git diff --check` no encontró errores de whitespace.

La casilla de handoff móvil sigue abierta hasta ver la solicitud de conexión y comprobar aceptar, rechazar y regreso en un teléfono. No se firmó ni transfirió durante esta revisión. Para la prueba física, abre primero el Quick Tunnel HTTPS temporal. Si MetaMask vuelve a dejarte en su pantalla principal, regresa a la réplica y toca **Alternativa · abrir este checkout en MetaMask**; dentro de su navegador toca **Conectar MetaMask**. En Trust Wallet, entra por el enlace de apertura y toca **Conectar** solo cuando veas la réplica.

### Ajuste previo después del reporte de MetaMask y Trust · corte sustituido

- El usuario volvió a probar desde ngrok y reportó el mismo resultado: MetaMask y Trust Wallet solo muestran su pantalla principal. No hay una dirección conectada ni una solicitud que podamos marcar como aceptada o rechazada.
- La inspección de interfaz con navegador integrado mostró el estado sin conexión, los siete conectores y sus instrucciones visibles. La evidencia REA disponible es el recorrido anterior `ev_5b424d0a89fc132caddddfb793110bd2b003d1c898828570e65539b744508a24` más su captura `ev_dcaaca7f9225bd4e69e75895b0159b6e27f055f2c0a6af28ccda1f9553931eb2`; esa captura verifica la réplica en viewport de 390 × 844 px, no el comportamiento de las apps móviles.
- A partir de la documentación oficial, Trust usa ahora `trust://open_url` como ruta directa cuando la app está instalada, con `https://link.trustwallet.com/open_url` de alternativa. Ambas abren el navegador DApp; el comprador debe ver la réplica y tocar **Conectar** antes de recibir un permiso. El flujo móvil de Trust desde un navegador externo requiere WalletConnect v2, que no se habilitó porque necesita un Project ID.
- Volví a comprobar el host ngrok: `https://sprinkler-wooing-graceful.ngrok-free.dev/gmt-wallets` devuelve `200 text/plain` con el aviso; el Quick Tunnel `https://luis-reach-award-publicity.trycloudflare.com/gmt-wallets` devuelve `200 text/html` y el título de la réplica sin cabeceras especiales. Para el teléfono, abre el Quick Tunnel desde el navegador interno de MetaMask/Trust o prueba su enlace de aplicación; no uses el ngrok con intersticial.
- MetaMask Connect ya está precargado en Carteras y checkout antes del toque. La documentación oficial cubre el handoff móvil; no explica el resultado específico observado en este dispositivo. No cambio el protocolo principal sin una captura de URL/logs de la app o prueba desde un dominio sin intersticial.
- `npm run build` pasó después del cambio de ruta Trust (TypeScript y Vite, 566 módulos). El aviso por el chunk de Solana de 695.66 kB sigue sin bloquear la build.

Los datos de esa prueba no eliminan el pendiente móvil. Siguen faltando prompt, aceptar/rechazar y regreso de una wallet real; no se aprobó un envío. El checklist se mantiene en 70/77, con siete comprobaciones abiertas.

## Actualización tras el último reporte móvil · 2-nov-2026

El usuario confirmó que MetaMask y Trust Wallet solo muestran su pantalla principal al probar el enlace ngrok. La lectura HTTP repetida durante esta revisión volvió a distinguir dos respuestas: el host gratuito `sprinkler-wooing-graceful.ngrok-free.dev` responde `200 text/plain` con su intersticial; el Quick Tunnel `https://luis-reach-award-publicity.trycloudflare.com/gmt-wallets` responde `200 text/html` con el título de la réplica. Eso hace que ngrok sea una causa probable del bloqueo de carga, pero no prueba que sea la única.

Se corrigió el flujo local:

- `mobileTargetCanOpenWallet()` rechaza los dominios ngrok gratuitos para el handoff móvil. El panel y el checkout dejan de abrir enlaces que llegan primero a la pantalla intermedia.
- En móviles, si MetaMask no inyectó su proveedor EIP-1193, `walletSession` ya no recurre a MetaMask Connect/relay. Busca el proveedor del navegador DApp y, si no existe, muestra instrucciones en lugar de volver a abrir la app sin un prompt.
- MetaMask Connect permanece disponible en escritorio. Trust Wallet sin WalletConnect requiere abrir la réplica dentro de su navegador DApp y tocar **Conectar**; no usa Project ID.
- El gesto de conexión queda separado del pago: **Conectar** solo solicita la dirección pública. El envío requiere una acción y aprobación aparte en la wallet.

`npm run build` pasó con TypeScript y Vite (566 módulos); sigue el aviso no bloqueante de Rollup por el chunk Solana de 695.66 kB. `git diff --check` no encontró whitespace inválido. La evidencia REA previa confirma la interfaz web a viewport estrecho, pero no hay un teléfono/wallet móvil conectado a REA y no generé evidencia de prompt real en esta actualización. La conexión, rechazo y regreso móviles siguen pendientes. El checklist permanece en **70/77**, con **7 pendientes**; no se aumentó el conteo por un cambio que aún no se ha probado en teléfono.

Para una nueva prueba, usar la URL temporal [Carteras en Quick Tunnel](https://luis-reach-award-publicity.trycloudflare.com/gmt-wallets), no el ngrok gratuito. En MetaMask, abrir el navegador DApp y tocar **Conectar** una vez que cargue la réplica. En Trust Wallet, abrir su navegador DApp, cargar esa misma URL y tocar **Conectar**. El Quick Tunnel es público y puede cambiar al reiniciar el túnel.

## Corrección de handoff móvil después de confirmar que abren la pantalla principal · 2-nov-2026

El usuario volvió a comprobar la app desde ngrok: MetaMask abre su pantalla principal y no muestra solicitud; Trust Wallet también deja solo su inicio. No se conectó ninguna dirección. La respuesta intermedia de ngrok continúa siendo la explicación conocida para la carga de la réplica dentro de navegadores DApp, pero no prueba por sí sola por qué MetaMask Connect no mostró su solicitud.

### Cambios aplicados

- MetaMask móvil vuelve a usar `@metamask/connect-evm`: al pulsar **Conectar**, si no hay proveedor inyectado, se llama `client.connect({ chainIds, forceRequest: true })`. Se eliminó el error que cancelaba el flujo móvil sin proveedor. En teléfonos con HTTPS, el cliente se precarga sin pedir permiso; además se omite la espera de hasta 1.5 s por anuncios EIP-6963 antes de invocar el conector. El resultado se restaura desde el mecanismo de sesión del SDK y un marcador local no sensible.
- MetaMask Connect conserva redes RPC públicas configuradas en `api.supportedNetworks` y usa `mobile.useDeeplink: false` para seleccionar el enlace HTTPS del flujo Connect/MWP. No se usa WalletConnect Project ID. La conexión solo solicita la cuenta; el checkout aún pide una aprobación de transacción separada.
- Coinbase Wallet usa ahora `@coinbase/wallet-sdk@4.4.0`. Si el navegador no inyecta el proveedor, se crea un proveedor EIP-1193 con metadatos de la aplicación y las redes Ethereum, BNB Chain y Polygon. Su Project ID no se solicita; no se añade WalletConnect.
- Trust Wallet ahora prioriza `https://link.trustwallet.com/open_url` y conserva `trust://open_url` como alternativa. Ambos enlaces abren el navegador DApp, no la autorización. Sin WalletConnect, que en el flujo externo requiere Project ID, la web debe cargarse dentro del DApp browser y el usuario debe pulsar **Conectar** ahí.
- Carteras y checkout distinguen MetaMask Connect/Coinbase SDK de las wallets que requieren cargar la web dentro de su DApp browser. El aviso ngrok aclara que el intersticial puede impedir la carga directa. No se habilitó bypass por query ni se guardó un identificador de wallet.

### Verificación y límites

- `npm run build` terminó con TypeScript y Vite: 945 módulos. Rollup mantiene el aviso existente del chunk Solana de 695.66 kB. `git diff --check` se ejecutó después de actualizar la documentación.
- La compilación valida importaciones y tipos; no demuestra que la solicitud de conexión aparezca en MetaMask o Trust Wallet. No se dispuso de un teléfono conectado ni se aprobaron pagos.
- REA/Linux no produjo evidencia nueva: el intento anterior comunicó `execution_failure` y `cleanup_incomplete` sin captura utilizable. Como no se obtuvo confirmación de limpieza/liberación de la sesión temporal, no se inició otra captura. Se conserva la evidencia REA anterior de `/gmt-wallets` a 390 × 844 px, que no prueba las apps móviles.
- La matriz funcional permanece en **70/77, siete pendientes**. En este grupo permanecen abiertos: pruebas de proveedores reales; MetaMask/Trust en móvil; recibo de una transferencia real; cotización Bridge/minimos/fees actuales; tokens adicionales con ruta confirmada; KYC/eligibilidad de terceros; backend de órdenes y conciliación.

### Protocolo físico de comprobación posterior

1. Abre la aplicación en un dominio HTTPS que entregue el HTML de la réplica directamente. El ngrok gratuito documentado responde con texto intermedio sin la cabecera de omisión; no sirve para validar el navegador DApp de Trust.
2. Para MetaMask, desde **Carteras** o el checkout pulsa **Conectar con MetaMask** y comprueba que la solicitud aparezca en la app. Acepta, confirma que la dirección vuelve a la réplica y desconecta; repite rechazando. Conectar no debe mostrar una solicitud de firma o pago.
3. Para Trust Wallet, abre su navegador DApp, carga `/gmt-wallets` o el checkout, y pulsa **Conectar** dentro de esa página. Abrir el inicio de Trust desde un navegador externo no completa el flujo sin WalletConnect.
4. Para Coinbase Wallet, repite desde HTTPS en un teléfono que tenga la app. Para Solflare, Phantom y TronLink revisa sus respectivos handoffs; para UniSat móvil no hay proveedor web documentado. No apruebes transferencias de Mainnet como parte de la prueba de conexión.

Fuentes primarias consultadas: [MetaMask Connect EVM](https://docs.metamask.io/metamask-connect/evm/), [Coinbase Wallet SDK](https://github.com/coinbase/coinbase-wallet-sdk), [Trust Wallet deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) y [Trust Wallet Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

### Resultado tras la respuesta del usuario: solo aparece la pantalla principal · 2-nov-2026

El usuario precisó que MetaMask y Trust Wallet abren solo la pantalla principal cuando parte del enlace ngrok. El resultado se clasifica como **handoff de aplicación sin autorización**; no hay dirección conectada, solicitud Connect observada, firma ni pago. Abrir una wallet no equivale a conectar.

| Comprobación | Resultado actual | Qué demuestra | Límite |
|---|---|---|---|
| Ngrok gratuito | HTTP `200`, `text/plain`, inicio “You are about to visit…” | La dirección pública no entrega directamente el HTML de la réplica al navegador de la wallet. | No prueba que sea la única causa de MetaMask; sí impide verificar Trust DApp Browser desde ese host. |
| Quick Tunnel | HTTP `200`, `text/html`, título `GoMining · réplica local` en `/gmt-wallets` | Hay una URL temporal que sirve el shell directamente en esta revisión. | No se probó desde un teléfono; no garantiza que el túnel siga activo luego. |
| MetaMask en ngrok | Se bloqueó el intento Connect móvil en el host gratuito | Evita abrir MetaMask desde una página que no puede completar el retorno sin el intersticial. | En otro HTTPS aún debe aparecer el permiso; el cambio no se ha probado en el dispositivo. |
| MetaMask con HTTPS directo | MetaMask Connect está habilitado; la alternativa `/dapp/` abre la página dentro del navegador de MetaMask | El flujo pide la conexión desde el proveedor del navegador interno después del toque en **Conectar**. | El SDK puede abrir la app sin mostrar prompt; falta aceptar/rechazar y comprobar retorno en teléfono. |
| Trust Wallet | `open_url` está destinado a abrir una URL en el navegador DApp; conectar requiere después `eth_requestAccounts` desde el proveedor inyectado | El deeplink de apertura no es una autorización. | Sin Project ID no se usa WalletConnect; falta probar Android/iOS dentro del navegador de Trust. |

Fuentes oficiales actuales: MetaMask Connect declara compatibilidad con la app móvil y un proveedor EIP-1193 ([EVM Connect](https://docs.metamask.io/metamask-connect/evm/)); su guía muestra `connect()` para recibir las cuentas ([administrar cuentas](https://docs.metamask.io/metamask-connect/evm/guides/manage-user-accounts/)). El deeplink `/dapp/{dappUrl}` abre la página en el navegador de MetaMask, no una aprobación de pago ([deeplinks](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/)). Trust distingue el deeplink `open_url` del deeplink WalletConnect ([deep linking](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [WalletConnect móvil](https://developer.trustwallet.com/developer/develop-for-trust/mobile)).

Se ajustó `src/WalletPanel.tsx` y `src/WalletPaymentCheckout.tsx`: `mobileTargetCanOpenWallet()` ahora también condiciona MetaMask Connect, y el CTA del checkout indica que se debe abrir un HTTPS directo cuando detecta ngrok gratuito. `npm run build` y `git diff --check` pasaron después del cambio. La compilación valida el código y tipos, no el comportamiento en el teléfono.

No se produjo Evidence REA nueva en esta revalidación. El intento anterior dejó `cleanup_incomplete` sin una confirmación del dueño de la captura temporal; la guía REA exige no iniciar otra captura que use esos recursos hasta confirmar su liberación. La llamada de inventario de destinos REA tampoco alcanzó el endpoint local de depuración, así que no aporta evidencia del teléfono. Se conservan las capturas REA existentes de viewport móvil y fixtures; no acreditan el prompt de MetaMask/Trust. El checklist queda en **70/77**; siguen los siete pendientes que se detallan en “Siete comprobaciones que siguen pendientes”.


## Corrección del handoff móvil tras el reporte de pantalla principal · 2-nov-2026

El usuario confirma que MetaMask y Trust Wallet abren solo la pantalla principal desde su enlace ngrok. Esto no es una conexión: no aparece dirección autorizada, no hay solicitud Connect observada y no se produjo firma ni transferencia.

### Hallazgos de código y cambios

- La configuración instalada de MetaMask Connect usaba **mobile.useDeeplink: true**. En la versión instalada del SDK, true fuerza la URI metamask://; el README oficial documenta que false usa Universal Links. Se cambió a false para el flujo móvil. MetaMask Connect documenta que el cliente EVM maneja el handoff móvil y solicita acceso al pulsar connect ([documentación de MetaMask](https://docs.metamask.io/metamask-connect/), [README del SDK](https://github.com/MetaMask/connect-monorepo/tree/main/packages/connect-evm)).
- Trust Wallet priorizaba el esquema trust://open_url. Su documentación admite ambos esquemas y ejemplifica primero https://link.trustwallet.com/open_url para abrir una URL dentro del navegador DApp. Se pasó el Universal Link HTTPS a la acción principal y el esquema nativo al enlace alternativo ([deeplinks oficiales de Trust Wallet](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking)).
- Se permite iniciar enlaces desde cualquier URL pública HTTPS, incluido ngrok. Esto no elimina ni sortea el aviso de ngrok. Si el navegador DApp muestra “Visit”, la persona debe aceptarlo para que cargue la réplica; luego debe pulsar Conectar. La UI ya explica que abrir la app no conecta la wallet.

### Comprobaciones de este corte

- Reconsulté el dominio ngrok con un User-Agent móvil: devolvió HTTP 200 y text/plain, con el texto “You are about to visit”; no contenía el HTML de la réplica. La documentación oficial de ngrok confirma que el plan gratuito antepone ese aviso al tráfico HTML de navegador y que pulsar Visit guarda una cookie por siete días. Las solicitudes programáticas reciben un trato distinto; por eso un HEAD/curl sin User-Agent móvil no demuestra qué verá la wallet ([límites oficiales del plan gratuito de ngrok](https://ngrok.com/docs/pricing-limits/free-plan-limits)).
- npm run build pasó con TypeScript y Vite: 945 módulos. Persiste el aviso no bloqueante de Rollup por el chunk Solana de 695.66 kB. git diff --check terminó sin errores de whitespace.
- Intenté analizar estáticamente los cuatro módulos cambiados con REA, pero la llamada quedó sin respuesta utilizable y se canceló. No se generó Evidence nueva. Tampoco inicié una captura REA de navegador: sigue pendiente resolver el dueño/liberación del perfil que dejó cleanup_incomplete en el intento anterior.
- La compilación y el análisis local no prueban el prompt de la app móvil. MetaMask y Trust aún deben validarse en un teléfono, incluyendo aceptar, rechazar, regreso a la réplica y estado sin firma.

Esta actualización sustituye las notas anteriores que deshabilitaban ngrok para MetaMask o que priorizaban el esquema trust://. No cambia el total: **70/77; siete pendientes**, enumerados en “Siete comprobaciones que siguen pendientes”.

## Revisión documental de handoff para las siete wallets · 2-nov-2026

### Matriz de flujo

| Wallet | Qué hace realmente el enlace móvil | Qué muestra el permiso | Estado de implementación |
| --- | --- | --- | --- |
| MetaMask | MetaMask Connect `client.connect()` solicita la cuenta mediante su integración móvil; `/dapp/{url}` abre el navegador interno y requiere pulsar Conectar en el sitio. | El permiso de acceso se espera en la app al usar Connect o desde el proveedor inyectado en DApp Browser. No significa aprobación del pago. | SDK instalado y `mobile.useDeeplink: false` para Universal Links. Usuario reporta que en ngrok solo ve el inicio de la app. No confirmado en dominio sin intersticial ni teléfono. |
| Coinbase Wallet | El código conserva un SDK EIP-1193 heredado; la documentación vigente recomienda `@base-org/account` hasta que esté listo el SDK de nueva generación. | La solicitud de cuenta es distinta de aprobar una transferencia. | Conector heredado integrado; sin prueba móvil ni migración al SDK recomendado. |
| Trust Wallet | `open_url` abre la réplica en DApp Browser; el sitio debe cargar y llamar `eth_requestAccounts` tras un toque. WalletConnect v2 es el flujo de enlace directo desde navegador externo. | En DApp Browser, la solicitud del proveedor EIP-1193 pide compartir la dirección. | `open_url` / `trust://` están disponibles en host compatible; desde ngrok la apertura automática queda pausada. El enlace WalletConnect requeriría `projectId` y no se habilita. |
| Solflare | `/ul/v1/connect` abre una solicitud cifrada y devuelve `public_key` más `session` al `redirect_link`. | Prompt nativo de acceso en Solflare. | Integración cifrada implementada; teléfono sin validar en este corte. |
| Phantom | `/ul/v1/connect` requiere URL pública, clave efímera y retorno; al aprobar entrega `public_key` y `session` cifrados. | Prompt nativo de acceso en Phantom. | Integración cifrada implementada; teléfono sin validar en este corte. |
| TronLink | `action: "open"` carga una dapp en DApp Explorer, sin autorizar por sí sola. `action: "login"` solicita dirección y devuelve callback correlacionado. | Con proveedor de navegador, el permiso aparece tras `eth_requestAccounts`. El deeplink `login` requiere callback HTTPS y `actionId`. | Implementada la apertura de DApp con `action:open`; el login con callback no está implementado. |
| UniSat | La extensión expone `window.unisat` y requiere toque explícito. La app móvil también documenta `unisat://request?method=connect...` y devuelve `unisat://response?...&nonce=...`. | La app solicita permiso; al aprobar o rechazar devuelve un deeplink con el mismo nonce. | La extensión sí es compatible con navegador web. El deeplink móvil existe, pero su respuesta no es un callback HTTP y esta SPA no tiene app nativa/callback para recibirlo; sigue sin integración móvil. |

### Efecto de ngrok y corrección local

Con User-Agent Android, `https://sprinkler-wooing-graceful.ngrok-free.dev/gmt-wallets` devolvió HTTP 200, `text/plain` y el intersticial “You are about to visit”, no el HTML de la réplica. En el mismo chequeo, el Quick Tunnel `https://luis-reach-award-publicity.trycloudflare.com/gmt-wallets` entregó HTTP 200 `text/html` con la aplicación. Esta es evidencia HTTP del host, no del comportamiento de una wallet real.

El código permitía los handoffs ngrok aunque el informe anterior decía que ya los bloqueaba. Se corrigió `mobileTargetCanOpenWallet()` para excluir dominios ngrok gratuitos y se actualizaron Carteras/checkout: ahora informan que el handoff está pausado, explican que abrir la pantalla principal no conecta y copian la URL para carga manual en el navegador DApp. En un HTTPS sin intersticial, MetaMask Connect y los demás flujos documentados siguen disponibles. La URL Quick Tunnel es pública y temporal; no sustituye un dominio oficial.

Fuentes primarias: [MetaMask Connect](https://docs.metamask.io/metamask-connect/), [Trust Wallet Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile), [Trust deeplinks](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Coinbase Wallet SDK](https://github.com/coinbase/coinbase-wallet-sdk), [Solflare Connect](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect), [Phantom Connect](https://docs.phantom.com/phantom-deeplinks/provider-methods/connect), [TronLink deeplinks](https://docs.tronlink.org/mobile/deeplink/) y [UniSat Wallet API](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet).

No se creó Evidence REA nueva. El intento anterior dejó `cleanup_incomplete` y no confirmó liberación del perfil temporal; no se repitió la captura. Computer Use permitió revisar la UI web local, y las fuentes oficiales permiten caracterizar los contratos de deep link; ninguna de esas comprobaciones demuestra prompt/aceptación/rechazo/retorno en teléfono. El checklist permanece **70/77, siete pendientes**.

## Resultado de la última interacción móvil reportada · 2-nov-2026

El usuario indicó que, al pulsar para conectar desde el enlace ngrok, tanto MetaMask como Trust Wallet muestran solo la pantalla principal de la wallet. No apareció ningún prompt, no se compartió una dirección y no hubo firma ni pago. Se registra **fallo observado en la combinación teléfono + ngrok**, no se marca como conexión exitosa.

Interpretación por wallet:

- **MetaMask:** MetaMask Connect documenta conexión móvil mediante deeplink/Mobile Wallet Protocol. MetaMask también recomienda usar su navegador incorporado si otros navegadores no conectan dapps. El siguiente camino para distinguir un problema del SDK de uno del navegador es abrir la URL dentro de MetaMask (**Explorar → icono de navegador**), esperar que cargue la réplica y tocar **Conectar**. El resultado del usuario no confirma que la ruta del navegador integrado se haya intentado.
- **Trust Wallet:** el enlace `open_url` abre una URL dentro del DApp browser; abrir la app o su inicio no concede permisos. Como el requisito de producto excluye WalletConnect Project ID, el usuario debe navegar al sitio desde el navegador DApp de Trust y tocar **Conectar** en la página cargada.
- **Ngrok gratuito:** la verificación HTTP previa encontró una página intermedia antes del HTML de la réplica. Por eso un handoff a la app que no cargue la URL no puede mostrar el prompt del proveedor. La app se actualizó para explicar el recorrido manual y distinguir apertura de wallet, conexión y aprobación de pago.

### Resultado y estado del checklist

- MetaMask móvil desde ngrok: **falló**, sin permiso ni cuenta observados.
- Trust Wallet móvil desde ngrok: **falló**, sin DApp cargada ni permiso observado.
- MetaMask dentro de su navegador DApp y Trust dentro de su navegador DApp: **pendiente de probar**.
- Conexión en un dominio HTTPS sin intersticial, aceptación/rechazo, retorno de dirección, y prompts de Coinbase/Solflare/Phantom/TronLink: **pendientes**.

El total de la matriz sigue en **70/77** porque estas pruebas externas no se deben marcar completas sin ver los prompts y el regreso en dispositivo. La guía oficial de MetaMask recomienda su navegador móvil integrado cuando otros navegadores no conectan dapps ([MetaMask Mobile browser](https://support.metamask.io/configure/wallet/how-to-use-the-metamask-mobile-browser/)); MetaMask Connect documenta el handoff desde el navegador móvil ([MetaMask Connect](https://docs.metamask.io/metamask-connect/)). No se generó Evidence REA nueva: el perfil temporal del intento anterior sigue sin liberación confirmada, así que no se repitió la captura.

## Corrección de acciones móviles tras reporte del usuario · 2-nov-2026

El usuario confirmó que, al usar ngrok, MetaMask y Trust Wallet solo muestran su pantalla principal. No apareció permiso, no se compartió dirección y no hubo firma ni pago.

- **MetaMask:** el control de disponibilidad pausa el handoff en dominios ngrok gratuitos conocidos, que interponen una página de visita. `client.connect()` queda disponible en un HTTPS que entrega la réplica directamente. `/dapp/` solo abre el navegador interno; no autoriza la cuenta ([plataformas compatibles](https://docs.metamask.io/metamask-connect/supported-platforms/), [deeplink DApp](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/)).
- **Trust Wallet:** el enlace primario es el Universal Link `https://link.trustwallet.com/open_url`; `trust://open_url` queda como alternativa. Ambos navegan al navegador DApp, y la cuenta se autoriza solo después de cargar la réplica y tocar **Conectar**. WalletConnect desde otro navegador requeriría un Project ID y sigue excluido ([deeplinks oficiales](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [WalletConnect móvil](https://developer.trustwallet.com/developer/develop-for-trust/mobile)).
- **Ngrok:** el código no intenta saltarse el intersticial del plan gratuito. Si el navegador DApp recibe la página de aviso en lugar del HTML de la réplica, no habrá proveedor inyectado ni solicitud de conexión. MetaMask también recomienda probar en su propio navegador cuando un navegador móvil externo no conecta ([ayuda de MetaMask](https://support.metamask.io/configure/wallet/how-to-use-the-metamask-mobile-browser/)).
- **Build:** `npm run build` pasó con TypeScript/Vite; se conserva el aviso no bloqueante por el chunk Solana de 695.66 kB.
- **Handoff y URL:** la prueba HTTP actual encontró que ngrok responde `HTTP 200 text/plain` con `ERR_NGROK_6024`; el Quick Tunnel temporal responde `HTTP 200 text/html` y el título `GoMining · réplica local`. Se bloquea el handoff automático de las wallets probadas sobre el dominio ngrok y se sugiere usar un HTTPS sin intersticial.
- **REA/Computer Use:** no se creó una captura REA nueva porque el perfil anterior sigue con `cleanup_incomplete` sin liberación confirmada. El análisis estático de cinco fuentes venció el límite del cliente a los 450 s y no devolvió Evidence; no se repitió la llamada sin resultado. El control de Brave devolvió dos veces `window id 4720744 was not found`; siguiendo su recuperación, no se repitió ni se actuó sobre la wallet.

La matriz conserva **70/77, siete requisitos abiertos**. Las casillas duplicadas de los addenda se consolidaron: ahora hay siete casillas `[ ]` únicas en el checklist. Los flujos de aceptación/rechazo y regreso de MetaMask/Trust en teléfono permanecen abiertos junto con los otros seis requisitos enumerados arriba.

## Interacción móvil reportada y revalidación REA · 2-nov-2026

El usuario reportó que MetaMask y Trust Wallet, abiertas desde ngrok, muestran solo su pantalla principal. No apareció solicitud de conexión, no volvió dirección y no se firmó ni envió nada. Este es un fallo observado en ese dispositivo y ese host; no demuestra el comportamiento en dominio oficial.

Comprobación HTTP de solo lectura de esta revisión: la URL ngrok `https://sprinkler-wooing-graceful.ngrok-free.dev/gmt-wallets` respondió HTTP 200 con `text/plain` y el texto “You are about to visit…”, no con el HTML de la réplica. El túnel Quick de Cloudflare `https://luis-reach-award-publicity.trycloudflare.com/gmt-wallets` respondió HTTP 200 con `text/html`. Esto confirma que el enlace ngrok consultado entrega una pantalla intermedia antes de la app. Ngrok documenta que los endpoints HTTP/S gratuitos muestran una advertencia que el visitante debe aceptar ([documentación de ngrok](https://ngrok.com/blog/free-static-domains-ngrok-users)). La guía de Trust Wallet define `open_url` como apertura de una URL en su navegador DApp; la conexión ocurre cuando el DApp cargado solicita acceso al proveedor ([deep links de Trust Wallet](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [optimización para Trust Wallet](https://developer.trustwallet.com/developer/listing-guide/mobile-optimize)).

El enlace alternativo de MetaMask a su navegador DApp ahora se oculta en hosts ngrok gratuitos. En esa condición, el botón de conexión directa sigue bloqueado y Carteras/checkout explican que hay que copiar la URL y abrirla manualmente dentro del navegador de MetaMask. Trust Wallet también requiere cargar la página en su navegador DApp y tocar **Conectar**; `open_url` solo abre la página. La integración no intenta saltarse el aviso de ngrok.

REA ejecutó una captura controlada nueva después de confirmar `cleanup_pending: false`. Chromium temporal cargó `/gmt-wallets` a 390 × 844 px con perfil vacío; la captura esperó la primera tarjeta de wallet y conservó screenshot, DOM y accesibilidad: `ev_536edf81046fe338e1535541ad1de0ac9332d298485dbd8c2cdde6c64c24aef1`. El proceso terminó con `terminated-owned-process`. La evidencia muestra la UI web responsive y mensajes sin conexión; no tenía MetaMask, Trust ni otro proveedor real y no ejercitó autorización o pago. Una captura anterior de esta misma revisión clicó el botón que inicialmente decía **Ocultar carteras**, por lo que lo colapsó antes de esperar; esa ejecución no se usa para validar el conector.

Se amplió en la guía la investigación de WalletConnect, Keplr, xDeFi/Ctrl y Safe, además de las wallets ya implementadas. Trust confirma que su integración WalletConnect móvil requiere `projectId`; sin ID se usa su navegador DApp. Keplr es Cosmos y no encaja con destinos actuales. Safe requiere una app dentro del contexto Safe, y xDeFi/Ctrl no se añade hasta validar su API por cadena. No quedó verificada la cifra “USD 89 sobre 500 usuarios” de WalletConnect.

La matriz base conserva **70/77, siete comprobaciones abiertas**. Consulta la [matriz de carteras](./gomining-replica-guide.md#matriz-extendida-de-carteras-sin-walletconnect--2-nov-2026) y el [checklist](./gomining-replica-checklist.md). La captura REA no sustituye la prueba en un teléfono real.

## Complemento documental de carteras y confirmación del usuario · 2-nov-2026

El usuario volvió a confirmar que el enlace ngrok solo abre Inicio en MetaMask/Trust. No se recibe cuenta, prompt, firma ni transacción. La advertencia intermedia de ngrok es una causa probable, dado que el host consultado devuelve `text/plain` en vez del HTML de la réplica; no se afirma causalidad confirmada sin probar el flujo dentro de la app.

| Opción investigada | Hallazgo vigente | Decisión para la réplica |
| --- | --- | --- |
| MetaMask | La documentación recomienda el navegador DApp de la wallet cuando navegadores externos no conectan. La integración `client.connect()` está implementada, pero no funcionó en el host ngrok informado. | No considerar conectado si solo abre Inicio. Para probar la integración móvil real se requiere HTTPS directo, sin intersticial, y retorno de cuentas. |
| Trust Wallet | `open_url` navega al DApp Browser; la cuenta requiere proveedor inyectado y toque del usuario. WalletConnect v2 desde otro navegador requiere Project ID. | Sin ID: abrir la URL dentro del navegador DApp, cargar la aplicación y tocar **Conectar**. |
| UniSat | Existe deeplink móvil oficial, pero el retorno documentado es `unisat://response?...&nonce=...`; la API web de extensión utiliza `window.unisat`. | La extensión web puede conectarse. El retorno móvil no está integrado porque esta SPA no recibe el esquema nativo. |
| xDeFi / CTRL | El adaptador Via usa `window.xfi.ethereum` y extiende su integración a BTC; CTRL confirma la migración de la extensión XDEFI. | Candidato para conector EVM/BTC de escritorio sin Project ID; sigue fuera de la interfaz hasta validar el proveedor y los métodos exactos para las redes cobrables. Móvil no probado. |
| Keplr | Incluye navegador DApp móvil, pero está orientado a redes Cosmos; los ejemplos de Via cubren Cosmos/Osmosis/Astar. | No aplica a las redes y destinos aceptados por el checkout. |
| Safe | Via crea un Safe Apps provider dentro de `iframe`/Safe App context. | No es botón genérico de conexión; no integrar en navegador externo como cartera normal. |
| Coinbase | Coinbase actualmente recomienda `@base-org/account` hasta que esté listo su nuevo SDK; esta réplica mantiene el SDK EIP-1193 heredado. | El conector existe pero migración y handoff móvil quedan pendientes de validar. |
| WalletConnect/Reown | Starter es gratis; 500 MAU se publica para Auth/SIWX o wallets embebidas, y los MAU autocustodiados aparecen como dentro de límites aceptables. Reown Terms también fija umbral de licencia de 2.5 M RPC o 500 MAU según la definición del SDK. Pro cuesta USD 89/mes o USD 890/año; Multi-wallet Linking está en Pro. | La cifra no significa un límite universal de 500 wallets autocustodiadas. El flujo sigue excluido por Project ID y por la preferencia de no crear IDs. |

Fuentes: [MetaMask Connect](https://docs.metamask.io/metamask-connect/evm/guides/manage-user-accounts/), [MetaMask Mobile Browser](https://support.metamask.io/es/configure/wallet/how-to-use-the-metamask-mobile-browser/), [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Trust Mobile WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile), [UniSat mobile connect](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet/connect-with-unisat-mobile-wallet), [Coinbase current docs](https://docs.cdp.coinbase.com/coinbase-wallet/overview), [Via connector source](https://github.com/viaprotocol/web3-wallets/blob/main/src/context/WalletProvider.tsx), [Via networks](https://github.com/viaprotocol/web3-wallets/blob/main/src/networks.ts), [CTRL](https://ctrlwallet.to/), [Keplr browser](https://help.keplr.app/mobile-app/5R3bMyjtr3iKzMhqyCqu56/explore-dapps-with-keplr-mobile%E2%80%99s-browser/), [Safe Apps](https://docs.safe.global/home/glossary), [Reown pricing](https://reown.com/pricing) y [Reown Terms](https://reown.com/terms-of-service).

La interfaz se actualizó para describir el retorno móvil real de UniSat sin prometer conexión. La captura REA `ev_536edf81046fe338e1535541ad1de0ac9332d298485dbd8c2cdde6c64c24aef1` sigue siendo una vista Chromium 390 × 844 px con perfil vacío; no prueba esta nueva copia ni el prompt en wallet. No se abre otra app ni se hace una transferencia real durante la auditoría documental. La matriz funcional permanece en **70/77; 7 pendientes**.

## Revalidación final tras la respuesta móvil · 2-nov-2026

El usuario confirma que MetaMask y Trust Wallet muestran únicamente su pantalla principal al abrirlas desde ngrok. Esto verifica el fallo del handoff reportado, pero no revela la causa exacta en el teléfono: no apareció una solicitud, no se devolvió una dirección y no hubo firma ni transferencia. El intersticial del host ngrok consultado es una causa probable, no una causa comprobada mediante repetición física.

El sitio no marca la wallet conectada solo porque la app se abrió. En dominios gratuitos de ngrok, la réplica oculta los enlaces de handoff que pueden aterrizar en Inicio y muestra cómo abrir manualmente el URL dentro del navegador DApp de MetaMask o Trust; luego hay que volver al sitio y tocar **Conectar**. Trust sin Project ID solo permite conexión desde su proveedor inyectado en el navegador DApp. Para validar el handoff cruzado hace falta servir la aplicación en HTTPS sin página intermedia y observar permiso, aprobación/rechazo, dirección y retorno en un teléfono.

`npm run build` terminó correctamente (`tsc -b && vite build`, 945 módulos transformados). Rollup mantiene el aviso no bloqueante por el chunk de Solana de 695.66 kB. `git diff --check` terminó limpio. La matriz se mantiene en **70/77; 7 casillas abiertas**, detalladas en el checklist; el build y la respuesta reportada no completan esos puntos de integración.

## Cambio de recorrido móvil tras el reporte · 2-nov-2026

### Cambios verificados en el código

- En `/gmt-wallets`, MetaMask ya no ofrece una conexión directa de callback desde ngrok; su botón primario abre el sitio mediante el enlace oficial de navegador DApp. Trust Wallet abre `trust://open_url` y conserva un fallback HTTPS. La documentación de Trust indica que esos enlaces navegan al navegador DApp y no conceden acceso por sí solos.
- En el checkout de compra/recarga, los enlaces preservan `gmPay`, producto, monto, moneda, red y wallet. Después de cargar la página dentro de la wallet, se requiere un toque en **Conectar**; el envío queda separado en el botón **Pagar**.
- Los dominios ngrok con intersticial aún se excluyen de los retornos automáticos cifrados Solflare/Phantom y del flujo directo MetaMask Connect. En cambio, se habilitó el enlace al navegador interno que no depende de callback. El usuario debe aceptar el aviso de ngrok si aparece.
- El enlace TronLink abre DApp Browser (`action: open`); no se implementa `action: login` porque exige un endpoint de callback HTTPS. Keplr/Safe/xDeFi/CTRL no se añadieron: no son rutas directas para los activos habilitados o falta validar el proveedor/métodos.

### Límites de validación

La vista local de Carteras cargó y expuso las siete opciones en el navegador integrado. No se conectó una wallet, no se autorizó una dirección ni se firmó o envió una transacción. REA/Linux no pudo conectarse al endpoint CDP local `127.0.0.1:9222` en este ajuste, así que no generó Evidence nueva; se conserva como evidencia visual anterior de la interfaz `ev_536edf81046fe338e1535541ad1de0ac9332d298485dbd8c2cdde6c64c24aef1`, que no demuestra un prompt móvil. No se usó Visualize porque la herramienta no está disponible en esta sesión; los métodos se documentan como matriz en la guía.

El checklist permanece **70/77, siete casillas pendientes**. La causa exacta de que el teléfono muestre Inicio sigue sin confirmarse hasta comprobar el nuevo recorrido dentro de MetaMask/Trust o usar un dominio limpio.

## Ajuste de navegación móvil después del reporte · 2-nov-2026

El código ahora ofrece un recorrido de navegador DApp en ngrok cuando la conexión directa entre apps termina en Inicio:

- `/gmt-wallets`: MetaMask puede abrir la página por `https://link.metamask.io/dapp/{dappUrl}`; Trust Wallet intenta `trust://open_url` y ofrece Universal Link HTTPS alternativo. Ningún enlace cuenta como autorización.
- Checkout de compra/recarga: Trust incluye el URL del checkout con sus parámetros y `gmWalletConnect`. MetaMask usa el deeplink DApp con los parámetros del checkout y una marca para mostrar el aviso de regreso. Una vez que el checkout carga dentro de la wallet, el usuario debe pulsar **Conectar**. La aprobación de conexión solo lee la dirección; **Pagar** sigue siendo una acción distinta.
- La documentación de MetaMask presenta `/dapp/{dappUrl}` como apertura de una dapp en el navegador interno y la guía de Trust describe `open_url` como navegación a DApp Browser. Ninguna de las dos rutas pide conexión por sí sola. [MetaMask deeplinks](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Trust deep linking](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking).

La build local pasó (`tsc -b && vite build`, 945 módulos; aviso no bloqueante de Rollup por Solana, 695.66 kB) y `git diff --check` no reportó errores de whitespace. REA/Linux no pudo conectarse al CDP local; no hay captura nueva ni interacción física. El usuario reportó que el recorrido anterior abría solo Inicio. No se observó todavía el nuevo deeplink en un teléfono; por eso el pendiente de conexión móvil no se cierra, y el checklist queda en **70/77**.

## Corrección del handoff desde ngrok · 2-nov-2026

### Cambio aplicado

- `src/WalletPanel.tsx`: cuando el host es un dominio gratuito de ngrok y no hay proveedor inyectado, el botón principal de MetaMask abre el DApp Browser de MetaMask. En una carga HTTPS limpia, mantiene el botón que llama a MetaMask Connect. Esto prioriza una página cargada dentro de la wallet después del reporte de que el enlace directo solo llevaba a Inicio.
- `src/WalletPaymentCheckout.tsx`: la misma condición se aplica al checkout de minero y Recargar; el enlace preserva los parámetros de producto y pago para que el comprador vuelva al mismo checkout dentro del DApp Browser.
- Trust Wallet mantiene `https://link.trustwallet.com/open_url` con URL y cadena, según su especificación pública. El enlace abre navegación en la app. La conexión sin Project ID solo puede completarse cuando la página está cargada en el DApp Browser con el proveedor Trust inyectado; el botón por sí solo no crea una sesión externa.

Conectar una wallet no requiere firmar un mensaje en estos flujos: la app solicita acceso a la dirección pública. Una transferencia es una acción posterior y su transacción aparece en la wallet para revisión y aprobación.

### Evidencia y límites

El código y la ruta de CTA se revisaron estáticamente. El usuario probó la versión anterior desde ngrok y reportó que ambas apps abrían Inicio. El ajuste no ha sido probado todavía en el teléfono. El estado REA/Linux de esta actualización fue `open: false`, `cleanup_pending: false`; no había endpoint CDP móvil ni dispositivo Android accesible y no se produjo una nueva captura. La evidencia REA anterior de la página `/gmt-wallets` muestra la interfaz en Chromium a 390 × 844, no una solicitud dentro de MetaMask o Trust. [MetaMask Connect](https://docs.metamask.io/metamask-connect/) documenta su método `connect()` móvil; el [Universal Link de MetaMask](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) abre el navegador DApp. Trust documenta `open_url` como navegación al DApp Browser y WalletConnect móvil mediante un `projectId`: [deeplinks](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [integración móvil](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

El checklist se mantiene en **70/77; siete pendientes**: proveedores reales; handoff/prompt/aprobación o rechazo y regreso en móvil; recibo on-chain; ruta y cotización Bridge en vivo; tokens adicionales confirmados; KYC/eligibilidad; backend de órdenes/confirmación/conciliación/activación. Las siguientes pruebas no deben marcarse completas hasta que exista evidencia del dispositivo o del servicio correspondiente.

## Corrección posterior del recorrido MetaMask y Trust · 2-nov-2026

El usuario respondió que MetaMask y Trust Wallet solo muestran la pantalla principal cuando se abren desde el enlace de ngrok. El resultado observado sigue siendo **fallido**: no apareció permiso, no volvió dirección y no hubo firma ni pago.

- En `src/WalletPanel.tsx` y `src/WalletPaymentCheckout.tsx`, ngrok ya no usa MetaMask Connect como acción principal. El botón abre la réplica por el Universal Link oficial del navegador DApp de MetaMask; cuando cargue la página, se pulsa **Conectar**. En HTTPS sin el intersticial se conserva `client.connect()`.
- En `src/walletAppLinks.ts`, Trust Wallet usa primero el Universal Link oficial `https://link.trustwallet.com/open_url` y deja `trust://open_url` como respaldo. Su documentación confirma que ambos abren la página en DApp Browser; la dirección se obtiene solo si la página está cargada allí y el proveedor devuelve la cuenta. En navegación externa, Trust Wallet requiere WalletConnect con `projectId`, que el producto excluye.
- Los enlaces del checkout conservan los datos de compra o recarga; la conexión no envía fondos y la aprobación de pago sigue separada.
- `npm run build` pasó: TypeScript y Vite compilaron 945 módulos. Sigue el aviso de Rollup por el chunk Solana de 695.66 kB. `git diff --check` no reportó errores.

No se completó una nueva captura móvil. La llamada REA/Linux enfocada a cuatro módulos no devolvió Evidence en más de cinco minutos; se detuvo la espera y no se repitió. La evidencia previa `ev_536edf81046fe338e1535541ad1de0ac9332d298485dbd8c2cdde6c64c24aef1` es Chromium a viewport móvil con perfil vacío, por lo que no acredita el prompt real. La casilla móvil permanece pendiente; el checklist sigue **70/77 con siete pendientes**. Fuentes: [MetaMask Connect](https://docs.metamask.io/quickstart/), [deeplink DApp de MetaMask](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/), [Trust Wallet deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Trust Wallet móvil](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

## Ajuste tras confirmar que ambas apps muestran Inicio · 2-nov-2026

El usuario confirma que MetaMask y Trust Wallet solo muestran la pantalla principal al abrirlas desde ngrok; en esa prueba no apareció la solicitud de conexión ni volvió una dirección.

- En `src/WalletPanel.tsx` y `src/WalletPaymentCheckout.tsx`, MetaMask Connect ahora se intenta desde cualquier HTTPS público, incluido ngrok. El enlace `/dapp/` permanece como alternativa manual. Así se prueba el prompt de conexión del SDK en el toque de **Conectar**, en vez de enviar primero a Inicio por el enlace de navegador. La alternativa requiere que la página GoMining cargue dentro del navegador de MetaMask y que el usuario toque **Conectar** allí.
- En `src/walletAppLinks.ts`, Trust Wallet ahora usa `trust://open_url` como ruta principal porque el usuario tiene la app instalada. Su documentación distingue esta ruta directa del Universal Link web; se conserva el segundo como fallback. Al cargar la página en DApp Browser, la réplica solicita solo acceso a dirección y no pagos.
- El usuario aún debe probarlo en su teléfono: no existe dispositivo ni proveedor móvil adjunto a esta sesión. No se marca aprobado, rechazado, conectado ni pagado.
- `npm run build` pasó tras estos cambios: TypeScript correcto y Vite transformó 945 módulos. Permanece el aviso de Rollup por un chunk mayor a 500 kB, el de Solana de 695.66 kB. `git diff --check` no encontró whitespace inválido.

El conteo sigue en **70/77**. La nueva ruta no cierra la casilla de conexión móvil ni la de prueba de cada proveedor. MetaMask Connect `client.connect()` pide acceso a la cuenta; el deeplink `/dapp/` abre el navegador integrado y no pide el permiso por sí solo. Trust `open_url` también navega al DApp Browser; la autorización depende del proveedor inyectado y la acción de conectar. [MetaMask Quickstart](https://docs.metamask.io/quickstart/) · [MetaMask deeplinks](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Trust Wallet deeplinks](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Wallet optimización móvil](https://developer.trustwallet.com/developer/listing-guide/mobile-optimize).

## Ajuste móvil tras confirmar que ambas apps muestran Inicio · 2-nov-2026

El usuario confirma que, desde ngrok, MetaMask y Trust Wallet abrían su pantalla principal sin mostrar el permiso ni devolver una dirección.

- El flujo anterior deshabilitaba MetaMask Connect en dominios ngrok y mostraba como acción principal un enlace que solo abre el navegador DApp; por eso no llegaba a solicitar permiso en esa acción. Ahora el botón usa `client.connect()` desde cualquier HTTPS público, ngrok incluido. El enlace para abrir el navegador DApp queda como alternativa si MetaMask solo muestra Inicio.
- Trust Wallet usa ahora `trust://open_url` como ruta principal, dado que la app está instalada, y conserva `https://link.trustwallet.com/open_url` como alternativa. El enlace debe abrir la réplica en el navegador DApp; la persona toca **Conectar** después de que cargue para pedir acceso a la dirección. Desde otro navegador Trust requiere WalletConnect y un Project ID.
- En ngrok, Solflare y Phantom tienen enlaces Browse a su navegador DApp como alternativa al handoff nativo cifrado. Al cargarse la página el usuario debe tocar Conectar; abrir la app no demuestra conexión.
- Compra y Recargar conservan el producto y la cotización. La conexión solo lee la dirección; pagar sigue siendo una transacción separada que requiere revisar y aprobar en la wallet.

**Verificación de código:** `npm run build` terminó correctamente con TypeScript y Vite, 945 módulos transformados. Sigue el aviso no bloqueante por el chunk Solana de 695.66 kB. `git diff --check` pasó. No se aprobó ni transmitió una transacción.

**Límite móvil:** no hay un teléfono con MetaMask o Trust adjunto a esta sesión. No puedo confirmar que el enlace lleve a la réplica, que aparezca el prompt, que aceptar/rechazar funcione ni que vuelva la dirección. La comprobación física sigue abierta.

El checklist permanece en **70/77, siete pendientes**: conexión/desconexión con proveedores reales; handoff y prompt móvil con aceptación/rechazo y regreso; recibo y estado on-chain/Bridge; cotización y límites vigentes de Bridge; contratos de tokens adicionales; elegibilidad/KYC por proveedor, región, ruta e importe; y backend para órdenes, confirmaciones, idempotencia, conciliación y activación.

### Resultado REA de este corte

- La revisión de rea_linux sobre los dos módulos de enlaces venció con el error timed out awaiting tools/call after 450s, sin devolver Evidence. El resumen de lectura de REA conservaba 78 registros previos y no había uno nuevo para esta edición.
- Se intentó una segunda lectura estática de un solo archivo mediante REA Windows; no devolvió resultado antes de cancelar la espera. No se reintentó la misma llamada ni se abrió otro perfil de navegador.
- Por tanto, la evidencia de esta corrección es revisión del código y build local. REA no auditó esta versión y no se obtuvo interacción desde una app wallet ni desde un teléfono.

## Ajuste posterior al reporte de pantalla principal · 2-nov-2026

El usuario informa que MetaMask y Trust Wallet, al abrirse desde ngrok, muestran solo su pantalla principal. No hubo permiso, dirección devuelta, firma ni pago. La última modificación enfoca el flujo en cargar la réplica dentro del navegador DApp:

- MetaMask y Trust reciben enlaces con la ruta de compra o wallet y la marca `gmWalletConnect`. La página detecta la intención; al aparecer el proveedor inyectado solicita permiso para ver la dirección una vez. El checkout nunca paga automáticamente. Si el enlace abre solo Inicio, la página mantiene las opciones de reabrir el navegador DApp y copiar el URL.
- Trust `open_url` está documentado para abrir una URL en su navegador DApp. Desde un navegador móvil externo Trust indica usar WalletConnect v2 con `projectId`; ese protocolo no se configura por la preferencia de no depender de claves/servicios de WalletConnect. MetaMask recomienda usar el navegador integrado si un navegador móvil externo no permite conectar. [MetaMask móvil](https://support.metamask.io/configure/wallet/how-to-use-the-metamask-mobile-browser/) · [MetaMask deeplink](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Trust deeplinks](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust móvil](https://developer.trustwallet.com/developer/develop-for-trust/mobile).
- `src/walletSession.ts` prioriza la detección síncrona del proveedor inyectado para iniciar `eth_requestAccounts` durante la interacción con el navegador DApp. `/gmt-wallets` y el checkout tienen un reintento breve de detección para los proveedores que se inyectan después del primer render.
- `npm run build` pasó (TypeScript + Vite; 945 módulos). El Vite local responde `200` y sirve ambos componentes modificados. Sigue el aviso no bloqueante del chunk Solana (695.66 kB). No conecté ni firmé con una wallet real, y no se envió transacción.
- No se hizo una nueva interacción REA con MetaMask/Trust ni un teléfono físico en esta actualización. La Evidence REA anterior `ev_536edf81046fe338e1535541ad1de0ac9332d298485dbd8c2cdde6c64c24aef1` corresponde a Chromium a viewport móvil con perfil vacío; no demuestra el prompt wallet. El resultado de móvil queda **pendiente de repetición en teléfono**.

El checklist se mantiene en **70/77, siete pendientes**. La casilla móvil se cierra solo al observar en un teléfono que la réplica carga dentro del navegador DApp, la cuenta se autoriza o rechaza, la dirección vuelve al sitio y se puede desconectar. La app abierta en Inicio no satisface ese criterio.

## Revisión del flujo después de confirmar “solo veo la pantalla principal” · 2-nov-2026

### Hallazgo en código

En `/gmt-wallets`, el CTA móvil principal de MetaMask siempre elegía `getMobileWalletLaunchUrl()`, que produce el enlace oficial al navegador DApp. Eso solo navega a MetaMask; no ejecutaba el `client.connect()` disponible en `walletSession.ts`. En el checkout ocurría lo mismo mientras `mobileAppLink` existiera. Por tanto, una app que aterriza en Inicio nunca recibe una solicitud de conexión. Trust Wallet también abre con `open_url`; la apertura de la app no autoriza una dirección.

### Corrección

- MetaMask usa `client.connect()` en el botón principal cuando el sitio está en HTTPS público (incluido ngrok). El enlace `/dapp/` permanece como alternativa de navegación manual.
- Trust Wallet usa primero el esquema `trust://open_url` porque la app está instalada; conserva el Universal Link HTTPS como respaldo.
- Se quitaron los efectos que llamaban a `session.connect()` automáticamente al volver de un enlace DApp. El sitio conserva la intención de checkout, muestra instrucciones y espera una pulsación explícita de **Conectar**. El permiso solo lee la dirección; **Pagar** inicia una solicitud distinta.

### Verificación y límites

- `npm run build` pasó: TypeScript correcto, 945 módulos transformados. Rollup mantiene un aviso no bloqueante por el chunk Solana de 695.66 kB. `git diff --check` pasó.
- La captura REA/Linux local terminó con `cleanup_incomplete` sin Evidence utilizable. La integración Codex está alineada según `rea doctor`; `binary_session` no encontró un análisis binario abierto, pero eso no acredita la liberación del cleanup específico del navegador. No repetí el escenario ni afirmo que REA haya observado una wallet.
- No hay un teléfono MetaMask/Trust conectado. Sigue sin probarse el prompt, aceptar, rechazar, retorno a la página o desconexión. La matriz se mantiene en **70/77, siete pendientes**; la lista completa está en [el checklist](./gomining-replica-checklist.md).

## Revisión después de confirmar que solo aparece Inicio · 2-nov-2026

- **MetaMask en ngrok:** el CTA ahora abre la URL exacta del checkout o de Carteras en el navegador DApp con el Universal Link oficial `/dapp/{dappUrl}`. Se codifica el destino anidado para conservar sus parámetros de checkout. Tras abrir la página, se intenta automáticamente la solicitud de dirección porque el usuario ya pulsó **Conectar**; si no aparece, se puede pulsar Conectar dentro de la página. En un HTTPS público distinto de ngrok se mantiene MetaMask Connect SDK.
- **Trust Wallet:** `https://link.trustwallet.com/open_url` es ahora el enlace principal, con el destino y la red preservados; `trust://open_url` queda como alternativa. El deeplink solo abre la página. Como el usuario ya tocó **Conectar**, cuando la réplica llega al DApp Browser se intenta pedir acceso a la dirección; si la wallet no lo muestra, queda el botón **Conectar** manual.
- **Interpretación de la prueba reportada:** ver Inicio significa que no se cargó el dApp ni se concedió permiso. No hubo dirección, firma ni pago. Si el nuevo enlace aún muestra Inicio, abrir manualmente el navegador DApp de la wallet, pegar la URL copiada y aceptar el aviso `Visit` de ngrok si se presenta.
- **Validación local:** `npm run build` pasó (`tsc -b && vite build`, 945 módulos); `git diff --check` pasó. Una comprobación local reconstruyó el deeplink de MetaMask y confirmó que mantiene ruta y query del checkout. Vite informa un chunk Solana de 695.66 kB, aviso no bloqueante.
- **Límite REA:** no se obtuvo una nueva captura REA del handoff a las apps. La evidencia REA existente observa Chromium/DOM, no la pantalla ni el prompt de una wallet en el teléfono. Ninguna wallet real ni pago on-chain se probó en este corte.

La revisión corrige los botones de entrada y añade un intento de conexión de solo lectura vinculado a la acción **Conectar** que inició el handoff; no cierra la comprobación móvil. Sigue pendiente confirmar en un teléfono que el sitio cargue dentro de ambas wallets, muestre el permiso, permita aceptar/rechazar y devuelva la dirección. La matriz permanece en **70/77**; las otras seis comprobaciones abiertas son las de proveedores reales, recibo on-chain, rutas Bridge, activos, elegibilidad y backend financiero, detalladas en el checklist.

## Comparación documental de conectores y flujos móviles · 2-nov-2026

Se revisaron las guías oficiales actuales y el ejemplo Via Web3 Wallets proporcionado por el usuario. La tabla completa y fuentes están en [la guía de compatibilidad](./gomining-replica-guide.md#matriz-de-conexion-movil-y-proveedores-sin-project-id--2-nov-2026).

- MetaMask, Trust, Solflare, Phantom, TronLink y Coinbase tienen rutas basadas en proveedor o deeplink que no requieren WalletConnect Project ID en el contexto correspondiente. Los deeplinks que solo abren la app o su navegador DApp no son por sí mismos autorización; la conexión se confirma cuando el proveedor devuelve una dirección.
- Trust necesita WalletConnect v2 y `projectId` para conectar desde un navegador móvil externo. Dentro del DApp Browser puede usar provider inyectado.
- Keplr se enfoca en Cosmos/Osmosis y no coincide con BNB, BTC, ETH, TRON, USDT SPL o Polygon aceptados en este checkout. Safe requiere ejecutarse en el contexto Safe App. UniSat Mobile devuelve por un URI de app que una SPA no recibe; su conexión actual se limita a extensión. Via muestra CTRL/xDeFi por `window.xfi`, pero esto no prueba compatibilidad móvil ni red actual.
- Via `networks.ts` es un catálogo de redes y chain IDs, no una prueba de wallet compatibility ni un servicio de cotización/bridge.
- No se verificó el precio de USD 89 sobre 500 usuarios; queda como desconocido y no afecta la decisión técnica de excluir WalletConnect.

Esta investigación no cierra ninguna casilla de conexión con wallet instalada. El usuario reportó que desde ngrok MetaMask y Trust solo muestran Inicio; no hubo solicitud, dirección, firma ni transacción. No había teléfono disponible para observar el flujo. Conteo sin cambio: **70/77, siete pendientes**. REA/Linux no produjo evidencia nueva de pantalla wallet en este corte; los datos se contrastaron con fuentes primarias y código público.

### Revisión de respuesta móvil y ajuste de conexión · 2-nov-2026

**Entrada del usuario:** confirmó que al pulsar desde ngrok MetaMask no muestra nada y Trust Wallet solo abre su pantalla principal. No se recibió evidencia de permiso, dirección, rechazo ni transferencia; el resultado sigue clasificado como fallo de conexión reportado.

**Hallazgo en la implementación:** `WalletPanel` y `WalletPaymentCheckout` intentaban solicitar cuentas desde un efecto al cargar la página con el marcador `gmWalletConnect`. La guía de MetaMask Connect recomienda iniciar la solicitud con una acción explícita del usuario y no conectar durante la carga inicial. Se retiró esa solicitud automática y se dejó el botón **Conectar** para que el usuario lo toque dentro del navegador DApp.

**Cambios:** MetaMask Connect se usa desde cualquier HTTPS público, ngrok incluido, al tocar el botón. El enlace al navegador DApp de MetaMask sigue disponible como alternativa. Trust usa `trust://open_url` como ruta principal porque la app ya está instalada; se conserva `https://link.trustwallet.com/open_url` como fallback. La conexión no firma ni envía fondos. **Pagar** conserva la aprobación de transferencia separada.

**Documentación primaria consultada:** [MetaMask Connect: cuentas, conexión y gesto del usuario](https://docs.metamask.io/metamask-connect/evm/guides/manage-user-accounts/), [MetaMask Connect móvil](https://docs.metamask.io/metamask-connect/), [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Trust Wallet móvil](https://developer.trustwallet.com/developer/develop-for-trust/mobile). Trust documenta `trust://` como ruta directa para apps instaladas; `open_url` abre una URL/red dentro del DApp Browser. Trust desde navegador externo requiere WalletConnect v2 y Project ID, que no se integró.

**Validación local:** `npm run build` completó TypeScript y Vite (945 módulos). Persiste el aviso de Rollup por el chunk Solana de 695.66 kB. `git diff --check` pasó con advertencias LF/CRLF. No se aprobó ninguna transacción.

**Límite REA:** se intentó `rea_linux.list_browser_targets` en `http://127.0.0.1:9222`; devolvió `provider_unavailable` con `endpoint_unreachable`, porque Brave no expone CDP local en ese puerto. Esta sesión no tiene un teléfono conectado como target REA. La pantalla y el prompt reales no se auditaron; el ajuste se sustenta en código y documentación. El conteo sigue en **70/77**; la casilla móvil no se cierra sin cargar el sitio dentro de MetaMask y Trust, pedir permiso con un toque, aceptar/rechazar y confirmar el regreso de dirección en un teléfono físico.

Validación local tras el addendum: `npm run build` pasó (`tsc -b && vite build`, 945 módulos); Rollup conserva el aviso no bloqueante del chunk Solana de 695.66 kB. `git diff --check` terminó con código 0 y solo avisos LF/CRLF. La app móvil requiere una prueba física para cerrar su casilla.

## Corrección tras confirmación de que las wallets solo muestran Inicio · 2-nov-2026

**Entrada reportada por el usuario:** al iniciar la conexión desde el enlace ngrok, MetaMask no mostró una solicitud y Trust Wallet quedó en su pantalla principal. Esto acredita una interacción móvil fallida, no autorización, firma ni pago.

### Resultado de la revisión del flujo

- El deep link que abre una app no equivale a la solicitud de conexión. MetaMask Connect puede abrir la app mediante su protocolo móvil; el provider tiene que devolver un resultado. En ngrok se cambió la acción principal para abrir la URL dentro del navegador DApp de MetaMask. Cuando la página cargue, la persona debe tocar **Conectar** allí.
- Trust documenta `open_url` para abrir una URL/red en su DApp Browser. El código prioriza ahora el Universal Link HTTPS y deja `trust://` como alternativa. La página debe cargarse en el navegador integrado antes de que el provider inyectado pueda solicitar la dirección. La conexión externa con Trust Wallet desde otro navegador usa WalletConnect v2 y exige `projectId`.
- La conexión de dirección no firma. La autorización para compartir cuenta es distinta del paso posterior para enviar el pago. La UI no debe tratar la apertura de la wallet ni el consentimiento de conexión como pago completado.
- El checkout sigue conservando su producto y el importe durante el salto. Si solo se ve Inicio, copiar el URL y pegarlo manualmente en el navegador DApp es la alternativa actual; el aviso `Visit` de ngrok puede aparecer, pero no se observó la causa exacta en dispositivo.

### Matriz revisada de opciones

MetaMask (SDK móvil/provider EIP-1193), Trust (provider inyectado en DApp Browser; WalletConnect Project ID excluido), Coinbase/Base App (el SDK del repo es heredado y las docs recomiendan `@base-org/account`), Phantom/Solflare (provider o deeplink cifrado con callback, sin WalletConnect Project ID), TronLink (provider dentro de Explorer; `login` nativo requeriría callback backend), UniSat (callback nativo `unisat://response`, no integrable por una SPA sola), Keplr (Cosmos no configurado aquí), CTRL/xDeFi (Via muestra `window.xfi` para extensión; móvil no comprobado), Safe (contexto Safe App, no conexión genérica) y WalletConnect (Project ID requerido por Trust Mobile) quedan diferenciados en [la guía](./gomining-replica-guide.md#evaluacion-de-wallets-sin-walletconnect-project-id).

### Validación y límite de evidencia

El build tras el ajuste pasó (`tsc -b && vite build`, 945 módulos); el aviso de Rollup por el bundle Solana de 695.66 kB continúa. No se abrió un teléfono ni se generó evidencia nueva de REA. REA Linux no tiene un target móvil accesible en esta sesión; la Evidence previa de Chromium no prueba wallet, consentimiento o callback. Conteo sin cambios: **70/77; siete pendientes**. La integración solo se considerará móvil funcional después de comprobar que la página carga, aparece el prompt, aceptar/rechazar funciona, vuelve una dirección y es posible desconectar en el dispositivo real.

## Primer ajuste tras confirmar que solo aparece el inicio de la wallet · corte anterior

El usuario confirmó que la apertura desde ngrok deja MetaMask o Trust Wallet en su pantalla principal. Esto verifica que **no hubo conexión**: no se abrió la réplica en el navegador DApp, no apareció permiso y no regresó una dirección. La wallet abierta en Inicio no puede mostrar una solicitud que nunca recibió.

### Corrección de código de este corte

- En el código anterior, el botón principal de MetaMask en ngrok solo abría su navegador DApp; este primer ajuste intentó invocar MetaMask Connect en cualquier HTTPS público, incluido ngrok. El usuario volvió a reportar que solo veía Inicio, así que esta acción dejó de ser primaria para ngrok en el ajuste posterior.
- El deep link alternativo de MetaMask se ajustó al formato de parámetro de ruta publicado `https://link.metamask.io/dapp/{dappUrl}`. El cambio evita codificar el URL completo como un único segmento; falta validarlo en el teléfono.
- Trust Wallet no tiene una conexión desde un navegador externo sin WalletConnect v2 y su `projectId`. `open_url` solo intenta abrir una URL/red en DApp Browser. Si ese enlace termina en Inicio, la alternativa sin ID es abrir Browser/DApps desde Trust y cargar el dominio HTTPS.
- MetaMask Connect y `eth_requestAccounts` solicitan dirección, no firma de mensaje. La firma de transferencia se solicita por separado al tocar **Pagar**.
- La guía ahora cubre las familias EIP-1193/EIP-6963, Solana Wallet Standard/Wallet Adapter, UniSat, TronLink, Keplr y Safe. Un deeplink genérico no constituye un conector universal.
- El hilo de Reddit que compartió el usuario describe un caso de MetaMask móvil resuelto al abrir el sitio en el navegador integrado. Es evidencia anecdótica de 2021; coincide con la documentación oficial, pero no valida este teléfono ni ngrok. [Hilo de r/MetaMask](https://www.reddit.com/r/Metamask/comments/rjz6r7/need_help_i_cant_use_metamask_mobile_to_connect/).

### Evidencia y estado

- REA/Linux ya había analizado estáticamente el checkout y la sesión EVM en Evidence padre `ev_02b708677f6bcce8d19770c76b7000a73c15c8c2888aac9c4f3bed916150de03` y vista `ev_2980d7e6173661142e4d13a808d203ce58744257b99adb12513c1667321f5a07`. Ese análisis precede a este ajuste y **no** prueba el nuevo deep link en teléfono. No hay target móvil conectado a esta sesión REA.
- Una nueva pasada REA/Linux acotada solo a `src/walletAppLinks.ts` excedió el tiempo de cliente y terminó con `timed out awaiting tools/call after 450s`; no devolvió Evidence. No repetí la misma llamada. El ajuste de código se verificó mediante revisión local y compilación.
- Fuentes primarias contrastadas: [MetaMask Connect Quickstart](https://docs.metamask.io/quickstart/), [deeplink MetaMask](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/), [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) y [Trust Mobile/WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile).
- Este fue un corte intermedio: la prueba móvil reportada seguía fallida; la acción Connect/MWP requería repetición física y Trust seguía limitada hasta entrar en su navegador DApp o usar WalletConnect con Project ID.

## Ajuste tras confirmar que ambas apps quedan en Inicio · 2-nov-2026

### Hecho reportado

El usuario confirmó que al abrir MetaMask o Trust desde el enlace ngrok solo ve la pantalla principal de la wallet. No hay provider, dirección ni permiso; abrir la app no es una conexión.

### Correcciones de esta revisión

- Para MetaMask en ngrok gratuito, el CTA principal abre `https://link.metamask.io/dapp/{dappUrl}` y conserva ruta, query y fragmento del checkout. La página dentro del navegador DApp puede detectar `gmWalletConnect` y solicitar automáticamente `eth_requestAccounts` cuando MetaMask inyecte el provider. En HTTPS público distinto de ngrok se conserva MetaMask Connect/MWP.
- Para Trust Wallet, el CTA principal ahora usa el esquema documentado `trust://open_url`, porque el usuario ya confirmó que la app está instalada. El Universal Link HTTPS queda como fallback. `open_url` abre el navegador DApp pero no concede permiso por sí solo; al cargar la página con el intento de conexión, la réplica llama al provider inyectado para solicitar la dirección.
- El enlace copiado desde el checkout ahora incluye `gmWalletConnect` y los parámetros de producto, importe, red y wallet. Esto permite que la apertura manual en el navegador DApp mantenga el checkout y la intención de conexión.
- Si ngrok muestra **Visit**, hay que aceptarlo dentro del navegador DApp. La documentación oficial indica que el plan gratuito interpone una página en tráfico HTML; no puede omitirse desde un enlace sin el encabezado solicitado por ngrok. [Límite oficial del intersticial](https://ngrok.com/docs/pricing-limits/free-plan-limits#removing-the-interstitial-page).
- La dirección se solicita en una acción distinta de **Pagar**. Conectar no firma ni transmite; para enviar el pago sigue siendo necesaria la confirmación explícita en la wallet.

### Validación y evidencia

`npm run build` terminó correctamente (`tsc -b && vite build`, 945 módulos) y `git diff --check` pasó, con avisos de conversión LF/CRLF de Git. No se hizo conexión ni pago real.

REA/Linux no obtuvo evidencia de una interacción nueva con teléfono. La pasada REA anterior sobre la ruta móvil terminó en un timeout de cliente de 450 s sin Evidence; no se repitió la misma llamada. La evidencia REA de Chromium y los mocks previos no demuestran que MetaMask/Trust muestren el prompt en un teléfono. El estado permanece **70/77**, con las siete casillas abiertas; para cerrar la móvil hace falta volver a probar el mismo enlace en el teléfono y comprobar carga del sitio, permiso, aceptar/rechazar y dirección devuelta.

Fuentes: [MetaMask DApp deeplinks](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/), [MetaMask Connect](https://docs.metamask.io/metamask-connect/), [Trust Wallet deep linking](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Trust Mobile/WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

## Revisión tras la respuesta del usuario sobre MetaMask y Trust Wallet · 2-nov-2026

### Resultado observado y alcance

El usuario confirmó que MetaMask no hace nada visible y Trust Wallet abre solamente la pantalla principal al usar el enlace ngrok. Eso confirma que el handoff actual falló: no cargó la réplica en el DApp Browser, no apareció solicitud de conexión y no regresó una dirección. No hubo firma ni pago.

### Corrección aplicada al código

- Se eliminaron los efectos de `WalletPanel` y `WalletPaymentCheckout` que llamaban automáticamente a `session.connect()` al detectar `gmWalletConnect` o un provider al cargar. El retorno del enlace ahora restaura la pantalla y explica que el usuario debe tocar **Conectar** dentro de la página.
- MetaMask Connect es ahora la acción principal al tocar **Conectar** en cualquier HTTPS público, también ngrok. La solicitud ya no se lanza al cargar y el deeplink al navegador DApp queda como alternativa si el SDK solo abre Inicio.
- Trust usa el Universal Link HTTPS `open_url` como ruta principal y `trust://open_url` como alternativa. Ambos solo navegan; la conexión sin Project ID requiere abrir la réplica dentro de Trust DApp Browser y tocar **Conectar**.
- La tarjeta MetaMask y Trust incluye **Copiar enlace para navegador DApp**. El checkout conserva producto, precio, red y wallet en la URL; también explica que el enlace de Trust `open_url` solo navega y no solicita permiso.
- La conexión sigue siendo independiente del pago: al conectar solo se solicita la dirección; **Pagar** muestra la transacción para aprobación separada.

### Contraste con documentación oficial

- MetaMask documenta `https://link.metamask.io/dapp/{dappUrl}` como una manera de abrir una página dentro del navegador de la wallet; la autorización de dirección se hace luego con `client.connect()` o con el provider. [Deep links](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Manage user accounts](https://docs.metamask.io/metamask-connect/evm/guides/manage-user-accounts/).
- Trust documenta `open_url` para navegar a un sitio/red en su DApp Browser. Para una conexión desde un navegador externo documenta WalletConnect v2 y `projectId`; ese método se excluye por la decisión del proyecto. [Deep linking](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile).
- El plan gratuito de ngrok puede mostrar un intersticial en solicitudes HTML; la página no se considera accesible hasta que se carga la réplica. [Límites oficiales de ngrok](https://ngrok.com/docs/pricing-limits/free-plan-limits#removing-the-interstitial-page).

### Comprobaciones y pendientes

La revisión local confirmó por código que el permiso dejó de ejecutarse al cargar y que el build pasa tras cambiar el CTA. `git diff --check` también pasa, con avisos de CRLF. No hay un teléfono conectado a REA; el endpoint CDP de Brave ya había respondido `provider_unavailable` y no se repitió la misma consulta. No se afirma que el prompt móvil esté arreglado hasta observar en un teléfono el sitio cargado, el permiso, aceptación/rechazo y el retorno de dirección.

La matriz no cambia de **70/77**. Las siete comprobaciones abiertas son: (1) conexión y desconexión real de cada wallet/proveedor; (2) handoff móvil MetaMask/Trust y aceptación, rechazo, regreso; (3) recibo/hash después de una transferencia real; (4) cotización, mínimo, fee, liquidez y resultado actuales de Bridge para cada ruta; (5) contratos/decimales y disponibilidad de tokens adicionales; (6) requisitos KYC y elegibilidad por ruta/región/monto; (7) backend para órdenes, verificación, idempotencia, activación y auditoría. Los ítems 1–2 requieren wallets y teléfono; 3–7 dependen de datos de proveedor y servicios financieros que aún no están integrados.

### Revisión posterior del CTA MetaMask en ngrok · 2-nov-2026

El usuario precisó que MetaMask y Trust dejan solo su pantalla de inicio. Para evitar repetir un handoff que no produjo permiso, el botón principal de MetaMask ahora abre el enlace `/dapp/{dappUrl}` cuando el origen es un dominio ngrok gratuito. Al cargarse el sitio dentro del navegador DApp, el usuario toca **Conectar** para pedir la dirección al provider inyectado. MetaMask Connect SDK queda para otros orígenes HTTPS directos. Trust mantiene `open_url`; si el enlace solo deja Inicio, la URL copiable debe abrirse desde **Browser/DApps** manualmente. Esta ruta manual requiere el navegador DApp porque Trust desde navegador externo usa WalletConnect v2 con Project ID, excluido de esta réplica. [MetaMask DApp deeplink](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

La nueva selección de CTA y sus textos se revisaron en fuente y TypeScript/Vite compila. No se afirma que el handoff esté resuelto: no se cargó un teléfono real ni hubo permiso, dirección o pago. REA/Linux no produjo nueva Evidence para este ajuste; la evidencia anterior es de navegador/mocks y CDP del navegador local no estaba disponible. El total continúa **70/77**, con las siete comprobaciones listadas arriba.

## Investigación documental y ajuste del fallback móvil · 2-nov-2026

### Resultado observado

El usuario confirma que desde ngrok MetaMask no muestra una solicitud y Trust Wallet solo abre la pantalla principal. No se observó carga de la réplica dentro del navegador DApp, permiso, dirección ni transacción. La apertura de la app se registra como handoff fallido.

### Cambios y documentación verificada

- En el retorno con `gmWalletConnect`, la tarjeta informa que el sitio ya está en el navegador de la wallet y cambia el botón a **Conectar … ahora**. El permiso no se solicita al montar la página: la persona tiene que tocarlo.
- Si el deep link no carga la página, Carteras y checkout permiten copiar la URL para abrirla manualmente en el navegador DApp. Se agregaron links de fallback para MetaMask, Coinbase, Trust, TronLink, Solflare y Phantom cuando el proveedor documenta la apertura de un DApp Browser. Esos links solo navegan; no autorizan dirección.
- El enlace de checkout sigue incluyendo producto, importe, red y wallet. Conectar comparte una dirección pública; pagar requiere otra aprobación.
- Trust `open_url` abre su navegador DApp. La conexión desde un navegador móvil externo usa WalletConnect v2 y requiere `projectId`; se mantiene fuera del producto porque se pidió quitar dependencias de IDs. [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

La [guía](./gomining-replica-guide.md#investigacion-documental-y-fallback-movil-actualizado--2-nov-2026) contiene la matriz de MetaMask, Trust, Coinbase Wallet, Solflare, Phantom, TronLink, UniSat, Keplr, CTRL/xDeFi, Safe y WalletConnect, con el método móvil oficial y su compatibilidad de red.

### REA y verificación

El análisis REA de las fuentes de wallet primero terminó en `integrity_mismatch`: `src/walletAppLinks.ts` cambió mientras el inventario del target estaba abierto. Tras estabilizar el código se intentó una nueva pasada, pero el cliente agotó su límite de 450 s sin devolver Evidence. No se repitió la misma llamada. Las capturas REA previas de un viewport web y los fixtures no prueban prompts ni autorización en un teléfono.

`npm run build` pasó (`tsc -b && vite build`, 945 módulos); `git diff --check` pasó. Rollup mantiene el aviso no bloqueante por el chunk Solana de 695.66 kB. No se conectó una wallet ni se envió una transacción.

El total base permanece **70/77**. Las siete pendientes son: (1) conectar/desconectar wallets reales por red; (2) handoff y aceptación/rechazo móvil; (3) recibo y hash on-chain real; (4) cotización, mínimo, comisión, liquidez y resultado de cada ruta Solflare Bridge; (5) contratos/decimales/red de tokens adicionales; (6) requisitos KYC y elegibilidad por ruta, región y monto; y (7) backend de órdenes, verificación, idempotencia, conciliación, activación y auditoría. La investigación documental no cierra estas pruebas externas.

## Contraste adicional de documentación móvil · 2-nov-2026

### Qué confirmó la documentación oficial

- **MetaMask:** Connect soporta móvil y el SDK puede iniciar el handoff desde `client.connect()`. La documentación de deep links distingue `/dapp/{dappUrl}` como apertura del navegador integrado; ese enlace por sí solo no solicita dirección. La ayuda al usuario recomienda el navegador dentro de MetaMask cuando un navegador móvil externo no conecta. El usuario ya observó que el enlace ngrok deja MetaMask en Inicio; esto sigue siendo un resultado fallido en ese dispositivo. No se marcó como corregido.
- **Trust Wallet:** `https://link.trustwallet.com/open_url` y `trust://open_url` abren una página en el DApp Browser; no equivalen a `eth_requestAccounts`. Su guía de WalletConnect Mobile requiere un `projectId`. Con la restricción actual, el camino directo es cargar la réplica dentro de Browser/DApps y tocar **Conectar** allí. El usuario ya reportó que su URL ngrok solo abrió Inicio.
- **Coinbase Wallet:** el SDK web oficial publicado en GitHub describe un provider EIP-1193 y `eth_requestAccounts`, y su repo se mantiene activo. El conector local no recibe `projectId`; sigue sin prueba física. No inferí que un SDK gratuito garantice disponibilidad o un SLA del servicio de relé.
- **Solflare/Phantom:** ambos publican protocolos móviles propios de deeplink cifrado y retorno de sesión/dirección. Eso evita WalletConnect, pero exige la ruta y callbacks propios de cada wallet; el harness de código no demuestra que la app real acepte o devuelva la solicitud.
- **TronLink:** su documentación distingue `action: open` (abrir DApp Explorer) de `action: login` (solicitar la dirección con `actionId` y `callbackUrl` HTTPS). El código actual dispone de apertura/provider dentro de Explorer; el login callback no está integrado.
- **UniSat:** Mobile Connect usa `unisat://request` y regresa por `unisat://response`; esta respuesta es un esquema nativo, no un retorno HTTPS que una SPA pueda recibir de forma estándar. La extensión sí es un proveedor web separado.
- **Keplr:** su soporte recomienda su navegador móvil integrado; el checkout de esta réplica no ofrece Cosmos, por lo que no hay un pago compatible que habilitar en esa wallet.
- **CTRL/xDeFi:** Via demuestra adaptación al proveedor de escritorio `window.xfi`; no quedó establecida una integración móvil externa compatible. El candidato requiere verificación aparte.
- **Safe:** las Safe Apps deben correr en el contexto Safe; el SDK no convierte una dapp abierta en Brave/Chrome en una conexión Safe genérica. WalletConnect puede conectar Safe Mobile, pero reintroduce el Project ID.
- **WalletConnect/Reown:** la página actual de precios publica Starter a USD 0, hasta 2.5 M RPC y conexiones autocustodiadas dentro de límites aceptables; las 500 MAU nombradas aplican a wallets embebidas o autenticación SIWX. Pro figura a USD 89/mes e incluye multiwallet linking y límites de 7,500 MAU/5 M RPC. Por tanto, la afirmación “al pasar de 500 usuarios de WalletConnect se cobra USD 89” no es exacta para conexiones autocustodiadas según la tabla consultada; el nivel depende del uso y de las funciones. La réplica lo mantiene excluido porque se pidió no generar/usar un Project ID, aunque haya plan Starter gratuito.

### Conclusión técnica para el flujo que se pidió

Sin ID de WalletConnect, pedir una conexión a la app desde un navegador móvil externo solo es viable cuando el SDK del fabricante presenta el prompt y devuelve el resultado, o cuando la página se abre dentro del navegador DApp de la wallet y recibe el provider inyectado. Abrir la app no concede permiso. Después de compartir la dirección, **Pagar** debe iniciar otra solicitud para revisar y aprobar la transferencia.

La revisión documental confirma que la ruta recomendada para probar el reporte actual es servir la app en HTTPS sin intersticial, abrir la URL desde Explore → navegador de MetaMask o Browser/DApps de Trust, cargar la réplica y tocar **Conectar**. Debe registrarse prompt, aceptación/rechazo, dirección de retorno y desconexión; hasta completar esos pasos con las apps reales, la conexión móvil está **fallida/no verificada**.

Fuentes primarias: [MetaMask Connect](https://docs.metamask.io/metamask-connect/), [MetaMask deep links](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/), [ayuda del navegador móvil MetaMask](https://support.metamask.io/es/configure/wallet/how-to-use-the-metamask-mobile-browser/), [Trust Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile), [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Coinbase Wallet SDK](https://github.com/coinbase/coinbase-wallet-sdk), [Solflare Connect](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect), [Phantom](https://docs.phantom.com/solana/integrating-phantom), [TronLink](https://docs.tronlink.org/mobile/deeplink/), [UniSat Mobile Connect](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet/connect-with-unisat-mobile-wallet), [Keplr Mobile Browser](https://help.keplr.app/mobile-app/5R3bMyjtr3iKzMhqyCqu56/explore-dapps-with-keplr-mobile%E2%80%99s-browser/5So5gM41LhZn5CZxJZKmLv), [Safe Apps](https://help.safe.global/articles/4563148780-what-are-safe-apps), [Reown pricing](https://reown.com/pricing).

El post de Reddit de 2021 es evidencia anecdótica del autor y sus respuestas, no prueba de esta app ni de las versiones actuales. Se conserva como contexto secundario junto a las instrucciones oficiales de MetaMask. [Hilo de r/MetaMask](https://www.reddit.com/r/Metamask/comments/rjz6r7/need_help_i_cant_use_metamask_mobile_to_connect/).

### Evidencia y límites

Esta pasada fue documental, contrastada con lectura del código local; no generó Evidence REA ni captura de un móvil. No se ejecutó una transacción ni se llamó a APIs de wallet.

## Estado vigente tras el último reporte móvil · 2-nov-2026

El usuario confirma que al tocar los enlaces desde ngrok MetaMask y Trust Wallet muestran solo la pantalla principal. Se clasifica como **handoff fallido**: no se cargó la réplica dentro de la wallet y no hubo prompt, dirección, firma ni pago. No se da por corregido por un cambio de código.

- MetaMask Connect usa `metamask://` al tocar **Conectar** y conserva `/dapp/{dappUrl}` como enlace de navegador interno. No se reprobó en el dispositivo después del cambio. [MetaMask Connect](https://docs.metamask.io/metamask-connect/) · [deep links](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/).
- Trust Wallet prioriza `https://link.trustwallet.com/open_url` y conserva `trust://open_url` como alternativa. Ambos enlaces abren una página, pero no autorizan la cuenta. Sin WalletConnect y `projectId`, Trust debe cargar la web dentro de Browser/DApps y recibir un toque explícito en **Conectar**. [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile).
- El checkout y Carteras mantienen alternativa de enlace/copia para el navegador DApp y explican que Conectar solo solicita la dirección; el pago es una aprobación aparte.
- `npm run build` y `git diff --check` se ejecutaron después de los ajustes. La lectura de la fuente confirma qué enlace selecciona cada CTA, no el resultado dentro de una wallet real.
- REA intentó analizar cuatro módulos del flujo móvil. El cliente agotó su plazo a los **450 s** sin entregar Evidence; no repetí la misma llamada. No hubo teléfono ni captura móvil REA en este corte.

La matriz sigue en **70/77**: **una fallida observada y seis abiertas**. Las seis abiertas son proveedores reales; hash/recibo on-chain; cotización, mínimos, comisiones, liquidez y resultado de Bridge; contratos/decimales de tokens adicionales; requisitos KYC y elegibilidad por ruta/región/monto; y backend financiero de pedidos, verificación, idempotencia, conciliación, activación y auditoría. El checklist enlazado detalla cada punto y el estado de evidencia.

### Ajuste de handoff tras confirmación del usuario · 2-nov-2026

El usuario volvió a reportar que MetaMask y Trust Wallet solo muestran su pantalla principal al abrir desde ngrok. El fallo sigue vigente. Cambié MetaMask Connect a su esquema nativo `metamask://`, entregué al SDK la URL actual completa para conservar la ruta de checkout y mantuve `/dapp/{dappUrl}` como alternativa de navegador interno. Para Trust Wallet prioricé el Universal Link oficial `https://link.trustwallet.com/open_url` y dejé `trust://open_url` de respaldo. Abrir esas rutas no prueba que se cargó la réplica ni que se concedió permiso.

La compilación actual pasó (`npm run build`, 945 módulos); `git diff --check` pasó con advertencias de normalización LF/CRLF. El resultado móvil todavía no se volvió a observar. REA Linux también agotó el plazo del cliente (450 s) al intentar analizar solo los dos módulos cambiados; no se devolvió Evidence y no se repitió la llamada. Para completar esa lectura estática el host necesita más tiempo (`mcp_servers.rea_linux.tool_timeout_sec`). No presento el código como prueba del teléfono. Estado: **70/77; una fallida observada y seis abiertas**. Para Trust sin Project ID, el flujo posible sigue siendo abrir manualmente Browser/DApps, cargar el dominio y tocar **Conectar**. El intersticial de ngrok puede impedir que la réplica cargue.

## Corrección del recorrido MetaMask/Trust desde ngrok · 2-nov-2026

Esta sección reemplaza las entradas anteriores de este informe que describían una prioridad distinta para los deeplinks.

El usuario confirmó el resultado concreto del intento anterior: en ambas apps solo apareció la pantalla principal de la wallet. No llegó la réplica, no hubo solicitud, cuenta devuelta, firma ni transferencia. Clasificación: **handoff fallido**.

- **MetaMask:** en ngrok, la acción principal abre la URL de la réplica mediante el enlace de navegador DApp `/dapp/{dappUrl}`. El checkout conserva la intención `gmWalletConnect=metamask` y sus datos de compra/recarga. Al cargar dentro de MetaMask, el usuario pulsa **Conectar**; la página solicita `eth_requestAccounts` desde el gesto. En otros HTTPS públicos queda MetaMask Connect, usando Universal Links por defecto; se quitó `mobile.useDeeplink: true`, que forzaba el esquema nativo.
- Si MetaMask no inyecta el provider en el navegador DApp, la réplica muestra una instrucción y evita lanzar el SDK otra vez desde ngrok. Si ya regresó el checkout mediante `gmWalletConnect`, la pulsación no reemplaza la URL antes de pedir el permiso.
- **Trust Wallet:** el enlace primario ahora es `trust://open_url?coin_id=...&url=...`; el respaldo visible sigue siendo `https://link.trustwallet.com/open_url`. Ambos son navegación. Sin WalletConnect y Project ID, el permiso se solicita desde el provider de Trust ya inyectado dentro del navegador DApp.
- **No hay conexión automática:** el deep link puede abrir el sitio, pero el botón **Conectar** dentro de la página inicia la solicitud de dirección; **Pagar** solicita y transmite aparte solo con aprobación explícita.
- **Build:** `npm run build` completó (`tsc -b && vite build`, 945 módulos). Sigue el aviso de Rollup por el chunk Solana de 695.66 kB. Esta compilación valida tipos y empaquetado, no los callbacks de las apps móviles.
- **REA y teléfono:** no hay una captura REA móvil nueva en esta revisión. La anterior lectura estática tuvo timeout del cliente sin Evidence; no repetí la llamada sin aumentar el límite. No hay dispositivo móvil accesible para observar el handoff real en esta sesión.

**Cierre requerido:** volver a abrir desde ngrok en MetaMask y Trust, confirmar que se ve la página dentro de Browser/DApps, pulsar **Conectar**, verificar aceptar/rechazar y retorno de la dirección, luego desconectar. Hasta observar esos resultados, el elemento móvil del checklist sigue fallido/no comprobado y el conteo permanece **70/77, una falla observada y seis abiertas**.

El usuario identificó el entorno de reproducción: Android, navegador de origen Brave o Chrome. No se accedió a ese teléfono ni se verificó la navegación interna de las wallets.

Fuentes: [MetaMask Connect](https://docs.metamask.io/metamask-connect/) · [deeplink DApp de MetaMask](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Trust deeplinks](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

## Corrección y evidencia documental adicional · 2-nov-2026

**Entorno reportado:** Android; el usuario inicia desde Brave o Chrome y usa un enlace ngrok. La observación anterior se conserva como falla: MetaMask/Trust solo mostraban Inicio, sin página de la réplica ni prompt.

**Cambio local posterior a esa observación:**

- MetaMask Connect se intenta también desde el host HTTPS de ngrok; la sesión global precarga el SDK al entrar desde móvil para evitar descargarlo al momento del toque. El deeplink oficial /dapp/{dappUrl} se conserva como fallback a Browser.
- Trust prioriza https://link.trustwallet.com/open_url, con trust://open_url como fallback. Según su documentación, ambos abren la ruta DApp; ninguno aprueba una conexión. Sin WalletConnect Project ID, hay que cargar la réplica dentro de Browser/DApps y tocar **Conectar** allí.
- La conexión solicita la dirección. El pago requiere un segundo paso de aprobación y no se inició una transferencia durante esta revisión.

**Límite de prueba:** npm run build pasó; git diff --check pasó; la app local respondió HTTP 200. No hay Android conectado ni endpoint CDP local expuesto por Brave; REA no entregó Evidence móvil y esta nota no se presenta como captura REA. No se verificó prompt, aceptación/rechazo ni retorno en las apps tras el cambio. Checklist: **70/77**, una falla móvil observada más seis comprobaciones externas abiertas.

**Fuentes técnicas primarias:** MetaMask describe client.connect() como handoff móvil en browser y /dapp/{dappUrl} como navegación a su browser interno; el deeplink no equivale al permiso. Trust separa su ruta open_url y su integración móvil WalletConnect. [MetaMask Connect](https://docs.metamask.io/metamask-connect/) · [MetaMask deeplinks](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Trust deeplinks](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

**Costo de WalletConnect:** Reown publica Starter gratis, 2.5 M llamadas RPC y self-custodial MAUs “within acceptable limits”; el límite de 500 corresponde a wallets embebidas o SIWX. Pro aparece a USD 89/mes. Por la preferencia del proyecto de no mantener Project IDs, sigue excluido aunque el precio no sea un cargo automático al superar 500 conexiones autocustodiadas. [Reown pricing](https://reown.com/pricing).

## Seguimiento después de confirmar Android + Brave/Chrome · 2-nov-2026

El usuario confirma Android y navegadores de origen Brave/Chrome. La observación funcional reportada sigue siendo: MetaMask no muestra la solicitud y Trust Wallet solo abre Inicio.

- Cambié el deeplink principal de Trust a `trust://open_url`, de acuerdo con su documentación: el esquema personalizado va directo a la ruta de la app; el enlace HTTPS universal puede pasar por una landing page. El enlace HTTPS queda como alternativa. Abrir la ruta no solicita ni concede permiso.
- La conexión en un navegador externo de Trust requiere WalletConnect v2 y `projectId`. Sin ese ID, la página debe cargarse dentro de Browser/DApps y luego el usuario toca **Conectar**. Reown marca 500 como tope para SIWX/embebidas, no como tope general de conexiones autocustodiadas; Starter publica self-custodial MAUs “within acceptable limits”. Reown también excluye ciertos productos merchant/payments del autoservicio y remite a un plan custom; la clasificación de esta plataforma no está confirmada.
- MetaMask Connect documenta handoff desde navegadores móviles. En la réplica, `client.connect()` es el flujo principal y `/dapp/{dappUrl}` la alternativa de navegador interno. El reporte de no prompt sigue sin reprobar tras el último cambio.
- En la pantalla local `/gmt-wallets` se observaron siete opciones, sin cartera conectada. No se ejecutó un pago real.
- La compilación posterior pasó: `npm run build` (`tsc -b && vite build`, 945 módulos); quedó la advertencia de tamaño del chunk Solana. La lista continúa en **70/77**: un fallo móvil observado y seis verificaciones externas abiertas.
- La llamada REA más reciente para analizar los módulos cerró el transporte antes de producir Evidence. No hay captura del teléfono, y la documentación web o la inspección local no se consideran evidencia REA.

Fuentes primarias: [MetaMask Connect](https://docs.metamask.io/metamask-connect/), [MetaMask DApp deeplink](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/), [Trust deeplinks](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [Trust Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile), [Keplr Mobile Browser](https://help.keplr.app/mobile-app/5R3bMyjtr3iKzMhqyCqu56/explore-dapps-with-keplr-mobile%E2%80%99s-browser/5So5gM41LhZn5CZxJZKmLv), [TronLink deeplinks](https://docs.tronlink.org/mobile/deeplink/), [UniSat Mobile Connect](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet/connect-with-unisat-mobile-wallet), [Solflare Connect](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect), [Phantom integration](https://docs.phantom.com/solana/integrating-phantom), [Safe WalletConnect](https://help.safe.global/articles/6643739210-how-to-connect-a-safe-to-a-dapp-using-walletconnect), [Reown pricing](https://reown.com/pricing) y [Coinbase Wallet SDK](https://docs.cdp.coinbase.com/coinbase-wallet/overview).

## Revalidación tras confirmar Android + Brave/Chrome · 2-nov-2026

El usuario especifica que la prueba fue en Android desde Brave y Chrome. El resultado anterior permanece como **fallido**: MetaMask no hizo nada visible y Trust Wallet abrió solo su pantalla principal. No se registró permiso, dirección, firma ni transacción.

- **MetaMask / ngrok:** se revirtió la prioridad del SDK que no mostró solicitud en ese host. El botón principal ahora abre la URL oficial `/dapp/{dappUrl}` dentro del navegador MetaMask; esa navegación por sí sola no autoriza. Si MetaMask muestra Inicio, el usuario debe abrir **Explorar → navegador**, pegar la URL copiada y, cuando la réplica cargue, tocar **Conectar MetaMask ahora**. En un host HTTPS limpio el flujo SDK `client.connect()` sigue habilitado. La ayuda oficial indica cómo abrir una dapp en el navegador integrado y MetaMask Connect documenta la ruta móvil externa; no hay evidencia de que el callback SDK haya funcionado en este teléfono. [Plataformas MetaMask Connect](https://docs.metamask.io/metamask-connect/supported-platforms/) · [navegador móvil MetaMask](https://support.metamask.io/es/configure/wallet/how-to-use-the-metamask-mobile-browser/) · [deeplink `/dapp/`](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/).
- **Trust Wallet / ngrok:** el botón abre `trust://open_url`, con un Universal Link HTTPS alternativo. Ambos abren una ruta; ninguno crea una conexión. Si la app solo muestra Inicio, copiar el enlace completo y pegarlo en Browser/DApps. Sin `projectId` de WalletConnect, la conexión desde Brave/Chrome externos no está disponible en este diseño; dentro de Trust, el provider EIP-1193 solicita dirección tras el toque en **Conectar**. [Trust deeplinks](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Mobile / WalletConnect v2](https://developer.trustwallet.com/developer/develop-for-trust/mobile).
- **Semántica:** conectar solicita permiso para leer una dirección pública; no firma un mensaje. El pago posterior es una transacción separada y necesita aprobación explícita en la wallet.
- **Código e interfaz:** se corrigió el aviso móvil de Carteras para describir el flujo real en ngrok y se alineó el comentario del checkout con la decisión de abrir navegador DApp en ese host. Compra y Recargar siguen preservando producto, importe y red al compartir el enlace de checkout.
- **Otras wallets:** Solflare/Phantom tienen handoff cifrado y retorno propio; Coinbase usa el SDK anterior aunque la documentación actual recomienda `@base-org/account`; TronLink `action: open` requiere provider dentro de DApp Browser y su retorno `login` requiere callback HTTPS; UniSat móvil vuelve a un esquema de aplicación que esta SPA no recibe; Keplr no corresponde a las redes del checkout; CTRL/xDeFi no está implementado; Safe requiere contexto Safe App o WalletConnect. La matriz detallada está en la [guía](./gomining-replica-guide.md#matriz-extendida-de-carteras-sin-walletconnect--2-nov-2026).
- **Build:** `npm run build` pasó (`tsc -b && vite build`, 945 módulos). Rollup mantiene el aviso no bloqueante por el chunk Solana de 695.66 kB.
- **REA:** una captura controlada de `/gmt-wallets` en Chromium temporal devolvió `Transport closed` sin Evidence. No se repitió el lanzamiento porque había intentos REA anteriores fallidos y la limpieza no podía confirmarse desde esa respuesta. No se atribuye a REA esta revisión documental ni la inspección de código. Se necesita restablecer REA MCP antes de otra captura; tampoco había un dispositivo Android accesible para probar el provider real.

**Checklist:** continúa en **70/77**: una falla móvil observada, seis validaciones externas abiertas y ningún nuevo punto cerrado por esta actualización. Los siete detalles están en [la sección correspondiente](./gomining-replica-checklist.md#las-siete-comprobaciones-que-siguen-pendientes).

## Ajuste adicional para Android + ngrok · 2-nov-2026

Tras confirmar Android con Brave/Chrome, el código ahora intenta MetaMask Connect en todas las URL públicas HTTPS, incluido ngrok, y configura Universal Links HTTPS en lugar del esquema `metamask://`. El deeplink `/dapp/{dappUrl}` queda como ruta alternativa. Trust Wallet intenta primero su Universal Link HTTPS para abrir Browser/DApps y conserva `trust://open_url` como alternativa. Sin WalletConnect/Project ID, Trust solo podrá pedir permiso después de cargar la réplica en su navegador DApp.

La compilación pasó (`tsc -b && vite build`, 945 módulos); permanece el aviso del chunk Solana de 695.66 kB. `git diff --check` pasó con avisos de normalización LF/CRLF. No hubo sesión Android ni nueva Evidence REA; `capture_browser_scenario` había devuelto `Transport closed`, por lo que se requiere restablecer REA MCP antes de reintentar.

**Resultado de auditoría:** no declaro corregido el fallo móvil. Falta que el usuario repita Connect en Brave y Chrome y confirme prompt, aceptación/rechazo, dirección devuelta y desconexión; no hacer una transferencia durante esa comprobación. El checklist sigue en **70/77**, una falla móvil más seis verificaciones externas abiertas.

La documentación oficial de MetaMask describe `client.connect()` con handoff desde navegador móvil y deeplinks universales; el deeplink `/dapp/` solo abre el sitio dentro de la wallet. Trust separa sus deeplinks `open_url` de la conexión móvil, que usa WalletConnect v2. [MetaMask Connect / plataformas](https://docs.metamask.io/metamask-connect/supported-platforms/) · [MetaMask deeplinks](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Wallet móvil](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

## Corrección posterior al resultado de Android + Brave/Chrome · 3-nov-2026

El usuario identificó Android, Brave/Chrome y ngrok, y reportó que MetaMask no mostraba Connect y Trust Wallet abría solo Inicio. Se cambió la navegación local para evitar presentar ese lanzamiento como una conexión:

- MetaMask en ngrok abre el deeplink documentado al navegador DApp; tras cargar la réplica, el permiso se solicita desde el provider inyectado al pulsar Conectar. MetaMask Connect continúa para otros hosts HTTPS públicos.
- Trust Wallet copia el checkout como ruta principal de recuperación para abrirlo desde Browser/DApps. El deeplink `open_url` queda disponible como intento de navegación; no conecta por sí mismo. Sin WalletConnect/`projectId`, no hay solicitud directa desde Brave/Chrome a la app móvil de Trust.
- La transferencia sigue aislada detrás de **Pagar** y de una aprobación explícita en la wallet.

`npm run build` pasó (945 módulos; aviso no bloqueante por chunk Solana de 695.66 kB). `git diff --check` pasó sin errores de whitespace, con avisos de finales LF/CRLF. No hay captura REA nueva: la llamada anterior a REA/Linux devolvió `Transport closed`, sin Evidence. Tampoco se pudo repetir la operación en el Android; no se verificó prompt, callback ni dirección en el dispositivo.

El corte continúa **70/77**. No se cierran las siete comprobaciones listadas anteriormente; el flujo de Android permanece pendiente de revalidación real.

## Alcance móvil aclarado · 3-nov-2026

El usuario requiere compatibilidad en Android e iOS; la incidencia disponible sigue siendo Android con Brave/Chrome y ngrok. No se presentó una nueva prueba desde el teléfono tras el cambio de rutas. En el checkout y la página Carteras, los enlaces de MetaMask/Trust que abren la aplicación son navegación, no una autorización. Para MetaMask en ngrok hay que cargar la réplica dentro del navegador DApp y después tocar **Conectar**; para Trust, sin WalletConnect/Project ID, la conexión también requiere Browser/DApps. La conexión solo solicita la dirección pública, sin firma de mensaje; el pago exige aprobación separada.

La captura solicitada con REA volvió a fallar con `Transport closed` antes de producir Evidence. No se repitió ni se presenta como inspección válida. La build previa se conserva como evidencia de compilación, no como validación móvil. El checklist permanece en **70/77** hasta que se prueben los dos sistemas y se resuelvan las demás seis validaciones externas.

## Corrección del handoff de MetaMask y alcance iOS · 3-nov-2026

El usuario requiere Android e iOS; el caso físico reportado hasta ahora es Android + Brave/Chrome + ngrok. El botón de MetaMask se corrigió para llamar a `client.connect()` en todo HTTPS público, incluido ngrok. El enlace al navegador DApp queda como fallback explícito si el handoff abre Inicio sin mostrar la solicitud. **La corrección está compilada, pero no está confirmada en el teléfono.**

Trust Wallet conserva el límite de producto establecido: sin WalletConnect/Project ID, `open_url` solo navega y la conexión requiere cargar la réplica dentro de Browser/DApps y tocar **Conectar**. No hay una vía documentada para solicitar desde Brave/Chrome externo una sesión directa de Trust bajo esa restricción.

La revisión documental confirma que MetaMask Connect presenta un flujo móvil propio; Solflare y Phantom tienen deeplinks cifrados; Trust Wallet usa WalletConnect para una solicitud desde navegador externo; TronLink puede devolver dirección con `action: login`, pero requiere callback HTTPS; UniSat retorna a un esquema nativo; Safe necesita el contexto Safe App; y Keplr/xDeFi no resuelven de forma confirmada el checkout actual desde móvil. Estos puntos se detallan en la [guía](./gomining-replica-guide.md#estado-vigente-de-conexión-móvil--3-nov-2026).

`npm run build` pasó con 945 módulos y el aviso existente de tamaño del chunk Solana. El endpoint local `/gmt-wallets` devolvió HTTP 200 y `git diff --check` pasó. REA respondió `Transport closed` dos veces en una consulta de inventario sin mutaciones; no se obtuvo Evidence y no se atribuye esta revisión a REA. Hace falta reiniciar/reconectar el cliente MCP antes de otra inspección REA. No se dispone de teléfono conectado al entorno ni se aprobó una transferencia.

El checklist se mantiene en **70/77**. Continúan pendientes la prueba móvil en Android e iOS y las seis comprobaciones externas restantes; la build y la documentación no verifican el permiso ni la dirección real.

## Revisión documental de las demás wallets y CTA Coinbase · 3-nov-2026

El usuario confirma que la prueba fue Android con Brave/Chrome y ngrok, y que MetaMask y Trust solo muestran Inicio. No hubo captura física ni evidencia REA nueva. La nueva matriz oficial está en `gomining-replica-guide.md`.

- MetaMask Connect solicita la conexión desde móvil según su SDK; `/dapp/` solo carga la web en el navegador interno. El handoff ngrok continúa fallido en el teléfono según el reporte.
- Trust documenta WalletConnect v2 con `projectId` para un browser móvil externo; sin ID, hay que cargar la web en Browser/DApps y tocar Conectar.
- Solflare/Phantom tienen flujos deeplink cifrados sin Project ID y retorno de dirección/sesión; la implementación local no fue probada en dispositivo.
- Coinbase publica su browser deep-link mobile flow. La revisión del código encontró que en HTTPS limpio Carteras y checkout preferían una URL de apertura de la app, dejando sin uso el SDK en el toque principal. Se ajustó ambos CTAs para iniciar el SDK directamente cuando `coinbaseSdkAvailable`; se conserva la URL del navegador DApp como respaldo. Ngrok continúa por navegador DApp. La implementación está pendiente de Android real.
- TronLink `action: login` puede devolver dirección mediante callback HTTPS y `actionId`; el código actual solo usa `action: open` y provider inyectado. UniSat devuelve a `unisat://response`, sin receptor nativo en esta SPA. Keplr ofrece navegador móvil pero Cosmos no está en las redes de pago. Safe requiere contexto Safe App o WalletConnect; CTRL/xDeFi no se habilita por falta de soporte móvil vigente confirmado.
- Reown pricing y sus términos no respaldan la afirmación simple de “USD 89 al superar 500 conexiones”: el pricing separa self-custodial de embedded/SIWX, mientras los términos mencionan 500 MAUs o 2.5M RPC para licencia comercial y contemplan acuerdos Enterprise para pay-ins. La elegibilidad del checkout debe confirmarse con Reown antes de adoptar el Project ID.

**Validación:** `npm run build` pasó con 945 módulos; sigue el aviso de Rollup por el chunk Solana de 695.66 kB. La ruta local `/gmt-wallets` devolvió HTTP 200 y `git diff --check` pasó, con avisos de conversión LF/CRLF. No se probó conexión, rechazo, retorno ni pago real. El estado general sigue 70/77. REA/Linux permanece con `Transport closed`; esta revisión procede de docs oficiales y lectura del código.

Fuentes: [Trust Mobile](https://developer.trustwallet.com/developer/develop-for-trust/mobile) · [Coinbase SDK mobile](https://docs.cdp.coinbase.com/wallet-sdk/docs/environments) · [Coinbase deeplinks](https://docs.cdp.coinbase.com/wallet-sdk/docs/deep-link) · [Solflare Connect](https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect) · [Phantom Connect](https://docs.phantom.com/phantom-deeplinks/provider-methods/connect) · [TronLink](https://docs.tronlink.org/mobile/deeplink/) · [UniSat](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet/connect-with-unisat-mobile-wallet) · [Keplr](https://help.keplr.app/mobile-app/5R3bMyjtr3iKzMhqyCqu56/explore-dapps-with-keplr-mobile%E2%80%99s-browser/5So5gM41LhZn5CZxJZKmLv) · [Safe Apps SDK](https://help.safe.global/articles/6872363437-145503-how-to-create-a-safe-app-with-safe-apps-sdk-and-list-it) · [Reown pricing](https://reown.com/pricing) · [Reown terms](https://reown.com/terms-of-service).

## Ajuste tras confirmar Android + Brave/Chrome · 3-nov-2026

**Cambio local:** `WalletPanel.tsx` y `WalletPaymentCheckout.tsx` dejan de iniciar MetaMask Connect desde un host ngrok gratuito, donde el tráfico HTML pasa por el intersticial. El CTA principal usa el deeplink oficial que carga la página en el browser DApp de MetaMask; la persona toca **Conectar** cuando la réplica ya está cargada. En otro HTTPS público, se mantiene la solicitud directa de MetaMask Connect. Trust ahora abre el Browser/DApps desde el CTA, mantiene el esquema `trust://` como alternativa y permite copiar el checkout. Sin Project ID no puede iniciar la solicitud externa desde Brave/Chrome; debe cargarse la página dentro de Trust.

**Verificación:** `npm run build` terminó correctamente: TypeScript y Vite, 945 módulos. `git diff --check` pasó sin errores de whitespace; solo se reportaron conversiones LF/CRLF. No se probó el flujo en Android después del cambio, no se obtuvo permiso ni dirección y no hubo pago. REA/Linux continúa sin Evidence nueva tras `Transport closed`; no se repitió la captura. El cambio no altera el resultado: **70/77, una falla móvil observada antes del ajuste y seis abiertas**.

Fuentes primarias: [MetaMask Connect](https://docs.metamask.io/metamask-connect/) · [MetaMask: abrir DApp](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile) · [ngrok: límites del plan gratuito e intersticial](https://ngrok.com/docs/pricing-limits/free-plan-limits).


## Follow-up: Android handoff correction · 3-nov-2026

Code review found that the ngrok condition disabled MetaMask Connect and changed the primary action into navigation to `/dapp/`, which cannot itself produce a connection prompt. The CTA now invokes `client.connect()` for MetaMask on public HTTPS hosts, including ngrok, and leaves `/dapp/` as a manual fallback. Trust Wallet now tries its documented `trust://open_url` app route first; the HTTPS Universal Link is the fallback. Neither Trust link is a connect prompt: the user must open the actual page in Browser/DApps and tap **Conectar** because the chosen no-Project-ID scope excludes WalletConnect.

The user-reported Android + Brave/Chrome + ngrok result remains “wallet home only.” The code adjustment is not marked as a successful mobile test. REA/Linux `binary_session` now responds with no cleanup pending, but reports no browser target; no new REA Evidence or physical Android interaction was produced. `npm run build` and `git diff --check` are the local validation gates for this change. Overall checklist remains **70/77** until the Android prompt, address return, rejection, cancellation, and disconnect are observed; the six external validations also remain open.

Primary references: [MetaMask Connect](https://docs.metamask.io/metamask-connect/) · [MetaMask DApp deeplink](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile) · [ngrok free plan interstitial](https://ngrok.com/docs/pricing-limits/free-plan-limits).

Aclaración REA: después del estado de sesión, se solicitó análisis estático de cinco fuentes con límite interno de 120 s; la llamada no devolvió resultado tras más de tres minutos y se detuvo la espera. No hubo Evidence asociada y no se repitió. Este reporte no afirma una auditoría REA de navegador o teléfono.

## Retesteo comunicado y ajuste adicional · 3-nov-2026

El usuario confirmó que MetaMask y Trust Wallet se probaron en Android desde Brave y Chrome con el enlace ngrok. En ambos casos solo apareció la pantalla principal de la wallet: no se mostró la solicitud, no volvió una dirección y no hubo firma ni envío.

El código de ngrok se ajustó a navegación explícita al browser DApp para MetaMask; una vez cargada la réplica, se requiere otro toque en **Conectar**. El SDK de MetaMask conserva el flujo directo en hosts HTTPS distintos de ngrok y ya usa la forma estándar `connect({ chainIds })`, sin `forceRequest`. Trust cambió a su Universal Link HTTPS oficial como ruta principal y ahora ofrece copiar la URL si la aplicación se queda en Inicio. En Trust, sin WalletConnect v2 y `projectId`, abrir la app no inicia una sesión desde Brave/Chrome.

La build terminó correctamente (945 módulos); `/gmt-wallets` respondió HTTP 200 y `git diff --check` no mostró errores de whitespace. No hay prueba física posterior a estos cambios. REA/Linux informó una sesión sin target y sin cleanup pendiente. La inspección del cliente ADB produjo Evidence `ev_c2f258da5495c64796e7bdf9feafb2243079b6c8e4bb3330c9499b478852088d` con `contacted_adb_server: false`, por lo que no se consultó el dispositivo. El inventario CDP del endpoint local `127.0.0.1:9222` falló con `provider_unavailable/endpoint_unreachable`; no hay Evidence de captura del sitio o del prompt móvil.

El estado sigue en **70/77**. La falla móvil queda pendiente hasta comprobar provider/request, permiso, dirección, rechazo y desconexión en el teléfono. No se intentaron pagos.

Referencias oficiales: [MetaMask Connect y conexión móvil](https://docs.metamask.io/metamask-connect/) · [MetaMask DApp deeplink](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/) · [Trust Wallet deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Wallet Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile).
## Actualización tras prueba MetaMask y fallo Trust Wallet · 3-nov-2026

El usuario probó Android con Brave/Chrome mediante ngrok. **MetaMask** abrió la URL dentro del navegador interno y permitió llegar a la aprobación/firma de la transacción. No recibimos hash, recibo del explorador ni evidencia independiente de confirmación en cadena, por lo que esto verifica el recorrido hasta la aprobación reportada, no la acreditación del producto. **Trust Wallet** abrió la app en su pantalla principal y no mostró ni la página ni el permiso.

La documentación oficial indica que https://link.trustwallet.com puede mostrar una página de entrada y redirigir a la ruta interna, mientras que trust:// dirige directamente a la pantalla de la app cuando está instalada. La ruta primaria cambió a trust://open_url; el Universal Link queda como alternativa visible. La réplica añade el permiso automático de cuenta únicamente cuando el enlace gmWalletConnect carga dentro de la página y el proveedor Trust está inyectado. Para Trust en Brave/Chrome externo sigue haciendo falta WalletConnect v2 con projectId, excluido por el alcance elegido. La ruta directa puede reducir un paso; queda pendiente que el usuario la repita en su Android.

**Cambios y verificación local:** src/walletAppLinks.ts genera el enlace Trust instalado; src/WalletPanel.tsx y src/WalletPaymentCheckout.tsx solicitan acceso a la cuenta al completar el handoff dentro del DApp browser. La build pasó con 945 módulos y el aviso existente del bloque Solana (695.66 kB). git diff --check pasó sin errores de whitespace. No se ejecutó una transferencia de prueba ni se inspeccionó el teléfono.

**REA:** no hay Evidence de navegador o Android en este corte. El último inventario CDP al endpoint local 127.0.0.1:9222 había respondido provider_unavailable/endpoint_unreachable; no se repitió la misma llamada. La revisión de esta corrección combina documentación oficial y lectura de código, no se presenta como análisis REA de runtime.

La matriz se mantiene en **70/77**: MetaMask tiene un resultado positivo reportado hasta la aprobación; Trust continúa como fallo observado antes de esta corrección; aceptación, rechazo, retorno de dirección y desconexión deben repetirse, además de las seis verificaciones externas restantes.

Fuentes oficiales: [Trust Wallet deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Wallet Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile) · [Trust Wallet EVM provider](https://developer.trustwallet.com/developer/develop-for-trust/browser-extension/evm) · [MetaMask Connect](https://docs.metamask.io/metamask-connect/).

## Resultado adicional comunicado por el usuario · 3-nov-2026

El usuario probó en Android + Brave/Chrome desde ngrok. MetaMask abrió la réplica en su navegador integrado y permitió llegar al paso de firma/aprobación. Trust Wallet abrió la app en su pantalla principal como acceso directo; no cargó la réplica ni mostró permiso de conexión. No se aportó un hash, por lo que el resultado de MetaMask no confirma envío, confirmación on-chain, llegada final por Bridge ni activación de producto.

### Corrección local

La implementación del deeplink Trust usaba `coin_id=714` para BNB Chain. Se cambió a `20000714`, que Trust Wallet Core registra como BNB Smart Chain. Esta es una posible corrección sustentada en la estructura oficial de cadenas; no se ha confirmado mediante nuevo clic en Android. Si el enlace aún aterriza en Inicio, el procedimiento sin Project ID es abrir Trust Browser/DApps y pegar la URL del checkout. La documentación de Trust requiere WalletConnect v2 con `projectId` para conectar desde Brave/Chrome externos.

### Estado de auditoría

- `npm run build` pasó: TypeScript compiló y Vite transformó 945 módulos. Persiste el aviso no bloqueante del chunk Solana (695.66 kB). `git diff --check` pasó; Git solo avisó sobre normalización LF/CRLF. No se afirma validación móvil.
- No se generó Evidence REA nueva. El Android no está conectado por ADB y el navegador no ofrece un CDP utilizable en este turno; no se repitió el intento contra el endpoint ya reportado como inaccesible.
- Checklist: permanece en **70/77**. El resultado de MetaMask se registra como reporte positivo hasta aprobación; Trust, rechazo, retorno, desconexión y recibo en cadena siguen pendientes.

Fuentes: [Trust Wallet deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Wallet UAI](https://developer.trustwallet.com/developer/new-asset/universal_asset_id) · [Trust Wallet Core chain registry](https://github.com/trustwallet/wallet-core/blob/master/docs/registry.md) · [Trust Wallet Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile).

## Rectificación tras la prueba móvil comunicada · 3-nov-2026

- **MetaMask:** el usuario informa que Android + Brave/Chrome abrió la página dentro del navegador de MetaMask y permitió llegar a la aprobación/firma. Es un resultado positivo reportado para el handoff y el prompt; falta saber si la transacción se envió y obtener el hash para verificarla en cadena. No confirma Bridge ni activación de producto.
- **Trust Wallet:** en la misma prueba, la app abrió en su pantalla principal y no cargó la réplica ni pidió conectar.
- **Corrección del `coin_id`:** una nota anterior cambió `714` por `20000714` basándose en el registro interno de cadenas de Trust Wallet Core. Fue incorrecto para el deeplink: la documentación oficial de `open_url` define `coin_id` como índice SLIP-44; el código queda corregido a `714` para BNB. Este ajuste está justificado por el formato documentado, pero no se ha vuelto a probar en el teléfono.
- **Límite de conexión:** si la URI sigue abriendo Inicio, hay que entrar manualmente a Browser/DApps y pegar la URL con `gmWalletConnect=trustwallet`. La documentación de Trust indica WalletConnect v2 para conectar desde navegadores externos; requiere `projectId`, que el usuario decidió excluir.
- **REA:** intenté descubrir el navegador local con `list_browser_targets` en `127.0.0.1:9222`; REA respondió `provider_unavailable/endpoint_unreachable`. No hay captura de runtime del navegador ni del teléfono en esta actualización.
- **Checklist:** sigue en **70/77**. MetaMask queda como resultado positivo reportado hasta el prompt; Trust y los estados de rechazo, retorno y desconexión siguen abiertos. No se afirma pago confirmado ni se usó una transacción como prueba.

Fuentes: [Trust Wallet deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [SLIP-0044](https://slips.readthedocs.io/en/latest/slip-0044/) · [Trust Wallet Core chain registry](https://github.com/trustwallet/wallet-core/blob/master/docs/registry.md) · [Trust Wallet Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile) · [MetaMask Connect](https://docs.metamask.io/metamask-connect/).

## Nota posterior: nuevo resultado del usuario, corrección Trust y evidencia REA · 3-nov-2026

El usuario confirmó que, en Android + Brave/Chrome + ngrok, **MetaMask abrió la réplica dentro de su navegador y llegó a la pantalla de firma/aprobación**. No se recibió el hash; no se confirma envío, liquidación, Bridge ni activación. **Trust Wallet abrió Inicio sin cargar la réplica ni solicitar acceso**. No se identificó cuál botón había tocado.

La inspección del JSX descubrió que el botón principal en Carteras y checkout presentaba primero `trust://open_url`, aunque el Universal Link oficial HTTPS estaba disponible. Ahora el CTA principal abre `https://link.trustwallet.com/open_url` con la URL completa, el enlace `trust://` queda como alternativo y el copiado manual permanece para abrir la página desde Browser/DApps. Esta corrección de orden no prueba todavía la resolución del deep link en el teléfono; se requiere retest.

**REA/Linux:** se analizó estáticamente el bundle compilado final. Evidence `ev_0ae756931f23b8cf4dcf5fe636fc9dca571d6f8540ccad83068cee2c4bbaf0ac` y resumen `ev_fa4ae0b9fe2029419f1c69baa39500b12934e8863d10fddc7536d7a8ff5acf3a`. Se analizó 1 archivo de los 23 inventariados, con 22 fuera del alcance seleccionado y un grafo parcial con 14,244 unknowns; el bundle no fue ejecutado y no hubo captura de Android/CDP. Por ello la evidencia REA no marca Trust como funcional.

**Validación local:** `npm run build` pasó (945 módulos); `/gmt-wallets` respondió HTTP 200 y `git diff --check` pasó. Queda el aviso de Rollup para el chunk de Solana (695.66 kB). El checklist general permanece en **70/77** y Trust está abierta hasta que una nueva prueba muestre la página, el permiso y la dirección en el dispositivo.

Fuentes: [Trust deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking) · [Trust Mobile / WalletConnect](https://developer.trustwallet.com/developer/develop-for-trust/mobile).
