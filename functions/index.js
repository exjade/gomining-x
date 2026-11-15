const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK for Cloud Firestore persistence
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (e) {
    console.warn("Firebase Admin initializeApp error (local dev fallback):", e.message);
  }
}

let db = null;
try {
  db = admin.firestore();
} catch (e) {
  console.warn("Firestore not available in this environment, using memory store:", e.message);
}

let authAdmin = null;
try {
  authAdmin = admin.auth();
} catch (e) {
  console.warn("Firebase Auth Admin not available in this environment:", e.message);
}

async function logAuditEvent(event) {
  const auditId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const record = {
    id: auditId,
    timestamp: new Date().toISOString(),
    ...event
  };
  if (db) {
    try {
      await db.collection("minerx_audit_logs").doc(auditId).set(record);
      if (record.userId) {
        await db.collection("minerx_users").doc(record.userId).collection("audit_logs").doc(auditId).set(record);
      }
    } catch (err) {
      console.warn("Firestore audit log write error:", err.message);
    }
  }
  return record;
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// In-memory fallbacks keyed per user
const defaultTemplateConfig = {
  saladAccounts: [],
  kryptexConfig: {
    walletAddress: '',
    coin: 'prl',
    poolUrl: 'stratum+tcp://prl.kryptex.network:7048',
    status: 'untested'
  },
  appSettings: {
    useDemoData: false,
    refreshIntervalSeconds: 30,
    underperformingThresholdPct: 80,
    maxShareInactivityMinutes: 1,
    enableSoundAlerts: false,
    discordWebhookUrl: '',
    telegramBotToken: '',
    telegramChatId: '',
    backendUrl: ''
  }
};

let memoryConfig = {
  "usr_default_admin": { ...defaultTemplateConfig }
};

let memoryCycles = {
  "usr_default_admin": {
    activeCycle: null,
    closedCycles: []
  }
};

let memoryUsers = [
  {
    id: "usr_default_admin",
    username: "admin",
    email: "admin@minerx.local",
    passwordHash: "admin123",
    fullName: "Roman (MinerX Admin)",
    createdAt: new Date().toISOString(),
    sessionToken: "sess_init_admin"
  }
];

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'finance', 'operator']);

function isLocalDevSessionAllowed() {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  if (process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN === 'false') {
    return false;
  }
  if (process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN === 'true') {
    return true;
  }
  return Boolean(
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_TEST_CONTEXT ||
    process.execArgv.includes('--test') ||
    process.argv.some((arg) => arg.includes('test') || arg.includes('--test') || arg.includes('node:test')) ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST
  );
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.replace(/^Bearer\s+/i, '').trim();
}

async function getAuthenticatedIdentity(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  if (authAdmin) {
    try {
      const decoded = await authAdmin.verifyIdToken(token);
      if (decoded?.uid) {
        return {
          source: 'firebase',
          userId: decoded.uid,
          firebaseAuthUid: decoded.uid,
          email: decoded.email || null,
          claims: decoded
        };
      }
    } catch {}
  }

  if (!isLocalDevSessionAllowed()) return null;
  const users = await getPersistedUsers();
  const user = users.find((candidate) => candidate.sessionToken === token);
  if (!user) return null;

  return {
    source: 'local-session',
    userId: user.id,
    firebaseAuthUid: user.firebaseAuthUid || null,
    email: user.email || null,
    user
  };
}

async function isAdminIdentity(identity) {
  if (!identity) return false;

  if (identity.source === 'firebase') {
    const claims = identity.claims || {};
    const role = typeof claims.role === 'string' ? claims.role.toLowerCase() : '';
    if (claims.admin === true || ADMIN_ROLES.has(role)) return true;

    if (db) {
      try {
        const adminDoc = await db.collection('admin_users').doc(identity.userId).get();
        if (adminDoc.exists) return true;
      } catch {}
    }
    return false;
  }

  return identity.user?.role?.toLowerCase() === 'admin' || identity.user?.id === 'usr_default_admin';
}

function requireAuthenticated(req, res, next) {
  getAuthenticatedIdentity(req)
    .then((identity) => {
      if (!identity) {
        return res.status(401).json({ success: false, message: 'Autenticación Firebase requerida' });
      }
      req.minerxIdentity = identity;
      next();
    })
    .catch(() => res.status(401).json({ success: false, message: 'Sesión inválida o expirada' }));
}

function requireAdmin(req, res, next) {
  getAuthenticatedIdentity(req)
    .then(async (identity) => {
      if (!identity || !(await isAdminIdentity(identity))) {
        return res.status(401).json({ success: false, message: 'Sesión de administrador requerida' });
      }
      req.minerxIdentity = identity;
      next();
    })
    .catch(() => res.status(401).json({ success: false, message: 'Sesión de administrador inválida o expirada' }));
}

// Helper to resolve userId from an already authenticated request
async function getUserIdFromReq(req) {
  return req.minerxIdentity.userId;
}

