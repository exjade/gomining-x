import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(projectRoot, relPath), 'utf8')
}

describe('SCRUM-370 (PG-06) Task 3: Client Real-Time Payment History', () => {
  it('1. Creates src/components/payments/clientPaymentHistoryService.ts and ClientPaymentHistory.tsx with 0 direct Firestore writes and 0 CONFIRMED', () => {
    const servicePath = path.resolve(projectRoot, 'src/components/payments/clientPaymentHistoryService.ts')
    const componentPath = path.resolve(projectRoot, 'src/components/payments/ClientPaymentHistory.tsx')

    assert.equal(fs.existsSync(servicePath), true, 'clientPaymentHistoryService.ts must exist')
    assert.equal(fs.existsSync(componentPath), true, 'ClientPaymentHistory.tsx must exist')

    const paymentsDir = path.resolve(projectRoot, 'src/components/payments')
    const files = fs.readdirSync(paymentsDir).filter((f) => /\.(ts|tsx)$/.test(f))
    assert.ok(files.length >= 2)

    const forbiddenTokens = ['setDoc(', 'updateDoc(', 'addDoc(', 'deleteDoc(', "'CONFIRMED'", '"CONFIRMED"']
    for (const file of files) {
      const content = fs.readFileSync(path.join(paymentsDir, file), 'utf8')
      for (const token of forbiddenTokens) {
        assert.equal(
          content.includes(token),
          false,
          `src/components/payments/${file} must have 0 occurrences of ${token}`,
        )
      }
    }
  })

  it('2. Subscribes strictly with where("userId", "==", uid) on admin_orders without composite orderBy and sorts createdAt DESC in memory', async () => {
    const svc = await import('../src/components/payments/clientPaymentHistoryService.ts')
    const serviceSrc = readText('src/components/payments/clientPaymentHistoryService.ts')

    assert.ok(serviceSrc.includes("collection(db, 'admin_orders')") || serviceSrc.includes('ADMIN_ORDERS_COLLECTION'))
    assert.ok(serviceSrc.includes("where('userId', '==',"))
    assert.equal(serviceSrc.includes('orderBy('), false, 'Must NOT use composite orderBy() on admin_orders')

    const capturedWhere: unknown[] = []
    let capturedCollection = ''
    let snapshotCb: ((snap: any) => void) | null = null
    let unsubscribed = false

    const unsubscribe = svc.subscribeToClientOrders(
      'uid_client_370',
      (orders) => {
        receivedOrders = orders
      },
      undefined,
      {
        db: {} as any,
        collection: (_db: any, name: string) => {
          capturedCollection = name
          return { name } as any
        },
        where: (...args: unknown[]) => {
          capturedWhere.push(args)
          return { type: 'where', args } as any
        },
        query: (col: any, ...constraints: any[]) => ({ col, constraints }) as any,
        onSnapshot: (_q: any, onNext: (snap: any) => void) => {
          snapshotCb = onNext
          return () => {
            unsubscribed = true
          }
        },
      },
    )

    let receivedOrders: any[] = []
    assert.equal(capturedCollection, 'admin_orders')
    assert.deepEqual(capturedWhere, [['userId', '==', 'uid_client_370']])
    assert.ok(snapshotCb, 'onSnapshot listener must be attached')

    snapshotCb!({
      docs: [
        {
          id: 'ord_older',
          data: () => ({
            userId: 'uid_client_370',
            status: 'SETTLED',
            packageName: 'Minero 1',
            amountUsd: 561.99,
            powerTh: 48,
            confirmations: 15,
            requiredConfirmations: 15,
            createdAt: '2026-11-20T10:00:00.000Z',
          }),
        },
        {
          id: 'ord_newest',
          data: () => ({
            userId: 'uid_client_370',
            status: 'PROCESSING',
            packageName: 'Minero 2',
            amountUsd: 744.99,
            powerTh: 64,
            confirmations: 4,
            requiredConfirmations: 15,
            createdAt: '2026-11-22T12:00:00.000Z',
          }),
        },
        {
          id: 'ord_middle',
          data: () => ({
            userId: 'uid_client_370',
            // intentionally omit status & confirmations to verify safe defaults
            packageName: 'Suscripción Pro',
            productType: 'subscription',
            amountUsd: 49.99,
            createdAt: '2026-11-21T08:00:00.000Z',
          }),
        },
      ],
    })

    assert.deepEqual(
      receivedOrders.map((o) => o.orderId),
      ['ord_newest', 'ord_middle', 'ord_older'],
      'Orders must be sorted by createdAt DESC in memory',
    )
    assert.equal(receivedOrders[1].status, 'OPEN', 'Missing status must default to OPEN, never SETTLED')
    assert.equal(receivedOrders[1].confirmations, 0, 'Missing confirmations must default to 0')

    unsubscribe()
    assert.equal(unsubscribed, true)
  })

  it('3. Restricts cancellation strictly to OPEN / AWAITING without txHash', async () => {
    const svc = await import('../src/components/payments/clientPaymentHistoryService.ts')

    assert.equal(svc.canCancelClientOrder({ status: 'OPEN', txHash: null } as any), true)
    assert.equal(svc.canCancelClientOrder({ status: 'AWAITING', txHash: '' } as any), true)
    assert.equal(svc.canCancelClientOrder({ status: 'AWAITING', txHash: '0xabc123' } as any), false)
    assert.equal(svc.canCancelClientOrder({ status: 'OPEN', txHash: '0xabc123' } as any), false)

    for (const status of ['PROCESSING', 'SETTLED', 'UNDERPAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REVERSED'] as const) {
      assert.equal(
        svc.canCancelClientOrder({ status, txHash: null } as any),
        false,
        `Status ${status} must NOT be cancellable`,
      )
    }
  })

  it('4. Builds explorer URLs via buildExplorerTxUrl respecting testnet and mainnet modes', async () => {
    const svc = await import('../src/components/payments/clientPaymentHistoryService.ts')

    assert.equal(
      svc.buildClientOrderExplorerUrl({
        paymentNetwork: 'bsc',
        networkMode: 'testnet',
        txHash: '0x1234abcd',
      } as any),
      'https://testnet.bscscan.com/tx/0x1234abcd',
    )
    assert.equal(
      svc.buildClientOrderExplorerUrl({
        paymentNetwork: 'bsc',
        networkMode: 'mainnet',
        txHash: '0x1234abcd',
      } as any),
      'https://bscscan.com/tx/0x1234abcd',
    )
    assert.equal(
      svc.buildClientOrderExplorerUrl({
        paymentNetwork: 'polygon',
        networkMode: 'testnet',
        txHash: '0x5678ef',
      } as any),
      'https://amoy.polygonscan.com/tx/0x5678ef',
    )
    assert.equal(
      svc.buildClientOrderExplorerUrl({
        paymentNetwork: 'solana',
        networkMode: 'testnet',
        txHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      } as any),
      'https://solscan.io/tx/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp?cluster=devnet',
    )
    assert.equal(
      svc.buildClientOrderExplorerUrl({
        paymentNetwork: 'bsc',
        networkMode: 'testnet',
        txHash: null,
      } as any),
      null,
    )
  })

  it('5. Renders canonical UI in ClientPaymentHistory.tsx, mounts in WalletPanel.tsx, and preserves Kryptex history in App.tsx', () => {
    const componentSrc = readText('src/components/payments/ClientPaymentHistory.tsx')
    const walletPanelSrc = readText('src/WalletPanel.tsx')
    const appSrc = readText('src/App.tsx')

    assert.ok(componentSrc.includes('Paid — Minero Activo'), 'SETTLED must render as Paid — Minero Activo')
    assert.ok(componentSrc.includes('cancelPaymentIntent'), 'ClientPaymentHistory must call cancelPaymentIntent')
    assert.ok(componentSrc.includes('Cancelar orden'), 'ClientPaymentHistory must render Cancelar orden button')
    assert.ok(componentSrc.includes('canCancelClientOrder'), 'Cancel button must be guarded by canCancelClientOrder')
    assert.ok(componentSrc.includes('buildClientOrderExplorerUrl'), 'Explorer link must use buildClientOrderExplorerUrl')
    assert.ok(componentSrc.includes('activatedMinerId'), 'Must display/link activatedMinerId')
    assert.ok(componentSrc.includes('/nft-miners/'), 'Must link to activated miner page')
    assert.ok(componentSrc.includes('TESTNET'), 'Must render TESTNET/MAINNET badge')

    assert.ok(walletPanelSrc.includes('ClientPaymentHistory'), 'WalletPanel.tsx must mount ClientPaymentHistory')
    assert.ok(walletPanelSrc.includes('useAuth'), 'WalletPanel.tsx must read authenticated user from useAuth()')
    assert.ok(walletPanelSrc.includes('@reown/appkit/react'), 'WalletPanel.tsx must preserve Reown AppKit')

    assert.ok(appSrc.includes('Historial de pagos del pool'), 'App.tsx must preserve Kryptex public payout history')
    assert.ok(appSrc.includes('AuthorizedWithdrawalView'), 'App.tsx must preserve AuthorizedWithdrawalView')
  })
})
