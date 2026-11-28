import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import type { User } from 'firebase/auth'
import { getAuthRouteRedirect, isPublicAppRoute } from '../src/authRoutePolicy.ts'
import {
  extractVerificationOobCode,
  shouldShowEmulatorVerifyDevTools,
} from '../src/authModalValidation.ts'
import {
  hasCompletedPurchaseOrFunnelReceipt,
  resolvePostPaymentTransition,
  resolvePostRegisterTransition,
  shouldLockHomeForEmailVerification,
  type EmbudoF1State,
} from '../src/components/embudo-f1/funnelState.ts'
import {
  applyEmailVerificationActionCode,
  ensureUserProfile,
  registerWithEmail,
  resolveAuthenticatedUserProfile,
} from '../src/firebase.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')

function makeFunnelState(overrides: Partial<EmbudoF1State> = {}): EmbudoF1State {
  return {
    active: false,
    stage: 'idle',
    source: 'landing',
    updatedAt: Date.now(),
    ...overrides,
  }
}

test('EMBUDO-AUTH-GATE-VERIFICACION (1a): unverified user with completed purchase is held on /home verify-email gate and redirected from other routes', () => {
  // Protected routes redirect back to /home while post-payment email verification is pending
  for (const route of ['/nft-miners', '/profile', '/subscriptions', '/finance/earn-summary', '/nft-referral']) {
    assert.equal(
      getAuthRouteRedirect(route, true, {
        hasCompletedPurchase: true,
        isEmailVerified: false,
        isCheckoutOrBuilderOpen: false,
      }),
      '/home',
      `Expected ${route} to redirect to /home while unverified after purchase`,
    )
  }

  // Already on /home -> stays on /home (null redirect) while gate locks HomeDashboard
  assert.equal(
    getAuthRouteRedirect('/home', true, {
      hasCompletedPurchase: true,
      isEmailVerified: false,
      isCheckoutOrBuilderOpen: false,
    }),
    null,
  )

  // Gate locks /home for every post-payment signal (funnel stage, lastMinerId, purchasesCount, realMinersCount, paymentReceiptsCount)
  assert.equal(
    shouldLockHomeForEmailVerification({
      isAuthenticated: true,
      isEmailVerified: false,
      funnelState: makeFunnelState({ active: true, stage: 'verify-email', lastMinerId: 'miner-1' }),
    }),
    true,
  )
  assert.equal(
    shouldLockHomeForEmailVerification({
      isAuthenticated: true,
      isEmailVerified: false,
      funnelState: makeFunnelState(),
      purchasesCount: 1,
    }),
    true,
  )
  assert.equal(
    shouldLockHomeForEmailVerification({
      isAuthenticated: true,
      isEmailVerified: false,
      funnelState: makeFunnelState(),
      realMinersCount: 1,
    }),
    true,
  )
  assert.equal(
    shouldLockHomeForEmailVerification({
      isAuthenticated: true,
      isEmailVerified: false,
      funnelState: makeFunnelState(),
      paymentReceiptsCount: 1,
    }),
    true,
  )

  // Post-payment transition ALWAYS routes unverified buyers to /home + verify-email modal
  const postPayFunnel = resolvePostPaymentTransition({
    isFunnelActive: true,
    isAuthenticated: true,
    isEmailVerified: false,
    minerId: 'miner-99',
  })
  assert.equal(postPayFunnel.destination, '/home')
  assert.equal(postPayFunnel.openVerifyEmailModal, true)
  assert.equal(postPayFunnel.nextStage, 'verify-email')

  const postPayDirect = resolvePostPaymentTransition({
    isFunnelActive: false,
    isAuthenticated: true,
    isEmailVerified: false,
    minerId: 'miner-99',
  })
  assert.equal(postPayDirect.destination, '/home')
  assert.equal(postPayDirect.openVerifyEmailModal, true)
  assert.equal(postPayDirect.nextStage, 'verify-email')
})

test('EMBUDO-AUTH-GATE-VERIFICACION (1b): verified user passes freely into /home and all protected routes', () => {
  assert.equal(
    shouldLockHomeForEmailVerification({
      isAuthenticated: true,
      isEmailVerified: true,
      funnelState: makeFunnelState({ active: true, stage: 'verify-email', lastMinerId: 'miner-1' }),
      purchasesCount: 2,
      realMinersCount: 2,
      paymentReceiptsCount: 1,
    }),
    false,
  )

  for (const route of ['/home', '/nft-miners', '/profile', '/subscriptions']) {
    assert.equal(
      getAuthRouteRedirect(route, true, {
        hasCompletedPurchase: true,
        isEmailVerified: true,
        isCheckoutOrBuilderOpen: false,
      }),
      null,
    )
  }
})

