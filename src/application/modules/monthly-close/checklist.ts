import { FinanceRequestError } from '../finance/errors';

export const MONTHLY_CLOSE_CHECKS = [
  {
    key: 'journal-workflow',
    title: 'Revoir et traiter les écritures de la période',
    source: 'SAFE : écritures en attente de validation',
  },
  {
    key: 'bank-reconciliation',
    title: 'Achever les rapprochements bancaires',
    source: 'SAFE : lignes de relevé non rapprochées',
  },
  {
    key: 'receivables-review',
    title: 'Vérifier les créances, encaissements et provisions',
    source: 'Contrôle manuel requis; SAFE ne possède pas de statut de clôture pour ce contrôle.',
  },
  {
    key: 'payables-review',
    title: 'Vérifier les dettes fournisseurs et factures à recevoir',
    source: 'Contrôle manuel requis; SAFE ne possède pas de statut de clôture pour ce contrôle.',
  },
  {
    key: 'tax-payroll-review',
    title: 'Vérifier les déclarations fiscales et éléments de paie',
    source: 'Contrôle manuel requis; SAFE ne confirme pas le dépôt ni la conformité réglementaire.',
  },
  {
    key: 'intercompany-review',
    title: 'Vérifier et justifier les écarts intercompagnies',
    source: 'Contrôle manuel requis; aucun statut intercompagnie de clôture fiable n’est disponible.',
  },
  {
    key: 'reporting-archive',
    title: 'Vérifier les états de clôture et archiver le dossier',
    source: 'Contrôle manuel requis; SAFE ne confirme pas l’archivage externe.',
  },
] as const;

export const ANNUAL_CLOSE_CHECKS = [
  {
    key: 'annual-inventory-review',
    title: 'Réaliser et justifier l’inventaire annuel',
    source: 'Contrôle manuel requis; SAFE ne possède pas de statut d’inventaire physique.',
  },
  {
    key: 'annual-cutoff-review',
    title: 'Vérifier le cut-off annuel et les charges/produits à rattacher',
    source: 'Contrôle manuel requis; aucune certification automatique du cut-off.',
  },
  {
    key: 'annual-fixed-assets-review',
    title: 'Réviser les immobilisations, amortissements et dépréciations',
    source: 'Contrôle manuel requis; SAFE ne confirme pas l’exhaustivité des actifs.',
  },
  {
    key: 'annual-tax-statements-review',
    title: 'Préparer et faire vérifier les états annuels et déclarations fiscales',
    source: 'Contrôle manuel requis; les états SAFE ne sont pas certifiés ni déposés automatiquement.',
  },
  {
    key: 'annual-intercompany-review',
    title: 'Rapprocher les soldes intercompagnies et documenter les éliminations',
    source: 'Contrôle manuel requis; aucune élimination ou consolidation annuelle n’est déclenchée.',
  },
  {
    key: 'annual-next-budget-review',
    title: 'Faire approuver le budget de l’exercice suivant',
    source: 'Contrôle manuel requis; aucune approbation budgétaire n’est effectuée par cette checklist.',
  },
  {
    key: 'annual-archive-review',
    title: 'Vérifier le dossier de clôture et son archivage',
    source: 'Contrôle manuel requis; SAFE ne confirme pas l’archivage externe.',
  },
] as const;

export type MonthlyCloseCheckKey = (typeof MONTHLY_CLOSE_CHECKS)[number]['key'];
export type AnnualCloseCheckKey = (typeof ANNUAL_CLOSE_CHECKS)[number]['key'];
export type CloseCheckKey = MonthlyCloseCheckKey | AnnualCloseCheckKey;

export function parseMonthlyClosePeriod(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}(?:-(0[1-9]|1[0-2]))?$/.test(value)) {
    throw new FinanceRequestError('La période doit être au format AAAA-MM ou AAAA.', 400);
  }
  return value;
}

export function isAnnualClosePeriod(period: string): boolean {
  return /^\d{4}$/.test(period);
}

export function getCloseChecks(period: string) {
  return isAnnualClosePeriod(period) ? ANNUAL_CLOSE_CHECKS : MONTHLY_CLOSE_CHECKS;
}

export function getMonthlyCloseCheckKey(value: unknown, period: string): CloseCheckKey {
  const checks = getCloseChecks(period);
  if (typeof value !== 'string'
    || !checks.some((check) => check.key === value)) {
    throw new FinanceRequestError('Le contrôle de clôture demandé est invalide.', 400);
  }
  return value as CloseCheckKey;
}

export function validateMonthlyCloseUpdate(value: unknown) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new FinanceRequestError('Les données de validation sont invalides.', 400);
  }
  const body = value as Record<string, unknown>;
  if (typeof body.checked !== 'boolean') {
    throw new FinanceRequestError('Le statut checked doit être booléen.', 400);
  }
  if (typeof body.note !== 'string' || body.note.trim().length < 5 || body.note.trim().length > 500) {
    throw new FinanceRequestError('Une note de contrôle de 5 à 500 caractères est obligatoire.', 400);
  }
  return { checked: body.checked, note: body.note.trim() };
}

export function validateCloseLockNote(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 500) {
    throw new FinanceRequestError('Une note de clôture de 5 à 500 caractères est obligatoire.', 400);
  }
  return value.trim();
}
