import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { resolveEntityScope } from '../entity-scope';
import { FinanceRequestError, getFinanceErrorResponse } from '../errors';
import FinanceService from '../service';
import prisma from '../../../../data/prisma/client';
import { FixedAssetsService, type AssetData } from '../assets-service';
import { appendJournalEntryAuditRecord } from '../audit-chain';
import { assertAccountingPeriodOpen } from '../posting-period';

const router = Router();
const assetsService = new FixedAssetsService(prisma);

function getScopedEntity(res: Response, requestedEntityId?: unknown) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  return resolveEntityScope(user?.entityId ?? null, requestedEntityId);
}

function getActor(res: Response) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user?.id || !user.username) throw new FinanceRequestError('Une identité authentifiée est requise.', 403);
  return { id: user.id, username: user.username };
}

function respondError(res: Response, error: unknown) {
  const response = getFinanceErrorResponse(error);
  if (response.unexpected) console.error('Erreur inattendue dans le module comptabilité:', error);
  res.status(response.status).json({ error: response.message });
}

// Plan comptable du pays associé à la société authentifiée
router.get('/accounts', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const accounts = await FinanceService.getChartOfAccounts(entityId);
    res.json(accounts);
  } catch (error) {
    respondError(res, error);
  }
});

// Écritures comptables
router.get('/journal-entries', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const entries = await FinanceService.listJournalEntries(entityId);
    res.json(entries);
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/audit-chain/verify', async (_req, res) => {
  try {
    res.json(await FinanceService.verifyAuditChain(getScopedEntity(res)));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/journal-entries', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const entry = await FinanceService.createJournalEntry(
      { ...req.body, entityId },
      getActor(res),
      req.body?.note,
    );
    res.status(201).json(entry);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/journal-entries/:entryId/approve', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await FinanceService.approveJournalEntry(req.params.entryId, entityId, getActor(res), req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/journal-entries/:entryId/reject', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await FinanceService.rejectJournalEntry(req.params.entryId, entityId, getActor(res), req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/journal-entries/:entryId/post', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.json(await FinanceService.postJournalEntry(req.params.entryId, entityId, getActor(res), req.body?.note));
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/journal-entries/:entryId/reverse', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    res.status(201).json(await FinanceService.createJournalReversal(
      req.params.entryId,
      entityId,
      getActor(res),
      req.body?.note,
      req.body?.date,
    ));
  } catch (error) {
    respondError(res, error);
  }
});

// Balance générale
router.get('/balance', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const balance = await FinanceService.getBalanceGenerale(entityId);
    res.json(balance);
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/financial-report', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.query.entityId);
    const report = await FinanceService.getFinancialPeriodSummary(entityId, req.query.from, req.query.to);
    res.json(report);
  } catch (error) {
    respondError(res, error);
  }
});

// Immobilisations SAFE: Plan d'amortissement prévisionnel
router.post('/assets/schedule', (req, res) => {
  try {
    const { grossValue, salvageValue, usefulLifeMonths, inServiceDate } = req.body ?? {};
    if (!grossValue || !usefulLifeMonths || !inServiceDate) {
      res.status(400).json({ error: 'grossValue, usefulLifeMonths et inServiceDate sont requis.' });
      return;
    }
    const schedule = assetsService.computeSchedule(
      Number(grossValue),
      Number(salvageValue ?? 0),
      Number(usefulLifeMonths),
      String(inServiceDate),
    );
    res.json(schedule);
  } catch (error) {
    respondError(res, error);
  }
});

// Immobilisations SAFE: Comptabilisation de la dotation annuelle dans le Grand Livre
router.post('/assets/post-depreciation', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const actor = getActor(res);
    const { asset, fiscalYear, amount } = req.body ?? {};
    if (!asset || !fiscalYear || !amount) {
      res.status(400).json({ error: 'asset, fiscalYear et amount sont requis.' });
      return;
    }
    const result = await assetsService.postDepreciationEntry(
      entityId,
      asset,
      Number(fiscalYear),
      Number(amount),
      actor,
    );
    res.json(result);
  } catch (error) {
    respondError(res, error);
  }
});

// Immobilisations SAFE: Sortie d'actif (cession ou mise au rebut)
router.post('/assets/dispose', async (req, res) => {
  try {
    const entityId = getScopedEntity(res, req.body?.entityId);
    const actor = getActor(res);
    const { asset, salePrice, proceedsAccountCode } = req.body ?? {};
    if (!asset || proceedsAccountCode === undefined) {
      res.status(400).json({ error: 'asset et proceedsAccountCode sont requis.' });
      return;
    }
    const result = await assetsService.postAssetDisposal(
      entityId,
      asset,
      Number(salePrice ?? 0),
      String(proceedsAccountCode),
      actor,
    );
    res.json(result);
  } catch (error) {
    respondError(res, error);
  }
});

