import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'
import { bsc, mainnet, polygon, solana } from '@reown/appkit/networks'
import { QueryClient } from '@tanstack/react-query'

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
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || '0343399f08f86b28ceaf084ae4e45a01'

export const metadata = {
  name: 'PouwMiner.com',
  description: 'PouwMiner.com wallet connection',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://app.gomining.com',
  icons: ['https://app.gomining.com/favicon.ico'],
}

export const appKitNetworks = [bsc, mainnet, polygon, solana] as const

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [bsc, mainnet, polygon],
})

export const solanaAdapter = new SolanaAdapter({
  wallets: [],
})

export const appKitModal = createAppKit({
  adapters: [wagmiAdapter, solanaAdapter],
  networks: [bsc, mainnet, polygon, solana],
  defaultNetwork: bsc,
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
