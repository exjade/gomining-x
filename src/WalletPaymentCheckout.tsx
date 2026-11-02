import { useCallback, useEffect, useRef, useState } from 'react'
import { PAYMENT_DESTINATIONS, type PaymentNetworkId } from './paymentDestinations'
import { CryptoIcon, type CryptoSymbol } from './CryptoIcon'
import { QuoteDetailsSkeleton } from './Skeletons'
import { fetchPaymentQuote, formatAssetAmount, formatCatalogPrice, formatUsd, type PaymentCurrency, type PaymentQuote } from './paymentQuote'
import type { ConnectedWallet, WalletId, WalletSession } from './walletSession'
import { buildCheckoutResumeUrl, getMobileWalletLaunchUrl, hasWalletBrowserProvider, isMobileBrowser, mobileTargetIsPublicHttps, mobileTargetUsesNgrokFreeDomain } from './walletAppLinks'
import { isWalletRejection } from './walletError'

export type PaymentReceipt = {
  id: string
  productName: string
  quote: PaymentQuote
  sender: string
  transactionHash: string
  sourceStatus: 'submitted'
  bridgeStatus: 'pending' | 'not-applicable'
  sentAt: number
}

export const networks: Array<{ id: PaymentNetworkId; label: string }> = [
  { id: 'bnb', label: 'BNB Chain · BNB' },
  { id: 'bitcoin', label: 'Bitcoin · BTC' },
  { id: 'ethereum', label: 'Ethereum · ETH' },
  { id: 'tron', label: 'TRON · TRX' },
  { id: 'solana', label: 'Solana · USDT SPL' },
  { id: 'polygon', label: 'Polygon · POL' },
]

export const walletOptions: Record<PaymentNetworkId, Array<{ id: WalletId; name: string }>> = {
  bnb: [{ id: 'metamask', name: 'MetaMask' }, { id: 'coinbase', name: 'Coinbase Wallet' }, { id: 'trustwallet', name: 'Trust Wallet' }],
  bitcoin: [{ id: 'unisat', name: 'UniSat' }],
  ethereum: [{ id: 'metamask', name: 'MetaMask' }, { id: 'coinbase', name: 'Coinbase Wallet' }, { id: 'trustwallet', name: 'Trust Wallet' }],
  tron: [{ id: 'tronlink', name: 'TronLink' }],
  solana: [{ id: 'solflare', name: 'Solflare' }, { id: 'phantom', name: 'Phantom' }],
  polygon: [{ id: 'metamask', name: 'MetaMask' }, { id: 'coinbase', name: 'Coinbase Wallet' }, { id: 'trustwallet', name: 'Trust Wallet' }],
}

export const initialWallet: Record<PaymentNetworkId, WalletId> = {
  bnb: 'metamask', bitcoin: 'unisat', ethereum: 'metamask', tron: 'tronlink', solana: 'solflare', polygon: 'metamask',
}

