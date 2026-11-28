export const WALLET_OWNER_UID_STORAGE_KEY = 'pouw_wallet_owner_uid'
export const SESSION_LOGOUT_BROADCAST_KEY = 'pouw_session_logout_broadcast'
export const DEFAULT_WALLET_DISCONNECT_TIMEOUT_MS = 1500

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type EvmRequestArgs = {
  method: string
  params?: unknown[]
}

export type AppKitResidualCleanupNamespace = 'eip155' | 'solana' | 'tron'

export type AppKitResidualCleanupDeps = {
  setConnections?: (connections: never[], namespace: AppKitResidualCleanupNamespace) => unknown
  removeConnectorId?: (namespace: AppKitResidualCleanupNamespace) => unknown
  clearWagmiConnections?: () => unknown
}

export type DisconnectWeb3Deps = {
  disconnectAppKit?: () => unknown | Promise<unknown>
  disconnectWagmi?: () => unknown | Promise<unknown>
  requestEvmProvider?: (args: EvmRequestArgs) => unknown | Promise<unknown>
  appKitCleanup?: AppKitResidualCleanupDeps
  storage?: StorageLike | null
  timeoutMs?: number
  clearOwnerStorage?: boolean
}

export type CrossTabStorageEventInput = {
  key: string | null
  newValue: string | null
  activeUid: string | null
  isWalletConnected: boolean
}

export type CrossTabStorageDecision = {
  shouldDisconnectWallet: boolean
  shouldResetUiState: boolean
  clearOwnerStorage: boolean
}

export type WalletSessionTransitionAction = 'disconnect' | 'bind_owner' | 'clear_owner' | 'noop'

export type WalletSessionTransitionInput = {
  prevUid: string | null
  nextUid: string | null
  storedOwnerUid: string | null
  isWalletConnected: boolean
  hadUnownedConnectedWallet?: boolean
}

export type VisibleTransactionRowsInput<TPayment, TDemo> = {
  isAuthenticated: boolean
  paymentReceipts: TPayment[]
  demoReceipts: TDemo[]
}

export type VisibleTransactionRowsResult<TPayment, TDemo> = {
  paymentReceipts: TPayment[]
  demoReceipts: TDemo[]
}

type InjectedEthereumProvider = {
  request?: (args: EvmRequestArgs) => Promise<unknown>
}

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

export function readStoredWalletOwnerUid(storage?: StorageLike | null): string | null {
  const target = resolveStorage(storage)
  if (!target) return null
  try {
    const raw = target.getItem(WALLET_OWNER_UID_STORAGE_KEY)
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    return trimmed || null
  } catch {
    return null
  }
}

export function writeStoredWalletOwnerUid(uid: string, storage?: StorageLike | null): void {
  const trimmed = uid.trim()
  if (!trimmed) return
  const target = resolveStorage(storage)
  if (!target) return
  try {
    target.setItem(WALLET_OWNER_UID_STORAGE_KEY, trimmed)
  } catch {
    // Storage quota or privacy mode must never break wallet/auth flow.
  }
}

export function clearStoredWalletOwnerUid(storage?: StorageLike | null): void {
  const target = resolveStorage(storage)
  if (!target) return
  try {
    target.removeItem(WALLET_OWNER_UID_STORAGE_KEY)
  } catch {
    // Best-effort cleanup must never throw.
  }
}

let crossTabLogoutSeq = 0

export function broadcastCrossTabSessionLogout(storage?: StorageLike | null): void {
  const target = resolveStorage(storage)
  if (!target) return
  try {
    crossTabLogoutSeq += 1
    const marker = `${Date.now()}:${crossTabLogoutSeq}:${Math.random().toString(36).slice(2, 10)}`
    target.setItem(SESSION_LOGOUT_BROADCAST_KEY, marker)
  } catch {
    // Storage quota or privacy mode must never block logout.
  }
}

export function evaluateCrossTabStorageEvent({
  key,
  newValue,
  activeUid,
  isWalletConnected,
}: CrossTabStorageEventInput): CrossTabStorageDecision {
  if (key === SESSION_LOGOUT_BROADCAST_KEY) {
    if (Boolean(newValue?.trim())) {
      return {
        shouldDisconnectWallet: isWalletConnected,
        shouldResetUiState: true,
        clearOwnerStorage: false,
      }
    }
    return {
      shouldDisconnectWallet: false,
      shouldResetUiState: false,
      clearOwnerStorage: false,
    }
  }

  if (key === WALLET_OWNER_UID_STORAGE_KEY) {
    const nextOwner = newValue?.trim() || null
    if (!nextOwner) {
      return {
        shouldDisconnectWallet: isWalletConnected,
        shouldResetUiState: false,
        clearOwnerStorage: false,
      }
    }
    if (activeUid && nextOwner !== activeUid) {
      return {
        shouldDisconnectWallet: isWalletConnected,
        shouldResetUiState: true,
        clearOwnerStorage: false,
      }
    }
    if (!activeUid) {
      return {
        shouldDisconnectWallet: isWalletConnected,
        shouldResetUiState: false,
        clearOwnerStorage: false,
      }
    }
    return {
      shouldDisconnectWallet: false,
      shouldResetUiState: false,
      clearOwnerStorage: false,
    }
  }

  if (key === null) {
    return {
      shouldDisconnectWallet: isWalletConnected,
      shouldResetUiState: true,
      clearOwnerStorage: false,
    }
  }

  return {
    shouldDisconnectWallet: false,
    shouldResetUiState: false,
    clearOwnerStorage: false,
  }
}

