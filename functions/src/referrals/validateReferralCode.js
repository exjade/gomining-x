'use strict';

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

const BLOCKED_SPONSOR_STATUSES = new Set(['blocked', 'inactive']);

function normalizeReferralCode(referralCode) {
  if (typeof referralCode !== 'string') {
    return '';
  }
  return referralCode.trim().toUpperCase();
}

function isSponsorAccountActive(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const status = typeof data.status === 'string' ? data.status.trim().toLowerCase() : '';
  return !BLOCKED_SPONSOR_STATUSES.has(status);
}

async function checkReferralCodeExists({ db, referralCode }) {
  if (!db || typeof db.collection !== 'function') {
    throw new TypeError('db with collection() is required');
  }

  const trimmed = typeof referralCode === 'string' ? referralCode.trim() : '';
  const normalized = normalizeReferralCode(trimmed);
  if (!normalized) {
    return Object.freeze({ exists: false });
  }

  const usersCol = db.collection('users');
  let snap = await usersCol.where('referral.referralCode', '==', normalized).limit(5).get();

  if (snap.empty && trimmed !== normalized) {
    snap = await usersCol.where('referral.referralCode', '==', trimmed).limit(5).get();
  }

  // Optional legacy root referralCode fallback only when nested referral.referralCode yields no match.
  if (snap.empty) {
    snap = await usersCol.where('referralCode', '==', normalized).limit(5).get();
    if (snap.empty && trimmed !== normalized) {
      snap = await usersCol.where('referralCode', '==', trimmed).limit(5).get();
    }
  }

  const exists = !snap.empty && snap.docs.some((doc) => isSponsorAccountActive(doc.data()));
  return Object.freeze({ exists });
}

function getDefaultDb() {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

const validateReferralCode = onCall({ cors: true }, async (request) => {
  const referralCode = request && request.data ? request.data.referralCode : null;
  return checkReferralCodeExists({ db: getDefaultDb(), referralCode });
});

module.exports = Object.freeze({
  normalizeReferralCode,
  isSponsorAccountActive,
  checkReferralCodeExists,
  validateReferralCode
});
