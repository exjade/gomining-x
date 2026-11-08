# Firestore Contract: Esquema, Índices, Reglas de Seguridad y Trazabilidad (SCRUM-210 / POUW-1.3)

Este documento define formalmente el contrato de datos en Cloud Firestore para el catálogo dinámico de paquetes comerciales (`commercial_packages`), campañas (`campaigns`), trazabilidad de compras inmutables (`/miners/{uid}/miner/{minerId}`), índices compuestos y reglas de seguridad de Firestore.

---

## 1. Clasificación Metodológica de Decisiones (AGENTS.md)

| Concepto | Clasificación | Detalle / Justificación |
|---|---|---|
| Colección `commercial_packages/{packageId}` | `ACCEPTED_DECISION` | Aprobada en Fase 0 y `FASE-1_INIT.md`. |
| Colección `campaigns/{campaignId}` | `ACCEPTED_DECISION` | Aprobada en `JIRA_pouwminer_story_paquetes_dinamicos.md` y `SCRUM-210`. |
| Modelo de moneda en centavos enteros (`priceUsdCents`) | `ACCEPTED_DECISION` | Fijada para evitar pérdida de precisión con `double`/punto flotante. |
| Separación `packageId != minerId` | `ACCEPTED_DECISION` | Aprobada explícitamente por el PO en `FASE-1_INIT.md`. |
| Preservación del flujo de compra actual | `ACCEPTED_DECISION` | El modal crea instancia en `/miners/{uid}/miner/{minerId}` sin modificar compras históricas. |
| Archivar vs. Hard Delete (`status='ARCHIVED'`) | `ACCEPTED_DECISION` | Prohibido el borrado físico de paquetes comerciales. |
| Moneda visible Client (USD) vs Cobro (USDT/crypto) | `ACCEPTED_DECISION` | El cliente muestra USD; el checkout liquida en crypto/USDT. |
| IDs sugeridos (`preventa-01`, `minerx-01`, etc.) | `PROPOSED` | Propuestos para legibilidad e idempotencia; pendientes de confirmación final. |
| DisplayNames finales de MinerX 1–5 | `OPEN_QUESTION` | Requiere confirmación del PO antes de sembrar (`NEEDS_PO_DECISION`). |
| Inclusión de los 16 niveles de Lanzamiento | `OPEN_QUESTION` | Requiere confirmación del PO antes de sembrar (`NEEDS_PO_DECISION`). |
| Inclusión de los 22 tiers Custom | `OPEN_QUESTION` | Requiere confirmación del PO antes de sembrar (`NEEDS_PO_DECISION`). |
| Cuarto plan Mensual ("Máximo") | `OPEN_QUESTION` | Requiere confirmación del PO antes de sembrar (`NEEDS_PO_DECISION`). |

---

## 2. Esquema de `commercial_packages/{packageId}`

### Campos Obligatorios y Preexistentes (Compatibilidad Retroactiva)
- `id` (string): Identificador único del documento.
- `name` (string): Nombre administrativo o descriptivo del paquete.
- `powerTh` (number): Potencia computacional en TH/s (> 0).
- `priceUsdt` (number): Precio nominal en USDT (> 0).
- `durationDays` (number): Duración en días del contrato (ej. 365).
- `status` ('ACTIVE' | 'ARCHIVED' | 'DRAFT'): Estado del paquete.
- `isPublished` (boolean): Bandera de visibilidad en el storefront.
- `variablePct` (number): Multiplicador variable porcentual (ej. 0.0, 2.5).
- `commissionPct` (number): Comisión de plataforma (ej. 2.0).
- `version` (number): Entero incremental (inicia en 1) que incrementa en cada actualización administrativa.
- `createdAt` (string ISO): Marca temporal de creación.
- `updatedAt` (string ISO): Marca temporal de última modificación.

