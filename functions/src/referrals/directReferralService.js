'use strict';

const {
  ELIGIBLE_PRODUCT_TYPE,
  buildDirectReferralIdempotencyKey,
  calculateDirectReferralCommission,
  createReversalEntry
} = require('./calculateDirectReferral');

const CANONICAL_MINER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const SAFE_SPONSOR_DOC_ID_PATTERN = /^[a-zA-Z0-9_.:@-]+$/;
const INACTIVE_SPONSOR_STATUSES = new Set(['blocked', 'inactive']);
const UNSIGNED_INT_PATTERN = /^\d+$/;

function isValidSponsorDocId(value) {
  return typeof value === 'string' && value.length > 0 && value !== '.' && value !== '..' && SAFE_SPONSOR_DOC_ID_PATTERN.test(value);
}

function assertTxDeps(db, FieldValue) {
  if (!db || typeof db.runTransaction !== 'function' || typeof db.collection !== 'function') {
    throw new TypeError('db with collection() and runTransaction() is required');
  }
  if (!FieldValue || typeof FieldValue.increment !== 'function' || typeof FieldValue.serverTimestamp !== 'function') {
    throw new TypeError('FieldValue with increment() and serverTimestamp() is required');
  }
}

function extractDirectSponsorId(buyerData) {
  if (!buyerData || typeof buyerData !== 'object') {
    return '';
  }
  return typeof buyerData.sponsorId === 'string' ? buyerData.sponsorId.trim() : '';
}

function extractReferrerCode(buyerData) {
  if (!buyerData || typeof buyerData !== 'object' || !buyerData.referral || typeof buyerData.referral !== 'object') {
    return '';
  }
  return typeof buyerData.referral.referrerBy === 'string' ? buyerData.referral.referrerBy.trim() : '';
}

function isSponsorActive(sponsorData) {
  if (!sponsorData || typeof sponsorData !== 'object') {
    return false;
  }
  const status = typeof sponsorData.status === 'string' ? sponsorData.status.trim().toLowerCase() : '';
  return !INACTIVE_SPONSOR_STATUSES.has(status);
}

function microUsdtToNumber(microUsdtBigInt) {
  return Number(microUsdtBigInt) / 1_000_000;
}

function parseNonNegativeBigIntField(strValue, rawValue, label) {
  if (typeof strValue === 'string' && UNSIGNED_INT_PATTERN.test(strValue)) {
    return BigInt(strValue);
  }
  if (typeof rawValue === 'bigint' && rawValue >= 0n) {
    return rawValue;
  }
  throw new RangeError(`${label} must be a valid non-negative integer BigInt or decimal string`);
}

