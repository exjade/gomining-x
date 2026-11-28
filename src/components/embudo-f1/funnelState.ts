import { customMinerPriceTiers } from '../../minerCatalog.ts'

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
  selectedDesignSlug?: string
  revisitingRegister?: boolean
  paused?: boolean
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
export const EMBUDO_F1_DESIGN_STORAGE_KEY = 'pouw_embudo_builder_design_v1'
export const EMBUDO_F1_PRESALE_SELECTION_KEY = 'pouw_embudo_presale_selection_v1'
export const EMBUDO_F1_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const EMBUDO_F1_BUILDER_ROUTE = '/home?modal=paywall-create&embudo=f1'

export interface EmbudoPresaleSelection {
  powerTh: number
  priceUsd: number
  tierIndex: number
  designSlug: string
  designName: string
  skinCode: string
  source?: string
}

export const DEFAULT_EMBUDO_PRESALE_SELECTION: EmbudoPresaleSelection = {
  powerTh: customMinerPriceTiers[0].powerTh,
  priceUsd: customMinerPriceTiers[0].priceUsd,
  tierIndex: 0,
  designSlug: 'v01-scorpion',
  designName: 'V01 Scorpion',
  skinCode: 'WALL-BLACK',
  source: 'default',
}

export function resolveNearestTierIndexForPower(powerTh: number): number {
  if (!Number.isFinite(powerTh) || powerTh <= 0) return 0
  let bestIdx = 0
  let bestDiff = Math.abs(customMinerPriceTiers[0].powerTh - powerTh)
  for (let i = 1; i < customMinerPriceTiers.length; i++) {
    const diff = Math.abs(customMinerPriceTiers[i].powerTh - powerTh)
    if (diff < bestDiff) {
      bestDiff = diff
      bestIdx = i
    }
  }
  return bestIdx
}

export function saveEmbudoPresaleSelection(
  input?: Partial<EmbudoPresaleSelection> | null,
  storage?: StorageLike | null,
): EmbudoPresaleSelection {
  const tierIndex =
    typeof input?.tierIndex === 'number' && Number.isFinite(input.tierIndex)
      ? Math.max(0, Math.min(customMinerPriceTiers.length - 1, Math.round(input.tierIndex)))
      : typeof input?.powerTh === 'number' && Number.isFinite(input.powerTh)
        ? resolveNearestTierIndexForPower(input.powerTh)
        : 0
  const tier = customMinerPriceTiers[tierIndex]
  const designSlug =
    typeof input?.designSlug === 'string' && input.designSlug.trim()
      ? input.designSlug.trim()
      : DEFAULT_EMBUDO_PRESALE_SELECTION.designSlug
  const designName =
    typeof input?.designName === 'string' && input.designName.trim()
      ? input.designName.trim()
      : designSlug
  const skinCode =
    typeof input?.skinCode === 'string' && input.skinCode.trim()
      ? input.skinCode.trim()
      : DEFAULT_EMBUDO_PRESALE_SELECTION.skinCode
  const normalized: EmbudoPresaleSelection = {
    powerTh: tier.powerTh,
    priceUsd: tier.priceUsd,
    tierIndex,
    designSlug,
    designName,
    skinCode,
    ...(typeof input?.source === 'string' && input.source.trim()
      ? { source: input.source.trim() }
      : {}),
  }
  const store = resolveStorage(storage)
  if (store) {
    try {
      store.setItem(EMBUDO_F1_PRESALE_SELECTION_KEY, JSON.stringify(normalized))
    } catch {
      // ignore storage errors
    }
  }
  saveBuilderSelectedDesign(designSlug, storage)
  return normalized
}

export function readEmbudoPresaleSelection(storage?: StorageLike | null): EmbudoPresaleSelection {
  const store = resolveStorage(storage)
  if (!store) return { ...DEFAULT_EMBUDO_PRESALE_SELECTION }
  try {
    const raw = store.getItem(EMBUDO_F1_PRESALE_SELECTION_KEY)
    if (!raw) return { ...DEFAULT_EMBUDO_PRESALE_SELECTION }
    const parsed = JSON.parse(raw) as Partial<EmbudoPresaleSelection>
    const tierIndex =
      typeof parsed?.tierIndex === 'number' && Number.isFinite(parsed.tierIndex)
        ? Math.max(0, Math.min(customMinerPriceTiers.length - 1, Math.round(parsed.tierIndex)))
        : typeof parsed?.powerTh === 'number' && Number.isFinite(parsed.powerTh)
          ? resolveNearestTierIndexForPower(parsed.powerTh)
          : 0
    const tier = customMinerPriceTiers[tierIndex]
    const designSlug =
      typeof parsed?.designSlug === 'string' && parsed.designSlug.trim()
        ? parsed.designSlug.trim()
        : DEFAULT_EMBUDO_PRESALE_SELECTION.designSlug
    return {
      powerTh: tier.powerTh,
      priceUsd: tier.priceUsd,
      tierIndex,
      designSlug,
      designName:
        typeof parsed?.designName === 'string' && parsed.designName.trim()
          ? parsed.designName.trim()
          : DEFAULT_EMBUDO_PRESALE_SELECTION.designName,
      skinCode:
        typeof parsed?.skinCode === 'string' && parsed.skinCode.trim()
          ? parsed.skinCode.trim()
          : DEFAULT_EMBUDO_PRESALE_SELECTION.skinCode,
      ...(typeof parsed?.source === 'string' && parsed.source.trim()
        ? { source: parsed.source.trim() }
        : {}),
    }
  } catch {
    return { ...DEFAULT_EMBUDO_PRESALE_SELECTION }
  }
}

