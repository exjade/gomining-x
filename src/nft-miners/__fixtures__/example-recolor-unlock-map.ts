import type { PieceAccessRule } from '../piece-access'

/** EXAMPLE-NOT-DECISIONS: development-only rules for exercising supported color recolors. */
export function createExampleRecolorUnlockMap(entries: readonly { trait_id: string; category: string }[]) {
  const recolorableParts = new Set(['wall', 'body', 'bottom', 'screen'])
  return new Map<string, PieceAccessRule>(entries
    .filter((entry) => recolorableParts.has(entry.category))
    .map((entry) => [entry.trait_id, { operator: 'all', requirements: [{ kind: 'always' as const }] }]))
}
