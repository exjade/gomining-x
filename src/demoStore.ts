import { useSyncExternalStore } from 'react'
import type { DemoOrder } from './purchase'

export type DemoCycle = 'monthly' | 'annual'

export type MinerCustomization = {
  wallColor: string
  bodyColor: string
  bottomColor: string
  fansColor: string
  screenColor: string
  buttonsColor: string
  topColor: string
  stickers: string
  updatedAt: string
}

export type DemoMiner = {
  id: string
  name: string
  powerTh: number
  efficiency: number
  price: number
  purchaseMode: 'once' | 'monthly'
  acquiredAt: string
  expiresAt?: string
  workerId: string
  ownerWallet?: string
  packageId?: string
  customization?: MinerCustomization
  status?: 'mining' | 'pending' | 'customizing'
}

export type DemoWorker = {
  id: string
  minerId: string
  powerTh: number
  efficiency: number
  ownerWallet?: string
  status: 'pending-activation' | 'active-demo'
  poolConnected: false
  createdAt: string
}

export type DemoMinerPurchaseInput = {
  name: string
  powerTh: number
  efficiency: number
  price: number
  purchaseMode: 'once' | 'monthly'
  durationDays?: number
  ownerWallet?: string
  packageId?: string
}

export type PendingDemoMinerOrder = DemoMinerPurchaseInput & {
  id: string
  createdAt: string
}

export type DemoSubscription = {
  cycle: DemoCycle
  price: number
  startedAt: string
  endsAt: string
}

export type DemoReceipt = {
  id: string
  kind: 'deposit' | 'miner' | 'miner-pending' | 'order' | 'subscription' | 'withdrawal' | 'presale' | 'referral'
  label: string
  amount: number
  detail: string
  createdAt: string
  balanceAfter: number
}

export type DemoSession = {
  balance: number
  maintenanceCredit: number
  miners: DemoMiner[]
  workers: DemoWorker[]
  workerActivationMode: 'automatic' | 'manual'
  pendingMinerOrders: PendingDemoMinerOrder[]
  subscription: DemoSubscription | null
  receipts: DemoReceipt[]
  presaleTokens: number
}

type InsufficientResult = { ok: false; required: number; available: number; message: string }
type OperationResult = { ok: true; receipt: DemoReceipt } | InsufficientResult

export type DemoMinerPurchaseResult =
  | { ok: true; receipt: DemoReceipt; miner: DemoMiner }
  | InsufficientResult

let state: DemoSession = {
  balance: 0,
  maintenanceCredit: 0,
  miners: [],
  workers: [],
  workerActivationMode: 'automatic',
  pendingMinerOrders: [],
  subscription: null,
  receipts: [],
  presaleTokens: 0,
}

const listeners = new Set<() => void>()
let receiptSequence = 0
let minerSequence = 0
let sessionRevision = 0
const lockedPendingOrders = new Set<string>()
const activeBalanceReservations = new Map<string, number>()
let reservationSequence = 0

function notify() {
  sessionRevision += 1
  for (const listener of listeners) listener()
}

