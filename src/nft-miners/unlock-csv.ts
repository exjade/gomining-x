import type { PieceAccessRule, UnlockRequirement } from './piece-access'

export const TRAIT_UNLOCK_MAP_HEADERS = [
  'trait_id',
  'category',
  'value',
  'unlockType',
  'requiredLevel',
  'taskId',
  'operator',
  'descriptionEs',
  'buttonText',
  'linkTo',
  'requirements_json',
  'source',
  'evidence_status',
  'notes',
] as const

export type TraitUnlockMapRow = {
  trait_id: string
  category: string
  value: string
  unlockType: string
  requiredLevel: string
  taskId: string
  operator: string
  descriptionEs: string
  buttonText: string
  linkTo: string
  requirements_json: string
  source: string
  evidence_status: string
  notes: string
}

export type TraitCatalogEntry = { trait_id: string; category: string; value: string | null }

export type LoadedTraitUnlockMap = {
  rows: readonly TraitUnlockMapRow[]
  rules: ReadonlyMap<string, PieceAccessRule>
}

function parseCsvRows(csv: string) {
  const source = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv
  const parsedRows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted && character === '"' && source[index + 1] === '"') {
      field += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((value) => value.length > 0)) parsedRows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }
  if (quoted) throw new Error('Trait unlock CSV contains an unterminated quoted field')
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.some((value) => value.length > 0)) parsedRows.push(row)
  }
  return parsedRows
}

function readOptionalText(value: unknown, field: string) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`Invalid ${field} in trait unlock requirement`)
  return value
}

function parseRequirement(value: unknown): UnlockRequirement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Trait unlock requirement must be an object')
  const item = value as Record<string, unknown>
  if (item.kind === 'purchase_roll') {
    const traitId = readOptionalText(item.traitId, 'traitId')
    return { kind: 'purchase_roll', ...(traitId === undefined ? {} : { traitId }) }
  }
  if (item.kind === 'always' || item.kind === 'upcoming') return { kind: item.kind }
  if (item.kind === 'progression_level') {
    if (typeof item.minLevel !== 'number' || !Number.isInteger(item.minLevel) || item.minLevel < 1) {
      throw new Error('Progression minLevel must be a positive integer')
    }
    return { kind: 'progression_level', minLevel: item.minLevel }
  }
  if (item.kind === 'task') {
    if (typeof item.taskId !== 'string' || item.taskId.length === 0) throw new Error('Task requirement must include taskId')
    const taskKind = readOptionalText(item.taskKind, 'taskKind')
    const descriptionEs = readOptionalText(item.descriptionEs, 'descriptionEs')
    const buttonText = readOptionalText(item.buttonText, 'buttonText')
    const linkTo = readOptionalText(item.linkTo, 'linkTo')
    return {
      kind: 'task',
      taskId: item.taskId,
      ...(taskKind === undefined ? {} : { taskKind }),
      ...(descriptionEs === undefined ? {} : { descriptionEs }),
      ...(buttonText === undefined ? {} : { buttonText }),
      ...(linkTo === undefined ? {} : { linkTo }),
    }
  }
  throw new Error(`Unsupported trait unlock requirement kind: ${String(item.kind)}`)
}

function withRowTaskCopyTaskSpecific(requirement: UnlockRequirement, row: TraitUnlockMapRow): UnlockRequirement {
  if (requirement.kind !== 'task') return requirement
  return {
    ...requirement,
    ...(requirement.descriptionEs === undefined && row.descriptionEs ? { descriptionEs: row.descriptionEs } : {}),
    ...(requirement.buttonText === undefined && row.buttonText ? { buttonText: row.buttonText } : {}),
    ...(requirement.linkTo === undefined && row.linkTo ? { linkTo: row.linkTo }


: {}),
  }
}

function withRowTaskCopy(
  requirement: UnlockRequirement,
  row: TraitUnlockMapRow,
): UnlockRequirement {
  return requirement.kind === 'task' ? withRowTaskCopyTaskSpecific(requirement, row) : requirement
}


