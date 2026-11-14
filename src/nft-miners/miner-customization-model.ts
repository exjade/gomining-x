import type { StoredMiner } from '../firebase.ts'
import type { MinerAppearance } from './appearance'

export type MinerCustomizationMiner = {
  id: string
  name: string
  powerTh: number
  efficiency: number
  appearance?: MinerAppearance
  traits?: { purchased?: readonly string[] }
}

export function customizationMinerFromStored(stored: StoredMiner): MinerCustomizationMiner {
  return {
    id: stored.id,
    name: stored.name,
    powerTh: stored.powerTh,
    efficiency: stored.efficiencyWattsPerTh || stored.efficiency,
    appearance: stored.appearance,
  }
}
