export const tunisianWithholdingCategories = [
  'honoraires_residents',
  'honoraires_non_residents',
  'honoraires_reel',
  'honoraires_forfaitaire',
  'architectes_ingenieurs_conseils',
  'artistes_sportifs',
  'commissions_courtage',
  'distributeurs_telecom',
  'loyers_batis_non_batis_materiel',
  'location_hotels',
  'location_materiel',
  'dividendes',
  'interets_depots_comptes_courants',
  'obligations_titres_assimiles',
  'jetons_presence',
  'achats',
  'livraisons_sans_carte_fiscale',
  'livraisons_avec_carte_fiscale',
  'paiements_etranger',
  'transport_domicile_travail',
] as const;

export type TunisianWithholdingCategory = typeof tunisianWithholdingCategories[number];
export type ForeignTreatyReview = 'unreviewed' | 'no_adjustment' | 'adjusted_rate';
export type WithholdingDeclarantType = 'PERSONNE_PHYSIQUE' | 'PERSONNE_MORALE';
type CalculationStatus = 'CALCULATED' | 'NOT_APPLICABLE' | 'UNAVAILABLE';

export const tunisianWithholdingRuleProvenance = {
  source: 'Documentation tunisienne déclarée validée par un expert-comptable du client',
  sourceDate: null,
  sourceDateStatus: 'Date de transmission non conservée dans les données disponibles',
  validationStatus: 'Validation métier déclarée par le propriétaire; correspondance et exécution dans SAFE non vérifiées ici',
} as const;

export const tunisianWithholdingRuleCatalog = [
  { category: 'honoraires_residents', label: 'Honoraires — résident', rates: [15] },
  { category: 'honoraires_non_residents', label: 'Honoraires — non-résident (statut/convention à préciser)', rates: [15, 25] },
  { category: 'honoraires_reel', label: 'Honoraires — régime réel (barème antérieur en conflit)', rates: [3, 15] },
  { category: 'honoraires_forfaitaire', label: 'Honoraires — forfaitaire (barème antérieur en conflit)', rates: [10, 15] },
  { category: 'architectes_ingenieurs_conseils', label: 'Architectes / ingénieurs-conseils (barème antérieur en conflit)', rates: [10, 15] },
  { category: 'artistes_sportifs', label: 'Artistes / sportifs (barème antérieur en conflit)', rates: [5, 15] },
  { category: 'commissions_courtage', label: 'Commissions / courtage (barème antérieur en conflit)', rates: [10, 15] },
  { category: 'distributeurs_telecom', label: 'Distributeurs télécoms — sélectionner le taux du régime', rates: [1, 1.5] },
  { category: 'loyers_batis_non_batis_materiel', label: 'Loyers — bâtis / non bâtis / matériel', rates: [15] },
  { category: 'location_hotels', label: 'Loyers — hôtels (barème antérieur en conflit)', rates: [5, 15] },
  { category: 'location_materiel', label: 'Location de matériel (barèmes contradictoires — sélectionner)', rates: [1, 1.5, 15] },
  { category: 'dividendes', label: 'Dividendes', rates: [10] },
  { category: 'interets_depots_comptes_courants', label: 'Intérêts — dépôts / comptes courants', rates: [20] },
  { category: 'obligations_titres_assimiles', label: 'Obligations / titres assimilés', rates: [20] },
  { category: 'jetons_presence', label: 'Jetons de présence', rates: [20] },
  { category: 'achats', label: 'Achats — seuil et taux RS sélectionnable', rates: [0.5, 1, 1.5, 15] },
  { category: 'livraisons_sans_carte_fiscale', label: 'Livraisons — sans carte fiscale', rates: [3] },
  { category: 'livraisons_avec_carte_fiscale', label: 'Livraisons — carte fiscale, seuil et taux à sélectionner', rates: [0.5, 1, 1.5] },
  { category: 'paiements_etranger', label: 'Paiements à l’étranger — vérifier les conventions', rates: [20] },
  { category: 'transport_domicile_travail', label: 'Transport domicile-travail fourni par l’employeur — exemption annoncée dès 2026', rates: [0] },
] as const satisfies readonly {
  category: TunisianWithholdingCategory;
  label: string;
  rates: readonly number[];
}[];

