import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import ts from 'typescript'
import { disconnectWeb3SessionBestEffort } from '../src/services/session/accountSessionIsolation.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')

function readText(relPath: string): string {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf8')
}

interface MockControllers {
  activeChain: string | undefined
  accounts: Record<string, { caipAddress?: string } | undefined>
  connections: Record<string, Array<{ connectorId: string; accounts?: Array<{ address: string }> }>>
  connectorIds: Record<string, string | undefined>
  wagmiConnectionCount: number
  calls: string[]
}

function loadAppKitSanitizers(mock: MockControllers) {
  const appKitSrc = readText('src/appkitConfig.ts')
  const startMarker = 'export const KNOWN_APPKIT_NAMESPACES'
  const endMarker = 'export interface EvmUniversalProviderLike'
  const startIdx = appKitSrc.indexOf(startMarker)
  const endIdx = appKitSrc.indexOf(endMarker)
  assert.notEqual(startIdx, -1, 'src/appkitConfig.ts must export KNOWN_APPKIT_NAMESPACES before EvmUniversalProviderLike')
  assert.notEqual(endIdx, -1, 'src/appkitConfig.ts must preserve EvmUniversalProviderLike marker')
  assert.ok(startIdx < endIdx, 'Sanitization helpers must be placed before EvmUniversalProviderLike')

  const sliceSrc = appKitSrc.slice(startIdx, endIdx)
  const { outputText } = ts.transpileModule(sliceSrc, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  })

  const ChainController = {
    get state() {
      return { activeChain: mock.activeChain }
    },
    getAccountData(namespace?: string) {
      const target = namespace ?? mock.activeChain
      return target ? mock.accounts[target] : undefined
    },
    setActiveNamespace(namespace: string | undefined) {
      mock.calls.push(`setActiveNamespace:${String(namespace)}`)
      mock.activeChain = namespace
    },
  }

  const ConnectionController = {
    getConnections(namespace?: string) {
      const target = namespace ?? mock.activeChain
      return target ? (mock.connections[target] ?? []) : []
    },
    setConnections(connections: Array<{ connectorId: string }>, namespace: string) {
      mock.calls.push(`setConnections:${namespace}:${connections.length}`)
      mock.connections[namespace] = connections
    },
  }

  const ConnectorController = {
    getConnectorId(namespace?: string) {
      return namespace ? mock.connectorIds[namespace] : undefined
    },
    removeConnectorId(namespace: string) {
      mock.calls.push(`removeConnectorId:${namespace}`)
      mock.connectorIds[namespace] = undefined
    },
  }

  const wagmiAdapter = {
    wagmiConfig: {
      state: {
        connections: {
          get size() {
            return mock.wagmiConnectionCount
          },
        },
      },
    },
    clearConnections() {
      mock.calls.push('wagmiAdapter.clearConnections')
      mock.wagmiConnectionCount = 0
      mock.connections.eip155 = []
    },
  }

  const appKitModal = {
    async open(options?: Record<string, unknown>) {
      mock.calls.push(`appKitModal.open:${JSON.stringify(options ?? null)}`)
    },
  }

  const exportsObj: Record<string, unknown> = {}
  const factory = new Function(
    'exports',
    'ChainController',
    'ConnectionController',
    'ConnectorController',
    'wagmiAdapter',
    'appKitModal',
    outputText,
  )
  factory(exportsObj, ChainController, ConnectionController, ConnectorController, wagmiAdapter, appKitModal)

  return exportsObj as {
    KNOWN_APPKIT_NAMESPACES: readonly string[]
    sanitizeStaleAppKitConnectionsBeforeOpen: (
      options?: { view?: string; namespace?: string },
      deps?: Record<string, unknown>,
    ) => { clearedNamespaces: string[]; syncedActiveNamespace?: string }
    openAppKitSafely: (
      options?: { view?: string; namespace?: string },
      deps?: Record<string, unknown>,
    ) => Promise<void> | void
  }
}

