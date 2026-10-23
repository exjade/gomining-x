# MinerX --- Especificación de implementación: calculadora avanzada de rentabilidad y automatización de alquileres Vast.ai

**Tipo de documento:** Especificación funcional, técnica y de aceptación
para agente de código\
**Proyecto:** MinerX\
**Fecha:** 22 de octubre de 2026\
**Estado:** Diseño propuesto; requiere inspección del repositorio antes
de implementar\
**Objetivo principal:** Integrar una calculadora interactiva de
rentabilidad basada en benchmarks verificables y mediciones reales, más
un motor de estrategias automáticas para buscar, alquilar/reservar y
vigilar GPUs de Vast.ai con límites de precio, presupuesto y producción
mínima.

------------------------------------------------------------------------

## 1. Instrucción principal al agente de código

Antes de modificar el proyecto, inspecciona el repositorio real y lee
por completo:

-   `CONTEXT.md`
-   `CHANGELOG.md`, si existe
-   `Ciclos_de_minado_PERL.xlsx`
-   Los tipos y servicios actuales de MinerX
-   `src/components/EconomicsTab.tsx`
-   `src/data/gpuBenchmarks.ts`
-   `src/types/minerx.ts`
-   `src/App.tsx`
-   `server/server.ts`
-   `functions/index.js`
-   `src/components/ApiManagerTab.tsx`
-   `src/components/FleetTab.tsx`
-   La implementación actual de Kryptex, SaladCloud y alertas.

No asumas que las rutas propuestas en este documento ya existen. Adapta
la implementación al código real y documenta cualquier diferencia. No
elimines funcionalidades existentes ni sustituyas datos históricos por
estimaciones.

Implementa por fases. Al principio presenta diagnóstico y plan. Después
ejecuta cada fase, prueba los cambios y actualiza `CONTEXT.md` y
`CHANGELOG.md`. No declares una fase completada sin evidencia de
pruebas.

## 2. Visión del producto

MinerX debe evolucionar de un panel de monitoreo y simulación a un
centro de control para rentabilidad y ciclo de vida de GPUs en la nube.

La implementación tendrá dos grandes módulos:

1.  **Calculadora avanzada de rentabilidad:** permite seleccionar una
    GPU, algoritmo/moneda, proveedor, precio de alquiler, rendimiento de
    referencia, producción medida, precio de PRL, dificultad/ingresos
    observados, tiempo improductivo, fees y ventana de evaluación. Debe
    distinguir claramente simulación, benchmark publicado y datos
    reales.
2.  **Automatización de ofertas y alquileres de Vast.ai:** busca ofertas
    que cumplan las reglas definidas por el usuario, alquila o reserva
    únicamente mediante operaciones verificadas de la API y dentro de
    límites autorizados, instala/inicia el proceso de minería, verifica
    el hashrate real y alerta/desactiva la minería si la instancia no
    alcanza el mínimo configurado.

SaladCloud seguirá funcionando. Kryptex continuará siendo la fuente de
estadísticas del pool y shares. El motor financiero y las alertas deben
ser compartidos, no duplicados por proveedor.

## 3. Fuentes de datos y evidencia

### 3.1 Fuentes externas que deben verificarse

-   Vast.ai REST API: https://vast.ai/developers/api
-   Vast.ai API Reference:
    https://docs.vast.ai/api-reference/introduction
-   Vast.ai Quickstart:
    https://docs.vast.ai/guides/get-started/quickstart
-   Vast.ai pricing: https://docs.vast.ai/guides/instances/pricing
-   Vast.ai find/rent:
    https://docs.vast.ai/guides/instances/choosing/find-and-rent
-   Kryptex mining calculator:
    https://www.kryptex.com/es/mining-calculator
-   Kryptex RTX 4090 benchmark:
    https://www.kryptex.com/en/hardware/nvidia-rtx-4090
-   Kryptex pool statistics for the configured wallet:
    https://pool.kryptex.com/prl/miner/stats/prl1p7xu3mv7j6fz0ksk6y3j2vdn34p3a2ckza5vdg2n2dj6m230s9asqf4v5zh

Verifica métodos HTTP, rutas, query parameters, esquemas de
request/response, códigos de estado y comportamiento de alquiler/reserva
directamente contra la documentación vigente. No inventes endpoints ni
supongas que una reserva tiene la misma semántica que crear una
instancia. Si una función no está disponible en API, documenta la
limitación y presenta un flujo alternativo seguro.

### 3.2 Benchmark inicial de referencia

La página de Kryptex consultada el 22 de octubre de 2026 muestra una
referencia de **293 TH/s para NVIDIA RTX 4090 en PearlHash/PRL**. La
página señala que el hashrate y el consumo dependen de la tarjeta y de
su configuración.

