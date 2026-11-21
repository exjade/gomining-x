'use strict';

const {
  parseUsdtToInternal,
  roundInternalToUsdt6,
  formatInternalToUsdt6,
  mulRateRoundDown
} = require('../shared/money');

const DIRECT_REFERRAL_RATE_INTERNAL = 10_000_000n;
const DIRECT_REFERRAL_CURRENCY = 'USDT';
const ELIGIBLE_PRODUCT_TYPE = 'miner';

const IDEMPOTENCY_DISALLOWED_CHARS = /[^a-zA-Z0-9_-]+/g;

function buildDirectReferralIdempotencyKey(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('buildDirectReferralIdempotencyKey requires a non-array object');
  }

  const { minerId } = input;
  if (typeof minerId !== 'string') {
    throw new RangeError('minerId must be a non-empty string');
  }

  const cleanMinerId = minerId.trim().replace(IDEMPOTENCY_DISALLOWED_CHARS, '');
  if (cleanMinerId.length === 0) {
    throw new RangeError('minerId must contain at least one [a-zA-Z0-9_-] character');
  }

  return `COMM-${cleanMinerId}`;
}

function buildRejectedResult({
  reason,
  orderId,
  minerId,
  productType,
  purchaseNumber,
  purchaseType,
  buyerUid,
  sponsorUid,
  netPaidInternal,
  netPaidUsdt6
}) {
  return Object.freeze({
    eligible: false,
    reason,
    status: 'REJECTED',
    settlementMode: 'NONE',
    type: 'DIRECT_REFERRAL_COMMISSION',
    commissionId: null,
    orderId,
    minerId,
    productType,
    purchaseNumber,
    purchaseType,
    buyerUid,
    sponsorUid,
    currency: DIRECT_REFERRAL_CURRENCY,
    rateInternal: DIRECT_REFERRAL_RATE_INTERNAL,
    netPaidInternal,
    netPaidUsdt6,
    exactInternal: 0n,
    commissionInternal: 0n,
    commissionMicroUsdt: 0n,
    commissionUsdt6: '0.000000',
    roundingResidualInternal: 0n
  });
}

function calculateDirectReferralCommission(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('calculateDirectReferralCommission requires a non-array object');
  }

  const {
    orderId = null,
    minerId = null,
    productType,
    netPaidUsdt,
    buyerUid,
    sponsorUid,
    purchaseNumber = 1,
    isTestOrGuest = false
  } = input;

  if (!Number.isInteger(purchaseNumber) || purchaseNumber < 1) {
    throw new RangeError('purchaseNumber must be an integer >= 1');
  }

  if (typeof isTestOrGuest !== 'boolean') {
    throw new TypeError('isTestOrGuest must be a boolean');
  }

  const purchaseType = purchaseNumber === 1 ? 'first_purchase' : 'repurchase';
  const normalizedOrderId = typeof orderId === 'string' && orderId.trim().length > 0 ? orderId.trim() : null;
  const normalizedMinerId = typeof minerId === 'string' && minerId.trim().length > 0 ? minerId.trim() : null;
  const normalizedBuyerUid = typeof buyerUid === 'string' ? buyerUid.trim() : '';
  const normalizedSponsorUid = typeof sponsorUid === 'string' ? sponsorUid.trim() : '';

  const baseMeta = {
    orderId: normalizedOrderId,
    minerId: normalizedMinerId,
    productType,
    purchaseNumber,
    purchaseType,
    buyerUid: normalizedBuyerUid || null,
    sponsorUid: normalizedSponsorUid || null
  };

  if (productType !== ELIGIBLE_PRODUCT_TYPE) {
    return buildRejectedResult({
      ...baseMeta,
      netPaidInternal: 0n,
      netPaidUsdt6: '0.000000',
      reason: 'NON_MINER_PRODUCT'
    });
  }

  if (isTestOrGuest === true) {
    return buildRejectedResult({
      ...baseMeta,
      netPaidInternal: 0n,
      netPaidUsdt6: '0.000000',
      reason: 'TEST_OR_GUEST_PURCHASE'
    });
  }

  const netPaidInternal = parseUsdtToInternal(netPaidUsdt);
  const netPaidUsdt6 = formatInternalToUsdt6(netPaidInternal);
  const base = {
    ...baseMeta,
    netPaidInternal,
    netPaidUsdt6
  };

  if (!normalizedSponsorUid) {
    return buildRejectedResult({ ...base, reason: 'MISSING_SPONSOR' });
  }

  if (!normalizedBuyerUid) {
    throw new RangeError('buyerUid must be a non-empty string');
  }

  if (normalizedBuyerUid === normalizedSponsorUid) {
    return buildRejectedResult({ ...base, reason: 'SELF_REFERRAL' });
  }

  if (netPaidInternal === 0n) {
    return buildRejectedResult({ ...base, reason: 'ZERO_NET_AMOUNT' });
  }

  const commissionId = buildDirectReferralIdempotencyKey({ minerId, orderId });
  const {
    exactInternal,
    amountInternal: commissionInternal,
    microUsdt: commissionMicroUsdt,
    usdt6: commissionUsdt6,
    roundingResidualInternal
  } = mulRateRoundDown(netPaidInternal, DIRECT_REFERRAL_RATE_INTERNAL);

  return Object.freeze({
    eligible: true,
    reason: null,
    status: 'CREDITED',
    settlementMode: 'IMMEDIATE',
    type: 'DIRECT_REFERRAL_COMMISSION',
    commissionId,
    orderId: normalizedOrderId,
    minerId: normalizedMinerId,
    productType,
    purchaseNumber,
    purchaseType,
    buyerUid: normalizedBuyerUid,
    sponsorUid: normalizedSponsorUid,
    currency: DIRECT_REFERRAL_CURRENCY,
    rateInternal: DIRECT_REFERRAL_RATE_INTERNAL,
    netPaidInternal,
    netPaidUsdt6,
    exactInternal,
    commissionInternal,
    commissionMicroUsdt,
    commissionUsdt6,
    roundingResidualInternal
  });
}

