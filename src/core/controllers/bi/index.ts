import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../application/auth';
import { resolveEntityScope } from '../../../application/modules/finance/entity-scope';
import { getFinanceErrorResponse } from '../../../application/modules/finance/errors';
import { parseFinancialReportPeriod } from '../../../application/modules/finance/financial-report';
import ReceivablesService from '../../../application/modules/receivables/service';
import BusinessIntelligenceService from '../../../application/modules/bi/service';

const router = Router();

function getScopedEntity(res: Response, requestedEntityId?: unknown) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

function respondError(res: Response, error: unknown) {
  const response = getFinanceErrorResponse(error);
  if (response.unexpected) console.error('Erreur inattendue dans l’export BI:', error);
  res.status(response.status).json({ error: response.message });
}

router.get('/manifest', async (_req, res) => {
  res.json(await BusinessIntelligenceService.getManifest());
});

router.get('/journal-lines', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    parseFinancialReportPeriod(req.query.from, req.query.to);
    res.json(await BusinessIntelligenceService.getJournalLines(entityId, req.query.from, req.query.to));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/sales-invoices', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    parseFinancialReportPeriod(req.query.from, req.query.to);
    res.json(await BusinessIntelligenceService.getSalesInvoices(entityId, req.query.from, req.query.to));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/purchase-invoices', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    parseFinancialReportPeriod(req.query.from, req.query.to);
    res.json(await BusinessIntelligenceService.getPurchaseInvoices(entityId, req.query.from, req.query.to));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/receivables-aging', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await ReceivablesService.getAging(entityId, req.query.asOf));
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
