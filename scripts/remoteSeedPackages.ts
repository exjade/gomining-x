#!/usr/bin/env node
/**
 * SCRUM-224 / POUW-1.9: Remote Canonical Seed of Commercial Packages.
 *
 * Server-side data materialization script using Firebase Admin credentials and catalog store adapter.
 * Reuses TARGET_PACKAGES_MANIFEST (29 packages: MinerX 5, Preventa 4, Lanzamiento 16, Mensual 4).
 *
 * NON-NEGOTIABLE SAFETY CONSTRAINTS (PO COMMENT 10218):
 * 1. CREATE-ONLY: Uses docRef.create(payload) which fails at Firestore level if document already exists.
 * 2. IDEMPOTENT: Inexistent -> CREATE; Existing -> SKIP. Multiple executions never duplicate or overwrite.
 * 3. ZERO OVERWRITE / ZERO UPDATE / ZERO MERGE / ZERO DELETE: Never uses set({ merge: true }), update(), or delete().
 * 4. PRESERVE LEGACY: All existing documents and pkg-miner-* records are preserved untouched.
 * 5. NO DEFENSIVE NULL CHECKS (AGENTS.md): Manifest is strictly typed and values are guaranteed.
 * 6. priceUsdCents remains PROPOSED and is NOT materialized to Firestore.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TARGET_PACKAGES_MANIFEST, type SeedPackageItem } from '../src/data/seedManifest.js';
import { FirebaseAdminCatalogStoreAdapter } from '../server/services/firebaseAdminCatalogAdapter.js';
import { CatalogService, type CatalogSection, VALID_SECTIONS } from '../src/services/catalogService.js';
import type { CommercialPackage } from '../src/types/admin.js';
import { app, setCatalogService, catalogService as currentCatalogService } from '../server/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RemoteSeedOptions {
  dryRun?: boolean;
  adapter?: any;
  logger?: (msg: string) => void;
  credentialsPath?: string;
}

export interface SeedSummaryItem {
  id: string;
  section: string;
  name: string;
  powerTh: number;
  priceUsdt: number;
  sortOrder: number;
}

export interface SeedSummary {
  total: number;
  created: number;
  skipped: number;
  blocked: number;
  legacyPreserved: number;
  existingIds: string[];
  missingIds: string[];
  details: {
    createdItems: SeedSummaryItem[];
    skippedItems: Array<{ id: string; reason: string }>;
    blockedItems: Array<{ id: string; reason: string }>;
    legacyItems: Array<{ id: string; name?: string }>;
  };
  bySection: Record<string, { total: number; created: number; skipped: number }>;
}

export interface StorefrontVerifyOptions {
  adapter?: any;
  baseUrl?: string;
  credentialsPath?: string;
  logger?: (msg: string) => void;
}

export interface StorefrontSectionReport {
  section: CatalogSection;
  expectedCount: number;
  actualCount: number;
  pass: boolean;
  packages: CommercialPackage[];
  errors: string[];
}

export interface StorefrontVerificationReport {
  pass: boolean;
  totalCanonical: number;
  legacyCount: number;
  sections: Record<CatalogSection, StorefrontSectionReport>;
  errors: string[];
}

const EXPECTED_SECTION_COUNTS: Record<CatalogSection, number> = {
  minerx: 5,
  preventa: 4,
  lanzamiento: 16,
  mensual: 4,
};

/**
 * Validates manifest before any operation.
 * Fails fast if manifest is not exactly 29 packages (5/4/16/4).
 */
export function validateManifest(manifest: SeedPackageItem[] = TARGET_PACKAGES_MANIFEST): void {
  if (manifest.length !== 29) {
    throw new Error(
      `Manifest validation failed: expected exactly 29 packages, got ${manifest.length}. Aborting before any execution.`
    );
  }

  const counts: Record<string, number> = { minerx: 0, preventa: 0, lanzamiento: 0, mensual: 0 };
  for (const pkg of manifest) {
    counts[pkg.section] = (counts[pkg.section] || 0) + 1;
  }

  for (const [section, expected] of Object.entries(EXPECTED_SECTION_COUNTS)) {
    if (counts[section] !== expected) {
      throw new Error(
        `Manifest distribution mismatch for section '${section}': expected ${expected}, got ${counts[section] ?? 0}. Aborting.`
      );
    }
  }
}

