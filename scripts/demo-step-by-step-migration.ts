/**
 * SAFE ERP - Script de dÃ©monstration pas Ã  pas de migration de donnÃ©es
 * Exemple : Migration d'un extrait de clients exportÃ©s depuis SAP
 */

import {
  detectDelimiter,
  parseDelimitedText,
  detectErpSystem,
  buildFieldMappings,
  simulateMigration,
  executeMigration,
  prisma,
} from '../src/core/services/migration/universal-migration.service';

async function runStepByStepDemo() {
  console.log('===============================================================');
  console.log('   DÃ‰MONSTRATION PAS Ã€ PAS DU MODULE DE MIGRATION SAFE ERP    ');
  console.log('===============================================================\n');

  // -------------------------------------------------------------
  // Ã‰TAPE 1 : DonnÃ©es brutes en provenance d'un ERP tiers (Ex: SAP)
  // -------------------------------------------------------------
  console.log('ðŸ”¹ Ã‰TAPE 1 : RÃ©ception des donnÃ©es brutes (Export CSV / SAP)');
  const rawCsvData = 
`KUNNR;NAME1;ORT01;LAND1;STCEG
CUST-SAP-001;SOCIETE GENERALE TUNISIE;Tunis;TN;1234567/A/M/000
CUST-SAP-002;MEDITERRANEAN TRADING;Sousse;TN;9876543/B/P/000
CUST-SAP-003;MAGHREB DISTRIB;Sfax;TN;1122334/C/M/000`;

  console.log('Extrait du fichier reÃ§u :');
  console.log(rawCsvData);
  console.log('---------------------------------------------------------------\n');

  // -------------------------------------------------------------
  // Ã‰TAPE 2 : DÃ©coupage et dÃ©tection automatique
  // -------------------------------------------------------------
  console.log('ðŸ”¹ Ã‰TAPE 2 : DÃ©tection automatique du format et du systÃ¨me source');
  const delimiter = detectDelimiter(rawCsvData);
  console.log(`- SÃ©parateur dÃ©tectÃ© : "${delimiter}"`);

  const rows = parseDelimitedText(rawCsvData, delimiter);
  const headers = rows[0] || [];
  console.log(`- En-tÃªtes identifiÃ©s : [${headers.join(', ')}]`);

  const detectedErp = detectErpSystem(headers);
  console.log(`- SystÃ¨me ERP source dÃ©tectÃ© : ðŸ‘‰ [${detectedErp}] ðŸ‘ˆ\n`);

  // -------------------------------------------------------------
  // Ã‰TAPE 3 : Construction automatique du Mapping
  // -------------------------------------------------------------
  console.log('ðŸ”¹ Ã‰TAPE 3 : Ã‰tablissement automatique du Mapping (Champs Source -> SAFE)');
  const targetDomain = 'CUSTOMERS';
  const mapping = buildFieldMappings(headers, targetDomain, detectedErp);
  console.log('Correspondances calculÃ©es :');
  console.table(mapping);
  console.log('---------------------------------------------------------------\n');

  // -------------------------------------------------------------
  // Ã‰TAPE 4 : Simulation (Dry-Run / Sans impact en base)
  // -------------------------------------------------------------
  console.log('ðŸ”¹ Ã‰TAPE 4 : Lancement d\'une simulation Ã  blanc (Dry-Run)');
  // Transformer en tableau d'objets
  const dataRows = rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] || '';
    });
    return obj;
  });

  const simulation = simulateMigration(dataRows, targetDomain, mapping, detectedErp);
  console.log(`- Lignes analysÃ©es : ${simulation.totalRows}`);
  console.log(`- Lignes valides   : ${simulation.validRows} âœ…`);
  console.log(`- Erreurs bloquantes: ${simulation.invalidRows} âŒ`);
  if (simulation.warnings.length > 0) {
    console.log('- Avertissements :');
    console.table(simulation.warnings);
  }
  console.log('---------------------------------------------------------------\n');

  // -------------------------------------------------------------
  // Ã‰TAPE 5 : ExÃ©cution rÃ©elle sÃ©curisÃ©e en base
  // -------------------------------------------------------------
  console.log('ðŸ”¹ Ã‰TAPE 5 : Injection rÃ©elle dans la base de donnÃ©es SAFE');
  const entity = await prisma.entity.findFirst({ select: { id: true, name: true } });
  if (!entity) {
    console.error('Aucune entitÃ© trouvÃ©e pour le test.');
    return;
  }
  console.log(`- EntitÃ© cible : ${entity.name} (${entity.id})`);

  const result = await executeMigration(
    entity.id,
    targetDomain,
    dataRows,
    mapping,
    { updateExisting: true, sourceErp: detectedErp },
    'ADMIN_USER_DEMO'
  );

  console.log(`- SuccÃ¨s : ${result.success ? 'OUI âœ…' : 'NON âŒ'}`);
  console.log(`- Enregistrements insÃ©rÃ©s : ${result.insertedCount}`);
  console.log(`- Enregistrements mis Ã  jour : ${result.updatedCount}`);
  console.log(`- DurÃ©e de traitement : ${result.durationMs} ms`);

  // VÃ©rification directe dans la base
  const createdCustomers = await prisma.customer.findMany({
    where: {
      code: { in: ['CUST-SAP-001', 'CUST-SAP-002', 'CUST-SAP-003'] },
    },
    select: { code: true, name: true, city: true, taxNumber: true },
  });

  console.log('\nRÃ©sultat en base de donnÃ©es SAFE :');
  console.table(createdCustomers);
  console.log('===============================================================');
  console.log('   ðŸŽ‰ TEST DE MIGRATION EFFECTUÃ‰ AVEC SUCCÃˆS !                ');
  console.log('===============================================================');
}

runStepByStepDemo()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