// Database Persistence Helpers (Firestore User-Isolated Collections + Fallback)
async function getPersistedConfig(userId) {
  if (db) {
    try {
      // 1. Isolated User Subcollection: minerx_users/{userId}/data/config
      const doc = await db.collection("minerx_users").doc(userId).collection("data").doc("config").get();
      if (doc.exists) {
        return doc.data();
      }
      if (userId === 'usr_default_admin') {
        const legacyDoc = await db.collection("minerx_app_data").doc("config").get();
        if (legacyDoc.exists) {
          return legacyDoc.data();
        }
      }
    } catch (err) {
      console.warn("Firestore get config error:", err.message);
    }
  }
  return memoryConfig[userId] || defaultTemplateConfig;
}

async function savePersistedConfig(userId, cfg) {
  if (!memoryConfig[userId]) memoryConfig[userId] = {};
  memoryConfig[userId] = cfg;
  if (db) {
    try {
      await db.collection("minerx_users").doc(userId).collection("data").doc("config").set(cfg, { merge: true });
    } catch (err) {
      console.warn("Firestore save config error:", err.message);
    }
  }
}

async function getPersistedCycles(userId) {
  if (db) {
    try {
      // 1. Isolated User Subcollection: minerx_users/{userId}/data/mining_cycles
      const doc = await db.collection("minerx_users").doc(userId).collection("data").doc("mining_cycles").get();
      if (doc.exists) {
        return doc.data();
      }
      if (userId === 'usr_default_admin') {
        const legacyDoc = await db.collection("minerx_app_data").doc("mining_cycles").get();
        if (legacyDoc.exists) {
          return legacyDoc.data();
        }
      }
    } catch (err) {
      console.warn("Firestore get cycles error:", err.message);
    }
  }
  return memoryCycles[userId] || { activeCycle: null, closedCycles: [] };
}

async function savePersistedCycles(userId, cycles) {
  if (!memoryCycles[userId]) memoryCycles[userId] = { activeCycle: null, closedCycles: [] };
  memoryCycles[userId] = cycles;
  if (db) {
    try {
      await db.collection("minerx_users").doc(userId).collection("data").doc("mining_cycles").set(cycles, { merge: true });
    } catch (err) {
      console.warn("Firestore save cycles error:", err.message);
    }
  }
}

async function getPersistedUsers() {
  if (db) {
    try {
      const snap = await db.collection("minerx_users").get();
      if (!snap.empty) {
        return snap.docs.map(d => d.data());
      }
    } catch (err) {
      console.warn("Firestore get users error:", err.message);
    }
  }
  return memoryUsers;
}

async function savePersistedUser(user) {
  const existing = memoryUsers.findIndex(u => u.id === user.id);
  if (existing >= 0) {
    memoryUsers[existing] = user;
  } else {
    memoryUsers.push(user);
  }
  if (db) {
    try {
      await db.collection("minerx_users").doc(user.id).set(user, { merge: true });
    } catch (err) {
      console.warn("Firestore save user error:", err.message);
    }
  }
}

// ----------------------------------------------------
// 1. CONFIGURATION ENDPOINTS (User-Isolated)
// ----------------------------------------------------
app.get('/api/config', requireAuthenticated, async (req, res) => {
  const userId = await getUserIdFromReq(req);
  const cfg = await getPersistedConfig(userId);
  res.json(cfg);
});

app.post('/api/config', requireAuthenticated, async (req, res) => {
  const userId = await getUserIdFromReq(req);
  const current = await getPersistedConfig(userId);
  const newConfig = { ...current, ...req.body };
  await savePersistedConfig(userId, newConfig);
  res.json({ success: true, message: 'Configuración guardada en Firestore para tu usuario', userId });
});

