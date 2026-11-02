export type DemoProduct = {
  id: string
  category: string
  title: string
  description: string
  price: number
  icon: string
  fulfillment: string
  powerTh?: number
}

export type CartLine = { productId: string; quantity: number }

export type DemoOrder = {
  id: string
  items: Array<{ product: DemoProduct; quantity: number }>
  total: number
  createdAt: string
}

// Amounts are synthetic UI data so that the local cart and checkout can be exercised.
// They do not represent GoMining listings, offers, quotes, or account balances.
export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 'miner-entry',
    category: 'Mineros digitales',
    title: 'Minero digital · Esencial',
    description: 'Producto de muestra para recorrer el flujo de compra local.',
    price: 149,
    icon: '▧',
    powerTh: 1.12,
    fulfillment: 'Activo digital de ejemplo; no se crea un NFT real.',
  },
  {
    id: 'miner-plus',
    category: 'Mineros digitales',
    title: 'Minero digital · Plus',
    description: 'Una segunda opción ficticia para probar el carrito.',
    price: 289,
    icon: '◈',
    powerTh: 3.82,
    fulfillment: 'Activo digital de ejemplo; no se crea un NFT real.',
  },
  {
    id: 'gominers-collectible',
    category: 'Colección GoMiners',
    title: 'Coleccionable GoMiners',
    description: 'Artículo ilustrativo de colección, sin activo asociado.',
    price: 39,
    icon: '▧',
    fulfillment: 'Artículo digital de muestra; no se transfiere un coleccionable.',
  },
  {
    id: 'gomining-token-pack',
    category: 'Token GOMINING',
    title: "Paquete de simulación GOMINING",
    description: 'Línea ficticia para probar cantidades y total del pedido.',
    price: 25,
    icon: '◉',
    fulfillment: 'No se emiten ni compran tokens.',
  },
  {
    id: 'travel-experience',
    category: 'Viajes',
    title: 'Experiencia de viaje · Muestra',
    description: 'Producto de ejemplo para la sección Viajes.',
    price: 79,
    icon: '✈',
    fulfillment: 'No se reserva ni se emite ningún viaje.',
  },
  {
    id: 'gomining-merch',
    category: 'Mercancía',
    title: 'Sudadera GoMining · Muestra',
    description: 'Artículo ficticio para probar un producto físico en el carrito.',
    price: 29,
    icon: '▤',
    fulfillment: 'No se recopila dirección y no se envía mercancía.',
  },
  {
    id: 'gobox-sample',
    category: 'GoBoxes',
    title: 'GoBox · Muestra',
    description: 'Caja de ejemplo con contenido no aleatorio.',
    price: 18,
    icon: '▣',
    fulfillment: 'No se abre una caja real ni se entrega un premio.',
  },
  {
    id: 'platinum-month',
    category: 'Suscripciones',
    title: 'Platinum+ · Muestra mensual',
    description: 'Suscripción ficticia para completar el recorrido de compra.',
    price: 9.99,
    icon: '✧',
    fulfillment: 'No se activa una suscripción ni se renueva automáticamente.',
  },
  {
    id: 'launchpad-pass',
    category: 'Launchpad',
    title: "Acceso de simulación Launchpad",
    description: 'Producto de muestra sin proyecto o asignación vinculada.',
    price: 12,
    icon: '✦',
    fulfillment: 'No se participa en una venta de tokens.',
  },
]

const productRoutes: Record<string, string[]> = {
  '/marketplace': ['miner-entry', 'miner-plus'],
  '/nft-miners': ['miner-entry', 'miner-plus'],
  '/gominers-collection': ['gominers-collectible'],
  '/travel': ['travel-experience'],
  '/shop': ['gomining-merch'],
  '/buy/GOMINING': ['gomining-token-pack'],
  '/buy': ['gomining-token-pack'],
  '/goboxes': ['gobox-sample'],
  '/subscriptions': ['platinum-month'],
  '/launchpad': ['launchpad-pass'],
}

export function getProductById(id: string): DemoProduct | undefined {
  return DEMO_PRODUCTS.find((product) => product.id === id)
}

export function getProductsForRoute(pathname: string): DemoProduct[] {
  return (productRoutes[pathname] ?? [])
    .map((id) => getProductById(id))
    .filter((product): product is DemoProduct => product !== undefined)
}

export function getPrimaryPurchaseProduct(pathname: string): DemoProduct | undefined {
  return getProductsForRoute(pathname)[0]
}