function roundCurrency(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

export function useDemoSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Firestore persists only local demo data; wallet addresses and payment receipts are excluded. */
export function getDemoSessionForPersistence(): DemoSession {
  return {
    balance: state.balance,
    miners: state.miners.map((miner) => ({
      id: miner.id,
      name: miner.name,
      powerTh: miner.powerTh,
      efficiency: miner.efficiency,
      price: miner.price,
      purchaseMode: miner.purchaseMode,
      acquiredAt: miner.acquiredAt,
      ...(miner.expiresAt ? { expiresAt: miner.expiresAt } : {}),
      workerId: miner.workerId,
      ...(miner.packageId ? { packageId: miner.packageId } : {}),
    })),
    workers: state.workers.map((worker) => ({
      id: worker.id,
      minerId: worker.minerId,
      powerTh: worker.powerTh,
      efficiency: worker.efficiency,
      status: worker.status,
      poolConnected: false,
      createdAt: worker.createdAt,
    })),
    workerActivationMode: state.workerActivationMode,
    pendingMinerOrders: state.pendingMinerOrders.map((order) => ({
      id: order.id,
      name: order.name,
      powerTh: order.powerTh,
      efficiency: order.efficiency,
      price: order.price,
      purchaseMode: order.purchaseMode,
      ...(order.durationDays !== undefined ? { durationDays: order.durationDays } : {}),
      ...(order.packageId ? { packageId: order.packageId } : {}),
      createdAt: order.createdAt,
    })),
    subscription: state.subscription ? {
      cycle: state.subscription.cycle,
      price: state.subscription.price,
      startedAt: state.subscription.startedAt,
      endsAt: state.subscription.endsAt,
    } : null,
    // Demo receipts only; wallet transaction receipts are kept separately in React state.
    receipts: state.receipts.map((receipt) => ({
      id: receipt.id,
      kind: receipt.kind,
      label: receipt.label,
      amount: receipt.amount,
      detail: receipt.detail,
      createdAt: receipt.createdAt,
      balanceAfter: receipt.balanceAfter,
    })),
    presaleTokens: state.presaleTokens,
    maintenanceCredit: state.maintenanceCredit ?? 0,
  }
}

/** Changes whenever local or restored demo state is replaced. */
export function getDemoSessionRevision() {
  return sessionRevision
}

/** Restore a bounded, validated demo snapshot. Malformed documents are ignored. */
export function restoreDemoSession(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  const balance = Number(data.balance)
  const presaleTokens = Number(data.presaleTokens)
  if (!Number.isFinite(balance) || balance < 0 || balance > 1_000_000_000 || !Number.isFinite(presaleTokens) || presaleTokens < 0) return false

  const miners = Array.isArray(data.miners) ? data.miners.slice(0, 100).flatMap((raw): DemoMiner[] => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.workerId !== 'string'
      || typeof item.acquiredAt !== 'string' || !Number.isFinite(Number(item.powerTh)) || Number(item.powerTh) <= 0
      || !Number.isFinite(Number(item.efficiency)) || Number(item.efficiency) <= 0 || !Number.isFinite(Number(item.price))
      || (item.purchaseMode !== 'once' && item.purchaseMode !== 'monthly')) return []
    return [{
      id: item.id.slice(0, 120), name: item.name.slice(0, 120), powerTh: Number(item.powerTh), efficiency: Number(item.efficiency),
      price: Math.max(0, Number(item.price)), purchaseMode: item.purchaseMode, acquiredAt: item.acquiredAt.slice(0, 80),
      expiresAt: typeof item.expiresAt === 'string' ? item.expiresAt.slice(0, 80) : undefined, workerId: item.workerId.slice(0, 120),
      ...(typeof item.packageId === 'string' ? { packageId: item.packageId.slice(0, 120) } : {}),
    }]
  }) : []

  const workers = Array.isArray(data.workers) ? data.workers.slice(0, 100).flatMap((raw): DemoWorker[] => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    if (typeof item.id !== 'string' || typeof item.minerId !== 'string' || typeof item.createdAt !== 'string'
      || !Number.isFinite(Number(item.powerTh)) || !Number.isFinite(Number(item.efficiency))
      || (item.status !== 'pending-activation' && item.status !== 'active-demo')) return []
    return [{ id: item.id.slice(0, 120), minerId: item.minerId.slice(0, 120), powerTh: Number(item.powerTh), efficiency: Number(item.efficiency),
      status: item.status, poolConnected: false, createdAt: item.createdAt.slice(0, 80) }]
  }) : []

  const pendingMinerOrders = Array.isArray(data.pendingMinerOrders) ? data.pendingMinerOrders.slice(0, 100).flatMap((raw): PendingDemoMinerOrder[] => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.createdAt !== 'string'
      || !Number.isFinite(Number(item.powerTh)) || !Number.isFinite(Number(item.efficiency)) || !Number.isFinite(Number(item.price))
      || (item.purchaseMode !== 'once' && item.purchaseMode !== 'monthly')) return []
    return [{ id: item.id.slice(0, 120), name: item.name.slice(0, 120), powerTh: Number(item.powerTh), efficiency: Number(item.efficiency),
      price: Math.max(0, Number(item.price)), purchaseMode: item.purchaseMode, durationDays: Number.isFinite(Number(item.durationDays)) ? Number(item.durationDays) : undefined,
      ownerWallet: typeof item.ownerWallet === 'string' ? item.ownerWallet.slice(0, 120) : undefined,
      packageId: typeof item.packageId === 'string' ? item.packageId.slice(0, 120) : undefined,
      createdAt: item.createdAt.slice(0, 80) }]
  }) : []

  const receipts = Array.isArray(data.receipts) ? data.receipts.slice(0, 50).flatMap((raw): DemoReceipt[] => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    const kinds: DemoReceipt['kind'][] = ['deposit', 'miner', 'miner-pending', 'order', 'subscription', 'withdrawal', 'presale', 'referral']
    if (typeof item.id !== 'string' || typeof item.label !== 'string' || typeof item.detail !== 'string' || typeof item.createdAt !== 'string'
      || !kinds.includes(item.kind as DemoReceipt['kind']) || !Number.isFinite(Number(item.amount)) || !Number.isFinite(Number(item.balanceAfter))) return []
    const receiptId = item.id.replace(/^DEMO-/i, 'LOCAL-').slice(0, 120)
    return [{ id: receiptId, kind: item.kind as DemoReceipt['kind'], label: item.label.slice(0, 120),
      amount: Number(item.amount), detail: item.detail.slice(0, 500), createdAt: item.createdAt.slice(0, 80), balanceAfter: Number(item.balanceAfter) }]
  }) : []

  const rawSubscription = data.subscription
  let subscription: DemoSubscription | null = null
  if (rawSubscription && typeof rawSubscription === 'object' && !Array.isArray(rawSubscription)) {
    const item = rawSubscription as Record<string, unknown>
    if ((item.cycle === 'monthly' || item.cycle === 'annual') && Number.isFinite(Number(item.price))
      && typeof item.startedAt === 'string' && typeof item.endsAt === 'string') {
      subscription = { cycle: item.cycle, price: Math.max(0, Number(item.price)), startedAt: item.startedAt.slice(0, 80), endsAt: item.endsAt.slice(0, 80) }
    }
  }

  const maintenanceCredit = Number.isFinite(Number(data.maintenanceCredit)) ? Number(data.maintenanceCredit) : 0

  lockedPendingOrders.clear()
  activeBalanceReservations.clear()
  state = { balance, maintenanceCredit, miners, workers, workerActivationMode: data.workerActivationMode === 'manual' ? 'manual' : 'automatic',
    pendingMinerOrders, subscription, receipts, presaleTokens }
  notify()
  return true
}

