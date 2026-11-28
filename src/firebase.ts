import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  applyActionCode,
  updateProfile as updateAuthProfile,
  type User,
} from 'firebase/auth'
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  increment,
  type Timestamp,
  type FieldValue,
} from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import type { MinerAppearance } from './nft-miners/appearance'

import { detectUserGeo } from './geoIp.ts'
import { extractVerificationOobCode } from './authModalValidation.ts'

export type FirestoreTimestamp = Timestamp | FieldValue | string | null

export interface CountryRecord {
  uid: string
  country: string
  detectedAt: FirestoreTimestamp
  ip: string
}

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env)
  ? (import.meta as any).env
  : (process.env || {})

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyMockKeyForTestingOnly',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
}

const isNode = typeof window === 'undefined' && typeof process !== 'undefined' && !!process.env

if (isNode && firebaseConfig.projectId === 'salad-miners') {
  throw new Error('FATAL: Direct connection to production Firebase projectId "salad-miners" is forbidden in Node.')
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app)

const isLoopbackBrowserHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === '127.0.0.1' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '100.89.0.52')

export const useFirebaseEmulators =
  !isNode &&
  Boolean(env.DEV || isLoopbackBrowserHost) &&
  String(env.VITE_USE_FIREBASE_EMULATORS ?? '').toLowerCase() === 'true'

if (useFirebaseEmulators) {
  const emulatorGuard = globalThis as typeof globalThis & { __firebaseEmulatorsConnected?: boolean }
  if (!emulatorGuard.__firebaseEmulatorsConnected) {
    const isTailscaleOrigin = typeof window !== 'undefined' && window.location.hostname === '100.89.0.52'
    const authEmulatorUrl = isTailscaleOrigin
      ? 'http://100.89.0.52:9099'
      : (env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099')
    const firestoreEmulatorHost = isTailscaleOrigin
      ? '100.89.0.52'
      : (env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST || '127.0.0.1')
    const firestoreEmulatorPort = Number(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || 8080)
    const functionsEmulatorHost = isTailscaleOrigin
      ? '100.89.0.52'
      : (env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1')
    const functionsEmulatorPort = Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001)
    connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true })
    if (String(env.VITE_USE_FIRESTORE_EMULATOR ?? 'true').toLowerCase() !== 'false') {
      connectFirestoreEmulator(db, firestoreEmulatorHost, firestoreEmulatorPort)
    }
    connectFunctionsEmulator(functions, functionsEmulatorHost, functionsEmulatorPort)
    emulatorGuard.__firebaseEmulatorsConnected = true
  }
}

export interface FirestoreWriterHooks {
  setDoc: (docRef: any, data: any, options?: any) => Promise<any>
  updateDoc: (docRef: any, updates: any) => Promise<any>
}

export function assertNotProductionFirestore(docRef?: any): void {
  if (useFirebaseEmulators) return
  const targetProjectId = docRef?.firestore?.app?.options?.projectId
    || (typeof db !== 'undefined' && (db as any)?.app?.options?.projectId)
    || (typeof process !== 'undefined' && process.env?.VITE_FIREBASE_PROJECT_ID)
  if (targetProjectId === 'salad-miners') {
    throw new Error('FATAL: Write operation attempted against production Firestore database "salad-miners".')
  }
}

export function isProductionFirestoreTarget(docRef?: any): boolean {
  if (useFirebaseEmulators) return false
  const targetProjectId = docRef?.firestore?.app?.options?.projectId
    || (typeof db !== 'undefined' && (db as any)?.app?.options?.projectId)
    || (typeof process !== 'undefined' && process.env?.VITE_FIREBASE_PROJECT_ID)
  return targetProjectId === 'salad-miners'
}

export const isProductionFirestore = isProductionFirestoreTarget

export function sanitizeFirestoreErrorMessage(
  errorOrMessage: unknown,
  fallback = 'No se pudo completar la operación local en este momento.'
): string {
  if (!errorOrMessage) return fallback
  const message = errorOrMessage instanceof Error ? errorOrMessage.message : String(errorOrMessage)
  if (/salad-miners|fatal|projectid|write operation attempted/i.test(message)) {
    return fallback
  }
  return message
}

let activeWriterHooks: FirestoreWriterHooks = {
  setDoc: (ref, data, opts) => {
    assertNotProductionFirestore(ref)
    return setDoc(ref, data, opts)
  },
  updateDoc: (ref, updates) => {
    assertNotProductionFirestore(ref)
    return updateDoc(ref, updates)
  },
}

export function setFirestoreWritersForTesting(hooks: Partial<FirestoreWriterHooks> | null): void {
  if (!hooks) {
    activeWriterHooks = {
      setDoc: (ref, data, opts) => {
        assertNotProductionFirestore(ref)
        return setDoc(ref, data, opts)
      },
      updateDoc: (ref, updates) => {
        assertNotProductionFirestore(ref)
        return updateDoc(ref, updates)
      },
    }
  } else {
    activeWriterHooks = {
      ...activeWriterHooks,
      ...hooks,
    }
  }
}

import {
  cleanupUserMinersSubscription,
  getUserMinersFromStore,
  isUserMinersListenerActive,
  subscribeToUserMiners,
} from './userMinersStore.ts'

export interface UserReferralData {
  referrerBy: string
  referralCode: string
  userReferrals: string[]
  joinDate?: FirestoreTimestamp
}

export type AccountStatus = 'active' | 'inactive' | 'suspended' | 'blocked'

export interface UserProfile {
  uid: string
  email: string
  username: string
  status?: AccountStatus
  createdAt?: FirestoreTimestamp
  emailVerified: boolean
  walletAddress?: string
  balance: number
  commissionBalance: number
  totalCommissionsEarned: number
  referral: UserReferralData
  country?: string
  photoURL?: string
  telegramHandle?: string
  twitterHandle?: string
  twoFactorEnabled?: boolean
  twoFactorSecret?: string
  purchasesCount?: number
  firstPurchaseAt?: FirestoreTimestamp
  lastPurchaseAt?: FirestoreTimestamp
  sponsorId?: string
}

export interface ReferralAccount {
  uid: string
  referralCode: string
  referrerBy: string
  totalCommissionsEarned: number
  pendingCommissions: number
  withdrawableBalance: number
  totalWithdrawn: number
  directReferralsCount: number
  directReferrals: string[]
  firstReferralAt?: FirestoreTimestamp
  lastCommissionAt?: FirestoreTimestamp
  createdAt?: FirestoreTimestamp
  updatedAt?: FirestoreTimestamp
}

export interface ReferralTransaction {
  id: string
  referralUid: string
  type: 'commission_income' | 'unilevel_income' | 'withdrawal' | 'bonus_adjustment'
  amount: number
  currency: 'USD'
  source: 'miner_purchase' | 'unilevel_daily_profit'
  purchaseType?: 'first_purchase' | 'repurchase'
  purchaseNumber?: number
  buyerUid?: string
  buyerEmail?: string
  minerId?: string
  minerPrice?: number
  rate?: number
  level?: number
  description: string
  status: 'completed' | 'pending'
  timestamp?: FirestoreTimestamp
}

export interface UnilevelUplineNode {
  level: number
  uid: string
  email: string
  referralCode: string
}

export interface UnilevelAccount {
  uid: string
  email: string
  referralCode: string
  sponsorId: string | null
  sponsorCode: string
  uplines: UnilevelUplineNode[]
  directCount: number
  totalTeamCount: number
  createdAt?: FirestoreTimestamp
  updatedAt?: FirestoreTimestamp
}

export interface UnilevelLevelDistribution {
  level: number
  sponsorId: string | null
  sponsorEmail: string | null
  percentage: number
  rate: number
  amount: number
  status: 'credited' | 'unclaimed_missing_upline'
}

export interface UnilevelDistributionDoc {
  id: string
  date: string
  minerUid: string
  minerId: string
  eligibleProfit: number
  unilevelPool: number
  maxLevels: number
  distributions: UnilevelLevelDistribution[]
  totalDistributed: number
  totalUnclaimed: number
  createdAt?: FirestoreTimestamp
}

