import { EntityScopeError } from './entity-scope';

export class FinanceRequestError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409 | 422) {
    super(message);
    this.name = 'FinanceRequestError';
  }
}

export function getFinanceErrorResponse(error: unknown): {
  status: number;
  message: string;
  unexpected: boolean;
} {
  if (error instanceof EntityScopeError) {
    return { status: 403, message: error.message, unexpected: false };
  }
  if (error instanceof FinanceRequestError) {
    return { status: error.statusCode, message: error.message, unexpected: false };
  }
  return {
    status: 500,
    message: 'Impossible de traiter la demande comptable.',
    unexpected: true,
  };
}
