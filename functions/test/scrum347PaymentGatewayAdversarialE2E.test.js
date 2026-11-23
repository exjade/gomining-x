'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');

const {
  PAYMENT_STATUSES,
  NETWORK_CATALOG,
  convertUsdToAtomic,
  resolvePaymentRoute
} = require('../src/payments/paymentConfig');
const { ERC20_TRANSFER_TOPIC } = require('../src/payments/evmVerifier');
const { buildUsedTxHashKey } = require('../src/payments/onChainVerifier');
const { createPaymentHandlers } = require('../src/payments');
const { handlePurchaseSettledEvent } = require('../src/referrals');
const {
  runFinalizeDailyMiningProfitBatch,
  handleMiningProfitFinalizedEvent,
  getUnilevelStatsForUser
} = require('../src/unilevel');

const TREASURY_EVM = '0x1111111111111111111111111111111111111111';
const WRONG_TREASURY_EVM = '0x2222222222222222222222222222222222222222';
const TREASURY_SOL = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const TREASURY_SOL_ATA = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const WRONG_TREASURY_SOL = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';

const SENDER_EVM = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ATTACKER_EVM = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SENDER_SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const ATTACKER_SOL = '8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsV';

const BSC_TESTNET_USDT = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const POLYGON_AMOY_USDT = '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582';
const FAKE_TOKEN_EVM = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const SOLANA_DEVNET_USDT_MINT = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
const FAKE_SOLANA_MINT = 'So11111111111111111111111111111111111111112';

const EVM_TX_1 = '0x1111111111111111111111111111111111111111111111111111111111111111';
const EVM_TX_2 = '0x2222222222222222222222222222222222222222222222222222222222222222';
const EVM_TX_3 = '0x3333333333333333333333333333333333333333333333333333333333333333';
const EVM_TX_4 = '0x4444444444444444444444444444444444444444444444444444444444444444';
const EVM_TX_5 = '0x5555555555555555555555555555555555555555555555555555555555555555';
const EVM_TX_6 = '0x6666666666666666666666666666666666666666666666666666666666666666';
const EVM_TX_7 = '0x7777777777777777777777777777777777777777777777777777777777777777';

const SOL_SIG_1 =
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d11111111111111111111111111111111111111111111';
const SOL_SIG_2 =
  '4eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d22222222222222222222222222222222222222222222';
const SOL_SIG_3 =
  '3eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d33333333333333333333333333333333333333333333';

function padTopicAddress(addr) {
  return `0x${addr.toLowerCase().slice(2).padStart(64, '0')}`;
}

function encodeUint256Hex(valueBigInt) {
  return `0x${valueBigInt.toString(16).padStart(64, '0')}`;
}

function buildTestnetEnv(overrides = {}) {
  return {
    PAYMENT_NETWORK_MODE: 'testnet',
    TREASURY_EVM_ADDRESS: TREASURY_EVM,
    TREASURY_SOLANA_ADDRESS: TREASURY_SOL,
    PAYMENT_TESTNET_USDT_BSC_CONTRACT: BSC_TESTNET_USDT,
    PAYMENT_TESTNET_USDT_POLYGON_CONTRACT: POLYGON_AMOY_USDT,
    PAYMENT_TESTNET_USDT_ETHEREUM_CONTRACT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    PAYMENT_TESTNET_USDT_SOLANA_MINT: SOLANA_DEVNET_USDT_MINT,
    PAYMENT_RPC_URL_BSC_TESTNET: 'https://rpc.bsc-testnet.example',
    PAYMENT_RPC_URL_POLYGON_TESTNET: 'https://rpc.polygon-amoy.example',
    PAYMENT_RPC_URL_ETHEREUM_TESTNET: 'https://rpc.eth-sepolia.example',
    PAYMENT_RPC_URL_SOLANA_TESTNET: 'https://rpc.solana-devnet.example',
    PAYMENT_RPC_URL_BSC_MAINNET: 'https://rpc.bsc-mainnet.example',
    PAYMENT_RPC_URL_POLYGON_MAINNET: 'https://rpc.polygon-mainnet.example',
    PAYMENT_RPC_URL_ETHEREUM_MAINNET: 'https://rpc.eth-mainnet.example',
    PAYMENT_RPC_URL_SOLANA_MAINNET: 'https://rpc.solana-mainnet.example',
    ...overrides
  };
}

const FieldValue = Object.freeze({
  increment(delta) {
    return { __op: 'increment', delta };
  },
  serverTimestamp() {
    return { __op: 'serverTimestamp' };
  }
});

function getNestedField(obj, dottedPath) {
  return dottedPath.split('.').reduce(
    (cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined),
    obj
  );
}

function applyFieldOps(existing, patch, nowIso) {
  const base = existing ? structuredClone(existing) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && value.__op === 'increment') {
      const prev = typeof base[key] === 'number' && Number.isFinite(base[key]) ? base[key] : 0;
      const sum = prev + value.delta;
      base[key] = Number.isInteger(prev) && Number.isInteger(value.delta) ? sum : Number(sum.toFixed(6));
    } else if (value && typeof value === 'object' && value.__op === 'serverTimestamp') {
      base[key] = nowIso;
    } else {
      base[key] = structuredClone(value);
    }
  }
  return base;
}

/**
 * Unified strict in-memory Firestore supporting:
 * - payments (tx.get/set/update, batch, where '==' & 'in', limit)
 * - referrals (SCRUM-229 directReferralService + onPurchaseSettled)
 * - unilevel (SCRUM-327 collectionGroup('miner') + SCRUM-230 distribution)
 */
