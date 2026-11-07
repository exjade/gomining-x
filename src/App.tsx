import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAccount, useDisconnect as useWagmiDisconnect } from 'wagmi'
import { useAppKit, useAppKitAccount } from '@reown/appkit/react'
import { getScreen, isDisabledRoute, navGroups, routeAliases, type NavItem, type ScreenDefinition } from './catalog'
import { getSessionSnapshot } from './readAdapter'
import { getPrimaryPurchaseProduct, getProductById, getProductsForRoute, type CartLine, type DemoOrder, type DemoProduct } from './purchase'
import { WalletPanel } from './WalletPanel'
import { useWalletSession, type WalletId } from './walletSession'
import { useDemoFirestorePersistence } from './firestoreDemoSync'
import { WalletPaymentCheckout, initialWallet, networkForConnection, networks, walletOptions, type PaymentReceipt } from './WalletPaymentCheckout'
import { MinerCustomizer } from './MinerCustomizer'
import { CryptoIcon } from './CryptoIcon'
import { isPaymentNetworkId, type PaymentNetworkId } from './paymentDestinations'
import { AppRouteSkeleton, MetricValueSkeleton, PoolTableSkeleton, Skeleton, WalletIdentitySkeleton } from './Skeletons'
import { convertCatalogPriceToUsd, formatAssetAmount, formatCatalogPrice, type PaymentCurrency } from './paymentQuote'
import { customMinerPriceTiers, launchMinerPlans, MINER_CATALOG_OBSERVED_AT, monthlyMinerPlans, oneTimeMinerPlans, presaleMinerPlans } from './minerCatalog'
import { MinerCreationScreen } from './components/miner-builder/MinerCreationScreen'
import { CreateMinerModal } from './components/miner-builder/CreateMinerModal'
import { MinerOptionList } from './components/miner-builder/MinerOptionList'
import { MinerTabs, type MinerCategoryTab } from './components/miner-builder/MinerTabs'
import { PowerSlider } from './components/miner-builder/PowerSlider'
import { RewardsCalculator, type RewardPeriod } from './components/miner-builder/RewardsCalculator'
import { PaymentTimingOptions, type MaintenanceToken } from './components/miner-builder/PaymentOptions'
import { customMinerEconomics } from './components/miner-builder/customMinerEconomics'
import { BitcoinMiningCalculator } from './BitcoinMiningCalculator'
import { calculateMiningSettlement, REFERRAL_LEVEL_WEIGHTS } from './miningEconomics'
import { resetMiningConfig, updateMiningConfig, useMiningConfig } from './miningConfig'
import { fetchPrlDailyRevenue, formatUsd, KRYPTEX_PRL_STATS_URL, PEARL_PRL_EXPLORER_URL, PRL_POOL_ADDRESS, type PoolRevenueQuote } from './poolRevenue'
import { fetchPoolPayouts, getPoolPayoutStatus, type PoolPayoutPage } from './poolPayouts'
import { AuthProvider, useAuth } from './AuthContext'
import { AuthModal } from './AuthModal'
import { ProfilePage } from './ProfilePage'
import { SubscriptionsPage } from './SubscriptionsPage'
import { LandingPage } from './LandingPage'
import { ReferralPage } from './ReferralPage'
import { usePersonalization } from './personalization'
import {
  subscribeToStorefrontSections,
  recordMinerPurchaseToAdmin,
  savePurchasedMiner,
  type StorefrontSectionsConfig,
  DEFAULT_STOREFRONT_SECTIONS,
  type StoredMiner,
} from './firebase'
import {
  activateDemoSubscription,
  addDemoBalance,
  activateDemoWorker,
  buyDemoOrder,
  buyDemoMiner,
  cancelPendingDemoMiner,
  cancelDemoSubscription,
  deferDemoMinerPurchase,
  depositMaintenanceToken,
  formatDemoCurrency,
  formatWalletBalance,
  getDemoMiningPower,
  payPendingDemoMiner,
  simulateDemoPresale,
  simulateDemoWithdrawal,
  setDemoWorkerActivationMode,
  useDemoSession,
  type DemoReceipt,
} from './demoStore'

