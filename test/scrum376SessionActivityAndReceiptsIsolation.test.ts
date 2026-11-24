import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  shouldResetAccountUiState,
  resolveVisibleTransactionRows,
} from '../src/services/session/accountSessionIsolation.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const EXPECTED_FIRESTORE_RULES_SHA256 =
  'F4313C04DD7595E1C84D8977299169EEA38C2B250F96E6916D68959CDAAA6779'

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(projectRoot, relPath), 'utf8')
}

describe('SCRUM-376: Per-UID Session Activity, Payment Receipts & Transient UI State Isolation', () => {
  describe('Suite 1: shouldResetAccountUiState', () => {
    it('returns true on logout, account switch, and unauthenticated-to-authenticated transitions', () => {
      assert.equal(shouldResetAccountUiState('uid_1', null), true)
      assert.equal(shouldResetAccountUiState('uid_1', 'uid_2'), true)
      assert.equal(shouldResetAccountUiState(null, 'uid_1'), true)
    })

    it('returns false when active uid does not change', () => {
      assert.equal(shouldResetAccountUiState('uid_1', 'uid_1'), false)
      assert.equal(shouldResetAccountUiState(null, null), false)
    })
  })

  describe('Suite 2: resolveVisibleTransactionRows', () => {
    it('excludes shared demo.receipts for authenticated accounts while keeping session paymentReceipts', () => {
      const paymentReceipts = [{ id: 'pay_1', amount: 100 }]
      const demoReceipts = [
        { id: 'demo_1', kind: 'purchase', label: 'Demo Miner', amount: 50 },
        { id: 'demo_2', kind: 'topup', label: 'Demo Topup', amount: 25 },
      ]

      const result = resolveVisibleTransactionRows({
        isAuthenticated: true,
        paymentReceipts,
        demoReceipts,
      })

      assert.deepEqual(result.paymentReceipts, paymentReceipts)
      assert.deepEqual(result.demoReceipts, [])
    })

    it('preserves both paymentReceipts and demoReceipts in unauthenticated demo mode', () => {
      const paymentReceipts = [{ id: 'pay_demo', amount: 10 }]
      const demoReceipts = [{ id: 'demo_1', kind: 'purchase', label: 'Demo Miner', amount: 50 }]

      const result = resolveVisibleTransactionRows({
        isAuthenticated: false,
        paymentReceipts,
        demoReceipts,
      })

      assert.deepEqual(result.paymentReceipts, paymentReceipts)
      assert.deepEqual(result.demoReceipts, demoReceipts)
    })
  })

  describe('Suite 3: AppContent Deterministic Reset, Timer Cleanup & Hook Ordering', () => {
    it('resets all 9 transient UI states and cancels paidRedirectTimerRef on activeUid transitions before recovery/URL effects and before loading early return', () => {
      const appSrc = readText('src/App.tsx')

      assert.match(
        appSrc,
        /const activeUid = isAuthenticated && user \? user\.uid : null/,
        'AppContent must derive activeUid from isAuthenticated && user',
      )
      assert.ok(appSrc.includes('shouldResetAccountUiState'), 'AppContent must gate reset via shouldResetAccountUiState')
      assert.ok(appSrc.includes('paidRedirectTimerRef'), 'AppContent must track paidRedirectTimerRef')

      const resetCalls = [
        'setSessionEvents([])',
        'setPaymentReceipts([])',
        'setCart([])',
        'setWalletCheckout(null)',
        'setPendingAction(null)',
        "setToast('')",
        'setPurchaseOpen(false)',
        'setTopUpOpen(false)',
        'setMinerBuilderOpen(false)',
      ]
      for (const call of resetCalls) {
        assert.ok(appSrc.includes(call), `AppContent must clear transient state via ${call}`)
      }

      const resetEffectIdx = appSrc.indexOf('shouldResetAccountUiState(')
      const blocker6Idx = appSrc.indexOf('const recovery = getPostTxRecovery()')
      const urlResumeIdx = appSrc.indexOf("params.get('gmPayIntentId')")
      const loadingReturnIdx = appSrc.indexOf('if (loading) {')
      const walletGuardIdx = appSrc.indexOf('evaluateWalletSessionTransition(')
      const crossTabStorageIdx = appSrc.indexOf('evaluateCrossTabStorageEvent(')

      assert.ok(resetEffectIdx > 0, 'Reset effect must exist in App.tsx')
      assert.ok(blocker6Idx > resetEffectIdx, 'Reset effect must run BEFORE Blocker 6 post-tx recovery')
      assert.ok(urlResumeIdx > resetEffectIdx, 'Reset effect must run BEFORE URL gmPayIntentId resume')
      assert.ok(loadingReturnIdx > resetEffectIdx, 'Reset effect must be declared BEFORE if (loading) return')
      assert.ok(loadingReturnIdx > walletGuardIdx, 'Wallet guard effect must be declared BEFORE if (loading) return')
      assert.ok(
        crossTabStorageIdx > 0 && loadingReturnIdx > crossTabStorageIdx,
        'Cross-tab storage listener effect (SCRUM-378) must be declared BEFORE if (loading) return',
      )
      assert.ok(
        appSrc.includes('resetAccountTransientUiState'),
        'AppContent must reuse resetAccountTransientUiState across activeUid transitions and cross-tab storage sync',
      )
      assert.match(
        appSrc,
        /if\s*\(decision\.shouldResetUiState\)\s*\{\s*resetAccountTransientUiState\(\)\s*\}/,
        'Cross-tab storage listener must trigger deterministic UI reset when decision.shouldResetUiState is true',
      )

      // onPaid must store timeout handle in paidRedirectTimerRef.current, and unmount + reset + onPaid must clear it
      assert.match(
        appSrc,
        /paidRedirectTimerRef\.current\s*=\s*window\.setTimeout\(/,
        'WalletPaymentCheckout onPaid must store timeout id in paidRedirectTimerRef.current',
      )
      const clearTimerMatches = appSrc.match(/window\.clearTimeout\(paidRedirectTimerRef\.current\)/g) ?? []
      assert.ok(
        clearTimerMatches.length >= 3,
        `Expected >= 3 clearTimeout(paidRedirectTimerRef.current) sites (unmount, activeUid reset, onPaid), found ${clearTimerMatches.length}`,
      )

      // AuthorizedWithdrawalView must bind idToken to its owning uid and key child views by user.uid
      const withdrawalViewMatch = appSrc.match(/function AuthorizedWithdrawalView\([\s\S]*?\n\}\n/)
      assert.ok(withdrawalViewMatch, 'AuthorizedWithdrawalView must exist in App.tsx')
      const withdrawalViewSrc = withdrawalViewMatch[0]
      assert.match(
        withdrawalViewSrc,
        /tokenState\?\.uid === user\.uid/,
        'AuthorizedWithdrawalView must pair idToken with owning uid to avoid 1-tick cross-account token mismatch',
      )
      assert.match(
        withdrawalViewSrc,
        /<WithdrawalForm\s+key=\{user\.uid\}/,
        'WithdrawalForm must key on user.uid so direct uid_1 -> uid_2 switches reset controller state',
      )
      assert.match(
        withdrawalViewSrc,
        /<WithdrawalHistoryPanel\s+key=\{user\.uid\}/,
        'WithdrawalHistoryPanel must key on user.uid so direct uid_1 -> uid_2 switches reset state',
      )
    })
  })

  describe('Suite 4: DataTable Isolation & Preserved Contracts (SCRUM-265, ClientPaymentHistory, Post-Tx Recovery, Rules)', () => {
    it('passes isAuthenticated to DataTable, filters demo.receipts via resolveVisibleTransactionRows, and updates authenticated receipt status copy', () => {
      const appSrc = readText('src/App.tsx')

      assert.match(
        appSrc,
        /<DataTable\s+screen=\{screen\}\s+paymentReceipts=\{paymentReceipts\}\s+isAuthenticated=\{isAuthenticated\}\s*\/>/,
        'Page must pass isAuthenticated to DataTable',
      )

      const dataTableMatch = appSrc.match(/function DataTable\([\s\S]*?\n\}\n/)
      assert.ok(dataTableMatch, 'DataTable component must exist in App.tsx')
      const dataTableSrc = dataTableMatch[0]

      assert.ok(
        dataTableSrc.includes('resolveVisibleTransactionRows'),
        'DataTable must filter rows through resolveVisibleTransactionRows',
      )
      const filterIdx = dataTableSrc.indexOf('resolveVisibleTransactionRows(')
      const earnSummaryIdx = dataTableSrc.indexOf('if (isEarnSummary)')
      assert.ok(
        filterIdx > 0 && earnSummaryIdx > filterIdx,
        'DataTable must filter demo.receipts through resolveVisibleTransactionRows BEFORE if (isEarnSummary) early return',
      )
      assert.ok(
        dataTableSrc.includes('Liquidado · Confirmado on-chain'),
        'Authenticated DataTable rows must display Liquidado · Confirmado on-chain',
      )
      assert.match(
        dataTableSrc,
        /isAuthenticated\s*\?\s*'Liquidado · Confirmado on-chain'\s*:\s*'Enviado · confirmación no verificada'/,
        'Obsolete copy must never be shown for authenticated rows',
      )
      assert.ok(
        dataTableSrc.includes('Historial de Pagos'),
        'Authenticated empty state must direct user to Cartera / Historial de Pagos',
      )
    })

    it('preserves SessionActivity (SCRUM-265), ClientPaymentHistory per-uid query, Blocker 6 originUid check, and pure LF firestore.rules SHA-256', () => {
      const appSrc = readText('src/App.tsx')
      const historySrc = readText('src/components/payments/ClientPaymentHistory.tsx')
      const historyServiceSrc = readText('src/components/payments/clientPaymentHistoryService.ts')
      const rulesRaw = fs.readFileSync(path.resolve(projectRoot, 'firestore.rules'))
      const rulesSha256 = crypto.createHash('sha256').update(rulesRaw).digest('hex').toUpperCase()

      assert.ok(
        appSrc.includes('<SessionActivity isAuth={isAuthenticated} items={sessionEvents} />'),
        'SCRUM-265 literal SessionActivity JSX must be preserved',
      )
      assert.ok(appSrc.includes('Actividad de esta sesión'))
      assert.ok(appSrc.includes('Actividad simulada en esta sesión'))
      assert.ok(appSrc.includes('Acciones recientes registradas durante esta sesión.'))
      assert.ok(appSrc.includes('Se borra al recargar la página.'))

      assert.ok(
        appSrc.includes('!recovery.originUid || user.uid !== recovery.originUid'),
        'Blocker 6 post-tx recovery must continue enforcing recovery.originUid === user.uid',
      )
      assert.match(
        historySrc,
        /subscribeToClientOrders\(\s*uid\s*,/,
        'ClientPaymentHistory must subscribe strictly for the active uid',
      )
      assert.match(
        historyServiceSrc,
        /where\(\s*'userId'\s*,\s*'=='\s*,\s*cleanUid\s*\)/,
        'clientPaymentHistoryService must remain scoped by where(\'userId\', \'==\', cleanUid)',
      )
      assert.equal(rulesRaw.includes(0x0d), false, 'firestore.rules must remain pure LF (HAS_CR=false)')
      assert.equal(rulesSha256, EXPECTED_FIRESTORE_RULES_SHA256, 'firestore.rules SHA-256 must match frozen baseline')
    })
  })
})