export function subscribeToDemoSession(listener: () => void) {
  return subscribe(listener)
}

function makeReceipt(kind: DemoReceipt['kind'], label: string, amount: number, detail: string, balanceAfter: number): DemoReceipt {
  receiptSequence += 1
  return {
    id: `LOCAL-${Date.now().toString(36).toUpperCase()}-${receiptSequence.toString().padStart(3, '0')}`,
    kind,
    label,
    amount,
    detail,
    createdAt: new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }),
    balanceAfter,
  }
}

export function getAvailableDemoBalance(): number {
  let reserved = 0
  for (const amt of activeBalanceReservations.values()) {
    reserved += amt
  }
  return roundCurrency(Math.max(0, state.balance - reserved))
}

export function reserveDemoBalance(
  amount: number,
  reservationId?: string
): { ok: true; reservationId: string } | InsufficientResult {
  const roundedAmount = roundCurrency(amount)
  if (!Number.isFinite(roundedAmount) || roundedAmount < 0) {
    return { ok: false, required: amount, available: getAvailableDemoBalance(), message: 'Monto de reserva no válido.' }
  }
  const available = getAvailableDemoBalance()
  if (available + 0.000001 < roundedAmount) {
    return resultForInsufficient(roundedAmount)
  }
  const resId = reservationId?.trim() || `RES-${Date.now().toString(36).toUpperCase()}-${(++reservationSequence).toString().padStart(3, '0')}`
  activeBalanceReservations.set(resId, roundedAmount)
  return { ok: true, reservationId: resId }
}

