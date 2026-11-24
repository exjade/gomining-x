'use strict';

const { PAYMENT_STATUSES } = require('./paymentConfig');
const {
  VERIFICATION_STATUSES,
  buildUsedTxHashKey,
  createOnChainVerifier
} = require('./onChainVerifier');

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const ACTIVE_STATUS_SET = new Set([
  PAYMENT_STATUSES.OPEN,
  PAYMENT_STATUSES.AWAITING,
  PAYMENT_STATUSES.PROCESSING
]);
const EXPIRABLE_STATUS_SET = new Set([
  PAYMENT_STATUSES.OPEN,
  PAYMENT_STATUSES.AWAITING
]);
const TERMINAL_NON_SETTLED_SET = new Set([
  PAYMENT_STATUSES.CANCELLED,
  PAYMENT_STATUSES.FAILED,
  PAYMENT_STATUSES.EXPIRED,
  PAYMENT_STATUSES.UNDERPAID
]);

class PaymentSettlementError extends Error {
  constructor(code, message, statusCode = 400, details = undefined) {
    super(message);
    this.name = 'PaymentSettlementError';
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

function assertSafeId(value, code, label) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!SAFE_ID_PATTERN.test(clean)) {
    throw new PaymentSettlementError(code, `${label} must match ^[a-zA-Z0-9_-]+$`, 400);
  }
  return clean;
}

function buildActivatedMinerId(orderId) {
  const cleanOrderId = assertSafeId(orderId, 'INVALID_ORDER_ID', 'orderId');
  return `miner_${cleanOrderId}`;
}

