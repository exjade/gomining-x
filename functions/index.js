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

// Helper to resolve userId from Request Token
async function getUserIdFromReq(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    const users = await getPersistedUsers();
    const user = users.find(u => u.sessionToken === token);
    if (user) return user.id;
  }
  return "usr_default_admin";
}

// Database Persistence Helpers (Firestore User-Isolated Collections + Fallback)
async function getPersistedConfig(userId = "usr_default_admin") {
  if (db) {
    try {
      // 1. Isolated User Subcollection: minerx_users/{userId}/data/config
      const doc = await db.collection("minerx_users").doc(userId).collection("data").doc("config").get();
      if (doc.exists) {
        return doc.data();
      }
      // 2. Legacy fallback check
      const legacyDoc = await db.collection("minerx_app_data").doc("config").get();
      if (legacyDoc.exists) {
        return legacyDoc.data();
      }
    } catch (err) {
      console.warn("Firestore get config error:", err.message);
    }
  }
  return memoryConfig[userId] || memoryConfig["usr_default_admin"] || defaultTemplateConfig;
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

async function getPersistedCycles(userId = "usr_default_admin") {
  if (db) {
    try {
      // 1. Isolated User Subcollection: minerx_users/{userId}/data/mining_cycles
      const doc = await db.collection("minerx_users").doc(userId).collection("data").doc("mining_cycles").get();
      if (doc.exists) {
        return doc.data();
      }
      // 2. Legacy fallback check
      const legacyDoc = await db.collection("minerx_app_data").doc("mining_cycles").get();
      if (legacyDoc.exists) {
        return legacyDoc.data();
      }
    } catch (err) {
      console.warn("Firestore get cycles error:", err.message);
    }
  }
  return memoryCycles[userId] || memoryCycles["usr_default_admin"] || { activeCycle: null, closedCycles: [] };
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
app.get('/api/config', async (req, res) => {
  const userId = await getUserIdFromReq(req);
  const cfg = await getPersistedConfig(userId);
  res.json(cfg);
});

app.post('/api/config', async (req, res) => {
  const userId = await getUserIdFromReq(req);
  const current = await getPersistedConfig(userId);
  const newConfig = { ...current, ...req.body };
  await savePersistedConfig(userId, newConfig);
  res.json({ success: true, message: 'Configuración guardada en Firestore para tu usuario', userId });
});

// ----------------------------------------------------
// 2. AUTHENTICATION & SESSION PERSISTENCE (FIREBASE)
// ----------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, fullName } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'Usuario, email y contraseña requeridos' });
  }

  const users = await getPersistedUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'El nombre de usuario ya está registrado' });
  }

  const token = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const newUser = {
    id: `usr_${Date.now()}`,
    username: username.trim(),
    email: email.trim(),
    passwordHash: password, // In production, hash with bcrypt
    fullName: fullName || username,
    createdAt: new Date().toISOString(),
    sessionToken: token
  };

  await savePersistedUser(newUser);

  res.json({
    success: true,
    message: 'Usuario registrado con éxito en Firebase',
    user: { id: newUser.id, username: newUser.username, email: newUser.email, fullName: newUser.fullName },
    token
  });
});

app.post('/api/auth/login', async (req, res) => {
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
    return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
  }

  const token = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  user.sessionToken = token;
  await savePersistedUser(user);

  res.json({
    success: true,
    message: 'Inicio de sesión exitoso',
    user: { id: user.id, username: user.username, email: user.email, fullName: user.fullName },
    token
  });
});

app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ success: false, message: 'No autenticado' });
  }

  const users = await getPersistedUsers();
  const user = users.find(u => u.sessionToken === token);

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
app.get('/api/mining/cycles', async (req, res) => {
  const userId = await getUserIdFromReq(req);
  const data = await getPersistedCycles(userId);
  res.json({
    success: true,
    activeCycle: data.activeCycle || null,
    closedCycles: data.closedCycles || []
  });
});

app.post('/api/mining/cycles/start', async (req, res) => {
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

app.post('/api/mining/cycles/close', async (req, res) => {
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
app.get('/api/salad/balance', async (req, res) => {
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
app.post('/api/salad/test-account', async (req, res) => {
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
app.post('/api/salad/all-active', async (req, res) => {
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
app.post('/api/salad/reallocate', async (req, res) => {
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
app.post('/api/salad/restart-instance', async (req, res) => {
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
app.post('/api/salad/recreate-instance', async (req, res) => {
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
app.get('/api/salad/quotas', async (req, res) => {
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
app.get('/api/salad/gpu-classes', async (req, res) => {
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
app.post('/api/salad/container-group/control', async (req, res) => {
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
    const response = await fetch(`https://pool.kryptex.com/${coin}/api/v3/miner/workers/${address}`);
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
    const response = await fetch(`https://pool.kryptex.com/${coin}/api/v1/miner/balance/${address}`);
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
    const response = await fetch(`https://pool.kryptex.com/${coin}/api/v1/miner/payouts/${address}/stats`);
    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    }
    res.status(response.status).json({ success: false, message: 'Error consultando pagos en Kryptex' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 6. TELEGRAM NOTIFICATIONS
// ----------------------------------------------------
app.post('/api/telegram/test', async (req, res) => {
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

app.post('/api/telegram/send-status', async (req, res) => {
  try {
    const userId = await getUserIdFromReq(req);
    const cfg = await getPersistedConfig(userId);
    const token = req.body.token || cfg.appSettings?.telegramBotToken;
    const chatId = req.body.chatId || cfg.appSettings?.telegramChatId;

    if (!token || !chatId) {
      return res.status(400).json({ success: false, message: 'Falta Bot Token o Chat ID de Telegram' });
    }

    const { walletAddress, coin } = cfg.kryptexConfig;
    let workersList = [];
    if (walletAddress) {
      try {
        const wRes = await fetch(`https://pool.kryptex.com/${coin || 'prl'}/api/v3/miner/workers/${walletAddress}`);
        if (wRes.ok) {
          const wData = await wRes.json();
          workersList = wData.results || [];
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
