/**
 * SCRUM-275 / SCRUM-289 / SCRUM-278 (W03)
 * Server-Authoritative USDT Withdrawal Networks Configuration, Seed & Quote Engine.
 *
 * Enforces:
 * 1. Dynamic multi-network USDT configuration from `/withdrawalNetworks/{networkId}`.
 * 2. Fail-closed schema validation (`W03-NETCFG-422-INVALID_NETWORK_SCHEMA`).
 * 3. Canonical minimum withdrawal >= 10 USDT (`10,000,000` micro-USDT).
 * 4. Authoritative balance lookup from `/userBalances/{uid}` (Decision 1 Option A) with
 *    read-only fallback to `/users/{uid}` when `/userBalances/{uid}` is not yet initialized.
 * 5. Exact & MAX quote calculation (`POST /api/withdrawals/quote`) and address validation by `addressType`.
 */

import type { FirestoreLike } from './firebaseAdminAllowlistAdapter.js';
import type { WithdrawalClientPrincipal } from './withdrawalAuthzMiddleware.js';
import {
  CANONICAL_USDT_NETWORKS,
  MEMBERSHIP_TIERS,
  MIN_WITHDRAWAL_MICROS,
  MIN_WITHDRAWAL_USDT,
  USERS_COLLECTION,
  USER_BALANCES_COLLECTION,
  WITHDRAWAL_ADDRESS_TYPES,
  WITHDRAWAL_ASSET,
  WITHDRAWAL_NETWORKS_COLLECTION,
  WITHDRAWAL_NETWORK_CODES,
  WithdrawalModuleError,
  calculateMaxWithdrawableMicros,
  calculateWithdrawalQuote,
  formatWithdrawalFaultCode,
  isValidMicrosInteger,
  microsToUsdt,
  resolveMembershipSlaPolicy,
  usdtToMicros,
  validateDestinationAddress,
  type MembershipTier,
  type UserFinancialBalance,
  type WithdrawalAddressType,
  type WithdrawalConfigResponseDto,
  type WithdrawalNetworkCode,
  type WithdrawalNetworkConfig,
  type WithdrawalQuoteRequestDto,
  type WithdrawalQuoteResponseDto,
} from '../../src/types/withdrawal.js';

export interface WithdrawalNetworksServiceOptions {
  /** Strictly opt-in (default: false — fail-closed to Firestore `/withdrawalNetworks`, F-CRIT-01). */
  allowCanonicalFallbackWhenEmpty?: boolean;
  strictAddressRejection?: boolean;
}

const SAFE_FIRESTORE_DOC_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * F-MED-01: Validates a Firestore document ID before calling `.doc(id)`.
 * Rejects path separators (`/`), traversal segments (`.`, `..`), reserved `__*__` names,
 * whitespace, and oversized strings.
 */
