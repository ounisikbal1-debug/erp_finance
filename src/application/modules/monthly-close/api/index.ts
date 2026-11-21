import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { EntityScopeError, resolveEntityScope } from '../../finance/entity-scope';
import { FinanceRequestError } from '../../finance/errors';
import {
  getMonthlyCloseCheckKey,
  parseMonthlyClosePeriod,
  validateCloseLockNote,
  validateMonthlyCloseUpdate,
} from '../checklist';
import MonthlyCloseService from '../service';

const router = Router();

function getUser(res: Response): AuthenticatedUser {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user?.id || !user.username) {
    throw new FinanceRequestError('Une identité authentifiée est requise.', 403);
  }
  return user;
}

function getScopedEntity(res: Response, requestedEntityId?: unknown): string {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

function respondError(res: Response, error: unknown) {
  if (error instanceof EntityScopeError) {
    res.status(403).json({ error: error.message });
  } else if (error instanceof FinanceRequestError) {
    res.status(error.statusCode).json({ error: error.message });
  } else {
    console.error('Erreur inattendue dans la checklist de clôture:', error);
    res.status(500).json({ error: 'Impossible de charger la checklist de clôture.' });
  }
}

router.get('/checklist', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const period = parseMonthlyClosePeriod(req.query.period);
    res.json(await MonthlyCloseService.getChecklist(entityId, period));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/checklist/:period/:checkKey', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const user = getUser(res);
    const period = parseMonthlyClosePeriod(req.params.period);
    const checkKey = getMonthlyCloseCheckKey(req.params.checkKey, period);
    const update = validateMonthlyCloseUpdate(req.body);
    res.json(await MonthlyCloseService.recordCheck({
      entityId,
      period,
      checkKey,
      ...update,
      actorUserId: user.id,
      actorUsername: user.username,
    }));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/periods/:period/lock', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const user = getUser(res);
    const period = parseMonthlyClosePeriod(req.params.period);
    const note = validateCloseLockNote(req.body?.note);
    res.json(await MonthlyCloseService.lockPeriod({
      entityId,
      period,
      note,
      actorUserId: user.id,
      actorUsername: user.username,
    }));
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