export function WalletPaymentCheckout({
  productName,
  amount,
  currency,
  session,
  initialNetworkId,
  initialWalletId,
  onClose,
  onResumeWalletConnect,
  onPaid,
}: {
  productName: string
  amount: number
  currency: PaymentCurrency
  session: WalletSession
  initialNetworkId?: PaymentNetworkId
  initialWalletId?: WalletId
  onClose: (requestPending?: boolean, notice?: string) => void
  onResumeWalletConnect: (url: string) => void
  onPaid: (receipt: PaymentReceipt) => void
}) {
  const [networkId, setNetworkId] = useState<PaymentNetworkId>(() => initialNetworkId ?? networkForConnection(session.connection))
  const [walletId, setWalletId] = useState<WalletId>(() => {
    const network = initialNetworkId ?? networkForConnection(session.connection)
    const preferredWallet = initialWalletId ?? session.connection?.id
    return preferredWallet && walletOptions[network].some((option) => option.id === preferredWallet)
      ? preferredWallet
      : initialWallet[network]
  })
  const [quote, setQuote] = useState<PaymentQuote | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [sending, setSending] = useState(false)
  const [walletRequestPending, setWalletRequestPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null)
  const [nativePaymentUrl, setNativePaymentUrl] = useState('')
  const [now, setNow] = useState(Date.now())
  const closedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const onPaidRef = useRef(onPaid)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => { onPaidRef.current = onPaid }, [onPaid])

  const refreshQuote = useCallback(async () => {
    setLoadingQuote(true)
    setError('')
    setNativePaymentUrl('')
    try {
      setQuote(await fetchPaymentQuote(amount, currency, networkId))
    } catch (cause) {
      setQuote(null)
      setError(cause instanceof Error ? cause.message : 'No se pudo obtener la cotización.')
    } finally {
      setLoadingQuote(false)
    }
  }, [amount, currency, networkId])

  useEffect(() => { void refreshQuote() }, [refreshQuote])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const compatible = walletOptions[networkId]
    if (!compatible.some((option) => option.id === walletId)) setWalletId(initialWallet[networkId])
  }, [networkId, walletId])

  const connected = session.connection
  const selectedWallet = walletOptions[networkId].find((option) => option.id === walletId)
  const connectionCompatible = Boolean(connected && connected.id === walletId)
  const quoteFresh = Boolean(quote && now < quote.expiresAt)
  const selfPayment = Boolean(connectionCompatible && connected && quote && sameWalletAddress(connected.address, quote.recipient))
  const mobile = isMobileBrowser()
  const walletTestMode = getLocalWalletTestMode()
  const resumeUrl = typeof window === 'undefined' ? '' : buildCheckoutResumeUrl(window.location.href, { productName, amount, currency, networkId, walletId })
  const mobileAppLink = mobile && selectedWallet && mobileTargetIsPublicHttps(resumeUrl)
    ? getMobileWalletLaunchUrl(walletId, resumeUrl, networkId)
    : null
  const shouldOpenWalletApp = Boolean(mobile && mobileAppLink && !hasWalletBrowserProvider(walletId) && !connectionCompatible)
  const mobileSolflareNativeAvailable = Boolean(mobile && walletId === 'solflare' && mobileTargetIsPublicHttps(resumeUrl))
  const mobilePhantomNativeAvailable = Boolean(mobile && walletId === 'phantom' && mobileTargetIsPublicHttps(resumeUrl))
  const mobilePhantomNativeNeedsHttps = Boolean(mobile && walletId === 'phantom' && !hasWalletBrowserProvider('phantom') && !mobileTargetIsPublicHttps(resumeUrl))
  const metaMaskMobileNeedsHttps = Boolean(mobile && walletId === 'metamask' && !hasWalletBrowserProvider(walletId) && !mobileTargetIsPublicHttps(resumeUrl))
  const mobileWalletUnavailable = Boolean(mobile && !mobileAppLink && !hasWalletBrowserProvider(walletId) && !connectionCompatible && !mobileSolflareNativeAvailable && !mobilePhantomNativeAvailable && (walletId !== 'metamask' || metaMaskMobileNeedsHttps))
  const closeCheckout = useCallback((requestPending = Boolean(walletRequestPending || session.connectingWallet), closeNotice?: string) => {
    if (closedRef.current) return
    closedRef.current = true
    if (session.connectingWallet) session.cancelConnect()
    onCloseRef.current(requestPending, closeNotice)
  }, [session.cancelConnect, session.connectingWallet, walletRequestPending])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCheckout()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeCheckout])

  useEffect(() => {
    const returned = session.solflarePaymentReturn
    if (!returned) return
    session.consumeSolflarePaymentReturn()
    setNativePaymentUrl('')
    setWalletRequestPending(false)
    if (returned.status === 'rejected') {
      setError(returned.message)
      setNotice('')
      return
    }
    if (returned.productName !== productName || returned.quote.catalogValue !== amount || returned.quote.catalogCurrency !== currency) {
      setError('La respuesta de Solflare no coincide con el producto y el importe visibles. Revisa el explorador de la red antes de crear otro pago.')
      return
    }
    const destination = PAYMENT_DESTINATIONS.find((item) => item.id === returned.quote.networkId)
    if (!destination) {
      setError('La respuesta de Solflare contiene una red que no está habilitada en este checkout.')
      return
    }
    const paymentReceipt: PaymentReceipt = {
      id: `PAY-${Date.now().toString(36).toUpperCase()}`,
      productName: returned.productName,
      quote: returned.quote,
      sender: returned.sender,
      transactionHash: returned.signature,
      sourceStatus: 'submitted',
      bridgeStatus: destination.route === 'solflare-bridge' ? 'pending' : 'not-applicable',
      sentAt: returned.sentAt,
    }
    setReceipt(paymentReceipt)
    onPaidRef.current(paymentReceipt)
  }, [amount, currency, productName, session.consumeSolflarePaymentReturn, session.solflarePaymentReturn])

  useEffect(() => {
    const returned = session.phantomPaymentReturn
    if (!returned) return
    session.consumePhantomPaymentReturn()
    setNativePaymentUrl('')
    setWalletRequestPending(false)
    if (returned.status === 'rejected') {
      setError(returned.message)
      setNotice('')
      return
    }
    if (returned.productName !== productName || returned.quote.catalogValue !== amount || returned.quote.catalogCurrency !== currency) {
      setError('La respuesta de Phantom no coincide con el producto y el importe visibles. Revisa el explorador de Solana antes de crear otro pago.')
      return
    }
    if (returned.quote.networkId !== 'solana' || returned.quote.asset !== 'USDT' || walletId !== 'phantom') {
      setError('La respuesta de Phantom no coincide con el pago USDT SPL seleccionado.')
      return
    }
    const destination = PAYMENT_DESTINATIONS.find((item) => item.id === 'solana')
    if (!destination) {
      setError('La respuesta de Phantom contiene una red que no está habilitada en este checkout.')
      return
    }
    const paymentReceipt: PaymentReceipt = {
      id: `PAY-${Date.now().toString(36).toUpperCase()}`,
      productName: returned.productName,
      quote: returned.quote,
      sender: returned.sender,
      transactionHash: returned.signature,
      sourceStatus: 'submitted',
      bridgeStatus: destination.route === 'solflare-bridge' ? 'pending' : 'not-applicable',
      sentAt: returned.sentAt,
    }
    setReceipt(paymentReceipt)
    onPaidRef.current(paymentReceipt)
  }, [amount, currency, productName, session.consumePhantomPaymentReturn, session.phantomPaymentReturn, walletId])

  const chooseNetwork = (value: PaymentNetworkId) => {
    setNetworkId(value)
    setQuote(null)
    setNativePaymentUrl('')
    setNotice('')
    setError('')
  }

  const requestPayment = async () => {
    if (closedRef.current || !connected || connected.id !== walletId || !quote || sending) return
    if (sameWalletAddress(connected.address, quote.recipient)) {
      setError('La wallet conectada es también el destino receptor. Conecta otra cuenta para pagar; no se envió nada.')
      return
    }
    setSending(true)
    setError('')
    setNotice('')
    setNativePaymentUrl('')
    try {
      const fresh = await fetchPaymentQuote(amount, currency, networkId)
      // The quote request can take several seconds. If the buyer closed the
      // checkout while it was refreshing, do not open a wallet prompt later.
      if (closedRef.current) return
      const rateMoved = Math.abs(fresh.assetUsd - quote.assetUsd) / quote.assetUsd > 0.001
      const freshAmount = Number(fresh.amount)
      const currentAmount = Number(quote.amount)
      const amountMoved = !Number.isFinite(freshAmount) || !Number.isFinite(currentAmount) || currentAmount <= 0
        || Math.abs(freshAmount - currentAmount) / currentAmount > 0.001
      const fxMoved = fresh.usdMxnRate !== quote.usdMxnRate
      if (Date.now() >= quote.expiresAt || amountMoved || rateMoved || fxMoved) {
        setQuote(fresh)
        setNotice('La cotización se actualizó. Revisa el nuevo importe y vuelve a pulsar para abrir tu wallet.')
        return
      }
      // Keep the displayed amount and receipt aligned with the exact quote
      // used for the transaction. Sub-0.1% market movement is small enough to
      // use the refreshed amount; the wallet still shows the final amount and gas.
      setQuote(fresh)
      if (connected.preparePayment) {
        setWalletRequestPending(false)
        const url = await connected.preparePayment(fresh, { productName, returnUrl: resumeUrl })
        if (closedRef.current) return
        setNativePaymentUrl(url)
        setNotice('La operación está preparada. Comprueba la red y el importe; abre Solflare para revisar y aprobarla allí.')
        return
      }
      setWalletRequestPending(true)
      const transactionHash = await connected.sendPayment(fresh, { productName, returnUrl: resumeUrl })
      const destination = PAYMENT_DESTINATIONS.find((item) => item.id === networkId)!
      const paymentReceipt: PaymentReceipt = {
        id: `PAY-${Date.now().toString(36).toUpperCase()}`,
        productName,
        quote: fresh,
        sender: connected.address,
        transactionHash,
        sourceStatus: 'submitted',
        bridgeStatus: destination.route === 'solflare-bridge' ? 'pending' : 'not-applicable',
        sentAt: Date.now(),
      }
      if (!closedRef.current) setReceipt(paymentReceipt)
      // Closing the page cannot cancel a wallet RPC already in progress. If it
      // eventually succeeds, keep the returned hash in the parent session.
      onPaid(paymentReceipt)
    } catch (cause) {
      if (closedRef.current) return
      if (isWalletRequestRejected(cause)) {
        closeCheckout(false, 'Cancelaste la solicitud en tu wallet. No se envió ningún pago.')
        return
      }
      setError(walletErrorMessage(cause))
    } finally {
      if (!closedRef.current) {
        setWalletRequestPending(false)
        setSending(false)
      }
    }
  }

  const connectSelectedWallet = async () => {
    if (!selectedWallet || closedRef.current) return
    // MetaMask Connect may switch to its native app and later reconstruct the
    // page from the dapp URL. Persist the checkout in the real browser URL
    // before handing off so a reload/resume restores the same product and chain.
    if (((selectedWallet.id === 'metamask' && !hasWalletBrowserProvider('metamask')) || (selectedWallet.id === 'solflare' && !hasWalletBrowserProvider('solflare')) || (selectedWallet.id === 'phantom' && !hasWalletBrowserProvider('phantom'))) && mobile) {
      onResumeWalletConnect(resumeUrl)
    }
    const result = await session.connect(selectedWallet.id, networkId, resumeUrl)
    if (result === 'rejected') {
      closeCheckout(false, 'Cancelaste la conexión en tu wallet. No se envió ningún pago.')
    }
  }

  return <div className="modal-backdrop wallet-payment-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) closeCheckout() }}>
    <section className="purchase-modal wallet-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-payment-title">
      <button className="modal-close" type="button" aria-label="Cerrar pago" onClick={() => closeCheckout()}>×</button>
      {receipt ? <PaymentReceiptView receipt={receipt} productName={productName} onClose={() => closeCheckout(false)} walletTestMode={walletTestMode} /> : <>
        <p className="eyebrow">CHECKOUT · CONNECT WALLET</p>
        <h2 id="wallet-payment-title">Pagar {productName}</h2>
        {walletTestMode && <div className="simulation-warning" role="note"><span>SIMULACIÓN</span><span>Modo de simulación local · {walletTestMode}. No se abrió una wallet ni se emitió una transacción.</span></div>}
        <p className="purchase-muted">El precio del catálogo conserva su moneda. La cantidad cripto se calcula con el precio público del activo y, para MXN, el tipo de cambio de referencia más reciente.</p>

        <label className="field-label payment-network-field">Red y activo de pago
          <span className="payment-network-preview"><span className="payment-network-icons"><CryptoIcon symbol={networkId === 'solana' ? 'SOL' : networkAsset(networkId)} size="md" />{networkId === 'solana' && <CryptoIcon symbol="USDT" size="sm" />}</span><span><strong>{networks.find((network) => network.id === networkId)?.label}</strong><small>{networkId === 'solana' ? 'USDT SPL · red Solana' : `Pago de origen en ${networkAsset(networkId)}`}</small></span></span>
          <select value={networkId} onChange={(event) => chooseNetwork(event.target.value as PaymentNetworkId)}>{networks.map((network) => <option value={network.id} key={network.id}>{network.label}</option>)}</select>
        </label>
        <label className="field-label">Wallet para esta red<select value={walletId} onChange={(event) => setWalletId(event.target.value as WalletId)}>{walletOptions[networkId].map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name}</option>)}</select></label>

        <div className="wallet-payment-quote" aria-live="polite">
          <div className="wallet-payment-quote-total"><span>Precio del catálogo</span><strong>{formatCatalogPrice(amount, currency)}</strong></div>
          {loadingQuote && !quote && <QuoteDetailsSkeleton />}
          {loadingQuote && quote && <p className="quote-refreshing" role="status"><i /> Actualizando cotización…</p>}
          {quote && <>
            {quote.catalogCurrency === 'MXN' && <div className="wallet-payment-quote-main"><span>Equivalente de cálculo</span><strong>{formatUsd(quote.catalogUsd)}</strong></div>}
            <div className="wallet-payment-quote-main"><span>Enviar</span><strong className="wallet-payment-amount"><CryptoIcon symbol={quote.asset as CryptoSymbol} size="sm" />{formatAssetAmount(quote.amount, quote.asset)}</strong></div>
            <dl>
              <div><dt>Precio de {quote.asset}</dt><dd>{formatUsd(quote.assetUsd)} · {quote.quoteSource}</dd></div>
              {quote.usdMxnRate && quote.fxDate && <div><dt>Tipo de cambio de referencia</dt><dd>1 USD = {quote.usdMxnRate.toFixed(4)} MXN · {quote.fxDate}</dd></div>}
              {quote.bridgeFeeRate > 0 && <><div><dt>Comisión Bridge estimada</dt><dd>{formatUsd(quote.estimatedBridgeFeeUsd)} · 1%</dd></div><div><dt>USDT neto estimado</dt><dd>{formatUsd(quote.expectedNetUsd)}</dd></div></>}
              {quote.networkId === 'solana' && <div><dt>Conversión</dt><dd>USDT SPL directo · sin Bridge</dd></div>}
              <div><dt>Gas de red</dt><dd>Lo calcula y muestra tu wallet antes de aprobar</dd></div>
              <div><dt>Destino</dt><dd><code>{quote.recipient}</code></dd></div>
              <div><dt>Cotización actualizada</dt><dd>{new Date(quote.updatedAt).toLocaleTimeString('es-MX')} · {quoteFresh ? 'válida 30 s' : 'vencida · actualiza antes de pagar'}</dd></div>
            </dl>
          </>}
        </div>

        {networkId !== 'solana' && <div className="simulation-warning"><span>i</span><span>El 1% de Bridge y el importe neto son estimaciones. La ruta puede tener hasta 5% de slippage; mínimos, liquidez y gas cambian. Esta pantalla no confirma la llegada final del USDT.</span></div>}
        {networkId === 'solana' && <div className="simulation-warning"><span>i</span><span>Solo se envía USDT SPL al destino indicado. Si la cuenta receptora no tiene su token account, la transacción puede pagar su creación con SOL; la wallet mostrará el costo.</span></div>}

        {connected && !connectionCompatible && <div className="wallet-payment-mismatch">Está conectada {connected.name}. Para esta red conecta {selectedWallet?.name}.</div>}
        {connectionCompatible && quote && <div className="wallet-payment-sender"><span>Remitente conectado</span><code>{(connected as ConnectedWallet).address}</code></div>}
        {selfPayment && <div className="wallet-payment-mismatch" role="alert">Esta misma dirección es la receptora del pago. Conecta una cuenta de comprador distinta; enviar desde aquí sería pagarte a ti mismo y gastarías gas sin completar una compra.</div>}
        {notice && <div className="inline-feedback" role="status">{notice}</div>}
        {error && <div className="wallet-error" role="alert">{error}</div>}
        {session.error && <div className="wallet-error" role="alert">{session.error}</div>}
        {(walletRequestPending || session.connectingWallet) && <div className="wallet-request-pending" role="status">La wallet tiene una solicitud abierta. Puedes cerrar esta pantalla; eso no cancela la aprobación pendiente. Revisa la actividad de tu wallet antes de volver a intentar.</div>}

        <div className="wallet-payment-actions">
          {!connectionCompatible ? shouldOpenWalletApp && mobileAppLink
            ? <a className="button button-primary" href={mobileAppLink}>Abrir {selectedWallet?.name} y conectar <span>↗</span></a>
            : <button className="button button-primary" type="button" disabled={Boolean(session.connectingWallet) || !selectedWallet || mobileWalletUnavailable} onClick={() => void connectSelectedWallet()}>{session.connectingWallet ? 'Conectando…' : mobileWalletUnavailable ? `${selectedWallet?.name ?? 'Wallet'} no disponible aquí` : `Conectar ${selectedWallet?.name ?? 'wallet'}`}</button>
            : connected?.preparePayment
              ? nativePaymentUrl && quoteFresh
                ? <a className="button button-primary" href={nativePaymentUrl} onClick={() => { setWalletRequestPending(true); setError('') }}>Abrir {connected?.name} y aprobar {quote ? formatAssetAmount(quote.amount, quote.asset) : ''} <span>↗</span></a>
                : <button className="button button-primary" type="button" disabled={!quoteFresh || loadingQuote || sending || selfPayment || walletRequestPending} onClick={() => void requestPayment()}>{sending ? 'Preparando transacción…' : `Preparar pago ${quote ? formatAssetAmount(quote.amount, quote.asset) : ''}`}</button>
              : <button className="button button-primary" type="button" disabled={!quoteFresh || loadingQuote || sending || selfPayment} onClick={() => void requestPayment()}>{sending ? walletRequestPending ? 'Espera la wallet…' : 'Actualizando importe…' : `Pagar ${quote ? formatAssetAmount(quote.amount, quote.asset) : ''}`}</button>}
          <button className="button button-secondary" type="button" disabled={loadingQuote || sending} onClick={() => void refreshQuote()}>Actualizar cotización</button>
          <button className="button button-quiet" type="button" onClick={() => closeCheckout()}>{walletRequestPending || session.connectingWallet ? 'Cerrar pantalla' : 'Cancelar'}</button>
        </div>
        {!connected && !(mobile && walletId === 'metamask') && !(mobile && walletId === 'solflare') && !(mobile && walletId === 'phantom') && <p className="wallet-payment-origin-note">Cada sitio pide permiso por separado. Si conectaste la wallet en GoMining, conéctala aquí una vez; después se reutiliza en compras y recargas.</p>}
        {mobile && !mobileAppLink && !hasWalletBrowserProvider(walletId) && walletId !== 'metamask' && walletId !== 'solflare' && walletId !== 'phantom' && <p className="wallet-payment-origin-note">Esta wallet no tiene un enlace móvil directo desde el checkout. Abre el dominio HTTPS de la réplica en el navegador interno de {selectedWallet?.name ?? 'la wallet'}.</p>}
        {mobile && walletId === 'metamask' && !hasWalletBrowserProvider(walletId) && !metaMaskMobileNeedsHttps && <p className="wallet-payment-origin-note">MetaMask Connect abrirá la aplicación MetaMask para autorizar la conexión y volver a este checkout. Conectar no firma ni envía el pago.</p>}
        {mobile && walletId === 'metamask' && !hasWalletBrowserProvider(walletId) && !metaMaskMobileNeedsHttps && <p className="wallet-payment-origin-note">Se solicitará la conexión en la app MetaMask. Después vuelve a esta pestaña; la compra y la cotización se conservarán. Si MetaMask queda abierta, regresa con el selector de aplicaciones del teléfono y revisa su actividad antes de volver a intentarlo.</p>}
        {mobile && walletId === 'metamask' && mobileTargetUsesNgrokFreeDomain(resumeUrl) && <p className="wallet-payment-origin-note wallet-payment-origin-warning">Este dominio ngrok gratuito muestra un aviso intermedio que MetaMask no puede omitir al volver. Para probar la conexión y conservar este checkout, abre el mismo flujo en el enlace HTTPS temporal sin aviso que aparece en la guía del proyecto.</p>}
        {mobile && walletId === 'solflare' && !hasWalletBrowserProvider(walletId) && mobileSolflareNativeAvailable && <p className="wallet-payment-origin-note">Solflare abrirá su aplicación con una solicitud cifrada y regresará a este checkout. Al pagar, revisarás la transacción y aprobarás el envío en la propia wallet.</p>}
        {mobile && walletId === 'solflare' && !hasWalletBrowserProvider(walletId) && !mobileSolflareNativeAvailable && <p className="wallet-payment-origin-note">Solflare necesita un dominio HTTPS público para abrir su aplicación y regresar a esta página. Una dirección local como localhost no se puede abrir desde el teléfono.</p>}
        {mobile && walletId === 'phantom' && !hasWalletBrowserProvider(walletId) && mobilePhantomNativeAvailable && <p className="wallet-payment-origin-note">Phantom abrirá su aplicación mediante una solicitud cifrada y regresará a este checkout. Al pagar, revisarás y aprobarás USDT SPL en Phantom.</p>}
        {mobilePhantomNativeNeedsHttps && <p className="wallet-payment-origin-note">Phantom necesita el dominio HTTPS público de la réplica para abrir su aplicación y regresar al checkout. Una dirección local como localhost no se puede abrir desde el teléfono.</p>}
        {metaMaskMobileNeedsHttps && <p className="wallet-payment-origin-note">MetaMask Connect necesita el dominio HTTPS público de la réplica para abrir la aplicación y regresar al checkout. Una dirección local como localhost no se puede abrir desde el teléfono.</p>}
        {connectionCompatible && <p className="wallet-payment-approval-note">{connected?.preparePayment ? `Prepara el importe y después abre ${connected.name} para revisar la transacción.` : `Al pulsar Pagar se abrirá ${connected?.name}.`} Revisa red, destino, importe y gas en la wallet. La transferencia solo ocurre si la apruebas.</p>}
      </>}
    </section>
  </div>
}

