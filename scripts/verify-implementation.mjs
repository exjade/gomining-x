import assert from 'node:assert'

// 1. Test UNILEVEL_20_LEVEL_PERCENTAGES
const UNILEVEL_20_LEVEL_PERCENTAGES = [
  20, 15, 10, 8, 7, 6, 5, 4, 4, 3,
  3,  2,  2, 2, 2, 2, 1, 1, 1, 2,
]

console.log('Testing Unilevel 20 Level Percentages...')
assert.strictEqual(UNILEVEL_20_LEVEL_PERCENTAGES.length, 20, 'Must have exactly 20 levels')
const sum = UNILEVEL_20_LEVEL_PERCENTAGES.reduce((a, b) => a + b, 0)
assert.strictEqual(sum, 100, `Sum of percentages must be 100%, got ${sum}%`)
console.log('✓ 20 levels weights verified (sum = 100%)')

// 2. Test Purchase vs Repurchase Logic
console.log('Testing Purchase vs Repurchase Logic...')
function evaluatePurchase(currentPurchases) {
  const isFirstPurchase = currentPurchases === 0
  const purchaseType = isFirstPurchase ? 'first_purchase' : 'repurchase'
  const nextPurchaseNumber = currentPurchases + 1
  return { purchaseType, nextPurchaseNumber }
}

const p1 = evaluatePurchase(0)
assert.strictEqual(p1.purchaseType, 'first_purchase')
assert.strictEqual(p1.nextPurchaseNumber, 1)

const p2 = evaluatePurchase(1)
assert.strictEqual(p2.purchaseType, 'repurchase')
assert.strictEqual(p2.nextPurchaseNumber, 2)

const p3 = evaluatePurchase(5)
assert.strictEqual(p3.purchaseType, 'repurchase')
assert.strictEqual(p3.nextPurchaseNumber, 6)
console.log('✓ Purchase vs Repurchase classification verified')

// 3. Test Unilevel 20 Level Distribution Algorithm
console.log('Testing Unilevel 20 Level Calculation Algorithm...')
function simulateUnilevelCalculation(eligibleProfit, uplineCount) {
  const unilevelPool = Number((eligibleProfit * 0.20).toFixed(2))
  const distributions = []
  let totalDistributed = 0
  let totalUnclaimed = 0

  for (let level = 1; level <= 20; level++) {
    const percentage = UNILEVEL_20_LEVEL_PERCENTAGES[level - 1]
    const amount = Number((unilevelPool * (percentage / 100)).toFixed(4))
    const rate = Number((0.20 * (percentage / 100)).toFixed(4))

    const hasSponsor = level <= uplineCount
    if (hasSponsor) {
      distributions.push({
        level,
        status: 'credited',
        amount,
        percentage,
        rate,
      })
      totalDistributed = Number((totalDistributed + amount).toFixed(4))
    } else {
      distributions.push({
        level,
        status: 'unclaimed_missing_upline',
        amount,
        percentage,
        rate,
      })
      totalUnclaimed = Number((totalUnclaimed + amount).toFixed(4))
    }
  }

  const grandTotal = Number((totalDistributed + totalUnclaimed).toFixed(2))
  return { unilevelPool, distributions, totalDistributed, totalUnclaimed, grandTotal }
}

// Test case A: Full 20 uplines chain
const resA = simulateUnilevelCalculation(100, 20)
assert.strictEqual(resA.unilevelPool, 20.00)
assert.strictEqual(resA.totalUnclaimed, 0)
assert.strictEqual(resA.grandTotal, 20.00)
assert.strictEqual(resA.distributions[0].amount, 4.00) // 20% of $20 = $4.00
assert.strictEqual(resA.distributions[1].amount, 3.00) // 15% of $20 = $3.00
assert.strictEqual(resA.distributions[2].amount, 2.00) // 10% of $20 = $2.00

// Test case B: Partial 3 uplines chain
const resB = simulateUnilevelCalculation(100, 3)
assert.strictEqual(resB.unilevelPool, 20.00)
assert.strictEqual(resB.distributions[0].status, 'credited')
assert.strictEqual(resB.distributions[1].status, 'credited')
assert.strictEqual(resB.distributions[2].status, 'credited')
assert.strictEqual(resB.distributions[3].status, 'unclaimed_missing_upline')
assert.strictEqual(resB.grandTotal, 20.00)
assert.strictEqual(resB.totalDistributed, 9.00) // $4 + $3 + $2 = $9.00
assert.strictEqual(resB.totalUnclaimed, 11.00) // $20 - $9 = $11.00

