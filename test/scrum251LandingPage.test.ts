import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8')
const landingSource = fs.readFileSync(path.join(projectRoot, 'src/LandingPage.tsx'), 'utf8')
const styleSource = fs.readFileSync(path.join(projectRoot, 'src/styles.css'), 'utf8')
const landingStyleSource = fs.readFileSync(path.join(projectRoot, 'src/landing.css'), 'utf8')
const lenisSource = fs.readFileSync(path.join(projectRoot, 'src/hooks/useLenisScroll.ts'), 'utf8')
const tailwindSource = fs.readFileSync(path.join(projectRoot, 'tailwind.config.js'), 'utf8')
const es = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/locales/es.json'), 'utf8')) as Record<string, Record<string, string>>
const en = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/locales/en.json'), 'utf8')) as Record<string, Record<string, string>>

test('SCRUM-251 keeps landing scope bilingual and preserves current routes', () => {
  assert.match(landingSource, /id="vision-pearl"/)
  assert.match(landingSource, /id="quienes-somos"/)
  assert.match(landingSource, /id="roadmap"/)
  assert.match(landingSource, /openAuthModal\('register'\)/)
  assert.match(landingSource, /openAuthModal\('login'\)/)
  assert.match(landingSource, /href="#calculadora"/)
  assert.doesNotMatch(landingSource, /to="\/mining-calculator"/)
  assert.match(appSource, /const authRedirect = getAuthRouteRedirect\(location\.pathname, isAuthenticated\)/)
  assert.match(appSource, /const isSourceLanding = location\.pathname === '\/'/)
  assert.match(appSource, /!isSourceLanding && \(\s*<header className="topbar">/)
  assert.match(appSource, /className=\{isSourceLanding \? 'source-landing-page' : 'page-wrap'\}/)
  assert.match(appSource, /!isSourceLanding && \(\s*<footer className="page-footer">/)
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

test('SCRUM-251 keeps Landing source parity and isolates its CSS pipeline', () => {
  const sourceRef = '56863bf6ec0be8150c55aaf3b32df11beef5addd'
  const exactSourceFiles = [
    'postcss.config.js',
    'src/components/sections/AboutSection.tsx',
    'src/components/sections/HeroSection.tsx',
    'src/components/sections/HowItWorksSection.tsx',
    'src/components/sections/MiningAiSection.tsx',
    'src/components/sections/ProductSection.tsx',
    'src/components/sections/TransparencySection.tsx',
    'src/components/ui/IntroPreloader.tsx',
    'src/components/ui/PowMinerLogo.tsx',
    'src/components/ui/ScrollProgressBar.tsx',
    'src/components/ui/SideScrollTracker.tsx',
    'src/hooks/useMagneticButton.ts',
    'src/hooks/useScrollProgress.ts',
  ]

  for (const relativePath of exactSourceFiles) {
    const sourceBlob = execFileSync('git', ['rev-parse', `${sourceRef}:${relativePath}`], { cwd: projectRoot, encoding: 'utf8' }).trim()
    const localBlob = execFileSync('git', ['hash-object', relativePath], { cwd: projectRoot, encoding: 'utf8' }).trim()
    assert.equal(localBlob, sourceBlob, `${relativePath} must match the source blob exactly`)
    const source = execFileSync('git', ['show', `${sourceRef}:${relativePath}`], { cwd: projectRoot, encoding: 'utf8' })
    const local = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
    assert.equal(local.replaceAll('\r\n', '\n'), source.replaceAll('\r\n', '\n'), `${relativePath} must remain source-exact`)
  }

  const assetNames = [
    'battle-miner-cards-3d.jpg', 'favicon.svg', 'pearl-coin-3d.png',
    'pouwminer-cloud-mining-preloader.jpg', 'pouwminer-neural-chip.jpg',
    'pouwminer-titan-exploded.jpg', 'pouwminer-titan-hero.jpg',
    'powminer-titan-exploded-transparent.png', 'powminer-titan-hero-transparent.png',
    'sol-coin-3d.png', 'unilevel-leader-empowerment.jpg', 'usdc-coin-3d.png',
    'usdt-coin-3d.png', 'web3-cloud-mining-isometric.jpg',
  ]
  for (const assetName of assetNames) {
    const relativePath = `public/assets/${assetName}`
    const sourceBlob = execFileSync('git', ['rev-parse', `${sourceRef}:${relativePath}`], { cwd: projectRoot, encoding: 'utf8' }).trim()
    const localBlob = execFileSync('git', ['hash-object', relativePath], { cwd: projectRoot, encoding: 'utf8' }).trim()
    assert.equal(localBlob, sourceBlob, `${relativePath} must match the Landing source blob`)
  }

  assert.equal(fs.existsSync(path.join(projectRoot, 'src/data/catalog.ts')), false)
  assert.equal(fs.existsSync(path.join(projectRoot, 'src/components/auth/AuthModal.tsx')), false)
  const legalModalPath = 'src/components/legal/LegalModal.tsx'
  const legalModalSourceRef = '56863bf6ec0be8150c55aaf3b32df11beef5addd'
  assert.equal(
    execFileSync('git', ['hash-object', legalModalPath], { cwd: projectRoot, encoding: 'utf8' }).trim(),
    execFileSync('git', ['rev-parse', legalModalSourceRef + ':' + legalModalPath], { cwd: projectRoot, encoding: 'utf8' }).trim(),
    'LegalModal.tsx must match the Landing source blob exactly',
  )
  assert.doesNotMatch(landingStyleSource, /(^|\n)(html|body|\*|:root)\s*\{/)
  assert.match(landingStyleSource, /\.pouw-landing-root/)
  assert.match(landingStyleSource, /\.app-shell-source-landing \.workspace \{ margin-left: 0; \}/)
  assert.match(landingStyleSource, /\.app-shell-source-landing \.source-landing-page \{ width: 100%; margin: 0; padding: 0; \}/)
  assert.doesNotMatch(landingStyleSource, /(^|\n)\.lenis\b/)
  assert.match(landingStyleSource, /html\.lenis:has\(\.pouw-landing-root\)/)
  assert.match(lenisSource, /lenis\.off\('scroll', handleScroll\)/)
  assert.match(lenisSource, /gsap\.ticker\.remove\(handleTick\)/)
  assert.match(tailwindSource, /important:\s*['"]\.pouw-landing-root['"]/
  )
  assert.match(tailwindSource, /preflight:\s*false/)
})
