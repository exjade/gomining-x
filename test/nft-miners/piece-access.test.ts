import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { evaluatePieceAccess, validateAppearanceSelectionDraft } from '../../src/nft-miners/piece-access.ts'
import { loadTraitUnlockMap, validateTraitUnlockMapCoverage, TRAIT_UNLOCK_MAP_HEADERS } from '../../src/nft-miners/unlock-csv.ts'
import { MINER_APPEARANCE_CATALOG_DATA, MINER_APPEARANCE_CATALOG_ENTRIES } from '../../src/nft-miners/catalog-data.ts'
import { getPaginationItems } from '../../src/nft-miners/pagination.ts'
import { parseDevProgressOverride } from '../../src/nft-miners/dev-progress.ts'

const progress = (level = 0, completedTaskIds = new Set()) => ({ level, completedTaskIds })
const wall = { trait_id: 'wall-1', category: 'wall', value: 'Blue' }
const csvRow = (values) => TRAIT_UNLOCK_MAP_HEADERS.map((header) => `"${String(values[header] ?? '').replaceAll('"', '""')}"`).join(',')
const csv = (...rows) => [TRAIT_UNLOCK_MAP_HEADERS.join(','), ...rows.map(csvRow)].join('\n')
const exampleUnlockCsv = csv(
  { trait_id: 'wall-blue', category: 'wall', value: 'Blue', unlockType: 'level', requiredLevel: '3', operator: 'any', evidence_status: 'EXAMPLE-NOT-DECISIONS', notes: 'Only for local development previews; not a product rule' },
  { trait_id: 'wall-yellow', category: 'wall', value: 'Yellow', unlockType: 'upcoming', source: 'example', evidence_status: 'EXAMPLE-NOT-DECISIONS', notes: 'ui-state-demo' },
)

test('unmapped piece is locked unless its purchase roll belongs to this miner', () => {
  const piece = { trait_id: 'wall-1' }
  assert.equal(evaluatePieceAccess({ piece, miner: {}, progress: progress() }).state, 'locked')
  assert.equal(evaluatePieceAccess({ piece, miner: { traits: { purchased: ['wall-1'] } }, progress: progress() }).state, 'available')
})

test('an applied piece remains applied if its unlock is no longer available', () => {
  const result = evaluatePieceAccess({
    piece: { trait_id: 'wall-1', unlockRule: { requirements: [{ kind: 'progression_level', minLevel: 3 }] } },
    miner: { appearance: { wall_id: 'wall-1' } },
    progress: null,
  })
  assert.equal(result.state, 'applied')
  assert.deepEqual(result.missing, [])
})

test('level and task requirements evaluate against progress; a missing document grants neither', () => {
  const levelPiece = { trait_id: 'wall-1', unlockRule: { requirements: [{ kind: 'progression_level', minLevel: 3 }] } }
  const taskPiece = { trait_id: 'wall-2', unlockRule: { requirements: [{ kind: 'task', taskId: 'task-1' }] } }
  assert.equal(evaluatePieceAccess({ piece: levelPiece, miner: {}, progress: null }).state, 'locked')
  assert.equal(evaluatePieceAccess({ piece: levelPiece, miner: {}, progress: progress(2) }).state, 'locked')
  assert.equal(evaluatePieceAccess({ piece: levelPiece, miner: {}, progress: progress(3) }).state, 'available')
  assert.equal(evaluatePieceAccess({ piece: taskPiece, miner: {}, progress: progress() }).state, 'locked')
  assert.equal(evaluatePieceAccess({ piece: taskPiece, miner: {}, progress: progress(0, new Set(['task-1'])) }).state, 'available')
})

test('requirement groups default to any; all requires each requirement', () => {
  const anyPiece = { trait_id: 'wall-1', unlockRule: { requirements: [{ kind: 'always' }, { kind: 'task', taskId: 'task-1' }] } }
  const anyResult = evaluatePieceAccess({ piece: anyPiece, miner: {}, progress: progress() })
  assert.equal(anyResult.state, 'available')
  assert.deepEqual(anyResult.missing, [{ kind: 'task', taskId: 'task-1' }])

  const allPiece = { trait_id: 'wall-2', unlockRule: { operator: 'all', requirements: [{ kind: 'progression_level', minLevel: 3 }, { kind: 'task', taskId: 'task-1' }] } }
  assert.equal(evaluatePieceAccess({ piece: allPiece, miner: {}, progress: progress(3) }).state, 'locked')
  assert.equal(evaluatePieceAccess({ piece: allPiece, miner: {}, progress: progress(3, new Set(['task-1'])) }).state, 'available')
})

