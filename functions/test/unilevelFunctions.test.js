'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ROUNDING_ACCOUNT_DOC_ID,
  buildUnilevelDistributionId,
  settleUnilevelDistribution,
  reverseUnilevelDistribution
} = require('../src/unilevel/unilevelSettlementService');
const {
  isFinalizedStatus,
  handleMiningProfitFinalizedEvent
} = require('../src/unilevel/onMiningProfitFinalized');
const {
  getUnilevelStats,
  getUnilevelTree,
  getUnilevelHistory,
  getUnilevelStatsForUser,
  getUnilevelTreeForUser,
  getUnilevelHistoryForUser
} = require('../src/unilevel/unilevelReadApi');

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

function build20LevelChainDocs(ownerUid = 'owner-1') {
  const docs = {};
  docs[`users/${ownerUid}`] = { uid: ownerUid, status: 'active', emailVerified: true, sponsorId: 'u1', balance: 0 };
  docs[`unilevel/${ownerUid}`] = { uid: ownerUid, sponsorId: 'u1', activeReferredMinersCount: 1 };

  for (let level = 1; level <= 20; level += 1) {
    const uid = `u${level}`;
    const nextSponsor = level < 20 ? `u${level + 1}` : null;
    docs[`users/${uid}`] = {
      uid,
      status: 'active',
      emailVerified: true,
      sponsorId: nextSponsor,
      balance: 0,
      email: `${uid}@secret.example`,
      referral: { referralCode: `CODE${level}` }
    };
    docs[`unilevel/${uid}`] = {
      uid,
      sponsorId: nextSponsor,
      activeReferredMinersCount: 2,
      directCount: 1,
      totalTeamCount: 20 - level + 1
    };
  }
  return docs;
}

test('onMiningProfitFinalized: triggers only on creation/transition into finalized status', async () => {
  assert.equal(isFinalizedStatus('finalized'), true);
  assert.equal(isFinalizedStatus('FINALIZED'), true);
  assert.equal(isFinalizedStatus('pending'), false);
  assert.equal(isFinalizedStatus(null), false);

  const { db, FieldValue, store } = createInMemoryFirestore(build20LevelChainDocs('owner-1'));

  const ignoredDraft = await handleMiningProfitFinalizedEvent({
    dailyProfitId: 'MINER-01_2026-11-19',
    beforeData: null,
    afterData: { status: 'pending', minerId: 'MINER-01', minerUid: 'owner-1', periodDate: '2026-11-19', eligibleProfitUsdt6: '2.176200' },
    db,
    FieldValue
  });
  assert.equal(ignoredDraft.status, 'ignored');

  const ignoredAlready = await handleMiningProfitFinalizedEvent({
    dailyProfitId: 'MINER-01_2026-11-19',
    beforeData: { status: 'finalized' },
    afterData: { status: 'finalized', minerId: 'MINER-01', minerUid: 'owner-1', periodDate: '2026-11-19', eligibleProfitUsdt6: '2.176200' },
    db,
    FieldValue
  });
  assert.equal(ignoredAlready.status, 'ignored');

  const settled = await handleMiningProfitFinalizedEvent({
    dailyProfitId: 'MINER-01_2026-11-19',
    beforeData: null,
    afterData: {
      status: 'finalized',
      minerId: 'MINER-01',
      minerUid: 'owner-1',
      periodDate: '2026-11-19',
      eligibleProfitUsdt6: '2.176200'
    },
    db,
    FieldValue
  });
  assert.equal(settled.status, 'distributed');
  assert.equal(settled.distributionId, '2026-11-19_MINER-01_UNILEVEL_V1');
  assert.equal(store.has('unilevel_distributions/2026-11-19_MINER-01_UNILEVEL_V1'), true);
});

