import {
  registerWalletMinerPurchase,
  prepareWalletMinerPurchase,
  commitWalletMinerPurchase,
  buyDemoMiner,
  prepareDemoMinerPurchase,
  commitDemoMinerPurchase,
  payPendingDemoMiner,
  preparePayPendingDemoMiner,
  commitPayPendingDemoMiner,
  updateDemoMinerCustomization,
  lockPendingDemoMinerForSettlement,
  releasePendingDemoMinerLock,
  isPendingDemoMinerLocked,
  reserveDemoBalance,
  releaseDemoBalanceReservation,
  commitDemoBalanceReservation,
  getAvailableDemoBalance,
  type PendingDemoMinerOrder,
  type DemoMinerPurchaseInput,
  type DemoMinerPurchaseResult,
  type MinerCustomization,
} from './demoStore.ts'

export {
  isPendingDemoMinerLocked,
  lockPendingDemoMinerForSettlement,
  releasePendingDemoMinerLock,
  reserveDemoBalance,
  releaseDemoBalanceReservation,
  commitDemoBalanceReservation,
  getAvailableDemoBalance,
}
import type { MinerPlan } from './minerCatalog.ts'
import type { PaymentCurrency } from './paymentQuote.ts'
import type { PaymentNetworkId } from './paymentDestinations.ts'
import type { WalletId } from './walletSession.ts'
import { updateMinerInFirestore, type StoredMiner } from './firebase.ts'

export interface PackageSnapshot {
  packageId: string
  name: string
  powerTh: number
  price: number
  currency: string
  cadence: 'once' | 'monthly'
  purchaseMode: 'once' | 'monthly'
}

export interface PostTxPendingState {
  schemaVersion: 1
  status: 'PAYMENT_TRANSMITTED' | 'PERSISTENCE_PENDING'
  txHash: string
  minerId: string
  packageId: string
  productName: string
  amount: number
  powerTh: number
  price: number
  priceUsd?: number
  currency: string
  cadence: 'once' | 'monthly'
  purchaseMode: 'once' | 'monthly'
  networkId: PaymentNetworkId
  networkName: string
  originWalletAddress?: string
  originUid?: string
  packageSnapshot: PackageSnapshot
  createdAt: number
  errorMessage?: string
}

