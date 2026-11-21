import { AdvancedFinanceService } from '../src/application/modules/advanced-finance/service';
import defaultPrisma from '../src/data/prisma/client';

async function test() {
  const entities = await defaultPrisma.entity.findMany();
  for (const entity of entities) {
    try {
      const result = await AdvancedFinanceService.getAdvancedFinancialAnalysis(entity.id);
      console.log('Analysis for', entity.name, '(', entity.code, '):');
      console.log('  postedJournalLineCount:', result.coverage.postedJournalLineCount);
      console.log('  unclassifiedJournalLineCount:', result.coverage.unclassifiedJournalLineCount);
      console.log('  unclassifiedAccountCodes:', result.coverage.unclassifiedAccountCodes);
    } catch (e: any) {
      console.log('Error for', entity.name, e?.message);
    }
  }
}
test().catch(console.error).finally(() => defaultPrisma.$disconnect());
