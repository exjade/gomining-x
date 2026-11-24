'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkReferralCodeExists,
  isSponsorAccountActive,
  normalizeReferralCode
} = require('../src/referrals/validateReferralCode');
const {
  CANONICAL_MINER_ID_PATTERN,
  settleDirectReferralCommission,
  reverseDirectReferralCommission
} = require('../src/referrals/directReferralService');
const {
  isSettledStatus,
  handlePurchaseSettledEvent
} = require('../src/referrals/onPurchaseSettled');

function createInMemoryFirestore(initialDocs = {}) {
  const store = new Map();
  for (const [docPath, data] of Object.entries(initialDocs)) {
    store.set(docPath, structuredClone(data));
  }

  const FieldValue = {
    increment(delta) {
      return { __op: 'increment', delta };
    },
    serverTimestamp() {
      return { __op: 'serverTimestamp' };
    }
  };

  function applyFieldValues(existing, incoming) {
    const target = existing ? structuredClone(existing) : {};
    for (const [key, val] of Object.entries(incoming)) {
      if (val && typeof val === 'object' && val.__op === 'increment') {
        const current = typeof target[key] === 'number' ? target[key] : 0;
        target[key] = Number((current + val.delta).toFixed(6));
      } else if (val && typeof val === 'object' && val.__op === 'serverTimestamp') {
        target[key] = 'SERVER_TIMESTAMP';
      } else {
        target[key] = structuredClone(val);
      }
    }
    return target;
  }

  function makeDocRef(docPath) {
    return {
      path: docPath,
      id: docPath.split('/').pop(),
      collection(subName) {
        return makeCollectionRef(`${docPath}/${subName}`);
      },
      async get() {
        const data = store.get(docPath);
        return {
          exists: data !== undefined,
          id: docPath.split('/').pop(),
          data: () => (data !== undefined ? structuredClone(data) : undefined)
        };
      }
    };
  }

  function getNestedField(obj, fieldPath) {
    return fieldPath.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);
  }

  function makeCollectionRef(colPath, filters = [], limitCount = null) {
    return {
      __isQuery: true,
      path: colPath,
      doc(id) {
        return makeDocRef(`${colPath}/${id}`);
      },
      where(field, op, value) {
        if (op !== '==') {
          throw new Error(`Unsupported operator in test simulator: ${op}`);
        }
        return makeCollectionRef(colPath, [...filters, { field, value }], limitCount);
      },
      limit(n) {
        return makeCollectionRef(colPath, filters, n);
      },
      async get() {
        const prefix = `${colPath}/`;
        const matches = [];
        for (const [docPath, data] of store.entries()) {
          if (!docPath.startsWith(prefix)) continue;
          const remainder = docPath.slice(prefix.length);
          if (remainder.includes('/')) continue;
          const ok = filters.every((f) => getNestedField(data, f.field) === f.value);
          if (ok) {
            matches.push({
              exists: true,
              id: remainder,
              data: () => structuredClone(data)
            });
          }
        }
        const docs = limitCount !== null ? matches.slice(0, limitCount) : matches;
        return { empty: docs.length === 0, size: docs.length, docs };
      }
    };
  }

  const db = {
    collection(name) {
      return makeCollectionRef(name);
    },
    async runTransaction(fn) {
      let writeStarted = false;
      const pendingWrites = [];

      const tx = {
        async get(target) {
          if (writeStarted) {
            throw new Error('Firestore transactions require all reads to be executed before all writes');
          }
          if (target && target.__isQuery) {
            return target.get();
          }
          const data = store.get(target.path);
          return {
            exists: data !== undefined,
            id: target.id,
            data: () => (data !== undefined ? structuredClone(data) : undefined)
          };
        },
        set(docRef, data, options = {}) {
          writeStarted = true;
          pendingWrites.push({ path: docRef.path, data, merge: Boolean(options.merge) });
          return tx;
        },
        update(docRef, data) {
          writeStarted = true;
          pendingWrites.push({ path: docRef.path, data, merge: true, requireExists: true });
          return tx;
        }
      };

      const result = await fn(tx);

      // Commit buffered writes atomically only after callback succeeds.
      for (const write of pendingWrites) {
        const existing = store.get(write.path);
        if (write.requireExists && existing === undefined) {
          throw new Error(`Document not found for update: ${write.path}`);
        }
        const nextDoc = write.merge
          ? applyFieldValues(existing, write.data)
          : applyFieldValues(null, write.data);
        store.set(write.path, nextDoc);
      }

      return result;
    }
  };

  return { db, FieldValue, store };
}