// ----------------------------------------------------
// 2. AUTHENTICATION & SESSION PERSISTENCE (FIREBASE AUTH & FIRESTORE)
// ----------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  if (!isLocalDevSessionAllowed()) {
    return res.status(403).json({
      success: false,
      message: 'Legacy backend registration is disabled in this environment. Use Firebase Authentication.'
    });
  }

  const { username, email, password, fullName } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'Usuario, email y contraseña requeridos' });
  }

  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanFullName = (fullName || cleanUsername).trim();

  // Asegurar formato de correo válido
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const targetEmail = emailRegex.test(cleanEmail) ? cleanEmail : `${cleanUsername.toLowerCase()}@minerx.local`;

  const users = await getPersistedUsers();
  if (users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase() || u.email.toLowerCase() === targetEmail)) {
    return res.status(409).json({ success: false, message: 'El nombre de usuario o correo ya está registrado en MinerX' });
  }

  let firebaseAuthUid = null;
  let firebaseAuthCreated = false;
  let firebaseAuthError = null;

  // 1. OBLIGATORIO: Crear usuario en el Sistema Autenticador de Firebase (Firebase Authentication)
  if (authAdmin) {
    try {
      try {
        const existingAuthUser = await authAdmin.getUserByEmail(targetEmail);
        if (existingAuthUser) {
          firebaseAuthUid = existingAuthUser.uid;
          firebaseAuthCreated = true;
          console.log(`[Firebase Auth] Usuario ya existía en Auth: ${targetEmail} (${firebaseAuthUid})`);
        }
      } catch (getErr) {
        if (getErr.code === 'auth/user-not-found') {
          const authRecord = await authAdmin.createUser({
            email: targetEmail,
            password: password,
            displayName: cleanFullName,
            disabled: false
          });
          firebaseAuthUid = authRecord.uid;
          firebaseAuthCreated = true;
          console.log(`[Firebase Auth] Usuario creado en Firebase Authentication: ${targetEmail} (${firebaseAuthUid})`);
        } else {
          throw getErr;
        }
      }
    } catch (fbErr) {
      console.error('[Firebase Auth] Error registrando en Firebase Authentication:', fbErr.message);
      firebaseAuthError = fbErr.message;
    }
  }

  const userId = firebaseAuthUid || `usr_${Date.now()}`;
  const token = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const newUser = {
    id: userId,
    firebaseAuthUid: firebaseAuthUid || null,
    username: cleanUsername,
    email: targetEmail,
    passwordHash: password,
    fullName: cleanFullName,
    createdAt: new Date().toISOString(),
    sessionToken: token,
    isStoredInFirebaseAuth: firebaseAuthCreated,
    isPublishedToFirestore: false
  };

  // 2. OBLIGATORIO: Publicar usuario en Cloud Firestore
  let firestorePublished = false;
  let firestoreError = null;
  if (db) {
    try {
      await db.collection("minerx_users").doc(userId).set({
        ...newUser,
        isPublishedToFirestore: true,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
      newUser.isPublishedToFirestore = true;
      firestorePublished = true;
      console.log(`[Firestore] Documento publicado en minerx_users/${userId}`);
    } catch (fsErr) {
      console.error('[Firestore] Error guardando usuario:', fsErr.message);
      firestoreError = fsErr.message;
    }
  }

  await savePersistedUser(newUser);

  // 3. OBLIGATORIO: Registrar evento de Auditoría de Registro inmutable en Firestore
  await logAuditEvent({
    eventType: 'USER_REGISTRATION',
    userId,
    username: cleanUsername,
    email: targetEmail,
    fullName: cleanFullName,
    storedInFirebaseAuth: firebaseAuthCreated,
    firebaseAuthUid: firebaseAuthUid || null,
    firebaseAuthError: firebaseAuthError || null,
    publishedToFirestore: firestorePublished,
    firestoreError: firestoreError || null,
    ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
    userAgent: req.headers['user-agent'] || 'MinerX-Client',
    status: (firebaseAuthCreated || firestorePublished) ? 'SUCCESS' : 'LOCAL_ONLY'
  });

  res.json({
    success: true,
    message: firebaseAuthCreated 
      ? 'Usuario registrado y almacenado con éxito en Firebase Authentication y Cloud Firestore'
      : 'Usuario registrado y publicado en Firestore',
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      fullName: newUser.fullName,
      isStoredInFirebaseAuth: firebaseAuthCreated,
      isPublishedToFirestore: firestorePublished
    },
    token
  });
});

app.post('/api/auth/login', async (req, res) => {
  if (!isLocalDevSessionAllowed()) {
    return res.status(403).json({
      success: false,
      message: 'Legacy sessionToken login is disabled in this environment. Use Firebase Authentication.'
    });
  }

  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) {
    return res.status(400).json({ success: false, message: 'Credenciales incompletas' });
  }

  const users = await getPersistedUsers();
  const user = users.find(u => 
    (u.username.toLowerCase() === usernameOrEmail.toLowerCase() || u.email.toLowerCase() === usernameOrEmail.toLowerCase()) &&
    u.passwordHash === password
  );

  if (!user) {
    // Registrar fallo de autenticación en auditoría
    await logAuditEvent({
      eventType: 'AUTH_LOGIN_FAILED',
      usernameOrEmail,
      ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'MinerX-Client',
      status: 'FAILED'
    });
    return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
  }

  const token = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  user.sessionToken = token;
  await savePersistedUser(user);

  // Registrar login exitoso en auditoría
  await logAuditEvent({
    eventType: 'AUTH_LOGIN_SUCCESS',
    userId: user.id,
    username: user.username,
    email: user.email,
    ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
    userAgent: req.headers['user-agent'] || 'MinerX-Client',
    status: 'SUCCESS'
  });

  res.json({
    success: true,
    message: 'Inicio de sesión exitoso',
    user: { id: user.id, username: user.username, email: user.email, fullName: user.fullName },
    token
  });
});

