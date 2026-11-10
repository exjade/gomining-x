import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  subscribeToUserMiners,
  subscribeToSingleMinerDoc,
  isUserMinersListenerActive,
  getUserMinersFromStore,
  getMinerFromSharedStore,
  cleanupUserMinersSubscription,
  applyMinerDocChanges,
} from '../../src/userMinersStore.ts'
import { getUserMiners, type StoredMiner } from '../../src/firebase.ts'

afterEach(() => {
  cleanupUserMinersSubscription()
})

test('R3.1 - applyMinerDocChanges: incremental added, modified, removed and stable ordering', () => {
  const map = new Map<string, StoredMiner>()

  // 1. Added
  const addedChanges = [
    {
      type: 'added' as const,
      doc: {
        id: 'miner-1',
        data: () => ({
          name: 'Miner 1',
          powerTh: 10,
          price: 100,
          currency: 'USD',
          status: 'active',
          createdAt: '2026-11-08T10:00:00Z',
        }),
      },
    },
    {
      type: 'added' as const,
      doc: {
        id: 'miner-2',
        data: () => ({
          name: 'Miner 2',
          powerTh: 20,
          price: 200,
          currency: 'USD',
          status: 'active',
          createdAt: '2026-11-08T11:00:00Z',
        }),
      },
    },
  ]

  const listAfterAdd = applyMinerDocChanges(map, addedChanges)
  assert.equal(listAfterAdd.length, 2)
  assert.equal(listAfterAdd[0].id, 'miner-2', 'Newer miner should come first')
  assert.equal(listAfterAdd[1].id, 'miner-1')

  // 2. Modified: updates only the affected miner
  const modifiedChanges = [
    {
      type: 'modified' as const,
      doc: {
        id: 'miner-1',
        data: () => ({
          name: 'Miner 1 Upgraded',
          powerTh: 15,
          price: 100,
          currency: 'USD',
          status: 'active',
          createdAt: '2026-11-08T10:00:00Z',
        }),
      },
    },
  ]

  const listAfterMod = applyMinerDocChanges(map, modifiedChanges)
  assert.equal(listAfterMod.length, 2)
  const updatedMiner1 = map.get('miner-1')
  assert.equal(updatedMiner1?.name, 'Miner 1 Upgraded')
  assert.equal(updatedMiner1?.powerTh, 15)
  // miner-2 was untouched
  assert.equal(map.get('miner-2')?.powerTh, 20)

  // 3. Removed: deletes from map
  const removedChanges = [
    {
      type: 'removed' as const,
      doc: {
        id: 'miner-2',
        data: () => ({}),
      },
    },
  ]

  const listAfterRem = applyMinerDocChanges(map, removedChanges)
  assert.equal(listAfterRem.length, 1)
  assert.equal(listAfterRem[0].id, 'miner-1')
  assert.equal(map.has('miner-2'), false)
})

test('R3.2 - subscribeToUserMiners: single collection listener shared across consumers with reference counting', () => {
  let firestoreListenerAttachedCount = 0
  let firestoreUnsubscribedCount = 0

  const mockOnSnapshot = (_query: any, onNext: (snap: any) => void) => {
    firestoreListenerAttachedCount++
    // Simulate initial snapshot
    onNext({
      docChanges: () => [
        {
          type: 'added',
          doc: {
            id: 'm-init',
            data: () => ({ name: 'Initial Miner', powerTh: 10, createdAt: '2026-11-08T00:00:00Z' }),
          },
        },
      ],
    })
    return () => {
      firestoreUnsubscribedCount++
    }
  }

  const uid = 'test_user_shared_listener'
  let list1: StoredMiner[] = []
  let list2: StoredMiner[] = []

  // Consumer 1 connects
  const unsub1 = subscribeToUserMiners(uid, (miners) => { list1 = miners }, mockOnSnapshot)
  assert.equal(firestoreListenerAttachedCount, 1, 'First consumer attaches onSnapshot')
  assert.equal(list1.length, 1)
  assert.equal(list1[0].id, 'm-init')

  // Consumer 2 connects to the SAME uid
  const unsub2 = subscribeToUserMiners(uid, (miners) => { list2 = miners }, mockOnSnapshot)
  assert.equal(firestoreListenerAttachedCount, 1, 'Second consumer must NOT attach duplicate onSnapshot')
  assert.equal(list2.length, 1)
  assert.equal(list2[0].id, 'm-init')

  // Consumer 1 unmounts: listener must stay alive
  unsub1()
  assert.equal(firestoreUnsubscribedCount, 0, 'Listener must NOT unsubscribe while consumer 2 remains')
  assert.equal(isUserMinersListenerActive(uid), true)

  // Consumer 2 unmounts: listener is cleanly unsubscribed
  unsub2()
  assert.equal(firestoreUnsubscribedCount, 1, 'Listener unsubscribes cleanly when last consumer unmounts')
  assert.equal(isUserMinersListenerActive(uid), false)
})

