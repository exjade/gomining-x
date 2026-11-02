import { useCallback, useEffect, useRef, useState } from 'react'
import type { PublicKey, Transaction } from '@solana/web3.js'
import { SOLANA_USDT_MINT, type PaymentNetworkId } from './paymentDestinations'
import type { PaymentQuote } from './paymentQuote'
import { getMetaMaskConnectClient, metaMaskChainId } from './metamaskConnect'
import { isWalletRejection } from './walletError'
import { cancelPhantomMobileConnect, clearPhantomMobileSession, consumePhantomReturn, createPhantomConnectUrl, createPhantomPaymentUrl, readPhantomMobileSession, type PhantomMobileSession, type PhantomPaymentReturn } from './phantomMobile'
import { cancelSolflareMobileConnect, clearSolflareMobileSession, consumeSolflareReturn, createSolflareConnectUrl, createSolflarePaymentUrl, readSolflareMobileSession, type SolflarePaymentReturn, type SolflareMobileSession } from './solflareMobile'
import { hasWalletBrowserProvider, isMobileBrowser } from './walletAppLinks'

export type WalletId = 'solflare' | 'phantom' | 'metamask' | 'coinbase' | 'trustwallet' | 'tronlink' | 'unisat'

export type ConnectedWallet = {
  id: WalletId
  name: string
  protocol: 'Solana' | 'EIP-1193' | 'Bitcoin' | 'TRON'
  network: string
  address: string
  shortAddress: string
  disconnectProvider: () => Promise<void>
  sendPayment: (quote: PaymentQuote, context?: WalletPaymentContext) => Promise<string>
  preparePayment?: (quote: PaymentQuote, context: WalletPaymentContext) => Promise<string>
}

export type WalletPaymentContext = { productName: string; returnUrl: string }

export type WalletSession = {
  connection: ConnectedWallet | null
  restoringWallet: boolean
  connectingWallet: WalletId | null
  error: string
  connect: (walletId: WalletId, networkId?: PaymentNetworkId, returnUrl?: string) => Promise<'connected' | 'rejected' | 'failed' | 'pending'>
  cancelConnect: () => void
  disconnect: () => Promise<void>
  solflarePaymentReturn: SolflarePaymentReturn | null
  consumeSolflarePaymentReturn: () => void
  phantomPaymentReturn: PhantomPaymentReturn | null
  consumePhantomPaymentReturn: () => void
}

type PublicKeyLike = { toString: () => string }
type SolanaProvider = {
  publicKey?: PublicKeyLike | null
  isConnected?: boolean
  isSolflare?: boolean
  connect: () => Promise<{ publicKey?: PublicKeyLike } | void>
  disconnect?: () => Promise<void> | void
  signAndSendTransaction?: (transaction: Transaction) => Promise<string | { signature?: string }>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  off?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}
type EvmProvider = {
  isMetaMask?: boolean
  isCoinbaseWallet?: boolean
  isTrust?: boolean
  isTrustWallet?: boolean
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
  providers?: EvmProvider[]
}
type Eip6963Provider = { info?: { name?: string; rdns?: string; uuid?: string }; provider: EvmProvider }
type UniSatProvider = {
  requestAccounts: () => Promise<string[]>
  getAccounts?: () => Promise<string[]>
  getChain?: () => Promise<{ enum?: string; network?: string }>
  getNetwork?: () => Promise<string>
  sendBitcoin: (address: string, satoshis: number) => Promise<string>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}
type TronWebLike = {
  defaultAddress?: { base58?: string }
  transactionBuilder: { sendTrx: (to: string, amountSun: number, from: string) => Promise<unknown> }
  trx: {
    sign: (transaction: unknown) => Promise<unknown>
    sendRawTransaction: (signed: unknown) => Promise<{ result?: boolean; txid?: string; transaction?: { txID?: string } }>
  }
}
type TronProvider = {
  isTronLink?: boolean
  tronWeb?: TronWebLike | false
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    ethereum?: EvmProvider
    coinbaseWalletExtension?: EvmProvider
    trustwallet?: { ethereum?: EvmProvider }
    phantom?: { solana?: SolanaProvider }
    solana?: SolanaProvider
    solflare?: SolanaProvider
    tron?: TronProvider
    unisat?: UniSatProvider
  }
}

// The first two Solana public RPCs returned HTTP 403 for the current mobile
// dapp origin during audit. PublicNode allowed CORS and answered a read-only
// blockhash query, so try it first. All are shared public endpoints, not a
// production SLA or transaction relay.
const SOLANA_RPCS = [
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet.solana.com',
  'https://api.mainnet-beta.solana.com',
]

