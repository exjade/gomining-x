'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DIRECT_REFERRAL_RATE_INTERNAL,
  DIRECT_REFERRAL_CURRENCY,
  ELIGIBLE_PRODUCT_TYPE,
  buildDirectReferralIdempotencyKey,
  calculateDirectReferralCommission,
  createReversalEntry
} = require('../src/referrals/calculateDirectReferral');

const CATALOG_CASES = [
  { price: '18.99', expectedUsdt6: '1.899000', expectedInternal: 189_900_000n, expectedMicro: 1_899_000n },
  { price: '99.99', expectedUsdt6: '9.999000', expectedInternal: 999_900_000n, expectedMicro: 9_999_000n },
  { price: '249.99', expectedUsdt6: '24.999000', expectedInternal: 2_499_900_000n, expectedMicro: 24_999_000n },
  { price: '499.99', expectedUsdt6: '49.999000', expectedInternal: 4_999_900_000n, expectedMicro: 49_999_000n },
  { price: '1474.99', expectedUsdt6: '147.499000', expectedInternal: 14_749_900_000n, expectedMicro: 147_499_000n },
  { price: '2201.99', expectedUsdt6: '220.199000', expectedInternal: 22_019_900_000n, expectedMicro: 220_199_000n },
  { price: '27709.39', expectedUsdt6: '2770.939000', expectedInternal: 277_093_900_000n, expectedMicro: 2_770_939_000n }
];

test('exports frozen domain constants with exact BigInt rate', () => {
  assert.equal(DIRECT_REFERRAL_RATE_INTERNAL, 10_000_000n);
  assert.equal(DIRECT_REFERRAL_CURRENCY, 'USDT');
  assert.equal(ELIGIBLE_PRODUCT_TYPE, 'miner');
});

test('calculates exact 10% commission for all 7 catalog prices on first purchase and repurchase', () => {
  for (const [idx, item] of CATALOG_CASES.entries()) {
    const first = calculateDirectReferralCommission({
      orderId: `ORD-FIRST-${idx + 1}`,
      minerId: `MINER-FIRST-${idx + 1}`,
      productType: 'miner',
      netPaidUsdt: item.price,
      buyerUid: 'buyer-1',
      sponsorUid: 'sponsor-1',
      purchaseNumber: 1
    });

    assert.equal(first.eligible, true);
    assert.equal(first.reason, null);
    assert.equal(first.status, 'CREDITED');
    assert.equal(first.settlementMode, 'IMMEDIATE');
    assert.equal(first.purchaseType, 'first_purchase');
    assert.equal(first.currency, 'USDT');
    assert.equal(first.rateInternal, 10_000_000n);
    assert.equal(first.commissionId, `COMM-MINER-FIRST-${idx + 1}`);
    assert.equal(first.commissionInternal, item.expectedInternal);
    assert.equal(first.commissionMicroUsdt, item.expectedMicro);
    assert.equal(first.commissionUsdt6, item.expectedUsdt6);
    assert.equal(first.roundingResidualInternal, 0n);
    assert.equal(Object.isFrozen(first), true);

    const repurchase = calculateDirectReferralCommission({
      orderId: `ORD-RE-${idx + 1}`,
      minerId: `MINER-RE-${idx + 1}`,
      productType: 'miner',
      netPaidUsdt: item.price,
      buyerUid: 'buyer-1',
      sponsorUid: 'sponsor-1',
      purchaseNumber: 3
    });

    assert.equal(repurchase.eligible, true);
    assert.equal(repurchase.status, 'CREDITED');
    assert.equal(repurchase.settlementMode, 'IMMEDIATE');
    assert.equal(repurchase.purchaseType, 'repurchase');
    assert.equal(repurchase.commissionInternal, item.expectedInternal);
    assert.equal(repurchase.commissionUsdt6, item.expectedUsdt6);
    assert.equal(Object.isFrozen(repurchase), true);
  }
});