test('upcoming maps to the upcoming state unless another any requirement grants access', () => {
  const upcoming = { trait_id: 'wall-1', unlockRule: { requirements: [{ kind: 'upcoming' }] } }
  const mixed = { trait_id: 'wall-2', unlockRule: { requirements: [{ kind: 'always' }, { kind: 'upcoming' }] } }
  assert.equal(evaluatePieceAccess({ piece: upcoming, miner: {}, progress: progress() }).state, 'upcoming')
  assert.equal(evaluatePieceAccess({ piece: mixed, miner: {}, progress: progress() }).state, 'available')
})

test('CSV blank decision map is inert and repeated loading is idempotent', () => {
  const empty = loadTraitUnlockMap('')
  assert.deepEqual(empty.rows, [])
  assert.equal(empty.rules.size, 0)
  assert.doesNotThrow(() => validateTraitUnlockMapCoverage(empty.rows, [wall]))

  const blank = loadTraitUnlockMap(csv({ trait_id: 'wall-1', category: 'wall', value: 'Blue' }), [wall])
  assert.equal(blank.rules.has('wall-1'), false)
  assert.deepEqual(loadTraitUnlockMap(csv({ trait_id: 'wall-1', category: 'wall', value: 'Blue' }), [wall]), blank)
})

test('CSV supports typed level, task, upcoming, always, and any/all requirements', () => {
  const map = loadTraitUnlockMap(csv(
    { trait_id: 'wall-1', category: 'wall', value: 'Blue', unlockType: 'level', requiredLevel: '4' },
    { trait_id: 'wall-2', category: 'wall', value: 'Green', unlockType: 'task', taskId: 'create-miner', descriptionEs: 'Crear un minero' },
    { trait_id: 'wall-3', category: 'wall', value: 'Black', unlockType: 'upcoming' },
    { trait_id: 'wall-4', category: 'wall', value: 'White', unlockType: 'always' },
    {
      trait_id: 'wall-5', category: 'wall', value: 'Gold', operator: 'all',
      requirements_json: '[{"kind":"progression_level","minLevel":2},{"kind":"task","taskId":"task-1","taskKind":"upgrade"}]',
    },
  ), [
    wall,
    { trait_id: 'wall-2', category: 'wall', value: 'Green' },
    { trait_id: 'wall-3', category: 'wall', value: 'Black' },
    { trait_id: 'wall-4', category: 'wall', value: 'White' },
    { trait_id: 'wall-5', category: 'wall', value: 'Gold' },
  ])
  assert.deepEqual(map.rules.get('wall-1').requirements, [{ kind: 'progression_level', minLevel: 4 }])
  assert.deepEqual(map.rules.get('wall-2').requirements, [{ kind: 'task', taskId: 'create-miner', descriptionEs: 'Crear un minero' }])
  assert.equal(map.rules.get('wall-3').requirements[0].kind, 'upcoming')
  assert.equal(map.rules.get('wall-4').requirements[0].kind, 'always')
  assert.equal(map.rules.get('wall-5').operator, 'all')
})

test('CSV rejects unknown traits, stale catalog values, duplicate rows, bad levels, and invalid kinds', () => {
  assert.throws(() => loadTraitUnlockMap(csv({ trait_id: 'unknown', category: 'wall', value: 'Blue' }), [wall]), /Unknown trait_id/)
  assert.throws(() => loadTraitUnlockMap(csv({ trait_id: 'wall-1', category: 'wall', value: 'Red' }), [wall]), /Stale trait metadata/)
  assert.throws(() => loadTraitUnlockMap(csv(
    { trait_id: 'wall-1', category: 'wall', value: 'Blue' },
    { trait_id: 'wall-1', category: 'wall', value: 'Blue' },
  ), [wall]), /Duplicate trait_id/)
  assert.throws(() => loadTraitUnlockMap(csv({ trait_id: 'wall-1', category: 'wall', value: 'Blue', unlockType: 'level', requiredLevel: '3.5' }), [wall]), /positive integer/)
  assert.throws(() => loadTraitUnlockMap(csv({ trait_id: 'wall-1', category: 'wall', value: 'Blue', unlockType: 'vip' }), [wall]), /Invalid unlockType/)
  assert.throws(() => loadTraitUnlockMap(csv({ trait_id: 'wall-1', category: 'wall', value: 'Blue', requirements_json: '[{"kind":"vip_tier"}]' }), [wall]), /Unsupported trait unlock requirement kind/)
})

