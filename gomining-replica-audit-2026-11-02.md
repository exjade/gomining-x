# Informe de auditoría REA — GoMining réplica · 2 de noviembre de 2026

## Resultado

La matriz tiene **70 de 77 comprobaciones confirmadas y 7 pendientes**. “Confirmada” incluye navegación, estado demo, revisión de código, cotizaciones observadas, mocks y recorridos REA; no significa que 70 funciones se hayan probado en producción. El checklist completo, con una casilla y su evidencia por requisito, está en [`gomining-replica-checklist.md`](./gomining-replica-checklist.md).

REA reprodujo el cierre del checkout con la X y con **Cerrar pantalla** mientras una solicitud de conexión simulada seguía pendiente. También reprodujo un rechazo de Connect y una pantalla de recibo QA. Esas escenas no abrieron una wallet real ni transmitieron fondos. La integración móvil de MetaMask, Solflare y Phantom existe en código; sigue sin prueba física en un teléfono.

## Interacción capturada con REA

Los escenarios usaron la réplica local a 390 × 844 px y un proveedor EIP-1193 de QA. El proveedor es una fixture de prueba, no una extensión real. Cada perfil temporal terminó con `terminated-owned-process`.

| Recorrido | Evidencia REA | Resultado observado | Límite |
|---|---|---|---|
| Abrir checkout con `eth_requestAccounts` pendiente y pulsar X | `ev_f8a08d69c365a9a57e66c7c823cc72dd05d9b8b38679b4f5f996dd9941292943` | El diálogo desapareció, se limpiaron los parámetros de checkout de la URL y no hubo errores de página. | Cierre del checkout web; no cierra una solicitud que permanezca dentro de una wallet real. |
| Repetir el caso y pulsar **Cerrar pantalla** | `ev_2843c110ace4df295d3fc3b8f52979638146d09dd354ccc1def82ff3e57a1f52` | Se desmontó el checkout y se limpió la URL. | Proveedor simulado; no es prueba Android. |
| Rechazar Connect desde la fixture | `ev_c0f08ee0653e0e4eea949090d1763628ed9f1e904e4ebf6a31ab62f9043f420a` | El modal se cerró y apareció: “Cancelaste la conexión en tu wallet. No se envió ningún pago.” | Rechazo sintético; no se mostró un prompt real de MetaMask. |
| Simular una respuesta de pago exitosa de QA | `ev_be965379b8b4bbeb6aad604a1d69056f3a4741586f6f952f987341a08d2d2324` | La interfaz rotuló el hash como ficticio, el estado de origen como no verificado y Bridge como pendiente. | No existe esa transacción en una blockchain; no es un recibo real. |

La primera captura del rechazo (`ev_82d48b0c2f301c7c7f119682bbcf82b7f19a7fa0940bb50746183272c5783639`) tuvo un selector de estado ambiguo. Se conserva como historial; el resultado concluyente es la segunda escena `ev_c0f08…` citada arriba.

## MetaMask móvil: ruta nativa Connect/MWP

