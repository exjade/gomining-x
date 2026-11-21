'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_BASE_ELECTRICITY_USD_PER_KWH,
  DEFAULT_EFFICIENCY_W_PER_TH,
  PERIOD_DATE_PATTERN,
  CANONICAL_MINER_ID_PATTERN,
  buildDailyProfitDocId,
  resolveMinerEconomicInputs,
  finalizeMinerDailyProfit,
  runFinalizeDailyMiningProfitBatch
} = require('../src/unilevel/dailyMiningProfitService');
const {
  resolvePreviousUtcDate,
  handleScheduledDailyMiningProfit
} = require('../src/unilevel/finalizeDailyMiningProfit');

function createInMemoryFirestore(initialDocs = {}) {
  const store = new Map();
  for (const [docPath, data] of Object.entries(initialDocs)) {
    store.set(docPath, structuredClone(data));
  }

  const FieldValue = {
    serverTimestamp() {
      return { __op: 'serverTimestamp' };
    }
  };

  function resolveFieldValues(incoming) {
    const out = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (v && typeof v === 'object' && v.__op === 'serverTimestamp') {
        out[k] = 'SERVER_TIMESTAMP';
      } else {
        out[k] = structuredClone(v);
      }
    }
    return out;
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

  function makeCollectionRef(colPath, filters = []) {
    return {
      path: colPath,
      doc(id) {
        return makeDocRef(`${colPath}/${id}`);
      },
      where(field, op, value) {
        if (op !== '==') throw new Error(`Unsupported op: ${op}`);
        return makeCollectionRef(colPath, [...filters, { field, value }]);
      },
      async get() {
        const prefix = `${colPath}/`;
        const docs = [];
        for (const [docPath, data] of store.entries()) {
          if (!docPath.startsWith(prefix)) continue;
          const rem = docPath.slice(prefix.length);
          if (rem.includes('/')) continue;
          if (filters.every((f) => data[f.field] === f.value)) {
            docs.push({
              exists: true,
              id: rem,
              ref: makeDocRef(docPath),
              data: () => structuredClone(data)
            });
          }
        }
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
          if (filters.every((f) => data[f.field] === f.value)) {
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
        async get(docRef) {
          if (writeStarted) {
            throw new Error('Firestore transactions require all reads to be executed before all writes');
          }
          const data = store.get(docRef.path);
          return {
            exists: data !== undefined,
            id: docRef.id,
            ref: docRef,
            data: () => (data !== undefined ? structuredClone(data) : undefined)
          };
        },
        set(docRef, data) {
          writeStarted = true;
          pendingWrites.push({ path: docRef.path, data });
          return tx;
        }
      };

      const result = await fn(tx);
      for (const write of pendingWrites) {
        store.set(write.path, resolveFieldValues(write.data));
      }
      return result;
    }
  };

  return { db, FieldValue, store };
}

test('constants, buildDailyProfitDocId, and resolvePreviousUtcDate validate strict formats and calendar dates', () => {
  assert.equal(DEFAULT_BASE_ELECTRICITY_USD_PER_KWH, '0.01');
  assert.equal(DEFAULT_EFFICIENCY_W_PER_TH, 15);
  assert.equal(PERIOD_DATE_PATTERN.test('2026-11-20'), true);
  assert.equal(CANONICAL_MINER_ID_PATTERN.test('MINER_01-abc'), true);

  assert.equal(buildDailyProfitDocId({ minerId: 'MINER-01', periodDate: '2026-11-20' }), 'MINER-01_2026-11-20');

  for (const badDate of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-11-2', 'invalid', '', null]) {
    assert.throws(() => buildDailyProfitDocId({ minerId: 'MINER-01', periodDate: badDate }), RangeError);
  }
  for (const badMinerId of ['', '   ', 'miner/01:bad!', 'miner 01', null]) {
    assert.throws(() => buildDailyProfitDocId({ minerId: badMinerId, periodDate: '2026-11-20' }), RangeError);
  }

  assert.equal(resolvePreviousUtcDate(new Date('2026-11-20T00:05:00Z')), '2026-11-19');
  assert.equal(resolvePreviousUtcDate(new Date('2026-03-01T00:05:00Z')), '2026-02-28');
  assert.equal(resolvePreviousUtcDate(new Date('2024-03-01T00:05:00Z')), '2024-02-29');
  assert.equal(resolvePreviousUtcDate(new Date('2026-01-01T00:05:00Z')), '2025-12-31');
  assert.throws(() => resolvePreviousUtcDate('not-a-date'), RangeError);
});

test('computes official reference case (120 TH @ 15 W/TH, $0.01/kWh, gross 2.85 -> eligibleProfit 2.176200)', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore();

  const res = await finalizeMinerDailyProfit({
    db,
    FieldValue,
    periodDate: '2026-11-19',
    finalizedAt: '2026-11-20T00:05:00Z',
    operatorConfig: { baseElectricityUsdPerKwh: '0.01' },
    miner: {
      id: 'MINER-REF-1',
      uid: 'owner-1',
      powerTh: 120,
      efficiencyWattsPerTh: 15,
      dailyGrossUsdt: '2.85'
    }
  });

  assert.equal(res.status, 'finalized');
  assert.equal(res.dailyProfitId, 'MINER-REF-1_2026-11-19');
  assert.equal(res.eligibleProfitUsdt6, '2.176200');

  const snap = store.get('mining_daily_profit/MINER-REF-1_2026-11-19');
  assert.equal(snap.status, 'finalized');
  assert.equal(snap.currency, 'USDT');
  assert.equal(snap.minerUid, 'owner-1');
  assert.equal(snap.uid, 'owner-1');
  assert.equal(snap.grossRevenueUsdt6, '2.850000');
  assert.equal(snap.electricityCostUsdt6, '0.432000');
  assert.equal(snap.afterElectricityUsdt6, '2.418000');
  assert.equal(snap.maintenanceCostUsdt6, '0.241800');
  assert.equal(snap.eligibleProfitUsdt6, '2.176200');
  assert.equal(snap.eligibleProfitInternalStr, '217620000');
  assert.equal(snap.inputSnapshot.membershipTier, 'explorer');
  assert.equal(snap.inputSnapshot.serviceStreakDays, 0);
});

