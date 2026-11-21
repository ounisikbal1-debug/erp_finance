import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { resolveEntityScope } from '../../finance/entity-scope';
import { PurchaseRequestError } from '../errors';
import { getPurchaseErrorResponse } from '../errors';
import PurchasesService from '../service';
import MaterialsService from '../../materials/service';
import { MaterialsRequestError } from '../../materials/errors';

const router = Router();

function getScopedEntity(res: Response, requestedEntityId?: unknown) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

function getActor(res: Response) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user?.id || !user.username) {
    throw new PurchaseRequestError('Une identité authentifiée est requise pour cette action.', 403);
  }
  return { id: user.id, username: user.username };
}

function respondError(res: Response, error: unknown) {
  const response = getPurchaseErrorResponse(error);
  if (response.unexpected) console.error('Erreur inattendue dans le module achats:', error);
  res.status(response.status).json({ error: response.message });
}

router.get('/data', async (req, res) => {
  try {
    res.json(await PurchasesService.getModuleData(getScopedEntity(res, req.query.entityId)));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/orders', async (req, res) => {
  try {
    res.json(await PurchasesService.getPurchaseOrders(getScopedEntity(res, req.query.entityId)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/orders', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await PurchasesService.createPurchaseOrder(req.body, entityId, getActor(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/orders/:orderId/approve', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await PurchasesService.approvePurchaseOrder(req.params.orderId, entityId, getActor(res), req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/orders/:orderId/reject', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await PurchasesService.rejectPurchaseOrder(req.params.orderId, entityId, getActor(res), req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/orders/:orderId/receipts', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const line = await PurchasesService.getReceivablePurchaseOrderLine(
      req.params.orderId,
      req.body?.purchaseOrderLineId,
      entityId,
    );
    const result = await MaterialsService.receiveStock({
      ...req.body,
      materialId: line.materialId,
      purchaseOrderLineId: line.id,
    }, entityId, getActor(res));
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof MaterialsRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    respondError(res, error);
  }
});

router.get('/credit-notes', async (req, res) => {
  try {
    res.json(await PurchasesService.getSupplierCreditNotes(getScopedEntity(res, req.query.entityId)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/credit-notes/:creditNoteId/applications', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await PurchasesService.applySupplierCreditNote(
      req.params.creditNoteId,
      entityId,
      getActor(res),
      req.body,
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/credit-notes/:creditNoteId/document', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.json(await PurchasesService.recordSupplierCreditNoteDocument(
      req.params.creditNoteId,
      entityId,
      getActor(res),
      req.body,
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/credit-notes/:creditNoteId/approve', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await PurchasesService.approveSupplierCreditNote(
      req.params.creditNoteId,
      entityId,
      getActor(res),
      req.body?.note,
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/credit-notes/:creditNoteId/post', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await PurchasesService.postSupplierCreditNote(
      req.params.creditNoteId,
      entityId,
      getActor(res),
      req.body?.note,
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/vendors', async (req, res) => {
  try {
    res.json(await MaterialsService.listVendors(getScopedEntity(res, req.query.entityId)));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/vendors/:vendorId/score', async (req, res) => {
  try {
    res.json(await PurchasesService.getSupplierScore(
      req.params.vendorId,
      getScopedEntity(res, req.query.entityId),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/vendors', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await MaterialsService.createVendor(req.body, entityId));
  } catch (error) {
    if (error instanceof MaterialsRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    respondError(res, error);
  }
});

router.get('/payables/aging', async (req, res) => {
  try {
    res.json(await PurchasesService.getPayablesAging(getScopedEntity(res), req.query.asOf));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/invoices', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const invoice = await PurchasesService.createDraftInvoice(req.body, entityId, getActor(res));
    res.status(201).json(invoice);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/invoices/:invoiceId/approve', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await PurchasesService.approveInvoice(req.params.invoiceId, entityId, getActor(res), req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/invoices/:invoiceId/reject', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await PurchasesService.rejectInvoice(req.params.invoiceId, entityId, getActor(res), req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/invoices/:invoiceId/post', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await PurchasesService.postInvoice(req.params.invoiceId, entityId, getActor(res), req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/invoices/:invoiceId/cancel', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.status(201).json(await PurchasesService.cancelInvoice(
      req.params.invoiceId,
      entityId,
      getActor(res),
      req.body?.note,
      req.body?.date,
    ));
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