type PendingAction = { title: string; detail: string; productId?: string }

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const screen = getScreen(location.pathname)
  const { user, profile, loading, isEmailVerified, openAuthModal } = useAuth()
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [toast, setToast] = useState('')
  const [sessionEvents, setSessionEvents] = useState<string[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [topUpOpen, setTopUpOpen] = useState(false)
  const [minerBuilderOpen, setMinerBuilderOpen] = useState(false)
  const [walletCheckout, setWalletCheckout] = useState<{ productName: string; amount: number; currency: PaymentCurrency; networkId?: PaymentNetworkId; walletId?: WalletId } | null>(null)
  const [paymentReceipts, setPaymentReceipts] = useState<PaymentReceipt[]>([])
  const { theme, language, toggleTheme, setAppLanguage, t } = usePersonalization()
  const walletSession = useWalletSession()
  const { address: wagmiAddress, isConnected: isWagmiConnected, chain } = useAccount()
  const { address: appKitAddress, isConnected: isAppKitConnected } = useAppKitAccount()
  const { open: openAppKit } = useAppKit()
  const { disconnect: disconnectWagmi } = useWagmiDisconnect()

  const activeWalletAddress = wagmiAddress || appKitAddress || walletSession.connection?.address || ''
  const isWalletConnected = isWagmiConnected || isAppKitConnected || Boolean(walletSession.connection)
  const shortWalletAddress = activeWalletAddress
    ? `${activeWalletAddress.slice(0, 6)}...${activeWalletAddress.slice(-4)}`
    : ''

  const unifiedConnection = useMemo(() => {
    if (walletSession.connection && (!wagmiAddress || walletSession.connection.address.toLowerCase() === wagmiAddress.toLowerCase())) {
      return walletSession.connection
    }
    if (activeWalletAddress) {
      const short = `${activeWalletAddress.slice(0, 6)}...${activeWalletAddress.slice(-4)}`
      return {
        id: (walletSession.connection?.id ?? 'metamask') as WalletId,
        name: chain?.name ?? (walletSession.connection?.name ?? 'Wallet Web3'),
        protocol: (walletSession.connection?.protocol ?? 'EIP-1193') as 'Solana' | 'EIP-1193' | 'Bitcoin' | 'TRON' | 'Cosmos',
        network: chain?.name ?? (walletSession.connection?.network ?? 'EVM'),
        address: activeWalletAddress,
        shortAddress: short,
        disconnectProvider: async () => {
          try { await disconnectWagmi() } catch { /* ignore */ }
          try { await walletSession.disconnect() } catch { /* ignore */ }
        },
        sendPayment: async (quote: any, context?: any) => {
          if (walletSession.connection) return walletSession.connection.sendPayment(quote, context)
          throw new Error('Usa el checkout directo para pagar.')
        },
      }
    }
    return null
  }, [
    walletSession.connection,
    wagmiAddress,
    activeWalletAddress,
    chain?.name,
    disconnectWagmi,
    walletSession.disconnect,
  ])

  const effectiveWalletSession = useMemo(() => ({
    ...walletSession,
    connection: unifiedConnection,
  }), [walletSession, unifiedConnection])

  const demo = useDemoSession()
  const persistence = useDemoFirestorePersistence()

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const mobileCheckout = params.get('gmPay') === '1'
    setMinerBuilderOpen(location.pathname === '/home' && params.get('modal') === 'paywall-create' && !mobileCheckout)
    if (!mobileCheckout) return
    const amount = Number(params.get('gmPayAmount'))
    const productName = params.get('gmPayProduct')
    const currency = params.get('gmPayCurrency')
    const networkValue = params.get('gmPayNetwork')
    const networkId = isPaymentNetworkId(networkValue) ? networkValue : null
    const requestedWallet = params.get('gmPayWallet')
    const walletIds: WalletId[] = ['solflare', 'phantom', 'metamask', 'coinbase', 'trustwallet', 'tronlink', 'unisat']
    if (productName && Number.isFinite(amount) && amount > 0 && currency === 'USD') {
      setWalletCheckout({ productName: productName.slice(0, 120), amount, currency: 'USD', networkId: networkId ?? undefined, walletId: walletIds.find((id) => id === requestedWallet) })
    }
  }, [location.pathname, location.search])

  if (loading) {
    return <AppRouteSkeleton pathname={location.pathname} search={location.search} />
  }

  const cleanPath = location.pathname.split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase() || '/'
  const aliasTarget = routeAliases[cleanPath]
  if (aliasTarget && aliasTarget !== location.pathname) {
    const delimiter = aliasTarget.includes('?') ? '&' : '?'
    const query = location.search ? `${delimiter}${location.search.replace(/^\?/, '')}` : ''
    return <Navigate to={`${aliasTarget}${query}${location.hash}`} replace />
  }

  if (location.pathname === '/operator-economics') return <Navigate to="/mining-calculator" replace />
  if (location.pathname === '/finance/simple-earn/overview') return <Navigate to="/finance/earn-summary" replace />
  if (isDisabledRoute(location.pathname)) return <Navigate to="/home" replace />
  if (location.pathname === '/nft-rewards') return <Navigate to="/nft-rewards/solo" replace />

  // Authenticated users accessing landing (/) are redirected to dashboard (/home)
  if (user && location.pathname === '/') {
    return <Navigate to={`/home${location.search}`} replace />
  }

  const openAction = (title: string, detail?: string) => {
    setPendingAction({
      title,
      detail: detail ?? 'Esta interacción se ejecutará solo como una simulación local.',
    })
  }

  const addProduct = (product: DemoProduct) => {
    setCart((items) => {
      const existing = items.find((item) => item.productId === product.id)
      return existing
        ? items.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...items, { productId: product.id, quantity: 1 }]
    })
    setToast(`${product.title} se añadió al carrito`)
  }

  const openMinerBuilder = () => {
    if (!user) {
      setToast('Inicia sesión o crea una cuenta para personalizar mineros.')
      openAuthModal('register')
      return
    }
    navigate('/home?modal=paywall-create')
  }
  const closeMinerBuilder = () => navigate(location.pathname === '/home' ? '/home' : location.pathname, { replace: true })
  const closeWalletCheckout = (requestPending?: boolean, notice?: string) => {
    setWalletCheckout(null)
    const params = new URLSearchParams(location.search)
    if (params.get('gmPay') === '1') {
      for (const key of ['gmPay', 'gmPayProduct', 'gmPayAmount', 'gmPayCurrency', 'gmPayNetwork', 'gmPayWallet']) params.delete(key)
      if (params.get('modal') === 'paywall-create') params.delete('modal')
    }
    for (const key of ['gmWalletConnect', 'gmSolflareCallback', 'gmSolflareState', 'gmPhantomCallback', 'gmPhantomState', 'data', 'nonce', 'solflare_encryption_public_key', 'phantom_encryption_public_key', 'errorCode', 'errorMessage']) params.delete(key)
    if (params.toString() !== location.search.replace(/^\?/, '')) navigate({ pathname: location.pathname, search: params.size ? `?${params.toString()}` : '', hash: location.hash }, { replace: true })
    if (notice) setToast(notice)
    else if (requestPending) setToast('Cerraste el checkout. La solicitud puede seguir abierta en tu wallet; revisa su actividad antes de intentar pagar de nuevo.')
  }

  const addDemoFunds = (amount: number, detail?: string) => {
    const receipt = addDemoBalance(amount, detail)
    if (receipt) {
      setSessionEvents((items) => [`Saldo local +${formatDemoCurrency(amount)}`, ...items].slice(0, 5))
      setToast(`Se añadieron ${formatDemoCurrency(amount)} al saldo local`)
    }
    return receipt
  }

  const confirmAction = () => {
    if (!pendingAction) return
    const event = `${pendingAction.title} · ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
    setSessionEvents((items) => [event, ...items].slice(0, 5))
    const product = pendingAction.productId ? getProductById(pendingAction.productId) : undefined
    if (product) {
      setCart((items) => {
        const existing = items.find((item) => item.productId === product.id)
        return existing
          ? items.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item)
          : [...items, { productId: product.id, quantity: 1 }]
      })
      setToast(`${product.title} se añadió al carrito`)
    } else {
      setToast('Simulación completada en esta sesión')
    }
    setPendingAction(null)
  }

  const activeLabel = findActiveLabel(location.pathname)

  return (
    <div className="app-shell">
      <div className="workspace">
        <header className="topbar">
          <div className="header-navigation">
            <Link to={user ? "/home" : "/"} className="brand" aria-label="GoMining inicio">
              <span className="brand-mark">G</span>
              <span className="brand-word">gomining</span>
            </Link>
            <nav className="primary-nav" aria-label="Navegación principal">
              {user ? (
                <>
                  <NavLink to="/nft-miners" className={({ isActive }) => isActive ? 'primary-nav-link primary-nav-link-active' : 'primary-nav-link'}>
                    {language === 'en' ? 'My Miners' : 'Mis mineros'}
                  </NavLink>
                  <MoreNavigation />
                </>
              ) : (
                <>
                  <NavLink to="/" className={({ isActive }) => isActive ? 'primary-nav-link primary-nav-link-active' : 'primary-nav-link'}>
                    {language === 'en' ? 'Home' : 'Inicio'}
                  </NavLink>
                  <NavLink to="/mining-calculator" className={({ isActive }) => isActive ? 'primary-nav-link primary-nav-link-active' : 'primary-nav-link'}>
                    {language === 'en' ? 'Calculator' : 'Calculadora'}
                  </NavLink>
                  <NavLink to="/academy" className={({ isActive }) => isActive ? 'primary-nav-link primary-nav-link-active' : 'primary-nav-link'}>
                    {language === 'en' ? 'Academy' : 'Academia'}
                  </NavLink>
                </>
              )}
            </nav>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="lang-toggle-btn"
              onClick={() => setAppLanguage(language === 'es' ? 'en' : 'es')}
              title={language === 'es' ? 'Switch to English' : 'Cambiar a Español'}
              aria-label="Cambiar idioma"
            >
              {language === 'es' ? '🇺🇸 EN' : '🇪🇸 ES'}
            </button>
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={`Cambiar a modo ${theme === 'dark' ? 'claro' : 'oscuro'}`}
              aria-label="Cambiar tema claro/oscuro"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            {user && (
              <Link className="header-balance" to="/finance/wallets/virtual" aria-label={`Saldo local ${formatWalletBalance(demo.balance)}; abrir saldo local`} title="Saldo local; no es la wallet conectada">
                <span className="header-balance-label">LOCAL</span>
                <strong>{formatWalletBalance(demo.balance)}</strong>
              </Link>
            )}
            {walletSession.restoringWallet && !isWalletConnected ? (
              <span className="wallet-topbar-loading" aria-label="Detectando wallet autorizada"><WalletIdentitySkeleton compact /></span>
            ) : isWalletConnected ? (
              <button
                type="button"
                className="wallet-topbar-button wallet-topbar-connected"
                onClick={() => {
                  if (isWagmiConnected || isAppKitConnected) {
                    openAppKit({ view: 'Account' })
                  } else {
                    navigate('/gmt-wallets')
                  }
                }}
                aria-label={`Wallet conectada: ${shortWalletAddress}`}
                title={activeWalletAddress}
              >
                <ConnectionGlyph /><span className="wallet-topbar-value">{shortWalletAddress}</span>
              </button>
            ) : (
              <button
                type="button"
                className="wallet-topbar-button"
                onClick={() => {
                  if (openAppKit) {
                    openAppKit()
                  }
                }}
                aria-label="Conectar una wallet"
                title="Conectar una wallet"
              >
                <ConnectionGlyph /><span className="wallet-topbar-value">{language === 'en' ? 'Connect' : 'Conectar'}</span>
              </button>
            )}
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!isEmailVerified && (
                  <button
                    type="button"
                    className="header-verify-chip"
                    onClick={() => openAuthModal('verify-email')}
                    title={t('replica.verify_email_badge')}
                  >
                    {t('replica.verify_email_badge')}
                  </button>
                )}
                <Link className="avatar" to="/profile" aria-label="Perfil">
                  {(profile?.username?.charAt(0) || user.email?.charAt(0) || 'G').toUpperCase()}
                </Link>
              </div>
            ) : (
              <div className="header-auth-buttons">
                <button
                  type="button"
                  className="header-auth-login-btn"
                  onClick={() => openAuthModal('login')}
                >
                  {language === 'en' ? 'Log in' : 'Iniciar sesión'}
                </button>
                <button
                  type="button"
                  className="header-auth-btn"
                  onClick={() => openAuthModal('register')}
                >
                  <span>{language === 'en' ? 'Create account' : 'Crear cuenta'}</span>
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="page-wrap" aria-label={activeLabel}>
          {user && (
            <div className="replica-note">
              <span className="note-icon">i</span>
              <span>{t('replica.connected_wallet_note')}</span>
              <span className="note-separator">·</span>
              {persistence.status === 'connecting' && <span className="persistence-status persistence-status-syncing" role="status">{t('replica.sync_connecting')}</span>}
              {persistence.status === 'syncing' && <span className="persistence-status persistence-status-syncing" role="status">{t('replica.sync_saving')}</span>}
              {persistence.status === 'saved' && <span className="persistence-status" role="status">{t('replica.sync_saved')}</span>}
              {persistence.status === 'error' && <span className="persistence-status persistence-status-local" role="status" title={persistence.detail}>{t('replica.sync_local')}</span>}
              {persistence.status === 'disabled' && <span className="persistence-status persistence-status-local" role="status">{t('replica.sync_browser')}</span>}
              {persistence.status === 'error' && persistence.detail && <span className="persistence-status-detail">{persistence.detail}</span>}
              <span>{t('replica.external_services_note')}</span>
            </div>
          )}
          {user && !isEmailVerified && (
            <div className="unverified-email-banner">
              <div className="unverified-email-content">
                <span className="unverified-email-icon">✉</span>
                <span>
                  {t('replica.email_pending_banner')}
                </span>
              </div>
              <button
                type="button"
                className="unverified-email-btn"
                onClick={() => openAuthModal('verify-email')}
              >
                {t('replica.verify_email_btn')}
              </button>
            </div>
          )}
          <div key={location.pathname} className="route-transition">
          {location.pathname === '/' ? (
            <LandingPage openAuthModal={openAuthModal} />
          ) : ((location.pathname.startsWith('/miners/') || location.pathname.startsWith('/nft-miners/')) && location.pathname.endsWith('/customize')) ? (
            <MinerCustomizer />
          ) : screen ? (
          <Page screen={screen} pathname={location.pathname} openAction={openAction} addProduct={addProduct} openMinerBuilder={openMinerBuilder} openTopUp={() => setTopUpOpen(true)} onPayWithWallet={(productName, amount, currency = 'USD') => {
            setWalletCheckout({ productName, amount, currency })
          }} sessionEvents={sessionEvents} walletSession={effectiveWalletSession} paymentReceipts={paymentReceipts} />
          ) : (
            <UnknownRoute pathname={location.pathname} />
          )}
          </div>
          <footer className="page-footer">
            <span>{t('replica.footer_replica')}</span>
            <span>{t('replica.external_services_note')}</span>
          </footer>
        </main>
      </div>

      {pendingAction && <ActionDialog action={pendingAction} onClose={() => setPendingAction(null)} onConfirm={confirmAction} />}
      {purchaseOpen && <PurchaseDialog
        cart={cart}
        balance={demo.balance}
        onClose={() => setPurchaseOpen(false)}
        onQuantityChange={(productId, quantity) => setCart((items) => quantity < 1 ? items.filter((item) => item.productId !== productId) : items.map((item) => item.productId === productId ? { ...item, quantity } : item))}
        onTopUp={(amount) => addDemoFunds(amount)}
        onClear={() => setCart([])}
        onComplete={(order: DemoOrder) => {
          const result = buyDemoOrder(order)
          if (!result.ok) {
            setToast(result.message)
            return
          }
          // Record any miners purchased in cart order to admin platform
          order.items.forEach(({ product, quantity }) => {
            if (product.id.startsWith('miner-')) {
              const powerTh = product.powerTh ?? (product.id === 'miner-plus' ? 1.2 : 0.6)
              for (let i = 1; i <= quantity; i++) {
                const minerId = `${order.id}-${product.id}-${i}`
                recordMinerPurchaseToAdmin({
                  minerId,
                  uid: user?.uid,
                  email: user?.email || '',
                  name: product.title,
                  powerTh,
                  price: product.price,
                  txHash: `sim_order_${order.id}`,
                  network: 'LOCAL_BALANCE',
                }).catch(() => {})
              }
            }
          })
          setCart([])
          setSessionEvents((items) => [`Pedido ${order.id} · simulación local`, ...items].slice(0, 5))
          setToast("Compra simulada completa; inventario y saldo actualizados")
        }}
      />}
      {topUpOpen && <DemoTopUpDialog walletSession={effectiveWalletSession} onClose={() => setTopUpOpen(false)} onPayWithWallet={(amount, networkId, walletId) => { setTopUpOpen(false); setWalletCheckout({ productName: 'Recarga de saldo', amount, currency: 'USD', networkId, walletId }) }} onConfirm={(amount) => { addDemoFunds(amount); setTopUpOpen(false) }} />}
      {minerBuilderOpen && <MinerBuilderDialog balance={demo.balance} walletSession={effectiveWalletSession} onClose={closeMinerBuilder} onPayWithWallet={(productName, amount, currency) => {
        closeMinerBuilder()
        setMinerBuilderOpen(false)
        setWalletCheckout({ productName, amount, currency })
      }} onComplete={async (input) => {
        const priceUsd = await convertCatalogPriceToUsd(input.price, input.currency)
        const demoInput = { ...input, price: priceUsd, ownerWallet: activeWalletAddress || effectiveWalletSession.connection?.address }
        const result = buyDemoMiner(demoInput)
        if (!result.ok) return { ok: false, message: result.message }
        const minerId = result.receipt?.id ? `miner_${result.receipt.id}` : `miner_${Date.now()}`
        if (user) {
          const storedMiner: StoredMiner = {
            id: minerId,
            uid: user.uid,
            name: input.name,
            powerTh: input.powerTh,
            efficiency: input.efficiency,
            efficiencyWattsPerTh: input.efficiency,
            price: priceUsd,
            currency: 'USD',
            status: 'active',
            txHash: `sim_${minerId}`,
            createdAt: null,
            network: 'LOCAL_BALANCE',
            ownerWallet: demoInput.ownerWallet || 'INTERNAL',
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
          await savePurchasedMiner(user.uid, storedMiner).catch(() => {})
        }
        await recordMinerPurchaseToAdmin({
          minerId,
          uid: user?.uid,
          email: user?.email || '',
          name: input.name,
          powerTh: input.powerTh,
          price: priceUsd,
          txHash: `sim_${minerId}`,
          network: 'LOCAL_BALANCE',
          ownerWallet: demoInput.ownerWallet,
          packageId: (input as any).packageId,
        }).catch(() => {})
        setSessionEvents((items) => [`${input.name} · ${input.powerTh.toFixed(2)} TH añadidos a la granja`, ...items].slice(0, 5))
        setToast("Minero añadido a la granja local; saldo y comprobante actualizados")
        return { ok: true, receipt: result.receipt }
      }} onDefer={async (input) => {
        const priceUsd = await convertCatalogPriceToUsd(input.price, input.currency)
        const result = deferDemoMinerPurchase({ ...input, price: priceUsd })
        if (!result.ok) return { ok: false, message: result.message }
        setSessionEvents((items) => [`Pedido pendiente · ${input.name} · ${input.powerTh.toFixed(2)} TH`, ...items].slice(0, 5))
        setToast("Pedido local registrado; el saldo se descuenta al pagarlo desde Mis mineros")
        return { ok: true, receipt: result.receipt }
      }} />}
      {walletCheckout && <WalletPaymentCheckout productName={walletCheckout.productName} amount={walletCheckout.amount} currency={walletCheckout.currency} initialNetworkId={walletCheckout.networkId} initialWalletId={walletCheckout.walletId} session={effectiveWalletSession} onClose={closeWalletCheckout} onResumeWalletConnect={(url) => {
        const resume = new URL(url, window.location.origin)
        navigate({ pathname: resume.pathname, search: resume.search, hash: resume.hash }, { replace: true })
      }} onPaid={(receipt: PaymentReceipt) => {
        setPaymentReceipts((items) => [receipt, ...items].slice(0, 20))
        const receiptEvent = `${receipt.id} · ${receipt.quote.networkName} · ${receipt.transactionHash.slice(0, 14)}…`
        setSessionEvents((items) => [receiptEvent, ...items].slice(0, 5))
        setToast('¡Pago verificado y enviado on-chain! Redirigiendo a customización...')
        if (receipt.minerId) {
          window.setTimeout(() => {
            setWalletCheckout(null)
            navigate(`/miners/${receipt.minerId}/customize`)
          }, 1400)
        }
      }} />}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
      <AuthModal />
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

function MoreNavigation() {
  const { t } = usePersonalization()
  const groupLabelMap: Record<string, string> = {
    'Tokenómica': t('nav.group_tokenomics'),
    'Finanzas': t('nav.group_finance'),
    'Promociones': t('nav.group_promotions'),
    'Comunidad': t('nav.group_community'),
    'Cuenta': t('nav.group_account'),
  }
  const itemLabelMap: Record<string, string> = {
    'Votación': t('nav.item_voting'),
    'Conectar wallet': t('nav.item_connect_wallet'),
    'Saldo local': t('nav.item_local_balance'),
    'Transacciones': t('nav.item_transactions'),
    'Fondos instantáneos': t('nav.item_instant_funds'),
    'Resumen de ganancias': t('nav.item_earn_summary'),
    'Calculadora de minería': t('nav.item_mining_calculator'),
    'Depositar': t('nav.item_deposit'),
    'Retirar': t('nav.item_withdraw'),
    'Promos': t('nav.item_promos'),
    'Platinum+': t('nav.item_platinum'),
    'Ranking de mineros': t('nav.item_miner_ranking'),
    'Referidos': t('nav.item_referrals'),
    'Data centers': t('nav.item_data_centers'),
    'Perfil': t('nav.item_profile'),
  }
  return <details className="nav-more">
    <summary aria-label={t('nav.more_sections')}>•••</summary>
    <div className="nav-dropdown">
      {navGroups.filter((group) => group.label !== 'Panel').map((group) => {
        const visibleItems = group.items.filter((item: NavItem) => item.path !== '/gmt-wallets' && !isDisabledRoute(item.path))
        if (!visibleItems.length) return null
        return <section className="nav-dropdown-group" key={group.label}>
          <h2>{groupLabelMap[group.label] || group.label}</h2>
          {visibleItems.map((item: NavItem) => (
            <NavLink
              to={item.path}
              key={item.path}
              onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
              className={({ isActive }) => `nav-dropdown-link ${isActive ? 'nav-dropdown-link-active' : ''}`}
            >
              <span>{item.icon}</span>{itemLabelMap[item.label] || item.label}
            </NavLink>
          ))}
        </section>
      })}
    </div>
  </details>
}

function ConnectionGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9.6 14.4a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.3 1.3"/><path d="M14.4 9.6a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.3-1.3"/></svg>
}

function CartGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h2l2.2 11.1a2 2 0 0 0 2 1.6h7.5a2 2 0 0 0 2-1.6L20 9H6"/><circle cx="10" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg>
}

function Page({
  screen,
  pathname,
  openAction,
  addProduct,
  openMinerBuilder,
  openTopUp,
  onPayWithWallet,
  sessionEvents,
  walletSession,
  paymentReceipts,
}: {
  screen: ScreenDefinition
  pathname: string
  openAction: (title: string, detail?: string) => void
  addProduct: (product: DemoProduct) => void
  openMinerBuilder: () => void
  openTopUp: () => void
  onPayWithWallet: (productName: string, amount: number, currency?: PaymentCurrency) => void
  sessionEvents: string[]
  walletSession: ReturnType<typeof useWalletSession>
  paymentReceipts: PaymentReceipt[]
}) {
  const snapshot = getSessionSnapshot()
  const { language } = usePersonalization()
  const isEn = language === 'en'

  const localizedTitle = isEn
    ? pathname === '/nft-referral' ? 'Referrals & Unilevel'
    : pathname === '/nft-referral/rewards' ? 'Referral Royalties'
    : pathname === '/nft-referral/friends' ? 'My Friends'
    : pathname === '/profile' ? 'Profile'
    : pathname === '/nft-miners' ? 'My Miners'
    : pathname === '/mining-calculator' ? 'Mining Calculator'
    : pathname === '/data-centers' ? 'Data Centers'
    : pathname === '/subscriptions' ? 'Subscriptions'
    : screen.title
    : screen.title

  const localizedEyebrow = isEn
    ? pathname.startsWith('/nft-referral') ? 'COMMUNITY'
    : pathname === '/profile' ? 'ACCOUNT'
    : pathname === '/nft-miners' ? 'MINING'
    : pathname === '/mining-calculator' ? 'FINANCE'
    : pathname === '/data-centers' ? 'MINING'
    : screen.eyebrow
    : screen.eyebrow

  const localizedDescription = isEn
    ? pathname === '/nft-referral' ? 'View invitation and referral resources.'
    : pathname === '/nft-referral/rewards' ? 'View royalty categories and statuses.'
    : pathname === '/nft-referral/friends' ? 'View aggregated referral activity.'
    : screen.description
    : screen.description

  return (
    <>
      {screen.mode === 'dashboard' && pathname === '/home' ? (
        <HomeDashboard openMinerBuilder={openMinerBuilder} openTopUp={openTopUp} />
      ) : (
        <>
          {pathname !== '/profile' && pathname !== '/subscriptions' && (
            <div className="page-heading-row">
              <div className="page-title-group">
                <div className="page-icon">{pathname === '/academy/courses/bitcoin-and-mining' ? <CryptoIcon symbol="BTC" size="md" /> : screen.icon}</div>
                <div>
                  <p className="eyebrow">{localizedEyebrow}</p>
                  <h1>{localizedTitle}</h1>
                  <p className="page-description">{localizedDescription}</p>
                </div>
              </div>
              {screen.action && screen.action !== 'Filtros' && pathname !== '/nft-miners' && !pathname.startsWith('/nft-rewards/') && !pathname.startsWith('/nft-referral') && <button className="button button-primary" onClick={() => {
                if (pathname === '/finance/wallets/virtual' && screen.action === 'Recargar') { openTopUp(); return }
                openAction(screen.action!, pathname === '/buy/GOMINING' ? 'La ruta de compra de GOMINING se conserva para la tokenómica. El inventario y la cotización de este token aún no están conectados; esta acción no abre un carrito ni envía fondos.' : actionDetail(screen.action!))
              }}>{screen.action}<span>↗</span></button>}
            </div>
          )}
          {pathname === '/gmt-wallets' || pathname === '/profile' || pathname === '/subscriptions' ? null : screen.observed ? (
            <div className="evidence-chip"><span>●</span> {isEn ? 'Observed session structure' : 'Estructura observada en la sesión'}</div>
          ) : (
            <div className="evidence-chip evidence-chip-muted"><span>◌</span> {isEn ? 'Route found in navigation; partial content' : 'Ruta encontrada en la navegación; contenido parcial'}</div>
          )}
          {pathname.startsWith('/nft-referral') && <ReferralNavigation pathname={pathname} />}
          {pathname === '/subscriptions' && <SubscriptionsPage openTopUp={openTopUp} onPayWithWallet={onPayWithWallet} />}
          {pathname === '/profile' && <ProfilePage walletSession={walletSession} onOpenMinerBuilder={openMinerBuilder} />}
          {pathname.startsWith('/nft-referral') && <ReferralPage pathname={pathname} />}
          {pathname.startsWith('/data-centers') && <MiningTelemetryPanel pathname={pathname} />}
          {pathname === '/launchpad' && <PresalePanel openTopUp={openTopUp} />}
          {screen.mode === 'operator' && <BitcoinMiningCalculator />}
          {pathname === '/nft-miners' && <MinerPanel openMinerBuilder={openMinerBuilder} openTopUp={openTopUp} />}
          {pathname.startsWith('/nft-rewards/') && <RewardsPanel pathname={pathname} openAction={openAction} />}
          {screen.mode === 'table' && !pathname.startsWith('/data-centers') && !pathname.startsWith('/nft-referral') && <DataTable screen={screen} paymentReceipts={paymentReceipts} />}
          {pathname === '/marketplace' && <MarketplacePanel addProduct={addProduct} />}
          {pathname !== '/marketplace' && pathname !== '/nft-miners' && pathname !== '/gmt-wallets' && pathname !== '/subscriptions' && pathname !== '/profile' && pathname !== '/launchpad' && !pathname.startsWith('/data-centers') && pathname !== '/nft-referral' && !pathname.startsWith('/nft-referral/') && !pathname.startsWith('/nft-rewards/') && (screen.mode === 'collection' || screen.mode === 'catalog') && <CatalogPanel screen={screen} pathname={pathname} openAction={openAction} addProduct={addProduct} />}
          {(pathname === '/gmt-wallets' || pathname === '/finance/wallets/virtual') && <WalletPanel session={walletSession} />}
          {screen.mode === 'form' && <FormPanel screen={screen} pathname={pathname} openAction={openAction} addProduct={addProduct} onPayWithWallet={onPayWithWallet} walletSession={walletSession} />}
          {screen.mode === 'governance' && <GovernancePanel screen={screen} openAction={openAction} />}
          {screen.mode === 'article' && <ArticlePanel screen={screen} />}
          {screen.mode === 'generic' && !pathname.startsWith('/nft-rewards/') && <GenericPanel screen={screen} openAction={openAction} />}
          {sessionEvents.length > 0 && <SessionActivity items={sessionEvents} />}
          <div className="data-source-note"><span className="source-lock">▣</span><div><strong>{snapshot.message}</strong><small>{pathname.startsWith('/data-centers') ? 'El ingreso estimado viene de una API pública de Kryptex PRL. Operaciones muestra los estados de origen que publica la pool; no hay datos privados de GoMining ni confirmación de liquidaciones a compradores.' : pathname === '/mining-calculator' ? 'La proyección usa hashrate, recompensas recientes y precio público de Bitcoin; no representa ingresos acreditados ni garantiza rentabilidad.' : 'No se consultan servicios privados de GoMining ni se guardan credenciales o tokens.'}</small></div></div>
        </>
      )}
      {screen.mode === 'dashboard' && pathname === '/home' && sessionEvents.length > 0 && <SessionActivity items={sessionEvents} />}
    </>
  )
}

function HomeDashboard({ openMinerBuilder, openTopUp }: { openMinerBuilder: () => void; openTopUp: () => void }) {
  const demo = useDemoSession()
  const { language } = usePersonalization()
  const mining = getDemoMiningPower(demo)
  const isEn = language === 'en'

  return (
    <>
      <section className="account-hero">
        <div className="account-hero-heading">
          <div>
            <p className="eyebrow">{isEn ? 'LOCAL BALANCE' : 'SALDO LOCAL'}</p>
            <h1>{formatWalletBalance(demo.balance)}</h1>
          </div>
          <span className="account-data-state"><i /> LOCAL</span>
        </div>
        <div className="hero-mining-visual" aria-hidden="true">
          <span className="hero-orbit hero-orbit-one" />
          <span className="hero-orbit hero-orbit-two" />
          <span className="hero-core">G</span>
          <span className="hero-miner-node">✦</span>
        </div>
        <div className="quick-actions">
          <QuickAction icon="♧" label={isEn ? 'Create miner' : 'Crear minero'} onClick={openMinerBuilder} />
          <QuickAction icon="↓" label={isEn ? 'Top up' : 'Recargar'} onClick={openTopUp} />
          <QuickAction icon="▥" label={isEn ? 'Earnings' : 'Ganancias'} to="/finance/earn-summary" />
          <QuickAction icon="♧" label={isEn ? 'Referrals & Unilevel' : 'Referidos y Unilevel'} to="/nft-referral" />
        </div>
      </section>

      <div className="market-strip">
        <MarketItem name="BTC" value={isEn ? '$90,000.00 · historical reference' : '$90,000.00 · referencia histórica'} />
        <div className="market-divider" />
        <MarketItem name="GOMINING" value={isEn ? 'Simulated' : 'Simulado'} />
        <span className="market-status"><span />{isEn ? 'Simulated price reference' : 'Referencia de precios simulada'}</span>
      </div>

      <MiningQuestBoard />

      <div className="dashboard-grid">
        <DashboardCard tone="purple" kicker={isEn ? 'EARNINGS SUMMARY' : 'RESUMEN DE GANANCIAS'} title={isEn ? 'Check your activity' : 'Consulta tu actividad'} body={isEn ? 'Rewards will appear when a verified source exists.' : 'Las recompensas solo aparecerán cuando exista una fuente verificada.'} action={isEn ? 'Open summary' : 'Abrir resumen'} to="/finance/earn-summary" icon="▥" />
        <DashboardCard tone="teal" kicker={isEn ? 'MINING' : 'MINERÍA'} title={isEn ? 'Pool and operations' : 'Pool y operaciones'} body={isEn ? 'Check public readings and their source.' : 'Consulta las lecturas públicas y su fuente.'} action={isEn ? 'View traceability' : 'Ver trazabilidad'} to="/data-centers" icon="♧" />
        <DashboardCard tone="blue" kicker={isEn ? 'FARM POWER' : 'POTENCIA EN GRANJA'} title={`${mining.total.toFixed(2)} TH`} body={isEn ? `${demo.miners.length} miners in local session.` : `${demo.miners.length} mineros en sesión local.`} action={isEn ? 'View miners' : 'Ver mineros'} to="/nft-miners" icon="▧" />
        <DashboardCard tone="gold" kicker={isEn ? 'VIP LEVEL · DEMO' : 'NIVEL VIP · DEMO'} title="Bronze II" body={isEn ? 'Explore subscription benefits.' : 'Explora los beneficios de suscripción.'} action={isEn ? 'View benefits' : 'Ver beneficios'} to="/subscriptions" icon="◈" />
        <DashboardCard tone="platinum" kicker="PLATINUM+" title={demo.subscription ? (isEn ? `Active · ${demo.subscription.cycle === 'monthly' ? 'monthly' : 'annual'}` : `Activo · ${demo.subscription.cycle === 'monthly' ? 'mensual' : 'anual'}`) : (isEn ? 'Subscription' : 'Suscripción')} body={demo.subscription ? (isEn ? '+1% active power boost during this session.' : '+1% sobre potencia activa durante esta sesión.') : (isEn ? 'Activate a local subscription to check the perk.' : 'Activa una suscripción local para consultar el beneficio.')} action={isEn ? 'View subscriptions' : 'Ver suscripciones'} to="/subscriptions" icon="✦" />
        <DashboardCard tone="green" kicker={isEn ? 'PROMOTIONS' : 'PROMOCIONES'} title={isEn ? 'Platform news' : 'Novedades de la plataforma'} body={isEn ? 'Check current MVP promotions.' : 'Consulta las promociones vigentes del MVP.'} action={isEn ? 'View promos' : 'Ver promos'} to="/promos" icon="✦" />
      </div>

      <section className="explore-section">
        <div className="section-heading"><div><p className="eyebrow">{isEn ? 'KEEP EXPLORING' : 'SIGUE EXPLORANDO'}</p><h2>{isEn ? 'More to discover' : 'Más para descubrir'}</h2></div><span className="section-counter">2 / 2</span></div>
        <div className="explore-grid">
          <ExploreCard icon="▧" title={isEn ? 'Create a miner' : 'Crear un minero'} subtitle={isEn ? 'Configure hashrate and review purchase' : 'Configura la potencia y revisa la compra'} badge="LOCAL" onClick={openMinerBuilder} />
          <ExploreCard icon="∑" title={isEn ? 'Mining calculator' : 'Calculadora de minería'} subtitle={isEn ? 'Hashrate and estimated gross earnings by model' : 'Hashrate e ingreso bruto estimado por modelo'} badge={isEn ? 'ESTIMATE' : 'ESTIMACIÓN'} to="/mining-calculator" />
        </div>
      </section>

      <section className="mining-source-panel content-panel">
        <div className="panel-toolbar">
          <div><p className="eyebrow">TRAZABILIDAD · PEARL / PRL</p><h2>Pool Kryptex</h2><p>{isEn ? 'Check PRL estimation by hashrate and public Pearl records.' : 'Consulta la estimación PRL por hashrate y abre el registro público de la wallet en Pearl.'}</p></div>
          <Link className="button button-secondary" to="/data-centers/pool">{isEn ? 'View pool' : 'Ver pool'} <span>↗</span></Link>
        </div>
        <div className="mining-metrics-grid">
          <MiningMetric label={isEn ? 'Workers assigned to replica' : 'Workers asignados a la réplica'} value={`${demo.workers.length}`} detail={isEn ? 'LOCAL ENVIRONMENT' : 'ENTORNO LOCAL'} />
          <MiningMetric label={isEn ? 'Local miners' : 'Mineros locales'} value={`${demo.miners.length}`} detail={isEn ? 'LOCAL BALANCE' : 'SALDO LOCAL'} />
          <MiningMetric label={isEn ? 'Client power' : 'Potencia del cliente'} value={`${getDemoMiningPower(demo).total.toFixed(2)} TH`} detail={isEn ? 'LOCAL SESSION' : 'SESIÓN LOCAL'} />
        </div>
        <p className="mining-source-note"><span>i</span> {isEn ? 'Estimation uses public Kryptex API. On-chain history consulted on Pearl.' : 'La estimación usa la API pública de Kryptex. El historial on-chain se consulta en Pearl; no se fabrican shares ni pagos.'}</p>
      </section>

      <section className="explore-section platform-features-section">
        <div className="section-heading"><div><p className="eyebrow">{isEn ? 'PLATFORM MODULES' : 'MÓDULOS DE LA PLATAFORMA'}</p><h2>{isEn ? 'Mining, subscriptions & payouts' : 'Minería, suscripciones y pagos'}</h2></div><span className="section-counter">LOCAL</span></div>
        <div className="platform-feature-grid">
          <ExploreCard icon="✧" title={isEn ? 'Monthly and annual subscriptions' : 'Suscripciones mensuales y anuales'} subtitle={isEn ? '1% active power boost and priority queue' : '1% de potencia activa y retiro sin cola diaria'} badge="VIP" to="/subscriptions" />
          <ExploreCard icon="♧" title={isEn ? 'Referrals and Unilevel' : 'Referidos y Unilevel'} subtitle={isEn ? '10% direct bonus and 20-levels distribution' : '10% directo y simulador de escenarios'} badge="20 NIVELES" to="/nft-referral" />
          <ExploreCard icon="◉" title={isEn ? 'Connect wallets' : 'Conectar carteras'} subtitle={isEn ? 'Buyer connection and multi-chain wallets' : 'Conexión de comprador y direcciones Solflare Bridge'} badge="WEB3" to="/gmt-wallets" />
          <ExploreCard icon="∑" title={isEn ? 'Hashrate & potential returns' : 'Hashrate y ganancias posibles'} subtitle={isEn ? 'Estimate profitability across catalog models' : 'Estima el rendimiento de los modelos del catálogo'} badge="CALCULADORA" to="/mining-calculator" />
        </div>
      </section>
    </>
  )
}

function MiningQuestBoard() {
  const demo = useDemoSession()
  const { language } = usePersonalization()
  const isEn = language === 'en'
  const minerGoal = 1
  const minerProgress = Math.min(demo.miners.length, minerGoal)
  const subscriptionComplete = Boolean(demo.subscription)
  const completed = Number(minerProgress > 0) + Number(subscriptionComplete)
  const progress = Math.round((completed / 2) * 100)
  return <section className="quest-board" aria-labelledby="quest-board-title">
    <div className="quest-board-heading">
      <div>
        <p className="eyebrow">{isEn ? 'YOUR NEXT LEVEL · LOCAL' : 'TU SIGUIENTE NIVEL · LOCAL'}</p>
        <h2 id="quest-board-title">{isEn ? 'Get your farm running' : 'Pon tu granja en marcha'}</h2>
        <p>{isEn ? 'Challenges to explore the platform.' : 'Retos para explorar la plataforma. No otorgan recompensas reales.'}</p>
      </div>
      <span className="quest-progress-count">{completed}<small> / 2</small></span>
    </div>
    <div className="quest-progress-track" role="progressbar" aria-label="Progreso de retos locales" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
    <div className="quest-cards">
      <Link to="/nft-miners" className={`quest-card ${minerProgress > 0 ? 'quest-card-complete' : ''}`}>
        <span className="quest-icon">{minerProgress > 0 ? '✓' : '01'}</span>
        <span className="quest-copy"><strong>{isEn ? 'Create your first miner' : 'Crea tu primer minero'}</strong><small>{minerProgress > 0 ? (isEn ? 'First local miner created' : 'Primer minero local creado') : (isEn ? 'Explore your simulation farm' : 'Explora tu granja de simulación')}</small></span>
        <span className="quest-arrow">↗</span>
      </Link>
      <Link to="/subscriptions" className={`quest-card ${subscriptionComplete ? 'quest-card-complete' : ''}`}>
        <span className="quest-icon">{subscriptionComplete ? '✓' : '02'}</span>
        <span className="quest-copy"><strong>{isEn ? 'Explore Platinum+' : 'Explora Platinum+'}</strong><small>{subscriptionComplete ? (isEn ? 'Active boost during this session' : 'Beneficio activo durante esta sesión') : (isEn ? 'Learn about the power bonus' : 'Conoce el bonus de potencia disponible')}</small></span>
        <span className="quest-arrow">↗</span>
      </Link>
    </div>
  </section>
}

export function SubscriptionPlansPanel({ openTopUp, onPayWithWallet }: { openTopUp: () => void; onPayWithWallet: (productName: string, amount: number, currency?: PaymentCurrency) => void }) {
  const demo = useDemoSession()
  const power = getDemoMiningPower(demo)
  const [feedback, setFeedback] = useState('')
  const plans = [
    { id: 'monthly', name: 'Mensual', cycle: 'Cobro cada mes' },
    { id: 'annual', name: 'Anual', cycle: 'Cobro cada año' },
  ]
  const activate = (cycle: 'monthly' | 'annual') => {
    const price = cycle === 'monthly' ? 29.99 : 0
    const result = activateDemoSubscription(cycle, price)
    if (!result.ok) {
      setFeedback(`Faltan ${formatDemoCurrency(result.required - result.available)} en el saldo local. Recarga y vuelve a activar.`)
      openTopUp()
      return
    }
    setFeedback(`${planLabel(cycle)} activa durante ${cycle === 'monthly' ? '30' : '365'} días en el escenario local.`)
  }

  return <div className="subscription-page-stack">
    <section className="content-panel subscription-status-card">
      <div className="subscription-status-icon">✧</div>
      <div className="subscription-status-copy"><p className="card-kicker">TU BENEFICIO DE POTENCIA</p><h2>{demo.subscription ? `${planLabel(demo.subscription.cycle)} activa` : 'Sin suscripción activa'}</h2><p>{power.base.toFixed(2)} TH base · {power.bonus.toFixed(3)} TH de bonificación · {power.total.toFixed(3)} TH totales</p></div>
      {demo.subscription ? <button className="button button-secondary" type="button" onClick={() => { cancelDemoSubscription(); setFeedback("La suscripción local terminó y el 1% se retiró de la potencia activa.") }}>Cancelar suscripción local</button> : <span className="proposal-badge">SOLO SESIÓN LOCAL</span>}
    </section>
    <div className="proposal-plan-grid" aria-label="Planes de simulación">
      {plans.map((plan) => <article className="content-panel proposal-plan" key={plan.id}>
        <div className="proposal-plan-top"><span className="card-icon platinum">✧</span><span className="proposal-badge">LOCAL</span></div>
        <p className="card-kicker">SUSCRIPCIÓN {plan.id === 'monthly' ? 'MENSUAL' : 'ANUAL'}</p>
        <h2>{plan.name}</h2>
        {plan.id === 'monthly'
          ? <div className="subscription-price-field"><span>Precio publicado de Platinum+</span><strong>$29.99 USD / 30 días</strong></div>
          : <div className="subscription-price-field subscription-price-pending"><span>Precio anual</span><strong>Sin confirmar · no disponible</strong></div>}
        <small className="proposal-cycle">{plan.cycle} · periodo de {plan.id === 'monthly' ? '30 días' : '365 días'}</small>
        <ul className="proposal-benefits"><li>+1% sobre la potencia activa total mientras esté vigente.</li><li>Retiro simulado sin cola diaria durante la suscripción.</li></ul>
        {plan.id === 'monthly'
          ? <button className="button button-primary" type="button" onClick={() => onPayWithWallet('Suscripción mensual · referencia GoMining Platinum+', 29.99, 'USD')}>Pagar mensual con wallet · $29.99 <span>↗</span></button>
          : <button className="button button-secondary" type="button" disabled title="Precio anual no confirmado">Anual deshabilitado por ahora</button>}
        <button className="button button-primary" type="button" onClick={() => activate(plan.id as 'monthly' | 'annual')} disabled={Boolean(demo.subscription) || plan.id === 'annual'}>{plan.id === 'annual' ? "Plan anual desactivado" : "Activar beneficio local"} <span>↗</span></button>
      </article>)}
    </div>
    {feedback && <p className="inline-feedback" role="status">{feedback}</p>}
    <div className="simulation-warning subscription-price-warning"><span>i</span><span>El checkout mensual usa como referencia los $29.99 por 30 días publicados para Platinum+. El precio anual no está confirmado. Pagar solo envía fondos al destino elegido: no compra Platinum+, no activa el +1% ni el retiro sin cola, no renueva automáticamente y no se vincula a GoMining.</span></div>
    <p className="demo-disclaimer">Los planes de +1% de potencia y retiro sin cola son una propuesta propia. “Activar beneficio local” solo cambia esta sesión; el checkout con wallet no concede ese beneficio.</p>
  </div>
}

function planLabel(cycle: 'monthly' | 'annual') {
  return cycle === 'monthly' ? 'Suscripción mensual' : 'Suscripción anual'
}

function ReferralNavigation({ pathname }: { pathname: string }) {
  const { t } = usePersonalization()
  const tabs = [
    { label: t('referral.tab_overview'), path: '/nft-referral' },
    { label: t('referral.tab_rewards'), path: '/nft-referral/rewards' },
    { label: t('referral.tab_friends'), path: '/nft-referral/friends' },
  ]
  return <nav className="route-tabs referral-tabs" aria-label={t('referral.aria_sections')}>
    {tabs.map((tab) => <Link className={`route-tab ${pathname === tab.path ? 'route-tab-active' : ''}`} to={tab.path} key={tab.path}>{tab.label}</Link>)}
  </nav>
}

function usePrlRevenue(powerTh: number) {
  const [quote, setQuote] = useState<PoolRevenueQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setQuote(null)
    void fetchPrlDailyRevenue(powerTh, controller.signal).then(setQuote).catch((cause: unknown) => {
      if (controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar el ingreso estimado.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [powerTh, revision])
  return { quote, loading, error, refresh: () => setRevision((value) => value + 1) }
}

function MiningTelemetryPanel({ pathname }: { pathname: string }) {
  const demo = useDemoSession()
  const activeDemoWorkers = demo.workers.filter((worker) => worker.status === 'active-demo')
  const activeBasePower = activeDemoWorkers.reduce((sum, worker) => sum + worker.powerTh, 0)
  const hasSubscription = Boolean(demo.subscription && Date.parse(demo.subscription.endsAt) > Date.now())
  const activePower = activeBasePower * (hasSubscription ? 1.01 : 1)
  const powerTh = activePower > 0 ? activePower : 300
  const { quote, loading, error, refresh } = usePrlRevenue(powerTh)
  const section = pathname.split('/').filter(Boolean).at(-1) ?? 'data-centers'
  const tabs = [
    { label: 'Resumen', path: '/data-centers' },
    { label: 'Pool', path: '/data-centers/pool' },
    { label: 'Operaciones', path: '/data-centers/operations' },
    { label: 'Mineros', path: '/data-centers/miners' },
    { label: 'Granjas', path: '/data-centers/farms' },
  ]
  const dateLabel = quote ? new Date(quote.retrievedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : ''

  return <div className="telemetry-stack">
    <nav className="route-tabs telemetry-tabs" aria-label="Trazabilidad de pool">{tabs.map((tab) => <Link className={`route-tab ${pathname === tab.path ? 'route-tab-active' : ''}`} to={tab.path} key={tab.path}>{tab.label}</Link>)}</nav>
    {(section === 'data-centers' || section === 'pool') && <section className="content-panel telemetry-source-card">
      <div className="panel-toolbar"><div><p className="card-kicker">INGRESO DINÁMICO · PRL</p><h2>Pool Kryptex · Pearl</h2><p>Estimación pública consultada para {powerTh.toLocaleString('es-MX')} TH/s{quote ? ` · actualizada ${dateLabel}` : ''}</p></div><button className="button button-secondary" type="button" onClick={refresh} disabled={loading}>{loading ? 'Consultando…' : 'Actualizar ingreso'}</button></div>
      <div className="telemetry-metric-grid">
        <MiningMetric label="Hashrate consultado" value={`${powerTh.toLocaleString('es-MX')} TH/s`} detail={activePower > 0 ? "WORKERS ACTIVOS · LOCAL" : 'REFERENCIA DE 300 TH/s'} />
        <MiningMetric label="Ingreso bruto estimado" value={quote ? `${formatUsd(quote.dailyUsd, 4)} / día` : '—'} detail={quote?.dailyPrl ? `${quote.dailyPrl.toFixed(6)} PRL / día` : 'KRYPTEX · API PÚBLICA'} loading={loading && !quote} />
        <MiningMetric label="Workers asignados" value={`${demo.workers.length}`} detail="SOLO ENTORNO LOCAL" />
        <MiningMetric label="Potencia activa en réplica" value={`${activePower.toLocaleString('es-MX', { maximumFractionDigits: 4 })} TH/s`} detail="NO VERIFICADA EN KRYPTEX" />
      </div>
      {loading && quote && <p className="quote-refreshing" role="status"><i /> Actualizando datos de la pool…</p>}
      {error && <p className="inline-feedback" role="status">{error}</p>}
      <div className="pool-spec-list"><div><span>Pool wallet</span><code>{PRL_POOL_ADDRESS.slice(0, 16)}…{PRL_POOL_ADDRESS.slice(-10)}</code></div><div><span>Costos operativos</span><strong>Se restan en Economía de la operación</strong></div><div><span>Cadencia de esta cifra</span><strong>Estimación diaria · no es un pago liquidado</strong></div></div>
      <div className="pool-source-links"><a className="button button-secondary" href={KRYPTEX_PRL_STATS_URL} target="_blank" rel="noreferrer">Ver actividad pública en Kryptex ↗</a><a className="button button-secondary" href={PEARL_PRL_EXPLORER_URL} target="_blank" rel="noreferrer">Ver transacciones en Pearl ↗</a><Link className="button button-quiet" to="/mining-calculator">Estimar ganancias BTC ↗</Link></div>
      {!quote && !loading && <p className="mining-source-note"><span>i</span> La lectura falló. La pantalla conserva el último resultado solo en memoria si hubo uno.</p>}
    </section>}

    {section === 'operations' && <PoolPayoutHistory />}

    {section === 'data-centers' && <section className="content-panel telemetry-detail-card">
      <div className="panel-toolbar"><div><h2>Fuentes públicas del pool</h2><p>Consulta los pagos en la pestaña Operaciones y abre los perfiles públicos originales.</p></div></div>
      <div className="pool-source-links"><Link className="button button-secondary" to="/data-centers/operations">Ver historial de pagos ↗</Link><a className="button button-secondary" href={PEARL_PRL_EXPLORER_URL} target="_blank" rel="noreferrer">Abrir explorador Pearl ↗</a><a className="button button-secondary" href={KRYPTEX_PRL_STATS_URL} target="_blank" rel="noreferrer">Abrir perfil Kryptex ↗</a></div>
    </section>}

    {(section === 'data-centers' || section === 'pool') && <section className="content-panel telemetry-detail-card telemetry-live-embed">
      <div className="panel-toolbar"><div><h2>Estado público de Kryptex PRL</h2><p>Workers, hashrate, pagos y saldo del pool wallet según el perfil público.</p></div><a className="button button-secondary" href={KRYPTEX_PRL_STATS_URL} target="_blank" rel="noreferrer">Abrir perfil de Kryptex ↗</a></div>
      <iframe title="Estadísticas públicas de la wallet Kryptex PRL" src={KRYPTEX_PRL_STATS_URL} loading="lazy" referrerPolicy="no-referrer" />
    </section>}

    {section === 'miners' && <section className="content-panel table-panel telemetry-table-panel">
      <div className="panel-toolbar"><div><p className="card-kicker">ADMINISTRACIÓN · SESIÓN LOCAL</p><h2>Asignar y activar workers</h2><p>Cada compra local añade un worker a la vista de pool. Puedes activarlo automáticamente o dejarlo pendiente para activación manual; ninguno configura hardware ni Kryptex.</p></div><span className="checkout-local-badge">{demo.workers.length} LOCAL</span></div>
      <div className="worker-activation-settings"><span>Activación tras compra completada</span><div className="builder-mode-tabs"><button className={demo.workerActivationMode === 'automatic' ? 'builder-mode-active' : ''} type="button" onClick={() => setDemoWorkerActivationMode('automatic')}>Automática · local</button><button className={demo.workerActivationMode === 'manual' ? 'builder-mode-active' : ''} type="button" onClick={() => setDemoWorkerActivationMode('manual')}>Manual</button></div><small>El modo manual aplica a nuevas compras; al cambiar a automático se activan los workers locales pendientes. Los pagos de wallet requieren verificación de servidor.</small></div>
      {demo.workers.length === 0 ? <div className="empty-state"><div className="empty-illustration">▦</div><strong>Aún no hay workers asignados</strong><span>Una compra local de minero crea el worker. Los pagos de wallet esperan verificación de servidor antes de activar minería real.</span></div> : <div className="table-scroll"><table><thead><tr><th>Worker</th><th>Minero</th><th>Potencia</th><th>Eficiencia</th><th>Wallet compradora</th><th>Estado</th><th>Ingreso bruto estimado</th><th>Administración local</th></tr></thead><tbody>{demo.workers.map((worker) => {
        const effectiveWorkerPower = worker.powerTh * (hasSubscription && worker.status === 'active-demo' ? 1.01 : 1)
        const workerEstimate = worker.status === 'active-demo' && activePower > 0 && quote ? quote.dailyUsd * effectiveWorkerPower / activePower : null
        return <tr key={worker.id}><td><code>{worker.id}</code></td><td><code>{worker.minerId}</code></td><td>{worker.powerTh.toLocaleString('es-MX')} TH/s</td><td>{worker.efficiency} W/TH</td><td>{worker.ownerWallet ? `${worker.ownerWallet.slice(0, 8)}…${worker.ownerWallet.slice(-6)}` : 'No asociada'}</td><td><span className="table-demo-status">{worker.status === 'active-demo' ? "Activo · local, pool sin verificar" : 'Pendiente de activación local'}</span></td><td>{workerEstimate === null ? '—' : `${formatUsd(workerEstimate, 4)} / día · estimado`}</td><td>{worker.status === 'active-demo' ? <span className="table-demo-status">Activado localmente</span> : <button className="button button-secondary" type="button" onClick={() => activateDemoWorker(worker.id)}>Activar localmente</button>}</td></tr>
      })}</tbody></table></div>}
      <p className="demo-disclaimer">La columna de pago distribuye proporcionalmente una estimación pública Kryptex entre workers activados en esta sesión. No representa liquidación, pago recibido ni confirmación de conexión al pool.</p>
    </section>}

    {section === 'farms' && <section className="content-panel telemetry-detail-card"><div className="panel-toolbar"><div><h2>Granjas</h2><p>La página de Kryptex no expone la ubicación de granjas del operador.</p></div></div><div className="empty-state"><div className="empty-illustration">▦</div><strong>Sin datos de granjas verificables</strong><span>No se generan ubicaciones, capacidades ni estados ficticios. Esta réplica no administra centros físicos de datos.</span></div></section>}
  </div>
}

function PoolPayoutHistory() {
  const [result, setResult] = useState<PoolPayoutPage | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void fetchPoolPayouts(page, controller.signal).then((next) => {
      setResult(next)
      if (next.pageCount > 0 && page > next.pageCount) setPage(next.pageCount)
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar el historial público.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, revision])

  const pageCount = result?.pageCount ?? 0
  const count = result?.count ?? 0
  const updatedAt = result ? new Date(result.retrievedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : ''
  const copy = async (txid: string) => {
    try { await navigator.clipboard.writeText(txid) } catch { /* clipboard access can be unavailable in insecure contexts */ }
  }

  return <section className="content-panel telemetry-detail-card pool-payout-panel">
    <div className="panel-toolbar"><div><p className="card-kicker">PAGOS PÚBLICOS · KRYPTEX PRL</p><h2>Historial de pagos del pool</h2><p>{count.toLocaleString('es-MX')} registros · fuente: historial público de Kryptex{updatedAt ? ` · consultado ${updatedAt}` : ''}</p></div><button className="button button-secondary" type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
    <div className="pool-payout-callout"><span>i</span><p>Estos registros son pagos publicados por Kryptex. <strong>Confirmado en pool</strong> identifica el estado de origen; la conversión o llegada final a otra wallet no se deduce de este registro.</p></div>
    {error && <p className="inline-feedback" role="status">{error}</p>}
    {loading && !result ? <PoolTableSkeleton /> : result?.results.length ? <>
      <div className="table-scroll pool-payout-table-wrap"><table className="pool-payout-table"><thead><tr><th>Fecha</th><th>Importe PRL</th><th>Comisión PRL</th><th>Estado en pool</th><th>Transacción Pearl</th></tr></thead><tbody>{result.results.map((payout) => <tr key={payout.txid}>
        <td>{new Date(payout.date).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</td>
        <td>{Number(payout.amount).toLocaleString('es-MX', { maximumFractionDigits: 8 })} PRL</td>
        <td>{Number(payout.fee).toLocaleString('es-MX', { maximumFractionDigits: 8 })} PRL</td>
        <td><span className={`pool-payout-status ${payout.status === 'FINISHED' ? 'pool-payout-confirmed' : ''}`}>{getPoolPayoutStatus(payout.status)}</span></td>
        <td><span className="pool-payout-tx"><a href={`https://explorer.pearlresearch.ai/tx/${payout.txid}`} target="_blank" rel="noreferrer">{payout.txid.slice(0, 10)}…{payout.txid.slice(-8)} ↗</a><button className="pool-payout-copy" type="button" onClick={() => void copy(payout.txid)} aria-label="Copiar hash de transacción">Copiar</button></span></td>
      </tr>)}</tbody></table></div>
      <div className="pool-payout-mobile-list" role="list" aria-label="Pagos publicados">
        {result.results.map((payout) => <article className="pool-payout-mobile-card" role="listitem" key={`mobile-${payout.txid}`}>
          <div className="pool-payout-mobile-heading"><time dateTime={new Date(payout.date).toISOString()}>{new Date(payout.date).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</time><span className={`pool-payout-status ${payout.status === 'FINISHED' ? 'pool-payout-confirmed' : ''}`}>{getPoolPayoutStatus(payout.status)}</span></div>
          <div className="pool-payout-mobile-values"><div><span>Importe</span><strong>{Number(payout.amount).toLocaleString('es-MX', { maximumFractionDigits: 8 })} PRL</strong></div><div><span>Comisión</span><strong>{Number(payout.fee).toLocaleString('es-MX', { maximumFractionDigits: 8 })} PRL</strong></div></div>
          <div className="pool-payout-mobile-transaction"><span>Transacción Pearl</span><div><a href={`https://explorer.pearlresearch.ai/tx/${payout.txid}`} target="_blank" rel="noreferrer" aria-label={`Abrir transacción ${payout.txid}`}>{payout.txid.slice(0, 10)}…{payout.txid.slice(-8)} ↗</a><button className="pool-payout-copy" type="button" onClick={() => void copy(payout.txid)} aria-label="Copiar hash de transacción">Copiar</button></div></div>
        </article>)}
      </div>
      <div className="pool-payout-pagination"><span>Página {page} de {Math.max(1, pageCount)}</span><div><button className="button button-secondary" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><button className="button button-secondary" type="button" disabled={!pageCount || page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>Siguiente</button></div></div>
    </> : !error && <div className="empty-state"><strong>Sin pagos publicados</strong><span>Kryptex no devolvió registros para esta página.</span></div>}
    <p className="demo-disclaimer">La cifra de ingresos estimados se consulta por separado en la sección Pool. Este historial no contiene workers, balances finales de Solflare ni liquidaciones a compradores.</p>
  </section>
}

