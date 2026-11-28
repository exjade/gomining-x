'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PaymentConfigError,
  PAYMENT_STATUSES,
  NON_SETTLED_ACTIVE_STATUSES,
  CANCELLABLE_STATUSES,
  SUPPORTED_PRODUCT_TYPES,
  DEFAULT_INTENT_TTL_MS,
  MIN_INTENT_TTL_MS,
  MAX_INTENT_TTL_MS,
  CANONICAL_CUSTOM_MINER_TIERS,
  resolveNetworkMode,
  resolveIntentTtlMs,
  isValidEvmAddress,
  isValidSolanaAddress,
  validateWalletAddress,
  resolveTreasuryAddress,
  resolvePaymentRoute,
  convertUsdToAtomic,
  formatAtomicToDecimal
} = require('../src/payments/paymentConfig');

const { SETTLED_STATUSES, isSettledStatus } = require('../src/referrals/onPurchaseSettled');

const VALID_EVM_TREASURY = '0x1111111111111111111111111111111111111111';
const VALID_SOL_TREASURY = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const TESTNET_BSC_USDT = '0x2222222222222222222222222222222222222222';
const TESTNET_POLYGON_USDT = '0x3333333333333333333333333333333333333333';
const TESTNET_ETH_USDT = '0x4444444444444444444444444444444444444444';
const TESTNET_SOL_USDT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

function buildTestEnv(overrides = {}) {
  return {
    PAYMENT_NETWORK_MODE: 'testnet',
    TREASURY_EVM_ADDRESS: VALID_EVM_TREASURY,
    TREASURY_SOLANA_ADDRESS: VALID_SOL_TREASURY,
    PAYMENT_TESTNET_USDT_BSC_CONTRACT: TESTNET_BSC_USDT,
    PAYMENT_TESTNET_USDT_POLYGON_CONTRACT: TESTNET_POLYGON_USDT,
    PAYMENT_TESTNET_USDT_ETHEREUM_CONTRACT: TESTNET_ETH_USDT,
    PAYMENT_TESTNET_USDT_SOLANA_MINT: TESTNET_SOL_USDT,
    ...overrides
  };
}

// ============================================================================
// 1. CONFIGURATION & FAIL-CLOSED INVARIANTS
// ============================================================================

