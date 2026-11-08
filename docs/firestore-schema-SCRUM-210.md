# Firestore Contract: Esquema, Índices, Reglas de Seguridad y Trazabilidad (SCRUM-210 / POUW-1.3)

Este documento define formalmente el contrato de datos en Cloud Firestore para el catálogo dinámico de paquetes comerciales (`commercial_packages`), trazabilidad de compras inmutables (`/miners/{uid}/miner/{minerId}`), índices compuestos y reglas de seguridad de Firestore.

---

## 1. Clasificación Metodológica de Decisiones (AGENTS.md)

| Concepto | Clasificación | Detalle / Justificación |
|---|---|---|
| Colección `commercial_packages/{packageId}` | `ACCEPTED_DECISION` | Aprobada en Fase 0 y `FASE-1_INIT.md`. |
| Separación `packageId != minerId` | `ACCEPTED_DECISION` | Aprobada explícitamente por el PO en `FASE-1_INIT.md`. |
| Preservación del flujo de compra actual | `ACCEPTED_DECISION` | El modal crea instancia en `/miners/{uid}/miner/{minerId}` sin modificar compras históricas. |
| Archivar vs. Hard Delete (`status='ARCHIVED'` + `isPublished=false`) | `ACCEPTED_DECISION` | Prohibido el borrado físico de paquetes comerciales. |
| Moneda visible Client (USD) vs Cobro (USDT/crypto) | `ACCEPTED_DECISION` | El cliente muestra USD; el checkout liquida en crypto/USDT. |
| Cadencia estándar (`cadence`) | `ACCEPTED_DECISION` | Estandarizado en `cadence` ('one_time' \| 'monthly'). Se retira el alias duplicado `billing`. |
| Modelo de moneda en centavos enteros (`priceUsdCents`) | `PROPOSED` | Recomendación técnica de ingeniería para representación exacta de dinero. Mientras permanezca `PROPOSED`, NO se calcula ni infiere automáticamente en `deserializeCommercialPackageDoc`, NO se persiste automáticamente en `savePackage`, NO sustituye al precio base aceptado (`priceUsdt`) ni es requisito del schema. |
| Clave de frontend (`frontendKey`) | `PROPOSED` | Clave observada en seeds para trazabilidad e idempotencia. |
| IDs sugeridos (`preventa-01`, `minerx-01`, etc.) | `PROPOSED` | Propuestos para legibilidad e idempotencia del seed; no alteran labels, niveles ni precios del baseline. |
| Metadatos de auditoría interna (`source`, `updatedBy`, `seededAt`) | `PROPOSED` | Metadatos aditivos para trazabilidad operativa sin impacto en reglas de negocio. |
| Colección `campaigns/{campaignId}` | `OUT_OF_SCOPE` | Descuentos y campañas nuevas declaradas OUT OF SCOPE en `FASE-1_INIT.md`. Pertenecen a SCRUM-213. |
| Catálogo y UI del frontend como baseline (`main@99e0461`) | `ACCEPTED_DECISION` | El frontend actual es el baseline visual y funcional de la historia SCRUM-206. Se preservan exactamente nombres, precios, tabs, 16 niveles de lanzamiento, 22 tiers de custom, 4 planes mensuales (incluyendo "Máximo"), contenido, diseño y flujo de compra. No se modifican ni se inventan catálogos alternativos. |

---

## 2. Esquema Estricto de `commercial_packages/{packageId}`

### Campos Preexistentes (Compatibilidad Retroactiva)
- `id` (string): Identificador único del documento.
- `name` (string): Nombre descriptivo del paquete.
- `powerTh` (number): Potencia computacional en TH/s (> 0).
- `priceUsdt` (number): Precio nominal en USDT (> 0).
- `durationDays` (number): Duración en días del contrato (ej. 365).
- `status` ('ACTIVE' | 'ARCHIVED' | 'DRAFT'): Estado del paquete.
- `isPublished` (boolean): Bandera de visibilidad en el storefront.
- `variablePct` (number): Multiplicador variable porcentual (ej. 0.0, 2.5).
- `commissionPct` (number): Comisión de plataforma (ej. 2.0).
- `version` (number): Entero incremental (inicia en 1) que se incrementa en cada actualización administrativa.
- `description` (string, opcional): Descripción funcional del paquete.
- `maxPurchasesPerUser` (number, opcional): Límite de compras por usuario.
- `createdAt` (string ISO): Marca temporal de creación.
- `updatedAt` (string ISO): Marca temporal de última modificación.

