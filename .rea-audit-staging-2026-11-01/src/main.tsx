import './buffer-polyfill'
import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { AppRouteSkeleton } from './Skeletons'
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
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <AppErrorBoundary>
          <Suspense fallback={<RouteLoadingFallback />}>
            <App />
          </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
    </React.StrictMode>,
  )
}
