/**
 * SCRUM-275 / SCRUM-289 / SCRUM-277 (W02)
 * Isolated Admin RBAC Evaluator for the Withdrawals Control Center.
 *
 * Strictly evaluates server-delivered `withdrawals.*` permissions and canonical
 * withdrawal states (`WithdrawalStatus`). Never reads `localStorage` roles or
 * accepts `SUPER_ADMIN` wildcard bypasses.
 */

import {
  REQUIRED_PERMISSION_BY_AUDIT_ACTION,
  WITHDRAWAL_ADMIN_PERMISSIONS,
  canTransitionWithdrawalStatus,
  hasWithdrawalPermission,
  isStatusFrozenForFinancialEdits,
  type WithdrawalAdminPermission,
  type WithdrawalAuditAction,
  type WithdrawalStatus,
} from '../../types/withdrawal.js';

export type AdminWithdrawalWorkflowAction = Exclude<WithdrawalAuditAction, 'CREATE'>;

export interface AdminWithdrawalOperatorContext {
  uid: string;
  email: string;
  permissions: readonly string[];
}

export interface AvailableWithdrawalActions {
  canRead: boolean;
  canViewAudit: boolean;
  canReview: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canCancel: boolean;
  canProcess: boolean;
  canBroadcast: boolean;
  canComplete: boolean;
  allowedWorkflowActions: AdminWithdrawalWorkflowAction[];
}

export function sanitizeGrantedWithdrawalPermissions(
  rawPermissions: readonly string[] | undefined | null,
): WithdrawalAdminPermission[] {
  if (!Array.isArray(rawPermissions)) {
    return [];
  }
  const unique = new Set<WithdrawalAdminPermission>();
  for (const perm of rawPermissions) {
    if (
      typeof perm === 'string' &&
      (WITHDRAWAL_ADMIN_PERMISSIONS as readonly string[]).includes(perm.trim())
    ) {
      unique.add(perm.trim() as WithdrawalAdminPermission);
    }
  }
  return Array.from(unique);
}

export function canPerformAdminWithdrawalAction(
  grantedPermissions: readonly string[] | undefined | null,
  action: AdminWithdrawalWorkflowAction,
  currentStatus: WithdrawalStatus,
  options?: { confirmations?: number; requiredConfirmations?: number; hasTxHash?: boolean },
): boolean {
  const requiredPerm = REQUIRED_PERMISSION_BY_AUDIT_ACTION[action];
  if (!hasWithdrawalPermission(grantedPermissions, requiredPerm)) {
    return false;
  }

  if (action === 'EDIT') {
    return !isStatusFrozenForFinancialEdits(currentStatus);
  }

  const targetStatusMap: Record<Exclude<AdminWithdrawalWorkflowAction, 'EDIT'>, WithdrawalStatus> = {
    REVIEW: 'UNDER_REVIEW',
    APPROVE: 'APPROVED',
    PROCESS: 'PROCESSING',
    BROADCAST: 'BROADCASTED',
    COMPLETE: 'COMPLETED',
    REJECT: 'REJECTED',
    CANCEL: 'CANCELLED',
  };

  const targetStatus = targetStatusMap[action];
  if (!canTransitionWithdrawalStatus(currentStatus, targetStatus)) {
    return false;
  }

  if (action === 'COMPLETE') {
    if (options?.hasTxHash === false) {
      return false;
    }
    if (
      typeof options?.confirmations === 'number' &&
      typeof options?.requiredConfirmations === 'number' &&
      options.confirmations < options.requiredConfirmations
    ) {
      return false;
    }
  }

  return true;
}

export function evaluateAvailableWithdrawalActions(
  grantedPermissions: readonly string[] | undefined | null,
  currentStatus: WithdrawalStatus,
  options?: { confirmations?: number; requiredConfirmations?: number; hasTxHash?: boolean },
): AvailableWithdrawalActions {
  const canRead = hasWithdrawalPermission(grantedPermissions, 'withdrawals.read');
  const canViewAudit = hasWithdrawalPermission(grantedPermissions, 'withdrawals.audit');
  const canReview = canPerformAdminWithdrawalAction(grantedPermissions, 'REVIEW', currentStatus, options);
  const canEdit = canPerformAdminWithdrawalAction(grantedPermissions, 'EDIT', currentStatus, options);
  const canApprove = canPerformAdminWithdrawalAction(grantedPermissions, 'APPROVE', currentStatus, options);
  const canReject = canPerformAdminWithdrawalAction(grantedPermissions, 'REJECT', currentStatus, options);
  const canCancel = canPerformAdminWithdrawalAction(grantedPermissions, 'CANCEL', currentStatus, options);
  const canProcess = canPerformAdminWithdrawalAction(grantedPermissions, 'PROCESS', currentStatus, options);
  const canBroadcast = canPerformAdminWithdrawalAction(grantedPermissions, 'BROADCAST', currentStatus, options);
  const canComplete = canPerformAdminWithdrawalAction(grantedPermissions, 'COMPLETE', currentStatus, options);

  const allWorkflowActions: AdminWithdrawalWorkflowAction[] = [
    'REVIEW',
    'EDIT',
    'APPROVE',
    'REJECT',
    'CANCEL',
    'PROCESS',
    'BROADCAST',
    'COMPLETE',
  ];

  const allowedWorkflowActions = allWorkflowActions.filter((action) =>
    canPerformAdminWithdrawalAction(grantedPermissions, action, currentStatus, options),
  );

  return {
    canRead,
    canViewAudit,
    canReview,
    canEdit,
    canApprove,
    canReject,
    canCancel,
    canProcess,
    canBroadcast,
    canComplete,
    allowedWorkflowActions,
  };
}
