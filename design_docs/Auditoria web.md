# Auditoría web — Plan maestro de saneamiento, conservación y evolución

> **Objetivo:** convertir los hallazgos de la auditoría web en un plan de trabajo por fases para ajustar el proyecto existente sin romper funcionalidades válidas, eliminar dependencias accidentales ni implementar prematuramente módulos que se desarrollarán más adelante.
>
> **Regla principal:** ninguna fase se considera terminada por el simple hecho de haber escrito código. Cada fase debe completar el ciclo **IMPLEMENTAR → VERIFICAR → AUDITAR → APROBAR**. Solo después de aprobar formalmente la fase actual se puede comenzar la siguiente.

---

## 1. Instrucciones generales para el agente de código

Actúa como ingeniero de software senior, arquitecto y auditor técnico del proyecto existente. Antes de modificar archivos, inspecciona la arquitectura, identifica el stack real, las rutas, los componentes, los servicios, los modelos de datos, las reglas de acceso y las dependencias entre módulos.

### 1.1 Reglas no negociables

1. **No reconstruir el proyecto desde cero.** Trabajar sobre la arquitectura y convenciones existentes.
2. **No modificar funcionalidades ajenas al alcance** de esta auditoría.
3. **No eliminar código por intuición.** Primero rastrear imports, rutas, referencias, dependencias, llamadas, permisos, modelos y usos compartidos.
4. Para los módulos marcados como desactivados, priorizar una desactivación controlada mediante configuración, feature flags, rutas protegidas o retirada del menú. No borrar su implementación salvo que la auditoría demuestre que es segura y se autorice expresamente.
5. Una sección oculta no debe seguir siendo accesible mediante URL directa, navegación interna, enlaces antiguos ni llamadas no autorizadas.
6. Conservar los componentes, servicios, datos y contratos que sean compartidos con módulos que deban permanecer activos.
7. **No inventar datos, métricas, rentabilidades, transacciones, estados de wallets ni resultados de minería.** Los datos demostrativos deben estar claramente identificados y nunca confundirse con datos reales.
8. No simular una conexión, depósito, voto, retiro, pago o seguimiento como si hubiera ocurrido realmente.
9. No exponer secretos, claves privadas, frases semilla, credenciales, tokens sensibles ni información interna de seguridad en el cliente, logs o respuestas de API.
10. Mantener compatibilidad con los datos existentes. No ejecutar migraciones destructivas ni borrar registros como parte de una simple desactivación.
11. Las nuevas funcionalidades deben dejar una **base arquitectónica preparada**, con contratos, modelos, interfaces, estados y puntos de integración. No desarrollar características avanzadas fuera del alcance definido.
12. No alterar el funcionamiento de módulos que ya estén probados y deban conservarse.
13. Cada cambio debe ser pequeño, trazable y reversible. Preferir cambios aislados y commits lógicos si el repositorio utiliza Git.
14. Si una dependencia o requisito no está claro, detener esa parte, documentar el bloqueo y solicitar una decisión; no asumir.
15. No avanzar a la siguiente fase si existen errores críticos, pruebas fallidas, regresiones o hallazgos de auditoría sin resolver.

### 1.2 Clasificación obligatoria de cada hallazgo

Antes de intervenir cada sección, clasificarla como:

- **DESACTIVAR:** retirar de la experiencia del usuario y bloquear su acceso, conservando el código y los datos cuando sea seguro.
- **ELIMINAR:** retirar código únicamente después de demostrar que no tiene consumidores ni dependencias compartidas y que su eliminación está dentro del alcance.
- **CONSERVAR:** mantener su comportamiento actual y comprobar que no sufre regresiones.
- **PREPARAR BASE:** crear estructura técnica mínima para una evolución posterior, sin fingir que la funcionalidad completa ya existe.
- **CORREGIR:** reparar una funcionalidad existente que presenta un bug.
- **EVOLUCIONAR:** mejorar una funcionalidad conservada conforme al alcance descrito.

Registrar para cada elemento: ruta, componente, archivos implicados, dependencias, decisión, cambios, pruebas y resultado de auditoría.

---

## 2. Protocolo obligatorio de cierre de fase

Todas las fases deben utilizar este ciclo:

### A. IMPLEMENTAR
- Ejecutar únicamente los cambios aprobados para la fase.
- Mantener el alcance limitado.
- Actualizar tipos, contratos, documentación y pruebas cuando corresponda.
- No dejar botones, enlaces o acciones que aparenten funcionar sin una implementación real.

