import { randomUUID } from 'node:crypto';
import prisma from '../src/data/prisma/client';

async function main() {
  console.log('=== DÃ‰MARRAGE DU PEUPLEMENT INTÃ‰GRAL DU SYSTÃˆME COMPTABLE & OPÃ‰RATIONNEL SAFE ===');

  const entities = await prisma.entity.findMany({ include: { country: true } });
  console.log(`EntitÃ©s trouvÃ©es : ${entities.length}`);
  const tn01 = entities.find(e => e.code === 'TN01') || entities[0];
  const safeTn = entities.find(e => e.code === 'SAFE-TN-001') || entities[1];
  const targetEntities = [tn01, safeTn].filter(Boolean);

  const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });
  const adminId = adminUser?.id || randomUUID();

  // Plan Comptable Tunisien SCE exhaustif
  const ACCOUNTS_SCE = [
    // Classe 1
    { code: '101000', description: 'Capital social Ã©mis', classNumber: 1, type: 'EQUITY', financialCategory: 'EQUITY' },
    { code: '111000', description: 'RÃ©serve lÃ©gale obligatoire (10%)', classNumber: 1, type: 'EQUITY', financialCategory: 'EQUITY' },
    { code: '118000', description: 'Autres rÃ©serves statutaires et libres', classNumber: 1, type: 'EQUITY', financialCategory: 'EQUITY' },
    { code: '120000', description: 'Report Ã  nouveau crÃ©diteur', classNumber: 1, type: 'EQUITY', financialCategory: 'EQUITY' },
    { code: '131000', description: 'RÃ©sultat net de lâ€™exercice (bÃ©nÃ©fice)', classNumber: 1, type: 'EQUITY', financialCategory: 'EQUITY' },
    { code: '161000', description: 'Emprunts bancaires Ã  long terme (STB/BIAT)', classNumber: 1, type: 'LIABILITY', financialCategory: 'FINANCIAL_DEBT' },

    // Classe 2
    { code: '211000', description: 'Terrains industriels & amÃ©nagements', classNumber: 2, type: 'ASSET', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '213000', description: 'BÃ¢timents industriels & administratifs', classNumber: 2, type: 'ASSET', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '215000', description: 'Installations techniques, matÃ©riel et outillage', classNumber: 2, type: 'ASSET', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '218200', description: 'MatÃ©riel de transport (flotte utilitaire)', classNumber: 2, type: 'ASSET', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '218300', description: 'MatÃ©riel informatique et systÃ¨mes rÃ©seaux', classNumber: 2, type: 'ASSET', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '218400', description: 'Mobilier et matÃ©riel de bureau', classNumber: 2, type: 'ASSET', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '281300', description: 'Amortissement des constructions (5% linÃ©aire)', classNumber: 2, type: 'LIABILITY', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '281500', description: 'Amortissement du matÃ©riel & outillage (15%)', classNumber: 2, type: 'LIABILITY', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '281820', description: 'Amortissement du matÃ©riel de transport (20%)', classNumber: 2, type: 'LIABILITY', financialCategory: 'TANGIBLE_FIXED_ASSET' },
    { code: '281830', description: 'Amortissement matÃ©riel informatique (33.33%)', classNumber: 2, type: 'LIABILITY', financialCategory: 'TANGIBLE_FIXED_ASSET' },

    // Classe 3
    { code: '311000', description: 'MatiÃ¨res premiÃ¨res (PolypropylÃ¨ne & PolymÃ¨res)', classNumber: 3, type: 'ASSET', financialCategory: 'RAW_MATERIAL_STOCK' },
    { code: '321000', description: 'MatiÃ¨res consommables & fournitures emballages', classNumber: 3, type: 'ASSET', financialCategory: 'CONSUMABLE_STOCK' },
    { code: '331000', description: 'Produits en cours de fabrication (WIP)', classNumber: 3, type: 'ASSET', financialCategory: 'INVENTORY' },
    { code: '355000', description: 'Produits finis (BoÃ®tiers injectÃ©s Safe-B19)', classNumber: 3, type: 'ASSET', financialCategory: 'FINISHED_GOODS_STOCK' },
    { code: '370000', description: 'Marchandises en stock', classNumber: 3, type: 'ASSET', financialCategory: 'GOODS_STOCK' },
    { code: '391000', description: 'DÃ©prÃ©ciations des stocks de matiÃ¨res', classNumber: 3, type: 'LIABILITY', financialCategory: 'INVENTORY' },

    // Classe 4
    { code: '401100', description: 'Fournisseurs dâ€™exploitation (PolyChem, PlastikTN)', classNumber: 4, type: 'LIABILITY', financialCategory: 'TRADE_PAYABLE' },
    { code: '404100', description: 'Fournisseurs dâ€™immobilisations (MachineTech)', classNumber: 4, type: 'LIABILITY', financialCategory: 'TRADE_PAYABLE' },
    { code: '409100', description: 'Fournisseurs - Avances et acomptes versÃ©s', classNumber: 4, type: 'ASSET', financialCategory: 'OTHER_RECEIVABLE' },
    { code: '411100', description: 'Clients factures Ã  recouvrer (AutoParts, ElectroTN)', classNumber: 4, type: 'ASSET', financialCategory: 'TRADE_RECEIVABLE' },
    { code: '419100', description: 'Clients - Avances et acomptes reÃ§us', classNumber: 4, type: 'LIABILITY', financialCategory: 'OTHER_PAYABLE' },
    { code: '421000', description: 'Personnel - RÃ©munÃ©rations dues (Salaires nets)', classNumber: 4, type: 'LIABILITY', financialCategory: 'PAYROLL_LIABILITY' },
    { code: '425000', description: 'Personnel - Avances et acomptes accordÃ©s', classNumber: 4, type: 'ASSET', financialCategory: 'OTHER_RECEIVABLE' },
    { code: '431000', description: 'SÃ©curitÃ© Sociale - CNSS Ã  payer (9.68% + 16.57%)', classNumber: 4, type: 'LIABILITY', financialCategory: 'SOCIAL_LIABILITY' },
    { code: '432000', description: 'Organismes sociaux - Mutuelle & Retraite', classNumber: 4, type: 'LIABILITY', financialCategory: 'SOCIAL_LIABILITY' },
    { code: '436500', description: 'Ã‰tat - Retenues Ã  la source (RS 1.5% et RS IRPP)', classNumber: 4, type: 'LIABILITY', financialCategory: 'TAX_LIABILITY' },
    { code: '436660', description: 'Ã‰tat - TVA DÃ©ductible sur Achats et Biens 19%', classNumber: 4, type: 'ASSET', financialCategory: 'TAX_RECEIVABLE' },
    { code: '436710', description: 'Ã‰tat - TVA CollectÃ©e sur Ventes 19%', classNumber: 4, type: 'LIABILITY', financialCategory: 'TAX_LIABILITY' },
    { code: '437000', description: 'Autres impÃ´ts et taxes (FOPROLOS 1%, TFP 1%, CSS 0.5%)', classNumber: 4, type: 'LIABILITY', financialCategory: 'TAX_LIABILITY' },
    { code: '441000', description: 'Ã‰tat - ImpÃ´t sur les SociÃ©tÃ©s dÃ» (IS 20%)', classNumber: 4, type: 'LIABILITY', financialCategory: 'TAX_LIABILITY' },

    // Classe 5
    { code: '532100', description: 'STB Banque - Compte Principal en Dinars', classNumber: 5, type: 'ASSET', financialCategory: 'BANK_ACCOUNT' },
    { code: '532200', description: 'BIAT Banque - Compte Commercial Dinars', classNumber: 5, type: 'ASSET', financialCategory: 'BANK_ACCOUNT' },
    { code: '532300', description: 'BNA Banque - Compte Exploitation Dinars', classNumber: 5, type: 'ASSET', financialCategory: 'BANK_ACCOUNT' },
    { code: '532400', description: 'Banque STB - Compte Devises Ã‰trangÃ¨res (EUR/USD)', classNumber: 5, type: 'ASSET', financialCategory: 'BANK_ACCOUNT' },
    { code: '540000', description: 'Caisse Centrale EspÃ¨ces', classNumber: 5, type: 'ASSET', financialCategory: 'CASH_ACCOUNT' },
    { code: '541000', description: 'ChÃ¨ques & Effets Ã  lâ€™encaissement', classNumber: 5, type: 'ASSET', financialCategory: 'BANK_ACCOUNT' },
    { code: '581000', description: 'Virements internes (compte de liaison)', classNumber: 5, type: 'ASSET', financialCategory: 'CASH_ACCOUNT' },

    // Classe 6
    { code: '601000', description: 'Achats consommÃ©s de matiÃ¨res premiÃ¨res', classNumber: 6, type: 'EXPENSE', financialCategory: 'RAW_MATERIAL_PURCHASE' },
    { code: '602000', description: 'Achats de matiÃ¨res et fournitures consommables', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '603100', description: 'Variation des stocks de matiÃ¨res premiÃ¨res', classNumber: 6, type: 'EXPENSE', financialCategory: 'STOCK_VARIATION' },
    { code: '606100', description: 'Ã‰nergie, Ã‰lectricitÃ© et Gaz (STEG)', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '607000', description: 'Achats de marchandises revendues', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '613000', description: 'Locations de dÃ©pÃ´ts & charges locatives', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '615000', description: 'Entretien, rÃ©parations & maintenance prÃ©ventive', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '616000', description: 'Primes dâ€™assurances multirisques industrielles', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '622000', description: 'RÃ©munÃ©rations dâ€™intermÃ©diaires, honoraires comptables & juridiques', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '624000', description: 'Transports de biens, fret & livraisons', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '626000', description: 'Frais postaux et tÃ©lÃ©communications (Tunisie TÃ©lÃ©com)', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '627000', description: 'Services bancaires et frais dâ€™agios', classNumber: 6, type: 'EXPENSE', financialCategory: 'OPERATING_EXPENSE' },
    { code: '640000', description: 'RÃ©munÃ©rations du personnel & Salaires bruts', classNumber: 6, type: 'EXPENSE', financialCategory: 'SALARY_EXPENSE' },
    { code: '645000', description: 'Charges sociales patronales CNSS (16.57%)', classNumber: 6, type: 'EXPENSE', financialCategory: 'SOCIAL_EXPENSE' },
    { code: '647000', description: 'Taxes patronales assises sur salaires (FOPROLOS/CSS)', classNumber: 6, type: 'EXPENSE', financialCategory: 'SOCIAL_EXPENSE' },
    { code: '651000', description: 'Droits dâ€™enregistrement et timbre fiscal (1.000 DT)', classNumber: 6, type: 'EXPENSE', financialCategory: 'TAX_EXPENSE' },
    { code: '656000', description: 'Pertes de change sur devises', classNumber: 6, type: 'EXPENSE', financialCategory: 'FINANCIAL_EXPENSE' },
    { code: '661000', description: 'Charges dâ€™intÃ©rÃªts bancaires sur dÃ©couverts et emprunts', classNumber: 6, type: 'EXPENSE', financialCategory: 'FINANCIAL_EXPENSE' },
    { code: '681000', description: 'Dotations aux amortissements des immobilisations', classNumber: 6, type: 'EXPENSE', financialCategory: 'DEPRECIATION_EXPENSE' },

    // Classe 7
    { code: '701000', description: 'Ventes de produits finis piÃ¨ces techniques (HT 19%)', classNumber: 7, type: 'REVENUE', financialCategory: 'OPERATING_REVENUE' },
    { code: '706000', description: 'Prestations de services et Ã©tudes techniques dâ€™ingÃ©nierie', classNumber: 7, type: 'REVENUE', financialCategory: 'OPERATING_REVENUE' },
    { code: '707000', description: 'Ventes de marchandises commerciales', classNumber: 7, type: 'REVENUE', financialCategory: 'OPERATING_REVENUE' },
    { code: '708000', description: 'Produits des activitÃ©s annexes et rÃ©cupÃ©rations de frais', classNumber: 7, type: 'REVENUE', financialCategory: 'OPERATING_REVENUE' },
    { code: '751000', description: 'Produits financiers & intÃ©rÃªts reÃ§us', classNumber: 7, type: 'REVENUE', financialCategory: 'FINANCIAL_REVENUE' },
    { code: '756000', description: 'Gains de change sur rÃ¨glements en devises', classNumber: 7, type: 'REVENUE', financialCategory: 'FINANCIAL_REVENUE' },
    { code: '781000', description: 'Reprises sur amortissements et provisions dâ€™exploitation', classNumber: 7, type: 'REVENUE', financialCategory: 'OPERATING_REVENUE' },
  ];

  for (const ent of targetEntities) {
    console.log(`\n================================================================`);
    console.log(`Traitement complet de la sociÃ©tÃ© : ${ent.name} (${ent.code})`);
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
    console.log(`Plan comptable synchronisÃ© : ${ACCOUNTS_SCE.length} comptes actifs.`);

    // 2. DÃ©pÃ´ts (Warehouses)
    const wh1Id = `WH-${ent.code}-01`;
    const wh1 = await prisma.warehouse.upsert({
      where: { id: wh1Id },
      update: { name: 'DÃ©pÃ´t Principal Ben Arous - Z.I.', code: `BA-${ent.code}` },
      create: {
        id: wh1Id,
        entityId: ent.id,
        code: `BA-${ent.code}`,
        name: 'DÃ©pÃ´t Principal Ben Arous - Z.I.',
      },
    });

    const wh2Id = `WH-${ent.code}-02`;
    const wh2 = await prisma.warehouse.upsert({
      where: { id: wh2Id },
      update: { name: 'Magasin Central MatiÃ¨res PremiÃ¨res Megrine', code: `MP-${ent.code}` },
      create: {
        id: wh2Id,
        entityId: ent.id,
        code: `MP-${ent.code}`,
        name: 'Magasin Central MatiÃ¨res PremiÃ¨res Megrine',
      },
    });
    console.log(`DÃ©pÃ´ts crÃ©Ã©s / vÃ©rifiÃ©s : ${wh1.name}, ${wh2.name}`);

    // 3. Articles (Materials)
    const matPfId = `MAT-${ent.code}-PF01`;
    const matPf = await prisma.material.upsert({
      where: { sku: `PF-AUTO-${ent.code}` },
      update: { name: 'BoÃ®tier Ã‰lectronique Automobile Safe-B19', quantity: 1250, unitPrice: 120.000, costPrice: 82.200 },
      create: {
        id: matPfId,
        entityId: ent.id,
        sku: `PF-AUTO-${ent.code}`,
        name: 'BoÃ®tier Ã‰lectronique Automobile Safe-B19',
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
      update: { name: 'PolypropylÃ¨ne GranulÃ©s Vierge Grade A (PP-01)', quantity: 8500, unitPrice: 18.500, costPrice: 14.250 },
      create: {
        id: matMpId,
        entityId: ent.id,
        sku: `MP-POLY-${ent.code}`,
        name: 'PolypropylÃ¨ne GranulÃ©s Vierge Grade A (PP-01)',
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
      update: { name: 'Carton dâ€™emballage renforcÃ© 40x30x25cm', quantity: 3200, unitPrice: 3.500, costPrice: 2.300 },
      create: {
        id: matMcId,
        entityId: ent.id,
        sku: `MC-CART-${ent.code}`,
        name: 'Carton dâ€™emballage renforcÃ© 40x30x25cm',
        unitCode: 'EA',
        quantity: 3200,
        reservedQuantity: 200,
        minimumStock: 250,
        unitPrice: 3.500,
        costPrice: 2.300,
      },
    });
    console.log(`Articles crÃ©Ã©s / vÃ©rifiÃ©s : PF (${matPf.sku}), MP (${matMp.sku}), MC (${matMc.sku})`);

    // 4. Stocks par dÃ©pÃ´t
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
      { name: 'SociÃ©tÃ© Tunisienne de Banque (STB)', currencyCode: 'TND', ledgerAccountCode: '532100' },
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
    console.log(`Lignes budgÃ©taires 2026 enregistrÃ©es.`);

    // 7. MOUVEMENTATION RIGOREUSE ET Ã‰QUILIBRÃ‰E DE TOUS LES COMPTES COMPTABLES
    const vouchers = [
      // Bilan d'ouverture
      {
        num: `OD-RAN-2026-${ent.code}`,
        date: new Date('2026-01-02T08:00:00.000Z'),
        ref: 'RAN-2026-CONSTATE',
        desc: 'Report Ã  nouveau et soldes dâ€™ouverture bilanciels',
        lines: [
          { code: '211000', d: 1200000, c: 0, desc: 'Terrains industriels' },
          { code: '213000', d: 4500000, c: 0, desc: 'BÃ¢timents industriels' },
          { code: '215000', d: 3800000, c: 0, desc: 'MatÃ©riel industriel & outillage' },
          { code: '218200', d: 350000, c: 0, desc: 'MatÃ©riel de transport' },
          { code: '218300', d: 180000, c: 0, desc: 'MatÃ©riel informatique' },
          { code: '218400', d: 120000, c: 0, desc: 'Mobilier de bureau' },
          { code: '311000', d: 950000, c: 0, desc: 'Stock matiÃ¨res premiÃ¨res dÃ©but exercice' },
          { code: '321000', d: 210000, c: 0, desc: 'Stock consommables & emballages' },
          { code: '355000', d: 1450000, c: 0, desc: 'Stock produits finis dÃ©but exercice' },
          { code: '370000', d: 120000, c: 0, desc: 'Stock marchandises' },
          { code: '411100', d: 2850000, c: 0, desc: 'CrÃ©ances clients ouvertes dÃ©but exercice' },
          { code: '532100', d: 3100000, c: 0, desc: 'Solde initial Banque STB Dinars' },
          { code: '532200', d: 1650000, c: 0, desc: 'Solde initial Banque BIAT Dinars' },
          { code: '540000', d: 45000, c: 0, desc: 'Solde initial Caisse centrale' },

          { code: '101000', d: 0, c: 8000000, desc: 'Capital social Ã©mis libÃ©rÃ©' },
          { code: '111000', d: 0, c: 800000, desc: 'RÃ©serve lÃ©gale 10% du capital' },
          { code: '118000', d: 0, c: 1200000, desc: 'Autres rÃ©serves cumulÃ©es' },
          { code: '120000', d: 0, c: 1450000, desc: 'Report Ã  nouveau crÃ©diteur' },
          { code: '161000', d: 0, c: 3200000, desc: 'Emprunt bancaire dâ€™investissement' },
          { code: '281300', d: 0, c: 900000, desc: 'Amortissement cumulÃ© constructions' },
          { code: '281500', d: 0, c: 1140000, desc: 'Amortissement cumulÃ© outillage' },
          { code: '281820', d: 0, c: 140000, desc: 'Amortissement cumulÃ© transport' },
          { code: '281830', d: 0, c: 90000, desc: 'Amortissement cumulÃ© informatique' },
          { code: '401100', d: 0, c: 3500000, desc: 'Dettes fournisseurs ouvertes dÃ©but exercice' },
          { code: '431000', d: 0, c: 105000, desc: 'CNSS 4Ã¨me trimestre N-1' },
        ],
      },

      // Achats matiÃ¨res avec TVA 19%
      {
        num: `HA-2026-10-${ent.code}-01`,
        date: new Date('2026-10-14T09:30:00.000Z'),
        ref: 'FAC-FOURN-POLYCHEM-789',
        desc: 'Achat de polymÃ¨res et consommables dâ€™emballage',
        lines: [
          { code: '601000', d: 74000, c: 0, desc: 'MatiÃ¨res premiÃ¨res polymÃ¨res HT' },
          { code: '602000', d: 12000, c: 0, desc: 'Cartons dâ€™emballage HT' },
          { code: '436660', d: 16340, c: 0, desc: 'TVA dÃ©ductible 19% s/ achats' },
          { code: '651000', d: 1, c: 0, desc: 'Timbre fiscal rÃ©glementaire 1.000 DT' },
          { code: '401100', d: 0, c: 102341, desc: 'Fournisseur PolyChem Tunisie TTC' },
        ],
      },

      // Achats services & charges exploitation
      {
        num: `HA-2026-10-${ent.code}-02`,
        date: new Date('2026-10-20T11:00:00.000Z'),
        ref: 'FAC-STEG-TT-4412',
        desc: 'Ã‰lectricitÃ© haute tension STEG, maintenance et tÃ©lÃ©coms',
        lines: [
          { code: '606100', d: 24500, c: 0, desc: 'STEG Ã‰lectricitÃ© HT' },
          { code: '615000', d: 12800, c: 0, desc: 'Maintenance prÃ©ventive presses' },
          { code: '626000', d: 4200, c: 0, desc: 'TÃ©lÃ©coms Tunisie TÃ©lÃ©com HT' },
          { code: '436660', d: 7885, c: 0, desc: 'TVA dÃ©ductible 19% s/ services' },
          { code: '401100', d: 0, c: 49385, desc: 'Fournisseurs de services dâ€™exploitation TTC' },
        ],
      },

      // Ventes de produits finis avec TVA 19%
      {
        num: `VT-2026-10-${ent.code}-01`,
        date: new Date('2026-10-25T14:15:00.000Z'),
        ref: 'FAC-CLI-AUTOPARTS-108',
        desc: 'Vente 1 200 boÃ®tiers Safe-B19 et prestation dâ€™ingÃ©nierie',
        lines: [
          { code: '411100', d: 147561, c: 0, desc: 'Client AutoParts Industrie TTC' },
          { code: '701000', d: 0, c: 104000, desc: 'Ventes boÃ®tiers B19 HT' },
          { code: '706000', d: 0, c: 20000, desc: 'Prestation ingÃ©nierie intÃ©gration HT' },
          { code: '436710', d: 0, c: 23560, desc: 'TVA collectÃ©e 19% s/ ventes' },
          { code: '651000', d: 0, c: 1, desc: 'Timbre fiscal facturÃ© au client' },
        ],
      },

      // Encaissement client par banque STB avec Retenue Ã  la source 1.5%
      {
        num: `BQ-STB-2026-10-${ent.code}-01`,
        date: new Date('2026-10-28T10:00:00.000Z'),
        ref: 'VIR-CLI-AUTOPARTS-88',
        desc: 'Encaissement virement client AutoParts net de RS 1.5%',
        lines: [
          { code: '532100', d: 145347.585, c: 0, desc: 'Banque STB Compte Dinars' },
          { code: '436500', d: 2213.415, c: 0, desc: 'Retenue Ã  la source 1.5% dÃ©duite par le client' },
          { code: '411100', d: 0, c: 147561.000, desc: 'RÃ¨glement client AutoParts' },
        ],
      },

      // RÃ¨glement fournisseur PolyChem par virement BIAT avec RS 1.5%
      {
        num: `BQ-BIAT-2026-10-${ent.code}-01`,
        date: new Date('2026-10-29T15:30:00.000Z'),
        ref: 'VIR-FOURN-POLYCHEM-09',
        desc: 'RÃ¨glement virement fournisseur PolyChem avec RS 1.5%',
        lines: [
          { code: '401100', d: 102341.000, c: 0, desc: 'DÃ©bit Fournisseur PolyChem' },
          { code: '532200', d: 0, c: 100805.885, desc: 'CrÃ©dit Banque BIAT Dinars' },
          { code: '436500', d: 0, c: 1535.115, desc: 'Retenue Ã  la source 1.5% due Ã  lâ€™Ã‰tat' },
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
          { code: '421000', d: 0, c: 218762.000, desc: 'Salaires nets Ã  payer' },
          { code: '431000', d: 0, c: 74812.500, desc: 'CNSS globale Ã  verser' },
          { code: '436500', d: 0, c: 38650.000, desc: 'Retenue Ã  la source IRPP sur salaires' },
          { code: '437000', d: 0, c: 7125.000, desc: 'FOPROLOS & CSS dus Ã  lâ€™Ã‰tat' },
        ],
      },

      // Virement bancaire des salaires
      {
        num: `BQ-STB-PAIE-2026-10-${ent.code}`,
        date: new Date('2026-10-31T18:00:00.000Z'),
        ref: 'VIREMENT-SALAIRES-MASSE',
        desc: 'Virement groupÃ© des salaires nets dâ€™octobre via STB',
        lines: [
          { code: '421000', d: 218762.000, c: 0, desc: 'Paiement salaires nets' },
          { code: '532100', d: 0, c: 218762.000, desc: 'DÃ©bit Banque STB salaires' },
        ],
      },

      // Mouvements Caisse et Transports urgents
      {
        num: `CS-2026-10-${ent.code}-01`,
        date: new Date('2026-10-22T16:00:00.000Z'),
        ref: 'PIECE-CAISSE-142',
        desc: 'Frais de transport urgent et fournitures administratives',
        lines: [
          { code: '624000', d: 1850.000, c: 0, desc: 'Transport express piÃ¨ces urgentes' },
          { code: '622000', d: 1200.000, c: 0, desc: 'Honoraires et frais dâ€™actes' },
          { code: '540000', d: 0, c: 3050.000, desc: 'Sortie dâ€™espÃ¨ces de la Caisse centrale' },
        ],
      },

      // Virement interne Banque vers Caisse
      {
        num: `OD-VIR-INT-2026-10-${ent.code}`,
        date: new Date('2026-10-23T11:00:00.000Z'),
        ref: 'CHQ-ALIM-CAISSE-091',
        desc: 'Retrait dâ€™espÃ¨ces STB pour alimentation de la caisse centrale',
        lines: [
          { code: '581000', d: 5000.000, c: 0, desc: 'Virements internes transit' },
          { code: '532100', d: 0, c: 5000.000, desc: 'CrÃ©dit Banque STB retrait' },
        ],
      },
      {
        num: `CS-REC-2026-10-${ent.code}`,
        date: new Date('2026-10-23T11:30:00.000Z'),
        ref: 'ALIM-CAISSE-091',
        desc: 'EntrÃ©e en caisse des espÃ¨ces retirÃ©es de STB',
        lines: [
          { code: '540000', d: 5000.000, c: 0, desc: 'EntrÃ©e en caisse centrale' },
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
          { code: '661000', d: 2300.000, c: 0, desc: 'IntÃ©rÃªts bancaires et agios' },
          { code: '656000', d: 1800.000, c: 0, desc: 'Pertes de change constatÃ©es' },
          { code: '532100', d: 0, c: 5550.000, desc: 'PrÃ©lÃ¨vement bancaire STB' },
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
        desc: 'Variation des stocks de matiÃ¨res consommÃ©es pour la fabrication',
        lines: [
          { code: '603100', d: 14250.000, c: 0, desc: 'Variation des stocks matiÃ¨res' },
          { code: '311000', d: 0, c: 14250.000, desc: 'DÃ©stockage valorisÃ© au PUMP' },
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
    console.log(`PiÃ¨ces comptables crÃ©Ã©es et postÃ©es pour ${ent.name} : ${createdVouchers}`);
  }

  console.log('\n=== TERMINÃ‰ AVEC SUCCÃˆS POUR TOUTES LES SOCIÃ‰TÃ‰S ===');
}

main().catch(console.error).finally(() => {
  (prisma as any).$disconnect();
});
