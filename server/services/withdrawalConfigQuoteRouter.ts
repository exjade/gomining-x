/**
 * SCRUM-275 / SCRUM-289 / SCRUM-278 (W03) & SCRUM-279 (W04)
 * Isolated Express Router for Client Withdrawal Endpoints:
 * - `GET /api/withdrawals/config` (or `/config` when mounted at `/api/withdrawals`)
 * - `POST /api/withdrawals/quote` (or `/quote` when mounted at `/api/withdrawals`)
 * - `POST /api/withdrawals/request` (or `/request` when mounted at `/api/withdrawals`)
 * - `GET /api/withdrawals/me` (or `/me` when mounted at `/api/withdrawals`) [W07]
 * - `GET /api/withdrawals/me/:withdrawalId` (or `/me/:withdrawalId` when mounted at `/api/withdrawals`) [W07]
 *
 * Protected by `requireWithdrawalClientAuth` (W02) and emits traceable fault codes
 * (`W07-HISTORY_UI-*`, `W04-LOCK_TX-*`, `W03-NETCFG-*`, `W03-QUOTE-*`, `W02-AUTHZ-*`, `W01-DOMAIN-*`).
 */

import { Router, type Request, type Response } from 'express';
import type { FirebaseAdminAuthAdapter } from './firebaseAdminAuthAdapter.js';
import {
  requireWithdrawalClientAuth,
  type WithdrawalAuthzDependencies,
} from './withdrawalAuthzMiddleware.js';
import {
  computeAuthoritativeWithdrawalQuote,
  getWithdrawalClientConfig,
  type WithdrawalNetworksServiceOptions,
} from './withdrawalNetworksService.js';
import {
  executeAtomicWithdrawalRequest,
  type AtomicWithdrawalRequestOptions,
  type TransactionalFirestoreLike,
} from './withdrawalRequestLockService.js';
import {
  getClientWithdrawalDetail,
  listClientWithdrawalsHistory,
} from './withdrawalClientHistoryService.js';
import {
  formatWithdrawalFaultCode,
  isWithdrawalModuleError,
  type WithdrawalModuleOrigin,
  type WithdrawalTaskOrigin,
} from '../../src/types/withdrawal.js';

export interface WithdrawalConfigQuoteRouterDependencies extends WithdrawalAuthzDependencies {
  firestore?: TransactionalFirestoreLike | null;
  serviceOptions?: WithdrawalNetworksServiceOptions;
  requestOptions?: AtomicWithdrawalRequestOptions;
}

async function resolveDefaultFirestore(
  deps: WithdrawalConfigQuoteRouterDependencies,
): Promise<TransactionalFirestoreLike | null> {
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
    return firestoreMod.getFirestore(app) as unknown as TransactionalFirestoreLike;
  } catch {
    return null;
  }
}

function sendWithdrawalFaultResponse(
  res: Response,
  error: unknown,
  fallbackTask: WithdrawalTaskOrigin,
  fallbackModule: WithdrawalModuleOrigin,
): void {
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

  const code = 'INTERNAL_WITHDRAWAL_ERROR';
  const faultCode = formatWithdrawalFaultCode(fallbackTask, fallbackModule, code, 500);
  res.status(500).json({
    ok: false,
    code,
    faultCode,
    originTask: fallbackTask,
    originModule: fallbackModule,
    error: `[${faultCode}] ${code}: Error interno procesando la operación de retiros.`,
  });
}

export function createWithdrawalConfigQuoteRouter(
  deps: WithdrawalConfigQuoteRouterDependencies = {},
): Router {
  const router = Router();
  const authMiddleware = requireWithdrawalClientAuth(deps);

  router.get('/config', authMiddleware, async (req: Request, res: Response) => {
    try {
      const firestore = await resolveDefaultFirestore(deps);
      const payload = await getWithdrawalClientConfig(
        firestore,
        req.withdrawalClient!,
        deps.serviceOptions,
      );
      res.status(200).json(payload);
    } catch (error) {
      sendWithdrawalFaultResponse(res, error, 'W03', 'NETCFG');
    }
  });

  router.post('/quote', authMiddleware, async (req: Request, res: Response) => {
    try {
      const firestore = await resolveDefaultFirestore(deps);
      const quote = await computeAuthoritativeWithdrawalQuote(
        firestore,
        req.withdrawalClient!,
        req.body || {},
        deps.serviceOptions,
      );
      res.status(200).json({
        ok: true,
        quote,
      });
    } catch (error) {
      sendWithdrawalFaultResponse(res, error, 'W03', 'QUOTE');
    }
  });

  router.post('/request', authMiddleware, async (req: Request, res: Response) => {
    try {
      const firestore = await resolveDefaultFirestore(deps);
      const result = await executeAtomicWithdrawalRequest(
        firestore,
        req.withdrawalClient!,
        req.body || {},
        {
          ...deps.serviceOptions,
          ...deps.requestOptions,
        },
      );
      res.status(result.status).json(result);
    } catch (error) {
      sendWithdrawalFaultResponse(res, error, 'W04', 'LOCK_TX');
    }
  });

  router.get('/me', authMiddleware, async (req: Request, res: Response) => {
    try {
      const firestore = await resolveDefaultFirestore(deps);
      const rawCursor =
        typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const rawLimit =
        typeof req.query.limit === 'string' ? req.query.limit : undefined;
      const result = await listClientWithdrawalsHistory(
        firestore,
        req.withdrawalClient!,
        {
          cursor: rawCursor,
          limit: rawLimit,
        },
      );
      res.status(200).json(result);
    } catch (error) {
      sendWithdrawalFaultResponse(res, error, 'W07', 'HISTORY_UI');
    }
  });

  router.get('/me/:withdrawalId', authMiddleware, async (req: Request, res: Response) => {
    try {
      const firestore = await resolveDefaultFirestore(deps);
      const rawId = req.params.withdrawalId;
      const withdrawalId = Array.isArray(rawId) ? rawId[0] ?? '' : String(rawId ?? '');
      const result = await getClientWithdrawalDetail(
        firestore,
        req.withdrawalClient!,
        withdrawalId,
      );
      res.status(200).json(result);
    } catch (error) {
      sendWithdrawalFaultResponse(res, error, 'W07', 'HISTORY_UI');
    }
  });

  return router;
}
