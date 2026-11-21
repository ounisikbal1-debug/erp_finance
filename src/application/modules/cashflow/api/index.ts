import express, { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { EntityScopeError, resolveEntityScope } from '../../finance/entity-scope';
import { CashflowRequestError } from '../errors';
import CashflowService from '../service';
import CashflowBankingService from '../banking-service';
import CashflowForecastService from '../forecast-service';

const router = Router();

function getUser(res: Response): AuthenticatedUser | undefined {
  return res.locals.authenticatedUser as AuthenticatedUser | undefined;
}

function getScopedEntity(res: Response, requestedEntityId?: unknown): string {
  return resolveEntityScope(getUser(res)?.entityId ?? null, requestedEntityId);
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof EntityScopeError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof CashflowRequestError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error('Erreur inattendue dans le module trésorerie:', error);
  res.status(500).json({ error: 'Le module trésorerie est indisponible.' });
}

router.get('/data', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const data = await CashflowService.getModuleData(entityId, req.query.period);
    res.json(data);
  } catch (error) {
    respondError(res, error);
  }
});

router.put('/accounts', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const result = await CashflowService.setCashAccounts(req.body, entityId);
    res.json(result);
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/bank-accounts', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await CashflowBankingService.listBankAccounts(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/bank-accounts', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await CashflowBankingService.createBankAccount(req.body, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/transfers', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await CashflowBankingService.listBankTransfers(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/transfers', async (req, res) => {
  try {
    const user = getUser(res);
    if (!user) throw new CashflowRequestError('Session authentifiée requise pour comptabiliser un virement.', 401);
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await CashflowBankingService.createBankTransfer(req.body, entityId, {
      id: user.id,
      username: user.username,
    }));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/statements', express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }), async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const result = await CashflowBankingService.importStatement({
      bankAccountId: req.query.bankAccountId,
      csv: req.body,
      importedByUserId: getUser(res)?.id,
    }, entityId);
    res.status(201).json(result);
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/statements', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await CashflowBankingService.listStatements(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/statements/:statementId/lines', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await CashflowBankingService.listStatementLines(req.params.statementId, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/reconciliation/candidates', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    if (typeof req.query.statementLineId !== 'string') {
      throw new CashflowRequestError('Identifiant d’opération de relevé invalide.', 400);
    }
    res.json(await CashflowBankingService.getReconciliationCandidates(req.query.statementLineId, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/reconciliations', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await CashflowBankingService.reconcile({
      statementLineId: req.body?.statementLineId,
      journalLineId: req.body?.journalLineId,
      userId: getUser(res)?.id,
    }, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.delete('/reconciliations/:reconciliationId', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await CashflowBankingService.removeReconciliation(req.params.reconciliationId, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/accounting-mapping', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await CashflowBankingService.getAccountingMapping(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.put('/accounting-mapping', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.json(await CashflowBankingService.setAccountingMapping(req.body, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/payments', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await CashflowBankingService.listPayments(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/payment-targets', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await CashflowBankingService.listPaymentTargets(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/payments', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await CashflowBankingService.allocatePayment(req.body, entityId, getUser(res)?.id));
  } catch (error) {
    respondError(res, error);
  }
});

router.delete('/payments/:paymentId', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await CashflowBankingService.removePayment(req.params.paymentId, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/forecast/scenarios', async (_req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await CashflowForecastService.listScenarios(entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/forecast/scenarios', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await CashflowForecastService.createScenario(req.body, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/forecast/scenarios/:scenarioId/sources', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await CashflowForecastService.listSources(req.params.scenarioId, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/forecast/scenarios/:scenarioId', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    res.json(await CashflowForecastService.getScenarioData(req.params.scenarioId, entityId, req.query.horizonDays));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/forecast/scenarios/:scenarioId/items', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    res.status(201).json(await CashflowForecastService.createItem(req.body, req.params.scenarioId, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

router.delete('/forecast/items/:itemId', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await CashflowForecastService.removeItem(req.params.itemId, entityId));
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
