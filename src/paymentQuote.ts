import { PAYMENT_DESTINATIONS, USDT_CONTRACTS, type PaymentNetworkId } from './paymentDestinations'

export type PaymentAsset = 'BNB' | 'ETH' | 'POL' | 'SOL' | 'USDT' | 'BTC' | 'TRX' | 'AVAX'
export type PaymentCurrency = 'USD'

export type PaymentQuote = {
  networkId: PaymentNetworkId
  networkName: string
  asset: PaymentAsset
  recipient: string
  catalogValue: number
  catalogCurrency: PaymentCurrency
  catalogUsd: number
  fxDate: string | null
  assetUsd: number
  amount: string
  decimals: number
  estimatedBridgeFeeUsd: number
  bridgeFeeRate: number
  expectedNetUsd: number
  quoteSource: string
  updatedAt: number
  expiresAt: number
}

const SPOT_SYMBOLS: Partial<Record<PaymentAsset, string>> = {
  BNB: 'BNBUSDT',
  ETH: 'ETHUSDT',
  POL: 'POLUSDT',
  SOL: 'SOLUSDT',
  BTC: 'BTCUSDT',
  TRX: 'TRXUSDT',
  AVAX: 'AVAXUSDT',
}

export const DEFAULT_ASSET_BY_NETWORK: Record<PaymentNetworkId, PaymentAsset> = {
  bnb: 'BNB',
  tron: 'TRX',
  polygon: 'POL',
  solana: 'SOL',
  arbitrum: 'ETH',
  optimism: 'ETH',
  avalanche: 'AVAX',
  ethereum: 'ETH',
}

export const ASSET_DECIMALS: Record<PaymentNetworkId, Record<string, number>> = {
  bnb: { BNB: 18, USDT: 18 },
  tron: { TRX: 6, USDT: 6 },
  polygon: { POL: 18, USDT: 6 },
  solana: { SOL: 9, USDT: 6 },
  arbitrum: { ETH: 18, USDT: 6 },
  optimism: { ETH: 18, USDT: 6 },
  avalanche: { AVAX: 18, USDT: 6 },
  ethereum: { ETH: 18, USDT: 6 },
}

// 1.5% trasladado al usuario para cubrir comisiones de gas y slippage del swap posterior a USDT en BSC
export const SWAP_FEE_RATE = 0.015
const QUOTE_TTL_MS = 30_000

export async function convertCatalogPriceToUsd(value: number, _currency?: PaymentCurrency): Promise<number> {
  if (!Number.isFinite(value) || value <= 0) throw new Error('El precio del producto debe ser mayor que cero.')
  return value
}

export async function fetchPaymentQuote(
  catalogValue: number,
  _catalogCurrency: PaymentCurrency = 'USD',
  networkId: PaymentNetworkId,
  selectedAsset?: PaymentAsset,
): Promise<PaymentQuote> {
  if (!Number.isFinite(catalogValue) || catalogValue <= 0) throw new Error('El precio del producto debe ser mayor que cero.')
  const destination = PAYMENT_DESTINATIONS.find((item) => item.id === networkId)
  if (!destination) throw new Error('No hay un destino configurado para esta red.')

  const asset: PaymentAsset = selectedAsset ?? DEFAULT_ASSET_BY_NETWORK[networkId] ?? 'USDT'
  const decimals = ASSET_DECIMALS[networkId]?.[asset] ?? (asset === 'USDT' ? USDT_CONTRACTS[networkId]?.decimals ?? 6 : 18)

  const catalogUsd = catalogValue
  const fxDate: string | null = null

  let assetUsd = 1
  let quoteSource = 'Paridad nominal USDT/USD (1:1)'

  if (asset !== 'USDT') {
    const symbol = SPOT_SYMBOLS[asset]
    if (!symbol) throw new Error(`No existe una fuente de cotización para ${asset}.`)

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
    quoteSource = `Binance Spot · ${symbol}`
  }

  const updatedAt = Date.now()
  // Recargo de 1.5% trasladado al usuario para cubrir comisiones de swap posterior a USDT en BSC
  const grossUsd = catalogUsd * (1 + SWAP_FEE_RATE)
  const amount = roundUp(grossUsd / assetUsd, decimals)
  const estimatedBridgeFeeUsd = catalogUsd * SWAP_FEE_RATE
  const expectedNetUsd = catalogUsd

  return {
    networkId,
    networkName: destination.name,
    asset,
    recipient: destination.address,
    catalogValue,
    catalogCurrency: 'USD',
    catalogUsd,
    fxDate,
    assetUsd,
    amount,
    decimals,
    estimatedBridgeFeeUsd,
    bridgeFeeRate: SWAP_FEE_RATE,
    expectedNetUsd,
    quoteSource: `${quoteSource} · Incluye 1.5% comisiones de red/swap`,
    updatedAt,
    expiresAt: updatedAt + QUOTE_TTL_MS,
  }
}

export function formatUsd(value: number) {
  return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} USD`
}

export function formatCatalogPrice(value: number, _currency?: PaymentCurrency) {
  return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} USD`
}

export function formatAssetAmount(value: string, asset: PaymentAsset) {
  const decimals = asset === 'SOL' ? 4 : asset === 'USDT' ? 2 : 6
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(Number(value))} ${asset}`
}

function roundUp(value: number, decimals: number) {
  const factor = 10 ** decimals
  const rounded = Math.ceil(value * factor - 1e-8) / factor
  if (!Number.isFinite(rounded) || rounded <= 0) throw new Error('El importe calculado no es válido.')
  return rounded.toFixed(decimals).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1')
}