test('validateReferralCode: returns strictly { exists } with active sponsor check and zero PII leakage', async () => {
  const { db } = createInMemoryFirestore({
    'users/sponsor-active': {
      uid: 'sponsor-active',
      referralCode: 'ALPHA10',
      email: 'secret@example.com',
      displayName: 'Secret Sponsor',
      status: 'active'
    },
    'users/sponsor-blocked': {
      uid: 'sponsor-blocked',
      referralCode: 'BLOCKED1',
      status: 'blocked'
    },
    'users/sponsor-inactive': {
      uid: 'sponsor-inactive',
      referralCode: 'INACTIVE1',
      status: 'inactive'
    },
    'users/sponsor-legacy-lower': {
      uid: 'sponsor-legacy-lower',
      referralCode: 'legacyCode',
      status: 'active'
    }
  });

  assert.equal(normalizeReferralCode('  alpha10  '), 'ALPHA10');

  const activeRes = await checkReferralCodeExists({ db, referralCode: '  alpha10 ' });
  assert.deepEqual(activeRes, { exists: true });
  assert.deepEqual(Object.keys(activeRes), ['exists']);

  const legacyFallback = await checkReferralCodeExists({ db, referralCode: 'legacyCode' });
  assert.deepEqual(legacyFallback, { exists: true });
  assert.deepEqual(Object.keys(legacyFallback), ['exists']);

  for (const code of ['BLOCKED1', 'INACTIVE1', 'UNKNOWN99', '', '   ', null, undefined, 123]) {
    const res = await checkReferralCodeExists({ db, referralCode: code });
    assert.deepEqual(res, { exists: false });
    assert.deepEqual(Object.keys(res), ['exists']);
  }
});

test('onPurchaseSettled: triggers only on exact transition into settled status', async () => {
  assert.equal(isSettledStatus('completed'), true);
  assert.equal(isSettledStatus('CONFIRMED'), true);
  assert.equal(isSettledStatus('settled'), true);
  assert.equal(isSettledStatus('pending'), false);
  assert.equal(isSettledStatus(null), false);

  const { db, FieldValue, store } = createInMemoryFirestore({
    'users/sponsor-1': { status: 'active', balance: 0, commissionBalance: 0, totalCommissionsEarned: 0 },
    'users/buyer-1': { status: 'active', sponsorId: 'sponsor-1', purchasesCount: 0 }
  });

  // Pending -> processing: ignored
  const ignoredPending = await handlePurchaseSettledEvent({
    orderId: 'ORD-1',
    beforeData: { status: 'pending' },
    afterData: { status: 'processing', productType: 'miner', minerId: 'MINER-01', netPaidUsdt: '99.99', buyerUid: 'buyer-1' },
    db,
    FieldValue
  });
  assert.equal(ignoredPending.status, 'ignored');
  assert.equal(store.has('referralCommissions/COMM-MINER-01'), false);

  // Completed -> completed: ignored
  const ignoredAlready = await handlePurchaseSettledEvent({
    orderId: 'ORD-1',
    beforeData: { status: 'completed' },
    afterData: { status: 'completed', productType: 'miner', minerId: 'MINER-01', netPaidUsdt: '99.99', buyerUid: 'buyer-1' },
    db,
    FieldValue
  });
  assert.equal(ignoredAlready.status, 'ignored');

  // Pending -> CONFIRMED: settles 10%
  const settled = await handlePurchaseSettledEvent({
    orderId: 'ORD-1',
    beforeData: { status: 'pending' },
    afterData: {
      status: 'CONFIRMED',
      productType: 'miner',
      minerId: 'MINER-01',
      netPaidUsdt: '99.99',
      buyerUid: 'buyer-1',
      paymentMethod: 'wallet'
    },
    db,
    FieldValue
  });
  assert.equal(settled.status, 'credited');
  assert.equal(settled.commissionId, 'COMM-MINER-01');
  assert.equal(settled.commissionUsdt6, '9.999000');
});

