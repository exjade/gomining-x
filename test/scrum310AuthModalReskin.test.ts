import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import {
  decrementResendCooldown,
  validateForgotPasswordEmail,
  validateLoginFields,
  validateRegisterStep2,
  validateStep1Email,
} from '../src/authModalValidation.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const authModalPath = path.join(projectRoot, 'src/AuthModal.tsx')
const landingCssPath = path.join(projectRoot, 'src/landing.css')

test('SCRUM-310 Task 1: AuthModal uses Framer Motion animations and encapsulates styling under .pouw-landing-root', () => {
  const content = fs.readFileSync(authModalPath, 'utf8')
  assert.match(content, /from\s+['"]framer-motion['"]/, 'AuthModal must import framer-motion')
  assert.match(content, /<AnimatePresence>/, 'AuthModal must use AnimatePresence')
  assert.match(content, /<motion\.div/, 'AuthModal must use motion.div for transitions')
  assert.match(content, /pouw-landing-root|pouw-auth-modal-root/, 'AuthModal must encapsulate root container')
  assert.match(content, /pouw-auth-modal-backdrop/, 'AuthModal must have animated backdrop element')
})

test('SCRUM-310 Task 2: AuthModal implements all 5 official visual views and FOMO ribbon with 1:1 structural parity against 56863bf6', () => {
  const content = fs.readFileSync(authModalPath, 'utf8')

  // Reference structural elements from 56863bf6:src/components/auth/AuthModal.tsx
  assert.match(content, /PouwMiner\s*<span[^>]*>\s*Auth\s*<\/span>/, 'Must include official PouwMiner Auth badge')
  assert.match(content, /Preventa Titan/, 'Must include Preventa Titan indicator in ribbon')
  assert.match(content, /24 Cupos/, 'Must include 24 Cupos pill badge in ribbon')
  assert.match(content, /01\s*\/\s*ACCESO/, 'Must include official step indicator 01 / ACCESO')
  assert.match(content, /01\s*\/\s*REGISTRO/, 'Must include official step indicator 01 / REGISTRO')
  assert.match(content, /02\s*\/\s*SEGURIDAD/, 'Must include official step indicator 02 / SEGURIDAD')
  assert.match(content, /03\s*\/\s*RECUPERACIÓN/, 'Must include official step indicator 03 / RECUPERACIÓN')

  // Views/modes
  assert.match(content, /mode === 'login'/, 'AuthModal must support login mode')
  assert.match(content, /mode === 'register'/, 'AuthModal must support register mode')
  assert.match(content, /mode === 'forgot-password'/, 'AuthModal must support forgot-password mode')
  assert.match(content, /mode === 'verify-email'/, 'AuthModal must support verify-email mode')
  assert.match(content, /mode === 'email-verified'/, 'AuthModal must support email-verified mode')

  // 2-step registration
  assert.match(content, /step === 1/, 'AuthModal must support register step 1')
  assert.match(content, /step === 2/, 'AuthModal must support register step 2')
})

test('SCRUM-310 Task 3: AuthModal integrates real AuthContext methods and real referral verification with debounce', () => {
  const content = fs.readFileSync(authModalPath, 'utf8')
  assert.match(content, /import\s*\{[^}]*useAuth[^}]*\}\s*from\s*['"]\.\/AuthContext['"]/)
  assert.match(content, /await\s+login\(/)
  assert.match(content, /await\s+register\(/)
  assert.match(content, /await\s+resetPassword\(/)
  assert.match(content, /await\s+resendVerification\(/)
  assert.match(content, /await\s+checkVerification\(/)
  assert.match(content, /findUserByReferralCode/, 'Must validate referral code with real backend function')
  assert.match(content, /350/, 'Must debounce referral code check by 350ms')
})

test('SCRUM-310 Task 4: Compliance legal, copy neutro y ausencia de checkbox bloqueante', () => {
  const content = fs.readFileSync(authModalPath, 'utf8')
  assert.match(content, /role="dialog"/)
  assert.match(content, /aria-modal="true"/)
  assert.match(content, /event\.key === 'Escape'/)
  assert.doesNotMatch(content, /\buseAppKit\b|\bopenAppKit\b|\bWallet\b/, 'AuthModal must not import or invoke AppKit/Wallet (SCRUM-322)')
  assert.doesNotMatch(content, /or_connect_wallet|Conectar wallet|Connect wallet/i, 'AuthModal must not render Connect Wallet labels (SCRUM-322)')
  assert.match(content, /t\('auth\.legal_pending'\)/)

  // SCRUM-251 & SCRUM-317 requirements:
  // 1. Prohibit static unapproved legal strings
  assert.doesNotMatch(content, /Terms of Service|Privacy Policy|Términos de Servicio|Política de Privacidad|GoMining/i)
  // 2. Prohibit required checkbox blocking registration on pending legal documents
  assert.doesNotMatch(content, /<input[^>]+type="checkbox"[^>]*required/, 'Must not require checkbox on pending legal text')
  // 3. Prohibit "Asignación de Preventa Garantizada" / "Guaranteed Presale Allocation"
  assert.doesNotMatch(content, /Asignación de Preventa Garantizada|Guaranteed Presale Allocation/i, 'Must not claim guaranteed allocation')
  // 4. Prohibit simulated authService and anonymous sessions
  assert.doesNotMatch(content, /from\s+['"][^'"]*authService['"]/, 'Must not import simulated authService')
  assert.doesNotMatch(content, /signInAnonymously/, 'Must not use anonymous auth')
})

test('SCRUM-310 Task 5: CSS Isolation, input reset y direct import de landing.css', () => {
  const authModalContent = fs.readFileSync(authModalPath, 'utf8')
  const landingCssContent = fs.readFileSync(landingCssPath, 'utf8')

  // AuthModal imports landing.css directly
  assert.match(authModalContent, /import\s+['"]\.\/landing\.css['"]/, 'AuthModal must import ./landing.css directly')

  // landing.css contains encapsulated input reset
  assert.match(landingCssContent, /\.pouw-landing-root\s+input\s*\{/, 'landing.css must include .pouw-landing-root input reset')

  // landing.css contains explicit modal root and backdrop positioning
  assert.match(landingCssContent, /\.pouw-auth-modal-root\s*\{[^}]*position:\s*fixed/, 'landing.css must declare fixed .pouw-auth-modal-root')
  assert.match(landingCssContent, /\.pouw-auth-modal-backdrop\s*\{[^}]*position:\s*fixed/, 'landing.css must declare fixed .pouw-auth-modal-backdrop')
  assert.match(landingCssContent, /\.pouw-auth-modal-backdrop\s*\{[^}]*backdrop-filter:\s*blur/, 'landing.css must declare backdrop blur')

  // landing.css isolates AuthModal headings and inputs from global light-theme !important rules in src/styles.css
  assert.match(landingCssContent, /body\.light-theme\s+\.pouw-auth-modal-root\s+h3[\s\S]*color:\s*#ffffff\s*!important/, 'landing.css must isolate .pouw-auth-modal-root headings under light-theme')
  assert.match(landingCssContent, /:root\[data-theme="light"\]\s+\.pouw-auth-modal-root\s+input[\s\S]*color:\s*#ffffff\s*!important/, 'landing.css must isolate .pouw-auth-modal-root inputs under light-theme')
  assert.match(landingCssContent, /:root\[data-theme="light"\]\s+\.pouw-auth-modal-root\s+input::placeholder/, 'landing.css must isolate .pouw-auth-modal-root input placeholders under light-theme')
})

test('SCRUM-310 Task 6: Zero delta across the 12 protected files AND vite.config.ts', () => {
  const scrum310Ref = '41cea3744ca7c6f3b4c9d7b8872a693cf1441675'
  const changedPaths = execFileSync('git', ['diff', '--name-only', `${scrum310Ref}^`, scrum310Ref], { cwd: projectRoot, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)

  const protectedFiles = [
    'src/AuthContext.tsx',
    'src/firebase.ts',
    'src/authRoutePolicy.ts',
    'src/firestoreDemoSync.ts',
    'src/appkitConfig.ts',
    'src/WalletPanel.tsx',
    'src/WalletPaymentCheckout.tsx',
    'src/walletSession.ts',
    'src/minerPurchaseFlow.ts',
    'src/catalogClient.ts',
    'src/minerCatalog.ts',
    'src/SubscriptionsPage.tsx',
    'vite.config.ts',
  ]

  for (const relPath of protectedFiles) {
    assert.equal(changedPaths.includes(relPath), false, `Protected file ${relPath} must not be modified in SCRUM-310`)
  }
})

test('SCRUM-310 Task 7: Executable behavioral verification of pure validation and cooldown helpers', () => {
  const content = fs.readFileSync(authModalPath, 'utf8')
  assert.match(content, /from\s+['"]\.\/authModalValidation['"]/, 'AuthModal must consume pure authModalValidation helpers')
  assert.match(content, /validateStep1Email\(/)
  assert.match(content, /validateRegisterStep2\(/)
  assert.match(content, /validateLoginFields\(/)
  assert.match(content, /validateForgotPasswordEmail\(/)
  assert.match(content, /decrementResendCooldown/)
  assert.match(content, /setResendCooldown\(30\)/, 'Must set 30s cooldown upon resending')

  // Step 1 email validation (valid, invalid, whitespace, malformed around @)
  assert.equal(validateStep1Email('user@pouwminer.com', 'es'), null)
  assert.equal(validateStep1Email('  user@pouwminer.com  ', 'en'), null)
  assert.ok(validateStep1Email('', 'es'))
  assert.ok(validateStep1Email('   ', 'en'))
  assert.ok(validateStep1Email('not-an-email', 'es'))
  assert.ok(validateStep1Email('  @  ', 'en'))
  assert.ok(validateStep1Email('user@', 'es'))
  assert.ok(validateStep1Email('@domain.com', 'en'))

  // Forgot-password email validation
  assert.equal(validateForgotPasswordEmail('recover@pouwminer.com', 'en'), null)
  assert.ok(validateForgotPasswordEmail('', 'es'))
  assert.ok(validateForgotPasswordEmail('   ', 'en'))
  assert.ok(validateForgotPasswordEmail('invalid', 'es'))

  // Login fields validation
  assert.equal(validateLoginFields('user@pouwminer.com', 'secret1', 'en'), null)
  assert.ok(validateLoginFields('', 'secret1', 'es'))
  assert.ok(validateLoginFields('   ', 'secret1', 'en'))
  assert.ok(validateLoginFields('   @  ', 'secret1', 'en'))
  assert.ok(validateLoginFields('not-an-email', 'secret1', 'es'))
  assert.ok(validateLoginFields('user@', 'secret1', 'en'))
  assert.ok(validateLoginFields('@domain.com', 'secret1', 'es'))
  assert.ok(validateLoginFields('user@pouwminer.com', '', 'es'))
  assert.ok(validateLoginFields('user@pouwminer.com', '   ', 'en'))

  // Register step 2 validation (password length boundary 5 vs 6, mismatch, referral status)
  assert.ok(
    validateRegisterStep2({
      password: '12345',
      confirmPassword: '12345',
      referralCode: '',
      refStatus: 'idle',
      language: 'es',
    }),
    'Password shorter than 6 characters must fail',
  )
  assert.equal(
    validateRegisterStep2({
      password: '123456',
      confirmPassword: '123456',
      referralCode: '',
      refStatus: 'idle',
      language: 'en',
    }),
    null,
    'Exact 6-character matching password without referral must pass',
  )
  assert.ok(
    validateRegisterStep2({
      password: 'secret1',
      confirmPassword: 'secret2',
      referralCode: '',
      refStatus: 'idle',
      language: 'en',
    }),
    'Mismatched password confirmation must fail',
  )
  assert.ok(
    validateRegisterStep2({
      password: 'secret1',
      confirmPassword: 'secret1',
      referralCode: ' BADCODE ',
      refStatus: 'invalid',
      language: 'es',
    }),
    'Non-empty trimmed referral code with invalid status must fail',
  )
  assert.equal(
    validateRegisterStep2({
      password: 'secret1',
      confirmPassword: 'secret1',
      referralCode: '   ',
      refStatus: 'invalid',
      language: 'en',
    }),
    null,
    'Whitespace-only referral code must be treated as optional even if refStatus is invalid',
  )
  assert.equal(
    validateRegisterStep2({
      password: 'secret1',
      confirmPassword: 'secret1',
      referralCode: 'TITAN1',
      refStatus: 'valid',
      language: 'en',
    }),
    null,
  )

  // Monotonic cooldown decrement (normal, boundary 1->0, floor 0, negative, non-finite)
  assert.equal(decrementResendCooldown(30), 29)
  assert.equal(decrementResendCooldown(1), 0)
  assert.equal(decrementResendCooldown(0), 0)
  assert.equal(decrementResendCooldown(-5), 0)
  assert.equal(decrementResendCooldown(Number.NaN), 0)
})

test('SCRUM-310 Task 8 (SCRUM-319): 100% of t(...) keys in src/AuthModal.tsx exist as non-empty strings in es.json and en.json', () => {
  const content = fs.readFileSync(authModalPath, 'utf8')
  const es = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/locales/es.json'), 'utf8')) as Record<string, unknown>
  const en = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/locales/en.json'), 'utf8')) as Record<string, unknown>

  const resolveKey = (dict: Record<string, unknown>, key: string): unknown =>
    key.split('.').reduce<unknown>((curr, part) => (curr && typeof curr === 'object' ? (curr as Record<string, unknown>)[part] : undefined), dict)

  const keys = Array.from(content.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g), (match) => match[1])
  assert.ok(keys.length >= 15, `Expected at least 15 t(...) calls in src/AuthModal.tsx, found ${keys.length}`)

  const missingInEs: string[] = []
  const missingInEn: string[] = []
  for (const key of new Set(keys)) {
    const esVal = resolveKey(es, key)
    const enVal = resolveKey(en, key)
    if (typeof esVal !== 'string' || esVal.trim().length === 0) missingInEs.push(key)
    if (typeof enVal !== 'string' || enVal.trim().length === 0) missingInEn.push(key)
  }

  assert.deepEqual(missingInEs, [], `Missing or empty i18n keys in src/locales/es.json: ${missingInEs.join(', ')}`)
  assert.deepEqual(missingInEn, [], `Missing or empty i18n keys in src/locales/en.json: ${missingInEn.join(', ')}`)
})

test('SCRUM-310 Task 9 (SCRUM-322): AuthModal completely removes Connect Wallet, AppKit, Wallet icon, and OR divider in Login and Register', () => {
  const content = fs.readFileSync(authModalPath, 'utf8')
  assert.doesNotMatch(content, /@reown\/appkit\/react|\buseAppKit\b|\bopenAppKit\b/, 'AuthModal must not import or call AppKit')
  assert.doesNotMatch(content, /\bWallet\b/, 'AuthModal must not import or render Wallet icon')
  assert.doesNotMatch(content, /or_connect_wallet|Conectar wallet|Connect wallet/i, 'AuthModal must not reference Connect Wallet')
  assert.doesNotMatch(content, /Conectar con Billetera Web3|Connect with Web3 Wallet|Registrarse con Wallet Web3/i, 'AuthModal must not render Web3 wallet CTA copy')
  assert.doesNotMatch(content, />O<\/span>/, 'AuthModal must not render the legacy "O" wallet separator')
})

test('SCRUM-310 Task 10: Preserves unverified-login modal transition (R1), label/input accessibility bindings (R4), and modal-scoped countdown timer (R5)', () => {
  const content = fs.readFileSync(authModalPath, 'utf8')

  // R1: handleLoginSubmit must delegate closing/verify-email routing to AuthContext.login()
  const loginHandlerMatch = content.match(/const handleLoginSubmit = async[\s\S]*?finally\s*\{\s*setSubmitting\(false\)\s*\}\s*\}/)
  assert.ok(loginHandlerMatch, 'Could not locate handleLoginSubmit in src/AuthModal.tsx')
  assert.match(loginHandlerMatch[0], /await login\(email, password\)/)
  assert.doesNotMatch(
    loginHandlerMatch[0],
    /closeAuthModal\(\)/,
    'handleLoginSubmit must NOT call closeAuthModal() directly because AuthContext.login() keeps the modal open in verify-email mode for unverified users',
  )

  // R4: Every form input has a matching label htmlFor + input id pair
  for (const fieldId of [
    'login-email',
    'login-password',
    'register-email',
    'register-password',
    'register-confirm-password',
    'register-ref',
    'reset-email',
  ]) {
    assert.match(content, new RegExp(`htmlFor="${fieldId}"`), `Missing label htmlFor="${fieldId}"`)
    assert.match(content, new RegExp(`id="${fieldId}"`), `Missing input id="${fieldId}"`)
  }

  // R5: FOMO countdown interval only ticks while authModalOpen is true
  const fomoEffectMatch = content.match(/const \[fomoTime[\s\S]*?clearInterval\(timer\)\s*\}, \[[^\]]*\]\)/)
  assert.ok(fomoEffectMatch, 'Could not locate fomoTime useEffect in src/AuthModal.tsx')
  assert.match(fomoEffectMatch[0], /if\s*\(!authModalOpen\)\s*return/, 'FOMO countdown must not tick while modal is closed')
  assert.match(fomoEffectMatch[0], /\[authModalOpen\]/, 'FOMO countdown effect must depend on authModalOpen')
})
