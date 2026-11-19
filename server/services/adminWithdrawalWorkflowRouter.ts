/**
 * SCRUM-275 / SCRUM-289 / SCRUM-284 (W09)
 * Isolated Express Router for Admin Withdrawals Workflow Mutations:
 * - `POST   /:withdrawalId/review`   (`withdrawals.review`)
 * - `PATCH  /:withdrawalId`          (`withdrawals.edit`)
 * - `POST   /:withdrawalId/approve`  (`withdrawals.approve`)
 * - `POST   /:withdrawalId/process`  (`withdrawals.process`)
 * - `POST   /:withdrawalId/reject`   (`withdrawals.reject`)
 * - `POST   /:withdrawalId/cancel`   (`withdrawals.cancel`)
 *
 * Protected by W02 `requireWithdrawalAdminPermission(...)` fail-closed middleware.
 * Leaves `BROADCAST` and `COMPLETE` unmounted (out of scope until W11).
 */

import { Router, type Request, type Response } from 'express';
import type { FirebaseAdminAuthAdapter } from './firebaseAdminAuthAdapter.js';
import {
  requireWithdrawalAdminPermission,
  type WithdrawalAuthzDependencies,
} from './withdrawalAuthzMiddleware.js';
import type { TransactionalFirestoreLike } from './withdrawalRequestLockService.js';
import {
  executeAdminWorkflowAction,
  type AdminWorkflowExecutionOptions,
} from './adminWithdrawalWorkflowService.js';
import {
  formatWithdrawalFaultCode,
  isWithdrawalModuleError,
  type AdminApproveWithdrawalDto,
  type AdminCancelWithdrawalDto,
  type AdminEditWithdrawalDto,
  type AdminProcessWithdrawalDto,
  type AdminRejectWithdrawalDto,
  type AdminReviewWithdrawalDto,
} from '../../src/types/withdrawal.js';

export interface AdminWithdrawalWorkflowRouterDependencies
  extends WithdrawalAuthzDependencies {
  firestore?: TransactionalFirestoreLike | null;
  workflowOptions?: AdminWorkflowExecutionOptions;
}