export function isSafeFirestoreDocId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!SAFE_FIRESTORE_DOC_ID_REGEX.test(trimmed)) {
    return false;
  }
  if (/^__.*__$/.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * D1/D4: Maps real platform membership/subscription/package labels onto the 5 canonical
 * Withdrawal Engine tiers (`NONE | STANDARD | PRO | ELITE | WHALE`) without redesign.
 */
export function normalizePlatformMembershipTier(rawTier: unknown): MembershipTier {
  if (typeof rawTier !== 'string' || !rawTier.trim()) {
    return 'NONE';
  }
  const normalized = rawTier.trim().toUpperCase();
  if ((MEMBERSHIP_TIERS as readonly string[]).includes(normalized)) {
    return normalized as MembershipTier;
  }
  if (normalized === 'FREE') return 'NONE';
  if (
    normalized === 'STARTER' ||
    normalized === 'MONTHLY' ||
    normalized === 'SEMIANNUAL' ||
    normalized === 'ANNUAL' ||
    normalized === 'ACTIVE'
  ) {
    return 'STANDARD';
  }
  if (
    normalized === 'PLATINUM' ||
    normalized === 'PLATINUM+' ||
    normalized === 'VIP' ||
    normalized === 'MASTER'
  ) {
    return 'ELITE';
  }
  if (normalized === 'ENTERPRISE') {
    return 'WHALE';
  }
  return 'NONE';
}

/**
 * F-CRIT-03: Extracts the mirrored available balance from `/users/{uid}` in micro-USDT.
 * Returns `null` if `/users/{uid}` has no numeric balance field.
 */
export function extractUsersMirrorBalanceMicros(
  userData: Record<string, unknown> | undefined | null,
): number | null {
  if (!userData || typeof userData !== 'object') {
    return null;
  }
  if (typeof userData.balance === 'number' && Number.isFinite(userData.balance)) {
    if (userData.balance <= 0) {
      return 0;
    }
    return usdtToMicros(userData.balance.toFixed(6));
  }
  if (isValidMicrosInteger(userData.availableBalanceMicros)) {
    return userData.availableBalanceMicros;
  }
  return null;
}

/**
 * Validates and normalizes a raw `/withdrawalNetworks/{id}` Firestore document.
 * Fails closed (`W03-NETCFG-422-INVALID_NETWORK_SCHEMA`) if any required field is invalid.
 */
export function validateWithdrawalNetworkConfigDoc(
  id: string,
  raw: Record<string, unknown> | undefined | null,
): WithdrawalNetworkConfig {
  const cleanId = typeof id === 'string' ? id.trim() : '';
  if (!cleanId || !raw || typeof raw !== 'object') {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'INVALID_NETWORK_SCHEMA',
      httpStatus: 422,
      message: `Documento de red "${String(id)}" vacío o inválido.`,
    });
  }

  if (raw.asset !== WITHDRAWAL_ASSET) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'INVALID_NETWORK_ASSET',
      httpStatus: 422,
      message: `La red "${cleanId}" tiene activo "${String(raw.asset)}"; solo se permite "${WITHDRAWAL_ASSET}".`,
    });
  }

  const networkCode =
    typeof raw.networkCode === 'string' ? raw.networkCode.trim().toUpperCase() : '';
  if (!(WITHDRAWAL_NETWORK_CODES as readonly string[]).includes(networkCode)) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'INVALID_NETWORK_SCHEMA',
      httpStatus: 422,
      message: `La red "${cleanId}" tiene networkCode inválido: "${networkCode}".`,
    });
  }

  const addressType =
    typeof raw.addressType === 'string' ? raw.addressType.trim().toUpperCase() : '';
  if (!(WITHDRAWAL_ADDRESS_TYPES as readonly string[]).includes(addressType)) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'INVALID_NETWORK_SCHEMA',
      httpStatus: 422,
      message: `La red "${cleanId}" tiene addressType inválido: "${addressType}".`,
    });
  }

  const networkName = typeof raw.network === 'string' ? raw.network.trim() : '';
  const tokenStandard =
    typeof raw.tokenStandard === 'string' && raw.tokenStandard.trim()
      ? raw.tokenStandard.trim()
      : networkCode;
  const explorerTxUrlTemplate =
    typeof raw.explorerTxUrlTemplate === 'string' ? raw.explorerTxUrlTemplate.trim() : '';

  if (!networkName || !explorerTxUrlTemplate || !explorerTxUrlTemplate.includes('{txHash}')) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'INVALID_NETWORK_SCHEMA',
      httpStatus: 422,
      message: `La red "${cleanId}" carece de nombre o plantilla explorerTxUrlTemplate con "{txHash}".`,
    });
  }

  const minimumWithdrawalMicros = raw.minimumWithdrawalMicros;
  if (
    !isValidMicrosInteger(minimumWithdrawalMicros) ||
    minimumWithdrawalMicros < MIN_WITHDRAWAL_MICROS
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'INVALID_NETWORK_SCHEMA',
      httpStatus: 422,
      message: `La red "${cleanId}" tiene minimumWithdrawalMicros menor al mínimo canónico de 10 USDT (${MIN_WITHDRAWAL_MICROS}).`,
    });
  }

  const requiredConfirmations = raw.requiredConfirmations;
  if (
    typeof requiredConfirmations !== 'number' ||
    !Number.isSafeInteger(requiredConfirmations) ||
    requiredConfirmations < 1
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'INVALID_NETWORK_SCHEMA',
      httpStatus: 422,
      message: `La red "${cleanId}" debe especificar requiredConfirmations >= 1.`,
    });
  }

  const rawFeePolicy = raw.feePolicy as Record<string, unknown> | undefined;
  if (!rawFeePolicy || typeof rawFeePolicy !== 'object') {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'INVALID_NETWORK_SCHEMA',
      httpStatus: 422,
      message: `La red "${cleanId}" no contiene un bloque feePolicy válido.`,
    });
  }

  const networkFeeMicros = rawFeePolicy.networkFeeMicros;
  const platformFeeBps = rawFeePolicy.platformFeeBps;
  const platformFeeMinMicros = rawFeePolicy.platformFeeMinMicros ?? 0;
  const conversionFeeMicros = rawFeePolicy.conversionFeeMicros ?? 0;

  if (
    !isValidMicrosInteger(networkFeeMicros) ||
    typeof platformFeeBps !== 'number' ||
    !Number.isSafeInteger(platformFeeBps) ||
    platformFeeBps < 0 ||
    platformFeeBps > 5_000 ||
    !isValidMicrosInteger(platformFeeMinMicros) ||
    !isValidMicrosInteger(conversionFeeMicros)
  ) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'INVALID_NETWORK_SCHEMA',
      httpStatus: 422,
      message: `La red "${cleanId}" contiene valores inválidos en feePolicy.`,
    });
  }

  const configVersion =
    typeof raw.configVersion === 'number' &&
    Number.isSafeInteger(raw.configVersion) &&
    raw.configVersion >= 1
      ? raw.configVersion
      : 1;

  return {
    id: cleanId,
    asset: WITHDRAWAL_ASSET,
    networkCode: networkCode as WithdrawalNetworkCode,
    network: networkName,
    tokenStandard,
    enabled: Boolean(raw.enabled),
    minimumWithdrawalMicros,
    requiredConfirmations,
    explorerTxUrlTemplate,
    addressType: addressType as WithdrawalAddressType,
    feePolicy: {
      networkFeeMicros,
      platformFeeBps,
      platformFeeMinMicros,
      conversionFeeMicros,
    },
    configVersion,
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
        ? raw.updatedAt
        : '2026-11-18T00:00:00.000Z',
  };
}

