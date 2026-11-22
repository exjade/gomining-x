import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cancelPaymentIntent } from '../../services/payments/paymentGatewayClient'
import {
  buildClientOrderExplorerUrl,
  canCancelClientOrder,
  subscribeToClientOrders,
  type ClientOrderStatus,
  type ClientPaymentOrder,
} from './clientPaymentHistoryService'

type FilterKey = 'all' | 'active' | 'settled' | 'closed'

const ACTIVE_STATUS_SET = new Set<ClientOrderStatus>(['OPEN', 'AWAITING', 'PROCESSING', 'UNDERPAID'])
const CLOSED_STATUS_SET = new Set<ClientOrderStatus>(['FAILED', 'EXPIRED', 'CANCELLED', 'REVERSED'])

const FILTER_TABS: ReadonlyArray<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'En proceso' },
  { key: 'settled', label: 'Pagados' },
  { key: 'closed', label: 'Cerrados' },
]

const STATUS_META: Record<ClientOrderStatus, { label: string; tone: string }> = {
  OPEN: { label: 'Abierta', tone: '#94a3b8' },
  AWAITING: { label: 'Esperando pago', tone: '#f59e0b' },
  PROCESSING: { label: 'Confirmando en bloque', tone: '#38bdf8' },
  SETTLED: { label: 'Paid — Minero Activo', tone: '#22c55e' },
  UNDERPAID: { label: 'Pago incompleto', tone: '#f97316' },
  FAILED: { label: 'Fallido', tone: '#ef4444' },
  EXPIRED: { label: 'Expirada', tone: '#94a3b8' },
  CANCELLED: { label: 'Cancelada', tone: '#94a3b8' },
  REVERSED: { label: 'Revertida', tone: '#ef4444' },
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
      className="content-panel"
      style={{ marginTop: 24 }}
      aria-label="Historial de Pagos"
    >
      <div className="panel-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p className="card-kicker">MIS ÓRDENES ON-CHAIN · TIEMPO REAL</p>
          <h3 style={{ margin: '2px 0 4px' }}>Historial de Pagos</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
            Seguimiento en vivo de tus compras de mineros y suscripciones sincronizado con tu cuenta.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={filter === tab.key ? 'button button-primary button-small' : 'button button-secondary button-small'}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <p className="inline-feedback" role="status" style={{ marginTop: 12 }}>
          {feedback}
        </p>
      )}
      {error && (
        <p className="inline-feedback" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {loading ? (
        <div className="empty-state" style={{ marginTop: 14 }}>
          <strong>Sincronizando historial de pagos…</strong>
          <span>Conectando con tus órdenes en tiempo real.</span>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 14 }}>
          <strong>Sin órdenes registradas</strong>
          <span>
            {filter === 'all'
              ? 'Cuando inicies una compra de minero o suscripción, aparecerá aquí en tiempo real.'
              : 'No hay órdenes que coincidan con el filtro seleccionado.'}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
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
                style={{
                  border: '1px solid rgba(148,163,184,0.2)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  background: 'rgba(15,23,42,0.45)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong>{order.packageName}</strong>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        {order.productType === 'subscription'
                          ? 'Suscripción'
                          : `${order.powerTh} TH/s`}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 6,
                          border: `1px solid ${order.networkMode === 'mainnet' ? '#22c55e' : '#f59e0b'}`,
                          color: order.networkMode === 'mainnet' ? '#22c55e' : '#f59e0b',
                        }}
                      >
                        {order.networkMode === 'mainnet' ? 'MAINNET' : 'TESTNET'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      Orden <code>{order.orderId}</code> · {formatOrderDate(order.createdAt)}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: 999,
                        border: `1px solid ${meta.tone}`,
                        color: meta.tone,
                      }}
                    >
                      {meta.label}
                    </span>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                      ${order.amountUsd.toFixed(2)} USD
                      {order.cryptoAmount ? (
                        <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>
                          ({order.cryptoAmount})
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {order.status === 'PROCESSING' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#38bdf8', marginBottom: 4 }}>
                      <span>Confirmaciones de bloque</span>
                      <strong>
                        {order.confirmations} / {order.requiredConfirmations}
                      </strong>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: 6,
                        borderRadius: 999,
                        background: 'rgba(148,163,184,0.2)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${progressPct}%`,
                          height: '100%',
                          background: '#38bdf8',
                          transition: 'width 200ms ease',
                        }}
                      />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {order.paymentNetwork && (
                      <span style={{ color: '#cbd5e1' }}>
                        Red: <strong>{order.paymentNetwork.toUpperCase()}</strong>
                      </span>
                    )}
                    {order.txHash && (
                      explorerUrl ? (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#a78bfa' }}
                        >
                          Ver tx ({order.txHash.slice(0, 8)}…{order.txHash.slice(-6)}) ↗
                        </a>
                      ) : (
                        <code style={{ color: '#94a3b8' }}>
                          {order.txHash.slice(0, 10)}…
                        </code>
                      )
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {order.activatedMinerId && (
                      <Link
                        className="button button-secondary button-small"
                        to={`/nft-miners/${encodeURIComponent(order.activatedMinerId)}`}
                      >
                        Ver minero ({order.activatedMinerId}) ↗
                      </Link>
                    )}

                    {cancellable && (
                      <button
                        type="button"
                        className="button button-quiet button-small"
                        disabled={isCancelling}
                        onClick={() => void handleCancelOrder(order)}
                      >
                        {isCancelling ? 'Cancelando…' : 'Cancelar orden'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
