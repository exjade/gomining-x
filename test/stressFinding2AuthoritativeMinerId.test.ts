import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  restoreDemoSession,
  getDemoSessionForPersistence,
  deferDemoMinerPurchase,
  cancelPendingDemoMiner,
  type DemoMinerPurchaseInput,
  type PendingDemoMinerOrder,
} from '../src/demoStore.ts'
import {
  payPendingMinerOrderAndRecordToAdmin,
  type PurchaseAdminRecorder,
} from '../src/minerPurchaseFlow.ts'

function resetStore(balance = 1000000) {
  restoreDemoSession({
    balance,
    maintenanceCredit: 0,
    miners: [],
    workers: [],
    workerActivationMode: 'automatic',
    pendingMinerOrders: [],
    subscription: null,
    receipts: [],
    presaleTokens: 0,
  })
}

describe('EMPIRICAL CHALLENGER: Stress & Adversarial Suite for Finding 2 (Authoritative minerId alignment)', () => {

  it('Stress 1: 100 sequential pending order settlements maintain 100% authoritative minerId alignment with zero ID collisions', async () => {
    resetStore(500000)

    const orderCount = 100
    const deferredOrders: PendingDemoMinerOrder[] = []

    // 1. Defer 100 pending orders with varied canonical packageIds and parameters
    for (let i = 0; i < orderCount; i++) {
      const packageId = i % 3 === 0 ? 'minerx-01'
        : i % 3 === 1 ? 'minerx-02'
        : 'minerx-custom'

      const input: DemoMinerPurchaseInput = {
        name: `Sequential Miner #${i}`,
        powerTh: 1.0 + (i * 0.5),
        efficiency: 15,
        price: 10 + i,
        purchaseMode: 'once',
        packageId,
        ownerWallet: `0xWALLET_${i.toString(16).padStart(4, '0')}`,
      }

      const deferResult = deferDemoMinerPurchase(input)
      assert.equal(deferResult.ok, true, `Deferral #${i} must succeed`)
    }

    const sessionAfterDefer = getDemoSessionForPersistence()
    assert.equal(sessionAfterDefer.pendingMinerOrders.length, orderCount)

    // Collect pending orders in FIFO order
    const pendingList = [...sessionAfterDefer.pendingMinerOrders].reverse()

    const recordedAdminCalls: any[] = []
    const generatedMinerIds = new Set<string>()

    // 2. Settle all 100 orders sequentially
    for (let i = 0; i < pendingList.length; i++) {
      const pendingOrder = pendingList[i]
      let adminRecord: any = null

      const recorderSpy: PurchaseAdminRecorder = async (params) => {
        adminRecord = params
        recordedAdminCalls.push(params)
      }

      const payResult = await payPendingMinerOrderAndRecordToAdmin(pendingOrder, {
        user: { uid: `user_${i}`, email: `user_${i}@example.com` },
        saveMinerToFirestore: async () => {},
        recordPurchaseToAdmin: recorderSpy,
      })

      // Assertion Set A: PayResult integrity
      assert.equal(payResult.ok, true, `Payment of order ${pendingOrder.id} must succeed`)
      assert.ok(payResult.receipt, `Receipt must exist for order ${pendingOrder.id}`)
      assert.ok(payResult.miner, `Created DemoMiner must be returned in payResult`)
      assert.ok(payResult.minerId, `Authoritative minerId must be returned in payResult`)
      assert.equal(payResult.minerId, payResult.miner?.id, `payResult.minerId must equal payResult.miner.id`)

      // Assertion Set B: Authoritative MINER- format & absence of synthesized IDs
      const minerId = payResult.minerId!
      assert.ok(minerId.startsWith('MINER-'), `minerId "${minerId}" must have MINER- prefix`)
      assert.ok(!minerId.startsWith('miner_'), `minerId "${minerId}" must NOT start with miner_`)
      assert.ok(!minerId.startsWith('miner_LOCAL'), `minerId "${minerId}" must NOT start with miner_LOCAL`)
      assert.ok(!minerId.includes(payResult.receipt!.id), `minerId "${minerId}" must not synthesize receipt id "${payResult.receipt!.id}"`)

      // Assertion Set C: Strict Alignment with Admin Recorder
      assert.ok(adminRecord, `Admin recorder must be called for order ${pendingOrder.id}`)
      assert.equal(adminRecord.minerId, minerId, `Admin recorder minerId must strictly match payResult.minerId`)
      assert.equal(adminRecord.minerId, payResult.miner!.id, `Admin recorder minerId must strictly match actual DemoMiner.id`)

      // Assertion Set D: Canonical packageId preservation
      assert.equal(adminRecord.packageId, pendingOrder.packageId, `Admin recorder must receive exact canonical packageId`)
      assert.equal(adminRecord.name, pendingOrder.name)
      assert.equal(adminRecord.powerTh, pendingOrder.powerTh)
      assert.equal(adminRecord.price, pendingOrder.price)
      assert.equal(adminRecord.network, 'LOCAL_BALANCE')
      assert.equal(adminRecord.ownerWallet, pendingOrder.ownerWallet || 'INTERNAL')

      // Assertion Set E: ID uniqueness (zero collisions across rapid generation)
      assert.ok(!generatedMinerIds.has(minerId), `Generated minerId "${minerId}" must be unique across all 100 orders`)
      generatedMinerIds.add(minerId)
    }

    // 3. Post-execution store verification
    const finalSession = getDemoSessionForPersistence()
    assert.equal(finalSession.pendingMinerOrders.length, 0, 'All pending orders must be cleared')
    assert.equal(finalSession.miners.length, orderCount, 'All 100 miners must exist in demoStore')
    assert.equal(generatedMinerIds.size, orderCount, 'Exactly 100 unique miner IDs must have been created')

    // Verify 100% of stored miners match their corresponding admin records
    for (let i = 0; i < orderCount; i++) {
      const storedMiner = finalSession.miners[i]
      assert.ok(storedMiner.id.startsWith('MINER-'), `Stored miner ${storedMiner.id} must have MINER- prefix`)
      assert.ok(!storedMiner.id.startsWith('miner_'), `Stored miner ${storedMiner.id} must NOT start with miner_`)

      const matchingAdminRecord = recordedAdminCalls.find((r) => r.minerId === storedMiner.id)
      assert.ok(matchingAdminRecord, `Stored miner ${storedMiner.id} must have a matching admin record`)
      assert.equal(matchingAdminRecord.minerId, storedMiner.id)
    }
  })

  it('Stress 2: 50 concurrent pending order settlements maintain 100% authoritative minerId alignment with zero crosstalk', async () => {
    resetStore(200000)

    const concurrencyCount = 50
    for (let i = 0; i < concurrencyCount; i++) {
      const packageId = `minerx-pkg-${i}`
      deferDemoMinerPurchase({
        name: `Concurrent Order #${i}`,
        powerTh: 5 + i,
        efficiency: 15,
        price: 50 + (i * 2),
        purchaseMode: 'once',
        packageId,
        ownerWallet: `0xCONCURRENT_${i}`,
      })
    }

    const sessionBefore = getDemoSessionForPersistence()
    assert.equal(sessionBefore.pendingMinerOrders.length, concurrencyCount)
    const ordersToPay = [...sessionBefore.pendingMinerOrders]

    const recordedAdminMap = new Map<string, any>()
    const payPromises = ordersToPay.map(async (order) => {
      return payPendingMinerOrderAndRecordToAdmin(order, {
        user: { uid: `user_c_${order.id}`, email: `c@example.com` },
        saveMinerToFirestore: async () => {},
        recordPurchaseToAdmin: async (params) => {
          recordedAdminMap.set(params.minerId, params)
        },
      })
    })

    const results = await Promise.all(payPromises)

    // Check all succeeded
    assert.equal(results.length, concurrencyCount)
    const returnedMinerIds = new Set<string>()

    for (let i = 0; i < results.length; i++) {
      const res = results[i]
      const order = ordersToPay[i]

      assert.equal(res.ok, true, `Concurrent payment for order ${order.id} must succeed`)
      assert.ok(res.miner, `Created DemoMiner must be defined`)
      assert.ok(res.minerId, `payResult.minerId must be defined`)
      assert.equal(res.minerId, res.miner?.id, `payResult.minerId must equal actual DemoMiner.id`)

      const minerId = res.minerId!
      assert.ok(minerId.startsWith('MINER-'), `minerId "${minerId}" must have MINER- prefix`)
      assert.ok(!minerId.startsWith('miner_'), `minerId "${minerId}" must NOT have miner_ prefix`)

      // Check admin recorded call
      const adminParams = recordedAdminMap.get(minerId)
      assert.ok(adminParams, `Admin record must exist for minerId "${minerId}"`)
      assert.equal(adminParams.minerId, minerId, `adminParams.minerId must strictly match actual DemoMiner.id`)
      assert.equal(adminParams.packageId, order.packageId, `adminParams.packageId must match order packageId`)
      assert.equal(adminParams.name, order.name)

      assert.ok(!returnedMinerIds.has(minerId), `minerId "${minerId}" must be unique under concurrency`)
      returnedMinerIds.add(minerId)
    }

    // Verify demoStore state
    const sessionAfter = getDemoSessionForPersistence()
    assert.equal(sessionAfter.pendingMinerOrders.length, 0, 'Pending orders must be 0 after all concurrent payments')
    assert.equal(sessionAfter.miners.length, concurrencyCount, 'Exactly 50 miners must be created in store')
    assert.equal(returnedMinerIds.size, concurrencyCount, 'Exactly 50 unique miner IDs must be generated')
  })

  it('Stress 3: Double-spend / replay attack prevention under concurrent settlement of the exact same order', async () => {
    resetStore(10000)

    deferDemoMinerPurchase({
      name: 'Single Target Miner',
      powerTh: 10,
      efficiency: 15,
      price: 250,
      purchaseMode: 'once',
      packageId: 'minerx-single-target',
    })

    const session = getDemoSessionForPersistence()
    assert.equal(session.pendingMinerOrders.length, 1)
    const targetOrder = session.pendingMinerOrders[0]

    // Launch 30 concurrent settlement attempts on the EXACT SAME order
    const adminCalls: any[] = []
    const settleAttempts = Array.from({ length: 30 }, () =>
      payPendingMinerOrderAndRecordToAdmin(targetOrder, {
        user: { uid: 'user_target', email: 'target@test.com' },
        saveMinerToFirestore: async () => {},
        recordPurchaseToAdmin: async (params) => {
          adminCalls.push(params)
        },
      })
    )

    const settleResults = await Promise.all(settleAttempts)

    const successes = settleResults.filter((r) => r.ok === true)
    const failures = settleResults.filter((r) => r.ok === false)

    // Exactly 1 must succeed
    assert.equal(successes.length, 1, 'Exactly one concurrent settlement must succeed')
    assert.equal(failures.length, 29, 'Exactly 29 concurrent settlements must be rejected')

    // All 29 failures must give "No se encontró ese pedido local pendiente."
    for (const fail of failures) {
      assert.equal(fail.message, 'No se encontró ese pedido local pendiente.')
    }

    // Exactly 1 admin record must be created
    assert.equal(adminCalls.length, 1, 'Admin recorder must be invoked exactly once')

    const successResult = successes[0]
    const createdMinerId = successResult.minerId!
    assert.ok(createdMinerId.startsWith('MINER-'), 'Created miner ID must start with MINER-')
    assert.equal(adminCalls[0].minerId, createdMinerId, 'Admin recorder minerId must match single created miner ID')
    assert.equal(adminCalls[0].packageId, 'minerx-single-target')

    // Verify balance was debited only once ($10000 - $250 = $9750)
    const finalSession = getDemoSessionForPersistence()
    assert.equal(finalSession.balance, 9750, 'Balance must be debited exactly once')
    assert.equal(finalSession.miners.length, 1, 'Exactly one miner must exist in store')
    assert.equal(finalSession.pendingMinerOrders.length, 0, 'Target pending order must be removed')
  })

  it('Stress 4: Balance boundary exhaustion and recovery cycle with authoritative minerId alignment', async () => {
    resetStore(250) // Balance is 250

    // Defer 4 orders of 100 each (total 400 needed)
    for (let i = 1; i <= 4; i++) {
      deferDemoMinerPurchase({
        name: `Exhaustion Miner #${i}`,
        powerTh: 2,
        efficiency: 15,
        price: 100,
        purchaseMode: 'once',
        packageId: `pkg-exhaust-${i}`,
      })
    }

    const session = getDemoSessionForPersistence()
    assert.equal(session.pendingMinerOrders.length, 4)
    const [order4, order3, order2, order1] = session.pendingMinerOrders // LIFO order in state

    const adminRecords: any[] = []
    const spy = async (p: any) => { adminRecords.push(p) }
    const authOptions = {
      user: { uid: 'user_exhaust', email: 'exhaust@example.com' },
      saveMinerToFirestore: async () => {},
      recordPurchaseToAdmin: spy,
    }

    // Pay order 1 ($100, balance was 250 -> becomes 150)
    const res1 = await payPendingMinerOrderAndRecordToAdmin(order1, authOptions)
    assert.equal(res1.ok, true)
    assert.equal(adminRecords.length, 1)
    assert.equal(adminRecords[0].minerId, res1.minerId)
    assert.ok(res1.minerId?.startsWith('MINER-'))

    // Pay order 2 ($100, balance was 150 -> becomes 50)
    const res2 = await payPendingMinerOrderAndRecordToAdmin(order2, authOptions)
    assert.equal(res2.ok, true)
    assert.equal(adminRecords.length, 2)
    assert.equal(adminRecords[1].minerId, res2.minerId)
    assert.ok(res2.minerId?.startsWith('MINER-'))

    // Pay order 3 ($100, balance is 50 -> must fail with insufficient balance)
    const res3 = await payPendingMinerOrderAndRecordToAdmin(order3, authOptions)
    assert.equal(res3.ok, false)
    assert.equal(res3.required, 100)
    assert.equal(res3.available, 50)
    // CRITICAL INVARIANT: Admin recorder must NOT have been called for failed order 3
    assert.equal(adminRecords.length, 2, 'Admin recorder must NOT be called when balance is insufficient')

    // Pay order 4 ($100 -> fails)
    const res4 = await payPendingMinerOrderAndRecordToAdmin(order4, authOptions)
    assert.equal(res4.ok, false)
    assert.equal(adminRecords.length, 2, 'Admin recorder must NOT be called for order 4')

    // Store state: 2 miners created, 2 orders still pending
    let midSession = getDemoSessionForPersistence()
    assert.equal(midSession.miners.length, 2)
    assert.equal(midSession.pendingMinerOrders.length, 2)

    // Deposit funds to recover
    restoreDemoSession({
      ...midSession,
      balance: midSession.balance + 500, // now 550
    })

    // Now retry paying order 3 -> must succeed with genuine MINER- id and record to admin
    const res3Retry = await payPendingMinerOrderAndRecordToAdmin(order3, authOptions)
    assert.equal(res3Retry.ok, true)
    assert.equal(adminRecords.length, 3)
    assert.equal(adminRecords[2].minerId, res3Retry.minerId)
    assert.ok(res3Retry.minerId?.startsWith('MINER-'))
    assert.equal(adminRecords[2].packageId, 'pkg-exhaust-3')

    const finalSession = getDemoSessionForPersistence()
    assert.equal(finalSession.miners.length, 3)
    assert.equal(finalSession.pendingMinerOrders.length, 1)
  })

  it('Stress 5: Admin recorder error/rejection modes preserve authoritative miner in store and return clean result', async () => {
    resetStore(1000)

    // Mode A: Async Promise rejection (network error)
    deferDemoMinerPurchase({
      name: 'Async Throw Miner',
      powerTh: 2,
      efficiency: 15,
      price: 50,
      purchaseMode: 'once',
      packageId: 'minerx-async-throw',
    })

    const orderAsync = getDemoSessionForPersistence().pendingMinerOrders[0]
    const resAsync = await payPendingMinerOrderAndRecordToAdmin(orderAsync, {
      recordPurchaseToAdmin: async () => {
        throw new Error('EHOSTUNREACH: Simulated cloud connection drop')
      },
    })

    assert.equal(resAsync.ok, true, 'Payment must succeed locally even when admin recorder rejects asynchronously')
    assert.ok(resAsync.miner, 'Created miner must be returned')
    assert.ok(resAsync.minerId, 'minerId must be returned')
    assert.equal(resAsync.minerId, resAsync.miner?.id)
    assert.ok(resAsync.minerId?.startsWith('MINER-'))
    assert.ok(!resAsync.minerId?.startsWith('miner_'))

    // Verify miner exists in store
    let session = getDemoSessionForPersistence()
    assert.equal(session.miners[0].id, resAsync.minerId)
    assert.equal(session.miners[0].packageId, 'minerx-async-throw')

    // Mode B: Non-Error throw (e.g. string or object error)
    deferDemoMinerPurchase({
      name: 'Custom Obj Throw Miner',
      powerTh: 3,
      efficiency: 15,
      price: 60,
      purchaseMode: 'once',
      packageId: 'minerx-obj-throw',
    })

    const orderObj = getDemoSessionForPersistence().pendingMinerOrders[0]
    const resObj = await payPendingMinerOrderAndRecordToAdmin(orderObj, {
      recordPurchaseToAdmin: async () => {
        throw { code: 'PERMISSION_DENIED', status: 403 }
      },
    })

    assert.equal(resObj.ok, true, 'Payment must succeed even when recorder throws non-Error object')
    assert.equal(resObj.minerId, resObj.miner?.id)
    assert.ok(resObj.minerId?.startsWith('MINER-'))

    // Mode C: Omitted options (options is undefined)
    deferDemoMinerPurchase({
      name: 'Omitted Options Miner',
      powerTh: 4,
      efficiency: 15,
      price: 70,
      purchaseMode: 'once',
      packageId: 'minerx-no-options',
    })

    const orderNoOpt = getDemoSessionForPersistence().pendingMinerOrders[0]
    const resNoOpt = await payPendingMinerOrderAndRecordToAdmin(orderNoOpt)

    assert.equal(resNoOpt.ok, true, 'Payment must succeed when options is completely omitted')
    assert.equal(resNoOpt.minerId, resNoOpt.miner?.id)
    assert.ok(resNoOpt.minerId?.startsWith('MINER-'))

    // Mode D: Options with user but no recorder
    deferDemoMinerPurchase({
      name: 'User Only Miner',
      powerTh: 5,
      efficiency: 15,
      price: 80,
      purchaseMode: 'once',
      packageId: 'minerx-user-only',
    })

    const orderUserOnly = getDemoSessionForPersistence().pendingMinerOrders[0]
    const resUserOnly = await payPendingMinerOrderAndRecordToAdmin(orderUserOnly, {
      user: { uid: 'u123', email: 'test@example.com' },
      saveMinerToFirestore: async () => {},
    })

    assert.equal(resUserOnly.ok, true, 'Payment must succeed when recordPurchaseToAdmin is undefined')
    assert.equal(resUserOnly.minerId, resUserOnly.miner?.id)
    assert.ok(resUserOnly.minerId?.startsWith('MINER-'))
  })

  it('Stress 6: Missing, cancelled, and corrupted order boundary conditions', async () => {
    resetStore(1000)

    let recordedCalls = 0
    const spy = async () => { recordedCalls++ }

    // Case 1: Non-existent order ID
    const ghostOrder: PendingDemoMinerOrder = {
      id: 'ORDER-GHOST-999',
      name: 'Ghost Miner',
      powerTh: 1,
      efficiency: 15,
      price: 50,
      createdAt: '2026-11-09',
      purchaseMode: 'once',
    }
    const ghostRes = await payPendingMinerOrderAndRecordToAdmin(ghostOrder, { recordPurchaseToAdmin: spy })
    assert.equal(ghostRes.ok, false)
    assert.equal(ghostRes.message, 'No se encontró ese pedido local pendiente.')
    assert.equal(recordedCalls, 0, 'Admin recorder must never be called for non-existent order')

    // Case 2: Order cancelled before payment
    deferDemoMinerPurchase({
      name: 'Cancelled Order Miner',
      powerTh: 2,
      efficiency: 15,
      price: 100,
      purchaseMode: 'once',
    })

    const createdOrder = getDemoSessionForPersistence().pendingMinerOrders[0]
    cancelPendingDemoMiner(createdOrder.id)

    const cancelRes = await payPendingMinerOrderAndRecordToAdmin(createdOrder, { recordPurchaseToAdmin: spy })
    assert.equal(cancelRes.ok, false)
    assert.equal(cancelRes.message, 'No se encontró ese pedido local pendiente.')
    assert.equal(recordedCalls, 0, 'Admin recorder must never be called for cancelled order')

    // Store miners must be completely empty
    const session = getDemoSessionForPersistence()
    assert.equal(session.miners.length, 0)
    assert.equal(session.pendingMinerOrders.length, 0)
  })

  it('Stress 7: Comprehensive packageId normalization matrix with authoritative minerId', async () => {
    resetStore(10000)

    const testCases: { inputPkg: any; expectedAdminPkg: string | undefined }[] = [
      { inputPkg: 'minerx-01', expectedAdminPkg: 'minerx-01' },
      { inputPkg: 'minerx-02', expectedAdminPkg: 'minerx-02' },
      { inputPkg: 'minerx-03', expectedAdminPkg: 'minerx-03' },
      { inputPkg: 'minerx-custom', expectedAdminPkg: 'minerx-custom' },
      { inputPkg: undefined, expectedAdminPkg: undefined },
      { inputPkg: '', expectedAdminPkg: undefined },
      { inputPkg: '   ', expectedAdminPkg: undefined },
      { inputPkg: '\t\n ', expectedAdminPkg: undefined },
      { inputPkg: '  minerx-padded  ', expectedAdminPkg: 'minerx-padded' },
      { inputPkg: 42 as any, expectedAdminPkg: undefined },
      { inputPkg: null as any, expectedAdminPkg: undefined },
      { inputPkg: {} as any, expectedAdminPkg: undefined },
    ]

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i]
      deferDemoMinerPurchase({
        name: `Pkg Test #${i}`,
        powerTh: 1,
        efficiency: 15,
        price: 10,
        purchaseMode: 'once',
        packageId: tc.inputPkg,
      })

      const order = getDemoSessionForPersistence().pendingMinerOrders[0]
      let adminParams: any = null
      const isAuth = Boolean(tc.expectedAdminPkg)

      const res = await payPendingMinerOrderAndRecordToAdmin(order, {
        user: isAuth ? { uid: `u_${i}`, email: `u_${i}@test.com` } : undefined,
        saveMinerToFirestore: isAuth ? async () => {} : undefined,
        recordPurchaseToAdmin: async (p) => { adminParams = p },
      })

      assert.equal(res.ok, true, `Case #${i} payment must succeed`)
      if (isAuth) {
        assert.ok(adminParams, `Case #${i} admin recorder must be invoked`)

        // Strict minerId alignment
        const actualMinerId = res.minerId!
        assert.ok(actualMinerId.startsWith('MINER-'), `Case #${i} minerId must have MINER- prefix`)
        assert.ok(!actualMinerId.startsWith('miner_'), `Case #${i} minerId must NOT have miner_ prefix`)
        assert.equal(adminParams.minerId, actualMinerId, `Case #${i} adminParams.minerId must strictly match actual minerId`)
        assert.equal(adminParams.minerId, res.miner?.id, `Case #${i} adminParams.minerId must match res.miner.id`)

        // PackageId normalization
        assert.equal(
          adminParams.packageId,
          tc.expectedAdminPkg,
          `Case #${i} packageId "${tc.inputPkg}" must normalize to "${tc.expectedAdminPkg}"`
        )
      } else {
        assert.equal(adminParams, null, `Case #${i} guest order without canonical packageId must NEVER call Admin recorder`)
      }
    }
  })

  it('Stress 8: Negative Oracle: strict assertion that synthesized receipt-based miner IDs are NEVER generated or recorded', async () => {
    resetStore(5000)

    for (let i = 0; i < 20; i++) {
      deferDemoMinerPurchase({
        name: `Negative Oracle Miner #${i}`,
        powerTh: 1.5,
        efficiency: 15,
        price: 25,
        purchaseMode: 'once',
        packageId: `pkg-neg-${i}`,
      })
    }

    const orders = [...getDemoSessionForPersistence().pendingMinerOrders]
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i]
      let recorderParams: any = null
      const res = await payPendingMinerOrderAndRecordToAdmin(order, {
        user: { uid: `u_neg_${i}`, email: 'neg@test.com' },
        saveMinerToFirestore: async () => {},
        recordPurchaseToAdmin: async (p) => { recorderParams = p },
      })

      assert.equal(res.ok, true)
      const receiptId = res.receipt!.id
      const actualMinerId = res.minerId!

      // NEGATIVE ORACLE 1: minerId must NOT be `miner_${receipt.id}`
      assert.notEqual(actualMinerId, `miner_${receiptId}`, 'minerId must NEVER be synthesized as miner_${receipt.id}')
      assert.notEqual(recorderParams.minerId, `miner_${receiptId}`, 'recorderParams.minerId must NEVER be miner_${receipt.id}')

      // NEGATIVE ORACLE 2: minerId must NOT be `miner_${order.id}`
      assert.notEqual(actualMinerId, `miner_${order.id}`, 'minerId must NEVER be synthesized as miner_${order.id}')
      assert.notEqual(recorderParams.minerId, `miner_${order.id}`, 'recorderParams.minerId must NEVER be miner_${order.id}')

      // NEGATIVE ORACLE 3: minerId must NOT contain 'miner_LOCAL'
      assert.ok(!actualMinerId.includes('miner_LOCAL'), 'minerId must not contain miner_LOCAL')
      assert.ok(!recorderParams.minerId.includes('miner_LOCAL'), 'recorderParams.minerId must not contain miner_LOCAL')

      // NEGATIVE ORACLE 4: minerId must NOT start with 'miner_' (lower case)
      assert.ok(!actualMinerId.startsWith('miner_'), 'minerId must not start with miner_')
      assert.ok(!recorderParams.minerId.startsWith('miner_'), 'recorderParams.minerId must not start with miner_')

      // POSITIVE ORACLE: minerId must start with 'MINER-' (upper case authoritative)
      assert.ok(actualMinerId.startsWith('MINER-'), 'minerId must start with MINER-')
      assert.ok(recorderParams.minerId.startsWith('MINER-'), 'recorderParams.minerId must start with MINER-')
      assert.equal(actualMinerId, recorderParams.minerId, 'actualMinerId must strictly equal recorderParams.minerId')
    }
  })

  it('Stress 9: Farm worker linkage consistency: worker.minerId === actualDemoMiner.id === recorderParams.minerId', async () => {
    resetStore(2000)

    deferDemoMinerPurchase({
      name: 'Farm Worker Linked Miner',
      powerTh: 8.5,
      efficiency: 14,
      price: 120,
      purchaseMode: 'once',
      packageId: 'minerx-farm-check',
      ownerWallet: '0xFARM_WALLET',
    })

    const order = getDemoSessionForPersistence().pendingMinerOrders[0]
    let adminRecord: any = null

    const res = await payPendingMinerOrderAndRecordToAdmin(order, {
      user: { uid: 'u_farm', email: 'farm@test.com' },
      saveMinerToFirestore: async () => {},
      recordPurchaseToAdmin: async (p) => { adminRecord = p },
    })

    assert.equal(res.ok, true)
    const session = getDemoSessionForPersistence()
    assert.equal(session.miners.length, 1)
    assert.equal(session.workers.length, 1)

    const storedMiner = session.miners[0]
    const storedWorker = session.workers[0]

    // Verify 3-way identity linkage
    assert.equal(storedMiner.id, res.minerId, 'Stored miner id must equal payResult.minerId')
    assert.equal(storedWorker.minerId, storedMiner.id, 'Worker minerId must equal stored miner.id')
    assert.equal(storedWorker.id, storedMiner.workerId, 'Worker id must equal miner.workerId')
    assert.equal(storedWorker.id, `worker-${storedMiner.id.toLowerCase()}`, 'Worker id must match worker-{minerId.toLowerCase()}')
    assert.equal(adminRecord.minerId, storedMiner.id, 'Admin record minerId must equal stored miner.id')
    assert.equal(adminRecord.minerId, storedWorker.minerId, 'Admin record minerId must equal worker.minerId')
  })
})