export function useWalletSession(): WalletSession {
  const [connection, setConnection] = useState<ConnectedWallet | null>(null)
  const [restoringWallet, setRestoringWallet] = useState(true)
  const [connectingWallet, setConnectingWallet] = useState<WalletId | null>(null)
  const [error, setError] = useState('')
  const [solflarePaymentReturn, setSolflarePaymentReturn] = useState<SolflarePaymentReturn | null>(null)
  const [phantomPaymentReturn, setPhantomPaymentReturn] = useState<PhantomPaymentReturn | null>(null)
  const connectionRef = useRef<ConnectedWallet | null>(null)
  const manualConnectingRef = useRef<WalletId | null>(null)
  const connectAttemptRef = useRef(0)
  const pendingMetaMaskClientRef = useRef<Awaited<ReturnType<typeof getMetaMaskConnectClient>> | null>(null)
  const removeListenersRef = useRef<(() => void) | null>(null)

  const updateConnection = useCallback((next: ConnectedWallet | null) => {
    connectionRef.current = next
    setConnection(next)
  }, [])

  const consumeSolflarePaymentReturn = useCallback(() => setSolflarePaymentReturn(null), [])
  const consumePhantomPaymentReturn = useCallback(() => setPhantomPaymentReturn(null), [])

  useEffect(() => {
    let returned: ReturnType<typeof consumeSolflareReturn>
    try {
      returned = consumeSolflareReturn(window.location.href)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo comprobar la respuesta de Solflare.')
      return
    }
    if (!returned) return
    if (returned.type === 'connected') {
      updateConnection(makeSolflareMobileConnection(returned.session))
    } else if (returned.type === 'payment') {
      setSolflarePaymentReturn(returned.result)
    } else {
      setError(returned.message)
    }
  }, [updateConnection])

  useEffect(() => {
    let returned: ReturnType<typeof consumePhantomReturn>
    try {
      returned = consumePhantomReturn(window.location.href)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo comprobar la respuesta de Phantom.')
      return
    }
    if (!returned) return
    if (returned.type === 'connected') {
      updateConnection(makePhantomMobileConnection(returned.session))
    } else if (returned.type === 'payment') {
      setPhantomPaymentReturn(returned.result)
    } else {
      setError(returned.message)
    }
  }, [updateConnection])

  const disconnect = useCallback(async () => {
    removeListenersRef.current?.()
    removeListenersRef.current = null
    const current = connectionRef.current
    try {
      await current?.disconnectProvider()
    } catch {
      // The local session still clears when the provider has already disconnected.
    } finally {
      updateConnection(null)
    }
  }, [updateConnection])

  const cancelConnect = useCallback(() => {
    if (!manualConnectingRef.current) return
    const walletId = manualConnectingRef.current
    connectAttemptRef.current += 1
    manualConnectingRef.current = null
    setConnectingWallet(null)
    setError('')
    if (walletId === 'metamask') {
      try { window.localStorage.removeItem('gm:metamask-connect-used') } catch { /* storage can be disabled */ }
      const client = pendingMetaMaskClientRef.current
      pendingMetaMaskClientRef.current = null
      if (client) void client.disconnect().catch(() => undefined)
    }
    if (walletId === 'solflare') cancelSolflareMobileConnect()
    if (walletId === 'phantom') cancelPhantomMobileConnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const restoreTimeout = window.setTimeout(() => {
      if (!cancelled) setRestoringWallet(false)
    }, 1800)
    const adopt = (wallet: ConnectedWallet, removeListeners: () => void) => {
      if (cancelled || manualConnectingRef.current || connectionRef.current) {
        removeListeners()
        return false
      }
      removeListenersRef.current?.()
      removeListenersRef.current = removeListeners
      updateConnection(wallet)
      return true
    }

    const detectPreviouslyAuthorizedWallet = async () => {
      // These checks only read accounts already authorized for this origin. They
      // never invoke a connect prompt, sign a message, or send a transaction.
      const solflare = window.solflare
      const solflareAddress = solflare?.isSolflare && solflare.isConnected ? asAddress(solflare.publicKey) : null
      if (solflare && solflareAddress && solflare.signAndSendTransaction) {
        const refresh = (key?: unknown) => {
          const address = asAddress(key) ?? asAddress(solflare.publicKey)
          if (!address) { updateConnection(null); return }
          updateConnection(makeSolanaProviderConnection('solflare', 'Solflare', solflare, address))
        }
        const onDisconnect = () => updateConnection(null)
        const onAccountChange = (key?: unknown) => refresh(key)
        solflare.on?.('disconnect', onDisconnect)
        solflare.on?.('accountChanged', onAccountChange)
        const remove = () => {
          const off = solflare.off ?? solflare.removeListener
          off?.call(solflare, 'disconnect', onDisconnect)
          off?.call(solflare, 'accountChanged', onAccountChange)
        }
        if (adopt(makeSolanaProviderConnection('solflare', 'Solflare', solflare, solflareAddress), remove)) return
      }

      const solflareMobileSession = readSolflareMobileSession()
      if (solflareMobileSession && adopt(makeSolflareMobileConnection(solflareMobileSession), () => undefined)) return

      const phantom = window.phantom?.solana
      const phantomAddress = phantom?.isConnected ? asAddress(phantom.publicKey) : null
      if (phantom && phantomAddress && phantom.signAndSendTransaction) {
        const refresh = (key?: unknown) => {
          const address = asAddress(key) ?? asAddress(phantom.publicKey)
          if (!address) { updateConnection(null); return }
          updateConnection(makeSolanaProviderConnection('phantom', 'Phantom', phantom, address))
        }
        const onDisconnect = () => updateConnection(null)
        const onAccountChange = (key?: unknown) => refresh(key)
        phantom.on?.('disconnect', onDisconnect)
        phantom.on?.('accountChanged', onAccountChange)
        const remove = () => {
          const off = phantom.off ?? phantom.removeListener
          off?.call(phantom, 'disconnect', onDisconnect)
          off?.call(phantom, 'accountChanged', onAccountChange)
        }
        if (adopt(makeSolanaProviderConnection('phantom', 'Phantom', phantom, phantomAddress), remove)) return
      }

      const phantomMobileSession = readPhantomMobileSession()
      if (phantomMobileSession && adopt(makePhantomMobileConnection(phantomMobileSession), () => undefined)) return

      const evmProviders = await discoverEvmProviders()
      for (const walletId of ['metamask', 'coinbase', 'trustwallet'] as const) {
        const provider = findNamedEvmProvider(walletId, evmProviders)
        if (!provider) continue
        const accounts = await provider.request({ method: 'eth_accounts' }).catch(() => [])
        const address = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : ''
        if (!address || cancelled || manualConnectingRef.current || connectionRef.current) continue
        let activeAddress = address
        let activeChainId = await provider.request({ method: 'eth_chainId' }).catch(() => null)
        const refresh = () => updateConnection(makeEvmProviderConnection(walletId, provider, activeAddress, activeChainId))
        const onAccountsChanged = (next: unknown) => {
          activeAddress = Array.isArray(next) && typeof next[0] === 'string' ? next[0] : ''
          if (!activeAddress) updateConnection(null)
          else refresh()
        }
        const onChainChanged = (next: unknown) => { activeChainId = next; refresh() }
        provider.on?.('accountsChanged', onAccountsChanged)
        provider.on?.('chainChanged', onChainChanged)
        const remove = () => {
          provider.removeListener?.('accountsChanged', onAccountsChanged)
          provider.removeListener?.('chainChanged', onChainChanged)
        }
        if (adopt(makeEvmProviderConnection(walletId, provider, activeAddress, activeChainId), remove)) return
      }

      // Restore a prior MetaMask Connect mobile/QR session without prompting.
      // A non-sensitive local marker avoids loading the SDK on first visits;
      // the SDK keeps its own session material and this app stores no token.
      const metaMaskConnectWasUsed = (() => {
        try { return window.localStorage.getItem('gm:metamask-connect-used') === '1' } catch { return false }
      })()
      if (metaMaskConnectWasUsed && !cancelled && !manualConnectingRef.current && !connectionRef.current) {
        try {
          const client = await getMetaMaskConnectClient()
          const provider = client.getProvider() as unknown as EvmProvider
          const accounts = await provider.request({ method: 'eth_accounts' }).catch(() => [])
          const address = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : ''
          if (address && !cancelled && !manualConnectingRef.current && !connectionRef.current) {
            let activeAddress = address
            let activeChainId: unknown = await provider.request({ method: 'eth_chainId' }).catch(() => '0x1')
            const refresh = () => updateConnection(makeConnection('metamask', 'MetaMask', 'EIP-1193', evmNetworkName(activeChainId), activeAddress, async () => {
              try { window.localStorage.removeItem('gm:metamask-connect-used') } catch { /* storage can be disabled */ }
              await client.disconnect()
            }, (quote) => sendEvmPayment(provider, activeAddress, quote)))
            const onAccountsChanged = (next: unknown) => {
              activeAddress = Array.isArray(next) && typeof next[0] === 'string' ? next[0] : ''
              if (!activeAddress) updateConnection(null)
              else refresh()
            }
            const onChainChanged = (next: unknown) => { activeChainId = next; refresh() }
            provider.on?.('accountsChanged', onAccountsChanged)
            provider.on?.('chainChanged', onChainChanged)
            const remove = () => {
              provider.removeListener?.('accountsChanged', onAccountsChanged)
              provider.removeListener?.('chainChanged', onChainChanged)
            }
            adopt(makeConnection('metamask', 'MetaMask', 'EIP-1193', evmNetworkName(activeChainId), address, async () => {
              try { window.localStorage.removeItem('gm:metamask-connect-used') } catch { /* storage can be disabled */ }
              await client.disconnect()
            }, (quote) => sendEvmPayment(provider, address, quote)), remove)
          }
        } catch {
          // No SDK session is a normal first-visit state; never prompt here.
        }
      }

      const tron = window.tron
      const tronWeb = tron?.tronWeb
      const tronAddress = tronWeb && typeof tronWeb === 'object' ? tronWeb.defaultAddress?.base58 : undefined
      if (tron && tronAddress) {
        let activeAddress = tronAddress
        let activeChainId = await tron.request({ method: 'eth_chainId' }).catch(() => null)
        const refresh = () => updateConnection(makeTronProviderConnection(tron, activeAddress, activeChainId))
        const onAccountsChanged = (next: unknown) => {
          const currentTronWeb = tron.tronWeb
          const providerAddress = currentTronWeb && typeof currentTronWeb === 'object' ? currentTronWeb.defaultAddress?.base58 : ''
          const account = Array.isArray(next) && typeof next[0] === 'string' ? next[0] : providerAddress ?? ''
          activeAddress = account
          if (!activeAddress) updateConnection(null)
          else refresh()
        }
        const onChainChanged = (next: unknown) => { activeChainId = next; refresh() }
        tron.on?.('accountsChanged', onAccountsChanged)
        tron.on?.('chainChanged', onChainChanged)
        const remove = () => {
          tron.removeListener?.('accountsChanged', onAccountsChanged)
          tron.removeListener?.('chainChanged', onChainChanged)
        }
        if (adopt(makeTronProviderConnection(tron, activeAddress, activeChainId), remove)) return
      }

      const unisat = window.unisat
      const unisatAccounts = await unisat?.getAccounts?.().catch(() => [])
      const unisatAddress = unisatAccounts?.[0]
      if (unisat && unisatAddress) {
        let activeAddress = unisatAddress
        let activeNetwork = await getUniSatNetwork(unisat)
        const refresh = () => updateConnection(makeUniSatProviderConnection(unisat, activeAddress, activeNetwork))
        const onAccountsChanged = (next: unknown) => {
          activeAddress = Array.isArray(next) && typeof next[0] === 'string' ? next[0] : ''
          if (!activeAddress) updateConnection(null)
          else refresh()
        }
        const onNetworkChanged = (next: unknown) => { activeNetwork = String(next ?? 'desconocida'); refresh() }
        unisat.on?.('accountsChanged', onAccountsChanged)
        unisat.on?.('networkChanged', onNetworkChanged)
        const remove = () => {
          unisat.removeListener?.('accountsChanged', onAccountsChanged)
          unisat.removeListener?.('networkChanged', onNetworkChanged)
        }
        adopt(makeUniSatProviderConnection(unisat, activeAddress, activeNetwork), remove)
      }
    }

    void detectPreviouslyAuthorizedWallet().catch(() => undefined).finally(() => {
      if (cancelled) return
      window.clearTimeout(restoreTimeout)
      setRestoringWallet(false)
    })
    return () => {
      cancelled = true
      window.clearTimeout(restoreTimeout)
      removeListenersRef.current?.()
      removeListenersRef.current = null
    }
  }, [updateConnection])

  const connect = useCallback(async (walletId: WalletId, requestedNetworkId?: PaymentNetworkId, returnUrl?: string): Promise<'connected' | 'rejected' | 'failed' | 'pending'> => {
    const attemptId = ++connectAttemptRef.current
    const isCurrentAttempt = () => connectAttemptRef.current === attemptId
    manualConnectingRef.current = walletId
    setError('')
    setConnectingWallet(walletId)
    let metaMaskConnectAttempted = false

    // Solflare's /browse link opens this site inside its embedded browser. For
    // a regular mobile browser, use the encrypted native connect deeplink and
    // let the wallet return to the same public HTTPS page instead.
    if (walletId === 'solflare' && isMobileBrowser() && !hasWalletBrowserProvider('solflare')) {
      try {
        removeListenersRef.current?.()
        removeListenersRef.current = null
        const current = connectionRef.current
        updateConnection(null)
        if (current) void current.disconnectProvider().catch(() => undefined)
        const url = createSolflareConnectUrl(returnUrl ?? window.location.href)
        window.location.assign(url)
        return 'pending'
      } catch (cause) {
        manualConnectingRef.current = null
        setConnectingWallet(null)
        setError(cause instanceof Error ? cause.message : 'No se pudo abrir la aplicación Solflare.')
        return 'failed'
      }
    }

    // Phantom's encrypted mobile-link protocol returns to the referring HTTPS
    // page with an encrypted session; its /browse link only opens the dapp in
    // Phantom's browser and does not provide this cross-browser connection.
    if (walletId === 'phantom' && isMobileBrowser() && !hasWalletBrowserProvider('phantom')) {
      try {
        removeListenersRef.current?.()
        removeListenersRef.current = null
        const current = connectionRef.current
        updateConnection(null)
        if (current) void current.disconnectProvider().catch(() => undefined)
        const url = createPhantomConnectUrl(returnUrl ?? window.location.href)
        window.location.assign(url)
        return 'pending'
      } catch (cause) {
        manualConnectingRef.current = null
        setConnectingWallet(null)
        setError(cause instanceof Error ? cause.message : 'No se pudo abrir la aplicación Phantom.')
        return 'failed'
      }
    }

    try {
      await disconnect()
      if (!isCurrentAttempt()) return 'failed'

      if (walletId === 'solflare') {
        const { default: Solflare } = await import('@solflare-wallet/sdk')
        if (!isCurrentAttempt()) return 'failed'
        const wallet = new Solflare({ network: 'mainnet-beta' })
        const onDisconnect = () => updateConnection(null)
        const onAccountChange = (key?: PublicKeyLike | null) => {
          const address = key?.toString()
          if (address) updateConnection(makeConnection('solflare', 'Solflare', 'Solana', 'Solana · mainnet-beta', address, () => wallet.disconnect(), async (quote) => {
            if (wallet.publicKey?.toString() !== address) throw new Error('La cuenta de Solflare cambió; vuelve a revisar el pago.')
            const transaction = await buildUsdtTransfer(quote, address)
            if (wallet.publicKey?.toString() !== address) throw new Error('La cuenta de Solflare cambió al preparar el pago; vuelve a revisar el checkout.')
            return wallet.signAndSendTransaction(transaction, { preflightCommitment: 'confirmed' })
          }))
          else updateConnection(null)
        }
        wallet.on('disconnect', onDisconnect)
        wallet.on('accountChanged', onAccountChange)
        removeListenersRef.current = () => {
          wallet.off('disconnect', onDisconnect)
          wallet.off('accountChanged', onAccountChange)
        }
        await wallet.connect()
        if (!isCurrentAttempt()) { await wallet.disconnect().catch(() => undefined); return 'failed' }
        const address = wallet.publicKey?.toString()
        if (!address) throw new Error('Solflare no devolvió una dirección pública.')
        updateConnection(makeConnection('solflare', 'Solflare', 'Solana', 'Solana · mainnet-beta', address, () => wallet.disconnect(), async (quote) => {
          if (wallet.publicKey?.toString() !== address) throw new Error('La cuenta de Solflare cambió; vuelve a revisar el pago.')
          const transaction = await buildUsdtTransfer(quote, address)
          if (wallet.publicKey?.toString() !== address) throw new Error('La cuenta de Solflare cambió al preparar el pago; vuelve a revisar el checkout.')
          return wallet.signAndSendTransaction(transaction, { preflightCommitment: 'confirmed' })
        }))
        return 'connected'
      }

      if (walletId === 'phantom') {
        const provider = window.phantom?.solana ?? (window.solana ? window.solana : undefined)
        if (!provider) throw new Error('No se encontró Phantom en este navegador.')
        if (!provider.signAndSendTransaction) throw new Error('Esta versión de Phantom no permite enviar transacciones desde la página.')
        const response = await provider.connect()
        if (!isCurrentAttempt()) { await provider.disconnect?.(); return 'failed' }
        const address = asAddress(response && response.publicKey) ?? asAddress(provider.publicKey)
        if (!address) throw new Error('Phantom no devolvió una dirección pública.')
        const onDisconnect = () => updateConnection(null)
        const onAccountChange = (key?: unknown) => {
          const activeAddress = asAddress(key) ?? asAddress(provider.publicKey)
          if (!activeAddress) {
            updateConnection(null)
            return
          }
          updateConnection(makeConnection('phantom', 'Phantom', 'Solana', 'Solana · red seleccionada en Phantom', activeAddress, async () => provider.disconnect?.(), async (quote) => {
            if (asAddress(provider.publicKey) !== activeAddress) throw new Error('La cuenta de Phantom cambió; vuelve a revisar el pago.')
            const transaction = await buildUsdtTransfer(quote, activeAddress)
            if (asAddress(provider.publicKey) !== activeAddress) throw new Error('La cuenta de Phantom cambió al preparar el pago; vuelve a revisar el checkout.')
            return signatureFrom(await provider.signAndSendTransaction!(transaction))
          }))
        }
        provider.on?.('disconnect', onDisconnect)
        provider.on?.('accountChanged', onAccountChange)
        removeListenersRef.current = () => {
          const remove = provider.off ?? provider.removeListener
          remove?.call(provider, 'disconnect', onDisconnect)
          remove?.call(provider, 'accountChanged', onAccountChange)
        }
        onAccountChange(address)
        return 'connected'
      }

      if (walletId === 'metamask' || walletId === 'coinbase' || walletId === 'trustwallet') {
        const name = walletName(walletId)
        const evmProviders = await discoverEvmProviders()
        if (!isCurrentAttempt()) return 'failed'
        let provider = findNamedEvmProvider(walletId, evmProviders)
        let metaMaskClient: Awaited<ReturnType<typeof getMetaMaskConnectClient>> | null = null
        let address = ''
        let activeChainId: unknown
        if (!provider && walletId === 'metamask') {
          metaMaskClient = await getMetaMaskConnectClient()
          pendingMetaMaskClientRef.current = metaMaskClient
          if (!isCurrentAttempt()) { await metaMaskClient.disconnect().catch(() => undefined); return 'failed' }
          const network = requestedNetworkId === 'ethereum' || requestedNetworkId === 'polygon' ? requestedNetworkId : 'bnb'
          // Mark the attempt before opening MetaMask. If Android evicts this tab
          // during the app switch, a fresh page load can restore the SDK session.
          metaMaskConnectAttempted = true
          try { window.localStorage.setItem('gm:metamask-connect-used', '1') } catch { /* restore is unavailable when storage is disabled */ }
          const result = await metaMaskClient.connect({ chainIds: [metaMaskChainId(network)], forceRequest: true })
          if (!isCurrentAttempt()) { await metaMaskClient.disconnect().catch(() => undefined); return 'failed' }
          provider = metaMaskClient.getProvider() as unknown as EvmProvider
          address = result.accounts[0] ?? ''
          activeChainId = result.chainId
        } else {
          if (!provider) throw new Error(`No se encontró ${name}. Instala o habilita su extensión e inténtalo de nuevo.`)
          const accounts = await provider.request({ method: 'eth_requestAccounts' })
          if (!isCurrentAttempt()) return 'failed'
          address = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : ''
          activeChainId = await provider.request({ method: 'eth_chainId' })
          if (!isCurrentAttempt()) return 'failed'
        }
        if (!address) throw new Error(`${name} no devolvió una dirección pública.`)
        let activeAddress = address
        const refreshConnection = () => updateConnection(makeConnection(walletId, name, 'EIP-1193', evmNetworkName(activeChainId), activeAddress, async () => {
          if (metaMaskClient) {
            try { window.localStorage.removeItem('gm:metamask-connect-used') } catch { /* storage can be disabled */ }
            await metaMaskClient.disconnect()
          }
        }, (quote) => sendEvmPayment(provider!, activeAddress, quote)))
        const onAccountsChanged = (next: unknown) => {
          const account = Array.isArray(next) && typeof next[0] === 'string' ? next[0] : ''
          activeAddress = account
          if (!activeAddress) updateConnection(null)
          else refreshConnection()
        }
        const onChainChanged = (next: unknown) => { activeChainId = next; refreshConnection() }
        provider.on?.('accountsChanged', onAccountsChanged)
        provider.on?.('chainChanged', onChainChanged)
        removeListenersRef.current = () => {
          provider.removeListener?.('accountsChanged', onAccountsChanged)
          provider.removeListener?.('chainChanged', onChainChanged)
        }
        refreshConnection()
        if (metaMaskClient && pendingMetaMaskClientRef.current === metaMaskClient) pendingMetaMaskClientRef.current = null
        return 'connected'
      }

      if (walletId === 'unisat') {
        const provider = window.unisat
        if (!provider) throw new Error('No se encontró UniSat. Instala o habilita su extensión para enviar BTC.')
        const accounts = await provider.requestAccounts()
        if (!isCurrentAttempt()) return 'failed'
        const address = accounts[0]
        if (!address) throw new Error('UniSat no devolvió una dirección pública.')
        let activeAddress = address
        let activeNetwork = await getUniSatNetwork(provider)
        if (!isCurrentAttempt()) return 'failed'
        const refreshConnection = () => updateConnection(makeConnection('unisat', 'UniSat', 'Bitcoin', `Bitcoin · ${activeNetwork}`, activeAddress, async () => undefined, async (quote) => {
          if (await getUniSatNetwork(provider) !== 'mainnet') throw new Error('Cambia UniSat a Bitcoin Mainnet y vuelve a revisar el pago.')
          const sats = Number(decimalUnits(quote.amount, 8))
          if (!Number.isSafeInteger(sats)) throw new Error('El importe BTC excede el rango admitido por UniSat.')
          return provider.sendBitcoin(quote.recipient, sats)
        }))
        const onAccountsChanged = (next: unknown) => {
          activeAddress = Array.isArray(next) && typeof next[0] === 'string' ? next[0] : ''
          if (!activeAddress) updateConnection(null)
          else refreshConnection()
        }
        provider.on?.('accountsChanged', onAccountsChanged)
        const onNetworkChanged = (next: unknown) => { activeNetwork = String(next ?? 'desconocida'); refreshConnection() }
        provider.on?.('networkChanged', onNetworkChanged)
        removeListenersRef.current = () => {
          provider.removeListener?.('accountsChanged', onAccountsChanged)
          provider.removeListener?.('networkChanged', onNetworkChanged)
        }
        refreshConnection()
        return 'connected'
      }

      if (walletId === 'tronlink') {
        const provider = window.tron
        if (!provider) throw new Error('No se encontró TronLink. Instala o habilita su extensión para enviar TRX.')
        const accounts = await provider.request({ method: 'eth_requestAccounts' })
        if (!isCurrentAttempt()) return 'failed'
        const address = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : provider.tronWeb && provider.tronWeb.defaultAddress?.base58
        if (!address) throw new Error('TronLink no devolvió una dirección pública.')
        let activeAddress = address
        let activeChainId: unknown = await provider.request({ method: 'eth_chainId' }).catch(() => null)
        if (!isCurrentAttempt()) return 'failed'
        const refreshConnection = () => updateConnection(makeTronProviderConnection(provider, activeAddress, activeChainId))
        const onAccountsChanged = (next: unknown) => {
          activeAddress = Array.isArray(next) && typeof next[0] === 'string' ? next[0] : ''
          if (!activeAddress) updateConnection(null)
          else refreshConnection()
        }
        const onChainChanged = (next: unknown) => { activeChainId = next; refreshConnection() }
        provider.on?.('accountsChanged', onAccountsChanged)
        provider.on?.('chainChanged', onChainChanged)
        removeListenersRef.current = () => {
          provider.removeListener?.('accountsChanged', onAccountsChanged)
          provider.removeListener?.('chainChanged', onChainChanged)
        }
        refreshConnection()
        return 'connected'
      }
      return 'failed'
    } catch (cause) {
      if (!isCurrentAttempt()) return 'failed'
      if (metaMaskConnectAttempted) {
        try { window.localStorage.removeItem('gm:metamask-connect-used') } catch { /* storage can be disabled */ }
      }
      pendingMetaMaskClientRef.current = null
      removeListenersRef.current?.()
      removeListenersRef.current = null
      const message = walletConnectErrorMessage(walletId, cause)
      const rejected = isWalletRejection(cause)
      setError(rejected ? 'La conexión fue rechazada en la wallet.' : message || 'No se pudo conectar la wallet.')
      updateConnection(null)
      return rejected ? 'rejected' : 'failed'
    } finally {
      if (isCurrentAttempt()) {
        manualConnectingRef.current = null
        setConnectingWallet(null)
      }
    }
  }, [disconnect, updateConnection])

  return { connection, restoringWallet, connectingWallet, error, connect, cancelConnect, disconnect, solflarePaymentReturn, consumeSolflarePaymentReturn, phantomPaymentReturn, consumePhantomPaymentReturn }
}

