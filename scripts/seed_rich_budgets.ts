import defaultPrisma from '../src/data/prisma/client';

async function main() {
  const entities = await defaultPrisma.entity.findMany({
    where: { code: { in: ['TN01', 'SAFE-TN-001'] } },
  });
  const adminUser = await defaultPrisma.user.findFirst();
  if (!adminUser) return;

  const budgetTemplates = [
    // Charges d'exploitation approuvÃ©es & comptabilisÃ©es
    { accountCode: '601', amount: 320000.0, status: 'APPROVED', revisionNumber: 1, reason: 'Budget initial approuvÃ© en conseil' },
    { accountCode: '602', amount: 45000.0, status: 'APPROVED', revisionNumber: 1, reason: 'Budget annuel consommables' },
    { accountCode: '607', amount: 180000.0, status: 'APPROVED', revisionNumber: 1, reason: 'Achats marchandises nÃ©goce' },
    { accountCode: '624', amount: 28000.0, status: 'APPROVED', revisionNumber: 1, reason: 'Transports et logistique de distribution' },
    { accountCode: '640', amount: 215000.0, status: 'APPROVED', revisionNumber: 1, reason: 'RÃ©munÃ©rations et salaires bruts' },
    { accountCode: '647', amount: 38500.0, status: 'APPROVED', revisionNumber: 1, reason: 'Charges sociales patronales CNSS/Foprolos' },
    { accountCode: '661', amount: 12000.0, status: 'APPROVED', revisionNumber: 1, reason: 'IntÃ©rÃªts bancaires et frais de financement' },
    { accountCode: '68112', amount: 22000.0, status: 'APPROVED', revisionNumber: 1, reason: 'Dotations aux amortissements industriels' },
    { accountCode: '6815', amount: 8500.0, status: 'APPROVED', revisionNumber: 1, reason: 'Dotations aux provisions dâ€™exploitation' },
    { accountCode: '656', amount: 5000.0, status: 'APPROVED', revisionNumber: 1, reason: 'Pertes de change prÃ©vues' },
    // Lignes Produits
    { accountCode: '701', amount: 890000.0, status: 'APPROVED', revisionNumber: 1, reason: 'Ventes produits finis marchÃ© local' },
    { accountCode: '707', amount: 260000.0, status: 'APPROVED', revisionNumber: 1, reason: 'Ventes nÃ©goce & revente' },
    { accountCode: '716', amount: 140000.0, status: 'APPROVED', revisionNumber: 1, reason: 'Prestations de services et Ã©tudes techniques' },
    { accountCode: '756', amount: 15000.0, status: 'APPROVED', revisionNumber: 1, reason: 'Gains de change estimÃ©s' },

    // Versions rÃ©visÃ©es et brouillons pour tester les Ã©tats
    { accountCode: '613000', amount: 18500.0, status: 'REVISED', revisionNumber: 2, reason: 'Avenant bail entrepÃ´t logistique' },
    { accountCode: '615000', amount: 16000.0, status: 'REVISED', revisionNumber: 2, reason: 'Plan de maintenance prÃ©ventive renforcÃ©' },
    { accountCode: '622000', amount: 14500.0, status: 'DRAFT', revisionNumber: 1, reason: 'Campagne marketing digital Q4' },
    { accountCode: '626000', amount: 7200.0, status: 'DRAFT', revisionNumber: 1, reason: 'TÃ©lÃ©coms et liaisons fibre optique' },
  ];

  for (const ent of entities) {
    console.log(`Seeding budgets for ${ent.name}...`);
    // Delete existing budget lines for 2026-11 to replace with comprehensive ecosystem
    await defaultPrisma.budgetLine.deleteMany({
      where: { entityId: ent.id, period: '2026-11' },
    });
    for (const b of budgetTemplates) {
      await defaultPrisma.budgetLine.create({
        data: {
          entityId: ent.id,
          period: '2026-11',
          accountCode: b.accountCode,
          amount: b.amount,
          status: b.status,
          revisionNumber: b.revisionNumber,
          revisionReason: b.reason,
          createdByUserId: adminUser.id,
          approvedByUserId: b.status === 'APPROVED' ? adminUser.id : null,
          approvedAt: b.status === 'APPROVED' ? new Date() : null,
        },
      });
    }
  }

  console.log('Successfully seeded rich budget ecosystem across APPROVED, REVISED, and DRAFT.');
}

main().catch(console.error).finally(() => defaultPrisma.$disconnect());