export function releaseDemoBalanceReservation(reservationId: string): void {
  activeBalanceReservations.delete(reservationId)
}

export function commitDemoBalanceReservation(reservationId: string): number {
  const reservedAmount = activeBalanceReservations.get(reservationId)
  if (reservedAmount === undefined) {
    return state.balance
  }
  activeBalanceReservations.delete(reservationId)
  state = {
    ...state,
    balance: roundCurrency(Math.max(0, state.balance - reservedAmount)),
  }
  notify()
  return state.balance
}

function resultForInsufficient(required: number): InsufficientResult {
  return { ok: false, required, available: getAvailableDemoBalance(), message: 'El saldo local no alcanza para completar esta simulación.' }
}

export function addDemoBalance(amount: number, detail = 'Crédito ficticio añadido en esta sesión'): DemoReceipt | null {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return null
  const normalizedAmount = roundCurrency(amount)
  const balance = roundCurrency(state.balance + normalizedAmount)
  const receipt = makeReceipt('deposit', 'Recarga local', normalizedAmount, detail, balance)
  state = { ...state, balance, receipts: [receipt, ...state.receipts].slice(0, 50) }
  notify()
  return receipt
}

/** Deposita PEARL o USDT y lo convierte automáticamente en Crédito de Mantenimiento */
export function depositMaintenanceToken(token: 'PEARL' | 'USDT', tokenAmount: number): DemoReceipt | null {
  if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) return null
  // 1 USDT = $1.00 USD. 1 PEARL = $0.05 USD en crédito de mantenimiento.
  const rate = token === 'USDT' ? 1.0 : 0.05
  const usdCredit = roundCurrency(tokenAmount * rate)
  const currentCredit = state.maintenanceCredit ?? 0
  const newCredit = roundCurrency(currentCredit + usdCredit)
  const detail = `Depósito de ${tokenAmount} ${token} convertido en $${usdCredit.toFixed(2)} USD de Crédito de Mantenimiento`
  const receipt = makeReceipt('deposit', 'Crédito de mantenimiento', usdCredit, detail, state.balance)
  state = { ...state, maintenanceCredit: newCredit, receipts: [receipt, ...state.receipts].slice(0, 50) }
  notify()
  return receipt
}

function isValidMinerPurchase(input: DemoMinerPurchaseInput) {
  return [input.powerTh, input.efficiency, input.price].every(Number.isFinite)
    && input.powerTh > 0 && input.efficiency > 0 && input.price >= 0
}

function makeDemoMiner(input: DemoMinerPurchaseInput, existingId?: string): DemoMiner {
  minerSequence += 1
  const id = existingId ?? `MINER-${Date.now().toString(36).toUpperCase()}-${minerSequence.toString().padStart(3, '0')}`
  return {
    id,
    name: input.name,
    powerTh: input.powerTh,
    efficiency: input.efficiency,
    price: roundCurrency(input.price),
    purchaseMode: input.purchaseMode,
    acquiredAt: new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }),
    expiresAt: input.purchaseMode === 'monthly' ? new Date(Date.now() + (input.durationDays ?? 30) * 24 * 60 * 60 * 1000).toISOString() : undefined,
    workerId: `worker-${id.toLowerCase()}`,
    ownerWallet: input.ownerWallet,
    ...(input.packageId ? { packageId: input.packageId } : {}),
  }
}

function makeDemoWorker(miner: DemoMiner): DemoWorker {
  return {
    id: miner.workerId,
    minerId: miner.id,
    powerTh: miner.powerTh,
    efficiency: miner.efficiency,
    ownerWallet: miner.ownerWallet,
    status: state.workerActivationMode === 'automatic' ? 'active-demo' : 'pending-activation',
    poolConnected: false,
    createdAt: new Date().toISOString(),
  }
}

export interface PreparedDemoMinerPurchase {
  ok: true
  miner: DemoMiner
  price: number
}

