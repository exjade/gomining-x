import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount, useSendTransaction, useWriteContract, useSwitchChain } from 'wagmi'
import { parseEther, parseUnits } from 'viem'
import { useAppKit, useAppKitAccount, useAppKitNetwork } from '@reown/appkit/react'
import { PAYMENT_DESTINATIONS, USDT_CONTRACTS, type PaymentNetworkId } from './paymentDestinations'
import { fetchPaymentQuote, formatAssetAmount, formatCatalogPrice, type PaymentAsset, type PaymentCurrency, type PaymentQuote } from './paymentQuote'
import { CryptoIcon, type CryptoSymbol } from './CryptoIcon'
import { QuoteDetailsSkeleton } from './Skeletons'
import { buildSolanaPaymentTransaction } from './solanaPayment'
import { registerWalletMinerPurchase } from './demoStore'
import { startMiningSimulation } from './miningSimulation'
import { useAuth } from './AuthContext'
import { savePurchasedMiner, creditDirectReferralCommission, recordMinerPurchaseToAdmin, type StoredMiner } from './firebase'
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
  const { user, openAuthModal, linkWallet } = useAuth()
  const [networkId, setNetworkId] = useState<PaymentNetworkId>(initialNetworkId)
  const [useUsdt, setUseUsdt] = useState(false)
  const [quote, setQuote] = useState<PaymentQuote | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [showSimulateFallback, setShowSimulateFallback] = useState(false)

  // Determine connected address across EVM, AppKit and Direct Session
  const directAddress = session?.connection?.address || ''
  const activeAddress = evmAddress || appKitAccount.address || directAddress || ''
  const isWalletConnected = Boolean(activeAddress && (isEvmConnected || appKitAccount.isConnected || Boolean(session?.connection)))

  // Identify wallet ecosystem: EVM vs Solana
  const isEvmWallet = Boolean(
    (activeAddress && activeAddress.startsWith('0x')) ||
    isEvmConnected ||
    session?.connection?.protocol === 'EIP-1193' ||
    session?.connection?.id === 'metamask' ||
    session?.connection?.id === 'coinbase' ||
    session?.connection?.id === 'trustwallet'
  )

  const isSolanaWallet = Boolean(
    (activeAddress && !activeAddress.startsWith('0x')) ||
    session?.connection?.protocol === 'Solana' ||
    session?.connection?.id === 'phantom' ||
    session?.connection?.id === 'solflare'
  )

  // Filter networks: If EVM wallet is connected, show ONLY EVM networks (BNB, ETH, Polygon). Hide Solana!
  // If Solana wallet is connected, show ONLY Solana.
  const availableNetworks = isEvmWallet
    ? networks.filter((n) => n.id !== 'solana')
    : isSolanaWallet
      ? networks.filter((n) => n.id === 'solana')
      : networks

  const isSolana = networkId === 'solana'
  const isEvmChain = !isSolana
  const numericChainId = Number(wagmiChainId || appKitChainId || (session?.connection?.network.includes('BNB') ? 56 : session?.connection?.network.includes('Polygon') ? 137 : session?.connection?.network.includes('Ethereum') ? 1 : 0)) || 0

  const prevChainIdRef = useRef<number>(numericChainId)
  useEffect(() => {
    if (isEvmWallet) {
      if (networkId === 'solana') {
        setNetworkId(numericChainId === 1 ? 'ethereum' : numericChainId === 137 ? 'polygon' : 'bnb')
      } else if (prevChainIdRef.current !== numericChainId && numericChainId > 0) {
        prevChainIdRef.current = numericChainId
        if (numericChainId === 56 && networkId !== 'bnb') setNetworkId('bnb')
        else if (numericChainId === 1 && networkId !== 'ethereum') setNetworkId('ethereum')
        else if (numericChainId === 137 && networkId !== 'polygon') setNetworkId('polygon')
      }
    } else if (isSolanaWallet && networkId !== 'solana') {
      setNetworkId('solana')
    }
  }, [isEvmWallet, isSolanaWallet, numericChainId, networkId])

  const activeDestination = PAYMENT_DESTINATIONS.find((d) => d.id === networkId) ?? PAYMENT_DESTINATIONS[0]
  const selectedAsset: PaymentAsset = useUsdt ? 'USDT' : NATIVE_SYMBOL_BY_NETWORK[networkId]
  const isWrongEvmChain = isEvmChain && isWalletConnected && numericChainId > 0 && numericChainId !== activeDestination.chainId

  const refreshQuote = useCallback(async () => {
    setLoadingQuote(true)
    setError('')
    setShowSimulateFallback(false)
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
    setError('')
    try {
      if (isEvmConnected && switchChainAsync) {
        await switchChainAsync({ chainId: activeDestination.chainId })
      } else if (typeof window !== 'undefined' && (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum?.request) {
        const hexChainId = `0x${activeDestination.chainId.toString(16)}`
        try {
          await (window as unknown as { ethereum: { request: (args: unknown) => Promise<unknown> } }).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: hexChainId }],
          })
        } catch (switchErr: unknown) {
          const errCode = (switchErr as { code?: number })?.code
          if (errCode === 4902) {
            await (window as unknown as { ethereum: { request: (args: unknown) => Promise<unknown> } }).ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: hexChainId,
                chainName: activeDestination.name,
                rpcUrls: [networkId === 'bnb' ? 'https://bsc-dataseed.binance.org' : networkId === 'polygon' ? 'https://polygon-rpc.com' : 'https://cloudflare-eth.com'],
                nativeCurrency: {
                  name: activeDestination.name,
                  symbol: NATIVE_SYMBOL_BY_NETWORK[networkId],
                  decimals: 18,
                },
                blockExplorerUrls: [activeDestination.blockExplorer],
              }],
            })
          } else {
            throw switchErr
          }
        }
      } else if (switchNetwork) {
        await switchNetwork(activeDestination.chainId as never)
      }
    } catch {
      setError(`Por favor confirma el cambio de red a ${activeDestination.name} en tu billetera.`)
    }
  }

  const processPurchaseCompletion = async (txHash: string) => {
    const explorerUrl = `${activeDestination.blockExplorer}/tx/${txHash}`

    // Create synthetic on-chain miner if product is a miner
    const isMiner = productName.toLowerCase().includes('miner') || productName.toLowerCase().includes('esencial') || productName.toLowerCase().includes('pro') || productName.toLowerCase().includes('th') || productName.toLowerCase().includes('preventa') || productName.toLowerCase().includes('lanzamiento')
    let createdMinerId = ''
    if (isMiner) {
      const parsedTh = (() => {
        const match = productName.match(/([\d.]+)\s*TH/i)
        if (match) return Number(match[1])
        const lower = productName.toLowerCase()
        if (lower.includes('enterprise')) return 192
        if (lower.includes('master')) return 128
        if (lower.includes('pro')) return 96
        if (lower.includes('standard')) return 64
        if (lower.includes('entry')) return 48
        if (lower.includes('max')) return 42.44
        if (lower.includes('esencial')) return 5.83
        return Number((amount / 12.99).toFixed(2)) || 1.46
      })()

      const derivedPackageId = (() => {
        const lower = productName.toLowerCase()
        if (lower.includes('entry')) return 'pkg-miner-1'
        if (lower.includes('standard')) return 'pkg-miner-2'
        if (lower.includes('pro')) return 'pkg-miner-3'
        if (lower.includes('master')) return 'pkg-miner-4'
        if (lower.includes('enterprise')) return 'pkg-miner-5'
        return undefined
      })()

      const miner = registerWalletMinerPurchase(
        {
          name: productName,
          powerTh: parsedTh,
          efficiency: 15,
          price: quote?.catalogUsd ?? amount,
          purchaseMode: 'once',
          ownerWallet: activeAddress,
        },
        txHash,
        activeDestination.name,
      )
      createdMinerId = miner.id
      startMiningSimulation(miner.id, miner.name, miner.powerTh)

      // Persist to Firestore: /miners/{uid}/miner/{minerId}
      if (user) {
        const storedMiner: StoredMiner = {
          id: createdMinerId,
          uid: user.uid,
          name: productName,
          powerTh: parsedTh,
          efficiency: 15,
          efficiencyWattsPerTh: 15,
          price: quote?.catalogUsd ?? amount,
          currency: 'USD',
          status: 'active',
          txHash,
          createdAt: null,
          network: activeDestination.name,
          ownerWallet: activeAddress,
          visualTraits: {
            wallColor: '#7c3aed',
            bodyColor: '#1e1b4b',
            bottomColor: '#e2e8f0',
            fansColor: '#1e293b',
            screenColor: '#22c55e',
            buttonsColor: '#64748b',
            topColor: '#0f172a',
            stickers: 'gomining-classic',
          },
        }
        try {
          await savePurchasedMiner(user.uid, storedMiner)
          await creditDirectReferralCommission(user.uid, user.email || '', quote?.catalogUsd ?? amount, createdMinerId, txHash)
          await linkWallet(activeAddress)
        } catch (persistErr) {
          console.error('Error persisting miner or referral commission to Firestore:', persistErr)
        }
      }

      // Record purchased miner to platform admin dashboard (/admin_contracts & /admin_orders)
      try {
        await recordMinerPurchaseToAdmin({
          minerId: createdMinerId,
          uid: user?.uid,
          email: user?.email || '',
          name: productName,
          powerTh: parsedTh,
          price: quote?.catalogUsd ?? amount,
          txHash,
          network: activeDestination.name,
          ownerWallet: activeAddress,
          packageId: derivedPackageId,
        })
      } catch (adminErr) {
        console.warn('Error recording miner purchase to admin platform:', adminErr)
      }
    }

    const currentQuote = quote ?? {
      networkId,
      networkName: activeDestination.name,
      asset: selectedAsset,
      recipient: activeDestination.address,
      catalogValue: amount,
      catalogCurrency: 'USD' as const,
      catalogUsd: amount,
      fxDate: null,
      assetUsd: 1,
      amount: String(amount),
      decimals: 18,
      estimatedBridgeFeeUsd: 0,
      bridgeFeeRate: 0.015,
      expectedNetUsd: amount,
      quoteSource: 'Direct',
      updatedAt: Date.now(),
      expiresAt: Date.now() + 30000,
    }

    const paymentReceipt: PaymentReceipt = {
      id: `REC-${Date.now().toString(36).toUpperCase()}`,
      productName,
      quote: currentQuote,
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
  }

  const handlePay = async () => {
    if (!quote) return
    setError('')
    setShowSimulateFallback(false)
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
          } else if (typeof window !== 'undefined' && (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum?.request) {
            const cleanTo = quote.recipient.replace(/^0x/i, '').toLowerCase().padStart(64, '0')
            const cleanVal = amountUnits.toString(16).padStart(64, '0')
            const data = `0xa9059cbb${cleanTo}${cleanVal}`
            const hash = await (window as unknown as { ethereum: { request: (args: unknown) => Promise<unknown> } }).ethereum.request({
              method: 'eth_sendTransaction',
              params: [{ from: activeAddress, to: tokenAddress, value: '0x0', data }],
            })
            txHash = typeof hash === 'string' ? hash : ''
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
          } else if (typeof window !== 'undefined' && (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum?.request) {
            const hash = await (window as unknown as { ethereum: { request: (args: unknown) => Promise<unknown> } }).ethereum.request({
              method: 'eth_sendTransaction',
              params: [{ from: activeAddress, to: recipient, value: `0x${valueUnits.toString(16)}` }],
            })
            txHash = typeof hash === 'string' ? hash : ''
          } else {
            throw new Error('No hay una wallet EVM conectada para autorizar la transacción.')
          }
        }
      }

      if (!txHash) {
        throw new Error('La billetera no devolvió el hash de la transacción.')
      }

      await processPurchaseCompletion(txHash)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? '')
      const isRejection = /reject|cancel|denied|declin|4001/i.test(msg)
      const is512 = /\b512\b|unknown.*rpc|rpc.*unknown|code 512|-32000/i.test(msg)
      const isInsufficient = /insufficient|exceeds balance|gas required exceeds/i.test(msg)

      if (isRejection) {
        setError('Transacción rechazada en tu billetera.')
      } else if (is512 || isInsufficient) {
        setError(`No se pudo procesar la transacción en la red ${activeDestination.name} (fondos insuficientes para el pago o para el gas de red). Puedes verificar el saldo en tu billetera o confirmar en modo de simulación de prueba.`)
        setShowSimulateFallback(true)
      } else {
        setError(`No se pudo completar el pago en ${activeDestination.name}. Puedes verificar tu conexión o confirmar en modo simulación de prueba.`)
        setShowSimulateFallback(true)
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
            {!isWalletConnected ? (
              /* State: Wallet Not Connected Yet -> Networks and currencies not shown until connected */
              <div className="checkout-section">
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px', marginBottom: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>Importe a pagar:</span>
                    <strong style={{ fontSize: 18, color: '#fff' }}>{formatCatalogPrice(amount, 'USD')}</strong>
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: 18 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: '0 0 6px 0' }}>Conecta tu billetera para continuar</h3>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                    Las opciones de red y moneda se habilitarán automáticamente con las que sean compatibles con tu billetera conectada.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginBottom: 16 }}>
                  <button
                    type="button"
                    className="button button-primary checkout-action-btn"
                    onClick={async () => {
                      if (session?.connect) {
                        await session.connect('metamask', 'bnb')
                      } else {
                        openAppKit()
                      }
                    }}
                  >
                    Conectar MetaMask Directa 🦊
                  </button>
                  <button
                    type="button"
                    className="button button-secondary checkout-action-btn"
                    onClick={async () => {
                      if (session?.connect) {
                        await session.connect('phantom')
                      } else {
                        openAppKit()
                      }
                    }}
                  >
                    Conectar Phantom / Solflare (Solana) ⚡
                  </button>
                  <button
                    type="button"
                    className="button button-secondary checkout-action-btn"
                    onClick={() => openAppKit()}
                  >
                    Otras Billeteras / WalletConnect (AppKit) 🌐
                  </button>
                </div>

                {/* Protocol Treasury Transparent Info */}
                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.25)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ fontSize: 11, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🏛️</span> Tesorería Oficial del Protocolo
                    </strong>
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                    Destino transparente de fondos: Las compras se transfieren de forma directa y verificable a la dirección oficial de la tesorería de GoMining en cada blockchain para acuñar y respaldar tu minero digital.
                  </p>
                </div>
              </div>
            ) : (
              /* State: Wallet Connected -> Show compatible networks, currencies, quote and pay button */
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 10, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>🟢</span>
                    <div>
                      <strong style={{ fontSize: 12, color: '#22c55e', display: 'block' }}>
                        {isEvmWallet ? 'Billetera EVM Conectada' : 'Billetera Solana Conectada'}
                      </strong>
                      <code style={{ fontSize: 11, color: '#e2e8f0' }}>
                        {activeAddress.slice(0, 8)}...{activeAddress.slice(-6)}
                      </code>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(0,0,0,0.3)', padding: '3px 8px', borderRadius: 6 }}>
                    {activeDestination.name}
                  </span>
                </div>

                {/* Step 1: Network Selection */}
                <div className="checkout-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="checkout-label" style={{ margin: 0 }}>1. Red de pago compatible</label>
                    {isEvmWallet && <span style={{ fontSize: 10, color: '#a78bfa' }}>Filtrado: Solo redes EVM compatibles</span>}
                    {isSolanaWallet && <span style={{ fontSize: 10, color: '#a78bfa' }}>Filtrado: Red Solana activa</span>}
                  </div>
                  <div className="checkout-network-grid">
                    {availableNetworks.map((net) => (
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
                      <span>Tether USD (USDT {isSolana ? 'SPL' : 'ERC-20'})</span>
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
                          {formatCatalogPrice(quote.catalogValue, 'USD')}
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

                {/* Protocol Treasury Transparent Info */}
                <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.25)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ fontSize: 11, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🏛️</span> Tesorería Oficial del Protocolo
                    </strong>
                    <a
                      href={`${activeDestination.blockExplorer}/address/${activeDestination.address}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ fontSize: 9, color: '#a78bfa', textDecoration: 'underline' }}
                    >
                      Ver en Explorador ↗
                    </a>
                  </div>
                  <p style={{ margin: '0 0 6px 0', fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>
                    Los fondos de la compra se depositan de manera directa en la tesorería del protocolo en <strong>{activeDestination.name}</strong> para acuñar y activar tu minero digital.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 8 }}>
                    <code style={{ fontSize: 10, color: '#c4b5fd', wordBreak: 'break-all' }}>{activeDestination.address}</code>
                    <button type="button" onClick={() => handleCopy(activeDestination.address)} style={{ background: 'transparent', border: 0, color: '#a78bfa', cursor: 'pointer', fontSize: 11, padding: '2px 6px', fontWeight: 600 }}>Copiar</button>
                  </div>
                </div>

                {copyStatus && <p className="copy-notice-text">{copyStatus}</p>}
                {error && <div className="checkout-error-banner" role="alert">{error}</div>}

                {/* Step 4: Pay CTA */}
                <div className="checkout-cta-box">
                  {!user && (
                    <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(124, 58, 237, 0.1)', border: '1px solid rgba(124, 58, 237, 0.25)', borderRadius: 8, fontSize: 11, color: '#c4b5fd' }}>
                      👛 Comprando directamente con tu wallet on-chain. Opcional: <button type="button" onClick={() => openAuthModal('register')} style={{ background: 'transparent', border: 0, color: '#a78bfa', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontWeight: 600 }}>Crea una cuenta</button> si deseas guardar tu perfil en la nube.
                    </div>
                  )}
                  {isWrongEvmChain ? (
                    <button
                      type="button"
                      className="button button-secondary checkout-action-btn"
                      onClick={handleSwitchNetwork}
                    >
                      Cambiar a {activeDestination.name} en tu billetera
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button button-primary checkout-action-btn"
                        disabled={!quote || loadingQuote || paying}
                        onClick={handlePay}
                      >
                        {paying ? 'Aprobando en tu wallet...' : `Pagar ${quote ? formatAssetAmount(quote.amount, quote.asset) : ''}`}
                      </button>
                      {showSimulateFallback && (
                        <button
                          type="button"
                          className="button button-secondary checkout-action-btn"
                          style={{ marginTop: 8 }}
                          onClick={async () => {
                            setError('')
                            setShowSimulateFallback(false)
                            setPaying(true)
                            try {
                              await processPurchaseCompletion(`0x${'a'.repeat(64)}`)
                            } catch (simErr) {
                              setError(simErr instanceof Error ? simErr.message : 'Error en simulación.')
                            } finally {
                              setPaying(false)
                            }
                          }}
                        >
                          Confirmar compra en modo prueba / simulación ⚡
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
