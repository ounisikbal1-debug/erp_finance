import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateWorkbookFleetAlertConfiguration(value: unknown) {
  if (!isRecord(value)
    || Object.keys(value).some((key) => !['dateLeadDays', 'odometerLeadKm', 'requireHumanReview'].includes(key))
    || typeof value.dateLeadDays !== 'number'
    || !Number.isInteger(value.dateLeadDays)
    || value.dateLeadDays < 0
    || value.dateLeadDays > 365
    || typeof value.odometerLeadKm !== 'number'
    || !Number.isSafeInteger(value.odometerLeadKm)
    || value.odometerLeadKm < 0
    || value.odometerLeadKm > 100_000
    || (value.dateLeadDays === 0 && value.odometerLeadKm === 0)
    || value.requireHumanReview !== true) {
    throw new WorkbookFeatureConfigurationError(
      'La politique de flotte doit définir au moins un seuil date/kilométrage explicite et conserver une revue humaine.',
      400,
    );
  }
  return value;
}
