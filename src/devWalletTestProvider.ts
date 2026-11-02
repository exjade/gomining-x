export type WalletTestMode = 'connect-success' | 'connect-reject' | 'connect-pending' | 'payment-reject' | 'payment-success'
export type WalletTestWallet = 'metamask' | 'trustwallet'

const testAddress = '0x1111111111111111111111111111111111111111'
const fakeTransactionHash = `0x${'a'.repeat(64)}`

/** Local-only EIP-1193 fixture for repeatable UI checks. It never broadcasts. */
export function installDevWalletTestProvider(mode: WalletTestMode, wallet: WalletTestWallet = 'metamask') {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  let authorized = false
  const provider = {
    isMetaMask: wallet === 'metamask',
    isTrust: wallet === 'trustwallet',
    isTrustWallet: wallet === 'trustwallet',
    async request({ method }: { method: string; params?: unknown[] }) {
      if (method === 'eth_accounts') return authorized ? [testAddress] : []
      if (method === 'eth_requestAccounts') {
        if (mode === 'connect-reject') throw wrappedUserRejection()
        if (mode === 'connect-pending') return new Promise<string[]>(() => undefined)
        authorized = true
        return [testAddress]
      }
      // The default checkout network for a fresh Recargar flow is BNB Chain.
      // Keep the local fixture on that chain so QA reaches the simulated send
      // request without asking a test provider to switch networks.
      if (method === 'eth_chainId') return '0x38'
      if (method === 'eth_sendTransaction') {
        if (mode === 'payment-reject') throw wrappedUserRejection()
        if (mode === 'payment-success') return fakeTransactionHash
      }
      throw new Error(`Wallet test provider does not implement ${method}.`)
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      const eventListeners = listeners.get(event) ?? new Set()
      eventListeners.add(listener)
      listeners.set(event, eventListeners)
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener)
    },
  }
  if (wallet === 'trustwallet') {
    Object.defineProperty(window, 'trustwallet', { configurable: true, value: { ethereum: provider } })
  } else {
    Object.defineProperty(window, 'ethereum', { configurable: true, value: provider })
  }
  Object.defineProperty(window, '__goMiningWalletTestMode', { configurable: true, value: mode })
}

function wrappedUserRejection() {
  return Object.assign(new Error('MetaMask Connect request was cancelled.'), {
    code: 53,
    rpcCode: 4001,
    rpcMessage: 'User rejected the request',
  })
}