### B. VERIFICAR
- Ejecutar lint, typecheck, build y pruebas disponibles.
- Probar rutas y flujos afectados.
- Comprobar permisos, estados vacíos, errores, carga y navegación.
- Verificar que las secciones conservadas siguen funcionando.
- Revisar consola del navegador, logs del servidor y respuestas de API cuando aplique.

### C. AUDITAR
- Revisar el diff completo.
- Buscar referencias rotas, imports huérfanos, rutas todavía accesibles, componentes duplicados y dependencias no previstas.
- Comprobar seguridad, autorización y exposición de datos.
- Comparar el resultado con los criterios de aceptación de la fase.
- Documentar defectos, riesgos y deuda técnica.

### D. APROBAR
Una fase solo puede marcarse como aprobada si:
- [ ] La implementación está completa dentro del alcance.
- [ ] Lint, typecheck y build terminan correctamente, o las limitaciones preexistentes están documentadas y diferenciadas.
- [ ] Las pruebas relevantes pasan.
- [ ] No hay regresiones conocidas en módulos conservados.
- [ ] No quedan errores críticos o altos sin resolver.
- [ ] La auditoría del diff y de las dependencias está documentada.
- [ ] Se actualizó este documento con evidencias y estado.

**Si falla cualquier criterio:** corregir dentro de la misma fase y repetir VERIFICAR y AUDITAR. No continuar por conveniencia ni marcar como completado algo que solo está parcialmente implementado.

### 2.1 Evidencias mínimas

Por cada fase guardar:
- Archivos creados, modificados y retirados.
- Rutas probadas.
- Comandos ejecutados y resultado.
- Pruebas manuales y automatizadas.
- Capturas o logs relevantes, sin secretos.
- Incidencias encontradas y resolución.
- Riesgos o limitaciones pendientes.
- Dictamen final: `APROBADA`, `BLOQUEADA` o `REQUIERE CORRECCIÓN`.

---

## 3. Fase 0 — Descubrimiento, inventario y línea base


**Objetivo:** conocer el proyecto real antes de tocarlo y establecer una línea base verificable.

### Actividades
- [ ] Identificar framework, lenguaje, gestor de paquetes, estructura de carpetas y comandos del proyecto.
- [ ] Identificar las aplicaciones cliente y administrativa, sus layouts, menús y sistemas de navegación.
- [ ] Inventariar rutas, páginas, componentes, hooks, contextos, stores, servicios, APIs, funciones backend y modelos.
- [ ] Localizar las secciones incluidas en esta auditoría y mapear cada una a sus archivos y rutas reales.
- [ ] Rastrear dependencias compartidas entre módulos que se van a desactivar y módulos que deben conservarse.
- [ ] Identificar autenticación, roles, permisos, reglas de acceso y feature flags existentes.
- [ ] Identificar integraciones financieras y Web3: proveedores, adaptadores, eventos, contratos y estados.
- [ ] Revisar el estado de Git y registrar el punto de partida.
- [ ] Ejecutar y registrar lint, typecheck, build y pruebas existentes sin modificar código.
- [ ] Registrar errores preexistentes para no atribuirlos incorrectamente a los cambios futuros.

### Entregables
- Inventario de rutas y módulos.
- Mapa de dependencias.
- Línea base de calidad y errores preexistentes.
- Matriz de riesgo de eliminación/desactivación.
- Plan técnico de intervención por archivos.

### Criterios de aprobación
- [ ] Todos los hallazgos de este documento tienen una ubicación técnica identificada o están marcados como pendientes de localizar.
- [ ] Se conocen los consumidores compartidos de los módulos candidatos a desactivación.
- [ ] Existe una línea base reproducible.
- [ ] No se ha realizado ningún cambio funcional todavía.

---

## 4. Fase 1 — Saneamiento de navegación y módulos no necesarios

**Objetivo:** retirar de la experiencia de usuario las secciones que no forman parte del producto actual, sin destruir código o dependencias que puedan reutilizarse.

### 4.1 Finanzas y Marketplace
- [ ] Sistema de carrito de compras: desactivar su acceso y componente visible. El Marketplace queda reservado para una etapa futura.
- [ ] Sección Mercado del Marketplace: desactivar su acceso y componente visible.
- [ ] Sección de creación de tarjetas Visa: auditar dependencias y desactivar la sección. No eliminar componentes compartidos sin demostrar que no son necesarios.
- [ ] Sección InstaFound dentro de Finanzas: **desactivar o eliminar**, según el alcance de producto indicado en esta auditoría. Confirmar que no es una sección que deba permanecer activa.
- [ ] Simple Earn: desactivar su ruta y componente.
- [ ] Economía de la operación: retirar la versión actual y dejar el punto de entrada preparado para el calculador descrito en la Fase 4.
- [ ] Comprar dentro de Finanzas: retirar la sección; no debe confundirse con la creación o configuración de un minero.
- [ ] No eliminar la sección Resumen Earn, que se trabajará en la Fase 3.

