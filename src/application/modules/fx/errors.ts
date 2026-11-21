import { EntityScopeError } from '../finance/entity-scope';
import { FxConversionError } from './conversion';
import { FxRevaluationError } from './open-balance-revaluation';

export function getFxErrorResponse(error: unknown) {
  if (error instanceof EntityScopeError) {
    return { status: 403, message: error.message, unexpected: false };
  }
  if (error instanceof FxConversionError) {
    return { status: error.statusCode, message: error.message, unexpected: false };
  }
  if (error instanceof FxRevaluationError) {
    return { status: error.statusCode, message: error.message, unexpected: false };
  }
  return {
    status: 500,
    message: 'Impossible de traiter les taux de change.',
    unexpected: true,
  };
}