test('official scenario 2.176200 with 20 eligible uplines: exact payouts, rounding residual 1000n, and strict idempotency', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore(build20LevelChainDocs('owner-1'));
  const expectedId = buildUnilevelDistributionId({ periodDate: '2026-11-19', minerId: 'MINER-20L' });
  assert.equal(expectedId, '2026-11-19_MINER-20L_UNILEVEL_V1');

  const res = await settleUnilevelDistribution({
    db,
    FieldValue,
    dailyProfit: {
      dailyProfitId: 'MINER-20L_2026-11-19',
      minerId: 'MINER-20L',
      minerUid: 'owner-1',
      periodDate: '2026-11-19',
      eligibleProfitUsdt6: '2.176200'
    },
    settledAt: '2026-11-20T00:06:00Z'
  });

  assert.equal(res.status, 'distributed');
  assert.equal(res.userMiningPayoutUsdt6, '1.740960');
  assert.equal(res.distributedUsdt6, '0.435230');
  assert.equal(res.undistributedUsdt6, '0.000000');
  assert.equal(res.roundingResidualInternal, 1000n);

  // Verify owner & L1 & L20 balances and ledgers
  assert.equal(store.get('userBalances/owner-1').usdtAvailable, 1.74096);
  assert.equal(store.get('userBalances/owner-1').miningBalance, 1.74096);
  assert.equal(store.get('unilevel_ledger/2026-11-19_MINER-20L_UNILEVEL_V1_OWNER').amountUsdt6, '1.740960');

  assert.equal(store.get('userBalances/u1').usdtAvailable, 0.042435);
  assert.equal(store.get('userBalances/u1').unilevelBalance, 0.042435);
  assert.equal(store.get('unilevel_ledger/2026-11-19_MINER-20L_UNILEVEL_V1_L1').creditedUsdt6, '0.042435');

  assert.equal(store.get('userBalances/u20').usdtAvailable, 0.001088);
  assert.equal(store.get('unilevel_ledger/2026-11-19_MINER-20L_UNILEVEL_V1_L20').creditedUsdt6, '0.001088');

  // Rounding residual accounting (Q9)
  const roundingDoc = store.get(`platformAccounting/${ROUNDING_ACCOUNT_DOC_ID}`);
  assert.equal(roundingDoc.totalResidualInternalCount, 1000);
  assert.equal(roundingDoc.entriesCount, 1);
  assert.equal(
    store.get(`platformAccounting/${ROUNDING_ACCOUNT_DOC_ID}/entries/${expectedId}`).totalResidualInternalStr,
    '1000'
  );

  // Strict idempotency retry: no balance or ledger duplication
  const retry = await settleUnilevelDistribution({
    db,
    FieldValue,
    dailyProfit: {
      dailyProfitId: 'MINER-20L_2026-11-19',
      minerId: 'MINER-20L',
      minerUid: 'owner-1',
      periodDate: '2026-11-19',
      eligibleProfitUsdt6: '2.176200'
    }
  });
  assert.equal(retry.status, 'already_distributed');
  assert.equal(store.get('userBalances/owner-1').usdtAvailable, 1.74096);
  assert.equal(store.get('userBalances/u1').usdtAvailable, 0.042435);
});

