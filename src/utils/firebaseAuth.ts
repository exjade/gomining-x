import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
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

/**
 * MinerX Firebase Authentication Engine
 * Configured for project "minerx-telemetry-cloud"
 */

const firebaseConfig = {
  projectId: "minerx-telemetry-cloud",
  authDomain: "minerx-telemetry-cloud.firebaseapp.com",
  storageBucket: "minerx-telemetry-cloud.appspot.com",
  // Standard web client configuration for the project
  appId: "1:minerx-telemetry-cloud:web:enterprise"
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

try {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  auth = getAuth(app);
} catch (err) {
  console.warn('[MinerX Firebase] Client SDK initialization notice (fallback active):', err);
}

export { auth };

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
      message: 'Usuario registrado exitosamente en Firebase Authentication',
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
      message: 'Inicio de sesión exitoso con Firebase Authentication',
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