test('applies activeModifiers discount caps for Explorer (30d streak 5%/0%), Starter (10%/5% -> 2.227386), and Pro (20%/10% -> 2.279004)', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore();

  const cases = [
    {
      id: 'MINER-EXP',
      tier: 'explorer',
      elecDisc: '0.05',
      maintDisc: '0.10',
      streak: 30,
      expectedEligible: '2.195640',
      expectedElecDiscInt: '5000000',
      expectedMaintDiscInt: '0'
    },
    {
      id: 'MINER-START',
      tier: 'starter',
      elecDisc: '0.10',
      maintDisc: '0.05',
      streak: 15,
      expectedEligible: '2.227386',
      expectedElecDiscInt: '10000000',
      expectedMaintDiscInt: '5000000'
    },
    {
      id: 'MINER-PRO',
      tier: 'pro',
      elecDisc: '0.20',
      maintDisc: '0.10',
      streak: 60,
      expectedEligible: '2.279004',
      expectedElecDiscInt: '20000000',
      expectedMaintDiscInt: '10000000'
    }
  ];

  for (const c of cases) {
    const res = await finalizeMinerDailyProfit({
      db,
      FieldValue,
      periodDate: '2026-11-19',
      operatorConfig: { baseElectricityUsdPerKwh: '0.01' },
      miner: {
        id: c.id,
        uid: 'owner-tiers',
        dailyGrossUsdt: '2.85',
        baseStats: { powerTh: 120, baseEfficiencyWPerTh: 15, baseElectricityUsdPerKwh: '0.01' },
        activeModifiers: {
          membershipTier: c.tier,
          electricityDiscountPct: c.elecDisc,
          maintenanceDiscountPct: c.maintDisc,
          serviceStreakDays: c.streak
        }
      }
    });
    assert.equal(res.status, 'finalized');
    assert.equal(res.eligibleProfitUsdt6, c.expectedEligible);

    const doc = store.get(`mining_daily_profit/${c.id}_2026-11-19`);
    assert.equal(doc.inputSnapshot.membershipTier, c.tier);
    assert.equal(doc.inputSnapshot.effectiveElectricityDiscountInternalStr, c.expectedElecDiscInt);
    assert.equal(doc.inputSnapshot.effectiveMaintenanceDiscountInternalStr, c.expectedMaintDiscInt);
    assert.equal(doc.inputSnapshot.serviceStreakDays, c.streak);
  }
});

test('supports real platformBalancePurchaseService.ts miner schema (no baseStats/activeModifiers) and floors grossRevenue <= electricityCost at 0.000000', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore({
    'operatorConfig/mining': {
      baseElectricityUsdPerKwh: '0.01',
      grossRevenuePerThUsdt: '0.02375' // 120 * 0.02375 = 2.85 USDT
    },
    'miners/uid-real-1/miner/MINER_REAL_1': {
      id: 'MINER_REAL_1',
      uid: 'uid-real-1',
      packageId: 'pkg-120th',
      powerTh: 120,
      efficiency: 15,
      efficiencyWattsPerTh: 15,
      status: 'active',
      network: 'PLATFORM_BALANCE'
    },
    'miners/uid-real-2/miner/MINER_DEFICIT': {
      id: 'MINER_DEFICIT',
      uid: 'uid-real-2',
      powerTh: 120,
      efficiencyWattsPerTh: 15,
      dailyGrossUsdt: '0.10',
      status: 'active'
    }
  });

  const summary = await handleScheduledDailyMiningProfit({
    db,
    FieldValue,
    referenceDate: new Date('2026-11-20T00:05:00Z')
  });

  assert.equal(summary.periodDate, '2026-11-19');
  assert.equal(summary.totalScanned, 2);
  assert.equal(summary.finalizedCount, 2);
  assert.equal(summary.errorCount, 0);

  const realSnap = store.get('mining_daily_profit/MINER_REAL_1_2026-11-19');
  assert.equal(realSnap.minerUid, 'uid-real-1');
  assert.equal(realSnap.grossRevenueUsdt6, '2.850000');
  assert.equal(realSnap.eligibleProfitUsdt6, '2.176200');

  const deficitSnap = store.get('mining_daily_profit/MINER_DEFICIT_2026-11-19');
  assert.equal(deficitSnap.status, 'finalized');
  assert.equal(deficitSnap.eligibleProfitUsdt6, '0.000000');
  assert.equal(deficitSnap.eligibleProfitInternalStr, '0');
});

