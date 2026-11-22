'use strict';

const { NETWORK_CATALOG, isValidEvmAddress } = require('./paymentConfig');

const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const EVM_TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const POSITIVE_INT_PATTERN = /^\d+$/;
const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;
const HEX_UINT256_DATA_PATTERN = /^0x[0-9a-fA-F]{1,64}$/;
const PADDED_ADDRESS_TOPIC_PATTERN = /^0x0{24}([0-9a-fA-F]{40})$/;
const DEFAULT_RPC_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BLOCK_RANGE = 200;
const MAX_ALLOWED_BLOCK_RANGE = 500;

const RPC_ENV_BY_NETWORK_AND_MODE = Object.freeze({
  bsc: Object.freeze({
    testnet: 'PAYMENT_RPC_URL_BSC_TESTNET',
    mainnet: 'PAYMENT_RPC_URL_BSC_MAINNET'
  }),
  polygon: Object.freeze({
    testnet: 'PAYMENT_RPC_URL_POLYGON_TESTNET',
    mainnet: 'PAYMENT_RPC_URL_POLYGON_MAINNET'
  }),
  ethereum: Object.freeze({
    testnet: 'PAYMENT_RPC_URL_ETHEREUM_TESTNET',
    mainnet: 'PAYMENT_RPC_URL_ETHEREUM_MAINNET'
  })
});

class EvmVerifierError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = 'EvmVerifierError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function resolveEvmRpcUrl(networkId, networkMode, env = process.env) {
  const cleanNetwork = typeof networkId === 'string' ? networkId.trim().toLowerCase() : '';
  const cleanMode = typeof networkMode === 'string' ? networkMode.trim().toLowerCase() : '';
  const modeMap = Object.hasOwn(RPC_ENV_BY_NETWORK_AND_MODE, cleanNetwork)
    ? RPC_ENV_BY_NETWORK_AND_MODE[cleanNetwork]
    : null;
  const envKey = modeMap && Object.hasOwn(modeMap, cleanMode) ? modeMap[cleanMode] : null;
  if (!envKey) {
    throw new EvmVerifierError(
      'UNSUPPORTED_NETWORK',
      `Unsupported EVM network/mode combination: ${networkId}/${networkMode}`,
      400
    );
  }

  const raw = env && env[envKey];
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed || (!trimmed.startsWith('https://') && !trimmed.startsWith('http://'))) {
    throw new EvmVerifierError(
      'RPC_URL_NOT_CONFIGURED',
      `Missing or invalid EVM RPC URL in ${envKey}`,
      500
    );
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new EvmVerifierError(
      'RPC_URL_NOT_CONFIGURED',
      `Malformed EVM RPC URL in ${envKey}`,
      500
    );
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new EvmVerifierError(
      'RPC_URL_NOT_CONFIGURED',
      `Invalid EVM RPC URL protocol in ${envKey}`,
      500
    );
  }
  return trimmed;
}