test('settleDirectReferralCommission: strict idempotency prevents duplicate balances and purchasesCount inflation', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore({
    'users/sponsor-1': { status: 'active', balance: 10, commissionBalance: 0, totalCommissionsEarned: 0, referral: { referralCode: 'SPON1' } },
    'users/buyer-1': { status: 'active', referral: { referrerBy: 'SPON1' }, purchasesCount: 0 }
  });

  const purchase = {
    orderId: 'ORD-IDEMP-1',
    minerId: 'MINER_IDEMP_1',
    productType: 'miner',
    netPaidUsdt: '249.99',
    buyerUid: 'buyer-1',
    paymentMethod: 'wallet',
    settledAt: '2026-11-20T19:00:00Z'
  };

  const first = await settleDirectReferralCommission({ db, FieldValue, purchase });
  assert.equal(first.status, 'credited');
  assert.equal(first.commissionId, 'COMM-MINER_IDEMP_1');
  assert.equal(first.commissionUsdt6, '24.999000');

  // Retry same settlement
  const retry = await settleDirectReferralCommission({ db, FieldValue, purchase });
  assert.equal(retry.status, 'already_processed');
  assert.equal(retry.commissionId, 'COMM-MINER_IDEMP_1');

  // Balances, counters, and unilevel counter were incremented strictly ONCE
  assert.equal(store.get('userBalances/sponsor-1').usdtAvailable, 24.999);
  assert.equal(store.get('referrals/sponsor-1').totalCommissionsEarned, 24.999);
  assert.equal(store.get('referrals/sponsor-1').commissionsCount, 1);
  assert.equal(store.get('users/sponsor-1').balance, 34.999);
  assert.equal(store.get('users/sponsor-1').commissionBalance, 24.999);
  assert.equal(store.get('users/sponsor-1').totalCommissionsEarned, 24.999);
  assert.equal(store.get('users/buyer-1').purchasesCount, 1);
  assert.equal(store.get('users/buyer-1').firstPurchaseAt, '2026-11-20T19:00:00Z');
  assert.equal(store.get('unilevel/sponsor-1').activeReferredMinersCount, 1);
});

test('settleDirectReferralCommission: handles first purchase (wallet) and repurchase (platform_balance D7) preserving firstPurchaseAt', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore({
    'users/sponsor-1': { status: 'active', balance: 0, commissionBalance: 0, totalCommissionsEarned: 0 },
    'users/buyer-1': { status: 'active', sponsorId: 'sponsor-1', purchasesCount: 0 }
  });

  const first = await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-W1',
      minerId: 'MINER-W1',
      productType: 'miner',
      netPaidUsdt: '18.99',
      buyerUid: 'buyer-1',
      paymentMethod: 'wallet',
      settledAt: '2026-11-20T10:00:00Z'
    }
  });
  assert.equal(first.status, 'credited');
  assert.equal(first.purchaseNumber, 1);
  assert.equal(first.purchaseType, 'first_purchase');
  assert.equal(first.paymentMethod, 'wallet');
  assert.equal(first.commissionUsdt6, '1.899000');

  const second = await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-P2',
      minerId: 'MINER-P2',
      productType: 'miner',
      netPaidUsdt: '99.99',
      buyerUid: 'buyer-1',
      paymentMethod: 'platform_balance',
      settledAt: '2026-11-20T12:00:00Z'
    }
  });
  assert.equal(second.status, 'credited');
  assert.equal(second.purchaseNumber, 2);
  assert.equal(second.purchaseType, 'repurchase');
  assert.equal(second.paymentMethod, 'platform_balance');
  assert.equal(second.commissionUsdt6, '9.999000');

  assert.equal(store.get('users/buyer-1').purchasesCount, 2);
  assert.equal(store.get('users/buyer-1').firstPurchaseAt, '2026-11-20T10:00:00Z');
  assert.equal(store.get('users/buyer-1').lastPurchaseAt, '2026-11-20T12:00:00Z');
  assert.equal(store.get('userBalances/sponsor-1').usdtAvailable, 11.898);
  assert.equal(store.get('unilevel/sponsor-1').activeReferredMinersCount, 2);
  assert.equal(store.get('referrals/sponsor-1/transactions/COMM-MINER-P2').source, 'miner_purchase');
  assert.equal(store.get('referrals/sponsor-1/transactions/COMM-MINER-P2').type, 'commission_income');
});

