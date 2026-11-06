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
    keplr?: unknown
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
    case 'keplr': return Boolean(target.keplr)
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

/** ngrok free domains can show an interstitial inside a wallet's DApp browser. */
export function mobileTargetUsesNgrokFreeDomain(target: string) {
  try {
    const hostname = new URL(target).hostname.toLowerCase()
    return ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok-free.io', '.ngrok.io']
      .some((suffix) => hostname.endsWith(suffix))
  } catch {
    return false
  }
}

/** Wallet handoffs need the app itself to load; ngrok free interstitials block that flow. */
export function mobileTargetCanOpenWallet(target: string) {
  return mobileTargetIsPublicHttps(target) && !mobileTargetUsesNgrokFreeDomain(target)
}

/** Build a deeplink that loads the full target URL in MetaMask's in-app browser. */
export function getMetaMaskDappBrowserUrl(target: string) {
  try {
    const dapp = new URL(target)
    if (!isPublicHttpsUrl(dapp)) return null
    // Keep the hostname/path in the path parameter, but encode the target's
    // query and fragment so they are not parsed as parameters of link.metamask.io.
    const dappUrl = `${dapp.host}${dapp.pathname}${encodeURIComponent(dapp.search)}${encodeURIComponent(dapp.hash)}`
    return `https://link.metamask.io/dapp/${dappUrl}`
  } catch {
    return null
  }
}
export function buildCheckoutResumeUrl(target: string, checkout: {
  productName: string
  amount: number
  currency: 'USD'
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

export function getMobileWalletLaunchUrl(walletId: WalletId, target: string, networkId?: PaymentNetworkId) {
  const url = new URL(target)
  const walletBrowserUrl = (id: WalletId) => {
    const destination = new URL(url)
    destination.searchParams.set('gmWalletConnect', id)
    return destination
  }

  switch (walletId) {
    // This only opens the DApp browser; the provider requests address access
    // after the user taps Connect from inside that browser.
    case 'metamask': return getMetaMaskDappBrowserUrl(walletBrowserUrl(walletId).toString())
    // Free ngrok domains can interrupt native callbacks. Browse links open the
    // app's DApp browser first; the user then requests address access there.
    // On a clean HTTPS host, walletSession.ts keeps the encrypted native flow.
    case 'solflare': return mobileTargetUsesNgrokFreeDomain(url.toString())
      ? getSolflareDappBrowserUrl(walletBrowserUrl(walletId).toString())
      : null
    // Phantom's current mobile support path is its in-app browser. Open the
    // requested page there; once loaded, the injected provider handles connect.
    case 'phantom': return getPhantomDappBrowserUrl(walletBrowserUrl(walletId).toString())
    // Coinbase's universal link opens the target in its mobile DApp browser.
    case 'coinbase': return getCoinbaseDappBrowserUrl(walletBrowserUrl(walletId).toString())
    // Trust Wallet documents trust:// as the direct route when the app is
    // installed. The page then requests account access from its injected
    // provider; this link only navigates and never grants permission or pays.
    case 'trustwallet': return getTrustWalletDappBrowserUrl(walletBrowserUrl(walletId).toString(), networkId, true)
    case 'tronlink': {
      const request = { url: walletBrowserUrl(walletId).toString(), action: 'open', protocol: 'TronLink', version: '1.0' }
      return `tronlinkoutside://pull.activity?param=${encodeURIComponent(JSON.stringify(request))}`
    }
    default:
      return null
  }
}

export function getMobileWalletFallbackUrl(walletId: WalletId, target: string, networkId?: PaymentNetworkId) {
  const dapp = new URL(target)
  if (!isPublicHttpsUrl(dapp)) return null
  dapp.searchParams.set('gmWalletConnect', walletId)

  // These alternatives only navigate into the wallet's DApp browser. When the
  // URL carries gmWalletConnect, the page separately requests account access
  // after that wallet injects its provider.
  switch (walletId) {
    case 'metamask': return getMetaMaskDappBrowserUrl(dapp.toString())
    case 'coinbase': return getCoinbaseDappBrowserUrl(dapp.toString())
    case 'trustwallet': return getTrustWalletDappBrowserUrl(dapp.toString(), networkId)
    case 'tronlink': {
      const request = { url: dapp.toString(), action: 'open', protocol: 'TronLink', version: '1.0' }
      return `tronlinkoutside://pull.activity?param=${encodeURIComponent(JSON.stringify(request))}`
    }
    case 'solflare': return getSolflareDappBrowserUrl(dapp.toString())
    case 'phantom': return getPhantomDappBrowserUrl(dapp.toString())
    case 'unisat': return null
  }
}

function getTrustWalletDappBrowserUrl(target: string, networkId?: PaymentNetworkId, nativeScheme = false) {
  try {
    const dapp = new URL(target)
    if (!isPublicHttpsUrl(dapp)) return null
    const slip44ByNetwork: Record<PaymentNetworkId, number> = {
      ethereum: 60,
      bnb: 714,
      polygon: 966,
      solana: 501,
    }
    const link = new URL(nativeScheme ? 'trust://open_url' : 'https://link.trustwallet.com/open_url')
    link.searchParams.set('coin_id', String(slip44ByNetwork[networkId ?? 'bnb']))
    link.searchParams.set('url', dapp.toString())
    return link.toString()
  } catch {
    return null
  }
}

function getCoinbaseDappBrowserUrl(target: string) {
  try {
    const dapp = new URL(target)
    if (!isPublicHttpsUrl(dapp)) return null
    const link = new URL('https://go.cb-w.com/dapp')
    link.searchParams.set('cb_url', dapp.toString())
    return link.toString()
  } catch {
    return null
  }
}

function getSolflareDappBrowserUrl(target: string) {
  try {
    const dapp = new URL(target)
    if (!isPublicHttpsUrl(dapp)) return null
    return `https://solflare.com/ul/v1/browse/${encodeURIComponent(dapp.toString())}?ref=${encodeURIComponent(dapp.origin)}`
  } catch {
    return null
  }
}

function getPhantomDappBrowserUrl(target: string) {
  try {
    const dapp = new URL(target)
    if (!isPublicHttpsUrl(dapp)) return null
    return `https://phantom.com/ul/browse/${encodeURIComponent(dapp.toString())}?ref=${encodeURIComponent(dapp.origin)}`
  } catch {
    return null
  }
}
