import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

type DocumentTemplateFeature = 'dgi-tax-templates' | 'arabic-pdf-templates';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    throw new WorkbookFeatureConfigurationError('Le gabarit contient des champs absents ou non pris en charge.', 400);
  }
}

function requiredReference(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || value.trim() !== value
    || value.length < 1
    || value.length > 200
    || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) {
    throw new WorkbookFeatureConfigurationError(`${label} est invalide.`, 400);
  }
  return value;
}

function requiredHttpsReference(value: unknown) {
  if (typeof value !== 'string') {
    throw new WorkbookFeatureConfigurationError('Une référence de source HTTPS est obligatoire.', 400);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WorkbookFeatureConfigurationError('La référence de source est invalide.', 400);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new WorkbookFeatureConfigurationError('La référence de source doit être une URL HTTPS sans identifiants.', 400);
  }
  return url.toString();
}

function validateTaxTemplates(value: Record<string, unknown>) {
  exactKeys(value, ['templateVersion', 'sourceReference', 'templates', 'humanReviewRequired', 'automaticPrefill', 'exportEnabled']);
  const templateVersion = requiredReference(value.templateVersion, 'La version du gabarit');
  const sourceReference = requiredHttpsReference(value.sourceReference);
  if (value.humanReviewRequired !== true || value.automaticPrefill !== false || value.exportEnabled !== false) {
    throw new WorkbookFeatureConfigurationError('La revue humaine est obligatoire; préremplissage et export officiels restent désactivés.', 409);
  }
  if (!Array.isArray(value.templates)
    || value.templates.length === 0
    || value.templates.length > 3
    || !value.templates.every(isRecord)) {
    throw new WorkbookFeatureConfigurationError('Configurez de 1 à 3 gabarits fiscaux.', 400);
  }
  const seenDocuments = new Set<string>();
  const templates = value.templates.map((template) => {
    exactKeys(template, ['documentType', 'fields']);
    if (template.documentType !== 'G50'
      && template.documentType !== 'EMPLOYER_ANNUAL'
      && template.documentType !== 'CNSS_BORDEREAU') {
      throw new WorkbookFeatureConfigurationError('Le type de gabarit fiscal n’est pas pris en charge.', 400);
    }
    if (seenDocuments.has(template.documentType)) {
      throw new WorkbookFeatureConfigurationError('Un seul gabarit par type de déclaration est accepté.', 400);
    }
    seenDocuments.add(template.documentType);
    if (!Array.isArray(template.fields)
      || template.fields.length === 0
      || template.fields.length > 300
      || !template.fields.every(isRecord)) {
      throw new WorkbookFeatureConfigurationError('Les champs du gabarit fiscal sont invalides.', 400);
    }
    const seenFields = new Set<string>();
    const fields = template.fields.map((field) => {
      exactKeys(field, ['formFieldReference', 'sourceFieldReference']);
      const formFieldReference = requiredReference(field.formFieldReference, 'Le champ du formulaire');
      const sourceFieldReference = requiredReference(field.sourceFieldReference, 'Le champ source');
      if (seenFields.has(formFieldReference)) {
        throw new WorkbookFeatureConfigurationError('Un champ du formulaire ne peut être mappé qu’une fois.', 400);
      }
      seenFields.add(formFieldReference);
      return { formFieldReference, sourceFieldReference };
    });
    return { documentType: template.documentType, fields };
  });
  return {
    templateVersion,
    sourceReference,
    templates,
    humanReviewRequired: true as const,
    automaticPrefill: false as const,
    exportEnabled: false as const,
  };
}

function validateBilingualTemplates(value: Record<string, unknown>) {
  exactKeys(value, [
    'templateVersion',
    'sourceReference',
    'labels',
    'rtlArabic',
    'latinNumbersLtr',
    'humanReviewRequired',
    'renderingEnabled',
  ]);
  const templateVersion = requiredReference(value.templateVersion, 'La version du gabarit bilingue');
  const sourceReference = requiredHttpsReference(value.sourceReference);
  if (value.rtlArabic !== true || value.latinNumbersLtr !== true || value.humanReviewRequired !== true) {
    throw new WorkbookFeatureConfigurationError('Le gabarit doit préserver RTL arabe, chiffres latins LTR et revue humaine.', 400);
  }
  if (value.renderingEnabled !== false) {
    throw new WorkbookFeatureConfigurationError('Le rendu PDF reste désactivé tant que le gabarit et les polices ne sont pas validés.', 409);
  }
  if (!Array.isArray(value.labels)
    || value.labels.length === 0
    || value.labels.length > 500
    || !value.labels.every(isRecord)) {
    throw new WorkbookFeatureConfigurationError('Les libellés bilingues sont invalides.', 400);
  }
  const seen = new Set<string>();
  const labels = value.labels.map((label) => {
    exactKeys(label, ['fieldReference', 'fr', 'ar']);
    const fieldReference = requiredReference(label.fieldReference, 'La référence du champ');
    if (seen.has(fieldReference)
      || typeof label.fr !== 'string'
      || !label.fr.trim()
      || label.fr.length > 500
      || typeof label.ar !== 'string'
      || !label.ar.trim()
      || label.ar.length > 500) {
      throw new WorkbookFeatureConfigurationError('Chaque champ doit avoir un libellé français et arabe unique.', 400);
    }
    seen.add(fieldReference);
    return { fieldReference, fr: label.fr, ar: label.ar };
  });
  return {
    templateVersion,
    sourceReference,
    labels,
    rtlArabic: true as const,
    latinNumbersLtr: true as const,
    humanReviewRequired: true as const,
    renderingEnabled: false as const,
  };
}

export function validateWorkbookDocumentTemplate(feature: DocumentTemplateFeature, input: unknown) {
  if (!isRecord(input)) {
    throw new WorkbookFeatureConfigurationError('La configuration de gabarit doit être un objet.', 400);
  }
  return feature === 'dgi-tax-templates' ? validateTaxTemplates(input) : validateBilingualTemplates(input);
}
