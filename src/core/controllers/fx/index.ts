import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../application/auth';
import { resolveEntityScope } from '../../../application/modules/finance/entity-scope';
import { getFxErrorResponse } from '../../../application/modules/fx/errors';
import FxRatesService from '../../../application/modules/fx/service';
import FxRevaluationService from '../../../application/modules/fx/revaluation-service';

const router = Router();

function getScopedEntity(res: Response, requestedEntityId?: unknown) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

router.get('/suggestion', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await FxRatesService.getRateSuggestion(
      entityId,
      req.query.documentCurrencyCode,
      req.query.date,
    ));
  } catch (error) {
    const response = getFxErrorResponse(error);
    if (response.unexpected) console.error('Erreur inattendue dans le module taux de change:', error);
    res.status(response.status).json({ error: response.message });
  }
});

router.get('/revaluations', async (req, res) => {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user || (user.role !== 'ADMIN' && user.role !== 'FINANCIAL_MANAGER')) {
    res.status(403).json({ error: 'Le rôle Finance/Admin est requis pour consulter les réévaluations.' });
    return;
  }
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await FxRevaluationService.listRuns(entityId));
  } catch (error) {
    const response = getFxErrorResponse(error);
    if (response.unexpected) console.error('Erreur inattendue dans le module de réévaluation FX:', error);
    res.status(response.status).json({ error: response.message });
  }
});

router.post('/revaluations', async (req, res) => {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user || (user.role !== 'ADMIN' && user.role !== 'FINANCIAL_MANAGER')) {
    res.status(403).json({ error: 'Le rôle Finance/Admin est requis pour créer une réévaluation.' });
    return;
  }
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const run = await FxRevaluationService.createRun({
      effectiveDate: req.body?.effectiveDate,
      rateOverrides: req.body?.rateOverrides,
      note: req.body?.note,
    }, entityId, { id: user.id, username: user.username });
    res.status(201).json(run);
  } catch (error) {
    const response = getFxErrorResponse(error);
    if (response.unexpected) console.error('Erreur inattendue dans le module de réévaluation FX:', error);
    res.status(response.status).json({ error: response.message });
  }
});

export default router;