export function prepareDemoMinerPurchase(
  input: DemoMinerPurchaseInput,
  existingMinerId?: string
): PreparedDemoMinerPurchase | InsufficientResult {
  if (!isValidMinerPurchase(input)) {
    return { ok: false, required: input.price, available: getAvailableDemoBalance(), message: 'Revisa la potencia, eficiencia y precio local.' }
  }
  const price = roundCurrency(input.price)
  const available = getAvailableDemoBalance()
  if (available + 0.000001 < price) return resultForInsufficient(price)
  const miner = makeDemoMiner({ ...input, price }, existingMinerId)
  return { ok: true, miner, price }
}

export function commitDemoMinerPurchase(
  miner: DemoMiner,
  price: number,
  reservationId?: string
): { ok: true; receipt: DemoReceipt; miner: DemoMiner } | InsufficientResult {
  const roundedPrice = roundCurrency(price)
  if (reservationId && activeBalanceReservations.has(reservationId)) {
    activeBalanceReservations.delete(reservationId)
    const balance = roundCurrency(Math.max(0, state.balance - roundedPrice))
    const receipt = makeReceipt('miner', 'Compra local de minero', roundedPrice, `${miner.name} · ${miner.powerTh.toFixed(2)} TH · nuevo poder en granja`, balance)
    state = { ...state, balance, miners: [miner, ...state.miners], workers: [makeDemoWorker(miner), ...state.workers], receipts: [receipt, ...state.receipts].slice(0, 50) }
    notify()
    return { ok: true, receipt, miner }
  }
  if (state.balance + 0.000001 < roundedPrice) {
    return resultForInsufficient(roundedPrice)
  }
  const balance = roundCurrency(Math.max(0, state.balance - roundedPrice))
  const receipt = makeReceipt('miner', 'Compra local de minero', roundedPrice, `${miner.name} · ${miner.powerTh.toFixed(2)} TH · nuevo poder en granja`, balance)
  state = { ...state, balance, miners: [miner, ...state.miners], workers: [makeDemoWorker(miner), ...state.workers], receipts: [receipt, ...state.receipts].slice(0, 50) }
  notify()
  return { ok: true, receipt, miner }
}

export function buyDemoMiner(input: DemoMinerPurchaseInput): DemoMinerPurchaseResult {
  const prep = prepareDemoMinerPurchase(input)
  if (!prep.ok) return prep
  return commitDemoMinerPurchase(prep.miner, prep.price)
}

export function prepareWalletMinerPurchase(
  input: DemoMinerPurchaseInput,
  existingMinerId?: string
): DemoMiner {
  const price = roundCurrency(input.price)
  const miner = makeDemoMiner({ ...input, price }, existingMinerId)
  miner.status = 'customizing'
  return miner
}

export function commitWalletMinerPurchase(
  miner: DemoMiner,
  txHash: string,
  networkName: string
): DemoMiner {
  const existing = state.miners.find((m) => m.id === miner.id)
  if (existing) {
    return existing
  }
  const worker = makeDemoWorker(miner)
  const receipt = makeReceipt(
    'miner',
    `Compra on-chain (${networkName})`,
    miner.price,
    `${miner.name} · ${miner.powerTh.toFixed(2)} TH · Tx: ${txHash.slice(0, 10)}...`,
    state.balance,
  )
  state = {
    ...state,
    miners: [miner, ...state.miners],
    workers: [worker, ...state.workers],
    receipts: [receipt, ...state.receipts].slice(0, 50),
  }
  notify()
  return miner
}

export function registerWalletMinerPurchase(
  input: DemoMinerPurchaseInput,
  txHash: string,
  networkName: string,
  existingMinerId?: string
): DemoMiner {
  const miner = prepareWalletMinerPurchase(input, existingMinerId)
  return commitWalletMinerPurchase(miner, txHash, networkName)
}

export function updateDemoMinerCustomization(minerId: string, customization: MinerCustomization) {
  state = {
    ...state,
    miners: state.miners.map((m) => m.id === minerId ? { ...m, customization, status: 'mining' } : m),
  }
  notify()
}

