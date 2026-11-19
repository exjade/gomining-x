/**
 * SCRUM-275 / SCRUM-289 / SCRUM-285 (W10)
 * Isolated Express Router for Immutable Financial Ledger & Forensic Audit Timeline:
 * - `GET /:withdrawalId/audit` (mounted under `/api/admin/withdrawals`)
 *
 * Protected strictly by `requireWithdrawalAdminPermission('withdrawals.audit')` (W02).
 * Emits traceable fault codes (`W10-AUDIT-*`, `W02-AUTHZ-*`).
 */

import { Router, type Request, type Response } from 'express';
import type { FirebaseAdminAuthAdapter } from './firebaseAdminAuthAdapter.js';
import type { FirestoreLike } from './firebaseAdminAllowlistAdapter.js';
import {
  requireWithdrawalAdminPermission,
  type WithdrawalAuthzDependencies,
} from './withdrawalAuthzMiddleware.js';
import {
  getAdminWithdrawalAuditTimeline,
  type AdminWithdrawalAuditOptions,
} from './adminWithdrawalAuditService.js';
import {
  formatWithdrawalFaultCode,
  isWithdrawalModuleError,
} from '../../src/types/withdrawal.js';

export interface AdminWithdrawalAuditRouterDependencies
  extends WithdrawalAuthzDependencies {
  firestore?: FirestoreLike | null;
  auditOptions?: AdminWithdrawalAuditOptions;
}

async function resolveDefaultAuditFirestore(
  deps: AdminWithdrawalAuditRouterDependencies,
): Promise<FirestoreLike | null> {
  if (deps.firestore !== undefined) {
    return deps.firestore;
  }
  try {
    const authMod = await import('./firebaseAdminAuthAdapter.js');
    const authAdapter: Pick<FirebaseAdminAuthAdapter, 'isInitialized' | 'getApp'> =
      deps.authAdapter ?? authMod.firebaseAdminAuthAdapter;
    if (!authAdapter.isInitialized()) {
      return null;
    }
    const app = authAdapter.getApp();
    if (!app) {
      return null;
    }
    const firestoreMod = await import('firebase-admin/firestore');
    return firestoreMod.getFirestore(app) as unknown as FirestoreLike;
  } catch {
    return null;
  }
}

function sendAuditFaultResponse(res: Response, error: unknown): void {
  if (isWithdrawalModuleError(error)) {
    const status = error.httpStatus ?? 400;
    res.status(status).json({
      ok: false,
      code: error.code,
      faultCode: error.faultCode,
      originTask: error.originTask,
      originModule: error.originModule,
      error: error.message,
    });
    return;
  }

  const code = 'AUDIT_FETCH_FAILED';
  const faultCode = formatWithdrawalFaultCode('W10', 'AUDIT', code, 503);
  res.status(503).json({
    ok: false,
    code,
    faultCode,
    originTask: 'W10',
    originModule: 'AUDIT',
    error: `[${faultCode}] ${code}: Error interno consultando la línea de tiempo forense.`,
  });
}

export function createAdminWithdrawalAuditRouter(
  deps: AdminWithdrawalAuditRouterDependencies = {},
): Router {
  const router = Router();
  const auditGuard = requireWithdrawalAdminPermission('withdrawals.audit', deps);

  router.get('/:withdrawalId/audit', auditGuard, async (req: Request, res: Response) => {
    try {
      const firestore = await resolveDefaultAuditFirestore(deps);
      const strictIntegrity =
        req.query.strictIntegrity === '1' || req.query.strictIntegrity === 'true';
      const result = await getAdminWithdrawalAuditTimeline(
        firestore,
        req.withdrawalAdmin!,
        String(req.params.withdrawalId ?? ''),
        {
          strictIntegrity: strictIntegrity || Boolean(deps.auditOptions?.strictIntegrity),
        },
      );
      res.status(200).json(result);
    } catch (error) {
      sendAuditFaultResponse(res, error);
    }
  });

  return router;
}