El checkout usa `@metamask/connect-evm` como ruta Connect/MWP. La configuración vigente es `mobile.useDeeplink: !isMobileBrowser()`: en teléfono el valor es `false` y el SDK selecciona el Universal/App Link HTTPS `https://metamask.app.link/connect/mwp`; no se envía a `metamask://` ni al enlace `/dapp/`. Antes del handoff se conserva el producto y la red en `gmPay`. El SDK gestiona la conexión y el regreso mediante su protocolo/relay; la configuración del cliente no prueba que un teléfono concreto abra MetaMask o vuelva correctamente. [README oficial](https://github.com/MetaMask/connect-monorepo/blob/main/README.md) · [arquitectura MWP](https://github.com/MetaMask/connect-monorepo/blob/main/docs/architecture.md) · [plataformas compatibles](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/supported-platforms.md)

REA analizó estáticamente el workspace actual: Evidence de resumen `ev_fca8030ec6d03a3836d545034975e83381ea9e8e4cd6ea2c8386f14dce05161d`, análisis padre `ev_73626ea5d1d69812686f2c3fce2e26dd11f76894f16a48ee09b245592ceae7e5`. El resumen revisó 9,092 nodos de su vista; el grafo es parcial y dejó 19,282 archivos inventariados sin seleccionar. REA parseó código como texto: no ejecutó el bootstrap ni abrió MetaMask. En este turno, un nuevo análisis acotado de cuatro fuentes agotó el límite del cliente (450 s) y no devolvió Evidence; no repetí la misma llamada. Se conserva la evidencia REA completada anterior. El build pasó el 2-nov-2026. REA encontró ADB disponible (`ev_86e823114c9668c8a38f4cf9177d82290253537ada3ca48852df01c01195c113`), pero el inventario observó cero teléfonos (`ev_db2d0727a6fc6cd81e81dd67e3acfd1dbf336c337200a9a11833de8bb5ae181f`). El handoff real sigue sin probarse; no se firmó ni transmitió nada.

## Funcionalidad por área

| Área | Estado auditado | Qué se puede afirmar |
|---|---|---|
| Diseño y navegación | **Parcialmente verificada** | Se cargaron 55 URLs del mapa de rutas en una revisión anterior; Inicio, checkout, Carteras y Pool tienen recorridos móviles documentados. La apertura de una ruta no certifica todas sus funciones: algunas vistas son genéricas, demo o desconectadas. |
| Crear minero | **Flujo de demo** | Configurador → revisión → checkout y cierre están presentes. El catálogo es una observación fechada; el envío no crea una orden conciliada ni activa automáticamente un minero. |
| Recargar | **Flujo de demo + checkout común** | Abrir Recargar y llegar al checkout está verificado. El saldo demo puede persistir; una transferencia no acredita saldo automáticamente. |
| Connect Wallet | **Código y mocks** | El estado permite identificar wallet/red, reusar una conexión compatible y mostrar dirección pública. Se probaron conexión simulada, cierre y rechazo simulado. Proveedores reales no se probaron en esta sesión. |
| Pago desde móvil | **Falla reportada; sin verificación REA en dispositivo** | El usuario probó MetaMask Android y reportó que apareció un navegador interno vacío, sin solicitud de conexión. El código actual usa MWP con App Link HTTPS `/connect/mwp`, pero no quedó registrada la URL/build que se probó. Solflare y Phantom tienen flujos nativos cifrados en código; su apertura real no se verificó. REA no encontró un teléfono conectado. |
| Precio y gas | **Cotización pública; coste final externo** | El checkout convierte el precio del catálogo con cotizaciones observadas, controla su caducidad y muestra el gas como estimado por la wallet. El gas definitivo y la confirmación dependen de la wallet/red; Bridge tiene mínimos, liquidez y resultado variables. |
| Suscripción y referidos | **Demo** | Se pueden recorrer y calcular beneficios de forma local. La transferencia no activa suscripción, bonificación ni renovación real. El anual permanece deshabilitado hasta confirmar su precio. |
| Pool y granjas | **Datos públicos/demostración** | Las vistas de pool pueden mostrar historial público de Kryptex; workers y granjas no son telemetría propia verificada ni operaciones de GoMining. |
| Firebase | **Persistencia demo verificada; backend financiero pendiente** | En la continuación tras la autorización se desplegaron únicamente Auth anónimo y las reglas restringidas de Firestore en `salad-miners`; el comando confirmó `Deploy complete`. No hubo despliegue de Hosting, Functions, facturación ni backend financiero. Las lecturas CLI posteriores encontraron la base `(default)` en `nam5`; `functions:list` falló de forma genérica y no permite afirmar si hay funciones remotas. El ejemplo `unilevel-ejemplo/1nvezt` pertenece a otro producto. [Requisitos oficiales de Cloud Functions](https://firebase.google.com/docs/functions/faq-and-troubleshooting) |
| Contabilidad y recepción Bridge | **No completa** | Las direcciones, fee y neto visibles no prueban que Solflare reciba o convierta el depósito. No se validó un recibo existente en cadena ni una cotización Bridge en cuenta autenticada. |

## Siete comprobaciones que siguen pendientes

1. **Wallets reales:** conectar y desconectar Solflare, Phantom, MetaMask, Coinbase Wallet, Trust Wallet, TronLink y UniSat, y comprobar el proveedor de cada red.
2. **MetaMask real en Android:** el usuario informó que abrió un navegador interno vacío; no se mostró una autorización verificable. Falta repetir con el build actual en un dominio HTTPS, aprobar o rechazar Connect y confirmar el regreso. La simulación de rechazo no elimina este pendiente.
3. **Recibo on-chain real:** revisar una transferencia ya existente y verificar remitente, red, destino, activo, importe y estado. El recibo de QA usa un hash ficticio.
4. **Solflare Bridge en vivo:** confirmar en la cuenta/ruta disponible los destinos, tokens aceptados, cotización, mínimo, fee, neto y resultado real. Esta auditoría no puede inferir esos datos privados de capturas o direcciones aisladas.
5. **Tokens adicionales:** definir e implementar cada token de Bridge solo cuando contratos, decimales, red y compatibilidad estén confirmados.
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

- El usuario informó que MetaMask Android abrió un navegador interno vacío, sin mostrar una aprobación de conexión. No se registró la URL exacta ni se puede demostrar que el teléfono cargara el build actual. REA ADB encontró cero dispositivos, así que no fue posible reproducirlo con captura controlada. El código actual usa `mobile.useDeeplink: !isMobileBrowser()` y, desde móvil, el SDK escoge el Universal/App Link HTTPS MWP; el helper `/dapp/` está retirado. La documentación oficial indica que MetaMask Connect está diseñado para enlazar a la app desde navegador móvil y que el enlace `/dapp/` abre específicamente el navegador interno; esto no determina por sí solo por qué se vio la página vacía en esta prueba. [Plataformas compatibles](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/supported-platforms.md) · [Guía oficial de deeplinks](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks.md). La incidencia permanece abierta.

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

## Continuación tras autorización Firebase CLI · 2 de noviembre de 2026

### Firebase de demostración

La autorización CLI permitió enumerar el proyecto `salad-miners` con `firebase-tools 15.34.2`. Desplegué únicamente Auth y reglas Firestore con `firebase deploy --only auth,firestore:rules --project salad-miners --non-interactive`. Firebase confirmó `Auth providers enabled: anonymous`, compiló las reglas, las liberó y terminó con `Deploy complete`; indicó que las reglas ya estaban vigentes y omitió su carga. No hubo despliegue de Hosting, Cloud Functions ni cambio de facturación. Las reglas siguen limitando la sincronización a `users/{uid}/demoState/current` y denegando las demás rutas; el cliente sigue guardando solo datos de demostración.

`firebase functions:list --project salad-miners` volvió a responder `Failed to list functions for salad-miners`. Es un error genérico y no permite concluir si existen funciones remotas. El `firebase.json` de este workspace no declara codebase de Functions, y el proyecto no tiene aquí código backend de pagos. La autorización CLI y el despliegue de Auth/Firestore no crean un conciliador ni habilitan compras automáticas.

### REA, Android y build

El análisis estático REA/Linux de ocho archivos fuente expiró a los 450 segundos en el cliente (`timed out awaiting tools/call`), sin Evidence entregada. No se repitió esa solicitud; se conserva la limitación de tiempo del host y la evidencia REA anterior del 2 de noviembre con su alcance de tres módulos. REA ADB volvió a informar cero dispositivos disponibles (`ev_75a6248230841cbf135cfd6cbcce39e9bb3958c9cf71465f19b63d70ce23d9fb`), por lo que el flujo MetaMask Android no pudo comprobarse físicamente.

`npm run build` pasó con TypeScript y Vite; se transformaron 564 módulos. Permanece el aviso no bloqueante de Rollup por el chunk Solana de 695.66 kB. No se conectó una wallet, no se abrió una aprobación, no se firmó ni transmitió un pago y no se desplegó un backend financiero.

### Estado de aceptación

El checklist conserva **70/77 comprobaciones confirmadas y 7 pendientes**. Los pendientes siguen siendo proveedores reales; MetaMask Android; revisión de una transferencia real; rutas Bridge y sus cotizaciones vigentes; tokens adicionales con contrato confirmado; elegibilidad/KYC por proveedor, ruta, región y monto; y el backend de pedidos, verificación, idempotencia y activación. Ninguno puede darse por completo con el despliegue de persistencia demo.

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
