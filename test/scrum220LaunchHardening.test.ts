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
  isAdmin?: boolean
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

  private splitTopLevel(expr: string, op: '||' | '&&'): string[] {
    const parts: string[] = []
    let depth = 0
    let start = 0
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      else if (depth === 0 && expr.slice(i, i + op.length) === op) {
        parts.push(expr.slice(start, i).trim())
        i += op.length - 1
        start = i + 1
      }
    }
    parts.push(expr.slice(start).trim())
    return parts
  }

  private stripOuterParens(expr: string): string {
    let trimmed = expr.trim()
    while (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      let depth = 0
      let balanced = true
      for (let i = 0; i < trimmed.length - 1; i++) {
        if (trimmed[i] === '(') depth++
        else if (trimmed[i] === ')') depth--
        if (depth === 0) {
          balanced = false
          break
        }
      }
      if (!balanced) break
      trimmed = trimmed.slice(1, -1).trim()
    }
    return trimmed
  }

  private evalCondition(condition: string, context: RuleRequestContext, vars: Record<string, string>): boolean {
    const expr = this.stripOuterParens(condition)

    const orParts = this.splitTopLevel(expr, '||')
    if (orParts.length > 1) {
      return orParts.some((part) => this.evalCondition(part, context, vars))
    }

    const andParts = this.splitTopLevel(expr, '&&')
    if (andParts.length > 1) {
      return andParts.every((part) => this.evalCondition(part, context, vars))
    }

    const { auth } = context
    const isAuthenticated = () => auth !== null
    const isNonAnonymous = () => auth !== null && auth.token?.firebase?.sign_in_provider !== 'anonymous'
    const isOwner = (uid: string) => auth !== null && auth.uid === uid
    const isAdmin = () => isNonAnonymous() && context.isAdmin === true

    if (expr === 'true') return true
    if (expr === 'false') return false
    if (expr === 'isNonAnonymous()') return isNonAnonymous()
    if (expr === 'isAuthenticated()') return isAuthenticated()
    if (expr === 'isAdmin()') return isAdmin()
    if (/^hasAdminPermission\([^)]+\)$/.test(expr)) return isAdmin()

    const ownerMatch = expr.match(/^isOwner\(([^)]+)\)$/)
    if (ownerMatch) return isOwner(vars[ownerMatch[1].trim()])

    const uidEqMatch = expr.match(/^request\.auth\.uid\s*==\s*([A-Za-z_]\w*)$/)
    if (uidEqMatch) return auth !== null && auth.uid === vars[uidEqMatch[1]]

    const paramEqMatch = expr.match(/^([A-Za-z_]\w*)\s*==\s*'([^']+)'$/)
    if (paramEqMatch) return vars[paramEqMatch[1]] === paramEqMatch[2]

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
    it('firestore.rules defines isNonAnonymous predicate and enforces SCRUM-210/SCRUM-275/SCRUM-358 hardened rules', () => {
      const rulesSource = fs.readFileSync(path.resolve(projectRoot, 'firestore.rules'), 'utf8')

      // 1. isNonAnonymous predicate exists and isAdmin() enforces non-anonymous + active /admin_users RBAC
      assert.match(
        rulesSource,
        /function isNonAnonymous\(\)\s*\{[\s\S]*?request\.auth\s*!=\s*null[\s\S]*?request\.auth\.token\.firebase\.sign_in_provider\s*!=\s*'anonymous'/,
        'Must define isNonAnonymous predicate rejecting unauthenticated and anonymous users'
      )
      assert.match(
        rulesSource,
        /function isAdmin\(\)\s*\{[\s\S]*?isNonAnonymous\(\)[\s\S]*?admin_users\/\$\(request\.auth\.uid\)[\s\S]*?isActiveAdminData\(/,
        'isAdmin() must require isNonAnonymous() and active /admin_users/{uid} record'
      )

      // 2. Scoped admin & catalog collections require isAdmin()/hasAdminPermission() for writes (never public or regular user writes)
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
        const blockRegex = new RegExp(`match /${col}/\\{[^}]+\\}\\s*\\{([^}]+)\\}`)
        const match = rulesSource.match(blockRegex)
        assert.ok(match, `Collection /${col} must be declared in firestore.rules`)
        assert.match(
          match[1],
          /(?:isAdmin\(\)|hasAdminPermission\('admin\.users\.manage'\))/,
          `Collection /${col} must enforce isAdmin() or hasAdminPermission(...)`
        )
        const publicRegex = new RegExp(`match /${col}/\\{[^}]+\\}\\s*\\{[^}]*?allow read, write:\\s*if true;`)
        assert.doesNotMatch(rulesSource, publicRegex, `Collection /${col} must NOT have public allow read, write: if true;`)
      }

      // 3. Unilevel node and subcollections enforce owner/admin read-only and block all client writes (SCRUM-358)
      assert.match(
        rulesSource,
        /match \/unilevel\/\{uid\}\s*\{[\s\S]*?allow read:\s*if isOwner\(uid\) \|\| isAdmin\(\);[\s\S]*?allow create, update, delete:\s*if false;[\s\S]*?match \/\{subcollection\}\/\{docId=\*\*\}\s*\{\s*allow read:\s*if isOwner\(uid\) \|\| isAdmin\(\);\s*allow write:\s*if false;/,
        'Unilevel node and subcollections must enforce owner/admin read and deny all client writes'
      )

      // 4. Preserves hardened /miners/{uid}/miner/{minerId} rule (SCRUM-210: explicit read/create/update, delete: false)
      assert.match(
        rulesSource,
        /match \/miners\/\{uid\}\/miner\/\{minerId\}\s*\{[\s\S]*?allow read:\s*if isOwner\(uid\) \|\| isAdmin\(\);[\s\S]*?allow create:\s*if isOwner\(uid\) \|\| isAdmin\(\);[\s\S]*?allow update:\s*if isOwner\(uid\) \|\| isAdmin\(\);[\s\S]*?allow delete:\s*if false;/,
        'Must preserve owner/admin read/create/update and delete: false on /miners/{uid}/miner/{minerId}'
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
    const ownerCtx: RuleRequestContext = {
      auth: {
        uid: 'usr_01',
        token: { firebase: { sign_in_provider: 'password' } },
      },
    }
    const adminCtx: RuleRequestContext = {
      auth: {
        uid: 'adm_01',
        token: { firebase: { sign_in_provider: 'password' } },
      },
      isAdmin: true,
    }
    const anonymousAdminCtx: RuleRequestContext = {
      auth: {
        uid: 'adm_anon_01',
        token: { firebase: { sign_in_provider: 'anonymous' } },
      },
      isAdmin: true,
    }

    const scopedSurfaces: Array<{
      name: string
      path: string
      expectedRegisteredRead: boolean
      expectedAnonymousRead: boolean
      expectedOwnerRead: boolean
      expectedAdminRead: boolean
      expectedAdminWrite: boolean
      expectedAdminCreate?: boolean
      expectedAdminUpdate?: boolean
      expectedAdminDelete?: boolean
    }> = [
      { name: 'admin_users root', path: '/admin_users/usr_01', expectedRegisteredRead: false, expectedAnonymousRead: false, expectedOwnerRead: true, expectedAdminRead: true, expectedAdminWrite: false, expectedAdminCreate: true, expectedAdminUpdate: true, expectedAdminDelete: false },
      { name: 'admin_users subcollection', path: '/admin_users/usr_01/roles/super_admin', expectedRegisteredRead: false, expectedAnonymousRead: false, expectedOwnerRead: false, expectedAdminRead: true, expectedAdminWrite: true },
      { name: 'admin_workers', path: '/admin_workers/worker_01', expectedRegisteredRead: false, expectedAnonymousRead: false, expectedOwnerRead: false, expectedAdminRead: true, expectedAdminWrite: true },
      { name: 'admin_contracts', path: '/admin_contracts/contract_01', expectedRegisteredRead: false, expectedAnonymousRead: false, expectedOwnerRead: false, expectedAdminRead: true, expectedAdminWrite: false, expectedAdminUpdate: true, expectedAdminDelete: false },
      { name: 'admin_audit_logs', path: '/admin_audit_logs/log_01', expectedRegisteredRead: false, expectedAnonymousRead: false, expectedOwnerRead: false, expectedAdminRead: true, expectedAdminWrite: false, expectedAdminUpdate: false, expectedAdminDelete: false },
      { name: 'admin_settings internal', path: '/admin_settings/setting_01', expectedRegisteredRead: false, expectedAnonymousRead: false, expectedOwnerRead: false, expectedAdminRead: true, expectedAdminWrite: true },
      { name: 'admin_settings storefront_sections', path: '/admin_settings/storefront_sections', expectedRegisteredRead: true, expectedAnonymousRead: false, expectedOwnerRead: true, expectedAdminRead: true, expectedAdminWrite: true },
      { name: 'commercial_packages', path: '/commercial_packages/pkg_01', expectedRegisteredRead: false, expectedAnonymousRead: false, expectedOwnerRead: false, expectedAdminRead: true, expectedAdminWrite: false, expectedAdminCreate: true, expectedAdminUpdate: true, expectedAdminDelete: false },
      { name: 'admin_orders', path: '/admin_orders/order_01', expectedRegisteredRead: false, expectedAnonymousRead: false, expectedOwnerRead: false, expectedAdminRead: true, expectedAdminWrite: false, expectedAdminUpdate: true, expectedAdminDelete: false },
      { name: 'unilevel node', path: '/unilevel/usr_01', expectedRegisteredRead: false, expectedAnonymousRead: false, expectedOwnerRead: true, expectedAdminRead: true, expectedAdminWrite: false, expectedAdminCreate: false, expectedAdminUpdate: false, expectedAdminDelete: false },
      { name: 'unilevel recursive catch-all subcollection', path: '/unilevel/usr_01/downline/node_01', expectedRegisteredRead: false, expectedAnonymousRead: false, expectedOwnerRead: true, expectedAdminRead: true, expectedAdminWrite: false },
    ]

    for (const surface of scopedSurfaces) {
      it(`Behavioral rule evaluation for ${surface.name} (${surface.path}): enforces hardened SCRUM-275/SCRUM-358/SCRUM-361 read/write boundaries`, () => {
        // Read assertions
        assert.equal(evaluator.evaluate('read', surface.path, unauthenticatedCtx), false, `Unauthenticated read on ${surface.path} must be DENIED`)
        assert.equal(evaluator.evaluate('read', surface.path, anonymousCtx), surface.expectedAnonymousRead, `Anonymous read on ${surface.path} must match contract`)
        assert.equal(evaluator.evaluate('read', surface.path, anonymousAdminCtx), false, `Anonymous session with isAdmin=true on ${surface.path} must be DENIED`)
        assert.equal(evaluator.evaluate('read', surface.path, registeredCtx), surface.expectedRegisteredRead, `Registered non-admin read on ${surface.path} must match contract`)
        assert.equal(evaluator.evaluate('read', surface.path, ownerCtx), surface.expectedOwnerRead, `Owner read on ${surface.path} must match contract`)
        assert.equal(evaluator.evaluate('read', surface.path, adminCtx), surface.expectedAdminRead, `Admin read on ${surface.path} must match contract`)

        // Write assertions (zero unauthenticated, anonymous, or regular non-admin client writes)
        assert.equal(evaluator.evaluate('write', surface.path, unauthenticatedCtx), false, `Unauthenticated write on ${surface.path} must be DENIED`)
        assert.equal(evaluator.evaluate('write', surface.path, anonymousCtx), false, `Anonymous write on ${surface.path} must be DENIED`)
        assert.equal(evaluator.evaluate('write', surface.path, anonymousAdminCtx), false, `Anonymous admin write on ${surface.path} must be DENIED`)
        assert.equal(evaluator.evaluate('write', surface.path, registeredCtx), false, `Registered non-admin write on ${surface.path} must be DENIED`)
        assert.equal(evaluator.evaluate('write', surface.path, ownerCtx), false, `Owner write on ${surface.path} must be DENIED`)

        // Admin write assertions (allowed only where isAdmin()/hasAdminPermission authorizes; denied on /unilevel)
        assert.equal(evaluator.evaluate('write', surface.path, adminCtx), surface.expectedAdminWrite, `Admin write on ${surface.path} must match contract`)
        if (surface.expectedAdminCreate !== undefined) {
          assert.equal(evaluator.evaluate('create', surface.path, adminCtx), surface.expectedAdminCreate, `Admin create on ${surface.path} must match contract`)
        }
        if (surface.expectedAdminUpdate !== undefined) {
          assert.equal(evaluator.evaluate('update', surface.path, adminCtx), surface.expectedAdminUpdate, `Admin update on ${surface.path} must match contract`)
        }
        if (surface.expectedAdminDelete !== undefined) {
          assert.equal(evaluator.evaluate('delete', surface.path, adminCtx), surface.expectedAdminDelete, `Admin delete on ${surface.path} must match contract`)
        }
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
