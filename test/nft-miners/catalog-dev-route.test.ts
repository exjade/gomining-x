import assert from 'node:assert/strict'
import test from 'node:test'
import { isDevCatalogLabRequest } from '../../src/nft-miners/catalog-dev-route.ts'

test('synthetic catalog query is limited to the dev lab route', () => {
  assert.equal(isDevCatalogLabRequest(true, '/nft-miners/__lab', '?__devCatalog=fixture'), true)
  assert.equal(isDevCatalogLabRequest(true, '/nft-miners/__lab/customize', '?__devCatalog=fixture'), true)
  assert.equal(isDevCatalogLabRequest(false, '/nft-miners/__lab', '?__devCatalog=fixture'), false)
  assert.equal(isDevCatalogLabRequest(true, '/nft-miners/MINER-MW96QFAA-002', '?__devCatalog=fixture'), false)
  assert.equal(isDevCatalogLabRequest(true, '/nft-miners/MINER-MW96QFAA-002/customize', '?__devCatalog=fixture'), false)
})
