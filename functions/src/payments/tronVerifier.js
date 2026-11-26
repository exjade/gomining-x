'use strict';

const {
  NETWORK_CATALOG,
  isValidTronAddress,
  tronBase58ToHex41,
  hex41ToTronBase58
} = require('./paymentConfig');

const TRC20_TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TRON_TX_HASH_PATTERN = /^[a-fA-F0-9]{64}$/;
const POSITIVE_INT_PATTERN = /^\d+$/;
const HEX20_PATTERN = /^(?:0x)?([0-9a-fA-F]{40})$/;
const HEX41_PATTERN = /^(?:0x)?41([0-9a-fA-F]{40})$/;
const PADDED_TOPIC_HEX20_PATTERN = /^(?:0x)?0{24}([0-9a-fA-F]{40})$/;
const HEX_UINT256_PATTERN = /^(?:0x)?([0-9a-fA-F]{1,64})$/;
const URL_PATTERN = /https?:\/\/[^\s'"]+/gi;
const DEFAULT_RPC_TIMEOUT_MS = 8000;
const DEFAULT_SCAN_LIMIT = 25;
const MIN_SCAN_LIMIT = 1;
const MAX_SCAN_LIMIT = 50;
const SCAN_CLOCK_SKEW_MS = 60_000;

const RPC_ENV_BY_MODE = Object.freeze({
  testnet: 'PAYMENT_RPC_URL_TRON_TESTNET',
  mainnet: 'PAYMENT_RPC_URL_TRON_MAINNET'
});

class TronVerifierError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = 'TronVerifierError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function resolveTronRpcUrl(networkMode, env = process.env) {
  const cleanMode = typeof networkMode === 'string' ? networkMode.trim().toLowerCase() : '';
  const envKey = Object.hasOwn(RPC_ENV_BY_MODE, cleanMode) ? RPC_ENV_BY_MODE[cleanMode] : null;
  if (!envKey) {
    throw new TronVerifierError('UNSUPPORTED_NETWORK', `Unsupported TRON networkMode: ${networkMode}`, 400);
  }

  const raw = env && env[envKey];
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed || (!trimmed.startsWith('https://') && !trimmed.startsWith('http://'))) {
    throw new TronVerifierError('RPC_URL_NOT_CONFIGURED', `Missing or invalid TRON RPC URL in ${envKey}`, 500);
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new TronVerifierError('RPC_URL_NOT_CONFIGURED', `Malformed TRON RPC URL in ${envKey}`, 500);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TronVerifierError('RPC_URL_NOT_CONFIGURED', `Invalid TRON RPC URL protocol in ${envKey}`, 500);
  }
  return trimmed.replace(/\/+$/, '');
}

function sanitizeTronMessage(raw, env) {
  let msg = String(raw || '').replace(URL_PATTERN, '[REDACTED_URL]');
  const apiKey = env && typeof env.PAYMENT_TRONGRID_API_KEY === 'string' ? env.PAYMENT_TRONGRID_API_KEY.trim() : '';
  if (apiKey) {
    msg = msg.split(apiKey).join('[REDACTED_KEY]');
  }
  return msg;
}

function buildTronHeaders(env, withJsonContentType) {
  const headers = { accept: 'application/json' };
  if (withJsonContentType) {
    headers['content-type'] = 'application/json';
  }
  const apiKey = env && typeof env.PAYMENT_TRONGRID_API_KEY === 'string' ? env.PAYMENT_TRONGRID_API_KEY.trim() : '';
  if (apiKey) {
    headers['TRON-PRO-API-KEY'] = apiKey;
  }
  return headers;
}

