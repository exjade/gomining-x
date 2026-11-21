'use strict';

const { roundInternalToUsdt6 } = require('../shared/money');
const { PLAN_VERSION_V1, getRatePlan } = require('./unilevelRates');
const { calculateUnilevelDistribution } = require('./calculateDistribution');

const CANONICAL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PERIOD_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ROUNDING_ACCOUNT_DOC_ID = 'unilevel_rounding_residual';
const UNSIGNED_INT_PATTERN = /^\d+$/;

function assertValidPeriodDate(periodDate) {
  if (typeof periodDate !== 'string' || !PERIOD_DATE_PATTERN.test(periodDate)) {
    throw new RangeError(`periodDate must be a valid YYYY-MM-DD calendar date: ${periodDate}`);
  }
  const [year, month, day] = periodDate.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new RangeError(`periodDate is not a valid calendar date: ${periodDate}`);
  }
}

function buildUnilevelDistributionId(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('buildUnilevelDistributionId requires a non-array object');
  }
  const { periodDate, minerId, planVersion = PLAN_VERSION_V1 } = input;
  assertValidPeriodDate(periodDate);

  const cleanMinerId = typeof minerId === 'string' ? minerId.trim() : '';
  if (!CANONICAL_ID_PATTERN.test(cleanMinerId)) {
    throw new RangeError('minerId must match ^[a-zA-Z0-9_-]+$');
  }

  const plan = getRatePlan(planVersion);
  return `${periodDate}_${cleanMinerId}_${plan.planVersion}`;
}

function assertTxDeps(db, FieldValue) {
  if (!db || typeof db.collection !== 'function' || typeof db.runTransaction !== 'function') {
    throw new TypeError('db with collection() and runTransaction() is required');
  }
  if (!FieldValue || typeof FieldValue.increment !== 'function' || typeof FieldValue.serverTimestamp !== 'function') {
    throw new TypeError('FieldValue with increment() and serverTimestamp() is required');
  }
}

function microUsdtToNumber(microUsdtBigInt) {
  return Number(microUsdtBigInt) / 1_000_000;
}

function parseNonNegativeBigIntStr(value, label) {
  if (typeof value !== 'string' || !UNSIGNED_INT_PATTERN.test(value)) {
    throw new RangeError(`${label} must be a non-negative integer string`);
  }
  return BigInt(value);
}

function extractSponsorId(unilevelData, userData) {
  if (unilevelData && typeof unilevelData.sponsorId === 'string' && unilevelData.sponsorId.trim()) {
    return unilevelData.sponsorId.trim();
  }
  if (userData && typeof userData.sponsorId === 'string' && userData.sponsorId.trim()) {
    return userData.sponsorId.trim();
  }
  return '';
}

function extractReferrerCode(unilevelData, userData) {
  if (
    userData &&
    userData.referral &&
    typeof userData.referral === 'object' &&
    typeof userData.referral.referrerBy === 'string' &&
    userData.referral.referrerBy.trim()
  ) {
    return userData.referral.referrerBy.trim();
  }
  if (unilevelData && typeof unilevelData.referrerBy === 'string' && unilevelData.referrerBy.trim()) {
    return unilevelData.referrerBy.trim();
  }
  return '';
}

async function resolveNextUplineNode(tx, db, currentUnilevelData, currentUserData) {
  const directSponsorId = extractSponsorId(currentUnilevelData, currentUserData);
  if (directSponsorId) {
    return { uid: directSponsorId, prefetchedUserData: null };
  }

  const referrerCode = extractReferrerCode(currentUnilevelData, currentUserData);
  if (!referrerCode) {
    return null;
  }

  const normalizedCode = referrerCode.toUpperCase();
  const usersCol = db.collection('users');
  let codeSnap = await tx.get(usersCol.where('referral.referralCode', '==', normalizedCode).limit(1));
  if (codeSnap.empty && referrerCode !== normalizedCode) {
    codeSnap = await tx.get(usersCol.where('referral.referralCode', '==', referrerCode).limit(1));
  }
  if (codeSnap.empty) {
    return null;
  }
  const sponsorDoc = codeSnap.docs[0];
  return { uid: sponsorDoc.id, prefetchedUserData: sponsorDoc.data() || {} };
}

