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
  sanitizeFirestoreErrorMessage,
  isProductionFirestoreTarget,
  isProductionFirestore,
} from '../src/minerPurchaseFlow.ts'
import {
  db,
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
  describe('Group 1: Local Balance Purchase Clean Success & Zero Production Writes', () => {
    it('1.1 Authenticated local balance purchase completes without triggering production Firestore guard', async () => {
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

      const session = getDemoSessionForPersistence()
      assert.equal(session.balance, 850)
      assert.equal(session.miners.length, 1)
      assert.equal(session.receipts.length, 1)
    })

    it('1.2 Zero writes attempted against Firestore during local balance purchase in production mode', async () => {
      ;(db as any).app.options.projectId = 'salad-miners'
      let writeInvocations = 0
      let adminInvocations = 0

      const demoInput: DemoMinerPurchaseInput = {
        name: 'Guarded Local Miner',
        powerTh: 25,
        efficiency: 15,
        price: 200,
        purchaseMode: 'once',
        packageId: 'minerx-01',
      }

      const result = await completeLocalMinerPurchase(demoInput, {
        user: { uid: 'u_zero_write_test', email: 'guard@salad.local' },
        saveMinerToFirestore: async () => {
          writeInvocations++
          throw new Error('FATAL: Write operation attempted against production Firestore database "salad-miners".')
        },
        recordPurchaseToAdmin: async () => {
          adminInvocations++
        },
      })

      assert.equal(result.ok, true, 'Purchase must succeed in local demo state')
      assert.equal(writeInvocations, 0, 'saveMinerToFirestore must NOT be called in production mode')
      assert.equal(adminInvocations, 0, 'recordPurchaseToAdmin must NOT be called in production mode')
      assert.equal(getDemoSessionForPersistence().balance, 800)
      assert.equal(getDemoSessionForPersistence().miners.length, 1)
    })

    it('1.3 Paying pending local order with local balance succeeds without triggering production guard', async () => {
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

      ;(db as any).app.options.projectId = 'salad-miners'
      assert.equal(isProductionFirestore(), true)

      let pendingWrites = 0
      const result = await payPendingMinerOrderAndRecordToAdmin(order, {
        user: { uid: 'u_pending_prod_test', email: 'pending@salad.local' },
        saveMinerToFirestore: async () => {
          pendingWrites++
          throw new Error('FATAL: Write operation attempted against production Firestore database "salad-miners".')
        },
        recordPurchaseToAdmin: recordMinerPurchaseToAdmin,
      })

      assert.equal(result.ok, true, 'Pending payment must succeed locally')
      assert.equal(pendingWrites, 0, 'Zero writes must be attempted against production Firestore')
      assert.ok(result.receipt, 'Receipt must be generated')
      assert.equal(result.receipt?.balanceAfter, 800)

      const sessionAfter = getDemoSessionForPersistence()
      assert.equal(sessionAfter.pendingMinerOrders.length, 0, 'Pending order must be cleared')
      assert.equal(sessionAfter.miners.length, 1, 'Miner must be added to farm')
      assert.equal(sessionAfter.balance, 800)
    })

    it('1.4 Adapter requirement check fails closed if saveMinerToFirestore is omitted for authenticated user', async () => {
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

    it('1.5 Anonymous user fails closed for canonical local miner purchase', async () => {
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
  describe('Group 2: Production Firestore Guard Integrity & Detection', () => {
    it('2.1 assertNotProductionFirestore strictly blocks writes targeting salad-miners across docRef, db, and env', () => {
      // 1. Target via docRef
      assert.throws(
        () => {
          assertNotProductionFirestore({
            firestore: { app: { options: { projectId: 'salad-miners' } } },
          })
        },
        /FATAL: Write operation attempted against production Firestore database "salad-miners"./
      )

      // 2. Target via db.app.options.projectId
      const savedProjectId = (db as any)?.app?.options?.projectId
      try {
        ;(db as any).app.options.projectId = 'salad-miners'
        assert.throws(
          () => {
            assertNotProductionFirestore()
          },
          /FATAL: Write operation attempted against production Firestore database "salad-miners"./
        )
      } finally {
        ;(db as any).app.options.projectId = savedProjectId
      }

      // 3. Target via process.env.VITE_FIREBASE_PROJECT_ID when db options is absent
      try {
        ;(db as any).app.options.projectId = undefined
        const prevEnv = process.env.VITE_FIREBASE_PROJECT_ID
        process.env.VITE_FIREBASE_PROJECT_ID = 'salad-miners'
        try {
          assert.throws(
            () => {
              assertNotProductionFirestore()
            },
            /FATAL: Write operation attempted against production Firestore database "salad-miners"./
          )
        } finally {
          process.env.VITE_FIREBASE_PROJECT_ID = prevEnv
        }
      } finally {
        ;(db as any).app.options.projectId = savedProjectId
      }
    })

    it('2.2 assertNotProductionFirestore does not throw for non-production targets', () => {
      assert.doesNotThrow(() => {
        assertNotProductionFirestore({
          firestore: { app: { options: { projectId: 'test-mock-db' } } },
        })
      })
    })

    it('2.3 isProductionFirestoreTarget accurately detects salad-miners and distinguishes non-prod', () => {
      assert.equal(
        isProductionFirestoreTarget({
          firestore: { app: { options: { projectId: 'salad-miners' } } },
        }),
        true
      )
      assert.equal(
        isProductionFirestoreTarget({
          firestore: { app: { options: { projectId: 'test-mock-db' } } },
        }),
        false
      )
      assert.equal(
        isProductionFirestore({
          firestore: { app: { options: { projectId: 'salad-miners' } } },
        }),
        true,
        'isProductionFirestore alias must equal isProductionFirestoreTarget'
      )
    })

    it('2.4 savePurchasedMiner fails closed on production Firestore for real canonical purchases', async () => {
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

    it('2.5 recordMinerPurchaseToAdmin fails closed on production Firestore for real canonical purchases', async () => {
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

      // Non-prod target so options.saveMinerToFirestore is called and throws
      ;(db as any).app.options.projectId = 'test-mock-db'

      const origError = console.error
      console.error = () => {}
      try {
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
      } finally {
        console.error = origError
      }
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

      ;(db as any).app.options.projectId = 'test-mock-db'

      const origError = console.error
      console.error = () => {}
      try {
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
      } finally {
        console.error = origError
      }
    })

    it('3.3 sanitizeFirestoreErrorMessage and sanitizeErrorMessage sanitize sensitive details and preserve benign messages', () => {
      // Sensitive strings must be filtered
      assert.equal(
        sanitizeFirestoreErrorMessage('FATAL: Write operation attempted against production Firestore database "salad-miners".'),
        'No se pudo completar la operación local en este momento.'
      )
      assert.equal(
        sanitizeErrorMessage('Error connecting to projectId salad-miners', 'Custom Fallback'),
        'Custom Fallback'
      )
      assert.equal(
        sanitizeFirestoreErrorMessage('Write operation attempted on remote node', 'Fallback'),
        'Fallback'
      )

      // Benign user messages must be preserved verbatim
      assert.equal(
        sanitizeFirestoreErrorMessage('Saldo insuficiente para completar la compra.'),
        'Saldo insuficiente para completar la compra.'
      )
      assert.equal(
        sanitizeErrorMessage('No se encontró ese pedido local pendiente.'),
        'No se encontró ese pedido local pendiente.'
      )
      assert.equal(
        sanitizeFirestoreErrorMessage('Se requiere una cuenta registrada para guardar pedidos pendientes.'),
        'Se requiere una cuenta registrada para guardar pedidos pendientes.'
      )

      // Null / undefined inputs safely return fallback
      assert.equal(sanitizeFirestoreErrorMessage(null), 'No se pudo completar la operación local en este momento.')
      assert.equal(sanitizeErrorMessage(undefined, 'Fallback'), 'Fallback')
    })
  })

  // =========================================================================
  // Group 4: Forensic Non-Regression & Scope Boundaries
  // =========================================================================
  describe('Group 4: Non-Regression & Scope Isolation', () => {
    it('4.1 Non-production test doubles in scrum218 continue to be invoked in completeLocalMinerPurchase', async () => {
      ;(db as any).app.options.projectId = 'test-hermetic-mock'
      let mockSaveInvoked = false
      let mockAdminInvoked = false

      const demoInput: DemoMinerPurchaseInput = {
        name: 'Scrum218 Regression Test Miner',
        powerTh: 15,
        efficiency: 15,
        price: 120,
        purchaseMode: 'once',
        packageId: 'minerx-01',
      }

      const result = await completeLocalMinerPurchase(demoInput, {
        user: { uid: 'u_scrum218_test', email: 'scrum218@test.local' },
        saveMinerToFirestore: async () => {
          mockSaveInvoked = true
        },
        recordPurchaseToAdmin: async () => {
          mockAdminInvoked = true
        },
      })

      assert.equal(result.ok, true, 'Purchase should succeed')
      assert.equal(mockSaveInvoked, true, 'In non-production, saveMinerToFirestore mock MUST be invoked')
      assert.equal(mockAdminInvoked, true, 'In non-production, recordPurchaseToAdmin mock MUST be invoked')
      assert.equal(getDemoSessionForPersistence().balance, 880)
    })

    it('4.2 Non-production test doubles in scrum218 continue to be invoked in payPendingMinerOrderAndRecordToAdmin', async () => {
      ;(db as any).app.options.projectId = 'test-hermetic-mock'

      deferDemoMinerPurchase({
        name: 'Pending Scrum218 Rig',
        powerTh: 18,
        efficiency: 15,
        price: 150,
        purchaseMode: 'once',
        packageId: 'minerx-02',
      })
      const order = getDemoSessionForPersistence().pendingMinerOrders[0]
      assert.ok(order)

      let mockSavePendingInvoked = false
      let mockAdminPendingInvoked = false

      const result = await payPendingMinerOrderAndRecordToAdmin(order, {
        user: { uid: 'u_scrum218_pending', email: 'pending218@test.local' },
        saveMinerToFirestore: async () => {
          mockSavePendingInvoked = true
        },
        recordPurchaseToAdmin: async () => {
          mockAdminPendingInvoked = true
        },
      })

      assert.equal(result.ok, true, 'Pending order payment must succeed')
      assert.equal(mockSavePendingInvoked, true, 'In non-production, saveMinerToFirestore MUST be invoked')
      assert.equal(mockAdminPendingInvoked, true, 'In non-production, recordPurchaseToAdmin MUST be invoked')
      assert.equal(getDemoSessionForPersistence().balance, 850)
    })

    it('4.3 Non-sensitive persistence errors in non-prod are preserved without masking legitimate failures', async () => {
      ;(db as any).app.options.projectId = 'test-hermetic-mock'

      const demoInput: DemoMinerPurchaseInput = {
        name: 'Failure Preserved Miner',
        powerTh: 10,
        efficiency: 15,
        price: 100,
        purchaseMode: 'once',
        packageId: 'minerx-01',
      }

      const origError = console.error
      console.error = () => {}
      try {
        const result = await completeLocalMinerPurchase(demoInput, {
          user: { uid: 'u_legit_fail', email: 'fail@test.local' },
          saveMinerToFirestore: async () => {
            throw new Error('Permisos insuficientes en colección local simulada')
          },
        })

        assert.equal(result.ok, false)
        assert.equal(result.message, 'Permisos insuficientes en colección local simulada', 'Benign error message must be preserved')
        assert.equal(getDemoSessionForPersistence().balance, 1000, 'Balance must be restored')
      } finally {
        console.error = origError
      }
    })
  })
})