### Campos Aditivos Autorizados (KEEP)
- `packageId` (string, opcional): Alias para `id` garantizando compatibilidad de referencias entre contratos.
- `section` ('minerx' | 'preventa' | 'lanzamiento' | 'mensual'): Sección de la tienda donde se renderiza la oferta.
- `packageType` ('fixed' | 'subscription' | 'custom'): Tipo de paquete.
- `sortOrder` (number, opcional): Posición ordinal de ordenamiento visual dentro de la sección.
- `displayName` (string, opcional): Etiqueta textual visible literal del frontend (ej. `1.46 TH`, `Inicio`).
- `frontendKey` (string, opcional - PROPOSED): Clave estable observada en el frontend para auditoría.
- `source` ('frontend-seed' | 'admin', opcional): Origen del registro.
- `priceUsdCents` (int, opcional - PROPOSED): Propuesta técnica para centavos enteros. Mientras siga PROPOSED, no se infiere ni persiste automáticamente en `commercial_packages`, ni sustituye al precio base aceptado `priceUsdt`.
- `currency` ('USDT' | 'USD', opcional): Divisa declarada.
- `cadence` ('one_time' | 'monthly' | string, opcional): Cadencia de facturación (estandarizada).
- `dailyBtcText` (string, opcional): Rendimiento diario en BTC como texto literal (ej. `'0.00000062'`) para evitar truncamiento por punto flotante.
- `roiPct` (number, opcional): Retorno anual estimado visible (ej. 52.5).
- `limitedUnits` (int, opcional): Cupos totales disponibles (ej. 30 para preventa).
- `availableUnits` (int, opcional): Cupos restantes disponibles para compra.
- `soldUnits` (int, opcional): Unidades vendidas.
- `updatedBy` (string, opcional): UID del operador que realizó la última modificación.
- `seededAt` (string ISO, opcional): Marca temporal de siembra.

### Campos Retirados / Fuera de Alcance (OUT OF SCOPE / NO AUTORIZADOS)
- `publishedToStorefront`: Retirado. Duplicaba la funcionalidad de `isPublished`.
- `billing`: Retirado como campo duplicado; estandarizado unívocamente en `cadence`.
- `finalPriceUsdCents`: Retirado. El cálculo dinámico de descuentos corresponde a SCRUM-213.
- `discount` y `campaignIds`: Retirados. Pertenecen al motor de promociones de SCRUM-213.
- `subscription`, `custom`, `uiText`, `maintenanceDiscountPct`, `minerTemplateId`, `pricePerThCents`, `priceUsdtCents`: Retirados por ser campos especulativos no requeridos por el frontend actual.

---

## 3. Estado de Campañas y Descuentos (SCRUM-213)

