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
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAjqJ1D3f5jA-Xgj_79PTbYCtA8CyFqLGk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "salad-miners.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "salad-miners",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "salad-miners.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "402055553257",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:402055553257:web:bfd9ebd33083e3f54f1078"
};

let app: FirebaseApp;
let auth: Auth | null = null;
let db: Firestore | null = null;

try {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (err) {
  console.warn('[MinerX Firebase] Client SDK initialization notice (fallback active):', err);
  // @ts-expect-error fallback
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
// ISOLATED ADMIN CLOUD FIRESTORE COLLECTIONS (/admin_*)
// Guarantees zero pollution or tampering of client-facing GoMining collections.
// ============================================================================

export const ADMIN_COLLECTIONS = {
  USERS: 'admin_users',
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
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[Firestore] Error fetching isolated admin_users:', err);
    return [];
  }
}

/**
 * Save or update an admin user in isolated `/admin_users/{id}`
 */
export async function saveFirestoreAdminUser(user: Record<string, any>): Promise<boolean> {
  if (!db || !user.id) return false;
  try {
    const docRef = doc(db, ADMIN_COLLECTIONS.USERS, user.id);
    await setDoc(docRef, {
      ...user,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error(`[Firestore] Error saving admin user ${user.id}:`, err);
    return false;
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
      console.warn(`[Firestore] Failed to seed ${u.id}:`, e);
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
  query,
  where,
  orderBy,
  limit,
  onSnapshot
};
