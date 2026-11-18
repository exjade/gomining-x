import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { getAuthRouteRedirect, isPublicAppRoute } from '../src/authRoutePolicy.ts'
import { routeAliases, screens } from '../src/catalog.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8')
const landingSource = fs.readFileSync(path.join(projectRoot, 'src/LandingPage.tsx'), 'utf8')
const indexSource = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8')

test('SCRUM-299 classifies only root / as public across every existing screen', () => {
  for (const pathname of Object.keys(screens)) {
    const expectedPublic = pathname === '/'
    assert.equal(isPublicAppRoute(pathname), expectedPublic, pathname)
    assert.equal(getAuthRouteRedirect(pathname, false), expectedPublic ? null : '/', pathname)
    assert.equal(getAuthRouteRedirect(pathname, true), pathname === '/' ? '/home' : null, pathname)
  }
  assert.equal(isPublicAppRoute('/?ref=abc#hero'), true)
  assert.equal(isPublicAppRoute('/Mining-Calculator/'), false)
  assert.equal(isPublicAppRoute('/Academy/Course'), false)
  assert.equal(getAuthRouteRedirect('/?ref=abc#hero', false), null)
  assert.equal(getAuthRouteRedirect('/?ref=abc#hero', true), '/home')
  assert.equal(getAuthRouteRedirect('//', false), '/')
  assert.equal(getAuthRouteRedirect('/Mining-Calculator/', false), '/')
  assert.equal(getAuthRouteRedirect('/Academy/', false), '/')
})

test('SCRUM-299 protects all aliases and canonical destinations when unauthenticated', () => {
  for (const [alias, target] of Object.entries(routeAliases)) {
    const canonicalPath = target.split('?')[0]
    assert.equal(isPublicAppRoute(alias), false, alias)
    assert.equal(isPublicAppRoute(canonicalPath), false, `${alias} -> ${target}`)
    assert.equal(getAuthRouteRedirect(alias, false), '/', alias)
    assert.equal(getAuthRouteRedirect(canonicalPath, false), '/', `${alias} -> ${target}`)
    assert.equal(getAuthRouteRedirect(canonicalPath, true), null, `${alias} -> ${target}`)
  }

  for (const pathname of [
    '/mining-calculator',
    '/calculator',
    '/operator-economics',
    '/academy',
    '/academy/extra',
    '/nft-miners/123',
    '/miners/123/customize',
    '/finance/unknown',
    '/unknown',
  ]) {
    assert.equal(getAuthRouteRedirect(pathname, false), '/', pathname)
    assert.equal(getAuthRouteRedirect(pathname, true), null, pathname)
  }
})

test('SCRUM-299 keeps the auth-state table and loading guard in App', () => {
  const authStates = [
    ['no user', null],
    ['anonymous', { isAnonymous: true }],
    ['authenticated', { isAnonymous: false }],
  ] as const

  for (const [label, user] of authStates) {
    const isAuthenticated = Boolean(user && !user.isAnonymous)
    assert.equal(getAuthRouteRedirect('/', isAuthenticated), isAuthenticated ? '/home' : null, label)
    assert.equal(getAuthRouteRedirect('/home', isAuthenticated), isAuthenticated ? null : '/', label)
  }

  assert.match(appSource, /const isAuthenticated = Boolean\(user && !user\.isAnonymous\)/)
  assert.match(appSource, /const authRedirect = getAuthRouteRedirect\(location\.pathname, isAuthenticated\)/)
  assert.match(appSource, /const query = authRedirect === '\/home' \? location\.search : ''/)
  assert.doesNotMatch(appSource, /if \(user && location\.pathname === '\/'\)/)

  const loadingIndex = appSource.indexOf('if (loading) {')
  const guardIndex = appSource.indexOf('const authRedirect = getAuthRouteRedirect')
  const aliasIndex = appSource.indexOf('const aliasTarget = routeAliases[cleanPath]')
  const operatorEconomicsIndex = appSource.indexOf("if (location.pathname === '/operator-economics')")
  assert.ok(loadingIndex >= 0 && loadingIndex < guardIndex, 'loading check must precede authRedirect')
  assert.ok(guardIndex < aliasIndex, 'authRedirect must precede routeAliases')
  assert.ok(guardIndex < operatorEconomicsIndex, 'authRedirect must precede /operator-economics redirect')

  const loadingBlock = appSource.slice(loadingIndex, guardIndex)
  assert.match(loadingBlock, /if \(isPublicAppRoute\(location\.pathname\) \|\| !isAuthenticated\)/)
  assert.match(loadingBlock, /className="min-h-screen bg-\[#050505\]"[\s\S]*?style=\{\{ minHeight: '100vh', background: '#050505' \}\}[\s\S]*?aria-busy="true"/)
  assert.match(loadingBlock, /return <AppRouteSkeleton pathname=\{location\.pathname\} search=\{location\.search\} \/>/)
  assert.doesNotMatch(appSource, /<NavLink to="\/mining-calculator"/)
  assert.doesNotMatch(appSource, /<NavLink to="\/academy"/)
  assert.match(appSource, /if \(location\.pathname === '\/operator-economics'\) return <Navigate to="\/mining-calculator" replace \/>/)
  assert.match(landingSource, /document\.documentElement\.dataset\.publicShell = 'true'/)
  assert.match(landingSource, /document\.title = 'PouwMiner\.com · experiencia pública'/)
})

