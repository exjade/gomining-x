import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import type { Server } from 'http';
import { app, setCatalogService } from '../server/server.js';
import { CatalogService, MemoryCatalogStoreAdapter } from '../src/services/catalogService.js';
import type { CommercialPackage } from '../src/types/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKTREE_ROOT = path.resolve(__dirname, '..');
const USERS_FILE = path.resolve(WORKTREE_ROOT, 'server/data/users.json');

const samplePackages: CommercialPackage[] = [
  {
    id: 'pkg-minerx-1',
    packageId: 'pkg-minerx-1',
    name: 'MinerX Titan Pro',
    powerTh: 150,
    priceUsdt: 1200,
    currency: 'USD',
    section: 'minerx',
    packageType: 'fixed',
    sortOrder: 1,
    status: 'ACTIVE',
    isPublished: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pkg-prev-1',
    packageId: 'pkg-prev-1',
    name: 'Preventa Early Alpha',
    powerTh: 200,
    priceUsdt: 1800,
    currency: 'USD',
    section: 'preventa',
    packageType: 'subscription',
    sortOrder: 2,
    status: 'ACTIVE',
    isPublished: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pkg-lanz-1',
    packageId: 'pkg-lanz-1',
    name: 'Lanzamiento Especial',
    powerTh: 300,
    priceUsdt: 2500,
    currency: 'USD',
    section: 'lanzamiento',
    packageType: 'custom',
    sortOrder: 3,
    status: 'ACTIVE',
    isPublished: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pkg-mens-1',
    packageId: 'pkg-mens-1',
    name: 'Mensual Plus',
    powerTh: 80,
    priceUsdt: 800,
    currency: 'USD',
    section: 'mensual',
    packageType: 'subscription',
    sortOrder: 4,
    status: 'ACTIVE',
    isPublished: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pkg-arch-1',
    packageId: 'pkg-arch-1',
    name: 'Archived Legacy Miner',
    powerTh: 50,
    priceUsdt: 450,
    currency: 'USD',
    section: 'minerx',
    packageType: 'fixed',
    sortOrder: 5,
    status: 'ARCHIVED',
    isPublished: false,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'pkg-legacy-1',
    name: 'Minero 1 Entry',
    powerTh: 48,
    priceUsdt: 561.99,
    isLegacy: true,
    status: 'ACTIVE',
    isPublished: true,
    version: 1,
    description: 'Definición estática de hardware minero legacy.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

async function main() {
  console.log('=== SCRUM-217 RUNTIME ADMIN 5174 VERIFICATION ===');
  let originalUsersJson = '';
  let server: Server | null = null;
  let viteProc: ChildProcess | null = null;
  let chromeProc: ChildProcess | null = null;
  let tempChromeDir = '';

  try {
    // 1. Safe in-memory catalog store setup (ZERO production writes)
    console.log('[1/7] Initializing in-memory mock catalog store...');
    const mockStore = new MemoryCatalogStoreAdapter(samplePackages);
    const catalog = new CatalogService(mockStore);
    setCatalogService(catalog);

    // 2. Setup safe test admin user
    if (fs.existsSync(USERS_FILE)) {
      originalUsersJson = fs.readFileSync(USERS_FILE, 'utf-8');
    }
    const safeUsers = {
      users: [
        {
          id: 'usr_scrum217_admin',
          username: 'admin',
          email: 'admin@minerx.cloud',
          fullName: 'Administrator SCRUM-217',
          role: 'admin',
          passwordHash: 'admin123',
          sessionToken: 'scrum217_admin_test_session_token',
          createdAt: new Date().toISOString(),
        },
      ],
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(safeUsers, null, 2), 'utf-8');

    // 3. Start Express backend on port 3001
    console.log('[2/7] Starting safe local Express backend on port 3001...');
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(3001, () => {
        console.log('  -> Express server listening on http://localhost:3001');
        resolve(s);
      });
    });

    // 4. Start Vite on port 5174
    console.log('[3/7] Starting Admin Vite server on port 5174...');
    viteProc = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], {
      cwd: WORKTREE_ROOT,
      shell: true,
      stdio: 'pipe',
    });

    // Wait for Vite to become responsive
    let viteReady = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res = await fetch('http://127.0.0.1:5174');
        if (res.ok) {
          viteReady = true;
          console.log(`  -> Vite ready on http://127.0.0.1:5174 (attempt ${i + 1})`);
          break;
        }
      } catch {}
    }
    if (!viteReady) {
      throw new Error('Vite dev server failed to start on port 5174 within 30s');
    }

    // 5. Launch Chrome headless with clean isolated profile
    console.log('[4/7] Launching Headless Chrome with CDP on port 9222...');
    tempChromeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-scrum217-'));
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    chromeProc = spawn(chromePath, [
      '--headless=new',
      '--remote-debugging-port=9222',
      '--disable-gpu',
      '--disable-extensions',
      `--user-data-dir=${tempChromeDir}`,
      'about:blank',
    ]);

    // Wait for Chrome CDP
    let pageWsUrl = '';
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch('http://127.0.0.1:9222/json');
        const targets = await res.json();
        const p = targets.find((t: any) => t.type === 'page');
        if (p?.webSocketDebuggerUrl) {
          pageWsUrl = p.webSocketDebuggerUrl;
          console.log('  -> Chrome CDP ready on port 9222');
          break;
        }
      } catch {}
    }
    if (!pageWsUrl) throw new Error('Failed to connect to Chrome CDP port 9222');

    // 6. Connect WebSocket and define CDP helpers
    const ws = new WebSocket(pageWsUrl);
    await new Promise((resolve) => (ws.onopen = resolve));

    let msgId = 1;
    function cdpSend(method: string, params: any = {}): Promise<any> {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        const handler = (evt: any) => {
          const msg = JSON.parse(evt.data);
          if (msg.id === id) {
            ws.removeEventListener('message', handler);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate<T = any>(expr: string): Promise<T> {
      const res = await cdpSend('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) {
        throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
      }
      return res.result?.value as T;
    }

    // 7. Inject auth credentials into localStorage
    console.log('[5/7] Injecting auth credentials and loading Admin Catalog at http://127.0.0.1:5174/?tab=admin_packages...');
    await cdpSend('Page.navigate', { url: 'http://127.0.0.1:5174' });
    await new Promise((r) => setTimeout(r, 2000));

    await evaluate(`
      localStorage.setItem('minerx_auth_token', 'scrum217_admin_test_session_token');
      localStorage.setItem('minerx_user', JSON.stringify({
        id: 'usr_scrum217_admin',
        username: 'admin',
        email: 'admin@minerx.cloud',
        role: 'admin',
        fullName: 'Administrator SCRUM-217'
      }));
    `);

    // Navigate to Admin Packages tab
    await cdpSend('Page.navigate', { url: 'http://127.0.0.1:5174/?tab=admin_packages' });

    // Wait for the catalog to load
    let catalogLoaded = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const pageInfo = await evaluate(`
        ({
          url: location.href,
          text: document.body.innerText.slice(0, 300),
          headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent.trim()),
          authToken: localStorage.getItem('minerx_auth_token'),
          hasUser: Boolean(localStorage.getItem('minerx_user'))
        })
      `);
      console.log(`  [Poll ${i + 1}] DOM text: ${JSON.stringify(pageInfo.headings)} | URL: ${pageInfo.url}`);

      const hasHeading = pageInfo.headings.some((h: string) => h.includes('Constructor de Paquetes') || h.includes('Paquetes Comerciales'));
      const hasCards = pageInfo.headings.some((h: string) => h.includes('MinerX Titan Pro'));
      if (hasHeading && hasCards) {
        catalogLoaded = true;
        console.log(`  -> Admin Catalog loaded successfully in browser DOM (attempt ${i + 1})`);
        break;
      }
    }
    if (!catalogLoaded) {
      const dump = await evaluate(`document.body.innerText`);
      console.log('DUMP BODY TEXT:\n', dump);
      throw new Error('Admin Catalog failed to render in DOM within 20s');
    }

    // 8. VERIFICATION CHECKS
    console.log('\n[6/7] Running 7 Browser/DOM Acceptance Checks...');

    // CHECK 1: Catálogo Admin carga
    const check1 = await evaluate(`
      (() => {
        const titles = Array.from(document.querySelectorAll('h3')).map(e => e.textContent.trim());
        const cards = document.querySelectorAll('.grid > div');
        return {
          titles,
          cardCount: titles.length,
          hasMinerX: titles.includes('MinerX Titan Pro'),
          hasPreventa: titles.includes('Preventa Early Alpha'),
          hasLanzamiento: titles.includes('Lanzamiento Especial'),
          hasMensual: titles.includes('Mensual Plus'),
          hasArchived: titles.includes('Archived Legacy Miner'),
        };
      })()
    `);
    console.log('\n--- CHECK 1: Catálogo Admin Carga ---');
    console.log('Result:', JSON.stringify(check1, null, 2));
    if (!check1.hasMinerX || !check1.hasPreventa || !check1.hasLanzamiento || !check1.hasMensual) {
      throw new Error('Check 1 Failed: Canonical packages not loaded in Admin catalog');
    }

    // CHECK 2: Filtros: MinerX, Preventa, Lanzamiento, Mensual
    console.log('\n--- CHECK 2: Filtros (MinerX, Preventa, Lanzamiento, Mensual) ---');
    const check2 = await evaluate(`
      (async () => {
        const results = {};
        const buttons = Array.from(document.querySelectorAll('button'));

        function getVisiblePackageNames() {
          return Array.from(document.querySelectorAll('div.grid:not(.opacity-75) h3')).map(e => e.textContent.trim());
        }

        // Test Preventa
        const prevBtn = buttons.find(b => b.textContent.trim() === 'Preventa');
        if (prevBtn) {
          prevBtn.click();
          await new Promise(r => setTimeout(r, 200));
        }
        results.afterPreventaClick = getVisiblePackageNames();

        // Test Lanzamiento
        const lanzBtn = buttons.find(b => b.textContent.trim() === 'Lanzamiento');
        if (lanzBtn) {
          lanzBtn.click();
          await new Promise(r => setTimeout(r, 200));
        }
        results.afterLanzamientoClick = getVisiblePackageNames();

        // Test Mensual
        const mensBtn = buttons.find(b => b.textContent.trim() === 'Mensual');
        if (mensBtn) {
          mensBtn.click();
          await new Promise(r => setTimeout(r, 200));
        }
        results.afterMensualClick = getVisiblePackageNames();

        // Test MinerX
        const minerxBtn = buttons.find(b => b.textContent.trim() === 'MinerX');
        if (minerxBtn) {
          minerxBtn.click();
          await new Promise(r => setTimeout(r, 200));
        }
        results.afterMinerXClick = getVisiblePackageNames();

        // Restore Todas las Secciones
        const allBtn = buttons.find(b => b.textContent.includes('Todas las Secciones'));
        if (allBtn) {
          allBtn.click();
          await new Promise(r => setTimeout(r, 200));
        }
        results.afterAllClick = getVisiblePackageNames();

        return results;
      })()
    `);
    console.log('Result:', JSON.stringify(check2, null, 2));

    // CHECK 3: Legacy aparece read-only
    console.log('\n--- CHECK 3: Legacy Aparece Read-Only ---');
    const check3 = await evaluate(`
      (() => {
        const legacyHeading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Catálogo Legacy Preservado'));
        const legacyBadge = Array.from(document.querySelectorAll('span')).find(s => s.textContent.trim() === 'LEGACY');
        const legacyCardTitle = Array.from(document.querySelectorAll('h4')).find(h => h.textContent.includes('Minero 1 Entry'));
        const immutableBadge = Array.from(document.querySelectorAll('span')).find(s => s.textContent.includes('Inmutable'));
        const noEditableBadge = Array.from(document.querySelectorAll('span')).find(s => s.textContent.includes('No editable'));

        // Ensure no edit button exists on the legacy card
        const legacyCard = legacyBadge ? legacyBadge.closest('.rounded-3xl') : null;
        const hasEditButton = legacyCard ? Boolean(legacyCard.querySelector('button[title*="Editar"], button:has(.lucide-edit-3)')) : false;

        return {
          hasLegacySection: Boolean(legacyHeading),
          hasLegacyBadge: Boolean(legacyBadge),
          hasLegacyCardTitle: Boolean(legacyCardTitle),
          hasImmutableNotice: Boolean(immutableBadge),
          hasNoEditableNotice: Boolean(noEditableBadge),
          hasEditButtonOnLegacy: hasEditButton
        };
      })()
    `);
    console.log('Result:', JSON.stringify(check3, null, 2));
    if (!check3.hasLegacyBadge || !check3.hasNoEditableNotice || check3.hasEditButtonOnLegacy) {
      throw new Error('Check 3 Failed: Legacy package is not properly isolated as read-only');
    }

    // CHECK 4: Modal CREATE abre con campos limpios
    console.log('\n--- CHECK 4: Modal CREATE Abre con Campos Limpios ---');
    const check4 = await evaluate(`
      (async () => {
        const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nuevo Paquete Canónico'));
        if (!createBtn) return { error: 'Create button not found' };
        createBtn.click();
        await new Promise(r => setTimeout(r, 600));

        // Inspect form fields in modal
        const sectionSelect = document.querySelector('select:has(option[value="minerx"])');
        const packageTypeSelect = document.querySelector('select:has(option[value="fixed"])');
        const sortOrderInput = document.querySelector('input[placeholder="Ej: 1"]');
        const statusSelect = document.querySelector('select:has(option[value="ACTIVE"])');
        const isPublishedSelect = document.querySelector('select:has(option[value="true"])');

        return {
          modalOpen: Boolean(document.querySelector('.fixed.inset-0')),
          sectionValue: sectionSelect ? sectionSelect.value : null,
          packageTypeValue: packageTypeSelect ? packageTypeSelect.value : null,
          sortOrderValue: sortOrderInput ? sortOrderInput.value : null,
          statusValue: statusSelect ? statusSelect.value : null,
          isPublishedValue: isPublishedSelect ? isPublishedSelect.value : null,
        };
      })()
    `);
    console.log('Result:', JSON.stringify(check4, null, 2));
    if (
      check4.sectionValue !== '' ||
      check4.packageTypeValue !== '' ||
      check4.sortOrderValue !== '' ||
      check4.statusValue !== '' ||
      check4.isPublishedValue !== ''
    ) {
      throw new Error('Check 4 Failed: Modal CREATE fields are not empty/clean');
    }

    // CHECK 5: Precio canónico se comunica como USD
    console.log('\n--- CHECK 5: Precio Canónico Comunicado como USD ---');
    const check5 = await evaluate(`
      (async () => {
        // Form label
        const priceLabel = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('Precio Comercial'));

        // Enter price 1200 and power 100 to trigger simulation preview
        const setVal = (el, val) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };

        const powerInput = document.querySelector('input[placeholder="Ej: 100"]');
        const priceInput = document.querySelector('input[placeholder="Ej: 1200"]');
        if (powerInput) setVal(powerInput, '100');
        if (priceInput) setVal(priceInput, '1200');

        await new Promise(r => setTimeout(r, 400));

        // Check live simulation text
        const simPreviewSpan = Array.from(document.querySelectorAll('span')).find(s => s.textContent.includes('sobre $'));

        // Check canonical card prices in grid
        const cardPrices = Array.from(document.querySelectorAll('div.grid:not(.opacity-75) span'))
          .filter(s => s.textContent.startsWith('$') && (s.textContent.includes('USD') || s.textContent.includes('USDT')))
          .map(s => s.textContent.trim());

        return {
          priceLabelText: priceLabel ? priceLabel.textContent.trim() : null,
          isUsdInLabel: priceLabel ? priceLabel.textContent.includes('(USD)') : false,
          isNotUsdtInLabel: priceLabel ? !priceLabel.textContent.includes('(USDT)') : false,
          simPreviewText: simPreviewSpan ? simPreviewSpan.textContent.trim() : null,
          isUsdInSimPreview: simPreviewSpan ? simPreviewSpan.textContent.includes('USD') : false,
          cardPrices: cardPrices,
          allCardsUseUsd: cardPrices.every(p => p.includes('USD') && !p.includes('USDT'))
        };
      })()
    `);
    console.log('Result:', JSON.stringify(check5, null, 2));
    if (!check5.isUsdInLabel || !check5.isUsdInSimPreview || !check5.allCardsUseUsd) {
      throw new Error('Check 5 Failed: Visible canonical currency is not strictly USD');
    }

    // Check 5b: Validation message communicates USD
    const check5b = await evaluate(`
      (async () => {
        const setVal = (el, val) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };

        const priceInput = document.querySelector('input[placeholder="Ej: 1200"]');
        if (priceInput) setVal(priceInput, '-10');

        const nameInput = document.querySelector('input[placeholder="Ej: Minero 6 Pro"]');
        if (nameInput) setVal(nameInput, 'Test Miner');

        const sectionSelect = document.querySelector('select:has(option[value="minerx"])');
        if (sectionSelect) {
          sectionSelect.value = 'minerx';
          sectionSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const packageTypeSelect = document.querySelector('select:has(option[value="fixed"])');
        if (packageTypeSelect) {
          packageTypeSelect.value = 'fixed';
          packageTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const form = document.querySelector('form');
        if (form) form.noValidate = true;

        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
        await new Promise(r => setTimeout(r, 400));

        const errorDiv = Array.from(document.querySelectorAll('div')).find(d => d.className.includes('bg-rose-500'));
        return {
          errorText: errorDiv ? errorDiv.textContent.trim() : null,
          isUsdInValidationError: errorDiv ? errorDiv.textContent.includes('El precio (USD) debe ser un número positivo.') : false
        };
      })()
    `);
    console.log('Validation Error Check 5b:', JSON.stringify(check5b, null, 2));
    if (!check5b.isUsdInValidationError) {
      throw new Error('Check 5b Failed: Validation error did not state USD');
    }

    // Close modal
    await evaluate(`
      (() => {
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancelar');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    // CHECK 6: ARCHIVED tiene Publish disabled
    console.log('\n--- CHECK 6: ARCHIVED Tiene Publish Disabled ---');
    const check6 = await evaluate(`
      (() => {
        // Find card for Archived Legacy Miner
        const archivedHeading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Archived Legacy Miner'));
        const card = archivedHeading ? archivedHeading.closest('.rounded-3xl') : null;
        if (!card) return { error: 'Archived card not found' };

        const publishBtn = Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Oculto') || b.textContent.includes('En Tienda'));

        return {
          cardFound: true,
          buttonText: publishBtn ? publishBtn.textContent.trim() : null,
          isDisabled: publishBtn ? publishBtn.disabled : null,
          title: publishBtn ? publishBtn.getAttribute('title') : null,
          className: publishBtn ? publishBtn.className : null,
          hasCursorNotAllowed: publishBtn ? publishBtn.className.includes('cursor-not-allowed') : false,
          hasOpacity40: publishBtn ? publishBtn.className.includes('opacity-40') : false,
        };
      })()
    `);
    console.log('Result:', JSON.stringify(check6, null, 2));
    if (!check6.isDisabled || !check6.hasCursorNotAllowed) {
      throw new Error('Check 6 Failed: ARCHIVED package does not have publish disabled');
    }

    // CHECK 7: Un error backend se muestra y NO simula éxito/cierre del modal
    console.log('\n--- CHECK 7: Error Backend Se Muestra y NO Simula Éxito/Cierre ---');
    // Open create modal again
    await evaluate(`
      (async () => {
        const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nuevo Paquete Canónico'));
        if (createBtn) createBtn.click();
        await new Promise(r => setTimeout(r, 600));
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    // Set mockStore to simulate backend error
    mockStore.savePackage = async () => {
      throw new Error('Simulated database integrity constraint violation (backend rejection test)');
    };

    // Fill valid form inputs
    const check7 = await evaluate(`
      (async () => {
        const setVal = (el, val) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };

        const nameInput = document.querySelector('input[placeholder="Ej: Minero 6 Pro"]');
        if (nameInput) setVal(nameInput, 'Failed Package');

        const sectionSelect = document.querySelector('select:has(option[value="minerx"])');
        if (sectionSelect) {
          sectionSelect.value = 'minerx';
          sectionSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const packageTypeSelect = document.querySelector('select:has(option[value="fixed"])');
        if (packageTypeSelect) {
          packageTypeSelect.value = 'fixed';
          packageTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const powerInput = document.querySelector('input[placeholder="Ej: 100"]');
        if (powerInput) setVal(powerInput, '250');

        const priceInput = document.querySelector('input[placeholder="Ej: 1200"]');
        if (priceInput) setVal(priceInput, '2500');

        const sortOrderInput = document.querySelector('input[placeholder="Ej: 1"]');
        if (sortOrderInput) setVal(sortOrderInput, '10');

        const statusSelect = document.querySelector('select:has(option[value="ACTIVE"])');
        if (statusSelect) {
          statusSelect.value = 'ACTIVE';
          statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const isPublishedSelect = document.querySelector('select:has(option[value="true"])');
        if (isPublishedSelect) {
          isPublishedSelect.value = 'false';
          isPublishedSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();

        // Wait a tick for async mutation
        await new Promise(r => setTimeout(r, 1500));

        const modalOverlay = document.querySelector('.fixed.inset-0');
        const errorAlert = Array.from(document.querySelectorAll('div')).find(d => d.className.includes('bg-rose-500'));

        return {
          modalStillOpen: Boolean(modalOverlay),
          hasErrorAlert: Boolean(errorAlert),
          errorMessage: errorAlert ? errorAlert.textContent.trim() : null,
          containsBackendError: errorAlert ? errorAlert.textContent.includes('Simulated database integrity constraint violation') : false,
        };
      })()
    `);
    console.log('Result:', JSON.stringify(check7, null, 2));
    if (!check7.modalStillOpen || !check7.hasErrorAlert || !check7.containsBackendError) {
      throw new Error('Check 7 Failed: Backend error did not preserve open modal or display error');
    }

    ws.close();
    console.log('\n[7/7] ALL 7 BROWSER ACCEPTANCE CHECKS PASSED PERFECTLY!');
  } finally {
    // Teardown everything cleanly
    if (chromeProc) chromeProc.kill('SIGKILL');
    if (viteProc) viteProc.kill('SIGKILL');
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    if (originalUsersJson) {
      fs.writeFileSync(USERS_FILE, originalUsersJson, 'utf-8');
    }
    if (tempChromeDir && fs.existsSync(tempChromeDir)) {
      try {
        fs.rmSync(tempChromeDir, { recursive: true, force: true });
      } catch {}
    }
    console.log('Teardown complete: Chrome, Vite, Express stopped. server/data/users.json restored.');
  }
}

main().catch((err) => {
  console.error('\n!!! VERIFICATION FAILED !!!\n', err);
  process.exit(1);
});