/**
 * Seeds the canonical USDT networks into `/withdrawalNetworks/{id}` idempotently.
 */
export async function seedCanonicalUsdtNetworks(
  firestore: FirestoreLike | null | undefined,
): Promise<WithdrawalNetworkConfig[]> {
  if (!firestore) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'NETWORKS_FIRESTORE_UNAVAILABLE',
      httpStatus: 503,
      message: 'Firestore no está disponible para sembrar withdrawalNetworks.',
    });
  }

  const col = firestore.collection(WITHDRAWAL_NETWORKS_COLLECTION);
  const seeded: WithdrawalNetworkConfig[] = [];
  for (const net of CANONICAL_USDT_NETWORKS) {
    await col.doc(net.id).set({ ...net, feePolicy: { ...net.feePolicy } }, { merge: true });
    seeded.push(net);
  }
  return seeded;
}

/**
 * Reads all enabled USDT withdrawal networks from `/withdrawalNetworks`,
 * validating each enabled network document fail-closed.
 */
export async function listEnabledWithdrawalNetworks(
  firestore: FirestoreLike | null | undefined,
  options: WithdrawalNetworksServiceOptions = {},
): Promise<WithdrawalNetworkConfig[]> {
  if (!firestore) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'NETWORKS_FIRESTORE_UNAVAILABLE',
      httpStatus: 503,
      message: 'Firestore no está disponible para consultar withdrawalNetworks.',
    });
  }

  let snapshot;
  try {
    snapshot = await firestore.collection(WITHDRAWAL_NETWORKS_COLLECTION).get();
  } catch {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'NETWORKS_READ_FAILED',
      httpStatus: 503,
      message: 'Error al leer la colección withdrawalNetworks en Firestore.',
    });
  }

  if (!snapshot || snapshot.docs.length === 0) {
    if (options.allowCanonicalFallbackWhenEmpty === true) {
      return CANONICAL_USDT_NETWORKS.filter((n) => n.enabled).map((n) => ({
        ...n,
        feePolicy: { ...n.feePolicy },
      }));
    }
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'NO_ENABLED_USDT_NETWORKS',
      httpStatus: 503,
      message: 'No existen redes USDT habilitadas en withdrawalNetworks.',
    });
  }

  const enabledNetworks: WithdrawalNetworkConfig[] = [];
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    if (!data || data.enabled !== true) {
      continue;
    }
    const docId = docSnap.id || (typeof data.id === 'string' ? data.id : '');
    const validated = validateWithdrawalNetworkConfigDoc(docId, data);
    if (validated.enabled) {
      enabledNetworks.push(validated);
    }
  }

  if (enabledNetworks.length === 0) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'NO_ENABLED_USDT_NETWORKS',
      httpStatus: 503,
      message: 'Ninguna red USDT se encuentra habilitada actualmente.',
    });
  }

  return enabledNetworks;
}

/**
 * Resolves the user's authoritative balance from `/userBalances/{uid}` (Decision 1 Option A),
 * with safe read-only fallback to `/users/{uid}` when `/userBalances/{uid}` has not been created yet.
 */
