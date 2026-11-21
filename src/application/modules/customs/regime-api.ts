import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../auth';
import { EntityScopeError, resolveEntityScope } from '../finance/entity-scope';
import { CustomsRegimeService } from '../../../core/services/customs/regime-service';
import { CustomsRegimeError } from './regimes';

export interface CustomsRegimeApiService {
  list(entityId: string): Promise<unknown>;
  createRegime(entityId: string, value: unknown): Promise<unknown>;
  updateRegimeStatus(entityId: string, regimeId: string, value: unknown): Promise<unknown>;
  createStockSheet(entityId: string, regimeId: string, value: unknown): Promise<unknown>;
  addStockMovement(entityId: string, stockSheetId: string, value: unknown): Promise<unknown>;
  createBond(entityId: string, regimeId: string, value: unknown): Promise<unknown>;
  releaseBond(entityId: string, regimeId: string, bondId: string, value: unknown): Promise<unknown>;
}

function getEntityId(res: Response): string {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user) throw new CustomsRegimeError('Authentification requise.', 401);
  return resolveEntityScope(user.entityId);
}

function respondError(res: Response, error: unknown) {
  if (error instanceof EntityScopeError) {
    res.status(403).json({ error: error.message });
  } else if (error instanceof CustomsRegimeError) {
    res.status(error.statusCode).json({ error: error.message });
  } else {
    console.error('Erreur inattendue dans le suivi des régimes douaniers:', error);
    res.status(500).json({ error: 'Impossible de traiter la demande de régime douanier.' });
  }
}

export function createCustomsRegimeRouter(service: CustomsRegimeApiService = new CustomsRegimeService()) {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      res.json(await service.list(getEntityId(res)));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.post('/', async (req, res) => {
    try {
      res.status(201).json(await service.createRegime(getEntityId(res), req.body));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.patch('/:id/status', async (req, res) => {
    try {
      res.json(await service.updateRegimeStatus(getEntityId(res), req.params.id, req.body?.status));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.post('/:id/stock-sheets', async (req, res) => {
    try {
      res.status(201).json(await service.createStockSheet(getEntityId(res), req.params.id, req.body));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.post('/stock-sheets/:sheetId/movements', async (req, res) => {
    try {
      res.status(201).json(await service.addStockMovement(getEntityId(res), req.params.sheetId, req.body));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.post('/:id/bonds', async (req, res) => {
    try {
      res.status(201).json(await service.createBond(getEntityId(res), req.params.id, req.body));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.post('/:id/bonds/:bondId/release', async (req, res) => {
    try {
      res.json(await service.releaseBond(getEntityId(res), req.params.id, req.params.bondId, req.body));
    } catch (error) {
      respondError(res, error);
    }
  });
  return router;
}

export default createCustomsRegimeRouter();
