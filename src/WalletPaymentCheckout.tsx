import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount, useSendTransaction, useWriteContract, useSwitchChain } from 'wagmi'
import { parseEther, parseUnits } from 'viem'
import { useAppKit, useAppKitAccount, useAppKitNetwork } from '@reown/appkit/react'
import { PAYMENT_DESTINATIONS, USDT_CONTRACTS, type PaymentNetworkId } from './paymentDestinations'
import { fetchPaymentQuote, formatAssetAmount, formatCatalogPrice, formatUsd, type PaymentAsset, type PaymentCurrency, type PaymentQuote } from './paymentQuote'
import { CryptoIcon, type CryptoSymbol } from './CryptoIcon'
import { QuoteDetailsSkeleton } from './Skeletons'
import { buildSolanaPaymentTransaction } from './solanaPayment'
import { registerWalletMinerPurchase } from './demoStore'
import { startMiningSimulation } from './miningSimulation'
import type { WalletId, WalletSession } from './walletSession'

export type PaymentReceipt = {
  id: string
  productName: string
  quote: PaymentQuote
  sender: string
  transactionHash: string
  sourceStatus: 'submitted'
  bridgeStatus: 'pending' | 'not-applicable'
  sentAt: number
  explorerUrl: string
  minerId?: string
}

export const networks: Array<{ id: PaymentNetworkId; label: string; chainId: number; icon: CryptoSymbol }> = [
  { id: 'bnb', label: 'BNB Chain · BSC', chainId: 56, icon: 'BNB' },
  { id: 'ethereum', label: 'Ethereum · ETH', chainId: 1, icon: 'ETH' },
  { id: 'polygon', label: 'Polygon · POL', chainId: 137, icon: 'POL' },
  { id: 'solana', label: 'Solana · SOL/USDT', chainId: 0, icon: 'SOL' },
]

export const walletOptions: Record<PaymentNetworkId, Array<{ id: WalletId; name: string }>> = {
  bnb: [{ id: 'metamask', name: 'MetaMask' }, { id: 'trustwallet', name: 'Trust Wallet' }, { id: 'coinbase', name: 'Coinbase Wallet' }],
  ethereum: [{ id: 'metamask', name: 'MetaMask' }, { id: 'trustwallet', name: 'Trust Wallet' }, { id: 'coinbase', name: 'Coinbase Wallet' }],
  polygon: [{ id: 'metamask', name: 'MetaMask' }, { id: 'trustwallet', name: 'Trust Wallet' }, { id: 'coinbase', name: 'Coinbase Wallet' }],
  solana: [{ id: 'phantom', name: 'Phantom' }, { id: 'solflare', name: 'Solflare' }],
}

export const initialWallet: Record<PaymentNetworkId, WalletId> = {
  bnb: 'metamask',
  ethereum: 'metamask',
  polygon: 'metamask',
  solana: 'phantom',
}

export function networkForConnection(connection: { id?: string; network?: string } | null): PaymentNetworkId {
  if (!connection) return 'bnb'
  if (connection.id === 'phantom' || connection.id === 'solflare') return 'solana'
  if (connection.network?.toLowerCase().includes('poly')) return 'polygon'
  if (connection.network?.toLowerCase().includes('eth')) return 'ethereum'
  return 'bnb'
}

