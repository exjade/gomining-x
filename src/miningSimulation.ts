import { getFirebaseClient } from './firestoreDemoSync'

export type MiningLogEntry = {
  id: string
  minerId: string
  minerName: string
  timestamp: string
  hashRateTh: number
  sharesAccepted: number
  satoshisMined: number
  btcReward: number
  pool: string
  status: 'share_accepted' | 'block_verified' | 'payout_credited'
}

export type MiningStats = {
  totalTh: number
  totalSats: number
  totalBtc: number
  sharesCount: number
  lastUpdated: string
}

const STORAGE_KEY = 'gomining_synthetic_mining_logs'
const STATS_KEY = 'gomining_mining_stats'

let activeSimulationInterval: number | null = null
const logListeners = new Set<(logs: MiningLogEntry[]) => void>()

export function getSavedMiningLogs(): MiningLogEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function getSavedMiningStats(): MiningStats {
  if (typeof window === 'undefined') {
    return { totalTh: 0, totalSats: 0, totalBtc: 0, sharesCount: 0, lastUpdated: new Date().toISOString() }
  }
  try {
    const raw = localStorage.getItem(STATS_KEY)
    return raw
      ? JSON.parse(raw)
      : { totalTh: 0, totalSats: 0, totalBtc: 0, sharesCount: 0, lastUpdated: new Date().toISOString() }
  } catch {
    return { totalTh: 0, totalSats: 0, totalBtc: 0, sharesCount: 0, lastUpdated: new Date().toISOString() }
  }
}

export function subscribeToMiningLogs(callback: (logs: MiningLogEntry[]) => void) {
  logListeners.add(callback)
  callback(getSavedMiningLogs())
  return () => {
    logListeners.delete(callback)
  }
}

function notifyListeners(logs: MiningLogEntry[]) {
  for (const listener of logListeners) {
    listener(logs)
  }
}

export async function recordMiningLogEntry(entry: MiningLogEntry) {
  const existing = getSavedMiningLogs()
  const updated = [entry, ...existing].slice(0, 50)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // Ignore storage errors
  }

  // Update cumulative stats
  const currentStats = getSavedMiningStats()
  const newStats: MiningStats = {
    totalTh: entry.hashRateTh,
    totalSats: currentStats.totalSats + entry.satoshisMined,
    totalBtc: currentStats.totalBtc + entry.btcReward,
    sharesCount: currentStats.sharesCount + entry.sharesAccepted,
    lastUpdated: entry.timestamp,
  }
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(newStats))
  } catch {
    // Ignore
  }

  notifyListeners(updated)

  // Sync to Firestore if configured
  try {
    const client = await getFirebaseClient()
    const logsRef = client.collection(client.db, 'mining_activity_logs')
    await client.addDoc(logsRef, {
      ...entry,
      createdAt: new Date().toISOString(),
    })
  } catch {
    // Offline or unconfigured fallback: non-blocking
  }
}

export function startMiningSimulation(minerId: string, minerName: string, powerTh: number) {
  if (typeof window === 'undefined') return
  if (activeSimulationInterval) {
    window.clearInterval(activeSimulationInterval)
  }

  // Generate initial log immediately
  const generateTick = () => {
    // Synthetic fluctuation of +- 3% around powerTh
    const variation = (Math.random() - 0.5) * 0.06 * powerTh
    const currentHashRate = Math.max(0.01, +(powerTh + variation).toFixed(4))
    const shares = Math.floor(Math.random() * 3) + 1
    // Approximate BTC satoshis generated per tick for this hashrate
    const sats = Math.max(1, Math.round(currentHashRate * 2.8 * shares))
    const btc = +(sats * 1e-8).toFixed(8)

    const entry: MiningLogEntry = {
      id: `mine-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      minerId,
      minerName,
      timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      hashRateTh: currentHashRate,
      sharesAccepted: shares,
      satoshisMined: sats,
      btcReward: btc,
      pool: 'GoMining AntPool/Foundry Node #4',
      status: Math.random() > 0.85 ? 'block_verified' : 'share_accepted',
    }

    void recordMiningLogEntry(entry)
  }

  // Emit first event after 2 seconds, then every 12 seconds
  window.setTimeout(generateTick, 2000)
  activeSimulationInterval = window.setInterval(generateTick, 12000)
}

export function stopMiningSimulation() {
  if (activeSimulationInterval) {
    window.clearInterval(activeSimulationInterval)
    activeSimulationInterval = null
  }
}