function PresalePanel({ openTopUp }: { openTopUp: () => void }) {
  const demo = useDemoSession()
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [feedback, setFeedback] = useState('')
  const total = Math.max(0, Number(quantity) || 0) * Math.max(0, Number(price) || 0)
  const buy = () => {
    const result = simulateDemoPresale(Number(quantity), Number(price))
    if (!result.ok) {
      setFeedback(result.message)
      if (result.required > demo.balance) openTopUp()
      return
    }
    setFeedback(`${quantity} tokens añadidos a la sesión local. Referencia ${result.receipt.id}.`)
  }
  return <div className="presale-demo-stack">
    <section className="content-panel presale-demo-hero"><span className="presale-emblem">✧</span><div><p className="card-kicker">LAUNCHPAD · SESIÓN LOCAL</p><h2>Simular una compra de preventa</h2><p>Configura los parámetros del escenario. No se anuncia una oferta real ni se emiten tokens.</p></div><span className="presale-balance">Saldo local {formatDemoCurrency(demo.balance)}</span></section>
    <div className="presale-form-grid"><label className="operator-field"><span>Cantidad de tokens</span><small>unidades</small><input type="number" min="1" step="1" placeholder="Ingresa la cantidad" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label className="operator-field"><span>Precio por token</span><small>USD · configurable</small><input type="number" min="0" step="0.0001" placeholder="Sin precio definido" value={price} onChange={(event) => setPrice(event.target.value)} /></label><div className="presale-total"><span>Total simulado</span><strong>{formatDemoCurrency(total)}</strong><small>Asignación local: {demo.presaleTokens.toLocaleString('es-MX')} tokens</small></div></div>
    <div className="presale-actions"><button className="button button-primary" type="button" disabled={!quantity || !price || Number(quantity) <= 0 || Number(price) <= 0} onClick={buy}>Probar asignación local <span>↗</span></button>{total > demo.balance && total > 0 && <button className="button button-secondary" type="button" onClick={openTopUp}>Recargar saldo local <span>＋</span></button>}</div>
    {feedback && <p className="inline-feedback" role="status">{feedback}</p>}
    <section className="content-panel presale-requirements"><h2>Condiciones pendientes para cualquier oferta real</h2><ul><li>Contrato verificado, red y activo de pago</li><li>Precio, suministro, límites y elegibilidad</li><li>Fechas, asignación, vesting y reembolsos</li></ul></section>
  </div>
}