function makeConnection(
  id: WalletId,
  name: string,
  protocol: ConnectedWallet['protocol'],
  network: string,
  address: string,
  disconnectProvider: () => Promise<void> | void,
  sendPayment: (quote: PaymentQuote, context?: WalletPaymentContext) => Promise<string>,
  preparePayment?: (quote: PaymentQuote, context: WalletPaymentContext) => Promise<string>,
): ConnectedWallet {
  return { id, name, protocol, network, address, shortAddress: shorten(address), disconnectProvider: async () => disconnectProvider(), sendPayment, preparePayment }
}

function makeSolflareMobileConnection(session: SolflareMobileSession) {
  return makeConnection('solflare', 'Solflare', 'Solana', 'Solana · mainnet-beta', session.address,
    () => clearSolflareMobileSession(),
    async () => { throw new Error('Prepara la transacción y apruébala en la aplicación Solflare.') },
    async (quote, context) => {
      if (!context.returnUrl) throw new Error('Vuelve a conectar Solflare para preparar el pago.')
      const transaction = await buildUsdtTransfer(quote, session.address)
      const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false })
      return createSolflarePaymentUrl({
        target: context.returnUrl,
        transaction: serialized,
        quote,
        productName: context.productName,
        sender: session.address,
      })
    })
}