async function settleUnilevelDistribution({
  db,
  FieldValue,
  dailyProfit,
  planVersion = PLAN_VERSION_V1,
  settledAt = null
}) {
  assertTxDeps(db, FieldValue);

  if (!dailyProfit || typeof dailyProfit !== 'object' || Array.isArray(dailyProfit)) {
    throw new TypeError('dailyProfit must be a non-array object');
  }

  const rawSourceUid = dailyProfit.minerUid ?? dailyProfit.uid ?? dailyProfit.sourceUserId;
  const sourceUid = typeof rawSourceUid === 'string' ? rawSourceUid.trim() : '';
  if (!sourceUid) {
    throw new RangeError('dailyProfit minerUid/uid must be a non-empty string');
  }

  const periodDate = dailyProfit.periodDate;
  const minerId = dailyProfit.minerId;
  const dailyProfitId = dailyProfit.dailyProfitId ?? dailyProfit.id ?? null;
  const eligibleProfitUsdt =
    dailyProfit.eligibleProfitUsdt6 ?? dailyProfit.eligibleProfitUsdt ?? dailyProfit.eligibleProfit;

  const plan = getRatePlan(planVersion);
  const distributionId = buildUnilevelDistributionId({ periodDate, minerId, planVersion: plan.planVersion });
  const cleanMinerId = minerId.trim();

  return db.runTransaction(async (tx) => {
    // --- READ-ONLY PHASE ---
    const distRef = db.collection('unilevel_distributions').doc(distributionId);
    const existingDistSnap = await tx.get(distRef);
    if (existingDistSnap.exists) {
      return {
        status: 'already_distributed',
        distributionId,
        periodDate,
        minerId: cleanMinerId,
        planVersion: plan.planVersion
      };
    }

    const sourceUnilevelSnap = await tx.get(db.collection('unilevel').doc(sourceUid));
    const sourceUserSnap = await tx.get(db.collection('users').doc(sourceUid));

    let currentUnilevelData = sourceUnilevelSnap.exists ? sourceUnilevelSnap.data() : {};
    let currentUserData = sourceUserSnap.exists ? sourceUserSnap.data() : {};

    const visited = new Set([sourceUid]);
    const uplines = [];

    // O(20) bounded upline traversal with anti-cycle detection.
    for (let depth = 0; depth < plan.maxDepth; depth += 1) {
      const next = await resolveNextUplineNode(tx, db, currentUnilevelData, currentUserData);
      if (!next || !next.uid) {
        break;
      }

      const nextUid = next.uid.trim();
      if (visited.has(nextUid)) {
        // Pass repeating UID into pure domain so cycleDetected=true and CYCLE_CUT are recorded explicitly.
        uplines.push({
          uid: nextUid,
          status: 'active',
          emailVerified: true,
          activeReferredMinersCount: 1
        });
        break;
      }
      visited.add(nextUid);

      const uplineUserData = next.prefetchedUserData
        ? next.prefetchedUserData
        : (await tx.get(db.collection('users').doc(nextUid))).data() || {};
      const uplineUnilevelSnap = await tx.get(db.collection('unilevel').doc(nextUid));
      const uplineUnilevelData = uplineUnilevelSnap.exists ? uplineUnilevelSnap.data() : {};

      uplines.push({
        uid: nextUid,
        status: uplineUserData.status || 'inactive',
        emailVerified: uplineUserData.emailVerified === true,
        activeReferredMinersCount: Number.isInteger(uplineUnilevelData.activeReferredMinersCount)
          ? uplineUnilevelData.activeReferredMinersCount
          : 0
      });

      currentUserData = uplineUserData;
      currentUnilevelData = uplineUnilevelData;
    }

    // --- PURE DOMAIN CALCULATION ---
    const dist = calculateUnilevelDistribution({
      sourceUserId: sourceUid,
      eligibleProfitUsdt,
      uplines,
      planVersion: plan.planVersion
    });
    const ownerRounded = roundInternalToUsdt6(dist.userMiningPayoutInternal);
    const totalResidualInternal =
      dist.roundingResidualInternal + dist.userMiningPayoutRoundingResidualInternal;

    // --- WRITE-ONLY PHASE ---
    const nowTs = settledAt || FieldValue.serverTimestamp();
    const serializedLevels = dist.levels.map((lvl) => ({
      level: lvl.level,
      uplineUserId: lvl.uplineUserId,
      rateInternalStr: lvl.rateInternal.toString(),
      rateString: lvl.rateString,
      status: lvl.status,
      eligible: lvl.eligible,
      creditedInternalStr: lvl.creditedInternal.toString(),
      creditedUsdt6: lvl.creditedUsdt6,
      undistributedInternalStr: lvl.undistributedInternal.toString(),
      roundingResidualInternalStr: lvl.roundingResidualInternal.toString()
    }));

    // 1. Immutable distribution audit document
    tx.set(distRef, {
      id: distributionId,
      distributionId,
      date: periodDate,
      periodDate,
      planVersion: dist.planVersion,
      minerUid: sourceUid,
      sourceUserId: sourceUid,
      minerId: cleanMinerId,
      dailyProfitId,
      currency: 'USDT',
      status: 'distributed',
      eligibleProfitInternalStr: dist.eligibleProfitInternal.toString(),
      eligibleProfitUsdt6: dist.eligibleProfitUsdt6,
      expectedPoolInternalStr: dist.expectedPoolInternal.toString(),
      expectedPoolUsdt6: dist.expectedPoolUsdt6,
      distributedInternalStr: dist.distributedInternal.toString(),
      distributedUsdt6: dist.distributedUsdt6,
      undistributedInternalStr: dist.undistributedInternal.toString(),
      undistributedUsdt6: dist.undistributedUsdt6,
      roundingResidualInternalStr: dist.roundingResidualInternal.toString(),
      poolTruncationResidualInternalStr: dist.poolTruncationResidualInternal.toString(),
      userMiningPayoutInternalStr: dist.userMiningPayoutInternal.toString(),
      userMiningPayoutMicroUsdtStr: ownerRounded.microUsdt.toString(),
      userMiningPayoutUsdt6: dist.userMiningPayoutUsdt6,
      userMiningPayoutRoundingResidualInternalStr: dist.userMiningPayoutRoundingResidualInternal.toString(),
      cycleDetected: dist.cycleDetected,
      levels: serializedLevels,
      createdAt: nowTs
    });

    // 2. Owner net mining payout (80% + undistributedAmount)
    if (ownerRounded.microUsdt > 0n) {
      const ownerDeltaUsdt = microUsdtToNumber(ownerRounded.microUsdt);
      tx.set(
        db.collection('userBalances').doc(sourceUid),
        {
          uid: sourceUid,
          currency: 'USDT',
          usdtAvailable: FieldValue.increment(ownerDeltaUsdt),
          balance: FieldValue.increment(ownerDeltaUsdt),
          miningBalance: FieldValue.increment(ownerDeltaUsdt),
          updatedAt: nowTs
        },
        { merge: true }
      );
      tx.set(
        db.collection('users').doc(sourceUid),
        {
          balance: FieldValue.increment(ownerDeltaUsdt),
          ownMiningProfitTotal: FieldValue.increment(ownerDeltaUsdt),
          updatedAt: nowTs
        },
        { merge: true }
      );
      tx.set(
        db.collection('unilevel').doc(sourceUid),
        {
          uid: sourceUid,
          ownMiningProfitTotal: FieldValue.increment(ownerDeltaUsdt),
          updatedAt: nowTs
        },
        { merge: true }
      );
      tx.set(db.collection('unilevel_ledger').doc(`${distributionId}_OWNER`), {
        id: `${distributionId}_OWNER`,
        distributionId,
        type: 'MINING_OWNER_PAYOUT',
        status: 'CREDITED',
        currency: 'USDT',
        sourceUserId: sourceUid,
        minerUid: sourceUid,
        minerId: cleanMinerId,
        periodDate,
        planVersion: dist.planVersion,
        amountInternalStr: ownerRounded.amountInternal.toString(),
        amountMicroUsdtStr: ownerRounded.microUsdt.toString(),
        amountUsdt6: ownerRounded.usdt6,
        undistributedReturnedUsdt6: dist.undistributedUsdt6,
        createdAt: nowTs
      });
    }

    // 3. Eligible upline commissions (separate ledger from Direct Referral 10% D8)
    for (const lvl of dist.levels) {
      if (lvl.status !== 'CREDITED' || lvl.creditedInternal <= 0n || !lvl.uplineUserId) {
        continue;
      }
      const lvlRounded = roundInternalToUsdt6(lvl.creditedInternal);
      if (lvlRounded.microUsdt <= 0n) {
        continue;
      }
      const lvlDeltaUsdt = microUsdtToNumber(lvlRounded.microUsdt);
      const ledgerId = `${distributionId}_L${lvl.level}`;

      tx.set(db.collection('unilevel_ledger').doc(ledgerId), {
        id: ledgerId,
        distributionId,
        type: 'UNILEVEL_PROFITSHARE_COMMISSION',
        status: 'CREDITED',
        currency: 'USDT',
        level: lvl.level,
        rateString: lvl.rateString,
        uplineUserId: lvl.uplineUserId,
        sourceUserId: sourceUid,
        minerId: cleanMinerId,
        periodDate,
        planVersion: dist.planVersion,
        creditedInternalStr: lvl.creditedInternal.toString(),
        creditedMicroUsdtStr: lvlRounded.microUsdt.toString(),
        creditedUsdt6: lvl.creditedUsdt6,
        createdAt: nowTs
      });

      tx.set(
        db.collection('userBalances').doc(lvl.uplineUserId),
        {
          uid: lvl.uplineUserId,
          currency: 'USDT',
          usdtAvailable: FieldValue.increment(lvlDeltaUsdt),
          balance: FieldValue.increment(lvlDeltaUsdt),
          unilevelBalance: FieldValue.increment(lvlDeltaUsdt),
          updatedAt: nowTs
        },
        { merge: true }
      );
      tx.set(
        db.collection('users').doc(lvl.uplineUserId),
        {
          balance: FieldValue.increment(lvlDeltaUsdt),
          unilevelBalance: FieldValue.increment(lvlDeltaUsdt),
          receivedUnilevelCommissionTotal: FieldValue.increment(lvlDeltaUsdt),
          updatedAt: nowTs
        },
        { merge: true }
      );
      tx.set(
        db.collection('unilevel').doc(lvl.uplineUserId),
        {
          uid: lvl.uplineUserId,
          receivedUnilevelCommissionTotal: FieldValue.increment(lvlDeltaUsdt),
          organizationGeneratedProfitShareTotal: FieldValue.increment(lvlDeltaUsdt),
          distributionsCreditedCount: FieldValue.increment(1),
          updatedAt: nowTs
        },
        { merge: true }
      );
    }

    // 4. Rounding residual accounting (Q9)
    if (totalResidualInternal > 0n) {
      const roundingRef = db.collection('platformAccounting').doc(ROUNDING_ACCOUNT_DOC_ID);
      tx.set(
        roundingRef,
        {
          id: ROUNDING_ACCOUNT_DOC_ID,
          currency: 'USDT',
          totalResidualInternalCount: FieldValue.increment(Number(totalResidualInternal)),
          entriesCount: FieldValue.increment(1),
          updatedAt: nowTs
        },
        { merge: true }
      );
      tx.set(roundingRef.collection('entries').doc(distributionId), {
        id: distributionId,
        distributionId,
        periodDate,
        minerId: cleanMinerId,
        planVersion: dist.planVersion,
        poolRoundingResidualInternalStr: dist.roundingResidualInternal.toString(),
        ownerRoundingResidualInternalStr: dist.userMiningPayoutRoundingResidualInternal.toString(),
        totalResidualInternalStr: totalResidualInternal.toString(),
        createdAt: nowTs
      });
    }

    return {
      status: 'distributed',
      distributionId,
      periodDate,
      minerId: cleanMinerId,
      minerUid: sourceUid,
      planVersion: dist.planVersion,
      eligibleProfitUsdt6: dist.eligibleProfitUsdt6,
      distributedUsdt6: dist.distributedUsdt6,
      undistributedUsdt6: dist.undistributedUsdt6,
      userMiningPayoutUsdt6: dist.userMiningPayoutUsdt6,
      roundingResidualInternal: dist.roundingResidualInternal,
      totalResidualInternal,
      cycleDetected: dist.cycleDetected
    };
  });
}

