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
