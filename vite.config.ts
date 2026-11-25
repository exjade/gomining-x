import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

const PRL_POOL_ADDRESS = 'prl1pcet98ulch2r395h7qak8nllauy7wlk25yu7fwulxu90kun5c7scsqzyehm'
const PRL_PAYOUT_PAGE_SIZE = 15

function normalizePoolPayouts(payload: unknown) {
  if (!payload || typeof payload !== 'object') throw new Error('Kryptex devolvió una respuesta de pagos inválida.')
  const response = payload as { count?: unknown; results?: unknown }
  const count = Number(response.count)
  if (!Number.isSafeInteger(count) || count < 0 || count > 100_000 || !Array.isArray(response.results)) {
    throw new Error('La respuesta de pagos de Kryptex no coincide con el formato esperado.')
  }

  const results = response.results.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Kryptex devolvió un registro de pago inválido.')
    const payout = item as Record<string, unknown>
    const txid = String(payout.txid ?? '')
    const rawDate = String(payout.date ?? '')
    const status = String(payout.status ?? '')
    const amount = String(payout.amount ?? '')
    const fee = String(payout.fee ?? '')
    const parsedDate = /^\d{10,13}$/.test(rawDate) ? Number(rawDate) * (rawDate.length <= 10 ? 1_000 : 1) : Date.parse(rawDate)
    if (payout.address !== PRL_POOL_ADDRESS || !/^[\da-f]{64}$/i.test(txid) || !Number.isFinite(parsedDate) || parsedDate < 0
      || !/^[A-Z_]{1,32}$/.test(status) || !/^\d+(?:\.\d+)?$/.test(amount) || !/^\d+(?:\.\d+)?$/.test(fee)) {
      throw new Error('Un pago de Kryptex no pasó la validación de dirección, fecha, estado o importe.')
    }
    return { date: new Date(parsedDate).toISOString(), status, amount, fee, txid }
  })
  return { count, results }
}

function readOnlyPoolApi(): Plugin {
  const handle = async (request: IncomingMessage, response: ServerResponse, next: (error?: Error) => void) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    if (!requestUrl.pathname.startsWith('/api/pool/')) return next()
    if (request.method !== 'GET') {
      response.statusCode = 405
      response.setHeader('Allow', 'GET')
      response.end(JSON.stringify({ error: 'Solo se admiten consultas GET.' }))
      return
    }

    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')

    try {
      if (requestUrl.pathname === '/api/pool/prl-daily-revenue') {
        const rawHashrate = requestUrl.searchParams.get('hashrate') ?? ''
        if (!/^\d+$/.test(rawHashrate)) {
          response.statusCode = 400
          response.end(JSON.stringify({ error: 'El hashrate debe expresarse en H/s.' }))
          return
        }
        const hashrate = Number(rawHashrate)
        if (!Number.isSafeInteger(hashrate) || hashrate <= 0 || hashrate > 5_000_000_000_000_000) {
          response.statusCode = 400
          response.end(JSON.stringify({ error: 'El hashrate está fuera del rango admitido.' }))
          return
        }
        const upstream = await fetch(`https://pool.kryptex.com/api/v2/daily-revenue/PRL?hashrate=${hashrate}`, { headers: { Accept: 'application/json' } })
        if (!upstream.ok) throw new Error(`Kryptex respondió HTTP ${upstream.status}.`)
        const payload: unknown = await upstream.json()
        const first = Array.isArray(payload) ? payload[0] : payload
        const usd = first && typeof first === 'object' ? Number((first as { usd?: unknown }).usd) : Number.NaN
        const coins = first && typeof first === 'object' ? Number((first as { coins?: unknown }).coins) : Number.NaN
        if (!Number.isFinite(usd) || usd < 0) throw new Error('Kryptex devolvió una cotización PRL inválida.')
        response.end(JSON.stringify({ coin: 'PRL', hashrate, dailyUsd: usd, dailyPrl: Number.isFinite(coins) ? coins : null, retrievedAt: new Date().toISOString() }))
        return
      }

      if (requestUrl.pathname === '/api/pool/payouts') {
        const rawPage = requestUrl.searchParams.get('page') ?? '1'
        if (!/^\d+$/.test(rawPage)) {
          response.statusCode = 400
          response.end(JSON.stringify({ error: 'La página debe ser un entero positivo.' }))
          return
        }
        const page = Number(rawPage)
        if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) {
          response.statusCode = 400
          response.end(JSON.stringify({ error: 'La página está fuera del rango admitido.' }))
          return
        }
        const upstream = await fetch(`https://pool.kryptex.com/prl/api/v1/miner/payouts/${PRL_POOL_ADDRESS}?page=${page}`, { headers: { Accept: 'application/json' } })
        if (!upstream.ok) throw new Error(`Kryptex respondió HTTP ${upstream.status} al consultar pagos.`)
        const normalized = normalizePoolPayouts(await upstream.json())
        response.end(JSON.stringify({
          address: PRL_POOL_ADDRESS,
          page,
          pageSize: PRL_PAYOUT_PAGE_SIZE,
          count: normalized.count,
          pageCount: Math.ceil(normalized.count / PRL_PAYOUT_PAGE_SIZE),
          results: normalized.results,
          retrievedAt: new Date().toISOString(),
        }))
        return
      }

      response.statusCode = 404
      response.end(JSON.stringify({ error: 'Lectura de pool no permitida.' }))
    } catch (error) {
      response.statusCode = 502
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'No se pudo leer la fuente pública del pool.' }))
    }
  }

  return {
    name: 'read-only-pool-api',
    configureServer(server) { server.middlewares.use(handle) },
    configurePreviewServer(server) { server.middlewares.use(handle) },
  }
}

const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET?.trim() ||
  `http://127.0.0.1:${process.env.PORT?.trim() || 3001}`

export default defineConfig({
  plugins: [react(), readOnlyPoolApi()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api/catalog': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/api/purchases': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/api/withdrawals': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
    allowedHosts: [
      'sprinkler-wooing-graceful.ngrok-free.dev',
      '.ngrok-free.dev',
      '.ngrok-free.app',
      '.ngrok.io',
      'luis-reach-award-publicity.trycloudflare.com',
      '.trycloudflare.com',
      'localhost',
      '127.0.0.1',
    ],
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    proxy: {
      '/api/catalog': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/api/purchases': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/api/withdrawals': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
    allowedHosts: [
      'sprinkler-wooing-graceful.ngrok-free.dev',
      '.ngrok-free.dev',
      '.ngrok-free.app',
      '.ngrok.io',
      'luis-reach-award-publicity.trycloudflare.com',
      '.trycloudflare.com',
      'localhost',
      '127.0.0.1',
    ],
  },
})
