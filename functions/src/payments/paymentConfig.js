'use strict';

const {
  INTERNAL_SCALE,
  USDT_DECIMALS,
  parseUsdtToInternal,
  roundInternalToUsdt6
} = require('../shared/money');

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const EVM_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_ALL_ONES_PATTERN = /^1+$/;
const POSITIVE_INT_PATTERN = /^\d+$/;
const POSITIVE_DECIMAL_OR_SCI_PATTERN = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
const MAX_SPOT_EXPONENT = 30;

const DEFAULT_INTENT_TTL_MS = 15 * 60 * 1000;
const MIN_INTENT_TTL_MS = 5 * 60 * 1000;
const MAX_INTENT_TTL_MS = 60 * 60 * 1000;

// Canonical status machine: CONFIRMED is strictly forbidden to prevent premature onPurchaseSettled triggers (SCRUM-229).
const PAYMENT_STATUSES = Object.freeze({
  OPEN: 'OPEN',
  AWAITING: 'AWAITING',
  PROCESSING: 'PROCESSING',
  SETTLED: 'SETTLED',
  UNDERPAID: 'UNDERPAID',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
});

const NON_SETTLED_ACTIVE_STATUSES = Object.freeze([
  PAYMENT_STATUSES.OPEN,
  PAYMENT_STATUSES.AWAITING,
  PAYMENT_STATUSES.PROCESSING
]);

const CANCELLABLE_STATUSES = Object.freeze([
  PAYMENT_STATUSES.OPEN,
  PAYMENT_STATUSES.AWAITING
]);

const SUPPORTED_PRODUCT_TYPES = Object.freeze(['miner', 'subscription']);

const TREASURY_ENV_BY_FAMILY = Object.freeze({
  evm: 'TREASURY_EVM_ADDRESS',
  solana: 'TREASURY_SOLANA_ADDRESS'
});

// Verbatim canonical custom miner tiers observed in src/data/seedManifest.ts & src/minerCatalog.ts.
const CANONICAL_CUSTOM_MINER_TIERS = Object.freeze([
  Object.freeze({ powerTh: 1, priceUsd: 12.99 }),
  Object.freeze({ powerTh: 2, priceUsd: 24.99 }),
  Object.freeze({ powerTh: 4, priceUsd: 49.99 }),
  Object.freeze({ powerTh: 8, priceUsd: 99.99 }),
  Object.freeze({ powerTh: 16, priceUsd: 189.99 }),
  Object.freeze({ powerTh: 32, priceUsd: 379.99 }),
  Object.freeze({ powerTh: 42.44, priceUsd: 499.99 }),
  Object.freeze({ powerTh: 64, priceUsd: 759.99 }),
  Object.freeze({ powerTh: 96, priceUsd: 1139.99 }),
  Object.freeze({ powerTh: 128, priceUsd: 1519.99 }),
  Object.freeze({ powerTh: 192, priceUsd: 2279.99 }),
  Object.freeze({ powerTh: 256, priceUsd: 3039.99 }),
  Object.freeze({ powerTh: 384, priceUsd: 4559.99 }),
  Object.freeze({ powerTh: 512, priceUsd: 6079.99 }),
  Object.freeze({ powerTh: 768, priceUsd: 9119.99 }),
  Object.freeze({ powerTh: 1024, priceUsd: 12159.99 }),
  Object.freeze({ powerTh: 1536, priceUsd: 18239.99 }),
  Object.freeze({ powerTh: 2048, priceUsd: 24319.99 }),
  Object.freeze({ powerTh: 2560, priceUsd: 30399.99 }),
  Object.freeze({ powerTh: 3584, priceUsd: 42559.99 }),
  Object.freeze({ powerTh: 4096, priceUsd: 48639.99 }),
  Object.freeze({ powerTh: 5000, priceUsd: 54768.99 })
]);

