# Esquema de Firestore: Cuentas, Mineros, Referidos, Finanzas y Unilevel 20 Niveles

Este documento describe el esquema canónico implementado en Cloud Firestore para la gestión de usuarios, el sistema de referidos con comisión directa del 10% (primera compra y recompra), la colección contable dedicada de referidos (`/referrals/{uid}`), el algoritmo de distribución Unilevel de 20 niveles (`/unilevel_distributions` y `/mining_daily_profit`), la persistencia de mineros (`/miners/{uid}/miner/{minerId}`), y las reglas de seguridad.

---

## 1. Colecciones Implementadas

### 1.1. Colección `users/{uid}`

Almacena los datos de perfil, seguridad y la estructura del árbol de referidos de cada usuario registrado con Firebase Authentication.

| Campo | Tipo | Descripción |
|---|---|---|
| `uid` | string | Identificador único del usuario (Firebase Auth UID). |
| `email` | string | Correo electrónico en minúsculas del usuario. |
| `username` | string | Alias o nombre de usuario visible. |
| `photoURL` | string | URL o emoji/avatar del perfil del usuario. |
| `telegramHandle` | string | Usuario de Telegram vinculado (sin @). |
| `twitterHandle` | string | Usuario de X / Twitter vinculado (sin @). |
| `twoFactorEnabled` | boolean | Estado de la autenticación de doble factor (2FA). |
| `country` | string | País detectado automáticamente por IP al registrarse/iniciar sesión. |
| `createdAt` | timestamp | Fecha y hora de creación de la cuenta en el servidor. |
| `emailVerified` | boolean | Indica si el correo electrónico ha sido verificado. |
| `walletAddress` | string | Dirección pública de la wallet Web3 vinculada. |
| `balance` | number | Saldo disponible en USD. |
| `commissionBalance` | number | Saldo acumulado por comisiones de referidos. |
| `totalCommissionsEarned` | number | Histórico total de comisiones acreditadas en USD. |
| `purchasesCount` | number | Contador total de compras de mineros realizadas por el usuario. |
| `firstPurchaseAt` | timestamp | Fecha de la primera compra de minero. |
| `lastPurchaseAt` | timestamp | Fecha de la compra o recompra más reciente. |
| `sponsorId` | string | UID del patrocinador directo para la cadena de uplines. |
| `referral.referrerBy` | string | Código de referido del patrocinador directo. |
| `referral.referralCode` | string | Código único propio generado para invitar a otros usuarios (ej. `ALEX8K9P`). |
| `referral.userReferrals` | array<string> | Lista de correos de los usuarios referidos directamente. |
| `referral.joinDate` | timestamp | Fecha de vinculación al sistema de referidos. |

#### Subcolección `users/{uid}/demoState/current`
Conserva el estado de la sesión local demo para pruebas y persistencia en navegador (sin datos financieros reales).

---

### 1.2. Colección Contable Dedicada `/referrals/{uid}` (Patrón 1nvezt)

Colección independiente del perfil de usuario dedicada exclusivamente al cálculo financiero, auditoría de comisiones, saldo retirable y libro contable de ingresos/gastos de referidos.

| Campo | Tipo | Descripción |
|---|---|---|
| `uid` | string | UID del usuario patrocinador titular de la cuenta. |
| `referralCode` | string | Código de referido propio. |
| `referrerBy` | string | Código del patrocinador ascendente. |
| `totalCommissionsEarned` | number | Histórico total de comisiones generadas (directas + unilevel). |
| `pendingCommissions` | number | Comisiones pendientes o retenidas. |
| `withdrawableBalance` | number | Saldo disponible y liquidable para retiro. |
| `totalWithdrawn` | number | Total de comisiones retiradas históricamente. |
| `directReferralsCount` | number | Número total de referidos directos. |
| `directReferrals` | array<string> | Correos electrónicos de los referidos directos. |
| `firstReferralAt` | timestamp | Fecha del primer usuario referido. |
| `lastCommissionAt` | timestamp | Fecha de la última comisión acreditada. |
| `createdAt` | timestamp | Fecha de creación del libro contable. |
| `updatedAt` | timestamp | Última actualización de saldos. |

#### Subcolección de Transacciones Contables `/referrals/{uid}/transactions/{txId}`
Registro inmutable de movimientos financieros por referidos (comisiones directas, ingresos unilevel, retiros).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador único de transacción (`COMM-...` o `UNILVL-...`). |
| `referralUid` | string | UID del titular de la cuenta de referidos. |
| `type` | string | Tipo de movimiento: `'commission_income'`, `'unilevel_income'`, `'withdrawal'`. |
| `amount` | number | Importe del movimiento en USD. |
| `currency` | string | Moneda (`USD`). |
| `source` | string | Origen: `'miner_purchase'` o `'unilevel_daily_profit'`. |
| `purchaseType` | string | Distinción de compra: `'first_purchase'` o `'repurchase'`. |
| `purchaseNumber` | number | Número ordinal de compra del comprador. |
| `buyerUid` | string | UID del comprador del minero. |
| `buyerEmail` | string | Correo del comprador. |
| `minerId` | string | ID del minero adquirido. |
| `minerPrice` | number | Precio pagado por el minero. |
| `rate` | number | Tasa porcentual aplicada (ej. `0.10` para bono directo). |
| `level` | number | Nivel de la comisión (1 para directo, 1 a 20 para unilevel). |
| `description` | string | Descripción auditada de la transacción. |
| `status` | string | Estado: `'completed'`, `'pending'`. |
| `timestamp` | timestamp | Marca temporal de la transacción. |

