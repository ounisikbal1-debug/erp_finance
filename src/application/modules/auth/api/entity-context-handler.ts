import type { Request, Response } from 'express';
import {
  createRuntimeAccessToken,
  getAuthSecret,
  type AuthenticatedUser,
} from '../../../auth';
import prisma from '../../../../data/prisma/client';

interface GlobalAdminAccount {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  entityId: string | null;
}

interface EntityContextOption {
  id: string;
  name: string;
  code: string;
  consolidationGroups?: Array<{
    id: string;
    name: string;
    reportingCurrencyCode: string;
  }>;
}

interface EntityContextDependencies {
  findUser: (id: string) => Promise<GlobalAdminAccount | null>;
  listEntities: () => Promise<EntityContextOption[]>;
  findEntity: (id: string) => Promise<EntityContextOption | null>;
  listScopedEntities?: (userId: string) => Promise<EntityContextOption[] | null>;
  isEntityInUserScope?: (userId: string, entityId: string) => Promise<boolean | null>;
  createAccessToken: (user: AuthenticatedUser, secret: string) => string | Promise<string>;
  getAuthSecret: () => string | null;
  logError: (operation: string, errorType: string, errorCode?: string) => void;
}

class EntityContextHandlerError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'EntityContextHandlerError';
  }
}

const defaultDependencies: EntityContextDependencies = {
  findUser: (id) => prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true, isActive: true, entityId: true },
  }),
  listEntities: async () => {
    const entities = await prisma.entity.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        ownedConsolidationGroups: {
          select: { id: true, name: true, reportingCurrencyCode: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    return entities.map(({ ownedConsolidationGroups, ...entity }) => ({
      ...entity,
      consolidationGroups: ownedConsolidationGroups,
    }));
  },
  findEntity: (id) => prisma.entity.findUnique({
    where: { id },
    select: { id: true, name: true, code: true },
  }),
  listScopedEntities: async (userId) => {
    const accesses = await prisma.consolidationGroupUserAccess.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            entities: {
              include: { entity: { include: { country: { select: { code: true } } } } },
            },
          },
        },
      },
    });
    if (accesses.length === 0) return null;
    const ids = new Set<string>();
    for (const access of accesses) {
      for (const membership of access.group.entities) {
        if (!access.countryCode || access.countryCode === membership.entity.country.code) ids.add(membership.entityId);
      }
    }
    return prisma.entity.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  },
  isEntityInUserScope: async (userId, entityId) => {
    const accesses = await prisma.consolidationGroupUserAccess.findMany({ where: { userId } });
    if (accesses.length === 0) return null;
    const entity = await prisma.entity.findUnique({ where: { id: entityId }, select: { country: { select: { code: true } } } });
    if (!entity) return false;
    return Boolean(await prisma.consolidationGroupUserAccess.findFirst({
      where: {
        userId,
        OR: [{ countryCode: null }, { countryCode: entity.country.code }],
        group: { entities: { some: { entityId } } },
      },
      select: { id: true },
    }));
  },
  createAccessToken: createRuntimeAccessToken,
  getAuthSecret,
  logError: (operation, errorType, errorCode) => console.error(
    `Erreur inattendue pendant ${operation}.`,
    { errorType, ...(errorCode ? { errorCode } : {}) },
  ),
};

function getActor(res: Response): AuthenticatedUser {
  const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!actor?.id) throw new EntityContextHandlerError('Authentification requise.', 401);
  return actor;
}

async function getGlobalAdmin(
  actor: AuthenticatedUser,
  dependencies: EntityContextDependencies,
): Promise<GlobalAdminAccount> {
  if (actor.role !== 'ADMIN') {
    throw new EntityContextHandlerError('Le changement de société est réservé à l’administrateur global.', 403);
  }

  const account = await dependencies.findUser(actor.id);
  if (!account || !account.isActive) {
    throw new EntityContextHandlerError('Session administrateur invalide.', 401);
  }
  if (account.role !== 'ADMIN' || account.entityId !== null) {
    throw new EntityContextHandlerError('Ce compte ne dispose pas d’un périmètre global.', 403);
  }
  return account;
}

function getSafeErrorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'string' && /^P\d{4}$/.test(error.code) ? error.code : undefined;
}

function handleUnexpectedError(
  res: Response,
  error: unknown,
  operation: string,
  fallbackMessage: string,
  dependencies: EntityContextDependencies,
): void {
  if (error instanceof EntityContextHandlerError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  dependencies.logError(
    operation,
    error instanceof Error ? error.name : 'UnknownError',
    getSafeErrorCode(error),
  );
  res.status(500).json({ error: fallbackMessage });
}

export function createEntityContextHandlers(dependencies = defaultDependencies) {
  return {
    list: async (_req: Request, res: Response): Promise<void> => {
      try {
        const account = await getGlobalAdmin(getActor(res), dependencies);
        const scopedEntities = await dependencies.listScopedEntities?.(account.id);
        res.json({ entities: scopedEntities ?? await dependencies.listEntities() });
      } catch (error) {
        handleUnexpectedError(
          res,
          error,
          'chargement des sociétés accessibles',
          'Impossible de charger les sociétés.',
          dependencies,
        );
      }
    },
    select: async (req: Request, res: Response): Promise<void> => {
      try {
        const actor = getActor(res);
        const account = await getGlobalAdmin(actor, dependencies);
        const entityId = req.body?.entityId;
        if (typeof entityId !== 'string' || !entityId.trim() || entityId.trim().length > 100) {
          throw new EntityContextHandlerError('Identifiant de société invalide.', 400);
        }

        const entity = await dependencies.findEntity(entityId.trim());
        if (!entity) throw new EntityContextHandlerError('Société introuvable.', 404);
        const inScope = await dependencies.isEntityInUserScope?.(account.id, entity.id);
        if (inScope === false) throw new EntityContextHandlerError('Cette société ne fait pas partie du périmètre SAFE Groupe de ce compte.', 403);

        const secret = dependencies.getAuthSecret();
        if (!secret) {
          throw new EntityContextHandlerError(
            'Authentification indisponible : configurez SAFE_ERP_AUTH_SECRET.',
            503,
          );
        }

        const accessToken = await dependencies.createAccessToken({
          id: account.id,
          username: account.username,
          role: 'ADMIN',
          entityId: entity.id,
        }, secret);
        res.json({ accessToken, entityId: entity.id });
      } catch (error) {
        handleUnexpectedError(
          res,
          error,
          'sélection de la société active',
          'Impossible de sélectionner cette société.',
          dependencies,
        );
      }
    },
  };
}