test('purchase catalog counts match the supplied research transcription', () => {
  const editable = MINER_APPEARANCE_CATALOG_DATA.editable
  const purchaseCounts = Object.fromEntries(editable.filter(({ id }) => id !== 'bottom').map(({ id, values }) => [id, values.length]))
  assert.deepEqual(purchaseCounts, { wall: 10, body: 21, fans: 21, screen: 21, buttons: 21, top: 10, stickers: 10 })
  assert.deepEqual(editable.find(({ id }) => id === 'bottom').values, ['White treads', 'Black treads', 'Purple treads'])
  assert.equal(MINER_APPEARANCE_CATALOG_DATA.readOnly.display.length, 15)
  assert.equal(MINER_APPEARANCE_CATALOG_DATA.readOnly.items.length, 7)
  assert.equal(MINER_APPEARANCE_CATALOG_ENTRIES.length, 136)
  assert.equal(MINER_APPEARANCE_CATALOG_ENTRIES.some(({ value }) => value === 'None'), false)
})

test('decision CSV covers every catalog entry with blank decisions', () => {
  const csvSource = readFileSync(new URL('../../docs/trait-unlock-map.csv', import.meta.url), 'utf8')
  const map = loadTraitUnlockMap(csvSource, MINER_APPEARANCE_CATALOG_ENTRIES)
  validateTraitUnlockMapCoverage(map.rows, MINER_APPEARANCE_CATALOG_ENTRIES)
  assert.equal(map.rows.length, 136)
  assert.equal(map.rules.size, 0)
})

test('example fixture is explicitly non-decision data and demonstrates level progress', () => {
  const fixture = loadTraitUnlockMap(exampleUnlockCsv, MINER_APPEARANCE_CATALOG_ENTRIES)
  assert.match(fixture.rows[0].evidence_status + fixture.rows[0].notes, /EXAMPLE-NOT-DECISIONS/)
  const piece = { trait_id: 'wall-blue', unlockRule: fixture.rules.get('wall-blue') }
  assert.equal(evaluatePieceAccess({ piece, miner: {}, progress: progress(2) }).state, 'locked')
  assert.equal(evaluatePieceAccess({ piece, miner: {}, progress: progress(3) }).state, 'available')
  assert.match(fixture.rows[1].evidence_status + fixture.rows[1].notes, /EXAMPLE-NOT-DECISIONS/)
  const upcoming = { trait_id: 'wall-yellow', unlockRule: fixture.rules.get('wall-yellow') }
  assert.equal(evaluatePieceAccess({ piece: upcoming, miner: {}, progress: progress(0) }).state, 'upcoming')
})

test('save validation accepts only available/applied selections and preserves previously applied locked pieces', () => {
  const category = {
    payloadKey: 'wall_id',
    pieces: [{ trait_id: 'wall-1', unlockRule: { requirements: [{ kind: 'progression_level', minLevel: 3 }] } }],
  }
  const miner = {}
  const draft = { wall_id: 'wall-1' }
  const empty = { wall_id: null }
  assert.equal(validateAppearanceSelectionDraft({ draft, saved: empty, categories: [category], miner, progress: progress(2) }), false)
  assert.equal(validateAppearanceSelectionDraft({ draft, saved: empty, categories: [category], miner, progress: progress(3) }), true)
  assert.equal(validateAppearanceSelectionDraft({ draft, saved: draft, categories: [category], miner, progress: progress(0) }), true)
})

test('pagination stays compact and adds ellipses for many pages', () => {
  assert.deepEqual(getPaginationItems(2, 1), [1, 2])
  assert.deepEqual(getPaginationItems(7, 1), [1, 2, 3, 'ellipsis', 7])
  assert.deepEqual(getPaginationItems(7, 4), [1, 'ellipsis', 3, 4, 5, 'ellipsis', 7])
  assert.deepEqual(getPaginationItems(7, 7), [1, 'ellipsis', 5, 6, 7])
  assert.deepEqual(getPaginationItems(0, 1), [])
})

test('development progress override is disabled outside development and validates query data', () => {
  const override = parseDevProgressOverride('?__devLevel=7&__devTasks=create,upgrade', true)
  assert.equal(override.level, 7)
  assert.deepEqual([...override.completedTaskIds], ['create', 'upgrade'])
  assert.equal(parseDevProgressOverride('?__devLevel=7', false), undefined)
  assert.equal(parseDevProgressOverride('?__devLevel=not-a-number', true), undefined)
  assert.equal(parseDevProgressOverride('', true), undefined)
  assert.equal(parseDevProgressOverride('?__devUnlockAll=1', true), undefined)
})