function makePhantomMobileConnection(session: PhantomMobileSession) {
  return makeConnection('phantom', 'Phantom', 'Solana', 'Solana · mainnet-beta', session.address,
    () => clearPhantomMobileSession(),
    async () => { throw new Error('Prepara la transacción y apruébala en la aplicación Phantom.') },
    async (quote, context) => {
      if (!context.returnUrl) throw new Error('Vuelve a conectar Phantom para preparar el pago.')
      const transaction = await buildUsdtTransfer(quote, session.address)
      const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false })
      return createPhantomPaymentUrl({
        target: context.returnUrl,
        transaction: serialized,
        quote,
        productName: context.productName,
        sender: session.address,
      })
    })
}

function makeSolanaProviderConnection(id: 'solflare' | 'phantom', name: string, provider: SolanaProvider, address: string) {
  return makeConnection(id, name, 'Solana', id === 'solflare' ? 'Solana · mainnet-beta' : 'Solana · red seleccionada en la wallet', address, async () => provider.disconnect?.(), async (quote) => {
    if (asAddress(provider.publicKey) !== address) throw new Error(`La cuenta de ${name} cambió; vuelve a revisar el pago.`)
    const transaction = await buildUsdtTransfer(quote, address)
    if (asAddress(provider.publicKey) !== address) throw new Error(`La cuenta de ${name} cambió al preparar el pago; vuelve a revisar el checkout.`)
    if (!provider.signAndSendTransaction) throw new Error(`${name} no permite enviar transacciones desde este proveedor.`)
    return signatureFrom(await provider.signAndSendTransaction(transaction))
  })
}

