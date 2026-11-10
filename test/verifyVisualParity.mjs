import assert from 'node:assert/strict'
import { spawn, execSync } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  copyFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const worktreeRoot = resolve(__dirname, '..')
const repoRoot = resolve(worktreeRoot, '..', '..')
const backendWorktree = resolve(repoRoot, '_worktrees', 'task-POUW-1.7')
const seedManifestPath = resolve(backendWorktree, 'docs', 'paquetes_dinamicos', 'seed-manifest.json')

const evidenceDirWorktree = join(worktreeRoot, 'evidence', 'visual-parity')
const evidenceDirTeamwork = join(repoRoot, '.agents', 'teamwork', 'evidence', 'visual-parity')

mkdirSync(evidenceDirWorktree, { recursive: true })
mkdirSync(evidenceDirTeamwork, { recursive: true })

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Users\\Trabajo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
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

async function getFreePort(defaultPort) {
  try {
    const server = await listenOn(defaultPort)
    await new Promise((resolveClose, reject) => server.close((err) => err ? reject(err) : resolveClose()))
    return defaultPort
  } catch {
    const server = await listenOn(0)
    const { port } = server.address()
    await new Promise((resolveClose, reject) => server.close((err) => err ? reject(err) : resolveClose()))
    return port
  }
}

class CDPClient {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.sequence = 0
    this.pending = new Map()
    this.listeners = new Map()
    this.ready = new Promise((resolveReady, reject) => {
      this.socket.addEventListener('open', resolveReady, { once: true })
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
    const list = this.listeners.get(method) ?? new Set()
    list.add(listener)
    this.listeners.set(method, list)
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

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.exceptionDetails) {
      throw new Error(`Evaluation failed: ${res.exceptionDetails.text} (${JSON.stringify(res.exceptionDetails)})`)
    }
    return res.result?.value
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close()
  }
}

async function killProcessTree(pid) {
  if (!pid) return
  if (process.platform === 'win32') {
    await new Promise((resolveKill) => {
      const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.once('exit', resolveKill)
      killer.once('error', resolveKill)
    })
  } else {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      try { process.kill(pid, 'SIGKILL') } catch {}
    }
  }
}

