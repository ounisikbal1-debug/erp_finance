import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

const ALLOWED_TEMPLATE_FIELDS = new Set([
  'customerName',
  'invoiceNumber',
  'dueDate',
  'daysOverdue',
  'outstandingAmount',
  'currencyCode',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validateTemplateText(value: unknown, maximum: number, label: string): value is string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > maximum) {
    throw new WorkbookFeatureConfigurationError(`${label} est invalide.`, 400);
  }
  const placeholders = value.match(/\{[^{}]*\}/g) ?? [];
  if (placeholders.some((placeholder) => !ALLOWED_TEMPLATE_FIELDS.has(placeholder.slice(1, -1)))) {
    throw new WorkbookFeatureConfigurationError(`${label} contient un champ de modèle non pris en charge.`, 400);
  }
  return true;
}

export function validateWorkbookCrmReminderConfiguration(value: unknown) {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ['timeZone', 'localTime', 'cadence', 'dayOfWeek', 'overdueDays', 'templates', 'deliveryMode'])
    || typeof value.timeZone !== 'string'
    || typeof value.localTime !== 'string'
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.localTime)
    || !['DAILY', 'WEEKLY'].includes(value.cadence as string)
    || value.deliveryMode !== 'DRAFT_ONLY'
    || !Array.isArray(value.overdueDays)
    || value.overdueDays.length === 0
    || value.overdueDays.length > 30
    || !Array.isArray(value.templates)
    || value.templates.length !== value.overdueDays.length) {
    throw new WorkbookFeatureConfigurationError('La politique de relance doit définir un horaire, une cadence, des échéances et une préparation en brouillon.', 400);
  }
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: value.timeZone }).format(new Date(0));
  } catch {
    throw new WorkbookFeatureConfigurationError('Le fuseau horaire de la politique est invalide.', 400);
  }
  if ((value.cadence === 'WEEKLY'
    && (!Number.isInteger(value.dayOfWeek) || (value.dayOfWeek as number) < 0 || (value.dayOfWeek as number) > 6))
    || (value.cadence === 'DAILY' && value.dayOfWeek !== undefined)) {
    throw new WorkbookFeatureConfigurationError('Le jour hebdomadaire doit être défini uniquement pour une cadence hebdomadaire.', 400);
  }
  const days = value.overdueDays as unknown[];
  if (days.some((day) => typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 3650)
    || new Set(days).size !== days.length) {
    throw new WorkbookFeatureConfigurationError('Les jours de retard doivent être des seuils entiers uniques entre 1 et 3650.', 400);
  }
  const configuredDays = new Set(days as number[]);
  for (const template of value.templates) {
    if (!isRecord(template)
      || !hasOnlyKeys(template, ['overdueDays', 'subject', 'body'])
      || typeof template.overdueDays !== 'number'
      || !configuredDays.has(template.overdueDays)) {
      throw new WorkbookFeatureConfigurationError('Chaque seuil de retard doit avoir un modèle de relance correspondant.', 400);
    }
    validateTemplateText(template.subject, 200, 'L’objet du modèle');
    validateTemplateText(template.body, 5000, 'Le corps du modèle');
    configuredDays.delete(template.overdueDays);
  }
  if (configuredDays.size > 0) {
    throw new WorkbookFeatureConfigurationError('Chaque seuil de retard doit avoir un modèle de relance correspondant.', 400);
  }
  return value;
}
