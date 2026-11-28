'use strict';

const crypto = require('node:crypto');

const { parseUsdtToInternal, roundInternalToUsdt6 } = require('../shared/money');
const {
  PaymentConfigError,
  PAYMENT_STATUSES,
  CANCELLABLE_STATUSES,
  SUPPORTED_PRODUCT_TYPES,
  CANONICAL_CUSTOM_MINER_TIERS,
  resolveNetworkMode,
  resolveIntentTtlMs,
  validateWalletAddress,
  resolvePaymentRoute,
  convertUsdToAtomic
} = require('./paymentConfig');

const CANCELLABLE_STATUS_SET = new Set(CANCELLABLE_STATUSES);
const SELECTABLE_METHOD_STATUS_SET = new Set([PAYMENT_STATUSES.OPEN, PAYMENT_STATUSES.AWAITING]);
const PRODUCT_TYPE_SET = new Set(SUPPORTED_PRODUCT_TYPES);
const CUSTOM_TIER_BY_POWER = new Map(
  CANONICAL_CUSTOM_MINER_TIERS.map((tier) => [tier.powerTh, tier])
);
const SAFE_DOC_ID_PATTERN = /^[a-zA-Z0-9_.:@-]+$/;
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;
const MAX_CANCEL_REASON_LENGTH = 200;
const DEFAULT_SPOT_TIMEOUT_MS = 5000;
const DEFAULT_SPOT_CACHE_TTL_MS = 45000;
const MAX_SPOT_CACHE_TTL_MS = 300000;
const DEFAULT_COINBASE_SPOT_BASE_URL = 'https://api.coinbase.com/v2/prices';
const DEFAULT_KRAKEN_TICKER_URL = 'https://api.kraken.com/0/public/Ticker';

const COINGECKO_ID_BY_SYMBOL = Object.freeze({
  BNB: 'binancecoin',
  ETH: 'ethereum',
  POL: 'polygon-ecosystem-token',
  SOL: 'solana',
  TRX: 'tron',
  AVAX: 'avalanche-2'
});

const COINBASE_PAIR_BY_SYMBOL = Object.freeze({
  BNB: 'BNB-USD',
  ETH: 'ETH-USD',
  POL: 'POL-USD',
  SOL: 'SOL-USD',
  TRX: 'TRX-USD',
  AVAX: 'AVAX-USD'
});

const KRAKEN_PAIR_BY_SYMBOL = Object.freeze({
  ETH: 'ETHUSD',
  SOL: 'SOLUSD',
  POL: 'POLUSD',
  AVAX: 'AVAXUSD',
  TRX: 'TRXUSD',
  BNB: 'BNBUSD'
});

class PaymentIntentError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'PaymentIntentError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function snapExists(snap) {
  if (!snap) return false;
  return typeof snap.exists === 'function' ? Boolean(snap.exists()) : Boolean(snap.exists);
}

function snapData(snap) {
  if (!snap) return undefined;
  return typeof snap.data === 'function' ? snap.data() : snap.data;
}

function toIsoOrNull(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed || null;
  }
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
  }
  if (typeof raw === 'object' && typeof raw.toDate === 'function') {
    const d = raw.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }
  return null;
}

function resolveCustomMinerPrice(powerTh) {
  if (typeof powerTh !== 'number' || !Number.isFinite(powerTh) || powerTh <= 0) {
    throw new PaymentIntentError('INVALID_POWER_TH', `powerTh must be a positive finite number (received: ${powerTh})`);
  }
  const tier = CUSTOM_TIER_BY_POWER.get(powerTh);
  if (!tier) {
    throw new PaymentIntentError(
      'INVALID_POWER_TH',
      `powerTh=${powerTh} is not a supported canonical custom miner tier`
    );
  }
  return Object.freeze({
    packageId: `custom-${tier.powerTh}th`,
    packageName: `Custom ${tier.powerTh} TH`,
    powerTh: tier.powerTh,
    efficiencyWattsPerTh: 15,
    priceUsd: tier.priceUsd
  });
}

function parseSpotCacheTtlMs(raw) {
  if (typeof raw !== 'number' && (typeof raw !== 'string' || raw.trim() === '')) {
    return null;
  }
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= MAX_SPOT_CACHE_TTL_MS ? n : null;
}

function parsePositiveUsd(raw) {
  if (typeof raw !== 'number' && (typeof raw !== 'string' || raw.trim() === '')) {
    return null;
  }
  const usd = typeof raw === 'number' ? raw : Number(raw);
  return typeof usd === 'number' && Number.isFinite(usd) && usd > 0 ? usd : null;
}