async function settleDirectReferralCommission({ db, FieldValue, purchase }) {
  assertTxDeps(db, FieldValue);

  if (!purchase || typeof purchase !== 'object' || Array.isArray(purchase)) {
    throw new TypeError('purchase must be a non-array object');
  }

  const {
    orderId = null,
    minerId = null,
    productType,
    netPaidUsdt,
    buyerUid,
    isTestOrGuest = false,
    paymentMethod = 'wallet',
    settledAt = null
  } = purchase;

  if (typeof isTestOrGuest !== 'boolean') {
    throw new TypeError('isTestOrGuest must be a boolean');
  }

  // Non-miner products reject cleanly without requiring minerId or opening a transaction.
  if (productType !== ELIGIBLE_PRODUCT_TYPE) {
    const rejected = calculateDirectReferralCommission({
      orderId,
      minerId,
      productType,
      netPaidUsdt,
      buyerUid,
      sponsorUid: null,
      purchaseNumber: 1,
      isTestOrGuest
    });
    return {
      status: 'rejected',
      reason: rejected.reason,
      commissionId: null,
      orderId: rejected.orderId,
      minerId: rejected.minerId,
      purchaseNumber: rejected.purchaseNumber,
      purchaseType: rejected.purchaseType,
      paymentMethod,
      commissionUsdt6: '0.000000'
    };
  }

  // Precondition #2 (SCRUM-342): require canonical minerId for miner purchases to prevent ID collision.
  const cleanMinerId = typeof minerId === 'string' ? minerId.trim() : '';
  if (!CANONICAL_MINER_ID_PATTERN.test(cleanMinerId)) {
    throw new RangeError('minerId must match ^[a-zA-Z0-9_-]+$ for miner purchases');
  }

  const cleanBuyerUid = typeof buyerUid === 'string' ? buyerUid.trim() : '';
  if (!cleanBuyerUid) {
    throw new RangeError('buyerUid must be a non-empty string');
  }

  const commissionId = buildDirectReferralIdempotencyKey({ minerId: cleanMinerId, orderId });

  return db.runTransaction(async (tx) => {
    // --- READ-ONLY PHASE ---
    const commissionRef = db.collection('referralCommissions').doc(commissionId);
    const commissionSnap = await tx.get(commissionRef);
    if (commissionSnap.exists) {
      return {
        status: 'already_processed',
        commissionId,
        orderId,
        minerId: cleanMinerId
      };
    }

    const buyerRef = db.collection('users').doc(cleanBuyerUid);
    const buyerSnap = await tx.get(buyerRef);
    const buyerData = buyerSnap.exists ? buyerSnap.data() : {};
    const currentPurchasesCount =
      Number.isInteger(buyerData.purchasesCount) && buyerData.purchasesCount >= 0
        ? buyerData.purchasesCount
        : 0;
    const purchaseNumber = currentPurchasesCount + 1;
    const hasFirstPurchaseAt = Boolean(buyerData.firstPurchaseAt);

    let resolvedSponsorUid = null;
    let sponsorData = null;

    if (purchase.referralSnapshotLocked === true) {
      const rawLocked = typeof purchase.lockedSponsorUid === 'string' ? purchase.lockedSponsorUid.trim() : '';
      if (isValidSponsorDocId(rawLocked) && rawLocked !== cleanBuyerUid) {
        resolvedSponsorUid = rawLocked;
        const sponsorSnap = await tx.get(db.collection('users').doc(resolvedSponsorUid));
        sponsorData = sponsorSnap.exists ? sponsorSnap.data() : null;
      }
    } else {
      resolvedSponsorUid = extractDirectSponsorId(buyerData);

      if (resolvedSponsorUid && resolvedSponsorUid !== cleanBuyerUid) {
        const sponsorSnap = await tx.get(db.collection('users').doc(resolvedSponsorUid));
        sponsorData = sponsorSnap.exists ? sponsorSnap.data() : null;
      } else if (!resolvedSponsorUid) {
        const referrerCode = extractReferrerCode(buyerData);
        if (referrerCode) {
          const normalizedCode = referrerCode.toUpperCase();
          const usersCol = db.collection('users');
          let codeSnap = await tx.get(usersCol.where('referral.referralCode', '==', normalizedCode).limit(1));
          if (codeSnap.empty && referrerCode !== normalizedCode) {
            codeSnap = await tx.get(usersCol.where('referral.referralCode', '==', referrerCode).limit(1));
          }
          if (!codeSnap.empty) {
            const sponsorDoc = codeSnap.docs[0];
            resolvedSponsorUid = sponsorDoc.id;
            sponsorData = sponsorDoc.data();
          }
        }
      }
    }

    const sponsorIsInactive =
      Boolean(resolvedSponsorUid) &&
      resolvedSponsorUid !== cleanBuyerUid &&
      (!sponsorData || !isSponsorActive(sponsorData));

    // --- PURE DOMAIN CALCULATION ---
    const calc = calculateDirectReferralCommission({
      orderId,
      minerId: cleanMinerId,
      productType,
      netPaidUsdt,
      buyerUid: cleanBuyerUid,
      sponsorUid: resolvedSponsorUid || null,
      purchaseNumber,
      isTestOrGuest
    });

    // --- WRITE-ONLY PHASE ---
    const nowTs = settledAt || FieldValue.serverTimestamp();
    const buyerUpdate = {
      purchasesCount: FieldValue.increment(1),
      lastPurchaseAt: nowTs,
      ...(hasFirstPurchaseAt ? {} : { firstPurchaseAt: nowTs })
    };

    if (!calc.eligible || sponsorIsInactive) {
      const reason = !calc.eligible ? calc.reason : 'INACTIVE_SPONSOR';
      // Update buyer purchase stats for real miner purchases even without commission; skip for test/guest.
      if (reason !== 'TEST_OR_GUEST_PURCHASE') {
        tx.set(buyerRef, buyerUpdate, { merge: true });
      }
      return {
        status: 'rejected',
        reason,
        commissionId: null,
        orderId: calc.orderId,
        minerId: calc.minerId,
        purchaseNumber: calc.purchaseNumber,
        purchaseType: calc.purchaseType,
        paymentMethod,
        commissionUsdt6: '0.000000'
      };
    }

    // Precondition #1 (SCRUM-342): only write ledger & credit funds when commissionInternal > 0n.
    if (calc.status !== 'CREDITED' || calc.commissionInternal <= 0n) {
      tx.set(buyerRef, buyerUpdate, { merge: true });
      tx.set(
        db.collection('unilevel').doc(calc.sponsorUid),
        {
          uid: calc.sponsorUid,
          activeReferredMinersCount: FieldValue.increment(1),
          updatedAt: nowTs
        },
        { merge: true }
      );
      return {
        status: 'skipped_zero_commission',
        reason: 'TRUNCATED_TO_ZERO',
        commissionId: null,
        orderId: calc.orderId,
        minerId: calc.minerId,
        purchaseNumber: calc.purchaseNumber,
        purchaseType: calc.purchaseType,
        paymentMethod,
        commissionUsdt6: '0.000000'
      };
    }

    const deltaUsdt = microUsdtToNumber(calc.commissionMicroUsdt);
    const deltaMicro = Number(calc.commissionMicroUsdt);

    // 1. Immutable direct-referral ledger (separate from Unilevel D8)
    tx.set(commissionRef, {
      commissionId: calc.commissionId,
      type: 'DIRECT_REFERRAL_COMMISSION',
      status: 'CREDITED',
      eligible: true,
      settlementMode: 'IMMEDIATE',
      currency: calc.currency,
      rate: '0.10',
      rateInternalStr: calc.rateInternal.toString(),
      netPaidInternalStr: calc.netPaidInternal.toString(),
      netPaidUsdt6: calc.netPaidUsdt6,
      exactInternalStr: calc.exactInternal.toString(),
      commissionInternalStr: calc.commissionInternal.toString(),
      commissionMicroUsdtStr: calc.commissionMicroUsdt.toString(),
      commissionUsdt6: calc.commissionUsdt6,
      roundingResidualInternalStr: calc.roundingResidualInternal.toString(),
      purchaseType: calc.purchaseType,
      purchaseNumber: calc.purchaseNumber,
      paymentMethod,
      orderId: calc.orderId,
      minerId: calc.minerId,
      buyerUid: calc.buyerUid,
      sponsorUid: calc.sponsorUid,
      createdAt: nowTs
    });

    // 2. Sponsor referral aggregate + transaction history
    const referralRef = db.collection('referrals').doc(calc.sponsorUid);
    tx.set(
      referralRef,
      {
        sponsorUid: calc.sponsorUid,
        currency: calc.currency,
        totalCommissionsEarned: FieldValue.increment(deltaUsdt),
        withdrawableBalance: FieldValue.increment(deltaUsdt),
        totalCommissionsMicroUsdt: FieldValue.increment(deltaMicro),
        commissionsCount: FieldValue.increment(1),
        updatedAt: nowTs
      },
      { merge: true }
    );
    tx.set(referralRef.collection('transactions').doc(calc.commissionId), {
      id: calc.commissionId,
      commissionId: calc.commissionId,
      type: 'commission_income',
      source: 'miner_purchase',
      currency: calc.currency,
      amountUsdt6: calc.commissionUsdt6,
      amountMicroUsdtStr: calc.commissionMicroUsdt.toString(),
      orderId: calc.orderId,
      minerId: calc.minerId,
      buyerUid: calc.buyerUid,
      purchaseType: calc.purchaseType,
      purchaseNumber: calc.purchaseNumber,
      paymentMethod,
      status: 'CREDITED',
      createdAt: nowTs
    });

    // 3. Withdrawable USDT balance (SCRUM-275 alignment) + sponsor user mirrors
    tx.set(
      db.collection('userBalances').doc(calc.sponsorUid),
      {
        uid: calc.sponsorUid,
        currency: calc.currency,
        usdtAvailable: FieldValue.increment(deltaUsdt),
        balance: FieldValue.increment(deltaUsdt),
        commissionBalance: FieldValue.increment(deltaUsdt),
        availableBalanceMicros: FieldValue.increment(deltaMicro),
        updatedAt: nowTs
      },
      { merge: true }
    );
    tx.set(
      db.collection('users').doc(calc.sponsorUid),
      {
        commissionBalance: FieldValue.increment(deltaUsdt),
        balance: FieldValue.increment(deltaUsdt),
        totalCommissionsEarned: FieldValue.increment(deltaUsdt),
        updatedAt: nowTs
      },
      { merge: true }
    );

    // 4. Buyer purchase counters
    tx.set(buyerRef, buyerUpdate, { merge: true });

    // 5. Unilevel O(20) eligibility counter for SCRUM-230
    tx.set(
      db.collection('unilevel').doc(calc.sponsorUid),
      {
        uid: calc.sponsorUid,
        activeReferredMinersCount: FieldValue.increment(1),
        updatedAt: nowTs
      },
      { merge: true }
    );

    return {
      status: 'credited',
      commissionId: calc.commissionId,
      orderId: calc.orderId,
      minerId: calc.minerId,
      buyerUid: calc.buyerUid,
      sponsorUid: calc.sponsorUid,
      purchaseNumber: calc.purchaseNumber,
      purchaseType: calc.purchaseType,
      paymentMethod,
      commissionInternal: calc.commissionInternal,
      commissionMicroUsdt: calc.commissionMicroUsdt,
      commissionUsdt6: calc.commissionUsdt6
    };
  });
}