test('applies ROUND_DOWN to 6 decimals with explicit roundingResidualInternal', () => {
  const result = calculateDirectReferralCommission({
    orderId: 'ORD-ROUND-1',
    minerId: 'MINER-ROUND-1',
    productType: 'miner',
    netPaidUsdt: '10.000009',
    buyerUid: 'buyer-1',
    sponsorUid: 'sponsor-1'
  });

  assert.equal(result.eligible, true);
  assert.equal(result.exactInternal, 100_000_090n);
  assert.equal(result.commissionInternal, 100_000_000n);
  assert.equal(result.commissionMicroUsdt, 1_000_000n);
  assert.equal(result.commissionUsdt6, '1.000000');
  assert.equal(result.roundingResidualInternal, 90n);
  assert.equal(result.commissionInternal + result.roundingResidualInternal, result.exactInternal);
});

test('rejects non-miner products cleanly even when minerId is omitted', () => {
  for (const productType of ['subscription', 'deposit', 'votes']) {
    const res = calculateDirectReferralCommission({
      orderId: `ORD-${productType}`,
      productType,
      netPaidUsdt: '99.99',
      buyerUid: 'buyer-1',
      sponsorUid: 'sponsor-1'
    });

    assert.equal(res.eligible, false);
    assert.equal(res.reason, 'NON_MINER_PRODUCT');
    assert.equal(res.commissionInternal, 0n);
    assert.equal(res.commissionUsdt6, '0.000000');
    assert.equal(Object.isFrozen(res), true);
  }
});

test('rejects test/guest, missing sponsor, self-referral, and zero net amount', () => {
  const testPurchase = calculateDirectReferralCommission({
    orderId: 'ORD-TEST',
    minerId: 'MINER-TEST',
    productType: 'miner',
    netPaidUsdt: '99.99',
    buyerUid: 'buyer-1',
    sponsorUid: 'sponsor-1',
    isTestOrGuest: true
  });
  assert.equal(testPurchase.eligible, false);
  assert.equal(testPurchase.reason, 'TEST_OR_GUEST_PURCHASE');
  assert.equal(testPurchase.commissionInternal, 0n);
  assert.equal(testPurchase.commissionUsdt6, '0.000000');

  for (const sponsorUid of [null, '', '   ']) {
    const missingSponsor = calculateDirectReferralCommission({
      orderId: 'ORD-NOSPON',
      minerId: 'MINER-NOSPON',
      productType: 'miner',
      netPaidUsdt: '99.99',
      buyerUid: 'buyer-1',
      sponsorUid
    });
    assert.equal(missingSponsor.eligible, false);
    assert.equal(missingSponsor.reason, 'MISSING_SPONSOR');
    assert.equal(missingSponsor.commissionInternal, 0n);
    assert.equal(missingSponsor.commissionUsdt6, '0.000000');
  }

  for (const [buyerUid, sponsorUid] of [
    ['user-1', 'user-1'],
    [' user-1 ', 'user-1'],
    ['user-1', ' user-1 ']
  ]) {
    const selfRef = calculateDirectReferralCommission({
      orderId: 'ORD-SELF',
      minerId: 'MINER-SELF',
      productType: 'miner',
      netPaidUsdt: '99.99',
      buyerUid,
      sponsorUid
    });
    assert.equal(selfRef.eligible, false);
    assert.equal(selfRef.reason, 'SELF_REFERRAL');
    assert.equal(selfRef.commissionInternal, 0n);
    assert.equal(selfRef.commissionUsdt6, '0.000000');
  }

  for (const zeroAmount of ['0', '0.000000']) {
    const zeroNet = calculateDirectReferralCommission({
      orderId: 'ORD-ZERO',
      minerId: 'MINER-ZERO',
      productType: 'miner',
      netPaidUsdt: zeroAmount,
      buyerUid: 'buyer-1',
      sponsorUid: 'sponsor-1'
    });
    assert.equal(zeroNet.eligible, false);
    assert.equal(zeroNet.reason, 'ZERO_NET_AMOUNT');
    assert.equal(zeroNet.commissionInternal, 0n);
    assert.equal(zeroNet.commissionUsdt6, '0.000000');
  }
});

