#!/usr/bin/env node
/**
 * SCRUM-211 / POUW-1.4: Script de siembra seguro de paquetes comerciales.
 *
 * REGLAS DE SEGURIDAD ESTRICTAS (PO REVIEW ITERATION 2):
 * 1. --dry-run POR DEFECTO: No escribe en Firestore salvo que se pase --apply explícito.
 * 2. Create-only: Nunca sobrescribe documentos existentes.
 * 3. Idempotente: Múltiples ejecuciones no duplican ni modifican registros.
 * 4. Cero deletes: Nunca borra paquetes existentes ni documentos legacy.
 * 5. Preservación física de legacy: pkg-miner-* y documentos sin section se mantienen intactos.
 * 6. BLOQUEO DURO DE APPLY REMOTO: --apply está estrictamente permitido ÚNICAMENTE con FIRESTORE_EMULATOR_HOST.
 *    --allow-remote-staging y ALLOW_REMOTE_SEED han sido deshabilitados. Sin emulador, el script falla con código != 0 antes de cualquier write.
 */

import { SafeSeedService, type SafeSeedReport } from '../src/services/admin/safeSeedService';
import { TARGET_PACKAGES_MANIFEST } from '../src/data/seedManifest';

function printUsage() {
  console.log(`
Uso: npx tsx scripts/safeSeedPackages.ts [opciones]

Opciones:
  --dry-run                 Ejecuta simulación sin realizar escrituras en Firestore (POR DEFECTO).
  --apply                   Aplica los cambios creando los paquetes inexistentes en Firestore (REQUIERE FIRESTORE_EMULATOR_HOST).
  --help, -h                Muestra este mensaje de ayuda.

Seguridad (SCRUM-211):
  Por defecto, el script siempre ejecuta en modo --dry-run.
  Para escribir en la base de datos se requiere la bandera explícita --apply Y la variable FIRESTORE_EMULATOR_HOST.
  Las escrituras remotas están estrictamente deshabilitadas (--allow-remote-staging y ALLOW_REMOTE_SEED han sido retirados).
`);
}