const NETWORK_CATALOG = Object.freeze({
  bsc: Object.freeze({
    id: 'bsc',
    family: 'evm',
    recommended: true,
    requiredConfirmations: 15,
    commitment: null,
    featureFlagEnv: null,
    modes: Object.freeze({
      mainnet: Object.freeze({ chainId: 56, explorerBaseUrl: 'https://bscscan.com', explorerQuery: '' }),
      testnet: Object.freeze({ chainId: 97, explorerBaseUrl: 'https://testnet.bscscan.com', explorerQuery: '' })
    }),
    assets: Object.freeze({
      USDT: Object.freeze({
        symbol: 'USDT',
        decimals: 18,
        isNative: false,
        mainnetContract: '0x55d398326f99059fF775485246999027B3197955',
        testnetContractEnv: 'PAYMENT_TESTNET_USDT_BSC_CONTRACT'
      }),
      BNB: Object.freeze({
        symbol: 'BNB',
        decimals: 18,
        isNative: true,
        mainnetContract: null,
        testnetContractEnv: null
      })
    })
  }),
  polygon: Object.freeze({
    id: 'polygon',
    family: 'evm',
    recommended: true,
    requiredConfirmations: 64,
    commitment: null,
    featureFlagEnv: null,
    modes: Object.freeze({
      mainnet: Object.freeze({ chainId: 137, explorerBaseUrl: 'https://polygonscan.com', explorerQuery: '' }),
      testnet: Object.freeze({ chainId: 80002, explorerBaseUrl: 'https://amoy.polygonscan.com', explorerQuery: '' })
    }),
    assets: Object.freeze({
      USDT: Object.freeze({
        symbol: 'USDT',
        decimals: 6,
        isNative: false,
        mainnetContract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        testnetContractEnv: 'PAYMENT_TESTNET_USDT_POLYGON_CONTRACT'
      }),
      POL: Object.freeze({
        symbol: 'POL',
        decimals: 18,
        isNative: true,
        mainnetContract: null,
        testnetContractEnv: null
      })
    })
  }),
  ethereum: Object.freeze({
    id: 'ethereum',
    family: 'evm',
    recommended: false,
    requiredConfirmations: 12,
    commitment: null,
    featureFlagEnv: 'PAYMENT_ENABLE_ETHEREUM',
    modes: Object.freeze({
      mainnet: Object.freeze({ chainId: 1, explorerBaseUrl: 'https://etherscan.io', explorerQuery: '' }),
      testnet: Object.freeze({ chainId: 11155111, explorerBaseUrl: 'https://sepolia.etherscan.io', explorerQuery: '' })
    }),
    assets: Object.freeze({
      USDT: Object.freeze({
        symbol: 'USDT',
        decimals: 6,
        isNative: false,
        mainnetContract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        testnetContractEnv: 'PAYMENT_TESTNET_USDT_ETHEREUM_CONTRACT'
      }),
      ETH: Object.freeze({
        symbol: 'ETH',
        decimals: 18,
        isNative: true,
        mainnetContract: null,
        testnetContractEnv: null
      })
    })
  }),
  solana: Object.freeze({
    id: 'solana',
    family: 'solana',
    recommended: true,
    requiredConfirmations: 1,
    commitment: 'finalized',
    featureFlagEnv: null,
    modes: Object.freeze({
      mainnet: Object.freeze({ chainId: 'solana-mainnet', explorerBaseUrl: 'https://solscan.io', explorerQuery: '' }),
      testnet: Object.freeze({ chainId: 'solana-devnet', explorerBaseUrl: 'https://solscan.io', explorerQuery: '?cluster=devnet' })
    }),
    assets: Object.freeze({
      USDT: Object.freeze({
        symbol: 'USDT',
        decimals: 6,
        isNative: false,
        mainnetContract: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        testnetContractEnv: 'PAYMENT_TESTNET_USDT_SOLANA_MINT'
      }),
      SOL: Object.freeze({
        symbol: 'SOL',
        decimals: 9,
        isNative: true,
        mainnetContract: null,
        testnetContractEnv: null
      })
    })
  })
});