export function LegacyOperatorEconomicsPanel() {
  const [inputs, setInputs] = useState({ powerTh: '300', subscriptionBonusPercent: '0', efficiency: '15', electricityUsdPerKwh: '', maintenanceUsdPerThPerDay: '', maintenanceBilledUsdPerThPerDay: '', subscriptionsMonthlyUsd: '', subscriptionsAnnualUsd: '', overheadMonthlyUsd: '', withdrawalsMonthlyUsd: '' })
  const config = useMiningConfig()
  const powerTh = Number(inputs.powerTh) || 0
  const subscriptionBonusPercent = Number(inputs.subscriptionBonusPercent) || 0
  const effectivePowerTh = powerTh * (1 + Math.max(0, subscriptionBonusPercent) / 100)
  const efficiency = Number(inputs.efficiency) || 0
  const quoteState = usePrlRevenue(effectivePowerTh)
  const costsConfigured = inputs.electricityUsdPerKwh.trim() !== '' && inputs.maintenanceUsdPerThPerDay.trim() !== ''
  const settlement = quoteState.quote ? calculateMiningSettlement(quoteState.quote.dailyUsd, {
    powerTh: effectivePowerTh,
    efficiencyWattsPerTh: efficiency,
    electricityUsdPerKwh: Number(inputs.electricityUsdPerKwh) || 0,
    maintenanceUsdPerThPerDay: Number(inputs.maintenanceUsdPerThPerDay) || 0,
    unilevelPercentOfClientPayout: config.unilevelPercentOfClientPayout,
    directReferralPercentOfClientPayout: config.directReferralPercentOfClientPayout,
    activeLevels: config.maxDepth,
    eligibleUplineLevels: Math.max(0, config.maxDepth - 1),
    levelWeights: config.levelWeights,
  }) : null
  const monthlySubscriptions = (Number(inputs.subscriptionsMonthlyUsd) || 0) + (Number(inputs.subscriptionsAnnualUsd) || 0) / 12
  const dailyMaintenanceBilled = effectivePowerTh * (Number(inputs.maintenanceBilledUsdPerThPerDay) || 0)
  const monthlyOwnRevenue = monthlySubscriptions + dailyMaintenanceBilled * 30
  const monthlyPoolRevenue = quoteState.quote ? quoteState.quote.dailyUsd * 30 : 0
  const monthlyOperatingCosts = settlement ? (settlement.electricityUsd + settlement.maintenanceUsd + settlement.commissionBudgetUsd) * 30 + (Number(inputs.overheadMonthlyUsd) || 0) + (Number(inputs.withdrawalsMonthlyUsd) || 0) : 0
  const monthlyReferralBudget = settlement ? settlement.commissionBudgetUsd * 30 : 0
  const monthlyClientPayout = settlement ? settlement.clientPayoutUsd * 30 : 0
  const fmt = (value: number) => formatUsd(value)
  const update = (key: keyof typeof inputs, value: string) => setInputs((current) => ({ ...current, [key]: value }))

  return <div className="operator-economics-stack">
    <section className="form-callout operator-assumptions"><span>i</span><p>La estimación del pool viene de la API pública Kryptex PRL y puede cambiar. El 20% Unilevel se calcula sobre el pago final al minero: tras electricidad y mantenimiento, el neto disponible se divide entre pago y fondo (P = N / 1.2). El 10% directo forma parte del fondo; el otro 10% se reparte entre niveles superiores según pesos relativos. La profundidad es configurable en esta sesión.</p></section>
    <section className="content-panel operator-input-panel">
      <div className="panel-toolbar"><div><h2>Potencia y costos verificables</h2><p>Electricidad diaria = TH efectivo × W/TH ÷ 1000 × 24. El 1% solo se incluye si está activo en este escenario.</p></div><button className="button button-quiet" type="button" onClick={() => setInputs({ powerTh: '300', subscriptionBonusPercent: '0', efficiency: '15', electricityUsdPerKwh: '', maintenanceUsdPerThPerDay: '', maintenanceBilledUsdPerThPerDay: '', subscriptionsMonthlyUsd: '', subscriptionsAnnualUsd: '', overheadMonthlyUsd: '', withdrawalsMonthlyUsd: '' })}>Restablecer</button></div>
      <div className="operator-input-grid">
        <label className="operator-field"><span>Potencia base contratada</span><small>TH/s</small><input type="number" min="0.000001" max="5000" step="any" value={inputs.powerTh} onChange={(event) => update('powerTh', event.target.value)} /></label>
        <label className="operator-field"><span>Bonus de suscripción activo</span><small>% de potencia · 0 si no aplica</small><input type="number" min="0" max="100" step="0.1" value={inputs.subscriptionBonusPercent} onChange={(event) => update('subscriptionBonusPercent', event.target.value)} /></label>
        <label className="operator-field"><span>Eficiencia del minero</span><small>W/TH · referencia GoMining 15</small><input type="number" min="0" step="any" value={inputs.efficiency} onChange={(event) => update('efficiency', event.target.value)} /></label>
        <div className="operator-result"><span>Potencia efectiva del escenario</span><strong>{effectivePowerTh.toLocaleString('es-MX', { maximumFractionDigits: 4 })} TH/s</strong><small>{powerTh.toLocaleString('es-MX')} TH + {subscriptionBonusPercent}% de beneficio</small></div>
        <label className="operator-field"><span>Precio real de electricidad</span><small>USD/kWh</small><input type="number" min="0" step="any" placeholder="Pendiente" value={inputs.electricityUsdPerKwh} onChange={(event) => update('electricityUsdPerKwh', event.target.value)} /></label>
        <label className="operator-field"><span>Costo real de mantenimiento</span><small>USD/TH/día</small><input type="number" min="0" step="any" placeholder="Pendiente" value={inputs.maintenanceUsdPerThPerDay} onChange={(event) => update('maintenanceUsdPerThPerDay', event.target.value)} /></label>
        <label className="operator-field"><span>Mantenimiento cobrado</span><small>USD/TH/día</small><input type="number" min="0" step="any" placeholder="Pendiente" value={inputs.maintenanceBilledUsdPerThPerDay} onChange={(event) => update('maintenanceBilledUsdPerThPerDay', event.target.value)} /></label>
        <label className="operator-field"><span>Ingresos mensuales de suscripciones</span><small>USD/mes</small><input type="number" min="0" step="any" placeholder="0 si no aplica" value={inputs.subscriptionsMonthlyUsd} onChange={(event) => update('subscriptionsMonthlyUsd', event.target.value)} /></label>
        <label className="operator-field"><span>Suscripciones anuales cobradas</span><small>USD/año · se reconoce 1/12</small><input type="number" min="0" step="any" placeholder="0 si no aplica" value={inputs.subscriptionsAnnualUsd} onChange={(event) => update('subscriptionsAnnualUsd', event.target.value)} /></label>
        <label className="operator-field"><span>Infraestructura mensual</span><small>USD/mes</small><input type="number" min="0" step="any" placeholder="0 si no aplica" value={inputs.overheadMonthlyUsd} onChange={(event) => update('overheadMonthlyUsd', event.target.value)} /></label>
        <label className="operator-field"><span>Retiros mensuales</span><small>USD/mes</small><input type="number" min="0" step="any" placeholder="0 si no aplica" value={inputs.withdrawalsMonthlyUsd} onChange={(event) => update('withdrawalsMonthlyUsd', event.target.value)} /></label>
      </div>
    </section>
    <section className="content-panel operator-results-panel">
      <div className="panel-toolbar"><div><h2>Liquidación diaria · PRL</h2><p>{quoteState.quote ? `Fuente Kryptex · consulta ${new Date(quoteState.quote.retrievedAt).toLocaleString('es-MX')}` : 'Estimación pública para la potencia seleccionada'}</p></div><button className="button button-secondary" type="button" onClick={quoteState.refresh} disabled={quoteState.loading}>{quoteState.loading ? 'Consultando…' : 'Actualizar'}</button></div>
      {quoteState.error && <p className="inline-feedback" role="status">{quoteState.error}</p>}
      {settlement ? <div className="operator-results-grid">
        <div className="operator-result"><span>Pool bruto estimado</span><strong>{fmt(settlement.grossPoolUsd)}</strong><small>{quoteState.quote?.dailyPrl?.toFixed(6) ?? '—'} PRL/día · cotización pública</small></div>
        <div className="operator-result"><span>Electricidad diaria</span><strong>{costsConfigured ? fmt(settlement.electricityUsd) : 'Pendiente'}</strong><small>{settlement.electricityKwh.toFixed(2)} kWh/día · {costsConfigured ? 'tarifa configurada' : 'ingresa tu USD/kWh'}</small></div>
        <div className="operator-result"><span>Mantenimiento diario</span><strong>{costsConfigured ? fmt(settlement.maintenanceUsd) : 'Pendiente'}</strong><small>{costsConfigured ? 'Costo real configurado' : 'ingresa USD/TH/día'}</small></div>
        <div className="operator-result"><span>Pago diario al cliente</span><strong>{costsConfigured ? fmt(settlement.clientPayoutUsd) : 'Pendiente'}</strong><small>Después de costos y fondo Unilevel</small></div>
        <div className="operator-result"><span>Fondo Unilevel diario</span><strong>{costsConfigured ? fmt(settlement.commissionBudgetUsd) : 'Pendiente'}</strong><small>{config.unilevelPercentOfClientPayout}% del pago final al minero · incluye directo</small></div>
        <div className="operator-result"><span>Directo diario</span><strong>{costsConfigured ? fmt(settlement.directReferralUsd) : 'Pendiente'}</strong><small>{config.directReferralPercentOfClientPayout}% incluido en el fondo</small></div>
      </div> : quoteState.loading ? <div className="operator-results-grid ui-skeleton-operator-results" role="status" aria-label="Calculando liquidación diaria"><div className="operator-result"><Skeleton shape="line" width="54%" /><Skeleton shape="line" className="ui-skeleton-operator-value" /><Skeleton shape="line" width="66%" /></div><div className="operator-result"><Skeleton shape="line" width="48%" /><Skeleton shape="line" className="ui-skeleton-operator-value" /><Skeleton shape="line" width="62%" /></div><div className="operator-result"><Skeleton shape="line" width="56%" /><Skeleton shape="line" className="ui-skeleton-operator-value" /><Skeleton shape="line" width="58%" /></div><div className="operator-result"><Skeleton shape="line" width="50%" /><Skeleton shape="line" className="ui-skeleton-operator-value" /><Skeleton shape="line" width="65%" /></div><div className="operator-result"><Skeleton shape="line" width="46%" /><Skeleton shape="line" className="ui-skeleton-operator-value" /><Skeleton shape="line" width="57%" /></div><div className="operator-result"><Skeleton shape="line" width="52%" /><Skeleton shape="line" className="ui-skeleton-operator-value" /><Skeleton shape="line" width="60%" /></div></div> : <div className="empty-state operator-results-empty"><div className="empty-illustration">∑</div><strong>Sin cotización disponible</strong><span>La liquidación se calcula cuando la lectura de PRL llega correctamente.</span></div>}
      <div className="operator-results-grid operator-monthly-summary">
        <div className="operator-result"><span>Ingresos propios del mes</span><strong>{fmt(monthlyOwnRevenue)}</strong><small>Suscripciones mensual + anual/12 + mantenimiento cobrado</small></div>
        <div className="operator-result"><span>Ingreso bruto estimado del pool</span><strong>{quoteState.loading && !quoteState.quote ? <MetricValueSkeleton /> : quoteState.quote ? fmt(monthlyPoolRevenue) : 'Pendiente'}</strong><small>Estimación Kryptex PRL × 30 días; no liquidado</small></div>
        <div className="operator-result"><span>Costos operativos del mes</span><strong>{quoteState.loading && costsConfigured ? <MetricValueSkeleton /> : settlement && costsConfigured ? fmt(monthlyOperatingCosts + monthlyClientPayout) : 'Pendiente'}</strong><small>Electricidad + mantenimiento + clientes + reserva Unilevel + infraestructura + retiros</small></div>
        <div className="operator-result operator-result-net"><span>Margen operativo estimado</span><strong>{quoteState.loading && costsConfigured ? <MetricValueSkeleton /> : settlement && costsConfigured ? fmt(monthlyOwnRevenue + monthlyPoolRevenue - monthlyOperatingCosts - monthlyClientPayout) : 'Pendiente'}</strong><small>Escenario de 30 días; faltan impuestos y costos reales del equipo</small></div>
        <div className="operator-result"><span>Pago cliente en 30 días</span><strong>{quoteState.loading && costsConfigured ? <MetricValueSkeleton /> : settlement && costsConfigured ? fmt(monthlyClientPayout) : 'Pendiente'}</strong><small>Escenario de 30 días, no una obligación liquidada</small></div>
        <div className="operator-result"><span>Reserva Unilevel en 30 días</span><strong>{quoteState.loading && costsConfigured ? <MetricValueSkeleton /> : settlement && costsConfigured ? fmt(monthlyReferralBudget) : 'Pendiente'}</strong><small>Porcentajes configurados en esta sesión</small></div>
      </div>
      <p className="demo-disclaimer">La API entrega una estimación diaria para el hashrate, no los ingresos realmente acreditados a la wallet. El worker público y los pagos en cadena se consultan en la sección Pool.</p>
    </section>
    <MiningAdminPanel />
  </div>
}