El enlace de la calculadora enviado por el usuario incluye `prl_hr=310`,
`prl_p=400` y `cost=0.44`. Estos valores son parámetros de una
simulación enlazada, no mediciones garantizadas ni una cotización actual
de Vast.ai.

Reglas: - Registrar benchmark, fuente, URL, fecha de consulta,
algoritmo, unidad y tipo de evidencia. - No fijar 293 ni 310 TH/s como
verdad universal. - Permitir benchmark por modelo, algoritmo,
software/minero, versión y configuración. - Los datos actuales de
Kryptex pueden usarse como benchmark externo, pero no como garantía de
producción de una instancia específica. - No extraer datos mediante
scraping frágil si existe una API o fuente estructurada autorizada. Si
no hay API pública estable, registrar el valor de referencia con su
fuente y permitir actualizarlo manualmente. - No automatizar
compras/alquileres basándose únicamente en un benchmark externo.

### 3.3 Datos del Excel que deben conservarse

El archivo `Ciclos_de_minado_PERL.xlsx` contiene hojas como `GPUs`,
`Ciclos`, `SESIONES_COMPARATIVAS`, `EVENTOS_MINERIA`,
`CONVERSIONES_KRYPTEX`, `RETIROS_Y_COMISIONES_REALES`,
`COSTO_REAL_SALAD`, `COMPARADOR_AB` y `AUDITORIA_Y_DASHBOARD`.

La hoja `GPUs` ya contiene columnas como modelo, VRAM, costo por
hora/día, prioridad, TH/s, pool y revenue estimado.
`SESIONES_COMPARATIVAS` contiene horas efectivas, GPUs, hashrate
promedio, TH·h y costos. `EVENTOS_MINERIA` registra hashrate, shares
aceptados/rechazados y recompensas. `COMPARADOR_AB` compara rutas
financieras.

Estas hojas deben tratarse como registros históricos del usuario, no
como ground truth universal. Antes de importar valores, inspeccionar
fórmulas, celdas vacías, fechas, unidades, referencias y posibles
inconsistencias. No sobrescribir ni corregir silenciosamente el Excel.
Si se necesita importación, construir un proceso de lectura/versionado
con validación y reporte de errores.

## 4. Modelo de confianza de datos

Cada dato relevante debe incluir `sourceType` y metadatos de evidencia:

-   `EXTERNAL_BENCHMARK`: benchmark publicado por fuente externa.
-   `OFFER_ESTIMATE`: precio/capacidad anunciados por proveedor.
-   `INSTANCE_MEASURED`: rendimiento observado en una instancia.
-   `POOL_OBSERVED`: datos que reporta Kryptex para un worker o wallet.
-   `FINANCIAL_REALIZED`: recompensa o conversión efectivamente
    liquidada y registrada.
-   `USER_ASSUMPTION`: valor introducido manualmente por el usuario.
-   `SIMULATED`: resultado calculado de una hipótesis.

La UI no debe mezclar ni etiquetar todas estas categorías simplemente
como "real". Mostrar fuente, fecha, periodo y nivel de confianza en la
ficha del resultado.

## 5. Calculadora interactiva de rentabilidad

### 5.1 Controles

Implementar una interfaz moderna, coherente con el estilo
Cyber-Industrial de MinerX, con controles interactivos para:

-   Proveedor: Vast.ai, SaladCloud y simulación genérica.
-   Modelo de GPU y cantidad de GPUs.
-   Algoritmo/moneda: inicialmente PearlHash/PRL; arquitectura
    extensible a otros algoritmos compatibles.
-   Hashrate de referencia en TH/s.
-   Hashrate medido en TH/s, si existe.
-   Precio de alquiler por hora.
-   Cargos adicionales por almacenamiento, disco, volumen, transferencia
    u otros cargos del proveedor, solo cuando apliquen.
-   Horas facturadas por día y disponibilidad/uptime esperado.
-   Precio actual de PRL, editable y con fecha/fuente.
-   Recompensa observada por worker y ventana de observación.
-   Fees de pool/minero, shares rechazados, tiempo de arranque y
    downtime.
-   Porcentaje de seguridad/margen requerido.
-   Escenarios conservador, base y optimista.
-   Periodo de simulación: hora, día, 7 días y 30 días.
-   Número de instancias y presupuesto máximo.

Si no se dispone de una fuente verificable para precio, dificultad,
reward rate o fees, pedir un valor manual y marcarlo como supuesto. No
inventar datos.

### 5.2 Resultados visibles

Mostrar, como mínimo:

