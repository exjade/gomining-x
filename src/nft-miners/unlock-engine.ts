import traitUnlockMapCsv from '../../docs/trait-unlock-map.csv?raw'
import { MINER_APPEARANCE_CATALOG_ENTRIES } from './catalog-data'
import { parseDevProgressOverride } from './dev-progress'
import type { PieceAccessRule, ProgressProvider, ProgressSnapshot } from './piece-access'
import { loadTraitUnlockMap, validateTraitUnlockMapCoverage } from './unlock-csv'
export { evaluatePieceAccess, validateAppearanceSelectionDraft } from './piece-access'
export type {
  EvaluatePieceAccessInput,
  PieceAccessMiner,
  PieceAccessPiece,
  PieceAccessReason,
  PieceAccessResult,
  PieceAccessRule,
  PieceAccessState,
  ProgressProvider,
  ProgressSnapshot,
  UnlockRequirement,
} from './piece-access'
export { loadTraitUnlockMap, validateTraitUnlockMapCoverage } from './unlock-csv'
export { parseDevProgressOverride } from './dev-progress'
export type { LoadedTraitUnlockMap, TraitCatalogEntry, TraitUnlockMapRow } from './unlock-csv'

const EMPTY_PROGRESS: ProgressSnapshot = {
  level: 0,
  completedTaskIds: new Set<string>(),
}

export const NullProgressProvider: ProgressProvider = {
  getSnapshot: () => EMPTY_PROGRESS,
}

export const MinerProgressProvider: ProgressProvider = {
  getSnapshot: () => null,
}

/** Backend seam for miner_progress; no document shape or user path is assumed yet. */
export const AccountProgressProvider = MinerProgressProvider

export const TRAIT_UNLOCK_MAP = loadTraitUnlockMap(traitUnlockMapCsv, MINER_APPEARANCE_CATALOG_ENTRIES)

export function validateTraitUnlockMapForPieces(pieces: readonly { trait_id: string; category: string; value: string | null }[]) {
  validateTraitUnlockMapCoverage(TRAIT_UNLOCK_MAP.rows, pieces)
}

export function getPieceUnlockRule(traitId: string) {
  return TRAIT_UNLOCK_MAP.rules.get(traitId)
}

export async function getDevUnlockRules(search: string): Promise<ReadonlyMap<string, PieceAccessRule> | undefined> {
  if (import.meta.env.DEV) {
    if (!parseDevProgressOverride(search, true)) return undefined
    const { default: exampleUnlockMapCsv } = await import('./__fixtures__/example-trait-unlock-map.csv?raw')
    return loadTraitUnlockMap(exampleUnlockMapCsv, MINER_APPEARANCE_CATALOG_ENTRIES).rules
  }
  return undefined
}

export function getActiveProgressProvider(search: string): ProgressProvider {
  if (import.meta.env.DEV) {
    const override = parseDevProgressOverride(search, true)
    if (override) return { getSnapshot: () => override }
  }
  return NullProgressProvider
}
