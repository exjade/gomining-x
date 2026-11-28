import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import '../withdrawals/withdrawalShared.css'
import './clientPaymentHistory.css'
import { cancelPaymentIntent } from '../../services/payments/paymentGatewayClient'
import {
  buildClientOrderExplorerUrl,
  canCancelClientOrder,
  subscribeToClientOrders,
  type ClientOrderStatus,
  type ClientPaymentOrder,
} from './clientPaymentHistoryService'

type FilterKey = 'all' | 'active' | 'settled' | 'closed'
type StatusBadgeTone = 'neutral' | 'warning' | 'info' | 'accent' | 'success' | 'danger'

const ACTIVE_STATUS_SET = new Set<ClientOrderStatus>(['OPEN', 'AWAITING', 'PROCESSING', 'UNDERPAID'])
const CLOSED_STATUS_SET = new Set<ClientOrderStatus>(['FAILED', 'EXPIRED', 'CANCELLED', 'REVERSED'])

const FILTER_TABS: ReadonlyArray<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'En proceso' },
  { key: 'settled', label: 'Pagados' },
  { key: 'closed', label: 'Cerrados' },
]

const STATUS_META: Record<ClientOrderStatus, { label: string; tone: StatusBadgeTone }> = {
  OPEN: { label: 'Abierta', tone: 'neutral' },
  AWAITING: { label: 'Esperando pago', tone: 'warning' },
  PROCESSING: { label: 'Confirmando en bloque', tone: 'info' },
  SETTLED: { label: 'Paid — Minero Activo', tone: 'success' },
  UNDERPAID: { label: 'Pago incompleto', tone: 'warning' },
  FAILED: { label: 'Fallido', tone: 'danger' },
  EXPIRED: { label: 'Expirada', tone: 'neutral' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
  REVERSED: { label: 'Revertida', tone: 'danger' },
}

function formatOrderDate(iso: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

export function ClientPaymentHistory({ uid }: { uid: string }) {
  const [orders, setOrders] = useState<ClientPaymentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const unsubscribe = subscribeToClientOrders(
      uid,
      (nextOrders) => {
        setOrders(nextOrders)
        setLoading(false)
      },
      (err) => {
        setError(err instanceof Error ? err.message : 'No se pudo cargar tu historial de pagos.')
        setLoading(false)
      },
    )
    return () => {
      unsubscribe()
    }
  }, [uid])

  const filteredOrders = useMemo(() => {
    if (filter === 'all') return orders
    if (filter === 'active') return orders.filter((o) => ACTIVE_STATUS_SET.has(o.status))
    if (filter === 'settled') return orders.filter((o) => o.status === 'SETTLED')
    return orders.filter((o) => CLOSED_STATUS_SET.has(o.status))
  }, [orders, filter])

  const handleCancelOrder = async (order: ClientPaymentOrder) => {
    if (!canCancelClientOrder(order)) return
    setCancellingId(order.orderId)
    setFeedback(null)
    try {
      await cancelPaymentIntent(order.intentId, 'USER_CANCELLED')
      setFeedback(`Orden ${order.orderId} cancelada correctamente.`)
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? `No se pudo cancelar la orden: ${err.message}`
          : 'No se pudo cancelar la orden en este momento.',
      )
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <section
      className="wth-history-panel cph-history-panel"
      aria-label="Historial de Pagos"
      data-testid="client-payment-history"
    >
      <header className="wth-history-panel-header">
        <div className="wth-history-panel-heading">
          <span className="wth-history-kicker wth-tabular-mono">
            MIS ÓRDENES ON-CHAIN · TIEMPO REAL
          </span>
          <h3 className="wth-history-panel-title">Historial de Compras</h3>
          <p className="wth-history-panel-subtitle">
            Seguimiento en vivo de tus compras de mineros en preventa sincronizado con tu cuenta.
          </p>
        </div>

        <div className="cph-filter-group" role="group" aria-label="Filtrar órdenes">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={
                filter === tab.key
                  ? 'cph-filter-btn cph-filter-btn--active'
                  : 'cph-filter-btn'
              }
              aria-pressed={filter === tab.key}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="wth-history-shell">
        {feedback && (
          <div className="cph-feedback-banner" role="status">
            <span>{feedback}</span>
          </div>
        )}
        {error && (
          <div className="wth-history-error-box" role="alert">
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div aria-busy="true" data-testid="payment-history-loading">
            <div className="wth-skeleton-row" />
            <div className="wth-skeleton-row" />
            <div className="wth-skeleton-row" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="wth-empty-state" data-testid="payment-history-empty">
            <span className="wth-empty-icon" aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8" />
                <path d="M8 17h5" />
              </svg>
            </span>
            <h4 className="wth-empty-title">Sin órdenes registradas</h4>
            <p className="wth-empty-desc">
              {filter === 'all'
                ? 'Cuando inicies una compra de minero en preventa, aparecerá aquí en tiempo real con su estado y hash verificable.'
                : 'No hay órdenes que coincidan con el filtro seleccionado.'}
            </p>
          </div>
        ) : (
          <div className="wth-cards-list" data-testid="payment-history-cards">
            {filteredOrders.map((order) => {
              const meta = STATUS_META[order.status] ?? STATUS_META.OPEN
              const explorerUrl = buildClientOrderExplorerUrl(order)
              const cancellable = canCancelClientOrder(order)
              const isCancelling = cancellingId === order.orderId
              const progressPct = Math.min(
                100,
                Math.round((order.confirmations / Math.max(1, order.requiredConfirmations)) * 100),
              )

              return (
                <article
                  key={order.orderId}
                  className="wth-history-card cph-order-card"
                  data-testid={`payment-order-card-${order.orderId}`}
                >
                  <div className="wth-card-top">
                    <div className="wth-cell-stack">
                      <div className="cph-order-id-row">
                        <span className="wth-tabular-mono">{formatOrderDate(order.createdAt)}</span>
                        <span aria-hidden="true">·</span>
                        <code className="wth-tabular-mono wth-mono-capsule">{order.orderId}</code>
                        <span
                          className={
                            order.networkMode === 'mainnet'
                              ? 'wth-mini-tag wth-mini-tag--emerald wth-tabular-mono'
                              : 'wth-mini-tag cph-tag-testnet wth-tabular-mono'
                          }
                        >
                          {order.networkMode === 'mainnet' ? 'MAINNET' : 'TESTNET'}
                        </span>
                      </div>

                      <div className="cph-order-title-row">
                        <strong className="cph-order-package-name">{order.packageName}</strong>
                        <span className="wth-network-tag wth-tabular-mono">
                          {order.productType === 'subscription'
                            ? 'Suscripción'
                            : `${order.powerTh} TH/s`}
                        </span>
                      </div>
                    </div>

                    <span className={`wth-status-badge wth-status-badge--${meta.tone}`}>
                      <span className="wth-status-dot" aria-hidden="true" />
                      <span>{meta.label}</span>
                    </span>
                  </div>

                  <div className="wth-card-meta-row">
                    <span className="wth-cell-secondary">Importe</span>
                    <strong className="wth-tabular-mono wth-card-amount">
                      ${order.amountUsd.toFixed(2)} USD
                      {order.cryptoAmount ? (
                        <span className="wth-card-network"> ({order.cryptoAmount})</span>
                      ) : null}
                    </strong>
                  </div>

                  {order.status === 'PROCESSING' && (
                    <div className="cph-confirmations-block">
                      <div className="cph-confirmations-head">
                        <span>Confirmaciones de bloque</span>
                        <strong className="wth-tabular-mono">
                          {order.confirmations} / {order.requiredConfirmations}
                        </strong>
                      </div>
                      <div className="cph-confirmations-track">
                        <div
                          className="cph-confirmations-fill"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="wth-card-meta-row">
                    <span className="wth-cell-secondary">Red / Transacción</span>
                    <div className="wth-chip-inline">
                      {order.paymentNetwork && (
                        <span className="wth-network-tag wth-tabular-mono">
                          {order.paymentNetwork.toUpperCase()}
                        </span>
                      )}
                      {order.txHash ? (
                        explorerUrl ? (
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="wth-explorer-link wth-tabular-mono"
                          >
                            Ver tx ({order.txHash.slice(0, 8)}…{order.txHash.slice(-6)}) ↗
                          </a>
                        ) : (
                          <code className="wth-tabular-mono wth-mono-capsule">
                            {order.txHash.slice(0, 10)}…
                          </code>
                        )
                      ) : (
                        <span className="wth-tx-pending wth-tabular-mono">
                          <span className="wth-tx-pending-dot" aria-hidden="true" />
                          Sin hash enviado
                        </span>
                      )}
                    </div>
                  </div>

                  {(order.activatedMinerId || cancellable) && (
                    <div className="wth-card-actions">
                      {order.activatedMinerId && (
                        <Link
                          className="wth-btn-detail"
                          to={`/nft-miners/${encodeURIComponent(order.activatedMinerId)}`}
                        >
                          Ver minero ({order.activatedMinerId}) ↗
                        </Link>
                      )}

                      {cancellable && (
                        <button
                          type="button"
                          className="wth-btn-secondary cph-btn-cancel"
                          disabled={isCancelling}
                          onClick={() => void handleCancelOrder(order)}
                        >
                          {isCancelling ? 'Cancelando…' : 'Cancelar orden'}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