test('paymentConfig: PAYMENT_STATUSES defines canonical states and strictly forbids CONFIRMED', () => {
  assert.deepEqual(Object.values(PAYMENT_STATUSES), [
    'OPEN',
    'AWAITING',
    'PROCESSING',
    'SETTLED',
    'UNDERPAID',
    'FAILED',
    'EXPIRED',
    'CANCELLED'
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(PAYMENT_STATUSES, 'CONFIRMED'), false);
  assert.equal(Object.values(PAYMENT_STATUSES).includes('CONFIRMED'), false);
  assert.deepEqual(NON_SETTLED_ACTIVE_STATUSES, ['OPEN', 'AWAITING', 'PROCESSING']);
  assert.deepEqual(CANCELLABLE_STATUSES, ['OPEN', 'AWAITING']);
  assert.deepEqual(SUPPORTED_PRODUCT_TYPES, ['miner', 'subscription']);
  assert.equal(DEFAULT_INTENT_TTL_MS, 15 * 60 * 1000);
  assert.equal(MIN_INTENT_TTL_MS, 5 * 60 * 1000);
  assert.equal(MAX_INTENT_TTL_MS, 60 * 60 * 1000);
  assert.equal(CANONICAL_CUSTOM_MINER_TIERS.length, 22);

  for (const status of NON_SETTLED_ACTIVE_STATUSES) {
    assert.equal(SETTLED_STATUSES.has(status.toLowerCase()), false);
    assert.equal(isSettledStatus(status), false);
  }
});

test('paymentConfig: source contains zero hardcoded legacy treasury addresses', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'payments', 'paymentConfig.js'),
    'utf8'
  );
  assert.doesNotMatch(source, /0x3718/i);
  assert.doesNotMatch(source, /bZJ3/i);
  assert.doesNotMatch(source, /Xogk/);
  assert.doesNotMatch(source, /TREASURY_EVM_ADDRESS\s*\|\|\s*['"]0x/i);
  assert.doesNotMatch(source, /TREASURY_SOLANA_ADDRESS\s*\|\|\s*['"][1-9A-HJ-NP-Za-km-z]{32,44}['"]/);
});

test('paymentConfig: resolveNetworkMode defaults to testnet, normalizes case, and fails closed on invalid values', () => {
  assert.equal(resolveNetworkMode({}), 'testnet');
  assert.equal(resolveNetworkMode({ PAYMENT_NETWORK_MODE: '' }), 'testnet');
  assert.equal(resolveNetworkMode({ PAYMENT_NETWORK_MODE: '  TESTNET ' }), 'testnet');
  assert.equal(resolveNetworkMode({ PAYMENT_NETWORK_MODE: 'MainNet' }), 'mainnet');

  for (const bad of ['devnet', 'prod', 'production', 'staging', 'main']) {
    assert.throws(
      () => resolveNetworkMode({ PAYMENT_NETWORK_MODE: bad }),
      (err) => err instanceof PaymentConfigError && err.code === 'INVALID_NETWORK_MODE'
    );
  }
});

test('paymentConfig: resolveIntentTtlMs defaults to 15 min and enforces [5, 60] min bounds', () => {
  assert.equal(resolveIntentTtlMs({}), 15 * 60 * 1000);
  assert.equal(resolveIntentTtlMs({ PAYMENT_INTENT_TTL_MINUTES: '5' }), 5 * 60 * 1000);
  assert.equal(resolveIntentTtlMs({ PAYMENT_INTENT_TTL_MINUTES: '60' }), 60 * 60 * 1000);

  for (const bad of ['4', '61', '0', '-5', 'abc', '15.5']) {
    assert.throws(
      () => resolveIntentTtlMs({ PAYMENT_INTENT_TTL_MINUTES: bad }),
      (err) => err instanceof PaymentConfigError && err.code === 'INVALID_INTENT_TTL'
    );
  }
});

test('paymentConfig: treasury resolution fails closed when missing, zero address, or malformed', () => {
  assert.throws(
    () => resolveTreasuryAddress('evm', {}),
    (err) => err instanceof PaymentConfigError && err.code === 'TREASURY_NOT_CONFIGURED'
  );
  assert.throws(
    () => resolveTreasuryAddress('solana', {}),
    (err) => err instanceof PaymentConfigError && err.code === 'TREASURY_NOT_CONFIGURED'
  );

  for (const badEvm of [
    '0x0000000000000000000000000000000000000000',
    '0x1234',
    '1111111111111111111111111111111111111111',
    '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG'
  ]) {
    assert.equal(isValidEvmAddress(badEvm), false);
    assert.throws(
      () => resolveTreasuryAddress('evm', { TREASURY_EVM_ADDRESS: badEvm }),
      (err) => err instanceof PaymentConfigError && err.code === 'INVALID_TREASURY_ADDRESS'
    );
  }

  for (const badSol of [
    'short',
    '0OIl111111111111111111111111111111111',
    '0x1111111111111111111111111111111111111111'
  ]) {
    assert.equal(isValidSolanaAddress(badSol), false);
    assert.throws(
      () => resolveTreasuryAddress('solana', { TREASURY_SOLANA_ADDRESS: badSol }),
      (err) => err instanceof PaymentConfigError && err.code === 'INVALID_TREASURY_ADDRESS'
    );
  }

  assert.equal(resolveTreasuryAddress('evm', buildTestEnv()), VALID_EVM_TREASURY);
  assert.equal(resolveTreasuryAddress('solana', buildTestEnv()), VALID_SOL_TREASURY);
  assert.equal(validateWalletAddress(`  ${VALID_EVM_TREASURY}  `, 'evm'), VALID_EVM_TREASURY);
  assert.equal(validateWalletAddress(`  ${VALID_SOL_TREASURY}  `, 'solana'), VALID_SOL_TREASURY);
});

test('paymentConfig: resolves testnet and mainnet routes, chainIds, confirmations, and PAYMENT_ENABLE_ETHEREUM flag', () => {
  const testnetEnv = buildTestEnv({ PAYMENT_NETWORK_MODE: 'testnet' });
  const mainnetEnv = buildTestEnv({ PAYMENT_NETWORK_MODE: 'mainnet', PAYMENT_ENABLE_ETHEREUM: 'true' });

  const bscTest = resolvePaymentRoute({ networkId: 'bsc', assetSymbol: 'USDT', env: testnetEnv });
  assert.equal(bscTest.networkMode, 'testnet');
  assert.equal(bscTest.chainId, 97);
  assert.equal(bscTest.requiredConfirmations, 15);
  assert.equal(bscTest.recommended, true);
  assert.equal(bscTest.assetDecimals, 18);
  assert.equal(bscTest.tokenContractAddress, TESTNET_BSC_USDT);
  assert.equal(bscTest.explorerBaseUrl, 'https://testnet.bscscan.com');

  const bscMain = resolvePaymentRoute({ networkId: 'bsc', assetSymbol: 'USDT', env: mainnetEnv });
  assert.equal(bscMain.chainId, 56);
  assert.equal(bscMain.assetDecimals, 18);
  assert.equal(bscMain.tokenContractAddress, '0x55d398326f99059fF775485246999027B3197955');
  assert.equal(bscMain.explorerBaseUrl, 'https://bscscan.com');

  const polyTest = resolvePaymentRoute({ networkId: 'polygon', assetSymbol: 'USDT', env: testnetEnv });
  assert.equal(polyTest.chainId, 80002);
  assert.equal(polyTest.requiredConfirmations, 64);
  assert.equal(polyTest.assetDecimals, 6);
  assert.equal(polyTest.tokenContractAddress, TESTNET_POLYGON_USDT);

  const polyMain = resolvePaymentRoute({ networkId: 'polygon', assetSymbol: 'POL', env: mainnetEnv });
  assert.equal(polyMain.chainId, 137);
  assert.equal(polyMain.isNative, true);
  assert.equal(polyMain.assetDecimals, 18);
  assert.equal(polyMain.tokenContractAddress, null);

  const solTest = resolvePaymentRoute({ networkId: 'solana', assetSymbol: 'SOL', env: testnetEnv });
  assert.equal(solTest.chainId, 'solana-devnet');
  assert.equal(solTest.commitment, 'finalized');
  assert.equal(solTest.requiredConfirmations, 1);
  assert.equal(solTest.assetDecimals, 9);
  assert.equal(solTest.explorerQuery, '?cluster=devnet');
  assert.equal(solTest.treasuryAddress, VALID_SOL_TREASURY);

  const solMainUsdt = resolvePaymentRoute({ networkId: 'solana', assetSymbol: 'USDT', env: mainnetEnv });
  assert.equal(solMainUsdt.chainId, 'solana-mainnet');
  assert.equal(solMainUsdt.assetDecimals, 6);
  assert.equal(solMainUsdt.tokenContractAddress, 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');

  // Ethereum disabled by default
  assert.throws(
    () => resolvePaymentRoute({ networkId: 'ethereum', assetSymbol: 'USDT', env: testnetEnv }),
    (err) => err instanceof PaymentConfigError && err.code === 'NETWORK_DISABLED'
  );

  // Ethereum enabled explicitly via PAYMENT_ENABLE_ETHEREUM=true
  const ethTest = resolvePaymentRoute({
    networkId: 'ethereum',
    assetSymbol: 'USDT',
    env: buildTestEnv({ PAYMENT_ENABLE_ETHEREUM: 'true' })
  });
  assert.equal(ethTest.chainId, 11155111);
  assert.equal(ethTest.requiredConfirmations, 12);
  assert.equal(ethTest.recommended, false);
  assert.equal(ethTest.assetDecimals, 6);
  assert.equal(ethTest.tokenContractAddress, TESTNET_ETH_USDT);

  const ethMain = resolvePaymentRoute({ networkId: 'ethereum', assetSymbol: 'USDT', env: mainnetEnv });
  assert.equal(ethMain.chainId, 1);
  assert.equal(ethMain.tokenContractAddress, '0xdAC17F958D2ee523a2206206994597C13D831ec7');
});

test('paymentConfig: fails closed when testnet USDT contract/mint env is missing or invalid', () => {
  const missingBsc = buildTestEnv({ PAYMENT_TESTNET_USDT_BSC_CONTRACT: '' });
  assert.throws(
    () => resolvePaymentRoute({ networkId: 'bsc', assetSymbol: 'USDT', env: missingBsc }),
    (err) => err instanceof PaymentConfigError && err.code === 'TOKEN_CONTRACT_NOT_CONFIGURED'
  );

  const missingSol = buildTestEnv({ PAYMENT_TESTNET_USDT_SOLANA_MINT: undefined });
  assert.throws(
    () => resolvePaymentRoute({ networkId: 'solana', assetSymbol: 'USDT', env: missingSol }),
    (err) => err instanceof PaymentConfigError && err.code === 'TOKEN_CONTRACT_NOT_CONFIGURED'
  );

  const zeroBsc = buildTestEnv({
    PAYMENT_TESTNET_USDT_BSC_CONTRACT: '0x0000000000000000000000000000000000000000'
  });
  assert.throws(
    () => resolvePaymentRoute({ networkId: 'bsc', assetSymbol: 'USDT', env: zeroBsc }),
    (err) => err instanceof PaymentConfigError && err.code === 'INVALID_TOKEN_CONTRACT'
  );

  // Native assets on testnet do not require USDT contract env
  const bnbTest = resolvePaymentRoute({ networkId: 'bsc', assetSymbol: 'BNB', env: missingBsc });
  assert.equal(bnbTest.isNative, true);
  assert.equal(bnbTest.tokenContractAddress, null);
});

// ============================================================================
// 2. EXACT BIGINT ARITHMETIC & HETEROGENEOUS DECIMALS
// ============================================================================

test('paymentConfig: convertUsdToAtomic handles USDT 18 decimals (BSC) vs 6 decimals (Polygon/ETH/Solana) exactly', () => {
  const bscUsdt = convertUsdToAtomic({ amountUsd: '100.00', assetDecimals: 18, spotPriceUsd: '1' });
  assert.equal(bscUsdt.amountMicroUsdt, '100000000');
  assert.equal(bscUsdt.netPaidUsdt, '100.000000');
  assert.equal(bscUsdt.expectedAmountAtomic, '100000000000000000000');
  assert.equal(bscUsdt.expectedAmountDisplay, '100.00');
  assert.equal(bscUsdt.quotedSpotUsd, '1');

  const sixDecUsdt = convertUsdToAtomic({ amountUsd: '100.00', assetDecimals: 6, spotPriceUsd: '1' });
  assert.equal(sixDecUsdt.amountMicroUsdt, '100000000');
  assert.equal(sixDecUsdt.netPaidUsdt, '100.000000');
  assert.equal(sixDecUsdt.expectedAmountAtomic, '100000000');
  assert.equal(sixDecUsdt.expectedAmountDisplay, '100.00');

  const centsUsdt = convertUsdToAtomic({ amountUsd: 99.99, assetDecimals: 18, spotPriceUsd: '1' });
  assert.equal(centsUsdt.expectedAmountAtomic, '99990000000000000000');
  assert.equal(centsUsdt.netPaidUsdt, '99.990000');
});

test('paymentConfig: convertUsdToAtomic applies exact BigInt ROUND_UP for native coins without float drift', () => {
  // $100 / $600 BNB = 0.1666666666666666666... -> ROUND_UP at 18 dec = 166666666666666667 wei
  const bnb = convertUsdToAtomic({ amountUsd: '100.00', assetDecimals: 18, spotPriceUsd: '600' });
  assert.equal(bnb.expectedAmountAtomic, '166666666666666667');
  assert.equal(bnb.expectedAmountDisplay, '0.166666666666666667');

  // $100 / $150 SOL = 0.6666666666... -> ROUND_UP at 9 dec = 666666667 lamports
  const sol = convertUsdToAtomic({ amountUsd: '100.00', assetDecimals: 9, spotPriceUsd: '150' });
  assert.equal(sol.expectedAmountAtomic, '666666667');
  assert.equal(sol.expectedAmountDisplay, '0.666666667');

  // Exact division ($100 / $2000 ETH = 0.05 ETH) must NOT round up by 1 wei
  const ethExact = convertUsdToAtomic({ amountUsd: '100.00', assetDecimals: 18, spotPriceUsd: '2000' });
  assert.equal(ethExact.expectedAmountAtomic, '50000000000000000');
  assert.equal(ethExact.expectedAmountDisplay, '0.05');

  // $99.99 / $0.37 POL -> exact BigInt ceil((9999000000 * 10^18) / 37000000)
  const expectedPol = ((9_999_000_000n * 10n ** 18n) + 37_000_000n - 1n) / 37_000_000n;
  const pol = convertUsdToAtomic({ amountUsd: '99.99', assetDecimals: 18, spotPriceUsd: '0.37' });
  assert.equal(pol.expectedAmountAtomic, expectedPol.toString());
  assert.equal(formatAtomicToDecimal(500_000_000n, 9), '0.50');
});

test('paymentConfig: convertUsdToAtomic rejects invalid spot prices and non-positive amounts', () => {
  for (const badSpot of [0, '0', -10, '-5', NaN, Infinity, -Infinity, 'abc', null, undefined]) {
    assert.throws(
      () => convertUsdToAtomic({ amountUsd: '100.00', assetDecimals: 18, spotPriceUsd: badSpot }),
      (err) => err instanceof PaymentConfigError && err.code === 'INVALID_SPOT_PRICE'
    );
  }

  for (const badAmount of [0, '0', -1, NaN, Infinity, 'abc', null]) {
    assert.throws(
      () => convertUsdToAtomic({ amountUsd: badAmount, assetDecimals: 6, spotPriceUsd: '1' }),
      (err) => err instanceof PaymentConfigError && err.code === 'INVALID_AMOUNT'
    );
  }
});

const {
  PaymentIntentError,
  resolveCustomMinerPrice,
  createDefaultSpotPriceProvider,
  createPaymentIntentService
} = require('../src/payments/paymentIntentService');
const { handlePurchaseSettledEvent } = require('../src/referrals/onPurchaseSettled');

function createInMemoryFirestore(initialDocs = {}) {
  const store = new Map();
  for (const [docPath, data] of Object.entries(initialDocs)) {
    store.set(docPath, structuredClone(data));
  }

  function getNestedField(obj, fieldPath) {
    return fieldPath.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);
  }

  function applyWrites(writes) {
    for (const write of writes) {
      const existing = store.get(write.path);
      if (write.requireExists && existing === undefined) {
        throw new Error(`Document not found for update: ${write.path}`);
      }
      const nextDoc = write.merge
        ? { ...(existing ? structuredClone(existing) : {}), ...structuredClone(write.data) }
        : structuredClone(write.data);
      store.set(write.path, nextDoc);
    }
  }

  function makeDocRef(docPath) {
    return {
      path: docPath,
      id: docPath.split('/').pop(),
      collection(subName) {
        return makeCollectionRef(`${docPath}/${subName}`);
      },
      async get() {
        const data = store.get(docPath);
        return {
          exists: data !== undefined,
          id: docPath.split('/').pop(),
          data: () => (data !== undefined ? structuredClone(data) : undefined)
        };
      },
      async set(data, options = {}) {
        applyWrites([{ path: docPath, data, merge: Boolean(options.merge) }]);
      }
    };
  }

  function makeCollectionRef(colPath, filters = [], limitCount = null) {
    return {
      __isQuery: true,
      path: colPath,
      doc(id) {
        return makeDocRef(`${colPath}/${id}`);
      },
      where(field, op, value) {
        if (op !== '==') {
          throw new Error(`Unsupported operator in test stub: ${op}`);
        }
        return makeCollectionRef(colPath, [...filters, { field, value }], limitCount);
      },
      limit(n) {
        return makeCollectionRef(colPath, filters, n);
      },
      async get() {
        const prefix = `${colPath}/`;
        const matches = [];
        for (const [docPath, data] of store.entries()) {
          if (!docPath.startsWith(prefix)) continue;
          const remainder = docPath.slice(prefix.length);
          if (remainder.includes('/')) continue;
          const ok = filters.every((f) => getNestedField(data, f.field) === f.value);
          if (ok) {
            matches.push({
              exists: true,
              id: remainder,
              data: () => structuredClone(data)
            });
          }
        }
        const docs = limitCount !== null ? matches.slice(0, limitCount) : matches;
        return { empty: docs.length === 0, size: docs.length, docs };
      }
    };
  }

  let txChain = Promise.resolve();

  const db = {
    collection(name) {
      return makeCollectionRef(name);
    },
    batch() {
      const pending = [];
      return {
        set(docRef, data, options = {}) {
          pending.push({ path: docRef.path, data, merge: Boolean(options.merge) });
          return this;
        },
        update(docRef, data) {
          pending.push({ path: docRef.path, data, merge: true, requireExists: true });
          return this;
        },
        async commit() {
          applyWrites(pending);
        }
      };
    },
    async runTransaction(fn) {
      const run = async () => {
        let writeStarted = false;
        const pending = [];
        const tx = {
          async get(target) {
            if (writeStarted) {
              throw new Error('Firestore transactions require all reads before all writes');
            }
            if (target && target.__isQuery) {
              return target.get();
            }
            const data = store.get(target.path);
            return {
              exists: data !== undefined,
              id: target.id,
              data: () => (data !== undefined ? structuredClone(data) : undefined)
            };
          },
          set(docRef, data, options = {}) {
            writeStarted = true;
            pending.push({ path: docRef.path, data, merge: Boolean(options.merge) });
            return tx;
          },
          update(docRef, data) {
            writeStarted = true;
            pending.push({ path: docRef.path, data, merge: true, requireExists: true });
            return tx;
          }
        };
        const result = await fn(tx);
        applyWrites(pending);
        return result;
      };
      const next = txChain.then(run, run);
      txChain = next.catch(() => {});
      return next;
    }
  };

  return { db, store };
}

function buildSeededDocs() {
  return {
    'commercial_packages/minerx-02': {
      id: 'minerx-02',
      packageId: 'minerx-02',
      name: '8.33 TH',
      section: 'minerx',
      packageType: 'fixed',
      powerTh: 8.33,
      efficiencyWattsPerTh: 15,
      priceUsdt: 99.99,
      status: 'ACTIVE',
      isPublished: true
    },
    'commercial_packages/minerx-archived': {
      id: 'minerx-archived',
      name: 'Old Miner',
      packageType: 'fixed',
      powerTh: 10,
      priceUsdt: 100,
      status: 'ARCHIVED',
      isPublished: false
    },
    'commercial_packages/minerx-unpublished': {
      id: 'minerx-unpublished',
      name: 'Draft Miner',
      packageType: 'fixed',
      powerTh: 10,
      priceUsdt: 100,
      status: 'ACTIVE',
      isPublished: false
    },
    'commercial_packages/mensual-plus': {
      id: 'mensual-plus',
      packageId: 'mensual-plus',
      name: 'Plus',
      section: 'mensual',
      packageType: 'subscription',
      cadence: 'monthly',
      powerTh: 9.61,
      priceUsdt: 99.99,
      status: 'ACTIVE',
      isPublished: true
    },
    'users/u1': {
      uid: 'u1',
      email: 'u1@example.com',
      username: 'user_one'
    },
    'users/u2': {
      uid: 'u2',
      email: 'u2@example.com',
      referral: { referralCode: 'SPONSOR2' }
    }
  };
}

// ============================================================================
// 3. AUTHORITATIVE PRICING & PRODUCT TYPES
// ============================================================================

test('paymentIntentService: catalog package ignores tampered client amountUsd, treasuryAddress, status, sponsorUid, and expiresAt', async () => {
  const { db, store } = createInMemoryFirestore(buildSeededDocs());
  let seq = 0;
  const fixedNowMs = Date.parse('2026-11-22T02:00:00.000Z');
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => fixedNowMs,
    idGenerator: () => `pi_test_${++seq}`
  });

  const intent = await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    networkId: 'bsc',
    assetSymbol: 'USDT',
    senderWallet: '0x9999999999999999999999999999999999999999',
    // Tampered attacker fields that MUST be ignored
    amount: 0.01,
    amountUsd: 0.01,
    priceUsd: 0.01,
    expectedAmountAtomic: '1',
    treasuryAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    status: 'SETTLED',
    sponsorUid: 'attacker-uid',
    expiresAt: '2099-01-01T00:00:00.000Z'
  });

  assert.equal(intent.intentId, 'pi_test_1');
  assert.equal(intent.orderId, 'pi_test_1');
  assert.equal(intent.status, PAYMENT_STATUSES.AWAITING);
  assert.equal(intent.amountUsd, 99.99);
  assert.equal(intent.amountMicroUsdt, '99990000');
  assert.equal(intent.netPaidUsdt, '99.990000');
  assert.equal(intent.expectedAmountAtomic, '99990000000000000000');
  assert.equal(intent.treasuryAddress, VALID_EVM_TREASURY);
  assert.equal(intent.tokenContractAddress, TESTNET_BSC_USDT);
  assert.equal(intent.chainId, 97);
  assert.equal(intent.assetDecimals, 18);
  assert.equal(intent.requiredConfirmations, 15);
  assert.equal(intent.confirmations, 0);
  assert.equal(intent.txHash, null);
  assert.equal(intent.activatedMinerId, null);
  assert.equal(intent.commissionEligible, true);
  assert.equal(intent.sponsorUid, null);
  assert.equal(intent.referralSnapshotLocked, true);
  assert.equal(intent.expiresAt, '2026-11-22T02:15:00.000Z');

  // Verify exact atomic mirror in /payment_intents and /admin_orders
  const storedIntent = store.get('payment_intents/pi_test_1');
  const storedOrder = store.get('admin_orders/pi_test_1');
  assert.ok(storedIntent);
  assert.ok(storedOrder);
  assert.equal(storedOrder.orderId, 'pi_test_1');
  assert.equal(storedOrder.intentId, 'pi_test_1');
  assert.equal(storedOrder.userId, 'u1');
  assert.equal(storedOrder.buyerUid, 'u1');
  assert.equal(storedOrder.status, 'AWAITING');
  assert.equal(storedOrder.amountUsd, 99.99);
  assert.equal(storedOrder.treasuryAddress, VALID_EVM_TREASURY);
  assert.equal(storedOrder.sponsorUid, null);
  assert.equal(storedOrder.referralSnapshotLocked, true);
  assert.equal(isSettledStatus(storedOrder.status), false);
});

