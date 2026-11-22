'use strict';

const {
  NETWORK_CATALOG,
  PAYMENT_STATUSES,
  isValidEvmAddress,
  isValidSolanaAddress
} = require('./paymentConfig');
const {
  EVM_TX_HASH_PATTERN,
  verifyEvmTransaction,
  findIncomingEvmTransfer
} = require('./evmVerifier');
const {
  SOLANA_SIGNATURE_PATTERN,
  verifySolanaTransaction,
  findIncomingSolanaTransfer
} = require('./solanaVerifier');

// Canonical verifier result states: CONFIRMED is strictly forbidden (SCRUM-229).
const VERIFICATION_STATUSES = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  PROCESSING: 'PROCESSING',
  READY_TO_SETTLE: 'READY_TO_SETTLE',
  UNDERPAID: 'UNDERPAID',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED'
});

const ALLOWED_VERIFICATION_STATUS_SET = new Set(Object.values(VERIFICATION_STATUSES));
const KNOWN_INTENT_STATUS_SET = new Set(Object.values(PAYMENT_STATUSES));
const TERMINAL_INTENT_STATUS_SET = new Set([
  PAYMENT_STATUSES.SETTLED,
  PAYMENT_STATUSES.CANCELLED,
  PAYMENT_STATUSES.FAILED
]);

const EVM_CHAIN_IDS = new Set(['56', '97', '137', '80002', '1', '11155111']);
const SOLANA_CHAIN_IDS = new Set(['solana-devnet', 'solana-mainnet']);
const SAFE_DOC_ID_PATTERN = /^[a-zA-Z0-9_.:@-]+$/;
const SAFE_USED_TX_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;
const POSITIVE_INT_PATTERN = /^\d+$/;

class OnChainVerifierError extends Error {
  constructor(code, message, statusCode = 400, details = undefined) {
    super(message);
    this.name = 'OnChainVerifierError';
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
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

function parseTimestampMs(raw, label) {
  if (raw instanceof Date) {
    const ms = raw.getTime();
    if (!Number.isNaN(ms)) return ms;
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) return ms;
  } else if (raw && typeof raw === 'object' && typeof raw.toDate === 'function') {
    const d = raw.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d.getTime();
  }
  throw new OnChainVerifierError('INVALID_INTENT', `intent.${label} must be a valid timestamp`, 400);
}

function buildUsedTxHashKey(chainId, txHash) {
  if (chainId === undefined || chainId === null) {
    throw new OnChainVerifierError('UNSUPPORTED_CHAIN_ID', 'chainId is required', 400);
  }
  const normalizedChainId = String(chainId).trim().toLowerCase();
  if (!normalizedChainId || /\s/.test(normalizedChainId)) {
    throw new OnChainVerifierError('UNSUPPORTED_CHAIN_ID', `Invalid chainId: ${chainId}`, 400);
  }

  if (typeof txHash !== 'string' || txHash.trim() === '') {
    throw new OnChainVerifierError('INVALID_TX_HASH', 'txHash must be a non-empty string', 400);
  }
  const trimmedHash = txHash.trim();

  let normalizedTxHash;
  if (EVM_CHAIN_IDS.has(normalizedChainId)) {
    if (!EVM_TX_HASH_PATTERN.test(trimmedHash)) {
      throw new OnChainVerifierError('INVALID_TX_HASH', 'Invalid EVM txHash format', 400);
    }
    normalizedTxHash = trimmedHash.toLowerCase();
  } else if (SOLANA_CHAIN_IDS.has(normalizedChainId)) {
    if (!SOLANA_SIGNATURE_PATTERN.test(trimmedHash)) {
      throw new OnChainVerifierError('INVALID_TX_HASH', 'Invalid Solana Base58 signature format', 400);
    }
    // Preserve Base58 case-sensitivity on Solana signatures.
    normalizedTxHash = trimmedHash;
  } else {
    throw new OnChainVerifierError('UNSUPPORTED_CHAIN_ID', `Unsupported chainId: ${chainId}`, 400);
  }

  const key = `${normalizedChainId}_${normalizedTxHash}`;
  if (
    key.includes('/') ||
    key.includes('..') ||
    !SAFE_USED_TX_KEY_PATTERN.test(key)
  ) {
    throw new OnChainVerifierError('INVALID_USED_TX_KEY', 'Constructed usedTxHash key is not a safe Firestore document ID', 400);
  }
  return key;
}

function validateIntentForVerification(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    throw new OnChainVerifierError('INVALID_INTENT', 'intent must be a plain object', 400);
  }

  const intentId = typeof intent.intentId === 'string' ? intent.intentId.trim() : '';
  if (!intentId || intentId === '.' || intentId === '..' || !SAFE_DOC_ID_PATTERN.test(intentId)) {
    throw new OnChainVerifierError('INVALID_INTENT', 'intent.intentId must be a valid single-segment identifier', 400);
  }

