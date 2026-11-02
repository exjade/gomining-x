import type { CSSProperties, ReactNode } from 'react'
import { getScreen, type ScreenDefinition } from './catalog'

type Shape = 'line' | 'circle' | 'rounded' | 'pill'

/** Small, composable shimmer primitive. It is always decorative; its parent owns the loading announcement. */
export function Skeleton({
  shape = 'line',
  width,
  height,
  className = '',
}: {
  shape?: Shape
  width?: number | string
  height?: number | string
  className?: string
}) {
  const style: CSSProperties = {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  }
  return <span aria-hidden="true" className={`ui-skeleton ui-skeleton-${shape} ${className}`} style={style} />
}

export function SkeletonText({ lines = 2, className = '' }: { lines?: number; className?: string }) {
  return <span className={`ui-skeleton-text ${className}`} aria-hidden="true">
    {Array.from({ length: lines }, (_, index) => <Skeleton key={index} shape="line" className={`ui-skeleton-text-line ui-skeleton-text-line-${index + 1}`} />)}
  </span>
}

export function SkeletonButton({ className = '' }: { className?: string }) {
  return <Skeleton shape="rounded" className={`ui-skeleton-button ${className}`} />
}

export function WalletIdentitySkeleton({ compact = false }: { compact?: boolean }) {
  if (compact) return <span className="ui-skeleton-wallet-identity-compact" role="status" aria-label="Detectando la wallet autorizada"><Skeleton shape="circle" /><Skeleton shape="line" /></span>
  return <div className="wallet-connected-box ui-skeleton-wallet-identity" role="status" aria-label="Comprobando la wallet autorizada" aria-busy="true">
    <div className="wallet-connected-heading"><Skeleton shape="pill" className="ui-skeleton-wallet-state" /><Skeleton shape="line" className="ui-skeleton-wallet-name" /><SkeletonButton className="ui-skeleton-wallet-action" /></div>
    <div className="wallet-connected-details"><Skeleton shape="line" className="ui-skeleton-wallet-network" /><Skeleton shape="line" className="ui-skeleton-wallet-address" /><SkeletonButton className="ui-skeleton-wallet-copy" /></div>
  </div>
}

export function SkeletonMetric({ compact = false }: { compact?: boolean }) {
  return <div className={`ui-skeleton-metric ${compact ? 'ui-skeleton-metric-compact' : ''}`} aria-hidden="true">
    <Skeleton shape="line" className="ui-skeleton-metric-label" />
    <Skeleton shape="line" className="ui-skeleton-metric-value" />
    <Skeleton shape="line" className="ui-skeleton-metric-detail" />
  </div>
}

export function SkeletonTable({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
  return <div className="ui-skeleton-table" style={{ '--skeleton-columns': columns } as CSSProperties} aria-hidden="true">
    <div className="ui-skeleton-table-row ui-skeleton-table-head">{Array.from({ length: columns }, (_, index) => <Skeleton key={index} shape="line" />)}</div>
    {Array.from({ length: rows }, (_, row) => <div className="ui-skeleton-table-row" key={row}>{Array.from({ length: columns }, (_, col) => <Skeleton key={col} shape="line" className={`ui-skeleton-cell ui-skeleton-cell-${col + 1}`} />)}</div>)}
  </div>
}

function PageHeadingSkeleton({ withAction = true }: { withAction?: boolean }) {
  return <div className="page-heading-row ui-skeleton-page-heading" aria-hidden="true">
    <div className="page-title-group"><Skeleton shape="rounded" className="ui-skeleton-page-icon" /><div className="ui-skeleton-heading-copy"><Skeleton shape="line" className="ui-skeleton-eyebrow" /><Skeleton shape="line" className="ui-skeleton-title" /><SkeletonText lines={1} /></div></div>
    {withAction && <SkeletonButton />}
  </div>
}

function SkeletonSectionTitle({ width = '42%' }: { width?: number | string }) {
  return <div className="ui-skeleton-section-title"><Skeleton shape="line" width={width} /><Skeleton shape="line" width="24%" /></div>
}

function HomeSkeleton() {
  return <div className="ui-skeleton-home">
    <section className="account-hero ui-skeleton-account-hero" aria-hidden="true">
      <div className="account-hero-heading"><div><Skeleton shape="line" className="ui-skeleton-eyebrow" /><Skeleton shape="line" className="ui-skeleton-balance" /></div><Skeleton shape="pill" className="ui-skeleton-status" /></div>
      <div className="quick-actions">{Array.from({ length: 4 }, (_, index) => <SkeletonButton key={index} className="ui-skeleton-action" />)}</div>
    </section>
    <div className="market-strip ui-skeleton-market" aria-hidden="true"><div><Skeleton shape="circle" /><SkeletonText lines={2} /></div><div className="ui-skeleton-market-separator" /><div><Skeleton shape="circle" /><SkeletonText lines={2} /></div><Skeleton shape="line" className="ui-skeleton-market-status" /></div>
    <section className="ui-skeleton-quest content-panel" aria-hidden="true"><SkeletonSectionTitle width="35%" /><Skeleton shape="line" className="ui-skeleton-quest-progress" /><div className="ui-skeleton-quest-grid">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} shape="rounded" className="ui-skeleton-quest-item" />)}</div></section>
    <div className="dashboard-grid ui-skeleton-card-grid" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} shape="rounded" className="ui-skeleton-dashboard-card" />)}</div>
    <section className="ui-skeleton-explore"><SkeletonSectionTitle width="31%" /><div className="ui-skeleton-explore-grid">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} shape="rounded" className="ui-skeleton-explore-card" />)}</div></section>
    <section className="content-panel ui-skeleton-pool-preview" aria-hidden="true"><SkeletonSectionTitle width="38%" /><div className="ui-skeleton-metric-grid">{Array.from({ length: 3 }, (_, index) => <SkeletonMetric key={index} compact />)}</div></section>
  </div>
}