test('buildDirectReferralIdempotencyKey sanitizes minerId and rejects invalid inputs', () => {
  assert.equal(
    buildDirectReferralIdempotencyKey({ minerId: 'MINER_01-abc', orderId: 'ORD-1' }),
    'COMM-MINER_01-abc'
  );
  assert.equal(
    buildDirectReferralIdempotencyKey({ minerId: ' miner/01:foo@bar! ', orderId: 'ORD-2' }),
    'COMM-miner01foobar'
  );

  for (const badInput of [null, undefined, {}, { minerId: '' }, { minerId: '   ' }, { minerId: '///@@@!!!' }]) {
    assert.throws(() => buildDirectReferralIdempotencyKey(badInput));
  }
});

test('createReversalEntry produces exact negative immutable entry without mutating original', () => {
  const original = calculateDirectReferralCommission({
    orderId: 'ORD-REV-1',
    minerId: 'MINER-REV-1',
    productType: 'miner',
    netPaidUsdt: '249.99',
    buyerUid: 'buyer-1',
    sponsorUid: 'sponsor-1'
  });

  const snapshotBefore = { ...original };
  const reversal = createReversalEntry(original, {
    reversalId: 'REV-001',
    reason: 'CHARGEBACK',
    reversedAt: '2026-11-21T00:00:00Z'
  });

  assert.equal(Object.isFrozen(original), true);
  assert.equal(Object.isFrozen(reversal), true);
  assert.deepEqual(original, snapshotBefore);

  assert.equal(reversal.type, 'DIRECT_REFERRAL_REVERSAL');
  assert.equal(reversal.reversalId, 'REV-001');
  assert.equal(reversal.originalCommissionId, original.commissionId);
  assert.equal(reversal.deltaInternal, -original.commissionInternal);
  assert.equal(reversal.deltaMicroUsdt, -original.commissionMicroUsdt);
  assert.equal(reversal.deltaUsdt6, `-${original.commissionUsdt6}`);
  assert.equal(reversal.reason, 'CHARGEBACK');
  assert.equal(reversal.reversedAt, '2026-11-21T00:00:00Z');
  assert.equal(reversal.status, 'REVERSED');
  assert.equal(original.commissionInternal + reversal.deltaInternal, 0n);
});

test('createReversalEntry throws on rejected, zero-commission, already-reversed, or invalid reversal metadata', () => {
  const rejected = calculateDirectReferralCommission({
    orderId: 'ORD-REJ',
    productType: 'subscription',
    netPaidUsdt: '99.99',
    buyerUid: 'buyer-1',
    sponsorUid: 'sponsor-1'
  });
  assert.throws(() => createReversalEntry(rejected, { reversalId: 'REV-1', reason: 'REFUND' }));

  const tinyZero = calculateDirectReferralCommission({
    orderId: 'ORD-TINY',
    minerId: 'MINER-TINY',
    productType: 'miner',
    netPaidUsdt: '0.000001',
    buyerUid: 'buyer-1',
    sponsorUid: 'sponsor-1'
  });
  assert.equal(tinyZero.eligible, true);
  assert.equal(tinyZero.commissionInternal, 0n);
  assert.throws(() => createReversalEntry(tinyZero, { reversalId: 'REV-2', reason: 'REFUND' }));

  const credited = calculateDirectReferralCommission({
    orderId: 'ORD-OK',
    minerId: 'MINER-OK',
    productType: 'miner',
    netPaidUsdt: '99.99',
    buyerUid: 'buyer-1',
    sponsorUid: 'sponsor-1'
  });
  const reversal = createReversalEntry(credited, { reversalId: 'REV-3', reason: 'REFUND' });

  assert.throws(() => createReversalEntry(reversal, { reversalId: 'REV-4', reason: 'DOUBLE' }));
  assert.throws(() => createReversalEntry({ ...credited, status: 'REVERSED' }, { reversalId: 'REV-5', reason: 'DOUBLE' }));
  assert.throws(() => createReversalEntry(credited, { reversalId: '', reason: 'REFUND' }));
  assert.throws(() => createReversalEntry(credited, { reversalId: 'REV-6', reason: '   ' }));
  assert.throws(() => createReversalEntry(credited, null));
});

