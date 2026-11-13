/**
 * Shared Auth Flow & Gating Utilities (SCRUM-243 / POUW-1.7)
 * Ensures fail-closed production-like gating across AuthScreen and LandingPage.
 */

export const REGISTRATION_PENDING_ADMIN_NOTICE =
  'Cuenta creada en Firebase Authentication. Requiere autorización de administrador para acceder al panel.';

/**
 * Checks whether legacy sessionToken or local vault logins are permitted.
 * Fail-closed: returns false by default unless explicitly enabled via
 * VITE_ALLOW_DEV_LOCAL_SESSION_TOKEN=true or test runner context.
 */
export function isDevSessionAllowed(): boolean {
  try {
    const metaEnv = (import.meta as any)?.env;
    if (metaEnv?.VITE_ALLOW_DEV_LOCAL_SESSION_TOKEN === 'true') return true;
    if (metaEnv?.VITE_ALLOW_DEV_LOCAL_SESSION_TOKEN === 'false') return false;
    if (metaEnv?.MODE === 'test') return true;
  } catch {}

  try {
    const nodeEnv = (globalThis as any).process?.env;
    if (nodeEnv?.ALLOW_DEV_LOCAL_SESSION_TOKEN === 'true') return true;
    if (nodeEnv?.ALLOW_DEV_LOCAL_SESSION_TOKEN === 'false') return false;
    if (nodeEnv?.NODE_ENV === 'test' || Boolean(nodeEnv?.NODE_TEST_CONTEXT)) return true;
  } catch {}

  return false;
}

/**
 * Validates standard email address format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Maps Firebase Auth error codes and messages to clear, truthful Spanish messages.
 */
export function getFirebaseAuthErrorMessage(err: any): string {
  const code = err?.code || '';
  const msg = err?.message || '';

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    msg.includes('invalid-credential') ||
    msg.includes('user-not-found') ||
    msg.includes('wrong-password')
  ) {
    return 'Correo o contraseña incorrectos en Firebase.';
  }

  if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
    return 'El correo electrónico ya está registrado en Firebase.';
  }

  if (code === 'auth/weak-password' || msg.includes('weak-password')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }

  if (code === 'auth/invalid-email' || msg.includes('invalid-email')) {
    return 'El formato de correo no es válido.';
  }

  return msg || 'Error de autenticación en Firebase.';
}
