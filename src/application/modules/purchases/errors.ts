import { EntityScopeError } from '../finance/entity-scope';
import { FxConversionError } from '../fx/conversion';

export class PurchaseRequestError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409 | 422) {
    super(message);
    this.name = 'PurchaseRequestError';
  }
}

export function isPurchaseUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'P2002';
}

export function getPurchaseErrorResponse(error: unknown) {
  if (error instanceof EntityScopeError) {
    return { status: 403, message: error.message, unexpected: false };
  }
  if (error instanceof PurchaseRequestError) {
    return { status: error.statusCode, message: error.message, unexpected: false };
  }
  if (error instanceof FxConversionError) {
    return { status: error.statusCode, message: error.message, unexpected: false };
  }
  return {
    status: 500,
    message: 'Impossible de traiter la facture fournisseur.',
    unexpected: true,
  };
}
