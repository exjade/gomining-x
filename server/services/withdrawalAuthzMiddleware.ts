/**
 * SCRUM-275 / SCRUM-289 / SCRUM-277 (W02)
 * Server-Authoritative Authentication & Granular RBAC Middleware for USDT Withdrawals.
 *
 * Enforces Zero-Trust & Fail-Closed guarantees + Traceable Fault Codes (`W02-AUTHZ-*`):
 * 1. Verifies Firebase Bearer ID Token via FirebaseAdminAuthAdapter (401 on missing/invalid, 503 if runtime down).
 * 2. Blocks anonymous Firebase sessions (403 ANONYMOUS_AUTH_FORBIDDEN).
 * 3. Enforces strict UID ownership on client endpoints (403 FORBIDDEN_CROSS_UID_ACCESS).
 * 4. Verifies Admin identity against `/admin_users/{uid}` in Firestore and requires explicit
 *    granular `withdrawals.*` permission in `permissions` array (403 FORBIDDEN_WITHDRAWAL_PERMISSION).
 * 5. Never trusts client headers (`x-admin-role`, `x-admin-permissions`), body fields, or `SUPER_ADMIN` wildcards.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { FirebaseAdminAuthAdapter } from './firebaseAdminAuthAdapter.js';
import type { FirestoreLike } from './firebaseAdminAllowlistAdapter.js';
import {
  ADMIN_USERS_COLLECTION,
  REQUIRED_PERMISSION_BY_AUDIT_ACTION,
  WITHDRAWAL_ADMIN_PERMISSIONS,
  formatWithdrawalFaultCode,
  hasWithdrawalPermission,
  type WithdrawalAdminPermission,
  type WithdrawalAuditAction,
} from '../../src/types/withdrawal.js';

export interface DecodedWithdrawalTokenLike {
  uid: string;
  email?: string | null;
  email_verified?: boolean;
  firebase?: {
    sign_in_provider?: string;
  };
  [key: string]: unknown;
}

export interface WithdrawalClientPrincipal {
  uid: string;
  email: string;
  emailVerified: boolean;
  signInProvider: string;
}

export interface WithdrawalAdminPrincipal {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin';
  permissions: readonly WithdrawalAdminPermission[];
}

declare global {
  namespace Express {
    interface Request {
      withdrawalClient?: WithdrawalClientPrincipal;
      withdrawalAdmin?: WithdrawalAdminPrincipal;
    }
  }
}

export type ClientWithdrawalAuthDecision =
  | { ok: true; status: 200; principal: WithdrawalClientPrincipal }
  | {
      ok: false;
      status: 401 | 403 | 503;
      code: string;
      faultCode: string;
      originTask: 'W02';
      originModule: 'AUTHZ';
      error: string;
    };

export type AdminWithdrawalAuthDecision =
  | { ok: true; status: 200; principal: WithdrawalAdminPrincipal }
  | {
      ok: false;
      status: 401 | 403 | 503;
      code: string;
      faultCode: string;
      originTask: 'W02';
      originModule: 'AUTHZ';
      error: string;
      requiredPermission?: WithdrawalAdminPermission;
    };

export interface WithdrawalAuthzDependencies {
  authAdapter?: Pick<FirebaseAdminAuthAdapter, 'isInitialized' | 'verifyIdToken' | 'getApp'>;
  firestore?: FirestoreLike | null;
}

const REVOKED_ADMIN_STATUSES = new Set(['SUSPENDED', 'DISABLED', 'REVOKED', 'INACTIVE']);

export function extractBearerToken(authorizationHeader: unknown): string | null {
  if (typeof authorizationHeader !== 'string') {
    return null;
  }
  const trimmed = authorizationHeader.trim();
  const match = /^Bearer\s+([^\s]+)$/i.exec(trimmed);
  if (!match || !match[1]) {
    return null;
  }
  return match[1].trim();
}

async function resolveDefaultAuthAdapter(): Promise<
  Pick<FirebaseAdminAuthAdapter, 'isInitialized' | 'verifyIdToken' | 'getApp'> | null
> {
  try {
    const mod = await import('./firebaseAdminAuthAdapter.js');
    return mod.firebaseAdminAuthAdapter;
  } catch {
    return null;
  }
}

async function resolveFirestore(
  deps: WithdrawalAuthzDependencies,
  authAdapter: Pick<FirebaseAdminAuthAdapter, 'isInitialized' | 'verifyIdToken' | 'getApp'> | null,
): Promise<FirestoreLike | null> {
  if (deps.firestore !== undefined) {
    return deps.firestore;
  }
  if (!authAdapter || !authAdapter.isInitialized()) {
    return null;
  }
  const app = authAdapter.getApp();
  if (!app) {
    return null;
  }
  try {
    const firestoreMod = await import('firebase-admin/firestore');
    return firestoreMod.getFirestore(app) as unknown as FirestoreLike;
  } catch {
    return null;
  }
}

function extractExplicitWithdrawalPermissions(
  rawPermissions: unknown,
): WithdrawalAdminPermission[] {
  if (!Array.isArray(rawPermissions)) {
    return [];
  }
  const validSet = new Set<WithdrawalAdminPermission>();
  for (const item of rawPermissions) {
    if (
      typeof item === 'string' &&
      (WITHDRAWAL_ADMIN_PERMISSIONS as readonly string[]).includes(item.trim())
    ) {
      validSet.add(item.trim() as WithdrawalAdminPermission);
    }
  }
  return Array.from(validSet);
}

/**
 * Verifies a client Bearer token and blocks anonymous sessions fail-closed.
 */
