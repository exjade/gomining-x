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

function isLocalOrPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return true

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [first, second] = ipv4.slice(1).map(Number)
    if (first === 0 || first === 10 || first === 127 || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 100 && second >= 64 && second <= 127)) return true
  }

  // IPv6 literals are not needed for public app links; reject loopback,
  // unspecified, unique-local, and link-local addresses explicitly.
  return host === '::' || host === '::1' || /^f[cd][\da-f]*:/i.test(host) || /^fe[89ab][\da-f]*:/i.test(host)
}

function isPublicHttpsUrl(url: URL) {
  return url.protocol === 'https:' && !url.username && !url.password && !isLocalOrPrivateHost(url.hostname)
}

export function mobileTargetIsPublicHttps(target: string) {
  try {
    const url = new URL(target)
    return isPublicHttpsUrl(url)
  } catch {
    return false
  }
}

/** ngrok's free HTML warning interstitial can interrupt a wallet-app return. */
export function mobileTargetUsesNgrokFreeDomain(target: string) {
  try {
    const hostname = new URL(target).hostname.toLowerCase()
    return ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok-free.io', '.ngrok.io']
      .some((suffix) => hostname.endsWith(suffix))
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
  url.searchParams.delete('gmWalletConnect')
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
  const walletBrowserUrl = (id: WalletId) => {
    const destination = new URL(url)
    destination.searchParams.set('gmWalletConnect', id)
    return destination
  }

  switch (walletId) {
    // MetaMask mobile is handled by @metamask/connect-evm. Its connect flow
    // opens the native wallet app and returns the session to this page; the
    // /dapp deeplink would instead open MetaMask's in-app browser.
    case 'metamask': return null
    // Solflare mobile uses the encrypted connect/signAndSend deeplink flow in
    // walletSession.ts. The /browse endpoint intentionally opens the dapp in
    // Solflare's embedded browser and does not return a native wallet session.
    case 'solflare': return null
    // Phantom's /browse link opens only its embedded browser. Native mobile
    // connect/payment is handled by phantomMobile.ts with encrypted callbacks.
    case 'phantom': return null
    case 'coinbase': {
      const link = new URL('https://go.cb-w.com/dapp')
      link.searchParams.set('cb_url', walletBrowserUrl(walletId).toString())
      return link.toString()
    }
    case 'trustwallet': {
      const coinId: Record<PaymentNetworkId, number> = {
        // Trust Wallet's open_url deep link selects a network by coin ID.
        // These IDs follow its documented SLIP-44 network values.
        bnb: 714, bitcoin: 0, ethereum: 60, tron: 195, solana: 501, polygon: 966,
      }
      const link = new URL('https://link.trustwallet.com/open_url')
      link.searchParams.set('coin_id', String(coinId[networkId]))
      link.searchParams.set('url', walletBrowserUrl(walletId).toString())
      return link.toString()
    }
    case 'tronlink': {
      const request = { url: walletBrowserUrl(walletId).toString(), action: 'open', protocol: 'TronLink', version: '1.0' }
      return `tronlinkoutside://pull.activity?param=${encodeURIComponent(JSON.stringify(request))}`
    }
    default:
      return null
  }
}
