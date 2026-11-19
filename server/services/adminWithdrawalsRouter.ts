/**
 * SCRUM-275 / SCRUM-289 / SCRUM-283 (W08)
 * Isolated Express Router for Admin Withdrawals Control Center:
 * - `GET /api/admin/withdrawals` (or `/` when mounted at `/api/admin/withdrawals`)
 * - `GET /api/admin/withdrawals/:withdrawalId` (or `/:withdrawalId`)
 *
 * Protected strictly by `requireWithdrawalAdminPermission('withdrawals.read')` (W02).
 * Emits traceable fault codes (`W08-ADMIN_UI-*`, `W02-AUTHZ-*`, `W01-DOMAIN-*`).
 */

import { Router, type Request, type Response } from 'express';
import type { FirebaseAdminAuthAdapter } from './firebaseAdminAuthAdapter.js';
import type { FirestoreLike } from './firebaseAdminAllowlistAdapter.js';
import {
  requireWithdrawalAdminPermission,
  type WithdrawalAuthzDependencies,
} from './withdrawalAuthzMiddleware.js';
import {
  getAdminWithdrawalDetail,
  listAdminWithdrawals,
  type AdminWithdrawalsTab,
} from './adminWithdrawalsService.js';
import {
  formatWithdrawalFaultCode,
  isWithdrawalModuleError,
  type AdminWithdrawalsQueryFilter,
} from '../../src/types/withdrawal.js';

export interface AdminWithdrawalsRouterDependencies extends WithdrawalAuthzDependencies {
  firestore?: FirestoreLike | null;
}

async function resolveDefaultAdminFirestore(
  deps: AdminWithdrawalsRouterDependencies,
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

function sendAdminFaultResponse(res: Response, error: unknown): void {
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

  const code = 'ADMIN_FETCH_FAILED';
  const faultCode = formatWithdrawalFaultCode('W08', 'ADMIN_UI', code, 503);
  res.status(503).json({
    ok: false,
    code,
    faultCode,
    originTask: 'W08',
    originModule: 'ADMIN_UI',
    error: `[${faultCode}] ${code}: Error interno en el Centro de Control Admin de retiros.`,
  });
}

export function createAdminWithdrawalsRouter(
  deps: AdminWithdrawalsRouterDependencies = {},
): Router {
  const router = Router();
  const readGuard = requireWithdrawalAdminPermission('withdrawals.read', deps);

  router.get('/', readGuard, async (req: Request, res: Response) => {
    try {
      const firestore = await resolveDefaultAdminFirestore(deps);
      const q = req.query;
      const result = await listAdminWithdrawals(firestore, req.withdrawalAdmin!, {
        tab: typeof q.tab === 'string' ? (q.tab as AdminWithdrawalsTab) : undefined,
        status:
          typeof q.status === 'string'
            ? (q.status as AdminWithdrawalsQueryFilter['status'])
            : undefined,
        network:
          typeof q.network === 'string'
            ? (q.network as AdminWithdrawalsQueryFilter['network'])
            : undefined,
        membershipTier:
          typeof q.membershipTier === 'string'
            ? (q.membershipTier as AdminWithdrawalsQueryFilter['membershipTier'])
            : undefined,
        searchQuery:
          typeof q.searchQuery === 'string'
            ? q.searchQuery
            : typeof q.search === 'string'
              ? q.search
              : undefined,
        dateFrom: typeof q.dateFrom === 'string' ? q.dateFrom : undefined,
        dateTo: typeof q.dateTo === 'string' ? q.dateTo : undefined,
        cursor: typeof q.cursor === 'string' ? q.cursor : undefined,
        limit:
          typeof q.limit === 'string' && q.limit.trim().length > 0
            ? Number(q.limit.trim())
            : undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      sendAdminFaultResponse(res, error);
    }
  });

  router.get('/:withdrawalId', readGuard, async (req: Request, res: Response) => {
    try {
      const firestore = await resolveDefaultAdminFirestore(deps);
      const rawId = req.params.withdrawalId;
      const withdrawalId = Array.isArray(rawId) ? rawId[0] ?? '' : String(rawId ?? '');
      const result = await getAdminWithdrawalDetail(
        firestore,
        req.withdrawalAdmin!,
        withdrawalId,
      );
      res.status(200).json(result);
    } catch (error) {
      sendAdminFaultResponse(res, error);
    }
  });

  return router;
}
