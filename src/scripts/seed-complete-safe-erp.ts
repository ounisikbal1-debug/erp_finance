import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../application/security/passwords';
import { TUNISIAN_ACCOUNT_FINANCIAL_CATEGORIES } from '../application/modules/advanced-finance/financial-categories';
import { appendJournalEntryAuditRecord } from '../application/modules/finance/audit-chain';

const prisma = new PrismaClient();

function requireDemoPassword(environmentVariable: string): string {
  const password = process.env[environmentVariable];
  if (!password || Buffer.byteLength(password, 'utf8') < 12) {
    throw new Error(`${environmentVariable} doit être configuré avec au moins 12 octets.`);
  }
  return password;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Le seed complet de démonstration est interdit en production.');
  }
  const databaseUrl = process.env.SAFE_ERP_DATABASE_URL;
  if (
    process.env.SAFE_ERP_ALLOW_COMPLETE_DEMO_SEED !== 'YES' ||
    !databaseUrl ||
    process.env.SAFE_ERP_COMPLETE_DEMO_SEED_CONFIRM_DATABASE_URL !== databaseUrl
  ) {
    throw new Error(
      'Seed désactivé par défaut : confirmez explicitement la base de démonstration et définissez SAFE_ERP_ALLOW_COMPLETE_DEMO_SEED=YES.',
    );
  }

  const demoPasswords = {
    admin: requireDemoPassword('SAFE_ERP_COMPLETE_DEMO_ADMIN_PASSWORD'),
    finance: requireDemoPassword('SAFE_ERP_COMPLETE_DEMO_FINANCE_PASSWORD'),
    hr: requireDemoPassword('SAFE_ERP_COMPLETE_DEMO_HR_PASSWORD'),
    sales: requireDemoPassword('SAFE_ERP_COMPLETE_DEMO_SALES_PASSWORD'),
    accountant: requireDemoPassword('SAFE_ERP_COMPLETE_DEMO_ACCOUNTANT_PASSWORD'),
  };

  console.log('🚀 Initialisation complète et fiabilisation de SAFE ERP (Normes Tunisiennes & Multi-Sociétés)...');

  // 1. Profil Pays : TUNISIE
  const tunisia = await prisma.countryProfile.upsert({
    where: { code: 'TN' },
    update: {
      isDefault: true,
      currencyCode: 'TND',
      currencySymbol: 'DT',
      stampDuty: 1.000,
      corporateTax: 20.0,
      salesReceivableAccountCode: '411',
      salesRevenueAccountCode: '701',
      salesVatAccountCode: '4367',
      salesStampDutyAccountCode: '432',
      purchaseExpenseAccountCode: '601',
      purchaseVatAccountCode: '4366',
      stockAssetAccountCode: '311',
      stockAdjustmentAccountCode: '603',
      productionWipAccountCode: '33',
      realizedFxGainAccountCode: '756',
      realizedFxLossAccountCode: '656',
    },
    create: {
      code: 'TN',
      name: 'Tunisie',
      currencyCode: 'TND',
      currencySymbol: 'DT',
      stampDuty: 1.000,
      corporateTax: 20.0,
      isDefault: true,
      salesReceivableAccountCode: '411',
      salesRevenueAccountCode: '701',
      salesVatAccountCode: '4367',
      salesStampDutyAccountCode: '432',
      purchaseExpenseAccountCode: '601',
      purchaseVatAccountCode: '4366',
      stockAssetAccountCode: '311',
      stockAdjustmentAccountCode: '603',
      productionWipAccountCode: '33',
      realizedFxGainAccountCode: '756',
      realizedFxLossAccountCode: '656',
    },
  });

  // 2. Société Pilote : SAFE-TN-001 (SAFE AFRIQUE TUNISIE)
  const entity = await prisma.entity.upsert({
    where: { code: 'SAFE-TN-001' },
    update: {
      name: 'SAFE AFRIQUE TUNISIE SARL',
      fiscalId: '1458920/B/A/M/000',
      tradeRegister: 'B1029482024',
      countryId: tunisia.id,
    },
    create: {
      code: 'SAFE-TN-001',
      name: 'SAFE AFRIQUE TUNISIE SARL',
      fiscalId: '1458920/B/A/M/000',
      tradeRegister: 'B1029482024',
      countryId: tunisia.id,
    },
  });

  // 3. Mapping Comptable de Trésorerie
  await prisma.cashflowAccountingMapping.upsert({
    where: { entityId: entity.id },
    update: { receivableAccountCode: '411', payableAccountCode: '401' },
    create: { entityId: entity.id, receivableAccountCode: '411', payableAccountCode: '401' },
  });

  // 4. Plan Comptable Général Tunisien (Classes 1 à 7 SCE)
  const accounts = [
    // Classe 1 : Capitaux propres
    { code: '101', description: 'Capital social', classNumber: 1, type: 'Equity' },
    { code: '111', description: 'Réserve légale', classNumber: 1, type: 'Equity' },
    { code: '120', description: 'Résultat de l’exercice (bénéfice)', classNumber: 1, type: 'Equity' },
    // Classe 2 : Immobilisations
    { code: '218', description: 'Matériel informatique et mobilier', classNumber: 2, type: 'Asset' },
    { code: '221', description: 'Terrains et constructions', classNumber: 2, type: 'Asset' },
    { code: '281', description: 'Amortissements des immobilisations', classNumber: 2, type: 'Asset' },
    // Classe 3 : Stocks
    { code: '311', description: 'Matières premières et fournitures', classNumber: 3, type: 'Asset' },
    { code: '33', description: 'En-cours de production de biens', classNumber: 3, type: 'Asset' },
    { code: '370', description: 'Marchandises en stock', classNumber: 3, type: 'Asset' },
    // Classe 4 : Tiers
    { code: '401', description: 'Fournisseurs d’exploitation', classNumber: 4, type: 'Liability' },
    { code: '411', description: 'Clients', classNumber: 4, type: 'Asset' },
    { code: '421', description: 'Personnel - Rémunérations dues', classNumber: 4, type: 'Liability' },
    { code: '432', description: 'État - Droit de timbre & impôts', classNumber: 4, type: 'Liability' },
    { code: '434', description: 'Organismes sociaux - CNSS', classNumber: 4, type: 'Liability' },
    { code: '4366', description: 'État - TVA déductible', classNumber: 4, type: 'Asset' },
    { code: '4367', description: 'État - TVA collectée', classNumber: 4, type: 'Liability' },
    { code: '438', description: 'État - Retenues à la source', classNumber: 4, type: 'Liability' },
    // Classe 5 : Financiers
    { code: '532', description: 'Banques commerciales (TND)', classNumber: 5, type: 'Asset' },
    { code: '540', description: 'Caisse centrale', classNumber: 5, type: 'Asset' },
    // Classe 6 : Charges
    { code: '601', description: 'Achats de matières premières', classNumber: 6, type: 'Expense' },
    { code: '603', description: 'Variations des stocks de matières', classNumber: 6, type: 'Expense' },
    { code: '607', description: 'Achats de marchandises', classNumber: 6, type: 'Expense' },
    { code: '624', description: 'Transports de biens et déplacements', classNumber: 6, type: 'Expense' },
    { code: '640', description: 'Salaires et traitements bruts', classNumber: 6, type: 'Expense' },
    { code: '647', description: 'Charges sociales patronales (CNSS/FOPROLOS)', classNumber: 6, type: 'Expense' },
    { code: '656', description: 'Pertes de change', classNumber: 6, type: 'Expense' },
    { code: '661', description: 'Charges d’intérêts bancaires', classNumber: 6, type: 'Expense' },
    // Classe 7 : Produits
    { code: '701', description: 'Ventes de produits finis', classNumber: 7, type: 'Revenue' },
    { code: '707', description: 'Ventes de marchandises', classNumber: 7, type: 'Revenue' },
    { code: '716', description: 'Prestations de services et études', classNumber: 7, type: 'Revenue' },
    { code: '756', description: 'Gains de change', classNumber: 7, type: 'Revenue' },
  ];

  for (const acc of accounts) {
    const financialCategory = TUNISIAN_ACCOUNT_FINANCIAL_CATEGORIES[acc.code];
    await prisma.chartOfAccount.upsert({
      where: { countryId_code: { countryId: tunisia.id, code: acc.code } },
      update: {
        description: acc.description,
        classNumber: acc.classNumber,
        type: acc.type,
        isPostingAllowed: true,
        ...(financialCategory ? { financialCategory } : {}),
      },
      create: {
        countryId: tunisia.id,
        code: acc.code,
        description: acc.description,
        classNumber: acc.classNumber,
        type: acc.type,
        isPostingAllowed: true,
        ...(financialCategory ? { financialCategory } : {}),
      },
    });
  }
  console.log(`✅ Plan comptable SCE initialisé (${accounts.length} comptes).`);

  // 5. Taux de TVA Tunisiens
  const taxRates = [
    { code: 'TVA_19', name: 'TVA Normale (19%)', rate: 19.0, isDefault: true, purchaseVatRecoverable: true },
    { code: 'TVA_13', name: 'TVA Intermédiaire (13%)', rate: 13.0, isDefault: false, purchaseVatRecoverable: true },
    { code: 'TVA_7', name: 'TVA Réduite (7%)', rate: 7.0, isDefault: false, purchaseVatRecoverable: true },
    { code: 'TVA_0', name: 'Exonéré de TVA (0%)', rate: 0.0, isDefault: false, purchaseVatRecoverable: false },
  ];
  for (const tr of taxRates) {
    const existing = await prisma.taxRate.findFirst({
      where: { countryId: tunisia.id, code: tr.code },
    });
    if (existing) {
      await prisma.taxRate.update({ where: { id: existing.id }, data: tr });
    } else {
      await prisma.taxRate.create({ data: { ...tr, countryId: tunisia.id } });
    }
  }
  console.log('✅ Taux de TVA configurés.');

  // 6. Centres de Coûts Analytiques
  const costCenters = [
    { code: 'CC-DIR', name: 'Direction Générale', department: 'Management' },
    { code: 'CC-FIN', name: 'Finance & Contrôle de Gestion', department: 'Finance' },
    { code: 'CC-RH', name: 'Ressources Humaines', department: 'HR' },
    { code: 'CC-COM', name: 'Ventes & Distribution', department: 'Commercial' },
    { code: 'CC-PROD', name: 'Production & Ateliers', department: 'Operations' },
  ];
  for (const cc of costCenters) {
    await prisma.costCenter.upsert({
      where: { code: cc.code },
      update: { name: cc.name, department: cc.department, entityId: entity.id },
      create: { code: cc.code, name: cc.name, department: cc.department, entityId: entity.id },
    });
  }
  console.log('✅ Centres de coûts analytiques créés.');

  // 7. Configuration de Paie Tunisienne & Barème 8 Tranches IRPP
  await prisma.payrollConfig.upsert({
    where: { countryId: tunisia.id },
    update: {
      employeeCnssRate: 9.68,
      employerCnssRate: 16.57,
      employerWorkAccidentRate: 0.50,
      foprolosRate: 1.00,
      cssRate: 0.50,
      profExpensesRate: 10.0,
      profExpensesMaxCap: 2000.0,
      headOfFamilyDeduction: 300.0,
      childDeduction: 100.0,
      parentDeduction: 450.0,
    },
    create: {
      countryId: tunisia.id,
      employeeCnssRate: 9.68,
      employerCnssRate: 16.57,
      employerWorkAccidentRate: 0.50,
      foprolosRate: 1.00,
      cssRate: 0.50,
      profExpensesRate: 10.0,
      profExpensesMaxCap: 2000.0,
      headOfFamilyDeduction: 300.0,
      childDeduction: 100.0,
      parentDeduction: 450.0,
    },
  });

  const irppBrackets = [
    { order: 1, minAmount: 0.0, maxAmount: 5000.0, rate: 0.0 },
    { order: 2, minAmount: 5000.001, maxAmount: 10000.0, rate: 15.0 },
    { order: 3, minAmount: 10000.001, maxAmount: 20000.0, rate: 25.0 },
    { order: 4, minAmount: 20000.001, maxAmount: 30000.0, rate: 30.0 },
    { order: 5, minAmount: 30000.001, maxAmount: 40000.0, rate: 33.0 },
    { order: 6, minAmount: 40000.001, maxAmount: 50000.0, rate: 36.0 },
    { order: 7, minAmount: 50000.001, maxAmount: 70000.0, rate: 38.0 },
    { order: 8, minAmount: 70000.001, maxAmount: null, rate: 40.0 },
  ];
  await prisma.payrollTaxBracket.deleteMany({ where: { countryId: tunisia.id } });
  for (const b of irppBrackets) {
    await prisma.payrollTaxBracket.create({
      data: { ...b, countryId: tunisia.id },
    });
  }
  console.log('✅ Moteur de paie tunisien & barème IRPP 8 tranches configurés.');

  // 8. Rubriques Spécifiques de Paie
  const rubriques = [
    { code: 'PRIME_EXCEPT', label: 'Prime exceptionnelle', category: 'PRIME', defaultAmount: 500.0 },
    { code: 'PRIME_FIN_ANNEE', label: 'Prime de fin d’année (13ème mois)', category: 'PRIME', defaultAmount: 1200.0 },
    { code: 'PRIME_RENDEMENT', label: 'Prime de rendement et performance', category: 'PRIME', defaultAmount: 350.0 },
    { code: 'INDEMNITE_TRANSPORT', label: 'Indemnité de transport forfaitaire', category: 'PRIME_NON_COTISABLE', defaultAmount: 100.0 },
    { code: 'AVANCE_SALAIRE', label: 'Avance sur salaire', category: 'RETENUE', defaultAmount: 200.0 },
    { code: 'PRET_ENTREPRISE', label: 'Remboursement de prêt entreprise', category: 'RETENUE', defaultAmount: 150.0 },
    { code: 'ASSUR_VIE_RETRAITE', label: 'Contrat Assurance-vie / Retraite (Avantage fiscal déductible)', category: 'AVANTAGE_FISCAL', defaultAmount: 100.0 },
  ];
  for (const r of rubriques) {
    await prisma.payrollRubrique.upsert({
      where: { code: r.code },
      update: r,
      create: r,
    });
  }

  // 9. Utilisateurs & Rôles Système (RBAC Sécurisé)
  const usersToSeed = [
    { username: 'admin', password: demoPasswords.admin, role: 'ADMIN', entityId: null },
    { username: 'finmgr', password: demoPasswords.finance, role: 'FINANCIAL_MANAGER', entityId: entity.id },
    { username: 'hrmgr', password: demoPasswords.hr, role: 'HR_MANAGER', entityId: entity.id },
    { username: 'salesmgr', password: demoPasswords.sales, role: 'SALES_OFFICER', entityId: entity.id },
    { username: 'compta', password: demoPasswords.accountant, role: 'ACCOUNTANT', entityId: entity.id },
  ];
  for (const u of usersToSeed) {
    const passwordHash = await hashPassword(u.password);
    await prisma.user.upsert({
      where: { username: u.username },
      update: { passwordHash, role: u.role, entityId: u.entityId, isActive: true },
      create: { username: u.username, passwordHash, role: u.role, entityId: u.entityId, isActive: true },
    });
  }
  console.log('✅ Comptes utilisateurs initialisés (admin, finmgr, hrmgr, salesmgr, compta).');

  // 10. Salariés avec Matricules ID
  const employees = [
    {
      empId: 'EMP-2026-001',
      cin: '08123456',
      cnssNumber: '12345678-90',
      firstName: 'Mohamed',
      lastName: 'Ben Salah',
      email: 'mohamed.bensalah@safe.tn',
      position: 'Chef Comptable & Contrôleur',
      baseSalary: 2500.0,
      maritalStatus: 'MARRIED',
      isHeadOfFamily: true,
      childrenCount: 2,
      dependentParents: 0,
      entityId: entity.id,
    },
    {
      empId: 'EMP-2026-002',
      cin: '09876543',
      cnssNumber: '23456789-01',
      firstName: 'Amina',
      lastName: 'Trabelsi',
      email: 'amina.trabelsi@safe.tn',
      position: 'Ingénieur Développeur Systèmes',
      baseSalary: 1900.0,
      maritalStatus: 'SINGLE',
      isHeadOfFamily: false,
      childrenCount: 0,
      dependentParents: 0,
      entityId: entity.id,
    },
    {
      empId: 'EMP-2026-003',
      cin: '04561234',
      cnssNumber: '34567890-12',
      firstName: 'Karim',
      lastName: 'Gharbi',
      email: 'karim.gharbi@safe.tn',
      position: 'Directeur Commercial & Export',
      baseSalary: 4200.0,
      maritalStatus: 'MARRIED',
      isHeadOfFamily: true,
      childrenCount: 3,
      dependentParents: 1,
      entityId: entity.id,
    },
  ];
  for (const emp of employees) {
    await prisma.employee.upsert({
      where: { email: emp.email },
      update: emp,
      create: emp,
    });
  }
  console.log('✅ Salariés enregistrés dans SAFE ERP (Module Capital Humain).');

  // 11. Clients Partenaires
  const customers = [
    { code: 'CLT-001', name: 'Comptoir Maghrébin de Distribution', fiscalId: '0987654/C/A/000', email: 'contact@cmd.tn' },
    { code: 'CLT-002', name: 'Société Tunisienne d’Équipement (STE)', fiscalId: '1122334/B/M/000', email: 'achats@ste.tn' },
    { code: 'CLT-003', name: 'Société Industrielle du Sahel (SIS)', fiscalId: '0445566/D/A/000', email: 'appro@sis.tn' },
  ];
  for (const c of customers) {
    await prisma.customer.upsert({
      where: { entityId_code: { entityId: entity.id, code: c.code } },
      update: { name: c.name, fiscalId: c.fiscalId, email: c.email },
      create: { ...c, entityId: entity.id },
    });
  }

  // 12. Fournisseurs
  const vendors = [
    { code: 'FRN-001', name: 'Tunisie Métaux & Outillage', fiscalId: '0123987/D/M/000', email: 'ventes@tmo.tn' },
    { code: 'FRN-002', name: 'Maghreb Fournitures Industrielles', fiscalId: '0654321/K/A/000', email: 'contact@mfi.tn' },
    { code: 'FRN-003', name: 'Électro Plastique Tunisie', fiscalId: '0789456/L/M/000', email: 'commercial@ept.tn' },
  ];
  for (const v of vendors) {
    await prisma.vendor.upsert({
      where: { code: v.code },
      update: { name: v.name, fiscalId: v.fiscalId, email: v.email, entityId: entity.id },
      create: { ...v, entityId: entity.id },
    });
  }

  // 13. Entrepôts & Articles en Stock
  const warehouse = await prisma.warehouse.upsert({
    where: { entityId_code: { entityId: entity.id, code: 'WH-01' } },
    update: { name: 'Entrepôt Central Tunis' },
    create: { code: 'WH-01', name: 'Entrepôt Central Tunis', entityId: entity.id },
  });

  const materials = [
    { sku: 'MAT-001', name: 'Profilé Aluminium Standard 6m', quantity: 350, unitPrice: 45.0, costPrice: 32.0, barcode: '619000100101' },
    { sku: 'MAT-002', name: 'Panneau Composite Haute Résistance', quantity: 120, unitPrice: 85.0, costPrice: 60.0, barcode: '619000100202' },
    { sku: 'MAT-003', name: 'Kit Visserie Inox Industrielle', quantity: 800, unitPrice: 12.5, costPrice: 7.8, barcode: '619000100303' },
  ];
  for (const m of materials) {
    const mat = await prisma.material.upsert({
      where: { sku: m.sku },
      update: { ...m, entityId: entity.id },
      create: { ...m, entityId: entity.id },
    });
    await prisma.materialWarehouseStock.upsert({
      where: { materialId_warehouseId: { materialId: mat.id, warehouseId: warehouse.id } },
      update: { quantity: m.quantity },
      create: { entityId: entity.id, materialId: mat.id, warehouseId: warehouse.id, quantity: m.quantity },
    });
  }

  // 14. Comptes Bancaires
  await prisma.bankAccount.upsert({
    where: { entityId_name: { entityId: entity.id, name: 'BH Bank - Compte Courant TND' } },
    update: { currencyCode: 'TND', ledgerAccountCode: '532', isActive: true },
    create: {
      entityId: entity.id,
      name: 'BH Bank - Compte Courant TND',
      currencyCode: 'TND',
      ledgerAccountCode: '532',
      isActive: true,
    },
  });

  await prisma.bankAccount.upsert({
    where: { entityId_name: { entityId: entity.id, name: 'BIAT - Compte Opérations Commerciales' } },
    update: { currencyCode: 'TND', ledgerAccountCode: '532', isActive: true },
    create: {
      entityId: entity.id,
      name: 'BIAT - Compte Opérations Commerciales',
      currencyCode: 'TND',
      ledgerAccountCode: '532',
      isActive: true,
    },
  });
  console.log('✅ Entrepôts, articles, partenaires et comptes bancaires initialisés.');

  // 15. Écritures Comptables Fondatrices & Piste d’Audit SHA-256
  const existingOpening = await prisma.journalEntry.findFirst({
    where: { entityId: entity.id, entryNumber: 'RAN-2026-001' },
  });
  if (!existingOpening) {
    const openingDate = new Date('2026-01-01T00:00:00.000Z');
    const openingEntry = await prisma.journalEntry.create({
      data: {
        entityId: entity.id,
        entryNumber: 'RAN-2026-001',
        date: openingDate,
        reference: 'BILAN-OUVERTURE-2026',
        description: 'Bilan d’ouverture de l’exercice 2026 — SAFE AFRIQUE TUNISIE',
        status: 'POSTED',
        postedAt: openingDate,
        postedByUsername: 'admin',
        lines: {
          create: [
            // Débits (Actifs)
            { accountCode: '218', debit: 45000.0, credit: 0, description: 'Matériel informatique et mobilier' },
            { accountCode: '311', debit: 24640.0, credit: 0, description: 'Stock matières premières et profilés' },
            { accountCode: '411', debit: 38500.0, credit: 0, description: 'Créances clients' },
            { accountCode: '532', debit: 124000.0, credit: 0, description: 'Solde banques commerciales' },
            // Crédits (Capitaux et Dettes)
            { accountCode: '101', debit: 0, credit: 150000.0, description: 'Capital social souscrit' },
            { accountCode: '111', debit: 0, credit: 15000.0, description: 'Réserve légale' },
            { accountCode: '120', debit: 0, credit: 32140.0, description: 'Report à nouveau et résultat antérieur' },
            { accountCode: '401', debit: 0, credit: 35000.0, description: 'Dettes fournisseurs d’exploitation' },
          ],
        },
      },
    });
    await appendJournalEntryAuditRecord(prisma, openingEntry.id);
    console.log('✅ Bilan d’ouverture équilibré et scellé dans la chaîne SHA-256 (RAN-2026-001).');
  }

  // Écriture d'opérations d'exploitation (Ventes, Achats, Salaires)
  const existingOp = await prisma.journalEntry.findFirst({
    where: { entityId: entity.id, entryNumber: 'OP-2026-001' },
  });
  if (!existingOp) {
    const opDate = new Date('2026-02-15T00:00:00.000Z');
    const opEntry = await prisma.journalEntry.create({
      data: {
        entityId: entity.id,
        entryNumber: 'OP-2026-001',
        date: opDate,
        reference: 'VENTES-FEVRIER-2026',
        description: 'Constatation du chiffre d’affaires et TVA collectée Février 2026',
        status: 'POSTED',
        postedAt: opDate,
        postedByUsername: 'admin',
        lines: {
          create: [
            { accountCode: '411', debit: 59501.0, credit: 0, description: 'Créances clients TTC' },
            { accountCode: '701', debit: 0, credit: 50000.0, description: 'Ventes de profilés aluminium', costCenterCode: 'CC-COM' },
            { accountCode: '4367', debit: 0, credit: 9500.0, description: 'TVA collectée 19%' },
            { accountCode: '432', debit: 0, credit: 1.0, description: 'Droit de timbre fiscal 1.000 DT' },
          ],
        },
      },
    });
    await appendJournalEntryAuditRecord(prisma, opEntry.id);
    console.log('✅ Écriture d’exploitation commerciale comptabilisée et scellée (OP-2026-001).');
  }

  console.log('Seed de démonstration terminé. Vérifiez les données avant toute utilisation.');
}

main()
  .catch((e) => {
    console.error('âŒ Erreur lors de l’initialisation :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
