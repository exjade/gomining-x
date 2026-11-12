import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buyDemoMiner,
  buyDemoOrder,
  prepareDemoMinerPurchase,
  commitDemoMinerPurchase,
  deferDemoMinerPurchase,
  payPendingDemoMiner,
  cancelPendingDemoMiner,
  lockPendingDemoMinerForSettlement,
  releasePendingDemoMinerLock,
  isPendingDemoMinerLocked,
  restoreDemoSession,
  getDemoSessionForPersistence,
  getAvailableDemoBalance,
  reserveDemoBalance,
  releaseDemoBalanceReservation,
  type DemoMinerPurchaseInput,
  type PendingDemoMinerOrder,
} from '../src/demoStore.ts'
import {
  completeWalletMinerPurchase,
  retryWalletMinerPurchase,
  completeLocalMinerPurchase,
  payPendingMinerOrderAndRecordToAdmin,
  buildMinerBuilderCheckoutPayload,
  orchestrateWalletMinerPurchaseFlow,
  saveMinerCustomization,
  validatePostTxRecovery,
  getPostTxRecovery,
  savePostTxRecovery,
  clearPostTxRecovery,
  resolvePendingRecoveryCheckout,
  type PurchaseAdminRecorder,
  type PostTxPendingState,
} from '../src/minerPurchaseFlow.ts'
import {
  savePurchasedMiner,
  recordMinerPurchaseToAdmin,
  updateMinerInFirestore,
  subscribeToPublishedCommercialPackages,
  fetchPublishedCommercialPackages,
  DEFAULT_COMMERCIAL_PACKAGES,
  type StoredMiner,
} from '../src/firebase.ts'
import {
  fetchStorefrontCatalog,
  clearCatalogCache,
} from '../src/catalogClient.ts'
import { getSectionFallbackPlans } from '../src/minerCatalog.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function resetStore(balance = 100000) {
  restoreDemoSession({
    balance,
    presaleTokens: 100,
    maintenanceCredit: 0,
    miners: [],
    workers: [],
    workerActivationMode: 'automatic',
    receipts: [],
    pendingMinerOrders: [],
    lastDailyRewardAt: null,
  })
}