test('partial/ineligible uplines apply Option A (no compression) and return undistributedAmount to miner owner (100% when no uplines)', async () => {
  // 1. No uplines -> owner receives 100% (2.176200)
  const solo = createInMemoryFirestore({
    'users/solo-owner': { uid: 'solo-owner', status: 'active', emailVerified: true, balance: 0 },
    'unilevel/solo-owner': { uid: 'solo-owner', activeReferredMinersCount: 0 }
  });
  const soloRes = await settleUnilevelDistribution({
    db: solo.db,
    FieldValue: solo.FieldValue,
    dailyProfit: {
      dailyProfitId: 'MINER-SOLO_2026-11-19',
      minerId: 'MINER-SOLO',
      minerUid: 'solo-owner',
      periodDate: '2026-11-19',
      eligibleProfitUsdt6: '2.176200'
    }
  });
  assert.equal(soloRes.userMiningPayoutUsdt6, '2.176200');
  assert.equal(soloRes.distributedUsdt6, '0.000000');
  assert.equal(soloRes.undistributedUsdt6, '0.435240');
  assert.equal(solo.store.get('userBalances/solo-owner').usdtAvailable, 2.1762);

  // 2. Mixed eligibility: L1 unverified, L2 activeReferredMinersCount: 0, L3 inactive, L4 eligible (stays at L4 = 1.65%, NOT compressed to L1)
  const mixed = createInMemoryFirestore({
    'users/owner': { uid: 'owner', status: 'active', emailVerified: true, sponsorId: 'u1' },
    'unilevel/owner': { uid: 'owner', sponsorId: 'u1' },
    'users/u1': { uid: 'u1', status: 'active', emailVerified: false, sponsorId: 'u2' },
    'unilevel/u1': { uid: 'u1', sponsorId: 'u2', activeReferredMinersCount: 2 },
    'users/u2': { uid: 'u2', status: 'active', emailVerified: true, sponsorId: 'u3' },
    'unilevel/u2': { uid: 'u2', sponsorId: 'u3', activeReferredMinersCount: 0 },
    'users/u3': { uid: 'u3', status: 'inactive', emailVerified: true, sponsorId: 'u4' },
    'unilevel/u3': { uid: 'u3', sponsorId: 'u4', activeReferredMinersCount: 3 },
    'users/u4': { uid: 'u4', status: 'active', emailVerified: true },
    'unilevel/u4': { uid: 'u4', activeReferredMinersCount: 1 }
  });

  const mixedRes = await settleUnilevelDistribution({
    db: mixed.db,
    FieldValue: mixed.FieldValue,
    dailyProfit: {
      dailyProfitId: 'MINER-MIX_2026-11-19',
      minerId: 'MINER-MIX',
      minerUid: 'owner',
      periodDate: '2026-11-19',
      eligibleProfitUsdt6: '2.176200'
    }
  });

  // L4 rate is 1.65%: 2.1762 * 0.0165 = 0.03590730 -> 0.035907
  assert.equal(mixedRes.distributedUsdt6, '0.035907');
  assert.equal(mixed.store.has('userBalances/u1'), false);
  assert.equal(mixed.store.has('userBalances/u2'), false);
  assert.equal(mixed.store.has('userBalances/u3'), false);
  assert.equal(mixed.store.get('userBalances/u4').usdtAvailable, 0.035907);
  // Owner receives 80% + 18.35% undistributed = 98.35% of 2.1762 = 2.14029270 -> 2.140292
  assert.equal(mixedRes.userMiningPayoutUsdt6, '2.140292');
});

test('resolves upline via referral.referrerBy code-to-UID and cuts immediately on A -> B -> A cycle', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore({
    'users/A': { uid: 'A', status: 'active', emailVerified: true, referral: { referralCode: 'CODE_A', referrerBy: 'code_b' } },
    'unilevel/A': { uid: 'A', activeReferredMinersCount: 1 },
    'users/B': { uid: 'B', status: 'active', emailVerified: true, referral: { referralCode: 'CODE_B', referrerBy: 'CODE_A' } },
    'unilevel/B': { uid: 'B', activeReferredMinersCount: 1 }
  });

  const res = await settleUnilevelDistribution({
    db,
    FieldValue,
    dailyProfit: {
      dailyProfitId: 'MINER-CYC_2026-11-19',
      minerId: 'MINER-CYC',
      minerUid: 'A',
      periodDate: '2026-11-19',
      eligibleProfitUsdt6: '2.176200'
    }
  });

  assert.equal(res.cycleDetected, true);
  assert.equal(res.distributedUsdt6, '0.042435'); // Only B credited at L1; L2 cycle back to A cut
  assert.equal(store.get('userBalances/B').usdtAvailable, 0.042435);
  const distDoc = store.get('unilevel_distributions/2026-11-19_MINER-CYC_UNILEVEL_V1');
  assert.equal(distDoc.levels[0].status, 'CREDITED');
  assert.equal(distDoc.levels[0].uplineUserId, 'B');
  assert.equal(distDoc.levels[1].status, 'CYCLE_CUT');
});

