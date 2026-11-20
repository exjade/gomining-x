import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8')
const authSource = fs.readFileSync(path.join(projectRoot, 'src/AuthModal.tsx'), 'utf8')
const subscriptionSource = fs.readFileSync(path.join(projectRoot, 'src/SubscriptionsPage.tsx'), 'utf8')
const landingSource = fs.readFileSync(path.join(projectRoot, 'src/LandingPage.tsx'), 'utf8')
const catalogSource = fs.readFileSync(path.join(projectRoot, 'src/catalog.ts'), 'utf8')
const appKitSource = fs.readFileSync(path.join(projectRoot, 'src/appkitConfig.ts'), 'utf8')
const indexSource = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8')
const es = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/locales/es.json'), 'utf8')) as Record<string, Record<string, string>>
const en = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/locales/en.json'), 'utf8')) as Record<string, Record<string, string>>

test('SCRUM-251 public copy removes unsupported inherited claims', () => {
  const landingCopy = [...Object.values(es.landing), ...Object.values(en.landing)].join('\n')
  for (const claim of [
    /GoMining/i,
    /veGOMINING/i,
    /NFT/i,
    /liquidity|liquidez|liquid digital/i,
    /renewable/i,
    /hydroelectric/i,
    /carbon/i,
    /thousands/i,
    /world[- ]class/i,
    /enterprise[- ]grade/i,
    /highest efficiency/i,
  ]) {
    assert.doesNotMatch(landingCopy, claim)
  }

  assert.doesNotMatch(landingSource, /\+9|100%|20-35|35 W\/TH|28 W\/TH|20 W\/TH|10%/)
  assert.doesNotMatch(landingSource, /landing-stats-ribbon|\/terms|\/privacy/i)
  assert.match(appSource, /aria-label=\{user \? 'GoMining inicio' : 'PouwMiner inicio'\}/)
  assert.match(appSource, /user \? t\('replica\.footer_replica'\) : t\('replica\.footer_public'\)/)
  assert.match(catalogSource, /definition\('PouwMiner\.com'/)
  assert.match(appKitSource, /name: 'PouwMiner\.com'/)
  assert.match(appKitSource, /description: 'PouwMiner\.com wallet connection'/)
  assert.match(indexSource, /const publicShell = path === '\/';/)
  assert.doesNotMatch(indexSource, /publicShell = [^\n]*\/mining-calculator/)
  assert.doesNotMatch(indexSource, /publicShell = [^\n]*\/academy/)
  assert.match(indexSource, /document\.title = 'PouwMiner\.com · experiencia pública'/)
  assert.match(indexSource, /initial-brand-public.*PouwMiner/)
  assert.match(indexSource, /initial-brand-internal.*gomining/)
})

test('SCRUM-251 preserves account-first auth and keeps legal status neutral', () => {
  assert.match(authSource, /await login\(email, password\)/)
  assert.match(authSource, /await register\(email, password, referralCode\)/)
  assert.match(authSource, /await resetPassword\(email\)/)
  assert.doesNotMatch(authSource, /openAppKit|useAppKit/)
  assert.match(authSource, /role="dialog"/)
  assert.match(authSource, /aria-modal="true"/)
  assert.match(authSource, /event\.key === 'Escape'/)
  assert.match(authSource, /role="alert"/)
  assert.match(authSource, /aria-live="polite"/)
  assert.match(authSource, /t\('auth\.legal_pending'\)/)
  assert.doesNotMatch(authSource, /Terms of Service|Privacy Policy|Términos de Servicio|Política de Privacidad|GoMining/i)
  assert.doesNotMatch(subscriptionSource, /Terms of Service|Privacy Policy|Términos de Servicio|Política de Privacidad/i)
  assert.doesNotMatch(subscriptionSource, /\/terms|\/privacy|LegalModal/i)
  assert.match(es.auth.or_connect_wallet, /no inicia sesión/)
  assert.match(en.auth.or_connect_wallet, /does not sign you in/)
  assert.equal(es.auth.register_title, 'Crear cuenta en PouwMiner')
  assert.equal(en.auth.register_title, 'Create PouwMiner Account')
  assert.equal(es.replica.footer_public, 'PouwMiner.com · PEARL Research Lab')
  assert.equal(en.replica.footer_public, 'PouwMiner.com · PEARL Research Lab')
})