/**
 * Builds canonical document payload for Firestore.
 * Conforms to SCRUM-210 / SCRUM-224 contract.
 * Does NOT materialize priceUsdCents (remains PROPOSED per PO mandate).
 * No defensive null guards on typed manifest properties (per AGENTS.md).
 */
export function buildCanonicalPackagePayload(pkg: SeedPackageItem, nowIso: string = new Date().toISOString()): Record<string, any> {
  const payload: Record<string, any> = {
    id: pkg.id,
    packageId: pkg.packageId,
    name: pkg.name,
    displayName: pkg.displayName,
    section: pkg.section,
    packageType: pkg.packageType,
    sortOrder: pkg.sortOrder,
    powerTh: pkg.powerTh,
    priceUsdt: pkg.priceUsdt,
    currency: pkg.currency,
    cadence: pkg.cadence,
    status: 'ACTIVE',
    isPublished: true,
    version: pkg.version,
    frontendKey: pkg.frontendKey,
    source: pkg.source,
    provenance: pkg.provenance,
    seededAt: nowIso,
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
  };

  if (pkg.description) {
    payload.description = pkg.description;
  }
  if (pkg.durationDays !== undefined) {
    payload.durationDays = pkg.durationDays;
  }
  if (pkg.variablePct !== undefined) {
    payload.variablePct = pkg.variablePct;
  }
  if (pkg.commissionPct !== undefined) {
    payload.commissionPct = pkg.commissionPct;
  }
  if (pkg.dailyBtcText !== undefined) {
    payload.dailyBtcText = pkg.dailyBtcText;
  }
  if (pkg.roiPct !== undefined) {
    payload.roiPct = pkg.roiPct;
  }
  if (pkg.limitedUnits !== undefined) {
    payload.limitedUnits = pkg.limitedUnits;
  }
  if (pkg.availableUnits !== undefined) {
    payload.availableUnits = pkg.availableUnits;
  }
  if (pkg.soldUnits !== undefined) {
    payload.soldUnits = pkg.soldUnits;
  }

  return payload;
}

/**
 * Resolves Firebase Admin credentials if not already configured in environment.
 */
function resolveCredentials(explicitPath?: string): void {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return;
  }
  if (explicitPath && fs.existsSync(explicitPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(explicitPath);
    return;
  }
  // Standard location in repo root
  const candidates = [
    path.resolve(process.cwd(), 'salad-miners-firebase-adminsdk-fbsvc-d35c5609a6.json'),
    path.resolve(process.cwd(), '../salad-miners-firebase-adminsdk-fbsvc-d35c5609a6.json'),
    path.resolve(process.cwd(), '../../salad-miners-firebase-adminsdk-fbsvc-d35c5609a6.json'),
    path.resolve(__dirname, '../../salad-miners-firebase-adminsdk-fbsvc-d35c5609a6.json'),
    path.resolve(__dirname, '../../../salad-miners-firebase-adminsdk-fbsvc-d35c5609a6.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = candidate;
      return;
    }
  }
}

/**
 * Executes remote seed runner.
 * Supports programmatic execution with mock adapter as well as live Firebase Admin adapter.
 */
