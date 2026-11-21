import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import prisma from '../core/models/prisma';
import { SESSION_IDLE_TIMEOUT_SECONDS } from '../shared/session';
import { verifyPassword } from './security/passwords';

export const USER_ROLES = ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT', 'HR_MANAGER', 'SALES_OFFICER', 'LOGISTICS_MGR'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
  entityId: string | null;
}

export interface ModuleAccessPolicy {
  module: string;
  allowedRoles: readonly UserRole[];
}

export interface AccessPolicySnapshot {
  roles: readonly UserRole[];
  policies: ModuleAccessPolicy[];
}

export { SESSION_IDLE_TIMEOUT_SECONDS } from '../shared/session';
const activeSessions = new Map<string, { userId: string; lastActivity: number }>();

export function usesPersistentSessions(): boolean {
  return process.env.SAFE_ERP_PERSISTENT_SESSIONS === 'true';
}

interface SignedAccessTokenPayload extends AuthenticatedUser {
  sid: string;
}

interface VerifiedAccessSession {
  user: AuthenticatedUser;
  sessionId: string;
}

const API_ROLE_POLICIES: Record<string, readonly UserRole[]> = {
  dashboard: USER_ROLES,
  bi: ['ADMIN', 'FINANCIAL_MANAGER'],
  ai: ['ADMIN', 'FINANCIAL_MANAGER'],
  finance: ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT'],
  'monthly-close': ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT'],
  'advanced-finance': ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT'],
  taxation: ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT'],
  controlling: ['ADMIN', 'FINANCIAL_MANAGER'],
  anomalies: ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT'],
  budget: ['ADMIN', 'FINANCIAL_MANAGER'],
  cashflow: ['ADMIN', 'FINANCIAL_MANAGER'],
  consolidation: ['ADMIN'],
  intercompany: ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT'],
  materials: ['ADMIN', 'LOGISTICS_MGR'],
  production: ['ADMIN', 'LOGISTICS_MGR'],
  maintenance: ['ADMIN', 'LOGISTICS_MGR'],
  projects: ['ADMIN', 'FINANCIAL_MANAGER'],
  tenders: ['ADMIN', 'FINANCIAL_MANAGER'],
  'customs-regimes': ['ADMIN', 'FINANCIAL_MANAGER', 'LOGISTICS_MGR'],
  quality: ['ADMIN', 'HR_MANAGER', 'LOGISTICS_MGR'],
  purchases: ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT'],
  'fx-rates': ['ADMIN', 'FINANCIAL_MANAGER', 'SALES_OFFICER'],
  sales: ['ADMIN', 'FINANCIAL_MANAGER', 'SALES_OFFICER'],
  receivables: ['ADMIN', 'FINANCIAL_MANAGER', 'SALES_OFFICER'],
  hr: ['ADMIN', 'HR_MANAGER'],
  admin: ['ADMIN'],
};

export function getModuleRoles(moduleName: string): readonly UserRole[] | undefined {
  return API_ROLE_POLICIES[moduleName];
}

export function getAccessPolicySnapshot(): AccessPolicySnapshot {
  return {
    roles: [...USER_ROLES],
    policies: Object.entries(API_ROLE_POLICIES).map(([module, allowedRoles]) => ({
      module,
      allowedRoles: [...allowedRoles],
    })),
  };
}

export function getAuthSecret(): string | null {
  const secret = process.env.SAFE_ERP_AUTH_SECRET;
  return secret && Buffer.byteLength(secret, 'utf8') >= 32 ? secret : null;
}

function signAccessToken(user: AuthenticatedUser, sessionId: string, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    ...user,
    sid: sessionId,
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function readAccessTokenPayload(token: string, secret: string): SignedAccessTokenPayload | null {
  const [headerPart, payloadPart, signaturePart, ...extra] = token.split('.');
  if (!headerPart || !payloadPart || !signaturePart || extra.length > 0) return null;

  const expectedSignature = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest();
  const actualSignature = Buffer.from(signaturePart, 'base64url');
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    return null;
  }

  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (
      header.alg !== 'HS256' ||
      typeof payload.id !== 'string' ||
      typeof payload.username !== 'string' ||
      !USER_ROLES.includes(payload.role) ||
      !(payload.entityId === null || typeof payload.entityId === 'string') ||
      typeof payload.sid !== 'string'
    ) {
      return null;
    }

    return {
      id: payload.id,
      username: payload.username,
      role: payload.role,
      entityId: payload.entityId,
      sid: payload.sid,
    };
  } catch {
    return null;
  }
}