export interface MiningDailyProfitDoc {
  id: string
  date: string
  minerUid: string
  minerId: string
  dailyGrossProfit: number
  dailyCosts: number
  eligibleProfit: number
  unilevelPool: number
  status: 'processed'
  createdAt?: FirestoreTimestamp
}

export interface StoredMinerTraits {
  wallColor: string
  bodyColor: string
  bottomColor: string
  fansColor: string
  screenColor: string
  buttonsColor: string
  topColor: string
  stickers: string
}

export interface StoredMinerPurchaseSnapshot {
  packageId: string
  name: string
  powerTh: number
  price: number
  currency: string
  cadence?: string
  purchaseMode?: string
}

export interface StoredMiner {
  id: string
  uid: string
  packageId?: string
  name: string
  powerTh: number
  efficiency: number
  efficiencyWattsPerTh: number
  price: number
  currency: string
  status: 'active' | 'mining' | 'customizing'
  txHash: string
  createdAt?: FirestoreTimestamp
  createdAtIso?: string
  network: string
  ownerWallet: string
  visualTraits: StoredMinerTraits
  appearance?: MinerAppearance
  purchaseMode?: string
  cadence?: string
  packageSnapshot?: StoredMinerPurchaseSnapshot
}

export interface ReferralCommission {
  id: string
  referrerUid: string
  referrerCode: string
  buyerUid: string
  buyerEmail: string
  minerId: string
  minerPrice: number
  commissionAmount: number
  rate: number
  txHash: string
  status: 'credited'
  type?: 'first_purchase' | 'repurchase'
  purchaseNumber?: number
  createdAt?: FirestoreTimestamp
}

/** 20-level unilevel compensation weights summing to 100% of the 20% pool */
export const UNILEVEL_20_LEVEL_PERCENTAGES: readonly number[] = [
  20, 15, 10, 8, 7, 6, 5, 4, 4, 3,
  3,  2,  2, 2, 2, 2, 1, 1, 1, 2,
] as const

