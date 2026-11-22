'use strict';

const { NETWORK_CATALOG, isValidSolanaAddress } = require('./paymentConfig');

const SOLANA_SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const POSITIVE_INT_PATTERN = /^\d+$/;
const DEFAULT_RPC_TIMEOUT_MS = 8000;
const DEFAULT_SCAN_LIMIT = 25;
const MIN_SCAN_LIMIT = 1;
const MAX_SCAN_LIMIT = 50;
const SCAN_CLOCK_SKEW_MS = 60_000;

const RPC_ENV_BY_MODE = Object.freeze({
  testnet: 'PAYMENT_RPC_URL_SOLANA_TESTNET',
  mainnet: 'PAYMENT_RPC_URL_SOLANA_MAINNET'
});

class SolanaVerifierError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = 'SolanaVerifierError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function resolveSolanaRpcUrl(networkMode, env = process.env) {
  const cleanMode = typeof networkMode === 'string' ? networkMode.trim().toLowerCase() : '';
  const envKey = Object.hasOwn(RPC_ENV_BY_MODE, cleanMode) ? RPC_ENV_BY_MODE[cleanMode] : null;
  if (!envKey) {
    throw new SolanaVerifierError('UNSUPPORTED_NETWORK', `Unsupported Solana networkMode: ${networkMode}`, 400);
  }

  const raw = env && env[envKey];
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed || (!trimmed.startsWith('https://') && !trimmed.startsWith('http://'))) {
    throw new SolanaVerifierError(
      'RPC_URL_NOT_CONFIGURED',
      `Missing or invalid Solana RPC URL in ${envKey}`,
      500
    );
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SolanaVerifierError('RPC_URL_NOT_CONFIGURED', `Malformed Solana RPC URL in ${envKey}`, 500);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new SolanaVerifierError('RPC_URL_NOT_CONFIGURED', `Invalid Solana RPC URL protocol in ${envKey}`, 500);
  }
  return trimmed;
}

async function callSolanaRpc({
  rpcUrl,
  method,
  params = [],
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS
}) {
  if (typeof fetchImpl !== 'function') {
    throw new SolanaVerifierError('RPC_REQUEST_FAILED', 'No fetch implementation available for Solana RPC', 503);
  }

  const fetchOpts = {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    fetchOpts.signal = AbortSignal.timeout(timeoutMs);
  }

  let res;
  try {
    res = await fetchImpl(rpcUrl, fetchOpts);
  } catch (err) {
    throw new SolanaVerifierError(
      'RPC_REQUEST_FAILED',
      `Solana RPC ${method} network error: ${err && err.message ? err.message : String(err)}`,
      503
    );
  }

  if (!res || !res.ok) {
    throw new SolanaVerifierError(
      'RPC_REQUEST_FAILED',
      `Solana RPC ${method} returned HTTP ${res ? res.status : 'UNKNOWN'}`,
      503
    );
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new SolanaVerifierError(
      'RPC_REQUEST_FAILED',
      `Solana RPC ${method} returned invalid JSON: ${err && err.message ? err.message : String(err)}`,
      502
    );
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.error ||
    !Object.hasOwn(payload, 'result')
  ) {
    const detail = payload && payload.error ? payload.error.message || JSON.stringify(payload.error) : 'invalid JSON-RPC envelope';
    throw new SolanaVerifierError('RPC_REQUEST_FAILED', `Solana RPC ${method} error: ${detail}`, 502);
  }

  return payload.result;
}

function parseNonNegativeAtomic(raw, label) {
  if (typeof raw === 'bigint' && raw >= 0n) return raw;
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) return BigInt(raw);
  if (typeof raw === 'string' && POSITIVE_INT_PATTERN.test(raw)) return BigInt(raw);
  throw new SolanaVerifierError('RPC_REQUEST_FAILED', `Invalid atomic integer for ${label}: ${raw}`, 502);
}

function parseTimestampMs(raw) {
  if (raw === null || raw === undefined) return Number.NaN;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : Number.NaN;
  if (typeof raw === 'string' && raw.trim() !== '') return Date.parse(raw);
  if (typeof raw === 'object' && typeof raw.toDate === 'function') {
    const date = raw.toDate();
    return date instanceof Date ? date.getTime() : Number.NaN;
  }
  return Number.NaN;
}

