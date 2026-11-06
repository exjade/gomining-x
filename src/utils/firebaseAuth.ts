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
 * GoMining & MinerX Unified Firebase Engine
 * Configured for project "salad-miners"
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
 * Register a new user in Firebase Authentication
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
      message: 'Usuario registrado exitosamente en Firebase Authentication (salad-miners)',
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
 * Sign in an existing user with Firebase Authentication
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
// Direct Cloud Firestore Access Helpers for GoMining / MinerX Collections
// ============================================================================

/**
 * Fetch all registered users from `/users` in Cloud Firestore (salad-miners)
 */
export async function fetchFirestoreUsers(): Promise<DocumentData[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[Firestore] Error fetching users collection:', err);
    return [];
  }
}

/**
 * Fetch user miners from `/miners/{uid}/miner`
 */
export async function fetchFirestoreUserMiners(uid: string): Promise<DocumentData[]> {
  if (!db || !uid) return [];
  try {
    const snap = await getDocs(collection(db, 'miners', uid, 'miner'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn(`[Firestore] Error fetching miners for ${uid}:`, err);
    return [];
  }
}

/**
 * Fetch referral ledger account from `/referrals/{uid}`
 */
export async function fetchFirestoreReferralAccount(uid: string): Promise<DocumentData | null> {
  if (!db || !uid) return null;
  try {
    const snap = await getDoc(doc(db, 'referrals', uid));
    if (snap.exists()) {
      return { uid: snap.id, ...snap.data() };
    }
    return null;
  } catch (err) {
    console.warn(`[Firestore] Error fetching referral account for ${uid}:`, err);
    return null;
  }
}

/**
 * Fetch Unilevel 20-level node from `/unilevel/{uid}`
 */
export async function fetchFirestoreUnilevelNode(uid: string): Promise<DocumentData | null> {
  if (!db || !uid) return null;
  try {
    const snap = await getDoc(doc(db, 'unilevel', uid));
    if (snap.exists()) {
      return { uid: snap.id, ...snap.data() };
    }
    return null;
  } catch (err) {
    console.warn(`[Firestore] Error fetching unilevel node for ${uid}:`, err);
    return null;
  }
}

/**
 * Fetch daily profits history from `/mining_daily_profit`
 */
export async function fetchFirestoreDailyProfits(maxLimit = 50): Promise<DocumentData[]> {
  if (!db) return [];
  try {
    const q = query(collection(db, 'mining_daily_profit'), limit(maxLimit));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[Firestore] Error fetching daily profits:', err);
    return [];
  }
}

/**
 * Fetch unilevel distributions from `/unilevel_distributions`
 */
export async function fetchFirestoreUnilevelDistributions(maxLimit = 50): Promise<DocumentData[]> {
  if (!db) return [];
  try {
    const q = query(collection(db, 'unilevel_distributions'), limit(maxLimit));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[Firestore] Error fetching unilevel distributions:', err);
    return [];
  }
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