function requireFinanceManager(res: Response) {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user || !['ADMIN', 'FINANCIAL_MANAGER'].includes(user.role)) {
    throw new FinanceRequestError('Cette action est réservée à la direction financière.', 403);
  }
  return user;
}

router.get('/assets', async (_req, res) => {
  try {
    res.json(await prisma.fixedAsset.findMany({ where: { entityId: getScopedEntity(res) }, orderBy: [{ status: 'asc' }, { code: 'asc' }] }));
  } catch (error) { respondError(res, error); }
});

router.post('/assets', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const actor = getActor(res);
    const input = req.body ?? {};
    const required = ['code', 'name', 'category', 'acquisitionDate', 'inServiceDate', 'grossValue', 'usefulLifeMonths', 'assetAccountCode', 'depreciationAccountCode', 'expenseAccountCode', 'supportingDocumentReference'];
    if (required.some((key) => input[key] === undefined || input[key] === null || String(input[key]).trim() === '')) throw new FinanceRequestError('Les champs de registre et la référence de pièce justificative sont obligatoires.', 400);
    const grossValue = Number(input.grossValue), usefulLifeMonths = Number(input.usefulLifeMonths), salvageValue = Number(input.salvageValue ?? 0);
    if (!Number.isSafeInteger(grossValue) || grossValue <= 0 || !Number.isSafeInteger(usefulLifeMonths) || usefulLifeMonths <= 0 || !Number.isSafeInteger(salvageValue) || salvageValue < 0 || salvageValue > grossValue) throw new FinanceRequestError('Valeur, durée et valeur résiduelle doivent être des entiers positifs cohérents (montants en millimes).', 400);
    const accounts = await FinanceService.getChartOfAccounts(entityId);
    const codes = [input.assetAccountCode, input.depreciationAccountCode, input.expenseAccountCode].map(String);
    if (codes.some((code) => !accounts.some((account) => account.code === code && account.isPostingAllowed))) throw new FinanceRequestError('Un des comptes d’immobilisation ou d’amortissement est absent ou non comptabilisable dans le plan du pays.', 422);
    const data = await prisma.fixedAsset.create({ data: { entityId, code: String(input.code).trim(), name: String(input.name).trim(), category: String(input.category), acquisitionDate: new Date(input.acquisitionDate), inServiceDate: new Date(input.inServiceDate), grossValue, salvageValue, usefulLifeMonths, method: input.method === 'DECLINING_BALANCE' ? 'DECLINING_BALANCE' : 'STRAIGHT_LINE', assetAccountCode: codes[0], depreciationAccountCode: codes[1], expenseAccountCode: codes[2], accumulatedDepreciation: 0, bookValue: grossValue, status: 'IN_SERVICE', costCenterCode: input.costCenterCode ? String(input.costCenterCode) : null, supportingDocumentReference: String(input.supportingDocumentReference).trim(), createdByUserId: actor.id } });
    res.status(201).json(data);
  } catch (error) { respondError(res, error); }
});