export function validatePostTxRecovery(raw: unknown): PostTxPendingState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const data = raw as Record<string, unknown>

  if (data.schemaVersion !== 1) return null
  if (data.status !== 'PAYMENT_TRANSMITTED' && data.status !== 'PERSISTENCE_PENDING') return null
  if (typeof data.txHash !== 'string' || !data.txHash.trim()) return null
  if (typeof data.minerId !== 'string' || !data.minerId.trim()) return null

  if (typeof data.packageId !== 'string' || !data.packageId.trim()) return null
  const lowerPkg = data.packageId.trim().toLowerCase()
  if (lowerPkg.startsWith('pkg-miner_') || lowerPkg.startsWith('pkg-miner-') || lowerPkg.startsWith('pkg-miner')) {
    return null
  }

  if (typeof data.productName !== 'string' || !data.productName.trim()) return null
  if (typeof data.amount !== 'number' || !Number.isFinite(data.amount) || data.amount <= 0) return null
  if (typeof data.powerTh !== 'number' || !Number.isFinite(data.powerTh) || data.powerTh <= 0) return null
  if (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price <= 0) return null
  if (typeof data.currency !== 'string' || !data.currency.trim()) return null

  if (data.cadence !== 'once' && data.cadence !== 'monthly') return null
  if (data.purchaseMode !== 'once' && data.purchaseMode !== 'monthly') return null

  const validNetworks = ['bnb', 'ethereum', 'polygon', 'solana']
  if (typeof data.networkId !== 'string' || !validNetworks.includes(data.networkId)) return null
  if (typeof data.networkName !== 'string' || !data.networkName.trim()) return null

  // Originator binding: must have at least originUid or originWalletAddress
  const hasOriginUid = typeof data.originUid === 'string' && Boolean(data.originUid.trim())
  const hasOriginWallet = typeof data.originWalletAddress === 'string' && Boolean(data.originWalletAddress.trim())
  if (!hasOriginUid && !hasOriginWallet) return null

  // Package snapshot validation
  if (!data.packageSnapshot || typeof data.packageSnapshot !== 'object' || Array.isArray(data.packageSnapshot)) return null
  const snap = data.packageSnapshot as Record<string, unknown>
  if (typeof snap.packageId !== 'string' || !snap.packageId.trim()) return null
  const lowerSnapPkg = snap.packageId.trim().toLowerCase()
  if (lowerSnapPkg.startsWith('pkg-miner_') || lowerSnapPkg.startsWith('pkg-miner-') || lowerSnapPkg.startsWith('pkg-miner')) {
    return null
  }
  if (typeof snap.name !== 'string' || !snap.name.trim()) return null
  if (typeof snap.powerTh !== 'number' || !Number.isFinite(snap.powerTh) || snap.powerTh <= 0) return null
  if (typeof snap.price !== 'number' || !Number.isFinite(snap.price) || snap.price <= 0) return null
  if (typeof snap.currency !== 'string' || !snap.currency.trim()) return null
  if (snap.cadence !== 'once' && snap.cadence !== 'monthly') return null
  if (snap.purchaseMode !== 'once' && snap.purchaseMode !== 'monthly') return null

  // Blocker A: Strict consistency between top-level fields and authoritative packageSnapshot
  if (data.packageId.trim() !== snap.packageId.trim()) return null
  if (data.powerTh !== snap.powerTh) return null
  if (data.price !== snap.price) return null
  if (data.currency.trim() !== snap.currency.trim()) return null
  if (data.cadence !== snap.cadence) return null
  if (data.purchaseMode !== snap.purchaseMode) return null

  if (typeof data.createdAt !== 'number' || !Number.isFinite(data.createdAt) || data.createdAt <= 0) return null

  return {
    schemaVersion: 1,
    status: data.status,
    txHash: data.txHash.trim(),
    minerId: data.minerId.trim(),
    packageId: data.packageId.trim(),
    productName: data.productName.trim(),
    amount: data.amount,
    powerTh: data.powerTh,
    price: data.price,
    priceUsd: typeof data.priceUsd === 'number' && Number.isFinite(data.priceUsd) ? data.priceUsd : undefined,
    currency: data.currency.trim(),
    cadence: data.cadence,
    purchaseMode: data.purchaseMode,
    networkId: data.networkId as PaymentNetworkId,
    networkName: data.networkName.trim(),
    originWalletAddress: hasOriginWallet ? (data.originWalletAddress as string).trim() : undefined,
    originUid: hasOriginUid ? (data.originUid as string).trim() : undefined,
    packageSnapshot: {
      packageId: snap.packageId.trim(),
      name: snap.name.trim(),
      powerTh: snap.powerTh,
      price: snap.price,
      currency: snap.currency.trim(),
      cadence: snap.cadence,
      purchaseMode: snap.purchaseMode,
    },
    createdAt: data.createdAt,
    errorMessage: typeof data.errorMessage === 'string' ? data.errorMessage : undefined,
  }
}

export function getPostTxRecovery(): PostTxPendingState | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const stored = window.localStorage.getItem('gomining_post_tx_recovery')
    if (!stored) return null
    const parsed = JSON.parse(stored)
    const validated = validatePostTxRecovery(parsed)
    if (!validated) {
      window.localStorage.removeItem('gomining_post_tx_recovery')
      return null
    }
    return validated
  } catch {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('gomining_post_tx_recovery')
      }
    } catch {}
    return null
  }
}

export function savePostTxRecovery(state: PostTxPendingState): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem('gomining_post_tx_recovery', JSON.stringify(state))
  } catch (err) {
    console.error('Failed to save post-tx recovery state:', err)
  }
}

export function clearPostTxRecovery(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.removeItem('gomining_post_tx_recovery')
  } catch {}
}

