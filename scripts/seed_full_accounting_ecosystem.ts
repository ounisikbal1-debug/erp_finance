import { randomUUID } from 'node:crypto';
import prisma from '../src/data/prisma/client';

async function main() {
  console.log('=== DÉMARRAGE DU PEUPLEMENT INTÉGRAL DU SYSTÈME COMPTABLE & OPÉRATIONNEL SAFE ===');

  const entities = await prisma.entity.findMany({ include: { country: true } });
  console.log(`Entités trouvées : ${entities.length}`);
  const tn01 = entities.find(e => e.code === 'TN01') || entities[0];
  const safeTn = entities.find(e => e.code === 'SAFE-TN-001') || entities[1];
  const targetEntities = [tn01, safeTn].filter(Boolean);

  const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });
  const adminId = adminUser?.id || randomUUID();

  // Plan Comptable Tunisien SCE exhaustif
  const ACCOUNTS_SCE = [
    // Classe 1
    { code: '101000', description: 'Capital social émis', classNumber: 1, type: 'EQUITY', financialCategory: 'EQUITY' },
    { code: '111000', description: 'Réserve légale obligatoire (10%)', classNumber: 1, type: 'EQUITY', financialCategory: 'EQUITY' },
    { code: '118000', description: 'Autres réserves statutaires et libres', classNumber: 1, type: 'EQUITY', financialCategory: 'EQUITY' },
    { code: '120000', description: 'Report à nouveau créditeur', classNumber: 1, type: 'EQUITY', financialCategory: 'EQUITY' },
    { code: '131000', description: 'Résultat net de l’exercice (bénéfice)', classNumber: 1, type: 'EQUITY', financialCategory: 'EQUITY' },
    { code: '161000', description: 'Emprunts bancaires à long terme (STB/BIAT)', classNumber: 1, type: 'LIABILITY', financialCategory: 'FINANCIAL_DEBT' },

    // Classe 2
    { code: '211000', description: 'Terrains industriels & aménagements', classNumber: 2, type: 'ASSET', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '213000', description: 'Bâtiments industriels & administratifs', classNumber: 2, type: 'ASSET', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '215000', description: 'Installations techniques, matériel et outillage', classNumber: 2, type: 'ASSET', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '218200', description: 'Matériel de transport (flotte utilitaire)', classNumber: 2, type: 'ASSET', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '218300', description: 'Matériel informatique et systèmes réseaux', classNumber: 2, type: 'ASSET', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '218400', description: 'Mobilier et matériel de bureau', classNumber: 2, type: 'ASSET', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '281300', description: 'Amortissement des constructions (5% linéaire)', classNumber: 2, type: 'LIABILITY', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '281500', description: 'Amortissement du matériel & outillage (15%)', classNumber: 2, type: 'LIABILITY', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '281820', description: 'Amortissement du matériel de transport (20%)', classNumber: 2, type: 'LIABILITY', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '281830', description: 'Amortissement matériel informatique (33.33%)', classNumber: 2, type: 'LIABILITY', financialCategory: 'TANGIBLE_FIXED_ASSET' },

    // Classe 3
    { code: '311000', description: 'Matières premières (Polypropylène & Polymères)', classNumber: 3, type: 'ASSET', financialCategory: 'RAW_MATERIAL_STOCK' },
    { code: '321000', description: 'Matières consommables & fournitures emballages', classNumber: 3, type: 'ASSET', financialCategory: 'CONSUMABLE_STOCK' },
    { code: '331000', description: 'Produits en cours de fabrication (WIP)', classNumber: 3, type: 'ASSET', financialCategory: 'INVENTORY' },
    { code: '355000', description: 'Produits finis (Boîtiers injectés Safe-B19)', classNumber: 3, type: 'ASSET', financialCategory: 'FINISHED_GOODS_STOCK' },
    { code: '370000', description: 'Marchandises en stock', classNumber: 3, type: 'ASSET', financialCategory: 'GOODS_STOCK' },
    { code: '391000', description: 'Dépréciations des stocks de matières', classNumber: 3, type: 'LIABILITY', financialCategory: 'INVENTORY' },

    // Classe 4
    { code: '401100', description: 'Fournisseurs d’exploitation (PolyChem, PlastikTN)', classNumber: 4, type: 'LIABILITY', financialCategory: 'TRADE_PAYABLE' },
    { code: '404100', description: 'Fournisseurs d’immobilisations (MachineTech)', classNumber: 4, type: 'LIABILITY', financialCategory: 'TRADE_PAYABLE' },
    { code: '409100', description: 'Fournisseurs - Avances et acomptes versés', classNumber: 4, type: 'ASSET', financialCategory: 'OTHER_RECEIVABLE' },
    { code: '411100', description: 'Clients factures à recouvrer (AutoParts, ElectroTN)', classNumber: 4, type: 'ASSET', financialCategory: 'TRADE_RECEIVABLE' },
    { code: '419100', description: 'Clients - Avances et acomptes reçus', classNumber: 4, type: 'LIABILITY', financialCategory: 'OTHER_PAYABLE' },
    { code: '421000', description: 'Personnel - Rémunérations dues (Salaires nets)', classNumber: 4, type: 'LIABILITY', financialCategory: 'PAYROLL_LIABILITY' },
    { code: '425000', description: 'Personnel - Avances et acomptes accordés', classNumber: 4, type: 'ASSET', financialCategory: 'OTHER_RECEIVABLE' },
    { code: '431000', description: 'Sécurité Sociale - CNSS à payer (9.68% + 16.57%)', classNumber: 4, type: 'LIABILITY', financialCategory: 'SOCIAL_LIABILITY' },
    { code: '432000', description: 'Organismes sociaux - Mutuelle & Retraite', classNumber: 4, type: 'LIABILITY', financialCategory: 'SOCIAL_LIABILITY' },
    { code: '436500', description: 'État - Retenues à la source (RS 1.5% et RS IRPP)', classNumber: 4, type: 'LIABILITY', financialCategory: 'TAX_LIABILITY' },
    { code: '436660', description: 'État - TVA Déductible sur Achats et Biens 19%', classNumber: 4, type: 'ASSET', financialCategory: 'TAX_RECEIVABLE' },
    { code: '436710', description: 'État - TVA Collectée sur Ventes 19%', classNumber: 4, type: 'LIABILITY', financialCategory: 'TAX_LIABILITY' },
    { code: '437000', description: 'Autres impôts et taxes (FOPROLOS 1%, TFP 1%, CSS 0.5%)', classNumber: 4, type: 'LIABILITY', financialCategory: 'TAX_LIABILITY' },
    { code: '441000', description: 'État - Impôt sur les Sociétés dû (IS 20%)', classNumber: 4, type: 'LIABILITY', financialCategory: 'TAX_LIABILITY' },

    // Classe 5
    { code: '532100', description: 'STB Banque - Compte Principal en Dinars', classNumber: 5, type: 'ASSET', financialCategory: 'BANK_ACCOUNT' },
    { code: '532200', description: 'BIAT Banque - Compte Commercial Dinars', classNumber: 5, type: 'ASSET', financialCategory: 'BANK_ACCOUNT' },
    { code: '532300', description: 'BNA Banque - Compte Exploitation Dinars', classNumber: 5, type: 'ASSET', financialCategory: 'BANK_ACCOUNT' },
    { code: '532400', description: 'Banque STB - Compte Devises Étrangères (EUR/USD)', classNumber: 5, type: 'ASSET', financialCategory: 'BANK_ACCOUNT' },
    { code: '540000', description: 'Caisse Centrale Espèces', classNumber: 5, type: 'ASSET', financialCategory: 'CASH_ACCOUNT' },
    { code: '541000', description: 'Chèques & Effets à l’encaissement', classNumber: 5, type: 'ASSET', financialCategory: 'BANK_ACCOUNT' },
    { code: '581000', description: 'Virements internes (compte de liaison)', classNumber: 5, type: 'ASSET', financialCategory: 'CASH_ACCOUNT' },

    // Classe 6
    { code: '601000', description: 'Achats consommés de matières premières', classNumber: 6, type: 'EXPENSE', financialCategory: 'RAW_MATERIAL_PURCHASE' },
    { code: '602000', description: 'Achats de matières et fournitures consommables', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '603100', description: 'Variation des stocks de matières premières', classNumber: 6, type: 'EXPENSE', financialCategory: 'STOCK_VARIATION' },
    { code: '606100', description: 'Énergie, Électricité et Gaz (STEG)', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '607000', description: 'Achats de marchandises revendues', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '613000', description: 'Locations de dépôts & charges locatives', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '615000', description: 'Entretien, réparations & maintenance préventive', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '616000', description: 'Primes d’assurances multirisques industrielles', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '622000', description: 'Rémunérations d’intermédiaires, honoraires comptables & juridiques', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '624000', description: 'Transports de biens, fret & livraisons', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '626000', description: 'Frais postaux et télécommunications (Tunisie Télécom)', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '627000', description: 'Services bancaires et frais d’agios', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '640000', description: 'Rémunérations du personnel & Salaires bruts', classNumber: 6, type: 'EXPENSE', financialCategory: 'SALARY_EXPENSE' },
    { code: '645000', description: 'Charges sociales patronales CNSS (16.57%)', classNumber: 6, type: 'EXPENSE', financialCategory: 'SOCIAL_EXPENSE' },
    { code: '647000', description: 'Taxes patronales assises sur salaires (FOPROLOS/CSS)', classNumber: 6, type: 'EXPENSE', financialCategory: 'SOCIAL_EXPENSE' },
    { code: '651000', description: 'Droits d’enregistrement et timbre fiscal (1.000 DT)', classNumber: 6, type: 'EXPENSE', financialCategory: 'TAX_EXPENSE' },
    { code: '656000', description: 'Pertes de change sur devises', classNumber: 6, type: 'EXPENSE', financialCategory: 'FINANCIAL_EXPENSE' },
    { code: '661000', description: 'Charges d’intérêts bancaires sur découverts et emprunts', classNumber: 6, type: 'EXPENSE', financialCategory: 'FINANCIAL_EXPENSE' },
    { code: '681000', description: 'Dotations aux amortissements des immobilisations', classNumber: 6, type: 'EXPENSE', financialCategory: 'DEPRECIATION_EXPENSE' },

    // Classe 7
    { code: '701000', description: 'Ventes de produits finis pièces techniques (HT 19%)', classNumber: 7, type: 'REVENUE', financialCategory: 'OPERATING_REVENUE' },
    { code: '706000', description: 'Prestations de services et études techniques d’ingénierie', classNumber: 7, type: 'REVENUE', financialCategory: 'OPERATING_REVENUE' },
    { code: '707000', description: 'Ventes de marchandises commerciales', classNumber: 7, type: 'REVENUE', financialCategory: 'OPERATING_REVENUE' },
    { code: '708000', description: 'Produits des activités annexes et récupérations de frais', classNumber: 7, type: 'REVENUE', financialCategory: 'OPERATING_REVENUE' },
    { code: '751000', description: 'Produits financiers & intérêts reçus', classNumber: 7, type: 'REVENUE', financialCategory: 'FINANCIAL_REVENUE' },
    { code: '756000', description: 'Gains de change sur règlements en devises', classNumber: 7, type: 'REVENUE', financialCategory: 'FINANCIAL_REVENUE' },
    { code: '781000', description: 'Reprises sur amortissements et provisions d’exploitation', classNumber: 7, type: 'REVENUE', financialCategory: 'OPERATING_REVENUE' },
  ];

  for (const ent of targetEntities) {
    console.log(`\n================================================================`);
    console.log(`Traitement complet de la société : ${ent.name} (${ent.code})`);
    console.log(`================================================================`);

    const countryId = ent.countryId;

    // 1. ChartOfAccounts
    for (const acc of ACCOUNTS_SCE) {
      const existing = await prisma.chartOfAccount.findUnique({
        where: { countryId_code: { countryId, code: acc.code } },
      });
      if (existing) {
        await prisma.chartOfAccount.update({
          where: { id: existing.id },
          data: {
            description: acc.description,
            classNumber: acc.classNumber,
            type: acc.type,
            financialCategory: acc.financialCategory,
            isPostingAllowed: true,
          },
        });
      } else {
        await prisma.chartOfAccount.create({
          data: {
            id: randomUUID(),
            countryId,
            code: acc.code,
            description: acc.description,
            classNumber: acc.classNumber,
            type: acc.type,
            financialCategory: acc.financialCategory,
            isPostingAllowed: true,
          },
        });
      }
    }
    console.log(`Plan comptable synchronisé : ${ACCOUNTS_SCE.length} comptes actifs.`);

    // 2. Dépôts (Warehouses)
    const wh1Id = `WH-${ent.code}-01`;
    const wh1 = await prisma.warehouse.upsert({
      where: { id: wh1Id },
      update: { name: 'Dépôt Principal Ben Arous - Z.I.', code: `BA-${ent.code}` },
      create: {
        id: wh1Id,
        entityId: ent.id,
        code: `BA-${ent.code}`,
        name: 'Dépôt Principal Ben Arous - Z.I.',
      },
    });

    const wh2Id = `WH-${ent.code}-02`;
    const wh2 = await prisma.warehouse.upsert({
      where: { id: wh2Id },
      update: { name: 'Magasin Central Matières Premières Megrine', code: `MP-${ent.code}` },
      create: {
        id: wh2Id,
        entityId: ent.id,
        code: `MP-${ent.code}`,
        name: 'Magasin Central Matières Premières Megrine',
      },
    });
    console.log(`Dépôts créés / vérifiés : ${wh1.name}, ${wh2.name}`);

    // 3. Articles (Materials)
    const matPfId = `MAT-${ent.code}-PF01`;
    const matPf = await prisma.material.upsert({
      where: { sku: `PF-AUTO-${ent.code}` },
      update: { name: 'Boîtier Électronique Automobile Safe-B19', quantity: 1250, unitPrice: 120.000, costPrice: 82.200 },
      create: {
        id: matPfId,
        entityId: ent.id,
        sku: `PF-AUTO-${ent.code}`,
        name: 'Boîtier Électronique Automobile Safe-B19',
        unitCode: 'EA',
        quantity: 1250,
        reservedQuantity: 150,
        minimumStock: 100,
        unitPrice: 120.000,
        costPrice: 82.200,
      },
    });

    const matMpId = `MAT-${ent.code}-MP01`;
    const matMp = await prisma.material.upsert({
      where: { sku: `MP-POLY-${ent.code}` },
      update: { name: 'Polypropylène Granulés Vierge Grade A (PP-01)', quantity: 8500, unitPrice: 18.500, costPrice: 14.250 },
      create: {
        id: matMpId,
        entityId: ent.id,
        sku: `MP-POLY-${ent.code}`,
        name: 'Polypropylène Granulés Vierge Grade A (PP-01)',
        unitCode: 'KG',
        quantity: 8500,
        reservedQuantity: 1200,
        minimumStock: 500,
        unitPrice: 18.500,
        costPrice: 14.250,
      },
    });

    const matMcId = `MAT-${ent.code}-MC01`;
    const matMc = await prisma.material.upsert({
      where: { sku: `MC-CART-${ent.code}` },
      update: { name: 'Carton d’emballage renforcé 40x30x25cm', quantity: 3200, unitPrice: 3.500, costPrice: 2.300 },
      create: {
        id: matMcId,
        entityId: ent.id,
        sku: `MC-CART-${ent.code}`,
        name: 'Carton d’emballage renforcé 40x30x25cm',
        unitCode: 'EA',
        quantity: 3200,
        reservedQuantity: 200,
        minimumStock: 250,
        unitPrice: 3.500,
        costPrice: 2.300,
      },
    });
    console.log(`Articles créés / vérifiés : PF (${matPf.sku}), MP (${matMp.sku}), MC (${matMc.sku})`);

    // 4. Stocks par dépôt
    const stockEntries = [
      { matId: matPf.id, whId: wh1.id, qty: 1250 },
      { matId: matMp.id, whId: wh2.id, qty: 8500 },
      { matId: matMc.id, whId: wh1.id, qty: 3200 },
    ];
    for (const se of stockEntries) {
      const existingStock = await prisma.materialWarehouseStock.findFirst({
        where: { materialId: se.matId, warehouseId: se.whId, entityId: ent.id },
      });
      if (existingStock) {
        await prisma.materialWarehouseStock.update({
          where: { id: existingStock.id },
          data: { quantity: se.qty },
        });
      } else {
        await prisma.materialWarehouseStock.create({
          data: {
            id: randomUUID(),
            entityId: ent.id,
            materialId: se.matId,
            warehouseId: se.whId,
            quantity: se.qty,
            reservedQuantity: 0,
          },
        });
      }
    }

    // 5. Comptes bancaires
    const bankConfigs = [
      { name: 'Société Tunisienne de Banque (STB)', currencyCode: 'TND', ledgerAccountCode: '532100' },
      { name: 'Banque Internationale Arabe de Tunisie (BIAT)', currencyCode: 'TND', ledgerAccountCode: '532200' },
      { name: 'Banque Nationale Agricole (BNA)', currencyCode: 'TND', ledgerAccountCode: '532300' },
      { name: 'STB Compte Devises EUR', currencyCode: 'EUR', ledgerAccountCode: '532400' },
    ];
    for (const bc of bankConfigs) {
      await prisma.bankAccount.upsert({
        where: { entityId_name: { entityId: ent.id, name: bc.name } },
        update: { ledgerAccountCode: bc.ledgerAccountCode, currencyCode: bc.currencyCode },
        create: {
          id: randomUUID(),
          entityId: ent.id,
          name: bc.name,
          currencyCode: bc.currencyCode,
          ledgerAccountCode: bc.ledgerAccountCode,
          isActive: true,
        },
      });

      await prisma.cashAccountMapping.upsert({
        where: { entityId_accountCode: { entityId: ent.id, accountCode: bc.ledgerAccountCode } },
        update: {},
        create: {
          id: randomUUID(),
          entityId: ent.id,
          accountCode: bc.ledgerAccountCode,
        },
      });
    }

    await prisma.cashAccountMapping.upsert({
      where: { entityId_accountCode: { entityId: ent.id, accountCode: '540000' } },
      update: {},
      create: {
        id: randomUUID(),
        entityId: ent.id,
        accountCode: '540000',
      },
    });

    await prisma.cashflowAccountingMapping.upsert({
      where: { entityId: ent.id },
      update: {
        receivableAccountCode: '411100',
        payableAccountCode: '401100',
      },
      create: {
        id: randomUUID(),
        entityId: ent.id,
        receivableAccountCode: '411100',
        payableAccountCode: '401100',
      },
    });

    // 6. Lignes de Budget (BudgetLine)
    const budgetTemplates = [
      { account: '601000', amount: 485000 },
      { account: '602000', amount: 35000 },
      { account: '606100', amount: 23000 },
      { account: '613000', amount: 15000 },
      { account: '615000', amount: 12500 },
      { account: '622000', amount: 10000 },
      { account: '624000', amount: 20000 },
      { account: '626000', amount: 5500 },
      { account: '640000', amount: 265000 },
      { account: '645000', amount: 44000 },
      { account: '681000', amount: 37500 },
      { account: '701000', amount: 1200000 },
      { account: '706000', amount: 150000 },
    ];
    for (const bt of budgetTemplates) {
      for (const p of ['2026-09', '2026-10', '2026-11', '2026-12']) {
        const lineId = `BUD-${ent.code}-${bt.account}-${p}`;
        await prisma.budgetLine.upsert({
          where: { id: lineId },
          update: { amount: bt.amount, status: 'APPROVED' },
          create: {
            id: lineId,
            entityId: ent.id,
            accountCode: bt.account,
            period: p,
            amount: bt.amount,
            status: 'APPROVED',
            createdByUserId: adminId,
            approvedByUserId: adminId,
          },
        });
      }
    }
    console.log(`Lignes budgétaires 2026 enregistrées.`);

    // 7. MOUVEMENTATION RIGOREUSE ET ÉQUILIBRÉE DE TOUS LES COMPTES COMPTABLES
    const vouchers = [
      // Bilan d'ouverture
      {
        num: `OD-RAN-2026-${ent.code}`,
        date: new Date('2026-01-02T08:00:00.000Z'),
        ref: 'RAN-2026-CONSTATE',
        desc: 'Report à nouveau et soldes d’ouverture bilanciels',
        lines: [
          { code: '211000', d: 1200000, c: 0, desc: 'Terrains industriels' },
          { code: '213000', d: 4500000, c: 0, desc: 'Bâtiments industriels' },
          { code: '215000', d: 3800000, c: 0, desc: 'Matériel industriel & outillage' },
          { code: '218200', d: 350000, c: 0, desc: 'Matériel de transport' },
          { code: '218300', d: 180000, c: 0, desc: 'Matériel informatique' },
          { code: '218400', d: 120000, c: 0, desc: 'Mobilier de bureau' },
          { code: '311000', d: 950000, c: 0, desc: 'Stock matières premières début exercice' },
          { code: '321000', d: 210000, c: 0, desc: 'Stock consommables & emballages' },
          { code: '355000', d: 1450000, c: 0, desc: 'Stock produits finis début exercice' },
          { code: '370000', d: 120000, c: 0, desc: 'Stock marchandises' },
          { code: '411100', d: 2850000, c: 0, desc: 'Créances clients ouvertes début exercice' },
          { code: '532100', d: 3100000, c: 0, desc: 'Solde initial Banque STB Dinars' },
          { code: '532200', d: 1650000, c: 0, desc: 'Solde initial Banque BIAT Dinars' },
          { code: '540000', d: 45000, c: 0, desc: 'Solde initial Caisse centrale' },

          { code: '101000', d: 0, c: 8000000, desc: 'Capital social émis libéré' },
          { code: '111000', d: 0, c: 800000, desc: 'Réserve légale 10% du capital' },
          { code: '118000', d: 0, c: 1200000, desc: 'Autres réserves cumulées' },
          { code: '120000', d: 0, c: 1450000, desc: 'Report à nouveau créditeur' },
          { code: '161000', d: 0, c: 3200000, desc: 'Emprunt bancaire d’investissement' },
          { code: '281300', d: 0, c: 900000, desc: 'Amortissement cumulé constructions' },
          { code: '281500', d: 0, c: 1140000, desc: 'Amortissement cumulé outillage' },
          { code: '281820', d: 0, c: 140000, desc: 'Amortissement cumulé transport' },
          { code: '281830', d: 0, c: 90000, desc: 'Amortissement cumulé informatique' },
          { code: '401100', d: 0, c: 3500000, desc: 'Dettes fournisseurs ouvertes début exercice' },
          { code: '431000', d: 0, c: 105000, desc: 'CNSS 4ème trimestre N-1' },
        ],
      },

      // Achats matières avec TVA 19%
      {
        num: `HA-2026-10-${ent.code}-01`,
        date: new Date('2026-10-14T09:30:00.000Z'),
        ref: 'FAC-FOURN-POLYCHEM-789',
        desc: 'Achat de polymères et consommables d’emballage',
        lines: [
          { code: '601000', d: 74000, c: 0, desc: 'Matières premières polymères HT' },
          { code: '602000', d: 12000, c: 0, desc: 'Cartons d’emballage HT' },
          { code: '436660', d: 16340, c: 0, desc: 'TVA déductible 19% s/ achats' },
          { code: '651000', d: 1, c: 0, desc: 'Timbre fiscal réglementaire 1.000 DT' },
          { code: '401100', d: 0, c: 102341, desc: 'Fournisseur PolyChem Tunisie TTC' },
        ],
      },

      // Achats services & charges exploitation
      {
        num: `HA-2026-10-${ent.code}-02`,
        date: new Date('2026-10-20T11:00:00.000Z'),
        ref: 'FAC-STEG-TT-4412',
        desc: 'Électricité haute tension STEG, maintenance et télécoms',
        lines: [
          { code: '606100', d: 24500, c: 0, desc: 'STEG Électricité HT' },
          { code: '615000', d: 12800, c: 0, desc: 'Maintenance préventive presses' },
          { code: '626000', d: 4200, c: 0, desc: 'Télécoms Tunisie Télécom HT' },
          { code: '436660', d: 7885, c: 0, desc: 'TVA déductible 19% s/ services' },
          { code: '401100', d: 0, c: 49385, desc: 'Fournisseurs de services d’exploitation TTC' },
        ],
      },

      // Ventes de produits finis avec TVA 19%
      {
        num: `VT-2026-10-${ent.code}-01`,
        date: new Date('2026-10-25T14:15:00.000Z'),
        ref: 'FAC-CLI-AUTOPARTS-108',
        desc: 'Vente 1 200 boîtiers Safe-B19 et prestation d’ingénierie',
        lines: [
          { code: '411100', d: 147561, c: 0, desc: 'Client AutoParts Industrie TTC' },
          { code: '701000', d: 0, c: 104000, desc: 'Ventes boîtiers B19 HT' },
          { code: '706000', d: 0, c: 20000, desc: 'Prestation ingénierie intégration HT' },
          { code: '436710', d: 0, c: 23560, desc: 'TVA collectée 19% s/ ventes' },
          { code: '651000', d: 0, c: 1, desc: 'Timbre fiscal facturé au client' },
        ],
      },

      // Encaissement client par banque STB avec Retenue à la source 1.5%
      {
        num: `BQ-STB-2026-10-${ent.code}-01`,
        date: new Date('2026-10-28T10:00:00.000Z'),
        ref: 'VIR-CLI-AUTOPARTS-88',
        desc: 'Encaissement virement client AutoParts net de RS 1.5%',
        lines: [
          { code: '532100', d: 145347.585, c: 0, desc: 'Banque STB Compte Dinars' },
          { code: '436500', d: 2213.415, c: 0, desc: 'Retenue à la source 1.5% déduite par le client' },
          { code: '411100', d: 0, c: 147561.000, desc: 'Règlement client AutoParts' },
        ],
      },

      // Règlement fournisseur PolyChem par virement BIAT avec RS 1.5%
      {
        num: `BQ-BIAT-2026-10-${ent.code}-01`,
        date: new Date('2026-10-29T15:30:00.000Z'),
        ref: 'VIR-FOURN-POLYCHEM-09',
        desc: 'Règlement virement fournisseur PolyChem avec RS 1.5%',
        lines: [
          { code: '401100', d: 102341.000, c: 0, desc: 'Débit Fournisseur PolyChem' },
          { code: '532200', d: 0, c: 100805.885, desc: 'Crédit Banque BIAT Dinars' },
          { code: '436500', d: 0, c: 1535.115, desc: 'Retenue à la source 1.5% due à l’État' },
        ],
      },

      // Paie mensuelle Octobre 2026
      {
        num: `OD-PAIE-2026-10-${ent.code}`,
        date: new Date('2026-10-31T17:00:00.000Z'),
        ref: 'LIVRE-PAIE-OCT-2026',
        desc: 'Comptabilisation des salaires du personnel et charges sociales',
        lines: [
          { code: '640000', d: 285000.000, c: 0, desc: 'Salaires bruts du personnel' },
          { code: '645000', d: 47224.500, c: 0, desc: 'Charges patronales CNSS 16.57%' },
          { code: '647000', d: 7125.000, c: 0, desc: 'Taxes patronales FOPROLOS & CSS 2.5%' },
          { code: '421000', d: 0, c: 218762.000, desc: 'Salaires nets à payer' },
          { code: '431000', d: 0, c: 74812.500, desc: 'CNSS globale à verser' },
          { code: '436500', d: 0, c: 38650.000, desc: 'Retenue à la source IRPP sur salaires' },
          { code: '437000', d: 0, c: 7125.000, desc: 'FOPROLOS & CSS dus à l’État' },
        ],
      },

      // Virement bancaire des salaires
      {
        num: `BQ-STB-PAIE-2026-10-${ent.code}`,
        date: new Date('2026-10-31T18:00:00.000Z'),
        ref: 'VIREMENT-SALAIRES-MASSE',
        desc: 'Virement groupé des salaires nets d’octobre via STB',
        lines: [
          { code: '421000', d: 218762.000, c: 0, desc: 'Paiement salaires nets' },
          { code: '532100', d: 0, c: 218762.000, desc: 'Débit Banque STB salaires' },
        ],
      },

      // Mouvements Caisse et Transports urgents
      {
        num: `CS-2026-10-${ent.code}-01`,
        date: new Date('2026-10-22T16:00:00.000Z'),
        ref: 'PIECE-CAISSE-142',
        desc: 'Frais de transport urgent et fournitures administratives',
        lines: [
          { code: '624000', d: 1850.000, c: 0, desc: 'Transport express pièces urgentes' },
          { code: '622000', d: 1200.000, c: 0, desc: 'Honoraires et frais d’actes' },
          { code: '540000', d: 0, c: 3050.000, desc: 'Sortie d’espèces de la Caisse centrale' },
        ],
      },

      // Virement interne Banque vers Caisse
      {
        num: `OD-VIR-INT-2026-10-${ent.code}`,
        date: new Date('2026-10-23T11:00:00.000Z'),
        ref: 'CHQ-ALIM-CAISSE-091',
        desc: 'Retrait d’espèces STB pour alimentation de la caisse centrale',
        lines: [
          { code: '581000', d: 5000.000, c: 0, desc: 'Virements internes transit' },
          { code: '532100', d: 0, c: 5000.000, desc: 'Crédit Banque STB retrait' },
        ],
      },
      {
        num: `CS-REC-2026-10-${ent.code}`,
        date: new Date('2026-10-23T11:30:00.000Z'),
        ref: 'ALIM-CAISSE-091',
        desc: 'Entrée en caisse des espèces retirées de STB',
        lines: [
          { code: '540000', d: 5000.000, c: 0, desc: 'Entrée en caisse centrale' },
          { code: '581000', d: 0, c: 5000.000, desc: 'Apurement virement interne' },
        ],
      },

      // Agios et Pertes de change
      {
        num: `BQ-DEV-2026-10-${ent.code}`,
        date: new Date('2026-10-30T17:00:00.000Z'),
        ref: 'EXTRAIT-STB-AGIOS-FX',
        desc: 'Frais bancaires, agios et perte de change',
        lines: [
          { code: '627000', d: 1450.000, c: 0, desc: 'Commissions bancaires' },
          { code: '661000', d: 2300.000, c: 0, desc: 'Intérêts bancaires et agios' },
          { code: '656000', d: 1800.000, c: 0, desc: 'Pertes de change constatées' },
          { code: '532100', d: 0, c: 5550.000, desc: 'Prélèvement bancaire STB' },
        ],
      },

      // Dotation amortissements
      {
        num: `OD-AMORT-2026-10-${ent.code}`,
        date: new Date('2026-10-31T20:00:00.000Z'),
        ref: 'TABLEAU-AMORT-OCT-2026',
        desc: 'Dotations mensuelles aux amortissements des immobilisations',
        lines: [
          { code: '681000', d: 37500.000, c: 0, desc: 'Dotation amortissements' },
          { code: '281300', d: 0, c: 18750.000, desc: 'Amortissement constructions' },
          { code: '281500', d: 0, c: 13750.000, desc: 'Amortissement machines' },
          { code: '281830', d: 0, c: 5000.000, desc: 'Amortissement informatique' },
        ],
      },

      // Variation de stocks
      {
        num: `OD-STOCK-2026-10-${ent.code}`,
        date: new Date('2026-10-31T21:00:00.000Z'),
        ref: 'INVENTAIRE-PHYS-OCT-2026',
        desc: 'Variation des stocks de matières consommées pour la fabrication',
        lines: [
          { code: '603100', d: 14250.000, c: 0, desc: 'Variation des stocks matières' },
          { code: '311000', d: 0, c: 14250.000, desc: 'Déstockage valorisé au PUMP' },
        ],
      },
    ];

    let createdVouchers = 0;
    for (const v of vouchers) {
      const existing = await prisma.journalEntry.findFirst({
        where: { entryNumber: v.num, entityId: ent.id },
      });
      if (!existing) {
        await prisma.journalEntry.create({
          data: {
            id: randomUUID(),
            entryNumber: v.num,
            entityId: ent.id,
            date: v.date,
            reference: v.ref,
            description: v.desc,
            status: 'POSTED',
            createdByUsername: 'admin',
            approvedByUsername: 'finmgr',
            postedByUsername: 'admin',
            approvedAt: v.date,
            postedAt: v.date,
            lines: {
              create: v.lines.map(line => ({
                id: randomUUID(),
                accountCode: line.code,
                debit: line.d,
                credit: line.c,
                description: line.desc,
              })),
            },
          },
        });
        createdVouchers++;
      }
    }
    console.log(`Pièces comptables créées et postées pour ${ent.name} : ${createdVouchers}`);
  }

  console.log('\n=== TERMINÉ AVEC SUCCÈS POUR TOUTES LES SOCIÉTÉS ===');
}

main().catch(console.error).finally(() => {
  (prisma as any).$disconnect();
});
