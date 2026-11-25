import prisma from '../src/data/prisma/client';
import { OperationalInsightsService } from '../src/application/modules/ai/operational-insights';

async function test() {
  const tn01 = await prisma.entity.findFirst({ where: { code: 'TN01' } });
  if (!tn01) throw new Error('TN01 not found');
  const snap = await OperationalInsightsService.getSnapshot(tn01.id);
  console.log('Snapshot result:', snap);
}

test().catch(console.error).finally(() => (prisma as any).$disconnect());
