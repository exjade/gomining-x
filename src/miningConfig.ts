import { useSyncExternalStore } from 'react'
import { REFERRAL_LEVEL_WEIGHTS } from './miningEconomics'

export type MiningConfig = {
  maxDepth: number
  unilevelPercentOfClientPayout: number
  directReferralPercentOfClientPayout: number
  levelWeights: number[]
}

const STORAGE_KEY = 'gomining-replica-mining-config-v3'
const defaults: MiningConfig = {
  maxDepth: 10,
  unilevelPercentOfClientPayout: 20,
  directReferralPercentOfClientPayout: 10,
  levelWeights: [...REFERRAL_LEVEL_WEIGHTS],
}

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min
}

function loadConfig(): MiningConfig {
  if (typeof window === 'undefined') return defaults
  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY)
    if (!saved) return defaults
    const parsed = JSON.parse(saved) as Partial<MiningConfig>
    const weights = Array.isArray(parsed.levelWeights) ? parsed.levelWeights.slice(0, 10).map(Number) : [...defaults.levelWeights]
    while (weights.length < 10) weights.push(defaults.levelWeights[weights.length])
    const unilevelPercentOfClientPayout = clamp(Number(parsed.unilevelPercentOfClientPayout ?? defaults.unilevelPercentOfClientPayout), 0, 100)
    const directReferralPercentOfClientPayout = clamp(Number(parsed.directReferralPercentOfClientPayout ?? defaults.directReferralPercentOfClientPayout), 0, unilevelPercentOfClientPayout)
    return {
      maxDepth: Math.round(clamp(Number(parsed.maxDepth ?? defaults.maxDepth), 1, 10)),
      unilevelPercentOfClientPayout,
      directReferralPercentOfClientPayout,
      levelWeights: weights.map((weight, index) => Number.isFinite(weight) && weight >= 0 ? weight : defaults.levelWeights[index]),
    }
  } catch {
    return defaults
  }
}

let config = loadConfig()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }
const getSnapshot = () => config

function notify() {
  for (const listener of listeners) listener()
}

export function updateMiningConfig(update: Partial<MiningConfig>) {
  const next = { ...config, ...update }
  next.maxDepth = Math.round(clamp(next.maxDepth, 1, 10))
  next.unilevelPercentOfClientPayout = clamp(next.unilevelPercentOfClientPayout, 0, 100)
  next.directReferralPercentOfClientPayout = clamp(next.directReferralPercentOfClientPayout, 0, next.unilevelPercentOfClientPayout)
  next.levelWeights = next.levelWeights.slice(0, 10).map((weight, index) => Number.isFinite(weight) && weight >= 0 ? weight : defaults.levelWeights[index])
  while (next.levelWeights.length < 10) next.levelWeights.push(defaults.levelWeights[next.levelWeights.length])
  config = next
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config)) } catch { /* Session-only configuration remains in memory. */ }
  notify()
}

export function resetMiningConfig() {
  config = { ...defaults, levelWeights: [...defaults.levelWeights] }
  try { window.sessionStorage.removeItem(STORAGE_KEY) } catch { /* The defaults remain available in memory. */ }
  notify()
}

export function useMiningConfig() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
