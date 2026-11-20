import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { calculateLandingEarnings } from '../src/landingEarnings.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')

test('SCRUM-309 Task 1: Preflight is encapsulated under .pouw-landing-root and fonts loaded in index.html', () => {
  const landingCss = fs.readFileSync(path.join(projectRoot, 'src/landing.css'), 'utf8')
  const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8')

  assert.match(landingCss, /\.pouw-landing-root\s+[\*,\s\w::]+\{[\s\S]*border:\s*0\s+solid|\.pouw-landing-root\s+[\*,\s\w::]+\{[\s\S]*border-style:\s*solid/)
  assert.match(landingCss, /\.pouw-landing-root\s+h1,[\s\S]*font-family:\s*inherit/)
  assert.match(landingCss, /\.pouw-landing-root\s+button\s*\{[\s\S]*background-color:\s*transparent/)
  assert.doesNotMatch(landingCss, /(^|\n)(html|body|\*|:root)\s*\{/)

  assert.match(indexHtml, /<link\s+rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"/)
  assert.match(indexHtml, /<link\s+rel="preconnect"\s+href="https:\/\/fonts\.gstatic\.com"\s+crossorigin/)
  assert.match(indexHtml, /fonts\.googleapis\.com\/css2\?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains\+Mono:wght@400;500/)

  assert.match(indexHtml, /data-public-shell="true"/)
  assert.match(indexHtml, /data-boot-skeleton="hidden"/)
})

test('SCRUM-309 Task 2: MembershipsSection restores 3-card layout, simulator, and variable-rewards disclaimer', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'src/components/sections/MembershipsSection.tsx'), 'utf8')
  assert.match(source, /Explorer/)
  assert.match(source, /Starter/)
  assert.match(source, /Pro VIP/)
  assert.match(source, /Simulador de Residuales de Pool/)
  assert.match(source, /poolVolumePearl/)
  assert.match(source, /no garantizan ROI fijo/i)
  assert.doesNotMatch(source, /SUPERFICIE ACTUAL/)
  assert.doesNotMatch(source, /La landing no sustituye/)
})

test('SCRUM-309 Task 3: StickyEarningsBar restores clean marketing indicators and removes git/catalog jargon', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'src/components/ui/StickyEarningsBar.tsx'), 'utf8')
  assert.match(source, /currentTh\s*=\s*120/)
  assert.match(source, /15 Días/)
  assert.match(source, /~\$\{usdPerDay\}\s*USD/)
  assert.doesNotMatch(source, /CATÁLOGO MAIN/)
  assert.doesNotMatch(source, /DATOS INFORMATIVOS/)
})

test('SCRUM-309 Task 4: PresaleSection consumes canonical presaleMinerPlans, restores countdown, and removes hardcoded catalog', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'src/components/sections/PresaleSection.tsx'), 'utf8')
  assert.match(source, /import\s*\{\s*presaleMinerPlans\s*\}\s*from\s*'\.\.\/\.\.\/minerCatalog'/)
  assert.doesNotMatch(source, /export const presalePlans\b/)
  assert.doesNotMatch(source, /const remainingUnits\b/)
  assert.match(source, /TIEMPO RESTANTE DE PREVENTA FASE 1/)
  assert.match(source, /LANZAMIENTO/)
  assert.doesNotMatch(source, /SLA 99\.98% Garantizado/)
  assert.doesNotMatch(source, /CATÁLOGO MAIN/)
  assert.doesNotMatch(source, /Esta página no inventa/)
})

test('SCRUM-309 Task 5: CalculatorSection consumes canonical presaleMinerPlans, fixes initial preset state, and keeps variable-rewards disclaimer', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'src/components/sections/CalculatorSection.tsx'), 'utf8')
  assert.match(source, /import\s*\{\s*presaleMinerPlans\s*\}\s*from\s*'\.\.\/\.\.\/minerCatalog'/)
  assert.match(source, /import\s*\{\s*calculateLandingEarnings\s*\}\s*from\s*'\.\.\/\.\.\/landingEarnings'/)
  assert.doesNotMatch(source, /export const calculatorPresalePlans\b/)
  assert.match(source, /useState<string>\(''\)/)
  assert.match(source, /Sin ROI garantizado/i)
  assert.doesNotMatch(source, /Garantía de cupo/)
  assert.doesNotMatch(source, /CATÁLOGO CANÓNICO/)
  assert.doesNotMatch(source, /DATOS DEL CATÁLOGO/)
})

test('SCRUM-309 Task 5b: calculateLandingEarnings produces continuous finite values for arbitrary slider inputs', () => {
  const benchmark = calculateLandingEarnings(120)
  assert.equal(Number(benchmark.usdDay.toFixed(2)), 2.3)
  assert.equal(Number(benchmark.pearlDay.toFixed(2)), 23.0)

  const arbitrary = calculateLandingEarnings(75.5)
  assert.ok(Number.isFinite(arbitrary.usdDay) && arbitrary.usdDay > 0)
  assert.ok(Number.isFinite(arbitrary.usdMonth) && arbitrary.usdMonth > arbitrary.usdDay)
  assert.ok(Number.isFinite(arbitrary.usdYear) && arbitrary.usdYear > arbitrary.usdMonth)
  assert.ok(Number.isFinite(arbitrary.pearlDay) && arbitrary.pearlDay > 0)

  const invalid = calculateLandingEarnings(Number.NaN)
  assert.equal(invalid.usdDay, 0)
  assert.equal(invalid.pearlDay, 0)

  const negative = calculateLandingEarnings(-10)
  assert.equal(negative.usdDay, 0)
})

test('SCRUM-309 Task 6: Zero occurrences of forbidden jargon across src/components/', () => {
  const componentsDir = path.join(projectRoot, 'src/components')
  const forbiddenPatterns = [
    'CATÁLOGO MAIN',
    'SUPERFICIE ACTUAL',
    'Esta página no inventa',
  ]

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        scanDir(fullPath)
      } else if (/\.(tsx?|jsx?|css|html)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf8')
        for (const pattern of forbiddenPatterns) {
          assert.equal(
            content.includes(pattern),
            false,
            `File ${path.relative(projectRoot, fullPath)} must not contain "${pattern}"`
          )
        }
      }
    }
  }

  scanDir(componentsDir)
})

test('SCRUM-309 Task 6: Zero delta across the 12 protected files', () => {
  const protectedFiles = [
    'src/AuthContext.tsx',
    'src/AuthModal.tsx',
    'src/firebase.ts',
    'src/appkitConfig.ts',
    'src/WalletPanel.tsx',
    'src/WalletPaymentCheckout.tsx',
    'src/walletSession.ts',
    'src/minerPurchaseFlow.ts',
    'src/catalogClient.ts',
    'src/minerCatalog.ts',
    'src/SubscriptionsPage.tsx',
    'src/main.tsx',
  ]

  for (const relPath of protectedFiles) {
    const baselineBlob = execFileSync('git', ['rev-parse', `b73d992e71b3902798ff6530c259058229ddecd6:${relPath}`], { cwd: projectRoot, encoding: 'utf8' }).trim()
    const currentBlob = execFileSync('git', ['hash-object', relPath], { cwd: projectRoot, encoding: 'utf8' }).trim()
    assert.equal(currentBlob, baselineBlob, `Protected file ${relPath} must not be modified`)
  }
})