function normalizeSolanaIntent(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    throw new SolanaVerifierError('INVALID_INTENT', 'intent must be a plain object', 400);
  }

  const networkId = typeof intent.paymentNetwork === 'string' ? intent.paymentNetwork.trim().toLowerCase() : '';
  if (networkId !== 'solana') {
    throw new SolanaVerifierError('UNSUPPORTED_NETWORK', `Unsupported Solana paymentNetwork: ${intent.paymentNetwork}`, 400);
  }

  const networkSpec = NETWORK_CATALOG.solana;
  const networkMode = typeof intent.networkMode === 'string' ? intent.networkMode.trim().toLowerCase() : '';
  const modeSpec = Object.hasOwn(networkSpec.modes, networkMode) ? networkSpec.modes[networkMode] : null;
  if (!modeSpec) {
    throw new SolanaVerifierError('INVALID_INTENT', `Invalid Solana networkMode: ${intent.networkMode}`, 400);
  }

  const expectedChainId = modeSpec.chainId;
  if (intent.chainId !== undefined && intent.chainId !== null) {
    if (String(intent.chainId).trim().toLowerCase() !== expectedChainId) {
      throw new SolanaVerifierError(
        'INVALID_INTENT',
        `Intent chainId (${intent.chainId}) does not match solana/${networkMode} (${expectedChainId})`,
        400
      );
    }
  }

  const paymentAsset = typeof intent.paymentAsset === 'string' ? intent.paymentAsset.trim().toUpperCase() : '';
  const assetSpec = Object.hasOwn(networkSpec.assets, paymentAsset) ? networkSpec.assets[paymentAsset] : null;
  if (!assetSpec) {
    throw new SolanaVerifierError('INVALID_INTENT', `Unsupported Solana paymentAsset '${intent.paymentAsset}'`, 400);
  }

  if (typeof intent.expectedAmountAtomic !== 'string' || !POSITIVE_INT_PATTERN.test(intent.expectedAmountAtomic)) {
    throw new SolanaVerifierError('INVALID_INTENT', 'intent.expectedAmountAtomic must be a positive integer string', 400);
  }
  const expectedAmountAtomic = BigInt(intent.expectedAmountAtomic);
  if (expectedAmountAtomic <= 0n) {
    throw new SolanaVerifierError('INVALID_INTENT', 'intent.expectedAmountAtomic must be greater than zero', 400);
  }

  if (!isValidSolanaAddress(intent.treasuryAddress)) {
    throw new SolanaVerifierError('INVALID_INTENT', 'intent.treasuryAddress must be a valid Solana address', 400);
  }
  const treasuryAddress = intent.treasuryAddress.trim();

  let tokenMint = null;
  if (!assetSpec.isNative) {
    if (!isValidSolanaAddress(intent.tokenContractAddress)) {
      throw new SolanaVerifierError('INVALID_INTENT', 'intent.tokenContractAddress must be a valid Solana SPL mint', 400);
    }
    tokenMint = intent.tokenContractAddress.trim();
  }

  let senderWallet = null;
  if (intent.senderWallet !== undefined && intent.senderWallet !== null && intent.senderWallet !== '') {
    if (!isValidSolanaAddress(intent.senderWallet)) {
      throw new SolanaVerifierError('INVALID_INTENT', 'intent.senderWallet must be a valid Solana address when present', 400);
    }
    senderWallet = intent.senderWallet.trim();
  }

  return {
    networkMode,
    expectedChainId,
    paymentAsset,
    isNative: assetSpec.isNative,
    expectedAmountAtomic,
    treasuryAddress,
    tokenMint,
    senderWallet,
    requiredConfirmations: networkSpec.requiredConfirmations
  };
}

function extractPubkey(keyEntry) {
  if (typeof keyEntry === 'string') return keyEntry;
  if (keyEntry && typeof keyEntry === 'object' && typeof keyEntry.pubkey === 'string') {
    return keyEntry.pubkey;
  }
  return null;
}

