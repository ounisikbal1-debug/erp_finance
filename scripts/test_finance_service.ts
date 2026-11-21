import prisma from '../src/data/prisma/client';
import FinanceService from '../src/application/modules/finance/service';

async function test() {
  const entities = await prisma.entity.findMany();
  for (const e of entities) {
    try {
      const res = await FinanceService.listJournalEntries(e.id);
      console.log('listJournalEntries OK for entity', e.name, `(${e.code})`, 'count:', res.length);
    } catch (err: any) {
      console.error('listJournalEntries FAILED for entity', e.name, `(${e.code})`, err?.message || err);
    }
  }
}

test().catch(console.error).finally(() => {
  const p = prisma as any;
  p.$disconnect();
});