function DataRouteSkeleton({ pathname }: { pathname: string }) {
  const isHistory = pathname.endsWith('/operations')
  return <div className="ui-skeleton-route">
    <PageHeadingSkeleton withAction={false} />
    <div className="route-tabs ui-skeleton-tabs" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} shape="pill" />)}</div>
    <section className="content-panel ui-skeleton-panel" aria-hidden="true"><SkeletonSectionTitle width="40%" /><div className="ui-skeleton-metric-grid">{Array.from({ length: 4 }, (_, index) => <SkeletonMetric key={index} compact />)}</div><Skeleton shape="rounded" className="ui-skeleton-chart" /></section>
    {(isHistory || pathname.endsWith('/operations')) && <section className="content-panel ui-skeleton-panel"><SkeletonSectionTitle width="46%" /><SkeletonTable columns={5} rows={7} /></section>}
    {pathname.endsWith('/miners') && <section className="content-panel ui-skeleton-panel"><SkeletonSectionTitle width="34%" /><SkeletonTable columns={4} rows={4} /></section>}
  </div>
}

function WalletRouteSkeleton() {
  return <div className="wallet-page-stack ui-skeleton-wallet-route" aria-hidden="true">
    <section className="content-panel wallet-checkout-panel"><div className="wallet-checkout-heading"><Skeleton shape="rounded" className="ui-skeleton-page-icon" /><div className="ui-skeleton-wallet-heading"><Skeleton shape="line" className="ui-skeleton-eyebrow" /><Skeleton shape="line" className="ui-skeleton-title" /><SkeletonText lines={1} /></div><Skeleton shape="pill" className="ui-skeleton-status" /></div><div className="wallet-checkout-steps">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} shape="rounded" />)}</div></section>
    <section className="content-panel wallet-connect-panel"><div className="panel-toolbar"><div><Skeleton shape="line" className="ui-skeleton-eyebrow" /><Skeleton shape="line" className="ui-skeleton-title" /><SkeletonText lines={1} /></div></div><div className="wallet-options-grid">{Array.from({ length: 4 }, (_, index) => <div className="wallet-option" key={index}><Skeleton shape="circle" /><div className="ui-skeleton-wallet-option-copy"><Skeleton shape="line" /><SkeletonText lines={2} /></div><SkeletonButton /></div>)}</div></section>
  </div>
}

function TableRouteSkeleton({ screen }: { screen: ScreenDefinition }) {
  const columns = screen.columns?.length ?? 4
  return <div className="ui-skeleton-route"><PageHeadingSkeleton /><section className="content-panel ui-skeleton-panel"><SkeletonSectionTitle width="44%" /><SkeletonTable columns={columns} rows={7} /></section></div>
}

function CatalogRouteSkeleton() {
  return <div className="ui-skeleton-route"><PageHeadingSkeleton /><div className="ui-skeleton-filter-row">{Array.from({ length: 3 }, (_, index) => <SkeletonButton key={index} />)}</div><div className="ui-skeleton-product-grid">{Array.from({ length: 6 }, (_, index) => <article className="content-panel ui-skeleton-product" key={index}><Skeleton shape="rounded" className="ui-skeleton-product-art" /><Skeleton shape="line" className="ui-skeleton-product-title" /><SkeletonText lines={2} /><div><SkeletonButton /><Skeleton shape="line" className="ui-skeleton-product-price" /></div></article>)}</div></div>
}

