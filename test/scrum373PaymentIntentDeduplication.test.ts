import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  buildCheckoutProductSignature,
  canMutateIntentMethodInPlace,
  generateCheckoutIdempotencyKey,
  resolvePendingMethodSyncKey,
  runDeduplicatedIntentInit,
} from '../src/services/payments/checkoutIntentCoordinator.ts'
import type { PaymentIntentRecord, PaymentIntentStatus } from '../src/services/payments/paymentGatewayClient.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const EXPECTED_RULES_SHA256 = 'F4313C04DD7595E1C84D8977299169EEA38C2B250F96E6916D68959CDAAA6779'
const BACKEND_IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(projectRoot, relPath), 'utf8')
}

function extractBlock(src: string, anchor: string): string {
  const start = src.indexOf(anchor)
  assert.notEqual(start, -1, `Expected to find "${anchor}"`)
  const openBrace = src.indexOf('{', start)
  assert.notEqual(openBrace, -1, `Expected opening brace for "${anchor}"`)
  let depth = 0
  for (let i = openBrace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) {
        return src.slice(start, i + 1)
      }
    }
  }
  throw new Error(`Unclosed block for "${anchor}"`)
}

function makeIntentFixture(overrides: Partial<PaymentIntentRecord> = {}): PaymentIntentRecord {
  return {
    intentId: 'pi_1234567890abcdef1234567890abcdef',
    orderId: 'pi_1234567890abcdef1234567890abcdef',
    userId: 'u1',
    buyerUid: 'u1',
    status: 'AWAITING',
    productType: 'miner',
    commissionEligible: true,
    packageId: 'minerx-02',
    packageName: '8.33 TH',
    powerTh: 8.33,
    efficiencyWattsPerTh: 15,
    amountUsd: 99.99,
    amountMicroUsdt: '99990000',
    netPaidUsdt: '99.990000',
    networkMode: 'testnet',
    paymentNetwork: 'bsc',
    chainId: 97,
    paymentAsset: 'USDT',
    assetDecimals: 18,
    tokenContractAddress: '0x2222222222222222222222222222222222222222',
    expectedAmountAtomic: '99990000000000000000',
    expectedAmountDisplay: '99.99',
    quotedSpotUsd: '1',
    quoteSource: 'FIXED_STABLECOIN_PEG',
    quotedAt: '2026-11-24T10:00:00.000Z',
    treasuryAddress: '0x1111111111111111111111111111111111111111',
    senderWallet: '0x9999999999999999999999999999999999999999',
    confirmations: 0,
    requiredConfirmations: 15,
    txHash: null,
    activatedMinerId: null,
    createdAt: '2026-11-24T10:00:00.000Z',
    updatedAt: '2026-11-24T10:00:00.000Z',
    expiresAt: '2026-11-24T10:15:00.000Z',
    ...overrides,
  }
}