function PaymentReceiptView({ receipt, productName, onClose, walletTestMode }: { receipt: PaymentReceipt; productName: string; onClose: () => void; walletTestMode: string }) {
  const explorer = transactionExplorer(receipt.quote.networkId, receipt.transactionHash)
  return <>
    <div className="purchase-success-mark">✓</div><p className="eyebrow">RECIBO DE TRANSFERENCIA</p>
    <h2 id="wallet-payment-title">Transferencia enviada desde la wallet</h2>
    <p className="purchase-muted">{productName} · {formatCatalogPrice(receipt.quote.catalogValue, receipt.quote.catalogCurrency)} · referencia {receipt.id}</p>
    {walletTestMode && <div className="simulation-warning" role="note"><span>SIMULACIÓN</span><span>Recibo simulado de QA · el hash es ficticio y no existe una transacción en la red.</span></div>}
    <div className="receipt-lines">
      <div className="receipt-line"><span>Importe de origen</span><strong>{formatAssetAmount(receipt.quote.amount, receipt.quote.asset)}</strong></div>
      <div className="receipt-line"><span>Remitente</span><strong><code>{receipt.sender}</code></strong></div>
      <div className="receipt-line"><span>Destino · {receipt.quote.networkName}</span><strong><code>{receipt.quote.recipient}</code></strong></div>
      <div className="receipt-line"><span>Estado de origen</span><strong>Enviada · confirmación no verificada</strong></div>
      <div className="receipt-line"><span>Conversión Bridge</span><strong>{receipt.bridgeStatus === 'pending' ? 'Pendiente · no verificada' : 'No aplica · USDT SPL directo'}</strong></div>
    </div>
    <div className="wallet-payment-hash"><span>Hash de la transferencia</span><code>{receipt.transactionHash}</code>{explorer && <a href={explorer} target="_blank" rel="noreferrer">Abrir explorador ↗</a>}</div>
    <div className="simulation-warning"><span>i</span><span>El hash lo devolvió la wallet. Esta réplica no verifica confirmaciones, no asocia el depósito a una orden y no activa ni entrega el minero o suscripción. En redes Bridge, verifica el resultado final en Solflare.</span></div>
    <div className="purchase-modal-actions"><button className="button button-primary" type="button" onClick={onClose}>Cerrar recibo <span>✓</span></button></div>
  </>
}

