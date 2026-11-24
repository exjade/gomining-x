'use strict';

const CANONICAL_ACCOUNT_STATUSES = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  BLOCKED: 'blocked'
});

const KNOWN_ACCOUNT_STATUS_SET = new Set(Object.values(CANONICAL_ACCOUNT_STATUSES));
const INACTIVE_ACCOUNT_STATUSES = new Set([
  CANONICAL_ACCOUNT_STATUSES.INACTIVE,
  CANONICAL_ACCOUNT_STATUSES.SUSPENDED,
  CANONICAL_ACCOUNT_STATUSES.BLOCKED
]);

function normalizeAccountStatus(rawStatus, { exists = true } = {}) {
  if (!exists) {
    return CANONICAL_ACCOUNT_STATUSES.INACTIVE;
  }
  if (rawStatus === undefined || rawStatus === null) {
    return CANONICAL_ACCOUNT_STATUSES.ACTIVE;
  }
  if (typeof rawStatus !== 'string') {
    return CANONICAL_ACCOUNT_STATUSES.INACTIVE;
  }
  const normalized = rawStatus.trim().toLowerCase();
  if (normalized === '') {
    return CANONICAL_ACCOUNT_STATUSES.ACTIVE;
  }
  if (KNOWN_ACCOUNT_STATUS_SET.has(normalized)) {
    return normalized;
  }
  return CANONICAL_ACCOUNT_STATUSES.INACTIVE;
}

function isAccountStatusActive(rawStatus, options = {}) {
  return normalizeAccountStatus(rawStatus, options) === CANONICAL_ACCOUNT_STATUSES.ACTIVE;
}

module.exports = Object.freeze({
  CANONICAL_ACCOUNT_STATUSES,
  KNOWN_ACCOUNT_STATUS_SET,
  INACTIVE_ACCOUNT_STATUSES,
  normalizeAccountStatus,
  isAccountStatusActive
});