async function reverseUnilevelDistribution({
  db,
  FieldValue,
  distributionId,
  reversalId,
  reason,
  reversedAt = null
}) {
  assertTxDeps(db, FieldValue);

  const cleanDistributionId = typeof distributionId === 'string' ? distributionId.trim() : '';
  const cleanReversalId = typeof reversalId === 'string' ? reversalId.trim() : '';
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';

  if (!cleanDistributionId) {
    throw new RangeError('distributionId must be a non-empty string');
  }
  if (!cleanReversalId) {
    throw new RangeError('reversalId must be a non-empty string');
  }
  if (!cleanReason) {
    throw new RangeError('reason must be a non-empty string');
  }

  return db.runTransaction(async (tx) => {
    // --- READ-ONLY PHASE ---
    const reversalRef = db.collection('unilevel_distributions').doc(cleanReversalId);
    const reversalSnap = await tx.get(reversalRef);
    if (reversalSnap.exists) {
      return {
        status: 'already_reversed',
        reversalId: cleanReversalId,
        originalDistributionId: cleanDistributionId
      };
    }

    const origRef = db.collection('unilevel_distributions').doc(cleanDistributionId);
    const origSnap = await tx.get(origRef);
    if (!origSnap.exists) {
      throw new RangeError(`Original distribution not found: ${cleanDistributionId}`);
    }

    const origData = origSnap.data();
    if (origData.status !== 'distributed') {
      throw new RangeError(`Distribution ${cleanDistributionId} is not reversible (status=${origData.status})`);
    }

    const minerUid = typeof origData.minerUid === 'string' ? origData.minerUid.trim() : '';
    if (!minerUid) {
      throw new RangeError('Original distribution is missing minerUid');
    }

    const ownerInternal = parseNonNegativeBigIntStr(
      origData.userMiningPayoutInternalStr,
      'userMiningPayoutInternalStr'
    );
    const ownerRounded = roundInternalToUsdt6(ownerInternal);

    const creditedLevels = [];
    for (const lvl of Array.isArray(origData.levels) ? origData.levels : []) {
      if (lvl && lvl.status === 'CREDITED' && typeof lvl.uplineUserId === 'string' && lvl.uplineUserId.trim()) {
        const lvlInternal = parseNonNegativeBigIntStr(lvl.creditedInternalStr, `level ${lvl.level} creditedInternalStr`);
        const lvlRounded = roundInternalToUsdt6(lvlInternal);
        if (lvlRounded.microUsdt > 0n) {
          creditedLevels.push({
            level: lvl.level,
            uplineUserId: lvl.uplineUserId.trim(),
            rounded: lvlRounded
          });
        }
      }
    }

    // --- WRITE-ONLY PHASE ---
    const nowTs = reversedAt || FieldValue.serverTimestamp();

    // 1. Write immutable reversal distribution record (never delete original Q10)
    tx.set(reversalRef, {
      id: cleanReversalId,
      type: 'UNILEVEL_DISTRIBUTION_REVERSAL',
      status: 'REVERSED',
      reversalId: cleanReversalId,
      originalDistributionId: cleanDistributionId,
      minerUid,
      minerId: origData.minerId || null,
      periodDate: origData.periodDate || null,
      planVersion: origData.planVersion || PLAN_VERSION_V1,
      reason: cleanReason,
      reversedAt: nowTs
    });

    // 2. Mark original REVERSED without deleting it
    tx.set(
      origRef,
      {
        status: 'REVERSED',
        reversedBy: cleanReversalId,
        reversedAt: nowTs
      },
      { merge: true }
    );

    // 3. Reverse owner payout
    if (ownerRounded.microUsdt > 0n) {
      const negOwnerUsdt = -microUsdtToNumber(ownerRounded.microUsdt);
      tx.set(db.collection('unilevel_ledger').doc(`${cleanReversalId}_OWNER`), {
        id: `${cleanReversalId}_OWNER`,
        reversalId: cleanReversalId,
        originalDistributionId: cleanDistributionId,
        type: 'MINING_OWNER_PAYOUT_REVERSAL',
        status: 'REVERSED',
        currency: 'USDT',
        sourceUserId: minerUid,
        minerUid,
        deltaUsdt6: `-${ownerRounded.usdt6}`,
        reason: cleanReason,
        createdAt: nowTs
      });
      tx.set(
        db.collection('userBalances').doc(minerUid),
        {
          usdtAvailable: FieldValue.increment(negOwnerUsdt),
          balance: FieldValue.increment(negOwnerUsdt),
          miningBalance: FieldValue.increment(negOwnerUsdt),
          updatedAt: nowTs
        },
        { merge: true }
      );
      tx.set(
        db.collection('users').doc(minerUid),
        {
          balance: FieldValue.increment(negOwnerUsdt),
          ownMiningProfitTotal: FieldValue.increment(negOwnerUsdt),
          updatedAt: nowTs
        },
        { merge: true }
      );
      tx.set(
        db.collection('unilevel').doc(minerUid),
        {
          ownMiningProfitTotal: FieldValue.increment(negOwnerUsdt),
          updatedAt: nowTs
        },
        { merge: true }
      );
    }

    // 4. Reverse each credited upline
    for (const item of creditedLevels) {
      const negLvlUsdt = -microUsdtToNumber(item.rounded.microUsdt);
      tx.set(db.collection('unilevel_ledger').doc(`${cleanReversalId}_L${item.level}`), {
        id: `${cleanReversalId}_L${item.level}`,
        reversalId: cleanReversalId,
        originalDistributionId: cleanDistributionId,
        type: 'UNILEVEL_PROFITSHARE_REVERSAL',
        status: 'REVERSED',
        currency: 'USDT',
        level: item.level,
        uplineUserId: item.uplineUserId,
        sourceUserId: minerUid,
        deltaUsdt6: `-${item.rounded.usdt6}`,
        reason: cleanReason,
        createdAt: nowTs
      });
      tx.set(
        db.collection('userBalances').doc(item.uplineUserId),
        {
          usdtAvailable: FieldValue.increment(negLvlUsdt),
          balance: FieldValue.increment(negLvlUsdt),
          unilevelBalance: FieldValue.increment(negLvlUsdt),
          updatedAt: nowTs
        },
        { merge: true }
      );
      tx.set(
        db.collection('users').doc(item.uplineUserId),
        {
          balance: FieldValue.increment(negLvlUsdt),
          unilevelBalance: FieldValue.increment(negLvlUsdt),
          receivedUnilevelCommissionTotal: FieldValue.increment(negLvlUsdt),
          updatedAt: nowTs
        },
        { merge: true }
      );
      tx.set(
        db.collection('unilevel').doc(item.uplineUserId),
        {
          receivedUnilevelCommissionTotal: FieldValue.increment(negLvlUsdt),
          organizationGeneratedProfitShareTotal: FieldValue.increment(negLvlUsdt),
          updatedAt: nowTs
        },
        { merge: true }
      );
    }

    return {
      status: 'reversed',
      reversalId: cleanReversalId,
      originalDistributionId: cleanDistributionId,
      reason: cleanReason
    };
  });
}

module.exports = Object.freeze({
  CANONICAL_ID_PATTERN,
  PERIOD_DATE_PATTERN,
  ROUNDING_ACCOUNT_DOC_ID,
  buildUnilevelDistributionId,
  settleUnilevelDistribution,
  reverseUnilevelDistribution
});
