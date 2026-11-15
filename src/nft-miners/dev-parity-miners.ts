import type { MinerAppearance } from './appearance'
import type { MinerCustomizationMiner } from './miner-customization-model'

export const DEV_PARITY_UID = 'scrum-240-parity-fixture-user'
const DEV_PARITY_FIXTURES = new Set(['zero', 'saved', 'saved-pair', 'locked', 'empty', 'page2'])

const savedAppearance: MinerAppearance = {
  wall_id: 'wall-blue',
  screen_id: 'screen-green-curves',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function parityMiner(id: string, name: string, appearance?: MinerAppearance, purchased: readonly string[] = []): MinerCustomizationMiner & { packageId: string } {
  return {
    id,
    packageId: 'minerx-01',
    name,
    powerTh: 1.46,
    efficiency: 15,
    appearance,
    traits: { purchased },
  }
}

export function getDevParityMiners(search: string): readonly (MinerCustomizationMiner & { packageId: string })[] | null {
  if (!import.meta.env.DEV) return null
  const fixture = new URLSearchParams(search).get('parityFixture')
  if (!fixture || !DEV_PARITY_FIXTURES.has(fixture)) return null
  if (fixture === 'zero') return []
  if (fixture === 'saved-pair') return [
    parityMiner('5422372', 'Parity miner', savedAppearance, ['wall-blue', 'screen-green-curves']),
    parityMiner('test-secondary', 'Parity secondary', undefined),
  ]
  if (fixture === 'empty') return [parityMiner('5422372', 'Parity miner', undefined, ['wall-blue'])]
  if (fixture === 'locked') return [parityMiner('5422372', 'Parity miner', savedAppearance)]
  return [parityMiner('5422372', 'Parity miner', savedAppearance, ['wall-blue', 'screen-green-curves'])]
}

export function getDevParityMiner(search: string, minerId: string) {
  return getDevParityMiners(search)?.find((miner) => miner.id === minerId) ?? null
}

export function isDevParityFixture(search: string) {
  return getDevParityMiners(search) !== null
}
