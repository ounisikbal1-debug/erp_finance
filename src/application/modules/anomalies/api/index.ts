import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { EntityScopeError, resolveEntityScope } from '../../finance/entity-scope';
import AnomalyService from '../service';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    const entityId = resolveEntityScope(user?.entityId ?? null);
    res.json(await AnomalyService.getReport(entityId));
  } catch (error) {
    if (error instanceof EntityScopeError) {
      res.status(403).json({ error: error.message });
      return;
    }
    console.error('Erreur inattendue lors de la détection des anomalies:', error);
    res.status(500).json({ error: 'Impossible de vérifier les anomalies.' });
  }
});

export default router;
