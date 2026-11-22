'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');

const { PAYMENT_STATUSES } = require('../src/payments/paymentConfig');
const { createPaymentIntentService } = require('../src/payments/paymentIntentService');
const { ERC20_TRANSFER_TOPIC } = require('../src/payments/evmVerifier');
const { buildUsedTxHashKey, createOnChainVerifier } = require('../src/payments/onChainVerifier');
const { handlePurchaseSettledEvent } = require('../src/referrals/onPurchaseSettled');
const { runFinalizeDailyMiningProfitBatch } = require('../src/unilevel/dailyMiningProfitService');

const {
  PaymentSettlementError,
  buildActivatedMinerId,
  buildContractId,
  createPaymentSettlementService
} = require('../src/payments/paymentSettlementService');
const { createPaymentReconciler } = require('../src/payments/paymentReconciler');
const paymentsModule = require('../src/payments');

const TREASURY_EVM = '0x1111111111111111111111111111111111111111';
const TREASURY_SOL = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const SENDER_EVM = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_EVM = '0x9999999999999999999999999999999999999999';
const BSC_USDT_MAINNET = '0x55d398326f99059fF775485246999027B3197955';

const TX_HASH_1 = '0x1111111111111111111111111111111111111111111111111111111111111111';
const TX_HASH_2 = '0x2222222222222222222222222222222222222222222222222222222222222222';
const TX_HASH_3 = '0x3333333333333333333333333333333333333333333333333333333333333333';
const TX_HASH_4 = '0x4444444444444444444444444444444444444444444444444444444444444444';

function padTopicAddress(addr) {
  return `0x${addr.toLowerCase().slice(2).padStart(64, '0')}`;
}

function encodeUint256Hex(valueBigInt) {
  return `0x${valueBigInt.toString(16).padStart(64, '0')}`;
}

function buildEnv(overrides = {}) {
  return {
    PAYMENT_NETWORK_MODE: 'mainnet',
    TREASURY_EVM_ADDRESS: TREASURY_EVM,
    TREASURY_SOLANA_ADDRESS: TREASURY_SOL,
    PAYMENT_RPC_URL_BSC_TESTNET: 'https://rpc.bsc-testnet.example',
    PAYMENT_RPC_URL_BSC_MAINNET: 'https://rpc.bsc-mainnet.example',
    PAYMENT_RPC_URL_POLYGON_TESTNET: 'https://rpc.polygon-testnet.example',
    PAYMENT_RPC_URL_POLYGON_MAINNET: 'https://rpc.polygon-mainnet.example',
    PAYMENT_RPC_URL_ETHEREUM_TESTNET: 'https://rpc.ethereum-testnet.example',
    PAYMENT_RPC_URL_ETHEREUM_MAINNET: 'https://rpc.ethereum-mainnet.example',
    PAYMENT_RPC_URL_SOLANA_TESTNET: 'https://rpc.solana-devnet.example',
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
  const parts = dottedPath.split('.');
  let cur = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function applyFieldOps(existing, patch, nowIso) {
  const base = existing ? structuredClone(existing) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && value.__op === 'increment') {
      const prev = typeof base[key] === 'number' && Number.isFinite(base[key]) ? base[key] : 0;
      base[key] = prev + value.delta;
    } else if (value && typeof value === 'object' && value.__op === 'serverTimestamp') {
      base[key] = nowIso;
    } else {
      base[key] = structuredClone(value);
    }
  }
  return base;
}

function createStrictFirestoreDb(initialDocs = {}, { nowIso = () => '2026-11-22T00:05:00.000Z' } = {}) {
  const store = new Map();
  for (const [docPath, data] of Object.entries(initialDocs)) {
    store.set(docPath, structuredClone(data));
  }

  const txContext = new AsyncLocalStorage();
  const recordedStatuses = [];
  const orderTransitions = [];

  function trackWrite(fullPath, before, after) {
    if (fullPath.startsWith('payment_intents/') || fullPath.startsWith('admin_orders/')) {
      if (after && after.status !== undefined) {
        recordedStatuses.push({ path: fullPath, status: after.status });
      }
    }
    if (fullPath.startsWith('admin_orders/')) {
      const orderId = fullPath.slice('admin_orders/'.length);
      orderTransitions.push({
        orderId,
        beforeData: before ? structuredClone(before) : null,
        afterData: after ? structuredClone(after) : null
      });
    }
  }

  function makeDocRef(fullPath) {
    const segments = fullPath.split('/');
    const id = segments[segments.length - 1];
    const parentCollection = segments.length >= 2 ? segments[segments.length - 2] : null;
    const parentDocId = segments.length >= 3 ? segments[segments.length - 3] : null;
    return {
      id,
      path: fullPath,
      parent: {
        id: parentCollection,
        parent: parentDocId ? { id: parentDocId } : null
      },
      collection(subName) {
        return makeCollectionRef(`${fullPath}/${subName}`);
      },
      async get() {
        const exists = store.has(fullPath);
        const data = exists ? structuredClone(store.get(fullPath)) : undefined;
        return { id, exists, data: () => data };
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
        throw new Error(`Unsupported query operator in mock: ${op}`);
      }
    }
    return true;
  }

  function makeQuery(collectionPath, filters = [], limitVal = null) {
    const prefix = `${collectionPath}/`;
    const expectedDepth = collectionPath.split('/').length + 1;
    return {
      __isQuery: true,
      collectionPath,
      filters,
      limitVal,
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
          docs.push({ id, ref: makeDocRef(docPath), data: () => structuredClone(data) });
          if (limitVal !== null && docs.length >= limitVal) break;
        }
        return { empty: docs.length === 0, size: docs.length, docs };
      }
    };
  }

  function makeCollectionRef(collectionPath) {
    const queryBase = makeQuery(collectionPath);
    return {
      ...queryBase,
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
          docs.push({ id, ref: makeDocRef(docPath), data: () => structuredClone(data) });
          if (limitVal !== null && docs.length >= limitVal) break;
        }
        return { empty: docs.length === 0, size: docs.length, docs };
      }
    };
  }

  const db = {
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
      let hasWritten = false;
      const pendingOps = [];
      const tx = {
        async get(target) {
          if (hasWritten) {
            throw new Error('FIRESTORE_TX_READ_AFTER_WRITE: tx.get called after write in transaction');
          }
          if (target && target.__isQuery) {
            return target.get();
          }
          return target.get();
        },
        set(ref, payload, options = {}) {
          hasWritten = true;
          pendingOps.push({ type: 'set', ref, payload: structuredClone(payload), options });
        },
        update(ref, patch) {
          hasWritten = true;
          pendingOps.push({ type: 'update', ref, patch: structuredClone(patch) });
        }
      };
      return txContext.run(true, async () => {
        const result = await fn(tx);
        for (const op of pendingOps) {
          if (op.type === 'set') {
            const before = store.has(op.ref.path) ? structuredClone(store.get(op.ref.path)) : null;
            const next = op.options && op.options.merge
              ? applyFieldOps(before, op.payload, nowIso())
              : applyFieldOps(null, op.payload, nowIso());
            store.set(op.ref.path, next);
            trackWrite(op.ref.path, before, next);
          } else if (op.type === 'update') {
            if (!store.has(op.ref.path)) {
              throw new Error(`Document not found for tx.update: ${op.ref.path}`);
            }
            const before = structuredClone(store.get(op.ref.path));
            const next = applyFieldOps(before, op.patch, nowIso());
            store.set(op.ref.path, next);
            trackWrite(op.ref.path, before, next);
          }
        }
        return result;
      });
    },
    _store: store,
    _isInTransaction: () => Boolean(txContext.getStore()),
    _recordedStatuses: recordedStatuses,
    _orderTransitions: orderTransitions
  };

  return db;
}

function createTxGuardedRpcMock(db, handlers) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    if (db._isInTransaction()) {
      throw new Error('FATAL_RPC_INSIDE_TRANSACTION: fetchImpl invoked while Firestore transaction is active');
    }
    const body = JSON.parse(options.body);
    calls.push({ url, method: body.method, params: body.params });
    if (!Object.hasOwn(handlers, body.method)) {
      throw new Error(`Unmocked JSON-RPC method: ${body.method}`);
    }
    const handler = handlers[body.method];
    const output = typeof handler === 'function' ? await handler(body.params, url, calls) : handler;
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: body.id, result: output })
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function buildBscUsdtReceipt({ txHash, blockHex = '0x64', status = '0x1', from = SENDER_EVM, to = TREASURY_EVM, amountAtomic }) {
  return {
    transactionHash: txHash,
    blockNumber: blockHex,
    status,
    from,
    logs: [
      {
        address: BSC_USDT_MAINNET,
        removed: false,
        topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(from), padTopicAddress(to)],
        data: encodeUint256Hex(BigInt(amountAtomic))
      }
    ]
  };
}

