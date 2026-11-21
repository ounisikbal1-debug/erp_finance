import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../application/auth';
import { resolveEntityScope } from '../../../application/modules/finance/entity-scope';
import { IntercompanyRequestError } from '../../../application/modules/intercompany/errors';
import IntercompanyService from '../../../application/modules/intercompany/service';

const router = Router();

function getUser(res: Response): AuthenticatedUser | undefined {
  return res.locals.authenticatedUser as AuthenticatedUser | undefined;
}

function getEntityId(res: Response): string {
  return resolveEntityScope(getUser(res)?.entityId ?? null);
}

function getActor(res: Response) {
  const user = getUser(res);
  if (!user?.id || !user.username) throw new IntercompanyRequestError('Une identité authentifiée est requise.', 403);
  return { id: user.id, username: user.username };
}

function respondError(res: Response, error: unknown) {
  if (error instanceof IntercompanyRequestError) {
    res.status(error.statusCode).json({ error: error.message });
  } else {
    console.error('Erreur inattendue dans le module intercompagnies:', error);
    res.status(500).json({ error: 'Le module intercompagnies est indisponible.' });
  }
}

router.get('/transactions', async (_req, res) => {
  try {
    res.json(await IntercompanyService.list(getEntityId(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/partners', async (_req, res) => {
  try {
    res.json(await IntercompanyService.listPartners(getEntityId(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/transactions', async (req, res) => {
  try {
    res.status(201).json(await IntercompanyService.create(req.body, getEntityId(res), getActor(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/transactions/:transactionId/approve', async (req, res) => {
  try {
    res.json(await IntercompanyService.approve(req.params.transactionId, getEntityId(res), getActor(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/transactions/:transactionId/post', async (req, res) => {
  try {
    res.json(await IntercompanyService.post(req.params.transactionId, getEntityId(res), getActor(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/transactions/:transactionId/reconcile', async (req, res) => {
  try {
    res.json(await IntercompanyService.reconcile(req.params.transactionId, getEntityId(res), getActor(res)));
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