function createReversalEntry(originalEntry, options) {
  if (!originalEntry || typeof originalEntry !== 'object' || Array.isArray(originalEntry)) {
    throw new TypeError('originalEntry must be a non-array object');
  }

  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('reversal options must be a non-array object');
  }

  if (
    originalEntry.type !== 'DIRECT_REFERRAL_COMMISSION' ||
    originalEntry.eligible !== true ||
    originalEntry.status !== 'CREDITED' ||
    typeof originalEntry.commissionInternal !== 'bigint' ||
    originalEntry.commissionInternal <= 0n ||
    typeof originalEntry.commissionId !== 'string' ||
    originalEntry.commissionId.trim().length === 0
  ) {
    throw new RangeError('originalEntry must be an eligible CREDITED DIRECT_REFERRAL_COMMISSION with positive commissionInternal');
  }

  const { reversalId, reason, reversedAt = null } = options;
  if (typeof reversalId !== 'string' || reversalId.trim().length === 0) {
    throw new RangeError('reversalId must be a non-empty string');
  }

  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new RangeError('reason must be a non-empty string');
  }

  const derived = roundInternalToUsdt6(originalEntry.commissionInternal);
  if (originalEntry.commissionMicroUsdt !== undefined && originalEntry.commissionMicroUsdt !== derived.microUsdt) {
    throw new RangeError('originalEntry commissionMicroUsdt does not match commissionInternal');
  }
  if (originalEntry.commissionUsdt6 !== undefined && originalEntry.commissionUsdt6 !== derived.usdt6) {
    throw new RangeError('originalEntry commissionUsdt6 does not match commissionInternal');
  }

  const deltaInternal = -originalEntry.commissionInternal;
  const deltaMicroUsdt = -derived.microUsdt;

  return Object.freeze({
    type: 'DIRECT_REFERRAL_REVERSAL',
    reversalId: reversalId.trim(),
    originalCommissionId: originalEntry.commissionId.trim(),
    orderId: originalEntry.orderId ?? null,
    minerId: originalEntry.minerId ?? null,
    buyerUid: originalEntry.buyerUid ?? null,
    sponsorUid: originalEntry.sponsorUid ?? null,
    currency: originalEntry.currency || DIRECT_REFERRAL_CURRENCY,
    deltaInternal,
    deltaMicroUsdt,
    deltaUsdt6: `-${derived.usdt6}`,
    reason: reason.trim(),
    reversedAt,
    status: 'REVERSED'
  });
}

module.exports = Object.freeze({
  DIRECT_REFERRAL_RATE_INTERNAL,
  DIRECT_REFERRAL_CURRENCY,
  ELIGIBLE_PRODUCT_TYPE,
  buildDirectReferralIdempotencyKey,
  calculateDirectReferralCommission,
  createReversalEntry
});