/** Generates a human-friendly unique referral code (e.g. MINER9XYZ) */
export function generateReferralCode(email: string): string {
  const prefix = (email.split('@')[0] || 'MINER')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 5)
    .toUpperCase()
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let random = ''
  for (let i = 0; i < 4; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${prefix || 'GM'}${random}`
}

/**
 * Publishes a minimal public referral-code lookup doc under /publicReferralCodes/{CODE}
 * (uid + referralCode only — zero balance or PII exposure, F-HIGH-01).
 */
async function publishPublicReferralCode(uid: string, referralCode: string): Promise<void> {
  const cleanCode = referralCode.trim().toUpperCase()
  if (!uid || !cleanCode) return
  try {
    await setDoc(doc(db, 'publicReferralCodes', cleanCode), {
      uid,
      referralCode: cleanCode,
      createdAt: serverTimestamp(),
    })
  } catch {
    // Non-fatal: code doc may already exist or user may not be authenticated yet
  }
}

/** Finds a user by their referral code via minimal /publicReferralCodes/{CODE} index (F-HIGH-01) */
export async function findUserByReferralCode(code: string): Promise<{ uid: string; email: string; referralCode: string } | null> {
  const cleanCode = code.trim()
  if (!cleanCode) return null
  const upperCode = cleanCode.toUpperCase()
  try {
    // 1. Primary O(1) lookup via /publicReferralCodes/{CODE} (no public /users read)
    const pubSnap = await getDoc(doc(db, 'publicReferralCodes', upperCode))
    if (pubSnap.exists()) {
      const pubData = pubSnap.data() as { uid?: string; referralCode?: string }
      if (typeof pubData.uid === 'string' && pubData.uid.trim()) {
        return {
          uid: pubData.uid.trim(),
          email: '',
          referralCode: pubData.referralCode || upperCode,
        }
      }
    }
  } catch (error) {
    console.warn('Public referral index lookup failed, attempting authenticated fallback:', error)
  }

  // 2. Authenticated fallback via /referrals (for legacy accounts not yet mirrored in /publicReferralCodes)
  if (auth.currentUser) {
    try {
      let q = query(collection(db, 'referrals'), where('referralCode', '==', upperCode))
      let snap = await getDocs(q)
      if (snap.empty && cleanCode.toLowerCase() !== upperCode) {
        q = query(collection(db, 'referrals'), where('referralCode', '==', cleanCode.toLowerCase()))
        snap = await getDocs(q)
      }
      if (!snap.empty) {
        const refData = snap.docs[0].data() as ReferralAccount
        return {
          uid: refData.uid || snap.docs[0].id,
          email: '',
          referralCode: refData.referralCode || upperCode,
        }
      }
    } catch (error) {
      console.error('Error looking up referral code in /referrals:', error)
    }
  }

  return null
}

/** Registers a new user with email and password, creates profile with referral code */
export interface RegisterWithEmailDeps {
  createUser?: (email: string, password: string) => Promise<{ user: User }>
  sendVerification?: (user: User) => Promise<void>
  findSponsor?: typeof findUserByReferralCode
  detectGeo?: () => Promise<{ country: string; ip: string }>
  setUserDoc?: (uid: string, data: UserProfile, options?: { merge?: boolean }) => Promise<void>
  signOutUser?: () => Promise<void>
  saveCountry?: (uid: string, country: string, ip: string) => Promise<void>
  publishCode?: (uid: string, code: string) => Promise<void>
  ensureReferral?: (uid: string, code: string, referrerBy: string) => Promise<void>
  ensureUnilevel?: (uid: string, email: string, code: string, referrerBy: string, referrerUid: string) => Promise<void>
  logger?: Pick<Console, 'error' | 'warn'>
}

export async function registerWithEmail(
  email: string,
  password: string,
  referralCodeProvided?: string,
  deps?: RegisterWithEmailDeps,
) {
  const cleanEmail = email.toLowerCase().trim()
  const log = deps?.logger ?? console
  const createUserFn = deps?.createUser ?? ((e: string, p: string) => createUserWithEmailAndPassword(auth, e, p))
  const sendVerificationFn = deps?.sendVerification ?? ((u: User) => sendEmailVerification(u))
  const findSponsorFn = deps?.findSponsor ?? findUserByReferralCode
  const detectGeoFn = deps?.detectGeo ?? detectUserGeo
  const setUserDocFn =
    deps?.setUserDoc ??
    ((uid: string, data: UserProfile, options?: { merge?: boolean }) =>
      options ? setDoc(doc(db, 'users', uid), data, options) : setDoc(doc(db, 'users', uid), data))
  const signOutFn = deps?.signOutUser ?? (() => signOut(auth))
  const saveCountryFn = deps?.saveCountry ?? saveDetectedCountry
  const publishCodeFn = deps?.publishCode ?? publishPublicReferralCode
  const ensureReferralFn = deps?.ensureReferral ?? ensureReferralAccount
  const ensureUnilevelFn = deps?.ensureUnilevel ?? ensureUnilevelAccount

  const cred = await createUserFn(cleanEmail, password)
  const user = cred.user
  const finishInFlight = beginUserRegistrationInFlight(user.uid)

  try {
    // Send verification email
    try {
      await sendVerificationFn(user)
    } catch (err) {
      log.warn('Could not send verification email automatically:', err)
    }

    // Handle sponsor referral validation
    let validReferrerCode = ''
    let referrerUid = ''
    if (referralCodeProvided && referralCodeProvided.trim()) {
      try {
        const sponsor = await findSponsorFn(referralCodeProvided)
        if (sponsor && sponsor.uid !== user.uid) {
          validReferrerCode = sponsor.referralCode
          referrerUid = sponsor.uid
        }
      } catch (err) {
        log.warn('Could not validate sponsor referral code:', err)
      }
    }

    const myReferralCode = generateReferralCode(cleanEmail)
    const username = cleanEmail.split('@')[0] || 'User'
    const geo = await detectGeoFn().catch(() => ({ country: 'United States', ip: '127.0.0.1' }))
    const safeCountry = geo?.country || 'United States'
    const safeIp = geo?.ip || '127.0.0.1'

    const userDoc: UserProfile = {
      uid: user.uid,
      email: cleanEmail,
      username,
      status: 'active',
      createdAt: serverTimestamp(),
      emailVerified: false,
      walletAddress: '',
      balance: 0,
      commissionBalance: 0,
      totalCommissionsEarned: 0,
      purchasesCount: 0,
      referral: {
        referrerBy: validReferrerCode,
        referralCode: myReferralCode,
        userReferrals: [],
        joinDate: serverTimestamp(),
      },
      country: safeCountry,
      twoFactorEnabled: false,
      ...(referrerUid ? { sponsorId: referrerUid } : {}),
    }
    const cleanUserDoc = stripUndefinedUserFields(userDoc)

    // Save profile to Firestore — MUST propagate error if /users setDoc fails (never return in-memory profile)
    try {
      await setUserDocFn(user.uid, cleanUserDoc)
    } catch (err) {
      log.warn('Initial setDoc on /users failed, attempting merge setDoc:', err)
      try {
        await setUserDocFn(user.uid, cleanUserDoc, { merge: true })
      } catch (err2) {
        const failureCode =
          (err2 as { code?: string })?.code ||
          (err as { code?: string })?.code ||
          'firestore/setdoc-failed'
        log.error(
          `[Firebase][registerWithEmail] Firestore setDoc(/users/${user.uid}) failed [${failureCode}]:`,
          err2,
        )
        finishInFlight(null)
        await signOutFn().catch(() => {})
        if (err2 && typeof err2 === 'object' && !('code' in err2)) {
          Object.assign(err2 as Record<string, unknown>, { code: failureCode })
        }
        throw err2
      }
    }

    finishInFlight(cleanUserDoc)

    // Save detected country to dedicated /countries/{uid} collection
    await saveCountryFn(user.uid, safeCountry, safeIp).catch(() => {})

    // Publish minimal public referral code index (/publicReferralCodes/{CODE})
    await publishCodeFn(user.uid, myReferralCode).catch(() => {})

    // Ensure dedicated referral document in /referrals/{uid}
    try {
      await ensureReferralFn(user.uid, myReferralCode, validReferrerCode)
    } catch (refErr) {
      log.warn('Could not initialize /referrals document:', refErr)
    }

    // Ensure dedicated unilevel tree document in /unilevel/{uid}
    try {
      await ensureUnilevelFn(user.uid, cleanEmail, myReferralCode, validReferrerCode, referrerUid)
    } catch (uniErr) {
      log.warn('Could not initialize /unilevel document:', uniErr)
    }

    // Link to sponsor userReferrals and update sponsor /referrals/{referrerUid} if valid
    if (referrerUid && !deps?.setUserDoc) {
      try {
        await updateDoc(doc(db, 'users', referrerUid), {
          'referral.userReferrals': arrayUnion(cleanEmail),
        })
        await updateDoc(doc(db, 'referrals', referrerUid), {
          directReferralsCount: increment(1),
          directReferrals: arrayUnion(cleanEmail),
          updatedAt: serverTimestamp(),
        }).catch(() => {})
      } catch (err) {
        log.warn('Failed to link referral into sponsor document:', err)
      }
    }

    return { user, profile: cleanUserDoc }
  } finally {
    finishInFlight(null)
  }
}

const inFlightUserRegistrations = new Map<string, Promise<UserProfile | null>>()

function beginUserRegistrationInFlight(uid: string): (profile: UserProfile | null) => void {
  let settled = false
  let resolveFn: (profile: UserProfile | null) => void = () => {}
  const promise = new Promise<UserProfile | null>((resolve) => {
    resolveFn = resolve
  })
  inFlightUserRegistrations.set(uid, promise)
  return (profile: UserProfile | null) => {
    if (settled) return
    settled = true
    inFlightUserRegistrations.delete(uid)
    resolveFn(profile)
  }
}

/** Recursively strips `undefined` fields from plain objects while preserving Firestore FieldValues & arrays */
export function stripUndefinedUserFields<T>(input: T): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input
  }
  if (Object.getPrototypeOf(input) !== Object.prototype) {
    return input
  }
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === undefined) continue
    cleaned[key] =
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
        ? stripUndefinedUserFields(value)
        : value
  }
  return cleaned as T
}

export interface EnsureUserProfileDeps {
  getProfile?: (uid: string) => Promise<UserProfile | null>
  setUserDoc?: (uid: string, data: UserProfile, options?: { merge?: boolean }) => Promise<void>
  detectGeo?: () => Promise<{ country: string; ip: string }>
  saveCountry?: (uid: string, country: string, ip: string) => Promise<void>
  publishCode?: (uid: string, code: string) => Promise<void>
  ensureReferral?: (uid: string, code: string, referrerBy: string) => Promise<void>
  ensureUnilevel?: (uid: string, email: string, code: string, referrerBy: string, referrerUid: string) => Promise<void>
  logger?: Pick<Console, 'error' | 'warn'>
}

/** Ensures a Firestore profile exists for an authenticated user, creating one if missing */
export async function ensureUserProfile(user: User, deps?: EnsureUserProfileDeps): Promise<UserProfile | null> {
  if (!user || user.isAnonymous) return null
  const log = deps?.logger ?? console
  const getProfileFn = deps?.getProfile ?? ((uid: string) => getUserProfile(uid, { throwOnError: true }))
  const setUserDocFn =
    deps?.setUserDoc ??
    ((uid: string, data: UserProfile, options?: { merge?: boolean }) =>
      setDoc(doc(db, 'users', uid), data, options ?? { merge: true }))
  const detectGeoFn = deps?.detectGeo ?? detectUserGeo
  const saveCountryFn = deps?.saveCountry ?? saveDetectedCountry
  const publishCodeFn = deps?.publishCode ?? publishPublicReferralCode
  const ensureReferralFn = deps?.ensureReferral ?? ensureReferralAccount
  const ensureUnilevelFn = deps?.ensureUnilevel ?? ensureUnilevelAccount

  const pendingRegistration = inFlightUserRegistrations.get(user.uid)
  if (pendingRegistration) {
    const registeredProfile = await pendingRegistration
    if (registeredProfile) {
      return (await getProfileFn(user.uid)) ?? registeredProfile
    }
  }
  const existing = await getProfileFn(user.uid)
  if (existing) {
    if (!deps?.setUserDoc) {
      // Check dedicated /countries/{uid} collection and auto-detect in background if missing
      void getUserCountryRecord(user.uid).then(async (rec) => {
        if (!rec || !existing.country) {
          const geo = await detectGeoFn().catch(() => ({ country: 'United States', ip: '127.0.0.1' }))
          const safeCountry = geo?.country || 'United States'
          const safeIp = geo?.ip || '127.0.0.1'
          await saveCountryFn(user.uid, safeCountry, safeIp).catch(() => {})
          if (!existing.country) {
            await updateDoc(doc(db, 'users', user.uid), { country: safeCountry }).catch(() => {})
          }
        }
      })
    }
    // Also ensure /referrals/{uid}, /unilevel/{uid}, and /publicReferralCodes/{CODE} exist
    const existingCode = existing.referral?.referralCode || generateReferralCode(user.email || '')
    await publishCodeFn(user.uid, existingCode).catch(() => {})
    await ensureReferralFn(user.uid, existingCode, existing.referral?.referrerBy || '').catch(() => {})
    await ensureUnilevelFn(user.uid, user.email || '', existingCode, existing.referral?.referrerBy || '', existing.sponsorId || '').catch(() => {})
    return existing
  }

  const cleanEmail = (user.email || '').toLowerCase().trim()
  if (!cleanEmail) return null
  const myReferralCode = generateReferralCode(cleanEmail)
  const username = cleanEmail.split('@')[0] || 'User'
  const geo = await detectGeoFn().catch(() => ({ country: 'United States', ip: '127.0.0.1' }))
  const safeCountry = geo?.country || 'United States'
  const safeIp = geo?.ip || '127.0.0.1'

  const userDoc: UserProfile = {
    uid: user.uid,
    email: cleanEmail,
    username,
    status: 'active',
    createdAt: serverTimestamp(),
    emailVerified: Boolean(user.emailVerified),
    walletAddress: '',
    balance: 0,
    commissionBalance: 0,
    totalCommissionsEarned: 0,
    purchasesCount: 0,
    referral: {
      referrerBy: '',
      referralCode: myReferralCode,
      userReferrals: [],
      joinDate: serverTimestamp(),
    },
    country: safeCountry,
    twoFactorEnabled: false,
  }
  const cleanUserDoc = stripUndefinedUserFields(userDoc)

  try {
    await setUserDocFn(user.uid, cleanUserDoc, { merge: true })
  } catch (err) {
    const failureCode = (err as { code?: string })?.code || 'firestore/setdoc-failed'
    log.error(
      `[Firebase][ensureUserProfile] Firestore setDoc(/users/${user.uid}) failed [${failureCode}]:`,
      err,
    )
    if (err && typeof err === 'object' && !('code' in err)) {
      Object.assign(err as Record<string, unknown>, { code: failureCode })
    }
    throw err
  }

  await saveCountryFn(user.uid, safeCountry, safeIp).catch(() => {})
  await publishCodeFn(user.uid, myReferralCode).catch(() => {})
  await ensureReferralFn(user.uid, myReferralCode, '').catch(() => {})
  await ensureUnilevelFn(user.uid, cleanEmail, myReferralCode, '', '').catch(() => {})

  return cleanUserDoc
}

/** Dedicated country detection document operations in /countries/{uid} */
export async function saveDetectedCountry(uid: string, country: string, ip: string): Promise<void> {
  const countryDoc = doc(db, 'countries', uid)
  await setDoc(
    countryDoc,
    {
      uid,
      country,
      detectedAt: serverTimestamp(),
      ip,
    },
    { merge: true }
  )
}

export async function getUserCountryRecord(uid: string): Promise<CountryRecord | null> {
  try {
    const snap = await getDoc(doc(db, 'countries', uid))
    if (!snap.exists()) return null
    return snap.data() as CountryRecord
  } catch {
    return null
  }
}

/** Log in with email and password */
export async function loginWithEmail(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email.toLowerCase().trim(), password)
  return cred.user
}

/** Log out current user */
export async function logoutUser() {
  cleanupUserMinersSubscription()
  await signOut(auth)
}

/** Send verification email to currently signed in user */
export async function sendVerificationEmail(user: User) {
  await sendEmailVerification(user)
}

/** Send password reset email */
export async function sendResetPassword(email: string) {
  await sendPasswordResetEmail(auth, email.toLowerCase().trim())
}

/** Reload current user to refresh emailVerified state */
export async function reloadCurrentUser(): Promise<User | null> {
  const user = auth.currentUser
  if (!user) return null
  await user.reload()
  if (user.emailVerified) {
    try {
      await updateDoc(doc(db, 'users', user.uid), { emailVerified: true })
    } catch {
      // ignore
    }
  }
  return auth.currentUser
}

/** Apply an email verification oobCode strictly when connected to Firebase Emulators */
export async function applyEmailVerificationActionCode(
  codeOrUrl: string,
  deps?: { isEmulator?: boolean; applyCode?: (code: string) => Promise<void> },
): Promise<void> {
  const isEmulator = deps?.isEmulator ?? useFirebaseEmulators
  if (!isEmulator) {
    throw Object.assign(
      new Error('Dev verification action code is disabled outside Firebase Emulators.'),
      { code: 'auth/emulator-only' },
    )
  }
  const code = extractVerificationOobCode(codeOrUrl)
  if (!code) {
    throw Object.assign(
      new Error('Invalid verification link or oobCode.'),
      { code: 'auth/invalid-action-code' },
    )
  }
  if (deps?.applyCode) {
    await deps.applyCode(code)
    return
  }
  await applyActionCode(auth, code)
}

/** Fetch user profile from Firestore */
export async function getUserProfile(
  uid: string,
  options?: { throwOnError?: boolean; logger?: Pick<Console, 'error'> },
): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return null
    return snap.data() as UserProfile
  } catch (error) {
    const code = (error as { code?: string })?.code || 'firestore/getdoc-failed'
    ;(options?.logger ?? console).error(`[Firebase][getUserProfile] Failed for /users/${uid} [${code}]:`, error)
    if (options?.throwOnError) {
      throw error
    }
    return null
  }
}

export interface ResolveAuthProfileDeps {
  getProfile?: (uid: string) => Promise<UserProfile | null>
  ensureProfile?: (user: User) => Promise<UserProfile | null>
  logger?: Pick<Console, 'error'>
}

/** Resolves a persisted Firestore UserProfile or throws with logged failure code (never returns null/in-memory) */
export async function resolveAuthenticatedUserProfile(
  loggedUser: User,
  deps?: ResolveAuthProfileDeps,
): Promise<UserProfile> {
  const log = deps?.logger ?? console
  const getProfileFn = deps?.getProfile ?? ((uid: string) => getUserProfile(uid, { throwOnError: true, logger: log }))
  const ensureProfileFn = deps?.ensureProfile ?? ((u: User) => ensureUserProfile(u))

  let prof: UserProfile | null = null
  try {
    prof = await getProfileFn(loggedUser.uid)
    if (!prof) {
      prof = await ensureProfileFn(loggedUser)
    }
  } catch (err) {
    const code = (err as { code?: string })?.code || 'firestore/profile-unavailable'
    log.error(`[Firebase][resolveAuthenticatedUserProfile] Profile resolution failed [${code}]:`, err)
    if (err && typeof err === 'object' && !('code' in err)) {
      Object.assign(err as Record<string, unknown>, { code })
    }
    throw err
  }

  if (!prof) {
    const code = 'firestore/profile-null'
    const err = Object.assign(
      new Error(`No se encontró ni se pudo inicializar el perfil en /users/${loggedUser.uid} (${code}).`),
      { code },
    )
    log.error(`[Firebase][resolveAuthenticatedUserProfile] Null profile for uid=${loggedUser.uid} [${code}]`)
    throw err
  }

  return prof
}

/** Update user profile in Firestore and sync with Firebase Auth */
export async function updateUserProfile(uid: string, updates: Partial<UserProfile>) {
  const sanitizedUpdates = stripUndefinedUserFields(updates as Record<string, unknown>)
  if (Object.keys(sanitizedUpdates).length > 0) {
    await setDoc(doc(db, 'users', uid), sanitizedUpdates as any, { merge: true })
  }

  // Synchronize displayName and photoURL with Firebase Auth if this is current user
  if (auth.currentUser && auth.currentUser.uid === uid) {
    const authUpdates: { displayName?: string; photoURL?: string } = {}
    if (updates.username) authUpdates.displayName = updates.username
    if (updates.photoURL) authUpdates.photoURL = updates.photoURL
    if (Object.keys(authUpdates).length > 0) {
      await updateAuthProfile(auth.currentUser, authUpdates).catch((err) => {
        console.warn('Could not sync auth profile displayName/photoURL:', err)
      })
    }
  }
}

/** Ensure dedicated referral account document in /referrals/{uid} */
export async function ensureReferralAccount(uid: string, referralCode: string, referrerBy: string): Promise<ReferralAccount> {
  const refDoc = doc(db, 'referrals', uid)
  try {
    const snap = await getDoc(refDoc)
    if (snap.exists()) {
      return snap.data() as ReferralAccount
    }
  } catch (err) {
    console.warn('Could not read /referrals account:', err)
  }

  const initialAccount: ReferralAccount = {
    uid,
    referralCode,
    referrerBy: referrerBy || '',
    totalCommissionsEarned: 0,
    pendingCommissions: 0,
    withdrawableBalance: 0,
    totalWithdrawn: 0,
    directReferralsCount: 0,
    directReferrals: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  try {
    await setDoc(refDoc, initialAccount, { merge: true })
  } catch (err) {
    console.error('Error creating /referrals document:', err)
  }

  return initialAccount
}

/** Fetch referral account from /referrals/{uid} */
export async function getReferralAccount(uid: string): Promise<ReferralAccount | null> {
  try {
    const snap = await getDoc(doc(db, 'referrals', uid))
    if (!snap.exists()) return null
    return snap.data() as ReferralAccount
  } catch (error) {
    console.error('Error fetching referral account:', error)
    return null
  }
}

/** Fetch historical financial transactions for a referral account */
export async function getReferralTransactions(uid: string): Promise<ReferralTransaction[]> {
  try {
    const subCol = collection(db, 'referrals', uid, 'transactions')
    const snap = await getDocs(subCol)
    return snap.docs.map((d) => d.data() as ReferralTransaction)
  } catch (error) {
    console.error('Error fetching referral transactions:', error)
    return []
  }
}

/** Helper to build up to 20 levels upline chain from sponsor */
export async function buildUplinesChain(sponsorUid: string, sponsorCode: string): Promise<UnilevelUplineNode[]> {
  const uplines: UnilevelUplineNode[] = []
  const visited = new Set<string>()

  let currentId: string | null = sponsorUid
  let currentCode = sponsorCode

  for (let level = 1; level <= 20 && currentId; level++) {
    if (visited.has(currentId)) break
    visited.add(currentId)

    try {
      // First check unilevel doc
      const uniSnap = await getDoc(doc(db, 'unilevel', currentId))
      if (uniSnap.exists()) {
        const uniData = uniSnap.data() as UnilevelAccount
        uplines.push({
          level,
          uid: currentId,
          email: uniData.email || '',
          referralCode: uniData.referralCode || currentCode,
        })
        currentId = uniData.sponsorId
        currentCode = uniData.sponsorCode || ''
        continue
      }

      // Fallback to users doc
      const userSnap = await getDoc(doc(db, 'users', currentId))
      if (userSnap.exists()) {
        const uData = userSnap.data() as UserProfile
        uplines.push({
          level,
          uid: currentId,
          email: uData.email || '',
          referralCode: uData.referral?.referralCode || currentCode,
        })
        const nextCode = uData.referral?.referrerBy
        if (nextCode) {
          const nextSponsor = await findUserByReferralCode(nextCode)
          currentId = nextSponsor ? nextSponsor.uid : null
          currentCode = nextCode
        } else {
          currentId = null
        }
      } else {
        currentId = null
      }
    } catch {
      currentId = null
    }
  }

  return uplines
}

/** Ensure dedicated unilevel node document exists in /unilevel/{uid} */
export async function ensureUnilevelAccount(
  uid: string,
  email: string,
  referralCode: string,
  sponsorCode: string,
  sponsorUid: string,
): Promise<UnilevelAccount> {
  const uniRef = doc(db, 'unilevel', uid)
  try {
    const snap = await getDoc(uniRef)
    if (snap.exists()) {
      const existing = snap.data() as UnilevelAccount
      // If sponsor was not set initially but is known now, rebuild uplines
      if (!existing.sponsorId && sponsorUid) {
        existing.sponsorId = sponsorUid
        existing.sponsorCode = sponsorCode
        existing.uplines = await buildUplinesChain(sponsorUid, sponsorCode)
        existing.updatedAt = serverTimestamp()
        await setDoc(uniRef, existing, { merge: true })
      }
      return existing
    }
  } catch (err) {
    console.warn('Could not read /unilevel document:', err)
  }

  // Calculate uplines chain from sponsor up to 20 levels
  const uplines = sponsorUid ? await buildUplinesChain(sponsorUid, sponsorCode) : []

  const initialAccount: UnilevelAccount = {
    uid,
    email,
    referralCode,
    sponsorId: sponsorUid || null,
    sponsorCode: sponsorCode || '',
    uplines,
    directCount: 0,
    totalTeamCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  try {
    await setDoc(uniRef, initialAccount, { merge: true })
  } catch (err) {
    console.error('Error creating /unilevel document:', err)
  }

  // Increment sponsor and uplines team counts
  if (sponsorUid) {
    try {
      await updateDoc(doc(db, 'unilevel', sponsorUid), {
        directCount: increment(1),
        totalTeamCount: increment(1),
        updatedAt: serverTimestamp(),
      }).catch(() => {})

      // Increment team counts up the upline tree
      for (const up of uplines.slice(1)) {
        if (up.uid) {
          await updateDoc(doc(db, 'unilevel', up.uid), {
            totalTeamCount: increment(1),
            updatedAt: serverTimestamp(),
          }).catch(() => {})
        }
      }
    } catch (teamErr) {
      console.warn('Could not increment upline team counts:', teamErr)
    }
  }

  return initialAccount
}

/** Fetch unilevel account from /unilevel/{uid} */
export async function getUnilevelAccount(uid: string): Promise<UnilevelAccount | null> {
  try {
    const snap = await getDoc(doc(db, 'unilevel', uid))
    if (!snap.exists()) return null
    return snap.data() as UnilevelAccount
  } catch (error) {
    console.error('Error fetching unilevel account:', error)
    return null
  }
}

/** Assign a sponsor code to an existing user and add the user to sponsor's direct referrals and unilevel tree */
export async function assignSponsorToUser(
  userUid: string,
  userEmail: string,
  sponsorCode: string,
): Promise<{ success: boolean; sponsorCode?: string; error?: string }> {
  const sponsor = await findUserByReferralCode(sponsorCode)
  if (!sponsor) {
    return { success: false, error: 'Código de referido no encontrado en GoMining.' }
  }
  if (sponsor.uid === userUid) {
    return { success: false, error: 'No puedes usar tu propio código de referido como patrocinador.' }
  }

  // Update user document with referrerBy and sponsorId
  await updateDoc(doc(db, 'users', userUid), {
    'referral.referrerBy': sponsor.referralCode,
    sponsorId: sponsor.uid,
  })

  // Update referrals doc for user
  await updateDoc(doc(db, 'referrals', userUid), {
    referrerBy: sponsor.referralCode,
    updatedAt: serverTimestamp(),
  }).catch(() => {})

  // Add user to sponsor's direct referrals list in both users and referrals collections
  try {
    await updateDoc(doc(db, 'users', sponsor.uid), {
      'referral.userReferrals': arrayUnion(userEmail),
    })
    await updateDoc(doc(db, 'referrals', sponsor.uid), {
      directReferralsCount: increment(1),
      directReferrals: arrayUnion(userEmail),
      updatedAt: serverTimestamp(),
    }).catch(() => {})
  } catch (err) {
    console.warn('Could not update sponsor userReferrals array:', err)
  }

  // Update or initialize user unilevel node with full upline chain
  try {
    const uplines = await buildUplinesChain(sponsor.uid, sponsor.referralCode)
    await setDoc(doc(db, 'unilevel', userUid), {
      sponsorId: sponsor.uid,
      sponsorCode: sponsor.referralCode,
      uplines,
      updatedAt: serverTimestamp(),
    }, { merge: true })

    // Increment sponsor direct count and uplines team counts
    await updateDoc(doc(db, 'unilevel', sponsor.uid), {
      directCount: increment(1),
      totalTeamCount: increment(1),
      updatedAt: serverTimestamp(),
    }).catch(() => {})

    for (const up of uplines.slice(1)) {
      if (up.uid) {
        await updateDoc(doc(db, 'unilevel', up.uid), {
          totalTeamCount: increment(1),
          updatedAt: serverTimestamp(),
        }).catch(() => {})
      }
    }
  } catch (uniErr) {
    console.warn('Could not link sponsor into unilevel collection:', uniErr)
  }

  return { success: true, sponsorCode: sponsor.referralCode }
}

/** Saves purchased miner to Firestore at /miners/{uid}/miner/{minerId} */
export async function savePurchasedMiner(
  uid: string,
  minerData: StoredMiner,
  deps?: { setDoc?: (docRef: any, data: any, options?: any) => Promise<any> },
) {
  if (!minerData || typeof minerData !== 'object') {
    throw new Error('Cannot save miner without valid minerData')
  }

  const cleanUid = uid?.trim()
  if (!cleanUid) {
    throw new Error('Cannot save miner without a valid uid')
  }

  const minerId = minerData.id?.trim()
  if (!minerId) {
    throw new Error('Cannot save miner without a valid minerId')
  }

  const canonicalPackageId = minerData.packageId?.trim()
  const lowerPkg = canonicalPackageId?.toLowerCase() || ''
  if (!canonicalPackageId || lowerPkg.startsWith('pkg-miner_') || lowerPkg.startsWith('pkg-miner-') || lowerPkg.startsWith('pkg-miner')) {
    throw new Error(`Cannot save miner without a valid canonical packageId: '${minerData.packageId}'`)
  }

  const minerRef = doc(db, 'miners', cleanUid, 'miner', minerId)
  const nowIso = new Date().toISOString()
  const snap = minerData.packageSnapshot
  const executeSetDoc = deps?.setDoc || activeWriterHooks.setDoc
  await executeSetDoc(minerRef, {
    ...minerData,
    id: minerId,
    uid: cleanUid,
    packageId: canonicalPackageId,
    packageSnapshot: {
      name: snap?.name?.trim() || minerData.name,
      powerTh: (typeof snap?.powerTh === 'number' && snap.powerTh > 0) ? snap.powerTh : minerData.powerTh,
      price: (typeof snap?.price === 'number' && snap.price >= 0) ? snap.price : minerData.price,
      currency: snap?.currency || minerData.currency || 'USD',
      cadence: snap?.cadence || minerData.cadence || minerData.purchaseMode || 'once',
      purchaseMode: snap?.purchaseMode || minerData.purchaseMode || minerData.cadence || 'once',
      packageId: canonicalPackageId,
    },
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
  })
}

export interface AdminContractRecord {
  id: string
  userId: string
  userEmail: string
  packageId: string
  packageName: string
  contractedTh: number
  allocatedTh: number
  status: 'ACTIVE' | 'PENDING' | 'PARTIALLY_ALLOCATED' | 'SUSPENDED'
  pricePaidUsdt: number
  variablePct: number
  commissionPct: number
  workerId: string
  activatedAt: string
  expiresAt: string
  accumulatedProductionPrl: number
  accumulatedNetProfitUsd: number
  lastCalculatedAt: string
  txHash: string
  network: string
  source: string
  ownerWallet?: string
}

export interface AdminOrderRecord {
  orderId: string
  attemptId: string
  createdAt: string
  userId: string
  userEmail: string
  userName: string
  packageId: string
  packageName: string
  contractedTh: number
  amountUsd: number
  cryptoAsset: string
  cryptoAmount: string
  paymentNetwork: string
  recipientAddress: string
  txHash: string
  confirmations: number
  requiredConfirmations: number
  status: 'SETTLED' | 'CONFIRMED' | 'PENDING'
  bridgeStatus: string
  activatedMinerId: string
  idempotencyKey: string
  settledAt: string
}

export interface PublishedCommercialPackage {
  id: string
  name: string
  powerTh: number
  priceUsdt: number
  durationDays: number
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT'
  isPublished?: boolean
  variablePct: number
  commissionPct: number
  version: number
  description?: string
  createdAt?: string
  updatedAt?: string
}

/**
 * @deprecated Legacy export. DIRECT FIRESTORE READS ON commercial_packages ARE STRICTLY FORBIDDEN.
 * Canonical client catalog uses GET /api/catalog/storefront.
 * Deprecated fail-safe without exposing a fake static catalog.
 */
export const DEFAULT_COMMERCIAL_PACKAGES: PublishedCommercialPackage[] = []

/**
 * @deprecated Legacy commercial packages subscription.
 * Canonical client catalog uses GET /api/catalog/storefront.
 */
export function subscribeToPublishedCommercialPackages(
  callback: (packages: PublishedCommercialPackage[]) => void
): () => void {
  callback([])
  return () => {}
}

/**
 * @deprecated Legacy commercial packages fetch.
 * Canonical client catalog uses GET /api/catalog/storefront.
 */
export async function fetchPublishedCommercialPackages(): Promise<PublishedCommercialPackage[]> {
  return []
}

// ============================================================================
// STOREFRONT SECTIONS CONFIGURATION (Admin Remote Control for Modal Tabs)
// ============================================================================

export interface StorefrontSectionsConfig {
  showPresale: boolean
  showLaunch: boolean
  showMonthly: boolean
  showCustom: boolean
  updatedAt?: string
}

export const DEFAULT_STOREFRONT_SECTIONS: StorefrontSectionsConfig = {
  showPresale: true,
  showLaunch: true,
  showMonthly: true,
  showCustom: true,
}

/**
 * Subscribes to real-time section visibility toggled by the admin in MinerX.
 * Controls conditional rendering of Preventa, Lanzamiento, Mensual and Custom in client modal.
 */
export function subscribeToStorefrontSections(
  callback: (config: StorefrontSectionsConfig) => void
): () => void {
  try {
    const docRef = doc(db, 'admin_settings', 'storefront_sections')
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          callback({
            showPresale: data.showPresale !== false,
            showLaunch: data.showLaunch !== false,
            showMonthly: data.showMonthly !== false,
            showCustom: data.showCustom !== false,
            updatedAt: data.updatedAt,
          })
        } else {
          callback(DEFAULT_STOREFRONT_SECTIONS)
        }
      },
      (err) => {
        console.warn('[GoMining] Real-time subscription error for storefront sections, falling back:', err)
        fetchStorefrontSections().then(callback).catch(() => callback(DEFAULT_STOREFRONT_SECTIONS))
      }
    )
    return unsubscribe
  } catch (err) {
    console.warn('[GoMining] Could not initialize storefront sections listener:', err)
    fetchStorefrontSections().then(callback).catch(() => callback(DEFAULT_STOREFRONT_SECTIONS))
    return () => {}
  }
}

/**
 * Fetches current storefront sections config from Cloud Firestore /admin_settings/storefront_sections
 */
export async function fetchStorefrontSections(): Promise<StorefrontSectionsConfig> {
  try {
    const docRef = doc(db, 'admin_settings', 'storefront_sections')
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      const data = snap.data()
      return {
        showPresale: data.showPresale !== false,
        showLaunch: data.showLaunch !== false,
        showMonthly: data.showMonthly !== false,
        showCustom: data.showCustom !== false,
        updatedAt: data.updatedAt,
      }
    }
  } catch (err) {
    console.warn('[GoMining] Error fetching storefront sections from Firestore:', err)
  }

  // Local fallback
  try {
    const res = await fetch('http://127.0.0.1:3001/api/admin/storefront-sections', { signal: AbortSignal.timeout(1200) })
    if (res.ok) {
      const data = await res.json()
      if (data && typeof data === 'object') {
        return {
          showPresale: data.showPresale !== false,
          showLaunch: data.showLaunch !== false,
          showMonthly: data.showMonthly !== false,
          showCustom: data.showCustom !== false,
          updatedAt: data.updatedAt,
        }
      }
    }
  } catch {
    // offline fallback
  }

  return DEFAULT_STOREFRONT_SECTIONS
}

/**
 * Saves storefront sections config to Cloud Firestore /admin_settings/storefront_sections
 */
export async function saveStorefrontSections(config: Partial<StorefrontSectionsConfig>): Promise<boolean> {
  try {
    const docRef = doc(db, 'admin_settings', 'storefront_sections')
    await setDoc(docRef, {
      ...config,
      updatedAt: new Date().toISOString()
    }, { merge: true })
    return true
  } catch (err) {
    console.error('[GoMining] Error saving storefront sections:', err)
    return false
  }
}

/**
 * Records a client miner purchase into the platform administration collections
 * (/admin_contracts and /admin_orders) so it immediately displays on the MinerX Admin Dashboard.
 * Dual-syncs to Cloud Firestore and the Express REST API.
 */
export async function recordMinerPurchaseToAdmin(
  params: {
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
  },
  deps?: { setDoc?: (docRef: any, data: any, options?: any) => Promise<any> },
): Promise<void> {
  if (!params || typeof params !== 'object') {
    throw new Error('Cannot record miner purchase without valid parameters')
  }

  const minerId = params.minerId?.trim()
  if (!minerId) {
    throw new Error('Cannot record miner purchase without a valid minerId')
  }

  const packageId = params.packageId?.trim()
  const lowerPkg = packageId?.toLowerCase() || ''
  if (!packageId || lowerPkg.startsWith('pkg-miner_') || lowerPkg.startsWith('pkg-miner-') || lowerPkg.startsWith('pkg-miner')) {
    throw new Error(`Invalid packageId for miner purchase: '${params.packageId}'. Canonical purchase requires a valid packageId.`)
  }

  const uid = params.uid?.trim()
  if (!uid) {
    throw new Error('Cannot record miner purchase without a valid user uid')
  }

  const now = new Date().toISOString()
  const rawWallet = params.ownerWallet?.trim()
  const buyerUid = uid
  const buyerEmail = params.email?.trim() || (rawWallet ? `wallet_${rawWallet.slice(0, 6)}@crypto.com` : `cliente_${minerId}@gomining.cloud`)

  const contractDoc: AdminContractRecord = {
    id: minerId,
    userId: buyerUid,
    userEmail: buyerEmail,
    packageId: packageId,
    packageName: params.name,
    contractedTh: params.powerTh,
    allocatedTh: params.powerTh,
    status: 'ACTIVE',
    pricePaidUsdt: params.price,
    variablePct: 0,
    commissionPct: 2,
    workerId: `vwk-${minerId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`,
    activatedAt: now,
    expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
    accumulatedProductionPrl: 0,
    accumulatedNetProfitUsd: 0,
    lastCalculatedAt: now,
    txHash: params.txHash || `tx_${minerId}`,
    network: params.network || 'USDT',
    source: 'GoMining Client',
    ...(rawWallet ? { ownerWallet: rawWallet } : {}),
  }

  const orderId = `ord_${minerId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const orderDoc: AdminOrderRecord = {
    orderId,
    attemptId: `att_${Date.now()}`,
    createdAt: now,
    userId: buyerUid,
    userEmail: buyerEmail,
    userName: buyerEmail.split('@')[0] || 'Cliente GoMining',
    packageId: packageId,
    packageName: params.name,
    contractedTh: params.powerTh,
    amountUsd: params.price,
    cryptoAsset: 'USDT',
    cryptoAmount: `${params.price} USDT`,
    paymentNetwork: params.network || 'TRON',
    recipientAddress: params.ownerWallet || 'PLATFORM_TREASURY',
    txHash: params.txHash || `tx_${minerId}`,
    confirmations: 12,
    requiredConfirmations: 12,
    status: 'SETTLED',
    bridgeStatus: 'NONE',
    activatedMinerId: minerId,
    idempotencyKey: `ord_${minerId}`,
    settledAt: now,
  }

  const executeSetDoc = deps?.setDoc || activeWriterHooks.setDoc
  await Promise.all([
    executeSetDoc(doc(db, 'admin_contracts', minerId), contractDoc, { merge: true }),
    executeSetDoc(doc(db, 'admin_orders', orderId), orderDoc, { merge: true }),
  ])

  // Dual sync: also post to Express REST API if available
  try {
    const postOptions = (payload: any) => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1500),
    })
    await Promise.allSettled([
      fetch('http://127.0.0.1:3001/api/admin/contracts', postOptions(contractDoc)),
      fetch('http://127.0.0.1:3001/api/admin/orders', postOptions(orderDoc)),
    ])
  } catch {
    // Backend REST service is optional/offline
  }
}