function extractAllAccountKeys(tx) {
  const messageKeys =
    tx && tx.transaction && tx.transaction.message && Array.isArray(tx.transaction.message.accountKeys)
      ? tx.transaction.message.accountKeys.map(extractPubkey)
      : [];
  const loaded = tx && tx.meta && tx.meta.loadedAddresses;
  if (loaded && typeof loaded === 'object') {
    if (Array.isArray(loaded.writable)) messageKeys.push(...loaded.writable.map(extractPubkey));
    if (Array.isArray(loaded.readonly)) messageKeys.push(...loaded.readonly.map(extractPubkey));
  }
  return messageKeys;
}

function computeSplReceivedAmount(meta, tokenMint, treasuryAddress) {
  const preList = Array.isArray(meta.preTokenBalances) ? meta.preTokenBalances : [];
  const postList = Array.isArray(meta.postTokenBalances) ? meta.postTokenBalances : [];

  const preByIndex = new Map();
  for (const entry of preList) {
    if (!entry || entry.mint !== tokenMint || entry.owner !== treasuryAddress) continue;
    if (!Number.isInteger(entry.accountIndex)) continue;
    const rawAmount = entry.uiTokenAmount && entry.uiTokenAmount.amount !== undefined
      ? entry.uiTokenAmount.amount
      : '0';
    preByIndex.set(entry.accountIndex, parseNonNegativeAtomic(rawAmount, 'preTokenBalances.amount'));
  }

  const postByIndex = new Map();
  for (const entry of postList) {
    if (!entry || entry.mint !== tokenMint || entry.owner !== treasuryAddress) continue;
    if (!Number.isInteger(entry.accountIndex)) continue;
    const rawAmount = entry.uiTokenAmount && entry.uiTokenAmount.amount !== undefined
      ? entry.uiTokenAmount.amount
      : '0';
    postByIndex.set(entry.accountIndex, parseNonNegativeAtomic(rawAmount, 'postTokenBalances.amount'));
  }

  // Net delta across all Treasury token accounts (pre ∪ post) prevents internal sweep / closed-ATA exploits.
  const allIndices = new Set([...preByIndex.keys(), ...postByIndex.keys()]);
  let netDelta = 0n;
  for (const idx of allIndices) {
    const pre = preByIndex.get(idx) ?? 0n;
    const post = postByIndex.get(idx) ?? 0n;
    netDelta += post - pre;
  }
  return netDelta > 0n ? netDelta : 0n;
}

function computeSplSenderNetDebits(meta, tokenMint, treasuryAddress) {
  const preList = Array.isArray(meta.preTokenBalances) ? meta.preTokenBalances : [];
  const postList = Array.isArray(meta.postTokenBalances) ? meta.postTokenBalances : [];

  const preByOwnerAndIndex = new Map();
  for (const entry of preList) {
    if (!entry || entry.mint !== tokenMint || !entry.owner || entry.owner === treasuryAddress) continue;
    if (!Number.isInteger(entry.accountIndex)) continue;
    const raw = entry.uiTokenAmount && entry.uiTokenAmount.amount !== undefined ? entry.uiTokenAmount.amount : '0';
    let ownerMap = preByOwnerAndIndex.get(entry.owner);
    if (!ownerMap) {
      ownerMap = new Map();
      preByOwnerAndIndex.set(entry.owner, ownerMap);
    }
    ownerMap.set(entry.accountIndex, parseNonNegativeAtomic(raw, 'preTokenBalances.amount'));
  }

  const postByOwnerAndIndex = new Map();
  for (const entry of postList) {
    if (!entry || entry.mint !== tokenMint || !entry.owner || entry.owner === treasuryAddress) continue;
    if (!Number.isInteger(entry.accountIndex)) continue;
    const raw = entry.uiTokenAmount && entry.uiTokenAmount.amount !== undefined ? entry.uiTokenAmount.amount : '0';
    let ownerMap = postByOwnerAndIndex.get(entry.owner);
    if (!ownerMap) {
      ownerMap = new Map();
      postByOwnerAndIndex.set(entry.owner, ownerMap);
    }
    ownerMap.set(entry.accountIndex, parseNonNegativeAtomic(raw, 'postTokenBalances.amount'));
  }

  const debitsByOwner = new Map();
  const owners = new Set([...preByOwnerAndIndex.keys(), ...postByOwnerAndIndex.keys()]);
  for (const owner of owners) {
    const preMap = preByOwnerAndIndex.get(owner) || new Map();
    const postMap = postByOwnerAndIndex.get(owner) || new Map();
    const indices = new Set([...preMap.keys(), ...postMap.keys()]);
    let netDebit = 0n;
    for (const idx of indices) {
      const pre = preMap.get(idx) ?? 0n;
      const post = postMap.get(idx) ?? 0n;
      netDebit += pre - post;
    }
    if (netDebit > 0n) {
      debitsByOwner.set(owner, netDebit);
    }
  }
  return debitsByOwner;
}

