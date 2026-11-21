'use strict';

const INTERNAL_DECIMALS = 8;
const INTERNAL_SCALE = 100_000_000n;
const USDT_DECIMALS = 6;
const USDT_SCALE = 1_000_000n;
const INTERNAL_TO_USDT6_FACTOR = 100n;
const ROUNDING_POLICY = 'ROUND_DOWN';

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;
const SCI_NEG_PATTERN = /^(\d+)(?:\.(\d+))?e-(\d+)$/;

function assertNonNegativeBigInt(value, label) {
  if (typeof value !== 'bigint' || value < 0n) {
    throw new RangeError(`${label} must be a non-negative BigInt`);
  }
}

function parseUsdtToInternal(value) {
  let raw;
  if (typeof value === 'string') {
    raw = value;
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`Invalid numeric amount: ${value}`);
    }
    raw = String(value);
    const sci = SCI_NEG_PATTERN.exec(raw);
    if (sci) {
      const exp = Number(sci[3]);
      const fracPart = sci[2] || '';
      if (exp + fracPart.length > INTERNAL_DECIMALS) {
        throw new RangeError(`Decimal precision exceeds ${INTERNAL_DECIMALS} digits: ${raw}`);
      }
      raw = `0.${'0'.repeat(exp - sci[1].length)}${sci[1]}${fracPart}`;
    }
  } else {
    throw new TypeError(`Amount must be a decimal string or finite non-negative number`);
  }

  const match = DECIMAL_PATTERN.exec(raw);
  if (!match) {
    throw new RangeError(`Malformed decimal amount: ${raw}`);
  }

  const frac = match[2] || '';
  if (frac.length > INTERNAL_DECIMALS) {
    throw new RangeError(`Decimal precision exceeds ${INTERNAL_DECIMALS} digits: ${raw}`);
  }

  return BigInt(match[1]) * INTERNAL_SCALE + BigInt(frac.padEnd(INTERNAL_DECIMALS, '0'));
}

function parseRateToInternal(value) {
  const rate = parseUsdtToInternal(value);
  if (rate > INTERNAL_SCALE) {
    throw new RangeError(`Rate must be within [0, 1]: ${value}`);
  }
  return rate;
}

function roundInternalToUsdt6(internalAmount) {
  assertNonNegativeBigInt(internalAmount, 'internalAmount');
  const microUsdt = internalAmount / INTERNAL_TO_USDT6_FACTOR;
  const amountInternal = microUsdt * INTERNAL_TO_USDT6_FACTOR;
  const whole = microUsdt / USDT_SCALE;
  const frac = (microUsdt % USDT_SCALE).toString().padStart(USDT_DECIMALS, '0');

  return {
    amountInternal,
    microUsdt,
    usdt6: `${whole}.${frac}`,
    roundingResidualInternal: internalAmount - amountInternal
  };
}

function formatInternalToUsdt6(internalAmount) {
  return roundInternalToUsdt6(internalAmount).usdt6;
}

function formatInternal(internalAmount) {
  assertNonNegativeBigInt(internalAmount, 'internalAmount');
  const whole = internalAmount / INTERNAL_SCALE;
  const frac = (internalAmount % INTERNAL_SCALE).toString().padStart(INTERNAL_DECIMALS, '0');
  return `${whole}.${frac}`;
}

function mulInternalRoundDown(amountInternal, rateInternal) {
  assertNonNegativeBigInt(amountInternal, 'amountInternal');
  assertNonNegativeBigInt(rateInternal, 'rateInternal');
  return (amountInternal * rateInternal) / INTERNAL_SCALE;
}

function mulRateRoundDown(amountInternal, rateInternal) {
  const exactInternal = mulInternalRoundDown(amountInternal, rateInternal);
  const rounded = roundInternalToUsdt6(exactInternal);
  return {
    exactInternal,
    ...rounded
  };
}

module.exports = Object.freeze({
  INTERNAL_DECIMALS,
  INTERNAL_SCALE,
  USDT_DECIMALS,
  USDT_SCALE,
  INTERNAL_TO_USDT6_FACTOR,
  ROUNDING_POLICY,
  parseUsdtToInternal,
  parseRateToInternal,
  roundInternalToUsdt6,
  formatInternalToUsdt6,
  formatInternal,
  mulRateRoundDown,
  mulInternalRoundDown
});
