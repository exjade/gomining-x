export type NavItem = { label: string; path: string; icon: string }
export type NavGroup = { label: string; items: NavItem[] }
export type ScreenDefinition = {
  title: string
  eyebrow: string
  description: string
  icon: string
  group: string
  action?: string
  mode: 'dashboard' | 'collection' | 'table' | 'form' | 'catalog' | 'governance' | 'article' | 'generic' | 'operator'
  observed?: boolean
  columns?: string[]
}

export const rafflePath = '/raffle/036a5b85-4b51-471b-b639-2ffb9afba920'

export const navGroups: NavGroup[] = [
  {
    label: 'Panel',
    items: [
      { label: 'Inicio', path: '/home', icon: '⌂' },
      { label: 'Mineros', path: '/nft-miners', icon: '▦' },
      { label: 'Recompensas', path: '/nft-rewards/solo', icon: '✦' },
      { label: 'Miner Wars', path: '/miner-wars', icon: '♜' },
    ],
  },
  {
    label: 'Explorar',
    items: [
      { label: 'Marketplace', path: '/marketplace', icon: '◈' },
      { label: 'Colección GoMiners', path: '/gominers-collection', icon: '▧' },
      { label: 'Viajes', path: '/travel', icon: '✈' },
      { label: 'Mercancía', path: '/shop', icon: '▤' },
      { label: 'Vender NFT', path: '/nft-sell', icon: '↗' },
      { label: 'Launchpad', path: '/launchpad', icon: '✧' },
    ],
  },
  {
    label: 'Tokenómica',
    items: [
      { label: 'Comprar GOMINING', path: '/buy/GOMINING', icon: '◉' },
      { label: 'Liquidez', path: '/liquidity', icon: '⟲' },
      { label: 'Tokenómica ve', path: '/ve-tokenomics', icon: '◇' },
      { label: 'Mi bloqueo', path: '/lock/ve-my-lock', icon: '▣' },
      { label: 'Votación', path: '/lock/ve-voting', icon: '☑' },
      { label: 'Conectar wallet', path: '/gmt-wallets', icon: '◌' },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { label: 'Saldo demo', path: '/finance/wallets/virtual', icon: '$' },
      { label: 'Transacciones', path: '/finance/wallets/virtual/GOMINING/transactions', icon: '↕' },
      { label: 'Tarjetas', path: '/finance/banking-cards', icon: '▭' },
      { label: 'Fondos instantáneos', path: '/finance/instant-funds', icon: '⚡' },
      { label: 'Simple Earn', path: '/finance/simple-earn', icon: '◒' },
      { label: 'Resumen de Earn', path: '/finance/simple-earn/overview', icon: '▥' },
      { label: 'Economía de la operación', path: '/operator-economics', icon: '∑' },
      { label: 'Comprar', path: '/buy', icon: '＋' },
      { label: 'Depositar', path: '/deposit', icon: '↓' },
      { label: 'Retirar', path: '/withdraw/GOMINING', icon: '↑' },
    ],
  },
  {
    label: 'Promociones',
    items: [
      { label: 'Promos', path: '/promos', icon: '✦' },
      { label: 'Rifas', path: '/raffles', icon: '🎟' },
      { label: 'Ofertas', path: '/offers', icon: '％' },
      { label: 'GoBoxes', path: '/goboxes', icon: '▣' },
      { label: 'Minero bonus', path: '/bonus-miner-v3', icon: '▧' },
      { label: 'Platinum+', path: '/subscriptions?subscriptionType=platinum', icon: '✧' },
    ],
  },
  {
    label: 'Comunidad',
    items: [
      { label: 'Ranking de mineros', path: '/leaderboard/nft', icon: '♜' },
      { label: 'Rareza', path: '/leaderboard/nft-rarity', icon: '✣' },
      { label: 'Solo Mining', path: '/leaderboard/solo-mining', icon: '♧' },
      { label: 'Liquidez', path: '/leaderboard/liquidity', icon: '▤' },
      { label: 'Carrera de nuevos referidos', path: rafflePath, icon: '◎' },
      { label: 'Referidos', path: '/nft-referral', icon: '♧' },
      { label: 'Data centers', path: '/data-centers', icon: '▦' },
    ],
  },
  {
    label: 'Academia',
    items: [
      { label: 'Academy', path: '/academy', icon: '▤' },
      { label: 'Bitcoin y minería', path: '/academy/courses/bitcoin-and-mining', icon: '₿' },
      { label: 'Blockchain y cripto', path: '/academy/courses/blockchain-and-crypto-course', icon: '◇' },
      { label: 'Fundamentos GoMining', path: '/academy/courses/gomining-basics-course', icon: '◈' },
      { label: 'Configurar 2FA', path: '/blog/how-to-set-up-2fa', icon: '⌑' },
      { label: 'Retirar recompensas', path: '/blog/how-to-withdraw-rewards-safely', icon: '↗' },
    ],
  },
  {
    label: 'Cuenta',
    items: [{ label: 'Perfil', path: '/profile', icon: '◉' }],
  },
]

