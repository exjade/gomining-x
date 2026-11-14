export type UnlockRequirement =
  (| { kind: 'purchase_roll'; traitId?: string }
  | { kind: 'always' }
  | { kind: 'progression_level'; minLevel: number }
  | {
      kind: 'task'
      taskId: string
      taskKind?: string
      descriptionEs?: string
      buttonText?: string
      linkTo?: string
    }
  | { kind: 'upcoming' }) & {
  descriptionEs?: string;
  buttonText?: string;
  linkTo?: string;
}

export type PieceAccessRule = {
  operator?: 'all' | 'any'
  requirements: readonly UnlockRequirement[]
}

export type ProgressSnapshot = {
  level: number
  completedTaskIds: ReadonlySet<string>
}

export type ProgressProvider = {
  getSnapshot(): ProgressSnapshot | null
}

export type PieceAccessState = 'applied' | 'available' | 'locked' | 'upcoming'

export type PieceAccessMiner = {
  traits?: { purchased?: readonly string[] }
  appearance?: Record<string, string | null | undefined>
}

export type PieceAccessPiece = {
  trait_id: string
  unlockRule?: PieceAccessRule
}

export type PieceAccessReason = {
  kind: UnlockRequirement['kind'] | 'unmapped' | 'already_applied'
  met: boolean
  requirement?: UnlockRequirement
}

export type PieceAccessResult = {
  state: PieceAccessState
  reasons: readonly PieceAccessReason[]
  missing: readonly UnlockRequirement[]
}

export type EvaluatePieceAccessInput = {
  piece: PieceAccessPiece
  miner: PieceAccessMiner
  progress: ProgressSnapshot | null
}

function hasPurchaseRoll(piece: PieceAccessPiece, miner: PieceAccessMiner, requirement: Extract<UnlockRequirement, { kind: 'purchase_roll' }>) {
  return miner.traits?.purchased?.includes(requirement.traitId ?? piece.trait_id) ?? false
}

export function evaluatePieceAccess({ piece, miner, progress }: EvaluatePieceAccessInput): PieceAccessResult {
  if (Object.values(miner.appearance ?? {}).some((traitId) => traitId === piece.trait_id)) {
    return { state: 'applied', reasons: [{ kind: 'already_applied', met: true }], missing: [] }
  }

  const rule = piece.unlockRule
  if (!rule || rule.requirements.length === 0) {
    const requirement: UnlockRequirement = { kind: 'purchase_roll' }
    const purchased = hasPurchaseRoll(piece, miner, requirement)
    return {
      state: purchased ? 'available' : 'locked',
      reasons: [{ kind: purchased ? 'purchase_roll' : 'unmapped', met: purchased, ...(purchased ? { requirement } : {}) }],
      missing: purchased ? [] : [requirement],
    }
  }

  const reasons = rule.requirements.map((requirement): PieceAccessReason => {
    if (requirement.kind === 'always') return { kind: 'always', met: true, requirement }
    if (requirement.kind === 'purchase_roll') return { kind: 'purchase_roll', met: hasPurchaseRoll(piece, miner, requirement), requirement }
    if (requirement.kind === 'task') return { kind: 'task', met: progress?.completedTaskIds.has(requirement.taskId) ?? false, requirement }
    if (requirement.kind === 'upcoming') return { kind: 'upcoming', met: false, requirement }
    return { kind: 'progression_level', met: progress !== null && progress.level >= requirement.minLevel, requirement }
  })
  const isAvailable = (rule.operator ?? 'any') === 'all'
    ? reasons.every((reason) => reason.met)
    : reasons.some((reason) => reason.met)
  const missing = reasons.filter((reason) => !reason.met).flatMap((reason) => reason.requirement ? [reason.requirement] : [])
  return {
    state: isAvailable ? 'available' : rule.requirements.some((requirement) => requirement.kind === 'upcoming') ? 'upcoming' : 'locked',
    reasons,
    missing,
  }
}

export type AppearanceSelectionCategory = {
  payloadKey: string
  pieces: readonly PieceAccessPiece[]
}

export function validateAppearanceSelectionDraft({
  draft,
  saved,
  categories,
  miner,
  progress,
}: {
  draft: Readonly<Record<string, string | null>>
  saved: Readonly<Record<string, string | null>>
  categories: readonly AppearanceSelectionCategory[]
  miner: PieceAccessMiner
  progress: ProgressSnapshot | null
}) {
  for (const category of categories) {
    const traitId = draft[category.payloadKey]
    if (traitId === null || traitId === saved[category.payloadKey]) continue
    const piece = category.pieces.find((candidate) => candidate.trait_id === traitId)
    if (!piece) return false
    const state = evaluatePieceAccess({ piece, miner, progress }).state
    if (state !== 'available' && state !== 'applied') return false
  }
  return true
}
