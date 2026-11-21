import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
  type Auth
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type Firestore,
  type DocumentData
} from 'firebase/firestore';

/**
 * MinerX Isolated Admin & Fleet Engine
 * Configured for project "salad-miners" with dedicated /admin_* collections.
 * NEVER writes to or mutates client-facing collections (/users, /miners, /referrals).
 */
const getEnvVar = (key: string, fallback: string): string => {
  try {
    const metaEnv = (import.meta as any)?.env;
    if (metaEnv && metaEnv[key]) {
      return metaEnv[key];
    }
  } catch {}
  try {
    const nodeProcess = (globalThis as any).process;
    if (nodeProcess?.env && nodeProcess.env[key]) {
      return nodeProcess.env[key];
    }
  } catch {}
  return fallback;
};

export const firebaseConfig = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY', "AIzaSyAjqJ1D3f5jA-Xgj_79PTbYCtA8CyFqLGk"),
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN', "salad-miners.firebaseapp.com"),
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID', "salad-miners"),
  storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET', "salad-miners.firebasestorage.app"),
  messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID', "402055553257"),
  appId: getEnvVar('VITE_FIREBASE_APP_ID', "1:402055553257:web:bfd9ebd33083e3f54f1078")
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

try {
  if (isBrowser) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    // In Node.js (test runner/CLI), keep null to prevent unmocked browser gRPC background network streams
    app = null;
  }
} catch (err) {
  console.warn('[MinerX Firebase] Client SDK initialization notice (fallback active):', err);
  app = null;
}

export { app, auth, db };

export interface AuthResult {
  success: boolean;
  message?: string;
  user?: {
    id: string;
    username: string;
    email: string;
    fullName?: string;
    isFirebaseUser?: boolean;
  };
  token?: string;
}

/**
 * Register an admin user in Firebase Authentication
 */
export async function registerWithFirebase(
  email: string,
  password: string,
  fullName: string
): Promise<AuthResult> {
  if (!auth) {
    return { success: false, message: 'Firebase Auth no inicializado' };
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (fullName && cred.user) {
      await updateProfile(cred.user, { displayName: fullName.trim() });
    }

    const token = await cred.user.getIdToken();
    const username = email.split('@')[0];

    return {
      success: true,
      message: 'Administrador registrado exitosamente en Firebase Authentication (salad-miners)',
      user: {
        id: cred.user.uid,
        username,
        email: cred.user.email || email,
        fullName: cred.user.displayName || fullName || username,
        isFirebaseUser: true
      },
      token
    };
  } catch (err: any) {
    console.error('[MinerX Firebase] Register error:', err);
    let msg = err.message || 'Error registrando en Firebase';
    if (err.code === 'auth/email-already-in-use') {
      msg = 'El correo electrónico ya está registrado en Firebase.';
    } else if (err.code === 'auth/weak-password') {
      msg = 'La contraseña debe tener al menos 6 caracteres.';
    } else if (err.code === 'auth/invalid-email') {
      msg = 'El formato de correo no es válido.';
    }
    return { success: false, message: msg };
  }
}

/**
 * Sign in an admin user with Firebase Authentication
 */
export async function loginWithFirebase(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!auth) {
    return { success: false, message: 'Firebase Auth no inicializado' };
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    const token = await cred.user.getIdToken();
    const username = (cred.user.email || email).split('@')[0];

    return {
      success: true,
      message: 'Inicio de sesión exitoso con Firebase Authentication (salad-miners)',
      user: {
        id: cred.user.uid,
        username,
        email: cred.user.email || email,
        fullName: cred.user.displayName || username,
        isFirebaseUser: true
      },
      token
    };
  } catch (err: any) {
    console.error('[MinerX Firebase] Login error:', err);
    let msg = err.message || 'Error al iniciar sesión en Firebase';
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      msg = 'Correo o contraseña incorrectos en Firebase.';
    } else if (err.code === 'auth/invalid-email') {
      msg = 'El formato de correo no es válido.';
    }
    return { success: false, message: msg };
  }
}

/**
 * Sign out from Firebase Authentication
 */
export async function logoutFirebase(): Promise<void> {
  if (auth) {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('[MinerX Firebase] Sign out notice:', e);
    }
  }
}

/**
 * Listen for Firebase Auth state changes
 */
export function subscribeToFirebaseAuthState(callback: (user: FirebaseUser | null) => void) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

// ============================================================================
// FIRESTORE COLLECTIONS (/admin_* and /users)
// Supports isolated admin users (/admin_users) and platform client users (/users).
// ============================================================================

export const ADMIN_COLLECTIONS = {
  USERS: 'admin_users',
  WORKERS: 'admin_workers',
  CONTRACTS: 'admin_contracts',
  AUDIT_LOGS: 'admin_audit_logs',
  SETTINGS: 'admin_settings'
} as const;

export const FIRESTORE_COLLECTIONS = {
  ADMIN_USERS: 'admin_users',
  USERS: 'users',
  WORKERS: 'admin_workers',
  CONTRACTS: 'admin_contracts',
  AUDIT_LOGS: 'admin_audit_logs',
  SETTINGS: 'admin_settings'
} as const;

/**
 * Fetch all admin users from isolated `/admin_users` in Cloud Firestore (salad-miners)
 */
