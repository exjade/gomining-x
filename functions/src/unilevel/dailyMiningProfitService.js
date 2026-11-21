'use strict';

const {
  parseUsdtToInternal,
  formatInternal,
  formatInternalToUsdt6,
  mulInternalRoundDown
} = require('../shared/money');
const { calculateEligibleProfit } = require('./calculateEligibleProfit');

const DEFAULT_BASE_ELECTRICITY_USD_PER_KWH = '0.01';
const DEFAULT_EFFICIENCY_W_PER_TH = 15;
const PERIOD_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CANONICAL_MINER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

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

function buildDailyProfitDocId(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('buildDailyProfitDocId requires a non-array object');
  }
  const { minerId, periodDate } = input;
  const cleanMinerId = typeof minerId === 'string' ? minerId.trim() : '';
  if (!CANONICAL_MINER_ID_PATTERN.test(cleanMinerId)) {
    throw new RangeError('minerId must match ^[a-zA-Z0-9_-]+$');
  }
  assertValidPeriodDate(periodDate);
  return `${cleanMinerId}_${periodDate}`;
}

function resolveMinerEconomicInputs({ minerData, operatorConfig = null }) {
  if (!minerData || typeof minerData !== 'object' || Array.isArray(minerData)) {
    throw new TypeError('minerData must be a non-array object');
  }

  const baseStats =
    minerData.baseStats && typeof minerData.baseStats === 'object' && !Array.isArray(minerData.baseStats)
      ? minerData.baseStats
      : {};
  const activeModifiers =
    minerData.activeModifiers && typeof minerData.activeModifiers === 'object' && !Array.isArray(minerData.activeModifiers)
      ? minerData.activeModifiers
      : {};
  const opCfg =
    operatorConfig && typeof operatorConfig === 'object' && !Array.isArray(operatorConfig)
      ? operatorConfig
      : {};

  const powerTh = baseStats.powerTh ?? minerData.powerTh;
  const effectiveEfficiencyWPerTh =
    activeModifiers.effectiveEfficiencyWPerTh ??
    baseStats.baseEfficiencyWPerTh ??
    minerData.efficiencyWattsPerTh ??
    minerData.efficiency ??
    DEFAULT_EFFICIENCY_W_PER_TH;
  const baseElectricityUsdPerKwh =
    baseStats.baseElectricityUsdPerKwh ??
    opCfg.baseElectricityUsdPerKwh ??
    DEFAULT_BASE_ELECTRICITY_USD_PER_KWH;

  const rawTier = activeModifiers.membershipTier ?? minerData.membershipTier ?? 'explorer';
  const membershipTier = typeof rawTier === 'string' ? rawTier.trim().toLowerCase() : rawTier;
  const electricityDiscountPct = activeModifiers.electricityDiscountPct ?? 0;
  const maintenanceDiscountPct = activeModifiers.maintenanceDiscountPct ?? 0;

  const serviceStreakDays = activeModifiers.serviceStreakDays ?? 0;
  if (!Number.isInteger(serviceStreakDays) || serviceStreakDays < 0) {
    throw new RangeError('serviceStreakDays must be a non-negative integer');
  }

  let grossRevenueUsdt;
  if (minerData.dailyGrossUsdt !== undefined && minerData.dailyGrossUsdt !== null) {
    parseUsdtToInternal(minerData.dailyGrossUsdt);
    grossRevenueUsdt = minerData.dailyGrossUsdt;
  } else {
    if (opCfg.grossRevenuePerThUsdt === undefined || opCfg.grossRevenuePerThUsdt === null) {
      throw new RangeError('operatorConfig.grossRevenuePerThUsdt is required when dailyGrossUsdt is absent');
    }
    const powerThInternal = parseUsdtToInternal(powerTh);
    const perThInternal = parseUsdtToInternal(opCfg.grossRevenuePerThUsdt);
    const grossInternal = mulInternalRoundDown(powerThInternal, perThInternal);
    grossRevenueUsdt = formatInternal(grossInternal);
  }

  return {
    grossRevenueUsdt,
    powerTh,
    effectiveEfficiencyWPerTh,
    baseElectricityUsdPerKwh,
    membershipTier,
    electricityDiscountPct,
    maintenanceDiscountPct,
    serviceStreakDays
  };
}

function assertTxDeps(db, FieldValue) {
  if (!db || typeof db.collection !== 'function' || typeof db.runTransaction !== 'function') {
    throw new TypeError('db with collection() and runTransaction() is required');
  }
  if (!FieldValue || typeof FieldValue.serverTimestamp !== 'function') {
    throw new TypeError('FieldValue with serverTimestamp() is required');
  }
}

