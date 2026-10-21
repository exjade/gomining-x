# MinerX ⚡ Telemetría Kryptex PRL & Flota GPU SaladCloud

**MinerX** es una plataforma centralizada y moderna diseñada específicamente para mineros de **Pearl (PRL - PearlHash PoUW)** en el pool de **Kryptex**, ejecutando cargas de trabajo en contenedores Docker sobre GPUs en la nube con **SaladCloud**.

---

## 🚀 Características Principales

### 1. Gestión Multicuenta de SaladCloud
* Conecta múltiples cuentas u organizaciones de SaladCloud (`Salad-Api-Key`, `Organization`, `Project`).
* Monitorea instancias en tiempo real: estado del contenedor (`running`, `allocating`, `stopped`), ID de máquina física y modelo de GPU.
* Detección automática de desconexiones o contenedores caídos.

### 2. Integración con Kryptex Pool API (Pearl PRL)
* Telemetría directa con el pool de Kryptex (`/prl/api/v3/miner/workers/{address}`, `/prl/api/v1/miner/balance/{address}`, `/prl/api/v1/pool/info`).
* Monitoreo de hashrate en **TH/s**, shares válidos, stale e inválidos.
* Cálculo del valor en USD pagado por cada trabajo válido (share) y rendimiento por ciclo.

### 3. Vigilancia de Potencia & Reasignación por "Lotería de Silicio"
* Compara el hashrate real reportado por Kryptex contra el benchmark de la GPU (e.g. RTX 4090 = 300 TH/s, RTX 5090 = 367 TH/s).
* Si una GPU mina por debajo del umbral configurado (ej. < 80% o rentabilidad negativa), genera una **Alerta Inmediata**.
* Botón de **Reasignar GPU (1-Click Reallocate)** que ejecuta la API oficial de SaladCloud (`POST /instances/{id}/reallocate`) para descartar el nodo deficiente y recibir un nuevo servidor físico de inmediato.

### 4. Matriz Económica & Simulador (Basado en tu Hoja de Excel)
* Base de datos completa con más de 50 configuraciones de GPUs (RTX serie 50, 40, 30, laptops y workstation) y sus niveles de prioridad (*Lowest, Low, Medium, High Priority*).
* Simulador interactivo para proyectar ganancias netas escalando flotillas de 1, 5, 10, 20, 30 o 50 GPUs.
* Calculadora de Punto de Equilibrio (*Break-Even*): calcula cuántos TH/s mínimos necesitas para no perder dinero ante cualquier tarifa de alquiler.

### 5. Interfaz Ultra Moderna & 100% Responsive para Móviles
* Estética táctica *Cyber-Industrial Telemetry* con modo oscuro nativo.
* Gráficos de área con degradados en tiempo real (Hashrate de Flota y Dinámica Financiera).
* Barra de navegación inferior optimizada para teléfonos inteligentes (`MobileNav`), permitiendo vigilar y reasignar GPUs desde cualquier lugar.

---

## 📦 Estructura del Proyecto

```
C:\Users\Roman\Documents\MinerX/
├── server/
│   └── server.ts            # Proxy Express para APIs de SaladCloud, Kryptex y Webhooks
├── src/
│   ├── components/
│   │   ├── Header.tsx        # Barra de telemetría y KPIs rápidos
│   │   ├── MobileNav.tsx     # Barra inferior para teléfonos móviles
│   │   ├── OverviewTab.tsx   # Dashboard general y gráficos de área degradados
│   │   ├── FleetTab.tsx      # Gestión y tarjetas de GPUs individuales
│   │   ├── EconomicsTab.tsx  # Simulador de flotillas y tabla de Excel
│   │   ├── ApiManagerTab.tsx # Administrador multicuenta y configuración de wallet
│   │   ├── AlertsTab.tsx     # Registro cronológico de desconexiones y avisos
│   │   └── ReallocateModal.tsx # Modal de confirmación de reasignación (API Salad)
│   ├── data/
│   │   ├── gpuBenchmarks.ts  # Base de datos de modelos, TH/s y costos de Excel
│   │   └── mockFleetData.ts  # Datos de simulación para pruebas inmediatas
│   ├── types/
│   │   └── minerx.ts         # Tipos e interfaces TypeScript
│   ├── App.tsx               # Orquestador principal de estado y sync
│   └── index.css             # Estilos Cyber con Tailwind v4 y fuentes Google
└── package.json
```

---

## 🛠️ Cómo Iniciar MinerX

