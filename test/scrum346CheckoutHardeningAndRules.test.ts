import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(projectRoot, relPath), 'utf8')
}

describe('SCRUM-346 (PG-04): Checkout Hardening, Reown AppKit Only (ADR-0006) & Firestore Rules', () => {
  it('1. Removes all 5 legacy direct-connector files from src/', () => {
    const deletedFiles = [
      'src/metamaskConnect.ts',
      'src/coinbaseWallet.ts',
      'src/phantomMobile.ts',
      'src/solflareMobile.ts',
      'src/walletError.ts',
    ]
    for (const relPath of deletedFiles) {
      assert.equal(
        fs.existsSync(path.resolve(projectRoot, relPath)),
        false,
        `Legacy connector file must be deleted: ${relPath}`,
      )
    }
  })

  it('2. Removes redundant direct-connector npm packages and overrides from package.json', () => {
    const pkg = JSON.parse(readText('package.json')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      overrides?: Record<string, unknown>
    }
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
    const forbidden = [
      '@coinbase/wallet-sdk',
      '@metamask/connect-evm',
      '@solflare-wallet/sdk',
      '@solana/wallet-adapter-wallets',
      'tweetnacl',
      'bs58',
    ]
    for (const name of forbidden) {
      assert.equal(Object.hasOwn(deps, name), false, `Package must be removed from package.json: ${name}`)
    }
    assert.equal(
      Object.hasOwn(pkg.overrides ?? {}, '@solflare-wallet/sdk'),
      false,
      'Override for @solflare-wallet/sdk must be removed from package.json',
    )
  })

  it('3. Zero insecure checkout/simulation/URL-tampering symbols in WalletPaymentCheckout.tsx, App.tsx, and walletAppLinks.ts', () => {
    const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
    const appSrc = readText('src/App.tsx')
    const linksSrc = readText('src/walletAppLinks.ts')

    const forbiddenAcrossAll = [
      'showSimulateFallback',
      '0xaaaa',
      'gmPayAmount',
      'gmPayProduct',
      'recordMinerPurchaseToAdmin',
      "'CONFIRMED'",
      '"CONFIRMED"',
    ]
    for (const [label, source] of [
      ['src/WalletPaymentCheckout.tsx', checkoutSrc],
      ['src/App.tsx', appSrc],
      ['src/walletAppLinks.ts', linksSrc],
    ] as const) {
      for (const token of forbiddenAcrossAll) {
        assert.equal(
          source.includes(token),
          false,
          `${label} must have 0 occurrences of ${token}`,
        )
      }
    }

    assert.equal(checkoutSrc.includes('buyDemoMiner'), false, 'WalletPaymentCheckout must not use buyDemoMiner')
    assert.equal(checkoutSrc.includes('simulatedMiner'), false, 'WalletPaymentCheckout must not render simulatedMiner')
    assert.equal(checkoutSrc.includes('walletOptions'), false, 'WalletPaymentCheckout must not define manual walletOptions')
    assert.equal(checkoutSrc.includes('Confirmar compra en modo prueba'), false, 'Simulation fallback CTA must be removed')
    assert.equal(checkoutSrc.includes('creditDirectReferralCommission'), false, 'Checkout must not credit referrals from client')
    assert.equal(checkoutSrc.includes('savePurchasedMiner'), false, 'Checkout must not write miners from client')
  })

  it('4. Wires all 5 SCRUM-345 payment callables and server-authoritative checkout lifecycle', () => {
    const clientPath = path.resolve(projectRoot, 'src/services/payments/paymentGatewayClient.ts')
    assert.equal(fs.existsSync(clientPath), true, 'src/services/payments/paymentGatewayClient.ts must exist')

    const gatewaySrc = readText('src/services/payments/paymentGatewayClient.ts')
    const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
    const appSrc = readText('src/App.tsx')
    const linksSrc = readText('src/walletAppLinks.ts')

    const callables = [
      'createPaymentIntent',
      'selectPaymentMethod',
      'getPaymentIntent',
      'cancelPaymentIntent',
      'confirmPaymentIntent',
    ]
    for (const fnName of callables) {
      assert.ok(gatewaySrc.includes(fnName), `paymentGatewayClient.ts must wire ${fnName}`)
      assert.ok(checkoutSrc.includes(fnName), `WalletPaymentCheckout.tsx must use ${fnName}`)
    }

    assert.ok(gatewaySrc.includes('httpsCallable'), 'paymentGatewayClient.ts must use firebase/functions httpsCallable')
    assert.ok(checkoutSrc.includes('requireTreasuryAddress'), 'WalletPaymentCheckout.tsx must validate server treasuryAddress')
    assert.ok(checkoutSrc.includes('buildExplorerTxUrl'), 'WalletPaymentCheckout.tsx must use buildExplorerTxUrl')
    assert.ok(checkoutSrc.includes('isEthereumPaymentEnabled'), 'WalletPaymentCheckout.tsx must gate Ethereum with isEthereumPaymentEnabled')
    assert.ok(checkoutSrc.includes('toBackendPaymentNetworkId'), 'WalletPaymentCheckout.tsx must map bnb -> bsc via toBackendPaymentNetworkId')
    assert.ok(checkoutSrc.includes('expectedAmountAtomic'), 'WalletPaymentCheckout.tsx must use server expectedAmountAtomic')
    assert.ok(checkoutSrc.includes('SETTLED'), 'WalletPaymentCheckout.tsx must only show completion on SETTLED')
    assert.ok(appSrc.includes('gmPayIntentId'), 'App.tsx must support safe resume via gmPayIntentId')
    assert.ok(linksSrc.includes('gmPayIntentId'), 'walletAppLinks.ts must build resume URLs with gmPayIntentId')
  })

  it('5. Enforces Reown AppKit Only in WalletPanel.tsx and thin adapter in walletSession.ts', () => {
    const panelSrc = readText('src/WalletPanel.tsx')
    const sessionSrc = readText('src/walletSession.ts')

    assert.equal(panelSrc.includes('directWallets'), false, 'WalletPanel.tsx must remove directWallets grid')
    assert.ok(panelSrc.includes('@reown/appkit/react'), 'WalletPanel.tsx must use @reown/appkit/react')

    assert.ok(sessionSrc.includes('@reown/appkit/react'), 'walletSession.ts must back session with @reown/appkit/react')
    assert.ok(sessionSrc.includes('wagmi'), 'walletSession.ts must use wagmi')
    assert.equal(sessionSrc.includes('metamaskConnect'), false)
    assert.equal(sessionSrc.includes('coinbaseWallet'), false)
    assert.equal(sessionSrc.includes('phantomMobile'), false)
    assert.equal(sessionSrc.includes('solflareMobile'), false)
    assert.equal(sessionSrc.includes('SOLANA_RPCS'), false)
    assert.ok(sessionSrc.split(/\r?\n/).length <= 130, 'walletSession.ts must remain a thin adapter')
  })

  it('6. Preserves PouwMiner.com, AuthorizedWithdrawalView, platformBalancePurchase, and hardened LF firestore.rules', () => {
    const appKitSrc = readText('src/appkitConfig.ts')
    const appSrc = readText('src/App.tsx')
    const rulesRaw = fs.readFileSync(path.resolve(projectRoot, 'firestore.rules'))
    const rulesSrc = rulesRaw.toString('utf8')

    assert.ok(appKitSrc.includes('PouwMiner.com'), 'appkitConfig.ts must preserve PouwMiner.com branding')
    assert.ok(appSrc.includes('AuthorizedWithdrawalView'), 'App.tsx must preserve AuthorizedWithdrawalView (SCRUM-275)')
    assert.equal(fs.existsSync(path.resolve(projectRoot, 'src/platformBalancePurchase.ts')), true, 'platformBalancePurchase.ts must remain intact')

    assert.equal(rulesRaw.includes(0x0d), false, 'firestore.rules must use pure LF line endings (0 CRLF)')
    assert.match(rulesSrc, /match \/miners\/\{uid\}\/miner\/\{minerId\}[\s\S]*?allow create, delete: if false;/)
    assert.match(rulesSrc, /match \/admin_orders\/\{orderId\}[\s\S]*?allow create, update, delete: if false;/)
    assert.match(rulesSrc, /match \/admin_contracts\/\{contractId\}[\s\S]*?allow create, update, delete: if false;/)
    assert.match(rulesSrc, /match \/payment_intents\/\{intentId\}[\s\S]*?allow create, update, delete: if false;/)
    assert.match(rulesSrc, /match \/usedTxHashes\/\{txKey\}[\s\S]*?allow read: if isAdmin\(\);[\s\S]*?allow create, update, delete: if false;/)
    assert.match(rulesSrc, /match \/referrals\/\{uid\}[\s\S]*?allow read: if isOwner\(uid\) \|\| isAdmin\(\);[\s\S]*?allow create, update, delete: if false;/)
  })
})
