export type PaymentNetworkId = 'bnb' | 'ethereum' | 'polygon' | 'solana'
export type BackendPaymentNetworkId = 'bsc' | 'ethereum' | 'polygon' | 'solana'
export type AnyPaymentNetworkId = PaymentNetworkId | BackendPaymentNetworkId
export type PaymentNetworkMode = 'testnet' | 'mainnet'
export type PaymentNetworkFamily = 'evm' | 'solana'
export type SolanaCluster = 'devnet' | 'mainnet-beta'
export type PaymentCurrency = 'USD'
export type PaymentEnv = Record<string, string | boolean | undefined>

export const paymentNetworkIds: PaymentNetworkId[] = ['bnb', 'ethereum', 'polygon', 'solana']

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/
const EVM_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const SOLANA_ALL_ONES_PATTERN = /^1+$/
const DECIMAL_AMOUNT_PATTERN = /^\d+(?:\.\d+)?$/
const POSITIVE_INT_PATTERN = /^\d+$/

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
  const valid = family === 'evm' ? isValidEvmAddress(trimmed) : isValidSolanaAddress(trimmed)
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
  chainId: number | 'solana-devnet' | 'solana-mainnet'
  chainIdHex: EvmChainIdHex | null
  solanaCluster: SolanaCluster | null
  usdtDecimals: number
  nativeDecimals: number
  nativeSymbol: 'BNB' | 'POL' | 'ETH' | 'SOL'
  usdtContractAddress: string
  receiverAddress: ''
  explorerBaseUrl: string
  explorerQuery: string
  rpcUrls: string[]
}

const SOLANA_MAINNET_RPCS = [
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet.solana.com',
  'https://api.mainnet-beta.solana.com',
] as const

const SOLANA_TESTNET_RPCS = ['https://api.devnet.solana.com'] as const

const NETWORK_SPECS: Record<BackendPaymentNetworkId, {
  clientId: PaymentNetworkId
  family: PaymentNetworkFamily
  recommended: boolean
  requiredConfirmations: number
  commitment: 'finalized' | null
  usdtDecimals: number
  nativeDecimals: number
  nativeSymbol: 'BNB' | 'POL' | 'ETH' | 'SOL'
  mainnetUsdtContract: string
  testnetUsdtEnv: string
  modes: Record<PaymentNetworkMode, {
    name: string
    chainId: number | 'solana-devnet' | 'solana-mainnet'
    chainIdHex: EvmChainIdHex | null
    solanaCluster: SolanaCluster | null
    explorerBaseUrl: string
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
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_BSC_MAINNET',
        rpcFallbacks: ['https://bsc-rpc.publicnode.com'],
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
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_POLYGON_MAINNET',
        rpcFallbacks: ['https://polygon-bor-rpc.publicnode.com'],
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
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_ETHEREUM_MAINNET',
        rpcFallbacks: ['https://ethereum-rpc.publicnode.com'],
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
        explorerQuery: '',
        rpcEnv: 'VITE_PAYMENT_RPC_URL_SOLANA_MAINNET',
        rpcFallbacks: SOLANA_MAINNET_RPCS,
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
  return `${cfg.explorerBaseUrl}/tx/${encodeURIComponent(cleanHash)}${cfg.explorerQuery}`
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
  const ethCfg = getPaymentNetworkConfig('ethereum', resolvedMode, activeEnv)
  const polyCfg = getPaymentNetworkConfig('polygon', resolvedMode, activeEnv)
  const solCfg = getPaymentNetworkConfig('solana', resolvedMode, activeEnv)
  return {
    bnb: { address: bscCfg.usdtContractAddress, decimals: bscCfg.usdtDecimals },
    ethereum: { address: ethCfg.usdtContractAddress, decimals: ethCfg.usdtDecimals },
    polygon: { address: polyCfg.usdtContractAddress, decimals: polyCfg.usdtDecimals },
    solana: { address: solCfg.usdtContractAddress, decimals: solCfg.usdtDecimals },
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
  const ethCfg = getPaymentNetworkConfig('ethereum', resolvedMode, activeEnv)
  const polyCfg = getPaymentNetworkConfig('polygon', resolvedMode, activeEnv)
  const solCfg = getPaymentNetworkConfig('solana', resolvedMode, activeEnv)

  return [
    {
      id: 'bnb',
      name: bscCfg.name,
      chainId: bscCfg.chainId as number,
      chainIdHex: bscCfg.chainIdHex,
      assetHint: 'BNB o USDT (BEP-20)',
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
      id: 'ethereum',
      name: ethCfg.name,
      chainId: ethCfg.chainId as number,
      chainIdHex: ethCfg.chainIdHex,
      assetHint: 'ETH o USDT (ERC-20)',
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
    {
      id: 'polygon',
      name: polyCfg.name,
      chainId: polyCfg.chainId as number,
      chainIdHex: polyCfg.chainIdHex,
      assetHint: 'POL o USDT',
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
      assetHint: 'SOL o USDT (SPL)',
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
  ]
}

export const PAYMENT_DESTINATIONS: PaymentDestination[] = getPaymentDestinations()
