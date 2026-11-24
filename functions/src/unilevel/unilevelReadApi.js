'use strict';

const { PLAN_VERSION_V1, MAX_UNILEVEL_DEPTH } = require('./unilevelRates');
const { isUplineEligible } = require('./calculateDistribution');
const { normalizeAccountStatus, isAccountStatusActive } = require('../shared/accountStatus');

function loadOptionalSdk(moduleName) {
  try {
    return require(moduleName);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      return null;
    }
    throw err;
  }
}

const httpsV2 = loadOptionalSdk('firebase-functions/v2/https');
const onCall = httpsV2 && typeof httpsV2.onCall === 'function'
  ? httpsV2.onCall
  : (_options, handler) => handler;

function createUnauthenticatedError(message = 'Authentication required') {
  if (httpsV2 && typeof httpsV2.HttpsError === 'function') {
    return new httpsV2.HttpsError('unauthenticated', message);
  }
  const err = new Error(message);
  err.code = 'unauthenticated';
  return err;
}

function requireAuthenticatedUid(request) {
  const uid = request && request.auth && typeof request.auth.uid === 'string' ? request.auth.uid.trim() : '';
  if (!uid) {
    throw createUnauthenticatedError();
  }
  return uid;
}

function getDefaultDb() {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

function normalizeLimit(limit) {
  if (limit === undefined || limit === null) {
    return 50;
  }
  const num = Number(limit);
  if (!Number.isFinite(num)) {
    throw new RangeError('limit must be a finite number');
  }
  return Math.min(100, Math.max(1, Math.trunc(num)));
}

async function getUnilevelStatsForUser({ db, uid }) {
  if (!db || typeof db.collection !== 'function') {
    throw new TypeError('db with collection() is required');
  }
  const cleanUid = typeof uid === 'string' ? uid.trim() : '';
  if (!cleanUid) {
    throw new RangeError('uid must be a non-empty string');
  }

  const [userSnap, unilevelSnap] = await Promise.all([
    db.collection('users').doc(cleanUid).get(),
    db.collection('unilevel').doc(cleanUid).get()
  ]);
  const userData = userSnap.exists ? userSnap.data() : {};
  const unilevelData = unilevelSnap.exists ? unilevelSnap.data() : {};

  const activeReferredMinersCount = Number.isInteger(unilevelData.activeReferredMinersCount)
    ? unilevelData.activeReferredMinersCount
    : 0;

  return {
    ownMiningProfit: Number(unilevelData.ownMiningProfitTotal ?? userData.ownMiningProfitTotal ?? 0),
    organizationGeneratedProfitShare: Number(unilevelData.organizationGeneratedProfitShareTotal ?? 0),
    receivedUnilevelCommission: Number(
      unilevelData.receivedUnilevelCommissionTotal ?? userData.receivedUnilevelCommissionTotal ?? 0
    ),
    directCount: Number.isInteger(unilevelData.directCount) ? unilevelData.directCount : 0,
    totalTeamCount: Number.isInteger(unilevelData.totalTeamCount) ? unilevelData.totalTeamCount : 0,
    activeReferredMinersCount,
    eligibleForUnilevel: isUplineEligible({
      status: normalizeAccountStatus(userData.status, { exists: userSnap.exists }),
      emailVerified: userData.emailVerified === true,
      activeReferredMinersCount
    }),
    planVersion: PLAN_VERSION_V1
  };
}

async function getUnilevelTreeForUser({ db, uid }) {
  if (!db || typeof db.collection !== 'function') {
    throw new TypeError('db with collection() is required');
  }
  const cleanUid = typeof uid === 'string' ? uid.trim() : '';
  if (!cleanUid) {
    throw new RangeError('uid must be a non-empty string');
  }

  const [userSnap, unilevelSnap] = await Promise.all([
    db.collection('users').doc(cleanUid).get(),
    db.collection('unilevel').doc(cleanUid).get()
  ]);
  const userData = userSnap.exists ? userSnap.data() : {};
  const unilevelData = unilevelSnap.exists ? unilevelSnap.data() : {};

  const rootReferralCode =
    userData.referral && typeof userData.referral.referralCode === 'string'
      ? userData.referral.referralCode
      : null;
  const rootSponsorId =
    (typeof unilevelData.sponsorId === 'string' && unilevelData.sponsorId.trim()) ||
    (typeof userData.sponsorId === 'string' && userData.sponsorId.trim()) ||
    null;

  const visited = new Set([cleanUid]);
  const uplines = [];
  let nextSponsorId = rootSponsorId;

  for (let level = 1; level <= MAX_UNILEVEL_DEPTH && nextSponsorId; level += 1) {
    if (visited.has(nextSponsorId)) {
      break;
    }
    visited.add(nextSponsorId);

    const [upUserSnap, upUniSnap] = await Promise.all([
      db.collection('users').doc(nextSponsorId).get(),
      db.collection('unilevel').doc(nextSponsorId).get()
    ]);
    const upUserData = upUserSnap.exists ? upUserSnap.data() : {};
    const upUniData = upUniSnap.exists ? upUniSnap.data() : {};

    // Sanitized node: zero third-party email, walletAddress, or balances.
    uplines.push({
      level,
      uid: nextSponsorId,
      referralCode:
        upUserData.referral && typeof upUserData.referral.referralCode === 'string'
          ? upUserData.referral.referralCode
          : null,
      active: isAccountStatusActive(upUserData.status, { exists: upUserSnap.exists })
    });

    nextSponsorId =
      (typeof upUniData.sponsorId === 'string' && upUniData.sponsorId.trim()) ||
      (typeof upUserData.sponsorId === 'string' && upUserData.sponsorId.trim()) ||
      null;
  }

  return {
    uid: cleanUid,
    referralCode: rootReferralCode,
    sponsorId: rootSponsorId,
    uplines,
    directCount: Number.isInteger(unilevelData.directCount) ? unilevelData.directCount : 0,
    totalTeamCount: Number.isInteger(unilevelData.totalTeamCount) ? unilevelData.totalTeamCount : 0,
    activeReferredMinersCount: Number.isInteger(unilevelData.activeReferredMinersCount)
      ? unilevelData.activeReferredMinersCount
      : 0
  };
}

async function getUnilevelHistoryForUser({ db, uid, limit = 50 }) {
  if (!db || typeof db.collection !== 'function') {
    throw new TypeError('db with collection() is required');
  }
  const cleanUid = typeof uid === 'string' ? uid.trim() : '';
  if (!cleanUid) {
    throw new RangeError('uid must be a non-empty string');
  }

  const safeLimit = normalizeLimit(limit);
  const [distSnap, ledgerSnap] = await Promise.all([
    db.collection('unilevel_distributions').where('minerUid', '==', cleanUid).limit(safeLimit).get(),
    db.collection('unilevel_ledger').where('uplineUserId', '==', cleanUid).limit(safeLimit).get()
  ]);

  return {
    uid: cleanUid,
    limit: safeLimit,
    ownDistributions: (distSnap.docs || []).map((doc) => ({ id: doc.id, ...doc.data() })),
    receivedCommissions: (ledgerSnap.docs || []).map((doc) => ({ id: doc.id, ...doc.data() }))
  };
}

const getUnilevelStats = onCall({ cors: true }, async (request) => {
  const uid = requireAuthenticatedUid(request);
  return getUnilevelStatsForUser({ db: getDefaultDb(), uid });
});

const getUnilevelTree = onCall({ cors: true }, async (request) => {
  const uid = requireAuthenticatedUid(request);
  return getUnilevelTreeForUser({ db: getDefaultDb(), uid });
});

const getUnilevelHistory = onCall({ cors: true }, async (request) => {
  const uid = requireAuthenticatedUid(request);
  const limit = request && request.data ? request.data.limit : undefined;
  return getUnilevelHistoryForUser({ db: getDefaultDb(), uid, limit });
});

module.exports = Object.freeze({
  getUnilevelStatsForUser,
  getUnilevelTreeForUser,
  getUnilevelHistoryForUser,
  getUnilevelStats,
  getUnilevelTree,
  getUnilevelHistory
});