test('paymentIntentService: rejects missing, archived, or unpublished commercial_packages', async () => {
  const { db } = createInMemoryFirestore(buildSeededDocs());
  const service = createPaymentIntentService({ db, env: buildTestEnv() });

  await assert.rejects(
    () => service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'does-not-exist' }),
    (err) => err instanceof PaymentIntentError && err.code === 'PACKAGE_NOT_FOUND'
  );
  await assert.rejects(
    () => service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'minerx-archived' }),
    (err) => err instanceof PaymentIntentError && err.code === 'PACKAGE_NOT_AVAILABLE'
  );
  await assert.rejects(
    () => service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'minerx-unpublished' }),
    (err) => err instanceof PaymentIntentError && err.code === 'PACKAGE_NOT_AVAILABLE'
  );
});

test('paymentIntentService: custom miner by powerTh computes canonical server price and rejects invalid powerTh', async () => {
  const { db } = createInMemoryFirestore(buildSeededDocs());
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-22T02:00:00.000Z'),
    idGenerator: () => 'pi_custom_1'
  });

  const resolved = resolveCustomMinerPrice(16);
  assert.equal(resolved.priceUsd, 189.99);
  assert.equal(resolved.powerTh, 16);

  const intent = await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    powerTh: 16,
    networkId: 'polygon',
    assetSymbol: 'USDT',
    amountUsd: 1 // tampered -> ignored
  });

  assert.equal(intent.packageId, 'custom-16th');
  assert.equal(intent.powerTh, 16);
  assert.equal(intent.amountUsd, 189.99);
  assert.equal(intent.expectedAmountAtomic, '189990000');
  assert.equal(intent.assetDecimals, 6);
  assert.equal(intent.commissionEligible, true);

  for (const badPower of [0, -1, -100, NaN, Infinity, 'abc', null, undefined, 5001, 7]) {
    await assert.rejects(
      () => service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', powerTh: badPower }),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_POWER_TH'
    );
  }
});

test('paymentIntentService: subscription creates order with commissionEligible=false and activatedMinerId=null', async () => {
  const { db, store } = createInMemoryFirestore(buildSeededDocs());
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-22T02:00:00.000Z'),
    idGenerator: () => 'pi_sub_1'
  });

  const intent = await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'subscription',
    packageId: 'mensual-plus',
    networkId: 'solana',
    assetSymbol: 'USDT'
  });

  assert.equal(intent.productType, 'subscription');
  assert.equal(intent.commissionEligible, false);
  assert.equal(intent.activatedMinerId, null);
  assert.equal(intent.amountUsd, 99.99);
  assert.equal(intent.expectedAmountAtomic, '99990000');
  assert.equal(intent.treasuryAddress, VALID_SOL_TREASURY);

  const mirror = store.get('admin_orders/pi_sub_1');
  assert.equal(mirror.productType, 'subscription');
  assert.equal(mirror.commissionEligible, false);
  assert.equal(mirror.activatedMinerId, null);

  // Mismatch: requesting miner on a subscription package must fail
  await assert.rejects(
    () => service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'mensual-plus' }),
    (err) => err instanceof PaymentIntentError && err.code === 'PRODUCT_TYPE_MISMATCH'
  );
});

test('paymentIntentService: native asset quote uses spotPriceProvider, records quote metadata, and validates senderWallet', async () => {
  const { db } = createInMemoryFirestore(buildSeededDocs());
  const spotCalls = [];
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-22T02:00:00.000Z'),
    idGenerator: () => 'pi_native_1',
    spotPriceProvider: async ({ assetSymbol, networkId }) => {
      spotCalls.push({ assetSymbol, networkId });
      return { priceUsd: '150', source: 'TEST_ORACLE' };
    }
  });

  const intent = await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    networkId: 'solana',
    assetSymbol: 'SOL',
    senderWallet: VALID_SOL_TREASURY
  });

  assert.deepEqual(spotCalls, [{ assetSymbol: 'SOL', networkId: 'solana' }]);
  assert.equal(intent.quotedSpotUsd, '150');
  assert.equal(intent.quoteSource, 'TEST_ORACLE');
  assert.equal(intent.quotedAt, '2026-11-22T02:00:00.000Z');
  assert.equal(intent.expiresAt, '2026-11-22T02:15:00.000Z');
  // $99.99 / $150 = 0.6666 -> 666600000 lamports exact
  assert.equal(intent.expectedAmountAtomic, '666600000');

  // EVM wallet on Solana network must fail
  await assert.rejects(
    () => service.createPaymentIntent({
      buyerUid: 'u1',
      productType: 'miner',
      packageId: 'minerx-02',
      networkId: 'solana',
      assetSymbol: 'SOL',
      senderWallet: VALID_EVM_TREASURY
    }),
    (err) => err instanceof PaymentConfigError && err.code === 'INVALID_WALLET_ADDRESS'
  );

  // Bad spot price fails closed
  const badSpotService = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    spotPriceProvider: async () => ({ priceUsd: '0', source: 'BAD_ORACLE' })
  });
  await assert.rejects(
    () => badSpotService.createPaymentIntent({
      buyerUid: 'u1',
      productType: 'miner',
      packageId: 'minerx-02',
      networkId: 'bsc',
      assetSymbol: 'BNB'
    }),
    (err) => err instanceof PaymentConfigError && err.code === 'INVALID_SPOT_PRICE'
  );
});

// ============================================================================
// 4. NON-RETROACTIVE DIRECT REFERRAL SNAPSHOT (sponsorUid)
// ============================================================================

test('paymentIntentService: sponsorUid snapshot is immutable and non-retroactive across intent creation and selectPaymentMethod', async () => {
  const { db, store } = createInMemoryFirestore(buildSeededDocs());
  let seq = 0;
  let currentNow = Date.parse('2026-11-22T02:00:00.000Z');
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => currentNow,
    idGenerator: () => `pi_ref_${++seq}`
  });

  // 1. u1 has NO sponsor -> creates OPEN intent #1
  const firstIntent = await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02'
  });
  assert.equal(firstIntent.status, PAYMENT_STATUSES.OPEN);
  assert.equal(firstIntent.sponsorUid, null);
  assert.equal(firstIntent.sponsorLinkedAt, null);
  assert.equal(firstIntent.referralSnapshotLocked, true);
  assert.equal(store.get('admin_orders/pi_ref_1').sponsorUid, null);
  assert.equal(store.get('admin_orders/pi_ref_1').referralSnapshotLocked, true);

  // 2. 1 second later, u1 links referredBy: 'u2'
  currentNow += 1000;
  store.set('users/u1', {
    ...store.get('users/u1'),
    referredBy: 'u2',
    sponsorLinkedAt: '2026-11-22T02:00:01.000Z'
  });

  // 3. Selecting payment method on intent #1 MUST keep sponsorUid: null (non-retroactive!)
  const updatedFirst = await service.selectPaymentMethod({
    intentId: 'pi_ref_1',
    requesterUid: 'u1',
    networkId: 'bsc',
    assetSymbol: 'USDT'
  });
  assert.equal(updatedFirst.status, PAYMENT_STATUSES.AWAITING);
  assert.equal(updatedFirst.sponsorUid, null);
  assert.equal(store.get('payment_intents/pi_ref_1').sponsorUid, null);
  assert.equal(store.get('admin_orders/pi_ref_1').sponsorUid, null);

  // 4. A NEW intent #2 created AFTER sponsor link MUST stamp sponsorUid: 'u2'
  currentNow += 1000;
  const secondIntent = await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    networkId: 'bsc',
    assetSymbol: 'USDT'
  });
  assert.equal(secondIntent.sponsorUid, 'u2');
  assert.equal(secondIntent.sponsorLinkedAt, '2026-11-22T02:00:01.000Z');
  assert.equal(secondIntent.referralSnapshotLocked, true);
  assert.equal(store.get('admin_orders/pi_ref_2').sponsorUid, 'u2');
});

test('paymentIntentService: resolves sponsor from sponsorId or referral.referrerBy code and blocks self-referral or post-dated link', async () => {
  const docs = buildSeededDocs();
  docs['users/u_self'] = { uid: 'u_self', sponsorId: 'u_self' };
  docs['users/u_code'] = { uid: 'u_code', referral: { referrerBy: 'sponsor2', joinDate: '2026-11-20T00:00:00.000Z' } };
  docs['users/u_future'] = { uid: 'u_future', sponsorId: 'u2', sponsorLinkedAt: '2026-11-22T03:00:00.000Z' };

  const { db } = createInMemoryFirestore(docs);
  let seq = 0;
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-22T02:00:00.000Z'),
    idGenerator: () => `pi_s_${++seq}`
  });

  const selfIntent = await service.createPaymentIntent({
    buyerUid: 'u_self',
    productType: 'miner',
    packageId: 'minerx-02'
  });
  assert.equal(selfIntent.sponsorUid, null);
  assert.equal(selfIntent.referralSnapshotLocked, true);

  const codeIntent = await service.createPaymentIntent({
    buyerUid: 'u_code',
    productType: 'miner',
    packageId: 'minerx-02'
  });
  assert.equal(codeIntent.sponsorUid, 'u2');
  assert.equal(codeIntent.sponsorLinkedAt, '2026-11-20T00:00:00.000Z');

  const futureIntent = await service.createPaymentIntent({
    buyerUid: 'u_future',
    productType: 'miner',
    packageId: 'minerx-02'
  });
  assert.equal(futureIntent.sponsorUid, null);
});

// ============================================================================
// 5. CONFIRMED BUG PREVENTION & ZERO PREMATURE onPurchaseSettled TRIGGER
// ============================================================================

test('paymentIntentService: OPEN, AWAITING, selectPaymentMethod, and CANCELLED never trigger onPurchaseSettled', async () => {
  const { db, store } = createInMemoryFirestore(buildSeededDocs());
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-22T02:00:00.000Z'),
    idGenerator: () => 'pi_nosettle_1'
  });

  await service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'minerx-02' });
  const orderOpen = store.get('admin_orders/pi_nosettle_1');
  const openTrigger = await handlePurchaseSettledEvent({
    beforeData: null,
    afterData: orderOpen,
    orderId: 'pi_nosettle_1',
    db,
    FieldValue: { increment: () => {}, serverTimestamp: () => 'TS' }
  });
  assert.equal(openTrigger.status, 'ignored');
  assert.equal(openTrigger.reason, 'NO_SETTLED_TRANSITION');

  await service.selectPaymentMethod({
    intentId: 'pi_nosettle_1',
    requesterUid: 'u1',
    networkId: 'polygon',
    assetSymbol: 'USDT'
  });
  const orderAwaiting = store.get('admin_orders/pi_nosettle_1');
  const awaitingTrigger = await handlePurchaseSettledEvent({
    beforeData: orderOpen,
    afterData: orderAwaiting,
    orderId: 'pi_nosettle_1',
    db,
    FieldValue: { increment: () => {}, serverTimestamp: () => 'TS' }
  });
  assert.equal(awaitingTrigger.status, 'ignored');
  assert.equal(awaitingTrigger.reason, 'NO_SETTLED_TRANSITION');
});

// ============================================================================
// 6. getPaymentIntent AUTHORIZATION & cancelPaymentIntent TRANSITIONS
// ============================================================================

test('paymentIntentService: getPaymentIntent enforces ownership/admin authz and computes isExpired without mutating settled orders', async () => {
  const { db, store } = createInMemoryFirestore(buildSeededDocs());
  let currentNow = Date.parse('2026-11-22T02:00:00.000Z');
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => currentNow,
    idGenerator: () => 'pi_get_1'
  });

  await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    networkId: 'bsc',
    assetSymbol: 'USDT'
  });

  const ownerRead = await service.getPaymentIntent({ intentId: 'pi_get_1', requesterUid: 'u1' });
  assert.equal(ownerRead.intentId, 'pi_get_1');
  assert.equal(ownerRead.isExpired, false);

  const adminRead = await service.getPaymentIntent({ intentId: 'pi_get_1', requesterUid: 'admin-1', isAdmin: true });
  assert.equal(adminRead.intentId, 'pi_get_1');

  await assert.rejects(
    () => service.getPaymentIntent({ intentId: 'pi_get_1', requesterUid: 'u2' }),
    (err) => err instanceof PaymentIntentError && err.code === 'FORBIDDEN'
  );
  await assert.rejects(
    () => service.getPaymentIntent({ intentId: 'pi_missing', requesterUid: 'u1' }),
    (err) => err instanceof PaymentIntentError && err.code === 'INTENT_NOT_FOUND'
  );

  // Advance past 15-min TTL
  currentNow = Date.parse('2026-11-22T02:16:00.000Z');
  const expiredRead = await service.getPaymentIntent({ intentId: 'pi_get_1', requesterUid: 'u1' });
  assert.equal(expiredRead.isExpired, true);
  assert.equal(store.get('payment_intents/pi_get_1').status, 'AWAITING');

  // Settled order is NEVER marked expired or mutated
  store.set('payment_intents/pi_get_1', {
    ...store.get('payment_intents/pi_get_1'),
    status: PAYMENT_STATUSES.SETTLED
  });
  const settledRead = await service.getPaymentIntent({ intentId: 'pi_get_1', requesterUid: 'u1' });
  assert.equal(settledRead.isExpired, false);
  assert.equal(settledRead.status, PAYMENT_STATUSES.SETTLED);
});

