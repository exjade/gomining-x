import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  buildExplorerTxUrl,
  getPaymentNetworkConfig,
  parseDecimalToAtomicBigInt,
  PaymentDestinationError,
  requireTreasuryAddress,
} from '../src/paymentDestinations.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const EXPECTED_RULES_SHA256 = 'EA8F0C18923E1B2D25ED1C9D2599858475ADDDB06E6677667F29EC594F90705C'

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(projectRoot, relPath), 'utf8')
}

describe('SCRUM-347 (PG-05): Client Adversarial Security & Regression Suite', () => {
  it('1. Enforces 0 Math.round in paymentDestinations.ts & solanaPayment.ts and exact BigInt decimals (BSC 18 vs Polygon/ETH/Solana 6)', () => {
    const destSrc = readText('src/paymentDestinations.ts')
    const solSrc = readText('src/solanaPayment.ts')

    assert.equal(destSrc.includes('Math.round'), false, 'src/paymentDestinations.ts must have 0 Math.round calls')
    assert.equal(solSrc.includes('Math.round'), false, 'src/solanaPayment.ts must have 0 Math.round calls')

    const bscCfg = getPaymentNetworkConfig('bsc', 'mainnet')
    const polyCfg = getPaymentNetworkConfig('polygon', 'mainnet')
    const ethCfg = getPaymentNetworkConfig('ethereum', 'mainnet')
    const solCfg = getPaymentNetworkConfig('solana', 'mainnet')

    assert.equal(bscCfg.usdtDecimals, 18)
    assert.equal(polyCfg.usdtDecimals, 6)
    assert.equal(ethCfg.usdtDecimals, 6)
    assert.equal(solCfg.usdtDecimals, 6)

    // Exact BigInt conversions with zero floating-point rounding drift
    assert.equal(parseDecimalToAtomicBigInt('561.99', bscCfg.usdtDecimals), 561_990_000_000_000_000_000n)
    assert.equal(parseDecimalToAtomicBigInt('561.99', polyCfg.usdtDecimals), 561_990_000n)
    assert.equal(parseDecimalToAtomicBigInt('561.99', ethCfg.usdtDecimals), 561_990_000n)
    assert.equal(parseDecimalToAtomicBigInt('561.99', solCfg.usdtDecimals), 561_990_000n)

    // Excess decimal precision rejected cleanly (never silently truncated/rounded)
    assert.throws(
      () => parseDecimalToAtomicBigInt('1.0000001', 6),
      (err: unknown) => err instanceof PaymentDestinationError && err.code === 'EXCESS_DECIMAL_PRECISION',
    )
  })

  it('2. Blocks URL tampering: 0 occurrences of gmPayAmount / gmPayProduct in App.tsx, walletAppLinks.ts, and WalletPaymentCheckout.tsx', () => {
    for (const relPath of ['src/App.tsx', 'src/walletAppLinks.ts', 'src/WalletPaymentCheckout.tsx']) {
      const src = readText(relPath)
      assert.equal(src.includes('gmPayAmount'), false, `${relPath} must not accept or propagate gmPayAmount`)
      assert.equal(src.includes('gmPayProduct'), false, `${relPath} must not accept or propagate gmPayProduct`)
    }
  })

  it('3. Enforces 0 direct Firestore writes, 0 CONFIRMED status, and 0 simulation fallbacks across checkout and payment history', () => {
    const paymentsDir = path.resolve(projectRoot, 'src/components/payments')
    const paymentFiles = fs
      .readdirSync(paymentsDir)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .map((f) => `src/components/payments/${f}`)

    const targets = ['src/WalletPaymentCheckout.tsx', ...paymentFiles]
    const forbidden = [
      'setDoc(',
      'updateDoc(',
      'addDoc(',
      'deleteDoc(',
      "'CONFIRMED'",
      '"CONFIRMED"',
      'showSimulateFallback',
      'simulatedMiner',
      'buyDemoMiner',
    ]

    for (const relPath of targets) {
      const src = readText(relPath)
      for (const token of forbidden) {
        assert.equal(src.includes(token), false, `${relPath} must contain 0 occurrences of ${token}`)
      }
    }
  })

  it('4. Enforces fail-closed treasury validation and dual-mode (testnet/mainnet) explorer parity', () => {
    for (const network of ['bsc', 'polygon', 'ethereum', 'solana'] as const) {
      const cfg = getPaymentNetworkConfig(network, 'testnet', {})
      assert.equal(cfg.receiverAddress, '', `No hardcoded treasury allowed on ${network}`)
      assert.equal(cfg.usdtContractAddress, '', `Testnet USDT contract on ${network} must be empty without env var`)
    }

    assert.throws(
      () => requireTreasuryAddress('', 'evm'),
      (err: unknown) => err instanceof PaymentDestinationError && err.code === 'TREASURY_ADDRESS_REQUIRED',
    )
    assert.throws(
      () => requireTreasuryAddress('0x0000000000000000000000000000000000000000', 'evm'),
      (err: unknown) => err instanceof PaymentDestinationError && err.code === 'INVALID_TREASURY_ADDRESS',
    )
    assert.throws(
      () => requireTreasuryAddress('11111111111111111111111111111111', 'solana'),
      (err: unknown) => err instanceof PaymentDestinationError && err.code === 'INVALID_TREASURY_ADDRESS',
    )

    assert.equal(
      buildExplorerTxUrl('bsc', '0xabc', 'testnet'),
      'https://testnet.bscscan.com/tx/0xabc',
    )
    assert.equal(
      buildExplorerTxUrl('bsc', '0xabc', 'mainnet'),
      'https://bscscan.com/tx/0xabc',
    )
    assert.equal(
      buildExplorerTxUrl('polygon', '0xdef', 'testnet'),
      'https://amoy.polygonscan.com/tx/0xdef',
    )
    assert.equal(
      buildExplorerTxUrl('solana', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'testnet'),
      'https://solscan.io/tx/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp?cluster=devnet',
    )
    assert.equal(
      buildExplorerTxUrl('solana', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'mainnet'),
      'https://solscan.io/tx/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    )
  })

  it('5. Preserves no-regression invariants: SCRUM-299 protected routes, AuthModal (SCRUM-310/322), SCRUM-275 withdrawals, SCRUM-221 platform balance, Kryptex history & LF firestore.rules', () => {
    const appSrc = readText('src/App.tsx')
    const authPolicySrc = readText('src/authRoutePolicy.ts')
    const authModalSrc = readText('src/AuthModal.tsx')
    const platformBalSrc = readText('src/platformBalancePurchase.ts')

    assert.ok(authPolicySrc.includes('getAuthRouteRedirect'), 'SCRUM-299 authRoutePolicy must remain intact')
    assert.ok(appSrc.includes('getAuthRouteRedirect'), 'App.tsx must enforce SCRUM-299 protected route redirects')
    assert.ok(authModalSrc.includes('AuthModal'), 'SCRUM-310/322 AuthModal must remain intact')
    assert.ok(appSrc.includes('AuthorizedWithdrawalView'), 'SCRUM-275 AuthorizedWithdrawalView must remain intact')
    assert.ok(appSrc.includes('WithdrawalForm'), 'SCRUM-275 WithdrawalForm must remain intact')
    assert.ok(platformBalSrc.includes('purchaseWithPlatformBalance'), 'SCRUM-221 platformBalancePurchase must remain intact')
    assert.ok(appSrc.includes('Historial de pagos del pool'), 'Kryptex public payout history must remain separated and intact')

    const rulesRaw = fs.readFileSync(path.resolve(projectRoot, 'firestore.rules'))
    assert.equal(rulesRaw.includes(0x0d), false, 'firestore.rules must remain pure LF (0 CRLF)')
    const rulesHash = crypto.createHash('sha256').update(rulesRaw).digest('hex').toUpperCase()
    assert.equal(rulesHash, EXPECTED_RULES_SHA256)
  })
})