function resolveSenderAttributedAmount(tx, accountKeys, spec, treasuryReceivedAtomic) {
  if (!spec.senderWallet) return treasuryReceivedAtomic;

  if (spec.isNative) {
    const idx = accountKeys.indexOf(spec.senderWallet);
    if (idx < 0 || !tx.meta) return 0n;
    const preBalances = Array.isArray(tx.meta.preBalances) ? tx.meta.preBalances : [];
    const postBalances = Array.isArray(tx.meta.postBalances) ? tx.meta.postBalances : [];
    if (preBalances[idx] === undefined || postBalances[idx] === undefined) return 0n;
    const pre = parseNonNegativeAtomic(preBalances[idx], 'meta.preBalances');
    const post = parseNonNegativeAtomic(postBalances[idx], 'meta.postBalances');
    const rawDebit = pre > post ? pre - post : 0n;
    const fee =
      idx === 0 && tx.meta.fee !== undefined && tx.meta.fee !== null
        ? parseNonNegativeAtomic(tx.meta.fee, 'meta.fee')
        : 0n;
    const senderDebit = rawDebit > fee ? rawDebit - fee : 0n;
    if (senderDebit === 0n) return 0n;
    return treasuryReceivedAtomic < senderDebit ? treasuryReceivedAtomic : senderDebit;
  }

  if (!tx.meta) return 0n;
  const debitsByOwner = computeSplSenderNetDebits(tx.meta, spec.tokenMint, spec.treasuryAddress);
  if (debitsByOwner.size > 0) {
    const senderDebit = debitsByOwner.get(spec.senderWallet) ?? 0n;
    if (senderDebit === 0n) return 0n;
    return treasuryReceivedAtomic < senderDebit ? treasuryReceivedAtomic : senderDebit;
  }

  // Fallback only when token balances omit non-treasury source accounts (e.g. minimal fixtures or atomic swaps).
  return accountKeys[0] === spec.senderWallet ? treasuryReceivedAtomic : 0n;
}

function computeNativeSolReceivedAmount(tx, accountKeys, treasuryAddress) {
  const idx = accountKeys.indexOf(treasuryAddress);
  if (idx < 0) return 0n;
  const preBalances = Array.isArray(tx.meta.preBalances) ? tx.meta.preBalances : [];
  const postBalances = Array.isArray(tx.meta.postBalances) ? tx.meta.postBalances : [];
  if (preBalances[idx] === undefined || postBalances[idx] === undefined) return 0n;

  const pre = parseNonNegativeAtomic(preBalances[idx], 'meta.preBalances');
  const post = parseNonNegativeAtomic(postBalances[idx], 'meta.postBalances');
  return post > pre ? post - pre : 0n;
}