function makeEvmProviderConnection(id: 'metamask' | 'coinbase' | 'trustwallet', provider: EvmProvider, address: string, chainId: unknown) {
  return makeConnection(id, walletName(id), 'EIP-1193', evmNetworkName(chainId), address, async () => undefined, (quote) => sendEvmPayment(provider, address, quote))
}

function makeTronProviderConnection(provider: TronProvider, address: string, chainId: unknown) {
  const network = isTronMainnet(chainId) ? 'TRON · Mainnet' : 'TRON · red sin verificar'
  return makeConnection('tronlink', 'TronLink', 'TRON', network, address, async () => undefined, async (quote) => {
    if (quote.networkId !== 'tron') throw new Error('TronLink solo puede enviar pagos por la red TRON.')
    const currentChainId = await provider.request({ method: 'eth_chainId' }).catch(() => null)
    if (!isTronMainnet(currentChainId)) throw new Error('TronLink no confirma TRON Mainnet. Cambia a Mainnet y vuelve a revisar el pago.')
    const tronWeb = provider.tronWeb
    if (!tronWeb) throw new Error('TronLink no expuso tronWeb; vuelve a conectar la cartera.')
    if (tronWeb.defaultAddress?.base58 && tronWeb.defaultAddress.base58 !== address) throw new Error('La cuenta de TronLink cambió; vuelve a revisar el pago.')
    const sun = Number(decimalUnits(quote.amount, 6))
    if (!Number.isSafeInteger(sun)) throw new Error('El importe TRX excede el rango admitido.')
    const transaction = await tronWeb.transactionBuilder.sendTrx(quote.recipient, sun, address)
    const signed = await tronWeb.trx.sign(transaction)
    const result = await tronWeb.trx.sendRawTransaction(signed)
    if (!result.result) throw new Error('TronLink no pudo difundir la transferencia. No vuelvas a firmarla sin revisar su estado en TRON.')
    const hash = result.txid ?? result.transaction?.txID
    if (!hash) throw new Error('La transferencia se difundió, pero TronLink no devolvió su hash. Revisa la actividad de la wallet antes de intentar otra vez.')
    return hash
  })
}

