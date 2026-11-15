const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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

test('disables legacy register/login outside explicit local development', () => {
  for (const route of ['/api/auth/register', '/api/auth/login']) {
    const start = functionsSource.indexOf(`app.post('${route}'`);
    const block = functionsSource.slice(start, start + 500);
    assert.match(block, /if \(!isLocalDevSessionAllowed\(\)\)/);
  }
});
