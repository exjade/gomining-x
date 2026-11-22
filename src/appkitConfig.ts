import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'
import {
  bsc,
  bscTestnet,
  mainnet,
  polygon,
  polygonAmoy,
  sepolia,
  solana,
  solanaDevnet,
  type AppKitNetwork,
} from '@reown/appkit/networks'
import { QueryClient } from '@tanstack/react-query'
import {
  isEthereumPaymentEnabled,
  resolvePaymentNetworkMode,
  type PaymentEnv,
  type PaymentNetworkMode,
} from './paymentDestinations.ts'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 0,
      staleTime: 60_000,
      gcTime: 300_000,
    },
  },
})

// Reown AppKit Project ID from environment variable with fallback
export const projectId =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_REOWN_PROJECT_ID) ||
  '0343399f08f86b28ceaf084ae4e45a01'

export const metadata = {
  name: 'PouwMiner.com',
  description: 'PouwMiner.com wallet connection',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://app.gomining.com',
  icons: ['https://app.gomining.com/favicon.ico'],
}

export function getAppKitEvmNetworksForMode(
  mode?: PaymentNetworkMode,
  env?: PaymentEnv,
): [AppKitNetwork, ...AppKitNetwork[]] {
  const activeMode = mode ?? resolvePaymentNetworkMode(env)
  const ethereumEnabled = isEthereumPaymentEnabled(env)
  if (activeMode === 'mainnet') {
    return ethereumEnabled ? [bsc, polygon, mainnet] : [bsc, polygon]
  }
  return ethereumEnabled ? [bscTestnet, polygonAmoy, sepolia] : [bscTestnet, polygonAmoy]
}

export function getAppKitNetworksForMode(
  mode?: PaymentNetworkMode,
  env?: PaymentEnv,
): [AppKitNetwork, ...AppKitNetwork[]] {
  const activeMode = mode ?? resolvePaymentNetworkMode(env)
  const evmNetworks = getAppKitEvmNetworksForMode(activeMode, env)
  return activeMode === 'mainnet'
    ? [...evmNetworks, solana]
    : [...evmNetworks, solanaDevnet]
}

export function getDefaultAppKitNetworkForMode(
  mode?: PaymentNetworkMode,
  env?: PaymentEnv,
): AppKitNetwork {
  const activeMode = mode ?? resolvePaymentNetworkMode(env)
  return activeMode === 'mainnet' ? bsc : bscTestnet
}

export const paymentNetworkMode = resolvePaymentNetworkMode()
export const appKitEvmNetworks = getAppKitEvmNetworksForMode(paymentNetworkMode)
export const appKitNetworks = getAppKitNetworksForMode(paymentNetworkMode)

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: appKitEvmNetworks,
})

export const solanaAdapter = new SolanaAdapter({
  wallets: [],
})

export const appKitModal = createAppKit({
  adapters: [wagmiAdapter, solanaAdapter],
  networks: appKitNetworks,
  defaultNetwork: getDefaultAppKitNetworkForMode(paymentNetworkMode),
  projectId,
  metadata,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#7c3aed',
    '--w3m-border-radius-master': '12px',
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
    swaps: false,
  },
})
