export type PaymentNetworkId =
  | 'bnb'
  | 'tron'
  | 'polygon'
  | 'solana'
  | 'arbitrum'
  | 'optimism'
  | 'avalanche'
  | 'ethereum'
export type BackendPaymentNetworkId =
  | 'bsc'
  | 'tron'
  | 'polygon'
  | 'solana'
  | 'arbitrum'
  | 'optimism'
  | 'avalanche'
  | 'ethereum'
export type AnyPaymentNetworkId = PaymentNetworkId | BackendPaymentNetworkId
export type PaymentNetworkMode = 'testnet' | 'mainnet'
export type PaymentNetworkFamily = 'evm' | 'solana' | 'tron'
export type SolanaCluster = 'devnet' | 'mainnet-beta'
export type PaymentCurrency = 'USD'
export type PaymentEnv = Record<string, string | boolean | undefined>

export const paymentNetworkIds: PaymentNetworkId[] = [
  'bnb',
  'tron',
  'polygon',
  'solana',
  'arbitrum',
  'optimism',
  'avalanche',
  'ethereum',
]

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/
const EVM_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const SOLANA_ALL_ONES_PATTERN = /^1+$/
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const DECIMAL_AMOUNT_PATTERN = /^\d+(?:\.\d+)?$/
const POSITIVE_INT_PATTERN = /^\d+$/

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function sha256Sync(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLen)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false)
  view.setUint32(paddedLen - 4, bitLen >>> 0, false)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19
  const w = new Uint32Array(64)

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3)
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = h0; let b = h1; let c = h2; let d = h3
    let e = h4; let f = h5; let g = h6; let h = h7
    for (let i = 0; i < 64; i += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0, false); outView.setUint32(4, h1, false)
  outView.setUint32(8, h2, false); outView.setUint32(12, h3, false)
  outView.setUint32(16, h4, false); outView.setUint32(20, h5, false)
  outView.setUint32(24, h6, false); outView.setUint32(28, h7, false)
  return out
}

function decodeBase58(input: string): Uint8Array | null {
  if (!input) return null
  let leadingZeros = 0
  while (leadingZeros < input.length && input[leadingZeros] === '1') {
    leadingZeros += 1
  }
  let value = 0n
  for (let i = leadingZeros; i < input.length; i += 1) {
    const digit = BASE58_ALPHABET.indexOf(input[i])
    if (digit < 0) return null
    value = value * 58n + BigInt(digit)
  }
  const bytes: number[] = []
  while (value > 0n) {
    bytes.push(Number(value & 0xffn))
    value >>= 8n
  }
  bytes.reverse()
  const out = new Uint8Array(leadingZeros + bytes.length)
  out.set(bytes, leadingZeros)
  return out
}

function decodeValidTronPayload(address: unknown): Uint8Array | null {
  if (typeof address !== 'string') return null
  const trimmed = address.trim()
  if (!trimmed.startsWith('T') || trimmed.length !== 34) return null
  const decoded = decodeBase58(trimmed)
  if (!decoded || decoded.length !== 25 || decoded[0] !== 0x41) return null
  let allZeroBody = true
  for (let i = 1; i < 21; i += 1) {
    if (decoded[i] !== 0) {
      allZeroBody = false
      break
    }
  }
  if (allZeroBody) return null
  const payload = decoded.subarray(0, 21)
  const expected = sha256Sync(sha256Sync(payload))
  for (let i = 0; i < 4; i += 1) {
    if (decoded[21 + i] !== expected[i]) return null
  }
  return payload
}

export class PaymentDestinationError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(`${code}: ${message}`)
    this.name = 'PaymentDestinationError'
    this.code = code
  }
}

function readEnv(env?: PaymentEnv): PaymentEnv {
  if (env !== undefined) return env
  const metaEnv = typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env?: PaymentEnv }).env
    : undefined
  if (metaEnv) return metaEnv
  if (typeof process !== 'undefined' && process.env) return process.env as PaymentEnv
  return {}
}