/** Marks a local worker as activated in the demo admin panel only. */
export function activateDemoWorker(workerId: string) {
  if (!state.workers.some((worker) => worker.id === workerId)) return false
  state = {
    ...state,
    workers: state.workers.map((worker) => worker.id === workerId ? { ...worker, status: 'active-demo' as const } : worker),
  }
  notify()
  return true
}

export function setDemoWorkerActivationMode(mode: DemoSession['workerActivationMode']) {
  state = {
    ...state,
    workerActivationMode: mode,
    workers: mode === 'automatic'
      ? state.workers.map((worker) => worker.status === 'pending-activation' ? { ...worker, status: 'active-demo' as const } : worker)
      : state.workers,
  }
  notify()
}

export function deferDemoMinerPurchase(input: DemoMinerPurchaseInput): OperationResult {
  if (!isValidMinerPurchase(input)) {
    return { ok: false, required: input.price, available: state.balance, message: 'Revisa la potencia, eficiencia y precio local.' }
  }
  const order: PendingDemoMinerOrder = {
    ...input,
    price: roundCurrency(input.price),
    id: `ORDER-${Date.now().toString(36).toUpperCase()}-${(receiptSequence + 1).toString().padStart(3, '0')}`,
    createdAt: new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }),
  }
  const receipt = makeReceipt('miner-pending', 'Pedido local pendiente', order.price, `${order.name} · ${order.powerTh.toFixed(2)} TH · pendiente de pago con saldo local`, state.balance)
  state = { ...state, pendingMinerOrders: [order, ...state.pendingMinerOrders], receipts: [receipt, ...state.receipts].slice(0, 50) }
  notify()
  return { ok: true, receipt }
}

export interface PreparedPendingMinerPayment {
  ok: true
  order: PendingDemoMinerOrder
  miner: DemoMiner
  price: number
}

export function preparePayPendingDemoMiner(
  orderId: string,
  existingMinerId?: string
): PreparedPendingMinerPayment | InsufficientResult {
  const order = state.pendingMinerOrders.find((item) => item.id === orderId)
  if (!order) return { ok: false, required: 0, available: getAvailableDemoBalance(), message: 'No se encontró ese pedido local pendiente.' }
  if (!isValidMinerPurchase(order)) {
    return { ok: false, required: order.price, available: getAvailableDemoBalance(), message: 'Revisa la potencia, eficiencia y precio local.' }
  }
  const price = roundCurrency(order.price)
  const available = getAvailableDemoBalance()
  if (available + 0.000001 < price) return resultForInsufficient(price)
  const miner = makeDemoMiner({ ...order, price }, existingMinerId)
  return { ok: true, order, miner, price }
}

export function lockPendingDemoMinerForSettlement(orderId: string): boolean {
  if (!state.pendingMinerOrders.some((item) => item.id === orderId)) {
    return false
  }
  if (lockedPendingOrders.has(orderId)) {
    return false
  }
  lockedPendingOrders.add(orderId)
  return true
}

export function releasePendingDemoMinerLock(orderId: string): void {
  lockedPendingOrders.delete(orderId)
}

export function isPendingDemoMinerLocked(orderId: string): boolean {
  return lockedPendingOrders.has(orderId)
}

