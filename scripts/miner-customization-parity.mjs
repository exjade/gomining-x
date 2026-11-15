import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const worktreeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = resolve(worktreeRoot, '..', '..')
const specPath = join(worktreeRoot, 'UI-UX', 'Mineros-customizables', 'parity-spec.json')
const ITERATION = 2
const evidenceRoot = join(worktreeRoot, 'UI-UX', 'Mineros-customizables', 'evidence', `iteration-${ITERATION}`)
assert.equal(basename(evidenceRoot), `iteration-${ITERATION}`, 'Evidence output must target the current iteration directory.')
const spec = JSON.parse(readFileSync(specPath, 'utf8'))
const blockedRequests = []
const routeViolations = []
const processWrites = []
const fetchHandlerPromises = new Set()
const renderReadinessRuntimeExceptions = []
const renderReadinessConsoleErrors = []
const renderReadinessLocalLoadFailures = []
let renderReadinessDiagnosticsEnabled = false
const fetchLifecycle = {
  handlersProcessed: 0,
  localReadOnlyContinued: 0,
  externalRequestsBlocked: 0,
  nonReadOnlyRequestsBlocked: 0,
  fetchLifecycleRaces: [],
  unsafeInterceptionFailures: [],
}

assert.equal(spec.routePrefix, '/nft-miners')
assert.deepEqual(spec.portRange, [5190, 5199])

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Users\\Trabajo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\Trabajo\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Users\\Trabajo\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate))
}

function listenOn(port) {
  return new Promise((resolveListen, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => resolveListen(server))
  })
}

async function getFreePortInRange() {
  for (let port = spec.portRange[0]; port <= spec.portRange[1]; port += 1) {
    try {
      const server = await listenOn(port)
      await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()))
      return port
    } catch {
      // Continue only within the task-authorized application port range.
    }
  }
  throw new Error('No free application port in 5190–5199.')
}

async function getEphemeralPort() {
  const server = await listenOn(0)
  const { port } = server.address()
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()))
  assert.ok(port < 5190 || port > 5199, `CDP port ${port} overlaps the app port range.`)
  return port
}

function isMinerRoute(pathname) {
  return pathname === '/nft-miners' || pathname.startsWith('/nft-miners/')
}

function assertMinerRoute(pathname, source) {
  if (!isMinerRoute(pathname)) {
    routeViolations.push({ pathname, source })
    throw new Error(`Navigation outside /nft-miners blocked: ${pathname}`)
  }
}

class CDPClient {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.sequence = 0
    this.pending = new Map()
    this.listeners = new Map()
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
        return
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params)
    })
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set()
    listeners.add(listener)
    this.listeners.set(method, listeners)
  }

  waitFor(method, timeoutMs = 30000) {
    return new Promise((resolveWait, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(listener)
        reject(new Error(`Timed out waiting for CDP ${method}.`))
      }, timeoutMs)
      const listener = (value) => {
        clearTimeout(timer)
        listeners.delete(listener)
        resolveWait(value)
      }
      const listeners = this.listeners.get(method) ?? new Set()
      listeners.add(listener)
      this.listeners.set(method, listeners)
    })
  }

  async send(method, params = {}, timeoutMs = 30000) {
    await this.ready
    const id = ++this.sequence
    return new Promise((resolveSend, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timed out waiting for CDP ${method}.`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolveSend, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close()
  }
}

function safeRequestLabel(rawUrl) {
  const url = new URL(rawUrl)
  return `${url.origin}${url.pathname}`
}

async function handlePausedRequest(cdp, request, appPort) {
  fetchLifecycle.handlersProcessed += 1
  const method = request.request.method
  let url
  try {
    url = new URL(request.request.url)
  } catch (error) {
    fetchLifecycle.unsafeInterceptionFailures.push({ method, url: '<invalid-url>', error: error.message })
    return
  }
  const localReadOnly = url.origin === `http://127.0.0.1:${appPort}` && (method === 'GET' || method === 'HEAD')
  const label = safeRequestLabel(request.request.url)
  const blocked = !localReadOnly
  if (blocked) {
    const reason = url.origin !== `http://127.0.0.1:${appPort}` ? 'external origin' : 'non-read-only method'
    blockedRequests.push({ method, url: label, reason })
    if (url.origin !== `http://127.0.0.1:${appPort}`) fetchLifecycle.externalRequestsBlocked += 1
    if (method !== 'GET' && method !== 'HEAD') {
      processWrites.push(label)
      fetchLifecycle.nonReadOnlyRequestsBlocked += 1
    }
  }

  try {
    if (localReadOnly) {
      await cdp.send('Fetch.continueRequest', { requestId: request.requestId })
    } else {
      await cdp.send('Fetch.failRequest', { requestId: request.requestId, errorReason: 'BlockedByClient' })
    }
    if (localReadOnly) fetchLifecycle.localReadOnlyContinued += 1
  } catch (error) {
    if (localReadOnly && /Invalid InterceptionId/i.test(error.message)) {
      fetchLifecycle.fetchLifecycleRaces.push({ method, url: label, reason: error.message })
      return
    }
    fetchLifecycle.unsafeInterceptionFailures.push({ method, url: label, blocked, error: error.message })
  }
}

function trackPausedRequest(cdp, request, appPort) {
  const task = handlePausedRequest(cdp, request, appPort)
  fetchHandlerPromises.add(task)
  void task.then(() => fetchHandlerPromises.delete(task), (error) => {
    fetchLifecycle.unsafeInterceptionFailures.push({ method: request.request.method, url: '<unhandled-handler-error>', error: error.message })
    fetchHandlerPromises.delete(task)
  })
}

async function drainFetchHandlers() {
  while (fetchHandlerPromises.size > 0) await Promise.all([...fetchHandlerPromises])
}

async function waitForHttp(url, processRef, getDiagnostics) {
  const start = Date.now()
  while (Date.now() - start < 30000) {
    if (processRef.exitCode !== null) throw new Error(`Vite exited with code ${processRef.exitCode}. ${getDiagnostics()}`)
    try {
      const response = await fetch(url)
      if (response.ok) return new URL(response.url).origin
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150))
  }
  throw new Error(`Vite did not become ready on the selected 519x port. ${getDiagnostics()}`)
}

async function waitForLoad(cdp) {
  const loaded = cdp.waitFor('Page.loadEventFired')
  await loaded
  await cdp.send('Runtime.evaluate', {
    expression: 'document.fonts ? document.fonts.ready.then(() => true) : true',
    awaitPromise: true,
    returnByValue: true,
  })
}

async function evaluate(cdp, expression, timeoutMs = 30000) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs)
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Page evaluation failed.')
  return result.result?.value
}

class VisualReadinessError extends Error {
  constructor(message, diagnostics) {
    super(message)
    this.name = 'VisualReadinessError'
    this.diagnostics = diagnostics
  }
}

async function waitForVisualStability(cdp, selectors, description, timeoutMs = 10000) {
  const result = await evaluate(cdp, `new Promise((resolve) => {
    const selectors = ${JSON.stringify(selectors)}
    const deadline = performance.now() + ${timeoutMs}
    let previous = null
    let stableSamples = 0
    let last = null
    const inspect = () => {
      const elements = selectors.map((selector) => {
        const element = document.querySelector(selector)
        if (!element) return { selector, present: false }
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return { selector, present: true, visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0, rect: [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100) }
      })
      return { elements, key: JSON.stringify(elements) }
    }
    const poll = () => {
      last = inspect()
      const visible = last.elements.length > 0 && last.elements.every((element) => element.present && element.visible)
      stableSamples = visible && last.key === previous ? stableSamples + 1 : visible ? 1 : 0
      previous = last.key
      if (stableSamples >= 2) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const final = inspect()
          if (final.key === last.key && final.elements.every((element) => element.present && element.visible)) resolve({ stable: true, final: final.elements })
          else { previous = null; stableSamples = 0; setTimeout(poll, 50) }
        }))
        return
      }
      if (performance.now() >= deadline) { resolve({ stable: false, last: last.elements }); return }
      setTimeout(poll, 50)
    }
    poll()
  })`)
  if (!result.stable) throw new VisualReadinessError(`Timed out waiting for stable geometry: ${description}.`, result.last)
}

async function waitForPageCondition(cdp, condition, description, stableSelectors = [], timeoutMs = 10000) {
  const result = await evaluate(cdp, `new Promise((resolve) => {
    const deadline = performance.now() + ${timeoutMs}
    const check = () => {
      let matched = false
      try { matched = Boolean(${condition}) } catch {}
      if (matched) { resolve(true); return }
      if (performance.now() >= deadline) { resolve(false); return }
      setTimeout(check, 50)
    }
    check()
  })`)
  if (!result) throw new VisualReadinessError(`Timed out waiting for ${description}.`, { condition: description, pathname: await evaluate(cdp, 'location.pathname') })
  if (stableSelectors.length) await waitForVisualStability(cdp, stableSelectors, description)
}

async function waitForRouteReady(cdp, scenario) {
  const timeoutMs = 20000
  const result = await evaluate(cdp, `new Promise((resolve) => {
    const expectedPath = ${JSON.stringify(scenario.route)}
    const selectors = ${JSON.stringify(scenario.readySelectors ?? [])}
    const deadline = performance.now() + ${timeoutMs}
    let previousGeometry = null
    let stableSamples = 0
    let last = null
    const inspect = () => {
      const elements = selectors.map((selector) => {
        const element = document.querySelector(selector)
        if (!element) return { selector, present: false }
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return { selector, present: true, visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0, rect: [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100) }
      })
      return {
        pathname: location.pathname,
        readyState: document.readyState,
        skeletonPresent: Boolean(document.querySelector('.ui-skeleton-app')),
        bootErrorPresent: Boolean(document.querySelector('.app-boot-error')),
        visibleErrorText: document.querySelector('.app-boot-error')?.innerText ?? null,
        selectors: elements,
        geometryKey: JSON.stringify(elements.map(({ selector, present, rect }) => ({ selector, present, rect }))),
      }
    }
    const fontsReady = () => document.fonts?.ready ?? Promise.resolve()
    const poll = () => {
      last = inspect()
      const selectorsReady = last.selectors.length > 0 && last.selectors.every((element) => element.present && element.visible)
      const documentReady = last.readyState === 'interactive' || last.readyState === 'complete'
      const routeReady = last.pathname === expectedPath && documentReady && !last.skeletonPresent && !last.bootErrorPresent && selectorsReady
      stableSamples = routeReady && last.geometryKey === previousGeometry ? stableSamples + 1 : routeReady ? 1 : 0
      previousGeometry = last.geometryKey
      if (stableSamples >= 2) {
        const remaining = Math.max(0, deadline - performance.now())
        Promise.race([fontsReady().then(() => true), new Promise((resolveFonts) => setTimeout(() => resolveFonts(false), remaining))]).then((fontsLoaded) => {
          if (!fontsLoaded) { resolve({ ready: false, diagnostics: { ...inspect(), timeoutMs: ${timeoutMs}, reason: 'document.fonts.ready timed out' } }); return }
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const final = inspect()
            const finalReady = final.pathname === expectedPath && (final.readyState === 'interactive' || final.readyState === 'complete') && !final.skeletonPresent && !final.bootErrorPresent && final.selectors.length > 0 && final.selectors.every((element) => element.present && element.visible)
            if (finalReady && final.geometryKey === last.geometryKey) resolve({ ready: true, diagnostics: final })
            else { previousGeometry = null; stableSamples = 0; setTimeout(poll, 50) }
          }))
        }, (error) => resolve({ ready: false, diagnostics: { ...inspect(), timeoutMs: ${timeoutMs}, reason: error.message } }))
        return
      }
      if (performance.now() >= deadline) { resolve({ ready: false, diagnostics: { ...last, timeoutMs: ${timeoutMs}, reason: 'route readiness timed out' } }); return }
      setTimeout(poll, 50)
    }
    poll()
  })`)
  if (!result.ready) throw new VisualReadinessError(`Route ${scenario.route} did not become ready.`, result.diagnostics)
  assert.equal(result.diagnostics.pathname, scenario.route)
  assertMinerRoute(result.diagnostics.pathname, 'route readiness')
}

async function writeReadinessFailure(cdp, scenario, error, outputDir) {
  mkdirSync(outputDir, { recursive: true })
  await drainFetchHandlers()
  const loadingResult = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false, omitBackground: false })
  const loadingPath = join(outputDir, 'loading-timeout.png')
  writeFileSync(loadingPath, Buffer.from(loadingResult.data, 'base64'))
  const pathname = await evaluate(cdp, 'location.pathname')
  assertMinerRoute(pathname, `readiness failure ${scenario.id}`)
  const renderDiagnostics = renderReadinessDiagnosticsEnabled ? {
    root: await evaluate(cdp, `(() => { const root = document.querySelector('#root'); return { present: Boolean(root), childCount: root?.childElementCount ?? 0, innerHTML: root?.innerHTML.slice(0, 4000) ?? null } })()`),
    bodyText: await evaluate(cdp, `document.body.innerText.slice(0, 2000)`),
    parityFixture: await evaluate(cdp, 'new URLSearchParams(location.search).get("parityFixture")'),
    moduleScriptSources: await evaluate(cdp, `Array.from(document.querySelectorAll('script[type="module"][src]')).map((script) => script.src)`),
    runtimeExceptions: renderReadinessRuntimeExceptions,
    localResourceLoadFailures: renderReadinessLocalLoadFailures,
    errorConsoleMessages: renderReadinessConsoleErrors,
  } : null
  const report = {
    id: scenario.id,
    status: 'FAIL_RENDER_NOT_READY',
    reason: error.message,
    route: scenario.route,
    currentPath: pathname,
    fixture: scenario.fixture,
    readiness: error.diagnostics,
    missingSelectors: (error.diagnostics?.selectors ?? []).filter((selector) => !selector.present || !selector.visible).map(({ selector }) => selector),
    visibleErrorText: error.diagnostics?.visibleErrorText ?? null,
    ...(renderDiagnostics ? { renderDiagnostics } : {}),
    loadingScreenshot: 'loading-timeout.png',
    fetchLifecycle: {
      handlersProcessed: fetchLifecycle.handlersProcessed,
      fetchLifecycleRaces: fetchLifecycle.fetchLifecycleRaces,
      unsafeInterceptionFailures: fetchLifecycle.unsafeInterceptionFailures,
    },
  }
  writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(join(outputDir, 'report.md'), `# ${scenario.id}\n\n**FAIL_RENDER_NOT_READY**\n\n${error.message}\n\n- Path: ${pathname}\n- Missing selectors: ${JSON.stringify(report.missingSelectors)}\n- Visible error: ${report.visibleErrorText ?? 'none'}\n- Screenshot: ${loadingPath}\n`)
  return report
}

async function navigate(cdp, url, expectedPort) {
  const parsed = new URL(url)
  assert.equal(parsed.origin, `http://127.0.0.1:${expectedPort}`)
  assertMinerRoute(parsed.pathname, 'Page.navigate')
  const loaded = cdp.waitFor('Page.loadEventFired')
  const result = await cdp.send('Page.navigate', { url })
  assert.equal(result.errorText, undefined, result.errorText)
  await loaded
  await evaluate(cdp, 'document.fonts ? document.fonts.ready.then(() => true) : true')
  assertMinerRoute(await evaluate(cdp, 'location.pathname'), 'after Page.navigate')
}

async function seedAndNavigate(cdp, baseUrl, port, scenario, viewport) {
  assertMinerRoute(scenario.route, 'before scenario navigation')
  await drainFetchHandlers()
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor,
    mobile: false,
  })
  const origin = new URL(baseUrl).origin
  const source = `if (location.origin === ${JSON.stringify(origin)} && (location.pathname === '/nft-miners' || location.pathname.startsWith('/nft-miners/'))) { localStorage.setItem('gomining_theme', 'dark'); localStorage.setItem('gomining_lang', 'en'); }`
  const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source })
  try {
    await navigate(cdp, `${origin}${scenario.route}?parityFixture=${encodeURIComponent(scenario.fixture)}`, port)
    await waitForRouteReady(cdp, scenario)
  } finally {
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  }
  return origin
}

async function clickSelector(cdp, selector) {
  const geometry = await evaluate(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null; const rect = element.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height }; })()`)
  assert.ok(geometry && geometry.width > 0 && geometry.height > 0, `Missing visible selector: ${selector}`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geometry.x, y: geometry.y })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geometry.x, y: geometry.y, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geometry.x, y: geometry.y, button: 'left', clickCount: 1 })
  await evaluate(cdp, 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  assertMinerRoute(await evaluate(cdp, 'location.pathname'), `after click ${selector}`)
}

async function pressKey(cdp, key, windowsVirtualKeyCode, modifiers = 0) {
  const event = { key, code: key, windowsVirtualKeyCode, ...(modifiers ? { modifiers } : {}) }
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...event })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

async function prepareVisualState(cdp, scenario) {
  if (scenario.route.endsWith('/customize') && scenario.state.tab) {
    const selector = `#pwm-category-tab-${scenario.state.tab}`
    await clickSelector(cdp, selector)
    await waitForPageCondition(cdp, `document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-selected') === 'true'`, `customizer tab ${scenario.state.tab}`, scenario.readySelectors)
  } else if (scenario.state.tab && scenario.route.startsWith('/nft-miners/')) {
    const selector = `#pwm-detail-tab-${scenario.state.tab}`
    const tab = await evaluate(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)
    if (tab) {
      await clickSelector(cdp, selector)
      await waitForPageCondition(cdp, `document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-selected') === 'true'`, `detail tab ${scenario.state.tab}`, scenario.readySelectors)
    }
  }
  if (scenario.state.modal === 'bronze') {
    await clickSelector(cdp, 'button.pwm-option[aria-disabled="true"]')
    await waitForPageCondition(cdp, `Boolean(document.querySelector('[role="dialog"]'))`, 'locked trait dialog', ['.pwm-customizer-column', '[role="dialog"]'])
  }
  if (scenario.state.page === 2) {
    const pageButton = await evaluate(cdp, 'Array.from(document.querySelectorAll(".pwm-pagination button")).some((button) => button.textContent.trim() === "2")')
    if (!pageButton) return { blockedEvidence: 'The supplied Screen reference shows a page 2 control, but the application catalogue has no evidenced page-2 traits; no item was invented.' }
    await clickSelector(cdp, '.pwm-pagination button:nth-last-child(2)')
  }
  if (scenario.selectSelector) {
    await clickSelector(cdp, scenario.selectSelector)
    await waitForPageCondition(cdp, `document.querySelector(${JSON.stringify(scenario.selectSelector)})?.getAttribute('aria-pressed') === 'true' && !document.querySelector('.pwm-button-save')?.disabled`, 'selected dirty trait', scenario.readySelectors)
  }
  return { blockedEvidence: null }
}

