import { BudgetService } from '../src/application/modules/budget/service';
import defaultPrisma from '../src/data/prisma/client';

async function test() {
  const entities = await defaultPrisma.entity.findMany();
  for (const ent of entities) {
    if (ent.code !== 'TN01' && ent.code !== 'SAFE-TN-001') continue;
    try {
      const data = await BudgetService.getModuleData(ent.id, '2026-11');
      console.log(`BudgetData for ${ent.name} (${ent.code}):`);
      console.log('  Accounts count:', data.accounts.length);
      console.log('  Lines count:', data.lines.length);
      console.log('  Expense Budget:', data.totals.expenseBudget);
      console.log('  Expense Actual:', data.totals.expenseActual);
      console.log('  Expense Variance:', data.totals.expenseVariance);
      console.log('  Revenue Budget:', data.totals.revenueBudget);
      console.log('  Revenue Actual:', data.totals.revenueActual);
      console.log('  Revenue Variance:', data.totals.revenueVariance);
      console.log('  Diagnostics:', data.diagnostics);
      if (data.lines.length > 0) {
        console.log('  Sample lines:');
        for (const l of data.lines.slice(0, 5)) {
          console.log(`    - [${l.accountCode}] ${l.description} | Budget: ${l.amount} | Actual: ${l.actual} | Statut: ${l.status}`);
        }
      }
    } catch (e: any) {
      console.error(`Error for ${ent.name}:`, e?.message);
    }
  }
}

test().catch(console.error).finally(() => defaultPrisma.$disconnect());
