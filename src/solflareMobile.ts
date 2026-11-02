import bs58 from 'bs58'
import nacl from 'tweetnacl'
import type { PaymentQuote } from './paymentQuote'

const SESSION_KEY = 'gm:solflare:mobile-session:v1'
const PENDING_KEY = 'gm:solflare:mobile-pending:v1'

export type SolflareMobileSession = {
  address: string
  dappPublicKey: string
  dappSecretKey: string
  solflarePublicKey: string
  session: string
}

type PendingConnect = {
  type: 'connect'
  state: string
  dappPublicKey: string
  dappSecretKey: string
}

type PendingPayment = {
  type: 'payment'
  state: string
  quote: PaymentQuote
  productName: string
  sender: string
}

type PendingRequest = PendingConnect | PendingPayment

export type SolflarePaymentReturn =
  | { status: 'approved'; signature: string; quote: PaymentQuote; productName: string; sender: string; sentAt: number }
  | { status: 'rejected'; message: string }

export type SolflareReturn =
  | { type: 'connected'; session: SolflareMobileSession }
  | { type: 'connect-rejected'; message: string }
  | { type: 'payment'; result: SolflarePaymentReturn }
  | { type: 'error'; message: string }

export function createSolflareConnectUrl(target: string) {
  const returnUrl = new URL(target)
  assertPublicHttps(returnUrl)
  const pair = nacl.box.keyPair()
  const state = randomBase58(18)
  const pending: PendingConnect = {
    type: 'connect',
    state,
    dappPublicKey: bs58.encode(pair.publicKey),
    dappSecretKey: bs58.encode(pair.secretKey),
  }
  writeSessionValue(PENDING_KEY, pending)

  const redirect = cleanReturnUrl(returnUrl)
  redirect.searchParams.set('gmSolflareCallback', 'connect')
  redirect.searchParams.set('gmSolflareState', state)
  const params = new URLSearchParams({
    app_url: `${returnUrl.origin}/`,
    dapp_encryption_public_key: pending.dappPublicKey,
    redirect_link: redirect.toString(),
    cluster: 'mainnet-beta',
  })
  return `https://solflare.com/ul/v1/connect?${params.toString()}`
}

export async function createSolflarePaymentUrl(input: {
  target: string
  transaction: Uint8Array
  quote: PaymentQuote
  productName: string
  sender: string
}) {
  const returnUrl = new URL(input.target)
  assertPublicHttps(returnUrl)
  const walletSession = readSolflareMobileSession()
  if (!walletSession) throw new Error('La sesión nativa de Solflare no está disponible. Vuelve a conectar la wallet.')
  if (walletSession.address !== input.sender) throw new Error('La cuenta de Solflare cambió; vuelve a revisar el pago.')
  if (input.quote.networkId !== 'solana' || input.quote.asset !== 'USDT') throw new Error('Solflare móvil solo admite USDT SPL en este checkout.')

  const state = randomBase58(18)
  const nonce = nacl.randomBytes(24)
  const sharedSecret = deriveSharedSecret(walletSession)
  const encrypted = nacl.box.after(
    new TextEncoder().encode(JSON.stringify({
      session: walletSession.session,
      transaction: bs58.encode(input.transaction),
    })),
    nonce,
    sharedSecret,
  )
  const pending: PendingPayment = {
    type: 'payment',
    state,
    quote: input.quote,
    productName: input.productName,
    sender: input.sender,
  }
  writeSessionValue(PENDING_KEY, pending)

  const redirect = cleanReturnUrl(returnUrl)
  redirect.searchParams.set('gmSolflareCallback', 'payment')
  redirect.searchParams.set('gmSolflareState', state)
  const params = new URLSearchParams({
    dapp_encryption_public_key: walletSession.dappPublicKey,
    nonce: bs58.encode(nonce),
    redirect_link: redirect.toString(),
    payload: bs58.encode(encrypted),
  })
  return `https://solflare.com/ul/v1/signAndSendTransaction?${params.toString()}`
}

