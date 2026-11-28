import { useState } from 'react'
import { useAppKit, useAppKitAccount, useAppKitNetwork, useDisconnect } from '@reown/appkit/react'
import { useAccount, useBalance } from 'wagmi'
import { useAuth } from './AuthContext'
import { ClientPaymentHistory } from './components/payments/ClientPaymentHistory'
import { resolveActiveMultichainWallet } from './services/payments/checkoutIntentCoordinator'
import { disconnectWeb3SessionBestEffort } from './services/session/accountSessionIsolation'
import type { WalletSession } from './walletSession'

export function WalletPanel({ session }: { session?: WalletSession }) {
  const { user } = useAuth()
  const { open } = useAppKit()
  const { address: appKitAddress, caipAddress: appKitCaipAddress, isConnected: isAppKitConnected } = useAppKitAccount()
  const tronAppKitAccount = useAppKitAccount({ namespace: 'tron' })
  const { caipNetwork } = useAppKitNetwork()
  const { address: wagmiAddress, isConnected: isWagmiConnected, chain } = useAccount()
  const { disconnect: disconnectAppKit } = useDisconnect()

  const [copied, setCopied] = useState(false)
  const authenticatedUid = user && !user.isAnonymous ? user.uid : ''

  const resolvedWallet = resolveActiveMultichainWallet({
    appKitAddress,
    isAppKitConnected,
    appKitCaipAddress,
    caipNamespace: caipNetwork?.chainNamespace,
    wagmiAddress,
    isWagmiConnected,
    fallbackAddress: session?.connection?.address,
    tronAppKitAddress: tronAppKitAccount.address,
    isTronAppKitConnected: tronAppKitAccount.isConnected,
    tronAppKitCaipAddress: tronAppKitAccount.caipAddress,
  })
  const activeAddress = resolvedWallet.activeAddress
  const isConnected = resolvedWallet.isWalletConnected
  const isEvmActive = resolvedWallet.isEvmWallet
  const isTronActive = resolvedWallet.isTronWallet
  const currentNetwork = isEvmActive
    ? (chain?.name ?? caipNetwork?.name ?? session?.connection?.network ?? 'EVM')
    : isTronActive
      ? (caipNetwork?.name ?? session?.connection?.network ?? 'TRON')
      : (caipNetwork?.name ?? session?.connection?.network ?? 'Solana')

  const { data: balanceData } = useBalance({
    address: isEvmActive ? (activeAddress as `0x${string}`) : undefined,
  })

  const handleCopy = async () => {
    if (!activeAddress) return
    try {
      await navigator.clipboard.writeText(activeAddress)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable
    }
  }

  const handleDisconnect = async () => {
    if (session?.disconnect) {
      await session.disconnect()
      return
    }
    await disconnectWeb3SessionBestEffort({
      disconnectAppKit: () => disconnectAppKit(),
      clearOwnerStorage: true,
    })
  }

  return (
    <div className="wallet-panel-container f5-wallet-panel" data-testid="f5-wallet-panel">
      <div className="wallet-card-header f5-glass-card">
        <div>
          <p className="eyebrow">MULTICHAIN · REOWN APPKIT</p>
          <h2>Cartera Web3 (Reown AppKit)</h2>
          <p className="wallet-panel-desc">
            Conecta o gestiona tu billetera EVM, Solana o TRON de forma segura mediante el selector unificado Reown AppKit (MetaMask, Phantom, Solflare, Trust Wallet, OKX, TronLink vía WalletConnect y +300 wallets).
          </p>
        </div>
        <div className="wallet-header-actions">
          {isConnected ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={handleDisconnect}
            >
              Desconectar
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              onClick={() => open()}
            >
              Conectar Wallet
            </button>
          )}
        </div>
      </div>

      {isConnected && (
        <div className="connected-wallet-card f5-glass-card">
          <div className="wallet-status-badge">
            <span className="status-indicator-green" /> Conectada vía Reown AppKit
          </div>

          <div className="wallet-info-grid">
            <div className="wallet-info-item">
              <span className="wallet-info-label">Dirección:</span>
              <div className="wallet-address-row">
                <code>{activeAddress}</code>
                <button
                  type="button"
                  className="button button-outline-sm"
                  onClick={handleCopy}
                >
                  {copied ? 'Copiado ✓' : 'Copiar'}
                </button>
              </div>
            </div>

            <div className="wallet-info-item">
              <span className="wallet-info-label">Red actual:</span>
              <strong className="network-pill">{currentNetwork}</strong>
            </div>

            {isEvmActive && balanceData && (
              <div className="wallet-info-item">
                <span className="wallet-info-label">Saldo:</span>
                <strong>
                  {Number(balanceData.formatted).toFixed(4)} {balanceData.symbol}
                </strong>
              </div>
            )}
          </div>

          <div className="wallet-management-buttons">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => open({ view: 'Networks' })}
            >
              Cambiar de Red
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => open()}
            >
              Gestionar Wallet
            </button>
          </div>
        </div>
      )}

      <div className="wallet-universal-banner f5-glass-card">
        <div className="wallet-universal-copy">
          <span className="wallet-universal-kicker">
            REOWN APPKIT · EVM, SOLANA &amp; TRON
          </span>
          <h3>
            Conexión Unificada (+300 Wallets y QR Móvil)
          </h3>
          <p>
            Compatible con MetaMask, Phantom, Solflare, Trust Wallet, Coinbase Wallet y WalletConnect v2.
          </p>
        </div>
        <button
          type="button"
          className="button button-primary wallet-universal-cta"
          onClick={() => open()}
        >
          {isConnected ? 'Gestionar en Reown AppKit' : 'Conectar con Reown AppKit'}
        </button>
      </div>

      {authenticatedUid ? <ClientPaymentHistory uid={authenticatedUid} /> : null}
    </div>
  )
}