async function callEvmRpc({
  rpcUrl,
  method,
  params = [],
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS
}) {
  if (typeof fetchImpl !== 'function') {
    throw new EvmVerifierError('RPC_REQUEST_FAILED', 'No fetch implementation available for EVM RPC', 503);
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
    throw new EvmVerifierError(
      'RPC_REQUEST_FAILED',
      `EVM RPC ${method} network error: ${err && err.message ? err.message : String(err)}`,
      503
    );
  }

  if (!res || !res.ok) {
    throw new EvmVerifierError(
      'RPC_REQUEST_FAILED',
      `EVM RPC ${method} returned HTTP ${res ? res.status : 'UNKNOWN'}`,
      503
    );
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new EvmVerifierError(
      'RPC_REQUEST_FAILED',
      `EVM RPC ${method} returned invalid JSON: ${err && err.message ? err.message : String(err)}`,
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
    throw new EvmVerifierError('RPC_REQUEST_FAILED', `EVM RPC ${method} error: ${detail}`, 502);
  }

  return payload.result;
}

function parseHexBigInt(hex, label) {
  if (typeof hex !== 'string' || !HEX_QUANTITY_PATTERN.test(hex)) {
    throw new EvmVerifierError('RPC_REQUEST_FAILED', `Invalid hex quantity for ${label}: ${hex}`, 502);
  }
  return BigInt(hex);
}

function parseTransferDataBigInt(data) {
  if (data === '0x') return 0n;
  if (typeof data !== 'string' || !HEX_UINT256_DATA_PATTERN.test(data)) return null;
  return BigInt(data);
}

function decodeTopicAddress(topic) {
  if (typeof topic !== 'string') return null;
  const match = PADDED_ADDRESS_TOPIC_PATTERN.exec(topic);
  return match ? `0x${match[1].toLowerCase()}` : null;
}

function padAddressToTopic(address) {
  return `0x${address.toLowerCase().slice(2).padStart(64, '0')}`;
}

function toSafeBlockNumber(blockBigInt) {
  return blockBigInt <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(blockBigInt) : blockBigInt.toString();
}

function normalizeEvmIntent(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    throw new EvmVerifierError('INVALID_INTENT', 'intent must be a plain object', 400);
  }

  const networkId = typeof intent.paymentNetwork === 'string' ? intent.paymentNetwork.trim().toLowerCase() : '';
  const networkSpec = Object.hasOwn(NETWORK_CATALOG, networkId) ? NETWORK_CATALOG[networkId] : null;
  if (!networkSpec || networkSpec.family !== 'evm') {
    throw new EvmVerifierError('UNSUPPORTED_NETWORK', `Unsupported EVM paymentNetwork: ${intent.paymentNetwork}`, 400);
  }

  const networkMode = typeof intent.networkMode === 'string' ? intent.networkMode.trim().toLowerCase() : '';
  const modeSpec = Object.hasOwn(networkSpec.modes, networkMode) ? networkSpec.modes[networkMode] : null;
  if (!modeSpec) {
    throw new EvmVerifierError('INVALID_INTENT', `Invalid networkMode: ${intent.networkMode}`, 400);
  }

  const expectedChainId = modeSpec.chainId;
  if (intent.chainId !== undefined && intent.chainId !== null) {
    const rawChain = String(intent.chainId).trim();
    if (!POSITIVE_INT_PATTERN.test(rawChain) || Number(rawChain) !== expectedChainId) {
      throw new EvmVerifierError(
        'INVALID_INTENT',
        `Intent chainId (${intent.chainId}) does not match ${networkId}/${networkMode} (${expectedChainId})`,
        400
      );
    }
  }

  const paymentAsset = typeof intent.paymentAsset === 'string' ? intent.paymentAsset.trim().toUpperCase() : '';
  const assetSpec = Object.hasOwn(networkSpec.assets, paymentAsset) ? networkSpec.assets[paymentAsset] : null;
  if (!assetSpec) {
    throw new EvmVerifierError('INVALID_INTENT', `Unsupported EVM paymentAsset '${intent.paymentAsset}' on ${networkId}`, 400);
  }

  if (typeof intent.expectedAmountAtomic !== 'string' || !POSITIVE_INT_PATTERN.test(intent.expectedAmountAtomic)) {
    throw new EvmVerifierError('INVALID_INTENT', 'intent.expectedAmountAtomic must be a positive integer string', 400);
  }
  const expectedAmountAtomic = BigInt(intent.expectedAmountAtomic);
  if (expectedAmountAtomic <= 0n) {
    throw new EvmVerifierError('INVALID_INTENT', 'intent.expectedAmountAtomic must be greater than zero', 400);
  }

  if (!isValidEvmAddress(intent.treasuryAddress)) {
    throw new EvmVerifierError('INVALID_INTENT', 'intent.treasuryAddress must be a valid non-zero EVM address', 400);
  }
  const treasuryLower = intent.treasuryAddress.trim().toLowerCase();

  let tokenContractLower = null;
  if (!assetSpec.isNative) {
    if (!isValidEvmAddress(intent.tokenContractAddress)) {
      throw new EvmVerifierError('INVALID_INTENT', 'intent.tokenContractAddress must be a valid non-zero EVM address for token payments', 400);
    }
    tokenContractLower = intent.tokenContractAddress.trim().toLowerCase();
  }

  let senderLower = null;
  if (intent.senderWallet !== undefined && intent.senderWallet !== null && intent.senderWallet !== '') {
    if (!isValidEvmAddress(intent.senderWallet)) {
      throw new EvmVerifierError('INVALID_INTENT', 'intent.senderWallet must be a valid non-zero EVM address when present', 400);
    }
    senderLower = intent.senderWallet.trim().toLowerCase();
  }

  const requiredConfirmations =
    Number.isInteger(intent.requiredConfirmations) && intent.requiredConfirmations > networkSpec.requiredConfirmations
      ? intent.requiredConfirmations
      : networkSpec.requiredConfirmations;

  return {
    networkId,
    networkMode,
    expectedChainId,
    paymentAsset,
    isNative: assetSpec.isNative,
    expectedAmountAtomic,
    treasuryLower,
    tokenContractLower,
    senderLower,
    requiredConfirmations
  };
}

