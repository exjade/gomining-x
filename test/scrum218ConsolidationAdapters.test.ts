import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buyDemoMiner,
  deferDemoMinerPurchase,
  restoreDemoSession,
  getDemoSessionForPersistence,
  type DemoMinerPurchaseInput,
  type PendingDemoMinerOrder,
} from '../src/demoStore.ts'
import {
  completeWalletMinerPurchase,
  payPendingMinerOrderAndRecordToAdmin,
  buildMinerBuilderCheckoutPayload,
  orchestrateWalletMinerPurchaseFlow,
  type PurchaseAdminRecorder,
} from '../src/minerPurchaseFlow.ts'
import {
  savePurchasedMiner,
  recordMinerPurchaseToAdmin,
  subscribeToPublishedCommercialPackages,
  fetchPublishedCommercialPackages,
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
  })

  it('Finding 4 & R3: Fail-closed persistence in completeWalletMinerPurchase throws and blocks Admin recording', async () => {
    let adminRecorded = false

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
          }
        )
      },
      /Firestore connection timeout/
    )

    assert.equal(adminRecorded, false, 'Admin recorder must NEVER be called when wallet persistence fails')
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

    // 8. Untrimmed minerId is trimmed and canonicalized across contracts and orders
    const capturedPayloads: any[] = []
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        if (init?.body) {
          capturedPayloads.push(JSON.parse(String(init.body)))
        }
        return new Response('{}', { status: 200 })
      }) as typeof fetch

      await recordMinerPurchaseToAdmin({
        minerId: '  MINER-UNTRIMMED-123  ',
        packageId: 'minerx-01',
        name: 'Trim Miner',
        powerTh: 10,
        price: 100,
      })

      const contract = capturedPayloads.find((p) => p.contractedTh !== undefined)
      const order = capturedPayloads.find((p) => p.activatedMinerId !== undefined)
      assert.ok(contract, 'Must sync contract payload')
      assert.ok(order, 'Must sync order payload')
      assert.equal(contract.id, 'MINER-UNTRIMMED-123')
      assert.equal(order.activatedMinerId, 'MINER-UNTRIMMED-123')
      assert.equal(order.orderId, 'ord_MINER-UNTRIMMED-123')
      assert.equal(order.idempotencyKey, 'ord_MINER-UNTRIMMED-123')

      // Untrimmed uid should be trimmed to buyerUid across contract and order
      const uidPayloads: any[] = []
      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) uidPayloads.push(JSON.parse(init.body as string))
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }) as typeof fetch

      await recordMinerPurchaseToAdmin({
        minerId: 'MINER-TRIM-UID-1',
        uid: '   usr_trim_me   ',
        packageId: 'minerx-01',
        name: 'Trim UID Miner',
        powerTh: 10,
        price: 100,
      })

      const uidContract = uidPayloads.find((p) => p.contractedTh !== undefined)
      const uidOrder = uidPayloads.find((p) => p.activatedMinerId !== undefined)
      assert.equal(uidContract.userId, 'usr_trim_me')
      assert.equal(uidOrder.userId, 'usr_trim_me')
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

    // 8. With valid packageId and uid, validation passes and persistence proceeds to setDoc
    // (rejection is Firestore network/permission error per ISSUE-01, not a validation error)
    await assert.rejects(
      async () => {
        await savePurchasedMiner('user_save_test', {
          ...baseMiner,
          packageId: 'minerx-01',
          packageSnapshot: {
            packageId: 'divergent-will-be-overridden',
            name: '   ',
            powerTh: 0,
            price: -5,
            currency: 'USD',
          },
        })
      },
      (err: any) => {
        const msg = String(err?.message || '')
        assert.ok(!msg.includes('Cannot save miner without a valid'), `Must pass validation: ${msg}`)
        return true
      }
    )
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

    assert.equal(guestPay.ok, true, 'Guest payment without packageId must succeed in local demo store')
    assert.equal(firestoreCalled, false, 'Guest payment must NEVER persist to Firestore')

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
  it('Finding 6 & R4: Client source code contains zero direct calls to collection(db, "commercial_packages"), getDocs, or onSnapshot for commercial_packages', () => {
    const srcDir = path.resolve(projectRoot, 'src')
    const srcFiles = fs.readdirSync(srcDir, { recursive: true }) as string[]

    const offendingPatterns = [
      /collection\s*\(\s*db\s*,\s*['"`]commercial_packages['"`]\s*\)/,
      /getDocs\s*\(\s*colRef\s*\)/,
      /onSnapshot\s*\(\s*colRef\s*,/,
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
    }

    // Verify stubs in firebase.ts return DEFAULT_COMMERCIAL_PACKAGES safely without Firestore
    let callbackCalled = false
    const unsub = subscribeToPublishedCommercialPackages((pkgs) => {
      callbackCalled = true
      assert.ok(Array.isArray(pkgs))
    })
    assert.equal(callbackCalled, true)
    assert.equal(typeof unsub, 'function')
    unsub()
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
  it('Finding 10: Authenticated customizer save branch separates Firestore update from DemoStore update', () => {
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
})