function createUnifiedFirestore(initialDocs = {}, { nowIso = () => '2026-11-22T12:00:00.000Z' } = {}) {
  const store = new Map();
  for (const [docPath, data] of Object.entries(initialDocs)) {
    store.set(docPath, structuredClone(data));
  }

  const txContext = new AsyncLocalStorage();
  const recordedStatuses = [];
  const orderEvents = [];

  function trackWrite(fullPath, before, after) {
    if (fullPath.startsWith('payment_intents/') || fullPath.startsWith('admin_orders/')) {
      if (after && after.status !== undefined) {
        recordedStatuses.push({ path: fullPath, status: after.status });
      }
    }
    if (fullPath.startsWith('admin_orders/')) {
      orderEvents.push({
        orderId: fullPath.slice('admin_orders/'.length),
        beforeData: before ? structuredClone(before) : null,
        afterData: after ? structuredClone(after) : null
      });
    }
  }

  function makeDocRef(fullPath) {
    const segments = fullPath.split('/');
    const id = segments[segments.length - 1];
    const parentCol = segments.length >= 2 ? segments.slice(0, -1).join('/') : '';
    const parentDocPath = segments.length >= 4 ? segments.slice(0, -2).join('/') : null;
    const parentDocId = segments.length >= 3 ? segments[segments.length - 3] : null;
    return {
      id,
      path: fullPath,
      parent: {
        id: segments.length >= 2 ? segments[segments.length - 2] : null,
        path: parentCol,
        parent: parentDocId ? { id: parentDocId, path: parentDocPath } : null
      },
      collection(subName) {
        return makeCollectionRef(`${fullPath}/${subName}`);
      },
      async get() {
        const exists = store.has(fullPath);
        const data = exists ? structuredClone(store.get(fullPath)) : undefined;
        return { id, exists, ref: this, data: () => data };
      },
      async set(payload, options = {}) {
        const before = store.has(fullPath) ? structuredClone(store.get(fullPath)) : null;
        const next = options && options.merge
          ? applyFieldOps(before, payload, nowIso())
          : applyFieldOps(null, payload, nowIso());
        store.set(fullPath, next);
        trackWrite(fullPath, before, next);
      },
      async update(patch) {
        if (!store.has(fullPath)) {
          throw new Error(`Document not found for update: ${fullPath}`);
        }
        const before = structuredClone(store.get(fullPath));
        const next = applyFieldOps(before, patch, nowIso());
        store.set(fullPath, next);
        trackWrite(fullPath, before, next);
      }
    };
  }

  function matchesFilters(data, filters) {
    for (const { field, op, value } of filters) {
      const actual = getNestedField(data, field);
      if (op === '==') {
        if (actual !== value) return false;
      } else if (op === 'in') {
        if (!Array.isArray(value) || !value.includes(actual)) return false;
      } else {
        throw new Error(`Unsupported query op: ${op}`);
      }
    }
    return true;
  }

  function makeQuery(collectionPath, filters = [], limitVal = null) {
    const prefix = `${collectionPath}/`;
    const expectedDepth = collectionPath.split('/').length + 1;
    return {
      __isQuery: true,
      path: collectionPath,
      where(field, op, value) {
        return makeQuery(collectionPath, [...filters, { field, op, value }], limitVal);
      },
      limit(n) {
        return makeQuery(collectionPath, filters, n);
      },
      async get() {
        const docs = [];
        for (const [docPath, data] of store.entries()) {
          if (!docPath.startsWith(prefix)) continue;
          if (docPath.split('/').length !== expectedDepth) continue;
          if (!matchesFilters(data, filters)) continue;
          const id = docPath.slice(prefix.length);
          docs.push({ id, exists: true, ref: makeDocRef(docPath), data: () => structuredClone(data) });
          if (limitVal !== null && docs.length >= limitVal) break;
        }
        return { empty: docs.length === 0, size: docs.length, docs };
      }
    };
  }

  function makeCollectionRef(collectionPath) {
    return {
      ...makeQuery(collectionPath),
      doc(id) {
        return makeDocRef(`${collectionPath}/${id}`);
      }
    };
  }

  function makeCollectionGroupQuery(groupName, filters = [], limitVal = null) {
    return {
      __isQuery: true,
      where(field, op, value) {
        return makeCollectionGroupQuery(groupName, [...filters, { field, op, value }], limitVal);
      },
      limit(n) {
        return makeCollectionGroupQuery(groupName, filters, n);
      },
      async get() {
        const docs = [];
        for (const [docPath, data] of store.entries()) {
          const segments = docPath.split('/');
          if (segments.length < 2 || segments[segments.length - 2] !== groupName) continue;
          if (!matchesFilters(data, filters)) continue;
          const id = segments[segments.length - 1];
          docs.push({ id, exists: true, ref: makeDocRef(docPath), data: () => structuredClone(data) });
          if (limitVal !== null && docs.length >= limitVal) break;
        }
        return { empty: docs.length === 0, size: docs.length, docs };
      }
    };
  }

  const db = {
    _store: store,
    _recordedStatuses: recordedStatuses,
    _orderEvents: orderEvents,
    _inTransaction: () => Boolean(txContext.getStore()),
    collection(name) {
      return makeCollectionRef(name);
    },
    collectionGroup(name) {
      return makeCollectionGroupQuery(name);
    },
    batch() {
      const ops = [];
      return {
        set(ref, payload, options = {}) {
          ops.push({ type: 'set', ref, payload: structuredClone(payload), options });
        },
        update(ref, patch) {
          ops.push({ type: 'update', ref, patch: structuredClone(patch) });
        },
        async commit() {
          for (const op of ops) {
            if (op.type === 'set') await op.ref.set(op.payload, op.options);
            else if (op.type === 'update') await op.ref.update(op.patch);
          }
        }
      };
    },
    async runTransaction(fn) {
      let writeStarted = false;
      const pendingOps = [];
      const tx = {
        async get(target) {
          if (writeStarted) {
            throw new Error('Firestore transactions require all reads before all writes');
          }
          if (target && target.__isQuery) return target.get();
          const exists = store.has(target.path);
          const data = exists ? structuredClone(store.get(target.path)) : undefined;
          return { id: target.id, exists, ref: target, data: () => data };
        },
        set(ref, payload, options = {}) {
          writeStarted = true;
          pendingOps.push({ type: 'set', ref, payload: structuredClone(payload), options });
          return tx;
        },
        update(ref, patch) {
          writeStarted = true;
          pendingOps.push({ type: 'update', ref, patch: structuredClone(patch) });
          return tx;
        }
      };

      const result = await txContext.run(true, () => fn(tx));
      for (const op of pendingOps) {
        if (op.type === 'set') await op.ref.set(op.payload, op.options);
        else if (op.type === 'update') await op.ref.update(op.patch);
      }
      return result;
    }
  };

  return db;
}

function createGuardedRpcMock(db, handlersByMethod) {
  const calls = [];
  async function fetchImpl(url, opts = {}) {
    if (db._inTransaction()) {
      throw new Error('SECURITY_VIOLATION: External RPC executed inside Firestore runTransaction');
    }
    const body = opts.body ? JSON.parse(opts.body) : {};
    calls.push({ url, method: body.method, params: body.params });
    const handler = handlersByMethod[body.method];
    if (handler === undefined) {
      throw new Error(`Unexpected RPC method in test mock: ${body.method} (${url})`);
    }
    const result = typeof handler === 'function' ? await handler(body.params || [], url) : handler;
    return {
      ok: true,
      status: 200,
      async json() {
        return { jsonrpc: '2.0', id: body.id ?? 1, result };
      }
    };
  }
  fetchImpl.calls = calls;
  return fetchImpl;
}

function buildErc20Receipt({
  txHash,
  tokenAddress,
  from = SENDER_EVM,
  to = TREASURY_EVM,
  amountAtomic,
  blockHex = '0x64',
  status = '0x1'
}) {
  return {
    transactionHash: txHash,
    status,
    blockNumber: blockHex,
    from,
    to: tokenAddress,
    logs: [
      {
        address: tokenAddress,
        topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(from), padTopicAddress(to)],
        data: encodeUint256Hex(BigInt(amountAtomic)),
        removed: false
      }
    ]
  };
}

function buildSolanaSplTx({
  mint = SOLANA_DEVNET_USDT_MINT,
  fromOwner = SENDER_SOL,
  toOwner = TREASURY_SOL,
  amountAtomic,
  slot = 300001,
  blockTime = Math.floor(Date.parse('2026-11-22T12:02:00.000Z') / 1000)
}) {
  const amt = BigInt(amountAtomic);
  return {
    slot,
    blockTime,
    transaction: {
      message: {
        accountKeys: [
          { pubkey: fromOwner, signer: true, writable: true },
          { pubkey: toOwner, signer: false, writable: true },
          { pubkey: TREASURY_SOL_ATA, signer: false, writable: true }
        ]
      }
    },
    meta: {
      err: null,
      preBalances: [5_000_000_000, 1_000_000_000, 2_039_280],
      postBalances: [4_999_995_000, 1_000_000_000, 2_039_280],
      preTokenBalances: [
        { accountIndex: 0, mint, owner: fromOwner, uiTokenAmount: { amount: (amt * 2n).toString(), decimals: 6 } },
        { accountIndex: 2, mint, owner: toOwner, uiTokenAmount: { amount: '0', decimals: 6 } }
      ],
      postTokenBalances: [
        { accountIndex: 0, mint, owner: fromOwner, uiTokenAmount: { amount: amt.toString(), decimals: 6 } },
        { accountIndex: 2, mint, owner: toOwner, uiTokenAmount: { amount: amt.toString(), decimals: 6 } }
      ]
    }
  };
}