test('batch job enforces strict idempotency (immutable inputSnapshot), excludes inactive/test/demo miners, and isolates corrupt miner errors', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore({
    'operatorConfig/mining': {
      baseElectricityUsdPerKwh: '0.01',
      grossRevenuePerThUsdt: '0.02375'
    },
    'miners/u1/miner/MINER_OK_1': {
      id: 'MINER_OK_1',
      uid: 'u1',
      powerTh: 120,
      efficiencyWattsPerTh: 15,
      status: 'active',
      activeModifiers: { membershipTier: 'explorer', electricityDiscountPct: 0, maintenanceDiscountPct: 0, serviceStreakDays: 0 }
    },
    'miners/u2/miner/MINER_INACTIVE': {
      id: 'MINER_INACTIVE',
      uid: 'u2',
      powerTh: 120,
      status: 'inactive'
    },
    'miners/u3/miner/MINER_TEST': {
      id: 'MINER_TEST',
      uid: 'u3',
      powerTh: 120,
      status: 'active',
      isTestOrGuest: true
    },
    'miners/u4/miner/MINER_DEMO': {
      id: 'MINER_DEMO',
      uid: 'u4',
      powerTh: 120,
      status: 'active',
      isDemo: true
    },
    'miners/u5/miner/MINER_CORRUPT': {
      id: 'MINER_CORRUPT',
      uid: 'u5',
      powerTh: -50,
      status: 'active'
    },
    'miners/u6/miner/MINER_OK_2': {
      id: 'MINER_OK_2',
      uid: 'u6',
      powerTh: 120,
      efficiencyWattsPerTh: 15,
      status: 'active'
    }
  });

  const firstRun = await runFinalizeDailyMiningProfitBatch({
    db,
    FieldValue,
    periodDate: '2026-11-19',
    batchSize: 2
  });

  // 5 active scanned (inactive excluded by query): 2 finalized, 2 skipped (test/demo), 1 error (corrupt)
  assert.equal(firstRun.totalScanned, 5);
  assert.equal(firstRun.finalizedCount, 2);
  assert.equal(firstRun.alreadyFinalizedCount, 0);
  assert.equal(firstRun.skippedCount, 2);
  assert.equal(firstRun.errorCount, 1);
  assert.equal(firstRun.errors[0].minerId, 'MINER_CORRUPT');
  assert.equal(store.has('mining_daily_profit/MINER_OK_1_2026-11-19'), true);
  assert.equal(store.has('mining_daily_profit/MINER_OK_2_2026-11-19'), true);
  assert.equal(store.has('mining_daily_profit/MINER_TEST_2026-11-19'), false);
  assert.equal(store.has('mining_daily_profit/MINER_DEMO_2026-11-19'), false);
  assert.equal(store.has('mining_daily_profit/MINER_INACTIVE_2026-11-19'), false);

  // User upgrades membership to Pro AFTER day finalized -> re-running batch MUST NOT overwrite snapshot
  const upgradedMiner = store.get('miners/u1/miner/MINER_OK_1');
  upgradedMiner.activeModifiers = {
    membershipTier: 'pro',
    electricityDiscountPct: '0.20',
    maintenanceDiscountPct: '0.10',
    serviceStreakDays: 30
  };
  store.set('miners/u1/miner/MINER_OK_1', upgradedMiner);

  const secondRun = await runFinalizeDailyMiningProfitBatch({
    db,
    FieldValue,
    periodDate: '2026-11-19',
    batchSize: 2
  });

  assert.equal(secondRun.finalizedCount, 0);
  assert.equal(secondRun.alreadyFinalizedCount, 2);
  assert.equal(secondRun.skippedCount, 2);
  assert.equal(secondRun.errorCount, 1);

  const immutableSnap = store.get('mining_daily_profit/MINER_OK_1_2026-11-19');
  assert.equal(immutableSnap.eligibleProfitUsdt6, '2.176200');
  assert.equal(immutableSnap.inputSnapshot.membershipTier, 'explorer');
  assert.equal(immutableSnap.inputSnapshot.serviceStreakDays, 0);

  // resolveMinerEconomicInputs rejects missing grossRevenuePerThUsdt when dailyGrossUsdt omitted
  assert.throws(
    () => resolveMinerEconomicInputs({ minerData: { powerTh: 120 }, operatorConfig: {} }),
    RangeError
  );
});
