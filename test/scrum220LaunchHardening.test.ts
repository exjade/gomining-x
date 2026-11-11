import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buyDemoMiner,
  deferDemoMinerPurchase,
  payPendingDemoMiner,
  restoreDemoSession,
  getDemoSessionForPersistence,
  registerWalletMinerPurchase,
} from '../src/demoStore.ts'
import {
  completeWalletMinerPurchase,
  completeLocalMinerPurchase,
  payPendingMinerOrderAndRecordToAdmin,
  retryWalletMinerPurchase,
  resolvePendingRecoveryCheckout,
  type CompleteWalletMinerPurchaseOptions,
  type PurchaseAdminRecorder,
} from '../src/minerPurchaseFlow.ts'
import type { PostTxPendingState } from '../src/types/miner.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

interface RequestAuthToken {
  firebase?: {
    sign_in_provider?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface RequestAuth {
  uid: string
  token?: RequestAuthToken
  [key: string]: unknown
}

interface RuleRequestContext {
  auth: RequestAuth | null
  time?: number
  resource?: { data?: Record<string, unknown> }
}

interface ParsedRule {
  pattern: string
  methods: string[]
  condition: string
}

class FirestoreRulesEvaluator {
  private rules: ParsedRule[] = []

  constructor(rulesFilePath: string) {
    const source = fs.readFileSync(rulesFilePath, 'utf8')
    this.parse(source)
  }

  private parse(source: string): void {
    const lines = source.split('\n')
    let depth = 0
    const matchStack: Array<{ pattern: string; depth: number }> = []

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || line.startsWith('//')) continue

      const matchMatch = line.match(/^match\s+(.+)\s*\{$/)
      if (matchMatch) {
        matchStack.push({ pattern: matchMatch[1].trim(), depth })
      }

      const allowMatch = line.match(/^allow\s+([^:]+):\s*if\s+(.+);?$/)
      if (allowMatch) {
        const methods = allowMatch[1].split(',').map((m) => m.trim())
        const condition = allowMatch[2].trim().replace(/;$/, '')
        const fullPattern = matchStack
          .map((m) => m.pattern)
          .filter((p) => !p.startsWith('/databases/'))
          .join('')
          .replace(/\/+/g, '/')
        this.rules.push({ pattern: fullPattern, methods, condition })
      }

      const openCount = (line.match(/\{/g) || []).length
      const closeCount = (line.match(/\}/g) || []).length
      depth += openCount - closeCount

      while (matchStack.length > 0 && matchStack[matchStack.length - 1].depth >= depth) {
        matchStack.pop()
      }
    }
  }

  public evaluate(
    method: 'read' | 'write' | 'create' | 'update' | 'delete',
    path: string,
    context: RuleRequestContext
  ): boolean {
    const pathParts = path.replace(/^\/+|\/+$/g, '').split('/')

    for (const rule of this.rules) {
      const methodMatches =
        rule.methods.includes(method) ||
        (method === 'read' && (rule.methods.includes('get') || rule.methods.includes('list'))) ||
        ((method === 'create' || method === 'update' || method === 'delete') && rule.methods.includes('write')) ||
        (rule.methods.includes('read') && (method === 'read' || method === 'get' || method === 'list')) ||
        (rule.methods.includes('write') && (method === 'write' || method === 'create' || method === 'update' || method === 'delete'))

      if (!methodMatches) continue

      const patternParts = rule.pattern.replace(/^\/+|\/+$/g, '').split('/')
      const match = this.matchParts(patternParts, pathParts)
      if (match.matches) {
        return this.evalCondition(rule.condition, context, match.vars)
      }
    }

    return false
  }

  private matchParts(patternParts: string[], pathParts: string[]): { matches: boolean; vars: Record<string, string> } {
    const vars: Record<string, string> = {}
    let pIdx = 0

    for (let i = 0; i < patternParts.length; i++) {
      const pat = patternParts[i]
      if (pat.endsWith('=**}')) {
        const varName = pat.slice(1, -4)
        vars[varName] = pathParts.slice(pIdx).join('/')
        return { matches: true, vars }
      }
      if (pIdx >= pathParts.length) return { matches: false, vars }

      if (pat.startsWith('{') && pat.endsWith('}')) {
        const varName = pat.slice(1, -1)
        vars[varName] = pathParts[pIdx++]
      } else if (pat === pathParts[pIdx]) {
        pIdx++
      } else {
        return { matches: false, vars }
      }
    }

    return { matches: pIdx === pathParts.length, vars }
  }

  private evalCondition(condition: string, context: RuleRequestContext, vars: Record<string, string>): boolean {
    const { auth } = context
    const isAuthenticated = () => auth !== null
    const isNonAnonymous = () => auth !== null && auth.token?.firebase?.sign_in_provider !== 'anonymous'
    const isOwner = (uid: string) => auth !== null && auth.uid === uid

    if (condition === 'true') return true
    if (condition === 'false') return false
    if (condition === 'isNonAnonymous()') return isNonAnonymous()
    if (condition === 'isAuthenticated()') return isAuthenticated()
    if (condition.startsWith('isOwner(')) {
      const match = condition.match(/isOwner\(([^)]+)\)/)
      if (match) return isOwner(vars[match[1]])
    }

    if (condition === 'isAuthenticated() && request.auth.uid == uid') {
      return isAuthenticated() && auth?.uid === vars['uid']
    }

    return false
  }
}