describe('SCRUM-373: Client PaymentIntent Deduplication & In-Place Method Re-Selection', () => {
  it('1. generateCheckoutIdempotencyKey produces unique chk_<32hex> keys valid for backend idempotency regex', () => {
    const k1 = generateCheckoutIdempotencyKey()
    const k2 = generateCheckoutIdempotencyKey()
    assert.match(k1, /^chk_[a-f0-9]{32}$/)
    assert.match(k2, /^chk_[a-f0-9]{32}$/)
    assert.match(k1, BACKEND_IDEMPOTENCY_PATTERN)
    assert.notEqual(k1, k2)
  })

  it('2. buildCheckoutProductSignature produces deterministic product keys sensitive to uid, productType, packageId, and powerTh', () => {
    const base = buildCheckoutProductSignature({
      uid: ' u1 ',
      productType: 'miner',
      packageId: ' minerx-02 ',
    })
    const same = buildCheckoutProductSignature({
      uid: 'u1',
      productType: 'miner',
      packageId: 'minerx-02',
    })
    const diffUser = buildCheckoutProductSignature({
      uid: 'u2',
      productType: 'miner',
      packageId: 'minerx-02',
    })
    const diffType = buildCheckoutProductSignature({
      uid: 'u1',
      productType: 'subscription',
      packageId: 'minerx-02',
    })
    const diffPkg = buildCheckoutProductSignature({
      uid: 'u1',
      productType: 'miner',
      packageId: 'minerx-03',
    })
    const custom16 = buildCheckoutProductSignature({
      uid: 'u1',
      productType: 'miner',
      powerTh: 16,
    })
    const custom32 = buildCheckoutProductSignature({
      uid: 'u1',
      productType: 'miner',
      powerTh: 32,
    })

    assert.equal(base, same)
    assert.notEqual(base, diffUser)
    assert.notEqual(base, diffType)
    assert.notEqual(base, diffPkg)
    assert.notEqual(custom16, custom32)
    assert.notEqual(base, custom16)
  })

  it('3. runDeduplicatedIntentInit coalesces React.StrictMode concurrent calls and releases on resolve and reject', async () => {
    const key = generateCheckoutIdempotencyKey()
    const fixture = makeIntentFixture()
    let invocations = 0

    const [first, second] = await Promise.all([
      runDeduplicatedIntentInit(key, async () => {
        invocations += 1
        await new Promise((r) => setTimeout(r, 15))
        return fixture
      }),
      runDeduplicatedIntentInit(key, async () => {
        invocations += 1
        await new Promise((r) => setTimeout(r, 15))
        return makeIntentFixture({ intentId: 'pi_should_never_run' })
      }),
    ])

    assert.equal(invocations, 1, 'StrictMode dual mount must coalesce to exactly 1 createPaymentIntent call')
    assert.equal(first.intentId, fixture.intentId)
    assert.equal(second.intentId, fixture.intentId)

    // Independent keys do not coalesce with each other
    const keyA = generateCheckoutIdempotencyKey()
    const keyB = generateCheckoutIdempotencyKey()
    let independentCount = 0
    const [resA, resB] = await Promise.all([
      runDeduplicatedIntentInit(keyA, async () => {
        independentCount += 1
        return makeIntentFixture({ intentId: 'pi_a' })
      }),
      runDeduplicatedIntentInit(keyB, async () => {
        independentCount += 1
        return makeIntentFixture({ intentId: 'pi_b' })
      }),
    ])
    assert.equal(independentCount, 2)
    assert.equal(resA.intentId, 'pi_a')
    assert.equal(resB.intentId, 'pi_b')

    // Rejection cleans up in-flight map so subsequent retry executes cleanly
    const failKey = generateCheckoutIdempotencyKey()
    let attempts = 0
    await assert.rejects(
      () => Promise.all([
        runDeduplicatedIntentInit(failKey, async () => {
          attempts += 1
          await new Promise((r) => setTimeout(r, 10))
          throw new Error('TRANSIENT_RPC_ERROR')
        }),
        runDeduplicatedIntentInit(failKey, async () => {
          attempts += 1
          throw new Error('SHOULD_NOT_RUN')
        }),
      ]),
      /TRANSIENT_RPC_ERROR/,
    )
    assert.equal(attempts, 1)

    const retried = await runDeduplicatedIntentInit(failKey, async () => {
      attempts += 1
      return makeIntentFixture({ intentId: 'pi_recovered' })
    })
    assert.equal(attempts, 2)
    assert.equal(retried.intentId, 'pi_recovered')
  })

  it('4. canMutateIntentMethodInPlace allows only unexpired OPEN/AWAITING without txHash', () => {
    const validNow = Date.parse('2026-11-24T10:05:00.000Z')
    const expiredNow = Date.parse('2026-11-24T10:15:01.000Z')

    assert.equal(canMutateIntentMethodInPlace(null, validNow), false)
    assert.equal(canMutateIntentMethodInPlace(undefined, validNow), false)
    assert.equal(canMutateIntentMethodInPlace(makeIntentFixture({ status: 'OPEN', txHash: null }), validNow), true)
    assert.equal(canMutateIntentMethodInPlace(makeIntentFixture({ status: 'AWAITING', txHash: null }), validNow), true)

    // Blocked when txHash present or expired
    assert.equal(
      canMutateIntentMethodInPlace(makeIntentFixture({ status: 'AWAITING', txHash: '0x1234' }), validNow),
      false,
    )
    assert.equal(
      canMutateIntentMethodInPlace(makeIntentFixture({ status: 'AWAITING', isExpired: true }), validNow),
      false,
    )
    assert.equal(
      canMutateIntentMethodInPlace(makeIntentFixture({ status: 'AWAITING', txHash: null }), expiredNow),
      false,
    )

    // Blocked for all 6 non-selectable statuses
    const blockedStatuses: PaymentIntentStatus[] = [
      'PROCESSING',
      'SETTLED',
      'UNDERPAID',
      'FAILED',
      'EXPIRED',
      'CANCELLED',
    ]
    for (const status of blockedStatuses) {
      assert.equal(
        canMutateIntentMethodInPlace(makeIntentFixture({ status, txHash: null }), validNow),
        false,
        `Status ${status} must NOT allow in-place method mutation`,
      )
    }
  })

  it('5. paymentGatewayClient.ts declares and forwards idempotencyKey in createPaymentIntent', () => {
    const gatewaySrc = readText('src/services/payments/paymentGatewayClient.ts')
    const inputBlock = extractBlock(gatewaySrc, 'export interface CreatePaymentIntentInput')
    assert.match(inputBlock, /\bidempotencyKey\?:\s*string\b/)

    const fnBlock = extractBlock(gatewaySrc, 'export async function createPaymentIntent')
    assert.match(fnBlock, /payload\.idempotencyKey\s*=\s*input\.idempotencyKey\.trim\(\)/)
  })

  it('6. WalletPaymentCheckout.tsx uses idempotent init, in-place handleSelectNetworkOrAsset (zero METHOD_CHANGED cancel-and-recreate), and rotates key on createFreshIntent', () => {
    const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')

    assert.ok(checkoutSrc.includes('runDeduplicatedIntentInit'), 'Checkout must coalesce init via runDeduplicatedIntentInit')
    assert.ok(checkoutSrc.includes('generateCheckoutIdempotencyKey'), 'Checkout must generate session idempotency keys')
    assert.ok(checkoutSrc.includes('buildCheckoutProductSignature'), 'Checkout must bind session key to product signature')
    assert.ok(checkoutSrc.includes('canMutateIntentMethodInPlace'), 'Checkout must guard in-place updates via canMutateIntentMethodInPlace')
    assert.ok(checkoutSrc.includes('idempotencyKey:'), 'Checkout must pass idempotencyKey to createPaymentIntent')

    // handleSelectNetworkOrAsset must update in-place via selectPaymentMethod and NEVER cancel/recreate
    const selectHandler = extractBlock(checkoutSrc, 'const handleSelectNetworkOrAsset = async')
    assert.equal(selectHandler.includes('METHOD_CHANGED'), false, 'handleSelectNetworkOrAsset must not cancel with METHOD_CHANGED')
    assert.equal(selectHandler.includes('cancelPaymentIntent'), false, 'handleSelectNetworkOrAsset must not call cancelPaymentIntent')
    assert.equal(selectHandler.includes('createFreshIntent'), false, 'handleSelectNetworkOrAsset must not call createFreshIntent')
    assert.ok(selectHandler.includes('selectPaymentMethod'), 'handleSelectNetworkOrAsset must mutate in-place via selectPaymentMethod')
    assert.ok(selectHandler.includes('canMutateIntentMethodInPlace'), 'handleSelectNetworkOrAsset must check canMutateIntentMethodInPlace')
    assert.ok(selectHandler.includes('methodSeqRef'), 'handleSelectNetworkOrAsset must guard stale responses with methodSeqRef')
    assert.ok(selectHandler.includes('methodInFlightRef'), 'handleSelectNetworkOrAsset must block concurrent clicks with methodInFlightRef')

    // createFreshIntent must rotate sessionKeyRef and create directly in 1 call (no second selectPaymentMethod round-trip)
    const freshBlock = extractBlock(checkoutSrc, 'const createFreshIntent = useCallback')
    assert.ok(
      freshBlock.includes('sessionKeyRef.current =') && freshBlock.includes('generateCheckoutIdempotencyKey()'),
      'createFreshIntent must rotate sessionKeyRef before creating a fresh intent',
    )
    assert.ok(freshBlock.includes('idempotencyKey:'), 'createFreshIntent must pass rotated idempotencyKey')
    assert.ok(freshBlock.includes('networkId: toBackendPaymentNetworkId'), 'createFreshIntent must pass networkId directly')
    assert.equal(
      freshBlock.includes('selectPaymentMethod'),
      false,
      'createFreshIntent should create directly in AWAITING without a redundant selectPaymentMethod trip',
    )
  })

  it('7. Preserves firestore.rules byte-identical pure LF SHA-256 (F4313C04...)', () => {
    const rulesRaw = fs.readFileSync(path.resolve(projectRoot, 'firestore.rules'))
    assert.equal(rulesRaw.includes(0x0d), false, 'firestore.rules must remain pure LF (HAS_CR=false)')
    const actualSha256 = crypto.createHash('sha256').update(rulesRaw).digest('hex').toUpperCase()
    assert.equal(actualSha256, EXPECTED_RULES_SHA256)
  })

  it('8. resolvePendingMethodSyncKey detects OPEN->AWAITING, EVM case-insensitive vs Solana case-sensitive senderWallet drift, and suppresses infinite retry loops on matching failedSyncKey', () => {
    const validNow = Date.parse('2026-11-24T10:05:00.000Z')
    const evmLower = '0x99999999999999999999999999999999999999ab'
    const evmUpper = '0x99999999999999999999999999999999999999AB'
    const evmOther = '0x8888888888888888888888888888888888888888'
    const solA = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
    const solDifferentCase = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsu'

    // OPEN + connected wallet requires initial sync
    const openKey = resolvePendingMethodSyncKey({
      intent: makeIntentFixture({ status: 'OPEN', senderWallet: null, paymentNetwork: null, paymentAsset: null }),
      isWalletConnected: true,
      isEvmWallet: true,
      activeAddress: evmLower,
      targetNetworkId: 'bsc',
      targetAsset: 'USDT',
      failedSyncKey: null,
      nowMs: validNow,
    })
    assert.ok(openKey, 'OPEN intent with connected wallet must produce a sync key')

    // Same failedSyncKey suppresses infinite loop on transient error
    assert.equal(
      resolvePendingMethodSyncKey({
        intent: makeIntentFixture({ status: 'OPEN', senderWallet: null, paymentNetwork: null, paymentAsset: null }),
        isWalletConnected: true,
        isEvmWallet: true,
        activeAddress: evmLower,
        targetNetworkId: 'bsc',
        targetAsset: 'USDT',
        failedSyncKey: openKey,
        nowMs: validNow,
      }),
      null,
      'Matching failedSyncKey must prevent infinite retry loop',
    )

    // EVM checksum casing difference does NOT trigger redundant sync
    assert.equal(
      resolvePendingMethodSyncKey({
        intent: makeIntentFixture({ status: 'AWAITING', senderWallet: evmLower }),
        isWalletConnected: true,
        isEvmWallet: true,
        activeAddress: evmUpper,
        targetNetworkId: 'bsc',
        targetAsset: 'USDT',
        failedSyncKey: null,
        nowMs: validNow,
      }),
      null,
    )

    // Different EVM wallet address triggers in-place senderWallet sync
    const evmDriftKey = resolvePendingMethodSyncKey({
      intent: makeIntentFixture({ status: 'AWAITING', senderWallet: evmLower }),
      isWalletConnected: true,
      isEvmWallet: true,
      activeAddress: evmOther,
      targetNetworkId: 'bsc',
      targetAsset: 'USDT',
      failedSyncKey: null,
      nowMs: validNow,
    })
    assert.ok(evmDriftKey, 'Changed EVM activeAddress must trigger senderWallet sync')

    // Solana Base58 is case-sensitive: different case triggers sync
    assert.ok(
      resolvePendingMethodSyncKey({
        intent: makeIntentFixture({ status: 'AWAITING', paymentNetwork: 'solana', senderWallet: solA }),
        isWalletConnected: true,
        isEvmWallet: false,
        activeAddress: solDifferentCase,
        targetNetworkId: 'solana',
        targetAsset: 'SOL',
        failedSyncKey: null,
        nowMs: validNow,
      }),
    )

    // Terminal or txHash-locked intents never sync
    assert.equal(
      resolvePendingMethodSyncKey({
        intent: makeIntentFixture({ status: 'AWAITING', txHash: '0xabc', senderWallet: evmLower }),
        isWalletConnected: true,
        isEvmWallet: true,
        activeAddress: evmOther,
        targetNetworkId: 'bsc',
        targetAsset: 'USDT',
        failedSyncKey: null,
        nowMs: validNow,
      }),
      null,
    )
  })

  it('9. WalletPaymentCheckout.tsx prevents optimistic wrong-chain desync, Step 1/Step 2 methodUpdating deadlocks, missed wallet sync, and double-click createFreshIntent', () => {
    const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')

    // Important #1 / MEDIUM-02: handleSelectNetworkOrAsset must NOT commit networkId optimistically
    // before selectPaymentMethod resolves on the in-place path, and must pass nextNet destination name on error
    const selectHandler = extractBlock(checkoutSrc, 'const handleSelectNetworkOrAsset = async')
    const selectCallIdx = selectHandler.indexOf('await selectPaymentMethod(')
    const inPlaceTryIdx = selectHandler.indexOf('try {')
    assert.notEqual(selectCallIdx, -1)
    assert.notEqual(inPlaceTryIdx, -1)
    const inPlaceBranch = selectHandler.slice(inPlaceTryIdx)
    const setNetInPlaceIdx = inPlaceBranch.indexOf('setNetworkId(nextNet)')
    const selectInPlaceIdx = inPlaceBranch.indexOf('await selectPaymentMethod(')
    assert.ok(
      setNetInPlaceIdx > selectInPlaceIdx,
      'handleSelectNetworkOrAsset must only commit setNetworkId(nextNet) after selectPaymentMethod resolves on in-place path',
    )
    assert.equal(
      selectHandler.includes('classifyPaymentError(err, activeDestination.name)'),
      false,
      'handleSelectNetworkOrAsset must pass target destination name (nextNet), not stale activeDestination.name',
    )

    // Authoritative intent chain binding in handlePay (passes chainId explicitly)
    const payHandler = extractBlock(checkoutSrc, 'const handlePay = async')
    assert.ok(payHandler.includes('chainId:'), 'handlePay must bind EVM writeContractAsync/sendTransactionAsync to authoritative chainId')

    // Important #2 / LOW-01: Step 1 clears methodInFlightRef/methodUpdating on superseding init, and createFreshIntent has synchronous ref lock
    assert.ok(checkoutSrc.includes('freshInFlightRef'), 'createFreshIntent must guard double-clicks with a synchronous ref lock')
    const step1Start = checkoutSrc.indexOf('// Step 1:')
    const step2Start = checkoutSrc.indexOf('// Step 2:')
    assert.notEqual(step1Start, -1)
    assert.notEqual(step2Start, -1)
    const step1Section = checkoutSrc.slice(step1Start, step2Start)
    assert.ok(
      step1Section.includes('methodInFlightRef.current = false') && step1Section.includes('setMethodUpdating(false)'),
      'Step 1 must clear methodInFlightRef/methodUpdating when superseding an in-flight method update',
    )
    assert.ok(
      step1Section.includes('toClientPaymentNetworkId(created.paymentNetwork)'),
      'Step 1 must sync networkId/useUsdt from created intent on idempotent replay',
    )

    // Important #3: Step 2 re-evaluates after loadingIntent/methodUpdating/paying/cancelling finish and uses failedSyncKeyRef
    const step2End = checkoutSrc.indexOf('// Real TTL countdown timer')
    assert.notEqual(step2End, -1)
    const step2Section = checkoutSrc.slice(step2Start, step2End)
    assert.ok(step2Section.includes('resolvePendingMethodSyncKey'), 'Step 2 must use resolvePendingMethodSyncKey')
    assert.ok(step2Section.includes('failedSyncKeyRef'), 'Step 2 must track failedSyncKeyRef to prevent infinite retry loops')
    assert.match(
      step2Section,
      /\[[^\]]*loadingIntent[^\]]*methodUpdating[^\]]*paying[^\]]*cancelling[^\]]*\]/,
      'Step 2 effect deps must include loadingIntent, methodUpdating, paying, cancelling to catch wallet switches during in-flight operations',
    )
  })
})
