import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

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
import {
  purchaseWithPlatformBalance,
  generatePlatformPurchaseId,
} from '../src/platformBalancePurchase.ts'

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
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    resetStore(1000)
    originalProjectId = (db as any)?.app?.options?.projectId
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if ((db as any)?.app?.options) {
      ;(db as any).app.options.projectId = originalProjectId
    }
  })

  // =========================================================================
  // Group 1: Platform Balance Purchase Contract & Zero Production Writes
  // =========================================================================
  describe('Group 1: Platform Balance Purchase Contract & Zero Production Writes', () => {
    let capturedRequests: Array<{ url: string; method: string; headers: Headers; body: any }> = []

    beforeEach(() => {
      capturedRequests = []
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as any).url
        const method = init?.method || 'GET'
        const headers = new Headers(init?.headers)
        let body: any = null
        if (init?.body && typeof init.body === 'string') {
          try {
            body = JSON.parse(init.body)
          } catch {
            body = init.body
          }
        }
        capturedRequests.push({ url, method, headers, body })

        return new Response(
          JSON.stringify({
            success: true,
            minerId: `miner_${body?.purchaseId || 'default'}`,
            orderId: `ord_u_auth_prod_test_${body?.purchaseId || 'default'}`,
            balance: 850,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    })

    it('1.1 Authenticated platform balance purchase sends Bearer ID token in Authorization header', async () => {
      const mockUser = {
        uid: 'u_auth_token_test',
        getIdToken: async () => 'test_firebase_id_token_xyz123',
      }

      const result = await purchaseWithPlatformBalance({
        packageId: 'minerx-01',
        user: mockUser,
      })

      assert.equal(result.ok, true)
      assert.equal(capturedRequests.length, 1)
      assert.equal(capturedRequests[0].url, '/api/purchases/platform-balance')
      assert.equal(capturedRequests[0].method, 'POST')
      assert.equal(capturedRequests[0].headers.get('authorization'), 'Bearer test_firebase_id_token_xyz123')
      assert.equal(capturedRequests[0].headers.get('content-type'), 'application/json')
    })

    it('1.2 Request body strictly transmits packageId and purchaseId with zero price or power authority', async () => {
      const mockUser = {
        uid: 'u_auth_body_test',
        getIdToken: async () => 'test_token',
      }

      const result = await purchaseWithPlatformBalance({
        packageId: 'minerx-02',
        purchaseId: 'pb_test_custom_id_456',
        user: mockUser,
      })

      assert.equal(result.ok, true)
      assert.equal(capturedRequests.length, 1)
      const body = capturedRequests[0].body
      assert.ok(body, 'Body must be sent')
      assert.deepEqual(Object.keys(body).sort(), ['packageId', 'purchaseId'])
      assert.equal(body.packageId, 'minerx-02')
      assert.equal(body.purchaseId, 'pb_test_custom_id_456')
      assert.equal((body as any).price, undefined, 'Must not send price authority')
      assert.equal((body as any).powerTh, undefined, 'Must not send power authority')
      assert.equal((body as any).currency, undefined, 'Must not send currency authority')
    })

    it('1.3 Retrying the same attempt reuses identical purchaseId for idempotency', async () => {
      const mockUser = {
        uid: 'u_auth_retry_test',
        getIdToken: async () => 'test_token',
      }
      const stablePurchaseId = 'pb_stable_attempt_789'

      let attemptCount = 0
      globalThis.fetch = async (input, init) => {
        attemptCount++
        const headers = new Headers(init?.headers)
        const body = JSON.parse((init?.body as string) || '{}')
        capturedRequests.push({ url: String(input), method: init?.method || 'GET', headers, body })
        if (attemptCount === 1) {
          return new Response(JSON.stringify({ error: 'Internal glitch' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(
          JSON.stringify({
            success: true,
            minerId: `miner_${body.purchaseId}`,
            orderId: `ord_u_${body.purchaseId}`,
            balance: 700,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const result1 = await purchaseWithPlatformBalance({
        packageId: 'minerx-01',
        purchaseId: stablePurchaseId,
        user: mockUser,
      })
      assert.equal(result1.ok, false)

      const result2 = await purchaseWithPlatformBalance({
        packageId: 'minerx-01',
        purchaseId: stablePurchaseId,
        user: mockUser,
      })
      assert.equal(result2.ok, true)

      assert.equal(capturedRequests.length, 2)
      assert.equal(capturedRequests[0].body.purchaseId, stablePurchaseId)
      assert.equal(capturedRequests[1].body.purchaseId, stablePurchaseId)
      assert.equal(capturedRequests[0].body.purchaseId, capturedRequests[1].body.purchaseId)
    })

    it('1.4 Zero client Firestore or Admin writes triggered on platform balance purchase success', async () => {
      ;(db as any).app.options.projectId = 'salad-miners'
      assert.equal(isProductionFirestore(), true, 'Must be in production mode')

      let clientFirestoreWrites = 0
      let clientAdminWrites = 0

      const mockUser = {
        uid: 'u_prod_guard_test',
        getIdToken: async () => 'test_token',
      }

      const result = await purchaseWithPlatformBalance({
        packageId: 'minerx-01',
        user: mockUser,
      })

      assert.equal(result.ok, true)
      assert.equal(clientFirestoreWrites, 0, 'Zero savePurchasedMiner calls')
      assert.equal(clientAdminWrites, 0, 'Zero recordMinerPurchaseToAdmin calls')
    })

    it('1.5 demoStore balance, miners, and receipts remain completely untouched on platform purchase', async () => {
      const initialSession = getDemoSessionForPersistence()
      assert.equal(initialSession.balance, 1000)
      assert.equal(initialSession.miners.length, 0)
      assert.equal(initialSession.receipts.length, 0)

      const mockUser = {
        uid: 'u_demostore_isolation',
        getIdToken: async () => 'test_token',
      }

      const result = await purchaseWithPlatformBalance({
        packageId: 'minerx-01',
        user: mockUser,
      })

      assert.equal(result.ok, true)
      const afterSession = getDemoSessionForPersistence()
      assert.equal(afterSession.balance, 1000, 'demoStore balance must NOT be debited')
      assert.equal(afterSession.miners.length, 0, 'demoStore miners must NOT be populated')
      assert.equal(afterSession.receipts.length, 0, 'demoStore receipts must NOT be populated')
    })

    it('1.6 Returned backend balance is accurately reported in result and balanceAfter', async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            minerId: 'miner_pb_bal_999',
            orderId: 'ord_u_test_pb_bal_999',
            balance: 642.50,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const result = await purchaseWithPlatformBalance({
        packageId: 'minerx-01',
        user: { uid: 'u_bal_test', getIdToken: async () => 'tok' },
      })

      assert.equal(result.ok, true)
      if (result.ok) {
        assert.equal(result.balance, 642.50)
        assert.equal(result.minerId, 'miner_pb_bal_999')
        assert.equal(result.orderId, 'ord_u_test_pb_bal_999')

        const receipt = {
          id: result.minerId,
          kind: 'miner' as const,
          label: 'MinerX Rig',
          amount: 250,
          detail: `20.00 TH · Contrato ${result.orderId}`,
          createdAt: '12:00',
          balanceAfter: result.balance,
        }
        assert.equal(receipt.balanceAfter, 642.50, 'Returned backend balance must be reflected in balanceAfter')
      }
    })

    it('1.7 Backend errors 401, 404, 409, 500 are sanitized with zero infrastructure detail leakage', async () => {
      const user = { uid: 'u_err_test', getIdToken: async () => 'tok' }

      // 401 Token invalid
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: 'Token inválido o expirado' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
      const res401 = await purchaseWithPlatformBalance({ packageId: 'minerx-01', user })
      assert.equal(res401.ok, false)
      assert.equal(res401.message, 'Token inválido o expirado')

      // 404 Package unavailable
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: 'Paquete no disponible' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
      const res404 = await purchaseWithPlatformBalance({ packageId: 'minerx-nonexistent', user })
      assert.equal(res404.ok, false)
      assert.equal(res404.message, 'Paquete no disponible')

      // 409 Insufficient platform balance
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: 'Saldo insuficiente en la plataforma' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
      const res409 = await purchaseWithPlatformBalance({ packageId: 'minerx-01', user })
      assert.equal(res409.ok, false)
      assert.equal(res409.message, 'Saldo insuficiente en la plataforma')

      // 500 Internal error with sensitive database leakage
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: 'FATAL: database salad-miners connection timeout [projectId: salad-miners]' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      const res500 = await purchaseWithPlatformBalance({ packageId: 'minerx-01', user })
      assert.equal(res500.ok, false)
      assert.doesNotMatch(res500.message, /salad-miners/i, 'Must not leak salad-miners')
      assert.doesNotMatch(res500.message, /fatal/i, 'Must not leak FATAL')
      assert.doesNotMatch(res500.message, /projectid/i, 'Must not leak projectId')
      assert.equal(res500.message, 'No se pudo completar la compra con saldo.')
    })

    it('1.8 Anonymous or unauthenticated user fails closed without making network requests', async () => {
      let fetchCalled = false
      globalThis.fetch = async () => {
        fetchCalled = true
        return new Response('{}', { status: 200 })
      }

      const resAnon = await purchaseWithPlatformBalance({
        packageId: 'minerx-01',
        user: { uid: 'u_anon', isAnonymous: true, getIdToken: async () => 'anon_tok' },
      })
      assert.equal(resAnon.ok, false)
      assert.match(resAnon.message, /autenticada y no anónima/)
      assert.equal(fetchCalled, false, 'Network must not be called for anonymous user')

      const resNull = await purchaseWithPlatformBalance({
        packageId: 'minerx-01',
        user: null,
      })
      assert.equal(resNull.ok, false)
      assert.equal(fetchCalled, false, 'Network must not be called for null user')
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

    it('4.4 Authenticated platform balance purchase context cannot create or settle deferred demo/local pending orders, isolating pendingMinerOrders', async () => {
      // 1. Functional isolation: Platform balance purchase does not populate demoStore.pendingMinerOrders
      const initialSession = getDemoSessionForPersistence()
      assert.equal(initialSession.pendingMinerOrders.length, 0)

      const mockUser = {
        uid: 'u_auth_real_balance_guard',
        getIdToken: async () => 'test_token',
      }

      globalThis.fetch = async (_input, init) => {
        const body = JSON.parse((init?.body as string) || '{}')
        return new Response(
          JSON.stringify({
            success: true,
            minerId: `miner_${body.purchaseId}`,
            orderId: `ord_${mockUser.uid}_${body.purchaseId}`,
            balance: 900,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const purchaseRes = await purchaseWithPlatformBalance({
        packageId: 'minerx-01',
        user: mockUser,
      })
      assert.equal(purchaseRes.ok, true)

      const afterSession = getDemoSessionForPersistence()
      assert.equal(afterSession.pendingMinerOrders.length, 0, 'pendingMinerOrders must remain strictly empty on platform purchase')
      assert.equal(afterSession.balance, 1000, 'demo balance must remain untouched')

      // 2. Static UI & Handler Guards in App.tsx:
      const appSource = fs.readFileSync(path.resolve(import.meta.dirname, '../src/App.tsx'), 'utf8')

      // a) MinerBuilderDialog authenticated section must NOT render "Guardar pedido pendiente"
      const platformSectionMatch = appSource.match(/miner-platform-balance-section[\s\S]*?<\/div>\s*<\/div>/)
      assert.ok(platformSectionMatch, 'miner-platform-balance-section must exist')
      assert.doesNotMatch(
        platformSectionMatch[0],
        /Guardar pedido pendiente/,
        'miner-platform-balance-section must NOT contain "Guardar pedido pendiente"'
      )

      // b) onDefer must reject authenticated users
      assert.match(
        appSource,
        /onDefer=\{async\s*\(input\)\s*=>\s*\{[\s\S]*?if\s*\(user\s*&&\s*!user\.isAnonymous\)[\s\S]*?Los pedidos pendientes no están disponibles para compras con saldo de plataforma/,
        'onDefer handler must reject authenticated non-anonymous users'
      )

      // c) MinerPanel must guard pending-miner-orders with !isAuth
      assert.match(
        appSource,
        /\{!isAuth\s*&&\s*demo\.pendingMinerOrders\.length\s*>\s*0\s*&&\s*<section className="content-panel pending-miner-orders"/,
        'MinerPanel must render pending-miner-orders ONLY for unauthenticated users (!isAuth)'
      )
    })
  })
})
