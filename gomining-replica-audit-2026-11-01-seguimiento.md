# Seguimiento de auditoría y reparaciones · réplica GoMining

**Fecha:** 1 de noviembre de 2026  
**Entorno:** `http://127.0.0.1:5173` (Vite activo); preview previo `http://127.0.0.1:5183`; preview actual `http://127.0.0.1:5184` y [HTTPS temporal público](https://luis-reach-award-publicity.trycloudflare.com/home).  
**Checklist:** [`gomining-replica-checklist.md`](./gomining-replica-checklist.md)  
**Cierre REA anterior:** [`gomining-replica-audit-REA-2026-11-01-cierre.md`](./gomining-replica-audit-REA-2026-11-01-cierre.md)

## Resumen

Se corrigió el cierre del checkout, se conectó la persistencia local a la configuración Firebase de prueba y se añadió una copia de respaldo por navegador. El guardado ahora usa una lista explícita de campos demo; no incluye direcciones de wallet ni los recibos de transferencias que permanecen en estado separado de React. Cuando Firebase no está disponible, el aviso indica que el estado se conserva en el navegador y explica la causa.

La comprobación de UI recorrió el configurador, Recargar, añadir USD 42 de saldo demo, recargar la página y volver a abrir/cancelar el checkout. El importe se conservó después de la recarga. No se conectó una wallet ni se aprobó una transacción.

**Actualización posterior a la autorización del usuario:** Auth anónimo y las reglas restringidas de Firestore ya se desplegaron en `salad-miners`. Las pruebas REST, del SDK Web y de ida/vuelta desde la interfaz pasaron: una sesión aislada de `localhost:5173` guardó USD 1 demo, mostró `Demo guardado` y restauró USD 1 tras recargar. No se modificó la sesión de trabajo en `127.0.0.1`. El error administrativo descrito en las primeras secciones corresponde al intento inicial, antes de que el usuario autorizara Firebase CLI.

## Lista de requisitos y estado

| Área del checklist | Estado | Evidencia y límite actual |
|---|---|---|
| 1. Inicio, navegación y diseño | **Parcial · rutas cubiertas históricamente; reparación actual verificada en móvil** | El cierre anterior registra las 56 comprobaciones de URL y recorridos visuales a 390/768/1440 px en algunas vistas. En esta pasada REA, Inicio se abrió a 390 × 844 y el configurador se abrió/cerró. No se revisaron píxel por píxel todas las rutas. |
| 2. Crear/comprar minero | **Configurador verificado; compra real pendiente** | REA abrió el configurador desde Inicio y la X lo cerró, quitando `modal=paywall-create`. No se hizo solicitud de firma. Catálogo estático y fechado; no se verifica orden ni activación remota. |
| 3. Recargar | **Demo persistente local y checkout verificados** | Se añadió 42 USD demo, se recargó el mismo navegador y el balance continuó visible; luego se abrió el checkout común y Cancelar lo cerró. No se conectó wallet, no se acreditó un depósito real. |
| 4. Connect Wallet | **Conectores en código; conexión real pendiente** | Se mantienen proveedores directos, sin WalletConnect/Project ID. No se conectó ni desconectó una extensión en esta comprobación. |
| 5. Cotización, red y recepción | **Código y evidencias previas; envío no probado** | El checkout presenta precio/cotización y destino. No se hizo transferencia; bridge, mínimos, slippage y llegada final siguen sin verificación de servidor. |
| 6. Suscripciones | **Checkout visual verificado; beneficio demo** | REA abrió el pago mensual de $29.99 a 390 × 844; apareció skeleton y cargó la cotización BNB. No se conectó wallet, no se hizo pago, ni se ejecutó activación, bonus o retiro. |
| 7. Referidos y Unilevel | **Simulador local/código** | Fórmulas y controles están en la réplica; no se emitió pago ni se probó el ledger. |
| 8. Pool, operaciones, workers y granjas | **Lectura pública, responsive verificada e interfaces demo** | REA vio 15 pagos en tarjetas accesibles a 390/768 px y la tabla a 1280 px. El informe de cierre documenta el historial público Kryptex y la paginación. No hay telemetría de granjas/workers propios ni reparto automático a clientes. |
| 9. Economía del operador | **Calculadora de escenario** | Los costos son parámetros y la lectura PRL es estimada. No son ingresos ni márgenes conciliados. |
| 10. Preventa | **Demo** | Sin contrato, tokens emitidos ni campaña real. |
| 11. Firebase y persistencia | **Servicio remoto, SDK y vuelta UI verificados** | Auth anónimo y reglas ya se desplegaron. REST y SDK Web confirmaron aislamiento, escritura y lectura. En una sesión UI anónima aislada de `localhost:5173`, USD 1 demo se guardó y reapareció tras recargar. La sesión `127.0.0.1` no se modificó. |

## Cierre REA adicional · checkout de suscripción en móvil · 1-nov-2026

En el preview local `http://127.0.0.1:5183`, REA abrió Inicio y la vista de suscripciones en 390 × 844 px. La primera captura del checkout enseña su loader esquelético específico para la cotización, con el botón X visible. En el mismo recorrido se esperó a que apareciera `dl.wallet-payment-quote`; la segunda captura muestra el importe BNB para el plan mensual de $29.99.

| Evidence ID | Resultado |
|---|---|
| `ev_7ac451ef72995ef030dc401f5ea5f0fe7851a45e072b8c8524d52bdf503f4cb2` | Inicio en 390 × 844; visible `Conectando guardado demo…`. La captura no confirma sincronización completada ni creación de cuenta anónima. |
| `ev_3c3f1b2478bcd39b5cde729bf0fd377eb3d83f2fdcace175259022a19cf6d4d5` | Checkout mensual durante carga; skeleton visible, sin wallet conectada. |
| `ev_71a0c8a50e5d5b94486bbbfc0f18a9234ddee12d7e52eb18a03aab46c3ccb40a` | Cotización BNB cargada en checkout mensual a 390 × 844. |

No se conectó una wallet, no se pulsó Pagar, no se firmó y no se transmitieron fondos. El test confirma solo que el flujo de interfaz y la cotización cargan en tamaño móvil; no prueba que un deeplink abra la app móvil, que la wallet regrese a la página o que el pago sea conciliado. Las pruebas móviles reales requieren iOS/Android y una URL HTTPS estable. El texto `Conectando guardado demo…` tampoco basta para afirmar el resultado de Firebase en esta sesión; la ida/vuelta Firebase verificada por separado permanece documentada arriba.

## Recorridos de REA reproducidos

### Crear minero y cerrar configurador

- Inicio a 390 × 844.
- Pulsar **Crear minero** abre `/home?modal=paywall-create`.
- Pulsar la X quita el modal y limpia el query `modal`.
- Evidence: `ev_168c4e79957698e3165b0a924710a07d9ef0f73b508ae2b24766ebad5ff33156`.

### Recarga, persistencia local y cierre del checkout

- Abrir Cartera virtual y el diálogo Recargar.
- Escribir `42`, añadir el saldo demo y comprobar que el balance se actualiza.
- En el recorrido inicial, antes de autorizar Auth/Firebase, se recargó la página en el mismo perfil: el balance continuó visible y la app mostró `Sin nube · guardado local`, con el mensaje para habilitar Auth anónimo.
- Volver a Recargar, abrir el checkout común y cancelar; el diálogo desaparece sin conectarse a wallet ni llamar a la acción Pagar.
- Evidence: `ev_1eb8b5dd6686327d484f0759422794bfbbcf7d77893cf9df06034f7da4012081`; 15 pasos completados.

### Cotización y X/Cancelar en reposo

- Recargar → checkout → Cancelar y, en una segunda apertura, X; ambos cierres ocurrieron sin firma.
- Evidence: `ev_168c4e79957698e3165b0a924710a07d9ef0f73b508ae2b24766ebad5ff33156`.

## Mobile wallet: código comprobado y límites

La prueba local simuló un user-agent de iPhone y comprobó los constructores de enlaces del código. Se generó una ruta para MetaMask, Solflare, Phantom, Coinbase Wallet, Trust Wallet y TronLink; UniSat devolvió “sin enlace móvil”. La comprobación confirma forma/ruta de URL y condición HTTPS, no que la app exista en el teléfono ni que abra, conecte o regrese correctamente. La URL ngrok compartida devolvió `ERR_NGROK_6024` sin un encabezado especial; con el encabezado de omisión devolvió HTTP 200. Después se inició un Quick Tunnel temporal de Cloudflare y REA confirmó que el preview público abre la réplica sin esa intersticial; sigue pendiente probar la app de wallet en un teléfono.

La conexión en Phantom móvil requiere abrir la página dentro del navegador de Phantom; Solflare documenta `browse` para abrir la dApp dentro de su navegador antes de Connect. Fuentes: [Solflare Browse](https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse), [Phantom en móvil](https://help.phantom.com/articles/29995498642195), [Trust Wallet deep links](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [TronLink deep links](https://docs.tronlink.org/mobile/deeplink/) y [MetaMask deep links](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks.md).

Pendiente: probar dominio HTTPS estable desde iOS y Android, apertura de la wallet, conexión, regreso al checkout, rechazo y actualización de cotización. El Quick Tunnel actual de Cloudflare sirve como URL HTTPS temporal y su host puede cambiar al reiniciarse. No se puede validar la app móvil con un navegador de escritorio REA.

## Firebase: integración y pruebas posteriores a la autorización

### Reparaciones locales

- `src/demoStore.ts`: la serialización usa una lista explícita de campos. Excluye `ownerWallet`, extensiones futuras del estado y recibos de pago on-chain.
- `src/firestoreDemoSync.ts`: crea una copia por navegador bajo una clave de versión; la restaura antes del sync, comparte una sola solicitud de sign-in anónimo, mantiene el respaldo al fallar la nube y reporta el estado solo después de guardar.
- `src/App.tsx` y `src/styles.css`: distinguen `Guardando`, `Demo guardado`, `Sin nube · guardado local` y el motivo recuperable.
- `firebase.json` habilita Auth anónimo y apunta a `firestore.rules`; `.firebaserc` selecciona `salad-miners`. `.env.local` está cubierto por `.gitignore` y no se copió a documentos.

### Resultado remoto

El primer intento anterior a la autorización administrativa devolvió `auth/admin-restricted-operation`. Después de que el usuario autorizó Firebase CLI, se comprobó la configuración remota y se publicó `firebase.json` más `firestore.rules` en `salad-miners`.

**Estado remoto confirmado:** Auth responde 200 y tiene Anonymous habilitado. Firestore tiene un release `cloud.firestore`; el SHA-256 del source remoto coincide con el archivo local (`32492df4a0e32668574c97cca12df1845d82e67c773577c81b15671a96c40af9`). La regla da acceso solo a `users/{uid}/demoState/current` y deniega el resto.

**Prueba temporal del servicio:** se creó una cuenta anónima con origen `http://127.0.0.1:5173`, se comprobó acceso propio y aislamiento entre usuarios, se escribió y leyó un snapshot demo válido, y se eliminaron la cuenta y el documento de prueba. Resultados HTTP: Auth 200; lectura propia inexistente 404 (permiso concedido, documento ausente); lectura de otro UID 403; escritura 200; lectura posterior 200; limpieza 200/200. No se usaron direcciones ni recibos de wallet.

**Verificación actual de interfaz:** en Brave, `http://127.0.0.1:5173/home` mostró `Demo guardado`; Recargar y el configurador cerraron con Cancelar/X y devolvieron la ruta a `/home`. Para probar la nube sin alterar ese perfil ni su wallet, se abrió una sesión aislada en `http://localhost:5173/home`, se añadió USD 1 con Recargar → Añadir saldo demo y se esperó el estado `Demo guardado`. Tras recargar esa misma sesión, USD 1 volvió a mostrarse. Esto confirma la ida/vuelta del SDK usado por React en el origen `localhost`; no prueba sincronización entre orígenes ni entre cuentas. El respaldo local sigue funcionando si la nube falla. No hay backend de pagos, verificador on-chain, idempotencia ni activación real de mineros.

## Errores y recuperación de REA

Un análisis inicial de REA/Linux falló por `integrity_mismatch`: el build cambió `dist/index.html` mientras REA inventariaba el proyecto. No se trató como un problema del servicio MCP. Al limitar el análisis a los seis archivos fuente seleccionados en `src/` (`App.tsx`, `WalletPaymentCheckout.tsx`, `walletAppLinks.ts`, `walletSession.ts`, `firestoreDemoSync.ts` y `demoStore.ts`), el análisis estático terminó correctamente: evidencia `ev_771f4fa0989d87672f5dbb2c5c68ebb3f3e1a6e5b060bb32f84fa0ea664f4c1e`, raíz de fuentes digest `e8c5ccfc0f29fe7f540da4473ef7c435cc7b5e27d398044ca00784210858ecf4`, seis archivos seleccionados y analizados, cero errores de parseo, 405 hallazgos estáticos y 16 archivos inventariados sin seleccionar. La cobertura de relaciones del grafo es parcial; los hallazgos no equivalen por sí solos a defectos confirmados ni prueban comportamiento en ejecución.

Se ejecutó `npx -y rea-agents@6.8.0 doctor --client codex --json` siguiendo la instrucción del usuario. El resultado fue `healthy: false` porque el Node de Windows detectado es 22.17.1 y la versión mínima que doctor acepta es 22.23.4 (también admite 24.22.1 o 26.12.1+). La inscripción MCP de Codex aparece alineada. El `binary_session` de REA/Linux identificó el servidor 6.8.0 activo, sin target abierto ni limpieza pendiente; el análisis estático Linux sí funcionó. Los proveedores nativos que doctor marca como no instalados no son necesarios para este análisis de JavaScript. No se cambió la instalación ni la configuración de REA.

Una primera prueba posterior a recargar usó un selector de Inicio mientras el navegador seguía correctamente en `/finance/wallets/virtual`; ese selector era incorrecto, no la ruta. Se corrigió la secuencia y el recorrido final pasó. La evidencia de esa prueba preliminar es `ev_835268a7e0b6a708f4fb448c3dd5833eeb2df509bbb245f0a85690b0a5be54ce`; la verificación corregida de persistencia y cierre es `ev_1eb8b5dd6686327d484f0759422794bfbbcf7d77893cf9df06034f7da4012081`.

## Validación de la compilación y servicio local

- `npm run build`: **correcto** (TypeScript y Vite).
- Aviso que se mantiene: chunk `index.esm-BPrexJCu.js` de 695.91 kB, supera 500 kB.
- Vite reiniciado en `127.0.0.1:5173`; HTTP `GET /home` respondió `200`.
- No se firmó, transmitió ni aprobó ningún pago. No se ejecutó un pago Mainnet como prueba.

## Actualización incremental REA · 1-nov-2026

### Hallazgo y reparación: proveedor de Trust Wallet

La inspección del código encontró que `walletAppLinks.ts` reconocía el proveedor `window.trustwallet.ethereum` para decidir si ya se está dentro de la wallet, pero `walletSession.ts` solo descubría proveedores EVM mediante EIP-6963, `window.ethereum` y `coinbaseWalletExtension`. En una instalación donde Trust Wallet expone solo su namespace y no publica metadatos/flags, la interfaz podía mostrar la wallet disponible y luego fallar al conectar.

Se corrigió `discoverEvmProviders()` para añadir el proveedor namespaced con el identificador `com.trustwallet.app`, y se sincronizó la comprobación de disponibilidad móvil con los flags de proveedor Trust cuando existen. El ajuste no pide permiso al conectar automáticamente: la restauración sigue limitada a cuentas ya autorizadas; la solicitud de conexión ocurre solo al pulsar el botón.

**Evidencia REA/Linux:** `ev_2fb963e2b148b3fa07e9239df252dedc8b6e816ff3a0612ce19bf4b3bc3f83fc` (vista resumen) y análisis padre `ev_2f390522178ddaa42d335257c7d6a393a655daeb908135b8d2174161ee53c2f4`; directorio `src/`, digest `416eb3dbd8668b9e561149581649628159dc016676ff8d988832ce0ffd2e97f1`. Se pidieron `walletSession.ts` y `walletAppLinks.ts`: REA examinó 42/42 elementos del inventario, analizó dos archivos, parseó 5,563 nodos AST, registró 32 hallazgos estáticos y cero errores de parseo. Quedaron 20 archivos sin seleccionar; la cobertura de relaciones es parcial. Esto confirma estructura y sintaxis del código, no conexión en ejecución con Trust Wallet.

### Build y rutas locales

- `npm run build`: **correcto** después del arreglo. Rollup conserva un aviso porque `index.esm-BPrexJCu.js` pesa 695.91 kB sin comprimir.
- El servidor local PID 13952 respondió HTTP 200 para `/home`, `/home?modal=paywall-create`, `/subscriptions`, `/gmt-wallets` y `/finance/wallets/virtual`.
- No se añadieron pagos, hashes, direcciones de wallet ni frases semilla al respaldo de estado demo. No se aprobó una transferencia.
- El cierre de X/Cancelar durante una solicitud y el rechazo 4001 están contemplados en el código, pero no se reprodujeron con un proveedor real que mantuviera una solicitud pendiente. Cerrar la página no puede revocar el diálogo interno de una wallet.

### Intentos de REA y alcance del resultado

Un análisis sobre la raíz completa se inició mientras `npm run build` reemplazaba `dist/index.html` y REA lo rechazó con `integrity_mismatch`. Después se corrió `npx -y rea-agents@6.8.0 doctor --client codex --json`: `healthy: false` por Node de Windows 22.17.1 (el doctor requiere 22.23.4+ en la línea 22); la inscripción de Codex está alineada. REA/Linux 6.8.0 seguía disponible, sin sesión abierta ni limpieza pendiente.

Dos intentos posteriores sobre la raíz completa superaron el límite del cliente de 450 segundos y no devolvieron Evidence. No se repitieron iguales. Al apuntar a `src/` y seleccionar exactamente dos archivos, REA terminó en 4.7 segundos; esta es la evidencia anterior. El éxito está acotado a esos dos archivos y no reemplaza la auditoría visual o de ejecución de toda la aplicación.

### Estado de la lista pedida

| Requisito | Estado actual |
|---|---|
| Mostrar la wallet conectada en el encabezado y separar el saldo demo | En la UI actual, el árbol accesible mostró una sola entrada de wallet, `Saldo demo`, carrito y perfil; no mostró botones de notificación. Captura visual comparativa pendiente. |
| Recargar con wallet y abrir el mismo checkout | La UI actual mostró la wallet ya conectada en Recargar y cerró con Cancelar y X. No se pulsó Pagar; la transferencia no se verifica ni acredita saldo. |
| Enviar desde app móvil de wallet | Enlaces de apertura/reanudación codificados para MetaMask, Solflare, Phantom, Coinbase Wallet, Trust Wallet y TronLink. UniSat carece de enlace móvil implementado. Sin dispositivo iOS/Android, dominio HTTPS sin intersticial y wallet instalada no puede certificarse abrir, conectar, regresar, firmar o rechazar. |
| Cerrar checkout al cancelar/rechazar | En la UI actual, Cancelar y X cerraron Recargar y X cerró el configurador en reposo. No se abrió una petición real de wallet; durante una solicitud externa pendiente, el cierre de la página no revoca la solicitud dentro de la wallet. |
| Eliminar iconos duplicados | El árbol accesible actual contiene una entrada de wallet, saldo demo, carrito y perfil; no aparecen botones de notificación. La auditoría visual previa también lo verificó. |
| Persistencia anónima en Firebase `salad-miners` | Configuración remota desplegada; REST, aislamiento, SDK Web y vuelta UI verificados. Una sesión aislada `localhost:5173` restauró USD 1 demo después de recargar. La sesión `127.0.0.1` no se modificó. El error `auth/admin-restricted-operation` es histórico, previo a la autorización del usuario. |
| Compra, suscripción y recarga real con activación automática | No cumplen aún: el código puede pedir una transferencia y mostrar hash, pero falta una orden con precio firmado por servidor, verificador de cadena, conciliación/idempotencia y activación. No convertir un pago directo en producto hasta implementar ese backend. |

No se debe interpretar “el botón de pago está habilitado” como “la compra se completó”: la wallet firma una transferencia directa, pero el backend actual no verifica destino, importe, confirmaciones, duplicados o producto. Para revisar el estado y los pasos pendientes, usa [`gomining-replica-checklist.md`](./gomining-replica-checklist.md).

## Actualización de revisión · 1-nov-2026 · soporte móvil y Firebase

### Deeplink móvil de Phantom

La inspección oficial de la guía de Phantom Wallet Adapter muestra que la apertura del navegador interno usa `https://phantom.app/ul/browse/<url>?ref=<origin>`. La réplica estaba construyendo el mismo enlace sobre `phantom.com`, que no coincide con el host del flujo publicado. Se corrigió en `src/walletAppLinks.ts`; el build generado contiene el destino `phantom.app`.

REA/Linux volvió a analizar, sin ejecutar el código, `walletSession.ts`, `walletAppLinks.ts` y `WalletPaymentCheckout.tsx`. Evidencia del análisis: `ev_ad686eaf0d42ee74f739f167ae803a9239a0b57458ecf9cfa6828f72ec45849e`; vista resumen: `ev_24c6145ef06196248b447dd1ed273fd498af07d6b6e17fff483291199814ec85`. Identidad del directorio `src/`: SHA-256 `416eb3dbd8668b9e561149581649628159dc016676ff8d988832ce0ffd2e97f1`. REA inventarió 22 archivos, seleccionó y parseó esos tres, recorrió 8,792 nodos AST y registró 86 hallazgos, con cero errores de parseo. Quedaron 19 archivos fuera de selección y la cobertura semántica/aplicativa permanece parcial; este análisis estático no demuestra que una wallet abra o firme en un teléfono.

La ruta móvil sigue dependiendo de un dominio HTTPS público y de que la persona abra el enlace desde su acción. Solflare, Phantom, Trust Wallet y TronLink tienen un flujo de apertura de dApp documentado; UniSat usa un protocolo móvil con callback propio y no tiene enlace web de retorno implementado en esta réplica. En iOS/Android reales sigue pendiente comprobar apertura, conexión, regreso, rechazo y cancelación. En checkout, cerrar con X, Cancelar, fondo o Escape quita el modal; si la wallet deja una solicitud interna en curso, la página no puede cancelarla por ella.

### Deeplink de red de Trust Wallet

La revisión del código detectó que el enlace móvil de Trust Wallet enviaba `coin_id=60` para todas las redes EVM. Eso podía abrir Ethereum al pagar por BNB o Polygon. Se ajustó `src/walletAppLinks.ts` para usar BNB 714, Polygon 966, Ethereum 60, Bitcoin 0, TRON 195 y Solana 501, siguiendo el campo de red documentado por Trust Wallet. Una comprobación local de la función confirmó los seis parámetros y que el enlace se limita a destinos HTTPS públicos. No se pudo abrir el deeplink en una app móvil instalada.

Fuentes: [Phantom Wallet Adapter](https://github.com/anza-xyz/wallet-adapter/blob/master/packages/wallets/phantom/src/adapter.ts), [Solflare Browse](https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse), [Trust Wallet Deep Linking](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking), [TronLink DeepLink](https://docs.tronlink.org/mobile/deeplink/) y [UniSat Mobile Wallet](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet/connect-with-unisat-mobile-wallet).

### Firebase y datos persistentes

`.firebaserc` selecciona `salad-miners`. `firebase.json` habilita Auth anónimo y apunta a `firestore.rules`. Las reglas remotas publicadas coinciden exactamente con el archivo local: permiten al usuario autenticado leer/escribir solo `users/{uid}/demoState/current` y niegan el resto. El serializador conserva campos demo acotados y omite direcciones de wallet y recibos de pagos de cadena.

El usuario completó la autorización de Firebase CLI. Se desplegaron Auth anónimo y las reglas de Firestore en `salad-miners`. Un ensayo REST temporal confirmó: Auth 200; lectura propia inexistente 404; acceso a otro UID 403; escritura válida 200; lectura posterior 200; eliminación del documento y de la cuenta temporal 200/200.

También se verificó el SDK Web de Firebase usado por la app, en un proceso aislado con persistencia de Auth en memoria: inicio anónimo, lectura de documento ausente, escritura del snapshot con `serverTimestamp`, lectura de regreso y limpieza de cuenta/documento. Todos los pasos pasaron. Para la prueba de interfaz se abrió un origen aislado `http://localhost:5173/home`; se añadió USD 1 demo, la app mostró `Demo guardado`, y el saldo persistió después de recargar. La sesión `http://127.0.0.1:5173` y su conexión de wallet no se modificaron. La prueba de interfaz deja el snapshot demo de esa cuenta anónima aislada en `salad-miners`; no contiene wallet ni pagos reales. No se guardaron claves, frases semilla, direcciones ni recibos on-chain.

El proyecto contiene datos demo solamente; no hay backend de órdenes, verificador on-chain, control de duplicados ni activación real de mineros/suscripciones. La autorización y configuración del proyecto de prueba no se deben reutilizar como configuración de producción. Referencias oficiales: [Auth anónimo](https://firebase.google.com/docs/auth/web/anonymous-auth) y [Firebase CLI y despliegue parcial](https://firebase.google.com/docs/cli).

### Validación local

- `npm run build`: **correcto** (TypeScript y Vite). Continúa el aviso de Rollup por un chunk de 695.91 kB sin comprimir.
- El servidor en `127.0.0.1:5173` respondió HTTP 200 para Inicio, configurador, Suscripciones, Carteras y Cartera virtual.
- El árbol accesible actual del encabezado contiene un solo acceso de wallet, saldo demo, carrito y perfil; no aparecen dos iconos de notificación. En Recargar se mostró MetaMask ya conectada. No se solicitó ni aprobó una transacción.
- Inicio mostró `Demo guardado` tras recargar; además, `localhost:5173` guardó USD 1 desde la interfaz y lo restauró después de recargar. REST/SDK confirmaron lectura/escritura remota. La prueba fue aislada y no cambió la sesión de `127.0.0.1`.
- No se firmó ni transmitió ningún pago real. La conciliación de pagos, activación de producto y prueba con apps móviles siguen pendientes.

### REA/Linux: análisis estático de las reparaciones

REA/Linux analizó `walletAppLinks.ts`, `walletSession.ts`, `WalletPaymentCheckout.tsx`, `firestoreDemoSync.ts` y `demoStore.ts` desde `src/`. Evidence: `ev_02d4fc721e880ac45a6bce16f48087cd67cddfe7701c16195b0fd65835dee9dc`, estado `complete-within-view`. El análisis cubre los cinco archivos seleccionados; no ejecuta el flujo ni demuestra apertura/firma en una wallet móvil. La auditoría visual previa de REA está en [`gomining-replica-audit-REA-2026-11-01-cierre.md`](./gomining-replica-audit-REA-2026-11-01-cierre.md).

**Reintento final de alcance:** pedí analizar de forma acotada `walletSession.ts`, `walletAppLinks.ts` y `App.tsx`; la llamada de REA/Linux excedió el límite del cliente de 450 s sin devolver Evidence. No repetí la solicitud. Este resultado no invalida el análisis previo de cinco módulos ni la inspección de código y navegador descrita arriba; tampoco se presenta como un hallazgo nuevo de REA.

El diagnóstico local de REA informó Node de Windows 22.17.1 por debajo del mínimo que acepta `rea doctor` (22.23.4 en la línea 22). La sesión REA/Linux 6.8.0 y sus herramientas estaban disponibles en los registros previos; no cambié la instalación global ni la configuración de otros clientes. La compilación actual de TypeScript/Vite terminó correctamente, con el aviso conocido de un chunk de Solana de 695.91 kB.

## Addendum de ejecución · checkout móvil y cierre · 1-nov-2026

### Reproducción y corrección del cierre

En una pestaña local temporal a 390 × 844 px abrí el configurador, acepté el consentimiento y llevé el checkout hasta el final. El botón X originalmente era `position:absolute`; después de desplazar el diálogo quedaba fuera del viewport. Se cambió a un control `position:sticky`, visible y con contraste, dentro del diálogo. En la misma anchura la X permaneció en el borde superior mientras el contenido estaba desplazado. X y Cancelar cerraron el modal en reposo.

Para cubrir la solicitud pendiente sin conectar MetaMask ni transmitir fondos, se creó un harness local transitorio con una wallet falsa cuya promesa `sendPayment()` nunca resuelve. Se verificó que X y Cancelar cierran la pantalla y que el estado de la interfaz reconoce la solicitud pendiente. El aviso explica que cerrar la página no cancela el diálogo mantenido dentro de una wallet real. El harness se retiró al acabar; no quedó incluido en la aplicación ni en el staging REA.

### Separación de cotización y solicitud de wallet

El código anterior comparaba el importe cripto con igualdad exacta; una diferencia mínima en el último decimal obligaba a repetir el flujo. La nueva comparación usa un umbral relativo de 0.1% para precio/importe. Si la cotización sigue dentro de ese margen y no está vencida, se envía a la wallet la cifra fresca que el checkout muestra. Si supera el umbral, venció o cambió el USD/MXN, el checkout actualiza el importe y pide revisarlo antes de abrir la wallet. El texto “la wallet tiene una solicitud abierta” y “Espera la wallet…” ahora solo aparecen cuando ya se invocó `sendPayment()`, no durante la actualización de la cotización.

Esta comprobación usó un proveedor falso para su promesa pendiente; no reproduce el cuadro de cancelación de MetaMask, Solflare u otra extensión. No confirma el pago, la recepción de fondos ni el producto adquirido. El checkout sigue sin backend de órdenes/verificación on-chain.

### Encabezado e interacción móvil

En el DOM actual del Inicio se observó un botón de wallet, saldo demo, carrito y perfil, sin controles de notificación; no se identifican iconos duplicados. A 390 px no hubo desbordamiento horizontal. La etiqueta compacta de Saldo demo se subió a 8 px para ganar legibilidad; no se hizo una auditoría visual completa de cada ruta en 768/1440 px en esta actualización.

### Compilación y análisis REA/Linux de código actualizado

`npm run build` terminó correctamente: TypeScript y Vite pasaron. Permanece el aviso de Rollup por un chunk de 695.91 kB sin comprimir. Se eliminó el harness temporal antes de crear el staging.

REA/Linux analizó estáticamente siete fuentes en `.rea-audit-staging-2026-11-01`: `WalletPaymentCheckout.tsx`, `walletSession.ts`, `walletAppLinks.ts`, `paymentQuote.ts`, `App.tsx`, `firestoreDemoSync.ts` y `demoStore.ts`. Evidence: `ev_e7c570b1aa11b89102e89eedd481406fe3c28c8837785596d490af3b3b4206a`; análisis padre `ev_563c3f625c3d83867baacc49f75d744f26ce55472548eb2829df22877592eb4d`; raíz staging SHA-256 `ac62fcc0b64aa403e5339768a8113485df55fe48ba07c884a8486929fecef547`. Los siete archivos seleccionados se parsearon (35,563 nodos AST; 421 hallazgos; cero fallos de parseo). Dieciséis archivos quedaron sin analizar; la cobertura de aplicación y relaciones semánticas es parcial (4,904 incógnitas semánticas). Esto es evidencia estática de código seleccionado, no una prueba de wallet o blockchain.

El diagnóstico `rea doctor` se completó usando Node portable 24.22.2 y reportó saludable el alcance del cliente Codex. La nota histórica de este informe sobre el Node global 22.17.1 no describe el entorno portable con que se completó este análisis. No se alteró el Node global ni la configuración de otros clientes. La revisión de REA se mantuvo acotada a los archivos fuente seleccionados; el análisis completo de la raíz no se repitió porque ya había agotado el límite del cliente en intentos anteriores.

### Estado de aceptación actualizado

| Requisito | Estado actualizado |
|---|---|
| Cierre del modal | X sticky visible al final del scroll a 390 px; Cancelar y X cierran en reposo. X/Cancelar también cierran bajo una solicitud simulada pendiente, sin wallet real. |
| Indicador de solicitud en curso | Separado de la actualización de la cotización; solo afirma “solicitud de wallet abierta” después de entrar a `sendPayment()`. Verificado con provider falso. |
| Importe cripto | Refresco exacto antes del envío. Variación ≤0.1% permite abrir la wallet con el valor fresco; cambio material, expiración o FX modificado obliga a revisar otra vez. Build correcto. |
| Header e iconos | Un acceso de wallet, saldo demo, carrito, perfil y cero iconos de notificación; comprobación DOM a 390 px. |
| Móvil real | Pendiente: no se probaron apps iOS/Android, deeplinks reales, conexión/rechazo ni retorno desde la wallet. |
| Pagos reales | Pendiente: no hubo firma, transmisión, backend de verificación, conciliación o activación de productos. |

La matriz completa permanece en [`gomining-replica-checklist.md`](./gomining-replica-checklist.md). El cierre anterior documenta el historial REA y Firebase; los siguientes addenda actualizan los hallazgos reproducidos después de ese cierre.

## Actualización REA: Operaciones en móvil — 1 nov 2026

### Cambio aplicado

El historial de pagos de Kryptex mantiene la tabla para escritorio y cambia a tarjetas en anchos de hasta 900 px. Cada tarjeta presenta fecha, estado de pool, importe PRL, comisión PRL, enlace a la transacción Pearl y botón para copiar el hash. La lista móvil expone semántica de lista/listitem y evita arrastrar una tabla ancha. El skeleton del historial también tiene una variante de tarjetas; el skeleton de tabla se reserva para escritorio.

### Evidencia de interacción

- **390 × 844 px:** REA abrió `/data-centers/operations`, esperó el contenedor móvil y capturó 15 pagos. El árbol accesible muestra la lista “Pagos publicados” y no incluye la tabla de escritorio. Evidence `ev_5eccfe4e546bb27997b66e4b999039ca2debacdabf728e74c7ddd5012419b0de`. [Ver captura a 390 px](./.rea-mobile-audit-2026-11-01/operations-390.png).
- **768 × 1024 px:** REA capturó la misma lista de 15 pagos, sin tabla ancha en el árbol accesible. Evidence `ev_b9308445ef0966d2822339314111c3bfa614300a125efb1a1e3c9a7d76354f02`. [Ver captura a 768 px](./.rea-mobile-audit-2026-11-01/operations-768.png).
- **1280 px:** el DOM del navegador actual muestra la tabla visible con 15 filas y oculta la lista de tarjetas. Esta observación se hizo con CUA sobre la pestaña local; no se conectó ninguna wallet.

La primera captura experimental a 390 px tuvo un paso de espera fallido porque un selector no único coincidía con las quince tarjetas. Se corrigió el selector y se repitió; la Evidence citada arriba es la repetición completa, con el paso terminado y captura disponible.

### REA estático y compilación

REA/Linux analizó `src/App.tsx` y `src/Skeletons.tsx` en el staging `.rea-audit-staging-operations-mobile-2026-11-01`. Evidence `ev_4511b4eff6505f67e0e45b0a9ba3e919d8bffc3156db75c414c5d82fe359d52c`; SHA-256 del staging `02f659def980ab82fbed52e089a6abf8139938c4f0b80cb5e9e7156288571bb5`. Dos fuentes seleccionadas, 24,325 nodos AST, 263 hallazgos estáticos y cero fallos de parseo; el CSS se inspeccionó por código y por captura visual, no por el analizador JavaScript. El tercer archivo inventariado no fue seleccionado y la cobertura semántica de aplicación sigue parcial. `npm run build` pasó; permanece el aviso de Rollup por un chunk de 695.91 kB.

### Qué cumple y qué sigue abierto

- **Corregido y verificado:** historial usable a 390/768 px sin tabla horizontal; tabla de escritorio preservada a 1280 px; skeleton específico móvil implementado.
- **Sigue pendiente:** el contenido es historial público de Kryptex, no telemetría de la granja del usuario. La auditoría visual integral de las demás rutas a 390/768/1440 px no queda completada por este cambio. Tampoco se probaron el botón Copiar ni la navegación al explorer mediante clic en esta pasada.
- **Sin pagos ni conexión:** no se conectó una wallet ni se aprobó o envió una transacción.

## Adenda · MetaMask Connect y estado demo persistente · 1-nov-2026

### Conexión de MetaMask en navegador móvil

Se sustituyó el enlace anterior `link.metamask.io/dapp/` por `@metamask/connect-evm` 2.1.1. Al tocar **Conectar MetaMask**, la integración llama `client.connect()` con la red del checkout; usa la extensión EIP-1193 directamente cuando está disponible y el SDK cuando no se detecta proveedor inyectado. El pago conserva el flujo separado: solo después de revisar la cotización y pulsar **Pagar** se solicita `eth_sendTransaction`. Se deshabilitó la analítica del SDK. En móvil se exige que el origen público sea HTTPS; no se trata `127.0.0.1` como URL de retorno válida para un teléfono.

La documentación oficial describe `client.connect({ chainIds })` como la ruta que gestiona extensión, QR o deep link móvil, y `getProvider()` como la interfaz EIP-1193 para solicitudes posteriores ([MetaMask Connect](https://docs.metamask.io/metamask-connect/), [quickstart](https://docs.metamask.io/quickstart/)). Esto sustenta el diseño de la integración, pero **no reemplaza la prueba en el dispositivo**: en esta sesión no se abrió MetaMask Android/iOS, no se autorizó una conexión real y no se hizo pago.

La conexión SDK guarda solo una marca local no sensible que permite intentar recuperar la sesión al recargar; no se guarda la dirección en esa marca, ni claves, frases semilla o tokens de Firebase. La limpieza de la sesión pasa por el `disconnect()` del cliente SDK. Las rutas de aprobación y cancelación todavía deben verificarse en una instalación móvil real. X y Cancelar sí cierran el checkout mientras `sendPayment()` queda pendiente en el proveedor falso ya documentado; cerrar la página no puede cerrar una solicitud interna que la app de wallet mantenga abierta.

### Revisión REA del código

REA analizó como texto inerte el directorio local y seleccionó `src/metamaskConnect.ts`, `src/walletSession.ts`, `src/WalletPanel.tsx`, `src/WalletPaymentCheckout.tsx`, `src/walletAppLinks.ts` y `src/App.tsx`. Evidence principal `ev_c4ccb7e0d1bf77bdfad98884686e27beb25e5c7f63460e1c3625a3205e2063d4`; resumen `ev_dee7d08118ce76289139765a8b2a916ad1a71feae02c34813de658bc899065f1`; vista de hechos de los seis módulos `ev_14b114400033d7d4682dd64fdc8c80b7a28d9862a2086783d6be7c6f94511902`. La identidad del directorio al analizar fue SHA-256 `ba2cf275b22a07399ffdadbe33d6f10a379ba209b0f6ea2f6814079de508b5ed`; la vista devolvió 355 observaciones relacionadas a los seis paths. El análisis no ejecutó ni reconstruyó el comportamiento de MetaMask: 19,246 archivos quedaron fuera de selección, 19,233 incógnitas de aplicación y 100,000 incógnitas semánticas quedaron retenidas al alcanzar el límite configurado. Algunas declaraciones TSX tienen análisis semántico parcial por referencias dinámicas. No se debe interpretar esa cobertura como prueba móvil o como ausencia de otros comportamientos.

La compilación `npm run build` pasó después de añadir tipo de retorno explícito a la función recursiva de clasificación de rechazo. Vite conserva el aviso de un chunk de Solana de más de 500 kB; no es un error de compilación.

La captura de escenario en REA/Linux continúa con `cleanup_incomplete` de un intento anterior. No se inició un navegador nuevo ahí. Se usó el análisis estático de REA en el directorio local. En el navegador visible de la réplica, CUA pasó de `Cargando la vista` al contenido de Inicio y configurador; el encabezado mostró wallet, saldo demo, carrito y perfil, y la sincronización indicada era `Demo guardado`. No se accionó la wallet que ya estaba conectada en esa pestaña.

### Firebase de demo

Tras la autorización del usuario se desplegaron Auth anónimo y `firestore.rules` en `salad-miners`. Las pruebas REST y del SDK Web validaron la sesión anónima, aislamiento por UID y lectura/escritura propia; los datos y la cuenta creados solo para esas pruebas se limpiaron. La prueba de interfaz aislada en `localhost:5173` añadió USD 1 de saldo demo y lo restauró tras recargar. Ese snapshot demo sigue en el proyecto bajo su cuenta anónima aislada; no contiene dirección de wallet ni transacción. La pestaña principal de `127.0.0.1` no fue modificada.

Firebase deja estado demo por navegador anónimo; esa identidad no permite recuperar el saldo en otro navegador/dispositivo ni equivale a una cuenta de usuario. El dominio HTTPS definitivo y la persistencia desde el dominio público todavía deben comprobarse. Las [guías oficiales de Auth anónimo](https://firebase.google.com/docs/auth/web/anonymous-auth) y [despliegue de proveedores con Firebase CLI](https://firebase.google.com/docs/auth/configure-providers-cli) describen las piezas activadas. El proyecto de prueba no tiene órdenes, verificador de pagos, conciliación ni activación de productos.

### Ajuste final de cancelación de conexión — 1-nov-2026

La conexión de una wallet ahora devuelve un resultado explícito (`connected`, `rejected` o `failed`). En el checkout, un rechazo explícito al conectar cierra el modal y muestra un aviso de que no se envió ningún pago. El usuario aún puede cerrar el checkout con X, Cancelar, Escape o tocando fuera; una solicitud abierta dentro de la app de wallet no se puede cancelar desde la página. `npm run build` pasó tras el cambio. No se provocó un rechazo en una MetaMask real; la prueba confirmatoria en teléfono permanece pendiente.

REA/Linux terminó el análisis estático de los dos módulos involucrados. Evidence del análisis: `ev_795d475edcee769ba23b8ff31a37219011e3f33e5e62a126376b16b392f5feb5`; vista resumen `ev_a7eb7072ea0ae921feadb5f7664a1dfc1b87672a03912c1bc9fa9ab476182066`; vista de hechos de `src/walletSession.ts` y `src/WalletPaymentCheckout.tsx`: `ev_478d73a6b15e8bfe2a548a3ffb1b7aa5569e4e50acbea04d2dcd85d6d93fa11d`. REA recuperó ambos módulos como texto estático, con cobertura semántica parcial: 19,250 archivos no seleccionados y el límite de 100,000 incógnitas semánticas alcanzado. No demuestra ejecución ni una respuesta real de MetaMask. No se lanzó otra sesión interactiva REA porque el intento anterior sigue reportando `cleanup_incomplete`.

### Mitigación de la pantalla en blanco de MetaMask Android — 1-nov-2026

El usuario informó que una prueba Android abrió un navegador interno de MetaMask en blanco, pero no quedó registrada la URL ni el esquema exacto de esa prueba. La ruta `/dapp/` se excluye porque carga la dApp dentro de ese navegador. En el corte que documenta este párrafo, el código usaba `mobile.useDeeplink: true` (`metamask://`); esa configuración se sustituyó después por `mobile.useDeeplink: false` para seleccionar el Universal Link HTTPS MWP. El SDK debe abrir la app para solicitar la conexión; la conexión pide permiso y comparte dirección, mientras que el envío requiere otra acción y confirmación. Falta probar el handoff vigente en Android con un dominio HTTPS accesible.

Esta corrección cambia el camino elegido por el SDK, pero todavía no puede marcarse como validada en Android: no se ejecutó el retorno en el dispositivo del usuario ni se autorizó una conexión real. La prueba de aceptación requiere confirmar que el enlace abre la app MetaMask (no su navegador interno), vuelve al checkout original, presenta la cuenta/red correctas y que Cancelar/rechazo cierra el checkout sin generar una transacción. No se ha enviado ni firmado ningún pago en esta revisión.

### Configuración intermedia del enlace MetaMask — supersedida · 1-nov-2026

En esa iteración se había cambiado `/dapp/` por `client.connect({ chainIds })` tanto desde Carteras como desde el checkout. `mobile.useDeeplink: true` seleccionaba `metamask://`; el checkout móvil conservaba `gmPay` con producto, importe, moneda, red y wallet para poder reconstruirse al volver. Después del reporte de pantalla en blanco, esa opción se sustituyó por `mobile.useDeeplink: false`, que selecciona el Universal Link HTTPS MWP. Se requiere validar la configuración actual en un teléfono.

La configuración intermedia se verificó por fuente, build y REA estático, pero no por teléfono ni con una conexión autorizada. MetaMask documenta el handoff móvil con `client.connect()` y deeplink a la app ([documentación](https://docs.metamask.io/metamask-connect/), [quickstart](https://docs.metamask.io/quickstart/)). La prueba Android de apertura, conexión, retorno, rechazo y cancelación permanece pendiente para el Universal Link actual.

La implementación actual se compiló y se pasó por REA CLI 6.8.0 en `src`. Se seleccionaron exactamente `walletAppLinks.ts`, `metamaskConnect.ts`, `walletSession.ts`, `WalletPanel.tsx`, `WalletPaymentCheckout.tsx` y `App.tsx`; los seis se parsearon, con cero fallos. Evidence padre `ev_155313638a0cd547812aeadc92495936c02d8f81980479b5a472a397c3ee43d4`; vista resumen `ev_5d79d2da0d8911c6685d53b42167dc423f772531ae69a76196ce0ccf99ea6e6b`; bundle local [`metamask-connect-mobile-20261101.evidence.json`](./.rea-mobile-audit-2026-11-01/metamask-connect-mobile-20261101.evidence.json). El inventario contiene 23 fuentes y 17 quedaron sin seleccionar; el grafo de aplicación y el grafo semántico son parciales, con 4,120 incógnitas semánticas. La inspección trata TS/TSX como texto inerte y no acredita ejecución. La llamada REA/Linux sobre el workspace completo expiró en el límite del cliente de 450 s; no se tomó como resultado y se acotó el CLI al directorio `src`.

### Smoke aislado de lógica demo — 1-nov-2026

Se ejecutó `src/demoStore.ts` transpilado en memoria, en un proceso Node aislado. Pasaron 11 aserciones sobre recarga demo, compra y worker, potencia, bonus mensual del 1%, texto de retiro con y sin suscripción, reward directo del 10%, preventa, exclusión de `ownerWallet` en el serializador y validaciones de entradas. No hubo UI, conexión de red, Firebase, RPC, wallet ni pago. El módulo y su estado temporal se descartaron al terminar; esto verifica reglas puras, no botones ni flujos de pantalla. Se conserva el total de 37/65 checks de UI y las pruebas de interfaz demo siguen abiertas en el checklist.

## Adenda · HTTPS móvil y reanudación de MetaMask · 1-nov-2026

El host ngrok anterior devolvía la página `ERR_NGROK_6024` antes de servir la réplica. Se inició un Cloudflare Quick Tunnel temporal hacia el preview local `127.0.0.1:5184`, y Vite permite solo el host actual `luis-reach-award-publicity.trycloudflare.com`. La URL abre la app por HTTPS y se puede probar desde un teléfono: [abrir Inicio](https://luis-reach-award-publicity.trycloudflare.com/home). Es un enlace público y temporal; puede cambiar si se reinicia el túnel.

La integración instalada es `@metamask/connect-evm` 2.1.1. En la versión de este corte el cliente usaba `mobile.useDeeplink: true`, que el paquete identifica como `metamask://`; posteriormente se cambió a `false`, que selecciona el Universal Link HTTPS. En el checkout móvil se guarda `gmPay`, producto, importe, moneda, red y wallet seleccionada en la URL antes de llamar a `client.connect()`. Esto permite que React recupere el checkout si el navegador se vuelve a crear al volver de la app. La acción de conexión solo comparte la cuenta pública; pagar sigue siendo una acción aparte.

REA ejecutó Chromium temporal a 390 × 844 px. En el HTTPS público abrió Inicio, **Crear minero** y la ruta `/home?modal=paywall-create`, evidencia `ev_a05448b8e41650438bba29e38b0e0d672a3c775436c3d15a9860ad6a8e8e7b6c`. Después abrió una ruta `gmPay` con una compra de prueba de USD 10 y REA encontró el checkout restaurado con Ethereum y MetaMask seleccionados, evidencia `ev_262dde8859959bece2ea32531379edf15f29914211de3fc6ae28e2d339554cd2`. Ambos perfiles cerraron con `terminated-owned-process`. Estas escenas no usaron proveedor ni app de wallet y no dispararon pagos.

Se verificó `npm run build`: TypeScript y Vite pasaron. Persiste el aviso de Rollup por el chunk de Solana de 695.66 kB. El encabezado conserva un solo acceso a wallet; el saldo demo, carrito y perfil son controles distintos. Siguen pendientes la conexión y cancelación con wallets reales, la comprobación del mapeo de direcciones en Solflare Bridge y el backend de órdenes/confirmaciones, según el [checklist vigente](./gomining-replica-checklist.md). La prueba de apertura y retorno real requiere teléfono con MetaMask instalado; no se firmó ni envió ninguna transacción.

## Adenda · X del checkout reanudado · 1-nov-2026

REA abrió Chromium temporal a 390 × 844 px en `https://luis-reach-award-publicity.trycloudflare.com/home` con una URL de checkout de prueba que contenía `gmPay`, producto, importe USD 10, Ethereum y MetaMask. Tras confirmar que el título del checkout era visible, pulsó `button[aria-label="Cerrar pago"]`. El siguiente estado confirmó `/home`, sin los parámetros `gmPay`, y el paso de espera indicó que el diálogo ya estaba oculto. Evidence `ev_282d93b555ff50a8a19c3dad00cd928b32ca61a047430e8984c4969915015a79`; todos los pasos terminaron correctamente y REA cerró el perfil con `terminated-owned-process`.

La escena no conectó una wallet, no invocó la función de pago y no creó recibo. Confirma el cierre de UI después de restaurar el checkout desde la URL; no confirma qué ocurre al rechazar un permiso en MetaMask real ni cancela un prompt que permanezca dentro de una app de wallet. `npm run build` pasó después de la última edición. El detalle está en el [informe completo](./gomining-replica-audit-completa-2026-11-01.md) y el [checklist](./gomining-replica-checklist.md).

## Adenda REA: rechazo y dirección de wallet con proveedor QA — 1-nov-2026

Se probó el flujo de **Crear minero** y el de **Recargar** con un proveedor EIP-1193 falso, disponible solo con `gmWalletTest` en `localhost` y en modo desarrollo. El modo de rechazo devuelve el error habitual de MetaMask Connect (envoltura con `code: 53` y `rpcCode: 4001`): en ambos flujos REA observó que checkout cerró, apareció el aviso y no se creó recibo. Evidence `ev_b530e05439cd11d4c19d83b5844e031a970b028bb45231371ccbe39ea8c84f` y `ev_a6adf1e07670f1e7ef2ab1ec622b29d495ded317289cb0c2060af2114cabbb7c`.

En modo de recibo, la UI identifica el hash como ficticio y muestra `TEST`; el estado de origen queda sin verificar y la conversión Bridge pendiente (`ev_23d1b94ef1f11eb913169b2195c7d6366c0c9aa384028c3f6f6018f8583463a2`). La conexión fixture expuso la dirección pública en la cabecera y **Desconectar** la ocultó (`ev_67ec330f77cd54ede39bab7d652af9a2ca60436ec1098d64cc4ccaa9c68103dc`). Todos los perfiles REA terminaron con `terminated-owned-process`; no se abrió una wallet real ni se firmó o transmitió una transacción.

Después de la autorización del usuario, `firebase projects:list --json` volvió a enumerar `salad-miners` como activo; fue una comprobación de lectura, sin cambios remotos. El build pasó con el aviso de chunk grande de Solana. Se verificó que `dist/assets` no contiene `gmWalletTest`, `payment-success` ni el texto del fixture. El estado en aquel corte era 62/67; la prueba de cierre pendiente lo actualizó a 63/68 y el contraste de cinco capturas Bridge compartidas por el usuario a 64/69, con cinco pendientes reales. Ver el [informe completo](./gomining-replica-audit-completa-2026-11-01.md).

## Adenda REA: cerrar checkout mientras Connect Wallet está pendiente · 1-nov-2026

Para reproducir el caso en que el usuario cambia a MetaMask y vuelve con la conexión todavía pendiente, habilité el fixture local `connect-pending`. Su método `eth_requestAccounts` devuelve una promesa que no resuelve; el fixture no implementa envío. REA abrió el checkout a 390 × 844 px, esperó a que cargara la cotización, pulsó **Conectar MetaMask** y cerró la pantalla:

| Control | Evidence ID | Resultado |
|---|---|---|
| **Cerrar pantalla/Cancelar** | `ev_12aec889b4dc50699d3e485f583f8c028fcb22b2d1c02cdc0d8166ea8d7bcab5` | El checkout se desmontó y se limpiaron los parámetros `gmPay`; el aviso de la página aclara que la solicitud quizá continúe dentro de la wallet. |
| **X · Cerrar pago** | `ev_16781c6d439c4d9ceb251be8bacf0a280950461231501f2aa859cb85cf262d91` | Mismo cierre y limpieza; no se registró ningún error de página. |

Ambos escenarios terminaron con `cleanup: terminated-owned-process`. La corrección invalida el intento de conexión al cerrar, despeja el estado de carga y llama a la desconexión del cliente MetaMask pendiente; el marcador local para restaurar la conexión se escribe antes del handoff y se borra al cancelar. La prueba confirma el comportamiento de UI con un proveedor falso, no la respuesta de MetaMask real ni que cerrar la web cierre una solicitud que permanezca en la app. No hubo firma, solicitud de pago ni transferencia.

`npm run build` pasó en esta revisión (TypeScript y Vite; warning no bloqueante por el chunk grande de Solana). La prueba de fixtures está limitada a localhost y desarrollo. Firebase CLI autenticado enumeró `salad-miners` con una lectura; no hubo nuevos despliegues ni escrituras remotas en esta pasada.

En aquel corte el checklist quedó en 64/69: la comparación de capturas del usuario confirma visualmente los cinco destinos Bridge mostrados (BNB Chain, Bitcoin, Ethereum, TRON y Polygon), pero dejó pendiente revisar en Solflare la dirección USDT SPL directa y comprobar vigencia, activos admitidos, mínimos y tarifas de las rutas. La actualización documental posterior está registrada al final de este seguimiento.

## Adenda de investigación REA y fuentes oficiales · 1-nov-2026

### MetaMask Connect en Android

REA volvió a analizar como artefactos locales `src/metamaskConnect.ts` y `src/walletAppLinks.ts`: análisis padre `ev_81a5d8a55c67b3c2ec43175752b8520834bc527697b816fa29e99359aca2dd95`, vista de hallazgos `ev_b6a46f9b949fbe95164ec132b028b64af128de2566883ad6267b97b6f80164bb`. El análisis parseó dos módulos y no encontró errores de parseo; la cobertura de la aplicación es parcial y no ejecuta el SDK. El código hace que MetaMask Connect gestione el handoff Android, sin construir un enlace `/dapp/` hacia el navegador interno. MetaMask documenta conexión desde navegador móvil a la aplicación nativa mediante deeplink y relay; cuando el usuario ya está en el navegador interno se usa el proveedor inyectado. Fuentes: [MetaMask Connect](https://github.com/MetaMask/connect-monorepo), [plataformas](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/supported-platforms.md) y [Quickstart](https://docs.metamask.io/quickstart/).

**Conclusión de auditoría:** la solución en el código coincide con la integración móvil recomendada por MetaMask. El reporte del Android del usuario no se puede cerrar con una inspección estática: falta prueba con la app instalada, apertura y retorno desde un navegador móvil, cancelación dentro de la wallet y reanudación del checkout. No afirmo que el problema visible ya esté resuelto.

### Solflare Bridge y activos realmente cubiertos

Se consultaron las páginas oficiales de Bridge: [redes/tokens/tarifas](https://help.solflare.com/en/articles/17692897-bridge-supported-chains-tokens-and-fees), [direcciones permanentes](https://help.solflare.com/en/articles/17692907-your-permanent-bridge-deposit-address-explained), [pasos de depósito](https://help.solflare.com/en/articles/17692872-how-to-deposit-funds-using-bridge) y [FAQ](https://help.solflare.com/en/articles/17692854-bridge-faq). En ellas Solflare documenta Bitcoin, Ethereum, Arbitrum, BNB Chain, Polygon, Tron y Base; los tokens disponibles dependen de liquidez; 0.1% para stablecoin→stablecoin y 1% para otras combinaciones, gas de origen aparte, slippage máximo de 5%, mínimos variables y posibilidad de reembolso. El mismo destino permanente sirve para activos fuente admitidos de esa cadena cuando se conserva el token de recepción elegido; cambiar cadena o token de recepción genera otra combinación.

El código actual de `src/paymentDestinations.ts` y `src/paymentQuote.ts` cubre monedas nativas BNB/BTC/ETH/TRX/POL hacia las cinco direcciones configuradas, más USDT SPL directo. No ofrece la variedad de tokens fuente que Solflare dice admitir bajo liquidez, ni recibe de Bridge la matriz viva de token-contract/decimales/precio/mínimo/cotización. Esto es una brecha respecto a aceptar “cualquier criptomoneda compatible”. Los artículos públicos no permiten verificar el token de recepción configurado en la cuenta del usuario, las cotizaciones actuales para sus direcciones ni una ausencia universal de KYC/restricciones de terceros.

### Checklist y límite de auditoría

La matriz actualizada queda en **67/74: siete pendientes**. En el [checklist](./gomining-replica-checklist.md) están individualizados: conectar/desconectar cada wallet real; cancelar/rechazar conexión en MetaMask real; ver un recibo de una transferencia real existente; confirmar en vivo rutas/destinos/USDT/activos/mínimos/fees con Solflare; implementar tokens Bridge adicionales; verificar KYC/eligibilidad externa; e implementar backend verificado de órdenes y pagos. La vista de recibo sí se comprobó con un hash ficticio de QA, no en cadena. El [informe completo](./gomining-replica-audit-completa-2026-11-01.md) conserva la explicación y enlaces fuente.

No se intentó firmar, enviar ni consultar transacciones de la wallet del usuario. Firebase CLI solo se usó para una lectura de `projects:list` después de la autorización ya concedida; no hubo cambios remotos en esta adenda.

## Continuación de auditoría: MetaMask Android, RPC Solana y Firebase CLI · 1-nov-2026

### MetaMask móvil: inspección estática de la versión instalada

REA/Linux volvió a analizar los cuatro módulos exactos de la aplicación (`metamaskConnect.ts`, `walletAppLinks.ts`, `walletSession.ts`, `WalletPaymentCheckout.tsx`). La raíz `src` conservó el SHA-256 `1cc65a8a4c7eb26ccb14864d8094fc6373c8e858c9fe12f6c8e299de8282e6f8`; la selección tuvo cuatro archivos parseados, sin errores y con 21 archivos fuente fuera del análisis. Evidencia vista: `ev_d5a7859697b6bcc0c8a11d9bbb772da47ccf4d641f145971d3188534a7abb424`; evidencia padre `ev_aea10b0a385b9e2bb8268526954a78ff90da05825821308e761c6c62b38c54f1`.

También se analizó el paquete instalado `@metamask/connect-multichain` 1.2.0. REA parseó `package.json`, `config/index.js`, `multichain/utils/index.js`, `ui/ModalFactory.js` y `multichain/index.js`: cuatro módulos JavaScript, cero errores de parseo, cobertura parcial por los 274 archivos del paquete fuera de selección. Evidencia vista `ev_4cfa4ebd654d31c9429c299a429cc2f63f44f9a50ab2366a7332c1ba7b52c3de7`; evidencia padre `ev_7b7814294827ae2f4829af9afbf4735bfaea7712aac8f8dfed35071227351eb4`. La fuente instalada compone `metamask://connect/mwp?...` y `openDeeplink` navega en la pestaña actual si `mobile.useDeeplink` está activo; un comentario del propio paquete explica que evita abrir otra pestaña en blanco. `@metamask/connect-evm` 2.1.1 coincide con el `latest` de npm consultado en esta fecha.

Esto confirma que el código instalado usa la ruta nativa MWP del SDK y no el deeplink `/dapp/` que solo abre el navegador integrado. No confirma el comportamiento real del Android del usuario: la apertura, el retorno desde MetaMask, la cancelación de conexión y una firma siguen sin prueba en el teléfono. El pequeño probe local de `openDeeplink` no pudo cargarse directamente con Node por imports ESM relativos sin extensiones; no se presenta como prueba ejecutada del SDK. `npm run build` sí pasó con TypeScript/Vite; queda el aviso no bloqueante de un chunk de 695.66 kB.

### RPC de Solana y error 403 de la captura

Se hicieron tres solicitudes de solo lectura `getLatestBlockhash`, sin conectar wallet, firmar o enviar. En el host de auditoría, `https://api.mainnet.solana.com`, `https://api.mainnet-beta.solana.com` y `https://solana-rpc.publicnode.com` respondieron HTTP 200 con blockhash. El checkout actual prueba esos tres endpoints secuencialmente y solo inicia la solicitud de la wallet después de obtener un blockhash. El 403 de la captura previa no se reprodujo desde este host; no demuestra que los tres servicios estén disponibles desde el móvil/red del usuario ni que Solflare haya recibido una solicitud de firma.

### Estado de Firebase CLI

Después de que el usuario autorizó Firebase CLI, `npx firebase-tools@latest projects:list --json` volvió a enumerar `salad-miners` como proyecto activo. `functions:list --project salad-miners` terminó con error genérico; no se deduce si el API de Functions está deshabilitado, si faltan permisos o si no hay funciones. En local, `firebase.json` declara solo proveedor anónimo de Auth y reglas de Firestore; no hay fuente ni destino de Cloud Functions. No se hizo despliegue ni escritura remota. `salad-miners` continúa siendo el proyecto de demostración, por lo que la verificación de pagos sigue pendiente y no debe usarse la persistencia de demo como conciliador financiero.

### Recuento y alcance

El checklist mantiene **67/74 confirmaciones y 7 pendientes**. Esta continuación añade evidencia estática del SDK y una lectura de RPC, pero no cambia el estado de las siete comprobaciones que requieren wallet real, transacción/recibo existente, validación en la cuenta de Solflare o un backend de pagos desplegable. No hubo cambios de código de aplicación en esta continuación.

## Adenda · Sondeo CORS de Solana y ajuste de RPC · 1-nov-2026

Un sondeo HTTP posterior reprodujo los encabezados que emplea `@solana/web3.js` (`Origin`, `Content-Type: application/json`, `solana-client: js/1.99.0`) desde `http://127.0.0.1:5173` y el host HTTPS temporal. Se hizo la consulta de solo lectura `getLatestBlockhash`, después de la solicitud OPTIONS. En ambos orígenes, `api.mainnet.solana.com` y `api.mainnet-beta.solana.com` respondieron HTTP 403 `Access forbidden`; `solana-rpc.publicnode.com` permitió CORS y respondió HTTP 200 con blockhash. La prueba envió la cabecera `Origin` desde el host de auditoría; no ejecutó un navegador real y no confirma el resultado desde Android o la red del usuario.

Se ajustó el orden de fallback en `src/walletSession.ts`: PublicNode se prueba primero; los dos RPC oficiales quedan como respaldos. REA analizó ese archivo como texto inerte: Evidence `ev_8e6450b2d22b774b35f017ba02ed068686e26ed5a976b7c28a8c493245200dfc`, 1 archivo parseado, 0 fallos de parseo, 39 hallazgos; los otros 24 archivos fuente quedaron fuera de selección y la cobertura semántica de la aplicación es parcial. `npm run build` pasó con el aviso no bloqueante de chunk Solana de 695.66 kB.

No se conectó wallet, no se generó ni aprobó una transacción y no hubo solicitudes de escritura. El 403 observado en el teléfono todavía requiere reintento con Solflare Android; el cambio solo resuelve que el checkout priorice el endpoint que aceptó el sondeo desde ambos orígenes probados. El checklist sigue en **67/74; siete pendientes**.

## Reconciliación del checklist adjunto · 1-nov-2026

Se leyó el archivo adjunto referido por la tarea y se contaron sus casillas: **64 en total, 10 marcadas y 54 sin revisar** en la captura compartida. Se comparó con la matriz actual del workspace: **74 en total, 67 marcadas y 7 pendientes**. El adjunto era una instantánea anterior, no el estado posterior a la auditoría. La matriz actualiza sus 64 requisitos originales a 59 confirmados y cinco pendientes (wallets reales, rechazo real de MetaMask, recibo on-chain, revisión viva de Bridge y backend verificado), y agrega diez controles nuevos de los que ocho están confirmados y dos siguen pendientes (tokens Bridge adicionales y elegibilidad/KYC). No se cambió el archivo temporal del adjunto.

## Revisión REA de persistencia demo y límites de KYC · 1-nov-2026

REA/Linux analizó estáticamente cinco módulos seleccionados de `src`: `firestoreDemoSync.ts`, `demoStore.ts`, `walletSession.ts`, `paymentDestinations.ts` y `paymentQuote.ts`. Resultado: 5 archivos JavaScript/TypeScript parseados, cero fallos de parseo y 135 hallazgos; el análisis dejó explícitos 20 archivos no seleccionados y cobertura semántica parcial. Evidence de análisis padre: `ev_7853075a0e6b7e09c817e9232d2ba1a740a2a0cc9e4f8b57cb80c8357c0bb2fd`; vista resumen: `ev_a03862be62fb6a8af9375b3c5a9682be45d2abf0cf16c3b82cd2855635c3d938`. REA trató el código como texto estático; esto no sustituye las pruebas de ida/vuelta Firebase ni confirma ejecución en producción.

La revisión del flujo de persistencia confirma el límite intencional: Firebase recibe una lista explícita de estado demo (balance, mineros/workers ficticios, órdenes demo, suscripción demo, recibos demo y preventa demo). No serializa la dirección de una wallet ni el recibo de una transacción real. `firestore.rules` limita la lectura/escritura del cliente a `users/{uid}/demoState/current` del UID autenticado y deniega otras rutas. Este proyecto de prueba no contiene backend de órdenes ni conciliación de pagos; la autorización de Firebase CLI y esta sincronización demo no acreditan compras reales.

La documentación oficial de Solflare distingue la wallet de funciones externas: Solflare dice que crear y usar su wallet no requiere KYC, email ni alta; también aclara que los proveedores de compra con tarjeta/banco hacen sus propias comprobaciones y que algunas funciones dependen de la región ([FAQ de seguridad](https://www.solflare.com/security/)). Los términos señalan que algunas funciones usan proveedores terceros y que sus propios términos aplican ([Términos de Solflare](https://www.solflare.com/terms/)). La FAQ de Bridge describe redes, activos sujetos a liquidez, fees, slippage y mínimos variables, pero no establece una garantía general sobre KYC para cada ruta o proveedor ([FAQ de Bridge](https://help.solflare.com/en/articles/17692854-bridge-faq)). Por ello, “conectar una wallet sin KYC” está documentado para Solflare; “Bridge sin KYC en todos los montos, redes y regiones” permanece sin confirmar y no debe prometerse.

La matriz continúa en **67/74; siete pendientes**. El conteo no se reduce: esta revisión aumenta la precisión de la evidencia de Firebase/KYC, pero no proporciona una wallet real, una transacción existente, una inspección Bridge autenticada ni un verificador financiero. No se hizo una conexión de wallet ni se firmó o envió una transacción.

## Seguimiento tras autorización de Firebase y prueba Android · 1-nov-2026

### Firebase autorizado

El usuario confirmó la autorización del CLI para el proyecto de prueba. `firebase-tools` enumeró `salad-miners` como activo y `firestore:databases:list` encontró la base `(default)`. Se probó `accounts:signUp` anónimo con la configuración local, se recibió una sesión temporal y se eliminó inmediatamente esa cuenta. El resultado fue correcto; no se imprimió, guardó ni copió la API key, el ID token ni el UID.

Se ejecutó `firebase deploy --only firestore:rules --project salad-miners --non-interactive`. Las reglas compilaron y Firebase indicó que la versión local ya estaba vigente; no hubo carga de un archivo de reglas distinto. El CLI liberó las reglas existentes. Estas permiten al usuario autenticado leer/escribir solo `users/{uid}/demoState/current` con el esquema demo y deniegan las demás rutas. La prueba de inicio anónimo verifica que el proveedor está habilitado; junto con la prueba de ida/vuelta demo registrada arriba, respalda la persistencia de demostración. No hay fuente local de Cloud Functions ni backend de pagos: este despliegue no valida transferencias, no crea pedidos financieros ni activa mineros.

### MetaMask Android reportado como pantalla en blanco

REA analizó tres archivos fuente seleccionados (`metamaskConnect.ts`, `walletAppLinks.ts`, `walletSession.ts`) bajo el artefacto `src`: tres parseados, cero fallos de parseo, 50 hallazgos; 22 de los 25 archivos inventariados quedaron fuera de selección y el análisis semántico quedó parcial/truncado. Evidencia padre `ev_982b6e975714157a4cdaf3d0a206fa090b3e2314c1e472c56a6cf695968cf1e4`; vista resumen `ev_270dae94ba5c156a58db406f37313c151ce2cad6a832d5c5102209fa5d6fb05f`.

El código usa `@metamask/connect-evm` 2.1.1 con `@metamask/connect-multichain` 1.2.0, las mismas versiones que devolvió el registro npm al consultarlo. En Android, `client.connect({ chainIds })` usa el transporte móvil MWP del SDK y el esquema `metamask://connect/mwp`; no genera el deeplink `/dapp/` que abre el sitio en el navegador interno. Antes del handoff guarda la ruta del checkout en `gmPay`. MetaMask documenta que el navegador móvil se conecta a la app mediante deeplink y relay, mientras que en el navegador interno de MetaMask se usa la conexión directa del proveedor ([MetaMask Connect](https://docs.metamask.io/metamask-connect/), [Quickstart](https://docs.metamask.io/quickstart/), [arquitectura MWP](https://github.com/MetaMask/connect-monorepo/blob/main/docs/architecture.md)).

El usuario informó que en su Android se abrió un navegador interno de MetaMask en blanco. La inspección estática confirma que el código sigue el flujo móvil documentado, pero no explica el resultado que observó ni demuestra que la solicitud llegue a la pantalla de aprobación. No cambié el deeplink a `/dapp/`, porque eso cargaría la plataforma dentro del navegador de la wallet y no resolvería la causa reportada. El registro de versiones no ofrece una actualización del SDK para probar.

Intenté una captura dinámica controlada de REA en un perfil Chromium temporal. El proveedor devolvió `execution_failure` y `cleanup_incomplete` con `resources: []`; no produjo Evidence y no repetí la captura ni abrí otro perfil. `rea doctor` se ejecutó; la instalación del CLI y el registro de Codex aparecen alineados, aunque la salud global indica herramientas de análisis opcionales ausentes. Por tanto, el handoff, retorno, cancelación y firma en Android continúan sin prueba real. El análisis estático no cambia las siete casillas pendientes ni el total de **67/74**.

No se hicieron cambios al código de la aplicación ni se aprobaron firmas o transferencias.

## Revalidación tras autorización completa de Firebase CLI · 1-nov-2026

La autorización del usuario ya permitía aplicar la configuración del proyecto de prueba. Se ejecutó `firebase deploy --only auth --project salad-miners --non-interactive` y Firebase respondió `Auth providers enabled: anonymous` y `Deploy complete`. Las reglas de Firestore se habían publicado por separado con `--only firestore:rules`; Firebase confirmó que la versión local ya estaba vigente.

Después del despliegue de Auth, se creó una cuenta anónima temporal mediante el API público de Firebase y se eliminó en la misma sesión. El inicio fue correcto y la eliminación confirmó éxito. La API key y el ID token se mantuvieron en variables del proceso y no se imprimieron ni guardaron. No se escribió ningún documento demo en esta revalidación. La ida/vuelta UI con USD 1 demo tras recarga está documentada en cortes anteriores y se hizo en un origen aislado, fuera de la sesión personal `127.0.0.1`.

La compilación `npm run build` pasó en esta revalidación: TypeScript y Vite transformaron 554 módulos; permanece un aviso de Rollup por un chunk de 695.66 kB, sin fallo de compilación. No se modificó el código de la app. El recuento revisado de puntos reales del checklist es **67/74**; el cálculo anterior **68/75** contó por error el marcador `[x]` de la instrucción “Marca [x] al completar…”. Las siete verificaciones pendientes no cambiaron.

La persistencia Firebase cubre el snapshot ficticio privado por UID anónimo del navegador. El serializador excluye direcciones de wallet y recibos on-chain; las reglas bloquean otras colecciones. No se incorporó una función backend ni un verificador de pagos. La conexión/rechazo en MetaMask Android real sigue pendiente porque el análisis dinámico REA anterior falló con `cleanup_incomplete`; no repetí esa captura ni abrí otro perfil.

Fuentes oficiales de configuración: [proveedores de Auth mediante Firebase CLI](https://firebase.google.com/docs/auth/configure-providers-cli) y [autenticación anónima web](https://firebase.google.com/docs/auth/web/anonymous-auth).

## Continuación: MetaMask Android mediante Universal Link · 1-nov-2026

El usuario había reportado que MetaMask Android abrió un navegador interno en blanco. El código anterior seleccionaba el esquema nativo `metamask://connect/mwp` en Android. Revisé el código instalado de `@metamask/connect-multichain` 1.2.0: el SDK genera dos variantes del mismo mensaje MWP, `metamask://connect/mwp?...` y `https://metamask.app.link/connect/mwp?...`; `mobile.useDeeplink: false` selecciona la segunda. El Universal Link conserva el flujo de conexión y no es la ruta `/dapp/` para abrir la réplica dentro del navegador de MetaMask. MetaMask documenta `client.connect({ chainIds })` como el flujo multiplataforma con deeplink móvil y relay ([MetaMask Connect](https://docs.metamask.io/metamask-connect/), [quickstart](https://docs.metamask.io/quickstart/), [implementación del SDK](https://github.com/MetaMask/connect-monorepo)).

Se cambió `src/metamaskConnect.ts` para usar la variante HTTPS en todas las plataformas. iOS y escritorio ya usaban ese modo; el cambio efectivo es Android. REA volvió a analizar el archivo seleccionado: resumen `ev_42f67664e72ae83548e90d6690cd9d264098bc27aacfbea77cffd9cc905f80c`, padre `ev_9107a31cde09455deeacbb23ce5f4e0fc229260bac1e8e28dfc96a1ecb53ba57`; un archivo seleccionado, cero errores de parseo y cobertura completa dentro de esa vista. Otros 24 archivos de la aplicación quedaron fuera del análisis. `npm run build` pasó con 554 módulos; se mantiene el aviso de Rollup por el chunk de 695.66 kB.

Este es un cambio candidato pendiente de prueba física: REA no comprobó que Android abra la aplicación nativa, presente la autorización, regrese al checkout ni cierre al rechazar. No se conectó una wallet, no se aprobó firma, no se transmitió una transacción y Firebase no se modificó en esta revisión.

El checklist sigue en **67/74, con 7 pendientes**: wallets reales; rechazo real de MetaMask/Android; recibo de una transferencia existente; validación en vivo de direcciones/rutas y liquidación Bridge; selección de tokens Bridge adicionales; condiciones KYC/eligibilidad de terceros; y backend verificador de órdenes y activación.

## Corrección de estado MetaMask móvil · 1-nov-2026

La sección anterior documenta la iteración en que `mobile.useDeeplink: false` se probó como alternativa. El código vigente en `src/metamaskConnect.ts` ahora usa `mobile.useDeeplink: isMobileBrowser()`: `true` para teléfonos y `false` para escritorio. Por tanto, MetaMask Connect solicita MWP mediante el deeplink nativo en móvil y conserva el Universal Link HTTPS en escritorio. REA parseó cinco módulos de la integración actual sin errores (`ev_316166f54159ed7a2cb19ead16d1c918bd5e0837eea51efb1509385cd5771d27`); es evidencia estática y no acredita apertura, regreso, conexión ni firma en Android. No se hizo una transferencia. El checklist queda en 67/74; no cambia ningún punto de prueba real.

## Reauditoría focalizada REA · checkout y MetaMask Android · 1-nov-2026

REA/Linux volvió a analizar como texto inerte los cinco módulos que implementan el checkout, la sesión de wallets, el transporte de MetaMask, los enlaces móviles y la normalización de errores: `WalletPaymentCheckout.tsx`, `walletSession.ts`, `metamaskConnect.ts`, `walletAppLinks.ts` y `walletError.ts`. La evidencia `ev_16f6b33955acf0149ed636b1e21192c19ff34dfff11bea8c055c96570e77739c` referencia el análisis `ev_23d9a905b3de8430dc9577271230b3cd458a76b5185b7279b39db8a786555e3a`. Se parsearon los cinco archivos seleccionados sin errores (110 hallazgos); veinte archivos fuente no fueron seleccionados. La cobertura describe solo el código observado y no prueba ejecución en una wallet.

También se intentó una reproducción de interfaz sin wallet real ni pago: Chromium temporal abrió un checkout local de QA para probar el botón X y verificar que desapareciera el diálogo. REA devolvió `execution_failure` y `cleanup_incomplete` antes de producir pasos o capturas (`resources: []`). No repetí la apertura. `binary_session` informó que no había una sesión de análisis binario abierta, pero no confirma la limpieza del proveedor de navegador; por eso la interacción de este intento queda **sin verificar**. Las ejecuciones previas de fixtures para Cancelar/X siguen como evidencia separada y no se usan para afirmar que el caso de MetaMask Android ya está resuelto.

La revalidación final `npm run build` pasó: TypeScript y Vite compilaron 554 módulos. Permanece el aviso no bloqueante de Rollup por el chunk `index.esm-BFHQ7gaW.js` (695.66 kB). No se conectó una wallet, no se firmó ni transmitió una transacción y Firebase no se modificó. El checklist se mantiene en **67/74; siete pendientes**.

## Actualización posterior: Solflare nativo y conteo vigente · 1-nov-2026

La adenda posterior de implementación nativa de Solflare agregó una comprobación funcional de Connect/retorno cifrado y pago preparado para aprobación en la app; el mock verificó el cifrado y el callback, sin abrir la wallet ni transmitir. Ese nuevo punto eleva el estado desde el corte anterior **67/74** a **68/75**, con los mismos siete pendientes reales. La frase instructiva “Marca `[x]` al completar…” no es una casilla y no forma parte del recuento. Para el detalle de código, Evidence REA, compilación de 563 módulos y límites del handoff, véase la [adenda nativa de Solflare](./gomining-replica-audit-completa-2026-11-01.md#addendum-flujo-nativo-movil-de-solflare--1-nov-2026) y el [checklist vigente](./gomining-replica-checklist.md).

## Revisión adicional de Firebase y MetaMask Connect · 1-nov-2026

Después de la autorización del usuario, el Firebase CLI informó una sesión iniciada y `projects:list` mostró `salad-miners` como proyecto accesible. No se repitió ningún despliegue ni se expusieron credenciales. En un perfil Brave temporal de REA, la app de `localhost:5173/home` mostró el estado final guardado de la sincronización demo; REA terminó limpiamente el proceso que inició (`ev_e759388fedbc7a5a7b0e359c220fba2b66661857cfc15e25c7f9dcc608d8eb87`). La captura solo conservó el resultado de la acción y URL, sin DOM, red ni almacenamiento; no equivale por sí sola a una prueba de lectura de regreso. Las pruebas SDK/API y de restauración tras recarga ya documentadas mantienen su alcance anterior.

REA también analizó como texto inerte dos fuentes del SDK instalado `@metamask/connect-multichain`: `dist/src/multichain/utils/index.js` y `dist/src/config/index.js` (`ev_f060eed40eeacf014cba127f7f060b8693da0eed35ea1c9bacf5f9aee7b3078f`). Se parsearon ambas fuentes, sin errores, con 1,503 nodos AST y 26 hallazgos; 277 archivos quedaron fuera de la selección y la cobertura general es parcial. El código muestra que `mobile.useDeeplink: true` navega a `metamask://connect/mwp?...`; `false` usa el Universal Link HTTPS de MWP. La configuración local actual selecciona el primer modo en teléfono y no usa `/dapp/`. Esto comprueba la ruta implementada, pero no resuelve el reporte de pantalla en blanco: falta probar en Android real que la app reciba la solicitud, vuelva al checkout y permita cancelar o aprobar.

El recuento sigue en **68/75; siete pendientes**. No hubo cambios en el código de la app ni transferencias.

## Actualización · Phantom móvil y verificación CLI · 2-nov-2026

### Phantom nativo en checkout

Se completó el handoff móvil cifrado de Phantom y se integró en el estado de wallet y en el checkout. En móvil sin proveedor inyectado, el botón conserva el checkout en `gmPay` y abre el enlace nativo `/ul/v1/connect`; al regresar, la app valida el estado, descifra la respuesta y muestra la dirección pública. Para pagar, la réplica construye una transferencia USDT SPL, la cifra para `/ul/v1/signAndSendTransaction` y espera el callback de Phantom. El recibo se muestra con el hash que devuelve la app, sin acreditar saldo ni activar el minero o la suscripción. La clave efímera de cifrado y sesión quedan en `sessionStorage` de esa pestaña y se limpian al desconectar. Se quitó el fallback `/browse` porque solo abriría el navegador integrado sin crear la conexión nativa desde el navegador externo.

El harness mock verificó (1) recepción y descifrado del callback de Connect, (2) contenido cifrado de la solicitud de pago —sesión, transacción serializada y `preflightCommitment: confirmed`—, (3) descifrado de una respuesta simulada con firma Solana de 64 bytes y (4) rechazo simulado de conexión. No abrió Phantom, no creó ni firmó una transacción válida, no llamó al RPC y no transmitió fondos. La conexión/pago real en Android/iOS sigue sin verificarse.

REA analizó estáticamente seis fuentes seleccionadas bajo `src`: `walletSession.ts`, `phantomMobile.ts`, `WalletPaymentCheckout.tsx`, `walletAppLinks.ts`, `metamaskConnect.ts` y `solflareMobile.ts`. Evidencia vigente del análisis `ev_ff4ce90e855e5d73a315a30d6e896b43a83f8a031d9674bdf561dbb068520a23`; vista resumen `ev_7a0a03c52705b946e6178303ad263b4e0bd306b436ff1dadc9a445663e912c64`. REA parseó los seis archivos sin errores (14,424 nodos AST, 208 hallazgos); 21 archivos del árbol `src` no se seleccionaron, el grafo semántico es parcial y el bootstrap no se ejecutó. Este resultado confirma que el código es analizable, no que una wallet real acepte el enlace.

`npm run build` pasó: TypeScript y Vite transformaron 564 módulos. Se mantiene el aviso no bloqueante de Rollup por el chunk de 695.66 kB. No se cambió configuración de Firebase en esta continuación; el CLI autorizado ya lista `salad-miners`. La persistencia configurada y autorizada sigue limitada al snapshot demo privado por UID; no es un backend de órdenes o pagos.

El checklist queda en **69/76, siete pendientes**. La nueva casilla de Phantom cubre solamente el protocolo simulado y la implementación de código. Siguen abiertos conexión y rechazo reales de las wallets, recibo on-chain existente, cotizaciones Bridge vivas, activos Bridge adicionales, condiciones KYC/eligibilidad de cada ruta y backend verificador/idempotente. La matriz completa queda en [`gomining-replica-checklist.md`](./gomining-replica-checklist.md); el estado de la revisión interactiva anterior está en [`gomining-replica-audit-interaccion-2026-11-01.md`](./gomining-replica-audit-interaccion-2026-11-01.md).
