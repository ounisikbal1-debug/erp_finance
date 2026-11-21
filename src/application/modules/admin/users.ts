import type { UserRole } from '../../auth';
import { revokeUserSessions, USER_ROLES, usesPersistentSessions } from '../../auth';
import { Prisma } from '@prisma/client';
import prisma from '../../../core/models/prisma';
import { hashPassword } from '../../security/passwords';

export class AdminUserError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AdminUserError';
  }
}

export interface AdminUserInput {
  username: string;
  password: string;
  role: UserRole;
  entityId: string | null;
}

export interface AdminUserUpdate {
  role: UserRole;
  entityId: string | null;
}

export interface AdminUserActor {
  id: string;
  username: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseRole(value: unknown): UserRole {
  if (typeof value !== 'string' || !(USER_ROLES as readonly string[]).includes(value)) {
    throw new AdminUserError('Rôle utilisateur inconnu.', 400);
  }
  return value as UserRole;
}

function parseEntityId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 100) {
    throw new AdminUserError('Identifiant de société invalide.', 400);
  }
  return value.trim() || null;
}

export function validateAdminUserInput(value: unknown): AdminUserInput {
  if (!isRecord(value)) throw new AdminUserError('Données utilisateur invalides.', 400);
  if (typeof value.username !== 'string') throw new AdminUserError('Identifiant utilisateur invalide.', 400);
  const username = value.username.trim();
  if (!/^[A-Za-z0-9._-]{3,100}$/.test(username)) {
    throw new AdminUserError('L’identifiant doit contenir 3 à 100 caractères (lettres, chiffres, point, tiret ou souligné).', 400);
  }
  if (typeof value.password !== 'string' || value.password.length < 12 || value.password.length > 1024) {
    throw new AdminUserError('Le mot de passe doit contenir de 12 à 1024 caractères.', 400);
  }
  return {
    username,
    password: value.password,
    role: parseRole(value.role),
    entityId: parseEntityId(value.entityId),
  };
}

export function validateAdminUserUpdate(value: unknown): AdminUserUpdate {
  if (!isRecord(value)) throw new AdminUserError('Mise à jour utilisateur invalide.', 400);
  return {
    role: parseRole(value.role),
    entityId: parseEntityId(value.entityId),
  };
}

export function validateAdminUserPasswordReset(value: unknown): string {
  if (!isRecord(value) || typeof value.password !== 'string'
    || value.password.length < 12 || value.password.length > 1024) {
    throw new AdminUserError('Le mot de passe doit contenir de 12 à 1024 caractères.', 400);
  }
  return value.password;
}

export function validateAdminUserStatus(value: unknown): boolean {
  if (!isRecord(value) || typeof value.isActive !== 'boolean') {
    throw new AdminUserError('Le statut actif du compte doit être booléen.', 400);
  }
  return value.isActive;
}

const publicUserSelect = {
  id: true,
  username: true,
  role: true,
  isActive: true,
  entityId: true,
  createdAt: true,
  entity: { select: { name: true } },
} as const;

export class AdminUserService {
  private static async getActorEntityScope(actorId: string): Promise<string | null> {
    const account = await prisma.user.findUnique({
      where: { id: actorId },
      select: { role: true, isActive: true, entityId: true },
    });
    if (!account) return null;
    if (!account.isActive || account.role !== 'ADMIN') {
      throw new AdminUserError('Un compte administrateur actif est requis.', 403);
    }
    return account.entityId;
  }

  private static assertEntityScope(scope: string | null, entityId: string | null): void {
    if (scope !== null && entityId !== scope) {
      throw new AdminUserError('Un administrateur d’entité ne peut gérer que les comptes de son entité.', 403);
    }
  }