function SubscriptionRouteSkeleton() {
  return <div className="ui-skeleton-route"><PageHeadingSkeleton withAction={false} /><section className="content-panel ui-skeleton-panel ui-skeleton-benefit"><div className="ui-skeleton-benefit-icon"><Skeleton shape="rounded" /></div><div><Skeleton shape="line" className="ui-skeleton-eyebrow" /><Skeleton shape="line" className="ui-skeleton-title" /><SkeletonText lines={1} /></div><Skeleton shape="pill" className="ui-skeleton-status" /></section><SkeletonSectionTitle width="30%" /><div className="ui-skeleton-subscription-grid">{Array.from({ length: 2 }, (_, index) => <article className="content-panel ui-skeleton-subscription-card" key={index}><Skeleton shape="line" className="ui-skeleton-eyebrow" /><Skeleton shape="line" className="ui-skeleton-title" /><Skeleton shape="line" className="ui-skeleton-subscription-price" /><SkeletonText lines={3} /><div className="ui-skeleton-subscription-button"><SkeletonButton /><SkeletonButton /></div></article>)}</div><SkeletonText lines={2} className="ui-skeleton-footnote" /></div>
}

function FormRouteSkeleton() {
  return <div className="ui-skeleton-route"><PageHeadingSkeleton /><section className="content-panel ui-skeleton-panel"><SkeletonSectionTitle width="38%" /><div className="ui-skeleton-form-grid">{Array.from({ length: 4 }, (_, index) => <div className="ui-skeleton-field" key={index}><Skeleton shape="line" /><Skeleton shape="rounded" /></div>)}</div><SkeletonButton className="ui-skeleton-form-submit" /></section></div>
}

function GovernanceRouteSkeleton() {
  return <div className="ui-skeleton-route"><PageHeadingSkeleton /><div className="ui-skeleton-filter-row">{Array.from({ length: 3 }, (_, index) => <SkeletonButton key={index} />)}</div><section className="content-panel ui-skeleton-panel"><SkeletonSectionTitle width="42%" /><div className="ui-skeleton-governance-summary"><Skeleton shape="circle" /><SkeletonText lines={2} /><SkeletonButton /></div></section><div className="ui-skeleton-governance-list">{Array.from({ length: 3 }, (_, index) => <section className="content-panel ui-skeleton-panel" key={index}><SkeletonSectionTitle width="55%" /><SkeletonText lines={2} /><div className="ui-skeleton-governance-footer"><Skeleton shape="line" /><SkeletonButton /></div></section>)}</div></div>
}

function ArticleRouteSkeleton() {
  return <div className="ui-skeleton-route"><PageHeadingSkeleton withAction={false} /><article className="content-panel ui-skeleton-article"><Skeleton shape="rounded" className="ui-skeleton-article-cover" /><SkeletonSectionTitle width="52%" /><SkeletonText lines={4} /><Skeleton shape="line" className="ui-skeleton-article-subhead" /><SkeletonText lines={5} /><div className="ui-skeleton-article-callout"><Skeleton shape="line" /><SkeletonText lines={2} /></div><SkeletonText lines={4} /></article></div>
}

function OperatorRouteSkeleton() {
  return <div className="ui-skeleton-route"><PageHeadingSkeleton /><section className="content-panel ui-skeleton-panel"><SkeletonSectionTitle width="50%" /><div className="ui-skeleton-form-grid">{Array.from({ length: 6 }, (_, index) => <div key={index}><Skeleton shape="line" /><Skeleton shape="rounded" /></div>)}</div></section><section className="content-panel ui-skeleton-panel"><SkeletonSectionTitle width="36%" /><div className="ui-skeleton-metric-grid">{Array.from({ length: 4 }, (_, index) => <SkeletonMetric key={index} />)}</div></section></div>
}

function GenericRouteSkeleton({ screen, pathname }: { screen?: ScreenDefinition; pathname: string }) {
  if (screen?.mode === 'dashboard') return <HomeSkeleton />
  if (screen?.mode === 'table') return <TableRouteSkeleton screen={screen} />
  if (pathname === '/subscriptions') return <SubscriptionRouteSkeleton />
  if (pathname === '/nft-referral') return <ReferralRouteSkeleton />
  if (screen?.mode === 'form') return <FormRouteSkeleton />
  if (screen?.mode === 'governance') return <GovernanceRouteSkeleton />
  if (screen?.mode === 'article') return <ArticleRouteSkeleton />
  if (screen?.mode === 'catalog' || screen?.mode === 'collection') return <CatalogRouteSkeleton />
  if (screen?.mode === 'operator') return <OperatorRouteSkeleton />
  return <div className="ui-skeleton-route"><PageHeadingSkeleton /><section className="content-panel ui-skeleton-panel"><SkeletonSectionTitle /><SkeletonText lines={3} /><div className="ui-skeleton-generic-grid">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} shape="rounded" />)}</div></section><section className="content-panel ui-skeleton-panel"><SkeletonSectionTitle width="34%" /><SkeletonTable columns={4} rows={3} /></section></div>
}

