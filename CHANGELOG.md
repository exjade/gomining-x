# CHANGELOG — MinerX ⚡

Todas las modificaciones notables introducidas en MinerX se documentan en este archivo.

---

## [1.2.0] — 2026-10-22 — Integración Vast.ai, Calculadora Realista y Automatización

### 🚀 Nuevas Funcionalidades
1. **Motor de Dominio Financiero Realista (`src/services/profitabilityService.ts`):**
   - Normalización de hashrates multidimensionales (`TH/s`, `GH/s`, `MH/s`, `H/s`).
   - Cálculo preciso de ingresos brutos, costos de cómputo y costos de almacenamiento mensual convertidos a horario (`$/h`).
   - Modelado de penalizaciones reales: tiempo de warmup (calentamiento), porcentaje de shares rechazados y disponibilidad (*uptime*).
   - Generación de matrices de estrés (Conservador, Base, Optimista).
   - Metadatos de procedencia y trazabilidad de datos (`DataTrustSource`).

2. **Calculadora Interactiva de Rentabilidad (`src/components/ProfitabilityCalculator.tsx`):**
   - Panel de control de supuestos económicos con tarjetas KPI en tiempo real.
   - Curvas de sensibilidad bidimensionales con gráficos Recharts ($/h vs TH/s).
   - Selector de sub-vistas en `EconomicsTab` (Calculadora Realista, Ciclos Históricos, Flota Salad, Marketplace Vast, Estrategias de Alquiler).

3. **Cliente Oficial y Marketplace de Vast.ai (`server/services/vastClient.ts`, `vastOffersService.ts`, `src/components/VastMarketplace.tsx`):**
   - Integración oficial con endpoints de `https://console.vast.ai/api/v0`.
   - Consulta de balance de cuenta, catálogo de ofertas de GPUs, scoring de idoneidad (0-100) para PearlHash (PRL).
   - Botón directo "Simular en Calculadora" para evaluar ofertas de hardware antes de alquilar.
   - Sección de configuración de API Vast.ai en `ApiManagerTab` con claves enmascaradas y ping de diagnóstico.

4. **Gestión de Instancias y Telemetría de Pool (`server/services/vastInstanceService.ts`, `src/components/VastFleetSection.tsx`):**
   - Nombres de worker únicos e idempotentes (`vast-${gpu}-${seed}`) para correlación precisa con Kryptex Stratum sin mezclar estadísticas con otras GPUs.
   - Monitoreo en tiempo real de estado, hashrate observado en pool, eficiencia de silicio contra benchmark de referencia y ventanas de bajo rendimiento.
   - Acciones seguras e independientes con verificación post-acción:
     - `Detener Minero`: Detiene el proceso sin apagar la máquina.
     - `Detener Instancia`: Pausa el hardware físico.
     - `Destruir Instancia`: Elimina el alquiler y finaliza cobros con modal de confirmación.
   - Selector de proveedor en `FleetTab` (`SaladCloud Flota` vs `Vast.ai Flota & Instancias`).

5. **Motor de Estrategias Automatizadas & Supervisor de Rendimiento (`server/services/strategyEngine.ts`, `src/components/RentalStrategiesTab.tsx`):**
   - Modo seguro por defecto: `SIMULATION` (impide gastos sin aprobación explícita).
   - Modos adicionales `MANUAL_APPROVAL` y `AUTOMATIC` con límites estrictos de gasto diario, gasto total, precio máximo horario y cooldown.
   - Periodo de gracia para warmup (5 min por defecto) para prevenir falsos positivos.
   - Detección de bajo rendimiento con ventanas de fallo consecutivas y ejecución de políticas configurables (`ALERT_ONLY`, `STOP_MINER`, `STOP_INSTANCE`, `DESTROY_INSTANCE`, `DISABLE_STRATEGY`, `STOP_AND_DISABLE`).
   - Bitácora de auditoría inmutable de decisiones almacenada en `server/data/vast_audit_runs.json`.
   - Vinculación con el loop autónomo de segundo plano (`runAutonomousBackgroundWatcher`) cada 60 segundos con notificaciones a Telegram y Discord.

---

### 🛡️ Garantías de Preservación y Compatibilidad (Regla Inquebrantable)
- **SaladCloud:** 100% intacto y funcional (cuotas, réplicas, balance consolidado, streaming de logs en vivo).
- **Kryptex Pool:** 100% preservado (telemetría PRL, proxies de workers y pool stats).
- **Finanzas y Auditoría:** `DOC/Ciclos_de_minado_PERL.xlsx` no fue modificado; el historial previo de ciclos de minado se mantiene íntegro.
- **Alertas y Webhooks:** Sistema existente de Telegram y Discord reutilizado sin duplicación de agentes.

---

### 📁 Archivos Creados
- `src/types/profitability.ts`
- `src/types/vast.ts`
- `src/services/profitabilityService.ts`
- `src/components/ProfitabilityCalculator.tsx`
- `src/components/VastMarketplace.tsx`
- `src/components/RentalStrategiesTab.tsx`
- `src/components/VastFleetSection.tsx`
- `server/services/vastClient.ts`
- `server/services/vastOffersService.ts`
- `server/services/vastInstanceService.ts`
- `server/services/strategyEngine.ts`
- `test/unit/profitabilityService.test.ts`
- `test/unit/vastOffersService.test.ts`
- `test/unit/strategyEngine.test.ts`
- `CHANGELOG.md`

### 📝 Archivos Modificados (Mínimos y Localizados)
- `package.json` — Adición del script `"test"` para suite de pruebas unitarias.
- `src/types/minerx.ts` — Adición de la interfaz `VastAccountConfig` dentro de la configuración multicuenta.
- `src/data/mockFleetData.ts` — Inicialización segura de `INITIAL_VAST_CONFIG`.
- `src/components/EconomicsTab.tsx` — Selector de pestañas para acceder a la Calculadora, Marketplace y Estrategias sin romper ciclos históricos.
- `src/components/FleetTab.tsx` — Selector de proveedor de cómputo para alternar entre SaladCloud y Vast.ai sin colisiones.
- `src/components/ApiManagerTab.tsx` — Sección de credenciales de Vast.ai con enmascaramiento seguro y ping.
- `server/server.ts` — Exposición de endpoints REST `/api/vast/*` y `/api/strategies/*` y correlación de telemetría en el bucle supervisor.
- `DOC/CONTEXT.md` — Documentación ampliada con la arquitectura del subsistema Vast.ai.

---

### 🧪 Verificación y Pruebas Ejecutadas
- **Pruebas Unitarias de Rentabilidad:** 7 pruebas pasando (conversión de unidades, benchmarks, break-even, warmup, escenarios de estrés).
- **Pruebas Unitarias de Ofertas Vast.ai:** 5 pruebas pasando (enmascaramiento seguro de tokens, normalización de storage, filtrado, scoring).
- **Pruebas Unitarias de Motor de Estrategias:** 4 pruebas pasando (modo `SIMULATION` predeterminado, respeto al warmup, trigger de bajo rendimiento y cooldown).
- **Verificación de Tipos:** `npx tsc -b` completado exitosamente con 0 errores bajo tipado estricto.
- **Compilación de Producción:** `npm run build` completado exitosamente con 0 errores (Vite y assets listos).
- **Auditoría de Código:** `npx oxlint` completado con 0 errores en 37 archivos.
