import test from 'node:test'
import assert from 'node:assert/strict'
import { appearanceCategoriesFromCatalog, LocalSeedCatalogAdapter, LOCAL_SEED_CATALOG } from '../../src/nft-miners/catalog-repository.ts'
import { loadDevCatalogFixture } from '../../src/nft-miners/dev-catalog-fixture.ts'

test('local seed repository exposes purchase catalog traits and the global level shell', async () => {
  const catalog = await new LocalSeedCatalogAdapter().load()
  const categories = appearanceCategoriesFromCatalog(catalog)
  assert.deepEqual(Object.fromEntries(categories.map((category) => [category.id, category.traits.length])), {
    wall: 10, body: 21, bottom: 3, fans: 21, screen: 21, buttons: 21, top: 9, stickers: 9,
  })
  assert.equal(catalog.levels.length, 20)
  assert.ok(catalog.levels.every((level) => level.benefit_ids.length === 0 && level.is_active))
  assert.deepEqual(catalog.benefits, [])
})

test('catalog managed action copy reaches locked-trait presentation fields', async () => {
  const catalog = await new LocalSeedCatalogAdapter().load()
  const wallAsset = catalog.assets.find((asset) => asset.part === 'wall')
  const customizedCatalog = {
    ...catalog,
    assets: catalog.assets.map((asset) => asset === wallAsset ? {
      ...asset,
      description_es: 'EXAMPLE-NOT-DECISION explicación',
      button_text: 'EXAMPLE-NOT-DECISION acción',
      link_to: 'https://example.invalid/action',
    } : asset),
  }
  const [wall] = appearanceCategoriesFromCatalog(customizedCatalog)
  assert.equal(wall.traits[0].description, 'EXAMPLE-NOT-DECISION explicación')
  assert.equal(wall.traits[0].button_text, 'EXAMPLE-NOT-DECISION acción')
  assert.equal(wall.traits[0].link_to_task, 'https://example.invalid/action')
})

test('the picker includes published assets and leaves upcoming presentation to access requirements', async () => {
  const catalog = await new LocalSeedCatalogAdapter().load()
  const wallAssets = catalog.assets.filter((asset) => asset.part === 'wall')
  const pickerCatalog = {
    ...catalog,
    assets: [
      { ...wallAssets[0], status: 'draft' },
      { ...wallAssets[1], unlock_rule: { operator: 'all', requirements: [{ kind: 'upcoming' }] } },
    ],
  }
  const [wall] = appearanceCategoriesFromCatalog(pickerCatalog)
  assert.deepEqual(wall.traits.map((trait) => trait.trait_id), [wallAssets[1].trait_id])
  assert.equal(wall.traits[0].status, 'Available')
})

test('the dev catalog layers fixture art onto the supplied local seed without importing the repository', () => {
  const catalog = loadDevCatalogFixture(LOCAL_SEED_CATALOG)
  const fixtureAssets = catalog.assets.filter((asset) => asset.asset_id.startsWith('fixture-'))
  assert.equal(fixtureAssets.length, 24)
  assert.ok(fixtureAssets.every((asset) => asset.asset_url.startsWith('data:image/svg+xml')))
  assert.ok(catalog.base.base_image_url.startsWith('data:image/svg+xml'))
})
