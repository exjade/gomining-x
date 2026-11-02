export const PRL_POOL_ADDRESS = 'prl1pcet98ulch2r395h7qak8nllauy7wlk25yu7fwulxu90kun5c7scsqzyehm'
export const KRYPTEX_PRL_STATS_URL = `https://pool.kryptex.com/prl/miner/stats/${PRL_POOL_ADDRESS}`
export const PEARL_PRL_EXPLORER_URL = `https://explorer.pearlresearch.ai/address/${PRL_POOL_ADDRESS}?network=mainnet`

export type PoolRevenueQuote = {
  coin: 'PRL'
  hashrate: number
  dailyUsd: number
  dailyPrl: number | null
  retrievedAt: string
}

export async function fetchPrlDailyRevenue(powerTh: number, signal?: AbortSignal): Promise<PoolRevenueQuote> {
  if (!Number.isFinite(powerTh) || powerTh <= 0 || powerTh > 5_000) {
    throw new Error('Ingresa una potencia entre 0 y 5,000 TH/s.')
  }
  const hashrate = Math.round(powerTh * 1e12)
  const response = await fetch(`/api/pool/prl-daily-revenue?hashrate=${hashrate}`, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `La lectura pública del pool respondió ${response.status}.`)
  }
  const result = await response.json() as Partial<PoolRevenueQuote>
  if (result.coin !== 'PRL' || result.hashrate !== hashrate || !Number.isFinite(result.dailyUsd) || !result.retrievedAt) {
    throw new Error('La respuesta del pool no coincide con la lectura solicitada.')
  }
  return result as PoolRevenueQuote
}

export function formatUsd(value: number, fractionDigits = 2) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value)
}
