import { useState, useEffect } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db, type StoredMiner } from './firebase.ts'

export interface UserMinersStoreState {
  uid: string
  subscribers: Set<(miners: StoredMiner[]) => void>
  minersMap: Map<string, StoredMiner>
  cachedList: StoredMiner[]
  unsubscribeFirestore?: () => void
  isInitialized: boolean
  hasActiveListener: boolean
}

let activeUserSubscription: UserMinersStoreState | null = null

export function isUserMinersListenerActive(uid: string): boolean {
  return Boolean(
    activeUserSubscription &&
    activeUserSubscription.uid === uid &&
    activeUserSubscription.hasActiveListener
  )
}

export function getMinerFromSharedStore(uid: string, minerId: string): StoredMiner | undefined {
  if (activeUserSubscription && activeUserSubscription.uid === uid) {
    return activeUserSubscription.minersMap.get(minerId)
  }
  return undefined
}

export function getUserMinersFromStore(uid: string): StoredMiner[] | null {
  if (activeUserSubscription && activeUserSubscription.uid === uid && activeUserSubscription.isInitialized) {
    return [...activeUserSubscription.cachedList]
  }
  return null
}

/** Robustly extracts numeric epoch timestamp from string ISO, Firestore Timestamp, or epoch number */
export function extractMinerTimestamp(miner: StoredMiner): number {
  if (miner.createdAtIso) {
    const parsed = Date.parse(miner.createdAtIso)
    if (!Number.isNaN(parsed)) return parsed
  }
  if (typeof miner.createdAt === 'string') {
    const parsed = Date.parse(miner.createdAt)
    if (!Number.isNaN(parsed)) return parsed
  }
  if (miner.createdAt && typeof (miner.createdAt as any).toMillis === 'function') {
    return (miner.createdAt as any).toMillis()
  }
  if (miner.createdAt && typeof (miner.createdAt as any).seconds === 'number') {
    return (miner.createdAt as any).seconds * 1000
  }
  return 0
}

/** Stable descending sort by creation date (newest first) */
export function sortMinersDescending(miners: StoredMiner[]): StoredMiner[] {
  return [...miners].sort((a, b) => {
    const diff = extractMinerTimestamp(b) - extractMinerTimestamp(a)
    if (diff !== 0) return diff
    return (b.id || '').localeCompare(a.id || '')
  })
}

/**
 * Pure incremental reducer for snapshot.docChanges().
 * Updates only added, modified, or removed miners in-place without parallel queries.
 */
export function applyMinerDocChanges(
  minersMap: Map<string, StoredMiner>,
  changes: Array<{
    type: 'added' | 'modified' | 'removed'
    doc: { id: string; data: () => any }
  }>
): StoredMiner[] {
  changes.forEach((change) => {
    const docData = change.doc.data()
    const minerId = change.doc.id
    const miner: StoredMiner = {
      ...(docData as StoredMiner),
      id: minerId,
    }

    if (change.type === 'added') {
      minersMap.set(minerId, miner)
    } else if (change.type === 'modified') {
      minersMap.set(minerId, miner)
    } else if (change.type === 'removed') {
      minersMap.delete(minerId)
    }
  })

  return sortMinersDescending(Array.from(minersMap.values()))
}

/**
 * Single shared collection subscription to /miners/{uid}/miner per authenticated user.
 * Exactly one collection onSnapshot listener per uid shared across all consumer surfaces.
 * Uses snapshot.docChanges() for incremental updates (added, modified, removed).
 * Zero duplicate listeners, zero polling, zero parallel getDocs().
 * Unsubscribes cleanly only on logout or when the last consumer unmounts.
 */
