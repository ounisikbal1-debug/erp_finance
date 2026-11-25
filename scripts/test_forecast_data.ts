import { prisma } from '../src/data/prisma/client';
import { CashflowForecastService } from '../src/application/modules/cashflow/forecast-service';

async function test() {
  const scenarios = await prisma.cashflowForecastScenario.findMany();
  console.log('Scenarios count:', scenarios.length);
  for (const sc of scenarios) {
    console.log('Testing scenario:', sc.id, sc.name, 'entity:', sc.entityId);
    try {
      const data = await CashflowForecastService.getScenarioData(sc.id, sc.entityId, 30);
      console.log('Returned data keys:', Object.keys(data));
      console.log('Diagnostics:', data.diagnostics);
      console.log('Opening balance:', data.openingBalance);
      console.log('Days count:', data.days?.length);
      console.log('Sample day:', data.days?.[0]);
      console.log('Items count:', data.items?.length);
      console.log('Sources count:', data.sources?.length);
      if (data.sources?.length > 0) {
        console.log('Sample source:', data.sources[0]);
      }
    } catch (err) {
      console.error('Error on scenario:', err);
    }
  }
}
test().catch(console.error).finally(() => prisma.$disconnect());