test('paymentIntentService: cancelPaymentIntent transitions OPEN/AWAITING to CANCELLED and blocks non-cancellable states or txHash', async () => {
  const { db, store } = createInMemoryFirestore(buildSeededDocs());
  let seq = 0;
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-22T02:00:00.000Z'),
    idGenerator: () => `pi_cancel_${++seq}`
  });

  // Cancel OPEN
  await service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'minerx-02' });
  const cancelledOpen = await service.cancelPaymentIntent({ intentId: 'pi_cancel_1', requesterUid: 'u1' });
  assert.equal(cancelledOpen.status, PAYMENT_STATUSES.CANCELLED);
  assert.equal(cancelledOpen.cancelReason, 'USER_CANCELLED');
  assert.equal(store.get('payment_intents/pi_cancel_1').status, PAYMENT_STATUSES.CANCELLED);
  assert.equal(store.get('admin_orders/pi_cancel_1').status, PAYMENT_STATUSES.CANCELLED);

  // Cancel AWAITING
  await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    networkId: 'bsc',
    assetSymbol: 'USDT'
  });
  await assert.rejects(
    () => service.cancelPaymentIntent({ intentId: 'pi_cancel_2', requesterUid: 'u2' }),
    (err) => err instanceof PaymentIntentError && err.code === 'FORBIDDEN'
  );
  const cancelledAwaiting = await service.cancelPaymentIntent({
    intentId: 'pi_cancel_2',
    requesterUid: 'admin-1',
    isAdmin: true,
    reason: 'ADMIN_ABORT'
  });
  assert.equal(cancelledAwaiting.status, PAYMENT_STATUSES.CANCELLED);
  assert.equal(cancelledAwaiting.cancelReason, 'ADMIN_ABORT');
  assert.equal(store.get('admin_orders/pi_cancel_2').status, PAYMENT_STATUSES.CANCELLED);

  // Already CANCELLED cannot be cancelled again
  await assert.rejects(
    () => service.cancelPaymentIntent({ intentId: 'pi_cancel_2', requesterUid: 'u1' }),
    (err) => err instanceof PaymentIntentError && err.code === 'INTENT_NOT_CANCELLABLE'
  );

  // PROCESSING, SETTLED, UNDERPAID, FAILED, EXPIRED cannot be cancelled
  for (const blockedStatus of ['PROCESSING', 'SETTLED', 'UNDERPAID', 'FAILED', 'EXPIRED']) {
    const id = `pi_blocked_${blockedStatus}`;
    store.set(`payment_intents/${id}`, {
      intentId: id,
      orderId: id,
      buyerUid: 'u1',
      status: blockedStatus,
      txHash: null
    });
    store.set(`admin_orders/${id}`, { orderId: id, intentId: id, status: blockedStatus });
    await assert.rejects(
      () => service.cancelPaymentIntent({ intentId: id, requesterUid: 'u1' }),
      (err) => err instanceof PaymentIntentError && err.code === 'INTENT_NOT_CANCELLABLE'
    );
  }

  // AWAITING with txHash already detected MUST NOT be cancelled
  store.set('payment_intents/pi_with_tx', {
    intentId: 'pi_with_tx',
    orderId: 'pi_with_tx',
    buyerUid: 'u1',
    status: PAYMENT_STATUSES.AWAITING,
    txHash: '0xabc123'
  });
  store.set('admin_orders/pi_with_tx', { orderId: 'pi_with_tx', intentId: 'pi_with_tx', status: PAYMENT_STATUSES.AWAITING });
  await assert.rejects(
    () => service.cancelPaymentIntent({ intentId: 'pi_with_tx', requesterUid: 'u1' }),
    (err) => err instanceof PaymentIntentError && err.code === 'INTENT_NOT_CANCELLABLE'
  );
});

test('paymentIntentService: createDefaultSpotPriceProvider validates HTTP responses and fails closed', async () => {
  const providerOk = createDefaultSpotPriceProvider({
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { binancecoin: { usd: 612.5 } };
      }
    })
  });
  const quote = await providerOk({ assetSymbol: 'BNB', networkId: 'bsc' });
  assert.equal(quote.priceUsd, '612.5');
  assert.equal(quote.source, 'COINGECKO_SIMPLE_PRICE');

  const providerFail = createDefaultSpotPriceProvider({
    fetchImpl: async () => ({ ok: false, status: 503, async json() { return {}; } })
  });
  await assert.rejects(
    () => providerFail({ assetSymbol: 'BNB', networkId: 'bsc' }),
    (err) => err instanceof PaymentIntentError && err.code === 'SPOT_PRICE_UNAVAILABLE'
  );
});

// ============================================================================
// 7. REVIEW REGRESSION TESTS (IMP-1 through IMP-6)
// ============================================================================

test('IMP-1: prototype property names on network/asset/family/coin lookups fail closed with typed errors', async () => {
  const env = buildTestEnv();
  for (const protoKey of ['constructor', '__proto__', 'toString', 'valueOf']) {
    assert.throws(
      () => resolvePaymentRoute({ networkId: protoKey, assetSymbol: 'USDT', env }),
      (err) => err instanceof PaymentConfigError && err.code === 'UNSUPPORTED_NETWORK'
    );
    assert.throws(
      () => resolvePaymentRoute({ networkId: 'bsc', assetSymbol: protoKey, env }),
      (err) => err instanceof PaymentConfigError && err.code === 'UNSUPPORTED_ASSET'
    );
    assert.throws(
      () => resolveTreasuryAddress(protoKey, env),
      (err) => err instanceof PaymentConfigError && err.code === 'UNSUPPORTED_NETWORK_FAMILY'
    );
  }

  const provider = createDefaultSpotPriceProvider({
    fetchImpl: async () => ({ ok: true, async json() { return {}; } })
  });
  await assert.rejects(
    () => provider({ assetSymbol: 'constructor', networkId: 'bsc' }),
    (err) => err instanceof PaymentIntentError && err.code === 'SPOT_PRICE_UNAVAILABLE'
  );
});

test('IMP-2: non-boolean isAdmin cannot bypass 401 actor check and null inputs return typed INVALID_INPUT', async () => {
  const { db } = createInMemoryFirestore(buildSeededDocs());
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-22T02:00:00.000Z'),
    idGenerator: () => 'pi_auth_1'
  });
  await service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'minerx-02' });

  for (const badAdmin of ['false', 'true', 1, {}, []]) {
    await assert.rejects(
      () => service.getPaymentIntent({ intentId: 'pi_nonexistent', isAdmin: badAdmin }),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_INPUT'
    );
    await assert.rejects(
      () => service.cancelPaymentIntent({ intentId: 'pi_nonexistent', isAdmin: badAdmin }),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_INPUT'
    );
    await assert.rejects(
      () => service.selectPaymentMethod({
        intentId: 'pi_auth_1',
        isAdmin: badAdmin,
        networkId: 'bsc',
        assetSymbol: 'USDT'
      }),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_INPUT'
    );
  }

  for (const badInput of [null, undefined, [], 'str', 123]) {
    await assert.rejects(
      () => service.getPaymentIntent(badInput),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_INPUT'
    );
    await assert.rejects(
      () => service.cancelPaymentIntent(badInput),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_INPUT'
    );
  }
});

test('IMP-3: convertUsdToAtomic supports >8 decimal and scientific-notation spot price strings exactly', () => {
  // $100 / $0.371234567 POL (9 decimal spot quote) -> exact BigInt ceil
  // amountInternal = 100 * 10^8 = 10_000_000_000n; spot = 371234567 / 10^9
  // exact atomic = ceil((10_000_000_000 * 10^18 * 10^9) / (10^8 * 371234567))
  const expectedHighPrec =
    (10_000_000_000n * 10n ** 18n * 10n ** 9n + (10n ** 8n * 371_234_567n) - 1n) /
    (10n ** 8n * 371_234_567n);
  const highPrec = convertUsdToAtomic({
    amountUsd: '100.00',
    assetDecimals: 18,
    spotPriceUsd: '0.371234567'
  });
  assert.equal(highPrec.expectedAmountAtomic, expectedHighPrec.toString());

  // Scientific-notation string spot quote ('5e-7')
  // $1 / $5e-7 = 2,000,000 tokens -> at 6 decimals = 2_000_000_000_000 atomic units
  const sciSpot = convertUsdToAtomic({
    amountUsd: '1.00',
    assetDecimals: 6,
    spotPriceUsd: '5e-7'
  });
  assert.equal(sciSpot.expectedAmountAtomic, '2000000000000');
});

test('IMP-4: createDefaultSpotPriceProvider wraps res.json() errors, passes timeout signal, and fails closed with 503 on invalid upstream quotes across all providers', async () => {
  let receivedSignal = null;
  const providerInvalidJson = createDefaultSpotPriceProvider({
    fetchImpl: async (_url, opts) => {
      receivedSignal = opts && opts.signal;
      return {
        ok: true,
        async json() {
          throw new SyntaxError('Unexpected token < in JSON');
        }
      };
    }
  });
  await assert.rejects(
    () => providerInvalidJson({ assetSymbol: 'BNB', networkId: 'bsc' }),
    (err) => err instanceof PaymentIntentError && err.code === 'SPOT_PRICE_UNAVAILABLE' && err.statusCode === 503
  );
  assert.ok(receivedSignal, 'expected AbortSignal timeout on upstream fetch');

  let badUsdCalls = 0;
  const providerBadUsd = createDefaultSpotPriceProvider({
    fetchImpl: async () => {
      badUsdCalls += 1;
      return {
        ok: true,
        async json() {
          return { binancecoin: { usd: -5 } };
        }
      };
    }
  });
  await assert.rejects(
    () => providerBadUsd({ assetSymbol: 'BNB', networkId: 'bsc' }),
    (err) => err instanceof PaymentIntentError && err.code === 'SPOT_PRICE_UNAVAILABLE' && err.statusCode === 503
  );
  assert.equal(badUsdCalls, 3, 'invalid upstream price must fall through all 3 spot providers before failing closed');
});

test('IMP-5: rejects Firestore path-traversal doc IDs and non-string packageId with typed 400 errors', async () => {
  const { db } = createInMemoryFirestore(buildSeededDocs());
  const service = createPaymentIntentService({ db, env: buildTestEnv() });

  for (const badId of ['a/b', 'a/b/c', '..', '.', 'user\\bad']) {
    await assert.rejects(
      () => service.createPaymentIntent({ buyerUid: badId, productType: 'miner', packageId: 'minerx-02' }),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_BUYER_UID' && err.statusCode === 400
    );
    await assert.rejects(
      () => service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: badId }),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_PACKAGE_ID' && err.statusCode === 400
    );
    await assert.rejects(
      () => service.getPaymentIntent({ intentId: badId, requesterUid: 'u1' }),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_INTENT_ID' && err.statusCode === 400
    );
  }

  await assert.rejects(
    () => service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 12345, powerTh: 16 }),
    (err) => err instanceof PaymentIntentError && err.code === 'INVALID_PACKAGE_ID' && err.statusCode === 400
  );
});

