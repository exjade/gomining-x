import type { ProviderInterface } from '@coinbase/wallet-sdk'

let providerPromise: Promise<ProviderInterface> | null = null

/** Lazily create Coinbase Wallet's EIP-1193 provider without a WalletConnect project ID. */
export function getCoinbaseWalletProvider() {
  if (typeof window === 'undefined') throw new Error('Coinbase Wallet solo está disponible en un navegador.')
  providerPromise ??= import('@coinbase/wallet-sdk').then(({ createCoinbaseWalletSDK }) => {
    const origin = window.location.origin
    return createCoinbaseWalletSDK({
      appName: 'GoMining',
      appLogoUrl: new URL('/favicon.svg', origin).toString(),
      appChainIds: [1, 56, 137],
    }).getProvider()
  }).catch((error: unknown) => {
    providerPromise = null
    throw error
  })
  return providerPromise
}
