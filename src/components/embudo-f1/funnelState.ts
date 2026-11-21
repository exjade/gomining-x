export type EmbudoF1Stage =
  | 'idle'
  | 'registering'
  | 'configuring'
  | 'paying'
  | 'verify-email'
  | 'dashboard'

export type EmbudoF1Source = 'landing' | 'app'

export interface EmbudoF1State {
  active: boolean
  stage: EmbudoF1Stage
  source: EmbudoF1Source | null
  startedAt: number | null
  lastMinerId?: string
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface PostRegisterTransition {
  allowBuilder: boolean
  deferEmailVerification: boolean
  nextStage: EmbudoF1Stage
  nextRoute: string
}

export interface PostPaymentTransition {
  destination: string
  openVerifyEmailModal: boolean
  nextStage: EmbudoF1Stage
  toastMessage: string
}

export const EMBUDO_F1_STORAGE_KEY = 'pouw_embudo_f1_funnel_v1'
export const EMBUDO_F1_TTL_MS = 30 * 60 * 1000
export const EMBUDO_F1_BUILDER_ROUTE = '/home?modal=paywall-create&embudo=f1'

export const EMBUDO_F1_STEPS: readonly {
  id: Exclude<EmbudoF1Stage, 'idle'>
  num: string
  labelEs: string
  labelEn: string
}[] = [
  { id: 'registering', num: '01', labelEs: 'Registro', labelEn: 'Sign up' },
  { id: 'configuring', num: '02', labelEs: 'Configurar', labelEn: 'Configure' },
  { id: 'paying', num: '03', labelEs: 'Pagar', labelEn: 'Pay' },
  { id: 'verify-email', num: '04', labelEs: 'Verificar', labelEn: 'Verify' },
  { id: 'dashboard', num: '05', labelEs: 'Dashboard', labelEn: 'Dashboard' },
] as const

const IDLE_STATE: EmbudoF1State = {
  active: false,
  stage: 'idle',
  source: null,
  startedAt: null,
}

function resolveStorage(explicit?: StorageLike | null): StorageLike | null {
  if (explicit !== undefined) return explicit
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function isValidStage(value: unknown): value is EmbudoF1Stage {
  return (
    value === 'idle' ||
    value === 'registering' ||
    value === 'configuring' ||
    value === 'paying' ||
    value === 'verify-email' ||
    value === 'dashboard'
  )
}

export function readEmbudoF1State(storage?: StorageLike | null, now = Date.now()): EmbudoF1State {
  const store = resolveStorage(storage)
  if (!store) return { ...IDLE_STATE }
  try {
    const raw = store.getItem(EMBUDO_F1_STORAGE_KEY)
    if (!raw) return { ...IDLE_STATE }
    const parsed = JSON.parse(raw) as Partial<EmbudoF1State>
    if (!parsed || parsed.active !== true || !isValidStage(parsed.stage) || parsed.stage === 'idle') {
      return { ...IDLE_STATE }
    }
    if (typeof parsed.startedAt !== 'number' || !Number.isFinite(parsed.startedAt)) {
      store.removeItem(EMBUDO_F1_STORAGE_KEY)
      return { ...IDLE_STATE }
    }
    if (now - parsed.startedAt > EMBUDO_F1_TTL_MS) {
      store.removeItem(EMBUDO_F1_STORAGE_KEY)
      return { ...IDLE_STATE }
    }
    const source: EmbudoF1Source | null =
      parsed.source === 'landing' || parsed.source === 'app' ? parsed.source : null
    return {
      active: true,
      stage: parsed.stage,
      source,
      startedAt: parsed.startedAt,
      ...(typeof parsed.lastMinerId === 'string' && parsed.lastMinerId.trim()
        ? { lastMinerId: parsed.lastMinerId.trim() }
        : {}),
    }
  } catch {
    return { ...IDLE_STATE }
  }
}

export function clearEmbudoF1State(storage?: StorageLike | null): void {
  const store = resolveStorage(storage)
  if (!store) return
  try {
    store.removeItem(EMBUDO_F1_STORAGE_KEY)
  } catch {
    // ignore storage errors in restricted environments
  }
}

export function startEmbudoF1Registration(
  source: EmbudoF1Source,
  storage?: StorageLike | null,
  now = Date.now(),
): EmbudoF1State {
  const next: EmbudoF1State = {
    active: true,
    stage: 'registering',
    source,
    startedAt: now,
  }
  const store = resolveStorage(storage)
  if (store) {
    try {
      store.setItem(EMBUDO_F1_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore storage errors in restricted environments
    }
  }
  return next
}

export function advanceEmbudoF1Stage(
  stage: EmbudoF1Stage,
  storage?: StorageLike | null,
  extra?: { lastMinerId?: string },
  now = Date.now(),
): EmbudoF1State {
  if (stage === 'idle' || stage === 'dashboard') {
    clearEmbudoF1State(storage)
    return { ...IDLE_STATE, stage }
  }
  const current = readEmbudoF1State(storage, now)
  const next: EmbudoF1State = {
    active: true,
    stage,
    source: current.source ?? 'landing',
    startedAt: current.startedAt ?? now,
    ...(extra?.lastMinerId
      ? { lastMinerId: extra.lastMinerId }
      : current.lastMinerId
        ? { lastMinerId: current.lastMinerId }
        : {}),
  }
  const store = resolveStorage(storage)
  if (store) {
    try {
      store.setItem(EMBUDO_F1_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore storage errors in restricted environments
    }
  }
  return next
}

export function isEmbudoF1Active(storage?: StorageLike | null, now = Date.now()): boolean {
  return readEmbudoF1State(storage, now).active
}

export function hasEmbudoF1QueryFlag(search: string): boolean {
  return new URLSearchParams(search).get('embudo') === 'f1'
}

export function resolvePostRegisterTransition(input: {
  isFunnelActive: boolean
  isAuthenticated: boolean
}): PostRegisterTransition {
  if (!input.isAuthenticated) {
    return {
      allowBuilder: false,
      deferEmailVerification: false,
      nextStage: 'idle',
      nextRoute: '/',
    }
  }
  if (input.isFunnelActive) {
    return {
      allowBuilder: true,
      deferEmailVerification: true,
      nextStage: 'configuring',
      nextRoute: EMBUDO_F1_BUILDER_ROUTE,
    }
  }
  return {
    allowBuilder: false,
    deferEmailVerification: false,
    nextStage: 'idle',
    nextRoute: '/home',
  }
}

export function resolvePostPaymentTransition(input: {
  isFunnelActive: boolean
  isAuthenticated: boolean
  isEmailVerified: boolean
  minerId?: string
}): PostPaymentTransition {
  if (!input.isAuthenticated) {
    return {
      destination: '/',
      openVerifyEmailModal: false,
      nextStage: 'idle',
      toastMessage: '',
    }
  }
  if (input.isFunnelActive) {
    if (!input.isEmailVerified) {
      return {
        destination: '/home',
        openVerifyEmailModal: true,
        nextStage: 'verify-email',
        toastMessage: '¡Pago verificado y enviado on-chain! Confirma tu correo para completar la activación.',
      }
    }
    return {
      destination: '/home',
      openVerifyEmailModal: false,
      nextStage: 'dashboard',
      toastMessage: '¡Pago verificado y enviado on-chain! Entrando a tu dashboard...',
    }
  }
  return {
    destination: input.minerId ? `/miners/${input.minerId}/customize` : '/home',
    openVerifyEmailModal: false,
    nextStage: 'idle',
    toastMessage: '¡Pago verificado y enviado on-chain! Redirigiendo a customización...',
  }
}
