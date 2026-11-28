import { readEmbudoPresaleSelection, type StorageLike } from './funnelState.ts'

export const LEAD_CAPTURED_EVENT_NAME = 'user/lead-captured' as const
export const LEAD_COMMS_STORAGE_KEY = 'pouw_embudo_lead_comms_v1'
export const LEAD_LAST_CAPTURED_STORAGE_KEY = 'pouw_embudo_last_lead_v1'

export type LeadFunnelStatus = 'registering' | 'configuring' | 'paying' | 'purchased'

export type LeadCaptureSource =
  | 'register-welcome'
  | 'builder-configure'
  | 'checkout-prepay'
  | 'purchase-receipt'

export interface LeadCaptureInput {
  email?: string | null
  name?: string | null
  status: LeadFunnelStatus
  allowsCommunication: boolean
  source: LeadCaptureSource
  powerTh?: number
  priceUsd?: number
  designSlug?: string
  uid?: string | null
  capturedAt?: string
}

export interface LeadCapturedEventPayload {
  event: typeof LEAD_CAPTURED_EVENT_NAME
  name: string
  email: string
  date: string
  status: LeadFunnelStatus
  allowsCommunication: true
  source: LeadCaptureSource
  powerTh?: number
  priceUsd?: number
  designSlug?: string
  uid?: string
}

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function normalizeLeadEmail(email?: string | null): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export function isValidLeadEmail(email?: string | null): boolean {
  const normalized = normalizeLeadEmail(email)
  return normalized.length >= 5 && normalized.length <= 160 && SIMPLE_EMAIL_RE.test(normalized)
}

export function deriveLeadName(name: string | null | undefined, email: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed.length > 0) return trimmed.slice(0, 120)
  const localPart = normalizeLeadEmail(email).split('@')[0] || 'Usuario'
  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .slice(0, 120)
}

/**
 * Regla B (SCRUM-336):
 * Todo comprador es lead en cuanto deja su email para recibir su compra/recibo/acceso
 * y permite comunicación (aunque nunca lo haya dejado antes del pago).
 * Nunca se captura ni se dispara email marketing si falta email válido o si allowsCommunication !== true.
 */
export function shouldCaptureLead(input: Pick<LeadCaptureInput, 'email' | 'allowsCommunication'>): boolean {
  return input.allowsCommunication === true && isValidLeadEmail(input.email)
}

export function buildLeadCapturedEvent(
  input: LeadCaptureInput,
  storage?: StorageLike | null,
): LeadCapturedEventPayload | null {
  if (!shouldCaptureLead(input)) return null
  const normalizedEmail = normalizeLeadEmail(input.email)
  const presale = readEmbudoPresaleSelection(storage)
  const powerTh =
    typeof input.powerTh === 'number' && Number.isFinite(input.powerTh) && input.powerTh > 0
      ? input.powerTh
      : presale.powerTh
  const priceUsd =
    typeof input.priceUsd === 'number' && Number.isFinite(input.priceUsd) && input.priceUsd > 0
      ? input.priceUsd
      : presale.priceUsd
  const designSlug =
    typeof input.designSlug === 'string' && input.designSlug.trim()
      ? input.designSlug.trim()
      : presale.designSlug

  return {
    event: LEAD_CAPTURED_EVENT_NAME,
    name: deriveLeadName(input.name, normalizedEmail),
    email: normalizedEmail,
    date: input.capturedAt || new Date().toISOString(),
    status: input.status,
    allowsCommunication: true,
    source: input.source,
    powerTh,
    priceUsd,
    designSlug,
    ...(typeof input.uid === 'string' && input.uid.trim() ? { uid: input.uid.trim() } : {}),
  }
}

export function saveLeadCommunicationConsent(
  allowsCommunication: boolean,
  storage?: StorageLike | null,
): void {
  const store = resolveStorage(storage)
  if (!store) return
  try {
    store.setItem(LEAD_COMMS_STORAGE_KEY, allowsCommunication ? 'true' : 'false')
  } catch {
    // non-fatal
  }
}

export function readLeadCommunicationConsent(storage?: StorageLike | null): boolean {
  const store = resolveStorage(storage)
  if (!store) return true
  try {
    const raw = store.getItem(LEAD_COMMS_STORAGE_KEY)
    if (raw === 'false') return false
    return true
  } catch {
    return true
  }
}

export function resolveLeadCaptureApiUrl(): string {
  const env =
    typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string | undefined> }).env
      ? (import.meta as { env?: Record<string, string | undefined> }).env!
      : {}
  const base = (env.VITE_ADMIN_API_BASE_URL || '').trim().replace(/\/+$/, '')
  return base ? `${base}/api/leads/capture` : '/api/leads/capture'
}

export interface EmitLeadOptions {
  storage?: StorageLike | null
  fetchImpl?: typeof fetch
  endpoint?: string
}

/**
 * Emits `user/lead-captured` both as a DOM CustomEvent (observability) and via POST /api/leads/capture.
 * Strictly enforces Regla B: no-ops and returns null if email is invalid or allowsCommunication is false.
 */
export function emitLeadCapturedEvent(
  input: LeadCaptureInput,
  options: EmitLeadOptions = {},
): LeadCapturedEventPayload | null {
  saveLeadCommunicationConsent(input.allowsCommunication, options.storage)
  const payload = buildLeadCapturedEvent(input, options.storage)
  if (!payload) return null

  const store = resolveStorage(options.storage)
  if (store) {
    try {
      store.setItem(LEAD_LAST_CAPTURED_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // non-fatal
    }
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(LEAD_CAPTURED_EVENT_NAME, { detail: payload }))
    } catch {
      // non-fatal
    }
  }

  const fetchFn = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined)
  if (fetchFn) {
    const url = options.endpoint || resolveLeadCaptureApiUrl()
    void fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Fail-safe: lead telemetry must never block registration or checkout
    })
  }

  return payload
}
