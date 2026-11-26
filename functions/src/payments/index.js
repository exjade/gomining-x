'use strict';

const paymentConfig = require('./paymentConfig');
const paymentIntentService = require('./paymentIntentService');
const evmVerifier = require('./evmVerifier');
const solanaVerifier = require('./solanaVerifier');
const tronVerifier = require('./tronVerifier');
const onChainVerifier = require('./onChainVerifier');
const paymentSettlementService = require('./paymentSettlementService');
const paymentReconciler = require('./paymentReconciler');

const { PaymentConfigError } = paymentConfig;
const { PaymentIntentError, createPaymentIntentService } = paymentIntentService;
const { EvmVerifierError } = evmVerifier;
const { SolanaVerifierError } = solanaVerifier;
const { TronVerifierError } = tronVerifier;
const { OnChainVerifierError, createOnChainVerifier } = onChainVerifier;
const { PaymentSettlementError, createPaymentSettlementService } = paymentSettlementService;
const { createPaymentReconciler } = paymentReconciler;

function loadOptionalSdk(moduleName) {
  try {
    return require(moduleName);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      return null;
    }
    throw err;
  }
}

const httpsV2 = loadOptionalSdk('firebase-functions/v2/https');
const schedulerV2 = loadOptionalSdk('firebase-functions/v2/scheduler');

const onCall = httpsV2 && typeof httpsV2.onCall === 'function'
  ? httpsV2.onCall
  : (_options, handler) => handler;
const onSchedule = schedulerV2 && typeof schedulerV2.onSchedule === 'function'
  ? schedulerV2.onSchedule
  : (_options, handler) => handler;

const HTTPS_ERROR_MARKER = Symbol('PaymentHttpsError');

function createHttpsError(code, message, details) {
  let err;
  if (httpsV2 && typeof httpsV2.HttpsError === 'function') {
    err = details !== undefined
      ? new httpsV2.HttpsError(code, message, details)
      : new httpsV2.HttpsError(code, message);
  } else {
    err = new Error(message);
    err.code = code;
    if (details !== undefined) {
      err.details = details;
    }
  }
  err[HTTPS_ERROR_MARKER] = true;
  return err;
}

function snapExists(snap) {
  if (!snap) return false;
  return typeof snap.exists === 'function' ? Boolean(snap.exists()) : Boolean(snap.exists);
}

function snapData(snap) {
  if (!snap) return undefined;
  return typeof snap.data === 'function' ? snap.data() : snap.data;
}

function requireAuthenticatedUid(request) {
  const uid = request && request.auth && typeof request.auth.uid === 'string'
    ? request.auth.uid.trim()
    : '';
  if (!uid) {
    throw createHttpsError('unauthenticated', 'Authentication required');
  }
  return uid;
}

function assertRequestDataObject(request) {
  const data = request && request.data !== undefined && request.data !== null ? request.data : {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw createHttpsError('invalid-argument', 'Request payload must be a plain object');
  }
  return data;
}

async function resolveIsAdmin(db, uid, token) {
  const cleanUid = typeof uid === 'string' ? uid.trim() : '';
  if (!cleanUid) {
    return false;
  }
  if (token && token.admin === true) {
    return true;
  }
  if (!db || typeof db.collection !== 'function') {
    return false;
  }
  const snap = await db.collection('admin_users').doc(cleanUid).get();
  if (!snapExists(snap)) {
    return false;
  }
  const data = snapData(snap) || {};
  return (
    data.status === 'ACTIVE' &&
    typeof data.role === 'string' &&
    data.role.trim().toLowerCase() === 'admin'
  );
}

function isDomainError(err) {
  return (
    err instanceof PaymentConfigError ||
    err instanceof PaymentIntentError ||
    err instanceof OnChainVerifierError ||
    err instanceof PaymentSettlementError ||
    err instanceof EvmVerifierError ||
    err instanceof SolanaVerifierError ||
    err instanceof TronVerifierError
  );
}

function mapToHttpsError(err) {
  if (
    (err && err[HTTPS_ERROR_MARKER]) ||
    (httpsV2 && typeof httpsV2.HttpsError === 'function' && err instanceof httpsV2.HttpsError)
  ) {
    return err;
  }

  if (isDomainError(err)) {
    const details = { reasonCode: err.code };
    switch (err.statusCode) {
      case 401:
        return createHttpsError('unauthenticated', err.message, details);
      case 403:
        return createHttpsError('permission-denied', err.message, details);
      case 404:
        return createHttpsError('not-found', err.message, details);
      case 409:
        return createHttpsError(
          err.code === 'TX_HASH_ALREADY_USED' ? 'already-exists' : 'failed-precondition',
          err.message,
          details
        );
      case 400:
        return createHttpsError('invalid-argument', err.message, details);
      case 502:
      case 503:
        return createHttpsError('unavailable', 'Payment verification service temporarily unavailable', details);
      default:
        return createHttpsError('internal', 'Internal payment service error', details);
    }
  }

  return createHttpsError('internal', 'Internal payment service error');
}