class PaymentConfigError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'PaymentConfigError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function isValidEvmAddress(address) {
  if (typeof address !== 'string') return false;
  const trimmed = address.trim();
  return EVM_ADDRESS_PATTERN.test(trimmed) && trimmed.toLowerCase() !== EVM_ZERO_ADDRESS;
}

function isValidSolanaAddress(address) {
  if (typeof address !== 'string') return false;
  const trimmed = address.trim();
  return SOLANA_ADDRESS_PATTERN.test(trimmed) && !SOLANA_ALL_ONES_PATTERN.test(trimmed);
}

function isAddressValidForFamily(address, family) {
  if (family === 'evm') return isValidEvmAddress(address);
  if (family === 'solana') return isValidSolanaAddress(address);
  return false;
}

function validateWalletAddress(address, family) {
  if (!isAddressValidForFamily(address, family)) {
    throw new PaymentConfigError(
      'INVALID_WALLET_ADDRESS',
      `Invalid ${family} wallet address`
    );
  }
  return address.trim();
}

function resolveNetworkMode(env = process.env) {
  const raw = env && env.PAYMENT_NETWORK_MODE;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return 'testnet';
  }
  const normalized = String(raw).trim().toLowerCase();
  if (normalized !== 'testnet' && normalized !== 'mainnet') {
    throw new PaymentConfigError(
      'INVALID_NETWORK_MODE',
      `Unsupported PAYMENT_NETWORK_MODE: ${raw}. Expected 'testnet' or 'mainnet'.`,
      500
    );
  }
  return normalized;
}

function resolveIntentTtlMs(env = process.env) {
  const raw = env && env.PAYMENT_INTENT_TTL_MINUTES;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_INTENT_TTL_MS;
  }
  const trimmed = String(raw).trim();
  if (!POSITIVE_INT_PATTERN.test(trimmed)) {
    throw new PaymentConfigError(
      'INVALID_INTENT_TTL',
      `PAYMENT_INTENT_TTL_MINUTES must be an integer between 5 and 60 (received: ${raw})`,
      500
    );
  }
  const ttlMs = Number(trimmed) * 60 * 1000;
  if (ttlMs < MIN_INTENT_TTL_MS || ttlMs > MAX_INTENT_TTL_MS) {
    throw new PaymentConfigError(
      'INVALID_INTENT_TTL',
      `PAYMENT_INTENT_TTL_MINUTES must be between 5 and 60 (received: ${raw})`,
      500
    );
  }
  return ttlMs;
}

function resolveTreasuryAddress(family, env = process.env) {
  const envKey = typeof family === 'string' && Object.hasOwn(TREASURY_ENV_BY_FAMILY, family)
    ? TREASURY_ENV_BY_FAMILY[family]
    : null;
  if (!envKey) {
    throw new PaymentConfigError('UNSUPPORTED_NETWORK_FAMILY', `Unsupported network family: ${family}`, 500);
  }
  const raw = env && env[envKey];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new PaymentConfigError(
      'TREASURY_NOT_CONFIGURED',
      `Missing required treasury environment variable: ${envKey}`,
      500
    );
  }
  const trimmed = String(raw).trim();
  if (!isAddressValidForFamily(trimmed, family)) {
    throw new PaymentConfigError(
      'INVALID_TREASURY_ADDRESS',
      `Invalid ${family} treasury address in ${envKey}`,
      500
    );
  }
  return trimmed;
}