async function callTronApi({
  rpcUrl,
  endpointPath,
  method = 'POST',
  body,
  env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS
}) {
  if (typeof fetchImpl !== 'function') {
    throw new TronVerifierError('RPC_REQUEST_FAILED', 'No fetch implementation available for TRON RPC', 503);
  }

  const fetchOpts = {
    method,
    headers: buildTronHeaders(env, method !== 'GET')
  };
  if (body !== undefined && method !== 'GET') {
    fetchOpts.body = JSON.stringify(body);
  }
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    fetchOpts.signal = AbortSignal.timeout(timeoutMs);
  }

  const url = `${rpcUrl}${endpointPath}`;
  const safePath = endpointPath.split('?')[0];

  let res;
  try {
    res = await fetchImpl(url, fetchOpts);
  } catch (err) {
    const safeErr = sanitizeTronMessage(err && err.message ? err.message : String(err), env);
    throw new TronVerifierError('RPC_REQUEST_FAILED', `TRON API ${safePath} network error: ${safeErr}`, 503);
  }

  if (!res || !res.ok) {
    throw new TronVerifierError(
      'RPC_REQUEST_FAILED',
      `TRON API ${safePath} returned HTTP ${res ? res.status : 'UNKNOWN'}`,
      503
    );
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    const safeErr = sanitizeTronMessage(err && err.message ? err.message : String(err), env);
    throw new TronVerifierError('RPC_REQUEST_FAILED', `TRON API ${safePath} returned invalid JSON: ${safeErr}`, 502);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TronVerifierError('RPC_REQUEST_FAILED', `TRON API ${safePath} returned invalid JSON envelope`, 502);
  }

  return payload;
}

function parseNonNegativeAtomic(raw, label) {
  if (typeof raw === 'bigint' && raw >= 0n) return raw;
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) return BigInt(raw);
  if (typeof raw === 'string' && POSITIVE_INT_PATTERN.test(raw.trim())) return BigInt(raw.trim());
  throw new TronVerifierError('RPC_REQUEST_FAILED', `Invalid atomic integer for ${label}`, 502);
}

function parseTimestampMs(raw) {
  if (raw === null || raw === undefined) return Number.NaN;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : Number.NaN;
  if (typeof raw === 'string' && raw.trim() !== '') return Date.parse(raw);
  if (typeof raw === 'object' && typeof raw.toDate === 'function') {
    const d = raw.toDate();
    return d instanceof Date ? d.getTime() : Number.NaN;
  }
  return Number.NaN;
}

function normalizeLogContractHex20(rawAddress) {
  if (typeof rawAddress !== 'string') return null;
  const trimmed = rawAddress.trim();
  const hex20Match = HEX20_PATTERN.exec(trimmed);
  if (hex20Match) return hex20Match[1].toLowerCase();
  const hex41Match = HEX41_PATTERN.exec(trimmed);
  if (hex41Match) return hex41Match[1].toLowerCase();
  if (isValidTronAddress(trimmed)) return tronBase58ToHex41(trimmed).slice(2);
  return null;
}

function normalizeHex41Address(rawAddress) {
  if (typeof rawAddress !== 'string') return null;
  const trimmed = rawAddress.trim();
  const hex41Match = HEX41_PATTERN.exec(trimmed);
  if (hex41Match) return `41${hex41Match[1].toLowerCase()}`;
  if (isValidTronAddress(trimmed)) return tronBase58ToHex41(trimmed);
  return null;
}

function decodeTopicHex20(topic) {
  if (typeof topic !== 'string') return null;
  const match = PADDED_TOPIC_HEX20_PATTERN.exec(topic.trim());
  return match ? match[1].toLowerCase() : null;
}

function parseLogUint256(data) {
  if (data === '' || data === '0x') return 0n;
  if (typeof data !== 'string') return null;
  const match = HEX_UINT256_PATTERN.exec(data.trim());
  return match ? BigInt(`0x${match[1]}`) : null;
}