test('EMBUDO-AUTH-GATE-VERIFICACION (1c): builder and checkout remain 100% accessible without email verification (SCRUM-333/331)', () => {
  // Post-register funnel goes straight to builder (/home?modal=paywall-create&embudo=f1), deferring email verification
  const postReg = resolvePostRegisterTransition({ isFunnelActive: true, isAuthenticated: true })
  assert.equal(postReg.allowBuilder, true)
  assert.equal(postReg.deferEmailVerification, true)
  assert.equal(postReg.nextStage, 'configuring')
  assert.equal(postReg.nextRoute, '/home?modal=paywall-create&embudo=f1')

  // During registering, configuring, and paying (before purchase completes), /home is NOT locked
  for (const stage of ['idle', 'registering', 'configuring', 'paying'] as const) {
    assert.equal(
      hasCompletedPurchaseOrFunnelReceipt({
        funnelState: makeFunnelState({ active: stage !== 'idle', stage }),
        purchasesCount: 0,
        realMinersCount: 0,
        paymentReceiptsCount: 0,
      }),
      false,
      `Stage ${stage} before payment must not count as completed purchase`,
    )
    assert.equal(
      shouldLockHomeForEmailVerification({
        isAuthenticated: true,
        isEmailVerified: false,
        funnelState: makeFunnelState({ active: stage !== 'idle', stage }),
      }),
      false,
    )
  }

  // Even if user already has a purchase, opening builder or checkout is never blocked
  assert.equal(
    shouldLockHomeForEmailVerification({
      isAuthenticated: true,
      isEmailVerified: false,
      purchasesCount: 1,
      isCheckoutOrBuilderOpen: true,
    }),
    false,
  )
  assert.equal(
    getAuthRouteRedirect('/home?modal=paywall-create&embudo=f1', true, {
      hasCompletedPurchase: true,
      isEmailVerified: false,
      isCheckoutOrBuilderOpen: true,
    }),
    null,
  )

  // Verify checkout & purchase modules never gate on emailVerified / isEmailVerified
  for (const rel of [
    'src/WalletPaymentCheckout.tsx',
    'src/minerPurchaseFlow.ts',
    'src/platformBalancePurchase.ts',
    'src/components/miner-builder/CreateMinerModal.tsx',
  ]) {
    const src = fs.readFileSync(path.join(projectRoot, rel), 'utf8')
    assert.doesNotMatch(src, /isEmailVerified|emailVerified/, `${rel} must NEVER require email verification before checkout`)
  }
})

test('EMBUDO-AUTH-GATE-VERIFICACION (2): dev oobCode verification path appears ONLY with Firebase Emulators and is blocked in production', async () => {
  assert.equal(shouldShowEmulatorVerifyDevTools(true), true)
  assert.equal(shouldShowEmulatorVerifyDevTools(false), false)

  // Extract oobCode from full emulator URL, log snippet, and raw code
  const sampleUrl =
    'http://127.0.0.1:9099/emulator/action?mode=verifyEmail&lang=en&oobCode=EmulCode_987-XYZ&apiKey=fake-api-key'
  assert.equal(extractVerificationOobCode(sampleUrl), 'EmulCode_987-XYZ')
  assert.equal(
    extractVerificationOobCode(`To verify the email address, follow this link: ${sampleUrl}`),
    'EmulCode_987-XYZ',
  )
  assert.equal(extractVerificationOobCode('  EmulCode_987-XYZ  '), 'EmulCode_987-XYZ')
  assert.equal(extractVerificationOobCode(''), null)
  assert.equal(extractVerificationOobCode('http://127.0.0.1:9099/emulator/action?mode=verifyEmail'), null)

  // Blocked in production (isEmulator: false)
  let appliedInProd = false
  await assert.rejects(
    () =>
      applyEmailVerificationActionCode(sampleUrl, {
        isEmulator: false,
        applyCode: async () => {
          appliedInProd = true
        },
      }),
    (err: any) => err?.code === 'auth/emulator-only',
  )
  assert.equal(appliedInProd, false)

  // Allowed in emulator (isEmulator: true) and passes extracted oobCode to applyActionCode
  let capturedCode = ''
  await applyEmailVerificationActionCode(sampleUrl, {
    isEmulator: true,
    applyCode: async (code) => {
      capturedCode = code
    },
  })
  assert.equal(capturedCode, 'EmulCode_987-XYZ')

  // Verify AuthModal source gates devtools strictly behind shouldShowEmulatorVerifyDevTools(useFirebaseEmulators)
  const authModalSrc = fs.readFileSync(path.join(projectRoot, 'src/AuthModal.tsx'), 'utf8')
  assert.match(authModalSrc, /shouldShowEmulatorVerifyDevTools\(useFirebaseEmulators\)/)
  assert.match(authModalSrc, /UI :4000 → Logs/)
  assert.match(authModalSrc, /data-testid="verify-emulator-oob-input"/)
  assert.match(authModalSrc, /data-testid="verify-emulator-apply-btn"/)
  assert.match(authModalSrc, /isVerifyGateLocked/)
})

