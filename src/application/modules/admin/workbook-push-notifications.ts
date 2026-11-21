import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

const APPROVAL_EVENTS = ['APPROVAL_REQUEST', 'APPROVAL_DECISION'] as const;
type ApprovalEvent = (typeof APPROVAL_EVENTS)[number];

export interface WorkbookPushNotificationPolicy {
  providerReference: string;
  publicKeyReference: string;
  privateKeyProvider: 'ENVIRONMENT' | 'SECRET_MANAGER';
  events: ApprovalEvent[];
  payloadMode: 'MINIMAL';
  requireUserConsent: true;
  includeFinancialDetails: false;
  deliveryEnabled: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireReference(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || value.trim() !== value
    || value.length < 1
    || value.length > 160
    || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) {
    throw new WorkbookFeatureConfigurationError(`${label} est invalide.`, 400);
  }
  return value;
}

export function validateWorkbookPushNotificationPolicy(value: unknown): WorkbookPushNotificationPolicy {
  if (!isRecord(value)) {
    throw new WorkbookFeatureConfigurationError('La politique de notification doit être un objet.', 400);
  }
  const expectedKeys = [
    'providerReference',
    'publicKeyReference',
    'privateKeyProvider',
    'events',
    'payloadMode',
    'requireUserConsent',
    'includeFinancialDetails',
    'deliveryEnabled',
  ];
  const keys = Object.keys(value);
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    throw new WorkbookFeatureConfigurationError('La politique de notification contient des champs absents ou non pris en charge.', 400);
  }
  const providerReference = requireReference(value.providerReference, 'La référence du service de notification');
  const publicKeyReference = requireReference(value.publicKeyReference, 'La référence de la clé publique');
  if (value.privateKeyProvider !== 'ENVIRONMENT' && value.privateKeyProvider !== 'SECRET_MANAGER') {
    throw new WorkbookFeatureConfigurationError('La clé privée doit rester dans un fournisseur de secrets externe.', 400);
  }
  if (!Array.isArray(value.events)
    || value.events.length === 0
    || value.events.some((event) => !APPROVAL_EVENTS.includes(event as ApprovalEvent))
    || new Set(value.events).size !== value.events.length) {
    throw new WorkbookFeatureConfigurationError('Choisissez des événements d’approbation uniques et pris en charge.', 400);
  }
  if (value.payloadMode !== 'MINIMAL'
    || value.requireUserConsent !== true
    || value.includeFinancialDetails !== false) {
    throw new WorkbookFeatureConfigurationError('Les notifications exigent le consentement utilisateur et ne doivent contenir aucun détail financier.', 400);
  }
  if (value.deliveryEnabled !== false) {
    throw new WorkbookFeatureConfigurationError('La livraison push reste désactivée sans fournisseur, clés et consentements intégrés.', 409);
  }
  return {
    providerReference,
    publicKeyReference,
    privateKeyProvider: value.privateKeyProvider,
    events: value.events as ApprovalEvent[],
    payloadMode: 'MINIMAL',
    requireUserConsent: true,
    includeFinancialDetails: false,
    deliveryEnabled: false,
  };
}
