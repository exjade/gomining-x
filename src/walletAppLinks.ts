export function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
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

  return host === '::' || host === '::1' || /^f[cd][\da-f]*:/i.test(host) || /^fe[89ab][\da-f]*:/i.test(host)
}

function isPublicHttpsUrl(url: URL) {
  return url.protocol === 'https:' && !url.username && !url.password && !isLocalOrPrivateHost(url.hostname)
}

export function mobileTargetIsPublicHttps(target: string) {
  try {
    return isPublicHttpsUrl(new URL(target))
  } catch {
    return false
  }
}

export function mobileTargetUsesNgrokFreeDomain(target: string) {
  try {
    const hostname = new URL(target).hostname.toLowerCase()
    return ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok-free.io', '.ngrok.io']
      .some((suffix) => hostname.endsWith(suffix))
  } catch {
    return false
  }
}

export function mobileTargetCanOpenWallet(target: string) {
  return mobileTargetIsPublicHttps(target) && !mobileTargetUsesNgrokFreeDomain(target)
}

/** Builds a tamper-resistant checkout resume URL carrying only the opaque server intentId. */
export function buildCheckoutResumeUrl(target: string, intentId: string): string {
  const url = new URL(target)
  for (const key of ['gmWalletConnect', 'gmPayCurrency', 'gmPayNetwork', 'gmPayWallet']) {
    url.searchParams.delete(key)
  }
  url.searchParams.set('gmPay', '1')
  url.searchParams.set('gmPayIntentId', intentId.trim())
  return url.toString()
}