De acuerdo con `FASE-1_INIT.md` y `docs/c2c/FASE-1_001_Review.md`, la colección `/campaigns`, interfaces de `Campaign`, índices asociados y motor de descuentos fueron retirados íntegramente de SCRUM-210 por estar declarados explícitamente `OUT OF SCOPE`. Serán implementados en la tarea correspondiente (SCRUM-213) una vez autorizada.

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
  cadence?: 'one_time' | 'monthly' | string;
  durationDays: number;
  variablePct: number;
  commissionPct: number;
  dailyBtcText?: string;
  roiPct?: number;
  packageVersion: number;
  purchasedAt: string;
}
```

### Propiedades Garantizadas:
1. `minerId != packageId`: Cada minero tiene un identificador único de instancia (`minerId`) mientras que el paquete posee un ID de catálogo estable (`packageId`).
2. Desacoplamiento total: Modificaciones posteriores al catálogo (ej. actualizar potencia o precio a una nueva versión) no alteran el snapshot histórico de la compra.
3. Regla Anti-Borrado Estricta: En `firestore.rules`, se prohíbe taxativamente el borrado de instancias (`allow delete: if false;`) y se eliminó cualquier `allow write` que pudiera permitirlo indirectamente.

---

## 5. Reglas de Seguridad en Cloud Firestore (`firestore.rules`)

Se eliminó el comodín inseguro y se implementó una política de permisos explícitos con protección anti-borrado real:

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

    // Instancias de mineros comprados:
    // CORRECCIÓN ITERACIÓN 2: No utilizar "allow write", pues write incluye delete.
    // Se definen operaciones explícitas read, create, update y bloqueo estricto de delete.
    match /miners/{uid}/miner/{minerId} {
      allow read: if isOwner(uid) || isAdmin();
      allow create: if isOwner(uid) || isAdmin();
      allow update: if isOwner(uid) || isAdmin();
      allow delete: if false;
    }

    // Catálogo de paquetes comerciales:
    // Lectura pública SOLO para paquetes publicados (isPublished == true)
    // Lectura completa y edición restringida a Administradores
    // Hard delete PROHIBIDO (solo archivar mediante status='ARCHIVED' e isPublished=false)
    match /commercial_packages/{packageId} {
      allow read: if (resource != null && resource.data.isPublished == true) || isAdmin();
      allow create, update: if isAdmin();
      allow delete: if false;
    }

    // Colecciones administrativas protegidas
    match /admin_users/{userId} {
      allow read: if isAdmin() || (isAuthenticated() && request.auth.uid == userId);
      allow write: if isAdmin();
      match /{allSubcollections=**} {
        allow read, write: if isAdmin();
      }
    }

    match /users/{userId} {
      allow read: if true;
      allow create: if isAuthenticated() && request.auth.uid == userId;
      allow update: if isAdmin() || (isAuthenticated() && (
        request.auth.uid == userId ||
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'referral', 'commissionBalance', 'balance', 'totalCommissionsEarned',
          'purchasesCount', 'lastPurchaseAt', 'firstPurchaseAt', 'sponsorId'
        ])
      ));
      allow delete: if false;
      match /{allSubcollections=**} {
        allow read, write: if isAuthenticated() && request.auth.uid == userId;
      }
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

    match /minerx_users/{userId} {
      allow read, write: if isAdmin();
      match /{allSubcollections=**} {
        allow read, write: if isAdmin();
      }
    }

    match /minerx_audit_logs/{logId} {
      allow read: if isAdmin();
      allow create: if isAuthenticated();
      allow update, delete: if false;
    }

    match /minerx_app_data/{docId} {
      allow read, write: if isAdmin();
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

*Nota sobre validación:* Los tests automatizados en `test/unit/scrum210SchemaRules.test.ts` verifican estáticamente el contrato de código fuente (source-contract tests) de estas reglas. En particular, validan que ninguna sentencia `allow` contenga `write` antes de `:` (impidiendo tanto `allow write:` como `allow read, write:` o `allow create, write:`, los cuales anularían la restricción de `allow delete: if false;`). Para despliegues a producción se requerirá validación de comportamiento dinámico mediante el Firebase Local Emulator Suite.

---

## 6. Índices Compuestos (`firestore.indexes.json`)

Se conservan estrictamente los índices compuestos indispensables para las consultas de paquetes comerciales y administración de usuarios:

1. `commercial_packages`:
   - `section` (ASC) + `isPublished` (ASC) + `sortOrder` (ASC): Consulta principal de la tienda por sección para el cliente.
   - `section` (ASC) + `sortOrder` (ASC): Consulta del panel de administración por sección.
   - `isPublished` (ASC) + `sortOrder` (ASC): Catálogo general de ofertas publicadas.
   - `section` (ASC) + `status` (ASC) + `sortOrder` (ASC): Filtrado administrativo por estado y sección.
   - `section` (ASC) + `updatedAt` (DESC): Auditoría y recencia de cambios por sección.
   - `status` (ASC) + `updatedAt` (DESC): Auditoría y recencia por estado de paquete.
2. `admin_users` y `users`: Se preservan los índices preexistentes para `status + registeredAt`, `email + registeredAt` y `role + registeredAt`.
3. Índices de `campaigns` y los que incluían `publishedToStorefront` fueron eliminados.