-   Hashrate de referencia y hashrate medido.
-   Ratio de rendimiento: `measuredHashrate / referenceHashrate * 100`.
-   Hashrate efectivo ajustado por uptime y shares rechazados, sin
    aplicar dos veces una misma pérdida.
-   Ingreso bruto estimado por hora/día/mes.
-   Costo total estimado por hora/día/mes.
-   Costos de cómputo separados de almacenamiento y otros cargos.
-   Beneficio neto estimado y margen neto porcentual.
-   Break-even del precio de alquiler por hora.
-   Break-even de hashrate requerido.
-   Ingreso mínimo requerido para cubrir los costos.
-   Pérdida potencial durante el periodo de arranque/prueba.
-   Escenario de estrés y sensibilidad al precio de PRL,
    dificultad/reward rate, hashrate y uptime.
-   Diferencia entre estimación externa y rendimiento observado.
-   Fuente y timestamp de cada input crítico.

### 5.3 Fórmulas

Definir un único servicio de dominio probado con tests. Evitar fórmulas
duplicadas en React.

Variables: - `H_ref`: hashrate de referencia, TH/s. - `H_measured`:
hashrate medido, TH/s. - `U`: uptime como fracción entre 0 y 1. - `R`:
ingreso estimado en USD por TH·h, obtenido de datos de
pool/red/observación y no de una constante arbitraria. - `C_compute`:
costo de cómputo por hora. - `C_storage`: costo equivalente de
almacenamiento por hora. - `C_other`: otros costos por hora. - `F`:
fricción/fees como fracción, si no están ya descontados en el ingreso.

Si el ingreso `R` es realmente por TH·h y no incluye fees:
`grossHourly = H_effective * R`
`netMiningRevenueHourly = grossHourly * (1 - F)`
`totalHourlyCost = C_compute + C_storage + C_other`
`netHourlyProfit = netMiningRevenueHourly - totalHourlyCost`
`netDailyProfit = netHourlyProfit * billableHoursPerDay`
`breakEvenHourlyRent = netMiningRevenueHourly - C_storage - C_other`
`breakEvenHashrate = totalHourlyCost / (R * (1 - F))`

`H_effective` puede calcularse como
`H_measured * U * (1 - rejectedShareRatio)` solo si las métricas son
compatibles y rejectedShareRatio representa una pérdida independiente.
Si el pool ya reporta hashrate efectivo/accepted-share hashrate, no
volver a descontar rechazos. Documentar explícitamente qué mide cada
métrica.

No usar una fórmula de ingreso por TH·h inventada. Derivarla de una
fuente identificada o de producción histórica por worker:
`observedRevenueRate = revenueUSD / sum(measuredHashrateTHs * elapsedHours)`
si el denominador y la recompensa corresponden al mismo periodo y
worker. Si solo hay datos de wallet agregados, no atribuir la tasa a una
GPU individual sin un método de asignación fiable.

Si el ingreso se calcula desde PRL:
`grossRevenueUSD = expectedPRL * PRLPriceUSD` `expectedPRL` debe venir
de una estimación verificable de recompensa/hasrate/periodo o de un
historial atribuible; no asumir que una wallet total corresponde a una
sola GPU.

Para escenarios, no presentar la extrapolación de 30 días como una
garantía. Mostrar los supuestos y la incertidumbre.

### 5.4 Visualizaciones

Incluir: - Curva de beneficio neto según costo de alquiler. - Curva de
beneficio según TH/s medidos. - Comparación benchmark vs. rendimiento
medido. - Comparación de escenarios conservador/base/optimista. -
Historial de ingresos, costos y hashrate por intervalo. - Tabla de
ofertas de Vast.ai con costo estimado, benchmark aplicable y estado de
evidencia.

Las gráficas deben reaccionar a los controles. Evitar datos ficticios en
modo real; cuando no existan datos, mostrar un estado vacío explicativo.
Los datos simulados deben llevar una etiqueta visible `SIMULACIÓN`.

## 6. Medición real del rendimiento por instancia

La medición en una instancia concreta es la base del sistema de
credibilidad.

### 6.1 Identidad y correlación

Cada instancia debe tener un identificador interno y conservar: -
`provider` - `providerOfferId` - `providerInstanceId` - `gpuModel` -
`gpuCount` - `minerSessionId` - `pool` - `walletReference` (sin
registrar secretos innecesarios) - `workerName` único - timestamps de
creación, inicio, inicio del minero, primer share y finalización.

El nombre de worker debe permitir asociar inequívocamente la instancia a
los datos de Kryptex. No atribuir estadísticas globales de wallet a un
worker concreto.

### 6.2 Fases de prueba

