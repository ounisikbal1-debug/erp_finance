import prisma from '../../../core/models/prisma';
import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';
import { validateWorkbookScoreConfiguration } from './workbook-scoring';
import { validateOfflineSyncPolicy } from './workbook-offline-sync';
import {
  isWorkbookConnectorFeatureKey,
  validateWorkbookConnectorConfiguration,
} from './workbook-connector-config';
import { validateWorkbookCrmReminderConfiguration } from './workbook-crm-reminders';
import { validateWorkbookFleetAlertConfiguration } from './workbook-fleet-alerts';
import { validateWorkbookCloudAiPolicy } from './workbook-cloud-ai';
import { validateWorkbookAllocationConfiguration } from './workbook-allocation-config';
import { validateWorkbookAiRiskConfiguration } from './workbook-ai-risk-config';
import { validateWorkbookDocumentTemplate } from './workbook-document-templates';
import { validateWorkbookPushNotificationPolicy } from './workbook-push-notifications';
import { validateWorkbookCustomsTransformationConfiguration } from './workbook-customs-transformation';
export { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

export const WORKBOOK_FEATURES = [
  { key: 'customs-transformation', label: 'Calcul du taux de transformation douanière', group: 'Douanes', runtimeAvailable: false },
  { key: 'offline-sync', label: 'Saisie et synchronisation hors ligne des commandes client', group: 'PWA', runtimeAvailable: true },
  { key: 'push-notifications', label: 'Notifications push', group: 'PWA', runtimeAvailable: false },
  { key: 'customer-supplier-scoring', label: 'Scoring clients et fournisseurs', group: 'Scores', runtimeAvailable: true },
  { key: 'project-cost-allocation', label: 'Imputation automatique des coûts projet', group: 'Projets', runtimeAvailable: false },
  { key: 'project-progress-invoicing', label: 'Facturation à l’avancement', group: 'Projets', runtimeAvailable: false },
  { key: 'tuneps-connector', label: 'Connecteur TUNEPS', group: 'Connecteurs', runtimeAvailable: false },
  { key: 'cnss-declaration-connector', label: 'Connecteur de déclarations CNSS', group: 'Connecteurs', runtimeAvailable: false },
  { key: 'arabic-pdf-templates', label: 'Gabarits PDF arabe/français', group: 'Documents', runtimeAvailable: false },
  { key: 'cloud-ai', label: 'Provider IA cloud', group: 'IA', runtimeAvailable: false },
  { key: 'local-invoice-ocr', label: 'OCR local des factures', group: 'IA', runtimeAvailable: false },
  { key: 'cashflow-ml', label: 'Prévision de trésorerie par modèle', group: 'IA', runtimeAvailable: false },
  { key: 'anomaly-ai', label: 'Suggestions IA d’anomalies', group: 'IA', runtimeAvailable: false },
  { key: 'dgi-tax-templates', label: 'Gabarits fiscaux DGI/CNSS', group: 'Fiscalité', runtimeAvailable: false },
  { key: 'bank-match-assistance', label: 'Suggestions de rapprochement bancaire', group: 'Banque', runtimeAvailable: false },
  { key: 'crm-reminders', label: 'Relances CRM automatiques', group: 'CRM', runtimeAvailable: false },
  { key: 'production-cost-allocation', label: 'Clés de répartition de production', group: 'Production', runtimeAvailable: false },
  { key: 'financial-health-score', label: 'Score de santé financière (mesures manuelles)', group: 'Scores', runtimeAvailable: true },
  { key: 'e-invoicing-dgi', label: 'E-facturation DGI', group: 'Connecteurs', runtimeAvailable: false },
  { key: 'fleet-maintenance-alerts', label: 'Alertes de maintenance préventive', group: 'Flotte', runtimeAvailable: false },
] as const;

export type WorkbookFeatureKey = (typeof WORKBOOK_FEATURES)[number]['key'];

export interface WorkbookFeatureConfigurationInput {
  configuration: unknown;
  sourceReference?: unknown;
  confirmationNote?: unknown;
  confirmConfiguration?: unknown;
  enabled?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateConfiguration(value: unknown): string {
  if (!isRecord(value)) {
    throw new WorkbookFeatureConfigurationError('La configuration doit être un objet JSON.', 400);
  }

  const inspectSecrets = (current: unknown): void => {
    if (Array.isArray(current)) {
      current.forEach(inspectSecrets);
      return;
    }
    if (!isRecord(current)) return;
    for (const [key, nested] of Object.entries(current)) {
      if (/(password|secret|token|api[-_]?key|authorization)/i.test(key)) {
        throw new WorkbookFeatureConfigurationError(
          'Les identifiants et secrets ne doivent pas être enregistrés dans une configuration fonctionnelle.',
          400,
        );
      }
      inspectSecrets(nested);
    }
  };
  inspectSecrets(value);

  const serialized = JSON.stringify(value);
  if (serialized.length > 24_000) {
    throw new WorkbookFeatureConfigurationError('La configuration dépasse la taille maximale de 24 Ko.', 400);
  }
  return serialized;
}

function optionalText(value: unknown, label: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > maxLength || value.trim() !== value) {
    throw new WorkbookFeatureConfigurationError(`${label} est invalide.`, 400);
  }
  return value;
}

export function getWorkbookFeatureDefinition(key: string) {
  return WORKBOOK_FEATURES.find((feature) => feature.key === key);
}

export function validateWorkbookFeatureConfigurationInput(
  key: string,
  input: WorkbookFeatureConfigurationInput,
) {
  const feature = getWorkbookFeatureDefinition(key);
  if (!feature) throw new WorkbookFeatureConfigurationError('Fonctionnalité inconnue.', 404);
  const configurationJson = validateConfiguration(input.configuration);
  const sourceReference = optionalText(input.sourceReference, 'La référence source', 500);
  const confirmationNote = optionalText(input.confirmationNote, 'La note de confirmation', 1000);
  if (input.confirmConfiguration !== undefined && typeof input.confirmConfiguration !== 'boolean') {
    throw new WorkbookFeatureConfigurationError('La confirmation de configuration est invalide.', 400);
  }
  const confirmConfiguration = input.confirmConfiguration === true;
  if (confirmConfiguration && (!confirmationNote || confirmationNote.length < 20)) {
    throw new WorkbookFeatureConfigurationError(
      'La confirmation doit inclure une note décrivant la vérification effectuée (20 caractères minimum).',
      400,
    );
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new WorkbookFeatureConfigurationError('Le statut d’activation est invalide.', 400);
  }
  const enable = input.enabled === true;
  if (enable && !feature.runtimeAvailable) {
    throw new WorkbookFeatureConfigurationError(
      'Cette fonctionnalité reste inactive dans cette version; seule sa configuration brouillon peut être enregistrée.',
      409,
    );
  }
  if (enable && !confirmConfiguration) {
    throw new WorkbookFeatureConfigurationError('Une activation exige une revue administrateur explicite.', 400);
  }
  if (confirmConfiguration && isWorkbookConnectorFeatureKey(feature.key) && !sourceReference) {
    throw new WorkbookFeatureConfigurationError(
      'Une référence de contrat ou de documentation officielle est requise pour la revue du connecteur.',
      400,
    );
  }
  if (feature.key === 'customer-supplier-scoring' || feature.key === 'financial-health-score') {
    if (confirmConfiguration || enable) {
      validateWorkbookScoreConfiguration(feature.key, input.configuration);
    }
  }
  if (feature.key === 'offline-sync' && (confirmConfiguration || enable)) {
    validateOfflineSyncPolicy(input.configuration);
  }
  if (feature.key === 'cloud-ai' && (confirmConfiguration || enable)) {
    validateWorkbookCloudAiPolicy(input.configuration);
  }
  if (isWorkbookConnectorFeatureKey(feature.key) && (confirmConfiguration || enable)) {
    validateWorkbookConnectorConfiguration(input.configuration);
  }
  if ((feature.key === 'project-cost-allocation'
    || feature.key === 'production-cost-allocation'
    || feature.key === 'project-progress-invoicing')
    && (confirmConfiguration || enable)) {
    validateWorkbookAllocationConfiguration(feature.key, input.configuration);
  }
  if ((feature.key === 'cashflow-ml' || feature.key === 'anomaly-ai')
    && (confirmConfiguration || enable)) {
    validateWorkbookAiRiskConfiguration(feature.key, input.configuration);
  }
  if ((feature.key === 'dgi-tax-templates' || feature.key === 'arabic-pdf-templates')
    && (confirmConfiguration || enable)) {
    validateWorkbookDocumentTemplate(feature.key, input.configuration);
  }
  if (feature.key === 'push-notifications' && (confirmConfiguration || enable)) {
    validateWorkbookPushNotificationPolicy(input.configuration);
  }
  if (feature.key === 'customs-transformation' && (confirmConfiguration || enable)) {
    validateWorkbookCustomsTransformationConfiguration(input.configuration);
  }
  if (feature.key === 'crm-reminders' && (confirmConfiguration || enable)) {
    validateWorkbookCrmReminderConfiguration(input.configuration);
  }
  if (feature.key === 'fleet-maintenance-alerts' && (confirmConfiguration || enable)) {
    validateWorkbookFleetAlertConfiguration(input.configuration);
  }

  return { feature, configurationJson, sourceReference, confirmationNote, confirmConfiguration, enable };
}

export function validateWorkbookFeatureConfigurationDraft(key: string, configuration: unknown) {
  const { feature, configurationJson } = validateWorkbookFeatureConfigurationInput(key, { configuration });
  if (feature.key === 'customer-supplier-scoring' || feature.key === 'financial-health-score') {
    validateWorkbookScoreConfiguration(feature.key, configuration);
  } else if (feature.key === 'offline-sync') {
    validateOfflineSyncPolicy(configuration);
  } else if (feature.key === 'cloud-ai') {
    validateWorkbookCloudAiPolicy(configuration);
  } else if (isWorkbookConnectorFeatureKey(feature.key)) {
    validateWorkbookConnectorConfiguration(configuration);
  } else if (
    feature.key === 'project-cost-allocation'
    || feature.key === 'production-cost-allocation'
    || feature.key === 'project-progress-invoicing'
  ) {
    validateWorkbookAllocationConfiguration(feature.key, configuration);
  } else if (feature.key === 'cashflow-ml' || feature.key === 'anomaly-ai') {
    validateWorkbookAiRiskConfiguration(feature.key, configuration);
  } else if (feature.key === 'dgi-tax-templates' || feature.key === 'arabic-pdf-templates') {
    validateWorkbookDocumentTemplate(feature.key, configuration);
  } else if (feature.key === 'push-notifications') {
    validateWorkbookPushNotificationPolicy(configuration);
  } else if (feature.key === 'customs-transformation') {
    validateWorkbookCustomsTransformationConfiguration(configuration);
  } else if (feature.key === 'crm-reminders') {
    validateWorkbookCrmReminderConfiguration(configuration);
  } else if (feature.key === 'fleet-maintenance-alerts') {
    validateWorkbookFleetAlertConfiguration(configuration);
  }
  return {
    featureKey: feature.key,
    configurationVersion: 1,
    valid: true as const,
    runtimeAvailability: feature.runtimeAvailable ? 'CONFIGURED_ENGINE' as const : 'CONFIGURATION_ONLY' as const,
    activationAvailable: feature.runtimeAvailable,
    connectionStatus: isWorkbookConnectorFeatureKey(feature.key)
      ? 'NOT_CONNECTED' as const
      : null,
    configurationSize: configurationJson.length,
  };
}

export async function listWorkbookFeatureConfigurations(entityId: string) {
  if (!entityId || entityId.length > 100) {
    throw new WorkbookFeatureConfigurationError('Une entité valide est requise.', 400);
  }
  const entity = await prisma.entity.findUnique({ where: { id: entityId }, select: { id: true } });
  if (!entity) throw new WorkbookFeatureConfigurationError('Entité introuvable.', 404);

  const saved = await prisma.workbookFeatureConfiguration.findMany({
    where: { entityId },
    select: {
      featureKey: true,
      configurationJson: true,
      enabled: true,
      sourceReference: true,
      confirmationNote: true,
      confirmedBy: true,
      confirmedAt: true,
      version: true,
      updatedAt: true,
    },
  });
  const byKey = new Map(saved.map((entry) => [entry.featureKey, entry] as const));

  return WORKBOOK_FEATURES.map((feature) => {
    const entry = byKey.get(feature.key);
    let configuration: Record<string, unknown> = {};
    if (entry) {
      try {
        const parsed: unknown = JSON.parse(entry.configurationJson);
        if (!isRecord(parsed)) throw new Error('Stored configuration is not an object');
        configuration = parsed;
      } catch (error) {
        console.error(`Configuration SAFE invalide persistée pour ${feature.key}:`, error);
        throw new WorkbookFeatureConfigurationError('Une configuration persistée est illisible; contactez un administrateur.', 500);
      }
    }

    return {
      ...feature,
      configuration,
      enabled: entry?.enabled ?? false,
      effectiveEnabled: Boolean(feature.runtimeAvailable && entry?.enabled && entry.confirmedAt),
      runtimeAvailability: feature.runtimeAvailable ? 'CONFIGURED_ENGINE' as const : 'CONFIGURATION_ONLY' as const,
      activationAvailable: feature.runtimeAvailable,
      connectionStatus: isWorkbookConnectorFeatureKey(feature.key) ? 'NOT_CONNECTED' as const : null,
      configurationStatus: entry
        ? entry.confirmedAt ? 'CONFIRMED_DISABLED' as const : 'DRAFT' as const
        : 'NOT_CONFIGURED' as const,
      sourceReference: entry?.sourceReference ?? null,
      confirmationNote: entry?.confirmationNote ?? null,
      confirmedBy: entry?.confirmedBy ?? null,
      confirmedAt: entry?.confirmedAt ?? null,
      version: entry?.version ?? 0,
      updatedAt: entry?.updatedAt ?? null,
    };
  });
}

export async function saveWorkbookFeatureConfiguration(
  entityId: string,
  key: string,
  input: WorkbookFeatureConfigurationInput,
  actor: { id: string; username: string },
) {
  if (!entityId || entityId.length > 100) {
    throw new WorkbookFeatureConfigurationError('Une entité valide est requise.', 400);
  }
  if (!actor.id || !actor.username) {
    throw new WorkbookFeatureConfigurationError('Authentification administrateur requise.', 401);
  }
  const { feature, configurationJson, sourceReference, confirmationNote, confirmConfiguration, enable } =
    validateWorkbookFeatureConfigurationInput(key, input);

  const entity = await prisma.entity.findUnique({ where: { id: entityId }, select: { id: true } });
  if (!entity) throw new WorkbookFeatureConfigurationError('Entité introuvable.', 404);

  return prisma.$transaction(async (tx) => {
    const saved = await tx.workbookFeatureConfiguration.upsert({
      where: { entityId_featureKey: { entityId, featureKey: feature.key } },
      create: {
        entityId,
        featureKey: feature.key,
        configurationJson,
        sourceReference,
        confirmationNote,
        enabled: enable,
        confirmedAt: confirmConfiguration ? new Date() : null,
        confirmedBy: confirmConfiguration ? actor.username : null,
        version: 1,
      },
      update: {
        configurationJson,
        sourceReference,
        confirmationNote,
        enabled: enable,
        confirmedAt: confirmConfiguration ? new Date() : null,
        confirmedBy: confirmConfiguration ? actor.username : null,
        version: { increment: 1 },
      },
      select: {
        featureKey: true,
        configurationJson: true,
        enabled: true,
        sourceReference: true,
        confirmationNote: true,
        confirmedBy: true,
        confirmedAt: true,
        version: true,
        updatedAt: true,
      },
    });
    await tx.workbookFeatureConfigurationRevision.create({
      data: {
        entityId,
        featureKey: saved.featureKey,
        version: saved.version,
        configurationJson: saved.configurationJson,
        enabled: saved.enabled,
        sourceReference: saved.sourceReference,
        confirmationNote: saved.confirmationNote,
        confirmedBy: saved.confirmedBy,
        confirmedAt: saved.confirmedAt,
        actorUserId: actor.id,
        actorUsername: actor.username,
      },
    });
    return saved;
  });
}

export async function listWorkbookFeatureConfigurationRevisions(entityId: string, key: string) {
  if (!entityId || entityId.length > 100) {
    throw new WorkbookFeatureConfigurationError('Une entité valide est requise.', 400);
  }
  const feature = getWorkbookFeatureDefinition(key);
  if (!feature) throw new WorkbookFeatureConfigurationError('Fonctionnalité inconnue.', 404);
  return prisma.workbookFeatureConfigurationRevision.findMany({
    where: { entityId, featureKey: feature.key },
    orderBy: { version: 'desc' },
    take: 100,
    select: {
      featureKey: true,
      version: true,
      configurationJson: true,
      enabled: true,
      sourceReference: true,
      confirmationNote: true,
      confirmedBy: true,
      confirmedAt: true,
      actorUserId: true,
      actorUsername: true,
      createdAt: true,
    },
  });
}