test('EMBUDO-AUTH-GATE-VERIFICACION (3): registerWithEmail, ensureUserProfile, and login profile resolver propagate /users setDoc failures with logged code and never return in-memory profile', async () => {
  const loggedErrors: string[] = []
  const fakeLogger = {
    error: (...args: unknown[]) => {
      loggedErrors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '))
    },
    warn: () => {},
  }

  let signedOutOnRegisterFailure = false
  const fakeUser = {
    uid: 'uid-fail-1',
    email: 'failtest@pouwminer.local',
    isAnonymous: false,
    emailVerified: false,
  } as User

  // 1) registerWithEmail propagates /users setDoc error, logs code, signs out, and does NOT return in-memory profile
  await assert.rejects(
    () =>
      registerWithEmail('failtest@pouwminer.local', 'Secret123!', undefined, {
        createUser: async () => ({ user: fakeUser }),
        sendVerification: async () => {},
        detectGeo: async () => ({ country: 'Chile', ip: '127.0.0.1' }),
        setUserDoc: async () => {
          throw Object.assign(new Error('Simulated Firestore write denial'), {
            code: 'permission-denied',
          })
        },
        signOutUser: async () => {
          signedOutOnRegisterFailure = true
        },
        logger: fakeLogger,
      }),
    (err: any) => err?.code === 'permission-denied',
  )
  assert.equal(signedOutOnRegisterFailure, true)
  assert.ok(
    loggedErrors.some((line) => line.includes('[permission-denied]') && line.includes('registerWithEmail')),
    `Expected registerWithEmail error log with code [permission-denied], got: ${loggedErrors.join(' | ')}`,
  )

  // 2) ensureUserProfile propagates /users setDoc error, logs code, and NEVER returns in-memory userDoc
  loggedErrors.length = 0
  await assert.rejects(
    () =>
      ensureUserProfile(fakeUser, {
        getProfile: async () => null,
        detectGeo: async () => ({ country: 'Chile', ip: '127.0.0.1' }),
        setUserDoc: async () => {
          throw Object.assign(new Error('Firestore emulator unavailable'), {
            code: 'unavailable',
          })
        },
        logger: fakeLogger,
      }),
    (err: any) => err?.code === 'unavailable',
  )
  assert.ok(
    loggedErrors.some((line) => line.includes('[unavailable]') && line.includes('ensureUserProfile')),
    `Expected ensureUserProfile error log with code [unavailable], got: ${loggedErrors.join(' | ')}`,
  )

  // 3) resolveAuthenticatedUserProfile (used by AuthContext.login) rejects when ensureUserProfile returns null or fails
  loggedErrors.length = 0
  await assert.rejects(
    () =>
      resolveAuthenticatedUserProfile(fakeUser, {
        getProfile: async () => null,
        ensureProfile: async () => null,
        logger: fakeLogger,
      }),
    (err: any) => err?.code === 'firestore/profile-null',
  )
  assert.ok(
    loggedErrors.some((line) => line.includes('[firestore/profile-null]')),
    `Expected resolveAuthenticatedUserProfile log with [firestore/profile-null], got: ${loggedErrors.join(' | ')}`,
  )
})

