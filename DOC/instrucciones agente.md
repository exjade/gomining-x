# AGENT_INSTRUCTIONS.md - Implementación de Funcionalidades Avanzadas en MinerX

**Contexto del Sistema:**
MinerX es una aplicación Cliente-Servidor (React 19, Tailwind v4, Vite, Express Proxy) para orquestación de minería en la nube. Conecta la API de SaladCloud (instancias Docker) con la API del pool de Kryptex (PRL). 

**Misión del Agente:**
Debes abandonar cualquier uso de datos simulados (`mockData`) e implementar las siguientes 5 funcionalidades reales en el backend (`server/server.ts`) y conectarlas al frontend (`src/`). Todo debe operar con datos en vivo consumiendo las APIs reales.

## Tarea 1: Monitoreo de Saldo y Runway de SaladCloud
1.  **Backend:** Crea un endpoint `GET /api/salad/balance`. Debes iterar sobre las cuentas activas en `config.json` y hacer un `GET` a `https://api.salad.com/api/public/organizations/{org}/billing/wallet`.
2.  **Lógica:** Calcula el gasto total actual por hora sumando el costo de las instancias corriendo. Divide el saldo de la billetera entre el gasto por hora para obtener el `runwayHours` (horas de vida restantes).
3.  **Frontend:** En la barra superior (`Header.tsx`), muestra el saldo total y un indicador de "Runway". Si `runwayHours < 24`, pon el texto en rojo.

## Tarea 2: Auto-Escalado Dinámico (Elasticidad)
1.  **Backend:** Modifica el loop del "Vigilante Autónomo" (`runAutonomousBackgroundWatcher`).
2.  **Lógica:** Compara el `hourlyNetProfit` actual contra un `targetMargin` definido en `config.json`.
3.  **Acción (Scale-Out):** Si el margen supera el 30%, usa el endpoint `POST https://api.salad.com/api/public/organizations/{org}/projects/{proj}/container-groups` para duplicar la configuración de un grupo rentable existente.
4.  **Acción (Scale-In):** Si el margen es negativo, busca el nodo con peor `performanceRatioPct` y destrúyelo usando `DELETE https://api.salad.com/api/public/organizations/{org}/projects/{proj}/container-groups/{containerGroup}`.

## Tarea 3: Visor de Logs Remotos del Contenedor
1.  **Backend:** Crea un endpoint `GET /api/salad/logs/:org/:proj/:containerGroup/:instanceId`.
2.  **Integración:** Consume la API de Salad: `GET https://api.salad.com/api/public/organizations/{org}/projects/{proj}/container-groups/{containerGroup}/instances/{instanceId}/system-logs`.
3.  **Frontend:** En `FleetTab.tsx`, añade un botón "Ver Logs" a cada tarjeta de GPU. Al hacer clic, abre un modal oscuro con una terminal falsa (`bg-black text-green-500 font-jetbrains`) que imprima los logs en crudo.

## Tarea 4: Persistencia Histórica (SQLite)
1.  **Backend:** Instala `better-sqlite3`. Inicializa una base de datos local en `server/data/minerx_history.db`.
2.  **Esquema:** Crea una tabla `telemetry (timestamp, total_hashrate, active_gpus, hourly_cost, hourly_revenue)`.
3.  **Cronjob:** Cada 1 hora exacta, inserta una fila con el snapshot actual del `FleetSummary`.
4.  **Frontend:** Crea el endpoint `GET /api/history` para poblar el gráfico de `OverviewTab.tsx` usando datos reales de SQLite, abarcando hasta 30 días.

## Tarea 5: Reconciliación de Pagos (Payouts vs Gastos)
1.  **Backend:** Enlaza el endpoint existente de Kryptex `/api/kryptex/payouts/:address` (`https://pool.kryptex.com/prl/api/v1/payouts`).
2.  **Lógica:** Suma todos los pagos completados (`status: completed`) del mes actual en USD. Crúzalo con una nueva consulta a la API de facturación de Salad para ver el gasto mensual real.
3.  **Frontend:** En `EconomicsTab.tsx`, muestra una tarjeta comparativa: "Ingresos Recibidos vs Gastos Reales", exponiendo el Margen de Error de la proyección.

**Restricciones de Código:**
*   Mantén estricto tipado en TypeScript (`src/types/minerx.ts`).
*   Maneja los errores de CORS siempre desde Express, NUNCA pidas las APIs de Salad o Kryptex directamente desde los componentes de React.
2. ¿Cómo funciona la conexión real entre sistemas? (Cero simulaciones)
Para que MinerX deje de ser una maqueta visual y se convierta en el "cerebro" operativo de tu granja en la nube, la arquitectura de datos debe fluir de esta manera exacta:

El "Pegamento" (La llave maestra es el ID del Worker)
El mayor reto al cruzar dos plataformas desconectadas (Salad y Kryptex) es saber qué servidor físico es qué minero.

Cuando configuras tu imagen de Docker en SaladCloud, le pasas un comando de inicio al minero (ej. T-Rex o Gminer).

En ese comando, debes forzar a que el nombre del worker en Kryptex sea el nombre de la instancia en Salad. Generalmente, se hace inyectando variables de entorno en Docker: -w Salad-GPU-${SALAD_MACHINE_ID}.

De esta forma, cuando tu backend (server.ts) le pide a Salad "dame mis máquinas" y a Kryptex "dame mis mineros", el código empareja ambos arrays buscando exactamente ese nombre. Ahí es donde nace el objeto MergedGPUWorker.

El Flujo de la API (Paso a Paso en Vivo):

El Frontend pide datos: Tu app en React hace una petición limpia a http://localhost:3001/api/salad/all-active.

El Backend actúa de Escudo (Proxy): El archivo server.ts toma la llave maestra (Salad-Api-Key) guardada en el config.json local. Nunca manda esta llave al navegador por seguridad.

El Backend consulta a Salad: Hace un HTTP GET seguro a [https://api.salad.com/api/public/](https://api.salad.com/api/public/).... Salad responde: "Tienes 10 RTX 4090 corriendo en tu organización y te estoy cobrando $1.50/hora".

El Backend consulta a Kryptex: Inmediatamente después, hace un HTTP GET a [https://pool.kryptex.com/prl/api/v3/miner/workers/TU_BILLETERA](https://pool.kryptex.com/prl/api/v3/miner/workers/TU_BILLETERA). Kryptex responde: "Tengo 9 workers minando a 2700 TH/s y 1 worker desconectado desde hace 15 mins".

El Motor de Decisión (Fusión): El backend cruza las listas. Detecta que pagas por 10 máquinas pero solo 9 minan. Identifica a la máquina culpable. Empaqueta estos datos (rentabilidad real, hashrates cruzados, alertas) en formato JSON y se los devuelve a React.

React Dibuja: React recibe el JSON y la gráfica de Recharts cambia su degradado a rojo, mientras la tabla marca la máquina caída con el botón rojo de "Reasignar".

Acción de Respuesta: Si tocas "Reasignar", React hace un POST a tu backend. Tu backend usa la llave de Salad y manda la orden reallocate. Salad apaga el contenedor malo y enciende uno nuevo. Todo sin que tú abras el panel de ellos.

Este flujo bidireccional garantiza que el dashboard sea un centro de comando real. La información de tu Excel financiero cobra vida porque los cruces matemáticos se hacen en el backend basándose en el pulso en vivo de los servidores.