---

### 1.3. Colección del Árbol Unilevel `/unilevel/{uid}`

Almacena el nodo de la red Unilevel para cada usuario, conteniendo la pre-computación de la cadena de hasta 20 niveles de uplines (patrocinadores ascendentes), el conteo de referidos directos y el volumen total de usuarios en su red descendente (*downline*).

| Campo | Tipo | Descripción |
|---|---|---|
| `uid` | string | UID del usuario propietario del nodo. |
| `email` | string | Correo electrónico del usuario. |
| `referralCode` | string | Código de referido propio. |
| `sponsorId` | string \| null | UID del patrocinador directo (null si es nodo raíz). |
| `sponsorCode` | string | Código de referido del patrocinador directo. |
| `uplines` | array<map> | Cadena ordenada de hasta 20 niveles ascendentes precomputada para lookup O(1): |
| `uplines[].level` | number | Nivel de patrocinio relativo (1 para directo, 2 para abuelo, ..., hasta 20). |
| `uplines[].uid` | string | UID del patrocinador en ese nivel. |
| `uplines[].email` | string | Correo del patrocinador en ese nivel. |
| `uplines[].referralCode` | string | Código de referido del patrocinador. |
| `directCount` | number | Conteo de referidos directos en su primer nivel de la red. |
| `totalTeamCount` | number | Total acumulado de miembros en su red a lo largo de los niveles. |
| `createdAt` | timestamp | Fecha de registro en la red Unilevel. |
| `updatedAt` | timestamp | Última actualización de la red. |

---

### 1.4. Colección de Comisiones Directas `/referralCommissions/{commissionId}`

Auditoría inmutable de bonos directos del 10% generados por compras y recompras de mineros.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | ID idempotente (`COMM-${minerId}`). |
| `referrerUid` | string | UID del patrocinador. |
| `referrerCode` | string | Código del patrocinador. |
| `buyerUid` | string | UID del comprador. |
| `buyerEmail` | string | Correo del comprador. |
| `minerId` | string | ID del minero. |
| `minerPrice` | number | Precio en USD. |
| `commissionAmount` | number | 10% del precio total acreditado al patrocinador. |
| `rate` | number | `0.10` (10%). |
| `txHash` | string | Hash de la transacción on-chain. |
| `type` | string | **`first_purchase`** (primera compra) o **`repurchase`** (recompra). |
| `purchaseNumber` | number | Número de compra en el historial del comprador. |
| `status` | string | `credited`. |
| `createdAt` | timestamp | Fecha de acreditación. |

---

### 1.4. Colección de Distribuciones Unilevel 20 Niveles `/unilevel_distributions/{distributionId}`

Conforme al Diseño Técnico en Notion del Algoritmo Unilevel de 20 niveles.
Distribuye el 20% del profit diario elegible (`eligibleProfit = grossProfit - dailyCosts`) a lo largo de una cadena de hasta 20 niveles de uplines.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | ID único (`UNILVL-${minerUid}-${date}-${minerId}`). |
| `date` | string | Fecha del ciclo comisionable (YYYY-MM-DD). |
| `minerUid` | string | UID del minero origen de la producción. |
| `minerId` | string | ID del minero generador. |
| `eligibleProfit` | number | Profit diario elegible en USD tras deducir costos operativos. |
| `unilevelPool` | number | Fondo total Unilevel (**20% del profit elegible**). |
| `maxLevels` | number | Profundidad máxima (**20 niveles**). |
| `distributions` | array<map> | Desglose por cada uno de los 20 niveles: |
| `distributions[].level` | number | Nivel de profundidad (1 al 20). |
| `distributions[].sponsorId` | string \| null | UID del patrocinador en ese nivel (o null si no existe). |
| `distributions[].sponsorEmail` | string \| null | Correo del patrocinador en ese nivel. |
| `distributions[].percentage` | number | Porcentaje del fondo asignado al nivel (tabla de pesos). |
| `distributions[].rate` | number | Tasa efectiva sobre el profit elegible. |
| `distributions[].amount` | number | Monto en USD liquidado o retenido. |
| `distributions[].status` | string | `'credited'` (acreditado al upline) o `'unclaimed_missing_upline'` (retenido). |
| `totalDistributed` | number | Total efectivamente pagado a uplines activos. |
| `totalUnclaimed` | number | Total retenido por niveles sin patrocinador calificado. |
| `createdAt` | timestamp | Marca de tiempo del cálculo. |

