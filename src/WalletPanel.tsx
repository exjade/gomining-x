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
    <div className="wallet-panel-container">
      <div className="wallet-card-header">
        <div>
          <h2>Cartera Web3 · PouwMiner</h2>
          <p className="wallet-panel-desc">
            Conecta o gestiona tu billetera EVM, Solana o TRON de forma segura en la pasarela de pagos de PouwMiner (MetaMask, Phantom, Solflare, Trust Wallet, OKX, TronLink y +300 wallets).
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
        <div className="connected-wallet-card" style={{ marginBottom: 24 }}>
          <div className="wallet-status-badge">
            <span className="status-indicator-green" /> Billetera conectada
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

      <div
        style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(15,23,42,0.4))',
          border: '1px solid rgba(124,58,237,0.3)',
          borderRadius: 14,
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.06em' }}>
            PASARELA POUWMINER · EVM, SOLANA &amp; TRON
          </span>
          <h3 style={{ margin: '4px 0 2px', fontSize: 16, color: '#f8fafc' }}>
            Conexión Unificada (+300 Wallets y QR Móvil)
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
            Compatible con MetaMask, Phantom, Solflare, Trust Wallet, Coinbase Wallet y WalletConnect v2.
          </p>
        </div>
        <button
          type="button"
          className="button button-primary"
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => open()}
        >
          {isConnected ? 'Gestionar Billetera' : 'Conectar Billetera'}
        </button>
      </div>

      {authenticatedUid ? <ClientPaymentHistory uid={authenticatedUid} /> : null}
    </div>
  )
}
