import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  restoreDemoSession,
  getDemoSessionForPersistence,
  deferDemoMinerPurchase,
  type DemoMinerPurchaseInput,
} from '../src/demoStore.ts'
import {
  completeLocalMinerPurchase,
  payPendingMinerOrderAndRecordToAdmin,
  sanitizeErrorMessage,
} from '../src/minerPurchaseFlow.ts'
import {
  db,
  isProductionFirestore,
  assertNotProductionFirestore,
  savePurchasedMiner,
  recordMinerPurchaseToAdmin,
  type StoredMiner,
} from '../src/firebase.ts'

function resetStore(balance = 1000) {
  restoreDemoSession({
    balance,
    presaleTokens: 0,
    maintenanceCredit: 0,
    miners: [],
    workers: [],
    workerActivationMode: 'automatic',
    receipts: [],
    pendingMinerOrders: [],
    lastDailyRewardAt: null,
  })
}

describe('SCRUM-245: Local Balance Production Guard & Zero Detail Leakage', () => {
  let originalProjectId: string | undefined

  beforeEach(() => {
    resetStore(1000)
    originalProjectId = (db as any)?.app?.options?.projectId
  })

  afterEach(() => {
    if ((db as any)?.app?.options) {
      ;(db as any).app.options.projectId = originalProjectId
    }
  })

  // =========================================================================
  // Group 1: Local Balance Purchase Clean Success (Zero Prod Guard Triggers)
  // =========================================================================
  describe('Group 1: Local Balance Purchase Clean Success', () => {
    it('1.1 Authenticated local balance purchase completes without triggering production Firestore guard', async () => {
      // Simulate production environment
      ;(db as any).app.options.projectId = 'salad-miners'
      assert.equal(isProductionFirestore(), true, 'isProductionFirestore must report true')

      const demoInput: DemoMinerPurchaseInput = {
        name: 'Local Demo Antminer',
        powerTh: 20,
        efficiency: 15,
        price: 150,
        purchaseMode: 'once',
        packageId: 'minerx-01',
      }

      const result = await completeLocalMinerPurchase(demoInput, {
        user: { uid: 'u_auth_prod_test', email: 'test@salad.local' },
        saveMinerToFirestore: savePurchasedMiner,
        recordPurchaseToAdmin: recordMinerPurchaseToAdmin,
      })

      assert.equal(result.ok, true, 'Purchase must succeed locally')
      assert.ok(result.miner, 'Miner must be created')
      assert.equal(result.miner?.name, 'Local Demo Antminer')
      assert.equal(result.miner?.packageId, 'minerx-01')
      assert.ok(result.receipt, 'Receipt must be generated')
      assert.equal(result.receipt?.kind, 'miner')
      assert.equal(result.receipt?.balanceAfter, 850, 'Balance must be decremented by purchase price')

      // Verify demoStore state
      const session = getDemoSessionForPersistence()
      assert.equal(session.balance, 850)
      assert.equal(session.miners.length, 1)
      assert.equal(session.receipts.length, 1)
    })

    it('1.2 Paying pending local order with local balance succeeds without triggering production guard', async () => {
      // Create pending order
      const deferRes = deferDemoMinerPurchase({
        name: 'Pending Local Rig',
        powerTh: 30,
        efficiency: 15,
        price: 200,
        purchaseMode: 'once',
        packageId: 'minerx-02',
      })
      assert.equal(deferRes.ok, true)

      const sessionBefore = getDemoSessionForPersistence()
      assert.equal(sessionBefore.pendingMinerOrders.length, 1)
      const order = sessionBefore.pendingMinerOrders[0]

      // Simulate production environment
      ;(db as any).app.options.projectId = 'salad-miners'
      assert.equal(isProductionFirestore(), true)

      const result = await payPendingMinerOrderAndRecordToAdmin(order, {
        user: { uid: 'u_pending_prod_test', email: 'pending@salad.local' },
        saveMinerToFirestore: savePurchasedMiner,
        recordPurchaseToAdmin: recordMinerPurchaseToAdmin,
      })

      assert.equal(result.ok, true, 'Pending payment must succeed locally')
      assert.ok(result.receipt, 'Receipt must be generated')
      assert.equal(result.receipt?.balanceAfter, 800)

      const sessionAfter = getDemoSessionForPersistence()
      assert.equal(sessionAfter.pendingMinerOrders.length, 0, 'Pending order must be cleared')
      assert.equal(sessionAfter.miners.length, 1, 'Miner must be added to farm')
      assert.equal(sessionAfter.balance, 800)
    })

    it('1.3 Adapter requirement check fails closed if saveMinerToFirestore is omitted for authenticated user', async () => {
      const demoInput: DemoMinerPurchaseInput = {
        name: 'Missing Adapter Miner',
        powerTh: 10,
        efficiency: 15,
        price: 100,
        purchaseMode: 'once',
        packageId: 'minerx-01',
      }

      const result = await completeLocalMinerPurchase(demoInput, {
        user: { uid: 'u_no_adapter', email: 'noadapter@test.com' },
      })

      assert.equal(result.ok, false)
      assert.match(result.message || '', /saveMinerToFirestore adapter is required/)
      assert.equal(getDemoSessionForPersistence().balance, 1000, 'Balance must remain untouched')
    })

    it('1.4 Anonymous user fails closed for canonical local miner purchase', async () => {
      const demoInput: DemoMinerPurchaseInput = {
        name: 'Anon Miner',
        powerTh: 10,
        efficiency: 15,
        price: 100,
        purchaseMode: 'once',
        packageId: 'minerx-01',
      }

      const result = await completeLocalMinerPurchase(demoInput, {
        user: { uid: 'u_anon', isAnonymous: true },
        saveMinerToFirestore: savePurchasedMiner,
      })

      assert.equal(result.ok, false)
      assert.match(result.message || '', /authenticated, non-anonymous user account/)
      assert.equal(getDemoSessionForPersistence().balance, 1000)
    })
  })

  // =========================================================================
  // Group 2: Production Firestore Guard Remains Intact for Real Operations
  // =========================================================================
  describe('Group 2: Production Firestore Guard Invariance', () => {
    it('2.1 assertNotProductionFirestore strictly blocks writes targeting salad-miners', () => {
      assert.throws(
        () => {
          assertNotProductionFirestore({
            firestore: { app: { options: { projectId: 'salad-miners' } } },
          })
        },
        /FATAL: Write operation attempted against production Firestore database "salad-miners"./
      )

      assert.equal(
        isProductionFirestore({
          firestore: { app: { options: { projectId: 'salad-miners' } } },
        }),
        true
      )

      assert.equal(
        isProductionFirestore({
          firestore: { app: { options: { projectId: 'test-mock-db' } } },
        }),
        false
      )
    })

    it('2.2 savePurchasedMiner fails closed on production Firestore for real canonical purchases', async () => {
      ;(db as any).app.options.projectId = 'salad-miners'

      const realMiner: StoredMiner = {
        id: 'real-miner-001',
        uid: 'u_real_buyer',
        packageId: 'minerx-01',
        name: 'Real ASIC S19 Pro',
        powerTh: 110,
        efficiency: 29.5,
        price: 2500,
        currency: 'USDT',
        status: 'active',
        txHash: '0xabc123def45678901234567890abcdef12345678',
        network: 'BNB Chain',
        createdAt: null,
      }

      await assert.rejects(
        async () => {
          await savePurchasedMiner('u_real_buyer', realMiner)
        },
        /FATAL: Write operation attempted against production Firestore database "salad-miners"./
      )
    })

    it('2.3 recordMinerPurchaseToAdmin fails closed on production Firestore for real canonical purchases', async () => {
      ;(db as any).app.options.projectId = 'salad-miners'

      await assert.rejects(
        async () => {
          await recordMinerPurchaseToAdmin({
            minerId: 'real-miner-001',
            uid: 'u_real_buyer',
            email: 'real@buyer.com',
            name: 'Real ASIC S19 Pro',
            powerTh: 110,
            price: 2500,
            txHash: '0xabc123def45678901234567890abcdef12345678',
            network: 'BNB Chain',
            packageId: 'minerx-01',
          })
        },
        /FATAL: Write operation attempted against production Firestore database "salad-miners"./
      )
    })
  })

  // =========================================================================
  // Group 3: Zero Error Detail / Project ID Leakage to UI
  // =========================================================================
  describe('Group 3: Error Sanitization and Zero Infrastructure Leakage', () => {
    it('3.1 Injected persistence error containing salad-miners is sanitized in completeLocalMinerPurchase', async () => {
      const demoInput: DemoMinerPurchaseInput = {
        name: 'Injected Error Miner',
        powerTh: 10,
        efficiency: 15,
        price: 100,
        purchaseMode: 'once',
        packageId: 'minerx-01',
      }

      const result = await completeLocalMinerPurchase(demoInput, {
        user: { uid: 'u_sanitize_test', email: 'test@leak.local' },
        saveMinerToFirestore: async () => {
          throw new Error('FATAL: Write operation attempted against production Firestore database "salad-miners". [projectId: salad-miners]')
        },
      })

      assert.equal(result.ok, false)
      assert.ok(result.message)
      assert.doesNotMatch(result.message, /salad-miners/i, 'Must not leak salad-miners')
      assert.doesNotMatch(result.message, /fatal/i, 'Must not leak FATAL')
      assert.doesNotMatch(result.message, /projectid/i, 'Must not leak projectId')
      assert.equal(result.message, 'Error al guardar el minero en Firestore')
      assert.equal(getDemoSessionForPersistence().balance, 1000, 'Balance must be rolled back on persistence error')
    })

    it('3.2 Injected error in payPendingMinerOrderAndRecordToAdmin is sanitized', async () => {
      deferDemoMinerPurchase({
        name: 'Pending Leak Test Miner',
        powerTh: 10,
        efficiency: 15,
        price: 100,
        purchaseMode: 'once',
        packageId: 'minerx-01',
      })
      const order = getDemoSessionForPersistence().pendingMinerOrders[0]
      assert.ok(order)

      const result = await payPendingMinerOrderAndRecordToAdmin(order, {
        user: { uid: 'u_pending_leak', email: 'leak@pending.local' },
        saveMinerToFirestore: async () => {
          throw new Error('Connection failed to projectId salad-miners cluster')
        },
      })

      assert.equal(result.ok, false)
      assert.ok(result.message)
      assert.doesNotMatch(result.message, /salad-miners/i, 'Must not leak salad-miners')
      assert.doesNotMatch(result.message, /projectid/i, 'Must not leak projectId')
      assert.equal(result.message, 'Error al persistir el minero en Firestore')
    })

    it('3.3 sanitizeErrorMessage helper sanitizes sensitive details and preserves benign messages', () => {
      // Sensitive strings must be filtered
      assert.equal(
        sanitizeErrorMessage('FATAL: Write operation attempted against production Firestore database "salad-miners".'),
        'No se pudo completar la operación local en este momento.'
      )
      assert.equal(
        sanitizeErrorMessage('Error connecting to projectId salad-miners', 'Custom Fallback'),
        'Custom Fallback'
      )
      assert.equal(
        sanitizeErrorMessage('Write operation attempted on remote node', 'Fallback'),
        'Fallback'
      )

      // Benign user messages must be preserved verbatim
      assert.equal(
        sanitizeErrorMessage('Saldo insuficiente para completar la compra.'),
        'Saldo insuficiente para completar la compra.'
      )
      assert.equal(
        sanitizeErrorMessage('No se encontró ese pedido local pendiente.'),
        'No se encontró ese pedido local pendiente.'
      )
      assert.equal(
        sanitizeErrorMessage('Se requiere una cuenta registrada para guardar pedidos pendientes.'),
        'Se requiere una cuenta registrada para guardar pedidos pendientes.'
      )

      // Null / undefined inputs safely return fallback
      assert.equal(sanitizeErrorMessage(null), 'No se pudo completar la operación local en este momento.')
      assert.equal(sanitizeErrorMessage(undefined, 'Fallback'), 'Fallback')
    })
  })
})
