# MINERX — MASTER PROMPT: INTERACTIVE 3D DIGITAL OPERATIONS CENTER

## OBJETIVO GENERAL

Implementar una experiencia 3D interactiva dentro del proyecto MinerX existente, inspirada en la metodología de construcción de dashboards 3D basada en datos: 1) preparar y validar los datos, 2) diseñar la maqueta y definir relaciones objeto → dato, 3) implementar, conectar y probar el panel.

El resultado debe ser un centro de operaciones digital de alta calidad visual, con dos experiencias diferentes: MinerX Client Experience y MinerX Admin Operations.

NO crear una aplicación independiente. NO reconstruir el dashboard actual. NO sustituir la identidad visual de MinerX. NO eliminar funcionalidades ni cambiar innecesariamente su estructura. El dashboard 3D debe incorporarse como una nueva capa de visualización dentro de la aplicación existente.

## 1. AUDITORÍA OBLIGATORIA

Antes de desarrollar:

- Leer CONTEXT(1).md y toda la documentación relevante.
- Auditar la estructura real del repositorio.
- Identificar los dashboards, componentes, servicios, modelos, rutas y estados existentes.
- Inspeccionar los servicios de SaladCloud y Kryptex.
- Inspeccionar el modelo MergedGPUWorker, FleetSummary y los datos de contratos.
- Identificar cómo se obtienen y calculan actualmente las métricas financieras.
- Localizar el MinerX Profit Engine o el módulo de cálculo unificado si ya está implementado.
- Identificar los mecanismos de actualización de datos.
- Verificar las versiones reales de React, Three.js y dependencias.
- Comprobar la compatibilidad con React 19 y Vite.
- Identificar funcionalidades y pruebas existentes que deben preservarse.

Entregar un inventario de dependencias y un mapa de integración antes de modificar archivos.

## 2. TECNOLOGÍAS

Utilizar, según compatibilidad comprobada:

- Three.js como motor de renderizado.
- @react-three/fiber para integrar escenas 3D en React.
- @react-three/drei para controles, cámara, modelos, etiquetas y utilidades.
- Framer Motion para animaciones de la interfaz 2D.
- Tailwind CSS para los paneles y componentes visuales.
- Recharts para las gráficas financieras convencionales.
- GLTF/GLB para modelos 3D optimizados.

No introducir librerías redundantes. No actualizar versiones principales ni modificar configuraciones globales sin demostrar que es necesario.

## 3. ARQUITECTURA VISUAL

Crear dos experiencias que reutilicen el mismo sistema de renderizado, componentes, materiales, controles y utilidades, pero tengan modelos de datos y escenas diferenciadas.

### A. MINERX CLIENT EXPERIENCE

Crear una instalación digital isométrica, futurista, premium y minimalista que represente el contrato y la potencia asignada al cliente.

Objetos:

- DigitalMiningRack: representación visual del contrato.
- PowerModules: módulos visuales que representan unidades de potencia asignada.
- ProductionCore: representación de la producción calculada por MinerX.
- ProductionFlow: representación visual de la evolución de producción.
- FinancialPanel: panel de rentabilidad.
- ContractStatusIndicator: estado del contrato.

Relaciones:

- DigitalMiningRack → contrato, estado y potencia contratada.
- PowerModules → TH/s asignados.
- ProductionCore → PRL producido y período.
- ProductionFlow → historial de producción.
- FinancialPanel → valor equivalente USD, costos, Profit y ROI.
- ContractStatusIndicator → estado operativo y fecha de actualización.

Al seleccionar un objeto debe abrirse una ficha 2D clara, contextual y cerrable.

No representar una GPU física dedicada cuando el contrato únicamente represente una asignación digital de potencia. El escenario es una visualización de la asignación contractual, no evidencia de hardware individual.

### B. MINERX ADMIN OPERATIONS

Crear una escena 3D que represente la infraestructura física de minería y sus componentes observados.

Objetos:

- DataCenterScene: entorno general.
- ServerRack: agrupación de instancias.
- PhysicalMiner: representación de una instancia física.
- WorkerIndicator: estado del worker.
- TelemetryConnection: conexión y estado de telemetría.
- ProfitEngineCore: visualización del motor central.
- AlertIndicator: representación de incidencias.

Relaciones:

- DataCenterScene → resumen de infraestructura.
- ServerRack → miners agrupados.
- PhysicalMiner → hashrate, benchmark y estado.
- WorkerIndicator → actividad y rendimiento observado.
- TelemetryConnection → última actualización y conectividad.
- ProfitEngineCore → tasa efectiva, configuración y producción calculada.
- AlertIndicator → incidencias verificadas.

