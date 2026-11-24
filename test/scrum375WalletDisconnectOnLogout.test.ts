import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  WALLET_OWNER_UID_STORAGE_KEY,
  SESSION_LOGOUT_BROADCAST_KEY,
  DEFAULT_WALLET_DISCONNECT_TIMEOUT_MS,
  readStoredWalletOwnerUid,
  writeStoredWalletOwnerUid,
  clearStoredWalletOwnerUid,
  broadcastCrossTabSessionLogout,
  evaluateCrossTabStorageEvent,
  evaluateWalletSessionTransition,
  disconnectWeb3SessionBestEffort,
} from '../src/services/session/accountSessionIsolation.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const EXPECTED_FIRESTORE_RULES_SHA256 =
  'F4313C04DD7595E1C84D8977299169EEA38C2B250F96E6916D68959CDAAA6779'

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(projectRoot, relPath), 'utf8')
}

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value))
    },
    removeItem(key: string): void {
      store.delete(key)
    },
  }
}

describe('SCRUM-375: Auto-Disconnect Reown AppKit Web3 Session on Logout / Account Switch', () => {
  describe('Suite 1: Wallet Owner Storage Helpers', () => {
    it('exports expected constants and reads/writes/clears wallet owner uid safely', () => {
      assert.equal(WALLET_OWNER_UID_STORAGE_KEY, 'pouw_wallet_owner_uid')
      assert.equal(DEFAULT_WALLET_DISCONNECT_TIMEOUT_MS, 1500)

      const storage = createMemoryStorage()
      assert.equal(readStoredWalletOwnerUid(storage), null)

      writeStoredWalletOwnerUid('  uid_alpha  ', storage)
      assert.equal(storage.getItem(WALLET_OWNER_UID_STORAGE_KEY), 'uid_alpha')
      assert.equal(readStoredWalletOwnerUid(storage), 'uid_alpha')

      clearStoredWalletOwnerUid(storage)
      assert.equal(readStoredWalletOwnerUid(storage), null)

      // Whitespace-only or empty value is ignored and returns null
      writeStoredWalletOwnerUid('   ', storage)
      assert.equal(readStoredWalletOwnerUid(storage), null)
    })

    it('tolerates missing storage (SSR/Node) and throwing Storage APIs without throwing', () => {
      assert.equal(readStoredWalletOwnerUid(null), null)
      assert.doesNotThrow(() => writeStoredWalletOwnerUid('uid_1', null))
      assert.doesNotThrow(() => clearStoredWalletOwnerUid(null))

      const throwingStorage = {
        getItem() {
          throw new Error('SecurityError: storage blocked')
        },
        setItem() {
          throw new Error('QuotaExceededError')
        },
        removeItem() {
          throw new Error('SecurityError: storage blocked')
        },
      }
      assert.equal(readStoredWalletOwnerUid(throwingStorage), null)
      assert.doesNotThrow(() => writeStoredWalletOwnerUid('uid_1', throwingStorage))
      assert.doesNotThrow(() => clearStoredWalletOwnerUid(throwingStorage))
    })

    it('broadcasts unique cross-tab session logout markers and tolerates unavailable or throwing storage (SCRUM-378)', () => {
      assert.equal(SESSION_LOGOUT_BROADCAST_KEY, 'pouw_session_logout_broadcast')

      const storage = createMemoryStorage()
      broadcastCrossTabSessionLogout(storage)
      const first = storage.getItem(SESSION_LOGOUT_BROADCAST_KEY)
      broadcastCrossTabSessionLogout(storage)
      const second = storage.getItem(SESSION_LOGOUT_BROADCAST_KEY)

      assert.ok(first && first.trim().length > 0, 'first logout broadcast marker must be non-empty')
      assert.ok(second && second.trim().length > 0, 'second logout broadcast marker must be non-empty')
      assert.notEqual(first, second, 'consecutive logout broadcasts must produce distinct markers')

      assert.doesNotThrow(() => broadcastCrossTabSessionLogout(null))
      assert.doesNotThrow(() =>
        broadcastCrossTabSessionLogout({
          getItem: () => null,
          setItem: () => {
            throw new Error('QuotaExceededError')
          },
          removeItem: () => {},
        }),
      )
    })
  })

  describe('Suite 2: disconnectWeb3SessionBestEffort', () => {
    it('disconnects AppKit, disconnects Wagmi, revokes EIP-1193 eth_accounts permissions, and clears owner storage', async () => {
      const storage = createMemoryStorage({ [WALLET_OWNER_UID_STORAGE_KEY]: 'uid_1' })
      const calls: string[] = []
      const evmRequests: Array<{ method: string; params?: unknown[] }> = []

      await disconnectWeb3SessionBestEffort({
        storage,
        timeoutMs: 200,
        disconnectAppKit: async () => {
          calls.push('appkit')
        },
        disconnectWagmi: async () => {
          calls.push('wagmi')
        },
        requestEvmProvider: async (args) => {
          calls.push('revoke')
          evmRequests.push(args)
        },
      })

      assert.ok(calls.includes('appkit'), 'must call disconnectAppKit')
      assert.ok(calls.includes('wagmi'), 'must call disconnectWagmi')
      assert.ok(calls.includes('revoke'), 'must call requestEvmProvider')
      assert.deepEqual(evmRequests, [
        { method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] },
      ])
      assert.equal(readStoredWalletOwnerUid(storage), null, 'must clear stored wallet owner uid')
    })

    it('preserves existing pouw_wallet_owner_uid when clearOwnerStorage is false (SCRUM-378 cross-tab safety)', async () => {
      const storage = createMemoryStorage({ [WALLET_OWNER_UID_STORAGE_KEY]: 'uid_2' })
      const calls: string[] = []

      await disconnectWeb3SessionBestEffort({
        storage,
        clearOwnerStorage: false,
        timeoutMs: 200,
        disconnectAppKit: async () => {
          calls.push('appkit')
        },
        disconnectWagmi: async () => {
          calls.push('wagmi')
        },
        requestEvmProvider: async () => {
          calls.push('revoke')
        },
      })

      assert.deepEqual(calls.sort(), ['appkit', 'revoke', 'wagmi'])
      assert.equal(
        readStoredWalletOwnerUid(storage),
        'uid_2',
        'clearOwnerStorage: false must preserve newly bound wallet owner uid from another tab',
      )
    })

    it('never throws when providers throw synchronously or reject asynchronously, and still clears storage', async () => {
      const storage = createMemoryStorage({ [WALLET_OWNER_UID_STORAGE_KEY]: 'uid_1' })

      await assert.doesNotReject(async () => {
        await disconnectWeb3SessionBestEffort({
          storage,
          timeoutMs: 200,
          disconnectAppKit: () => {
            throw new Error('AppKit synchronous crash')
          },
          disconnectWagmi: async () => {
            throw new Error('Wagmi connector already disconnected')
          },
          requestEvmProvider: async () => {
            throw new Error('Method wallet_revokePermissions not supported')
          },
        })
      })

      assert.equal(readStoredWalletOwnerUid(storage), null)
    })

    it('bounds hung providers strictly to timeoutMs without blocking logout or causing unhandled rejections', async () => {
      const storage = createMemoryStorage({ [WALLET_OWNER_UID_STORAGE_KEY]: 'uid_1' })
      let lateRejectTimer: ReturnType<typeof setTimeout> | undefined

      const startedAt = Date.now()
      await assert.doesNotReject(async () => {
        await disconnectWeb3SessionBestEffort({
          storage,
          timeoutMs: 40,
          disconnectAppKit: () => new Promise<void>(() => {}),
          disconnectWagmi: () =>
            new Promise<void>((_, reject) => {
              lateRejectTimer = setTimeout(() => reject(new Error('late wagmi failure')), 70)
            }),
          requestEvmProvider: () => new Promise<void>(() => {}),
        })
      })
      const elapsedMs = Date.now() - startedAt

      assert.ok(elapsedMs < 350, `Expected bounded timeout resolution (< 350ms), took ${elapsedMs}ms`)
      assert.equal(readStoredWalletOwnerUid(storage), null)

      // Allow late rejection timer to fire and verify process survives cleanly without unhandledRejection
      await new Promise((resolve) => setTimeout(resolve, 90))
      if (lateRejectTimer) clearTimeout(lateRejectTimer)
    })

    it('resolves cleanly in SSR/Node without window, localStorage, or window.ethereum', async () => {
      await assert.doesNotReject(async () => {
        await disconnectWeb3SessionBestEffort()
      })
    })

    it('preserves this-binding on window.ethereum.request, clears default window.localStorage, handles partial timeouts and invalid timeoutMs', async () => {
      const storage = createMemoryStorage({ [WALLET_OWNER_UID_STORAGE_KEY]: 'uid_browser' })
      const calls: string[] = []
      let seenThis: unknown = null
      let seenArgs: unknown = null
      const fakeEthereum = {
        async request(this: unknown, args: { method: string; params?: unknown[] }) {
          seenThis = this
          seenArgs = args
          calls.push('window.ethereum')
        },
      }

      const prevWindow = (globalThis as { window?: unknown }).window
      ;(globalThis as { window?: unknown }).window = {
        localStorage: storage,
        ethereum: fakeEthereum,
      }

      try {
        // 1. Default window.ethereum (with strict `this` check) + default window.localStorage + partial timeout
        const startedAt = Date.now()
        await disconnectWeb3SessionBestEffort({
          timeoutMs: 40,
          disconnectAppKit: () => new Promise<void>(() => {}),
          disconnectWagmi: async () => {
            calls.push('wagmi')
          },
        })
        const elapsedMs = Date.now() - startedAt
        assert.ok(elapsedMs < 350, `Partial timeout must stay bounded (< 350ms), took ${elapsedMs}ms`)
        assert.equal(seenThis, fakeEthereum, 'window.ethereum.request must preserve provider `this` binding')
        assert.deepEqual(seenArgs, {
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        })
        assert.ok(calls.includes('wagmi'), 'fast steps must still run concurrently alongside a hung step')
        assert.equal(readStoredWalletOwnerUid(storage), null, 'default window.localStorage owner must be cleared')

        // 2. Non-positive or NaN timeoutMs falls back safely without rejecting
        for (const badTimeout of [0, -50, Number.NaN]) {
          await assert.doesNotReject(async () => {
            await disconnectWeb3SessionBestEffort({
              storage,
              timeoutMs: badTimeout,
              disconnectAppKit: async () => {},
              disconnectWagmi: async () => {},
              requestEvmProvider: async () => {},
            })
          })
        }
      } finally {
        if (prevWindow === undefined) {
          delete (globalThis as { window?: unknown }).window
        } else {
          ;(globalThis as { window?: unknown }).window = prevWindow
        }
      }
    })
  })

  describe('Suite 3: evaluateWalletSessionTransition', () => {
    it('returns disconnect on explicit logout (uid -> null) and account switch (uid_1 -> uid_2) when wallet is connected', () => {
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: 'uid_1',
          nextUid: null,
          storedOwnerUid: 'uid_1',
          isWalletConnected: true,
        }),
        'disconnect',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: 'uid_1',
          nextUid: null,
          storedOwnerUid: null,
          isWalletConnected: true,
        }),
        'disconnect',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: 'uid_1',
          nextUid: 'uid_2',
          storedOwnerUid: 'uid_1',
          isWalletConnected: true,
        }),
        'disconnect',
      )
    })

    it('returns disconnect on cross-account reload (tab closed without logout) and residual unauthenticated session', () => {
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: null,
          nextUid: 'uid_2',
          storedOwnerUid: 'uid_1',
          isWalletConnected: true,
        }),
        'disconnect',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: null,
          nextUid: null,
          storedOwnerUid: 'uid_1',
          isWalletConnected: true,
        }),
        'disconnect',
      )
    })

    it('returns noop on legitimate same-account F5 reload and bind_owner on voluntary wallet connection', () => {
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: null,
          nextUid: 'uid_1',
          storedOwnerUid: 'uid_1',
          isWalletConnected: true,
        }),
        'noop',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: 'uid_1',
          nextUid: 'uid_1',
          storedOwnerUid: 'uid_1',
          isWalletConnected: true,
        }),
        'noop',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: 'uid_2',
          nextUid: 'uid_2',
          storedOwnerUid: null,
          isWalletConnected: true,
        }),
        'bind_owner',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: null,
          nextUid: 'uid_2',
          storedOwnerUid: null,
          isWalletConnected: true,
        }),
        'bind_owner',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: null,
          nextUid: null,
          storedOwnerUid: null,
          isWalletConnected: true,
        }),
        'noop',
      )
    })

    it('returns disconnect when a residual unowned wallet survived a failed/timed-out logout before uid_2 logs in', () => {
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: null,
          nextUid: 'uid_2',
          storedOwnerUid: null,
          isWalletConnected: true,
          hadUnownedConnectedWallet: true,
        }),
        'disconnect',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: null,
          nextUid: null,
          storedOwnerUid: null,
          isWalletConnected: true,
          hadUnownedConnectedWallet: true,
        }),
        'disconnect',
      )
      // Same-account reload with matching storedOwnerUid remains noop
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: null,
          nextUid: 'uid_1',
          storedOwnerUid: 'uid_1',
          isWalletConnected: true,
          hadUnownedConnectedWallet: true,
        }),
        'noop',
      )
    })

    it('returns clear_owner for stale storedOwnerUid when wallet is disconnected, and noop otherwise', () => {
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: 'uid_1',
          nextUid: null,
          storedOwnerUid: 'uid_1',
          isWalletConnected: false,
        }),
        'clear_owner',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: null,
          nextUid: 'uid_2',
          storedOwnerUid: 'uid_1',
          isWalletConnected: false,
        }),
        'clear_owner',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: 'uid_1',
          nextUid: 'uid_1',
          storedOwnerUid: 'uid_1',
          isWalletConnected: false,
        }),
        'noop',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: 'uid_1',
          nextUid: null,
          storedOwnerUid: 'uid_2',
          isWalletConnected: false,
        }),
        'noop',
        'Tab B signing out of uid_1 must not erase uid_2 bound in another tab',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: null,
          nextUid: null,
          storedOwnerUid: 'uid_1',
          isWalletConnected: false,
        }),
        'clear_owner',
      )
      assert.equal(
        evaluateWalletSessionTransition({
          prevUid: null,
          nextUid: null,
          storedOwnerUid: null,
          isWalletConnected: false,
        }),
        'noop',
      )
    })
  })

  describe('Suite 3B: evaluateCrossTabStorageEvent (SCRUM-378)', () => {
    it('handles SESSION_LOGOUT_BROADCAST_KEY immediately without clearing owner storage', () => {
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: SESSION_LOGOUT_BROADCAST_KEY,
          newValue: '1700000000000:abc',
          activeUid: 'uid_1',
          isWalletConnected: true,
        }),
        { shouldDisconnectWallet: true, shouldResetUiState: true, clearOwnerStorage: false },
      )
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: SESSION_LOGOUT_BROADCAST_KEY,
          newValue: '1700000000000:def',
          activeUid: 'uid_1',
          isWalletConnected: false,
        }),
        { shouldDisconnectWallet: false, shouldResetUiState: true, clearOwnerStorage: false },
      )
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: SESSION_LOGOUT_BROADCAST_KEY,
          newValue: '   ',
          activeUid: 'uid_1',
          isWalletConnected: true,
        }),
        { shouldDisconnectWallet: false, shouldResetUiState: false, clearOwnerStorage: false },
      )
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: SESSION_LOGOUT_BROADCAST_KEY,
          newValue: null,
          activeUid: 'uid_1',
          isWalletConnected: true,
        }),
        { shouldDisconnectWallet: false, shouldResetUiState: false, clearOwnerStorage: false },
      )
    })

    it('handles WALLET_OWNER_UID_STORAGE_KEY removal, cross-account bind, unauthenticated bind, and same-account bind', () => {
      // Removed / emptied in another tab
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: WALLET_OWNER_UID_STORAGE_KEY,
          newValue: null,
          activeUid: 'uid_1',
          isWalletConnected: true,
        }),
        { shouldDisconnectWallet: true, shouldResetUiState: false, clearOwnerStorage: false },
      )
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: WALLET_OWNER_UID_STORAGE_KEY,
          newValue: '',
          activeUid: 'uid_1',
          isWalletConnected: false,
        }),
        { shouldDisconnectWallet: false, shouldResetUiState: false, clearOwnerStorage: false },
      )

      // Different account bound wallet in another tab
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: WALLET_OWNER_UID_STORAGE_KEY,
          newValue: 'uid_2',
          activeUid: 'uid_1',
          isWalletConnected: true,
        }),
        { shouldDisconnectWallet: true, shouldResetUiState: true, clearOwnerStorage: false },
      )
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: WALLET_OWNER_UID_STORAGE_KEY,
          newValue: 'uid_2',
          activeUid: 'uid_1',
          isWalletConnected: false,
        }),
        { shouldDisconnectWallet: false, shouldResetUiState: true, clearOwnerStorage: false },
      )

      // Unauthenticated tab sees another tab bind wallet
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: WALLET_OWNER_UID_STORAGE_KEY,
          newValue: 'uid_2',
          activeUid: null,
          isWalletConnected: true,
        }),
        { shouldDisconnectWallet: true, shouldResetUiState: false, clearOwnerStorage: false },
      )
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: WALLET_OWNER_UID_STORAGE_KEY,
          newValue: 'uid_2',
          activeUid: null,
          isWalletConnected: false,
        }),
        { shouldDisconnectWallet: false, shouldResetUiState: false, clearOwnerStorage: false },
      )

      // Same account bound wallet in another tab -> no-op
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: WALLET_OWNER_UID_STORAGE_KEY,
          newValue: '  uid_1  ',
          activeUid: 'uid_1',
          isWalletConnected: true,
        }),
        { shouldDisconnectWallet: false, shouldResetUiState: false, clearOwnerStorage: false },
      )
    })

    it('handles localStorage.clear() (key === null) and ignores unrelated storage keys', () => {
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: null,
          newValue: null,
          activeUid: 'uid_1',
          isWalletConnected: true,
        }),
        { shouldDisconnectWallet: true, shouldResetUiState: true, clearOwnerStorage: false },
      )
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: null,
          newValue: null,
          activeUid: 'uid_1',
          isWalletConnected: false,
        }),
        { shouldDisconnectWallet: false, shouldResetUiState: true, clearOwnerStorage: false },
      )
      assert.deepEqual(
        evaluateCrossTabStorageEvent({
          key: 'gomining_ref',
          newValue: 'ABC123',
          activeUid: 'uid_1',
          isWalletConnected: true,
        }),
        { shouldDisconnectWallet: false, shouldResetUiState: false, clearOwnerStorage: false },
      )
    })
  })

  describe('Suite 4: AuthContext.tsx, App.tsx Wiring & Frozen Invariants', () => {
    it('wires resilient Web3 disconnect in AuthContext.tsx logout() and onAuthStateChanged() with auth epoch & stale profile guards', () => {
      const authSrc = readText('src/AuthContext.tsx')
      assert.match(authSrc, /from '\.\/services\/session\/accountSessionIsolation'/)
      assert.ok(authSrc.includes('disconnectWeb3SessionBestEffort'), 'AuthContext must invoke disconnectWeb3SessionBestEffort')
      assert.ok(authSrc.includes('clearStoredWalletOwnerUid'), 'AuthContext must fallback to clearStoredWalletOwnerUid')
      assert.match(authSrc, /prevUidRef\s*=\s*useRef<string\s*\|\s*null>\(null\)/)
      assert.match(
        authSrc,
        /if\s*\(prevUid && prevUid !== nextUid\)\s*\{[\s\S]*?const storedOwner = readStoredWalletOwnerUid\(\)[\s\S]*?disconnectWeb3SessionBestEffort\(\{\s*clearOwnerStorage: !storedOwner \|\| storedOwner === prevUid,?\s*\}\)/,
        'onAuthStateChanged must disconnect Web3 on prevUid !== nextUid while preserving a remote tab owner',
      )
      assert.ok(authSrc.includes('authActionEpochRef'), 'AuthContext must guard logout/login race with authActionEpochRef')
      assert.ok(authSrc.includes('profileLoadSeqRef'), 'AuthContext must guard stale async getUserProfile with profileLoadSeqRef')
      assert.ok(authSrc.includes('logoutInFlightRef'), 'AuthContext must deduplicate concurrent logout() calls')
      assert.match(
        authSrc,
        /const logout = async \(\) => \{[\s\S]*?try\s*\{[\s\S]*?broadcastCrossTabSessionLogout\(\)[\s\S]*?await disconnectWeb3SessionBestEffort\(\{\s*clearOwnerStorage: shouldClearOwner\s*\}\)[\s\S]*?\}\s*catch\s*\{[\s\S]*?if\s*\(shouldClearOwner\)\s*\{\s*clearStoredWalletOwnerUid\(\)\s*\}[\s\S]*?\}\s*finally\s*\{[\s\S]*?try\s*\{\s*await logoutUser\(\)\s*\}\s*catch[\s\S]*?setUser\(null\)[\s\S]*?setProfile\(null\)[\s\S]*?setAuthModalOpen\(false\)[\s\S]*?\}/,
        'logout() must broadcast cross-tab logout, run disconnectWeb3SessionBestEffort() preserving remote owner, and clear auth state in finally',
      )
      const onAuthBlock = authSrc.match(/onAuthStateChanged\(auth,[\s\S]*?return \(\) => unsubscribeAuth\(\)/)?.[0] ?? ''
      assert.equal(
        onAuthBlock.includes('broadcastCrossTabSessionLogout'),
        false,
        'onAuthStateChanged must never call broadcastCrossTabSessionLogout (zero cross-tab ping-pong)',
      )
    })

    it('wires Web3 wallet owner guard and cross-tab storage sync in App.tsx covering connecting states, residual disconnect, and multi-connector cleanup', () => {
      const appSrc = readText('src/App.tsx')
      const isoSrc = readText('src/services/session/accountSessionIsolation.ts')
      assert.match(appSrc, /from '\.\/services\/session\/accountSessionIsolation'/)
      assert.ok(appSrc.includes('evaluateWalletSessionTransition'), 'App.tsx must use evaluateWalletSessionTransition')
      assert.ok(appSrc.includes('evaluateCrossTabStorageEvent'), 'App.tsx must use evaluateCrossTabStorageEvent (SCRUM-378)')
      assert.ok(appSrc.includes('readStoredWalletOwnerUid'), 'App.tsx must read stored wallet owner uid')
      assert.ok(appSrc.includes('writeStoredWalletOwnerUid'), 'App.tsx must persist wallet owner uid on bind_owner')
      assert.ok(appSrc.includes('clearStoredWalletOwnerUid'), 'App.tsx must clear wallet owner uid on clear_owner')
      assert.ok(appSrc.includes('disconnectWeb3SessionBestEffort'), 'App.tsx must invoke disconnectWeb3SessionBestEffort')
      assert.match(
        appSrc,
        /appKitStatus === 'connecting'/,
        'App.tsx must treat AppKit connecting status as restoring to prevent premature clear_owner',
      )
      assert.match(
        appSrc,
        /wagmiStatus === 'connecting'/,
        'App.tsx must treat Wagmi connecting status as restoring to prevent premature clear_owner',
      )
      assert.ok(
        appSrc.includes('hadUnownedConnectedWallet'),
        'App.tsx must pass hadUnownedConnectedWallet to prevent failed-disconnect wallet inheritance',
      )
      assert.ok(
        appSrc.includes('wagmiConnectors'),
        'App.tsx must disconnect all active Wagmi connectors',
      )
      assert.ok(
        isoSrc.includes('getConnections'),
        'accountSessionIsolation.ts must disconnect all Wagmi connections and revoke EIP-6963 connector permissions',
      )
      const addStorageIdx = appSrc.indexOf("window.addEventListener('storage'")
      const removeStorageIdx = appSrc.indexOf("window.removeEventListener('storage'")
      const loadingReturnIdx = appSrc.indexOf('if (loading) {')
      assert.ok(addStorageIdx > 0, 'App.tsx must register window storage listener (SCRUM-378)')
      assert.ok(removeStorageIdx > addStorageIdx, 'App.tsx must remove window storage listener on cleanup')
      assert.ok(loadingReturnIdx > addStorageIdx, 'App.tsx storage listener effect must be declared BEFORE if (loading) return')
      assert.ok(
        appSrc.includes('clearOwnerStorage: decision.clearOwnerStorage'),
        'App.tsx storage handler must forward decision.clearOwnerStorage to preserve remote tab owner',
      )
      assert.ok(
        appSrc.includes('preservedRemoteOwnerUidRef'),
        'App.tsx must track preservedRemoteOwnerUidRef idempotently (StrictMode-safe) so remote owner is not erased',
      )
      assert.ok(
        appSrc.includes('isWalletReconnectingRef'),
        'App.tsx storage handler must track isWalletReconnectingRef so cross-tab events during startup reconnection flag pendingResidualWalletRef',
      )
      assert.match(
        appSrc,
        /if\s*\(event\.storageArea\)\s*\{[\s\S]*?try\s*\{[\s\S]*?window\.localStorage[\s\S]*?\}\s*catch/,
        'App.tsx storage handler must guard window.localStorage access inside try/catch',
      )
      assert.equal(
        appSrc.includes('broadcastCrossTabSessionLogout'),
        false,
        'App.tsx must never re-broadcast logout inside storage handling (zero cross-tab ping-pong)',
      )
    })

    it('preserves appkitConfig.ts (PouwMiner.com), walletSession.ts (<= 130 lines), and pure LF firestore.rules SHA-256', () => {
      const appKitSrc = readText('src/appkitConfig.ts')
      const walletSessionSrc = readText('src/walletSession.ts')
      const rulesRaw = fs.readFileSync(path.resolve(projectRoot, 'firestore.rules'))
      const rulesSha256 = crypto.createHash('sha256').update(rulesRaw).digest('hex').toUpperCase()

      assert.ok(appKitSrc.includes('PouwMiner.com'), 'appkitConfig.ts must keep PouwMiner.com metadata')
      assert.equal(appKitSrc.includes('walletSession'), false, 'appkitConfig.ts must remain decoupled from walletSession')
      assert.ok(walletSessionSrc.split(/\r?\n/).length <= 130, 'walletSession.ts must remain <= 130 lines')
      assert.equal(rulesRaw.includes(0x0d), false, 'firestore.rules must remain pure LF (HAS_CR=false)')
      assert.equal(rulesSha256, EXPECTED_FIRESTORE_RULES_SHA256, 'firestore.rules SHA-256 must match frozen baseline')
    })
  })
})