export async function saveMinerCustomization({
  minerId,
  user,
  customization,
  updateFirestore = updateMinerInFirestore,
  updateDemo = updateDemoMinerCustomization,
}: {
  minerId: string
  user?: { uid: string } | null
  customization: MinerCustomization
  updateFirestore?: (uid: string, minerId: string, data: any) => Promise<void>
  updateDemo?: (minerId: string, customization: any) => void
}): Promise<void> {
  if (user && minerId) {
    await updateFirestore(user.uid, minerId, {
      visualTraits: customization,
    })
  } else {
    updateDemo(minerId, {
      ...customization,
      updatedAt: new Date().toISOString(),
    })
  }
}

export type MinerCategoryTab = 'packages' | 'presale' | 'launch' | 'monthly'

export type PurchaseAdminRecorder = (params: {
  minerId: string
  uid?: string
  email?: string
  name: string
  powerTh: number
  price: number
  txHash?: string
  network?: string
  ownerWallet?: string
  packageId?: string
}) => Promise<void>

export interface MinerBuilderCheckoutInput {
  selected?: MinerPlan | null
  isCustom?: boolean
  customTier?: { powerTh: number; priceUsd: number } | null
  categoryTab?: MinerCategoryTab
}

export interface MinerBuilderCheckoutPayload {
  powerTh: number
  productName: string
  amount: number
  currency: PaymentCurrency
  packageId?: string
  purchaseMode: 'once' | 'monthly'
}

export interface WalletCheckoutState {
  productName: string
  amount: number
  currency: PaymentCurrency
  packageId?: string
  purchaseMode?: 'once' | 'monthly'
  networkId?: PaymentNetworkId
  walletId?: WalletId
}

export interface CompleteWalletMinerPurchaseParams {
  productName: string
  amount: number
  packageId?: string
  purchaseMode?: 'once' | 'monthly'
  activeAddress?: string
  txHash: string
  networkName: string
  catalogUsd?: number
  user?: { uid: string; email?: string | null } | null
  minerId?: string
  requireCanonicalPackageId?: boolean
  packageSnapshot?: PackageSnapshot
}

export interface CompleteWalletMinerPurchaseOptions {
  recordPurchaseToAdmin?: PurchaseAdminRecorder
  saveMinerToFirestore?: (uid: string, miner: StoredMiner) => Promise<void>
  creditReferral?: (uid: string, email: string, amount: number, minerId: string, txHash: string) => Promise<any>
  linkActiveWallet?: (address: string) => Promise<void>
  onSimulationStart?: (id: string, name: string, powerTh: number) => void
  user?: { uid: string; email?: string | null } | null
  activeAddress?: string
}

export function isMinerProduct(productName: string): boolean {
  const lower = productName.toLowerCase()
  return (
    lower.includes('miner') ||
    lower.includes('esencial') ||
    lower.includes('pro') ||
    lower.includes('th') ||
    lower.includes('preventa') ||
    lower.includes('lanzamiento')
  )
}

export function parseMinerPowerTh(productName: string, amount: number): number {
  const match = productName.match(/([\d.]+)\s*TH/i)
  if (match) return Number(match[1])
  const lower = productName.toLowerCase()
  if (lower.includes('enterprise')) return 192
  if (lower.includes('master')) return 128
  if (lower.includes('pro')) return 96
  if (lower.includes('standard')) return 64
  if (lower.includes('entry')) return 48
  if (lower.includes('max')) return 42.44
  if (lower.includes('esencial')) return 5.83
  return Number((amount / 12.99).toFixed(2)) || 1.46
}

export function buildMinerBuilderCheckoutPayload(input: MinerBuilderCheckoutInput): MinerBuilderCheckoutPayload {
  const isCustom = Boolean(input.isCustom)
  const selected = input.selected
  const powerTh = isCustom ? (input.customTier?.powerTh ?? 48) : (selected?.powerTh ?? 48)
  const amount = isCustom ? (input.customTier?.priceUsd ?? 561.99) : (selected?.price ?? 561.99)
  const currency: PaymentCurrency = 'USD'
  const purchaseMode: 'once' | 'monthly' = input.categoryTab === 'monthly' ? 'monthly' : 'once'
  const rawPackageId = isCustom ? 'minerx-custom' : (selected?.packageId || selected?.id)
  const packageId = typeof rawPackageId === 'string' && rawPackageId.trim() ? rawPackageId.trim() : undefined
  const selectedLabel = selected?.label ?? `${powerTh} TH`
  const productName = isCustom
    ? `Minero personalizado · ${powerTh} TH`
    : selectedLabel.toLowerCase().startsWith('minero')
      ? `${selectedLabel} · ${powerTh} TH`
      : `Minero ${selectedLabel} · ${powerTh} TH`

  return {
    powerTh,
    productName,
    amount,
    currency,
    packageId,
    purchaseMode,
  }
}