export interface TunisianWithholdingInput {
  period: string;
  category: TunisianWithholdingCategory;
  amountTtc: number;
  declarantType?: WithholdingDeclarantType;
  isEmployer?: boolean;
  supplierFiscalIdPresent?: boolean;
  selectedRate?: number;
  foreignTreatyReview?: ForeignTreatyReview;
  treatyAdjustedRate?: number;
}

export interface TunisianWithholdingResult {
  period: string;
  category: TunisianWithholdingCategory;
  status: CalculationStatus;
  declarantType: WithholdingDeclarantType | null;
  currency: 'TND';
  baseTtc: number | null;
  rate: number | null;
  amount: number | null;
  monthlyDeclarationDueDate: string | null;
  annualDeclarationDueDate: string | null;
  ruleBasis: 'USER_REPORTED_EXPERT_VALIDATION_IMPLEMENTATION_UNVERIFIED';
  ruleProvenance: {
    source: string;
    sourceDate: string | null;
    sourceDateStatus: string;
    effectiveFrom: string | null;
    validationStatus: string;
  };
  certificate: {
    required: boolean | null;
    recipient: 'supplier' | null;
    status: 'PREPARATION_AVAILABLE' | 'NOT_REQUIRED' | 'UNAVAILABLE';
  };
  diagnostics: string[];
  correctionActions: string[];
}

export class WithholdingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WithholdingInputError';
  }
}

export function parseTunisianWithholdingInput(value: unknown): TunisianWithholdingInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WithholdingInputError('Les paramètres de retenue doivent former un objet.');
  }
  const input = value as Record<string, unknown>;
  const supplierFiscalIdPresent = input.supplierFiscalIdPresent;
  const selectedRate = input.selectedRate;
  const isEmployer = input.isEmployer;
  const declarantType = input.declarantType;
  const foreignTreatyReview = input.foreignTreatyReview;
  const treatyAdjustedRate = input.treatyAdjustedRate;
  const allowedFields = [
    'period',
    'category',
    'amountTtc',
    'declarantType',
    'isEmployer',
    'supplierFiscalIdPresent',
    'selectedRate',
    'foreignTreatyReview',
    'treatyAdjustedRate',
  ];
  const unknownFields = Object.keys(input).filter((field) => !allowedFields.includes(field));
  if (unknownFields.length > 0) {
    throw new WithholdingInputError(`Paramètres de retenue inconnus : ${unknownFields.join(', ')}.`);
  }
  if (typeof input.period !== 'string'
    || !tunisianWithholdingCategories.includes(input.category as TunisianWithholdingCategory)
    || typeof input.amountTtc !== 'number') {
    throw new WithholdingInputError('Période, catégorie de retenue TN et base TTC numérique sont obligatoires.');
  }
  if (supplierFiscalIdPresent !== undefined && typeof supplierFiscalIdPresent !== 'boolean') {
    throw new WithholdingInputError('La présence du matricule fiscal fournisseur doit être booléenne.');
  }
  if (selectedRate !== undefined && typeof selectedRate !== 'number') {
    throw new WithholdingInputError('selectedRate doit être numérique.');
  }
  if (treatyAdjustedRate !== undefined && typeof treatyAdjustedRate !== 'number') {
    throw new WithholdingInputError('treatyAdjustedRate doit être numérique.');
  }
  if (foreignTreatyReview !== undefined
    && !['unreviewed', 'no_adjustment', 'adjusted_rate'].includes(String(foreignTreatyReview))) {
    throw new WithholdingInputError('Le statut d’examen de convention fiscale est invalide.');
  }
  if (declarantType !== undefined
    && declarantType !== 'PERSONNE_PHYSIQUE'
    && declarantType !== 'PERSONNE_MORALE') {
    throw new WithholdingInputError('Le type de déclarant doit être personne physique ou personne morale.');
  }
  if (isEmployer !== undefined && typeof isEmployer !== 'boolean') {
    throw new WithholdingInputError('Le statut employeur doit être booléen.');
  }
  return {
    period: input.period,
    category: input.category as TunisianWithholdingCategory,
    amountTtc: input.amountTtc,
    declarantType: declarantType as WithholdingDeclarantType | undefined,
    isEmployer: isEmployer as boolean | undefined,
    supplierFiscalIdPresent: supplierFiscalIdPresent as boolean | undefined,
    selectedRate: selectedRate as number | undefined,
    foreignTreatyReview: foreignTreatyReview as ForeignTreatyReview | undefined,
    treatyAdjustedRate: treatyAdjustedRate as number | undefined,
  };
}

