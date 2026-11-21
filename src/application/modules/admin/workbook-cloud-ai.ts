import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

export interface WorkbookCloudAiPolicy {
  selectedProvider: string;
  selectedModel: string;
  routing: 'MANUAL';
  disclosureText: string;
  requireExplicitConsent: true;
  redactByDefault: true;
  allowedDataClasses: [];
  autoRouteFinancialData: false;
  automaticFallback: false;
  externalTransferEnabled: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireLabel(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || value.trim() !== value
    || value.length < 1
    || value.length > 100
    || !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(value)) {
    throw new WorkbookFeatureConfigurationError(`${label} est invalide.`, 400);
  }
  return value;
}

export function validateWorkbookCloudAiPolicy(value: unknown): WorkbookCloudAiPolicy {
  if (!isRecord(value)) {
    throw new WorkbookFeatureConfigurationError('La politique IA cloud doit être un objet.', 400);
  }
  const expectedKeys = [
    'selectedProvider',
    'selectedModel',
    'routing',
    'disclosureText',
    'requireExplicitConsent',
    'redactByDefault',
    'allowedDataClasses',
    'autoRouteFinancialData',
    'automaticFallback',
    'externalTransferEnabled',
  ];
  const keys = Object.keys(value);
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    throw new WorkbookFeatureConfigurationError('La politique IA cloud contient des champs absents ou non pris en charge.', 400);
  }

  const selectedProvider = requireLabel(value.selectedProvider, 'Le fournisseur sélectionné');
  const selectedModel = requireLabel(value.selectedModel, 'Le modèle sélectionné');
  if (value.routing !== 'MANUAL') {
    throw new WorkbookFeatureConfigurationError('La sélection du fournisseur doit rester manuelle.', 400);
  }
  if (typeof value.disclosureText !== 'string'
    || value.disclosureText.trim() !== value.disclosureText
    || value.disclosureText.length < 20
    || value.disclosureText.length > 2000) {
    throw new WorkbookFeatureConfigurationError('Une information claire sur le traitement des données est obligatoire.', 400);
  }
  if (value.requireExplicitConsent !== true || value.redactByDefault !== true) {
    throw new WorkbookFeatureConfigurationError('Le consentement explicite et la rédaction par défaut sont obligatoires.', 400);
  }
  if (!Array.isArray(value.allowedDataClasses) || value.allowedDataClasses.length !== 0) {
    throw new WorkbookFeatureConfigurationError('Aucune catégorie de données ne peut être autorisée pour un transfert cloud.', 400);
  }
  if (value.autoRouteFinancialData !== false
    || value.automaticFallback !== false
    || value.externalTransferEnabled !== false) {
    throw new WorkbookFeatureConfigurationError('Le routage financier, le fallback et tout transfert externe restent interdits.', 409);
  }

  return {
    selectedProvider,
    selectedModel,
    routing: 'MANUAL',
    disclosureText: value.disclosureText,
    requireExplicitConsent: true,
    redactByDefault: true,
    allowedDataClasses: [],
    autoRouteFinancialData: false,
    automaticFallback: false,
    externalTransferEnabled: false,
  };
}