// ============================================================================
// VECTOR 1: Replay txHash (usedTxHashes) & Front-Running (SENDER_MISMATCH)
// ============================================================================

test('SCRUM-347 [V1]: Blocks txHash replay (usedTxHashes) and front-running SENDER_MISMATCH on EVM Testnet (BSC 97 / Polygon Amoy 80002) and Solana Devnet', async () => {
  const nowMs = Date.parse('2026-11-22T12:00:00.000Z');
  const db = createUnifiedFirestore(
    {
      'commercial_packages/pkg_v1': {
        id: 'pkg_v1',
        name: 'Minero V1',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 16,
        priceUsdt: 100
      },
      'users/u_honest': { uid: 'u_honest', status: 'active' },
      'users/u_attacker': { uid: 'u_attacker', status: 'active' }
    },
    { nowIso: () => new Date(nowMs).toISOString() }
  );

  const env = buildTestnetEnv();
  const ids = ['pi_v1_bsc_ok', 'pi_v1_bsc_replay', 'pi_v1_poly_frontrun', 'pi_v1_sol_ok', 'pi_v1_sol_replay', 'pi_v1_sol_frontrun'];
  let idx = 0;

  const rpcMock = createGuardedRpcMock(db, {
    eth_chainId: (_p, url) => (url.includes('polygon') ? '0x13882' : '0x61'), // 80002 Amoy vs 97 BSC Testnet
    eth_blockNumber: '0x200', // 512 (plenty of confirmations over block 100)
    eth_getTransactionReceipt: (params, url) => {
      if (url.includes('polygon')) {
        // Polygon Amoy USDT (6 decimals): 100 USDT = 100_000_000, sent by ATTACKER instead of SENDER_EVM
        return buildErc20Receipt({
          txHash: params[0],
          tokenAddress: POLYGON_AMOY_USDT,
          from: ATTACKER_EVM,
          to: TREASURY_EVM,
          amountAtomic: '100000000',
          blockHex: '0x64'
        });
      }
      // BSC Testnet USDT (18 decimals): 100 USDT = 100 * 10^18
      return buildErc20Receipt({
        txHash: params[0],
        tokenAddress: BSC_TESTNET_USDT,
        from: SENDER_EVM,
        to: TREASURY_EVM,
        amountAtomic: '100000000000000000000',
        blockHex: '0x64'
      });
    },
    eth_getTransactionByHash: (params, url) => ({
      hash: params[0],
      from: url.includes('polygon') ? ATTACKER_EVM : SENDER_EVM,
      to: url.includes('polygon') ? POLYGON_AMOY_USDT : BSC_TESTNET_USDT,
      value: '0x0'
    }),
    getTransaction: (params) => {
      if (params[0] === SOL_SIG_2) {
        return buildSolanaSplTx({ fromOwner: ATTACKER_SOL, toOwner: TREASURY_SOL, amountAtomic: '100000000' });
      }
      return buildSolanaSplTx({ fromOwner: SENDER_SOL, toOwner: TREASURY_SOL, amountAtomic: '100000000' });
    }
  });

  const handlers = createPaymentHandlers({
    db,
    env,
    now: () => nowMs,
    fetchImpl: rpcMock,
    idGenerator: () => ids[idx++]
  });

  // 1A. Legitimate BSC Testnet (97) USDT settlement
  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_honest', token: {} },
    data: { packageId: 'pkg_v1', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  const bscOk = await handlers.handleConfirmPaymentIntent({
    auth: { uid: 'u_honest', token: {} },
    data: { intentId: 'pi_v1_bsc_ok', txHash: EVM_TX_1 }
  });
  assert.equal(bscOk.outcome, 'SETTLED');
  assert.equal(db._store.has(`usedTxHashes/${buildUsedTxHashKey(97, EVM_TX_1)}`), true);

  // 1B. Replay same EVM txHash on second intent -> already-exists (TX_HASH_ALREADY_USED)
  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_attacker', token: {} },
    data: { packageId: 'pkg_v1', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  await assert.rejects(
    () =>
      handlers.handleConfirmPaymentIntent({
        auth: { uid: 'u_attacker', token: {} },
        data: { intentId: 'pi_v1_bsc_replay', txHash: EVM_TX_1 }
      }),
    (err) => err.code === 'already-exists' && err.details?.reasonCode === 'TX_HASH_ALREADY_USED'
  );
  assert.equal(db._store.has('miners/u_attacker/miner/miner_pi_v1_bsc_replay'), false);

  // 1C. EVM Front-Running on Polygon Amoy (80002): sender mismatch -> FAILED (SENDER_MISMATCH)
  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_honest', token: {} },
    data: { packageId: 'pkg_v1', networkId: 'polygon', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  const polyFrontRun = await handlers.handleConfirmPaymentIntent({
    auth: { uid: 'u_honest', token: {} },
    data: { intentId: 'pi_v1_poly_frontrun', txHash: EVM_TX_2 }
  });
  assert.equal(polyFrontRun.outcome, 'FAILED');
  assert.equal(polyFrontRun.reason, 'SENDER_MISMATCH');
  assert.equal(db._store.has('miners/u_honest/miner/miner_pi_v1_poly_frontrun'), false);

  // 1D. Legitimate Solana Devnet SPL USDT settlement
  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_honest', token: {} },
    data: { packageId: 'pkg_v1', networkId: 'solana', assetSymbol: 'USDT', senderWallet: SENDER_SOL }
  });
  const solOk = await handlers.handleConfirmPaymentIntent({
    auth: { uid: 'u_honest', token: {} },
    data: { intentId: 'pi_v1_sol_ok', txHash: SOL_SIG_1 }
  });
  assert.equal(solOk.outcome, 'SETTLED');
  assert.equal(db._store.has(`usedTxHashes/${buildUsedTxHashKey('solana-devnet', SOL_SIG_1)}`), true);

  // 1E. Replay Solana Base58 signature -> already-exists (TX_HASH_ALREADY_USED)
  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_attacker', token: {} },
    data: { packageId: 'pkg_v1', networkId: 'solana', assetSymbol: 'USDT', senderWallet: SENDER_SOL }
  });
  await assert.rejects(
    () =>
      handlers.handleConfirmPaymentIntent({
        auth: { uid: 'u_attacker', token: {} },
        data: { intentId: 'pi_v1_sol_replay', txHash: SOL_SIG_1 }
      }),
    (err) => err.code === 'already-exists' && err.details?.reasonCode === 'TX_HASH_ALREADY_USED'
  );
  assert.equal(db._store.has('miners/u_attacker/miner/miner_pi_v1_sol_replay'), false);

  // 1F. Solana Devnet Front-Running (SENDER_MISMATCH)
  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_honest', token: {} },
    data: { packageId: 'pkg_v1', networkId: 'solana', assetSymbol: 'USDT', senderWallet: SENDER_SOL }
  });
  const solFrontRun = await handlers.handleConfirmPaymentIntent({
    auth: { uid: 'u_honest', token: {} },
    data: { intentId: 'pi_v1_sol_frontrun', txHash: SOL_SIG_2 }
  });
  assert.equal(solFrontRun.outcome, 'FAILED');
  assert.equal(solFrontRun.reason, 'SENDER_MISMATCH');
  assert.equal(db._store.has('miners/u_honest/miner/miner_pi_v1_sol_frontrun'), false);
});

