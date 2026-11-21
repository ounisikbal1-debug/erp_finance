import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../application/auth';
import { EntityScopeError, resolveEntityScope } from '../../../application/modules/finance/entity-scope';
import ControllingService from '../../../application/modules/controlling/service';
import { ControllingRequestError } from '../../../application/modules/controlling/errors';
import { ProfitCenterService } from '../../../application/modules/controlling/profit-center-service';

const router = Router();
const profitCenterService = new ProfitCenterService();

function getScopedEntity(res: Response, requestedEntityId?: unknown) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

function respondError(res: Response, error: unknown) {
  if (error instanceof EntityScopeError) {
    res.status(403).json({ error: error.message });
  } else if (error instanceof ControllingRequestError) {
    res.status(error.statusCode).json({ error: error.message });
  } else {
    console.error('Erreur inattendue dans le contrôle de gestion:', error);
    res.status(500).json({ error: 'Le contrôle de gestion est indisponible.' });
  }
}

router.get('/cost-centers', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const list = await ControllingService.listCostCenters(entityId);
    res.json(list);
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const analytics = await ControllingService.getCostCenterAnalytics(entityId, req.query.period);
    res.json(analytics);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/cost-centers', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await ControllingService.createCostCenter(req.body, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.patch('/cost-centers/:code', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.json(await ControllingService.updateCostCenter(req.params.code, req.body, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

// Contrôle analytique SAFE: Cycles de répartition analytique secondaire
router.post('/profit-centers/allocate', (req, res) => {
  try {
    const { totalCostToAllocate, cycle } = req.body ?? {};
    if (totalCostToAllocate === undefined || !cycle) {
      res.status(400).json({ error: 'totalCostToAllocate et cycle sont requis.' });
      return;
    }
    const result = profitCenterService.executeCostAllocation(Number(totalCostToAllocate), cycle);
    res.json(result);
  } catch (error) {
    respondError(res, error);
  }
});

// Contrôle analytique SAFE: Compte de résultat (P&L) par Centre de Profit
router.post('/profit-centers/pnl', (req, res) => {
  try {
    const { profitCenter, revenue, directCosts, allocatedIndirectCosts } = req.body ?? {};
    if (!profitCenter) {
      res.status(400).json({ error: 'profitCenter est requis.' });
      return;
    }
    const result = profitCenterService.calculateProfitCenterPnl(
      profitCenter,
      Number(revenue ?? 0),
      Number(directCosts ?? 0),
      Number(allocatedIndirectCosts ?? 0),
    );
    res.json(result);
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