#### Tabla Canónica de Porcentajes Unilevel (20 Niveles - Suma 100% del fondo 20%):
- **Nivel 1:** 20%
- **Nivel 2:** 15%
- **Nivel 3:** 10%
- **Nivel 4:** 8%
- **Nivel 5:** 7%
- **Nivel 6:** 6%
- **Nivel 7:** 5%
- **Nivel 8:** 4%
- **Nivel 9:** 4%
- **Nivel 10:** 3%
- **Nivel 11:** 3%
- **Nivel 12:** 2%
- **Nivel 13:** 2%
- **Nivel 14:** 2%
- **Nivel 15:** 2%
- **Nivel 16:** 2%
- **Nivel 17:** 1%
- **Nivel 18:** 1%
- **Nivel 19:** 1%
- **Nivel 20:** 2%

---

### 1.5. Colección de Producción Diaria `/mining_daily_profit/{profitId}`

Auditoría de los rendimientos brutos y costos operativos diarios de cada minero que sirven de base para el cálculo Unilevel.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | ID único (`PROFIT-${minerUid}-${date}-${minerId}`). |
| `date` | string | Fecha (YYYY-MM-DD). |
| `minerUid` | string | UID del propietario del minero. |
| `minerId` | string | ID del minero. |
| `dailyGrossProfit` | number | Ingreso bruto diario en USD generado por el pool. |
| `dailyCosts` | number | Costo operativo diario (electricidad + mantenimiento). |
| `eligibleProfit` | number | Profit neto elegible comisionable (`gross - costs`). |
| `unilevelPool` | number | Presupuesto Unilevel del 20% reservado para uplines. |
| `status` | string | `'processed'`. |
| `createdAt` | timestamp | Marca temporal del registro. |

---

### 1.6. Colección de Mineros `/miners/{uid}/miner/{minerId}`

Almacena los mineros adquiridos mediante Connect Wallet.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador único (`MINER-...`). |
| `uid` | string | UID del usuario propietario. |
| `name` | string | Nombre descriptivo del modelo. |
| `powerTh` | number | Potencia de minado en TH/s. |
| `efficiency` | number | Eficiencia energética: 15 W/TH. |
| `efficiencyWattsPerTh` | number | 15 W/TH. |
| `price` | number | Precio pagado en USD. |
| `currency` | string | `USD`. |
| `status` | string | `active`, `mining`, `customizing`. |
| `txHash` | string | Hash on-chain confirmado. |
| `network` | string | Red de pago (BNB Chain, Solana, Ethereum, etc.). |
| `ownerWallet` | string | Dirección de la wallet firmante. |
| `createdAt` | timestamp | Marca temporal de activación. |
| `visualTraits` | map | Rasgos cosméticos, colores y calcomanías. |

---

### 1.7. Colección de Detección de País `/countries/{uid}`

Almacena el registro de auditoría de país y dirección IP detectados automáticamente en segundo plano para cada usuario.

| Campo | Tipo | Descripción |
|---|---|---|
| `uid` | string | UID del usuario autenticado. |
| `country` | string | Nombre completo del país detectado por IP. |
| `detectedAt` | timestamp | Marca temporal de la detección. |
| `ip` | string | Dirección IP detectada. |

---

## 2. Reglas de Seguridad en Cloud Firestore (`firestore.rules`)

1. **Usuarios (`users/{uid}`)**:
   - Lectura pública para consulta de códigos de referido de patrocinadores.
   - Creación permitida para el propio usuario autenticado (`request.auth.uid == uid`).
   - Actualización permitida al propietario para perfil/seguridad/2FA/cuentas vinculadas, o para patrocinadores/compradores que actualizan campos de referidos y saldo (`referral`, `commissionBalance`, `balance`, `totalCommissionsEarned`, `purchasesCount`, etc.).
2. **Miners (`/miners/{uid}/miner/{minerId}`)**:
   - Aislados por usuario: lectura y escritura exclusivas del propietario (`request.auth.uid == uid`).
3. **Registro de Comisiones (`referralCommissions/{commissionId}`)**:
   - Creación y lectura permitidas a usuarios autenticados. Edición y borrado denegados (inmutabilidad).
4. **Colección Contable `/referrals/{uid}` y `/referrals/{uid}/transactions/{txId}`**:
   - Lectura y creación/actualización permitidas a usuarios autenticados para asentar comisiones y bonos de compras. Eliminación prohibida.
5. **Producción Diaria y Unilevel (`/mining_daily_profit` y `/unilevel_distributions`)**:
   - Lectura y creación permitidas a usuarios autenticados; edición y eliminación denegadas para preservar la auditoría de cálculo.
6. **País Detectado (`/countries/{uid}`)**:
   - Lectura y escritura permitidas únicamente al usuario autenticado propietario (`isAuthenticated() && request.auth.uid == uid`).
7. **Denegación por Defecto**: Cualquier otra ruta no especificada queda explícitamente bloqueada (`allow read, write: if false;`).