export function createWalletCheckoutState(
  productName: string,
  amount: number,
  currency: PaymentCurrency = 'USD',
  packageId?: string,
  purchaseMode?: 'once' | 'monthly',
  networkId?: PaymentNetworkId,
  walletId?: WalletId
): WalletCheckoutState {
  return {
    productName,
    amount,
    currency,
    packageId,
    purchaseMode,
    networkId,
    walletId,
  }
}

export function resolvePendingRecoveryCheckout(
  recovery: PostTxPendingState | null,
  user: { uid: string } | null | undefined,
  loading: boolean = false
): WalletCheckoutState | null {
  if (loading || !recovery) return null
  if (recovery.originUid) {
    if (!user || user.uid !== recovery.originUid) {
      return null
    }
  }
  return {
    productName: recovery.productName,
    amount: recovery.amount,
    currency: (recovery.currency as PaymentCurrency) || 'USD',
    packageId: recovery.packageId,
    purchaseMode: recovery.purchaseMode,
    networkId: recovery.networkId,
  }
}

export async function completeWalletMinerPurchase(
  params: CompleteWalletMinerPurchaseParams,
  options?: CompleteWalletMinerPurchaseOptions
): Promise<{
  miner: ReturnType<typeof registerWalletMinerPurchase>
  createdMinerId: string
  parsedTh: number
  resolvedPackageId?: string
} | null> {
  const { productName, amount, packageId, purchaseMode, activeAddress, txHash, networkName, catalogUsd, user, minerId: preallocatedMinerId, packageSnapshot } = params

  if (!isMinerProduct(productName)) return null

  // Blocker A: Recovery Snapshot Authority on Retry
  const authoritativeSnapshot = packageSnapshot
  const effectivePowerTh = authoritativeSnapshot ? authoritativeSnapshot.powerTh : parseMinerPowerTh(productName, amount)
  const effectivePrice = authoritativeSnapshot ? authoritativeSnapshot.price : (catalogUsd ?? amount)
  const effectivePackageId = (authoritativeSnapshot?.packageId ?? (typeof packageId === 'string' && packageId.trim() ? packageId.trim() : undefined))
  const resolvedPackageId = effectivePackageId ? effectivePackageId.trim() : undefined
  const effectiveName = authoritativeSnapshot ? authoritativeSnapshot.name.trim() : productName
  const effectiveCurrency = authoritativeSnapshot ? authoritativeSnapshot.currency.trim() : 'USD'
  const effectivePurchaseMode = authoritativeSnapshot ? authoritativeSnapshot.purchaseMode : (purchaseMode ?? 'once')
  const effectiveCadence = authoritativeSnapshot ? authoritativeSnapshot.cadence : effectivePurchaseMode
  const cleanUid = user?.uid?.trim()
  const lowerPkg = resolvedPackageId?.toLowerCase() || ''

  // Blocker 11: Canonical wallet miner purchase unconditionally requires a valid canonical packageId for all callers (authenticated and guest)
  if (!resolvedPackageId || lowerPkg.startsWith('pkg-miner_') || lowerPkg.startsWith('pkg-miner-') || lowerPkg.startsWith('pkg-miner')) {
    throw new Error(`Canonical wallet miner purchase requires a valid packageId, received: '${packageId}'`)
  }

  // R5: Adapter guard when user exists
  if (user) {
    if (!cleanUid) {
      throw new Error('Canonical wallet miner purchase requires a valid user uid')
    }
    if (!options?.saveMinerToFirestore) {
      throw new Error('saveMinerToFirestore adapter is required for authenticated wallet miner purchase')
    }
  }

  // Prepare miner object without mutating local store
  const miner = prepareWalletMinerPurchase(
    {
      name: effectiveName,
      powerTh: effectivePowerTh,
      efficiency: 15,
      price: effectivePrice,
      purchaseMode: effectivePurchaseMode,
      ownerWallet: activeAddress,
      packageId: resolvedPackageId,
    },
    preallocatedMinerId
  )
  const createdMinerId = miner.id

  // Persist to Firestore: /miners/{uid}/miner/{minerId}
  if (user && options?.saveMinerToFirestore) {
    const nowIso = new Date().toISOString()
    const storedMiner: StoredMiner = {
      id: createdMinerId,
      uid: cleanUid!,
      packageId: resolvedPackageId,
      name: effectiveName,
      powerTh: effectivePowerTh,
      efficiency: 15,
      efficiencyWattsPerTh: 15,
      price: effectivePrice,
      currency: effectiveCurrency,
      status: 'active',
      txHash,
      createdAt: null,
      createdAtIso: nowIso,
      network: networkName || 'BNB Chain',
      ownerWallet: activeAddress || 'INTERNAL',
      purchaseMode: effectivePurchaseMode,
      cadence: effectiveCadence,
      packageSnapshot: authoritativeSnapshot
        ? {
            packageId: authoritativeSnapshot.packageId.trim(),
            name: authoritativeSnapshot.name.trim(),
            powerTh: authoritativeSnapshot.powerTh,
            price: authoritativeSnapshot.price,
            currency: authoritativeSnapshot.currency.trim(),
            cadence: authoritativeSnapshot.cadence,
            purchaseMode: authoritativeSnapshot.purchaseMode,
          }
        : {
            packageId: resolvedPackageId!,
            name: effectiveName,
            powerTh: effectivePowerTh,
            price: effectivePrice,
            currency: effectiveCurrency,
            cadence: effectiveCadence,
            purchaseMode: effectivePurchaseMode,
          },
      visualTraits: {
        wallColor: '#7c3aed',
        bodyColor: '#1e1b4b',
        bottomColor: '#e2e8f0',
        fansColor: '#1e293b',
        screenColor: '#22c55e',
        buttonsColor: '#64748b',
        topColor: '#0f172a',
        stickers: 'gomining-classic',
      },
    }
    // Fail-closed persistence: if saving to Firestore fails, throw so local state / simulation / admin recorder are NOT touched
    await options.saveMinerToFirestore(cleanUid!, storedMiner)
    if (options.creditReferral) {
      await options.creditReferral(cleanUid!, user.email || '', effectivePrice, createdMinerId, txHash).catch((err) => {
        console.warn('Error crediting referral commission:', err)
      })
    }
    if (activeAddress && options.linkActiveWallet) {
      await options.linkActiveWallet(activeAddress).catch((err) => {
        console.warn('Error linking active wallet:', err)
      })
    }
  }

  // Only commit local state AFTER Firestore persistence succeeded (or if guest)
  commitWalletMinerPurchase(miner, txHash, networkName)

  if (options?.onSimulationStart) {
    options.onSimulationStart(miner.id, miner.name, miner.powerTh)
  }

  // Record purchased miner to platform admin dashboard (/admin_contracts & /admin_orders)
  // Blocker 9 & Blocker E: Deterministic guest wallet identity without generic usr_client
  if (options?.recordPurchaseToAdmin) {
    const adminUid = cleanUid || user?.uid || (activeAddress ? `guest_wallet_${activeAddress.trim().toLowerCase()}` : undefined)
    await options.recordPurchaseToAdmin({
      minerId: createdMinerId,
      uid: adminUid,
      email: user?.email || '',
      name: effectiveName,
      powerTh: effectivePowerTh,
      price: effectivePrice,
      txHash,
      network: networkName,
      ownerWallet: activeAddress,
      packageId: resolvedPackageId,
    })
  }

  return { miner, createdMinerId, parsedTh: effectivePowerTh, resolvedPackageId }
}

