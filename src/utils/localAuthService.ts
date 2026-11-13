/**
 * Autonomous Local Authentication & Session Service
 * Provides instantaneous offline-capable user account registration, login, and session management.
 * Guarantees that MinerX works in native Electron (file://), Android APK (capacitor://),
 * and local web dev even when a remote backend server is not running or returns HTML fallback.
 */

export interface LocalUser {
  id: string;
  firebaseAuthUid?: string | null;
  username: string;
  email: string;
  passwordHash: string;
  fullName: string;
  createdAt: string;
  sessionToken: string;
  isStoredInFirebaseAuth?: boolean;
  isPublishedToFirestore?: boolean;
}

export interface LocalAuditLog {
  id: string;
  timestamp: string;
  eventType: string;
  userId?: string;
  username?: string;
  email?: string;
  firebaseAuthUid?: string | null;
  status: string;
  details?: any;
}

const STORAGE_KEY = 'minerx_local_users';
const AUDIT_STORAGE_KEY = 'minerx_local_audit_logs';
const SESSION_TOKEN_KEY = 'minerx_auth_token';
const SESSION_USER_KEY = 'minerx_auth_user';

export function recordLocalAudit(event: Omit<LocalAuditLog, 'id' | 'timestamp'>): LocalAuditLog {
  const log: LocalAuditLog = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...event
  };
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    const logs: LocalAuditLog[] = raw ? JSON.parse(raw) : [];
    logs.unshift(log);
    if (logs.length > 200) logs.length = 200;
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
  } catch {}
  return log;
}

export function getLocalAuditLogs(): LocalAuditLog[] {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function sanitizeLocalUser(u: any): LocalUser {
  let id = typeof u.id === 'string' && u.id.trim() ? u.id.trim() : `local_user_${Date.now()}`;
  if (id === 'usr_default_admin') {
    id = 'local_dev_admin';
  } else if (!id.startsWith('local_dev_') && !id.startsWith('local_user_')) {
    id = id.startsWith('usr_') ? id.replace('usr_', 'local_user_') : `local_user_${id}`;
  }

  // Never keep synthetic fb_auth_* UIDs
  const firebaseAuthUid = typeof u.firebaseAuthUid === 'string' && !u.firebaseAuthUid.startsWith('fb_auth_')
    ? u.firebaseAuthUid
    : null;

  return {
    ...u,
    id,
    firebaseAuthUid,
    isStoredInFirebaseAuth: false,
    isPublishedToFirestore: false
  };
}

function getStoredUsers(): LocalUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(sanitizeLocalUser);
    }
  } catch {}

  // Initial seed with demo administrator account (explicit local/dev identity)
  const defaultAdmin: LocalUser = {
    id: 'local_dev_admin',
    firebaseAuthUid: null,
    username: 'admin',
    email: 'admin@minerx.local',
    passwordHash: 'admin123',
    fullName: 'Roman (MinerX Admin)',
    createdAt: new Date().toISOString(),
    sessionToken: 'sess_init_admin',
    isStoredInFirebaseAuth: false,
    isPublishedToFirestore: false
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([defaultAdmin]));
  return [defaultAdmin];
}

function saveUsers(users: LocalUser[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } catch (err) {
    console.error('Failed to save local users:', err);
  }
}

