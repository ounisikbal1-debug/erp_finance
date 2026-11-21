import prisma from '../data/prisma/client';
import { CountryTaxRuleService } from '../application/modules/admin/country-tax-rule-service';

type RuleSeed = {
  countryCode: string;
  jurisdiction: { kind: string; code: string; name: string };
  code: string;
  name: string;
  taxType: string;
  calculationMethod: string;
  taxBase: string;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceName: string;
  sourceUrl: string;
  sourceReference: string;
  notes: string;
  appliesTo?: Record<string, unknown>;
  conditions?: Record<string, unknown>;
  rates?: Array<Record<string, unknown>>;
  thresholds?: Array<Record<string, unknown>>;
};

const retrievedAt = '2026-11-14';
const irs2025 = 'https://www.irs.gov/filing/federal-income-tax-rates-and-brackets';
const irs2026 = 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill';

function brackets(
  bounds: number[],
  percentages: number[],
  currency: string,
): Array<Record<string, unknown>> {
  return percentages.map((rateValue, index) => ({
    sequence: index + 1,
    name: `Tranche ${index + 1} (${rateValue} %)`,
    rateType: 'PERCENT',
    rateValue,
    lowerBound: bounds[index],
    upperBound: bounds[index + 1] ?? null,
    unit: 'PERCENT',
    currencyCode: currency,
  }));
}

const rules: RuleSeed[] = [];

function addUsFederalRule(
  year: 2025 | 2026,
  filingStatus: 'SINGLE' | 'MARRIED_FILING_JOINTLY',
  bounds: number[],
  percentages: number[],
): void {
  rules.push({
    countryCode: 'US',
    jurisdiction: { kind: 'FEDERAL', code: 'US-FED', name: 'États-Unis — juridiction fédérale' },
    code: `US-FED-IR-${year}-${filingStatus}`,
    name: `Impôt fédéral sur le revenu ${year} — ${filingStatus}`,
    taxType: 'PERSONAL_INCOME_TAX',
    calculationMethod: 'PROGRESSIVE',
    taxBase: 'FEDERAL_TAXABLE_INCOME',
    currencyCode: 'USD',
    effectiveFrom: `${year}-01-01`,
    effectiveTo: `${year}-12-31`,
    sourceName: 'Internal Revenue Service (IRS)',
    sourceUrl: year === 2025 ? irs2025 : irs2026,
    sourceReference: year === 2025
      ? 'Barèmes 2025; Single taxpayer et premier tableau des autres déclarants (Married Filing Jointly).'
      : 'Tax year 2026; taux marginaux et seuils Single / Married Filing Jointly.',
    notes: 'Calcul du seul impôt fédéral sur le revenu imposable. Les déductions, crédits, autres statuts de déclaration et impôts des États/localités ne sont pas inclus.',
    appliesTo: { filingStatus },
    rates: brackets(bounds, percentages, 'USD'),
  });
}

const usRates = [10, 12, 22, 24, 32, 35, 37];
addUsFederalRule(2025, 'SINGLE', [0, 11925, 48475, 103350, 197300, 250525, 626350], usRates);
addUsFederalRule(2025, 'MARRIED_FILING_JOINTLY', [0, 23850, 96950, 206700, 394600, 501050, 751600], usRates);
addUsFederalRule(2026, 'SINGLE', [0, 12400, 50400, 105700, 201775, 256225, 640600], usRates);
addUsFederalRule(2026, 'MARRIED_FILING_JOINTLY', [0, 24800, 100800, 211400, 403550, 512450, 768700], usRates);

rules.push({
  countryCode: 'FR',
  jurisdiction: { kind: 'COUNTRY', code: 'FR', name: 'France' },
  code: 'FR-IR-2025-QUOTIENT',
  name: 'Impôt sur le revenu 2025 — barème par part',
  taxType: 'PERSONAL_INCOME_TAX',
  calculationMethod: 'PROGRESSIVE',
  taxBase: 'TAXABLE_INCOME_PER_QUOTIENT_PART',
  currencyCode: 'EUR',
  effectiveFrom: '2025-01-01',
  effectiveTo: '2025-12-31',
  sourceName: 'Service-Public.fr / DILA',
  sourceUrl: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1419',
  sourceReference: 'Barème progressif applicable aux revenus de 2025, fixé par la loi de finances 2026.',
  notes: 'Base attendue : revenu imposable par part de quotient familial. Le calcul du nombre de parts, le plafonnement familial, décote et crédits ne sont pas modélisés.',
  rates: brackets([0, 11600, 29579, 84577, 181917], [0, 11, 30, 41, 45], 'EUR'),
});

rules.push({
  countryCode: 'FR',
  jurisdiction: { kind: 'COUNTRY', code: 'FR', name: 'France' },
  code: 'FR-IS-2026-NORMAL',
  name: 'Impôt sur les sociétés — taux normal 2026',
  taxType: 'CORPORATE_INCOME_TAX',
  calculationMethod: 'FLAT',
  taxBase: 'TAXABLE_PROFIT',
  currencyCode: 'EUR',
  effectiveFrom: '2026-01-01',
  sourceName: 'Entreprendre.Service-Public.fr / DILA',
  sourceUrl: 'https://entreprendre.service-public.gouv.fr/vosdroits/F23575',
  sourceReference: 'Taux normal d’impôt sur les sociétés : 25 %.',
  notes: 'Ne calcule ni retraitements fiscaux, ni déficits reportables, ni crédits.',
  rates: [{ sequence: 1, name: 'Taux normal', rateType: 'PERCENT', rateValue: 25, unit: 'PERCENT', currencyCode: 'EUR' }],
});