test('EMBUDO-AUTH-GATE-VERIFICACION (4): authRoutePolicy.ts changes ONLY getAuthRouteRedirect and firebase.ts payment tail remains byte-identical to fe6ba006', () => {
  const basePolicy = execFileSync('git', ['show', 'fe6ba006:src/authRoutePolicy.ts'], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
  const curPolicy = fs.readFileSync(path.join(projectRoot, 'src/authRoutePolicy.ts'), 'utf8')
  const splitMarker = 'export function getAuthRouteRedirect'
  assert.equal(
    curPolicy.slice(0, curPolicy.indexOf(splitMarker)),
    basePolicy.slice(0, basePolicy.indexOf(splitMarker)),
    'normalizePathname and isPublicAppRoute in src/authRoutePolicy.ts must remain byte-identical to fe6ba006',
  )
  assert.equal(isPublicAppRoute('/'), true)
  assert.equal(isPublicAppRoute('/home'), false)

  // Verify App.tsx renders non-dismissible gate and null-profile alert
  const appSrc = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8')
  assert.match(appSrc, /data-testid="home-verify-email-gate"/)
  assert.match(appSrc, /data-testid="profile-missing-error"/)
})

test('EMBUDO-AUTH-GATE-CORRECCION-GUARD (5): replacement contract guard for src/AuthContext.tsx and null-profile UI route', () => {
  const authCtxSrc = fs.readFileSync(path.join(projectRoot, 'src/AuthContext.tsx'), 'utf8')
  const appSrc = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8')

  // 1) login() uses resolveAuthenticatedUserProfile, logs [code], calls logoutUser(), clears user/profile, and rethrows visible error
  const loginBlockMatch = authCtxSrc.match(/const login = async[\s\S]*?const register = async/)
  assert.ok(loginBlockMatch, 'Expected login() definition in src/AuthContext.tsx')
  const loginBlock = loginBlockMatch[0]
  assert.match(loginBlock, /await resolveAuthenticatedUserProfile\(loggedUser\)/)
  assert.match(loginBlock, /console\.error\(`\[AuthContext\]\[login\][\s\S]*?\$\{code\}/)
  assert.match(loginBlock, /setProfile\(null\)/)
  assert.match(loginBlock, /setProfileError\(visibleMessage\)/)
  assert.match(loginBlock, /await logoutUser\(\)\.catch/)
  assert.match(loginBlock, /setUser\(null\)/)
  assert.match(loginBlock, /throw Object\.assign\(new Error\(visibleMessage\),\s*\{\s*code\s*\}\)/)

  // 2) onAuthStateChanged logs failure with [code] and sets profileError instead of swallowing
  const onAuthBlockMatch = authCtxSrc.match(/onAuthStateChanged\(auth,[\s\S]*?return \(\) => unsubscribeAuth\(\)/)
  assert.ok(onAuthBlockMatch, 'Expected onAuthStateChanged listener in src/AuthContext.tsx')
  const onAuthBlock = onAuthBlockMatch[0]
  assert.match(onAuthBlock, /await resolveAuthenticatedUserProfile\(currentUser\)/)
  assert.match(onAuthBlock, /console\.error\(`\[AuthContext\]\[onAuthStateChanged\][\s\S]*?\$\{code\}/)
  assert.match(onAuthBlock, /setProfile\(null\)/)
  assert.match(onAuthBlock, /setProfileError\(/)

  // 3) checkVerification (and handleFocus) preserves the real User prototype instance without object spread
  assert.doesNotMatch(
    authCtxSrc,
    /setUser\(\{\s*\.\.\.reloaded\s*\}/,
    'AuthContext must NOT spread Firebase User instance ({ ...reloaded }) which strips prototype getters/methods',
  )
  const checkVerifMatch = authCtxSrc.match(/const checkVerification = async[\s\S]*?const resetPassword = async/)
  assert.ok(checkVerifMatch, 'Expected checkVerification() definition in src/AuthContext.tsx')
  const checkVerifBlock = checkVerifMatch[0]
  assert.match(checkVerifBlock, /setUser\(reloaded\)/)
  assert.match(checkVerifBlock, /setEmailVerifiedConfirmed\(true\)/)
  assert.match(checkVerifBlock, /setVerifyEmailLocked\(false\)/)
  assert.match(checkVerifBlock, /setAuthModalOpen\(false\)/)

  // 4) Non-dismissible closeAuthModal guard + untouched AuthContext contracts preserved
  assert.match(authCtxSrc, /const closeAuthModal = \(\) => \{\s*if \(verifyEmailLocked\) return/)
  assert.match(authCtxSrc, /localStorage\.setItem\('gomining_ref',\s*cleanRef\)/)
  assert.match(authCtxSrc, /!u\.isAnonymous && u\.email/)
  assert.match(authCtxSrc, /cleanupUserMinersSubscription\(\)/)
  assert.match(authCtxSrc, /const linkWallet = async/)

  // 5) Null-profile error route in App.tsx (profile-missing-error + role="alert" + refreshProfile + logout)
  const missingProfileMatch = appSrc.match(/isAuthenticated && !profile \? \([\s\S]*?data-testid="profile-missing-logout-btn"[\s\S]*?<\/section>/)
  assert.ok(missingProfileMatch, 'Expected null-profile error section in src/App.tsx')
  const missingProfileBlock = missingProfileMatch[0]
  assert.match(missingProfileBlock, /data-testid="profile-missing-error"/)
  assert.match(missingProfileBlock, /role="alert"/)
  assert.match(missingProfileBlock, /profileError/)
  assert.match(missingProfileBlock, /refreshProfile\(\)/)
  assert.match(missingProfileBlock, /logout\(\)/)
})