export async function resolveClientWithdrawalPrincipal(
  authorizationHeader: unknown,
  deps: WithdrawalAuthzDependencies = {},
): Promise<ClientWithdrawalAuthDecision> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    const code = 'UNAUTHENTICATED';
    return {
      ok: false,
      status: 401,
      code,
      faultCode: formatWithdrawalFaultCode('W02', 'AUTHZ', code, 401),
      originTask: 'W02',
      originModule: 'AUTHZ',
      error: 'Se requiere encabezado Authorization: Bearer <idToken>.',
    };
  }

  const authAdapter = deps.authAdapter ?? (await resolveDefaultAuthAdapter());
  if (!authAdapter || !authAdapter.isInitialized()) {
    const code = 'AUTH_RUNTIME_UNAVAILABLE';
    return {
      ok: false,
      status: 503,
      code,
      faultCode: formatWithdrawalFaultCode('W02', 'AUTHZ', code, 503),
      originTask: 'W02',
      originModule: 'AUTHZ',
      error: 'El servicio de verificación de identidad no está disponible. Acceso cerrado (fail-closed).',
    };
  }

  const decoded = (await authAdapter.verifyIdToken(token)) as DecodedWithdrawalTokenLike | null;
  if (!decoded || typeof decoded.uid !== 'string' || !decoded.uid.trim()) {
    const code = 'INVALID_AUTH_TOKEN';
    return {
      ok: false,
      status: 401,
      code,
      faultCode: formatWithdrawalFaultCode('W02', 'AUTHZ', code, 401),
      originTask: 'W02',
      originModule: 'AUTHZ',
      error: 'El token de autenticación es inválido o ha expirado.',
    };
  }

  const signInProvider =
    typeof decoded.firebase?.sign_in_provider === 'string'
      ? decoded.firebase.sign_in_provider
      : 'custom';
  if (signInProvider === 'anonymous') {
    const code = 'ANONYMOUS_AUTH_FORBIDDEN';
    return {
      ok: false,
      status: 403,
      code,
      faultCode: formatWithdrawalFaultCode('W02', 'AUTHZ', code, 403),
      originTask: 'W02',
      originModule: 'AUTHZ',
      error: 'Las sesiones anónimas no están autorizadas para operar en el módulo de retiros.',
    };
  }

  const email = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : '';
  return {
    ok: true,
    status: 200,
    principal: {
      uid: decoded.uid.trim(),
      email,
      emailVerified: decoded.email_verified === true,
      signInProvider,
    },
  };
}

