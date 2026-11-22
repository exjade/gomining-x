import { useCallback, useMemo } from 'react'
import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react'
import { useAccount } from 'wagmi'
import type { PaymentNetworkId } from './paymentDestinations'
import type { PaymentQuote } from './paymentQuote'

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
  const { address: appKitAddress, isConnected: isAppKitConnected, status: appKitStatus } = useAppKitAccount()
  const { address: wagmiAddress, isConnected: isWagmiConnected, chain } = useAccount()
  const { disconnect: appKitDisconnect } = useDisconnect()

  const activeAddress = wagmiAddress || appKitAddress || ''
  const isConnected = Boolean(activeAddress && (isWagmiConnected || isAppKitConnected))

  const disconnect = useCallback(async () => {
    await appKitDisconnect()
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
    const isEvm = activeAddress.startsWith('0x') || isWagmiConnected
    return {
      id: 'reown',
      name: isEvm ? (chain?.name ?? 'Reown AppKit (EVM)') : 'Reown AppKit (Solana)',
      protocol: isEvm ? 'EIP-1193' : 'Solana',
      network: isEvm ? (chain?.name ?? 'EVM') : 'Solana',
      address: activeAddress,
      shortAddress: formatShortAddress(activeAddress),
      disconnectProvider: disconnect,
      sendPayment: async () => {
        throw new Error('Los pagos Web3 deben ejecutarse desde el checkout oficial con Reown AppKit.')
      },
    }
  }, [isConnected, activeAddress, isWagmiConnected, chain?.name, disconnect])

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
