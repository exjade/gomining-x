'use strict';

const { settleDirectReferralCommission } = require('./directReferralService');

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

const firestoreV2 = loadOptionalSdk('firebase-functions/v2/firestore');
const onDocumentWritten = firestoreV2 && typeof firestoreV2.onDocumentWritten === 'function'
  ? firestoreV2.onDocumentWritten
  : (_options, handler) => handler;

const SETTLED_STATUSES = new Set(['completed', 'confirmed', 'settled']);

function isSettledStatus(status) {
  return typeof status === 'string' && SETTLED_STATUSES.has(status.trim().toLowerCase());
}

async function handlePurchaseSettledEvent({ beforeData, afterData, orderId, db, FieldValue }) {
  const beforeStatus = beforeData && typeof beforeData === 'object' ? beforeData.status : null;
  const afterStatus = afterData && typeof afterData === 'object' ? afterData.status : null;

  // Strict transition gate: execute only when creating or transitioning INTO a settled status.
  if (isSettledStatus(beforeStatus) || !isSettledStatus(afterStatus)) {
    return {
      status: 'ignored',
      reason: 'NO_SETTLED_TRANSITION',
      orderId: orderId || null
    };
  }

  const netPaidUsdt =
    afterData.netPaidUsdt !== undefined
      ? afterData.netPaidUsdt
      : afterData.netAmountUsdt !== undefined
        ? afterData.netAmountUsdt
        : afterData.paidUsdt !== undefined
          ? afterData.paidUsdt
          : afterData.finalPriceUsdt !== undefined
            ? afterData.finalPriceUsdt
            : afterData.amountUsd;

  const paymentMethod =
    afterData.paymentMethod ||
    (afterData.paymentNetwork === 'PLATFORM_BALANCE' ? 'platform_balance' : 'wallet');

  const productType =
    afterData.productType !== undefined
      ? afterData.productType
      : afterData.activatedMinerId
        ? 'miner'
        : undefined;

  const referralSnapshotLocked = afterData.referralSnapshotLocked === true;

  const purchase = {
    orderId: orderId || afterData.orderId || null,
    minerId: afterData.minerId ?? afterData.activatedMinerId ?? null,
    productType,
    netPaidUsdt,
    buyerUid: afterData.buyerUid ?? afterData.userId ?? afterData.uid ?? null,
    isTestOrGuest: afterData.isTestOrGuest === undefined ? false : afterData.isTestOrGuest,
    paymentMethod,
    settledAt: afterData.settledAt || null,
    referralSnapshotLocked,
    lockedSponsorUid: referralSnapshotLocked ? (afterData.sponsorUid ?? null) : undefined
  };

  return settleDirectReferralCommission({ db, FieldValue, purchase });
}

function getDefaultFirestore() {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return {
    db: admin.firestore(),
    FieldValue: admin.firestore.FieldValue
  };
}

const onPurchaseSettled = onDocumentWritten('admin_orders/{orderId}', async (event) => {
  const beforeData = event && event.data && event.data.before ? event.data.before.data() : null;
  const afterData = event && event.data && event.data.after ? event.data.after.data() : null;
  const orderId = event && event.params ? event.params.orderId : null;
  const { db, FieldValue } = getDefaultFirestore();

  return handlePurchaseSettledEvent({ beforeData, afterData, orderId, db, FieldValue });
});

module.exports = Object.freeze({
  SETTLED_STATUSES,
  isSettledStatus,
  handlePurchaseSettledEvent,
  onPurchaseSettled
});
