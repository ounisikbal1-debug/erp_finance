export interface CustomerInput {
  entityId: string;
  code: string;
  name: string;
  fiscalId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

const OPTIONAL_FIELDS = ['fiscalId', 'email', 'phone', 'address'] as const;
export type CustomerContactUpdateInput = Partial<Pick<CustomerInput, 'fiscalId' | 'email' | 'phone' | 'address'>>;
const OPTIONAL_FIELD_MAX_LENGTHS = {
  fiscalId: 50,
  email: 254,
  phone: 40,
  address: 500,
} as const;

export function validateCustomerInput(data: unknown, entityId: string): CustomerInput {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new SalesRequestError('Données client invalides', 400);
  }
  const input = data as Record<string, unknown>;
  if (typeof input.code !== 'string' || !input.code.trim() || typeof input.name !== 'string' || !input.name.trim()) {
    throw new SalesRequestError('Le code et le nom du client sont obligatoires', 400);
  }

  const customer: CustomerInput = {
    entityId,
    code: input.code.trim(),
    name: input.name.trim(),
  };
  for (const field of OPTIONAL_FIELDS) {
    const value = input[field];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new SalesRequestError(`Le champ ${field} doit être une chaîne de caractères`, 400);
    }
    if (typeof value === 'string' && value.trim().length > OPTIONAL_FIELD_MAX_LENGTHS[field]) {
      throw new SalesRequestError(`Le champ ${field} dépasse la longueur maximale autorisée`, 400);
    }
    if (value !== undefined) customer[field] = typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  return customer;
}

export function validateCustomerContactUpdate(data: unknown): CustomerContactUpdateInput {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new SalesRequestError('Données de coordonnées client invalides', 400);
  }
  const input = data as Record<string, unknown>;
  const contacts: CustomerContactUpdateInput = {};
  let hasContactField = false;
  for (const field of OPTIONAL_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    hasContactField = true;
    const value = input[field];
    if (value !== null && typeof value !== 'string') {
      throw new SalesRequestError(`Le champ ${field} doit être une chaîne de caractères`, 400);
    }
    if (typeof value === 'string' && value.trim().length > OPTIONAL_FIELD_MAX_LENGTHS[field]) {
      throw new SalesRequestError(`Le champ ${field} dépasse la longueur maximale autorisée`, 400);
    }
    contacts[field] = typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  if (!hasContactField) {
    throw new SalesRequestError('Au moins un champ de coordonnées doit être fourni', 400);
  }
  return contacts;
}
import { SalesRequestError } from './errors';