### 4.2 Beneficios
- [ ] Rifas: desactivar.
- [ ] Ofertas: desactivar.
- [ ] GoBoxes: desactivar.
- [ ] Minero Bonus: desactivar.

### 4.3 Comunidad
- [ ] Rareza: desactivar.
- [ ] Solo Mining: desactivar.
- [ ] Ranking de liquidez: desactivar.
- [ ] Carrera de nuevos referidos: desactivar.
- [ ] Conservar la sección de Ranking de Mineros, que se preparará en la Fase 5.
- [ ] Conservar la sección de referidos.

### 4.4 Menú Explorar
Retirar el tag y sus secciones del menú:
- [ ] Colección GoMiners.
- [ ] Viajes.
- [ ] Mercancía.
- [ ] Vender NFT.
- [ ] Launchpad.
- [ ] Marketplace.

### 4.5 Menú Academia
Retirar el tag y sus secciones del menú:
- [ ] Academy.
- [ ] Bitcoin y minería.
- [ ] Blockchain y cripto.
- [ ] Fundamentos GoMining.
- [ ] Configurar 2FA.
- [ ] Retirar recompensas.

### Reglas de ejecución
- Retirar los elementos de navegación sin romper el layout, el menú responsive ni los permisos.
- Bloquear rutas desactivadas en el enrutador y validar el acceso directo.
- Revisar enlaces internos, redirecciones, breadcrumbs, buscadores y accesos rápidos.
- No borrar colecciones, registros ni información histórica.
- Si una sección comparte un componente con otra que se conserva, separar la configuración o el punto de entrada en lugar de retirar el componente compartido.
- Registrar los módulos desactivados para su posible reactivación futura.

### Criterios de aprobación
- [ ] Ninguna sección desactivada aparece en la navegación activa.
- [ ] Las rutas desactivadas no son accesibles directamente por usuarios sin autorización.
- [ ] No hay enlaces rotos ni pantallas en blanco.
- [ ] Los módulos conservados siguen funcionando.
- [ ] No se han eliminado datos ni dependencias compartidas accidentalmente.

---

## 5. Fase 2 — Estabilización de wallets y recarga de saldo

**Objetivo:** separar y corregir los problemas de conexión Web3 detectados, manteniendo el flujo de recarga existente que ya funciona.

### 5.1 Sección Conectar wallet
Hallazgos:
- Trust Wallet no detecta correctamente la extensión.
- MetaMask falla con el mensaje: `Connect no pudo iniciar la conexión. Actualiza la página, confirma que el dominio HTTPS sea accesible y vuelve a intentarlo. No se envió ningún pago.`
- La conexión Web3 no funciona en esta sección; la nota de auditoría indica que la conexión desde Recargar saldo sí funciona.

Tareas:
- [ ] Auditar el componente, proveedor, hooks, adaptadores y flujo de conexión de esta sección.
- [ ] Comparar su implementación con el flujo funcional de conexión que utiliza Recargar saldo.
- [ ] Identificar si hay dos implementaciones independientes o una configuración inconsistente.
- [ ] Revisar HTTPS, detección de proveedores, disponibilidad de extensiones, eventos de cuenta y red, permisos y estados de conexión.
- [ ] Revisar compatibilidad con MetaMask y Trust Wallet en los entornos soportados.
- [ ] Unificar la lógica mediante un servicio/adaptador compartido si la arquitectura actual lo permite.
- [ ] Mantener separada la interfaz de cada sección cuando sus responsabilidades sean diferentes.
- [ ] Mostrar estados claros: no instalada, no disponible, conectando, conectada, cuenta cambiada, red no compatible y error.
- [ ] Nunca solicitar ni almacenar frases semilla o claves privadas.

### 5.2 Modal Recargar saldo
Hallazgo: el modal no muestra todas las opciones de wallet disponibles; aparecen de forma incompleta Trust Wallet, MetaMask y Coinbase, aunque el flujo de conexión Web3 se reporta como funcional.