rules.push({
  countryCode: 'FR',
  jurisdiction: { kind: 'COUNTRY', code: 'FR', name: 'France' },
  code: 'FR-IS-2026-REDUCED',
  name: 'Impôt sur les sociétés — taux réduit sous conditions 2026',
  taxType: 'CORPORATE_INCOME_TAX',
  calculationMethod: 'PROGRESSIVE',
  taxBase: 'TAXABLE_PROFIT',
  currencyCode: 'EUR',
  effectiveFrom: '2026-01-01',
  sourceName: 'Entreprendre.Service-Public.fr / DILA',
  sourceUrl: 'https://entreprendre.service-public.gouv.fr/vosdroits/F23575',
  sourceReference: '15 % sur la première tranche jusqu’à 42 500 €, puis 25 %; conditions de chiffre d’affaires, capital libéré et détention.',
  notes: 'Le calcul n’est disponible qu’après confirmation manuelle des conditions d’éligibilité; retraitements fiscaux non modélisés.',
  conditions: { annualTurnoverMaximumEUR: 10000000, capitalFullyPaid: true, individualOwnershipMinimumPercent: 75 },
  rates: [
    { sequence: 1, name: 'Tranche réduite', rateType: 'PERCENT', rateValue: 15, lowerBound: 0, upperBound: 42500, unit: 'PERCENT', currencyCode: 'EUR' },
    { sequence: 2, name: 'Tranche normale', rateType: 'PERCENT', rateValue: 25, lowerBound: 42500, upperBound: null, unit: 'PERCENT', currencyCode: 'EUR' },
  ],
});

rules.push({
  countryCode: 'AE',
  jurisdiction: { kind: 'FEDERAL', code: 'AE-FED', name: 'Émirats arabes unis — juridiction fédérale' },
  code: 'AE-VAT-REGISTRATION-THRESHOLDS',
  name: 'Seuils d’immatriculation TVA',
  taxType: 'VALUE_ADDED_TAX',
  calculationMethod: 'THRESHOLD',
  taxBase: 'TAXABLE_SUPPLIES_IMPORTS_OR_EXPENSES',
  currencyCode: 'AED',
  effectiveFrom: '2025-01-01',
  sourceName: 'Federal Tax Authority (FTA)',
  sourceUrl: 'https://tax.gov.ae/en/taxes/Vat/vat.topics/registration.for.vat.aspx',
  sourceReference: 'Seuil obligatoire AED 375 000; seuil volontaire AED 187 500; fenêtre précédente de 12 mois ou prévision sur 30 jours.',
  notes: 'Les seuils sont enregistrés pour essais; les règles d’immatriculation ne sont pas prises en charge par le calculateur générique. La source précise que le seuil obligatoire ne s’applique pas aux entreprises étrangères.',
  thresholds: [
    { code: 'MANDATORY', name: 'Immatriculation obligatoire', comparator: 'GT', amount: 375000, unit: 'AED', currencyCode: 'AED', period: '12 mois précédents ou prévision 30 jours', conditions: { foreignBusinessesExcluded: true } },
    { code: 'VOLUNTARY', name: 'Immatriculation volontaire', comparator: 'GT', amount: 187500, unit: 'AED', currencyCode: 'AED', period: '12 mois précédents ou prévision 30 jours' },
  ],
});

async function main(): Promise<void> {
  if (process.env.SAFE_ERP_DATABASE_PROVIDER && process.env.SAFE_ERP_DATABASE_PROVIDER !== 'sqlite') {
    throw new Error('Ce chargement est limité à la base SQLite DRAFT2.');
  }
  if (process.env.SAFE_ERP_DATABASE_URL !== 'file:../data.db'
    || process.env.SAFE_ERP_TAX_RULES_CONFIRM !== 'YES') {
    throw new Error('Refusé : utilisez file:../data.db et SAFE_ERP_TAX_RULES_CONFIRM=YES.');
  }
  const actor = await prisma.user.findFirst({ select: { id: true } });
  if (!actor) throw new Error('Aucun utilisateur administrateur n’existe pour auditer l’approbation des règles.');

  let created = 0;
  let preserved = 0;
  for (const rule of rules) {
    const existing = await prisma.countryTaxRule.findFirst({
      where: { code: rule.code, jurisdiction: { country: { code: rule.countryCode } } },
      select: { id: true, effectiveFrom: true, effectiveTo: true },
    });
    if (existing) {
      if (existing.effectiveFrom.toISOString().slice(0, 10) !== rule.effectiveFrom
        || (existing.effectiveTo?.toISOString().slice(0, 10) ?? null) !== (rule.effectiveTo ?? null)) {
        throw new Error(`Une règle ${rule.code} existe avec une période différente; aucune version n’a été modifiée.`);
      }
      preserved += 1;
      continue;
    }
    const { countryCode, ...input } = rule;
    await CountryTaxRuleService.create(countryCode, {
      ...input,
      sourceRetrievedAt: retrievedAt,
    }, actor.id);
    created += 1;
  }
  process.stdout.write(JSON.stringify({ created, preserved, total: rules.length }) + '\n');
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Échec du chargement des règles fiscales sourcées : ${error instanceof Error ? error.message : 'erreur inconnue'}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
