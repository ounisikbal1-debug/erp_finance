import { HrRequestError } from './errors';

export interface ConfiguredPayrollRubrique {
  id: string;
  code: string;
  category: string;
}

export function normalizePayrollCountryCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z]{2,3}$/.test(value.trim())) {
    throw new HrRequestError('Le code pays est obligatoire et doit contenir deux ou trois lettres.', 400);
  }
  return value.trim().toUpperCase();
}

export function mergePayrollRubriquesForCountry(
  countryCode: string,
  countryRubriques: readonly ConfiguredPayrollRubrique[],
  legacyRubriques: readonly ConfiguredPayrollRubrique[],
): ConfiguredPayrollRubrique[] {
  const rubriques = new Map<string, ConfiguredPayrollRubrique>();
  if (countryCode.toUpperCase() === 'TN') {
    for (const rubrique of legacyRubriques) rubriques.set(rubrique.code.toUpperCase(), rubrique);
  }
  for (const rubrique of countryRubriques) rubriques.set(rubrique.code.toUpperCase(), rubrique);
  return [...rubriques.values()];
}
