Aquí tienes la Documentación Técnica y Especificación de Requerimientos para replicar al 100% la lógica de cálculo, la estructura de datos, las reglas de negocio y los paneles ejecutivos de este sistema de minería GPU en la nube en un Dashboard Web interactivo.
Supuestos Considerados
Base de Datos Relacional: Se asume que el dashboard se conectará a una base de datos relacional (como PostgreSQL, Supabase o MySQL) que soporte consultas SQL, vistas materializadas y uniones relacionales.
APIs de Cotización en Tiempo Real: Las tasas de cambio y precios spot (BTC/USD, PRL/USD, USD/MXN) serán provistas por APIs externas (Bitso, CoinEx, CoinGecko, Banxico) o ingresadas manualmente en la tabla de precios.
Monedas Base de Control: Todas las métricas de cómputo en la nube se auditan en USD, mientras que la liquidación final realizada se mide en MXN (convertida a USD al tipo de cambio de la transacción para consorcio patrimonial).
Regla de Caja (Efectivo Realizado): Un ingreso solo se contabiliza como "Ganancia Realizada" cuando su estado es estrictamente 'Cobrado en banco'.
DOCUMENTACIÓN TÉCNICA Y ESPECIFICACIÓN DEL DASHBOARD
1. Arquitectura General y Capas Funcionales
El sistema está diseñado en 4 capas operativas interconectadas:
Capa 1: Registro Operativo y Eventos de Minería: Registra la potencia de cómputo gastada ($TH \cdot h$), horas efectivas, balance inicial/final cripto y la infraestructura consumida en SaladCloud.
Capa 2: Auditoría de Fricción Financiera (Tarifas, Spreads y Gas): Rastrea las comisiones fijas, dinámicas y el spread oculto (diferencial de cotización) introducido por los intermediarios.
Capa 3: Costos, Capital e Integración Bancaria: Separa estrictamente el Capital Nuevo (inyección de dinero bancario) del Capital Reinvertido (fondos rotativos generados por la propia minería) y concilia las liquidaciones vía SPEI/P2P.
Capa 4: Motor Analítico, Comparador A/B y Dashboard: Consolida los indicadores clave de rendimiento (KPIs), normaliza la eficiencia unitaria y genera simulaciones de lotes óptimos.
2. Modelo de Datos (Esquema de Tablas y Relaciones)
Para replicar este sistema, se deben implementar 10 entidades principales:
                          ┌──────────────────────────┐
                          │     Salad_Accounts       │
                          └────────────┬─────────────┘
                                       │ 1:N
                          ┌────────────▼─────────────┐
                          │   Sesiones_Comparativas  ├─────────────┐
                          └────────────┬─────────────┘             │ 1:N
                                       │ 1:N                       ▼
┌──────────────────────────┐           │              ┌──────────────────────────┐
│   Conversiones_Kryptex   │◄──────────┼─────────────►│     Eventos_Mineria      │
└──────────────────────────┘           │              └──────────────────────────┘
                                       │
┌──────────────────────────┐           │              ┌──────────────────────────┐
│    Depositos_y_Costos    │◄──────────┼─────────────►│   Retiros_y_Comisiones   │
└──────────────────────────┘           │              └──────────────────────────┘
                                       │
                                       ▼
                          ┌──────────────────────────┐
                          │    Conversion_a_MXN      │
                          └──────────────────────────┘