export async function retryWalletMinerPurchase(
  recovery: PostTxPendingState,
  options?: CompleteWalletMinerPurchaseOptions
) {
  // Blocker 7: Enforce identity binding to original account and wallet
  if (recovery.originUid) {
    if (!options?.user || options.user.uid !== recovery.originUid) {
      throw new Error(`Esta recuperación pertenece a otra cuenta (${recovery.originUid}). Inicia sesión con la cuenta originaria.`)
    }
  }
  if (recovery.originWalletAddress) {
    if (!options?.activeAddress || options.activeAddress.toLowerCase() !== recovery.originWalletAddress.toLowerCase()) {
      throw new Error(`Esta recuperación requiere conectar la billetera originaria (${recovery.originWalletAddress}).`)
    }
  }

  return completeWalletMinerPurchase(
    {
      productName: recovery.productName,
      amount: recovery.amount,
      packageId: recovery.packageId,
      purchaseMode: recovery.purchaseMode,
      activeAddress: options?.activeAddress ?? recovery.originWalletAddress,
      txHash: recovery.txHash,
      networkName: recovery.networkName,
      catalogUsd: recovery.priceUsd ?? recovery.price,
      user: options?.user ?? (recovery.originUid ? { uid: recovery.originUid } : null),
      minerId: recovery.minerId,
      requireCanonicalPackageId: true,
      packageSnapshot: recovery.packageSnapshot,
    },
    options
  )
}

