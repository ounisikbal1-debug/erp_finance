import { raw, Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { resolveEntityScope } from '../../finance/entity-scope';
import { getFinanceErrorResponse } from '../../finance/errors';
import {
  MAX_INVOICE_FILE_BYTES,
  PDF_MIME_TYPE,
  XLSX_MIME_TYPE,
  InvoiceDocumentError,
} from '../invoice-document';
import LocalInvoiceAnalysisService from '../invoice-analysis';
import LocalFinancialAssistantService, { LocalAiError } from '../service';
import OperationalInsightsService from '../operational-insights';

const router = Router();

function getScopedEntity(res: Response, requestedEntityId?: unknown) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

const parseInvoiceUpload = raw({
  type: [PDF_MIME_TYPE, XLSX_MIME_TYPE],
  limit: MAX_INVOICE_FILE_BYTES,
});

function readInvoiceUpload(req: Request, res: Response, next: NextFunction) {
  parseInvoiceUpload(req, res, (error?: unknown) => {
    if (!error) {
      next();
      return;
    }
    const status = typeof error === 'object'
      && error !== null
      && 'status' in error
      && typeof error.status === 'number'
      ? error.status
      : 400;
    res.status(status === 413 ? 413 : 400).json({
      error: status === 413
        ? `Le fichier dépasse la limite de ${MAX_INVOICE_FILE_BYTES / (1024 * 1024)} Mo.`
        : 'Le fichier de facture ne peut pas être lu.',
    });
  });
}

router.post('/financial-insights', async (req, res) => {
  try {
    if (req.body?.humanReviewConfirmed !== true) {
      res.status(400).json({ error: 'Confirmez que vous vérifierez la réponse avant toute décision.' });
      return;
    }
    const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
    if (!user) throw new LocalAiError('Une session financière authentifiée est requise.', 401);
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.json(await LocalFinancialAssistantService.ask(
      entityId,
      req.body?.from,
      req.body?.to,
      req.body?.question,
      req.body?.cloudAggregateConsent === true,
      user.id,
    ));
  } catch (error) {
    if (error instanceof LocalAiError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const response = getFinanceErrorResponse(error);
    if (response.unexpected) {
      console.error(
        'Erreur inattendue de l’assistant financier:',
        error instanceof Error ? error.name : 'Erreur inconnue',
      );
    }
    res.status(response.status).json({ error: response.unexpected ? 'Une erreur interne est survenue.' : response.message });
  }
});

router.post('/invoice-analysis', readInvoiceUpload, async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await LocalInvoiceAnalysisService.analyze(
      entityId,
      Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
      req.headers['content-type'],
    ));
  } catch (error) {
    if (error instanceof LocalAiError || error instanceof InvoiceDocumentError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const response = getFinanceErrorResponse(error);
    if (response.unexpected) console.error('Erreur inattendue de l’analyse locale de facture:', error instanceof Error ? error.name : 'Erreur inconnue');
    res.status(response.status).json({ error: response.unexpected ? 'Impossible d’analyser le document localement.' : response.message });
  }
});

router.get('/operational-insights', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await OperationalInsightsService.getSnapshot(entityId));
  } catch (error) {
    const response = getFinanceErrorResponse(error);
    if (response.unexpected) console.error('Erreur inattendue des indicateurs opérationnels:', error);
    res.status(response.status).json({ error: response.unexpected ? 'Impossible de calculer les indicateurs opérationnels.' : response.message });
  }
});

export default router;