export async function runRemoteSeed(options: RemoteSeedOptions = { dryRun: true }): Promise<SeedSummary> {
  const isDryRun = options.dryRun !== false;
  const log = options.logger || (() => {});

  // 1. Validate manifest before doing anything
  validateManifest(TARGET_PACKAGES_MANIFEST);

  // 2. Prepare store adapter / firestore access
  let adapter = options.adapter;
  let firestore: any = null;

  if (!adapter) {
    resolveCredentials(options.credentialsPath);
    adapter = new FirebaseAdminCatalogStoreAdapter();
    if (!adapter.isInitialized()) {
      throw new Error(
        'FirebaseAdminCatalogStoreAdapter is not initialized. ' +
        'Please configure GOOGLE_APPLICATION_CREDENTIALS pointing to a valid service account JSON.'
      );
    }
  }

  if (typeof adapter.getFirestoreInstance === 'function') {
    firestore = adapter.getFirestoreInstance();
  } else if (typeof adapter.collection === 'function') {
    firestore = adapter;
  }

  // 3. Scan existing documents from Firestore collection
  const existingDocsMap = new Map<string, any>();

  if (typeof adapter.getExistingPackages === 'function') {
    const rawMap = await adapter.getExistingPackages();
    if (rawMap instanceof Map) {
      for (const [k, v] of rawMap.entries()) existingDocsMap.set(k, v);
    } else if (rawMap && typeof rawMap === 'object') {
      for (const [k, v] of Object.entries(rawMap)) existingDocsMap.set(k, v);
    }
  } else if (firestore) {
    const snap = await firestore.collection('commercial_packages').get();
    if (snap && snap.docs) {
      for (const doc of snap.docs) {
        existingDocsMap.set(doc.id, doc.data());
      }
    }
  } else if (typeof adapter.getPackages === 'function') {
    const pkgs = await adapter.getPackages();
    for (const p of pkgs) {
      existingDocsMap.set(p.id, p);
    }
  }

  // 4. Identify and physically preserve legacy documents
  const legacyItems: Array<{ id: string; name?: string }> = [];
  for (const [id, data] of existingDocsMap.entries()) {
    const isLegacy = id.startsWith('pkg-miner-') || !data?.section;
    if (isLegacy) {
      legacyItems.push({ id, name: data?.name });
    }
  }

  const summary: SeedSummary = {
    total: TARGET_PACKAGES_MANIFEST.length,
    created: 0,
    skipped: 0,
    blocked: 0,
    legacyPreserved: legacyItems.length,
    existingIds: [],
    missingIds: [],
    details: {
      createdItems: [],
      skippedItems: [],
      blockedItems: [],
      legacyItems,
    },
    bySection: {
      minerx: { total: 5, created: 0, skipped: 0 },
      preventa: { total: 4, created: 0, skipped: 0 },
      lanzamiento: { total: 16, created: 0, skipped: 0 },
      mensual: { total: 4, created: 0, skipped: 0 },
    },
  };

  log(`[remoteSeed] Total manifest packages: ${summary.total}. Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY (REMOTE WRITE)'}`);
  if (summary.legacyPreserved > 0) {
    log(`[remoteSeed] Found ${summary.legacyPreserved} legacy document(s) in Firestore. Preserving untouched.`);
  }

  // 5. Evaluate each manifest item (create-only, no overwrite, no update, no delete)
  const nowIso = new Date().toISOString();

  for (const pkg of TARGET_PACKAGES_MANIFEST) {
    const alreadyExists = existingDocsMap.has(pkg.id);

    if (alreadyExists) {
      summary.skipped++;
      summary.existingIds.push(pkg.id);
      summary.bySection[pkg.section].skipped++;
      summary.details.skippedItems.push({
        id: pkg.id,
        reason: 'Document ID already exists in Firestore (create-only skip)',
      });
      continue;
    }

    summary.missingIds.push(pkg.id);

    const payload = buildCanonicalPackagePayload(pkg, nowIso);

    if (isDryRun) {
      summary.created++;
      summary.bySection[pkg.section].created++;
      summary.details.createdItems.push({
        id: pkg.id,
        section: pkg.section,
        name: pkg.name,
        powerTh: pkg.powerTh,
        priceUsdt: pkg.priceUsdt,
        sortOrder: pkg.sortOrder,
      });
    } else {
      // APPLY MODE: Execute genuine create-only write
      try {
        if (typeof adapter.createPackageDoc === 'function') {
          await adapter.createPackageDoc(pkg.id, payload);
        } else if (typeof adapter.createPackage === 'function') {
          await adapter.createPackage(pkg.id, payload);
        } else if (firestore) {
          const docRef = firestore.collection('commercial_packages').doc(pkg.id);
          // docRef.create() strictly fails if doc exists at Firestore level (ALREADY_EXISTS / code 6)
          await docRef.create(payload);
        } else {
          throw new Error('No write mechanism available on adapter for create-only write');
        }

        existingDocsMap.set(pkg.id, payload);
        summary.created++;
        summary.bySection[pkg.section].created++;
        summary.details.createdItems.push({
          id: pkg.id,
          section: pkg.section,
          name: pkg.name,
          powerTh: pkg.powerTh,
          priceUsdt: pkg.priceUsdt,
          sortOrder: pkg.sortOrder,
        });
      } catch (err: any) {
        const isAlreadyExists =
          err?.code === 6 ||
          err?.code === 'already-exists' ||
          /already exists/i.test(err?.message || '');

        if (isAlreadyExists) {
          summary.skipped++;
          summary.existingIds.push(pkg.id);
          summary.bySection[pkg.section].skipped++;
          summary.details.skippedItems.push({
            id: pkg.id,
            reason: 'Firestore rejected write: document already exists (create-only guard)',
          });
        } else {
          summary.blocked++;
          summary.details.blockedItems.push({
            id: pkg.id,
            reason: err?.message || String(err),
          });
        }
      }
    }
  }

  log(`[remoteSeed] Execution complete. Created: ${summary.created}, Skipped: ${summary.skipped}, Blocked: ${summary.blocked}, LegacyPreserved: ${summary.legacyPreserved}`);

  return summary;
}