async function verifySolanaTransactionInternal({
  spec,
  signature,
  rpcUrl,
  fetchImpl,
  enforceSender = Boolean(spec.senderWallet)
}) {
  const fetchFinalizedTx = () =>
    callSolanaRpc({
      rpcUrl,
      method: 'getTransaction',
      params: [
        signature,
        {
          encoding: 'jsonParsed',
          commitment: 'finalized',
          maxSupportedTransactionVersion: 0
        }
      ],
      fetchImpl
    });

  let tx = await fetchFinalizedTx();

  if (tx === null || tx === undefined) {
    const statusRes = await callSolanaRpc({
      rpcUrl,
      method: 'getSignatureStatuses',
      params: [[signature], { searchTransactionHistory: true }],
      fetchImpl
    });
    const statusEntry = statusRes && Array.isArray(statusRes.value) ? statusRes.value[0] : null;
    if (statusEntry) {
      const slot = typeof statusEntry.slot === 'number' ? statusEntry.slot : null;
      if (statusEntry.err !== null && statusEntry.err !== undefined) {
        return {
          verificationStatus: 'FAILED',
          confirmations: 0,
          requiredConfirmations: spec.requiredConfirmations,
          txHash: signature,
          receivedAmountAtomic: '0',
          expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
          fromAddress: null,
          slot,
          reason: 'TX_FAILED_ONCHAIN'
        };
      }
      if (statusEntry.confirmationStatus === 'processed' || statusEntry.confirmationStatus === 'confirmed') {
        return {
          verificationStatus: 'PROCESSING',
          confirmations: 0,
          requiredConfirmations: spec.requiredConfirmations,
          txHash: signature,
          receivedAmountAtomic: '0',
          expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
          fromAddress: null,
          slot,
          reason: 'AWAITING_FINALIZATION'
        };
      }
      if (statusEntry.confirmationStatus === 'finalized') {
        // Resolve exact finalization-boundary race once before failing closed.
        tx = await fetchFinalizedTx();
        if (tx === null || tx === undefined) {
          throw new SolanaVerifierError(
            'RPC_REQUEST_FAILED',
            'Solana transaction is finalized on-chain but full transaction details are unavailable from RPC',
            502
          );
        }
      }
    }
    if (tx === null || tx === undefined) {
      return {
        verificationStatus: 'NOT_FOUND',
        confirmations: 0,
        requiredConfirmations: spec.requiredConfirmations,
        txHash: signature,
        receivedAmountAtomic: '0',
        expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
        fromAddress: null,
        slot: null,
        reason: 'TX_NOT_FOUND'
      };
    }
  }

  const slot = typeof tx.slot === 'number' ? tx.slot : null;
  const accountKeys = extractAllAccountKeys(tx);
  const fromAddress = accountKeys[0] && isValidSolanaAddress(accountKeys[0]) ? accountKeys[0] : null;

  if (!tx.meta || (tx.meta.err !== null && tx.meta.err !== undefined)) {
    return {
      verificationStatus: 'FAILED',
      confirmations: 1,
      requiredConfirmations: spec.requiredConfirmations,
      txHash: signature,
      receivedAmountAtomic: '0',
      expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
      fromAddress,
      slot,
      reason: 'TX_FAILED_ONCHAIN'
    };
  }

  const treasuryReceivedAtomic = spec.isNative
    ? computeNativeSolReceivedAmount(tx, accountKeys, spec.treasuryAddress)
    : computeSplReceivedAmount(tx.meta, spec.tokenMint, spec.treasuryAddress);

  if (treasuryReceivedAtomic === 0n) {
    return {
      verificationStatus: 'FAILED',
      confirmations: 1,
      requiredConfirmations: spec.requiredConfirmations,
      txHash: signature,
      receivedAmountAtomic: '0',
      expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
      fromAddress,
      slot,
      reason: 'WRONG_RECIPIENT_OR_TOKEN'
    };
  }

  const receivedAmountAtomic = enforceSender && spec.senderWallet
    ? resolveSenderAttributedAmount(tx, accountKeys, spec, treasuryReceivedAtomic)
    : treasuryReceivedAtomic;

  if (receivedAmountAtomic === 0n) {
    return {
      verificationStatus: 'FAILED',
      confirmations: 1,
      requiredConfirmations: spec.requiredConfirmations,
      txHash: signature,
      receivedAmountAtomic: '0',
      expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
      fromAddress,
      slot,
      reason: 'SENDER_MISMATCH'
    };
  }

  if (receivedAmountAtomic < spec.expectedAmountAtomic) {
    return {
      verificationStatus: 'UNDERPAID',
      confirmations: 1,
      requiredConfirmations: spec.requiredConfirmations,
      txHash: signature,
      receivedAmountAtomic: receivedAmountAtomic.toString(),
      expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
      shortfallAtomic: (spec.expectedAmountAtomic - receivedAmountAtomic).toString(),
      fromAddress,
      slot,
      reason: 'INSUFFICIENT_AMOUNT'
    };
  }

  return {
    verificationStatus: 'READY_TO_SETTLE',
    confirmations: 1,
    requiredConfirmations: spec.requiredConfirmations,
    txHash: signature,
    receivedAmountAtomic: receivedAmountAtomic.toString(),
    expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
    fromAddress,
    slot,
    reason: null
  };
}