Tareas:
- [ ] Auditar el catálogo de wallets, la lista de proveedores y las condiciones de renderizado del modal.
- [ ] Verificar cuáles proveedores están realmente soportados por el proyecto.
- [ ] Mostrar todas las opciones soportadas de forma consistente, sin ofrecer proveedores que no puedan conectarse.
- [ ] Corregir el layout para que todas las opciones sean visibles y utilizables en escritorio y móvil.
- [ ] Mantener el flujo de recarga que ya funciona; no reemplazarlo por una implementación nueva sin necesidad.
- [ ] Probar conexión, desconexión, cambio de cuenta, cambio de red y rechazo de permisos.

### Criterios de aprobación
- [ ] La sección Conectar wallet usa un flujo probado y coherente.
- [ ] MetaMask y Trust Wallet se detectan correctamente en los entornos compatibles.
- [ ] El modal muestra todas las wallets realmente soportadas.
- [ ] Recargar saldo conserva su funcionamiento anterior.
- [ ] Los errores se comunican correctamente y no se presentan conexiones falsas.
- [ ] No se ejecutan pagos ni transacciones durante las pruebas de conexión.

---

## 6. Fase 3 — Resumen Earn independiente de Simple Earn

**Objetivo:** conservar Resumen Earn como panel de seguimiento de ganancias del minero, desvinculándolo completamente de Simple Earn.

### Alcance funcional
- [ ] Mantener la ruta y la identidad de Resumen Earn.
- [ ] Eliminar dependencias funcionales o visuales con Simple Earn.
- [ ] Definir una fuente de datos única y verificable para las ganancias del minero.
- [ ] Preparar KPIs de ganancias con trazabilidad.
- [ ] Preparar gráficos tipo Area Chart con degradados, leyendas, escalas y rangos temporales.
- [ ] Preparar filtros temporales, por ejemplo: 24 horas, 7 días, 30 días y período personalizado, solo si la fuente de datos lo soporta.
- [ ] Preparar estados de carga, vacío, error y datos desactualizados.
- [ ] Mostrar claramente moneda, unidad, período y zona horaria de cada métrica.

### Estructura mínima sugerida
- **KPI principal:** ganancia acumulada del período.
- **KPIs secundarios:** ganancia diaria, semanal y mensual, si existen datos verificables.
- **Gráfico de área:** evolución de ganancias en el tiempo.
- **Trazabilidad:** registros o eventos que expliquen cómo se compone el total.
- **Estado de sincronización:** última actualización de los datos.

### Reglas
- No inventar ganancias ni rellenar series con valores ficticios.
- No mezclar recompensas mineras con intereses de Simple Earn.
- No duplicar el cálculo de ganancias en frontend y backend.
- Mantener las unidades y reglas de redondeo consistentes con la fuente oficial.

### Base para evolución posterior
Preparar componentes visuales, contratos de datos y servicios desacoplados. La conexión completa a todas las fuentes de minería, análisis avanzado y exportaciones puede implementarse en una etapa posterior.

### Criterios de aprobación
- [ ] Resumen Earn funciona sin Simple Earn.
- [ ] Los KPIs y gráficos utilizan datos reales o muestran un estado vacío explícito.
- [ ] Los totales tienen trazabilidad.
- [ ] Los filtros no presentan datos fuera del período solicitado.
- [ ] No se alteran registros históricos ni cálculos existentes sin una validación específica.

---

## 7. Fase 4 — Base del calculador de potencia y rentabilidad

**Objetivo:** reemplazar la sección actual Economía de la operación por una base de calculador interactivo orientado a estimar potencia y posibles ganancias según las máquinas que el usuario pueda comprar.

### Alcance de esta fase
Construir la estructura funcional mínima, no un simulador financiero definitivo.

- [ ] Crear el punto de entrada y la interfaz del nuevo calculador.
- [ ] Definir el catálogo o contrato de máquinas disponibles.
- [ ] Preparar la selección de una o varias máquinas.
- [ ] Preparar la visualización de potencia total en **TH/s (terahashes por segundo)**. Corregir el término `HansRate` de la nota original: la unidad de potencia minera debe mostrarse según la unidad real de cada equipo.
- [ ] Preparar campos de parámetros necesarios para una estimación, identificando cuáles son configurables y cuáles provienen de una fuente externa.
- [ ] Preparar el espacio de resultados estimados y su desglose.
- [ ] Diferenciar visualmente estimación, dato real y dato pendiente.
- [ ] Preparar estados de datos incompletos o de equipo no disponible.

### Modelo conceptual inicial
Cada máquina debería poder describirse, como mínimo, mediante:
- Identificador.
- Nombre/modelo.
- Potencia y unidad.
- Precio y moneda, si existe una fuente válida.
- Consumo energético, si aplica.
- Estado de disponibilidad.
- Fuente y fecha de actualización de sus datos.