function MiningAdminPanel() {
  const config = useMiningConfig()
  const updateWeight = (index: number, value: string) => {
    const weights = [...config.levelWeights]
    weights[index] = Number(value)
    updateMiningConfig({ levelWeights: weights })
  }
  return <section className="content-panel operator-input-panel mining-admin-panel">
    <div className="panel-toolbar"><div><p className="card-kicker">REFERIDOS · SIMULACIÓN LOCAL</p><h2>Parámetros del escenario Unilevel</h2><p>Configura profundidad y pesos relativos para evaluar la distribución propuesta.</p></div><button className="button button-quiet" type="button" onClick={resetMiningConfig}>Restablecer escenario</button></div>
    <div className="operator-input-grid">
      <label className="operator-field"><span>Profundidad máxima</span><small>niveles · hasta 10</small><input type="number" min="1" max="10" step="1" value={config.maxDepth} onChange={(event) => updateMiningConfig({ maxDepth: Number(event.target.value) })} /></label>
      <div className="operator-result"><span>Fondo Unilevel</span><strong>{config.unilevelPercentOfClientPayout}% del pago al minero</strong><small>Regla indicada por el operador</small></div>
      <div className="operator-result"><span>Comisión directa</span><strong>{config.directReferralPercentOfClientPayout}% del pago al minero</strong><small>Incluida en el fondo total; no se suma por separado</small></div>
    </div>
    <div className="unilevel-levels mining-level-weights">{REFERRAL_LEVEL_WEIGHTS.map((referenceWeight, index) => <label className="operator-field" key={index}><span>Nivel {index + 1}</span><small>{index === 0 ? `Directo · peso fuente ${referenceWeight}` : `Peso relativo 1nvezt · ${index + 1 <= config.maxDepth ? 'activo' : 'fuera de profundidad'}`}</small><input type="number" min="0" step="0.1" value={config.levelWeights[index] ?? referenceWeight} onChange={(event) => updateWeight(index, event.target.value)} /></label>)}</div>
    <p className="simulation-warning"><span>i</span><span>El total de 20% se calcula sobre el pago final del minero. El directo ocupa 10 puntos y los 10 restantes se distribuyen por pesos relativos de los niveles superiores; estos pesos solo adaptan el patrón de 1nvezt y no son su lógica original de token-sales. Sin una cadena elegible, los importes quedan reservados. La profundidad y los pesos viven en sessionStorage; no están en Firestore.</span></p>
  </section>
}

function QuickAction({ icon, label, to, onClick }: { icon: string; label: string; to?: string; onClick?: () => void }) {
  const contents = <><span>{icon}</span><strong>{label}</strong></>
  return to ? <Link className="quick-action" to={to}>{contents}</Link> : <button className="quick-action" onClick={onClick}>{contents}</button>
}

function MiningMetric({ label, value, detail = "LOCAL", loading = false }: { label: string; value: string; detail?: string; loading?: boolean }) {
  return <div className={`mining-metric ${loading ? 'mining-metric-loading' : ''}`} aria-busy={loading}>
    <span>{label}</span>
    {loading ? <><MetricValueSkeleton /><span className="ui-skeleton-metric-detail" aria-hidden="true" /></> : <><strong>{value}</strong><small>{detail}</small></>}
  </div>
}

function MarketItem({ name, value = '—' }: { name: string; value?: string }) {
  return <div className="market-item"><CryptoIcon symbol={name === 'BTC' ? 'BTC' : 'GOMINING'} size="md" /><div><strong>{name}</strong><small>{value}</small></div></div>
}

function DashboardCard({
  tone, kicker, title, body, action, icon, to, onClick,
}: { tone: string; kicker: string; title: string; body: string; action: string; icon: string; to?: string; onClick?: () => void }) {
  const inside = <><div className={`card-icon ${tone}`}>{icon}</div><div className="card-main"><span className="card-kicker">{kicker}</span><h3>{title}</h3><p>{body}</p><span className="card-link">{action}<b>↗</b></span></div></>
  return to ? <Link className="dashboard-card" to={to}>{inside}</Link> : <button className="dashboard-card" onClick={onClick}>{inside}</button>
}

function ExploreCard({ icon, title, subtitle, badge, to, onClick }: { icon: string; title: string; subtitle: string; badge: string; to?: string; onClick?: () => void }) {
  const content = <><span className="explore-icon">{icon}</span><span className="explore-copy"><strong>{title}</strong><small>{subtitle}</small></span><span className="explore-badge">{badge}</span><span className="explore-arrow">↗</span></>
  return to ? <Link to={to} className="explore-card">{content}</Link> : <button onClick={onClick} className="explore-card">{content}</button>
}

function DataTable({ screen, paymentReceipts }: { screen: ScreenDefinition; paymentReceipts: PaymentReceipt[] }) {
  const demo = useDemoSession()
  const isTransactions = screen.title === 'Transacciones'
  const isEarnSummary = screen.title === 'Resumen de ganancias'
  if (isEarnSummary) {
    const mining = getDemoMiningPower(demo)
    const demoReferralCredits = demo.receipts.filter((receipt) => receipt.kind === 'referral').reduce((total, receipt) => total + receipt.amount, 0)
    return <section className="content-panel table-panel earn-summary-panel">
      <div className="panel-toolbar"><div><h2>Resumen de ganancias</h2><p>Panel de minería independiente de Simple Earn.</p></div><span className="checkout-local-badge">MVP</span></div>
      <div className="referral-stats-grid">
        <div className="stat-item"><span>Potencia minera local</span><strong>{mining.total.toFixed(2)} TH</strong><small>{demo.miners.length} equipos locales</small></div>
        <div className="stat-item"><span>Liquidaciones de pool verificadas</span><strong>Sin datos</strong><small>La réplica aún no concilia recompensas</small></div>
        <div className="stat-item"><span>Recompensas locales de referido</span><strong>{formatDemoCurrency(demoReferralCredits)}</strong><small>Simulación local; no son pagos de minería</small></div>
      </div>
      <p className="demo-disclaimer">Cuando se conecte una fuente de liquidaciones, esta vista podrá resumir ingresos por periodo. Por ahora no transforma estimaciones del pool ni acciones locales en ganancias reales.</p>
    </section>
  }
  return (
    <section className="content-panel table-panel">
      <div className="panel-toolbar"><div><h2>{screen.title}</h2><p>{isTransactions ? "Movimientos creados en esta sesión de simulación." : 'Datos sintéticos de esta vista local.'}</p></div><span className="checkout-local-badge">LOCAL</span></div>
      {isTransactions && (demo.receipts.length > 0 || paymentReceipts.length > 0) ? <div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Activo</th><th>Importe</th><th>Estado</th><th>Hash</th></tr></thead><tbody>
        {paymentReceipts.map((receipt) => <tr key={receipt.id}><td>{new Date(receipt.sentAt).toLocaleString('es-MX')}</td><td>Wallet · {receipt.productName}</td><td>{receipt.quote.networkName}</td><td>{formatAssetAmount(receipt.quote.amount, receipt.quote.asset)}</td><td>{receipt.bridgeStatus === 'pending' ? 'Enviado · Bridge pendiente' : 'Enviado · confirmación no verificada'}</td><td><code className="payment-hash-cell">{receipt.transactionHash}</code></td></tr>)}
        {demo.receipts.map((receipt) => <tr key={receipt.id}><td>{receipt.createdAt}</td><td>{receipt.kind}</td><td>{receipt.label}</td><td>{formatDemoCurrency(receipt.amount)}</td><td><span className="table-demo-status">Local</span></td><td>—</td></tr>)}
      </tbody></table></div> : <div className="empty-state"><div className="empty-illustration">▤</div><strong>{isTransactions ? 'Aún no hay movimientos' : 'No hay filas en esta vista'}</strong><span>{isTransactions ? 'Los pagos con wallet y las acciones locales aparecerán en esta sesión.' : "La tabla está lista para datos de simulación cuando existan."}</span></div>}
    </section>
  )
}

function CatalogPanel({ screen, pathname, openAction, addProduct }: { screen: ScreenDefinition; pathname: string; openAction: (title: string, detail?: string) => void; addProduct: (product: DemoProduct) => void }) {
  const [filter, setFilter] = useState('')
  const products = getProductsForRoute(pathname).filter((product) => `${product.title} ${product.category}`.toLowerCase().includes(filter.toLowerCase()))
  return (
    <section className="content-panel catalog-panel">
      <div className="panel-toolbar"><div><h2>{screen.group === 'Panel' ? 'Mis activos' : `Explora ${screen.title}`}</h2><p>Contenido de muestra sin datos de cuenta.</p></div><button className="button button-quiet" onClick={() => setFilter(filter ? '' : 'ejemplo')}>⌕ <span>Filtros</span></button></div>
      <div className="filter-row"><label className="search-box"><span>⌕</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar en esta sección" /></label><button className="filter-chip" onClick={() => setFilter('')}>Todos <span>⌄</span></button><span className="results-hint">Vista local</span></div>
      {getProductsForRoute(pathname).length > 0 ? (
        products.length > 0
          ? <DemoProductGrid products={products} addProduct={addProduct} />
          : <div className="catalog-empty"><div className="empty-illustration">⌕</div><strong>Sin coincidencias</strong><span>No hay productos de ejemplo que coincidan con “{filter}”.</span></div>
      ) : screen.observed && screen.title === 'Mineros' ? (
        <div className="asset-empty"><div className="miner-visual">▧</div><div><strong>Tu colección de mineros</strong><p>Los activos de tu cuenta no están conectados a la réplica.</p><button className="button button-primary button-small" onClick={() => openAction('Crear minero', actionDetail('Crear minero'))}>Crear minero <span>↗</span></button></div></div>
      ) : (
        <div className="catalog-empty"><div className="empty-illustration">{screen.icon}</div><strong>{filter ? 'Sin coincidencias en esta vista' : 'Contenido no disponible en modo local'}</strong><span>La sección aparece en la navegación de GoMining; sus datos no se copiaron.</span>{screen.action && <button className="button button-secondary button-small" onClick={() => openAction(screen.action!, actionDetail(screen.action!))}>{screen.action}</button>}</div>
      )}
    </section>
  )
}