Detalle de Entidades
A. Sesiones_Comparativas (Tabla Central de Ciclos)
Campos: id_sesion (PK), fecha_inicio, fecha_fin, horas_efectivas, modalidad_ruta ('Kryptex' vs 'PEARL Directa'), gpus_activas, hashrate_promedio_th_s, costo_salad_usd, balance_inicial_cripto, balance_final_cripto, moneda_base (BTC / PRL), precio_liquidacion_usd, estado ('ACTIVO', 'FINALIZADO', 'CANCELADO').
B. Salad_Accounts (Cuentas Multi-Organización SaladCloud)
Campos: account_id (PK), organizacion, billing_account_id, saldo_inicial_usd, depositos_propios_usd, depositos_reinversion_usd, consumo_gpu_usd, credito_restante_usd, estado ('ACTIVA', 'HISTÓRICA').
C. Prorrateo_Ciclos_Mixed (Desglose de Ciclos Compartidos)
Campos: id_prorrateo (PK), id_sesion (FK), account_id (FK), porcentaje_asignacion, monto_asignado_usd.
D. Conversiones_Kryptex (Auditoría de Spreads Ocultos)
Campos: id_conversion (PK), fecha_hora, id_sesion (FK), prl_convertido, precio_kryptex_usd, precio_spot_usd, spread_interno_pct, btc_bruto, comision_btc, btc_neto, usd_perdida_spread.
E. Retiros_y_Comisiones_Reales (Transacciones Cripto / Red)
Campos: id_retiro (PK), fecha_hora, origen, destino, moneda, monto_bruto, tipo_tarifa ('FIJA', 'PORCENTUAL', 'GAS'), comision_fija, comision_red, comision_pct, monto_neto_recibido, monto_usd_bruto, monto_usd_comision, txid.
F. Conversion_a_MXN (Liquidaciones Bancarias SPEI / P2P)
Campos: id_liquidacion (PK), fecha_hora, id_sesion (FK), cripto_origen, monto_cripto_vendido, precio_cripto_usd, tc_interbancario_usd_mxn, tc_real_ejecutado_usd_mxn, mxn_bruto, comision_trading_mxn, comision_spei_mxn, mxn_neto_banco, friccion_total_mxn, tc_efectivo_final_mxn_usd, porcentaje_friccion, estado_spei ('Cobrado en banco', 'Pendiente'), banco_destino.
G. Catalog_GPUs (Matriz de Benchmark de Tarjetas)
Campos: modelo_gpu, fabricante, vram_gb, costo_hora_usd, costo_dia_usd, prioridad, hashrate_th_s, revenue_1h_usd, revenue_24h_usd, ganancia_1gpu_24h, ganancia_flotilla_5gpus_24h, ganancia_flotilla_10gpus_24h, ganancia_flotilla_20gpus_24h.
H. Simulador_Parametros (Variables del Modelo de Sensibilidad)
Campos: spread_oculto_kryptex_pct (3.90%), tarifa_fija_btc_kryptex_usd (2.50), comision_bitso_pct (0.65%), tarifa_red_pearl_usd (0.01), comision_coinex_pct (0.20%), tarifa_trc20_usdt_coinex_usd (1.00), comision_spei_mxn (0.00).
3. Lógica de Negocio y Fórmulas de Cálculo
A continuación se presentan las fórmulas matemáticas necesarias para replicar el motor de cálculo en el Backend / SQL.
A. Cómputo y Potencia Total ($TH \cdot h$)
$$\text{Potencia Cómputo Accumulada (TH}\cdot\text{h)} = \text{Horas Efectivas} \times \text{Hashrate Promedio (TH/s)}$$
B. Consumo y Distribución en SaladCloud
Para ciclos individuales:

$$\text{Consumo Directo USD} = \text{Costo Registrado de la Sesión}$$

Para ciclos compartidos (MIXED):

$$\text{Costo Asignado a Cuenta}_i = \text{Costo Total Ciclo USD} \times \left( \frac{%\text{ Asignación}_i}{100} \right)$$

$$\text{Crédito Restante Account}_i = \text{Saldo Inicial} + \text{Depósitos Propios} + \text{Depósitos Reinversión} - \text{Consumo GPU Total Asignado}$$
C. Detección y Auditoría del Spread Oculto de Kryptex
Kryptex aplica una conversión automática no transparente de PRL a BTC:

$$\text{Spread Interno %} = \left( \frac{\text{Precio Spot (USD/PRL)} - \text{Precio Ejecutado Kryptex (USD/PRL)}}{\text{Precio Spot (USD/PRL)}} \right) \times 100$$

$$\text{Pérdida por Spread (USD)} = \text{Cantidad PRL Convertida} \times \left( \text{Precio Spot} - \text{Precio Kryptex} \right)$$
D. Fricción Financiera Total
$$F_{\text{Total USD}} = \text{Pérdida por Spread USD} + \text{Tarifas de Red USD} + \text{Comisiones Exchange USD} + \text{Diferencial Cambiario USD/MXN}$$

