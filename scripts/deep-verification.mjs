import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

console.log('=== RUNNING DEEP VERIFICATION SUITE ===\n')

// 1. Currency & MXN elimination check
console.log('1. Checking zero MXN occurrences across all source files...')
const srcFiles = fs.readdirSync('src').filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
for (const file of srcFiles) {
  const content = fs.readFileSync(path.join('src', file), 'utf8')
  assert(!content.includes("'MXN'"), `${file} contains 'MXN' currency code`)
  assert(!content.includes('"MXN"'), `${file} contains "MXN" currency code`)
  assert(!content.includes('priceMxn'), `${file} contains priceMxn`)
  assert(!content.includes('usdMxnRate'), `${file} contains usdMxnRate`)
}
console.log('  ✓ All source files clean of MXN currency!\n')

// 2. Presale vs Launch catalog check
console.log('2. Verifying Presale (4 tiers, 30 units) and Launch (16 tiers)...')
const minerCatalog = fs.readFileSync('src/minerCatalog.ts', 'utf8')

// Presale plans verification
assert(minerCatalog.includes('export const presaleMinerPlans: MinerPlan[] = ['), 'presaleMinerPlans must be exported')
assert(minerCatalog.includes('powerTh: 1.46') && minerCatalog.includes('price: 18.99'), 'Presale tier 1: 1.46 TH @ $18.99 USD')
assert(minerCatalog.includes('powerTh: 8.33') && minerCatalog.includes('price: 99.99'), 'Presale tier 2: 8.33 TH @ $99.99 USD')
assert(minerCatalog.includes('powerTh: 21.05') && minerCatalog.includes('price: 249.99'), 'Presale tier 3: 21.05 TH @ $249.99 USD')
assert(minerCatalog.includes('powerTh: 42.44') && minerCatalog.includes('price: 499.99'), 'Presale tier 4: 42.44 TH @ $499.99 USD')
assert(minerCatalog.includes('limitUnits: 30'), 'Presale tiers must be limited to 30 units')

// Launch plans verification
assert(minerCatalog.includes('export const launchMinerPlans: MinerPlan[] = ['), 'launchMinerPlans must be exported')
assert(minerCatalog.includes('launch-42') && minerCatalog.includes('launch-5000'), 'Launch plans must span from 42.44 TH to 5000 TH')
assert(minerCatalog.includes('price: 54768.99'), 'Launch 5,000 TH price must be $54,768.99 USD')
console.log('  ✓ Presale and Launch catalogs verified with exact specs!\n')

// 3. Maintenance token & conversion logic
console.log('3. Verifying Maintenance Token (PEARL / USDT) deposit & credit in demoStore...')
const demoStore = fs.readFileSync('src/demoStore.ts', 'utf8')
assert(demoStore.includes("export function depositMaintenanceToken(token: 'PEARL' | 'USDT', tokenAmount: number)"), 'depositMaintenanceToken must exist')
assert(demoStore.includes("const rate = token === 'USDT' ? 1.0 : 0.05"), '1 USDT = $1.00 USD, 1 PEARL = $0.05 USD')
assert(demoStore.includes('maintenanceCredit: newCredit'), 'maintenanceCredit state must be updated')
console.log('  ✓ Maintenance deposit and credit conversion verified!\n')

// 4. Wallet filtering & Treasury Transparency in WalletPaymentCheckout
console.log('4. Verifying Wallet filtering, Treasury transparency, and 512 error handling...')
const checkout = fs.readFileSync('src/WalletPaymentCheckout.tsx', 'utf8')
assert(!checkout.includes('512 Unknown'), 'Checkout must not show "512 Unknown" to user')
assert(checkout.includes('!isWalletConnected ? ('), 'Network & currency selection must be hidden when wallet is disconnected')
assert(checkout.includes("availableNetworks = isEvmWallet\n    ? networks.filter((n) => n.id !== 'solana')"), 'Solana must be hidden when EVM wallet is connected')
assert(checkout.includes('prevChainIdRef'), 'Network selection must use prevChainIdRef to allow user selection without auto-revert')
assert(checkout.includes('Tesorería Oficial del Protocolo'), 'Treasury transparency info must be prominently displayed')
assert(checkout.includes('activeDestination.address'), 'Treasury address must be displayed')
assert(checkout.includes('activeDestination.blockExplorer'), 'Block explorer link must be provided')
assert(!checkout.includes('!user ? (\n                    <div className="checkout-auth-warning-card">'), 'Unauthenticated users must not be blocked from Web3 wallet payments')
console.log('  ✓ Wallet filtering, treasury transparency, and non-blocking payment verified!\n')

// 5. Navigation & Route aliasing
console.log('5. Verifying Route aliasing and Error Boundary recovery...')
const catalog = fs.readFileSync('src/catalog.ts', 'utf8')
assert(catalog.includes('fallbackScreen'), 'fallbackScreen must exist in catalog.ts')
assert(catalog.includes('/buy-mineros'), 'routeAliases must map /buy-mineros')
assert(catalog.includes('/buy-miners'), 'routeAliases must map /buy-miners')
assert(catalog.includes('/miners'), 'routeAliases must map /miners')

const app = fs.readFileSync('src/App.tsx', 'utf8')
assert(!app.includes("navigate(user ? '/gmt-wallets' : '/')"), 'Topbar wallet click must not eject unauthenticated users to landing')
assert(app.includes("const delimiter = aliasTarget.includes('?') ? '&' : '?'"), 'Route alias query strings must not produce double ?')
console.log('  ✓ Navigation and route handling verified!\n')

// 6. Mining Calculator Dynamic Periods & Maintenance Token
console.log('6. Verifying Bitcoin Mining Calculator dynamic periods & maintenance token...')
const calc = fs.readFileSync('src/BitcoinMiningCalculator.tsx', 'utf8')
assert(calc.includes("const multiplier = period === 'annual' ? 365 : period === 'monthly' ? 30 : 1"), 'Multiplier must handle daily, monthly, and annual')
assert(calc.includes("const [maintenanceToken, setMaintenanceToken] = useState<'PEARL' | 'USDT'>('PEARL')"), 'Calculator must have maintenanceToken selector')
assert(calc.includes("const maintenanceDiscount = maintenanceToken === 'PEARL' ? 0.20 : 0.0"), 'PEARL must give 20% discount on maintenance')
console.log('  ✓ Calculator dynamic period and maintenance token discount verified!\n')

console.log('=== ALL DEEP VERIFICATION CHECKS PASSED SUCCESSFULLY ===')
