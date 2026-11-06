import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

console.log('--- Verifying minerCatalog ---')
const minerCatalogSource = fs.readFileSync(path.resolve('src/minerCatalog.ts'), 'utf8')
assert(!minerCatalogSource.includes('MXN'), 'minerCatalog.ts must not contain MXN')
assert(!minerCatalogSource.includes('priceMxn'), 'minerCatalog.ts must not contain priceMxn')

// Import compiled or transpile
console.log('--- Verifying paymentQuote ---')
const paymentQuoteSource = fs.readFileSync(path.resolve('src/paymentQuote.ts'), 'utf8')
assert(!paymentQuoteSource.includes('MXN'), 'paymentQuote.ts must not contain MXN')
assert(!paymentQuoteSource.includes('usdMxnRate'), 'paymentQuote.ts must not contain usdMxnRate')

console.log('--- Verifying WalletPaymentCheckout ---')
const checkoutSource = fs.readFileSync(path.resolve('src/WalletPaymentCheckout.tsx'), 'utf8')
assert(!checkoutSource.includes('512 Unknown'), 'WalletPaymentCheckout.tsx must not show 512 Unknown to user')
assert(checkoutSource.includes('!isWalletConnected'), 'Must check !isWalletConnected before showing networks and currencies')
assert(checkoutSource.includes('Tesorería Oficial del Protocolo'), 'Must show Protocol Treasury transparent info')

console.log('--- Verifying App.tsx ---')
const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8')
assert(!appSource.includes('MXN'), 'App.tsx must not contain MXN')
assert(!appSource.includes('!user && !isPublicRoute'), 'App.tsx must not forcibly redirect unauthenticated users to landing')
assert(appSource.includes('launchMinerPlans.map'), 'App.tsx must map over all launchMinerPlans without slicing')
assert(appSource.includes('presaleMinerPlans'), 'App.tsx must include presaleMinerPlans')

console.log('--- Verifying walletSession.ts ---')
const walletSessionSource = fs.readFileSync(path.resolve('src/walletSession.ts'), 'utf8')
assert(!walletSessionSource.includes('512 Unknown'), 'walletSession.ts must not throw 512 Unknown error string')

console.log('All static assertions passed!')