export async function resolveAuthoritativeUserBalance(
  firestore: FirestoreLike | null | undefined,
  principal: Pick<WithdrawalClientPrincipal, 'uid' | 'email'>,
): Promise<UserFinancialBalance> {
  if (!firestore) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'BALANCE_FIRESTORE_UNAVAILABLE',
      httpStatus: 503,
      message: 'Firestore no está disponible para consultar el balance del usuario.',
    });
  }

  let balanceSnap;
  let userSnap;
  try {
    [balanceSnap, userSnap] = await Promise.all([
      firestore.collection(USER_BALANCES_COLLECTION).doc(principal.uid).get(),
      firestore.collection(USERS_COLLECTION).doc(principal.uid).get(),
    ]);
  } catch {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'NETCFG',
      code: 'BALANCE_READ_FAILED',
      httpStatus: 503,
      message: 'Error al consultar /userBalances o /users en Firestore.',
    });
  }

  const userData = userSnap && userSnap.exists ? userSnap.data() || {} : {};
  const usersMirrorMicros =
    userSnap && userSnap.exists ? extractUsersMirrorBalanceMicros(userData) : null;

  if (balanceSnap && balanceSnap.exists) {
    const data = balanceSnap.data() || {};
    const membershipTier = normalizePlatformMembershipTier(data.membershipTier);

    const rawAvailableBalanceMicros = isValidMicrosInteger(data.availableBalanceMicros)
      ? data.availableBalanceMicros
      : 0;
    // F-CRIT-03: Cap withdrawable available balance at min(/userBalances.available, /users.balance)
    // to prevent cross-domain overspend after a SCRUM-221 platform balance purchase.
    const availableBalanceMicros =
      usersMirrorMicros !== null
        ? Math.min(rawAvailableBalanceMicros, usersMirrorMicros)
        : rawAvailableBalanceMicros;
    const lockedBalanceMicros = isValidMicrosInteger(data.lockedBalanceMicros)
      ? data.lockedBalanceMicros
      : 0;
    const totalWithdrawnMicros = isValidMicrosInteger(data.totalWithdrawnMicros)
      ? data.totalWithdrawnMicros
      : 0;

    return {
      uid: principal.uid,
      email:
        typeof data.email === 'string' && data.email.trim()
          ? data.email.trim().toLowerCase()
          : principal.email,
      membershipTier,
      availableBalanceMicros,
      lockedBalanceMicros,
      totalWithdrawnMicros,
      version:
        typeof data.version === 'number' && Number.isSafeInteger(data.version) && data.version >= 1
          ? data.version
          : 1,
      updatedAt:
        typeof data.updatedAt === 'string' && data.updatedAt.trim()
          ? data.updatedAt
          : '2026-11-18T00:00:00.000Z',
    };
  }

  // Fallback to /users/{uid} read-only mirror if /userBalances/{uid} is not yet initialized
  const membershipTier = normalizePlatformMembershipTier(
    userData.membershipTier ?? userData.subscriptionTier,
  );
  const availableBalanceMicros = usersMirrorMicros ?? 0;

  return {
    uid: principal.uid,
    email: principal.email,
    membershipTier,
    availableBalanceMicros,
    lockedBalanceMicros: 0,
    totalWithdrawnMicros: 0,
    version: 1,
    updatedAt: '2026-11-18T00:00:00.000Z',
  };
}

/**
 * Builds the `GET /api/withdrawals/config` response payload.
 */
export async function getWithdrawalClientConfig(
  firestore: FirestoreLike | null | undefined,
  principal: Pick<WithdrawalClientPrincipal, 'uid' | 'email'>,
  options: WithdrawalNetworksServiceOptions = {},
): Promise<WithdrawalConfigResponseDto> {
  const [networks, balance] = await Promise.all([
    listEnabledWithdrawalNetworks(firestore, options),
    resolveAuthoritativeUserBalance(firestore, principal),
  ]);

  const slaPolicy = resolveMembershipSlaPolicy(balance.membershipTier);

  return {
    ok: true,
    asset: WITHDRAWAL_ASSET,
    minimumWithdrawalMicros: MIN_WITHDRAWAL_MICROS,
    minimumWithdrawalUsdt: MIN_WITHDRAWAL_USDT,
    networks,
    userBalance: {
      uid: balance.uid,
      availableBalanceMicros: balance.availableBalanceMicros,
      lockedBalanceMicros: balance.lockedBalanceMicros,
      totalWithdrawnMicros: balance.totalWithdrawnMicros,
      availableBalanceUsdt: microsToUsdt(balance.availableBalanceMicros),
      membershipTier: balance.membershipTier,
    },
    slaPolicy,
  };
}

