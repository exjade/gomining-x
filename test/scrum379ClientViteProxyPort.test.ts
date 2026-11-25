import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { UserConfig } from 'vite';

const PROXY_ROUTES = ['/api/catalog', '/api/purchases', '/api/withdrawals'] as const;

async function loadViteConfigWithEnv(
  envOverrides: { PORT?: string; VITE_API_PROXY_TARGET?: string },
  cacheKey: string,
): Promise<UserConfig> {
  const prevPort = process.env.PORT;
  const prevTarget = process.env.VITE_API_PROXY_TARGET;

  if (envOverrides.PORT === undefined) delete process.env.PORT;
  else process.env.PORT = envOverrides.PORT;

  if (envOverrides.VITE_API_PROXY_TARGET === undefined) delete process.env.VITE_API_PROXY_TARGET;
  else process.env.VITE_API_PROXY_TARGET = envOverrides.VITE_API_PROXY_TARGET;

  try {
    const configUrl = new URL(`../vite.config.ts?scrum379=${cacheKey}`, import.meta.url).href;
    const mod = await import(configUrl);
    assert.equal(typeof mod.default, 'object', 'vite.config.ts must export a plain UserConfig object');
    assert.notEqual(mod.default, null, 'vite.config.ts default export must not be null');
    return mod.default as UserConfig;
  } finally {
    if (prevPort === undefined) delete process.env.PORT;
    else process.env.PORT = prevPort;

    if (prevTarget === undefined) delete process.env.VITE_API_PROXY_TARGET;
    else process.env.VITE_API_PROXY_TARGET = prevTarget;
  }
}

function assertProxyTargets(config: UserConfig, expectedTarget: string): void {
  assert.equal(config.server?.port, 5173);
  assert.equal(config.preview?.port, 4174);

  for (const [scopeName, proxy] of [
    ['server.proxy', config.server?.proxy],
    ['preview.proxy', config.preview?.proxy],
  ] as const) {
    assert.ok(proxy, `Expected ${scopeName} to be defined`);
    for (const route of PROXY_ROUTES) {
      assert.deepEqual(
        proxy[route],
        { target: expectedTarget, changeOrigin: true },
        `Expected ${scopeName}['${route}'] to target ${expectedTarget}`,
      );
    }
  }
}

describe('SCRUM-379: Client vite.config.ts /api proxy target synchronization', () => {
  it('defaults to http://127.0.0.1:3001 when neither PORT nor VITE_API_PROXY_TARGET is set', async () => {
    const config = await loadViteConfigWithEnv({}, 'default');
    assertProxyTargets(config, 'http://127.0.0.1:3001');
  });

  it('follows PORT across server.proxy and preview.proxy when PORT=3101', async () => {
    const config = await loadViteConfigWithEnv({ PORT: '3101' }, 'port-3101');
    assertProxyTargets(config, 'http://127.0.0.1:3101');
  });

  it('prefers explicit VITE_API_PROXY_TARGET over PORT across server.proxy and preview.proxy', async () => {
    const config = await loadViteConfigWithEnv(
      { PORT: '3101', VITE_API_PROXY_TARGET: 'http://127.0.0.1:4100' },
      'explicit-target',
    );
    assertProxyTargets(config, 'http://127.0.0.1:4100');
  });

  it('falls back to http://127.0.0.1:3001 when env values are blank whitespace', async () => {
    const config = await loadViteConfigWithEnv(
      { PORT: '   ', VITE_API_PROXY_TARGET: '  ' },
      'whitespace-fallback',
    );
    assertProxyTargets(config, 'http://127.0.0.1:3001');
  });
});
