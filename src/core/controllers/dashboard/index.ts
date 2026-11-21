import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../application/auth';
import { EntityScopeError, resolveEntityScope } from '../../../application/modules/finance/entity-scope';
import AdvancedFinanceService from '../../../application/modules/advanced-finance/service';

const router = Router();

function getScopedEntity(res: Response, requestedEntityId?: unknown) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

router.get('/summary', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const summary = await AdvancedFinanceService.getDashboardSummary(entityId);
    res.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inattendue';
    res.status(error instanceof EntityScopeError ? 403 : 500).json({ error: message });
  }
});

export default router;
