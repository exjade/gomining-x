# Firestore: persistencia demo y límites de producción

**Estado al 1 de noviembre de 2026:** la autenticación anónima y las reglas de Firestore están desplegadas en el proyecto de prueba `salad-miners`. Las comprobaciones REST, SDK Web y de interfaz confirmaron inicio anónimo, lectura y escritura del documento propio y restauración del estado demo tras recargar. La autorización CLI fue realizada por el usuario durante esta tarea. La sesión principal de `127.0.0.1` no se alteró; el recorrido de persistencia se hizo en un origen aislado `localhost`.

La réplica serializa una lista explícita de campos demo y omite las direcciones asociadas a mineros/workers. Los recibos de wallet y los hashes de pago permanecen fuera del almacén demo. En caso de error con Firebase, la app conserva el estado demo en `localStorage` de ese navegador y muestra que la nube no está conectada. La configuración de Firebase permanece en `.env.local`, excluido de Git.

[`firestore.rules`](./firestore.rules) restringe la lectura/escritura a `users/{uid}/demoState/current`, aplica el esquema de snapshot demo y deniega otras colecciones. `firebase.json` habilita el proveedor anónimo y se desplegaron Auth y las reglas con Firebase CLI. Los ensayos temporales REST y SDK se limpiaron; la comprobación de UI deja un snapshot demo de USD 1 bajo la sesión anónima aislada usada en `localhost:5173`. Ese documento contiene únicamente estado demo, sin direcciones de wallet ni recibos de cadena. [`firebase.json`](./firebase.json) y [`.firebaserc`](./.firebaserc) apuntan al proyecto de prueba; esta configuración no incluye ni habilita órdenes ni conciliación de pagos.

El cliente no debe activar un minero ni acreditar recompensas a partir de una dirección o del hash devuelto por una wallet. Un backend de confianza debe validar firma de inicio de sesión, red, token, dirección receptora, cantidad, confirmaciones, reembolsos y duplicados antes de escribir. Firebase Admin ejecutado en servidor queda sujeto a controles propios y no usa estas reglas de cliente.

## Colecciones propuestas

| Ruta | Campos principales | Escritor permitido |
|---|---|---|
| `users/{uid}` | `createdAt`, `status`, `locale`, `referrerUid` | servidor; cambios de perfil con validación |
| `users/{uid}/wallets/{walletKey}` | `chain`, `address`, `verifiedAt`, `signatureNonceId` | servidor, tras verificar un reto firmado |
| `orders/{orderId}` | `uid`, `productType`, `productId`, `catalogPrice`, `quoteId`, `status`, `expiresAt`, `createdAt` | servidor |
| `orders/{orderId}/paymentAttempts/{attemptId}` | `chainId`, `asset`, `expectedAmount`, `recipient`, `txHash`, `confirmations`, `status`, `bridgeStatus` | servidor indexador/verificador |
| `miners/{minerId}` | `uid`, `orderId`, `powerTh`, `efficiencyWattsPerTh`, `status`, `activatedAt` | servidor, solo con orden liquidada |
| `workers/{workerId}` | `uid`, `minerId`, `pool`, `poolWorkerLabel`, `contractedTh`, `status`, `activationMode`, `activatedAt`, `poolVerifiedAt` | servidor tras liquidar la orden; cambios de estado auditados |
| `subscriptions/{subscriptionId}` | `uid`, `planId`, `periodStart`, `periodEnd`, `status`, `termsVersion`, `autoRenewConsent` | servidor |
| `referralEdges/{uid}` | `referrerUid`, `createdAt`, `source`, `status` | servidor; impedir ciclos y auto-referidos |
| `miningRewardEvents/{eventId}` | `minerId`, `pool`, `sourceTx`, `period`, `grossAsset`, `grossAmount`, `netUsd`, `status` | servidor reconciliador |
| `referralCommissionLedger/{commissionId}` | `rewardEventId`, `beneficiaryUid`, `level`, `rateBps`, `amount`, `status`, `idempotencyKey` | servidor; inmutable salvo reversión compensatoria |
| `poolSnapshots/{snapshotId}` | `pool`, `retrievedAt`, `hashrate`, `workers`, `revenueEstimate`, `source` | servidor lector de pool |
| `poolPayouts/{payoutId}` | `pool`, `txHash`, `asset`, `amount`, `receivedAt`, `confirmations`, `status`, `sourceUrl` | servidor verificador; un pago real por hash/índice |
| `workerShareWindows/{windowId}` | `workerId`, `startAt`, `endAt`, `acceptedShares`, `effectiveTh`, `source`, `verifiedAt` | servidor que lee telemetría de pool/stratum |
| `poolPayoutAllocations/{allocationId}` | `payoutId`, `workerId`, `shareWindowId`, `grossAmount`, `costs`, `clientPayout`, `unilevelReserve`, `status`, `idempotencyKey` | servidor, solo tras conciliar pago y participación |
| `operatorConfig/{version}` | tasas aprobadas, costos, redondeos, vigencia y `approvedBy` | operador autenticado, con auditoría |