Estados sugeridos: 1. `DISCOVERED` 2. `OFFER_SELECTED` 3. `PROVISIONING`
4. `STARTING` 5. `WARMUP` 6. `MEASURING` 7. `QUALIFIED` 8.
`UNDERPERFORMING` 9. `ALERTED` 10. `MINER_STOPPING` 11.
`INSTANCE_STOPPING` 12. `TERMINATING` 13. `TERMINATED` 14. `ERROR` 15.
`MANUAL_REVIEW`

Valores iniciales configurables para la estrategia: - Tiempo de
arranque: máximo configurable; no contar el periodo previo a que el
minero esté listo como hashrate cero. - Calentamiento: 5 minutos como
valor inicial sugerido. - Ventana de medición: 15 minutos como valor
inicial sugerido. - Confirmación de incumplimiento: 3 mediciones
consecutivas por debajo del umbral o una ventana móvil que confirme la
insuficiencia. - Umbral inicial de rendimiento: 80% del mínimo/benchmark
configurado, pero permitir definir un mínimo absoluto de TH/s. Estos
valores deben ser configurables y probarse con la telemetría real. -
Shares: requerir al menos un número mínimo configurable de shares
aceptados o evidencia de hashrate confiable antes de declarar la GPU
apta. Si el pool tiene retraso, distinguir `NO_DATA` de
`UNDERPERFORMING`.

Los valores anteriores son defaults de producto propuestos, no hechos
demostrados sobre la duración ideal de PearlHash. Registrar la evidencia
y permitir su ajuste.

### 6.3 Umbral absoluto y relativo

El usuario debe poder configurar: - `minimumHashrateTHs`: mínimo
absoluto de TH/s. - `minimumPerformancePct`: porcentaje mínimo del
benchmark. - `maxWarmupMinutes` - `measurementWindowMinutes` -
`consecutiveFailWindows` - `minAcceptedShares` - `maxRejectedSharePct` -
`maxHourlyCostUSD` - `maxTotalSpendUSD` - `maxDailySpendUSD`

La instancia pasa la cualificación solo si satisface las reglas
obligatorias habilitadas. Si no hay datos suficientes, no asumir éxito
ni fracaso automáticamente: activar estado `NO_DATA`/`MANUAL_REVIEW`,
alertar y seguir la política de tiempo máximo de diagnóstico.

## 7. Automatización de ofertas y alquileres de Vast.ai

### 7.1 Estrategia que configura el usuario

Crear un módulo de estrategias que permita definir y guardar: - Nombre
de estrategia. - Estado: desactivada, simulación, aprobación manual o
automática. - Modelo de GPU, cantidad y VRAM mínima. - Precio máximo de
cómputo por hora. - Costo máximo total estimado por hora. - Presupuesto
máximo por instancia, día y estrategia. - Número máximo de instancias
concurrentes. - Hasrate mínimo absoluto. - Porcentaje mínimo del
benchmark. - Periodo de prueba y límites de shares. - Requisitos mínimos
del host/oferta: disponibilidad, capacidad, región si se requiere,
rendimiento de red, RAM, CPU, almacenamiento y otros filtros
documentados. - Duración máxima y condiciones de parada. - Política si
la instancia no alcanza el umbral. - Política si no hay datos del
pool. - Ventana de horario y cooldown para evitar ciclos de
crear/destruir repetidamente. - Requiere aprobación antes de gastar:
sí/no. - Confirmación explícita de que el usuario entiende los costos.

### 7.2 Modos de operación

1.  `SIMULATION`: consulta y puntúa ofertas, pero nunca crea instancias.
2.  `MANUAL_APPROVAL`: encuentra una oferta y presenta costo/estimación;
    el usuario aprueba antes del alquiler.
3.  `AUTOMATIC`: puede alquilar solo si la estrategia está
    explícitamente activada, las credenciales están configuradas, el
    presupuesto disponible es suficiente, la oferta sigue disponible y
    todos los límites pasan.

El modo por defecto debe ser `SIMULATION`. No activar el modo automático
por defecto después de actualizar o reiniciar la aplicación.

### 7.3 Buscar, seleccionar y alquilar

Flujo: 1. Obtener ofertas actuales usando la API oficial. 2. Normalizar
el costo y atributos de cada oferta. 3. Aplicar límites obligatorios. 4.
Calcular la puntuación de la oferta según costo total, rendimiento
histórico comparable y fiabilidad, si hay datos suficientes. 5.
Verificar la rentabilidad con escenario conservador. 6. Volver a
comprobar que la oferta continúa disponible antes de ejecutar el
alquiler. 7. Confirmar que el presupuesto autorizado cubre el gasto
esperado y un margen de seguridad. 8. Crear la instancia mediante el
endpoint y payload confirmados en la documentación actual. 9. Guardar el
ID de operación y provider instance ID. 10. Esperar el estado
utilizable, instalar/iniciar el minero usando un mecanismo de despliegue
autorizado y versionado. 11. Monitorizar el arranque y ejecutar la
ventana de prueba. 12. Mantener la instancia solo si pasa las reglas de
cualificación.

