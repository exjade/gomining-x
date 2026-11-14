import type { CustomizationCatalog } from './catalog-contract'

export function unlockRulesFromCatalog(catalog: Pick<CustomizationCatalog, 'assets'>) {
  return new Map(catalog.assets.flatMap((asset) => {
    if (asset.unlock_rule) return [[asset.trait_id, asset.unlock_rule] as const]
    return []
  }))
}