### Campos Aditivos (SCRUM-205 / SCRUM-210)
- `packageId` (string, opcional): Alias para `id` garantizando compatibilidad de referencias entre contratos.
- `section` ('minerx' | 'preventa' | 'lanzamiento' | 'mensual'): Sección de la tienda donde se renderiza la oferta.
- `packageType` ('fixed' | 'subscription' | 'custom'): Tipo de paquete.
- `sortOrder` (number): Posición ordinal de ordenamiento visual dentro de la sección.
- `displayName` (string): Etiqueta textual visible literal del frontend (ej. `1.46 TH`, `Inicio`).
- `frontendKey` (string): Clave estable observada en el frontend para idempotencia y auditoría.
- `source` ('frontend-seed' | 'admin'): Origen del registro.
- `priceUsdCents` (int): Precio base exacto en centavos enteros de USD (ej. 1899 para $18.99).
- `pricePerThCents` (int, opcional): Precio por TH en centavos (utilizado en Lanzamiento).
- `priceUsdtCents` (int, opcional): Precio en centavos de USDT si aplica paridad directa.
- `billing` ('one_time' | 'monthly', opcional): Modalidad de facturación.
- `cadence` ('one_time' | 'monthly' | string, opcional): Cadencia de cobro (sinónimo interoperable de `billing`).
- `finalPriceUsdCents` (int, opcional): Precio calculado por el servidor aplicando descuentos vigentes. Si no hay descuento activo, equivale a `priceUsdCents`.
- `currency` ('USDT' | 'USD', opcional): Divisa declarada.
- `dailyBtcText` (string, opcional): Rendimiento diario en BTC como texto literal (ej. `'0.00000062'`) para evitar truncamiento de punto flotante.
- `roiPct` (number, opcional): Retorno anual estimado visible (ej. 52.5).
- `limitedUnits` (int, opcional): Cupos totales disponibles (ej. 30 para preventa).
- `availableUnits` (int, opcional): Cupos restantes disponibles para compra.
- `soldUnits` (int, opcional): Unidades vendidas.
- `publishedToStorefront` (boolean, opcional): Control secundario de publicación directa a storefront.
- `subscription` (map, opcional): `{ initialTh: number, upgradeTargetTh: number }`.
- `custom` (map, opcional): `{ minTh: number, maxTh: number, levels: number, minPriceUsdCents: number, maxPriceUsdCents: number }`.
- `uiText` (map, opcional): `{ subtitle?: string, badge?: string, note?: string, ctaText?: string }`.
- `discount` (map, opcional): Descuento directo por paquete:
  ```json
  {
    "isActive": false,
    "type": "percent",
    "value": 0,
    "label": "-10% PROMO",
    "startsAt": "2026-11-01T00:00:00Z",
    "endsAt": "2026-11-30T23:59:59Z"
  }
  ```
- `campaignIds` (array<string>, opcional): IDs de campañas aplicables.
- `maintenanceDiscountPct` (map, opcional): Descuentos en comisiones por nivel: `{ starter?: number, pro?: number, presale?: number }`.
- `minerTemplateId` (string | null, opcional): Hook futuro a plantilla NFT (inicializado en `null`).
- `updatedBy` (string, opcional): UID del administrador que ejecutó la última modificación.
- `seededAt` (string ISO, opcional): Marca temporal de siembra automática.

---

## 3. Esquema de `campaigns/{campaignId}`

Permite la administración de campañas y descuentos globales o por sección/paquete:
- `id` (string): Identificador único de la campaña (ej. `camp-black-friday-2026`).
- `name` (string): Nombre descriptivo de la campaña.
- `type` ('percent' | 'fixed'): Tipo de bonificación (porcentual o monto fijo en centavos).
- `value` (number): Valor del descuento (porcentaje 1–100 o centavos enteros).
- `startsAt` (string ISO): Fecha y hora de inicio de vigencia.
- `endsAt` (string ISO): Fecha y hora de finalización de vigencia.
- `isActive` (boolean): Interruptor administrativo de activación.
- `priority` (number): Prioridad de resolución en caso de solapamiento.
- `stackable` (boolean): Indica si puede acumularse con otros descuentos.
- `appliesTo` (map): Ámbito de aplicación:
  ```json
  {
    "all": false,
    "sections": ["minerx", "preventa"],
    "packageIds": ["minerx-01", "minerx-02"]
  }
  ```
- `badgeText` (string, opcional): Texto de la insignia visual (ej. `OFERTA FLASH`).
- `maxRedemptions` (number, opcional): Límite total de compras permitidas bajo la campaña.
- `redeemedCount` (number, opcional): Total de redenciones registradas.
- `createdBy` (string, opcional): UID del administrador creador.
- `createdAt` (string ISO): Marca de tiempo de registro.
- `updatedAt` (string ISO): Marca de tiempo de actualización.

---

## 4. Trazabilidad de Compra e Inmutabilidad de Instancias

Para cumplir con el requerimiento estricto de no convertir las compras en referencias vivas que muten con cambios futuros del catálogo:

### Contrato de Snapshot (`PurchasedPackageSnapshot`)
Cuando el usuario completa la compra de un minero, se captura una instantánea inmutable embebida directamente en el documento del minero en `/miners/{uid}/miner/{minerId}`:

```typescript
export interface PurchasedPackageSnapshot {
  packageId: string;
  packageName: string;
  displayName?: string;
  section?: 'minerx' | 'preventa' | 'lanzamiento' | 'mensual';
  packageType?: 'fixed' | 'subscription' | 'custom';
  powerTh: number;
  pricePaidCents: number;
  pricePaidUsd: number;
  pricePaidUsdt?: number;
  currency: string;
  billing?: 'one_time' | 'monthly';
  durationDays: number;
  variablePct: number;
  commissionPct: number;
  dailyBtcText?: string;
  roiPct?: number;
  discountApplied?: {
    type: 'percent' | 'fixed';
    value: number;
    label: string;
    campaignId?: string;
  };
  packageVersion: number;
  purchasedAt: string;
}
```