test('settleDirectReferralCommission: excludes non-miner, test/guest, self-referral, missing sponsor, micro-order < 0.000010, and rejects non-canonical minerId', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore({
    'users/sponsor-1': { status: 'active', balance: 0, commissionBalance: 0, totalCommissionsEarned: 0 },
    'users/buyer-self': { status: 'active', sponsorId: 'buyer-self', purchasesCount: 0 },
    'users/buyer-nospon': { status: 'active', purchasesCount: 0 },
    'users/buyer-1': { status: 'active', sponsorId: 'sponsor-1', purchasesCount: 0 }
  });

  // Non-miner product (subscription / deposit) without minerId or valid netPaidUsdt
  const nonMiner = await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-SUB',
      productType: 'subscription',
      netPaidUsdt: null,
      buyerUid: 'buyer-1'
    }
  });
  assert.equal(nonMiner.status, 'rejected');
  assert.equal(nonMiner.reason, 'NON_MINER_PRODUCT');

  // Test/guest purchase: rejected, does not inflate purchasesCount
  const testOrder = await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-TEST',
      minerId: 'MINER-TEST',
      productType: 'miner',
      netPaidUsdt: '99.99',
      buyerUid: 'buyer-1',
      isTestOrGuest: true
    }
  });
  assert.equal(testOrder.status, 'rejected');
  assert.equal(testOrder.reason, 'TEST_OR_GUEST_PURCHASE');
  assert.equal(store.get('users/buyer-1').purchasesCount, 0);

  // Self-referral: rejected
  const selfRef = await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-SELF',
      minerId: 'MINER-SELF',
      productType: 'miner',
      netPaidUsdt: '99.99',
      buyerUid: 'buyer-self'
    }
  });
  assert.equal(selfRef.status, 'rejected');
  assert.equal(selfRef.reason, 'SELF_REFERRAL');
  assert.equal(store.has('referralCommissions/COMM-MINER-SELF'), false);

  // Missing sponsor: rejected for commission, but buyer purchasesCount/firstPurchaseAt/lastPurchaseAt updated
  const noSpon = await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-NOSPON',
      minerId: 'MINER-NOSPON',
      productType: 'miner',
      netPaidUsdt: '99.99',
      buyerUid: 'buyer-nospon',
      settledAt: '2026-11-20T15:00:00Z'
    }
  });
  assert.equal(noSpon.status, 'rejected');
  assert.equal(noSpon.reason, 'MISSING_SPONSOR');
  assert.equal(store.get('users/buyer-nospon').purchasesCount, 1);
  assert.equal(store.get('users/buyer-nospon').firstPurchaseAt, '2026-11-20T15:00:00Z');
  assert.equal(store.get('users/buyer-nospon').lastPurchaseAt, '2026-11-20T15:00:00Z');

  // Micro-order < 0.000010 USDT (truncates to 0n): does not credit ledger or fail
  const micro = await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-MICRO',
      minerId: 'MINER-MICRO',
      productType: 'miner',
      netPaidUsdt: '0.000009',
      buyerUid: 'buyer-1'
    }
  });
  assert.equal(micro.status, 'skipped_zero_commission');
  assert.equal(store.has('referralCommissions/COMM-MINER-MICRO'), false);
  assert.equal(store.has('userBalances/sponsor-1'), false);

  // Non-canonical minerId rejected
  assert.equal(CANONICAL_MINER_ID_PATTERN.test('MINER_01-ok'), true);
  for (const badMinerId of ['', '   ', 'miner/01:bad!', 'miner 01', null]) {
    await assert.rejects(
      () =>
        settleDirectReferralCommission({
          db,
          FieldValue,
          purchase: {
            orderId: 'ORD-BAD-MINER',
            minerId: badMinerId,
            productType: 'miner',
            netPaidUsdt: '99.99',
            buyerUid: 'buyer-1'
          }
        }),
      RangeError
    );
  }
});