function normalizeTronIntent(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    throw new TronVerifierError('INVALID_INTENT', 'intent must be a plain object', 400);
  }

  const networkId = typeof intent.paymentNetwork === 'string' ? intent.paymentNetwork.trim().toLowerCase() : '';
  if (networkId !== 'tron') {
    throw new TronVerifierError('UNSUPPORTED_NETWORK', `Unsupported TRON paymentNetwork: ${intent.paymentNetwork}`, 400);
  }

  const networkSpec = NETWORK_CATALOG.tron;
  const networkMode = typeof intent.networkMode === 'string' ? intent.networkMode.trim().toLowerCase() : '';
  const modeSpec = Object.hasOwn(networkSpec.modes, networkMode) ? networkSpec.modes[networkMode] : null;
  if (!modeSpec) {
    throw new TronVerifierError('INVALID_INTENT', `Invalid TRON networkMode: ${intent.networkMode}`, 400);
  }

  const expectedChainId = modeSpec.chainId;
  if (intent.chainId !== undefined && intent.chainId !== null) {
    if (String(intent.chainId).trim().toLowerCase() !== expectedChainId) {
      throw new TronVerifierError(
        'INVALID_INTENT',
        `Intent chainId (${intent.chainId}) does not match tron/${networkMode} (${expectedChainId})`,
        400
      );
    }
  }

  const paymentAsset = typeof intent.paymentAsset === 'string' ? intent.paymentAsset.trim().toUpperCase() : '';
  const assetSpec = Object.hasOwn(networkSpec.assets, paymentAsset) ? networkSpec.assets[paymentAsset] : null;
  if (!assetSpec) {
    throw new TronVerifierError('INVALID_INTENT', `Unsupported TRON paymentAsset '${intent.paymentAsset}'`, 400);
  }

  if (typeof intent.expectedAmountAtomic !== 'string' || !POSITIVE_INT_PATTERN.test(intent.expectedAmountAtomic)) {
    throw new TronVerifierError('INVALID_INTENT', 'intent.expectedAmountAtomic must be a positive integer string', 400);
  }
  const expectedAmountAtomic = BigInt(intent.expectedAmountAtomic);
  if (expectedAmountAtomic <= 0n) {
    throw new TronVerifierError('INVALID_INTENT', 'intent.expectedAmountAtomic must be greater than zero', 400);
  }

  if (!isValidTronAddress(intent.treasuryAddress)) {
    throw new TronVerifierError('INVALID_INTENT', 'intent.treasuryAddress must be a valid TRON address', 400);
  }
  const treasuryAddress = intent.treasuryAddress.trim();
  const treasuryHex41 = tronBase58ToHex41(treasuryAddress);
  const treasuryHex20 = treasuryHex41.slice(2);

  let tokenContractAddress = null;
  let tokenHex20 = null;
  if (!assetSpec.isNative) {
    if (!isValidTronAddress(intent.tokenContractAddress)) {
      throw new TronVerifierError('INVALID_INTENT', 'intent.tokenContractAddress must be a valid TRON TRC-20 address', 400);
    }
    tokenContractAddress = intent.tokenContractAddress.trim();
    tokenHex20 = tronBase58ToHex41(tokenContractAddress).slice(2);
  }

  let senderWallet = null;
  let senderHex41 = null;
  let senderHex20 = null;
  if (intent.senderWallet !== undefined && intent.senderWallet !== null && intent.senderWallet !== '') {
    if (!isValidTronAddress(intent.senderWallet)) {
      throw new TronVerifierError('INVALID_INTENT', 'intent.senderWallet must be a valid TRON address when present', 400);
    }
    senderWallet = intent.senderWallet.trim();
    senderHex41 = tronBase58ToHex41(senderWallet);
    senderHex20 = senderHex41.slice(2);
  }

  const requiredConfirmations =
    Number.isInteger(intent.requiredConfirmations) && intent.requiredConfirmations > networkSpec.requiredConfirmations
      ? intent.requiredConfirmations
      : networkSpec.requiredConfirmations;

  return {
    networkMode,
    expectedChainId,
    paymentAsset,
    isNative: assetSpec.isNative,
    expectedAmountAtomic,
    treasuryAddress,
    treasuryHex41,
    treasuryHex20,
    tokenContractAddress,
    tokenHex20,
    senderWallet,
    senderHex41,
    senderHex20,
    requiredConfirmations
  };
}