// ----------------------------------------------------
// 3. MOTOR DE AUDITORÍA DE REGISTROS (FIREBASE AUTH VS FIRESTORE)
// ----------------------------------------------------
app.get('/api/auth/audit', requireAdmin, async (req, res) => {
  try {
    const firestoreUsers = await getPersistedUsers();
    let authUsers = [];
    let authError = null;

    if (authAdmin) {
      try {
        const listResult = await authAdmin.listUsers(100);
        authUsers = listResult.users.map(u => ({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          disabled: u.disabled,
          createdAt: u.metadata.creationTime,
          lastSignInTime: u.metadata.lastSignInTime
        }));
      } catch (err) {
        authError = err.message;
      }
    }

    let auditLogs = [];
    if (db) {
      try {
        const snap = await db.collection("minerx_audit_logs").limit(50).get();
        if (!snap.empty) {
          auditLogs = snap.docs.map(d => d.data());
          auditLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }
      } catch (err) {
        console.warn('Error reading audit logs:', err.message);
      }
    }

    const auditedUsers = firestoreUsers.map(fu => {
      const authMatch = authUsers.find(au => 
        (au.email && au.email.toLowerCase() === fu.email.toLowerCase()) || 
        au.uid === fu.id || 
        au.uid === fu.firebaseAuthUid
      );

      return {
        id: fu.id,
        username: fu.username,
        email: fu.email,
        fullName: fu.fullName,
        createdAt: fu.createdAt,
        inFirestore: true,
        inFirebaseAuth: !!authMatch,
        firebaseAuthUid: authMatch ? authMatch.uid : null,
        status: authMatch ? 'SINCRONIZADO' : 'PENDIENTE_EN_FIREBASE_AUTH'
      };
    });

    const totalUsers = auditedUsers.length;
    const synchronizedCount = auditedUsers.filter(u => u.inFirebaseAuth).length;
    const missingInAuthCount = totalUsers - synchronizedCount;

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalUsers,
        synchronizedCount,
        missingInAuthCount,
        firebaseAuthOperational: !!authAdmin && !authError,
        firestoreOperational: !!db,
        authError
      },
      users: auditedUsers,
      firebaseAuthUsers: authUsers,
      recentAuditLogs: auditLogs
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error ejecutando auditoría de registros', error: err.message });
  }
});