export function createAccessToken(user: AuthenticatedUser, secret: string, now = Date.now()): string {
  for (const [sessionId, session] of activeSessions) {
    if (now - session.lastActivity >= SESSION_IDLE_TIMEOUT_SECONDS * 1000) {
      activeSessions.delete(sessionId);
    }
  }

  const sessionId = randomUUID();
  activeSessions.set(sessionId, { userId: user.id, lastActivity: now });
  return signAccessToken(user, sessionId, secret);
}

export async function createPersistentAccessToken(
  user: AuthenticatedUser,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const sessionId = randomUUID();
  await prisma.authSession.deleteMany({
    where: { lastActivityAt: { lt: new Date(now - SESSION_IDLE_TIMEOUT_SECONDS * 1000) } },
  });
  await prisma.authSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      entityId: user.entityId,
      lastActivityAt: new Date(now),
    },
  });
  return signAccessToken(user, sessionId, secret);
}

export function createRuntimeAccessToken(user: AuthenticatedUser, secret: string): Promise<string> {
  if (usesPersistentSessions()) {
    return createPersistentAccessToken(user, secret);
  }
  return Promise.resolve(createAccessToken(user, secret));
}

function verifyLocalAccessSession(
  token: string,
  secret: string,
  now = Date.now(),
): VerifiedAccessSession | null {
  const payload = readAccessTokenPayload(token, secret);
  if (!payload) return null;

  const session = activeSessions.get(payload.sid);
  if (!session || session.userId !== payload.id
    || now - session.lastActivity >= SESSION_IDLE_TIMEOUT_SECONDS * 1000) {
    activeSessions.delete(payload.sid);
    return null;
  }
  activeSessions.set(payload.sid, { ...session, lastActivity: now });

  return {
    sessionId: payload.sid,
    user: {
      id: payload.id,
      username: payload.username,
      role: payload.role,
      entityId: payload.entityId,
    },
  };
}

async function verifyPersistentAccessSession(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<VerifiedAccessSession | null> {
  const payload = readAccessTokenPayload(token, secret);
  if (!payload) return null;

  const session = await prisma.authSession.findUnique({
    where: { id: payload.sid },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          role: true,
          isActive: true,
          entityId: true,
        },
      },
    },
  });
  if (!session || session.userId !== payload.id || session.revokedAt) return null;

  if (now - session.lastActivityAt.getTime() >= SESSION_IDLE_TIMEOUT_SECONDS * 1000) {
    await prisma.authSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(now) },
    });
    return null;
  }

  const account = session.user;
  if (
    !account.isActive
    || account.username !== payload.username
    || account.role !== payload.role
    || !(USER_ROLES as readonly string[]).includes(account.role)
  ) {
    return null;
  }
  let entityContextMatches = account.entityId === payload.entityId && session.entityId === payload.entityId;
  if (account.entityId === null) {
    const scopedAccessCount = await prisma.consolidationGroupUserAccess.count({ where: { userId: account.id } });
    if (scopedAccessCount > 0) {
      const entity = await prisma.entity.findUnique({ where: { id: payload.entityId }, select: { country: { select: { code: true } } } });
      const groupAccess = entity ? await prisma.consolidationGroupUserAccess.findFirst({
        where: {
          userId: account.id,
          role: account.role,
          group: { entities: { some: { entityId: payload.entityId } } },
          OR: [{ countryCode: null }, { countryCode: entity.country.code }],
        },
        select: { id: true },
      }) : null;
      entityContextMatches = session.entityId === payload.entityId && Boolean(groupAccess);
    } else {
      entityContextMatches = account.role === 'ADMIN' && session.entityId === payload.entityId;
    }
  }
  if (!entityContextMatches) return null;

  const activityUpdate = await prisma.authSession.updateMany({
    where: { id: session.id, revokedAt: null },
    data: { lastActivityAt: new Date(now) },
  });
  if (activityUpdate.count !== 1) return null;

  return {
    sessionId: session.id,
    user: {
      id: account.id,
      username: account.username,
      role: account.role as UserRole,
      entityId: payload.entityId,
    },
  };
}