  const status = typeof intent.status === 'string' ? intent.status.trim() : '';
  if (!KNOWN_INTENT_STATUS_SET.has(status)) {
    throw new OnChainVerifierError('INVALID_INTENT', `Invalid intent.status: ${intent.status}`, 400);
  }
  if (TERMINAL_INTENT_STATUS_SET.has(status)) {
    throw new OnChainVerifierError(
      'INTENT_TERMINAL_STATUS',
      `Intent '${intentId}' is in terminal status '${status}' and cannot be verified`,
      409
    );
  }

  const paymentNetwork = typeof intent.paymentNetwork === 'string' ? intent.paymentNetwork.trim().toLowerCase() : '';
  const networkSpec = Object.hasOwn(NETWORK_CATALOG, paymentNetwork) ? NETWORK_CATALOG[paymentNetwork] : null;
  if (!networkSpec) {
    throw new OnChainVerifierError('UNSUPPORTED_NETWORK', `Unsupported paymentNetwork: ${intent.paymentNetwork}`, 400);
  }

  const networkMode = typeof intent.networkMode === 'string' ? intent.networkMode.trim().toLowerCase() : '';
  const modeSpec = Object.hasOwn(networkSpec.modes, networkMode) ? networkSpec.modes[networkMode] : null;
  if (!modeSpec) {
    throw new OnChainVerifierError('INVALID_INTENT', `Invalid networkMode: ${intent.networkMode}`, 400);
  }

  if (intent.chainId === undefined || intent.chainId === null) {
    throw new OnChainVerifierError('INVALID_INTENT', 'intent.chainId is required', 400);
  }
  if (String(intent.chainId).trim().toLowerCase() !== String(modeSpec.chainId).toLowerCase()) {
    throw new OnChainVerifierError(
      'INVALID_INTENT',
      `intent.chainId (${intent.chainId}) does not match ${paymentNetwork}/${networkMode} (${modeSpec.chainId})`,
      400
    );
  }

  const paymentAsset = typeof intent.paymentAsset === 'string' ? intent.paymentAsset.trim().toUpperCase() : '';
  const assetSpec = Object.hasOwn(networkSpec.assets, paymentAsset) ? networkSpec.assets[paymentAsset] : null;
  if (!assetSpec) {
    throw new OnChainVerifierError('INVALID_INTENT', `Unsupported paymentAsset '${intent.paymentAsset}' for ${paymentNetwork}`, 400);
  }

  if (typeof intent.expectedAmountAtomic !== 'string' || !POSITIVE_INT_PATTERN.test(intent.expectedAmountAtomic)) {
    throw new OnChainVerifierError('INVALID_INTENT', 'intent.expectedAmountAtomic must be a positive integer string', 400);
  }
  if (BigInt(intent.expectedAmountAtomic) <= 0n) {
    throw new OnChainVerifierError('INVALID_INTENT', 'intent.expectedAmountAtomic must be greater than zero', 400);
  }

  const validTreasury =
    networkSpec.family === 'evm'
      ? isValidEvmAddress(intent.treasuryAddress)
      : isValidSolanaAddress(intent.treasuryAddress);
  if (!validTreasury) {
    throw new OnChainVerifierError('INVALID_INTENT', `Invalid ${networkSpec.family} intent.treasuryAddress`, 400);
  }

  if (!assetSpec.isNative) {
    const validContract =
      networkSpec.family === 'evm'
        ? isValidEvmAddress(intent.tokenContractAddress)
        : isValidSolanaAddress(intent.tokenContractAddress);
    if (!validContract) {
      throw new OnChainVerifierError('INVALID_INTENT', `Invalid ${networkSpec.family} intent.tokenContractAddress`, 400);
    }
  }

  const expiresAtMs = parseTimestampMs(intent.expiresAt, 'expiresAt');

  return {
    intentId,
    family: networkSpec.family,
    paymentNetwork,
    networkMode,
    chainId: modeSpec.chainId,
    paymentAsset,
    requiredConfirmations: networkSpec.requiredConfirmations,
    expiresAtMs
  };
}

function assertValidVerificationStatus(status) {
  if (!ALLOWED_VERIFICATION_STATUS_SET.has(status)) {
    throw new OnChainVerifierError(
      'INVALID_VERIFICATION_STATUS',
      `Verifier emitted disallowed verificationStatus: ${status}`,
      500
    );
  }
  return status;
}

