/**
 * Test Harness Setup & Production Isolation Preload
 * Executed via Node --import before any test suite runs.
 */

// 1. Hard fail closed if production project ID is detected
const rawProjectId = process.env.VITE_FIREBASE_PROJECT_ID?.trim()
if (rawProjectId === 'salad-miners') {
  throw new Error('FATAL: Production Firebase projectId "salad-miners" detected during test execution. Aborting test suite immediately.')
}

// 2. Default hermetic test environment
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test'
}
if (!process.env.VITE_FIREBASE_PROJECT_ID) {
  process.env.VITE_FIREBASE_PROJECT_ID = 'test-hermetic-mock'
}

// 3. Global network fetch trap
const originalFetch = globalThis.fetch

if (typeof originalFetch === 'function') {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let urlStr = ''
    if (typeof input === 'string') {
      urlStr = input
    } else if (input instanceof URL) {
      urlStr = input.href
    } else if (input && typeof (input as any).url === 'string') {
      urlStr = (input as any).url
    }

    try {
      const parsed = new URL(urlStr, 'http://127.0.0.1')
      // Allow loopback / local test servers
      if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
        return originalFetch(input, init)
      }
    } catch {
      // If URL parsing fails, fall through to trap
    }

    throw new Error(`FATAL: Unmocked network fetch to "${urlStr}" in test suite`)
  }
}
