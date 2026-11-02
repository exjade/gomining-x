import { PRL_POOL_ADDRESS } from './poolRevenue'

export type PoolPayout = {
  date: string
  status: string
  amount: string
  fee: string
  txid: string
}

export type PoolPayoutPage = {
  address: string
  page: number
  pageSize: number
  count: number
  pageCount: number
  results: PoolPayout[]
  retrievedAt: string
}

export async function fetchPoolPayouts(page: number, signal?: AbortSignal): Promise<PoolPayoutPage> {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new Error('La página debe ser un entero positivo.')
  const response = await fetch(`/api/pool/payouts?page=${page}`, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `El historial público respondió ${response.status}.`)
  }

  const payload = await response.json() as Partial<PoolPayoutPage>
  if (payload.address !== PRL_POOL_ADDRESS || payload.page !== page || !Number.isSafeInteger(payload.count) || !Number.isSafeInteger(payload.pageCount)
    || !Number.isSafeInteger(payload.pageSize) || !Array.isArray(payload.results) || !payload.retrievedAt) {
    throw new Error('La respuesta del historial no coincide con el formato esperado.')
  }
  const results = payload.results.map((item) => {
    if (!item || !/^[\da-f]{64}$/i.test(item.txid) || !Number.isFinite(Date.parse(item.date))
      || !/^[A-Z_]{1,32}$/.test(item.status) || !/^\d+(?:\.\d+)?$/.test(item.amount) || !/^\d+(?:\.\d+)?$/.test(item.fee)) {
      throw new Error('Un registro del historial no pasó la validación de datos.')
    }
    return item
  })
  return { ...payload, results } as PoolPayoutPage
}

export function getPoolPayoutStatus(status: string) {
  if (status === 'FINISHED') return 'Confirmado en pool'
  if (status === 'PENDING') return 'Pendiente en pool'
  if (status === 'FAILED') return 'Fallido en pool'
  return status.toLocaleLowerCase('es-MX').replaceAll('_', ' ')
}