export async function orchestrateWalletMinerPurchaseFlow(
  builderInput: MinerBuilderCheckoutInput,
  executionInput: {
    txHash: string
    activeAddress?: string
    networkName?: string
    user?: { uid: string; email?: string | null } | null
  },
  options?: CompleteWalletMinerPurchaseOptions
) {
  // 1. MinerBuilderDialog metadata and checkout payload derivation
  const checkoutPayload = buildMinerBuilderCheckoutPayload(builderInput)

  // 2. App onPayWithWallet handler creating checkout state
  const checkoutState = createWalletCheckoutState(
    checkoutPayload.productName,
    checkoutPayload.amount,
    checkoutPayload.currency,
    checkoutPayload.packageId,
    checkoutPayload.purchaseMode
  )

  // 3. WalletPaymentCheckout completion and admin recording
  const completionResult = await completeWalletMinerPurchase(
    {
      productName: checkoutState.productName,
      amount: checkoutState.amount,
      packageId: checkoutState.packageId,
      purchaseMode: checkoutState.purchaseMode,
      activeAddress: executionInput.activeAddress,
      txHash: executionInput.txHash,
      networkName: executionInput.networkName ?? 'BNB Chain',
      user: executionInput.user,
      requireCanonicalPackageId: true,
    },
    options
  )

  return {
    checkoutPayload,
    checkoutState,
    completionResult,
  }
}

export interface CompleteLocalMinerPurchaseOptions {
  user?: { uid: string; email?: string | null } | null
  saveMinerToFirestore?: (uid: string, miner: StoredMiner) => Promise<void>
  recordPurchaseToAdmin?: PurchaseAdminRecorder
}

