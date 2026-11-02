import { useState } from 'react'
import type { WalletId, WalletSession } from './walletSession'
import { WalletIdentitySkeleton } from './Skeletons'
import { getMobileWalletLaunchUrl, hasWalletBrowserProvider, isMobileBrowser, mobileTargetIsPublicHttps, mobileTargetUsesNgrokFreeDomain } from './walletAppLinks'
import type { PaymentNetworkId } from './paymentDestinations'

const walletOptions: Array<{ id: WalletId; icon: string; name: string; protocol: string; description: string; badge: string; networks: string }> = [
  { id: 'solflare', icon: '◉', name: 'Solflare', protocol: 'Solana · app y extensión', description: 'Conecta y paga únicamente con USDT SPL.', badge: 'SOLANA', networks: 'USDT SPL' },
  { id: 'phantom', icon: '✦', name: 'Phantom', protocol: 'Solana · app y extensión', description: 'Conecta y paga únicamente con USDT SPL.', badge: 'SOLANA', networks: 'USDT SPL' },
  { id: 'metamask', icon: '◇', name: 'MetaMask', protocol: 'EIP-1193 · aplicación y extensión', description: 'Abre la aplicación para autorizar la conexión y regresar a la réplica. Paga activo nativo en BNB Chain, Ethereum o Polygon.', badge: 'EVM', networks: 'BNB · ETH · POL' },
  { id: 'coinbase', icon: '◈', name: 'Coinbase Wallet', protocol: 'EIP-1193 · app y extensión', description: 'Paga activo nativo en BNB Chain, Ethereum o Polygon.', badge: 'EVM', networks: 'BNB · ETH · POL' },
  { id: 'trustwallet', icon: '◉', name: 'Trust Wallet', protocol: 'EIP-1193 · app y extensión', description: 'Paga activo nativo en BNB Chain, Ethereum o Polygon.', badge: 'EVM', networks: 'BNB · ETH · POL' },
  { id: 'tronlink', icon: '◉', name: 'TronLink', protocol: 'TRON · app y extensión', description: 'Paga con TRX nativo en la red principal de TRON.', badge: 'TRON', networks: 'TRX' },
  { id: 'unisat', icon: '₿', name: 'UniSat', protocol: 'Bitcoin · extensión', description: 'Paga con BTC nativo en Bitcoin Mainnet.', badge: 'BITCOIN', networks: 'BTC' },
]

const mobileNetworkByWallet: Partial<Record<WalletId, PaymentNetworkId>> = {
  solflare: 'solana', phantom: 'solana', metamask: 'bnb', coinbase: 'bnb', trustwallet: 'bnb', tronlink: 'tron', unisat: 'bitcoin',
}