test('reverseUnilevelDistribution creates negative compensatory entries, preserves original, is idempotent, and blocks double reversal', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore(build20LevelChainDocs('owner-1'));
  const distId = '2026-11-19_MINER-REV_UNILEVEL_V1';

  await settleUnilevelDistribution({
    db,
    FieldValue,
    dailyProfit: {
      dailyProfitId: 'MINER-REV_2026-11-19',
      minerId: 'MINER-REV',
      minerUid: 'owner-1',
      periodDate: '2026-11-19',
      eligibleProfitUsdt6: '2.176200'
    }
  });

  const rev = await reverseUnilevelDistribution({
    db,
    FieldValue,
    distributionId: distId,
    reversalId: 'REV-UNI-1',
    reason: 'AUDIT_CORRECTION',
    reversedAt: '2026-11-20T05:00:00Z'
  });
  assert.equal(rev.status, 'reversed');

  // Original preserved (never deleted) and marked REVERSED
  const orig = store.get(`unilevel_distributions/${distId}`);
  assert.ok(orig);
  assert.equal(orig.status, 'REVERSED');
  assert.equal(orig.reversedBy, 'REV-UNI-1');

  // Owner and uplines returned to 0
  assert.equal(store.get('userBalances/owner-1').usdtAvailable, 0);
  assert.equal(store.get('userBalances/u1').usdtAvailable, 0);
  assert.equal(store.get('userBalances/u20').usdtAvailable, 0);
  assert.equal(store.get('unilevel_ledger/REV-UNI-1_OWNER').deltaUsdt6, '-1.740960');
  assert.equal(store.get('unilevel_ledger/REV-UNI-1_L1').deltaUsdt6, '-0.042435');

  // Idempotent retry on same reversalId
  const retry = await reverseUnilevelDistribution({
    db,
    FieldValue,
    distributionId: distId,
    reversalId: 'REV-UNI-1',
    reason: 'AUDIT_CORRECTION'
  });
  assert.equal(retry.status, 'already_reversed');
  assert.equal(store.get('userBalances/owner-1').usdtAvailable, 0);

  // Double reversal with new reversalId rejected
  await assert.rejects(
    () =>
      reverseUnilevelDistribution({
        db,
        FieldValue,
        distributionId: distId,
        reversalId: 'REV-UNI-2',
        reason: 'DOUBLE'
      }),
    RangeError
  );
});

test('authenticated read APIs (stats, tree, history) reject unauthenticated calls, separate 3 metrics, and leak zero third-party PII', async () => {
  // Unauthenticated rejection on callable wrappers
  for (const fn of [getUnilevelStats, getUnilevelTree, getUnilevelHistory]) {
    await assert.rejects(
      () => (typeof fn.run === 'function' ? fn.run({ auth: null, data: {} }) : fn({ auth: null, data: {} })),
      (err) => err && err.code === 'unauthenticated'
    );
  }

  const { db, FieldValue } = createInMemoryFirestore(build20LevelChainDocs('owner-1'));
  await settleUnilevelDistribution({
    db,
    FieldValue,
    dailyProfit: {
      dailyProfitId: 'MINER-API_2026-11-19',
      minerId: 'MINER-API',
      minerUid: 'owner-1',
      periodDate: '2026-11-19',
      eligibleProfitUsdt6: '2.176200'
    }
  });

  // 1. Stats separates the 3 required metrics
  const ownerStats = await getUnilevelStatsForUser({ db, uid: 'owner-1' });
  assert.equal(ownerStats.ownMiningProfit, 1.74096);
  assert.equal(ownerStats.organizationGeneratedProfitShare, 0);
  assert.equal(ownerStats.receivedUnilevelCommission, 0);
  assert.equal(ownerStats.planVersion, 'UNILEVEL_V1');
  assert.equal(ownerStats.eligibleForUnilevel, true);

  const u1Stats = await getUnilevelStatsForUser({ db, uid: 'u1' });
  assert.equal(u1Stats.ownMiningProfit, 0);
  assert.equal(u1Stats.organizationGeneratedProfitShare, 0.042435);
  assert.equal(u1Stats.receivedUnilevelCommission, 0.042435);

  // 2. Tree leaks zero third-party PII or balances
  const tree = await getUnilevelTreeForUser({ db, uid: 'owner-1' });
  assert.equal(tree.uid, 'owner-1');
  assert.equal(tree.sponsorId, 'u1');
  assert.equal(tree.uplines.length, 20);
  for (const node of tree.uplines) {
    assert.equal('email' in node, false);
    assert.equal('balance' in node, false);
    assert.equal('walletAddress' in node, false);
  }

  // 3. History returns own distributions and received commissions with bounded limit
  const ownerHist = await getUnilevelHistoryForUser({ db, uid: 'owner-1', limit: 250 });
  assert.equal(ownerHist.limit, 100);
  assert.equal(ownerHist.ownDistributions.length, 1);
  assert.equal(ownerHist.receivedCommissions.length, 0);

  const u1Hist = await getUnilevelHistoryForUser({ db, uid: 'u1', limit: 10 });
  assert.equal(u1Hist.ownDistributions.length, 0);
  assert.equal(u1Hist.receivedCommissions.length, 1);
  assert.equal(u1Hist.receivedCommissions[0].creditedUsdt6, '0.042435');
});

