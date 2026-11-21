'use strict';

const { runFinalizeDailyMiningProfitBatch } = require('./dailyMiningProfitService');

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

const schedulerV2 = loadOptionalSdk('firebase-functions/v2/scheduler');
const onSchedule = schedulerV2 && typeof schedulerV2.onSchedule === 'function'
  ? schedulerV2.onSchedule
  : (_options, handler) => handler;

function resolvePreviousUtcDate(referenceDate = new Date()) {
  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid referenceDate: ${referenceDate}`);
  }
  const prev = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1)
  );
  const yyyy = String(prev.getUTCFullYear()).padStart(4, '0');
  const mm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(prev.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function handleScheduledDailyMiningProfit({
  db,
  FieldValue,
  referenceDate = new Date(),
  operatorConfig = null,
  batchSize = 50,
  finalizedAt = null
}) {
  const periodDate = resolvePreviousUtcDate(referenceDate);
  return runFinalizeDailyMiningProfitBatch({
    db,
    FieldValue,
    periodDate,
    operatorConfig,
    batchSize,
    finalizedAt
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

const finalizeDailyMiningProfit = onSchedule(
  { schedule: '5 0 * * *', timeZone: 'UTC' },
  async () => {
    const { db, FieldValue } = getDefaultFirestore();
    return handleScheduledDailyMiningProfit({ db, FieldValue });
  }
);

module.exports = Object.freeze({
  resolvePreviousUtcDate,
  handleScheduledDailyMiningProfit,
  finalizeDailyMiningProfit
});