async function verifySolanaTransaction({
  intent,
  txHash,
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  // Preserve Base58 case-sensitivity strictly; never lowercase Solana signatures.
  const signature = typeof txHash === 'string' ? txHash.trim() : '';
  if (!SOLANA_SIGNATURE_PATTERN.test(signature)) {
    throw new SolanaVerifierError('INVALID_TX_HASH', 'txHash must be a valid case-sensitive Base58 Solana signature', 400);
  }

  const spec = normalizeSolanaIntent(intent);
  const rpcUrl = resolveSolanaRpcUrl(spec.networkMode, env);

  return verifySolanaTransactionInternal({
    spec,
    signature,
    rpcUrl,
    fetchImpl,
    enforceSender: Boolean(spec.senderWallet)
  });
}

async function findIncomingSolanaTransfer({
  intent,
  limit = DEFAULT_SCAN_LIMIT,
  env = process.env,
  fetchImpl = globalThis.fetch,
  isTxHashUsed = async () => false
} = {}) {
  const spec = normalizeSolanaIntent(intent);
  const rpcUrl = resolveSolanaRpcUrl(spec.networkMode, env);
  const safeLimit = Number.isInteger(limit)
    ? Math.min(MAX_SCAN_LIMIT, Math.max(MIN_SCAN_LIMIT, limit))
    : DEFAULT_SCAN_LIMIT;

  const createdAtMs = parseTimestampMs(intent.createdAt);
  const seenSignatures = new Set();

  async function scanAddress(address) {
    const signatures = await callSolanaRpc({
      rpcUrl,
      method: 'getSignaturesForAddress',
      params: [address, { limit: safeLimit, commitment: 'finalized' }],
      fetchImpl
    });

    if (!Array.isArray(signatures) || signatures.length === 0) return null;

    for (const item of signatures) {
      if (!item || (item.err !== null && item.err !== undefined)) continue;
      const sig = typeof item.signature === 'string' ? item.signature.trim() : '';
      if (!SOLANA_SIGNATURE_PATTERN.test(sig) || seenSignatures.has(sig)) continue;
      seenSignatures.add(sig);

      if (Number.isFinite(createdAtMs) && typeof item.blockTime === 'number' && Number.isFinite(item.blockTime)) {
        if (item.blockTime * 1000 < createdAtMs - SCAN_CLOCK_SKEW_MS) continue;
      }

      if (await isTxHashUsed(sig)) continue;

      const verified = await verifySolanaTransactionInternal({
        spec,
        signature: sig,
        rpcUrl,
        fetchImpl,
        enforceSender: Boolean(spec.senderWallet)
      });
      if (verified && (verified.verificationStatus === 'READY_TO_SETTLE' || verified.verificationStatus === 'PROCESSING')) {
        return verified;
      }
    }
    return null;
  }

  const directMatch = await scanAddress(spec.treasuryAddress);
  if (directMatch) return directMatch;

  // For SPL tokens, transfers to an existing ATA do not list the owner pubkey in accountKeys; scan Treasury ATAs too.
  if (!spec.isNative) {
    const tokenAccountsRes = await callSolanaRpc({
      rpcUrl,
      method: 'getTokenAccountsByOwner',
      params: [spec.treasuryAddress, { mint: spec.tokenMint }, { encoding: 'jsonParsed', commitment: 'finalized' }],
      fetchImpl
    });
    const accounts = tokenAccountsRes && Array.isArray(tokenAccountsRes.value) ? tokenAccountsRes.value : [];
    for (const entry of accounts) {
      const ataPubkey = entry && typeof entry.pubkey === 'string' ? entry.pubkey.trim() : '';
      if (!ataPubkey || ataPubkey === spec.treasuryAddress || !isValidSolanaAddress(ataPubkey)) continue;
      const ataMatch = await scanAddress(ataPubkey);
      if (ataMatch) return ataMatch;
    }
  }

  return null;
}

module.exports = Object.freeze({
  SolanaVerifierError,
  SOLANA_SIGNATURE_PATTERN,
  DEFAULT_RPC_TIMEOUT_MS,
  DEFAULT_SCAN_LIMIT,
  resolveSolanaRpcUrl,
  verifySolanaTransaction,
  findIncomingSolanaTransfer
});
