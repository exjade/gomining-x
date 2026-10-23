/**
 * Autonomous Local Authentication & Session Service
 * Provides instantaneous offline-capable user account registration, login, and session management.
 * Guarantees that MinerX works in native Electron (file://), Android APK (capacitor://),
 * and local web dev even when a remote backend server is not running or returns HTML fallback.
 */

export interface LocalUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  fullName: string;
  createdAt: string;
  sessionToken: string;
}

const STORAGE_KEY = 'minerx_local_users';
const SESSION_TOKEN_KEY = 'minerx_auth_token';
const SESSION_USER_KEY = 'minerx_auth_user';

function getStoredUsers(): LocalUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  // Initial seed with demo administrator account
  const defaultAdmin: LocalUser = {
    id: 'usr_default_admin',
    username: 'admin',
    email: 'admin@minerx.local',
    passwordHash: 'admin123',
    fullName: 'Roman (MinerX Admin)',
    createdAt: new Date().toISOString(),
    sessionToken: 'sess_init_admin'
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
    return { success: false, message: 'El nombre de usuario o correo ya está registrado.' };
  }

  const token = `sess_local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const newUser: LocalUser = {
    id: `usr_${Date.now()}`,
    username: cleanUser,
    email: cleanEmail,
    passwordHash: password,
    fullName: fullName ? fullName.trim() : cleanUser,
    createdAt: new Date().toISOString(),
    sessionToken: token
  };

  users.push(newUser);
  saveUsers(users);

  localStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify({
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
    fullName: newUser.fullName
  }));

  return {
    success: true,
    token,
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      fullName: newUser.fullName,
      createdAt: newUser.createdAt
    },
    message: 'Usuario registrado exitosamente.'
  };
}

export function loginLocalUser(usernameOrEmail: string, password: string): { success: boolean; user?: any; token?: string; message?: string } {
  const users = getStoredUsers();
  const q = usernameOrEmail.trim().toLowerCase();

  const user = users.find(
    (u) => (u.username.toLowerCase() === q || u.email.toLowerCase() === q) && u.passwordHash === password
  );

  if (!user) {
    // If no match found, check if it's the admin default
    if (q === 'admin' && password === 'admin123') {
      const token = `sess_local_${Date.now()}_admin`;
      localStorage.setItem(SESSION_TOKEN_KEY, token);
      return {
        success: true,
        token,
        user: { id: 'usr_default_admin', username: 'admin', email: 'admin@minerx.local', fullName: 'Roman (MinerX Admin)' },
        message: 'Sesión iniciada con éxito'
      };
    }
    return { success: false, message: 'Usuario o contraseña incorrectos. Verifica tus credenciales.' };
  }

  const token = `sess_local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  user.sessionToken = token;
  saveUsers(users);

  localStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName
  }));

  return {
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      createdAt: user.createdAt
    },
    message: 'Inicio de sesión exitoso.'
  };
}

export function getLocalSession(): { token: string | null; user: any | null } {
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  const rawUser = localStorage.getItem(SESSION_USER_KEY);
  let user = null;
  if (rawUser) {
    try {
      user = JSON.parse(rawUser);
    } catch {}
  }
  return { token, user };
}

export function logoutLocalSession() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}