function resetStore(balance = 1000000) {
  restoreDemoSession({
    balance,
    maintenanceCredit: 0,
    miners: [],
    workers: [],
    workerActivationMode: 'automatic',
    pendingMinerOrders: [],
    subscription: null,
    receipts: [],
    presaleTokens: 0,
  })
}

describe('SCRUM-220 Pre-launch Hardening Suite (POUW-1.8*LAUNCH*HARDENING)', () => {
  beforeEach(() => {
    resetStore()
  })

  // =========================================================================
  // R5.1: Wallet Local Finalization Gate Before Admin & Simulation
  // =========================================================================
  describe('R5.1: Wallet local finalization failure gates Admin & Simulation', () => {
    it('when commitWalletMinerPurchase throws, Admin recorder and onSimulationStart are NEVER invoked', async () => {
      let adminCalls = 0
      let simulationStarts = 0
      let firestoreSaves = 0

      await assert.rejects(
        async () => {
          await completeWalletMinerPurchase(
            {
              productName: 'Minero 10 TH · 10 TH',
              amount: 100,
              packageId: 'minerx-01',
              txHash: '0xtx_finalize_fail',
              networkName: 'BNB Chain',
              user: { uid: 'u_auth_wallet', email: 'wallet@test.com' },
            },
            {
              saveMinerToFirestore: async () => {
                firestoreSaves++
              },
              commitWalletMinerPurchase: () => {
                throw new Error('Local wallet finalization failed: disk quota exceeded')
              },
              recordPurchaseToAdmin: async () => {
                adminCalls++
              },
              onSimulationStart: () => {
                simulationStarts++
              },
            }
          )
        },
        /Local wallet finalization failed: disk quota exceeded/
      )

      assert.equal(firestoreSaves, 1, 'Firestore save must succeed before local commit attempt')
      assert.equal(adminCalls, 0, 'Admin recorder must NEVER be called when wallet finalization throws')
      assert.equal(simulationStarts, 0, 'onSimulationStart must NEVER be called when wallet finalization throws')
      assert.equal(getDemoSessionForPersistence().miners.length, 0, 'Store must have 0 miners')
    })

    it('when commitWalletMinerPurchase returns falsy/null, completeWalletMinerPurchase fails closed', async () => {
      let adminCalls = 0
      let simulationStarts = 0
      let firestoreSaves = 0

      await assert.rejects(
        async () => {
          await completeWalletMinerPurchase(
            {
              productName: 'Minero 10 TH · 10 TH',
              amount: 100,
              packageId: 'minerx-01',
              txHash: '0xtx_finalize_null',
              networkName: 'BNB Chain',
              user: { uid: 'u_auth_wallet', email: 'wallet@test.com' },
            },
            {
              saveMinerToFirestore: async () => {
                firestoreSaves++
              },
              commitWalletMinerPurchase: (() => null) as any,
              recordPurchaseToAdmin: async () => {
                adminCalls++
              },
              onSimulationStart: () => {
                simulationStarts++
              },
            }
          )
        },
        /Local wallet finalization failed/
      )

      assert.equal(firestoreSaves, 1, 'Firestore save must succeed before local commit check')
      assert.equal(adminCalls, 0, 'Admin recorder must NEVER be called when wallet finalization returns falsy')
      assert.equal(simulationStarts, 0, 'onSimulationStart must NEVER be called when wallet finalization returns falsy')
      assert.equal(getDemoSessionForPersistence().miners.length, 0, 'Store must have 0 miners')
    })

    it('registerWalletMinerPurchase fails closed if unauthenticated, anonymous, or missing uid', () => {
      const sampleInput = { name: 'M1', powerTh: 10, efficiency: 15, price: 100, purchaseMode: 'once' as const }
      assert.throws(() => {
        registerWalletMinerPurchase(sampleInput, '0x123', 'BNB Chain')
      }, /requires an authenticated, non-anonymous user account/)

      assert.throws(() => {
        registerWalletMinerPurchase(sampleInput, '0x123', 'BNB Chain', undefined, { uid: 'anon', isAnonymous: true })
      }, /requires an authenticated, non-anonymous user account/)

      assert.throws(() => {
        registerWalletMinerPurchase(sampleInput, '0x123', 'BNB Chain', undefined, { uid: '   ', isAnonymous: false })
      }, /requires an authenticated, non-anonymous user account/)

      assert.throws(() => {
        registerWalletMinerPurchase(sampleInput, '0x123', 'BNB Chain', undefined, null)
      }, /requires an authenticated, non-anonymous user account/)

      // Succeeds with registered user
      const miner = registerWalletMinerPurchase(sampleInput, '0x123', 'BNB Chain', undefined, { uid: 'usr_valid_01', isAnonymous: false })
      assert.ok(miner.id)
      assert.equal(miner.name, 'M1')
      assert.equal(getDemoSessionForPersistence().miners.length, 1)
    })
  })

  // =========================================================================
  // R5.2: Guest Blocked From Canonical Flows
  // =========================================================================
  describe('R5.2: Unauthenticated guests blocked with zero-write guarantees', () => {
    it('completeWalletMinerPurchase fails closed for null user with zero writes, zero referral credits and zero Admin calls', async () => {
      let firestoreWrites = 0
      let adminCalls = 0
      let referralCredits = 0

      await assert.rejects(
        async () => {
          await completeWalletMinerPurchase(
            {
              productName: 'Minero 10 TH · 10 TH',
              amount: 100,
              packageId: 'minerx-01',
              txHash: '0xtx_guest_wallet',
              networkName: 'BNB Chain',
              user: null,
            },
            {
              saveMinerToFirestore: async () => { firestoreWrites++ },
              recordPurchaseToAdmin: async () => { adminCalls++ },
              creditReferral: async () => { referralCredits++ },
            }
          )
        },
        /Canonical wallet miner purchase requires an authenticated, non-anonymous user account/
      )

      assert.equal(firestoreWrites, 0, '0 Firestore writes')
      assert.equal(adminCalls, 0, '0 Admin calls')
      assert.equal(referralCredits, 0, '0 Referral credits')
      assert.equal(getDemoSessionForPersistence().miners.length, 0, '0 local miners created')
    })

    it('completeLocalMinerPurchase fails closed for null user with zero writes and zero Admin calls', async () => {
      let firestoreWrites = 0
      let adminCalls = 0

      const result = await completeLocalMinerPurchase(
        {
          name: 'Local Guest Miner',
          powerTh: 10,
          efficiency: 15,
          price: 50,
          purchaseMode: 'once',
          packageId: 'minerx-01',
        },
        {
          user: null,
          saveMinerToFirestore: async () => { firestoreWrites++ },
          recordPurchaseToAdmin: async () => { adminCalls++ },
        }
      )

      assert.equal(result.ok, false)
      assert.match(result.message || '', /authenticated, non-anonymous user account/)
      assert.equal(firestoreWrites, 0, '0 Firestore writes')
      assert.equal(adminCalls, 0, '0 Admin calls')
      assert.equal(getDemoSessionForPersistence().miners.length, 0, '0 local miners created')
    })

    it('payPendingMinerOrderAndRecordToAdmin fails closed for null user with zero writes and zero Admin calls', async () => {
      deferDemoMinerPurchase({
        name: 'Pending Guest Miner',
        powerTh: 10,
        efficiency: 15,
        price: 50,
        purchaseMode: 'once',
        packageId: 'minerx-01',
      })
      const order = getDemoSessionForPersistence().pendingMinerOrders[0]
      assert.ok(order)

      let firestoreWrites = 0
      let adminCalls = 0

      const result = await payPendingMinerOrderAndRecordToAdmin(order, {
        user: null,
        saveMinerToFirestore: async () => { firestoreWrites++ },
        recordPurchaseToAdmin: async () => { adminCalls++ },
      })

      assert.equal(result.ok, false)
      assert.match(result.message || '', /authenticated, non-anonymous user account/)
      assert.equal(firestoreWrites, 0, '0 Firestore writes')
      assert.equal(adminCalls, 0, '0 Admin calls')
      assert.equal(getDemoSessionForPersistence().miners.length, 0, '0 local miners created')
    })
  })

  // =========================================================================
  // R5.3: Anonymous Users Blocked From Canonical Flows
  // =========================================================================
  describe('R5.3: Firebase anonymous users blocked with zero-write guarantees', () => {
    const anonymousUser = {
      uid: 'anon_firebase_uid_123',
      isAnonymous: true,
      email: null,
    }

    it('completeWalletMinerPurchase fails closed for anonymous session with zero writes, zero referral credits and zero Admin calls', async () => {
      let firestoreWrites = 0
      let adminCalls = 0
      let referralCredits = 0

      await assert.rejects(
        async () => {
          await completeWalletMinerPurchase(
            {
              productName: 'Minero 10 TH · 10 TH',
              amount: 100,
              packageId: 'minerx-01',
              txHash: '0xtx_anon_wallet',
              networkName: 'BNB Chain',
              user: anonymousUser,
            },
            {
              saveMinerToFirestore: async () => { firestoreWrites++ },
              recordPurchaseToAdmin: async () => { adminCalls++ },
              creditReferral: async () => { referralCredits++ },
            }
          )
        },
        /Canonical wallet miner purchase requires an authenticated, non-anonymous user account/
      )

      assert.equal(firestoreWrites, 0, '0 Firestore writes')
      assert.equal(adminCalls, 0, '0 Admin calls')
      assert.equal(referralCredits, 0, '0 Referral credits')
      assert.equal(getDemoSessionForPersistence().miners.length, 0, '0 local miners created')
    })

    it('completeLocalMinerPurchase fails closed for anonymous session', async () => {
      let firestoreWrites = 0
      let adminCalls = 0

      const result = await completeLocalMinerPurchase(
        {
          name: 'Local Anon Miner',
          powerTh: 10,
          efficiency: 15,
          price: 50,
          purchaseMode: 'once',
          packageId: 'minerx-01',
        },
        {
          user: anonymousUser,
          saveMinerToFirestore: async () => { firestoreWrites++ },
          recordPurchaseToAdmin: async () => { adminCalls++ },
        }
      )

      assert.equal(result.ok, false)
      assert.match(result.message || '', /authenticated, non-anonymous user account/)
      assert.equal(firestoreWrites, 0, '0 Firestore writes')
      assert.equal(adminCalls, 0, '0 Admin calls')
    })

    it('payPendingMinerOrderAndRecordToAdmin fails closed for anonymous session', async () => {
      deferDemoMinerPurchase({
        name: 'Pending Anon Miner',
        powerTh: 10,
        efficiency: 15,
        price: 50,
        purchaseMode: 'once',
        packageId: 'minerx-01',
      })
      const order = getDemoSessionForPersistence().pendingMinerOrders[0]

      let firestoreWrites = 0
      let adminCalls = 0

      const result = await payPendingMinerOrderAndRecordToAdmin(order, {
        user: anonymousUser,
        saveMinerToFirestore: async () => { firestoreWrites++ },
        recordPurchaseToAdmin: async () => { adminCalls++ },
      })

      assert.equal(result.ok, false)
      assert.match(result.message || '', /authenticated, non-anonymous user account/)
      assert.equal(firestoreWrites, 0, '0 Firestore writes')
      assert.equal(adminCalls, 0, '0 Admin calls')
    })
  })

  // =========================================================================
  // R5.4: Entry-Point Auth Gating & Demo Flow Isolation
  // =========================================================================
  describe('R5.4: Entry-point auth gating in App.tsx & Checkout + Demo preservation', () => {
    it('App.tsx statically enforces registered user for payment entry points and onDefer', () => {
      const appSource = fs.readFileSync(path.resolve(projectRoot, 'src/App.tsx'), 'utf8')

      // 1. onPayWithWallet gates on registered user and pre-allocates minerId
      assert.match(appSource, /onPayWithWallet=\{[\s\S]*?if \(!user \|\| user\.isAnonymous\) \{[\s\S]*?openAuthModal\('register'\)/)
      assert.match(appSource, /onPayWithWallet=\{[\s\S]*?prepareWalletMinerPurchase\([\s\S]*?minerId:\s*prep\.id/)

      // 2. gmPay URL trigger waits for auth initialization and pre-allocates minerId
      assert.match(appSource, /if \(!mobileCheckout\) return[\s\r\n]*if \(loading\) return/)
      assert.match(appSource, /if \(!user \|\| user\.isAnonymous\) \{[\s\S]*?openAuthModal\('register'\)[\s\S]*?return[\s\S]*?\}[\s\S]*?prepareWalletMinerPurchase\([\s\S]*?minerId:\s*prep\.id/)

      // 3. onDefer gates on registered user
      assert.match(appSource, /onDefer=\{async \(input\) => \{[\s\S]*?if \(!user \|\| user\.isAnonymous\) \{[\s\S]*?openAuthModal\('register'\)/)

      // 4. Recharge top-up onPayWithWallet gates on registered user
      assert.match(
        appSource,
        /topUpOpen[\s\S]*?onPayWithWallet=\{\(amount, networkId, walletId\) => \{[\s\r\n]*if \(!user \|\| user\.isAnonymous\) \{[\s\r\n]*setTopUpOpen\(false\)[\s\r\n]*openAuthModal\('register'\)[\s\r\n]*return/
      )
    })

    it('SubscriptionsPage.tsx statically enforces registered user before activating with balance or paying with wallet', () => {
      const subSource = fs.readFileSync(path.resolve(projectRoot, 'src/SubscriptionsPage.tsx'), 'utf8')
      assert.match(
        subSource,
        /const handlePayWithWallet = \(\) => \{[\s\r\n]*if \(!user \|\| user\.isAnonymous\) \{[\s\r\n]*openAuthModal\('register'\)[\s\r\n]*return/
      )
      assert.match(
        subSource,
        /const handleActivateWithBalance = \(\) => \{[\s\r\n]*if \(!user \|\| user\.isAnonymous\) \{[\s\r\n]*openAuthModal\('register'\)[\s\r\n]*return/
      )
    })

    it('WalletPaymentCheckout.tsx statically renders auth modal prompt when unauthenticated or anonymous and validates minerId before payment', () => {
      const checkoutSource = fs.readFileSync(path.resolve(projectRoot, 'src/WalletPaymentCheckout.tsx'), 'utf8')

      // Renders auth gate prompt block instead of payment controls
      assert.match(checkoutSource, /\{\(!user \|\| user\.isAnonymous\) \? \(/)
      assert.match(checkoutSource, /Inicia sesión para continuar/)
      assert.match(checkoutSource, /openAuthModal\('register'\)/)
      assert.match(checkoutSource, /openAuthModal\('login'\)/)

      // handlePay fails closed if user is null or anonymous
      assert.match(checkoutSource, /const handlePay = async \(\) => \{[\s\S]*?if \(!user \|\| user\.isAnonymous\) \{/)

      // handlePay validates targetMinerId before transmitting transaction
      assert.match(
        checkoutSource,
        /const targetMinerId = minerIdRef\.current \|\| propMinerId[\s\S]*?if \(!targetMinerId \|\| !targetMinerId\.trim\(\)\) \{[\s\S]*?setError\('No se pudo determinar el identificador canónico del minero\.'\)[\s\S]*?return[\s\S]*?setPaying\(true\)/
      )

      // handleRetryPersistence fails closed if user is null or anonymous
      assert.match(checkoutSource, /const handleRetryPersistence = async \(\) => \{[\s\S]*?if \(!user \|\| user\.isAnonymous\) \{/)
    })

    it('offline demo flow remains fully operational for guests with zero canonical writes', () => {
      // Offline demo purchase
      const demoRes = buyDemoMiner({
        name: 'Offline Simulation Miner',
        powerTh: 10,
        efficiency: 15,
        price: 0,
      })
      assert.equal(demoRes.ok, true, 'Demo miner purchase must succeed for guest')
      assert.ok(demoRes.miner)
      assert.ok(demoRes.miner.id.startsWith('MINER-'))

      // Offline demo pending defer & pay
      const deferRes = deferDemoMinerPurchase({
        name: 'Offline Demo Pending Miner',
        powerTh: 5,
        efficiency: 15,
        price: 0,
        purchaseMode: 'once',
      })
      assert.equal(deferRes.ok, true)
      const pendingOrder = getDemoSessionForPersistence().pendingMinerOrders[0]

      const payRes = payPendingDemoMiner(pendingOrder.id)
      assert.equal(payRes.ok, true, 'Demo pending miner payment must succeed for guest')
      assert.ok(payRes.miner)
    })
  })

  // =========================================================================
  // R5.5: Fallback Removal: Grep-Clean and Runtime Fail-Closed
  // =========================================================================
  describe('R5.5: Checkout fallback removal (grep-clean & runtime fail-closed)', () => {
    it('WalletPaymentCheckout.tsx is 100% grep-clean of MINER-Date.now and packageId unknown fallbacks', () => {
      const checkoutSource = fs.readFileSync(path.resolve(projectRoot, 'src/WalletPaymentCheckout.tsx'), 'utf8')

      assert.doesNotMatch(checkoutSource, /MINER-Date\.now/, 'Must NOT contain MINER-Date.now')
      assert.doesNotMatch(checkoutSource, /MINER-\$\{Date\.now\(\)\}/, 'Must NOT contain MINER-${Date.now()}')
      assert.doesNotMatch(checkoutSource, /packageId:\s*['"]unknown['"]/, 'Must NOT contain packageId: "unknown"')
      assert.doesNotMatch(checkoutSource, /packageSnapshot:\s*\{[\s\S]*?packageId:\s*['"]unknown['"]/, 'Must NOT contain packageSnapshot packageId "unknown"')
    })

    it('runtime check: missing packageId fails closed and rejects retry persistence', async () => {
      await assert.rejects(
        async () => {
          await completeWalletMinerPurchase({
            productName: 'No Pkg Miner',
            amount: 100,
            packageId: undefined as any,
            txHash: '0xhash_no_pkg',
            networkName: 'BNB Chain',
            user: { uid: 'u_auth', email: 'auth@test.com' },
          })
        },
        /Canonical wallet miner purchase requires a valid packageId/
      )
    })
  })

  // =========================================================================
  // R5.6: Recovery Remount & Origin Enforcement
  // =========================================================================
  describe('R5.6: Unconditional recovery remount origin enforcement', () => {
    const canonicalRecovery: PostTxPendingState = {
      schemaVersion: 1,
      status: 'PERSISTENCE_PENDING',
      txHash: '0xcanonical_recovery_tx',
      minerId: 'MINER-RECOVERY-001',
      packageId: 'minerx-01',
      productName: 'Recovery Miner · 48 TH',
      amount: 561.99,
      powerTh: 48,
      price: 561.99,
      currency: 'USD',
      cadence: 'once',
      purchaseMode: 'once',
      networkId: 'bnb',
      networkName: 'BNB Chain',
      originUid: 'owner_uid_123',
      createdAt: Date.now(),
      packageSnapshot: {
        packageId: 'minerx-01',
        name: 'Recovery Miner · 48 TH',
        powerTh: 48,
        price: 561.99,
        currency: 'USD',
        cadence: 'once',
        purchaseMode: 'once',
      },
    }

    it('resolvePendingRecoveryCheckout returns null for guest (null user)', () => {
      const res = resolvePendingRecoveryCheckout(canonicalRecovery, null, false)
      assert.equal(res, null, 'Guest must NOT recover canonical pending state')
    })

    it('resolvePendingRecoveryCheckout returns null for anonymous user', () => {
      const res = resolvePendingRecoveryCheckout(canonicalRecovery, { uid: 'owner_uid_123', isAnonymous: true } as any, false)
      assert.equal(res, null, 'Anonymous user must NOT recover canonical pending state')
    })

    it('resolvePendingRecoveryCheckout returns null for mismatched user', () => {
      const res = resolvePendingRecoveryCheckout(canonicalRecovery, { uid: 'different_uid' } as any, false)
      assert.equal(res, null, 'Mismatched user must NOT recover canonical pending state')
    })

    it('resolvePendingRecoveryCheckout succeeds for matching authenticated user', () => {
      const res = resolvePendingRecoveryCheckout(canonicalRecovery, { uid: 'owner_uid_123', isAnonymous: false } as any, false)
      assert.ok(res, 'Matching user must recover state')
      assert.equal(res.packageId, 'minerx-01')
      assert.equal(res.productName, 'Recovery Miner · 48 TH')
      assert.equal(res.amount, 561.99)
    })

    it('retryWalletMinerPurchase rejects guest and mismatched users fail-closed', async () => {
      // Guest
      await assert.rejects(
        () => retryWalletMinerPurchase(canonicalRecovery, {}),
        /Esta recuperación pertenece a otra cuenta/
      )

      // Anonymous
      await assert.rejects(
        () => retryWalletMinerPurchase(canonicalRecovery, { user: { uid: 'owner_uid_123', isAnonymous: true } as any }),
        /Esta recuperación pertenece a otra cuenta/
      )

      // Mismatched
      await assert.rejects(
        () => retryWalletMinerPurchase(canonicalRecovery, { user: { uid: 'wrong_uid' } as any }),
        /Esta recuperación pertenece a otra cuenta/
      )

      // Matching user succeeds
      const res = await retryWalletMinerPurchase(canonicalRecovery, {
        user: { uid: 'owner_uid_123', isAnonymous: false } as any,
        saveMinerToFirestore: async () => {},
      })
      assert.ok(res)
      assert.equal(res.createdMinerId, 'MINER-RECOVERY-001')
    })
  })

  // =========================================================================
  // R5.7: Firestore Rules Hardening Contract & Behavioral Verification
  // =========================================================================
  describe('R5.7: Firestore Rules hardening contract and behavioral verification', () => {
    it('firestore.rules defines isNonAnonymous predicate and protects scoped collections and unilevel tree', () => {
      const rulesSource = fs.readFileSync(path.resolve(projectRoot, 'firestore.rules'), 'utf8')

      // 1. isNonAnonymous predicate exists
      assert.match(
        rulesSource,
        /function isNonAnonymous\(\)\s*\{[\s\S]*?request\.auth\s*!=\s*null[\s\S]*?request\.auth\.token\.firebase\.sign_in_provider\s*!=\s*'anonymous'/,
        'Must define isNonAnonymous predicate rejecting unauthenticated and anonymous users'
      )

      // 2. Scoped admin collections and unilevel tree use isNonAnonymous
      const scopedCollections = [
        'admin_users',
        'admin_workers',
        'admin_contracts',
        'admin_audit_logs',
        'admin_settings',
        'commercial_packages',
        'admin_orders',
      ]

      for (const col of scopedCollections) {
        const regex = new RegExp(`match /${col}/\\{[^}]+\\}\\s*\\{[^}]*?allow read, write:\\s*if isNonAnonymous\\(\\);`)
        assert.match(rulesSource, regex, `Collection /${col} must be protected with isNonAnonymous()`)
      }

      // Unilevel node and catch-all subcollections must require isNonAnonymous()
      assert.match(
        rulesSource,
        /match \/unilevel\/\{uid\}\s*\{[\s\S]*?allow read:\s*if isNonAnonymous\(\);[\s\S]*?allow create, update:\s*if isNonAnonymous\(\);[\s\S]*?match \/\{subcol=\*\*\}\s*\{\s*allow read, write:\s*if isNonAnonymous\(\);/,
        'Unilevel node and recursive subcollections must require isNonAnonymous()'
      )

      // 3. Negative check: public allow read, write: if true; must NOT be present on scoped collections
      for (const col of scopedCollections) {
        const publicRegex = new RegExp(`match /${col}/\\{[^}]+\\}\\s*\\{[^}]*?allow read, write:\\s*if true;`)
        assert.doesNotMatch(rulesSource, publicRegex, `Collection /${col} must NOT have public allow read, write: if true;`)
      }

      // 4. Preserves /miners/{uid}/miner/{minerId} rule
      assert.match(
        rulesSource,
        /match \/miners\/\{uid\}\/miner\/\{minerId\}\s*\{[\s\S]*?allow read, write:\s*if isOwner\(uid\);/,
        'Must preserve owner rule for /miners/{uid}/miner/{minerId}'
      )
    })

    // Behavioral evaluator testing all 10 surfaces
    const rulesPath = path.resolve(projectRoot, 'firestore.rules')
    const evaluator = new FirestoreRulesEvaluator(rulesPath)

    const unauthenticatedCtx = { auth: null }
    const anonymousCtx = {
      auth: {
        uid: 'anon_test_user_1',
        token: { firebase: { sign_in_provider: 'anonymous' } },
      },
    }
    const registeredCtx = {
      auth: {
        uid: 'reg_test_user_1',
        token: { firebase: { sign_in_provider: 'password' } },
      },
    }

    const scopedSurfaces = [
      { name: 'admin_users root', path: '/admin_users/usr_01' },
      { name: 'admin_users subcollection', path: '/admin_users/usr_01/roles/super_admin' },
      { name: 'admin_workers', path: '/admin_workers/worker_01' },
      { name: 'admin_contracts', path: '/admin_contracts/contract_01' },
      { name: 'admin_audit_logs', path: '/admin_audit_logs/log_01' },
      { name: 'admin_settings', path: '/admin_settings/setting_01' },
      { name: 'commercial_packages', path: '/commercial_packages/pkg_01' },
      { name: 'admin_orders', path: '/admin_orders/order_01' },
      { name: 'unilevel node', path: '/unilevel/usr_01' },
      { name: 'unilevel recursive catch-all subcollection', path: '/unilevel/usr_01/downline/node_01' },
    ]

    for (const surface of scopedSurfaces) {
      it(`Behavioral rule evaluation for ${surface.name} (${surface.path}): unauthenticated -> DENY, anonymous -> DENY, registered -> ALLOW`, () => {
        // Read assertions
        assert.equal(evaluator.evaluate('read', surface.path, unauthenticatedCtx), false, `Unauthenticated read on ${surface.path} must be DENIED`)
        assert.equal(evaluator.evaluate('read', surface.path, anonymousCtx), false, `Anonymous read on ${surface.path} must be DENIED`)
        assert.equal(evaluator.evaluate('read', surface.path, registeredCtx), true, `Registered read on ${surface.path} must be ALLOWED`)

        // Write assertions
        assert.equal(evaluator.evaluate('write', surface.path, unauthenticatedCtx), false, `Unauthenticated write on ${surface.path} must be DENIED`)
        assert.equal(evaluator.evaluate('write', surface.path, anonymousCtx), false, `Anonymous write on ${surface.path} must be DENIED`)
        assert.equal(evaluator.evaluate('write', surface.path, registeredCtx), true, `Registered write on ${surface.path} must be ALLOWED`)
      })
    }

    it('demonstrates negative sensitivity: isAuthenticated() allows anonymous auth whereas isNonAnonymous() blocks it', () => {
      const isAnonAllowedLegacy = anonymousCtx.auth !== null
      const isAnonAllowedHardened = anonymousCtx.auth !== null && anonymousCtx.auth.token?.firebase?.sign_in_provider !== 'anonymous'

      assert.equal(isAnonAllowedLegacy, true, 'Legacy isAuthenticated() incorrectly permits anonymous users')
      assert.equal(isAnonAllowedHardened, false, 'Hardened isNonAnonymous() strictly denies anonymous users')
    })
  })
})
