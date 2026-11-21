import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

export interface WorkbookConnectorConfiguration {
  contractVersion: string;
  baseUrl: string;
  resourcePath: string;
  credentialProvider: 'APPLICATION_VAULT' | 'ENVIRONMENT' | 'SECRET_MANAGER';
  requestMapping: Record<string, string>;
  responseMapping: Record<string, string>;
}

export const WORKBOOK_CONNECTOR_FEATURE_KEYS = [
  'e-invoicing-dgi',
  'cnss-declaration-connector',
  'tuneps-connector',
] as const;

export type WorkbookConnectorFeatureKey = (typeof WORKBOOK_CONNECTOR_FEATURE_KEYS)[number];

export function isWorkbookConnectorFeatureKey(value: string): value is WorkbookConnectorFeatureKey {
  return WORKBOOK_CONNECTOR_FEATURE_KEYS.some((key) => key === value);
}

export function getWorkbookConnectorBlocker(featureKey: WorkbookConnectorFeatureKey): string {
  const serviceName = featureKey === 'e-invoicing-dgi'
    ? 'DGI/e-facturation'
    : featureKey === 'cnss-declaration-connector'
      ? 'CNSS'
      : 'TUNEPS';
  return `Connexion ${serviceName} désactivée : contrat officiel (endpoint, authentification et format d’échange) non vérifié.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || value.trim() !== value
    || value.length < 1
    || value.length > 120
    || !/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new WorkbookFeatureConfigurationError(`${label} est invalide.`, 400);
  }
  return value;
}

function validateMapping(value: unknown, label: string): Record<string, string> {
  if (!isRecord(value)) {
    throw new WorkbookFeatureConfigurationError(`${label} doit être un objet de correspondance.`, 400);
  }
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > 100) {
    throw new WorkbookFeatureConfigurationError(`${label} doit contenir de 1 à 100 correspondances.`, 400);
  }
  const destinations = new Set<string>();
  const mappings = entries.map(([source, destination]) => {
    const sourcePath = requireIdentifier(source, `${label} source`);
    const destinationPath = requireIdentifier(destination, `${label} destination`);
    for (const path of [sourcePath, destinationPath]) {
      const segments = path.split('.');
      if (segments.some((segment) => !segment || ['__proto__', 'prototype', 'constructor'].includes(segment))) {
        throw new WorkbookFeatureConfigurationError(`${label} contient un segment de chemin interdit.`, 400);
      }
    }
    if (destinations.has(destinationPath)) {
      throw new WorkbookFeatureConfigurationError(`${label} ne peut pas cibler deux fois le même champ.`, 400);
    }
    destinations.add(destinationPath);
    return [sourcePath, destinationPath] as const;
  });
  return Object.fromEntries(mappings);
}

export function validateWorkbookConnectorConfiguration(value: unknown): WorkbookConnectorConfiguration {
  if (!isRecord(value)) {
    throw new WorkbookFeatureConfigurationError('La configuration du connecteur doit être un objet.', 400);
  }
  const expectedKeys = [
    'contractVersion',
    'baseUrl',
    'resourcePath',
    'credentialProvider',
    'requestMapping',
    'responseMapping',
  ];
  const keys = Object.keys(value);
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    throw new WorkbookFeatureConfigurationError('Le contrat du connecteur contient des champs absents ou non pris en charge.', 400);
  }
  const contractVersion = requireIdentifier(value.contractVersion, 'La version du contrat');
  if (typeof value.baseUrl !== 'string') {
    throw new WorkbookFeatureConfigurationError('Une URL HTTPS de base est requise.', 400);
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(value.baseUrl);
  } catch {
    throw new WorkbookFeatureConfigurationError('L’URL de base du connecteur est invalide.', 400);
  }
  if (baseUrl.protocol !== 'https:'
    || baseUrl.username
    || baseUrl.password
    || baseUrl.search
    || baseUrl.hash
    || baseUrl.pathname !== '/') {
    throw new WorkbookFeatureConfigurationError('L’URL de base doit être une origine HTTPS sans identifiants, chemin, requête ni fragment.', 400);
  }
  if (typeof value.resourcePath !== 'string'
    || !value.resourcePath.startsWith('/')
    || value.resourcePath.startsWith('//')
    || value.resourcePath.includes('..')
    || value.resourcePath.includes('?')
    || value.resourcePath.includes('#')
    || value.resourcePath.length > 300) {
    throw new WorkbookFeatureConfigurationError('Le chemin de ressource du contrat est invalide.', 400);
  }
  if (value.credentialProvider !== 'APPLICATION_VAULT'
    && value.credentialProvider !== 'ENVIRONMENT'
    && value.credentialProvider !== 'SECRET_MANAGER') {
    throw new WorkbookFeatureConfigurationError('Les secrets doivent venir du coffre applicatif chiffré ou d’un fournisseur externe sécurisé.', 400);
  }
  return {
    contractVersion,
    baseUrl: baseUrl.origin,
    resourcePath: value.resourcePath,
    credentialProvider: value.credentialProvider,
    requestMapping: validateMapping(value.requestMapping, 'La correspondance de requête'),
    responseMapping: validateMapping(value.responseMapping, 'La correspondance de réponse'),
  };
}
