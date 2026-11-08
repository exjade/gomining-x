import assert from 'node:assert/strict';
import fs from 'fs';
import { FirebaseAdminCatalogStoreAdapter } from '../../server/services/firebaseAdminCatalogAdapter.js';

async function runLiveReadSmoke(): Promise<void> {
  if (process.env.RUN_LIVE_FIRESTORE_READ !== '1') {
    console.log('[SMOKE] Opt-in live Firestore read smoke test skipped.');
    console.log('[SMOKE] To execute: set RUN_LIVE_FIRESTORE_READ=1 and GOOGLE_APPLICATION_CREDENTIALS=<path>');
    return;
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath || !fs.existsSync(credPath)) {
    console.warn(`[SMOKE] GOOGLE_APPLICATION_CREDENTIALS is not set or file does not exist: "${credPath}".`);
    console.warn('[SMOKE] Please point GOOGLE_APPLICATION_CREDENTIALS to a valid service account JSON to run this smoke test.');
    return;
  }

  console.log('[SMOKE] Running authorized live Firestore read smoke test (READ ONLY)...');
  const adapter = new FirebaseAdminCatalogStoreAdapter();
  assert.ok(adapter.isInitialized(), 'Adapter must be initialized with valid credentials');

  const packages = await adapter.getPackages();
  assert.ok(Array.isArray(packages), 'adapter.getPackages() must return an array');
  console.log(`[SMOKE] Successfully fetched ${packages.length} package(s) read-only from live Cloud Firestore.`);

  // Verify that documents have valid CommercialPackage shape if any exist, without assuming exact count
  for (const pkg of packages) {
    assert.ok(pkg.id, 'Every package must have an id');
    assert.ok(typeof pkg.name === 'string', 'Package must have a string name');
    assert.ok(typeof pkg.powerTh === 'number', 'Package must have a numeric powerTh');
    assert.ok(typeof pkg.priceUsdt === 'number', 'Package must have a numeric priceUsdt');
  }

  console.log('[SMOKE] Live read verification passed with ZERO production writes.');
}

runLiveReadSmoke().catch(err => {
  console.error('[SMOKE] Live read smoke failed:', err);
  process.exit(1);
});