export function subscribeToUserMiners(
  uid: string,
  callback: (miners: StoredMiner[]) => void,
  customOnSnapshot?: any
): () => void {
  if (!uid) {
    callback([])
    return () => {}
  }

  // If another uid was active, clean it up first
  if (activeUserSubscription && activeUserSubscription.uid !== uid) {
    if (activeUserSubscription.unsubscribeFirestore) {
      try {
        activeUserSubscription.unsubscribeFirestore()
      } catch (err) {
        console.warn('[GoMining] Error unsubscribing previous user miners listener:', err)
      }
    }
    activeUserSubscription = null
  }

  if (!activeUserSubscription) {
    const minersMap = new Map<string, StoredMiner>()
    const subscribers = new Set<(miners: StoredMiner[]) => void>()

    activeUserSubscription = {
      uid,
      subscribers,
      minersMap,
      cachedList: [],
      isInitialized: false,
      hasActiveListener: false,
    }

    subscribers.add(callback)

    try {
      const colRef = collection(db, 'miners', uid, 'miner')
      activeUserSubscription.hasActiveListener = true

      const listen = customOnSnapshot || onSnapshot
      const unsub = listen(
        colRef,
        (snapshot: any) => {
          if (!activeUserSubscription || activeUserSubscription.uid !== uid) return

          const currentList = applyMinerDocChanges(
            activeUserSubscription.minersMap,
            snapshot.docChanges()
          )

          activeUserSubscription.cachedList = currentList
          activeUserSubscription.isInitialized = true

          // Notify shared subscribers
          activeUserSubscription.subscribers.forEach((cb) => {
            try {
              cb(currentList)
            } catch (err) {
              console.warn('[GoMining] Error in miner listener callback:', err)
            }
          })
        },
        (error: any) => {
          console.warn('[GoMining] Shared user miners onSnapshot error:', error)
          if (activeUserSubscription && activeUserSubscription.uid === uid) {
            activeUserSubscription.isInitialized = true
            const fallback = [...activeUserSubscription.cachedList]
            activeUserSubscription.subscribers.forEach((cb) => {
              try {
                cb(fallback)
              } catch (err) {
                console.warn('[GoMining] Error in miner listener error callback:', err)
              }
            })
          }
        }
      )

      activeUserSubscription.unsubscribeFirestore = unsub
    } catch (err) {
      console.warn('[GoMining] Failed to initialize user miners listener:', err)
    }
  } else {
    // Shared subscription already active: register callback and immediately emit current state
    activeUserSubscription.subscribers.add(callback)
    if (activeUserSubscription.isInitialized) {
      callback([...activeUserSubscription.cachedList])
    }
  }

  return () => {
    if (!activeUserSubscription || activeUserSubscription.uid !== uid) return
    activeUserSubscription.subscribers.delete(callback)

    // Unsubscribe cleanly when no consumers remain
    if (activeUserSubscription.subscribers.size === 0) {
      if (activeUserSubscription.unsubscribeFirestore) {
        try {
          activeUserSubscription.unsubscribeFirestore()
        } catch (err) {
          console.warn('[GoMining] Error closing shared collection onSnapshot:', err)
        }
      }
      activeUserSubscription = null
    }
  }
}

/**
 * At most one single document listener for deep-linked customizer route (/miners/:minerId/customize)
 * Used ONLY when no collection listener is currently active for the user.
 * If shared collection listener is active, reuses store and keeps it synced without opening a document listener.
 */
export function subscribeToSingleMinerDoc(
  uid: string,
  minerId: string,
  callback: (miner: StoredMiner | null) => void,
  customOnSnapshot?: any
): () => void {
  if (!uid || !minerId) {
    callback(null)
    return () => {}
  }

  // If shared collection listener already exists, reuse store directly without opening a doc listener!
  if (activeUserSubscription && activeUserSubscription.uid === uid) {
    if (activeUserSubscription.isInitialized) {
      const existing = activeUserSubscription.minersMap.get(minerId) || null
      callback(existing)
    }

    const storeSub = (miners: StoredMiner[]) => {
      const match = miners.find((m) => m.id === minerId) || null
      callback(match)
    }
    activeUserSubscription.subscribers.add(storeSub)

    return () => {
      if (activeUserSubscription && activeUserSubscription.uid === uid) {
        activeUserSubscription.subscribers.delete(storeSub)
        if (activeUserSubscription.subscribers.size === 0) {
          if (activeUserSubscription.unsubscribeFirestore) {
            try {
              activeUserSubscription.unsubscribeFirestore()
            } catch (err) {
              console.warn('[GoMining] Error closing shared collection onSnapshot:', err)
            }
          }
          activeUserSubscription = null
        }
      }
    }
  }

  try {
    const docRef = doc(db, 'miners', uid, 'miner', minerId)
    const listen = customOnSnapshot || onSnapshot
    const unsub = listen(
      docRef,
      (snap: any) => {
        if (!snap.exists()) {
          callback(null)
          return
        }
        const data = snap.data() as StoredMiner
        callback({ ...data, id: snap.id })
      },
      (err: any) => {
        console.warn('[GoMining] Error in single miner doc listener:', err)
        callback(null)
      }
    )
    return unsub
  } catch (err) {
    console.warn('[GoMining] Failed to attach single miner doc listener:', err)
    callback(null)
    return () => {}
  }
}

/** React hook for consuming realtime user miners from the single shared listener */
export function useRealtimeUserMiners(uid: string | undefined): {
  miners: StoredMiner[]
  loading: boolean
} {
  const [miners, setMiners] = useState<StoredMiner[]>(() => {
    if (!uid || !activeUserSubscription || activeUserSubscription.uid !== uid) return []
    return [...activeUserSubscription.cachedList]
  })
  const [loading, setLoading] = useState<boolean>(() => {
    if (!uid) return false
    return !(activeUserSubscription && activeUserSubscription.uid === uid && activeUserSubscription.isInitialized)
  })

  useEffect(() => {
    if (!uid) {
      setMiners([])
      setLoading(false)
      return
    }

    let mounted = true
    const unsub = subscribeToUserMiners(uid, (updatedList) => {
      if (!mounted) return
      setMiners(updatedList)
      setLoading(false)
    })

    return () => {
      mounted = false
      unsub()
    }
  }, [uid])

  return { miners, loading }
}

/** Explicit cleanup on user logout */
export function cleanupUserMinersSubscription(): void {
  if (activeUserSubscription) {
    if (activeUserSubscription.unsubscribeFirestore) {
      try {
        activeUserSubscription.unsubscribeFirestore()
      } catch {}
    }
    activeUserSubscription = null
  }
}
