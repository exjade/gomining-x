'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  settleDirectReferralCommission,
  reverseDirectReferralCommission
} = require('../src/referrals/directReferralService');
const {
  settleUnilevelDistribution,
  reverseUnilevelDistribution
} = require('../src/unilevel/unilevelSettlementService');

function createSharedConvergenceFirestore(initialDocs = {}) {
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

  function getNestedField(obj, fieldPath) {
    return fieldPath.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);
  }

  function applyFieldValues(existing, incoming) {
    const target = existing ? structuredClone(existing) : {};
    for (const [key, val] of Object.entries(incoming)) {
      if (val && typeof val === 'object' && val.__op === 'increment') {
        const current = typeof target[key] === 'number' ? target[key] : 0;
        const next = current + val.delta;
        target[key] = Number.isInteger(current) && Number.isInteger(val.delta)
          ? next
          : Number(next.toFixed(6));
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
          id: docPath.split('/').pop(),
          exists: data !== undefined,
          data: () => (data === undefined ? undefined : structuredClone(data))
        };
      },
      async set(data, options = {}) {
        const prev = options && options.merge ? store.get(docPath) : undefined;
        store.set(docPath, applyFieldValues(prev, data));
      }
    };
  }

  function makeCollectionRef(colPath, filters = [], maxLimit = null) {
    return {
      doc(docId) {
        return makeDocRef(`${colPath}/${docId}`);
      },
      where(field, op, value) {
        return makeCollectionRef(colPath, [...filters, { field, op, value }], maxLimit);
      },
      limit(n) {
        return makeCollectionRef(colPath, filters, n);
      },
      async get() {
        const prefix = `${colPath}/`;
        const docs = [];
        for (const [docPath, data] of store.entries()) {
          if (!docPath.startsWith(prefix)) continue;
          const rest = docPath.slice(prefix.length);
          if (rest.includes('/')) continue;
          const matches = filters.every((f) => f.op === '==' && getNestedField(data, f.field) === f.value);
          if (matches) {
            docs.push({
              id: rest,
              ref: makeDocRef(docPath),
              exists: true,
              data: () => structuredClone(data)
            });
          }
        }
        const sliced = typeof maxLimit === 'number' ? docs.slice(0, maxLimit) : docs;
        return { empty: sliced.length === 0, docs: sliced };
      }
    };
  }

  const db = {
    collection(name) {
      return makeCollectionRef(name);
    },
    async runTransaction(fn) {
      const stagedWrites = [];
      let writePhaseStarted = false;
      const tx = {
        async get(target) {
          if (writePhaseStarted) {
            throw new Error('Firestore transactions require all reads to be executed before all writes');
          }
          return target.get();
        },
        set(docRef, data, options = {}) {
          writePhaseStarted = true;
          stagedWrites.push({ docPath: docRef.path, data, options });
        }
      };

      const result = await fn(tx);
      for (const write of stagedWrites) {
        const prev = write.options && write.options.merge ? store.get(write.docPath) : undefined;
        store.set(write.docPath, applyFieldValues(prev, write.data));
      }
      return result;
    }
  };

  return { db, FieldValue, store };
}

/**
 * Mirrors SCRUM-275 (`withdrawalRequestLockService.ts`) atomic lock semantics:
 * effectiveAvailable = min(userBalances.availableBalanceMicros, users.balance * 1e6),
 * moves totalDebitMicros from AVAILABLE -> LOCKED and syncs users.balance mirror.
 */
async function simulateScrum275WithdrawalLock({ db, uid, totalDebitMicros }) {
  return db.runTransaction(async (tx) => {
    const balRef = db.collection('userBalances').doc(uid);
    const userRef = db.collection('users').doc(uid);
    const [balSnap, userSnap] = await Promise.all([tx.get(balRef), tx.get(userRef)]);

    const balData = balSnap.exists ? balSnap.data() : {};
    const userData = userSnap.exists ? userSnap.data() : {};
    const mirrorMicros = typeof userData.balance === 'number'
      ? Math.round(userData.balance * 1_000_000)
      : null;

    const rawAvailableMicros = balSnap.exists
      ? (Number.isSafeInteger(balData.availableBalanceMicros) ? balData.availableBalanceMicros : 0)
      : (mirrorMicros ?? 0);

    const effectiveAvailableMicros = mirrorMicros !== null
      ? Math.min(rawAvailableMicros, mirrorMicros)
      : rawAvailableMicros;

    if (totalDebitMicros > effectiveAvailableMicros) {
      const err = new Error(
        `INSUFFICIENT_AVAILABLE_BALANCE: requested ${totalDebitMicros}, effectiveAvailable ${effectiveAvailableMicros}`
      );
      err.code = 'INSUFFICIENT_AVAILABLE_BALANCE';
      throw err;
    }

    const nextAvailableMicros = effectiveAvailableMicros - totalDebitMicros;
    const nextLockedMicros = (Number.isSafeInteger(balData.lockedBalanceMicros) ? balData.lockedBalanceMicros : 0)
      + totalDebitMicros;

    tx.set(
      balRef,
      {
        uid,
        availableBalanceMicros: nextAvailableMicros,
        lockedBalanceMicros: nextLockedMicros,
        usdtAvailable: Number((nextAvailableMicros / 1_000_000).toFixed(6)),
        balance: Number((nextAvailableMicros / 1_000_000).toFixed(6))
      },
      { merge: true }
    );
    tx.set(
      userRef,
      {
        balance: Number((nextAvailableMicros / 1_000_000).toFixed(6))
      },
      { merge: true }
    );

    return {
      effectiveAvailableMicros,
      nextAvailableMicros,
      nextLockedMicros
    };
  });
}