/** Fetch a single miner for a user by id */
export async function getMinerById(uid: string, minerId: string): Promise<StoredMiner | null> {
  try {
    const minerRef = doc(db, 'miners', uid, 'miner', minerId)
    const snap = await getDoc(minerRef)
    if (!snap.exists()) return null
    return snap.data() as StoredMiner
  } catch (error) {
    console.error('Error fetching miner by id from Firestore:', error)
    return null
  }
}

/** Fetch all miners for a given user from /miners/{uid}/miner, reusing an active realtime listener. */
export async function getUserMiners(uid: string): Promise<StoredMiner[]> {
  if (isUserMinersListenerActive(uid)) {
    const cached = getUserMinersFromStore(uid)
    if (cached !== null) {
      return cached
    }
    return new Promise<StoredMiner[]>((resolve) => {
      const unsubscribe = subscribeToUserMiners(uid, (miners) => {
        unsubscribe()
        resolve(miners)
      })
    })
  }

  try {
    const colRef = collection(db, 'miners', uid, 'miner')
    const snap = await getDocs(colRef)
    return snap.docs.map((d) => ({ ...(d.data() as StoredMiner), id: d.id }))
  } catch (error) {
    console.error('Error fetching user miners from Firestore:', error)
    return []
  }
}

/** Update visual traits or status of a miner in Firestore */
export async function updateMinerInFirestore(
  uid: string,
  minerId: string,
  updates: Partial<StoredMiner>,
  deps?: { updateDoc?: (docRef: any, updates: any) => Promise<any> },
) {
  try {
    const minerRef = doc(db, 'miners', uid, 'miner', minerId)
    const executeUpdateDoc = deps?.updateDoc || activeWriterHooks.updateDoc
    await executeUpdateDoc(minerRef, updates as any)
  } catch (error) {
    console.error('Error updating miner in Firestore:', error)
    throw error
  }
}