async function reverseDirectReferralCommission({
  db,
  FieldValue,
  commissionId,
  reversalId,
  reason,
  reversedAt = null
}) {
  assertTxDeps(db, FieldValue);

  const cleanCommissionId = typeof commissionId === 'string' ? commissionId.trim() : '';
  const cleanReversalId = typeof reversalId === 'string' ? reversalId.trim() : '';
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';

  if (!cleanCommissionId) {
    throw new RangeError('commissionId must be a non-empty string');
  }
  if (!cleanReversalId) {
    throw new RangeError('reversalId must be a non-empty string');
  }
  if (!cleanReason) {
    throw new RangeError('reason must be a non-empty string');
  }

  return db.runTransaction(async (tx) => {
    // --- READ-ONLY PHASE ---
    const reversalRef = db.collection('referralCommissions').doc(cleanReversalId);
    const reversalSnap = await tx.get(reversalRef);
    if (reversalSnap.exists) {
      return {
        status: 'already_reversed',
        reversalId: cleanReversalId,
        originalCommissionId: cleanCommissionId
      };
    }

    const origRef = db.collection('referralCommissions').doc(cleanCommissionId);
    const origSnap = await tx.get(origRef);
    if (!origSnap.exists) {
      throw new RangeError(`Original commission not found: ${cleanCommissionId}`);
    }

    const origData = origSnap.data();
    const commissionInternal = parseNonNegativeBigIntField(
      origData.commissionInternalStr,
      origData.commissionInternal,
      'commissionInternal'
    );
    const commissionMicroUsdt =
      origData.commissionMicroUsdtStr !== undefined || origData.commissionMicroUsdt !== undefined
        ? parseNonNegativeBigIntField(
            origData.commissionMicroUsdtStr,
            origData.commissionMicroUsdt,
            'commissionMicroUsdt'
          )
        : undefined;

    const nowTs = reversedAt || FieldValue.serverTimestamp();
    const reversal = createReversalEntry(
      {
        ...origData,
        commissionId: origData.commissionId || cleanCommissionId,
        commissionInternal,
        commissionMicroUsdt,
        commissionUsdt6: origData.commissionUsdt6
      },
      {
        reversalId: cleanReversalId,
        reason: cleanReason,
        reversedAt: nowTs
      }
    );

    const sponsorUid = typeof reversal.sponsorUid === 'string' ? reversal.sponsorUid.trim() : '';
    if (!sponsorUid) {
      throw new RangeError('Original commission is missing sponsorUid');
    }

    // Read unilevel/{sponsorUid} in READ-ONLY phase to compute floored decrement (>= 0).
    const unilevelRef = db.collection('unilevel').doc(sponsorUid);
    const unilevelSnap = await tx.get(unilevelRef);
    const currentActiveMiners =
      unilevelSnap.exists && Number.isInteger(unilevelSnap.data().activeReferredMinersCount)
        ? unilevelSnap.data().activeReferredMinersCount
        : 0;
    const nextActiveMiners = currentActiveMiners > 0 ? currentActiveMiners - 1 : 0;

    // --- WRITE-ONLY PHASE ---
    const negativeUsdt = -microUsdtToNumber(-reversal.deltaMicroUsdt);
    const negativeMicro = -Number(-reversal.deltaMicroUsdt);

    // 1. Write immutable negative compensatory entry (never delete original Q10)
    tx.set(reversalRef, {
      type: reversal.type,
      reversalId: reversal.reversalId,
      originalCommissionId: reversal.originalCommissionId,
      orderId: reversal.orderId,
      minerId: reversal.minerId,
      buyerUid: reversal.buyerUid,
      sponsorUid,
      currency: reversal.currency,
      deltaInternalStr: reversal.deltaInternal.toString(),
      deltaMicroUsdtStr: reversal.deltaMicroUsdt.toString(),
      deltaUsdt6: reversal.deltaUsdt6,
      reason: reversal.reason,
      reversedAt: nowTs,
      status: reversal.status
    });

    // 2. Mark original entry REVERSED without deleting it
    tx.set(
      origRef,
      {
        status: 'REVERSED',
        reversedBy: reversal.reversalId,
        reversedAt: nowTs
      },
      { merge: true }
    );

    // 3. Record compensatory transaction + atomically deduct balances
    const referralRef = db.collection('referrals').doc(sponsorUid);
    tx.set(referralRef.collection('transactions').doc(reversal.reversalId), {
      id: reversal.reversalId,
      reversalId: reversal.reversalId,
      originalCommissionId: reversal.originalCommissionId,
      type: 'commission_reversal',
      source: 'miner_purchase_reversal',
      currency: reversal.currency,
      amountUsdt6: reversal.deltaUsdt6,
      amountMicroUsdtStr: reversal.deltaMicroUsdt.toString(),
      reason: reversal.reason,
      status: 'REVERSED',
      createdAt: nowTs
    });

    tx.set(
      referralRef,
      {
        totalCommissionsEarned: FieldValue.increment(negativeUsdt),
        withdrawableBalance: FieldValue.increment(negativeUsdt),
        totalCommissionsMicroUsdt: FieldValue.increment(negativeMicro),
        reversalsCount: FieldValue.increment(1),
        updatedAt: nowTs
      },
      { merge: true }
    );

    tx.set(
      db.collection('userBalances').doc(sponsorUid),
      {
        usdtAvailable: FieldValue.increment(negativeUsdt),
        balance: FieldValue.increment(negativeUsdt),
        commissionBalance: FieldValue.increment(negativeUsdt),
        availableBalanceMicros: FieldValue.increment(negativeMicro),
        updatedAt: nowTs
      },
      { merge: true }
    );

    tx.set(
      db.collection('users').doc(sponsorUid),
      {
        commissionBalance: FieldValue.increment(negativeUsdt),
        balance: FieldValue.increment(negativeUsdt),
        totalCommissionsEarned: FieldValue.increment(negativeUsdt),
        updatedAt: nowTs
      },
      { merge: true }
    );

    // 4. Decrement unilevel activeReferredMinersCount with floor >= 0
    tx.set(
      unilevelRef,
      {
        uid: sponsorUid,
        activeReferredMinersCount: nextActiveMiners,
        updatedAt: nowTs
      },
      { merge: true }
    );

    return {
      status: 'reversed',
      reversalId: reversal.reversalId,
      originalCommissionId: reversal.originalCommissionId,
      sponsorUid,
      deltaInternal: reversal.deltaInternal,
      deltaMicroUsdt: reversal.deltaMicroUsdt,
      deltaUsdt6: reversal.deltaUsdt6,
      reason: reversal.reason
    };
  });
}

module.exports = Object.freeze({
  CANONICAL_MINER_ID_PATTERN,
  settleDirectReferralCommission,
  reverseDirectReferralCommission
});
