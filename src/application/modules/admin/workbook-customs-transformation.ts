import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function reference(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || value.trim() !== value
    || value.length < 1
    || value.length > 200
    || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) {
    throw new WorkbookFeatureConfigurationError(`${label} est invalide.`, 400);
  }
  return value;
}

export function validateWorkbookCustomsTransformationConfiguration(value: unknown) {
  if (!isRecord(value)) {
    throw new WorkbookFeatureConfigurationError('La politique de taux de transformation doit être un objet.', 400);
  }
  const expectedKeys = [
    'formulaReference',
    'sourceReference',
    'inputFields',
    'resultFieldReference',
    'resultUnitReference',
    'manualReviewRequired',
    'calculationEnabled',
    'declarationExportEnabled',
  ];
  const keys = Object.keys(value);
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    throw new WorkbookFeatureConfigurationError('La politique douanière contient des champs absents ou non pris en charge.', 400);
  }
  const formulaReference = reference(value.formulaReference, 'La référence de formule');
  const sourceReference = reference(value.sourceReference, 'La référence de source');
  const resultFieldReference = reference(value.resultFieldReference, 'Le champ résultat');
  const resultUnitReference = reference(value.resultUnitReference, 'L’unité résultat');
  if (value.manualReviewRequired !== true) {
    throw new WorkbookFeatureConfigurationError('Une revue humaine est obligatoire pour la formule douanière.', 400);
  }
  if (value.calculationEnabled !== false || value.declarationExportEnabled !== false) {
    throw new WorkbookFeatureConfigurationError('Le calcul et l’export de déclaration restent désactivés tant que la règle n’est pas validée.', 409);
  }
  if (!Array.isArray(value.inputFields)
    || value.inputFields.length < 2
    || value.inputFields.length > 100
    || !value.inputFields.every(isRecord)) {
    throw new WorkbookFeatureConfigurationError('La formule doit référencer au moins deux champs d’entrée explicites.', 400);
  }
  const seen = new Set<string>();
  const inputFields = value.inputFields.map((field) => {
    const fieldKeys = Object.keys(field);
    if (fieldKeys.length !== 2 || fieldKeys.some((key) => !['fieldReference', 'unitReference'].includes(key))) {
      throw new WorkbookFeatureConfigurationError('Un champ d’entrée contient des paramètres non pris en charge.', 400);
    }
    const fieldReference = reference(field.fieldReference, 'Le champ d’entrée');
    const unitReference = reference(field.unitReference, 'L’unité du champ d’entrée');
    if (seen.has(fieldReference)) {
      throw new WorkbookFeatureConfigurationError('Un champ d’entrée ne peut être déclaré qu’une fois.', 400);
    }
    seen.add(fieldReference);
    return { fieldReference, unitReference };
  });
  if (seen.has(resultFieldReference)) {
    throw new WorkbookFeatureConfigurationError('Le champ résultat doit être distinct des champs d’entrée.', 400);
  }
  return {
    formulaReference,
    sourceReference,
    inputFields,
    resultFieldReference,
    resultUnitReference,
    manualReviewRequired: true as const,
    calculationEnabled: false as const,
    declarationExportEnabled: false as const,
  };
}