export function consumeSolflareReturn(href: string): SolflareReturn | null {
  const url = new URL(href)
  const callbackType = url.searchParams.get('gmSolflareCallback')
  const callbackState = url.searchParams.get('gmSolflareState')
  if (!callbackType || !callbackState) return null

  const pending = readSessionValue<PendingRequest>(PENDING_KEY)
  const walletError = url.searchParams.get('errorCode')
  const walletMessage = url.searchParams.get('errorMessage')
  let result: SolflareReturn

  if (!pending || pending.state !== callbackState || pending.type !== callbackType) {
    result = { type: 'error', message: 'No se pudo verificar el regreso de Solflare. No vuelvas a aprobar la solicitud; revisa la actividad de la wallet.' }
  } else if (walletError) {
    const rejected = walletError === '4001'
    const message = rejected
      ? 'Cancelaste la solicitud en Solflare. No se envió ningún pago.'
      : `Solflare no completó la solicitud${walletMessage ? ` (${walletMessage.slice(0, 160)})` : ` (código ${walletError})`}.`
    if (pending.type === 'connect') {
      result = { type: 'connect-rejected', message }
    } else {
      result = { type: 'payment', result: { status: 'rejected', message } }
    }
  } else {
    try {
      const data = url.searchParams.get('data')
      const nonce = url.searchParams.get('nonce')
      if (!data || !nonce) throw new Error('La respuesta no contiene los datos cifrados esperados.')
      if (pending.type === 'connect') {
        const solflarePublicKey = url.searchParams.get('solflare_encryption_public_key')
        if (!solflarePublicKey) throw new Error('Solflare no devolvió su clave de cifrado.')
        const secretKey = bs58.decode(pending.dappSecretKey)
        const sharedSecret = nacl.box.before(bs58.decode(solflarePublicKey), secretKey)
        const payload = decryptJson(data, nonce, sharedSecret) as { public_key?: unknown; session?: unknown }
        if (typeof payload.public_key !== 'string' || bs58.decode(payload.public_key).length !== 32) throw new Error('Solflare no devolvió una dirección válida.')
        if (typeof payload.session !== 'string' || !payload.session) throw new Error('Solflare no devolvió una sesión de conexión.')
        const session: SolflareMobileSession = {
          address: payload.public_key,
          dappPublicKey: pending.dappPublicKey,
          dappSecretKey: pending.dappSecretKey,
          solflarePublicKey,
          session: payload.session,
        }
        writeSessionValue(SESSION_KEY, session)
        result = { type: 'connected', session }
      } else {
        const walletSession = readSolflareMobileSession()
        if (!walletSession || walletSession.address !== pending.sender) throw new Error('La sesión de Solflare no coincide con la cuenta que preparó el pago.')
        const payload = decryptJson(data, nonce, deriveSharedSecret(walletSession)) as { signature?: unknown }
        if (typeof payload.signature !== 'string' || bs58.decode(payload.signature).length !== 64) throw new Error('Solflare no devolvió un hash de transacción válido.')
        result = {
          type: 'payment',
          result: {
            status: 'approved',
            signature: payload.signature,
            quote: pending.quote,
            productName: pending.productName,
            sender: pending.sender,
            sentAt: Date.now(),
          },
        }
      }
    } catch (cause) {
      result = { type: 'error', message: cause instanceof Error ? cause.message : 'No se pudo verificar la respuesta de Solflare.' }
    }
  }

  try { window.sessionStorage.removeItem(PENDING_KEY) } catch { /* session storage may be blocked */ }
  stripSolflareCallback(url)
  return result
}

export function readSolflareMobileSession() {
  const session = readSessionValue<SolflareMobileSession>(SESSION_KEY)
  if (!session || !session.address || !session.session || !session.dappPublicKey || !session.dappSecretKey || !session.solflarePublicKey) return null
  try {
    if (bs58.decode(session.address).length !== 32 || bs58.decode(session.dappPublicKey).length !== 32 || bs58.decode(session.dappSecretKey).length !== 32 || bs58.decode(session.solflarePublicKey).length !== 32) return null
  } catch {
    return null
  }
  return session
}

export function clearSolflareMobileSession() {
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
    window.sessionStorage.removeItem(PENDING_KEY)
  } catch { /* session storage may be blocked */ }
}

export function cancelSolflareMobileConnect() {
  const pending = readSessionValue<PendingRequest>(PENDING_KEY)
  if (pending?.type === 'connect') {
    try { window.sessionStorage.removeItem(PENDING_KEY) } catch { /* session storage may be blocked */ }
  }
}

function deriveSharedSecret(session: SolflareMobileSession) {
  return nacl.box.before(bs58.decode(session.solflarePublicKey), bs58.decode(session.dappSecretKey))
}

function decryptJson(data: string, nonce: string, sharedSecret: Uint8Array) {
  const decrypted = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), sharedSecret)
  if (!decrypted) throw new Error('La respuesta cifrada de Solflare no se pudo verificar.')
  return JSON.parse(new TextDecoder().decode(decrypted)) as unknown
}

function cleanReturnUrl(url: URL) {
  const clean = new URL(url)
  for (const key of ['gmSolflareCallback', 'gmSolflareState', 'data', 'nonce', 'solflare_encryption_public_key', 'errorCode', 'errorMessage']) clean.searchParams.delete(key)
  return clean
}

function stripSolflareCallback(url: URL) {
  const clean = cleanReturnUrl(url)
  window.history.replaceState(window.history.state, '', clean.toString())
}

function assertPublicHttps(url: URL) {
  if (url.protocol !== 'https:' || /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(url.hostname)) {
    throw new Error('Solflare móvil necesita un dominio HTTPS público para abrir su aplicación y regresar a esta réplica.')
  }
}

function randomBase58(length: number) {
  const bytes = nacl.randomBytes(length)
  return bs58.encode(bytes)
}

function writeSessionValue(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new Error('El navegador bloqueó el almacenamiento temporal necesario para volver desde Solflare. Permite el almacenamiento de sesión e inténtalo de nuevo.')
  }
}

function readSessionValue<T>(key: string) {
  try {
    const value = window.sessionStorage.getItem(key)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}