### Propiedades Garantizadas:
1. `minerId != packageId`: Cada minero tiene un UID aleatorio/único (`minerId`) mientras que el paquete tiene un ID de plantilla estable (`packageId`).
2. Desacoplamiento total: Si el administrador altera posteriormente el precio de `minerx-01` de $561.99 a $699.99 o cambia la potencia de 48 TH a 60 TH, las compras históricas conservan intacto su snapshot con los datos comprados en su momento.
3. Inmutabilidad y Regla Anti-Borrado: Las reglas de Firestore impiden `delete` en `/miners/{uid}/miner/{minerId}`.

---

## 5. Reglas de Seguridad en Cloud Firestore (`firestore.rules`)

Se eliminó definitivamente el comodín `allow read, write: if true;` y se reemplazó por reglas granulares basadas en roles:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated() && (
        request.auth.token.admin == true ||
        request.auth.token.role in ['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'OPERATOR'] ||
        exists(/databases/$(database)/documents/admin_users/$(request.auth.uid))
      );
    }

    function isOwner(uid) {
      return isAuthenticated() && request.auth.uid == uid;
    }

    // Catálogo de paquetes comerciales:
    // Lectura pública SOLO para paquetes publicados (isPublished == true)
    // Lectura completa y edición restringida a Administradores
    // Hard delete PROHIBIDO (solo archivar mediante status='ARCHIVED' e isPublished=false)
    match /commercial_packages/{packageId} {
      allow read: if resource.data.isPublished == true || isAdmin();
      allow create, update: if isAdmin();
      allow delete: if false;
    }

    // Campañas de la tienda:
    // Lectura pública SOLO de campañas activas (isActive == true)
    // Edición reservada a administradores; borrado físico prohibido
    match /campaigns/{campaignId} {
      allow read: if resource.data.isActive == true || isAdmin();
      allow create, update: if isAdmin();
      allow delete: if false;
    }

    // Instancias de mineros comprados:
    // Lectura y escritura exclusiva del propietario de la cuenta o del administrador
    // Borrado físico prohibido para garantizar integridad contable y de contratos
    match /miners/{uid}/miner/{minerId} {
      allow read, write: if isOwner(uid) || isAdmin();
      allow delete: if false;
    }

    // Colecciones administrativas protegidas (admin_users, admin_workers, etc.)
    match /admin_users/{userId} {
      allow read: if isAdmin() || (isAuthenticated() && request.auth.uid == userId);
      allow write: if isAdmin();
    }

    match /admin_workers/{workerId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    match /admin_contracts/{contractId} {
      allow read: if isAdmin() || (isAuthenticated() && resource.data.userId == request.auth.uid);
      allow create: if isAdmin() || (isAuthenticated() && request.resource.data.userId == request.auth.uid);
      allow update: if isAdmin();
      allow delete: if false;
    }

    match /admin_audit_logs/{logId} {
      allow read: if isAdmin();
      allow create: if isAuthenticated();
      allow update, delete: if false;
    }

    match /admin_settings/{settingId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    match /admin_orders/{orderId} {
      allow read: if isAdmin() || (isAuthenticated() && resource.data.userId == request.auth.uid);
      allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
      allow update: if isAdmin();
      allow delete: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 6. Índices Compuestos (`firestore.indexes.json`)

Se definieron los siguientes índices requeridos para las consultas de filtrado por sección, ordenamiento y vigencia:

1. `commercial_packages`:
   - `section` (ASC) + `isPublished` (ASC) + `publishedToStorefront` (ASC) + `sortOrder` (ASC): Consulta con doble validación de visibilidad de storefront.
   - `section` (ASC) + `publishedToStorefront` (ASC) + `sortOrder` (ASC): Consulta filtrada por storefront directo.
   - `section` (ASC) + `isPublished` (ASC) + `sortOrder` (ASC): Consulta principal del Client Storefront.
   - `section` (ASC) + `sortOrder` (ASC): Consulta del panel de administración por pestaña.
   - `isPublished` (ASC) + `sortOrder` (ASC): Consulta global de catálogo publicado.
   - `section` (ASC) + `status` (ASC) + `sortOrder` (ASC): Filtrado administrativo por estado y sección.
   - `section` (ASC) + `updatedAt` (DESC): Auditoría de cambios recientes por sección.
   - `status` (ASC) + `updatedAt` (DESC): Auditoría general de estado.
2. `campaigns`:
   - `isActive` (ASC) + `priority` (DESC): Resolución jerárquica de descuentos aplicables.
   - `isActive` (ASC) + `startsAt` (ASC) + `endsAt` (ASC): Verificación de ventana temporal de vigencia.
3. Se preservaron íntegramente los índices existentes para `admin_users` y `users`.
