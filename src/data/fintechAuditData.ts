import type { FintechAuditData } from '../types/minerx';

/**
 * Datos de Auditoría Contable y Conciliación Financiera
 * Extraídos directamente de: Ciclos_de_minado_PERL.xlsx
 *
 * Mapeo oficial:
 * - Hojas 'Resumen', 'AUDITORIA_Y_DASHBOARD', 'Ciclos', 'Salad Accounts', 'Cobros'
 */
export const INITIAL_FINTECH_AUDIT: FintechAuditData = {
  capitalBolsilloUSD: 131.65,
  capitalBolsilloMXN: 2536.72,
  efectivoCobradoBancoMXN: 2619.62,
  gananciaNetaRealizadaMXN: 82.90,
  roiRealBolsilloPct: 3.27,
  capitalReinvertidoUSD: 33.00,
  capitalReinvertidoMXN: 638.15,
  criptoEnCarteraMXN: 852.64,
  gananciaTotalEstimadaMXN: 935.54,
  roiTotalEstimadoPct: 36.88,
  costoTotalSaladUSD: 154.91,
  costoTotalSaladMXN: 2900.87,
  saldoCreditoSaladUSD: 4.50,
  tipoCambioUSDMXN: 18.73,
  operacionesLiquidadasBanco: 2,
  friccionFinancieraUSD: 6.86,
  rutas: {
    kryptexBtc: {
      nombre: 'Kryptex (BTC) → Binance → SPEI Banco',
      gastoGpuUSD: 87.64,
      recompensasGeneradasBTC: 0.00286662,
      retiradoBTC: 0.0019758,
      recibidoBinanceBTC: 0.00138619,
      usdtNetos: 115.85,
      cobradoBancoMXN: 2084.61,
      estado: 'CONCILIADO Y COBRADO'
    },
    pearlDirecta: {
      nombre: 'PEARL Directa → Wallet → Exchange → USDT → Binance',
      gastoGpuUSD: 25.46,
      recompensasGeneradasPRL: 17.9884,
      retiradoPRL: 17.4312,
      recibidoBinanceUSDT: 29.05,
      cobradoBancoMXN: 535.01,
      criptoEnCarteraMXN: 852.64,
      estado: 'MUESTRA TEMPRANA (3 CICLOS)'
    }
  },
  ciclosHistoricos: [
    {
      id: 'CICLO-001',
      startTime: '2026-03-24 01:00',
      endTime: '2026-03-24 05:50',
      initialGpuCostUSD: 21.00,
      finalGpuCostUSD: 14.92,
      initialCrypto: 0.00004532,
      finalCrypto: 0.00012426,
      currency: 'BTC',
      yieldUSD: 11.20,
      netProfitUSD: 5.12,
      roiPct: 84.2
    },
    {
      id: 'CICLO-002',
      startTime: '2026-03-24 06:10',
      endTime: '2026-03-24 10:30',
      initialGpuCostUSD: 14.92,
      finalGpuCostUSD: 13.31,
      initialCrypto: 0.00012342,
      finalCrypto: 0.00014193,
      currency: 'BTC',
      yieldUSD: 2.85,
      netProfitUSD: 1.24,
      roiPct: 77.0
    },
    {
      id: 'CICLO-003',
      startTime: '2026-03-24 19:05',
      endTime: '2026-03-24 20:05',
      initialGpuCostUSD: 13.31,
      finalGpuCostUSD: 12.68,
      initialCrypto: 0.00002307,
      finalCrypto: 0.00003312,
      currency: 'BTC',
      yieldUSD: 1.62,
      netProfitUSD: 0.99,
      roiPct: 157.1
    },
    {
      id: 'CICLO-004',
      startTime: '2026-03-25 00:42',
      endTime: '2026-03-25 02:08',
      initialGpuCostUSD: 12.68,
      finalGpuCostUSD: 11.76,
      initialCrypto: 0.00003312,
      finalCrypto: 0.00004856,
      currency: 'BTC',
      yieldUSD: 1.94,
      netProfitUSD: 1.02,
      roiPct: 110.8
    },
    {
      id: 'CICLO-005',
      startTime: '2026-03-25 03:37',
      endTime: '2026-03-25 08:00',
      initialGpuCostUSD: 11.76,
      finalGpuCostUSD: 9.26,
      initialCrypto: 0.00004856,
      finalCrypto: 0.00008878,
      currency: 'BTC',
      yieldUSD: 5.48,
      netProfitUSD: 2.98,
      roiPct: 119.2
    },
    {
      id: 'CICLO-006',
      startTime: '2026-03-25 10:02',
      endTime: '2026-03-25 22:40',
      initialGpuCostUSD: 9.26,
      finalGpuCostUSD: 0.00,
      initialCrypto: 0.00008878,
      finalCrypto: 0.00023612,
      currency: 'BTC',
      yieldUSD: 18.25,
      netProfitUSD: 8.99,
      roiPct: 97.1
    },
    {
      id: 'CICLO-007',
      startTime: '2026-03-26 10:41',
      endTime: '2026-03-26 18:20',
      initialGpuCostUSD: 59.84,
      finalGpuCostUSD: 47.45,
      initialCrypto: 0.00000249,
      finalCrypto: 0.00017058,
      currency: 'BTC',
      yieldUSD: 21.40,
      netProfitUSD: 9.01,
      roiPct: 72.7
    }
  ]
};