function pngDimensions(buffer) {
  assert.equal(buffer.toString('hex', 0, 8), '89504e470d0a1a0a', 'Expected PNG data.')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

async function captureCustomizerPreviewCropDiagnostic(cdp, appPort, scenarios) {
  const outputDir = join(evidenceRoot, 'customizer-preview-crop-diagnostic')
  mkdirSync(outputDir, { recursive: true })

  const rawMinerSourcePath = join(worktreeRoot, 'src', 'nft-miners', 'assets', 'bonus-miner-reference.png')
  const rawMinerSource = readFileSync(rawMinerSourcePath)
  const sourceDimensions = pngDimensions(rawMinerSource)
  const detailScenario = spec.scenarios.find((scenario) => scenario.id === 'detail-tasks')
  const detailArtGeometry = detailScenario.expectedGeometry['.pwm-detail-art-panel']
  const sourceDpr = detailScenario.viewport.deviceScaleFactor
  const sourceCrop = {
    x: detailScenario.roi.x * sourceDpr,
    y: detailScenario.roi.y * sourceDpr,
    width: detailArtGeometry.width * sourceDpr,
    height: detailArtGeometry.width * sourceDpr,
  }
  assert.ok(sourceCrop.x + sourceCrop.width <= sourceDimensions.width, 'Detail art source crop exceeds the source image width.')
  assert.ok(sourceCrop.y + sourceCrop.height <= sourceDimensions.height, 'Detail art source crop exceeds the source image height.')

  const previewCssSize = 600
  const previewDpr = scenarios[0].viewport.deviceScaleFactor
  const previewPhysicalSize = previewCssSize * previewDpr
  const sourceToPreviewScale = previewPhysicalSize / sourceCrop.width
  const backgroundSize = {
    width: sourceDimensions.width * sourceToPreviewScale / previewDpr,
    height: sourceDimensions.height * sourceToPreviewScale / previewDpr,
  }
  const backgroundOffset = {
    x: sourceCrop.x * sourceToPreviewScale / previewDpr,
    y: sourceCrop.y * sourceToPreviewScale / previewDpr,
  }
  const candidate = {
    backgroundSize: `${backgroundSize.width}px ${backgroundSize.height}px`,
    backgroundPosition: `-${backgroundOffset.x}px -${backgroundOffset.y}px`,
    sourceToPreviewScale,
  }
  const cropSearchInputs = {
    source: `data:image/png;base64,${rawMinerSource.toString('base64')}`,
    targets: scenarios.map((scenario) => ({
      id: scenario.state.tab,
      reference: `data:image/png;base64,${readFileSync(join(dirname(specPath), scenario.reference)).toString('base64')}`,
      rect: {
        x: scenario.roi.x * scenario.viewport.deviceScaleFactor,
        y: scenario.roi.y * scenario.viewport.deviceScaleFactor,
        size: previewPhysicalSize,
      },
    })),
    seed: { x: sourceCrop.x, y: sourceCrop.y, scale: sourceToPreviewScale },
    sampleSize: 80,
    previewPhysicalSize,
    pixelChannelTolerance: spec.pixelChannelTolerance,
  }
  const searchSourceCrop = async function searchSourceCrop(input) {
    const loadImage = (src) => new Promise((resolveImage, rejectImage) => {
      const image = new Image()
      image.onload = () => resolveImage(image)
      image.onerror = rejectImage
      image.src = src
    })
    const [source, ...targetImages] = await Promise.all([
      loadImage(input.source),
      ...input.targets.map((target) => loadImage(target.reference)),
    ])
    const sampleSize = input.sampleSize
    const previewScale = sampleSize / input.previewPhysicalSize
    const targetPixels = input.targets.map((target, index) => {
      const canvas = document.createElement('canvas')
      canvas.width = sampleSize
      canvas.height = sampleSize
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(targetImages[index], target.rect.x, target.rect.y, target.rect.size, target.rect.size, 0, 0, sampleSize, sampleSize)
      return { id: target.id, pixels: context.getImageData(0, 0, sampleSize, sampleSize).data }
    })
    const candidateCanvas = document.createElement('canvas')
    candidateCanvas.width = sampleSize
    candidateCanvas.height = sampleSize
    const candidateContext = candidateCanvas.getContext('2d', { willReadFrequently: true })
    candidateContext.imageSmoothingEnabled = true
    candidateContext.imageSmoothingQuality = 'high'
    const renderAndScore = (candidate) => {
      candidateContext.clearRect(0, 0, sampleSize, sampleSize)
      const scale = candidate.scale * previewScale
      candidateContext.drawImage(
        source,
        -candidate.x * scale,
        -candidate.y * scale,
        source.width * scale,
        source.height * scale,
      )
      const actualPixels = candidateContext.getImageData(0, 0, sampleSize, sampleSize).data
      let mismatchTotal = 0
      let absoluteErrorTotal = 0
      let comparedTotal = 0
      const perTarget = []
      for (const target of targetPixels) {
        let mismatched = 0
        let absoluteError = 0
        for (let pixel = 0; pixel < sampleSize * sampleSize; pixel += 1) {
          const offset = pixel * 4
          const delta = Math.max(
            Math.abs(actualPixels[offset] - target.pixels[offset]),
            Math.abs(actualPixels[offset + 1] - target.pixels[offset + 1]),
            Math.abs(actualPixels[offset + 2] - target.pixels[offset + 2]),
          )
          if (delta > input.pixelChannelTolerance) mismatched += 1
          absoluteError += delta
        }
        mismatchTotal += mismatched
        absoluteErrorTotal += absoluteError
        comparedTotal += sampleSize * sampleSize
        perTarget.push({ id: target.id, mismatchPercent: mismatched / (sampleSize * sampleSize) * 100 })
      }
      return {
        ...candidate,
        mismatchPercent: mismatchTotal / comparedTotal * 100,
        meanAbsoluteChannelDelta: absoluteErrorTotal / (comparedTotal * 3),
        perTarget,
      }
    }
    let best = null
    const consider = (candidate) => {
      const scored = renderAndScore(candidate)
      if (!best || scored.mismatchPercent < best.mismatchPercent
        || (scored.mismatchPercent === best.mismatchPercent && scored.meanAbsoluteChannelDelta < best.meanAbsoluteChannelDelta)) best = scored
    }
    for (let scaleStep = -5; scaleStep <= 5; scaleStep += 1) {
      for (let xStep = -24; xStep <= 24; xStep += 4) {
        for (let yStep = -24; yStep <= 24; yStep += 4) {
          consider({ x: input.seed.x + xStep, y: input.seed.y + yStep, scale: input.seed.scale + scaleStep / 100 })
        }
      }
    }
    const coarseBest = best
    best = null
    for (let scaleStep = -5; scaleStep <= 5; scaleStep += 1) {
      for (let xStep = -4; xStep <= 4; xStep += 1) {
        for (let yStep = -4; yStep <= 4; yStep += 1) {
          consider({ x: coarseBest.x + xStep, y: coarseBest.y + yStep, scale: coarseBest.scale + scaleStep / 1000 })
        }
      }
    }
    return { sampleSize, coarseBest, best }
  }
  const sourceCropSearch = await evaluate(cdp, `(${searchSourceCrop.toString()})(${JSON.stringify(cropSearchInputs)})`, 60000)
  const optimizedCandidate = {
    backgroundSize: `${sourceDimensions.width * sourceCropSearch.best.scale / previewDpr}px ${sourceDimensions.height * sourceCropSearch.best.scale / previewDpr}px`,
    backgroundPosition: `-${sourceCropSearch.best.x * sourceCropSearch.best.scale / previewDpr}px -${sourceCropSearch.best.y * sourceCropSearch.best.scale / previewDpr}px`,
    sourceCropPhysical: { x: sourceCropSearch.best.x, y: sourceCropSearch.best.y, scale: sourceCropSearch.best.scale },
  }
  const results = []

  for (const scenario of scenarios) {
    assert.equal(scenario.viewport.deviceScaleFactor, previewDpr, 'Wall and Screen references must use the same device scale factor for a shared crop.')
    const reference = readFileSync(join(dirname(specPath), scenario.reference))
    const previewScenario = {
      viewport: scenario.viewport,
      roi: { x: scenario.roi.x, y: scenario.roi.y, width: previewCssSize, height: previewCssSize },
      masks: [],
      subregions: [],
      colorSamples: [],
    }
    const origin = `http://127.0.0.1:${appPort}`
    await seedAndNavigate(cdp, origin, appPort, scenario, scenario.viewport)
    await prepareVisualState(cdp, scenario)
    await waitForRouteReady(cdp, scenario)
    await waitForVisualStability(cdp, scenario.readySelectors, `${scenario.id} preview crop diagnostic`)

    const elementState = await evaluate(cdp, `(() => {
      const visual = document.querySelector('.pwm-customizer-column > .pwm-miner-visual')
      const art = visual?.querySelector('.pwm-miner-reference-art')
      const grid = document.querySelector('.pwm-option-grid')
      if (!visual || !art || !grid) throw new Error('Missing customizer preview or option grid.')
      const rect = (element) => {
        const value = element.getBoundingClientRect()
        return {
          x: value.x,
          y: value.y,
          width: value.width,
          height: value.height,
          right: value.right,
          bottom: value.bottom,
        }
      }
      const style = getComputedStyle(art)
      const gridStyle = getComputedStyle(grid)
      const cells = Array.from(grid.querySelectorAll(':scope > .pwm-option-cell')).map((cell, index) => {
        const option = cell.querySelector('.pwm-option')
        const optionStyle = option ? getComputedStyle(option) : null
        return {
          index: index + 1,
          cellRect: rect(cell),
          optionRect: option ? rect(option) : null,
          optionStyle: optionStyle ? {
            borderTopWidth: optionStyle.borderTopWidth,
            borderRightWidth: optionStyle.borderRightWidth,
            borderBottomWidth: optionStyle.borderBottomWidth,
            borderLeftWidth: optionStyle.borderLeftWidth,
            borderTopColor: optionStyle.borderTopColor,
            borderRightColor: optionStyle.borderRightColor,
            borderBottomColor: optionStyle.borderBottomColor,
            borderLeftColor: optionStyle.borderLeftColor,
            borderRadius: optionStyle.borderRadius,
            backgroundColor: optionStyle.backgroundColor,
          } : null,
        }
      })
      return {
        previewRect: rect(visual),
        artRect: rect(art),
        artStyle: {
          backgroundSize: style.backgroundSize,
          backgroundPosition: style.backgroundPosition,
          backgroundRepeat: style.backgroundRepeat,
          backgroundImage: style.backgroundImage,
        },
        artInlineStyle: {
          backgroundSize: art.style.getPropertyValue('background-size'),
          backgroundSizePriority: art.style.getPropertyPriority('background-size'),
          backgroundPosition: art.style.getPropertyValue('background-position'),
          backgroundPositionPriority: art.style.getPropertyPriority('background-position'),
          backgroundRepeat: art.style.getPropertyValue('background-repeat'),
          backgroundRepeatPriority: art.style.getPropertyPriority('background-repeat'),
        },
        grid: {
          rect: rect(grid),
          display: gridStyle.display,
          gridTemplateColumns: gridStyle.gridTemplateColumns,
          rowGap: gridStyle.rowGap,
          columnGap: gridStyle.columnGap,
          padding: gridStyle.padding,
          cells,
        },
      }
    })()`)
    assert.equal(elementState.previewRect.width, previewCssSize, `${scenario.id} preview width changed from 600 CSS pixels.`)
    assert.equal(elementState.previewRect.height, previewCssSize, `${scenario.id} preview height changed from 600 CSS pixels.`)
    assert.equal(elementState.grid.cells.length, 18, `${scenario.id} did not expose all 18 real option cells.`)

    const capturePreview = async (fileName) => {
      await drainFetchHandlers()
      const screenshot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: true,
        omitBackground: false,
        clip: { x: scenario.roi.x, y: scenario.roi.y, width: previewCssSize, height: previewCssSize, scale: 1 },
      })
      const buffer = Buffer.from(screenshot.data, 'base64')
      assert.deepEqual(pngDimensions(buffer), { width: previewPhysicalSize, height: previewPhysicalSize }, `${scenario.id} preview crop has unexpected dimensions.`)
      writeFileSync(join(outputDir, fileName), buffer)
      return buffer
    }

    const baseline = await capturePreview(`${scenario.state.tab}-baseline.png`)
    const baselineComparison = await compareInBrowser(cdp, reference, baseline, previewScenario)
    const previousStyle = elementState.artInlineStyle
    let exactSourceCrop
    let optimizedSourceCrop
    try {
      await evaluate(cdp, `((candidate) => {
        const art = document.querySelector('.pwm-customizer-column > .pwm-miner-visual .pwm-miner-reference-art')
        art.style.setProperty('background-size', candidate.backgroundSize, 'important')
        art.style.setProperty('background-position', candidate.backgroundPosition, 'important')
        art.style.setProperty('background-repeat', 'no-repeat', 'important')
      })(${JSON.stringify(candidate)})`)
      await evaluate(cdp, 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      const candidateStyle = await evaluate(cdp, `(() => {
        const art = document.querySelector('.pwm-customizer-column > .pwm-miner-visual .pwm-miner-reference-art')
        const style = getComputedStyle(art)
        return { backgroundSize: style.backgroundSize, backgroundPosition: style.backgroundPosition, backgroundRepeat: style.backgroundRepeat }
      })()`)
      exactSourceCrop = await capturePreview(`${scenario.state.tab}-exact-source-crop.png`)
      const comparison = await compareInBrowser(cdp, reference, exactSourceCrop, previewScenario)
      await evaluate(cdp, `((candidate) => {
        const art = document.querySelector('.pwm-customizer-column > .pwm-miner-visual .pwm-miner-reference-art')
        art.style.setProperty('background-size', candidate.backgroundSize, 'important')
        art.style.setProperty('background-position', candidate.backgroundPosition, 'important')
        art.style.setProperty('background-repeat', 'no-repeat', 'important')
      })(${JSON.stringify(optimizedCandidate)})`)
      await evaluate(cdp, 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      const optimizedImage = await capturePreview(`${scenario.state.tab}-optimized-source-crop.png`)
      const optimizedComparison = await compareInBrowser(cdp, reference, optimizedImage, previewScenario)
      writeFileSync(join(outputDir, `${scenario.state.tab}-baseline-diff.png`), baselineComparison.diffPng)
      writeFileSync(join(outputDir, `${scenario.state.tab}-exact-source-crop-diff.png`), comparison.diffPng)
      writeFileSync(join(outputDir, `${scenario.state.tab}-optimized-source-crop-diff.png`), optimizedComparison.diffPng)
      results.push({
        id: scenario.id,
        reference: scenario.reference,
        state: scenario.state,
        baseline: {
          backgroundSize: elementState.artStyle.backgroundSize,
          backgroundPosition: elementState.artStyle.backgroundPosition,
          mismatchPercent: baselineComparison.mismatchPercent,
          missingPixels: baselineComparison.missingPixels,
        },
        exactSourceCrop: {
          ...candidate,
          computed: candidateStyle,
          mismatchPercent: comparison.mismatchPercent,
          missingPixels: comparison.missingPixels,
          dimensionsPass: comparison.actualRoiDimensionsPass,
          pass: comparison.mismatchPercent <= spec.thresholds.maxMismatchPercent
            && comparison.missingPixels === 0
            && comparison.actualRoiDimensionsPass,
        },
        optimizedSourceCrop: {
          ...optimizedCandidate,
          searchScore: sourceCropSearch.best,
          mismatchPercent: optimizedComparison.mismatchPercent,
          missingPixels: optimizedComparison.missingPixels,
          dimensionsPass: optimizedComparison.actualRoiDimensionsPass,
          pass: optimizedComparison.mismatchPercent <= spec.thresholds.maxMismatchPercent
            && optimizedComparison.missingPixels === 0
            && optimizedComparison.actualRoiDimensionsPass,
        },
        gridGeometry: elementState.grid,
      })
    } finally {
      await evaluate(cdp, `((previous) => {
        const art = document.querySelector('.pwm-customizer-column > .pwm-miner-visual .pwm-miner-reference-art')
        const properties = {
          'background-size': { value: previous.backgroundSize, priority: previous.backgroundSizePriority },
          'background-position': { value: previous.backgroundPosition, priority: previous.backgroundPositionPriority },
          'background-repeat': { value: previous.backgroundRepeat, priority: previous.backgroundRepeatPriority },
        }
        for (const [property, entry] of Object.entries(properties)) {
          if (entry.value) art.style.setProperty(property, entry.value, entry.priority)
          else art.style.removeProperty(property)
        }
      })(${JSON.stringify(previousStyle)})`)
    }
  }

  const report = {
    id: 'customizer-preview-crop-diagnostic',
    status: 'DIAGNOSTIC_COMPLETE',
    source: {
      path: 'src/nft-miners/assets/bonus-miner-reference.png',
      dimensions: sourceDimensions,
      sha256: createHash('sha256').update(rawMinerSource).digest('hex'),
      physicalCrop: sourceCrop,
    },
    candidateDerivation: {
      sourceToPreviewScale,
      backgroundSizePx: backgroundSize,
      backgroundOffsetPx: backgroundOffset,
      sourceCropSearch,
      optimizedCandidate,
      previewCssSize,
      previewDpr,
      productCssChanged: false,
    },
    commonCropPass: results.length === 2 && results.every((result) => result.optimizedSourceCrop.pass),
    scenarios: results,
  }
  writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(join(outputDir, 'report.md'), [
    '# Customizer preview source-crop diagnostic',
    '',
    '**DIAGNOSTIC_COMPLETE**',
    '',
    `- Source: ${report.source.path} (${sourceDimensions.width}×${sourceDimensions.height})`,
    `- Source crop: ${sourceCrop.x},${sourceCrop.y} ${sourceCrop.width}×${sourceCrop.height} physical pixels`,
    `- Candidate CSS background size: ${candidate.backgroundSize}`,
    `- Candidate CSS background position: ${candidate.backgroundPosition}`,
    `- Optimized source crop: x=${optimizedCandidate.sourceCropPhysical.x}, y=${optimizedCandidate.sourceCropPhysical.y}, scale=${optimizedCandidate.sourceCropPhysical.scale}`,
    `- Shared crop passes Wall and Screen: ${report.commonCropPass}`,
    ...results.map((result) => `- ${result.state.tab}: baseline ${result.baseline.mismatchPercent.toFixed(4)}%; derived crop ${result.exactSourceCrop.mismatchPercent.toFixed(4)}%; optimized crop ${result.optimizedSourceCrop.mismatchPercent.toFixed(4)}%; missing pixels ${result.optimizedSourceCrop.missingPixels}; 18 option cells measured.`),
    '',
    'The derived crop was applied only through temporary browser style overrides and restored before capture cleanup. Product CSS was not changed by this diagnostic.',
  ].join('\n') + '\n')
  return report
}

async function captureDetailArtDiagnostic(cdp, reference, scenario, outputDir) {
  const liveStyle = await evaluate(cdp, `(() => {
    const element = document.querySelector('.pwm-detail-art-panel > .pwm-miner-visual')
    const art = element?.querySelector('.pwm-miner-reference-art')
    if (!element || !art) return null
    const rect = element.getBoundingClientRect()
    const artRect = art.getBoundingClientRect()
    const style = getComputedStyle(art)
    const sourceMatch = /^url\\(["']?(.*?)["']?\\)$/.exec(style.backgroundImage)
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      artRect: { x: artRect.x, y: artRect.y, width: artRect.width, height: artRect.height },
      source: sourceMatch ? new URL(sourceMatch[1], location.href).href : null,
      backgroundSize: style.backgroundSize,
      backgroundPosition: style.backgroundPosition,
      borderRadius: getComputedStyle(element).borderRadius,
      overflow: getComputedStyle(element).overflow,
    }
  })()`)
  assert.ok(liveStyle?.source, 'Detail art source image could not be read from the live renderer.')
  const captureClip = async (clip) => {
    const result = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      omitBackground: false,
      clip: { ...clip, scale: 1 },
    })
    return Buffer.from(result.data, 'base64')
  }

  if (process.argv.includes('--detail-art-diagnostic-only')) {
    const rawMinerSource = readFileSync(join(worktreeRoot, 'src', 'nft-miners', 'assets', 'bonus-miner-reference.png'))
    const realDetailScenario = {
      viewport: scenario.viewport,
      roi: { x: 315, y: 140, width: 495, height: 495 },
      masks: [], subregions: [], colorSamples: [],
    }
    const realDetailState = await evaluate(cdp, `(() => {
      const layout = document.querySelector('.pwm-miner-detail-layout')
      const panel = document.querySelector('.pwm-detail-art-panel')
      if (!panel) throw new Error('Missing real detail art panel.')
      const art = panel.querySelector('.pwm-miner-visual .pwm-miner-reference-art')
      if (!layout || !art) throw new Error('Missing real detail layout or art.')
      const rect = (element) => {
        const box = element.getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width, height: box.height }
      }
      const layoutStyle = getComputedStyle(layout)
      const artStyle = getComputedStyle(art)
      return {
        layoutRect: rect(layout),
        panelRect: rect(panel),
        artRect: rect(art),
        devicePixelRatio,
        layoutComputed: {
          width: layoutStyle.width,
          marginLeft: layoutStyle.marginLeft,
          marginRight: layoutStyle.marginRight,
          display: layoutStyle.display,
          gridTemplateColumns: layoutStyle.gridTemplateColumns,
        },
        artComputed: {
          backgroundSize: artStyle.backgroundSize,
          backgroundPosition: artStyle.backgroundPosition,
          backgroundRepeat: artStyle.backgroundRepeat,
        },
      }
    })()`)
    const realDetailImage = await captureClip(realDetailState.artRect)
    const realDetailComparison = await compareInBrowser(cdp, rawMinerSource, realDetailImage, realDetailScenario)
    const widthDeltaFromBaseline = realDetailState.layoutRect.width - 1208
    return {
      realDetailNormalProductCss: {
        layoutRect: realDetailState.layoutRect,
        panelRect: realDetailState.panelRect,
        artRect: realDetailState.artRect,
        widthDeltaFromBaseline,
        physicalArtX: realDetailState.artRect.x * realDetailState.devicePixelRatio,
        devicePixelRatio: realDetailState.devicePixelRatio,
        layoutComputed: realDetailState.layoutComputed,
        artComputed: realDetailState.artComputed,
        dimensions: pngDimensions(realDetailImage),
        mismatchPercentVsRawSource: realDetailComparison.mismatchPercent,
        missingPixels: realDetailComparison.missingPixels,
        firstGatePass: Math.abs(widthDeltaFromBaseline + 1) <= 0.01 &&
          Math.abs(realDetailState.layoutRect.x - 316) <= 0.01 &&
          Math.abs(realDetailState.panelRect.x - 316) <= 0.01 &&
          realDetailState.panelRect.width === 495 && realDetailState.panelRect.height === 650 &&
          Math.abs(realDetailState.artRect.x - 316) <= 0.01 &&
          realDetailState.artRect.width === 495 && realDetailState.artRect.height === 495 &&
          realDetailState.devicePixelRatio === 2 && realDetailComparison.mismatchPercent <= 0.5 &&
          realDetailComparison.missingPixels === 0,
      },
    }
  }

  if (process.argv.includes('--detail-art-probe-i')) {
    const rawMinerSource = readFileSync(join(worktreeRoot, 'src', 'nft-miners', 'assets', 'bonus-miner-reference.png'))
    const normalDetailScenario = {
      viewport: scenario.viewport,
      roi: { x: 315, y: 140, width: 495, height: 495 },
      masks: [], subregions: [], colorSamples: [],
    }
    const probeISetup = await evaluate(cdp, `(async function testFinalDesktopPair() {
      const layout = document.querySelector('.pwm-miner-detail-layout')
      const panel = document.querySelector('.pwm-detail-art-panel')
      if (!panel) throw new Error('Missing real detail art panel.')
      const art = panel.querySelector('.pwm-miner-visual .pwm-miner-reference-art')
      if (!layout || !art) throw new Error('Missing real detail layout or art.')
      const rect = (element) => {
        const box = element.getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width, height: box.height }
      }
      const previousLayoutWidth = {
        value: layout.style.getPropertyValue('width'),
        priority: layout.style.getPropertyPriority('width'),
      }
      const previousArt = Object.fromEntries(['background-size', 'background-position'].map((name) => [name, {
        value: art.style.getPropertyValue(name),
        priority: art.style.getPropertyPriority(name),
      }]))
      const beforeLayoutRect = rect(layout)
      const beforePanelRect = rect(panel)
      const beforeArtRect = rect(art)
      layout.style.setProperty('width', '1207px', 'important')
      art.style.setProperty('background-size', '1839px 1827px', 'important')
      art.style.setProperty('background-position', '-315px -140px', 'important')
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const afterLayoutRect = rect(layout)
      const afterPanelRect = rect(panel)
      const afterArtRect = rect(art)
      const layoutStyleAfter = getComputedStyle(layout)
      const artStyleAfter = getComputedStyle(art)
      const devicePixelRatioAfter = devicePixelRatio
      const valid = Math.abs(beforeLayoutRect.width - 1208) <= 0.01 &&
        Math.abs(afterLayoutRect.x - 316) <= 0.01 &&
        Math.abs(afterLayoutRect.width - 1207) <= 0.01 &&
        Math.abs(afterArtRect.x - 316) <= 0.01 &&
        Math.abs(afterArtRect.y - beforeArtRect.y) <= 0.01 &&
        afterArtRect.width === 495 && afterArtRect.height === 495 &&
        afterPanelRect.width === 495 && afterPanelRect.height === 650 &&
        layoutStyleAfter.display === 'grid' &&
        devicePixelRatioAfter === 2 && afterArtRect.x * devicePixelRatioAfter === 632 &&
        artStyleAfter.backgroundSize === '1839px 1827px' &&
        artStyleAfter.backgroundPosition === '-315px -140px'
      return {
        previousLayoutWidth,
        previousArt,
        beforeLayoutRect,
        beforePanelRect,
        beforeArtRect,
        afterLayoutRect,
        afterPanelRect,
        afterArtRect,
        devicePixelRatio: devicePixelRatioAfter,
        valid,
        layoutComputed: {
          width: layoutStyleAfter.width,
          marginLeft: layoutStyleAfter.marginLeft,
          marginRight: layoutStyleAfter.marginRight,
          display: layoutStyleAfter.display,
          gridTemplateColumns: layoutStyleAfter.gridTemplateColumns,
        },
        artComputed: {
          backgroundSize: artStyleAfter.backgroundSize,
          backgroundPosition: artStyleAfter.backgroundPosition,
          backgroundRepeat: artStyleAfter.backgroundRepeat,
        },
      }
    })()`)
    let probeIImage
    let probeIComparison
    try {
      if (probeISetup.valid) {
        probeIImage = await captureClip(probeISetup.afterArtRect)
        probeIComparison = await compareInBrowser(cdp, rawMinerSource, probeIImage, normalDetailScenario)
      }
    } finally {
      await evaluate(cdp, `(function restoreFinalDesktopPair(input) {
        const layout = document.querySelector('.pwm-miner-detail-layout')
        const art = document.querySelector('.pwm-detail-art-panel > .pwm-miner-visual .pwm-miner-reference-art')
        if (input.previousLayoutWidth.value) layout.style.setProperty('width', input.previousLayoutWidth.value, input.previousLayoutWidth.priority)
        else layout.style.removeProperty('width')
        for (const [name, value] of Object.entries(input.previousArt)) {
          if (value.value) art.style.setProperty(name, value.value, value.priority)
          else art.style.removeProperty(name)
        }
      })(${JSON.stringify(probeISetup)})`)
    }
    return {
      probeIFinalDesktopCandidate: {
        valid: probeISetup.valid,
        layoutRect: probeISetup.afterLayoutRect,
        panelRect: probeISetup.afterPanelRect,
        artRect: probeISetup.afterArtRect,
        widthDeltaFromBaseline: probeISetup.afterLayoutRect.width - probeISetup.beforeLayoutRect.width,
        physicalArtX: probeISetup.afterArtRect.x * probeISetup.devicePixelRatio,
        devicePixelRatio: probeISetup.devicePixelRatio,
        layoutComputed: probeISetup.layoutComputed,
        artComputed: probeISetup.artComputed,
        dimensions: probeIImage ? pngDimensions(probeIImage) : null,
        mismatchPercentVsRawSource: probeIComparison?.mismatchPercent ?? null,
        missingPixels: probeIComparison?.missingPixels ?? null,
        firstGatePass: probeISetup.valid && probeIComparison.mismatchPercent <= 0.5,
      },
    }
  }

  if (process.argv.includes('--detail-art-probe-g')) {
    const rawMinerSource = readFileSync(join(worktreeRoot, 'src', 'nft-miners', 'assets', 'bonus-miner-reference.png'))
    const probeGScenario = {
      viewport: scenario.viewport,
      roi: { x: 315, y: 140, width: 495, height: 495 },
      masks: [], subregions: [], colorSamples: [],
    }
    const probeGRect = await evaluate(cdp, `(async function createNeutralClipProbe(input) {
      const root = document.createElement('div')
      root.id = 'pwm-detail-art-neutral-root'
      Object.assign(root.style, {
        position: 'fixed', left: '315.5px', top: '154.796875px', width: '495px', height: '495px',
        margin: '0', padding: '0', border: '0', background: 'transparent',
        overflow: 'visible', transform: 'none', zIndex: '2147483647', boxSizing: 'border-box',
      })
      const art = document.createElement('div')
      art.id = 'pwm-detail-art-neutral-child'
      Object.assign(art.style, {
        position: 'absolute', inset: '0px', margin: '0', padding: '0', border: '0',
        borderRadius: '0', backgroundColor: 'transparent', overflow: 'visible',
        transform: 'none', zIndex: 'auto', boxSizing: 'border-box',
      })
      art.style.backgroundImage = 'url(' + JSON.stringify(input.source) + ')'
      art.style.backgroundSize = '1839px 1827px'
      art.style.backgroundPosition = '-315px -140px'
      art.style.backgroundRepeat = 'no-repeat'
      root.appendChild(art)
      document.body.appendChild(root)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const rect = art.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })(${JSON.stringify({ source: liveStyle.source })})`)
    let directImage
    let enclosingImage
    let directComparison
    let croppedComparison
    try {
      directImage = await captureClip(probeGRect)
      directComparison = await compareInBrowser(cdp, rawMinerSource, directImage, probeGScenario)
      const enclosingClip = {
        x: Math.floor(probeGRect.x),
        y: probeGRect.y,
        width: 496,
        height: 495,
      }
      enclosingImage = await captureClip(enclosingClip)
      const enclosingDataUrl = `data:image/png;base64,${enclosingImage.toString('base64')}`
      const cropDataUrl = await evaluate(cdp, `(async function cropPhysicalPixel(input) {
        const image = await new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = input.dataUrl
        })
        const canvas = document.createElement('canvas')
        canvas.width = 990
        canvas.height = 990
        const context = canvas.getContext('2d')
        context.drawImage(image, 1, 0, 990, 990, 0, 0, 990, 990)
        return canvas.toDataURL('image/png')
      })(${JSON.stringify({ dataUrl: enclosingDataUrl })})`)
      const croppedImage = Buffer.from(cropDataUrl.slice(cropDataUrl.indexOf(',') + 1), 'base64')
      croppedComparison = await compareInBrowser(cdp, rawMinerSource, croppedImage, probeGScenario)
    } finally {
      await evaluate(cdp, `document.getElementById('pwm-detail-art-neutral-root')?.remove()`)
    }
    return {
      probeGClipVsRasterPhase: {
        rect: probeGRect,
        directClip: {
          dimensions: pngDimensions(directImage),
          mismatchPercentVsRawSource: directComparison.mismatchPercent,
          missingPixels: directComparison.missingPixels,
        },
        integerXEnclosingClip: {
          clip: { x: Math.floor(probeGRect.x), y: probeGRect.y, width: 496, height: 495 },
          dimensions: pngDimensions(enclosingImage),
          physicalCrop: { x: 1, y: 0, width: 990, height: 990 },
          croppedMismatchPercentVsRawSource: croppedComparison.mismatchPercent,
          missingPixels: croppedComparison.missingPixels,
        },
      },
    }
  }

  if (process.argv.includes('--detail-art-probe-e2')) {
    const probeE2Setup = await evaluate(cdp, `(async function stabilizeViewportAndNeutralizeArt() {
      const panel = document.querySelector('.pwm-detail-art-panel')
      if (!panel) throw new Error('Missing live detail art panel.')
      const parent = panel.querySelector(':scope > .pwm-miner-visual')
      if (!parent) throw new Error('Missing live detail art parent.')
      const art = parent.querySelector('.pwm-miner-reference-art')
      if (!art) throw new Error('Missing live detail art child.')
      const layout = document.querySelector('.pwm-miner-detail-layout')
      if (!layout) throw new Error('Missing detail grid layout.')
      const html = document.documentElement
      const targets = [
        { node: panel, properties: ['overflow', 'border-radius', 'background'] },
        { node: parent, properties: ['overflow', 'border-radius', 'background'] },
        { node: art, properties: ['background-size', 'background-position', 'background-repeat'] },
      ]
      const previous = targets.map(({ node, properties }) => ({
        properties: Object.fromEntries(properties.map((name) => [name, {
          value: node.style.getPropertyValue(name),
          priority: node.style.getPropertyPriority(name),
        }])),
      }))
      const previousLayoutDisplay = {
        value: layout.style.getPropertyValue('display'),
        priority: layout.style.getPropertyPriority('display'),
      }
      const previousHtmlOverflowY = {
        value: html.style.getPropertyValue('overflow-y'),
        priority: html.style.getPropertyPriority('overflow-y'),
      }
      html.style.setProperty('overflow-y', 'scroll', 'important')
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      panel.style.setProperty('overflow', 'visible', 'important')
      panel.style.setProperty('border-radius', '0px', 'important')
      panel.style.setProperty('background', 'transparent', 'important')
      parent.style.setProperty('overflow', 'visible', 'important')
      parent.style.setProperty('border-radius', '0px', 'important')
      parent.style.setProperty('background', 'transparent', 'important')
      art.style.setProperty('background-size', '1839px 1827px', 'important')
      art.style.setProperty('background-position', '-315px -140px', 'important')
      art.style.setProperty('background-repeat', 'no-repeat', 'important')
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const rectObject = (element) => {
        const rect = element.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      }
      const gridControl = () => ({
        innerWidth,
        clientWidth: html.clientWidth,
        scrollHeight: html.scrollHeight,
        layoutRect: rectObject(layout),
        artRect: rectObject(art),
        layoutDisplay: getComputedStyle(layout).display,
      })
      const computed = (node) => {
        const style = getComputedStyle(node)
        return {
          overflow: style.overflow,
          borderRadius: style.borderRadius,
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          backgroundSize: style.backgroundSize,
          backgroundPosition: style.backgroundPosition,
          backgroundRepeat: style.backgroundRepeat,
        }
      }
      return {
        previous,
        previousLayoutDisplay,
        previousHtmlOverflowY,
        gridControl: gridControl(),
        panelComputed: computed(panel),
        parentComputed: computed(parent),
        artComputed: computed(art),
      }
    })()`)
    const rawMinerSource = readFileSync(join(worktreeRoot, 'src', 'nft-miners', 'assets', 'bonus-miner-reference.png'))
    const probeE2Scenario = {
      viewport: scenario.viewport,
      roi: { x: 315, y: 140, width: 495, height: 495 },
      masks: [], subregions: [], colorSamples: [],
    }
    let gridControlImage
    let gridControlComparison
    let blockImage
    let blockComparison
    let probeE2Block
    try {
      const gridArt = probeE2Setup.gridControl.artRect
      gridControlImage = await captureClip({ x: gridArt.x, y: gridArt.y, width: gridArt.width, height: gridArt.height })
      gridControlComparison = await compareInBrowser(cdp, rawMinerSource, gridControlImage, probeE2Scenario)
      probeE2Block = await evaluate(cdp, `(async function disableGridOnly() {
        const layout = document.querySelector('.pwm-miner-detail-layout')
        const art = document.querySelector('.pwm-detail-art-panel > .pwm-miner-visual .pwm-miner-reference-art')
        if (!layout || !art) throw new Error('Missing detail layout or art.')
        const rectObject = (element) => {
          const rect = element.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
        layout.style.setProperty('display', 'block', 'important')
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const html = document.documentElement
        const block = {
          innerWidth,
          clientWidth: html.clientWidth,
          scrollHeight: html.scrollHeight,
          layoutRect: rectObject(layout),
          artRect: rectObject(art),
          layoutDisplay: getComputedStyle(layout).display,
        }
        const grid = ${JSON.stringify(probeE2Setup.gridControl)}
        const rectStable = ['x', 'y', 'width', 'height'].every((key) => Math.abs(grid.artRect[key] - block.artRect[key]) <= 0.01)
        return { block, valid: block.layoutDisplay === 'block' && grid.clientWidth === block.clientWidth && rectStable }
      })()`)
      if (probeE2Block.valid) {
        const blockArt = probeE2Block.block.artRect
        blockImage = await captureClip({ x: blockArt.x, y: blockArt.y, width: blockArt.width, height: blockArt.height })
        blockComparison = await compareInBrowser(cdp, rawMinerSource, blockImage, probeE2Scenario)
      }
    } finally {
      await evaluate(cdp, `(function restoreStableViewportProbe(input) {
        const nodes = [
          document.querySelector('.pwm-detail-art-panel'),
          document.querySelector('.pwm-detail-art-panel > .pwm-miner-visual'),
          document.querySelector('.pwm-detail-art-panel > .pwm-miner-visual .pwm-miner-reference-art'),
        ]
        input.previous.forEach((saved, index) => Object.entries(saved.properties).forEach(([name, value]) => {
          if (value.value) nodes[index].style.setProperty(name, value.value, value.priority)
          else nodes[index].style.removeProperty(name)
        }))
        const layout = document.querySelector('.pwm-miner-detail-layout')
        const html = document.documentElement
        if (input.previousLayoutDisplay.value) {
          layout.style.setProperty('display', input.previousLayoutDisplay.value, input.previousLayoutDisplay.priority)
        } else {
          layout.style.removeProperty('display')
        }
        if (input.previousHtmlOverflowY.value) {
          html.style.setProperty('overflow-y', input.previousHtmlOverflowY.value, input.previousHtmlOverflowY.priority)
        } else {
          html.style.removeProperty('overflow-y')
        }
      })(${JSON.stringify(probeE2Setup)})`)
    }
    return {
      probeE2StableViewport: {
        valid: probeE2Block.valid,
        gridControl: {
          ...probeE2Setup.gridControl,
          dimensions: pngDimensions(gridControlImage),
          mismatchPercentVsRawSource: gridControlComparison.mismatchPercent,
          missingPixels: gridControlComparison.missingPixels,
        },
        block: {
          ...probeE2Block.block,
          dimensions: blockImage ? pngDimensions(blockImage) : null,
          mismatchPercentVsRawSource: blockComparison?.mismatchPercent ?? null,
          missingPixels: blockComparison?.missingPixels ?? null,
        },
        panelComputed: probeE2Setup.panelComputed,
        parentComputed: probeE2Setup.parentComputed,
        artComputed: probeE2Setup.artComputed,
      },
    }
  }  const captureProbe = async (kind, path) => {
    const created = await evaluate(cdp, `(${async function createProbe(input) {
      const image = new Image()
      image.src = input.source
      await image.decode()
      const root = document.createElement('div')
      root.id = 'pwm-detail-art-diagnostic-probe'
      Object.assign(root.style, {
        position: 'fixed', display: 'block', left: '0px', top: '0px',
        width: '495px', height: '495px', overflow: 'hidden',
        zIndex: '2147483647', margin: '0', padding: '0', border: '0',
        borderRadius: '0', backgroundColor: 'transparent', transform: 'none',
        boxSizing: 'border-box',
      })
      if (input.kind === 'background') {
        root.style.backgroundImage = 'url(' + JSON.stringify(input.source) + ')'
        root.style.backgroundSize = '1839px 1827px'
        root.style.backgroundPosition = '-315px -140px'
        root.style.backgroundRepeat = 'no-repeat'
      } else {
        const positionedImage = document.createElement('img')
        positionedImage.src = input.source
        Object.assign(positionedImage.style, {
          position: 'absolute', left: '-315px', top: '-140px',
          width: '1839px', height: '1827px', maxWidth: 'none',
          display: 'block', margin: '0', padding: '0', border: '0',
          objectFit: 'fill', transform: 'none',
        })
        root.append(positionedImage)
      }
      document.body.append(root)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const rect = root.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }})(${JSON.stringify({ kind, source: liveStyle.source })})`)
    try {
      const data = await captureClip({ x: 0, y: 0, width: 495, height: 495 })
      const dimensions = pngDimensions(data)
      writeFileSync(path, data)
      const dimensionPass = dimensions.width === 990 && dimensions.height === 990
      return { data, dimensions, dimensionPass, probeRect: created }
    } finally {
      await evaluate(cdp, `document.getElementById('pwm-detail-art-diagnostic-probe')?.remove()`)
    }
  }

  const liveFull = await captureClip(liveStyle.rect)
  const childCaptureState = await evaluate(cdp, `(() => {
    const parent = document.querySelector('.pwm-detail-art-panel > .pwm-miner-visual')
    const art = parent.querySelector('.pwm-miner-reference-art')
    const style = parent.style
    const rect = art.getBoundingClientRect()
    const backgroundImage = style.getPropertyValue('background-image')
    const backgroundPriority = style.getPropertyPriority('background-image')
    style.setProperty('background-image', 'none', 'important')
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      backgroundImage,
      backgroundPriority,
    }
  })()`)
  let liveChild
  try {
    liveChild = await captureClip(childCaptureState.rect)
  } finally {
    await evaluate(cdp, `(async function restoreParentBackground(input) {
      const parent = document.querySelector('.pwm-detail-art-panel > .pwm-miner-visual')
      if (input.backgroundImage) parent.style.setProperty('background-image', input.backgroundImage, input.backgroundPriority)
      else parent.style.removeProperty('background-image')
    })(${JSON.stringify({ backgroundImage: childCaptureState.backgroundImage, backgroundPriority: childCaptureState.backgroundPriority })})`)
  }
  const liveCenterClip = {
    x: liveStyle.rect.x + 32,
    y: liveStyle.rect.y + 32,
    width: liveStyle.rect.width - 64,
    height: liveStyle.rect.height - 64,
  }
  const liveCenter = await captureClip(liveCenterClip)
  const probeA = await captureProbe('background', join(outputDir, 'detail-art-probe-a.png'))
  const probeB = await captureProbe('img', join(outputDir, 'detail-art-probe-b.png'))
  const layoutBaseline = await evaluate(cdp, `(() => {
    const layout = document.querySelector('.pwm-miner-detail-layout')
    if (!layout) return null
    const rect = layout.getBoundingClientRect()
    return {
      inlineMarginTop: layout.style.marginTop,
      computedMarginTop: getComputedStyle(layout).marginTop,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    }
  })()`)
  assert.ok(layoutBaseline, 'Detail layout is required for the physical-phase diagnostic.')
  const marginTop = Number.parseFloat(layoutBaseline.computedMarginTop)
  assert.ok(Number.isFinite(marginTop), 'Detail layout margin-top must be measurable.')
  const captureLayoutPhase = async (delta, label) => {
    await evaluate(cdp, `(() => {
      const layout = document.querySelector('.pwm-miner-detail-layout')
      layout.style.marginTop = ${JSON.stringify(`${marginTop + delta}px`)}
    })()`)
    try {
      await evaluate(cdp, 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      const phaseGeometry = await evaluate(cdp, `(() => {
        const layout = document.querySelector('.pwm-miner-detail-layout')
        const panel = document.querySelector('.pwm-detail-art-panel > .pwm-miner-visual')
        const art = panel.querySelector('.pwm-miner-reference-art')
        const layoutRect = layout.getBoundingClientRect()
        const artRect = art.getBoundingClientRect()
        return {
          layout: { x: layoutRect.x, y: layoutRect.y, width: layoutRect.width, height: layoutRect.height },
          art: { x: artRect.x, y: artRect.y, width: artRect.width, height: artRect.height },
        }
      })()`)
      const full = await captureClip(phaseGeometry.art)
      const centerClip = {
        x: phaseGeometry.art.x + 32,
        y: phaseGeometry.art.y + 32,
        width: phaseGeometry.art.width - 64,
        height: phaseGeometry.art.height - 64,
      }
      const center = await captureClip(centerClip)
      const fullPath = join(outputDir, `detail-art-phase-${label}.png`)
      const centerPath = join(outputDir, `detail-art-phase-${label}-center.png`)
      writeFileSync(fullPath, full)
      writeFileSync(centerPath, center)
      const fullComparison = await compareInBrowser(cdp, reference, full, {
        viewport: scenario.viewport,
        roi: { x: 315, y: 140, width: 495, height: 495 },
        masks: [], subregions: [], colorSamples: [],
      })
      const centerComparison = await compareInBrowser(cdp, reference, center, {
        viewport: scenario.viewport,
        roi: { x: 347, y: 172, width: 431, height: 431 },
        masks: [], subregions: [], colorSamples: [],
      })
      writeFileSync(join(outputDir, `detail-art-phase-${label}-diff.png`), fullComparison.diffPng)
      return {
        deltaCssPx: delta,
        layout: phaseGeometry.layout,
        art: phaseGeometry.art,
        artTopPhysicalPx: phaseGeometry.art.y * scenario.viewport.deviceScaleFactor,
        full: { dimensions: pngDimensions(full), mismatchPercent: fullComparison.mismatchPercent, missingPixels: fullComparison.missingPixels },
        center: { clip: centerClip, dimensions: pngDimensions(center), mismatchPercent: centerComparison.mismatchPercent, missingPixels: centerComparison.missingPixels },
      }
    } finally {
      await evaluate(cdp, `(() => {
        const layout = document.querySelector('.pwm-miner-detail-layout')
        layout.style.marginTop = ${JSON.stringify(layoutBaseline.inlineMarginTop)}
      })()`)
      await evaluate(cdp, 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    }
  }
  const phasePlus = await captureLayoutPhase(0.203125, 'plus')
  const phaseMinus = await captureLayoutPhase(-0.296875, 'minus')
  const liveSourceInspection = await evaluate(cdp, `(${async function inspectSourceAndLayers(input) {
    const element = document.querySelector('.pwm-detail-art-panel > .pwm-miner-visual')
    const art = element?.querySelector('.pwm-miner-reference-art')
    const source = input.source
    const response = await fetch(source, { cache: 'no-store' })
    const bytes = new Uint8Array(await response.arrayBuffer())
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const sourceSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const rect = element.getBoundingClientRect()
    const centerX = rect.x + rect.width / 2
    const centerY = rect.y + rect.height / 2
    const elementsAtCenter = document.elementsFromPoint(centerX, centerY).map((node) => {
      const style = getComputedStyle(node)
      return {
        tagName: node.tagName,
        id: node.id,
        className: typeof node.className === 'string' ? node.className : '',
        role: node.getAttribute('role'),
        opacity: style.opacity,
        zIndex: style.zIndex,
        position: style.position,
        backgroundImage: style.backgroundImage,
        backgroundColor: style.backgroundColor,
        backgroundBlendMode: style.backgroundBlendMode,
        mixBlendMode: style.mixBlendMode,
        filter: style.filter,
        transform: style.transform,
      }
    })
    return { source, sourceBytes: bytes.byteLength, sourceSha256, elementsFromPoint: { x: centerX, y: centerY, stack: elementsAtCenter } }
  }})(${JSON.stringify({ source: liveStyle.source })})`)
  writeFileSync(join(outputDir, 'detail-art-live.png'), liveFull)
  writeFileSync(join(outputDir, 'detail-art-live-center.png'), liveCenter)

  const fullScenario = {
    viewport: scenario.viewport,
    roi: { x: 315, y: 140, width: 495, height: 495 },
    masks: [], subregions: [], colorSamples: [],
  }
  const centerScenario = {
    ...fullScenario,
    roi: { x: 347, y: 172, width: 431, height: 431 },
  }
  const childParentScenario = { ...fullScenario, roi: { x: 0, y: 0, width: 495, height: 495 } }
  const childParentComparison = await compareInBrowser(
    cdp,
    liveFull,
    liveChild,
    childParentScenario,
  )
  writeFileSync(join(outputDir, 'detail-art-live-child.png'), liveChild)
  writeFileSync(join(outputDir, 'detail-art-live-child-parent-diff.png'), childParentComparison.diffPng)
  const rawMinerSource = readFileSync(join(worktreeRoot, 'src', 'nft-miners', 'assets', 'bonus-miner-reference.png'))
  const overrideLifecycle = await evaluate(cdp, `(async function inspectOverrideLifecycle() {
    const art = document.querySelector('.pwm-detail-art-panel > .pwm-miner-visual .pwm-miner-reference-art')
    if (!art) throw new Error('Missing live detail art child.')
    const snapshot = () => {
      const computed = getComputedStyle(art)
      return {
        styleAttribute: art.getAttribute('style'),
        cssText: art.style.cssText,
        inline: {
          size: art.style.getPropertyValue('background-size'),
          sizePriority: art.style.getPropertyPriority('background-size'),
          position: art.style.getPropertyValue('background-position'),
          positionPriority: art.style.getPropertyPriority('background-position'),
          repeat: art.style.getPropertyValue('background-repeat'),
          repeatPriority: art.style.getPropertyPriority('background-repeat'),
        },
        computed: {
          size: computed.backgroundSize,
          position: computed.backgroundPosition,
          repeat: computed.backgroundRepeat,
        },
      }
    }
    const previous = {
      size: { value: art.style.getPropertyValue('background-size'), priority: art.style.getPropertyPriority('background-size') },
      position: { value: art.style.getPropertyValue('background-position'), priority: art.style.getPropertyPriority('background-position') },
      repeat: { value: art.style.getPropertyValue('background-repeat'), priority: art.style.getPropertyPriority('background-repeat') },
    }
    const mutations = []
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName === 'style') {
          mutations.push({ oldValue: record.oldValue, newValue: art.getAttribute('style') })
        }
      }
    })
    observer.observe(art, { attributes: true, attributeFilter: ['style'], attributeOldValue: true })
    const before = snapshot()
    art.style.setProperty('background-size', '1839px 1827px', 'important')
    art.style.setProperty('background-position', '-315px -140px', 'important')
    art.style.setProperty('background-repeat', 'no-repeat', 'important')
    const immediate = snapshot()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const afterTwoRaf = snapshot()
    observer.disconnect()
    return { previous, before, immediate, afterTwoRaf, mutations }
  })()`)
  await evaluate(cdp, `((previous) => {
    const art = document.querySelector('.pwm-detail-art-panel > .pwm-miner-visual .pwm-miner-reference-art')
    const properties = {
      'background-size': previous.size,
      'background-position': previous.position,
      'background-repeat': previous.repeat,
    }
    for (const [key, entry] of Object.entries(properties)) {
      if (entry.value) art.style.setProperty(key, entry.value, entry.priority)
      else art.style.removeProperty(key)
    }
  })(${JSON.stringify(overrideLifecycle.previous)})`)
  const childRawSourceComparison = await compareInBrowser(cdp, rawMinerSource, liveChild, fullScenario)
  writeFileSync(join(outputDir, 'detail-art-live-child-source-diff.png'), childRawSourceComparison.diffPng)
  const probeAComparison = await compareInBrowser(cdp, reference, probeA.data, fullScenario)
  const probeBComparison = await compareInBrowser(cdp, reference, probeB.data, fullScenario)
  const liveComparison = await compareInBrowser(cdp, reference, liveFull, fullScenario)
  const liveCenterComparison = await compareInBrowser(cdp, reference, liveCenter, centerScenario)
  writeFileSync(join(outputDir, 'detail-art-probe-a-diff.png'), probeAComparison.diffPng)
  writeFileSync(join(outputDir, 'detail-art-probe-b-diff.png'), probeBComparison.diffPng)

  return {
    source: {
      referencePhysicalCrop: { x: 630, y: 280, width: 990, height: 990 },
      sourceImage: liveStyle.source,
      sourceSha256: liveSourceInspection.sourceSha256,
      sourceBytes: liveSourceInspection.sourceBytes,
      expectedSha256: createHash('sha256').update(reference).digest('hex'),
      sourceHashMatchesReference: liveSourceInspection.sourceSha256 === createHash('sha256').update(reference).digest('hex'),
      pixelChannelTolerance: spec.pixelChannelTolerance,
    },
    liveStyle: {
      rect: liveStyle.rect,
      artRect: liveStyle.artRect,
      backgroundSize: liveStyle.backgroundSize,
      backgroundPosition: liveStyle.backgroundPosition,
      borderRadius: liveStyle.borderRadius,
      overflow: liveStyle.overflow,
    },
    captures: {
      liveFull: { dimensions: pngDimensions(liveFull), mismatchPercent: liveComparison.mismatchPercent, missingPixels: liveComparison.missingPixels },
      liveCenter: { clip: liveCenterClip, dimensions: pngDimensions(liveCenter), mismatchPercent: liveCenterComparison.mismatchPercent, missingPixels: liveCenterComparison.missingPixels },
      childDirect: { dimensions: pngDimensions(liveChild), mismatchPercentVsParent: childParentComparison.mismatchPercent, missingPixelsVsParent: childParentComparison.missingPixels, mismatchPercentVsRawSource: childRawSourceComparison.mismatchPercent, missingPixelsVsRawSource: childRawSourceComparison.missingPixels },
      overrideLifecycle,
      probeA: { dimensions: probeA.dimensions, dimensionPass: probeA.dimensionPass, probeRect: probeA.probeRect, mismatchPercent: probeAComparison.mismatchPercent, missingPixels: probeAComparison.missingPixels },
      probeB: { dimensions: probeB.dimensions, dimensionPass: probeB.dimensionPass, probeRect: probeB.probeRect, mismatchPercent: probeBComparison.mismatchPercent, missingPixels: probeBComparison.missingPixels },
      phasePlus: { baselineLayout: layoutBaseline, ...phasePlus },
      phaseMinus: { baselineLayout: layoutBaseline, ...phaseMinus },
    },
    sourceInspection: { elementsFromPoint: liveSourceInspection.elementsFromPoint },
  }
}

async function compareInBrowser(cdp, reference, actualRoi, scenario, measuredSubregions = [], actualAnchor = null, actualColorSamples = [], actualRoiClip = null) {
  const expression = `(${async function compare(input) {
    const decode = (source) => new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = source
    })
    const [referenceImage, actualImage, ...externalColorImages] = await Promise.all([
      decode(input.reference),
      decode(input.actualRoi),
      ...input.actualColorSamples.map((sample) => decode(sample.data)),
    ])
    const scale = input.dpr
    const roi = input.roi ?? { x: 0, y: 0, width: referenceImage.width / scale, height: referenceImage.height / scale }
    const roiPhysical = {
      x: Math.round(roi.x * scale),
      y: Math.round(roi.y * scale),
      width: Math.round(roi.width * scale),
      height: Math.round(roi.height * scale),
    }
    const referenceCanvas = document.createElement('canvas')
    referenceCanvas.width = roiPhysical.width
    referenceCanvas.height = roiPhysical.height
    const referenceContext = referenceCanvas.getContext('2d', { willReadFrequently: true })
    const referenceRoiInBounds = roiPhysical.x >= 0 && roiPhysical.y >= 0
      && roiPhysical.x + roiPhysical.width <= referenceImage.width
      && roiPhysical.y + roiPhysical.height <= referenceImage.height
    if (referenceRoiInBounds) referenceContext.drawImage(referenceImage, roiPhysical.x, roiPhysical.y, roiPhysical.width, roiPhysical.height, 0, 0, roiPhysical.width, roiPhysical.height)
    const referencePixels = referenceContext.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height).data
    const actualCanvas = document.createElement('canvas')
    actualCanvas.width = actualImage.width
    actualCanvas.height = actualImage.height
    const actualContext = actualCanvas.getContext('2d', { willReadFrequently: true })
    actualContext.drawImage(actualImage, 0, 0)
    const actualPixels = actualContext.getImageData(0, 0, actualCanvas.width, actualCanvas.height).data
    const diffCanvas = document.createElement('canvas')
    diffCanvas.width = referenceCanvas.width
    diffCanvas.height = referenceCanvas.height
    const diffContext = diffCanvas.getContext('2d', { willReadFrequently: true })
    const diff = diffContext.createImageData(diffCanvas.width, diffCanvas.height)
    const anchorDelta = input.anchor ? {
      x: input.anchor.actual.x - input.anchor.reference.x,
      y: input.anchor.actual.y - input.anchor.reference.y,
    } : { x: 0, y: 0 }
    const expectedActualWidth = Math.round(roi.width * scale)
    const expectedActualHeight = Math.round(roi.height * scale)
    const actualRoiDimensionsPass = actualCanvas.width === expectedActualWidth && actualCanvas.height === expectedActualHeight
    const masks = input.masks.map((mask) => ({
      x: (mask.rect.x - roi.x) * scale,
      y: (mask.rect.y - roi.y) * scale,
      width: mask.rect.width * scale,
      height: mask.rect.height * scale,
    }))
    const regions = input.subregions.map((region) => {
      const referenceRect = region.coordinateSpace === 'reference' ? region.rect : {
        ...region.rect,
        x: region.rect.x - anchorDelta.x,
        y: region.rect.y - anchorDelta.y,
      }
      const rect = {
        ...referenceRect,
        x: referenceRect.x - roi.x,
        y: referenceRect.y - roi.y,
      }
      return {
        ...region,
        referenceRect,
        rect,
        x: rect.x * scale,
        y: rect.y * scale,
        right: (rect.x + rect.width) * scale,
        bottom: (rect.y + rect.height) * scale,
        area: rect.width * rect.height,
        pixels: 0,
        mismatchedPixels: 0,
      }
    }).sort((a, b) => {
      const priority = (region) => region.classification === 'comparable'
        ? 2
        : region.selector == null && region.rect != null ? 0 : 1
      return priority(a) - priority(b)
        || a.area - b.area
        || (b.selector?.length ?? 0) - (a.selector?.length ?? 0)
        || a.id.localeCompare(b.id)
    })
    let rawCompared = 0
    let rawMismatched = 0
    let comparablePixels = 0
    let comparableMismatchedPixels = 0
    let blockedPixelsExcluded = 0
    let blockedMismatchedPixels = 0
    let unclassifiedPixels = 0
    let missing = 0
    let minX = referenceCanvas.width
    let minY = referenceCanvas.height
    let maxX = -1
    let maxY = -1
    const tolerance = input.channelTolerance
    for (let y = 0; y < referenceCanvas.height; y += 1) {
      for (let x = 0; x < referenceCanvas.width; x += 1) {
        if (masks.some((mask) => x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height)) continue
        rawCompared += 1
        const ri = (y * referenceCanvas.width + x) * 4
        const ai = (y * actualCanvas.width + x) * 4
        const inActual = x >= 0 && y >= 0 && x < actualCanvas.width && y < actualCanvas.height
        if (!inActual) missing += 1
        const mismatch = !inActual || Math.max(Math.abs(referencePixels[ri] - actualPixels[ai]), Math.abs(referencePixels[ri + 1] - actualPixels[ai + 1]), Math.abs(referencePixels[ri + 2] - actualPixels[ai + 2]), Math.abs(referencePixels[ri + 3] - actualPixels[ai + 3])) > tolerance
        if (mismatch) {
          rawMismatched += 1
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
          diff.data[ri] = 255; diff.data[ri + 1] = 40; diff.data[ri + 2] = 60; diff.data[ri + 3] = 255
        } else {
          const brightness = Math.abs(referencePixels[ri] - actualPixels[ai]) + Math.abs(referencePixels[ri + 1] - actualPixels[ai + 1]) + Math.abs(referencePixels[ri + 2] - actualPixels[ai + 2])
          diff.data[ri] = Math.min(255, brightness); diff.data[ri + 1] = Math.min(255, brightness); diff.data[ri + 2] = Math.min(255, brightness); diff.data[ri + 3] = brightness ? 180 : 0
        }
        const region = regions.find((candidate) => x >= candidate.x && x < candidate.right && y >= candidate.y && y < candidate.bottom)
        if (!region) {
          unclassifiedPixels += 1
          comparablePixels += 1
          if (mismatch) comparableMismatchedPixels += 1
        } else {
          region.pixels += 1
          if (mismatch) region.mismatchedPixels += 1
          if (region.classification === 'comparable') {
            comparablePixels += 1
            if (mismatch) comparableMismatchedPixels += 1
          } else {
            blockedPixelsExcluded += 1
            if (mismatch) blockedMismatchedPixels += 1
          }
        }
      }
    }
    diffContext.putImageData(diff, 0, 0)
    const meanRgb = (pixels, width, height, rect) => {
      const sx = Math.max(0, Math.floor(rect.x * scale)); const sy = Math.max(0, Math.floor(rect.y * scale))
      const ex = Math.min(width, Math.ceil((rect.x + rect.width) * scale)); const ey = Math.min(height, Math.ceil((rect.y + rect.height) * scale))
      let count = 0; const rgb = [0, 0, 0]
      for (let y = sy; y < ey; y += 1) for (let x = sx; x < ex; x += 1) { const i = (y * width + x) * 4; rgb[0] += pixels[i]; rgb[1] += pixels[i + 1]; rgb[2] += pixels[i + 2]; count += 1 }
      return rgb.map((value) => value / Math.max(1, count))
    }
    const lab = ([r, g, b]) => {
      const linear = (channel) => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
      const R = linear(r), G = linear(g), B = linear(b)
      let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
      let y = (R * 0.2126 + G * 0.7152 + B * 0.0722)
      let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
      const f = (v) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116
      x = f(x); y = f(y); z = f(z)
      return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
    }
    let sampleBoundsPass = referenceRoiInBounds
    const colors = await Promise.all(input.colorSamples.map(async (sample) => {
      const normalizedRect = {
        x: sample.rect.x - roi.x,
        y: sample.rect.y - roi.y,
        width: sample.rect.width,
        height: sample.rect.height,
      }
      const sampleInRoi = normalizedRect.x >= 0 && normalizedRect.y >= 0
        && normalizedRect.x + normalizedRect.width <= roi.width
        && normalizedRect.y + normalizedRect.height <= roi.height
      let refRgb
      if (sampleInRoi) {
        refRgb = meanRgb(referencePixels, referenceCanvas.width, referenceCanvas.height, normalizedRect)
      } else {
        const referenceSampleRect = {
          x: Math.round(sample.rect.x * scale),
          y: Math.round(sample.rect.y * scale),
          width: Math.round(sample.rect.width * scale),
          height: Math.round(sample.rect.height * scale),
        }
        const referenceSampleInBounds = referenceSampleRect.x >= 0 && referenceSampleRect.y >= 0
          && referenceSampleRect.x + referenceSampleRect.width <= referenceImage.width
          && referenceSampleRect.y + referenceSampleRect.height <= referenceImage.height
        sampleBoundsPass &&= referenceSampleInBounds
        if (referenceSampleInBounds) {
          const sampleCanvas = document.createElement('canvas')
          sampleCanvas.width = referenceSampleRect.width
          sampleCanvas.height = referenceSampleRect.height
          const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
          sampleContext.drawImage(referenceImage, referenceSampleRect.x, referenceSampleRect.y, referenceSampleRect.width, referenceSampleRect.height, 0, 0, referenceSampleRect.width, referenceSampleRect.height)
          const samplePixels = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data
          refRgb = meanRgb(samplePixels, sampleCanvas.width, sampleCanvas.height, { x: 0, y: 0, width: sample.rect.width, height: sample.rect.height })
        } else {
          refRgb = [0, 0, 0]
        }
      }
      let actualRgb
      let actualRect
      let samplingSurface
      if (sampleInRoi) {
        actualRgb = meanRgb(actualPixels, actualCanvas.width, actualCanvas.height, normalizedRect)
        actualRect = input.actualRoiClip ? {
          x: input.actualRoiClip.x + normalizedRect.x,
          y: input.actualRoiClip.y + normalizedRect.y,
          width: normalizedRect.width,
          height: normalizedRect.height,
        } : normalizedRect
        samplingSurface = 'actual-roi.png'
      } else {
        const index = input.actualColorSamples.findIndex((capture) => capture.id === sample.id)
        const image = externalColorImages[index]
        const capture = input.actualColorSamples[index]
        const expectedWidth = Math.round(sample.rect.width * scale)
        const expectedHeight = Math.round(sample.rect.height * scale)
        const captureMatchesSample = image != null && capture != null && image.width === expectedWidth && image.height === expectedHeight
        sampleBoundsPass &&= captureMatchesSample
        if (captureMatchesSample) {
          const canvas = document.createElement('canvas')
          canvas.width = image.width
          canvas.height = image.height
          const context = canvas.getContext('2d', { willReadFrequently: true })
          context.drawImage(image, 0, 0)
          actualRgb = meanRgb(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { x: 0, y: 0, width: sample.rect.width, height: sample.rect.height })
          actualRect = capture.pageRect
        } else {
          actualRgb = [0, 0, 0]
          actualRect = null
        }
        samplingSurface = capture?.path ?? null
      }
      const a = lab(refRgb), b = lab(actualRgb)
      const deltaE76 = Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
      return { id: sample.id, referenceRect: sample.rect, normalizedRect, actualRect, samplingSurface, referenceRgb: refRgb, actualRgb, deltaE76 }
    }))
    return {
      reference: { width: referenceImage.width, height: referenceImage.height },
      actualRoi: { width: actualCanvas.width, height: actualCanvas.height },
      expectedActualRoi: { width: expectedActualWidth, height: expectedActualHeight },
      actualRoiDimensionsPass,
      sampleBoundsPass,
      roiPhysical: { x: 0, y: 0, width: referenceCanvas.width, height: referenceCanvas.height },
      comparedPixels: rawCompared,
      mismatchedPixels: rawMismatched,
      missingPixels: missing,
      mismatchPercent: rawCompared ? rawMismatched / rawCompared * 100 : null,
      rawOverallMismatchPercent: rawCompared ? rawMismatched / rawCompared * 100 : null,
      comparablePixels,
      comparableMismatchedPixels,
      comparableMismatchPercent: comparablePixels ? comparableMismatchedPixels / comparablePixels * 100 : null,
      blockedPixelsExcluded,
      blockedMismatchedPixels,
      unclassifiedPixels,
      subregions: regions.map(({ id, selector, classification, reason, comparisonOutsetCssPx, rect, referenceRect, pixels, mismatchedPixels, computedStyle }) => ({
        id, selector, classification, reason, comparisonOutsetCssPx, rect, referenceRect, pixels, mismatchedPixels,
        computedStyle,
        mismatchPercent: pixels ? mismatchedPixels / pixels * 100 : null,
      })),
      mismatchBounds: maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      colorSamples: colors,
      diffPngDataUrl: diffCanvas.toDataURL('image/png'),
    }
  }})(${JSON.stringify({
    reference: `data:image/png;base64,${reference.toString('base64')}`,
    actualRoi: `data:image/png;base64,${actualRoi.toString('base64')}`,
    dpr: scenario.viewport.deviceScaleFactor,
    roi: scenario.roi,
    masks: scenario.masks ?? [],
    subregions: measuredSubregions,
    anchor: scenario.anchor ? { reference: scenario.anchor.reference, actual: actualAnchor } : null,
    actualRoiClip,
    channelTolerance: spec.pixelChannelTolerance,
    colorSamples: scenario.colorSamples ?? [],
    actualColorSamples: actualColorSamples.map((sample) => ({
      id: sample.id,
      data: `data:image/png;base64,${sample.data.toString('base64')}`,
      pageRect: sample.pageRect,
      path: sample.path,
    })),
  })})`
  const result = await evaluate(cdp, expression, 120000)
  const diffData = result.diffPngDataUrl.split(',')[1]
  delete result.diffPngDataUrl
  return { ...result, diffPng: Buffer.from(diffData, 'base64') }
}

async function measureSubregions(cdp, scenario) {
  const definitions = scenario.subregions ?? []
  for (const region of definitions) {
    assert.ok(['comparable', 'BLOCKED_ASSETS', 'BLOCKED_EVIDENCE'].includes(region.classification), `Unknown subregion classification: ${region.id}`)
    if (region.classification !== 'comparable') assert.ok(region.reason, `Blocked subregion ${region.id} requires a reason.`)
  }
  if (definitions.length === 0) return { regions: [], unresolved: [] }
  return await evaluate(cdp, `(() => {
    const definitions = ${JSON.stringify(definitions)}
    const regions = []
    const unresolved = []
    for (const definition of definitions) {
      const comparisonOutsetCssPx = definition.comparisonOutsetCssPx ?? 0
      if (definition.rect) {
        regions.push({
          id: definition.id,
          selector: null,
          classification: definition.classification,
          reason: definition.reason ?? null,
          comparisonOutsetCssPx,
          rect: {
            x: definition.rect.x - comparisonOutsetCssPx,
            y: definition.rect.y - comparisonOutsetCssPx,
            width: definition.rect.width + comparisonOutsetCssPx * 2,
            height: definition.rect.height + comparisonOutsetCssPx * 2,
          },
          coordinateSpace: 'reference',
        })
        continue
      }
      const matches = [...document.querySelectorAll(definition.selector)].filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && element.getClientRects().length > 0
      })
      if (matches.length === 0) {
        unresolved.push({ id: definition.id, selector: definition.selector, classification: definition.classification, reason: definition.reason ?? null })
        continue
      }
      matches.forEach((element, index) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        regions.push({
          id: matches.length > 1 ? definition.id + '-' + (index + 1) : definition.id,
          selector: definition.selector,
          classification: definition.classification,
          reason: definition.reason ?? null,
          comparisonOutsetCssPx,
          rect: {
            x: rect.left - comparisonOutsetCssPx,
            y: rect.top - comparisonOutsetCssPx,
            width: rect.width + comparisonOutsetCssPx * 2,
            height: rect.height + comparisonOutsetCssPx * 2,
          },
          coordinateSpace: 'actual',
          computedStyle: {
            display: style.display,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            color: style.color,
            backgroundColor: style.backgroundColor,
          },
        })
      })
    }
    return { regions, unresolved }
  })()`)
}

function analyzeCustomizerFrameLocalization(input) {
  return new Promise((resolve, reject) => {
    const loadImage = (source) => new Promise((resolveImage, rejectImage) => {
      const image = new Image()
      image.onload = () => resolveImage(image)
      image.onerror = rejectImage
      image.src = source
    })
    const edgeLabels = ['top', 'right', 'bottom', 'left']
    Promise.all([loadImage(input.reference), loadImage(input.actualRoi)]).then(([referenceImage, actualImage]) => {
      const pixelsOf = (image) => {
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(image, 0, 0)
        return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data }
      }
      const reference = pixelsOf(referenceImage)
      const actual = pixelsOf(actualImage)
      const scanEdge = (source, axis, expected, fixed, expectedBoundarySide, coordinateSpace) => {
        const dimension = axis === 'x' ? source.width : source.height
        const fixedDimension = axis === 'x' ? source.height : source.width
        const start = Math.max(0, expected - 6 * input.dpr)
        const endExclusive = Math.min(dimension, expected + 6 * input.dpr)
        const runs = []
        let runStart = null
        const isPurple = (position) => {
          const x = axis === 'x' ? position : fixed
          const y = axis === 'y' ? position : fixed
          if (fixed < 0 || fixed >= fixedDimension) return false
          const index = (y * source.width + x) * 4
          return Math.max(
            Math.abs(source.data[index] - input.purple[0]),
            Math.abs(source.data[index + 1] - input.purple[1]),
            Math.abs(source.data[index + 2] - input.purple[2]),
          ) <= input.channelTolerance
        }
        for (let position = start; position < endExclusive; position += 1) {
          if (isPurple(position)) {
            if (runStart === null) runStart = position
          } else if (runStart !== null) {
            runs.push({ start: runStart, endExclusive: position })
            runStart = null
          }
        }
        if (runStart !== null) runs.push({ start: runStart, endExclusive })
        const boundaryPosition = (run) => expectedBoundarySide === 'start' ? run.start : run.endExclusive
        const selected = [...runs].sort((a, b) => Math.abs(boundaryPosition(a) - expected) - Math.abs(boundaryPosition(b) - expected)
          || (b.endExclusive - b.start) - (a.endExclusive - a.start))[0] ?? null
        const formatRun = (run) => run ? {
          purpleRunStartPhysical: run.start,
          purpleRunEndPhysicalExclusive: run.endExclusive,
          purpleRunLengthPhysical: run.endExclusive - run.start,
          runLengthCssPx: (run.endExclusive - run.start) / input.dpr,
          offsetFromExpectedEdgeCssPx: (boundaryPosition(run) - expected) / input.dpr,
          touchesSearchStart: run.start === start,
          touchesSearchEnd: run.endExclusive === endExclusive,
          clippedBySearchWindow: run.start === start || run.endExclusive === endExclusive,
        } : {
          purpleRunStartPhysical: null,
          purpleRunEndPhysicalExclusive: null,
          purpleRunLengthPhysical: 0,
          runLengthCssPx: 0,
          offsetFromExpectedEdgeCssPx: null,
          touchesSearchStart: false,
          touchesSearchEnd: false,
          clippedBySearchWindow: false,
        }
        return {
          edge: axis === 'x' ? expectedBoundarySide === 'start' ? 'left' : 'right' : expectedBoundarySide === 'start' ? 'top' : 'bottom',
          coordinateSpace,
          axis,
          fixedCoordinatePhysical: fixed,
          expectedEdgePhysical: expected,
          searchRangePhysical: { start, endExclusive },
          runs: runs.map(formatRun),
          selectedPurpleRun: formatRun(selected),
        }
      }
      const referenceCell = input.referenceCell
      const referenceEdges = {
        top: scanEdge(reference, 'y', referenceCell.y * input.dpr, Math.round((referenceCell.x + referenceCell.width / 2) * input.dpr), 'start', 'full-reference-image physical pixels'),
        bottom: scanEdge(reference, 'y', (referenceCell.y + referenceCell.height) * input.dpr, Math.round((referenceCell.x + referenceCell.width / 2) * input.dpr), 'end', 'full-reference-image physical pixels'),
        left: scanEdge(reference, 'x', referenceCell.x * input.dpr, Math.round((referenceCell.y + referenceCell.height / 2) * input.dpr), 'start', 'full-reference-image physical pixels'),
        right: scanEdge(reference, 'x', (referenceCell.x + referenceCell.width) * input.dpr, Math.round((referenceCell.y + referenceCell.height / 2) * input.dpr), 'end', 'full-reference-image physical pixels'),
      }
      const actualRect = input.actualRectLocal
      const actualEdges = {
        top: scanEdge(actual, 'y', Math.round(actualRect.y * input.dpr), Math.round((actualRect.x + actualRect.width / 2) * input.dpr), 'start', 'actual-ROI-relative physical pixels'),
        bottom: scanEdge(actual, 'y', Math.round((actualRect.y + actualRect.height) * input.dpr), Math.round((actualRect.x + actualRect.width / 2) * input.dpr), 'end', 'actual-ROI-relative physical pixels'),
        left: scanEdge(actual, 'x', Math.round(actualRect.x * input.dpr), Math.round((actualRect.y + actualRect.height / 2) * input.dpr), 'start', 'actual-ROI-relative physical pixels'),
        right: scanEdge(actual, 'x', Math.round((actualRect.x + actualRect.width) * input.dpr), Math.round((actualRect.y + actualRect.height / 2) * input.dpr), 'end', 'actual-ROI-relative physical pixels'),
      }
      const referenceFrameRect = {
        left: referenceEdges.left.selectedPurpleRun.purpleRunStartPhysical,
        top: referenceEdges.top.selectedPurpleRun.purpleRunStartPhysical,
        right: referenceEdges.right.selectedPurpleRun.purpleRunEndPhysicalExclusive,
        bottom: referenceEdges.bottom.selectedPurpleRun.purpleRunEndPhysicalExclusive,
      }
      const localizedReferenceFrameRect = Object.values(referenceFrameRect).every(Number.isFinite) ? {
        x: referenceFrameRect.left / input.dpr,
        y: referenceFrameRect.top / input.dpr,
        width: (referenceFrameRect.right - referenceFrameRect.left) / input.dpr,
        height: (referenceFrameRect.bottom - referenceFrameRect.top) / input.dpr,
      } : null
      const liveControlPass = edgeLabels.every((edge) => {
        const selected = actualEdges[edge].selectedPurpleRun
        return selected.purpleRunLengthPhysical === input.liveBorderWidthCssPx * input.dpr
          && !selected.clippedBySearchWindow
      })
      const referenceRunsUnclipped = edgeLabels.every((edge) => !referenceEdges[edge].selectedPurpleRun.clippedBySearchWindow)
      resolve({
        referenceEdges,
        localizedReferenceFrameRect,
        referenceRunsUnclipped,
        referenceMeasurementAuthorized: liveControlPass && referenceRunsUnclipped,
        referenceUniformRunLengthCssPx: (() => {
          const lengths = edgeLabels.map((edge) => referenceEdges[edge].selectedPurpleRun.runLengthCssPx)
          return lengths.every((length) => length === lengths[0]) ? lengths[0] : null
        })(),
        liveControl: {
          computedBorderWidthCssPx: input.liveBorderWidthCssPx,
          edges: actualEdges,
          recoveredKnownWidthOnAllFourEdges: liveControlPass,
        },
      })
    }).catch(reject)
  })
}

