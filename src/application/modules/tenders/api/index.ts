import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { EntityScopeError, resolveEntityScope } from '../../finance/entity-scope';
import { TenderService } from '../service';
import { TenderRequestError } from '../validation';

export interface TenderApiService {
  list(entityId: string): Promise<unknown>;
  create(entityId: string, value: unknown): Promise<unknown>;
  updateStatus(entityId: string, tenderId: string, value: unknown): Promise<unknown>;
  addDocument(entityId: string, tenderId: string, value: unknown): Promise<unknown>;
  updateDocument(entityId: string, tenderId: string, documentId: string, value: unknown): Promise<unknown>;
  addCaution(entityId: string, tenderId: string, value: unknown): Promise<unknown>;
  updateCaution(entityId: string, tenderId: string, cautionId: string, value: unknown): Promise<unknown>;
}

function getScopedEntity(res: Response): string {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user) throw new TenderRequestError('Authentification requise.', 401);
  return resolveEntityScope(user.entityId);
}

function respondError(res: Response, error: unknown) {
  if (error instanceof EntityScopeError) {
    res.status(403).json({ error: error.message });
  } else if (error instanceof TenderRequestError) {
    res.status(error.statusCode).json({ error: error.message });
  } else {
    console.error('Erreur inattendue dans le module marchés publics:', error);
    res.status(500).json({ error: 'Impossible de traiter la demande marché public.' });
  }
}

export function createTendersRouter(service: TenderApiService = new TenderService()) {
  const router = Router();
  router.get('/', async (_req, res) => {
    try {
      res.json(await service.list(getScopedEntity(res)));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.post('/', async (req, res) => {
    try {
      res.status(201).json(await service.create(getScopedEntity(res), req.body));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.patch('/:id/status', async (req, res) => {
    try {
      res.json(await service.updateStatus(getScopedEntity(res), req.params.id, req.body?.status));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.post('/:id/documents', async (req, res) => {
    try {
      res.status(201).json(await service.addDocument(getScopedEntity(res), req.params.id, req.body));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.patch('/:id/documents/:documentId', async (req, res) => {
    try {
      res.json(await service.updateDocument(getScopedEntity(res), req.params.id, req.params.documentId, req.body));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.post('/:id/cautions', async (req, res) => {
    try {
      res.status(201).json(await service.addCaution(getScopedEntity(res), req.params.id, req.body));
    } catch (error) {
      respondError(res, error);
    }
  });
  router.patch('/:id/cautions/:cautionId', async (req, res) => {
    try {
      res.json(await service.updateCaution(getScopedEntity(res), req.params.id, req.params.cautionId, req.body));
    } catch (error) {
      respondError(res, error);
    }
  });
  return router;
}

export default createTendersRouter();