function getLocalWalletTestMode() {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return ''
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return ''
  const requested = new URLSearchParams(window.location.search).get('gmWalletTest') ?? ''
  return ['connect-reject', 'connect-pending', 'payment-reject', 'payment-success'].includes(requested) ? requested : ''
}

function transactionExplorer(networkId: PaymentNetworkId, hash: string) {
  const url: Partial<Record<PaymentNetworkId, string>> = {
    bnb: `https://bscscan.com/tx/${encodeURIComponent(hash)}`,
    bitcoin: `https://mempool.space/tx/${encodeURIComponent(hash)}`,
    ethereum: `https://etherscan.io/tx/${encodeURIComponent(hash)}`,
    tron: `https://tronscan.org/#/transaction/${encodeURIComponent(hash)}`,
    solana: `https://solscan.io/tx/${encodeURIComponent(hash)}`,
    polygon: `https://polygonscan.com/tx/${encodeURIComponent(hash)}`,
  }
  return url[networkId]
}

export function networkForConnection(connection: ConnectedWallet | null): PaymentNetworkId {
  if (!connection) return 'bnb'
  if (connection.id === 'solflare' || connection.id === 'phantom') return 'solana'
  if (connection.id === 'tronlink') return 'tron'
  if (connection.id === 'unisat') return 'bitcoin'
  if (connection.network.includes('BNB Chain')) return 'bnb'
  if (connection.network.includes('Polygon')) return 'polygon'
  return 'ethereum'
}

function walletErrorMessage(error: unknown) {
  if (isWalletRejection(error)) return 'Rechazaste o cancelaste en la wallet. No se creó un recibo de pago.'
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : 'No se pudo enviar la transacción.'
  return message || 'No se pudo enviar la transacción.'
}

function isWalletRequestRejected(error: unknown) {
  return isWalletRejection(error)
}

function sameWalletAddress(first: string, second: string) {
  const isEvmAddress = /^0x/i.test(first) && /^0x/i.test(second)
  return isEvmAddress ? first.toLowerCase() === second.toLowerCase() : first === second
}

function networkAsset(networkId: PaymentNetworkId): CryptoSymbol {
  const assets: Record<PaymentNetworkId, CryptoSymbol> = {
    bnb: 'BNB', bitcoin: 'BTC', ethereum: 'ETH', tron: 'TRX', solana: 'USDT', polygon: 'POL',
  }
  return assets[networkId]
}