function createDefaultSpotPriceProvider({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_SPOT_TIMEOUT_MS,
  cacheTtlMs,
  now = Date.now
} = {}) {
  const baseUrl =
    (env && env.PAYMENT_SPOT_PRICE_API_URL) ||
    'https://api.coingecko.com/api/v3/simple/price';
  const effectiveCacheTtlMs =
    parseSpotCacheTtlMs(cacheTtlMs) ??
    parseSpotCacheTtlMs(env && env.PAYMENT_SPOT_CACHE_TTL_MS) ??
    DEFAULT_SPOT_CACHE_TTL_MS;
  const cache = new Map();
  const inFlight = new Map();

  async function fetchJsonWithTimeout(url) {
    const fetchOpts = { method: 'GET', headers: { accept: 'application/json' } };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      fetchOpts.signal = AbortSignal.timeout(timeoutMs);
    }
    const res = await fetchImpl(url, fetchOpts);
    if (!res || !res.ok) {
      throw new Error(`HTTP ${res ? res.status : 'UNKNOWN'}`);
    }
    return res.json();
  }

  async function querySpotProviders(symbol, coinId) {
    const attempts = [
      {
        name: 'coingecko',
        source: 'COINGECKO_SIMPLE_PRICE',
        url: `${baseUrl}?ids=${encodeURIComponent(coinId)}&vs_currencies=usd`,
        extractUsd(body) {
          const raw =
            body && typeof body === 'object' && Object.hasOwn(body, coinId) && body[coinId]
              ? body[coinId].usd
              : undefined;
          return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
        }
      }
    ];
    if (Object.hasOwn(COINBASE_PAIR_BY_SYMBOL, symbol)) {
      attempts.push({
        name: 'coinbase',
        source: 'COINBASE_SPOT',
        url: `${DEFAULT_COINBASE_SPOT_BASE_URL}/${encodeURIComponent(COINBASE_PAIR_BY_SYMBOL[symbol])}/spot`,
        extractUsd(body) {
          return parsePositiveUsd(body && typeof body === 'object' && body.data ? body.data.amount : undefined);
        }
      });
    }
    if (Object.hasOwn(KRAKEN_PAIR_BY_SYMBOL, symbol)) {
      attempts.push({
        name: 'kraken',
        source: 'KRAKEN_TICKER',
        url: `${DEFAULT_KRAKEN_TICKER_URL}?pair=${encodeURIComponent(KRAKEN_PAIR_BY_SYMBOL[symbol])}`,
        extractUsd(body) {
          if (!body || typeof body !== 'object' || !Array.isArray(body.error) || body.error.length !== 0) {
            return null;
          }
          const resultObj = body.result;
          if (!resultObj || typeof resultObj !== 'object' || Array.isArray(resultObj)) {
            return null;
          }
          const firstKey = Object.keys(resultObj)[0];
          const ticker = firstKey ? resultObj[firstKey] : null;
          return parsePositiveUsd(ticker && Array.isArray(ticker.c) ? ticker.c[0] : undefined);
        }
      });
    }

    const failures = [];
    for (const attempt of attempts) {
      try {
        const body = await fetchJsonWithTimeout(attempt.url);
        const usd = attempt.extractUsd(body);
        if (usd !== null) {
          return { priceUsd: String(usd), source: attempt.source };
        }
        failures.push(`${attempt.name}: invalid price`);
      } catch (err) {
        failures.push(`${attempt.name}: ${err && err.message ? err.message : String(err)}`);
      }
    }

    throw new PaymentIntentError(
      'SPOT_PRICE_UNAVAILABLE',
      `All spot price providers failed for ${symbol} (${failures.join('; ')})`,
      503
    );
  }

  return async function defaultSpotPriceProvider({ assetSymbol } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new PaymentIntentError('SPOT_PRICE_UNAVAILABLE', 'No fetch implementation available for spot quotes', 503);
    }
    const symbol = String(assetSymbol || '').trim().toUpperCase();
    const coinId = Object.hasOwn(COINGECKO_ID_BY_SYMBOL, symbol) ? COINGECKO_ID_BY_SYMBOL[symbol] : null;
    if (!coinId) {
      throw new PaymentIntentError('SPOT_PRICE_UNAVAILABLE', `No spot price mapping for asset: ${symbol}`, 400);
    }

    const cached = cache.get(symbol);
    if (cached) {
      if (now() < cached.expiresAtMs) {
        return { priceUsd: cached.priceUsd, source: cached.source };
      }
      cache.delete(symbol);
    }

    let pending = inFlight.get(symbol);
    if (!pending) {
      pending = (async () => {
        try {
          const quote = await querySpotProviders(symbol, coinId);
          if (effectiveCacheTtlMs > 0) {
            cache.set(symbol, {
              priceUsd: quote.priceUsd,
              source: quote.source,
              expiresAtMs: now() + effectiveCacheTtlMs
            });
          }
          return quote;
        } finally {
          inFlight.delete(symbol);
        }
      })();
      inFlight.set(symbol, pending);
    }

    const resolved = await pending;
    return { priceUsd: resolved.priceUsd, source: resolved.source };
  };
}

function assertPlainObject(rawInput, fnName) {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    throw new PaymentIntentError('INVALID_INPUT', `${fnName} input must be a plain object`);
  }
}

