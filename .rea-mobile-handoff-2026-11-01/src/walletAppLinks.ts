import type { WalletId } from './walletSession'
import type { PaymentNetworkId } from './paymentDestinations'

export function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function hasWalletBrowserProvider(walletId: WalletId) {
  if (typeof window === 'undefined') return false
  const target = window as unknown as {
    ethereum?: { isMetaMask?: boolean; isCoinbaseWallet?: boolean; isTrust?: boolean; isTrustWallet?: boolean; providers?: Array<{ isMetaMask?: boolean; isCoinbaseWallet?: boolean; isTrust?: boolean; isTrustWallet?: boolean }> }
    coinbaseWalletExtension?: unknown
    trustwallet?: { ethereum?: unknown }
    phantom?: { solana?: unknown }
    solflare?: unknown
    solana?: { isPhantom?: boolean; isSolflare?: boolean }
    tron?: unknown
    unisat?: unknown
  }
  switch (walletId) {
    case 'metamask': return Boolean(target.ethereum?.isMetaMask || target.ethereum?.providers?.some((provider) => provider.isMetaMask))
    case 'coinbase': return Boolean(target.coinbaseWalletExtension || target.ethereum?.isCoinbaseWallet || target.ethereum?.providers?.some((provider) => provider.isCoinbaseWallet))
    case 'trustwallet': return Boolean(target.trustwallet?.ethereum || target.ethereum?.isTrust || target.ethereum?.isTrustWallet || target.ethereum?.providers?.some((provider) => provider.isTrust || provider.isTrustWallet))
    case 'phantom': return Boolean(target.phantom?.solana || target.solana?.isPhantom)
    case 'solflare': return Boolean(target.solflare || target.solana?.isSolflare)
    case 'tronlink': return Boolean(target.tron)
    case 'unisat': return Boolean(target.unisat)
  }
}

export function mobileTargetIsPublicHttps(target: string) {
  try {
    const url = new URL(target)
    return url.protocol === 'https:' && !/^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(url.hostname)
  } catch {
    return false
  }
}

export function buildCheckoutResumeUrl(target: string, checkout: {
  productName: string
  amount: number
  currency: 'USD' | 'MXN'
  networkId: PaymentNetworkId
  walletId: WalletId
}) {
  const url = new URL(target)
  url.searchParams.set('gmPay', '1')
  url.searchParams.set('gmPayProduct', checkout.productName)
  url.searchParams.set('gmPayAmount', String(checkout.amount))
  url.searchParams.set('gmPayCurrency', checkout.currency)
  url.searchParams.set('gmPayNetwork', checkout.networkId)
  url.searchParams.set('gmPayWallet', checkout.walletId)
  return url.toString()
}

export function getMobileWalletLaunchUrl(walletId: WalletId, target: string, networkId: PaymentNetworkId) {
  const url = new URL(target)
  const encodedTarget = encodeURIComponent(url.toString())
  const encodedOrigin = encodeURIComponent(url.origin)

  switch (walletId) {
    // MetaMask mobile is handled by @metamask/connect-evm. Its connect flow
    // opens the native wallet app and returns the session to this page; the
    // /dapp deeplink would instead open MetaMask's in-app browser.
    case 'metamask': return null
    case 'solflare':
      return `https://solflare.com/ul/v1/browse/${encodedTarget}?ref=${encodedOrigin}`
    case 'phantom':
      return `https://phantom.app/ul/browse/${encodedTarget}?ref=${encodedOrigin}`
    case 'coinbase': {
      const link = new URL('https://go.cb-w.com/dapp')
      link.searchParams.set('cb_url', url.toString())
      return link.toString()
    }
    case 'trustwallet': {
      const coinId: Record<PaymentNetworkId, number> = {
        // Trust Wallet's open_url deep link selects a network by coin ID.
        // These IDs follow its documented SLIP-44 network values.
        bnb: 714, bitcoin: 0, ethereum: 60, tron: 195, solana: 501, polygon: 966,
      }
      return `https://link.trustwallet.com/open_url?coin_id=${coinId[networkId]}&url=${encodedTarget}`
    }
    case 'tronlink': {
      const request = { url: url.toString(), action: 'open', protocol: 'TronLink', version: '1.0' }
      return `tronlinkoutside://pull.activity?param=${encodeURIComponent(JSON.stringify(request))}`
    }
    default:
      return null
  }
}