// ============================================================================
// VECTOR 2: Parameter Manipulation & buyerUid / requesterUid Spoofing
// ============================================================================

test('SCRUM-347 [V2]: Ignores spoofed price/treasury/sponsor/buyerUid and enforces strict owner/admin RBAC on all 5 callables', async () => {
  const nowMs = Date.parse('2026-11-22T12:10:00.000Z');
  const db = createUnifiedFirestore(
    {
      'commercial_packages/pkg_v2': {
        id: 'pkg_v2',
        name: 'Minero 48 TH',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 48,
        priceUsdt: 561.99
      },
      'users/u_buyer': { uid: 'u_buyer', status: 'active', sponsorId: 'u_real_sponsor' },
      'users/u_real_sponsor': { uid: 'u_real_sponsor', status: 'active' },
      'users/u_intruder': { uid: 'u_intruder', status: 'active' },
      'admin_users/adm_valid': { uid: 'adm_valid', status: 'ACTIVE', role: 'admin' }
    },
    { nowIso: () => new Date(nowMs).toISOString() }
  );

  const handlers = createPaymentHandlers({
    db,
    env: buildTestnetEnv(),
    now: () => nowMs,
    idGenerator: () => 'pi_v2_tamper'
  });

  // Spoof amountUsd=0.01, treasuryAddress=ATTACKER, sponsorUid=u_intruder, buyerUid=u_intruder
  const intent = await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_buyer', token: {} },
    data: {
      packageId: 'pkg_v2',
      amountUsd: 0.01,
      price: 0.01,
      treasuryAddress: ATTACKER_EVM,
      sponsorUid: 'u_intruder',
      buyerUid: 'u_intruder',
      requesterUid: 'u_intruder',
      isAdmin: true
    }
  });

  assert.equal(intent.buyerUid, 'u_buyer');
  assert.equal(intent.userId, 'u_buyer');
  assert.equal(intent.amountUsd, 561.99);
  assert.equal(intent.sponsorUid, 'u_real_sponsor');
  assert.equal(intent.treasuryAddress, null);

  // Unknown/non-existent packageId rejected
  await assert.rejects(
    () =>
      handlers.handleCreatePaymentIntent({
        auth: { uid: 'u_buyer', token: {} },
        data: { packageId: 'pkg_fake_999' }
      }),
    (err) => err.code === 'not-found'
  );

  // Intruder blocked on selectPaymentMethod, getPaymentIntent, confirmPaymentIntent, cancelPaymentIntent
  for (const call of [
    () => handlers.handleSelectPaymentMethod({
      auth: { uid: 'u_intruder', token: {} },
      data: { intentId: 'pi_v2_tamper', networkId: 'bsc', assetSymbol: 'USDT' }
    }),
    () => handlers.handleGetPaymentIntent({
      auth: { uid: 'u_intruder', token: {} },
      data: { intentId: 'pi_v2_tamper' }
    }),
    () => handlers.handleConfirmPaymentIntent({
      auth: { uid: 'u_intruder', token: {} },
      data: { intentId: 'pi_v2_tamper', txHash: EVM_TX_3 }
    }),
    () => handlers.handleCancelPaymentIntent({
      auth: { uid: 'u_intruder', token: {} },
      data: { intentId: 'pi_v2_tamper' }
    })
  ]) {
    await assert.rejects(call, (err) => err.code === 'permission-denied');
  }

  // Owner selects BSC USDT -> treasury comes exclusively from env TREASURY_EVM
  const selected = await handlers.handleSelectPaymentMethod({
    auth: { uid: 'u_buyer', token: {} },
    data: { intentId: 'pi_v2_tamper', networkId: 'bsc', assetSymbol: 'USDT', treasuryAddress: ATTACKER_EVM }
  });
  assert.equal(selected.treasuryAddress, TREASURY_EVM);
  assert.equal(selected.expectedAmountAtomic, '561990000000000000000');

  // Active Admin can inspect the intent
  const adminView = await handlers.handleGetPaymentIntent({
    auth: { uid: 'adm_valid', token: {} },
    data: { intentId: 'pi_v2_tamper' }
  });
  assert.equal(adminView.intentId, 'pi_v2_tamper');
});

// ============================================================================
// VECTOR 3: Wrong Treasury, Fake Token, Wrong Network/ChainId & Insufficient Confirmations
// ============================================================================

