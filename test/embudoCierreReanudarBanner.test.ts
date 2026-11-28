import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  EMBUDO_F1_TTL_MS,
  advanceEmbudoF1Stage,
  dismissPendingEmbudoPurchase,
  hasPendingEmbudoPurchase,
  pauseEmbudoF1Modal,
  readEmbudoF1State,
  readEmbudoPresaleSelection,
  resumeEmbudoF1Modal,
  saveEmbudoPresaleSelection,
  startEmbudoF1Registration,
  type StorageLike,
} from '../src/components/embudo-f1/funnelState.ts'

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v) },
    removeItem: (k) => { map.delete(k) },
  }
}

test('EMBUDO-CIERRE-REANUDAR-BANNER: uses localStorage with 7-day TTL and preserves stage + selection when paused', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const funnelSrc = fs.readFileSync(path.join(root, 'src/components/embudo-f1/funnelState.ts'), 'utf8')
  assert.match(funnelSrc, /return window\.localStorage/)
  assert.doesNotMatch(funnelSrc, /return window\.sessionStorage/)
  assert.equal(EMBUDO_F1_TTL_MS, 7 * 24 * 60 * 60 * 1000)

  const store = createMemoryStorage()
  const t0 = 1_700_000_000_000
  startEmbudoF1Registration('landing', store, t0)
  saveEmbudoPresaleSelection({ powerTh: 96, designSlug: 'v04-kraken', designName: 'V04 Kraken' }, store)
  advanceEmbudoF1Stage('paying', store, { selectedDesignSlug: 'v04-kraken' }, t0)

  // Pause modal (user closes builder/checkout) -> state & selection preserved!
  const paused = pauseEmbudoF1Modal(store, t0 + 1000)
  assert.equal(paused.active, true)
  assert.equal(paused.stage, 'paying')
  assert.equal(paused.paused, true)
  assert.equal(hasPendingEmbudoPurchase(store, t0 + 6 * 24 * 60 * 60 * 1000), true)

  // Still valid at day 6
  const sel = readEmbudoPresaleSelection(store)
  assert.equal(sel.powerTh, 96)
  assert.equal(sel.priceUsd, 1139.99)
  assert.equal(sel.designSlug, 'v04-kraken')

  // Resume preserves exact stage
  const resumed = resumeEmbudoF1Modal(store, t0 + 5000)
  assert.equal(resumed.stage, 'paying')
  assert.equal(resumed.paused, false)

  // Expires after 7 days
  assert.equal(hasPendingEmbudoPurchase(store, t0 + 7 * 24 * 60 * 60 * 1000 + 1), false)

  // Re-create & test explicit dismiss removes banner & state
  startEmbudoF1Registration('landing', store, t0)
  advanceEmbudoF1Stage('configuring', store, { selectedDesignSlug: 'v04-kraken' }, t0)
  assert.equal(hasPendingEmbudoPurchase(store, t0 + 1000), true)
  dismissPendingEmbudoPurchase(store)
  assert.equal(hasPendingEmbudoPurchase(store, t0 + 6000), false)
  assert.equal(readEmbudoF1State(store, t0 + 6000).active, false)
})

test('EMBUDO-CIERRE-REANUDAR-BANNER: App.tsx renders "Tu miner te espera" banner on /home and preserves state on close', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const appSrc = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  assert.match(appSrc, /data-testid="pending-miner-banner"/)
  assert.match(appSrc, /TU MINER TE ESPERA/)
  assert.match(appSrc, /Continuar con el pago/)
  assert.match(appSrc, /Verificar correo/)
  assert.match(appSrc, /pauseEmbudoF1Modal\(\)/)
  assert.match(appSrc, /resumeEmbudoF1Modal\(\)/)
  assert.match(appSrc, /dismissPendingEmbudoPurchase\(\)/)
})

test('EMBUDO-BANNER-CSS: src/styles.css styles .pending-miner-banner and all child classes (#0b0c10, #10b981, 72px thumb, mobile stack)', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8')
  for (const selector of [
    '.pending-miner-banner',
    '.pending-miner-banner-left',
    '.pending-miner-banner-thumb',
    '.pending-miner-banner-copy',
    '.pending-miner-banner-kicker',
    '.pending-miner-banner-stage',
    '.pending-miner-banner-actions',
    '.pending-miner-resume-btn',
    '.pending-miner-verify-btn',
    '.pending-miner-dismiss-btn',
  ]) {
    assert.ok(css.includes(selector), `Expected src/styles.css to include ${selector}`)
  }
  assert.match(css, /background-color:\s*#0b0c10/i)
  assert.match(css, /#10b981/i)
  assert.match(css, /\.pending-miner-banner-thumb[\s\S]*?width:\s*72px;[\s\S]*?height:\s*72px;/m)
  assert.match(css, /@media\s*\(max-width:\s*860px\)[\s\S]*?flex-direction:\s*column;/m)
  assert.doesNotMatch(css.slice(css.indexOf('/* Pending Miner Resume Banner')), /transition:\s*all\b/)
})