test('IMP-6: selectPaymentMethod enforces authz, state guards, expiry, external I/O outside tx, TOCTOU race safety, and CANCELLED never triggers onPurchaseSettled', async () => {
  const { db, store } = createInMemoryFirestore(buildSeededDocs());
  let currentNow = Date.parse('2026-11-22T02:00:00.000Z');
  let insideTransaction = false;
  const origRunTransaction = db.runTransaction.bind(db);
  db.runTransaction = async (fn) => {
    insideTransaction = true;
    try {
      return await origRunTransaction(fn);
    } finally {
      insideTransaction = false;
    }
  };

  let spotCalledInsideTx = null;
  let onSpotQuote = null;
  let seq = 0;
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => currentNow,
    idGenerator: () => `pi_sel_${++seq}`,
    spotPriceProvider: async () => {
      spotCalledInsideTx = insideTransaction;
      if (onSpotQuote) await onSpotQuote();
      return { priceUsd: '600', source: 'TEST_ORACLE' };
    }
  });

  // 1. Missing intent & unauthorized caller & admin allowed
  await assert.rejects(
    () => service.selectPaymentMethod({ intentId: 'pi_missing', requesterUid: 'u1', networkId: 'bsc', assetSymbol: 'BNB' }),
    (err) => err instanceof PaymentIntentError && err.code === 'INTENT_NOT_FOUND'
  );

  await service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'minerx-02' });
  await assert.rejects(
    () => service.selectPaymentMethod({ intentId: 'pi_sel_1', requesterUid: 'u2', networkId: 'bsc', assetSymbol: 'BNB' }),
    (err) => err instanceof PaymentIntentError && err.code === 'FORBIDDEN'
  );
  await assert.rejects(
    () => service.selectPaymentMethod({ intentId: 'pi_sel_1', networkId: 'bsc', assetSymbol: 'BNB' }),
    (err) => err instanceof PaymentIntentError && err.code === 'INVALID_REQUESTER_UID'
  );

  // Admin selects method -> spotPriceProvider MUST run outside runTransaction
  const selected = await service.selectPaymentMethod({
    intentId: 'pi_sel_1',
    requesterUid: 'admin-1',
    isAdmin: true,
    networkId: 'bsc',
    assetSymbol: 'BNB'
  });
  assert.equal(selected.status, PAYMENT_STATUSES.AWAITING);
  assert.equal(spotCalledInsideTx, false);

  // SCRUM-373 / ADR-0010: Re-selecting payment method in-place on AWAITING (txHash == null, unexpired)
  // succeeds, updates route/quote/treasury/expiresAt & /admin_orders, and preserves intentId, createdAt & sponsorUid
  currentNow += 2000;
  const reselected = await service.selectPaymentMethod({
    intentId: 'pi_sel_1',
    requesterUid: 'u1',
    networkId: 'bsc',
    assetSymbol: 'USDT'
  });
  assert.equal(reselected.intentId, 'pi_sel_1');
  assert.equal(reselected.status, PAYMENT_STATUSES.AWAITING);
  assert.equal(reselected.paymentNetwork, 'bsc');
  assert.equal(reselected.paymentAsset, 'USDT');
  assert.equal(reselected.expectedAmountAtomic, '99990000000000000000');
  assert.equal(reselected.createdAt, selected.createdAt);
  assert.equal(reselected.sponsorUid, selected.sponsorUid);
  assert.equal(reselected.referralSnapshotLocked, true);
  assert.notEqual(reselected.expiresAt, selected.expiresAt);
  const mirroredOrder = store.get('admin_orders/pi_sel_1');
  assert.equal(mirroredOrder.cryptoAsset, 'USDT');
  assert.equal(mirroredOrder.cryptoAmount, '99.99 USDT');
  assert.equal(mirroredOrder.recipientAddress, VALID_EVM_TREASURY);

  // Calling selectPaymentMethod when txHash is present or in any non-selectable status -> 409 INVALID_STATUS_TRANSITION
  store.set('payment_intents/pi_sel_1', {
    ...store.get('payment_intents/pi_sel_1'),
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  });
  await assert.rejects(
    () => service.selectPaymentMethod({ intentId: 'pi_sel_1', requesterUid: 'u1', networkId: 'polygon', assetSymbol: 'USDT' }),
    (err) => err instanceof PaymentIntentError && err.code === 'INVALID_STATUS_TRANSITION' && err.statusCode === 409
  );
  for (const lockedStatus of [
    PAYMENT_STATUSES.PROCESSING,
    PAYMENT_STATUSES.SETTLED,
    PAYMENT_STATUSES.CANCELLED,
    PAYMENT_STATUSES.EXPIRED,
    PAYMENT_STATUSES.UNDERPAID,
    PAYMENT_STATUSES.FAILED
  ]) {
    store.set('payment_intents/pi_sel_1', {
      ...store.get('payment_intents/pi_sel_1'),
      status: lockedStatus,
      txHash: null
    });
    await assert.rejects(
      () => service.selectPaymentMethod({ intentId: 'pi_sel_1', requesterUid: 'u1', networkId: 'polygon', assetSymbol: 'USDT' }),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_STATUS_TRANSITION' && err.statusCode === 409
    );
  }

  // 2. TOCTOU race: intent cancelled while awaiting slow spotPriceProvider -> tx rejects INVALID_STATUS_TRANSITION
  await service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'minerx-02' });
  onSpotQuote = async () => {
    await service.cancelPaymentIntent({ intentId: 'pi_sel_2', requesterUid: 'u1' });
  };
  await assert.rejects(
    () => service.selectPaymentMethod({ intentId: 'pi_sel_2', requesterUid: 'u1', networkId: 'bsc', assetSymbol: 'BNB' }),
    (err) => err instanceof PaymentIntentError && err.code === 'INVALID_STATUS_TRANSITION'
  );
  onSpotQuote = null;

  // Verify CANCELLED order never triggers onPurchaseSettled
  const cancelledOrder = store.get('admin_orders/pi_sel_2');
  assert.equal(cancelledOrder.status, PAYMENT_STATUSES.CANCELLED);
  const cancelTrigger = await handlePurchaseSettledEvent({
    beforeData: { status: PAYMENT_STATUSES.OPEN },
    afterData: cancelledOrder,
    orderId: 'pi_sel_2',
    db,
    FieldValue: { increment: () => {}, serverTimestamp: () => 'TS' }
  });
  assert.equal(cancelTrigger.status, 'ignored');
  assert.equal(cancelTrigger.reason, 'NO_SETTLED_TRANSITION');

  // 3. Expiry inside runTransaction after slow spotPriceProvider
  await service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'minerx-02' });
  onSpotQuote = async () => {
    currentNow += 16 * 60 * 1000;
  };
  await assert.rejects(
    () => service.selectPaymentMethod({ intentId: 'pi_sel_3', requesterUid: 'u1', networkId: 'bsc', assetSymbol: 'BNB' }),
    (err) => err instanceof PaymentIntentError && err.code === 'INTENT_EXPIRED'
  );
  onSpotQuote = null;

  // 4. Pre-quote expiry rejects without calling spotPriceProvider
  let preExpiredSpotCalled = false;
  onSpotQuote = async () => { preExpiredSpotCalled = true; };
  await assert.rejects(
    () => service.selectPaymentMethod({ intentId: 'pi_sel_3', requesterUid: 'u1', networkId: 'bsc', assetSymbol: 'BNB' }),
    (err) => err instanceof PaymentIntentError && err.code === 'INTENT_EXPIRED'
  );
  assert.equal(preExpiredSpotCalled, false);
});

// ============================================================================
// 8. ITERATION 1 SECURITY HARDENING TESTS (SCRUM-343)
// ============================================================================

test('ITER1-1: selectPaymentMethod, getPaymentIntent, and cancelPaymentIntent reject buyerUid-only calls with 401 INVALID_REQUESTER_UID', async () => {
  const { db } = createInMemoryFirestore(buildSeededDocs());
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-22T02:00:00.000Z'),
    idGenerator: () => 'pi_iter1_auth'
  });

  await service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'minerx-02' });

  await assert.rejects(
    () => service.getPaymentIntent({ intentId: 'pi_iter1_auth', buyerUid: 'u1' }),
    (err) => err instanceof PaymentIntentError && err.code === 'INVALID_REQUESTER_UID' && err.statusCode === 401
  );
  await assert.rejects(
    () => service.selectPaymentMethod({
      intentId: 'pi_iter1_auth',
      buyerUid: 'u1',
      networkId: 'bsc',
      assetSymbol: 'USDT'
    }),
    (err) => err instanceof PaymentIntentError && err.code === 'INVALID_REQUESTER_UID' && err.statusCode === 401
  );
  await assert.rejects(
    () => service.cancelPaymentIntent({ intentId: 'pi_iter1_auth', buyerUid: 'u1' }),
    (err) => err instanceof PaymentIntentError && err.code === 'INVALID_REQUESTER_UID' && err.statusCode === 401
  );
});

test('ITER1-2: isValidSolanaAddress and resolveTreasuryAddress reject Solana System Program and all-ones burn addresses', () => {
  const systemProgram = '11111111111111111111111111111111';
  const allOnes44 = '1'.repeat(44);

  for (const burnAddr of [systemProgram, allOnes44]) {
    assert.equal(isValidSolanaAddress(burnAddr), false);
    assert.throws(
      () => resolveTreasuryAddress('solana', { TREASURY_SOLANA_ADDRESS: burnAddr }),
      (err) => err instanceof PaymentConfigError && err.code === 'INVALID_TREASURY_ADDRESS'
    );
    assert.throws(
      () => validateWalletAddress(burnAddr, 'solana'),
      (err) => err instanceof PaymentConfigError && err.code === 'INVALID_WALLET_ADDRESS'
    );
  }
});

test('ITER1-3: rejects non-string senderWallet with INVALID_WALLET_ADDRESS and invalid/oversized/control-char cancelReason with INVALID_CANCEL_REASON', async () => {
  const { db } = createInMemoryFirestore(buildSeededDocs());
  let seq = 0;
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-22T02:00:00.000Z'),
    idGenerator: () => `pi_iter1_val_${++seq}`
  });

  // Non-string senderWallet rejected on createPaymentIntent (with and without networkId)
  for (const badWallet of [[], {}, 123, true]) {
    await assert.rejects(
      () => service.createPaymentIntent({
        buyerUid: 'u1',
        productType: 'miner',
        packageId: 'minerx-02',
        networkId: 'bsc',
        assetSymbol: 'USDT',
        senderWallet: badWallet
      }),
      (err) => err instanceof PaymentConfigError && err.code === 'INVALID_WALLET_ADDRESS'
    );
    await assert.rejects(
      () => service.createPaymentIntent({
        buyerUid: 'u1',
        productType: 'miner',
        packageId: 'minerx-02',
        senderWallet: badWallet
      }),
      (err) => err instanceof PaymentConfigError && err.code === 'INVALID_WALLET_ADDRESS'
    );
  }

  // Non-string senderWallet rejected on selectPaymentMethod
  await service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'minerx-02' });
  for (const badWallet of [[], {}, 123, true]) {
    await assert.rejects(
      () => service.selectPaymentMethod({
        intentId: 'pi_iter1_val_1',
        requesterUid: 'u1',
        networkId: 'bsc',
        assetSymbol: 'USDT',
        senderWallet: badWallet
      }),
      (err) => err instanceof PaymentConfigError && err.code === 'INVALID_WALLET_ADDRESS'
    );
  }

  // Invalid cancelReason rejected with 400 INVALID_CANCEL_REASON
  for (const badReason of ['a'.repeat(201), 'line1\nline2', 'null\x00byte', 'del\x7Fchar', 123, {}, []]) {
    await assert.rejects(
      () => service.cancelPaymentIntent({
        intentId: 'pi_iter1_val_1',
        requesterUid: 'u1',
        reason: badReason
      }),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_CANCEL_REASON' && err.statusCode === 400
    );
  }

  // Valid 200-char reason succeeds
  const cancelled = await service.cancelPaymentIntent({
    intentId: 'pi_iter1_val_1',
    requesterUid: 'u1',
    reason: 'x'.repeat(200)
  });
  assert.equal(cancelled.status, PAYMENT_STATUSES.CANCELLED);
  assert.equal(cancelled.cancelReason.length, 200);
});

test('ITER1-4: E2E handlePurchaseSettledEvent enforces locked non-retroactive sponsorUid snapshot and credits 10% only for post-link orders', async () => {
  const { db, store } = createInMemoryFirestore(buildSeededDocs());
  let seq = 0;
  let currentNow = Date.parse('2026-11-22T02:00:00.000Z');
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => currentNow,
    idGenerator: () => `pi_e2e_${++seq}`
  });

  // FieldValue simulator compatible with directReferralService.js
  const FieldValue = {
    increment(delta) {
      return { __op: 'increment', delta };
    },
    serverTimestamp() {
      return 'SERVER_TIMESTAMP';
    }
  };
  const origRunTx = db.runTransaction.bind(db);
  db.runTransaction = async (fn) => {
    const res = await origRunTx(fn);
    // Resolve FieldValue.increment markers written into in-memory store
    for (const [docPath, docData] of store.entries()) {
      let changed = false;
      const next = { ...docData };
      for (const [k, v] of Object.entries(next)) {
        if (v && typeof v === 'object' && v.__op === 'increment') {
          next[k] = Number(v.delta.toFixed(6));
          changed = true;
        }
      }
      if (changed) store.set(docPath, next);
    }
    return res;
  };

  // 1. u1 creates intent #1 BEFORE having any sponsor -> sponsorUid: null, referralSnapshotLocked: true
  await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    networkId: 'bsc',
    assetSymbol: 'USDT'
  });

  // 2. u1 later links sponsorId: 'u2' (active sponsor)
  currentNow += 5000;
  store.set('users/u1', {
    ...store.get('users/u1'),
    sponsorId: 'u2',
    sponsorLinkedAt: new Date(currentNow).toISOString()
  });
  store.set('users/u2', {
    ...store.get('users/u2'),
    status: 'active'
  });

  // 3. Order #1 settles -> MUST remain non-retroactive (rejected MISSING_SPONSOR, 0 commission credited)
  const order1Before = store.get('admin_orders/pi_e2e_1');
  const order1After = {
    ...order1Before,
    status: 'SETTLED',
    activatedMinerId: 'miner_e2e_1',
    settledAt: '2026-11-22T02:05:00.000Z'
  };
  const res1 = await handlePurchaseSettledEvent({
    beforeData: order1Before,
    afterData: order1After,
    orderId: 'pi_e2e_1',
    db,
    FieldValue
  });
  assert.equal(res1.status, 'rejected');
  assert.equal(res1.reason, 'MISSING_SPONSOR');
  assert.equal(res1.commissionUsdt6, '0.000000');
  assert.equal(store.get('userBalances/u2'), undefined);

  // 4. u1 creates intent #2 AFTER linking u2 -> sponsorUid: 'u2', referralSnapshotLocked: true
  currentNow += 1000;
  await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    networkId: 'bsc',
    assetSymbol: 'USDT'
  });
  const order2Before = store.get('admin_orders/pi_e2e_2');
  assert.equal(order2Before.sponsorUid, 'u2');
  assert.equal(order2Before.referralSnapshotLocked, true);

  // 5. Order #2 settles -> MUST credit exact 10% of $99.99 = 9.999000 USDT in userBalances/u2
  const order2After = {
    ...order2Before,
    status: 'SETTLED',
    activatedMinerId: 'miner_e2e_2',
    settledAt: '2026-11-22T02:06:00.000Z'
  };
  const res2 = await handlePurchaseSettledEvent({
    beforeData: order2Before,
    afterData: order2After,
    orderId: 'pi_e2e_2',
    db,
    FieldValue
  });
  assert.equal(res2.status, 'credited');
  assert.equal(res2.sponsorUid, 'u2');
  assert.equal(res2.commissionUsdt6, '9.999000');
  const u2Balance = store.get('userBalances/u2');
  assert.ok(u2Balance);
  assert.equal(u2Balance.usdtAvailable, 9.999);
  assert.equal(u2Balance.availableBalanceMicros, 9999000);
});