  static async list(actorId: string) {
    const entityScope = await this.getActorEntityScope(actorId);
    const users = await prisma.user.findMany({
      where: entityScope === null ? undefined : { entityId: entityScope },
      select: publicUserSelect,
      orderBy: { username: 'asc' },
    });
    const userIds = users.map((user) => user.id);
    const [entities, events] = await Promise.all([
      prisma.entity.findMany({
        where: entityScope === null ? undefined : { id: entityScope },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.adminUserEvent.findMany({
        where: entityScope === null ? undefined : { targetUserId: { in: userIds } },
        select: {
          id: true,
          actorUsername: true,
          targetUsername: true,
          action: true,
          previousRole: true,
          nextRole: true,
          previousEntityId: true,
          nextEntityId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { users, entities, events };
  }

  static async create(value: unknown, actor: AdminUserActor) {
    const entityScope = await this.getActorEntityScope(actor.id);
    const input = validateAdminUserInput(value);
    this.assertEntityScope(entityScope, input.entityId);
    if (input.entityId) {
      const entity = await prisma.entity.findUnique({ where: { id: input.entityId }, select: { id: true } });
      if (!entity) throw new AdminUserError('Société introuvable.', 404);
    }

    try {
      const passwordHash = await hashPassword(input.password);
      return await prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            username: input.username,
            passwordHash,
            role: input.role,
            entityId: input.entityId,
          },
          select: publicUserSelect,
        });
        await transaction.adminUserEvent.create({
          data: {
            actorUserId: actor.id,
            actorUsername: actor.username,
            targetUserId: user.id,
            targetUsername: user.username,
            action: 'USER_CREATED',
            nextRole: input.role,
            nextEntityId: input.entityId,
          },
        });
        return user;
      });
    } catch (error) {
      if (isRecord(error) && error.code === 'P2002') {
        throw new AdminUserError('Cet identifiant utilisateur existe déjà.', 409);
      }
      throw error;
    }
  }

  static async update(id: string, value: unknown, actor: AdminUserActor) {
    const entityScope = await this.getActorEntityScope(actor.id);
    if (!id || id.length > 100) throw new AdminUserError('Identifiant utilisateur invalide.', 400);
    if (id === actor.id) {
      throw new AdminUserError('Un administrateur ne peut pas modifier son propre rôle ou périmètre.', 409);
    }
    const input = validateAdminUserUpdate(value);
    if (input.entityId) {
      const entity = await prisma.entity.findUnique({ where: { id: input.entityId }, select: { id: true } });
      if (!entity) throw new AdminUserError('Société introuvable.', 404);
    }

    const updatedUser = await prisma.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: { id },
        select: { id: true, username: true, role: true, isActive: true, entityId: true },
      });
      if (!target) throw new AdminUserError('Utilisateur introuvable.', 404);
      this.assertEntityScope(entityScope, target.entityId);
      this.assertEntityScope(entityScope, input.entityId);

      if (target.isActive && target.role === 'ADMIN' && input.role !== 'ADMIN') {
        const administratorCount = await transaction.user.count({ where: { role: 'ADMIN', isActive: true, entityId: target.entityId } });
        if (administratorCount <= 1) {
          throw new AdminUserError('Le dernier compte administrateur ne peut pas perdre son rôle.', 409);
        }
      }

      const updated = await transaction.user.update({
        where: { id },
        data: { role: input.role, entityId: input.entityId },
        select: publicUserSelect,
      });
      if (usesPersistentSessions()) {
        await transaction.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await transaction.adminUserEvent.create({
        data: {
          actorUserId: actor.id,
          actorUsername: actor.username,
          targetUserId: target.id,
          targetUsername: target.username,
          action: 'USER_ACCESS_UPDATED',
          previousRole: target.role,
          nextRole: input.role,
          previousEntityId: target.entityId,
          nextEntityId: input.entityId,
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revokeUserSessions(id);
    return updatedUser;
  }

  static async setActive(id: string, value: unknown, actor: AdminUserActor) {
    const entityScope = await this.getActorEntityScope(actor.id);
    if (!id || id.length > 100) throw new AdminUserError('Identifiant utilisateur invalide.', 400);
    const isActive = validateAdminUserStatus(value);
    if (!isActive && id === actor.id) {
      throw new AdminUserError('Un administrateur ne peut pas désactiver son propre compte.', 409);
    }

    const updatedUser = await prisma.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: { id },
        select: { id: true, username: true, role: true, isActive: true, entityId: true },
      });
      if (!target) throw new AdminUserError('Utilisateur introuvable.', 404);
      this.assertEntityScope(entityScope, target.entityId);
      if (target.isActive === isActive) {
        throw new AdminUserError(`Le compte est déjà ${isActive ? 'actif' : 'inactif'}.`, 409);
      }

      if (!isActive && target.role === 'ADMIN') {
        const activeAdministratorCount = await transaction.user.count({
          where: { role: 'ADMIN', isActive: true, entityId: target.entityId },
        });
        if (activeAdministratorCount <= 1) {
          throw new AdminUserError('Le dernier administrateur actif ne peut pas être désactivé.', 409);
        }
      }

      const updated = await transaction.user.update({
        where: { id },
        data: { isActive },
        select: publicUserSelect,
      });
      if (!isActive && usesPersistentSessions()) {
        await transaction.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await transaction.adminUserEvent.create({
        data: {
          actorUserId: actor.id,
          actorUsername: actor.username,
          targetUserId: target.id,
          targetUsername: target.username,
          action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          previousRole: target.role,
          nextRole: target.role,
          previousEntityId: target.entityId,
          nextEntityId: target.entityId,
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!isActive) revokeUserSessions(id);
    return updatedUser;
  }

  static async resetPassword(id: string, value: unknown, actor: AdminUserActor) {
    const entityScope = await this.getActorEntityScope(actor.id);
    if (!id || id.length > 100) throw new AdminUserError('Identifiant utilisateur invalide.', 400);
    if (id === actor.id) {
      throw new AdminUserError('Un administrateur ne peut pas réinitialiser son propre mot de passe ici.', 409);
    }
    const password = validateAdminUserPasswordReset(value);
    const updatedUser = await prisma.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: { id },
        select: { id: true, username: true, role: true, entityId: true },
      });
      if (!target) throw new AdminUserError('Utilisateur introuvable.', 404);
      this.assertEntityScope(entityScope, target.entityId);

      const passwordHash = await hashPassword(password);
      const updated = await transaction.user.update({
        where: { id },
        data: { passwordHash },
        select: publicUserSelect,
      });
      if (usesPersistentSessions()) {
        await transaction.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await transaction.adminUserEvent.create({
        data: {
          actorUserId: actor.id,
          actorUsername: actor.username,
          targetUserId: target.id,
          targetUsername: target.username,
          action: 'USER_PASSWORD_RESET',
          previousRole: target.role,
          nextRole: target.role,
          previousEntityId: target.entityId,
          nextEntityId: target.entityId,
        },
      });
      return updated;
    });
    revokeUserSessions(id);
    return updatedUser;
  }
}