const NATIVE_SYMBOL_BY_NETWORK: Record<PaymentNetworkId, PaymentAsset> = {
  bnb: 'BNB',
  ethereum: 'ETH',
  polygon: 'POL',
  solana: 'SOL',
}

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export function WalletPaymentCheckout({
  productName,
  amount,
  currency,
  initialNetworkId = 'bnb',
  session,
  onClose,
  onPaid,
}: {
  productName: string
  amount: number
  currency: PaymentCurrency
  initialNetworkId?: PaymentNetworkId
  initialWalletId?: string
  session?: WalletSession
  onClose: (requestPending?: boolean, notice?: string) => void
  onResumeWalletConnect?: (url: string) => void
  onPaid: (receipt: PaymentReceipt) => void
}) {
  const navigate = useNavigate()
  const { open: openAppKit } = useAppKit()
  const appKitAccount = useAppKitAccount()
  const { switchNetwork, chainId: appKitChainId } = useAppKitNetwork()
  const { address: evmAddress, isConnected: isEvmConnected, chainId: wagmiChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()
  const { writeContractAsync } = useWriteContract()

  const [networkId, setNetworkId] = useState<PaymentNetworkId>(initialNetworkId)
  const [useUsdt, setUseUsdt] = useState(false)
  const [quote, setQuote] = useState<PaymentQuote | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null)
  const [copyStatus, setCopyStatus] = useState('')

  const activeDestination = PAYMENT_DESTINATIONS.find((d) => d.id === networkId) ?? PAYMENT_DESTINATIONS[0]
  const selectedAsset: PaymentAsset = useUsdt ? 'USDT' : NATIVE_SYMBOL_BY_NETWORK[networkId]

  // Determine connected address across EVM, AppKit and Direct Session
  const directAddress = session?.connection?.address || ''
  const activeAddress = evmAddress || appKitAccount.address || directAddress || ''
  const isWalletConnected = Boolean(activeAddress && (isEvmConnected || appKitAccount.isConnected || Boolean(session?.connection)))

  const isSolana = networkId === 'solana'
  const isEvmChain = !isSolana
  const numericChainId = Number(wagmiChainId || appKitChainId || (session?.connection?.network.includes('BNB') ? 56 : session?.connection?.network.includes('Polygon') ? 137 : session?.connection?.network.includes('Ethereum') ? 1 : 0)) || 0
  const isWrongEvmChain = isEvmChain && isWalletConnected && numericChainId > 0 && numericChainId !== activeDestination.chainId

  const refreshQuote = useCallback(async () => {
    setLoadingQuote(true)
    setError('')
    try {
      const q = await fetchPaymentQuote(amount, currency, networkId, selectedAsset)
      setQuote(q)
    } catch (err) {
      setQuote(null)
      setError(err instanceof Error ? err.message : 'Error al cotizar el pago.')
    } finally {
      setLoadingQuote(false)
    }
  }, [amount, currency, networkId, selectedAsset])

  useEffect(() => {
    void refreshQuote()
  }, [refreshQuote])

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('Copiado al portapapeles')
      setTimeout(() => setCopyStatus(''), 2500)
    } catch {
      setCopyStatus('No se pudo copiar automáticamente')
    }
  }

  const handleSwitchNetwork = async () => {
    try {
      if (switchChainAsync) {
        await switchChainAsync({ chainId: activeDestination.chainId })
      } else if (switchNetwork) {
        await switchNetwork(activeDestination.chainId as never)
      }
    } catch (err) {
      setError('Por favor confirma el cambio de red en tu billetera.')
    }
  }

  const handlePay = async () => {
    if (!quote) return
    setError('')
    setPaying(true)

    try {
      let txHash = ''

      if (isSolana) {
        // Solana payment logic
        const target = window as unknown as { solana?: { signAndSendTransaction?: (tx: unknown) => Promise<{ signature?: string } | string> } }
        if (target.solana?.signAndSendTransaction) {
          const tx = await buildSolanaPaymentTransaction(activeAddress, quote.recipient, quote)
          const res = await target.solana.signAndSendTransaction(tx)
          txHash = typeof res === 'string' ? res : res.signature ?? ''
        } else if (session?.connection?.protocol === 'Solana') {
          txHash = await session.connection.sendPayment(quote)
        } else {
          throw new Error('Abre tu wallet de Solana (Phantom / Solflare) o conéctala mediante el modal para autorizar.')
        }
      } else {
        // EVM payment logic
        const recipient = quote.recipient as `0x${string}`

        if (useUsdt) {
          // ERC-20 USDT transfer
          const tokenAddress = USDT_CONTRACTS[networkId].address as `0x${string}`
          const amountUnits = parseUnits(quote.amount, quote.decimals)
          if (isEvmConnected && writeContractAsync) {
            txHash = await writeContractAsync({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: 'transfer',
              args: [recipient, amountUnits],
            })
          } else if (session?.connection) {
            txHash = await session.connection.sendPayment(quote)
          } else {
            throw new Error('No hay una wallet EVM conectada para autorizar el pago en USDT.')
          }
        } else {
          // Native transfer (BNB, ETH, POL)
          const valueUnits = parseEther(quote.amount)
          if (isEvmConnected && sendTransactionAsync) {
            txHash = await sendTransactionAsync({
              to: recipient,
              value: valueUnits,
            })
          } else if (session?.connection) {
            txHash = await session.connection.sendPayment(quote)
          } else {
            throw new Error('No hay una wallet EVM conectada para autorizar la transacción.')
          }
        }
      }

      if (!txHash) {
        throw new Error('La billetera no devolvió el hash de la transacción.')
      }

      const explorerUrl = `${activeDestination.blockExplorer}/tx/${txHash}`

      // Create synthetic on-chain miner if product is a miner
      const isMiner = productName.toLowerCase().includes('miner') || productName.toLowerCase().includes('esencial') || productName.toLowerCase().includes('pro')
      let createdMinerId = ''
      if (isMiner) {
        const powerTh = productName.toLowerCase().includes('pro') ? 21.05 : productName.toLowerCase().includes('max') ? 42.44 : 1.12
        const miner = registerWalletMinerPurchase(
          {
            name: productName,
            powerTh,
            efficiency: 12,
            price: quote.catalogUsd,
            purchaseMode: 'once',
            ownerWallet: activeAddress,
          },
          txHash,
          activeDestination.name,
        )
        createdMinerId = miner.id
        startMiningSimulation(miner.id, miner.name, miner.powerTh)
      }

      const paymentReceipt: PaymentReceipt = {
        id: `REC-${Date.now().toString(36).toUpperCase()}`,
        productName,
        quote,
        sender: activeAddress,
        transactionHash: txHash,
        sourceStatus: 'submitted',
        bridgeStatus: 'not-applicable',
        sentAt: Date.now(),
        explorerUrl,
        minerId: createdMinerId,
      }

      setReceipt(paymentReceipt)
      onPaid(paymentReceipt)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('User rejected') || msg.includes('cancelled') || msg.includes('denied')) {
        setError('Transacción rechazada en tu billetera.')
      } else {
        setError(msg)
      }
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="wallet-checkout-overlay" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <div className="wallet-checkout-modal">
        {/* Header */}
        <div className="checkout-modal-header">
          <div>
            <h2 id="checkout-title">{productName}</h2>
            <p className="checkout-subtitle">Checkout Web3 · Pago multired automatizado</p>
          </div>
          <button type="button" className="checkout-close-btn" onClick={() => onClose(paying)} aria-label="Cerrar modal">
            ✕
          </button>
        </div>

        {receipt ? (
          /* Payment Success & Receipt View */
          <div className="checkout-receipt-view">
            <div className="receipt-success-badge">✓</div>
            <h3>¡Pago confirmado y enviado!</h3>
            <p className="receipt-desc">
              Tu transacción ha sido firmada y transmitida a la red con éxito.
            </p>

            <div className="receipt-details-box">
              <div className="receipt-row">
                <span>Producto:</span>
                <strong>{productName}</strong>
              </div>
              <div className="receipt-row">
                <span>Importe Pagado:</span>
                <strong>{formatAssetAmount(receipt.quote.amount, receipt.quote.asset)}</strong>
              </div>
              <div className="receipt-row">
                <span>Red:</span>
                <strong>{receipt.quote.networkName}</strong>
              </div>
              <div className="receipt-row">
                <span>Hash de transacción:</span>
                <code className="receipt-hash">{receipt.transactionHash.slice(0, 18)}...</code>
              </div>
            </div>

            <div className="receipt-actions">
              <a
                href={receipt.explorerUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="button button-secondary explorer-link-button"
              >
                Ver en Explorador de Bloques ↗
              </a>
              {receipt.minerId ? (
                <button
                  type="button"
                  className="button button-primary receipt-customize-btn"
                  onClick={() => {
                    onClose(false)
                    navigate(`/miners/${receipt.minerId}/customize`)
                  }}
                >
                  Personalizar mi Minero Ahora ⚙
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => onClose(false)}
                >
                  Finalizar
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Payment Form View */
          <div className="checkout-form-content">
            {/* Step 1: Network Selection */}
            <div className="checkout-section">
              <label className="checkout-label">1. Selecciona la red de pago</label>
              <div className="checkout-network-grid">
                {networks.map((net) => (
                  <button
                    key={net.id}
                    type="button"
                    className={`network-chip-btn ${networkId === net.id ? 'network-chip-active' : ''}`}
                    onClick={() => setNetworkId(net.id)}
                  >
                    <CryptoIcon symbol={net.icon} size="sm" />
                    <span>{net.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Currency Type (Native vs USDT) */}
            <div className="checkout-section">
              <label className="checkout-label">2. Selecciona la moneda</label>
              <div className="currency-selector-row">
                <button
                  type="button"
                  className={`currency-pill-btn ${!useUsdt ? 'currency-pill-active' : ''}`}
                  onClick={() => setUseUsdt(false)}
                >
                  <CryptoIcon symbol={NATIVE_SYMBOL_BY_NETWORK[networkId] as CryptoSymbol} size="sm" />
                  <span>Moneda Nativa ({NATIVE_SYMBOL_BY_NETWORK[networkId]})</span>
                </button>
                <button
                  type="button"
                  className={`currency-pill-btn ${useUsdt ? 'currency-pill-active' : ''}`}
                  onClick={() => setUseUsdt(true)}
                >
                  <CryptoIcon symbol="USDT" size="sm" />
                  <span>Tether USD (USDT)</span>
                </button>
              </div>
            </div>

            {/* Step 3: Quote & Price Breakdown */}
            <div className="checkout-quote-card">
              {loadingQuote ? (
                <QuoteDetailsSkeleton />
              ) : quote ? (
                <>
                  <div className="quote-header-row">
                    <span className="quote-asset-pill">
                      {formatAssetAmount(quote.amount, quote.asset)}
                    </span>
                    <span className="quote-fiat-reference">
                      {formatCatalogPrice(quote.catalogValue, quote.catalogCurrency)}
                      {quote.catalogCurrency === 'MXN' && ` (~${formatUsd(quote.catalogUsd)})`}
                    </span>
                  </div>

                  <div className="quote-breakdown-details">
                    <div className="quote-line">
                      <span>Destinatario de fondos:</span>
                      <code className="quote-address" onClick={() => handleCopy(quote.recipient)} title="Haz clic para copiar">
                        {quote.recipient.slice(0, 8)}...{quote.recipient.slice(-6)} 📋
                      </code>
                    </div>
                    <div className="quote-line">
                      <span>Comisiones de red y swap:</span>
                      <span className="quote-tag-fee">+1.5% incluido</span>
                    </div>
                    <div className="quote-line">
                      <span>Tiempo estimado:</span>
                      <span>{activeDestination.eta}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="quote-error-text">No se pudo cargar la cotización para esta red.</p>
              )}
            </div>

            {copyStatus && <p className="copy-notice-text">{copyStatus}</p>}
            {error && <div className="checkout-error-banner" role="alert">{error}</div>}

            {/* Step 4: Wallet Connect & Pay CTA */}
            <div className="checkout-cta-box">
              {!isWalletConnected ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                  {isSolana ? (
                    <button
                      type="button"
                      className="button button-primary checkout-action-btn"
                      onClick={async () => {
                        if (session?.connect) {
                          await session.connect('phantom')
                        } else {
                          openAppKit()
                        }
                      }}
                    >
                      Conectar Phantom / Solflare Directa ⚡
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button button-primary checkout-action-btn"
                      onClick={async () => {
                        if (session?.connect) {
                          await session.connect('metamask', networkId)
                        } else {
                          openAppKit()
                        }
                      }}
                    >
                      Conectar MetaMask Directa 🦊
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button-secondary checkout-action-btn"
                    onClick={() => openAppKit()}
                  >
                    Otras Billeteras / QR Móvil (AppKit) 🌐
                  </button>
                </div>
              ) : isWrongEvmChain ? (
                <button
                  type="button"
                  className="button button-secondary checkout-action-btn"
                  onClick={handleSwitchNetwork}
                >
                  Cambiar a {activeDestination.name}
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-primary checkout-action-btn"
                  disabled={!quote || loadingQuote || paying}
                  onClick={handlePay}
                >
                  {paying ? 'Aprobando en tu wallet...' : `Pagar ${quote ? formatAssetAmount(quote.amount, quote.asset) : ''}`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