function resolvePaymentRoute({ networkId, assetSymbol, env = process.env }) {
  const networkMode = resolveNetworkMode(env);
  const cleanNetwork = typeof networkId === 'string' ? networkId.trim().toLowerCase() : '';
  const network = Object.hasOwn(NETWORK_CATALOG, cleanNetwork) ? NETWORK_CATALOG[cleanNetwork] : null;
  if (!network) {
    throw new PaymentConfigError('UNSUPPORTED_NETWORK', `Unsupported payment network: ${networkId}`);
  }

  if (network.featureFlagEnv) {
    const enabled = String((env && env[network.featureFlagEnv]) || '').trim().toLowerCase() === 'true';
    if (!enabled) {
      throw new PaymentConfigError(
        'NETWORK_DISABLED',
        `Network '${network.id}' is disabled (set ${network.featureFlagEnv}=true to enable)`,
        403
      );
    }
  }

  const cleanAsset = typeof assetSymbol === 'string' ? assetSymbol.trim().toUpperCase() : '';
  const asset = Object.hasOwn(network.assets, cleanAsset) ? network.assets[cleanAsset] : null;
  if (!asset) {
    throw new PaymentConfigError(
      'UNSUPPORTED_ASSET',
      `Asset '${assetSymbol}' is not supported on network '${network.id}'`
    );
  }

  const treasuryAddress = resolveTreasuryAddress(network.family, env);
  const modeSpec = network.modes[networkMode];

  let tokenContractAddress = null;
  if (!asset.isNative) {
    if (networkMode === 'mainnet') {
      tokenContractAddress = asset.mainnetContract;
    } else {
      const rawContract = env && env[asset.testnetContractEnv];
      if (rawContract === undefined || rawContract === null || String(rawContract).trim() === '') {
        throw new PaymentConfigError(
          'TOKEN_CONTRACT_NOT_CONFIGURED',
          `Missing testnet token contract env ${asset.testnetContractEnv} for ${asset.symbol} on ${network.id}`,
          500
        );
      }
      const trimmedContract = String(rawContract).trim();
      if (!isAddressValidForFamily(trimmedContract, network.family)) {
        throw new PaymentConfigError(
          'INVALID_TOKEN_CONTRACT',
          `Invalid testnet token contract address in ${asset.testnetContractEnv}`,
          500
        );
      }
      tokenContractAddress = trimmedContract;
    }
  }

  return Object.freeze({
    networkMode,
    networkId: network.id,
    family: network.family,
    chainId: modeSpec.chainId,
    explorerBaseUrl: modeSpec.explorerBaseUrl,
    explorerQuery: modeSpec.explorerQuery,
    recommended: network.recommended,
    requiredConfirmations: network.requiredConfirmations,
    commitment: network.commitment,
    assetSymbol: asset.symbol,
    assetDecimals: asset.decimals,
    isNative: asset.isNative,
    tokenContractAddress,
    treasuryAddress
  });
}

function formatAtomicToDecimal(amountAtomic, assetDecimals) {
  if (typeof amountAtomic !== 'bigint' || amountAtomic < 0n) {
    throw new PaymentConfigError('INVALID_AMOUNT', 'amountAtomic must be a non-negative BigInt');
  }
  if (!Number.isInteger(assetDecimals) || assetDecimals < 0 || assetDecimals > 18) {
    throw new PaymentConfigError('INVALID_ASSET_DECIMALS', `Invalid assetDecimals: ${assetDecimals}`);
  }
  if (assetDecimals === 0) {
    return amountAtomic.toString();
  }
  const scale = 10n ** BigInt(assetDecimals);
  const whole = amountAtomic / scale;
  const rawFrac = (amountAtomic % scale).toString().padStart(assetDecimals, '0');
  const trimmedFrac = rawFrac.replace(/0+$/, '');
  const minFracLen = Math.min(2, assetDecimals);
  const frac = trimmedFrac.length >= minFracLen ? trimmedFrac : rawFrac.slice(0, minFracLen);
  return `${whole}.${frac}`;
}

function parsePositiveInternal(value, errorCode, label) {
  if (value === null || value === undefined) {
    throw new PaymentConfigError(errorCode, `${label} must be a positive finite decimal`);
  }
  const normalized = typeof value === 'string' ? value.trim() : value;
  let internal;
  try {
    internal = parseUsdtToInternal(normalized);
  } catch {
    throw new PaymentConfigError(errorCode, `${label} must be a positive finite decimal: ${value}`);
  }
  if (internal <= 0n) {
    throw new PaymentConfigError(errorCode, `${label} must be greater than zero: ${value}`);
  }
  return internal;
}