test('SCRUM-347 [V3]: Rejects wrong treasury, fake token, wrong chainId, and keeps PROCESSING (< requiredConfirmations) with 0 miners/contracts/commissions', async () => {
  const nowMs = Date.parse('2026-11-22T12:20:00.000Z');
  const db = createUnifiedFirestore(
    {
      'commercial_packages/pkg_v3': {
        id: 'pkg_v3',
        name: 'Minero V3',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 32,
        priceUsdt: 200
      },
      'users/u_sponsor_v3': { uid: 'u_sponsor_v3', status: 'active' },
      'users/u_buyer_v3': { uid: 'u_buyer_v3', status: 'active', sponsorId: 'u_sponsor_v3' }
    },
    { nowIso: () => new Date(nowMs).toISOString() }
  );

  const ids = ['pi_v3_wrong_treasury', 'pi_v3_fake_token', 'pi_v3_wrong_chain', 'pi_v3_low_conf'];
  let idx = 0;

  let forceWrongChain = false;
  const rpcMock = createGuardedRpcMock(db, {
    eth_chainId: () => (forceWrongChain ? '0x38' : '0x61'), // 56 mainnet vs expected 97 testnet
    eth_blockNumber: '0x69', // block 105 -> tx at block 100 has 6/15 confirmations
    eth_getTransactionReceipt: (params) => {
      if (params[0] === EVM_TX_3) {
        return buildErc20Receipt({
          txHash: EVM_TX_3,
          tokenAddress: BSC_TESTNET_USDT,
          from: SENDER_EVM,
          to: WRONG_TREASURY_EVM,
          amountAtomic: '200000000000000000000',
          blockHex: '0x50'
        });
      }
      if (params[0] === EVM_TX_4) {
        return buildErc20Receipt({
          txHash: EVM_TX_4,
          tokenAddress: FAKE_TOKEN_EVM,
          from: SENDER_EVM,
          to: TREASURY_EVM,
          amountAtomic: '200000000000000000000',
          blockHex: '0x50'
        });
      }
      return buildErc20Receipt({
        txHash: params[0],
        tokenAddress: BSC_TESTNET_USDT,
        from: SENDER_EVM,
        to: TREASURY_EVM,
        amountAtomic: '200000000000000000000',
        blockHex: '0x64' // block 100 -> 105 - 100 + 1 = 6/15 confirmations
      });
    },
    eth_getTransactionByHash: (params) => ({ hash: params[0], from: SENDER_EVM, to: BSC_TESTNET_USDT, value: '0x0' })
  });

  const handlers = createPaymentHandlers({
    db,
    env: buildTestnetEnv(),
    now: () => nowMs,
    fetchImpl: rpcMock,
    idGenerator: () => ids[idx++]
  });

  // 3A. Wrong treasury
  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_buyer_v3', token: {} },
    data: { packageId: 'pkg_v3', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  const wrongTreasuryRes = await handlers.handleConfirmPaymentIntent({
    auth: { uid: 'u_buyer_v3', token: {} },
    data: { intentId: 'pi_v3_wrong_treasury', txHash: EVM_TX_3 }
  });
  assert.equal(wrongTreasuryRes.outcome, 'FAILED');
  assert.equal(wrongTreasuryRes.reason, 'WRONG_RECIPIENT_OR_TOKEN');

  // 3B. Fake token contract
  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_buyer_v3', token: {} },
    data: { packageId: 'pkg_v3', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  const fakeTokenRes = await handlers.handleConfirmPaymentIntent({
    auth: { uid: 'u_buyer_v3', token: {} },
    data: { intentId: 'pi_v3_fake_token', txHash: EVM_TX_4 }
  });
  assert.equal(fakeTokenRes.outcome, 'FAILED');
  assert.equal(fakeTokenRes.reason, 'WRONG_RECIPIENT_OR_TOKEN');

  // 3C. Wrong network / RPC chainId mismatch (mainnet RPC returned 56 when intent requires BSC Testnet 97)
  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_buyer_v3', token: {} },
    data: { packageId: 'pkg_v3', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  forceWrongChain = true;
  await assert.rejects(
    () =>
      handlers.handleConfirmPaymentIntent({
        auth: { uid: 'u_buyer_v3', token: {} },
        data: { intentId: 'pi_v3_wrong_chain', txHash: EVM_TX_5 }
      }),
    (err) => err.code === 'unavailable' && err.details?.reasonCode === 'RPC_CHAIN_ID_MISMATCH'
  );
  forceWrongChain = false;

  // 3D. Insufficient confirmations (6/15) -> PROCESSING, 0 miners, 0 contracts, 0 commissions
  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_buyer_v3', token: {} },
    data: { packageId: 'pkg_v3', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  const lowConfRes = await handlers.handleConfirmPaymentIntent({
    auth: { uid: 'u_buyer_v3', token: {} },
    data: { intentId: 'pi_v3_low_conf', txHash: EVM_TX_5 }
  });
  assert.equal(lowConfRes.outcome, 'PROCESSING');
  assert.equal(lowConfRes.status, 'PROCESSING');
  assert.equal(lowConfRes.confirmations, 6);
  assert.equal(lowConfRes.requiredConfirmations, 15);
  assert.equal(db._store.has('miners/u_buyer_v3/miner/miner_pi_v3_low_conf'), false);
  assert.equal(db._store.has('admin_contracts/contract_pi_v3_low_conf'), false);

  // Feed PROCESSING admin_order into SCRUM-229 -> ignored, 0 commissions
  const procOrder = db._store.get('admin_orders/pi_v3_low_conf');
  const commRes = await handlePurchaseSettledEvent({
    orderId: 'pi_v3_low_conf',
    beforeData: { status: 'AWAITING' },
    afterData: procOrder,
    db,
    FieldValue
  });
  assert.equal(commRes.status, 'ignored');
  assert.equal(db._store.has('referralCommissions/COMM-miner_pi_v3_low_conf'), false);
  assert.equal(db._store.has('userBalances/u_sponsor_v3'), false);
});

// ============================================================================
// VECTOR 4: TTL Expiration (15 min) — OPEN & AWAITING for USDT + Native Coins (BNB, POL, SOL)
// ============================================================================

test('SCRUM-347 [V4]: Expires OPEN and AWAITING intents after 15-minute TTL for USDT and native coins (BNB, POL, SOL)', async () => {
  let currentNowMs = Date.parse('2026-11-22T13:00:00.000Z');
  const db = createUnifiedFirestore(
    {
      'commercial_packages/pkg_v4': {
        id: 'pkg_v4',
        name: 'Minero TTL',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 16,
        priceUsdt: 100
      },
      'users/u_ttl': { uid: 'u_ttl', status: 'active' }
    },
    { nowIso: () => new Date(currentNowMs).toISOString() }
  );

  const ids = ['pi_ttl_open', 'pi_ttl_usdt', 'pi_ttl_bnb', 'pi_ttl_pol', 'pi_ttl_sol'];
  let idx = 0;

  const spotPrices = { BNB: '600', POL: '0.50', SOL: '200' };
  const rpcMock = createGuardedRpcMock(db, {
    eth_chainId: (_p, url) => (url.includes('polygon') ? '0x13882' : '0x61'),
    eth_blockNumber: '0x64',
    eth_getLogs: [],
    eth_getBlockByNumber: () => ({ transactions: [] }),
    getSignaturesForAddress: [],
    getTokenAccountsByOwner: { value: [] }
  });

  const handlers = createPaymentHandlers({
    db,
    env: buildTestnetEnv(),
    now: () => currentNowMs,
    fetchImpl: rpcMock,
    spotPriceProvider: async ({ assetSymbol }) => ({ priceUsd: spotPrices[assetSymbol], source: 'MOCK_SPOT' }),
    idGenerator: () => ids[idx++]
  });

  await handlers.handleCreatePaymentIntent({ auth: { uid: 'u_ttl', token: {} }, data: { packageId: 'pkg_v4' } });
  await handlers.handleCreatePaymentIntent({ auth: { uid: 'u_ttl', token: {} }, data: { packageId: 'pkg_v4', networkId: 'bsc', assetSymbol: 'USDT' } });
  await handlers.handleCreatePaymentIntent({ auth: { uid: 'u_ttl', token: {} }, data: { packageId: 'pkg_v4', networkId: 'bsc', assetSymbol: 'BNB' } });
  await handlers.handleCreatePaymentIntent({ auth: { uid: 'u_ttl', token: {} }, data: { packageId: 'pkg_v4', networkId: 'polygon', assetSymbol: 'POL' } });
  await handlers.handleCreatePaymentIntent({ auth: { uid: 'u_ttl', token: {} }, data: { packageId: 'pkg_v4', networkId: 'solana', assetSymbol: 'SOL' } });

  // Advance clock 15 min + 1 sec
  currentNowMs += 15 * 60 * 1000 + 1000;

  const summary = await handlers.handleReconcilePendingPayments({ batchLimit: 20, maxConcurrency: 4 });
  assert.equal(summary.scanned, 5);
  assert.equal(summary.expired, 5);
  assert.equal(summary.settled, 0);
  assert.equal(summary.errorsCount, 0);

  for (const intentId of ids) {
    assert.equal(db._store.get(`payment_intents/${intentId}`).status, PAYMENT_STATUSES.EXPIRED);
    assert.equal(db._store.get(`admin_orders/${intentId}`).status, PAYMENT_STATUSES.EXPIRED);
    assert.equal(db._store.has(`miners/u_ttl/miner/miner_${intentId}`), false);
  }
});

// ============================================================================
// VECTOR 5: BigInt Precision of USDT Decimals (BSC 18 vs Polygon/Ethereum/Solana 6)
// ============================================================================

test('SCRUM-347 [V5]: Enforces exact BigInt USDT decimals (18 on BSC vs 6 on Polygon, Ethereum, Solana)', () => {
  const env = buildTestnetEnv({ PAYMENT_ENABLE_ETHEREUM: 'true' });

  const bscRoute = resolvePaymentRoute({ networkId: 'bsc', assetSymbol: 'USDT', env });
  const polyRoute = resolvePaymentRoute({ networkId: 'polygon', assetSymbol: 'USDT', env });
  const ethRoute = resolvePaymentRoute({ networkId: 'ethereum', assetSymbol: 'USDT', env });
  const solRoute = resolvePaymentRoute({ networkId: 'solana', assetSymbol: 'USDT', env });

  assert.equal(bscRoute.assetDecimals, 18);
  assert.equal(polyRoute.assetDecimals, 6);
  assert.equal(ethRoute.assetDecimals, 6);
  assert.equal(solRoute.assetDecimals, 6);

  const bscConv = convertUsdToAtomic({ amountUsd: '561.99', assetDecimals: bscRoute.assetDecimals, spotPriceUsd: '1' });
  const polyConv = convertUsdToAtomic({ amountUsd: '561.99', assetDecimals: polyRoute.assetDecimals, spotPriceUsd: '1' });
  const ethConv = convertUsdToAtomic({ amountUsd: '561.99', assetDecimals: ethRoute.assetDecimals, spotPriceUsd: '1' });
  const solConv = convertUsdToAtomic({ amountUsd: '561.99', assetDecimals: solRoute.assetDecimals, spotPriceUsd: '1' });

  assert.equal(bscConv.expectedAmountAtomic, '561990000000000000000');
  assert.equal(polyConv.expectedAmountAtomic, '561990000');
  assert.equal(ethConv.expectedAmountAtomic, '561990000');
  assert.equal(solConv.expectedAmountAtomic, '561990000');
  assert.equal(BigInt(bscConv.expectedAmountAtomic) / 10n ** 12n, BigInt(polyConv.expectedAmountAtomic));
});

// ============================================================================
// VECTOR 6: Zero Premature SCRUM-229 Commissions; Single Idempotent 10% Credit Only on SETTLED
// ============================================================================

test('SCRUM-347 [V6]: Produces 0 SCRUM-229 commissions on all 7 non-SETTLED states and credits exact 10% once (idempotent) only on SETTLED', async () => {
  const db = createUnifiedFirestore({
    'users/u_sponsor_v6': { uid: 'u_sponsor_v6', status: 'active', emailVerified: true },
    'users/u_buyer_v6': { uid: 'u_buyer_v6', status: 'active', sponsorId: 'u_sponsor_v6' }
  });

  const nonSettledStatuses = ['OPEN', 'AWAITING', 'PROCESSING', 'UNDERPAID', 'FAILED', 'EXPIRED', 'CANCELLED'];
  for (const status of nonSettledStatuses) {
    const res = await handlePurchaseSettledEvent({
      orderId: `ord_v6_${status}`,
      beforeData: null,
      afterData: {
        orderId: `ord_v6_${status}`,
        buyerUid: 'u_buyer_v6',
        userId: 'u_buyer_v6',
        sponsorUid: 'u_sponsor_v6',
        referralSnapshotLocked: true,
        productType: 'miner',
        netPaidUsdt: '561.990000',
        amountUsd: 561.99,
        status,
        activatedMinerId: `miner_v6_${status}`
      },
      db,
      FieldValue
    });
    assert.equal(res.status, 'ignored', `Status ${status} must NOT trigger SCRUM-229 commission`);
    assert.equal(db._store.has(`referralCommissions/COMM-miner_v6_${status}`), false);
  }
  assert.equal(db._store.has('userBalances/u_sponsor_v6'), false);

  // Transition PROCESSING -> SETTLED credits exact 10% = 56.199000 USDT = 56_199_000 micros
  const settledOrder = {
    orderId: 'ord_v6_settled',
    buyerUid: 'u_buyer_v6',
    userId: 'u_buyer_v6',
    sponsorUid: 'u_sponsor_v6',
    referralSnapshotLocked: true,
    productType: 'miner',
    netPaidUsdt: '561.990000',
    amountUsd: 561.99,
    status: 'SETTLED',
    activatedMinerId: 'miner_v6_settled',
    settledAt: '2026-11-22T12:30:00.000Z'
  };

  const firstCredit = await handlePurchaseSettledEvent({
    orderId: 'ord_v6_settled',
    beforeData: { status: 'PROCESSING' },
    afterData: settledOrder,
    db,
    FieldValue
  });
  assert.equal(firstCredit.status, 'credited');
  assert.equal(firstCredit.commissionUsdt6, '56.199000');
  assert.equal(db._store.get('userBalances/u_sponsor_v6').availableBalanceMicros, 56_199_000);

  // Duplicate event delivery (both transition replay and SETTLED->SETTLED update) -> idempotent (balance unchanged)
  const dupTransition = await handlePurchaseSettledEvent({
    orderId: 'ord_v6_settled',
    beforeData: { status: 'PROCESSING' },
    afterData: settledOrder,
    db,
    FieldValue
  });
  assert.equal(dupTransition.status, 'already_processed');

  const dupSameStatus = await handlePurchaseSettledEvent({
    orderId: 'ord_v6_settled',
    beforeData: { status: 'SETTLED' },
    afterData: settledOrder,
    db,
    FieldValue
  });
  assert.equal(dupSameStatus.status, 'ignored');
  assert.equal(db._store.get('userBalances/u_sponsor_v6').availableBalanceMicros, 56_199_000);
});

// ============================================================================
// VECTOR 7: Non-Retroactive Direct Referral Rule + Subscriptions 0%
// ============================================================================

test('SCRUM-347 [V7]: Enforces non-retroactive referral snapshot (Buy 1 w/o code = 0%, link sponsor, Buy 2 = 10%, Subscription = 0%)', async () => {
  const nowMs = Date.parse('2026-11-22T14:00:00.000Z');
  const db = createUnifiedFirestore(
    {
      'commercial_packages/pkg_v7_miner': {
        id: 'pkg_v7_miner',
        name: 'Minero 1',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 48,
        priceUsdt: 500
      },
      'commercial_packages/pkg_v7_sub': {
        id: 'pkg_v7_sub',
        name: 'Suscripción Mensual',
        packageType: 'subscription',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 0,
        priceUsdt: 49.99
      },
      'users/u1_buyer': { uid: 'u1_buyer', status: 'active' },
      'users/u2_sponsor': {
        uid: 'u2_sponsor',
        status: 'active',
        emailVerified: true,
        referral: { referralCode: 'U2CODE' }
      }
    },
    { nowIso: () => new Date(nowMs).toISOString() }
  );

  const ids = ['pi_v7_miner1', 'pi_v7_miner2', 'pi_v7_sub'];
  let idx = 0;

  const rpcMock = createGuardedRpcMock(db, {
    eth_chainId: '0x61',
    eth_blockNumber: '0x100',
    eth_getTransactionReceipt: (params) => {
      const amount = params[0] === EVM_TX_7 ? '49990000000000000000' : '500000000000000000000';
      return buildErc20Receipt({
        txHash: params[0],
        tokenAddress: BSC_TESTNET_USDT,
        from: SENDER_EVM,
        to: TREASURY_EVM,
        amountAtomic: amount,
        blockHex: '0x64'
      });
    },
    eth_getTransactionByHash: (params) => ({ hash: params[0], from: SENDER_EVM, to: BSC_TESTNET_USDT, value: '0x0' })
  });

  const handlers = createPaymentHandlers({
    db,
    env: buildTestnetEnv(),
    now: () => nowMs,
    fetchImpl: rpcMock,
    idGenerator: () => ids[idx++]
  });

  // 1) User 1 creates Miner 1 intent BEFORE linking any referral code
  const m1Intent = await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u1_buyer', token: {} },
    data: { packageId: 'pkg_v7_miner', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  assert.equal(m1Intent.referralSnapshotLocked, true);
  assert.equal(m1Intent.sponsorUid, null);

  // 2) User 1 NOW links User 2's referral code AFTER Miner 1 was created
  await db.collection('users').doc('u1_buyer').update({
    sponsorId: 'u2_sponsor',
    referral: { referrerBy: 'U2CODE' }
  });

  // 3) Miner 1 settles -> MUST remain 0% (MISSING_SPONSOR) due to locked snapshot
  const m1Settled = await handlers.handleConfirmPaymentIntent({
    auth: { uid: 'u1_buyer', token: {} },
    data: { intentId: 'pi_v7_miner1', txHash: EVM_TX_5 }
  });
  assert.equal(m1Settled.outcome, 'SETTLED');
  const m1Comm = await handlePurchaseSettledEvent({
    orderId: 'pi_v7_miner1',
    beforeData: { status: 'AWAITING' },
    afterData: db._store.get('admin_orders/pi_v7_miner1'),
    db,
    FieldValue
  });
  assert.equal(m1Comm.status, 'rejected');
  assert.equal(m1Comm.reason, 'MISSING_SPONSOR');
  assert.equal(db._store.has('userBalances/u2_sponsor'), false);

  // 4) Miner 2 created AFTER linking -> settles -> exact 10% = $50.00 = 50_000_000 micros
  const m2Intent = await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u1_buyer', token: {} },
    data: { packageId: 'pkg_v7_miner', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  assert.equal(m2Intent.sponsorUid, 'u2_sponsor');
  const m2Settled = await handlers.handleConfirmPaymentIntent({
    auth: { uid: 'u1_buyer', token: {} },
    data: { intentId: 'pi_v7_miner2', txHash: EVM_TX_6 }
  });
  assert.equal(m2Settled.outcome, 'SETTLED');
  const m2Comm = await handlePurchaseSettledEvent({
    orderId: 'pi_v7_miner2',
    beforeData: { status: 'AWAITING' },
    afterData: db._store.get('admin_orders/pi_v7_miner2'),
    db,
    FieldValue
  });
  assert.equal(m2Comm.status, 'credited');
  assert.equal(m2Comm.commissionUsdt6, '50.000000');
  assert.equal(db._store.get('userBalances/u2_sponsor').availableBalanceMicros, 50_000_000);

  // 5) Subscription purchase (productType: 'subscription') -> settles -> 0% commission, 0 miner created
  const subIntent = await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u1_buyer', token: {} },
    data: { productType: 'subscription', packageId: 'pkg_v7_sub', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  assert.equal(subIntent.productType, 'subscription');
  assert.equal(subIntent.commissionEligible, false);

  const subSettled = await handlers.handleConfirmPaymentIntent({
    auth: { uid: 'u1_buyer', token: {} },
    data: { intentId: 'pi_v7_sub', txHash: EVM_TX_7 }
  });
  assert.equal(subSettled.outcome, 'SETTLED');
  assert.equal(subSettled.activatedMinerId, null);

  const subComm = await handlePurchaseSettledEvent({
    orderId: 'pi_v7_sub',
    beforeData: { status: 'AWAITING' },
    afterData: db._store.get('admin_orders/pi_v7_sub'),
    db,
    FieldValue
  });
  assert.equal(subComm.status, 'rejected');
  assert.equal(subComm.reason, 'NON_MINER_PRODUCT');
  assert.equal(db._store.get('userBalances/u2_sponsor').availableBalanceMicros, 50_000_000);
});

// ============================================================================
// VECTOR 8: Daily Mining Profit (SCRUM-327) & Unilevel Distribution (SCRUM-230) Compatibility
// ============================================================================

test('SCRUM-347 [V8]: Settled miner (status: active) is picked up by runFinalizeDailyMiningProfitBatch and triggers Unilevel distribution', async () => {
  const nowMs = Date.parse('2026-11-22T15:00:00.000Z');
  const db = createUnifiedFirestore(
    {
      'operatorConfig/mining': {
        baseElectricityUsdPerKwh: '0.01',
        grossRevenuePerThUsdt: '0.02375'
      },
      'commercial_packages/pkg_v8': {
        id: 'pkg_v8',
        name: 'Minero 120 TH',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 120,
        efficiencyWattsPerTh: 15,
        priceUsdt: 1000
      },
      'users/u_sponsor_v8': {
        uid: 'u_sponsor_v8',
        status: 'active',
        emailVerified: true,
        referral: { referralCode: 'SPONV8' }
      },
      'unilevel/u_sponsor_v8': {
        uid: 'u_sponsor_v8',
        activeReferredMinersCount: 0,
        directCount: 1,
        totalTeamCount: 1
      },
      'users/u_buyer_v8': {
        uid: 'u_buyer_v8',
        status: 'active',
        emailVerified: true,
        sponsorId: 'u_sponsor_v8',
        referral: { referralCode: 'BUYERV8', referrerBy: 'SPONV8' }
      },
      'unilevel/u_buyer_v8': {
        uid: 'u_buyer_v8',
        activeReferredMinersCount: 0
      }
    },
    { nowIso: () => new Date(nowMs).toISOString() }
  );

  const rpcMock = createGuardedRpcMock(db, {
    eth_chainId: '0x61',
    eth_blockNumber: '0x120',
    eth_getTransactionReceipt: (params) =>
      buildErc20Receipt({
        txHash: params[0],
        tokenAddress: BSC_TESTNET_USDT,
        from: SENDER_EVM,
        to: TREASURY_EVM,
        amountAtomic: '1000000000000000000000',
        blockHex: '0x64'
      }),
    eth_getTransactionByHash: (params) => ({ hash: params[0], from: SENDER_EVM, to: BSC_TESTNET_USDT, value: '0x0' })
  });

  const handlers = createPaymentHandlers({
    db,
    env: buildTestnetEnv(),
    now: () => nowMs,
    fetchImpl: rpcMock,
    idGenerator: () => 'pi_v8_miner'
  });

  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_buyer_v8', token: {} },
    data: { packageId: 'pkg_v8', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  const settled = await handlers.handleConfirmPaymentIntent({
    auth: { uid: 'u_buyer_v8', token: {} },
    data: { intentId: 'pi_v8_miner', txHash: EVM_TX_1 }
  });
  assert.equal(settled.outcome, 'SETTLED');
  assert.equal(settled.activatedMinerId, 'miner_pi_v8_miner');

  // Step 1: SCRUM-229 direct referral unlocks sponsor's activeReferredMinersCount=1
  const commRes = await handlePurchaseSettledEvent({
    orderId: 'pi_v8_miner',
    beforeData: { status: 'AWAITING' },
    afterData: db._store.get('admin_orders/pi_v8_miner'),
    db,
    FieldValue
  });
  assert.equal(commRes.status, 'credited');
  assert.equal(commRes.commissionUsdt6, '100.000000');

  // Step 2: SCRUM-327 daily mining profit scans collectionGroup('miner') -> picks up miner_pi_v8_miner
  const batchRes = await runFinalizeDailyMiningProfitBatch({
    db,
    FieldValue,
    periodDate: '2026-11-22',
    finalizedAt: '2026-11-23T00:05:00Z'
  });
  assert.equal(batchRes.totalScanned, 1);
  assert.equal(batchRes.finalizedCount, 1);
  assert.equal(batchRes.errorCount, 0);

  const profitDoc = db._store.get('mining_daily_profit/miner_pi_v8_miner_2026-11-22');
  assert.ok(profitDoc, 'Daily profit doc must exist for paymentSettlementService miner');
  assert.equal(profitDoc.status, 'finalized');
  assert.equal(profitDoc.eligibleProfitUsdt6, '2.176200');

  // Step 3: SCRUM-230 Unilevel distribution runs cleanly on finalized profit
  const unilevelRes = await handleMiningProfitFinalizedEvent({
    dailyProfitId: 'miner_pi_v8_miner_2026-11-22',
    beforeData: null,
    afterData: profitDoc,
    db,
    FieldValue
  });
  assert.equal(unilevelRes.status, 'distributed');
  assert.equal(unilevelRes.distributedUsdt6, '0.042435');
  assert.equal(unilevelRes.userMiningPayoutUsdt6, '2.133764');

  const sponsorStats = await getUnilevelStatsForUser({ db, uid: 'u_sponsor_v8' });
  assert.equal(sponsorStats.eligibleForUnilevel, true);
  assert.equal(sponsorStats.receivedUnilevelCommission, 0.042435);
});

// ============================================================================
// VECTOR 9: Case B Autonomous Reconciliation (Browser Closed) — EVM Testnet + Solana Devnet
// ============================================================================

test('SCRUM-347 [V9]: Case B autonomous reconcilePendingPayments discovers deposits on EVM Testnet & Solana Devnet without confirmPaymentIntent, advances AWAITING -> PROCESSING -> SETTLED, and triggers SCRUM-229', async () => {
  let currentNowMs = Date.parse('2026-11-22T16:00:00.000Z');
  const db = createUnifiedFirestore(
    {
      'commercial_packages/pkg_v9': {
        id: 'pkg_v9',
        name: 'Minero Autónomo',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 32,
        priceUsdt: 250
      },
      'users/u_sponsor_v9': { uid: 'u_sponsor_v9', status: 'active', emailVerified: true },
      'users/u_buyer_v9': { uid: 'u_buyer_v9', status: 'active', sponsorId: 'u_sponsor_v9' }
    },
    { nowIso: () => new Date(currentNowMs).toISOString() }
  );

  const ids = ['pi_v9_evm_auto', 'pi_v9_sol_auto'];
  let idx = 0;
  let evmLatestBlockHex = '0x68'; // block 104 -> tx at block 100 has 5/15 confirmations (PROCESSING)

  const rpcMock = createGuardedRpcMock(db, {
    eth_chainId: '0x61', // BSC Testnet 97
    eth_blockNumber: () => evmLatestBlockHex,
    eth_getLogs: () => [
      {
        address: BSC_TESTNET_USDT,
        transactionHash: EVM_TX_6,
        topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
        data: encodeUint256Hex(250_000_000_000_000_000_000n),
        removed: false
      }
    ],
    eth_getTransactionReceipt: (params) =>
      buildErc20Receipt({
        txHash: params[0],
        tokenAddress: BSC_TESTNET_USDT,
        from: SENDER_EVM,
        to: TREASURY_EVM,
        amountAtomic: '250000000000000000000',
        blockHex: '0x64' // block 100
      }),
    eth_getTransactionByHash: (params) => ({ hash: params[0], from: SENDER_EVM, to: BSC_TESTNET_USDT, value: '0x0' }),
    getSignaturesForAddress: (params) => {
      if (params[0] === TREASURY_SOL_ATA) {
        return [{ signature: SOL_SIG_3, err: null, blockTime: Math.floor(currentNowMs / 1000) }];
      }
      return [];
    },
    getTokenAccountsByOwner: () => ({ value: [{ pubkey: TREASURY_SOL_ATA }] }),
    getTransaction: (params) => {
      if (params[0] === SOL_SIG_3) {
        return buildSolanaSplTx({
          mint: SOLANA_DEVNET_USDT_MINT,
          fromOwner: SENDER_SOL,
          toOwner: TREASURY_SOL,
          amountAtomic: '250000000',
          blockTime: Math.floor(currentNowMs / 1000)
        });
      }
      return null;
    }
  });

  const handlers = createPaymentHandlers({
    db,
    env: buildTestnetEnv(),
    now: () => currentNowMs,
    fetchImpl: rpcMock,
    idGenerator: () => ids[idx++]
  });

  // User creates 2 intents, selects payment methods, transmits on-chain, and CLOSES BROWSER (0 confirmPaymentIntent calls!)
  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_buyer_v9', token: {} },
    data: { packageId: 'pkg_v9', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  await handlers.handleCreatePaymentIntent({
    auth: { uid: 'u_buyer_v9', token: {} },
    data: { packageId: 'pkg_v9', networkId: 'solana', assetSymbol: 'USDT', senderWallet: SENDER_SOL }
  });

  currentNowMs += 60 * 1000;

  // Reconciler Run #1:
  // - BSC Testnet deposit discovered at 5/15 confirmations -> PROCESSING
  // - Solana Devnet finalized deposit discovered via Treasury ATA -> SETTLED immediately
  const run1 = await handlers.handleReconcilePendingPayments({ batchLimit: 20, maxConcurrency: 2 });
  assert.equal(run1.scanned, 2);
  assert.equal(run1.processing, 1);
  assert.equal(run1.settled, 1);
  assert.equal(run1.errorsCount, 0);

  assert.equal(db._store.get('admin_orders/pi_v9_evm_auto').status, PAYMENT_STATUSES.PROCESSING);
  assert.equal(db._store.get('admin_orders/pi_v9_evm_auto').confirmations, 5);
  assert.equal(db._store.has('miners/u_buyer_v9/miner/miner_pi_v9_evm_auto'), false);

  assert.equal(db._store.get('admin_orders/pi_v9_sol_auto').status, PAYMENT_STATUSES.SETTLED);
  assert.equal(db._store.get('miners/u_buyer_v9/miner/miner_pi_v9_sol_auto').status, 'active');
  assert.equal(db._store.get('admin_contracts/contract_pi_v9_sol_auto').status, 'ACTIVE');

  // Trigger SCRUM-229 on Solana autonomous settlement -> $25.00 = 25_000_000 micros
  const solComm = await handlePurchaseSettledEvent({
    orderId: 'pi_v9_sol_auto',
    beforeData: { status: 'AWAITING' },
    afterData: db._store.get('admin_orders/pi_v9_sol_auto'),
    db,
    FieldValue
  });
  assert.equal(solComm.status, 'credited');
  assert.equal(solComm.commissionUsdt6, '25.000000');

  // Reconciler Run #2: BSC Testnet reaches block 115 -> 16/15 confirmations -> SETTLED
  evmLatestBlockHex = '0x73'; // 115
  currentNowMs += 60 * 1000;
  const run2 = await handlers.handleReconcilePendingPayments({ batchLimit: 20, maxConcurrency: 2 });
  assert.equal(run2.scanned, 1);
  assert.equal(run2.settled, 1);
  assert.equal(run2.errorsCount, 0);

  assert.equal(db._store.get('admin_orders/pi_v9_evm_auto').status, PAYMENT_STATUSES.SETTLED);
  assert.equal(db._store.get('miners/u_buyer_v9/miner/miner_pi_v9_evm_auto').status, 'active');
  assert.equal(db._store.get('admin_contracts/contract_pi_v9_evm_auto').status, 'ACTIVE');

  // Trigger SCRUM-229 on BSC autonomous settlement -> another $25.00 (total 50_000_000 micros)
  const evmComm = await handlePurchaseSettledEvent({
    orderId: 'pi_v9_evm_auto',
    beforeData: { status: 'PROCESSING' },
    afterData: db._store.get('admin_orders/pi_v9_evm_auto'),
    db,
    FieldValue
  });
  assert.equal(evmComm.status, 'credited');
  assert.equal(evmComm.commissionUsdt6, '25.000000');
  assert.equal(db._store.get('userBalances/u_sponsor_v9').availableBalanceMicros, 50_000_000);

  // Zero CONFIRMED status emitted across the entire lifecycle
  assert.equal(
    db._recordedStatuses.some((entry) => String(entry.status).toUpperCase() === 'CONFIRMED'),
    false,
    'Canonical state machine must NEVER emit CONFIRMED'
  );
});
