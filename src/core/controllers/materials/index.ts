import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../application/auth';
import { EntityScopeError, resolveEntityScope } from '../../../application/modules/finance/entity-scope';
import { MaterialsRequestError } from '../../../application/modules/materials/errors';
import MaterialsService from '../../../application/modules/materials/service';
import { MrpEngineService } from '../../../application/modules/materials/mrp-service';

const router = Router();
const mrpService = new MrpEngineService();

function getScopedEntity(res: Response, requestedEntityId?: unknown) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

function getActor(res: Response): AuthenticatedUser {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user) throw new MaterialsRequestError('Authentification requise.', 401);
  return user;
}

function respondError(res: Response, error: unknown, fallbackStatus: number) {
  const message = error instanceof Error ? error.message : 'Erreur inattendue';
  const isUniqueConstraintError = Boolean(error && typeof error === 'object'
    && 'code' in error && error.code === 'P2002');
  const status = error instanceof EntityScopeError
    ? 403
    : error instanceof MaterialsRequestError ? error.statusCode : isUniqueConstraintError ? 409 : fallbackStatus;
  if (!(error instanceof EntityScopeError) && !(error instanceof MaterialsRequestError) && status >= 500) {
    console.error('Erreur inattendue dans le module stocks:', error);
  }
  res.status(status).json({ error: message });
}

router.get('/data', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const data = await MaterialsService.getModuleData(entityId);
    res.json(data);
  } catch (error) {
    respondError(res, error, 500);
  }
});

router.get('/materials', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const list = await MaterialsService.listMaterials(entityId);
    res.json(list);
  } catch (error) {
    respondError(res, error, 500);
  }
});

router.post('/materials', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const mat = await MaterialsService.createMaterial(req.body, entityId, getActor(res));
    res.status(201).json(mat);
  } catch (error) {
    respondError(res, error, 400);
  }
});

router.get('/vendors', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const list = await MaterialsService.listVendors(entityId);
    res.json(list);
  } catch (error) {
    respondError(res, error, 500);
  }
});

router.post('/vendors', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await MaterialsService.createVendor(req.body, entityId));
  } catch (error) {
    respondError(res, error, 400);
  }
});

router.get('/warehouses', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await MaterialsService.listWarehouses(entityId));
  } catch (error) {
    respondError(res, error, 500);
  }
});

router.get('/purchase-invoices', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await MaterialsService.listPurchaseInvoices(entityId));
  } catch (error) {
    respondError(res, error, 500);
  }
});

router.get('/receivable-purchase-order-lines', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await MaterialsService.listReceivablePurchaseOrderLines(entityId));
  } catch (error) {
    respondError(res, error, 500);
  }
});

router.get('/stock-receipts', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await MaterialsService.listStockReceipts(entityId));
  } catch (error) {
    respondError(res, error, 500);
  }
});

router.get('/stock-supplier-returns', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await MaterialsService.listStockSupplierReturns(entityId));
  } catch (error) {
    respondError(res, error, 500);
  }
});

router.get('/stock-picks', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await MaterialsService.listStockPicks(entityId));
  } catch (error) {
    respondError(res, error, 500);
  }
});

router.post('/warehouses', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await MaterialsService.createWarehouse(req.body, entityId));
  } catch (error) {
    respondError(res, error, 400);
  }
});

router.get('/stock-movements', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const materialId = typeof req.query.materialId === 'string' ? req.query.materialId : undefined;
    if (req.query.materialId !== undefined && materialId === undefined) {
      throw new MaterialsRequestError('Le filtre article est invalide.', 422);
    }
    res.json(await MaterialsService.listStockMovements(entityId, materialId));
  } catch (error) {
    respondError(res, error, 500);
  }
});

router.post('/stock-transfers', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const transfer = await MaterialsService.transferStock(req.body, entityId, getActor(res));
    res.status(201).json(transfer);
  } catch (error) {
    respondError(res, error, 400);
  }
});

router.post('/stock-receipts', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const receipt = await MaterialsService.receiveStock(req.body, entityId, getActor(res));
    res.status(201).json(receipt);
  } catch (error) {
    respondError(res, error, 400);
  }
});

router.post('/stock-supplier-returns', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const returned = await MaterialsService.returnStockToSupplier(req.body, entityId, getActor(res));
    res.status(201).json(returned);
  } catch (error) {
    respondError(res, error, 400);
  }
});

router.post('/stock-picks', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const pick = await MaterialsService.createStockPick(req.body, entityId, getActor(res));
    res.status(201).json(pick);
  } catch (error) {
    respondError(res, error, 400);
  }
});

router.post('/stock-picks/:pickId/dispatch', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const dispatch = await MaterialsService.confirmStockDispatch(
      req.params.pickId,
      req.body,
      entityId,
      getActor(res),
    );
    res.status(201).json(dispatch);
  } catch (error) {
    respondError(res, error, 400);
  }
});

router.patch('/materials/:id/stock', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const updated = await MaterialsService.updateStock(
      req.params.id,
      entityId,
      req.body?.deltaQuantity,
      req.body?.reason,
      getActor(res),
    );
    res.json(updated);
  } catch (error) {
    respondError(res, error, 400);
  }
});

router.patch('/materials/:id/minimum-stock', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const updated = await MaterialsService.setMinimumStock(req.params.id, entityId, req.body?.minimumStock);
    res.json(updated);
  } catch (error) {
    respondError(res, error, 400);
  }
});

router.post('/stock-picks/:pickId/cancel', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const pick = await MaterialsService.cancelStockPick(req.params.pickId, entityId, getActor(res));
    res.json(pick);
  } catch (error) {
    respondError(res, error, 400);
  }
});

// Planification SAFE: Calcul des besoins nets & explosion de nomenclatures
router.post('/mrp/run', (req, res) => {
  try {
    const { materials, horizonDueDate } = req.body ?? {};
    if (!Array.isArray(materials)) {
      res.status(400).json({ error: 'La liste "materials" est requise.' });
      return;
    }
    const horizon = horizonDueDate ? new Date(horizonDueDate) : undefined;
    const result = mrpService.runMrp(materials, horizon);
    res.json(result);
  } catch (error) {
    respondError(res, error, 500);
  }
});

export default router;