/**
 * Storefront Verification via Real HTTP GET against Express /api/catalog/storefront.
 * Binds an ephemeral server on port 0 (127.0.0.1) if baseUrl is not provided,
 * and issues native HTTP GET requests with Cache-Control and payload verification.
 * Cleans up ephemeral server handles and restores previous catalogService in finally.
 */
export async function verifyStorefrontCatalog(
  optionsOrAdapter?: StorefrontVerifyOptions | any
): Promise<StorefrontVerificationReport> {
  let adapter: any = undefined;
  let explicitBaseUrl: string | undefined = undefined;
  let credentialsPath: string | undefined = undefined;

  if (optionsOrAdapter) {
    if (
      typeof optionsOrAdapter.getExistingPackages === 'function' ||
      typeof optionsOrAdapter.getPackages === 'function' ||
      typeof optionsOrAdapter.createPackageDoc === 'function'
    ) {
      adapter = optionsOrAdapter;
    } else if (typeof optionsOrAdapter === 'object') {
      adapter = optionsOrAdapter.adapter;
      explicitBaseUrl = optionsOrAdapter.baseUrl;
      credentialsPath = optionsOrAdapter.credentialsPath;
    }
  }

  if (!explicitBaseUrl && process.env.STOREFRONT_BASE_URL) {
    explicitBaseUrl = process.env.STOREFRONT_BASE_URL;
  }

  let resolvedAdapter = adapter;
  if (!resolvedAdapter && !explicitBaseUrl) {
    resolveCredentials(credentialsPath);
    resolvedAdapter = new FirebaseAdminCatalogStoreAdapter();
  }

  if (resolvedAdapter && typeof resolvedAdapter.getPackages !== 'function' && typeof resolvedAdapter.getExistingPackages === 'function') {
    const origAdapter = resolvedAdapter;
    resolvedAdapter = {
      ...origAdapter,
      async getPackages() {
        const map = await origAdapter.getExistingPackages();
        return Array.from(map.values());
      },
    };
  }

  const previousCatalogService = currentCatalogService;
  let server: Server | null = null;
  let baseUrl = explicitBaseUrl;

  const manifestMap = new Map<string, SeedPackageItem>();
  for (const p of TARGET_PACKAGES_MANIFEST) {
    manifestMap.set(p.id, p);
  }

  const report: StorefrontVerificationReport = {
    pass: true,
    totalCanonical: 0,
    legacyCount: 0,
    sections: {
      minerx: { section: 'minerx', expectedCount: 5, actualCount: 0, pass: false, packages: [], errors: [] },
      preventa: { section: 'preventa', expectedCount: 4, actualCount: 0, pass: false, packages: [], errors: [] },
      lanzamiento: { section: 'lanzamiento', expectedCount: 16, actualCount: 0, pass: false, packages: [], errors: [] },
      mensual: { section: 'mensual', expectedCount: 4, actualCount: 0, pass: false, packages: [], errors: [] },
    },
    errors: [],
  };

  try {
    if (resolvedAdapter) {
      setCatalogService(new CatalogService(resolvedAdapter));
    }

    if (!baseUrl) {
      server = http.createServer(app);
      await new Promise<void>((resolve, reject) => {
        server!.listen(0, '127.0.0.1', () => resolve());
        server!.once('error', reject);
      });
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }

    for (const section of VALID_SECTIONS) {
      const secReport = report.sections[section];
      const requestUrl = `${baseUrl}/api/catalog/storefront?section=${section}`;

      const res = await fetch(requestUrl);
      if (res.status !== 200) {
        const err = `HTTP GET ${requestUrl} returned status ${res.status} ${res.statusText}`;
        secReport.errors.push(err);
        report.errors.push(err);
        continue;
      }

      const cacheControl = res.headers.get('cache-control');
      if (cacheControl !== 'no-cache') {
        const err = `HTTP GET ${requestUrl} expected Cache-Control: no-cache, got '${cacheControl}'`;
        secReport.errors.push(err);
        report.errors.push(err);
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const err = `HTTP GET ${requestUrl} returned non-JSON content-type: '${contentType}'`;
        secReport.errors.push(err);
        report.errors.push(err);
        continue;
      }

      const storefrontPkgs: CommercialPackage[] = await res.json();
      secReport.actualCount = storefrontPkgs.length;
      secReport.packages = storefrontPkgs;
      report.totalCanonical += storefrontPkgs.length;

      // Check count
      if (storefrontPkgs.length !== secReport.expectedCount) {
        const err = `Section '${section}' count mismatch: expected ${secReport.expectedCount}, got ${storefrontPkgs.length}`;
        secReport.errors.push(err);
        report.errors.push(err);
      }

      // Check sortOrder ascending
      for (let i = 0; i < storefrontPkgs.length; i++) {
        const pkg = storefrontPkgs[i];
        if (i > 0) {
          const prev = storefrontPkgs[i - 1];
          if ((prev.sortOrder ?? 0) > (pkg.sortOrder ?? 0)) {
            const err = `Section '${section}' sortOrder violation: pkg '${prev.id}' (${prev.sortOrder}) > pkg '${pkg.id}' (${pkg.sortOrder})`;
            secReport.errors.push(err);
            report.errors.push(err);
          }
        }

        // Check legacy exclusion
        if (pkg.id.startsWith('pkg-miner-') || (pkg as any).isLegacy) {
          const err = `Legacy package '${pkg.id}' leaked into storefront for section '${section}'`;
          secReport.errors.push(err);
          report.errors.push(err);
          report.legacyCount++;
        }

        // Check status & isPublished
        if (pkg.status !== 'ACTIVE' || !pkg.isPublished) {
          const err = `Package '${pkg.id}' has invalid status/isPublished: status=${pkg.status}, isPublished=${pkg.isPublished}`;
          secReport.errors.push(err);
          report.errors.push(err);
        }

        // Check parity against manifest
        const manifestItem = manifestMap.get(pkg.id);
        if (!manifestItem) {
          const err = `Package '${pkg.id}' returned in storefront is not in manifest`;
          secReport.errors.push(err);
          report.errors.push(err);
        } else {
          if (pkg.name !== manifestItem.name) {
            const err = `Package '${pkg.id}' name mismatch: manifest='${manifestItem.name}', storefront='${pkg.name}'`;
            secReport.errors.push(err);
            report.errors.push(err);
          }
          if (pkg.powerTh !== manifestItem.powerTh) {
            const err = `Package '${pkg.id}' powerTh mismatch: manifest=${manifestItem.powerTh}, storefront=${pkg.powerTh}`;
            secReport.errors.push(err);
            report.errors.push(err);
          }
          if (pkg.priceUsdt !== manifestItem.priceUsdt) {
            const err = `Package '${pkg.id}' priceUsdt mismatch: manifest=${manifestItem.priceUsdt}, storefront=${pkg.priceUsdt}`;
            secReport.errors.push(err);
            report.errors.push(err);
          }
        }
      }

      secReport.pass = secReport.errors.length === 0 && secReport.actualCount === secReport.expectedCount;
    }
  } finally {
    if (server) {
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    setCatalogService(previousCatalogService);
  }

  report.pass = report.errors.length === 0 && report.totalCanonical === 29 && report.legacyCount === 0;
  return report;
}

/**
 * CLI Main entry point.
 */
async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = args.includes('--dry-run') || !isApply;
  const isVerifyOnly = args.includes('--verify-only');
  const credsArg = args.find(a => a.startsWith('--credentials='))?.split('=')[1];

  console.log('='.repeat(72));
  console.log('  SCRUM-224 / POUW-1.9 — REMOTE CANONICAL SEED RUNNER');
  console.log(`  Mode: ${isVerifyOnly ? 'VERIFY ONLY' : isApply ? 'APPLY (AUTHORIZED REMOTE WRITE)' : 'DRY-RUN (SIMULATION)'}`);
  console.log('='.repeat(72));

  if (!isVerifyOnly) {
    const summary = await runRemoteSeed({
      dryRun: isDryRun,
      credentialsPath: credsArg,
      logger: (msg) => console.log(`  ${msg}`),
    });

    console.log('\n' + '-'.repeat(72));
    console.log('  SEED SUMMARY RESULTS');
    console.log('-'.repeat(72));
    console.log(`  Total Manifest Packages: ${summary.total}`);
    console.log(`  Created (Missing):       ${summary.created}`);
    console.log(`  Skipped (Existing):      ${summary.skipped}`);
    console.log(`  Blocked / Errors:        ${summary.blocked}`);
    console.log(`  Legacy Preserved:        ${summary.legacyPreserved}`);

    console.log('\n  Section Breakdown:');
    for (const [sec, counts] of Object.entries(summary.bySection)) {
      console.log(`    - ${sec.padEnd(12)}: Total=${counts.total}, Created=${counts.created}, Skipped=${counts.skipped}`);
    }

    if (summary.details.skippedItems.length > 0) {
      console.log(`\n  Skipped Documents (${summary.details.skippedItems.length}):`);
      for (const item of summary.details.skippedItems) {
        console.log(`    = ${item.id}: ${item.reason}`);
      }
    }

    if (summary.details.createdItems.length > 0) {
      console.log(`\n  ${isApply ? 'Materialized Documents' : 'Planned Documents to Materialize'} (${summary.details.createdItems.length}):`);
      for (const item of summary.details.createdItems) {
        console.log(`    + [${item.section.padEnd(11)}] ${item.id.padEnd(16)} | ${item.name.padEnd(20)} | ${item.powerTh} TH | $${item.priceUsdt}`);
      }
    }

    if (summary.details.blockedItems.length > 0) {
      console.log(`\n  Blocked Documents (${summary.details.blockedItems.length}):`);
      for (const item of summary.details.blockedItems) {
        console.log(`    ! ${item.id}: ${item.reason}`);
      }
    }

    if (isDryRun && !isApply) {
      console.log('\n' + '='.repeat(72));
      console.log('  DRY-RUN VERIFICATION COMPLETED. ZERO REMOTE WRITES PERFORMED.');
      console.log('  To apply canonical packages to remote Firestore (authorized for SCRUM-224):');
      console.log('    node --import tsx scripts/remoteSeedPackages.ts --apply');
      console.log('='.repeat(72));
      return summary;
    }
  }

  // After apply (or verify-only): run storefront verification
  console.log('\n' + '-'.repeat(72));
  console.log('  RUNNING REAL HTTP STOREFRONT VERIFICATION (GET /api/catalog/storefront)');
  console.log('-'.repeat(72));

  const verifyReport = await verifyStorefrontCatalog({
    credentialsPath: credsArg,
  });
  console.log(`  Verification Result: ${verifyReport.pass ? 'PASS (100% CANONICAL STOREFRONT PARITY VIA REAL HTTP GET)' : 'FAIL'}`);
  console.log(`  Total Canonical in Storefront: ${verifyReport.totalCanonical} / 29`);
  console.log(`  Legacy in Storefront:          ${verifyReport.legacyCount} (Expected: 0)`);

  for (const [sec, sRep] of Object.entries(verifyReport.sections)) {
    console.log(`    - ${sec.padEnd(12)}: HTTP 200 OK — ${sRep.actualCount}/${sRep.expectedCount} packages [${sRep.pass ? 'PASS' : 'FAIL'}]`);
    if (sRep.errors.length > 0) {
      for (const err of sRep.errors) {
        console.log(`        Error: ${err}`);
      }
    }
  }

  if (!verifyReport.pass) {
    console.error('\nStorefront verification encountered errors!');
    process.exitCode = 1;
  }

  return verifyReport;
}

// Self-executable check
if (process.argv[1] && /remoteSeedPackages(\.[cm]?[jt]s)?$/i.test(process.argv[1])) {
  main().catch((err) => {
    console.error('Fatal execution error:', err?.message || err);
    process.exit(1);
  });
}
