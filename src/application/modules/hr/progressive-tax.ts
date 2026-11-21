import type { PayrollTaxBracket } from './payroll-availability';

export interface TaxBracketDetail {
  order: number;
  rate: number;
  taxableInBracket: number;
  tax: number;
}

export function calculateProgressiveTax(
  taxableAmount: number,
  brackets: readonly PayrollTaxBracket[],
): { annualTax: number; details: TaxBracketDetail[] } {
  let annualTax = 0;
  const details: TaxBracketDetail[] = [];

  for (let index = 0; index < brackets.length; index += 1) {
    const bracket = brackets[index];
    const previousMaximum = index > 0 ? brackets[index - 1].maxAmount : null;
    const hasMillimeBoundaryGap = previousMaximum !== null
      && Math.round((bracket.minAmount - previousMaximum) * 1000) === 1;
    const lowerLimit = hasMillimeBoundaryGap ? previousMaximum : bracket.minAmount;
    if (taxableAmount < bracket.minAmount) {
      details.push({ order: bracket.order, rate: bracket.rate, taxableInBracket: 0, tax: 0 });
      continue;
    }

    const upperLimit = bracket.maxAmount === null ? taxableAmount : Math.min(taxableAmount, bracket.maxAmount);
    const taxableInBracket = Math.max(0, upperLimit - lowerLimit);
    const tax = Math.round(taxableInBracket * (bracket.rate / 100) * 1000) / 1000;
    annualTax += tax;
    details.push({ order: bracket.order, rate: bracket.rate, taxableInBracket, tax });
  }

  return { annualTax, details };
}
