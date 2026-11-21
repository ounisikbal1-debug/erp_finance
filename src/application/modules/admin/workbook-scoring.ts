import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

export type WorkbookScoreKey = 'customer-supplier-scoring' | 'financial-health-score';

export interface WorkbookScoreComponent {
  key: string;
  weight: number;
  minimum: number;
  maximum: number;
  higherIsBetter: boolean;
}

export interface WorkbookScoreConfiguration {
  alertThreshold: number;
  lookbackDays: number;
  components: WorkbookScoreComponent[];
}

export interface WorkbookScoreResult {
  score: number;
  alert: boolean;
  alertThreshold: number;
  components: Array<{
    key: string;
    value: number;
    normalizedScore: number;
    weight: number;
    contribution: number;
  }>;
}

const REQUIRED_COMPONENTS: Record<WorkbookScoreKey, readonly string[]> = {
  'customer-supplier-scoring': ['paymentHistory', 'paymentDelay', 'disputes', 'exposure'],
  'financial-health-score': ['liquidity', 'solvency', 'profitability', 'workingCapital', 'paymentDelay'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isWorkbookScoreMetrics(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((metric) => (
    typeof metric === 'number' && Number.isFinite(metric)
  ));
}

export function validateWorkbookScoreConfiguration(
  key: WorkbookScoreKey,
  value: unknown,
): WorkbookScoreConfiguration {
  if (!isRecord(value)
    || !Number.isFinite(value.alertThreshold)
    || typeof value.alertThreshold !== 'number'
    || value.alertThreshold < 0
    || value.alertThreshold > 100
    || typeof value.lookbackDays !== 'number'
    || !Number.isInteger(value.lookbackDays)
    || value.lookbackDays < 1
    || value.lookbackDays > 3650
    || !Array.isArray(value.components)) {
    throw new WorkbookFeatureConfigurationError(
      'Le score requiert un seuil entre 0 et 100, une période d’observation entre 1 et 3650 jours et une liste de composants.',
      400,
    );
  }

  const expected = REQUIRED_COMPONENTS[key];
  if (value.components.length !== expected.length) {
    throw new WorkbookFeatureConfigurationError('La liste des composants du score est incomplète ou contient des doublons.', 400);
  }
  const seen = new Set<string>();
  const components: WorkbookScoreComponent[] = value.components.map((component) => {
    if (!isRecord(component)
      || typeof component.key !== 'string'
      || !expected.includes(component.key)
      || seen.has(component.key)
      || typeof component.weight !== 'number'
      || !Number.isFinite(component.weight)
      || component.weight <= 0
      || typeof component.minimum !== 'number'
      || !Number.isFinite(component.minimum)
      || typeof component.maximum !== 'number'
      || !Number.isFinite(component.maximum)
      || component.minimum >= component.maximum
      || typeof component.higherIsBetter !== 'boolean') {
      throw new WorkbookFeatureConfigurationError('Un composant de score est invalide.', 400);
    }
    seen.add(component.key);
    return {
      key: component.key,
      weight: component.weight,
      minimum: component.minimum,
      maximum: component.maximum,
      higherIsBetter: component.higherIsBetter,
    };
  });

  if (expected.some((component) => !seen.has(component))) {
    throw new WorkbookFeatureConfigurationError('Chaque indicateur requis doit être configuré exactement une fois.', 400);
  }
  const weightTotal = components.reduce((total, component) => total + component.weight, 0);
  if (Math.abs(weightTotal - 100) > 0.000001) {
    throw new WorkbookFeatureConfigurationError('La somme des pondérations doit être égale à 100.', 400);
  }
  return { alertThreshold: value.alertThreshold, lookbackDays: value.lookbackDays, components };
}

export function calculateWorkbookScore(
  configuration: WorkbookScoreConfiguration,
  metrics: Record<string, number>,
): WorkbookScoreResult {
  if (!isWorkbookScoreMetrics(metrics)) {
    throw new WorkbookFeatureConfigurationError('Les mesures de score doivent être un objet.', 400);
  }
  const configuredKeys = new Set(configuration.components.map((component) => component.key));
  if (Object.keys(metrics).length !== configuredKeys.size
    || Object.keys(metrics).some((key) => !configuredKeys.has(key))) {
    throw new WorkbookFeatureConfigurationError('Les mesures doivent correspondre exactement aux composants configurés.', 400);
  }

  const components = configuration.components.map((component) => {
    const value = metrics[component.key];
    if (typeof value !== 'number'
      || !Number.isFinite(value)
      || value < component.minimum
      || value > component.maximum) {
      throw new WorkbookFeatureConfigurationError(`La mesure ${component.key} est absente ou hors de sa plage configurée.`, 400);
    }
    const position = (value - component.minimum) / (component.maximum - component.minimum);
    const normalizedScore = (component.higherIsBetter ? position : 1 - position) * 100;
    const contribution = normalizedScore * component.weight / 100;
    return { key: component.key, value, normalizedScore, weight: component.weight, contribution };
  });
  const score = components.reduce((total, component) => total + component.contribution, 0);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new WorkbookFeatureConfigurationError('Le score calculé est invalide.', 422);
  }
  return {
    score,
    alert: score < configuration.alertThreshold,
    alertThreshold: configuration.alertThreshold,
    components,
  };
}
