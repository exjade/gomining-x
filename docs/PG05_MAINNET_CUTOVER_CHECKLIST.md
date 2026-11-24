# PG-05 — Runbook de Smoke E2E Testnet ($0) y Checklist de Corte a Mainnet (`SCRUM-347`)

> **Epic:** `SCRUM-330` (Pasarela de Pagos Segura — `ADR-0005 Rev 2`, `ADR-0006`, `ADR-0007`)
> **Alcance:** Validación operativa pre-Mainnet ($0 en Testnets con faucets) y compuerta Go/No-Go antes de activar `PAYMENT_NETWORK_MODE=mainnet` / `VITE_PAYMENT_NETWORK_MODE=mainnet`.

---

## 1. Pre-requisitos de Entorno Testnet ($0 con Faucets)

### 1.1 Redes soportadas en Testnet y Faucets gratuitos

| Red | `networkId` | Chain ID | Explorador Testnet | Confirmaciones requeridas | Faucet sugerido |
| --- | --- | --- | --- | --- | --- |
| BNB Smart Chain Testnet | `bsc` | `97` (`0x61`) | `https://testnet.bscscan.com` | `15` bloques | BNB Chain Testnet Faucet (tBNB + token ERC-20 USDT testnet) |
| Polygon Amoy Testnet | `polygon` | `80002` (`0x13882`) | `https://amoy.polygonscan.com` | `64` bloques | Polygon Faucet Amoy (POL + token ERC-20 USDT testnet) |
| Solana Devnet | `solana` | `solana-devnet` | `https://solscan.io?cluster=devnet` | `1` (`finalized`) | `solana airdrop 2` / Solana Web Faucet (SOL devnet + SPL mint testnet) |
| Ethereum Sepolia *(opcional)* | `ethereum` | `11155111` (`0xaa36a7`) | `https://sepolia.etherscan.io` | `12` bloques | Solo si `PAYMENT_ENABLE_ETHEREUM=true` y `VITE_PAYMENT_ENABLE_ETHEREUM=true` |

### 1.2 Variables mínimas de Testnet

**Cloud Functions Gen 2 (`functions/src/payments/`):**
- `PAYMENT_NETWORK_MODE=testnet`
- `TREASURY_EVM_ADDRESS=<wallet-tesoreria-evm-testnet>`
- `TREASURY_SOLANA_ADDRESS=<wallet-tesoreria-solana-devnet>`
- `PAYMENT_RPC_URL_BSC_TESTNET=<https-rpc-bsc-testnet>`
- `PAYMENT_RPC_URL_POLYGON_TESTNET=<https-rpc-polygon-amoy>`
- `PAYMENT_RPC_URL_SOLANA_TESTNET=<https-rpc-solana-devnet>`
- `PAYMENT_TESTNET_USDT_BSC_CONTRACT=<contrato-usdt-18-decimales-bsc-testnet>`
- `PAYMENT_TESTNET_USDT_POLYGON_CONTRACT=<contrato-usdt-6-decimales-amoy>`
- `PAYMENT_TESTNET_USDT_SOLANA_MINT=<mint-spl-6-decimales-devnet>`
- `PAYMENT_ENABLE_ETHEREUM=false` *(o `true` + `PAYMENT_RPC_URL_ETHEREUM_TESTNET` + `PAYMENT_TESTNET_USDT_ETHEREUM_CONTRACT`)*

**App Cliente (build Vite):**
- `VITE_PAYMENT_NETWORK_MODE=testnet`
- `VITE_REOWN_PROJECT_ID=<reown-project-id>`
- `VITE_PAYMENT_ENABLE_ETHEREUM=false`
- `VITE_PAYMENT_TESTNET_USDT_BSC_CONTRACT=<mismo-contrato-backend>`
- `VITE_PAYMENT_TESTNET_USDT_POLYGON_CONTRACT=<mismo-contrato-backend>`
- `VITE_PAYMENT_TESTNET_USDT_SOLANA_MINT=<mismo-mint-backend>`
- **0 direcciones de tesorería en build cliente** (`receiverAddress` llega exclusivamente del `PaymentIntent` del servidor).

---

## 2. Smoke E2E Real en Testnet ($0)

### 2.1 Caso A — Flujo Normal con Navegador Abierto (EVM Testnet + Solana Devnet)