function readRule(row: TraitUnlockMapRow): PieceAccessRule | undefined {
  if (row.operator && row.operator !== 'all' && row.operator !== 'any') throw new Error(`Invalid operator for ${row.trait_id}: ${row.operator}`)
  const hasSimpleRequirement = Boolean(row.unlockType || row.requiredLevel || row.taskId)
  if (row.requirements_json && hasSimpleRequirement) throw new Error(`Use either requirements_json or unlockType fields for ${row.trait_id}`)

  if (row.requirements_json) {
    const decoded: unknown = JSON.parse(row.requirements_json)
    if (!Array.isArray(decoded) || decoded.length === 0) throw new Error(`requirements_json for ${row.trait_id} must be a non-empty array`)
    return {
      operator: row.operator ? row.operator as 'all' | 'any' : 'any',
      requirements: decoded.map(parseRequirement).map((requirement) => withRowTaskCopy(requirement, row)),
    }
  }

  if (!row.unlockType) {
    if (row.requiredLevel || row.taskId) throw new Error(`unlockType is required for ${row.trait_id}`)
    return undefined
  }

  let requirement: UnlockRequirement
  if (row.unlockType === 'level') {
    if (!/^[1-9]\d*$/.test(row.requiredLevel)) throw new Error(`requiredLevel for ${row.trait_id} must be a positive integer`)
    if (row.taskId) throw new Error(`taskId is not valid for level requirement ${row.trait_id}`)
    requirement = { kind: 'progression_level', minLevel: Number(row.requiredLevel) }
  } else if (row.unlockType === 'task') {
    if (!row.taskId) throw new Error(`taskId is required for ${row.trait_id}`)
    if (row.requiredLevel) throw new Error(`requiredLevel is not valid for task requirement ${row.trait_id}`)
    requirement = { kind: 'task', taskId: row.taskId }
  } else if (row.unlockType === 'upcoming') {
    if (row.requiredLevel || row.taskId) throw new Error(`upcoming ${row.trait_id} must not contain level or task data`)
    requirement = { kind: 'upcoming' }
  } else if (row.unlockType === 'always') {
    if (row.requiredLevel || row.taskId) throw new Error(`always ${row.trait_id} must not contain level or task data`)
    requirement = { kind: 'always' }
  } else {
    throw new Error(`Invalid unlockType for ${row.trait_id}: ${row.unlockType}`)
  }

  return {
    operator: row.operator ? row.operator as 'all' | 'any' : 'any',
    requirements: [withRowTaskCopy(requirement, row)],
  }
}

export function loadTraitUnlockMap(csv: string, pieces?: readonly TraitCatalogEntry[]): LoadedTraitUnlockMap {
  const parsedRows = parseCsvRows(csv)
  if (parsedRows.length === 0) return { rows: [], rules: new Map() }
  const [header, ...records] = parsedRows
  if (header.length !== TRAIT_UNLOCK_MAP_HEADERS.length || TRAIT_UNLOCK_MAP_HEADERS.some((field, index) => header[index] !== field)) {
    throw new Error(`Trait unlock CSV header must be: ${TRAIT_UNLOCK_MAP_HEADERS.join(',')}`)
  }

  const piecesById = pieces ? new Map(pieces.map((piece) => [piece.trait_id, piece])) : undefined
  const seenIds = new Set<string>()
  const rows = records.map((record): TraitUnlockMapRow => {
    if (record.length !== header.length) throw new Error('Trait unlock CSV row has an unexpected number of columns')
    const row = Object.fromEntries(header.map((key, index) => [key, record[index]])) as TraitUnlockMapRow
    if (!row.trait_id || !row.category) throw new Error('Trait unlock CSV rows require trait_id and category')
    if (seenIds.has(row.trait_id)) throw new Error(`Duplicate trait_id in trait unlock CSV: ${row.trait_id}`)
    seenIds.add(row.trait_id)
    const piece = piecesById?.get(row.trait_id)
    if (piecesById && !piece) throw new Error(`Unknown trait_id in trait unlock CSV: ${row.trait_id}`)
    if (piece && (piece.category !== row.category || (piece.value ?? '') !== row.value)) {
      throw new Error(`Stale trait metadata in trait unlock CSV: ${row.trait_id}`)
    }
    return row
  })

  const rules = new Map<string, PieceAccessRule>()
  for (const row of rows) {
    const rule = readRule(row)
    if (rule) rules.set(row.trait_id, rule)
  }
  return { rows, rules }
}

export function validateTraitUnlockMapCoverage(rows: readonly TraitUnlockMapRow[], pieces: readonly TraitCatalogEntry[]) {
  if (rows.length === 0) return
  const mappedIds = new Set(rows.map((row) => row.trait_id))
  const expectedIds = new Set(pieces.map((piece) => piece.trait_id))
  const missing = pieces.map((piece) => piece.trait_id).filter((traitId) => !mappedIds.has(traitId))
  const unknown = rows.map((row) => row.trait_id).filter((traitId) => !expectedIds.has(traitId))
  if (missing.length || unknown.length) {
    throw new Error(`Trait unlock CSV coverage mismatch; missing=${missing.join('|')}; unknown=${unknown.join('|')}`)
  }
}