test('SCRUM-299 gates topbar wallet buttons behind isAuthenticated before invoking AppKit', () => {
  const connectedButtonMatch = appSource.match(
    /className="wallet-topbar-button wallet-topbar-connected"[\s\S]*?onClick=\{\(\) => \{([\s\S]*?)\}\}\s*aria-label=\{`Wallet conectada:/,
  )
  assert.ok(connectedButtonMatch, 'connected topbar wallet button handler must exist')
  const connectedHandler = connectedButtonMatch[1]
  const authGuardPattern = /if \(!isAuthenticated\) \{\s*openAuthModal\('login'\)\s*return\s*\}/
  const connectedGuardMatch = authGuardPattern.exec(connectedHandler)
  const connectedAppKitIndex = connectedHandler.indexOf("openAppKit({ view: 'Account' })")
  const connectedNavigateIndex = connectedHandler.indexOf("navigate('/gmt-wallets')")
  assert.ok(connectedGuardMatch, "connected button must guard !isAuthenticated with openAuthModal('login') and return")
  assert.ok(connectedAppKitIndex > connectedGuardMatch.index, "auth guard must precede openAppKit({ view: 'Account' })")
  assert.ok(connectedNavigateIndex > connectedGuardMatch.index, "auth guard must precede navigate('/gmt-wallets')")

  const disconnectedButtonMatch = appSource.match(
    /className="wallet-topbar-button"\s*onClick=\{\(\) => \{([\s\S]*?)\}\}\s*aria-label="Conectar una wallet"/,
  )
  assert.ok(disconnectedButtonMatch, 'disconnected topbar wallet button handler must exist')
  const disconnectedHandler = disconnectedButtonMatch[1]
  const disconnectedGuardMatch = authGuardPattern.exec(disconnectedHandler)
  const disconnectedAppKitIndex = disconnectedHandler.indexOf('openAppKit()')
  assert.ok(disconnectedGuardMatch, "disconnected button must guard !isAuthenticated with openAuthModal('login') and return")
  assert.ok(disconnectedAppKitIndex > disconnectedGuardMatch.index, 'auth guard must precede openAppKit()')
})

test('SCRUM-299 suppresses initial-loading skeleton in index.html on / and when unauthenticated', () => {
  assert.match(indexSource, /const publicShell = path === '\/';/)
  assert.doesNotMatch(indexSource, /publicShell = [^\n]*\/mining-calculator/)
  assert.doesNotMatch(indexSource, /publicShell = [^\n]*\/academy/)
  assert.match(indexSource, /html\[data-public-shell="true"\] \.initial-topbar[\s\S]*?display:none/)
  assert.match(indexSource, /html\[data-boot-skeleton="hidden"\] \.initial-status[\s\S]*?display:none/)
  assert.match(indexSource, /html\[data-boot-skeleton="hidden"\] \.ui-skeleton-app\{display:none\}/)

  const inlineScriptMatch = indexSource.match(/<script>\s*(\(\(\) => \{[\s\S]*?\}\)\(\);)\s*<\/script>/)
  assert.ok(inlineScriptMatch, 'index.html inline boot script must exist')

  const runBootScript = (
    pathname: string,
    localEntries: Record<string, string> = {},
    sessionEntries: Record<string, string> = {},
  ) => {
    const makeStorage = (entries: Record<string, string>) => {
      const keys = Object.keys(entries)
      return {
        length: keys.length,
        key: (i: number) => keys[i] ?? null,
        getItem: (k: string) => entries[k] ?? null,
      }
    }
    const dataset: Record<string, string> = {}
    const metaAttributes: Record<string, string> = {}
    const context = {
      window: {
        location: { pathname, search: '' },
        localStorage: makeStorage(localEntries),
        sessionStorage: makeStorage(sessionEntries),
      },
      URLSearchParams,
      document: {
        title: 'GoMining · réplica local',
        documentElement: { dataset },
        getElementById: () => ({
          setAttribute: (name: string, val: string) => {
            metaAttributes[name] = val
          },
        }),
      },
    }
    vm.runInNewContext(inlineScriptMatch[1], context)
    return { dataset, title: context.document.title, metaAttributes }
  }

  const rootUnauth = runBootScript('/')
  assert.equal(rootUnauth.dataset.publicShell, 'true')
  assert.equal(rootUnauth.dataset.bootSkeleton, 'hidden')

  const calcUnauth = runBootScript('/mining-calculator')
  assert.equal(calcUnauth.dataset.publicShell, 'false')
  assert.equal(calcUnauth.dataset.bootSkeleton, 'hidden')

  const academyAnon = runBootScript('/academy', {
    'firebase:authUser:test:[DEFAULT]': JSON.stringify({ uid: 'anon-1', isAnonymous: true }),
  })
  assert.equal(academyAnon.dataset.publicShell, 'false')
  assert.equal(academyAnon.dataset.bootSkeleton, 'hidden')

  const homeAuth = runBootScript('/home', {
    'firebase:authUser:test:[DEFAULT]': JSON.stringify({ uid: 'user-1', isAnonymous: false }),
  })
  assert.equal(homeAuth.dataset.publicShell, 'false')
  assert.equal(homeAuth.dataset.bootSkeleton, 'visible')

  const homeSessionAuth = runBootScript(
    '/home',
    {},
    { 'firebase:authUser:test:[DEFAULT]': JSON.stringify({ uid: 'user-2', isAnonymous: false }) },
  )
  assert.equal(homeSessionAuth.dataset.publicShell, 'false')
  assert.equal(homeSessionAuth.dataset.bootSkeleton, 'visible')

  const rootAuth = runBootScript('/', {
    'firebase:authUser:test:[DEFAULT]': JSON.stringify({ uid: 'user-1', isAnonymous: false }),
  })
  assert.equal(rootAuth.dataset.publicShell, 'true')
  assert.equal(rootAuth.dataset.bootSkeleton, 'hidden')
})
