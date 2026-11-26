import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const viewPath = path.resolve(projectRoot, 'src/components/admin/PackagePaymentsView.tsx');

describe('SCRUM-381 (PG-07) Task 3: Admin PackagePaymentsView Multichain USDT + TRON Support', () => {
  it('builds exact explorer URLs for TRON (/#/transaction/), Arbitrum, Optimism, Avalanche, BSC, Polygon, Ethereum & Solana across mainnet and testnet', async () => {
    const viewMod = (await import('../../src/components/admin/PackagePaymentsView.tsx')) as unknown as {
      buildAdminExplorerTxUrl?: (network: string, txHash?: string, networkMode?: 'testnet' | 'mainnet') => string | null;
      normalizeAdminNetworkFilterKey?: (network: string) => string;
    };

    assert.equal(typeof viewMod.buildAdminExplorerTxUrl, 'function', 'PackagePaymentsView must export buildAdminExplorerTxUrl');
    assert.equal(typeof viewMod.normalizeAdminNetworkFilterKey, 'function', 'PackagePaymentsView must export normalizeAdminNetworkFilterKey');

    const buildUrl = viewMod.buildAdminExplorerTxUrl!;
    const tronHash = 'a'.repeat(64);
    const evmHash = `0x${'b'.repeat(64)}`;

    assert.equal(buildUrl('TRON', tronHash, 'mainnet'), `https://tronscan.org/#/transaction/${tronHash}`);
    assert.equal(buildUrl('tron', tronHash, 'testnet'), `https://nile.tronscan.org/#/transaction/${tronHash}`);
    assert.equal(buildUrl('ARBITRUM', evmHash, 'mainnet'), `https://arbiscan.io/tx/${evmHash}`);
    assert.equal(buildUrl('arbitrum', evmHash, 'testnet'), `https://sepolia.arbiscan.io/tx/${evmHash}`);
    assert.equal(buildUrl('OPTIMISM', evmHash, 'mainnet'), `https://optimistic.etherscan.io/tx/${evmHash}`);
    assert.equal(buildUrl('optimism', evmHash, 'testnet'), `https://sepolia-optimism.etherscan.io/tx/${evmHash}`);
    assert.equal(buildUrl('AVALANCHE', evmHash, 'mainnet'), `https://snowtrace.io/tx/${evmHash}`);
    assert.equal(buildUrl('avalanche', evmHash, 'testnet'), `https://testnet.snowtrace.io/tx/${evmHash}`);
    assert.equal(buildUrl('BSC', evmHash, 'mainnet'), `https://bscscan.com/tx/${evmHash}`);
    assert.equal(buildUrl('BNB', evmHash, 'testnet'), `https://testnet.bscscan.com/tx/${evmHash}`);
    assert.equal(buildUrl('POLYGON', evmHash, 'mainnet'), `https://polygonscan.com/tx/${evmHash}`);
    assert.equal(buildUrl('SOLANA', '5sigTest', 'testnet'), 'https://solscan.io/tx/5sigTest?cluster=devnet');
    assert.equal(buildUrl('TRON', '   ', 'mainnet'), null);
  });

  it('normalizes BNB/BSC and all 8 multichain network keys cleanly for filter matching', async () => {
    const viewMod = (await import('../../src/components/admin/PackagePaymentsView.tsx')) as unknown as {
      normalizeAdminNetworkFilterKey?: (network: string) => string;
    };
    const normalize = viewMod.normalizeAdminNetworkFilterKey!;

    assert.equal(normalize('BSC'), 'BSC');
    assert.equal(normalize('BNB'), 'BSC');
    assert.equal(normalize('bnb chain'), 'BSC');
    assert.equal(normalize('tron'), 'TRON');
    assert.equal(normalize('TRC20'), 'TRON');
    assert.equal(normalize('polygon'), 'POLYGON');
    assert.equal(normalize('pol'), 'POLYGON');
    assert.equal(normalize('solana'), 'SOLANA');
    assert.equal(normalize('arbitrum'), 'ARBITRUM');
    assert.equal(normalize('optimism'), 'OPTIMISM');
    assert.equal(normalize('avalanche'), 'AVALANCHE');
    assert.equal(normalize('avax'), 'AVALANCHE');
    assert.equal(normalize('ethereum'), 'ETHEREUM');
    assert.equal(normalize('LOCAL_BALANCE'), 'LOCAL_BALANCE');
  });

  it('renders badges and filter options for TRON, ARBITRUM, OPTIMISM, AVALANCHE and uses normalized filter without introducing CONFIRMED', () => {
    const src = fs.readFileSync(viewPath, 'utf8');
    for (const expected of [
      '/#/transaction/',
      'tronscan.org',
      'nile.tronscan.org',
      'arbiscan.io',
      'optimistic.etherscan.io',
      'snowtrace.io',
      '<option value="TRON">',
      '<option value="ARBITRUM">',
      '<option value="OPTIMISM">',
      '<option value="AVALANCHE">',
      'TRON TRC20',
      'ARBITRUM',
      'OPTIMISM',
      'AVALANCHE',
      'normalizeAdminNetworkFilterKey(item.paymentNetwork) === networkFilter',
    ]) {
      assert.ok(src.includes(expected), `PackagePaymentsView.tsx must include ${expected}`);
    }
    assert.equal(src.includes("'CONFIRMED'"), false, 'PackagePaymentsView.tsx must never include CONFIRMED');
    assert.equal(src.includes('"CONFIRMED"'), false, 'PackagePaymentsView.tsx must never include CONFIRMED');
  });
});
