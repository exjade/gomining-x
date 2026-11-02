export type PaymentNetworkId = 'bnb' | 'bitcoin' | 'ethereum' | 'tron' | 'solana' | 'polygon'
const paymentNetworkIds: PaymentNetworkId[] = ['bnb', 'bitcoin', 'ethereum', 'tron', 'solana', 'polygon']

export function isPaymentNetworkId(value: string | null): value is PaymentNetworkId {
  return value !== null && paymentNetworkIds.includes(value as PaymentNetworkId)
}

export type PaymentDestination = {
  id: PaymentNetworkId
  name: string
  assetHint: string
  address: string
  route: 'solflare-bridge' | 'direct-solana'
  receiveLabel: string
  eta: string
}

// Public receiving addresses supplied by the project owner. Verify each
// address/network/USDT pairing inside Solflare Bridge before production use.
export const PAYMENT_DESTINATIONS: PaymentDestination[] = [
  {
    id: 'bnb',
    name: 'BNB Chain',
    assetHint: 'Activo compatible de BNB Chain',
    address: '0x37180AB735f6485694668044df322530eC933287',
    route: 'solflare-bridge',
    receiveLabel: 'USDT en Solana · Solflare Bridge',
    eta: 'Aproximadamente 1 min para redes EVM; puede variar.',
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    assetHint: 'Activo compatible de Bitcoin',
    address: 'bc1q9qhgkr3ez3gf2rpcwk4rhf3jcz662krgd0pan0',
    route: 'solflare-bridge',
    receiveLabel: 'USDT en Solana · Solflare Bridge',
    eta: 'Aproximadamente 14 min; depende de las confirmaciones.',
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    assetHint: 'Activo compatible de Ethereum',
    address: '0x37180AB735f6485694668044df322530eC933287',
    route: 'solflare-bridge',
    receiveLabel: 'USDT en Solana · Solflare Bridge',
    eta: 'Aproximadamente 1 min para redes EVM; puede variar.',
  },
  {
    id: 'tron',
    name: 'Tron',
    assetHint: 'Activo compatible de Tron',
    address: 'TDrhX1YE6ggQGuTr7JJLvZRMi6TBD7EJeR',
    route: 'solflare-bridge',
    receiveLabel: 'USDT en Solana · Solflare Bridge',
    eta: 'Minutos; depende de la red y la liquidez.',
  },
  {
    id: 'solana',
    name: 'Solana · SPL',
    assetHint: 'USDT SPL',
    address: 'bZJ38AysbUzwB2MCkaJrsvgpooEE5bjVjzJc5heXogk',
    route: 'direct-solana',
    receiveLabel: 'USDT SPL directo en Solana',
    eta: 'Según la confirmación de Solana.',
  },
  {
    id: 'polygon',
    name: 'Polygon',
    assetHint: 'Activo compatible de Polygon',
    address: '0x37180AB735f6485694668044df322530eC933287',
    route: 'solflare-bridge',
    receiveLabel: 'USDT en Solana · Solflare Bridge',
    eta: 'Aproximadamente 1 min para redes EVM; puede variar.',
  },
]

export const SOLANA_USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
