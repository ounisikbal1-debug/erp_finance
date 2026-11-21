import { validateWorkbookDocumentTemplate } from './workbook-document-templates';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readSamplePath(sample: unknown, path: string): { available: boolean; value: unknown } {
  if (!isRecord(sample)) return { available: false, value: null };
  let current: unknown = sample;
  for (const segment of path.split('.')) {
    if (!segment || ['__proto__', 'prototype', 'constructor'].includes(segment)
      || !isRecord(current)
      || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return { available: false, value: null };
    }
    current = current[segment];
  }
  return current === undefined ? { available: false, value: null } : { available: true, value: current };
}

export function buildWorkbookTaxFormPreview(documentType: string, value: unknown, sample: unknown) {
  const configuration = validateWorkbookDocumentTemplate('dgi-tax-templates', value);
  if (!('templates' in configuration)) throw new Error('La configuration fiscale est invalide.');
  const template = configuration.templates.find((entry) => entry.documentType === documentType);
  if (!template) throw new Error('Aucun gabarit n’est configuré pour ce type de document.');
  return {
    status: 'NON_OFFICIAL_PREVIEW' as const,
    documentType: template.documentType,
    templateVersion: configuration.templateVersion,
    sourceReference: configuration.sourceReference,
    fields: template.fields.map((field) => ({
      formFieldReference: field.formFieldReference,
      sourceFieldReference: field.sourceFieldReference,
      ...readSamplePath(sample, field.sourceFieldReference),
    })),
    notice: 'Aperçu local de correspondances uniquement. Ce résultat n’est ni une déclaration fiscale, ni un document officiel DGI.',
  };
}

export function buildWorkbookArabicTemplatePreview(value: unknown, sample: unknown) {
  const configuration = validateWorkbookDocumentTemplate('arabic-pdf-templates', value);
  if (!('labels' in configuration)) throw new Error('La configuration bilingue est invalide.');
  return {
    status: 'NON_OFFICIAL_PREVIEW' as const,
    templateVersion: configuration.templateVersion,
    direction: 'rtl' as const,
    numberDirection: 'ltr' as const,
    fields: configuration.labels.map((label) => ({
      fieldReference: label.fieldReference,
      fr: label.fr,
      ar: label.ar,
      ...readSamplePath(sample, label.fieldReference),
    })),
    notice: 'Aperçu de libellés RTL local uniquement; polices, pagination et conformité PDF restent à valider.',
  };
}
