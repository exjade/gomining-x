function normalizePathname(pathname: string) {
  const path = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase()
  return path || '/'
}

export function isPublicAppRoute(pathname: string) {
  return normalizePathname(pathname) === '/'
}

export function getAuthRouteRedirect(
  pathname: string,
  isAuthenticated: boolean,
  gate?: {
    hasCompletedPurchase?: boolean
    isEmailVerified?: boolean
    isCheckoutOrBuilderOpen?: boolean
  },
) {
  const rawPath = pathname.split('?')[0].split('#')[0] || '/'
  const path = normalizePathname(pathname)
  if (!isAuthenticated && (!isPublicAppRoute(path) || rawPath !== '/')) return '/'
  if (isAuthenticated && path === '/') return '/home'
  if (
    isAuthenticated &&
    gate?.hasCompletedPurchase &&
    gate.isEmailVerified === false &&
    !gate.isCheckoutOrBuilderOpen &&
    path !== '/home'
  ) {
    return '/home'
  }
  return null
}
