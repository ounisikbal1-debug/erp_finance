import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../application/auth';
import { EntityScopeError, resolveEntityScope } from '../../../application/modules/finance/entity-scope';
import { FinanceRequestError } from '../../../application/modules/finance/errors';
import ReceivablesService from '../../../application/modules/receivables/service';

const router = Router();

function getScopedEntity(res: Response, requestedEntityId?: unknown): string {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

router.get('/aging', async (req, res) => {
  try {
    res.json(await ReceivablesService.getAging(getScopedEntity(res, req.query.entityId), req.query.asOf));
  } catch (error) {
    if (error instanceof EntityScopeError) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof FinanceRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Erreur inattendue dans la balance âgée clients:', error);
    res.status(500).json({ error: 'Impossible de charger la balance âgée clients.' });
  }
});

export default router;