Ejecutar en al menos **1 red EVM** (`bsc` Chain ID `97` o `polygon` Chain ID `80002`) y en **Solana Devnet** (`solana`), cubriendo USDT testnet y moneda nativa faucet (`BNB`/`POL`/`SOL`):

1. **Autenticación y sesión:** Iniciar sesión con usuario registrado (no anónimo) con correo verificado y conectar wallet de prueba vía **Reown AppKit** (`WalletPanel` / `WalletPaymentCheckout`).
2. **Creación de Intent:** Seleccionar un paquete de minero activo y elegir red + activo.
   - **Verificar:** `createPaymentIntent` / `selectPaymentMethod` devuelve `status: 'AWAITING'`, `networkMode: 'testnet'`, `treasuryAddress` del servidor y `expectedAmountAtomic` en BigInt (18 dec en BSC USDT; 6 dec en Polygon/Solana USDT).
   - **Verificar en Firestore / UI:** Aparece la orden en `ClientPaymentHistory` (`where('userId', '==', auth.uid)`) con badge `TESTNET`, estado `Esperando pago` y botón `Cancelar orden` habilitado.
3. **Envío On-Chain:** Firmar y transmitir la transferencia desde Reown AppKit.
   - **Verificar transición `AWAITING -> PROCESSING`:** El checkout invoca `confirmPaymentIntent({ intentId, txHash })`; el estado pasa a `PROCESSING` mostrando barra de progreso `confirmations / requiredConfirmations` (p. ej. `3 / 15` en BSC Testnet) y enlace al explorer testnet (`testnet.bscscan.com` / `amoy.polygonscan.com` / `solscan.io?...cluster=devnet`).
   - **Verificar botón cancelar bloqueado:** Una vez con `txHash` / `PROCESSING`, el botón `Cancelar orden` desaparece.
   - **Verificar 0 activación prematura:** Mientras está en `PROCESSING`, confirmar 0 documentos en `/miners/{uid}/miner/miner_{orderId}`, 0 en `/admin_contracts/contract_{orderId}` y 0 comisiones en `/referralCommissions`.
4. **Liquidación atómica (`SETTLED`):** Al alcanzar `confirmations >= requiredConfirmations` (o `finalized` en Solana Devnet):
   - **Verificar en Cliente:** Badge cambia en vivo a **`Paid — Minero Activo`**, aparece enlace al minero (`/nft-miners/miner_{orderId}`) y el minero aparece en la granja tras recargar o cambiar de dispositivo.
   - **Verificar en Admin (`PackagePaymentsView` & `AdminOverview`):** KPIs (`Volumen Liquidado`, `Potencia Total Vendida`) se actualizan en tiempo real; la fila muestra `Paid — Minero Activo`, `TESTNET`, link de explorer y `activatedMinerId`/`contractId`.
   - **Verificar en `ContractsAllocationView`:** El contrato `contract_{orderId}` aparece con `orderId`, `activatedMinerId` y `status: 'ACTIVE'`. Probar ajuste de asignación / pausa y confirmar mutación exitosa vía `PATCH /api/admin/contracts/:contractId` (Admin SDK) sin errores `permission-denied`.
   - **Verificar anti-replay:** Reintentar `confirmPaymentIntent` con el mismo `txHash` en otro `intentId` → debe rechazar con `already-exists` (`TX_HASH_ALREADY_USED`).

### 2.2 Caso B — Algoritmo Autónomo (Cierre Inmediato de Pestaña)

Ejecutar en **BSC Testnet (97)** y **Solana Devnet**:

1. Crear `PaymentIntent` y seleccionar red/activo (`AWAITING`) con `senderWallet` vinculado.
2. Firmar y transmitir el pago on-chain desde la wallet.
3. **Cerrar inmediatamente la pestaña del navegador** antes de que el frontend pueda invocar `confirmPaymentIntent`.
4. Esperar 1–2 ciclos del scheduler `reconcilePendingPayments` (o ejecutar manualmente en staging).
5. Reabrir la aplicación en Cliente y en Admin Dashboard:
   - **Verificar:** `reconcilePendingPayments` descubrió el depósito on-chain (logs ERC-20 / bloques nativos en EVM; `getSignaturesForAddress` + `getTokenAccountsByOwner` en Solana), avanzó `AWAITING -> PROCESSING -> SETTLED` sin intervención manual.
   - **Verificar aprovisionamiento:** Existen `/miners/{uid}/miner/miner_{orderId}` (`status: 'active'`), `/admin_contracts/contract_{orderId}` (`status: 'ACTIVE'`), `/usedTxHashes/{chainId}_{txHash}` y `/admin_orders/{orderId}` (`status: 'SETTLED'`).
   - **Verificar comisión `SCRUM-229`:** Si el comprador tenía sponsor vinculado **antes** de crear el intent, confirmar crédito único del 10% en `userBalances/{sponsorUid}.availableBalanceMicros` y `referralCommissions/COMM-miner_{orderId}`. Si el sponsor se vinculó después (o si fue suscripción), confirmar **0%**.

---

## 3. Checklist Go/No-Go de Paso a Mainnet

### 3.1 Secret Manager y Variables de Entorno — Backend (`functions/` + Express)

| Variable canónica en código | Alias operativo / Jira | Requisito Mainnet | Verificado |
| --- | --- | --- | --- |
| `PAYMENT_NETWORK_MODE` | `PAYMENT_NETWORK_MODE` | `mainnet` | [ ] |
| `TREASURY_EVM_ADDRESS` | `TREASURY_EVM_ADDRESS` | Dirección EVM Mainnet custodiada (no zero-address, verificada por 2 operadores) | [ ] |
| `TREASURY_SOLANA_ADDRESS` | `TREASURY_SOLANA_ADDRESS` | Dirección Solana Mainnet custodiada (Base58 válida, con ATA USDT inicializado) | [ ] |
| `PAYMENT_RPC_URL_BSC_MAINNET` | `BSC_RPC_URL` | Endpoint HTTPS dedicado con SLA/rate-limit suficiente (no público compartido) | [ ] |
| `PAYMENT_RPC_URL_POLYGON_MAINNET` | `POLYGON_RPC_URL` | Endpoint HTTPS dedicado Polygon PoS (`chainId 137`) | [ ] |
| `PAYMENT_RPC_URL_SOLANA_MAINNET` | `SOLANA_RPC_URL` | Endpoint HTTPS dedicado Solana Mainnet (`mainnet-beta`, soporta `getTransaction` + `getTokenAccountsByOwner`) | [ ] |
| `PAYMENT_ENABLE_ETHEREUM` | `ENABLE_ETHEREUM_PAYMENTS` | `false` por defecto; solo `true` si se configura `PAYMENT_RPC_URL_ETHEREUM_MAINNET` (`ETHEREUM_RPC_URL`) | [ ] |
| `PAYMENT_INTENT_TTL_MINUTES` | *(opcional, default `15`)* | Entre `5` y `60` minutos | [ ] |
| Credenciales Firebase Admin SDK (Express) | `GOOGLE_APPLICATION_CREDENTIALS` / ADC / `FIREBASE_SERVICE_ACCOUNT_BASE64` | Activas en el servidor Express para `POST`/`PATCH /api/admin/contracts` | [ ] |

### 3.2 Variables de Build — Cliente (`Vite`)

| Variable canónica en código | Alias operativo / Jira | Requisito Mainnet | Verificado |
| --- | --- | --- | --- |
| `VITE_PAYMENT_NETWORK_MODE` | `VITE_PAYMENT_NETWORK_MODE` | `mainnet` | [ ] |
| `VITE_REOWN_PROJECT_ID` | `VITE_REOWN_PROJECT_ID` | Project ID productivo en Reown Cloud con dominio `PouwMiner.com` en allowlist | [ ] |
| `VITE_PAYMENT_ENABLE_ETHEREUM` | `VITE_ENABLE_ETHEREUM_PAYMENTS` | Alineado exactamente con `PAYMENT_ENABLE_ETHEREUM` en backend (`false` por defecto) | [ ] |
| Tesorerías en bundle cliente | — | Confirmar **0** direcciones de tesorería hardcodeadas en `dist/` | [ ] |

### 3.3 Orden Seguro de Despliegue (Zero-Downtime & Zero Permission Drift)

