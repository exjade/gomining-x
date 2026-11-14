import { sanitizeFirestoreErrorMessage } from './firebase.ts'

export interface PlatformPurchaseUser {
  uid: string
  isAnonymous?: boolean
  getIdToken: () => Promise<string>
}

export interface PurchaseWithPlatformBalanceParams {
  packageId: string
  purchaseId?: string
  user: PlatformPurchaseUser | null | undefined
  baseUrl?: string
}

export interface PlatformBalancePurchaseSuccess {
  ok: true
  minerId: string
  orderId: string
  balance: number
  purchaseId: string
}

export interface PlatformBalancePurchaseFailure {
  ok: false
  message: string
}

export type PlatformBalancePurchaseResult =
  | PlatformBalancePurchaseSuccess
  | PlatformBalancePurchaseFailure

export function generatePlatformPurchaseId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'pb_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  }
  return 'pb_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10)
}

export async function purchaseWithPlatformBalance(
  params: PurchaseWithPlatformBalanceParams
): Promise<PlatformBalancePurchaseResult> {
  const { user, packageId, baseUrl = '' } = params

  if (!user || user.isAnonymous) {
    return {
      ok: false,
      message: 'Se requiere una cuenta autenticada y no anónima para comprar con saldo de plataforma.',
    }
  }

  const cleanPackageId = packageId?.trim()
  const lowerPkg = cleanPackageId?.toLowerCase() || ''
  if (!cleanPackageId || lowerPkg.startsWith('pkg-miner_') || lowerPkg.startsWith('pkg-miner-') || lowerPkg.startsWith('pkg-miner')) {
    return {
      ok: false,
      message: `No se puede completar la compra sin un packageId canónico válido: '${packageId}'`,
    }
  }

  const cleanPurchaseId = params.purchaseId?.trim() || generatePlatformPurchaseId()

  let idToken: string
  try {
    idToken = await user.getIdToken()
    if (!idToken || typeof idToken !== 'string') {
      return {
        ok: false,
        message: 'Token de autenticación no disponible.',
      }
    }
  } catch (err) {
    return {
      ok: false,
      message: sanitizeFirestoreErrorMessage(err, 'Error al obtener el token de autenticación.'),
    }
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/api/purchases/platform-balance`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        packageId: cleanPackageId,
        purchaseId: cleanPurchaseId,
      }),
    })

    if (!response.ok) {
      let rawMessage: string
      try {
        const errorBody = await response.json()
        rawMessage = errorBody?.error || errorBody?.message || `Error del servidor (${response.status})`
      } catch {
        rawMessage = `Error del servidor (${response.status})`
      }
      return {
        ok: false,
        message: sanitizeFirestoreErrorMessage(rawMessage, 'No se pudo completar la compra con saldo.'),
      }
    }

    const data = await response.json()
    return {
      ok: true,
      minerId: data.minerId,
      orderId: data.orderId,
      balance: data.balance,
      purchaseId: cleanPurchaseId,
    }
  } catch (err) {
    return {
      ok: false,
      message: sanitizeFirestoreErrorMessage(err, 'Error de red o conexión con el servidor.'),
    }
  }
}