export function clearEmbudoPresaleSelection(storage?: StorageLike | null): void {
  const store = resolveStorage(storage)
  if (!store) return
  try {
    store.removeItem(EMBUDO_F1_PRESALE_SELECTION_KEY)
  } catch {
    // ignore storage errors
  }
}

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
    return window.localStorage
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
      ...(typeof parsed.selectedDesignSlug === 'string' && parsed.selectedDesignSlug.trim()
        ? { selectedDesignSlug: parsed.selectedDesignSlug.trim() }
        : {}),
      ...(parsed.revisitingRegister === true ? { revisitingRegister: true } : {}),
      ...(parsed.paused === true ? { paused: true } : {}),
    }
  } catch {
    return { ...IDLE_STATE }
  }
}

export function saveBuilderSelectedDesign(slug: string, storage?: StorageLike | null): void {
  const store = resolveStorage(storage)
  if (!store || !slug.trim()) return
  try {
    store.setItem(EMBUDO_F1_DESIGN_STORAGE_KEY, slug.trim())
  } catch {
    // ignore storage errors
  }
}

export function readBuilderSelectedDesign(storage?: StorageLike | null): string {
  const store = resolveStorage(storage)
  if (!store) return 'v01-scorpion'
  try {
    const val = store.getItem(EMBUDO_F1_DESIGN_STORAGE_KEY)
    return val && val.trim() ? val.trim() : 'v01-scorpion'
  } catch {
    return 'v01-scorpion'
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
  extra?: { lastMinerId?: string; selectedDesignSlug?: string },
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
    ...(extra?.selectedDesignSlug
      ? { selectedDesignSlug: extra.selectedDesignSlug }
      : current.selectedDesignSlug
        ? { selectedDesignSlug: current.selectedDesignSlug }
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

export function returnEmbudoF1ToRegister(
  storage?: StorageLike | null,
  now = Date.now(),
): EmbudoF1State {
  const current = readEmbudoF1State(storage, now)
  const next: EmbudoF1State = {
    active: true,
    stage: 'registering',
    source: current.source ?? 'landing',
    startedAt: current.startedAt ?? now,
    revisitingRegister: true,
    ...(current.lastMinerId ? { lastMinerId: current.lastMinerId } : {}),
    ...(current.selectedDesignSlug ? { selectedDesignSlug: current.selectedDesignSlug } : {}),
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

export function pauseEmbudoF1Modal(
  storage?: StorageLike | null,
  now = Date.now(),
): EmbudoF1State {
  const current = readEmbudoF1State(storage, now)
  if (!current.active || (current.stage !== 'configuring' && current.stage !== 'paying')) {
    return current
  }
  const next: EmbudoF1State = {
    ...current,
    paused: true,
  }
  const store = resolveStorage(storage)
  if (store) {
    try {
      store.setItem(EMBUDO_F1_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore storage errors
    }
  }
  return next
}

export function resumeEmbudoF1Modal(
  storage?: StorageLike | null,
  now = Date.now(),
): EmbudoF1State {
  const current = readEmbudoF1State(storage, now)
  if (!current.active) return current
  const next: EmbudoF1State = {
    ...current,
    paused: false,
  }
  const store = resolveStorage(storage)
  if (store) {
    try {
      store.setItem(EMBUDO_F1_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore storage errors
    }
  }
  return next
}

export function hasPendingEmbudoPurchase(storage?: StorageLike | null, now = Date.now()): boolean {
  const state = readEmbudoF1State(storage, now)
  return state.active && (state.stage === 'configuring' || state.stage === 'paying')
}

export function dismissPendingEmbudoPurchase(storage?: StorageLike | null): void {
  clearEmbudoF1State(storage)
  clearEmbudoPresaleSelection(storage)
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

export interface HomeVerificationGateInput {
  isAuthenticated: boolean
  isEmailVerified: boolean
  funnelState?: Pick<EmbudoF1State, 'active' | 'stage' | 'lastMinerId'> | null
  purchasesCount?: number | null
  realMinersCount?: number | null
  paymentReceiptsCount?: number | null
  isCheckoutOrBuilderOpen?: boolean
}

export function hasCompletedPurchaseOrFunnelReceipt(
  input: Omit<HomeVerificationGateInput, 'isAuthenticated' | 'isEmailVerified' | 'isCheckoutOrBuilderOpen'>,
): boolean {
  const funnelPaid = Boolean(
    input.funnelState?.active &&
      (input.funnelState.stage === 'verify-email' || Boolean(input.funnelState.lastMinerId)),
  )
  return (
    funnelPaid ||
    (input.purchasesCount ?? 0) > 0 ||
    (input.realMinersCount ?? 0) > 0 ||
    (input.paymentReceiptsCount ?? 0) > 0
  )
}

export function shouldLockHomeForEmailVerification(input: HomeVerificationGateInput): boolean {
  if (!input.isAuthenticated || input.isEmailVerified) return false
  if (input.isCheckoutOrBuilderOpen) return false
  return hasCompletedPurchaseOrFunnelReceipt(input)
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
  if (!input.isEmailVerified) {
    return {
      destination: '/home',
      openVerifyEmailModal: true,
      nextStage: 'verify-email',
      toastMessage: '¡Pago verificado y enviado on-chain! Confirma tu correo para completar la activación.',
    }
  }
  if (input.isFunnelActive) {
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
