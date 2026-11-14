import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  cleanupUserMinersSubscription,
  subscribeToSingleMinerDoc,
  subscribeToUserMiners,
} from '../src/userMinersStore.ts'
import type { StoredMiner } from '../src/firebase.ts'
import { customizationMinerFromStored } from '../src/nft-miners/miner-customization-model.ts'
import { saveOwnedMinerAppearance } from '../src/nft-miners/miner-customization-repository.ts'

afterEach(() => cleanupUserMinersSubscription())

function storedMiner(id: string): StoredMiner {
  return {
    id,
    uid: 'uid-real',
    packageId: 'minerx-01',
    name: `Miner ${id}`,
    powerTh: 1.46,
    efficiency: 15,
    efficiencyWattsPerTh: 15,
    price: 18.99,
    currency: 'USD',
    status: 'active',
    txHash: `tx-${id}`,
    network: 'PLATFORM_BALANCE',
    ownerWallet: 'INTERNAL',
    visualTraits: {} as StoredMiner['visualTraits'],
    packageSnapshot: {
      packageId: 'minerx-01',
      name: 'MinerX 01',
      powerTh: 1.46,
      price: 18.99,
      currency: 'USD',
    },
  }
}

test('SCRUM-240 selects the exact real miner through the shared listener', () => {
  const minerA = storedMiner('A')
  const minerB = storedMiner('B')
  let collectionNext: ((snapshot: any) => void) | undefined
  let collectionListeners = 0
  let documentListeners = 0
  const listen = (ref: any, onNext: (snapshot: any) => void) => {
    if (String(ref.path).split('/').length === 3) {
      collectionListeners += 1
      collectionNext = onNext
    } else {
      documentListeners += 1
    }
    return () => {}
  }

  const sharedUnsubscribe = subscribeToUserMiners('uid-real', () => {}, listen)
  collectionNext?.({
    docChanges: () => [
      { type: 'added', doc: { id: minerA.id, data: () => minerA } },
      { type: 'added', doc: { id: minerB.id, data: () => minerB } },
    ],
  })

  let selected: StoredMiner | null | undefined
  const detailUnsubscribe = subscribeToSingleMinerDoc('uid-real', 'B', (miner) => { selected = miner }, listen)

  assert.equal(collectionListeners, 1)
  assert.equal(documentListeners, 0)
  assert.equal(selected?.id, 'B')
  assert.notEqual(selected?.id, 'A')
  assert.equal(customizationMinerFromStored(selected as StoredMiner).id, 'B')
  assert.notEqual(minerB.packageId, selected?.id)

  detailUnsubscribe()
  sharedUnsubscribe()
})

test('SCRUM-240 deep-link fallback listens to only the requested document and reports missing ownership', () => {
  let documentNext: ((snapshot: any) => void) | undefined
  let documentListeners = 0
  const listen = (ref: any, onNext: (snapshot: any) => void) => {
    documentListeners += 1
    assert.equal(String(ref.path), 'miners/uid-real/miner/B')
    documentNext = onNext
    return () => {}
  }

  let selected: StoredMiner | null | undefined
  const unsubscribe = subscribeToSingleMinerDoc('uid-real', 'B', (miner) => { selected = miner }, listen)
  documentNext?.({ exists: () => true, id: 'B', data: () => storedMiner('B') })
  assert.equal(documentListeners, 1)
  assert.equal(selected?.id, 'B')

  documentNext?.({ exists: () => false, id: 'B', data: () => ({}) })
  assert.equal(selected, null)
  unsubscribe()
})

test('SCRUM-240 save writes only appearance on the exact owned document', async () => {
  const appearance = { wall_id: 'wall-blue', updatedAt: '2026-11-14T12:00:00.000Z' }
  let call: { uid: string; minerId: string; updates: { appearance: typeof appearance } } | undefined
  const commercialBefore = storedMiner('B')

  await saveOwnedMinerAppearance('uid-real', 'B', appearance, async (uid, minerId, updates) => {
    call = { uid, minerId, updates }
  })

  assert.deepEqual(call, { uid: 'uid-real', minerId: 'B', updates: { appearance } })
  assert.equal(commercialBefore.packageId, 'minerx-01')
  assert.deepEqual(commercialBefore.packageSnapshot, {
    packageId: 'minerx-01',
    name: 'MinerX 01',
    powerTh: 1.46,
    price: 18.99,
    currency: 'USD',
  })
})

test('SCRUM-240 real customizer has no prohibited synthetic miner fallbacks', () => {
  const source = readFileSync(resolve('src/nft-miners/MinerCustomizer.tsx'), 'utf8')
  assert.doesNotMatch(source, /demo\.miners\[0\]|bonus-miner-default|pkg-\$\{minerId\}/)
})