export function registerLocalUser(username: string, email: string, password: string, fullName?: string): { success: boolean; user?: any; token?: string; message?: string } {
  const users = getStoredUsers();
  const cleanUser = username.trim();
  const cleanEmail = email.trim().toLowerCase();

  const existing = users.find(
    (u) => u.username.toLowerCase() === cleanUser.toLowerCase() || u.email.toLowerCase() === cleanEmail
  );

  if (existing) {
    recordLocalAudit({
      eventType: 'AUTH_REGISTER_FAILED_DUPLICATE',
      username: cleanUser,
      email: cleanEmail,
      status: 'FAILED_DUPLICATE'
    });
    return { success: false, message: 'El nombre de usuario o correo ya está registrado.' };
  }

  const token = `sess_local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const localId = `local_user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newUser: LocalUser = {
    id: localId,
    firebaseAuthUid: null,
    username: cleanUser,
    email: cleanEmail,
    passwordHash: password,
    fullName: fullName ? fullName.trim() : cleanUser,
    createdAt: new Date().toISOString(),
    sessionToken: token,
    isStoredInFirebaseAuth: false,
    isPublishedToFirestore: false
  };

  users.push(newUser);
  saveUsers(users);

  recordLocalAudit({
    eventType: 'AUTH_REGISTER_SUCCESS',
    userId: newUser.id,
    username: newUser.username,
    email: newUser.email,
    firebaseAuthUid: null,
    status: 'SUCCESS',
    details: { isStoredInFirebaseAuth: false, isPublishedToFirestore: false, localDevOnly: true }
  });

  localStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify({
    id: newUser.id,
    firebaseAuthUid: null,
    username: newUser.username,
    email: newUser.email,
    fullName: newUser.fullName,
    isStoredInFirebaseAuth: false,
    isPublishedToFirestore: false
  }));

  return {
    success: true,
    token,
    user: {
      id: newUser.id,
      firebaseAuthUid: null,
      username: newUser.username,
      email: newUser.email,
      fullName: newUser.fullName,
      createdAt: newUser.createdAt,
      isStoredInFirebaseAuth: false,
      isPublishedToFirestore: false
    },
    message: 'Usuario registrado exitosamente en sesión local de desarrollo.'
  };
}