async function finalizeMinerDailyProfit({
  db,
  FieldValue,
  miner,
  periodDate,
  operatorConfig = null,
  finalizedAt = null
}) {
  assertTxDeps(db, FieldValue);

  if (!miner || typeof miner !== 'object' || Array.isArray(miner)) {
    throw new TypeError('miner must be a non-array object');
  }

  const rawMinerId = miner.minerId ?? miner.id;
  const dailyProfitId = buildDailyProfitDocId({ minerId: rawMinerId, periodDate });
  const cleanMinerId = rawMinerId.trim();

  const rawUid = miner.uid ?? miner.minerUid;
  const cleanUid = typeof rawUid === 'string' ? rawUid.trim() : '';
  if (!cleanUid) {
    throw new RangeError('miner uid must be a non-empty string');
  }

  return db.runTransaction(async (tx) => {
    // --- READ-ONLY PHASE ---
    const docRef = db.collection('mining_daily_profit').doc(dailyProfitId);
    const existingSnap = await tx.get(docRef);
    if (existingSnap.exists) {
      return {
        status: 'already_finalized',
        dailyProfitId,
        minerId: cleanMinerId,
        periodDate
      };
    }

    // --- PURE DOMAIN CALCULATION ---
    const inputs = resolveMinerEconomicInputs({ minerData: miner, operatorConfig });
    const calc = calculateEligibleProfit({
      grossRevenueUsdt: inputs.grossRevenueUsdt,
      powerTh: inputs.powerTh,
      effectiveEfficiencyWPerTh: inputs.effectiveEfficiencyWPerTh,
      baseElectricityUsdPerKwh: inputs.baseElectricityUsdPerKwh,
      membershipTier: inputs.membershipTier,
      electricityDiscountPct: inputs.electricityDiscountPct,
      maintenanceDiscountPct: inputs.maintenanceDiscountPct
    });

    // --- WRITE-ONLY PHASE ---
    const nowTs = finalizedAt || FieldValue.serverTimestamp();
    tx.set(docRef, {
      id: dailyProfitId,
      dailyProfitId,
      minerId: cleanMinerId,
      minerUid: cleanUid,
      uid: cleanUid,
      periodDate,
      currency: 'USDT',
      status: 'finalized',
      grossRevenueInternalStr: calc.grossRevenueInternal.toString(),
      grossRevenueUsdt6: formatInternalToUsdt6(calc.grossRevenueInternal),
      electricityKwhInternalStr: calc.electricityKwhInternal.toString(),
      electricityCostInternalStr: calc.electricityCostInternal.toString(),
      electricityCostUsdt6: calc.electricityCostUsdt6,
      afterElectricityInternalStr: calc.afterElectricityInternal.toString(),
      afterElectricityUsdt6: calc.afterElectricityUsdt6,
      maintenanceCostInternalStr: calc.maintenanceCostInternal.toString(),
      maintenanceCostUsdt6: calc.maintenanceCostUsdt6,
      eligibleProfitInternalStr: calc.eligibleProfitInternal.toString(),
      eligibleProfitUsdt6: calc.eligibleProfitUsdt6,
      inputSnapshot: {
        powerTh: String(inputs.powerTh),
        effectiveEfficiencyWPerTh: String(inputs.effectiveEfficiencyWPerTh),
        baseElectricityUsdPerKwh: String(inputs.baseElectricityUsdPerKwh),
        membershipTier: calc.membershipTier,
        effectiveElectricityDiscountInternalStr: calc.effectiveElectricityDiscountInternal.toString(),
        effectiveMaintenanceDiscountInternalStr: calc.effectiveMaintenanceDiscountInternal.toString(),
        serviceStreakDays: inputs.serviceStreakDays
      },
      finalizedAt: nowTs,
      createdAt: nowTs
    });

    return {
      status: 'finalized',
      dailyProfitId,
      minerId: cleanMinerId,
      minerUid: cleanUid,
      periodDate,
      eligibleProfitInternal: calc.eligibleProfitInternal,
      eligibleProfitUsdt6: calc.eligibleProfitUsdt6
    };
  });
}

async function runFinalizeDailyMiningProfitBatch({
  db,
  FieldValue,
  periodDate,
  operatorConfig = null,
  batchSize = 50,
  finalizedAt = null
}) {
  assertTxDeps(db, FieldValue);
  if (typeof db.collectionGroup !== 'function') {
    throw new TypeError('db with collectionGroup() is required');
  }
  assertValidPeriodDate(periodDate);
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError('batchSize must be an integer >= 1');
  }

  let effectiveOperatorConfig = operatorConfig;
  if (!effectiveOperatorConfig) {
    const cfgSnap = await db.collection('operatorConfig').doc('mining').get();
    const cfgData = cfgSnap.exists ? cfgSnap.data() : {};
    effectiveOperatorConfig = {
      baseElectricityUsdPerKwh: DEFAULT_BASE_ELECTRICITY_USD_PER_KWH,
      ...cfgData
    };
  }

  const minersSnap = await db.collectionGroup('miner').where('status', '==', 'active').get();
  const docs = minersSnap.docs || [];

  let finalizedCount = 0;
  let alreadyFinalizedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let offset = 0; offset < docs.length; offset += batchSize) {
    const chunk = docs.slice(offset, offset + batchSize);
    for (const doc of chunk) {
      const data = doc.data() || {};
      const minerId = data.id || doc.id;
      const parentUid =
        doc.ref && doc.ref.parent && doc.ref.parent.parent ? doc.ref.parent.parent.id : null;
      const uid = data.uid || parentUid;

      if (data.isTestOrGuest === true || data.isDemo === true) {
        skippedCount += 1;
        continue;
      }

      try {
        const result = await finalizeMinerDailyProfit({
          db,
          FieldValue,
          miner: { ...data, id: minerId, uid },
          periodDate,
          operatorConfig: effectiveOperatorConfig,
          finalizedAt
        });
        if (result.status === 'already_finalized') {
          alreadyFinalizedCount += 1;
        } else {
          finalizedCount += 1;
        }
      } catch (err) {
        errorCount += 1;
        errors.push({ minerId, error: err && err.message ? err.message : String(err) });
      }
    }
  }

  return {
    periodDate,
    totalScanned: docs.length,
    finalizedCount,
    alreadyFinalizedCount,
    skippedCount,
    errorCount,
    errors
  };
}

module.exports = Object.freeze({
  DEFAULT_BASE_ELECTRICITY_USD_PER_KWH,
  DEFAULT_EFFICIENCY_W_PER_TH,
  PERIOD_DATE_PATTERN,
  CANONICAL_MINER_ID_PATTERN,
  assertValidPeriodDate,
  buildDailyProfitDocId,
  resolveMinerEconomicInputs,
  finalizeMinerDailyProfit,
  runFinalizeDailyMiningProfitBatch
});
