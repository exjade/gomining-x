import { PAYMENT_DESTINATIONS, type PaymentNetworkId } from './paymentDestinations'

export type PaymentAsset = 'BNB' | 'BTC' | 'ETH' | 'TRX' | 'USDT' | 'POL'
export type PaymentCurrency = 'USD' | 'MXN'

export type PaymentQuote = {
  networkId: PaymentNetworkId
  networkName: string
  asset: PaymentAsset
  recipient: string
  catalogValue: number
  catalogCurrency: PaymentCurrency
  catalogUsd: number
  usdMxnRate: number | null
  fxDate: string | null
  assetUsd: number
  amount: string
  estimatedBridgeFeeUsd: number
  bridgeFeeRate: number
  expectedNetUsd: number
  quoteSource: string
  updatedAt: number
  expiresAt: number
}

const SPOT_SYMBOLS: Partial<Record<PaymentNetworkId, string>> = {
  bnb: 'BNBUSDT',
  bitcoin: 'BTCUSDT',
  ethereum: 'ETHUSDT',
  tron: 'TRXUSDT',
  polygon: 'POLUSDT',
}

const ASSETS: Record<PaymentNetworkId, { asset: PaymentAsset; decimals: number }> = {
  bnb: { asset: 'BNB', decimals: 8 },
  bitcoin: { asset: 'BTC', decimals: 8 },
  ethereum: { asset: 'ETH', decimals: 8 },
  tron: { asset: 'TRX', decimals: 6 },
  solana: { asset: 'USDT', decimals: 6 },
  polygon: { asset: 'POL', decimals: 8 },
}

const BRIDGE_FEE_RATE = 0.01
const QUOTE_TTL_MS = 30_000

export async function convertCatalogPriceToUsd(value: number, currency: PaymentCurrency): Promise<number> {
  if (!Number.isFinite(value) || value <= 0) throw new Error('El precio del producto debe ser mayor que cero.')
  if (currency === 'USD') return value
  const fx = await fetchUsdMxnRate()
  return value / fx.rate
}

export async function fetchPaymentQuote(catalogValue: number, catalogCurrency: PaymentCurrency, networkId: PaymentNetworkId): Promise<PaymentQuote> {
  if (!Number.isFinite(catalogValue) || catalogValue <= 0) throw new Error('El precio del producto debe ser mayor que cero.')
  const destination = PAYMENT_DESTINATIONS.find((item) => item.id === networkId)
  if (!destination) throw new Error('No hay un destino configurado para esta red.')

  const { asset, decimals } = ASSETS[networkId]
  let catalogUsd = catalogValue
  let usdMxnRate: number | null = null
  let fxDate: string | null = null
  let fxSource = ''
  if (catalogCurrency === 'MXN') {
    const fx = await fetchUsdMxnRate()
    usdMxnRate = fx.rate
    fxDate = fx.date
    catalogUsd = catalogValue / fx.rate
    fxSource = ` · USD/MXN Frankfurter · ${fx.date}`
  }

  let assetUsd = 1
  let quoteSource = 'Paridad nominal USDT/USD; no garantiza que el mercado mantenga 1:1.'
  let bridgeFeeRate = 0

  if (networkId !== 'solana') {
    const symbol = SPOT_SYMBOLS[networkId]
    if (!symbol) throw new Error('No existe una fuente de cotización para este activo.')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8_000)
    let response: Response
    try {
      response = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) throw new Error('La fuente de precios no respondió; no se puede cotizar este pago.')
      throw error
    } finally {
      window.clearTimeout(timeout)
    }
    if (!response.ok) throw new Error(`La fuente de precios respondió ${response.status}; no se puede cotizar este pago.`)
    const ticker = await response.json() as { symbol?: string; price?: string }
    const parsed = Number(ticker.price)
    if (ticker.symbol !== symbol || !Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`No hay una cotización válida para ${asset}. El pago quedó deshabilitado.`)
    }
    assetUsd = parsed
    quoteSource = `Binance Spot · ${symbol}${fxSource}`
    bridgeFeeRate = BRIDGE_FEE_RATE
  }

  if (networkId === 'solana' && fxSource) quoteSource = `USDT nominal USD${fxSource}`

  const updatedAt = Date.now()
  const grossUsd = catalogUsd / (1 - bridgeFeeRate)
  const amount = roundUp(grossUsd / assetUsd, decimals)
  const numericAmount = Number(amount)
  const estimatedBridgeFeeUsd = numericAmount * assetUsd * bridgeFeeRate
  const expectedNetUsd = numericAmount * assetUsd - estimatedBridgeFeeUsd

  return {
    networkId,
    networkName: destination.name,
    asset,
    recipient: destination.address,
    catalogValue,
    catalogCurrency,
    catalogUsd,
    usdMxnRate,
    fxDate,
    assetUsd,
    amount,
    estimatedBridgeFeeUsd,
    bridgeFeeRate,
    expectedNetUsd,
    quoteSource,
    updatedAt,
    expiresAt: updatedAt + QUOTE_TTL_MS,
  }
}

async function fetchUsdMxnRate(): Promise<{ rate: number; date: string }> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8_000)
  let response: Response
  try {
    response = await fetch('https://api.frankfurter.dev/v2/rate/usd/mxn', { cache: 'no-store', signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new Error('No se pudo consultar el tipo de cambio MXN/USD; no se puede cotizar este pago.')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
  if (!response.ok) throw new Error(`La fuente de tipo de cambio respondió ${response.status}; no se puede cotizar este pago.`)
  const fx = await response.json() as { base?: string; quote?: string; rate?: number; date?: string }
  if (fx.base?.toUpperCase() !== 'USD' || fx.quote?.toUpperCase() !== 'MXN' || !Number.isFinite(fx.rate) || !fx.rate || !fx.date) {
    throw new Error('La fuente de tipo de cambio no devolvió una cotización MXN válida.')
  }
  const rateDate = new Date(`${fx.date}T23:59:59Z`).getTime()
  if (!Number.isFinite(rateDate) || Date.now() - rateDate > 7 * 24 * 60 * 60 * 1000) {
    throw new Error('El tipo de cambio MXN está vencido; el pago quedó deshabilitado hasta recibir una tasa reciente.')
  }
  return { rate: fx.rate, date: fx.date }
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

export function formatCatalogPrice(value: number, currency: PaymentCurrency) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

export function formatAssetAmount(value: string, asset: PaymentAsset) {
  const decimals = asset === 'TRX' || asset === 'USDT' ? 6 : 8
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(Number(value))} ${asset}`
}

function roundUp(value: number, decimals: number) {
  const factor = 10 ** decimals
  const rounded = Math.ceil(value * factor - 1e-8) / factor
  if (!Number.isFinite(rounded) || rounded <= 0) throw new Error('El importe calculado no es válido.')
  return rounded.toFixed(decimals).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1')
}