test('R3.3 - getUserMiners reuses in-memory store without parallel getDocs when listener is active', async () => {
  const uid = 'test_user_memory_reuse'
  const mockOnSnapshot = (_query: any, onNext: (snap: any) => void) => {
    onNext({
      docChanges: () => [
        {
          type: 'added',
          doc: {
            id: 'cached-m1',
            data: () => ({ name: 'Cached Miner', powerTh: 25, createdAt: '2026-11-08T00:00:00Z' }),
          },
        },
      ],
    })
    return () => {}
  }

  const unsub = subscribeToUserMiners(uid, () => {}, mockOnSnapshot)

  // When store is initialized and active, getUserMiners returns memory store without getDocs
  const cachedList = await getUserMiners(uid)
  assert.equal(cachedList.length, 1)
  assert.equal(cachedList[0].id, 'cached-m1')

  unsub()
})

test('R3.4 - cleanupUserMinersSubscription tears down listener on logout', () => {
  let unsubCalls = 0
  const mockOnSnapshot = () => {
    return () => {
      unsubCalls++
    }
  }

  const uid = 'test_logout_user'
  subscribeToUserMiners(uid, () => {}, mockOnSnapshot)
  assert.equal(isUserMinersListenerActive(uid), true)

  cleanupUserMinersSubscription()
  assert.equal(unsubCalls, 1, 'Logout must trigger cleanup of the Firestore listener')
  assert.equal(isUserMinersListenerActive(uid), false)
})

test('R3.5 - Customizer: reuses shared store if available; single doc listener if deep-linked; not-found if missing', () => {
  const uid = 'customizer_user'
  const minerId = 'miner-shared-42'

  const mockOnSnapshot = (_query: any, onNext: (snap: any) => void) => {
    onNext({
      docChanges: () => [
        {
          type: 'added',
          doc: {
            id: minerId,
            data: () => ({ name: 'Shared Miner 42', powerTh: 42, createdAt: '2026-11-08T00:00:00Z' }),
          },
        },
      ],
    })
    return () => {}
  }

  // 1. Shared store contains the miner -> directly reused
  const unsubCol = subscribeToUserMiners(uid, () => {}, mockOnSnapshot)
  const sharedMiner = getMinerFromSharedStore(uid, minerId)
  assert.ok(sharedMiner)
  assert.equal(sharedMiner.id, minerId)

  // subscribeToSingleMinerDoc reuses shared store directly without opening a doc listener
  let receivedMiner: StoredMiner | null = null
  let docListenerOpened = false
  const unsubDoc = subscribeToSingleMinerDoc(
    uid,
    minerId,
    (m) => { receivedMiner = m },
    () => { docListenerOpened = true; return () => {} }
  )

  assert.equal(docListenerOpened, false, 'Must NOT open document listener when shared collection listener already has data')
  assert.equal(receivedMiner?.id, minerId)
  unsubDoc()
  unsubCol()

  // 2. Cleaned up: Deep link with no collection listener opens at most one doc listener
  cleanupUserMinersSubscription()
  let deepDocListeners = 0
  const mockDocOnSnapshot = (_ref: any, onNext: (snap: any) => void) => {
    deepDocListeners++
    onNext({
      exists: () => false, // Non-existent miner
      id: 'missing-miner-999',
      data: () => ({}),
    })
    return () => {}
  }

  let notFoundResult: StoredMiner | null = 'not-null' as any
  const unsubDeep = subscribeToSingleMinerDoc(
    uid,
    'missing-miner-999',
    (m) => { notFoundResult = m },
    mockDocOnSnapshot
  )

  assert.equal(deepDocListeners, 1, 'Deep-link opens at most one doc listener')
  assert.equal(notFoundResult, null, 'Non-existent miner must return null, with zero synthetic fallback')
  unsubDeep()
})