function buildBaseDocs() {
  return {
    'users/sponsor-1': {
      uid: 'sponsor-1',
      status: 'active',
      emailVerified: true,
      balance: 0,
      referral: { referralCode: 'SPONSOR01' }
    },
    'unilevel/sponsor-1': {
      uid: 'sponsor-1',
      activeReferredMinersCount: 0
    },
    'users/buyer-1': {
      uid: 'buyer-1',
      status: 'active',
      emailVerified: true,
      sponsorId: 'sponsor-1',
      balance: 0,
      purchasesCount: 0
    },
    'unilevel/buyer-1': {
      uid: 'buyer-1',
      sponsorId: 'sponsor-1',
      activeReferredMinersCount: 0
    }
  };
}

test('SCRUM-355 E2E: direct referral 10% + unilevel owner/upline credit availableBalanceMicros, survive partial withdrawal + subsequent commissions without trapped funds or double spend', async () => {
  const { db, FieldValue, store } = createSharedConvergenceFirestore(buildBaseDocs());

  // 1. Direct referral 10% on $150.00 miner -> sponsor-1 gets 15.000000 USDT (15,000,000 micros)
  const direct1 = await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-CONV-1',
      minerId: 'MINER-CONV-1',
      productType: 'miner',
      netPaidUsdt: '150.00',
      buyerUid: 'buyer-1',
      isTestOrGuest: false,
      paymentMethod: 'wallet'
    }
  });
  assert.equal(direct1.status, 'credited');
  assert.equal(direct1.commissionMicroUsdt, 15_000_000n);
  assert.equal(store.get('userBalances/sponsor-1').availableBalanceMicros, 15_000_000);
  assert.equal(store.get('userBalances/sponsor-1').usdtAvailable, 15);
  assert.equal(store.get('users/sponsor-1').balance, 15);
  assert.equal(store.get('unilevel/sponsor-1').activeReferredMinersCount, 1);

  // 2. Daily mining profit ($20.000000) -> L1 sponsor-1 gets 1.95% (390,000 micros), owner buyer-1 gets 19,610,000 micros
  const uni1 = await settleUnilevelDistribution({
    db,
    FieldValue,
    dailyProfit: {
      dailyProfitId: 'MINER-CONV-1_2026-11-20',
      minerId: 'MINER-CONV-1',
      minerUid: 'buyer-1',
      periodDate: '2026-11-20',
      eligibleProfitUsdt6: '20.000000'
    }
  });
  assert.equal(uni1.status, 'distributed');
  assert.equal(store.get('userBalances/buyer-1').availableBalanceMicros, 19_610_000);
  assert.equal(store.get('users/buyer-1').balance, 19.61);
  assert.equal(store.get('userBalances/sponsor-1').availableBalanceMicros, 15_390_000);
  assert.equal(store.get('users/sponsor-1').balance, 15.39);

  // 3. Partial withdrawal lock on sponsor-1 (AVAILABLE -> LOCKED for 10,600,000 micros = $10.60 totalDebit)
  const w1 = await simulateScrum275WithdrawalLock({
    db,
    uid: 'sponsor-1',
    totalDebitMicros: 10_600_000
  });
  assert.equal(w1.effectiveAvailableMicros, 15_390_000);
  assert.equal(w1.nextAvailableMicros, 4_790_000);
  assert.equal(w1.nextLockedMicros, 10_600_000);
  assert.equal(store.get('userBalances/sponsor-1').availableBalanceMicros, 4_790_000);
  assert.equal(store.get('users/sponsor-1').balance, 4.79);

  // 4. Subsequent post-withdrawal commissions: direct referral 10% on $100.00 (+10,000,000 micros) + next day unilevel (+390,000 micros)
  const direct2 = await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-CONV-2',
      minerId: 'MINER-CONV-2',
      productType: 'miner',
      netPaidUsdt: '100.00',
      buyerUid: 'buyer-1',
      isTestOrGuest: false,
      paymentMethod: 'platform_balance'
    }
  });
  assert.equal(direct2.status, 'credited');

  const uni2 = await settleUnilevelDistribution({
    db,
    FieldValue,
    dailyProfit: {
      dailyProfitId: 'MINER-CONV-1_2026-11-21',
      minerId: 'MINER-CONV-1',
      minerUid: 'buyer-1',
      periodDate: '2026-11-21',
      eligibleProfitUsdt6: '20.000000'
    }
  });
  assert.equal(uni2.status, 'distributed');

  // Verify availableBalanceMicros and mirror both advanced to exact 15,180,000 micros ($15.18) with zero trapped funds
  assert.equal(store.get('userBalances/sponsor-1').availableBalanceMicros, 15_180_000);
  assert.equal(store.get('users/sponsor-1').balance, 15.18);
  assert.equal(
    Math.min(
      store.get('userBalances/sponsor-1').availableBalanceMicros,
      Math.round(store.get('users/sponsor-1').balance * 1_000_000)
    ),
    15_180_000
  );

  // 5. Full withdrawal of remaining 15,180,000 micros succeeds cleanly, and subsequent withdrawal fails closed (no double spend)
  const w2 = await simulateScrum275WithdrawalLock({
    db,
    uid: 'sponsor-1',
    totalDebitMicros: 15_180_000
  });
  assert.equal(w2.effectiveAvailableMicros, 15_180_000);
  assert.equal(w2.nextAvailableMicros, 0);
  assert.equal(w2.nextLockedMicros, 25_780_000);

  await assert.rejects(
    () => simulateScrum275WithdrawalLock({ db, uid: 'sponsor-1', totalDebitMicros: 1_000_000 }),
    (err) => err && err.code === 'INSUFFICIENT_AVAILABLE_BALANCE'
  );
});

