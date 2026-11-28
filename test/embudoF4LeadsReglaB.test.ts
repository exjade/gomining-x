import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  LEAD_CAPTURED_EVENT_NAME,
  buildLeadCapturedEvent,
  emitLeadCapturedEvent,
  shouldCaptureLead,
  type StorageLike,
} from '../src/components/embudo-f1/leadCapture.ts'

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v) },
    removeItem: (k) => { map.delete(k) },
  }
}

test('EMBUDO-F4-LEADS-REGLA-B: requires valid email AND allowsCommunication=true', () => {
  assert.equal(shouldCaptureLead({ email: 'buyer@pouwminer.com', allowsCommunication: true }), true)
  assert.equal(shouldCaptureLead({ email: 'buyer@pouwminer.com', allowsCommunication: false }), false)
  assert.equal(shouldCaptureLead({ email: '', allowsCommunication: true }), false)
  assert.equal(shouldCaptureLead({ email: 'not-an-email', allowsCommunication: true }), false)
})

test('EMBUDO-F4-LEADS-REGLA-B: buildLeadCapturedEvent builds exact structure for all 4 funnel stages', () => {
  const store = createMemoryStorage()
  for (const status of ['registering', 'configuring', 'paying', 'purchased'] as const) {
    const payload = buildLeadCapturedEvent(
      {
        email: '  Elena.Test@Example.COM ',
        name: '',
        status,
        allowsCommunication: true,
        source: status === 'paying' ? 'checkout-prepay' : 'register-welcome',
        powerTh: 96,
        priceUsd: 1139.99,
        designSlug: 'v04-kraken',
      },
      store,
    )
    assert.ok(payload)
    assert.equal(payload.event, LEAD_CAPTURED_EVENT_NAME)
    assert.equal(payload.email, 'elena.test@example.com')
    assert.equal(payload.name, 'Elena Test')
    assert.equal(payload.status, status)
    assert.equal(payload.allowsCommunication, true)
    assert.equal(payload.powerTh, 96)
    assert.equal(payload.priceUsd, 1139.99)
    assert.ok(!Number.isNaN(Date.parse(payload.date)))
  }

  // Must return null when user opts out of communication
  const blocked = buildLeadCapturedEvent(
    {
      email: 'no-comms@example.com',
      status: 'paying',
      allowsCommunication: false,
      source: 'checkout-prepay',
    },
    store,
  )
  assert.equal(blocked, null)
})

test('EMBUDO-F4-LEADS-REGLA-B: emitLeadCapturedEvent posts user/lead-captured only with consent', async () => {
  const store = createMemoryStorage()
  const calls: Array<{ url: string; body: any }> = []
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body || '{}')) })
    return new Response(JSON.stringify({ captured: true }), { status: 201 })
  }) as typeof fetch

  // Opted out -> 0 requests
  const skipped = emitLeadCapturedEvent(
    {
      email: 'optout@example.com',
      status: 'configuring',
      allowsCommunication: false,
      source: 'builder-configure',
    },
    { storage: store, fetchImpl: fakeFetch, endpoint: 'http://127.0.0.1:3001/api/leads/capture' },
  )
  assert.equal(skipped, null)
  assert.equal(calls.length, 0)

  // Opted in -> 1 request with exact payload
  const emitted = emitLeadCapturedEvent(
    {
      email: 'buyer@example.com',
      name: 'Roman Buyer',
      status: 'paying',
      allowsCommunication: true,
      source: 'checkout-prepay',
      powerTh: 128,
      priceUsd: 1519.99,
    },
    { storage: store, fetchImpl: fakeFetch, endpoint: 'http://127.0.0.1:3001/api/leads/capture' },
  )
  assert.ok(emitted)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.event, 'user/lead-captured')
  assert.equal(calls[0].body.email, 'buyer@example.com')
  assert.equal(calls[0].body.name, 'Roman Buyer')
  assert.equal(calls[0].body.status, 'paying')
  assert.equal(calls[0].body.allowsCommunication, true)
})

test('EMBUDO-F4-LEADS-REGLA-B: AuthModal & App.tsx wire user/lead-captured on register, configure, prepay, and receipt without blocking checkboxes', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const authModal = fs.readFileSync(path.join(root, 'src/AuthModal.tsx'), 'utf8')
  const appSource = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')

  assert.match(authModal, /emitLeadCapturedEvent/)
  assert.match(authModal, /register-lead-comms-optin/)
  assert.match(appSource, /emitLeadCapturedEvent/)
  assert.match(appSource, /checkout-receipt-email-input/)
  assert.match(appSource, /source:\s*'checkout-prepay'/)
  assert.match(appSource, /source:\s*'purchase-receipt'/)
})