/**
 * Computes an authoritative quote for `POST /api/withdrawals/quote`.
 * Supports both `EXACT_AMOUNT` and `MAX_AVAILABLE` modes and optional address format validation.
 */
export async function computeAuthoritativeWithdrawalQuote(
  firestore: FirestoreLike | null | undefined,
  principal: Pick<WithdrawalClientPrincipal, 'uid' | 'email'>,
  dto: WithdrawalQuoteRequestDto,
  options: WithdrawalNetworksServiceOptions = {},
): Promise<WithdrawalQuoteResponseDto> {
  if (!dto || typeof dto !== 'object') {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'QUOTE',
      code: 'INVALID_QUOTE_REQUEST',
      httpStatus: 400,
      message: 'El cuerpo de la solicitud de cotización es obligatorio.',
    });
  }

  const networkId = typeof dto.networkId === 'string' ? dto.networkId.trim() : '';
  if (!networkId) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'QUOTE',
      code: 'NETWORK_ID_REQUIRED',
      httpStatus: 400,
      message: 'Debe especificar networkId para cotizar el retiro.',
    });
  }
  if (!isSafeFirestoreDocId(networkId)) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'QUOTE',
      code: 'INVALID_NETWORK_ID',
      httpStatus: 400,
      message: 'El identificador networkId contiene caracteres no permitidos.',
    });
  }

  const [networks, balance] = await Promise.all([
    listEnabledWithdrawalNetworks(firestore, options),
    resolveAuthoritativeUserBalance(firestore, principal),
  ]);

  // F-CRIT-01: Strict document ID match only (no networkCode alias fallback)
  const networkConfig = networks.find((n) => n.id === networkId);
  if (!networkConfig) {
    throw new WithdrawalModuleError({
      originTask: 'W03',
      originModule: 'QUOTE',
      code: 'NETWORK_NOT_ENABLED',
      httpStatus: 404,
      message: `La red "${networkId}" no existe o no está habilitada para retiros USDT.`,
    });
  }

  const mode = dto.mode === 'MAX_AVAILABLE' ? 'MAX_AVAILABLE' : 'EXACT_AMOUNT';
  let quote: WithdrawalQuoteResponseDto;

  if (mode === 'MAX_AVAILABLE') {
    quote = calculateMaxWithdrawableMicros(balance.availableBalanceMicros, networkConfig);
  } else {
    if (!isValidMicrosInteger(dto.requestedAmountMicros)) {
      throw new WithdrawalModuleError({
        originTask: 'W03',
        originModule: 'QUOTE',
        code: 'INVALID_QUOTE_AMOUNT',
        httpStatus: 400,
        message: 'requestedAmountMicros debe ser un entero no negativo en micro-USDT.',
      });
    }
    quote = calculateWithdrawalQuote(
      dto.requestedAmountMicros,
      networkConfig,
      balance.availableBalanceMicros,
    );
  }

  const slaPolicy = resolveMembershipSlaPolicy(balance.membershipTier);
  let addressValidation: WithdrawalQuoteResponseDto['addressValidation'];
  let validationMessage = quote.validationMessage;
  let validationFaultCode = quote.validationFaultCode;

  if (typeof dto.destinationAddress === 'string' && dto.destinationAddress.trim().length > 0) {
    addressValidation = validateDestinationAddress(
      dto.destinationAddress,
      networkConfig.addressType,
    );
    if (!addressValidation.valid) {
      if (options.strictAddressRejection) {
        throw new WithdrawalModuleError({
          originTask: 'W03',
          originModule: 'QUOTE',
          code: 'INVALID_DESTINATION_ADDRESS',
          httpStatus: 422,
          message: addressValidation.reason || 'Dirección de destino inválida.',
        });
      }
      if (!validationMessage) {
        validationMessage = addressValidation.reason;
      }
      if (!validationFaultCode) {
        validationFaultCode = formatWithdrawalFaultCode(
          'W03',
          'QUOTE',
          'INVALID_DESTINATION_ADDRESS',
          422,
        );
      }
    }
  }

  return {
    ...quote,
    availableBalanceMicros: balance.availableBalanceMicros,
    slaPolicy,
    ...(addressValidation ? { addressValidation } : {}),
    ...(validationMessage ? { validationMessage } : {}),
    ...(validationFaultCode ? { validationFaultCode } : {}),
  };
}