export function loginLocalUser(usernameOrEmail: string, password: string): { success: boolean; user?: any; token?: string; message?: string } {
  const users = getStoredUsers();
  const q = usernameOrEmail.trim().toLowerCase();

  const user = users.find(
    (u) => (u.username.toLowerCase() === q || u.email.toLowerCase() === q) && u.passwordHash === password
  );

  if (!user) {
    recordLocalAudit({
      eventType: 'AUTH_LOGIN_FAILED',
      username: usernameOrEmail,
      status: 'FAILED_INVALID_CREDENTIALS'
    });
    // If no match found, check if it's the admin default
    if (q === 'admin' && password === 'admin123') {
      const token = `sess_local_${Date.now()}_admin`;
      localStorage.setItem(SESSION_TOKEN_KEY, token);
      recordLocalAudit({
        eventType: 'AUTH_LOGIN_SUCCESS',
        userId: 'local_dev_admin',
        username: 'admin',
        email: 'admin@minerx.local',
        firebaseAuthUid: null,
        status: 'SUCCESS',
        details: { isStoredInFirebaseAuth: false, isPublishedToFirestore: false, localDevOnly: true }
      });
      return {
        success: true,
        token,
        user: {
          id: 'local_dev_admin',
          firebaseAuthUid: null,
          username: 'admin',
          email: 'admin@minerx.local',
          fullName: 'Roman (MinerX Admin)',
          isStoredInFirebaseAuth: false,
          isPublishedToFirestore: false
        },
        message: 'Sesión local de desarrollo iniciada con éxito.'
      };
    }
    return { success: false, message: 'Usuario o contraseña incorrectos. Verifica tus credenciales.' };
  }

  const token = `sess_local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  user.sessionToken = token;
  // Ensure local dev identity is truthful and never fabricates Firebase state
  if (user.firebaseAuthUid && user.firebaseAuthUid.startsWith('fb_auth_')) {
    user.firebaseAuthUid = null;
  }
  user.isStoredInFirebaseAuth = false;
  user.isPublishedToFirestore = false;
  if (!user.id.startsWith('local_dev_') && !user.id.startsWith('local_user_')) {
    user.id = user.id === 'usr_default_admin' ? 'local_dev_admin' : (user.id.startsWith('usr_') ? user.id.replace('usr_', 'local_user_') : `local_user_${user.id}`);
  }
  saveUsers(users);

  recordLocalAudit({
    eventType: 'AUTH_LOGIN_SUCCESS',
    userId: user.id,
    username: user.username,
    email: user.email,
    firebaseAuthUid: user.firebaseAuthUid || null,
    status: 'SUCCESS',
    details: { isStoredInFirebaseAuth: false, isPublishedToFirestore: false, localDevOnly: true }
  });

  localStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify({
    id: user.id,
    firebaseAuthUid: user.firebaseAuthUid || null,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    isStoredInFirebaseAuth: false,
    isPublishedToFirestore: false
  }));

  return {
    success: true,
    token,
    user: {
      id: user.id,
      firebaseAuthUid: user.firebaseAuthUid || null,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      createdAt: user.createdAt,
      isStoredInFirebaseAuth: false,
      isPublishedToFirestore: false
    },
    message: 'Inicio de sesión exitoso en sesión local de desarrollo.'
  };
}

export function auditLocalUsers() {
  const users = getStoredUsers();
  const logs = getLocalAuditLogs();
  const audited = users.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    fullName: u.fullName,
    createdAt: u.createdAt,
    firebaseAuthUid: u.firebaseAuthUid && !u.firebaseAuthUid.startsWith('fb_auth_') ? u.firebaseAuthUid : null,
    inFirestore: false,
    inFirebaseAuth: false,
    status: 'AUTH_UNAVAILABLE' as const
  }));

  const totalUsers = audited.length;
  const synchronizedCount = 0;
  const missingInAuthCount = totalUsers;

  return {
    success: true,
    timestamp: new Date().toISOString(),
    summary: {
      totalUsers,
      verifiedCount: 0,
      mismatchCount: 0,
      notFoundCount: 0,
      authUnavailableCount: totalUsers,
      synchronizedCount,
      missingInAuthCount,
      firebaseAuthOperational: false,
      firestoreOperational: false
    },
    users: audited,
    recentAuditLogs: logs
  };
}

export function repairLocalUsers() {
  const users = getStoredUsers();
  const normalized: Array<{ id: string; email: string }> = [];

  users.forEach(u => {
    let changed = false;
    if (u.firebaseAuthUid && u.firebaseAuthUid.startsWith('fb_auth_')) {
      u.firebaseAuthUid = null;
      changed = true;
    }
    if (u.isStoredInFirebaseAuth !== false) {
      u.isStoredInFirebaseAuth = false;
      changed = true;
    }
    if (u.isPublishedToFirestore !== false) {
      u.isPublishedToFirestore = false;
      changed = true;
    }
    if (!u.id.startsWith('local_dev_') && !u.id.startsWith('local_user_')) {
      u.id = u.id === 'usr_default_admin' ? 'local_dev_admin' : (u.id.startsWith('usr_') ? u.id.replace('usr_', 'local_user_') : `local_user_${u.id}`);
      changed = true;
    }
    if (changed) {
      normalized.push({ id: u.id, email: u.email });
      recordLocalAudit({
        eventType: 'AUDIT_LOCAL_REPAIR',
        userId: u.id,
        username: u.username,
        email: u.email,
        firebaseAuthUid: null,
        status: 'LOCAL_DEV_NORMALIZED',
        details: { isStoredInFirebaseAuth: false, isPublishedToFirestore: false, localDevOnly: true }
      });
    }
  });

  if (normalized.length > 0) {
    saveUsers(users);
  }

  return {
    success: true,
    message: `Auditoría local finalizada: ${normalized.length} registros locales normalizados. Modo local de desarrollo (sin sincronización con Firebase Authentication).`,
    repairedCount: 0,
    repairedUsers: []
  };
}

export function getLocalSession(): { token: string | null; user: any | null } {
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  const rawUser = localStorage.getItem(SESSION_USER_KEY);
  let user = null;
  if (rawUser) {
    try {
      const parsed = JSON.parse(rawUser);
      if (parsed) {
        user = sanitizeLocalUser(parsed);
      }
    } catch {}
  }
  return { token, user };
}

export function logoutLocalSession() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}
