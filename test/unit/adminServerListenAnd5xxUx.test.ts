import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SERVER_TS_URL = new URL('../../server/server.ts', import.meta.url);
const APP_TSX_URL = new URL('../../src/App.tsx', import.meta.url);

function reserveOccupiedPort(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close(() => reject(new Error('Failed to resolve occupied port')));
        return;
      }
      resolve({ server, port: addr.port });
    });
  });
}

async function allocateFreePort(): Promise<number> {
  const { server, port } = await reserveOccupiedPort();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function buildCleanServerEnv(port: number, dataDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    DATA_DIR: dataDir,
  };
  delete env.NODE_ENV;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function extractBraceBlock(source: string, openBraceIndex: number): string {
  assert.equal(source[openBraceIndex], '{', 'Expected opening brace');
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBraceIndex, i + 1);
      }
    }
  }
  throw new Error('Unbalanced braces in source block');
}

describe('SCRUM-379: server/server.ts Express 5 app.listen error handling & post-listen intervals', () => {
  it('handles app.listen(PORT, (err?: Error)) fail-fast and starts background intervals only inside the success path', () => {
    const source = readFileSync(SERVER_TS_URL, 'utf8');
    const mainGuardIndex = source.indexOf('if (isMainModule && !isTestEnv)');
    assert.ok(mainGuardIndex >= 0, 'Expected main module guard in server/server.ts');

    const startupBlock = source.slice(mainGuardIndex);
    const listenIndex = startupBlock.indexOf('app.listen(PORT,');
    assert.ok(listenIndex >= 0, 'Expected app.listen(PORT, ...) call');

    const beforeListen = startupBlock.slice(0, listenIndex);
    assert.equal(
      beforeListen.includes('setInterval('),
      false,
      'Background setInterval timers must not start before app.listen succeeds'
    );

    const listenSection = startupBlock.slice(listenIndex);
    assert.match(listenSection, /app\.listen\(\s*PORT\s*,\s*\(\s*err\??\s*:\s*Error\s*\)\s*=>/);
    assert.match(listenSection, /if\s*\(\s*err\s*\)/);
    assert.match(listenSection, /Failed to bind port \$\{PORT\}: \$\{err\.message\}/);
    assert.match(listenSection, /\.code/);
    assert.match(listenSection, /process\.exit\(\s*1\s*\)/);

    const exitIndex = listenSection.indexOf('process.exit(1)');
    const watcherIndex = listenSection.indexOf('setInterval(runAutonomousBackgroundWatcher, 60000)');
    const pollerIndex = listenSection.indexOf('setInterval(pollTelegramCommands, 8000)');
    assert.ok(watcherIndex > exitIndex, 'runAutonomousBackgroundWatcher interval must start after error guard');
    assert.ok(pollerIndex > exitIndex, 'pollTelegramCommands interval must start after error guard');
  });

  it('exits with code 1 and logs bind error (EADDRINUSE) instead of staying alive as a zombie when port is occupied', async () => {
    const { server: blocker, port: occupiedPort } = await reserveOccupiedPort();
    const tempDataDir = mkdtempSync(join(tmpdir(), 'scrum379-occupied-'));

    try {
      const child = spawn(process.execPath, ['--import', 'tsx', 'server/server.ts'], {
        cwd: REPO_ROOT,
        env: buildCleanServerEnv(occupiedPort, tempDataDir),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      const outcome = await new Promise<{ exitCode: number | null; timedOut: boolean }>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve({ exitCode: null, timedOut: true });
        }, 6000);
        child.once('exit', (code) => {
          clearTimeout(timer);
          resolve({ exitCode: code, timedOut: false });
        });
      });

      assert.equal(outcome.timedOut, false, `Expected fail-fast exit on occupied port ${occupiedPort}, got zombie timeout. stdout=${stdout} stderr=${stderr}`);
      assert.equal(outcome.exitCode, 1, `Expected exitCode=1 on bind failure. stdout=${stdout} stderr=${stderr}`);
      assert.match(
        stderr,
        new RegExp(`\\[MinerX Engine\\] Failed to bind port ${occupiedPort}:.*EADDRINUSE`),
        `Expected bind error with EADDRINUSE on stderr, got: ${stderr}`
      );
      assert.equal(stdout.includes('Proxy Server listening on'), false, `Must not log listening message on bind failure. stdout=${stdout}`);
      assert.equal(stdout.includes('Autonomous Telegram background watcher'), false);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
      rmSync(tempDataDir, { recursive: true, force: true });
    }
  });

  it('starts cleanly on a free PORT and serves /api/health', async () => {
    const freePort = await allocateFreePort();
    const tempDataDir = mkdtempSync(join(tmpdir(), 'scrum379-free-'));

    const child = spawn(process.execPath, ['--import', 'tsx', 'server/server.ts'], {
      cwd: REPO_ROOT,
      env: buildCleanServerEnv(freePort, tempDataDir),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timed out waiting for server startup on port ${freePort}. stdout=${stdout} stderr=${stderr}`));
        }, 10000);
        const onData = () => {
          if (stdout.includes(`Proxy Server listening on http://localhost:${freePort}`)) {
            clearTimeout(timer);
            resolve();
          }
        };
        child.stdout.on('data', onData);
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`Server exited early with code ${code}. stdout=${stdout} stderr=${stderr}`));
        });
      });

      const res = await fetch(`http://127.0.0.1:${freePort}/api/health`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { status?: string };
      assert.equal(body.status, 'online');
    } finally {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          const fallback = setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
          }, 2000);
          child.once('exit', () => {
            clearTimeout(fallback);
            resolve();
          });
        });
      }
      rmSync(tempDataDir, { recursive: true, force: true });
    }
  });
});