test('R3.6 - Account switching cleanly unsubscribes previous UID listener and connects new UID listener', () => {
  let userAListenerActive = 0
  let userAUnsubscribed = 0
  let userBListenerActive = 0

  const mockOnSnapshotUserA = (_query: any, onNext: (snap: any) => void) => {
    userAListenerActive++
    onNext({
      docChanges: () => [
        {
          type: 'added',
          doc: { id: 'miner-a1', data: () => ({ name: 'Miner A1', powerTh: 10, createdAt: '2026-11-08T00:00:00Z' }) },
        },
      ],
    })
    return () => {
      userAUnsubscribed++
    }
  }

  const mockOnSnapshotUserB = (_query: any, onNext: (snap: any) => void) => {
    userBListenerActive++
    onNext({
      docChanges: () => [
        {
          type: 'added',
          doc: { id: 'miner-b1', data: () => ({ name: 'Miner B1', powerTh: 20, createdAt: '2026-11-08T00:00:00Z' }) },
        },
      ],
    })
    return () => {}
  }

  // 1. User A logs in and attaches shared listener
  let userAMiners: StoredMiner[] = []
  const unsubA = subscribeToUserMiners('user_alpha', (miners) => { userAMiners = miners }, mockOnSnapshotUserA)
  assert.equal(userAListenerActive, 1)
  assert.equal(userAMiners.length, 1)
  assert.equal(userAMiners[0].id, 'miner-a1')
  assert.equal(isUserMinersListenerActive('user_alpha'), true)

  // 2. User B logs in (account switch in same session)
  let userBMiners: StoredMiner[] = []
  const unsubB = subscribeToUserMiners('user_beta', (miners) => { userBMiners = miners }, mockOnSnapshotUserB)

  // User A's listener must have been cleanly unsubscribed
  assert.equal(userAUnsubscribed, 1, 'Previous user listener must be unsubscribed')
  assert.equal(isUserMinersListenerActive('user_alpha'), false, 'User A listener must be inactive')

  // User B's listener is now active
  assert.equal(userBListenerActive, 1, 'New user listener must be attached')
  assert.equal(isUserMinersListenerActive('user_beta'), true, 'User B listener must be active')
  assert.equal(userBMiners.length, 1)
  assert.equal(userBMiners[0].id, 'miner-b1')

  unsubA()
  unsubB()
})

test('R3.7 - subscribeToSingleMinerDoc receives realtime updates when shared collection listener updates', () => {
  let snapshotCallback: (snap: any) => void = () => {}

  const mockOnSnapshot = (_query: any, onNext: (snap: any) => void) => {
    snapshotCallback = onNext
    onNext({
      docChanges: () => [
        {
          type: 'added',
          doc: { id: 'miner-rt-1', data: () => ({ name: 'Realtime Miner', powerTh: 30, createdAt: '2026-11-08T00:00:00Z' }) },
        },
      ],
    })
    return () => {}
  }

  const uid = 'user_realtime_updates'
  const unsubCol = subscribeToUserMiners(uid, () => {}, mockOnSnapshot)

  let singleDocUpdates: StoredMiner[] = []
  let docListenersOpened = 0
  const unsubDoc = subscribeToSingleMinerDoc(
    uid,
    'miner-rt-1',
    (miner) => {
      if (miner) singleDocUpdates.push(miner)
    },
    () => { docListenersOpened++; return () => {} }
  )

  assert.equal(docListenersOpened, 0, 'Must NOT open document listener when shared collection is active')
  assert.equal(singleDocUpdates.length, 1)
  assert.equal(singleDocUpdates[0].name, 'Realtime Miner')

  // Simulate collection listener receiving an incremental 'modified' change
  snapshotCallback({
    docChanges: () => [
      {
        type: 'modified',
        doc: { id: 'miner-rt-1', data: () => ({ name: 'Realtime Miner Overclocked', powerTh: 35, createdAt: '2026-11-08T00:00:00Z' }) },
      },
    ],
  })

  assert.equal(singleDocUpdates.length, 2)
  assert.equal(singleDocUpdates[1].name, 'Realtime Miner Overclocked')
  assert.equal(singleDocUpdates[1].powerTh, 35)

  unsubDoc()
  unsubCol()
})