function makeUniSatProviderConnection(provider: UniSatProvider, address: string, network: string) {
  return makeConnection('unisat', 'UniSat', 'Bitcoin', `Bitcoin · ${network}`, address, async () => undefined, async (quote) => {
    if (await getUniSatNetwork(provider) !== 'mainnet') throw new Error('Cambia UniSat a Bitcoin Mainnet y vuelve a revisar el pago.')
    const sats = Number(decimalUnits(quote.amount, 8))
    if (!Number.isSafeInteger(sats)) throw new Error('El importe BTC excede el rango admitido por UniSat.')
    return provider.sendBitcoin(quote.recipient, sats)
  })
}

async function buildUsdtTransfer(quote: PaymentQuote, senderAddress: string) {
  if (quote.networkId !== 'solana' || quote.asset !== 'USDT') throw new Error('Solana admite únicamente USDT SPL en este checkout.')
  const { PublicKey: PublicKeyConstructor, SystemProgram, Transaction, TransactionInstruction } = await import('@solana/web3.js')
  const SPL_TOKEN_PROGRAM_ID = new PublicKeyConstructor('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKeyConstructor('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
  const sender = new PublicKeyConstructor(senderAddress)
  const receiver = new PublicKeyConstructor(quote.recipient)
  const mint = new PublicKeyConstructor(SOLANA_USDT_MINT)
  const sourceAta = deriveAssociatedTokenAddress(sender, mint, PublicKeyConstructor, SPL_TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
  const destinationAta = deriveAssociatedTokenAddress(receiver, mint, PublicKeyConstructor, SPL_TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
  const transaction = new Transaction()
  transaction.add(new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: sender, isSigner: true, isWritable: true },
      { pubkey: destinationAta, isSigner: false, isWritable: true },
      { pubkey: receiver, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: solanaInstructionData(Uint8Array.of(1)),
  }))
  const amount = decimalUnits(quote.amount, 6)
  if (amount > 18_446_744_073_709_551_615n) throw new Error('El importe USDT supera el máximo de la instrucción SPL.')
  const transferData = new Uint8Array(10)
  transferData[0] = 12
  for (let index = 0; index < 8; index += 1) transferData[index + 1] = Number((amount >> BigInt(index * 8)) & 0xffn)
  transferData[9] = 6
  transaction.add(new TransactionInstruction({
    programId: SPL_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: sourceAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destinationAta, isSigner: false, isWritable: true },
      { pubkey: sender, isSigner: true, isWritable: false },
    ],
    data: solanaInstructionData(transferData),
  }))
  const latestBlockhash = await getLatestSolanaBlockhash()
  transaction.feePayer = sender
  transaction.recentBlockhash = latestBlockhash.blockhash
  return transaction
}

