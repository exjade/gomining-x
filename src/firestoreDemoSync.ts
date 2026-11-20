import { useEffect, useState } from 'react'
import {
  getDemoSessionForPersistence,
  restoreDemoSession,
  subscribeToDemoSession,
} from './demoStore.ts'

export type DemoPersistenceStatus = 'disabled' | 'connecting' | 'syncing' | 'saved' | 'error'
type StatusListener = (status: DemoPersistenceStatus, detail?: string) => void

const LOCAL_DEMO_SNAPSHOT_KEY = 'gomining-replica-demo-v1'

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env)
  ? (import.meta as any).env
  : ((typeof process !== 'undefined' && process.env) || {})

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
}

export async function getFirebaseClient() {
  const [firebaseApp, firebaseAuth, firebaseStore] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ])
  const appName = 'gomining-replica-test'
  const app = firebaseApp.getApps().some((candidate) => candidate.name === appName)
    ? firebaseApp.getApp(appName)
    : firebaseApp.initializeApp(firebaseConfig, appName)
  return {
    auth: firebaseAuth.getAuth(app),
    db: firebaseStore.getFirestore(app),
    ...firebaseAuth,
    ...firebaseStore,
  }
}

function readLocalSnapshot() {
  try {
    const raw = window.localStorage.getItem(LOCAL_DEMO_SNAPSHOT_KEY)
    if (!raw) return false
    const saved: unknown = JSON.parse(raw)
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return false
    const data = saved as Record<string, unknown>
    return data.mode === 'demo' && data.schemaVersion === 1 && restoreDemoSession(data)
  } catch {
    return false
  }
}

function writeLocalSnapshot() {
  try {
    window.localStorage.setItem(LOCAL_DEMO_SNAPSHOT_KEY, JSON.stringify({
      schemaVersion: 1,
      mode: 'demo',
      ...getDemoSessionForPersistence(),
      updatedAt: new Date().toISOString(),
    }))
    return true
  } catch {
    return false
  }
}

export function connectDemoPersistence(onStatus: StatusListener) {
  if (typeof window === 'undefined') {
    onStatus('disabled')
    return () => undefined
  }

  readLocalSnapshot()
  const initialSaved = writeLocalSnapshot()
  if (!initialSaved) {
    onStatus('error', 'El navegador no permitió guardar los datos locales.')
  } else {
    onStatus('disabled')
  }

  const unsubscribeLocal = subscribeToDemoSession(() => {
    const saved = writeLocalSnapshot()
    if (!saved) {
      onStatus('error', 'El navegador no permitió guardar los datos locales.')
    } else {
      onStatus('disabled')
    }
  })

  return unsubscribeLocal
}

/** Demo persistence operating 100% locally on window.localStorage ('gomining-replica-demo-v1'). */
export function useDemoFirestorePersistence() {
  const [status, setStatus] = useState<DemoPersistenceStatus>('disabled')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    let active = true
    const unsubscribe = connectDemoPersistence((next, message) => {
      if (!active) return
      setStatus(next)
      setDetail(message ?? '')
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return { status, detail }
}