test('reverseDirectReferralCommission: creates exact negative compensatory entry, preserves original, blocks double reversal and corrupted commissionUsdt6', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore({
    'users/sponsor-1': { status: 'active', balance: 0, commissionBalance: 0, totalCommissionsEarned: 0 },
    'users/buyer-1': { status: 'active', sponsorId: 'sponsor-1', purchasesCount: 0 }
  });

  await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-REV-1',
      minerId: 'MINER-REV-1',
      productType: 'miner',
      netPaidUsdt: '249.99',
      buyerUid: 'buyer-1',
      settledAt: '2026-11-20T16:00:00Z'
    }
  });

  const rev = await reverseDirectReferralCommission({
    db,
    FieldValue,
    commissionId: 'COMM-MINER-REV-1',
    reversalId: 'REV-001',
    reason: 'CHARGEBACK',
    reversedAt: '2026-11-20T17:00:00Z'
  });

  assert.equal(rev.status, 'reversed');
  assert.equal(rev.reversalId, 'REV-001');
  assert.equal(rev.originalCommissionId, 'COMM-MINER-REV-1');
  assert.equal(rev.deltaInternal, -2_499_900_000n);
  assert.equal(rev.deltaMicroUsdt, -24_999_000n);
  assert.equal(rev.deltaUsdt6, '-24.999000');

  // Original preserved (never deleted), marked REVERSED with reversedBy
  const origDoc = store.get('referralCommissions/COMM-MINER-REV-1');
  assert.ok(origDoc);
  assert.equal(origDoc.status, 'REVERSED');
  assert.equal(origDoc.reversedBy, 'REV-001');

  // Compensatory reversal doc and transaction persisted
  const revDoc = store.get('referralCommissions/REV-001');
  assert.equal(revDoc.type, 'DIRECT_REFERRAL_REVERSAL');
  assert.equal(revDoc.deltaUsdt6, '-24.999000');
  assert.equal(store.get('referrals/sponsor-1/transactions/REV-001').amountUsdt6, '-24.999000');

  // Atomic balance deductions bring balances back to 0
  assert.equal(store.get('userBalances/sponsor-1').usdtAvailable, 0);
  assert.equal(store.get('referrals/sponsor-1').totalCommissionsEarned, 0);
  assert.equal(store.get('users/sponsor-1').balance, 0);
  assert.equal(store.get('users/sponsor-1').commissionBalance, 0);

  // Idempotent retry on same reversalId returns already_reversed without double-deducting
  const idempRetry = await reverseDirectReferralCommission({
    db,
    FieldValue,
    commissionId: 'COMM-MINER-REV-1',
    reversalId: 'REV-001',
    reason: 'CHARGEBACK'
  });
  assert.equal(idempRetry.status, 'already_reversed');
  assert.equal(store.get('userBalances/sponsor-1').usdtAvailable, 0);

  // Double reversal with a NEW reversalId throws RangeError
  await assert.rejects(
    () =>
      reverseDirectReferralCommission({
        db,
        FieldValue,
        commissionId: 'COMM-MINER-REV-1',
        reversalId: 'REV-002',
        reason: 'DOUBLE_REFUND'
      }),
    RangeError
  );

  // Corrupted ledger doc (commissionUsdt6: 'N/A') fails closed via SCRUM-348 createReversalEntry
  store.set('referralCommissions/COMM-CORRUPT', {
    commissionId: 'COMM-CORRUPT',
    type: 'DIRECT_REFERRAL_COMMISSION',
    eligible: true,
    status: 'CREDITED',
    commissionInternalStr: '999900000',
    commissionMicroUsdtStr: '9999000',
    commissionUsdt6: 'N/A',
    sponsorUid: 'sponsor-1',
    buyerUid: 'buyer-1'
  });

  await assert.rejects(
    () =>
      reverseDirectReferralCommission({
        db,
        FieldValue,
        commissionId: 'COMM-CORRUPT',
        reversalId: 'REV-CORRUPT',
        reason: 'REFUND'
      }),
    RangeError
  );
  assert.equal(store.has('referralCommissions/REV-CORRUPT'), false);
});

