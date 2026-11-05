import './buffer-polyfill'
import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppRouteSkeleton } from './Skeletons'
import { queryClient, wagmiAdapter } from './appkitConfig'
import './styles.css'

const App = lazy(() => import('./App'))

function RouteLoadingFallback() {
  const { pathname, search } = useLocation()
  return <AppRouteSkeleton pathname={pathname} search={search} />
}

type BoundaryState = { failed: boolean }

class AppErrorBoundary extends React.Component<React.PropsWithChildren, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return <div className="app-boot-error" role="alert">
      <div className="boot-error-card">
        <span className="boot-error-mark">!</span>
        <p className="eyebrow">RECUPERACIÓN</p>
        <h1>No se pudo cargar esta vista</h1>
        <p>La conexión o un recurso de la aplicación falló al iniciar. Puedes volver a intentar cargarla.</p>
        <button className="button button-primary" type="button" onClick={() => window.location.reload()}>Reintentar <span>↻</span></button>
      </div>
    </div>
    return this.props.children
  }
}

const rootElement = document.getElementById('root')
async function startApplication() {
  if (!rootElement) return
  if (import.meta.env.DEV) {
    const isLoopback = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    if (isLoopback) {
      const requestedWalletTest = new URLSearchParams(window.location.search).get('gmWalletTest')
      const requestedWallet = new URLSearchParams(window.location.search).get('gmWalletTestWallet')
      const walletTestModes = ['connect-success', 'connect-reject', 'connect-pending', 'payment-reject', 'payment-success'] as const
      if (walletTestModes.some((mode) => mode === requestedWalletTest)) {
        const { installDevWalletTestProvider } = await import('./devWalletTestProvider')
        const wallet = requestedWallet === 'trustwallet' ? 'trustwallet' : 'metamask'
        installDevWalletTestProvider(requestedWalletTest as typeof walletTestModes[number], wallet)
      }
    }
  }
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppErrorBoundary>
              <Suspense fallback={<RouteLoadingFallback />}>
                <App />
              </Suspense>
            </AppErrorBoundary>
          </BrowserRouter>
        </QueryClientProvider>
      </WagmiProvider>
    </React.StrictMode>,
  )
}

void startApplication()
