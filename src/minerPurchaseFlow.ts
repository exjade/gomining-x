import {
  registerWalletMinerPurchase,
  payPendingDemoMiner,
  type PendingDemoMinerOrder,
} from './demoStore.ts'
import type { MinerPlan } from './minerCatalog.ts'
import type { PaymentCurrency } from './paymentQuote.ts'
import type { PaymentNetworkId } from './paymentDestinations.ts'
import type { WalletId } from './walletSession.ts'
import type { StoredMiner } from './firebase.ts'

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
}

export interface CompleteWalletMinerPurchaseOptions {
  recordPurchaseToAdmin?: PurchaseAdminRecorder
  saveMinerToFirestore?: (uid: string, miner: StoredMiner) => Promise<void>
  creditReferral?: (uid: string, email: string, amount: number, minerId: string, txHash: string) => Promise<any>
  linkActiveWallet?: (address: string) => Promise<void>
  onSimulationStart?: (id: string, name: string, powerTh: number) => void
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

export async function completeWalletMinerPurchase(
  params: CompleteWalletMinerPurchaseParams,
  options?: CompleteWalletMinerPurchaseOptions
): Promise<{
  miner: ReturnType<typeof registerWalletMinerPurchase>
  createdMinerId: string
  parsedTh: number
  resolvedPackageId?: string
} | null> {
  const { productName, amount, packageId, purchaseMode, activeAddress, txHash, networkName, catalogUsd, user } = params

  if (!isMinerProduct(productName)) return null

  const parsedTh = parseMinerPowerTh(productName, amount)
  const resolvedPackageId = typeof packageId === 'string' && packageId.trim() ? packageId.trim() : undefined
  const pricePaid = catalogUsd ?? amount
  const resolvedPurchaseMode = purchaseMode ?? 'once'
  const cleanUid = user?.uid?.trim()

  if (user) {
    if (!cleanUid) {
      throw new Error('Canonical wallet miner purchase requires a valid user uid')
    }
    const lowerPkg = resolvedPackageId?.toLowerCase() || ''
    if (!resolvedPackageId || lowerPkg.startsWith('pkg-miner_') || lowerPkg.startsWith('pkg-miner-') || lowerPkg.startsWith('pkg-miner')) {
      throw new Error(`Canonical wallet miner purchase requires a valid packageId, received: '${packageId}'`)
    }
  }

  const miner = registerWalletMinerPurchase(
    {
      name: productName,
      powerTh: parsedTh,
      efficiency: 15,
      price: pricePaid,
      purchaseMode: resolvedPurchaseMode,
      ownerWallet: activeAddress,
      packageId: resolvedPackageId,
    },
    txHash,
    networkName
  )
  const createdMinerId = miner.id

  if (options?.onSimulationStart) {
    options.onSimulationStart(miner.id, miner.name, miner.powerTh)
  }

  // Persist to Firestore: /miners/{uid}/miner/{minerId}
  if (user && options?.saveMinerToFirestore) {
    const nowIso = new Date().toISOString()
    const storedMiner: StoredMiner = {
      id: createdMinerId,
      uid: cleanUid!,
      packageId: resolvedPackageId,
      name: productName,
      powerTh: parsedTh,
      efficiency: 15,
      efficiencyWattsPerTh: 15,
      price: pricePaid,
      currency: 'USD',
      status: 'active',
      txHash,
      createdAt: null,
      createdAtIso: nowIso,
      network: networkName || 'BNB Chain',
      ownerWallet: activeAddress || 'INTERNAL',
      purchaseMode: resolvedPurchaseMode,
      cadence: resolvedPurchaseMode,
      packageSnapshot: {
        packageId: resolvedPackageId!,
        name: productName,
        powerTh: parsedTh,
        price: pricePaid,
        currency: 'USD',
        cadence: resolvedPurchaseMode,
        purchaseMode: resolvedPurchaseMode,
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
    // Fail-closed persistence: if saving to Firestore fails, throw so admin recorder is NOT called
    await options.saveMinerToFirestore(cleanUid!, storedMiner)
    if (options.creditReferral) {
      await options.creditReferral(cleanUid!, user.email || '', pricePaid, createdMinerId, txHash).catch((err) => {
        console.warn('Error crediting referral commission:', err)
      })
    }
    if (activeAddress && options.linkActiveWallet) {
      await options.linkActiveWallet(activeAddress).catch((err) => {
        console.warn('Error linking active wallet:', err)
      })
    }
  }

  // Record purchased miner to platform admin dashboard (/admin_contracts & /admin_orders)
  if (options?.recordPurchaseToAdmin) {
    try {
      await options.recordPurchaseToAdmin({
        minerId: createdMinerId,
        uid: cleanUid || user?.uid,
        email: user?.email || '',
        name: productName,
        powerTh: parsedTh,
        price: pricePaid,
        txHash,
        network: networkName,
        ownerWallet: activeAddress,
        packageId: resolvedPackageId,
      })
    } catch (adminErr) {
      console.warn('Error recording miner purchase to admin platform:', adminErr)
    }
  }

  return { miner, createdMinerId, parsedTh, resolvedPackageId }
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
    },
    options
  )

  return {
    checkoutPayload,
    checkoutState,
    completionResult,
  }
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

  if (options?.user && options?.saveMinerToFirestore) {
    if (!cleanUid) {
      return {
        ok: false,
        message: 'Cannot persist miner without a valid user uid',
      }
    }
    if (!canonicalPackageId || lowerPkg.startsWith('pkg-miner_') || lowerPkg.startsWith('pkg-miner-') || lowerPkg.startsWith('pkg-miner')) {
      return {
        ok: false,
        message: `No se puede completar el pedido pendiente sin un packageId canónico válido: '${order.packageId}'`,
      }
    }
  }

  const result = payPendingDemoMiner(order.id)
  if (!result.ok) {
    return result
  }
  const minerId = result.miner.id

  // Authenticated pending miner order persistence
  if (options?.user && options?.saveMinerToFirestore) {
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
      console.error('Error persisting pending miner to Firestore:', persistErr)
      return {
        ok: false,
        minerId,
        message: persistErr instanceof Error ? persistErr.message : 'Error al persistir el minero en Firestore',
      }
    }
  }

  if (options?.recordPurchaseToAdmin) {
    try {
      await options.recordPurchaseToAdmin({
        minerId,
        uid: cleanUid || options?.user?.uid,
        email: options?.user?.email || '',
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
