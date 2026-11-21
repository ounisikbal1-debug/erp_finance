import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { EntityScopeError, resolveEntityScope } from '../../finance/entity-scope';
import ConsolidationService from '../service';
import { ConsolidationRequestError } from '../errors';
import prisma from '../../../../data/prisma/client';

const router = Router();

router.use(async (_req, res, next) => {
  const actor = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!actor?.id || actor.role !== 'ADMIN') {
    res.status(403).json({ error: 'Le module de consolidation est réservé à l’administrateur du groupe.' });
    return;
  }
  try {
    const account = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { role: true, entityId: true, isActive: true },
    });
    if (!account?.isActive || account.role !== 'ADMIN' || account.entityId !== null) {
      res.status(403).json({ error: 'Le module de consolidation est réservé à l’administrateur du groupe.' });
      return;
    }
    next();
  } catch (error) {
    console.error('Impossible de vérifier le périmètre du module consolidation.', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    res.status(503).json({ error: 'Le contrôle du périmètre de consolidation est temporairement indisponible.' });
  }
});

function getUser(res: Response): AuthenticatedUser | undefined {
  return res.locals.authenticatedUser as AuthenticatedUser | undefined;
}

function getActorUserId(res: Response): string {
  const userId = getUser(res)?.id;
  if (!userId?.trim()) {
    throw new ConsolidationRequestError('Une identité authentifiée est requise.', 401);
  }
  return userId;
}

function getOwnerEntity(res: Response, requestedEntityId?: unknown): string {
  return resolveEntityScope(getUser(res)?.entityId ?? null, requestedEntityId);
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof EntityScopeError) {
    res.status(403).json({ error: error.message });
  } else if (error instanceof ConsolidationRequestError) {
    res.status(error.statusCode).json({ error: error.message });
  } else {
    console.error('Erreur inattendue dans le module consolidation:', error);
    res.status(500).json({ error: 'Le module de consolidation est indisponible.' });
  }
}

router.get('/entities', async (_req, res) => {
  try {
    getOwnerEntity(res);
    res.json(await ConsolidationService.listEntities());
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/groups', async (_req, res) => {
  try {
    res.json(await ConsolidationService.listGroups(getOwnerEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/groups', async (req, res) => {
  try {
    res.status(201).json(await ConsolidationService.createGroup(req.body, getOwnerEntity(res, req.body?.ownerEntityId)));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/groups/:groupId', async (req, res) => {
  try {
    res.json(await ConsolidationService.getGroup(req.params.groupId, getOwnerEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/groups/:groupId/entities', async (req, res) => {
  try {
    res.status(201).json(await ConsolidationService.addEntity(req.body, req.params.groupId, getOwnerEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.put('/groups/:groupId/elimination-policy', async (req, res) => {
  try {
    res.json(await ConsolidationService.setEliminationPolicy(
      req.body,
      req.params.groupId,
      getOwnerEntity(res),
      getActorUserId(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.put('/groups/:groupId/entities/:entityId/account-mappings', async (req, res) => {
  try {
    res.json(await ConsolidationService.setAccountMappings(
      req.body,
      req.params.groupId,
      req.params.entityId,
      getOwnerEntity(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/groups/:groupId/entities/:entityId/accounts', async (req, res) => {
  try {
    res.json(await ConsolidationService.listMemberAccounts(
      req.params.groupId,
      req.params.entityId,
      getOwnerEntity(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.put('/groups/:groupId/entities/:entityId/fx-rate', async (req, res) => {
  try {
    res.json(await ConsolidationService.setFxRate(
      req.body,
      req.params.groupId,
      req.params.entityId,
      getOwnerEntity(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/groups/:groupId/adjustments', async (req, res) => {
  try {
    res.status(201).json(await ConsolidationService.createAdjustment(
      req.body,
      req.params.groupId,
      getOwnerEntity(res),
      getUser(res)?.id,
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/adjustments/:adjustmentId/approve', async (req, res) => {
  try {
    res.json(await ConsolidationService.approveAdjustment(
      req.params.adjustmentId,
      getOwnerEntity(res),
      getActorUserId(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/groups/:groupId/runs', async (req, res) => {
  try {
    res.status(201).json(await ConsolidationService.run(
      req.params.groupId,
      getOwnerEntity(res),
      req.body?.period,
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/runs/:runId', async (req, res) => {
  try {
    res.json(await ConsolidationService.getRun(req.params.runId, getOwnerEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