function isValidDocId(value) {
  return typeof value === 'string' && value.length > 0 && value !== '.' && value !== '..' && SAFE_DOC_ID_PATTERN.test(value);
}

function assertValidDocId(value, code, label) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!isValidDocId(clean)) {
    throw new PaymentIntentError(code, `${label} must be a valid single-segment identifier`);
  }
  return clean;
}

function resolveActorUid(requesterUid, isAdmin) {
  if (typeof isAdmin !== 'boolean') {
    throw new PaymentIntentError('INVALID_INPUT', 'isAdmin must be a boolean');
  }
  const clean = typeof requesterUid === 'string' ? requesterUid.trim() : '';
  if (!clean && isAdmin !== true) {
    throw new PaymentIntentError('INVALID_REQUESTER_UID', 'requesterUid is required', 401);
  }
  return clean;
}

function normalizeCancelReason(reason) {
  if (reason === undefined || reason === null) {
    return 'USER_CANCELLED';
  }
  if (typeof reason !== 'string') {
    throw new PaymentIntentError('INVALID_CANCEL_REASON', 'cancel reason must be a string');
  }
  if (CONTROL_CHAR_PATTERN.test(reason)) {
    throw new PaymentIntentError('INVALID_CANCEL_REASON', 'cancel reason must not contain control characters');
  }
  if (reason.length > MAX_CANCEL_REASON_LENGTH) {
    throw new PaymentIntentError(
      'INVALID_CANCEL_REASON',
      `cancel reason must be at most ${MAX_CANCEL_REASON_LENGTH} characters`
    );
  }
  return reason.trim() || 'USER_CANCELLED';
}

function assertSenderWalletStringOrEmpty(senderWallet) {
  if (senderWallet === undefined || senderWallet === null) {
    return null;
  }
  if (typeof senderWallet !== 'string') {
    throw new PaymentConfigError('INVALID_WALLET_ADDRESS', 'senderWallet must be a string');
  }
  const trimmed = senderWallet.trim();
  return trimmed || null;
}

function normalizeOptionalIdempotencyKey(rawKey) {
  if (rawKey === undefined || rawKey === null) {
    return null;
  }
  if (typeof rawKey !== 'string' || CONTROL_CHAR_PATTERN.test(rawKey)) {
    throw new PaymentIntentError(
      'INVALID_IDEMPOTENCY_KEY',
      'idempotencyKey must be a valid string without control characters',
      400
    );
  }
  const trimmed = rawKey.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(trimmed)) {
    throw new PaymentIntentError(
      'INVALID_IDEMPOTENCY_KEY',
      'idempotencyKey must be 8-128 characters matching /^[a-zA-Z0-9._:-]{8,128}$/',
      400
    );
  }
  return trimmed;
}

function deriveIdempotentIntentId(buyerUid, cleanKey) {
  const digest = crypto
    .createHash('sha256')
    .update(`${buyerUid}:${cleanKey}`)
    .digest('hex')
    .slice(0, 32);
  return `pi_${digest}`;
}

function assertIdempotentPayloadMatches(existing, buyerUid, product, amountMicroUsdtStr) {
  if (!existing || existing.buyerUid !== buyerUid) {
    throw new PaymentIntentError(
      'FORBIDDEN',
      'Not authorized to access this payment intent',
      403
    );
  }
  const existingPackageId = existing.packageId ?? null;
  const expectedPackageId = product.packageId ?? null;
  const existingPowerTh = Number(existing.powerTh ?? 0);
  const expectedPowerTh = Number(product.powerTh ?? 0);
  const existingMicroUsdt = String(existing.amountMicroUsdt ?? '');
  if (
    existing.productType !== product.productType ||
    existingPackageId !== expectedPackageId ||
    existingPowerTh !== expectedPowerTh ||
    existingMicroUsdt !== amountMicroUsdtStr
  ) {
    throw new PaymentIntentError(
      'IDEMPOTENCY_KEY_CONFLICT',
      'idempotencyKey was already used for a different product or amount',
      409
    );
  }
}

function extractCanonicalPackagePrice(pkgData) {
  if (typeof pkgData.priceUsdt === 'number' && Number.isFinite(pkgData.priceUsdt) && pkgData.priceUsdt > 0) {
    return pkgData.priceUsdt;
  }
  if (typeof pkgData.price === 'number' && Number.isFinite(pkgData.price) && pkgData.price > 0) {
    return pkgData.price;
  }
  if (Number.isInteger(pkgData.priceUsdCents) && pkgData.priceUsdCents > 0) {
    return pkgData.priceUsdCents / 100;
  }
  throw new PaymentIntentError('INVALID_PACKAGE_PRICE', 'Package does not define a valid positive canonical USD price', 500);
}