export async function completeLocalMinerPurchase(
  input: DemoMinerPurchaseInput,
  options?: CompleteLocalMinerPurchaseOptions
): Promise<DemoMinerPurchaseResult> {
  const canonicalPackageId = input.packageId?.trim()
  const lowerPkg = canonicalPackageId?.toLowerCase() || ''
  if (!canonicalPackageId || lowerPkg.startsWith('pkg-miner_') || lowerPkg.startsWith('pkg-miner-') || lowerPkg.startsWith('pkg-miner')) {
    return {
      ok: false,
      required: input.price,
      available: 0,
      message: `No se puede completar la compra sin un packageId canónico válido: '${input.packageId}'`,
    }
  }

  const cleanUid = options?.user?.uid?.trim()

  if (options?.user) {
    if (!cleanUid) {
      return {
        ok: false,
        required: input.price,
        available: 0,
        message: 'No se puede guardar el minero sin un UID de usuario válido',
      }
    }
    if (!options?.saveMinerToFirestore) {
      return {
        ok: false,
        required: input.price,
        available: 0,
        message: 'saveMinerToFirestore adapter is required for authenticated local miner purchase',
      }
    }

    const prep = prepareDemoMinerPurchase({ ...input, packageId: canonicalPackageId })
    if (!prep.ok) return prep

    // Blocker C & D: Reserve balance atomically BEFORE Firestore
    const reservation = reserveDemoBalance(prep.price)
    if (!reservation.ok) {
      return reservation
    }

    const minerId = prep.miner.id
    const nowIso = new Date().toISOString()
    const purchaseMode = (input.purchaseMode as any) || 'once'
    const storedMiner: StoredMiner = {
      id: minerId,
      uid: cleanUid,
      packageId: canonicalPackageId,
      name: input.name,
      powerTh: input.powerTh,
      efficiency: input.efficiency,
      efficiencyWattsPerTh: input.efficiency,
      price: prep.price,
      currency: 'USD',
      status: 'active',
      txHash: `sim_${minerId}`,
      createdAt: null,
      createdAtIso: nowIso,
      network: 'LOCAL_BALANCE',
      ownerWallet: input.ownerWallet || 'INTERNAL',
      purchaseMode,
      cadence: purchaseMode,
      packageSnapshot: {
        packageId: canonicalPackageId,
        name: input.name,
        powerTh: input.powerTh,
        price: prep.price,
        currency: 'USD',
        cadence: purchaseMode,
        purchaseMode,
      },
      visualTraits: {
        wallColor: '#7c3aed',
        bodyColor: '#1e1b4b',
        bottomColor: '#e2e8f0',
        fansColor: '#1e293b',
        screenColor: '#22c55e',
        buttonsColor: '#64748b',
        topColor: '#0f172a',
        stickers: 'gomining-classic',
      },
    }

    try {
      await options.saveMinerToFirestore(cleanUid, storedMiner)
    } catch (persistErr) {
      releaseDemoBalanceReservation(reservation.reservationId)
      console.error('Error persisting purchased miner to Firestore:', persistErr)
      return {
        ok: false,
        required: prep.price,
        available: getAvailableDemoBalance(),
        message: persistErr instanceof Error ? persistErr.message : 'Error al guardar el minero en Firestore',
      }
    }

    const commitRes = commitDemoMinerPurchase(prep.miner, prep.price, reservation.reservationId)
    // Blocker 2: R1 Local Commit Gates Admin
    if (!commitRes.ok) {
      return commitRes
    }

    if (options.recordPurchaseToAdmin) {
      try {
        await options.recordPurchaseToAdmin({
          minerId,
          uid: cleanUid,
          email: options.user.email || '',
          name: input.name,
          powerTh: input.powerTh,
          price: prep.price,
          txHash: `sim_${minerId}`,
          network: 'LOCAL_BALANCE',
          ownerWallet: input.ownerWallet,
          packageId: canonicalPackageId,
        })
      } catch (adminErr) {
        console.warn('Error recording miner purchase to admin platform:', adminErr)
      }
    }
    return commitRes
  }

  const result = buyDemoMiner({ ...input, packageId: canonicalPackageId })
  if (!result.ok) return result
  const minerId = result.miner.id
  if (options?.user && options?.recordPurchaseToAdmin) {
    try {
      await options.recordPurchaseToAdmin({
        minerId,
        uid: options.user.uid,
        email: options.user.email || '',
        name: input.name,
        powerTh: input.powerTh,
        price: input.price,
        txHash: `sim_${minerId}`,
        network: 'LOCAL_BALANCE',
        ownerWallet: input.ownerWallet,
        packageId: canonicalPackageId,
      })
    } catch (adminErr) {
      console.warn('Error recording miner purchase to admin platform:', adminErr)
    }
  }
  return result
}

export type PayPendingMinerOrderResult =
  | (ReturnType<typeof payPendingDemoMiner> & { minerId?: string })
  | { ok: false; message: string; minerId?: string; required?: number; available?: number }

export interface PayPendingMinerOrderOptions {
  user?: { uid: string; email?: string | null } | null
  recordPurchaseToAdmin?: PurchaseAdminRecorder
  saveMinerToFirestore?: (uid: string, miner: StoredMiner) => Promise<void>
}