const definition = (
  title: string,
  eyebrow: string,
  description: string,
  icon: string,
  group: string,
  mode: ScreenDefinition['mode'] = 'generic',
  action?: string,
  observed = false,
  columns?: string[],
): ScreenDefinition => ({ title, eyebrow, description, icon, group, mode, action, observed, columns })

export const screens: Record<string, ScreenDefinition> = {
  '/home': definition('Panel', 'TU ESPACIO GOMINING', 'Resumen de tu actividad y accesos frecuentes.', '⌂', 'Panel', 'dashboard', undefined, true),
  '/nft-miners': definition('Mineros', 'MINEROS DIGITALES', 'Administra y explora tus mineros digitales.', '▦', 'Panel', 'collection', 'Crear minero', true),
  '/nft-rewards': definition('Recompensas', 'MINERÍA', 'Consulta la actividad y las recompensas de minería.', '✦', 'Panel', 'table', 'Reclamar recompensas'),
  '/nft-rewards/solo': definition('Minería', 'RECOMPENSAS', 'Consulta el área de minería y sus ajustes de recompensas.', '✦', 'Panel', 'generic', 'Ajustes de las recompensas', true),
  '/nft-rewards/pool': definition('Miner Wars', 'RECOMPENSAS', 'Consulta el área de Miner Wars.', '♜', 'Panel', 'generic', undefined, true),
  '/miner-wars': definition('Miner Wars', 'COMUNIDAD', 'Explora el área de Miner Wars.', '♜', 'Comunidad', 'generic'),
  '/marketplace': definition('Mineros', 'MARKETPLACE', 'Explora mineros digitales disponibles en el marketplace.', '◈', 'Explorar', 'catalog'),
  '/gominers-collection': definition('Colección GoMiners', 'COLECCIÓN', 'Explora la colección GoMiners.', '▧', 'Explorar', 'catalog', 'Ver colección'),
  '/travel': definition('Viajes', 'BENEFICIOS', 'Viajes y experiencias disponibles para la comunidad.', '✈', 'Explorar', 'catalog', undefined, true),
  '/shop': definition('Mercancía', 'TIENDA', 'Explora la mercancía de GoMining.', '▤', 'Explorar', 'catalog', 'Filtros', true),
  '/nft-sell': definition('Vender NFT', 'MARKETPLACE', 'Prepara un anuncio para un activo digital.', '↗', 'Explorar', 'form', 'Crear anuncio'),
  '/launchpad': definition('Launchpad', 'PROYECTOS', 'Consulta el estado de las campañas de preventa.', '✧', 'Explorar', 'catalog'),
  '/buy/GOMINING': definition('Comprar GOMINING', 'TOKEN', 'Consulta las opciones para adquirir GOMINING.', '◉', 'Tokenómica', 'form', 'Continuar'),
  '/liquidity': definition('Liquidez', 'TOKENÓMICA', 'Información y opciones de liquidez.', '⟲', 'Tokenómica', 'generic', 'Añadir liquidez'),
  '/ve-tokenomics': definition('veGOMINING', 'TOKENÓMICA', 'Información sobre veGOMINING y gobernanza.', '◇', 'Tokenómica', 'governance', 'Bloquear GOMINING'),
  '/lock/ve-my-lock': definition('Mi bloqueo', 'VEGOMINING', 'Consulta tus bloqueos y recompensas de gobernanza.', '▣', 'Tokenómica', 'table', 'Obtener votos', true, ['Fecha', 'Bloqueado', 'Fin', 'Votos', 'Recompensas', 'Dirección', 'Estado']),
  '/lock/ve-voting': definition('Votación', 'VEGOMINING', 'Consulta las propuestas de gobernanza.', '☑', 'Tokenómica', 'governance', 'Participar en una votación'),
  '/gmt-wallets': definition('Conectar wallet', 'CONEXIÓN', 'Conecta una cartera para identificar la cuenta y la red.', '◌', 'Tokenómica', 'collection'),
  '/finance/wallets/virtual': definition('Saldo demo', 'FINANZAS · LOCAL', 'Resumen del saldo local de demostración.', '$', 'Finanzas', 'dashboard', 'Recargar', true),
  '/finance/wallets/virtual/GOMINING/transactions': definition('Transacciones', 'CARTERA · GOMINING', 'Historial de movimientos de la cartera.', '↕', 'Finanzas', 'table', undefined, false, ['Fecha', 'Tipo', 'Activo', 'Estado']),
  '/finance/banking-cards': definition('Tarjetas', 'FINANZAS', 'Gestiona las tarjetas disponibles en tu cuenta.', '▭', 'Finanzas', 'collection', 'Crear tarjeta Visa'),
  '/finance/instant-funds': definition('Instant Funds', 'FINANZAS', 'Consulta las opciones de fondos instantáneos.', '⚡', 'Finanzas', 'catalog', 'Continuar'),
  '/finance/simple-earn': definition('Simple Earn', 'FINANZAS', 'Explora productos de rendimiento.', '◒', 'Finanzas', 'catalog', 'Ver productos'),
  '/finance/simple-earn/overview': definition('Resumen de Earn', 'FINANZAS', 'Consulta posiciones y actividad de Simple Earn.', '▥', 'Finanzas', 'table', undefined, false, ['Activo', 'Producto', 'Rendimiento', 'Estado']),
  '/operator-economics': definition('Economía de la operación', 'INGRESOS Y COSTOS', 'Calcula márgenes mensuales con los datos de operación que proporciones.', '∑', 'Finanzas', 'operator'),
  '/buy': definition('Comprar', 'FINANZAS', 'Elige un activo para continuar con una compra simulada.', '＋', 'Finanzas', 'form', 'Continuar'),
  '/deposit': definition('Depositar', 'FINANZAS', 'Consulta los pasos de depósito disponibles.', '↓', 'Finanzas', 'form', 'Mostrar instrucciones'),
  '/withdraw/GOMINING': definition('Retirar GOMINING', 'FINANZAS', 'Revisa el flujo de retiro en modo de demostración.', '↑', 'Finanzas', 'form', 'Continuar retiro'),
  '/promos': definition('Promos', 'BENEFICIOS', 'Explora las promociones disponibles.', '✦', 'Promociones', 'catalog'),
  '/raffles': definition('Rifas', 'BENEFICIOS', 'Explora rifas y campañas.', '🎟', 'Promociones', 'catalog'),
  [rafflePath]: definition('Rifa', 'BENEFICIOS', 'Detalle de una rifa destacada.', '◎', 'Promociones', 'generic'),
  '/offers': definition('Ofertas', 'BENEFICIOS', 'Explora las ofertas disponibles.', '％', 'Promociones', 'catalog'),
  '/goboxes': definition('GoBoxes', 'BENEFICIOS', 'Explora las cajas disponibles.', '▣', 'Promociones', 'catalog', 'Abrir GoBox'),
  '/bonus-miner-v3': definition('Minero bonus', 'BENEFICIOS', 'Consulta las tareas y beneficios del minero bonus.', '▧', 'Promociones', 'collection', 'Ver tareas'),
  '/subscriptions': definition('Suscripciones', 'PLANES', 'Compara los planes propuestos para minería.', '✧', 'Promociones', 'catalog', undefined, true),
  '/leaderboard/nft': definition('Ranking de mineros', 'COMUNIDAD', 'Clasificación de mineros digitales.', '♜', 'Comunidad', 'table', undefined, false, ['Posición', 'Mineros', 'Potencia']),
  '/leaderboard/nft-rarity': definition('Rareza', 'COMUNIDAD', 'Clasificación por rareza de activos.', '✣', 'Comunidad', 'table', undefined, false, ['Posición', 'Colección', 'Rareza']),
  '/leaderboard/solo-mining': definition('Solo Mining', 'COMUNIDAD', 'Clasificación de Solo Mining.', '♧', 'Comunidad', 'table', undefined, false, ['Posición', 'Participante', 'Estado']),
  '/leaderboard/liquidity': definition('Ranking de liquidez', 'COMUNIDAD', 'Clasificación de liquidez.', '▤', 'Comunidad', 'table', undefined, false, ['Posición', 'Participante', 'Liquidez']),
  '/profile': definition('Perfil', 'CUENTA', 'Preferencias y datos del perfil.', '◉', 'Cuenta', 'collection', 'Editar perfil'),
  '/nft-referral': definition('Referidos', 'COMUNIDAD', 'Consulta los recursos de invitación.', '♧', 'Comunidad', 'collection', 'Compartir invitación', true),
  '/nft-referral/rewards': definition('Royalties de referidos', 'REFERIDOS · RECOMPENSAS', 'Consulta las categorías de regalías y su estado.', '♧', 'Comunidad', 'table', undefined, true, ['Categoría', 'Tu participación', 'Recibido']),
  '/nft-referral/friends': definition('Mis amigos', 'REFERIDOS · AMIGOS', 'Consulta la actividad agregada de tus referidos.', '♧', 'Comunidad', 'table', undefined, false, ['Amigo', 'Nivel', 'Actividad', 'Estado']),
  '/data-centers': definition('Trazabilidad de minería', 'MINERÍA', 'Consulta pool, mineros activos, granjas y operaciones.', '▦', 'Comunidad', 'catalog'),
  '/data-centers/pool': definition('Pool PRL · Kryptex', 'TRAZABILIDAD · PEARL', 'Estimación pública del ingreso minero y enlaces al perfil de pool.', '◉', 'Comunidad', 'catalog'),
  '/data-centers/operations': definition('Operaciones del pool', 'TRAZABILIDAD · KRYPTEX / PEARL', 'Historial público de pagos de Kryptex PRL con enlaces a transacciones Pearl.', '↕', 'Comunidad', 'table'),
  '/data-centers/miners': definition('Mineros y workers', 'TRAZABILIDAD · LOCAL', 'Administra workers de demostración y su activación local; no están conectados al pool.', '▦', 'Comunidad', 'table'),
  '/data-centers/farms': definition('Granjas', 'TRAZABILIDAD · PENDIENTE', 'No hay datos de granjas del operador expuestos en las fuentes consultadas.', '▦', 'Comunidad', 'table'),
  '/academy': definition('GoMining Academy', 'ACADEMIA', 'Aprende sobre Bitcoin, minería y GoMining.', '▤', 'Academia', 'catalog'),
  '/academy/courses/bitcoin-and-mining': definition('Bitcoin y minería', 'ACADEMIA · CURSO', 'Contenido educativo sobre Bitcoin y minería.', '₿', 'Academia', 'article'),
  '/academy/courses/blockchain-and-crypto-course': definition('Blockchain y cripto', 'ACADEMIA · CURSO', 'Contenido educativo sobre blockchain y criptoactivos.', '◇', 'Academia', 'article'),
  '/academy/courses/gomining-basics-course': definition('Fundamentos GoMining', 'ACADEMIA · CURSO', 'Contenido educativo sobre la plataforma GoMining.', '◈', 'Academia', 'article'),
  '/blog/how-to-set-up-2fa': definition('Configurar la autenticación de dos factores', 'CENTRO DE AYUDA', 'Guía informativa. Los enlaces a soporte son externos.', '⌑', 'Academia', 'article'),
  '/blog/how-to-withdraw-rewards-safely': definition('Retirar recompensas de forma segura', 'CENTRO DE AYUDA', 'Guía informativa. Los enlaces a soporte son externos.', '↗', 'Academia', 'article'),
}

export function getScreen(pathname: string): ScreenDefinition | undefined {
  return screens[pathname]
}