No llamar "reserva" a una instancia activa o a una operación de alquiler
si Vast.ai no la identifica de esa forma. Implementar la modalidad
reservada solo si la API y la cuenta del usuario la soportan de manera
documentada. Registrar el tipo de alquiler y sus condiciones de
cancelación.

### 7.4 Reglas de seguridad financiera

-   No superar `maxHourlyCostUSD`, `maxTotalSpendUSD` ni
    `maxDailySpendUSD`.
-   Incluir costos de almacenamiento y cargos conocidos en el cálculo
    del presupuesto.
-   Si no se puede conocer el costo total con suficiente fiabilidad, no
    autoalquilar: exigir aprobación.
-   Implementar límites del número de instancias y prevención de
    duplicados.
-   Añadir idempotencia interna para evitar que reintentos creen varias
    instancias.
-   No auto-reintentar una oferta fallida indefinidamente.
-   Aplicar cooldown tras una terminación por bajo rendimiento.
-   Registrar el motivo de cada alquiler, detención, eliminación y
    alerta.
-   Mantener un botón de emergencia para desactivar todas las nuevas
    asignaciones automáticas.
-   La estrategia automática debe poder desactivarse sin impedir que el
    usuario administre manualmente instancias existentes.

## 8. Qué hacer cuando no alcanza el mínimo de TH/s

El requisito del usuario es que se envíe una alerta y se desactive la
función de minería/alquiler según la política configurada si la GPU no
cumple la producción mínima.

Implementar una política con acciones separadas:

-   `ALERT_ONLY`: notificar y mantener el proceso.
-   `STOP_MINER`: detener el proceso de minería; conservar instancia
    para diagnóstico.
-   `STOP_INSTANCE`: detener la instancia; tener en cuenta que el
    almacenamiento puede seguir generando cargos.
-   `DESTROY_INSTANCE`: eliminar la instancia y terminar los cargos
    asociados a esa instancia, según las condiciones de Vast.ai.
-   `DISABLE_STRATEGY`: desactivar nuevos alquileres automáticos para
    esa estrategia.
-   `STOP_AND_DISABLE`: detener el minero, terminar o mantener la
    instancia según configuración, y desactivar nuevos alquileres
    automáticos.

La opción recomendada para producción es `STOP_AND_DISABLE` como
política configurada explícitamente, con: 1. alerta crítica inmediata;
2. detener el minero; 3. registrar la causa y las últimas métricas; 4.
detener/eliminar la instancia solo si el usuario ha autorizado esa
política; 5. desactivar nuevas asignaciones para esa estrategia hasta
revisión, o hasta que una política explícita permita recuperación; 6.
verificar el estado final en Vast.ai; 7. comprobar el costo de
almacenamiento residual; 8. enviar alerta de resolución o de fallo.

No basta con cambiar un estado en la base de datos. Confirmar la
respuesta del proveedor y después volver a consultar el estado de la
instancia.

La política de incumplimiento no debe borrar datos de telemetría ni
registros financieros. Conservar evidencia para evaluar la oferta/host.

## 9. Alertas

Reutilizar los mecanismos existentes de Telegram y Discord.

Tipos de alerta: - estrategia habilitada/deshabilitada; - oferta
candidata encontrada; - alquiler solicitado y confirmado; - instancia
lista; - minero iniciado; - worker detectado; - periodo de calentamiento
agotado; - falta de datos de Kryptex; - TH/s por debajo del mínimo; -
shares rechazados por encima del límite; - costo real por hora por
encima del máximo; - beneficio neto negativo durante la ventana
configurada; - presupuesto diario próximo a agotarse; - instancia
detenida/eliminada; - estrategia bloqueada por bajo rendimiento; - error
de API, autenticación o rate limit; - discrepancia entre costo anunciado
y costo real.

Las alertas deben incluir provider, instance ID, worker, hashrate
observado, mínimo requerido, costo actual estimado, tiempo de
observación, acción ejecutada y resultado. No incluir API keys ni datos
secretos.

Evitar spam mediante deduplicación, cooldown y alertas de recuperación.

## 10. Arquitectura de backend

Mantener la arquitectura existente y adaptar nombres a la estructura
real del repositorio. Separar:

