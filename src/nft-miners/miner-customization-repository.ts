import { updateMinerInFirestore } from '../firebase.ts'
import type { MinerAppearance } from './appearance'

export type MinerAppearanceWriter = (uid: string, minerId: string, updates: { appearance: MinerAppearance }) => Promise<void>

export async function saveOwnedMinerAppearance(
  uid: string,
  minerId: string,
  appearance: MinerAppearance,
  updateMiner: MinerAppearanceWriter = updateMinerInFirestore,
): Promise<void> {
  if (!uid.trim()) throw new Error('Cannot save miner appearance without a valid uid')
  if (!minerId.trim()) throw new Error('Cannot save miner appearance without a valid minerId')
  await updateMiner(uid, minerId, { appearance })
}
