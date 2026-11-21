import { EntityScopeError } from '../finance/entity-scope';

export class HrRequestError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409 | 413 | 415 | 422) {
    super(message);
    this.name = 'HrRequestError';
  }
}

export function getHrErrorResponse(error: unknown): {
  status: number;
  message: string;
  unexpected: boolean;
} {
  if (error instanceof EntityScopeError) {
    return { status: 403, message: error.message, unexpected: false };
  }
  if (error instanceof HrRequestError) {
    return { status: error.statusCode, message: error.message, unexpected: false };
  }
  return {
    status: 500,
    message: 'Impossible de traiter la demande RH.',
    unexpected: true,
  };
}
