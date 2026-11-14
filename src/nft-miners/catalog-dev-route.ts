export function isDevCatalogLabRequest(devEnabled: boolean, pathname: string, search: string) {
  const isLabRoute = pathname === '/nft-miners/__lab' || pathname === '/nft-miners/__lab/customize'
  return devEnabled && isLabRoute && new URLSearchParams(search).get('__devCatalog') === 'fixture'
}