describe('SCRUM-379: vite.config.ts /api proxy target synchronization', () => {
  async function resolveApiProxyTarget(
    envOverrides: { PORT?: string; VITE_API_PROXY_TARGET?: string },
    cacheKey: string
  ): Promise<string> {
    const prevPort = process.env.PORT;
    const prevTarget = process.env.VITE_API_PROXY_TARGET;

    if (envOverrides.PORT === undefined) delete process.env.PORT;
    else process.env.PORT = envOverrides.PORT;

    if (envOverrides.VITE_API_PROXY_TARGET === undefined) delete process.env.VITE_API_PROXY_TARGET;
    else process.env.VITE_API_PROXY_TARGET = envOverrides.VITE_API_PROXY_TARGET;

    try {
      const configUrl = new URL(`../../vite.config.ts?scrum379=${cacheKey}`, import.meta.url).href;
      const mod = await import(configUrl);
      const config = typeof mod.default === 'function'
        ? await mod.default({ command: 'serve', mode: 'development' })
        : mod.default;
      const apiProxy = config?.server?.proxy?.['/api'];
      assert.ok(apiProxy && typeof apiProxy === 'object' && 'target' in apiProxy, 'Expected /api proxy config');
      return String(apiProxy.target);
    } finally {
      if (prevPort === undefined) delete process.env.PORT;
      else process.env.PORT = prevPort;
      if (prevTarget === undefined) delete process.env.VITE_API_PROXY_TARGET;
      else process.env.VITE_API_PROXY_TARGET = prevTarget;
    }
  }

  it('defaults to http://localhost:3001 when neither PORT nor VITE_API_PROXY_TARGET is set', async () => {
    assert.equal(await resolveApiProxyTarget({}, 'default'), 'http://localhost:3001');
  });

  it('follows PORT when PORT is set (e.g. 3101)', async () => {
    assert.equal(await resolveApiProxyTarget({ PORT: '3101' }, 'port-3101'), 'http://localhost:3101');
  });

  it('prefers explicit VITE_API_PROXY_TARGET over PORT', async () => {
    assert.equal(
      await resolveApiProxyTarget(
        { PORT: '3101', VITE_API_PROXY_TARGET: 'http://127.0.0.1:4100' },
        'explicit-target'
      ),
      'http://127.0.0.1:4100'
    );
  });

  it('falls back to http://localhost:3001 when env values are blank whitespace', async () => {
    assert.equal(
      await resolveApiProxyTarget({ PORT: '   ', VITE_API_PROXY_TARGET: '  ' }, 'whitespace'),
      'http://localhost:3001'
    );
  });
});

