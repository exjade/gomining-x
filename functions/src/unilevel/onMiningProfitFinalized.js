'use strict';

const { settleUnilevelDistribution } = require('./unilevelSettlementService');

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

function isFinalizedStatus(status) {
  return typeof status === 'string' && status.trim().toLowerCase() === 'finalized';
}

async function handleMiningProfitFinalizedEvent({ beforeData, afterData, dailyProfitId, db, FieldValue }) {
  const beforeStatus = beforeData && typeof beforeData === 'object' ? beforeData.status : null;
  const afterStatus = afterData && typeof afterData === 'object' ? afterData.status : null;

  // Strict transition gate: execute only on creation or transition into 'finalized'.
  if (isFinalizedStatus(beforeStatus) || !isFinalizedStatus(afterStatus)) {
    return {
      status: 'ignored',
      reason: 'NO_FINALIZED_TRANSITION',
      dailyProfitId: dailyProfitId || null
    };
  }

  return settleUnilevelDistribution({
    db,
    FieldValue,
    dailyProfit: {
      dailyProfitId: dailyProfitId || afterData.dailyProfitId || afterData.id || null,
      minerId: afterData.minerId,
      minerUid: afterData.minerUid ?? afterData.uid,
      periodDate: afterData.periodDate,
      eligibleProfitUsdt6: afterData.eligibleProfitUsdt6 ?? afterData.eligibleProfit
    }
  });
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

const onMiningProfitFinalized = onDocumentWritten('mining_daily_profit/{dailyProfitId}', async (event) => {
  const beforeData = event && event.data && event.data.before ? event.data.before.data() : null;
  const afterData = event && event.data && event.data.after ? event.data.after.data() : null;
  const dailyProfitId = event && event.params ? event.params.dailyProfitId : null;
  const { db, FieldValue } = getDefaultFirestore();

  return handleMiningProfitFinalizedEvent({ beforeData, afterData, dailyProfitId, db, FieldValue });
});

module.exports = Object.freeze({
  isFinalizedStatus,
  handleMiningProfitFinalizedEvent,
  onMiningProfitFinalized
});
