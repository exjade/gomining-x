const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const functionsSource = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firebase.json'), 'utf8'));

const routes = [...functionsSource.matchAll(/^app\.(get|post)\('([^']+)'/gm)].map((match) => `${match[1].toUpperCase()} ${match[2]}`);
const expectedRoutes = [
  'GET /api/config',
  'POST /api/config',
  'POST /api/auth/register',
  'POST /api/auth/login',
  'GET /api/auth/audit',
  'POST /api/auth/audit-repair',
  'GET /api/auth/me',
  'GET /api/mining/cycles',
  'POST /api/mining/cycles/start',
  'POST /api/mining/cycles/close',
  'GET /api/salad/balance',
  'POST /api/salad/test-account',
  'POST /api/salad/all-active',
  'POST /api/salad/reallocate',
  'POST /api/salad/restart-instance',
  'POST /api/salad/recreate-instance',
  'GET /api/salad/quotas',
  'GET /api/salad/gpu-classes',
  'POST /api/salad/container-group/control',
  'GET /api/kryptex/pool',
  'GET /api/kryptex/workers/:address',
  'GET /api/kryptex/balance/:address',
  'GET /api/kryptex/payouts/:address',
  'GET /api/kryptex/rates',
  'POST /api/telegram/test',
  'POST /api/telegram/send-status'
];

function routeDeclaration(method, route) {
  return functionsSource.split('\n').find((line) => line.includes(`app.${method.toLowerCase()}('${route}'`));
}

function loadRuntime({ env = {}, tokens = {}, adminUsers = [] } = {}) {
  const routes = [];
  const app = {
    use() {},
    get(route, ...handlers) {
      routes.push({ method: 'GET', route, handlers });
    },
    post(route, ...handlers) {
      routes.push({ method: 'POST', route, handlers });
    }
  };
  const adminUserIds = new Set(adminUsers);
  const db = {
    collection(name) {
      if (name === 'admin_users') {
        return {
          doc(uid) {
            return { get: async () => ({ exists: adminUserIds.has(uid) }) };
          }
        };
      }
      return {
        doc() {
          return {
            get: async () => ({ exists: false }),
            set: async () => {},
            collection: () => this
          };
        },
        get: async () => ({ empty: true, docs: [] }),
        limit() {
          return this;
        }
      };
    }
  };
  const auth = {
    async verifyIdToken(token) {
      if (!tokens[token]) throw new Error('invalid token');
      return tokens[token];
    }
  };
  const admin = {
    apps: [{}],
    initializeApp() {},
    firestore: () => db,
    auth: () => auth
  };
  const module = { exports: {} };
  const filename = path.join(__dirname, 'index.js');
  const context = {
    Buffer,
    Date,
    Math,
    URL,
    clearImmediate,
    clearTimeout,
    console,
    exports: module.exports,
    fetch,
    __dirname,
    __filename: filename,
    module,
    process: { ...process, env: { ...process.env, ...env } },
    require(request) {
      if (request === 'firebase-functions/v2/https') return { onRequest: (_options, handler) => handler };
      if (request === 'express') {
        const express = () => app;
        express.json = () => () => {};
        return express;
      }
      if (request === 'cors') return () => () => {};
      if (request === 'firebase-admin') return admin;
      return require(request);
    },
    setImmediate,
    setTimeout
  };

  vm.runInNewContext(functionsSource, context, { filename });
  return { routes, app: module.exports.api };
}

function runtimeRoute(runtime, method, route) {
  return runtime.routes.find((candidate) => candidate.method === method && candidate.route === route);
}

async function runFirstHandler(route, token) {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  let nextCalled = false;
  const request = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  route.handlers[0](request, response, () => {
    nextCalled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { ...response, nextCalled };
}

test('preserves the 26 Firebase Functions routes and the single Hosting runtime', () => {
  assert.deepEqual(routes, expectedRoutes);
  assert.deepEqual(
    firebaseConfig.hosting.rewrites.find((rewrite) => rewrite.source === '/api/**'),
    { source: '/api/**', function: 'api' }
  );
});

test('uses the existing Firebase identity contract and removes protected default-user fallback', () => {
  assert.match(functionsSource, /authAdmin\.verifyIdToken\(token\)/);
  assert.match(functionsSource, /collection\('admin_users'\)/);
  assert.match(functionsSource, /function isLocalDevSessionAllowed\(\)/);
  assert.match(functionsSource, /FIREBASE_AUTH_EMULATOR_HOST/);
  assert.match(functionsSource, /FUNCTIONS_EMULATOR/);
  assert.doesNotMatch(functionsSource, /ALLOW_DEV_LOCAL_SESSION_TOKEN/);
  assert.doesNotMatch(functionsSource, /'finance'|'operator'/);
  assert.doesNotMatch(functionsSource, /return ["']usr_default_admin["']/);
  assert.doesNotMatch(functionsSource, /memoryConfig\[["']usr_default_admin["']\]/);
  assert.doesNotMatch(functionsSource, /memoryCycles\[["']usr_default_admin["']\]/);
});

test('guards stateful and administrative routes while preserving public Kryptex reads', () => {
  const authenticated = [
    ['get', '/api/config'],
    ['post', '/api/config'],
    ['get', '/api/auth/me'],
    ['get', '/api/mining/cycles'],
    ['post', '/api/mining/cycles/start'],
    ['post', '/api/mining/cycles/close']
  ];
  for (const [method, route] of authenticated) {
    assert.match(routeDeclaration(method, route), new RegExp(`, requireAuthenticated,`));
  }

  const adminOnly = [
    ['get', '/api/auth/audit'],
    ['post', '/api/auth/audit-repair'],
    ['get', '/api/salad/balance'],
    ['post', '/api/salad/test-account'],
    ['post', '/api/salad/all-active'],
    ['post', '/api/salad/reallocate'],
    ['post', '/api/salad/restart-instance'],
    ['post', '/api/salad/recreate-instance'],
    ['get', '/api/salad/quotas'],
    ['get', '/api/salad/gpu-classes'],
    ['post', '/api/salad/container-group/control'],
    ['post', '/api/telegram/test'],
    ['post', '/api/telegram/send-status']
  ];
  for (const [method, route] of adminOnly) {
    assert.match(routeDeclaration(method, route), new RegExp(`, requireAdmin,`));
  }

  for (const route of ['/api/kryptex/pool', '/api/kryptex/workers/:address', '/api/kryptex/balance/:address', '/api/kryptex/payouts/:address', '/api/kryptex/rates']) {
    assert.doesNotMatch(routeDeclaration('get', route), /require(Authentication|Admin)/);
  }
});

test('executes hosted and emulator auth gates without a second session authority', async () => {
  const hosted = loadRuntime({
    env: {
      NODE_ENV: 'development',
      ALLOW_DEV_LOCAL_SESSION_TOKEN: 'true',
      FIREBASE_AUTH_EMULATOR_HOST: '',
      FUNCTIONS_EMULATOR: 'false'
    },
    tokens: {
      'valid-user': { uid: 'uid-user', role: 'UNKNOWN' },
      'admin-token': { uid: 'uid-admin', role: 'ADMIN' },
      'admin-doc-token': { uid: 'uid-doc-admin' }
    },
    adminUsers: ['uid-doc-admin']
  });

  const protectedRoute = runtimeRoute(hosted, 'GET', '/api/config');
  assert.equal((await runFirstHandler(protectedRoute)).statusCode, 401);
  assert.equal((await runFirstHandler(protectedRoute, 'invalid-token')).statusCode, 401);
  assert.equal((await runFirstHandler(protectedRoute, 'sess_init_admin')).statusCode, 401);

  const adminRoute = runtimeRoute(hosted, 'GET', '/api/auth/audit');
  assert.equal((await runFirstHandler(adminRoute, 'valid-user')).statusCode, 401);
  assert.equal((await runFirstHandler(adminRoute, 'admin-token')).nextCalled, true);
  assert.equal((await runFirstHandler(adminRoute, 'admin-doc-token')).nextCalled, true);

  const legacyRegister = runtimeRoute(hosted, 'POST', '/api/auth/register');
  assert.equal((await runFirstHandler(legacyRegister)).statusCode, 403);

  for (const route of ['/api/kryptex/pool', '/api/kryptex/workers/:address', '/api/kryptex/balance/:address', '/api/kryptex/payouts/:address', '/api/kryptex/rates']) {
    assert.equal(runtimeRoute(hosted, 'GET', route).handlers.length, 1);
  }

  const emulator = loadRuntime({
    env: {
      NODE_ENV: 'development',
      ALLOW_DEV_LOCAL_SESSION_TOKEN: '',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FUNCTIONS_EMULATOR: 'true'
    }
  });
  assert.equal((await runFirstHandler(runtimeRoute(emulator, 'GET', '/api/config'), 'sess_init_admin')).nextCalled, true);
});

test('disables legacy register/login outside explicit local development', () => {
  for (const route of ['/api/auth/register', '/api/auth/login']) {
    const start = functionsSource.indexOf(`app.post('${route}'`);
    const block = functionsSource.slice(start, start + 500);
    assert.match(block, /if \(!isLocalDevSessionAllowed\(\)\)/);
  }
});