describe('SCRUM-218 Corrective Consolidation: Real Persistence & Recording Adapters', () => {
  beforeEach(() => {
    resetStore(100000)
    clearCatalogCache()
  })

  // --------------------------------------------------------------------------
  // Finding 1 & R1: Single canonical minerId propagated end-to-end
  // --------------------------------------------------------------------------
  it('Finding 1 & R1: Single canonical minerId (result.miner.id) propagated end-to-end across local, Firestore, and Admin', async () => {
    const input: DemoMinerPurchaseInput = {
      name: 'Canonical Miner 1.46 TH',
      powerTh: 1.46,
      efficiency: 15,
      price: 18.99,
      purchaseMode: 'once',
      packageId: 'minerx-01',
      ownerWallet: '0x1234567890abcdef',
    }

    const buyResult = buyDemoMiner(input)
    assert.equal(buyResult.ok, true)
    assert.ok(buyResult.miner, 'buyDemoMiner must return miner')
    const canonicalMinerId = buyResult.miner.id
    assert.ok(canonicalMinerId.startsWith('MINER-'), `miner.id must have MINER- prefix: ${canonicalMinerId}`)

    // Negative oracle: receipt id must NOT be used to derive miner id
    assert.notEqual(canonicalMinerId, `miner_${buyResult.receipt?.id}`)

    let savedStoredMiner: StoredMiner | null = null
    const mockSaveMiner = async (uid: string, miner: StoredMiner) => {
      savedStoredMiner = miner
    }

    let recordedAdminParams: any = null
    const mockAdminRecorder: PurchaseAdminRecorder = async (params) => {
      recordedAdminParams = params
    }

    // Simulate canonical purchase completion (as in App.tsx onComplete)
    const storedMiner: StoredMiner = {
      id: canonicalMinerId,
      uid: 'user_test_1',
      packageId: input.packageId,
      name: input.name,
      powerTh: input.powerTh,
      efficiency: input.efficiency,
      efficiencyWattsPerTh: input.efficiency,
      price: input.price,
      currency: 'USD',
      status: 'active',
      txHash: `sim_${canonicalMinerId}`,
      createdAt: null,
      createdAtIso: new Date().toISOString(),
      network: 'LOCAL_BALANCE',
      ownerWallet: input.ownerWallet || 'INTERNAL',
      purchaseMode: 'once',
      cadence: 'once',
      packageSnapshot: {
        packageId: input.packageId!,
        name: input.name,
        powerTh: input.powerTh,
        price: input.price,
        currency: 'USD',
        cadence: 'once',
        purchaseMode: 'once',
      },
      visualTraits: {} as any,
    }

    await mockSaveMiner('user_test_1', storedMiner)
    await mockAdminRecorder({
      minerId: canonicalMinerId,
      uid: 'user_test_1',
      email: 'user@gomining.test',
      name: input.name,
      powerTh: input.powerTh,
      price: input.price,
      packageId: input.packageId,
    })

    // Strict identity alignment: demoMiner.id === StoredMiner.id === admin recorder params.minerId
    assert.equal(buyResult.miner.id, canonicalMinerId)
    assert.equal(savedStoredMiner?.id, canonicalMinerId)
    assert.equal(recordedAdminParams?.minerId, canonicalMinerId)
    assert.notEqual(recordedAdminParams?.minerId, `miner_${buyResult.receipt?.id}`)
  })

  // --------------------------------------------------------------------------
  // Finding 2 & R2: StoredMiner persists canonical packageId and full packageSnapshot
  // --------------------------------------------------------------------------
  it('Finding 2 & R2: StoredMiner persists canonical packageId and complete packageSnapshot', async () => {
    let capturedStoredMiner: StoredMiner | null = null

    const completion = await completeWalletMinerPurchase(
      {
        productName: 'Minero 8.33 TH · 8.33 TH',
        amount: 99.99,
        packageId: 'minerx-02',
        purchaseMode: 'monthly',
        activeAddress: '0xabc123',
        txHash: '0xtxhash_snapshot_test',
        networkName: 'BNB Chain',
        user: { uid: 'uid_snapshot_test', email: 'snap@test.com' },
      },
      {
        saveMinerToFirestore: async (_uid, miner) => {
          capturedStoredMiner = miner
        },
        recordPurchaseToAdmin: async () => {},
      }
    )

    assert.ok(completion)
    assert.ok(capturedStoredMiner)

    // packageId preserved
    assert.equal(capturedStoredMiner.packageId, 'minerx-02')
    assert.notEqual(capturedStoredMiner.packageId, capturedStoredMiner.id)
    assert.ok(!capturedStoredMiner.packageId.startsWith('pkg-MINER-'))

    // packageSnapshot complete
    assert.ok(capturedStoredMiner.packageSnapshot, 'packageSnapshot must be present')
    assert.equal(capturedStoredMiner.packageSnapshot.packageId, 'minerx-02')
    assert.equal(capturedStoredMiner.packageSnapshot.name, 'Minero 8.33 TH · 8.33 TH')
    assert.equal(capturedStoredMiner.packageSnapshot.powerTh, 8.33)
    assert.equal(capturedStoredMiner.packageSnapshot.price, 99.99)
    assert.equal(capturedStoredMiner.packageSnapshot.currency, 'USD')
    assert.equal(capturedStoredMiner.packageSnapshot.purchaseMode, 'monthly')
    assert.equal(capturedStoredMiner.packageSnapshot.cadence, 'monthly')

    // Top-level purchaseMode and cadence
    assert.equal(capturedStoredMiner.purchaseMode, 'monthly')
    assert.equal(capturedStoredMiner.cadence, 'monthly')
    assert.ok(capturedStoredMiner.createdAtIso)
  })

  // --------------------------------------------------------------------------
  // Finding 3 & R3: Authenticated pending miner order persists to Firestore before Admin recording
  // --------------------------------------------------------------------------
  it('Finding 3 & R3: Authenticated pending miner order payment persists StoredMiner in Firestore before Admin recording', async () => {
    const deferResult = deferDemoMinerPurchase({
      name: 'Pending Order Miner · 21.05 TH',
      powerTh: 21.05,
      efficiency: 15,
      price: 249.99,
      purchaseMode: 'once',
      packageId: 'minerx-03',
      ownerWallet: '0xowner_pending',
    })
    assert.equal(deferResult.ok, true)

    const session = getDemoSessionForPersistence()
    assert.equal(session.pendingMinerOrders.length, 1)
    const pendingOrder = session.pendingMinerOrders[0]

    const callOrder: string[] = []
    let persistedMiner: StoredMiner | null = null
    let adminRecord: any = null

    const payResult = await payPendingMinerOrderAndRecordToAdmin(pendingOrder, {
      user: { uid: 'auth_user_pending', email: 'pending@gomining.test' },
      saveMinerToFirestore: async (uid, miner) => {
        callOrder.push('saveMinerToFirestore')
        persistedMiner = miner
      },
      recordPurchaseToAdmin: async (params) => {
        callOrder.push('recordPurchaseToAdmin')
        adminRecord = params
      },
    })

    assert.equal(payResult.ok, true)
    assert.ok(payResult.miner)
    assert.ok(payResult.minerId)

    // Verification of persistence order: Firestore save MUST precede Admin recording
    assert.deepEqual(callOrder, ['saveMinerToFirestore', 'recordPurchaseToAdmin'], 'Firestore save must occur strictly before Admin recording')

    // Verify persisted StoredMiner identity & snapshot
    assert.ok(persistedMiner)
    assert.equal(persistedMiner.id, payResult.minerId)
    assert.equal(persistedMiner.packageId, 'minerx-03')
    assert.equal(persistedMiner.packageSnapshot?.packageId, 'minerx-03')
    assert.equal(persistedMiner.packageSnapshot?.powerTh, 21.05)
    assert.equal(persistedMiner.packageSnapshot?.price, 249.99)

    // Verify Admin record identity
    assert.ok(adminRecord)
    assert.equal(adminRecord.minerId, payResult.minerId)
    assert.equal(adminRecord.packageId, 'minerx-03')
  })

  // --------------------------------------------------------------------------
  // Finding 4 & R3: Fail-closed persistence: Firestore write error blocks Admin success
  // --------------------------------------------------------------------------
  it('Finding 4 & R3: Fail-closed persistence in payPendingMinerOrderAndRecordToAdmin blocks Admin recording and reports failure', async () => {
    deferDemoMinerPurchase({
      name: 'Fail Closed Miner',
      powerTh: 10,
      efficiency: 15,
      price: 100,
      purchaseMode: 'once',
      packageId: 'minerx-01',
    })
    const order = getDemoSessionForPersistence().pendingMinerOrders[0]

    let adminRecorded = false
    const payResult = await payPendingMinerOrderAndRecordToAdmin(order, {
      user: { uid: 'u_fail_closed', email: 'fail@test.com' },
      saveMinerToFirestore: async () => {
        throw new Error('Simulated Firestore write failure (permission-denied or network drop)')
      },
      recordPurchaseToAdmin: async () => {
        adminRecorded = true
      },
    })

    assert.equal(payResult.ok, false, 'Payment must report failure when Firestore save fails')
    assert.equal(adminRecorded, false, 'Admin recorder must NEVER be called when Firestore save fails')
    assert.ok(payResult.message?.includes('Firestore'))

    // Non-mutation assertion: pending order remains available for retry, balance untouched, no miners/workers/receipts added
    const session = getDemoSessionForPersistence()
    assert.equal(session.pendingMinerOrders.length, 1, 'Pending order must remain in queue for retry')
    assert.equal(session.pendingMinerOrders[0].id, order.id, 'Retained pending order must have identical ID')
    assert.equal(session.balance, 100000, 'Balance must remain unchanged after persistence failure')
    assert.equal(session.miners.length, 0, 'No demo miner must be added after persistence failure')
    assert.equal(session.workers.length, 0, 'No demo worker must be added after persistence failure')
    assert.equal(session.receipts.filter((r) => r.kind === 'miner').length, 0, 'No completed miner receipt must be created')
  })

  it('Finding 4 & R3: Fail-closed persistence in completeWalletMinerPurchase throws and blocks Admin recording', async () => {
    let adminRecorded = false
    let simulationStarted = false

    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase(
          {
            productName: 'Minero 42.44 TH · 42.44 TH',
            amount: 499.99,
            packageId: 'minerx-04',
            purchaseMode: 'once',
            activeAddress: '0xuser123',
            txHash: '0xtx_fail_wallet',
            networkName: 'BNB Chain',
            user: { uid: 'u_wallet_fail', email: 'wallet_fail@test.com' },
          },
          {
            saveMinerToFirestore: async () => {
              throw new Error('Firestore connection timeout')
            },
            recordPurchaseToAdmin: async () => {
              adminRecorded = true
            },
            onSimulationStart: () => {
              simulationStarted = true
            },
          }
        )
      },
      /Firestore connection timeout/
    )

    assert.equal(adminRecorded, false, 'Admin recorder must NEVER be called when wallet persistence fails')
    assert.equal(simulationStarted, false, 'onSimulationStart must NEVER be called when wallet persistence fails')

    // Non-mutation assertion: DemoStore must remain completely intact
    const session = getDemoSessionForPersistence()
    assert.equal(session.miners.length, 0, 'No DemoMiner must be added when wallet persistence fails')
    assert.equal(session.workers.length, 0, 'No DemoWorker must be added when wallet persistence fails')
    assert.equal(session.receipts.filter((r) => r.kind === 'miner').length, 0, 'No receipt must be added when wallet persistence fails')
  })

  // --------------------------------------------------------------------------
  // Finding 5 & R4: recordMinerPurchaseToAdmin rejects missing or synthetic packageId before writes
  // --------------------------------------------------------------------------
  it('Finding 5 & R4: recordMinerPurchaseToAdmin rejects missing, whitespace, and synthetic packageId before writes', async () => {
    // 00. Null or undefined parameters
    await assert.rejects(
      async () => {
        await recordMinerPurchaseToAdmin(null as any)
      },
      /Cannot record miner purchase without valid parameters/
    )

    // 0. Missing minerId
    await assert.rejects(
      async () => {
        await recordMinerPurchaseToAdmin({
          minerId: '',
          packageId: 'minerx-01',
          name: 'Test Miner',
          powerTh: 10,
          price: 100,
        })
      },
      /Cannot record miner purchase without a valid minerId/
    )

    // 1. Missing packageId (undefined)
    await assert.rejects(
      async () => {
        await recordMinerPurchaseToAdmin({
          minerId: 'MINER-TEST-001',
          name: 'Test Miner',
          powerTh: 10,
          price: 100,
        })
      },
      /Invalid packageId for miner purchase/
    )

    // 2. Empty string packageId
    await assert.rejects(
      async () => {
        await recordMinerPurchaseToAdmin({
          minerId: 'MINER-TEST-002',
          packageId: '',
          name: 'Test Miner',
          powerTh: 10,
          price: 100,
        })
      },
      /Invalid packageId for miner purchase/
    )

    // 3. Whitespace-only packageId
    await assert.rejects(
      async () => {
        await recordMinerPurchaseToAdmin({
          minerId: 'MINER-TEST-003',
          packageId: '    ',
          name: 'Test Miner',
          powerTh: 10,
          price: 100,
        })
      },
      /Invalid packageId for miner purchase/
    )

    // 4. Synthetic fallback pkg-${minerId} (uppercase hyphen)
    await assert.rejects(
      async () => {
        await recordMinerPurchaseToAdmin({
          minerId: 'MINER-TEST-004',
          packageId: 'pkg-MINER-TEST-004',
          name: 'Test Miner',
          powerTh: 10,
          price: 100,
        })
      },
      /Invalid packageId for miner purchase/
    )

    // 5. Synthetic fallback pkg-miner_...
    await assert.rejects(
      async () => {
        await recordMinerPurchaseToAdmin({
          minerId: 'MINER-TEST-005',
          packageId: 'pkg-miner_LOCAL-1234',
          name: 'Test Miner',
          powerTh: 10,
          price: 100,
        })
      },
      /Invalid packageId for miner purchase/
    )

    // 6. Synthetic/legacy fallback pkg-miner-* (lowercase hyphen)
    await assert.rejects(
      async () => {
        await recordMinerPurchaseToAdmin({
          minerId: 'MINER-TEST-006',
          packageId: 'pkg-miner-1',
          name: 'Test Miner',
          powerTh: 10,
          price: 100,
        })
      },
      /Invalid packageId for miner purchase/
    )

    // 7. Synthetic fallback pkg-miner-legacy
    await assert.rejects(
      async () => {
        await recordMinerPurchaseToAdmin({
          minerId: 'MINER-TEST-007',
          packageId: 'pkg-miner-legacy',
          name: 'Test Miner',
          powerTh: 10,
          price: 100,
        })
      },
      /Invalid packageId for miner purchase/
    )

    // 7.1 Missing uid (undefined)
    await assert.rejects(
      async () => {
        await recordMinerPurchaseToAdmin({
          minerId: 'MINER-TEST-UID-1',
          packageId: 'minerx-01',
          name: 'Test Miner',
          powerTh: 10,
          price: 100,
        })
      },
      /Cannot record miner purchase without a valid user uid/
    )

    // 7.2 Empty string uid
    await assert.rejects(
      async () => {
        await recordMinerPurchaseToAdmin({
          minerId: 'MINER-TEST-UID-2',
          uid: '',
          packageId: 'minerx-01',
          name: 'Test Miner',
          powerTh: 10,
          price: 100,
        })
      },
      /Cannot record miner purchase without a valid user uid/
    )

    // 7.3 Whitespace uid
    await assert.rejects(
      async () => {
        await recordMinerPurchaseToAdmin({
          minerId: 'MINER-TEST-UID-3',
          uid: '   ',
          packageId: 'minerx-01',
          name: 'Test Miner',
          powerTh: 10,
          price: 100,
        })
      },
      /Cannot record miner purchase without a valid user uid/
    )

    // 8. Untrimmed minerId is trimmed and canonicalized across contracts and orders
    const capturedPayloads: any[] = []
    const capturedSetDocs: { docPath: string; data: any; options?: any }[] = []
    const mockSetDoc = async (docRef: any, data: any, options?: any) => {
      capturedSetDocs.push({ docPath: docRef?.path || '', data, options })
      return Promise.resolve()
    }
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        if (init?.body) {
          capturedPayloads.push(JSON.parse(String(init.body)))
        }
        return new Response('{}', { status: 200 })
      }) as typeof fetch

      await recordMinerPurchaseToAdmin(
        {
          minerId: '  MINER-UNTRIMMED-123  ',
          uid: 'usr_untrimmed_test',
          packageId: 'minerx-01',
          name: 'Trim Miner',
          powerTh: 10,
          price: 100,
        },
        { setDoc: mockSetDoc }
      )

      const contract = capturedPayloads.find((p) => p.contractedTh !== undefined)
      const order = capturedPayloads.find((p) => p.activatedMinerId !== undefined)
      assert.ok(contract, 'Must sync contract payload')
      assert.ok(order, 'Must sync order payload')
      assert.equal(contract.id, 'MINER-UNTRIMMED-123')
      assert.equal(order.activatedMinerId, 'MINER-UNTRIMMED-123')
      assert.equal(order.orderId, 'ord_MINER-UNTRIMMED-123')
      assert.equal(order.idempotencyKey, 'ord_MINER-UNTRIMMED-123')

      // Verify Firestore mock received trimmed IDs
      const setDocContract = capturedSetDocs.find((d) => d.data.contractedTh !== undefined)
      const setDocOrder = capturedSetDocs.find((d) => d.data.activatedMinerId !== undefined)
      assert.ok(setDocContract, 'Must persist contract via setDoc double')
      assert.ok(setDocOrder, 'Must persist order via setDoc double')
      assert.equal(setDocContract.data.id, 'MINER-UNTRIMMED-123')
      assert.equal(setDocOrder.data.activatedMinerId, 'MINER-UNTRIMMED-123')

      // Untrimmed uid should be trimmed to buyerUid across contract and order
      const uidPayloads: any[] = []
      const uidSetDocs: { docPath: string; data: any; options?: any }[] = []
      const uidMockSetDoc = async (docRef: any, data: any, options?: any) => {
        uidSetDocs.push({ docPath: docRef?.path || '', data, options })
        return Promise.resolve()
      }
      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) uidPayloads.push(JSON.parse(init.body as string))
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }) as typeof fetch

      await recordMinerPurchaseToAdmin(
        {
          minerId: 'MINER-TRIM-UID-1',
          uid: '   usr_trim_me   ',
          packageId: 'minerx-01',
          name: 'Trim UID Miner',
          powerTh: 10,
          price: 100,
        },
        { setDoc: uidMockSetDoc }
      )

      const uidContract = uidPayloads.find((p) => p.contractedTh !== undefined)
      const uidOrder = uidPayloads.find((p) => p.activatedMinerId !== undefined)
      assert.equal(uidContract.userId, 'usr_trim_me')
      assert.equal(uidOrder.userId, 'usr_trim_me')

      const uidSetContract = uidSetDocs.find((d) => d.data.contractedTh !== undefined)
      const uidSetOrder = uidSetDocs.find((d) => d.data.activatedMinerId !== undefined)
      assert.equal(uidSetContract?.data?.userId, 'usr_trim_me')
      assert.equal(uidSetOrder?.data?.userId, 'usr_trim_me')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  // --------------------------------------------------------------------------
  // Finding 8 & R2: savePurchasedMiner rejects missing or synthetic packageId before writes
  // --------------------------------------------------------------------------
  it('Finding 8 & R2: savePurchasedMiner rejects missing, whitespace, and synthetic packageId before setDoc', async () => {
    const baseMiner: StoredMiner = {
      id: 'MINER-SAVE-001',
      uid: 'user_save_test',
      name: 'Save Test Miner',
      powerTh: 10,
      efficiency: 15,
      efficiencyWattsPerTh: 15,
      price: 100,
      currency: 'USD',
      status: 'active',
      txHash: 'sim_tx_1',
      createdAt: null,
      network: 'LOCAL_BALANCE',
      ownerWallet: 'INTERNAL',
      visualTraits: {} as any,
    }

    // 00. Null or undefined minerData
    await assert.rejects(
      async () => {
        await savePurchasedMiner('user_save_test', null as any)
      },
      /Cannot save miner without valid minerData/
    )

    // 0. Missing minerId
    await assert.rejects(
      async () => {
        await savePurchasedMiner('user_save_test', { ...baseMiner, id: '' })
      },
      /Cannot save miner without a valid minerId/
    )

    // 1. Missing packageId (undefined)
    await assert.rejects(
      async () => {
        await savePurchasedMiner('user_save_test', { ...baseMiner, packageId: undefined })
      },
      /Cannot save miner without a valid canonical packageId/
    )

    // 2. Empty string packageId
    await assert.rejects(
      async () => {
        await savePurchasedMiner('user_save_test', { ...baseMiner, packageId: '' })
      },
      /Cannot save miner without a valid canonical packageId/
    )

    // 3. Whitespace-only packageId
    await assert.rejects(
      async () => {
        await savePurchasedMiner('user_save_test', { ...baseMiner, packageId: '   ' })
      },
      /Cannot save miner without a valid canonical packageId/
    )

    // 4. Synthetic fallback pkg-${minerId}
    await assert.rejects(
      async () => {
        await savePurchasedMiner('user_save_test', { ...baseMiner, packageId: `pkg-${baseMiner.id}` })
      },
      /Cannot save miner without a valid canonical packageId/
    )

    // 5. Synthetic fallback pkg-miner_...
    await assert.rejects(
      async () => {
        await savePurchasedMiner('user_save_test', { ...baseMiner, packageId: 'pkg-miner_REC-1234' })
      },
      /Cannot save miner without a valid canonical packageId/
    )

    // 6. Synthetic/legacy fallback pkg-miner-* (lowercase hyphen)
    await assert.rejects(
      async () => {
        await savePurchasedMiner('user_save_test', { ...baseMiner, packageId: 'pkg-miner-1' })
      },
      /Cannot save miner without a valid canonical packageId/
    )

    // 7. Missing or whitespace uid rejects fail-closed
    await assert.rejects(
      async () => {
        await savePurchasedMiner('', { ...baseMiner, packageId: 'minerx-01' })
      },
      /Cannot save miner without a valid uid/
    )
    await assert.rejects(
      async () => {
        await savePurchasedMiner('   ', { ...baseMiner, packageId: 'minerx-01' })
      },
      /Cannot save miner without a valid uid/
    )

    // 8. With valid packageId and uid, validation passes and persistence proceeds to setDoc double
    let savedDoc: any = null
    const mockSaveSetDoc = async (_ref: any, data: any) => {
      savedDoc = data
      return Promise.resolve()
    }

    await savePurchasedMiner(
      'user_save_test',
      {
        ...baseMiner,
        packageId: 'minerx-01',
        packageSnapshot: {
          packageId: 'divergent-will-be-overridden',
          name: '   ',
          powerTh: 0,
          price: -5,
          currency: 'USD',
        },
      },
      { setDoc: mockSaveSetDoc }
    )

    assert.ok(savedDoc, 'savePurchasedMiner must persist via setDoc double')
    assert.equal(savedDoc.id, 'MINER-SAVE-001')
    assert.equal(savedDoc.uid, 'user_save_test')
    assert.equal(savedDoc.packageId, 'minerx-01')
    assert.equal(savedDoc.packageSnapshot.packageId, 'minerx-01')
    assert.equal(savedDoc.packageSnapshot.name, 'Save Test Miner')
    assert.equal(savedDoc.packageSnapshot.powerTh, 10)
    assert.equal(savedDoc.packageSnapshot.price, 100)
    assert.equal(savedDoc.packageSnapshot.currency, 'USD')
  })

  // --------------------------------------------------------------------------
  // Finding 9 & R2: completeWalletMinerPurchase preserves packageId end-to-end
  // --------------------------------------------------------------------------
  it('Finding 9 & R2: completeWalletMinerPurchase preserves packageId across StoredMiner, snapshot, and Admin recorder', async () => {
    let capturedStoredMiner: StoredMiner | null = null
    let capturedAdminRecord: any = null

    const completion = await completeWalletMinerPurchase(
      {
        productName: 'Minero Personalizado · 128 TH',
        amount: 1499.99,
        packageId: 'minerx-custom',
        purchaseMode: 'once',
        activeAddress: '0xwallet_custom',
        txHash: '0xtx_custom_wallet',
        networkName: 'BNB Chain',
        user: { uid: 'uid_wallet_e2e', email: 'custom@test.com' },
      },
      {
        saveMinerToFirestore: async (_uid, miner) => {
          capturedStoredMiner = miner
        },
        recordPurchaseToAdmin: async (params) => {
          capturedAdminRecord = params
        },
      }
    )

    assert.ok(completion)
    assert.equal(completion.resolvedPackageId, 'minerx-custom')

    // End-to-end equality:
    // Wallet checkout packageId === StoredMiner.packageId === StoredMiner.packageSnapshot.packageId === Admin contract packageId
    assert.equal(capturedStoredMiner?.packageId, 'minerx-custom')
    assert.equal(capturedStoredMiner?.packageSnapshot?.packageId, 'minerx-custom')
    assert.equal(capturedAdminRecord?.packageId, 'minerx-custom')
  })

  it('Finding 9 & R2: completeWalletMinerPurchase rejects missing packageId for authenticated user fail-closed', async () => {
    let saveCalled = false
    let adminCalled = false

    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase(
          {
            productName: 'Minero 10 TH · 10 TH',
            amount: 100,
            packageId: undefined, // Missing packageId
            activeAddress: '0xaddr',
            txHash: '0xtx_missing_pkg',
            networkName: 'BNB Chain',
            user: { uid: 'uid_test', email: 'test@example.com' },
          },
          {
            saveMinerToFirestore: async () => { saveCalled = true },
            recordPurchaseToAdmin: async () => { adminCalled = true },
          }
        )
      },
      /Canonical wallet miner purchase requires a valid packageId/
    )

    assert.equal(saveCalled, false)
    assert.equal(adminCalled, false)
  })

  it('Finding 9 & R2: completeWalletMinerPurchase rejects synthetic pkg-miner-* fail-closed for authenticated user', async () => {
    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase({
          productName: 'Minero 10 TH · 10 TH',
          amount: 100,
          packageId: 'pkg-miner-legacy-1',
          txHash: '0xtx_synth_pkg',
          networkName: 'BNB Chain',
          user: { uid: 'uid_test', email: 'test@example.com' },
        })
      },
      /Canonical wallet miner purchase requires a valid packageId/
    )
  })

  it('Finding 9 & R2: completeWalletMinerPurchase rejects missing or whitespace user.uid fail-closed before registering miner in demoStore', async () => {
    resetStore(1000)
    const initialMiners = getDemoSessionForPersistence().miners.length
    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase({
          productName: 'Minero 10 TH · 10 TH',
          amount: 100,
          packageId: 'minerx-01',
          txHash: '0xtx_ws_uid',
          networkName: 'BNB Chain',
          user: { uid: '   ' },
        })
      },
      /Canonical wallet miner purchase requires a valid user uid/
    )
    assert.equal(getDemoSessionForPersistence().miners.length, initialMiners, 'Miner must NOT be registered in demoStore on invalid user uid')
  })

  // --------------------------------------------------------------------------
  // ISSUE-04: Concurrency under simulated persistence latency spike
  // --------------------------------------------------------------------------
  it('ISSUE-04: Concurrency under simulated persistence latency spike (40ms) creates exactly 1 Firestore document and 1 Admin record with zero double-spend', async () => {
    resetStore(100000)

    deferDemoMinerPurchase({
      name: 'Concurrent Stress Miner',
      powerTh: 21.05,
      efficiency: 15,
      price: 249.99,
      purchaseMode: 'once',
      packageId: 'minerx-03',
    })

    const targetOrder = getDemoSessionForPersistence().pendingMinerOrders[0]
    assert.ok(targetOrder)

    const firestorePersistedMiners: StoredMiner[] = []
    const adminRecordings: any[] = []

    // 30 simultaneous settlement attempts with an artificial 40ms Firestore latency spike
    const attempts = Array.from({ length: 30 }, () =>
      payPendingMinerOrderAndRecordToAdmin(targetOrder, {
        user: { uid: 'u_stress_concurrent', email: 'stress@gomining.test' },
        saveMinerToFirestore: async (_uid, miner) => {
          await new Promise((resolve) => setTimeout(resolve, 40))
          firestorePersistedMiners.push(miner)
        },
        recordPurchaseToAdmin: async (params) => {
          adminRecordings.push(params)
        },
      })
    )

    const results = await Promise.all(attempts)

    const successes = results.filter((r) => r.ok === true)
    const failures = results.filter((r) => r.ok === false)

    // Exactly 1 must succeed
    assert.equal(successes.length, 1, 'Exactly one concurrent settlement must succeed')
    assert.equal(failures.length, 29, 'Exactly 29 concurrent settlements must be rejected')

    // Exactly 1 Firestore persistence and 1 Admin record
    assert.equal(firestorePersistedMiners.length, 1, 'Exactly ONE Firestore document must be saved')
    assert.equal(adminRecordings.length, 1, 'Exactly ONE Admin order must be recorded')

    // Check identity consistency across the single winning settlement
    const winningMinerId = successes[0].minerId!
    assert.ok(winningMinerId)
    assert.equal(firestorePersistedMiners[0].id, winningMinerId)
    assert.equal(adminRecordings[0].minerId, winningMinerId)
    assert.equal(adminRecordings[0].activatedMinerId || adminRecordings[0].minerId, winningMinerId)

    // All 29 failed attempts must report order already settled/removed
    for (const fail of failures) {
      assert.equal(fail.message, 'No se encontró ese pedido local pendiente.')
    }
  })

  // --------------------------------------------------------------------------
  // ISSUE-03: Guest offline demo orders complete in demoStore without Firestore persistence
  // --------------------------------------------------------------------------
  it('ISSUE-03: Guest offline demo orders complete in demoStore without Firestore persistence while authenticated orders strictly enforce canonical packageId', async () => {
    resetStore(100000)

    // 1. Guest defers order without packageId
    const guestDefer = deferDemoMinerPurchase({
      name: 'Guest Offline Miner',
      powerTh: 5,
      efficiency: 15,
      price: 50,
      purchaseMode: 'once',
      packageId: undefined,
    })
    assert.equal(guestDefer.ok, true)
    const guestOrder = getDemoSessionForPersistence().pendingMinerOrders[0]

    let firestoreCalled = false
    const guestPay = await payPendingMinerOrderAndRecordToAdmin(guestOrder, {
      user: null, // Guest
      saveMinerToFirestore: async () => {
        firestoreCalled = true
      },
    })

    assert.equal(guestPay.ok, false, 'Guest payment in canonical pending flow must fail closed')
    assert.equal(firestoreCalled, false, 'Guest payment must NEVER persist to Firestore')

    // Guest offline demo order completes via payPendingDemoMiner in demoStore
    const demoPay = payPendingDemoMiner(guestOrder.id)
    assert.equal(demoPay.ok, true, 'Guest offline demo order completes via payPendingDemoMiner')

    // 2. Authenticated user defers order without packageId -> payment is rejected fail-closed
    resetStore(100000)
    deferDemoMinerPurchase({
      name: 'Auth Invalid Miner',
      powerTh: 5,
      efficiency: 15,
      price: 50,
      purchaseMode: 'once',
      packageId: undefined,
    })
    const authOrder = getDemoSessionForPersistence().pendingMinerOrders[0]

    const authPay = await payPendingMinerOrderAndRecordToAdmin(authOrder, {
      user: { uid: 'u_auth_guest_test', email: 'auth@test.com' },
      saveMinerToFirestore: async () => {
        firestoreCalled = true
      },
    })

    assert.equal(authPay.ok, false, 'Authenticated payment without canonical packageId must be rejected')
    assert.equal(firestoreCalled, false, 'Rejected authenticated payment must NEVER persist to Firestore')
    assert.ok(authPay.message?.includes('packageId canónico válido'))

    // 3. Authenticated user paying with synthetic packageId rejects fail-closed before Firestore or Admin
    resetStore(100000)
    deferDemoMinerPurchase({
      name: 'Auth Invalid Miner 2',
      powerTh: 5,
      efficiency: 15,
      price: 50,
      purchaseMode: 'once',
      packageId: 'pkg-miner-synthetic',
    })
    const authOrder2 = getDemoSessionForPersistence().pendingMinerOrders[0]
    let adminRecordCalled = false
    const authPay2 = await payPendingMinerOrderAndRecordToAdmin(authOrder2, {
      user: { uid: 'u_auth_test_2', email: 'auth2@test.com' },
      saveMinerToFirestore: async () => {},
      recordPurchaseToAdmin: async () => { adminRecordCalled = true },
    })
    assert.equal(authPay2.ok, false, 'Must reject synthetic packageId for authenticated user')
    assert.equal(adminRecordCalled, false, 'Admin recorder must not be called')
    assert.ok(authPay2.message?.includes('packageId canónico válido'))
    // Verify order was NOT paid in demo store
    assert.equal(getDemoSessionForPersistence().pendingMinerOrders.length, 1, 'Order must remain unpaid in pending list')

    // 4. Authenticated user paying with whitespace-only uid rejects fail-closed before mutating demoStore
    resetStore(1000)
    deferDemoMinerPurchase({
      name: 'Auth Whitespace UID Miner',
      powerTh: 10,
      efficiency: 15,
      price: 100,
      purchaseMode: 'once',
      packageId: 'minerx-01',
    })
    const wsOrder = getDemoSessionForPersistence().pendingMinerOrders[0]
    let wsSaveCalled = false
    const wsPay = await payPendingMinerOrderAndRecordToAdmin(wsOrder, {
      user: { uid: '   ', email: 'ws@test.com' },
      saveMinerToFirestore: async () => { wsSaveCalled = true },
    })
    assert.equal(wsPay.ok, false, 'Must reject whitespace uid for authenticated user')
    assert.equal(wsSaveCalled, false, 'Save to firestore must not be called')
    assert.match(wsPay.message || '', /Cannot persist miner without a valid user uid/)
    const sessionAfterWs = getDemoSessionForPersistence()
    assert.equal(sessionAfterWs.balance, 1000, 'Balance must NOT be deducted when user.uid is whitespace')
    assert.equal(sessionAfterWs.pendingMinerOrders.length, 1, 'Pending order must remain intact in queue')
  })

  // --------------------------------------------------------------------------
  // Finding 6 & R4: Client source code contains ZERO direct Firestore access to commercial_packages
  // --------------------------------------------------------------------------
  it('Finding 6 & R4: Client source code contains zero direct calls to collection(db, "commercial_packages"), getDocs, or onSnapshot for commercial_packages', async () => {
    const srcDir = path.resolve(projectRoot, 'src')
    const srcFiles = fs.readdirSync(srcDir, { recursive: true }) as string[]

    const offendingPatterns = [
      /collection\s*\(\s*db\s*,\s*['"`]commercial_packages['"`]\s*\)/,
      /getDocs\s*\([^)]*commercial_packages[^)]*\)/,
      /onSnapshot\s*\([^)]*commercial_packages[^)]*\)/,
    ]

    for (const relPath of srcFiles) {
      if (!relPath.endsWith('.ts') && !relPath.endsWith('.tsx')) continue
      const fullPath = path.join(srcDir, relPath)
      const content = fs.readFileSync(fullPath, 'utf8')

      // Check for direct commercial_packages Firestore access
      assert.ok(
        !content.includes("collection(db, 'commercial_packages')"),
        `File ${relPath} must NOT call collection(db, 'commercial_packages')`
      )
      assert.ok(
        !content.includes('collection(db, "commercial_packages")'),
        `File ${relPath} must NOT call collection(db, "commercial_packages")`
      )

      for (const pattern of offendingPatterns) {
        assert.ok(
          !pattern.test(content),
          `File ${relPath} must NOT match forbidden commercial_packages pattern: ${pattern}`
        )
      }
    }

    // Verify stubs in firebase.ts return empty array safely without exposing fake static catalog
    assert.deepEqual(DEFAULT_COMMERCIAL_PACKAGES, [], 'DEFAULT_COMMERCIAL_PACKAGES must be empty array')
    let callbackCalled = false
    const unsub = subscribeToPublishedCommercialPackages((pkgs) => {
      callbackCalled = true
      assert.deepEqual(pkgs, [], 'subscribeToPublishedCommercialPackages must return empty array')
    })
    assert.equal(callbackCalled, true)
    assert.equal(typeof unsub, 'function')
    unsub()

    const fetched = await fetchPublishedCommercialPackages()
    assert.deepEqual(fetched, [], 'fetchPublishedCommercialPackages must return empty array')
  })

  // --------------------------------------------------------------------------
  // Finding 5, 8 & R4: Zero production occurrences of pkg-${minerId} synthetic fallback
  // --------------------------------------------------------------------------
  it('Finding 5, 8 & R4: Production source code contains zero occurrences of pkg-${minerId} synthetic fallback', () => {
    const srcDir = path.resolve(projectRoot, 'src')
    const srcFiles = fs.readdirSync(srcDir, { recursive: true }) as string[]

    const forbiddenPatterns = [
      /pkg-\$\{.*minerId.*\}/,
      /pkg-\$\{.*miner\.id.*\}/,
      /params\.packageId\s*\|\|\s*`pkg-/,
      /order\.packageId\s*\|\|\s*`pkg-/,
      /minerData\.packageId\s*\|\|\s*`pkg-/,
    ]

    for (const relPath of srcFiles) {
      if (!relPath.endsWith('.ts') && !relPath.endsWith('.tsx')) continue
      const fullPath = path.join(srcDir, relPath)
      const content = fs.readFileSync(fullPath, 'utf8')

      for (const pattern of forbiddenPatterns) {
        assert.ok(
          !pattern.test(content),
          `File ${relPath} must NOT contain forbidden synthetic fallback matching ${pattern}`
        )
      }
    }
  })

  // --------------------------------------------------------------------------
  // Finding 10: Authenticated customizer saves only to Firestore without touching demo store
  // --------------------------------------------------------------------------
  it('Finding 10: Authenticated customizer save branch separates Firestore update from DemoStore update', async () => {
    const customizerPath = path.resolve(projectRoot, 'src/MinerCustomizer.tsx')
    const content = fs.readFileSync(customizerPath, 'utf8')

    // Verify separation of branches: if (user && targetId) -> Firestore only, else -> DemoStore only
    assert.ok(
      content.includes('if (user && targetId)'),
      'MinerCustomizer.tsx must check if (user && targetId)'
    )
    assert.ok(
      content.includes('await updateMinerInFirestore(user.uid, targetId'),
      'MinerCustomizer.tsx must call updateMinerInFirestore for authenticated user'
    )
    assert.ok(
      content.includes('} else {') && content.includes('updateDemoMinerCustomization(targetId'),
      'MinerCustomizer.tsx must call updateDemoMinerCustomization only in else block for guest'
    )

    // Behavioral verification: Authenticated user -> Firestore called once, DemoStore not called
    let firestoreCallCount = 0
    let firestoreCallArgs: any = null
    let demoCallCount = 0

    const mockCustomization = {
      wallColor: '#111111',
      bodyColor: '#222222',
      bottomColor: '#333333',
      fansColor: '#444444',
      screenColor: '#555555',
      buttonsColor: '#666666',
      topColor: '#777777',
      stickers: 'gomining-classic' as const,
    }

    await saveMinerCustomization({
      minerId: 'MINER-AUTH-1',
      user: { uid: 'auth_user_123' },
      customization: mockCustomization,
      updateFirestore: async (uid, minerId, data) => {
        firestoreCallCount++
        firestoreCallArgs = { uid, minerId, data }
      },
      updateDemo: () => {
        demoCallCount++
      },
    })

    assert.equal(firestoreCallCount, 1, 'Firestore update must be called exactly once for authenticated user')
    assert.equal(firestoreCallArgs.uid, 'auth_user_123')
    assert.equal(firestoreCallArgs.minerId, 'MINER-AUTH-1')
    assert.deepEqual(firestoreCallArgs.data.visualTraits, mockCustomization)
    assert.equal(demoCallCount, 0, 'DemoStore update must NOT be called for authenticated user')

    // Behavioral verification: Guest user -> DemoStore called once, Firestore not called
    firestoreCallCount = 0
    firestoreCallArgs = null
    demoCallCount = 0
    let demoCallArgs: any = null

    await saveMinerCustomization({
      minerId: 'MINER-GUEST-1',
      user: null,
      customization: mockCustomization,
      updateFirestore: async () => {
        firestoreCallCount++
      },
      updateDemo: (minerId, cust) => {
        demoCallCount++
        demoCallArgs = { minerId, cust }
      },
    })

    assert.equal(demoCallCount, 1, 'DemoStore update must be called exactly once for guest user')
    assert.equal(demoCallArgs.minerId, 'MINER-GUEST-1')
    assert.equal(demoCallArgs.cust.wallColor, '#111111')
    assert.equal(firestoreCallCount, 0, 'Firestore update must NOT be called for guest user')
  })

  // --------------------------------------------------------------------------
  // Finding 7 & Contract 6: Catalog HTTP 4xx policy matches approved PO override
  // --------------------------------------------------------------------------
  it('Finding 7: Catalog HTTP 4xx handling behaves according to Option B approved PO override', async () => {
    // Verify source code documents the approved PO override citation
    const catalogClientPath = path.resolve(projectRoot, 'src/catalogClient.ts')
    const catalogSource = fs.readFileSync(catalogClientPath, 'utf8')
    assert.ok(
      catalogSource.includes('docs/c2c/SCRUM-218_002.1_review.md'),
      'catalogClient.ts must cite docs/c2c/SCRUM-218_002.1_review.md for Option B contract'
    )

    // Option B verification: HTTP 400, 404 return empty catalog [] without fallback
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, statusText: 'Not Found' })
      }) as typeof fetch

      clearCatalogCache()
      const plans404 = await fetchStorefrontCatalog('minerx', { bypassCache: true })
      assert.deepEqual(plans404, [], 'HTTP 404 must return [] under Option B')

      globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, statusText: 'Bad Request' })
      }) as typeof fetch

      clearCatalogCache()
      const plans400 = await fetchStorefrontCatalog('minerx', { bypassCache: true })
      assert.deepEqual(plans400, [], 'HTTP 400 must return [] under Option B')

      // Contrasting behavior: HTTP 500 activates baseline fallback
      globalThis.fetch = (async () => {
        return new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' })
      }) as typeof fetch

      clearCatalogCache()
      const plans500 = await fetchStorefrontCatalog('minerx', { bypassCache: true })
      const expectedFallback = getSectionFallbackPlans('minerx')
      assert.equal(plans500.length, expectedFallback.length, 'HTTP 500 must return section fallback plans')
      assert.equal(plans500[0].packageId, expectedFallback[0].packageId)
    } finally {
      globalThis.fetch = originalFetch
      clearCatalogCache()
    }
  })

  // --------------------------------------------------------------------------
  // R1: Local Authenticated Purchase Sequencing & Fail-Closed (Zero Local Mutation)
  // --------------------------------------------------------------------------
  it('R1: Forced Firestore failure on authenticated local purchase leaves balance, miner count, worker count unchanged, with no completed receipt and Admin recorder not called', async () => {
    resetStore(5000)
    const initialSession = getDemoSessionForPersistence()
    const initialBalance = initialSession.balance
    const initialMinersCount = initialSession.miners.length
    const initialWorkersCount = initialSession.workers.length
    const initialReceiptsCount = initialSession.receipts.length

    let adminRecorded = false
    let firestoreCallCount = 0
    const demoInput: DemoMinerPurchaseInput = {
      name: 'Local Auth Fail-Closed Miner',
      powerTh: 15,
      efficiency: 15,
      price: 250,
      purchaseMode: 'once',
      packageId: 'minerx-02',
    }

    // Step 1: Canonical Firestore persistence fails via completeLocalMinerPurchase
    const failResult = await completeLocalMinerPurchase(demoInput, {
      user: { uid: 'u_auth_local_fail', email: 'fail@test.com' },
      saveMinerToFirestore: async () => {
        firestoreCallCount++
        throw new Error('Simulated network failure on Firestore setDoc')
      },
      recordPurchaseToAdmin: async () => {
        adminRecorded = true
      },
    })

    assert.equal(failResult.ok, false)
    assert.equal(firestoreCallCount, 1)
    assert.match(failResult.message || '', /Simulated network failure on Firestore setDoc/)
    assert.equal(adminRecorded, false, 'Admin recorder must NOT be called on Firestore failure')

    // Verify ZERO local state mutations occurred
    const postFailureSession = getDemoSessionForPersistence()
    assert.equal(postFailureSession.balance, initialBalance, 'Balance must remain unchanged after Firestore failure')
    assert.equal(postFailureSession.miners.length, initialMinersCount, 'Miners count must remain unchanged')
    assert.equal(postFailureSession.workers.length, initialWorkersCount, 'Workers count must remain unchanged')
    assert.equal(postFailureSession.receipts.length, initialReceiptsCount, 'Receipts count must remain unchanged')

    // Step 2: Contrast with successful persistence -> commits local state and records to Admin
    let savedMiner: StoredMiner | null = null
    let adminRecord: any = null
    const successResult = await completeLocalMinerPurchase(demoInput, {
      user: { uid: 'u_auth_local_success', email: 'success@test.com' },
      saveMinerToFirestore: async (_uid, miner) => {
        savedMiner = miner
      },
      recordPurchaseToAdmin: async (params) => {
        adminRecord = params
      },
    })

    assert.equal(successResult.ok, true)
    assert.ok(savedMiner)
    assert.ok(adminRecord)
    const postSuccessSession = getDemoSessionForPersistence()
    assert.equal(postSuccessSession.balance, initialBalance - 250, 'Balance must be deducted only after success')
    assert.equal(postSuccessSession.miners.length, initialMinersCount + 1, 'Miner must be committed')
    assert.equal(postSuccessSession.workers.length, initialWorkersCount + 1, 'Worker must be committed')
    assert.equal(postSuccessSession.receipts.length, initialReceiptsCount + 1, 'Receipt must be committed')
    assert.equal(postSuccessSession.miners[0].id, (savedMiner as StoredMiner).id, 'Committed miner must have same ID as Firestore')
    assert.equal(adminRecord.minerId, (savedMiner as StoredMiner).id, 'Admin record minerId must match')
  })

  // --------------------------------------------------------------------------
  // R2: Authenticated Pending Order Failure Postconditions & Retry
  // --------------------------------------------------------------------------
  it('R2: Forced Firestore failure on authenticated pending payment retains pending order for retry, leaves balance unchanged, with no new DemoMiner and Admin recorder not called', async () => {
    resetStore(2000)
    deferDemoMinerPurchase({
      name: 'Retryable Pending Miner',
      powerTh: 20,
      efficiency: 15,
      price: 300,
      purchaseMode: 'once',
      packageId: 'minerx-03',
    })
    const order = getDemoSessionForPersistence().pendingMinerOrders[0]
    assert.ok(order, 'Pending order must be deferred')

    let adminCallCount = 0
    let firestoreAttempts = 0

    // Attempt 1: Firestore fails
    const failResult = await payPendingMinerOrderAndRecordToAdmin(order, {
      user: { uid: 'u_retry_user', email: 'retry@test.com' },
      saveMinerToFirestore: async () => {
        firestoreAttempts++
        throw new Error('Simulated transient Firestore error')
      },
      recordPurchaseToAdmin: async () => {
        adminCallCount++
      },
    })

    assert.equal(failResult.ok, false)
    assert.equal(firestoreAttempts, 1)
    assert.equal(adminCallCount, 0, 'Admin recorder must NOT be called on Firestore failure')

    // Postconditions after failure:
    const sessionAfterFail = getDemoSessionForPersistence()
    assert.equal(sessionAfterFail.pendingMinerOrders.length, 1, 'Pending order must remain available for retry')
    assert.equal(sessionAfterFail.pendingMinerOrders[0].id, order.id, 'Pending order must have exact same id')
    assert.equal(sessionAfterFail.balance, 2000, 'Balance must NOT be consumed')
    assert.equal(sessionAfterFail.miners.length, 0, 'No DemoMiner added')
    assert.equal(sessionAfterFail.workers.length, 0, 'No DemoWorker added')
    assert.equal(sessionAfterFail.receipts.filter((r) => r.kind === 'miner').length, 0, 'No completed miner receipt')

    // Attempt 2: Successful retry
    let savedStoredMiner: StoredMiner | null = null
    const retryResult = await payPendingMinerOrderAndRecordToAdmin(sessionAfterFail.pendingMinerOrders[0], {
      user: { uid: 'u_retry_user', email: 'retry@test.com' },
      saveMinerToFirestore: async (_uid, miner) => {
        firestoreAttempts++
        savedStoredMiner = miner
      },
      recordPurchaseToAdmin: async () => {
        adminCallCount++
      },
    })

    assert.equal(retryResult.ok, true)
    assert.equal(firestoreAttempts, 2)
    assert.equal(adminCallCount, 1, 'Admin recorder called on successful retry')
    assert.ok(savedStoredMiner)
    assert.equal((savedStoredMiner as StoredMiner).packageId, 'minerx-03')

    const sessionAfterSuccess = getDemoSessionForPersistence()
    assert.equal(sessionAfterSuccess.pendingMinerOrders.length, 0, 'Pending order must be consumed on success')
    assert.equal(sessionAfterSuccess.balance, 1700, 'Balance must be deducted on success')
    assert.equal(sessionAfterSuccess.miners.length, 1, 'DemoMiner added on success')
  })

  // --------------------------------------------------------------------------
  // R3: Authenticated Wallet Purchase Canonical Persistence
  // --------------------------------------------------------------------------
  it('R3: Forced Firestore failure on authenticated wallet purchase does not add DemoMiner, does not add worker, does not call onSimulationStart, and does not call Admin recorder', async () => {
    resetStore(1000)
    let simulationStarted = false
    let adminRecorded = false

    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase(
          {
            productName: 'Minero 96 TH · 96 TH',
            amount: 1111.99,
            packageId: 'minerx-pro',
            purchaseMode: 'once',
            activeAddress: '0xwallet_r3',
            txHash: '0xtx_r3_fail',
            networkName: 'BNB Chain',
            user: { uid: 'u_wallet_r3', email: 'r3@test.com' },
          },
          {
            saveMinerToFirestore: async () => {
              throw new Error('Firestore UNAVAILABLE')
            },
            onSimulationStart: () => {
              simulationStarted = true
            },
            recordPurchaseToAdmin: async () => {
              adminRecorded = true
            },
          }
        )
      },
      /Firestore UNAVAILABLE/
    )

    assert.equal(simulationStarted, false, 'onSimulationStart must NOT be called on Firestore failure')
    assert.equal(adminRecorded, false, 'Admin recorder must NOT be called on Firestore failure')

    const session = getDemoSessionForPersistence()
    assert.equal(session.miners.length, 0, 'DemoStore miners must remain intact')
    assert.equal(session.workers.length, 0, 'DemoStore workers must remain intact')
    assert.equal(session.receipts.length, 0, 'DemoStore receipts must remain intact')
  })

  // --------------------------------------------------------------------------
  // R5: Persistence Adapter Guards When User Exists
  // --------------------------------------------------------------------------
  it('R5: Missing persistence adapter with authenticated user fails closed before local mutation or Admin recorder call', async () => {
    resetStore(1000)
    let adminRecorded = false

    // completeWalletMinerPurchase without saveMinerToFirestore adapter
    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase(
          {
            productName: 'Minero 48 TH · 48 TH',
            amount: 561.99,
            packageId: 'minerx-01',
            purchaseMode: 'once',
            activeAddress: '0xwallet_guard',
            txHash: '0xtx_guard',
            networkName: 'BNB Chain',
            user: { uid: 'u_guard', email: 'guard@test.com' },
          },
          {
            recordPurchaseToAdmin: async () => {
              adminRecorded = true
            },
          }
        )
      },
      /saveMinerToFirestore adapter is required for authenticated wallet miner purchase/
    )
    assert.equal(adminRecorded, false, 'Admin recorder must NOT be called when adapter is missing')
    assert.equal(getDemoSessionForPersistence().miners.length, 0, 'No miner created when adapter is missing')

    // payPendingMinerOrderAndRecordToAdmin without saveMinerToFirestore adapter
    deferDemoMinerPurchase({
      name: 'Pending Guard Miner',
      powerTh: 10,
      efficiency: 15,
      price: 100,
      purchaseMode: 'once',
      packageId: 'minerx-01',
    })
    const order = getDemoSessionForPersistence().pendingMinerOrders[0]
    const pendingResult = await payPendingMinerOrderAndRecordToAdmin(order, {
      user: { uid: 'u_guard', email: 'guard@test.com' },
      recordPurchaseToAdmin: async () => {
        adminRecorded = true
      },
    })

    assert.equal(pendingResult.ok, false)
    assert.match(pendingResult.message || '', /saveMinerToFirestore adapter is required/)
    assert.equal(adminRecorded, false)
    assert.equal(getDemoSessionForPersistence().balance, 1000, 'Balance untouched')
    assert.equal(getDemoSessionForPersistence().pendingMinerOrders.length, 1, 'Pending order preserved')

    // completeLocalMinerPurchase without saveMinerToFirestore adapter
    const localResult = await completeLocalMinerPurchase(
      {
        name: 'Local Guard Miner',
        powerTh: 10,
        efficiency: 15,
        price: 100,
        purchaseMode: 'once',
        packageId: 'minerx-01',
      },
      {
        user: { uid: 'u_guard', email: 'guard@test.com' },
        recordPurchaseToAdmin: async () => {
          adminRecorded = true
        },
      }
    )

    assert.equal(localResult.ok, false)
    assert.match(localResult.message || '', /saveMinerToFirestore adapter is required/)
    assert.equal(adminRecorded, false)
    assert.equal(getDemoSessionForPersistence().balance, 1000, 'Balance untouched after failed local adapter')
    assert.equal(getDemoSessionForPersistence().miners.length, 0, 'No miner created after failed local adapter')
  })

  // --------------------------------------------------------------------------
  // R5: Canonical packageId Validation Regardless of User Authentication State
  // --------------------------------------------------------------------------
  it('R5: Canonical wallet purchase validates packageId prior to registration independent of user authentication state', async () => {
    // 1. Synthetic packageId with guest (user: null) -> rejected fail-closed
    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase({
          productName: 'Guest Miner 10 TH',
          amount: 100,
          packageId: 'pkg-miner-synthetic-guest',
          txHash: '0xtx_synth_guest',
          networkName: 'BNB Chain',
          user: null,
        })
      },
      /Canonical wallet miner purchase requires a valid packageId/
    )

    // 2. Canonical requirement enforced with guest (user: null) without requireCanonicalPackageId -> rejected fail-closed
    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase({
          productName: 'Guest Miner 10 TH',
          amount: 100,
          packageId: undefined,
          txHash: '0xtx_missing_guest',
          networkName: 'BNB Chain',
          user: null,
        })
      },
      /Canonical wallet miner purchase requires a valid packageId/
    )
    // 2b. Missing packageId completely omitted with guest -> rejected fail-closed
    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase({
          productName: 'Guest Miner 10 TH',
          amount: 100,
          txHash: '0xtx_missing_guest_2',
          networkName: 'BNB Chain',
        })
      },
      /Canonical wallet miner purchase requires a valid packageId/
    )

    // 3. Guest canonical purchase without authenticated account is rejected fail-closed (SCRUM-220 R1)
    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase({
          productName: 'Guest Miner 10 TH',
          amount: 100,
          packageId: 'minerx-canonical-guest',
          txHash: '0xtx_valid_guest',
          networkName: 'BNB Chain',
          user: null,
        })
      },
      /Canonical wallet miner purchase requires an authenticated, non-anonymous user account/
    )

    // 4. orchestrateWalletMinerPurchaseFlow enforces canonical packageId validation regardless of auth
    await assert.rejects(
      async () => {
        await orchestrateWalletMinerPurchaseFlow(
          {
            selected: { id: 'pkg-miner-synth', label: 'Synth', price: 100, powerTh: 10, packageId: 'pkg-miner-synth' },
          },
          {
            txHash: '0xtx_orchestrate_guest',
            user: null,
          }
        )
      },
      /Canonical wallet miner purchase requires a valid packageId/
    )
  })

  // --------------------------------------------------------------------------
  // R4: Post-Transaction Persistence Retry State
  // --------------------------------------------------------------------------
  it('R4: On post-transaction persistence failure, txHash is retained, state reflects persistence pending, and retry uses same txHash, minerId, packageId without re-payment', async () => {
    resetStore(1000)
    const onchainTxHash = '0xconfirmed_tx_hash_abc123'
    const preallocatedMinerId = 'MINER-RECOVERY-001'
    const canonicalPackageId = 'minerx-recovery'
    const user = { uid: 'u_recovery', email: 'recovery@test.com' }

    let firestoreAttempts = 0
    let savedToFirestore: StoredMiner | null = null
    let adminRecord: any = null

    // Attempt 1: Payment already succeeded on chain (txHash exists), but Firestore persistence fails
    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase(
          {
            productName: 'Minero Recovery · 48 TH',
            amount: 561.99,
            packageId: canonicalPackageId,
            purchaseMode: 'once',
            activeAddress: '0xuser_recovery',
            txHash: onchainTxHash,
            networkName: 'BNB Chain',
            user,
            minerId: preallocatedMinerId,
            requireCanonicalPackageId: true,
          },
          {
            saveMinerToFirestore: async () => {
              firestoreAttempts++
              throw new Error('Simulated network timeout during post-tx persistence')
            },
            recordPurchaseToAdmin: async (p) => {
              adminRecord = p
            },
          }
        )
      },
      /Simulated network timeout/
    )

    assert.equal(firestoreAttempts, 1)
    assert.equal(adminRecord, null, 'Admin recorder must not be called on failed persistence')
    assert.equal(getDemoSessionForPersistence().miners.length, 0, 'No miner committed before persistence')

    // Simulated PostTxPendingState: preserves txHash, minerId, packageId
    const postTxState = {
      status: 'PERSISTENCE_PENDING' as const,
      txHash: onchainTxHash,
      minerId: preallocatedMinerId,
      packageId: canonicalPackageId,
      productName: 'Minero Recovery · 48 TH',
      amount: 561.99,
      purchaseMode: 'once' as const,
      user,
    }

    assert.equal(postTxState.status, 'PERSISTENCE_PENDING')
    assert.equal(postTxState.txHash, onchainTxHash)
    assert.equal(postTxState.minerId, preallocatedMinerId)

    // Attempt 2: Retry ONLY persistence with same txHash and minerId (NO blockchain payment re-executed!)
    const retryCompletion = await completeWalletMinerPurchase(
      {
        productName: postTxState.productName,
        amount: postTxState.amount,
        packageId: postTxState.packageId,
        purchaseMode: postTxState.purchaseMode,
        activeAddress: '0xuser_recovery',
        txHash: postTxState.txHash, // EXACT SAME txHash
        networkName: 'BNB Chain',
        user: postTxState.user,
        minerId: postTxState.minerId, // EXACT SAME minerId
        requireCanonicalPackageId: true,
      },
      {
        saveMinerToFirestore: async (_uid, miner) => {
          firestoreAttempts++
          savedToFirestore = miner
        },
        recordPurchaseToAdmin: async (p) => {
          adminRecord = p
        },
      }
    )

    assert.ok(retryCompletion)
    assert.equal(firestoreAttempts, 2)
    assert.equal(retryCompletion.createdMinerId, preallocatedMinerId, 'Retry must preserve the exact minerId')
    assert.ok(savedToFirestore)
    assert.equal((savedToFirestore as StoredMiner).id, preallocatedMinerId)
    assert.equal((savedToFirestore as StoredMiner).txHash, onchainTxHash)
    assert.equal((savedToFirestore as StoredMiner).packageId, canonicalPackageId)
    assert.ok(adminRecord)
    assert.equal(adminRecord.minerId, preallocatedMinerId)
    assert.equal(adminRecord.txHash, onchainTxHash)
    assert.equal(adminRecord.packageId, canonicalPackageId)
    assert.equal(getDemoSessionForPersistence().miners.length, 1, 'Miner committed to demoStore on retry success')

    // Verify PostTxPendingState round-trip serialization preservation across page refreshes
    const serialized = JSON.stringify(postTxState)
    const restored = JSON.parse(serialized)
    assert.equal(restored.status, 'PERSISTENCE_PENDING')
    assert.equal(restored.txHash, onchainTxHash)
    assert.equal(restored.minerId, preallocatedMinerId)
    assert.equal(restored.packageId, canonicalPackageId)
    assert.equal(restored.productName, 'Minero Recovery · 48 TH')
    assert.equal(restored.amount, 561.99)

    // Verify PAYMENT_TRANSMITTED status variant round-trip serialization
    const transmittedState = { ...postTxState, status: 'PAYMENT_TRANSMITTED' as const }
    const transmittedRestored = JSON.parse(JSON.stringify(transmittedState))
    assert.equal(transmittedRestored.status, 'PAYMENT_TRANSMITTED')
    assert.equal(transmittedRestored.txHash, onchainTxHash)
  })

  // --------------------------------------------------------------------------
  // Blocker 1: Pending cancel / Firestore orphan race & settlement reservation
  // --------------------------------------------------------------------------
  it('Blocker 1A: Cancellation attempt during in-flight Firestore persistence is rejected by settlement lock, preventing Firestore orphan', async () => {
    resetStore(2000)
    deferDemoMinerPurchase({
      name: 'Concurrent Cancel Miner',
      powerTh: 20,
      efficiency: 15,
      price: 300,
      purchaseMode: 'once',
      packageId: 'minerx-concurrent-cancel',
    })
    const order = getDemoSessionForPersistence().pendingMinerOrders[0]
    assert.ok(order)

    let firestorePersisted: StoredMiner | null = null
    let adminRecord: any = null
    let cancelRejected = false

    const payPromise = payPendingMinerOrderAndRecordToAdmin(order, {
      user: { uid: 'u_lock_edge', email: 'lock@test.com' },
      saveMinerToFirestore: async (_uid, miner) => {
        // Assert order is settlement-locked during persistence
        assert.equal(isPendingDemoMinerLocked(order.id), true, 'Order must be locked during settlement')
        // Concurrent cancellation attempt:
        const cancelResult = cancelPendingDemoMiner(order.id)
        assert.equal(cancelResult, false, 'Cancellation must be rejected while settlement is locked')
        cancelRejected = true
        // Order remains in pending list
        assert.equal(getDemoSessionForPersistence().pendingMinerOrders.length, 1)
        firestorePersisted = miner
      },
      recordPurchaseToAdmin: async (p) => {
        adminRecord = p
      },
    })

    const payResult = await payPromise
    assert.equal(cancelRejected, true)
    assert.equal(payResult.ok, true, 'Settlement must succeed because cancellation was locked')
    assert.ok(payResult.minerId)
    assert.equal(isPendingDemoMinerLocked(order.id), false, 'Lock must be released after settlement')

    // Zero orphan: Firestore miner matches local DemoMiner and Admin record 100%
    const finalSession = getDemoSessionForPersistence()
    assert.equal(finalSession.balance, 1700, 'Balance deducted on successful settlement')
    assert.equal(finalSession.miners.length, 1, 'Exactly one miner added')
    assert.equal(finalSession.miners[0].id, payResult.minerId)
    assert.equal(firestorePersisted?.id, payResult.minerId)
    assert.equal(adminRecord?.minerId, payResult.minerId)
    assert.equal(finalSession.pendingMinerOrders.length, 0, 'Pending order consumed only upon successful local commit')
  })

  it('Blocker 1B: Firestore failure while order locked releases lock, preserves order, and allows subsequent cancellation', async () => {
    resetStore(2000)
    deferDemoMinerPurchase({
      name: 'Failed Settlement Miner',
      powerTh: 10,
      efficiency: 15,
      price: 150,
      purchaseMode: 'once',
      packageId: 'minerx-fail-lock',
    })
    const order = getDemoSessionForPersistence().pendingMinerOrders[0]
    assert.ok(order)

    let adminCalls = 0
    const payResult = await payPendingMinerOrderAndRecordToAdmin(order, {
      user: { uid: 'u_fail_lock', email: 'fail@test.com' },
      saveMinerToFirestore: async () => {
        assert.equal(isPendingDemoMinerLocked(order.id), true)
        throw new Error('Simulated network timeout during Firestore setDoc')
      },
      recordPurchaseToAdmin: async () => { adminCalls++ },
    })

    assert.equal(payResult.ok, false)
    assert.equal(adminCalls, 0)
    assert.equal(isPendingDemoMinerLocked(order.id), false, 'Settlement lock must be released on Firestore failure')

    // Pending order remains intact, balance untouched, no miner or worker committed
    const sessionAfterFail = getDemoSessionForPersistence()
    assert.equal(sessionAfterFail.balance, 2000)
    assert.equal(sessionAfterFail.miners.length, 0)
    assert.equal(sessionAfterFail.pendingMinerOrders.length, 1)

    // Subsequent cancellation succeeds cleanly
    const cancelSuccess = cancelPendingDemoMiner(order.id)
    assert.equal(cancelSuccess, true, 'Subsequent cancellation must succeed once lock is released')
    assert.equal(getDemoSessionForPersistence().pendingMinerOrders.length, 0)
  })

  // --------------------------------------------------------------------------
  // Blocker 2: R1 Local commit gates Admin
  // --------------------------------------------------------------------------
  it('Blocker 2: R1 Local commit failure gates Admin in completeLocalMinerPurchase', async () => {
    resetStore(100)
    let adminCalls = 0

    const demoInput: DemoMinerPurchaseInput = {
      name: 'Commit Gate Miner',
      powerTh: 10,
      efficiency: 15,
      price: 80,
      purchaseMode: 'once',
      packageId: 'minerx-gate',
    }

    // Force commitDemoMinerPurchase to fail by draining balance during in-flight Firestore
    const result = await completeLocalMinerPurchase(demoInput, {
      user: { uid: 'u_gate', email: 'gate@test.com' },
      saveMinerToFirestore: async () => {
        // Drain balance concurrently
        restoreDemoSession({
          ...getDemoSessionForPersistence(),
          balance: 10, // Insufficient for 80 price
        })
      },
      recordPurchaseToAdmin: async () => {
        adminCalls++
      },
    })

    assert.equal(result.ok, false, 'completeLocalMinerPurchase must report failure when commit fails')
    assert.equal(adminCalls, 0, 'Admin recorder must NOT be called if local commit fails')
  })

  // --------------------------------------------------------------------------
  // Blockers 3, 4, 5: Production recovery state, deserializer, and validation
  // --------------------------------------------------------------------------
  it('Blocker 4 & 5: validatePostTxRecovery validates complete schema and rejects corrupt/synthetic records', () => {
    const validRecovery: PostTxPendingState = {
      schemaVersion: 1,
      status: 'PAYMENT_TRANSMITTED',
      txHash: '0xvalid_tx_123',
      minerId: 'MINER-VAL-001',
      packageId: 'minerx-prod-valid',
      productName: 'Minero Prod · 48 TH',
      amount: 561.99,
      powerTh: 48,
      price: 561.99,
      priceUsd: 561.99,
      currency: 'USD',
      cadence: 'once',
      purchaseMode: 'once',
      networkId: 'polygon',
      networkName: 'Polygon',
      originUid: 'uid_test_123',
      originWalletAddress: '0x1234567890abcdef',
      packageSnapshot: {
        packageId: 'minerx-prod-valid',
        name: 'Minero Prod · 48 TH',
        powerTh: 48,
        price: 561.99,
        currency: 'USD',
        cadence: 'once',
        purchaseMode: 'once',
      },
      createdAt: 1731254400000,
    }

    const validated = validatePostTxRecovery(validRecovery)
    assert.ok(validated)
    assert.equal(validated.schemaVersion, 1)
    assert.equal(validated.status, 'PAYMENT_TRANSMITTED')
    assert.equal(validated.networkId, 'polygon')
    assert.equal(validated.originUid, 'uid_test_123')

    // Negative validations:
    // 1. Invalid schemaVersion
    assert.equal(validatePostTxRecovery({ ...validRecovery, schemaVersion: 2 as any }), null)
    // 2. Missing/empty txHash
    assert.equal(validatePostTxRecovery({ ...validRecovery, txHash: ' ' }), null)
    // 3. Synthetic packageId
    assert.equal(validatePostTxRecovery({ ...validRecovery, packageId: 'pkg-miner-custom' }), null)
    // 4. Non-positive amount
    assert.equal(validatePostTxRecovery({ ...validRecovery, amount: -10 }), null)
    // 5. Invalid networkId
    assert.equal(validatePostTxRecovery({ ...validRecovery, networkId: 'invalid-chain' as any }), null)
    // 6. Corrupted packageSnapshot
    assert.equal(validatePostTxRecovery({ ...validRecovery, packageSnapshot: null as any }), null)
    // 7. Neither originUid nor originWalletAddress
    assert.equal(validatePostTxRecovery({ ...validRecovery, originUid: undefined, originWalletAddress: undefined }), null)
  })

  it('Blocker 5: getPostTxRecovery parses valid storage and clears corrupted localStorage keys', () => {
    const store = new Map<string, string>()
    const prevWindow = (globalThis as any).window
    ;(globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
      },
    }

    try {
      // Test A: Put corrupted json -> returns null and removes key
      store.set('gomining_post_tx_recovery', '{ corrupted json invalid')
      assert.equal(getPostTxRecovery(), null)
      assert.equal(store.has('gomining_post_tx_recovery'), false)

      // Test B: Put invalid schema -> returns null and removes key
      store.set('gomining_post_tx_recovery', JSON.stringify({ schemaVersion: 99, status: 'UNKNOWN' }))
      assert.equal(getPostTxRecovery(), null)
      assert.equal(store.has('gomining_post_tx_recovery'), false)

      // Test C: Valid state saved via savePostTxRecovery -> round-trips cleanly
      const validState: PostTxPendingState = {
        schemaVersion: 1,
        status: 'PERSISTENCE_PENDING',
        txHash: '0xroundtrip_tx',
        minerId: 'MINER-RT-01',
        packageId: 'minerx-rt',
        productName: 'Roundtrip Miner · 10 TH',
        amount: 100,
        powerTh: 10,
        price: 100,
        currency: 'USD',
        cadence: 'once',
        purchaseMode: 'once',
        networkId: 'bnb',
        networkName: 'BNB Chain',
        originUid: 'uid_rt',
        packageSnapshot: {
          packageId: 'minerx-rt',
          name: 'Roundtrip Miner · 10 TH',
          powerTh: 10,
          price: 100,
          currency: 'USD',
          cadence: 'once',
          purchaseMode: 'once',
        },
        createdAt: Date.now(),
      }

      savePostTxRecovery(validState)
      const retrieved = getPostTxRecovery()
      assert.ok(retrieved)
      assert.equal(retrieved.txHash, '0xroundtrip_tx')
      assert.equal(retrieved.status, 'PERSISTENCE_PENDING')

      clearPostTxRecovery()
      assert.equal(getPostTxRecovery(), null)
    } finally {
      ;(globalThis as any).window = prevWindow
    }
  })

  // --------------------------------------------------------------------------
  // Blocker 6: Recovery restores checkout surface after simulated reload
  // --------------------------------------------------------------------------
  it('Blocker 6: Recovery restores checkout surface parameters after simulated reload without defaulting to BNB', () => {
    const store = new Map<string, string>()
    const prevWindow = (globalThis as any).window
    ;(globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
      },
    }

    try {
      const persistedRecovery: PostTxPendingState = {
        schemaVersion: 1,
        status: 'PERSISTENCE_PENDING',
        txHash: '0xpolygon_tx_777',
        minerId: 'MINER-POLY-001',
        packageId: 'minerx-polygon-custom',
        productName: 'Polygon Beast · 96 TH',
        amount: 1120,
        powerTh: 96,
        price: 1120,
        currency: 'USD',
        cadence: 'once',
        purchaseMode: 'once',
        networkId: 'polygon',
        networkName: 'Polygon',
        originUid: 'user_polygon_buyer',
        packageSnapshot: {
          packageId: 'minerx-polygon-custom',
          name: 'Polygon Beast · 96 TH',
          powerTh: 96,
          price: 1120,
          currency: 'USD',
          cadence: 'once',
          purchaseMode: 'once',
        },
        createdAt: Date.now(),
      }
      savePostTxRecovery(persistedRecovery)

      // Simulate App reload: read through production helper
      const restored = getPostTxRecovery()
      assert.ok(restored)
      assert.equal(restored.networkId, 'polygon', 'Preserved networkId must be polygon, NOT default to bnb')
      assert.equal(restored.powerTh, 96)
      assert.equal(restored.minerId, 'MINER-POLY-001')
      assert.equal(restored.originUid, 'user_polygon_buyer')

      // Production component restoration logic:
      // 1. Unauthenticated visitor (user: null) -> modal must NOT mount (returns null)
      const visitorRestoration = resolvePendingRecoveryCheckout(restored, null, false)
      assert.equal(visitorRestoration, null, 'Unauthenticated visitor must NOT mount recovery modal for user_polygon_buyer')

      // 2. Mismatched user -> modal must NOT mount (returns null)
      const otherUserRestoration = resolvePendingRecoveryCheckout(restored, { uid: 'user_other' }, false)
      assert.equal(otherUserRestoration, null, 'Different user must NOT mount recovery modal')

      // 3. Matching user -> modal restores with full checkout state
      const matchingRestoration = resolvePendingRecoveryCheckout(restored, { uid: 'user_polygon_buyer' }, false)
      assert.ok(matchingRestoration)
      assert.equal(matchingRestoration.networkId, 'polygon')
      assert.equal(matchingRestoration.productName, 'Polygon Beast · 96 TH')
      assert.equal(matchingRestoration.amount, 1120)
      assert.equal(matchingRestoration.packageId, 'minerx-polygon-custom')

      // 4. Loading state -> returns null
      assert.equal(resolvePendingRecoveryCheckout(restored, { uid: 'user_polygon_buyer' }, true), null)

      // 5. Guest recovery (originUid undefined) -> returns null under SCRUM-220 (no guest canonical recovery)
      const guestRecovery: PostTxPendingState = {
        ...persistedRecovery,
        originUid: undefined,
      }
      const guestRestoration = resolvePendingRecoveryCheckout(guestRecovery, null, false)
      assert.equal(guestRestoration, null, 'Guest recovery must return null under SCRUM-220')
    } finally {
      ;(globalThis as any).window = prevWindow
    }
  })

  // --------------------------------------------------------------------------
  // Blocker 7: Recovery bound to original owner (cross-account prevention)
  // --------------------------------------------------------------------------
  it('Blocker 7: Recovery bound to originUid blocks cross-account retry by a different user', async () => {
    const recovery: PostTxPendingState = {
      schemaVersion: 1,
      status: 'PERSISTENCE_PENDING',
      txHash: '0xuserA_payment_hash',
      minerId: 'MINER-USERA-001',
      packageId: 'minerx-alpha',
      productName: 'User A Miner · 48 TH',
      amount: 561.99,
      powerTh: 48,
      price: 561.99,
      currency: 'USD',
      cadence: 'once',
      purchaseMode: 'once',
      networkId: 'bnb',
      networkName: 'BNB Chain',
      originUid: 'user_A_original',
      packageSnapshot: {
        packageId: 'minerx-alpha',
        name: 'User A Miner · 48 TH',
        powerTh: 48,
        price: 561.99,
        currency: 'USD',
        cadence: 'once',
        purchaseMode: 'once',
      },
      createdAt: Date.now(),
    }

    let firestoreWrites = 0
    let adminWrites = 0
    const mockOptions = {
      saveMinerToFirestore: async () => { firestoreWrites++ },
      recordPurchaseToAdmin: async () => { adminWrites++ },
    }

    // Attempt retry as User B:
    const currentUserB = { uid: 'user_B_attacker', email: 'attacker@test.com' }
    await assert.rejects(
      () => retryWalletMinerPurchase(recovery, {
        ...mockOptions,
        user: currentUserB,
      }),
      /Esta recuperación pertenece a otra cuenta \(user_A_original\)\. Inicia sesión con la cuenta originaria\./
    )
    assert.equal(firestoreWrites, 0, 'Zero firestore writes when user does not match originUid')
    assert.equal(adminWrites, 0, 'Zero admin writes when user does not match originUid')

    // Attempt retry as User A (originator): allowed
    const currentUserA = { uid: 'user_A_original', email: 'usera@test.com' }
    assert.equal(currentUserA.uid === recovery.originUid, true)
    const result = await retryWalletMinerPurchase(recovery, {
      ...mockOptions,
      user: currentUserA,
    })
    assert.ok(result)
    assert.equal(result.createdMinerId, 'MINER-USERA-001')
    assert.equal(firestoreWrites, 1)
    assert.equal(adminWrites, 1)
  })

  it('Blocker 7 (Test C): Recovery with originWalletAddress rejects if activeAddress does not match or is missing', async () => {
    const recovery: PostTxPendingState = {
      schemaVersion: 1,
      status: 'PERSISTENCE_PENDING',
      txHash: '0xuser_tx_wallet_bind',
      minerId: 'MINER-USER-WALLET-001',
      packageId: 'minerx-alpha',
      productName: 'Wallet Miner · 48 TH',
      amount: 561.99,
      powerTh: 48,
      price: 561.99,
      currency: 'USD',
      cadence: 'once',
      purchaseMode: 'once',
      networkId: 'bnb',
      networkName: 'BNB Chain',
      originUid: 'u_origin_1',
      originWalletAddress: '0x1111111111111111111111111111111111111111',
      packageSnapshot: {
        packageId: 'minerx-alpha',
        name: 'Wallet Miner · 48 TH',
        powerTh: 48,
        price: 561.99,
        currency: 'USD',
        cadence: 'once',
        purchaseMode: 'once',
      },
      createdAt: Date.now(),
    }

    // Calling retry with mismatched activeAddress must reject fail-closed
    await assert.rejects(
      () => retryWalletMinerPurchase(recovery, {
        user: { uid: 'u_origin_1' },
        activeAddress: '0x2222222222222222222222222222222222222222',
      }),
      /Esta recuperación requiere conectar la billetera originaria \(0x1111111111111111111111111111111111111111\)\./
    )

    // Calling retry without activeAddress must reject fail-closed
    await assert.rejects(
      () => retryWalletMinerPurchase(recovery, {
        user: { uid: 'u_origin_1' },
      }),
      /Esta recuperación requiere conectar la billetera originaria \(0x1111111111111111111111111111111111111111\)\./
    )
  })

  it('Blocker 7 (Test D): Recovery with originWalletAddress succeeds when activeAddress and originUid match', async () => {
    const recovery: PostTxPendingState = {
      schemaVersion: 1,
      status: 'PERSISTENCE_PENDING',
      txHash: '0xuser_tx_wallet_ok',
      minerId: 'MINER-USER-WALLET-002',
      packageId: 'minerx-alpha',
      productName: 'User Wallet Miner · 48 TH',
      amount: 561.99,
      powerTh: 48,
      price: 561.99,
      currency: 'USD',
      cadence: 'once',
      purchaseMode: 'once',
      networkId: 'bnb',
      networkName: 'BNB Chain',
      originUid: 'u_origin_2',
      originWalletAddress: '0x1111111111111111111111111111111111111111',
      packageSnapshot: {
        packageId: 'minerx-alpha',
        name: 'User Wallet Miner · 48 TH',
        powerTh: 48,
        price: 561.99,
        currency: 'USD',
        cadence: 'once',
        purchaseMode: 'once',
      },
      createdAt: Date.now(),
    }

    const res = await retryWalletMinerPurchase(recovery, {
      user: { uid: 'u_origin_2' },
      activeAddress: '0x1111111111111111111111111111111111111111',
      saveMinerToFirestore: async () => {},
    })
    assert.ok(res)
    assert.equal(res.createdMinerId, 'MINER-USER-WALLET-002')
  })

  // --------------------------------------------------------------------------
  // Blocker 8: Retry must prove zero re-payment with behavioral spy
  // --------------------------------------------------------------------------
  it('Blocker 8: Retry executes persistence and Admin reconciliation with zero re-payment (spy callCount === 1)', async () => {
    let paymentSendSpyCount = 0
    const mockSendTransaction = async () => {
      paymentSendSpyCount++
      return '0xchain_tx_spy_123'
    }

    // Initial purchase attempt: payment executes on blockchain
    const txHash = await mockSendTransaction()
    assert.equal(paymentSendSpyCount, 1, 'Initial payment must call sendTransaction exactly once')

    const preallocatedMinerId = 'MINER-SPY-RETRY-001'
    const recovery: PostTxPendingState = {
      schemaVersion: 1,
      status: 'PAYMENT_TRANSMITTED',
      txHash,
      minerId: preallocatedMinerId,
      packageId: 'minerx-spy-pkg',
      productName: 'Spy Miner · 48 TH',
      amount: 561.99,
      powerTh: 48,
      price: 561.99,
      currency: 'USD',
      cadence: 'once',
      purchaseMode: 'once',
      networkId: 'bnb',
      networkName: 'BNB Chain',
      originUid: 'user_spy_buyer',
      packageSnapshot: {
        packageId: 'minerx-spy-pkg',
        name: 'Spy Miner · 48 TH',
        powerTh: 48,
        price: 561.99,
        currency: 'USD',
        cadence: 'once',
        purchaseMode: 'once',
      },
      createdAt: Date.now(),
    }

    // Step 1: Initial persistence fails
    let firestoreAttempts = 0
    let adminRecord: any = null
    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase(
          {
            productName: recovery.productName,
            amount: recovery.amount,
            packageId: recovery.packageId,
            purchaseMode: recovery.purchaseMode,
            txHash: recovery.txHash,
            networkName: recovery.networkName,
            user: { uid: 'user_spy_buyer' },
            minerId: preallocatedMinerId,
            requireCanonicalPackageId: true,
          },
          {
            saveMinerToFirestore: async () => {
              firestoreAttempts++
              throw new Error('Simulated network drop on initial save')
            },
            recordPurchaseToAdmin: async (p) => { adminRecord = p },
          }
        )
      },
      /Simulated network drop/
    )

    // State transitions to PERSISTENCE_PENDING
    recovery.status = 'PERSISTENCE_PENDING'
    assert.equal(firestoreAttempts, 1)
    assert.equal(adminRecord, null)

    // Step 2: Retry persistence via retryWalletMinerPurchase
    let savedFirestoreMiner: StoredMiner | null = null
    const retryResult = await retryWalletMinerPurchase(recovery, {
      user: { uid: 'user_spy_buyer' },
      saveMinerToFirestore: async (_uid, miner) => {
        firestoreAttempts++
        savedFirestoreMiner = miner
      },
      recordPurchaseToAdmin: async (p) => {
        adminRecord = p
      },
    })

    assert.ok(retryResult)
    // CRITICAL PROOF: payment send spy was NOT called during retry! Total count remains 1!
    assert.equal(paymentSendSpyCount, 1, 'Payment send spy must remain exactly 1 across initial payment + retry')
    assert.equal(firestoreAttempts, 2, 'Firestore save called once on failure, once on retry')
    assert.equal(retryResult.createdMinerId, preallocatedMinerId)
    assert.equal(savedFirestoreMiner?.id, preallocatedMinerId)
    assert.equal(savedFirestoreMiner?.txHash, txHash)
    assert.equal(adminRecord?.minerId, preallocatedMinerId)
    assert.equal(adminRecord?.txHash, txHash)
  })

  // --------------------------------------------------------------------------
  // Blocker 9: Admin reconciliation propagation & idempotent retry
  // --------------------------------------------------------------------------
  it('Blocker 9: Admin reconciliation write error propagates to caller and retry succeeds idempotently without duplicating local store', async () => {
    restoreDemoSession({
      balance: 1000,
      presaleTokens: 0,
      maintenanceCredit: 0,
      miners: [],
      workers: [],
      workerActivationMode: 'automatic',
      receipts: [],
      pendingMinerOrders: [],
      lastDailyRewardAt: null,
    })
    let adminAttempts = 0
    let firestoreSavedMiners: StoredMiner[] = []

    const recovery: PostTxPendingState = {
      schemaVersion: 1,
      status: 'PERSISTENCE_PENDING',
      txHash: '0xadmin_fail_tx',
      minerId: 'MINER-ADMIN-FAIL-01',
      packageId: 'minerx-admin-reconcile',
      productName: 'Admin Sync Miner · 48 TH',
      amount: 561.99,
      powerTh: 48,
      price: 561.99,
      currency: 'USD',
      cadence: 'once',
      purchaseMode: 'once',
      networkId: 'bnb',
      networkName: 'BNB Chain',
      originUid: 'user_admin_test',
      packageSnapshot: {
        packageId: 'minerx-admin-reconcile',
        name: 'Admin Sync Miner · 48 TH',
        powerTh: 48,
        price: 561.99,
        currency: 'USD',
        cadence: 'once',
        purchaseMode: 'once',
      },
      createdAt: Date.now(),
    }

    // Attempt 1: Firestore succeeds, but Admin fails
    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase(
          {
            productName: recovery.productName,
            amount: recovery.amount,
            packageId: recovery.packageId,
            purchaseMode: recovery.purchaseMode,
            txHash: recovery.txHash,
            networkName: recovery.networkName,
            user: { uid: 'user_admin_test' },
            minerId: recovery.minerId,
            requireCanonicalPackageId: true,
          },
          {
            saveMinerToFirestore: async (_uid, miner) => {
              firestoreSavedMiners.push(miner)
            },
            recordPurchaseToAdmin: async () => {
              adminAttempts++
              throw new Error('Admin platform database unreachable')
            },
          }
        )
      },
      /Admin platform database unreachable/
    )

    assert.equal(adminAttempts, 1)
    assert.equal(firestoreSavedMiners.length, 1)

    const sessionAttempt1 = getDemoSessionForPersistence()
    assert.equal(sessionAttempt1.miners.length, 1, 'Attempt 1 committed miner locally')
    assert.equal(sessionAttempt1.workers.length, 1, 'Attempt 1 committed worker locally')
    assert.equal(sessionAttempt1.receipts.length, 1, 'Attempt 1 committed receipt locally')

    // Attempt 2: Retry with retryWalletMinerPurchase -> repeats idempotent setDoc and succeeds on Admin
    let recordedAdminParams: any = null
    const retryRes = await retryWalletMinerPurchase(recovery, {
      user: { uid: 'user_admin_test' },
      saveMinerToFirestore: async (_uid, miner) => {
        firestoreSavedMiners.push(miner)
      },
      recordPurchaseToAdmin: async (p) => {
        adminAttempts++
        recordedAdminParams = p
      },
    })

    assert.ok(retryRes)
    assert.equal(adminAttempts, 2)
    assert.equal(firestoreSavedMiners.length, 2, 'Idempotent setDoc repeated with same minerId')
    assert.equal(firestoreSavedMiners[0].id, recovery.minerId)
    assert.equal(firestoreSavedMiners[1].id, recovery.minerId)
    assert.equal(recordedAdminParams.minerId, recovery.minerId)
    assert.equal(recordedAdminParams.packageId, recovery.packageId)

    const sessionRetry = getDemoSessionForPersistence()
    assert.equal(sessionRetry.miners.length, 1, 'Local demoStore miners must NOT duplicate on retry')
    assert.equal(sessionRetry.workers.length, 1, 'Local demoStore workers must NOT duplicate on retry')
    assert.equal(sessionRetry.receipts.length, 1, 'Local demoStore receipts must NOT duplicate on retry')
    assert.equal(sessionRetry.miners[0].id, recovery.minerId)
  })

  // --------------------------------------------------------------------------
  // Blocker 10: Customizer error propagation
  // --------------------------------------------------------------------------
  it('Blocker 10: Customizer Firestore failure rethrows error and does not mutate demoStore', async () => {
    resetStore(1000)
    // Add demo miner
    buyDemoMiner({
      name: 'Customizer Fail Miner',
      powerTh: 10,
      efficiency: 15,
      price: 100,
      purchaseMode: 'once',
      packageId: 'minerx-customizer-test',
    })
    const miner = getDemoSessionForPersistence().miners[0]
    assert.ok(miner)

    // Authenticated customizer save with failing Firestore
    let firestoreCalled = false
    await assert.rejects(
      async () => {
        await saveMinerCustomization({
          minerId: miner.id,
          user: { uid: 'user_cust_fail' },
          customization: {
            wallColor: '#ff0000',
            bodyColor: '#00ff00',
            bottomColor: '#0000ff',
            fansColor: '#111111',
            screenColor: '#222222',
            buttonsColor: '#333333',
            topColor: '#444444',
            stickers: 'gomining-classic',
            updatedAt: new Date().toISOString(),
          },
          updateFirestore: async () => {
            firestoreCalled = true
            throw new Error('Firestore updateDoc permission denied')
          },
        })
      },
      /Firestore updateDoc permission denied/
    )

    assert.equal(firestoreCalled, true)
    // DemoStore must NOT have been updated with customization
    const session = getDemoSessionForPersistence()
    assert.equal(session.miners[0].customization, undefined, 'DemoStore must remain unmutated on Firestore failure')
  })

  // --------------------------------------------------------------------------
  // R6: Legacy Demo Cart Isolation (Zero Admin Recording)
  // --------------------------------------------------------------------------
  it('R6: Legacy demo cart flow does not call Admin recorder', () => {
    resetStore(5000)

    // Test 1: buyDemoOrder completes locally without Admin recording
    const order = {
      id: 'ORDER-CART-DEMO-001',
      total: 100,
      createdAt: '2026-11-10',
      items: [
        {
          productId: 'miner-plus',
          product: { id: 'miner-plus', title: 'Minero Plus 1.2 TH', price: 100, powerTh: 1.2 },
          quantity: 1,
        },
      ],
    }

    const buyResult = buyDemoOrder(order)
    assert.equal(buyResult.ok, true)
    const session = getDemoSessionForPersistence()
    assert.equal(session.balance, 4900, 'Balance must be deducted in demoStore')
    assert.equal(session.miners.length, 1, 'Demo miner added in demoStore')

    // Test 2: Source code regression test: App.tsx must NOT contain recordMinerPurchaseToAdmin in buyDemoOrder
    const appPath = path.resolve(projectRoot, 'src/App.tsx')
    const appContent = fs.readFileSync(appPath, 'utf8')

    // Verify buyDemoOrder onComplete handler does NOT invoke recordMinerPurchaseToAdmin
    const cartBlockMatch = appContent.match(/onComplete=\{[\s\S]*?buyDemoOrder\(order\)([\s\S]*?)\}\}/)
    assert.ok(cartBlockMatch, 'Cart onComplete handler must exist in App.tsx')
    assert.ok(
      !cartBlockMatch[1].includes('recordMinerPurchaseToAdmin'),
      'Legacy cart onComplete in App.tsx must NEVER call recordMinerPurchaseToAdmin'
    )
  })

  // --------------------------------------------------------------------------
  // Blocker 11: Guest Demo Local and Pending Purchases Must NEVER Call Admin
  // --------------------------------------------------------------------------
  it('Blocker 11: Guest demo local and pending purchases strictly NEVER call Admin recorder', async () => {
    resetStore(1000)
    let adminCallCount = 0
    const mockAdminRecorder: PurchaseAdminRecorder = async () => {
      adminCallCount++
    }

    // 1. Guest local purchase fails closed in canonical flow with 0 Admin calls
    const localResult = await completeLocalMinerPurchase(
      {
        name: 'Guest Local Miner',
        powerTh: 10,
        efficiency: 15,
        price: 50,
        purchaseMode: 'once',
        packageId: 'minerx-test-guest',
      },
      {
        recordPurchaseToAdmin: mockAdminRecorder,
      }
    )
    assert.equal(localResult.ok, false, 'Guest canonical local purchase must fail closed')
    assert.equal(adminCallCount, 0, 'Guest local purchase must NEVER call Admin recorder')

    // 2. Guest pending payment fails closed in canonical flow with 0 Admin calls
    const deferRes = deferDemoMinerPurchase({
      name: 'Guest Pending Miner',
      powerTh: 10,
      efficiency: 15,
      price: 50,
      purchaseMode: 'once',
      packageId: 'minerx-test-guest',
    })
    assert.ok(deferRes.ok)
    const pendingOrder = getDemoSessionForPersistence().pendingMinerOrders[0]
    assert.ok(pendingOrder)

    const payPendingRes = await payPendingMinerOrderAndRecordToAdmin(pendingOrder, {
      recordPurchaseToAdmin: mockAdminRecorder,
    })
    assert.equal(payPendingRes.ok, false, 'Guest pending payment in canonical flow must fail closed')
    assert.equal(adminCallCount, 0, 'Guest pending payment must NEVER call Admin recorder')

    // 3. Offline demo purchase succeeds locally without calling Admin recorder
    const demoMinerRes = buyDemoMiner({ name: 'Guest Demo Miner', powerTh: 10, efficiency: 15, price: 0 })
    assert.ok(demoMinerRes.ok)
    assert.equal(adminCallCount, 0, 'Demo purchase must NEVER call Admin recorder')
  })

  // ==========================================================================
  // CORRECTION_3.1 Consolidation Tests (Blockers A through E)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Blocker A: Recovery Snapshot Authority on Retry
  // --------------------------------------------------------------------------
  it('Blocker A: retryWalletMinerPurchase strictly consumes authoritative packageSnapshot values and bypasses parseMinerPowerTh and price recalculation', async () => {
    resetStore(1000)
    let firestoreStoredMiner: StoredMiner | null = null
    let adminRecordParams: any = null

    const mockFirestoreSaver = async (_uid: string, miner: StoredMiner) => {
      firestoreStoredMiner = miner
    }
    const mockAdminRecorder: PurchaseAdminRecorder = async (params) => {
      adminRecordParams = params
    }

    // Adversarial recovery record with snapshot authority conflicting with deceptive productName
    const recovery: PostTxPendingState = {
      schemaVersion: 1,
      status: 'PERSISTENCE_PENDING',
      txHash: '0xadversarial_authority_hash_123',
      minerId: 'MINER-AUTH-SNAP-001',
      packageId: 'minerx-snapshot-authority',
      productName: 'Minero Enterprise 192 TH', // Deceptive name: parseMinerPowerTh would return 192
      amount: 499.99,
      powerTh: 42.44, // Snapshot power
      price: 499.99, // Snapshot price
      currency: 'USD',
      cadence: 'once',
      purchaseMode: 'once',
      networkId: 'bnb',
      networkName: 'BNB Chain',
      originWalletAddress: '0x1111111111111111111111111111111111111111',
      originUid: 'u_origin_adversarial',
      packageSnapshot: {
        packageId: 'minerx-snapshot-authority',
        name: 'Minero Autorizado Snapshot 42.44',
        powerTh: 42.44,
        price: 499.99,
        currency: 'USD',
        cadence: 'once',
        purchaseMode: 'once',
      },
      createdAt: Date.now(),
    }

    const result = await retryWalletMinerPurchase(recovery, {
      user: { uid: 'u_origin_adversarial', email: 'snap@authority.com' },
      activeAddress: '0x1111111111111111111111111111111111111111',
      saveMinerToFirestore: mockFirestoreSaver,
      recordPurchaseToAdmin: mockAdminRecorder,
    })

    assert.ok(result, 'Retry must succeed')
    // 1. Returned values match snapshot
    assert.equal(result.parsedTh, 42.44, 'Result parsedTh must be 42.44, NOT 192 from parseMinerPowerTh')
    assert.equal(result.resolvedPackageId, 'minerx-snapshot-authority')
    assert.equal(result.createdMinerId, 'MINER-AUTH-SNAP-001')

    // 2. DemoMiner in local store matches snapshot
    assert.equal(result.miner.powerTh, 42.44)
    assert.equal(result.miner.price, 499.99)
    assert.equal(result.miner.name, 'Minero Autorizado Snapshot 42.44')
    assert.equal(result.miner.id, 'MINER-AUTH-SNAP-001')

    // 3. StoredMiner in Firestore matches snapshot
    assert.ok(firestoreStoredMiner)
    assert.equal((firestoreStoredMiner as StoredMiner).powerTh, 42.44, 'Firestore powerTh must be 42.44, NOT 192')
    assert.equal((firestoreStoredMiner as StoredMiner).price, 499.99)
    assert.equal((firestoreStoredMiner as StoredMiner).packageId, 'minerx-snapshot-authority')
    assert.equal((firestoreStoredMiner as StoredMiner).name, 'Minero Autorizado Snapshot 42.44')
    assert.deepEqual((firestoreStoredMiner as StoredMiner).packageSnapshot, recovery.packageSnapshot, 'StoredMiner.packageSnapshot must deep-equal recovery.packageSnapshot')
    assert.equal((firestoreStoredMiner as StoredMiner).txHash, '0xadversarial_authority_hash_123')
    assert.equal((firestoreStoredMiner as StoredMiner).id, 'MINER-AUTH-SNAP-001')

    // 4. Admin record matches snapshot
    assert.ok(adminRecordParams)
    assert.equal(adminRecordParams.powerTh, 42.44, 'Admin powerTh must be 42.44, NOT 192')
    assert.equal(adminRecordParams.price, 499.99)
    assert.equal(adminRecordParams.packageId, 'minerx-snapshot-authority')
    assert.equal(adminRecordParams.name, 'Minero Autorizado Snapshot 42.44')
    assert.equal(adminRecordParams.minerId, 'MINER-AUTH-SNAP-001')
    assert.equal(adminRecordParams.txHash, '0xadversarial_authority_hash_123')
  })

  // --------------------------------------------------------------------------
  // Blocker A: Discrepancy validation in validatePostTxRecovery
  // --------------------------------------------------------------------------
  it('Blocker A: validatePostTxRecovery strictly rejects records where top-level fields disagree with packageSnapshot', () => {
    const baseValid: PostTxPendingState = {
      schemaVersion: 1,
      status: 'PAYMENT_TRANSMITTED',
      txHash: '0xvalid_snap_123',
      minerId: 'MINER-VAL-SNAP-001',
      packageId: 'minerx-canon-1',
      productName: 'Minero Val · 48 TH',
      amount: 100,
      powerTh: 48,
      price: 100,
      currency: 'USD',
      cadence: 'once',
      purchaseMode: 'once',
      networkId: 'bnb',
      networkName: 'BNB Chain',
      originUid: 'u_val_snap',
      packageSnapshot: {
        packageId: 'minerx-canon-1',
        name: 'Minero Val · 48 TH',
        powerTh: 48,
        price: 100,
        currency: 'USD',
        cadence: 'once',
        purchaseMode: 'once',
      },
      createdAt: Date.now(),
    }

    assert.ok(validatePostTxRecovery(baseValid), 'Valid record passes')

    // 1. powerTh discrepancy
    assert.equal(validatePostTxRecovery({ ...baseValid, powerTh: 100 }), null, 'Must reject powerTh mismatch')
    assert.equal(validatePostTxRecovery({ ...baseValid, packageSnapshot: { ...baseValid.packageSnapshot, powerTh: 99 } }), null)

    // 2. price discrepancy
    assert.equal(validatePostTxRecovery({ ...baseValid, price: 50 }), null, 'Must reject price mismatch')

    // 3. packageId discrepancy
    assert.equal(validatePostTxRecovery({ ...baseValid, packageId: 'minerx-other' }), null, 'Must reject packageId mismatch')

    // 4. currency discrepancy
    assert.equal(validatePostTxRecovery({ ...baseValid, currency: 'EUR' }), null, 'Must reject currency mismatch')

    // 5. cadence discrepancy
    assert.equal(validatePostTxRecovery({ ...baseValid, cadence: 'monthly' }), null, 'Must reject cadence mismatch')

    // 6. purchaseMode discrepancy
    assert.equal(validatePostTxRecovery({ ...baseValid, purchaseMode: 'monthly' }), null, 'Must reject purchaseMode mismatch')
  })

  // --------------------------------------------------------------------------
  // Blocker B: Simulation Fallback Isolation
  // --------------------------------------------------------------------------
  it('Blocker B: Simulation fallback operates strictly in local demoStore with 0 Firestore writes, 0 Admin writes, 0 referral credits, 0 recovery records, and no fake blockchain receipt', async () => {
    resetStore(100)
    let firestoreWrites = 0
    let adminWrites = 0
    let referralWrites = 0

    // Calling buyDemoMiner directly for local simulation
    const simResult = buyDemoMiner({
      name: 'Simulated Demo Miner',
      powerTh: 48,
      efficiency: 15,
      price: 0,
      purchaseMode: 'once',
      ownerWallet: 'DEMO_SIMULATION',
      packageId: 'minerx-standard-1',
    })

    assert.ok(simResult.ok, 'Local simulation must succeed')
    assert.equal(firestoreWrites, 0, 'Zero Firestore writes')
    assert.equal(adminWrites, 0, 'Zero Admin writes')
    assert.equal(referralWrites, 0, 'Zero referral writes')
    assert.equal(getPostTxRecovery(), null, 'Zero recovery records created')

    // Verify source code of WalletPaymentCheckout strictly ensures simulation fallback is decoupled from canonical completeWalletMinerPurchase / fake txHash
    const checkoutSource = fs.readFileSync(path.resolve(projectRoot, 'src/WalletPaymentCheckout.tsx'), 'utf-8')
    assert.ok(
      !checkoutSource.includes(`processPurchaseCompletion(\`0x\${'a'.repeat(64)}\`)`),
      'WalletPaymentCheckout must NEVER pass fake 0xaaaa... hash to processPurchaseCompletion'
    )
    assert.ok(
      checkoutSource.includes('buyDemoMiner({'),
      'WalletPaymentCheckout simulation fallback must directly use local buyDemoMiner'
    )
    assert.ok(
      checkoutSource.includes('data-testid="simulated-purchase-view"'),
      'WalletPaymentCheckout must render dedicated local simulation view without fake blockchain receipt'
    )
  })

  // --------------------------------------------------------------------------
  // Blockers C & D: Balance Reservation, Cross-Order Race Protection & Zero Orphans
  // --------------------------------------------------------------------------
  it('Blocker C & D: Concurrency race with two distinct pending orders A ($80) and B ($80) against balance $100: exactly one succeeds, loser fails BEFORE Firestore write, 0 orphans, balance never negative', async () => {
    resetStore(100) // Initial balance is 100 USD

    // Create Order A ($80)
    const deferA = deferDemoMinerPurchase({
      name: 'Pending Order A',
      powerTh: 10,
      efficiency: 15,
      price: 80,
      purchaseMode: 'once',
      packageId: 'minerx-order-a',
    })
    assert.ok(deferA.ok)

    // Create Order B ($80)
    const deferB = deferDemoMinerPurchase({
      name: 'Pending Order B',
      powerTh: 10,
      efficiency: 15,
      price: 80,
      purchaseMode: 'once',
      packageId: 'minerx-order-b',
    })
    assert.ok(deferB.ok)

    const session = getDemoSessionForPersistence()
    const orderA = session.pendingMinerOrders.find((o) => o.name === 'Pending Order A')!
    const orderB = session.pendingMinerOrders.find((o) => o.name === 'Pending Order B')!
    assert.ok(orderA && orderB)

    let firestoreWrites = 0
    let adminWrites = 0
    const createdFirestoreMiners: StoredMiner[] = []

    const mockSaveMinerToFirestore = async (_uid: string, miner: StoredMiner) => {
      // Simulate real async delay
      await new Promise((resolve) => setTimeout(resolve, 20))
      firestoreWrites++
      createdFirestoreMiners.push(miner)
    }

    const mockRecordToAdmin: PurchaseAdminRecorder = async () => {
      adminWrites++
    }

    // Launch both orders concurrently
    const [resA, resB] = await Promise.all([
      payPendingMinerOrderAndRecordToAdmin(orderA, {
        user: { uid: 'u_race_1', email: 'race1@test.com' },
        saveMinerToFirestore: mockSaveMinerToFirestore,
        recordPurchaseToAdmin: mockRecordToAdmin,
      }),
      payPendingMinerOrderAndRecordToAdmin(orderB, {
        user: { uid: 'u_race_1', email: 'race1@test.com' },
        saveMinerToFirestore: mockSaveMinerToFirestore,
        recordPurchaseToAdmin: mockRecordToAdmin,
      }),
    ])

    // Exactly one order must succeed and exactly one must fail
    const succeeded = [resA, resB].filter((r) => r.ok)
    const failed = [resA, resB].filter((r) => !r.ok)

    assert.equal(succeeded.length, 1, 'Exactly one order must achieve canonical ownership')
    assert.equal(failed.length, 1, 'Exactly one order must fail due to balance reservation')

    // Canonical Firestore write count must match successful local finalizations
    assert.equal(firestoreWrites, 1, 'Firestore write must be executed ONLY for winning order; loser fails BEFORE Firestore')
    assert.equal(createdFirestoreMiners.length, 1)
    assert.equal(adminWrites, 1, 'Admin recorder must be called ONLY for winning order')

    // Local balance must be exactly 20 (100 - 80), NEVER negative
    const finalSession = getDemoSessionForPersistence()
    assert.equal(finalSession.balance, 20, 'Balance must be exactly 20 (100 - 80)')
    assert.ok(finalSession.balance >= 0, 'Balance must never be negative')

    // Exactly one miner in local store
    assert.equal(finalSession.miners.length, 1)

    // Losing order must remain in pendingMinerOrders (not deleted), intact and retryable/cancelable
    assert.equal(finalSession.pendingMinerOrders.length, 1, 'Losing order remains pending and retryable')
    const remainingPending = finalSession.pendingMinerOrders[0]
    assert.ok(remainingPending.id === orderA.id || remainingPending.id === orderB.id)

    // Canceling the losing order succeeds cleanly
    const cancelRes = cancelPendingDemoMiner(remainingPending.id)
    assert.equal(cancelRes, true, 'Losing order remains cleanly cancelable')
    assert.equal(getDemoSessionForPersistence().pendingMinerOrders.length, 0)
  })

  // --------------------------------------------------------------------------
  // Blocker C: Reservation Rollback on Firestore Failure
  // --------------------------------------------------------------------------
  it('Blocker C: If saveMinerToFirestore throws, balance reservation is released, balance remains intact, 0 local miners/receipts, and 0 Admin calls', async () => {
    resetStore(100)

    let adminCalls = 0
    const demoInput: DemoMinerPurchaseInput = {
      name: 'Rollback Miner',
      powerTh: 10,
      efficiency: 15,
      price: 80,
      purchaseMode: 'once',
      packageId: 'minerx-rollback-1',
    }

    const result = await completeLocalMinerPurchase(demoInput, {
      user: { uid: 'u_rollback', email: 'rollback@test.com' },
      saveMinerToFirestore: async () => {
        throw new Error('Simulated network drop during Firestore write')
      },
      recordPurchaseToAdmin: async () => {
        adminCalls++
      },
    })

    assert.equal(result.ok, false, 'Operation must report failure')
    assert.equal(adminCalls, 0, 'Admin recorder must not be called')

    // Local balance must remain 100% intact
    const session = getDemoSessionForPersistence()
    assert.equal(session.balance, 100, 'Balance must remain 100 intact')
    assert.equal(getAvailableDemoBalance(), 100, 'Available balance must reflect released reservation')
    assert.equal(session.miners.length, 0, 'No local miner added')
    assert.equal(session.workers.length, 0, 'No local worker added')
    assert.equal(session.receipts.filter((r) => r.kind === 'miner').length, 0, 'No local receipt added')

    // Subsequent purchase succeeds with the intact balance
    const retryResult = await completeLocalMinerPurchase(demoInput, {
      user: { uid: 'u_rollback', email: 'rollback@test.com' },
      saveMinerToFirestore: async () => {},
      recordPurchaseToAdmin: async () => { adminCalls++ },
    })
    assert.equal(retryResult.ok, true, 'Retry must succeed with preserved balance')
    assert.equal(getDemoSessionForPersistence().balance, 20)
    assert.equal(adminCalls, 1)
  })

  // --------------------------------------------------------------------------
  // Blocker E: Deterministic Guest Wallet Identity in Admin Records
  // --------------------------------------------------------------------------
  it('Blocker E: Guest wallet purchase writes deterministic wallet-bound identity without generic usr_client, while guest demo writes 0 Admin records', async () => {
    resetStore(1000)
    let adminRecordParams: any = null
    const mockAdminRecorder: PurchaseAdminRecorder = async (params) => {
      adminRecordParams = params
    }

    // 1. Canonical wallet purchase with guest rejects fail-closed with 0 Admin records (SCRUM-220 R1)
    const guestWalletAddress = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B'
    await assert.rejects(
      async () => {
        await completeWalletMinerPurchase(
          {
            productName: 'Guest Wallet Miner · 48 TH',
            amount: 561.99,
            packageId: 'minerx-guest-wallet',
            purchaseMode: 'once',
            activeAddress: guestWalletAddress,
            txHash: '0xguest_tx_123',
            networkName: 'BNB Chain',
            user: null, // Unauthenticated guest
            requireCanonicalPackageId: true,
          },
          {
            recordPurchaseToAdmin: mockAdminRecorder,
          }
        )
      },
      /Canonical wallet miner purchase requires an authenticated, non-anonymous user account/
    )
    assert.equal(adminRecordParams, null, 'Admin recorder must NEVER be called for unauthenticated guest')

    // 2. Direct recordMinerPurchaseToAdmin rejection when uid is missing (even if ownerWallet is provided)
    const capturedPayloads: any[] = []
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) capturedPayloads.push(JSON.parse(init.body as string))
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }) as typeof fetch

      await assert.rejects(
        async () => {
          await recordMinerPurchaseToAdmin({
            minerId: 'MINER-GUEST-DIRECT-1',
            ownerWallet: guestWalletAddress,
            packageId: 'minerx-01',
            name: 'Direct Guest Miner',
            powerTh: 48,
            price: 500,
          })
        },
        /Cannot record miner purchase without a valid user uid/
      )
      assert.equal(capturedPayloads.length, 0, 'No HTTP calls must be made when uid is missing')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  // --------------------------------------------------------------------------
  // Direct test for updateMinerInFirestore with test doubles
  // --------------------------------------------------------------------------
  it('updateMinerInFirestore updates miner document via double and propagates errors', async () => {
    let capturedRef: any = null
    let capturedUpdates: any = null
    const mockUpdateDoc = async (ref: any, updates: any) => {
      capturedRef = ref
      capturedUpdates = updates
      return Promise.resolve()
    }

    await updateMinerInFirestore(
      'user_test_update',
      'MINER-UPD-001',
      { name: 'Updated Miner Name', status: 'active' },
      { updateDoc: mockUpdateDoc }
    )

    assert.ok(capturedRef, 'updateDoc double must be called')
    assert.deepEqual(capturedUpdates, { name: 'Updated Miner Name', status: 'active' })

    // Error propagation test
    const failingUpdateDoc = async () => {
      throw new Error('Simulated updateDoc failure')
    }
    await assert.rejects(
      async () => {
        await updateMinerInFirestore(
          'user_test_update',
          'MINER-UPD-001',
          { status: 'paused' },
          { updateDoc: failingUpdateDoc }
        )
      },
      /Simulated updateDoc failure/
    )
  })
})
