/**
 * SCRUM-275 / SCRUM-289 / SCRUM-286 (W11)
 * Isolated Express Router for On-Chain Broadcast, Confirmation Updates & Atomic Settlement:
 * - `POST   /:withdrawalId/broadcast`      (`withdrawals.broadcast`)
 * - `PATCH  /:withdrawalId/confirmations`  (`withdrawals.broadcast`, zero bypass for webhooks/workers)
 * - `POST   /:withdrawalId/complete`       (`withdrawals.broadcast`)
 *
 * Strictly protected by W02 `requireWithdrawalAdminPermission('withdrawals.broadcast', deps)`.
 * Zero client bypass and zero external calls inside `runTransaction`.
 */

import { Router, type Request, type Response } from 'express';
import type { FirebaseAdminAuthAdapter } from './firebaseAdminAuthAdapter.js';
import {
  requireWithdrawalAdminPermission,
  type WithdrawalAuthzDependencies,
} from './withdrawalAuthzMiddleware.js';
import type { TransactionalFirestoreLike } from './withdrawalRequestLockService.js';
import {
  executeAdminBroadcastWithdrawal,
  executeAdminCompleteWithdrawal,
  executeAdminUpdateConfirmations,
  type AdminSettlementExecutionOptions,
  type AdminUpdateConfirmationsDto,
} from './adminWithdrawalSettlementService.js';
import {
  formatWithdrawalFaultCode,
  isWithdrawalModuleError,
  type AdminBroadcastWithdrawalDto,
  type AdminCompleteWithdrawalDto,
} from '../../src/types/withdrawal.js';

export interface AdminWithdrawalSettlementRouterDependencies
  extends WithdrawalAuthzDependencies {
  firestore?: TransactionalFirestoreLike | null;
  settlementOptions?: AdminSettlementExecutionOptions;
}

async function resolveDefaultSettlementFirestore(
  deps: AdminWithdrawalSettlementRouterDependencies,
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

function sendSettlementFaultResponse(res: Response, error: unknown): void {
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

  const code = 'SETTLEMENT_FAILED';
  const faultCode = formatWithdrawalFaultCode('W11', 'SETTLEMENT', code, 503);
  res.status(503).json({
    ok: false,
    code,
    faultCode,
    originTask: 'W11',
    originModule: 'SETTLEMENT',
    error: `[${faultCode}] ${code}: Error interno ejecutando broadcast/settlement W11.`,
  });
}

function asObjectRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export function createAdminWithdrawalSettlementRouter(
  deps: AdminWithdrawalSettlementRouterDependencies = {},
): Router {
  const router = Router();
  const options = deps.settlementOptions ?? {};

  router.post(
    '/:withdrawalId/broadcast',
    requireWithdrawalAdminPermission('withdrawals.broadcast', deps),
    async (req: Request, res: Response) => {
      try {
        const firestore = await resolveDefaultSettlementFirestore(deps);
        const body = asObjectRecord(req.body);
        const dto: AdminBroadcastWithdrawalDto = {
          expectedStatus:
            body.expectedStatus as AdminBroadcastWithdrawalDto['expectedStatus'],
          txHash: typeof body.txHash === 'string' ? body.txHash : '',
          ...(body.confirmations !== undefined
            ? { confirmations: body.confirmations as number }
            : {}),
          ...(typeof body.providerTransactionId === 'string'
            ? { providerTransactionId: body.providerTransactionId }
            : {}),
        };
        const result = await executeAdminBroadcastWithdrawal(
          firestore,
          req.withdrawalAdmin!,
          String(req.params.withdrawalId ?? ''),
          dto,
          options,
        );
        res.status(200).json(result);
      } catch (error) {
        sendSettlementFaultResponse(res, error);
      }
    },
  );

  // Strict fail-closed RBAC: even webhook or worker callers MUST authenticate with
  // a valid Firebase token carrying explicit `withdrawals.broadcast` permission (zero bypass).
  router.patch(
    '/:withdrawalId/confirmations',
    requireWithdrawalAdminPermission('withdrawals.broadcast', deps),
    async (req: Request, res: Response) => {
      try {
        const firestore = await resolveDefaultSettlementFirestore(deps);
        const body = asObjectRecord(req.body);
        const dto: AdminUpdateConfirmationsDto = {
          expectedStatus:
            body.expectedStatus as AdminUpdateConfirmationsDto['expectedStatus'],
          confirmations: body.confirmations as number,
          ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
        };
        const result = await executeAdminUpdateConfirmations(
          firestore,
          req.withdrawalAdmin!,
          String(req.params.withdrawalId ?? ''),
          dto,
          options,
        );
        res.status(200).json(result);
      } catch (error) {
        sendSettlementFaultResponse(res, error);
      }
    },
  );

  router.post(
    '/:withdrawalId/complete',
    requireWithdrawalAdminPermission('withdrawals.broadcast', deps),
    async (req: Request, res: Response) => {
      try {
        const firestore = await resolveDefaultSettlementFirestore(deps);
        const body = asObjectRecord(req.body);
        const dto: AdminCompleteWithdrawalDto = {
          expectedStatus:
            body.expectedStatus as AdminCompleteWithdrawalDto['expectedStatus'],
          confirmations: body.confirmations as number,
          ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
        };
        const result = await executeAdminCompleteWithdrawal(
          firestore,
          req.withdrawalAdmin!,
          String(req.params.withdrawalId ?? ''),
          dto,
          options,
        );
        res.status(200).json(result);
      } catch (error) {
        sendSettlementFaultResponse(res, error);
      }
    },
  );

  return router;
}
