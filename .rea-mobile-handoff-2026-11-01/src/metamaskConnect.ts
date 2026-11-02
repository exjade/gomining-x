import type { MetamaskConnectEVM } from '@metamask/connect-evm'

let clientPromise: Promise<MetamaskConnectEVM> | null = null

const supportedNetworks = {
  '0x1': 'https://ethereum-rpc.publicnode.com',
  '0x38': 'https://bsc-rpc.publicnode.com',
  '0x89': 'https://polygon-bor-rpc.publicnode.com',
} as const

/**
 * Lazy-load MetaMask Connect when the buyer asks to connect without an
 * injected provider. On mobile, Connect opens the native MetaMask app through
 * its connection deeplink/relay and returns an EIP-1193 session to this page.
 */
export function getMetaMaskConnectClient(resumeUrl?: string) {
  if (typeof window === 'undefined') throw new Error('MetaMask Connect solo está disponible en un navegador.')
  const currentUrl = new URL(window.location.href)
  const requestedUrl = resumeUrl ? new URL(resumeUrl, currentUrl) : currentUrl
  if (requestedUrl.origin !== currentUrl.origin) {
    throw new Error('La URL de regreso de MetaMask debe pertenecer a esta misma plataforma.')
  }
  clientPromise ??= import('@metamask/connect-evm').then(({ createEVMClient }) => createEVMClient({
    dapp: {
      name: 'GoMining',
      // Preserve the checkout route and its non-sensitive resume parameters.
      // MetaMask's mobile handoff can reopen this URL if the browser was evicted.
      url: requestedUrl.toString(),
      iconUrl: new URL('/favicon.svg', currentUrl.origin).toString(),
    },
    api: { supportedNetworks },
    analytics: { enabled: false },
    // Use MetaMask's native URI on mobile. The installed Connect SDK opens
    // this with window.location.href; its source documents that this avoids
    // the blank browser page left by the universal-link anchor fallback.
    // Connect still uses MetaMask's relay to return the approved session here.
    mobile: { useDeeplink: true },
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