$$\text{Impacto % Fricción} = \left( \frac{F_{\text{Total USD}}}{\text{Producción Bruta USD}} \right) \times 100$$
E. Normalización Unitaria (Benchmark Comparativo A/B)
Para comparar de forma justa la Ruta A (Kryptex) vs. Ruta B (PEARL Directa):
USD Neto por $TH \cdot h$:

$$\text{Eficiencia Cómputo} = \frac{\text{Ganancia Neta Auditada USD}}{\text{Potencia Total (TH}\cdot\text{h)}}$$
USD Neto por USD de SaladCloud:

$$\text{Eficiencia Inversión} = \frac{\text{Ganancia Neta Auditada USD}}{\text{Costo SaladCloud USD}}$$
Velocidad de Retorno ($USD/h$):

$$\text{Velocidad} = \frac{\text{Ganancia Neta Auditada USD}}{\text{Horas Totales Minadas}}$$
ROI sobre Gasto SaladCloud (%):

$$\text{ROI %} = \left( \frac{\text{Ganancia Neta Auditada USD}}{\text{Costo SaladCloud USD}} \right) \times 100$$
F. Contabilidad Patrimonial
Capital Nuevo Aportado (USD): Suma de recargas a SaladCloud fondeadas con tarjeta/banco externo.
Capital Reinvertido (USD): Suma de recargas a SaladCloud fondeadas con utilidades obtenidas de la minería.
Efectivo Cobrado en Banco (USD): Total acreditado por SPEI con estado 'Cobrado en banco'.
Ganancia Neta Realizada en Banco (USD):

$$\text{Ganancia Neta Banco} = \text{Efectivo Cobrado en Banco USD} - \text{Capital Nuevo Aportado USD}$$
ROI Patrimonial Realizado (%):

$$\text{ROI Patrimonial Realizado} = \left( \frac{\text{Ganancia Neta Banco USD}}{\text{Capital Nuevo Aportado USD}} \right) \times 100$$
4. Lógica del Simulador de Comisiones y Punto de Equilibrio
El simulador permite evaluar el impacto de las tarifas en función del Monto del Lote ($M$ en USD) a liquidar.
Fórmulas de Liquidación por Ruta
Ruta A: Kryptex (PRL $\rightarrow$ BTC $\rightarrow$ MXN)
Pérdida por Spread Kryptex ($3.90%$):

$$S_A = M \times 0.0390$$
Saldo pos-spread: $M_1 = M - S_A = 0.9610 \times M$
Menos Tarifa Fija Retiro BTC ($2.50 USD):

$$M_2 = M_1 - 2.50$$
Menos Comisión Bitso BTC/MXN ($0.65%$):

$$\text{Neto USD Ruta A} = M_2 \times (1 - 0.0065) = (0.9610 M - 2.50) \times 0.9935$$
Fricción Total Ruta A:

$$F_A(M) = M - \text{Neto USD Ruta A}$$
Ruta B: PEARL Directa (PRL $\rightarrow$ USDT $\rightarrow$ MXN)
Saldo pos-tarifa red nativa PEARL ($0.01 USD):

$$M_1 = M - 0.01$$
Menos Comisión CoinEx PRL/USDT ($0.20%$):

$$M_2 = M_1 \times (1 - 0.0020) = 0.9980 \times (M - 0.01)$$
Menos Tarifa Fija Retiro TRC20 USDT ($1.00 USD):

$$M_3 = M_2 - 1.00$$
Menos Comisión Bitso USDT/MXN ($0.65%$):

$$\text{Neto USD Ruta B} = M_3 \times (1 - 0.0065) = [0.9980(M - 0.01) - 1.00] \times 0.9935$$
Fricción Total Ruta B:

$$F_B(M) = M - \text{Neto USD Ruta B}$$
Punto de Equilibrio (Break-Even Lote USD)
El punto de equilibrio $M_{\text{BE}}$ ocurre cuando la ventaja neta de Ruta B iguala a Ruta A. Debido a que la Ruta B cobra un 0.20% porcentual frente al 3.90% de Kryptex, para cualquier monto por encima del umbral de tarifas fijas ($\approx $40.27 \text{ USD}$), PEARL Directa es numéricamente superior.
5. Especificación de la Interfaz del Dashboard (Módulos UI)
Se recomienda estructurar la interfaz en 5 pestañas/módulos interactivos:
+----------------------------------------------------------------------------------------------------+
|  [Filtro Rango Fechas]   [Filtro Ruta: TODAS/A/B]   [Filtro Organización Salad]   [Estado: ONLINE] |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ MÓDULO 1: PANEL EJECUTIVO DE AUDITORÍA PATRIMONIAL ]                                            |
|  +---------------------+ +---------------------+ +---------------------+ +--------------------+  |
|  | Capital Nuevo (USD) | | Reinversión (USD)   | | Cobrado Banco (USD) | | ROI Patrimonial %  |  |
|  | $X,XXX.XX           | | $X,XXX.XX           | | $X,XXX.XX           | | +XX.X%             |  |
|  +---------------------+ +---------------------+ +---------------------+ +--------------------+  |
|                                                                                                    |
|  [ MÓDULO 2: COMPARADOR ESTRATÉGICO A/B (Kryptex vs. PEARL Directa) ]                             |
|  +-------------------------------------------------+ +------------------------------------------+  |
|  | Tabla Consolidada de Métricas Normalizadas      | | Gráfico: Rendimiento Neto por TH*h ($)  |  |
|  | (Sesiones, $TH*h$, Costo, Bruto, Neto, Fricción)  | | [Barra Ruta A] vs [Barra Ruta B]       |  |
|  +-------------------------------------------------+ +------------------------------------------+  |
|                                                                                                    |
|  [ MÓDULO 3: SALADCLOUD ACCOUNTS & PRORRATEO ]                                                    |
|  +----------------------------------------------------------------------------------------------+  |
|  | Tabla Cuentas Facturación | Crédito Disponible | Consumo GPU | Status Cuentas | % Consumido   |  |
|  +----------------------------------------------------------------------------------------------+  |
|                                                                                                    |
|  [ MÓDULO 4: SIMULADOR INTERACTIVO DE COMISIONES ]                                                 |
|  +----------------------------------------------------------------------------------------------+  |
|  | Slider Monto A Simular: [$50 USD]                                                            |  |
|  | Resultado: Ruta A Neto $45.25 USD (9.49% Fricción) vs Ruta B Neto $48.57 USD (2.86% Fricción) |  |
|  | Veredicto: GANA PEARL DIRECTA (+ $3.32 USD)                                                  |  |
|  +----------------------------------------------------------------------------------------------+  |
|                                                                                                    |
|  [ MÓDULO 5: CALCULADORA DE INFRAESTRUCTURA Y FLOTILLAS GPU ]                                     |
|  +----------------------------------------------------------------------------------------------+  |
|  | Selector GPU (RTX 5090, 4090, etc.) | TH/s | Ganancia 1 GPU/24h | Flotillas (5, 10, 20 GPUs)   |  |
|  +----------------------------------------------------------------------------------------------+  |
+----------------------------------------------------------------------------------------------------+
6. Recomendaciones de Implementación Técnica (Stack Sugerido)
Backend / API: Node.js (NestJS / Express) o Python (FastAPI).
Base de Datos: PostgreSQL con consultas preparadas para cálculos agregados.
Frontend: React / Next.js con Tailwind CSS para el diseño UI.
Librería de Gráficos: Recharts, Chart.js o Altair.
Trabajos Programados (Cron Jobs):
Sincronización cada 15 minutos de Precios Spot (API CoinGecko / CoinEx / Bitso).
Sincronización diaria del Tipo de Cambio USD/MXN (API Banxico / DOF).
Resumen de Salidas Esperadas en el Dashboard
Indicador de Estado de Conciliación: Alerta visual que avise si existe diferencia entre el efectivo cobrado en banco y la suma de liquidaciones registradas.
Veredicto Automático A/B: Recomendación en tiempo real basada en datos reales recopilados (ejemplo: "PEARL Directa ofrece un +20% a 35% neto superior debido a la eliminación del 3.9% de spread oculto en Kryptex").
Punto de Equilibrio Dinámico: Ajuste automático del lote mínimo de liquidación óptimo si cambian las comisiones de red o el gas fee de BTC/TRC20.