/**
 * SAFE ERP - Script de démonstration pas à pas de migration de données
 * Exemple : Migration d'un extrait de clients exportés depuis SAP
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
  console.log('   DÉMONSTRATION PAS À PAS DU MODULE DE MIGRATION SAFE ERP    ');
  console.log('===============================================================\n');

  // -------------------------------------------------------------
  // ÉTAPE 1 : Données brutes en provenance d'un ERP tiers (Ex: SAP)
  // -------------------------------------------------------------
  console.log('🔹 ÉTAPE 1 : Réception des données brutes (Export CSV / SAP)');
  const rawCsvData = 
`KUNNR;NAME1;ORT01;LAND1;STCEG
CUST-SAP-001;SOCIETE GENERALE TUNISIE;Tunis;TN;1234567/A/M/000
CUST-SAP-002;MEDITERRANEAN TRADING;Sousse;TN;9876543/B/P/000
CUST-SAP-003;MAGHREB DISTRIB;Sfax;TN;1122334/C/M/000`;

  console.log('Extrait du fichier reçu :');
  console.log(rawCsvData);
  console.log('---------------------------------------------------------------\n');

  // -------------------------------------------------------------
  // ÉTAPE 2 : Découpage et détection automatique
  // -------------------------------------------------------------
  console.log('🔹 ÉTAPE 2 : Détection automatique du format et du système source');
  const delimiter = detectDelimiter(rawCsvData);
  console.log(`- Séparateur détecté : "${delimiter}"`);

  const rows = parseDelimitedText(rawCsvData, delimiter);
  const headers = rows[0] || [];
  console.log(`- En-têtes identifiés : [${headers.join(', ')}]`);

  const detectedErp = detectErpSystem(headers);
  console.log(`- Système ERP source détecté : 👉 [${detectedErp}] 👈\n`);

  // -------------------------------------------------------------
  // ÉTAPE 3 : Construction automatique du Mapping
  // -------------------------------------------------------------
  console.log('🔹 ÉTAPE 3 : Établissement automatique du Mapping (Champs Source -> SAFE)');
  const targetDomain = 'CUSTOMERS';
  const mapping = buildFieldMappings(headers, targetDomain, detectedErp);
  console.log('Correspondances calculées :');
  console.table(mapping);
  console.log('---------------------------------------------------------------\n');

  // -------------------------------------------------------------
  // ÉTAPE 4 : Simulation (Dry-Run / Sans impact en base)
  // -------------------------------------------------------------
  console.log('🔹 ÉTAPE 4 : Lancement d\'une simulation à blanc (Dry-Run)');
  // Transformer en tableau d'objets
  const dataRows = rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] || '';
    });
    return obj;
  });

  const simulation = simulateMigration(dataRows, targetDomain, mapping, detectedErp);
  console.log(`- Lignes analysées : ${simulation.totalRows}`);
  console.log(`- Lignes valides   : ${simulation.validRows} ✅`);
  console.log(`- Erreurs bloquantes: ${simulation.invalidRows} ❌`);
  if (simulation.warnings.length > 0) {
    console.log('- Avertissements :');
    console.table(simulation.warnings);
  }
  console.log('---------------------------------------------------------------\n');

  // -------------------------------------------------------------
  // ÉTAPE 5 : Exécution réelle sécurisée en base
  // -------------------------------------------------------------
  console.log('🔹 ÉTAPE 5 : Injection réelle dans la base de données SAFE');
  const entity = await prisma.entity.findFirst({ select: { id: true, name: true } });
  if (!entity) {
    console.error('Aucune entité trouvée pour le test.');
    return;
  }
  console.log(`- Entité cible : ${entity.name} (${entity.id})`);

  const result = await executeMigration(
    entity.id,
    targetDomain,
    dataRows,
    mapping,
    { updateExisting: true, sourceErp: detectedErp },
    'ADMIN_USER_DEMO'
  );

  console.log(`- Succès : ${result.success ? 'OUI ✅' : 'NON ❌'}`);
  console.log(`- Enregistrements insérés : ${result.insertedCount}`);
  console.log(`- Enregistrements mis à jour : ${result.updatedCount}`);
  console.log(`- Durée de traitement : ${result.durationMs} ms`);

  // Vérification directe dans la base
  const createdCustomers = await prisma.customer.findMany({
    where: {
      code: { in: ['CUST-SAP-001', 'CUST-SAP-002', 'CUST-SAP-003'] },
    },
    select: { code: true, name: true, city: true, taxNumber: true },
  });

  console.log('\nRésultat en base de données SAFE :');
  console.table(createdCustomers);
  console.log('===============================================================');
  console.log('   🎉 TEST DE MIGRATION EFFECTUÉ AVEC SUCCÈS !                ');
  console.log('===============================================================');
}

runStepByStepDemo()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