## Reglas de escritura que debe aplicar el backend

El historial público de Kryptex que muestra la réplica es una lectura de interfaz desde el endpoint local de solo lectura. No crea documentos `poolPayouts` y no se debe interpretar el estado publicado por la pool como una confirmación independiente en Pearl o como liquidación a un comprador. Si luego se ingiere en Firestore, el servidor debe volver a verificar la transacción, conservar la URL/fuente, deduplicar por hash/índice y mantener separado el registro observado del estado de liquidación.

- Identificar pagos por cadena + hash + log/índice, con clave idempotente; una dirección compartida por sí sola no identifica una orden.
- Verificar el activo y la cantidad recibida neta, red y destinatario en cadena. Un callback de wallet solo indica que el navegador pidió enviar; no prueba confirmación.
- Marcar por separado `submitted`, `confirmed`, `bridge_pending`, `settled`, `expired`, `underpaid` y `reversed`. El depósito Bridge no se considera liquidado en USDT hasta verificar su resultado.
- Crear el minero y asignar un `workerId` en la misma operación transaccional de servidor que liquida la orden. En modo automático solo activar tras verificar el pago y disponer de una ruta de pool; en modo manual mantener `pending_activation` hasta acción auditada de operador. Reintentos no deben duplicar activos ni comisiones.
- Para liquidaciones mineras, calcular primero `N = pool recibido asignable - electricidad - mantenimiento`. Con el parámetro indicado por el operador, el fondo Unilevel es 20% del pago final al minero `P`, no 20% de `N`: `P = N / 1.2`; `U = 0.2 * P`. La comisión directa es 10% de `P`, incluida en `U`; el otro 10% de `P` se distribuye entre niveles superiores según pesos relativos y profundidad configurada. Guardar versión de reglas, precisión y redondeo en cada cálculo.
- No distribuir una estimación diaria de Kryptex como pago. Para prorratear un `poolPayout`, primero verificar el depósito real y usar participación efectiva de cada worker durante la ventana; el TH contratado por sí solo no prueba trabajo aceptado. Niveles sin beneficiario elegible quedan reservados y no se pagan automáticamente.
- Guardar revisiones de configuración y movimientos compensatorios en vez de editar ledger histórico.

## Índices y consultas

Índices compuestos que probablemente se necesitarán cuando se confirme el backend: `orders(uid,status,createdAt desc)`, `orders/paymentAttempts(chainId,txHash)`, `miners(uid,status)`, `workers(status,createdAt)`, `subscriptions(uid,status,periodEnd)`, `miningRewardEvents(minerId,period desc)`, `referralCommissionLedger(beneficiaryUid,status,createdAt desc)`, `poolSnapshots(pool,retrievedAt desc)` y `poolPayouts(pool,receivedAt desc)`. Ajustar los índices a las consultas reales antes de desplegar.

## Pendientes y límites verificados

La persistencia demo remota está activa en el proyecto de prueba y se verificó la vuelta UI de lectura/escritura. Las sesiones anónimas no son cuentas recuperables entre navegadores o dispositivos; cada navegador conserva su propia identidad de Firebase. Para producción se necesita configurar orígenes autorizados, reglas revisadas, supervisión y una política de retención adecuadas al dominio definitivo. No reutilizar el proyecto de prueba ni sus ajustes como configuración de producción sin revisión.

No existe backend de órdenes, pagos ni conciliación on-chain. El cliente no debe acreditar depósitos ni activar mineros/suscripciones a partir de una dirección, solicitud de wallet o hash. Esas funciones requieren verificación de servidor, idempotencia y controles operativos independientes.

El backend de órdenes/pagos, verificación on-chain, idempotencia, acreditación de compras y activación de mineros/suscripciones no están implementados. El `.firebaserc` del ejemplo Unilevel apunta a otro proyecto y no se reutiliza.