function extractTxOwnerBase58(tx) {
  const owner = tx && tx.raw_data && Array.isArray(tx.raw_data.contract) && tx.raw_data.contract[0]
    && tx.raw_data.contract[0].parameter && tx.raw_data.contract[0].parameter.value
    ? tx.raw_data.contract[0].parameter.value.owner_address
    : null;
  const hex41 = normalizeHex41Address(owner);
  return hex41 ? hex41ToTronBase58(hex41) : null;
}

async function verifyTronTransactionInternal({ spec, normalizedTxHash, rpcUrl, env, fetchImpl }) {
  const [tx, txInfo, nowBlock] = await Promise.all([
    callTronApi({ rpcUrl, endpointPath: '/wallet/gettransactionbyid', body: { value: normalizedTxHash }, env, fetchImpl }),
    callTronApi({ rpcUrl, endpointPath: '/wallet/gettransactioninfobyid', body: { value: normalizedTxHash }, env, fetchImpl }),
    callTronApi({ rpcUrl, endpointPath: '/wallet/getnowblock', body: {}, env, fetchImpl })
  ]);

  const hasTx = Boolean(tx && typeof tx.txID === 'string' && tx.txID.trim() !== '');
  const hasInfo = Boolean(txInfo && typeof txInfo.id === 'string' && txInfo.id.trim() !== '');

  if (!hasTx && !hasInfo) {
    return {
      verificationStatus: 'NOT_FOUND',
      confirmations: 0,
      requiredConfirmations: spec.requiredConfirmations,
      txHash: normalizedTxHash,
      receivedAmountAtomic: '0',
      expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
      fromAddress: null,
      blockNumber: null,
      reason: 'TX_NOT_FOUND'
    };
  }

  if (hasTx && tx.txID.trim().toLowerCase() !== normalizedTxHash) {
    throw new TronVerifierError('RPC_REQUEST_FAILED', 'TRON gettransactionbyid txID mismatch', 502);
  }
  if (hasInfo && txInfo.id.trim().toLowerCase() !== normalizedTxHash) {
    throw new TronVerifierError('RPC_REQUEST_FAILED', 'TRON gettransactioninfobyid id mismatch', 502);
  }

  if (!hasInfo || !Number.isSafeInteger(txInfo.blockNumber) || txInfo.blockNumber < 0) {
    return {
      verificationStatus: 'PROCESSING',
      confirmations: 0,
      requiredConfirmations: spec.requiredConfirmations,
      txHash: normalizedTxHash,
      receivedAmountAtomic: '0',
      expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
      fromAddress: extractTxOwnerBase58(tx),
      blockNumber: null,
      reason: 'TX_PENDING_IN_MEMPOOL'
    };
  }

  if (!hasTx) {
    throw new TronVerifierError('RPC_REQUEST_FAILED', 'TRON txInfo exists but gettransactionbyid returned empty', 502);
  }

  const latestRaw = nowBlock && nowBlock.block_header && nowBlock.block_header.raw_data
    ? nowBlock.block_header.raw_data.number
    : undefined;
  const txBlock = parseNonNegativeAtomic(txInfo.blockNumber, 'txInfo.blockNumber');
  const latestBlock = parseNonNegativeAtomic(latestRaw, 'nowBlock.block_header.raw_data.number');
  const confirmations = latestBlock >= txBlock ? Number(latestBlock - txBlock + 1n) : 0;
  const blockNumber = txInfo.blockNumber;
  const fallbackFrom = extractTxOwnerBase58(tx);

  const contractRet = Array.isArray(tx.ret) && tx.ret[0] ? tx.ret[0].contractRet : null;
  const receiptResult = txInfo.receipt && typeof txInfo.receipt.result === 'string'
    ? txInfo.receipt.result.trim().toUpperCase()
    : null;
  const infoResult = typeof txInfo.result === 'string' ? txInfo.result.trim().toUpperCase() : null;

  const executionFailed =
    contractRet !== 'SUCCESS' ||
    infoResult === 'FAILED' ||
    (!spec.isNative && receiptResult !== 'SUCCESS') ||
    (spec.isNative && receiptResult !== null && receiptResult !== '' && receiptResult !== 'SUCCESS');

  if (executionFailed) {
    return {
      verificationStatus: 'FAILED',
      confirmations,
      requiredConfirmations: spec.requiredConfirmations,
      txHash: normalizedTxHash,
      receivedAmountAtomic: '0',
      expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
      fromAddress: fallbackFrom,
      blockNumber,
      reason: receiptResult && receiptResult !== 'SUCCESS' ? receiptResult : (contractRet || 'TX_REVERTED')
    };
  }

  let receivedAmountAtomic = 0n;
  let fromAddress = fallbackFrom;
  let hasOtherSenderTransfer = false;

  if (!spec.isNative) {
    const logs = Array.isArray(txInfo.log) ? txInfo.log : [];
    let matchedFrom = null;
    let otherSenderFrom = null;
    for (const log of logs) {
      if (!log || typeof log !== 'object') continue;
      if (normalizeLogContractHex20(log.address) !== spec.tokenHex20) continue;
      if (!Array.isArray(log.topics) || log.topics.length < 3) continue;
      const topic0 = typeof log.topics[0] === 'string' ? log.topics[0].trim().toLowerCase().replace(/^0x/, '') : '';
      if (topic0 !== TRC20_TRANSFER_TOPIC) continue;

      const decodedFromHex20 = decodeTopicHex20(log.topics[1]);
      const decodedToHex20 = decodeTopicHex20(log.topics[2]);
      if (!decodedFromHex20 || !decodedToHex20 || decodedToHex20 !== spec.treasuryHex20) continue;

      const amount = parseLogUint256(log.data);
      if (amount === null || amount <= 0n) continue;

      const decodedFromBase58 = hex41ToTronBase58(`41${decodedFromHex20}`);
      if (spec.senderHex20 && decodedFromHex20 !== spec.senderHex20) {
        hasOtherSenderTransfer = true;
        if (!otherSenderFrom) otherSenderFrom = decodedFromBase58;
        continue;
      }

      receivedAmountAtomic += amount;
      if (!matchedFrom) matchedFrom = decodedFromBase58;
    }
    if (matchedFrom) fromAddress = matchedFrom;
    else if (otherSenderFrom) fromAddress = otherSenderFrom;
  } else {
    if (!hasTx) {
      throw new TronVerifierError('RPC_REQUEST_FAILED', 'TRON txInfo exists for TRX transfer but gettransactionbyid returned empty', 502);
    }
    const contract = tx.raw_data && Array.isArray(tx.raw_data.contract) ? tx.raw_data.contract[0] : null;
    if (contract && contract.type === 'TransferContract' && contract.parameter && contract.parameter.value) {
      const value = contract.parameter.value;
      const toHex41 = normalizeHex41Address(value.to_address);
      const ownerHex41 = normalizeHex41Address(value.owner_address);
      if (ownerHex41) fromAddress = hex41ToTronBase58(ownerHex41);
      if (toHex41 === spec.treasuryHex41) {
        const amountAtomic = parseNonNegativeAtomic(value.amount ?? 0, 'TransferContract.amount');
        if (amountAtomic > 0n) {
          if (spec.senderHex41 && ownerHex41 !== spec.senderHex41) {
            hasOtherSenderTransfer = true;
          } else {
            receivedAmountAtomic = amountAtomic;
          }
        }
      }
    }
  }

  if (receivedAmountAtomic === 0n) {
    return {
      verificationStatus: 'FAILED',
      confirmations,
      requiredConfirmations: spec.requiredConfirmations,
      txHash: normalizedTxHash,
      receivedAmountAtomic: '0',
      expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
      fromAddress,
      blockNumber,
      reason: hasOtherSenderTransfer ? 'SENDER_MISMATCH' : 'WRONG_RECIPIENT_OR_TOKEN'
    };
  }

  if (receivedAmountAtomic < spec.expectedAmountAtomic) {
    return {
      verificationStatus: 'UNDERPAID',
      confirmations,
      requiredConfirmations: spec.requiredConfirmations,
      txHash: normalizedTxHash,
      receivedAmountAtomic: receivedAmountAtomic.toString(),
      expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
      shortfallAtomic: (spec.expectedAmountAtomic - receivedAmountAtomic).toString(),
      fromAddress,
      blockNumber,
      reason: 'INSUFFICIENT_AMOUNT'
    };
  }

  const isReady = confirmations >= spec.requiredConfirmations;
  return {
    verificationStatus: isReady ? 'READY_TO_SETTLE' : 'PROCESSING',
    confirmations,
    requiredConfirmations: spec.requiredConfirmations,
    txHash: normalizedTxHash,
    receivedAmountAtomic: receivedAmountAtomic.toString(),
    expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
    fromAddress,
    blockNumber,
    reason: isReady ? null : 'AWAITING_CONFIRMATIONS'
  };
}