/**
 * Enforces strict UID isolation on client withdrawal resources.
 */
export function assertClientWithdrawalOwnership(
  authenticatedUid: string,
  resourceUserId: string,
): {
  allowed: boolean;
  status: 200 | 403;
  code?: string;
  faultCode?: string;
  originTask?: 'W02';
  originModule?: 'AUTHZ';
  error?: string;
} {
  const cleanAuthUid = typeof authenticatedUid === 'string' ? authenticatedUid.trim() : '';
  const cleanResourceUid = typeof resourceUserId === 'string' ? resourceUserId.trim() : '';
  if (!cleanAuthUid || !cleanResourceUid || cleanAuthUid !== cleanResourceUid) {
    const code = 'FORBIDDEN_CROSS_UID_ACCESS';
    return {
      allowed: false,
      status: 403,
      code,
      faultCode: formatWithdrawalFaultCode('W02', 'AUTHZ', code, 403),
      originTask: 'W02',
      originModule: 'AUTHZ',
      error: 'Acceso denegado: no puede consultar ni operar sobre recursos de otro usuario.',
    };
  }
  return { allowed: true, status: 200 };
}

/**
 * Verifies an admin Bearer token, validates `/admin_users/{uid}` in Firestore,
 * and enforces the required granular `withdrawals.*` permission fail-closed.
 */
export async function resolveAdminWithdrawalPrincipal(
  authorizationHeader: unknown,
  requiredPermission: WithdrawalAdminPermission,
  deps: WithdrawalAuthzDependencies = {},
): Promise<AdminWithdrawalAuthDecision> {
  const clientDecision = await resolveClientWithdrawalPrincipal(authorizationHeader, deps);
  if (!clientDecision.ok) {
    return clientDecision;
  }

  const { uid, email: tokenEmail } = clientDecision.principal;
  const authAdapter = deps.authAdapter ?? (await resolveDefaultAuthAdapter());
  const firestore = await resolveFirestore(deps, authAdapter);
  if (!firestore) {
    const code = 'ADMIN_ALLOWLIST_UNAVAILABLE';
    return {
      ok: false,
      status: 503,
      code,
      faultCode: formatWithdrawalFaultCode('W02', 'AUTHZ', code, 503),
      originTask: 'W02',
      originModule: 'AUTHZ',
      error: 'Firestore de autorizaciones administrativas no disponible. Acceso cerrado (fail-closed).',
    };
  }

  let docSnapshot;
  try {
    docSnapshot = await firestore.collection(ADMIN_USERS_COLLECTION).doc(uid).get();
  } catch {
    const code = 'ADMIN_ALLOWLIST_READ_FAILED';
    return {
      ok: false,
      status: 503,
      code,
      faultCode: formatWithdrawalFaultCode('W02', 'AUTHZ', code, 503),
      originTask: 'W02',
      originModule: 'AUTHZ',
      error: 'Error al consultar la colección admin_users. Acceso cerrado (fail-closed).',
    };
  }

  if (!docSnapshot || !docSnapshot.exists) {
    const code = 'FORBIDDEN_NOT_ADMIN';
    return {
      ok: false,
      status: 403,
      code,
      faultCode: formatWithdrawalFaultCode('W02', 'AUTHZ', code, 403),
      originTask: 'W02',
      originModule: 'AUTHZ',
      error: 'El usuario autenticado no figura en el registro autoritativo /admin_users.',
    };
  }

  const data = docSnapshot.data() || {};
  const role = typeof data.role === 'string' ? data.role.trim().toLowerCase() : '';
  const status = typeof data.status === 'string' ? data.status.trim().toUpperCase() : 'ACTIVE';
  const storedBindings = [data.uid, data.firebaseAuthUid]
    .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
    .map((v) => v.trim());

  if (
    role !== 'admin' ||
    REVOKED_ADMIN_STATUSES.has(status) ||
    storedBindings.some((binding) => binding !== uid)
  ) {
    const code = 'FORBIDDEN_NOT_ADMIN';
    return {
      ok: false,
      status: 403,
      code,
      faultCode: formatWithdrawalFaultCode('W02', 'AUTHZ', code, 403),
      originTask: 'W02',
      originModule: 'AUTHZ',
      error: 'La cuenta administrativa no está activa o su rol/UID no es válido.',
    };
  }

  const rawPerms = Array.isArray(data.permissions)
    ? data.permissions
    : Array.isArray(data.withdrawalPermissions)
      ? data.withdrawalPermissions
      : [];
  const permissions = extractExplicitWithdrawalPermissions(rawPerms);

  if (!hasWithdrawalPermission(permissions, requiredPermission)) {
    const code = 'FORBIDDEN_WITHDRAWAL_PERMISSION';
    return {
      ok: false,
      status: 403,
      code,
      faultCode: formatWithdrawalFaultCode('W02', 'AUTHZ', code, 403),
      originTask: 'W02',
      originModule: 'AUTHZ',
      error: `El operador administrativo carece del permiso granular requerido: "${requiredPermission}".`,
      requiredPermission,
    };
  }

  const storedEmail = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const resolvedEmail = tokenEmail || storedEmail;
  const displayName =
    (typeof data.displayName === 'string' && data.displayName.trim()) ||
    (typeof data.fullName === 'string' && data.fullName.trim()) ||
    resolvedEmail ||
    uid;

  return {
    ok: true,
    status: 200,
    principal: {
      uid,
      email: resolvedEmail,
      displayName,
      role: 'admin',
      permissions,
    },
  };
}