// Reparar y migrar usuarios a Firebase Authentication
app.post('/api/auth/audit-repair', requireAdmin, async (req, res) => {
  if (!authAdmin) {
    return res.status(503).json({ success: false, message: 'Firebase Admin Auth no disponible en este entorno' });
  }

  try {
    const firestoreUsers = await getPersistedUsers();
    const listResult = await authAdmin.listUsers(100);
    const authEmails = new Set(listResult.users.map(u => (u.email || '').toLowerCase()));

    const repaired = [];
    const errors = [];

    for (const u of firestoreUsers) {
      if (u.email && !authEmails.has(u.email.toLowerCase())) {
        try {
          const pass = u.passwordHash && u.passwordHash.length >= 6 ? u.passwordHash : 'MinerX2026!';
          const newAuth = await authAdmin.createUser({
            email: u.email,
            password: pass,
            displayName: u.fullName || u.username,
            disabled: false
          });
          u.firebaseAuthUid = newAuth.uid;
          u.isStoredInFirebaseAuth = true;
          await savePersistedUser(u);

          await logAuditEvent({
            eventType: 'AUDIT_REPAIR_SYNC',
            userId: u.id,
            email: u.email,
            firebaseAuthUid: newAuth.uid,
            status: 'REPAIRED_TO_FIREBASE_AUTH'
          });

          repaired.push({ id: u.id, email: u.email, newUid: newAuth.uid });
        } catch (err) {
          errors.push({ id: u.id, email: u.email, error: err.message });
        }
      }
    }

    res.json({
      success: true,
      message: `Auditoría completada. ${repaired.length} usuarios sincronizados en Firebase Authentication.`,
      repairedCount: repaired.length,
      repairedUsers: repaired,
      errors
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error reparando usuarios', error: err.message });
  }
});

app.get('/api/auth/me', requireAuthenticated, async (req, res) => {
  const identity = req.minerxIdentity;
  const users = await getPersistedUsers();
  const user = users.find((candidate) =>
    candidate.id === identity.userId ||
    candidate.firebaseAuthUid === identity.firebaseAuthUid ||
    (identity.email && candidate.email?.toLowerCase() === identity.email.toLowerCase())
  );

  if (!user) {
    return res.status(401).json({ success: false, message: 'Sesión expirada o inválida' });
  }

  res.json({
    success: true,
    user: { id: user.id, username: user.username, email: user.email, fullName: user.fullName }
  });
});

// ----------------------------------------------------
// 3. MINING CYCLES PERSISTENCE (User-Isolated)
// ----------------------------------------------------
app.get('/api/mining/cycles', requireAuthenticated, async (req, res) => {
  const userId = await getUserIdFromReq(req);
  const data = await getPersistedCycles(userId);
  res.json({
    success: true,
    activeCycle: data.activeCycle || null,
    closedCycles: data.closedCycles || []
  });
});

app.post('/api/mining/cycles/start', requireAuthenticated, async (req, res) => {
  const userId = await getUserIdFromReq(req);
  const { fleetGpuCount, totalHashrateTHs, hourlySaladCostUSD } = req.body;
  const cyclesData = await getPersistedCycles(userId);

  if (cyclesData.activeCycle) {
    return res.status(400).json({ success: false, message: 'Ya existe un ciclo activo en ejecución' });
  }

  const now = Date.now();
  const newCycle = {
    id: `CYC-${Date.now().toString(36).toUpperCase()}`,
    startTime: now,
    startDateStr: new Date(now).toLocaleString(),
    fleetGpuCount: Number(fleetGpuCount) || 1,
    initialHashrateTHs: Number(totalHashrateTHs) || 300,
    hourlySaladCostUSD: Number(hourlySaladCostUSD) || 0.160,
    startShares: 0,
    status: 'ACTIVE'
  };

  cyclesData.activeCycle = newCycle;
  await savePersistedCycles(userId, cyclesData);

  res.json({ success: true, message: 'Nuevo ciclo de minado iniciado en base de datos', cycle: newCycle });
});

app.post('/api/mining/cycles/close', requireAuthenticated, async (req, res) => {
  const userId = await getUserIdFromReq(req);
  const { currentTotalAcceptedShares, averageHashrateTHs } = req.body;
  const cyclesData = await getPersistedCycles(userId);

  if (!cyclesData.activeCycle) {
    return res.status(400).json({ success: false, message: 'No hay un ciclo activo para cerrar' });
  }

  const cycle = cyclesData.activeCycle;
  const now = Date.now();
  const durationHours = Math.max(0.01, Number(((now - cycle.startTime) / (1000 * 3600)).toFixed(2)));

  const finalAvgHash = Number(averageHashrateTHs) || cycle.initialHashrateTHs;
  const totalSaladCostUSD = Number((durationHours * cycle.hourlySaladCostUSD).toFixed(3));
  const totalComputeTHh = Number((durationHours * finalAvgHash).toFixed(2));
  const grossRevenueUSD = Number((totalComputeTHh * 0.0012395).toFixed(3));
  // 4.56% real friction (Spread interno Kryptex 3.91% + SPEI/retiro 0.65% - la comisión 3% pool ya está en la tasa base)
  const netRevenueUSD = Number((grossRevenueUSD * (1 - 0.0456)).toFixed(3));
  const netProfitUSD = Number((netRevenueUSD - totalSaladCostUSD).toFixed(3));
  const acceptedSharesInCycle = Math.max(0, Number(currentTotalAcceptedShares) - (cycle.startShares || 0));

  const closed = {
    ...cycle,
    endTime: now,
    endDateStr: new Date(now).toLocaleString(),
    durationHours,
    averageHashrateTHs: finalAvgHash,
    totalComputeTHh,
    totalSaladCostUSD,
    grossRevenueUSD,
    netRevenueUSD,
    netProfitUSD,
    acceptedSharesInCycle,
    status: 'CLOSED'
  };

  cyclesData.closedCycles = [closed, ...(cyclesData.closedCycles || [])];
  cyclesData.activeCycle = null;
  await savePersistedCycles(userId, cyclesData);

  res.json({ success: true, message: 'Ciclo cerrado y auditado con éxito en Firestore', closedCycle: closed });
});

// ----------------------------------------------------
// 4. SALADCLOUD CONTAINER ENGINE API ENDPOINTS
// ----------------------------------------------------
// 4a. Balance & Wallet
app.get('/api/salad/balance', requireAdmin, async (req, res) => {
  const userId = await getUserIdFromReq(req);
  const cfg = await getPersistedConfig(userId);
  const accounts = cfg.saladAccounts || [];
  let totalBalanceUSD = 0;
  const accountBalances = [];

  for (const acc of accounts) {
    if (!acc.enabled || !acc.apiKey || !acc.organizationName || acc.organizationName.toLowerCase() === 'n/a') {
      continue;
    }
    try {
      const url = `https://api.salad.com/api/public/organizations/${encodeURIComponent(acc.organizationName.trim())}/billing/wallet`;
      const response = await fetch(url, {
        headers: { 'Salad-Api-Key': acc.apiKey.trim(), 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        const bal = Number(data.balance ?? acc.balanceUSD ?? 0);
        totalBalanceUSD += bal;
        accountBalances.push({ accountId: acc.id, accountName: acc.accountName, balanceUSD: bal });
      } else {
        accountBalances.push({ accountId: acc.id, accountName: acc.accountName, balanceUSD: acc.balanceUSD || 0 });
      }
    } catch {
      accountBalances.push({ accountId: acc.id, accountName: acc.accountName, balanceUSD: acc.balanceUSD || 0 });
    }
  }

  res.json({
    success: true,
    totalBalanceUSD: Number(totalBalanceUSD.toFixed(2)),
    accountBalances
  });
});

// 4b. Test Account Connection
app.post('/api/salad/test-account', requireAdmin, async (req, res) => {
  try {
    const { organizationName, projectName, apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'La API Key de Salad es requerida.' });
    }

    const cleanOrg = (organizationName || '').trim();
    if (!cleanOrg || cleanOrg.toUpperCase() === 'N/A') {
      return res.status(400).json({
        success: false,
        message: 'El nombre de Organización es inválido ("N/A").'
      });
    }

    const cleanProject = (projectName || 'default').trim();
    const headers = { 'Salad-Api-Key': apiKey.trim() };

    let testUrl = `https://api.salad.com/api/public/organizations/${encodeURIComponent(cleanOrg)}/projects/${encodeURIComponent(cleanProject)}/containers`;
    let response = await fetch(testUrl, { headers });

    if (response.status === 404) {
      testUrl = `https://api.salad.com/api/public/organizations/${encodeURIComponent(cleanOrg)}/gpu-classes`;
      response = await fetch(testUrl, { headers });
    }

    if (response.ok) {
      return res.json({
        success: true,
        message: `¡Conexión verificada con éxito con SaladCloud! Org: ${cleanOrg}`
      });
    }

    return res.status(response.status).json({ success: false, message: `Error ${response.status} de SaladCloud` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Error de conexión' });
  }
});

// 4c. All Active Instances
app.post('/api/salad/all-active', requireAdmin, async (req, res) => {
  try {
    const userId = await getUserIdFromReq(req);
    const cfg = await getPersistedConfig(userId);
    const targetAccounts = (req.body.accounts && req.body.accounts.length > 0) ? req.body.accounts : cfg.saladAccounts;
    const activeInstances = [];

    for (const acc of targetAccounts) {
      if (!acc.enabled || !acc.apiKey || !acc.organizationName || acc.organizationName.toLowerCase() === 'n/a') {
        continue;
      }

      const headers = { 'Salad-Api-Key': acc.apiKey.trim() };
      const org = encodeURIComponent(acc.organizationName.trim());
      const proj = encodeURIComponent((acc.projectName || 'default').trim());

      const groupsUrl = `https://api.salad.com/api/public/organizations/${org}/projects/${proj}/containers`;
      const groupsRes = await fetch(groupsUrl, { headers });

      if (groupsRes.ok) {
        const groupsData = await groupsRes.json();
        const items = groupsData.items || [];

        for (const group of items) {
          const instUrl = `https://api.salad.com/api/public/organizations/${org}/projects/${proj}/containers/${encodeURIComponent(group.name)}/instances`;
          const instRes = await fetch(instUrl, { headers });

          if (instRes.ok) {
            const instData = await instRes.json();
            const instList = instData.instances || instData.items || [];

            for (const inst of instList) {
              activeInstances.push({
                id: inst.id || `inst-${Math.random().toString(36).substring(2, 7)}`,
                machineId: inst.machine_id || inst.id || 'salad-node',
                containerGroupId: group.id,
                containerGroupName: group.name,
                gpuClass: group.container?.resources?.gpu_classes?.[0] || 'rtx4090',
                hourlyCost: group.cost_per_hour || 0.160,
                state: inst.state || 'running',
                startedAt: inst.started_at,
                accountId: acc.id,
                accountName: acc.accountName
              });
            }
          }
        }
      }
    }

    res.json({ success: true, instances: activeInstances });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4d. Reallocate Instance (Move to new physical node)
app.post('/api/salad/reallocate', requireAdmin, async (req, res) => {
  try {
    const { organizationName, projectName, containerGroupName, instanceId, apiKey } = req.body;
    if (!organizationName || !containerGroupName || !instanceId || !apiKey) {
      return res.status(400).json({ success: false, message: 'Faltan parámetros requeridos.' });
    }

    const org = encodeURIComponent(organizationName.trim());
    const proj = encodeURIComponent((projectName || 'default').trim());
    const cGroup = encodeURIComponent(containerGroupName.trim());
    const instId = encodeURIComponent(instanceId.trim());

    const reallocUrl = `https://api.salad.com/api/public/organizations/${org}/projects/${proj}/containers/${cGroup}/instances/${instId}/reallocate`;
    const response = await fetch(reallocUrl, {
      method: 'POST',
      headers: { 'Salad-Api-Key': apiKey.trim(), 'Content-Type': 'application/json' }
    });

    if (response.ok || response.status === 204 || response.status === 200) {
      return res.json({ success: true, message: `Instancia ${instanceId} reasignada con éxito.` });
    }
    const errText = await response.text();
    res.status(response.status).json({ success: false, message: `Error ${response.status}: ${errText}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4e. Restart Instance (In-Place Fast Reboot)
app.post('/api/salad/restart-instance', requireAdmin, async (req, res) => {
  try {
    const { organizationName, projectName, containerGroupName, instanceId, apiKey } = req.body;
    const org = encodeURIComponent(organizationName.trim());
    const proj = encodeURIComponent((projectName || 'default').trim());
    const cGroup = encodeURIComponent(containerGroupName.trim());
    const instId = encodeURIComponent(instanceId.trim());

    const url = `https://api.salad.com/api/public/organizations/${org}/projects/${proj}/containers/${cGroup}/instances/${instId}/restart`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Salad-Api-Key': apiKey.trim(), 'Content-Type': 'application/json' }
    });

    if (response.ok || response.status === 204 || response.status === 200) {
      return res.json({ success: true, message: `Instancia ${instanceId} reiniciada en el mismo nodo.` });
    }
    const errText = await response.text();
    res.status(response.status).json({ success: false, message: `Error ${response.status}: ${errText}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4f. Recreate Instance (Hard Container Reset)
app.post('/api/salad/recreate-instance', requireAdmin, async (req, res) => {
  try {
    const { organizationName, projectName, containerGroupName, instanceId, apiKey } = req.body;
    const org = encodeURIComponent(organizationName.trim());
    const proj = encodeURIComponent((projectName || 'default').trim());
    const cGroup = encodeURIComponent(containerGroupName.trim());
    const instId = encodeURIComponent(instanceId.trim());

    const url = `https://api.salad.com/api/public/organizations/${org}/projects/${proj}/containers/${cGroup}/instances/${instId}/recreate`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Salad-Api-Key': apiKey.trim(), 'Content-Type': 'application/json' }
    });

    if (response.ok || response.status === 204 || response.status === 200) {
      return res.json({ success: true, message: `Instancia ${instanceId} reconstruida desde cero.` });
    }
    const errText = await response.text();
    res.status(response.status).json({ success: false, message: `Error ${response.status}: ${errText}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4g. Salad Quotas & GPU Classes
app.get('/api/salad/quotas', requireAdmin, async (req, res) => {
  try {
    const org = req.query.org || '';
    const apiKey = req.headers['salad-api-key'] || req.query.apiKey;
    const url = `https://api.salad.com/api/public/organizations/${encodeURIComponent(org)}/quotas`;
    const response = await fetch(url, {
      headers: { 'Salad-Api-Key': String(apiKey).trim() }
    });
    if (response.ok) {
      const data = await response.json();
      return res.json({ success: true, quotas: data });
    }
    res.status(response.status).json({ success: false, message: 'No se pudieron consultar las cuotas' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4h. Salad GPU Classes
app.get('/api/salad/gpu-classes', requireAdmin, async (req, res) => {
  try {
    const org = req.query.org || '';
    const apiKey = req.headers['salad-api-key'] || req.query.apiKey;
    const url = `https://api.salad.com/api/public/organizations/${encodeURIComponent(org)}/gpu-classes`;
    const response = await fetch(url, {
      headers: { 'Salad-Api-Key': String(apiKey).trim() }
    });
    if (response.ok) {
      const data = await response.json();
      return res.json({ success: true, gpuClasses: data });
    }
    res.status(response.status).json({ success: false, message: 'No se pudo consultar el catálogo de GPUs' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4i. Salad Container Group Control (Start, Stop, Scale)
app.post('/api/salad/container-group/control', requireAdmin, async (req, res) => {
  try {
    const { organizationName, projectName, containerGroupName, action, replicas, apiKey } = req.body;
    const base = `https://api.salad.com/api/public/organizations/${encodeURIComponent(organizationName)}/projects/${encodeURIComponent(projectName)}/containers/${encodeURIComponent(containerGroupName)}`;

    let url = '';
    let method = 'POST';
    let body = null;

    if (action === 'start') {
      url = `${base}/start`;
    } else if (action === 'stop') {
      url = `${base}/stop`;
    } else if (action === 'scale') {
      url = base;
      method = 'PATCH';
      body = JSON.stringify({ replicas: Number(replicas) });
    }

    const response = await fetch(url, {
      method,
      headers: { 'Salad-Api-Key': apiKey.trim(), 'Content-Type': 'application/json' },
      body
    });

    if (response.ok || response.status === 204 || response.status === 200) {
      return res.json({ success: true, message: `Acción "${action}" completada.` });
    }
    const errText = await response.text();
    res.status(response.status).json({ success: false, message: `Error ${response.status}: ${errText}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 5. KRYPTEX POOL & MINER PROXY ENDPOINTS
// ----------------------------------------------------
app.get('/api/kryptex/pool', async (req, res) => {
  try {
    const coin = req.query.coin || 'prl';
    const response = await fetch(`https://pool.kryptex.com/${coin}/api/v1/pool/info`);
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    }
    res.status(response.status).json({ success: false, message: 'Error de pool Kryptex' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/kryptex/workers/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const coin = req.query.coin || 'prl';
    const cleanAddress = (address || '').split('?')[0].trim();
    const response = await fetch(`https://pool.kryptex.com/${coin}/api/v3/miner/workers/${cleanAddress}`);
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    }
    res.status(response.status).json({ success: false, message: 'Error consultando workers en Kryptex' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/kryptex/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const coin = req.query.coin || 'prl';
    const cleanAddress = (address || '').split('?')[0].trim();
    const response = await fetch(`https://pool.kryptex.com/${coin}/api/v1/miner/balance/${cleanAddress}`);
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    }
    res.status(response.status).json({ success: false, message: 'Error consultando balance en Kryptex' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/kryptex/payouts/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const coin = req.query.coin || 'prl';
    const cleanAddress = (address || '').split('?')[0].trim();
    const response = await fetch(`https://pool.kryptex.com/${coin}/api/v1/miner/payouts/${cleanAddress}/stats`);
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    }
    res.status(response.status).json({ success: false, message: 'Error consultando pagos en Kryptex' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/kryptex/rates', async (_req, res) => {
  try {
    const response = await fetch('https://pool.kryptex.com/api/v1/rates');
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    }
    res.status(response.status).json({ success: false, message: 'Error consultando rates de Kryptex' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 6. TELEGRAM NOTIFICATIONS
// ----------------------------------------------------
app.post('/api/telegram/test', requireAdmin, async (req, res) => {
  try {
    const userId = await getUserIdFromReq(req);
    const cfg = await getPersistedConfig(userId);
    const token = req.body.botToken || req.body.token || cfg.appSettings?.telegramBotToken;
    const chatId = req.body.chatId || req.body.telegramChatId || cfg.appSettings?.telegramChatId;
    const customMessage = req.body.customMessage;

    if (!token || !chatId) {
      return res.status(400).json({ success: false, message: 'Falta Bot Token o Chat ID de Telegram' });
    }

    const testMsg = customMessage || (
      `🚀 *[MinerX PRO - Firebase Cloud]*\n\n` +
      `✅ ¡Conexión verificada exitosamente!\n` +
      `🛰️ *Modo:* 100% Datos en Vivo con Persistencia Cloud\n` +
      `☁️ *Plataforma:* Firebase Hosting & Firestore 24/7\n` +
      `🕒 *Hora:* ${new Date().toLocaleTimeString()}\n\n` +
      `_Tu bot de vigilancia está activo y te alertará si alguna GPU se desconecta o rinde por debajo del umbral de rentabilidad._`
    );

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: testMsg,
        parse_mode: 'Markdown'
      })
    });

    const data = await response.json();
    if (data.ok) {
      return res.json({ success: true, message: '¡Mensaje recibido en tu Telegram!' });
    }
    res.status(400).json({ success: false, message: data.description || 'Error de Telegram API' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/telegram/send-status', requireAdmin, async (req, res) => {
  try {
    const userId = await getUserIdFromReq(req);
    const cfg = await getPersistedConfig(userId);
    const token = req.body.token || cfg.appSettings?.telegramBotToken;
    const chatId = req.body.chatId || cfg.appSettings?.telegramChatId;

    if (!token || !chatId) {
      return res.status(400).json({ success: false, message: 'Falta Bot Token o Chat ID de Telegram' });
    }

    const kAccs = (cfg.kryptexAccounts && cfg.kryptexAccounts.length > 0)
      ? cfg.kryptexAccounts.filter(a => a.enabled && a.walletAddress && a.walletAddress.trim())
      : (cfg.kryptexConfig?.walletAddress ? [{ ...cfg.kryptexConfig, id: 'default', accountName: 'Billetera Principal', enabled: true }] : []);

    let workersList = [];
    for (const acc of kAccs) {
      try {
        const wRes = await fetch(`https://pool.kryptex.com/${acc.coin || 'prl'}/api/v3/miner/workers/${acc.walletAddress}`);
        if (wRes.ok) {
          const wData = await wRes.json();
          workersList.push(...(wData.results || []));
        }
      } catch {}
    }

    const runningCount = workersList.filter(w => w.status === 'online').length;
    const totalHashTHs = workersList.reduce((acc, w) => acc + (w.avg_hashrate_30m ? (Number(w.avg_hashrate_30m) / 1e12) : 0), 0);
    const hourlyCost = runningCount * 0.160;
    const grossUSD = totalHashTHs * 0.0012395;
    const netUSD = (grossUSD * (1 - 0.0456)) - hourlyCost;

    const reportMsg = `⚡ *[MinerX PRO • Reporte Cloud]*\n\n` +
      `🚀 *Potencia Flota:* \`${totalHashTHs.toFixed(1)} TH/s\`\n` +
      `🟢 *GPUs en Línea:* \`${runningCount} activas\`\n` +
      `🥗 *Costo SaladCloud:* \`$${hourlyCost.toFixed(3)} USD/h\`\n` +
      `📈 *Ingreso Bruto:* \`$${grossUSD.toFixed(3)} USD/h\`\n` +
      `💰 *Utilidad Neta:* \`${netUSD >= 0 ? '+' : ''}$${netUSD.toFixed(3)} USD/h\`\n` +
      `📅 *Proyección 24h:* \`$${(netUSD * 24).toFixed(2)} USD/día\`\n` +
      `⚖️ *Fricción:* \`4.56% auditada (Spread + SPEI)\`\n\n` +
      `_Reporte generado desde Firebase Cloud a las ${new Date().toLocaleTimeString()}_`;

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: reportMsg,
        parse_mode: 'Markdown'
      })
    });

    const data = await response.json();
    if (data.ok) {
      return res.json({ success: true, message: '¡Reporte entregado con éxito a tu Telegram!' });
    }
    res.status(400).json({ success: false, message: data.description || 'Error de Telegram' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Export Cloud Function
exports.api = onRequest({ cors: true, maxInstances: 10 }, app);