test('ITER1-5: rejects/neutralizes invalid Firestore doc-ID sponsorUid and covers locked referral edge cases, authz, Solana burn, senderWallet falsy, and cancelReason whitespace', async () => {
  const docs = buildSeededDocs();
  docs['users/u_bad_spon'] = { uid: 'u_bad_spon', sponsorId: 'a/b' };
  docs['users/blocked-sponsor'] = { uid: 'blocked-sponsor', status: 'blocked' };
  docs['users/u_code_later'] = { uid: 'u_code_later', referral: { referrerBy: 'SPONSOR2' } };

  const { db, store } = createInMemoryFirestore(docs);
  let seq = 0;
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-22T02:00:00.000Z'),
    idGenerator: () => `pi_iter1_edge_${++seq}`
  });

  // IMP-1: malformed single-segment sponsorId ('a/b') must NOT be snapshotted into intent/order
  const badSponIntent = await service.createPaymentIntent({
    buyerUid: 'u_bad_spon',
    productType: 'miner',
    packageId: 'minerx-02'
  });
  assert.equal(badSponIntent.sponsorUid, null);
  assert.equal(store.get('admin_orders/pi_iter1_edge_1').sponsorUid, null);

  // IMP-1 in directReferralService: locked malformed sponsorUid ('a/b' or '..') must never call doc('a/b')
  const origDoc = db.collection.bind(db);
  const guardedDb = {
    ...db,
    collection(name) {
      const col = origDoc(name);
      const rawDoc = col.doc.bind(col);
      return {
        ...col,
        doc(id) {
          if (typeof id !== 'string' || id.includes('/') || id === '.' || id === '..') {
            throw new Error(`Invalid Firestore doc path segment: ${id}`);
          }
          return rawDoc(id);
        }
      };
    }
  };
  const FieldValue = {
    increment(delta) {
      return { __op: 'increment', delta };
    },
    serverTimestamp() {
      return 'SERVER_TIMESTAMP';
    }
  };

  for (const [label, lockedSponsorUid, expectedReason] of [
    ['path_traversal', 'a/b', 'MISSING_SPONSOR'],
    ['dotdot', '..', 'MISSING_SPONSOR'],
    ['self_ref', 'u_code_later', 'MISSING_SPONSOR'],
    ['whitespace', '   ', 'MISSING_SPONSOR'],
    ['non_string', 123, 'MISSING_SPONSOR'],
    ['omitted', undefined, 'MISSING_SPONSOR'],
    ['null_blocks_code_fallback', null, 'MISSING_SPONSOR'],
    ['blocked_sponsor', 'blocked-sponsor', 'INACTIVE_SPONSOR']
  ]) {
    const res = await handlePurchaseSettledEvent({
      beforeData: { status: 'AWAITING' },
      afterData: {
        orderId: `ord_locked_${label}`,
        buyerUid: 'u_code_later',
        productType: 'miner',
        activatedMinerId: `miner_locked_${label}`,
        netPaidUsdt: '99.990000',
        status: 'SETTLED',
        referralSnapshotLocked: true,
        ...(lockedSponsorUid !== undefined ? { sponsorUid: lockedSponsorUid } : {})
      },
      orderId: `ord_locked_${label}`,
      db: guardedDb,
      FieldValue
    });
    assert.equal(res.status, 'rejected', `expected rejected for ${label}`);
    assert.equal(res.reason, expectedReason, `unexpected reason for ${label}`);
  }

  // Backward compatibility: unlocked orders (false / 'true' / omitted) still resolve via users/{uid}
  store.set('users/u2', { ...store.get('users/u2'), status: 'active' });
  for (const [label, lockFlag] of [
    ['false', false],
    ['string_true', 'true'],
    ['omitted', undefined]
  ]) {
    const res = await handlePurchaseSettledEvent({
      beforeData: { status: 'PENDING' },
      afterData: {
        orderId: `ord_legacy_${label}`,
        buyerUid: 'u_code_later',
        productType: 'miner',
        activatedMinerId: `miner_legacy_${label}`,
        netPaidUsdt: '99.990000',
        status: 'SETTLED',
        ...(lockFlag !== undefined ? { referralSnapshotLocked: lockFlag } : {})
      },
      orderId: `ord_legacy_${label}`,
      db: guardedDb,
      FieldValue
    });
    assert.equal(res.status, 'credited', `legacy unlocked order (${label}) must still credit`);
    assert.equal(res.sponsorUid, 'u2');
  }

  // resolveActorUid edge cases: empty/whitespace/non-string requesterUid -> 401; buyerUid cannot override requesterUid -> 403; isAdmin without requesterUid allowed
  await service.createPaymentIntent({ buyerUid: 'u1', productType: 'miner', packageId: 'minerx-02' });
  for (const badReq of ['', '   ', 123]) {
    await assert.rejects(
      () => service.getPaymentIntent({ intentId: 'pi_iter1_edge_2', requesterUid: badReq }),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_REQUESTER_UID' && err.statusCode === 401
    );
  }
  await assert.rejects(
    () => service.getPaymentIntent({ intentId: 'pi_iter1_edge_2', requesterUid: 'u2', buyerUid: 'u1' }),
    (err) => err instanceof PaymentIntentError && err.code === 'FORBIDDEN' && err.statusCode === 403
  );
  const adminNoUid = await service.getPaymentIntent({ intentId: 'pi_iter1_edge_2', isAdmin: true });
  assert.equal(adminNoUid.intentId, 'pi_iter1_edge_2');

  // Solana padded burn address & valid base58 containing '1's + end-to-end rejection
  assert.equal(isValidSolanaAddress(' 11111111111111111111111111111111 '), false);
  assert.equal(isValidSolanaAddress('So11111111111111111111111111111111111111112'), true);
  assert.throws(
    () => resolvePaymentRoute({
      networkId: 'solana',
      assetSymbol: 'USDT',
      env: buildTestEnv({ PAYMENT_TESTNET_USDT_SOLANA_MINT: '11111111111111111111111111111111' })
    }),
    (err) => err instanceof PaymentConfigError && err.code === 'INVALID_TOKEN_CONTRACT'
  );
  await assert.rejects(
    () => service.createPaymentIntent({
      buyerUid: 'u1',
      productType: 'miner',
      packageId: 'minerx-02',
      networkId: 'solana',
      assetSymbol: 'SOL',
      senderWallet: '11111111111111111111111111111111'
    }),
    (err) => err instanceof PaymentConfigError && err.code === 'INVALID_WALLET_ADDRESS'
  );

  // senderWallet falsy non-strings (false, 0) rejected; empty/whitespace allowed as null
  for (const falsyBad of [false, 0]) {
    await assert.rejects(
      () => service.createPaymentIntent({
        buyerUid: 'u1',
        productType: 'miner',
        packageId: 'minerx-02',
        senderWallet: falsyBad
      }),
      (err) => err instanceof PaymentConfigError && err.code === 'INVALID_WALLET_ADDRESS'
    );
  }
  const emptyWalletIntent = await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    networkId: 'bsc',
    assetSymbol: 'USDT',
    senderWallet: '   '
  });
  assert.equal(emptyWalletIntent.senderWallet, null);

  // cancelPaymentIntent \r / \t rejected; null / '' / '   ' default to USER_CANCELLED
  for (const ctrl of ['bad\rreason', 'bad\treason']) {
    await assert.rejects(
      () => service.cancelPaymentIntent({ intentId: 'pi_iter1_edge_2', requesterUid: 'u1', reason: ctrl }),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_CANCEL_REASON' && err.statusCode === 400
    );
  }
  const cancelledDefault = await service.cancelPaymentIntent({
    intentId: 'pi_iter1_edge_2',
    requesterUid: 'u1',
    reason: '   '
  });
  assert.equal(cancelledDefault.cancelReason, 'USER_CANCELLED');
});

// ============================================================================
// 9. SCRUM-373: DETERMINISTIC IDEMPOTENCY & IN-PLACE METHOD RE-SELECTION
// ============================================================================

test('SCRUM-373-1: createPaymentIntent deduplicates sequential and concurrent (Promise.all) calls with same (buyerUid, idempotencyKey) and preserves sponsorUid', async () => {
  const docs = buildSeededDocs();
  docs['users/u1'] = {
    ...docs['users/u1'],
    sponsorId: 'u2',
    sponsorLinkedAt: '2026-11-20T00:00:00.000Z'
  };
  const { db, store } = createInMemoryFirestore(docs);
  let currentNow = Date.parse('2026-11-24T10:00:00.000Z');
  let spotCalls = 0;
  let txWriteCount = 0;
  const origRunTx = db.runTransaction.bind(db);
  db.runTransaction = (fn) =>
    origRunTx((tx) => {
      const wrappedTx = {
        get: tx.get.bind(tx),
        set(docRef, data, opts) {
          txWriteCount += 1;
          return tx.set(docRef, data, opts);
        },
        update(docRef, data) {
          txWriteCount += 1;
          return tx.update(docRef, data);
        }
      };
      return fn(wrappedTx);
    });

  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => {
      currentNow += 1;
      return currentNow;
    },
    spotPriceProvider: async () => {
      spotCalls += 1;
      await new Promise((r) => setTimeout(r, 15));
      return { priceUsd: '600', source: 'TEST_ORACLE' };
    }
  });

  const key = 'chk_a1b2c3d4e5f60718293a4b5c6d7e8f90';

  // Concurrent calls (both miss pre-read and race into db.runTransaction)
  const [first, second] = await Promise.all([
    service.createPaymentIntent({
      buyerUid: 'u1',
      productType: 'miner',
      packageId: 'minerx-02',
      networkId: 'bsc',
      assetSymbol: 'BNB',
      idempotencyKey: key
    }),
    service.createPaymentIntent({
      buyerUid: 'u1',
      productType: 'miner',
      packageId: 'minerx-02',
      networkId: 'bsc',
      assetSymbol: 'BNB',
      idempotencyKey: key
    })
  ]);

  assert.match(first.intentId, /^pi_[a-f0-9]{32}$/);
  assert.equal(second.intentId, first.intentId);
  assert.equal(first.status, PAYMENT_STATUSES.AWAITING);
  assert.equal(first.idempotencyKey, key);
  assert.equal(second.idempotencyKey, key);
  assert.equal(first.sponsorUid, 'u2');
  assert.equal(second.sponsorUid, 'u2');
  assert.equal(second.createdAt, first.createdAt);

  const intentDocs = [...store.keys()].filter((k) => k.startsWith('payment_intents/'));
  const orderDocs = [...store.keys()].filter((k) => k.startsWith('admin_orders/'));
  assert.equal(intentDocs.length, 1);
  assert.equal(orderDocs.length, 1);
  assert.equal(txWriteCount, 2, 'concurrent loser transaction must execute 0 writes (only winner writes intent + order)');
  assert.equal(store.get(`admin_orders/${first.intentId}`).idempotencyKey, key);

  // Mutate user's sponsor later and call sequentially -> pre-read hit returns original doc, 0 extra spot calls
  store.set('users/u1', { ...store.get('users/u1'), sponsorId: 'u_other_later' });
  const spotCallsBeforeReplay = spotCalls;
  currentNow += 5000;
  const third = await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    networkId: 'bsc',
    assetSymbol: 'BNB',
    idempotencyKey: `  ${key}  `
  });

  assert.equal(third.intentId, first.intentId);
  assert.equal(third.sponsorUid, 'u2');
  assert.equal(third.createdAt, first.createdAt);
  assert.equal(spotCalls, spotCallsBeforeReplay, 'pre-read idempotent hit must not invoke spot oracle');
  assert.equal([...store.keys()].filter((k) => k.startsWith('payment_intents/')).length, 1);
  assert.equal([...store.keys()].filter((k) => k.startsWith('admin_orders/')).length, 1);
});