-   `VastClient`: autenticación y HTTP.
-   `VastAdapter`: traducción del modelo de proveedor.
-   `VastOffersService`: búsqueda y filtrado.
-   `VastInstanceService`: creación y ciclo de vida.
-   `MiningTelemetryService`: datos por worker/instancia.
-   `ProfitabilityService`: cálculos puros y versionados.
-   `StrategyEngine`: evalúa reglas y toma decisiones autorizadas.
-   `RentalOrchestrator`: gestiona el ciclo de vida y la idempotencia.
-   `AlertService`: Telegram/Discord.
-   `AuditLogService`: auditoría de acciones y costos.

No hacer llamadas de Vast.ai desde React. El cliente solo llama a
endpoints internos del backend. Las rutas propuestas deben ajustarse a
los patrones existentes y validar esquemas de entrada.

Rutas internas sugeridas: - `POST /api/vast/test-account` -
`GET /api/vast/offers` - `GET /api/vast/instances` -
`POST /api/vast/instances` - `POST /api/vast/instances/:id/stop` -
`DELETE /api/vast/instances/:id` - `GET /api/vast/billing` (solo si la
API documentada provee los datos necesarios) -
`GET /api/profitability/estimate` - `POST /api/profitability/simulate` -
`GET /api/strategies` - `POST /api/strategies` -
`PATCH /api/strategies/:id` - `POST /api/strategies/:id/enable` -
`POST /api/strategies/:id/disable` - `GET /api/strategies/:id/runs` -
`GET /api/instances/:id/telemetry`

Estas rutas son contratos internos propuestos; no son endpoints
oficiales de Vast.ai. Confirmar el esquema real de cada endpoint oficial
antes de implementarlo.

## 11. Modelo de datos propuesto

### GpuBenchmark

-   `id`
-   `gpuModel`
-   `algorithm`
-   `hashrateValue`
-   `hashrateUnit`
-   `powerWatts` (opcional y solo con fuente)
-   `sourceName`
-   `sourceUrl`
-   `observedAt`
-   `softwareVersion` (opcional)
-   `configurationNotes`
-   `confidence`
-   `active`

### RentalStrategy

-   `id`
-   `name`
-   `provider`
-   `mode`
-   `enabled`
-   `gpuModel`
-   `gpuCount`
-   `maxHourlyCostUSD`
-   `maxTotalSpendUSD`
-   `maxDailySpendUSD`
-   `minimumHashrateTHs`
-   `minimumPerformancePct`
-   `measurementWindowMinutes`
-   `warmupMinutes`
-   `consecutiveFailWindows`
-   `minAcceptedShares`
-   `maxRejectedSharePct`
-   `maxConcurrentInstances`
-   `failureAction`
-   `noDataAction`
-   `cooldownMinutes`
-   `requireManualApproval`
-   `createdAt`
-   `updatedAt`

### GpuInstance

-   `id`
-   `provider`
-   `providerOfferId`
-   `providerInstanceId`
-   `strategyId`
-   `gpuModel`
-   `gpuCount`
-   `gpuMemoryGB`
-   `hourlyComputeCostUSD`
-   `hourlyStorageCostUSD`
-   `estimatedHourlyCostUSD`
-   `actualCostUSD` (si se puede verificar)
-   `status`
-   `workerName`
-   `minerSessionId`
-   `createdAt`
-   `startedAt`
-   `minerStartedAt`
-   `firstAcceptedShareAt`
-   `qualifiedAt`
-   `stoppedAt`
-   `terminatedAt`
-   `terminationReason`

### MiningMeasurement

-   `id`
-   `instanceId`
-   `workerName`
-   `periodStart`
-   `periodEnd`
-   `hashrateTHs`
-   `acceptedShares`
-   `rejectedShares`
-   `rejectedSharePct`
-   `estimatedPRL`
-   `realizedPRL` (solo cuando la fuente lo soporte)
-   `revenueUSD`
-   `sourceType`
-   `sourceTimestamp`
-   `confidence`

### ProfitabilitySnapshot

-   `id`
-   `instanceId` (opcional para simulación)
-   `strategyId` (opcional)
-   `calculatedAt`
-   `sourceType`
-   `hashrateTHs`
-   `grossRevenueHourlyUSD`
-   `computeCostHourlyUSD`
-   `storageCostHourlyUSD`
-   `otherCostHourlyUSD`
-   `netProfitHourlyUSD`
-   `netProfitDailyUSD`
-   `breakEvenRentHourlyUSD`
-   `breakEvenHashrateTHs`
-   `assumptions`
-   `formulaVersion`

### RentalRun / AuditEvent

Registrar estrategia, oferta, acción, actor, timestamp, inputs,
resultado, error sanitizado, costos estimados, IDs del proveedor y
decisiones de cualificación. No almacenar secretos.

Los tipos finales deben adaptarse al modelo actual de MinerX y
actualizarse simétricamente en cliente y backend cuando corresponda.

