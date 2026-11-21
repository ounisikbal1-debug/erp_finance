import defaultPrisma from '../src/data/prisma/client';
import { isFinancialAccountCategory, financialCategoryMatchesAccountType } from '../src/application/modules/advanced-finance/financial-categories';

async function test() {
  const entity = await defaultPrisma.entity.findFirst({ where: { code: 'TN01' } });
  if (!entity) return;
  const accounts = await defaultPrisma.chartOfAccount.findMany({
    where: { countryId: entity.countryId },
  });
  console.log(`Checking ${accounts.length} accounts for entity country ${entity.countryId}:`);
  for (const acc of accounts) {
    const isCat = isFinancialAccountCategory(acc.financialCategory);
    const matches = isCat && financialCategoryMatchesAccountType(acc.financialCategory as any, acc.type);
    if (!matches) {
      console.log(`Account ${acc.code} (${acc.type}): financialCategory='${acc.financialCategory}', isCat=${isCat}, matches=${matches}`);
    }
  }
}
test().catch(console.error).finally(() => defaultPrisma.$disconnect());