async function runBoundedStep(step: () => unknown | Promise<unknown>, timeoutMs: number): Promise<void> {
  const boundedMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_WALLET_DISCONNECT_TIMEOUT_MS
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const task = Promise.resolve().then(() => step()).catch(() => undefined)
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, boundedMs)
    })
    await Promise.race([task, timeout])
  } catch {
    // Never propagate errors from best-effort Web3 cleanup.
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function disconnectWeb3SessionBestEffort(deps: DisconnectWeb3Deps = {}): Promise<void> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_WALLET_DISCONNECT_TIMEOUT_MS
  const isBrowser = typeof window !== 'undefined'

  const appKitStep: (() => unknown | Promise<unknown>) | null = deps.disconnectAppKit
    ? deps.disconnectAppKit
    : isBrowser
      ? async () => {
          const { appKitModal } = await import('../../appkitConfig')
          await appKitModal.disconnect()
        }
      : null

  const wagmiStep: (() => unknown | Promise<unknown>) | null = deps.disconnectWagmi
    ? deps.disconnectWagmi
    : isBrowser
      ? async () => {
          const [{ disconnect, getConnections }, { wagmiAdapter }] = await Promise.all([
            import('wagmi/actions'),
            import('../../appkitConfig'),
          ])
          const connections = getConnections(wagmiAdapter.wagmiConfig)
          if (connections.length > 0) {
            await Promise.allSettled(
              connections.map(async (conn) => {
                try {
                  const provider = (await conn.connector.getProvider?.()) as InjectedEthereumProvider | undefined
                  if (typeof provider?.request === 'function') {
                    await provider.request({
                      method: 'wallet_revokePermissions',
                      params: [{ eth_accounts: {} }],
                    })
                  }
                } catch {
                  // Best-effort EIP-2255 revocation for EIP-6963 connectors.
                }
                await disconnect(wagmiAdapter.wagmiConfig, { connector: conn.connector })
              }),
            )
          } else {
            await disconnect(wagmiAdapter.wagmiConfig)
          }
        }
      : null

  const revokeStep: (() => unknown | Promise<unknown>) | null = deps.requestEvmProvider
    ? () =>
        deps.requestEvmProvider!({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        })
    : isBrowser
      ? async () => {
          const provider = (window as Window & { ethereum?: InjectedEthereumProvider }).ethereum
          if (typeof provider?.request === 'function') {
            await provider.request({
              method: 'wallet_revokePermissions',
              params: [{ eth_accounts: {} }],
            })
          }
        }
      : null

  const steps = [appKitStep, wagmiStep, revokeStep].filter(
    (step): step is () => unknown | Promise<unknown> => step !== null,
  )

  const isRealBrowserDom = isBrowser && typeof document !== 'undefined'
  const shouldClearResidualAppKit = Boolean(deps.appKitCleanup) || isRealBrowserDom

  try {
    await Promise.allSettled(steps.map((step) => runBoundedStep(step, timeoutMs)))
    // Clear residual Reown ConnectionController / ConnectorController / wagmi state after disconnect settles
    if (shouldClearResidualAppKit) {
      await runBoundedStep(async () => {
        let cleanup = deps.appKitCleanup
        if (!cleanup) {
          const [{ ConnectionController, ConnectorController }, { wagmiAdapter }] = await Promise.all([
            import('@reown/appkit-controllers'),
            import('../../appkitConfig'),
          ])
          cleanup = {
            setConnections: (connections, ns) => ConnectionController.setConnections(connections, ns),
            removeConnectorId: (ns) => ConnectorController.removeConnectorId(ns),
            clearWagmiConnections: () =>
              (wagmiAdapter as unknown as { clearConnections?: (emit?: boolean) => void }).clearConnections?.(),
          }
        }
        for (const namespace of ['eip155', 'solana', 'tron'] as const) {
          cleanup.setConnections?.([], namespace)
          cleanup.removeConnectorId?.(namespace)
        }
        cleanup.clearWagmiConnections?.()
      }, timeoutMs)
    }
  } finally {
    if (deps.clearOwnerStorage !== false) {
      clearStoredWalletOwnerUid(deps.storage)
    }
  }
}

export function evaluateWalletSessionTransition({
  prevUid,
  nextUid,
  storedOwnerUid,
  isWalletConnected,
  hadUnownedConnectedWallet = false,
}: WalletSessionTransitionInput): WalletSessionTransitionAction {
  if (isWalletConnected) {
    if (prevUid && prevUid !== nextUid) return 'disconnect'
    if (nextUid && storedOwnerUid && storedOwnerUid !== nextUid) return 'disconnect'
    if (!nextUid && storedOwnerUid) return 'disconnect'
    if (hadUnownedConnectedWallet && (!storedOwnerUid || storedOwnerUid !== nextUid)) return 'disconnect'
    if (nextUid && !storedOwnerUid) return 'bind_owner'
    return 'noop'
  }
  if ((!nextUid && storedOwnerUid && (!prevUid || storedOwnerUid === prevUid)) || (nextUid && storedOwnerUid && storedOwnerUid !== nextUid)) {
    return 'clear_owner'
  }
  return 'noop'
}

export function shouldResetAccountUiState(prevUid: string | null, nextUid: string | null): boolean {
  return prevUid !== nextUid
}

export function resolveVisibleTransactionRows<TPayment, TDemo>({
  isAuthenticated,
  paymentReceipts,
  demoReceipts,
}: VisibleTransactionRowsInput<TPayment, TDemo>): VisibleTransactionRowsResult<TPayment, TDemo> {
  return isAuthenticated
    ? { paymentReceipts, demoReceipts: [] }
    : { paymentReceipts, demoReceipts }
}