export function commitPayPendingDemoMiner(
  orderId: string,
  miner: DemoMiner,
  price: number,
  reservationId?: string
): { ok: true; receipt: DemoReceipt; miner: DemoMiner } | InsufficientResult {
  if (!state.pendingMinerOrders.some((item) => item.id === orderId)) {
    if (reservationId) releaseDemoBalanceReservation(reservationId)
    return { ok: false, required: 0, available: getAvailableDemoBalance(), message: 'No se encontró ese pedido local pendiente.' }
  }
  const roundedPrice = roundCurrency(price)
  if (reservationId && activeBalanceReservations.has(reservationId)) {
    activeBalanceReservations.delete(reservationId)
    const balance = roundCurrency(Math.max(0, state.balance - roundedPrice))
    const receipt = makeReceipt('miner', 'Compra local de minero', roundedPrice, `${miner.name} · ${miner.powerTh.toFixed(2)} TH · nuevo poder en granja`, balance)
    lockedPendingOrders.delete(orderId)
    state = {
      ...state,
      balance,
      miners: [miner, ...state.miners],
      workers: [makeDemoWorker(miner), ...state.workers],
      receipts: [receipt, ...state.receipts].slice(0, 50),
      pendingMinerOrders: state.pendingMinerOrders.filter((item) => item.id !== orderId),
    }
    notify()
    return { ok: true, receipt, miner }
  }
  if (state.balance + 0.000001 < roundedPrice) {
    return resultForInsufficient(roundedPrice)
  }
  const balance = roundCurrency(Math.max(0, state.balance - roundedPrice))
  const receipt = makeReceipt('miner', 'Compra local de minero', roundedPrice, `${miner.name} · ${miner.powerTh.toFixed(2)} TH · nuevo poder en granja`, balance)
  lockedPendingOrders.delete(orderId)
  state = {
    ...state,
    balance,
    miners: [miner, ...state.miners],
    workers: [makeDemoWorker(miner), ...state.workers],
    receipts: [receipt, ...state.receipts].slice(0, 50),
    pendingMinerOrders: state.pendingMinerOrders.filter((item) => item.id !== orderId),
  }
  notify()
  return { ok: true, receipt, miner }
}

export function payPendingDemoMiner(orderId: string): DemoMinerPurchaseResult {
  const prep = preparePayPendingDemoMiner(orderId)
  if (!prep.ok) return prep
  return commitPayPendingDemoMiner(orderId, prep.miner, prep.price)
}

export function cancelPendingDemoMiner(orderId: string): boolean {
  if (lockedPendingOrders.has(orderId)) {
    return false
  }
  const pendingMinerOrders = state.pendingMinerOrders.filter((item) => item.id !== orderId)
  if (pendingMinerOrders.length === state.pendingMinerOrders.length) {
    return false
  }
  state = { ...state, pendingMinerOrders }
  notify()
  return true
}

export function buyDemoOrder(order: DemoOrder): OperationResult {
  if (!Number.isFinite(order.total) || order.total < 0) {
    return { ok: false, required: order.total, available: state.balance, message: 'El total del pedido no es válido.' }
  }
  const total = roundCurrency(order.total)
  if (state.balance + 0.000001 < total) return resultForInsufficient(total)
  const now = new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
  const newMiners = order.items.flatMap(({ product, quantity }) => {
    if (!product.id.startsWith('miner-')) return []
    const powerTh = product.powerTh ?? (product.id === 'miner-plus' ? 1.2 : 0.6)
    return Array.from({ length: quantity }, (_, index) => ({
      id: `${order.id}-${product.id}-${index + 1}`,
      name: product.title,
      powerTh,
      efficiency: 15,
      price: product.price,
      purchaseMode: 'once' as const,
      acquiredAt: now,
      workerId: `worker-${order.id.toLowerCase()}-${product.id}-${index + 1}`,
    }))
  })
  const newWorkers = newMiners.map(makeDemoWorker)
  const balance = roundCurrency(Math.max(0, state.balance - total))
  const receipt = makeReceipt('order', 'Pedido local', total, `${order.items.reduce((count, item) => count + item.quantity, 0)} artículo(s); inventario actualizado en esta sesión`, balance)
  state = { ...state, balance, miners: [...newMiners, ...state.miners], workers: [...newWorkers, ...state.workers], receipts: [receipt, ...state.receipts].slice(0, 50) }
  notify()
  return { ok: true, receipt }
}

