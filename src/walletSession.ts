import { useCallback, useMemo } from 'react'
import { useAppKit, useAppKitAccount, useAppKitNetwork, useDisconnect } from '@reown/appkit/react'
import { useAccount } from 'wagmi'
import type { PaymentNetworkId } from './paymentDestinations'
import type { PaymentQuote } from './paymentQuote'
import { resolveActiveMultichainWallet } from './services/payments/checkoutIntentCoordinator'
import { disconnectWeb3SessionBestEffort } from './services/session/accountSessionIsolation'

export type WalletId =
  | 'reown'
  | 'solflare'
  | 'phantom'
  | 'metamask'
  | 'coinbase'
  | 'trustwallet'
  | 'keplr'
  | 'tronlink'
  | 'unisat'

export type WalletPaymentContext = { productName: string; returnUrl: string }

export type ConnectedWallet = {
  id: WalletId
  name: string
  protocol: 'Solana' | 'EIP-1193' | 'Bitcoin' | 'TRON' | 'Cosmos'
  network: string
  address: string
  shortAddress: string
  disconnectProvider: () => Promise<void>
  sendPayment: (quote: PaymentQuote, context?: WalletPaymentContext) => Promise<string>
}

export type WalletSession = {
  connection: ConnectedWallet | null
  restoringWallet: boolean
  connectingWallet: WalletId | null
  error: string
  open: () => void
  connect: (_walletId?: WalletId, _networkId?: PaymentNetworkId, _returnUrl?: string) => Promise<'connected' | 'rejected' | 'failed' | 'pending'>
  cancelConnect: () => void
  disconnect: () => Promise<void>
}

function formatShortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address
}

/** Thin Reown AppKit + Wagmi session adapter (ADR-0006: Reown AppKit Only). */
export function useWalletSession(): WalletSession {
  const { open } = useAppKit()
  const { address: appKitAddress, caipAddress: appKitCaipAddress, isConnected: isAppKitConnected, status: appKitStatus } = useAppKitAccount()
  const tronAccount = useAppKitAccount({ namespace: 'tron' })
  const { caipNetwork } = useAppKitNetwork()
  const { address: wagmiAddress, isConnected: isWagmiConnected, chain } = useAccount()
  const { disconnect: appKitDisconnect } = useDisconnect()

  const { activeAddress, isWalletConnected: isConnected, isEvmWallet: isEvm, isTronWallet: isTron } = resolveActiveMultichainWallet({
    appKitAddress,
    isAppKitConnected,
    appKitCaipAddress,
    caipNamespace: caipNetwork?.chainNamespace,
    wagmiAddress,
    isWagmiConnected,
    tronAppKitAddress: tronAccount.address,
    isTronAppKitConnected: tronAccount.isConnected,
    tronAppKitCaipAddress: tronAccount.caipAddress,
  })

  const disconnect = useCallback(async () => {
    await disconnectWeb3SessionBestEffort({
      disconnectAppKit: () => appKitDisconnect(),
      clearOwnerStorage: true,
    })
  }, [appKitDisconnect])

  const openModal = useCallback(() => {
    void open()
  }, [open])

  const connect = useCallback(async (): Promise<'connected' | 'rejected' | 'failed' | 'pending'> => {
    await open()
    return isConnected ? 'connected' : 'pending'
  }, [open, isConnected])

  const cancelConnect = useCallback(() => {}, [])

  const connection = useMemo<ConnectedWallet | null>(() => {
    if (!isConnected || !activeAddress) return null
    const networkLabel = isEvm
      ? (chain?.name ?? caipNetwork?.name ?? 'EVM')
      : isTron
        ? (caipNetwork?.name ?? 'TRON')
        : (caipNetwork?.name ?? 'Solana')
    return {
      id: 'reown',
      name: isEvm
        ? (chain?.name ?? caipNetwork?.name ?? 'Reown AppKit (EVM)')
        : isTron
          ? 'Reown AppKit (TRON)'
          : 'Reown AppKit (Solana)',
      protocol: isEvm ? 'EIP-1193' : isTron ? 'TRON' : 'Solana',
      network: networkLabel,
      address: activeAddress,
      shortAddress: formatShortAddress(activeAddress),
      disconnectProvider: disconnect,
      sendPayment: async () => {
        throw new Error('Los pagos Web3 deben ejecutarse desde el checkout oficial con Reown AppKit.')
      },
    }
  }, [isConnected, activeAddress, isEvm, isTron, chain?.name, caipNetwork?.name, disconnect])

  return useMemo<WalletSession>(() => ({
    connection,
    restoringWallet: appKitStatus === 'reconnecting',
    connectingWallet: null,
    error: '',
    open: openModal,
    connect,
    cancelConnect,
    disconnect,
  }), [connection, appKitStatus, openModal, connect, cancelConnect, disconnect])
}
