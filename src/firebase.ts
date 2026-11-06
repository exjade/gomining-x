import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile as updateAuthProfile,
  type User,
} from 'firebase/auth'
import {
  getFirestore,
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

import { detectUserGeo } from './geoIp'

export type FirestoreTimestamp = Timestamp | FieldValue | string | null

export interface CountryRecord {
  uid: string
  country: string
  detectedAt: FirestoreTimestamp
  ip: string
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

export interface UserReferralData {
  referrerBy: string
  referralCode: string
  userReferrals: string[]
  joinDate?: FirestoreTimestamp
}

export interface UserProfile {
  uid: string
  email: string
  username: string
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

export interface StoredMiner {
  id: string
  uid: string
  name: string
  powerTh: number
  efficiency: number
  efficiencyWattsPerTh: number
  price: number
  currency: string
  status: 'active' | 'mining' | 'customizing'
  txHash: string
  createdAt?: FirestoreTimestamp
  network: string
  ownerWallet: string
  visualTraits: StoredMinerTraits
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

/** Finds a user by their referral code (case-insensitive fallback) */
export async function findUserByReferralCode(code: string): Promise<{ uid: string; email: string; referralCode: string } | null> {
  const cleanCode = code.trim()
  if (!cleanCode) return null
  try {
    let q = query(collection(db, 'users'), where('referral.referralCode', '==', cleanCode.toUpperCase()))
    let snap = await getDocs(q)
    if (snap.empty && cleanCode.toLowerCase() !== cleanCode.toUpperCase()) {
      q = query(collection(db, 'users'), where('referral.referralCode', '==', cleanCode.toLowerCase()))
      snap = await getDocs(q)
    }
    if (snap.empty) {
      q = query(collection(db, 'users'), where('referral.referralCode', '==', cleanCode))
      snap = await getDocs(q)
    }
    if (snap.empty) return null
    const docData = snap.docs[0].data() as UserProfile
    return {
      uid: snap.docs[0].id,
      email: docData.email,
      referralCode: docData.referral?.referralCode || cleanCode.toUpperCase(),
    }
  } catch (error) {
    console.error('Error looking up referral code:', error)
    return null
  }
}

/** Registers a new user with email and password, creates profile with referral code */
export async function registerWithEmail(email: string, password: string, referralCodeProvided?: string) {
  const cleanEmail = email.toLowerCase().trim()
  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password)
  const user = cred.user

  // Send verification email
  try {
    await sendEmailVerification(user)
  } catch (err) {
    console.warn('Could not send verification email automatically:', err)
  }

  // Handle sponsor referral validation
  let validReferrerCode = ''
  let referrerUid = ''
  if (referralCodeProvided && referralCodeProvided.trim()) {
    try {
      const sponsor = await findUserByReferralCode(referralCodeProvided)
      if (sponsor && sponsor.uid !== user.uid) {
        validReferrerCode = sponsor.referralCode
        referrerUid = sponsor.uid
      }
    } catch (err) {
      console.warn('Could not validate sponsor referral code:', err)
    }
  }

  const myReferralCode = generateReferralCode(cleanEmail)
  const username = cleanEmail.split('@')[0]
  const geo = await detectUserGeo().catch(() => ({ country: 'United States', ip: '127.0.0.1' }))

  const userDoc: UserProfile = {
    uid: user.uid,
    email: cleanEmail,
    username,
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
    country: geo.country,
    twoFactorEnabled: false,
    sponsorId: referrerUid || undefined,
  }

  // Save profile to Firestore
  try {
    await setDoc(doc(db, 'users', user.uid), userDoc)
  } catch (err) {
    console.warn('Initial setDoc on /users failed, attempting merge setDoc:', err)
    try {
      await setDoc(doc(db, 'users', user.uid), userDoc, { merge: true })
    } catch (err2) {
      console.error('Critical warning: Firestore setDoc failed during registration:', err2)
    }
  }

  // Save detected country to dedicated /countries/{uid} collection
  await saveDetectedCountry(user.uid, geo.country, geo.ip).catch(() => {})

  // Ensure dedicated referral document in /referrals/{uid}
  try {
    await ensureReferralAccount(user.uid, myReferralCode, validReferrerCode)
  } catch (refErr) {
    console.warn('Could not initialize /referrals document:', refErr)
  }

  // Ensure dedicated unilevel tree document in /unilevel/{uid}
  try {
    await ensureUnilevelAccount(user.uid, cleanEmail, myReferralCode, validReferrerCode, referrerUid)
  } catch (uniErr) {
    console.warn('Could not initialize /unilevel document:', uniErr)
  }

  // Link to sponsor userReferrals and update sponsor /referrals/{referrerUid} if valid
  if (referrerUid) {
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
      console.warn('Failed to link referral into sponsor document:', err)
    }
  }

  return { user, profile: userDoc }
}

/** Ensures a Firestore profile exists for an authenticated user, creating one if missing */
export async function ensureUserProfile(user: User): Promise<UserProfile | null> {
  if (!user || user.isAnonymous) return null
  const existing = await getUserProfile(user.uid)
  if (existing) {
    // Check dedicated /countries/{uid} collection and auto-detect in background if missing
    void getUserCountryRecord(user.uid).then(async (rec) => {
      if (!rec || !existing.country) {
        const geo = await detectUserGeo().catch(() => ({ country: 'United States', ip: '127.0.0.1' }))
        await saveDetectedCountry(user.uid, geo.country, geo.ip).catch(() => {})
        if (!existing.country) {
          await updateDoc(doc(db, 'users', user.uid), { country: geo.country }).catch(() => {})
        }
      }
    })
    // Also ensure /referrals/{uid} and /unilevel/{uid} exist
    await ensureReferralAccount(user.uid, existing.referral?.referralCode || generateReferralCode(user.email || ''), existing.referral?.referrerBy || '').catch(() => {})
    await ensureUnilevelAccount(user.uid, user.email || '', existing.referral?.referralCode || generateReferralCode(user.email || ''), existing.referral?.referrerBy || '', existing.sponsorId || '').catch(() => {})
    return existing
  }

  const cleanEmail = (user.email || '').toLowerCase().trim()
  if (!cleanEmail) return null
  const myReferralCode = generateReferralCode(cleanEmail)
  const username = cleanEmail.split('@')[0] || 'User'
  const geo = await detectUserGeo().catch(() => ({ country: 'United States', ip: '127.0.0.1' }))

  const userDoc: UserProfile = {
    uid: user.uid,
    email: cleanEmail,
    username,
    createdAt: serverTimestamp(),
    emailVerified: user.emailVerified,
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
    country: geo.country,
    twoFactorEnabled: false,
  }

  try {
    await setDoc(doc(db, 'users', user.uid), userDoc, { merge: true })
    await saveDetectedCountry(user.uid, geo.country, geo.ip).catch(() => {})
    await ensureReferralAccount(user.uid, myReferralCode, '')
    await ensureUnilevelAccount(user.uid, cleanEmail, myReferralCode, '', '')
  } catch (err) {
    console.error('Error creating profile in ensureUserProfile:', err)
  }

  return userDoc
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

/** Fetch user profile from Firestore */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return null
    return snap.data() as UserProfile
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return null
  }
}

/** Update user profile in Firestore and sync with Firebase Auth */
export async function updateUserProfile(uid: string, updates: Partial<UserProfile>) {
  await setDoc(doc(db, 'users', uid), updates as any, { merge: true })

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

/**
 * Executes a withdrawal from the user's withdrawable commission balance in /referrals/{uid}.
 * Records transaction with type 'withdrawal' in /referrals/{uid}/transactions subcollection.
 * Decrements withdrawableBalance and increments totalWithdrawn.
 */
export async function executeReferralWithdrawal(
  uid: string,
  amount: number,
  destinationWallet?: string,
): Promise<{ success: boolean; tx?: ReferralTransaction; error?: string }> {
  const cleanAmount = Number(amount.toFixed(2))
  if (!cleanAmount || cleanAmount <= 0) {
    return { success: false, error: 'El monto de retiro debe ser mayor a 0 USD.' }
  }

  try {
    const account = await getReferralAccount(uid)
    const available = account?.withdrawableBalance ?? 0
    if (cleanAmount > available) {
      return {
        success: false,
        error: `Saldo insuficiente. Saldo retirable disponible: $${available.toFixed(2)} USD.`,
      }
    }

    const txId = `WD-${uid.slice(0, 6)}-${Date.now()}`
    const txDoc: ReferralTransaction = {
      id: txId,
      referralUid: uid,
      type: 'withdrawal',
      amount: -cleanAmount,
      currency: 'USD',
      source: 'miner_purchase',
      description: destinationWallet
        ? `Retiro de comisiones a wallet ${destinationWallet.slice(0, 6)}...${destinationWallet.slice(-4)}`
        : 'Retiro de comisiones acumuladas',
      status: 'completed',
      timestamp: serverTimestamp(),
    }

    // 1. Record transaction in /referrals/{uid}/transactions/{txId}
    await setDoc(doc(db, 'referrals', uid, 'transactions', txId), txDoc)

    // 2. Decrement withdrawableBalance and increment totalWithdrawn in /referrals/{uid}
    await updateDoc(doc(db, 'referrals', uid), {
      withdrawableBalance: increment(-cleanAmount),
      totalWithdrawn: increment(cleanAmount),
      updatedAt: serverTimestamp(),
    })

    // 3. Keep user profile balance in sync
    await updateDoc(doc(db, 'users', uid), {
      commissionBalance: increment(-cleanAmount),
      balance: increment(-cleanAmount),
    }).catch(() => {})

    return { success: true, tx: txDoc }
  } catch (err: any) {
    console.error('Error processing referral withdrawal:', err)
    return { success: false, error: err?.message || 'Error al procesar el retiro.' }
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
export async function savePurchasedMiner(uid: string, minerData: StoredMiner) {
  const minerRef = doc(db, 'miners', uid, 'miner', minerData.id)
  await setDoc(minerRef, {
    ...minerData,
    createdAt: serverTimestamp(),
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

export const DEFAULT_COMMERCIAL_PACKAGES: PublishedCommercialPackage[] = [
  {
    id: 'pkg-miner-1',
    name: 'Minero 1 Entry',
    powerTh: 48,
    priceUsdt: 561.99,
    durationDays: 365,
    status: 'ACTIVE',
    isPublished: true,
    variablePct: 0.0,
    commissionPct: 2.0,
    version: 1,
    description: 'Paquete de entrada optimizado para minería continua de PearlHash.',
  },
  {
    id: 'pkg-miner-2',
    name: 'Minero 2 Standard',
    powerTh: 64,
    priceUsdt: 744.99,
    durationDays: 365,
    status: 'ACTIVE',
    isPublished: true,
    variablePct: 2.5,
    commissionPct: 2.0,
    version: 1,
    description: 'Rendimiento equilibrado con multiplicador variable del +2.5%.',
  },
  {
    id: 'pkg-miner-3',
    name: 'Minero 3 Pro',
    powerTh: 96,
    priceUsdt: 1111.99,
    durationDays: 365,
    status: 'ACTIVE',
    isPublished: true,
    variablePct: 5.0,
    commissionPct: 1.8,
    version: 1,
    description: 'Alta potencia para operadores profesionales con +5.0% de variable.',
  },
  {
    id: 'pkg-miner-4',
    name: 'Minero 4 Master',
    powerTh: 128,
    priceUsdt: 1474.99,
    durationDays: 365,
    status: 'ACTIVE',
    isPublished: true,
    variablePct: 7.5,
    commissionPct: 1.5,
    version: 1,
    description: 'Potencia industrial con tasa preferencial de comisión reducida.',
  },
  {
    id: 'pkg-miner-5',
    name: 'Minero 5 Enterprise',
    powerTh: 192,
    priceUsdt: 2201.99,
    durationDays: 365,
    status: 'ACTIVE',
    isPublished: true,
    variablePct: 10.0,
    commissionPct: 1.0,
    version: 1,
    description: 'Máxima capacidad computacional con variable premium del +10.0%.',
  },
]

function parseCommercialPackageDoc(id: string, data: any): PublishedCommercialPackage {
  return {
    id,
    name: data.name || 'Paquete Minero',
    powerTh: Number(data.powerTh) || 0,
    priceUsdt: Number(data.priceUsdt) || 0,
    durationDays: Number(data.durationDays) || 365,
    status: data.status || 'ACTIVE',
    isPublished: data.isPublished ?? (data.status === 'ACTIVE'),
    variablePct: Number(data.variablePct) || 0,
    commissionPct: Number(data.commissionPct) || 2,
    version: Number(data.version) || 1,
    description: data.description || '',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

/**
 * Subscribes to published commercial packages from Cloud Firestore /commercial_packages in real-time.
 * Automatically triggers callback on live updates made by the admin in MinerX.
 */
export function subscribeToPublishedCommercialPackages(
  callback: (packages: PublishedCommercialPackage[]) => void
): () => void {
  try {
    const colRef = collection(db, 'commercial_packages')
    const unsubscribe = onSnapshot(
      colRef,
      (snap) => {
        if (!snap.empty) {
          const active = snap.docs
            .map((d) => parseCommercialPackageDoc(d.id, d.data()))
            .filter((p) => p.status === 'ACTIVE' && p.isPublished !== false)
          if (active.length > 0) {
            callback(active)
            return
          }
        }
        callback(DEFAULT_COMMERCIAL_PACKAGES)
      },
      (err) => {
        console.warn('[GoMining] Real-time subscription error for commercial packages, falling back:', err)
        fetchPublishedCommercialPackages().then(callback).catch(() => callback(DEFAULT_COMMERCIAL_PACKAGES))
      }
    )
    return unsubscribe
  } catch (err) {
    console.warn('[GoMining] Could not initialize commercial packages listener:', err)
    fetchPublishedCommercialPackages().then(callback).catch(() => callback(DEFAULT_COMMERCIAL_PACKAGES))
    return () => {}
  }
}

/**
 * Fetches published commercial packages from Cloud Firestore /commercial_packages.
 * Falls back to Express REST API and DEFAULT_COMMERCIAL_PACKAGES if empty or uninitialized.
 */
export async function fetchPublishedCommercialPackages(): Promise<PublishedCommercialPackage[]> {
  try {
    const colRef = collection(db, 'commercial_packages')
    const snap = await getDocs(colRef)
    if (!snap.empty) {
      const active = snap.docs
        .map((d) => parseCommercialPackageDoc(d.id, d.data()))
        .filter((p) => p.status === 'ACTIVE' && p.isPublished !== false)

      if (active.length > 0) return active
    }
  } catch (err) {
    console.warn('[GoMining] Error fetching published commercial packages from Firestore:', err)
  }

  // Dual fallback: Attempt Express REST backend endpoint if running locally
  try {
    const res = await fetch('http://127.0.0.1:3001/api/packages', { signal: AbortSignal.timeout(1200) })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        const active = data
          .map((p: any) => parseCommercialPackageDoc(p.id, p))
          .filter((p: any) => p.status === 'ACTIVE' && p.isPublished !== false)
        if (active.length > 0) return active
      }
    }
  } catch {
    // REST backend is optional/offline, fall back to default catalog
  }

  return DEFAULT_COMMERCIAL_PACKAGES
}

/**
 * Records a client miner purchase into the platform administration collections
 * (/admin_contracts and /admin_orders) so it immediately displays on the MinerX Admin Dashboard.
 * Dual-syncs to Cloud Firestore and the Express REST API.
 */
export async function recordMinerPurchaseToAdmin(params: {
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
}): Promise<void> {
  const now = new Date().toISOString()
  const buyerEmail = params.email || (params.ownerWallet ? `wallet_${params.ownerWallet.slice(0, 6)}@crypto.com` : 'cliente@gomining.cloud')
  const buyerUid = params.uid || 'usr_client'

  const contractDoc: AdminContractRecord = {
    id: params.minerId,
    userId: buyerUid,
    userEmail: buyerEmail,
    packageId: params.packageId || `pkg-${params.minerId}`,
    packageName: params.name,
    contractedTh: params.powerTh,
    allocatedTh: params.powerTh,
    status: 'ACTIVE',
    pricePaidUsdt: params.price,
    variablePct: 0,
    commissionPct: 2,
    workerId: `vwk-${params.minerId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`,
    activatedAt: now,
    expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
    accumulatedProductionPrl: 0,
    accumulatedNetProfitUsd: 0,
    lastCalculatedAt: now,
    txHash: params.txHash || `tx_${params.minerId}`,
    network: params.network || 'USDT',
    source: 'GoMining Client',
  }

  const orderId = `ord_${params.minerId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const orderDoc: AdminOrderRecord = {
    orderId,
    attemptId: `att_${Date.now()}`,
    createdAt: now,
    userId: buyerUid,
    userEmail: buyerEmail,
    userName: buyerEmail.split('@')[0] || 'Cliente GoMining',
    packageId: params.packageId || `pkg-${params.minerId}`,
    packageName: params.name,
    contractedTh: params.powerTh,
    amountUsd: params.price,
    cryptoAsset: 'USDT',
    cryptoAmount: `${params.price} USDT`,
    paymentNetwork: params.network || 'TRON',
    recipientAddress: params.ownerWallet || 'PLATFORM_TREASURY',
    txHash: params.txHash || `tx_${params.minerId}`,
    confirmations: 12,
    requiredConfirmations: 12,
    status: 'SETTLED',
    bridgeStatus: 'NONE',
    activatedMinerId: params.minerId,
    idempotencyKey: `ord_${params.minerId}`,
    settledAt: now,
  }

  try {
    await Promise.all([
      setDoc(doc(db, 'admin_contracts', params.minerId), contractDoc, { merge: true }),
      setDoc(doc(db, 'admin_orders', orderId), orderDoc, { merge: true }),
    ])
  } catch (err) {
    console.warn('[GoMining] Notice syncing purchase to admin platform:', err)
  }

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

/** Fetch all miners for a given user from /miners/{uid}/miner */
export async function getUserMiners(uid: string): Promise<StoredMiner[]> {
  try {
    const colRef = collection(db, 'miners', uid, 'miner')
    const snap = await getDocs(colRef)
    return snap.docs.map((d) => d.data() as StoredMiner)
  } catch (error) {
    console.error('Error fetching user miners from Firestore:', error)
    return []
  }
}

/** Update visual traits or status of a miner in Firestore */
export async function updateMinerInFirestore(uid: string, minerId: string, updates: Partial<StoredMiner>) {
  try {
    const minerRef = doc(db, 'miners', uid, 'miner', minerId)
    await updateDoc(minerRef, updates as any)
  } catch (error) {
    console.error('Error updating miner in Firestore:', error)
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
