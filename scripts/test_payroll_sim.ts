import { HrService } from '../src/application/modules/hr/service';

async function main() {
  try {
    const result = await HrService.simulatePayroll({
      baseSalary: 4580.673,
      presenceBonus: 18.668,
      transportBonus: 93.216,
      isHeadOfFamily: true,
      childrenCount: 2,
      dependentParents: 1,
      complementaryRetirementRate: 4,
      fiscalBenefitType: 'COMPLEMENTARY_RETIREMENT'
    }, 'f3a4d90d-440c-4f3c-9c56-ae72507ca6c2');
    console.log('RESULT:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('ERROR:', err);
  }
}

main();