async function assertRpcChainId({ rpcUrl, expectedChainId, fetchImpl }) {
  const chainIdHex = await callEvmRpc({ rpcUrl, method: 'eth_chainId', params: [], fetchImpl });
  const actualChainId = parseHexBigInt(chainIdHex, 'eth_chainId');
  if (actualChainId !== BigInt(expectedChainId)) {
    throw new EvmVerifierError(
      'RPC_CHAIN_ID_MISMATCH',
      `EVM RPC chainId mismatch: expected ${expectedChainId}, received ${actualChainId.toString()}`,
      502
    );
  }
}

function extractFallbackFromAddress(receipt, tx) {
  const candidate = (receipt && receipt.from) || (tx && tx.from) || null;
  return typeof candidate === 'string' && isValidEvmAddress(candidate) ? candidate.toLowerCase() : null;
}

async function verifyEvmTransaction({
  intent,
  txHash,
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof txHash !== 'string' || !EVM_TX_HASH_PATTERN.test(txHash.trim())) {
    throw new EvmVerifierError('INVALID_TX_HASH', 'txHash must be a valid 32-byte 0x-prefixed EVM transaction hash', 400);
  }
  const normalizedTxHash = txHash.trim().toLowerCase();
  const spec = normalizeEvmIntent(intent);
  const rpcUrl = resolveEvmRpcUrl(spec.networkId, spec.networkMode, env);

  await assertRpcChainId({ rpcUrl, expectedChainId: spec.expectedChainId, fetchImpl });

  const [receipt, tx, latestBlockHex] = await Promise.all([
    callEvmRpc({ rpcUrl, method: 'eth_getTransactionReceipt', params: [normalizedTxHash], fetchImpl }),
    callEvmRpc({ rpcUrl, method: 'eth_getTransactionByHash', params: [normalizedTxHash], fetchImpl }),
    callEvmRpc({ rpcUrl, method: 'eth_blockNumber', params: [], fetchImpl })
  ]);

  if (receipt === null || receipt === undefined) {
    if (tx !== null && tx !== undefined) {
      return {
        verificationStatus: 'PROCESSING',
        confirmations: 0,
        requiredConfirmations: spec.requiredConfirmations,
        txHash: normalizedTxHash,
        receivedAmountAtomic: '0',
        expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
        fromAddress: extractFallbackFromAddress(null, tx),
        blockNumber: null,
        reason: 'TX_PENDING_IN_MEMPOOL'
      };
    }
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

  if (
    typeof receipt.transactionHash === 'string' &&
    receipt.transactionHash.toLowerCase() !== normalizedTxHash
  ) {
    throw new EvmVerifierError('RPC_REQUEST_FAILED', 'EVM receipt transactionHash does not match requested txHash', 502);
  }
  if (
    tx &&
    typeof tx.hash === 'string' &&
    tx.hash.toLowerCase() !== normalizedTxHash
  ) {
    throw new EvmVerifierError('RPC_REQUEST_FAILED', 'EVM transaction hash does not match requested txHash', 502);
  }

  const txBlock = parseHexBigInt(receipt.blockNumber, 'receipt.blockNumber');
  const latestBlock = parseHexBigInt(latestBlockHex, 'eth_blockNumber');
  const confirmations = latestBlock >= txBlock ? Number(latestBlock - txBlock + 1n) : 0;
  const blockNumber = toSafeBlockNumber(txBlock);

  if (typeof receipt.status !== 'string' || receipt.status.toLowerCase() !== '0x1') {
    return {
      verificationStatus: 'FAILED',
      confirmations,
      requiredConfirmations: spec.requiredConfirmations,
      txHash: normalizedTxHash,
      receivedAmountAtomic: '0',
      expectedAmountAtomic: spec.expectedAmountAtomic.toString(),
      fromAddress: extractFallbackFromAddress(receipt, tx),
      blockNumber,
      reason: 'TX_REVERTED'
    };
  }

  let receivedAmountAtomic = 0n;
  let fromAddress = extractFallbackFromAddress(receipt, tx);
  let hasOtherSenderTransfer = false;

  if (!spec.isNative) {
    const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
    let matchedFrom = null;
    let otherSenderFrom = null;
    for (const log of logs) {
      if (!log || log.removed === true) continue;
      if (typeof log.address !== 'string' || log.address.toLowerCase() !== spec.tokenContractLower) continue;
      if (!Array.isArray(log.topics) || log.topics.length < 3) continue;
      if (typeof log.topics[0] !== 'string' || log.topics[0].toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;

      const decodedFrom = decodeTopicAddress(log.topics[1]);
      const decodedTo = decodeTopicAddress(log.topics[2]);
      if (!decodedFrom || !decodedTo || decodedTo !== spec.treasuryLower) continue;

      const amount = parseTransferDataBigInt(log.data);
      if (amount === null || amount <= 0n) continue;

      if (spec.senderLower && decodedFrom !== spec.senderLower) {
        hasOtherSenderTransfer = true;
        if (!otherSenderFrom) otherSenderFrom = decodedFrom;
        continue;
      }

      receivedAmountAtomic += amount;
      if (!matchedFrom) matchedFrom = decodedFrom;
    }
    if (matchedFrom) {
      fromAddress = matchedFrom;
    } else if (otherSenderFrom) {
      fromAddress = otherSenderFrom;
    }
  } else {
    if (tx === null || tx === undefined) {
      throw new EvmVerifierError(
        'RPC_REQUEST_FAILED',
        'EVM receipt exists for native transfer but eth_getTransactionByHash returned null',
        502
      );
    }
    if (typeof tx.to === 'string' && tx.to.toLowerCase() === spec.treasuryLower) {
      const valueAtomic = parseHexBigInt(tx.value || '0x0', 'tx.value');
      const txFromLower = typeof tx.from === 'string' && isValidEvmAddress(tx.from) ? tx.from.toLowerCase() : null;
      if (txFromLower) {
        fromAddress = txFromLower;
      }
      if (valueAtomic > 0n) {
        if (spec.senderLower && txFromLower !== spec.senderLower) {
          hasOtherSenderTransfer = true;
        } else {
          receivedAmountAtomic = valueAtomic;
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

function parseBlockBound(value, label) {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new EvmVerifierError('INVALID_SCAN_RANGE', `${label} must be non-negative`, 400);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new EvmVerifierError('INVALID_SCAN_RANGE', `${label} must be a non-negative integer`, 400);
    }
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (HEX_QUANTITY_PATTERN.test(trimmed)) return BigInt(trimmed);
    if (POSITIVE_INT_PATTERN.test(trimmed)) return BigInt(trimmed);
  }
  throw new EvmVerifierError('INVALID_SCAN_RANGE', `Invalid ${label}: ${value}`, 400);
}

async function findIncomingEvmTransfer({
  intent,
  fromBlock,
  toBlock,
  maxBlockRange = DEFAULT_MAX_BLOCK_RANGE,
  env = process.env,
  fetchImpl = globalThis.fetch,
  isTxHashUsed = async () => false
} = {}) {
  const spec = normalizeEvmIntent(intent);
  const rpcUrl = resolveEvmRpcUrl(spec.networkId, spec.networkMode, env);
  const safeMaxRange =
    Number.isInteger(maxBlockRange) && maxBlockRange > 0
      ? Math.min(maxBlockRange, MAX_ALLOWED_BLOCK_RANGE)
      : DEFAULT_MAX_BLOCK_RANGE;

  await assertRpcChainId({ rpcUrl, expectedChainId: spec.expectedChainId, fetchImpl });

  const latestBlockHex = await callEvmRpc({ rpcUrl, method: 'eth_blockNumber', params: [], fetchImpl });
  const latestBlock = parseHexBigInt(latestBlockHex, 'eth_blockNumber');

  const endBlock = toBlock !== undefined && toBlock !== null ? parseBlockBound(toBlock, 'toBlock') : latestBlock;
  let startBlock;
  if (fromBlock !== undefined && fromBlock !== null) {
    startBlock = parseBlockBound(fromBlock, 'fromBlock');
    if (startBlock > endBlock) return null;
    if (endBlock - startBlock > BigInt(safeMaxRange)) {
      startBlock = endBlock - BigInt(safeMaxRange);
    }
  } else {
    const lookback = BigInt(Math.min(safeMaxRange, 50));
    startBlock = endBlock >= lookback ? endBlock - lookback : 0n;
  }

  if (!spec.isNative) {
    const logs = await callEvmRpc({
      rpcUrl,
      method: 'eth_getLogs',
      params: [
        {
          address: intent.tokenContractAddress.trim(),
          fromBlock: `0x${startBlock.toString(16)}`,
          toBlock: `0x${endBlock.toString(16)}`,
          topics: [
            ERC20_TRANSFER_TOPIC,
            spec.senderLower ? padAddressToTopic(spec.senderLower) : null,
            padAddressToTopic(spec.treasuryLower)
          ]
        }
      ],
      fetchImpl
    });

    if (!Array.isArray(logs) || logs.length === 0) return null;

    const totalsByTxHash = new Map();
    for (const log of logs) {
      if (!log || log.removed === true) continue;
      if (typeof log.transactionHash !== 'string' || !EVM_TX_HASH_PATTERN.test(log.transactionHash)) continue;
      if (typeof log.address !== 'string' || log.address.toLowerCase() !== spec.tokenContractLower) continue;
      if (!Array.isArray(log.topics) || log.topics.length < 3) continue;
      if (typeof log.topics[0] !== 'string' || log.topics[0].toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;

      const decodedFrom = decodeTopicAddress(log.topics[1]);
      const decodedTo = decodeTopicAddress(log.topics[2]);
      if (!decodedFrom || !decodedTo || decodedTo !== spec.treasuryLower) continue;
      if (spec.senderLower && decodedFrom !== spec.senderLower) continue;

      const amount = parseTransferDataBigInt(log.data);
      if (amount === null || amount <= 0n) continue;

      const txHash = log.transactionHash.toLowerCase();
      totalsByTxHash.set(txHash, (totalsByTxHash.get(txHash) || 0n) + amount);
    }

    for (const [candidateTxHash, totalAmount] of totalsByTxHash.entries()) {
      if (totalAmount < spec.expectedAmountAtomic) continue;
      if (await isTxHashUsed(candidateTxHash)) continue;

      const verified = await verifyEvmTransaction({ intent, txHash: candidateTxHash, env, fetchImpl });
      if (verified.verificationStatus === 'READY_TO_SETTLE' || verified.verificationStatus === 'PROCESSING') {
        return verified;
      }
    }
    return null;
  }

  for (let blockNum = startBlock; blockNum <= endBlock; blockNum += 1n) {
    const block = await callEvmRpc({
      rpcUrl,
      method: 'eth_getBlockByNumber',
      params: [`0x${blockNum.toString(16)}`, true],
      fetchImpl
    });
    const txs = block && Array.isArray(block.transactions) ? block.transactions : [];
    for (const tx of txs) {
      if (!tx || typeof tx !== 'object') continue;
      if (typeof tx.hash !== 'string' || !EVM_TX_HASH_PATTERN.test(tx.hash)) continue;
      if (typeof tx.to !== 'string' || tx.to.toLowerCase() !== spec.treasuryLower) continue;
      if (spec.senderLower && (typeof tx.from !== 'string' || tx.from.toLowerCase() !== spec.senderLower)) continue;

      let valueAtomic;
      try {
        valueAtomic = parseHexBigInt(tx.value || '0x0', 'tx.value');
      } catch {
        continue;
      }
      if (valueAtomic < spec.expectedAmountAtomic) continue;

      const candidateTxHash = tx.hash.toLowerCase();
      if (await isTxHashUsed(candidateTxHash)) continue;

      const verified = await verifyEvmTransaction({ intent, txHash: candidateTxHash, env, fetchImpl });
      if (verified.verificationStatus === 'READY_TO_SETTLE' || verified.verificationStatus === 'PROCESSING') {
        return verified;
      }
    }
  }

  return null;
}

module.exports = Object.freeze({
  EvmVerifierError,
  ERC20_TRANSFER_TOPIC,
  EVM_TX_HASH_PATTERN,
  DEFAULT_RPC_TIMEOUT_MS,
  DEFAULT_MAX_BLOCK_RANGE,
  resolveEvmRpcUrl,
  verifyEvmTransaction,
  findIncomingEvmTransfer
});