function analyzeCustomizerBorderEdge(input) {
  return new Promise((resolve, reject) => {
    const loadImage = (source) => new Promise((resolveImage, rejectImage) => {
      const image = new Image()
      image.onload = () => resolveImage(image)
      image.onerror = rejectImage
      image.src = source
    })
    Promise.all([loadImage(input.reference), loadImage(input.actualRoi)]).then(([referenceImage, actualImage]) => {
      const width = input.cell.width * input.dpr
      const height = input.cell.height * input.dpr
      const referenceCellOrigin = { x: input.cell.x * input.dpr, y: input.cell.y * input.dpr }
      const actualCellOrigin = {
        x: Math.round((input.actualCell.x - input.actualRoiClip.x) * input.dpr),
        y: Math.round((input.actualCell.y - input.actualRoiClip.y) * input.dpr),
      }
      const referenceCanvas = document.createElement('canvas')
      referenceCanvas.width = width
      referenceCanvas.height = height
      const referenceContext = referenceCanvas.getContext('2d', { willReadFrequently: true })
      const referenceInBounds = referenceCellOrigin.x >= 0 && referenceCellOrigin.y >= 0
        && referenceCellOrigin.x + width <= referenceImage.width
        && referenceCellOrigin.y + height <= referenceImage.height
      if (!referenceInBounds) throw new Error('Reference selected cell crop exceeds its source screenshot.')
      referenceContext.drawImage(referenceImage, referenceCellOrigin.x, referenceCellOrigin.y, width, height, 0, 0, width, height)
      const referencePixels = referenceContext.getImageData(0, 0, width, height).data
      const actualCanvas = document.createElement('canvas')
      actualCanvas.width = width
      actualCanvas.height = height
      const actualContext = actualCanvas.getContext('2d', { willReadFrequently: true })
      const actualInBounds = actualCellOrigin.x >= 0 && actualCellOrigin.y >= 0
        && actualCellOrigin.x + width <= actualImage.width
        && actualCellOrigin.y + height <= actualImage.height
      if (!actualInBounds) throw new Error('Actual selected cell crop exceeds its captured full ROI.')
      actualContext.drawImage(actualImage, actualCellOrigin.x, actualCellOrigin.y, width, height, 0, 0, width, height)
      const actualPixels = actualContext.getImageData(0, 0, width, height).data
      const edges = {
        top: { xStart: 24 * input.dpr, xEnd: 64 * input.dpr, yStart: 0 },
        left: { yStart: 24 * input.dpr, yEnd: 64 * input.dpr, xStart: 0 },
      }
      const results = []
      for (let band = 0; band < 4; band += 1) {
        const bandStart = band * input.dpr
        const bandEnd = (band + 1) * input.dpr
        const edgeResults = {}
        for (const [edge, span] of Object.entries(edges)) {
          let pixels = 0
          let mismatchedPixels = 0
          const referenceRgb = [0, 0, 0]
          const actualRgb = [0, 0, 0]
          const xStart = edge === 'top' ? span.xStart : bandStart
          const xEnd = edge === 'top' ? span.xEnd : bandEnd
          const yStart = edge === 'top' ? bandStart : span.yStart
          const yEnd = edge === 'top' ? bandEnd : span.yEnd
          for (let y = yStart; y < yEnd; y += 1) {
            for (let x = xStart; x < xEnd; x += 1) {
              const index = (y * width + x) * 4
              const channelDifference = Math.max(
                Math.abs(referencePixels[index] - actualPixels[index]),
                Math.abs(referencePixels[index + 1] - actualPixels[index + 1]),
                Math.abs(referencePixels[index + 2] - actualPixels[index + 2]),
              )
              if (channelDifference > input.channelTolerance) mismatchedPixels += 1
              referenceRgb[0] += referencePixels[index]
              referenceRgb[1] += referencePixels[index + 1]
              referenceRgb[2] += referencePixels[index + 2]
              actualRgb[0] += actualPixels[index]
              actualRgb[1] += actualPixels[index + 1]
              actualRgb[2] += actualPixels[index + 2]
              pixels += 1
            }
          }
          edgeResults[edge] = {
            pixels,
            mismatchedPixels,
            mismatchPercent: pixels ? mismatchedPixels / pixels * 100 : null,
            meanRgbReference: referenceRgb.map((value) => value / Math.max(1, pixels)),
            meanRgbActual: actualRgb.map((value) => value / Math.max(1, pixels)),
          }
        }
        results.push({
          band: 'band ' + band + '–' + (band + 1) + ' CSS px',
          physicalBandPx: input.dpr,
          top: edgeResults.top,
          left: edgeResults.left,
        })
      }
      resolve({
        cellLocalPhysicalDimensions: { width, height },
        referenceCellOriginPhysical: referenceCellOrigin,
        actualCellOriginPhysicalInRoi: actualCellOrigin,
        coordinatePolicy: 'Each image is sampled from its own selected-cell origin. Compare equal local x/y offsets; page-global placement does not enter pixel matching.',
        bands: results,
      })
    }).catch(reject)
  })
}