No inventar ubicaciones físicas, conexiones ni relaciones entre equipos que no existan en los datos.

## 4. SISTEMA DE INTERACCIÓN

Implementar:

- Rotación de cámara con mouse y toque.
- Zoom con límites razonables.
- Desplazamiento de cámara.
- Selección de objetos mediante eventos de Three.js/R3F.
- Resaltado del objeto seleccionado.
- Animación de acercamiento al seleccionar.
- Apertura de ficha contextual.
- Cierre de ficha y retorno a la escena.
- Selección mediante lista accesible equivalente.
- Navegación por teclado cuando corresponda.
- Filtros por estado y categoría.
- Botón para restablecer la vista.
- Control para pausar animaciones.
- Compatibilidad con prefers-reduced-motion.

Cada objeto debe tener un identificador estable vinculado a su entidad real o contractual. No identificar objetos únicamente por su posición en la escena.

La selección 3D y la selección desde listas o tablas deben utilizar un mismo estado compartido de aplicación.

## 5. SEPARACIÓN ENTRE DATOS, CÁLCULOS Y ESCENA

Crear una capa de adaptación de datos que consuma los servicios existentes.

La escena no debe consultar directamente Firestore, Kryptex, SaladCloud ni servicios financieros.

La escena recibe únicamente modelos de visualización normalizados y autorizados.

El Profit Engine es la única fuente de cálculos financieros. No implementar fórmulas de rentabilidad dentro de componentes 3D.

Separar:

- Datos originales y sus procedencias.
- Cálculos realizados por MinerX.
- Modelos de visualización.
- Estado de interacción.
- Renderizado 3D.
- Paneles 2D.

Preservar los identificadores de contratos, miners y workers. Evitar duplicaciones o transformaciones que pierdan trazabilidad.

Cada dato relevante debe conservar su origen, período, unidad, fecha de actualización y estado de validación.

## 6. CONEXIÓN CON MINERX PROFIT ENGINE

Utilizar los resultados del motor central existente.

El dashboard debe mostrar:

- Potencia contratada.
- Producción acumulada PRL.
- Producción por período.
- Valor equivalente USD.
- Profit neto.
- ROI.
- Estado del contrato.
- Fecha de actualización.

El panel administrativo debe mostrar:

- Hashrate real observado.
- Hashrate de referencia.
- Rendimiento por worker.
- Recompensas atribuibles.
- Tasa efectiva.
- Variables porcentuales.
- Comisiones.
- Configuraciones.
- Estado del motor.
- Calidad y antigüedad de los datos.

No exponer al cliente las credenciales, claves ni detalles internos de Kryptex. No mostrar al cliente proveedores internos de infraestructura si no forman parte de la información comercial autorizada.

Diferenciar explícitamente producción real observada de producción digital calculada y asignada.

No usar números aleatorios, animaciones para fabricar cifras ni datos ficticios como valores reales.

Cuando no existan datos, utilizar estados vacíos. Si los datos están desactualizados, incompletos o fallan, mostrarlo de forma comprensible.

## 7. EXPERIENCIA DEL CLIENTE

El dashboard debe responder de manera sencilla:

- ¿Cuánta potencia tengo?
- ¿Cuánto he producido?
- ¿Cuánto vale lo producido?
- ¿Cuál es mi beneficio neto?
- ¿Cómo funciona mi contrato?

Priorizar:

1. Escenario 3D.
2. Potencia contratada.
3. Producción acumulada.
4. Valor equivalente USD.
5. Profit neto y ROI.
6. Evolución histórica.
7. Detalles del contrato.

Los datos financieros deben seguir siendo legibles incluso si el usuario no interactúa con el escenario 3D.

Evitar saturar la pantalla con indicadores técnicos. Los detalles avanzados deben estar disponibles bajo demanda.

## 8. EXPERIENCIA ADMINISTRATIVA

El administrador necesita una vista más técnica:

- Vista general de la infraestructura.
- Selección de racks y miners.
- Detalle de workers.
- Hashrate y benchmark.
- Rendimiento esperado frente al observado.
- Estado de telemetría.
- Alertas.
- Profit Engine.
- Configuraciones y auditoría.

Las acciones administrativas deben continuar utilizando los flujos y permisos existentes. El escenario 3D no debe ejecutar acciones destructivas directamente.

Toda acción sensible debe pasar por los servicios autorizados y conservar validaciones, permisos, confirmaciones y auditoría.

## 9. ANIMACIONES CON PROPÓSITO

Cada animación debe comunicar información:

- Iluminación verde: estado activo y saludable.
- Iluminación ámbar: estado degradado.
- Iluminación roja: error confirmado.
- Iluminación neutra: pausado o sin información suficiente.
- Flujo animado: actividad de datos confirmada.
- Movimiento de cámara: navegación.
- Resaltado: selección.

No utilizar animaciones para representar hashrate instantáneo, ubicación física, actividad de minería o producción si no existen datos que respalden esa representación.

Incluir transiciones suaves, efectos visuales moderados y límites de movimiento.

## 10. RESPONSIVE Y ACCESIBILIDAD

Desktop:
- Escena 3D amplia.
- Paneles laterales y flotantes.
- Navegación mediante mouse y teclado.

Tablet:
- Escena adaptable.
- Fichas compactas.
- Controles táctiles.

Móvil:
- Escena simplificada.
- Cámara y zoom adaptados al toque.
- Información financiera prioritaria.
- Fichas inferiores.
- Lista accesible alternativa.
- Modo 2D si el rendimiento no es suficiente.

La aplicación debe continuar siendo funcional si WebGL no está disponible o falla.

## 11. RENDIMIENTO

- Cargar escenas y modelos bajo demanda.
- Optimizar GLB y texturas.
- Reutilizar geometrías y materiales.
- Aplicar instancing cuando sea útil.
- Evitar renders innecesarios.
- Limitar luces, sombras y partículas.
- Controlar resolución y pixel ratio.
- Limpiar recursos y listeners al desmontar.
- Evitar bloquear el hilo principal.
- Medir FPS y consumo de memoria.
- Implementar fallback 2D.

No cargar toda la infraestructura 3D si el usuario no está consultando esa experiencia.

## 12. ESTRUCTURA PROPUESTA

Primero auditar y reutilizar la estructura existente. Si es compatible, incorporar módulos equivalentes a:

src/components/3d/
- MiningScene.tsx
- ClientMiningScene.tsx
- AdminInfrastructureScene.tsx
- DigitalMiningRack.tsx
- ServerRack.tsx
- PhysicalMiner.tsx
- ProductionCore.tsx
- ProductionFlow.tsx
- WorkerIndicator.tsx
- FloatingLabels.tsx
- SceneCamera.tsx
- SceneControls.tsx

src/components/dashboard3d/
- Dashboard3D.tsx
- ObjectDetailsPanel.tsx
- SceneToolbar.tsx
- SceneFallback.tsx
- DashboardMetrics.tsx
- ProductionChart.tsx
- AccessibleObjectList.tsx

src/services/
- miningVisualizationService.ts

src/hooks/
- useSceneSelection.ts
- useMiningVisualization.ts

src/types/
- visualization.ts

No crear archivos redundantes si ya existen equivalentes.

## 13. VALIDACIÓN OBLIGATORIA

Antes de declarar terminado:

1. Verificar que el proyecto original continúa funcionando.
2. Comprobar build y TypeScript strict.
3. Ejecutar lint y pruebas existentes.
4. Probar la selección y cierre de cada objeto.
5. Comparar las cifras de la escena con las del dashboard 2D.
6. Verificar los identificadores y relaciones objeto → dato.
7. Comprobar que no se presentan valores ficticios como reales.
8. Probar mouse, toque y teclado.
9. Probar escritorio, tablet y móvil.
10. Probar WebGL no disponible.
11. Comprobar estados sin datos y datos atrasados.
12. Medir rendimiento y corregir problemas.

## 14. DOCUMENTACIÓN

Crear o actualizar la documentación del proyecto con:

- Arquitectura del dashboard 3D.
- Mapa objeto → dato.
- Modelos de datos visuales.
- Interacciones.
- Animaciones.
- Dependencias.
- Conexión con el Profit Engine.
- Estados y procedencia de los datos.
- Rendimiento y fallback.
- Pruebas realizadas.
- Limitaciones conocidas.

## 15. REGLA FINAL

Implementa una experiencia 3D de calidad profesional, pero respeta absolutamente el producto MinerX existente.

El dashboard 3D debe enriquecer la interfaz actual, no reemplazarla por una aplicación distinta.

Primero prepara y valida los datos; después diseña la maqueta; finalmente implementa y prueba.

Cada objeto representa un dato. Cada interacción tiene una función. Cada animación tiene un significado. Cada cifra debe tener una fuente verificable.

No declares éxito por haber conseguido renderizar una escena: el trabajo estará completo cuando la escena sea interactiva, sus datos coincidan con MinerX, la interfaz siga siendo accesible y todas las funcionalidades originales continúen operativas.