test('PouwMiner schema alignment: nested referral.referralCode lookup, referrerBy code-to-UID resolution, platformBalancePurchaseService create payload, withdrawableBalance & unilevel floor >= 0', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore({
    'users/sponsor-real-uid': {
      uid: 'sponsor-real-uid',
      status: 'active',
      balance: 0,
      commissionBalance: 0,
      totalCommissionsEarned: 0,
      referral: { referralCode: 'ALPHA10' }
    },
    'users/sponsor-nested-blocked': {
      uid: 'sponsor-nested-blocked',
      status: 'blocked',
      referral: { referralCode: 'BLOCKED99' }
    },
    'users/buyer-code-only': {
      uid: 'buyer-code-only',
      status: 'active',
      purchasesCount: 0,
      referral: { referrerBy: 'alpha10' }
    }
  });

  // (a) validateReferralCode queries nested referral.referralCode
  const activeNested = await checkReferralCodeExists({ db, referralCode: '  alpha10 ' });
  assert.deepEqual(activeNested, { exists: true });
  assert.deepEqual(Object.keys(activeNested), ['exists']);

  const blockedNested = await checkReferralCodeExists({ db, referralCode: 'BLOCKED99' });
  assert.deepEqual(blockedNested, { exists: false });
  assert.deepEqual(Object.keys(blockedNested), ['exists']);

  // (b) + (c) handlePurchaseSettledEvent with beforeData: null and exact platformBalancePurchaseService.ts payload
  const settled = await handlePurchaseSettledEvent({
    orderId: 'ORD-PB-001',
    beforeData: null,
    afterData: {
      orderId: 'ORD-PB-001',
      userId: 'buyer-code-only',
      amountUsd: 99.99,
      paymentNetwork: 'PLATFORM_BALANCE',
      status: 'SETTLED',
      activatedMinerId: 'MINER_PB_001',
      settledAt: '2026-11-20T19:40:00Z'
    },
    db,
    FieldValue
  });

  assert.equal(settled.status, 'credited');
  assert.equal(settled.sponsorUid, 'sponsor-real-uid');
  assert.equal(settled.commissionId, 'COMM-MINER_PB_001');
  assert.equal(settled.paymentMethod, 'platform_balance');
  assert.equal(settled.commissionUsdt6, '9.999000');

  // (d) referrals/{sponsorUid}.withdrawableBalance credited + unilevel activeReferredMinersCount incremented
  assert.equal(store.get('referrals/sponsor-real-uid').withdrawableBalance, 9.999);
  assert.equal(store.get('referrals/sponsor-real-uid').totalCommissionsEarned, 9.999);
  assert.equal(store.get('unilevel/sponsor-real-uid').activeReferredMinersCount, 1);

  // Subsequent update on already-SETTLED order is ignored
  const ignoredUpdate = await handlePurchaseSettledEvent({
    orderId: 'ORD-PB-001',
    beforeData: { status: 'SETTLED' },
    afterData: { status: 'SETTLED', activatedMinerId: 'MINER_PB_001', amountUsd: 99.99, userId: 'buyer-code-only' },
    db,
    FieldValue
  });
  assert.equal(ignoredUpdate.status, 'ignored');

  // Reversal deducts withdrawableBalance and decrements unilevel activeReferredMinersCount to 0
  const rev = await reverseDirectReferralCommission({
    db,
    FieldValue,
    commissionId: 'COMM-MINER_PB_001',
    reversalId: 'REV-PB-001',
    reason: 'REFUND',
    reversedAt: '2026-11-20T19:42:00Z'
  });
  assert.equal(rev.status, 'reversed');
  assert.equal(store.get('referrals/sponsor-real-uid').withdrawableBalance, 0);
  assert.equal(store.get('unilevel/sponsor-real-uid').activeReferredMinersCount, 0);

  // Floor >= 0: reversing another commission when activeReferredMinersCount is already 0 stays at 0 (never -1)
  store.set('referralCommissions/COMM-FLOOR-1', {
    commissionId: 'COMM-FLOOR-1',
    type: 'DIRECT_REFERRAL_COMMISSION',
    eligible: true,
    status: 'CREDITED',
    commissionInternalStr: '100000000',
    commissionMicroUsdtStr: '1000000',
    commissionUsdt6: '1.000000',
    sponsorUid: 'sponsor-real-uid',
    buyerUid: 'buyer-code-only'
  });
  await reverseDirectReferralCommission({
    db,
    FieldValue,
    commissionId: 'COMM-FLOOR-1',
    reversalId: 'REV-FLOOR-1',
    reason: 'REFUND'
  });
  assert.equal(store.get('unilevel/sponsor-real-uid').activeReferredMinersCount, 0);
});

