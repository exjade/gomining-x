import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluatePieceAccess, validateAppearanceSelectionDraft } from './piece-access.ts'
import { TRAIT_UNLOCK_MAP_HEADERS, loadTraitUnlockMap } from './unlock-csv.ts'
import { parseDevProgressOverride } from './dev-progress.ts'
import { getPaginationItems } from './pagination.ts'

const progress = (level = 0, completedTaskIds = []) => ({
  level,
  completedTaskIds: new Set(completedTaskIds),
})

const csvRow = (traitId, category, value, unlockType = '', requiredLevel = '', taskId = '') => [
  traitId,
  category,
  value,
  unlockType,
  requiredLevel,
  taskId,
  '',
  '',
  '',
  '',
  '',
  'local-fixture',
  'EXAMPLE-NOT-DECISIONS',
  '',
].join(',')

test('purchase rolls unlock only the purchased trait and applied traits stay applied', () => {
  const piece = { trait_id: 'wall-green' }
  assert.equal(evaluatePieceAccess({ piece, miner: { traits: { purchased: ['wall-green'] } }, progress: null }).state, 'available')
  assert.equal(evaluatePieceAccess({ piece, miner: { traits: { purchased: [] } }, progress: null }).state, 'locked')
  assert.equal(evaluatePieceAccess({ piece, miner: { appearance: { wall: 'wall-green' } }, progress: null }).state, 'applied')
})

test('level and task requirements support any and all operators', () => {
  const requirements = [
    { kind: 'progression_level', minLevel: 3 },
    { kind: 'task', taskId: 'miner-created' },
  ]
  const piece = { trait_id: 'body-gold', unlockRule: { requirements } }
  assert.equal(evaluatePieceAccess({ piece, miner: {}, progress: progress(3) }).state, 'available')
  assert.equal(evaluatePieceAccess({ piece: { ...piece, unlockRule: { operator: 'all', requirements } }, miner: {}, progress: progress(3) }).state, 'locked')
  assert.equal(evaluatePieceAccess({ piece: { ...piece, unlockRule: { operator: 'all', requirements } }, miner: {}, progress: progress(3, ['miner-created']) }).state, 'available')
  assert.equal(evaluatePieceAccess({ piece: { ...piece, unlockRule: { requirements: [{ kind: 'progression_level', minLevel: 3 }] } }, miner: {}, progress: null }).state, 'locked')
})

test('upcoming and empty unlock maps remain non-selectable by default', () => {
  assert.equal(evaluatePieceAccess({
    piece: { trait_id: 'wall-yellow', unlockRule: { requirements: [{ kind: 'upcoming' }] } },
    miner: {},
    progress: progress(99),
  }).state, 'upcoming')
  const empty = loadTraitUnlockMap(TRAIT_UNLOCK_MAP_HEADERS.join(','), [{ trait_id: 'wall-green', category: 'wall', value: 'Green' }])
  assert.deepEqual(empty.rows, [])
  assert.equal(empty.rules.size, 0)
  assert.equal(evaluatePieceAccess({ piece: { trait_id: 'wall-green' }, miner: {}, progress: progress(99) }).state, 'locked')
})

test('unlock CSV rejects unknown traits and invalid levels', () => {
  const catalog = [{ trait_id: 'wall-green', category: 'wall', value: 'Green' }]
  const header = TRAIT_UNLOCK_MAP_HEADERS.join(',')
  assert.throws(() => loadTraitUnlockMap(`${header}\n${csvRow('wall-missing', 'wall', 'Missing', 'level', '3')}`, catalog), /Unknown trait_id/)
  assert.throws(() => loadTraitUnlockMap(`${header}\n${csvRow('wall-green', 'wall', 'Green', 'level', 'three')}`, catalog), /positive integer/)
  const loaded = loadTraitUnlockMap(`${header}\n${csvRow('wall-green', 'wall', 'Green', 'level', '3')}`, catalog)
  assert.equal(loaded.rules.get('wall-green').requirements[0].minLevel, 3)
})

test('appearance validation allows available changes and preserves unchanged applied selections', () => {
  const categories = [{ payloadKey: 'wall', pieces: [{ trait_id: 'wall-green', unlockRule: { requirements: [{ kind: 'progression_level', minLevel: 3 }] } }] }]
  assert.equal(validateAppearanceSelectionDraft({
    draft: { wall: 'wall-green' },
    saved: { wall: null },
    categories,
    miner: {},
    progress: progress(3),
  }), true)
  assert.equal(validateAppearanceSelectionDraft({
    draft: { wall: 'wall-green' },
    saved: { wall: 'wall-green' },
    categories,
    miner: {},
    progress: null,
  }), true)
  assert.equal(validateAppearanceSelectionDraft({
    draft: { wall: 'wall-green' },
    saved: { wall: null },
    categories,
    miner: {},
    progress: null,
  }), false)
})

test('development override is dev-gated and parses task ids; pagination supports ellipses', () => {
  const override = parseDevProgressOverride('?__devLevel=5&__devTasks=a,b', true)
  assert.equal(override.level, 5)
  assert.deepEqual([...override.completedTaskIds], ['a', 'b'])
  assert.equal(parseDevProgressOverride('?__devLevel=5', false), undefined)
  assert.equal(parseDevProgressOverride('?__devLevel=bad', true), undefined)
  assert.deepEqual(getPaginationItems(7, 4), [1, 'ellipsis', 3, 4, 5, 'ellipsis', 7])
})