function MinerPanel({ openMinerBuilder, openTopUp }: { openMinerBuilder: () => void; openTopUp: () => void }) {
  const { user } = useAuth()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [applied, setApplied] = useState(false)
  const [pendingFeedback, setPendingFeedback] = useState('')
  const demo = useDemoSession()
  const mining = getDemoMiningPower(demo)
  return (
    <div className="miner-page-stack">
      {demo.pendingMinerOrders.length > 0 && <section className="content-panel pending-miner-orders">
        <div className="panel-toolbar"><div><h2>Pedidos locales pendientes</h2><p>El minero se añade a la granja al completar el pago con saldo local.</p></div><span className="checkout-local-badge">LOCAL</span></div>
        <div className="pending-miner-list">{demo.pendingMinerOrders.map((order) => <article className="pending-miner-row" key={order.id}>
          <div><span className="card-kicker">PAGO PENDIENTE · {order.purchaseMode === 'monthly' ? 'MENSUAL' : 'UNA SOLA VEZ'}</span><strong>{order.name} · {order.powerTh.toFixed(2)} TH</strong><small>{formatDemoCurrency(order.price)} · creado {order.createdAt}</small></div>
          <div className="pending-miner-actions"><button className="button button-primary button-small" type="button" onClick={() => {
            const result = payPendingDemoMiner(order.id)
            if (!result.ok) {
              setPendingFeedback(result.message)
              if (result.required > result.available) openTopUp()
              return
            }
            const minerId = result.receipt?.id ? `miner_${result.receipt.id}` : `miner_${order.id}`
            recordMinerPurchaseToAdmin({
              minerId,
              uid: user?.uid,
              email: user?.email || '',
              name: order.name,
              powerTh: order.powerTh,
              price: order.price,
              txHash: `sim_pending_${order.id}`,
              network: 'LOCAL_BALANCE',
              ownerWallet: order.ownerWallet || 'INTERNAL',
              packageId: order.packageId,
            }).catch(() => {})
            setPendingFeedback(`Pedido local completado · ${result.receipt?.id}`)
          }}>Pagar con saldo local</button><button className="button button-quiet button-small" type="button" onClick={() => { cancelPendingDemoMiner(order.id); setPendingFeedback('Pedido local cancelado.') }}>Cancelar</button></div>
        </article>)}</div>
        {pendingFeedback && <p className="inline-feedback" role="status">{pendingFeedback}</p>}
      </section>}
      <section className="content-panel catalog-panel">
        <div className="panel-toolbar"><div><h2>Mis mineros</h2><p>{demo.miners.length} minero(s) · {mining.total.toFixed(3)} TH en la granja de simulación.</p></div><button className="button button-primary button-small" onClick={openMinerBuilder}>Crear minero <span>↗</span></button></div>
        <div className="filter-row"><button className="filter-chip" onClick={() => setFiltersOpen((open) => !open)}>☷ Filtros <span>{filtersOpen ? '⌃' : '⌄'}</span></button><span className="results-hint">Vista local</span></div>
        {filtersOpen && <div className="miner-filter-panel"><label className="search-box"><span>⌕</span><input placeholder="Buscar mineros" /></label><button className="filter-chip">Estado <span>⌄</span></button><button className="filter-chip">Colección <span>⌄</span></button><button className="button button-primary button-small" onClick={() => setApplied(true)}>Aplicar</button><button className="button button-quiet button-small" onClick={() => { setApplied(false); setFiltersOpen(false) }}>Limpiar</button></div>}
        {applied && <div className="filter-applied">Filtros aplicados en esta vista local.</div>}
        {demo.miners.length === 0 ? <div className="asset-empty"><div className="miner-visual">▧</div><div><strong>Tu granja está lista</strong><p>Crea un minero y completa la compra de simulación para verlo aquí.</p><button className="button button-primary button-small" onClick={openMinerBuilder}>Crear minero <span>↗</span></button></div></div> : <div className="demo-miner-grid">{demo.miners.map((miner) => <article className="demo-miner-card" key={miner.id}><span className="miner-visual">▧</span><div><span className="card-kicker">MINERO · {miner.purchaseMode === 'monthly' ? 'MENSUAL' : 'UNA SOLA VEZ'}</span><strong>{miner.name}</strong><small>{miner.powerTh.toFixed(2)} TH · {miner.efficiency} W/TH</small><small>Compra local {miner.acquiredAt}</small></div><span className="table-demo-status">ACTIVO · LOCAL</span></article>)}</div>}
      </section>
    </div>
  )
}

const marketplaceFilters = [
  'DISPONIBILIDAD', 'PRECIO', 'TIPO DE PRECIO', 'EFICIENCIA ENERGÉTICA', 'ENERGÍA', 'COLECCIONES',
  'LOGROS', 'VENTA', 'CUERPO', 'MUY FANÁTICO', 'PANTALLA', 'UI', 'POCO FANÁTICO', 'BOTONES',
  'ACTUALIZACIONES', 'PAREDES', 'BASE', 'ELEMENTOS', 'STICKERS',
]

export function MarketplacePanel({ addProduct }: { addProduct: (product: DemoProduct) => void }) {
  const [openFilters, setOpenFilters] = useState<string[]>(['DISPONIBILIDAD'])
  const [forSale, setForSale] = useState(true)
  const [applied, setApplied] = useState(false)
  const toggleFilter = (label: string) => setOpenFilters((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label])
  return (
    <section className="content-panel marketplace-panel">
      <div className="marketplace-heading"><div><span className="card-kicker">MARKETPLACE</span><h2>Mineros</h2></div><button className="button button-secondary button-small">Ofertas</button></div>
      <div className="marketplace-body">
        <aside className="marketplace-filters">
          <div className="market-filter-heading"><strong>Filtros</strong><button onClick={() => setOpenFilters([])}>⌃</button></div>
          <div className="sort-control"><span>ORDENAR POR</span><button onClick={() => toggleFilter('SORT')}>Nuevos <span>⌄</span></button>{openFilters.includes('SORT') && <small>Opciones de orden no confirmadas.</small>}</div>
          {marketplaceFilters.map((label) => <div className="filter-accordion" key={label}>
            <button onClick={() => toggleFilter(label)}><span>{label}</span><b>{openFilters.includes(label) ? '−' : '+'}</b></button>
            {openFilters.includes(label) && label === 'DISPONIBILIDAD' && <label className="check-row"><input type="checkbox" checked={forSale} onChange={(event) => setForSale(event.target.checked)} />En venta</label>}
            {openFilters.includes(label) && label !== 'DISPONIBILIDAD' && <small>Opciones no confirmadas en la captura.</small>}
          </div>)}
          <div className="market-filter-actions"><button className="button button-primary button-small" onClick={() => setApplied(true)}>Aplicar</button><button className="button button-quiet button-small" onClick={() => { setForSale(false); setApplied(false); setOpenFilters([]) }}>Limpiar</button></div>
        </aside>
        <div className="marketplace-results"><div className="market-results-meta"><span>{applied ? 'Filtros locales aplicados' : 'Productos de muestra'}</span><span>Orden: Nuevos</span></div><DemoProductGrid products={getProductsForRoute('/marketplace')} addProduct={addProduct} /></div>
      </div>
    </section>
  )
}

function RewardsPanel({ pathname, openAction }: { pathname: string; openAction: (title: string, detail?: string) => void }) {
  const [historicalOpen, setHistoricalOpen] = useState(false)
  const isPool = pathname === '/nft-rewards/pool'
  return (
    <section className="rewards-panel-wrap">
      <div className="route-tabs"><Link className={!isPool ? 'route-tab route-tab-active' : 'route-tab'} to="/nft-rewards/solo">Minería</Link><Link className={isPool ? 'route-tab route-tab-active' : 'route-tab'} to="/nft-rewards/pool">Miner Wars</Link></div>
      <section className="content-panel rewards-panel">
        <div className="panel-toolbar"><div><h2>{isPool ? 'Miner Wars' : 'Recompensas de minería'}</h2><p>Datos de cuenta desconectados en la réplica local.</p></div><button className="button button-quiet" onClick={() => openAction('Ajustes de las recompensas', actionDetail('Ajustes de las recompensas'))}>Ajustes de las recompensas</button></div>
        {!isPool && <><div className="maintenance-tile"><span className="card-icon purple">✦</span><div><strong>Descuento de mantenimiento</strong><small>El valor de la cuenta no se conserva en esta réplica.</small></div><span className="placeholder-value">—</span></div><button className="history-toggle" onClick={() => setHistoricalOpen((open) => !open)}>Tasa histórica de BTC <span>{historicalOpen ? '⌃' : '⌄'}</span></button>{historicalOpen && <div className="history-empty">No hay datos de simulación para la tasa histórica.</div>}</>}
        <div className="empty-state rewards-empty"><div className="empty-illustration">{isPool ? '♜' : '✦'}</div><strong>{isPool ? 'Miner Wars' : 'Recompensas'}</strong><span>La sección y sus controles se identificaron; los registros y valores quedan sin conectar.</span></div>
      </section>
    </section>
  )
}

function FormPanel({ screen, pathname, openAction, addProduct, onPayWithWallet, walletSession }: { screen: ScreenDefinition; pathname: string; openAction: (title: string, detail?: string) => void; addProduct: (product: DemoProduct) => void; onPayWithWallet: (productName: string, amount: number, currency?: PaymentCurrency) => void; walletSession: ReturnType<typeof useWalletSession> }) {
  const demo = useDemoSession()
  const [amount, setAmount] = useState('')
  const [networkCost, setNetworkCost] = useState('')
  const [feedback, setFeedback] = useState('')
  const [depositTab, setDepositTab] = useState<'balance' | 'maintenance'>('balance')
  const [maintToken, setMaintToken] = useState<'PEARL' | 'USDT'>('PEARL')
  const [maintAmount, setMaintAmount] = useState('')
  const [withdrawalDestination, setWithdrawalDestination] = useState(walletSession.connection?.address ?? '')
  useEffect(() => setWithdrawalDestination(walletSession.connection?.address ?? ''), [walletSession.connection?.address])
  const purchaseProduct = getPrimaryPurchaseProduct(pathname)
  if (pathname === '/deposit') {
    const value = Number(amount)
    const tokenVal = Number(maintAmount)
    const convertedCredit = tokenVal * (maintToken === 'USDT' ? 1.0 : 0.05)
    return <div className="form-layout">
      <section className="content-panel form-panel">
        <div className="panel-toolbar">
          <div>
            <h2>Recargar y Depositar</h2>
            <p>Elige entre recargar saldo local o depositar token de mantenimiento (PEARL / USDT).</p>
          </div>
          <span className="form-step">DEPÓSITO</span>
        </div>
        <div className="builder-mode-tabs" style={{ marginBottom: '14px' }}>
          <button type="button" className={depositTab === 'balance' ? 'builder-mode-active' : ''} onClick={() => { setDepositTab('balance'); setFeedback('') }}>
            Saldo General (USD)
          </button>
          <button type="button" className={depositTab === 'maintenance' ? 'builder-mode-active' : ''} onClick={() => { setDepositTab('maintenance'); setFeedback('') }}>
            Token de Mantenimiento (PEARL / USDT)
          </button>
        </div>
        {depositTab === 'balance' ? (
          <>
            <label className="field-label">Importe · USD
              <input type="number" min="1" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ej. 500" />
            </label>
            <div className="form-callout">
              <span>i</span>
              <p>Una transferencia a la dirección del operador no acredita automáticamente el saldo de esta réplica. El crédito local es independiente.</p>
            </div>
            <div className="form-actions-row">
              <button className="button button-primary" disabled={!Number.isFinite(value) || value <= 0} onClick={() => onPayWithWallet('Recarga de saldo', value)}>
                Pagar con wallet <span>↗</span>
              </button>
              <button className="button button-secondary" disabled={!Number.isFinite(value) || value <= 0} onClick={() => {
                const receipt = addDemoBalance(value, 'Depósito local')
                setFeedback(receipt ? `Recarga local aplicada. Referencia ${receipt.id}.` : 'Ingresa un importe mayor que cero.')
              }}>
                Añadir saldo local
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="field-label">Token de mantenimiento
              <select value={maintToken} onChange={(event) => setMaintToken(event.target.value as 'PEARL' | 'USDT')}>
                <option value="PEARL">PEARL · Tarifa 1 PEARL = $0.05 USD (-20% de descuento)</option>
                <option value="USDT">USDT · 1 USDT = $1.00 USD Crédito</option>
              </select>
            </label>
            <label className="field-label">Cantidad de tokens {maintToken} a depositar
              <input type="number" min="1" step="any" value={maintAmount} onChange={(event) => setMaintAmount(event.target.value)} placeholder={maintToken === 'PEARL' ? 'Ej. 1000' : 'Ej. 50'} />
            </label>
            <div className="form-callout">
              <span>✦</span>
              <p>
                <strong>Conversión automática:</strong> Al depositar {Number.isFinite(tokenVal) && tokenVal > 0 ? tokenVal.toLocaleString('es-MX') : '0'} {maintToken}, se convierte automáticamente en <strong>${convertedCredit.toFixed(2)} USD</strong> de <strong>Crédito de Mantenimiento</strong>.
                {maintToken === 'PEARL' ? ' Incluye hasta 20% de ahorro en electricidad.' : ''}
              </p>
            </div>
            <div className="form-actions-row">
              <button className="button button-primary" disabled={!Number.isFinite(tokenVal) || tokenVal <= 0} onClick={() => {
                const receipt = depositMaintenanceToken(maintToken, tokenVal)
                if (receipt) {
                  setFeedback(`Depósito procesado: ${receipt.detail}. Nuevo saldo de crédito: $${(demo.maintenanceCredit ?? 0) + convertedCredit} USD.`)
                  setMaintAmount('')
                } else {
                  setFeedback('Ingresa una cantidad válida mayor a cero.')
                }
              }}>
                Depositar {maintToken} y convertir en crédito <span>✓</span>
              </button>
            </div>
          </>
        )}
        {feedback && <p className="inline-feedback" role="status">{feedback}</p>}
      </section>
      <aside className="side-info-card">
        <span className="side-info-icon">↓</span>
        <h3>Balances</h3>
        <p>Saldos de simulación y costos operativos.</p>
        <div className="info-divider"/>
        <small>Saldo local USD</small>
        <strong>{formatDemoCurrency(demo.balance)}</strong>
        <div style={{ marginTop: '12px' }}>
          <small>Crédito de mantenimiento</small>
          <strong style={{ color: '#8c50f5', display: 'block', fontSize: '18px' }}>
            ${(demo.maintenanceCredit ?? 0).toFixed(2)} USD
          </strong>
          <p style={{ fontSize: '11px', color: '#9396a9', marginTop: '4px' }}>
            Usado diariamente para pagar la electricidad y mantenimiento de los mineros.
          </p>
        </div>
      </aside>
    </div>
  }
  if (pathname === '/withdraw/GOMINING') {
    const value = Number(amount)
    const fee = Number(networkCost)
    const valid = Boolean(walletSession.connection && withdrawalDestination) && amount !== '' && networkCost !== '' && Number.isFinite(value) && Number.isFinite(fee) && value > fee && fee >= 0
    const power = getDemoMiningPower(demo)
    return <div className="form-layout"><section className="content-panel form-panel"><div className="panel-toolbar"><div><h2>Retirar GOMINING</h2><p>El destino se toma de la wallet conectada y se muestra antes de registrar la solicitud.</p></div><span className="form-step">LOCAL</span></div>
      {walletSession.connection ? <div className="withdrawal-destination"><span>Wallet de destino · {walletSession.connection.name}</span><code>{withdrawalDestination}</code><small>{walletSession.connection.network}</small></div> : <div className="form-callout"><span>i</span><p>Conecta una wallet para usarla como destino predeterminado del retiro.</p><Link className="button button-secondary" to="/gmt-wallets">Conectar wallet <span>↗</span></Link></div>}
      <label className="field-label">Importe bruto · USD<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Importe a retirar" /></label>
      <label className="field-label">Costo de red estimado · USD<input type="number" min="0" step="0.01" value={networkCost} onChange={(event) => setNetworkCost(event.target.value)} placeholder="Configura un costo" /></label>
      <div className="withdrawal-summary"><div><span>Comisión estimada</span><strong>{networkCost === '' ? 'Pendiente' : formatDemoCurrency(fee)}</strong></div><div><span>Importe neto</span><strong>{valid ? formatDemoCurrency(value - fee) : '—'}</strong></div><div><span>Cola diaria</span><strong>{power.hasSubscription ? 'Sin cola diaria' : 'Aplicada'}</strong></div></div>
      <div className="form-callout"><span>i</span><p>La tarifa es editable y no se cotiza automáticamente. Esta réplica solo registra una solicitud local: no firma ni transmite fondos de salida porque no hay un servicio de pagos conectado.</p></div>
      <button className="button button-primary" disabled={!valid} onClick={() => { const result = simulateDemoWithdrawal(value, fee); if (!result.ok) { setFeedback(result.message); return } setFeedback(`Solicitud local ${result.receipt.id} registrada para ${walletSession.connection?.shortAddress ?? 'la wallet conectada'}. No se envió una transacción.`) }}>Registrar solicitud local <span>↗</span></button>{feedback && <p className="inline-feedback" role="status">{feedback}</p>}</section>
      <aside className="side-info-card"><span className="side-info-icon">↑</span><h3>Saldo local</h3><p>Importe disponible en este navegador.</p><div className="info-divider"/><small>Balance</small><strong>{formatDemoCurrency(demo.balance)}</strong></aside></div>
  }
  if (pathname === '/buy/GOMINING') {
    return <div className="form-layout"><section className="content-panel form-panel"><div className="panel-toolbar"><div><h2>Comprar GOMINING</h2><p>Acceso conservado desde tokenómica para el futuro MVP.</p></div><span className="form-step">TOKENÓMICA</span></div><div className="form-callout"><span>i</span><p>La réplica aún no tiene contrato, cotizador ni entrega de tokens verificados. El paquete que antes alimentaba el carrito era un producto ficticio; se retiró del flujo para no confundirlo con una compra real.</p></div><button className="button button-primary" type="button" onClick={() => openAction('Comprar GOMINING', 'Vista conservada. La compra real se habilitará cuando exista una cotización verificable y un mecanismo confirmado de entrega del token.')}>Ver estado de compra <span>↗</span></button></section><aside className="side-info-card"><span className="side-info-icon">◉</span><h3>Tokenómica</h3><p>La sección sigue en la navegación y no utiliza carrito.</p></aside></div>
  }
  if (purchaseProduct) {
    return (
      <div className="form-layout">
        <section className="content-panel form-panel purchase-preview">
          <div className="panel-toolbar"><div><h2>Producto de simulación</h2><p>Recorrido de compra completo en esta sesión local.</p></div><span className="form-step">LOCAL</span></div>
          <div className="purchase-preview-product"><span className="purchase-preview-icon">{purchaseProduct.icon}</span><div><span className="card-kicker">{purchaseProduct.category}</span><h2>{purchaseProduct.title}</h2><p>{purchaseProduct.description}</p><strong>{formatDemoPrice(purchaseProduct.price)} <small>precio de ejemplo</small></strong></div></div>
          <div className="form-callout"><span>i</span><p>Precio ficticio para probar el carrito. No se emiten tokens, no se usa una pasarela y no se envía información.</p></div>
          <button className="button button-primary" onClick={() => addProduct(purchaseProduct)}>Agregar al carrito <span>＋</span></button>
        </section>
        <aside className="side-info-card"><span className="side-info-icon">▱</span><h3>Compra local</h3><p>Podrás revisar el pedido, ajustar unidades y terminar con un comprobante simulado.</p><div className="info-divider" /><small>Pago</small><strong>Ninguno · sin pasarela</strong></aside>
      </div>
    )
  }
  return (
    <div className="form-layout">
      <section className="content-panel form-panel">
        <div className="panel-toolbar"><div><h2>Vista previa</h2><p>Los campos no envían información.</p></div><span className="form-step">01 <i>/</i> 02</span></div>
        <label className="field-label">Activo o servicio<select defaultValue=""><option value="" disabled>Selecciona una opción</option><option>GOMINING · simulación</option><option>Bitcoin · simulación</option></select></label>
        <label className="field-label">Cantidad de ejemplo<input type="text" inputMode="decimal" placeholder="No conectado" /></label>
        <div className="form-callout"><span>i</span><p>La réplica no calcula cotizaciones ni envía pagos, depósitos o retiros.</p></div>
        <button className="button button-primary" onClick={() => openAction(screen.action ?? 'Continuar', actionDetail(screen.action ?? 'Continuar'))}>{screen.action ?? 'Continuar'} <span>↗</span></button>
      </section>
      <aside className="side-info-card"><span className="side-info-icon">{screen.icon}</span><h3>Proceso de simulación</h3><p>El siguiente paso muestra un diálogo local. No se conecta a proveedores ni confirma transacciones.</p><div className="info-divider" /><small>Estado de datos</small><strong>Sin conexión</strong></aside>
    </div>
  )
}

