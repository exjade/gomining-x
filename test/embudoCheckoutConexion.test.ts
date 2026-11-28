import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { resolvePostPaymentTransition } from '../src/components/embudo-f1/funnelState.ts'
import { saveOwnedMinerAppearance } from '../src/nft-miners/miner-customization-repository.ts'

const ROOT = path.resolve(import.meta.dirname, '..')

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function sha256File(relPath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, relPath))).digest('hex')
}

test('EMBUDO-CHECKOUT-CONEXION (1): firebase.ts wires connectFunctionsEmulator under useFirebaseEmulators without touching payment tail', () => {
  const firebaseSrc = readRepoFile('src/firebase.ts')

  assert.match(
    firebaseSrc,
    /import\s*\{\s*getFunctions,\s*connectFunctionsEmulator\s*\}\s*from\s*'firebase\/functions'/,
  )
  assert.match(firebaseSrc, /export const functions = getFunctions\(app\)/)

  const emulatorBlockMatch = firebaseSrc.match(/if \(useFirebaseEmulators\)\s*\{[\s\S]*?emulatorGuard\.__firebaseEmulatorsConnected = true\s*\}\s*\}/)
  assert.ok(emulatorBlockMatch, 'useFirebaseEmulators connection guard block must exist in src/firebase.ts')
  const emulatorBlock = emulatorBlockMatch[0]
  assert.match(emulatorBlock, /VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST\s*\|\|\s*'127\.0\.0\.1'/)
  assert.match(emulatorBlock, /VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT\s*\|\|\s*5001/)
  assert.match(emulatorBlock, /connectFunctionsEmulator\(functions,\s*functionsEmulatorHost,\s*functionsEmulatorPort\)/)

  // Payment, miner persistence, and unilevel/commission tail must stay byte-identical to f2e9c8a
  const baseFirebase = execFileSync('git', ['show', 'f2e9c8a:src/firebase.ts'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  const baseTail = baseFirebase.slice(baseFirebase.indexOf('/** Saves purchased miner to Firestore'))
  const curTail = firebaseSrc.slice(firebaseSrc.indexOf('/** Saves purchased miner to Firestore'))
  assert.equal(curTail, baseTail)
})

test('EMBUDO-CHECKOUT-CONEXION (2): App.tsx onPaid honors resolvePostPaymentTransition destination (verify-email, dashboard /home, and /miners/:id/customize)', () => {
  const appSrc = readRepoFile('src/App.tsx')
  const onPaidMatch = appSrc.match(/onPaid=\{\(receipt: PaymentReceipt\) => \{[\s\S]*?\}\} \/>\}/)
  assert.ok(onPaidMatch, 'WalletPaymentCheckout onPaid block must exist in src/App.tsx')
  const onPaidBlock = onPaidMatch[0]

  // Must delegate destination directly to postPayment.destination and never hijack to /nft-miners/
  assert.doesNotMatch(onPaidBlock, /\/nft-miners\//)
  assert.match(onPaidBlock, /const postPayment = resolvePostPaymentTransition\(/)
  assert.match(onPaidBlock, /if \(postPayment\.openVerifyEmailModal\)\s*\{\s*advanceEmbudoF1Stage\('verify-email'/)
  assert.match(onPaidBlock, /else if \(postPayment\.nextStage === 'dashboard'\)\s*\{\s*clearEmbudoF1State\(\)/)
  assert.match(onPaidBlock, /navigate\(postPayment\.destination,\s*\{\s*replace:\s*true\s*\}\)\s*openAuthModal\('verify-email'\)/)
  assert.match(onPaidBlock, /navigate\(postPayment\.destination\)/)

  // Verify the 4 canonical resolvePostPaymentTransition outputs honored by onPaid
  const unverified = resolvePostPaymentTransition({
    isFunnelActive: true,
    isAuthenticated: true,
    isEmailVerified: false,
    minerId: 'miner_pi_123',
  })
  assert.equal(unverified.destination, '/home')
  assert.equal(unverified.openVerifyEmailModal, true)
  assert.equal(unverified.nextStage, 'verify-email')

  const funnelVerified = resolvePostPaymentTransition({
    isFunnelActive: true,
    isAuthenticated: true,
    isEmailVerified: true,
    minerId: 'miner_pi_123',
  })
  assert.equal(funnelVerified.destination, '/home')
  assert.equal(funnelVerified.openVerifyEmailModal, false)
  assert.equal(funnelVerified.nextStage, 'dashboard')

  const nonFunnelVerified = resolvePostPaymentTransition({
    isFunnelActive: false,
    isAuthenticated: true,
    isEmailVerified: true,
    minerId: 'miner_pi_123',
  })
  assert.equal(nonFunnelVerified.destination, '/miners/miner_pi_123/customize')
  assert.equal(nonFunnelVerified.openVerifyEmailModal, false)
  assert.equal(nonFunnelVerified.nextStage, 'idle')

  const unauth = resolvePostPaymentTransition({
    isFunnelActive: false,
    isAuthenticated: false,
    isEmailVerified: false,
    minerId: 'miner_pi_123',
  })
  assert.equal(unauth.destination, '/')
  assert.equal(unauth.openVerifyEmailModal, false)
})

test('EMBUDO-CHECKOUT-CONEXION (3): App.tsx persists skin via direct cosmetic updateDoc allowed by firestore.rules without assertNotProductionFirestore', async () => {
  const appSrc = readRepoFile('src/App.tsx')

  assert.match(appSrc, /import\s*\{\s*doc,\s*updateDoc\s*\}\s*from\s*'firebase\/firestore'/)
  assert.match(
    appSrc,
    /const updateCosmeticMinerDirect =[\s\S]*?updateDoc\(doc\(db,\s*'miners',\s*ownerUid,\s*'miner',\s*targetMinerId\),\s*updates(?:\s+as\s+UpdateData<DocumentData>)?\)/,
  )

  const writerCalls = appSrc.match(/saveOwnedMinerAppearance\([\s\S]*?updateCosmeticMinerDirect,\s*\)/g) ?? []
  assert.equal(writerCalls.length, 2, 'Both platform-balance onComplete and wallet onPaid must pass updateCosmeticMinerDirect')

  // Verify payload produced by saveOwnedMinerAppearance with injected cosmetic writer satisfies firestore.rules isValidCosmeticMinerUpdate()
  const writes: Array<{ uid: string; minerId: string; updates: Record<string, unknown> }> = []
  const appearance = {
    wall_id: 'wall-blue',
    updatedAt: '2026-11-27T16:00:00.000Z',
  }
  await saveOwnedMinerAppearance('uid_prod_buyer', 'miner_pi_abc', appearance, async (ownerUid, targetMinerId, updates) => {
    writes.push({ uid: ownerUid, minerId: targetMinerId, updates })
  })

  assert.equal(writes.length, 1)
  assert.equal(writes[0].uid, 'uid_prod_buyer')
  assert.equal(writes[0].minerId, 'miner_pi_abc')
  assert.deepEqual(Object.keys(writes[0].updates), ['appearance'])
  assert.equal(typeof writes[0].updates.appearance, 'object')
})

test('EMBUDO-CHECKOUT-CONEXION (4): Zero forbidden legacy purchase calls, zero invented callables, and Eldrin/auth-gate/leads files untouched', () => {
  const appSrc = readRepoFile('src/App.tsx')

  for (const forbidden of [
    'completeWalletMinerPurchase',
    'retryWalletMinerPurchase',
    'orchestrateWalletMinerPurchaseFlow',
    'recordMinerPurchaseToAdmin',
    'getPaymentIntentStatus',
  ]) {
    assert.equal(
      appSrc.includes(forbidden),
      false,
      `src/App.tsx must NEVER reference forbidden identifier: ${forbidden}`,
    )
  }

  const protectedEldrinFiles = [
    'src/WalletPaymentCheckout.tsx',
    'src/services/payments/paymentGatewayClient.ts',
    'src/services/payments/checkoutIntentCoordinator.ts',
    'src/paymentDestinations.ts',
    'src/paymentQuote.ts',
    'src/tronPayment.ts',
    'src/solanaPayment.ts',
    'firestore.rules',
  ]
  const diffOut = execFileSync('git', ['diff', '--name-only', 'f2e9c8a', '--', ...protectedEldrinFiles], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()
  assert.equal(diffOut, '', `Eldrin files must have zero diff vs f2e9c8a: ${diffOut}`)

  assert.equal(sha256File('src/WalletPaymentCheckout.tsx'), 'cf133aeca6fdf0aa1faa2c76016a5a75bb60ed5b4efef6dd45decc4eb6b974d1')
  assert.equal(sha256File('src/AuthContext.tsx'), '94bbd0c1dc6871abe4937312d8c14176f3d3506f35096273ad4a19374b6d77fc')
  assert.equal(sha256File('src/authRoutePolicy.ts'), '2eb67f4db450ef448bb4eb839fe26a769a1240444ec9493492efa8312f16a5f4')
  assert.equal(sha256File('src/ReferralPage.tsx'), 'd3b4d651f0c37c9a38ac5da9a6ebb3dc1c43cc7dcdb2fe4b90e6579d170518d6')
})