export async function payPendingMinerOrderAndRecordToAdmin(
  order: PendingDemoMinerOrder,
  options?: PayPendingMinerOrderOptions
): Promise<PayPendingMinerOrderResult> {
  const canonicalPackageId = typeof order.packageId === 'string' && order.packageId.trim() ? order.packageId.trim() : undefined
  const lowerPkg = canonicalPackageId?.toLowerCase() || ''
  const cleanUid = options?.user?.uid?.trim()

  // Blocker 1: Atomic settlement lock eliminates Firestore orphan race
  if (!lockPendingDemoMinerForSettlement(order.id)) {
    return {
      ok: false,
      message: 'No se encontró ese pedido local pendiente.',
    }
  }

  try {
    if (options?.user) {
      if (!cleanUid) {
        return {
          ok: false,
          message: 'Cannot persist miner without a valid user uid',
        }
      }
      if (!options?.saveMinerToFirestore) {
        return {
          ok: false,
          message: 'saveMinerToFirestore adapter is required for authenticated pending miner order',
        }
      }
      if (!canonicalPackageId || lowerPkg.startsWith('pkg-miner_') || lowerPkg.startsWith('pkg-miner-') || lowerPkg.startsWith('pkg-miner')) {
        return {
          ok: false,
          message: `No se puede completar el pedido pendiente sin un packageId canónico válido: '${order.packageId}'`,
        }
      }

      const prep = preparePayPendingDemoMiner(order.id)
      if (!prep.ok) {
        return prep
      }

      // Blocker C & D: Reserve balance across distinct orders BEFORE Firestore
      const reservation = reserveDemoBalance(prep.price, `RES-ORDER-${order.id}`)
      if (!reservation.ok) {
        return reservation
      }

      const minerId = prep.miner.id
      const nowIso = new Date().toISOString()
      const purchaseMode = (order.purchaseMode as any) || 'once'
      const storedMiner: StoredMiner = {
        id: minerId,
        uid: cleanUid!,
        packageId: canonicalPackageId!,
        name: order.name,
        powerTh: order.powerTh,
        efficiency: order.efficiency,
        efficiencyWattsPerTh: order.efficiency,
        price: order.price,
        currency: 'USD',
        status: 'active',
        txHash: `sim_pending_${order.id}`,
        createdAt: null,
        createdAtIso: nowIso,
        network: 'LOCAL_BALANCE',
        ownerWallet: order.ownerWallet || 'INTERNAL',
        purchaseMode,
        cadence: purchaseMode,
        packageSnapshot: {
          packageId: canonicalPackageId!,
          name: order.name,
          powerTh: order.powerTh,
          price: order.price,
          currency: 'USD',
          cadence: purchaseMode,
          purchaseMode,
        },
        visualTraits: {
          wallColor: '#7c3aed',
          bodyColor: '#1e1b4b',
          bottomColor: '#e2e8f0',
          fansColor: '#1e293b',
          screenColor: '#22c55e',
          buttonsColor: '#64748b',
          topColor: '#0f172a',
          stickers: 'gomining-classic',
        },
      }

      try {
        await options.saveMinerToFirestore(cleanUid!, storedMiner)
      } catch (persistErr) {
        releaseDemoBalanceReservation(reservation.reservationId)
        console.error('Error persisting pending miner to Firestore:', persistErr)
        return {
          ok: false,
          minerId,
          required: order.price,
          available: getAvailableDemoBalance(),
          message: persistErr instanceof Error ? persistErr.message : 'Error al persistir el minero en Firestore',
        }
      }

      const result = commitPayPendingDemoMiner(order.id, prep.miner, prep.price, reservation.reservationId)
      if (!result.ok) {
        return result
      }

      if (options.recordPurchaseToAdmin) {
        try {
          await options.recordPurchaseToAdmin({
            minerId,
            uid: cleanUid,
            email: options.user.email || '',
            name: order.name,
            powerTh: order.powerTh,
            price: order.price,
            txHash: `sim_pending_${order.id}`,
            network: 'LOCAL_BALANCE',
            ownerWallet: order.ownerWallet || 'INTERNAL',
            packageId: canonicalPackageId,
          })
        } catch (err) {
          console.warn('Error recording pending miner purchase to admin:', err)
        }
      }
      return { ...result, minerId }
    }

    const result = payPendingDemoMiner(order.id)
    if (!result.ok) {
      return result
    }
    const minerId = result.miner.id
    return { ...result, minerId }
  } finally {
    releasePendingDemoMinerLock(order.id)
  }
}