test('SCRUM-374: normalizes legacy missing status, uppercase ACTIVE, non-existent docs (!exists), and blocks INACTIVE/SUSPENDED/BLOCKED/non-string across settlement, stats, and tree', async () => {
  const { db, FieldValue, store } = createInMemoryFirestore({
    'users/owner-leg': { uid: 'owner-leg', emailVerified: true, sponsorId: 'u-leg' },
    'unilevel/owner-leg': { uid: 'owner-leg', sponsorId: 'u-leg', activeReferredMinersCount: 1 },

    // L1: legacy account without status field (exists === true) -> ACTIVE
    'users/u-leg': { uid: 'u-leg', emailVerified: true, sponsorId: 'u-upper', referral: { referralCode: 'LEG1' } },
    'unilevel/u-leg': { uid: 'u-leg', sponsorId: 'u-upper', activeReferredMinersCount: 1 },

    // L2: Admin uppercase status 'ACTIVE' -> ACTIVE
    'users/u-upper': { uid: 'u-upper', status: 'ACTIVE', emailVerified: true, sponsorId: 'u-inact', referral: { referralCode: 'UPP2' } },
    'unilevel/u-upper': { uid: 'u-upper', sponsorId: 'u-inact', activeReferredMinersCount: 2 },

    // L3: 'INACTIVE' -> INELIGIBLE
    'users/u-inact': { uid: 'u-inact', status: 'INACTIVE', emailVerified: true, sponsorId: 'u-susp', referral: { referralCode: 'INA3' } },
    'unilevel/u-inact': { uid: 'u-inact', sponsorId: 'u-susp', activeReferredMinersCount: 2 },

    // L4: 'SUSPENDED' -> INELIGIBLE
    'users/u-susp': { uid: 'u-susp', status: 'SUSPENDED', emailVerified: true, sponsorId: 'u-block', referral: { referralCode: 'SUS4' } },
    'unilevel/u-susp': { uid: 'u-susp', sponsorId: 'u-block', activeReferredMinersCount: 2 },

    // L5: 'BLOCKED' -> INELIGIBLE
    'users/u-block': { uid: 'u-block', status: 'BLOCKED', emailVerified: true, sponsorId: 'u-bool', referral: { referralCode: 'BLK5' } },
    'unilevel/u-block': { uid: 'u-block', sponsorId: 'u-bool', activeReferredMinersCount: 2 },

    // L6: boolean true -> fail-closed INELIGIBLE
    'users/u-bool': { uid: 'u-bool', status: true, emailVerified: true, sponsorId: 'u-unk', referral: { referralCode: 'BOL6' } },
    'unilevel/u-bool': { uid: 'u-bool', sponsorId: 'u-unk', activeReferredMinersCount: 2 },

    // L7: unknown string -> fail-closed INELIGIBLE
    'users/u-unk': { uid: 'u-unk', status: 'unknown', emailVerified: true, sponsorId: 'u-ghost', referral: { referralCode: 'UNK7' } },
    'unilevel/u-unk': { uid: 'u-unk', sponsorId: 'u-ghost', activeReferredMinersCount: 2 },

    // L8: /users/u-ghost does NOT exist (!exists), only /unilevel/u-ghost exists -> fail-closed INELIGIBLE
    'unilevel/u-ghost': { uid: 'u-ghost', activeReferredMinersCount: 5 }
  });

  const res = await settleUnilevelDistribution({
    db,
    FieldValue,
    dailyProfit: {
      dailyProfitId: 'MINER-374_2026-11-24',
      minerId: 'MINER-374',
      minerUid: 'owner-leg',
      periodDate: '2026-11-24',
      eligibleProfitUsdt6: '2.176200'
    }
  });

  assert.equal(res.status, 'distributed');
  // L1 (1.95% -> 0.042435) + L2 (1.85% -> 0.040259) = 0.082694
  assert.equal(res.distributedUsdt6, '0.082694');
  assert.equal(store.get('userBalances/u-leg').usdtAvailable, 0.042435);
  assert.equal(store.get('userBalances/u-upper').usdtAvailable, 0.040259);
  for (const blockedUid of ['u-inact', 'u-susp', 'u-block', 'u-bool', 'u-unk', 'u-ghost']) {
    assert.equal(store.has(`userBalances/${blockedUid}`), false, `${blockedUid} must not receive Unilevel commission`);
  }

  const distDoc = store.get('unilevel_distributions/2026-11-24_MINER-374_UNILEVEL_V1');
  assert.equal(distDoc.levels[0].status, 'CREDITED');
  assert.equal(distDoc.levels[1].status, 'CREDITED');
  for (let idx = 2; idx <= 7; idx += 1) {
    assert.equal(distDoc.levels[idx].status, 'INELIGIBLE', `level ${idx + 1} must be INELIGIBLE`);
  }

  // getUnilevelStatsForUser
  assert.equal((await getUnilevelStatsForUser({ db, uid: 'u-leg' })).eligibleForUnilevel, true);
  assert.equal((await getUnilevelStatsForUser({ db, uid: 'u-upper' })).eligibleForUnilevel, true);
  for (const blockedUid of ['u-inact', 'u-susp', 'u-block', 'u-bool', 'u-unk', 'u-ghost']) {
    assert.equal(
      (await getUnilevelStatsForUser({ db, uid: blockedUid })).eligibleForUnilevel,
      false,
      `getUnilevelStatsForUser(${blockedUid}) must be ineligible`
    );
  }

  // getUnilevelTreeForUser
  const tree = await getUnilevelTreeForUser({ db, uid: 'owner-leg' });
  assert.equal(tree.uplines.length, 8);
  assert.equal(tree.uplines[0].uid, 'u-leg');
  assert.equal(tree.uplines[0].active, true);
  assert.equal(tree.uplines[1].uid, 'u-upper');
  assert.equal(tree.uplines[1].active, true);
  for (let idx = 2; idx <= 7; idx += 1) {
    assert.equal(tree.uplines[idx].active, false, `tree.uplines[${idx}] (${tree.uplines[idx].uid}) must have active: false`);
  }

  // Legacy upline resolved via referral.referrerBy code (prefetchedUserData path)
  const prefetched = createInMemoryFirestore({
    'users/buyer-ref': { uid: 'buyer-ref', emailVerified: true, referral: { referrerBy: 'code_leg' } },
    'unilevel/buyer-ref': { uid: 'buyer-ref' },
    'users/spon-leg-code': { uid: 'spon-leg-code', emailVerified: true, referral: { referralCode: 'CODE_LEG' } },
    'unilevel/spon-leg-code': { uid: 'spon-leg-code', activeReferredMinersCount: 1 }
  });
  const prefRes = await settleUnilevelDistribution({
    db: prefetched.db,
    FieldValue: prefetched.FieldValue,
    dailyProfit: {
      dailyProfitId: 'MINER-PREF_2026-11-24',
      minerId: 'MINER-PREF',
      minerUid: 'buyer-ref',
      periodDate: '2026-11-24',
      eligibleProfitUsdt6: '2.176200'
    }
  });
  assert.equal(prefRes.distributedUsdt6, '0.042435');
  assert.equal(prefetched.store.get('userBalances/spon-leg-code').usdtAvailable, 0.042435);
});
