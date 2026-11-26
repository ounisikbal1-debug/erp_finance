import {
  detectDelimiter,
  parseDelimitedText,
  detectErpSystem,
  buildFieldMappings,
  simulateMigration,
  executeMigration,
  prisma,
} from '../src/core/services/migration/universal-migration.service';

async function main() {
  console.log('=== TEST COMPLET ETAPE PAR ETAPE : PLAN COMPTABLE DEPUIS SAP ===');

  // 1. Données brutes SAP
  const rawCsv = `SAKNR;TXT50;BILKT
411100;Clients Ventes Locales;4
401100;Fournisseurs Matières Premières;4
707000;Ventes de Marchandises;7
607000;Achats de Marchandises;6`;

  console.log('\n1. FICHIER BRUT :');
  console.log(rawCsv);

  // 2. Détection
  const delim = detectDelimiter(rawCsv);
  const rows = parseDelimitedText(rawCsv, delim);
  const headers = rows[0];
  const erp = detectErpSystem(headers);
  console.log(`\n2. DETECTION : Délimiteur="${delim}" | ERP="${erp}" | En-têtes=[${headers.join(', ')}]`);

  // 3. Mapping
  const mappings = buildFieldMappings(headers, 'CHART_OF_ACCOUNTS', erp);
  console.log('\n3. MAPPINGS CALCULES :');
  console.table(mappings);

  const mappingDict: Record<string, string> = {};
  for (const m of mappings) {
    if (m.targetField) mappingDict[m.sourceColumn] = m.targetField;
  }

  // 4. Simulation
  const dataRows = rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = r[i] || ''; });
    return o;
  });

  const sim = simulateMigration(dataRows, 'CHART_OF_ACCOUNTS', mappingDict, erp);
  console.log(`\n4. SIMULATION : Total=${sim.totalRows} | Valides=${sim.validRows} | Erreurs=${sim.invalidRows}`);
  if (sim.errors.length > 0) {
    console.log('Erreurs de validation :', sim.errors);
  }

  // 5. Exécution
  const entity = await prisma.entity.findFirst({ select: { id: true, name: true } });
  if (!entity) throw new Error('Entité absente');
  console.log(`\n5. EXECUTION REELLE POUR L'ENTITE : ${entity.name}`);

  const exec = await executeMigration(
    entity.id,
    'CHART_OF_ACCOUNTS',
    dataRows,
    mappingDict,
    { updateExisting: true, sourceErp: erp },
    'GUIDE_USER'
  );

  console.log(`Résultat : Succès=${exec.success} | Insérés=${exec.insertedCount} | Mis à jour=${exec.updatedCount} | Durée=${exec.durationMs}ms`);

  // 6. Vérification en base
  const accounts = await prisma.chartOfAccount.findMany({
    where: {
      code: { in: ['411100', '401100', '707000', '607000'] }
    },
    select: { code: true, description: true, type: true, classNumber: true }
  });
  console.log('\n6. VERIFICATION DIRECTE DANS LA BASE SAFE :');
  console.table(accounts);
}

main().catch(console.error).finally(() => prisma.$disconnect());
