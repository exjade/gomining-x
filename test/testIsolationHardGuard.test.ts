import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertNotProductionFirestore,
  setFirestoreWritersForTesting,
  savePurchasedMiner,
  recordMinerPurchaseToAdmin,
  updateMinerInFirestore,
  type StoredMiner,
} from '../src/firebase.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

describe('Tier 4 Adversarial Isolation Suite: Hard Guards, Zero Writes & Network Traps', () => {
  // =========================================================================
  // 1. Hard Abort on Production Project ID in testSetup.ts
  // =========================================================================
  it('Adversarial 1: testSetup.ts hard-aborts test runner if VITE_FIREBASE_PROJECT_ID is salad-miners', () => {
    const child = spawnSync(
      process.execPath,
      ['--import', './test/testSetup.ts', '--experimental-strip-types', '-e', 'console.log("SHOULD_NOT_EXECUTE")'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          VITE_FIREBASE_PROJECT_ID: 'salad-miners',
        },
        encoding: 'utf8',
      }
    )

    assert.notEqual(child.status, 0, 'Child process must exit with non-zero exit code')
    assert.ok(
      child.stderr.includes('Production Firebase projectId "salad-miners" detected during test execution'),
      `Stderr must include fatal guard message: ${child.stderr}`
    )
    assert.ok(!child.stdout.includes('SHOULD_NOT_EXECUTE'), 'Code after testSetup must not execute')
  })

  // =========================================================================
  // 2. Hard Abort on Production Project ID in src/firebase.ts
  // =========================================================================
  it('Adversarial 2: src/firebase.ts hard-aborts in Node if initialized with salad-miners unconditionally without bypass', () => {
    // 2.1 Default environment with production project ID
    const child = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '-e', 'import("./src/firebase.ts")'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          VITE_FIREBASE_PROJECT_ID: 'salad-miners',
        },
        encoding: 'utf8',
      }
    )

    assert.notEqual(child.status, 0, 'Child process must exit with non-zero exit code')
    assert.ok(
      child.stderr.includes('Direct connection to production Firebase projectId "salad-miners" is forbidden in Node'),
      `Stderr must block production Firebase initialization: ${child.stderr}`
    )

    // 2.2 Unconditional abort even if legacy bypass flags are supplied
    const childWithBypass = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '-e', 'import("./src/firebase.ts")'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          VITE_FIREBASE_PROJECT_ID: 'salad-miners',
          ALLOW_PROD_READONLY: 'true',
          ALLOW_PROD_AUDIT: 'true',
        },
        encoding: 'utf8',
      }
    )

    assert.notEqual(childWithBypass.status, 0, 'Child process must exit with non-zero exit code even with bypass flags')
    assert.ok(
      childWithBypass.stderr.includes('Direct connection to production Firebase projectId "salad-miners" is forbidden in Node'),
      `Stderr must block production Firebase initialization even with bypass flags: ${childWithBypass.stderr}`
    )
  })

  // =========================================================================
  // 3. assertNotProductionFirestore Guard
  // =========================================================================
  it('Adversarial 3: assertNotProductionFirestore throws fatal error if target is salad-miners', () => {
    // 3.1 With explicit docRef options
    assert.throws(
      () => {
        assertNotProductionFirestore({
          firestore: { app: { options: { projectId: 'salad-miners' } } },
        })
      },
      /Write operation attempted against production Firestore database "salad-miners"/
    )

    // 3.2 With mock docRef without production ID passes cleanly
    assert.doesNotThrow(() => {
      assertNotProductionFirestore({
        firestore: { app: { options: { projectId: 'test-hermetic-mock' } } },
      })
    })
  })

  // =========================================================================
  // 4. Writer Hooks and Double Execution
  // =========================================================================
  it('Adversarial 4: setFirestoreWritersForTesting prevents unmocked writes and routes to doubles', async () => {
    let interceptedSetDoc = 0
    let interceptedUpdateDoc = 0

    setFirestoreWritersForTesting({
      setDoc: async () => {
        interceptedSetDoc++
        return Promise.resolve()
      },
      updateDoc: async () => {
        interceptedUpdateDoc++
        return Promise.resolve()
      },
    })

    try {
      const dummyMiner: StoredMiner = {
        id: 'MINER-ADV-001',
        uid: 'usr_adv_test',
        name: 'Adversarial Miner',
        powerTh: 10,
        efficiency: 15,
        price: 100,
        currency: 'USD',
        status: 'active',
        packageId: 'minerx-01',
      }

      await savePurchasedMiner('usr_adv_test', dummyMiner)
      assert.equal(interceptedSetDoc, 1, 'savePurchasedMiner must route through writer hook')

      await updateMinerInFirestore('usr_adv_test', 'MINER-ADV-001', { name: 'New Name' })
      assert.equal(interceptedUpdateDoc, 1, 'updateMinerInFirestore must route through writer hook')
    } finally {
      setFirestoreWritersForTesting(null)
    }
  })

  // =========================================================================
  // 5. Global Fetch Trap for External Outbound Calls
  // =========================================================================
  it('Adversarial 5: Global fetch trap intercepts unmocked outbound external HTTP requests', async () => {
    await assert.rejects(
      async () => {
        await fetch('https://firestore.googleapis.com/v1/projects/salad-miners/databases')
      },
      /FATAL: Unmocked network fetch to "https:\/\/firestore\.googleapis\.com\/v1\/projects\/salad-miners\/databases" in test suite/
    )

    await assert.rejects(
      async () => {
        await fetch('https://api.gomining.com/orders')
      },
      /FATAL: Unmocked network fetch to "https:\/\/api\.gomining\.com\/orders" in test suite/
    )
  })

  // =========================================================================
  // 6. Loopback / Localhost Requests Pass Through Fetch Trap
  // =========================================================================
  it('Adversarial 6: Loopback (127.0.0.1) requests pass through fetch trap to local servers', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'local_ok' }))
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const res = await fetch(`http://127.0.0.1:${port}/test-endpoint`)
      assert.equal(res.status, 200)
      const data = await res.json()
      assert.deepEqual(data, { status: 'local_ok' })
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  // =========================================================================
  // 7. Process-Level Configuration Inspection in package.json
  // =========================================================================
  it('Adversarial 7: package.json test script excludes .env.local and imports testSetup.ts', () => {
    const pkgPath = path.resolve(projectRoot, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

    assert.ok(pkg.scripts.test, 'package.json must contain test script')
    assert.ok(
      !pkg.scripts.test.includes('--env-file-if-exists=.env.local'),
      'test script must NOT include --env-file-if-exists=.env.local'
    )
    assert.ok(
      pkg.scripts.test.includes('--import ./test/testSetup.ts'),
      'test script must include --import ./test/testSetup.ts'
    )
    assert.ok(
      pkg.scripts['audit:contamination'],
      'package.json must contain opt-in audit:contamination script'
    )
  })
})