## 12. Seguridad

-   API key de Vast.ai solo en backend, en variables de entorno/secret
    manager según el despliegue.
-   Nunca en React, `localStorage`, logs, APK, Electron bundle ni
    respuestas de configuración.
-   Validar inputs, IDs y límites del lado del servidor.
-   Autorización obligatoria para crear, detener y eliminar instancias.
-   En modo automático, exigir configuración explícita, presupuesto
    válido y estado habilitado.
-   Proteger contra doble envío, carreras y reintentos que dupliquen
    gasto.
-   Timeouts y reintentos controlados para errores transitorios.
-   No reintentar indefinidamente operaciones destructivas o de creación
    cuyo resultado sea incierto.
-   Si el proveedor devuelve un timeout tras una creación, consultar
    instancias antes de volver a crear.
-   Sanitizar logs y errores.
-   Guardar auditoría de operaciones financieras.
-   Mantener un interruptor de emergencia para bloquear nuevos
    alquileres.
-   Tratar datos de ofertas y respuestas externas como entradas no
    confiables.

## 13. Pruebas requeridas

### Unitarias

-   Conversión de unidades de hashrate.
-   Ingreso por TH·h.
-   Beneficio neto y break-even.
-   Costo de almacenamiento incluido una sola vez.
-   Uptime y shares rechazados sin doble penalización.
-   Escenarios conservador/base/optimista.
-   Cálculo con datos faltantes.
-   Diferencia entre datos agregados de wallet y worker individual.
-   Cualificación por umbral absoluto y relativo.
-   Ventanas consecutivas de incumplimiento.
-   Presupuesto por hora, instancia y día.
-   Cooldown y prevención de bucles.

### Integración con API simulada

-   API key inválida.
-   Oferta desaparecida antes del alquiler.
-   Creación confirmada.
-   Timeout ambiguo durante creación.
-   Instancia en estado no listo.
-   Falta de datos de Kryptex.
-   Worker sin shares.
-   Hasrate bajo.
-   Instancia no se detiene.
-   Error al eliminar.
-   Storage cost residual.
-   Límite de solicitudes/rate limit.
-   Telegram/Discord fallido.
-   Recuperación del servicio.

### Regresión

-   SaladCloud sigue autenticando y listando recursos.
-   Reasignación SaladCloud no se rompe.
-   Kryptex workers/balance/payouts/charts siguen funcionando.
-   Configuración existente se conserva.
-   Alertas previas siguen operativas.
-   `npm run build` pasa.
-   Tests/linter existentes pasan.
-   Ninguna prueba crea alquileres reales.

### Prueba manual controlada

Solo después de aprobar pruebas simuladas: 1. fijar presupuesto máximo
explícito; 2. escoger una oferta real; 3. revisar costo total y
condiciones; 4. crear una única instancia manual; 5. comprobar arranque
y asociación del worker; 6. medir una ventana controlada; 7. probar
alerta por bajo hashrate en modo de simulación o con umbral de prueba
seguro; 8. confirmar que la parada/eliminación realmente ocurre; 9.
comprobar el costo final en la cuenta; 10. documentar la evidencia y
cerrar la instancia si ya no se necesita.

No realizar pruebas con gasto real sin aprobación explícita del usuario.

## 14. UX y pantallas

### EconomicsTab

-   Calculadora interactiva.
-   Fuente de benchmark y fecha.
-   Hashrate benchmark frente a medido.
-   Costo total por hora.
-   Beneficio neto y break-even.
-   Escenarios y sensibilidad.
-   Etiquetas claras `SIMULACIÓN`, `BENCHMARK`, `MEDIDO`, `REALIZADO`.

### Marketplace / Vast.ai

-   Lista de ofertas y filtros.
-   Precio de cómputo y costos adicionales conocidos.
-   Score de elegibilidad.
-   Acción "Simular", "Solicitar aprobación" o "Alquilar", según modo.
-   Nunca presentar un botón de alquiler en modo simulación.

### Rental Strategies

-   Crear/editar estrategia.
-   Precio máximo.
-   Producción mínima TH/s.
-   Porcentaje mínimo del benchmark.
-   Ventana de prueba.
-   Presupuesto diario y total.
-   Acción de fallo.
-   Modo simulación/manual/automático.
-   Historial de ejecuciones y auditoría.

### FleetTab

-   Proveedor, GPU, instance ID, worker, estado, hashrate, mínimo
    requerido, costo/h, ingreso/h, neto/h, tiempo de observación,
    calidad de datos y recomendación.
-   Acciones explícitas para detener minero, detener instancia, eliminar
    instancia y desactivar estrategia.

