function normalizePathname(pathname: string) {
  const path = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase()
  return path || '/'
}

export function isPublicAppRoute(pathname: string) {
  return normalizePathname(pathname) === '/'
}

export function getAuthRouteRedirect(pathname: string, isAuthenticated: boolean) {
  const rawPath = pathname.split('?')[0].split('#')[0] || '/'
  const path = normalizePathname(pathname)
  if (!isAuthenticated && (!isPublicAppRoute(path) || rawPath !== '/')) return '/'
  if (isAuthenticated && path === '/') return '/home'
  return null
}