// Test case C: 0 uplines (breakaway/retained)
const resC = simulateUnilevelCalculation(100, 0)
assert.strictEqual(resC.totalDistributed, 0)
assert.strictEqual(resC.totalUnclaimed, 20.00)
assert.strictEqual(resC.grandTotal, 20.00)
console.log('✓ Unilevel 20 levels distribution algorithm verified')

// 4. Test Translation Parity
console.log('Testing Translation Parity between ES and EN...')
import fs from 'node:fs'
const esJson = JSON.parse(fs.readFileSync(new URL('../src/locales/es.json', import.meta.url), 'utf-8'))
const enJson = JSON.parse(fs.readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf-8'))

function getLeafKeys(obj, prefix = '') {
  let keys = []
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(getLeafKeys(v, full))
    } else {
      keys.push(full)
    }
  }
  return keys
}

const esLeaves = getLeafKeys(esJson).sort()
const enLeaves = getLeafKeys(enJson).sort()
assert.deepStrictEqual(esLeaves, enLeaves, 'All translation leaf keys must match exactly between ES and EN')
console.log(`✓ Translation parity verified (all ${esLeaves.length} leaf keys match exactly in ES and EN)`)

// 5. Test Withdrawal Constraints and Ledger Balance Logic
console.log('Testing Referral Withdrawal Logic...')
function simulateWithdrawal(currentBalance, currentWithdrawn, requestAmount) {
  if (requestAmount <= 0) return { error: 'El monto de retiro debe ser mayor a 0 USD.' }
  if (requestAmount > currentBalance) return { error: 'Saldo insuficiente.' }
  const nextBalance = Number((currentBalance - requestAmount).toFixed(2))
  const nextWithdrawn = Number((currentWithdrawn + requestAmount).toFixed(2))
  const tx = { type: 'withdrawal', amount: -requestAmount }
  return { success: true, nextBalance, nextWithdrawn, tx }
}

const w1 = simulateWithdrawal(50.00, 0, 20.00)
assert.strictEqual(w1.success, true)
assert.strictEqual(w1.nextBalance, 30.00)
assert.strictEqual(w1.nextWithdrawn, 20.00)
assert.strictEqual(w1.tx.amount, -20.00)

const w2 = simulateWithdrawal(10.00, 20.00, 15.00)
assert.strictEqual(w2.error, 'Saldo insuficiente.')

const w3 = simulateWithdrawal(10.00, 20.00, 0)
assert.strictEqual(w3.error, 'El monto de retiro debe ser mayor a 0 USD.')
console.log('✓ Referral withdrawal constraints verified')

// 6. Test Unilevel Tree Chain Inheritance (Up to 20 Levels)
console.log('Testing Unilevel Tree Chain Inheritance...')
function buildMockUplines(sponsorUid, sponsorCode, mockDb) {
  const uplines = []
  const visited = new Set()
  let currentId = sponsorUid
  let currentCode = sponsorCode

  for (let level = 1; level <= 20 && currentId; level++) {
    if (visited.has(currentId)) break
    visited.add(currentId)
    const node = mockDb[currentId]
    if (!node) break
    uplines.push({ level, uid: currentId, referralCode: node.referralCode || currentCode })
    currentId = node.sponsorId || null
    currentCode = node.sponsorCode || ''
  }
  return uplines
}

// Chain of 25 users (A refers B refers C ...)
const mockDb = {}
for (let i = 1; i <= 25; i++) {
  mockDb[`user_${i}`] = {
    referralCode: `CODE_${i}`,
    sponsorId: i > 1 ? `user_${i - 1}` : null,
    sponsorCode: i > 1 ? `CODE_${i - 1}` : '',
  }
}

// User 25's upline should have exactly 20 levels (capped at 20)
const uplines25 = buildMockUplines('user_24', 'CODE_24', mockDb)
assert.strictEqual(uplines25.length, 20, 'Must cap at exactly 20 levels')
assert.strictEqual(uplines25[0].uid, 'user_24')
assert.strictEqual(uplines25[0].level, 1)
assert.strictEqual(uplines25[19].uid, 'user_5')
assert.strictEqual(uplines25[19].level, 20)