export async function fetchFirestoreAdminUsers(): Promise<DocumentData[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, ADMIN_COLLECTIONS.USERS));
    return snap.docs.map((d) => ({ ...d.data(), id: d.id, uid: d.id }));
  } catch (err) {
    console.warn('[Firestore] Error fetching isolated admin_users:', err);
    return [];
  }
}

/**
 * Fetch all standard client users from `/users` in Cloud Firestore
 */
export async function fetchFirestoreStandardUsers(): Promise<DocumentData[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, FIRESTORE_COLLECTIONS.USERS));
    return snap.docs.map((d) => ({ ...d.data(), id: d.id, uid: d.id }));
  } catch (err) {
    console.warn('[Firestore] Error fetching users collection:', err);
    return [];
  }
}

/**
 * Save or update an admin user in isolated `/admin_users/{id}`
 */
export async function saveFirestoreAdminUser(user: Record<string, any>): Promise<boolean> {
  return saveFirestoreUser('admin_users', user);
}

/**
 * Universal save or update for user documents in either `/admin_users` or `/users`
 */
export async function saveFirestoreUser(
  collectionName: 'admin_users' | 'users',
  user: Record<string, any>
): Promise<boolean> {
  const docId = user.id || user.uid;
  if (!db || !docId) return false;
  try {
    const docRef = doc(db, collectionName, docId);
    await setDoc(docRef, {
      ...user,
      id: docId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error(`[Firestore] Error saving user ${docId} to /${collectionName}:`, err);
    return false;
  }
}

/**
 * Delete a user document from either `/admin_users` or `/users`
 */
export async function deleteFirestoreUser(
  collectionName: 'admin_users' | 'users',
  userId: string
): Promise<boolean> {
  if (!db || !userId) return false;
  try {
    const docRef = doc(db, collectionName, userId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error(`[Firestore] Error deleting user ${userId} from /${collectionName}:`, err);
    return false;
  }
}

/**
 * Query Firestore collection with composite filters matching indexed fields
 */
export async function queryFirestoreUsers(
  collectionName: 'admin_users' | 'users',
  filters: {
    status?: string;
    limitCount?: number;
  } = {}
): Promise<DocumentData[]> {
  if (!db) return [];
  try {
    const colRef = collection(db, collectionName);
    const constraints: any[] = [];
    if (filters.status && filters.status !== 'all') {
      constraints.push(where('status', '==', filters.status));
    }
    constraints.push(orderBy('registeredAt', 'desc'));
    if (filters.limitCount) {
      constraints.push(limit(filters.limitCount));
    }
    const q = query(colRef, ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id, uid: d.id }));
  } catch (err) {
    console.warn(`[Firestore] Query notice on /${collectionName}:`, err);
    return [];
  }
}

/**
 * Real-time subscription to both `/admin_users` and `/users` collections in Cloud Firestore
 */
export function subscribeToFirestoreUsers(
  callback: (data: { adminUsers: DocumentData[]; clientUsers: DocumentData[] }) => void
): () => void {
  if (!db) return () => {};
  let adminDocs: DocumentData[] = [];
  let clientDocs: DocumentData[] = [];
  let isUnsubscribed = false;

  const emit = () => {
    if (!isUnsubscribed) {
      callback({ adminUsers: adminDocs, clientUsers: clientDocs });
    }
  };

  try {
    const unsubAdmin = onSnapshot(
      collection(db, FIRESTORE_COLLECTIONS.ADMIN_USERS),
      (snap) => {
        adminDocs = snap.docs.map(d => ({ ...d.data(), id: d.id, uid: d.id }));
        emit();
      },
      (err) => console.warn('[Firestore] Admin users snapshot notice:', err)
    );

    const unsubClient = onSnapshot(
      collection(db, FIRESTORE_COLLECTIONS.USERS),
      (snap) => {
        clientDocs = snap.docs.map(d => ({ ...d.data(), id: d.id, uid: d.id }));
        emit();
      },
      (err) => console.warn('[Firestore] Standard users snapshot notice:', err)
    );

    return () => {
      isUnsubscribed = true;
      unsubAdmin();
      unsubClient();
    };
  } catch {
    return () => {};
  }
}

/**
 * Seed initial administrative team into isolated `/admin_users`
 */
export async function seedInitialAdminUsers(initialUsers: any[]): Promise<number> {
  if (!db) return 0;
  let count = 0;
  for (const u of initialUsers) {
    try {
      await setDoc(doc(db, ADMIN_COLLECTIONS.USERS, u.id), {
        ...u,
        isPlatformAdmin: true,
        seededAt: new Date().toISOString()
      }, { merge: true });
      count++;
    } catch (e) {
      console.warn(`[Firestore] Failed to seed admin ${u.id}:`, e);
    }
  }
  return count;
}

/**
 * Seed initial client users into `/users`
 */
export async function seedInitialStandardUsers(initialUsers: any[]): Promise<number> {
  if (!db) return 0;
  let count = 0;
  for (const u of initialUsers) {
    try {
      await setDoc(doc(db, FIRESTORE_COLLECTIONS.USERS, u.id), {
        ...u,
        isPlatformAdmin: false,
        seededAt: new Date().toISOString()
      }, { merge: true });
      count++;
    } catch (e) {
      console.warn(`[Firestore] Failed to seed user ${u.id}:`, e);
    }
  }
  return count;
}

export {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
};
