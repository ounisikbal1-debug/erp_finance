import { MaterialsRequestError } from './errors';

export interface VendorInput {
  code: string;
  name: string;
  fiscalId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  entityId: string;
}

const OPTIONAL_FIELDS = ['fiscalId', 'email', 'phone', 'address'] as const;
const MAX_LENGTHS = { fiscalId: 50, email: 254, phone: 40, address: 500 } as const;

export function validateVendorInput(data: unknown, entityId: string): VendorInput {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new MaterialsRequestError('Données fournisseur invalides.', 400);
  }
  const input = data as Record<string, unknown>;
  if (typeof input.code !== 'string' || !input.code.trim()
    || typeof input.name !== 'string' || !input.name.trim()) {
    throw new MaterialsRequestError('Le code et le nom du fournisseur sont obligatoires.', 400);
  }

  const vendor: VendorInput = {
    code: input.code.trim(),
    name: input.name.trim(),
    entityId,
  };
  for (const field of OPTIONAL_FIELDS) {
    const value = input[field];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new MaterialsRequestError(`Le champ ${field} doit être une chaîne de caractères.`, 400);
    }
    if (typeof value === 'string' && value.trim().length > MAX_LENGTHS[field]) {
      throw new MaterialsRequestError(`Le champ ${field} dépasse la longueur maximale autorisée.`, 400);
    }
    if (value !== undefined) vendor[field] = typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  return vendor;
}
