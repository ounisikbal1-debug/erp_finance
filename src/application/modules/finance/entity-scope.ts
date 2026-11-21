export class EntityScopeError extends Error {
  constructor(message = 'La société demandée ne correspond pas au périmètre de votre compte.') {
    super(message);
    this.name = 'EntityScopeError';
  }
}

export function resolveEntityScope(userEntityId: string | null, requestedEntityId?: unknown): string {
  if (!userEntityId) {
    throw new EntityScopeError('Aucune société n’est associée à votre compte.');
  }
  if (requestedEntityId !== undefined && requestedEntityId !== userEntityId) {
    throw new EntityScopeError();
  }
  return userEntityId;
}