test('rejects arrays and non-objects across all entry points, strict boolean isTestOrGuest, invalid purchaseNumber, and empty buyerUid', () => {
  for (const bad of [null, undefined, [], 'str', 123, true]) {
    assert.throws(() => buildDirectReferralIdempotencyKey(bad), TypeError);
    assert.throws(() => calculateDirectReferralCommission(bad), TypeError);
    assert.throws(() => createReversalEntry(bad, { reversalId: 'REV-A', reason: 'REFUND' }), TypeError);
  }

  const validCredited = calculateDirectReferralCommission({
    orderId: 'ORD-ARR-OPT',
    minerId: 'MINER-ARR-OPT',
    productType: 'miner',
    netPaidUsdt: '99.99',
    buyerUid: 'buyer-1',
    sponsorUid: 'sponsor-1'
  });
  for (const badOpts of [null, undefined, [], 'str', 123]) {
    assert.throws(() => createReversalEntry(validCredited, badOpts), TypeError);
  }

  for (const badFlag of ['true', 'false', 1, 0, null, {}]) {
    assert.throws(
      () =>
        calculateDirectReferralCommission({
          orderId: 'ORD-FLAG',
          minerId: 'MINER-FLAG',
          productType: 'miner',
          netPaidUsdt: '99.99',
          buyerUid: 'buyer-1',
          sponsorUid: 'sponsor-1',
          isTestOrGuest: badFlag
        }),
      (err) => err instanceof TypeError && err.message === 'isTestOrGuest must be a boolean'
    );
  }

  for (const badPurchaseNumber of [0, -1, 1.5, '1', NaN, Infinity]) {
    assert.throws(
      () =>
        calculateDirectReferralCommission({
          orderId: 'ORD-PNUM',
          minerId: 'MINER-PNUM',
          productType: 'miner',
          netPaidUsdt: '99.99',
          buyerUid: 'buyer-1',
          sponsorUid: 'sponsor-1',
          purchaseNumber: badPurchaseNumber
        }),
      RangeError
    );
  }

  for (const badBuyerUid of ['', '   ', null, undefined, 123]) {
    assert.throws(
      () =>
        calculateDirectReferralCommission({
          orderId: 'ORD-BUYER',
          minerId: 'MINER-BUYER',
          productType: 'miner',
          netPaidUsdt: '99.99',
          buyerUid: badBuyerUid,
          sponsorUid: 'sponsor-1'
        }),
      RangeError
    );
  }
});

test('evaluates NON_MINER_PRODUCT and TEST_OR_GUEST_PURCHASE before parseUsdtToInternal with 0n / 0.000000 fallback', () => {
  for (const badAmount of [undefined, null, 'N/A', '-5']) {
    const nonMiner = calculateDirectReferralCommission({
      orderId: 'ORD-NON-MINER',
      productType: 'subscription',
      netPaidUsdt: badAmount,
      buyerUid: 'buyer-1',
      sponsorUid: 'sponsor-1'
    });
    assert.equal(nonMiner.eligible, false);
    assert.equal(nonMiner.reason, 'NON_MINER_PRODUCT');
    assert.equal(nonMiner.netPaidInternal, 0n);
    assert.equal(nonMiner.netPaidUsdt6, '0.000000');
    assert.equal(nonMiner.commissionInternal, 0n);
    assert.equal(nonMiner.commissionUsdt6, '0.000000');

    const testPurchase = calculateDirectReferralCommission({
      orderId: 'ORD-TEST-NO-AMT',
      minerId: 'MINER-TEST-NO-AMT',
      productType: 'miner',
      netPaidUsdt: badAmount,
      buyerUid: 'buyer-1',
      sponsorUid: 'sponsor-1',
      isTestOrGuest: true
    });
    assert.equal(testPurchase.eligible, false);
    assert.equal(testPurchase.reason, 'TEST_OR_GUEST_PURCHASE');
    assert.equal(testPurchase.netPaidInternal, 0n);
    assert.equal(testPurchase.netPaidUsdt6, '0.000000');
    assert.equal(testPurchase.commissionInternal, 0n);
    assert.equal(testPurchase.commissionUsdt6, '0.000000');
  }
});