test('SCRUM-355 E2E: reverseDirectReferralCommission and reverseUnilevelDistribution decrement availableBalanceMicros identically for sponsor, owner, and upline', async () => {
  const { db, FieldValue, store } = createSharedConvergenceFirestore(buildBaseDocs());

  const direct = await settleDirectReferralCommission({
    db,
    FieldValue,
    purchase: {
      orderId: 'ORD-REV-1',
      minerId: 'MINER-REV-1',
      productType: 'miner',
      netPaidUsdt: '150.00',
      buyerUid: 'buyer-1',
      isTestOrGuest: false,
      paymentMethod: 'wallet'
    }
  });
  assert.equal(direct.status, 'credited');

  const uni = await settleUnilevelDistribution({
    db,
    FieldValue,
    dailyProfit: {
      dailyProfitId: 'MINER-REV-1_2026-11-20',
      minerId: 'MINER-REV-1',
      minerUid: 'buyer-1',
      periodDate: '2026-11-20',
      eligibleProfitUsdt6: '20.000000'
    }
  });
  assert.equal(uni.status, 'distributed');

  assert.equal(store.get('userBalances/sponsor-1').availableBalanceMicros, 15_390_000);
  assert.equal(store.get('userBalances/buyer-1').availableBalanceMicros, 19_610_000);

  // Reverse direct referral (-15,000,000 micros on sponsor-1)
  const revDirect = await reverseDirectReferralCommission({
    db,
    FieldValue,
    commissionId: direct.commissionId,
    reversalId: 'REV-DIR-1',
    reason: 'CHARGEBACK'
  });
  assert.equal(revDirect.status, 'reversed');
  assert.equal(store.get('userBalances/sponsor-1').availableBalanceMicros, 390_000);
  assert.equal(store.get('userBalances/sponsor-1').usdtAvailable, 0.39);
  assert.equal(store.get('users/sponsor-1').balance, 0.39);

  // Reverse unilevel distribution (-19,610,000 micros on buyer-1, -390,000 micros on sponsor-1)
  const revUni = await reverseUnilevelDistribution({
    db,
    FieldValue,
    distributionId: uni.distributionId,
    reversalId: 'REV-UNI-1',
    reason: 'DAILY_PROFIT_CORRECTION'
  });
  assert.equal(revUni.status, 'reversed');
  assert.equal(store.get('userBalances/sponsor-1').availableBalanceMicros, 0);
  assert.equal(store.get('userBalances/sponsor-1').usdtAvailable, 0);
  assert.equal(store.get('users/sponsor-1').balance, 0);
  assert.equal(store.get('userBalances/buyer-1').availableBalanceMicros, 0);
  assert.equal(store.get('userBalances/buyer-1').usdtAvailable, 0);
  assert.equal(store.get('users/buyer-1').balance, 0);
});
