'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { handlePurchaseSettledEvent } = require('../src/referrals');
const {
  runFinalizeDailyMiningProfitBatch,
  handleMiningProfitFinalizedEvent,
  getUnilevelStatsForUser
} = require('../src/unilevel');

function createUnifiedInMemoryFirestore(initialDocs = {}) {
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
    const parts = docPath.split('/');
    const parentColPath = parts.slice(0, -1).join('/');
    const parentDocPath = parts.length >= 4 ? parts.slice(0, -2).join('/') : null;
    return {
      path: docPath,
      id: parts[parts.length - 1],
      parent: {
        path: parentColPath,
        parent: parentDocPath ? { path: parentDocPath, id: parts[parts.length - 3] } : null
      },
      collection(subName) {
        return makeCollectionRef(`${docPath}/${subName}`);
      },
      async get() {
        const data = store.get(docPath);
        return {
          exists: data !== undefined,
          id: parts[parts.length - 1],
          ref: this,
          data: () => (data !== undefined ? structuredClone(data) : undefined)
        };
      }
    };
  }

  function makeCollectionRef(colPath, filters = [], limitCount = null) {
    return {
      __isQuery: true,
      path: colPath,
      doc(id) {
        return makeDocRef(`${colPath}/${id}`);
      },
      where(field, op, value) {
        if (op !== '==') throw new Error(`Unsupported op: ${op}`);
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
          const rem = docPath.slice(prefix.length);
          if (rem.includes('/')) continue;
          if (filters.every((f) => getNestedField(data, f.field) === f.value)) {
            matches.push({
              exists: true,
              id: rem,
              ref: makeDocRef(docPath),
              data: () => structuredClone(data)
            });
          }
        }
        const docs = limitCount !== null ? matches.slice(0, limitCount) : matches;
        return { empty: docs.length === 0, size: docs.length, docs };
      }
    };
  }

  function makeCollectionGroupRef(groupName, filters = []) {
    return {
      where(field, op, value) {
        if (op !== '==') throw new Error(`Unsupported op: ${op}`);
        return makeCollectionGroupRef(groupName, [...filters, { field, value }]);
      },
      async get() {
        const docs = [];
        for (const [docPath, data] of store.entries()) {
          const parts = docPath.split('/');
          if (parts.length < 2 || parts[parts.length - 2] !== groupName) continue;
          if (filters.every((f) => getNestedField(data, f.field) === f.value)) {
            docs.push({
              exists: true,
              id: parts[parts.length - 1],
              ref: makeDocRef(docPath),
              data: () => structuredClone(data)
            });
          }
        }
        return { empty: docs.length === 0, size: docs.length, docs };
      }
    };
  }

  const db = {
    collection(name) {
      return makeCollectionRef(name);
    },
    collectionGroup(groupName) {
      return makeCollectionGroupRef(groupName);
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
            ref: target,
            data: () => (data !== undefined ? structuredClone(data) : undefined)
          };
        },
        set(docRef, data, options = {}) {
          writeStarted = true;
          pendingWrites.push({ path: docRef.path, data, merge: Boolean(options.merge) });
          return tx;
        }
      };

      const result = await fn(tx);
      for (const write of pendingWrites) {
        const existing = store.get(write.path);
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

test('SCRUM-235 E2E chain: SCRUM-229 purchase settlement -> SCRUM-327 daily mining profit -> SCRUM-230 Unilevel V1 + SCRUM-349 index override', async () => {
  const { db, FieldValue, store } = createUnifiedInMemoryFirestore({
    'operatorConfig/mining': {
      baseElectricityUsdPerKwh: '0.01',
      grossRevenuePerThUsdt: '0.02375' // 120 TH * 0.02375 = 2.85 USDT
    },
    'users/sponsor-e2e': {
      uid: 'sponsor-e2e',
      status: 'active',
      emailVerified: true,
      balance: 0,
      commissionBalance: 0,
      totalCommissionsEarned: 0,
      referral: { referralCode: 'SPONSOR_E2E' }
    },
    'unilevel/sponsor-e2e': {
      uid: 'sponsor-e2e',
      activeReferredMinersCount: 0,
      directCount: 1,
      totalTeamCount: 1
    },
    'users/buyer-e2e': {
      uid: 'buyer-e2e',
      status: 'active',
      emailVerified: true,
      balance: 0,
      purchasesCount: 0,
      referral: { referralCode: 'BUYER_E2E', referrerBy: 'sponsor_e2e' }
    },
    'unilevel/buyer-e2e': {
      uid: 'buyer-e2e',
      activeReferredMinersCount: 0
    },
    'miners/buyer-e2e/miner/MINER_E2E_120TH': {
      id: 'MINER_E2E_120TH',
      uid: 'buyer-e2e',
      packageId: 'pkg-120th',
      powerTh: 120,
      efficiency: 15,
      efficiencyWattsPerTh: 15,
      status: 'active',
      network: 'PLATFORM_BALANCE'
    }
  });

  // 1. SCRUM-229: Direct creation SETTLED of 120 TH miner ($249.99, PLATFORM_BALANCE)
  const directRes = await handlePurchaseSettledEvent({
    orderId: 'ORD-E2E-1',
    beforeData: null,
    afterData: {
      orderId: 'ORD-E2E-1',
      userId: 'buyer-e2e',
      amountUsd: 249.99,
      paymentNetwork: 'PLATFORM_BALANCE',
      status: 'SETTLED',
      activatedMinerId: 'MINER_E2E_120TH',
      settledAt: '2026-11-19T12:00:00Z'
    },
    db,
    FieldValue
  });

  assert.equal(directRes.status, 'credited');
  assert.equal(directRes.sponsorUid, 'sponsor-e2e');
  assert.equal(directRes.commissionId, 'COMM-MINER_E2E_120TH');
  assert.equal(directRes.commissionUsdt6, '24.999000');
  assert.equal(store.get('referrals/sponsor-e2e').withdrawableBalance, 24.999);
  assert.equal(store.get('userBalances/sponsor-e2e').usdtAvailable, 24.999);
  assert.equal(store.get('unilevel/sponsor-e2e').activeReferredMinersCount, 1);

  // 2. SCRUM-327: Daily mining profit batch scans collectionGroup('miner') -> 2.176200 USDT
  const batchRes = await runFinalizeDailyMiningProfitBatch({
    db,
    FieldValue,
    periodDate: '2026-11-19',
    finalizedAt: '2026-11-20T00:05:00Z'
  });

  assert.equal(batchRes.totalScanned, 1);
  assert.equal(batchRes.finalizedCount, 1);
  assert.equal(batchRes.errorCount, 0);

  const profitSnap = store.get('mining_daily_profit/MINER_E2E_120TH_2026-11-19');
  assert.equal(profitSnap.status, 'finalized');
  assert.equal(profitSnap.eligibleProfitUsdt6, '2.176200');

  // 3. SCRUM-230: Unilevel V1 settlement triggered by finalized snapshot
  const unilevelRes = await handleMiningProfitFinalizedEvent({
    dailyProfitId: 'MINER_E2E_120TH_2026-11-19',
    beforeData: null,
    afterData: profitSnap,
    db,
    FieldValue
  });

  assert.equal(unilevelRes.status, 'distributed');
  assert.equal(unilevelRes.distributedUsdt6, '0.042435'); // Sponsor eligible via SCRUM-229 activeReferredMinersCount=1 (L1 = 1.95%)
  // Owner gets 80% + 18.05% undistributed = 98.05% of 2.1762 = 2.13376410 -> 2.133764
  assert.equal(unilevelRes.userMiningPayoutUsdt6, '2.133764');

  // Ledgers remain strictly separated (D8)
  assert.equal(store.has('referralCommissions/COMM-MINER_E2E_120TH'), true);
  assert.equal(store.has('unilevel_ledger/2026-11-19_MINER_E2E_120TH_UNILEVEL_V1_L1'), true);
  assert.equal(store.has('unilevel_ledger/2026-11-19_MINER_E2E_120TH_UNILEVEL_V1_OWNER'), true);
  assert.equal(store.get('userBalances/sponsor-e2e').usdtAvailable, 25.041435); // 24.999 + 0.042435
  assert.equal(store.get('userBalances/buyer-e2e').usdtAvailable, 2.133764);

  // Authenticated stats reflect strict 3-metric separation
  const sponsorStats = await getUnilevelStatsForUser({ db, uid: 'sponsor-e2e' });
  assert.equal(sponsorStats.eligibleForUnilevel, true);
  assert.equal(sponsorStats.activeReferredMinersCount, 1);
  assert.equal(sponsorStats.ownMiningProfit, 0);
  assert.equal(sponsorStats.receivedUnilevelCommission, 0.042435);
  assert.equal(sponsorStats.organizationGeneratedProfitShare, 0.042435);

  const buyerStats = await getUnilevelStatsForUser({ db, uid: 'buyer-e2e' });
  assert.equal(buyerStats.ownMiningProfit, 2.133764);
  assert.equal(buyerStats.receivedUnilevelCommission, 0);

  // 4. SCRUM-349: Validate firestore.indexes.json COLLECTION_GROUP fieldOverride for miner.status
  const indexesPath = path.join(__dirname, '..', '..', 'firestore.indexes.json');
  const idxJson = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
  assert.ok(idxJson.indexes.length >= 12, `Expected at least 12 indexes, got ${idxJson.indexes.length}`);
  assert.equal(
    idxJson.indexes.filter((entry) => ['commercial_packages', 'admin_users', 'users'].includes(entry.collectionGroup)).length,
    12
  );
  const minerStatusOverride = idxJson.fieldOverrides.find(
    (entry) => entry.collectionGroup === 'miner' && entry.fieldPath === 'status'
  );
  assert.ok(minerStatusOverride, 'Missing miner.status fieldOverride in firestore.indexes.json');
  assert.equal(
    minerStatusOverride.indexes.some((i) => i.queryScope === 'COLLECTION_GROUP' && i.order === 'ASCENDING'),
    true
  );
});

test('SCRUM-374 E2E parity: Admin uppercase ACTIVE sponsor and legacy accounts without status pass SCRUM-229 -> SCRUM-327 -> SCRUM-230', async () => {
  const { db, FieldValue, store } = createUnifiedInMemoryFirestore({
    'operatorConfig/mining': {
      baseElectricityUsdPerKwh: '0.01',
      grossRevenuePerThUsdt: '0.02375'
    },
    // L2 upline: legacy account without status field
    'users/grand-legacy': {
      uid: 'grand-legacy',
      emailVerified: true,
      balance: 0,
      referral: { referralCode: 'GRAND_LEG' }
    },
    'unilevel/grand-legacy': {
      uid: 'grand-legacy',
      activeReferredMinersCount: 1,
      directCount: 1,
      totalTeamCount: 2
    },
    // L1 sponsor: Admin uppercase 'ACTIVE'
    'users/sponsor-upper': {
      uid: 'sponsor-upper',
      status: 'ACTIVE',
      emailVerified: true,
      sponsorId: 'grand-legacy',
      balance: 0,
      commissionBalance: 0,
      totalCommissionsEarned: 0,
      referral: { referralCode: 'SPON_UPPER' }
    },
    'unilevel/sponsor-upper': {
      uid: 'sponsor-upper',
      sponsorId: 'grand-legacy',
      activeReferredMinersCount: 0,
      directCount: 1,
      totalTeamCount: 1
    },
    // Buyer: legacy account without status field
    'users/buyer-legacy': {
      uid: 'buyer-legacy',
      emailVerified: true,
      balance: 0,
      purchasesCount: 0,
      referral: { referralCode: 'BUYER_LEG', referrerBy: 'spon_upper' }
    },
    'unilevel/buyer-legacy': {
      uid: 'buyer-legacy',
      activeReferredMinersCount: 0
    },
    'miners/buyer-legacy/miner/MINER_374_120TH': {
      id: 'MINER_374_120TH',
      uid: 'buyer-legacy',
      packageId: 'pkg-120th',
      powerTh: 120,
      efficiency: 15,
      efficiencyWattsPerTh: 15,
      status: 'active',
      network: 'PLATFORM_BALANCE'
    }
  });

  // 1. SCRUM-229 Direct Referral 10%
  const directRes = await handlePurchaseSettledEvent({
    orderId: 'ORD-374-1',
    beforeData: null,
    afterData: {
      orderId: 'ORD-374-1',
      userId: 'buyer-legacy',
      amountUsd: 249.99,
      paymentNetwork: 'PLATFORM_BALANCE',
      status: 'SETTLED',
      activatedMinerId: 'MINER_374_120TH',
      settledAt: '2026-11-24T12:00:00Z'
    },
    db,
    FieldValue
  });
  assert.equal(directRes.status, 'credited');
  assert.equal(directRes.sponsorUid, 'sponsor-upper');
  assert.equal(directRes.commissionUsdt6, '24.999000');
  assert.equal(store.get('unilevel/sponsor-upper').activeReferredMinersCount, 1);

  // 2. SCRUM-327 Daily Mining Profit
  const batchRes = await runFinalizeDailyMiningProfitBatch({
    db,
    FieldValue,
    periodDate: '2026-11-24',
    finalizedAt: '2026-11-25T00:05:00Z'
  });
  assert.equal(batchRes.finalizedCount, 1);
  const profitSnap = store.get('mining_daily_profit/MINER_374_120TH_2026-11-24');
  assert.equal(profitSnap.eligibleProfitUsdt6, '2.176200');

  // 3. SCRUM-230 Unilevel V1 distribution credits both L1 ('ACTIVE') and L2 (legacy missing status)
  const unilevelRes = await handleMiningProfitFinalizedEvent({
    dailyProfitId: 'MINER_374_120TH_2026-11-24',
    beforeData: null,
    afterData: profitSnap,
    db,
    FieldValue
  });
  assert.equal(unilevelRes.status, 'distributed');
  // L1 1.95% (0.042435) + L2 1.85% (0.040259) = 0.082694
  assert.equal(unilevelRes.distributedUsdt6, '0.082694');
  assert.equal(store.get('userBalances/sponsor-upper').usdtAvailable, 25.041435);
  assert.equal(store.get('userBalances/grand-legacy').usdtAvailable, 0.040259);

  const sponsorStats = await getUnilevelStatsForUser({ db, uid: 'sponsor-upper' });
  assert.equal(sponsorStats.eligibleForUnilevel, true);
  const grandStats = await getUnilevelStatsForUser({ db, uid: 'grand-legacy' });
  assert.equal(grandStats.eligibleForUnilevel, true);
});
