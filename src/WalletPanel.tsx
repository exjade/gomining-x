import { useState } from 'react'
import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react'
import { useAccount, useBalance } from 'wagmi'
import type { WalletId, WalletSession } from './walletSession'
import type { PaymentNetworkId } from './paymentDestinations'

const directWallets: Array<{
  id: WalletId
  name: string
  icon: string
  protocol: string
  description: string
  badge: string
  networks: string
  defaultNetwork?: PaymentNetworkId
}> = [
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: '🦊',
    protocol: 'EVM · Extensión y Móvil',
    description: 'Conecta directamente con la extensión MetaMask o app. Paga en BNB Chain, Ethereum o Polygon.',
    badge: 'EVM',
    networks: 'BSC · ETH · POL',
    defaultNetwork: 'bnb',
  },
  {
    id: 'phantom',
    name: 'Phantom',
    icon: '👻',
    protocol: 'Solana · Inyectada y Mobile',
    description: 'Conexión directa para Solana. Paga con USDT SPL o SOL.',
    badge: 'SOLANA',
    networks: 'USDT · SOL',
    defaultNetwork: 'solana',
  },
  {
    id: 'solflare',
    name: 'Solflare',
    icon: '🔆',
    protocol: 'Solana · Cifrado Nativo',
    description: 'Conexión directa mediante deeplink cifrado o extensión. Paga en USDT SPL.',
    badge: 'SOLANA',
    networks: 'USDT SPL',
    defaultNetwork: 'solana',
  },
  {
    id: 'trustwallet',
    name: 'Trust Wallet',
    icon: '🛡️',
    protocol: 'EVM · DApp y Universal Link',
    description: 'Conecta en el navegador DApp o enlace universal. Paga en BSC, ETH o Polygon.',
    badge: 'EVM',
    networks: 'BSC · ETH · POL',
    defaultNetwork: 'bnb',
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    icon: '🔵',
    protocol: 'EVM · SDK Oficial',
    description: 'Conexión directa mediante Coinbase Wallet SDK y extensión.',
    badge: 'EVM',
    networks: 'BSC · ETH · POL',
    defaultNetwork: 'bnb',
  },
  {
    id: 'unisat',
    name: 'UniSat',
    icon: '₿',
    protocol: 'Bitcoin · Extensión',
    description: 'Conexión directa con la extensión para pagos con BTC en Bitcoin Mainnet.',
    badge: 'BITCOIN',
    networks: 'BTC',
  },
  {
    id: 'tronlink',
    name: 'TronLink',
    icon: '🔴',
    protocol: 'TRON · Extensión y DApp',
    description: 'Conexión directa con TronLink para pagos con TRX en red TRON.',
    badge: 'TRON',
    networks: 'TRX',
  },
]

export function WalletPanel({ session }: { session?: WalletSession }) {
  const { open } = useAppKit()
  const { address: appKitAddress, isConnected: isAppKitConnected } = useAppKitAccount()
  const { address: wagmiAddress, isConnected: isWagmiConnected, chain } = useAccount()
  const { disconnect: disconnectWagmi } = useDisconnect()

  const [copied, setCopied] = useState(false)

  const activeAddress = wagmiAddress || appKitAddress || session?.connection?.address || ''
  const isConnected = isWagmiConnected || isAppKitConnected || Boolean(session?.connection)
  const currentNetwork = chain?.name ?? (session?.connection?.network ?? 'Red Web3')
  const connectedWalletId = session?.connection?.id

  const { data: balanceData } = useBalance({
    address: wagmiAddress,
  })

  const handleCopy = async () => {
    if (!activeAddress) return
    try {
      await navigator.clipboard.writeText(activeAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnectWagmi()
    } catch {
      // Ignore
    }
    if (session?.disconnect) {
      await session.disconnect()
    }
  }

  const handleDirectConnect = async (walletId: WalletId, networkId?: PaymentNetworkId) => {
    if (!session?.connect) return
    await session.connect(walletId, networkId)
  }

  return (
    <div className="wallet-panel-container">
      <div className="wallet-card-header">
        <div>
          <h2>Carteras Web3</h2>
          <p className="wallet-panel-desc">
            Conexión directa nativa con extensiones y móviles, más selector universal compatible con más de 300 billeteras.
          </p>
        </div>
        <div className="wallet-header-actions">
          {isConnected && (
            <button
              type="button"
              className="button button-secondary"
              onClick={handleDisconnect}
            >
              Desconectar
            </button>
          )}
        </div>
      </div>

      {session?.error && (
        <div className="wallet-error" role="alert" style={{ marginBottom: 16 }}>
          {session.error}
        </div>
      )}

      {session?.connectingWallet && (
        <div className="wallet-connect-pending" role="status" style={{ marginBottom: 16 }}>
          Confirma la solicitud en tu billetera ({session.connectingWallet}). No se enviará ningún pago al conectar.
        </div>
      )}

      {isConnected && (
        <div className="connected-wallet-card" style={{ marginBottom: 24 }}>
          <div className="wallet-status-badge">
            <span className="status-indicator-green" /> Conectada ({session?.connection?.name ?? 'Web3'})
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
                  {copied ? 'Copiado ✓' : 'Copiar 📋'}
                </button>
              </div>
            </div>

            <div className="wallet-info-item">
              <span className="wallet-info-label">Red actual:</span>
              <strong className="network-pill">{currentNetwork}</strong>
            </div>

            {balanceData && (
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
              Cambiar de Red 🌐
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => open()}
            >
              Ver en AppKit Modal
            </button>
          </div>
        </div>
      )}

      {/* Universal AppKit Banner */}
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
          marginBottom: 20,
        }}
      >
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.06em' }}>
            WALLETCONNECT V2 · UNIVERSAL
          </span>
          <h3 style={{ margin: '4px 0 2px', fontSize: 16, color: '#f8fafc' }}>
            Conexión Universal (QR Móvil y +300 Wallets)
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
            Escanea con cualquier app móvil (Trust Wallet, Rainbow, Zerion, Ledger, Safe) o conéctate vía WalletConnect.
          </p>
        </div>
        <button
          type="button"
          className="button button-primary"
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => open()}
        >
          Abrir Selector Universal ⚡
        </button>
      </div>

      {/* Direct Wallets Grid */}
      <div>
        <h3 style={{ fontSize: 15, color: '#cbd5e1', marginBottom: 12, fontWeight: 600 }}>
          Conexión Directa por Billetera (Sin Relays)
        </h3>
        <div className="wallet-options-grid">
          {directWallets.map((wallet) => {
            const isThisConnected = connectedWalletId === wallet.id
            const isConnecting = session?.connectingWallet === wallet.id

            return (
              <div
                key={wallet.id}
                className={`wallet-option ${isThisConnected ? 'wallet-option-connected' : ''}`}
              >
                <div className="wallet-option-icon">{wallet.icon}</div>
                <div className="wallet-option-copy">
                  <div className="wallet-option-heading">
                    <h3>{wallet.name}</h3>
                    <span>{wallet.badge}</span>
                  </div>
                  <small>{wallet.protocol} · {wallet.networks}</small>
                  <p>{wallet.description}</p>
                </div>
                <button
                  type="button"
                  className={isThisConnected ? 'button button-secondary' : 'button button-primary'}
                  disabled={Boolean(session?.connectingWallet) || isThisConnected}
                  onClick={() => handleDirectConnect(wallet.id, wallet.defaultNetwork)}
                >
                  {isConnecting
                    ? 'Conectando…'
                    : isThisConnected
                    ? 'Conectada ✓'
                    : `Conectar ${wallet.name}`}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
