/**
 * SCRUM-365 (Parent: SCRUM-275, Blocks: SCRUM-354)
 * Regression tests for Live Smoke Test (Phase 4) blockers on /withdraw/GOMINING:
 * 1. Vite dev & preview proxies forward /api/withdrawals to http://127.0.0.1:3001 (changeOrigin: true)
 *    while preserving /api/catalog, /api/purchases, and the read-only /api/pool/ middleware.
 * 2. App.tsx header CTA guard excludes pathname !== '/withdraw/GOMINING' so the legacy simulated
 *    "Continuar retiro" button/modal is never rendered over <AuthorizedWithdrawalView />.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { PluginOption, UserConfig } from 'vite';
import viteConfigExport from '../vite.config.ts';

const projectRoot = path.resolve(import.meta.dirname, '..');
const viteConfig = viteConfigExport as UserConfig;

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
}

function flattenPlugins(plugins: PluginOption[] | undefined): Array<{ name?: string; configureServer?: unknown; configurePreviewServer?: unknown }> {
  if (!plugins) return [];
  const result: Array<{ name?: string; configureServer?: unknown; configurePreviewServer?: unknown }> = [];
  for (const entry of plugins) {
    if (Array.isArray(entry)) {
      result.push(...flattenPlugins(entry));
    } else if (entry && typeof entry === 'object' && 'name' in entry) {
      result.push(entry as { name?: string; configureServer?: unknown; configurePreviewServer?: unknown });
    }
  }
  return result;
}

describe('SCRUM-365: Client /api/withdrawals Vite Proxy & Header CTA Fix', () => {
  it('configura proxy /api/withdrawals -> http://127.0.0.1:3001 con changeOrigin en server.proxy y preview.proxy', () => {
    assert.deepEqual(viteConfig.server?.proxy?.['/api/withdrawals'], {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true,
    });

    assert.deepEqual(viteConfig.preview?.proxy?.['/api/withdrawals'], {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true,
    });
  });

  it('preserva intactos /api/catalog, /api/purchases y el middleware /api/pool/ en vite.config.ts', () => {
    for (const proxy of [viteConfig.server?.proxy, viteConfig.preview?.proxy]) {
      assert.deepEqual(proxy?.['/api/catalog'], {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      });
      assert.deepEqual(proxy?.['/api/purchases'], {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      });
    }

    const plugins = flattenPlugins(viteConfig.plugins);
    const poolPlugin = plugins.find((plugin) => plugin.name === 'read-only-pool-api');
    assert.ok(poolPlugin, 'read-only-pool-api plugin must be preserved');
    assert.equal(typeof poolPlugin.configureServer, 'function');
    assert.equal(typeof poolPlugin.configurePreviewServer, 'function');
  });

  it('excluye pathname !== /withdraw/GOMINING del botón simulado de cabecera en src/App.tsx', () => {
    const appSrc = readSrc('src/App.tsx');
    const headerButtonMatch = appSrc.match(
      /\{screen\.action\s*&&[\s\S]*?<button className="button button-primary"[\s\S]*?openAction\(screen\.action!,[\s\S]*?<\/button>\}/,
    );

    assert.ok(headerButtonMatch, 'Header screen.action CTA block must exist in src/App.tsx');

    const headerButtonBlock = headerButtonMatch[0];
    assert.ok(
      headerButtonBlock.includes("pathname !== '/withdraw/GOMINING'"),
      'Header CTA guard must exclude /withdraw/GOMINING',
    );

    // Adjacent exclusions and behaviors preserved
    assert.ok(headerButtonBlock.includes("screen.action !== 'Filtros'"));
    assert.ok(headerButtonBlock.includes("pathname !== '/nft-miners'"));
    assert.ok(headerButtonBlock.includes("!pathname.startsWith('/nft-rewards/')"));
    assert.ok(headerButtonBlock.includes("!pathname.startsWith('/nft-referral')"));
    assert.ok(
      headerButtonBlock.includes("if (pathname === '/finance/wallets/virtual' && screen.action === 'Recargar')"),
    );

    // Authoritative withdrawal view wiring preserved
    assert.ok(appSrc.includes('<AuthorizedWithdrawalView'));
  });
});