function buildContractId(orderId) {
  const cleanOrderId = assertSafeId(orderId, 'INVALID_ORDER_ID', 'orderId');
  return `contract_${cleanOrderId}`;
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

function applyDualPatch(tx, intentRef, orderRef, orderSnap, currentIntent, patch) {
  tx.update(intentRef, patch);
  if (snapExists(orderSnap)) {
    tx.update(orderRef, patch);
  } else {
    tx.set(orderRef, { ...currentIntent, ...patch }, { merge: true });
  }
}

function buildAlreadySettledResult(intentId, orderId, current) {
  return {
    outcome: 'ALREADY_SETTLED',
    status: PAYMENT_STATUSES.SETTLED,
    intentId,
    orderId,
    activatedMinerId: current.activatedMinerId ?? null,
    contractId: current.contractId ?? null,
    txHash: current.txHash ?? null
  };
}

function assertVerificationMatchesIntentTerms(current, verifiedIntent, verification, intentId) {
  if (
    current.paymentNetwork !== verification.paymentNetwork ||
    current.networkMode !== verification.networkMode ||
    String(current.chainId) !== String(verification.chainId) ||
    current.paymentAsset !== verification.paymentAsset ||
    current.expectedAmountAtomic !== verification.expectedAmountAtomic ||
    (current.treasuryAddress ?? null) !== (verifiedIntent.treasuryAddress ?? null) ||
    (current.senderWallet ?? null) !== (verifiedIntent.senderWallet ?? null)
  ) {
    throw new PaymentSettlementError(
      'INTENT_CHANGED_DURING_VERIFICATION',
      `Payment intent '${intentId}' payment terms changed during on-chain verification`,
      409
    );
  }
}

function createPaymentSettlementService({
  db,
  env = process.env,
  now = () => Date.now(),
  fetchImpl = globalThis.fetch,
  onChainVerifier
} = {}) {
  if (!db || typeof db.collection !== 'function' || typeof db.runTransaction !== 'function') {
    throw new TypeError('db with collection() and runTransaction() is required');
  }

  const verifier = onChainVerifier || createOnChainVerifier({ db, env, now, fetchImpl });

  async function expireIntentAtomically(intentRef, intentId) {
    return db.runTransaction(async (tx) => {
      const intentSnap = await tx.get(intentRef);
      if (!snapExists(intentSnap)) {
        throw new PaymentSettlementError('INTENT_NOT_FOUND', `Payment intent not found: ${intentId}`, 404);
      }
      const current = snapData(intentSnap);
      const currentOrderId = current.orderId || intentId;
      if (current.status === PAYMENT_STATUSES.SETTLED) {
        return buildAlreadySettledResult(intentId, currentOrderId, current);
      }
      if (!EXPIRABLE_STATUS_SET.has(current.status) || Boolean(current.txHash)) {
        return {
          outcome: TERMINAL_NON_SETTLED_SET.has(current.status) ? 'TERMINAL_UNCHANGED' : 'UNCHANGED',
          status: current.status,
          intentId,
          orderId: currentOrderId,
          txHash: current.txHash ?? null
        };
      }
      const currentExpiresAtMs = parseTimestampMs(current.expiresAt);
      if (!Number.isFinite(currentExpiresAtMs) || now() <= currentExpiresAtMs) {
        return {
          outcome: 'UNCHANGED',
          status: current.status,
          intentId,
          orderId: currentOrderId,
          txHash: current.txHash ?? null
        };
      }

      const orderRef = db.collection('admin_orders').doc(currentOrderId);
      const orderSnap = await tx.get(orderRef);

      const nowIso = new Date(now()).toISOString();
      const patch = {
        status: PAYMENT_STATUSES.EXPIRED,
        expiredAt: nowIso,
        lastCheckedAt: nowIso,
        updatedAt: nowIso
      };
      applyDualPatch(tx, intentRef, orderRef, orderSnap, current, patch);

      return {
        outcome: 'EXPIRED',
        status: PAYMENT_STATUSES.EXPIRED,
        verificationStatus: VERIFICATION_STATUSES.EXPIRED,
        intentId,
        orderId: currentOrderId,
        txHash: null,
        reason: 'INTENT_EXPIRED'
      };
    });
  }

  async function processIntentVerificationAndSettlement(rawInput) {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new PaymentSettlementError('INVALID_INPUT', 'processIntentVerificationAndSettlement input must be a plain object', 400);
    }

    const {
      intentId: rawIntentId,
      txHash: rawTxHash,
      requesterUid,
      isAdmin = false,
      allowSystemActor = false
    } = rawInput;

    const intentId = assertSafeId(rawIntentId, 'INVALID_INTENT_ID', 'intentId');
    if (typeof isAdmin !== 'boolean' || typeof allowSystemActor !== 'boolean') {
      throw new PaymentSettlementError('INVALID_INPUT', 'isAdmin and allowSystemActor must be booleans', 400);
    }

    let actorUid = null;
    if (!allowSystemActor) {
      actorUid = typeof requesterUid === 'string' ? requesterUid.trim() : '';
      if (!actorUid) {
        throw new PaymentSettlementError('INVALID_REQUESTER_UID', 'requesterUid is required', 401);
      }
    }

    let providedTxHash = null;
    if (rawTxHash !== undefined && rawTxHash !== null) {
      if (typeof rawTxHash !== 'string') {
        throw new PaymentSettlementError('INVALID_TX_HASH', 'txHash must be a string', 400);
      }
      const trimmedHash = rawTxHash.trim();
      providedTxHash = trimmedHash || null;
    }

    // Pre-read strictly outside db.runTransaction.
    const intentRef = db.collection('payment_intents').doc(intentId);
    const preSnap = await intentRef.get();
    if (!snapExists(preSnap)) {
      throw new PaymentSettlementError('INTENT_NOT_FOUND', `Payment intent not found: ${intentId}`, 404);
    }
    const intent = snapData(preSnap);
    const orderId = assertSafeId(intent.orderId || intentId, 'INVALID_ORDER_ID', 'orderId');

    if (!allowSystemActor && !isAdmin && intent.buyerUid !== actorUid) {
      throw new PaymentSettlementError('FORBIDDEN', 'Not authorized to verify or settle this payment intent', 403);
    }

    if (intent.status === PAYMENT_STATUSES.SETTLED) {
      return buildAlreadySettledResult(intentId, orderId, intent);
    }

    if (TERMINAL_NON_SETTLED_SET.has(intent.status)) {
      if (
        !allowSystemActor &&
        providedTxHash &&
        (intent.status === PAYMENT_STATUSES.CANCELLED || intent.status === PAYMENT_STATUSES.FAILED)
      ) {
        throw new PaymentSettlementError(
          'INTENT_TERMINAL_STATUS',
          `Payment intent '${intentId}' is in terminal status '${intent.status}'`,
          409
        );
      }
      return {
        outcome: 'TERMINAL_UNCHANGED',
        status: intent.status,
        intentId,
        orderId,
        activatedMinerId: intent.activatedMinerId ?? null,
        contractId: intent.contractId ?? null,
        txHash: intent.txHash ?? null
      };
    }

    if (!ACTIVE_STATUS_SET.has(intent.status)) {
      throw new PaymentSettlementError(
        'INTENT_NOT_SETTLEABLE',
        `Payment intent '${intentId}' has unsupported status '${intent.status}'`,
        409
      );
    }

    const existingTxHash = typeof intent.txHash === 'string' && intent.txHash.trim() ? intent.txHash.trim() : null;
    const targetTxHash = providedTxHash || existingTxHash;

    if (intent.status === PAYMENT_STATUSES.OPEN && !targetTxHash) {
      const expiresAtMs = parseTimestampMs(intent.expiresAt);
      if (Number.isFinite(expiresAtMs) && now() > expiresAtMs) {
        return expireIntentAtomically(intentRef, intentId);
      }
      return {
        outcome: 'UNCHANGED',
        status: PAYMENT_STATUSES.OPEN,
        intentId,
        orderId,
        txHash: null
      };
    }

    if (intent.status === PAYMENT_STATUSES.OPEN && !intent.paymentNetwork) {
      throw new PaymentSettlementError(
        'PAYMENT_METHOD_NOT_SELECTED',
        `Payment intent '${intentId}' has no selected payment network/asset`,
        409
      );
    }

    // On-chain verification runs strictly OUTSIDE db.runTransaction.
    const verification = targetTxHash
      ? await verifier.verifyIntentPayment({ intent, txHash: targetTxHash })
      : await verifier.discoverAndVerifyIncomingPayment({ intent });

    if (verification.verificationStatus === 'CONFIRMED') {
      throw new PaymentSettlementError('INVALID_VERIFICATION_STATUS', 'CONFIRMED status is strictly forbidden', 500);
    }

    if (verification.verificationStatus === VERIFICATION_STATUSES.NOT_FOUND) {
      return db.runTransaction(async (tx) => {
        const intentSnap = await tx.get(intentRef);
        if (!snapExists(intentSnap)) {
          throw new PaymentSettlementError('INTENT_NOT_FOUND', `Payment intent not found: ${intentId}`, 404);
        }
        const current = snapData(intentSnap);
        const currentOrderId = current.orderId || intentId;
        if (current.status === PAYMENT_STATUSES.SETTLED) {
          return buildAlreadySettledResult(intentId, currentOrderId, current);
        }
        if (ACTIVE_STATUS_SET.has(current.status)) {
          const orderRef = db.collection('admin_orders').doc(currentOrderId);
          const orderSnap = await tx.get(orderRef);
          const nowIso = new Date(now()).toISOString();
          applyDualPatch(tx, intentRef, orderRef, orderSnap, current, {
            lastCheckedAt: nowIso,
            updatedAt: nowIso
          });
        }
        return {
          outcome: 'UNCHANGED',
          status: current.status,
          verificationStatus: VERIFICATION_STATUSES.NOT_FOUND,
          intentId,
          orderId: currentOrderId,
          txHash: current.txHash ?? null,
          confirmations: current.confirmations ?? 0,
          requiredConfirmations: verification.requiredConfirmations,
          reason: verification.reason ?? null
        };
      });
    }

    if (verification.verificationStatus === VERIFICATION_STATUSES.EXPIRED) {
      return expireIntentAtomically(intentRef, intentId);
    }

    if (verification.verificationStatus === VERIFICATION_STATUSES.PROCESSING) {
      const procUsedTxKey =
        verification.usedTxKey ||
        (verification.txHash ? buildUsedTxHashKey(verification.chainId, verification.txHash) : null);

      return db.runTransaction(async (tx) => {
        const intentSnap = await tx.get(intentRef);
        if (!snapExists(intentSnap)) {
          throw new PaymentSettlementError('INTENT_NOT_FOUND', `Payment intent not found: ${intentId}`, 404);
        }
        const current = snapData(intentSnap);
        const currentOrderId = current.orderId || intentId;
        if (current.status === PAYMENT_STATUSES.SETTLED) {
          return buildAlreadySettledResult(intentId, currentOrderId, current);
        }
        if (!ACTIVE_STATUS_SET.has(current.status)) {
          return {
            outcome: 'TERMINAL_UNCHANGED',
            status: current.status,
            intentId,
            orderId: currentOrderId,
            txHash: current.txHash ?? null
          };
        }

        assertVerificationMatchesIntentTerms(current, intent, verification, intentId);

        const orderRef = db.collection('admin_orders').doc(currentOrderId);
        const orderSnap = await tx.get(orderRef);

        if (procUsedTxKey) {
          const usedTxSnap = await tx.get(db.collection('usedTxHashes').doc(procUsedTxKey));
          if (snapExists(usedTxSnap)) {
            const usedData = snapData(usedTxSnap) || {};
            if (usedData.intentId !== intentId) {
              throw new PaymentSettlementError(
                'TX_HASH_ALREADY_USED',
                `Transaction hash '${procUsedTxKey}' has already been consumed by another payment intent`,
                409,
                { usedTxKey: procUsedTxKey, existingIntentId: usedData.intentId || null }
              );
            }
          }
        }

        const nowIso = new Date(now()).toISOString();
        const patch = {
          status: PAYMENT_STATUSES.PROCESSING,
          txHash: verification.txHash,
          confirmations: verification.confirmations,
          requiredConfirmations: verification.requiredConfirmations,
          receivedAmountAtomic: verification.receivedAmountAtomic,
          fromAddress: verification.fromAddress ?? null,
          lastCheckedAt: nowIso,
          updatedAt: nowIso
        };
        applyDualPatch(tx, intentRef, orderRef, orderSnap, current, patch);

        return {
          outcome: 'PROCESSING',
          status: PAYMENT_STATUSES.PROCESSING,
          verificationStatus: VERIFICATION_STATUSES.PROCESSING,
          intentId,
          orderId: currentOrderId,
          txHash: verification.txHash,
          confirmations: verification.confirmations,
          requiredConfirmations: verification.requiredConfirmations,
          receivedAmountAtomic: verification.receivedAmountAtomic,
          fromAddress: verification.fromAddress ?? null,
          reason: verification.reason ?? null
        };
      });
    }

    if (
      verification.verificationStatus === VERIFICATION_STATUSES.UNDERPAID ||
      verification.verificationStatus === VERIFICATION_STATUSES.FAILED
    ) {
      return db.runTransaction(async (tx) => {
        const intentSnap = await tx.get(intentRef);
        if (!snapExists(intentSnap)) {
          throw new PaymentSettlementError('INTENT_NOT_FOUND', `Payment intent not found: ${intentId}`, 404);
        }
        const current = snapData(intentSnap);
        const currentOrderId = current.orderId || intentId;
        if (current.status === PAYMENT_STATUSES.SETTLED) {
          return buildAlreadySettledResult(intentId, currentOrderId, current);
        }
        if (!ACTIVE_STATUS_SET.has(current.status)) {
          return {
            outcome: 'TERMINAL_UNCHANGED',
            status: current.status,
            intentId,
            orderId: currentOrderId,
            txHash: current.txHash ?? null
          };
        }

        assertVerificationMatchesIntentTerms(current, intent, verification, intentId);

        const orderRef = db.collection('admin_orders').doc(currentOrderId);
        const orderSnap = await tx.get(orderRef);

        const nowIso = new Date(now()).toISOString();
        const patch = {
          status: verification.verificationStatus,
          txHash: verification.txHash,
          confirmations: verification.confirmations,
          requiredConfirmations: verification.requiredConfirmations,
          receivedAmountAtomic: verification.receivedAmountAtomic,
          fromAddress: verification.fromAddress ?? null,
          lastCheckedAt: nowIso,
          updatedAt: nowIso
        };
        if (verification.verificationStatus === VERIFICATION_STATUSES.UNDERPAID) {
          patch.shortfallAtomic = verification.shortfallAtomic ?? null;
        } else {
          patch.failureReason = verification.reason ?? 'VERIFICATION_FAILED';
        }
        applyDualPatch(tx, intentRef, orderRef, orderSnap, current, patch);

        return {
          outcome: verification.verificationStatus,
          status: verification.verificationStatus,
          verificationStatus: verification.verificationStatus,
          intentId,
          orderId: currentOrderId,
          txHash: verification.txHash,
          confirmations: verification.confirmations,
          requiredConfirmations: verification.requiredConfirmations,
          receivedAmountAtomic: verification.receivedAmountAtomic,
          fromAddress: verification.fromAddress ?? null,
          ...(verification.verificationStatus === VERIFICATION_STATUSES.UNDERPAID
            ? { shortfallAtomic: patch.shortfallAtomic }
            : { failureReason: patch.failureReason }),
          reason: verification.reason ?? null
        };
      });
    }

    if (verification.verificationStatus !== VERIFICATION_STATUSES.READY_TO_SETTLE) {
      throw new PaymentSettlementError(
        'INVALID_VERIFICATION_STATUS',
        `Unsupported verificationStatus: ${verification.verificationStatus}`,
        500
      );
    }

    const usedTxKey = verification.usedTxKey || buildUsedTxHashKey(verification.chainId, verification.txHash);

    return db.runTransaction(async (tx) => {
      // PHASE 1: READ-ONLY (strictly before any write).
      const intentSnap = await tx.get(intentRef);
      if (!snapExists(intentSnap)) {
        throw new PaymentSettlementError('INTENT_NOT_FOUND', `Payment intent not found: ${intentId}`, 404);
      }
      const current = snapData(intentSnap);
      const currentOrderId = assertSafeId(current.orderId || intentId, 'INVALID_ORDER_ID', 'orderId');

      if (current.status === PAYMENT_STATUSES.SETTLED) {
        return buildAlreadySettledResult(intentId, currentOrderId, current);
      }
      if (!ACTIVE_STATUS_SET.has(current.status)) {
        throw new PaymentSettlementError(
          'INTENT_NOT_SETTLEABLE',
          `Payment intent '${intentId}' cannot be settled from status '${current.status}'`,
          409
        );
      }

      assertVerificationMatchesIntentTerms(current, intent, verification, intentId);

      const orderRef = db.collection('admin_orders').doc(currentOrderId);
      const usedTxRef = db.collection('usedTxHashes').doc(usedTxKey);
      const orderSnap = await tx.get(orderRef);
      const usedTxSnap = await tx.get(usedTxRef);

      if (snapExists(usedTxSnap)) {
        const usedData = snapData(usedTxSnap) || {};
        if (usedData.intentId !== intentId) {
          throw new PaymentSettlementError(
            'TX_HASH_ALREADY_USED',
            `Transaction hash '${usedTxKey}' has already been consumed by another payment intent`,
            409,
            { usedTxKey, existingIntentId: usedData.intentId || null }
          );
        }
      }

      const isMinerProduct = current.productType === 'miner';
      let activatedMinerId = null;
      let contractId = null;
      let minerRef = null;
      let contractRef = null;
      let minerSnap = null;
      let contractSnap = null;

      if (isMinerProduct) {
        activatedMinerId = buildActivatedMinerId(currentOrderId);
        contractId = buildContractId(currentOrderId);
        minerRef = db.collection('miners').doc(current.buyerUid).collection('miner').doc(activatedMinerId);
        contractRef = db.collection('admin_contracts').doc(contractId);
        minerSnap = await tx.get(minerRef);
        contractSnap = await tx.get(contractRef);
      }

      // PHASE 2: WRITE-ONLY (zero tx.get calls below).
      const settledAt = new Date(now()).toISOString();
      const existingOrder = snapExists(orderSnap) ? (snapData(orderSnap) || {}) : {};
      const efficiencyWattsPerTh =
        Number.isFinite(Number(current.efficiencyWattsPerTh)) && Number(current.efficiencyWattsPerTh) > 0
          ? Number(current.efficiencyWattsPerTh)
          : 15;
      const powerTh = Number(current.powerTh) || 0;
      const ownerWallet = verification.fromAddress ?? current.senderWallet ?? null;

      tx.set(usedTxRef, {
        usedTxKey,
        chainId: current.chainId,
        networkMode: current.networkMode,
        txHash: verification.txHash,
        intentId,
        orderId: currentOrderId,
        buyerUid: current.buyerUid,
        paymentNetwork: current.paymentNetwork,
        paymentAsset: current.paymentAsset,
        receivedAmountAtomic: verification.receivedAmountAtomic,
        settledAt
      });

      if (isMinerProduct) {
        if (!snapExists(minerSnap)) {
          tx.set(minerRef, {
            id: activatedMinerId,
            uid: current.buyerUid,
            userId: current.buyerUid,
            status: 'active',
            powerTh,
            efficiency: efficiencyWattsPerTh,
            efficiencyWattsPerTh,
            packageId: current.packageId,
            packageName: current.packageName,
            name: current.packageName,
            priceUsd: current.amountUsd,
            price: current.amountUsd,
            currency: 'USD',
            orderId: currentOrderId,
            intentId,
            paymentNetwork: current.paymentNetwork,
            paymentAsset: current.paymentAsset,
            networkMode: current.networkMode,
            txHash: verification.txHash,
            ownerWallet,
            createdAt: settledAt,
            activatedAt: settledAt,
            updatedAt: settledAt
          });
        }
        if (!snapExists(contractSnap)) {
          tx.set(contractRef, {
            id: contractId,
            contractId,
            orderId: currentOrderId,
            intentId,
            userId: current.buyerUid,
            userEmail: existingOrder.userEmail || '',
            activatedMinerId,
            packageId: current.packageId,
            packageName: current.packageName,
            powerTh,
            contractedTh: powerTh,
            allocatedTh: powerTh,
            efficiencyWattsPerTh,
            amountUsd: current.amountUsd,
            pricePaidUsdt: current.amountUsd,
            paymentNetwork: current.paymentNetwork,
            paymentAsset: current.paymentAsset,
            networkMode: current.networkMode,
            txHash: verification.txHash,
            ownerWallet,
            workerId: `worker_${activatedMinerId}`,
            status: 'ACTIVE',
            activatedAt: settledAt,
            createdAt: settledAt,
            updatedAt: settledAt
          });
        }
      }

      // Preserves productType, commissionEligible, netPaidUsdt, amountUsd, sponsorUid, and referralSnapshotLocked intact.
      const settledPatch = {
        status: PAYMENT_STATUSES.SETTLED,
        txHash: verification.txHash,
        usedTxKey,
        confirmations: verification.confirmations,
        requiredConfirmations: verification.requiredConfirmations,
        receivedAmountAtomic: verification.receivedAmountAtomic,
        fromAddress: verification.fromAddress ?? null,
        activatedMinerId,
        contractId,
        settledAt,
        lastCheckedAt: settledAt,
        updatedAt: settledAt
      };
      applyDualPatch(tx, intentRef, orderRef, orderSnap, current, settledPatch);

      return {
        outcome: 'SETTLED',
        status: PAYMENT_STATUSES.SETTLED,
        verificationStatus: VERIFICATION_STATUSES.READY_TO_SETTLE,
        intentId,
        orderId: currentOrderId,
        txHash: verification.txHash,
        usedTxKey,
        confirmations: verification.confirmations,
        requiredConfirmations: verification.requiredConfirmations,
        receivedAmountAtomic: verification.receivedAmountAtomic,
        fromAddress: verification.fromAddress ?? null,
        activatedMinerId,
        contractId,
        settledAt
      };
    });
  }

  return Object.freeze({
    processIntentVerificationAndSettlement
  });
}

module.exports = Object.freeze({
  PaymentSettlementError,
  SAFE_ID_PATTERN,
  buildActivatedMinerId,
  buildContractId,
  createPaymentSettlementService
});
