import {
  validateWorkbookConnectorConfiguration,
  type WorkbookConnectorConfiguration,
} from './workbook-connector-config';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.')) {
    if (!segment || ['__proto__', 'prototype', 'constructor'].includes(segment)
      || !isRecord(current)
      || !Object.prototype.hasOwnProperty.call(current, segment)) {
      throw new Error(`Le champ source « ${path} » est absent de l’échantillon.`);
    }
    current = current[segment];
  }
  if (current === undefined) throw new Error(`Le champ source « ${path} » est indéfini.`);
  return current;
}

function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  if (segments.some((segment) => !segment || ['__proto__', 'prototype', 'constructor'].includes(segment))) {
    throw new Error(`Le chemin cible « ${path} » contient un segment interdit.`);
  }
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (existing === undefined) {
      const child: Record<string, unknown> = {};
      current[segment] = child;
      current = child;
    } else if (isRecord(existing)) {
      current = existing;
    } else {
      throw new Error(`Les chemins de mapping se chevauchent sur « ${segment} ».`);
    }
  }
  const leaf = segments[segments.length - 1];
  if (Object.prototype.hasOwnProperty.call(current, leaf)) {
    throw new Error(`Le mapping cible plusieurs fois « ${path} ».`);
  }
  current[leaf] = value;
}

export function mapWorkbookConnectorFields(
  sample: unknown,
  mapping: Record<string, string>,
): Record<string, unknown> {
  if (!isRecord(sample)) throw new Error('L’échantillon du connecteur doit être un objet JSON.');
  const result: Record<string, unknown> = {};
  for (const [sourcePath, destinationPath] of Object.entries(mapping)) {
    writePath(result, destinationPath, readPath(sample, sourcePath));
  }
  return result;
}

export interface WorkbookConnectorRequestPreview {
  status: 'NOT_CONNECTED';
  contractVersion: string;
  method: 'POST';
  url: string;
  headers: { 'content-type': 'application/json' };
  body: Record<string, unknown>;
  notice: string;
}

export function buildWorkbookConnectorRequestPreview(
  value: unknown,
  sample: unknown,
): WorkbookConnectorRequestPreview {
  const configuration: WorkbookConnectorConfiguration = validateWorkbookConnectorConfiguration(value);
  return {
    status: 'NOT_CONNECTED',
    contractVersion: configuration.contractVersion,
    method: 'POST',
    url: new URL(configuration.resourcePath, configuration.baseUrl).toString(),
    headers: { 'content-type': 'application/json' },
    body: mapWorkbookConnectorFields(sample, configuration.requestMapping),
    notice: 'Simulation locale uniquement : aucune connexion, authentification ou requête réseau n’a été effectuée.',
  };
}

export function buildWorkbookConnectorResponsePreview(value: unknown, sample: unknown) {
  const configuration = validateWorkbookConnectorConfiguration(value);
  return {
    status: 'NOT_CONNECTED' as const,
    contractVersion: configuration.contractVersion,
    mappedResponse: mapWorkbookConnectorFields(sample, configuration.responseMapping),
    notice: 'Réponse synthétique remappée localement; elle ne provient pas du fournisseur externe.',
  };
}
