import type { MetamaskConnectEVM } from '@metamask/connect-evm'

let clientPromise: Promise<MetamaskConnectEVM> | null = null

const supportedNetworks = {
  '0x1': 'https://ethereum-rpc.publicnode.com',
  '0x38': 'https://bsc-rpc.publicnode.com',
  '0x89': 'https://polygon-bor-rpc.publicnode.com',
} as const

/** Lazy-load MetaMask Connect for browsers without an injected provider. */
export function getMetaMaskConnectClient() {
  if (typeof window === 'undefined') throw new Error('MetaMask Connect solo está disponible en un navegador.')
  const currentUrl = new URL(window.location.href)
  clientPromise ??= import('@metamask/connect-evm').then(({ createEVMClient }) => createEVMClient({
    dapp: {
      name: 'GoMining',
      // Give MetaMask the active route so a mobile handoff can resume the
      // current checkout instead of losing its path and query parameters.
      url: currentUrl.toString(),
      iconUrl: new URL('/favicon.svg', currentUrl.origin).toString(),
    },
    api: { supportedNetworks },
    analytics: { enabled: false },
    // Use MetaMask's native scheme for the SDK handoff from mobile browsers.
    // The Connect SDK then carries the request into the app instead of merely
    // navigating to its home screen. The DApp-browser link remains a fallback.
    mobile: { useDeeplink: true },
    // The client is warmed before the user's tap. The DApp Browser link stays
    // available as a manual fallback when an app handoff does not surface.
    ui: { preferExtension: true, showInstallModal: false },
    // Use the explicit client API instead of exposing a second wallet entry
    // through EIP-6963 discovery.
    skipAutoAnnounce: true,
  })).catch((error: unknown) => {
    clientPromise = null
    throw error
  })
  return clientPromise
}

export function metaMaskChainId(networkId: 'bnb' | 'ethereum' | 'polygon') {
  if (networkId === 'bnb') return '0x38'
  if (networkId === 'polygon') return '0x89'
  return '0x1'
}