/**
 * Credits 10% direct commission to the referrer if the buyer has a referrerBy code.
 * Distinguishes between first purchase ('first_purchase') and repurchase ('repurchase').
 * Tracks purchasesCount, firstPurchaseAt, and lastPurchaseAt on the buyer.
 * Updates both users/{sponsor.uid} and the dedicated financial collection /referrals/{sponsor.uid}.
 * Idempotent: checks for existing commission on minerId to prevent duplicate awards.
 */
export async function creditDirectReferralCommission(
  buyerUid: string,
  buyerEmail: string,
  minerPrice: number,
  minerId: string,
  txHash: string,
): Promise<ReferralCommission | null> {
  try {
    const buyerProfile = await getUserProfile(buyerUid)
    const currentPurchases = buyerProfile?.purchasesCount ?? 0
    const isFirstPurchase = currentPurchases === 0
    const purchaseType: 'first_purchase' | 'repurchase' = isFirstPurchase ? 'first_purchase' : 'repurchase'
    const nextPurchaseNumber = currentPurchases + 1

    // Update buyer purchase tracking
    const buyerUpdates: Record<string, any> = {
      purchasesCount: increment(1),
      lastPurchaseAt: serverTimestamp(),
    }
    if (isFirstPurchase) {
      buyerUpdates.firstPurchaseAt = serverTimestamp()
    }
    await updateDoc(doc(db, 'users', buyerUid), buyerUpdates).catch((err) => {
      console.warn('Failed to update buyer purchasesCount:', err)
    })

    const referrerCode = buyerProfile?.referral?.referrerBy
    if (!referrerCode) {
      return null
    }

    const sponsor = await findUserByReferralCode(referrerCode)
    if (!sponsor || sponsor.uid === buyerUid) {
      return null
    }

    // Deterministic commissionId for idempotency
    const commissionId = `COMM-${minerId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
    const commDocRef = doc(db, 'referralCommissions', commissionId)
    const existingSnap = await getDoc(commDocRef)
    if (existingSnap.exists()) {
      console.warn('Direct referral commission already processed for miner:', minerId)
      return existingSnap.data() as ReferralCommission
    }

    const commissionAmount = Number((minerPrice * 0.10).toFixed(2))

    const commissionRecord: ReferralCommission = {
      id: commissionId,
      referrerUid: sponsor.uid,
      referrerCode,
      buyerUid,
      buyerEmail,
      minerId,
      minerPrice,
      commissionAmount,
      rate: 0.10,
      txHash,
      status: 'credited',
      type: purchaseType,
      purchaseNumber: nextPurchaseNumber,
      createdAt: serverTimestamp(),
    }

    // Save commission log
    await setDoc(commDocRef, commissionRecord)

    // Credit sponsor balance in users collection
    await updateDoc(doc(db, 'users', sponsor.uid), {
      commissionBalance: increment(commissionAmount),
      balance: increment(commissionAmount),
      totalCommissionsEarned: increment(commissionAmount),
    })

    // Ensure sponsor referral ledger account exists
    await ensureReferralAccount(sponsor.uid, sponsor.referralCode, '')

    // Credit sponsor balance in dedicated /referrals collection
    await updateDoc(doc(db, 'referrals', sponsor.uid), {
      totalCommissionsEarned: increment(commissionAmount),
      withdrawableBalance: increment(commissionAmount),
      lastCommissionAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch((err) => {
      console.warn('Could not update /referrals doc for sponsor:', err)
    })

    // Create financial transaction record in /referrals/{uid}/transactions
    const txDoc: ReferralTransaction = {
      id: commissionId,
      referralUid: sponsor.uid,
      type: 'commission_income',
      amount: commissionAmount,
      currency: 'USD',
      source: 'miner_purchase',
      purchaseType,
      purchaseNumber: nextPurchaseNumber,
      buyerUid,
      buyerEmail,
      minerId,
      minerPrice,
      rate: 0.10,
      description: `Bono directo 10% por ${purchaseType === 'first_purchase' ? 'primera compra' : 'recompra'} de minero (${minerId})`,
      status: 'completed',
      timestamp: serverTimestamp(),
    }

    await setDoc(doc(db, 'referrals', sponsor.uid, 'transactions', commissionId), txDoc).catch((err) => {
      console.warn('Could not store transaction in /referrals subcollection:', err)
    })

    return commissionRecord
  } catch (error) {
    console.error('Error crediting referral commission:', error)
    return null
  }
}

/** Get list of commissions earned by a user */
export async function getUserCommissions(referrerUid: string): Promise<ReferralCommission[]> {
  try {
    const q = query(collection(db, 'referralCommissions'), where('referrerUid', '==', referrerUid))
    const snap = await getDocs(q)
    return snap.docs.map((d) => d.data() as ReferralCommission)
  } catch (error) {
    console.error('Error fetching user commissions:', error)
    return []
  }
}

/**
 * Executes a 20-Level Unilevel distribution over daily eligible mining profits.
 * Conforms to Notion Technical Design:
 * - 20% of daily eligible profit (gross profit - operating costs) is distributed across up to 20 upline levels.
 * - Records documents in /mining_daily_profit and /unilevel_distributions.
 * - Credits each upline sponsor in /referrals/{uplineUid} and /referrals/{uplineUid}/transactions.
 */
export async function executeUnilevelDistribution(
  minerUid: string,
  minerId: string,
  dailyGrossProfit: number,
  dailyCosts: number,
  customDate?: string,
): Promise<UnilevelDistributionDoc> {
  const dateStr = customDate || new Date().toISOString().split('T')[0]
  const eligibleProfit = Math.max(0, Number((dailyGrossProfit - dailyCosts).toFixed(2)))
  // 20% pool of eligible profit
  const unilevelPool = Number((eligibleProfit * 0.20).toFixed(2))

  const distributionId = `UNILVL-${minerUid.slice(0, 8)}-${dateStr}-${minerId.slice(0, 10)}`
  const dailyProfitId = `PROFIT-${minerUid.slice(0, 8)}-${dateStr}-${minerId.slice(0, 10)}`

  // Store daily profit record in /mining_daily_profit
  const dailyProfitRecord: MiningDailyProfitDoc = {
    id: dailyProfitId,
    date: dateStr,
    minerUid,
    minerId,
    dailyGrossProfit,
    dailyCosts,
    eligibleProfit,
    unilevelPool,
    status: 'processed',
    createdAt: serverTimestamp(),
  }
  await setDoc(doc(db, 'mining_daily_profit', dailyProfitId), dailyProfitRecord).catch(() => {})

  const distributions: UnilevelLevelDistribution[] = []
  let totalDistributed = 0
  let totalUnclaimed = 0

  // Pre-load unilevel uplines if user node exists in /unilevel/{minerUid}
  const unilevelAccount = await getUnilevelAccount(minerUid).catch(() => null)
  const precomputedUplines = unilevelAccount?.uplines || []

  let currentUserId: string | null = minerUid
  const visitedUplineIds = new Set<string>([minerUid])

  for (let level = 1; level <= 20; level++) {
    const percentage = UNILEVEL_20_LEVEL_PERCENTAGES[level - 1] ?? 1
    const amount = Number((unilevelPool * (percentage / 100)).toFixed(4))
    const rate = Number((0.20 * (percentage / 100)).toFixed(4))

    let sponsorFound: { uid: string; email: string; referralCode: string } | null = null

    // Check precomputed unilevel account upline first (O(1) lookup)
    const precomputed = precomputedUplines.find((u) => u.level === level)
    if (precomputed && precomputed.uid && !visitedUplineIds.has(precomputed.uid)) {
      sponsorFound = {
        uid: precomputed.uid,
        email: precomputed.email,
        referralCode: precomputed.referralCode,
      }
      visitedUplineIds.add(precomputed.uid)
    } else if (currentUserId) {
      try {
        const currentUserProfile = await getUserProfile(currentUserId)
        const referrerCode = currentUserProfile?.referral?.referrerBy
        if (referrerCode) {
          const sponsor = await findUserByReferralCode(referrerCode)
          if (sponsor && !visitedUplineIds.has(sponsor.uid)) {
            sponsorFound = sponsor
            visitedUplineIds.add(sponsor.uid)
            currentUserId = sponsor.uid
          } else {
            currentUserId = null
          }
        } else {
          currentUserId = null
        }
      } catch {
        currentUserId = null
      }
    }

    if (sponsorFound && amount > 0) {
      distributions.push({
        level,
        sponsorId: sponsorFound.uid,
        sponsorEmail: sponsorFound.email,
        percentage,
        rate,
        amount,
        status: 'credited',
      })
      totalDistributed = Number((totalDistributed + amount).toFixed(4))

      // Credit upline in /referrals/{uplineUid} and transaction subcollection
      try {
        await ensureReferralAccount(sponsorFound.uid, sponsorFound.referralCode, '')
        await updateDoc(doc(db, 'referrals', sponsorFound.uid), {
          totalCommissionsEarned: increment(amount),
          withdrawableBalance: increment(amount),
          lastCommissionAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {})

        const txId = `${distributionId}_L${level}`
        const unilevelTx: ReferralTransaction = {
          id: txId,
          referralUid: sponsorFound.uid,
          type: 'unilevel_income',
          amount,
          currency: 'USD',
          source: 'unilevel_daily_profit',
          level,
          rate,
          description: `Comisión Unilevel Nivel ${level} (${percentage}% del fondo 20%) por profit minero ${minerId}`,
          status: 'completed',
          timestamp: serverTimestamp(),
        }
        await setDoc(doc(db, 'referrals', sponsorFound.uid, 'transactions', txId), unilevelTx).catch(() => {})
      } catch (uplineErr) {
        console.warn(`Failed to credit upline L${level}:`, uplineErr)
      }
    } else {
      distributions.push({
        level,
        sponsorId: null,
        sponsorEmail: null,
        percentage,
        rate,
        amount,
        status: 'unclaimed_missing_upline',
      })
      totalUnclaimed = Number((totalUnclaimed + amount).toFixed(4))
    }
  }

  const distributionDoc: UnilevelDistributionDoc = {
    id: distributionId,
    date: dateStr,
    minerUid,
    minerId,
    eligibleProfit,
    unilevelPool,
    maxLevels: 20,
    distributions,
    totalDistributed,
    totalUnclaimed,
    createdAt: serverTimestamp(),
  }

  await setDoc(doc(db, 'unilevel_distributions', distributionId), distributionDoc).catch(() => {})

  return distributionDoc
}

/** Get unilevel distributions for a given miner owner */
export async function getUnilevelDistributions(minerUid: string): Promise<UnilevelDistributionDoc[]> {
  try {
    const q = query(collection(db, 'unilevel_distributions'), where('minerUid', '==', minerUid))
    const snap = await getDocs(q)
    return snap.docs.map((d) => d.data() as UnilevelDistributionDoc)
  } catch (error) {
    console.error('Error fetching unilevel distributions:', error)
    return []
  }
}

/** Get mining daily profit records */
export async function getMiningDailyProfits(minerUid: string): Promise<MiningDailyProfitDoc[]> {
  try {
    const q = query(collection(db, 'mining_daily_profit'), where('minerUid', '==', minerUid))
    const snap = await getDocs(q)
    return snap.docs.map((d) => d.data() as MiningDailyProfitDoc)
  } catch (error) {
    console.error('Error fetching mining daily profits:', error)
    return []
  }
}

export {
  cleanupUserMinersSubscription,
  getMinerFromSharedStore,
  subscribeToSingleMinerDoc,
  subscribeToUserMiners,
  useRealtimeUserMiners,
} from './userMinersStore.ts'