async function getLatestSolanaBlockhash() {
  const { Connection } = await import('@solana/web3.js')
  let lastError: unknown
  for (const endpoint of SOLANA_RPCS) {
    try {
      const connection = new Connection(endpoint, 'confirmed')
      return await connection.getLatestBlockhash('confirmed')
    } catch (error) {
      lastError = error
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? '')
  if (/\b403\b|access forbidden|forbidden/i.test(detail)) {
    throw new Error('Solflare sí está conectada, pero el RPC público de Solana rechazó la consulta del blockhash (HTTP 403). No se abrió la aprobación de la wallet ni se envió una transacción. El RPC público puede bloquear temporalmente una IP o un sitio; inténtalo más tarde.')
  }
  if (/\b429\b|too many requests|rate limit/i.test(detail)) {
    throw new Error('Solflare sí está conectada, pero el RPC público de Solana alcanzó su límite temporal. No se envió una transacción; espera un poco y vuelve a intentarlo.')
  }
  throw new Error(`No se pudo obtener un blockhash de Solana desde los RPC públicos. No se envió una transacción.${detail ? ` Detalle: ${detail}` : ''}`)
}

function solanaInstructionData(data: Uint8Array): Buffer {
  // web3.js declares instruction data as Node Buffer although it only needs bytes.
  return data as unknown as Buffer
}

function deriveAssociatedTokenAddress(owner: PublicKey, mint: PublicKey, PublicKeyConstructor: typeof import('@solana/web3.js').PublicKey, tokenProgramId: PublicKey, associatedTokenProgramId: PublicKey) {
  return PublicKeyConstructor.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId,
  )[0]
}