### ApiManagerTab

-   Configuración y estado de conexión de Vast.ai.
-   Mostrar solamente estado/últimos cuatro caracteres de una credencial
    si es necesario; nunca devolver el secreto completo al frontend.
-   Test de conexión sin crear recursos.

## 15. Criterios de aceptación

La implementación se considera completa cuando:

1.  La calculadora es reactiva y todas las fórmulas están en un servicio
    probado.
2.  Cada cifra muestra si es benchmark, estimación, medición de
    instancia o ingreso liquidado.
3.  El benchmark RTX 4090/PRL tiene fuente y timestamp y es
    editable/actualizable.
4.  El usuario puede configurar precio máximo y TH/s mínimos.
5.  Las estrategias arrancan en modo simulación por defecto.
6.  La búsqueda de ofertas no genera gastos.
7.  El alquiler automático solo funciona tras habilitación explícita y
    controles presupuestarios.
8.  La instancia se vincula a un worker único y sus mediciones.
9.  Si no alcanza el mínimo tras la ventana definida, se envía alerta y
    se ejecuta la política configurada.
10. El sistema distingue detener minero, detener instancia, eliminar
    instancia y desactivar estrategia.
11. La acción del proveedor se verifica con una lectura posterior de
    estado.
12. Los costos de almacenamiento y demás cargos conocidos se reflejan en
    la rentabilidad.
13. No se atribuyen estadísticas globales de wallet a una GPU
    individual.
14. No se exponen secretos al cliente.
15. SaladCloud, Kryptex, Telegram y Discord existentes no sufren
    regresiones.
16. El build y los tests pasan.
17. `CONTEXT.md` y `CHANGELOG.md` reflejan arquitectura, configuración,
    límites y pruebas reales.
18. El agente entrega un informe final con archivos modificados,
    decisiones, pruebas ejecutadas, resultados, limitaciones y pasos
    manuales pendientes.

## 16. Plan de implementación

### Fase 0 --- Auditoría del repositorio

Leer archivos, inspeccionar las fórmulas y el Excel, identificar APIs y
pruebas actuales. Entregar diagnóstico y plan sin cambiar código.

### Fase 1 --- Motor de rentabilidad

Crear tipos, normalización de unidades, servicio de cálculo y pruebas
unitarias. Incorporar benchmarks versionados y trazabilidad.

### Fase 2 --- UI interactiva

Ampliar `EconomicsTab` y, si hace falta, crear subcomponentes. Integrar
escenarios, gráficas y fuentes de datos. No usar datos ficticios en modo
real.

### Fase 3 --- Adaptador Vast.ai y marketplace

Autenticación en backend, ofertas, normalización, filtros y
visualización. Sin alquiler automático todavía.

### Fase 4 --- Ciclo de vida y telemetría

Crear/listar/administrar instancias mediante operaciones verificadas,
asociar workers y almacenar mediciones.

### Fase 5 --- Motor de estrategias

Implementar modo simulación, aprobación manual, límites, idempotencia,
cooldown, auditoría y alquiler protegido.

### Fase 6 --- Supervisión de TH/s y acciones de fallo

Implementar ventanas de prueba, alertas, política de parada del
minero/instancia y desactivación de la estrategia. Verificar los estados
reales del proveedor.

### Fase 7 --- Pruebas, documentación y despliegue

Regresión completa, build, pruebas simuladas, guía de configuración y
actualización de `CONTEXT.md` y `CHANGELOG.md`.

No saltar fases si la anterior no pasa los criterios de aceptación.

## 17. Referencias

-   Vast.ai REST API: https://vast.ai/developers/api
-   Vast.ai API Reference:
    https://docs.vast.ai/api-reference/introduction
-   Vast.ai Quickstart:
    https://docs.vast.ai/guides/get-started/quickstart
-   Vast.ai pricing: https://docs.vast.ai/guides/instances/pricing
-   Vast.ai find/rent:
    https://docs.vast.ai/guides/instances/choosing/find-and-rent
-   Kryptex calculator: https://www.kryptex.com/es/mining-calculator
-   Kryptex RTX 4090 benchmark:
    https://www.kryptex.com/en/hardware/nvidia-rtx-4090
-   Kryptex pool wallet stats:
    https://pool.kryptex.com/prl/miner/stats/prl1p7xu3mv7j6fz0ksk6y3j2vdn34p3a2ckza5vdg2n2dj6m230s9asqf4v5zh

------------------------------------------------------------------------

**Nota final:** esta especificación define el comportamiento esperado,
pero no afirma que la integración ya esté implementada. El agente debe
verificar el contrato actual de la API, el código real y los resultados
de las pruebas antes de marcar cualquier tarea como completada.
