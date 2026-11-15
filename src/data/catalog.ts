// PouwMiner Catalog Data
// Source: CONTEXTO-RECUPERACION.md & Directiva Roman
// Regla: 120 TH/s genera aprox 2.30 USD al día (~23 PEARL a $0.10/PEARL).
// Tasa de liquidación: 0.019167 USD/TH/día

export type MinerPlan = {
  id: string;
  label: string;
  powerTh: number;
  price: number;
  currency: 'USD';
  usdPerDay: number;
  pearlPerDay: number;
  limitUnits?: number;
  isPresale?: boolean;
  badge?: string;
  launchPrice?: number;
  launchPowerTh?: number;
};

export const DAILY_USD_PER_TH = 2.30 / 120; // 0.01916667 USD per TH per day (Benchmark: 120 TH/s = ~$2.30 USD/d)
export const PEARL_PRICE_USD = 0.10; // $0.10 USD per PEARL
export const DAILY_PEARL_PER_TH = DAILY_USD_PER_TH / PEARL_PRICE_USD; // ~0.191667 PEARL per TH per day

export const CATALOG_OBSERVED_AT = '2026-11-15T00:00:00Z';

// PREVENTA OFICIAL NOTION (Requeriments-40f3bbe9d59f8070af5eef675ea8870f)
// 4 niveles exclusivos de prelanzamiento limitados a 30 unidades cada uno
export const presalePlans: MinerPlan[] = [
  {
    id: 'presale-1',
    label: '1.46 TH/s',
    powerTh: 1.46,
    price: 18.99,
    currency: 'USD',
    usdPerDay: 1.46 * DAILY_USD_PER_TH, // ~$0.028/d
    pearlPerDay: 1.46 * DAILY_PEARL_PER_TH, // ~0.28 PEARL/d
    limitUnits: 30,
    isPresale: true,
    launchPrice: 49.99,
    launchPowerTh: 2.5,
  },
  {
    id: 'presale-2',
    label: '8.33 TH/s',
    powerTh: 8.33,
    price: 99.99,
    currency: 'USD',
    usdPerDay: 8.33 * DAILY_USD_PER_TH, // ~$0.16/d
    pearlPerDay: 8.33 * DAILY_PEARL_PER_TH, // ~1.60 PEARL/d
    limitUnits: 30,
    isPresale: true,
    launchPrice: 199.99,
    launchPowerTh: 12.0,
  },
  {
    id: 'presale-3',
    label: '21.05 TH/s',
    powerTh: 21.05,
    price: 249.99,
    currency: 'USD',
    usdPerDay: 21.05 * DAILY_USD_PER_TH, // ~$0.40/d
    pearlPerDay: 21.05 * DAILY_PEARL_PER_TH, // ~4.03 PEARL/d
    limitUnits: 30,
    isPresale: true,
    badge: 'Popular',
    launchPrice: 499.99,
    launchPowerTh: 30.0,
  },
  {
    id: 'presale-4',
    label: '42.44 TH/s',
    powerTh: 42.44,
    price: 499.99,
    currency: 'USD',
    usdPerDay: 42.44 * DAILY_USD_PER_TH, // ~$0.81/d
    pearlPerDay: 42.44 * DAILY_PEARL_PER_TH, // ~8.13 PEARL/d
    limitUnits: 30,
    isPresale: true,
    launchPrice: 899.99,
    launchPowerTh: 64.0,
  },
];

// Membresías PouwMiner según especificación de Notion (Modelo-de-suscripciones-1)
export type MembershipPlan = {
  id: string;
  name: string;
  priceQuarterly: number; // USDT
  priceAnnual: number; // USDT (con 15% de ahorro)
  badge?: string;
  maintenanceDiscount: string; // Descuento en tarifa de mantenimiento
  powerBoost: string; // Beneficio mensual de potencia
  withdrawalSpeed: string; // Procesamiento de retiros
  analytics: string;
  wallets: string;
  highlight?: boolean;
};