function createPaymentIntentService({
  db,
  env = process.env,
  now = () => Date.now(),
  spotPriceProvider,
  idGenerator,
  fetchImpl
} = {}) {
  if (!db || typeof db.collection !== 'function' || typeof db.runTransaction !== 'function') {
    throw new TypeError('db with collection() and runTransaction() is required');
  }

  const resolveSpotPrice = spotPriceProvider || createDefaultSpotPriceProvider({ env, fetchImpl, now });
  const generateId = idGenerator || (() => `pi_${crypto.randomUUID().replace(/-/g, '')}`);

  async function resolveAuthoritativeProduct({ requestedProductType, packageId, powerTh }) {
    if (requestedProductType !== undefined && requestedProductType !== null) {
      if (typeof requestedProductType !== 'string' || !PRODUCT_TYPE_SET.has(requestedProductType.trim())) {
        throw new PaymentIntentError(
          'UNSUPPORTED_PRODUCT_TYPE',
          `Unsupported productType: ${requestedProductType}`
        );
      }
    }
    const cleanRequestedType =
      typeof requestedProductType === 'string' ? requestedProductType.trim() : null;

    let cleanPackageId = null;
    if (packageId !== undefined && packageId !== null) {
      if (typeof packageId !== 'string') {
        throw new PaymentIntentError('INVALID_PACKAGE_ID', 'packageId must be a valid single-segment identifier');
      }
      if (packageId.trim() !== '') {
        cleanPackageId = assertValidDocId(packageId, 'INVALID_PACKAGE_ID', 'packageId');
      }
    }

    if (cleanPackageId) {
      const pkgSnap = await db.collection('commercial_packages').doc(cleanPackageId).get();
      if (!snapExists(pkgSnap)) {
        throw new PaymentIntentError('PACKAGE_NOT_FOUND', `Commercial package not found: ${cleanPackageId}`, 404);
      }
      const pkgData = snapData(pkgSnap) || {};
      const pkgStatus = pkgData.status || 'ACTIVE';
      const isPublished = pkgData.isPublished !== undefined ? pkgData.isPublished : pkgStatus === 'ACTIVE';
      if (pkgStatus !== 'ACTIVE' || isPublished === false) {
        throw new PaymentIntentError('PACKAGE_NOT_AVAILABLE', `Commercial package is unavailable: ${cleanPackageId}`, 404);
      }

      const isSubscription =
        pkgData.packageType === 'subscription' ||
        pkgData.section === 'mensual' ||
        pkgData.cadence === 'monthly' ||
        pkgData.productType === 'subscription';
      const resolvedProductType = isSubscription ? 'subscription' : 'miner';

      if (cleanRequestedType && cleanRequestedType !== resolvedProductType) {
        throw new PaymentIntentError(
          'PRODUCT_TYPE_MISMATCH',
          `Package '${cleanPackageId}' is a '${resolvedProductType}' product, not '${cleanRequestedType}'`
        );
      }

      if (pkgData.packageType === 'custom') {
        const custom = resolveCustomMinerPrice(powerTh);
        return {
          productType: 'miner',
          commissionEligible: true,
          packageId: cleanPackageId,
          packageName: custom.packageName,
          powerTh: custom.powerTh,
          efficiencyWattsPerTh: Number(pkgData.efficiencyWattsPerTh ?? pkgData.efficiency ?? custom.efficiencyWattsPerTh),
          amountUsd: custom.priceUsd
        };
      }

      return {
        productType: resolvedProductType,
        commissionEligible: resolvedProductType === 'miner',
        packageId: cleanPackageId,
        packageName: pkgData.name || pkgData.displayName || cleanPackageId,
        powerTh: Number(pkgData.powerTh) || 0,
        efficiencyWattsPerTh: Number(pkgData.efficiencyWattsPerTh ?? pkgData.efficiency ?? 15),
        amountUsd: extractCanonicalPackagePrice(pkgData)
      };
    }

    if (cleanRequestedType === 'subscription') {
      throw new PaymentIntentError('PACKAGE_REQUIRED', 'packageId is required for subscription purchases');
    }

    if (cleanRequestedType && cleanRequestedType !== 'miner') {
      throw new PaymentIntentError('UNSUPPORTED_PRODUCT_TYPE', `Unsupported productType: ${cleanRequestedType}`);
    }

    const custom = resolveCustomMinerPrice(powerTh);
    return {
      productType: 'miner',
      commissionEligible: true,
      packageId: custom.packageId,
      packageName: custom.packageName,
      powerTh: custom.powerTh,
      efficiencyWattsPerTh: custom.efficiencyWattsPerTh,
      amountUsd: custom.priceUsd
    };
  }

  async function resolveBuyerAndReferralSnapshot(buyerUid, createdAtMs, createdAtIso) {
    const buyerSnap = await db.collection('users').doc(buyerUid).get();
    const buyerData = snapExists(buyerSnap) ? (snapData(buyerSnap) || {}) : {};

    const userEmail = typeof buyerData.email === 'string' ? buyerData.email.trim() : '';
    const userName =
      (typeof buyerData.username === 'string' && buyerData.username.trim()) ||
      (typeof buyerData.displayName === 'string' && buyerData.displayName.trim()) ||
      (userEmail ? userEmail.split('@')[0] : buyerUid);

    let candidateSponsorUid = '';
    for (const field of ['sponsorUid', 'sponsorId', 'referredBy']) {
      if (typeof buyerData[field] === 'string' && buyerData[field].trim()) {
        candidateSponsorUid = buyerData[field].trim();
        break;
      }
    }

    if (!candidateSponsorUid && buyerData.referral && typeof buyerData.referral === 'object') {
      const refCode =
        typeof buyerData.referral.referrerBy === 'string' ? buyerData.referral.referrerBy.trim() : '';
      if (refCode) {
        const usersCol = db.collection('users');
        const normalizedCode = refCode.toUpperCase();
        let codeSnap = await usersCol.where('referral.referralCode', '==', normalizedCode).limit(1).get();
        if (codeSnap.empty && refCode !== normalizedCode) {
          codeSnap = await usersCol.where('referral.referralCode', '==', refCode).limit(1).get();
        }
        if (!codeSnap.empty) {
          candidateSponsorUid = codeSnap.docs[0].id;
        }
      }
    }

    let sponsorLinkedAt = toIsoOrNull(
      buyerData.sponsorLinkedAt ??
        buyerData.referredAt ??
        (buyerData.referral && (buyerData.referral.linkedAt ?? buyerData.referral.joinDate)) ??
        null
    );

    const linkedAtMs = sponsorLinkedAt ? Date.parse(sponsorLinkedAt) : Number.NaN;
    const isLinkedAfterIntent = !Number.isNaN(linkedAtMs) && linkedAtMs > createdAtMs;

    let sponsorUid = isValidDocId(candidateSponsorUid) ? candidateSponsorUid : null;
    if (!sponsorUid || sponsorUid === buyerUid || isLinkedAfterIntent) {
      sponsorUid = null;
      sponsorLinkedAt = null;
    }

    return {
      userEmail,
      userName,
      referralSnapshot: {
        sponsorUid,
        sponsorLinkedAt,
        referralSnapshotAt: createdAtIso,
        referralSnapshotLocked: true
      }
    };
  }

  async function resolveRouteAndQuote({ networkId, assetSymbol, senderWallet, amountUsd, quotedAtIso }) {
    const route = resolvePaymentRoute({ networkId, assetSymbol, env });
    const rawSenderWallet = assertSenderWalletStringOrEmpty(senderWallet);
    const cleanSenderWallet = rawSenderWallet
      ? validateWalletAddress(rawSenderWallet, route.family)
      : null;

    let spotPriceUsd = '1';
    let quoteSource = 'FIXED_STABLECOIN_PEG';
    if (route.isNative) {
      const quote = await resolveSpotPrice({
        assetSymbol: route.assetSymbol,
        networkId: route.networkId
      });
      spotPriceUsd = quote && typeof quote === 'object' ? quote.priceUsd : quote;
      quoteSource = (quote && typeof quote === 'object' && quote.source) || 'SPOT_PRICE_PROVIDER';
    }

    const conversion = convertUsdToAtomic({
      amountUsd,
      assetDecimals: route.assetDecimals,
      spotPriceUsd
    });

    return {
      route,
      senderWallet: cleanSenderWallet,
      conversion,
      quoteSource,
      quotedAt: quotedAtIso
    };
  }

  async function commitDualCreate(intentRef, intentDoc, orderRef, orderDoc) {
    if (typeof db.batch === 'function') {
      const batch = db.batch();
      batch.set(intentRef, intentDoc);
      batch.set(orderRef, orderDoc);
      await batch.commit();
      return;
    }
    await db.runTransaction(async (tx) => {
      tx.set(intentRef, intentDoc);
      tx.set(orderRef, orderDoc);
    });
  }

  async function createPaymentIntent(rawInput) {
    assertPlainObject(rawInput, 'createPaymentIntent');

    // Strict allowlist destructuring: client-supplied monetary/treasury/status/sponsor/expiry fields are ignored.
    const {
      buyerUid: rawBuyerUid,
      productType: requestedProductType,
      packageId,
      powerTh: rawPowerTh,
      customPowerTh,
      networkId: rawNetworkId,
      assetSymbol: rawAssetSymbol,
      asset: rawAssetAlias,
      senderWallet,
      idempotencyKey: rawIdempotencyKey
    } = rawInput;

    const buyerUid = assertValidDocId(rawBuyerUid, 'INVALID_BUYER_UID', 'buyerUid');
    const cleanIdempotencyKey = normalizeOptionalIdempotencyKey(rawIdempotencyKey);
    const networkMode = resolveNetworkMode(env);
    const ttlMs = resolveIntentTtlMs(env);
    const powerTh = rawPowerTh !== undefined ? rawPowerTh : customPowerTh;
    const assetSymbol = rawAssetSymbol !== undefined ? rawAssetSymbol : rawAssetAlias;
    const rawSenderWallet = assertSenderWalletStringOrEmpty(senderWallet);
    const hasNetwork = rawNetworkId !== undefined && rawNetworkId !== null && String(rawNetworkId).trim() !== '';
    const hasAsset = assetSymbol !== undefined && assetSymbol !== null && String(assetSymbol).trim() !== '';

    if (hasNetwork && !hasAsset) {
      throw new PaymentIntentError('ASSET_REQUIRED', 'assetSymbol is required when networkId is provided');
    }
    if (!hasNetwork && (hasAsset || rawSenderWallet !== null)) {
      throw new PaymentIntentError('NETWORK_REQUIRED', 'networkId is required when assetSymbol or senderWallet is provided');
    }

    const createdAtMs = now();
    const createdAtIso = new Date(createdAtMs).toISOString();
    const expiresAtIso = new Date(createdAtMs + ttlMs).toISOString();

    const product = await resolveAuthoritativeProduct({ requestedProductType, packageId, powerTh });
    const amountInternal = parseUsdtToInternal(product.amountUsd);
    const { microUsdt, usdt6 } = roundInternalToUsdt6(amountInternal);
    const amountMicroUsdtStr = microUsdt.toString();

    const deterministicIntentId = cleanIdempotencyKey
      ? deriveIdempotentIntentId(buyerUid, cleanIdempotencyKey)
      : null;

    if (deterministicIntentId) {
      const preExistingSnap = await db.collection('payment_intents').doc(deterministicIntentId).get();
      if (snapExists(preExistingSnap)) {
        const existing = snapData(preExistingSnap);
        assertIdempotentPayloadMatches(existing, buyerUid, product, amountMicroUsdtStr);
        return structuredClone(existing);
      }
    }

    // External I/O (buyer referral snapshot + optional spot price quote) stays strictly outside db.runTransaction.
    const [buyerContext, resolved] = await Promise.all([
      resolveBuyerAndReferralSnapshot(buyerUid, createdAtMs, createdAtIso),
      hasNetwork
        ? resolveRouteAndQuote({
            networkId: rawNetworkId,
            assetSymbol,
            senderWallet,
            amountUsd: usdt6,
            quotedAtIso: createdAtIso
          })
        : Promise.resolve(null)
    ]);

    let status = PAYMENT_STATUSES.OPEN;
    let paymentFields = {
      networkMode,
      paymentNetwork: null,
      chainId: null,
      paymentAsset: null,
      assetDecimals: null,
      tokenContractAddress: null,
      expectedAmountAtomic: null,
      expectedAmountDisplay: null,
      quotedSpotUsd: null,
      quoteSource: null,
      quotedAt: null,
      treasuryAddress: null,
      senderWallet: null,
      requiredConfirmations: 0
    };

    if (resolved) {
      status = PAYMENT_STATUSES.AWAITING;
      paymentFields = {
        networkMode: resolved.route.networkMode,
        paymentNetwork: resolved.route.networkId,
        chainId: resolved.route.chainId,
        paymentAsset: resolved.route.assetSymbol,
        assetDecimals: resolved.route.assetDecimals,
        tokenContractAddress: resolved.route.tokenContractAddress,
        expectedAmountAtomic: resolved.conversion.expectedAmountAtomic,
        expectedAmountDisplay: resolved.conversion.expectedAmountDisplay,
        quotedSpotUsd: resolved.conversion.quotedSpotUsd,
        quoteSource: resolved.quoteSource,
        quotedAt: resolved.quotedAt,
        treasuryAddress: resolved.route.treasuryAddress,
        senderWallet: resolved.senderWallet,
        requiredConfirmations: resolved.route.requiredConfirmations
      };
    }

    const intentId = deterministicIntentId || generateId();
    const orderId = intentId;
    const storedIdempotencyKey = cleanIdempotencyKey || intentId;

    const baseDoc = {
      intentId,
      orderId,
      idempotencyKey: storedIdempotencyKey,
      userId: buyerUid,
      buyerUid,
      status,
      productType: product.productType,
      commissionEligible: product.commissionEligible,
      packageId: product.packageId,
      packageName: product.packageName,
      powerTh: product.powerTh,
      efficiencyWattsPerTh: product.efficiencyWattsPerTh,
      amountUsd: product.amountUsd,
      amountMicroUsdt: amountMicroUsdtStr,
      netPaidUsdt: usdt6,
      ...paymentFields,
      confirmations: 0,
      txHash: null,
      activatedMinerId: null,
      ...buyerContext.referralSnapshot,
      createdAt: createdAtIso,
      updatedAt: createdAtIso,
      expiresAt: expiresAtIso
    };

    const orderDoc = {
      ...baseDoc,
      attemptId: intentId,
      idempotencyKey: storedIdempotencyKey,
      userEmail: buyerContext.userEmail,
      userName: buyerContext.userName,
      contractedTh: product.powerTh,
      cryptoAsset: paymentFields.paymentAsset,
      cryptoAmount: paymentFields.expectedAmountDisplay
        ? `${paymentFields.expectedAmountDisplay} ${paymentFields.paymentAsset}`
        : null,
      recipientAddress: paymentFields.treasuryAddress,
      bridgeStatus: 'NONE'
    };

    const intentRef = db.collection('payment_intents').doc(intentId);
    const orderRef = db.collection('admin_orders').doc(orderId);

    if (cleanIdempotencyKey) {
      return db.runTransaction(async (tx) => {
        const txExistingSnap = await tx.get(intentRef);
        if (snapExists(txExistingSnap)) {
          const existing = snapData(txExistingSnap);
          assertIdempotentPayloadMatches(existing, buyerUid, product, amountMicroUsdtStr);
          return structuredClone(existing);
        }
        tx.set(intentRef, baseDoc);
        tx.set(orderRef, orderDoc);
        return structuredClone(baseDoc);
      });
    }

    await commitDualCreate(intentRef, baseDoc, orderRef, orderDoc);

    return structuredClone(baseDoc);
  }

  async function selectPaymentMethod(rawInput) {
    assertPlainObject(rawInput, 'selectPaymentMethod');

    const {
      intentId: rawIntentId,
      requesterUid,
      isAdmin = false,
      networkId,
      assetSymbol: rawAssetSymbol,
      asset: rawAssetAlias,
      senderWallet
    } = rawInput;

    const intentId = assertValidDocId(rawIntentId, 'INVALID_INTENT_ID', 'intentId');
    const actorUid = resolveActorUid(requesterUid, isAdmin);
    assertSenderWalletStringOrEmpty(senderWallet);
    const assetSymbol = rawAssetSymbol !== undefined ? rawAssetSymbol : rawAssetAlias;
    const ttlMs = resolveIntentTtlMs(env);

    // Pre-read and authorize before external spot price I/O so transactions never hold network calls.
    const intentRef = db.collection('payment_intents').doc(intentId);
    const preSnap = await intentRef.get();
    if (!snapExists(preSnap)) {
      throw new PaymentIntentError('INTENT_NOT_FOUND', `Payment intent not found: ${intentId}`, 404);
    }
    const preData = snapData(preSnap);
    if (preData.buyerUid !== actorUid && isAdmin !== true) {
      throw new PaymentIntentError('FORBIDDEN', 'Not authorized to modify this payment intent', 403);
    }
    if (!SELECTABLE_METHOD_STATUS_SET.has(preData.status) || Boolean(preData.txHash)) {
      throw new PaymentIntentError(
        'INVALID_STATUS_TRANSITION',
        `Cannot select payment method when status is '${preData.status}'`,
        409
      );
    }

    const preNowMs = now();
    if (preData.expiresAt && preNowMs > Date.parse(preData.expiresAt)) {
      throw new PaymentIntentError('INTENT_EXPIRED', `Payment intent has expired: ${intentId}`, 409);
    }

    const quoteNowIso = new Date(preNowMs).toISOString();
    const resolved = await resolveRouteAndQuote({
      networkId,
      assetSymbol,
      senderWallet,
      amountUsd: preData.netPaidUsdt || preData.amountUsd,
      quotedAtIso: quoteNowIso
    });

    return db.runTransaction(async (tx) => {
      const txIntentSnap = await tx.get(intentRef);
      if (!snapExists(txIntentSnap)) {
        throw new PaymentIntentError('INTENT_NOT_FOUND', `Payment intent not found: ${intentId}`, 404);
      }
      const current = snapData(txIntentSnap);
      if (current.buyerUid !== actorUid && isAdmin !== true) {
        throw new PaymentIntentError('FORBIDDEN', 'Not authorized to modify this payment intent', 403);
      }
      if (!SELECTABLE_METHOD_STATUS_SET.has(current.status) || Boolean(current.txHash)) {
        throw new PaymentIntentError(
          'INVALID_STATUS_TRANSITION',
          `Cannot select payment method when status is '${current.status}'`,
          409
        );
      }

      const txNowMs = now();
      if (current.expiresAt && txNowMs > Date.parse(current.expiresAt)) {
        throw new PaymentIntentError('INTENT_EXPIRED', `Payment intent has expired: ${intentId}`, 409);
      }

      const orderRef = db.collection('admin_orders').doc(current.orderId || intentId);
      const txOrderSnap = await tx.get(orderRef);

      const txNowIso = new Date(txNowMs).toISOString();
      const nextExpiresAtIso = new Date(txNowMs + ttlMs).toISOString();

      // Referral snapshot fields (sponsorUid, sponsorLinkedAt, referralSnapshotAt, referralSnapshotLocked) are never overwritten.
      const patch = {
        status: PAYMENT_STATUSES.AWAITING,
        networkMode: resolved.route.networkMode,
        paymentNetwork: resolved.route.networkId,
        chainId: resolved.route.chainId,
        paymentAsset: resolved.route.assetSymbol,
        assetDecimals: resolved.route.assetDecimals,
        tokenContractAddress: resolved.route.tokenContractAddress,
        expectedAmountAtomic: resolved.conversion.expectedAmountAtomic,
        expectedAmountDisplay: resolved.conversion.expectedAmountDisplay,
        quotedSpotUsd: resolved.conversion.quotedSpotUsd,
        quoteSource: resolved.quoteSource,
        quotedAt: resolved.quotedAt,
        treasuryAddress: resolved.route.treasuryAddress,
        senderWallet: resolved.senderWallet,
        requiredConfirmations: resolved.route.requiredConfirmations,
        expiresAt: nextExpiresAtIso,
        updatedAt: txNowIso
      };

      const orderPatch = {
        ...patch,
        cryptoAsset: resolved.route.assetSymbol,
        cryptoAmount: `${resolved.conversion.expectedAmountDisplay} ${resolved.route.assetSymbol}`,
        recipientAddress: resolved.route.treasuryAddress
      };

      tx.update(intentRef, patch);
      if (snapExists(txOrderSnap)) {
        tx.update(orderRef, orderPatch);
      } else {
        tx.set(orderRef, { ...current, ...orderPatch }, { merge: true });
      }

      return structuredClone({ ...current, ...patch });
    });
  }

  async function getPaymentIntent(rawInput) {
    assertPlainObject(rawInput, 'getPaymentIntent');
    const { intentId: rawIntentId, requesterUid, isAdmin = false } = rawInput;
    const intentId = assertValidDocId(rawIntentId, 'INVALID_INTENT_ID', 'intentId');
    const actorUid = resolveActorUid(requesterUid, isAdmin);

    const intentSnap = await db.collection('payment_intents').doc(intentId).get();
    if (!snapExists(intentSnap)) {
      throw new PaymentIntentError('INTENT_NOT_FOUND', `Payment intent not found: ${intentId}`, 404);
    }

    const intent = snapData(intentSnap);
    if (intent.buyerUid !== actorUid && isAdmin !== true) {
      throw new PaymentIntentError('FORBIDDEN', 'Not authorized to view this payment intent', 403);
    }

    const nowMs = now();
    const expiresAtMs = intent.expiresAt ? Date.parse(intent.expiresAt) : Number.NaN;
    const isExpired =
      (intent.status === PAYMENT_STATUSES.OPEN || intent.status === PAYMENT_STATUSES.AWAITING) &&
      !Number.isNaN(expiresAtMs) &&
      nowMs > expiresAtMs;

    return {
      ...structuredClone(intent),
      isExpired
    };
  }

  async function cancelPaymentIntent(rawInput) {
    assertPlainObject(rawInput, 'cancelPaymentIntent');
    const {
      intentId: rawIntentId,
      requesterUid,
      isAdmin = false,
      reason
    } = rawInput;
    const intentId = assertValidDocId(rawIntentId, 'INVALID_INTENT_ID', 'intentId');
    const actorUid = resolveActorUid(requesterUid, isAdmin);
    const cleanReason = normalizeCancelReason(reason);

    const intentRef = db.collection('payment_intents').doc(intentId);

    return db.runTransaction(async (tx) => {
      const intentSnap = await tx.get(intentRef);
      if (!snapExists(intentSnap)) {
        throw new PaymentIntentError('INTENT_NOT_FOUND', `Payment intent not found: ${intentId}`, 404);
      }
      const current = snapData(intentSnap);
      if (current.buyerUid !== actorUid && isAdmin !== true) {
        throw new PaymentIntentError('FORBIDDEN', 'Not authorized to cancel this payment intent', 403);
      }
      if (!CANCELLABLE_STATUS_SET.has(current.status) || Boolean(current.txHash)) {
        throw new PaymentIntentError(
          'INTENT_NOT_CANCELLABLE',
          `Payment intent '${intentId}' cannot be cancelled in status '${current.status}'`,
          409
        );
      }

      const orderRef = db.collection('admin_orders').doc(current.orderId || intentId);
      const orderSnap = await tx.get(orderRef);

      const nowIso = new Date(now()).toISOString();
      const cancelPatch = {
        status: PAYMENT_STATUSES.CANCELLED,
        cancelledAt: nowIso,
        cancelReason: cleanReason,
        updatedAt: nowIso
      };

      tx.update(intentRef, cancelPatch);
      if (snapExists(orderSnap)) {
        tx.update(orderRef, cancelPatch);
      } else {
        tx.set(orderRef, { ...current, ...cancelPatch }, { merge: true });
      }

      return structuredClone({ ...current, ...cancelPatch });
    });
  }

  return Object.freeze({
    createPaymentIntent,
    selectPaymentMethod,
    getPaymentIntent,
    cancelPaymentIntent
  });
}

module.exports = Object.freeze({
  PaymentIntentError,
  resolveCustomMinerPrice,
  createDefaultSpotPriceProvider,
  createPaymentIntentService
});
