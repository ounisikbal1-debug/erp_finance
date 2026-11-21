import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../application/auth';
import { EntityScopeError, resolveEntityScope } from '../../../application/modules/finance/entity-scope';
import { ProductionRequestError } from '../../../application/modules/production/errors';
import ProductionService from '../../../application/modules/production/service';

const router = Router();

function getScopedEntity(res: Response, requestedEntityId?: unknown): string {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

function getActor(res: Response): AuthenticatedUser | undefined {
  return res.locals.authenticatedUser as AuthenticatedUser | undefined;
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof EntityScopeError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof ProductionRequestError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error('Erreur inattendue dans le module production:', error);
  res.status(500).json({ error: 'Le module production est indisponible.' });
}

router.get('/data', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await ProductionService.getModuleData(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/orders', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const order = await ProductionService.createDraftOrder(req.body, entityId);
    res.status(201).json(order);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/orders/:id/post', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const order = await ProductionService.postOrder(req.params.id, entityId, getActor(res));
    res.json(order);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/orders/:id/cancel', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const order = await ProductionService.cancelDraftOrder(
      req.params.id,
      entityId,
      req.body?.reason,
      getActor(res),
    );
    res.json(order);
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