function createOnChainVerifier({
  db,
  env = process.env,
  now = () => Date.now(),
  fetchImpl = globalThis.fetch
} = {}) {
  if (!db || typeof db.collection !== 'function') {
    throw new TypeError('db with collection() is required');
  }

  async function inspectUsedTxHash(usedTxKey, intentId) {
    const snap = await db.collection('usedTxHashes').doc(usedTxKey).get();
    if (!snapExists(snap)) {
      return { usedByOther: false, existingIntentId: null };
    }
    const data = snapData(snap) || {};
    if (data.intentId !== intentId) {
      return { usedByOther: true, existingIntentId: data.intentId || null };
    }
    return { usedByOther: false, existingIntentId: intentId };
  }

  function formatStructuredResult({ meta, intent, rawResult, usedTxKey, nowMs }) {
    let verificationStatus = assertValidVerificationStatus(rawResult.verificationStatus);
    let reason = rawResult.reason ?? null;

    if (verificationStatus === VERIFICATION_STATUSES.NOT_FOUND && nowMs > meta.expiresAtMs) {
      verificationStatus = VERIFICATION_STATUSES.EXPIRED;
      reason = 'INTENT_EXPIRED';
    }

    const result = {
      intentId: meta.intentId,
      paymentNetwork: meta.paymentNetwork,
      networkMode: meta.networkMode,
      chainId: meta.chainId,
      paymentAsset: meta.paymentAsset,
      txHash: rawResult.txHash ?? null,
      usedTxKey,
      verificationStatus: assertValidVerificationStatus(verificationStatus),
      confirmations: rawResult.confirmations ?? 0,
      requiredConfirmations: rawResult.requiredConfirmations ?? meta.requiredConfirmations,
      receivedAmountAtomic: rawResult.receivedAmountAtomic ?? '0',
      expectedAmountAtomic: intent.expectedAmountAtomic,
      reason,
      checkedAt: new Date(nowMs).toISOString()
    };

    if (rawResult.shortfallAtomic !== undefined) result.shortfallAtomic = rawResult.shortfallAtomic;
    if (rawResult.fromAddress !== undefined) result.fromAddress = rawResult.fromAddress;
    if (rawResult.blockNumber !== undefined) result.blockNumber = rawResult.blockNumber;
    if (rawResult.slot !== undefined) result.slot = rawResult.slot;

    return result;
  }

  async function verifyIntentPayment({ intent, txHash } = {}) {
    const meta = validateIntentForVerification(intent);
    const usedTxKey = buildUsedTxHashKey(meta.chainId, txHash);

    const replayCheck = await inspectUsedTxHash(usedTxKey, meta.intentId);
    if (replayCheck.usedByOther) {
      throw new OnChainVerifierError(
        'TX_HASH_ALREADY_USED',
        `Transaction hash '${usedTxKey}' has already been used by another payment intent`,
        409,
        { usedTxKey, existingIntentId: replayCheck.existingIntentId }
      );
    }

    const rawResult =
      meta.family === 'evm'
        ? await verifyEvmTransaction({ intent, txHash, env, fetchImpl })
        : await verifySolanaTransaction({ intent, txHash, env, fetchImpl });

    return formatStructuredResult({
      meta,
      intent,
      rawResult,
      usedTxKey,
      nowMs: now()
    });
  }

  async function discoverAndVerifyIncomingPayment({ intent, scanOptions = {} } = {}) {
    const meta = validateIntentForVerification(intent);

    if (typeof intent.txHash === 'string' && intent.txHash.trim() !== '') {
      return verifyIntentPayment({ intent, txHash: intent.txHash });
    }

    const isTxHashUsed = async (candidateTxHash) => {
      const candidateKey = buildUsedTxHashKey(meta.chainId, candidateTxHash);
      const replayCheck = await inspectUsedTxHash(candidateKey, meta.intentId);
      return replayCheck.usedByOther;
    };

    const candidate =
      meta.family === 'evm'
        ? await findIncomingEvmTransfer({
            intent,
            fromBlock: scanOptions.fromBlock,
            toBlock: scanOptions.toBlock,
            maxBlockRange: scanOptions.maxBlockRange,
            env,
            fetchImpl,
            isTxHashUsed
          })
        : await findIncomingSolanaTransfer({
            intent,
            limit: scanOptions.limit,
            env,
            fetchImpl,
            isTxHashUsed
          });

    const nowMs = now();
    if (candidate) {
      const usedTxKey = buildUsedTxHashKey(meta.chainId, candidate.txHash);
      return formatStructuredResult({
        meta,
        intent,
        rawResult: candidate,
        usedTxKey,
        nowMs
      });
    }

    const isExpired = nowMs > meta.expiresAtMs;
    return {
      intentId: meta.intentId,
      paymentNetwork: meta.paymentNetwork,
      networkMode: meta.networkMode,
      chainId: meta.chainId,
      paymentAsset: meta.paymentAsset,
      txHash: null,
      usedTxKey: null,
      verificationStatus: isExpired ? VERIFICATION_STATUSES.EXPIRED : VERIFICATION_STATUSES.NOT_FOUND,
      confirmations: 0,
      requiredConfirmations: meta.requiredConfirmations,
      receivedAmountAtomic: '0',
      expectedAmountAtomic: intent.expectedAmountAtomic,
      reason: isExpired ? 'INTENT_EXPIRED' : 'NO_MATCHING_TRANSFER_FOUND',
      checkedAt: new Date(nowMs).toISOString()
    };
  }

  return Object.freeze({
    verifyIntentPayment,
    discoverAndVerifyIncomingPayment
  });
}

module.exports = Object.freeze({
  OnChainVerifierError,
  VERIFICATION_STATUSES,
  buildUsedTxHashKey,
  createOnChainVerifier
});