function readTrimmedEnv(env: PaymentEnv, key: string): string {
  const raw = env[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

function readRpcList(env: PaymentEnv, key: string, fallbacks: readonly string[]): string[] {
  const custom = readTrimmedEnv(env, key)
  if (!custom) return [...fallbacks]
  return [custom, ...fallbacks.filter((url) => url !== custom)]
}

export function isPaymentNetworkId(value: string | null): value is PaymentNetworkId {
  return value !== null && (paymentNetworkIds as string[]).includes(value)
}

export function toBackendPaymentNetworkId(networkId: AnyPaymentNetworkId): BackendPaymentNetworkId {
  return networkId === 'bnb' ? 'bsc' : networkId
}

export function toClientPaymentNetworkId(networkId: AnyPaymentNetworkId): PaymentNetworkId {
  return networkId === 'bsc' ? 'bnb' : networkId
}

export function resolvePaymentNetworkMode(env?: PaymentEnv): PaymentNetworkMode {
  const raw = readEnv(env).VITE_PAYMENT_NETWORK_MODE
  if (raw === undefined || raw === null || String(raw).trim() === '') return 'testnet'
  const normalized = String(raw).trim().toLowerCase()
  if (normalized !== 'testnet' && normalized !== 'mainnet') {
    throw new PaymentDestinationError(
      'INVALID_PAYMENT_NETWORK_MODE',
      `Unsupported VITE_PAYMENT_NETWORK_MODE: "${raw}". Expected "testnet" or "mainnet".`,
    )
  }
  return normalized
}

export function isEthereumPaymentEnabled(env?: PaymentEnv): boolean {
  const raw = readEnv(env).VITE_PAYMENT_ENABLE_ETHEREUM
  return raw === true || String(raw ?? '').trim().toLowerCase() === 'true'
}

export function isValidEvmAddress(address: unknown): boolean {
  if (typeof address !== 'string') return false
  const trimmed = address.trim()
  return EVM_ADDRESS_PATTERN.test(trimmed) && trimmed.toLowerCase() !== EVM_ZERO_ADDRESS
}

export function isValidSolanaAddress(address: unknown): boolean {
  if (typeof address !== 'string') return false
  const trimmed = address.trim()
  return SOLANA_ADDRESS_PATTERN.test(trimmed) && !SOLANA_ALL_ONES_PATTERN.test(trimmed)
}

export function isValidTronAddress(address: unknown): boolean {
  return decodeValidTronPayload(address) !== null
}

export function tronBase58ToHex41(address: string): string {
  const payload = decodeValidTronPayload(address)
  if (!payload) {
    throw new PaymentDestinationError('INVALID_TRON_ADDRESS', 'Invalid TRON Base58Check address.')
  }
  return Array.from(payload, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function requireTreasuryAddress(
  address: string | null | undefined,
  family: PaymentNetworkFamily,
): string {
  const trimmed = typeof address === 'string' ? address.trim() : ''
  if (!trimmed) {
    throw new PaymentDestinationError(
      'TREASURY_ADDRESS_REQUIRED',
      `Missing ${family} treasury destination address from authoritative PaymentIntent.`,
    )
  }
  const valid = family === 'evm'
    ? isValidEvmAddress(trimmed)
    : family === 'tron'
      ? isValidTronAddress(trimmed)
      : isValidSolanaAddress(trimmed)
  if (!valid) {
    throw new PaymentDestinationError(
      'INVALID_TREASURY_ADDRESS',
      `Invalid ${family} treasury destination address.`,
    )
  }
  return trimmed
}

export type EvmChainIdHex = `0x${string}`

export type PaymentNetworkConfig = {
  id: BackendPaymentNetworkId
  clientId: PaymentNetworkId
  family: PaymentNetworkFamily
  mode: PaymentNetworkMode
  name: string
  recommended: boolean
  enabled: boolean
  requiredConfirmations: number
  commitment: 'finalized' | null
  chainId: number | 'solana-devnet' | 'solana-mainnet' | 'tron-nile' | 'tron-mainnet'
  chainIdHex: EvmChainIdHex | null
  solanaCluster: SolanaCluster | null
  usdtDecimals: number
  nativeDecimals: number
  nativeSymbol: 'BNB' | 'TRX' | 'POL' | 'SOL' | 'ETH' | 'AVAX'
  usdtContractAddress: string
  receiverAddress: ''
  explorerBaseUrl: string
  explorerTxPath: string
  explorerQuery: string
  rpcUrls: string[]
}

const SOLANA_MAINNET_RPCS = [
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet.solana.com',
  'https://api.mainnet-beta.solana.com',
] as const

const SOLANA_TESTNET_RPCS = ['https://api.devnet.solana.com'] as const
const TRON_MAINNET_RPCS = ['https://api.trongrid.io'] as const
const TRON_TESTNET_RPCS = ['https://nile.trongrid.io'] as const

const NETWORK_SPECS: Record<BackendPaymentNetworkId, {
  clientId: PaymentNetworkId
  family: PaymentNetworkFamily
  recommended: boolean
  requiredConfirmations: number
  commitment: 'finalized' | null
  usdtDecimals: number
  nativeDecimals: number
  nativeSymbol: 'BNB' | 'TRX' | 'POL' | 'SOL' | 'ETH' | 'AVAX'
  mainnetUsdtContract: string
  testnetUsdtEnv: string
  modes: Record<PaymentNetworkMode, {
    name: string
    chainId: number | 'solana-devnet' | 'solana-mainnet' | 'tron-nile' | 'tron-mainnet'
    chainIdHex: EvmChainIdHex | null
    solanaCluster: SolanaCluster | null
    explorerBaseUrl: string
    explorerTxPath: string
    explorerQuery: string
    rpcEnv: string
    rpcFallbacks: readonly string[]
  }>
}> = {
  bsc: {
    clientId: 'bnb',
    family: 'evm',
    recommended: true,
    requiredConfirmations: 15,
    commitment: null,
    usdtDecimals: 18,
    nativeDecimals: 18,
    nativeSymbol: 'BNB',
    mainnetUsdtContract: '0x55d398326f99059fF775485246999027B3197955',
    testnetUsdtEnv: 'VITE_PAYMENT_TESTNET_USDT_BSC_CONTRACT',
    modes: {
      testnet: {
        name: 'BNB Smart Chain Testnet',
        chainId: 97,
        chainIdHex: '0x61',
        solanaCluster: null,
        explorerBaseUrl: 'https://testnet.bscscan.com',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_BSC_TESTNET',
        rpcFallbacks: ['https://bsc-testnet-rpc.publicnode.com'],
      },
      mainnet: {
        name: 'BNB Chain',
        chainId: 56,
        chainIdHex: '0x38',
        solanaCluster: null,
        explorerBaseUrl: 'https://bscscan.com',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_BSC_MAINNET',
        rpcFallbacks: ['https://bsc-rpc.publicnode.com'],
      },
    },
  },
  tron: {
    clientId: 'tron',
    family: 'tron',
    recommended: true,
    requiredConfirmations: 20,
    commitment: null,
    usdtDecimals: 6,
    nativeDecimals: 6,
    nativeSymbol: 'TRX',
    mainnetUsdtContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    testnetUsdtEnv: 'VITE_PAYMENT_TESTNET_USDT_TRON_CONTRACT',
    modes: {
      testnet: {
        name: 'TRON Nile',
        chainId: 'tron-nile',
        chainIdHex: null,
        solanaCluster: null,
        explorerBaseUrl: 'https://nile.tronscan.org',
        explorerTxPath: '/#/transaction/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_TRON_TESTNET',
        rpcFallbacks: TRON_TESTNET_RPCS,
      },
      mainnet: {
        name: 'TRON',
        chainId: 'tron-mainnet',
        chainIdHex: null,
        solanaCluster: null,
        explorerBaseUrl: 'https://tronscan.org',
        explorerTxPath: '/#/transaction/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_TRON_MAINNET',
        rpcFallbacks: TRON_MAINNET_RPCS,
      },
    },
  },
  polygon: {
    clientId: 'polygon',
    family: 'evm',
    recommended: true,
    requiredConfirmations: 64,
    commitment: null,
    usdtDecimals: 6,
    nativeDecimals: 18,
    nativeSymbol: 'POL',
    mainnetUsdtContract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    testnetUsdtEnv: 'VITE_PAYMENT_TESTNET_USDT_POLYGON_CONTRACT',
    modes: {
      testnet: {
        name: 'Polygon Amoy',
        chainId: 80002,
        chainIdHex: '0x13882',
        solanaCluster: null,
        explorerBaseUrl: 'https://amoy.polygonscan.com',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_POLYGON_TESTNET',
        rpcFallbacks: ['https://polygon-amoy-bor-rpc.publicnode.com'],
      },
      mainnet: {
        name: 'Polygon',
        chainId: 137,
        chainIdHex: '0x89',
        solanaCluster: null,
        explorerBaseUrl: 'https://polygonscan.com',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_POLYGON_MAINNET',
        rpcFallbacks: ['https://polygon-bor-rpc.publicnode.com'],
      },
    },
  },
  solana: {
    clientId: 'solana',
    family: 'solana',
    recommended: true,
    requiredConfirmations: 1,
    commitment: 'finalized',
    usdtDecimals: 6,
    nativeDecimals: 9,
    nativeSymbol: 'SOL',
    mainnetUsdtContract: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    testnetUsdtEnv: 'VITE_PAYMENT_TESTNET_USDT_SOLANA_MINT',
    modes: {
      testnet: {
        name: 'Solana Devnet',
        chainId: 'solana-devnet',
        chainIdHex: null,
        solanaCluster: 'devnet',
        explorerBaseUrl: 'https://solscan.io',
        explorerTxPath: '/tx/',
        explorerQuery: '?cluster=devnet',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_SOLANA_TESTNET',
        rpcFallbacks: SOLANA_TESTNET_RPCS,
      },
      mainnet: {
        name: 'Solana',
        chainId: 'solana-mainnet',
        chainIdHex: null,
        solanaCluster: 'mainnet-beta',
        explorerBaseUrl: 'https://solscan.io',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_SOLANA_MAINNET',
        rpcFallbacks: SOLANA_MAINNET_RPCS,
      },
    },
  },
  arbitrum: {
    clientId: 'arbitrum',
    family: 'evm',
    recommended: true,
    requiredConfirmations: 20,
    commitment: null,
    usdtDecimals: 6,
    nativeDecimals: 18,
    nativeSymbol: 'ETH',
    mainnetUsdtContract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    testnetUsdtEnv: 'VITE_PAYMENT_TESTNET_USDT_ARBITRUM_CONTRACT',
    modes: {
      testnet: {
        name: 'Arbitrum Sepolia',
        chainId: 421614,
        chainIdHex: '0x66eee',
        solanaCluster: null,
        explorerBaseUrl: 'https://sepolia.arbiscan.io',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_ARBITRUM_TESTNET',
        rpcFallbacks: ['https://arbitrum-sepolia-rpc.publicnode.com'],
      },
      mainnet: {
        name: 'Arbitrum One',
        chainId: 42161,
        chainIdHex: '0xa4b1',
        solanaCluster: null,
        explorerBaseUrl: 'https://arbiscan.io',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_ARBITRUM_MAINNET',
        rpcFallbacks: ['https://arbitrum-one-rpc.publicnode.com'],
      },
    },
  },
  optimism: {
    clientId: 'optimism',
    family: 'evm',
    recommended: true,
    requiredConfirmations: 20,
    commitment: null,
    usdtDecimals: 6,
    nativeDecimals: 18,
    nativeSymbol: 'ETH',
    mainnetUsdtContract: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    testnetUsdtEnv: 'VITE_PAYMENT_TESTNET_USDT_OPTIMISM_CONTRACT',
    modes: {
      testnet: {
        name: 'Optimism Sepolia',
        chainId: 11155420,
        chainIdHex: '0xaa37dc',
        solanaCluster: null,
        explorerBaseUrl: 'https://sepolia-optimism.etherscan.io',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_OPTIMISM_TESTNET',
        rpcFallbacks: ['https://optimism-sepolia-rpc.publicnode.com'],
      },
      mainnet: {
        name: 'Optimism',
        chainId: 10,
        chainIdHex: '0xa',
        solanaCluster: null,
        explorerBaseUrl: 'https://optimistic.etherscan.io',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_OPTIMISM_MAINNET',
        rpcFallbacks: ['https://optimism-rpc.publicnode.com'],
      },
    },
  },
  avalanche: {
    clientId: 'avalanche',
    family: 'evm',
    recommended: true,
    requiredConfirmations: 12,
    commitment: null,
    usdtDecimals: 6,
    nativeDecimals: 18,
    nativeSymbol: 'AVAX',
    mainnetUsdtContract: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    testnetUsdtEnv: 'VITE_PAYMENT_TESTNET_USDT_AVALANCHE_CONTRACT',
    modes: {
      testnet: {
        name: 'Avalanche Fuji',
        chainId: 43113,
        chainIdHex: '0xa869',
        solanaCluster: null,
        explorerBaseUrl: 'https://testnet.snowtrace.io',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_AVALANCHE_TESTNET',
        rpcFallbacks: ['https://avalanche-fuji-c-chain-rpc.publicnode.com'],
      },
      mainnet: {
        name: 'Avalanche C-Chain',
        chainId: 43114,
        chainIdHex: '0xa86a',
        solanaCluster: null,
        explorerBaseUrl: 'https://snowtrace.io',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_AVALANCHE_MAINNET',
        rpcFallbacks: ['https://avalanche-c-chain-rpc.publicnode.com'],
      },
    },
  },
  ethereum: {
    clientId: 'ethereum',
    family: 'evm',
    recommended: false,
    requiredConfirmations: 12,
    commitment: null,
    usdtDecimals: 6,
    nativeDecimals: 18,
    nativeSymbol: 'ETH',
    mainnetUsdtContract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    testnetUsdtEnv: 'VITE_PAYMENT_TESTNET_USDT_ETHEREUM_CONTRACT',
    modes: {
      testnet: {
        name: 'Ethereum Sepolia',
        chainId: 11155111,
        chainIdHex: '0xaa36a7',
        solanaCluster: null,
        explorerBaseUrl: 'https://sepolia.etherscan.io',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_ETHEREUM_TESTNET',
        rpcFallbacks: ['https://ethereum-sepolia-rpc.publicnode.com'],
      },
      mainnet: {
        name: 'Ethereum',
        chainId: 1,
        chainIdHex: '0x1',
        solanaCluster: null,
        explorerBaseUrl: 'https://etherscan.io',
        explorerTxPath: '/tx/',
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_ETHEREUM_MAINNET',
        rpcFallbacks: ['https://ethereum-rpc.publicnode.com'],
      },
    },
  },
}

export function getPaymentNetworkConfig(
  networkId: AnyPaymentNetworkId,
  mode?: PaymentNetworkMode,
  env?: PaymentEnv,
): PaymentNetworkConfig {
  const activeEnv = readEnv(env)
  const resolvedMode = mode ?? resolvePaymentNetworkMode(activeEnv)
  const backendId = toBackendPaymentNetworkId(networkId)
  const spec = NETWORK_SPECS[backendId]
  const modeSpec = spec.modes[resolvedMode]
  const usdtContractAddress = resolvedMode === 'mainnet'
    ? spec.mainnetUsdtContract
    : readTrimmedEnv(activeEnv, spec.testnetUsdtEnv)

  return {
    id: backendId,
    clientId: spec.clientId,
    family: spec.family,
    mode: resolvedMode,
    name: modeSpec.name,
    recommended: spec.recommended,
    enabled: backendId === 'ethereum' ? isEthereumPaymentEnabled(activeEnv) : true,
    requiredConfirmations: spec.requiredConfirmations,
    commitment: spec.commitment,
    chainId: modeSpec.chainId,
    chainIdHex: modeSpec.chainIdHex,
    solanaCluster: modeSpec.solanaCluster,
    usdtDecimals: spec.usdtDecimals,
    nativeDecimals: spec.nativeDecimals,
    nativeSymbol: spec.nativeSymbol,
    usdtContractAddress,
    receiverAddress: '',
    explorerBaseUrl: modeSpec.explorerBaseUrl,
    explorerTxPath: modeSpec.explorerTxPath,
    explorerQuery: modeSpec.explorerQuery,
    rpcUrls: readRpcList(activeEnv, modeSpec.rpcEnv, modeSpec.rpcFallbacks),
  }
}

export function getSolanaClusterForMode(mode?: PaymentNetworkMode, env?: PaymentEnv): SolanaCluster {
  const resolvedMode = mode ?? resolvePaymentNetworkMode(env)
  return resolvedMode === 'mainnet' ? 'mainnet-beta' : 'devnet'
}

export function getSolanaRpcUrlsForMode(mode?: PaymentNetworkMode, env?: PaymentEnv): string[] {
  return getPaymentNetworkConfig('solana', mode, env).rpcUrls
}

export function getTronRpcUrlsForMode(mode?: PaymentNetworkMode, env?: PaymentEnv): string[] {
  return getPaymentNetworkConfig('tron', mode, env).rpcUrls
}

export function buildExplorerTxUrl(
  networkId: AnyPaymentNetworkId,
  txHash: string,
  mode?: PaymentNetworkMode,
  env?: PaymentEnv,
): string {
  const cleanHash = typeof txHash === 'string' ? txHash.trim() : ''
  if (!cleanHash) {
    throw new PaymentDestinationError('INVALID_TX_HASH', 'Transaction hash is required to build explorer URL.')
  }
  const cfg = getPaymentNetworkConfig(networkId, mode, env)
  return `${cfg.explorerBaseUrl}${cfg.explorerTxPath}${encodeURIComponent(cleanHash)}${cfg.explorerQuery}`
}

export function parseDecimalToAtomicBigInt(decimalString: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new PaymentDestinationError('INVALID_ASSET_DECIMALS', `Invalid asset decimals: ${decimals}`)
  }
  const trimmed = typeof decimalString === 'string' ? decimalString.trim() : ''
  if (!DECIMAL_AMOUNT_PATTERN.test(trimmed)) {
    throw new PaymentDestinationError('INVALID_AMOUNT', `Invalid decimal amount: "${decimalString}"`)
  }
  const [whole, fraction = ''] = trimmed.split('.')
  if (fraction.length > decimals) {
    throw new PaymentDestinationError(
      'EXCESS_DECIMAL_PRECISION',
      `Amount "${trimmed}" exceeds ${decimals} decimal places.`,
    )
  }
  const scale = 10n ** BigInt(decimals)
  const paddedFraction = fraction.padEnd(decimals, '0')
  return BigInt(whole) * scale + (paddedFraction ? BigInt(paddedFraction) : 0n)
}

export function parsePositiveAtomicBigInt(value: string | bigint, label = 'expectedAmountAtomic'): bigint {
  let parsed: bigint
  if (typeof value === 'bigint') {
    parsed = value
  } else if (typeof value === 'string' && POSITIVE_INT_PATTERN.test(value.trim())) {
    parsed = BigInt(value.trim())
  } else {
    throw new PaymentDestinationError('INVALID_AMOUNT', `${label} must be a positive integer atomic amount.`)
  }
  if (parsed <= 0n) {
    throw new PaymentDestinationError('INVALID_AMOUNT', `${label} must be greater than zero.`)
  }
  return parsed
}

export function getReceiverAddress(_networkId: PaymentNetworkId): string {
  // Treasury addresses are strictly supplied at runtime by the authoritative backend PaymentIntent (PG-04).
  return ''
}

export type UsdtContractInfo = {
  address: string
  decimals: number
}

export function getUsdtContracts(
  mode?: PaymentNetworkMode,
  env?: PaymentEnv,
): Record<PaymentNetworkId, UsdtContractInfo> {
  const activeEnv = readEnv(env)
  const resolvedMode = mode ?? resolvePaymentNetworkMode(activeEnv)
  const bscCfg = getPaymentNetworkConfig('bsc', resolvedMode, activeEnv)
  const tronCfg = getPaymentNetworkConfig('tron', resolvedMode, activeEnv)
  const polyCfg = getPaymentNetworkConfig('polygon', resolvedMode, activeEnv)
  const solCfg = getPaymentNetworkConfig('solana', resolvedMode, activeEnv)
  const arbCfg = getPaymentNetworkConfig('arbitrum', resolvedMode, activeEnv)
  const optCfg = getPaymentNetworkConfig('optimism', resolvedMode, activeEnv)
  const avaxCfg = getPaymentNetworkConfig('avalanche', resolvedMode, activeEnv)
  const ethCfg = getPaymentNetworkConfig('ethereum', resolvedMode, activeEnv)
  return {
    bnb: { address: bscCfg.usdtContractAddress, decimals: bscCfg.usdtDecimals },
    tron: { address: tronCfg.usdtContractAddress, decimals: tronCfg.usdtDecimals },
    polygon: { address: polyCfg.usdtContractAddress, decimals: polyCfg.usdtDecimals },
    solana: { address: solCfg.usdtContractAddress, decimals: solCfg.usdtDecimals },
    arbitrum: { address: arbCfg.usdtContractAddress, decimals: arbCfg.usdtDecimals },
    optimism: { address: optCfg.usdtContractAddress, decimals: optCfg.usdtDecimals },
    avalanche: { address: avaxCfg.usdtContractAddress, decimals: avaxCfg.usdtDecimals },
    ethereum: { address: ethCfg.usdtContractAddress, decimals: ethCfg.usdtDecimals },
  }
}

export const USDT_CONTRACTS: Record<PaymentNetworkId, UsdtContractInfo> = getUsdtContracts()
export const SOLANA_USDT_MINT: string = USDT_CONTRACTS.solana.address

export type PaymentDestination = {
  id: PaymentNetworkId
  name: string
  chainId: number
  chainIdHex: string | null
  assetHint: string
  address: string
  receiverAddress: string
  receiveLabel: string
  eta: string
  blockExplorer: string
  explorerQuery: string
  recommended: boolean
  requiredConfirmations: number
  enabled: boolean
}

export function getPaymentDestinations(
  mode?: PaymentNetworkMode,
  env?: PaymentEnv,
): PaymentDestination[] {
  const activeEnv = readEnv(env)
  const resolvedMode = mode ?? resolvePaymentNetworkMode(activeEnv)
  const bscCfg = getPaymentNetworkConfig('bsc', resolvedMode, activeEnv)
  const tronCfg = getPaymentNetworkConfig('tron', resolvedMode, activeEnv)
  const polyCfg = getPaymentNetworkConfig('polygon', resolvedMode, activeEnv)
  const solCfg = getPaymentNetworkConfig('solana', resolvedMode, activeEnv)
  const arbCfg = getPaymentNetworkConfig('arbitrum', resolvedMode, activeEnv)
  const optCfg = getPaymentNetworkConfig('optimism', resolvedMode, activeEnv)
  const avaxCfg = getPaymentNetworkConfig('avalanche', resolvedMode, activeEnv)
  const ethCfg = getPaymentNetworkConfig('ethereum', resolvedMode, activeEnv)

  return [
    {
      id: 'bnb',
      name: bscCfg.name,
      chainId: bscCfg.chainId as number,
      chainIdHex: bscCfg.chainIdHex,
      assetHint: 'USDT (BEP-20) o BNB',
      address: '',
      receiverAddress: '',
      receiveLabel: `Pago directo en ${bscCfg.name}`,
      eta: 'Aprox. 3 segundos en BSC.',
      blockExplorer: bscCfg.explorerBaseUrl,
      explorerQuery: bscCfg.explorerQuery,
      recommended: bscCfg.recommended,
      requiredConfirmations: bscCfg.requiredConfirmations,
      enabled: bscCfg.enabled,
    },
    {
      id: 'tron',
      name: tronCfg.name,
      chainId: 0,
      chainIdHex: null,
      assetHint: 'USDT (TRC-20) o TRX',
      address: '',
      receiverAddress: '',
      receiveLabel: `Pago directo en ${tronCfg.name}`,
      eta: 'Aprox. 3 segundos en TRON.',
      blockExplorer: tronCfg.explorerBaseUrl,
      explorerQuery: tronCfg.explorerQuery,
      recommended: tronCfg.recommended,
      requiredConfirmations: tronCfg.requiredConfirmations,
      enabled: tronCfg.enabled,
    },
    {
      id: 'polygon',
      name: polyCfg.name,
      chainId: polyCfg.chainId as number,
      chainIdHex: polyCfg.chainIdHex,
      assetHint: 'USDT (ERC-20) o POL',
      address: '',
      receiverAddress: '',
      receiveLabel: `Pago directo en ${polyCfg.name}`,
      eta: 'Aprox. 2 segundos en Polygon.',
      blockExplorer: polyCfg.explorerBaseUrl,
      explorerQuery: polyCfg.explorerQuery,
      recommended: polyCfg.recommended,
      requiredConfirmations: polyCfg.requiredConfirmations,
      enabled: polyCfg.enabled,
    },
    {
      id: 'solana',
      name: solCfg.name,
      chainId: 0,
      chainIdHex: null,
      assetHint: 'USDT (SPL) o SOL',
      address: '',
      receiverAddress: '',
      receiveLabel: `Pago directo en ${solCfg.name}`,
      eta: 'Aprox. 1 segundo en Solana.',
      blockExplorer: solCfg.explorerBaseUrl,
      explorerQuery: solCfg.explorerQuery,
      recommended: solCfg.recommended,
      requiredConfirmations: solCfg.requiredConfirmations,
      enabled: solCfg.enabled,
    },
    {
      id: 'arbitrum',
      name: arbCfg.name,
      chainId: arbCfg.chainId as number,
      chainIdHex: arbCfg.chainIdHex,
      assetHint: 'USDT (ERC-20) o ETH',
      address: '',
      receiverAddress: '',
      receiveLabel: `Pago directo en ${arbCfg.name}`,
      eta: 'Aprox. 1 segundo en Arbitrum.',
      blockExplorer: arbCfg.explorerBaseUrl,
      explorerQuery: arbCfg.explorerQuery,
      recommended: arbCfg.recommended,
      requiredConfirmations: arbCfg.requiredConfirmations,
      enabled: arbCfg.enabled,
    },
    {
      id: 'optimism',
      name: optCfg.name,
      chainId: optCfg.chainId as number,
      chainIdHex: optCfg.chainIdHex,
      assetHint: 'USDT (ERC-20) o ETH',
      address: '',
      receiverAddress: '',
      receiveLabel: `Pago directo en ${optCfg.name}`,
      eta: 'Aprox. 2 segundos en Optimism.',
      blockExplorer: optCfg.explorerBaseUrl,
      explorerQuery: optCfg.explorerQuery,
      recommended: optCfg.recommended,
      requiredConfirmations: optCfg.requiredConfirmations,
      enabled: optCfg.enabled,
    },
    {
      id: 'avalanche',
      name: avaxCfg.name,
      chainId: avaxCfg.chainId as number,
      chainIdHex: avaxCfg.chainIdHex,
      assetHint: 'USDT (ERC-20) o AVAX',
      address: '',
      receiverAddress: '',
      receiveLabel: `Pago directo en ${avaxCfg.name}`,
      eta: 'Aprox. 2 segundos en Avalanche.',
      blockExplorer: avaxCfg.explorerBaseUrl,
      explorerQuery: avaxCfg.explorerQuery,
      recommended: avaxCfg.recommended,
      requiredConfirmations: avaxCfg.requiredConfirmations,
      enabled: avaxCfg.enabled,
    },
    {
      id: 'ethereum',
      name: ethCfg.name,
      chainId: ethCfg.chainId as number,
      chainIdHex: ethCfg.chainIdHex,
      assetHint: 'USDT (ERC-20) o ETH',
      address: '',
      receiverAddress: '',
      receiveLabel: `Pago directo en ${ethCfg.name}`,
      eta: 'Aprox. 12 segundos en Ethereum.',
      blockExplorer: ethCfg.explorerBaseUrl,
      explorerQuery: ethCfg.explorerQuery,
      recommended: ethCfg.recommended,
      requiredConfirmations: ethCfg.requiredConfirmations,
      enabled: ethCfg.enabled,
    },
  ]
}

export const PAYMENT_DESTINATIONS: PaymentDestination[] = getPaymentDestinations()