export function activateDemoSubscription(cycle: DemoCycle, price: number): OperationResult {
  if (!Number.isFinite(price) || price < 0) return { ok: false, required: price, available: state.balance, message: 'El precio local debe ser cero o mayor.' }
  const normalizedPrice = roundCurrency(price)
  if (state.balance + 0.000001 < normalizedPrice) return resultForInsufficient(normalizedPrice)
  const started = new Date()
  const ends = new Date(started.getTime() + (cycle === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000)
  const balance = roundCurrency(Math.max(0, state.balance - normalizedPrice))
  const subscription: DemoSubscription = { cycle, price: normalizedPrice, startedAt: started.toISOString(), endsAt: ends.toISOString() }
  const receipt = makeReceipt('subscription', `Suscripción local ${cycle === 'monthly' ? 'mensual' : 'anual'}`, normalizedPrice, 'Beneficio +1% aplicado a la potencia minera activa durante la sesión local.', balance)
  state = { ...state, balance, subscription, receipts: [receipt, ...state.receipts].slice(0, 50) }
  notify()
  return { ok: true, receipt }
}

export function cancelDemoSubscription() {
  if (!state.subscription) return
  state = { ...state, subscription: null }
  notify()
}

export function simulateDemoWithdrawal(amount: number, networkCost: number): OperationResult {
  if (![amount, networkCost].every(Number.isFinite) || amount <= 0 || networkCost < 0 || amount <= networkCost) {
    return { ok: false, required: amount, available: state.balance, message: 'El importe debe ser mayor que la comisión estimada.' }
  }
  const gross = roundCurrency(amount)
  const fee = roundCurrency(networkCost)
  if (state.balance + 0.000001 < gross) return resultForInsufficient(gross)
  const net = roundCurrency(gross - fee)
  const balance = roundCurrency(Math.max(0, state.balance - gross))
  const subscriptionActive = Boolean(state.subscription && Date.parse(state.subscription.endsAt) > Date.now())
  const receipt = makeReceipt('withdrawal', 'Solicitud de retiro local', gross, `Comisión estimada ${fee.toFixed(2)} USD · recibiría ${net.toFixed(2)} USD · ${subscriptionActive ? 'sin cola diaria con suscripción' : 'cola diaria simulada'}`, balance)
  state = { ...state, balance, receipts: [receipt, ...state.receipts].slice(0, 50) }
  notify()
  return { ok: true, receipt }
}

export function simulateDemoPresale(tokens: number, pricePerToken: number): OperationResult {
  if (![tokens, pricePerToken].every(Number.isFinite) || tokens <= 0 || pricePerToken < 0) {
    return { ok: false, required: tokens * pricePerToken, available: state.balance, message: 'Ingresa una cantidad válida de tokens y un precio configurable.' }
  }
  const total = roundCurrency(tokens * pricePerToken)
  if (state.balance + 0.000001 < total) return resultForInsufficient(total)
  const balance = Math.max(0, state.balance - total)
  const receipt = makeReceipt('presale', 'Asignación de preventa local', total, `${tokens.toLocaleString('es-MX')} tokens de ejemplo añadidos a la vista local`, balance)
  state = { ...state, balance, presaleTokens: state.presaleTokens + tokens, receipts: [receipt, ...state.receipts].slice(0, 50) }
  notify()
  return { ok: true, receipt }
}

export function simulateDirectReferralReward(referredMiningRewards: number, ratePercent = 10): DemoReceipt | null {
  if (!Number.isFinite(referredMiningRewards) || referredMiningRewards <= 0 || !Number.isFinite(ratePercent) || ratePercent < 0) return null
  const amount = roundCurrency(referredMiningRewards * ratePercent / 100)
  const balance = roundCurrency(state.balance + amount)
  const receipt = makeReceipt('referral', 'Recompensa de referido local', amount, `${ratePercent}% de ${referredMiningRewards.toFixed(2)} USD en recompensas mineras simuladas`, balance)
  state = { ...state, balance, receipts: [receipt, ...state.receipts].slice(0, 50) }
  notify()
  return receipt
}

export function getDemoMiningPower(session: DemoSession) {
  const activeMinerIds = new Set(session.workers.filter((worker) => worker.status === 'active-demo').map((worker) => worker.minerId))
  const base = session.miners.reduce((sum, miner) => sum + (activeMinerIds.has(miner.id) && !(miner.expiresAt && Date.parse(miner.expiresAt) <= Date.now()) ? miner.powerTh : 0), 0)
  const hasSubscription = Boolean(session.subscription && Date.parse(session.subscription.endsAt) > Date.now())
  return { base, total: base * (hasSubscription ? 1.01 : 1), bonus: hasSubscription ? base * 0.01 : 0, hasSubscription }
}

export function formatDemoCurrency(amount: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

export function formatWalletBalance(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}