test('createReversalEntry requires DIRECT_REFERRAL_COMMISSION type, derives deltas from commissionInternal, rejects tampered commissionUsdt6, and trims originalCommissionId', () => {
  const credited = calculateDirectReferralCommission({
    orderId: 'ORD-HARDEN',
    minerId: 'MINER-HARDEN',
    productType: 'miner',
    netPaidUsdt: '99.99',
    buyerUid: 'buyer-1',
    sponsorUid: 'sponsor-1'
  });

  // Wrong or missing type must throw
  assert.throws(
    () => createReversalEntry({ ...credited, type: 'OTHER_ENTRY' }, { reversalId: 'REV-T1', reason: 'REFUND' }),
    RangeError
  );
  assert.throws(
    () => createReversalEntry({ ...credited, type: undefined }, { reversalId: 'REV-T2', reason: 'REFUND' }),
    RangeError
  );

  // Tampered commissionUsdt6 ('N/A') or commissionMicroUsdt must be rejected (never produce '-N/A')
  assert.throws(
    () => createReversalEntry({ ...credited, commissionUsdt6: 'N/A' }, { reversalId: 'REV-T3', reason: 'REFUND' }),
    RangeError
  );
  assert.throws(
    () => createReversalEntry({ ...credited, commissionMicroUsdt: 999n }, { reversalId: 'REV-T4', reason: 'REFUND' }),
    RangeError
  );

  // Derives deltaMicroUsdt and deltaUsdt6 from commissionInternal when optional fields are omitted and trims originalCommissionId
  const minimalEntry = {
    type: 'DIRECT_REFERRAL_COMMISSION',
    eligible: true,
    status: 'CREDITED',
    commissionId: '  COMM-MINER-HARDEN  ',
    commissionInternal: 999_900_000n,
    orderId: 'ORD-HARDEN',
    minerId: 'MINER-HARDEN',
    buyerUid: 'buyer-1',
    sponsorUid: 'sponsor-1'
  };
  const reversal = createReversalEntry(minimalEntry, { reversalId: ' REV-T5 ', reason: ' CHARGEBACK ' });
  assert.equal(reversal.reversalId, 'REV-T5');
  assert.equal(reversal.originalCommissionId, 'COMM-MINER-HARDEN');
  assert.equal(reversal.deltaInternal, -999_900_000n);
  assert.equal(reversal.deltaMicroUsdt, -9_999_000n);
  assert.equal(reversal.deltaUsdt6, '-9.999000');
  assert.equal(reversal.reason, 'CHARGEBACK');
});

test('property-based accounting invariants across 72 deterministic varied eligible purchases', () => {
  const cases = [];
  let seed = 0x5f3759df;
  const nextRand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };

  for (let i = 0; i < 72; i += 1) {
    const whole = i === 0 ? 0 : (nextRand() % 50000) + 1;
    const frac = String(nextRand() % 1_000_000).padStart(6, '0');
    const netPaidUsdt = i === 0 ? '0.000001' : `${whole}.${frac}`;
    const purchaseNumber = (i % 5) + 1;
    cases.push({ i, netPaidUsdt, purchaseNumber });
  }

  for (const { i, netPaidUsdt, purchaseNumber } of cases) {
    const entry = calculateDirectReferralCommission({
      orderId: `ORD-PROP-${i}`,
      minerId: `MINER-PROP-${i}`,
      productType: 'miner',
      netPaidUsdt,
      buyerUid: `buyer-${i}`,
      sponsorUid: `sponsor-${i}`,
      purchaseNumber
    });

    assert.equal(entry.eligible, true);
    assert.equal(entry.commissionInternal + entry.roundingResidualInternal, entry.exactInternal);
    assert.equal(entry.commissionInternal <= entry.exactInternal, true);
    assert.equal(entry.roundingResidualInternal >= 0n, true);

    if (entry.commissionInternal > 0n) {
      const rev = createReversalEntry(entry, {
        reversalId: `REV-PROP-${i}`,
        reason: 'PROPERTY_CHECK',
        reversedAt: '2026-11-21T00:00:00Z'
      });
      assert.equal(entry.commissionInternal + rev.deltaInternal, 0n);
      assert.equal(rev.deltaUsdt6, `-${entry.commissionUsdt6}`);
    }
  }
});