function ReferralRouteSkeleton() {
  return <div className="ui-skeleton-route"><PageHeadingSkeleton withAction={false} /><section className="content-panel ui-skeleton-panel"><SkeletonSectionTitle width="38%" /><div className="ui-skeleton-referral-link"><Skeleton shape="line" /><SkeletonButton /></div></section><div className="ui-skeleton-metric-grid">{Array.from({ length: 3 }, (_, index) => <SkeletonMetric key={index} compact />)}</div><section className="content-panel ui-skeleton-panel"><SkeletonSectionTitle width="42%" /><SkeletonTable columns={4} rows={4} /></section></div>
}

function MinerBuilderSkeleton() {
  return <div className="ui-skeleton-modal-backdrop"><section className="purchase-modal miner-builder-modal ui-skeleton-miner-modal" aria-hidden="true"><Skeleton shape="line" className="ui-skeleton-eyebrow" /><Skeleton shape="line" className="ui-skeleton-title" /><div className="ui-skeleton-mode-tabs"><Skeleton shape="pill" /><Skeleton shape="pill" /></div><div className="ui-skeleton-plan-grid">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} shape="rounded" />)}</div><section className="builder-custom-panel"><SkeletonSectionTitle width="40%" /><Skeleton shape="line" className="ui-skeleton-slider" /><div className="ui-skeleton-form-grid"><Skeleton shape="rounded" /><Skeleton shape="rounded" /></div></section><div className="ui-skeleton-form-grid">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} shape="rounded" />)}</div><SkeletonButton className="ui-skeleton-full-button" /></section></div>
}

function AppFrameSkeleton({ children }: { children: ReactNode }) {
  return <div className="app-shell ui-skeleton-app" role="status" aria-live="polite" aria-label="Cargando la vista">
    <header className="topbar"><div className="header-navigation"><div className="brand"><span className="brand-mark">G</span><span className="brand-word">gomining</span></div><div className="ui-skeleton-nav"><Skeleton shape="line" /><Skeleton shape="line" /><Skeleton shape="line" /></div></div><div className="topbar-actions"><Skeleton shape="pill" className="ui-skeleton-header-chip" /><Skeleton shape="rounded" className="ui-skeleton-header-icon" /><Skeleton shape="pill" className="ui-skeleton-header-wallet" /><Skeleton shape="circle" className="ui-skeleton-header-avatar" /></div></header>
    <div className="workspace"><main className="page-wrap"><div className="replica-note ui-skeleton-notice"><Skeleton shape="circle" /><Skeleton shape="line" /><Skeleton shape="line" /></div><div className="route-transition">{children}</div><footer className="page-footer"><span>GoMining · preparando tu panel</span></footer></main></div>
  </div>
}

/** Selects a composition from the real route, so a reload keeps the page's layout instead of showing a generic block. */
export function AppRouteSkeleton({ pathname, search = '' }: { pathname: string; search?: string }) {
  const screen = getScreen(pathname)
  const showMinerBuilder = pathname === '/home' && new URLSearchParams(search).get('modal') === 'paywall-create'
  let content: ReactNode
  if (showMinerBuilder) content = <><HomeSkeleton /><MinerBuilderSkeleton /></>
  else if (pathname.startsWith('/data-centers')) content = <DataRouteSkeleton pathname={pathname} />
  else if (pathname === '/gmt-wallets' || pathname === '/finance/wallets/virtual') content = <><PageHeadingSkeleton withAction={false} /><WalletRouteSkeleton /></>
  else content = <GenericRouteSkeleton screen={screen} pathname={pathname} />
  return <AppFrameSkeleton>
    <span className="ui-skeleton-sr-only">Preparando componentes y datos de esta sección.</span>{content}
  </AppFrameSkeleton>
}

export function MetricValueSkeleton() {
  return <Skeleton shape="line" className="ui-skeleton-inline-value" />
}

export function QuoteDetailsSkeleton() {
  return <div className="ui-skeleton-quote-details" role="status" aria-label="Cargando cotización">
    <div className="ui-skeleton-quote-total"><Skeleton shape="line" /><Skeleton shape="line" /></div>
    <div className="ui-skeleton-quote-main"><Skeleton shape="line" /><Skeleton shape="line" /></div>
    {Array.from({ length: 6 }, (_, index) => <div className="ui-skeleton-quote-row" key={index}><Skeleton shape="line" /><Skeleton shape="line" /></div>)}
  </div>
}

export function PoolTableSkeleton() {
  return <div className="ui-skeleton-pool-table" role="status" aria-label="Cargando historial de pagos"><Skeleton shape="line" className="ui-skeleton-pool-caption" /><SkeletonTable columns={5} rows={7} /></div>
}