export function WalletPanel({ session }: { session: WalletSession }) {
  const [copyMessage, setCopyMessage] = useState('')
  const [walletPickerOpen, setWalletPickerOpen] = useState(true)
  const connected = session.connection
  const pageUrl = typeof window === 'undefined' ? '' : window.location.href

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopyMessage('Dirección copiada')
    } catch {
      setCopyMessage('No se pudo copiar. Selecciona la dirección y cópiala.')
    }
  }

  return <div className="wallet-page-stack">
    <section className="content-panel wallet-checkout-panel" aria-labelledby="wallet-checkout-title">
      <div className="wallet-checkout-heading">
        <div className="wallet-checkout-mark" aria-hidden="true">↗</div>
        <div><p className="card-kicker">CARTERA</p><h1 id="wallet-checkout-title">Conecta tu wallet</h1><p>La dirección conectada se reutiliza en los flujos de compra y recarga.</p></div>
        <span className={`wallet-checkout-status ${connected ? 'wallet-checkout-status-connected' : ''}`}><i />{connected ? 'CONECTADA' : session.restoringWallet ? 'REVISANDO' : 'SIN CONECTAR'}</span>
      </div>

      {connected && <div className="wallet-connected-box">
        <div className="wallet-connected-heading"><span className="wallet-status-pill"><span />Conectada</span><strong>{connected.name}</strong><button type="button" className="button button-quiet" onClick={() => void session.disconnect()}>Desconectar</button></div>
        <div className="wallet-connected-details"><span>{connected.network} · {connected.protocol}</span><code>{connected.address}</code><button className="button button-quiet" type="button" onClick={() => void copyAddress(connected.address)}>Copiar</button></div>
      </div>}
      {!connected && session.restoringWallet && <WalletIdentitySkeleton />}

      <div className="wallet-payment-gate" role="note"><span aria-hidden="true">i</span><div><strong>La conexión no envía fondos</strong><p>Compras y recargas abren su propio checkout, detectan esta wallet y muestran ahí el importe antes de pedir aprobación.</p></div></div>
      {isMobileBrowser() && !mobileTargetIsPublicHttps(pageUrl) && <div className="wallet-mobile-note" role="note">Para conectar MetaMask desde el navegador del teléfono, abre la réplica desde un dominio HTTPS público. `localhost` solo apunta al propio teléfono.</div>}
      {isMobileBrowser() && mobileTargetUsesNgrokFreeDomain(pageUrl) && <div className="wallet-mobile-note wallet-mobile-note-warning" role="note">Este dominio ngrok gratuito muestra un aviso antes de abrir la réplica. Al volver desde MetaMask, ese aviso puede interrumpir la conexión. Para probar el regreso, usa el enlace HTTPS temporal sin aviso que aparece en la guía del proyecto o el dominio oficial.</div>}
    </section>

    <section className="content-panel wallet-connect-panel" aria-labelledby="wallet-options-title">
      <div className="panel-toolbar wallet-options-toolbar"><div><p className="card-kicker">CARTERAS DISPONIBLES</p><h2 id="wallet-options-title">Conectar una wallet</h2><p>En computadora usa una extensión. En celular, MetaMask abre su aplicación para autorizar y vuelve a esta página; las demás carteras usan sus enlaces compatibles. No se solicita frase semilla.</p></div><span className="wallet-read-badge">CONEXIÓN DIRECTA</span></div>
      <button className="button button-primary wallet-open-picker" type="button" onClick={() => setWalletPickerOpen((open) => !open)} aria-expanded={walletPickerOpen}>{walletPickerOpen ? 'Ocultar carteras' : 'Ver carteras'}</button>

      {walletPickerOpen && <div className="wallet-options-grid" id="wallet-picker">{walletOptions.map((option) => {
        const isConnected = connected?.id === option.id
        const isLoading = session.connectingWallet === option.id
        const mobileNetwork = mobileNetworkByWallet[option.id]
        const mobileLink = mobileNetwork && mobileTargetIsPublicHttps(pageUrl) ? getMobileWalletLaunchUrl(option.id, pageUrl, mobileNetwork) : null
        const solflareNativeAvailable = isMobileBrowser() && option.id === 'solflare' && mobileTargetIsPublicHttps(pageUrl)
        const metaMaskMobileNeedsHttps = isMobileBrowser() && option.id === 'metamask' && !hasWalletBrowserProvider(option.id) && !mobileTargetIsPublicHttps(pageUrl)
        const mobileUnavailable = isMobileBrowser() && !mobileLink && !hasWalletBrowserProvider(option.id) && !solflareNativeAvailable && (option.id !== 'metamask' || metaMaskMobileNeedsHttps)
        const openMobileAppToConnect = isMobileBrowser() && Boolean(mobileLink) && !hasWalletBrowserProvider(option.id) && !isConnected
        return <article className={`wallet-option wallet-option-${option.id} ${isConnected ? 'wallet-option-connected' : ''}`} key={option.id}>
          <div className="wallet-option-icon" aria-hidden="true">{option.icon}</div>
          <div className="wallet-option-copy"><div className="wallet-option-heading"><h3>{option.name}</h3><span>{option.badge}</span></div><small>{option.protocol} · {option.networks}</small><p>{option.description}</p></div>
          <div className="wallet-option-actions">{openMobileAppToConnect
            ? <a className="button button-primary wallet-app-link" href={mobileLink!}>Abrir {option.name} y conectar <span>↗</span></a>
            : <button className={isConnected ? 'button button-secondary' : 'button button-primary'} type="button" disabled={Boolean(session.connectingWallet) || mobileUnavailable || isConnected} onClick={() => void session.connect(option.id, mobileNetwork, pageUrl)}>{isLoading ? 'Conectando…' : isConnected ? 'Conectada' : mobileUnavailable ? 'Móvil no disponible' : option.id === 'metamask' && isMobileBrowser() && !hasWalletBrowserProvider('metamask') ? 'Conectar MetaMask' : option.id === 'solflare' && solflareNativeAvailable && !hasWalletBrowserProvider('solflare') ? 'Abrir Solflare y conectar' : 'Conectar'}</button>}
            {mobileUnavailable && <small className="wallet-mobile-unavailable">{option.id === 'metamask' ? 'MetaMask Connect necesita un dominio HTTPS público para abrir la aplicación y regresar a esta página.' : option.id === 'solflare' ? 'Solflare necesita un dominio HTTPS público para autorizar en su aplicación y regresar a esta página.' : 'No hay una conexión móvil directa configurada para esta wallet.'}</small>}
            {solflareNativeAvailable && !hasWalletBrowserProvider('solflare') && <small>Solicita permiso en la aplicación Solflare y vuelve a esta página. No abre el navegador interno de la wallet.</small>}
          </div>
        </article>
      })}</div>}

      {session.error && <div className="wallet-error" role="alert">{session.error}</div>}
      {session.connectingWallet && <div className="wallet-connect-pending" role="status">Confirma la conexión en la ventana de la wallet. No se enviará ninguna transacción al conectar.</div>}
      {copyMessage && <small className="wallet-feedback wallet-copy-feedback" role="status">{copyMessage}</small>}
      <p className="wallet-privacy-note">Conectar solo comparte una dirección pública. No se solicitan frases semilla ni claves privadas. En móvil, MetaMask abre su aplicación y devuelve la conexión a esta página; el pago se revisa y aprueba aparte en la wallet.</p>
    </section>
  </div>
}
