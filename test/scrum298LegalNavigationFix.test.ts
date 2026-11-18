import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')
const sourceRef = '56863bf6ec0be8150c55aaf3b32df11beef5addd'
const legalModalPath = 'src/components/legal/LegalModal.tsx'
const legalModalSource = fs.readFileSync(path.join(projectRoot, legalModalPath), 'utf8')
const landingSource = fs.readFileSync(path.join(projectRoot, 'src/LandingPage.tsx'), 'utf8')
const navbarSource = fs.readFileSync(path.join(projectRoot, 'src/components/ui/Navbar.tsx'), 'utf8')
const footerSource = fs.readFileSync(path.join(projectRoot, 'src/components/sections/Footer.tsx'), 'utf8')

test('SCRUM-298 ports the source legal modal and wires all six existing entry points', () => {
  assert.equal(
    execFileSync('git', ['hash-object', legalModalPath], { cwd: projectRoot, encoding: 'utf8' }).trim(),
    '473103ab6026b1739dc52e23c64122538cd072c1',
  )
  assert.equal(
    execFileSync('git', ['rev-parse', sourceRef + ':' + legalModalPath], { cwd: projectRoot, encoding: 'utf8' }).trim(),
    '473103ab6026b1739dc52e23c64122538cd072c1',
  )
  assert.match(legalModalSource, /export type LegalMode = 'terms' \| 'security' \| null/)
  assert.match(legalModalSource, /mode === 'terms' \? 'Términos y Condiciones de Servicio'/)
  assert.match(legalModalSource, /'Políticas de Seguridad & Privacidad'/)
  assert.match(legalModalSource, /if \(e\.key === 'Escape'\) onClose\(\)/)
  assert.match(legalModalSource, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(legalModalSource, /document\.body\.style\.overflow = ''/)

  assert.match(landingSource, /import \{ LegalModal, type LegalMode \} from '\.\/components\/legal\/LegalModal'/)
  assert.match(landingSource, /const \[legalMode, setLegalMode\] = useState<LegalMode>\(null\)/)
  assert.match(landingSource, /const handleOpenLegal = \(mode: LegalMode = 'terms'\) =>/)
  assert.match(landingSource, /<Navbar onOpenAuth=\{handleOpenAuth\} onOpenLegal=\{handleOpenLegal\} \/>/)
  assert.match(landingSource, /<Footer onOpenLegal=\{handleOpenLegal\} \/>/)
  assert.equal((landingSource.match(/<LegalModal\b/g) ?? []).length, 1)
  assert.match(landingSource, /<LegalModal mode=\{legalMode\} onClose=\{\(\) => setLegalMode\(null\)\} \/>/)

  assert.equal((footerSource.match(/onOpenLegal\?\.\('terms'\)/g) ?? []).length, 2)
  assert.equal((footerSource.match(/onOpenLegal\?\.\('security'\)/g) ?? []).length, 2)
  assert.match(navbarSource, /<span>Términos<\/span>/)
  assert.match(navbarSource, /<span>Privacidad<\/span>/)
  assert.match(navbarSource, /onOpenLegal\?\.\('terms'\)/)
  assert.match(navbarSource, /onOpenLegal\?\.\('security'\)/)
})

test('SCRUM-298 adds no legal routes, duplicate modal, or protected-system delta', () => {
  assert.doesNotMatch(landingSource, /\/terms|\/privacy|TermsPage|PrivacyPage/)
  assert.equal(fs.existsSync(path.join(projectRoot, 'src/data/catalog.ts')), false)

  const changedPaths = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
  for (const protectedPath of [
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
  ]) {
    assert.equal(changedPaths.includes(protectedPath), false, protectedPath + ' must remain unchanged')
  }
})