async function captureCustomizerSelectedFrameLocalizationDiagnostic(cdp, port, scenarios) {
  const outputDir = join(worktreeRoot, 'UI-UX', 'Mineros-customizables', 'evidence', 'iteration-11')
  mkdirSync(outputDir, { recursive: true })
  const referenceCell = { x: 643, y: 827, width: 89, height: 89 }
  const dpr = 2
  const purple = [117, 64, 239]
  assert.deepEqual(scenarios.map(({ id }) => id), ['customizer-wall', 'customizer-screen'])
  assert.deepEqual(spec.scenarios.find((scenario) => scenario.id === 'customizer-wall').expectedGeometry['.pwm-option-cell'], referenceCell)
  const results = []

  for (const scenario of scenarios) {
    assert.equal(scenario.viewport.deviceScaleFactor, dpr)
    const scenarioDir = join(outputDir, scenario.id)
    mkdirSync(scenarioDir, { recursive: true })
    await drainFetchHandlers()
    await seedAndNavigate(cdp, `http://127.0.0.1:${port}`, port, scenario, scenario.viewport)
    const state = await prepareVisualState(cdp, scenario)
    await waitForRouteReady(cdp, scenario)
    await waitForVisualStability(cdp, scenario.readySelectors, `${scenario.id} selected frame localization diagnostic`)
    assertMinerRoute(await evaluate(cdp, 'location.pathname'), `frame localization diagnostic ${scenario.id}`)
    assert.ok(!state.blockedEvidence, `${scenario.id} fixture is blocked: ${state.blockedEvidence}`)

    const live = await evaluate(cdp, `(() => {
      const grid = document.querySelector('.pwm-option-grid')
      const cells = Array.from(grid?.querySelectorAll(':scope > .pwm-option-cell') ?? [])
      const selected = cells.map((cell, index) => ({ cell, index })).filter(({ cell }) => cell.getAttribute('aria-selected') === 'true')
      const selectedCell = selected[0]?.cell
      const option = selectedCell?.querySelector('.pwm-option')
      const rect = (element) => {
        const value = element.getBoundingClientRect()
        return { x: value.x, y: value.y, width: value.width, height: value.height }
      }
      const style = option ? getComputedStyle(option) : null
      const customizer = document.querySelector('.pwm-customizer-column')
      return {
        pathname: location.pathname,
        selectedIndices: selected.map(({ index }) => index + 1),
        selectedCellRect: selectedCell ? rect(selectedCell) : null,
        selectedOptionRect: option ? rect(option) : null,
        customizerRect: customizer ? rect(customizer) : null,
        optionClassName: option?.className ?? null,
        optionComputedStyle: style ? {
          borderTopWidth: style.borderTopWidth,
          borderRightWidth: style.borderRightWidth,
          borderBottomWidth: style.borderBottomWidth,
          borderLeftWidth: style.borderLeftWidth,
          borderTopColor: style.borderTopColor,
          borderRightColor: style.borderRightColor,
          borderBottomColor: style.borderBottomColor,
          borderLeftColor: style.borderLeftColor,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          backgroundColor: style.backgroundColor,
        } : null,
      }
    })()`)
    assert.deepEqual(live.selectedIndices, [1], `${scenario.id} must have exactly the first option selected.`)
    assert.ok(live.selectedOptionRect && live.customizerRect, `${scenario.id} is missing its live selected option or customizer anchor.`)
    const actualAnchor = live.customizerRect
    const actualRoiClip = {
      x: actualAnchor.x + (scenario.roi.x - scenario.anchor.reference.x),
      y: actualAnchor.y + (scenario.roi.y - scenario.anchor.reference.y),
      width: scenario.roi.width,
      height: scenario.roi.height,
    }
    const actualRoiResult = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      omitBackground: false,
      clip: { ...actualRoiClip, scale: 1 },
    })
    const actualRoi = Buffer.from(actualRoiResult.data, 'base64')
    const actualRoiPath = join(scenarioDir, 'selected-frame-localization-actual-roi.png')
    writeFileSync(actualRoiPath, actualRoi)
    const reference = readFileSync(join(worktreeRoot, 'UI-UX', 'Mineros-customizables', scenario.reference))
    assert.deepEqual(pngDimensions(actualRoi), { width: scenario.roi.width * dpr, height: scenario.roi.height * dpr })
    const actualRectLocal = {
      x: live.selectedOptionRect.x - actualRoiClip.x,
      y: live.selectedOptionRect.y - actualRoiClip.y,
      width: live.selectedOptionRect.width,
      height: live.selectedOptionRect.height,
    }
    const liveBorderWidthCssPx = Number.parseFloat(live.optionComputedStyle.borderTopWidth)
    assert.equal(liveBorderWidthCssPx, 3, `${scenario.id} live control border is no longer 3px.`)
    const pixelLocalization = await evaluate(cdp, `(${analyzeCustomizerFrameLocalization.toString()})(${JSON.stringify({
      reference: `data:image/png;base64,${reference.toString('base64')}`,
      actualRoi: `data:image/png;base64,${actualRoi.toString('base64')}`,
      dpr,
      referenceCell,
      actualRectLocal,
      purple,
      channelTolerance: spec.pixelChannelTolerance,
      liveBorderWidthCssPx,
    })})`, 120000)
    const expectedReferenceEdges = {
      top: referenceCell.y,
      right: referenceCell.x + referenceCell.width,
      bottom: referenceCell.y + referenceCell.height,
      left: referenceCell.x,
    }
    const referenceOffsetsCssPx = Object.fromEntries(Object.entries(pixelLocalization.referenceEdges).map(([edge, result]) => {
      const run = result.selectedPurpleRun
      const edgePhysical = expectedReferenceEdges[edge] * dpr
      const frameEdgePhysical = edge === 'top' || edge === 'left'
        ? run.purpleRunStartPhysical
        : run.purpleRunEndPhysicalExclusive
      return [edge, frameEdgePhysical === null ? null : (frameEdgePhysical - edgePhysical) / dpr]
    }))
    results.push({
      id: scenario.id,
      status: !pixelLocalization.liveControl.recoveredKnownWidthOnAllFourEdges
        ? 'DIAGNOSTIC_INVALID_LIVE_CONTROL'
        : pixelLocalization.referenceMeasurementAuthorized ? 'DIAGNOSTIC_COMPLETE' : 'REFERENCE_RUN_CLIPPED',
      route: scenario.route,
      fixture: scenario.fixture,
      state: scenario.state,
      reference: {
        path: scenario.reference,
        sha256: createHash('sha256').update(reference).digest('hex'),
        dimensions: pngDimensions(reference),
        expectedCellRect: referenceCell,
        deviceScaleFactor: dpr,
        purpleTarget: { cssHex: '#7540ef', rgb: purple },
        edges: pixelLocalization.referenceEdges,
        localizedFrameRect: pixelLocalization.localizedReferenceFrameRect,
        runsUnclipped: pixelLocalization.referenceRunsUnclipped,
        measurementAuthorized: pixelLocalization.referenceMeasurementAuthorized,
        localizedEdgeOffsetsCssPx: referenceOffsetsCssPx,
        uniformPurpleRunLengthCssPx: pixelLocalization.referenceUniformRunLengthCssPx,
      },
      actualControl: {
        route: live.pathname,
        selectedIndices: live.selectedIndices,
        roiClip: actualRoiClip,
        roiDimensions: pngDimensions(actualRoi),
        roiPath: actualRoiPath,
        sha256: createHash('sha256').update(actualRoi).digest('hex'),
        selectedCellRect: live.selectedCellRect,
        selectedOptionRect: live.selectedOptionRect,
        selectedOptionRectLocal: actualRectLocal,
        className: live.optionClassName,
        computedStyle: live.optionComputedStyle,
        expectedBorderWidthCssPx: liveBorderWidthCssPx,
        edges: pixelLocalization.liveControl.edges,
        recoveredKnownWidthOnAllFourEdges: pixelLocalization.liveControl.recoveredKnownWidthOnAllFourEdges,
      },
    })
  }

  const liveControlPass = results.every((result) => result.actualControl.recoveredKnownWidthOnAllFourEdges)
  const report = {
    taskId: 'miner_customization_nft_miners',
    iteration: 11,
    id: 'customizer-selected-frame-localization-diagnostic',
    status: liveControlPass ? 'DIAGNOSTIC_COMPLETE' : 'DIAGNOSTIC_INVALID_LIVE_CONTROL',
    method: {
      scenarios: ['customizer-wall', 'customizer-screen'],
      productStylesInjected: false,
      productCssChanged: false,
      perCellCdpScreenshots: 0,
      deviceScaleFactor: dpr,
      target: { cssHex: '#7540ef', rgb: purple, channelTolerance: spec.pixelChannelTolerance },
      referenceExpectedCellRect: referenceCell,
      centerlines: {
        verticalXCss: referenceCell.x + referenceCell.width / 2,
        horizontalYCss: referenceCell.y + referenceCell.height / 2,
      },
      edgeSearchCssPx: [-6, 6],
      localizedRectUsesDetectedPurpleRunEdges: true,
      liveControlPass,
    },
    scenarios: results,
  }
  const reportPath = join(outputDir, 'customizer-selected-frame-localization-diagnostic.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  return {
    id: report.id,
    status: liveControlPass ? 'DIAGNOSTIC_COMPLETE' : 'FAIL_HARNESS_COMPARISON',
    reportPath,
    scenarios: results.map(({ id, status, reference, actualControl }) => ({
      id,
      status,
      localizedReferenceFrameRect: reference.localizedFrameRect,
      referenceOffsetsCssPx: reference.localizedEdgeOffsetsCssPx,
      referenceRunLengthsCssPx: Object.fromEntries(Object.entries(reference.edges).map(([edge, value]) => [edge, value.selectedPurpleRun.runLengthCssPx])),
      referenceMeasurementAuthorized: reference.measurementAuthorized,
      liveRunLengthsCssPx: Object.fromEntries(Object.entries(actualControl.edges).map(([edge, value]) => [edge, value.selectedPurpleRun.runLengthCssPx])),
      liveControlPass: actualControl.recoveredKnownWidthOnAllFourEdges,
    })),
  }
}