const fixedRates: Partial<Record<TunisianWithholdingCategory, number>> = {
  honoraires_residents: 15,
  loyers_batis_non_batis_materiel: 15,
  dividendes: 10,
  interets_depots_comptes_courants: 20,
  obligations_titres_assimiles: 20,
  jetons_presence: 20,
  livraisons_sans_carte_fiscale: 3,
};

const variableRates: Partial<Record<TunisianWithholdingCategory, readonly number[]>> = {
  honoraires_non_residents: [15, 25],
  honoraires_reel: [3, 15],
  honoraires_forfaitaire: [10, 15],
  architectes_ingenieurs_conseils: [10, 15],
  artistes_sportifs: [5, 15],
  commissions_courtage: [10, 15],
  distributeurs_telecom: [1, 1.5],
  location_hotels: [5, 15],
  location_materiel: [1, 1.5, 15],
  livraisons_avec_carte_fiscale: [0.5, 1, 1.5],
};

const mandatoryValidationAction =
  'Faites confirmer la règle et ses conditions d’application par une source fiscale compétente avant de l’utiliser pour une déclaration.';

function getRuleProvenance(category: TunisianWithholdingCategory) {
  return {
    ...tunisianWithholdingRuleProvenance,
    effectiveFrom: category === 'transport_domicile_travail' ? '2026-01' : null,
  };
}

function isValidPeriod(period: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return false;
  const [year, month] = period.split('-').map(Number);
  return year >= 1900 && year <= 9998 && month >= 1 && month <= 12;
}

