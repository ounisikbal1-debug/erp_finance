import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { EntityScopeError, resolveEntityScope } from '../../finance/entity-scope';
import AdvancedFinanceService from '../service';

const router = Router();

function getScopedEntity(res: Response, requestedEntityId?: unknown) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

router.get('/analysis', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    let asOf = new Date();
    if (req.query.asOf !== undefined) {
      if (typeof req.query.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(req.query.asOf)) {
        res.status(400).json({ error: 'La date d’arrêté doit être au format AAAA-MM-JJ.' });
        return;
      }
      const endOfDay = new Date(`${req.query.asOf}T23:59:59.999Z`);
      if (!Number.isFinite(endOfDay.getTime()) || endOfDay.toISOString().slice(0, 10) !== req.query.asOf) {
        res.status(400).json({ error: 'La date d’arrêté doit être une date calendaire valide.' });
        return;
      }
      asOf = endOfDay;
    }
    const analysis = await AdvancedFinanceService.getAdvancedFinancialAnalysis(entityId, asOf);
    res.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inattendue';
    res.status(error instanceof EntityScopeError ? 403 : 500).json({ error: message });
  }
});

export default router;
