import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../application/security/passwords';
import { TUNISIAN_ACCOUNT_FINANCIAL_CATEGORIES } from '../../application/modules/advanced-finance/financial-categories';

const prisma = new PrismaClient();

async function main() {
  const databaseUrl = process.env.SAFE_ERP_DATABASE_URL;
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.SAFE_ERP_ALLOW_DEMO_SEED !== 'YES' ||
    !databaseUrl ||
    process.env.SAFE_ERP_DEMO_SEED_CONFIRM_DATABASE_URL !== databaseUrl
  ) {
    throw new Error(
      'Seed de démonstration refusé : ciblez une base dédiée, confirmez exactement son URL et définissez SAFE_ERP_ALLOW_DEMO_SEED=YES hors production.',
    );
  }

  const users = [
    { username: 'admin', password: process.env.SAFE_ERP_ADMIN_PASSWORD, role: 'ADMIN', envName: 'SAFE_ERP_ADMIN_PASSWORD' },
    { username: 'finmgr', password: process.env.SAFE_ERP_FINANCE_PASSWORD, role: 'FINANCIAL_MANAGER', envName: 'SAFE_ERP_FINANCE_PASSWORD' },
    { username: 'hrmgr', password: process.env.SAFE_ERP_HR_PASSWORD, role: 'HR_MANAGER', envName: 'SAFE_ERP_HR_PASSWORD' },
    { username: 'salesmgr', password: process.env.SAFE_ERP_SALES_PASSWORD, role: 'SALES_OFFICER', envName: 'SAFE_ERP_SALES_PASSWORD' },
  ];
  for (const user of users) {
    if (!user.password || user.password.length < 12) {
      throw new Error(`${user.envName} doit être défini et comporter au moins 12 caractères avant l’initialisation.`);
    }
  }

  console.log('🌱 Démarrage de l\'initialisation des données SAFE_ERP (Normes Tunisiennes)...');

  // 1. PAYS PAR DÉFAUT : TUNISIE
  const tunisia = await prisma.countryProfile.upsert({
    where: { code: 'TN' },
    update: {
      isDefault: true,
      currencyCode: 'TND',
      currencySymbol: 'DT',
      stampDuty: 1.000,
      corporateTax: 20.0,
      stockAssetAccountCode: '311',
      stockAdjustmentAccountCode: '603',
      productionWipAccountCode: '33',
    },
    create: {
      code: 'TN',
      name: 'Tunisie',
      currencyCode: 'TND',
      currencySymbol: 'DT',
      stampDuty: 1.000,
      corporateTax: 20.0,
      isDefault: true,
      stockAssetAccountCode: '311',
      stockAdjustmentAccountCode: '603',
      productionWipAccountCode: '33',
    },
  });

  // 2. CONFIGURATION DE PAIE TUNISIENNE (CNSS, FOPROLOS, CSS, ABATTEMENTS)
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

  // 3. BARÈME PROGRESSIF DE L'IRPP TUNISIEN (8 TRANCHES OFFICIELLES)
  await prisma.payrollTaxBracket.deleteMany({ where: { countryId: tunisia.id } });
  const brackets = [
    { order: 1, minAmount: 0.0, maxAmount: 5000.0, rate: 0.0 },
    { order: 2, minAmount: 5000.001, maxAmount: 10000.0, rate: 15.0 },
    { order: 3, minAmount: 10000.001, maxAmount: 20000.0, rate: 25.0 },
    { order: 4, minAmount: 20000.001, maxAmount: 30000.0, rate: 30.0 },
    { order: 5, minAmount: 30000.001, maxAmount: 40000.0, rate: 33.0 },
    { order: 6, minAmount: 40000.001, maxAmount: 50000.0, rate: 36.0 },
    { order: 7, minAmount: 50000.001, maxAmount: 70000.0, rate: 38.0 },
    { order: 8, minAmount: 70000.001, maxAmount: null, rate: 40.0 },
  ];
  for (const b of brackets) {
    await prisma.payrollTaxBracket.create({
      data: {
        countryId: tunisia.id,
        order: b.order,
        minAmount: b.minAmount,
        maxAmount: b.maxAmount,
        rate: b.rate,
      },
    });
  }

  // 4. TAUX DE TVA TUNISIENS
  await prisma.taxRate.deleteMany({ where: { countryId: tunisia.id } });
  const taxRates = [
    { code: 'TVA_19', name: 'TVA Normale (19%)', rate: 19.0, isDefault: true },
    { code: 'TVA_13', name: 'TVA Intermédiaire (13%)', rate: 13.0, isDefault: false },
    { code: 'TVA_7', name: 'TVA Réduite (7%)', rate: 7.0, isDefault: false },
    { code: 'TVA_0', name: 'Exonéré de TVA (0%)', rate: 0.0, isDefault: false },
  ];
  for (const tr of taxRates) {
    await prisma.taxRate.create({
      data: { ...tr, countryId: tunisia.id },
    });
  }

  // 5. PLAN COMPTABLE GÉNÉRAL TUNISIEN (SCE - CLASSES 1 À 7)
  const accountGroups = [
    {
      code: 'STOCK-GROUP-TEST',
      description: 'Regroupement développement — stocks et en-cours (non comptabilisable, à valider)',
      classNumber: 3,
      type: 'Asset',
      isPostingAllowed: false,
    },
    {
      code: 'STOCK-CHARGES-GROUP-TEST',
      description: 'Regroupement développement — contreparties de stock (non comptabilisable, à valider)',
      classNumber: 6,
      type: 'Expense',
      isPostingAllowed: false,
    },
  ];
  for (const group of accountGroups) {
    await prisma.chartOfAccount.upsert({
      where: { countryId_code: { countryId: tunisia.id, code: group.code } },
      update: { ...group, parentId: null },
      create: { ...group, countryId: tunisia.id },
    });
  }
  const stockGroup = await prisma.chartOfAccount.findUniqueOrThrow({
    where: { countryId_code: { countryId: tunisia.id, code: 'STOCK-GROUP-TEST' } },
    select: { id: true },
  });
  const stockChargesGroup = await prisma.chartOfAccount.findUniqueOrThrow({
    where: { countryId_code: { countryId: tunisia.id, code: 'STOCK-CHARGES-GROUP-TEST' } },
    select: { id: true },
  });
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
    { code: '311', description: 'Matières premières', classNumber: 3, type: 'Asset', parentId: stockGroup.id },
    { code: '33', description: 'En-cours de production (compte de test, à valider par expert)', classNumber: 3, type: 'Asset', parentId: stockGroup.id },
    { code: '370', description: 'Marchandises en stock', classNumber: 3, type: 'Asset', parentId: stockGroup.id },
    // Classe 4 : Tiers
    { code: '401', description: 'Fournisseurs d’exploitation', classNumber: 4, type: 'Liability' },
    { code: '411', description: 'Clients', classNumber: 4, type: 'Asset' },
    { code: '432', description: 'État - Impôts et taxes à payer', classNumber: 4, type: 'Liability' },
    { code: '434', description: 'Organismes sociaux - CNSS', classNumber: 4, type: 'Liability' },
    { code: '4366', description: 'État - TVA déductible', classNumber: 4, type: 'Asset' },
    { code: '4367', description: 'État - TVA collectée', classNumber: 4, type: 'Liability' },
    { code: '438', description: 'État - Retenues à la source', classNumber: 4, type: 'Liability' },
    // Classe 5 : Financiers
    { code: '532', description: 'Banques commerciales (TND)', classNumber: 5, type: 'Asset' },
    { code: '540', description: 'Caisse centrale', classNumber: 5, type: 'Asset' },
    // Classe 6 : Charges
    { code: '601', description: 'Achats de matières premières', classNumber: 6, type: 'Expense' },
    { code: '603', description: 'Variations des stocks (compte de test, à valider par expert)', classNumber: 6, type: 'Expense', parentId: stockChargesGroup.id },
    { code: '607', description: 'Achats de marchandises', classNumber: 6, type: 'Expense' },
    { code: '640', description: 'Salaires et traitements bruts', classNumber: 6, type: 'Expense' },
    { code: '647', description: 'Charges sociales patronales (CNSS/FOPROLOS)', classNumber: 6, type: 'Expense' },
    { code: '661', description: 'Charges d’intérêts bancaires', classNumber: 6, type: 'Expense' },
    // Classe 7 : Produits
    { code: '701', description: 'Ventes de produits finis', classNumber: 7, type: 'Revenue' },
    { code: '707', description: 'Ventes de marchandises', classNumber: 7, type: 'Revenue' },
    { code: '716', description: 'Prestations de services et études', classNumber: 7, type: 'Revenue' },
  ];
  for (const { parentId, ...account } of accounts) {
    const financialCategory = TUNISIAN_ACCOUNT_FINANCIAL_CATEGORIES[account.code];
    await prisma.chartOfAccount.upsert({
      where: { countryId_code: { countryId: tunisia.id, code: account.code } },
      update: {
        ...account,
        ...(financialCategory ? { financialCategory } : {}),
        ...(parentId ? { parentId } : {}),
      },
      create: {
        ...account,
        countryId: tunisia.id,
        ...(financialCategory ? { financialCategory } : {}),
        ...(parentId ? { parentId } : {}),
      },
    });
  }

  // 6. SOCIÉTÉ PILOTE (COMPANY CODE - SAFE ENTITY)
  const entity = await prisma.entity.upsert({
    where: { code: 'TN01' },
    update: {
      name: 'Safe Tunisie Industries SARL',
      fiscalId: '1458920/B/A/M/000',
      tradeRegister: 'B1029482024',
      countryId: tunisia.id,
    },
    create: {
      code: 'TN01',
      name: 'Safe Tunisie Industries SARL',
      fiscalId: '1458920/B/A/M/000',
      tradeRegister: 'B1029482024',
      countryId: tunisia.id,
    },
  });

  // 7. CENTRES DE COÛTS (SAFE CONTROLLING)
  const costCenters = [
    { code: 'CC-DIR', name: 'Direction Générale', department: 'Management' },
    { code: 'CC-FIN', name: 'Finance & Comptabilité', department: 'Finance' },
    { code: 'CC-RH', name: 'Ressources Humaines', department: 'HR' },
    { code: 'CC-COM', name: 'Ventes & Marketing', department: 'Commercial' },
    { code: 'CC-PROD', name: 'Production & Ateliers', department: 'Operations' },
  ];
  for (const cc of costCenters) {
    await prisma.costCenter.upsert({
      where: { code: cc.code },
      update: { name: cc.name, department: cc.department, entityId: entity.id },
      create: { code: cc.code, name: cc.name, department: cc.department, entityId: entity.id },
    });
  }

  // 8. UTILISATEURS DU SYSTÈME (ADMIN & MANAGERS RBAC)
  for (const u of users) {
    const passwordHash = await hashPassword(u.password!);
    await prisma.user.upsert({
      where: { username: u.username },
      update: { passwordHash, role: u.role, entityId: entity.id },
      create: { username: u.username, passwordHash, role: u.role, entityId: entity.id },
    });
  }

  // 9. RUBRIQUES SPÉCIFIQUES DE PAIE (PRIMES, RETENUES, AVANTAGES FISCAUX)
  const rubriques = [
    { code: 'PRIME_EXCEPT', label: 'Prime exceptionnelle', category: 'PRIME', defaultAmount: 500.0 },
    { code: 'PRIME_FIN_ANNEE', label: 'Prime de fin d’année (13ème mois)', category: 'PRIME', defaultAmount: 1200.0 },
    { code: 'PRIME_RENDEMENT', label: 'Prime de rendement et performance', category: 'PRIME', defaultAmount: 350.0 },
    { code: 'INDEMNITE_TRANSPORT', label: 'Indemnité de transport forfaitaire', category: 'PRIME_NON_COTISABLE', defaultAmount: 100.0 },
    { code: 'AVANCE_SALAIRE', label: 'Avance sur salaire', category: 'RETENUE', defaultAmount: 200.0 },
    { code: 'PRET_ENTREPRISE', label: 'Remboursement de prêt entreprise', category: 'RETENUE', defaultAmount: 150.0 },
    { code: 'ASSUR_VIE_RETRAITE', label: 'Contrat Assurance-vie / Retraite (Avantage fiscal déductible IRPP)', category: 'AVANTAGE_FISCAL', defaultAmount: 100.0 },
  ];
  for (const r of rubriques) {
    await prisma.payrollRubrique.upsert({
      where: { code: r.code },
      update: r,
      create: r,
    });
  }

  // 10. EMPLOYÉS AVEC MATRICULE ID (MODULE RESSOURCES HUMAINES & PAIE SAFE ERP)
  const employees = [
    {
      empId: 'EMP-2026-001',
      cin: '08123456',
      cnssNumber: '12345678-90',
      firstName: 'Mohamed',
      lastName: 'Ben Salah',
      email: 'mohamed.bensalah@safe.tn',
      position: 'Chef Comptable',
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
      position: 'Ingénieur Développeur',
      baseSalary: 1800.0,
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
      position: 'Directeur Commercial',
      baseSalary: 4500.0,
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

  // 10. CLIENTS ET FOURNISSEURS (SAFE SD / MM)
  await prisma.customer.upsert({
    where: { entityId_code: { entityId: entity.id, code: 'CLT-001' } },
    update: { name: 'Comptoir Maghrébin de Distribution', fiscalId: '0987654/C/A/000', email: 'contact@cmd.tn', entityId: entity.id },
    create: { code: 'CLT-001', name: 'Comptoir Maghrébin de Distribution', fiscalId: '0987654/C/A/000', email: 'contact@cmd.tn', entityId: entity.id },
  });

  await prisma.vendor.upsert({
    where: { code: 'FRN-001' },
    update: { name: 'Tunisie Métaux & Outillage', fiscalId: '0123987/D/M/000', email: 'ventes@tmo.tn', entityId: entity.id },
    create: { code: 'FRN-001', name: 'Tunisie Métaux & Outillage', fiscalId: '0123987/D/M/000', email: 'ventes@tmo.tn', entityId: entity.id },
  });

  // 11. ARTICLES EN STOCK (SAFE MM)
  const materials = [
    { sku: 'MAT-001', name: 'Profilé Aluminium Standard 6m', quantity: 350, unitPrice: 45.0, costPrice: 32.0, entityId: entity.id },
    { sku: 'MAT-002', name: 'Panneau Composite Haute Résistance', quantity: 120, unitPrice: 85.0, costPrice: 60.0, entityId: entity.id },
    { sku: 'MAT-003', name: 'Kit Visserie Inox Industrielle', quantity: 800, unitPrice: 12.5, costPrice: 7.8, entityId: entity.id },
  ];
  for (const m of materials) {
    await prisma.material.upsert({
      where: { sku: m.sku },
      update: m,
      create: m,
    });
  }

  console.log('✅ Initialisation terminée avec succès !');
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors de l\'initialisation :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