describe('POUW_FIX_APPKIT_ALREADY_LINKED_DEADLOCK — AppKit phantom connection cleanup & pre-open sanitization', () => {
  describe('Suite 1: disconnectWeb3SessionBestEffort clears residual AppKit/Wagmi connection state', () => {
    it('clears eip155, solana, and tron ConnectionController + ConnectorController + wagmi connections AFTER disconnect steps settle', async () => {
      const order: string[] = []
      const clearedSetConnections: Array<{ ns: string; len: number }> = []
      const removedConnectorIds: string[] = []
      let wagmiCleared = 0

      await disconnectWeb3SessionBestEffort({
        disconnectAppKit: async () => {
          order.push('disconnectAppKit')
        },
        disconnectWagmi: async () => {
          order.push('disconnectWagmi')
        },
        requestEvmProvider: async () => {
          order.push('revokeEvm')
        },
        clearOwnerStorage: false,
        appKitCleanup: {
          setConnections(connections, ns) {
            order.push(`setConnections:${ns}`)
            clearedSetConnections.push({ ns, len: connections.length })
          },
          removeConnectorId(ns) {
            order.push(`removeConnectorId:${ns}`)
            removedConnectorIds.push(ns)
          },
          clearWagmiConnections() {
            order.push('clearWagmiConnections')
            wagmiCleared += 1
          },
        },
      })

      assert.deepEqual(clearedSetConnections, [
        { ns: 'eip155', len: 0 },
        { ns: 'solana', len: 0 },
        { ns: 'tron', len: 0 },
      ])
      assert.deepEqual(removedConnectorIds, ['eip155', 'solana', 'tron'])
      assert.equal(wagmiCleared, 1)

      const firstCleanupIdx = order.findIndex((step) => step.startsWith('setConnections:'))
      assert.ok(firstCleanupIdx > -1)
      assert.ok(order.indexOf('disconnectAppKit') < firstCleanupIdx)
      assert.ok(order.indexOf('disconnectWagmi') < firstCleanupIdx)
    })

    it('still executes residual connection cleanup even when disconnectAppKit or disconnectWagmi rejects', async () => {
      const clearedNamespaces: string[] = []
      let wagmiCleared = false

      await disconnectWeb3SessionBestEffort({
        disconnectAppKit: async () => {
          throw new Error('appkit disconnect timeout')
        },
        disconnectWagmi: async () => {
          throw new Error('wagmi disconnect failed')
        },
        clearOwnerStorage: false,
        appKitCleanup: {
          setConnections(_connections, ns) {
            clearedNamespaces.push(ns)
          },
          clearWagmiConnections() {
            wagmiCleared = true
          },
        },
      })

      assert.deepEqual(clearedNamespaces, ['eip155', 'solana', 'tron'])
      assert.equal(wagmiCleared, true)
    })
  })

  describe('Suite 2: sanitizeStaleAppKitConnectionsBeforeOpen & openAppKitSafely', () => {
    it('purges phantom io.metamask ConnectionController + ConnectorController + wagmi entries when eip155 caipAddress is empty', () => {
      const mock: MockControllers = {
        activeChain: 'eip155',
        accounts: {
          eip155: undefined,
          solana: undefined,
          tron: undefined,
        },
        connections: {
          eip155: [{ connectorId: 'io.metamask', accounts: [{ address: '0x1111111111111111111111111111111111111111' }] }],
          solana: [],
          tron: [],
        },
        connectorIds: {
          eip155: 'io.metamask',
        },
        wagmiConnectionCount: 1,
        calls: [],
      }

      const { sanitizeStaleAppKitConnectionsBeforeOpen } = loadAppKitSanitizers(mock)
      const result = sanitizeStaleAppKitConnectionsBeforeOpen()

      assert.deepEqual(result.clearedNamespaces, ['eip155'])
      assert.deepEqual(mock.connections.eip155, [])
      assert.equal(mock.connectorIds.eip155, undefined)
      assert.equal(mock.wagmiConnectionCount, 0)
    })

    it('purges disconnected solana/tron phantom connections while preserving an active connected eip155 session', () => {
      const mock: MockControllers = {
        activeChain: 'eip155',
        accounts: {
          eip155: { caipAddress: 'eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          solana: { caipAddress: '' },
          tron: undefined,
        },
        connections: {
          eip155: [{ connectorId: 'io.metamask', accounts: [{ address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] }],
          solana: [{ connectorId: 'phantom' }],
          tron: [{ connectorId: 'tronlink' }],
        },
        connectorIds: {
          eip155: 'io.metamask',
          solana: 'phantom',
          tron: 'tronlink',
        },
        wagmiConnectionCount: 1,
        calls: [],
      }

      const { sanitizeStaleAppKitConnectionsBeforeOpen } = loadAppKitSanitizers(mock)
      const result = sanitizeStaleAppKitConnectionsBeforeOpen()

      assert.deepEqual(result.clearedNamespaces, ['solana', 'tron'])
      assert.equal(mock.connections.eip155.length, 1)
      assert.equal(mock.connectorIds.eip155, 'io.metamask')
      assert.equal(mock.wagmiConnectionCount, 1)
      assert.deepEqual(mock.connections.solana, [])
      assert.equal(mock.connectorIds.solana, undefined)
      assert.deepEqual(mock.connections.tron, [])
      assert.equal(mock.connectorIds.tron, undefined)
    })

    it('purges orphan wagmiConfig connections when eip155 caipAddress is empty even if ConnectionController is already empty', () => {
      const mock: MockControllers = {
        activeChain: 'eip155',
        accounts: {},
        connections: { eip155: [], solana: [], tron: [] },
        connectorIds: {},
        wagmiConnectionCount: 2,
        calls: [],
      }

      const { sanitizeStaleAppKitConnectionsBeforeOpen } = loadAppKitSanitizers(mock)
      const result = sanitizeStaleAppKitConnectionsBeforeOpen()

      assert.deepEqual(result.clearedNamespaces, ['eip155'])
      assert.equal(mock.wagmiConnectionCount, 0)
    })

    it('syncs activeChain to connected eip155 when opening without explicit namespace and activeChain is disconnected', () => {
      const mock: MockControllers = {
        activeChain: 'solana',
        accounts: {
          eip155: { caipAddress: 'eip155:137:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
          solana: undefined,
        },
        connections: {
          eip155: [{ connectorId: 'io.metamask' }],
          solana: [],
          tron: [],
        },
        connectorIds: {
          eip155: 'io.metamask',
        },
        wagmiConnectionCount: 1,
        calls: [],
      }

      const { sanitizeStaleAppKitConnectionsBeforeOpen } = loadAppKitSanitizers(mock)
      const result = sanitizeStaleAppKitConnectionsBeforeOpen({ view: 'Account' })

      assert.equal(result.syncedActiveNamespace, 'eip155')
      assert.equal(mock.activeChain, 'eip155')
    })

    it('preserves explicit multichain target namespace and respects pending SCRUM-375 isolationLocked guard', () => {
      const mockExplicitNs: MockControllers = {
        activeChain: 'tron',
        accounts: {
          eip155: { caipAddress: 'eip155:1:0xcccccccccccccccccccccccccccccccccccccccc' },
          solana: undefined,
          tron: undefined,
        },
        connections: {
          eip155: [{ connectorId: 'io.metamask' }],
          solana: [{ connectorId: 'solflare' }],
          tron: [],
        },
        connectorIds: {
          eip155: 'io.metamask',
          solana: 'solflare',
        },
        wagmiConnectionCount: 1,
        calls: [],
      }

      const explicitHelpers = loadAppKitSanitizers(mockExplicitNs)
      const explicitRes = explicitHelpers.sanitizeStaleAppKitConnectionsBeforeOpen({ namespace: 'solana' })
      assert.equal(explicitRes.syncedActiveNamespace, undefined)
      assert.equal(mockExplicitNs.activeChain, 'tron')
      assert.deepEqual(mockExplicitNs.connections.solana, [])

      const mockLocked: MockControllers = {
        activeChain: 'solana',
        accounts: {
          eip155: { caipAddress: 'eip155:1:0xdddddddddddddddddddddddddddddddddddddddd' },
          solana: undefined,
        },
        connections: {
          eip155: [{ connectorId: 'io.metamask' }],
          solana: [],
          tron: [],
        },
        connectorIds: { eip155: 'io.metamask' },
        wagmiConnectionCount: 1,
        calls: [],
      }
      const lockedHelpers = loadAppKitSanitizers(mockLocked)
      const lockedRes = lockedHelpers.sanitizeStaleAppKitConnectionsBeforeOpen(undefined, { isolationLocked: true })
      assert.equal(lockedRes.syncedActiveNamespace, undefined)
      assert.equal(mockLocked.activeChain, 'solana')
    })

    it('openAppKitSafely sanitizes phantom state BEFORE invoking openModal / appKitModal.open', async () => {
      const mock: MockControllers = {
        activeChain: 'eip155',
        accounts: {},
        connections: {
          eip155: [{ connectorId: 'io.metamask' }],
          solana: [],
          tron: [],
        },
        connectorIds: { eip155: 'io.metamask' },
        wagmiConnectionCount: 1,
        calls: [],
      }

      const { openAppKitSafely } = loadAppKitSanitizers(mock)
      await openAppKitSafely({ view: 'Connect' })

      const openIndex = mock.calls.findIndex((c) => c.startsWith('appKitModal.open:'))
      const wagmiClearIndex = mock.calls.indexOf('wagmiAdapter.clearConnections')
      assert.ok(wagmiClearIndex > -1, 'Expected wagmiAdapter.clearConnections before modal open')
      assert.ok(openIndex > wagmiClearIndex, 'Expected modal open strictly after stale connection sanitization')
    })
  })

  describe('Suite 3: Source wiring & architectural invariants', () => {
    it('wires pre-open sanitization across App.tsx, WalletPanel.tsx, WalletPaymentCheckout.tsx, and walletSession.ts without violating invariants', () => {
      const isolationSrc = readText('src/services/session/accountSessionIsolation.ts')
      const appKitSrc = readText('src/appkitConfig.ts')
      const appSrc = readText('src/App.tsx')
      const panelSrc = readText('src/WalletPanel.tsx')
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      const sessionSrc = readText('src/walletSession.ts')

      assert.ok(isolationSrc.includes('ConnectionController'), 'accountSessionIsolation.ts must reference ConnectionController')
      assert.ok(isolationSrc.includes('ConnectorController'), 'accountSessionIsolation.ts must reference ConnectorController')
      assert.ok(isolationSrc.includes('clearConnections'), 'accountSessionIsolation.ts must clear wagmiAdapter connections')

      assert.equal(appKitSrc.includes('walletSession'), false, 'src/appkitConfig.ts must remain decoupled from walletSession')
      assert.ok(appSrc.includes('sanitizeStaleAppKitConnectionsBeforeOpen'), 'src/App.tsx must sanitize before opening modal')
      assert.ok(panelSrc.includes('openAppKitSafely'), 'src/WalletPanel.tsx must route modal opens through openAppKitSafely')
      assert.ok(checkoutSrc.includes('sanitizeStaleAppKitConnectionsBeforeOpen'), 'src/WalletPaymentCheckout.tsx must sanitize before opening modal')
      assert.ok(sessionSrc.includes('openAppKitSafely'), 'src/walletSession.ts must route openModal/connect through openAppKitSafely')

      assert.ok(sessionSrc.split(/\r?\n/).length <= 130, 'src/walletSession.ts must remain <= 130 lines')
      const checkoutUseEffectCount = (checkoutSrc.match(/useEffect\(/g) ?? []).length
      assert.equal(checkoutUseEffectCount, 8, 'src/WalletPaymentCheckout.tsx must preserve exactly 8 useEffect calls')
      assert.equal(appKitSrc.includes('app.gomining.com'), false, 'src/appkitConfig.ts must preserve canonical PouwMiner white-label')
    })
  })
})
