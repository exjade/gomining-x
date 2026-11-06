import QRCode from 'qrcode'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * Generate a random Base32 secret (standard RFC 3548 / 4648)
 * Default length 16 chars (80-bit entropy, standard for Google Authenticator)
 */
export function generateBase32Secret(length = 16): string {
  const bytes = new Uint8Array(length)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }

  let secret = ''
  for (let i = 0; i < length; i++) {
    secret += BASE32_ALPHABET[bytes[i] % BASE32_ALPHABET.length]
  }
  return secret
}

/**
 * Decodes a Base32 string into a Uint8Array byte array
 */
export function base32Decode(str: string): Uint8Array {
  const cleaned = str.toUpperCase().replace(/[\s=]/g, '')
  let bits = ''
  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleaned[i])
    if (val === -1) continue
    bits += val.toString(2).padStart(5, '0')
  }

  const byteLength = Math.floor(bits.length / 8)
  const bytes = new Uint8Array(byteLength)
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = parseInt(bits.substring(i * 8, (i + 1) * 8), 2)
  }
  return bytes
}

/**
 * Generates the standard RFC 6238 TOTP 6-digit code for a given secret and time step
 */
export async function getTOTPCode(secret: string, timeStep: number): Promise<string> {
  const keyBytes = base32Decode(secret)
  const subtle = (typeof window !== 'undefined' ? window.crypto?.subtle : undefined) || globalThis.crypto?.subtle

  if (!subtle) {
    throw new Error('WebCrypto subtle is not available in this environment.')
  }

  const key = await subtle.importKey(
    'raw',
    keyBytes as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )

  const counterBuf = new ArrayBuffer(8)
  const view = new DataView(counterBuf)
  view.setBigUint64(0, BigInt(timeStep), false)

  const signature = await subtle.sign('HMAC', key, counterBuf)
  const sigBytes = new Uint8Array(signature)
  const offset = sigBytes[sigBytes.length - 1] & 0x0f

  const bin =
    ((sigBytes[offset] & 0x7f) << 24) |
    ((sigBytes[offset + 1] & 0xff) << 16) |
    ((sigBytes[offset + 2] & 0xff) << 8) |
    (sigBytes[offset + 3] & 0xff)

  const otp = bin % 1000000
  return otp.toString().padStart(6, '0')
}

/**
 * Verifies a 6-digit TOTP code against the secret with +/- window tolerance (default: 1 step = 30s)
 */
export async function verifyTOTP(
  secret: string,
  candidateCode: string,
  windowTolerance = 1
): Promise<boolean> {
  const cleanCode = candidateCode.trim().replace(/\s+/g, '')
  if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
    return false
  }

  const nowStep = Math.floor(Date.now() / 1000 / 30)

  for (let offset = -windowTolerance; offset <= windowTolerance; offset++) {
    try {
      const validCode = await getTOTPCode(secret, nowStep + offset)
      if (validCode === cleanCode) {
        return true
      }
    } catch (err) {
      console.warn('Error computing TOTP step:', err)
    }
  }

  return false
}

/**
 * Builds the standard otpauth URI recognized by Google Authenticator, Authy, etc.
 * Format: otpauth://totp/GoMining:${user.email}?secret=${secret}&issuer=GoMining&algorithm=SHA1&digits=6&period=30
 */
export function getOtpauthUri(email: string, secret: string, issuer = 'GoMining'): string {
  const cleanEmail = email.trim() || 'user@gomining.com'
  // Standard Google Authenticator format: otpauth://totp/Issuer:account?secret=...&issuer=Issuer
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(cleanEmail)}?secret=${secret}&issuer=${encodeURIComponent(
    issuer
  )}&algorithm=SHA1&digits=6&period=30`
}

/**
 * Generates a real, scannable QR Code Data URL (PNG) from an otpauth URI
 */
export async function generateQrCodeDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 220,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })
}

/**
 * Generates a vector SVG QR Code from an otpauth URI
 */
export async function generateQrCodeSvg(otpauthUri: string): Promise<string> {
  return QRCode.toString(otpauthUri, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 220,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })
}
