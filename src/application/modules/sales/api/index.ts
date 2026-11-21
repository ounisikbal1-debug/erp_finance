import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { resolveEntityScope } from '../../finance/entity-scope';
import { SalesRequestError } from '../errors';
import { getSalesErrorResponse } from '../errors';
import SalesService, {
  INVOICE_PAGE_MAX,
  INVOICE_PAGE_SIZE_DEFAULT,
  INVOICE_PAGE_SIZE_MAX,
} from '../service';

const router = Router();

function getScopedEntity(res: Response, requestedEntityId?: unknown) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

function getActor(res: Response) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user?.id || !user.username) throw new SalesRequestError('Une identité authentifiée est requise.', 403);
  return { id: user.id, username: user.username };
}

function getInvoicePageParameter(value: unknown, name: string, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
    throw new SalesRequestError(`Le paramètre ${name} doit être un entier valide.`, 400);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new SalesRequestError(`Le paramètre ${name} doit être compris entre 1 et ${maximum}.`, 400);
  }
  return parsed;
}

function respondError(res: Response, error: unknown) {
  const response = getSalesErrorResponse(error);
  if (response.unexpected) console.error('Erreur inattendue dans le module ventes:', error);
  res.status(response.status).json({ error: response.message });
}

router.get('/customers', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const list = await SalesService.listCustomers(entityId);
    res.json(list);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/customers', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const cust = await SalesService.createCustomer(req.body, entityId);
    res.status(201).json(cust);
  } catch (error) {
    respondError(res, error);
  }
});

router.patch('/customers/:customerId/contacts', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const customer = await SalesService.updateCustomerContacts(
      req.params.customerId,
      req.body,
      entityId,
      getActor(res),
    );
    res.json(customer);
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/customers/:customerId/contact-history', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const history = await SalesService.listCustomerContactHistory(req.params.customerId, entityId);
    res.json(history);
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/customers/:customerId/score', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await SalesService.getCustomerScore(req.params.customerId, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/invoices', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const page = getInvoicePageParameter(req.query.page, 'page', 1, INVOICE_PAGE_MAX);
    const pageSize = getInvoicePageParameter(req.query.pageSize, 'pageSize', INVOICE_PAGE_SIZE_DEFAULT, INVOICE_PAGE_SIZE_MAX);
    const list = await SalesService.listInvoices(entityId, { page, pageSize });
    res.json(list);
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/orders', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await SalesService.listSalesOrders(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/orders', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await SalesService.createSalesOrder(req.body, entityId, getActor(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/orders/:orderId/stock-pick', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await SalesService.createSalesOrderStockPick(
      req.params.orderId,
      req.body,
      entityId,
      getActor(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/orders/:orderId/dispatch', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await SalesService.dispatchSalesOrder(
      req.params.orderId,
      entityId,
      getActor(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/orders/:orderId/invoice', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const result = await SalesService.convertSalesOrderToInvoice(
      req.params.orderId,
      req.body,
      entityId,
      getActor(res),
    );
    res.status(result.created ? 201 : 200).json(result.invoice);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/orders/:orderId/cancel', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.json(await SalesService.cancelSalesOrder(req.params.orderId, entityId, getActor(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/quotes', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await SalesService.listQuotes(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/quotes', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const quote = await SalesService.createQuote({ ...req.body, entityId }, getActor(res));
    res.status(201).json(quote);
  } catch (error) {
    respondError(res, error);
  }
});

router.patch('/quotes/:quoteId', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.json(await SalesService.updateQuote(req.params.quoteId, req.body, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/quotes/:quoteId/convert', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await SalesService.convertQuoteToInvoice(
      req.params.quoteId,
      req.body,
      entityId,
      getActor(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/quotes/:quoteId/convert-to-order', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await SalesService.convertQuoteToOrder(
      req.params.quoteId,
      req.body,
      entityId,
      getActor(res),
    ));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/tax-rates', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const rates = await SalesService.listConfiguredTaxRates(entityId);
    res.json(rates);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/invoices', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const inv = await SalesService.createInvoice({ ...req.body, entityId }, getActor(res));
    res.status(201).json(inv);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/invoices/:invoiceId/approve', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await SalesService.approveInvoice(req.params.invoiceId, entityId, getActor(res), req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/invoices/:invoiceId/reject', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await SalesService.rejectInvoice(req.params.invoiceId, entityId, getActor(res), req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/invoices/:invoiceId/issue', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await SalesService.issueInvoice(req.params.invoiceId, entityId, getActor(res), req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/invoices/:invoiceId/cancel', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.status(201).json(await SalesService.cancelInvoice(
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

// ==========================================
// E-FACTURE TUNISIENNE (TTN - EL FATOORA)
// ==========================================
import { TunisianEInvoiceService } from '../tunisian-e-invoice';

router.get('/e-invoices', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await TunisianEInvoiceService.list(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/e-invoices/:id', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await TunisianEInvoiceService.getById(req.params.id, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/e-invoices/:id/xml', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const item = await TunisianEInvoiceService.getById(req.params.id, entityId);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="E-Facture-${item.invoice.invoiceNumber}.xml"`);
    res.send(item.xmlPayload);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/e-invoices/generate/:invoiceId', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const actor = getActor(res);
    const userRole = (res.locals.authenticatedUser as AuthenticatedUser | undefined)?.role ?? 'SALES_OFFICER';
    res.status(201).json(await TunisianEInvoiceService.generateForInvoice(req.params.invoiceId, entityId, { ...actor, role: userRole }));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/e-invoices/:id/sign', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const actor = getActor(res);
    const userRole = (res.locals.authenticatedUser as AuthenticatedUser | undefined)?.role ?? 'SALES_OFFICER';
    res.json(await TunisianEInvoiceService.signEInvoice(req.params.id, entityId, { ...actor, role: userRole }));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/e-invoices/:id/submit-ttn', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const actor = getActor(res);
    const userRole = (res.locals.authenticatedUser as AuthenticatedUser | undefined)?.role ?? 'SALES_OFFICER';
    res.json(await TunisianEInvoiceService.submitToTTN(req.params.id, entityId, { ...actor, role: userRole }));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/e-invoices/bulk-generate', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const actor = getActor(res);
    const userRole = (res.locals.authenticatedUser as AuthenticatedUser | undefined)?.role ?? 'SALES_OFFICER';
    res.json(await TunisianEInvoiceService.bulkGenerateForEntity(entityId, { ...actor, role: userRole }));
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