async function resolveDefaultWorkflowFirestore(
  deps: AdminWithdrawalWorkflowRouterDependencies,
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

function sendWorkflowFaultResponse(res: Response, error: unknown): void {
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

  const code = 'WORKFLOW_FAILED';
  const faultCode = formatWithdrawalFaultCode('W09', 'WORKFLOW', code, 503);
  res.status(503).json({
    ok: false,
    code,
    faultCode,
    originTask: 'W09',
    originModule: 'WORKFLOW',
    error: `[${faultCode}] ${code}: Error interno ejecutando transición administrativa.`,
  });
}

function asObjectRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export function createAdminWithdrawalWorkflowRouter(
  deps: AdminWithdrawalWorkflowRouterDependencies = {},
): Router {
  const router = Router();
  const options = deps.workflowOptions ?? {};

  router.post(
    '/:withdrawalId/review',
    requireWithdrawalAdminPermission('withdrawals.review', deps),
    async (req: Request, res: Response) => {
      try {
        const firestore = await resolveDefaultWorkflowFirestore(deps);
        const body = asObjectRecord(req.body);
        const result = await executeAdminWorkflowAction(
          firestore,
          req.withdrawalAdmin!,
          String(req.params.withdrawalId ?? ''),
          {
            action: 'REVIEW',
            dto: {
              expectedStatus: body.expectedStatus as AdminReviewWithdrawalDto['expectedStatus'],
              ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
            },
          },
          options,
        );
        res.status(200).json(result);
      } catch (error) {
        sendWorkflowFaultResponse(res, error);
      }
    },
  );

  router.patch(
    '/:withdrawalId',
    requireWithdrawalAdminPermission('withdrawals.edit', deps),
    async (req: Request, res: Response) => {
      try {
        const firestore = await resolveDefaultWorkflowFirestore(deps);
        const body = asObjectRecord(req.body);
        const result = await executeAdminWorkflowAction(
          firestore,
          req.withdrawalAdmin!,
          String(req.params.withdrawalId ?? ''),
          {
            action: 'EDIT',
            rawBody: body,
            dto: {
              expectedStatus: body.expectedStatus as AdminEditWithdrawalDto['expectedStatus'],
              ...(typeof body.destinationAddress === 'string'
                ? { destinationAddress: body.destinationAddress }
                : {}),
              ...(typeof body.networkId === 'string' ? { networkId: body.networkId } : {}),
              ...(typeof body.internalNotes === 'string'
                ? { internalNotes: body.internalNotes }
                : {}),
              reason: typeof body.reason === 'string' ? body.reason : '',
            },
          },
          options,
        );
        res.status(200).json(result);
      } catch (error) {
        sendWorkflowFaultResponse(res, error);
      }
    },
  );

  router.post(
    '/:withdrawalId/approve',
    requireWithdrawalAdminPermission('withdrawals.approve', deps),
    async (req: Request, res: Response) => {
      try {
        const firestore = await resolveDefaultWorkflowFirestore(deps);
        const body = asObjectRecord(req.body);
        const result = await executeAdminWorkflowAction(
          firestore,
          req.withdrawalAdmin!,
          String(req.params.withdrawalId ?? ''),
          {
            action: 'APPROVE',
            dto: {
              expectedStatus: body.expectedStatus as AdminApproveWithdrawalDto['expectedStatus'],
              ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
            },
          },
          options,
        );
        res.status(200).json(result);
      } catch (error) {
        sendWorkflowFaultResponse(res, error);
      }
    },
  );

  router.post(
    '/:withdrawalId/process',
    requireWithdrawalAdminPermission('withdrawals.process', deps),
    async (req: Request, res: Response) => {
      try {
        const firestore = await resolveDefaultWorkflowFirestore(deps);
        const body = asObjectRecord(req.body);
        const result = await executeAdminWorkflowAction(
          firestore,
          req.withdrawalAdmin!,
          String(req.params.withdrawalId ?? ''),
          {
            action: 'PROCESS',
            dto: {
              expectedStatus: body.expectedStatus as AdminProcessWithdrawalDto['expectedStatus'],
              ...(typeof body.providerTransactionId === 'string'
                ? { providerTransactionId: body.providerTransactionId }
                : {}),
              ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
            },
          },
          options,
        );
        res.status(200).json(result);
      } catch (error) {
        sendWorkflowFaultResponse(res, error);
      }
    },
  );

  router.post(
    '/:withdrawalId/reject',
    requireWithdrawalAdminPermission('withdrawals.reject', deps),
    async (req: Request, res: Response) => {
      try {
        const firestore = await resolveDefaultWorkflowFirestore(deps);
        const body = asObjectRecord(req.body);
        const result = await executeAdminWorkflowAction(
          firestore,
          req.withdrawalAdmin!,
          String(req.params.withdrawalId ?? ''),
          {
            action: 'REJECT',
            dto: {
              expectedStatus: body.expectedStatus as AdminRejectWithdrawalDto['expectedStatus'],
              rejectionReason:
                typeof body.rejectionReason === 'string' ? body.rejectionReason : '',
            },
          },
          options,
        );
        res.status(200).json(result);
      } catch (error) {
        sendWorkflowFaultResponse(res, error);
      }
    },
  );

  router.post(
    '/:withdrawalId/cancel',
    requireWithdrawalAdminPermission('withdrawals.cancel', deps),
    async (req: Request, res: Response) => {
      try {
        const firestore = await resolveDefaultWorkflowFirestore(deps);
        const body = asObjectRecord(req.body);
        const result = await executeAdminWorkflowAction(
          firestore,
          req.withdrawalAdmin!,
          String(req.params.withdrawalId ?? ''),
          {
            action: 'CANCEL',
            dto: {
              expectedStatus: body.expectedStatus as AdminCancelWithdrawalDto['expectedStatus'],
              cancellationReason:
                typeof body.cancellationReason === 'string' ? body.cancellationReason : '',
            },
          },
          options,
        );
        res.status(200).json(result);
      } catch (error) {
        sendWorkflowFaultResponse(res, error);
      }
    },
  );

  return router;
}
