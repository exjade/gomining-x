const API_ROOT = 'https://mempool.space/api/v1'
const SATOSHIS_PER_BTC = 100_000_000
const EXPECTED_BLOCKS_PER_DAY = 144
const CACHE_TTL_MS = 60_000

export type BitcoinMiningNetworkQuote = {
  currentHashrateHps: number
  averageRewardBtcPerBlock: number
  sampledBlockCount: number
  btcUsd: number
  priceTimestamp: number
  retrievedAt: string
}

type HashrateResponse = { currentHashrate?: unknown }
type RewardResponse = { startBlock?: unknown; endBlock?: unknown; totalReward?: unknown }
type PriceResponse = { time?: unknown; USD?: unknown }

let cachedQuote: BitcoinMiningNetworkQuote | null = null
let cachedAt = 0

async function readJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error(`La fuente pública de Bitcoin respondió ${response.status}.`)
  return response.json() as Promise<T>
}

/** Reads network hashrate, the last 144 block rewards, and BTC/USD from public mempool.space endpoints. */
export async function fetchBitcoinMiningNetworkQuote(signal?: AbortSignal, forceRefresh = false): Promise<BitcoinMiningNetworkQuote> {
  if (!forceRefresh && cachedQuote && Date.now() - cachedAt < CACHE_TTL_MS) return cachedQuote

  const [hashrate, rewards, prices] = await Promise.all([
    readJson<HashrateResponse>('/mining/hashrate/3d', signal),
    readJson<RewardResponse>('/mining/reward-stats/144', signal),
    readJson<PriceResponse>('/prices', signal),
  ])

  const currentHashrateHps = Number(hashrate.currentHashrate)
  const startBlock = Number(rewards.startBlock)
  const endBlock = Number(rewards.endBlock)
  const totalRewardSatoshis = Number(rewards.totalReward)
  const sampledBlockCount = endBlock - startBlock + 1
  const btcUsd = Number(prices.USD)
  const priceTimestamp = Number(prices.time)

  if (!Number.isFinite(currentHashrateHps) || currentHashrateHps <= 0
    || !Number.isInteger(sampledBlockCount) || sampledBlockCount < 1
    || !Number.isFinite(totalRewardSatoshis) || totalRewardSatoshis <= 0
    || !Number.isFinite(btcUsd) || btcUsd <= 0
    || !Number.isFinite(priceTimestamp) || priceTimestamp <= 0) {
    throw new Error('La fuente pública devolvió datos incompletos para estimar la minería.')
  }

  const quote: BitcoinMiningNetworkQuote = {
    currentHashrateHps,
    averageRewardBtcPerBlock: totalRewardSatoshis / SATOSHIS_PER_BTC / sampledBlockCount,
    sampledBlockCount,
    btcUsd,
    priceTimestamp,
    retrievedAt: new Date().toISOString(),
  }
  cachedQuote = quote
  cachedAt = Date.now()
  return quote
}

export const bitcoinMiningEstimateConstants = {
  expectedBlocksPerDay: EXPECTED_BLOCKS_PER_DAY,
  satoshisPerBtc: SATOSHIS_PER_BTC,
}