function GovernancePanel({ screen, openAction }: { screen: ScreenDefinition; openAction: (title: string, detail?: string) => void }) {
  return (
    <div className="governance-grid">
      <section className="content-panel governance-main"><div className="governance-hero"><span className="governance-emblem">◇</span><div><span className="card-kicker">GOBERNANZA</span><h2>{screen.title === 'veGOMINING' ? 'veGOMINING' : screen.title}</h2><p>Consulta la estructura de gobernanza de forma local.</p></div></div><div className="stats-row"><Stat label="Poder de voto" value="—" /><Stat label="Bloqueos activos" value="—" /><Stat label="Recompensas" value="—" /></div><div className="governance-actions"><button className="button button-primary" onClick={() => openAction(screen.action ?? 'Continuar', actionDetail(screen.action ?? 'Continuar'))}>{screen.action ?? 'Continuar'} <span>↗</span></button><span>Las operaciones de bloqueo y voto están simuladas.</span></div></section>
      <aside className="side-info-card"><span className="side-info-icon">ⓘ</span><h3>Participar en gobernanza</h3><p>La guía y las rutas de la aplicación identifican esta sección como parte de veGOMINING.</p><a href="#info" onClick={(event) => { event.preventDefault(); openAction('Información de gobernanza', 'El enlace a preguntas frecuentes se representa como salida externa.') }}>Preguntas frecuentes <span>↗</span></a></aside>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat-item"><span>{label}</span><strong>{value}</strong></div>
}

function ArticlePanel({ screen }: { screen: ScreenDefinition }) {
  return <article className="content-panel article-panel"><div className="article-banner"><span>{screen.icon}</span><div><p className="eyebrow">{screen.eyebrow}</p><h2>{screen.title}</h2></div></div><div className="article-copy"><p>Esta ruta pertenece al contenido educativo o al centro de ayuda de GoMining. La captura confirmó el enlace de navegación; el texto completo de la página no se conservó.</p><div className="article-placeholder"><span>▤</span><div><strong>Contenido pendiente de observación</strong><small>El contenido enlazado fuera de la aplicación se representa como un punto de salida.</small></div></div></div></article>
}

function GenericPanel({ screen, openAction }: { screen: ScreenDefinition; openAction: (title: string, detail?: string) => void }) {
  return <section className="content-panel generic-panel"><div className="generic-art">{screen.icon}</div><div><span className="card-kicker">{screen.group.toUpperCase()}</span><h2>{screen.title}</h2><p>La navegación confirma esta sección. El contenido detallado no quedó visible durante la inspección.</p>{screen.action && <button className="button button-primary button-small" onClick={() => openAction(screen.action!, actionDetail(screen.action!))}>{screen.action} <span>↗</span></button>}</div></section>
}

function SessionActivity({ items }: { items: string[] }) {
  return <section className="session-activity"><div><strong>Actividad simulada en esta sesión</strong><small>Se borra al recargar la página.</small></div><ul>{items.map((item, index) => <li key={`${item}-${index}`}><span>✓</span>{item}</li>)}</ul></section>
}

function DemoProductGrid({ products, addProduct }: { products: DemoProduct[]; addProduct: (product: DemoProduct) => void }) {
  return <div className="demo-product-grid">
    {products.map((product) => <article className="demo-product-card" key={product.id}>
      <div className="demo-product-art">{product.icon}</div>
      <span className="demo-price-label">PRECIO DE EJEMPLO</span>
      <span className="card-kicker">{product.category}</span>
      <h3>{product.title}</h3>
      <p>{product.description}</p>
      <div className="demo-product-footer"><strong>{formatDemoPrice(product.price)}</strong><button className="button button-primary button-small" onClick={() => addProduct(product)}>Agregar <span>＋</span></button></div>
    </article>)}
    <p className="demo-catalog-disclaimer">Todos los productos y precios de esta vista son ficticios y sirven solo para recorrer la compra simulada.</p>
  </div>
}

function MinerBuilderDialog({ balance, walletSession, onClose, onPayWithWallet, onComplete, onDefer }: {
  balance: number
  walletSession: ReturnType<typeof useWalletSession>
  onClose: () => void
  onPayWithWallet: (productName: string, amount: number, currency: PaymentCurrency) => void
  onComplete: (input: { name: string; powerTh: number; efficiency: number; price: number; currency: PaymentCurrency; purchaseMode: 'once' | 'monthly'; durationDays?: number }) => Promise<{ ok: boolean; message?: string; receipt?: DemoReceipt }>
  onDefer: (input: { name: string; powerTh: number; efficiency: number; price: number; currency: PaymentCurrency; purchaseMode: 'once' | 'monthly'; durationDays?: number }) => Promise<{ ok: boolean; message?: string; receipt?: DemoReceipt }>
}) {
  const [storefrontSections, setStorefrontSections] = useState<StorefrontSectionsConfig>(DEFAULT_STOREFRONT_SECTIONS)
  const [categoryTab, setCategoryTab] = useState<MinerCategoryTab>('packages')
  const [presetId, setPresetId] = useState<string>('presale-1')
  const [isCustomEditorOpen, setIsCustomEditorOpen] = useState(false)
  const [customPowerIndex, setCustomPowerIndex] = useState(0)
  const [maintenanceToken, setMaintenanceToken] = useState<MaintenanceToken>('PEARL')
  const [roiPeriod, setRoiPeriod] = useState<RewardPeriod>('monthly')
  const [promoCode, setPromoCode] = useState('')
  const [stage, setStage] = useState<'configure' | 'review' | 'receipt'>('configure')
  const [accepted, setAccepted] = useState(false)
  const [receipt, setReceipt] = useState<DemoReceipt | null>(null)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    const unsubscribe = subscribeToStorefrontSections((cfg) => {
      if (cfg) setStorefrontSections(cfg)
    })
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  // Auto-switch to active tab if current tab gets disabled by admin
  useEffect(() => {
    if (categoryTab === 'presale' && !storefrontSections.showPresale) {
      if (storefrontSections.showLaunch) {
        setCategoryTab('launch')
        setPresetId('launch-42')
      } else if (storefrontSections.showMonthly) {
        setCategoryTab('monthly')
        setPresetId(monthlyMinerPlans[0].id)
      } else {
        setCategoryTab('packages')
        setPresetId('')
      }
    } else if (categoryTab === 'launch' && !storefrontSections.showLaunch) {
      if (storefrontSections.showPresale) {
        setCategoryTab('presale')
        setPresetId('presale-1')
      } else if (storefrontSections.showMonthly) {
        setCategoryTab('monthly')
        setPresetId(monthlyMinerPlans[0].id)
      } else {
        setCategoryTab('packages')
        setPresetId('')
      }
    } else if (categoryTab === 'monthly' && !storefrontSections.showMonthly) {
      if (storefrontSections.showPresale) {
        setCategoryTab('presale')
        setPresetId('presale-1')
      } else if (storefrontSections.showLaunch) {
        setCategoryTab('launch')
        setPresetId('launch-42')
      } else {
        setCategoryTab('packages')
        setPresetId('')
      }
    }
  }, [storefrontSections, categoryTab])

  useEffect(() => {
    if (!storefrontSections.showCustom && (presetId === 'custom' || isCustomEditorOpen)) {
      if (presetId === 'custom') setPresetId('')
      setIsCustomEditorOpen(false)
    }
  }, [storefrontSections.showCustom, presetId, isCustomEditorOpen])

  const activePlans = useMemo(() => {
    if (categoryTab === 'packages') return oneTimeMinerPlans
    if (categoryTab === 'presale') return presaleMinerPlans
    if (categoryTab === 'monthly') return monthlyMinerPlans
    return launchMinerPlans
  }, [categoryTab])

  const visibleTabs = useMemo<MinerCategoryTab[]>(() => {
    const tabs: MinerCategoryTab[] = ['packages']
    if (storefrontSections.showPresale) tabs.push('presale')
    if (storefrontSections.showLaunch) tabs.push('launch')
    if (storefrontSections.showMonthly) tabs.push('monthly')
    return tabs
  }, [storefrontSections])

  const selected = activePlans.find((plan) => plan.id === presetId)
  const isCustom = categoryTab === 'packages' && presetId === 'custom' && storefrontSections.showCustom
  const isCustomEditor = isCustom && isCustomEditorOpen
  const customTier = customMinerPriceTiers[customPowerIndex]
  const powerTh = isCustom ? customTier.powerTh : (selected?.powerTh ?? 48)
  const total = isCustom ? customTier.priceUsd : (selected?.price ?? 561.99)
  const currency: PaymentCurrency = 'USD'
  const purchaseMode: 'once' | 'monthly' = categoryTab === 'monthly' ? 'monthly' : 'once'
  const selectedLabel = selected?.label ?? `${powerTh} TH`
  const productName = isCustom
    ? `Minero personalizado · ${powerTh} TH`
    : selectedLabel.toLowerCase().startsWith('minero')
      ? `${selectedLabel} · ${powerTh} TH`
      : `Minero ${selectedLabel} · ${powerTh} TH`
  const observedAtLabel = new Date(MINER_CATALOG_OBSERVED_AT).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

  // Calculations for dynamic ROI & maintenance card
  const periodMultiplier = roiPeriod === 'daily' ? 1 : roiPeriod === 'monthly' ? 30 : 365
  const btcPriceUsd = 90000
  const dailyBtcEstimate = powerTh * 0.0000004245
  const calculatedPeriodBtcEstimate = dailyBtcEstimate * periodMultiplier
  const economicsFixture = customMinerEconomics(powerTh, roiPeriod, maintenanceToken)
  const periodBtcEstimate = economicsFixture?.periodBtcEstimate ?? calculatedPeriodBtcEstimate
  const poolPayoutUsd = economicsFixture?.poolPayoutUsd ?? periodBtcEstimate * btcPriceUsd

  const dailyMaintenanceBase = powerTh * 0.022
  const maintenanceDiscount = maintenanceToken === 'PEARL' ? 0.20 : 0.0
  const calculatedMaintenanceUsd = dailyMaintenanceBase * periodMultiplier * (1 - maintenanceDiscount)
  const periodMaintenanceUsd = economicsFixture?.periodMaintenanceUsd ?? calculatedMaintenanceUsd
  const periodMaintenanceTokenAmount = economicsFixture?.periodMaintenanceTokenAmount ?? (maintenanceToken === 'PEARL' ? periodMaintenanceUsd / 0.05 : periodMaintenanceUsd)
  const netRewardUsd = economicsFixture?.netRewardUsd ?? Math.max(0, poolPayoutUsd - periodMaintenanceUsd)
  const displayRoi = economicsFixture?.annualRoi ?? selected?.roi ?? 57.17

  const runDemoAction = async (kind: 'buy' | 'defer') => {
    if (!accepted) return
    setFeedback('')
    const input = {
      name: productName,
      powerTh,
      efficiency: 15,
      price: total,
      currency,
      purchaseMode,
      durationDays: purchaseMode === 'monthly' ? 30 : undefined,
    }
    try {
      const result = await (kind === 'buy' ? onComplete(input) : onDefer(input))
      if (!result.ok || !result.receipt) {
        setFeedback(result.message ?? 'No se pudo completar la acción de simulación.')
        return
      }
      setReceipt(result.receipt)
      setStage('receipt')
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'No se pudo procesar la acción.')
    }
  }

  const receiptIsPending = receipt?.kind === 'miner-pending'
  const modalVariant = stage !== 'configure' ? 'workflow' : isCustomEditor ? 'custom' : 'catalog'

  return (
    <CreateMinerModal variant={modalVariant} onClose={onClose}>

        {stage === 'receipt' && receipt ? (
          <>
            <div className="purchase-success-mark">✓</div>
            <p className="eyebrow">COMPROBANTE LOCAL</p>
            <h2 id="miner-builder-title">{receiptIsPending ? 'Pedido local registrado' : 'Minero añadido a la granja'}</h2>
            <div className="receipt-lines">
              <div className="receipt-line"><span>Potencia</span><strong>{powerTh.toFixed(2)} TH</strong></div>
              <div className="receipt-line"><span>Importe equivalente</span><strong>{formatCatalogPrice(receipt.amount, 'USD')}</strong></div>
              <div className="receipt-line"><span>{receiptIsPending ? 'Estado' : 'Saldo local restante'}</span><strong>{receiptIsPending ? 'Pendiente' : formatDemoCurrency(receipt.balanceAfter)}</strong></div>
            </div>
            <p className="purchase-muted">Referencia {receipt.id} · {receipt.createdAt}</p>
            <div className="simulation-warning"><span>i</span><span>Esta acción afecta tu sesión local y activa el worker correspondiente en tu panel de minería.</span></div>
            <div className="purchase-modal-actions">
              <button className="button button-primary" onClick={onClose}>Listo <span>✓</span></button>
            </div>
          </>
        ) : stage === 'review' ? (
          <>
            <p className="eyebrow">PASO 2 DE 2 · CONFIRMAR COMPRA</p>
            <h2 id="miner-builder-title">Revisa tu minero</h2>
            <div className="builder-review-grid">
              <div><span>Potencia</span><strong>{powerTh.toFixed(2)} TH</strong></div>
              <div><span>Eficiencia</span><strong>15 W/TH</strong></div>
              <div><span>Modalidad</span><strong>{categoryTab === 'presale' ? 'Preventa (Edición limitada)' : categoryTab === 'monthly' ? 'Mensual · 30 días' : categoryTab === 'packages' ? 'Paquetes MinerX' : 'Lanzamiento · Propiedad'}</strong></div>
              <div><span>Token de mantenimiento</span><strong>{maintenanceToken} {maintenanceToken === 'PEARL' ? '(-20% dto)' : ''}</strong></div>
            </div>
            <div className="purchase-total">
              <span>Precio total</span>
              <strong>{formatCatalogPrice(total, 'USD')}</strong>
            </div>
            <div className="checkout-payment">
              <span className="checkout-payment-icon">◉</span>
              <div>
                <strong>{walletSession.connection ? `Wallet detectada · ${walletSession.connection.name}` : 'Conecta tu wallet para pagar'}</strong>
                <small>{walletSession.connection ? `${walletSession.connection.shortAddress} · lista para pagar en USD` : 'Al continuar podrás elegir una wallet compatible.'}</small>
              </div>
              <span className={walletSession.connection ? 'wallet-read-badge' : 'checkout-local-badge'}>
                {walletSession.connection ? 'LISTA' : 'CONECTAR'}
              </span>
            </div>
            <div className="simulation-warning">
              <span>i</span>
              <span>Catálogo observado el {observedAtLabel}. Todos los precios están expresados en USD. La tesorería del protocolo recibe los fondos y se genera un comprobante con hash verificable.</span>
            </div>
            <label className="simulation-consent">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>Revisaré la red, importe en USD y el destino en mi wallet antes de aprobar.</span>
            </label>
            {feedback && <small className="inline-feedback" role="status">{feedback}</small>}
            <div className="purchase-modal-actions">
              <button className="button button-quiet" onClick={() => { setAccepted(false); setStage('configure') }}>Volver</button>
              <button className="button button-primary" disabled={!accepted} onClick={() => onPayWithWallet(productName, total, 'USD')}>
                {walletSession.connection ? `Pagar con ${walletSession.connection.name}` : 'Conectar wallet y pagar'} <span>↗</span>
              </button>
            </div>
            <details className="miner-demo-payment" style={{ marginTop: '12px' }}>
              <summary>Otras opciones de simulación local</summary>
              <p>Saldo local disponible: {formatDemoCurrency(balance)}.</p>
              <div className="purchase-modal-actions">
                <button className="button button-secondary" disabled={!accepted} onClick={() => void runDemoAction('buy')}>Añadir con saldo local <span>✓</span></button>
                <button className="button button-quiet" disabled={!accepted} onClick={() => void runDemoAction('defer')}>Guardar pedido pendiente</button>
              </div>
            </details>
          </>
        ) : (
          <>
            {isCustomEditor ? (
              <MinerCreationScreen customMode onBack={() => setIsCustomEditorOpen(false)}>
                <div className="miner-custom-card-list">
                  <section className="miner-custom-card miner-custom-power-card">
                  <div className="panel-toolbar">
                    <div>
                      <h3>Ajuste personalizado</h3>
                      <p>Precio exacto por nivel · $12.99/TH base</p>
                    </div>
                    <span className="miner-option-badge">USD</span>
                  </div>
                  <PowerSlider
                    value={customPowerIndex}
                    tiers={customMinerPriceTiers}
                    valueLabel={`${customTier.powerTh.toLocaleString('es-MX')} TH · ${formatCatalogPrice(customTier.priceUsd, 'USD')}`}
                    onChange={setCustomPowerIndex}
                  />
                  <div className="miner-energy-efficiency">
                    <div className="miner-section-heading">Eficiencia energética <span className="miner-info-icon" aria-hidden="true">i</span></div>
                    <div className="miner-efficiency-chip"><span className="miner-efficiency-mark" aria-hidden="true">⚡</span><strong>15 W/TH</strong></div>
                  </div>
                  <div className="miner-power-range-control">
                    <label className="miner-power-range-label" htmlFor="custom-power-range">Potencia personalizada</label>
                    <input
                      id="custom-power-range"
                      className="miner-power-range"
                      type="range"
                      min="0"
                      max={customMinerPriceTiers.length - 1}
                      step="1"
                      value={customPowerIndex}
                      aria-label="Nivel y Potencia"
                      onChange={(event) => setCustomPowerIndex(Number(event.target.value))}
                    />
                  </div>
                  </section>

                  <section className="miner-custom-card miner-custom-rewards-card">
                  <RewardsCalculator
                    roiPeriod={roiPeriod}
                    setRoiPeriod={setRoiPeriod}
                    maintenanceToken={maintenanceToken}
                    setMaintenanceToken={setMaintenanceToken}
                    btcPriceUsd={btcPriceUsd}
                    poolPayoutUsd={poolPayoutUsd}
                    periodBtcEstimate={periodBtcEstimate}
                    periodMaintenanceUsd={periodMaintenanceUsd}
                    periodMaintenanceTokenAmount={periodMaintenanceTokenAmount}
                    netRewardUsd={netRewardUsd}
                    displayRoi={displayRoi}
                    showCurrencySelector
                  />
                  </section>

                  <div className="miner-custom-card miner-custom-traits-row" aria-label="Rasgos del minero">
                    <span className="miner-traits-thumbnail" aria-hidden="true" />
                    <span className="miner-custom-traits-copy">
                      <strong>Rasgos del minero</strong>
                      <small>{customTier.powerTh.toFixed(2)} TH · 15 W/TH</small>
                    </span>
                    <span className="miner-custom-traits-chevron" aria-hidden="true">›</span>
                  </div>

                  <section className="miner-custom-card miner-custom-payment-card">
                  <PaymentTimingOptions />
                  <div className="miner-config-summary">
                    <span>Precio total <strong>{formatCatalogPrice(total, 'USD')}</strong></span>
                    <span>Catálogo <strong>{new Date(MINER_CATALOG_OBSERVED_AT).toLocaleDateString('es-MX')}</strong></span>
                  </div>
                  <label className="builder-promo miner-promo">
                    <span>Código promocional</span>
                    <input value={promoCode} onChange={(event) => setPromoCode(event.target.value)} placeholder="Añadir código opcional" />
                  </label>
                  </section>
                </div>
                <div className="purchase-modal-actions">
                  <button className="button button-primary" onClick={() => { setAccepted(false); setStage('review') }}>
                    Continuar a la compra <span>→</span>
                  </button>
                </div>
              </MinerCreationScreen>
            ) : (
              <>
                <MinerCreationScreen>
                  <MinerTabs
                    activeTab={categoryTab}
                    visibleTabs={visibleTabs}
                    onChange={(tab) => {
                      setIsCustomEditorOpen(false)
                      setCategoryTab(tab)
                      setPresetId(tab === 'launch' ? 'launch-42' : tab === 'monthly' ? monthlyMinerPlans[0].id : 'presale-1')
                    }}
                  />

                  <MinerOptionList
                    activeTab={categoryTab}
                    plans={activePlans}
                    selectedId={presetId}
                    onSelect={setPresetId}
                    heading={categoryTab === 'presale'
                      ? '4 niveles exclusivos limitados a 30 unidades cada uno'
                      : categoryTab === 'packages'
                        ? 'Elige una potencia para tu minero MinerX'
                        : categoryTab === 'launch'
                        ? '16 niveles estándar desde 42.44 TH ($499.99 USD) hasta 5,000 TH'
                        : 'Elige una potencia para consultar el rendimiento mensual'}
                    badge={categoryTab === 'presale'
                      ? <span className="miner-option-badge miner-option-badge-warning">PREVENTA LIMITADA</span>
                      : categoryTab === 'launch'
                        ? <span className="miner-option-badge">LANZAMIENTO</span>
                        : undefined}
                    includeCustom={categoryTab === 'packages' && storefrontSections.showCustom}
                  >
                    {categoryTab === 'monthly' && (
                      <RewardsCalculator
                        roiPeriod={roiPeriod}
                        setRoiPeriod={setRoiPeriod}
                        maintenanceToken={maintenanceToken}
                        setMaintenanceToken={setMaintenanceToken}
                        btcPriceUsd={btcPriceUsd}
                        poolPayoutUsd={poolPayoutUsd}
                        periodBtcEstimate={periodBtcEstimate}
                        periodMaintenanceUsd={periodMaintenanceUsd}
                        periodMaintenanceTokenAmount={periodMaintenanceTokenAmount}
                        netRewardUsd={netRewardUsd}
                        displayRoi={displayRoi}
                      />
                    )}

                    <div className={`miner-config-summary ${categoryTab === 'monthly' ? 'miner-config-summary-monthly' : ''}`}>
                      {categoryTab === 'monthly' ? (
                        <span>Precio total <strong>{formatCatalogPrice(total, 'USD')}</strong> · Eficiencia <strong>15 W/TH</strong> · Catálogo <strong>{new Date(MINER_CATALOG_OBSERVED_AT).toLocaleDateString('es-MX')}</strong></span>
                      ) : (
                        <>
                          <span>Precio total <strong>{formatCatalogPrice(total, 'USD')}</strong></span>
                          <span>Potencia <strong>{powerTh.toFixed(2)} TH</strong></span>
                          <span>Eficiencia <strong>15 W/TH</strong></span>
                          <span>Catálogo <strong>{new Date(MINER_CATALOG_OBSERVED_AT).toLocaleDateString('es-MX')}</strong></span>
                        </>
                      )}
                    </div>
                    <label className="builder-promo miner-promo">
                      <span>Código promocional</span>
                      <input value={promoCode} onChange={(event) => setPromoCode(event.target.value)} placeholder="Añadir código opcional" />
                    </label>
                  </MinerOptionList>
                </MinerCreationScreen>
                <div className="purchase-modal-actions">
                  <button className="button button-quiet" onClick={onClose}>Cancelar</button>
                  <button
                    className="button button-primary"
                    disabled={!selected && !isCustom}
                    onClick={() => {
                      setAccepted(false)
                      if (isCustom) setIsCustomEditorOpen(true)
                      else setStage('review')
                    }}
                  >
                    Continuar a la compra <span>→</span>
                  </button>
                </div>
              </>
            )}
          </>
        )}
    </CreateMinerModal>
  )
}

