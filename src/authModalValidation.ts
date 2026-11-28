export type AuthLanguage = 'es' | 'en'
export type ReferralStatus = 'idle' | 'checking' | 'valid' | 'invalid'

function hasValidEmailShape(email: string): boolean {
  const trimmed = email.trim()
  const at = trimmed.indexOf('@')
  return at > 0 && at < trimmed.length - 1
}

export function validateStep1Email(email: string, language: AuthLanguage): string | null {
  if (!hasValidEmailShape(email)) {
    return language === 'en'
      ? 'Please enter a valid email address.'
      : 'Por favor ingresa un correo electrónico corporativo o personal válido.'
  }
  return null
}

export function validateLoginFields(email: string, password: string, language: AuthLanguage): string | null {
  if (!email.trim() || !password.trim()) {
    return language === 'en'
      ? 'Please complete all fields.'
      : 'Por favor completa todos los campos.'
  }
  if (!hasValidEmailShape(email)) {
    return language === 'en'
      ? 'Please enter a valid email address.'
      : 'Por favor ingresa un correo electrónico válido.'
  }
  return null
}

export function validateRegisterStep2(params: {
  password: string
  confirmPassword: string
  referralCode: string
  refStatus: ReferralStatus
  language: AuthLanguage
}): string | null {
  const { password, confirmPassword, referralCode, refStatus, language } = params
  if (password.length < 6) {
    return language === 'en'
      ? 'Password must be at least 6 characters.'
      : 'La contraseña debe tener al menos 6 caracteres.'
  }
  if (password !== confirmPassword) {
    return language === 'en'
      ? 'Passwords do not match.'
      : 'Las contraseñas no coinciden.'
  }
  if (referralCode.trim() && refStatus === 'invalid') {
    return language === 'en'
      ? 'The sponsor code entered is invalid.'
      : 'El código de patrocinador ingresado no es válido.'
  }
  return null
}

export function validateForgotPasswordEmail(email: string, language: AuthLanguage): string | null {
  if (!hasValidEmailShape(email)) {
    return language === 'en'
      ? 'Please enter your email.'
      : 'Ingresa tu correo para enviarte las instrucciones.'
  }
  return null
}

export function decrementResendCooldown(current: number): number {
  if (!Number.isFinite(current) || current <= 0) return 0
  return Math.max(0, current - 1)
}

export function shouldShowEmulatorVerifyDevTools(isEmulatorConnected: boolean): boolean {
  return isEmulatorConnected === true
}

export function extractVerificationOobCode(rawInput: string): string | null {
  if (typeof rawInput !== 'string') return null
  const trimmed = rawInput.trim()
  if (!trimmed) return null

  const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i)
  if (urlMatch) {
    try {
      const parsed = new URL(urlMatch[0])
      const fromUrl = parsed.searchParams.get('oobCode')?.trim()
      return fromUrl ? fromUrl : null
    } catch {
      // fall through to query regex
    }
  }

  const paramMatch = trimmed.match(/(?:^|[?&])oobCode=([^&\s"'<>]+)/)
  if (paramMatch?.[1]) {
    try {
      const decoded = decodeURIComponent(paramMatch[1]).trim()
      return decoded ? decoded : null
    } catch {
      return paramMatch[1].trim() || null
    }
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('=') || /\s/.test(trimmed)) {
    return null
  }

  if (/^[A-Za-z0-9_-]{6,512}$/.test(trimmed)) {
    return trimmed
  }

  return null
}
