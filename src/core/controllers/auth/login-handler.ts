import type { Request, Response } from 'express';
import {
  authenticateCredentials,
  createRuntimeAccessToken,
  getAuthSecret,
  SESSION_IDLE_TIMEOUT_SECONDS,
  type AuthenticatedUser,
} from '../../../application/auth';
import prisma from '../../models/prisma';
import { getLoginAccountRole } from '../../../shared/login-account-types';

interface LoginHandlerDependencies {
  authenticateCredentials: (username: string, password: string) => Promise<AuthenticatedUser | null>;
  findEntity: (id: string) => Promise<{ id: string } | null>;
  findGroupAccess?: (userId: string, entityId: string) => Promise<{ role: string } | null>;
  hasGroupAccess?: (userId: string) => Promise<boolean>;
  createAccessToken: (user: AuthenticatedUser, secret: string) => string | Promise<string>;
  getAuthSecret: () => string | null;
  logError: (errorType: string, errorCode?: string) => void;
}

const defaultDependencies: LoginHandlerDependencies = {
  authenticateCredentials,
  findEntity: (id) => prisma.entity.findUnique({ where: { id }, select: { id: true } }),
  findGroupAccess: async (userId, entityId) => {
    const entity = await prisma.entity.findUnique({ where: { id: entityId }, select: { country: { select: { code: true } } } });
    if (!entity) return null;
    return prisma.consolidationGroupUserAccess.findFirst({
      where: {
        userId,
        group: { entities: { some: { entityId } } },
        OR: [{ countryCode: null }, { countryCode: entity.country.code }],
      },
      select: { role: true },
    });
  },
  hasGroupAccess: async (userId) => (await prisma.consolidationGroupUserAccess.count({ where: { userId } })) > 0,
  createAccessToken: createRuntimeAccessToken,
  getAuthSecret,
  logError: (errorType, errorCode) => console.error(
    'Échec interne du service de connexion.',
    { errorType, ...(errorCode ? { errorCode } : {}) },
  ),
};

export function createLoginHandler(dependencies = defaultDependencies) {
  return async (req: Request, res: Response): Promise<void> => {
    const { username, password, entityId, accountType } = req.body ?? {};
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      !username.trim() ||
      !password ||
      username.length > 100 ||
      password.length > 1024 ||
      (entityId !== undefined && (typeof entityId !== 'string' || !entityId.trim() || entityId.length > 100)) ||
      (accountType !== undefined && (typeof accountType !== 'string' || !accountType.trim()))
    ) {
      res.status(400).json({ error: 'Identifiant ou mot de passe invalide.' });
      return;
    }

    try {
      const secret = dependencies.getAuthSecret();
      if (!secret) {
        res.status(503).json({ error: 'Authentification indisponible : configurez SAFE_ERP_AUTH_SECRET.' });
        return;
      }

      const user = await dependencies.authenticateCredentials(username.trim(), password);
      if (!user) {
        res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
        return;
      }

      if (accountType) {
        const selectedRole = getLoginAccountRole(accountType);
        if (!selectedRole || selectedRole !== user.role) {
          res.status(401).json({ error: 'Identifiant, entité ou type de compte incorrect.' });
          return;
        }
      }

      let scopedUser: AuthenticatedUser = user;
      if (entityId) {
        const entity = await dependencies.findEntity(entityId.trim());
        if (!entity) {
          res.status(401).json({ error: 'Identifiant, entité ou type de compte incorrect.' });
          return;
        }
        const directEntityAccess = user.entityId === entity.id;
        const groupAccess = directEntityAccess ? null : await dependencies.findGroupAccess?.(user.id, entity.id) ?? null;
        const hasAnyGroupAccess = user.entityId === null && dependencies.hasGroupAccess
          ? await dependencies.hasGroupAccess(user.id)
          : false;
        const globalAdministrator = user.role === 'ADMIN' && user.entityId === null && !hasAnyGroupAccess;
        if (!directEntityAccess && !globalAdministrator && groupAccess?.role !== user.role) {
          res.status(401).json({ error: 'Identifiant, entité ou type de compte incorrect.' });
          return;
        }
        scopedUser = { ...user, entityId: entity.id };
      }

      res.json({
        accessToken: await dependencies.createAccessToken(scopedUser, secret),
        tokenType: 'Bearer',
        expiresIn: SESSION_IDLE_TIMEOUT_SECONDS,
        user: scopedUser,
      });
    } catch (error) {
      const errorCode = error !== null && typeof error === 'object' && 'code' in error
        && typeof error.code === 'string'
        && /^P\d{4}$/.test(error.code)
        ? error.code
        : undefined;
      dependencies.logError(error instanceof Error ? error.name : 'UnknownError', errorCode);
      res.status(500).json({ error: 'Le service de connexion est temporairement indisponible.' });
    }
  };
}
