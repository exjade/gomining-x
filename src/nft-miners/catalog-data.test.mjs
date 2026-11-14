import assert from 'node:assert/strict'
import test from 'node:test'
import { MINER_APPEARANCE_CATALOG_DATA, MINER_APPEARANCE_CATALOG_ENTRIES } from './catalog-data.ts'

test('catalog category outcome counts match the observed catalog', () => {
  assert.deepEqual(
    Object.fromEntries(MINER_APPEARANCE_CATALOG_DATA.editable.map(({ id, values }) => [id, values.length])),
    { wall: 10, body: 21, bottom: 3, fans: 21, screen: 21, buttons: 21, top: 10, stickers: 10 },
  )
  assert.deepEqual(
    Object.fromEntries(Object.entries(MINER_APPEARANCE_CATALOG_DATA.readOnly).map(([id, values]) => [id, values.length])),
    { display: 15, items: 7 },
  )
})

test('None is an observed outcome but not a trait or unlock entry', () => {
  const noneCategories = [
    ...MINER_APPEARANCE_CATALOG_DATA.editable.filter(({ values }) => values.includes('None')).map(({ id }) => id),
    ...Object.entries(MINER_APPEARANCE_CATALOG_DATA.readOnly).filter(([, values]) => values.includes('None')).map(([id]) => id),
  ]

  assert.deepEqual(noneCategories, ['top', 'stickers', 'items'])
  assert.equal(MINER_APPEARANCE_CATALOG_ENTRIES.length, 136)
  assert.ok(MINER_APPEARANCE_CATALOG_ENTRIES.every(({ value }) => value !== 'None'))
})
