import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test, { describe, it, beforeEach, afterEach } from 'node:test'
import React from 'react'

import {
  getDemoSessionForPersistence,
  restoreDemoSession,
} from '../src/demoStore.ts'

import {
  connectDemoPersistence,
  getFirebaseClient,
  useDemoFirestorePersistence,
} from '../src/firestoreDemoSync.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')

function renderHook<T>(hookFn: () => T): { result: { current: T }; unmount: () => void } {
  let cleanups: (() => void)[] = []
  const states: any[] = []
  let stateIndex = 0

  const dispatcher = {
    useState<S>(initialState: S | (() => S)): [S, (action: S | ((prev: S) => S)) => void] {
      const idx = stateIndex++
      if (states[idx] === undefined) {
        states[idx] = typeof initialState === 'function' ? (initialState as () => S)() : initialState
      }
      const setState = (action: S | ((prev: S) => S)) => {
        states[idx] = typeof action === 'function' ? (action as (prev: S) => S)(states[idx]) : action
      }
      return [states[idx], setState]
    },
    useEffect(effect: () => void | (() => void), _deps?: unknown[]) {
      const cleanup = effect()
      if (typeof cleanup === 'function') {
        cleanups.push(cleanup)
      }
    },
  }

  const prevDispatcher = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?.H
  ;(React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = dispatcher

  try {
    const value = hookFn()
    return {
      result: { current: value },
      unmount: () => {
        cleanups.forEach((c) => c())
        cleanups = []
      },
    }
  } finally {
    ;(React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = prevDispatcher
  }
}

function getAllSrcFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...getAllSrcFiles(fullPath))
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

describe('SCRUM-302: Removal of signInAnonymously and Firestore Demo Sync', () => {
  describe('Static Source Audits', () => {
    it('ensures zero occurrences of signInAnonymously across all files in src/**', () => {
      const srcDir = path.join(projectRoot, 'src')
      const srcFiles = getAllSrcFiles(srcDir)
      assert.ok(srcFiles.length > 0, 'src files should be found')

      const violations: { file: string; line: number; text: string }[] = []
      for (const file of srcFiles) {
        const content = fs.readFileSync(file, 'utf8')
        const lines = content.split('\n')
        lines.forEach((lineText, idx) => {
          if (lineText.includes('signInAnonymously')) {
            violations.push({
              file: path.relative(projectRoot, file),
              line: idx + 1,
              text: lineText.trim(),
            })
          }
        })
      }

      assert.deepEqual(
        violations,
        [],
        `Found signInAnonymously in src files:\n${violations.map((v) => `  ${v.file}:${v.line}: ${v.text}`).join('\n')}`
      )
    })

    it('ensures src/firestoreDemoSync.ts contains no anonymousUserPromise or remote demoState sync', () => {
      const filePath = path.join(projectRoot, 'src/firestoreDemoSync.ts')
      const content = fs.readFileSync(filePath, 'utf8')

      assert.doesNotMatch(content, /signInAnonymously/)
      assert.doesNotMatch(content, /anonymousUserPromise/)
      assert.doesNotMatch(content, /demoState\/current/)
      assert.doesNotMatch(content, /['"]demoState['"]/)
      assert.doesNotMatch(content, /waitForInitialUser/)
    })

    it('ensures src/miningSimulation.ts continues importing getFirebaseClient', () => {
      const filePath = path.join(projectRoot, 'src/miningSimulation.ts')
      const content = fs.readFileSync(filePath, 'utf8')
      assert.match(content, /import\s*\{\s*getFirebaseClient\s*\}\s*from\s*'\.\/firestoreDemoSync'/)
    })
  })

  describe('Export API Contracts', () => {
    it('exports getFirebaseClient as an async function', () => {
      assert.equal(typeof getFirebaseClient, 'function')
    })

    it('exports useDemoFirestorePersistence as a function', () => {
      assert.equal(typeof useDemoFirestorePersistence, 'function')
    })

    it('exports connectDemoPersistence as a function', () => {
      assert.equal(typeof connectDemoPersistence, 'function')
    })
  })

  describe('Functional Persistence: Local Storage Sandbox', () => {
    const LOCAL_KEY = 'gomining-replica-demo-v1'
    let mockStorage: Record<string, string>
    let originalWindow: unknown

    beforeEach(() => {
      mockStorage = {}
      originalWindow = (globalThis as any).window
      ;(globalThis as any).window = {
        localStorage: {
          getItem: (key: string) => mockStorage[key] ?? null,
          setItem: (key: string, val: string) => {
            mockStorage[key] = val
          },
          removeItem: (key: string) => {
            delete mockStorage[key]
          },
        },
      }

      restoreDemoSession({
        balance: 500,
        presaleTokens: 10,
        maintenanceCredit: 0,
        miners: [],
        workers: [],
        workerActivationMode: 'automatic',
        receipts: [],
        pendingMinerOrders: [],
        lastDailyRewardAt: null,
      })
    })

    afterEach(() => {
      ;(globalThis as any).window = originalWindow
    })

    it('restores existing local snapshot on connect and reports status: disabled', () => {
      const savedSnapshot = {
        schemaVersion: 1,
        mode: 'demo',
        balance: 1337,
        presaleTokens: 42,
        maintenanceCredit: 5,
        miners: [],
        workers: [],
        workerActivationMode: 'manual',
        receipts: [],
        pendingMinerOrders: [],
        lastDailyRewardAt: null,
      }
      mockStorage[LOCAL_KEY] = JSON.stringify(savedSnapshot)

      const statusHistory: { status: string; detail?: string }[] = []
      const unsubscribe = connectDemoPersistence((status, detail) => {
        statusHistory.push({ status, detail })
      })

      const current = getDemoSessionForPersistence()
      assert.equal(current.balance, 1337)
      assert.equal(current.presaleTokens, 42)

      // Verified: status is 'disabled' (indicating clean local browser storage)
      assert.equal(statusHistory.length > 0, true)
      assert.equal(statusHistory[statusHistory.length - 1].status, 'disabled')
      assert.equal(statusHistory[statusHistory.length - 1].detail ?? '', '')

      unsubscribe()
    })

    it('writes store updates to localStorage and maintains status: disabled', () => {
      const statusHistory: { status: string; detail?: string }[] = []
      const unsubscribe = connectDemoPersistence((status, detail) => {
        statusHistory.push({ status, detail })
      })

      // Simulate a mutation in demoStore
      restoreDemoSession({
        balance: 9999,
        presaleTokens: 0,
        maintenanceCredit: 0,
        miners: [],
        workers: [],
        workerActivationMode: 'automatic',
        receipts: [],
        pendingMinerOrders: [],
        lastDailyRewardAt: null,
      })

      assert.ok(mockStorage[LOCAL_KEY])
      const stored = JSON.parse(mockStorage[LOCAL_KEY])
      assert.equal(stored.balance, 9999)
      assert.equal(stored.mode, 'demo')
      assert.equal(stored.schemaVersion, 1)
      assert.equal(statusHistory[statusHistory.length - 1].status, 'disabled')

      unsubscribe()
    })

    it('handles localStorage throwing on setItem and reports status: error', () => {
      ;(globalThis as any).window.localStorage.setItem = () => {
        throw new Error('QuotaExceededError: storage is full')
      }

      const statusHistory: { status: string; detail?: string }[] = []
      const unsubscribe = connectDemoPersistence((status, detail) => {
        statusHistory.push({ status, detail })
      })

      assert.equal(statusHistory[statusHistory.length - 1].status, 'error')
      assert.equal(
        statusHistory[statusHistory.length - 1].detail,
        'El navegador no permitió guardar los datos locales.'
      )

      unsubscribe()
    })

    it('emits status: disabled and cleans up safely when window is undefined', () => {
      ;(globalThis as any).window = undefined

      const statusHistory: { status: string; detail?: string }[] = []
      const unsubscribe = connectDemoPersistence((status, detail) => {
        statusHistory.push({ status, detail })
      })

      assert.equal(statusHistory[statusHistory.length - 1].status, 'disabled')
      assert.doesNotThrow(() => unsubscribe())
    })

    it('exercises useDemoFirestorePersistence hook with Firebase env vars and localStorage (Test #6: zero network/auth calls)', async () => {
      const prevApiKey = process.env.VITE_FIREBASE_API_KEY
      const prevProjectId = process.env.VITE_FIREBASE_PROJECT_ID
      process.env.VITE_FIREBASE_API_KEY = 'test-mock-api-key-scrum-304'
      process.env.VITE_FIREBASE_PROJECT_ID = 'test-hermetic-mock'

      const initialSnapshot = {
        schemaVersion: 1,
        mode: 'demo',
        balance: 5555,
        presaleTokens: 99,
        maintenanceCredit: 10,
        miners: [],
        workers: [],
        workerActivationMode: 'automatic',
        receipts: [],
        pendingMinerOrders: [],
        lastDailyRewardAt: null,
      }
      mockStorage[LOCAL_KEY] = JSON.stringify(initialSnapshot)

      let fetchCalls = 0
      const origFetch = globalThis.fetch
      globalThis.fetch = async (...args: any[]) => {
        fetchCalls++
        return (origFetch as any)(...args)
      }

      try {
        const { result, unmount } = renderHook(() => useDemoFirestorePersistence())

        assert.deepEqual(result.current, { status: 'disabled', detail: '' })

        const currentSession = getDemoSessionForPersistence()
        assert.equal(currentSession.balance, 5555)
        assert.equal(currentSession.presaleTokens, 99)

        assert.ok(mockStorage[LOCAL_KEY], 'localStorage should contain demo snapshot')
        const stored = JSON.parse(mockStorage[LOCAL_KEY])
        assert.equal(stored.balance, 5555)
        assert.equal(stored.mode, 'demo')
        assert.equal(stored.schemaVersion, 1)

        // Verify state update reactivity via store subscription
        restoreDemoSession({
          balance: 8888,
          presaleTokens: 12,
          maintenanceCredit: 0,
          miners: [],
          workers: [],
          workerActivationMode: 'automatic',
          receipts: [],
          pendingMinerOrders: [],
          lastDailyRewardAt: null,
        })
        const updatedStored = JSON.parse(mockStorage[LOCAL_KEY])
        assert.equal(updatedStored.balance, 8888)

        assert.equal(fetchCalls, 0, 'Zero network fetch calls should be made')

        unmount()
      } finally {
        globalThis.fetch = origFetch
        if (prevApiKey !== undefined) {
          process.env.VITE_FIREBASE_API_KEY = prevApiKey
        } else {
          delete process.env.VITE_FIREBASE_API_KEY
        }
        if (prevProjectId !== undefined) {
          process.env.VITE_FIREBASE_PROJECT_ID = prevProjectId
        } else {
          delete process.env.VITE_FIREBASE_PROJECT_ID
        }
      }
    })
  })
})