export const membershipPlans: MembershipPlan[] = [
  {
    id: 'explorer',
    name: 'Explorer',
    priceQuarterly: 0,
    priceAnnual: 0,
    maintenanceDiscount: '0%',
    powerBoost: 'Estándar',
    withdrawalSpeed: 'Estándar (SLA Base)',
    analytics: 'Dashboard Básico',
    wallets: 'Múltiples Wallets',
  },
  {
    id: 'starter',
    name: 'Starter',
    priceQuarterly: 30,
    priceAnnual: 102, // 15% ahorro
    badge: 'Starter',
    maintenanceDiscount: '5% Descuento',
    powerBoost: '+1% Potencia Boost',
    withdrawalSpeed: 'Estándar (SLA + Pool)',
    analytics: 'Dashboard & Referidos Avanzado',
    wallets: 'Múltiples Wallets + Alertas',
  },
  {
    id: 'pro',
    name: 'Pro VIP',
    priceQuarterly: 90,
    priceAnnual: 306, // 15% ahorro (25.5 USDT/mes)
    badge: 'Pro VIP',
    maintenanceDiscount: '10% Descuento',
    powerBoost: '+2% Potencia Boost',
    withdrawalSpeed: 'Prioritario Express (SLA Dedicado)',
    analytics: 'Analítica Institucional en Tiempo Real',
    wallets: 'Prioridad Multi-chain & Web3 VIP',
    highlight: true,
  },
];

// LANZAMIENTO — referencia de rango completo
export const launchRange = {
  minPrice: 119,
  maxPrice: 54768.99,
  minTh: 10,
  maxTh: 5000,
};

// ROADMAP — 9 fases SCRUM-252
export type RoadmapPhase = {
  id: string;
  number: number;
  title: string;
  description: string;
  details: string[];
  status: 'completed' | 'in-progress' | 'upcoming';
  badge?: 'AHORA' | 'PRÓXIMO GRAN HITO';
  jiraRef?: string;
};

export const roadmapPhases: RoadmapPhase[] = [
  {
    id: 'phase-1',
    number: 1,
    title: 'Foundation',
    description: 'Catálogo de mineros en la nube, compra Web3, seguridad y operación base.',
    details: [
      'Catálogo de hashrate institucional en la nube (10 TH/s a 5,000 TH/s)',
      'Flujo de compra con pagos cripto Web3 (USDT, USDC, SOL)',
      'Seguridad: autenticación, TOTP, gestión de sesiones',
      'Operación de hashrate y distribución diaria de recompensas en PEARL',
      'Infraestructura base del dashboard de usuario',
    ],
    status: 'completed',
    badge: 'AHORA',
    jiraRef: 'SCRUM-252-PH1',
  },
  {
    id: 'phase-2',
    number: 2,
    title: 'Enhanced Mining Experience',
    description: 'Personalización de mineros, dinámicas operativas y analítica en vivo.',
    details: [
      'Visualización 3D interactiva de telemetría de minado',
      'Boosts temporales de potencia (+1% y +2% según membresía)',
      'Telemetría de centros de datos hidroeléctricos (temperatura, W/TH)',
      'Módulo de reinversión automática de hashrate',
    ],
    status: 'in-progress',
    badge: 'PRÓXIMO GRAN HITO',
    jiraRef: 'SCRUM-252-PH2',
  },
  {
    id: 'phase-3',
    number: 3,
    title: 'Referral & Social System',
    description: 'Programa de referidos multinivel Unilevel y recompensas de comunidad.',
    details: [
      'Estructura Unilevel con seguimiento en tiempo real',
      'Comisiones pagadas automáticamente en tokens PEARL',
      'Tablas de clasificación de hashrate por países',
    ],
    status: 'upcoming',
    jiraRef: 'SCRUM-252-PH3',
  },
  {
    id: 'phase-4',
    number: 4,
    title: 'PoUW AI Compute Expansion',
    description: 'Conexión del hashrate a clústeres de inferencia de IA institucional.',
    details: [
      'Aceleración de cargas de trabajo de IA en los centros de datos',
      'Doble dividendo: minería tradicional + venta de cómputo a laboratorios',
      'Métricas de utilización de silicio 3nm en tiempo real',
    ],
    status: 'upcoming',
    jiraRef: 'SCRUM-252-PH4',
  },
];
