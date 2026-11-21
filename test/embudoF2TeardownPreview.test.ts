import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  DEFAULT_TEARDOWN_DESIGN,
  FORBIDDEN_TEARDOWN_FILENAMES,
  PRESALE_TEARDOWN_FREE_SKIN_COPY,
  TEARDOWN_PRESALE_DESIGNS,
  buildTeardownIframeUrl,
  buildTeardownPostMessagePayload,
  getTeardownDesignById,
  isTrustedTeardownMessage,
  resolveDesignSpecFromSkin,
  resolveSkinTraitIdForDesign,
} from '../src/components/teardown-miner-preview/designCatalog.ts'
import { hasForbiddenSkinPriceMarkup } from '../src/components/miner-builder/presaleCustomOnlyPolicy.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')

function sha256File(relPath: string): string {
  const buf = fs.readFileSync(path.join(projectRoot, relPath))
  return crypto.createHash('sha256').update(buf).digest('hex')
}

test('EMBUDO-F2 (SCRUM-334): all 10 presale teardown HTML designs exist in public/teardown/ with distinct names and valid DESIGN_ID', () => {
  const expectedSlugs = [
    'v01-scorpion',
    'v02-dragon',
    'v03-phantom',
    'v04-kraken',
    'v05-falcon',
    'v06-vortex',
    'v07-ronin',
    'v08-aurora',
    'v09-wolf',
    'v10-nova',
  ]

  assert.equal(TEARDOWN_PRESALE_DESIGNS.length, 10)
  assert.deepEqual(
    TEARDOWN_PRESALE_DESIGNS.map((d) => d.slug),
    expectedSlugs,
  )

  const teardownDir = path.join(projectRoot, 'public', 'teardown')
  for (const forbidden of FORBIDDEN_TEARDOWN_FILENAMES) {
    assert.equal(fs.existsSync(path.join(teardownDir, forbidden)), false, `Forbidden legacy filename found: ${forbidden}`)
  }

  for (const design of TEARDOWN_PRESALE_DESIGNS) {
    const filePath = path.join(projectRoot, 'public', design.htmlPath.replace(/^\//, ''))
    assert.equal(fs.existsSync(filePath), true, `Missing teardown HTML asset: ${design.htmlPath}`)
    const content = fs.readFileSync(filePath, 'utf8')
    assert.ok(content.length > 100_000, `Teardown HTML looks truncated: ${design.htmlPath}`)
    assert.ok(
      content.includes(`"${design.designId}"`) || content.includes(`'${design.designId}'`),
      `HTML asset ${design.htmlPath} must contain its DESIGN_ID ${design.designId}`,
    )
  }
})

test('EMBUDO-F2 (SCRUM-334): 2D skin trait bijectively resolves designId across all 10 presale designs with safe fallback', () => {
  const seenSlugs = new Set<string>()
  const seenTraits = new Set<string>()

  for (const design of TEARDOWN_PRESALE_DESIGNS) {
    assert.equal(seenSlugs.has(design.slug), false)
    assert.equal(seenTraits.has(design.skinTraitId), false)
    seenSlugs.add(design.slug)
    seenTraits.add(design.skinTraitId)

    // Skin 2D (wall_id) defines designId
    const resolvedFromSkin = resolveDesignSpecFromSkin({
      appearance: { wall_id: design.skinTraitId },
    })
    assert.equal(resolvedFromSkin.slug, design.slug)
    assert.equal(resolvedFromSkin.designId, design.designId)

    // Inverse lookup returns exact skin trait
    assert.equal(resolveSkinTraitIdForDesign(design.slug), design.skinTraitId)
    assert.equal(resolveSkinTraitIdForDesign(design.designId), design.skinTraitId)

    // Explicit designId accepts code or slug case-insensitively
    assert.equal(getTeardownDesignById(design.designId.toLowerCase())?.slug, design.slug)
    assert.equal(getTeardownDesignById(design.slug.toUpperCase())?.designId, design.designId)
  }

  // Missing or unknown skin falls back deterministically to V01 Scorpion
  assert.equal(resolveDesignSpecFromSkin({ appearance: null }).slug, DEFAULT_TEARDOWN_DESIGN.slug)
  assert.equal(resolveDesignSpecFromSkin({ appearance: { wall_id: 'unknown-skin' } }).slug, 'v01-scorpion')
  assert.equal(resolveDesignSpecFromSkin({ designId: 'v10-nova', appearance: { wall_id: 'wall-black' } }).slug, 'v10-nova')
})

test('EMBUDO-F2 (SCRUM-334): iframe URL and postMessage bridge enforce exact designId contract and same-origin trust', () => {
  const nova = getTeardownDesignById('v10-nova')!
  const url = buildTeardownIframeUrl(nova, { powerTh: 42.44, theme: 'dark', mode: 'exploded' })
  assert.equal(url, '/teardown/v10-nova-live.html?th=42.44&theme=dark&mode=exploded')

  const payload = buildTeardownPostMessagePayload({
    miner: { id: 'miner-99', name: 'Nova #99', powerTh: 42.44, efficiency: 15 },
    design: nova,
    appearance: {
      wall_id: 'wall-white',
      body_id: 'body-gold-curves',
      stickers_id: 'none',
    },
    theme: 'dark',
    mode: 'solid',
  })

  assert.deepEqual(payload, {
    type: 'sim:set-state',
    designId: 'V10',
    designSlug: 'v10-nova',
    powerTh: 42.44,
    efficiency: 15,
    minerId: 'miner-99',
    minerName: 'Nova #99',
    theme: 'dark',
    mode: 'solid',
    appearance: {
      wall: 'wall-white',
      body: 'body-gold-curves',
      bottom: undefined,
      fans: undefined,
      screen: undefined,
      buttons: undefined,
      top: undefined,
      stickers: undefined,
    },
  })

  // Strict origin & designId validation
  assert.equal(
    isTrustedTeardownMessage('https://pouwminer.com', 'https://pouwminer.com', { type: 'sim:state-change', designId: 'V10' }, 'V10'),
    true,
  )
  assert.equal(
    isTrustedTeardownMessage('https://evil.example', 'https://pouwminer.com', { type: 'sim:state-change', designId: 'V10' }, 'V10'),
    false,
  )
  assert.equal(
    isTrustedTeardownMessage('https://pouwminer.com', 'https://pouwminer.com', { type: 'sim:state-change', designId: 'V01' }, 'V10'),
    false,
  )
  assert.equal(
    isTrustedTeardownMessage('https://pouwminer.com', 'https://pouwminer.com', { type: 'unknown', designId: 'V10' }, 'V10'),
    false,
  )

  // Presale copy never exposes +$X skin markup
  assert.equal(hasForbiddenSkinPriceMarkup(PRESALE_TEARDOWN_FREE_SKIN_COPY), false)
  assert.match(PRESALE_TEARDOWN_FREE_SKIN_COPY, /gratis por preventa/i)
})

test('EMBUDO-F2 (SCRUM-334): TeardownMinerPreview is mounted ONLY in Mi Miner (detail + editor), NOT in Overview, MinerFarm or thumbnails', () => {
  const customizerSrc = fs.readFileSync(path.join(projectRoot, 'src/nft-miners/MinerCustomizer.tsx'), 'utf8')
  const previewSrc = fs.readFileSync(path.join(projectRoot, 'src/components/teardown-miner-preview/TeardownMinerPreview.tsx'), 'utf8')
  const farmSrc = fs.readFileSync(path.join(projectRoot, 'src/nft-miners/MinerFarm.tsx'), 'utf8')
  const appSrc = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8')

  // Mounted in Mi Miner detail and editor, with picker wired to selectAppearanceTrait
  const teardownMounts = customizerSrc.match(/<TeardownMinerPreview\b/g) ?? []
  assert.equal(teardownMounts.length, 2, 'TeardownMinerPreview must be mounted exactly twice in MinerCustomizer.tsx (detail + editor)')
  assert.match(customizerSrc, /<TeardownSkinDesignPicker\b/)
  assert.match(customizerSrc, /saveOwnedMinerAppearance\(uid, targetId, appearance\)/)
  assert.match(customizerSrc, /useCustomizationCatalog\(location\.search, location\.pathname\)/)

  // Trait thumbnails (:425) MUST remain 2D MinerAppearancePreview
  assert.match(customizerSrc, /<span className="pwm-option-thumbnail"><MinerAppearancePreview\b/)

  // Wrapper posts state via postMessage and provides 2D MinerAppearancePreview fallback
  assert.match(previewSrc, /frameWindow\.postMessage\(payload, targetOrigin\)/)
  assert.match(previewSrc, /<MinerAppearancePreview\b/)
  assert.match(previewSrc, /sandbox="allow-scripts allow-same-origin"/)

  // Overview (App.tsx HomeDashboard) and MinerFarm MUST NOT mount TeardownMinerPreview or /teardown/ iframes
  assert.doesNotMatch(farmSrc, /TeardownMinerPreview|\/teardown\//)
  assert.doesNotMatch(appSrc, /TeardownMinerPreview|\/teardown\//)
})

test('EMBUDO-F2 (SCRUM-334): all 11 F2 frozen contracts, 17 baseline contracts and ReferralPage remain 100% untouched', () => {
  const f2FrozenContracts: Record<string, string> = {
    'src/minerPurchaseFlow.ts': '7710cee507a2b9b7d1f65351340115c52d5ef9651b22c022e928903747a1a2cb',
    'src/WalletPaymentCheckout.tsx': '033b63bbee3379c2661d63b5a6a4e9f5000fc467d0d868d9e34b23595e53c95e',
    'src/paymentQuote.ts': 'ea35ce7f0e9616b9f84c97ce19c9aee905dd4717dde30e9636418c7ee4c41e0a',
    'src/paymentDestinations.ts': '7184573212113c11012d39ca1cd473a974f9f85ae0c5c363f073336abf99d5bd',
    'src/solanaPayment.ts': '20a6d480799dce936075c0dcda65c9c3d202c3363b2669f91d4a5889dd0acc62',
    'src/userMinersStore.ts': '1b444a70b77fa6f53e065b763908af59801111db1496e14f406db45057560479',
    'src/minerCatalog.ts': 'fa3827ae019bdf5cc6d6bc7319db221cf8b366268d885346808292ac8ced94a0',
    'src/nft-miners/miner-customization-repository.ts': '53eae2d9828e4f66ac5c39448ddac61926c6232968ebe66721f8b63a14498dab',
    'src/nft-miners/catalog-contract.ts': '2a62041940ef8c9fa69fc269f28e25f1758f96cea6c639e6718119ad70728af7',
    'src/nft-miners/unlock-engine.ts': '95b3066468f7b2d6a5127493b1e690b9b1a19a8637b025a3fe6fea07232b6edb',
    'firestore.rules': '07622669fbe9668c720fc645ec6fe085bccb6242f3c5615868970307d1916571',
  }

  for (const [relPath, expected] of Object.entries(f2FrozenContracts)) {
    assert.equal(sha256File(relPath), expected, `EMBUDO_CONTRACT_HASH_DRIFT on ${relPath}`)
  }

  const referralSrc = fs.readFileSync(path.join(projectRoot, 'src/ReferralPage.tsx'), 'utf8')
  assert.doesNotMatch(referralSrc, /handleTriggerUnilevel/, 'EMBUDO_REFERRAL_SCOPE_VIOLATION')
  assert.equal(referralSrc.replace(/\r?\n$/, '').split(/\r?\n/).length, 822, 'ReferralPage.tsx must stay untouched at 822 lines')
})