La estimación de ganancias requiere parámetros verificables adicionales, como dificultad o rendimiento de red, recompensa, comisiones y costos aplicables. No asumir valores ni publicar rentabilidad garantizada.

### Fuera de alcance por ahora
- Compra de máquinas.
- Checkout o Marketplace.
- Procesamiento de pagos.
- Promesas de retorno o rentabilidad garantizada.
- Optimización automática de portafolios.
- Integración avanzada con proveedores externos no existentes.

### Criterios de aprobación
- [ ] El calculador reemplaza la antigua sección sin romper navegación.
- [ ] Se pueden seleccionar máquinas de prueba claramente identificadas o máquinas con datos reales verificados.
- [ ] La potencia total se calcula correctamente y respeta las unidades.
- [ ] Los resultados se etiquetan como estimaciones.
- [ ] No existe un botón de compra que aparente completar una operación inexistente.

---

## 8. Fase 5 — Base del Ranking de Mineros y seguimiento social

**Objetivo:** preparar una sección gamificada e informativa que pueda mostrar los mineros activos de la pool y sus métricas, sin inventar actividad ni exponer datos privados.

### 8.1 Ranking
- [ ] Crear la estructura de la sección Ranking de Mineros.
- [ ] Definir el origen de los mineros activos dentro de la pool.
- [ ] Preparar listado, paginación o carga progresiva.
- [ ] Preparar ordenamiento por potencia TH/s verificada.
- [ ] Preparar campos de nombre público, rango, potencia y características de máquina autorizadas.
- [ ] Definir estados: activo, inactivo, sin datos o pendiente de sincronización.
- [ ] No incluir usuarios que no cumplan los criterios de visibilidad y consentimiento del producto.

### 8.2 Perfil resumido y detalle
- [ ] Permitir abrir el perfil público del minero al hacer clic en su nombre.
- [ ] Preparar un modal o panel flotante de estadísticas.
- [ ] Preparar KPIs de potencia, ganancias y rendimiento por hora, siempre que existan datos verificables.
- [ ] Preparar gráficos históricos y selector de período.
- [ ] Mostrar fecha de última actualización y fuente de las métricas.
- [ ] No exponer direcciones de wallet, identificadores privados, datos de cuenta ni información financiera individual no autorizada.

### 8.3 Seguidores
- [ ] Preparar la acción Seguir/Dejar de seguir.
- [ ] Preparar el contador de seguidores del perfil.
- [ ] Definir reglas para evitar duplicados y auto-seguimiento si corresponde.
- [ ] Preparar la relación de seguidores y seguidos en el modelo de datos.
- [ ] Definir permisos de lectura y escritura.
- [ ] Preparar un espacio para un feed o notificaciones de actividad, sin publicar retiros ni movimientos financieros privados.

### 8.4 Qué obtiene quien sigue a otro minero
La funcionalidad debe limitarse a información que el minero haya decidido hacer pública. En esta fase dejar preparada la estructura para:
- Consultar las estadísticas públicas del minero seguido.
- Recibir avisos de actividad pública o cambios relevantes, si se habilitan posteriormente.
- Abrir un resumen de métricas en un modal.

**No mostrar notificaciones de retiro ni cantidades retiradas de otra persona**, salvo que exista una decisión explícita de producto, consentimiento y una fuente de datos diseñada para publicar esa información. La alternativa recomendada es mostrar hitos o actividad minera pública sin revelar operaciones financieras privadas.

### Fuera de alcance por ahora
- Recompensas económicas por seguir a otros mineros.
- Feed social completo.
- Mensajería entre usuarios.
- Logros complejos, ligas o temporadas.
- Notificaciones en tiempo real si la infraestructura no está preparada.

### Criterios de aprobación
- [ ] El ranking utiliza datos verificables de la pool.
- [ ] El orden por TH/s es correcto y contempla unidades comparables.
- [ ] El perfil solo expone información pública autorizada.
- [ ] Seguir/dejar de seguir evita duplicados y respeta permisos.
- [ ] Los datos ausentes se muestran como no disponibles, no como cero ficticio.
- [ ] Las métricas del modal coinciden con sus fuentes.

---

## 9. Fase 6 — Votaciones y gobernanza

**Objetivo:** conservar la sección de votación y preparar el seguimiento de resultados, el esquema de costos y las áreas de cliente y administración.