async function verifyTronTransaction({
  intent,
  txHash,
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const trimmed = typeof txHash === 'string' ? txHash.trim() : '';
  if (!TRON_TX_HASH_PATTERN.test(trimmed)) {
    throw new TronVerifierError('INVALID_TX_HASH', 'txHash must be a valid 64-character hex TRON transaction ID', 400);
  }
  const normalizedTxHash = trimmed.toLowerCase();
  const spec = normalizeTronIntent(intent);
  const rpcUrl = resolveTronRpcUrl(spec.networkMode, env);
  return verifyTronTransactionInternal({ spec, normalizedTxHash, rpcUrl, env, fetchImpl });
}

async function findIncomingTronTransfer({
  intent,
  limit = DEFAULT_SCAN_LIMIT,
  env = process.env,
  fetchImpl = globalThis.fetch,
  isTxHashUsed = async () => false
} = {}) {
  const spec = normalizeTronIntent(intent);
  const rpcUrl = resolveTronRpcUrl(spec.networkMode, env);
  const safeLimit = Number.isInteger(limit)
    ? Math.min(MAX_SCAN_LIMIT, Math.max(MIN_SCAN_LIMIT, limit))
    : DEFAULT_SCAN_LIMIT;
  const createdAtMs = parseTimestampMs(intent.createdAt);
  const seenHashes = new Set();

  const endpointPath = !spec.isNative
    ? `/v1/accounts/${encodeURIComponent(spec.treasuryAddress)}/transactions/trc20?only_to=true&only_confirmed=false&limit=${safeLimit}&contract_address=${encodeURIComponent(spec.tokenContractAddress)}`
    : `/v1/accounts/${encodeURIComponent(spec.treasuryAddress)}/transactions?only_to=true&only_confirmed=false&limit=${safeLimit}`;

  const payload = await callTronApi({ rpcUrl, endpointPath, method: 'GET', env, fetchImpl });
  const rows = Array.isArray(payload.data) ? payload.data : [];

  if (!spec.isNative) {
    // Aggregate multi-log TRC-20 Transfer rows sharing the same transaction_id before filtering amount.
    const totalsByHash = new Map();
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const trimmedHash = typeof row.transaction_id === 'string' ? row.transaction_id.trim() : '';
      if (!TRON_TX_HASH_PATTERN.test(trimmedHash)) continue;
      const blockTs = typeof row.block_timestamp === 'number' && Number.isFinite(row.block_timestamp)
        ? row.block_timestamp
        : Number.NaN;
      if (Number.isFinite(createdAtMs) && Number.isFinite(blockTs) && blockTs < createdAtMs - SCAN_CLOCK_SKEW_MS) {
        continue;
      }
      if (typeof row.to === 'string' && row.to.trim() !== spec.treasuryAddress) continue;
      if (spec.senderWallet && typeof row.from === 'string' && row.from.trim() !== spec.senderWallet) continue;
      const rawVal = typeof row.value === 'string' ? row.value.trim() : '';
      if (!POSITIVE_INT_PATTERN.test(rawVal)) continue;
      const amount = BigInt(rawVal);
      if (amount <= 0n) continue;
      const candidateHash = trimmedHash.toLowerCase();
      totalsByHash.set(candidateHash, (totalsByHash.get(candidateHash) || 0n) + amount);
    }

    for (const [candidateHash, totalAmount] of totalsByHash.entries()) {
      if (totalAmount < spec.expectedAmountAtomic) continue;
      if (await isTxHashUsed(candidateHash)) continue;

      const verified = await verifyTronTransactionInternal({
        spec,
        normalizedTxHash: candidateHash,
        rpcUrl,
        env,
        fetchImpl
      });
      if (verified && (verified.verificationStatus === 'READY_TO_SETTLE' || verified.verificationStatus === 'PROCESSING')) {
        return verified;
      }
    }
    return null;
  }

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const trimmedHash = typeof row.txID === 'string' ? row.txID.trim() : '';
    if (!TRON_TX_HASH_PATTERN.test(trimmedHash)) continue;
    const candidateHash = trimmedHash.toLowerCase();
    if (seenHashes.has(candidateHash)) continue;
    seenHashes.add(candidateHash);

    const blockTs = typeof row.block_timestamp === 'number' && Number.isFinite(row.block_timestamp)
      ? row.block_timestamp
      : Number.NaN;
    if (Number.isFinite(createdAtMs) && Number.isFinite(blockTs) && blockTs < createdAtMs - SCAN_CLOCK_SKEW_MS) {
      continue;
    }

    // Pre-filter native TRX candidates to avoid TronGrid RPC amplification on dust/unrelated txs.
    if (Array.isArray(row.ret) && row.ret[0] && row.ret[0].contractRet !== 'SUCCESS') continue;
    const contract = row.raw_data && Array.isArray(row.raw_data.contract) ? row.raw_data.contract[0] : null;
    if (!contract || contract.type !== 'TransferContract' || !contract.parameter || !contract.parameter.value) {
      continue;
    }
    const val = contract.parameter.value;
    if (normalizeHex41Address(val.to_address) !== spec.treasuryHex41) continue;
    if (spec.senderHex41 && normalizeHex41Address(val.owner_address) !== spec.senderHex41) continue;
    let amountAtomic;
    try {
      amountAtomic = parseNonNegativeAtomic(val.amount ?? 0, 'TransferContract.amount');
    } catch {
      continue;
    }
    if (amountAtomic < spec.expectedAmountAtomic) continue;

    if (await isTxHashUsed(candidateHash)) continue;

    const verified = await verifyTronTransactionInternal({
      spec,
      normalizedTxHash: candidateHash,
      rpcUrl,
      env,
      fetchImpl
    });
    if (verified && (verified.verificationStatus === 'READY_TO_SETTLE' || verified.verificationStatus === 'PROCESSING')) {
      return verified;
    }
  }

  return null;
}

module.exports = Object.freeze({
  TronVerifierError,
  TRC20_TRANSFER_TOPIC,
  TRON_TX_HASH_PATTERN,
  DEFAULT_RPC_TIMEOUT_MS,
  DEFAULT_SCAN_LIMIT,
  resolveTronRpcUrl,
  verifyTronTransaction,
  findIncomingTronTransfer
});
