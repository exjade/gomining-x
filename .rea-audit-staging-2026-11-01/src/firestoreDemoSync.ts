import { useEffect, useState } from 'react'
import type { Auth, User } from 'firebase/auth'
import { getDemoSessionForPersistence, getDemoSessionRevision, restoreDemoSession, subscribeToDemoSession } from './demoStore'

export type DemoPersistenceStatus = 'disabled' | 'connecting' | 'syncing' | 'saved' | 'error'
type StatusListener = (status: DemoPersistenceStatus, detail?: string) => void
type AuthStateListener = typeof import('firebase/auth').onAuthStateChanged

const LOCAL_DEMO_SNAPSHOT_KEY = 'gomining-replica-demo-v1'
let anonymousUserPromise: Promise<User> | null = null

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
}

function isConfigured() {
  return Object.values(firebaseConfig).every(Boolean)
}

async function getFirebaseClient() {
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

function waitForInitialUser(auth: Auth, onAuthStateChanged: AuthStateListener) {
  return new Promise<User | null>((resolve, reject) => {
    let unsubscribe: () => void = () => {}
    unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    }, (error) => {
      unsubscribe()
      reject(error)
    })
  })
}

function safeError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : ''
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') return 'Activa el proveedor Anónimo en Firebase Authentication del proyecto de prueba.'
  if (code === 'auth/unauthorized-domain') return 'Añade este dominio a los dominios autorizados en Firebase Authentication.'
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return 'Firestore rechazó el acceso. Publica las reglas locales del proyecto de prueba.'
  if (code === 'unavailable' || code === 'auth/network-request-failed') return 'Firebase no responde ahora. El estado demo sigue guardándose en este navegador.'
  if (!(error instanceof Error)) return 'No se pudo conectar Firebase. El estado demo sigue guardándose en este navegador.'
  return 'No se pudo conectar Firebase. El estado demo sigue guardándose en este navegador.'
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

function snapshotData(serverTimestamp: () => unknown) {
  return {
    schemaVersion: 1,
    mode: 'demo',
    ...getDemoSessionForPersistence(),
    updatedAt: serverTimestamp(),
  }
}

async function connectDemoPersistence(onStatus: StatusListener) {
  if (typeof window === 'undefined') {
    onStatus('disabled')
    return () => undefined
  }

  readLocalSnapshot()
  let localSnapshotSaved = writeLocalSnapshot()
  const unsubscribeLocal = subscribeToDemoSession(() => {
    localSnapshotSaved = writeLocalSnapshot()
    if (!localSnapshotSaved) onStatus('error', 'El navegador no permitió guardar los datos demo locales.')
  })
  const localBackupNote = () => localSnapshotSaved
    ? ' El estado demo queda guardado localmente aunque no haya nube.'
    : ' El navegador tampoco pudo escribir el respaldo local.'

  if (!isConfigured()) {
    onStatus(localSnapshotSaved ? 'disabled' : 'error', localSnapshotSaved
      ? 'Firestore no está configurado.'
      : 'El navegador no permitió guardar los datos demo locales.')
    return unsubscribeLocal
  }

  onStatus('connecting')
  const initialLocalRevision = getDemoSessionRevision()
  try {
    const firebase = await getFirebaseClient()
    const { auth, db } = firebase
    const initialUser = await waitForInitialUser(auth, firebase.onAuthStateChanged)
    let user = initialUser
    if (!user) {
      anonymousUserPromise ??= firebase.signInAnonymously(auth).then((credential) => credential.user).catch((error: unknown) => {
        anonymousUserPromise = null
        throw error
      })
      user = await anonymousUserPromise
    }
    const sessionRef = firebase.doc(db, 'users', user.uid, 'demoState', 'current')
    const remote = await firebase.getDoc(sessionRef)
    const localChangedWhileConnecting = getDemoSessionRevision() !== initialLocalRevision
    if (remote.exists() && !localChangedWhileConnecting) {
      const saved = remote.data()
      if (saved.mode === 'demo' && saved.schemaVersion === 1) restoreDemoSession(saved)
    }

    let timer: number | undefined
    let disposed = false
    let writeChain = Promise.resolve()
    const saveSnapshot = () => {
      const queued = writeChain.then(async () => {
        if (disposed) return
        await firebase.setDoc(sessionRef, snapshotData(firebase.serverTimestamp))
      })
      writeChain = queued.then(() => {
        if (!disposed) onStatus('saved')
      }).catch((error: unknown) => {
        if (!disposed) onStatus('error', `${safeError(error)}${localBackupNote()}`)
      })
      return writeChain
    }
    const persist = () => {
      if (disposed) return
      onStatus('syncing')
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(() => { void saveSnapshot() }, 450)
    }

    const unsubscribeStore = subscribeToDemoSession(persist)
    if (!remote.exists() || localChangedWhileConnecting) {
      onStatus('syncing')
      await saveSnapshot()
    } else {
      // A successful read proves the existing demo document is available. New
      // changes are reported as syncing until the debounced write is confirmed.
      onStatus('saved')
    }
    return () => {
      disposed = true
      if (timer !== undefined) window.clearTimeout(timer)
      unsubscribeStore()
      unsubscribeLocal()
    }
  } catch (error) {
    onStatus('error', `${safeError(error)}${localBackupNote()}`)
    return unsubscribeLocal
  }
}

/** Each browser gets an anonymous Firebase UID; only its bounded demo snapshot is synchronized. */
export function useDemoFirestorePersistence() {
  const [status, setStatus] = useState<DemoPersistenceStatus>('connecting')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    let active = true
    let stop: () => void = () => {}
    void connectDemoPersistence((next, message) => {
      if (!active) return
      setStatus(next)
      setDetail(message ?? '')
    }).then((unsubscribe) => {
      if (!active) unsubscribe()
      else stop = unsubscribe
    }).catch((error: unknown) => {
      if (active) {
        setStatus('error')
        setDetail(safeError(error))
      }
    })
    return () => {
      active = false
      stop()
    }
  }, [])

  return { status, detail }
}
