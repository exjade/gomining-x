import bs58 from 'bs58'
import nacl from 'tweetnacl'
import type { PaymentQuote } from './paymentQuote'

const SESSION_KEY = 'gm:phantom:mobile-session:v1'
const PENDING_KEY = 'gm:phantom:mobile-pending:v1'

export type PhantomMobileSession = {
  address: string
  dappPublicKey: string
  dappSecretKey: string
  phantomPublicKey: string
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

export type PhantomPaymentReturn =
  | { status: 'approved'; signature: string; quote: PaymentQuote; productName: string; sender: string; sentAt: number }
  | { status: 'rejected'; message: string }

export type PhantomReturn =
  | { type: 'connected'; session: PhantomMobileSession }
  | { type: 'connect-rejected'; message: string }
  | { type: 'payment'; result: PhantomPaymentReturn }
  | { type: 'error'; message: string }

export function createPhantomConnectUrl(target: string) {
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
  redirect.searchParams.set('gmPhantomCallback', 'connect')
  redirect.searchParams.set('gmPhantomState', state)
  const params = new URLSearchParams({
    app_url: `${returnUrl.origin}/`,
    dapp_encryption_public_key: pending.dappPublicKey,
    redirect_link: redirect.toString(),
    cluster: 'mainnet-beta',
  })
  return `https://phantom.app/ul/v1/connect?${params.toString()}`
}

export async function createPhantomPaymentUrl(input: {
  target: string
  transaction: Uint8Array
  quote: PaymentQuote
  productName: string
  sender: string
}) {
  const returnUrl = new URL(input.target)
  assertPublicHttps(returnUrl)
  const walletSession = readPhantomMobileSession()
  if (!walletSession) throw new Error('La sesión nativa de Phantom no está disponible. Vuelve a conectar la wallet.')
  if (walletSession.address !== input.sender) throw new Error('La cuenta de Phantom cambió; vuelve a revisar el pago.')
  if (input.quote.networkId !== 'solana' || input.quote.asset !== 'USDT') throw new Error('Phantom móvil solo admite USDT SPL en este checkout.')

  const state = randomBase58(18)
  const nonce = nacl.randomBytes(24)
  const sharedSecret = deriveSharedSecret(walletSession)
  const encrypted = nacl.box.after(
    new TextEncoder().encode(JSON.stringify({
      session: walletSession.session,
      transaction: bs58.encode(input.transaction),
      sendOptions: { preflightCommitment: 'confirmed' },
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
  redirect.searchParams.set('gmPhantomCallback', 'payment')
  redirect.searchParams.set('gmPhantomState', state)
  const params = new URLSearchParams({
    dapp_encryption_public_key: walletSession.dappPublicKey,
    nonce: bs58.encode(nonce),
    redirect_link: redirect.toString(),
    payload: bs58.encode(encrypted),
  })
  return `https://phantom.app/ul/v1/signAndSendTransaction?${params.toString()}`
}

export function consumePhantomReturn(href: string): PhantomReturn | null {
  const url = new URL(href)
  const callbackType = url.searchParams.get('gmPhantomCallback')
  const callbackState = url.searchParams.get('gmPhantomState')
  if (!callbackType || !callbackState) return null

  const pending = readSessionValue<PendingRequest>(PENDING_KEY)
  const walletError = url.searchParams.get('errorCode')
  const walletMessage = url.searchParams.get('errorMessage')
  let result: PhantomReturn

  if (!pending || pending.state !== callbackState || pending.type !== callbackType) {
    result = { type: 'error', message: 'No se pudo verificar el regreso de Phantom. No vuelvas a aprobar la solicitud; revisa la actividad de la wallet.' }
  } else if (walletError) {
    const rejected = ['4001', 'USER_REJECTED', 'USER_REJECTED_REQUEST'].includes(walletError.toUpperCase())
    const message = rejected
      ? 'Cancelaste la solicitud en Phantom. No se envió ningún pago.'
      : `Phantom no completó la solicitud${walletMessage ? ` (${walletMessage.slice(0, 160)})` : ` (código ${walletError})`}.`
    result = pending.type === 'connect'
      ? { type: 'connect-rejected', message }
      : { type: 'payment', result: { status: 'rejected', message } }
  } else {
    try {
      const data = url.searchParams.get('data')
      const nonce = url.searchParams.get('nonce')
      if (!data || !nonce) throw new Error('La respuesta no contiene los datos cifrados esperados.')
      if (pending.type === 'connect') {
        const phantomPublicKey = url.searchParams.get('phantom_encryption_public_key')
        if (!phantomPublicKey) throw new Error('Phantom no devolvió su clave de cifrado.')
        const secretKey = bs58.decode(pending.dappSecretKey)
        const sharedSecret = nacl.box.before(bs58.decode(phantomPublicKey), secretKey)
        const payload = decryptJson(data, nonce, sharedSecret) as { public_key?: unknown; session?: unknown }
        if (typeof payload.public_key !== 'string' || bs58.decode(payload.public_key).length !== 32) throw new Error('Phantom no devolvió una dirección válida.')
        if (typeof payload.session !== 'string' || !payload.session) throw new Error('Phantom no devolvió una sesión de conexión.')
        const session: PhantomMobileSession = {
          address: payload.public_key,
          dappPublicKey: pending.dappPublicKey,
          dappSecretKey: pending.dappSecretKey,
          phantomPublicKey,
          session: payload.session,
        }
        writeSessionValue(SESSION_KEY, session)
        result = { type: 'connected', session }
      } else {
        const walletSession = readPhantomMobileSession()
        if (!walletSession || walletSession.address !== pending.sender) throw new Error('La sesión de Phantom no coincide con la cuenta que preparó el pago.')
        const payload = decryptJson(data, nonce, deriveSharedSecret(walletSession)) as { signature?: unknown }
        if (typeof payload.signature !== 'string' || bs58.decode(payload.signature).length !== 64) throw new Error('Phantom no devolvió un hash de transacción válido.')
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
      result = { type: 'error', message: cause instanceof Error ? cause.message : 'No se pudo verificar la respuesta de Phantom.' }
    }
  }

  try { window.sessionStorage.removeItem(PENDING_KEY) } catch { /* session storage may be blocked */ }
  stripPhantomCallback(url)
  return result
}

export function readPhantomMobileSession() {
  const session = readSessionValue<PhantomMobileSession>(SESSION_KEY)
  if (!session || !session.address || !session.session || !session.dappPublicKey || !session.dappSecretKey || !session.phantomPublicKey) return null
  try {
    if (bs58.decode(session.address).length !== 32 || bs58.decode(session.dappPublicKey).length !== 32 || bs58.decode(session.dappSecretKey).length !== 32 || bs58.decode(session.phantomPublicKey).length !== 32) return null
  } catch {
    return null
  }
  return session
}

export function clearPhantomMobileSession() {
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
    window.sessionStorage.removeItem(PENDING_KEY)
  } catch { /* session storage may be blocked */ }
}

export function cancelPhantomMobileConnect() {
  const pending = readSessionValue<PendingRequest>(PENDING_KEY)
  if (pending?.type === 'connect') {
    try { window.sessionStorage.removeItem(PENDING_KEY) } catch { /* session storage may be blocked */ }
  }
}

function deriveSharedSecret(session: PhantomMobileSession) {
  return nacl.box.before(bs58.decode(session.phantomPublicKey), bs58.decode(session.dappSecretKey))
}

function decryptJson(data: string, nonce: string, sharedSecret: Uint8Array) {
  const decrypted = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), sharedSecret)
  if (!decrypted) throw new Error('La respuesta cifrada de Phantom no se pudo verificar.')
  return JSON.parse(new TextDecoder().decode(decrypted)) as unknown
}

function cleanReturnUrl(url: URL) {
  const clean = new URL(url)
  for (const key of ['gmPhantomCallback', 'gmPhantomState', 'data', 'nonce', 'phantom_encryption_public_key', 'errorCode', 'errorMessage']) clean.searchParams.delete(key)
  return clean
}

function stripPhantomCallback(url: URL) {
  const clean = cleanReturnUrl(url)
  window.history.replaceState(window.history.state, '', clean.toString())
}

function assertPublicHttps(url: URL) {
  if (url.protocol !== 'https:' || /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(url.hostname)) {
    throw new Error('Phantom móvil necesita un dominio HTTPS público para abrir su aplicación y regresar a esta réplica.')
  }
}

function randomBase58(length: number) {
  return bs58.encode(nacl.randomBytes(length))
}

function writeSessionValue(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new Error('El navegador bloqueó el almacenamiento temporal necesario para volver desde Phantom. Permite el almacenamiento de sesión e inténtalo de nuevo.')
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
