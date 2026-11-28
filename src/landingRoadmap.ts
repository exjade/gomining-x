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
    title: 'Preventa',
    description: 'Granja de Minería Unilevel, Referidos Directos y Compra de Mineros con Skin Base gratuita.',
    details: [
      'Granja de Minería Unilevel',
      'Referidos Directos',
      'Compra de Mineros con Skin Base gratuita',
    ],
    status: 'in-progress',
    badge: 'AHORA',
  },
  {
    id: 'phase-2',
    number: 2,
    title: 'Prelanzamiento',
    description: 'Membresías, suscripciones y Customizador de Skins con lógica e interfaz finalizadas.',
    details: [
      'Membresías y Suscripciones',
      'Customizador de Skins (lógica e interfaz finalizadas)',
    ],
    status: 'upcoming',
  },
  {
    id: 'phase-3',
    number: 3,
    title: 'Lanzamiento V1',
    description: 'Cajas Sorpresa PoBoxes, Consolidación V1 y Leaderboards diarios y de granja.',
    details: [
      'Cajas Sorpresa PoBoxes',
      'Consolidación V1',
      'Leaderboards: PoBoxes diaria y Granja/workers',
    ],
    status: 'upcoming',
  },
  {
    id: 'phase-4',
    number: 4,
    title: 'Pos-lanzamiento',
    description: 'Activación competitiva mediante campaña promocional posterior a V1.',
    details: [
      'Battle Miner como campaña promocional (fuera de V1)',
    ],
    status: 'upcoming',
  },
  {
    id: 'phase-5',
    number: 5,
    title: 'Seguridad Transversal',
    description: 'Control criptográfico transversal obligatorio para retiros en toda la plataforma.',
    details: [
      'Confirmación manual obligatoria del usuario en el smart contract al retirar',
    ],
    status: 'upcoming',
  },
];
