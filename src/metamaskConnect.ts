import type { MetamaskConnectEVM } from '@metamask/connect-evm'
import { isMobileBrowser } from './walletAppLinks'

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
export function getMetaMaskConnectClient() {
  if (typeof window === 'undefined') throw new Error('MetaMask Connect solo está disponible en un navegador.')
  const currentUrl = new URL(window.location.href)
  clientPromise ??= import('@metamask/connect-evm').then(({ createEVMClient }) => createEVMClient({
    dapp: {
      name: 'GoMining',
      // MetaMask Connect normalizes browser dapp metadata to this origin.
      // The checkout return state is kept in the page URL before opening the app.
      url: currentUrl.origin,
      iconUrl: new URL('/favicon.svg', currentUrl.origin).toString(),
    },
    api: { supportedNetworks },
    analytics: { enabled: false },
    // On phones prefer MetaMask's HTTPS App Link (`/connect/mwp`). Android/iOS
    // can route this straight to the native wallet and the Connect approval
    // screen; the `metamask://` scheme was observed by the user opening a blank
    // in-wallet webview on Android. Never use `/dapp/{url}` here: that route
    // intentionally opens the site's page in MetaMask's built-in browser.
    // Desktop keeps the SDK's custom-scheme default for its normal QR flow.
    mobile: { useDeeplink: !isMobileBrowser() },
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