### 9.1 Seguimiento de votos
- [ ] Mantener el componente existente “Consulta las propuestas de gobernanza”.
- [ ] Añadir una sección sencilla de resultados Sí/No.
- [ ] Mostrar porcentajes mediante barras de progreso.
- [ ] Mostrar cantidades absolutas de votos cuando la fuente lo permita.
- [ ] Definir estados de propuesta: borrador, activa, finalizada y cancelada.
- [ ] Definir fecha de apertura y cierre, zona horaria y reglas de elegibilidad.
- [ ] Evitar que los porcentajes se calculen con denominadores inconsistentes.

### 9.2 Esquema de costos solicitado
Preparar la lógica y configuración para estas reglas, sujetas a validación de producto y de backend:

**Usuarios gratuitos**
- Coste de participación/voto: 1 USDT.

**Usuarios de pago**
- Un voto gratuito por dinámica.
- Cada voto adicional: 0.10 USDT.

**Selección de votos**
- [ ] Preparar selector de cantidad de votos adicionales.
- [ ] Mostrar desglose del costo antes de confirmar.
- [ ] Validar saldo, elegibilidad y límites desde backend.
- [ ] Preparar estados de pago pendiente, confirmado, rechazado y cancelado.
- [ ] No registrar votos pagados antes de confirmar el pago.

### 9.3 Área de cliente
- [ ] Consultar propuestas.
- [ ] Ver reglas y período de votación.
- [ ] Consultar resultados y progreso.
- [ ] Elegir cantidad de votos, cuando corresponda.
- [ ] Confirmar participación mediante un flujo seguro.
- [ ] Consultar historial y estado de sus votos.

### 9.4 Área administrativa
- [ ] Preparar estructura para crear y administrar propuestas.
- [ ] Configurar fechas, opciones, reglas y elegibilidad.
- [ ] Consultar resultados y trazabilidad.
- [ ] Definir roles y permisos administrativos.
- [ ] Registrar acciones administrativas relevantes.

### Reglas de seguridad y consistencia
- El backend es la autoridad para validar elegibilidad, precio, saldo y registro del voto.
- Evitar votos duplicados según las reglas de cada dinámica.
- Usar operaciones atómicas o mecanismos equivalentes para evitar doble cobro o doble registro.
- No confiar en importes enviados por el frontend.
- No permitir editar resultados históricos sin un mecanismo auditable.

### Criterios de aprobación
- [ ] Los porcentajes Sí/No corresponden a los votos válidos.
- [ ] Las reglas de usuarios gratuitos y de pago se aplican en backend.
- [ ] La selección de cantidad muestra un costo coherente.
- [ ] No hay cobros ni votos ficticios.
- [ ] Cliente y administrador respetan roles y permisos.
- [ ] La trazabilidad permite auditar cada participación.

---

## 10. Fase 7 — Promociones y avisos internos

**Objetivo:** crear una base de marketing administrable desde el panel administrativo y visible en el panel del cliente.

### 10.1 Panel administrativo: gestión de promociones
- [ ] Preparar un módulo para crear, editar, activar, pausar y archivar promociones.
- [ ] Permitir crear cards con título, descripción, imagen o banner, llamada a la acción y destino.
- [ ] Definir fechas de inicio y finalización.
- [ ] Definir orden, prioridad y estado de publicación.
- [ ] Preparar validaciones para contenido, imágenes y enlaces.
- [ ] Registrar autor y fecha de modificación.
- [ ] Preparar una previsualización antes de publicar.

### 10.2 Panel del cliente: visualización
- [ ] Conectar la sección Promociones al contenido publicado desde administración.
- [ ] Mostrar múltiples cards mediante una visualización dinámica y adaptable.
- [ ] Definir comportamiento cuando no haya promociones activas.
- [ ] Respetar fechas, estado y orden de publicación.
- [ ] No mostrar promociones expiradas o no publicadas.

### 10.3 Avisos o notificaciones internas
- [ ] Preparar cards o avisos dinámicos dentro de la plataforma.
- [ ] Permitir cerrar u ocultar un aviso.
- [ ] Si el usuario hace clic, dirigirlo al destino configurado y validado.
- [ ] Preparar estados de leído/descartado cuando sean necesarios.
- [ ] Definir alcance: global, segmento o usuario, según permisos disponibles.
- [ ] Evitar que un enlace externo o interno no validado se convierta en redirección abierta insegura.

### Fuera de alcance por ahora
- Campañas multicanal.
- Automatización avanzada de marketing.
- Segmentación predictiva.
- Envíos push del navegador o móvil si no existe infraestructura y consentimiento adecuados.