async function sendEvmPayment(provider: EvmProvider, from: string, quote: PaymentQuote) {
  const expectedChain = evmChainId(quote.networkId)
  if (!expectedChain) throw new Error('La red seleccionada no es EVM.')
  const actual = String(await provider.request({ method: 'eth_chainId' }))
  const actualNumber = actual.startsWith('0x') ? Number.parseInt(actual, 16) : Number(actual)
  if (actualNumber !== expectedChain) throw new Error(`La wallet está en chainId ${actualNumber}; cambia a ${quote.networkName} (${expectedChain}) y vuelve a revisar el pago.`)
  const accounts = await provider.request({ method: 'eth_accounts' })
  const activeAddress = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : ''
  if (!activeAddress || activeAddress.toLowerCase() !== from.toLowerCase()) throw new Error('La cuenta EVM activa cambió; vuelve a revisar el pago.')
  const value = decimalUnits(quote.amount, 18)
  const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from, to: quote.recipient, value: `0x${value.toString(16)}` }] })
  if (typeof hash !== 'string' || !hash) throw new Error('La wallet no devolvió el hash de la transacción.')
  return hash
}

function evmChainId(networkId: PaymentNetworkId) {
  if (networkId === 'ethereum') return 1
  if (networkId === 'bnb') return 56
  if (networkId === 'polygon') return 137
  return null
}

function decimalUnits(amount: string, decimals: number) {
  if (!/^\d+(?:\.\d+)?$/.test(amount)) throw new Error('El importe tiene un formato no válido.')
  const [whole, fraction = ''] = amount.split('.')
  if (fraction.length > decimals) throw new Error('El importe tiene demasiados decimales para esta red.')
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')
}

async function getUniSatNetwork(provider: UniSatProvider) {
  const chain = await provider.getChain?.()
  if (chain?.enum) return chain.enum === 'BITCOIN_MAINNET' ? 'mainnet' : chain.enum.toLowerCase()
  const network = await provider.getNetwork?.()
  return network === 'livenet' ? 'mainnet' : network ?? 'desconocida'
}

async function discoverEvmProviders(): Promise<Eip6963Provider[]> {
  const announced: Eip6963Provider[] = []
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963Provider>).detail
    if (detail?.provider && !announced.some((item) => item.info?.uuid && item.info.uuid === detail.info?.uuid)) announced.push(detail)
  }
  window.addEventListener('eip6963:announceProvider', handler)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  // Mobile wallet webviews can announce their injected provider later than a
  // desktop extension. Give the in-app provider time to appear before falling
  // back to a remote MetaMask Connect handoff.
  await new Promise((resolve) => window.setTimeout(resolve, 500))
  window.removeEventListener('eip6963:announceProvider', handler)
  const trustWalletProvider = window.trustwallet?.ethereum
  if (trustWalletProvider && !announced.some((item) => item.provider === trustWalletProvider)) {
    // Trust Wallet's documented legacy injection does not always expose EIP-6963
    // metadata or a brand flag; the namespaced property identifies its provider.
    announced.push({ info: { name: 'Trust Wallet', rdns: 'com.trustwallet.app' }, provider: trustWalletProvider })
  }
  const injected = [
    ...(window.ethereum?.providers ?? []),
    ...(window.ethereum ? [window.ethereum] : []),
    ...(window.coinbaseWalletExtension ? [window.coinbaseWalletExtension] : []),
  ]
  for (const provider of injected) if (!announced.some((item) => item.provider === provider)) announced.push({ provider })
  return announced
}

function findNamedEvmProvider(walletId: 'metamask' | 'coinbase' | 'trustwallet', providers: Eip6963Provider[]) {
  if (walletId === 'metamask') return providers.find(({ info, provider }) => info?.rdns?.toLowerCase() === 'io.metamask' || (provider.isMetaMask && !provider.isCoinbaseWallet))?.provider
  if (walletId === 'trustwallet') return providers.find(({ info, provider }) => info?.rdns?.toLowerCase() === 'com.trustwallet.app' || provider.isTrust === true || provider.isTrustWallet === true)?.provider
  return providers.find(({ info, provider }) => info?.rdns?.toLowerCase() === 'com.coinbase.wallet' || provider.isCoinbaseWallet)?.provider
}

function walletName(id: 'metamask' | 'coinbase' | 'trustwallet') {
  return id === 'metamask' ? 'MetaMask' : id === 'coinbase' ? 'Coinbase Wallet' : 'Trust Wallet'
}

function evmNetworkName(chainId: unknown) {
  const value = String(chainId ?? '')
  const id = value.startsWith('0x') ? Number.parseInt(value, 16) : Number(value)
  const name = id === 1 ? 'Ethereum' : id === 56 ? 'BNB Chain' : id === 137 ? 'Polygon' : ''
  return `EVM · ${name || `chainId ${Number.isFinite(id) ? id : value}`}`
}

function isTronMainnet(chainId: unknown) {
  const value = chainId && typeof chainId === 'object' && 'chainId' in chainId
    ? String((chainId as { chainId?: unknown }).chainId ?? '')
    : String(chainId ?? '')
  const normalized = value.toLowerCase()
  return normalized === '0x2b6653dc' || Number(normalized) === 728126428
}

function asAddress(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (!value || typeof value !== 'object' || !('toString' in value)) return null
  const address = String(value)
  return address && address !== '[object Object]' ? address : null
}

function signatureFrom(result: string | { signature?: string }) {
  const signature = typeof result === 'string' ? result : result.signature
  if (!signature) throw new Error('La wallet no devolvió la firma de la transacción.')
  return signature
}

function walletConnectErrorMessage(walletId: WalletId, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (walletId === 'metamask' && /cannot read properties of undefined.*create/i.test(message)) {
    return 'MetaMask Connect no pudo iniciar la conexión. Actualiza la página, confirma que el dominio HTTPS sea accesible y vuelve a intentarlo. No se envió ningún pago.'
  }
  return message
}

function shorten(address: string) {
  return address.length > 16 ? `${address.slice(0, 7)}…${address.slice(-6)}` : address
}