export async function verifyPersistentAccessToken(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<AuthenticatedUser | null> {
  return (await verifyPersistentAccessSession(token, secret, now))?.user ?? null;
}

export function verifyAccessToken(token: string, secret: string, now = Date.now()): AuthenticatedUser | null {
  return verifyLocalAccessSession(token, secret, now)?.user ?? null;
}

export async function authenticateCredentials(username: string, password: string): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) return null;
  if (!(USER_ROLES as readonly string[]).includes(user.role)) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role as UserRole,
    entityId: user.entityId,
  };
}

export function revokeUserSessions(userId: string): void {
  for (const [sessionId, session] of activeSessions) {
    if (session.userId === userId) activeSessions.delete(sessionId);
  }
}

export async function revokeAccessSession(sessionId: string): Promise<void> {
  if (!sessionId) throw new Error('Identifiant de session manquant.');
  activeSessions.delete(sessionId);
  if (usesPersistentSessions()) {
    await prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const secret = getAuthSecret();
  if (!secret) {
    res.status(503).json({ error: 'Authentification indisponible : SAFE_ERP_AUTH_SECRET doit contenir au moins 32 octets.' });
    return;
  }

  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.get('authorization') ?? '');
  if (!match) {
    res.status(401).json({ error: 'Authentification requise ou jeton invalide.' });
    return;
  }

  let session: VerifiedAccessSession | null;
  try {
    session = usesPersistentSessions()
      ? await verifyPersistentAccessSession(match[1], secret)
      : verifyLocalAccessSession(match[1], secret);
  } catch (error) {
    console.error('Erreur inattendue pendant la vérification de session.', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    res.status(503).json({ error: 'Le service d’authentification est temporairement indisponible.' });
    return;
  }
  if (!session) {
    res.status(401).json({ error: 'Authentification requise ou jeton invalide.' });
    return;
  }

  res.locals.authenticatedUser = session.user;
  res.locals.authenticatedSessionId = session.sessionId;
  next();
}

/*
 * The session map remains the isolated local-development/test implementation.
 * Production verification and issuance use AuthSession in the shared database.
 */

export function authenticateBusinessIntelligence(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Le connecteur Power BI est strictement en lecture seule.' });
    return;
  }

  const authorization = req.header('authorization') ?? '';
  if (/^Bearer /i.test(authorization)) {
    authenticate(req, res, next);
    return;
  }

  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (!match) {
    res.status(401).json({ error: 'Authentification SAFE requise pour le connecteur BI.' });
    return;
  }
  const credentials = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = credentials.indexOf(':');
  if (
    separator <= 0
    || !/^[A-Za-z0-9+/]+={0,2}$/i.test(match[1])
    || Buffer.from(credentials, 'utf8').toString('base64') !== match[1]
  ) {
    res.status(401).json({ error: 'Identifiants SAFE invalides.' });
    return;
  }

  const remoteAddress = req.socket.remoteAddress ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress)) {
    res.status(403).json({ error: 'L’authentification Basic BI est réservée à Power BI Desktop sur la machine SAFE.' });
    return;
  }

  const username = credentials.slice(0, separator);
  const password = credentials.slice(separator + 1);
  if (!username.trim() || username.length > 100 || !password || password.length > 1024) {
    res.status(401).json({ error: 'Identifiants SAFE invalides.' });
    return;
  }

  void authenticateCredentials(username.trim(), password).then((user) => {
    if (!user) {
      res.status(401).json({ error: 'Identifiants SAFE invalides.' });
      return;
    }
    res.locals.authenticatedUser = user;
    next();
  }).catch((error: unknown) => {
    console.error('Erreur inattendue pendant l’authentification BI locale:', error);
    res.status(500).json({ error: 'Impossible d’authentifier le connecteur BI.' });
  });
}

export function authorize(...allowedRoles: readonly UserRole[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!user) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ error: 'Accès interdit pour ce rôle.' });
      return;
    }
    next();
  };
}