function getDefaultDb() {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

function createPaymentHandlers({
  db,
  env = process.env,
  now = () => Date.now(),
  fetchImpl = globalThis.fetch,
  spotPriceProvider,
  idGenerator,
  logger = console
} = {}) {
  const intentService = createPaymentIntentService({
    db,
    env,
    now,
    spotPriceProvider,
    idGenerator,
    fetchImpl
  });
  const verifier = createOnChainVerifier({ db, env, now, fetchImpl });
  const settlementService = createPaymentSettlementService({
    db,
    env,
    now,
    fetchImpl,
    onChainVerifier: verifier
  });
  const reconciler = createPaymentReconciler({
    db,
    settlementService,
    now,
    logger
  });

  async function handleCreatePaymentIntent(request) {
    try {
      const uid = requireAuthenticatedUid(request);
      const data = assertRequestDataObject(request);
      return await intentService.createPaymentIntent({
        ...data,
        buyerUid: uid
      });
    } catch (err) {
      throw mapToHttpsError(err);
    }
  }

  async function handleSelectPaymentMethod(request) {
    try {
      const uid = requireAuthenticatedUid(request);
      const data = assertRequestDataObject(request);
      const isAdmin = await resolveIsAdmin(db, uid, request.auth && request.auth.token);
      return await intentService.selectPaymentMethod({
        ...data,
        requesterUid: uid,
        isAdmin
      });
    } catch (err) {
      throw mapToHttpsError(err);
    }
  }

  async function handleGetPaymentIntent(request) {
    try {
      const uid = requireAuthenticatedUid(request);
      const data = assertRequestDataObject(request);
      const isAdmin = await resolveIsAdmin(db, uid, request.auth && request.auth.token);
      return await intentService.getPaymentIntent({
        intentId: data.intentId,
        requesterUid: uid,
        isAdmin
      });
    } catch (err) {
      throw mapToHttpsError(err);
    }
  }

  async function handleCancelPaymentIntent(request) {
    try {
      const uid = requireAuthenticatedUid(request);
      const data = assertRequestDataObject(request);
      const isAdmin = await resolveIsAdmin(db, uid, request.auth && request.auth.token);
      return await intentService.cancelPaymentIntent({
        intentId: data.intentId,
        reason: data.reason,
        requesterUid: uid,
        isAdmin
      });
    } catch (err) {
      throw mapToHttpsError(err);
    }
  }

  async function handleConfirmPaymentIntent(request) {
    try {
      const uid = requireAuthenticatedUid(request);
      const data = assertRequestDataObject(request);
      const isAdmin = await resolveIsAdmin(db, uid, request.auth && request.auth.token);
      return await settlementService.processIntentVerificationAndSettlement({
        intentId: data.intentId,
        txHash: data.txHash,
        requesterUid: uid,
        isAdmin
      });
    } catch (err) {
      throw mapToHttpsError(err);
    }
  }

  async function handleReconcilePendingPayments(options = {}) {
    return reconciler.reconcilePendingPayments(options);
  }

  return Object.freeze({
    handleCreatePaymentIntent,
    handleSelectPaymentMethod,
    handleGetPaymentIntent,
    handleCancelPaymentIntent,
    handleConfirmPaymentIntent,
    handleReconcilePendingPayments
  });
}

function getDefaultHandlers() {
  return createPaymentHandlers({ db: getDefaultDb() });
}

const createPaymentIntent = onCall({ cors: true }, async (request) =>
  getDefaultHandlers().handleCreatePaymentIntent(request)
);

const selectPaymentMethod = onCall({ cors: true }, async (request) =>
  getDefaultHandlers().handleSelectPaymentMethod(request)
);

const getPaymentIntent = onCall({ cors: true }, async (request) =>
  getDefaultHandlers().handleGetPaymentIntent(request)
);

const cancelPaymentIntent = onCall({ cors: true }, async (request) =>
  getDefaultHandlers().handleCancelPaymentIntent(request)
);

const confirmPaymentIntent = onCall({ cors: true }, async (request) =>
  getDefaultHandlers().handleConfirmPaymentIntent(request)
);

const reconcilePendingPayments = onSchedule(
  { schedule: 'every 1 minutes', timeZone: 'UTC' },
  async () => getDefaultHandlers().handleReconcilePendingPayments()
);

module.exports = Object.freeze({
  createPaymentIntent,
  selectPaymentMethod,
  getPaymentIntent,
  cancelPaymentIntent,
  confirmPaymentIntent,
  reconcilePendingPayments,
  resolveIsAdmin,
  mapToHttpsError,
  createPaymentHandlers,
  paymentConfig,
  paymentIntentService,
  onChainVerifier,
  paymentSettlementService,
  paymentReconciler
});