test('SCRUM-374: blocks suspended/SUSPENDED/non-string/unknown/missing-doc sponsors and allows legacy/ACTIVE sponsors in validateReferralCode and settleDirectReferralCommission', async () => {
  // Direct unit checks on isSponsorAccountActive
  assert.equal(isSponsorAccountActive(null), false);
  assert.equal(isSponsorAccountActive(undefined), false);
  assert.equal(isSponsorAccountActive([]), false);
  assert.equal(isSponsorAccountActive({ status: 'suspended' }), false);
  assert.equal(isSponsorAccountActive({ status: 'SUSPENDED' }), false);
  assert.equal(isSponsorAccountActive({ status: 'inactive' }), false);
  assert.equal(isSponsorAccountActive({ status: 'blocked' }), false);
  assert.equal(isSponsorAccountActive({ status: true }), false);
  assert.equal(isSponsorAccountActive({ status: 'unknown' }), false);
  assert.equal(isSponsorAccountActive({ status: 'ACTIVE' }), true);
  assert.equal(isSponsorAccountActive({ status: ' active ' }), true);
  assert.equal(isSponsorAccountActive({}), true);
  assert.equal(isSponsorAccountActive({ status: '' }), true);

  const { db, FieldValue, store } = createInMemoryFirestore({
    'users/spon-susp-lower': { uid: 'spon-susp-lower', status: 'suspended', referral: { referralCode: 'SUSPLOW' } },
    'users/spon-susp-upper': { uid: 'spon-susp-upper', status: 'SUSPENDED', referral: { referralCode: 'SUSPUPPER' } },
    'users/spon-bool': { uid: 'spon-bool', status: true, referral: { referralCode: 'BOOLSPON' } },
    'users/spon-unknown': { uid: 'spon-unknown', status: 'unknown', referral: { referralCode: 'UNKSPON' } },
    'users/spon-admin-upper': { uid: 'spon-admin-upper', status: 'ACTIVE', balance: 0, commissionBalance: 0, totalCommissionsEarned: 0, referral: { referralCode: 'ADMINACT' } },
    'users/spon-legacy': { uid: 'spon-legacy', balance: 0, commissionBalance: 0, totalCommissionsEarned: 0, referral: { referralCode: 'LEGACYSP' } },
    'users/buyer-susp-low': { uid: 'buyer-susp-low', sponsorId: 'spon-susp-lower', purchasesCount: 0 },
    'users/buyer-susp-up': { uid: 'buyer-susp-up', sponsorId: 'spon-susp-upper', purchasesCount: 0 },
    'users/buyer-bool': { uid: 'buyer-bool', sponsorId: 'spon-bool', purchasesCount: 0 },
    'users/buyer-unk': { uid: 'buyer-unk', sponsorId: 'spon-unknown', purchasesCount: 0 },
    'users/buyer-ghost': { uid: 'buyer-ghost', sponsorId: 'spon-missing-doc', purchasesCount: 0 },
    'users/buyer-admin-act': { uid: 'buyer-admin-act', sponsorId: 'spon-admin-upper', purchasesCount: 0 },
    'users/buyer-legacy': { uid: 'buyer-legacy', sponsorId: 'spon-legacy', purchasesCount: 0 }
  });

  // 1. validateReferralCode (checkReferralCodeExists)
  for (const blockedCode of ['SUSPLOW', 'SUSPUPPER', 'BOOLSPON', 'UNKSPON']) {
    assert.deepEqual(
      await checkReferralCodeExists({ db, referralCode: blockedCode }),
      { exists: false },
      `validateReferralCode must reject ${blockedCode}`
    );
  }
  for (const allowedCode of ['ADMINACT', 'LEGACYSP']) {
    assert.deepEqual(
      await checkReferralCodeExists({ db, referralCode: allowedCode }),
      { exists: true },
      `validateReferralCode must accept ${allowedCode}`
    );
  }

  // 2. settleDirectReferralCommission — blocked statuses & missing doc
  const blockedBuyers = [
    ['buyer-susp-low', 'MINER-S374-SL'],
    ['buyer-susp-up', 'MINER-S374-SU'],
    ['buyer-bool', 'MINER-S374-BL'],
    ['buyer-unk', 'MINER-S374-UK'],
    ['buyer-ghost', 'MINER-S374-GH']
  ];
  for (const [buyerUid, minerId] of blockedBuyers) {
    const res = await settleDirectReferralCommission({
      db,
      FieldValue,
      purchase: {
        orderId: `ORD-${minerId}`,
        minerId,
        productType: 'miner',
        netPaidUsdt: '100.00',
        buyerUid
      }
    });
    assert.equal(res.status, 'rejected', `${buyerUid} must be rejected`);
    assert.equal(res.reason, 'INACTIVE_SPONSOR', `${buyerUid} must reject with INACTIVE_SPONSOR`);
  }

  // 3. settleDirectReferralCommission — uppercase 'ACTIVE' and legacy missing status credited 10%
  const activeRes = await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-S374-AA',
      minerId: 'MINER-S374-AA',
      productType: 'miner',
      netPaidUsdt: '100.00',
      buyerUid: 'buyer-admin-act'
    }
  });
  assert.equal(activeRes.status, 'credited');
  assert.equal(activeRes.commissionUsdt6, '10.000000');
  assert.equal(store.get('userBalances/spon-admin-upper').usdtAvailable, 10);

  const legacyRes = await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-S374-LG',
      minerId: 'MINER-S374-LG',
      productType: 'miner',
      netPaidUsdt: '100.00',
      buyerUid: 'buyer-legacy'
    }
  });
  assert.equal(legacyRes.status, 'credited');
  assert.equal(legacyRes.commissionUsdt6, '10.000000');
  assert.equal(store.get('userBalances/spon-legacy').usdtAvailable, 10);
});