test('R3.8 - stable descending ordering across cachedList and late subscribers with Firestore Timestamps and ISO strings', () => {
  const uid = 'user_order_validation'

  const mockOnSnapshot = (_query: any, onNext: (snap: any) => void) => {
    onNext({
      docChanges: () => [
        {
          type: 'added',
          doc: {
            id: 'm-old',
            data: () => ({
              name: 'Old Miner',
              powerTh: 10,
              createdAt: '2026-11-01T00:00:00Z',
            }),
          },
        },
        {
          type: 'added',
          doc: {
            id: 'm-new-iso',
            data: () => ({
              name: 'New ISO Miner',
              powerTh: 20,
              createdAt: null,
              createdAtIso: '2026-11-08T12:00:00Z',
            }),
          },
        },
        {
          type: 'added',
          doc: {
            id: 'm-newest-timestamp',
            data: () => ({
              name: 'Newest Timestamp Miner',
              powerTh: 30,
              createdAt: { toMillis: () => Date.parse('2026-11-08T18:00:00Z') },
            }),
          },
        },
      ],
    })
    return () => {}
  }

  let initialMiners: StoredMiner[] = []
  const unsub1 = subscribeToUserMiners(uid, (miners) => { initialMiners = miners }, mockOnSnapshot)

  // Verify initial subscriber received descending order: newest -> middle -> oldest
  assert.equal(initialMiners.length, 3)
  assert.equal(initialMiners[0].id, 'm-newest-timestamp')
  assert.equal(initialMiners[1].id, 'm-new-iso')
  assert.equal(initialMiners[2].id, 'm-old')

  // Late subscriber connects: MUST receive identical descending order from cachedList
  let lateMiners: StoredMiner[] = []
  const unsub2 = subscribeToUserMiners(uid, (miners) => { lateMiners = miners }, mockOnSnapshot)

  assert.equal(lateMiners.length, 3)
  assert.equal(lateMiners[0].id, 'm-newest-timestamp')
  assert.equal(lateMiners[1].id, 'm-new-iso')
  assert.equal(lateMiners[2].id, 'm-old')

  // getUserMinersFromStore must also return identical descending order
  const storeMiners = getUserMinersFromStore(uid)
  assert.ok(storeMiners)
  assert.equal(storeMiners[0].id, 'm-newest-timestamp')
  assert.equal(storeMiners[1].id, 'm-new-iso')
  assert.equal(storeMiners[2].id, 'm-old')

  unsub1()
  unsub2()
})

test('R3.9 - cleanupUserMinersSubscription is safe and idempotent when invoked multiple times', () => {
  cleanupUserMinersSubscription()
  cleanupUserMinersSubscription()
  assert.equal(isUserMinersListenerActive('any_user'), false)
})

test('R3.10 - getUserMiners reuses active initializing subscription without firing parallel getDocs', async () => {
  const uid = 'user_async_init_test'
  let delayedSnapshot: ((snap: any) => void) | null = null

  const mockOnSnapshot = (_query: any, onNext: (snap: any) => void) => {
    // Hold snapshot resolution until triggered
    delayedSnapshot = onNext
    return () => {}
  }

  const unsub = subscribeToUserMiners(uid, () => {}, mockOnSnapshot)
  assert.equal(isUserMinersListenerActive(uid), true)
  assert.equal(getUserMinersFromStore(uid), null, 'Store is not yet initialized')

  // Calling getUserMiners while listener is active awaits initialization without getDocs
  const pendingMinersPromise = getUserMiners(uid)

  // Deliver the delayed initial snapshot
  delayedSnapshot!({
    docChanges: () => [
      {
        type: 'added',
        doc: { id: 'm-async-1', data: () => ({ name: 'Async Miner', powerTh: 10, createdAt: '2026-11-08T00:00:00Z' }) },
      },
    ],
  })

  const miners = await pendingMinersPromise
  assert.equal(miners.length, 1)
  assert.equal(miners[0].id, 'm-async-1')

  unsub()
})

test('R3.11 - onSnapshot error notifies subscribers and sets initialized to prevent UI hanging', () => {
  const uid = 'user_error_test'
  let errorCallback: ((err: any) => void) | null = null

  const mockOnSnapshot = (_query: any, _onNext: any, onError: (err: any) => void) => {
    errorCallback = onError
    return () => {}
  }

  let notifiedList: StoredMiner[] | null = null
  const unsub = subscribeToUserMiners(uid, (miners) => {
    notifiedList = miners
  }, mockOnSnapshot)

  // Trigger error
  errorCallback!(new Error('Permission denied or network down'))

  // Subscribers should have received fallback list and listener is initialized
  assert.ok(notifiedList !== null)
  assert.equal(getUserMinersFromStore(uid)?.length, 0)

  unsub()
})
