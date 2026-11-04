import type { AdminAuditLog, AdminRole } from '../../types/admin';

const STORAGE_AUDIT_KEY = 'minerx_admin_audit_logs_v2';

export class AdminAuditService {
  private static instance: AdminAuditService;

  private constructor() {}

  public static getInstance(): AdminAuditService {
    if (!AdminAuditService.instance) {
      AdminAuditService.instance = new AdminAuditService();
    }
    return AdminAuditService.instance;
  }

  public getLogs(): AdminAuditLog[] {
    try {
      const raw = localStorage.getItem(STORAGE_AUDIT_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[AdminAuditService] Error leyendo logs locales:', e);
    }
    return [];
  }

  public logAction(
    actorUid: string,
    actorEmail: string,
    actorRole: AdminRole,
    module: AdminAuditLog['module'],
    action: string,
    targetId: string | undefined,
    details: Record<string, unknown>,
    status: 'SUCCESS' | 'FAILED' | 'WARNING' = 'SUCCESS'
  ): AdminAuditLog {
    const newEntry: AdminAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      actorUid,
      actorEmail,
      actorRole,
      module,
      action,
      targetId,
      details,
      status
    };

    try {
      const existing = this.getLogs();
      const updated = [newEntry, ...existing].slice(0, 500);
      localStorage.setItem(STORAGE_AUDIT_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('[AdminAuditService] Error persistiendo log de auditoría:', e);
    }

    return newEntry;
  }
}
