import { EntityScopeError } from '../finance/entity-scope';
import { FxConversionError } from '../fx/conversion';

export class SalesRequestError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409 | 422) {
    super(message);
    this.name = 'SalesRequestError';
  }
}

export function isSalesUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'P2002';
}

export function getSalesErrorResponse(error: unknown): {
  status: number;
  message: string;
  unexpected: boolean;
} {
  if (error instanceof EntityScopeError) {
    return { status: 403, message: error.message, unexpected: false };
  }
  if (error instanceof SalesRequestError) {
    return { status: error.statusCode, message: error.message, unexpected: false };
  }
  if (error instanceof FxConversionError) {
    return { status: error.statusCode, message: error.message, unexpected: false };
  }
  return {
    status: 500,
    message: 'Impossible de traiter la demande commerciale.',
    unexpected: true,
  };
}
