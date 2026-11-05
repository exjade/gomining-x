export type PaymentNetworkId = 'bnb' | 'ethereum' | 'polygon' | 'solana'
export const paymentNetworkIds: PaymentNetworkId[] = ['bnb', 'ethereum', 'polygon', 'solana']

export function isPaymentNetworkId(value: string | null): value is PaymentNetworkId {
  return value !== null && (paymentNetworkIds as string[]).includes(value)
}

export const DEFAULT_EVM_RECEIVER = '0x37180AB735f6485694668044df322530eC933287'
export const DEFAULT_SOLANA_RECEIVER = 'bZJ38AysbUzwB2MCkaJrsvgpooEE5bjVjzJc5heXogk'

export function getReceiverAddress(networkId: PaymentNetworkId): string {
  if (networkId === 'solana') {
    return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RECEIVER_SOLANA_ADDRESS) || DEFAULT_SOLANA_RECEIVER
  }
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RECEIVER_EVM_ADDRESS) || DEFAULT_EVM_RECEIVER
}

export type UsdtContractInfo = {
  address: string
  decimals: number
}

export const USDT_CONTRACTS: Record<PaymentNetworkId, UsdtContractInfo> = {
  bnb: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  ethereum: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  polygon: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
  solana: { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
}

export const SOLANA_USDT_MINT = USDT_CONTRACTS.solana.address

export type PaymentDestination = {
  id: PaymentNetworkId
  name: string
  chainId: number
  assetHint: string
  address: string
  receiveLabel: string
  eta: string
  blockExplorer: string
}

export const PAYMENT_DESTINATIONS: PaymentDestination[] = [
  {
    id: 'bnb',
    name: 'BNB Chain',
    chainId: 56,
    assetHint: 'BNB o USDT (BEP-20)',
    address: getReceiverAddress('bnb'),
    receiveLabel: 'Pago directo en BNB Smart Chain',
    eta: 'Aprox. 3 segundos en BSC.',
    blockExplorer: 'https://bscscan.com',
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    chainId: 1,
    assetHint: 'ETH o USDT (ERC-20)',
    address: getReceiverAddress('ethereum'),
    receiveLabel: 'Pago directo en Ethereum',
    eta: 'Aprox. 12 segundos en Ethereum.',
    blockExplorer: 'https://etherscan.io',
  },
  {
    id: 'polygon',
    name: 'Polygon',
    chainId: 137,
    assetHint: 'POL o USDT',
    address: getReceiverAddress('polygon'),
    receiveLabel: 'Pago directo en Polygon',
    eta: 'Aprox. 2 segundos en Polygon.',
    blockExplorer: 'https://polygonscan.com',
  },
  {
    id: 'solana',
    name: 'Solana',
    chainId: 0,
    assetHint: 'SOL o USDT (SPL)',
    address: getReceiverAddress('solana'),
    receiveLabel: 'Pago directo en Solana Mainnet',
    eta: 'Aprox. 1 segundo en Solana.',
    blockExplorer: 'https://solscan.io',
  },
]