async function waitForHttp(url, maxWaitMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Timeout waiting for HTTP service at ${url}`)
}

// Embedded canonical 29 packages matching seedManifest.ts / seed-manifest.json
const EMBEDDED_CANONICAL_29_PACKAGES = [
  // MinerX (5 items: 4 fixed + 1 custom)
  {
    id: 'minerx-01', packageId: 'minerx-01', section: 'minerx', name: '1.46 TH', displayName: '1.46 TH',
    powerTh: 1.46, priceUsdt: 18.99, price: 18.99, cadence: 'one_time', dailyBtcText: '0.00000062', roiPct: 52.5,
    limitedUnits: 30, availableUnits: 30, soldUnits: 0, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 1,
  },
  {
    id: 'minerx-02', packageId: 'minerx-02', section: 'minerx', name: '8.33 TH', displayName: '8.33 TH',
    powerTh: 8.33, priceUsdt: 99.99, price: 99.99, cadence: 'one_time', dailyBtcText: '0.00000354', roiPct: 55.62,
    limitedUnits: 30, availableUnits: 30, soldUnits: 0, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 2,
  },
  {
    id: 'minerx-03', packageId: 'minerx-03', section: 'minerx', name: '21.05 TH', displayName: '21.05 TH',
    powerTh: 21.05, priceUsdt: 249.99, price: 249.99, cadence: 'one_time', dailyBtcText: '0.00000894', roiPct: 56.47,
    limitedUnits: 30, availableUnits: 30, soldUnits: 0, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 3,
  },
  {
    id: 'minerx-04', packageId: 'minerx-04', section: 'minerx', name: '42.44 TH', displayName: '42.44 TH',
    powerTh: 42.44, priceUsdt: 499.99, price: 499.99, cadence: 'one_time', dailyBtcText: '0.00001802', roiPct: 57.17,
    limitedUnits: 30, availableUnits: 30, soldUnits: 0, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 4,
  },
  {
    id: 'minerx-custom', packageId: 'minerx-custom', section: 'minerx', name: 'Custom', displayName: 'Custom',
    powerTh: 1.0, priceUsdt: 12.99, price: 12.99, cadence: 'one_time', packageType: 'custom', isPublished: true, status: 'ACTIVE', sortOrder: 5,
  },
  // Preventa (4 items)
  {
    id: 'preventa-01', packageId: 'preventa-01', section: 'preventa', name: '1.46 TH', displayName: '1.46 TH',
    powerTh: 1.46, priceUsdt: 18.99, price: 18.99, cadence: 'one_time', dailyBtcText: '0.00000062', roiPct: 52.5,
    limitedUnits: 30, availableUnits: 30, soldUnits: 0, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 1, isPresale: true,
  },
  {
    id: 'preventa-02', packageId: 'preventa-02', section: 'preventa', name: '8.33 TH', displayName: '8.33 TH',
    powerTh: 8.33, priceUsdt: 99.99, price: 99.99, cadence: 'one_time', dailyBtcText: '0.00000354', roiPct: 55.62,
    limitedUnits: 30, availableUnits: 30, soldUnits: 0, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 2, isPresale: true,
  },
  {
    id: 'preventa-03', packageId: 'preventa-03', section: 'preventa', name: '21.05 TH', displayName: '21.05 TH',
    powerTh: 21.05, priceUsdt: 249.99, price: 249.99, cadence: 'one_time', dailyBtcText: '0.00000894', roiPct: 56.47,
    limitedUnits: 30, availableUnits: 30, soldUnits: 0, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 3, isPresale: true,
  },
  {
    id: 'preventa-04', packageId: 'preventa-04', section: 'preventa', name: '42.44 TH', displayName: '42.44 TH',
    powerTh: 42.44, priceUsdt: 499.99, price: 499.99, cadence: 'one_time', dailyBtcText: '0.00001802', roiPct: 57.17,
    limitedUnits: 30, availableUnits: 30, soldUnits: 0, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 4, isPresale: true,
  },
  // Lanzamiento (16 items)
  { id: 'lanzamiento-01', packageId: 'lanzamiento-01', section: 'lanzamiento', name: '42.44 TH', displayName: '42.44 TH', powerTh: 42.44, priceUsdt: 499.99, price: 499.99, cadence: 'one_time', dailyBtcText: '0.00001802', roiPct: 57.17, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 1 },
  { id: 'lanzamiento-02', packageId: 'lanzamiento-02', section: 'lanzamiento', name: '64 TH', displayName: '64 TH', powerTh: 64, priceUsdt: 759.99, price: 759.99, cadence: 'one_time', dailyBtcText: '0.00002717', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 2 },
  { id: 'lanzamiento-03', packageId: 'lanzamiento-03', section: 'lanzamiento', name: '96 TH', displayName: '96 TH', powerTh: 96, priceUsdt: 1139.99, price: 1139.99, cadence: 'one_time', dailyBtcText: '0.00004075', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 3 },
  { id: 'lanzamiento-04', packageId: 'lanzamiento-04', section: 'lanzamiento', name: '128 TH', displayName: '128 TH', powerTh: 128, priceUsdt: 1519.99, price: 1519.99, cadence: 'one_time', dailyBtcText: '0.00005434', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 4 },
  { id: 'lanzamiento-05', packageId: 'lanzamiento-05', section: 'lanzamiento', name: '192 TH', displayName: '192 TH', powerTh: 192, priceUsdt: 2279.99, price: 2279.99, cadence: 'one_time', dailyBtcText: '0.00008150', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 5 },
  { id: 'lanzamiento-06', packageId: 'lanzamiento-06', section: 'lanzamiento', name: '256 TH', displayName: '256 TH', powerTh: 256, priceUsdt: 3039.99, price: 3039.99, cadence: 'one_time', dailyBtcText: '0.00010867', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 6 },
  { id: 'lanzamiento-07', packageId: 'lanzamiento-07', section: 'lanzamiento', name: '384 TH', displayName: '384 TH', powerTh: 384, priceUsdt: 4559.99, price: 4559.99, cadence: 'one_time', dailyBtcText: '0.00016301', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 7 },
  { id: 'lanzamiento-08', packageId: 'lanzamiento-08', section: 'lanzamiento', name: '512 TH', displayName: '512 TH', powerTh: 512, priceUsdt: 6079.99, price: 6079.99, cadence: 'one_time', dailyBtcText: '0.00021734', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 8 },
  { id: 'lanzamiento-09', packageId: 'lanzamiento-09', section: 'lanzamiento', name: '768 TH', displayName: '768 TH', powerTh: 768, priceUsdt: 9119.99, price: 9119.99, cadence: 'one_time', dailyBtcText: '0.00032602', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 9 },
  { id: 'lanzamiento-10', packageId: 'lanzamiento-10', section: 'lanzamiento', name: '1,024 TH', displayName: '1,024 TH', powerTh: 1024, priceUsdt: 12159.99, price: 12159.99, cadence: 'one_time', dailyBtcText: '0.00043469', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 10 },
  { id: 'lanzamiento-11', packageId: 'lanzamiento-11', section: 'lanzamiento', name: '1,536 TH', displayName: '1,536 TH', powerTh: 1536, priceUsdt: 18239.99, price: 18239.99, cadence: 'one_time', dailyBtcText: '0.00065203', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 11 },
  { id: 'lanzamiento-12', packageId: 'lanzamiento-12', section: 'lanzamiento', name: '2,048 TH', displayName: '2,048 TH', powerTh: 2048, priceUsdt: 24319.99, price: 24319.99, cadence: 'one_time', dailyBtcText: '0.00086938', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 12 },
  { id: 'lanzamiento-13', packageId: 'lanzamiento-13', section: 'lanzamiento', name: '2,560 TH', displayName: '2,560 TH', powerTh: 2560, priceUsdt: 30399.99, price: 30399.99, cadence: 'one_time', dailyBtcText: '0.00108672', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 13 },
  { id: 'lanzamiento-14', packageId: 'lanzamiento-14', section: 'lanzamiento', name: '3,584 TH', displayName: '3,584 TH', powerTh: 3584, priceUsdt: 42559.99, price: 42559.99, cadence: 'one_time', dailyBtcText: '0.00152141', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 14 },
  { id: 'lanzamiento-15', packageId: 'lanzamiento-15', section: 'lanzamiento', name: '4,096 TH', displayName: '4,096 TH', powerTh: 4096, priceUsdt: 48639.99, price: 48639.99, cadence: 'one_time', dailyBtcText: '0.00173875', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 15 },
  { id: 'lanzamiento-16', packageId: 'lanzamiento-16', section: 'lanzamiento', name: '5,000 TH', displayName: '5,000 TH', powerTh: 5000, priceUsdt: 54768.99, price: 54768.99, cadence: 'one_time', dailyBtcText: '0.00212250', roiPct: 57.2, packageType: 'fixed', isPublished: true, status: 'ACTIVE', sortOrder: 16 },
  // Mensual (4 items)
  { id: 'mensual-inicio', packageId: 'mensual-inicio', section: 'mensual', name: 'Inicio', displayName: 'Inicio', powerTh: 3.82, priceUsdt: 39.99, price: 39.99, cadence: 'monthly', packageType: 'subscription', isPublished: true, status: 'ACTIVE', sortOrder: 1 },
  { id: 'mensual-plus', packageId: 'mensual-plus', section: 'mensual', name: 'Plus', displayName: 'Plus', powerTh: 9.61, priceUsdt: 99.99, price: 99.99, cadence: 'monthly', packageType: 'subscription', isPublished: true, status: 'ACTIVE', sortOrder: 2 },
  { id: 'mensual-pro', packageId: 'mensual-pro', section: 'mensual', name: 'Pro', displayName: 'Pro', powerTh: 24.20, priceUsdt: 249.99, price: 249.99, cadence: 'monthly', packageType: 'subscription', isPublished: true, status: 'ACTIVE', sortOrder: 3 },
  { id: 'mensual-maximo', packageId: 'mensual-maximo', section: 'mensual', name: 'Máximo', displayName: 'Máximo', powerTh: 48.66, priceUsdt: 499.99, price: 499.99, cadence: 'monthly', packageType: 'subscription', isPublished: true, status: 'ACTIVE', sortOrder: 4 },
]

function loadCanonicalPackages() {
  if (existsSync(seedManifestPath)) {
    try {
      const raw = JSON.parse(readFileSync(seedManifestPath, 'utf8'))
      if (Array.isArray(raw.packages) && raw.packages.length === 29) {
        console.log(`Loaded canonical 29 packages from ${seedManifestPath}`)
        return raw.packages.map((pkg) => ({
          ...pkg,
          price: pkg.price ?? pkg.priceUsdt,
          priceUsdt: pkg.priceUsdt ?? pkg.price,
        }))
      }
    } catch (err) {
      console.warn(`Warning: Could not parse seed-manifest.json, using embedded fallback:`, err.message)
    }
  }
  console.log(`Using embedded canonical 29 packages manifest.`)
  return EMBEDDED_CANONICAL_29_PACKAGES
}

function saveArtifact(filename, buffer) {
  const targetWorktree = join(evidenceDirWorktree, filename)
  const targetTeamwork = join(evidenceDirTeamwork, filename)
  writeFileSync(targetWorktree, buffer)
  writeFileSync(targetTeamwork, buffer)
}

// In-Browser HTML5 Canvas comparison executed in Chromium V8
function inBrowserCanvasPixelDiff(base64A, base64B) {
  return new Promise((resolve, reject) => {
    function loadImg(src) {
      return new Promise((res, rej) => {
        const img = new Image()
        img.onload = () => res(img)
        img.onerror = rej
        img.src = src.startsWith('data:') ? src : `data:image/png;base64,${src}`
      })
    }

    Promise.all([loadImg(base64A), loadImg(base64B)]).then(([imgA, imgB]) => {
      const w = 1280
      const h = 900
      const totalPixels = w * h

      // Canvas A (Baseline)
      const cA = document.createElement('canvas')
      cA.width = w; cA.height = h
      const ctxA = cA.getContext('2d', { willReadFrequently: true })
      ctxA.drawImage(imgA, 0, 0, w, h)
      const dataA = ctxA.getImageData(0, 0, w, h).data

      // Canvas B (Corrective)
      const cB = document.createElement('canvas')
      cB.width = w; cB.height = h
      const ctxB = cB.getContext('2d', { willReadFrequently: true })
      ctxB.drawImage(imgB, 0, 0, w, h)
      const dataB = ctxB.getImageData(0, 0, w, h).data

      // Diff Canvas
      const cDiff = document.createElement('canvas')
      cDiff.width = w; cDiff.height = h
      const ctxDiff = cDiff.getContext('2d', { willReadFrequently: true })
      const imgDataDiff = ctxDiff.createImageData(w, h)
      const out = imgDataDiff.data

      let mismatchedPixels = 0
      const colorTolerance = 25 // accommodates subpixel antialiasing differences

      for (let i = 0; i < dataA.length; i += 4) {
        const dr = Math.abs(dataA[i] - dataB[i])
        const dg = Math.abs(dataA[i + 1] - dataB[i + 1])
        const db = Math.abs(dataA[i + 2] - dataB[i + 2])
        const delta = dr + dg + db

        if (delta > colorTolerance) {
          mismatchedPixels++
          out[i] = 255     // Vivid Magenta
          out[i + 1] = 0
          out[i + 2] = 255
          out[i + 3] = 255
        } else {
          // Subtle grayscale backdrop from corrective
          const gray = (dataB[i] * 0.299 + dataB[i + 1] * 0.587 + dataB[i + 2] * 0.114) * 0.35
          out[i] = gray
          out[i + 1] = gray
          out[i + 2] = gray
          out[i + 3] = 255
        }
      }
      ctxDiff.putImageData(imgDataDiff, 0, 0)

      // Composite Canvas: 2560 x 900
      const cComp = document.createElement('canvas')
      cComp.width = 2560; cComp.height = 900
      const ctxComp = cComp.getContext('2d')

      // Draw Baseline on left
      ctxComp.drawImage(imgA, 0, 0, 1280, 900)
      // Draw Corrective on right
      ctxComp.drawImage(imgB, 1280, 0, 1280, 900)

      // Dividing center line
      ctxComp.strokeStyle = '#2563eb'
      ctxComp.lineWidth = 2
      ctxComp.beginPath()
      ctxComp.moveTo(1280, 0)
      ctxComp.lineTo(1280, 900)
      ctxComp.stroke()

      // Header pills
      ctxComp.font = 'bold 14px sans-serif'
      ctxComp.textBaseline = 'top'

      // Left Pill: BASELINE
      ctxComp.fillStyle = 'rgba(15, 23, 42, 0.85)'
      ctxComp.fillRect(20, 15, 280, 32)
      ctxComp.fillStyle = '#60a5fa'
      ctxComp.fillText('BASELINE · main@99e0461 (1280x900)', 30, 23)

      // Right Pill: CORRECTIVE
      ctxComp.fillStyle = 'rgba(15, 23, 42, 0.85)'
      ctxComp.fillRect(1300, 15, 300, 32)
      ctxComp.fillStyle = '#34d399'
      ctxComp.fillText('CORRECTIVE · task/POUW-1.8 (1280x900)', 1310, 23)

      const diffBase64 = cDiff.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
      const compositeBase64 = cComp.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')

      resolve({
        mismatchedPixels,
        totalPixels,
        mismatchPercentage: (mismatchedPixels / totalPixels) * 100,
        diffBase64,
        compositeBase64,
      })
    }).catch(reject)
  })
}

async function extractDomState(cdp) {
  return await cdp.evaluate(`(() => {
    const modalEl = document.querySelector('.miner-builder-modal')
    const modalRect = modalEl ? modalEl.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 }

    const tabs = Array.from(document.querySelectorAll('.miner-builder-tabs button')).map((b) => {
      const r = b.getBoundingClientRect()
      return {
        id: b.id,
        text: b.textContent.trim(),
        active: b.classList.contains('miner-builder-tab-active') || b.getAttribute('aria-selected') === 'true',
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      }
    })

    const rows = Array.from(document.querySelectorAll('.miner-option-row:not(.miner-option-row-custom)')).map((r) => {
      const rect = r.getBoundingClientRect()
      const title = r.querySelector('.miner-option-title')?.textContent?.trim() || ''
      const price = r.querySelector('.miner-option-price')?.textContent?.trim() || ''
      const detail = r.querySelector('.miner-option-detail')?.textContent?.trim() || ''
      const roi = r.querySelector('.miner-option-roi')?.textContent?.trim() || ''
      const available = r.querySelector('.miner-option-title small')?.textContent?.trim() || ''
      const isActive = r.classList.contains('miner-option-row-active')
      return { title, price, detail, roi, available, isActive, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
    })

    const customRowEl = document.querySelector('.miner-option-row-custom')
    let customRow = null
    if (customRowEl) {
      const rect = customRowEl.getBoundingClientRect()
      customRow = {
        title: customRowEl.querySelector('.miner-option-title')?.textContent?.trim() || '',
        price: customRowEl.querySelector('.miner-option-price')?.textContent?.trim() || '',
        detail: customRowEl.querySelector('.miner-option-detail')?.textContent?.trim() || '',
        isActive: customRowEl.classList.contains('miner-option-row-active'),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      }
    }

    const heading = document.querySelector('.miner-option-heading')?.textContent?.trim() || ''
    const configSummary = document.querySelector('.miner-config-summary')?.textContent?.trim() || ''
    const primaryButtonEl = document.querySelector('.purchase-modal-actions button.button-primary')
    const primaryButtonDisabled = Boolean(primaryButtonEl?.disabled)

    const stage2Title = document.querySelector('.miner-builder-modal #miner-builder-title')?.textContent?.trim() || ''
    const stage2Eyebrow = document.querySelector('.miner-builder-modal .eyebrow')?.textContent?.trim() || ''
    const stage2Total = document.querySelector('.purchase-total')?.textContent?.trim() || ''
    const stage2Grid = Array.from(document.querySelectorAll('.builder-review-grid > div')).map((d) => d.textContent.trim())

    const bodyText = modalEl?.textContent || ''

    return {
      modalRect: { x: modalRect.x, y: modalRect.y, width: modalRect.width, height: modalRect.height },
      tabs,
      rows,
      customRow,
      heading,
      configSummary,
      primaryButtonDisabled,
      stage2Title,
      stage2Eyebrow,
      stage2Total,
      stage2Grid,
      bodyText,
    }
  })()`)
}

function computeGeometryDeltas(baseState, corrState) {
  const mB = baseState.modalRect
  const mC = corrState.modalRect
  const modalDelta = {
    dx: Math.abs(mB.x - mC.x),
    dy: Math.abs(mB.y - mC.y),
    dw: Math.abs(mB.width - mC.width),
    dh: Math.abs(mB.height - mC.height),
  }

  const rowDeltas = []
  const maxRows = Math.min(baseState.rows.length, corrState.rows.length)
  for (let i = 0; i < maxRows; i++) {
    const rB = baseState.rows[i].rect
    const rC = corrState.rows[i].rect
    rowDeltas.push({
      index: i,
      dx: Math.abs(rB.x - rC.x),
      dy: Math.abs(rB.y - rC.y),
      dw: Math.abs(rB.width - rC.width),
      dh: Math.abs(rB.height - rC.height),
    })
  }

  return { modal: modalDelta, rows: rowDeltas }
}

async function run() {
  console.log('======================================================================')
  console.log(' SCRUM-218: True A/B Visual Parity Verification Harness (Blockers 1, 2, 3)')
  console.log(' Baseline: main@99e046164113dd5edd704cd7f49558b2748e0636')
  console.log(' Corrective: task/POUW-1.8')
  console.log('======================================================================\n')

  const browserPath = findBrowser()
  assert.ok(browserPath, 'No compatible Chromium or Edge browser found on system.')
  console.log(`Browser located: ${browserPath}`)

  const canonicalPackages = loadCanonicalPackages()
  assert.equal(canonicalPackages.length, 29, 'Canonical seed manifest must contain exactly 29 packages.')

  const baselinePort = await getFreePort(5194)
  const correctivePort = await getFreePort(5195)
  const backendPort = 3001
  const cdpPort = await getFreePort(9222)

  console.log(`Ports assigned: Baseline=${baselinePort}, Corrective=${correctivePort}, Backend=${backendPort}, CDP=${cdpPort}\n`)

  // --- Step 1: Materialize Baseline Snapshot with Zero Repo Mutation ---
  const baselineDir = mkdtempSync(join(tmpdir(), 'scrum218-baseline-')).replace(/\\/g, '/')
  const baselineTar = `${baselineDir}/archive.tar`
  console.log(`Materializing baseline snapshot into isolated folder: ${baselineDir}`)

  try {
    execSync(`git archive --format=tar 99e046164113dd5edd704cd7f49558b2748e0636 -o "${baselineTar}"`, {
      cwd: repoRoot,
      windowsHide: true,
    })
    execSync(`tar -xf "${baselineTar}" --force-local -C "${baselineDir}"`, {
      windowsHide: true,
    })
    try { rmSync(baselineTar, { force: true }) } catch {}

    const nodeModulesSrc = join(worktreeRoot, 'node_modules')
    const nodeModulesDst = join(baselineDir, 'node_modules')
    symlinkSync(nodeModulesSrc, nodeModulesDst, 'junction')

    const envLocalSrc = join(worktreeRoot, '.env.local')
    if (existsSync(envLocalSrc)) {
      copyFileSync(envLocalSrc, join(baselineDir, '.env.local'))
    }
    console.log(`Baseline materialized cleanly with junctioned node_modules and .env.local.\n`)
  } catch (err) {
    try { rmSync(baselineDir, { recursive: true, force: true }) } catch {}
    throw new Error(`Failed to materialize baseline snapshot: ${err.message}`)
  }

  // --- Step 2: Start Mock Backend Server on Port 3001 ---
  const backendServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${backendPort}`)
    if (url.pathname === '/api/catalog/storefront') {
      const section = url.searchParams.get('section')
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      })
      if (!section || section === 'all') {
        res.end(JSON.stringify(canonicalPackages))
      } else {
        const filtered = canonicalPackages.filter((p) => p.section === section)
        res.end(JSON.stringify(filtered))
      }
      return
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      })
      res.end()
      return
    }
    res.writeHead(404)
    res.end()
  })

  await new Promise((resolveListen) => backendServer.listen(backendPort, '127.0.0.1', resolveListen))
  console.log(`Canonical Backend mock server listening on http://127.0.0.1:${backendPort}`)

  // --- Step 3: Boot Baseline and Corrective Vite Servers ---
  const viteBin = join(worktreeRoot, 'node_modules', 'vite', 'bin', 'vite.js')

  console.log(`Starting Baseline Vite server on port ${baselinePort}...`)
  const baselineProcess = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(baselinePort)], {
    cwd: baselineDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  baselineProcess.stdout.resume()
  baselineProcess.stderr.on('data', (d) => console.error('[BASELINE VITE ERR]', d.toString()))

  console.log(`Starting Corrective Vite preview server on port ${correctivePort}...`)
  const correctiveProcess = spawn(process.execPath, [viteBin, 'preview', '--port', String(correctivePort), '--strictPort', '--host', '127.0.0.1'], {
    cwd: worktreeRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  correctiveProcess.stdout.resume()
  correctiveProcess.stderr.on('data', (d) => console.error('[CORRECTIVE VITE ERR]', d.toString()))

  await Promise.all([
    waitForHttp(`http://127.0.0.1:${baselinePort}/`),
    waitForHttp(`http://127.0.0.1:${correctivePort}/`),
  ])
  console.log(`Both Vite servers live and responding!\n`)

  // --- Step 4: Launch Headless Browser ---
  const profileDir = mkdtempSync(join(tmpdir(), 'scrum218-browser-'))
  const browserProcess = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1280,900',
    'about:blank',
  ], { windowsHide: true, stdio: 'ignore' })

  // Wait for CDP endpoint
  let initialTarget = null
  const startCdp = Date.now()
  while (Date.now() - startCdp < 15000) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
      if (res.ok) {
        const list = await res.json()
        initialTarget = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
        if (initialTarget) break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  assert.ok(initialTarget, 'Chrome did not expose initial CDP page target.')

  // Create second page target for corrective instance
  const newPageRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new`, { method: 'PUT' })
  const secondTarget = await newPageRes.json()
  assert.ok(secondTarget?.webSocketDebuggerUrl, 'Could not create second CDP page target.')

  const cdpBaseline = new CDPClient(initialTarget.webSocketDebuggerUrl)
  const cdpCorrective = new CDPClient(secondTarget.webSocketDebuggerUrl)
  await Promise.all([cdpBaseline.ready, cdpCorrective.ready])
  console.log('Dual CDP connections established successfully.')

  for (const [name, cdp] of [['Baseline', cdpBaseline], ['Corrective', cdpCorrective]]) {
    await cdp.send('Page.enable')
    await cdp.send('DOM.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Network.enable')
    await cdp.send('Network.setBlockedURLs', { urls: ['*firestore.googleapis.com*'] })
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })
    cdp.on('Runtime.consoleAPICalled', (evt) => {
      console.log(`[${name} CONSOLE]`, evt.type, evt.args?.map((a) => a.value ?? a.description).join(' '))
    })
    cdp.on('Runtime.exceptionThrown', (evt) => {
      console.error(`[${name} EXCEPTION]`, evt.exceptionDetails?.text, evt.exceptionDetails?.exception?.description)
    })
  }

  // Navigate both pages to /home?modal=paywall-create
  const baselineUrl = `http://127.0.0.1:${baselinePort}/home?modal=paywall-create`
  const correctiveUrl = `http://127.0.0.1:${correctivePort}/home?modal=paywall-create`
  console.log(`Navigating Baseline to: ${baselineUrl}`)
  console.log(`Navigating Corrective to: ${correctiveUrl}`)

  await Promise.all([
    cdpBaseline.send('Page.navigate', { url: baselineUrl }),
    cdpCorrective.send('Page.navigate', { url: correctiveUrl }),
  ])

  // Wait for modal in both instances
  async function waitForModal(cdp, name) {
    const startWait = Date.now()
    let lastLog = 0
    while (Date.now() - startWait < 30000) {
      const state = await cdp.evaluate(`(() => ({
        url: location.href,
        hasModal: Boolean(document.querySelector('.miner-builder-modal')),
        rootHtml: document.getElementById('root')?.innerHTML?.slice(0, 300) || '',
        bodyHtml: document.body?.innerHTML?.slice(0, 300) || '',
      }))()`)
      if (state?.hasModal) return true
      if (Date.now() - lastLog > 3000) {
        lastLog = Date.now()
        console.log(`[${name}] Waiting for modal... URL: ${state?.url}, root: ${state?.rootHtml?.slice(0, 100)}`)
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    const finalState = await cdp.evaluate(`(() => ({
      url: location.href,
      bodyHtml: document.body?.innerHTML?.slice(0, 500) || '',
    }))()`)
    throw new Error(`Timeout: .miner-builder-modal did not appear in ${name} within 30s. Final state: ${JSON.stringify(finalState)}`)
  }

  await Promise.all([
    waitForModal(cdpBaseline, 'Baseline'),
    waitForModal(cdpCorrective, 'Corrective'),
  ])

  // Settle fonts & transitions
  await Promise.all([
    cdpBaseline.evaluate(`document.fonts ? document.fonts.ready.then(() => true) : true`),
    cdpCorrective.evaluate(`document.fonts ? document.fonts.ready.then(() => true) : true`),
  ])
  await new Promise((r) => setTimeout(r, 600))
  console.log('Both instances rendered .miner-builder-modal and settled fonts.\n')

  const report = {
    timestamp: new Date().toISOString(),
    viewport: { width: 1280, height: 900 },
    baselineCommit: '99e046164113dd5edd704cd7f49558b2748e0636',
    baselineUrl,
    correctiveUrl,
    views: {},
    verifications: {},
    screenshots: {},
  }

  // --- Helper to execute comparison for each view ---
  async function compareView(viewKey, viewName, stepAction) {
    console.log(`----------------------------------------------------------------------`)
    console.log(`Executing A/B Parity Comparison: ${viewName} [${viewKey}]`)
    console.log(`----------------------------------------------------------------------`)

    if (stepAction) {
      await stepAction(cdpBaseline, cdpCorrective)
      await new Promise((r) => setTimeout(r, 500))
    }

    // 1. Capture Screenshots
    await cdpBaseline.send('Page.bringToFront')
    const baseCapture = await cdpBaseline.send('Page.captureScreenshot', { format: 'png' })

    await cdpCorrective.send('Page.bringToFront')
    const corrCapture = await cdpCorrective.send('Page.captureScreenshot', { format: 'png' })

    const baseBuf = Buffer.from(baseCapture.data, 'base64')
    const corrBuf = Buffer.from(corrCapture.data, 'base64')

    // 2. Extract DOM State
    const baseState = await extractDomState(cdpBaseline)
    const corrState = await extractDomState(cdpCorrective)

    // 3. Geometry Delta Assertions (<= 2px)
    const deltas = computeGeometryDeltas(baseState, corrState)
    console.log(`Modal Geometry Delta: dx=${deltas.modal.dx}px, dy=${deltas.modal.dy}px, dw=${deltas.modal.dw}px, dh=${deltas.modal.dh}px`)
    assert.ok(deltas.modal.dx <= 2, `Modal deltaX ${deltas.modal.dx} exceeds 2px on ${viewKey}`)
    assert.ok(deltas.modal.dy <= 2, `Modal deltaY ${deltas.modal.dy} exceeds 2px on ${viewKey}`)
    assert.ok(deltas.modal.dw <= 2, `Modal deltaWidth ${deltas.modal.dw} exceeds 2px on ${viewKey}`)
    assert.ok(deltas.modal.dh <= 2, `Modal deltaHeight ${deltas.modal.dh} exceeds 2px on ${viewKey}`)

    // 4. In-Browser HTML5 Canvas Pixel Diff
    const pixelDiff = await cdpCorrective.evaluate(`(${inBrowserCanvasPixelDiff.toString()})(${JSON.stringify(baseCapture.data)}, ${JSON.stringify(corrCapture.data)})`)
    console.log(`Pixel Diff: ${pixelDiff.mismatchedPixels} mismatched pixels (${pixelDiff.mismatchPercentage.toFixed(4)}% delta)`)
    assert.ok(pixelDiff.mismatchPercentage <= 0.25, `Pixel mismatch ${pixelDiff.mismatchPercentage.toFixed(4)}% exceeds 0.25% threshold on ${viewKey}`)

    const diffBuf = Buffer.from(pixelDiff.diffBase64, 'base64')
    const compBuf = Buffer.from(pixelDiff.compositeBase64, 'base64')

    // 5. Store Artifacts
    saveArtifact(`${viewKey}-baseline.png`, baseBuf)
    saveArtifact(`${viewKey}-corrective.png`, corrBuf)
    saveArtifact(`${viewKey}-diff.png`, diffBuf)
    saveArtifact(`${viewKey}-side-by-side.png`, compBuf)
    saveArtifact(`${viewKey}.png`, corrBuf)

    report.screenshots[`${viewKey}-baseline`] = { filename: `${viewKey}-baseline.png`, sizeBytes: baseBuf.length }
    report.screenshots[`${viewKey}-corrective`] = { filename: `${viewKey}-corrective.png`, sizeBytes: corrBuf.length }
    report.screenshots[`${viewKey}-diff`] = { filename: `${viewKey}-diff.png`, sizeBytes: diffBuf.length }
    report.screenshots[`${viewKey}-side-by-side`] = { filename: `${viewKey}-side-by-side.png`, sizeBytes: compBuf.length }
    report.screenshots[viewKey] = { filename: `${viewKey}.png`, sizeBytes: corrBuf.length }

    report.views[viewKey] = {
      viewName,
      geometryDeltas: deltas,
      pixelDiff: {
        mismatchedPixels: pixelDiff.mismatchedPixels,
        totalPixels: pixelDiff.totalPixels,
        mismatchPercentage: pixelDiff.mismatchPercentage,
      },
      baselineState: baseState,
      correctiveState: corrState,
      passed: true,
    }

    return { baseState, corrState, deltas, pixelDiff }
  }

  // ====================================================================
  // VIEW 1: Paquetes MinerX Tab
  // ====================================================================
  const view1 = await compareView('01-modal-packages-tab', 'Paquetes MinerX Tab')

  // Verify Tabs on both
  assert.equal(view1.corrState.tabs.length, 4, 'Must have 4 visible tabs: Paquetes, Preventa, Lanzamiento, Mensual')
  assert.equal(view1.corrState.tabs[0].text, 'Paquetes MinerX')
  assert.ok(view1.corrState.tabs[0].active, 'Paquetes tab must be active')
  assert.equal(view1.corrState.tabs[1].text, 'Preventa')
  assert.equal(view1.corrState.tabs[2].text, 'Lanzamiento')
  assert.equal(view1.corrState.tabs[3].text, 'Mensual')

  // Verify Rows on both: 4 fixed rows + 1 Custom card
  assert.equal(view1.corrState.rows.length, 4, 'Corrective must render exactly 4 fixed package rows')
  assert.equal(view1.baseState.rows.length, 4, 'Baseline must render exactly 4 fixed package rows')
  assert.ok(view1.corrState.customRow, 'Corrective must render exactly 1 Custom card')
  assert.ok(view1.baseState.customRow, 'Baseline must render exactly 1 Custom card')

  // Check specific Row 0 metadata (1.46 TH)
  assert.ok(view1.corrState.rows[0].title.includes('1.46 TH'))
  assert.equal(view1.corrState.rows[0].price, '$18.99 USD')
  assert.equal(view1.corrState.rows[0].detail, '0.00000062 BTC/día')
  assert.equal(view1.corrState.rows[0].roi, 'ROI 52.5%*')
  assert.equal(view1.corrState.rows[0].available, '30 disp.')

  // Check Row 1 (8.33 TH)
  assert.ok(view1.corrState.rows[1].title.includes('8.33 TH'))
  assert.equal(view1.corrState.rows[1].price, '$99.99 USD')
  assert.equal(view1.corrState.rows[1].detail, '0.00000354 BTC/día')
  assert.equal(view1.corrState.rows[1].roi, 'ROI 55.62%*')
  assert.equal(view1.corrState.rows[1].available, '30 disp.')

  // Check Row 2 (21.05 TH)
  assert.ok(view1.corrState.rows[2].title.includes('21.05 TH'))
  assert.equal(view1.corrState.rows[2].price, '$249.99 USD')
  assert.equal(view1.corrState.rows[2].detail, '0.00000894 BTC/día')
  assert.equal(view1.corrState.rows[2].roi, 'ROI 56.47%*')
  assert.equal(view1.corrState.rows[2].available, '30 disp.')

  // Check Row 3 (42.44 TH)
  assert.ok(view1.corrState.rows[3].title.includes('42.44 TH'))
  assert.equal(view1.corrState.rows[3].price, '$499.99 USD')
  assert.equal(view1.corrState.rows[3].detail, '0.00001802 BTC/día')
  assert.equal(view1.corrState.rows[3].roi, 'ROI 57.17%*')
  assert.equal(view1.corrState.rows[3].available, '30 disp.')

  // Check Custom card
  assert.ok(view1.corrState.customRow.title.includes('Custom'))
  assert.ok(view1.corrState.customRow.detail.includes('1–5,000 TH · 22 niveles'))

  // Verify Absence of Legacy Pollution
  for (const text of [view1.baseState.bodyText, view1.corrState.bodyText]) {
    assert.ok(!text.includes('Minero 1'), 'Must not contain legacy "Minero 1"')
    assert.ok(!text.includes('Minero 2'), 'Must not contain legacy "Minero 2"')
    assert.ok(!text.includes('Minero 3'), 'Must not contain legacy "Minero 3"')
    assert.ok(!text.includes('Minero 4'), 'Must not contain legacy "Minero 4"')
    assert.ok(!text.includes('Minero 5'), 'Must not contain legacy "Minero 5"')
    assert.ok(!text.includes('Entry'), 'Must not contain legacy "Entry"')
    assert.ok(!text.includes('Standard'), 'Must not contain legacy "Standard"')
    assert.ok(!text.includes('Master'), 'Must not contain legacy "Master"')
    assert.ok(!text.includes('Enterprise'), 'Must not contain legacy "Enterprise"')
  }
  report.verifications.view1_packages = { passed: true }

  // ====================================================================
  // VIEW 2: Preventa Tab
  // ====================================================================
  const view2 = await compareView('02-modal-presale-tab', 'Preventa Tab', async (bCdp, cCdp) => {
    await Promise.all([
      bCdp.evaluate(`document.querySelector('#miner-tab-presale').click()`),
      cCdp.evaluate(`document.querySelector('#miner-tab-presale').click()`),
    ])
  })

  assert.ok(view2.corrState.heading.includes('4 niveles exclusivos limitados a 30 unidades'))
  assert.ok(view2.corrState.heading.includes('PREVENTA LIMITADA'))
  assert.equal(view2.corrState.rows.length, 4, 'Preventa tab must render exactly 4 canonical rows')
  assert.equal(view2.baseState.rows.length, 4, 'Baseline Preventa tab must render exactly 4 canonical rows')

  assert.ok(view2.corrState.rows[0].title.includes('1.46 TH'))
  assert.equal(view2.corrState.rows[0].price, '$18.99 USD')
  assert.equal(view2.corrState.rows[0].detail, '0.00000062 BTC/día')
  assert.equal(view2.corrState.rows[0].roi, 'ROI 52.5%*')
  assert.equal(view2.corrState.rows[0].available, '30 disp.')
  report.verifications.view2_presale = { passed: true }

  // ====================================================================
  // VIEW 3: Lanzamiento Tab
  // ====================================================================
  const view3 = await compareView('03-modal-launch-tab', 'Lanzamiento Tab', async (bCdp, cCdp) => {
    await Promise.all([
      bCdp.evaluate(`document.querySelector('#miner-tab-launch').click()`),
      cCdp.evaluate(`document.querySelector('#miner-tab-launch').click()`),
    ])
  })

  assert.ok(view3.corrState.heading.includes('16 niveles estándar desde 42.44 TH'))
  assert.ok(view3.corrState.heading.includes('LANZAMIENTO'))
  assert.equal(view3.corrState.rows.length, 16, 'Lanzamiento tab must render exactly 16 canonical rows')
  assert.equal(view3.baseState.rows.length, 16, 'Baseline Lanzamiento tab must render exactly 16 canonical rows')

  assert.ok(view3.corrState.rows[0].title.includes('42.44 TH'))
  assert.equal(view3.corrState.rows[0].price, '$499.99 USD')
  assert.equal(view3.corrState.rows[0].detail, '0.00001802 BTC/día')
  assert.equal(view3.corrState.rows[0].roi, 'ROI 57.17%*')

  assert.ok(view3.corrState.rows[15].title.includes('5,000 TH'))
  assert.equal(view3.corrState.rows[15].price, '$54,768.99 USD')
  assert.equal(view3.corrState.rows[15].detail, '0.00212250 BTC/día')
  assert.equal(view3.corrState.rows[15].roi, 'ROI 57.2%*')
  report.verifications.view3_launch = { passed: true }

  // ====================================================================
  // VIEW 4: Mensual Tab
  // ====================================================================
  const view4 = await compareView('04-modal-monthly-tab', 'Mensual Tab', async (bCdp, cCdp) => {
    await Promise.all([
      bCdp.evaluate(`document.querySelector('#miner-tab-monthly').click()`),
      cCdp.evaluate(`document.querySelector('#miner-tab-monthly').click()`),
    ])
  })

  assert.equal(view4.corrState.rows.length, 4, 'Mensual tab must render exactly 4 subscription tiers')
  assert.equal(view4.baseState.rows.length, 4, 'Baseline Mensual tab must render exactly 4 subscription tiers')
  assert.ok(view4.corrState.rows[0].title.includes('Inicio'))
  assert.equal(view4.corrState.rows[0].price, '$39.99 USD')
  assert.ok(view4.corrState.rows[1].title.includes('Plus'))
  assert.ok(view4.corrState.rows[2].title.includes('Pro'))
  assert.ok(view4.corrState.rows[3].title.includes('Máximo'))
  report.verifications.view4_monthly = { passed: true }

  // ====================================================================
  // VIEW 5: Stage 2 Checkout Review Step
  // ====================================================================
  const view5 = await compareView('05-modal-checkout-review-step', 'Stage 2 Checkout Review Step', async (bCdp, cCdp) => {
    // Return to Paquetes tab first
    await Promise.all([
      bCdp.evaluate(`document.querySelector('#miner-tab-packages').click()`),
      cCdp.evaluate(`document.querySelector('#miner-tab-packages').click()`),
    ])
    await new Promise((r) => setTimeout(r, 400))

    // Click "Continuar a la compra"
    await Promise.all([
      bCdp.evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('.purchase-modal-actions button')).find((b) => b.textContent.includes('Continuar a la compra'))
        btn?.click()
      })()`),
      cCdp.evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('.purchase-modal-actions button')).find((b) => b.textContent.includes('Continuar a la compra'))
        btn?.click()
      })()`),
    ])
  })

  assert.equal(view5.corrState.stage2Eyebrow, 'PASO 2 DE 2 · CONFIRMAR COMPRA')
  assert.equal(view5.baseState.stage2Eyebrow, 'PASO 2 DE 2 · CONFIRMAR COMPRA')
  assert.equal(view5.corrState.stage2Title, 'Revisa tu minero')
  assert.equal(view5.baseState.stage2Title, 'Revisa tu minero')
  assert.ok(view5.corrState.stage2Total.includes('$18.99 USD'))
  assert.ok(view5.baseState.stage2Total.includes('$18.99 USD'))

  assert.ok(view5.corrState.stage2Grid.some((g) => g.includes('Potencia') && g.includes('1.46 TH')))
  assert.ok(view5.corrState.stage2Grid.some((g) => g.includes('Eficiencia') && g.includes('15 W/TH')))
  assert.ok(view5.corrState.stage2Grid.some((g) => g.includes('Paquetes MinerX')))

  // Verify Consent Checkbox Toggle & Primary Payment Button on both
  const consentResults = await Promise.all([
    cdpBaseline.evaluate(`(() => {
      const chk = document.querySelector('.simulation-consent input')
      if (chk) chk.click()
      const btn = Array.from(document.querySelectorAll('.purchase-modal-actions button.button-primary')).find((b) => b.textContent.toLowerCase().includes('pagar'))
      return btn && !btn.disabled
    })()`),
    cdpCorrective.evaluate(`(() => {
      const chk = document.querySelector('.simulation-consent input')
      if (chk) chk.click()
      const btn = Array.from(document.querySelectorAll('.purchase-modal-actions button.button-primary')).find((b) => b.textContent.toLowerCase().includes('pagar'))
      return btn && !btn.disabled
    })()`),
  ])
  assert.ok(consentResults[0], 'Baseline payment button must enable upon consent checkbox accept')
  assert.ok(consentResults[1], 'Corrective payment button must enable upon consent checkbox accept')
  report.verifications.view5_checkout = { passed: true, consentButtonEnabled: true }

  // ====================================================================
  // VIEW 6: Paquetes Tab - Custom Selected State & Editor Roundtrip
  // ====================================================================
  const view6 = await compareView('06-modal-custom-selected', 'Paquetes Tab - Custom Selected', async (bCdp, cCdp) => {
    // 1. Exit Stage 2 review back to configure stage
    await Promise.all([
      bCdp.evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('.purchase-modal-actions button')).find((b) => b.textContent.includes('Volver'))
        btn?.click()
      })()`),
      cCdp.evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('.purchase-modal-actions button')).find((b) => b.textContent.includes('Volver'))
        btn?.click()
      })()`),
    ])
    await new Promise((r) => setTimeout(r, 400))

    // 2. Ensure Paquetes MinerX tab is selected
    await Promise.all([
      bCdp.evaluate(`document.querySelector('#miner-tab-packages')?.click()`),
      cCdp.evaluate(`document.querySelector('#miner-tab-packages')?.click()`),
    ])
    await new Promise((r) => setTimeout(r, 300))

    // 3. Click Custom option card
    await Promise.all([
      bCdp.evaluate(`document.querySelector('.miner-option-row-custom')?.click()`),
      cCdp.evaluate(`document.querySelector('.miner-option-row-custom')?.click()`),
    ])
    await new Promise((r) => setTimeout(r, 400))
  })

  // Assertions: Custom row active on both baseline and corrective
  assert.ok(view6.corrState.customRow?.isActive, 'Corrective custom row must be active')
  assert.ok(view6.baseState.customRow?.isActive, 'Baseline custom row must be active')
  for (let i = 0; i < 4; i++) {
    assert.ok(!view6.corrState.rows[i]?.isActive, `Corrective row ${i} must not be active when Custom is selected`)
    assert.ok(!view6.baseState.rows[i]?.isActive, `Baseline row ${i} must not be active when Custom is selected`)
  }

  // Assertions: Config summary card values ($12.99 USD, 1.00 TH, 15 W/TH)
  assert.ok(view6.corrState.configSummary.includes('$12.99 USD'), 'Corrective summary must display $12.99 USD')
  assert.ok(view6.baseState.configSummary.includes('$12.99 USD'), 'Baseline summary must display $12.99 USD')
  assert.ok(view6.corrState.configSummary.includes('1.00 TH'), 'Corrective summary must display 1.00 TH')
  assert.ok(view6.baseState.configSummary.includes('1.00 TH'), 'Baseline summary must display 1.00 TH')
  assert.ok(view6.corrState.configSummary.includes('15 W/TH'), 'Corrective summary must display 15 W/TH')
  assert.ok(!view6.corrState.configSummary.includes('$561.99 USD'), 'Corrective must NOT fall back to $561.99 USD')
  assert.ok(!view6.corrState.configSummary.includes('48.00 TH'), 'Corrective must NOT fall back to 48.00 TH')
  assert.equal(view6.corrState.configSummary, view6.baseState.configSummary, 'Baseline and corrective config summary must match')

  // Assertions: Primary button enabled
  assert.ok(!view6.corrState.primaryButtonDisabled, 'Primary button must be enabled when Custom is selected')
  assert.ok(!view6.baseState.primaryButtonDisabled, 'Baseline primary button must be enabled when Custom is selected')

  // Behavioral Roundtrip: Open Custom Editor -> Back -> Validate Custom state retained
  await Promise.all([
    cdpBaseline.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('.purchase-modal-actions button.button-primary')).find((b) => b.textContent.includes('Continuar a la compra'))
      btn?.click()
    })()`),
    cdpCorrective.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('.purchase-modal-actions button.button-primary')).find((b) => b.textContent.includes('Continuar a la compra'))
      btn?.click()
    })()`),
  ])
  await new Promise((r) => setTimeout(r, 500))

  const inEditor = await Promise.all([
    cdpBaseline.evaluate(`Boolean(document.querySelector('.miner-creation-screen-custom'))`),
    cdpCorrective.evaluate(`Boolean(document.querySelector('.miner-creation-screen-custom'))`),
  ])
  assert.ok(inEditor[0], 'Baseline must render custom editor screen')
  assert.ok(inEditor[1], 'Corrective must render custom editor screen')

  // Click Back button in custom editor
  await Promise.all([
    cdpBaseline.evaluate(`document.querySelector('.miner-custom-back')?.click()`),
    cdpCorrective.evaluate(`document.querySelector('.miner-custom-back')?.click()`),
  ])
  await new Promise((r) => setTimeout(r, 500))

  const postBackBase = await extractDomState(cdpBaseline)
  const postBackCorr = await extractDomState(cdpCorrective)
  assert.ok(postBackCorr.customRow?.isActive, 'Corrective custom row must remain active after returning from editor')
  assert.ok(postBackBase.customRow?.isActive, 'Baseline custom row must remain active after returning from editor')
  assert.ok(postBackCorr.configSummary.includes('$12.99 USD'), 'Summary must retain $12.99 USD after returning from editor')
  assert.ok(postBackCorr.configSummary.includes('1.00 TH'), 'Summary must retain 1.00 TH after returning from editor')
  assert.equal(postBackCorr.configSummary, postBackBase.configSummary, 'Config summary must match baseline after editor back')

  report.verifications.view6_custom = {
    passed: true,
    customRowActive: true,
    configSummaryMatched: true,
    editorRoundtripVerified: true,
  }

  // Final Summary
  report.status = 'SUCCESS'
  report.allVerificationsPassed = true

  const reportWorktree = join(evidenceDirWorktree, 'visual-parity-report.json')
  const reportTeamwork = join(evidenceDirTeamwork, 'visual-parity-report.json')
  writeFileSync(reportWorktree, JSON.stringify(report, null, 2))
  writeFileSync(reportTeamwork, JSON.stringify(report, null, 2))
  console.log(`\nVisual parity report successfully written to:`)
  console.log(` - ${reportWorktree}`)
  console.log(` - ${reportTeamwork}\n`)

  // --- Step 5: Teardown & Clean Up ---
  console.log('Cleaning up child processes, background servers, and temporary folders...')
  cdpBaseline.close()
  cdpCorrective.close()

  await killProcessTree(browserProcess.pid)
  await killProcessTree(baselineProcess.pid)
  await killProcessTree(correctiveProcess.pid)
  await new Promise((resolveClose) => backendServer.close(resolveClose))

  try {
    const nm = join(baselineDir, 'node_modules')
    if (existsSync(nm)) unlinkSync(nm)
  } catch {}
  try { rmSync(baselineDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch {}
  try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch {}

  console.log('======================================================================')
  console.log(' SCRUM-218 Real Browser Visual Parity Verification: ALL PASS (Exit 0)')
  console.log('======================================================================')
}

run().catch(async (err) => {
  console.error('\nVisual parity verification failed with error:', err)
  process.exit(1)
})
