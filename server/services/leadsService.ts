import fs from 'fs';
import path from 'path';

export type LeadFunnelStatus = 'registering' | 'configuring' | 'paying' | 'purchased';

export type LeadCaptureSource =
  | 'register-welcome'
  | 'builder-configure'
  | 'checkout-prepay'
  | 'purchase-receipt';

export type LeadRecoveryEmailStatus =
  | 'NONE'
  | 'SCHEDULED'
  | 'SENT'
  | 'CANCELLED_PURCHASED';

export interface LeadRecord {
  id: string;
  name: string;
  email: string;
  date: string;
  status: LeadFunnelStatus;
  allowsCommunication: true;
  source: LeadCaptureSource;
  powerTh?: number;
  priceUsd?: number;
  designSlug?: string;
  uid?: string;
  recoveryEmailStatus: LeadRecoveryEmailStatus;
  recoveryEmailSubject?: string;
  recoveryEmailScheduledAt?: string;
  recoveryEmailSentAt?: string;
  welcomeEmailSentAt?: string;
  updatedAt: string;
}

export interface LeadEmailEventRecord {
  id: string;
  leadId: string;
  email: string;
  name: string;
  type: 'welcome' | 'abandoned_config_recovery';
  subject: string;
  bodyPreview: string;
  status: 'QUEUED' | 'SENT' | 'CANCELLED_PURCHASED';
  createdAt: string;
  sentAt?: string;
  cancelledAt?: string;
}

export interface LeadCaptureRequestBody {
  event?: string;
  name?: string;
  email?: string;
  date?: string;
  status?: string;
  allowsCommunication?: boolean;
  source?: string;
  powerTh?: number;
  priceUsd?: number;
  designSlug?: string;
  uid?: string;
}

export interface LeadCaptureResult {
  captured: boolean;
  reason?: 'INVALID_EMAIL' | 'NO_COMMUNICATION_CONSENT';
  lead?: LeadRecord;
  emailEvent?: LeadEmailEventRecord | null;
}

const VALID_STATUSES: readonly LeadFunnelStatus[] = [
  'registering',
  'configuring',
  'paying',
  'purchased',
];

const STATUS_RANK: Record<LeadFunnelStatus, number> = {
  registering: 1,
  configuring: 2,
  paying: 3,
  purchased: 4,
};

const VALID_SOURCES: readonly LeadCaptureSource[] = [
  'register-welcome',
  'builder-configure',
  'checkout-prepay',
  'purchase-receipt',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LEADS_COLLECTION = 'leads';
export const LEAD_EMAIL_EVENTS_COLLECTION = 'lead_email_events';
export const RECOVERY_EMAIL_SUBJECT = 'Termina de configurar tu miner y págalo';
export const WELCOME_EMAIL_SUBJECT = 'Bienvenido a PouwMiner · Tu acceso y configuración';

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function deriveName(name: unknown, email: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length > 0) return trimmed.slice(0, 120);
  const local = email.split('@')[0] || 'Usuario';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 120);
}

function normalizeStatus(status: unknown): LeadFunnelStatus {
  if (typeof status === 'string' && VALID_STATUSES.includes(status as LeadFunnelStatus)) {
    return status as LeadFunnelStatus;
  }
  return 'registering';
}

function normalizeSource(source: unknown): LeadCaptureSource {
  if (typeof source === 'string' && VALID_SOURCES.includes(source as LeadCaptureSource)) {
    return source as LeadCaptureSource;
  }
  return 'register-welcome';
}

function buildLeadId(email: string): string {
  return `lead_${Buffer.from(email).toString('base64url').slice(0, 32)}`;
}

export class LeadsService {
  private readonly getDataDir: () => string;

  constructor(getDataDir: () => string) {
    this.getDataDir = getDataDir;
  }

  private getLeadsFile(): string {
    return path.join(this.getDataDir(), 'leads.json');
  }

  private getEmailEventsFile(): string {
    return path.join(this.getDataDir(), 'lead_email_events.json');
  }