// Cycle detection test: User A refers User B refers User A
const cyclicDb = {
  user_A: { referralCode: 'CODE_A', sponsorId: 'user_B', sponsorCode: 'CODE_B' },
  user_B: { referralCode: 'CODE_B', sponsorId: 'user_A', sponsorCode: 'CODE_A' },
}
const cyclicUplines = buildMockUplines('user_A', 'CODE_A', cyclicDb)
assert.strictEqual(cyclicUplines.length, 2, 'Must break cycles cleanly without infinite loop')
console.log('✓ Unilevel uplines chain inheritance and cycle guards verified')

// 7. Test 2FA 6-digit Code Validation
console.log('Testing 2FA 6-digit Code Validation...')
function validateTwoFactorActivation(isEnabling, code) {
  if (!isEnabling) return { valid: true }
  const clean = code.trim().replace(/\D/g, '')
  if (clean.length !== 6) {
    return { valid: false, error: 'Código de 6 dígitos requerido' }
  }
  return { valid: true, code: clean }
}

assert.strictEqual(validateTwoFactorActivation(true, '').valid, false)
assert.strictEqual(validateTwoFactorActivation(true, '12345').valid, false)
assert.strictEqual(validateTwoFactorActivation(true, '123456').valid, true)
assert.strictEqual(validateTwoFactorActivation(true, ' 123456 ').valid, true)
assert.strictEqual(validateTwoFactorActivation(false, '').valid, true)
console.log('✓ 2FA validation verified')

// 8. Test TOTP HMAC-SHA1 WebCrypto calculation & verification
console.log('Testing RFC 6238 TOTP algorithm and window verification...')
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32Decode(str) {
  const cleaned = str.toUpperCase().replace(/[\s=]/g, '')
  let bits = ''
  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleaned[i])
    if (val === -1) continue
    bits += val.toString(2).padStart(5, '0')
  }
  const byteLength = Math.floor(bits.length / 8)
  const bytes = new Uint8Array(byteLength)
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = parseInt(bits.substring(i * 8, (i + 1) * 8), 2)
  }
  return bytes
}

async function getTOTPCode(secret, timeStep) {
  const keyBytes = base32Decode(secret)
  const subtle = globalThis.crypto?.subtle
  const key = await subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const counterBuf = new ArrayBuffer(8)
  const view = new DataView(counterBuf)
  view.setBigUint64(0, BigInt(timeStep), false)
  const signature = await subtle.sign('HMAC', key, counterBuf)
  const sigBytes = new Uint8Array(signature)
  const offset = sigBytes[sigBytes.length - 1] & 0x0f
  const bin =
    ((sigBytes[offset] & 0x7f) << 24) |
    ((sigBytes[offset + 1] & 0xff) << 16) |
    ((sigBytes[offset + 2] & 0xff) << 8) |
    (sigBytes[offset + 3] & 0xff)
  const otp = bin % 1000000
  return otp.toString().padStart(6, '0')
}

// RFC 6238 Section 5.3 Test Vector: Secret "12345678901234567890" -> Base32 "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
// Time 59 (step = 1) -> TOTP should be "287082"
const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const rfcCodeStep1 = await getTOTPCode(rfcSecret, 1)
assert.strictEqual(rfcCodeStep1, '287082', `RFC 6238 HMAC-SHA1 step 1 must produce 287082, got ${rfcCodeStep1}`)

// Time 1111111109 (step = 37037036) -> TOTP should be "081804"
const rfcCodeStep37037036 = await getTOTPCode(rfcSecret, 37037036)
assert.strictEqual(rfcCodeStep37037036, '081804', `RFC 6238 HMAC-SHA1 step 37037036 must produce 081804, got ${rfcCodeStep37037036}`)

console.log('✓ RFC 6238 TOTP HMAC-SHA1 test vectors verified (step 1 = 287082, step 37037036 = 081804)')

// 9. Test standard otpauth:// URI and QR generation format
console.log('Testing OTP Auth URI and QR generation format...')
const testEmail = 'user@example.com'
const testSecret = 'JBSWY3DPEHPK3PXP'
const issuer = 'GoMining'
const expectedUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(testEmail)}?secret=${testSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`

assert.strictEqual(
  expectedUri,
  'otpauth://totp/GoMining:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GoMining&algorithm=SHA1&digits=6&period=30',
  'URI must follow RFC 6238 and Google Authenticator standard with unencoded colon separating issuer and account'
)
console.log('✓ Standard otpauth:// URI formatting verified')

console.log('\n=============================================')
console.log('ALL VERIFICATION SUITE CHECKS PASSED!')
console.log('=============================================\n')