test('SCRUM-373-2: isolates identical idempotencyKey across distinct buyerUids', async () => {
  const { db, store } = createInMemoryFirestore(buildSeededDocs());
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-24T10:05:00.000Z')
  });

  const sharedKey = 'chk_shared_key_across_two_buyers_01';
  const intentU1 = await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    idempotencyKey: sharedKey
  });
  const intentU2 = await service.createPaymentIntent({
    buyerUid: 'u2',
    productType: 'miner',
    packageId: 'minerx-02',
    idempotencyKey: sharedKey
  });

  assert.notEqual(intentU1.intentId, intentU2.intentId);
  assert.match(intentU1.intentId, /^pi_[a-f0-9]{32}$/);
  assert.match(intentU2.intentId, /^pi_[a-f0-9]{32}$/);
  assert.equal(intentU1.buyerUid, 'u1');
  assert.equal(intentU2.buyerUid, 'u2');
  assert.equal([...store.keys()].filter((k) => k.startsWith('payment_intents/')).length, 2);

  // Defense-in-depth: if a pre-existing doc at the deterministic path belongs to another buyerUid -> 403 FORBIDDEN
  store.set(`payment_intents/${intentU1.intentId}`, {
    ...store.get(`payment_intents/${intentU1.intentId}`),
    buyerUid: 'u2'
  });
  await assert.rejects(
    () => service.createPaymentIntent({
      buyerUid: 'u1',
      productType: 'miner',
      packageId: 'minerx-02',
      idempotencyKey: sharedKey
    }),
    (err) => err instanceof PaymentIntentError && err.code === 'FORBIDDEN' && err.statusCode === 403
  );
});

test('SCRUM-373-3: rejects 409 IDEMPOTENCY_KEY_CONFLICT when reusing key with different product/package/powerTh/amount', async () => {
  const { db, store } = createInMemoryFirestore(buildSeededDocs());
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-24T10:10:00.000Z')
  });

  const key = 'chk_conflict_guard_12345678';
  await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    idempotencyKey: key
  });

  // Different productType / packageId
  await assert.rejects(
    () => service.createPaymentIntent({
      buyerUid: 'u1',
      productType: 'subscription',
      packageId: 'mensual-plus',
      idempotencyKey: key
    }),
    (err) => err instanceof PaymentIntentError && err.code === 'IDEMPOTENCY_KEY_CONFLICT' && err.statusCode === 409
  );

  // Different custom powerTh
  await assert.rejects(
    () => service.createPaymentIntent({
      buyerUid: 'u1',
      productType: 'miner',
      powerTh: 16,
      idempotencyKey: key
    }),
    (err) => err instanceof PaymentIntentError && err.code === 'IDEMPOTENCY_KEY_CONFLICT' && err.statusCode === 409
  );

  // Changed catalog price (amountMicroUsdt mismatch)
  store.set('commercial_packages/minerx-02', {
    ...store.get('commercial_packages/minerx-02'),
    priceUsdt: 149.99
  });
  await assert.rejects(
    () => service.createPaymentIntent({
      buyerUid: 'u1',
      productType: 'miner',
      packageId: 'minerx-02',
      idempotencyKey: key
    }),
    (err) => err instanceof PaymentIntentError && err.code === 'IDEMPOTENCY_KEY_CONFLICT' && err.statusCode === 409
  );

  // Concurrent tx-level conflict: two different products race from cold store with the same idempotencyKey
  const raceKey = 'chk_concurrent_conflict_9999';
  const raceResults = await Promise.allSettled([
    service.createPaymentIntent({
      buyerUid: 'u1',
      productType: 'miner',
      packageId: 'minerx-02',
      idempotencyKey: raceKey
    }),
    service.createPaymentIntent({
      buyerUid: 'u1',
      productType: 'subscription',
      packageId: 'mensual-plus',
      idempotencyKey: raceKey
    })
  ]);
  const fulfilled = raceResults.filter((r) => r.status === 'fulfilled');
  const rejected = raceResults.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof PaymentIntentError);
  assert.equal(rejected[0].reason.code, 'IDEMPOTENCY_KEY_CONFLICT');
  assert.equal(rejected[0].reason.statusCode, 409);
});

test('SCRUM-373-4: rejects 400 INVALID_IDEMPOTENCY_KEY for malformed keys and preserves backward compatibility when omitted', async () => {
  const { db } = createInMemoryFirestore(buildSeededDocs());
  let seq = 0;
  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => Date.parse('2026-11-24T10:15:00.000Z'),
    idGenerator: () => `pi_compat_${++seq}`
  });

  for (const badKey of [
    '',
    '       ',
    'short7_',
    'a'.repeat(129),
    'bad/slash_key_123',
    'bad\\back_key_123',
    'bad space key 123',
    'bad\nnewline_123',
    'bad\x00null_123',
    12345678,
    true,
    {},
    []
  ]) {
    await assert.rejects(
      () => service.createPaymentIntent({
        buyerUid: 'u1',
        productType: 'miner',
        packageId: 'minerx-02',
        idempotencyKey: badKey
      }),
      (err) => err instanceof PaymentIntentError && err.code === 'INVALID_IDEMPOTENCY_KEY' && err.statusCode === 400
    );
  }

  // Omitted / null idempotencyKey preserves generateId() backward compatibility
  const compat1 = await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02'
  });
  const compat2 = await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    idempotencyKey: null
  });
  assert.equal(compat1.intentId, 'pi_compat_1');
  assert.equal(compat1.idempotencyKey, 'pi_compat_1');
  assert.equal(compat2.intentId, 'pi_compat_2');
  assert.equal(compat2.idempotencyKey, 'pi_compat_2');
});

test('SCRUM-373-5: multiple in-place method switches (bsc/USDT -> polygon/POL -> solana/SOL -> bsc/BNB) keep 1 intent, 0 CANCELLED orders, sync /admin_orders, and block TOCTOU txHash race', async () => {
  const docs = buildSeededDocs();
  docs['users/u1'] = {
    ...docs['users/u1'],
    sponsorId: 'u2',
    sponsorLinkedAt: '2026-11-20T00:00:00.000Z'
  };
  const { db, store } = createInMemoryFirestore(docs);
  let currentNow = Date.parse('2026-11-24T10:20:00.000Z');
  const spotPrices = { BNB: '600', POL: '0.50', SOL: '200' };
  let onQuote = null;

  const service = createPaymentIntentService({
    db,
    env: buildTestEnv(),
    now: () => currentNow,
    spotPriceProvider: async ({ assetSymbol }) => {
      if (onQuote) await onQuote();
      return { priceUsd: spotPrices[assetSymbol], source: 'TEST_ORACLE' };
    }
  });

  const evmWallet = '0x9999999999999999999999999999999999999999';
  const solWallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const key = 'chk_inplace_multinet_12345678';

  const initial = await service.createPaymentIntent({
    buyerUid: 'u1',
    productType: 'miner',
    packageId: 'minerx-02',
    networkId: 'bsc',
    assetSymbol: 'USDT',
    senderWallet: evmWallet,
    idempotencyKey: key
  });
  assert.equal(initial.status, PAYMENT_STATUSES.AWAITING);

  // Switch 1: bsc/USDT -> polygon/POL
  currentNow += 5000;
  const polyPol = await service.selectPaymentMethod({
    intentId: initial.intentId,
    requesterUid: 'u1',
    networkId: 'polygon',
    assetSymbol: 'POL',
    senderWallet: evmWallet
  });
  assert.equal(polyPol.intentId, initial.intentId);
  assert.equal(polyPol.paymentNetwork, 'polygon');
  assert.equal(polyPol.chainId, 80002);
  assert.equal(polyPol.paymentAsset, 'POL');
  assert.equal(polyPol.senderWallet, evmWallet);
  assert.equal(polyPol.createdAt, initial.createdAt);
  assert.equal(polyPol.idempotencyKey, key);
  assert.equal(polyPol.sponsorUid, 'u2');
  assert.equal(store.get(`admin_orders/${initial.intentId}`).cryptoAsset, 'POL');
  assert.equal(store.get(`admin_orders/${initial.intentId}`).paymentNetwork, 'polygon');

  // Switch 2: polygon/POL -> solana/SOL
  currentNow += 5000;
  const solSol = await service.selectPaymentMethod({
    intentId: initial.intentId,
    requesterUid: 'u1',
    networkId: 'solana',
    assetSymbol: 'SOL',
    senderWallet: solWallet
  });
  assert.equal(solSol.intentId, initial.intentId);
  assert.equal(solSol.paymentNetwork, 'solana');
  assert.equal(solSol.chainId, 'solana-devnet');
  assert.equal(solSol.paymentAsset, 'SOL');
  assert.equal(solSol.treasuryAddress, VALID_SOL_TREASURY);
  assert.equal(solSol.senderWallet, solWallet);
  assert.equal(store.get(`admin_orders/${initial.intentId}`).recipientAddress, VALID_SOL_TREASURY);
  assert.equal(store.get(`admin_orders/${initial.intentId}`).cryptoAsset, 'SOL');

  // Switch 3: solana/SOL -> bsc/BNB
  currentNow += 5000;
  const bscBnb = await service.selectPaymentMethod({
    intentId: initial.intentId,
    requesterUid: 'u1',
    networkId: 'bsc',
    assetSymbol: 'BNB',
    senderWallet: evmWallet
  });
  assert.equal(bscBnb.intentId, initial.intentId);
  assert.equal(bscBnb.paymentNetwork, 'bsc');
  assert.equal(bscBnb.paymentAsset, 'BNB');
  assert.equal(bscBnb.treasuryAddress, VALID_EVM_TREASURY);
  assert.equal(bscBnb.sponsorUid, 'u2');
  assert.equal(bscBnb.referralSnapshotLocked, true);

  // Verify 1 intent, 1 order, 0 CANCELLED orders
  const allIntents = [...store.entries()].filter(([k]) => k.startsWith('payment_intents/'));
  const allOrders = [...store.entries()].filter(([k]) => k.startsWith('admin_orders/'));
  assert.equal(allIntents.length, 1);
  assert.equal(allOrders.length, 1);
  assert.equal(allOrders.filter(([, v]) => v.status === PAYMENT_STATUSES.CANCELLED).length, 0);

  // TOCTOU race safety: txHash + PROCESSING status arrive while awaiting slow spot quote -> transaction MUST reject 409
  onQuote = async () => {
    store.set(`payment_intents/${initial.intentId}`, {
      ...store.get(`payment_intents/${initial.intentId}`),
      status: PAYMENT_STATUSES.PROCESSING,
      txHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    });
  };
  await assert.rejects(
    () => service.selectPaymentMethod({
      intentId: initial.intentId,
      requesterUid: 'u1',
      networkId: 'polygon',
      assetSymbol: 'POL',
      senderWallet: evmWallet
    }),
    (err) => err instanceof PaymentIntentError && err.code === 'INVALID_STATUS_TRANSITION' && err.statusCode === 409
  );
  onQuote = null;
  // Route remained bsc/BNB untouched after rejected TOCTOU race
  assert.equal(store.get(`payment_intents/${initial.intentId}`).paymentNetwork, 'bsc');
  assert.equal(store.get(`payment_intents/${initial.intentId}`).paymentAsset, 'BNB');
});

// ============================================================================
// 8. SPOT PRICE CACHE, IN-FLIGHT DEDUP & MULTI-PROVIDER FALLBACK TESTS
// ============================================================================

test('createDefaultSpotPriceProvider: caches by uppercase symbol within cacheTtlMs, expires past TTL, isolates instances, and respects env PAYMENT_SPOT_CACHE_TTL_MS', async () => {
  let currentNow = 1_700_000_000_000;
  let fetchCalls = 0;
  let price = 3200.5;
  const provider = createDefaultSpotPriceProvider({
    now: () => currentNow,
    fetchImpl: async () => {
      fetchCalls += 1;
      return {
        ok: true,
        async json() {
          return { ethereum: { usd: price } };
        }
      };
    }
  });

  const first = await provider({ assetSymbol: 'eth', networkId: 'ethereum' });
  assert.deepEqual(first, { priceUsd: '3200.5', source: 'COINGECKO_SIMPLE_PRICE' });
  assert.equal(fetchCalls, 1);

  // Mutating returned object must not corrupt cached entry
  first.priceUsd = '0.01';
  first.source = 'TAMPERED';

  currentNow += 44_999;
  const second = await provider({ assetSymbol: 'ETH', networkId: 'ethereum' });
  assert.deepEqual(second, { priceUsd: '3200.5', source: 'COINGECKO_SIMPLE_PRICE' });
  assert.equal(fetchCalls, 1);

  // Separate provider instance does not share cache
  let otherCalls = 0;
  const otherProvider = createDefaultSpotPriceProvider({
    now: () => currentNow,
    fetchImpl: async () => {
      otherCalls += 1;
      return {
        ok: true,
        async json() {
          return { ethereum: { usd: 3210 } };
        }
      };
    }
  });
  const otherQuote = await otherProvider({ assetSymbol: 'ETH', networkId: 'ethereum' });
  assert.deepEqual(otherQuote, { priceUsd: '3210', source: 'COINGECKO_SIMPLE_PRICE' });
  assert.equal(otherCalls, 1);

  // Advance past default 45000ms TTL -> expires and refetches
  currentNow += 1;
  price = 3250.25;
  const refreshed = await provider({ assetSymbol: 'ETH', networkId: 'ethereum' });
  assert.deepEqual(refreshed, { priceUsd: '3250.25', source: 'COINGECKO_SIMPLE_PRICE' });
  assert.equal(fetchCalls, 2);

  // Respects valid env.PAYMENT_SPOT_CACHE_TTL_MS
  let envNow = 1_700_000_000_000;
  let envCalls = 0;
  const envProvider = createDefaultSpotPriceProvider({
    env: { PAYMENT_SPOT_CACHE_TTL_MS: '10000' },
    now: () => envNow,
    fetchImpl: async () => {
      envCalls += 1;
      return { ok: true, async json() { return { solana: { usd: 185 } }; } };
    }
  });
  await envProvider({ assetSymbol: 'SOL', networkId: 'solana' });
  envNow += 9_999;
  await envProvider({ assetSymbol: 'SOL', networkId: 'solana' });
  assert.equal(envCalls, 1);
  envNow += 1;
  await envProvider({ assetSymbol: 'SOL', networkId: 'solana' });
  assert.equal(envCalls, 2);

  // Empty, whitespace, negative, >300000, or non-integer env values fall back to default 45000ms (never coerce '' -> 0)
  for (const invalidEnvTtl of ['', '   ', '-1', '300001', '12.5', 'abc']) {
    let t = 1_700_000_000_000;
    let calls = 0;
    const fallbackTtlProvider = createDefaultSpotPriceProvider({
      env: { PAYMENT_SPOT_CACHE_TTL_MS: invalidEnvTtl },
      now: () => t,
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, async json() { return { binancecoin: { usd: 600 } }; } };
      }
    });
    await fallbackTtlProvider({ assetSymbol: 'BNB', networkId: 'bsc' });
    t += 44_000;
    await fallbackTtlProvider({ assetSymbol: 'BNB', networkId: 'bsc' });
    assert.equal(calls, 1, `Invalid env PAYMENT_SPOT_CACHE_TTL_MS=${JSON.stringify(invalidEnvTtl)} must fall back to 45000ms cache`);
  }

  // Explicit cacheTtlMs: 0 disables caching
  let zeroCalls = 0;
  const uncachedProvider = createDefaultSpotPriceProvider({
    cacheTtlMs: 0,
    now: () => currentNow,
    fetchImpl: async () => {
      zeroCalls += 1;
      return { ok: true, async json() { return { tron: { usd: 0.25 } }; } };
    }
  });
  await uncachedProvider({ assetSymbol: 'TRX', networkId: 'tron' });
  await uncachedProvider({ assetSymbol: 'TRX', networkId: 'tron' });
  assert.equal(zeroCalls, 2);
});