async function captureCustomizerBorderEdgeDiagnostic(cdp, port, scenarios) {
  const outputDir = join(worktreeRoot, 'UI-UX', 'Mineros-customizables', 'evidence', 'iteration-11')
  mkdirSync(outputDir, { recursive: true })
  const cell = { x: 643, y: 827, width: 89, height: 89 }
  const dpr = 2
  assert.deepEqual(scenarios.map(({ id }) => id), ['customizer-wall', 'customizer-screen'])
  assert.deepEqual(spec.scenarios.find((scenario) => scenario.id === 'customizer-wall').expectedGeometry['.pwm-option-cell'], cell)
  const results = []

  for (const scenario of scenarios) {
    assert.equal(scenario.viewport.deviceScaleFactor, dpr)
    const scenarioDir = join(outputDir, scenario.id)
    mkdirSync(scenarioDir, { recursive: true })
    await drainFetchHandlers()
    await seedAndNavigate(cdp, `http://127.0.0.1:${port}`, port, scenario, scenario.viewport)
    const state = await prepareVisualState(cdp, scenario)
    await waitForRouteReady(cdp, scenario)
    await waitForVisualStability(cdp, scenario.readySelectors, `${scenario.id} selected border edge diagnostic`)
    assertMinerRoute(await evaluate(cdp, 'location.pathname'), `border edge diagnostic ${scenario.id}`)
    assert.ok(!state.blockedEvidence, `${scenario.id} fixture is blocked: ${state.blockedEvidence}`)

    const live = await evaluate(cdp, `(() => {
      const grid = document.querySelector('.pwm-option-grid')
      const cells = Array.from(grid?.querySelectorAll(':scope > .pwm-option-cell') ?? [])
      const selected = cells.map((cell, index) => ({ cell, index })).filter(({ cell }) => cell.getAttribute('aria-selected') === 'true')
      const first = selected[0]?.cell
      const option = first?.querySelector('.pwm-option')
      const visualRect = (element) => {
        const value = element.getBoundingClientRect()
        return { x: value.x, y: value.y, width: value.width, height: value.height }
      }
      const style = option ? getComputedStyle(option) : null
      return {
        pathname: location.pathname,
        selectedIndices: selected.map(({ index }) => index + 1),
        cellRect: first ? visualRect(first) : null,
        optionRect: option ? visualRect(option) : null,
        optionClassName: option?.className ?? null,
        optionComputedStyle: style ? {
          borderTopWidth: style.borderTopWidth,
          borderRightWidth: style.borderRightWidth,
          borderBottomWidth: style.borderBottomWidth,
          borderLeftWidth: style.borderLeftWidth,
          borderTopColor: style.borderTopColor,
          borderRightColor: style.borderRightColor,
          borderBottomColor: style.borderBottomColor,
          borderLeftColor: style.borderLeftColor,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          backgroundColor: style.backgroundColor,
        } : null,
        customizerRect: (() => {
          const element = document.querySelector('.pwm-customizer-column')
          return element ? visualRect(element) : null
        })(),
      }
    })()`)
    assert.deepEqual(live.selectedIndices, [1], `${scenario.id} must have exactly the first option selected.`)
    assert.ok(live.cellRect && live.optionRect, `${scenario.id} is missing its selected cell or option.`)
    const actualAnchor = live.customizerRect
    assert.ok(actualAnchor, `${scenario.id} is missing the customizer anchor.`)
    const actualRoiClip = {
      x: actualAnchor.x + (scenario.roi.x - scenario.anchor.reference.x),
      y: actualAnchor.y + (scenario.roi.y - scenario.anchor.reference.y),
      width: scenario.roi.width,
      height: scenario.roi.height,
    }
    const actualRoiResult = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      omitBackground: false,
      clip: { ...actualRoiClip, scale: 1 },
    })
    const actualRoi = Buffer.from(actualRoiResult.data, 'base64')
    const actualRoiPath = join(scenarioDir, 'border-edge-actual-roi.png')
    writeFileSync(actualRoiPath, actualRoi)
    const reference = readFileSync(join(worktreeRoot, 'UI-UX', 'Mineros-customizables', scenario.reference))
    const expectedRoi = {
      width: scenario.roi.width * dpr,
      height: scenario.roi.height * dpr,
    }
    assert.deepEqual(pngDimensions(actualRoi), expectedRoi, `${scenario.id} border probe ROI dimensions changed.`)
    const pixelResults = await evaluate(cdp, `(${analyzeCustomizerBorderEdge.toString()})(${JSON.stringify({
      reference: `data:image/png;base64,${reference.toString('base64')}`,
      actualRoi: `data:image/png;base64,${actualRoi.toString('base64')}`,
      dpr,
      cell,
      actualCell: live.cellRect,
      actualRoiClip,
      channelTolerance: spec.pixelChannelTolerance,
    })})`, 120000)

    results.push({
      id: scenario.id,
      status: 'DIAGNOSTIC_COMPLETE',
      route: scenario.route,
      fixture: scenario.fixture,
      state: scenario.state,
      reference: {
        path: scenario.reference,
        sha256: createHash('sha256').update(reference).digest('hex'),
        dimensions: pngDimensions(reference),
        selectedCell: cell,
        dpr,
        sampling: {
          topEdgeLocalXCss: [24, 64],
          leftEdgeLocalYCss: [24, 64],
          cornerExclusionCssPx: 24,
        },
      },
      actual: {
        roiClip: actualRoiClip,
        roiDimensions: pngDimensions(actualRoi),
        roiPath: actualRoiPath,
        sha256: createHash('sha256').update(actualRoi).digest('hex'),
        selectedCellRect: live.cellRect,
        selectedOptionRect: live.optionRect,
        optionClassName: live.optionClassName,
        computedStyle: live.optionComputedStyle,
        selectedIndices: live.selectedIndices,
      },
      comparison: {
        channelTolerance: spec.pixelChannelTolerance,
        cropMethod: 'One full ROI screenshot per state; each image is sampled relative to its own first-selected-cell origin.',
        pixelResults,
      },
    })
  }

  const report = {
    taskId: 'miner_customization_nft_miners',
    iteration: 11,
    id: 'customizer-border-edge-diagnostic',
    status: 'DIAGNOSTIC_COMPLETE',
    method: {
      scenarios: ['customizer-wall', 'customizer-screen'],
      productStylesInjected: false,
      productCssChanged: false,
      perCellCdpScreenshots: 0,
      referenceSelectedCell: cell,
      deviceScaleFactor: dpr,
      localEdges: {
        top: { xCss: [24, 64], yBandsCss: [[0, 1], [1, 2], [2, 3], [3, 4]] },
        left: { yCss: [24, 64], xBandsCss: [[0, 1], [1, 2], [2, 3], [3, 4]] },
      },
      referenceCoordinatesDoNotUsePageGlobalActualPosition: true,
      gapMeasurement: 'Not included; reference grid container extent remains derived.',
    },
    scenarios: results,
  }
  const reportPath = join(outputDir, 'customizer-border-edge-diagnostic.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  return {
    id: report.id,
    status: report.status,
    reportPath,
    scenarios: results.map(({ id, comparison }) => ({
      id,
      topBands: comparison.pixelResults.bands.map(({ band, top }) => ({ band, mismatchPercent: top.mismatchPercent, meanRgbReference: top.meanRgbReference, meanRgbActual: top.meanRgbActual })),
      leftBands: comparison.pixelResults.bands.map(({ band, left }) => ({ band, mismatchPercent: left.mismatchPercent, meanRgbReference: left.meanRgbReference, meanRgbActual: left.meanRgbActual })),
    })),
  }
}