Para iniciar el servidor proxy y la interfaz frontend simultáneamente:

```bash
cd C:\Users\Roman\Documents\MinerX
npm run dev
```

### Accesos Disponibles:
* **En tu Laptop / PC:** `http://localhost:5173`
* **Desde tu Teléfono Móvil (misma red Wi-Fi):** `http://192.168.11.4:5173` (o la IP local mostrada en la terminal)
* **Servidor Proxy Backend:** `http://localhost:3001`

---

## 🔑 Configuración de APIs & Bot de Telegram

En la pestaña **"Conexión APIs & Bot"**:
1. **Kryptex Pool (Pearl PRL):**
   * Ingresa tu dirección de billetera PRL (`prl1q...`) para cargar tus workers, balance total, confirmed/unconfirmed y shares en vivo.
   * Cuenta con un botón de acceso directo: *"Cargar Farm Real Top"* con una granja real activa para pruebas instantáneas.
2. **SaladCloud Multicuenta:**
   * Ingresa el nombre de tu Organización, Proyecto (`default`) y tu `Salad-Api-Key`. Puedes agregar múltiples cuentas y monitorear todas tus instancias en un solo panel.
3. **Bot Autónomo de Telegram (Paso a Paso en 30 segundos):**
   * **Paso 1:** En Telegram, busca `@BotFather` y escribe `/newbot`.
   * **Paso 2:** Asígnale un nombre (ej. `MinerX Alertas`) y un usuario que termine en `bot` (ej. `MiMinerXAlerts_bot`).
   * **Paso 3:** Copia el **HTTP API Token** generado (ej. `7123456789:AAHk...`) y pégalo en el campo *"Bot Token"*.
   * **Paso 4:** Busca `@userinfobot` en Telegram, presiona `/start` y copia tu **Id numérico** (ej. `123456789`). Pégalo en *"Chat ID"*.
   * **Paso 5 (Crucial):** Entra al chat de tu bot recién creado y presiona el botón **START** para autorizarlo a enviarte mensajes.
   * **Paso 6:** Presiona el botón *"Probar Bot de Telegram (Ping al Móvil)"* en MinerX y recibirás una notificación al instante.
   * **Vigilante en Segundo Plano:** El backend de Node.js (`server/server.ts`) revisa cada 90 segundos tus workers en Kryptex y te envía un mensaje a Telegram en cuanto una GPU se desconecte o baje de potencia, así como cuando se recupere.

---

## ⚡ ¿Qué ocurre si se apaga tu Laptop? (Guía de Monitoreo 24/7)

### 1. Tus GPUs en la Nube NO se detienen
Tus contenedores Docker en **SaladCloud se ejecutan en servidores cloud independientes**, y **Kryptex continúa minando y acreditando recompensas** a tu billetera aunque tu laptop esté completamente apagada.

### 2. El Dashboard Local en tu Laptop
Si ejecutas MinerX únicamente en tu laptop con `http://localhost:5173`:
* Si apagas la laptop o entra en suspensión profunda, el servidor local Node.js y Vite se apagan temporalmente.
* Durante ese tiempo, no podrás abrir el panel desde tu celular y el bot de Telegram no emitirá alertas.

### 3. Soluciones para Monitoreo 24/7 Ininterrumpido:

* **Opción A (Sin costo, en tu misma Laptop):**
  1. En Windows, ve a *Configuración > Sistema > Inicio/apagado y suspensión*.
  2. En *Panel de Control > Opciones de energía*, haz clic en **"Elegir la acción del cierre de la tapa"** y selecciona **"No hacer nada"**.
  3. Deja la laptop conectada al cargador con la tapa cerrada; la pantalla se apagará para ahorrar energía mientras MinerX, el servidor Node.js y el vigilante de Telegram continúan activos las 24 horas.

* **Opción B (Recomendada: Despliegue en la Nube 24/7):**
  Dado que MinerX está desacoplado con una arquitectura cliente-servidor (Node.js Express + SPA React), puedes desplegarlo en un servicio gratuito o de bajo costo como **Render.com**, **Railway.app** o un pequeño VPS:
  1. Subir el repositorio a GitHub.
  2. En Render/Railway conectar el repositorio y configurar el comando de inicio: `npm start` (o `node server/server.ts`).
  3. Obtendrás una URL pública segura (ej: `https://minerx.onrender.com`) accesible desde tu teléfono desde cualquier parte del mundo, y el vigilante de Telegram correrá **24 horas al día, 7 días a la semana** aunque tu laptop esté apagada.