router.post('/assets/:assetId/depreciate', async (req, res) => {
  try {
    const entityId = getScopedEntity(res);
    const actor = getActor(res);
    const asset = await prisma.fixedAsset.findFirst({ where: { id: req.params.assetId, entityId } });
    if (!asset) throw new FinanceRequestError('Immobilisation introuvable.', 404);
    const fiscalYear = Number(req.body?.fiscalYear);
    const schedule = assetsService.computeSchedule(asset.grossValue, asset.salvageValue, asset.usefulLifeMonths, asset.inServiceDate.toISOString());
    const scheduled = schedule.find((row) => row.year === fiscalYear)?.depreciationAmount;
    const amount = req.body?.amount === undefined ? scheduled : Number(req.body.amount);
    if (!Number.isSafeInteger(fiscalYear) || !amount || !Number.isSafeInteger(Number(amount)) || Number(amount) > (scheduled ?? 0)) throw new FinanceRequestError('Année invalide ou dotation supérieure au plan calculé.', 400);
    const postingDateText = String(req.body?.postingDate ?? '');
    const postingDate = new Date(`${postingDateText.slice(0, 10)}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDateText) || Number.isNaN(postingDate.getTime()) || postingDate.getTime() > Date.now() || postingDate.getUTCFullYear() !== fiscalYear) throw new FinanceRequestError('La date de comptabilisation doit être valide, non future et située dans l’exercice choisi.', 400);
    const result = await assetsService.postDepreciationEntry(entityId, { ...asset, acquisitionDate: asset.acquisitionDate.toISOString(), inServiceDate: asset.inServiceDate.toISOString(), method: 'STRAIGHT_LINE', category: asset.category as AssetData['category'], status: asset.status as AssetData['status'], costCenterId: asset.costCenterCode }, fiscalYear, Number(amount), actor, postingDate);
    const accumulatedDepreciation = asset.accumulatedDepreciation + result.depreciationAmount;
    await prisma.fixedAsset.update({ where: { id: asset.id }, data: { accumulatedDepreciation, bookValue: asset.grossValue - accumulatedDepreciation, status: asset.grossValue - accumulatedDepreciation <= asset.salvageValue ? 'FULLY_DEPRECIATED' : 'IN_SERVICE' } });
    res.json({ ...result, fixedAssetId: asset.id });
  } catch (error) { respondError(res, error); }
});

router.get('/provisions', async (_req, res) => {
  try { res.json(await prisma.financialProvision.findMany({ where: { entityId: getScopedEntity(res) }, orderBy: [{ period: 'desc' }, { code: 'asc' }] })); }
  catch (error) { respondError(res, error); }
});

router.post('/provisions', async (req, res) => {
  try {
    const entityId = getScopedEntity(res); const actor = getActor(res); const input = req.body ?? {};
    const amount = Number(input.amount); const period = String(input.period ?? '');
    if (!input.code || !input.description || !input.nature || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !Number.isSafeInteger(amount) || amount <= 0 || !input.expenseAccountCode || !input.provisionAccountCode || !input.supportingDocumentReference) throw new FinanceRequestError('Code, motif, période AAAA-MM, montant en millimes, comptes et pièce justificative sont requis.', 400);
    const accounts = await FinanceService.getChartOfAccounts(entityId); const accountCodes = [String(input.expenseAccountCode), String(input.provisionAccountCode)];
    if (accountCodes.some((code) => !accounts.some((account) => account.code === code && account.isPostingAllowed))) throw new FinanceRequestError('Un compte de charge ou de provision est absent ou non comptabilisable.', 422);
    res.status(201).json(await prisma.financialProvision.create({ data: { entityId, code: String(input.code).trim(), description: String(input.description).trim(), nature: String(input.nature), period, amount, expenseAccountCode: accountCodes[0], provisionAccountCode: accountCodes[1], costCenterCode: input.costCenterCode ? String(input.costCenterCode) : null, supportingDocumentReference: String(input.supportingDocumentReference).trim(), createdByUserId: actor.id } }));
  } catch (error) { respondError(res, error); }
});

router.post('/provisions/:provisionId/approve', async (req, res) => {
  try {
    const user = requireFinanceManager(res); const entityId = getScopedEntity(res); const actor = getActor(res);
    const provision = await prisma.financialProvision.findFirst({ where: { id: req.params.provisionId, entityId } });
    if (!provision) throw new FinanceRequestError('Provision introuvable.', 404);
    if (provision.status !== 'DRAFT' || provision.createdByUserId === actor.id) throw new FinanceRequestError('La provision doit être contrôlée par un responsable distinct de son créateur.', 409);
    res.json(await prisma.financialProvision.update({ where: { id: provision.id }, data: { status: 'APPROVED', approvedByUserId: user.id, approvedAt: new Date() } }));
  } catch (error) { respondError(res, error); }
});

router.post('/provisions/:provisionId/post', async (req, res) => {
  try {
    const user = requireFinanceManager(res); const entityId = getScopedEntity(res); const actor = getActor(res);
    const provision = await prisma.financialProvision.findFirst({ where: { id: req.params.provisionId, entityId } });
    if (!provision) throw new FinanceRequestError('Provision introuvable.', 404);
    if (provision.status !== 'APPROVED' || provision.createdByUserId === actor.id || provision.approvedByUserId === actor.id) throw new FinanceRequestError('Comptabilisation réservée à un troisième acteur, après création et approbation distinctes.', 409);
    const postingDate = new Date(`${provision.period}-01T00:00:00.000Z`);
    const journal = await prisma.$transaction(async (tx) => {
      await assertAccountingPeriodOpen(tx, entityId, postingDate);
      const entry = await tx.journalEntry.create({ data: { entityId, entryNumber: `PRV-${entityId.slice(0, 6)}-${provision.code}`, date: postingDate, reference: provision.supportingDocumentReference, description: `Provision ${provision.nature} — ${provision.description}`, status: 'POSTED', createdByUserId: actor.id, createdByUsername: actor.username, postedByUserId: actor.id, postedByUsername: actor.username, postedAt: new Date(), lines: { create: [{ accountCode: provision.expenseAccountCode, description: `Dotation provision ${provision.code}`, debit: provision.amount, credit: 0, costCenterCode: provision.costCenterCode }, { accountCode: provision.provisionAccountCode, description: `Provision ${provision.code}`, debit: 0, credit: provision.amount, costCenterCode: provision.costCenterCode }], }, workflowEvents: { create: { action: 'POSTED', actorUserId: actor.id, actorUsername: actor.username, note: String(req.body?.note ?? 'Provision approuvée avec pièce justificative.') } } } });
      await appendJournalEntryAuditRecord(tx, entry.id);
      await tx.financialProvision.update({ where: { id: provision.id }, data: { status: 'POSTED', postedJournalEntryId: entry.id, postedAt: new Date() } });
      return entry;
    });
    res.json({ provision: await prisma.financialProvision.findUnique({ where: { id: provision.id } }), journalEntry: journal, postedBy: user.username });
  } catch (error) { respondError(res, error); }
});

router.get('/analytical-allocation-rules', async (_req, res) => {
  try { res.json(await prisma.analyticalAllocationRule.findMany({ where: { entityId: getScopedEntity(res) }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] })); }
  catch (error) { respondError(res, error); }
});

router.post('/analytical-allocation-rules', async (req, res) => {
  try {
    const user = requireFinanceManager(res); const entityId = getScopedEntity(res); const input = req.body ?? {};
    const percentage = Number(input.percentage); const priority = Number(input.priority ?? 100);
    if (!input.documentType || !['PURCHASE', 'SALE'].includes(String(input.documentType).toUpperCase()) || !input.naturePattern || !input.accountCode || !input.costCenterCode || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100 || !Number.isSafeInteger(priority)) throw new FinanceRequestError('Type (achat/vente), motif, compte, centre, pourcentage (0–100) et priorité sont requis.', 400);
    const entity = await prisma.entity.findUnique({ where: { id: entityId }, select: { country: { select: { code: true } } } });
    if (!entity) throw new FinanceRequestError('Entité introuvable.', 404);
    const [accounts, centers] = await Promise.all([FinanceService.getChartOfAccounts(entityId), prisma.costCenter.findFirst({ where: { entityId, code: String(input.costCenterCode) } })]);
    if (!accounts.some((account) => account.code === String(input.accountCode) && account.isPostingAllowed) || !centers) throw new FinanceRequestError('Le compte ou le centre analytique n’existe pas pour cette entité.', 422);
    res.status(201).json(await prisma.analyticalAllocationRule.create({ data: { entityId, countryCode: entity.country.code, documentType: String(input.documentType).toUpperCase(), naturePattern: String(input.naturePattern).trim(), accountCode: String(input.accountCode), costCenterCode: String(input.costCenterCode), percentage, priority, updatedByUserId: user.id } }));
  } catch (error) { respondError(res, error); }
});

router.patch('/analytical-allocation-rules/:ruleId', async (req, res) => {
  try {
    const user = requireFinanceManager(res); const entityId = getScopedEntity(res); const input = req.body ?? {};
    const rule = await prisma.analyticalAllocationRule.findFirst({ where: { id: req.params.ruleId, entityId } });
    if (!rule) throw new FinanceRequestError('Règle de répartition introuvable.', 404);
    const percentage = input.percentage === undefined ? rule.percentage : Number(input.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) throw new FinanceRequestError('Le pourcentage doit être supérieur à 0 et inférieur ou égal à 100.', 400);
    const costCenterCode = input.costCenterCode === undefined ? rule.costCenterCode : String(input.costCenterCode);
    if (!(await prisma.costCenter.findFirst({ where: { entityId, code: costCenterCode } }))) throw new FinanceRequestError('Centre analytique inconnu pour cette entité.', 422);
    res.json(await prisma.analyticalAllocationRule.update({ where: { id: rule.id }, data: { percentage, costCenterCode, priority: input.priority === undefined ? rule.priority : Number(input.priority), isActive: input.isActive === undefined ? rule.isActive : Boolean(input.isActive), naturePattern: input.naturePattern === undefined ? rule.naturePattern : String(input.naturePattern), updatedByUserId: user.id } }));
  } catch (error) { respondError(res, error); }
});

export default router;
