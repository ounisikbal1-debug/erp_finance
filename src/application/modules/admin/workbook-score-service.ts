import prisma from '../../../core/models/prisma';
import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';
import {
  calculateWorkbookScore,
  isWorkbookScoreMetrics,
  validateWorkbookScoreConfiguration,
  type WorkbookScoreKey,
} from './workbook-scoring';
import { collectWorkbookPartnerScoreMetrics } from './workbook-partner-data';

export type WorkbookScoreSubjectType = 'CUSTOMER' | 'SUPPLIER' | 'HEALTH';
const SCORE_SUBJECT_TYPES: readonly WorkbookScoreSubjectType[] = ['CUSTOMER', 'SUPPLIER', 'HEALTH'];

export function isWorkbookScoreSubjectType(value: unknown): value is WorkbookScoreSubjectType {
  return typeof value === 'string' && SCORE_SUBJECT_TYPES.includes(value as WorkbookScoreSubjectType);
}

function getConfigurationKey(subjectType: WorkbookScoreSubjectType): WorkbookScoreKey {
  return subjectType === 'HEALTH' ? 'financial-health-score' : 'customer-supplier-scoring';
}

export async function calculateAndPersistWorkbookScore(input: {
  entityId: string;
  subjectType: WorkbookScoreSubjectType;
  partnerId: string;
  metrics?: unknown;
  sourceReference?: unknown;
  calculatedBy?: string;
}) {
  if (!input.entityId || !input.partnerId || input.entityId.length > 100 || input.partnerId.length > 100) {
    throw new WorkbookFeatureConfigurationError('Entité et partenaire valides requis.', 400);
  }
  if (input.subjectType === 'HEALTH' && input.partnerId !== input.entityId) {
    throw new WorkbookFeatureConfigurationError('Le score de santé est rattaché à l’entité courante.', 400);
  }
  if (input.subjectType !== 'HEALTH' && (input.metrics !== undefined || input.sourceReference !== undefined)) {
    throw new WorkbookFeatureConfigurationError('Les mesures des partenaires sont extraites des données internes; elles ne peuvent pas être fournies par le client.', 400);
  }

  const featureKey = getConfigurationKey(input.subjectType);
  const savedConfiguration = await prisma.workbookFeatureConfiguration.findUnique({
    where: { entityId_featureKey: { entityId: input.entityId, featureKey } },
    select: { configurationJson: true, enabled: true, confirmedAt: true, version: true },
  });
  if (!savedConfiguration?.enabled || !savedConfiguration.confirmedAt) {
    throw new WorkbookFeatureConfigurationError('Le calcul du score n’est pas activé par un administrateur.', 409);
  }

  let configurationValue: unknown;
  try {
    configurationValue = JSON.parse(savedConfiguration.configurationJson);
  } catch (error) {
    console.error(`Configuration de score illisible pour ${featureKey}:`, error);
    throw new WorkbookFeatureConfigurationError('La configuration de score est illisible.', 500);
  }
  const configuration = validateWorkbookScoreConfiguration(featureKey, configurationValue);
  let metrics: Record<string, number>;
  let evidence: unknown;
  if (input.subjectType === 'HEALTH') {
    if (!isWorkbookScoreMetrics(input.metrics)
      || typeof input.sourceReference !== 'string'
      || input.sourceReference.trim() !== input.sourceReference
      || input.sourceReference.length < 1
      || input.sourceReference.length > 500
      || !input.calculatedBy) {
      throw new WorkbookFeatureConfigurationError('Les mesures et la référence de leur source sont obligatoires pour le score de santé.', 400);
    }
    metrics = input.metrics;
    evidence = { sourceReference: input.sourceReference, enteredBy: input.calculatedBy };
  } else {
    const collected = await collectWorkbookPartnerScoreMetrics({
      entityId: input.entityId,
      partnerType: input.subjectType,
      partnerId: input.partnerId,
      lookbackDays: configuration.lookbackDays,
    });
    metrics = {
      paymentHistory: collected.paymentHistory,
      paymentDelay: collected.paymentDelay,
      disputes: collected.disputes,
      exposure: collected.exposure,
    };
    evidence = collected.evidence;
  }
  const result = calculateWorkbookScore(configuration, metrics);
  const snapshot = await prisma.partnerScoreSnapshot.create({
    data: {
      entityId: input.entityId,
      scoreType: input.subjectType,
      partnerId: input.partnerId,
      score: result.score,
      alertThreshold: result.alertThreshold,
      alertTriggered: result.alert,
      metricsJson: JSON.stringify({ metrics, evidence }),
      configurationVersion: savedConfiguration.version,
    },
    select: {
      id: true,
      entityId: true,
      scoreType: true,
      partnerId: true,
      score: true,
      alertThreshold: true,
      alertTriggered: true,
      metricsJson: true,
      configurationVersion: true,
      calculatedAt: true,
    },
  });
  return { ...snapshot, explanation: result.components, evidence };
}

export async function listWorkbookScoreHistory(input: {
  entityId: string;
  subjectType: WorkbookScoreSubjectType;
  partnerId: string;
}) {
  if (!input.entityId || !input.partnerId) {
    throw new WorkbookFeatureConfigurationError('Entité et partenaire valides requis.', 400);
  }
  return prisma.partnerScoreSnapshot.findMany({
    where: {
      entityId: input.entityId,
      scoreType: input.subjectType,
      partnerId: input.partnerId,
    },
    orderBy: [{ calculatedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      score: true,
      alertThreshold: true,
      alertTriggered: true,
      metricsJson: true,
      configurationVersion: true,
      calculatedAt: true,
    },
  });
}