async function captureCustomizerGridChromeDiagnostic(cdp, port, scenarios) {
  const outputDir = join(worktreeRoot, 'UI-UX', 'Mineros-customizables', 'evidence', 'iteration-11')
  mkdirSync(outputDir, { recursive: true })
  const wallScenario = spec.scenarios.find((scenario) => scenario.id === 'customizer-wall')
  const referenceCell = wallScenario.expectedGeometry['.pwm-option-cell']
  const columns = 6
  const rows = 3
  const gapCssPx = 4
  const referenceSelectedIndex = 0
  assert.deepEqual(referenceCell, { x: 643, y: 827, width: 89, height: 89 }, 'The parity spec reference first-cell geometry changed.')
  assert.deepEqual(scenarios.map(({ id }) => id), ['customizer-wall', 'customizer-screen'])

  const referenceCells = Array.from({ length: columns * rows }, (_, index) => ({
    index: index + 1,
    selected: index === referenceSelectedIndex,
    cellRect: {
      x: referenceCell.x + index % columns * (referenceCell.width + gapCssPx),
      y: referenceCell.y + Math.floor(index / columns) * (referenceCell.height + gapCssPx),
      width: referenceCell.width,
      height: referenceCell.height,
    },
  }))
  const results = []
  for (const scenario of scenarios) {
    assert.equal(scenario.viewport.deviceScaleFactor, 2, `${scenario.id} must retain the reference DPR.`)
    const scenarioDir = join(outputDir, scenario.id)
    mkdirSync(scenarioDir, { recursive: true })
    await drainFetchHandlers()
    await seedAndNavigate(cdp, `http://127.0.0.1:${port}`, port, scenario, scenario.viewport)
    const state = await prepareVisualState(cdp, scenario)
    await waitForRouteReady(cdp, scenario)
    await waitForVisualStability(cdp, scenario.readySelectors, `${scenario.id} grid chrome diagnostic`)
    assertMinerRoute(await evaluate(cdp, 'location.pathname'), `grid chrome diagnostic ${scenario.id}`)
    assert.ok(!state.blockedEvidence, `${scenario.id} fixture is blocked: ${state.blockedEvidence}`)

    const live = await evaluate(cdp, `(() => {
      const rect = (element) => {
        if (!element) return null
        const value = element.getBoundingClientRect()
        return { x: value.x, y: value.y, width: value.width, height: value.height, top: value.top, right: value.right, bottom: value.bottom }
      }
      const styleFields = [
        'display', 'position', 'boxSizing', 'width', 'height', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'margin', 'overflow', 'gridTemplateColumns', 'rowGap', 'columnGap',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
        'borderRadius', 'backgroundColor', 'color', 'opacity', 'boxShadow', 'outlineWidth',
        'outlineStyle', 'outlineColor', 'filter', 'transform',
      ]
      const style = (element) => {
        if (!element) return null
        const computed = getComputedStyle(element)
        return Object.fromEntries(styleFields.map((field) => [field, computed[field]]))
      }
      const info = (element, selector) => element ? {
        selector,
        tagName: element.tagName,
        className: typeof element.className === 'string' ? element.className : '',
        rect: rect(element),
        computedStyle: style(element),
      } : null
      const grid = document.querySelector('.pwm-option-grid')
      const cells = Array.from(grid?.querySelectorAll(':scope > .pwm-option-cell') ?? [])
      return {
        pathname: location.pathname,
        customizer: rect(document.querySelector('.pwm-customizer-column')),
        grid: {
          rect: rect(grid),
          computedStyle: style(grid),
          cells: cells.map((cell, index) => {
            const option = cell.querySelector('.pwm-option')
            return {
              index: index + 1,
              selected: cell.getAttribute('aria-selected') === 'true' || option?.getAttribute('aria-pressed') === 'true',
              cell: info(cell, '.pwm-option-cell'),
              option: info(option, '.pwm-option'),
              help: info(cell.querySelector('.pwm-option-help'), '.pwm-option-help'),
              lock: info(cell.querySelector('.pwm-option-lock'), '.pwm-option-lock'),
              check: info(cell.querySelector('.pwm-option-check'), '.pwm-option-check'),
            }
          }),
        },
      }
    })()`)
    assert.equal(live.grid.cells.length, columns * rows, `${scenario.id} must expose 18 real option cells.`)
    const selectedIndices = live.grid.cells.filter((cell) => cell.selected).map((cell) => cell.index - 1)
    assert.deepEqual(selectedIndices, [referenceSelectedIndex], `${scenario.id} selected option differs from the first-cell reference state.`)
    const gridPadding = {
      top: Number.parseFloat(live.grid.computedStyle.paddingTop),
      right: Number.parseFloat(live.grid.computedStyle.paddingRight),
      bottom: Number.parseFloat(live.grid.computedStyle.paddingBottom),
      left: Number.parseFloat(live.grid.computedStyle.paddingLeft),
    }
    const referenceGridRect = {
      x: referenceCell.x - gridPadding.left,
      y: referenceCell.y - gridPadding.top,
      width: columns * referenceCell.width + (columns - 1) * gapCssPx + gridPadding.left + gridPadding.right,
      height: rows * referenceCell.height + (rows - 1) * gapCssPx + gridPadding.top + gridPadding.bottom,
    }

    const actualAnchor = live.customizer
    assert.ok(actualAnchor, `${scenario.id} is missing the customizer anchor.`)
    const actualRoiClip = {
      x: actualAnchor.x + (scenario.roi.x - scenario.anchor.reference.x),
      y: actualAnchor.y + (scenario.roi.y - scenario.anchor.reference.y),
      width: scenario.roi.width,
      height: scenario.roi.height,
    }
    const actualRoiResult = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      omitBackground: false,
      clip: { ...actualRoiClip, scale: 1 },
    })
    const actualRoi = Buffer.from(actualRoiResult.data, 'base64')
    const actualRoiPath = join(scenarioDir, 'actual-roi.png')
    writeFileSync(actualRoiPath, actualRoi)
    const reference = readFileSync(join(worktreeRoot, 'UI-UX', 'Mineros-customizables', scenario.reference))
    const expectedPhysicalDimensions = {
      width: scenario.roi.width * scenario.viewport.deviceScaleFactor,
      height: scenario.roi.height * scenario.viewport.deviceScaleFactor,
    }
    assert.deepEqual(pngDimensions(actualRoi), expectedPhysicalDimensions, `${scenario.id} full ROI dimensions changed.`)

    const actualCells = live.grid.cells.map((cell) => ({
      index: cell.index,
      selected: cell.selected,
      cellRect: cell.cell.rect,
      frameRect: cell.option?.rect ?? cell.cell.rect,
    }))
    const comparison = await evaluate(cdp, `((input) => new Promise((resolve, reject) => {
      const loadImage = (source) => new Promise((resolveImage, rejectImage) => {
        const image = new Image()
        image.onload = () => resolveImage(image)
        image.onerror = rejectImage
        image.src = source
      })
      Promise.all([loadImage(input.reference), loadImage(input.actualRoi)]).then(([referenceImage, actualImage]) => {
        const dpr = input.dpr
        const referenceCanvas = document.createElement('canvas')
        referenceCanvas.width = input.physical.width
        referenceCanvas.height = input.physical.height
        const referenceContext = referenceCanvas.getContext('2d', { willReadFrequently: true })
        const referenceCrop = {
          x: Math.round(input.roi.x * dpr),
          y: Math.round(input.roi.y * dpr),
          width: input.physical.width,
          height: input.physical.height,
        }
        const referenceBoundsPass = referenceCrop.x >= 0 && referenceCrop.y >= 0
          && referenceCrop.x + referenceCrop.width <= referenceImage.width
          && referenceCrop.y + referenceCrop.height <= referenceImage.height
        if (!referenceBoundsPass) throw new Error('Reference ROI crop exceeds its source screenshot.')
        referenceContext.drawImage(referenceImage, referenceCrop.x, referenceCrop.y, referenceCrop.width, referenceCrop.height, 0, 0, referenceCanvas.width, referenceCanvas.height)
        const referencePixels = referenceContext.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height).data
        const actualCanvas = document.createElement('canvas')
        actualCanvas.width = actualImage.width
        actualCanvas.height = actualImage.height
        const actualContext = actualCanvas.getContext('2d', { willReadFrequently: true })
        actualContext.drawImage(actualImage, 0, 0)
        const actualPixels = actualContext.getImageData(0, 0, actualCanvas.width, actualCanvas.height).data
        if (actualCanvas.width !== referenceCanvas.width || actualCanvas.height !== referenceCanvas.height) {
          throw new Error('Reference and actual full ROI physical dimensions differ.')
        }

        const toPhysicalRect = (rect, origin) => ({
          x: Math.round((rect.x - origin.x) * dpr),
          y: Math.round((rect.y - origin.y) * dpr),
          width: Math.round(rect.width * dpr),
          height: Math.round(rect.height * dpr),
        })
        const referenceLayout = {
          gridRect: toPhysicalRect(input.referenceGridRect, input.roi),
          cells: input.referenceCells.map((cell) => ({
            index: cell.index,
            selected: cell.selected,
            cellRect: toPhysicalRect(cell.cellRect, input.roi),
            frameRect: toPhysicalRect(cell.cellRect, input.roi),
          })),
        }
        const actualLayout = {
          gridRect: toPhysicalRect(input.actualGridRect, input.actualRoiClip),
          cells: input.actualCells.map((cell) => ({
            index: cell.index,
            selected: cell.selected,
            cellRect: toPhysicalRect(cell.cellRect, input.actualRoiClip),
            frameRect: toPhysicalRect(cell.frameRect, input.actualRoiClip),
          })),
        }
        const inRect = (x, y, rect) => x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height
        const isGap = (layout, x, y) => inRect(x, y, layout.gridRect)
          && !layout.cells.some((cell) => inRect(x, y, cell.cellRect))
        const ringContains = (x, y, rect, insetStart, insetEnd) => {
          const outerInset = insetStart * dpr
          const innerInset = insetEnd * dpr
          return inRect(x, y, {
            x: rect.x + outerInset,
            y: rect.y + outerInset,
            width: rect.width - 2 * outerInset,
            height: rect.height - 2 * outerInset,
          }) && !inRect(x, y, {
            x: rect.x + innerInset,
            y: rect.y + innerInset,
            width: rect.width - 2 * innerInset,
            height: rect.height - 2 * innerInset,
          })
        }
        const inBand = (x, y, rect, band) => ringContains(x, y, rect, band, band + 1)
        const selectedCells = (layout, selected) => layout.cells.filter((cell) => cell.selected === selected)
        const regionBounds = {
          x: Math.max(0, Math.min(referenceLayout.gridRect.x, actualLayout.gridRect.x)),
          y: Math.max(0, Math.min(referenceLayout.gridRect.y, actualLayout.gridRect.y)),
          right: Math.min(referenceCanvas.width, Math.max(referenceLayout.gridRect.x + referenceLayout.gridRect.width, actualLayout.gridRect.x + actualLayout.gridRect.width)),
          bottom: Math.min(referenceCanvas.height, Math.max(referenceLayout.gridRect.y + referenceLayout.gridRect.height, actualLayout.gridRect.y + actualLayout.gridRect.height)),
        }
        const measure = (id, referencePredicate, actualPredicate) => {
          let referenceMaskPixels = 0
          let actualMaskPixels = 0
          let comparedPixels = 0
          let mismatchedPixels = 0
          const referenceRgb = [0, 0, 0]
          const actualRgb = [0, 0, 0]
          for (let y = regionBounds.y; y < regionBounds.bottom; y += 1) {
            for (let x = regionBounds.x; x < regionBounds.right; x += 1) {
              const inReference = referencePredicate(referenceLayout, x, y)
              const inActual = actualPredicate(actualLayout, x, y)
              if (inReference) referenceMaskPixels += 1
              if (inActual) actualMaskPixels += 1
              if (!inReference || !inActual) continue
              comparedPixels += 1
              const i = (y * referenceCanvas.width + x) * 4
              const channelDifference = Math.max(
                Math.abs(referencePixels[i] - actualPixels[i]),
                Math.abs(referencePixels[i + 1] - actualPixels[i + 1]),
                Math.abs(referencePixels[i + 2] - actualPixels[i + 2]),
                Math.abs(referencePixels[i + 3] - actualPixels[i + 3]),
              )
              if (channelDifference > input.channelTolerance) mismatchedPixels += 1
              referenceRgb[0] += referencePixels[i]
              referenceRgb[1] += referencePixels[i + 1]
              referenceRgb[2] += referencePixels[i + 2]
              actualRgb[0] += actualPixels[i]
              actualRgb[1] += actualPixels[i + 1]
              actualRgb[2] += actualPixels[i + 2]
            }
          }
          const mean = (values) => values.map((value) => value / Math.max(1, comparedPixels))
          return {
            id,
            referenceMaskPixels,
            actualMaskPixels,
            comparedPixels,
            excludedByGeometry: Math.max(referenceMaskPixels, actualMaskPixels) - comparedPixels,
            mismatchedPixels,
            mismatchPercent: comparedPixels ? mismatchedPixels / comparedPixels * 100 : null,
            meanRgbReference: mean(referenceRgb),
            meanRgbActual: mean(actualRgb),
          }
        }
        const metricForGap = measure('grid-gap-surface', (layout, x, y) => isGap(layout, x, y), (layout, x, y) => isGap(layout, x, y))
        const metricForGroupRing = (id, selected) => measure(id,
          (layout, x, y) => selectedCells(layout, selected).some((cell) => ringContains(x, y, cell.frameRect, 0, 6)),
          (layout, x, y) => selectedCells(layout, selected).some((cell) => ringContains(x, y, cell.frameRect, 0, 6)))
        const selectedFrame = metricForGroupRing('selected-frame', true)
        const unselectedFrames = metricForGroupRing('unselected-frames', false)
        const frameBands = { selected: [], unselected: [] }
        for (let band = 0; band < 6; band += 1) {
          for (const selected of [true, false]) {
            const id = 'frame-band-' + band + '-' + (band + 1)
            const group = selected ? 'selected' : 'unselected'
            frameBands[group].push({
              ...measure(group + '-' + id,
                (layout, x, y) => selectedCells(layout, selected).some((cell) => inBand(x, y, cell.frameRect, band)),
                (layout, x, y) => selectedCells(layout, selected).some((cell) => inBand(x, y, cell.frameRect, band))),
              band: id,
              widthCssPx: 1,
            })
          }
        }
        const cellInterior = measure('cell-interior-after-6px',
          (layout, x, y) => layout.cells.some((cell) => inRect(x, y, {
            x: cell.frameRect.x + 6 * dpr,
            y: cell.frameRect.y + 6 * dpr,
            width: cell.frameRect.width - 12 * dpr,
            height: cell.frameRect.height - 12 * dpr,
          })),
          (layout, x, y) => layout.cells.some((cell) => inRect(x, y, {
            x: cell.frameRect.x + 6 * dpr,
            y: cell.frameRect.y + 6 * dpr,
            width: cell.frameRect.width - 12 * dpr,
            height: cell.frameRect.height - 12 * dpr,
          })))

        const straightMean = (layout, selected, band) => {
          const corner = 20 * dpr
          const thickness = dpr
          const sums = [0, 0, 0]
          let count = 0
          for (const cell of selectedCells(layout, selected)) {
            const rect = cell.frameRect
            const inset = band * dpr
            const horizontalStart = Math.ceil(rect.x + corner)
            const horizontalEnd = Math.floor(rect.x + rect.width - corner)
            const verticalStart = Math.ceil(rect.y + corner)
            const verticalEnd = Math.floor(rect.y + rect.height - corner)
            const samplePixel = (x, y) => {
              if (x < 0 || y < 0 || x >= actualCanvas.width || y >= actualCanvas.height) return
              const i = (y * actualCanvas.width + x) * 4
              const pixels = layout === referenceLayout ? referencePixels : actualPixels
              sums[0] += pixels[i]
              sums[1] += pixels[i + 1]
              sums[2] += pixels[i + 2]
              count += 1
            }
            for (let offset = 0; offset < thickness; offset += 1) {
              for (let x = horizontalStart; x < horizontalEnd; x += 1) {
                samplePixel(x, rect.y + inset + offset)
                samplePixel(x, rect.y + rect.height - inset - thickness + offset)
              }
              for (let y = verticalStart; y < verticalEnd; y += 1) {
                samplePixel(rect.x + inset + offset, y)
                samplePixel(rect.x + rect.width - inset - thickness + offset, y)
              }
            }
          }
          return { pixelCount: count, meanRgb: sums.map((value) => value / Math.max(1, count)) }
        }
        const straightFrameBandRgb = { selected: [], unselected: [] }
        for (let band = 0; band < 6; band += 1) {
          for (const selected of [true, false]) {
            const group = selected ? 'selected' : 'unselected'
            straightFrameBandRgb[group].push({
              band: 'frame-band-' + band + '-' + (band + 1),
              reference: straightMean(referenceLayout, selected, band),
              actual: straightMean(actualLayout, selected, band),
            })
          }
        }
        resolve({
          dimensions: {
            reference: { width: referenceCanvas.width, height: referenceCanvas.height },
            actual: { width: actualCanvas.width, height: actualCanvas.height },
            pass: referenceCanvas.width === actualCanvas.width && referenceCanvas.height === actualCanvas.height,
          },
          physicalRects: { referenceLayout, actualLayout },
          measurements: {
            gridGapSurface: metricForGap,
            selectedFrame,
            unselectedFrames,
            frameBands,
            cellInteriorAfter6px: cellInterior,
            straightFrameBandRgb,
            nonOverlappingPartition: [
              metricForGap,
              ...frameBands.selected,
              ...frameBands.unselected,
              cellInterior,
            ].map(({ id, referenceMaskPixels, actualMaskPixels, comparedPixels, excludedByGeometry, mismatchedPixels, mismatchPercent }) => ({
              id, referenceMaskPixels, actualMaskPixels, comparedPixels, excludedByGeometry, mismatchedPixels, mismatchPercent,
            })),
          },
        })
      }).catch(reject)
    }))(${JSON.stringify({
      reference: `data:image/png;base64,${reference.toString('base64')}`,
      actualRoi: `data:image/png;base64,${actualRoi.toString('base64')}`,
      dpr: scenario.viewport.deviceScaleFactor,
      roi: scenario.roi,
      actualRoiClip,
      physical: expectedPhysicalDimensions,
      referenceGridRect,
      actualGridRect: live.grid.rect,
      referenceCells,
      actualCells,
      channelTolerance: spec.pixelChannelTolerance,
    })})`, 120000)

    results.push({
      id: scenario.id,
      status: 'DIAGNOSTIC_COMPLETE',
      route: scenario.route,
      fixture: scenario.fixture,
      state: scenario.state,
      reference: {
        path: scenario.reference,
        sha256: createHash('sha256').update(reference).digest('hex'),
        dimensions: pngDimensions(reference),
        roi: scenario.roi,
        gridDerivedFrom: {
          firstCell: referenceCell,
          columns,
          rows,
          gapCssPx,
          paddingCssPx: gridPadding,
          paddingSource: 'Observed computed padding on the live .pwm-option-grid; not independently sampled from the reference screenshot.',
          rect: referenceGridRect,
          rectClassification: 'DERIVED_ESTIMATE from the parity-spec first-cell box, 6x3 layout, 4px gaps, and observed live padding.',
        },
        selectedIndex: referenceSelectedIndex + 1,
      },
      actual: {
        roiClip: actualRoiClip,
        roiDimensions: pngDimensions(actualRoi),
        roiPath: actualRoiPath,
        sha256: createHash('sha256').update(actualRoi).digest('hex'),
        grid: live.grid,
        selectedIndices: selectedIndices.map((index) => index + 1),
        selectedCellBasis: 'aria-selected or aria-pressed from live customizer DOM',
      },
      comparison: {
        channelTolerance: spec.pixelChannelTolerance,
        coordinateSpace: 'physical pixels in the captured full ROI; ROI-relative masks are derived from CSS geometry and DPR.',
        overlapPolicy: 'Compare only pixels inside both the actual and reference masks; report each mask area and geometry-excluded pixels separately.',
        sixPixelFramesAreAggregates: 'selected-frame and unselected-frames roll up the six non-overlapping one-CSS-pixel bands; they are not additional partition members.',
        cellInteriorUse: 'Diagnostic only; excluded from evidence for chrome CSS changes.',
        ...comparison,
      },
    })
  }

  const report = {
    taskId: 'miner_customization_nft_miners',
    iteration: 11,
    id: 'customizer-grid-chrome-diagnostic',
    status: 'DIAGNOSTIC_COMPLETE',
    method: {
      scenarios: ['customizer-wall', 'customizer-screen'],
      normalProductCssAndFixtures: true,
      temporaryStyleInjection: false,
      fullRoiCapturesPerScenario: 1,
      perCellCdpScreenshots: 0,
      frameBandWidthCssPx: 1,
      frameBandCount: 6,
      frameBandPhysicalWidthPx: 2,
      nonCornerRgbExclusionCssPx: 20,
      threshold: spec.pixelChannelTolerance,
      productCssChanged: false,
    },
    scenarios: results,
  }
  const reportPath = join(outputDir, 'customizer-grid-chrome-diagnostic.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  return {
    id: report.id,
    status: report.status,
    reportPath,
    scenarios: results.map(({ id, comparison }) => ({
      id,
      gridGapMismatchPercent: comparison.measurements.gridGapSurface.mismatchPercent,
      selectedFrameMismatchPercent: comparison.measurements.selectedFrame.mismatchPercent,
      unselectedFramesMismatchPercent: comparison.measurements.unselectedFrames.mismatchPercent,
      cellInteriorAfter6pxMismatchPercent: comparison.measurements.cellInteriorAfter6px.mismatchPercent,
    })),
  }
}