async function main(customArgs?: string[]): Promise<SafeSeedReport | null> {
  const args = customArgs || process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return null;
  }

  // Strict security check: reject remote staging flags
  if (args.includes('--allow-remote-staging') || process.env.ALLOW_REMOTE_SEED === 'true') {
    const errorMsg = 'Remote apply is strictly disabled in SCRUM-211. --allow-remote-staging and ALLOW_REMOTE_SEED have been removed.';
    console.error(`\n❌ ERROR DE SEGURIDAD (SCRUM-211):`);
    console.error(`   --allow-remote-staging y ALLOW_REMOTE_SEED han sido deshabilitados por decisión del PO.`);
    console.error(`   En SCRUM-211 las escrituras remotas están estrictamente bloqueadas.`);
    console.error(`   --apply opera ÚNICAMENTE cuando FIRESTORE_EMULATOR_HOST está configurado.\n`);
    process.exitCode = 1;
    throw new Error(errorMsg);
  }

  const hasApply = args.includes('--apply');
  const hasDryRun = args.includes('--dry-run');

  // Dry-run by default unless --apply is explicitly specified without --dry-run
  const isApply = hasApply && !hasDryRun;
  const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  const mode = isApply ? 'APPLY' : 'DRY-RUN';

  console.log('='.repeat(70));
  console.log(`  POUW-1.4 / SCRUM-211 — SCRIPT DE SIEMBRA SEGURO DE PAQUETES`);
  console.log(`  Modo: ${mode === 'APPLY' ? '⚠️  APPLY (ESCRITURA REAL EN EMULADOR)' : '🔍 DRY-RUN (SIMULACIÓN)'}`);
  console.log('='.repeat(70));

  if (isApply) {
    if (!isEmulator) {
      const errorMsg = 'FIRESTORE_EMULATOR_HOST is required for --apply in SCRUM-211. Remote apply is strictly prohibited.';
      console.error(`\n❌ ERROR DE SEGURIDAD OBLIGATORIO (SCRUM-211):`);
      console.error(`   El PO y las reglas de seguridad prohíben estrictamente escrituras remotas en SCRUM-211.`);
      console.error(`   No se detectó la variable de entorno FIRESTORE_EMULATOR_HOST.`);
      console.error(`   --apply SOLO puede funcionar cuando existe FIRESTORE_EMULATOR_HOST.`);
      console.error(`   Abortando ANTES de cualquier intento de escritura.\n`);
      process.exitCode = 1;
      throw new Error(errorMsg);
    }

    console.log(`\n[AVISO DE SEGURIDAD] Modo --apply detectado.`);
    console.log(`Entorno Firestore: EMULADOR LOCAL (${process.env.FIRESTORE_EMULATOR_HOST})`);
  } else {
    console.log(`\n[INFO] Ejecutando simulación segura. Ningún dato será modificado.`);
  }

  const seedService = SafeSeedService.getInstance();
  const report: SafeSeedReport = await seedService.executeSafeSeed({
    apply: isApply,
    targetCatalog: TARGET_PACKAGES_MANIFEST,
    logger: (msg) => console.log(`  ${msg}`),
  });

  console.log('\n' + '-'.repeat(70));
  console.log('  REPORTE DE RESULTADOS');
  console.log('-'.repeat(70));

  console.log(`\nTotal paquetes en catálogo objetivo: ${report.summary.totalCatalogCount}`);
  console.log(`Modo de ejecución: ${report.dryRun ? 'DRY-RUN (Simulado)' : 'APPLIED (Aplicado)'}`);
  console.log(`Documentos a crear / creados:       ${report.summary.createdCount}`);
  console.log(`Documentos omitidos (ya existen):    ${report.summary.skippedCount}`);
  console.log(`Documentos bloqueados:               ${report.summary.blockedCount}`);
  console.log(`Documentos legacy preservados:       ${report.summary.preservedLegacyCount}`);

  if (report.preservedLegacy.length > 0) {
    console.log('\n[LEGACY PRESERVADOS]');
    for (const leg of report.preservedLegacy) {
      console.log(`  - ${leg.id} (${leg.name || 'Sin nombre'}) -> INTACTO / PRESERVADO`);
    }
  }

  if (report.created.length > 0) {
    console.log(`\n[${isApply ? 'CREADOS EN FIRESTORE' : 'A CREAR (DRY-RUN)'}] (${report.created.length}):`);
    for (const item of report.created) {
      console.log(`  + [${item.section.padEnd(11)}] ${item.id.padEnd(16)} | ${item.name.padEnd(24)} | ${item.powerTh} TH | $${item.priceUsdt}`);
    }
  }

  if (report.skipped.length > 0) {
    console.log(`\n[OMITIDOS (NO MODIFICADOS)] (${report.skipped.length}):`);
    for (const item of report.skipped) {
      console.log(`  = ${item.id}: ${item.reason}`);
    }
  }

  if (report.blocked.length > 0) {
    console.log(`\n[BLOQUEADOS / ERROR] (${report.blocked.length}):`);
    for (const item of report.blocked) {
      console.log(`  ! ${item.id}: ${item.reason}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`  ESTADO FINAL: ${report.summary.blockedCount > 0 ? 'CON ADVERTENCIAS' : 'EXITOSO'}`);
  console.log('='.repeat(70));

  if (!isApply) {
    console.log('\nPara aplicar estos cambios en el emulador local, configure FIRESTORE_EMULATOR_HOST y ejecute:');
    console.log('  npx tsx scripts/safeSeedPackages.ts --apply\n');
  }

  return report;
}

if (process.argv[1]?.endsWith('safeSeedPackages.ts')) {
  main()
    .then((report) => {
      const exitCode = report && report.summary.blockedCount > 0 ? 1 : 0;
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error('Error durante la ejecución del seed:', err?.message || err);
      process.exit(1);
    });
}

export { main };
