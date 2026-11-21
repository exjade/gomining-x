'use strict';

const {
  normalizeReferralCode,
  isSponsorAccountActive,
  checkReferralCodeExists,
  validateReferralCode
} = require('./validateReferralCode');
const {
  CANONICAL_MINER_ID_PATTERN,
  settleDirectReferralCommission,
  reverseDirectReferralCommission
} = require('./directReferralService');
const {
  SETTLED_STATUSES,
  isSettledStatus,
  handlePurchaseSettledEvent,
  onPurchaseSettled
} = require('./onPurchaseSettled');
const calculateDirectReferral = require('./calculateDirectReferral');

module.exports = Object.freeze({
  validateReferralCode,
  onPurchaseSettled,
  normalizeReferralCode,
  isSponsorAccountActive,
  checkReferralCodeExists,
  CANONICAL_MINER_ID_PATTERN,
  settleDirectReferralCommission,
  reverseDirectReferralCommission,
  SETTLED_STATUSES,
  isSettledStatus,
  handlePurchaseSettledEvent,
  ...calculateDirectReferral
});
