import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import {
  broadcastCrossTabSessionLogout,
  clearStoredWalletOwnerUid,
  disconnectWeb3SessionBestEffort,
  readStoredWalletOwnerUid,
} from './services/session/accountSessionIsolation'
import {
  auth,
  db,
  loginWithEmail,
  registerWithEmail,
  logoutUser,
  sendVerificationEmail,
  sendResetPassword,
  reloadCurrentUser,
  updateUserProfile,
  getUserProfile,
  resolveAuthenticatedUserProfile,
  cleanupUserMinersSubscription,
  type UserProfile,
} from './firebase'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  profileError: string | null
  loading: boolean
  isEmailVerified: boolean
  authModalOpen: boolean
  authMode: 'login' | 'register' | 'verify-email'
  verifyEmailLocked: boolean
  setVerifyEmailLocked: (locked: boolean) => void
  referralCodeFromUrl: string
  openAuthModal: (mode?: 'login' | 'register' | 'verify-email') => void
  closeAuthModal: () => void
  login: (email: string, pass: string) => Promise<void>
  register: (email: string, pass: string, refCode?: string) => Promise<void>
  logout: () => Promise<void>
  resendVerification: () => Promise<void>
  checkVerification: () => Promise<boolean>
  resetPassword: (email: string) => Promise<void>
  linkWallet: (address: string) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [emailVerifiedConfirmed, setEmailVerifiedConfirmed] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'verify-email'>('register')
  const [verifyEmailLocked, setVerifyEmailLocked] = useState(false)
  const [referralCodeFromUrl, setReferralCodeFromUrl] = useState('')

  // Capture ?ref= query parameter from URL on load and store in localStorage
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const ref = urlParams.get('ref')
      if (ref && ref.trim()) {
        const cleanRef = ref.trim().toUpperCase()
        localStorage.setItem('gomining_ref', cleanRef)
        setReferralCodeFromUrl(cleanRef)
      } else {
        const savedRef = localStorage.getItem('gomining_ref')
        if (savedRef) {
          setReferralCodeFromUrl(savedRef)
        }
      }
    } catch {
      // ignore
    }
  }, [])

  // Helper to distinguish registered account from guest/anonymous session
  const isRegisteredUser = (u: User | null): u is User => Boolean(u && !u.isAnonymous && u.email)
  const prevUidRef = useRef<string | null>(null)
  const authActionEpochRef = useRef(0)
  const profileLoadSeqRef = useRef(0)
  const logoutInFlightRef = useRef<Promise<void> | null>(null)

  // Listen for Firebase Auth state changes
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      const seq = ++profileLoadSeqRef.current
      const nextUid = isRegisteredUser(currentUser) ? currentUser.uid : null
      const prevUid = prevUidRef.current
      prevUidRef.current = nextUid
      if (prevUid && prevUid !== nextUid) {
        const storedOwner = readStoredWalletOwnerUid()
        if (!storedOwner || storedOwner !== nextUid) {
          void disconnectWeb3SessionBestEffort({
            clearOwnerStorage: !storedOwner || storedOwner === prevUid,
          })
        }
      }
      if (isRegisteredUser(currentUser)) {
        setUser(currentUser)
        setEmailVerifiedConfirmed(Boolean(currentUser.emailVerified))
        // If logged in, fetch persisted profile (propagate failure — never use an in-memory fallback)
        try {
          const p = await resolveAuthenticatedUserProfile(currentUser)
          if (profileLoadSeqRef.current !== seq) return
          setProfile(p)
          setProfileError(null)
        } catch (err) {
          if (profileLoadSeqRef.current !== seq) return
          const code = (err as { code?: string })?.code || 'firestore/profile-unavailable'
          console.error(`[AuthContext][onAuthStateChanged] Profile load failed [${code}]:`, err)
          setProfile(null)
          setProfileError(
            (err as Error)?.message || `No se pudo cargar tu perfil en Firestore (${code}).`,
          )
        }
      } else {
        cleanupUserMinersSubscription()
        setUser(null)
        setEmailVerifiedConfirmed(false)
        setProfile(null)
        setProfileError(null)
        setVerifyEmailLocked(false)
      }
      if (profileLoadSeqRef.current === seq) {
        setLoading(false)
      }
    })

    return () => unsubscribeAuth()
  }, [])

  // Listen for real-time Firestore profile changes when user is logged in
  useEffect(() => {
    if (!user) return
    const docRef = doc(db, 'users', user.uid)
    const unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile)
        setProfileError(null)
      }
    }, (err) => {
      console.warn('Profile snapshot error:', err)
    })

    return () => unsubscribeSnapshot()
  }, [user])

  // Automatically check verification status when window regains focus or visibility
  useEffect(() => {
    if (!user || user.emailVerified) return

    const handleFocus = async () => {
      try {
        const reloaded = await reloadCurrentUser()
        if (reloaded && reloaded.emailVerified) {
          setUser(reloaded)
          setEmailVerifiedConfirmed(true)
          const p = await getUserProfile(reloaded.uid)
          if (p) {
            setProfile(p)
            setProfileError(null)
          }
          setVerifyEmailLocked(false)
          if (authMode === 'verify-email') {
            setAuthModalOpen(false)
          }
        }
      } catch {
        // ignore
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void handleFocus()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [user, authMode])

  const openAuthModal = (mode: 'login' | 'register' | 'verify-email' = 'register') => {
    setAuthMode(mode)
    setAuthModalOpen(true)
  }

  const closeAuthModal = () => {
    if (verifyEmailLocked) return
    setAuthModalOpen(false)
  }

  const login = async (email: string, pass: string) => {
    const epoch = ++authActionEpochRef.current
    profileLoadSeqRef.current += 1
    const loggedUser = await loginWithEmail(email, pass)
    if (authActionEpochRef.current !== epoch) return
    let prof: UserProfile
    try {
      prof = await resolveAuthenticatedUserProfile(loggedUser)
    } catch (err) {
      const code = (err as { code?: string })?.code || 'firestore/profile-unavailable'
      console.error(`[AuthContext][login] Profile initialization failed [${code}]:`, err)
      const visibleMessage = `No se pudo cargar ni inicializar tu perfil de usuario (${code}). Intenta nuevamente.`
      setProfile(null)
      setProfileError(visibleMessage)
      await logoutUser().catch(() => {})
      setUser(null)
      throw Object.assign(new Error(visibleMessage), { code })
    }
    if (authActionEpochRef.current !== epoch) return
    setUser(loggedUser)
    setEmailVerifiedConfirmed(Boolean(loggedUser.emailVerified))
    setProfile(prof)
    setProfileError(null)
    if (!loggedUser.emailVerified) {
      setAuthMode('verify-email')
      setAuthModalOpen(true)
    } else {
      setVerifyEmailLocked(false)
      setAuthModalOpen(false)
    }
  }

  const register = async (email: string, pass: string, refCode?: string) => {
    const epoch = ++authActionEpochRef.current
    profileLoadSeqRef.current += 1
    const code = refCode || referralCodeFromUrl
    const res = await registerWithEmail(email, pass, code)
    if (authActionEpochRef.current !== epoch) return
    setUser(res.user)
    setEmailVerifiedConfirmed(Boolean(res.user.emailVerified))
    setProfile(res.profile)
    setProfileError(null)
    setAuthMode('verify-email')
    setAuthModalOpen(true)
  }

  const logout = async () => {
    if (logoutInFlightRef.current) {
      await logoutInFlightRef.current
      return
    }
    const epoch = ++authActionEpochRef.current
    profileLoadSeqRef.current += 1
    const prevUidBeforeLogout = prevUidRef.current
    const storedOwnerBeforeLogout = readStoredWalletOwnerUid()
    const shouldClearOwner =
      !storedOwnerBeforeLogout || !prevUidBeforeLogout || storedOwnerBeforeLogout === prevUidBeforeLogout
    const run = (async () => {
      try {
        broadcastCrossTabSessionLogout()
        await disconnectWeb3SessionBestEffort({ clearOwnerStorage: shouldClearOwner })
      } catch {
        if (shouldClearOwner) {
          clearStoredWalletOwnerUid()
        }
      } finally {
        if (authActionEpochRef.current === epoch) {
          prevUidRef.current = null
          try {
            await logoutUser()
          } catch {
            // Ensure local auth state still clears if signOut transiently fails.
          }
          if (authActionEpochRef.current === epoch) {
            setVerifyEmailLocked(false)
            setEmailVerifiedConfirmed(false)
            setProfileError(null)
            setUser(null)
            setProfile(null)
            setAuthModalOpen(false)
          }
        }
      }
    })()
    logoutInFlightRef.current = run
    try {
      await run
    } finally {
      if (logoutInFlightRef.current === run) {
        logoutInFlightRef.current = null
      }
    }
  }

  const resendVerification = async () => {
    if (user) {
      await sendVerificationEmail(user)
    }
  }

  const checkVerification = async (): Promise<boolean> => {
    const reloaded = await reloadCurrentUser()
    if (reloaded) {
      setUser(reloaded)
      if (reloaded.emailVerified) {
        setEmailVerifiedConfirmed(true)
        const prof = await getUserProfile(reloaded.uid)
        if (prof) {
          setProfile(prof)
          setProfileError(null)
        }
        setVerifyEmailLocked(false)
        setAuthModalOpen(false)
        return true
      }
    }
    return false
  }

  const resetPassword = async (email: string) => {
    await sendResetPassword(email)
  }

  const linkWallet = async (address: string) => {
    if (!user) return
    await updateUserProfile(user.uid, { walletAddress: address })
    setProfile((prev) => prev ? { ...prev, walletAddress: address } : null)
  }

  const refreshProfile = async () => {
    if (!user) return
    try {
      const p = await resolveAuthenticatedUserProfile(user)
      setProfile(p)
      setProfileError(null)
    } catch (err) {
      const code = (err as { code?: string })?.code || 'firestore/profile-unavailable'
      console.error(`[AuthContext][refreshProfile] Failed [${code}]:`, err)
      setProfile(null)
      setProfileError(
        (err as Error)?.message || `No se pudo cargar tu perfil en Firestore (${code}).`,
      )
    }
  }

  const isEmailVerified = Boolean(user && (user.emailVerified || emailVerifiedConfirmed))

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        profileError,
        loading,
        isEmailVerified,
        authModalOpen,
        authMode,
        verifyEmailLocked,
        setVerifyEmailLocked,
        referralCodeFromUrl,
        openAuthModal,
        closeAuthModal,
        login,
        register,
        logout,
        resendVerification,
        checkVerification,
        resetPassword,
        linkWallet,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