async function captureScenario(cdp, port, scenario) {
  const outputDir = join(evidenceRoot, scenario.id)
  mkdirSync(outputDir, { recursive: true })
  await drainFetchHandlers()
  const externalStart = blockedRequests.length
  if (scenario.blockedEvidence) {
    const report = {
      id: scenario.id,
      status: 'BLOCKED_EVIDENCE',
      reason: scenario.blockedEvidence,
      route: scenario.route,
      fixture: scenario.fixture,
      noScreenshot: 'The evidenced state cannot be entered without fabricating product data.',
    }
    writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
    writeFileSync(join(outputDir, 'report.md'), `# ${scenario.id}\n\n**BLOCKED_EVIDENCE**\n\n${scenario.blockedEvidence}\n`)
    return report
  }

  let state
  try {
    await seedAndNavigate(cdp, `http://127.0.0.1:${port}`, port, scenario, scenario.viewport)
    state = await prepareVisualState(cdp, scenario)
    await waitForRouteReady(cdp, scenario)
    await waitForVisualStability(cdp, scenario.readySelectors, `${scenario.id} capture state`)
  } catch (error) {
    if (!(error instanceof VisualReadinessError)) throw error
    return await writeReadinessFailure(cdp, scenario, error, outputDir)
  }
  if (state.blockedEvidence) {
    const report = {
      id: scenario.id,
      status: 'BLOCKED_EVIDENCE',
      reason: state.blockedEvidence,
      route: scenario.route,
      fixture: scenario.fixture,
      reference: scenario.reference,
      currentPath: await evaluate(cdp, 'location.pathname'),
      screenshot: 'Not captured because the requested visual state is not present in the supported data model.',
    }
    writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
    writeFileSync(join(outputDir, 'report.md'), `# ${scenario.id}\n\n**BLOCKED_EVIDENCE**\n\n${state.blockedEvidence}\n`)
    return report
  }

  assertMinerRoute(await evaluate(cdp, 'location.pathname'), `before capture ${scenario.id}`)
  const actualAnchor = scenario.anchor ? await evaluate(cdp, `(() => {
    const element = document.querySelector(${JSON.stringify(scenario.anchor.selector)})
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })()`) : null
  if (scenario.anchor) assert.ok(actualAnchor, `Missing route anchor ${scenario.anchor.selector} for ${scenario.id}.`)
  await drainFetchHandlers()
  const actualResult = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false, omitBackground: false })
  const actual = Buffer.from(actualResult.data, 'base64')
  const actualPath = join(outputDir, 'actual.png')
  writeFileSync(actualPath, actual)
  const dimensions = pngDimensions(actual)
  let actualRoi = actual
  let actualRoiPath = null
  let actualRoiDimensions = dimensions
  let actualRoiClip = { x: 0, y: 0, width: dimensions.width / scenario.viewport.deviceScaleFactor, height: dimensions.height / scenario.viewport.deviceScaleFactor }
  const actualColorSamples = []
  const integrityErrors = []
  if (scenario.reference && scenario.roi) {
    actualRoiClip = {
      x: scenario.anchor ? actualAnchor.x + (scenario.roi.x - scenario.anchor.reference.x) : scenario.roi.x,
      y: scenario.anchor ? actualAnchor.y + (scenario.roi.y - scenario.anchor.reference.y) : scenario.roi.y,
      width: scenario.roi.width,
      height: scenario.roi.height,
    }
    const roiResult = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      omitBackground: false,
      clip: { ...actualRoiClip, scale: 1 },
    })
    actualRoi = Buffer.from(roiResult.data, 'base64')
    actualRoiPath = join(outputDir, 'actual-roi.png')
    writeFileSync(actualRoiPath, actualRoi)
    actualRoiDimensions = pngDimensions(actualRoi)
    const expectedRoiDimensions = {
      width: Math.round(scenario.roi.width * scenario.viewport.deviceScaleFactor),
      height: Math.round(scenario.roi.height * scenario.viewport.deviceScaleFactor),
    }
    if (actualRoiDimensions.width !== expectedRoiDimensions.width || actualRoiDimensions.height !== expectedRoiDimensions.height) {
      integrityErrors.push(`actual-roi.png is ${actualRoiDimensions.width}x${actualRoiDimensions.height}; expected ${expectedRoiDimensions.width}x${expectedRoiDimensions.height}.`)
    }
    for (const sample of scenario.colorSamples ?? []) {
      const withinRoi = sample.rect.x >= scenario.roi.x
        && sample.rect.y >= scenario.roi.y
        && sample.rect.x + sample.rect.width <= scenario.roi.x + scenario.roi.width
        && sample.rect.y + sample.rect.height <= scenario.roi.y + scenario.roi.height
      if (withinRoi) continue
      const pageRect = {
        x: scenario.anchor ? actualAnchor.x + (sample.rect.x - scenario.anchor.reference.x) : sample.rect.x,
        y: scenario.anchor ? actualAnchor.y + (sample.rect.y - scenario.anchor.reference.y) : sample.rect.y,
        width: sample.rect.width,
        height: sample.rect.height,
      }
      const sampleResult = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: true,
        omitBackground: false,
        clip: { ...pageRect, scale: 1 },
      })
      const data = Buffer.from(sampleResult.data, 'base64')
      const path = join(outputDir, `actual-color-${sample.id}.png`)
      writeFileSync(path, data)
      const sampleDimensions = pngDimensions(data)
      const expectedSampleDimensions = {
        width: Math.round(sample.rect.width * scenario.viewport.deviceScaleFactor),
        height: Math.round(sample.rect.height * scenario.viewport.deviceScaleFactor),
      }
      if (sampleDimensions.width !== expectedSampleDimensions.width || sampleDimensions.height !== expectedSampleDimensions.height) {
        integrityErrors.push(`${basename(path)} is ${sampleDimensions.width}x${sampleDimensions.height}; expected ${expectedSampleDimensions.width}x${expectedSampleDimensions.height}.`)
      }
      actualColorSamples.push({ id: sample.id, data, path, pageRect })
    }
  }
  if (integrityErrors.length > 0) {
    const report = {
      id: scenario.id,
      status: 'FAIL_HARNESS_COMPARISON',
      reason: integrityErrors,
      route: scenario.route,
      fixture: scenario.fixture,
      viewport: scenario.viewport,
      capturedDimensions: dimensions,
      actualRoi: { path: actualRoiPath, clip: actualRoiClip, dimensions: actualRoiDimensions },
      integrity: { missingPixels: null, sampleBoundsPass: false },
    }
    writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
    writeFileSync(join(outputDir, 'report.md'), `# ${scenario.id}\n\n**FAIL_HARNESS_COMPARISON**\n\n${integrityErrors.map((error) => `- ${error}`).join('\n')}\n`)
    return report
  }
  let comparison = null
  let status = 'EVIDENCE_ONLY'
  let referenceInfo = null
  let diffPath = null

  if (scenario.reference) {
    await drainFetchHandlers()
    const referencePath = join(worktreeRoot, 'UI-UX', 'Mineros-customizables', scenario.reference)
    assert.ok(existsSync(referencePath), `Missing reference PNG: ${referencePath}`)
    const reference = readFileSync(referencePath)
    const referenceHash = createHash('sha256').update(reference).digest('hex')
    const referenceDimensions = pngDimensions(reference)
    const measuredSubregions = await measureSubregions(cdp, scenario)
    const comparisonResult = await compareInBrowser(cdp, reference, actualRoi, scenario, measuredSubregions.regions, actualAnchor, actualColorSamples, actualRoiClip)
    if (scenario.id === 'detail-tasks') {
      const diagnostic = await captureDetailArtDiagnostic(cdp, reference, scenario, outputDir)
      writeFileSync(join(evidenceRoot, 'detail-art-diagnostic.json'), JSON.stringify(diagnostic, null, 2))
    }
    diffPath = join(outputDir, 'diff.png')
    writeFileSync(diffPath, comparisonResult.diffPng)
    referenceInfo = { path: scenario.reference, sha256: referenceHash, dimensions: referenceDimensions }
    const mismatchPass = comparisonResult.comparableMismatchPercent <= spec.thresholds.maxMismatchPercent
    const dimensionsPass = comparisonResult.actualRoiDimensionsPass
    const colorPass = comparisonResult.colorSamples.every((sample) => sample.deltaE76 <= spec.thresholds.maxMeanDeltaE)
    const integrityPass = comparisonResult.missingPixels === 0
      && comparisonResult.actualRoiDimensionsPass
      && comparisonResult.sampleBoundsPass
    status = integrityPass ? mismatchPass && dimensionsPass && colorPass ? 'PASS' : 'FAIL' : 'FAIL_HARNESS_COMPARISON'
    comparison = {
      ...comparisonResult,
      diffPng: undefined,
      thresholds: spec.thresholds,
      integrityPass,
      mismatchPass,
      rawMismatchPass: comparisonResult.rawOverallMismatchPercent <= spec.thresholds.maxMismatchPercent,
      dimensionsPass,
      colorPass,
      geometryPass: null,
      unresolvedSubregions: measuredSubregions.unresolved,
    }
  }

  const geometryActual = await evaluate(cdp, `(() => {
    const selectors = ${JSON.stringify(scenario.geometrySelectors ?? [])}
    return Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector)
      if (!element) return [selector, null]
      const rect = element.getBoundingClientRect()
      return [selector, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }]
    }))
  })()`)
  const geometry = scenario.anchor ? Object.fromEntries(Object.entries(geometryActual).map(([selector, rect]) => [selector, rect && ({
    ...rect,
    x: rect.x - actualAnchor.x + scenario.anchor.reference.x,
    y: rect.y - actualAnchor.y + scenario.anchor.reference.y,
  })])) : geometryActual
  const geometryDifferences = Object.fromEntries(Object.entries(scenario.expectedGeometry ?? {}).map(([selector, expected]) => {
    const observed = geometry[selector]
    if (!observed) return [selector, { expected, observed, maxDeltaCssPx: null }]
    const maxDeltaCssPx = Math.max(...['x', 'y', 'width', 'height'].map((key) => Math.abs(expected[key] - observed[key])))
    return [selector, { expected, observed, maxDeltaCssPx }]
  }))
  const geometryPass = Object.keys(geometryDifferences).length > 0
    && Object.values(geometryDifferences).every((measurement) => measurement.maxDeltaCssPx !== null && measurement.maxDeltaCssPx <= spec.thresholds.maxGeometryDifferenceCssPx)
  if (comparison) {
    comparison.geometryPass = geometryPass
    comparison.geometryDifferences = geometryDifferences
    status = comparison.mismatchPass && comparison.dimensionsPass && comparison.colorPass && geometryPass ? 'PASS' : 'FAIL'
  }
  const report = {
    id: scenario.id,
    status,
    route: scenario.route,
    fixture: scenario.fixture,
    viewport: scenario.viewport,
    capturedDimensions: dimensions,
    actualRoi: actualRoiPath ? { path: actualRoiPath, clip: actualRoiClip, dimensions: actualRoiDimensions } : null,
    state: scenario.state,
    roi: scenario.roi,
    anchor: scenario.anchor ? { selector: scenario.anchor.selector, reference: scenario.anchor.reference, actual: actualAnchor } : null,
    masks: scenario.masks ?? [],
    reference: referenceInfo,
    comparison,
    geometryActual,
    geometry,
    geometryDifferences,
    blockedRequests: blockedRequests.slice(externalStart),
    fetchLifecycle: {
      handlersProcessed: fetchLifecycle.handlersProcessed,
      localReadOnlyContinued: fetchLifecycle.localReadOnlyContinued,
      externalRequestsBlocked: fetchLifecycle.externalRequestsBlocked,
      nonReadOnlyRequestsBlocked: fetchLifecycle.nonReadOnlyRequestsBlocked,
      fetchLifecycleRaces: fetchLifecycle.fetchLifecycleRaces,
      unsafeInterceptionFailures: fetchLifecycle.unsafeInterceptionFailures,
    },
    routeViolations: [...routeViolations],
    networkWritesBlocked: processWrites.length,
  }
  writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(join(outputDir, 'report.md'), [
    `# ${scenario.id}`,
    '',
    `**${status}**`,
    '',
    `- Route: ${scenario.route}`,
    `- Fixture: ${scenario.fixture}`,
    `- Capture: ${dimensions.width} × ${dimensions.height} physical pixels`,
    `- Reference: ${referenceInfo ? `${referenceInfo.path} (${referenceInfo.dimensions.width} × ${referenceInfo.dimensions.height})` : 'none; evidence only'}`,
    `- Raw overall pixel mismatch: ${comparison ? `${comparison.rawOverallMismatchPercent.toFixed(3)}%` : 'not comparable'}`,
    `- Comparable pixel mismatch: ${comparison ? `${comparison.comparableMismatchPercent.toFixed(3)}%` : 'not comparable'}`,
    `- Blocked pixels excluded: ${comparison?.blockedPixelsExcluded ?? 0} (${comparison?.blockedMismatchedPixels ?? 0} mismatches inside those regions)`,
    ...(comparison?.subregions ?? []).map((region) => `- ${region.id} [${region.classification}]: ${region.mismatchPercent?.toFixed(3) ?? 'n/a'}% (${region.mismatchedPixels}/${region.pixels} px)${region.reason ? ` — ${region.reason}` : ''}`),
    ...(comparison?.unresolvedSubregions ?? []).map((region) => `- UNRESOLVED ${region.id} (${region.selector}) — ${region.reason ?? 'selector not present'}`),
    `- Geometry: ${JSON.stringify(geometry)}`,
    `- Blocked external requests: ${blockedRequests.slice(externalStart).length}`,
    '',
  ].join('\n'))
  return report
}