// ============================================================================
// 1. ATOMIC MINER SETTLEMENT + SINGLE SCRUM-229 TRIGGER + IDEMPOTENCY
// ============================================================================

test('paymentSettlement [1]: full miner flow OPEN/AWAITING -> PROCESSING (6/15) -> SETTLED (15/15) triggers SCRUM-229 once, creates miner/contract/usedTxHashes, and is idempotent', async () => {
  let currentNowMs = Date.parse('2026-11-22T00:00:00.000Z');
  const db = createStrictFirestoreDb(
    {
      'commercial_packages/pkg_starter': {
        id: 'pkg_starter',
        name: 'Starter 10 TH',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 10,
        efficiencyWattsPerTh: 15,
        priceUsdt: 100
      },
      'users/buyer_1': {
        uid: 'buyer_1',
        email: 'buyer1@example.com',
        sponsorUid: 'sponsor_1',
        sponsorLinkedAt: '2026-11-20T00:00:00.000Z',
        status: 'active'
      },
      'users/sponsor_1': {
        uid: 'sponsor_1',
        email: 'sponsor1@example.com',
        status: 'active'
      }
    },
    { nowIso: () => new Date(currentNowMs).toISOString() }
  );

  const env = buildEnv();
  let latestBlockHex = '0x69'; // block 105 -> 105 - 100 + 1 = 6/15 confirmations
  const rpcMock = createTxGuardedRpcMock(db, {
    eth_chainId: '0x38',
    eth_getTransactionReceipt: () =>
      buildBscUsdtReceipt({ txHash: TX_HASH_1, blockHex: '0x64', amountAtomic: '100000000000000000000' }),
    eth_getTransactionByHash: () => ({ hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' }),
    eth_blockNumber: () => latestBlockHex
  });

  const intentService = createPaymentIntentService({
    db,
    env,
    now: () => currentNowMs,
    idGenerator: () => 'pi_miner_001'
  });
  const settlementService = createPaymentSettlementService({
    db,
    env,
    now: () => currentNowMs,
    fetchImpl: rpcMock
  });

  // Step A: Create intent (AWAITING)
  const created = await intentService.createPaymentIntent({
    buyerUid: 'buyer_1',
    packageId: 'pkg_starter',
    networkId: 'bsc',
    assetSymbol: 'USDT',
    senderWallet: SENDER_EVM
  });
  assert.equal(created.status, PAYMENT_STATUSES.AWAITING);
  assert.equal(created.sponsorUid, 'sponsor_1');
  assert.equal(created.referralSnapshotLocked, true);

  // Step B: Verify at 6/15 confirmations -> PROCESSING (0 miner, 0 contract, 0 referral commission)
  currentNowMs = Date.parse('2026-11-22T00:02:00.000Z');
  const processingRes = await settlementService.processIntentVerificationAndSettlement({
    intentId: 'pi_miner_001',
    txHash: TX_HASH_1,
    requesterUid: 'buyer_1'
  });
  assert.equal(processingRes.outcome, 'PROCESSING');
  assert.equal(processingRes.status, 'PROCESSING');
  assert.equal(processingRes.confirmations, 6);
  assert.equal(processingRes.requiredConfirmations, 15);

  const minerId = buildActivatedMinerId('pi_miner_001');
  const contractId = buildContractId('pi_miner_001');
  assert.equal(minerId, 'miner_pi_miner_001');
  assert.equal(contractId, 'contract_pi_miner_001');
  assert.equal(db._store.has(`miners/buyer_1/miner/${minerId}`), false);
  assert.equal(db._store.has(`admin_contracts/${contractId}`), false);

  // Simulate onPurchaseSettled trigger on AWAITING -> PROCESSING transition: must ignore (0% commission)
  const procTransition = db._orderTransitions[db._orderTransitions.length - 1];
  const procHook = await handlePurchaseSettledEvent({
    beforeData: procTransition.beforeData,
    afterData: procTransition.afterData,
    orderId: procTransition.orderId,
    db,
    FieldValue
  });
  assert.equal(procHook.status, 'ignored');
  assert.equal(db._store.has('userBalances/sponsor_1'), false);

  // Step C: Advance chain to 15/15 confirmations -> SETTLED atomically
  latestBlockHex = '0x72'; // block 114 -> 114 - 100 + 1 = 15/15
  currentNowMs = Date.parse('2026-11-22T00:04:00.000Z');
  const settledRes = await settlementService.processIntentVerificationAndSettlement({
    intentId: 'pi_miner_001',
    txHash: TX_HASH_1,
    requesterUid: 'buyer_1'
  });
  assert.equal(settledRes.outcome, 'SETTLED');
  assert.equal(settledRes.status, 'SETTLED');
  assert.equal(settledRes.activatedMinerId, minerId);
  assert.equal(settledRes.contractId, contractId);
  assert.equal(settledRes.txHash, TX_HASH_1);

  // Verify miner, contract, usedTxHashes, intent, and order documents
  const minerDoc = db._store.get(`miners/buyer_1/miner/${minerId}`);
  assert.ok(minerDoc);
  assert.equal(minerDoc.id, minerId);
  assert.equal(minerDoc.userId, 'buyer_1');
  assert.equal(minerDoc.status, 'active');
  assert.equal(minerDoc.powerTh, 10);
  assert.equal(minerDoc.efficiencyWattsPerTh, 15);
  assert.equal(minerDoc.priceUsd, 100);
  assert.equal(minerDoc.orderId, 'pi_miner_001');
  assert.equal(minerDoc.txHash, TX_HASH_1);

  const contractDoc = db._store.get(`admin_contracts/${contractId}`);
  assert.ok(contractDoc);
  assert.equal(contractDoc.id, contractId);
  assert.equal(contractDoc.activatedMinerId, minerId);
  assert.equal(contractDoc.status, 'ACTIVE');
  assert.equal(contractDoc.amountUsd, 100);

  const usedKey = buildUsedTxHashKey(56, TX_HASH_1);
  const usedDoc = db._store.get(`usedTxHashes/${usedKey}`);
  assert.ok(usedDoc);
  assert.equal(usedDoc.intentId, 'pi_miner_001');
  assert.equal(usedDoc.orderId, 'pi_miner_001');

  // Verify onPurchaseSettled fires cleanly ONCE on PROCESSING -> SETTLED and credits exact 10% (10 USDT = 10_000_000 micros)
  const settleTransition = db._orderTransitions[db._orderTransitions.length - 1];
  assert.equal(settleTransition.beforeData.status, 'PROCESSING');
  assert.equal(settleTransition.afterData.status, 'SETTLED');
  assert.equal(settleTransition.afterData.referralSnapshotLocked, true);
  assert.equal(settleTransition.afterData.sponsorUid, 'sponsor_1');

  const settleHook = await handlePurchaseSettledEvent({
    beforeData: settleTransition.beforeData,
    afterData: settleTransition.afterData,
    orderId: settleTransition.orderId,
    db,
    FieldValue
  });
  assert.equal(settleHook.status, 'credited');
  assert.equal(settleHook.commissionUsdt6, '10.000000');
  assert.equal(db._store.get('userBalances/sponsor_1').availableBalanceMicros, 10_000_000);
  assert.equal(db._store.get('unilevel/sponsor_1').activeReferredMinersCount, 1);

  // Step D: Re-running settlement on already SETTLED intent -> ALREADY_SETTLED with 0 extra RPC calls & 0 duplicates
  const callsBeforeReplay = rpcMock.calls.length;
  const idempotentRes = await settlementService.processIntentVerificationAndSettlement({
    intentId: 'pi_miner_001',
    txHash: TX_HASH_1,
    requesterUid: 'buyer_1'
  });
  assert.equal(idempotentRes.outcome, 'ALREADY_SETTLED');
  assert.equal(idempotentRes.status, 'SETTLED');
  assert.equal(idempotentRes.activatedMinerId, minerId);
  assert.equal(idempotentRes.contractId, contractId);
  assert.equal(rpcMock.calls.length, callsBeforeReplay);
  assert.equal(db._store.get('userBalances/sponsor_1').availableBalanceMicros, 10_000_000);

  // Anti-CONFIRMED invariant across every status ever written
  assert.equal(
    db._recordedStatuses.some((entry) => String(entry.status).toUpperCase() === 'CONFIRMED'),
    false
  );
});

// ============================================================================
// 2. NON-RETROACTIVE REFERRAL RULE E2E (PURCHASE 1 VS PURCHASE 2)
// ============================================================================

test('paymentSettlement [2]: enforces non-retroactive referral rule E2E (Purchase 1 pre-link = 0% MISSING_SPONSOR, Purchase 2 post-link = 10% credited)', async () => {
  let currentNowMs = Date.parse('2026-11-22T01:00:00.000Z');
  const db = createStrictFirestoreDb(
    {
      'commercial_packages/pkg_50': {
        id: 'pkg_50',
        name: 'Miner 4 TH',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 4,
        efficiencyWattsPerTh: 15,
        priceUsdt: 50
      },
      'users/u1': {
        uid: 'u1',
        email: 'u1@example.com',
        status: 'active'
      },
      'users/u2': {
        uid: 'u2',
        email: 'u2@example.com',
        status: 'active',
        referral: { referralCode: 'U2CODE' }
      }
    },
    { nowIso: () => new Date(currentNowMs).toISOString() }
  );

  const env = buildEnv();
  let nextId = 0;
  const ids = ['pi_nonretro_1', 'pi_nonretro_2'];
  const intentService = createPaymentIntentService({
    db,
    env,
    now: () => currentNowMs,
    idGenerator: () => ids[nextId++]
  });

  const rpcMock = createTxGuardedRpcMock(db, {
    eth_chainId: '0x38',
    eth_getTransactionReceipt: (params) =>
      buildBscUsdtReceipt({ txHash: params[0], blockHex: '0x64', amountAtomic: '50000000000000000000' }),
    eth_getTransactionByHash: (params) => ({ hash: params[0], from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' }),
    eth_blockNumber: '0x80'
  });
  const settlementService = createPaymentSettlementService({
    db,
    env,
    now: () => currentNowMs,
    fetchImpl: rpcMock
  });

  // Purchase 1 created BEFORE linking u2 referral code -> snapshot locks sponsorUid = null
  const intent1 = await intentService.createPaymentIntent({
    buyerUid: 'u1',
    packageId: 'pkg_50',
    networkId: 'bsc',
    assetSymbol: 'USDT',
    senderWallet: SENDER_EVM
  });
  assert.equal(intent1.sponsorUid, null);
  assert.equal(intent1.referralSnapshotLocked, true);

  // User u1 links u2's referral code AFTER Intent 1 creation
  currentNowMs = Date.parse('2026-11-22T01:02:00.000Z');
  await db.collection('users').doc('u1').set(
    {
      sponsorId: 'u2',
      referral: { referrerBy: 'U2CODE', linkedAt: new Date(currentNowMs).toISOString() }
    },
    { merge: true }
  );

  // Intent 1 settles -> onPurchaseSettled MUST return MISSING_SPONSOR (0% commission)
  currentNowMs = Date.parse('2026-11-22T01:03:00.000Z');
  const settle1 = await settlementService.processIntentVerificationAndSettlement({
    intentId: 'pi_nonretro_1',
    txHash: TX_HASH_1,
    requesterUid: 'u1'
  });
  assert.equal(settle1.outcome, 'SETTLED');
  const trans1 = db._orderTransitions[db._orderTransitions.length - 1];
  const hook1 = await handlePurchaseSettledEvent({
    beforeData: trans1.beforeData,
    afterData: trans1.afterData,
    orderId: trans1.orderId,
    db,
    FieldValue
  });
  assert.equal(hook1.status, 'rejected');
  assert.equal(hook1.reason, 'MISSING_SPONSOR');
  assert.equal(db._store.has('userBalances/u2'), false);

  // Purchase 2 created AFTER linking u2 -> snapshot locks sponsorUid = 'u2' -> 10% (5 USDT = 5_000_000 micros) credited
  currentNowMs = Date.parse('2026-11-22T01:05:00.000Z');
  const intent2 = await intentService.createPaymentIntent({
    buyerUid: 'u1',
    packageId: 'pkg_50',
    networkId: 'bsc',
    assetSymbol: 'USDT',
    senderWallet: SENDER_EVM
  });
  assert.equal(intent2.sponsorUid, 'u2');
  assert.equal(intent2.referralSnapshotLocked, true);

  const settle2 = await settlementService.processIntentVerificationAndSettlement({
    intentId: 'pi_nonretro_2',
    txHash: TX_HASH_2,
    requesterUid: 'u1'
  });
  assert.equal(settle2.outcome, 'SETTLED');
  const trans2 = db._orderTransitions[db._orderTransitions.length - 1];
  const hook2 = await handlePurchaseSettledEvent({
    beforeData: trans2.beforeData,
    afterData: trans2.afterData,
    orderId: trans2.orderId,
    db,
    FieldValue
  });
  assert.equal(hook2.status, 'credited');
  assert.equal(hook2.commissionUsdt6, '5.000000');
  assert.equal(db._store.get('userBalances/u2').availableBalanceMicros, 5_000_000);
});

// ============================================================================
// 3. SUBSCRIPTION SETTLEMENT (NO MINER, NO CONTRACT, 0% COMMISSION)
// ============================================================================

test('paymentSettlement [3]: subscription settlement reserves usedTxHashes and settles admin_orders without creating miner/contract or referral commission', async () => {
  const nowMs = Date.parse('2026-11-22T02:00:00.000Z');
  const db = createStrictFirestoreDb(
    {
      'commercial_packages/sub_pro': {
        id: 'sub_pro',
        name: 'Pro Monthly',
        packageType: 'subscription',
        status: 'ACTIVE',
        isPublished: true,
        priceUsdt: 29
      },
      'users/sub_buyer': {
        uid: 'sub_buyer',
        email: 'sub@example.com',
        sponsorUid: 'sponsor_1',
        sponsorLinkedAt: '2026-11-01T00:00:00.000Z',
        status: 'active'
      },
      'users/sponsor_1': { uid: 'sponsor_1', status: 'active' }
    },
    { nowIso: () => new Date(nowMs).toISOString() }
  );

  const env = buildEnv();
  const intentService = createPaymentIntentService({
    db,
    env,
    now: () => nowMs,
    idGenerator: () => 'pi_sub_001'
  });
  const settlementService = createPaymentSettlementService({
    db,
    env,
    now: () => nowMs,
    fetchImpl: createTxGuardedRpcMock(db, {
      eth_chainId: '0x38',
      eth_getTransactionReceipt: () =>
        buildBscUsdtReceipt({ txHash: TX_HASH_1, blockHex: '0x64', amountAtomic: '29000000000000000000' }),
      eth_getTransactionByHash: () => ({ hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' }),
      eth_blockNumber: '0x80'
    })
  });

  await intentService.createPaymentIntent({
    buyerUid: 'sub_buyer',
    packageId: 'sub_pro',
    networkId: 'bsc',
    assetSymbol: 'USDT',
    senderWallet: SENDER_EVM
  });

  const res = await settlementService.processIntentVerificationAndSettlement({
    intentId: 'pi_sub_001',
    txHash: TX_HASH_1,
    requesterUid: 'sub_buyer'
  });
  assert.equal(res.outcome, 'SETTLED');
  assert.equal(res.activatedMinerId, null);
  assert.equal(res.contractId, null);
  assert.equal(db._store.has(`usedTxHashes/${buildUsedTxHashKey(56, TX_HASH_1)}`), true);
  assert.equal(db._store.has('miners/sub_buyer/miner/miner_pi_sub_001'), false);
  assert.equal(db._store.has('admin_contracts/contract_pi_sub_001'), false);

  const trans = db._orderTransitions[db._orderTransitions.length - 1];
  const hook = await handlePurchaseSettledEvent({
    beforeData: trans.beforeData,
    afterData: trans.afterData,
    orderId: trans.orderId,
    db,
    FieldValue
  });
  assert.equal(hook.status, 'rejected');
  assert.equal(hook.reason, 'NON_MINER_PRODUCT');
  assert.equal(db._store.has('userBalances/sponsor_1'), false);
});

// ============================================================================
// 4. ATOMIC ANTI-REPLAY IN TRANSACTION & CONCURRENT RACE PROTECTION
// ============================================================================

test('paymentSettlement [4]: atomic anti-replay inside db.runTransaction rejects concurrent second intent with 409 TX_HASH_ALREADY_USED', async () => {
  const nowMs = Date.parse('2026-11-22T03:00:00.000Z');
  const db = createStrictFirestoreDb(
    {
      'commercial_packages/pkg_1': { id: 'pkg_1', name: 'Miner 1', status: 'ACTIVE', isPublished: true, powerTh: 1, priceUsdt: 10 },
      'users/buyer_a': { uid: 'buyer_a', status: 'active' },
      'users/buyer_b': { uid: 'buyer_b', status: 'active' }
    },
    { nowIso: () => new Date(nowMs).toISOString() }
  );

  const env = buildEnv();
  let idIdx = 0;
  const ids = ['intent_A', 'intent_B'];
  const intentService = createPaymentIntentService({ db, env, now: () => nowMs, idGenerator: () => ids[idIdx++] });

  await intentService.createPaymentIntent({
    buyerUid: 'buyer_a',
    packageId: 'pkg_1',
    networkId: 'bsc',
    assetSymbol: 'USDT'
  });
  await intentService.createPaymentIntent({
    buyerUid: 'buyer_b',
    packageId: 'pkg_1',
    networkId: 'bsc',
    assetSymbol: 'USDT'
  });

  // Simulate TOCTOU race where BOTH intents passed pre-tx verification before either committed to usedTxHashes:
  // stub verifier always returns READY_TO_SETTLE without checking usedTxHashes (forcing the in-tx lock to arbitrate).
  const usedTxKey = buildUsedTxHashKey(56, TX_HASH_1);
  const raceVerifier = {
    async verifyIntentPayment({ intent, txHash }) {
      return {
        intentId: intent.intentId,
        paymentNetwork: intent.paymentNetwork,
        networkMode: intent.networkMode,
        chainId: intent.chainId,
        paymentAsset: intent.paymentAsset,
        txHash,
        usedTxKey,
        verificationStatus: 'READY_TO_SETTLE',
        confirmations: 20,
        requiredConfirmations: 15,
        receivedAmountAtomic: intent.expectedAmountAtomic,
        expectedAmountAtomic: intent.expectedAmountAtomic,
        fromAddress: SENDER_EVM,
        reason: null
      };
    },
    async discoverAndVerifyIncomingPayment() {
      throw new Error('should not be called');
    }
  };

  const settlementService = createPaymentSettlementService({
    db,
    env,
    now: () => nowMs,
    onChainVerifier: raceVerifier
  });

  const settleA = await settlementService.processIntentVerificationAndSettlement({
    intentId: 'intent_A',
    txHash: TX_HASH_1,
    requesterUid: 'buyer_a'
  });
  assert.equal(settleA.outcome, 'SETTLED');
  assert.equal(db._store.has('miners/buyer_a/miner/miner_intent_A'), true);

  await assert.rejects(
    () =>
      settlementService.processIntentVerificationAndSettlement({
        intentId: 'intent_B',
        txHash: TX_HASH_1,
        requesterUid: 'buyer_b'
      }),
    (err) => err instanceof PaymentSettlementError && err.code === 'TX_HASH_ALREADY_USED' && err.statusCode === 409
  );
  assert.equal(db._store.has('miners/buyer_b/miner/miner_intent_B'), false);
  assert.equal(db._store.get('payment_intents/intent_B').status, 'AWAITING');
});

// ============================================================================
// 5. INTERMEDIATE & FAILURE STATES (UNDERPAID, FAILED, EXPIRED, TERMINAL 409)
// ============================================================================

test('paymentSettlement [5]: persists UNDERPAID (with shortfallAtomic), FAILED (reverted), EXPIRED (OPEN & AWAITING), and rejects manual txHash on CANCELLED/FAILED with 409', async () => {
  let currentNowMs = Date.parse('2026-11-22T04:00:00.000Z');
  const db = createStrictFirestoreDb(
    {
      'commercial_packages/pkg_100': { id: 'pkg_100', name: 'Miner 100', status: 'ACTIVE', isPublished: true, powerTh: 8, priceUsdt: 100 },
      'users/u_state': { uid: 'u_state', status: 'active' }
    },
    { nowIso: () => new Date(currentNowMs).toISOString() }
  );

  const env = buildEnv();
  let seq = 0;
  const ids = ['pi_underpaid', 'pi_failed', 'pi_open_exp', 'pi_await_exp', 'pi_cancelled'];
  const intentService = createPaymentIntentService({ db, env, now: () => currentNowMs, idGenerator: () => ids[seq++] });

  await intentService.createPaymentIntent({ buyerUid: 'u_state', packageId: 'pkg_100', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM });
  await intentService.createPaymentIntent({ buyerUid: 'u_state', packageId: 'pkg_100', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM });
  await intentService.createPaymentIntent({ buyerUid: 'u_state', packageId: 'pkg_100' }); // OPEN
  await intentService.createPaymentIntent({ buyerUid: 'u_state', packageId: 'pkg_100', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM });
  await intentService.createPaymentIntent({ buyerUid: 'u_state', packageId: 'pkg_100', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM });
  await intentService.cancelPaymentIntent({ intentId: 'pi_cancelled', requesterUid: 'u_state', reason: 'changed mind' });

  const rpcMock = createTxGuardedRpcMock(db, {
    eth_chainId: '0x38',
    eth_blockNumber: '0x80',
    eth_getLogs: [],
    eth_getTransactionReceipt: (params) => {
      if (params[0] === TX_HASH_1) {
        return buildBscUsdtReceipt({ txHash: TX_HASH_1, amountAtomic: '80000000000000000000' }); // 80/100 USDT
      }
      if (params[0] === TX_HASH_2) {
        return buildBscUsdtReceipt({ txHash: TX_HASH_2, status: '0x0', amountAtomic: '100000000000000000000' }); // reverted
      }
      return null;
    },
    eth_getTransactionByHash: (params) => {
      if (params[0] === TX_HASH_1 || params[0] === TX_HASH_2) {
        return { hash: params[0], from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' };
      }
      return null;
    }
  });

  const settlementService = createPaymentSettlementService({ db, env, now: () => currentNowMs, fetchImpl: rpcMock });

  // UNDERPAID
  const underpaid = await settlementService.processIntentVerificationAndSettlement({
    intentId: 'pi_underpaid',
    txHash: TX_HASH_1,
    requesterUid: 'u_state'
  });
  assert.equal(underpaid.outcome, 'UNDERPAID');
  assert.equal(underpaid.shortfallAtomic, '20000000000000000000');
  assert.equal(db._store.get('payment_intents/pi_underpaid').shortfallAtomic, '20000000000000000000');
  assert.equal(db._store.get('admin_orders/pi_underpaid').status, 'UNDERPAID');
  assert.equal(db._store.has('miners/u_state/miner/miner_pi_underpaid'), false);

  // FAILED (reverted tx)
  const failed = await settlementService.processIntentVerificationAndSettlement({
    intentId: 'pi_failed',
    txHash: TX_HASH_2,
    requesterUid: 'u_state'
  });
  assert.equal(failed.outcome, 'FAILED');
  assert.equal(db._store.get('payment_intents/pi_failed').failureReason, 'TX_REVERTED');
  assert.equal(db._store.get('admin_orders/pi_failed').status, 'FAILED');
  assert.equal(db._store.has('miners/u_state/miner/miner_pi_failed'), false);

  // Manual new txHash on FAILED or CANCELLED -> 409 INTENT_TERMINAL_STATUS
  await assert.rejects(
    () =>
      settlementService.processIntentVerificationAndSettlement({
        intentId: 'pi_failed',
        txHash: TX_HASH_3,
        requesterUid: 'u_state'
      }),
    (err) => err instanceof PaymentSettlementError && err.code === 'INTENT_TERMINAL_STATUS' && err.statusCode === 409
  );
  await assert.rejects(
    () =>
      settlementService.processIntentVerificationAndSettlement({
        intentId: 'pi_cancelled',
        txHash: TX_HASH_3,
        requesterUid: 'u_state'
      }),
    (err) => err instanceof PaymentSettlementError && err.code === 'INTENT_TERMINAL_STATUS' && err.statusCode === 409
  );

  // Advance past 15 min TTL -> OPEN expires without RPC; AWAITING without on-chain deposit expires
  currentNowMs = Date.parse('2026-11-22T04:20:00.000Z');
  const callsBeforeOpenExp = rpcMock.calls.length;
  const openExp = await settlementService.processIntentVerificationAndSettlement({
    intentId: 'pi_open_exp',
    requesterUid: 'u_state'
  });
  assert.equal(openExp.outcome, 'EXPIRED');
  assert.equal(rpcMock.calls.length, callsBeforeOpenExp);
  assert.equal(db._store.get('admin_orders/pi_open_exp').status, 'EXPIRED');

  const awaitExp = await settlementService.processIntentVerificationAndSettlement({
    intentId: 'pi_await_exp',
    requesterUid: 'u_state'
  });
  assert.equal(awaitExp.outcome, 'EXPIRED');
  assert.equal(db._store.get('admin_orders/pi_await_exp').status, 'EXPIRED');
  assert.equal(db._store.has('miners/u_state/miner/miner_pi_await_exp'), false);
  assert.equal(
    db._recordedStatuses.some((entry) => String(entry.status).toUpperCase() === 'CONFIRMED'),
    false
  );
});

// ============================================================================
// 6. AUTOMATED RECONCILER (reconcilePendingPayments) — MIXED BATCH & ISOLATION
// ============================================================================

test('paymentReconciler [6]: mixed batch settles autonomous AWAITING deposit, updates PROCESSING blocks, expires OPEN, and isolates RPC timeout errors', async () => {
  let currentNowMs = Date.parse('2026-11-22T05:00:00.000Z');
  const db = createStrictFirestoreDb(
    {
      'commercial_packages/pkg_rec': { id: 'pkg_rec', name: 'Miner Rec', status: 'ACTIVE', isPublished: true, powerTh: 16, priceUsdt: 100 },
      'users/u_rec': { uid: 'u_rec', status: 'active' }
    },
    { nowIso: () => new Date(currentNowMs).toISOString() }
  );

  const env = buildEnv();
  let seq = 0;
  const ids = ['pi_rec_1_auto', 'pi_rec_2_proc', 'pi_rec_3_open_exp', 'pi_rec_4_rpc_err'];
  const intentService = createPaymentIntentService({ db, env, now: () => currentNowMs, idGenerator: () => ids[seq++] });

  // Intent 1: AWAITING without txHash (browser closed)
  await intentService.createPaymentIntent({ buyerUid: 'u_rec', packageId: 'pkg_rec', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM });
  // Intent 2: PROCESSING at 4/15 blocks -> will advance to 9/15
  await intentService.createPaymentIntent({ buyerUid: 'u_rec', packageId: 'pkg_rec', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM });
  await db.collection('payment_intents').doc('pi_rec_2_proc').update({ status: 'PROCESSING', txHash: TX_HASH_2, confirmations: 4 });
  await db.collection('admin_orders').doc('pi_rec_2_proc').update({ status: 'PROCESSING', txHash: TX_HASH_2, confirmations: 4 });
  // Intent 3: OPEN past TTL
  await intentService.createPaymentIntent({ buyerUid: 'u_rec', packageId: 'pkg_rec' });
  await db.collection('payment_intents').doc('pi_rec_3_open_exp').update({ expiresAt: '2026-11-22T04:50:00.000Z' });
  // Intent 4: Polygon AWAITING whose RPC times out
  await intentService.createPaymentIntent({ buyerUid: 'u_rec', packageId: 'pkg_rec', networkId: 'polygon', assetSymbol: 'USDT', senderWallet: SENDER_EVM });

  currentNowMs = Date.parse('2026-11-22T05:05:00.000Z');

  const rpcMock = createTxGuardedRpcMock(db, {
    eth_chainId: (_params, url) => {
      if (url.includes('polygon')) throw new Error('ETIMEDOUT polygon rpc');
      return '0x38';
    },
    eth_blockNumber: '0x72', // block 114
    eth_getLogs: () => [
      {
        address: BSC_USDT_MAINNET,
        transactionHash: TX_HASH_1,
        topics: [ERC20_TRANSFER_TOPIC, padTopicAddress(SENDER_EVM), padTopicAddress(TREASURY_EVM)],
        data: encodeUint256Hex(100000000000000000000n)
      }
    ],
    eth_getTransactionReceipt: (params) => {
      if (params[0] === TX_HASH_1) {
        // block 100 -> 114 - 100 + 1 = 15/15 -> READY_TO_SETTLE
        return buildBscUsdtReceipt({ txHash: TX_HASH_1, blockHex: '0x64', amountAtomic: '100000000000000000000' });
      }
      if (params[0] === TX_HASH_2) {
        // block 106 -> 114 - 106 + 1 = 9/15 -> PROCESSING
        return buildBscUsdtReceipt({ txHash: TX_HASH_2, blockHex: '0x6a', amountAtomic: '100000000000000000000' });
      }
      return null;
    },
    eth_getTransactionByHash: (params) => ({ hash: params[0], from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' })
  });

  const settlementService = createPaymentSettlementService({ db, env, now: () => currentNowMs, fetchImpl: rpcMock });
  const warnings = [];
  const reconciler = createPaymentReconciler({
    db,
    settlementService,
    now: () => currentNowMs,
    logger: { warn: (...args) => warnings.push(args) }
  });

  const summary = await reconciler.reconcilePendingPayments({ batchLimit: 50, maxConcurrency: 2 });
  assert.equal(summary.scanned, 4);
  assert.equal(summary.settled, 1);
  assert.equal(summary.processing, 1);
  assert.equal(summary.expired, 1);
  assert.equal(summary.errorsCount, 1);
  assert.equal(summary.errors.length, 1);
  assert.equal(summary.errors[0].intentId, 'pi_rec_4_rpc_err');
  assert.equal(warnings.length, 1);

  assert.equal(db._store.get('admin_orders/pi_rec_1_auto').status, 'SETTLED');
  assert.equal(db._store.has('miners/u_rec/miner/miner_pi_rec_1_auto'), true);
  assert.equal(db._store.get('admin_orders/pi_rec_2_proc').status, 'PROCESSING');
  assert.equal(db._store.get('admin_orders/pi_rec_2_proc').confirmations, 9);
  assert.equal(db._store.get('admin_orders/pi_rec_3_open_exp').status, 'EXPIRED');
  assert.equal(
    db._recordedStatuses.some((entry) => String(entry.status).toUpperCase() === 'CONFIRMED'),
    false
  );
});

// ============================================================================
// 7. GEN 2 HANDLERS SECURITY, FAIL-CLOSED RBAC & SAFE ERROR MAPPING
// ============================================================================

test('payments/index [7]: enforces Firebase auth, owner/admin fail-closed RBAC, explicit requesterUid for admins, error sanitization, and Gen 2 exports', async () => {
  const nowMs = Date.parse('2026-11-22T06:00:00.000Z');
  const db = createStrictFirestoreDb(
    {
      'commercial_packages/pkg_h': { id: 'pkg_h', name: 'Miner H', status: 'ACTIVE', isPublished: true, powerTh: 2, priceUsdt: 25 },
      'users/owner_1': { uid: 'owner_1', status: 'active' },
      'users/other_2': { uid: 'other_2', status: 'active' },
      'admin_users/admin_active': { uid: 'admin_active', status: 'ACTIVE', role: 'admin' },
      'admin_users/admin_inactive': { uid: 'admin_inactive', status: 'INACTIVE', role: 'admin' },
      'admin_users/admin_wrong_role': { uid: 'admin_wrong_role', status: 'ACTIVE', role: 'viewer' }
    },
    { nowIso: () => new Date(nowMs).toISOString() }
  );

  const env = buildEnv();
  const rpcMock = createTxGuardedRpcMock(db, {
    eth_chainId: '0x38',
    eth_blockNumber: '0x80',
    eth_getTransactionReceipt: (params) =>
      buildBscUsdtReceipt({ txHash: params[0], blockHex: '0x64', amountAtomic: '25000000000000000000' }),
    eth_getTransactionByHash: (params) => ({ hash: params[0], from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' })
  });

  const handlers = paymentsModule.createPaymentHandlers({
    db,
    env,
    now: () => nowMs,
    fetchImpl: rpcMock,
    idGenerator: () => 'pi_handler_001'
  });

  // 1) Unauthenticated calls rejected with 'unauthenticated'
  for (const fn of [
    handlers.handleCreatePaymentIntent,
    handlers.handleSelectPaymentMethod,
    handlers.handleGetPaymentIntent,
    handlers.handleCancelPaymentIntent,
    handlers.handleConfirmPaymentIntent
  ]) {
    await assert.rejects(() => fn({ auth: null, data: {} }), (err) => err.code === 'unauthenticated');
  }

  // 2) createPaymentIntent derives buyerUid exclusively from request.auth.uid (ignores spoofed data.buyerUid)
  const created = await handlers.handleCreatePaymentIntent({
    auth: { uid: 'owner_1', token: {} },
    data: { buyerUid: 'spoofed_victim', packageId: 'pkg_h', networkId: 'bsc', assetSymbol: 'USDT', senderWallet: SENDER_EVM }
  });
  assert.equal(created.buyerUid, 'owner_1');
  assert.equal(created.intentId, 'pi_handler_001');

  // 3) Cross-user & inactive/non-admin callers rejected with 'permission-denied'
  for (const uid of ['other_2', 'admin_inactive', 'admin_wrong_role']) {
    await assert.rejects(
      () => handlers.handleGetPaymentIntent({ auth: { uid, token: {} }, data: { intentId: 'pi_handler_001' } }),
      (err) => err.code === 'permission-denied'
    );
    await assert.rejects(
      () =>
        handlers.handleConfirmPaymentIntent({
          auth: { uid, token: {} },
          data: { intentId: 'pi_handler_001', txHash: TX_HASH_4 }
        }),
      (err) => err.code === 'permission-denied'
    );
    await assert.rejects(
      () => handlers.handleCancelPaymentIntent({ auth: { uid, token: {} }, data: { intentId: 'pi_handler_001' } }),
      (err) => err.code === 'permission-denied'
    );
  }

  // 4) Fail-closed resolveIsAdmin checks
  assert.equal(await paymentsModule.resolveIsAdmin(db, 'admin_active', {}), true);
  assert.equal(await paymentsModule.resolveIsAdmin(db, 'other_2', { admin: true }), true);
  assert.equal(await paymentsModule.resolveIsAdmin(db, 'admin_inactive', {}), false);
  assert.equal(await paymentsModule.resolveIsAdmin(db, 'admin_wrong_role', {}), false);
  assert.equal(await paymentsModule.resolveIsAdmin(db, 'other_2', {}), false);

  // 5) Active admin can execute confirmPaymentIntent ("Re-verificar On-Chain") with verified requesterUid
  const adminReverify = await handlers.handleConfirmPaymentIntent({
    auth: { uid: 'admin_active', token: {} },
    data: { intentId: 'pi_handler_001', txHash: TX_HASH_4 }
  });
  assert.equal(adminReverify.outcome, 'SETTLED');
  assert.equal(adminReverify.activatedMinerId, 'miner_pi_handler_001');

  // 6) Upstream RPC error sanitization (never leaks secret RPC URL or stack trace)
  const failingHandlers = paymentsModule.createPaymentHandlers({
    db,
    env: buildEnv({ PAYMENT_RPC_URL_BSC_MAINNET: 'https://secret-key-999.rpc.internal/v1' }),
    now: () => nowMs,
    fetchImpl: async () => {
      throw new Error('connect ECONNREFUSED https://secret-key-999.rpc.internal/v1');
    },
    idGenerator: () => 'pi_err_001'
  });
  await failingHandlers.handleCreatePaymentIntent({
    auth: { uid: 'owner_1', token: {} },
    data: { packageId: 'pkg_h', networkId: 'bsc', assetSymbol: 'USDT' }
  });
  await assert.rejects(
    () =>
      failingHandlers.handleConfirmPaymentIntent({
        auth: { uid: 'owner_1', token: {} },
        data: { intentId: 'pi_err_001', txHash: TX_HASH_3 }
      }),
    (err) => {
      assert.equal(err.code, 'unavailable');
      assert.equal(err.message.includes('secret-key-999'), false);
      return true;
    }
  );

  // 7) Verify all 6 Gen 2 functions are exported from src/payments/index.js
  for (const name of [
    'createPaymentIntent',
    'selectPaymentMethod',
    'getPaymentIntent',
    'cancelPaymentIntent',
    'confirmPaymentIntent',
    'reconcilePendingPayments'
  ]) {
    assert.ok(paymentsModule[name], `Missing export: ${name}`);
  }
});

// ============================================================================
// 8. DIFFERENTIAL REVIEW FIX PASS — TOCTOU HARDENING, SOLANA & EDGE CASES
// ============================================================================

test('paymentSettlement [8]: TOCTOU hardening (IMPORTANT-1/2/3), Solana SPL settlement, handler spoofing, error wrapping, and functions/index.js exports', async () => {
  const SOL_USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
  const SENDER_SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const SOL_SIG_CASE =
    '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d11111111111111111111111111111111111111111111';

  let currentNowMs = Date.parse('2026-11-22T07:00:00.000Z');
  const db = createStrictFirestoreDb(
    {
      'commercial_packages/pkg_edge': {
        id: 'pkg_edge',
        name: 'Edge Miner 4 TH',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 4,
        efficiencyWattsPerTh: 15,
        priceUsdt: 50
      },
      'users/u_edge': { uid: 'u_edge', status: 'active' },
      'users/u_other': { uid: 'u_other', status: 'active' },
      'admin_users/adm_ok': { uid: 'adm_ok', status: 'ACTIVE', role: 'admin' }
    },
    { nowIso: () => new Date(currentNowMs).toISOString() }
  );
  const env = buildEnv();
  let seq = 0;
  const ids = [
    'pi_imp1_expired',
    'pi_imp2_ttl_race',
    'pi_imp3_proc_replay',
    'pi_drift',
    'pi_open_no_method',
    'pi_not_found',
    'pi_sol_spl_001',
    'pi_sel_rbac'
  ];
  const intentService = createPaymentIntentService({ db, env, now: () => currentNowMs, idGenerator: () => ids[seq++] });

  // IMPORTANT-1: Stale UNDERPAID/FAILED verification must NOT overwrite EXPIRED inside db.runTransaction
  await intentService.createPaymentIntent({ buyerUid: 'u_edge', packageId: 'pkg_edge', networkId: 'bsc', assetSymbol: 'USDT' });
  const imp1Verifier = {
    async verifyIntentPayment({ intent, txHash }) {
      // Simulate concurrent expiration committing while RPC verification is in-flight
      await db.collection('payment_intents').doc(intent.intentId).update({
        status: 'EXPIRED',
        expiredAt: new Date(currentNowMs).toISOString()
      });
      return {
        intentId: intent.intentId,
        paymentNetwork: intent.paymentNetwork,
        networkMode: intent.networkMode,
        chainId: intent.chainId,
        paymentAsset: intent.paymentAsset,
        txHash,
        usedTxKey: buildUsedTxHashKey(56, txHash),
        verificationStatus: 'UNDERPAID',
        confirmations: 15,
        requiredConfirmations: 15,
        receivedAmountAtomic: '10000000000000000000',
        expectedAmountAtomic: intent.expectedAmountAtomic,
        shortfallAtomic: '40000000000000000000',
        fromAddress: SENDER_EVM,
        reason: 'INSUFFICIENT_AMOUNT'
      };
    },
    async discoverAndVerifyIncomingPayment() {
      throw new Error('unexpected');
    }
  };
  const imp1Service = createPaymentSettlementService({ db, env, now: () => currentNowMs, onChainVerifier: imp1Verifier });
  const imp1Res = await imp1Service.processIntentVerificationAndSettlement({
    intentId: 'pi_imp1_expired',
    txHash: TX_HASH_1,
    requesterUid: 'u_edge'
  });
  assert.equal(imp1Res.outcome, 'TERMINAL_UNCHANGED');
  assert.equal(imp1Res.status, 'EXPIRED');
  assert.equal(db._store.get('payment_intents/pi_imp1_expired').status, 'EXPIRED');

  // IMPORTANT-2: expireIntentAtomically must re-check expiresAt inside tx (protects concurrent selectPaymentMethod TTL extension)
  await intentService.createPaymentIntent({ buyerUid: 'u_edge', packageId: 'pkg_edge', networkId: 'bsc', assetSymbol: 'USDT' });
  const imp2Verifier = {
    async verifyIntentPayment() {
      throw new Error('unexpected');
    },
    async discoverAndVerifyIncomingPayment({ intent }) {
      // Simulate selectPaymentMethod extending expiresAt by +15m while scan was in-flight
      await db.collection('payment_intents').doc(intent.intentId).update({
        expiresAt: new Date(currentNowMs + 15 * 60 * 1000).toISOString()
      });
      return {
        intentId: intent.intentId,
        paymentNetwork: intent.paymentNetwork,
        networkMode: intent.networkMode,
        chainId: intent.chainId,
        paymentAsset: intent.paymentAsset,
        txHash: null,
        usedTxKey: null,
        verificationStatus: 'EXPIRED',
        confirmations: 0,
        requiredConfirmations: 15,
        receivedAmountAtomic: '0',
        expectedAmountAtomic: intent.expectedAmountAtomic,
        reason: 'INTENT_EXPIRED'
      };
    }
  };
  const imp2Service = createPaymentSettlementService({ db, env, now: () => currentNowMs, onChainVerifier: imp2Verifier });
  const imp2Res = await imp2Service.processIntentVerificationAndSettlement({
    intentId: 'pi_imp2_ttl_race',
    requesterUid: 'u_edge'
  });
  assert.equal(imp2Res.outcome, 'UNCHANGED');
  assert.equal(imp2Res.status, 'AWAITING');
  assert.equal(db._store.get('payment_intents/pi_imp2_ttl_race').status, 'AWAITING');

  // IMPORTANT-3: PROCESSING must check usedTxHashes inside tx and refuse to bind txHash consumed by another intent
  await intentService.createPaymentIntent({ buyerUid: 'u_edge', packageId: 'pkg_edge', networkId: 'bsc', assetSymbol: 'USDT' });
  const consumedKey = buildUsedTxHashKey(56, TX_HASH_2);
  await db.collection('usedTxHashes').doc(consumedKey).set({ intentId: 'pi_someone_else', txHash: TX_HASH_2 });
  const imp3Verifier = {
    async verifyIntentPayment({ intent, txHash }) {
      return {
        intentId: intent.intentId,
        paymentNetwork: intent.paymentNetwork,
        networkMode: intent.networkMode,
        chainId: intent.chainId,
        paymentAsset: intent.paymentAsset,
        txHash,
        usedTxKey: consumedKey,
        verificationStatus: 'PROCESSING',
        confirmations: 3,
        requiredConfirmations: 15,
        receivedAmountAtomic: intent.expectedAmountAtomic,
        expectedAmountAtomic: intent.expectedAmountAtomic,
        fromAddress: SENDER_EVM,
        reason: 'AWAITING_CONFIRMATIONS'
      };
    },
    async discoverAndVerifyIncomingPayment() {
      throw new Error('unexpected');
    }
  };
  const imp3Service = createPaymentSettlementService({ db, env, now: () => currentNowMs, onChainVerifier: imp3Verifier });
  await assert.rejects(
    () =>
      imp3Service.processIntentVerificationAndSettlement({
        intentId: 'pi_imp3_proc_replay',
        txHash: TX_HASH_2,
        requesterUid: 'u_edge'
      }),
    (err) => err instanceof PaymentSettlementError && err.code === 'TX_HASH_ALREADY_USED' && err.statusCode === 409
  );
  assert.equal(db._store.get('payment_intents/pi_imp3_proc_replay').status, 'AWAITING');
  assert.equal(db._store.get('payment_intents/pi_imp3_proc_replay').txHash, null);

  // IMPORTANT-4A: INTENT_CHANGED_DURING_VERIFICATION (409) when expectedAmountAtomic drifts mid-flight
  await intentService.createPaymentIntent({ buyerUid: 'u_edge', packageId: 'pkg_edge', networkId: 'bsc', assetSymbol: 'USDT' });
  const driftVerifier = {
    async verifyIntentPayment({ intent, txHash }) {
      await db.collection('payment_intents').doc(intent.intentId).update({ expectedAmountAtomic: '999999999999999999999' });
      return {
        intentId: intent.intentId,
        paymentNetwork: intent.paymentNetwork,
        networkMode: intent.networkMode,
        chainId: intent.chainId,
        paymentAsset: intent.paymentAsset,
        txHash,
        usedTxKey: buildUsedTxHashKey(56, txHash),
        verificationStatus: 'READY_TO_SETTLE',
        confirmations: 20,
        requiredConfirmations: 15,
        receivedAmountAtomic: intent.expectedAmountAtomic,
        expectedAmountAtomic: intent.expectedAmountAtomic,
        fromAddress: SENDER_EVM,
        reason: null
      };
    },
    async discoverAndVerifyIncomingPayment() {
      throw new Error('unexpected');
    }
  };
  const driftService = createPaymentSettlementService({ db, env, now: () => currentNowMs, onChainVerifier: driftVerifier });
  await assert.rejects(
    () =>
      driftService.processIntentVerificationAndSettlement({
        intentId: 'pi_drift',
        txHash: TX_HASH_3,
        requesterUid: 'u_edge'
      }),
    (err) => err instanceof PaymentSettlementError && err.code === 'INTENT_CHANGED_DURING_VERIFICATION' && err.statusCode === 409
  );

  // IMPORTANT-4B: PAYMENT_METHOD_NOT_SELECTED (409), isAdmin without requesterUid (401), NOT_FOUND updates lastCheckedAt
  await intentService.createPaymentIntent({ buyerUid: 'u_edge', packageId: 'pkg_edge' }); // OPEN
  await intentService.createPaymentIntent({ buyerUid: 'u_edge', packageId: 'pkg_edge', networkId: 'bsc', assetSymbol: 'USDT' });
  const basicRpc = createTxGuardedRpcMock(db, {
    eth_chainId: '0x38',
    eth_blockNumber: '0x80',
    eth_getTransactionReceipt: null,
    eth_getTransactionByHash: null
  });
  const basicService = createPaymentSettlementService({ db, env, now: () => currentNowMs, fetchImpl: basicRpc });
  await assert.rejects(
    () =>
      basicService.processIntentVerificationAndSettlement({
        intentId: 'pi_open_no_method',
        txHash: TX_HASH_1,
        requesterUid: 'u_edge'
      }),
    (err) => err instanceof PaymentSettlementError && err.code === 'PAYMENT_METHOD_NOT_SELECTED' && err.statusCode === 409
  );
  await assert.rejects(
    () =>
      basicService.processIntentVerificationAndSettlement({
        intentId: 'pi_not_found',
        txHash: TX_HASH_1,
        requesterUid: '',
        isAdmin: true
      }),
    (err) => err instanceof PaymentSettlementError && err.code === 'INVALID_REQUESTER_UID' && err.statusCode === 401
  );
  const notFoundRes = await basicService.processIntentVerificationAndSettlement({
    intentId: 'pi_not_found',
    txHash: TX_HASH_1,
    requesterUid: 'u_edge'
  });
  assert.equal(notFoundRes.outcome, 'UNCHANGED');
  assert.equal(notFoundRes.verificationStatus, 'NOT_FOUND');
  assert.equal(db._store.get('payment_intents/pi_not_found').lastCheckedAt, new Date(currentNowMs).toISOString());

  // IMPORTANT-4C: Solana SPL USDT atomic settlement preserving Base58 case-sensitivity in usedTxHashes
  await intentService.createPaymentIntent({
    buyerUid: 'u_edge',
    packageId: 'pkg_edge',
    networkId: 'solana',
    assetSymbol: 'USDT',
    senderWallet: SENDER_SOL
  });
  const solRpc = createTxGuardedRpcMock(db, {
    getTransaction: {
      slot: 990001,
      transaction: { message: { accountKeys: [{ pubkey: SENDER_SOL }, { pubkey: TREASURY_SOL }] } },
      meta: {
        err: null,
        preTokenBalances: [
          { accountIndex: 2, mint: SOL_USDT_MINT, owner: SENDER_SOL, uiTokenAmount: { amount: '100000000', decimals: 6 } },
          { accountIndex: 3, mint: SOL_USDT_MINT, owner: TREASURY_SOL, uiTokenAmount: { amount: '0', decimals: 6 } }
        ],
        postTokenBalances: [
          { accountIndex: 2, mint: SOL_USDT_MINT, owner: SENDER_SOL, uiTokenAmount: { amount: '50000000', decimals: 6 } },
          { accountIndex: 3, mint: SOL_USDT_MINT, owner: TREASURY_SOL, uiTokenAmount: { amount: '50000000', decimals: 6 } }
        ]
      }
    }
  });
  const solService = createPaymentSettlementService({ db, env, now: () => currentNowMs, fetchImpl: solRpc });
  const solRes = await solService.processIntentVerificationAndSettlement({
    intentId: 'pi_sol_spl_001',
    txHash: SOL_SIG_CASE,
    requesterUid: 'u_edge'
  });
  assert.equal(solRes.outcome, 'SETTLED');
  assert.equal(solRes.usedTxKey, `solana-mainnet_${SOL_SIG_CASE}`);
  assert.equal(db._store.has(`usedTxHashes/solana-mainnet_${SOL_SIG_CASE}`), true);
  assert.equal(db._store.has('miners/u_edge/miner/miner_pi_sol_spl_001'), true);

  // IMPORTANT-4D + MINOR-1/2: handleSelectPaymentMethod spoofing blocked, resolveIsAdmin empty uid fail-closed, non-domain error sanitization
  await intentService.createPaymentIntent({ buyerUid: 'u_edge', packageId: 'pkg_edge' }); // OPEN pi_sel_rbac
  const edgeHandlers = paymentsModule.createPaymentHandlers({ db, env, now: () => currentNowMs, fetchImpl: basicRpc });
  await assert.rejects(
    () =>
      edgeHandlers.handleSelectPaymentMethod({
        auth: { uid: 'u_other', token: {} },
        data: {
          intentId: 'pi_sel_rbac',
          networkId: 'bsc',
          assetSymbol: 'USDT',
          requesterUid: 'u_edge',
          isAdmin: true
        }
      }),
    (err) => err.code === 'permission-denied'
  );
  await assert.rejects(
    () =>
      edgeHandlers.handleConfirmPaymentIntent({
        auth: { uid: 'u_other', token: {} },
        data: { intentId: 'pi_not_found', txHash: TX_HASH_1, allowSystemActor: true, isAdmin: true }
      }),
    (err) => err.code === 'permission-denied'
  );
  const admSelected = await edgeHandlers.handleSelectPaymentMethod({
    auth: { uid: 'adm_ok', token: {} },
    data: { intentId: 'pi_sel_rbac', networkId: 'bsc', assetSymbol: 'USDT' }
  });
  assert.equal(admSelected.status, 'AWAITING');

  // Minor-1: resolveIsAdmin requires non-empty uid even when token.admin === true
  assert.equal(await paymentsModule.resolveIsAdmin(db, '', { admin: true }), false);

  // Minor-2: unexpected non-domain error carrying code: 'unavailable' must be sanitized (never leak raw message)
  const rawSdkErr = new Error('gRPC internal endpoint https://secret.internal failed');
  rawSdkErr.code = 'unavailable';
  const mapped = paymentsModule.mapToHttpsError(rawSdkErr);
  assert.equal(mapped.code, 'internal');
  assert.equal(mapped.message.includes('secret.internal'), false);
});

// ============================================================================
// 9. ITERATION 1 CORRECTIONS — DAILY PROFIT COMPATIBILITY & RPC URL REDACTION
// ============================================================================

test('paymentSettlement [9] [ITER-1]: settled miner matches dailyMiningProfitService status === active and paymentReconciler redacts RPC URLs in errors and logs', async () => {
  const nowMs = Date.parse('2026-11-22T08:00:00.000Z');
  const db = createStrictFirestoreDb(
    {
      'commercial_packages/pkg_daily': {
        id: 'pkg_daily',
        name: 'Daily Miner 120 TH',
        status: 'ACTIVE',
        isPublished: true,
        powerTh: 120,
        efficiencyWattsPerTh: 15,
        priceUsdt: 100
      },
      'users/u_daily': {
        uid: 'u_daily',
        email: 'daily@example.com',
        status: 'active',
        membershipTier: 'Explorer'
      }
    },
    { nowIso: () => new Date(nowMs).toISOString() }
  );

  const env = buildEnv();
  const intentService = createPaymentIntentService({
    db,
    env,
    now: () => nowMs,
    idGenerator: () => 'pi_daily_001'
  });

  await intentService.createPaymentIntent({
    buyerUid: 'u_daily',
    packageId: 'pkg_daily',
    networkId: 'bsc',
    assetSymbol: 'USDT',
    senderWallet: SENDER_EVM
  });

  const rpcMock = createTxGuardedRpcMock(db, {
    eth_chainId: '0x38',
    eth_blockNumber: '0x80',
    eth_getTransactionReceipt: () =>
      buildBscUsdtReceipt({ txHash: TX_HASH_1, blockHex: '0x64', amountAtomic: '100000000000000000000' }),
    eth_getTransactionByHash: () => ({ hash: TX_HASH_1, from: SENDER_EVM, to: BSC_USDT_MAINNET, value: '0x0' })
  });
  const settlementService = createPaymentSettlementService({ db, env, now: () => nowMs, fetchImpl: rpcMock });

  const settled = await settlementService.processIntentVerificationAndSettlement({
    intentId: 'pi_daily_001',
    txHash: TX_HASH_1,
    requesterUid: 'u_daily'
  });
  assert.equal(settled.outcome, 'SETTLED');

  const minerDoc = db._store.get('miners/u_daily/miner/miner_pi_daily_001');
  const contractDoc = db._store.get('admin_contracts/contract_pi_daily_001');
  assert.equal(minerDoc.status, 'active');
  assert.equal(contractDoc.status, 'ACTIVE');

  // Verify runFinalizeDailyMiningProfitBatch picks up the settled miner via collectionGroup('miner').where('status', '==', 'active')
  const dailyBatch = await runFinalizeDailyMiningProfitBatch({
    db,
    FieldValue,
    periodDate: '2026-11-21',
    operatorConfig: {
      baseElectricityUsdPerKwh: '0.01',
      grossRevenuePerThUsdt: '0.02375'
    },
    finalizedAt: new Date(nowMs).toISOString()
  });
  assert.equal(dailyBatch.totalScanned, 1);
  assert.equal(dailyBatch.finalizedCount, 1);
  assert.equal(dailyBatch.errorCount, 0);
  const dailyDoc = db._store.get('mining_daily_profit/miner_pi_daily_001_2026-11-21');
  assert.ok(dailyDoc);
  assert.equal(dailyDoc.status, 'finalized');
  assert.equal(dailyDoc.eligibleProfitUsdt6, '2.176200');

  // Verify paymentReconciler redacts http/https URLs (e.g. RPC API keys) in both metrics.errors and logger.warn
  const redactionDb = createStrictFirestoreDb({
    'payment_intents/pi_leak_001': {
      intentId: 'pi_leak_001',
      orderId: 'pi_leak_001',
      buyerUid: 'u_daily',
      status: 'AWAITING',
      paymentNetwork: 'bsc',
      networkMode: 'mainnet',
      chainId: 56,
      paymentAsset: 'USDT',
      tokenContractAddress: BSC_USDT_MAINNET,
      expectedAmountAtomic: '100000000000000000000',
      treasuryAddress: TREASURY_EVM,
      expiresAt: '2026-11-22T09:00:00.000Z'
    }
  });
  const warnLogs = [];
  const leakingReconciler = createPaymentReconciler({
    db: redactionDb,
    settlementService: {
      async processIntentVerificationAndSettlement() {
        const err = new Error(
          "RPC timeout calling https://bsc-mainnet.nodereal.io/v1/SECRET_KEY_12345?auth=tok and fallback 'http://10.0.0.9:8545/priv'"
        );
        err.code = 'RPC_REQUEST_FAILED';
        throw err;
      }
    },
    now: () => nowMs,
    logger: { warn: (msg, meta) => warnLogs.push({ msg, meta }) }
  });

  const recSummary = await leakingReconciler.reconcilePendingPayments();
  assert.equal(recSummary.errorsCount, 1);
  assert.equal(recSummary.errors[0].message.includes('[REDACTED_URL]'), true);
  assert.equal(recSummary.errors[0].message.includes('SECRET_KEY_12345'), false);
  assert.equal(recSummary.errors[0].message.includes('nodereal.io'), false);
  assert.equal(recSummary.errors[0].message.includes('10.0.0.9'), false);
  assert.equal(warnLogs.length, 1);
  assert.equal(warnLogs[0].meta.message.includes('[REDACTED_URL]'), true);
  assert.equal(warnLogs[0].meta.message.includes('SECRET_KEY_12345'), false);
  assert.equal(warnLogs[0].meta.message.includes('10.0.0.9'), false);
});