### Criterios de aprobación
- [ ] Una promoción creada en administración aparece correctamente en el cliente.
- [ ] Los cambios de estado y fechas se respetan.
- [ ] El ciclo de creación, edición y publicación está protegido por roles.
- [ ] Cerrar un aviso funciona y su comportamiento persiste según la regla definida.
- [ ] Los destinos de las cards son seguros y válidos.

---

## 11. Fase 8 — Auditoría de retiros

**Objetivo:** completar el sistema de retiros y corregir el flujo que actualmente deriva al usuario hacia Recargar saldo.

### Hallazgos
- La sección de retiros está incompleta.
- El flujo de retiro redirige incorrectamente al componente de recarga de saldo.
- El retiro debe utilizar por defecto la wallet que el usuario ya haya conectado.

### Actividades
- [ ] Auditar el código completo de la sección de retiros, sus componentes, servicios, APIs y modelos.
- [ ] Identificar por qué el flujo de retiro termina en Recargar saldo.
- [ ] Separar explícitamente los flujos de depósito/recarga y retiro.
- [ ] Recuperar la wallet conectada y autorizada del usuario como destino predeterminado.
- [ ] Mostrar la dirección de destino de forma legible y permitir verificarla antes de confirmar.
- [ ] Definir cómo cambiar la wallet de destino, si el producto lo permite, con validación explícita.
- [ ] Preparar validaciones de red, activo, saldo disponible, mínimo, máximo y comisiones.
- [ ] Consultar límites y comisiones desde una fuente confiable del backend.
- [ ] Preparar estados: borrador, validando, pendiente, procesando, confirmado, rechazado y cancelado.
- [ ] Implementar protección contra doble envío y solicitudes duplicadas.
- [ ] Registrar identificador de operación y hash de transacción cuando exista.
- [ ] Preparar historial y trazabilidad del retiro.
- [ ] Definir controles de riesgo y revisión adicional cuando corresponda.

### Reglas críticas
- La wallet conectada no autoriza por sí sola un retiro. El usuario debe revisar y confirmar la operación.
- Nunca solicitar claves privadas ni frases semilla.
- No enviar transacciones desde el frontend sin controles de backend adecuados.
- No confiar en el saldo, la comisión, la red o la dirección proporcionados únicamente por el cliente.
- No marcar un retiro como completado hasta recibir confirmación verificable.
- Las pruebas deben usar mocks o redes de prueba; no ejecutar retiros reales durante la auditoría.
- No mezclar la lógica de retiro con la de depósito.

### Criterios de aprobación
- [ ] El flujo de retiro ya no redirige a Recargar saldo.
- [ ] La wallet conectada aparece como destino predeterminado cuando sea compatible.
- [ ] El usuario puede verificar y confirmar el destino.
- [ ] Las validaciones críticas se ejecutan en backend.
- [ ] Los estados reflejan el resultado real de la operación.
- [ ] Existe trazabilidad y protección contra duplicados.
- [ ] Las pruebas no generan movimientos reales de fondos.

---

## 12. Fase 9 — Regresión integral y cierre de auditoría

**Objetivo:** comprobar que todos los cambios conviven correctamente y que las secciones conservadas siguen operativas.

### Secciones que deben permanecer
- [ ] Historial de Transacciones.
- [ ] Resumen Earn, independiente de Simple Earn.
- [ ] Depositar, conectado con Recargar saldo y el flujo Web3 existente.
- [ ] Suscripciones, dentro de Planes, para visualizar las suscripciones de membresía.
- [ ] Votación y gobernanza.
- [ ] Promociones.
- [ ] Ranking de Mineros.
- [ ] Referidos.
- [ ] Trazabilidad de minería, dentro de Data Center.
- [ ] Cualquier otro módulo compartido identificado durante la Fase 0.

### Pruebas de regresión
- [ ] Navegación completa de cliente.
- [ ] Navegación completa de administración.
- [ ] Roles, permisos y acceso directo a rutas.
- [ ] Historial de transacciones y consulta de registros.
- [ ] Depósito/recarga y conexión Web3.
- [ ] Retiro con entorno de prueba.
- [ ] Suscripciones y estado de membresía.
- [ ] Resumen Earn y consistencia de métricas.
- [ ] Votaciones y cálculo de resultados.
- [ ] Publicación y visualización de promociones.
- [ ] Ranking, perfiles y seguimiento.
- [ ] Referidos.
- [ ] Trazabilidad de minería en Data Center.
- [ ] Diseño responsive, accesibilidad básica y estados de error.
- [ ] Seguridad de APIs, validación de entradas y autorización.
- [ ] Build de producción y revisión final de logs.

