import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8')
const landingSource = fs.readFileSync(path.join(projectRoot, 'src/LandingPage.tsx'), 'utf8')
const styleSource = fs.readFileSync(path.join(projectRoot, 'src/styles.css'), 'utf8')
const es = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/locales/es.json'), 'utf8')) as Record<string, Record<string, string>>
const en = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/locales/en.json'), 'utf8')) as Record<string, Record<string, string>>

test('SCRUM-251 keeps landing scope bilingual and preserves current routes', () => {
  assert.match(landingSource, /id="vision-pearl"/)
  assert.match(landingSource, /id="quienes-somos"/)
  assert.match(landingSource, /id="roadmap"/)
  assert.match(landingSource, /openAuthModal\('register'\)/)
  assert.match(landingSource, /openAuthModal\('login'\)/)
  assert.match(landingSource, /to="\/mining-calculator"/)
  assert.match(appSource, /if \(user && location\.pathname === '\/'\)/)
  assert.match(appSource, /<LandingPage openAuthModal=\{openAuthModal\} \/>/)

  for (const key of [
    'vision_title', 'vision_1_desc', 'vision_2_desc', 'vision_3_desc',
    'disclosure', 'about_title', 'about_1_desc', 'about_2_desc', 'about_3_desc',
    'roadmap_title', 'roadmap_1_desc', 'roadmap_7_desc', 'roadmap_disclosure',
  ]) {
    assert.equal(typeof es.landing?.[key], 'string', `missing es landing.${key}`)
    assert.equal(typeof en.landing?.[key], 'string', `missing en landing.${key}`)
  }
  assert.match(es.landing.about_sub, /PouwMiner\.com es una rama operativa del equipo de PEARL Research Lab/)
  assert.match(en.landing.about_sub, /PouwMiner\.com is an operational branch of the PEARL Research Lab team/)
})

test('SCRUM-251 landing context has responsive, disclosure-aware styles', () => {
  assert.match(styleSource, /\.landing-anchor-section\s*\{[\s\S]*scroll-margin-top/)
  assert.match(styleSource, /\.landing-info-grid\s*\{[\s\S]*grid-template-columns/)
  assert.match(styleSource, /\.landing-roadmap\s*\{[\s\S]*display: grid/)
  assert.match(styleSource, /\.landing-disclosure\s*\{[\s\S]*border-left: 3px solid/)
})