async function assertRouteCurrent(cdp, source) {
  assertMinerRoute(await evaluate(cdp, 'location.pathname'), source)
}

async function functionalBrowserGates(cdp, port) {
  const viewport = { width: 1280, height: 900, deviceScaleFactor: 1 }
  const savedPair = { route: '/nft-miners/5422372/customize', fixture: 'saved-pair', readySelectors: ['.pwm-customizer-flow', '#pwm-customizer-options'] }
  await seedAndNavigate(cdp, `http://127.0.0.1:${port}`, port, savedPair, viewport)
  const initial = await evaluate(cdp, `({
    route: location.pathname,
    fixture: new URLSearchParams(location.search).get('parityFixture'),
    saveDisabled: document.querySelector('.pwm-button-save')?.disabled ?? null,
    optionCount: document.querySelectorAll('#pwm-customizer-options button').length,
    farmTileCount: document.querySelectorAll('.pwm-miner-tile').length
  })`)
  assert.equal(initial.route, '/nft-miners/5422372/customize')
  assert.equal(initial.fixture, 'saved-pair')
  assert.equal(initial.saveDisabled, true)
  assert.ok(initial.optionCount > 0, 'The real-shaped parity fixture must render appearance options.')
  assert.equal(initial.farmTileCount, 0, 'Customizer route must not render farm tiles over the editor.')

  const locked = { route: '/nft-miners/5422372/customize', fixture: 'locked', readySelectors: savedPair.readySelectors }
  await seedAndNavigate(cdp, `http://127.0.0.1:${port}`, port, locked, viewport)
  await clickSelector(cdp, '#pwm-category-tab-body')
  await waitForPageCondition(cdp, `document.querySelector('#pwm-category-tab-body')?.getAttribute('aria-selected') === 'true'`, 'Body category selected', locked.readySelectors)
  await clickSelector(cdp, 'button.pwm-option[aria-disabled="true"]')
  await waitForPageCondition(cdp, `Boolean(document.querySelector('[role="dialog"]'))`, 'locked Black dialog', ['.pwm-customizer-column', '[role="dialog"]'])
  const lockedState = await evaluate(cdp, `({
    open: Boolean(document.querySelector('[role="dialog"]')),
    disabled: document.querySelector('button.pwm-option[aria-disabled="true"]')?.getAttribute('aria-disabled')
  })`)
  assert.equal(lockedState.open, true)
  assert.equal(lockedState.disabled, 'true')
  await pressKey(cdp, 'Escape', 27)
  await waitForPageCondition(cdp, `!document.querySelector('[role="dialog"]')`, 'locked dialog dismissal', locked.readySelectors)

  return {
    exactParityRoute: true,
    explicitFixtureOnly: true,
    customizerReady: true,
    lockedTraitDoesNotOpenProductionWrite: true,
    blockedNetworkWrites: processWrites.length,
  }
}

async function killOwnedProcessTree(processRef) {
  if (!processRef?.pid || processRef.exitCode !== null) return
  if (process.platform === 'win32') {
    await new Promise((resolveKill) => {
      const killer = spawn('taskkill.exe', ['/PID', String(processRef.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.once('exit', resolveKill)
      killer.once('error', resolveKill)
    })
  } else {
    processRef.kill('SIGTERM')
  }
  if (processRef.exitCode === null) await new Promise((resolveExit) => processRef.once('exit', resolveExit))
}

async function main() {
  const browserPath = findBrowser()
  assert.ok(browserPath, 'No installed Chromium-family executable was found; npm run parity is blocked.')
  assert.equal(typeof WebSocket, 'function', 'This Node runtime does not expose native WebSocket.')
  const appPort = await getFreePortInRange()
  const cdpPort = await getEphemeralPort()
  assert.ok(appPort >= 5190 && appPort <= 5199)
  assert.notEqual(appPort, 5173)
  assert.notEqual(appPort, 5174)

  let viteProcess
  let browser
  let cdp
  let profile
  let fetchEnabled = false
  let viteLogs = ''
  const appendViteLog = (chunk) => { viteLogs = `${viteLogs}${chunk}`.slice(-12000) }
  const getViteDiagnostics = () => viteLogs.trim()
  const scenarioReports = []
  const functionalResults = {}
  const startedAt = new Date().toISOString()
  try {
    const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const npmArgs = ['run', 'dev', '--', '--port', String(appPort), '--strictPort', '--config', 'scripts/miner-customization-vite.config.mjs']
    viteProcess = spawn(npmExecutable, npmArgs, {
      cwd: worktreeRoot,
      env: process.env,
      windowsHide: true,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    viteProcess.stdout.on('data', appendViteLog)
    viteProcess.stderr.on('data', appendViteLog)
    const appOrigin = `http://127.0.0.1:${appPort}`
    const actualOrigin = await waitForHttp(`${appOrigin}/nft-miners`, viteProcess, getViteDiagnostics)
    assert.equal(actualOrigin, appOrigin, `Vite redirected away from selected port ${appPort}.`)
    profile = mkdtempSync(join(tmpdir(), 'miner-customization-cdp-'))
    browser = spawn(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-default-apps',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-allow-origins=*',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ], { windowsHide: true, stdio: 'ignore' })
    const target = await (async () => {
      const start = Date.now()
      while (Date.now() - start < 30000) {
        if (browser.exitCode !== null) throw new Error(`Browser exited with code ${browser.exitCode}.`)
        try {
          const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
          if (response.ok) {
            const targets = await response.json()
            const page = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
            if (page) return page
          }
        } catch {
          // DevTools is still starting.
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 150))
      }
      throw new Error('The installed browser did not expose its local CDP endpoint.')
    })()
    cdp = new CDPClient(target.webSocketDebuggerUrl)
    await cdp.ready
    cdp.on('Fetch.requestPaused', (request) => trackPausedRequest(cdp, request, appPort))
    cdp.on('Network.webSocketCreated', ({ url }) => {
      const parsed = new URL(url)
      if (parsed.hostname !== '127.0.0.1' || Number(parsed.port) !== appPort) {
        blockedRequests.push({ method: 'WEBSOCKET', url: safeRequestLabel(url), reason: 'external websocket detected' })
      }
    })
    cdp.on('Page.frameNavigated', ({ frame }) => {
      if (frame.parentId) return
      if (frame.url === 'about:blank') return
      const url = new URL(frame.url)
      if (url.origin !== `http://127.0.0.1:${appPort}` || !isMinerRoute(url.pathname)) {
        routeViolations.push({ pathname: url.pathname, source: 'Page.frameNavigated' })
      }
    })
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Network.enable')
    const renderReadinessDiagnosticOnly = process.argv.includes('--render-readiness-diagnostic-only')
    renderReadinessDiagnosticsEnabled = renderReadinessDiagnosticOnly
    if (renderReadinessDiagnosticOnly) {
      const localRequestUrls = new Map()
      cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
        if (renderReadinessRuntimeExceptions.length >= 20) return
        const frame = exceptionDetails.stackTrace?.callFrames?.[0]
        renderReadinessRuntimeExceptions.push({
          text: exceptionDetails.text.slice(0, 1000),
          exception: exceptionDetails.exception?.description?.slice(0, 2000) ?? null,
          url: frame?.url ?? exceptionDetails.url ?? null,
          lineNumber: frame?.lineNumber ?? exceptionDetails.lineNumber ?? null,
          columnNumber: frame?.columnNumber ?? exceptionDetails.columnNumber ?? null,
        })
      })
      cdp.on('Runtime.consoleAPICalled', ({ type, args, stackTrace }) => {
        if (type !== 'error' || renderReadinessConsoleErrors.length >= 20) return
        const frame = stackTrace?.callFrames?.[0]
        renderReadinessConsoleErrors.push({
          message: args.map(({ description, value }) => String(description ?? value ?? '')).join(' ').slice(0, 2000),
          url: frame?.url ?? null,
          lineNumber: frame?.lineNumber ?? null,
          columnNumber: frame?.columnNumber ?? null,
        })
      })
      cdp.on('Network.requestWillBeSent', ({ requestId, request }) => {
        const url = new URL(request.url)
        if (url.origin === appOrigin) localRequestUrls.set(requestId, `${url.origin}${url.pathname}`)
      })
      cdp.on('Network.loadingFailed', ({ requestId, errorText, type, canceled, blockedReason }) => {
        const url = localRequestUrls.get(requestId)
        if (!url) return
        if (renderReadinessLocalLoadFailures.length < 20) {
          renderReadinessLocalLoadFailures.push({ url, errorText, type, canceled, blockedReason: blockedReason ?? null })
        }
        localRequestUrls.delete(requestId)
      })
      cdp.on('Network.loadingFinished', ({ requestId }) => localRequestUrls.delete(requestId))
    }
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
    fetchEnabled = true
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const NativeWebSocket = window.WebSocket
        window.WebSocket = function guardedWebSocket(url, protocols) {
          const target = new URL(url, location.href)
          if (target.origin !== location.origin) throw new Error('External WebSocket blocked by miner parity harness.')
          return new NativeWebSocket(url, protocols)
        }
        window.WebSocket.prototype = NativeWebSocket.prototype
      })()`,
    })
    mkdirSync(evidenceRoot, { recursive: true })
    const smokeScenario = spec.scenarios.find((scenario) => scenario.id === 'customizer-empty')
    const farmZeroScenario = spec.scenarios.find((scenario) => scenario.id === 'farm-zero')
    const detailScenario = spec.scenarios.find((scenario) => scenario.id === 'detail-tasks')
    const customizerWallScenario = spec.scenarios.find((scenario) => scenario.id === 'customizer-wall')
    const customizerScreenScenario = spec.scenarios.find((scenario) => scenario.id === 'customizer-screen')
    const detailDiagnosticOnly = process.argv.includes('--detail-art-diagnostic-only')
    const customizerPreviewDiagnosticOnly = process.argv.includes('--customizer-preview-crop-diagnostic-only')
    const customizerWallScreenOnly = process.argv.includes('--customizer-wall-screen-only')
    const customizerSelectedFrameLocalizationDiagnosticOnly = process.argv.includes('--customizer-selected-frame-localization-diagnostic-only')
    const customizerBorderEdgeDiagnosticOnly = process.argv.includes('--customizer-border-edge-diagnostic-only')
    const customizerGridChromeDiagnosticOnly = process.argv.includes('--customizer-grid-chrome-diagnostic-only')
    const scenarios = customizerSelectedFrameLocalizationDiagnosticOnly
      ? [customizerWallScenario, customizerScreenScenario]
      : customizerWallScreenOnly
      ? [customizerWallScenario, customizerScreenScenario]
      : customizerBorderEdgeDiagnosticOnly
      ? [customizerWallScenario, customizerScreenScenario]
      : customizerGridChromeDiagnosticOnly
      ? [customizerWallScenario, customizerScreenScenario]
      : renderReadinessDiagnosticOnly
      ? [farmZeroScenario]
      : detailDiagnosticOnly
      ? [detailScenario]
      : customizerPreviewDiagnosticOnly
        ? [customizerWallScenario, customizerScreenScenario]
        : process.argv.includes('--smoke') || process.env.npm_config_smoke === 'true'
          ? [smokeScenario]
          : spec.scenarios
    if (customizerSelectedFrameLocalizationDiagnosticOnly) {
      scenarioReports.push(await captureCustomizerSelectedFrameLocalizationDiagnostic(cdp, appPort, scenarios))
    } else if (customizerBorderEdgeDiagnosticOnly) {
      scenarioReports.push(await captureCustomizerBorderEdgeDiagnostic(cdp, appPort, scenarios))
    } else if (customizerGridChromeDiagnosticOnly) {
      scenarioReports.push(await captureCustomizerGridChromeDiagnostic(cdp, appPort, scenarios))
    } else if (customizerPreviewDiagnosticOnly) {
      scenarioReports.push(await captureCustomizerPreviewCropDiagnostic(cdp, appPort, scenarios))
    } else {
      for (const scenario of scenarios) scenarioReports.push(await captureScenario(cdp, appPort, scenario))
    }
    if (!renderReadinessDiagnosticOnly && !detailDiagnosticOnly && !customizerPreviewDiagnosticOnly && !customizerWallScreenOnly && !customizerSelectedFrameLocalizationDiagnosticOnly && !customizerBorderEdgeDiagnosticOnly && !customizerGridChromeDiagnosticOnly && !process.argv.includes('--smoke') && process.env.npm_config_smoke !== 'true') {
      try {
        const functionalGates = await functionalBrowserGates(cdp, appPort)
        functionalResults.browser = { id: 'functional-browser-gates', status: 'PASS', ...functionalGates }
        const functionalOutputDir = join(evidenceRoot, 'functional-browser-gates')
        mkdirSync(functionalOutputDir, { recursive: true })
        writeFileSync(join(functionalOutputDir, 'report.json'), JSON.stringify(functionalResults.browser, null, 2))
        writeFileSync(join(functionalOutputDir, 'report.md'), `# functional-browser-gates\n\n**PASS**\n\n${Object.entries(functionalGates).map(([gate, value]) => `- ${gate}: ${typeof value === 'boolean' ? value ? 'PASS' : 'FAIL' : JSON.stringify(value)}`).join('\n')}\n`)
      } catch (error) {
        const functionalOutputDir = join(evidenceRoot, 'functional-browser-gates')
        if (error instanceof VisualReadinessError) {
          functionalResults.browser = await writeReadinessFailure(cdp, {
            id: 'functional-browser-gates',
            route: '/nft-miners/5422372/customize',
            fixture: 'saved-pair',
          }, error, functionalOutputDir)
        } else {
          functionalResults.browser = { id: 'functional-browser-gates', status: 'FAIL', reason: error instanceof Error ? error.message : String(error) }
          mkdirSync(functionalOutputDir, { recursive: true })
          writeFileSync(join(functionalOutputDir, 'report.json'), JSON.stringify(functionalResults.browser, null, 2))
          writeFileSync(join(functionalOutputDir, 'report.md'), `# functional-browser-gates\n\n**FAIL**\n\n${functionalResults.browser.reason}\n`)
        }
      }
    }

    const summary = {
      taskId: 'miner_customization_nft_miners',
      iteration: ITERATION,
      startedAt,
      finishedAt: new Date().toISOString(),
      appOrigin: `http://127.0.0.1:${appPort}`,
      appPort,
      cdpPort,
      browserPath,
      browserProfile: 'isolated temporary profile; removed after run',
      envDir: workspaceRoot,
      routesAllowed: '/nft-miners and descendants only',
      prohibitedPorts: { '5173': 'not accessed or bound by this harness', '5174': 'not accessed or bound by this harness' },
      firebaseAuthFirestore: 'external requests intercepted and blocked; counts and handler lifecycle below',
      blockedRequests,
      fetchLifecycle: {
        handlersProcessed: fetchLifecycle.handlersProcessed,
        localReadOnlyContinued: fetchLifecycle.localReadOnlyContinued,
        externalRequestsBlocked: fetchLifecycle.externalRequestsBlocked,
        nonReadOnlyRequestsBlocked: fetchLifecycle.nonReadOnlyRequestsBlocked,
        fetchLifecycleRaces: fetchLifecycle.fetchLifecycleRaces,
        unsafeInterceptionFailures: fetchLifecycle.unsafeInterceptionFailures,
      },
      blockedNetworkWriteAttempts: processWrites.length,
      routeViolations,
      functionalResults,
      scenarios: scenarioReports,
    }
    writeFileSync(join(evidenceRoot, 'summary.json'), JSON.stringify(summary, null, 2))
    const failed = scenarioReports.some((report) => report.status === 'FAIL' || report.status === 'FAIL_RENDER_NOT_READY' || report.status === 'FAIL_HARNESS_COMPARISON')
      || functionalResults.browser?.status === 'FAIL_RENDER_NOT_READY'
      || functionalResults.browser?.status === 'FAIL'
      || blockedRequests.some((request) => request.method === 'WEBSOCKET')
      || fetchLifecycle.unsafeInterceptionFailures.length > 0
      || routeViolations.length > 0
    console.log(JSON.stringify({ appPort, cdpPort, scenarios: scenarioReports.map(({ id, status, comparison }) => ({ id, status, mismatchPercent: comparison?.mismatchPercent ?? null })), functionalResults, blockedRequests: blockedRequests.length, fetchLifecycle, blockedNetworkWriteAttempts: processWrites.length, routeViolations: routeViolations.length, exitCode: failed ? 1 : 0 }, null, 2))
    if (failed) process.exitCode = 1
  } finally {
    await drainFetchHandlers()
    if (fetchEnabled && cdp?.socket.readyState === WebSocket.OPEN) {
      await cdp.send('Fetch.disable')
      fetchEnabled = false
    }
    cdp?.close()
    await killOwnedProcessTree(browser)
    await killOwnedProcessTree(viteProcess)
    if (profile) {
      const tempRoot = resolve(tmpdir())
      const safeProfile = resolve(profile)
      assert.ok(safeProfile.startsWith(`${tempRoot}${process.platform === 'win32' ? '\\' : '/'}`), 'Refusing to remove a browser profile outside the temporary directory.')
      rmSync(safeProfile, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(`PARITY HARNESS FAILED: ${error.message}`)
  process.exitCode = 1
})