function DemoTopUpDialog({ walletSession, onClose, onPayWithWallet, onConfirm }: { walletSession: ReturnType<typeof useWalletSession>; onClose: () => void; onPayWithWallet: (amount: number, networkId: PaymentNetworkId, walletId: WalletId) => void; onConfirm: (amount: number) => void }) {
  const [amount, setAmount] = useState('500')
  const [networkId, setNetworkId] = useState<PaymentNetworkId>(() => networkForConnection(walletSession.connection))
  const [walletId, setWalletId] = useState<WalletId>(() => {
    const network = networkForConnection(walletSession.connection)
    const connectedWallet = walletSession.connection?.id
    return connectedWallet && walletOptions[network].some((wallet) => wallet.id === connectedWallet) ? connectedWallet : initialWallet[network]
  })
  const value = Number(amount)
  const valid = Number.isFinite(value) && value > 0
  useEffect(() => {
    if (!walletOptions[networkId].some((wallet) => wallet.id === walletId)) setWalletId(initialWallet[networkId])
  }, [networkId, walletId])
  useEffect(() => {
    const connected = walletSession.connection
    if (!connected) return
    const connectedNetwork = networkForConnection(connected)
    setNetworkId(connectedNetwork)
    if (walletOptions[connectedNetwork].some((wallet) => wallet.id === connected.id)) setWalletId(connected.id)
  }, [walletSession.connection])
  const selectedWallet = walletOptions[networkId].find((wallet) => wallet.id === walletId)
  const compatibleWallets = walletOptions[networkId]
  const networkLabel = networks.find((network) => network.id === networkId)?.label ?? networkId
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="action-modal demo-topup-modal" role="dialog" aria-modal="true" aria-labelledby="topup-title">
        <button className="modal-close" aria-label="Cerrar" onClick={onClose}>×</button>
        <div className="modal-mark">↓</div>
        <p className="eyebrow">RECARGA</p>
        <h2 id="topup-title">Recargar saldo</h2>
        <p className="modal-description">Elige la red y wallet; el checkout usará esta selección para pagar.</p>
        {walletSession.connection && <div className="topup-connected-wallet"><strong>Wallet conectada · {walletSession.connection.name}</strong><code>{walletSession.connection.shortAddress}</code></div>}
        <div className="topup-wallet-selection">
          <label className="field-label">Red
            <select value={networkId} onChange={(event) => setNetworkId(event.target.value as PaymentNetworkId)}>
              {networks.map((network) => <option value={network.id} key={network.id}>{network.label}</option>)}
            </select>
          </label>
          <label className="field-label">Wallet para esta red
            <select value={walletId} onChange={(event) => setWalletId(event.target.value as WalletId)}>
              {compatibleWallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name}</option>)}
            </select>
          </label>
        </div>
        <p className="purchase-muted topup-wallet-availability" role="status">
          {compatibleWallets.length} {compatibleWallets.length === 1 ? 'wallet compatible' : 'wallets compatibles'} con {networkLabel}. Cambia la red para ver otras carteras.
        </p>
        <label className="field-label">Importe · USD<input type="number" min="1" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <div className="quick-topup-options">{[100, 500, 1000].map((preset) => <button className="filter-chip" type="button" onClick={() => setAmount(String(preset))} key={preset}>{formatDemoCurrency(preset)}</button>)}</div>
        <div className="simulation-warning"><span>i</span><span>La transferencia envía fondos al destino configurado, pero no acredita el saldo local hasta que exista una verificación de depósitos.</span></div>
        <div className="topup-modal-actions">
          <button className="button button-primary" disabled={!valid} onClick={() => onPayWithWallet(value, networkId, walletId)}>{walletSession.connection?.id === walletId ? `Pagar con ${walletSession.connection.name}` : `Elegir ${selectedWallet?.name ?? 'wallet'} y pagar`} <span>↗</span></button>
          <button className="button button-secondary" disabled={!valid} onClick={() => onConfirm(value)}>Añadir saldo local</button>
          <button className="button button-quiet" onClick={onClose}>Cancelar</button>
        </div>
      </section>
    </div>
  )
}

function PurchaseDialog({
  cart,
  balance,
  onClose,
  onQuantityChange,
  onTopUp,
  onClear,
  onComplete,
}: {
  cart: CartLine[]
  balance: number
  onClose: () => void
  onQuantityChange: (productId: string, quantity: number) => void
  onTopUp: (amount: number) => DemoReceipt | null
  onClear: () => void
  onComplete: (order: DemoOrder) => void
}) {
  const [stage, setStage] = useState<'cart' | 'checkout' | 'receipt'>('cart')
  const [accepted, setAccepted] = useState(false)
  const [order, setOrder] = useState<DemoOrder | null>(null)
  const [topUpAmount, setTopUpAmount] = useState('')
  const [checkoutMessage, setCheckoutMessage] = useState('')
  const lines = cart.flatMap((item) => {
    const product = getProductById(item.productId)
    return product ? [{ product, quantity: item.quantity }] : []
  })
  const total = lines.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

  const completeDemoOrder = () => {
    if (!accepted || lines.length === 0 || balance < total) return
    const completed: DemoOrder = {
      id: `LOCAL-${Date.now().toString(36).toUpperCase()}`,
      items: lines.map((item) => ({ ...item })),
      total,
      createdAt: new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }),
    }
    setOrder(completed)
    onComplete(completed)
    setStage('receipt')
  }

  return (
    <div className="modal-backdrop purchase-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-title">
        <button className="modal-close" aria-label="Cerrar carrito" onClick={onClose}>×</button>
        {stage === 'receipt' && order ? <>
          <div className="purchase-success-mark">✓</div>
          <p className="eyebrow">COMPROBANTE LOCAL</p>
          <h2 id="purchase-title">Pedido simulado</h2>
          <p className="purchase-muted">Referencia {order.id} · {order.createdAt}</p>
          <div className="receipt-lines">{order.items.map(({ product, quantity }) => <div className="receipt-line" key={product.id}><span>{quantity} × {product.title}</span><strong>{formatDemoPrice(product.price * quantity)}</strong></div>)}</div>
          <div className="purchase-total"><span>Total de ejemplo</span><strong>{formatDemoPrice(order.total)}</strong></div>
          <div className="simulation-warning"><span>i</span><span>No se procesó ningún pago, reserva, token ni operación de GoMining.</span></div>
          <div className="purchase-modal-actions"><button className="button button-primary" onClick={onClose}>Listo <span>✓</span></button></div>
        </> : stage === 'checkout' ? <>
          <p className="eyebrow">PASO 2 DE 2 · REVISIÓN</p>
          <h2 id="purchase-title">Confirma la simulación</h2>
          <p className="purchase-muted">Comprueba los artículos y el total antes de generar un comprobante local.</p>
          <div className="checkout-step-list"><span className="checkout-step-done">1 · Carrito</span><span className="checkout-step-current">2 · Revisión</span></div>
          <div className="receipt-lines">{lines.map(({ product, quantity }) => <div className="receipt-line" key={product.id}><span>{quantity} × {product.title}</span><strong>{formatDemoPrice(product.price * quantity)}</strong></div>)}</div>
          <div className="purchase-total"><span>Total de ejemplo</span><strong>{formatDemoPrice(total)}</strong></div>
          <div className="checkout-payment"><span className="checkout-payment-icon">G</span><div><strong>Pago con saldo local</strong><small>Disponible: {formatDemoCurrency(balance)} · crédito solo de esta sesión.</small></div><span className="checkout-local-badge">LOCAL</span></div>
          {balance < total && <div className="demo-topup-inline"><div><strong>Saldo insuficiente</strong><small>Faltan {formatDemoCurrency(total - balance)} para terminar la compra.</small></div><label><span>Crédito local · USD</span><input type="number" min={Math.ceil((total - balance) * 100) / 100} step="0.01" value={topUpAmount || (total - balance).toFixed(2)} onChange={(event) => setTopUpAmount(event.target.value)} /></label><button className="button button-secondary" type="button" disabled={Number(topUpAmount || total - balance) < total - balance} onClick={() => { const receipt = onTopUp(Number(topUpAmount || total - balance)); if (receipt) setCheckoutMessage("Saldo local actualizado. Continúa con la compra.") }}>Añadir saldo <span>＋</span></button></div>}
          {checkoutMessage && <small className="inline-feedback" role="status">{checkoutMessage}</small>}
          <div className="simulation-warning"><span>i</span><span>El catálogo local no se verifica en vivo con GoMining. Este pedido no crea una cotización ni activa el producto al recibir un depósito.</span></div>
          <div className="fulfillment-list"><strong>Entrega simulada</strong>{lines.map(({ product }) => <small key={product.id}>• {product.fulfillment}</small>)}</div>
          <label className="simulation-consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>La compra descuenta crédito local, actualiza el inventario de esta sesión y genera un comprobante local.</span></label>
          <div className="purchase-modal-actions"><button className="button button-quiet" onClick={() => { setAccepted(false); setStage('cart') }}>Volver al carrito</button><button className="button button-primary" disabled={!accepted || lines.length === 0 || balance < total} onClick={completeDemoOrder}>Finalizar compra simulada <span>✓</span></button></div>
        </> : <>
          <p className="eyebrow">COMPRA LOCAL</p>
          <h2 id="purchase-title"><CartGlyph /> Tu carrito <span className="cart-count-label">{lines.reduce((sum, item) => sum + item.quantity, 0)}</span></h2>
          <p className="purchase-muted">Los productos y precios son de ejemplo. El carrito vive solo en memoria durante esta sesión.</p>
          {lines.length === 0 ? <div className="purchase-empty"><div className="empty-illustration">▱</div><strong>El carrito está vacío</strong><span>Agrega un producto de muestra desde Marketplace, Mercancía, Viajes, GoBoxes o Comprar GOMINING.</span><button className="button button-secondary" onClick={onClose}>Seguir explorando</button></div> : <>
            <div className="checkout-step-list"><span className="checkout-step-current">1 · Carrito</span><span>2 · Revisión</span></div>
            <div className="cart-lines">{lines.map(({ product, quantity }) => <div className="cart-line" key={product.id}>
              <span className="cart-line-art">{product.icon}</span><div className="cart-line-copy"><strong>{product.title}</strong><small>{formatDemoPrice(product.price)} · precio de ejemplo</small></div>
              <div className="quantity-control"><button aria-label={`Quitar una unidad de ${product.title}`} onClick={() => onQuantityChange(product.id, quantity - 1)}>−</button><span>{quantity}</span><button aria-label={`Agregar una unidad de ${product.title}`} onClick={() => onQuantityChange(product.id, quantity + 1)}>＋</button></div>
              <strong className="cart-line-total">{formatDemoPrice(product.price * quantity)}</strong>
            </div>)}</div>
            <div className="purchase-total"><span>Subtotal del pedido</span><strong>{formatDemoPrice(total)}</strong></div>
            <p className="purchase-tax-note">Impuestos, envío y condiciones comerciales no se calculan. No se recopilan datos personales.</p>
            <div className="purchase-modal-actions"><button className="button button-quiet" onClick={onClear}>Vaciar carrito</button><button className="button button-primary" onClick={() => setStage('checkout')}>Revisar compra <span>→</span></button></div>
          </>}
        </>}
      </section>
    </div>
  )
}

function formatDemoPrice(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' }).format(value)
}

function UnknownRoute({ pathname }: { pathname: string }) {
  return <section className="unknown-route content-panel"><div className="page-icon">?</div><p className="eyebrow">RUTA SIN MAPEAR</p><h1>Esta pantalla aún no está documentada</h1><p>Ruta local: <code>{pathname}</code></p><Link className="button button-primary" to="/home">Volver al panel <span>↗</span></Link></section>
}

function ActionDialog({ action, onClose, onConfirm }: { action: PendingAction; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="action-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className="modal-close" aria-label="Cerrar" onClick={onClose}>×</button>
        <div className="modal-mark">◈</div>
        <p className="eyebrow">ACCIÓN SIMULADA</p>
        <h2 id="modal-title">{action.title}</h2>
        <p className="modal-description">{action.detail}</p>
        <div className="simulation-warning"><span>i</span><span>No se enviará ninguna solicitud, pago, transacción ni cambio a GoMining.</span></div>
        <div className="modal-actions"><button className="button button-quiet" onClick={onClose}>Cancelar</button><button className="button button-primary" onClick={onConfirm}>{action.productId ? 'Agregar al carrito de ejemplo' : 'Confirmar simulación'} <span>✓</span></button></div>
      </section>
    </div>
  )
}

function actionDetail(title: string): string {
  if (/retirar|retiro|depositar|recargar|comprar|pagar|tarjeta|suscribir|bloquear|liquidez|votar|venta|vender|goBox|abrir/i.test(title)) {
    return `La sección “${title}” se muestra como flujo local. No se procesan fondos ni cambios de cuenta.`
  }
  return `La sección “${title}” se muestra de forma local y permanece en memoria durante esta sesión.`
}

function findActiveLabel(pathname: string) {
  for (const group of navGroups) {
    const found = group.items.find((item) => item.path.split('?')[0] === pathname)
    if (found) return found.label
  }
  return getScreen(pathname)?.title ?? 'Inicio'
}

export default App
