#!/usr/bin/env node
/**
 * SCRUM-211 / POUW-1.4: Script de siembra seguro de paquetes comerciales.
 *
 * REGLAS DE SEGURIDAD ESTRICTAS:
 * 1. --dry-run POR DEFECTO: No escribe en Firestore salvo que se pase --apply explícito.
 * 2. Create-only: Nunca sobrescribe documentos existentes.
 * 3. Idempotente: Múltiples ejecuciones no duplican ni modifican registros.
 * 4. Cero deletes: Nunca borra paquetes existentes ni documentos legacy.
 * 5. Preservación física de legacy: pkg-miner-* y documentos sin section se mantienen intactos.
 * 6. NO ejecución contra producción sin autorización específica posterior del PO.
 */

import { SafeSeedService, type SafeSeedReport } from '../src/services/admin/safeSeedService';
import { TARGET_PACKAGES_MANIFEST } from '../src/data/seedManifest';

function printUsage() {
  console.log(`
Uso: npx tsx scripts/safeSeedPackages.ts [opciones]

Opciones:
  --dry-run       Ejecuta simulación sin realizar escrituras en Firestore (POR DEFECTO).
  --apply         Aplica los cambios creando los paquetes inexistentes en Firestore.
  --help, -h      Muestra este mensaje de ayuda.

Seguridad:
  Por defecto, el script siempre ejecuta en modo --dry-run.
  Para escribir en la base de datos se requiere la bandera explícita --apply.
  Prohibido ejecutar --apply contra producción sin autorización explícita del PO.
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const hasApply = args.includes('--apply');
  const hasDryRun = args.includes('--dry-run');

  // Dry-run by default unless --apply is explicitly specified without --dry-run
  const isApply = hasApply && !hasDryRun;
  const mode = isApply ? 'APPLY' : 'DRY-RUN';

  console.log('='.repeat(70));
  console.log(`  POUW-1.4 / SCRUM-211 — SCRIPT DE SIEMBRA SEGURO DE PAQUETES`);
  console.log(`  Modo: ${mode === 'APPLY' ? '⚠️  APPLY (ESCRITURA REAL)' : '🔍 DRY-RUN (SIMULACIÓN)'}`);
  console.log('='.repeat(70));

  if (isApply) {
    const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
    console.log(`\n[AVISO DE SEGURIDAD] Modo --apply detectado.`);
    console.log(`Entorno Firestore: ${isEmulator ? 'EMULADOR LOCAL' : 'REMOTA / STAGING'}`);
    if (!isEmulator) {
      console.log(`⚠️  ADVERTENCIA: Operando sin FIRESTORE_EMULATOR_HOST.`);
      console.log(`Verifique que el proyecto activo en firebaseConfig NO sea producción.`);
    }
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
    console.log('\nPara aplicar estos cambios en el entorno de staging/emulador, ejecute:');
    console.log('  npx tsx scripts/safeSeedPackages.ts --apply\n');
  }
}

if (process.argv[1]?.endsWith('safeSeedPackages.ts')) {
  main().catch((err) => {
    console.error('Error durante la ejecución del seed:', err);
    process.exit(1);
  });
}

export { main };
