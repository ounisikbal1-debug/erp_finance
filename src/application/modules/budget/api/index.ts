import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { EntityScopeError, resolveEntityScope } from '../../finance/entity-scope';
import { BudgetRequestError } from '../errors';
import BudgetService from '../service';

const router = Router();

function getUser(res: Response): AuthenticatedUser | undefined {
  return res.locals.authenticatedUser as AuthenticatedUser | undefined;
}

function getScopedEntity(res: Response, requestedEntityId?: unknown): string {
  return resolveEntityScope(getUser(res)?.entityId ?? null, requestedEntityId);
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof EntityScopeError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof BudgetRequestError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error('Erreur inattendue dans le module budget:', error);
  res.status(500).json({ error: 'Le module budget est indisponible.' });
}

router.get('/data', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const data = await BudgetService.getModuleData(entityId, req.query.period);
    res.json(data);
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/annual-forecast', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await BudgetService.getAnnualForecast(entityId, req.query.asOfPeriod));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/lines', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const user = getUser(res);
    if (!user) throw new EntityScopeError('Authentification requise.');
    const line = await BudgetService.createDraftLine(req.body, entityId, user.id);
    res.status(201).json(line);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/lines/:id/approve', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const user = getUser(res);
    if (!user) throw new EntityScopeError('Authentification requise.');
    const line = await BudgetService.approveLine(req.params.id, entityId, user.id);
    res.json(line);
  } catch (error) {
    respondError(res, error);
  }
});

router.patch('/lines/:id', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const line = await BudgetService.updateDraftAmount(req.params.id, entityId, req.body);
    res.json(line);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/lines/:id/revisions', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const user = getUser(res);
    if (!user) throw new EntityScopeError('Authentification requise.');
    res.status(201).json(await BudgetService.createRevision(req.params.id, entityId, req.body, user.id));
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