/**
 * Express middleware for client withdrawal endpoints (`/api/withdrawals/*`).
 */
export function requireWithdrawalClientAuth(
  deps: WithdrawalAuthzDependencies = {},
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const decision = await resolveClientWithdrawalPrincipal(req.headers.authorization, deps);
    if (!decision.ok) {
      res.status(decision.status).json({
        ok: false,
        code: decision.code,
        faultCode: decision.faultCode,
        originTask: decision.originTask,
        originModule: decision.originModule,
        error: decision.error,
      });
      return;
    }
    req.withdrawalClient = decision.principal;
    next();
  };
}

/**
 * Express middleware for admin withdrawal endpoints (`/api/admin/withdrawals/*`)
 * requiring a specific granular `withdrawals.*` permission.
 */
export function requireWithdrawalAdminPermission(
  requiredPermission: WithdrawalAdminPermission,
  deps: WithdrawalAuthzDependencies = {},
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const decision = await resolveAdminWithdrawalPrincipal(
      req.headers.authorization,
      requiredPermission,
      deps,
    );
    if (!decision.ok) {
      res.status(decision.status).json({
        ok: false,
        code: decision.code,
        faultCode: decision.faultCode,
        originTask: decision.originTask,
        originModule: decision.originModule,
        error: decision.error,
        ...(decision.requiredPermission
          ? { requiredPermission: decision.requiredPermission }
          : {}),
      });
      return;
    }
    req.withdrawalAdmin = decision.principal;
    next();
  };
}

/**
 * Express middleware mapping a canonical audit action (`REVIEW`, `EDIT`, `APPROVE`,
 * `REJECT`, `CANCEL`, `PROCESS`, `BROADCAST`, `COMPLETE`) to its required `withdrawals.*` permission.
 */
export function requireWithdrawalAuditActionPermission(
  action: Exclude<WithdrawalAuditAction, 'CREATE'>,
  deps: WithdrawalAuthzDependencies = {},
): RequestHandler {
  const requiredPermission = REQUIRED_PERMISSION_BY_AUDIT_ACTION[action];
  return requireWithdrawalAdminPermission(requiredPermission, deps);
}
