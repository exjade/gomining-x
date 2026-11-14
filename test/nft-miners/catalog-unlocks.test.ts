import test from 'node:test'
import assert from 'node:assert/strict'
import { unlockRulesFromCatalog } from '../../src/nft-miners/catalog-unlocks.ts'
import { evaluatePieceAccess } from '../../src/nft-miners/piece-access.ts'

test('maps per-asset admin requirements into the evaluator without assigning levels in UI code', () => {
  const catalog = {
    assets: [
      { asset_id: 'screen-1', trait_id: 'screen-blue', status: 'published', unlock_rule: { operator: 'all', requirements: [{ kind: 'progression_level', minLevel: 7 }] } },
      { asset_id: 'screen-2', trait_id: 'screen-soon', status: 'published', unlock_rule: { operator: 'all', requirements: [{ kind: 'upcoming' }] } },
      { asset_id: 'screen-3', trait_id: 'screen-task', status: 'published', unlock_rule: { operator: 'all', requirements: [{ kind: 'task', taskId: 'task-1' }] } },
    ],
    levels: [{ level: 7, benefit_ids: [], description_es: '', is_active: true }],
  }
  const rules = unlockRulesFromCatalog(catalog)

  assert.deepEqual(rules.get('screen-blue'), { operator: 'all', requirements: [{ kind: 'progression_level', minLevel: 7 }] })
  assert.deepEqual(rules.get('screen-soon'), { operator: 'all', requirements: [{ kind: 'upcoming' }] })
  assert.deepEqual(rules.get('screen-task'), catalog.assets[2].unlock_rule)
  assert.equal(evaluatePieceAccess({ piece: { trait_id: 'screen-blue', unlockRule: rules.get('screen-blue') }, miner: {}, progress: { level: 6, completedTaskIds: new Set() } }).state, 'locked')
  assert.equal(evaluatePieceAccess({ piece: { trait_id: 'screen-blue', unlockRule: rules.get('screen-blue') }, miner: {}, progress: { level: 7, completedTaskIds: new Set() } }).state, 'available')
})
