import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireReference(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || value.trim() !== value
    || value.length < 1
    || value.length > 160
    || /[\u0000-\u001f]/.test(value)) {
    throw new WorkbookFeatureConfigurationError(`${label} est invalide.`, 400);
  }
  return value;
}

function requireInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new WorkbookFeatureConfigurationError(`${label} est invalide.`, 400);
  }
  return value;
}

function requireDisabledControls(value: Record<string, unknown>) {
  if (value.requireHumanReview !== true) {
    throw new WorkbookFeatureConfigurationError('Une revue humaine est obligatoire pour les alertes et analyses.', 400);
  }
  if (value.automatedAction !== false || value.externalProcessing !== false) {
    throw new WorkbookFeatureConfigurationError('Les actions automatiques et le traitement externe restent désactivés.', 409);
  }
}

function validateCashflowPolicy(value: Record<string, unknown>) {
  const expectedKeys = [
    'modelReference',
    'dataSource',
    'horizonsDays',
    'minimumHistoryDays',
    'overdraftThreshold',
    'requireHumanReview',
    'automatedAction',
    'externalProcessing',
  ];
  const keys = Object.keys(value);
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    throw new WorkbookFeatureConfigurationError('La politique de prévision contient des champs absents ou non pris en charge.', 400);
  }
  requireDisabledControls(value);
  const modelReference = requireReference(value.modelReference, 'La référence du modèle');
  if (value.dataSource !== 'LOCAL_POSTED_TRANSACTIONS') {
    throw new WorkbookFeatureConfigurationError('La prévision ne peut consulter que des transactions comptabilisées localement.', 400);
  }
  if (!Array.isArray(value.horizonsDays)
    || value.horizonsDays.length !== 3
    || value.horizonsDays.some((horizon, index) => horizon !== [30, 60, 90][index])) {
    throw new WorkbookFeatureConfigurationError('Les horizons attendus sont 30, 60 et 90 jours.', 400);
  }
  const minimumHistoryDays = requireInteger(value.minimumHistoryDays, 'La période minimale d’historique', 1, 3650);
  if (!isRecord(value.overdraftThreshold)) {
    throw new WorkbookFeatureConfigurationError('Le seuil de risque de découvert doit être configuré avec une devise.', 400);
  }
  const thresholdKeys = Object.keys(value.overdraftThreshold);
  if (thresholdKeys.length !== 2 || thresholdKeys.some((key) => !['currencyCode', 'amount'].includes(key))) {
    throw new WorkbookFeatureConfigurationError('Le seuil de risque de découvert contient des champs non pris en charge.', 400);
  }
  const currencyCode = value.overdraftThreshold.currencyCode;
  const amount = value.overdraftThreshold.amount;
  if (typeof currencyCode !== 'string' || !/^[A-Z]{3}$/.test(currencyCode)
    || typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new WorkbookFeatureConfigurationError('Le seuil de risque de découvert est invalide.', 400);
  }
  return {
    modelReference,
    dataSource: 'LOCAL_POSTED_TRANSACTIONS' as const,
    horizonsDays: [30, 60, 90] as const,
    minimumHistoryDays,
    overdraftThreshold: { currencyCode, amount },
    requireHumanReview: true as const,
    automatedAction: false as const,
    externalProcessing: false as const,
  };
}

function validateAnomalyPolicy(value: Record<string, unknown>) {
  const expectedKeys = [
    'modelReference',
    'metricReferences',
    'comparisonRuleReference',
    'lookbackDays',
    'minimumSampleCount',
    'requireHumanReview',
    'automatedAction',
    'externalProcessing',
  ];
  const keys = Object.keys(value);
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    throw new WorkbookFeatureConfigurationError('La politique d’anomalies contient des champs absents ou non pris en charge.', 400);
  }
  requireDisabledControls(value);
  const modelReference = requireReference(value.modelReference, 'La référence du modèle');
  const comparisonRuleReference = requireReference(value.comparisonRuleReference, 'La référence de la règle de comparaison');
  const lookbackDays = requireInteger(value.lookbackDays, 'La période de comparaison', 1, 3650);
  const minimumSampleCount = requireInteger(value.minimumSampleCount, 'Le nombre minimal d’observations', 1, 100000);
  if (!Array.isArray(value.metricReferences)
    || value.metricReferences.length === 0
    || value.metricReferences.length > 100
    || value.metricReferences.some((reference) => typeof reference !== 'string'
      || !reference.trim()
      || reference.trim() !== reference
      || reference.length > 160)
    || new Set(value.metricReferences).size !== value.metricReferences.length) {
    throw new WorkbookFeatureConfigurationError('Les références de mesures doivent être explicites et uniques.', 400);
  }
  return {
    modelReference,
    metricReferences: value.metricReferences,
    comparisonRuleReference,
    lookbackDays,
    minimumSampleCount,
    requireHumanReview: true as const,
    automatedAction: false as const,
    externalProcessing: false as const,
  };
}

export function validateWorkbookAiRiskConfiguration(feature: 'cashflow-ml' | 'anomaly-ai', input: unknown) {
  if (!isRecord(input)) {
    throw new WorkbookFeatureConfigurationError('La politique d’analyse doit être un objet.', 400);
  }
  return feature === 'cashflow-ml' ? validateCashflowPolicy(input) : validateAnomalyPolicy(input);
}