  private ensureDir(): void {
    const dir = this.getDataDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public readLeads(): LeadRecord[] {
    try {
      const file = this.getLeadsFile();
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // fall through
    }
    return [];
  }

  private writeLeads(leads: LeadRecord[]): void {
    this.ensureDir();
    fs.writeFileSync(this.getLeadsFile(), JSON.stringify(leads, null, 2), 'utf8');
  }

  public readEmailEvents(): LeadEmailEventRecord[] {
    try {
      const file = this.getEmailEventsFile();
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // fall through
    }
    return [];
  }

  private writeEmailEvents(events: LeadEmailEventRecord[]): void {
    this.ensureDir();
    fs.writeFileSync(this.getEmailEventsFile(), JSON.stringify(events, null, 2), 'utf8');
  }

  /**
   * Regla B (SCRUM-336):
   * - Captura lead únicamente si hay email válido Y allowsCommunication === true.
   * - Email marketing (welcome y recuperación "termina de configurar tu miner y págalo")
   *   SOLO se dispara cuando el usuario dejó email y permitió comunicación.
   * - Si el lead pasa a 'purchased', cualquier correo de recuperación pendiente se cancela.
   */
  public captureLead(body: LeadCaptureRequestBody): LeadCaptureResult {
    const email = normalizeEmail(body?.email);
    if (!email || email.length < 5 || email.length > 160 || !EMAIL_RE.test(email)) {
      return { captured: false, reason: 'INVALID_EMAIL' };
    }
    if (body?.allowsCommunication !== true) {
      return { captured: false, reason: 'NO_COMMUNICATION_CONSENT' };
    }

    const now = new Date().toISOString();
    const incomingStatus = normalizeStatus(body.status);
    const incomingSource = normalizeSource(body.source);
    const name = deriveName(body.name, email);
    const date = typeof body.date === 'string' && !Number.isNaN(Date.parse(body.date)) ? body.date : now;

    const leads = this.readLeads();
    const events = this.readEmailEvents();
    const existingIdx = leads.findIndex((item) => item.email === email);
    const existing = existingIdx >= 0 ? leads[existingIdx] : null;

    // Monotonic status progression (registering -> configuring -> paying -> purchased)
    const nextStatus: LeadFunnelStatus =
      existing && STATUS_RANK[existing.status] > STATUS_RANK[incomingStatus]
        ? existing.status
        : incomingStatus;

    const powerTh =
      typeof body.powerTh === 'number' && Number.isFinite(body.powerTh) && body.powerTh > 0
        ? body.powerTh
        : existing?.powerTh;
    const priceUsd =
      typeof body.priceUsd === 'number' && Number.isFinite(body.priceUsd) && body.priceUsd > 0
        ? body.priceUsd
        : existing?.priceUsd;
    const designSlug =
      typeof body.designSlug === 'string' && body.designSlug.trim()
        ? body.designSlug.trim()
        : existing?.designSlug;
    const uid =
      typeof body.uid === 'string' && body.uid.trim()
        ? body.uid.trim()
        : existing?.uid;

    let recoveryEmailStatus: LeadRecoveryEmailStatus = existing?.recoveryEmailStatus ?? 'NONE';
    let recoveryEmailScheduledAt = existing?.recoveryEmailScheduledAt;
    let recoveryEmailSentAt = existing?.recoveryEmailSentAt;
    let welcomeEmailSentAt = existing?.welcomeEmailSentAt;
    let createdEvent: LeadEmailEventRecord | null = null;

    const leadId = existing?.id || buildLeadId(email);

    // 1) Welcome email (once per opted-in lead on registration)
    if (incomingStatus === 'registering' && !welcomeEmailSentAt) {
      welcomeEmailSentAt = now;
      createdEvent = {
        id: `eml_welcome_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        leadId,
        email,
        name,
        type: 'welcome',
        subject: WELCOME_EMAIL_SUBJECT,
        bodyPreview: `Hola ${name}, gracias por registrarte en PouwMiner. Ya puedes configurar tu miner de preventa.`,
        status: 'SENT',
        createdAt: now,
        sentAt: now,
      };
      events.unshift(createdEvent);
    }

    // 2) Abandoned config / pre-pay recovery email ("termina de configurar tu miner y págalo")
    if ((nextStatus === 'configuring' || nextStatus === 'paying') && recoveryEmailStatus === 'NONE') {
      recoveryEmailStatus = 'SCHEDULED';
      recoveryEmailScheduledAt = now;
      const specText = powerTh ? `${powerTh} TH${priceUsd ? ` ($${priceUsd.toFixed(2)} USD)` : ''}` : 'tu miner personalizado';
      createdEvent = {
        id: `eml_recovery_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        leadId,
        email,
        name,
        type: 'abandoned_config_recovery',
        subject: RECOVERY_EMAIL_SUBJECT,
        bodyPreview: `Hola ${name}, dejaste pendiente ${specText}. Termina de configurar tu miner y págalo para asegurar tu cupo Génesis.`,
        status: 'QUEUED',
        createdAt: now,
      };
      events.unshift(createdEvent);
    }

    // 3) If lead completed purchase, cancel any pending abandoned-config recovery email
    if (nextStatus === 'purchased') {
      if (recoveryEmailStatus === 'SCHEDULED') {
        recoveryEmailStatus = 'CANCELLED_PURCHASED';
      }
      for (const ev of events) {
        if (ev.leadId === leadId && ev.type === 'abandoned_config_recovery' && ev.status === 'QUEUED') {
          ev.status = 'CANCELLED_PURCHASED';
          ev.cancelledAt = now;
        }
      }
    }

    const record: LeadRecord = {
      id: leadId,
      name,
      email,
      date: existing?.date || date,
      status: nextStatus,
      allowsCommunication: true,
      source: incomingSource,
      ...(powerTh !== undefined ? { powerTh } : {}),
      ...(priceUsd !== undefined ? { priceUsd } : {}),
      ...(designSlug ? { designSlug } : {}),
      ...(uid ? { uid } : {}),
      recoveryEmailStatus,
      ...(recoveryEmailStatus !== 'NONE' ? { recoveryEmailSubject: RECOVERY_EMAIL_SUBJECT } : {}),
      ...(recoveryEmailScheduledAt ? { recoveryEmailScheduledAt } : {}),
      ...(recoveryEmailSentAt ? { recoveryEmailSentAt } : {}),
      ...(welcomeEmailSentAt ? { welcomeEmailSentAt } : {}),
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      leads[existingIdx] = record;
    } else {
      leads.unshift(record);
    }

    this.writeLeads(leads);
    this.writeEmailEvents(events);

    return {
      captured: true,
      lead: record,
      emailEvent: createdEvent,
    };
  }

  /**
   * Dispatches all queued "termina de configurar tu miner y págalo" recovery emails
   * strictly for leads that still have allowsCommunication === true and status in ['configuring', 'paying'].
   */
  public processPendingRecoveryEmails(): { dispatchedCount: number; dispatched: LeadEmailEventRecord[] } {
    const now = new Date().toISOString();
    const leads = this.readLeads();
    const events = this.readEmailEvents();
    const leadsById = new Map(leads.map((l) => [l.id, l]));
    const dispatched: LeadEmailEventRecord[] = [];

    for (const ev of events) {
      if (ev.type !== 'abandoned_config_recovery' || ev.status !== 'QUEUED') continue;
      const lead = leadsById.get(ev.leadId);
      if (!lead || lead.allowsCommunication !== true) continue;
      if (lead.status === 'purchased') {
        ev.status = 'CANCELLED_PURCHASED';
        ev.cancelledAt = now;
        lead.recoveryEmailStatus = 'CANCELLED_PURCHASED';
        lead.updatedAt = now;
        continue;
      }
      if (lead.status === 'configuring' || lead.status === 'paying') {
        ev.status = 'SENT';
        ev.sentAt = now;
        lead.recoveryEmailStatus = 'SENT';
        lead.recoveryEmailSentAt = now;
        lead.updatedAt = now;
        dispatched.push(ev);
      }
    }

    this.writeLeads(leads);
    this.writeEmailEvents(events);
    return { dispatchedCount: dispatched.length, dispatched };
  }

  public listLeads(filters?: { status?: string; search?: string }) {
    const allLeads = this.readLeads();
    const events = this.readEmailEvents();
    let filtered = allLeads;

    if (filters?.status && filters.status !== 'all') {
      filtered = filtered.filter((l) => l.status === filters.status);
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.status.toLowerCase().includes(q),
      );
    }

    const summary = {
      total: allLeads.length,
      registering: allLeads.filter((l) => l.status === 'registering').length,
      configuring: allLeads.filter((l) => l.status === 'configuring').length,
      paying: allLeads.filter((l) => l.status === 'paying').length,
      purchased: allLeads.filter((l) => l.status === 'purchased').length,
      recoveryScheduled: allLeads.filter((l) => l.recoveryEmailStatus === 'SCHEDULED').length,
      recoverySent: allLeads.filter((l) => l.recoveryEmailStatus === 'SENT').length,
    };

    return { leads: filtered, summary, emailQueue: events.slice(0, 50) };
  }
}