function getMonthlyDueDate(period: string, declarantType: WithholdingDeclarantType): string {
  const [year, month] = period.split('-').map(Number);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const day = declarantType === 'PERSONNE_PHYSIQUE' ? 15 : 28;
  return `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getAnnualDueDate(period: string): string {
  const [year] = period.split('-').map(Number);
  return `${year + 1}-02-27`;
}

function isValidTtcAmount(amount: number): boolean {
  const millimes = Math.round(amount * 1000);
  return Number.isFinite(amount)
    && amount >= 0
    && Number.isSafeInteger(millimes)
    && Math.abs(amount * 1000 - millimes) <= 1e-7;
}

function isValidRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0 && rate <= 100;
}

function roundToMillimes(amount: number): number | null {
  const millimes = Math.round(amount * 1000);
  return Number.isSafeInteger(millimes) ? millimes / 1000 : null;
}

function unavailable(
  input: TunisianWithholdingInput,
  diagnostics: string[],
  correctionActions: string[],
  validPeriod: boolean,
  validAmount: boolean,
): TunisianWithholdingResult {
  return {
    period: input.period,
    category: input.category,
    status: 'UNAVAILABLE',
    declarantType: input.declarantType ?? null,
    currency: 'TND',
    baseTtc: validAmount ? input.amountTtc : null,
    rate: null,
    amount: null,
    monthlyDeclarationDueDate: validPeriod && input.declarantType
      ? getMonthlyDueDate(input.period, input.declarantType)
      : null,
    annualDeclarationDueDate: validPeriod && input.isEmployer === true ? getAnnualDueDate(input.period) : null,
    ruleBasis: 'USER_REPORTED_EXPERT_VALIDATION_IMPLEMENTATION_UNVERIFIED',
    ruleProvenance: getRuleProvenance(input.category),
    certificate: { required: null, recipient: null, status: 'UNAVAILABLE' },
    diagnostics,
    correctionActions: [...correctionActions, mandatoryValidationAction],
  };
}

export function calculateTunisianWithholding(input: TunisianWithholdingInput): TunisianWithholdingResult {
  const validPeriod = isValidPeriod(input.period);
  const validAmount = isValidTtcAmount(input.amountTtc);
  const diagnostics: string[] = [];
  const correctionActions: string[] = [];

  if (!validPeriod) {
    diagnostics.push('Période invalide : fournissez une période au format AAAA-MM.');
    correctionActions.push('Corrigez la période de rattachement avant de calculer les échéances.');
  }
  if (!validAmount) {
    diagnostics.push('Base TTC invalide : le montant doit être positif ou nul, fini et exprimé au millime.');
    correctionActions.push('Vérifiez le montant TTC sur la pièce justificative et fournissez une valeur au millime.');
  }
  if (!validPeriod || !validAmount) {
    return unavailable(input, diagnostics, correctionActions, validPeriod, validAmount);
  }
  if (!input.declarantType) {
    diagnostics.push('Type de déclarant non précisé : échéance mensuelle non calculée.');
    correctionActions.push('Précisez personne physique (J+15) ou personne morale (J+28) pour déterminer l’échéance mensuelle.');
  }
  if (input.isEmployer === undefined) {
    diagnostics.push('Statut employeur non précisé : échéance annuelle non calculée.');
    correctionActions.push('Confirmez si l’obligé est employeur avant de retenir l’échéance annuelle indiquée pour les employeurs.');
  }

  let rate: number | null = fixedRates[input.category] ?? null;
  let noWithholdingApplies = false;

  if (input.category === 'transport_domicile_travail') {
    const [year] = input.period.split('-').map(Number);
    if (input.isEmployer !== true) {
      diagnostics.push('Le statut d’employeur fournissant le transport domicile-travail n’est pas confirmé.');
      correctionActions.push('Confirmez que le transport est fourni par l’employeur avant d’appliquer l’exemption indiquée.');
    } else if (year >= 2026) {
      noWithholdingApplies = true;
      rate = 0;
      diagnostics.push('Exemption transport domicile-travail fournie pour 2026 et après; liste des trois moyens non fournie pour vérification.');
    } else {
      diagnostics.push('Aucune règle de retenue transport avant 2026 n’est fournie.');
      correctionActions.push('Faites confirmer le traitement du transport pour la période concernée.');
    }
  } else if (input.category === 'livraisons_avec_carte_fiscale') {
    if (input.supplierFiscalIdPresent !== true) {
      diagnostics.push('Présence de la carte fiscale requise pour cette catégorie, mais non confirmée.');
      correctionActions.push('Vérifiez et confirmez la carte fiscale du bénéficiaire avant de sélectionner un taux.');
    } else if (input.amountTtc < 1000) {
      diagnostics.push('La règle fournie pour les livraisons avec carte fiscale ne couvre que les montants TTC à partir de 1 000 TND.');
      correctionActions.push('Faites confirmer le traitement des livraisons avec carte fiscale sous le seuil.');
    } else if (input.selectedRate !== undefined && [0.5, 1, 1.5].includes(input.selectedRate)) {
      rate = input.selectedRate;
    } else {
      diagnostics.push('Taux RS de livraison avec carte fiscale non précisé parmi les valeurs proposées (0,5%, 1% ou 1,5%).');
      correctionActions.push('Faites confirmer puis sélectionnez le taux RS applicable; aucun taux n’est sélectionné automatiquement.');
    }
  } else if (variableRates[input.category]) {
    const allowedRates = variableRates[input.category] ?? [];
    if (input.selectedRate === undefined || !allowedRates.includes(input.selectedRate)) {
      diagnostics.push(`Taux ambigu pour ${input.category} : sélectionnez explicitement ${allowedRates.join('% ou ')}%.`);
      correctionActions.push('Faites confirmer puis sélectionnez le taux RS applicable à cette catégorie; aucun taux n’est sélectionné automatiquement.');
    } else {
      rate = input.selectedRate;
    }
  } else if (input.category === 'achats') {
    if (input.amountTtc < 1000) {
      noWithholdingApplies = true;
      rate = 0;
      diagnostics.push('Achat inférieur au seuil TTC de 1 000 TND fourni : aucune retenue calculée.');
    } else if (input.supplierFiscalIdPresent === undefined) {
      diagnostics.push('Présence du matricule fiscal fournisseur inconnue; le taux achat ne peut pas être sélectionné.');
      correctionActions.push('Vérifiez le matricule fiscal du fournisseur sur une pièce justificative.');
    } else if (!input.supplierFiscalIdPresent) {
      rate = 15;
    } else if ([0.5, 1, 1.5].includes(input.selectedRate ?? Number.NaN)) {
      rate = input.selectedRate ?? null;
    } else {
      diagnostics.push('Taux RS applicable aux achats avec matricule fiscal non sélectionné parmi les taux fournis (0,5%, 1% ou 1,5%).');
      correctionActions.push('Faites confirmer puis sélectionnez le taux RS applicable; aucun taux n’est sélectionné automatiquement.');
    }
  } else if (input.category === 'paiements_etranger') {
    if (input.foreignTreatyReview === 'unreviewed' || input.foreignTreatyReview === undefined) {
      diagnostics.push('Paiement à l’étranger : application d’une convention fiscale non évaluée.');
      correctionActions.push('Faites vérifier l’existence et l’effet d’une convention fiscale avant de sélectionner un taux.');
    } else if (input.foreignTreatyReview === 'adjusted_rate') {
      if (input.treatyAdjustedRate === undefined || !isValidRate(input.treatyAdjustedRate)) {
        diagnostics.push('Le taux conventionnel ajusté n’est pas fourni ou est invalide.');
        correctionActions.push('Saisissez le taux conventionnel validé par une source compétente.');
      } else {
        rate = input.treatyAdjustedRate;
      }
    } else {
      rate = 20;
    }
  } else if (rate === null) {
    diagnostics.push('Catégorie de retenue inconnue ou non prise en charge.');
    correctionActions.push('Sélectionnez une catégorie figurant dans le référentiel de retenue TN fourni.');
  }

  if (rate === null) {
    return unavailable(input, diagnostics, correctionActions, validPeriod, validAmount);
  }

  const amount = roundToMillimes(input.amountTtc * rate / 100);
  if (amount === null) {
    return unavailable(
      input,
      ['Montant calculé hors de la précision entière sûre au millime.'],
      ['Vérifiez la base TTC et fractionnez le rapprochement selon les pièces justificatives.'],
      validPeriod,
      validAmount,
    );
  }

  const requiredCertificate = !noWithholdingApplies && amount > 0;
  diagnostics.push('Les règles tunisiennes sont déclarées validées par un expert-comptable; leur correspondance et leur exécution dans SAFE restent à vérifier.');
  if (requiredCertificate) {
    diagnostics.push('Certificat opérationnel à remettre au fournisseur; l’émission enregistrée ne constitue pas une certification réglementaire.');
    correctionActions.push('Rapprochez la pièce source, préparez puis émettez le certificat interne avec un utilisateur habilité, et faites contrôler sa conformité avant remise.');
  }
  if (!noWithholdingApplies && amount > 0) {
    diagnostics.push('Pénalité de 0,75% par mois ou fraction fournie en référentiel; aucun montant calculé sans échéance et date de paiement vérifiées.');
  }

  return {
    period: input.period,
    category: input.category,
    status: noWithholdingApplies ? 'NOT_APPLICABLE' : 'CALCULATED',
    declarantType: input.declarantType ?? null,
    currency: 'TND',
    baseTtc: input.amountTtc,
    rate,
    amount,
    monthlyDeclarationDueDate: input.declarantType ? getMonthlyDueDate(input.period, input.declarantType) : null,
    annualDeclarationDueDate: input.isEmployer === true ? getAnnualDueDate(input.period) : null,
    ruleBasis: 'USER_REPORTED_EXPERT_VALIDATION_IMPLEMENTATION_UNVERIFIED',
    ruleProvenance: getRuleProvenance(input.category),
    certificate: {
      required: requiredCertificate,
      recipient: requiredCertificate ? 'supplier' : null,
      status: requiredCertificate ? 'PREPARATION_AVAILABLE' : 'NOT_REQUIRED',
    },
    diagnostics,
    correctionActions: [...correctionActions, mandatoryValidationAction],
  };
}