test('createDefaultSpotPriceProvider: deduplicates concurrent in-flight requests and cleans up after failure', async () => {
  let fetchCalls = 0;
  let releaseFetch;
  const gate = new Promise((resolve) => {
    releaseFetch = resolve;
  });

  const provider = createDefaultSpotPriceProvider({
    fetchImpl: async () => {
      fetchCalls += 1;
      await gate;
      return {
        ok: true,
        async json() {
          return { solana: { usd: 192.4 } };
        }
      };
    }
  });

  const pending = Promise.all([
    provider({ assetSymbol: 'SOL', networkId: 'solana' }),
    provider({ assetSymbol: 'sol', networkId: 'solana' }),
    provider({ assetSymbol: 'SOL', networkId: 'solana' })
  ]);
  releaseFetch();
  const [q1, q2, q3] = await pending;
  assert.equal(fetchCalls, 1);
  assert.deepEqual(q1, { priceUsd: '192.4', source: 'COINGECKO_SIMPLE_PRICE' });
  assert.deepEqual(q2, { priceUsd: '192.4', source: 'COINGECKO_SIMPLE_PRICE' });
  assert.deepEqual(q3, { priceUsd: '192.4', source: 'COINGECKO_SIMPLE_PRICE' });
  assert.notEqual(q1, q2);

  // Concurrent failure cleans up inFlight and does not cache failure
  let shouldFail = true;
  let failureCycleCalls = 0;
  const flakyProvider = createDefaultSpotPriceProvider({
    fetchImpl: async () => {
      failureCycleCalls += 1;
      await new Promise((r) => setTimeout(r, 10));
      if (shouldFail) {
        return { ok: false, status: 503, async json() { return {}; } };
      }
      return { ok: true, async json() { return { solana: { usd: 195.5 } }; } };
    }
  });

  const settled = await Promise.allSettled([
    flakyProvider({ assetSymbol: 'SOL', networkId: 'solana' }),
    flakyProvider({ assetSymbol: 'SOL', networkId: 'solana' })
  ]);
  assert.equal(failureCycleCalls, 3, 'concurrent failure shares one 3-provider chain attempt');
  for (const outcome of settled) {
    assert.equal(outcome.status, 'rejected');
    assert.ok(outcome.reason instanceof PaymentIntentError);
    assert.equal(outcome.reason.code, 'SPOT_PRICE_UNAVAILABLE');
    assert.equal(outcome.reason.statusCode, 503);
  }

  shouldFail = false;
  const recovered = await flakyProvider({ assetSymbol: 'SOL', networkId: 'solana' });
  assert.deepEqual(recovered, { priceUsd: '195.5', source: 'COINGECKO_SIMPLE_PRICE' });
  assert.equal(failureCycleCalls, 4);
});

test('createDefaultSpotPriceProvider: falls back from CoinGecko 429 or invalid price to Coinbase Spot and caches result', async () => {
  const seenUrls = [];
  const seenSignals = [];
  let currentNow = 1_700_000_000_000;
  const provider = createDefaultSpotPriceProvider({
    now: () => currentNow,
    fetchImpl: async (url, opts) => {
      seenUrls.push(url);
      seenSignals.push(opts && opts.signal);
      if (url.includes('coingecko.com')) {
        return { ok: false, status: 429, async json() { return { status: { error_code: 429 } }; } };
      }
      if (url === 'https://api.coinbase.com/v2/prices/ETH-USD/spot') {
        return { ok: true, async json() { return { data: { base: 'ETH', currency: 'USD', amount: '3125.45' } }; } };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }
  });

  const quote = await provider({ assetSymbol: 'ETH', networkId: 'ethereum' });
  assert.deepEqual(quote, { priceUsd: '3125.45', source: 'COINBASE_SPOT' });
  assert.equal(seenUrls.length, 2);
  assert.equal(seenUrls[1], 'https://api.coinbase.com/v2/prices/ETH-USD/spot');
  assert.ok(seenSignals[0] && seenSignals[1] && seenSignals[0] !== seenSignals[1], 'each attempt must receive a fresh AbortSignal');

  // Cached hit avoids further HTTP calls
  currentNow += 10_000;
  const cachedQuote = await provider({ assetSymbol: 'ETH', networkId: 'ethereum' });
  assert.deepEqual(cachedQuote, { priceUsd: '3125.45', source: 'COINBASE_SPOT' });
  assert.equal(seenUrls.length, 2);

  // CoinGecko HTTP 200 with negative price (-5) falls back to Coinbase Spot
  const invalidPrimaryProvider = createDefaultSpotPriceProvider({
    fetchImpl: async (url) => {
      if (url.includes('coingecko.com')) {
        return { ok: true, async json() { return { ethereum: { usd: -5 } }; } };
      }
      if (url === 'https://api.coinbase.com/v2/prices/ETH-USD/spot') {
        return { ok: true, async json() { return { data: { amount: '3100.2' } }; } };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }
  });
  const recovered = await invalidPrimaryProvider({ assetSymbol: 'ETH', networkId: 'ethereum' });
  assert.deepEqual(recovered, { priceUsd: '3100.2', source: 'COINBASE_SPOT' });
});

test('createDefaultSpotPriceProvider: falls back from CoinGecko 503 + Coinbase 503/invalid to Kraken Public Ticker across all supported symbols', async () => {
  const expectedKrakenPairs = {
    ETH: 'ETHUSD',
    SOL: 'SOLUSD',
    POL: 'POLUSD',
    AVAX: 'AVAXUSD',
    TRX: 'TRXUSD',
    BNB: 'BNBUSD'
  };

  for (const [symbol, expectedPair] of Object.entries(expectedKrakenPairs)) {
    const urls = [];
    const provider = createDefaultSpotPriceProvider({
      fetchImpl: async (url) => {
        urls.push(url);
        if (url.includes('coingecko.com')) {
          return { ok: false, status: 503, async json() { return {}; } };
        }
        if (url.includes('api.coinbase.com')) {
          return { ok: false, status: 503, async json() { return {}; } };
        }
        if (url === `https://api.kraken.com/0/public/Ticker?pair=${expectedPair}`) {
          return {
            ok: true,
            async json() {
              return { error: [], result: { [`X${expectedPair}`]: { c: ['38.75000', '12.0'] } } };
            }
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      }
    });

    const quote = await provider({ assetSymbol: symbol, networkId: 'avalanche' });
    assert.deepEqual(quote, { priceUsd: '38.75', source: 'KRAKEN_TICKER' });
    assert.equal(urls.length, 3);
    assert.equal(urls[2], `https://api.kraken.com/0/public/Ticker?pair=${expectedPair}`);
  }

  // Coinbase boolean/zero amount must NOT be accepted as valid price (Number(true) === 1 trap) and falls through to Kraken
  for (const badAmount of [true, false, '0', '', null]) {
    const provider = createDefaultSpotPriceProvider({
      fetchImpl: async (url) => {
        if (url.includes('coingecko.com')) return { ok: false, status: 429, async json() { return {}; } };
        if (url.includes('api.coinbase.com')) return { ok: true, async json() { return { data: { amount: badAmount } }; } };
        return { ok: true, async json() { return { error: [], result: { XETHZUSD: { c: ['2999.99', '1'] } } }; } };
      }
    });
    const quote = await provider({ assetSymbol: 'ETH', networkId: 'ethereum' });
    assert.deepEqual(quote, { priceUsd: '2999.99', source: 'KRAKEN_TICKER' });
  }
});

test('createDefaultSpotPriceProvider: fails closed with 503 SPOT_PRICE_UNAVAILABLE when all 3 providers fail without caching the error', async () => {
  let calls = 0;
  let succeedNow = false;
  const provider = createDefaultSpotPriceProvider({
    fetchImpl: async (url) => {
      calls += 1;
      if (succeedNow) {
        return { ok: true, async json() { return { avalanche: undefined, 'avalanche-2': { usd: 42.1 } }; } };
      }
      if (url.includes('coingecko.com')) {
        return { ok: false, status: 429, async json() { return {}; } };
      }
      if (url.includes('api.coinbase.com')) {
        throw new Error('AbortError: timeout');
      }
      // Kraken returns non-empty error array -> invalid
      return { ok: true, async json() { return { error: ['EQuery:Unknown asset pair'], result: {} }; } };
    }
  });

  await assert.rejects(
    () => provider({ assetSymbol: 'AVAX', networkId: 'avalanche' }),
    (err) => err instanceof PaymentIntentError && err.code === 'SPOT_PRICE_UNAVAILABLE' && err.statusCode === 503
  );
  assert.equal(calls, 3);

  // Error was not cached: next call recovers immediately
  succeedNow = true;
  const quote = await provider({ assetSymbol: 'AVAX', networkId: 'avalanche' });
  assert.deepEqual(quote, { priceUsd: '42.1', source: 'COINGECKO_SIMPLE_PRICE' });
  assert.equal(calls, 4);
});

test('payments/index getDefaultHandlers: shares lazy container-scoped spot cache and in-flight deduplication across separate invocations', async () => {
  const paymentsIndex = require('../src/payments');
  assert.equal(typeof paymentsIndex.getDefaultHandlers, 'function');

  const { db } = createInMemoryFirestore(buildSeededDocs());
  const env = buildTestEnv();
  let fetchCalls = 0;
  let releaseFetch;
  const gate = new Promise((resolve) => {
    releaseFetch = resolve;
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetchCalls += 1;
    assert.ok(url.includes('coingecko.com'), `Unexpected URL: ${url}`);
    await gate;
    return {
      ok: true,
      async json() {
        return { ethereum: { usd: 3300 } };
      }
    };
  };

  try {
    const handlersA = paymentsIndex.getDefaultHandlers({ db, env });
    const handlersB = paymentsIndex.getDefaultHandlers({ db, env });
    const pending = Promise.all([
      handlersA.handleCreatePaymentIntent({
        auth: { uid: 'u1', token: {} },
        data: {
          productType: 'miner',
          packageId: 'minerx-02',
          networkId: 'arbitrum',
          assetSymbol: 'ETH',
          senderWallet: '0x9999999999999999999999999999999999999999'
        }
      }),
      handlersB.handleCreatePaymentIntent({
        auth: { uid: 'u1', token: {} },
        data: {
          productType: 'miner',
          packageId: 'minerx-02',
          networkId: 'arbitrum',
          assetSymbol: 'ETH',
          senderWallet: '0x9999999999999999999999999999999999999999'
        }
      })
    ]);
    releaseFetch();
    const [intentA, intentB] = await pending;
    assert.equal(intentA.quotedSpotUsd, '3300');
    assert.equal(intentB.quotedSpotUsd, '3300');
    assert.equal(fetchCalls, 1, 'concurrent getDefaultHandlers invocations must deduplicate in-flight spot fetch');

    // Third sequential invocation reuses the same cached spot quote with 0 additional HTTP calls
    const handlersC = paymentsIndex.getDefaultHandlers({ db, env });
    const intentC = await handlersC.handleCreatePaymentIntent({
      auth: { uid: 'u1', token: {} },
      data: {
        productType: 'miner',
        packageId: 'minerx-02',
        networkId: 'arbitrum',
        assetSymbol: 'ETH',
        senderWallet: '0x9999999999999999999999999999999999999999'
      }
    });
    assert.equal(intentC.quotedSpotUsd, '3300');
    assert.equal(fetchCalls, 1, 'sequential getDefaultHandlers invocation within TTL must hit shared container cache');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