1. **Paso 1 — Backend Express + Cloud Functions Gen 2:**
   - Desplegar servidor Express con `POST /api/admin/contracts` y `PATCH /api/admin/contracts/:contractId` respaldados por Firebase Admin SDK (`SCRUM-370`).
   - Desplegar las **6 Cloud Functions Gen 2** de `functions/src/payments/index.js`:
     `createPaymentIntent`, `selectPaymentMethod`, `getPaymentIntent`, `cancelPaymentIntent`, `confirmPaymentIntent`, `reconcilePendingPayments`.
   - Confirmar que los triggers existentes `onPurchaseSettled` (`SCRUM-229`), `finalizeDailyMiningProfit` (`SCRUM-327`) y `onMiningProfitFinalized` (`SCRUM-230`) siguen activos.
2. **Paso 2 — Reglas e Índices de Firestore:**
   - Verificar antes de desplegar: `firestore.rules` en LF puro con SHA-256 exacto `F4313C04DD7595E1C84D8977299169EEA38C2B250F96E6916D68959CDAAA6779`.
   - Desplegar `firestore.rules` (cierre `allow create, update, delete: if false;` sobre `/admin_orders`, `/admin_contracts`, `/payment_intents`, `/usedTxHashes`, `/referrals`, y `allow create, delete: if false;` + cosmetic-only update en `/miners/{uid}/miner/{minerId}`).
   - Confirmar que `firestore.indexes.json` mantiene el `COLLECTION_GROUP` fieldOverride en `miner.status` (0 índices nuevos requeridos por `SCRUM-370`).
3. **Paso 3 — Admin Dashboard y App Cliente:**
   - Desplegar Admin Dashboard (`PackagePaymentsView` con `Re-verificar On-Chain`, `ContractsAllocationView` vía `/api/admin/contracts` Admin SDK, `AdminOverview` reactivo).
   - Desplegar App Cliente (`WalletPaymentCheckout` Reown AppKit Only + `ClientPaymentHistory` en tiempo real).

### 3.4 Validación Post-Deploy y Criterios de Rollback

- **Post-Deploy Inmediato:**
  - [ ] Verificar que un cliente autenticado recibe `PERMISSION_DENIED` al intentar `setDoc` directo sobre `/admin_orders` o `/admin_contracts`.
  - [ ] Verificar lectura de `ClientPaymentHistory` (`where('userId', '==', auth.uid)`) sin errores `failed-precondition`.
  - [ ] Ejecutar compra real de monto mínimo controlado en BSC Mainnet (USDT) y Solana Mainnet, confirmando liquidación `SETTLED`, activación del minero, registro en `/usedTxHashes`, aparición en Admin `PackagePaymentsView` y botón `Re-verificar On-Chain` idempotente (`ALREADY_SETTLED`).
  - [ ] Verificar logs de `reconcilePendingPayments` sin errores RPC ni fuga de URLs/secretos.
- **Disparadores de Rollback (No-Go / Pausa inmediata):**
  - Cualquier `RPC_CHAIN_MISMATCH` o error HTTP 5xx sostenido en `confirmPaymentIntent` / `reconcilePendingPayments`.
  - Cualquier escritura `permission-denied` en operaciones administrativas de `/api/admin/contracts` (indicaría falta de credenciales Admin SDK en Express).
  - Cualquier emisión del estado legado `'CONFIRMED'` en `/admin_orders` o disparo duplicado en `/referralCommissions`.

---

## 4. Deuda Técnica Conocida (No Bloqueante para PG-05)

- **`SCRUM-362` (`.gitattributes`):** Normalizar fin de línea LF en el repositorio para evitar conversiones CRLF en checkouts Windows sobre archivos con SHA-256 pineado (`firestore.rules`, `firestore.indexes.json`, `src/types/withdrawal.ts`).
- **`SCRUM-372` (Limpieza menor Admin UI):** Normalizar filtro `BNB`/`BSC` en `PackagePaymentsView.tsx` y retirar fallback estático `INITIAL_CONTRACTS` en `hashrateAllocationService.ts`.
- **Alineación histórica de `test/unit/scrum210SchemaRules.test.ts:448`:** Test legacy previo a `SCRUM-346` que esperaba `allow create` en `/miners/{uid}/miner/{minerId}`; su fallo está documentado en baseline desde `SCRUM-346` (`b704c079`) y requiere microtarea dedicada.