describe('SCRUM-379: src/App.tsx preserves 503 and differentiates 5xx backend outages from 401/403', () => {
  const appSource = readFileSync(APP_TSX_URL, 'utf8');

  it('preserves 503 and handles 500/502/504 without calling handleLogout in mount auth check', () => {
    const mountStart = appSource.indexOf("apiFetch('/api/auth/me')");
    const mountEnd = appSource.indexOf('// Intercept 401');
    assert.ok(mountStart >= 0 && mountEnd > mountStart);
    const mountAuth = appSource.slice(mountStart, mountEnd);

    const status503Index = mountAuth.indexOf('if (res.status === 503)');
    const status5xxIndex = mountAuth.indexOf('if (res.status >= 500)');
    const logoutIndex = mountAuth.indexOf('handleLogout();');
    assert.ok(status503Index >= 0, 'SCRUM-274 requires literal if (res.status === 503)');
    assert.ok(status5xxIndex > status503Index, 'if (res.status >= 500) must appear immediately after 503 check');
    assert.ok(logoutIndex > status5xxIndex, 'handleLogout() must appear after 5xx check');
    assert.equal(
      mountAuth.slice(status503Index, logoutIndex).includes('handleLogout'),
      false,
      'Neither 503 nor 5xx branch may reference handleLogout'
    );

    const ifNotOkIndex = mountAuth.indexOf('if (!res.ok)');
    const openBrace = mountAuth.indexOf('{', ifNotOkIndex);
    const blockBody = extractBraceBlock(mountAuth, openBrace);
    const runMountBranch = new Function(
      'res',
      'setAuthInfrastructureError',
      'handleLogout',
      `if (!res.ok) ${blockBody}`
    ) as (
      res: { ok: boolean; status: number },
      setAuthInfrastructureError: (msg: string) => void,
      handleLogout: () => void
    ) => unknown;

    // 503 preserved
    {
      let infraMsg: string | null = null;
      let loggedOut = false;
      const result = runMountBranch(
        { ok: false, status: 503 },
        (m) => { infraMsg = m; },
        () => { loggedOut = true; }
      );
      assert.equal(result, null);
      assert.equal(infraMsg, 'La autoridad de autorización administrativa no está disponible.');
      assert.equal(loggedOut, false);
    }

    // 500 / 502 / 504 -> backend unavailable without logout
    for (const status of [500, 502, 504]) {
      let infraMsg: string | null = null;
      let loggedOut = false;
      const result = runMountBranch(
        { ok: false, status },
        (m) => { infraMsg = m; },
        () => { loggedOut = true; }
      );
      assert.equal(result, null);
      assert.equal(infraMsg, 'El servidor backend de administración no está disponible.');
      assert.equal(loggedOut, false, `Status ${status} must not call handleLogout()`);
    }

    // 401 / 403 -> still logs out
    for (const status of [401, 403]) {
      let infraMsg: string | null = null;
      let loggedOut = false;
      const result = runMountBranch(
        { ok: false, status },
        (m) => { infraMsg = m; },
        () => { loggedOut = true; }
      );
      assert.equal(result, null);
      assert.equal(infraMsg, null);
      assert.equal(loggedOut, true, `Status ${status} must trigger handleLogout()`);
    }
  });

  it('preserves 503 and throws backend-unavailable message on 500/502/504 in handleLogin', () => {
    const loginStart = appSource.indexOf('const handleLogin = async');
    const loginEnd = appSource.indexOf('const getInitialTabFromUrl');
    assert.ok(loginStart >= 0 && loginEnd > loginStart);
    const loginBlock = appSource.slice(loginStart, loginEnd);

    const status503Index = loginBlock.indexOf('if (res.status === 503)');
    const status5xxIndex = loginBlock.indexOf('if (res.status >= 500)');
    assert.ok(status503Index >= 0, 'handleLogin must preserve literal if (res.status === 503)');
    assert.ok(status5xxIndex > status503Index, 'handleLogin must check if (res.status >= 500) immediately after 503');

    const ifNotOkIndex = loginBlock.indexOf('if (!res.ok)');
    const openBrace = loginBlock.indexOf('{', ifNotOkIndex);
    const blockBody = extractBraceBlock(loginBlock, openBrace);
    const runLoginBranch = new Function('res', `if (!res.ok) ${blockBody}`) as (
      res: { ok: boolean; status: number }
    ) => void;

    assert.throws(
      () => runLoginBranch({ ok: false, status: 503 }),
      { message: 'La autoridad de autorización administrativa no está disponible.' }
    );

    for (const status of [500, 502, 504]) {
      assert.throws(
        () => runLoginBranch({ ok: false, status }),
        { message: 'El servidor backend de administración no está disponible. Verifica que el backend esté activo.' }
      );
    }

    for (const status of [401, 403]) {
      assert.throws(
        () => runLoginBranch({ ok: false, status }),
        { message: 'Sesión no autorizada para el panel de administración.' }
      );
    }
  });
});