function parsePositiveSpotPrice(value) {
  let raw;
  if (typeof value === 'string') {
    raw = value.trim();
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      throw new PaymentConfigError('INVALID_SPOT_PRICE', `spotPriceUsd must be a positive finite decimal: ${value}`);
    }
    raw = String(value);
  } else {
    throw new PaymentConfigError('INVALID_SPOT_PRICE', `spotPriceUsd must be a positive finite decimal: ${value}`);
  }

  const match = POSITIVE_DECIMAL_OR_SCI_PATTERN.exec(raw);
  if (!match) {
    throw new PaymentConfigError('INVALID_SPOT_PRICE', `spotPriceUsd must be a positive finite decimal: ${value}`);
  }

  const intPart = match[1];
  const fracPart = match[2] || '';
  const exp = match[3] ? Number(match[3]) : 0;
  if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_SPOT_EXPONENT) {
    throw new PaymentConfigError('INVALID_SPOT_PRICE', `spotPriceUsd exponent out of bounds: ${value}`);
  }

  const digits = BigInt(`${intPart}${fracPart}`);
  if (digits <= 0n) {
    throw new PaymentConfigError('INVALID_SPOT_PRICE', `spotPriceUsd must be greater than zero: ${value}`);
  }

  const netExp = exp - fracPart.length;
  const numerator = netExp >= 0 ? digits * (10n ** BigInt(netExp)) : digits;
  const denominator = netExp < 0 ? 10n ** BigInt(-netExp) : 1n;
  return { numerator, denominator, raw };
}

function convertUsdToAtomic({ amountUsd, assetDecimals, spotPriceUsd }) {
  if (!Number.isInteger(assetDecimals) || assetDecimals < 0 || assetDecimals > 18) {
    throw new PaymentConfigError('INVALID_ASSET_DECIMALS', `Invalid assetDecimals: ${assetDecimals}`);
  }

  const amountInternal = parsePositiveInternal(amountUsd, 'INVALID_AMOUNT', 'amountUsd');
  const spot = parsePositiveSpotPrice(spotPriceUsd);
  const { microUsdt, usdt6 } = roundInternalToUsdt6(amountInternal);

  let amountAtomic;
  if (spot.numerator === spot.denominator && assetDecimals >= USDT_DECIMALS) {
    amountAtomic = microUsdt * (10n ** BigInt(assetDecimals - USDT_DECIMALS));
  } else {
    const numerator = amountInternal * spot.denominator * (10n ** BigInt(assetDecimals));
    const denominator = INTERNAL_SCALE * spot.numerator;
    // Exact BigInt ceiling (ROUND_UP) prevents underpayment from truncation on native assets.
    amountAtomic = (numerator + denominator - 1n) / denominator;
  }

  return Object.freeze({
    amountInternal: amountInternal.toString(),
    amountMicroUsdt: microUsdt.toString(),
    netPaidUsdt: usdt6,
    expectedAmountAtomic: amountAtomic.toString(),
    expectedAmountDisplay: formatAtomicToDecimal(amountAtomic, assetDecimals),
    quotedSpotUsd: spot.raw
  });
}

module.exports = Object.freeze({
  PaymentConfigError,
  PAYMENT_STATUSES,
  NON_SETTLED_ACTIVE_STATUSES,
  CANCELLABLE_STATUSES,
  SUPPORTED_PRODUCT_TYPES,
  DEFAULT_INTENT_TTL_MS,
  MIN_INTENT_TTL_MS,
  MAX_INTENT_TTL_MS,
  CANONICAL_CUSTOM_MINER_TIERS,
  NETWORK_CATALOG,
  isValidEvmAddress,
  isValidSolanaAddress,
  validateWalletAddress,
  resolveNetworkMode,
  resolveIntentTtlMs,
  resolveTreasuryAddress,
  resolvePaymentRoute,
  formatAtomicToDecimal,
  convertUsdToAtomic
});
