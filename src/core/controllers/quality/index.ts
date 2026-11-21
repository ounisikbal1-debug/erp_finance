import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../application/auth';
import { EntityScopeError, resolveEntityScope } from '../../../application/modules/finance/entity-scope';
import { getQualityErrorResponse } from '../../../application/modules/quality/errors';
import QualityService from '../../../application/modules/quality/service';

const router = Router();

function getScopedEntity(res: Response) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null);
}

function respondError(res: Response, error: unknown) {
  if (error instanceof EntityScopeError) {
    res.status(403).json({ error: error.message });
    return;
  }
  const response = getQualityErrorResponse(error);
  if (response.unexpected) console.error('Erreur inattendue dans le module Qualité:', error);
  res.status(response.status).json({ error: response.message });
}

router.get('/equipment', async (_req, res) => {
  try {
    res.json(await QualityService.listEquipment(getScopedEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/findings', async (_req, res) => {
  try {
    res.json(await QualityService.listFindings(getScopedEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/findings', async (req, res) => {
  try {
    res.status(201).json(await QualityService.createFinding(req.body, getScopedEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.patch('/findings/:id', async (req, res) => {
  try {
    res.json(await QualityService.updateFinding(req.params.id, req.body, getScopedEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/findings/:id/actions', async (req, res) => {
  try {
    res.status(201).json(await QualityService.createAction(req.params.id, req.body, getScopedEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.patch('/actions/:id', async (req, res) => {
  try {
    res.json(await QualityService.updateAction(req.params.id, req.body, getScopedEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
