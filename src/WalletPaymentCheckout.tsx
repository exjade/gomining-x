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
import { startMiningSimulation } from './miningSimulation'
import { useAuth } from './AuthContext'
import { savePurchasedMiner, creditDirectReferralCommission, recordMinerPurchaseToAdmin } from './firebase'
import { buyDemoMiner } from './demoStore'
import {
  completeWalletMinerPurchase,
  retryWalletMinerPurchase,
  parseMinerPowerTh,
  prepareWalletMinerPurchase,
  isMinerProduct,
  getPostTxRecovery,
  savePostTxRecovery,
  clearPostTxRecovery,
  type PostTxPendingState,
  type PackageSnapshot,
  type PurchaseAdminRecorder,
} from './minerPurchaseFlow'
import type { WalletId, WalletSession } from './walletSession'

export type { PostTxPendingState, PackageSnapshot }

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

export function sanitizeErrorReason(raw: unknown): string {
  if (!raw) return ''
  return String(raw)
    .replace(/https?:\/\/[^\s'")]+/g, '[rpc-endpoint]')
    .replace(/0x[a-fA-F0-9]{10,}/g, '[hash/data]')
    .replace(/bearer\s+[a-z0-9._-]+/gi, '[token]')
    .replace(/(?:api[_-]?key|secret|token)=([a-zA-Z0-9_-]+)/gi, 'token=[masked]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export type ClassifiedPaymentError = {
  message: string
  showSimulateFallback: boolean
  kind: string
}

export function classifyPaymentError(
  err: unknown,
  networkName: string
): ClassifiedPaymentError {
  let rawReason = ''
  let rootName = (err as { name?: string })?.name || ''
  let code = (err as { code?: number | string })?.code ?? (err as { cause?: { code?: number | string } })?.cause?.code

  if (err && typeof err === 'object') {
    const baseErr = err as {
      shortMessage?: string
      details?: string
      message?: string
      cause?: unknown
      walk?: (fn?: (e: unknown) => boolean) => any
    }
    if (baseErr.shortMessage) {
      rawReason = baseErr.shortMessage
    } else if (baseErr.details) {
      rawReason = baseErr.details
    } else if (baseErr.message) {
      rawReason = baseErr.message
    }
    if (typeof baseErr.walk === 'function') {
      try {
        const root = baseErr.walk()
        if (root && root !== err) {
          rootName = (root as { name?: string }).name || rootName
          code = (root as { code?: number | string }).code ?? code
          if (!rawReason) {
            rawReason = (root as { details?: string }).details || (root as { shortMessage?: string }).shortMessage || (root as { message?: string }).message || ''
          }
        }
      } catch {
        // ignore walk errors if any
      }
    }
  } else if (err instanceof Error) {
    rawReason = err.message
  } else {
    rawReason = String(err ?? '')
  }

  const cleanReason = sanitizeErrorReason(rawReason)
  const checkText = `${cleanReason} ${rootName} ${(err as Error)?.message || ''}`.toLowerCase()

  // 1. User Rejection (Independent case: zero simulation fallback)
  if (
    code === 4001 ||
    String(code) === '4001' ||
    rootName === 'UserRejectedRequestError' ||
    rootName === 'TransactionRejectedRpcError' ||
    /reject|cancel|denied|declin|4001/.test(checkText)
  ) {
    return {
      message: 'Transacción rechazada en tu billetera.',
      showSimulateFallback: false,
      kind: 'USER_REJECTION',
    }
  }

  // 2. Chain / Network Mismatch
  if (
    rootName === 'ChainMismatchError' ||
    rootName === 'ConnectorChainMismatchError' ||
    /chain.*mismatch|does not match the target chain|wrong network/.test(checkText)
  ) {
    return {
      message: `La billetera está conectada a otra red. Cambia a la red ${networkName} en tu billetera para continuar.`,
      showSimulateFallback: false,
      kind: 'CHAIN_MISMATCH',
    }
  }

  // 3. Missing or Disconnected Wallet
  if (
    rootName === 'ConnectorNotConnectedError' ||
    rootName === 'ProviderNotFoundError' ||
    /no hay una wallet|wallet not connected|connector not connected|wallet.*desconectada|provider not found/.test(checkText)
  ) {
    return {
      message: `No hay una billetera compatible conectada para autorizar la transacción en ${networkName}. Conecta tu billetera para continuar.`,
      showSimulateFallback: false,
      kind: 'WALLET_NOT_CONNECTED',
    }
  }

  // 4. Contract Revert / Execution Revert
  if (
    rootName === 'ExecutionRevertedError' ||
    rootName === 'ContractFunctionRevertedError' ||
    rootName === 'ContractFunctionExecutionError' ||
    /execution reverted|contract reverted|reverted with reason|transfer amount exceeds/.test(checkText)
  ) {
    const detail = cleanReason ? ` (${cleanReason})` : ''
    return {
      message: `La transacción fue revertida en la red ${networkName}${detail}. Puedes verificar los parámetros o confirmar en modo de simulación de prueba.`,
      showSimulateFallback: true,
      kind: 'EXECUTION_REVERTED',
    }
  }

  // 5. Insufficient Funds / Gas (Independent case)
  if (
    rootName === 'InsufficientFundsError' ||
    /insufficient.*(?:funds|balance|gas)|exceeds balance|gas required exceeds|saldo insuficiente/.test(checkText)
  ) {
    return {
      message: `No se pudo procesar la transacción en la red ${networkName} (fondos insuficientes para el pago o para el gas de red). Puedes verificar el saldo en tu billetera o confirmar en modo de simulación de prueba.`,
      showSimulateFallback: true,
      kind: 'INSUFFICIENT_FUNDS',
    }
  }

  // 6. RPC / Provider / Timeout Error (Separate from insufficient funds)
  if (
    rootName.includes('Rpc') ||
    rootName.includes('Timeout') ||
    rootName.includes('Http') ||
    /\b512\b|rpc|timeout|timed out|network error|failed to fetch|-32603|-32000|rate limit|429|502|503|504|nonce too low|replacement.*underpriced/.test(checkText)
  ) {
    const detail = cleanReason ? ` (${cleanReason})` : ''
    return {
      message: `Error de comunicación con el proveedor RPC en la red ${networkName}${detail}. Puedes verificar tu conexión o confirmar en modo simulación de prueba.`,
      showSimulateFallback: true,
      kind: 'RPC_ERROR',
    }
  }

  // 7. Generic Diagnostic Fallback
  const detail = cleanReason ? ` (${cleanReason})` : ''
  return {
    message: `No se pudo completar el pago en ${networkName}${detail}. Puedes verificar tu conexión o confirmar en modo simulación de prueba.`,
    showSimulateFallback: true,
    kind: 'GENERIC_DIAGNOSTIC',
  }
}

export function WalletPaymentCheckout({
  productName,
  amount,
  currency,
  packageId,
  purchaseMode = 'once',
  initialNetworkId = 'bnb',
  session,
  minerId: propMinerId,
  onClose,
  onPaid,
  recordPurchaseToAdmin: customRecordPurchaseToAdmin,
}: {
  productName: string
  amount: number
  currency: PaymentCurrency
  packageId?: string
  purchaseMode?: 'once' | 'monthly'
  minerId?: string
  initialNetworkId?: PaymentNetworkId
  initialWalletId?: string
  session?: WalletSession
  onClose: (requestPending?: boolean, notice?: string) => void
  onResumeWalletConnect?: (url: string) => void
  onPaid: (receipt: PaymentReceipt) => void
  recordPurchaseToAdmin?: PurchaseAdminRecorder
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
  const [simulatedMiner, setSimulatedMiner] = useState<{ id: string; name: string } | null>(null)
  const [postTxRecovery, setPostTxRecoveryState] = useState<PostTxPendingState | null>(() => getPostTxRecovery())

  const setPostTxRecovery = useCallback((val: PostTxPendingState | null) => {
    setPostTxRecoveryState(val)
    if (val) {
      savePostTxRecovery(val)
    } else {
      clearPostTxRecovery()
    }
  }, [])

  const [retryingPersistence, setRetryingPersistence] = useState(false)
  const minerIdRef = useRef<string>(propMinerId || '')

  useEffect(() => {
    if (propMinerId) {
      minerIdRef.current = propMinerId
    } else if (!minerIdRef.current && isMinerProduct(productName)) {
      const prep = prepareWalletMinerPurchase({
        name: productName,
        powerTh: parseMinerPowerTh(productName, amount),
        efficiency: 15,
        price: amount,
        purchaseMode,
        packageId,
      })
      minerIdRef.current = prep.id
    }
  }, [propMinerId, productName, amount, purchaseMode, packageId])
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

  const processPurchaseCompletion = async (
    txHash: string,
    retryMinerId?: string,
    activeRecovery?: PostTxPendingState | null
  ) => {
    const recoveryToUse = activeRecovery ?? postTxRecovery
    const targetMinerId = retryMinerId || recoveryToUse?.minerId || minerIdRef.current || propMinerId
    if (!targetMinerId || !targetMinerId.trim()) {
      setError('No se pudo determinar el identificador canónico del minero.')
      setPaying(false)
      setRetryingPersistence(false)
      return
    }
    minerIdRef.current = targetMinerId

    const effectiveProductName = (retryMinerId && recoveryToUse ? recoveryToUse.productName : undefined) ?? productName
    const effectiveAmount = (retryMinerId && recoveryToUse ? recoveryToUse.amount : undefined) ?? amount
    const effectivePackageId = (retryMinerId && recoveryToUse ? recoveryToUse.packageId : undefined) ?? packageId
    const effectivePurchaseMode = (retryMinerId && recoveryToUse ? recoveryToUse.purchaseMode : undefined) ?? purchaseMode
    const effectivePriceUsd = (retryMinerId && recoveryToUse ? recoveryToUse.priceUsd : undefined) ?? quote?.catalogUsd
    const effectiveActiveAddress = (retryMinerId && recoveryToUse ? recoveryToUse.originWalletAddress : undefined) ?? activeAddress
    const effectiveNetworkName = (retryMinerId && recoveryToUse ? recoveryToUse.networkName : undefined) ?? activeDestination.name
    const explorerDest = PAYMENT_DESTINATIONS.find((d) => d.id === (recoveryToUse?.networkId ?? networkId)) ?? activeDestination
    const explorerUrl = `${explorerDest.blockExplorer}/tx/${txHash}`

    let createdMinerId = targetMinerId
    try {
      const completionResult = await completeWalletMinerPurchase(
        {
          productName: effectiveProductName,
          amount: effectiveAmount,
          packageId: effectivePackageId,
          purchaseMode: effectivePurchaseMode,
          activeAddress: effectiveActiveAddress,
          txHash,
          networkName: effectiveNetworkName,
          catalogUsd: effectivePriceUsd,
          user,
          minerId: targetMinerId,
          requireCanonicalPackageId: true,
        },
        {
          recordPurchaseToAdmin: customRecordPurchaseToAdmin ?? recordMinerPurchaseToAdmin,
          saveMinerToFirestore: savePurchasedMiner,
          creditReferral: creditDirectReferralCommission,
          linkActiveWallet: linkWallet,
          onSimulationStart: startMiningSimulation,
        }
      )
      if (completionResult) {
        createdMinerId = completionResult.createdMinerId
      }
    } catch (err) {
      console.error('Error completing wallet miner purchase persistence:', err)
      const errMessage = err instanceof Error ? err.message : 'Error completando la persistencia del minero'
      if (!effectivePackageId || !effectivePackageId.trim()) {
        setError(errMessage)
        setPaying(false)
        setRetryingPersistence(false)
        return
      }
      const cleanPkgId = effectivePackageId.trim()
      const updatedRecovery: PostTxPendingState = {
        schemaVersion: 1,
        status: 'PERSISTENCE_PENDING',
        txHash,
        minerId: targetMinerId,
        packageId: cleanPkgId,
        productName: effectiveProductName,
        amount: effectiveAmount,
        powerTh: recoveryToUse?.powerTh ?? parseMinerPowerTh(effectiveProductName, effectiveAmount),
        price: recoveryToUse?.price ?? (effectivePriceUsd ?? effectiveAmount),
        priceUsd: effectivePriceUsd ?? effectiveAmount,
        currency: recoveryToUse?.currency ?? 'USD',
        cadence: effectivePurchaseMode || 'once',
        purchaseMode: effectivePurchaseMode || 'once',
        networkId: recoveryToUse?.networkId ?? networkId,
        networkName: effectiveNetworkName,
        originWalletAddress: effectiveActiveAddress,
        originUid: user?.uid ?? recoveryToUse?.originUid,
        packageSnapshot: recoveryToUse?.packageSnapshot ?? {
          packageId: cleanPkgId,
          name: effectiveProductName,
          powerTh: recoveryToUse?.powerTh ?? parseMinerPowerTh(effectiveProductName, effectiveAmount),
          price: recoveryToUse?.price ?? (effectivePriceUsd ?? effectiveAmount),
          currency: 'USD',
          cadence: effectivePurchaseMode || 'once',
          purchaseMode: effectivePurchaseMode || 'once',
        },
        createdAt: recoveryToUse?.createdAt ?? Date.now(),
        errorMessage: errMessage,
      }
      setPostTxRecovery(updatedRecovery)
      setError(errMessage)
      setPaying(false)
      setRetryingPersistence(false)
      return
    }

    setPostTxRecovery(null)
    setRetryingPersistence(false)

    const currentQuote = quote ?? {
      networkId,
      networkName: effectiveNetworkName || activeDestination.name,
      asset: selectedAsset,
      recipient: activeDestination.address,
      catalogValue: effectiveAmount,
      catalogCurrency: 'USD' as const,
      catalogUsd: effectivePriceUsd ?? effectiveAmount,
      fxDate: null,
      assetUsd: 1,
      amount: String(effectiveAmount),
      decimals: 18,
      estimatedBridgeFeeUsd: 0,
      bridgeFeeRate: 0.015,
      expectedNetUsd: effectiveAmount,
      quoteSource: 'Direct',
      updatedAt: Date.now(),
      expiresAt: Date.now() + 30000,
    }

    const paymentReceipt: PaymentReceipt = {
      id: `REC-${Date.now().toString(36).toUpperCase()}`,
      productName: effectiveProductName,
      quote: currentQuote,
      sender: effectiveActiveAddress || activeAddress,
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

  const handleRetryPersistence = async () => {
    if (!postTxRecovery || retryingPersistence) return
    setError('')

    // R1 & Blocker 7: Bound to original authenticated owner
    if (!user || user.isAnonymous) {
      setError('Debes iniciar sesión con la cuenta originaria para reintentar la persistencia.')
      openAuthModal('login')
      return
    }
    if (!postTxRecovery.originUid || user.uid !== postTxRecovery.originUid) {
      setError(`Esta recuperación pertenece a otra cuenta (${postTxRecovery.originUid || 'desconocida'}). Inicia sesión con la cuenta originaria.`)
      return
    }
    if (postTxRecovery.originWalletAddress) {
      if (!activeAddress || activeAddress.toLowerCase() !== postTxRecovery.originWalletAddress.toLowerCase()) {
        setError(`Esta recuperación requiere conectar la billetera originaria (${postTxRecovery.originWalletAddress}).`)
        return
      }
    }

    setRetryingPersistence(true)
    try {
      // Blocker 8: Retry must prove zero re-payment via dedicated helper
      const retryResult = await retryWalletMinerPurchase(postTxRecovery, {
        user,
        activeAddress,
        recordPurchaseToAdmin: customRecordPurchaseToAdmin ?? recordMinerPurchaseToAdmin,
        saveMinerToFirestore: savePurchasedMiner,
        creditReferral: creditDirectReferralCommission,
        linkActiveWallet: linkWallet,
        onSimulationStart: startMiningSimulation,
      })

      clearPostTxRecovery()
      setPostTxRecovery(null)
      setRetryingPersistence(false)

      const effectivePriceUsd = postTxRecovery.priceUsd ?? postTxRecovery.price
      const retryDest = PAYMENT_DESTINATIONS.find((d) => d.id === postTxRecovery.networkId) ?? activeDestination
      const explorerUrl = `${retryDest.blockExplorer}/tx/${postTxRecovery.txHash}`
      const currentQuote = quote ?? {
        networkId: postTxRecovery.networkId,
        networkName: postTxRecovery.networkName || activeDestination.name,
        asset: selectedAsset,
        recipient: activeDestination.address,
        catalogValue: postTxRecovery.amount,
        catalogCurrency: 'USD' as const,
        catalogUsd: effectivePriceUsd,
        fxDate: null,
        assetUsd: 1,
        amount: String(postTxRecovery.amount),
        decimals: 18,
        estimatedBridgeFeeUsd: 0,
        bridgeFeeRate: 0.015,
        expectedNetUsd: postTxRecovery.amount,
        quoteSource: 'Direct',
        updatedAt: Date.now(),
        expiresAt: Date.now() + 30000,
      }

      const paymentReceipt: PaymentReceipt = {
        id: `REC-${Date.now().toString(36).toUpperCase()}`,
        productName: postTxRecovery.productName,
        quote: currentQuote,
        sender: postTxRecovery.originWalletAddress || activeAddress,
        transactionHash: postTxRecovery.txHash,
        sourceStatus: 'submitted',
        bridgeStatus: 'not-applicable',
        sentAt: Date.now(),
        explorerUrl,
        minerId: retryResult?.createdMinerId || postTxRecovery.minerId,
      }

      setReceipt(paymentReceipt)
      onPaid(paymentReceipt)
    } catch (err) {
      console.error('Error retrying wallet miner purchase persistence:', err)
      const errMessage = err instanceof Error ? err.message : 'Error completando la persistencia del minero'
      const updatedRecovery: PostTxPendingState = {
        ...postTxRecovery,
        status: 'PERSISTENCE_PENDING',
        errorMessage: errMessage,
      }
      setPostTxRecovery(updatedRecovery)
      setError(errMessage)
      setRetryingPersistence(false)
    }
  }

  const handlePay = async () => {
    if (!quote) return
    if (!user || user.isAnonymous) {
      setError('Debes iniciar sesión con una cuenta registrada para completar la compra.')
      openAuthModal('register')
      return
    }
    const canonicalPackageId = packageId?.trim()
    const lowerPkg = canonicalPackageId?.toLowerCase() || ''
    if (!canonicalPackageId || lowerPkg.startsWith('pkg-miner_') || lowerPkg.startsWith('pkg-miner-') || lowerPkg.startsWith('pkg-miner')) {
      setError(`No se puede completar la compra sin un packageId canónico válido: '${packageId}'`)
      return
    }

    const targetMinerId = minerIdRef.current || propMinerId
    if (!targetMinerId || !targetMinerId.trim()) {
      setError('No se pudo determinar el identificador canónico del minero.')
      return
    }
    minerIdRef.current = targetMinerId

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

      const allocatedMinerId = targetMinerId
      minerIdRef.current = allocatedMinerId

      const initialRecovery: PostTxPendingState = {
        schemaVersion: 1,
        status: 'PAYMENT_TRANSMITTED',
        txHash,
        minerId: allocatedMinerId,
        packageId: canonicalPackageId,
        productName,
        amount,
        powerTh: parseMinerPowerTh(productName, amount),
        price: quote?.catalogUsd ?? amount,
        priceUsd: quote?.catalogUsd ?? amount,
        currency: 'USD',
        cadence: purchaseMode,
        purchaseMode,
        networkId,
        networkName: activeDestination.name,
        originWalletAddress: activeAddress || undefined,
        originUid: user?.uid || undefined,
        packageSnapshot: {
          packageId: canonicalPackageId,
          name: productName,
          powerTh: parseMinerPowerTh(productName, amount),
          price: quote?.catalogUsd ?? amount,
          currency: 'USD',
          cadence: purchaseMode,
          purchaseMode,
        },
        createdAt: Date.now(),
      }

      // Blocker 3: Immediately persist PAYMENT_TRANSMITTED upon receiving txHash before attempting Firestore persistence
      setPostTxRecovery(initialRecovery)

      await processPurchaseCompletion(txHash, allocatedMinerId, initialRecovery)
    } catch (err) {
      const classified = classifyPaymentError(err, activeDestination.name)
      setError(classified.message)
      setShowSimulateFallback(classified.showSimulateFallback)
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

        {(!user || user.isAnonymous) ? (
          /* Authentication Gate: Guest & Anonymous Users Blocked From Canonical Checkout */
          <div className="checkout-auth-gate" data-testid="checkout-auth-gate" style={{ textAlign: 'center', padding: '36px 16px' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>🔒</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', margin: '0 0 8px 0' }}>
              Inicia sesión para continuar
            </h3>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 auto 24px auto', maxWidth: 360, lineHeight: 1.5 }}>
              Para adquirir mineros y vincularlos a tu cuenta de forma segura, necesitas una cuenta registrada.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 300, margin: '0 auto' }}>
              <button
                type="button"
                className="button button-primary"
                data-testid="checkout-signup-btn"
                onClick={() => openAuthModal('register')}
              >
                Crear cuenta (Sign up)
              </button>
              <button
                type="button"
                className="button button-secondary"
                data-testid="checkout-signin-btn"
                onClick={() => openAuthModal('login')}
              >
                Ya tengo cuenta (Sign in)
              </button>
            </div>
          </div>
        ) : simulatedMiner ? (
          /* Pure Local Simulation View - Zero Blockchain / Zero Firestore / Zero Admin */
          <div className="checkout-receipt-view" data-testid="simulated-purchase-view">
            <div className="receipt-success-badge" style={{ background: '#3b82f6' }}>⚡</div>
            <h3>¡Simulación completada en modo prueba!</h3>
            <p className="receipt-desc">
              El minero ha sido activado en tu entorno de demostración local. No se realizaron cargos reales ni transacciones blockchain.
            </p>

            <div className="receipt-details-box">
              <div className="receipt-row">
                <span>Producto:</span>
                <strong>{simulatedMiner.name}</strong>
              </div>
              <div className="receipt-row">
                <span>Modo:</span>
                <strong style={{ color: '#3b82f6' }}>Simulación Local (Demo)</strong>
              </div>
              <div className="receipt-row">
                <span>ID Local:</span>
                <code>{simulatedMiner.id}</code>
              </div>
            </div>

            <div className="receipt-actions">
              <button
                type="button"
                className="button button-primary receipt-customize-btn"
                onClick={() => {
                  onClose(false)
                  navigate(`/miners/${simulatedMiner.id}/customize`)
                }}
              >
                Personalizar mi Minero Ahora ⚙
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => onClose(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : receipt ? (
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
                <strong>{receipt.productName || productName}</strong>
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
        ) : postTxRecovery ? (
          /* Post-Transaction Recovery View (PERSISTENCE_PENDING) */
          <div className="checkout-receipt-view" data-testid="post-tx-recovery-view">
            <div className="receipt-success-badge" style={{ background: '#f59e0b' }}>!</div>
            <h3>Pago transmitido en blockchain · Persistencia pendiente</h3>
            <p className="receipt-desc">
              Tu transacción fue enviada a la red con éxito, pero ocurrió un error al registrar el minero en Firestore. No vuelvas a realizar el pago.
            </p>

            <div className="receipt-details-box">
              <div className="receipt-row">
                <span>Estado:</span>
                <strong style={{ color: '#f59e0b' }}>{postTxRecovery.status}</strong>
              </div>
              <div className="receipt-row">
                <span>Hash de transacción:</span>
                <code className="receipt-hash">{postTxRecovery.txHash}</code>
              </div>
              <div className="receipt-row">
                <span>ID de minero:</span>
                <code>{postTxRecovery.minerId}</code>
              </div>
              {postTxRecovery.packageId && (
                <div className="receipt-row">
                  <span>Paquete canónico:</span>
                  <code>{postTxRecovery.packageId}</code>
                </div>
              )}
              <div className="receipt-row">
                <span>Detalle del error:</span>
                <span style={{ color: '#ef4444', fontSize: '0.9em' }}>{postTxRecovery.errorMessage}</span>
              </div>
            </div>

            <div className="receipt-actions">
              <a
                href={`${(PAYMENT_DESTINATIONS.find((d) => d.id === postTxRecovery.networkId) ?? activeDestination).blockExplorer}/tx/${postTxRecovery.txHash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="button button-secondary explorer-link-button"
              >
                Ver Tx en Explorador ↗
              </a>
              <button
                type="button"
                className="button button-primary"
                data-testid="retry-persistence-btn"
                disabled={retryingPersistence}
                onClick={handleRetryPersistence}
              >
                {retryingPersistence ? 'Reintentando registro...' : 'Reintentar persistencia'}
              </button>
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
                            const canonicalPackageId = packageId?.trim()
                            const lowerPkg = canonicalPackageId?.toLowerCase() || ''
                            if (!canonicalPackageId || lowerPkg.startsWith('pkg-miner_') || lowerPkg.startsWith('pkg-miner-') || lowerPkg.startsWith('pkg-miner')) {
                              setError(`No se puede completar la compra sin un packageId canónico válido: '${packageId}'`)
                              return
                            }
                            setError('')
                            setShowSimulateFallback(false)
                            setPaying(true)
                            try {
                              // Blocker B: Decoupled local simulation path - 0 Firestore, 0 Admin, 0 Referral, 0 Recovery, NO fake txHash
                              const simResult = buyDemoMiner({
                                name: productName,
                                powerTh: parseMinerPowerTh(productName, amount),
                                efficiency: 15,
                                price: 0,
                                purchaseMode,
                                ownerWallet: activeAddress || 'DEMO_SIMULATION',
                                packageId: canonicalPackageId,
                              })
                              if (simResult.ok) {
                                if (startMiningSimulation && simResult.miner) {
                                  startMiningSimulation(simResult.miner.id, simResult.miner.name, simResult.miner.powerTh)
                                }
                                setSimulatedMiner(simResult.miner ? { id: simResult.miner.id, name: simResult.miner.name } : null)
                              } else {
                                setError('No se pudo registrar la simulación local.')
                              }
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
