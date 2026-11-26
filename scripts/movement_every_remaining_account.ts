import { randomUUID } from 'node:crypto';
import prisma from '../src/data/prisma/client';

async function main() {
  console.log('=== MOUVEMENTATION SYSTÉMATIQUE DE TOUS LES COMPTES RESTANTS ===');

  const entities = await prisma.entity.findMany();
  const tn01 = entities.find(e => e.code === 'TN01') || entities[0];
  const safeTn = entities.find(e => e.code === 'SAFE-TN-001') || entities[1];

  for (const ent of [tn01, safeTn].filter(Boolean)) {
    console.log(`\nAnalyse des comptes pour ${ent.name} (${ent.code})...`);

    // Obtenir tous les comptes du plan
    const accounts = await prisma.chartOfAccount.findMany({
      where: { countryId: ent.countryId },
    });

    // Obtenir tous les comptes ayant déjà au moins un mouvement
    const movedAccountCodes = new Set(
      (await prisma.journalLine.findMany({
        where: { journalEntry: { entityId: ent.id } },
        select: { accountCode: true },
        distinct: ['accountCode'],
      })).map(l => l.accountCode)
    );

    const unmovemented = accounts.filter(a => !movedAccountCodes.has(a.code));
    console.log(`Comptes sans mouvement trouvés : ${unmovemented.length}`);

    // Créer des écritures équilibrées par paires ou blocs
    const linesToInsert: Array<{ code: string; debit: number; credit: number; desc: string }> = [];

    for (let i = 0; i < unmovemented.length; i++) {
      const acc = unmovemented[i];
      const isDebitNature = acc.classNumber === 2 || acc.classNumber === 3 || acc.classNumber === 5 || acc.classNumber === 6 || (acc.classNumber === 4 && (acc.type === 'ASSET' || acc.code.startsWith('41') || acc.code.startsWith('409')));
      const amount = 5000 + (i * 150);

      if (isDebitNature) {
        linesToInsert.push({
          code: acc.code,
          debit: amount,
          credit: 0,
          desc: `Imputation opérationnelle débit ${acc.description}`,
        });
      } else {
        linesToInsert.push({
          code: acc.code,
          debit: 0,
          credit: amount,
          desc: `Imputation opérationnelle crédit ${acc.description}`,
        });
      }
    }

    // Calculer le total Débit et Crédit pour équilibrer parfaitement
    const totalD = linesToInsert.reduce((s, l) => s + l.debit, 0);
    const totalC = linesToInsert.reduce((s, l) => s + l.credit, 0);
    const diff = totalD - totalC;

    if (diff > 0) {
      // Débit supérieur : on ajoute une ligne de contrepartie créditeur sur 101000 ou 532100
      linesToInsert.push({
        code: '101000',
        debit: 0,
        credit: diff,
        desc: 'Contrepartie d’équilibre comptable des ouvertures de sous-comptes',
      });
    } else if (diff < 0) {
      // Crédit supérieur : on ajoute une ligne de contrepartie débiteur sur 532100
      linesToInsert.push({
        code: '532100',
        debit: Math.abs(diff),
        credit: 0,
        desc: 'Contrepartie d’équilibre trésorerie des ouvertures de sous-comptes',
      });
    }

    // Insérer la pièce comptable globale d'ouverture et de mouvementation
    if (linesToInsert.length > 0) {
      const entryNum = `OD-MVT-ALL-2026-${ent.code}`;
      const existing = await prisma.journalEntry.findFirst({
        where: { entryNumber: entryNum, entityId: ent.id },
      });
      if (existing) {
        await prisma.journalLine.deleteMany({ where: { journalEntryId: existing.id } });
        await prisma.journalEntry.delete({ where: { id: existing.id } });
      }

      await prisma.journalEntry.create({
        data: {
          id: randomUUID(),
          entryNumber: entryNum,
          entityId: ent.id,
          date: new Date('2026-10-15T10:00:00.000Z'),
          reference: 'MVT-INTEGRAL-SCE',
          description: 'Mouvementation intégrale de tous les sous-comptes d’actifs, passifs, charges, produits et trésorerie',
          status: 'POSTED',
          createdByUsername: 'admin',
          approvedByUsername: 'finmgr',
          postedByUsername: 'admin',
          approvedAt: new Date('2026-10-15T10:00:00.000Z'),
          postedAt: new Date('2026-10-15T10:00:00.000Z'),
          lines: {
            create: linesToInsert.map(l => ({
              id: randomUUID(),
              accountCode: l.code,
              debit: l.debit,
              credit: l.credit,
              description: l.desc,
            })),
          },
        },
      });
      console.log(`Pièce ${entryNum} créée avec ${linesToInsert.length} lignes.`);
    }
  }

  console.log('\n=== VÉRIFICATION DU RÉSULTAT ===');
}

main().catch(console.error).finally(() => (prisma as any).$disconnect());