### Criterios de aprobación final
- [ ] Todas las fases anteriores están aprobadas o sus excepciones están justificadas y autorizadas.
- [ ] No existen errores críticos o altos abiertos.
- [ ] No hay rutas desactivadas accesibles indebidamente.
- [ ] No hay funcionalidades que aparenten operar sin backend real.
- [ ] Las secciones conservadas mantienen sus contratos y datos.
- [ ] La documentación refleja el estado real del proyecto.
- [ ] Existe un informe final con evidencias, riesgos residuales y trabajo aplazado.

---

## 13. Matriz de alcance y decisiones

| Módulo / sección | Decisión | Fase |
|---|---|---:|
| Carrito de compras | Desactivar, reservar para Marketplace futuro | 1 |
| Mercado / Marketplace | Desactivar, conservar base si es reutilizable | 1 |
| Crear tarjetas Visa | Desactivar tras auditar dependencias | 1 |
| InstaFound en Finanzas | Desactivar o eliminar tras confirmar alcance | 1 |
| Simple Earn | Desactivar | 1 |
| Economía de la operación | Sustituir por base del calculador | 4 |
| Comprar en Finanzas | Eliminar de navegación y ruta | 1 |
| Rifas, Ofertas, GoBoxes, Minero Bonus | Desactivar | 1 |
| Rareza, Solo Mining, Ranking de liquidez, Carrera de nuevos referidos | Desactivar | 1 |
| Explorar y sus seis secciones | Retirar de navegación y bloquear rutas | 1 |
| Academia y sus seis secciones | Retirar de navegación y bloquear rutas | 1 |
| Votación y gobernanza | Conservar y evolucionar | 6 |
| Historial de Transacciones | Conservar | 9 |
| Resumen Earn | Conservar y desvincular de Simple Earn | 3 |
| Depositar / Recargar saldo | Conservar y estabilizar conexión Web3 | 2 |
| Promociones | Preparar administración y visualización | 7 |
| Suscripciones | Conservar | 9 |
| Ranking de Mineros | Preparar ranking, perfiles y seguimiento | 5 |
| Referidos | Conservar | 9 |
| Trazabilidad de minería / Data Center | Conservar | 9 |
| Conectar wallet | Corregir | 2 |
| Modal Recargar saldo | Corregir visualización de wallets | 2 |
| Retiros | Completar y separar de depósitos | 8 |

---

## 14. Registro de ejecución

El agente debe actualizar esta tabla al finalizar cada fase. No marcar una fase como aprobada sin evidencias.

| Fase | Estado | Fecha | Evidencia / informe | Bloqueos |
|---|---|---|---|---|
| 0 — Descubrimiento | PENDIENTE | — | — | — |
| 1 — Saneamiento | PENDIENTE | — | — | — |
| 2 — Wallets y recarga | PENDIENTE | — | — | — |
| 3 — Resumen Earn | PENDIENTE | — | — | — |
| 4 — Calculador | PENDIENTE | — | — | — |
| 5 — Ranking de Mineros | PENDIENTE | — | — | — |
| 6 — Votaciones | PENDIENTE | — | — | — |
| 7 — Promociones | PENDIENTE | — | — | — |
| 8 — Retiros | PENDIENTE | — | — | — |
| 9 — Regresión final | PENDIENTE | — | — | — |

Estados permitidos: `PENDIENTE`, `EN CURSO`, `REQUIERE CORRECCIÓN`, `BLOQUEADA`, `APROBADA`.

---

## 15. Instrucción de inicio para el agente

Comienza exclusivamente por la **Fase 0 — Descubrimiento, inventario y línea base**. No implementes todavía los cambios de las fases posteriores.

Entrega primero el inventario técnico, el mapa de dependencias, la línea base de pruebas y la lista de archivos que previsiblemente se modificarían por fase. Después ejecuta la implementación de la Fase 1 y aplica el protocolo completo IMPLEMENTAR → VERIFICAR → AUDITAR → APROBAR.

Al cerrar cada fase:
1. Resume exactamente qué cambió.
2. Enumera los archivos afectados.
3. Adjunta resultados de pruebas y evidencias.
4. Indica los defectos corregidos y los riesgos pendientes.
5. Declara `APROBADA`, `BLOQUEADA` o `REQUIERE CORRECCIÓN`.
6. Espera autorización o confirmación antes de comenzar la siguiente fase.

**No interpretes la existencia de una fase en este documento como autorización para ejecutarla automáticamente. La aprobación de cada fase es una puerta de control obligatoria.**
