'use strict';

const { PAYMENT_STATUSES } = require('./paymentConfig');

const DEFAULT_BATCH_LIMIT = 50;
const MIN_BATCH_LIMIT = 1;
const MAX_BATCH_LIMIT = 100;
const DEFAULT_MAX_CONCURRENCY = 5;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 10;

const PENDING_STATUSES = Object.freeze([
  PAYMENT_STATUSES.OPEN,
  PAYMENT_STATUSES.AWAITING,
  PAYMENT_STATUSES.PROCESSING
]);
const URL_PATTERN = /https?:\/\/[^\s'"]+/gi;

function clampInt(raw, fallback, min, max) {
  if (raw === undefined || raw === null) return fallback;
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(num)));
}

function createPaymentReconciler({
  db,
  settlementService,
  now = () => Date.now(),
  logger = console
} = {}) {
  if (!db || typeof db.collection !== 'function') {
    throw new TypeError('db with collection() is required');
  }
  if (
    !settlementService ||
    typeof settlementService.processIntentVerificationAndSettlement !== 'function'
  ) {
    throw new TypeError('settlementService with processIntentVerificationAndSettlement() is required');
  }

  async function reconcilePendingPayments({
    batchLimit = DEFAULT_BATCH_LIMIT,
    maxConcurrency = DEFAULT_MAX_CONCURRENCY
  } = {}) {
    const safeBatchLimit = clampInt(batchLimit, DEFAULT_BATCH_LIMIT, MIN_BATCH_LIMIT, MAX_BATCH_LIMIT);
    const safeConcurrency = clampInt(maxConcurrency, DEFAULT_MAX_CONCURRENCY, MIN_CONCURRENCY, MAX_CONCURRENCY);
    const startedAt = new Date(now()).toISOString();

    const snap = await db
      .collection('payment_intents')
      .where('status', 'in', [...PENDING_STATUSES])
      .limit(safeBatchLimit)
      .get();

    const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
    const metrics = {
      scanned: docs.length,
      settled: 0,
      alreadySettled: 0,
      processing: 0,
      expired: 0,
      underpaid: 0,
      failed: 0,
      unchanged: 0,
      errorsCount: 0,
      errors: [],
      startedAt,
      finishedAt: null
    };

    if (docs.length === 0) {
      metrics.finishedAt = new Date(now()).toISOString();
      return metrics;
    }

    let cursor = 0;

    async function processSingleDoc(doc) {
      let intentId = doc && typeof doc.id === 'string' ? doc.id : null;
      try {
        const data = doc && typeof doc.data === 'function' ? (doc.data() || {}) : (doc && doc.data) || {};
        if (!intentId && typeof data.intentId === 'string') {
          intentId = data.intentId;
        }
        const txHash = typeof data.txHash === 'string' && data.txHash.trim() ? data.txHash.trim() : undefined;

        const result = await settlementService.processIntentVerificationAndSettlement({
          intentId,
          txHash,
          allowSystemActor: true
        });

        switch (result && result.outcome) {
          case 'SETTLED':
            metrics.settled += 1;
            break;
          case 'ALREADY_SETTLED':
            metrics.alreadySettled += 1;
            break;
          case 'PROCESSING':
            metrics.processing += 1;
            break;
          case 'EXPIRED':
            metrics.expired += 1;
            break;
          case 'UNDERPAID':
            metrics.underpaid += 1;
            break;
          case 'FAILED':
            metrics.failed += 1;
            break;
          default:
            metrics.unchanged += 1;
            break;
        }
      } catch (err) {
        const code = err && typeof err.code === 'string' ? err.code : 'INTERNAL_ERROR';
        const rawMessage = err && err.message ? err.message : String(err);
        const message = rawMessage.replace(URL_PATTERN, '[REDACTED_URL]');
        metrics.errorsCount += 1;
        metrics.errors.push({ intentId, code, message });
        if (logger && typeof logger.warn === 'function') {
          logger.warn('[reconcilePendingPayments] intent processing failed', { intentId, code, message });
        }
      }
    }

    const workerCount = Math.min(safeConcurrency, docs.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < docs.length) {
        const nextDoc = docs[cursor];
        cursor += 1;
        await processSingleDoc(nextDoc);
      }
    });

    await Promise.all(workers);
    metrics.finishedAt = new Date(now()).toISOString();
    return metrics;
  }

  return Object.freeze({
    reconcilePendingPayments
  });
}

module.exports = Object.freeze({
  DEFAULT_BATCH_LIMIT,
  MAX_BATCH_LIMIT,
  DEFAULT_MAX_CONCURRENCY,
  MAX_CONCURRENCY,
  PENDING_STATUSES,
  createPaymentReconciler
});
