import { APPEARANCE_PARTS, type AppearancePart } from './catalog-types.ts'
import { validateCustomizationCatalog, type CustomizationCatalog } from './catalog-contract.ts'
import { layeredCatalogFixture } from './__fixtures__/layered-catalog.ts'

const FIXTURE_VERSION = 'synthetic-layer-fixture-v1'
const FIXTURE_UPDATED_AT = '1970-01-01T00:00:00.000Z'

export function loadDevCatalogFixture(localSeed: CustomizationCatalog) {
  const defaultAppearance = Object.fromEntries(APPEARANCE_PARTS.map((part) => [part, layeredCatalogFixture.base.default_appearance[part]])) as Record<AppearancePart, string | null>
  const catalog: CustomizationCatalog = {
    version: FIXTURE_VERSION,
    base: {
      base_image_url: layeredCatalogFixture.base.base_image_url,
      fallback_image_url: null,
      canvas: { width: 600, height: 600 },
      layer_order: layeredCatalogFixture.base.layer_order,
      default_appearance: defaultAppearance,
      version: FIXTURE_VERSION,
      updated_at: FIXTURE_UPDATED_AT,
    },
    assets: layeredCatalogFixture.assets.map((asset) => ({
      ...asset,
      layer: { kind: 'overlay', canvas_w: 600, canvas_h: 600, offset_x: 0, offset_y: 0, scale: 1 },
      // Fixture-only access keeps visual composition testable without assigning product unlock decisions.
      unlock_rule: { operator: 'any', requirements: [{ kind: 'always' }] },
      benefit_ids: [],
      status: 'published',
      version: FIXTURE_VERSION,
      updated_at: FIXTURE_UPDATED_AT,
    })),
    levels: localSeed.levels,
    benefits: [],
  }
  return validateCustomizationCatalog(catalog, new Set(), true)
}
